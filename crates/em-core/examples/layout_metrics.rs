//! MICRO-Q p.2 (E.D., 17 Nov 2026: «il layout non comprime abbastanza») · how
//! compact a lane layout is, measured on what the Matrix gives em-core: the
//! drawn subgraph and the archival sketch, captured from the page
//! (`__EM_DRAG__.viewLayoutIO()` → `{input: {graph, layout}, output}`).
//!
//!   cargo run -p em-core --release --example layout_metrics -- io.json [positions-out.json]
//!
//! Metrics: the bounding box (w × h, area), the empty share of it (1 − the
//! leaves' area / the box), crossings and total length of the drawn relations
//! (straight segments from the source's bottom to the target's top), the widest
//! group, and the upward edges (the epoch reading: must not grow).
//! Env overrides for trials: GAP_X, LAYER, INSETS, SWEEPS, GROUP_PAD, GROUP_HEADER.
use em_core::layout::{compute_with_sketch, upward_edges, LayoutOptions};
use em_core::{Graph, Layout};
use std::collections::{BTreeMap, HashMap, HashSet};

fn env_f(k: &str) -> Option<f64> {
    std::env::var(k).ok().and_then(|v| v.parse().ok())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let src = std::fs::read_to_string(&args[0]).expect("read io.json");
    let io: serde_json::Value = serde_json::from_str(&src).expect("json");
    let graph: Graph = serde_json::from_value(io["input"]["graph"].clone()).expect("graph");
    let sketch: Option<Layout> = serde_json::from_value(io["input"]["layout"].clone()).ok();
    let mut opts = LayoutOptions::default();
    if let Some(v) = env_f("GAP_X") { opts.node_to_node = v; }
    if let Some(v) = env_f("LAYER") { opts.layer_to_layer = v; }
    if let Some(v) = env_f("INSETS") { opts.lane_min_insets = v; }
    if let Some(v) = env_f("SWEEPS") { opts.barycenter_sweeps = v as u32; }
    if let Some(v) = env_f("GROUP_PAD") { opts.group_pad = v; }
    if let Some(v) = env_f("GROUP_HEADER") { opts.group_header = v; }
    // NOSKETCH=1: a fresh layout (no From-Sketch order)
    let sketch = if std::env::var("NOSKETCH").is_ok() { None } else { sketch };
    opts.use_sketch = sketch.is_some();
    let t0 = std::time::Instant::now();
    let mut out = compute_with_sketch(&graph, &opts, sketch.as_ref());
    // FROM_OUTPUT=1: the page's own result instead (a sanity check of the capture)
    if std::env::var("FROM_OUTPUT").is_ok() {
        out = serde_json::from_value(io["output"].clone()).expect("output");
    }
    let ms = t0.elapsed().as_millis();
    let m = metrics(&graph, &out.positions);
    println!(
        "{{\"w\":{:.0},\"h\":{:.0},\"area_m2px\":{:.2},\"empty_pct\":{:.1},\"crossings\":{},\"edge_len_k\":{:.1},\"max_group_w\":{:.0},\"upward\":{},\"edges\":{},\"ms\":{}}}",
        m.w, m.h, m.w * m.h / 1e6, m.empty * 100.0, m.crossings, m.len / 1e3, m.max_group_w, m.upward, m.edges, ms
    );
    if let Some(p) = args.get(1) {
        std::fs::write(p, serde_json::to_string(&out).unwrap()).unwrap();
    }
}

pub struct Metrics { pub w: f64, pub h: f64, pub empty: f64, pub crossings: usize, pub len: f64, pub max_group_w: f64, pub upward: usize, pub edges: usize }

