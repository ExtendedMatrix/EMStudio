// MICRO-MATRIX-FASI (E.D., 6 Nov 2026) · the phases (sub-epochs) in the Matrix.
//
// E.D. on TempluMare_v6 (dev.104) made three phases under «XX sec» — 2015
// (2015–2026), 2013 (2013–2014), Fine XX (1975–2012) — and moved units and
// documents into them. Seen: «XX sec» cut into «X sec»; the phase chip over the
// lane's head; a huge empty mother lane, its nodes squashed in one row at the
// top; bands neither in the order of time nor sized by what they hold; D.40
// moved to «Fine XX» and its property (absolute_time_start 2003) left in «2015».
//
//  1 · the phases inside the mother as the epochs among themselves: in the order
//      of time (newest on top; undated: a name that is a year), each as tall as
//      what it holds plus its head, none over another, the first under the
//      lane's head; the mother as tall as its phases (it shrinks too);
//  2 · what depends only on a node follows it (followers.ts); in the Matrix a
//      property without an epoch is in its owner's phase; a shared one stays;
//  3 · the chips: a document's RMDoc (full / hollow), an epoch's RM count
//      (its phases' included) — rm-chips.ts, and on the scene's lanes/bands.
//
//   node scripts/check-matrix-fasi.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export { buildMatrixScene, newRestackMemo } from "./views/matrix";
      export { followersOf, ownerMap } from "./followers";
      export { documentRmDocs, epochRmCounts } from "./rm-chips";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  logLevel: "silent",
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
    },
  }],
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const N = (id, node_type = "US", name = id, data = {}) => ({ id, node_type, name, data });
const E = (source, edge_type, target) => ({ id: `${source}_${edge_type}_${target}`, source, target, edge_type });
const R = (x, y, w = 90, h = 32) => ({ x, y, w, h });

// ── 2a · followers, pure ──────────────────────────────────────────────────────
{
  const edges = [
    E("D40", "has_first_epoch", "FXX"),
    E("D40", "has_property", "P40"),                 // its own: follows
    E("D40", "has_property", "PSH"), E("U1", "has_property", "PSH"),   // shared: stays
    E("X1", "extracted_from", "D40"),                // read only from D40: follows
    E("X2", "extracted_from", "D40"), E("X2", "extracted_from", "D12"),  // two sources: stays
    E("C1", "combines", "X1"),                       // all its inputs follow: follows
    E("C2", "combines", "X1"), E("C2", "combines", "X2"),  // one input stays: stays
    E("D40", "has_property", "PD"), E("PD", "has_first_epoch", "E15"),  // dated: its own place
  ];
  const f = M.followersOf(edges, "D40");
  eq(f.follow.sort(), ["C1", "P40", "X1"], "D.40's property, its own extractor and their combiner follow it");
  eq(f.shared, ["PSH"], "a property two nodes hold stays, and is named");
  ok(!f.follow.includes("X2") && !f.follow.includes("C2"), "an extractor read from two documents, and a combiner of it, stay");
  ok(!f.follow.includes("PD"), "a node with an epoch of its own never follows");
  const own = M.ownerMap(edges);
  eq([own.get("P40"), own.get("X1"), own.get("C1"), own.get("PSH")], ["D40", "D40", "D40", undefined], "ownerMap agrees");
}

