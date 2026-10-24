// MICRO-LAB orizzonti · reading by horizons: the member, the overlap rule
// (the same cases as s3Dgraphy's tests/test_lab_orizzonti.py), the marks,
// the reordering, the container routing, the origin of an edge.
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

// ── reordering ───────────────────────────────────────────────────────────────
eq(H.reorderPlan(per, "H2", -1), [["H1", 1], ["H2", 0]], "up swaps two orders");
eq(H.reorderPlan(per, "H1", -1), [], "the first cannot go up");

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