pub fn metrics(graph: &Graph, pos: &BTreeMap<String, em_core::model::Rect>) -> Metrics {
    let epoch: HashSet<&str> = graph.nodes.iter().filter(|n| n.node_type == "epoch" || n.node_type == "EpochNode").map(|n| n.id.as_str()).collect();
    let membership = ["is_in_activity", "is_in_paradata_nodegroup", "is_in_location", "is_in_timebranch", "is_part_of"];
    let mut parent: HashMap<&str, &str> = HashMap::new();
    let mut has_kids: HashSet<&str> = HashSet::new();
    for e in &graph.edges {
        if membership.contains(&e.edge_type.as_str()) && !epoch.contains(e.target.as_str()) {
            parent.entry(e.source.as_str()).or_insert(e.target.as_str());
            has_kids.insert(e.target.as_str());
        }
    }
    let (mut l, mut r, mut t, mut b, mut leaf, mut mg) = (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY, 0.0, 0.0f64);
    for n in &graph.nodes {
        if epoch.contains(n.id.as_str()) { continue; }
        let Some(q) = pos.get(&n.id) else { continue };
        l = l.min(q.x); r = r.max(q.x + q.w); t = t.min(q.y); b = b.max(q.y + q.h);
        if has_kids.contains(n.id.as_str()) { mg = mg.max(q.w); } else { leaf += q.w * q.h; }
    }
    let (w, h) = (r - l, b - t);
    let anc = |a: &str, d: &str| { let mut c = d; for _ in 0..12 { match parent.get(c) { Some(&p) if p == a => return true, Some(&p) => c = p, None => return false } } false };
    let sym = ["has_same_time", "is_physically_equal_to", "equals", "bonded_to", "is_bonded_to", "contrasts_with"];
    let mut segs: Vec<(usize, usize, (f64, f64, f64, f64))> = Vec::new();
    let ix: HashMap<&str, usize> = graph.nodes.iter().enumerate().map(|(i, n)| (n.id.as_str(), i)).collect();
    let mut len = 0.0;
    for e in &graph.edges {
        let et = e.edge_type.as_str();
        if membership.contains(&et) || epoch.contains(e.source.as_str()) || epoch.contains(e.target.as_str()) || e.source == e.target { continue; }
        let (Some(a), Some(c)) = (pos.get(&e.source), pos.get(&e.target)) else { continue };
        if anc(&e.source, &e.target) || anc(&e.target, &e.source) { continue; }
        let seg = if sym.contains(&et) {
            (a.x + a.w / 2.0, a.y + a.h / 2.0, c.x + c.w / 2.0, c.y + c.h / 2.0)
        } else {
            (a.x + a.w / 2.0, a.y + a.h, c.x + c.w / 2.0, c.y)
        };
        len += ((seg.2 - seg.0).powi(2) + (seg.3 - seg.1).powi(2)).sqrt();
        segs.push((ix[e.source.as_str()], ix[e.target.as_str()], seg));
    }
    let cross = |p: (f64, f64, f64, f64), q: (f64, f64, f64, f64)| {
        let o = |ax: f64, ay: f64, bx: f64, by: f64, cx: f64, cy: f64| (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        let d1 = o(q.0, q.1, q.2, q.3, p.0, p.1);
        let d2 = o(q.0, q.1, q.2, q.3, p.2, p.3);
        let d3 = o(p.0, p.1, p.2, p.3, q.0, q.1);
        let d4 = o(p.0, p.1, p.2, p.3, q.2, q.3);
        d1 * d2 < 0.0 && d3 * d4 < 0.0
    };
    let mut crossings = 0;
    for i in 0..segs.len() {
        for j in i + 1..segs.len() {
            let (a, b2) = (&segs[i], &segs[j]);
            if a.0 == b2.0 || a.0 == b2.1 || a.1 == b2.0 || a.1 == b2.1 { continue; }
            let (p, q) = (a.2, b2.2);
            if p.0.max(p.2) < q.0.min(q.2) || q.0.max(q.2) < p.0.min(p.2) || p.1.max(p.3) < q.1.min(q.3) || q.1.max(q.3) < p.1.min(p.3) { continue; }
            if cross(p, q) { crossings += 1; }
        }
    }
    Metrics { w, h, empty: 1.0 - leaf / (w * h), crossings, len, max_group_w: mg, upward: upward_edges(graph, pos).len(), edges: segs.len() }
}
