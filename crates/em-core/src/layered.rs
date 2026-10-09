//! Layout engine v5 — every lane is ONE compound layered graph (MICRO «grafo
//! reattivo», G1, 9 Oct 2026).
//!
//! The requirement, E.D.'s and hard: in the Matrix every stratigraphic edge has
//! `y(target) > y(source)` — no edge drawn upwards, no red connector — unless the
//! data itself contradicts it (a cycle, or an edge towards a newer epoch).
//!
//! Why v4 could not keep it. v4 laid every group out as a rigid block with its
//! OWN local layering, then placed the block in its parent. A unit X outside an
//! activity A, with `A.m2 → X → A.m1`, turned into the two-node cycle `A ⇄ X` at
//! the parent's level; the layering dropped one of the two edges and drew it
//! upwards (Templu Mare v2: three `is_after`, measured). A rigid block has one
//! height, and X has to sit between two of its rows.
//!
//! v5 ranks the whole lane at once, LEAVES included:
//!
//!  1. **constraints** — a leaf has a rank `r`, an open group a top `T` and a
//!     bottom `B`; containment says `T(g) ≤ top(child)` and `bottom(child) ≤
//!     B(g)`; an edge `s → t` says `top(t) ≥ bottom(s) + 1`, which for a group
//!     endpoint is its top (as a target) or its bottom (as a source) — the
//!     successors of a group go below the whole group, as in v4;
//!  2. **contemporaneity** (`has_same_time` and the other symmetric relations)
//!     merges the two leaves into one rank variable: same level, no order;
//!  3. **cycles** are broken by dropping an EDGE constraint (never a containment
//!     one), deterministically, and the dropped edges are returned so the
//!     caller can report them — they are the only edges allowed to point up;
//!  4. **ranks**: longest path, then network simplex (Gansner et al. 1993) to
//!     shorten the edges — and, with weight 1 on `B − T`, to keep groups short;
//!  5. **order**: dummy nodes on the long edges, then barycenter sweeps (8 by
//!     default, down and up, the best by crossing count kept) that keep every
//!     group CONTIGUOUS and its order among its siblings the same in every rank
//!     it spans — a group is a column, so two groups cannot swap between rows;
//!  6. **x**: per container, bottom-up, a group is a rigid COLUMN of its
//!     contents' width (its walls); the items of a container are compacted to
//!     the left on their separation constraints, then relaxed toward the median
//!     of their neighbours within those constraints (a priority layout: the
//!     group walls are what Brandes–Köpf cannot express);
//!  7. **y**: one table per lane, `Y[r]`, with room for the headers of the groups
//!     that open at row r and the bottom pads of those that close at r − 1. A
//!     leaf sits at `Y[r]`, a group's box from above `Y[T]` to below row `B`, so
//!     a higher rank is always lower on screen, group boxes included.
//!
//! Over-wide rows (more than `wrap_w` of leaves side by side, the 99 Representation
//! Models of a project hanging from their epoch) are folded onto extra ranks
//! inserted below them: ranks are global to the lane, so an inserted rank moves
//! everything below it down and no edge changes direction.
//!
//! Deterministic: every loop runs in index order, no hash-map iteration decides
//! anything, ties are broken by node order.

use std::collections::{BTreeMap, BTreeSet, HashMap};

/// A laid-out lane: absolute-in-block rects of every placed node.
pub(crate) struct Block {
    pub w: f64,
    /// the width of the lane WITHOUT its outer band: what the Matrix draws by
    /// default, and what the lanes are centred on
    pub w_main: f64,
    pub h: f64,
    /// (node index, x, y, w, h)
    pub places: Vec<(usize, f64, f64, f64, f64)>,
    /// node pairs (source, target) of the edges dropped to break a cycle
    pub cycle_edges: Vec<(usize, usize)>,
}

/// What the engine knows of the graph, by node index.
pub(crate) struct LaneCtx<'a> {
    pub down: &'a [Vec<usize>],
    pub sym_pairs: &'a [(usize, usize)],
    pub children_of: &'a [Vec<usize>],
    pub direct_of: &'a [Option<usize>],
    pub hidden: &'a [bool],
    pub folded: &'a BTreeSet<usize>,
    /// the box of a node drawn as a leaf (its type's geometry)
    pub leaf_box: &'a [(f64, f64)],
    pub gap_x: f64,
    pub sub_gap: f64,
    pub node_h: f64,
    pub group_pad: f64,
    pub group_header: f64,
    pub closed_w: f64,
    pub closed_h: f64,
    pub sketching: bool,
    pub sweeps: u32,
    /// rows of leaves wider than this are folded onto extra ranks
    pub wrap_w: f64,
    /// node index → is it in the Matrix's outer ring (`geometry::is_outer_ring`)
    pub outer: &'a [bool],
    /// the network simplex's price of one rank of a group's height, against 1
    /// for one rank of an edge: higher, shorter groups (they stack instead of
    /// standing side by side), longer edges
    pub group_weight: i64,
}

const ROOT: usize = usize::MAX;
/// fold only the leaves without successors (false: any leaf — everything below
/// the folded row moves down with it, so no edge changes direction either way).
/// Measured on Templu Mare v2: any leaf 9.3k wide, sinks only 9.7k.
const SINKS_ONLY: bool = false;
/// the top-level groups of a lane go to its right, the loose units to its left.
/// A group is a column through every row it spans: interleaved with the units
/// the lane is as wide as the SUM of each column's widest row (10.7k on Templu
/// Mare v2), set aside it is the widest row of units plus the groups (9.3k).
const GROUPS_ASIDE: bool = true;

#[derive(Clone)]
struct Item {
    node: usize,
    parent: usize, // item index or ROOT
    depth: usize,
    /// None = leaf; Some = open group (children item indices)
    kids: Option<Vec<usize>>,
    w: f64,
    h: f64,
}

#[derive(Clone, Copy)]
struct Arc {
    from: usize,
    to: usize,
    minlen: i64,
    weight: i64,
    /// the edge between two ITEMS this arc stands for (None: containment)
    edge: Option<(usize, usize)>,
}

/// A lane: the stratigraphy and its paradata first, and below them, as a band of
/// its own, the OUTER ring the Matrix hides by default (Representation Models,
/// resources and their DTC chains, links). Laid out together they made the lane
/// as wide as 98 parallel resource chains (Templu Mare v2: 22.8k px, measured)
/// for nodes the Matrix does not even draw; apart, the stratigraphy keeps its
/// width and the band, when the ring is shown, sits under it with every edge from
/// the units to it pointing down. Its order starts from the x of the units it
/// hangs from, so a model sits under its unit.
pub(crate) fn layout_lane(ctx: &LaneCtx, tops: &[usize], sketch_x: &dyn Fn(usize) -> f64) -> Block {
    let (main, outer): (Vec<usize>, Vec<usize>) = tops.iter().partition(|&&t| !ctx.outer[t]);
    if main.is_empty() {
        let mut b = layout_part(ctx, tops, sketch_x, None);
        b.w_main = 0.0;
        return b;
    }
    if outer.is_empty() {
        return layout_part(ctx, tops, sketch_x, None);
    }
    let a = layout_part(ctx, &main, sketch_x, None);
    // the outer nodes' first order: the mean x of the main nodes they touch
    let main_x: HashMap<usize, f64> = a.places.iter().map(|&(m, x, _, w, _)| (m, x + w / 2.0)).collect();
    let mut hint: HashMap<usize, f64> = HashMap::new();
    let mut acc: BTreeMap<usize, (f64, usize)> = BTreeMap::new();
    for (s, outs) in ctx.down.iter().enumerate() {
        for &t in outs {
            let (o, m) = if main_x.contains_key(&s) && !main_x.contains_key(&t) {
                (t, s)
            } else if main_x.contains_key(&t) && !main_x.contains_key(&s) {
                (s, t)
            } else {
                continue;
            };
            let e = acc.entry(o).or_insert((0.0, 0));
            e.0 += main_x[&m];
            e.1 += 1;
        }
    }
    for (o, (sum, n)) in acc {
        hint.insert(o, sum / n as f64);
    }
    let b = layout_part(ctx, &outer, sketch_x, Some(&hint));
    let gap = ctx.sub_gap * 2.0 + ctx.group_header;
    let dy = a.h + gap;
    let mut places = a.places;
    places.extend(b.places.into_iter().map(|(m, x, y, w, h)| (m, x, y + dy, w, h)));
    let mut cycle_edges = a.cycle_edges;
    cycle_edges.extend(b.cycle_edges);
    Block { w: a.w.max(b.w), w_main: a.w, h: dy + b.h, places, cycle_edges }
}

