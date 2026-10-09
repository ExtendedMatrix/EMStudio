//! Layout engine — constrained Sugiyama with semantic lane assignment.
//!
//! See docs/ARCHITECTURE.md §4. Pipeline implemented in v1:
//!   1. lane assignment (SEMANTIC): epoch lanes read from the graph
//!      (`has_first_epoch` edges; paradata inherits the lane of the unit it
//!      documents by walking the provenance chain); unassigned nodes fall
//!      into a trailing lane;
//!   2. intra-lane sub-layering by paradata role
//!      (unit 0 → property 1 → combiner 2 → extractor 3 → document 4);
//!   3. crossing minimisation: barycenter sweeps over the global layer
//!      sequence (deterministic, stable sorts);
//!   4. x-coordinate assignment: sequential packing with minimum distances,
//!      layers centred on a common axis.
//!
//! v2 (planned): group-contiguity constraints, sector columns, orthogonal
//! edge routing with ports, "from sketch" incremental mode, Brandes–Köpf
//! compaction. Determinism is a contract: same document → same layout,
//! across desktop, server and CLI (CI-diffable).

use crate::model::{Graph, Layout, Rect, Swimlane};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct LayoutOptions {
    // General (yEd-parity, docs/yed-parity.md)
    pub symmetric_placement: bool,
    pub use_sketch: bool, // v2: treat current positions as soft constraints
    pub node_to_node: f64,
    pub node_to_edge: f64,
    pub edge_to_edge: f64,
    pub layer_to_layer: f64,
    pub time_budget_ms: u64,
    // Edges (consumed by the v2 router)
    pub min_first_segment: f64,
    pub min_last_segment: f64,
    pub min_length: f64,
    pub min_edge_distance: f64,
    pub edge_grouping: bool,
    pub straighten: bool,
    // Groups
    pub respect_groups: bool,
    pub group_compaction_strong: bool,
    // Swimlanes
    pub lane_min_insets: f64,
    pub compact_lanes: bool,
    // Node geometry: the DEFAULT box, plus the per-type departures from it.
    pub default_node_w: f64,
    pub default_node_h: f64,
    /// Per-node-type box geometry from the vendored visual rules (EM1).
    ///
    /// Empty means "every leaf gets the default box", which is what the engine
    /// did before EM1 and what every test that does not care about types still
    /// exercises. Populated by `Default` from `geometry::type_boxes()`, so all
    /// three deliveries (CLI, WASM, desktop) compute the same boxes — the
    /// determinism contract does not survive a table each caller supplies.
    pub type_boxes: crate::geometry::TypeBoxes,
    // Crossing-minimisation sweeps (v5: down and up alternately, the best kept)
    pub barycenter_sweeps: u32,
    /// v5 · a row of leaves wider than this folds onto rows inserted below it;
    /// 0 = automatic, from the area of the lane (≈ 1.9 · √area, at least 1600)
    pub wrap_width: f64,
    /// v5 · network simplex weight of a group's height (1 = an edge's)
    pub group_weight: i64,
}

impl Default for LayoutOptions {
    fn default() -> Self {
        Self {
            symmetric_placement: true,
            use_sketch: false,
            node_to_node: 30.0,
            node_to_edge: 15.0,
            edge_to_edge: 15.0,
            layer_to_layer: 40.0,
            time_budget_ms: 30_000,
            min_first_segment: 10.0,
            min_last_segment: 15.0,
            min_length: 20.0,
            min_edge_distance: 15.0,
            edge_grouping: false,
            straighten: false,
            respect_groups: true,
            group_compaction_strong: true,
            lane_min_insets: 24.0,
            compact_lanes: true,
            default_node_w: 90.0,
            default_node_h: 32.0,
            type_boxes: crate::geometry::type_boxes(),
            barycenter_sweeps: 8,
            wrap_width: 0.0,
            group_weight: 1,
        }
    }
}

/// Edge types along which a paradata node inherits the lane of its "anchor".
/// Directions as canonically stored: unit --has_property--> property,
/// property --has_data_provenance--> extractor/combiner,
/// combiner --combines--> extractor, extractor --extracted_from--> document.
const CHAIN_EDGES: [&str; 4] = [
    "has_property",
    "has_data_provenance",
    "combines",
    "extracted_from",
];

/// Compute a layout for `graph`. Pure function: no I/O, deterministic.
pub fn compute(graph: &Graph, opts: &LayoutOptions) -> Layout {
    compute_with_sketch(graph, opts, None)
}

/// yEd "From Sketch" policy: when `sketch` (the previous layout) is given
/// and `opts.use_sketch` is on, the current arrangement is a soft
/// constraint — layer order and band order come from the sketched x
/// coordinates instead of the barycenter sweeps, so a manual arrangement
/// survives re-layout. The sketch's `folded_groups` COMPACT the layout:
/// members of folded groups release their band slots (they are parked at
/// the proxy position, invisible anyway), exactly like yEd's group
/// compaction on closed folders.
/// Re-assert every node's SIZE from its type, leaving positions alone (EM3).
///
/// The invariant this exists to defend: **the size of a node's box is geometry of
/// its TYPE, not state of the layout.** A position is user intent — it was dragged
/// there, and nothing may move it. A size never was: it is what the type is, and a
/// size persisted by an older build is simply out of date.
///
/// Without this, a document saved before the glyph boxes existed keeps rendering
/// its glyphs 90×32 until somebody presses Layout, because the frontend skips the
/// auto-layout when a document already carries positions. The alternative — a
/// from-sketch relayout at load — would also *move* things, which is exactly the
/// user intent we must not touch.
///
/// Lanes, canvas, sectors and edge routes are carried over untouched: this is not
/// a layout, it is a correction of four numbers per node.
pub fn reassert_sizes(graph: &Graph, sketch: &Layout, opts: &LayoutOptions) -> Layout {
    let mut out = sketch.clone();
    for node in &graph.nodes {
        let Some(rect) = out.positions.get_mut(&node.id) else { continue };
        // a GROUP box is sized by what it contains, not by its type — leave it to
        // the real layout, which is the only thing that knows its members
        let kind = node
            .data
            .get(crate::geometry::GLYPH_BY_DATA_KEY)
            .map(|v| v.as_str().unwrap_or_default().to_string());
        let (w, h) = crate::geometry::box_for_node(
            &opts.type_boxes,
            node.node_type.as_str(),
            kind.as_deref(),
            opts.default_node_w,
            opts.default_node_h,
        );
        // only the types that DECLARE a geometry are touched: for everything else
        // `box_for_node` returns the default box, and a stored width that differs
        // from it is legitimate (a container, a text-sized node, a hand-made file).
        if (w, h) != (opts.default_node_w, opts.default_node_h) {
            rect.w = w;
            rect.h = h;
        }
    }
    out
}

