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
//!
//! MICRO-R (E.D., 18 Nov 2026: «dove mettere i nodi», USV158 on the v10) adds:
//! the edges that cross a group box that is not theirs (neither end inside it:
//! `foreign`, edge × box pairs, and `foreign_edges`, the edges with at least
//! one), the distance of a node from what it is tied to (per node the mean
//! centre-to-centre distance to its neighbours: `nb_med`, `nb_p95`), the
//! «exiled» nodes (the nearest neighbour farther than EXILE_K = 3 times the
//! median of that distance), and the time. PROBE=USV158,… prints where those
//! nodes went and what their edges cross. The strategies of the inquiry are
//! switched on with STRAT=A,B,C,D (see `LayoutOptions::inquiry`).
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
    if let Ok(v) = std::env::var("STRAT") {
        opts.inquiry = em_core::layout::Inquiry::parse(&v);
    }
    // NOSKETCH=1: a fresh layout (no From-Sketch order)
    let sketch = if std::env::var("NOSKETCH").is_ok() { None } else { sketch };
    opts.use_sketch = sketch.is_some();
    let t0 = std::time::Instant::now();
    let mut out = compute_with_sketch(&graph, &opts, sketch.as_ref());
    // FROM_OUTPUT=1: the page's own result instead (a sanity check of the capture)
    if std::env::var("FROM_OUTPUT").is_ok() {
        out = serde_json::from_value(io["output"].clone()).expect("output");
    }
    // MICRO-R · FROM_POSITIONS=file.json: the positions of another engine (ELK,
    // Graphviz dot, the E round), measured the same way; `ms` read from the file
    let mut ms = t0.elapsed().as_millis();
    if let Ok(f) = std::env::var("FROM_POSITIONS") {
        let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(f).expect("positions")).expect("json");
        out.positions = serde_json::from_value(v["positions"].clone()).expect("positions");
        ms = v["ms"].as_u64().unwrap_or(0) as u128;
    }
    let m = metrics(&graph, &out.positions);
    println!(
        "{{\"w\":{:.0},\"h\":{:.0},\"area_m2px\":{:.2},\"empty_pct\":{:.1},\"crossings\":{},\"edge_len_k\":{:.1},\"max_group_w\":{:.0},\"upward\":{},\"edges\":{},\"foreign\":{},\"foreign_edges\":{},\"nb_med\":{:.0},\"nb_p95\":{:.0},\"exiled\":{},\"ms\":{}}}",
        m.w, m.h, m.w * m.h / 1e6, m.empty * 100.0, m.crossings, m.len / 1e3, m.max_group_w, m.upward, m.edges,
        m.foreign, m.foreign_edges, m.nb_med, m.nb_p95, m.exiled.len(), ms
    );
    if let Ok(names) = std::env::var("PROBE") {
        let by_name: HashMap<&str, &str> = graph.nodes.iter().filter_map(|n| n.name.as_deref().map(|nm| (nm, n.id.as_str()))).collect();
        for nm in names.split(',') {
            let Some(id) = by_name.get(nm) else { continue };
            let r = out.positions.get(*id);
            let cross: Vec<String> = m.foreign_of.iter().filter(|(a, b, _)| a == id || b == id).map(|(_, _, g)| graph.nodes.iter().find(|n| &n.id == g).and_then(|n| n.name.clone()).unwrap_or_default()).collect();
            let nn = m.nearest.get(*id).copied().unwrap_or(f64::NAN);
            println!("  {nm}: {:?} nearest-neighbour {:.0} crosses {:?} exiled {}", r.map(|q| (q.x.round(), q.y.round())), nn, cross, m.exiled.contains(&id.to_string()));
        }
    }
    if std::env::var("EXILED").is_ok() {
        let names: Vec<String> = m.exiled.iter().filter_map(|id| graph.nodes.iter().find(|n| &n.id == id).and_then(|n| n.name.clone())).collect();
        println!("  exiled: {:?}", names);
    }
    if let Some(p) = args.get(1) {
        std::fs::write(p, serde_json::to_string(&out).unwrap()).unwrap();
    }
}