/// The connected components of a part (edges and contemporaneity, projected
/// to the top-level nodes), each laid out alone and packed on shelves: a
/// component is placed to the right of the previous one until the shelf reaches
/// the lane's target width, then a new shelf starts below. Unrelated pieces of a
/// lane — a lone unit, a separate sequence — no longer share rows with the main
/// one and stretch it sideways. No edge joins two components, so none can point
/// up across shelves.
fn layout_part(
    ctx: &LaneCtx,
    tops: &[usize],
    sketch_x: &dyn Fn(usize) -> f64,
    hint: Option<&HashMap<usize, f64>>,
) -> Block {
    let comps = components(ctx, tops);
    if comps.len() <= 1 {
        return layout_component(ctx, tops, sketch_x, hint);
    }
    let key_of = |c: &Vec<usize>| -> f64 {
        c.iter()
            .map(|&t| {
                if ctx.sketching {
                    sketch_x(t)
                } else if let Some(h) = hint {
                    h.get(&t).copied().unwrap_or(1e12 + t as f64)
                } else {
                    t as f64
                }
            })
            .fold(f64::INFINITY, f64::min)
    };
    let mut keyed: Vec<(f64, usize, Block)> = comps
        .iter()
        .enumerate()
        .map(|(k, c)| (key_of(c), k, layout_component(ctx, c, sketch_x, hint)))
        .collect();
    keyed.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal).then(a.1.cmp(&b.1)));
    let area: f64 = keyed.iter().map(|(_, _, b)| b.w * b.h).sum();
    let widest = keyed.iter().map(|(_, _, b)| b.w).fold(0.0, f64::max);
    let target = if ctx.wrap_w > 0.0 { ctx.wrap_w } else { (area.sqrt() * 1.9).max(1600.0) }.max(widest);
    let gap = ctx.gap_x * 2.0;
    let shelf_gap = ctx.sub_gap * 2.0 + ctx.group_header;
    let (mut x, mut y, mut shelf_h, mut w) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
    let mut places = Vec::new();
    let mut cycle_edges = Vec::new();
    for (_, _, b) in keyed {
        if x > 0.0 && x + b.w > target {
            y += shelf_h + shelf_gap;
            x = 0.0;
            shelf_h = 0.0;
        }
        places.extend(b.places.into_iter().map(|(m, px, py, pw, ph)| (m, px + x, py + y, pw, ph)));
        cycle_edges.extend(b.cycle_edges);
        w = w.max(x + b.w);
        shelf_h = shelf_h.max(b.h);
        x += b.w + gap;
    }
    Block { w, w_main: w, h: y + shelf_h, places, cycle_edges }
}

/// The top-level nodes of a part grouped by connection (deterministic: each
/// component in the order of its first node, its nodes in the given order).
fn components(ctx: &LaneCtx, tops: &[usize]) -> Vec<Vec<usize>> {
    let top_set: HashMap<usize, usize> = tops.iter().enumerate().map(|(k, &t)| (t, k)).collect();
    let top_of = |mut x: usize| -> Option<usize> {
        for _ in 0..24 {
            if let Some(&k) = top_set.get(&x) {
                return Some(k);
            }
            match ctx.direct_of[x] {
                Some(p) if p != x => x = p,
                _ => return None,
            }
        }
        None
    };
    let mut uf: Vec<usize> = (0..tops.len()).collect();
    fn find(uf: &mut Vec<usize>, x: usize) -> usize {
        let mut r = x;
        while uf[r] != r {
            r = uf[r];
        }
        uf[x] = r;
        r
    }
    let join = |a: usize, b: usize, uf: &mut Vec<usize>| {
        let (ra, rb) = (find(uf, a), find(uf, b));
        if ra != rb {
            let (lo, hi) = if ra < rb { (ra, rb) } else { (rb, ra) };
            uf[hi] = lo;
        }
    };
    for (s, outs) in ctx.down.iter().enumerate() {
        let Some(a) = top_of(s) else { continue };
        for &t in outs {
            if let Some(b) = top_of(t) {
                join(a, b, &mut uf);
            }
        }
    }
    for &(s, t) in ctx.sym_pairs {
        if let (Some(a), Some(b)) = (top_of(s), top_of(t)) {
            join(a, b, &mut uf);
        }
    }
    let mut groups: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for k in 0..tops.len() {
        let r = find(&mut uf, k);
        groups.entry(r).or_default().push(tops[k]);
    }
    groups.into_values().collect()
}

