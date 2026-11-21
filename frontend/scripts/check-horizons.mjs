// MICRO-LAB orizzonti · reading by horizons: the member, the overlap rule
// (the same cases as s3Dgraphy's tests/test_lab_orizzonti.py), the marks,
// the order by date (MICRO-SEG16), the container routing, the origin of an edge.
//
//   node scripts/check-horizons.mjs [path/to/em.json with periodizations]
//
// `horizons.ts`, `container.ts`, `filters.ts` are bundled with esbuild and run in node.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false,
                                  loader: { ".json": "json" }, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString("base64")}`);
};
const H = await load("horizons.ts");
const C = await load("container.ts");
C.setPeriodizationsApart(true);   // the member read apart (as for everyone since MICRO-COR11)

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// ── the overlap rule: s3dgraphy.periodization.overlaps, case for case ────────
for (const [iv, h, want, why] of [
  [[100, 200], [150, 400], true, "overlap, not containment"],
  [[100, 200], [200, 400], false, "only touching"],
  [[100, 100], [100, 400], true, "a point on the border"],
  [[100, null], [500, 600], true, "an open end reaches later horizons"],
  [[null, null], [0, 10], false, "undated"],
  [[100, 200], [300, 400], false, "apart"],
]) eq(H.overlaps(iv, h), want, `overlaps: ${why}`);

// ── the member ───────────────────────────────────────────────────────────────
const section = {
  graph_id: "periodizations",
  data: { em_collection: "Periodizations", active_periodization: "PB" },
  nodes: [
    { id: "PA", node_type: "periodization", name: "Secoli" },
    { id: "PB", node_type: "periodization", name: "Grossa", data: { source: "EM-tools CronoFilter" } },
    { id: "H2", node_type: "horizon", name: "Tardo antico", data: { start_time: 235, end_time: 568, color: "#27ae60", order: 1 } },
    { id: "H1", node_type: "horizon", name: "Impero", data: { start_time: -27, end_time: 235, color: "#e67e22", order: 0, enabled: true } },
    { id: "H3", node_type: "horizon", name: "Medioevo", data: { start_time: 568, end_time: 1492, color: "#2980b9", order: 2, enabled: false } },
    { id: "K1", node_type: "horizon", name: "Antico", data: { start_time: -800, end_time: 476, order: 0 } },
    { id: "GONE", node_type: "horizon", name: "removed", data: { order: 9, removed: { ts: "x" } }, removed: { ts: "x" } },
  ],
  edges: [
    { source: "H1", target: "PA", edge_type: "is_in_periodization" },
    { source: "H2", target: "PA", edge_type: "is_in_periodization" },
    { source: "H3", target: "PA", edge_type: "is_in_periodization" },
    { source: "K1", target: "PB", edge_type: "is_in_periodization" },
    { source: "GONE", target: "PA", edge_type: "is_in_periodization" },
  ],
};
ok(H.isPeriodizationsSection(section), "the marker says it is the member");
const read = H.readPeriodizations(section);
eq(read.list.map((p) => p.name), ["Secoli", "Grossa"], "two periodizations");
eq(read.active, "PB", "the file proposes PB");
eq(read.list[0].horizons.map((h) => h.name), ["Impero", "Tardo antico", "Medioevo"], "in order; a tombstone is not there");
eq(read.list[0].horizons[2].enabled, false, "enabled false is read");
eq(read.list[1].source, "EM-tools CronoFilter", "source");

// ── the marks ────────────────────────────────────────────────────────────────
const view = { mode: "colour", periodizationId: "PA", hidden: new Set() };
const per = H.chosenPeriodization(read, view);
eq(per.id, "PA", "the session's choice wins over the file's");
eq(H.chosenPeriodization(read, { ...view, periodizationId: null }).id, "PB", "else the file's");
eq([...H.initialHidden(per)], ["H3"], "a horizon not in use starts hidden");
const intervals = H.intervalsFrom(
  { US1: { start: 600, end: 1400 }, US2: { start: -100, end: 300 }, US9: { start: null, end: null } },
  { EP_R: { start: -100, end: 300 } });
let m = H.horizonMarks(per, view, intervals);
eq(m.inside.get("US2"), ["H1", "H2"], "overlap: US2 is in two horizons");
eq(m.tint.get("US2"), "#e67e22", "the first in order colours it");
eq(m.tint.get("EP_R"), "#e67e22", "an epoch is read by its effective interval");
eq(m.tint.get("US1"), "#2980b9", "US1 in Medioevo");
ok(!m.tint.has("US9") && !m.fade.has("US9"), "undated: neither coloured nor faded");
m = H.horizonMarks(per, { ...view, mode: "filter", hidden: new Set(["H3"]) }, intervals);
ok(m.fade.has("US1") && !m.fade.has("US2"), "filter: outside every visible horizon fades");
ok(!m.fade.has("US9"), "filter: an undated node is never faded");
eq(H.horizonMarks(per, { ...view, mode: "off" }, intervals).tint.size, 0, "off draws nothing");

// ── MICRO-SEG16 · the order is the dates', the file's `order` only a tie ─────
const timeSec = {
  graph_id: "periodizations", data: { em_collection: "Periodizations" },
  nodes: [
    { id: "P", node_type: "periodization", name: "P" },
    // orders that contradict the dates: the dates win
    { id: "A", node_type: "horizon", name: "A", data: { start_time: 0, end_time: 100, order: 2 } },
    { id: "B", node_type: "horizon", name: "B", data: { start_time: 100, end_time: 300, order: 0 } },
    { id: "C", node_type: "horizon", name: "C", data: { start_time: 300, end_time: 700, order: 1 } },
    { id: "D", node_type: "horizon", name: "D", data: { start_time: 700, end_time: 2026, order: 3 } },
  ],
  edges: ["A", "B", "C", "D"].map((x) => ({ source: x, target: "P", edge_type: "is_in_periodization" })),
};
const tp = () => H.readPeriodizations(timeSec).list[0];
eq(tp().horizons.map((h) => h.id), ["A", "B", "C", "D"], "by From, whatever `order` says");
eq(H.horizonChecks(tp()).size, 0, "contiguous horizons: no overlap, no gap");
eq(H.nextInterval(tp()), { start: 2026, end: 2126 }, "«+ Horizon» starts where the last ends");
eq(H.nextInterval(null), { start: 0, end: 100 }, "…and at 0 in an empty periodization");
// an horizon inserted with dates between two existing ones takes its place by itself
timeSec.nodes.push({ id: "E", node_type: "horizon", name: "E", data: { start_time: 150, end_time: 250, order: 4 } });
timeSec.edges.push({ source: "E", target: "P", edge_type: "is_in_periodization" });
eq(tp().horizons.map((h) => h.id), ["A", "B", "E", "C", "D"], "inserted between B and C by its dates");
let ck = H.horizonChecks(tp());
eq(ck.get("E"), [
  { kind: "overlap", other: "B", years: 100, from: 150, to: 250 },
  { kind: "gap", other: "C", years: 50, from: 250, to: 300 },
], "E overlaps B by 100 years and leaves 50 uncovered before C");
eq(ck.get("B"), [{ kind: "overlap", other: "E", years: 100, from: 150, to: 250 }], "the overlap is said on both rows");
// same From: the To decides, then the file's order
timeSec.nodes.push({ id: "F", node_type: "horizon", name: "F", data: { start_time: 0, end_time: 50, order: 9 } });
timeSec.edges.push({ source: "F", target: "P", edge_type: "is_in_periodization" });
eq(tp().horizons.slice(0, 2).map((h) => h.id), ["F", "A"], "same From: the shorter (earlier To) first");
timeSec.nodes.push({ id: "G", node_type: "horizon", name: "G", data: { start_time: 900, end_time: 800, order: 5 } });
timeSec.edges.push({ source: "G", target: "P", edge_type: "is_in_periodization" });
ck = H.horizonChecks(tp());
eq(ck.get("G")[0], { kind: "inverted", from: 900, to: 800 }, "a From after its To is said, not corrected");
ok(!("reorderPlan" in H), "no more ↑ ↓: reorderPlan is gone");

// ── the container: the member is not a study graph, and it is written back ──
const doc = { header: { format: "em.json", version: "1.0" },
  graphs: { G1: { graph_id: "G1", nodes: [], edges: [] }, periodizations: section }, active_graph_id: "G1" };
const parsed = C.parseContainer(doc);
eq(parsed.members.map((x) => x.id), ["G1"], "the member is not a study graph");
ok(parsed.periodizations === section, "it is routed to `periodizations`");
const built = C.buildContainer({ graphs: parsed.members, periodizations: parsed.periodizations, activeGraphId: "G1" });
ok(built.graphs.periodizations === section, "written back under its id");
const without = C.buildContainer({ graphs: parsed.members, activeGraphId: "G1" });
ok(!("periodizations" in without.graphs), "a project without horizons grows no member");

// ── the origin of an edge (connections 1.6.47) ──────────────────────────────
const F = await load("filters.ts");
eq(F.edgeOrigin({ attributes: { origin: "user" } }), "user", "origin user");
eq(F.edgeOrigin({ attributes: { origin: "derived", derived_from: ["p1"] } }), "derived", "origin derived");
eq(F.edgeOrigin({ attributes: { origin: "imported", original_edge_id: "e1" } }), "imported", "origin imported");
eq(F.edgeOrigin({ attributes: { original_edge_id: "e1" } }), "imported", "legacy: GraphML id");
eq(F.edgeOrigin({}), "unmarked", "no mark");

// ── a real file (the GT16 with two periodizations), when given ──────────────
const path = process.argv[2];
if (path) {
  const gt = JSON.parse(readFileSync(path, "utf8"));
  const p = C.parseContainer(gt);
  ok(p.periodizations, "the file carries the member");
  const r = H.readPeriodizations(p.periodizations);
  ok(r.list.length >= 2, `${r.list.length} periodizations`);
  ok(p.members.every((x) => !H.isPeriodizationsSection(x.doc.graph)), "no study graph is the member");
  console.log(`  ${path}: ${r.list.map((x) => `${x.name} (${x.horizons.length})`).join(" · ")}`);
}

console.log(`check-horizons: ${checks} checks green`);