// ── the fixture: XX sec with three phases, II A.D. below ──────────────────────
function templu({ dated = true, lane0H = 2000 } = {}) {
  const ph = (id, name, s, e) => N(id, "EpochNode", name, dated ? { start_time: s, end_time: e } : {});
  return {
    graph: {
      nodes: [
        N("XX", "EpochNode", "XX sec", { start_time: 1801, end_time: 2026 }),
        N("II", "EpochNode", "II A.D.", { start_time: 100, end_time: 199 }),
        // made in this order: 2015 first, then 2013, then Fine XX (E.D.'s)
        ph("E15", "2015", 2015, 2026), ph("E13", "2013", 2013, 2014), ph("FXX", dated ? "Fine XX" : "1975", 1975, 2012),
        N("SU000"), N("SU005"), N("SU006"), N("SU020"), N("USD005"),
        N("D40", "document", "D.40"), N("P40", "property", "absolute_time_start", { value: "2003" }),
        N("D12", "document", "D.12"),
        N("SU002"),
        N("RM15", "representation_model", "Survey2015"), N("RM13", "representation_model", "Survey2013"),
        N("RMII", "representation_model", "Reconstruction"),
        N("RMD", "representation_model_doc", "D.12 in the scene"), N("RES", "resource", "d12.glb"),
        N("RMD2", "representation_model_doc", "D.40 declared"),
      ],
      edges: [
        E("XX", "has_sub_epoch", "E15"), E("XX", "has_sub_epoch", "E13"), E("XX", "has_sub_epoch", "FXX"),
        E("SU000", "has_first_epoch", "E15"), E("USD005", "has_first_epoch", "E15"),
        E("SU005", "has_first_epoch", "E13"), E("SU006", "has_first_epoch", "E13"),
        E("SU020", "has_first_epoch", "FXX"), E("D40", "has_first_epoch", "FXX"),
        E("D40", "has_property", "P40"), E("D12", "has_first_epoch", "E15"),
        E("SU002", "has_first_epoch", "II"),
        E("E15", "has_representation_model", "RM15"), E("E13", "has_representation_model", "RM13"),
        E("XX", "has_representation_model", "RM15"), E("II", "has_representation_model", "RMII"),
        E("D12", "has_representation_model_doc", "RMD"), E("RMD", "has_linked_resource", "RES"),
        E("D40", "has_representation_model_doc", "RMD2"),
      ],
    },
    layout: {
      // the archival layout drew XX sec for its units before the phases: tall
      swimlanes: [
        { epoch_id: "XX", y: 0, height: lane0H },
        { epoch_id: "II", y: lane0H, height: 200 },
      ],
      positions: {
        // everything squashed in one row at the top of the lane
        SU000: R(100, 20), USD005: R(220, 20), SU005: R(340, 20), SU006: R(460, 20),
        SU020: R(580, 20), D40: R(700, 20, 30, 40),
        // the property where it was when D.40 was in «2015»: far away
        P40: R(700, 1500, 90, 32), D12: R(820, 20, 30, 40),
        SU002: R(100, lane0H + 60),
      },
    },
  };
}
const build = (doc, memo = M.newRestackMemo(), key = "k") =>
  M.buildMatrixScene(doc, undefined, undefined, new Set(["XX"]), new Set(), memo, key);
const bandsOf = (s) => s.subBands.filter((b) => b.laneId === "XX");
const bandOfNode = (s, id) => {
  const n = s.byId.get(id), cy = n.y + n.h / 2;
  return bandsOf(s).find((b) => cy >= b.y && cy <= b.y + b.height)?.phaseId ?? null;
};
function layoutHolds(s, what) {
  const bands = bandsOf(s);
  const lane = s.lanes.find((l) => l.id === "XX");
  eq(bands.map((b) => b.label), ["2015", "2013", what === "undated" ? "1975" : "Fine XX"], `${what}: the phases in the order of time, newest on top`);
  ok(bands[0].y >= lane.y + 58, `${what}: the first phase starts under the lane's head (${bands[0].y - lane.y} ≥ 58)`);
  for (let i = 1; i < bands.length; i++)
    ok(bands[i].y >= bands[i - 1].y + bands[i - 1].height, `${what}: «${bands[i].label}» is not over «${bands[i - 1].label}»`);
  eq(["SU000", "USD005", "D12"].map((id) => bandOfNode(s, id)), ["E15", "E15", "E15"], `${what}: 2015's units in 2015`);
  eq(["SU005", "SU006"].map((id) => bandOfNode(s, id)), ["E13", "E13"], `${what}: the 2013 soundings in 2013`);
  eq(["SU020", "D40"].map((id) => bandOfNode(s, id)), ["FXX", "FXX"], `${what}: Fine XX's in Fine XX`);
  eq(bandOfNode(s, "P40"), "FXX", `${what}: D.40's property is in D.40's phase`);
  for (const b of bands) {
    const ns = s.nodes.filter((n) => bandOfNode(s, n.id) === b.phaseId);
    if (!ns.length) continue;
    const top = Math.min(...ns.map((n) => n.y));
    ok(top - b.y >= 30, `${what}: «${b.label}»'s nodes start under its chip (${(top - b.y).toFixed(0)} px)`);
  }
  const last = bands[bands.length - 1];
  ok(lane.height < 1000, `${what}: the mother is as tall as its phases (${lane.height.toFixed(0)} px, the archive said 2000)`);
  ok(lane.y + lane.height >= last.y + last.height, `${what}: …and holds the last of them`);
  const ii = s.lanes.find((l) => l.id === "II");
  ok(Math.abs(ii.y - (lane.y + lane.height)) < 1, `${what}: the next epoch starts where the mother ends`);
  ok(s.byId.get("SU002").y >= ii.y, `${what}: the next epoch's units moved up with it`);
}

// ── 1 · layout with dates, then undated (names that are years) ───────────────
layoutHolds(build(templu()), "dated");
layoutHolds(build(templu({ dated: false })), "undated");