fn layout_component(
    ctx: &LaneCtx,
    tops: &[usize],
    sketch_x: &dyn Fn(usize) -> f64,
    hint: Option<&HashMap<usize, f64>>,
) -> Block {
    // ── 1 · the containment tree of the lane ──────────────────────────────
    let mut items: Vec<Item> = Vec::new();
    let mut item_of: HashMap<usize, usize> = HashMap::new();
    fn build(
        ctx: &LaneCtx,
        m: usize,
        parent: usize,
        depth: usize,
        items: &mut Vec<Item>,
        item_of: &mut HashMap<usize, usize>,
    ) -> Option<usize> {
        if item_of.contains_key(&m) || depth > 24 {
            return None; // a node already placed (a containment cycle): once only
        }
        let ix = items.len();
        item_of.insert(m, ix);
        let kids: Vec<usize> = ctx.children_of[m]
            .iter()
            .copied()
            .filter(|&c| c != m && !ctx.hidden[c])
            .collect();
        if ctx.folded.contains(&m) {
            items.push(Item { node: m, parent, depth, kids: None, w: ctx.closed_w, h: ctx.closed_h });
            return Some(ix);
        }
        let (w, h) = ctx.leaf_box[m];
        items.push(Item { node: m, parent, depth, kids: None, w, h });
        if !kids.is_empty() {
            let mut built = Vec::new();
            for c in kids {
                if let Some(ci) = build(ctx, c, ix, depth + 1, items, item_of) {
                    built.push(ci);
                }
            }
            if !built.is_empty() {
                items[ix].kids = Some(built);
            }
        }
        Some(ix)
    }
    let mut roots: Vec<usize> = Vec::new();
    for &t in tops {
        if let Some(i) = build(ctx, t, ROOT, 0, &mut items, &mut item_of) {
            roots.push(i);
        }
    }
    let n_items = items.len();
    if n_items == 0 {
        return Block { w: 0.0, w_main: 0.0, h: 0.0, places: Vec::new(), cycle_edges: Vec::new() };
    }
    let is_group = |i: usize| items[i].kids.is_some();
    // a node of the graph → the item that draws it here (a hidden member → its
    // folded ancestor); None when it belongs to another lane
    let proj = |mut x: usize| -> Option<usize> {
        for _ in 0..24 {
            if let Some(&i) = item_of.get(&x) {
                return Some(i);
            }
            if !ctx.hidden[x] {
                return None;
            }
            match ctx.direct_of[x] {
                Some(p) if p != x => x = p,
                _ => return None,
            }
        }
        None
    };
    let is_ancestor = |a: usize, mut b: usize| -> bool {
        // is item a an ancestor of item b?
        while b != ROOT {
            b = items[b].parent;
            if b == a {
                return true;
            }
        }
        false
    };

    // ── 2 · rank variables and constraints ─────────────────────────────────
    // leaf: one var; group: top var, bottom var
    let mut top_var = vec![0usize; n_items];
    let mut bot_var = vec![0usize; n_items];
    let mut nv = 0usize;
    for i in 0..n_items {
        top_var[i] = nv;
        nv += 1;
        if is_group(i) {
            bot_var[i] = nv;
            nv += 1;
        } else {
            bot_var[i] = top_var[i];
        }
    }
    // contemporaneity: union-find over leaf vars
    let mut uf: Vec<usize> = (0..nv).collect();
    fn find(uf: &mut Vec<usize>, x: usize) -> usize {
        let mut r = x;
        while uf[r] != r {
            r = uf[r];
        }
        let mut c = x;
        while uf[c] != r {
            let nx = uf[c];
            uf[c] = r;
            c = nx;
        }
        r
    }
    // the order the edges and the containment impose, before any merge: a
    // contemporaneity whose two units are ALSO ordered by a chain of edges is a
    // contradiction of the data — the order wins (a symmetric edge has no
    // direction to break), the pair keeps two levels and is reported
    let mut order_adj: Vec<Vec<usize>> = vec![Vec::new(); nv];
    for i in 0..n_items {
        if let Some(kids) = &items[i].kids {
            for &c in kids {
                order_adj[top_var[i]].push(top_var[c]);
                order_adj[bot_var[c]].push(bot_var[i]);
            }
            order_adj[top_var[i]].push(bot_var[i]);
        }
    }
    for s in 0..ctx.down.len() {
        let Some(ps) = proj(s) else { continue };
        for &t in &ctx.down[s] {
            let Some(pt) = proj(t) else { continue };
            if ps != pt && !is_ancestor(ps, pt) && !is_ancestor(pt, ps) {
                order_adj[bot_var[ps]].push(top_var[pt]);
            }
        }
    }
    // reachability between two CLASSES of merged variables (a merge made
    // earlier counts: two contemporaneities can close a cycle together)
    let mut members: Vec<Vec<usize>> = (0..nv).map(|v| vec![v]).collect();
    let reaches = |uf: &mut Vec<usize>, members: &Vec<Vec<usize>>, from: usize, to: usize| -> bool {
        let (from, to) = (find(uf, from), find(uf, to));
        let mut seen = vec![false; nv];
        let mut stack = vec![from];
        seen[from] = true;
        while let Some(c) = stack.pop() {
            if c == to {
                return true;
            }
            for &u in &members[c] {
                for &v in &order_adj[u] {
                    let cv = find(uf, v);
                    if !seen[cv] {
                        seen[cv] = true;
                        stack.push(cv);
                    }
                }
            }
        }
        false
    };
    let mut cycle_edges: Vec<(usize, usize)> = Vec::new();
    for &(a, b) in ctx.sym_pairs {
        if let (Some(pa), Some(pb)) = (proj(a), proj(b)) {
            if pa != pb && !is_group(pa) && !is_group(pb) {
                if reaches(&mut uf, &members, top_var[pa], top_var[pb])
                    || reaches(&mut uf, &members, top_var[pb], top_var[pa])
                {
                    cycle_edges.push((a, b));
                    continue;
                }
                let (ra, rb) = (find(&mut uf, top_var[pa]), find(&mut uf, top_var[pb]));
                if ra != rb {
                    let (lo, hi) = if ra < rb { (ra, rb) } else { (rb, ra) };
                    uf[hi] = lo;
                    let moved = std::mem::take(&mut members[hi]);
                    members[lo].extend(moved);
                }
            }
        }
    }
    let var_of: Vec<usize> = (0..nv).map(|v| find(&mut uf, v)).collect();
    let mut arcs: Vec<Arc> = Vec::new();
    let mut arc_at: HashMap<(usize, usize), usize> = HashMap::new();
    let mut add_arc = |arcs: &mut Vec<Arc>, from: usize, to: usize, minlen: i64, weight: i64, edge: Option<(usize, usize)>| {
        let (f, t) = (var_of[from], var_of[to]);
        if f == t {
            return; // merged by contemporaneity (an edge there is a contradiction, below)
        }
        if let Some(&k) = arc_at.get(&(f, t)) {
            let a = &mut arcs[k];
            a.minlen = a.minlen.max(minlen);
            a.weight += weight;
            if a.edge.is_none() {
                a.edge = edge;
            }
            return;
        }
        arc_at.insert((f, t), arcs.len());
        arcs.push(Arc { from: f, to: t, minlen, weight, edge });
    };
    for i in 0..n_items {
        if let Some(kids) = &items[i].kids {
            for &c in kids {
                add_arc(&mut arcs, top_var[i], top_var[c], 0, 0, None);
                add_arc(&mut arcs, bot_var[c], bot_var[i], 0, 0, None);
            }
            add_arc(&mut arcs, top_var[i], bot_var[i], 0, ctx.group_weight, None);
        }
    }
    // item-level edges, for the ordering and the x relaxation
    let mut item_edges: Vec<(usize, usize)> = Vec::new();
    let mut seen_edge: BTreeSet<(usize, usize)> = BTreeSet::new();
    for s in 0..ctx.down.len() {
        let Some(ps) = proj(s) else { continue };
        for &t in &ctx.down[s] {
            let Some(pt) = proj(t) else { continue };
            if ps == pt || is_ancestor(ps, pt) || is_ancestor(pt, ps) {
                continue;
            }
            if var_of[bot_var[ps]] == var_of[top_var[pt]] {
                // a directed edge between two contemporaneous units: the data
                // says both «same time» and «after» — report it, keep the level
                cycle_edges.push((items[ps].node, items[pt].node));
                continue;
            }
            if seen_edge.insert((ps, pt)) {
                item_edges.push((ps, pt));
            }
            add_arc(&mut arcs, bot_var[ps], top_var[pt], 1, 1, Some((ps, pt)));
        }
    }

    // ── 3 · cycles: drop an edge constraint, report it ────────────────────
    let mut removed = vec![false; arcs.len()];
    loop {
        let mut out: Vec<Vec<usize>> = vec![Vec::new(); nv];
        for (k, a) in arcs.iter().enumerate() {
            if !removed[k] {
                out[a.from].push(k);
            }
        }
        // iterative DFS; on a back arc, drop it (an edge) or the nearest edge
        // arc on the path that closes the cycle (containment never drops)
        let mut color = vec![0u8; nv];
        let mut via: Vec<Option<usize>> = vec![None; nv]; // arc that entered v
        let mut found: Option<usize> = None;
        'outer: for root in 0..nv {
            if color[root] != 0 || var_of[root] != root {
                continue;
            }
            let mut stack: Vec<(usize, usize)> = vec![(root, 0)];
            color[root] = 1;
            while let Some(&mut (u, ref mut k)) = stack.last_mut() {
                if *k < out[u].len() {
                    let ai = out[u][*k];
                    *k += 1;
                    let v = arcs[ai].to;
                    if color[v] == 1 {
                        // back arc: the cycle is v … u → v
                        if arcs[ai].edge.is_some() {
                            found = Some(ai);
                        } else {
                            let mut cur = u;
                            let mut pick = None;
                            while cur != v {
                                let Some(e) = via[cur] else { break };
                                if arcs[e].edge.is_some() {
                                    pick = Some(e);
                                    break;
                                }
                                cur = arcs[e].from;
                            }
                            found = pick;
                        }
                        if found.is_some() {
                            break 'outer;
                        }
                    } else if color[v] == 0 {
                        color[v] = 1;
                        via[v] = Some(ai);
                        stack.push((v, 0));
                    }
                } else {
                    color[u] = 2;
                    stack.pop();
                }
            }
        }
        match found {
            Some(ai) => {
                removed[ai] = true;
                if let Some((ps, pt)) = arcs[ai].edge {
                    cycle_edges.push((items[ps].node, items[pt].node));
                }
            }
            None => break,
        }
    }
    let live: Vec<Arc> = arcs.iter().enumerate().filter(|(k, _)| !removed[*k]).map(|(_, a)| *a).collect();
    let dropped_items: BTreeSet<(usize, usize)> = arcs
        .iter()
        .enumerate()
        .filter(|(k, _)| removed[*k])
        .filter_map(|(_, a)| a.edge)
        .collect();

    // ── 4 · ranks: longest path, then network simplex ─────────────────────
    let reps: Vec<usize> = (0..nv).filter(|&v| var_of[v] == v).collect();
    let mut rank_of_rep = network_simplex(nv, &reps, &live, 40 * nv + 2000);
    // ── 5a · compress: only the ranks something sits on ────────────────────
    let rank = |v: usize, r: &Vec<i64>| r[var_of[v]];
    let mut used: BTreeSet<i64> = BTreeSet::new();
    for i in 0..n_items {
        used.insert(rank(top_var[i], &rank_of_rep));
        used.insert(rank(bot_var[i], &rank_of_rep));
    }
    let remap: BTreeMap<i64, i64> = used.iter().enumerate().map(|(k, &r)| (r, k as i64)).collect();
    for v in &reps {
        if let Some(&r) = remap.get(&rank_of_rep[*v]) {
            rank_of_rep[*v] = r;
        }
    }
    let mut top_r: Vec<usize> = (0..n_items).map(|i| rank(top_var[i], &rank_of_rep) as usize).collect();
    let mut bot_r: Vec<usize> = (0..n_items).map(|i| rank(bot_var[i], &rank_of_rep) as usize).collect();

    // ── 5b · fold over-wide rows of leaves onto inserted ranks ──────────────
    let wrap_w = if ctx.wrap_w > 0.0 {
        ctx.wrap_w
    } else {
        let area: f64 = items.iter().filter(|it| it.kids.is_none()).map(|it| (it.w + ctx.gap_x) * (it.h + ctx.sub_gap)).sum();
        (area.sqrt() * 1.9).max(1600.0)
    };
    if !ctx.sketching {
        // per (container, rank): the leaves, in node order
        let mut rows: BTreeMap<(usize, usize), Vec<usize>> = BTreeMap::new();
        for i in 0..n_items {
            if !is_group(i) {
                rows.entry((top_r[i], items[i].parent)).or_default().push(i);
            }
        }
        // ranks are processed bottom-up so an insertion does not shift a row
        // still to be examined
        let has_succ: BTreeSet<usize> =
            item_edges.iter().filter(|e| !dropped_items.contains(e)).map(|e| e.0).collect();
        let mut shared = vec![0usize; nv];
        for i in 0..n_items {
            if !is_group(i) {
                shared[var_of[top_var[i]]] += 1;
            }
        }
        let mut keys: Vec<(usize, usize)> = rows.keys().copied().collect();
        keys.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
        for (r, parent) in keys {
            let row = &rows[&(r, parent)];
            let total: f64 = row.iter().map(|&i| items[i].w + ctx.gap_x).sum();
            if total <= wrap_w || row.len() < 2 {
                continue;
            }
            // the leaves with a successor stay on the row, so what follows them
            // keeps its room; the others (sinks, and not merged with a
            // contemporaneous unit) fill the row and then go onto new rows
            let mut first_w = 0.0;
            let mut movers: Vec<usize> = Vec::new();
            for &i in row {
                if (SINKS_ONLY && has_succ.contains(&i)) || shared[var_of[top_var[i]]] > 1 {
                    first_w += items[i].w + ctx.gap_x;
                } else {
                    movers.push(i);
                }
            }
            let mut chunks: Vec<Vec<usize>> = Vec::new();
            let mut cur: Vec<usize> = Vec::new();
            let mut cw = 0.0;
            for i in movers {
                let wi = items[i].w + ctx.gap_x;
                if chunks.is_empty() && cur.is_empty() && first_w + wi <= wrap_w {
                    first_w += wi;
                    continue; // stays on row r
                }
                if !cur.is_empty() && cw + wi > wrap_w {
                    chunks.push(std::mem::take(&mut cur));
                    cw = 0.0;
                }
                cur.push(i);
                cw += wi;
            }
            if !cur.is_empty() {
                chunks.push(cur);
            }
            let k = chunks.len();
            if k == 0 {
                continue;
            }
            // insert k ranks after r: everything strictly below r moves down by
            // k; a group spanning r grows by k at its bottom
            for i in 0..n_items {
                if top_r[i] > r {
                    top_r[i] += k;
                }
                if bot_r[i] > r {
                    bot_r[i] += k;
                }
            }
            for (ci, chunk) in chunks.iter().enumerate() {
                for &i in chunk {
                    top_r[i] = r + 1 + ci;
                    bot_r[i] = r + 1 + ci;
                }
            }
            // the containers of the movers grow to hold them (ancestors' bottoms)
            for chunk in &chunks {
                for &i in chunk {
                    let mut p = items[i].parent;
                    while p != ROOT {
                        if bot_r[p] < bot_r[i] {
                            bot_r[p] = bot_r[i];
                        }
                        p = items[p].parent;
                    }
                }
            }
        }
    }
    let n_ranks = (0..n_items).map(|i| bot_r[i]).max().unwrap_or(0) + 1;

    // ── 6 · order: dummies, then compound barycenter sweeps ────────────────
    // order nodes: every leaf, then the dummies of the long edges
    // container of an order node: its parent group item, or ROOT
    let lca = |a: usize, b: usize| -> usize {
        // lowest common ancestor CONTAINER of two items
        let (mut x, mut y) = (items[a].parent, items[b].parent);
        let dep = |i: usize| if i == ROOT { 0 } else { items[i].depth + 1 };
        while dep(x) > dep(y) {
            x = items[x].parent;
        }
        while dep(y) > dep(x) {
            y = items[y].parent;
        }
        while x != y {
            x = items[x].parent;
            y = items[y].parent;
        }
        x
    };
    struct Ord {
        rank: usize,
        container: usize,
        item: Option<usize>, // None: a dummy
        key: f64,
    }
    let mut ords: Vec<Ord> = Vec::new();
    let mut ord_of_item = vec![usize::MAX; n_items];
    let base_key = |i: usize| -> f64 {
        if ctx.sketching {
            sketch_x(items[i].node)
        } else if let Some(h) = hint {
            // the outer band: under the units it hangs from, the rest after them
            h.get(&items[i].node).copied().unwrap_or(1e12 + items[i].node as f64)
        } else {
            items[i].node as f64
        }
    };
    for i in 0..n_items {
        if !is_group(i) {
            ord_of_item[i] = ords.len();
            ords.push(Ord { rank: top_r[i], container: items[i].parent, item: Some(i), key: base_key(i) });
        }
    }
    // adjacency between consecutive ranks (for the barycenter and the crossings)
    let mut up_adj: Vec<Vec<usize>> = Vec::new(); // ord → ords in rank − 1
    let mut dn_adj: Vec<Vec<usize>> = Vec::new(); // ord → ords in rank + 1
    let link = |a: usize, b: usize, up_adj: &mut Vec<Vec<usize>>, dn_adj: &mut Vec<Vec<usize>>| {
        while up_adj.len() <= a.max(b) {
            up_adj.push(Vec::new());
            dn_adj.push(Vec::new());
        }
        dn_adj[a].push(b);
        up_adj[b].push(a);
    };
    for &(ps, pt) in &item_edges {
        if dropped_items.contains(&(ps, pt)) {
            continue;
        }
        let r0 = bot_r[ps];
        let r1 = top_r[pt];
        if r1 <= r0 {
            continue;
        }
        let cont = lca(ps, pt);
        let mut prev: Option<usize> = if is_group(ps) { None } else { Some(ord_of_item[ps]) };
        let k0 = if is_group(ps) { base_key(ps) } else { ords[ord_of_item[ps]].key };
        let k1 = if is_group(pt) { base_key(pt) } else { ords[ord_of_item[pt]].key };
        for r in (r0 + 1)..r1 {
            let d = ords.len();
            let f = (r - r0) as f64 / (r1 - r0) as f64;
            ords.push(Ord { rank: r, container: cont, item: None, key: k0 + (k1 - k0) * f });
            if let Some(p) = prev {
                link(p, d, &mut up_adj, &mut dn_adj);
            }
            prev = Some(d);
        }
        if let (Some(p), false) = (prev, is_group(pt)) {
            link(p, ord_of_item[pt], &mut up_adj, &mut dn_adj);
        }
    }
    while up_adj.len() < ords.len() {
        up_adj.push(Vec::new());
        dn_adj.push(Vec::new());
    }
    // slots of a container at a rank: its order nodes and its child groups
    #[derive(Clone, Copy, PartialEq)]
    enum Slot {
        O(usize),
        G(usize),
    }
    // containers: ROOT and every group; index containers by item (ROOT → n_items)
    let cix = |c: usize| if c == ROOT { n_items } else { c };
    let mut slots: Vec<BTreeMap<usize, Vec<Slot>>> = vec![BTreeMap::new(); n_items + 1];
    for (k, o) in ords.iter().enumerate() {
        slots[cix(o.container)].entry(o.rank).or_default().push(Slot::O(k));
    }
    for i in 0..n_items {
        if is_group(i) {
            for r in top_r[i]..=bot_r[i] {
                slots[cix(items[i].parent)].entry(r).or_default().push(Slot::G(i));
            }
        }
    }
    // group order among siblings: one global key per group
    let mut gkey: Vec<f64> = (0..n_items).map(|i| if is_group(i) { base_key(i) } else { 0.0 }).collect();
    if !ctx.sketching {
        // a group's first key: the mean of its leaves' (node order is a fair
        // start: a group's members are usually declared together)
        fn leaves_of(items: &[Item], g: usize, out: &mut Vec<usize>) {
            if let Some(k) = &items[g].kids {
                for &c in k {
                    if items[c].kids.is_some() {
                        leaves_of(items, c, out);
                    } else {
                        out.push(c);
                    }
                }
            }
        }
        for i in 0..n_items {
            if is_group(i) {
                let mut ls = Vec::new();
                leaves_of(&items, i, &mut ls);
                if !ls.is_empty() {
                    gkey[i] = ls.iter().map(|&l| base_key(l)).sum::<f64>() / ls.len() as f64;
                }
            }
        }
    }
    let sort_slots = |slots: &mut Vec<BTreeMap<usize, Vec<Slot>>>, key_of: &dyn Fn(Slot) -> f64, gkey: &Vec<f64>| {
        for per in slots.iter_mut() {
            for list in per.values_mut() {
                let mut scored: Vec<(f64, usize, Slot)> =
                    list.iter().enumerate().map(|(p, &s)| (key_of(s), p, s)).collect();
                scored.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal).then(a.1.cmp(&b.1)));
                // the groups keep their global order: refill their places
                let mut gs: Vec<usize> = scored.iter().filter_map(|x| if let Slot::G(g) = x.2 { Some(g) } else { None }).collect();
                gs.sort_by(|&a, &b| gkey[a].partial_cmp(&gkey[b]).unwrap_or(std::cmp::Ordering::Equal).then(a.cmp(&b)));
                let mut gi = 0;
                *list = scored
                    .into_iter()
                    .map(|x| match x.2 {
                        Slot::G(_) => {
                            let g = gs[gi];
                            gi += 1;
                            Slot::G(g)
                        }
                        o => o,
                    })
                    .collect();
            }
        }
    };
    // positions of the order nodes in their rank (flattened, containers inline)
    let flatten = |slots: &Vec<BTreeMap<usize, Vec<Slot>>>, pos: &mut Vec<f64>, len: &mut Vec<usize>| {
        fn walk(slots: &Vec<BTreeMap<usize, Vec<Slot>>>, c: usize, r: usize, n_items: usize, pos: &mut Vec<f64>, k: &mut usize) {
            let ci = if c == ROOT { n_items } else { c };
            if let Some(list) = slots[ci].get(&r) {
                for s in list {
                    match *s {
                        Slot::O(o) => {
                            pos[o] = *k as f64;
                            *k += 1;
                        }
                        Slot::G(g) => walk(slots, g, r, n_items, pos, k),
                    }
                }
            }
        }
        for r in 0..n_ranks {
            let mut k = 0usize;
            walk(slots, ROOT, r, n_items, pos, &mut k);
            len[r] = k;
        }
    };
    let mut pos = vec![0f64; ords.len()];
    let mut rlen = vec![0usize; n_ranks];
    {
        let init_key = |s: Slot| match s {
            Slot::O(o) => ords[o].key,
            Slot::G(g) => gkey[g],
        };
        sort_slots(&mut slots, &init_key, &gkey);
    }
    flatten(&slots, &mut pos, &mut rlen);
    let crossings = |pos: &Vec<f64>| -> u64 {
        let mut total = 0u64;
        let mut by_rank: Vec<Vec<(f64, f64)>> = vec![Vec::new(); n_ranks];
        for (a, outs) in dn_adj.iter().enumerate() {
            for &b in outs {
                by_rank[ords[a].rank].push((pos[a], pos[b]));
            }
        }
        for mut es in by_rank {
            es.sort_by(|x, y| x.0.partial_cmp(&y.0).unwrap().then(x.1.partial_cmp(&y.1).unwrap()));
            // inversions of the second coordinate (merge-count via sort)
            let mut seq: Vec<f64> = es.iter().map(|e| e.1).collect();
            total += inversions(&mut seq);
        }
        total
    };
    if !ctx.sketching && ords.len() > 1 {
        let mut best = slots.clone();
        let mut best_c = crossings(&pos);
        for it in 0..ctx.sweeps.max(1) {
            let down = it % 2 == 0;
            let order: Vec<usize> = if down { (1..n_ranks).collect() } else { (0..n_ranks.saturating_sub(1)).rev().collect() };
            for r in order {
                // the barycenter of every order node of this rank
                let mut bary: HashMap<usize, f64> = HashMap::new();
                for (o, od) in ords.iter().enumerate() {
                    if od.rank != r {
                        continue;
                    }
                    let nb = if down { &up_adj[o] } else { &dn_adj[o] };
                    let v = if nb.is_empty() { pos[o] } else { nb.iter().map(|&x| pos[x]).sum::<f64>() / nb.len() as f64 };
                    bary.insert(o, v);
                }
                // a group's key at this rank: the mean of its order nodes here
                let mut gsum: HashMap<usize, (f64, usize)> = HashMap::new();
                for (&o, &v) in bary.iter() {
                    let mut c = ords[o].container;
                    while c != ROOT {
                        let e = gsum.entry(c).or_insert((0.0, 0));
                        e.0 += v;
                        e.1 += 1;
                        c = items[c].parent;
                    }
                }
                let key_of = |s: Slot| -> f64 {
                    match s {
                        Slot::O(o) => *bary.get(&o).unwrap_or(&pos[o]),
                        Slot::G(g) => {
                            if GROUPS_ASIDE && items[g].parent == ROOT {
                                1e9 + gkey[g]
                            } else {
                                gsum.get(&g).map(|(s, n)| s / *n as f64).unwrap_or(gkey[g] * rlen[r] as f64)
                            }
                        }
                    }
                };
                for per in slots.iter_mut() {
                    if let Some(list) = per.get_mut(&r) {
                        let mut scored: Vec<(f64, usize, Slot)> =
                            list.iter().enumerate().map(|(p, &s)| (key_of(s), p, s)).collect();
                        scored.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal).then(a.1.cmp(&b.1)));
                        let mut gs: Vec<usize> = scored.iter().filter_map(|x| if let Slot::G(g) = x.2 { Some(g) } else { None }).collect();
                        gs.sort_by(|&a, &b| gkey[a].partial_cmp(&gkey[b]).unwrap_or(std::cmp::Ordering::Equal).then(a.cmp(&b)));
                        let mut gi = 0;
                        *list = scored
                            .into_iter()
                            .map(|x| match x.2 {
                                Slot::G(_) => {
                                    let g = gs[gi];
                                    gi += 1;
                                    Slot::G(g)
                                }
                                o => o,
                            })
                            .collect();
                    }
                }
                flatten(&slots, &mut pos, &mut rlen);
            }
            // the groups' global order, from where their contents went
            let mut acc: Vec<(f64, usize)> = vec![(0.0, 0); n_items];
            for (o, od) in ords.iter().enumerate() {
                let norm = if rlen[od.rank] > 0 { pos[o] / rlen[od.rank] as f64 } else { 0.0 };
                let mut c = od.container;
                while c != ROOT {
                    acc[c].0 += norm;
                    acc[c].1 += 1;
                    c = items[c].parent;
                }
            }
            for i in 0..n_items {
                if is_group(i) && acc[i].1 > 0 {
                    gkey[i] = acc[i].0 / acc[i].1 as f64;
                }
            }
            let gk = gkey.clone();
            // re-seat the groups in their new global order, the rest unmoved
            for per in slots.iter_mut() {
                for list in per.values_mut() {
                    let gpos: Vec<usize> = list.iter().enumerate().filter_map(|(p, s)| if let Slot::G(_) = s { Some(p) } else { None }).collect();
                    let mut gs: Vec<usize> = list.iter().filter_map(|s| if let Slot::G(g) = s { Some(*g) } else { None }).collect();
                    gs.sort_by(|&a, &b| gk[a].partial_cmp(&gk[b]).unwrap_or(std::cmp::Ordering::Equal).then(a.cmp(&b)));
                    for (p, g) in gpos.into_iter().zip(gs) {
                        list[p] = Slot::G(g);
                    }
                }
            }
            flatten(&slots, &mut pos, &mut rlen);
            let c = crossings(&pos);
            if c < best_c {
                best_c = c;
                best = slots.clone();
            }
        }
        slots = best;
        flatten(&slots, &mut pos, &mut rlen);
    }

    // ── 7 · x: per container, bottom-up; a group is a column ───────────────
    // neighbours (by item) for the median relaxation, from the item edges
    let mut nbrs: Vec<Vec<usize>> = vec![Vec::new(); n_items];
    for &(a, b) in &item_edges {
        nbrs[a].push(b);
        nbrs[b].push(a);
    }
    // relative x of every item inside its container, and block widths
    let mut rel_x = vec![0f64; n_items];
    let mut block_w: Vec<f64> = (0..n_items).map(|i| items[i].w).collect();
    // containers bottom-up: deepest groups first, the root last
    let mut groups_by_depth: Vec<usize> = (0..n_items).filter(|&i| is_group(i)).collect();
    groups_by_depth.sort_by(|&a, &b| items[b].depth.cmp(&items[a].depth).then(a.cmp(&b)));
    let pad = ctx.group_pad;
    let place_container = |c: usize, rel_x: &mut Vec<f64>, block_w: &mut Vec<f64>| {
        let ci = cix(c);
        let kids: Vec<usize> = if c == ROOT { roots.clone() } else { items[c].kids.clone().unwrap_or_default() };
        if kids.is_empty() {
            return 0.0;
        }
        let local: HashMap<usize, usize> = kids.iter().enumerate().map(|(k, &i)| (i, k)).collect();
        let nk = kids.len();
        // separation arcs from every rank's slot order (dummies take no room)
        let mut sep: BTreeMap<(usize, usize), f64> = BTreeMap::new();
        for list in slots[ci].values() {
            let mut prev: Option<usize> = None;
            for s in list {
                let it = match *s {
                    Slot::O(o) => match ords[o].item {
                        Some(i) => i,
                        None => continue,
                    },
                    Slot::G(g) => g,
                };
                let Some(&k) = local.get(&it) else { continue };
                if let Some(p) = prev {
                    if p != k {
                        let len = block_w[kids[p]] + ctx.gap_x;
                        let e = sep.entry((p, k)).or_insert(len);
                        if *e < len {
                            *e = len;
                        }
                    }
                }
                prev = Some(k);
            }
        }
        let mut succ: Vec<Vec<(usize, f64)>> = vec![Vec::new(); nk];
        let mut pred: Vec<Vec<(usize, f64)>> = vec![Vec::new(); nk];
        let mut indeg = vec![0usize; nk];
        for (&(a, b), &len) in &sep {
            succ[a].push((b, len));
            pred[b].push((a, len));
            indeg[b] += 1;
        }
        // topological order (the slot orders are consistent, so a DAG; a
        // contradiction would leave nodes out — they are appended in order)
        let mut topo: Vec<usize> = (0..nk).filter(|&k| indeg[k] == 0).collect();
        let mut qi = 0;
        let mut deg = indeg.clone();
        while qi < topo.len() {
            let u = topo[qi];
            qi += 1;
            for &(v, _) in &succ[u] {
                deg[v] -= 1;
                if deg[v] == 0 {
                    topo.push(v);
                }
            }
        }
        if topo.len() < nk {
            let inn: BTreeSet<usize> = topo.iter().copied().collect();
            for k in 0..nk {
                if !inn.contains(&k) {
                    topo.push(k);
                }
            }
        }
        // compact to the left
        let mut x = vec![0f64; nk];
        for &u in &topo {
            for &(p, len) in &pred[u] {
                if x[p] + len > x[u] {
                    x[u] = x[p] + len;
                }
            }
        }
        // relax toward the median of the neighbours, inside the constraints AND
        // inside the compact envelope: the relaxation aligns, it never widens
        let wk: Vec<f64> = kids.iter().map(|&i| block_w[i]).collect();
        let envelope = (0..nk).map(|k| x[k] + wk[k]).fold(0.0, f64::max);
        // a neighbour of a kid: any item edge from inside it to inside a sibling
        let mut kid_of_item: HashMap<usize, usize> = HashMap::new();
        fn mark(items: &[Item], i: usize, k: usize, m: &mut HashMap<usize, usize>) {
            m.insert(i, k);
            if let Some(ks) = &items[i].kids {
                for &c in ks {
                    mark(items, c, k, m);
                }
            }
        }
        for (k, &i) in kids.iter().enumerate() {
            mark(&items, i, k, &mut kid_of_item);
        }
        let mut knb: Vec<Vec<usize>> = vec![Vec::new(); nk];
        for (&i, &k) in kid_of_item.iter() {
            for &j in &nbrs[i] {
                if let Some(&k2) = kid_of_item.get(&j) {
                    if k2 != k {
                        knb[k].push(k2);
                    }
                }
            }
        }
        for v in knb.iter_mut() {
            v.sort_unstable();
        }
        for pass in 0..12 {
            let seq: Vec<usize> = if pass % 2 == 0 { topo.clone() } else { topo.iter().rev().copied().collect() };
            for &u in &seq {
                if knb[u].is_empty() {
                    continue;
                }
                let mut cs: Vec<f64> = knb[u].iter().map(|&v| x[v] + wk[v] / 2.0).collect();
                cs.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let m = if cs.len() % 2 == 1 { cs[cs.len() / 2] } else { (cs[cs.len() / 2 - 1] + cs[cs.len() / 2]) / 2.0 };
                let want = m - wk[u] / 2.0;
                let lo = pred[u].iter().map(|&(p, len)| x[p] + len).fold(0.0, f64::max);
                let hi = succ[u].iter().map(|&(s, len)| x[s] - len).fold(envelope - wk[u], f64::min);
                if lo <= hi {
                    x[u] = want.max(lo).min(hi);
                }
            }
        }
        let minx = x.iter().copied().fold(f64::INFINITY, f64::min);
        let mut wmax = 0f64;
        for (k, &i) in kids.iter().enumerate() {
            rel_x[i] = x[k] - minx;
            wmax = wmax.max(rel_x[i] + wk[k]);
        }
        wmax
    };
    for &g in &groups_by_depth {
        let inner = place_container(g, &mut rel_x, &mut block_w);
        block_w[g] = inner + 2.0 * pad;
    }
    let root_w = place_container(ROOT, &mut rel_x, &mut block_w);
    // absolute x: a group's contents start one pad inside it
    let mut abs_x = vec![0f64; n_items];
    fn absolutize(items: &[Item], i: usize, base: f64, rel_x: &[f64], pad: f64, abs_x: &mut Vec<f64>) {
        abs_x[i] = base + rel_x[i];
        if let Some(ks) = &items[i].kids {
            for &c in ks {
                absolutize(items, c, abs_x[i] + pad, rel_x, pad, abs_x);
            }
        }
    }
    for &r in &roots {
        absolutize(&items, r, 0.0, &rel_x, pad, &mut abs_x);
    }

    // ── 8 · y: one table per lane ───────────────────────────────────────────
    let mut row_h = vec![0f64; n_ranks];
    for i in 0..n_items {
        if !is_group(i) {
            row_h[top_r[i]] = row_h[top_r[i]].max(items[i].h);
        }
    }
    // the header stack of a group opening at its top rank, and the pad stack of
    // a group closing at its bottom rank (nested groups opening on the same row
    // stack their headers)
    let mut start_depth = vec![0usize; n_items];
    let mut end_depth = vec![0usize; n_items];
    for &g in &groups_by_depth {
        let kids = items[g].kids.as_ref().unwrap();
        let s = kids.iter().filter(|&&c| is_group(c) && top_r[c] == top_r[g]).map(|&c| start_depth[c]).max().unwrap_or(0);
        let e = kids.iter().filter(|&&c| is_group(c) && bot_r[c] == bot_r[g]).map(|&c| end_depth[c]).max().unwrap_or(0);
        start_depth[g] = s + 1;
        end_depth[g] = e + 1;
    }
    let mut hdr = vec![0usize; n_ranks];
    let mut ftr = vec![0usize; n_ranks];
    for i in 0..n_items {
        if is_group(i) {
            hdr[top_r[i]] = hdr[top_r[i]].max(start_depth[i]);
            ftr[bot_r[i]] = ftr[bot_r[i]].max(end_depth[i]);
        }
    }
    let mut y_of = vec![0f64; n_ranks];
    let mut cursor = 0f64;
    for r in 0..n_ranks {
        cursor += hdr[r] as f64 * ctx.group_header;
        y_of[r] = cursor;
        let h = if row_h[r] > 0.0 { row_h[r] } else { 0.0 };
        cursor += h + ftr[r] as f64 * ctx.group_pad + ctx.sub_gap;
    }
    let total_h = (cursor - ctx.sub_gap).max(ctx.node_h);

    let mut places: Vec<(usize, f64, f64, f64, f64)> = Vec::with_capacity(n_items);
    for i in 0..n_items {
        if is_group(i) {
            let top = y_of[top_r[i]] - start_depth[i] as f64 * ctx.group_header;
            let bottom = y_of[bot_r[i]] + row_h[bot_r[i]] + end_depth[i] as f64 * ctx.group_pad;
            places.push((items[i].node, abs_x[i], top, block_w[i], bottom - top));
        } else {
            places.push((items[i].node, abs_x[i], y_of[top_r[i]], items[i].w, items[i].h));
        }
    }
    cycle_edges.sort();
    cycle_edges.dedup();
    let w = root_w.max(ctx.node_h);
    Block { w, w_main: w, h: total_h, places, cycle_edges }
}