pub fn compute_with_sketch(
    graph: &Graph,
    opts: &LayoutOptions,
    sketch: Option<&Layout>,
) -> Layout {
    let node_ix: HashMap<&str, usize> = graph
        .nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id.as_str(), i))
        .collect();

    // ── 1a. epoch lanes, newest first ────────────────────────────────────
    // Epoch order: descending by numeric `start_time` in node.data when
    // available (EM convention: most recent epoch on top), otherwise stable
    // by declaration order.
    // In "from sketch" mode, preserve the sketched lane order (top→bottom by y)
    // so a manual Move up/down survives re-layout (invariant 8); epochs absent
    // from the sketch fall back to start_time. A FRESH layout (no sketch) always
    // orders by start_time.
    let sketch_lane_order: Option<HashMap<&str, usize>> = if opts.use_sketch {
        sketch.map(|s| {
            let mut ls: Vec<&Swimlane> = s.swimlanes.iter().collect();
            ls.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal));
            ls.iter()
                .enumerate()
                .map(|(i, l)| (l.epoch_id.as_str(), i))
                .collect()
        })
    } else {
        None
    };
    // (node index, start_time) in DECLARATION order. BUGFIX-EPOCH (2026-08-06):
    // an UNDATED epoch has NO `start_time` (the importer no longer fabricates a
    // date). Undated epochs must KEEP their declaration/manual order, not sink to
    // "oldest": the old `unwrap_or(f64::MIN)` shoved every undated epoch to the
    // bottom of the date sort. NOTE: a real, explicit -10000 (e.g. a "Geologic"
    // epoch) is a legitimate date and IS ordered as oldest — only a MISSING
    // start_time means undated (we cannot tell a legacy fabricated -10000 from a
    // real one, and real ones exist, so the sentinel is resolved by re-import).
    let epochs_decl: Vec<(usize, Option<f64>)> = graph
        .nodes
        .iter()
        .enumerate()
        .filter(|(_, n)| n.node_type == "epoch" || n.node_type == "EpochNode")
        .map(|(i, n)| {
            let start = n.data.get("start_time").and_then(|v| v.as_f64());
            (i, start)
        })
        .collect();
    // BASE order (no manual arrangement): dated epochs sort newest-first, but they
    // only reshuffle among the slots that ARE dated — undated epochs keep their
    // DECLARATION slot. So a dated+undated mix "coexists" instead of the undated
    // ones sinking. When every epoch is dated this is a plain date-desc sort.
    let base_order: Vec<usize> = {
        let mut dated: Vec<usize> = epochs_decl
            .iter()
            .filter(|(_, d)| d.is_some())
            .map(|(i, _)| *i)
            .collect();
        dated.sort_by(|&a, &b| {
            let da = epochs_decl.iter().find(|(i, _)| *i == a).and_then(|(_, d)| *d);
            let db = epochs_decl.iter().find(|(i, _)| *i == b).and_then(|(_, d)| *d);
            // newest first
            db.partial_cmp(&da).unwrap_or(std::cmp::Ordering::Equal)
        });
        let mut it = dated.into_iter();
        epochs_decl
            .iter()
            .map(|(i, d)| if d.is_some() { it.next().unwrap_or(*i) } else { *i })
            .collect()
    };
    let base_rank: HashMap<usize, usize> =
        base_order.iter().enumerate().map(|(r, ix)| (*ix, r)).collect();
    // FROM-SKETCH override: an epoch present in the sketched swimlane order (a
    // manual Move up/down) uses that order; every other epoch — and the whole
    // fresh-load case, where the sketch carries pins/anchors but NO swimlanes —
    // falls back to the BASE order above (so undated epochs keep their slot). A
    // "fresh" layout passes a sketch object for pins, so this fallback, not a
    // date sort, is what a fresh load actually uses.
    let ordered: Vec<usize> = {
        let mut e: Vec<usize> = epochs_decl.iter().map(|(i, _)| *i).collect();
        e.sort_by(|&a, &b| {
            let (sa, sb) = if let Some(map) = &sketch_lane_order {
                (
                    map.get(graph.nodes[a].id.as_str()).copied(),
                    map.get(graph.nodes[b].id.as_str()).copied(),
                )
            } else {
                (None, None)
            };
            match (sa, sb) {
                (Some(x), Some(y)) => x.cmp(&y),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => base_rank[&a].cmp(&base_rank[&b]),
            }
        });
        e
    };
    let lane_of_epoch: HashMap<usize, usize> = ordered
        .iter()
        .enumerate()
        .map(|(lane, ix)| (*ix, lane))
        .collect();
    let unassigned_lane = ordered.len(); // trailing lane

    // ── 1b. lane of each node ────────────────────────────────────────────
    // Direct: has_first_epoch edge → epoch's lane. Epoch nodes live in their
    // own lane. Everything else: inherit through the paradata chain (walk
    // reversed CHAIN_EDGES from anchored nodes), else unassigned.
    let n = graph.nodes.len();
    let mut lane: Vec<Option<usize>> = vec![None; n];
    for (i, node) in graph.nodes.iter().enumerate() {
        if let Some(l) = lane_of_epoch.get(&i) {
            lane[i] = Some(*l);
        } else if node.node_type == "epoch" || node.node_type == "EpochNode" {
            lane[i] = Some(unassigned_lane);
        }
    }
    for e in &graph.edges {
        if e.edge_type == "has_first_epoch" {
            if let (Some(&s), Some(&t)) = (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str())) {
                if let Some(l) = lane_of_epoch.get(&t) {
                    lane[s] = Some(*l);
                }
            }
        }
    }
    // Chain inheritance: propagate source lane to target along chain edges;
    // membership edges propagate in BOTH directions (a dangling paradata
    // node with only its is_in_* edge inherits the lane of its group, and a
    // group inherits from its members) — otherwise such nodes fall into the
    // trailing lane far away from their box (lenght_pipe bug, 12 July 2026).
    let membership_edge = |t: &str| {
        matches!(
            t,
            "is_in_activity"
                | "is_in_paradata_nodegroup"
                | "is_in_location"
                | "is_in_timebranch"
                | "is_part_of"
                | "has_paradata_nodegroup"
        )
    };
    for _ in 0..8 {
        let mut changed = false;
        for e in &graph.edges {
            let et = e.edge_type.as_str();
            let chain = CHAIN_EDGES.contains(&et);
            let member = membership_edge(et);
            if !chain && !member {
                continue;
            }
            if let (Some(&s), Some(&t)) =
                (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str()))
            {
                if lane[t].is_none() && lane[s].is_some() {
                    lane[t] = lane[s];
                    changed = true;
                }
                if member && lane[s].is_none() && lane[t].is_some() {
                    lane[s] = lane[t];
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    let lane: Vec<usize> = lane
        .into_iter()
        .map(|l| l.unwrap_or(unassigned_lane))
        .collect();

    // ── 2. shared structures for the recursive layout (v4) ───────────────
    // Arrows flow downwards (E.D., 12 July 2026): every directed edge is a
    // vertical constraint (source above target) INSIDE its container;
    // symmetric connectors stay side by side; membership edges are
    // containment, not sequence; epoch nodes are lane labels.
    let symmetric = |t: &str| {
        matches!(
            t,
            "has_same_time"
                | "is_physically_equal_to"
                | "equals"
                | "bonded_to"
                | "is_bonded_to"
                | "contrasts_with"
        )
    };
    let membership = |t: &str| {
        matches!(
            t,
            "is_in_activity"
                | "is_in_paradata_nodegroup"
                | "is_in_location"
                | "is_in_timebranch"
                | "is_part_of"
        )
    };
    let is_epoch: Vec<bool> = graph
        .nodes
        .iter()
        .map(|nd| nd.node_type == "epoch" || nd.node_type == "EpochNode")
        .collect();

    // global directed / symmetric relations (projected locally later)
    let mut down: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut sym_pairs: Vec<(usize, usize)> = Vec::new();
    for e in &graph.edges {
        let (Some(&s), Some(&t)) =
            (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str()))
        else {
            continue;
        };
        if s == t || is_epoch[s] || is_epoch[t] {
            continue;
        }
        let et = e.edge_type.as_str();
        if membership(et) {
            continue;
        }
        if symmetric(et) {
            sym_pairs.push((s, t));
        } else {
            down[s].push(t);
        }
    }

    // primary containment tree (most specific membership first)
    let direct_of: Vec<Option<usize>> = {
        let mut best: Vec<Option<(u8, usize)>> = vec![None; n];
        let prio = |et: &str| -> u8 {
            match et {
                "is_part_of" => 0,
                "is_in_paradata_nodegroup" => 1,
                "is_in_location" => 2,
                "is_in_timebranch" => 3,
                _ => 4, // is_in_activity
            }
        };
        for e in &graph.edges {
            let et = e.edge_type.as_str();
            if !membership(et) {
                continue;
            }
            if let (Some(&s), Some(&t)) =
                (node_ix.get(e.source.as_str()), node_ix.get(e.target.as_str()))
            {
                let cand = (prio(et), t);
                if best[s].is_none() || cand < best[s].unwrap() {
                    best[s] = Some(cand);
                }
            }
        }
        best.into_iter().map(|b| b.map(|(_, t)| t)).collect()
    };
    let mut children_of: Vec<Vec<usize>> = vec![Vec::new(); n];
    for i in 0..n {
        if let Some(p) = direct_of[i] {
            if p != i {
                children_of[p].push(i);
            }
        }
    }

    // fold state from the sketch: members of folded groups release their
    // slots and are parked at the proxy afterwards
    let folded_ix: std::collections::BTreeSet<usize> = sketch
        .map(|l| {
            l.folded_groups
                .iter()
                .filter_map(|id| node_ix.get(id.as_str()).copied())
                .collect()
        })
        .unwrap_or_default();
    let hidden: Vec<bool> = (0..n)
        .map(|i| {
            if folded_ix.is_empty() {
                return false;
            }
            let mut cur = i;
            for _ in 0..10 {
                match direct_of[cur] {
                    Some(g) if g != cur => {
                        if folded_ix.contains(&g) {
                            return true;
                        }
                        cur = g;
                    }
                    _ => break,
                }
            }
            false
        })
        .collect();

    // ── 3. RECURSIVE GROUP LAYOUT (yEd technique) ─────────────────────────
    // Every group is laid out as its own hierarchic sub-graph (local
    // topological layering + local crossing minimisation + median X
    // alignment), then becomes a rigid macro-block in its parent. Blocks
    // reserve their column for the layers they span, so nothing overlaps.
    let node_w = opts.default_node_w;
    let node_h = opts.default_node_h;
    let gap_x = opts.node_to_node;
    let sub_gap = opts.layer_to_layer * 0.45;
    let group_pad = 14.0f64;
    // the room a group's title bar takes above its first row: the Matrix draws
    // the outline 26 units above its highest member (views/matrix.ts), so the
    // engine keeps 28 — a nested group opening on the same row stacks another
    let group_header = 28.0f64;
    let closed_w = 150.0f64;
    let closed_h = 40.0f64;
    let sketching = opts.use_sketch && sketch.is_some();
    let sketch_x = |i: usize| -> f64 {
        sketch
            .and_then(|l| l.positions.get(&graph.nodes[i].id))
            .map(|r| r.x)
            .unwrap_or(f64::MAX)
    };

    // node index → the box it is drawn with as a LEAF (its type's geometry, or
    // the square glyph box when the node draws a glyph of its own: EM1/EM2)
    let leaf_box: Vec<(f64, f64)> = graph
        .nodes
        .iter()
        .map(|nd| {
            let kind = nd
                .data
                .get(crate::geometry::GLYPH_BY_DATA_KEY)
                .map(|v| v.as_str().unwrap_or_default().to_string());
            crate::geometry::box_for_node(
                &opts.type_boxes,
                nd.node_type.as_str(),
                kind.as_deref(),
                node_w,
                node_h,
            )
        })
        .collect();
    let outer: Vec<bool> = graph
        .nodes
        .iter()
        .map(|nd| crate::geometry::is_outer_ring(nd.node_type.as_str()))
        .collect();
    // ── 3. every lane as ONE compound layered graph (v5, `layered.rs`) ─────
    let lane_ctx = crate::layered::LaneCtx {
        down: &down,
        sym_pairs: &sym_pairs,
        children_of: &children_of,
        direct_of: &direct_of,
        hidden: &hidden,
        folded: &folded_ix,
        leaf_box: &leaf_box,
        gap_x,
        sub_gap,
        node_h,
        group_pad,
        group_header,
        closed_w,
        closed_h,
        sketching,
        sweeps: opts.barycenter_sweeps,
        wrap_w: opts.wrap_width,
        outer: &outer,
        group_weight: opts.group_weight,
    };

    // top-level members per lane: alive nodes whose primary parent is
    // absent (or lives in another lane — containment then wins for its
    // children, which follow the root's lane)
    let lane_count = unassigned_lane + 1;
    let mut top_of_lane: Vec<Vec<usize>> = vec![Vec::new(); lane_count];
    for i in 0..n {
        if is_epoch[i] || hidden[i] {
            continue;
        }
        let top = match direct_of[i] {
            None => true,
            Some(p) => hidden[p] || is_epoch[p],
        };
        if top {
            top_of_lane[lane[i]].push(i);
        }
    }

    let mut positions: std::collections::BTreeMap<String, Rect> =
        std::collections::BTreeMap::new();
    let mut lane_y = vec![0.0f64; lane_count];
    let mut lane_h = vec![0.0f64; lane_count];
    let mut lane_blocks: Vec<Option<crate::layered::Block>> = Vec::new();
    let mut cycle_edges: Vec<(usize, usize)> = Vec::new();
    let mut max_w = node_w;
    // v5 · lanes are centred on what the Matrix draws by default (a lane's
    // outer band, hidden there, would push every other lane off to the right)
    let mut max_main_w = node_w;
    for l in 0..lane_count {
        if top_of_lane[l].is_empty() {
            lane_blocks.push(None);
            continue;
        }
        let block = crate::layered::layout_lane(&lane_ctx, &top_of_lane[l], &sketch_x);
        cycle_edges.extend(block.cycle_edges.iter().copied());
        max_w = max_w.max(block.w);
        max_main_w = max_main_w.max(block.w_main);
        lane_blocks.push(Some(block));
    }
    let mut y_cursor = 0.0f64;
    for l in 0..lane_count {
        let h = match &lane_blocks[l] {
            Some(b) => b.h + opts.lane_min_insets * 2.0,
            None => opts.lane_min_insets * 2.0 + node_h,
        };
        lane_y[l] = y_cursor;
        lane_h[l] = h;
        y_cursor += h;
    }
    for l in 0..lane_count {
        let Some(block) = &lane_blocks[l] else { continue };
        let x0 = if opts.symmetric_placement {
            ((max_main_w - block.w_main) / 2.0).max(0.0)
        } else {
            0.0
        };
        let oy = lane_y[l] + opts.lane_min_insets;
        for &(m, dx, dy, dw, dh) in &block.places {
            positions.insert(
                graph.nodes[m].id.clone(),
                Rect {
                    x: x0 + dx,
                    y: oy + dy,
                    w: dw,
                    h: dh,
                },
            );
        }
    }
    let max_row_w = max_w;

    // park hidden members at their folded ancestor's position
    if !folded_ix.is_empty() {
        for i in 0..n {
            if !hidden[i] {
                continue;
            }
            let mut cur = i;
            let mut rep = None;
            for _ in 0..10 {
                match direct_of[cur] {
                    Some(g) if g != cur => {
                        if folded_ix.contains(&g) && !hidden[g] {
                            rep = Some(g);
                            break;
                        }
                        cur = g;
                    }
                    _ => break,
                }
            }
            if let Some(r) = rep {
                if let Some(rect) = positions.get(&graph.nodes[r].id).cloned() {
                    positions.insert(graph.nodes[i].id.clone(), rect);
                }
            }
        }
    }

    // Pinned nodes are immovable: after the flow has placed everything, snap
    // each pinned node back to its sketch Rect so a re-layout never shifts it.
    // (Empty unless the document pins nodes, so the layout contract is intact.)
    if let Some(s) = sketch {
        for id in &s.pinned {
            if let Some(r) = s.positions.get(id) {
                positions.insert(id.clone(), r.clone());
            }
        }
    }

    // Anchor (rule) pins: place a node at a CORNER of its container (an epoch
    // lane's content, resolved here) + offset. Evaluated after the flow so the
    // container's bounds exist. Reusable/portable (the rule, not a coordinate).
    if let Some(s) = sketch {
        if !s.anchors.is_empty() {
            let ix_of: std::collections::HashMap<&str, usize> = graph
                .nodes
                .iter()
                .enumerate()
                .map(|(i, n)| (n.id.as_str(), i))
                .collect();
            let anchored: std::collections::BTreeSet<&str> =
                s.anchors.iter().map(|a| a.node.as_str()).collect();
            for a in &s.anchors {
                let Some(&to_ix) = ix_of.get(a.to.as_str()) else { continue };
                let Some(&lane_idx) = lane_of_epoch.get(&to_ix) else { continue };
                // content bbox of the container's lane (skip epochs + anchored)
                let (mut minx, mut miny, mut maxx, mut maxy) =
                    (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
                for (i, n) in graph.nodes.iter().enumerate() {
                    if is_epoch[i] || anchored.contains(n.id.as_str()) {
                        continue;
                    }
                    if lane[i] != lane_idx {
                        continue;
                    }
                    if let Some(r) = positions.get(&n.id) {
                        minx = minx.min(r.x);
                        miny = miny.min(r.y);
                        maxx = maxx.max(r.x + r.w);
                        maxy = maxy.max(r.y + r.h);
                    }
                }
                if !minx.is_finite() {
                    continue; // empty container — nothing to anchor against
                }
                let (cx, cy) = match a.corner.as_str() {
                    "tl" => (minx, miny),
                    "tr" => (maxx, miny),
                    "br" => (maxx, maxy),
                    _ => (minx, maxy), // "bl" (default): bottom-left
                };
                if let Some(r) = positions.get_mut(&a.node) {
                    r.x = cx + a.dx;
                    r.y = cy + a.dy;
                }
            }
        }
    }

    let swimlanes: Vec<Swimlane> = ordered
        .iter()
        .enumerate()
        .map(|(order, ix)| Swimlane {
            epoch_id: graph.nodes[*ix].id.clone(),
            order: order as u32,
            y: lane_y[order],
            height: lane_h[order],
        })
        .collect();

    Layout {
        canvas: crate::model::Canvas {
            title: graph.name.clone(),
            width: max_row_w,
            height: y_cursor,
        },
        swimlanes,
        // Persist sectors and edge_routes across a re-layout: the engine
        // does not compute them yet (v2 router / sector columns), so
        // carrying whatever the sketch held is strictly better than
        // clobbering to empty — a manual/router arrangement or data set by
        // another tool survives the Layout action, like positions do.
        sectors: sketch.map(|s| s.sectors.clone()).unwrap_or_default(),
        positions,
        folded_groups: Vec::new(),
        group_spaces: std::collections::BTreeMap::new(),
        edge_routes: sketch.map(|s| s.edge_routes.clone()).unwrap_or_default(),
        pinned: sketch.map(|s| s.pinned.clone()).unwrap_or_default(),
        anchors: sketch.map(|s| s.anchors.clone()).unwrap_or_default(),
    }
}

/// Diagnostic (E.D., 12 July 2026): arrows must point DOWN — a node that is
/// chronologically earlier sits below. The layering enforces this within
/// lanes and the epoch order across lanes; residual upward edges indicate
/// data anomalies (e.g. an is_after towards a newer epoch) and are counted
/// here rather than force-bent, so they can be reviewed.
pub fn upward_edges(
    graph: &Graph,
    positions: &std::collections::BTreeMap<String, Rect>,
) -> Vec<String> {
    let symmetric = |t: &str| {
        matches!(
            t,
            "has_same_time"
                | "is_physically_equal_to"
                | "equals"
                | "bonded_to"
                | "is_bonded_to"
                | "contrasts_with"
        )
    };
    let membership = |t: &str| {
        matches!(
            t,
            "is_in_activity"
                | "is_in_paradata_nodegroup"
                | "is_in_location"
                | "is_in_timebranch"
                | "is_part_of"
        )
    };
    let epoch_edge = |t: &str| matches!(t, "has_first_epoch" | "survive_in_epoch");
    let mut out = Vec::new();
    for e in &graph.edges {
        let t = e.edge_type.as_str();
        if symmetric(t) || membership(t) || epoch_edge(t) {
            continue;
        }
        let (Some(s), Some(tg)) = (positions.get(&e.source), positions.get(&e.target)) else {
            continue;
        };
        if tg.y + 0.5 < s.y {
            out.push(format!("{} --{}--> {}", e.source, t, e.target));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Edge, Graph, Node};
    use std::collections::HashMap;

    fn node(id: &str, t: &str) -> Node {
        Node {
            id: id.into(),
            node_type: t.into(),
            name: None,
            description: None,
            data: std::collections::BTreeMap::new(),
        }
    }
    fn epoch(id: &str, start: f64) -> Node {
        let mut n = node(id, "epoch");
        n.data.insert("start_time".into(), serde_json::json!(start));
        n
    }
    fn edge(id: &str, t: &str, s: &str, tg: &str) -> Edge {
        Edge {
            id: id.into(),
            edge_type: t.into(),
            source: s.into(),
            target: tg.into(),
        }
    }

    fn fixture() -> Graph {
        Graph {
            graph_id: "g".into(),
            name: Some("test".into()),
            description: None,
            nodes: vec![
                epoch("EP_modern", 1900.0),
                epoch("EP_roman", -27.0),
                node("US1", "US"),
                node("US2", "US"),
                node("PR1", "property"),
                node("EX1", "extractor"),
                node("D1", "document"),
            ],
            edges: vec![
                edge("e1", "has_first_epoch", "US1", "EP_roman"),
                edge("e2", "has_first_epoch", "US2", "EP_modern"),
                edge("e3", "has_property", "US1", "PR1"),
                edge("e4", "has_data_provenance", "PR1", "EX1"),
                edge("e5", "extracted_from", "EX1", "D1"),
                edge("e6", "is_after", "US2", "US1"),
            ],
            data: std::collections::BTreeMap::new(),
        }
    }

    #[test]
    fn lanes_newest_first_and_units_assigned() {
        let g = fixture();
        let layout = compute(&g, &LayoutOptions::default());
        assert_eq!(layout.swimlanes.len(), 2);
        // newest (modern, start 1900) on top → order 0
        assert_eq!(layout.swimlanes[0].epoch_id, "EP_modern");
        assert_eq!(layout.swimlanes[1].epoch_id, "EP_roman");
        let us1 = &layout.positions["US1"];
        let us2 = &layout.positions["US2"];
        // US2 (modern) above US1 (roman)
        assert!(us2.y < us1.y);
    }

    // BUGFIX-EPOCH: an undated epoch (no start_time) keeps its DECLARATION slot;
    // the dated epochs only reshuffle among the slots that are dated (newest
    // first). Undated no longer sink to the bottom.
    #[test]
    fn undated_epochs_keep_declaration_order_dated_sort_newest_first() {
        let g = Graph {
            graph_id: "g".into(),
            name: Some("t".into()),
            description: None,
            nodes: vec![
                node("U_a", "epoch"),   // undated
                epoch("E_old", 100.0),
                node("U_b", "epoch"),   // undated
                epoch("E_new", 1900.0),
            ],
            edges: vec![],
            data: std::collections::BTreeMap::new(),
        };
        let l = compute(&g, &LayoutOptions::default());
        let order: Vec<&str> = l.swimlanes.iter().map(|s| s.epoch_id.as_str()).collect();
        // dated slots (1,3) take E_new then E_old; undated U_a/U_b keep 0 and 2.
        assert_eq!(order, vec!["U_a", "E_new", "U_b", "E_old"]);
    }

    // A real, explicit -10000 (e.g. a "Geologic" epoch) is a legitimate date and
    // is ordered as the oldest — NOT treated as undated (only a MISSING start_time
    // is undated). Aiano's "Geologic [start:-10000]" is the real case.
    #[test]
    fn explicit_minus_10000_is_a_real_oldest_date() {
        let g = Graph {
            graph_id: "g".into(),
            name: Some("t".into()),
            description: None,
            nodes: vec![epoch("Geologic", -10000.0), epoch("Modern", 1900.0)],
            edges: vec![],
            data: std::collections::BTreeMap::new(),
        };
        let l = compute(&g, &LayoutOptions::default());
        let order: Vec<&str> = l.swimlanes.iter().map(|s| s.epoch_id.as_str()).collect();
        // Modern (newest) on top, Geologic (oldest, -10000) at the bottom.
        assert_eq!(order, vec!["Modern", "Geologic"]);
    }

    #[test]
    fn paradata_inherits_lane_and_ranks_below_unit() {
        let g = fixture();
        let layout = compute(&g, &LayoutOptions::default());
        let us1 = &layout.positions["US1"];
        let pr = &layout.positions["PR1"];
        let ex = &layout.positions["EX1"];
        let d = &layout.positions["D1"];
        // same lane as US1 (roman), stacked in rank order below the unit
        assert!(pr.y > us1.y);
        assert!(ex.y > pr.y);
        assert!(d.y > ex.y);
        // and inside the roman lane
        let roman = &layout.swimlanes[1];
        for r in [pr, ex, d] {
            assert!(r.y >= roman.y && r.y <= roman.y + roman.height);
        }
    }

    #[test]
    fn directed_edges_point_down_within_lane() {
        // USM10 --is_after--> USM20 in the SAME epoch: USM10 above, USM20
        // below — never side by side (E.D., 12 July 2026). Contemporaneity
        // keeps nodes on the same level instead.
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![
                epoch("EP1", 100.0),
                node("USM10", "US"),
                node("USM20", "US"),
                node("USM30", "US"),
                node("USM40", "US"),
            ],
            edges: vec![
                edge("e1", "has_first_epoch", "USM10", "EP1"),
                edge("e2", "has_first_epoch", "USM20", "EP1"),
                edge("e3", "has_first_epoch", "USM30", "EP1"),
                edge("e4", "has_first_epoch", "USM40", "EP1"),
                edge("e5", "is_after", "USM10", "USM20"),
                edge("e6", "is_after", "USM20", "USM30"),
                edge("e7", "has_same_time", "USM40", "USM20"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let l = compute(&g, &LayoutOptions::default());
        let (u10, u20, u30, u40) = (
            &l.positions["USM10"],
            &l.positions["USM20"],
            &l.positions["USM30"],
            &l.positions["USM40"],
        );
        assert!(u10.y < u20.y, "USM10 must sit above USM20");
        assert!(u20.y < u30.y, "USM20 must sit above USM30");
        assert_eq!(u40.y, u20.y, "contemporaneous units sit side by side");
        assert!(u40.x != u20.x, "contemporaneous units must not overlap");
    }

    #[test]
    fn from_sketch_preserves_manual_order() {
        // two unrelated units in the same layer: a sketch with swapped x
        // must keep them swapped after re-layout
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![epoch("EP1", 100.0), node("A", "US"), node("B", "US")],
            edges: vec![
                edge("e1", "has_first_epoch", "A", "EP1"),
                edge("e2", "has_first_epoch", "B", "EP1"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let mut opts = LayoutOptions::default();
        let fresh = compute(&g, &opts);
        // fresh: A before B (id order); build a sketch with B left of A
        let mut sketch = fresh.clone();
        let (ax, bx) = (sketch.positions["A"].x, sketch.positions["B"].x);
        sketch.positions.get_mut("A").unwrap().x = bx.max(ax) + 100.0;
        sketch.positions.get_mut("B").unwrap().x = ax.min(bx);
        opts.use_sketch = true;
        let resketched = compute_with_sketch(&g, &opts, Some(&sketch));
        assert!(
            resketched.positions["B"].x < resketched.positions["A"].x,
            "from-sketch must preserve the manual left-right order"
        );
    }

    #[test]
    fn pinned_node_is_immovable_across_relayout() {
        // a pinned node keeps its EXACT sketch Rect, wherever the flow would
        // otherwise place it; the set persists on the output too.
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![epoch("EP1", 100.0), node("A", "US"), node("B", "US")],
            edges: vec![
                edge("e1", "has_first_epoch", "A", "EP1"),
                edge("e2", "has_first_epoch", "B", "EP1"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let mut opts = LayoutOptions::default();
        let mut sketch = compute(&g, &opts);
        // park B far away and pin it there
        sketch.positions.get_mut("B").unwrap().x = -777.0;
        sketch.positions.get_mut("B").unwrap().y = -555.0;
        sketch.pinned = vec!["B".into()];
        opts.use_sketch = true;
        let out = compute_with_sketch(&g, &opts, Some(&sketch));
        assert_eq!(out.positions["B"].x, -777.0, "pinned x is kept exactly");
        assert_eq!(out.positions["B"].y, -555.0, "pinned y is kept exactly");
        assert_eq!(out.pinned, vec!["B".to_string()], "pinned set persists");
    }

    #[test]
    fn anchor_places_node_at_container_corner() {
        // P is anchored to EP1's bottom-left: it lands at (min content x,
        // max content y) of the epoch's other content (A, B).
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![
                epoch("EP1", 100.0),
                node("A", "US"),
                node("B", "US"),
                node("P", "property"),
            ],
            edges: vec![
                edge("e1", "has_first_epoch", "A", "EP1"),
                edge("e2", "has_first_epoch", "B", "EP1"),
                edge("e3", "has_first_epoch", "P", "EP1"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let mut opts = LayoutOptions::default();
        let mut sketch = compute(&g, &opts);
        sketch.anchors = vec![crate::model::Anchor {
            node: "P".into(),
            to: "EP1".into(),
            corner: "bl".into(),
            dx: 0.0,
            dy: 0.0,
        }];
        opts.use_sketch = true;
        let out = compute_with_sketch(&g, &opts, Some(&sketch));
        let (a, b) = (&out.positions["A"], &out.positions["B"]);
        let minx = a.x.min(b.x);
        let maxy = (a.y + a.h).max(b.y + b.h);
        assert_eq!(out.positions["P"].x, minx, "anchored to content left edge");
        assert_eq!(out.positions["P"].y, maxy, "anchored to content bottom edge");
        assert_eq!(out.anchors.len(), 1, "anchors persist across re-layout");
    }

    #[test]
    fn folded_groups_compact_the_layout() {
        // an activity with three members: folding it must shrink the canvas
        // and park the hidden members at the proxy position
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![
                epoch("EP1", 100.0),
                node("ACT", "ActivityNodeGroup"),
                node("U1", "US"),
                node("U2", "US"),
                node("U3", "US"),
                node("LOOSE", "US"),
            ],
            edges: vec![
                edge("e1", "has_first_epoch", "U1", "EP1"),
                edge("e2", "has_first_epoch", "U2", "EP1"),
                edge("e3", "has_first_epoch", "U3", "EP1"),
                edge("e4", "has_first_epoch", "LOOSE", "EP1"),
                edge("e5", "has_first_epoch", "ACT", "EP1"),
                edge("m1", "is_in_activity", "U1", "ACT"),
                edge("m2", "is_in_activity", "U2", "ACT"),
                edge("m3", "is_in_activity", "U3", "ACT"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let opts = LayoutOptions::default();
        let fresh = compute(&g, &opts);
        let mut sketch = fresh.clone();
        sketch.folded_groups = vec!["ACT".into()];
        let folded = compute_with_sketch(&g, &opts, Some(&sketch));
        assert!(
            folded.canvas.width < fresh.canvas.width,
            "folding must shrink the canvas ({} < {})",
            folded.canvas.width,
            fresh.canvas.width
        );
        // hidden members parked at the proxy
        let act = &folded.positions["ACT"];
        for m in ["U1", "U2", "U3"] {
            assert_eq!(folded.positions[m].x, act.x);
            assert_eq!(folded.positions[m].y, act.y);
        }
        // untouched node still placed normally
        assert!(folded.positions["LOOSE"].x != act.x || folded.positions["LOOSE"].y != act.y);
    }

    #[test]
    fn no_overlap_within_layer_and_deterministic() {
        let g = fixture();
        let opts = LayoutOptions::default();
        let a = compute(&g, &opts);
        let b = compute(&g, &opts);
        assert_eq!(
            serde_json::to_string(&a).unwrap(),
            serde_json::to_string(&b).unwrap(),
            "layout must be deterministic"
        );
        // nodes sharing (y) must not overlap in x
        let mut by_y: HashMap<i64, Vec<&Rect>> = HashMap::new();
        for r in a.positions.values() {
            by_y.entry(r.y as i64).or_default().push(r);
        }
        for row in by_y.values() {
            for (i, r1) in row.iter().enumerate() {
                for r2 in row.iter().skip(i + 1) {
                    assert!(
                        r1.x + r1.w <= r2.x || r2.x + r2.w <= r1.x,
                        "overlap in layer"
                    );
                }
            }
        }
    }

    /// G1 (MICRO grafo reattivo) · the v4 failure, measured on Templu Mare v2: a
    /// unit X OUTSIDE an activity sits between two of its members (M2 → X → M1).
    /// v4 laid the activity out as one rigid block, saw the cycle ACT ⇄ X at the
    /// lane's level and drew one of the two edges upwards. v5 ranks the lane as
    /// one graph: every edge points down, the activity's box spans the rows of
    /// its members and X sits beside it.
    #[test]
    fn a_unit_between_two_members_of_a_group_keeps_every_arrow_down() {
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![
                epoch("EP1", 100.0),
                node("ACT", "ActivityNodeGroup"),
                node("M1", "US"),
                node("M2", "US"),
                node("X", "US"),
                node("Y", "US"),
            ],
            edges: vec![
                edge("e1", "has_first_epoch", "M1", "EP1"),
                edge("e2", "has_first_epoch", "M2", "EP1"),
                edge("e3", "has_first_epoch", "X", "EP1"),
                edge("e4", "has_first_epoch", "Y", "EP1"),
                edge("m1", "is_in_activity", "M1", "ACT"),
                edge("m2", "is_in_activity", "M2", "ACT"),
                edge("a1", "is_after", "M2", "X"),
                edge("a2", "is_after", "X", "M1"),
                edge("a3", "is_after", "Y", "ACT"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let l = compute(&g, &LayoutOptions::default());
        assert!(upward_edges(&g, &l.positions).is_empty(), "{:?}", upward_edges(&g, &l.positions));
        let (m1, m2, x, act, y) = (&l.positions["M1"], &l.positions["M2"], &l.positions["X"], &l.positions["ACT"], &l.positions["Y"]);
        assert!(m2.y < x.y && x.y < m1.y, "X between the two members");
        // the box holds both members, and X is not inside it
        assert!(act.y < m2.y && act.y + act.h >= m1.y + m1.h && act.x <= m1.x.min(m2.x));
        assert!(x.x + x.w <= act.x || x.x >= act.x + act.w, "X beside the activity, not in it");
        // an edge INTO a group goes to its box: its source is above the box
        assert!(y.y + y.h < act.y);
    }

    /// G1 · a cycle cannot be drawn downwards: exactly one edge of it is
    /// dropped (and points up), deterministically, and the rest point down.
    #[test]
    fn a_cycle_leaves_one_edge_up_and_the_others_down() {
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![epoch("EP1", 100.0), node("A", "US"), node("B", "US"), node("C", "US")],
            edges: vec![
                edge("e1", "has_first_epoch", "A", "EP1"),
                edge("e2", "has_first_epoch", "B", "EP1"),
                edge("e3", "has_first_epoch", "C", "EP1"),
                edge("a1", "is_after", "A", "B"),
                edge("a2", "is_after", "B", "C"),
                edge("a3", "is_after", "C", "A"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let l = compute(&g, &LayoutOptions::default());
        assert_eq!(upward_edges(&g, &l.positions).len(), 1);
        let again = compute(&g, &LayoutOptions::default());
        assert_eq!(serde_json::to_string(&l).unwrap(), serde_json::to_string(&again).unwrap());
    }

    /// G1 · «same time» and «after» between the same two units: the order wins
    /// (a contemporaneity has no direction to point up), no edge goes up.
    #[test]
    fn an_order_wins_over_a_contradicting_contemporaneity() {
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![epoch("EP1", 100.0), node("A", "US"), node("B", "US"), node("C", "US")],
            edges: vec![
                edge("e1", "has_first_epoch", "A", "EP1"),
                edge("e2", "has_first_epoch", "B", "EP1"),
                edge("e3", "has_first_epoch", "C", "EP1"),
                edge("a1", "is_after", "A", "B"),
                edge("a2", "is_after", "B", "C"),
                edge("s1", "has_same_time", "A", "C"),
            ],
            data: std::collections::BTreeMap::new(),
        };
        let l = compute(&g, &LayoutOptions::default());
        assert!(upward_edges(&g, &l.positions).is_empty());
        assert!(l.positions["A"].y < l.positions["B"].y && l.positions["B"].y < l.positions["C"].y);
    }

    #[test]
    fn sectors_and_edge_routes_persist_across_relayout() {
        // The engine does not compute sectors / edge_routes yet, so a
        // re-layout must CARRY them from the sketch instead of clobbering
        // to empty — a manual/router arrangement or externally-set data
        // survives the Layout action, like positions do.
        use crate::model::Sector;
        let g = Graph {
            graph_id: "g".into(),
            name: None,
            description: None,
            nodes: vec![epoch("EP1", 100.0), node("A", "US")],
            edges: vec![edge("e1", "has_first_epoch", "A", "EP1")],
            data: std::collections::BTreeMap::new(),
        };
        let opts = LayoutOptions::default();
        let mut sketch = compute(&g, &opts);
        sketch.sectors = vec![Sector {
            id: "S1".into(),
            order: 0,
            x: 10.0,
            width: 50.0,
        }];
        sketch
            .edge_routes
            .insert("e1".into(), vec![(0.0, 0.0), (5.0, 5.0)]);

        let out = compute_with_sketch(&g, &opts, Some(&sketch));
        assert_eq!(out.sectors.len(), 1, "sectors must survive re-layout");
        assert_eq!(out.sectors[0].id, "S1");
        assert_eq!(
            out.edge_routes.get("e1").map(Vec::len),
            Some(2),
            "edge_routes must survive re-layout"
        );

        // A fresh layout (no sketch) has neither — the engine does not
        // synthesise them.
        let fresh = compute(&g, &opts);
        assert!(fresh.sectors.is_empty() && fresh.edge_routes.is_empty());
    }
}