// ── 1b · the remembered re-stack gives way when the bands change ─────────────
{
  const doc = templu();
  const memo = M.newRestackMemo();
  build(doc, memo, "k");
  // SU005 moved to 2015 and SU020 to 2013 (the graph changes, the key does not)
  doc.graph.edges = doc.graph.edges.filter((e) => !(e.source === "SU005" && e.edge_type === "has_first_epoch")
                                                && !(e.source === "SU020" && e.edge_type === "has_first_epoch"));
  doc.graph.edges.push(E("SU005", "has_first_epoch", "E15"), E("SU020", "has_first_epoch", "E13"));
  const s = build(doc, memo, "k");
  eq([bandOfNode(s, "SU005"), bandOfNode(s, "SU020")], ["E15", "E13"], "a unit moved to another phase is drawn there at once");
  const bands = bandsOf(s);
  for (let i = 1; i < bands.length; i++)
    ok(bands[i].y >= bands[i - 1].y + bands[i - 1].height, `after the move «${bands[i].label}» is not over «${bands[i - 1].label}»`);
  // and a nudge inside a band still stays put (the memo is still a memo)
  const before = s.byId.get("SU000").y;
  doc.layout.positions.SU000.y += 3;
  const s2 = build(doc, memo, "k");
  ok(Math.abs(s2.byId.get("SU000").y - before - 3) < 0.01, "a 3 px nudge inside its band is kept (no re-flow)");
}

// ── 1c · an empty phase is a head of its own, not a box over its neighbours ──
{
  const doc = templu();
  doc.graph.edges = doc.graph.edges.filter((e) => e.target !== "E13" || e.edge_type !== "has_first_epoch");
  doc.graph.edges.push(E("SU005", "has_first_epoch", "E15"), E("SU006", "has_first_epoch", "E15"));
  const s = build(doc);
  const b13 = bandsOf(s).find((b) => b.phaseId === "E13");
  ok(b13 && b13.height >= 34, `the empty «2013» keeps a head tall enough for its name and dates (${b13?.height})`);
  const bands = bandsOf(s);
  for (let i = 1; i < bands.length; i++)
    ok(bands[i].y >= bands[i - 1].y + bands[i - 1].height, `with 2013 empty «${bands[i].label}» is not over «${bands[i - 1].label}»`);
}

// ── 1d · a phase whose nodes sit at the two ends of the old lane closes up ───
{
  // the em-core view layout of TempluMare_v7: the documents at the top, the
  // phase's units at the old phase lane's height, 1800 px below
  const doc = templu();
  doc.layout.positions.SU000 = R(100, 1800);
  doc.layout.positions.USD005 = R(220, 1810);
  const s = build(doc);
  const b15 = bandsOf(s).find((b) => b.phaseId === "E15");
  ok(b15.height < 200, `«2015» is as tall as what it holds, not the void between (${b15.height.toFixed(0)} px)`);
  const d12 = s.byId.get("D12"), su = s.byId.get("SU000");
  ok(su.y > d12.y, "…and its blocks keep their order (the document above, the units below)");
  eq([bandOfNode(s, "SU000"), bandOfNode(s, "D12")], ["E15", "E15"], "…both in 2015");
}

// ── 2b · a property shared by two nodes stays in its place's phase ───────────
{
  const doc = templu();
  doc.graph.nodes.push(N("PSH", "property", "shared"));
  doc.graph.edges.push(E("D40", "has_property", "PSH"), E("SU000", "has_property", "PSH"));
  doc.layout.positions.PSH = R(940, 20);
  const s = build(doc);
  ok(bandOfNode(s, "PSH") != null, "a shared property is drawn in a band all the same");
}

// ── 3 · the chips ─────────────────────────────────────────────────────────────
{
  const doc = templu();
  const rd = M.documentRmDocs(doc);
  eq(rd.get("D12"), { rm: "RMD", full: true }, "D.12's RMDoc has a file: a full chip");
  eq(rd.get("D40"), { rm: "RMD2", full: false }, "D.40's RMDoc is declared without a file: hollow");
  ok(!rd.has("SU000"), "a unit has no RMDoc chip");
  // a document with the old `has_representation_model` (Templu Mare's surveys)
  doc.graph.nodes.push(N("D09", "document", "D.09"), N("RM09", "representation_model", "tempio_1_BAKE"), N("R09", "resource"));
  doc.graph.edges.push(E("D09", "has_representation_model", "RM09"), E("RM09", "has_linked_resource", "R09"));
  eq(M.documentRmDocs(doc).get("D09"), { rm: "RM09", full: true }, "a document's old representation_model is its RMDoc");
  const rc = M.epochRmCounts(doc);
  eq([rc.get("E15"), rc.get("E13"), rc.get("FXX"), rc.get("XX"), rc.get("II")], [1, 1, undefined, 2, 1],
     "RM per epoch: a phase its own, the mother all of its phases' (a model counted once)");
  ok(![...rc.keys()].some((k) => k === "RMD"), "an RMDoc is not counted as an epoch's RM");
  const s = build(doc);
  eq(s.lanes.map((l) => [l.id, l.rmCount ?? 0]), [["XX", 2], ["II", 1]], "the lanes carry their RM count");
  eq(bandsOf(s).map((b) => [b.phaseId, b.rmCount ?? 0]), [["E15", 1], ["E13", 1], ["FXX", 0]], "…and the phases theirs");
}

console.log(`check-matrix-fasi: ${checks} checks passed`);
