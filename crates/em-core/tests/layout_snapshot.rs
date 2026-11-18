//! Layout regression snapshot on the TempluMare fixture.
//!
//! The unit tests in `layout.rs` pin *rules* on tiny hand-built graphs: newest
//! lane on top, paradata below its unit, directed edges pointing down. They say
//! nothing about what happens when 215 nodes and 536 edges are laid out at
//! once — which is where a change to spacing, ranking or lane assignment
//! actually shows up, and where it is easiest to move something by accident
//! while fixing something else.
//!
//! So this pins the whole output. The fixture is known-good (F1/F2 rebuilt it
//! with deterministic ids) and the layout is demonstrably stable, so any diff
//! here is a real behavioural change: either intended — re-bless the snapshot —
//! or a regression. The test's job is to make you look, not to forbid change.
//!
//! Re-bless after an intended change:
//!
//! ```bash
//! UPDATE_LAYOUT_SNAPSHOT=1 cargo test -p em-core --test layout_snapshot
//! ```
//!
//! then READ the diff before committing it.
//!
//! Re-blessed 17 Nov 2026 (MICRO-Q p.2, «il layout non comprime abbastanza»):
//! a group's walls and bottom 14 → 12 and its title room 28 → 26 — what the
//! Matrix draws around a group (views/matrix.ts) — and the lanes' insets
//! 24 → 16. Canvas 5044 × 1984 → 4992 × 1850, every node of the fixture moved by
//! those amounts only. The rest of p.2 (the pieces packed bottom-left up to the
//! drawing's width, a group's over-wide row folded From-Sketch too) leaves this
//! fixture identical: it has one piece per lane and no over-wide group row.
//!
//! Re-blessed 18 Nov 2026 (MICRO-V, the strategies of MICRO-R switched on):
//! G (a node with no epoch in the lane of its sources) moves the fixture's two
//! resource links `…_link` out of the trailing lane into the third lane's outer
//! band (x 2646/2796 → 150/0, y 1802 → 1832), so that lane grows 1658 → 1752
//! and the canvas 1850 → 1944; `geo_TempluMare`, still lane-less, follows the
//! trailing lane down by the same 94. C acts From-Sketch only: nothing here.
//! D is asked for («Disponi riducendo gli incroci»): its own snapshot,
//! `templu_mare_matrix_reduce.txt`, the fixture laid out From-Sketch on its
//! default layout with D on.

use std::fmt::Write as _;
use std::path::PathBuf;

use em_core::layout::{compute, compute_with_sketch, LayoutOptions};
use em_core::Graph;

fn fixture_path() -> PathBuf {
    // crates/em-core → workspace root → the frontend's test document.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../frontend/testdata/TempluMare.em.json")
}

fn snapshot_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(format!("tests/snapshots/{name}.txt"))
}

fn load_graph() -> Graph {
    let raw = std::fs::read_to_string(fixture_path()).unwrap_or_else(|e| {
        panic!("cannot read {}: {e}", fixture_path().display())
    });
    let (doc, warnings) = em_core::emjson::from_str(&raw)
        .unwrap_or_else(|e| panic!("cannot parse the TempluMare fixture: {e:?}"));
    // The fixture is supposed to be clean; if it starts warning, that is news.
    assert!(
        warnings.is_empty(),
        "fixture parsed with warnings: {warnings:?}"
    );
    doc.graph
}

/// Render the layout as stable text.
///
/// Coordinates are printed to two decimals: enough to catch any change a human
/// would see, loose enough that a last-bit float difference between compilers
/// does not fail the build. `positions` is a `BTreeMap`, so the order is the
/// map's own and needs no extra sorting.
fn render(graph: &Graph) -> String {
    render_layout(&compute(graph, &LayoutOptions::default()))
}

/// MICRO-V · «Disponi riducendo gli incroci»: From-Sketch on the default
/// layout, with the crossing reduction (D) on — what the page asks for
fn render_reduce(graph: &Graph) -> String {
    let base = compute(graph, &LayoutOptions::default());
    let mut opts = LayoutOptions::default();
    opts.use_sketch = true;
    opts.inquiry.d_median_transpose = true;
    render_layout(&compute_with_sketch(graph, &opts, Some(&base)))
}

fn render_layout(layout: &em_core::Layout) -> String {
    let mut out = String::new();
    let _ = writeln!(
        out,
        "canvas {:.2} x {:.2}",
        layout.canvas.width, layout.canvas.height
    );
    let _ = writeln!(out, "swimlanes {}", layout.swimlanes.len());
    for lane in &layout.swimlanes {
        let _ = writeln!(
            out,
            "  lane {} order={} y={:.2} h={:.2}",
            lane.epoch_id, lane.order, lane.y, lane.height
        );
    }
    let _ = writeln!(out, "positions {}", layout.positions.len());
    for (id, r) in &layout.positions {
        let _ = writeln!(
            out,
            "  {id}\t{:.2}\t{:.2}\t{:.2}\t{:.2}",
            r.x, r.y, r.w, r.h
        );
    }
    out
}

#[test]
fn layout_is_deterministic() {
    // A snapshot is worthless if the thing it pins wanders. Two runs of the
    // same input must agree before the snapshot below means anything.
    let graph = load_graph();
    assert_eq!(
        render(&graph),
        render(&graph),
        "layout::compute is not deterministic — the snapshot cannot pin it"
    );
    // MICRO-V · five runs with D on, identical to the byte
    let first = render_reduce(&graph);
    for _ in 0..4 {
        assert_eq!(render_reduce(&graph), first, "D is not deterministic");
    }
}

#[test]
fn templu_mare_layout_matches_snapshot() {
    let graph = load_graph();
    check_snapshot(&render(&graph), "templu_mare_matrix");
}

#[test]
fn templu_mare_reduce_crossings_matches_snapshot() {
    let graph = load_graph();
    check_snapshot(&render_reduce(&graph), "templu_mare_matrix_reduce");
}

fn check_snapshot(actual: &str, name: &str) {
    let path = snapshot_path(name);

    if std::env::var_os("UPDATE_LAYOUT_SNAPSHOT").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, actual).unwrap();
        eprintln!("re-blessed {}", path.display());
        return;
    }

    let expected = std::fs::read_to_string(&path).unwrap_or_else(|_| {
        panic!(
            "no snapshot at {} — create it with \
             UPDATE_LAYOUT_SNAPSHOT=1 cargo test -p em-core --test layout_snapshot",
            path.display()
        )
    });

    if actual == expected {
        return;
    }

    // Report the first few differing lines rather than dumping 200 of them.
    let mut diffs = Vec::new();
    let mut a = actual.lines();
    let mut e = expected.lines();
    let mut n = 0usize;
    loop {
        match (a.next(), e.next()) {
            (None, None) => break,
            (x, y) => {
                n += 1;
                if x != y && diffs.len() < 8 {
                    diffs.push(format!(
                        "  line {n}:\n    expected: {}\n    actual:   {}",
                        y.unwrap_or("<missing>"),
                        x.unwrap_or("<missing>")
                    ));
                }
            }
        }
    }
    panic!(
        "TempluMare layout changed ({} lines compared).\n{}\n\nIf the change is \
         intended, re-bless with:\n  UPDATE_LAYOUT_SNAPSHOT=1 cargo test -p \
         em-core --test layout_snapshot\nand read the diff before committing it.",
        n,
        diffs.join("\n")
    );
}