pub struct Metrics {
    pub w: f64, pub h: f64, pub empty: f64, pub crossings: usize, pub len: f64, pub max_group_w: f64, pub upward: usize, pub edges: usize,
    /// MICRO-R · edge × foreign group box pairs, the edges with one at least, and which
    pub foreign: usize, pub foreign_edges: usize, pub foreign_of: Vec<(String, String, String)>,
    /// MICRO-R · per node the mean distance to its neighbours: median and 95th percentile
    pub nb_med: f64, pub nb_p95: f64,
    /// MICRO-R · nodes whose nearest neighbour is farther than EXILE_K × the median nearest
    pub exiled: Vec<String>, pub nearest: HashMap<String, f64>,
}

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
    // MICRO-R · a segment through a group box that is not its own (neither end
    // inside it, the box neither end itself): the defect of USV158 on the v10
    let boxes: Vec<(&str, &em_core::model::Rect)> = graph.nodes.iter()
        .filter(|n| has_kids.contains(n.id.as_str()) && !epoch.contains(n.id.as_str()))
        .filter_map(|n| pos.get(&n.id).map(|q| (n.id.as_str(), q))).collect();
    let through = |s: (f64, f64, f64, f64), q: &em_core::model::Rect| -> bool {
        // Liang–Barsky against the box shrunk by 1 (a touch is not a crossing)
        let (x0, y0, x1, y1) = (q.x + 1.0, q.y + 1.0, q.x + q.w - 1.0, q.y + q.h - 1.0);
        if x1 <= x0 || y1 <= y0 { return false; }
        let (dx, dy) = (s.2 - s.0, s.3 - s.1);
        let (mut t0, mut t1) = (0.0f64, 1.0f64);
        for (p, qq) in [(-dx, s.0 - x0), (dx, x1 - s.0), (-dy, s.1 - y0), (dy, y1 - s.1)] {
            if p == 0.0 { if qq < 0.0 { return false; } continue; }
            let r = qq / p;
            if p < 0.0 { if r > t1 { return false; } if r > t0 { t0 = r; } } else { if r < t0 { return false; } if r < t1 { t1 = r; } }
        }
        t0 < t1
    };
    let (mut foreign, mut foreign_edges, mut foreign_of) = (0usize, 0usize, Vec::new());
    for (a, c, seg) in &segs {
        let (sa, sc) = (graph.nodes[*a].id.as_str(), graph.nodes[*c].id.as_str());
        let mut any = false;
        for (g, q) in &boxes {
            if *g == sa || *g == sc || anc(g, sa) || anc(g, sc) { continue; }
            if through(*seg, q) {
                foreign += 1;
                any = true;
                foreign_of.push((sa.to_string(), sc.to_string(), g.to_string()));
            }
        }
        if any { foreign_edges += 1; }
    }
    // MICRO-R · distance from the neighbours (centre to centre, the drawn relations)
    let centre = |id: &str| pos.get(id).map(|q| (q.x + q.w / 2.0, q.y + q.h / 2.0));
    let mut nb: BTreeMap<&str, Vec<f64>> = BTreeMap::new();
    for (a, c, _) in &segs {
        let (sa, sc) = (graph.nodes[*a].id.as_str(), graph.nodes[*c].id.as_str());
        let (Some(p), Some(q)) = (centre(sa), centre(sc)) else { continue };
        let d = ((p.0 - q.0).powi(2) + (p.1 - q.1).powi(2)).sqrt();
        nb.entry(sa).or_default().push(d);
        nb.entry(sc).or_default().push(d);
    }
    let pct = |v: &mut Vec<f64>, p: f64| -> f64 {
        if v.is_empty() { return 0.0; }
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        v[((v.len() - 1) as f64 * p).round() as usize]
    };
    let mut means: Vec<f64> = nb.values().map(|v| v.iter().sum::<f64>() / v.len() as f64).collect();
    let (nb_med, nb_p95) = (pct(&mut means, 0.5), pct(&mut means, 0.95));
    let nearest: HashMap<String, f64> = nb.iter().map(|(k, v)| (k.to_string(), v.iter().copied().fold(f64::INFINITY, f64::min))).collect();
    let mut near_all: Vec<f64> = nearest.values().copied().collect();
    let near_med = pct(&mut near_all, 0.5);
    let k: f64 = std::env::var("EXILE_K").ok().and_then(|v| v.parse().ok()).unwrap_or(3.0);
    let mut exiled: Vec<String> = nearest.iter().filter(|(_, &d)| d > k * near_med).map(|(id, _)| id.clone()).collect();
    exiled.sort();
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
    Metrics {
        w, h, empty: 1.0 - leaf / (w * h), crossings, len, max_group_w: mg, upward: upward_edges(graph, pos).len(), edges: segs.len(),
        foreign, foreign_edges, foreign_of, nb_med, nb_p95, exiled, nearest,
    }
}