/// Inversions of a sequence (the crossings of a bilayer, with the edges sorted
/// by their first end): merge sort, O(e log e).
fn inversions(a: &mut [f64]) -> u64 {
    let n = a.len();
    if n < 2 {
        return 0;
    }
    let mid = n / 2;
    let mut c = inversions(&mut a[..mid]) + inversions(&mut a[mid..]);
    let mut merged = Vec::with_capacity(n);
    let (mut i, mut j) = (0, mid);
    while i < mid && j < n {
        if a[j] < a[i] {
            merged.push(a[j]);
            c += (mid - i) as u64;
            j += 1;
        } else {
            merged.push(a[i]);
            i += 1;
        }
    }
    merged.extend_from_slice(&a[i..mid]);
    merged.extend_from_slice(&a[j..n]);
    a.copy_from_slice(&merged);
    c
}

/// Network simplex ranking (Gansner, Koutsofios, North, Vo 1993): minimise
/// Σ weight · (rank(to) − rank(from)) subject to rank(to) − rank(from) ≥ minlen,
/// over the variables `reps` (the others are not used). The arcs must form a
/// DAG. Returns a rank per variable index (0 for the unused ones), the least at
/// 0. A virtual root joins every source with a zero-weight arc, so the tree is
/// spanning; `max_iter` bounds the pivots (the longest-path ranking it starts
/// from is already feasible, so a cut-short run is still a valid ranking).
fn network_simplex(nv: usize, reps: &[usize], arcs_in: &[Arc], max_iter: usize) -> Vec<i64> {
    let root = nv; // virtual
    let n = nv + 1;
    let mut arcs: Vec<(usize, usize, i64, i64)> = arcs_in.iter().map(|a| (a.from, a.to, a.minlen, a.weight)).collect();
    let mut has_in = vec![false; n];
    for a in &arcs {
        has_in[a.1] = true;
    }
    for &v in reps {
        if !has_in[v] {
            arcs.push((root, v, 0, 0));
        }
    }
    let alive: Vec<bool> = {
        let mut a = vec![false; n];
        for &v in reps {
            a[v] = true;
        }
        a[root] = true;
        a
    };
    let m = arcs.len();
    let mut out: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut inn: Vec<Vec<usize>> = vec![Vec::new(); n];
    for (k, a) in arcs.iter().enumerate() {
        out[a.0].push(k);
        inn[a.1].push(k);
    }
    // longest path from the root
    let mut rank = vec![0i64; n];
    {
        let mut deg: Vec<usize> = (0..n).map(|v| inn[v].len()).collect();
        let mut q: Vec<usize> = (0..n).filter(|&v| alive[v] && deg[v] == 0).collect();
        let mut qi = 0;
        while qi < q.len() {
            let u = q[qi];
            qi += 1;
            for &k in &out[u] {
                let (_, v, len, _) = arcs[k];
                if rank[v] < rank[u] + len {
                    rank[v] = rank[u] + len;
                }
                deg[v] -= 1;
                if deg[v] == 0 {
                    q.push(v);
                }
            }
        }
    }
    let slack = |rank: &Vec<i64>, k: usize| -> i64 { rank[arcs[k].1] - rank[arcs[k].0] - arcs[k].2 };
    // feasible tight spanning tree
    let mut in_tree = vec![false; n];
    let mut tree_arc = vec![false; m];
    let mut tree_size;
    let alive_count = alive.iter().filter(|&&a| a).count();
    let grow = |rank: &Vec<i64>, in_tree: &mut Vec<bool>, tree_arc: &mut Vec<bool>, tree_size: &mut usize| {
        // add every node reachable from the tree through tight arcs
        let mut stack: Vec<usize> = (0..n).filter(|&v| in_tree[v]).collect();
        while let Some(u) = stack.pop() {
            for &k in out[u].iter().chain(inn[u].iter()) {
                let (a, b, _, _) = arcs[k];
                let w = if a == u { b } else { a };
                if !in_tree[w] && slack(rank, k) == 0 {
                    in_tree[w] = true;
                    tree_arc[k] = true;
                    *tree_size += 1;
                    stack.push(w);
                }
            }
        }
    };
    in_tree[root] = true;
    tree_size = 1;
    grow(&rank, &mut in_tree, &mut tree_arc, &mut tree_size);
    while tree_size < alive_count {
        // the incident arc of least slack, and shift the tree onto it
        let mut best: Option<(i64, usize)> = None;
        for k in 0..m {
            let (a, b, _, _) = arcs[k];
            if in_tree[a] != in_tree[b] {
                let s = slack(&rank, k);
                if best.map_or(true, |(bs, bk)| s < bs || (s == bs && k < bk)) {
                    best = Some((s, k));
                }
            }
        }
        let Some((s, k)) = best else { break };
        let delta = if in_tree[arcs[k].0] { s } else { -s };
        for v in 0..n {
            if in_tree[v] {
                rank[v] += delta;
            }
        }
        grow(&rank, &mut in_tree, &mut tree_arc, &mut tree_size);
    }
    // tree structure: parent arc, postorder lim, subtree low
    let mut par = vec![usize::MAX; n];
    let mut lim = vec![0usize; n];
    let mut low = vec![0usize; n];
    let mut cut = vec![0i64; m];
    let mut tadj: Vec<Vec<usize>> = vec![Vec::new(); n];
    let rebuild_tree = |tree_arc: &Vec<bool>, tadj: &mut Vec<Vec<usize>>, par: &mut Vec<usize>, lim: &mut Vec<usize>, low: &mut Vec<usize>, order: &mut Vec<usize>| {
        for v in tadj.iter_mut() {
            v.clear();
        }
        for k in 0..m {
            if tree_arc[k] {
                tadj[arcs[k].0].push(k);
                tadj[arcs[k].1].push(k);
            }
        }
        // iterative DFS from the root: postorder numbers
        order.clear();
        par[root] = usize::MAX;
        let mut counter = 1usize;
        let mut stack: Vec<(usize, usize)> = vec![(root, 0)];
        let mut lowest = vec![usize::MAX; n];
        while let Some(&mut (u, ref mut i)) = stack.last_mut() {
            if *i < tadj[u].len() {
                let k = tadj[u][*i];
                *i += 1;
                if k == par[u] {
                    continue;
                }
                let w = if arcs[k].0 == u { arcs[k].1 } else { arcs[k].0 };
                par[w] = k;
                lowest[w] = counter;
                stack.push((w, 0));
            } else {
                lim[u] = counter;
                low[u] = if lowest[u] == usize::MAX { counter } else { lowest[u].min(counter) };
                counter += 1;
                order.push(u);
                stack.pop();
            }
        }
        low[root] = 1;
    };
    let mut post: Vec<usize> = Vec::new();
    rebuild_tree(&tree_arc, &mut tadj, &mut par, &mut lim, &mut low, &mut post);
    // cut values (Graphviz x_cutval / x_val)
    let in_sub = |low: &Vec<usize>, lim: &Vec<usize>, v: usize, w: usize| low[v] <= lim[w] && lim[w] <= lim[v];
    let compute_cuts = |tree_arc: &Vec<bool>, par: &Vec<usize>, low: &Vec<usize>, lim: &Vec<usize>, post: &Vec<usize>, cut: &mut Vec<i64>| {
        for &v in post {
            let f = par[v];
            if f == usize::MAX {
                continue;
            }
            // v is the endpoint of f farther from the root
            let dir: i64 = if arcs[f].0 == v { 1 } else { -1 };
            let mut sum = 0i64;
            for &e in out[v].iter().chain(inn[v].iter()) {
                let (a, b, _, wgt) = arcs[e];
                let other = if a == v { b } else { a };
                let (fl, mut rv) = if !in_sub(low, lim, v, other) {
                    (true, wgt)
                } else {
                    (false, (if tree_arc[e] { cut[e] } else { 0 }) - wgt)
                };
                let mut d: i64 = if dir > 0 { if b == v { 1 } else { -1 } } else if a == v { 1 } else { -1 };
                if fl {
                    d = -d;
                }
                if d < 0 {
                    rv = -rv;
                }
                sum += rv;
            }
            cut[f] = sum;
        }
    };
    compute_cuts(&tree_arc, &par, &low, &lim, &post, &mut cut);
    let mut start = 0usize;
    for _ in 0..max_iter {
        // the leaving arc: a tree arc with a negative cut value
        let mut leave = None;
        for s in 0..m {
            let k = (start + s) % m;
            if tree_arc[k] && cut[k] < 0 {
                leave = Some(k);
                break;
            }
        }
        let Some(f) = leave else { break };
        start = (f + 1) % m;
        let (t, h, _, _) = arcs[f];
        let (v, outsearch) = if lim[t] < lim[h] { (t, false) } else { (h, true) };
        // the entering arc: least slack, crossing the cut the other way
        let mut enter: Option<(i64, usize)> = None;
        for k in 0..m {
            if tree_arc[k] {
                continue;
            }
            let (a, b, _, _) = arcs[k];
            let (ia, ib) = (in_sub(&low, &lim, v, a), in_sub(&low, &lim, v, b));
            let ok = if outsearch { ia && !ib } else { ib && !ia };
            if ok {
                let s = slack(&rank, k);
                if enter.map_or(true, |(bs, bk)| s < bs || (s == bs && k < bk)) {
                    enter = Some((s, k));
                }
            }
        }
        let Some((_, e)) = enter else { break };
        tree_arc[f] = false;
        tree_arc[e] = true;
        rebuild_tree(&tree_arc, &mut tadj, &mut par, &mut lim, &mut low, &mut post);
        // ranks from the tree: every tree arc tight, the root fixed
        let mut stack = vec![root];
        let mut done = vec![false; n];
        done[root] = true;
        while let Some(u) = stack.pop() {
            for &k in &tadj[u] {
                let (a, b, len, _) = arcs[k];
                let w = if a == u { b } else { a };
                if done[w] {
                    continue;
                }
                rank[w] = if a == u { rank[u] + len } else { rank[u] - len };
                done[w] = true;
                stack.push(w);
            }
        }
        compute_cuts(&tree_arc, &par, &low, &lim, &post, &mut cut);
    }
    let minr = reps.iter().map(|&v| rank[v]).min().unwrap_or(0);
    let mut outr = vec![0i64; nv];
    for &v in reps {
        outr[v] = rank[v] - minr;
    }
    outr
}
