// PROPRIETA · executable check of MICRO-PROPRIETA-COMPATTA: the circle of
// `has_property`, the thread the group carries, «Compact the properties»,
// «Dissolve the group», the warning of a property with more than one owner and
// «Duplicate for each owner».
//
//   node scripts/check-compact.mjs [room.em.json]
//
// The pure pieces are bundled with the project's esbuild and run in node on the
// fixture written for this (`testdata/proprieta.em.json`, made by
// `make-proprieta-fixture.mjs`) and, when a file is given, on a room's em.json
// (templu-mare-v2). s3Dgraphy's `api.validate` judges the result when its venv
// is there. NUMBERS=<file> writes the before/after numbers as JSON.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

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
      export * as C from "./compact";
      export { DocumentStore } from "./model";
      export { edgeCircle, defaultVisibleCircles, TEMPLATES } from "./filters";
      export { issues } from "./issues";
      export { buildMatrixScene } from "./views/matrix";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
    },
  }],
});
const M = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const { C, DocumentStore, edgeCircle, defaultVisibleCircles, TEMPLATES, issues } = M;

const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
/** s3Dgraphy's `api.validate` on a document: issues + paradata_group_incoherences */
function validate(doc) {
  if (!existsSync(PY)) return null;
  const script = `
import json,sys
from s3dgraphy import api
from s3dgraphy.diagnostics import paradata_group_incoherences
g, w = api.load_emjson(json.loads(sys.stdin.read()))
v = api.validate(g)
print(json.dumps({"ok": v["ok"], "issues": v["issues"], "incoherences": len(paradata_group_incoherences(g))}))`;
  return JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify(doc), maxBuffer: 1 << 28,
    env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
}

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};
const undoDepth = (st) => st.undoStack.length;
const E = (st, type) => st.doc.graph.edges.filter((e) => e.edge_type === type);
const member = (st, id, g) => st.hasEdge(id, g, "is_in_paradata_nodegroup");
const graphOf = (st) => JSON.stringify(st.doc.graph);

/** the numbers of the MICRO: direct properties, groups, duplicates, instances */
function numbers(st) {
  const doc = st.doc;
  const nodes = doc.graph.nodes;
  const ty = new Map(nodes.map((n) => [n.id, n.node_type]));
  const unitGroup = new Map();
  for (const e of doc.graph.edges)
    if (e.edge_type === "has_paradata_nodegroup" && ty.get(e.source) !== "EpochNode") unitGroup.set(e.source, e.target);
  let direct = 0, grouped = 0;
  for (const e of doc.graph.edges) {
    if (e.edge_type !== "has_property" || ty.get(e.target) !== "property") continue;
    if ((e.attributes ?? {}).inherited) continue;
    const g = unitGroup.get(e.source);
    if (g && member(st, e.target, g)) grouped++; else direct++;
  }
  return {
    nodes: nodes.length, edges: doc.graph.edges.length,
    properties: nodes.filter((n) => n.node_type === "property").length,
    direct_properties: direct, grouped_properties: grouped,
    unit_groups: unitGroup.size,
    paradata_groups: nodes.filter((n) => n.node_type === "ParadataNodeGroup").length,
    combiners: nodes.filter((n) => n.node_type === "combiner").length,
    extractors: nodes.filter((n) => n.node_type === "extractor").length,
    documents: nodes.filter((n) => n.node_type === "document").length,
    undeclared_owners: C.undeclaredOwners(doc).length,
  };
}

/** the scene the Matrix draws with its default circles, the carried threads
 *  left out as `filteredView` does */
function matrixEdges(st) {
  const visible = defaultVisibleCircles("matrix");
  const carried = C.carriedPropertyEdges(st.doc);
  return st.doc.graph.edges.filter((e) => {
    const c = edgeCircle(e.edge_type);
    if (c && !visible.has(c)) return false;
    return !(e.edge_type === "has_property" && carried.has(C.drawnEdgeKey(e)));
  });
}
const drawn = (st, s, t) => matrixEdges(st).some((e) => e.edge_type === "has_property" && e.source === s && e.target === t);

// ── Parte 1 · the circle of an edge is decided by its arrival ────────────────
{
  eq(edgeCircle("has_property"), "edges_paradata", "has_property is a paradata edge (was edges_other)");
  eq(edgeCircle("has_paradata_nodegroup"), "edges_paradata", "has_paradata_nodegroup stays paradata (the BUGS-UI case)");
  eq(edgeCircle("has_first_epoch"), "edges_other", "has_first_epoch stays an epoch edge (a PDG is only a SOURCE)");
  eq(edgeCircle("has_data_provenance"), "edges_paradata", "has_data_provenance stays paradata");
  eq(edgeCircle("extracted_from"), "edges_paradata", "extracted_from stays paradata (mixed target, by the ParadataNode rule)");
  ok(defaultVisibleCircles("matrix").has("edges_paradata"), "the Matrix shows paradata edges by default");
  ok(TEMPLATES.find((x) => x.key === "em-complete").circles.includes("edges_paradata"), "…and «EM complete» too");
}

const FIXTURE = new URL("../testdata/proprieta.em.json", import.meta.url);
const fresh = () => new DocumentStore(JSON.parse(readFileSync(FIXTURE, "utf8")));
const report = {};

// ── Parte 1 · threads on the fixture ─────────────────────────────────────────
{
  const st = fresh();
  for (const p of ["P1A", "P1B", "P1C"]) ok(drawn(st, "US1", p), `US1 → ${p}: the direct property has its thread`);
  ok(!drawn(st, "US2", "P2A"), "US2 → P2A (inside PD_US2): no second thread, the group carries it");
  ok(st.hasEdge("US2", "P2A", "has_property"), "…and the edge is still in the graph");
  ok(drawn(st, "US2", "P2B"), "US2 → P2B (direct) has its thread");
  ok(drawn(st, "USV10", "P1A"), "USV10 → P1A, the declared heir: its (dashed) thread is drawn");
}

// ── Parte 2 · «Compact the properties» on the whole fixture ──────────────────
{
  const st = fresh();
  const start = graphOf(st);
  const before = numbers(st);
  const v0 = validate(st.doc);
  const d0 = undoDepth(st);
  const ops = [];
  st.onOp((op) => ops.push(op));
  const r = C.compactProperties(st);
  eq(undoDepth(st) - d0, 1, "Compact is ONE undo step");
  eq(r.skipped.map((x) => [x.property, x.owners]), [["P_MULTI", ["US1", "US3"]]],
     "the property with two undeclared owners is left out, and said");
  eq(r.units, 2, "two units compacted (US1, US2); US3 has only P_MULTI, USV10 only an inheritance");
  eq(r.groupsCreated, 1, "one group made (PD_US1); PD_US2 was there");
  eq(r.instances, 0, "no document instance written (no form for it in the graph — see the report)");
  const g1 = st.paradataGroupOf("US1");
  eq(st.node(g1).name, "PD_US1", "the new group is PD_US1, joined by has_paradata_nodegroup");
  for (const p of ["P1A", "P1B", "P1C"]) ok(member(st, p, g1), `${p} is in PD_US1`);
  for (const x of ["C1", "E1", "E2", "E3"]) ok(member(st, x, g1), `${x} (first collected by US1) is in PD_US1, the original`);
  ok(member(st, "P2A", "PDG2") && member(st, "P2B", "PDG2"), "US2's two properties are in PD_US2");
  eq(r.duplicates, 4, "four copies for PD_US2: the shared extractor (D.01.02), the shared combiner and its two extractors");
  const provP2A = E(st, "has_data_provenance").filter((e) => e.source === "P2A").map((e) => e.target);
  ok(provP2A.length === 1 && provP2A[0] !== "E3" && member(st, provP2A[0], "PDG2"), "P2A now reads a copy of D.01.02, in PD_US2");
  const e3c = st.node(provP2A[0]);
  eq([e3c.description, e3c.name], ["pianta rettangolare", "D.01.03"], "the copy has the same data and the next name of D.01");
  ok(st.hasEdge(e3c.id, "D.01", "extracted_from"), "…and reads the same master document");
  const provP2B = E(st, "has_data_provenance").filter((e) => e.source === "P2B").map((e) => e.target);
  const c1c = provP2B[0];
  ok(c1c !== "C1" && st.node(c1c).node_type === "combiner" && member(st, c1c, "PDG2"), "P2B reads a copy of the combiner, in PD_US2");
  const under = E(st, "combines").filter((e) => e.source === c1c).map((e) => e.target);
  ok(under.length === 2 && under.every((x) => !["E1", "E2"].includes(x) && member(st, x, "PDG2")),
     "the combiner's copy combines copies of its two extractors, in PD_US2");
  ok(!E(st, "has_data_provenance").some((e) => e.source === "P1A" && e.target !== "C1"), "US1's chain is untouched");
  for (const d of ["D.01", "D.02"]) ok(!st.doc.graph.edges.some((e) => e.source === d && e.edge_type === "is_in_paradata_nodegroup"),
     `${d} stays out of the groups (documents: no instance form)`);
  ok(st.hasEdge("D.01", "EP_ROM", "has_first_epoch"), "the master stays in its epoch");
  ok(!member(st, "P_MULTI", g1), "P_MULTI stays direct");
  eq(st.doc.layout.folded_groups.filter((g) => [g1, "PDG2"].includes(g)).sort(), [g1, "PDG2"].sort(), "the groups touched are closed");
  // the threads after
  for (const p of ["P1A", "P1B", "P1C"]) ok(!drawn(st, "US1", p), `US1 → ${p}: carried by the group now`);
  ok(drawn(st, "USV10", "P1A"), "the heir keeps its thread");
  ok(drawn(st, "US1", "P_MULTI") && drawn(st, "US3", "P_MULTI"), "the two-owner property keeps both threads");
  // the badge
  const badges = C.propertyBadges(st.doc);
  eq(badges.get("US1"), { group: g1, count: 3 }, "US1's badge: PD_US1, 3 properties");
  eq(badges.get("US2"), { group: "PDG2", count: 2 }, "US2's badge: PD_US2, 2 properties");
  ok(!badges.has("US3") && !badges.has("USV10"), "no badge without a group");
  // ops: what the room receives — every change, in one burst
  ok(ops.length > 0 && ops.every((o) => ["add_node", "add_edge", "delete_edge", "update_node"].includes(o.op)),
     `the room receives the command as ${ops.length} ops of the closed vocabulary`);
  // s3Dgraphy
  const v1 = validate(st.doc);
  if (v1) {
    eq(v1.incoherences, 0, "no paradata_group_incoherences after Compact");
    eq(v1.issues.filter((x) => !v0.issues.includes(x)), [], "s3Dgraphy validate: no new issue");
  }
  // round trip em.json → EMStudio → em.json
  const once = st.toJSON();
  const again = new DocumentStore(JSON.parse(once)).toJSON();
  eq(again, once, "em.json → EMStudio → em.json is stable after Compact");
  // undo / redo
  st.undo();
  eq(graphOf(st), start, "undo gives the graph back as it was, in one step");
  st.redo();
  // dissolve
  const d1 = undoDepth(st);
  const dr = C.dissolveGroups(st, ["US1", "US2"]);
  eq(undoDepth(st) - d1, 1, "Dissolve is ONE undo step");
  eq([dr.units, dr.groupsRemoved], [2, 2], "both groups dissolved and removed (left empty)");
  ok(!st.paradataGroupOf("US1") && !st.paradataGroupOf("US2"), "no group left on US1 / US2");
  for (const p of ["P1A", "P1B", "P1C", "P2A", "P2B"]) ok(drawn(st, p.startsWith("P1") ? "US1" : "US2", p), `${p} is direct again`);
  // back to the start but for the copies (and their rewiring) and PD_US2,
  // which held P2A before and goes with the dissolve
  const s0 = JSON.parse(start);
  const ids0 = new Set(s0.nodes.map((n) => n.id));
  eq(st.doc.graph.nodes.filter((n) => !ids0.has(n.id)).map((n) => n.node_type).sort(),
     ["combiner", "extractor", "extractor", "extractor"], "after Compact + Dissolve the new nodes are the four copies");
  eq(s0.nodes.filter((n) => !st.node(n.id)).map((n) => n.id), ["PDG2"], "…and the only node gone is PD_US2 (it held P2A before)");
  const v2 = validate(st.doc);
  if (v2) eq(v2.issues.filter((x) => !v0.issues.includes(x)), [], "s3Dgraphy validate after Dissolve: no new issue");
  report.fixture = { before, after_compact: numbers((() => { const x = fresh(); C.compactProperties(x); return x; })()),
                     after_dissolve: numbers(st), result: { ...r, skipped: r.skipped.length } };
}

// ── Compact on a selection, then on the rest: the same final shape ───────────
{
  const st = fresh();
  C.compactProperties(st, ["US2"]);
  ok(member(st, "C1", "PDG2") && member(st, "E3", "PDG2"), "US2 alone: the shared elements go to the first group, PD_US2");
  C.compactProperties(st, ["US1"]);
  const g1 = st.paradataGroupOf("US1");
  ok(!member(st, "C1", g1) && !member(st, "E3", g1), "then US1 gets copies, the originals stay in PD_US2");
  const v = validate(st.doc);
  if (v) eq(v.incoherences, 0, "no paradata_group_incoherences either way");
}

// ── Parte 3 · the warning, and «Duplicate for each owner» ────────────────────
{
  const st = fresh();
  const t = (k, v) => `${k}${JSON.stringify(v ?? {})}`;
  const rows = () => issues({ doc: st.doc, nodes: st.liveNodes(), isUnit: () => true, t,
                              sharedOwners: C.undeclaredOwners(st.doc),
                              duplicateForOwners: { label: "dup", run: (id) => C.duplicateForEachOwner(st, id) } })
    .filter((i) => i.rule === "owners");
  const w = rows();
  eq(w.length, 1, "one warning: the property with two owners");
  ok(w[0].node === "P_MULTI" && w[0].txt.includes("US1, US3"), "…on P_MULTI, naming both owners");
  ok(!rows().some((i) => i.node === "P1A"), "the declared heir (USV10 → P1A) is no warning");
  const d0 = undoDepth(st);
  w[0].fix.run();
  eq(undoDepth(st) - d0, 1, "Duplicate for each owner is ONE undo step");
  eq(rows().length, 0, "after Duplicate: no warning");
  const p3 = E(st, "has_property").filter((e) => e.source === "US3").map((e) => e.target);
  ok(p3.length === 1 && p3[0] !== "P_MULTI", "US3 owns a copy, US1 keeps the node");
  ok(st.hasEdge("US1", "P_MULTI", "has_property"), "US1 → P_MULTI is still there");
  eq(st.node(p3[0]).description, st.node("P_MULTI").description, "two properties with the same value");
  const ch = (p) => E(st, "has_data_provenance").filter((e) => e.source === p).map((e) => e.target);
  ok(ch("P_MULTI")[0] === "E4" && ch(p3[0]).length === 1 && ch(p3[0])[0] !== "E4", "…and distinct chains");
  ok(st.hasEdge(ch(p3[0])[0], "D.02", "extracted_from"), "the copied extractor reads the same document");
  const v = validate(st.doc);
  if (v) eq(v.incoherences, 0, "no paradata_group_incoherences after Duplicate");
  // and now nothing is skipped
  eq(C.compactProperties(st).skipped, [], "after Duplicate, Compact skips nothing");
}

// ── a room: templu-mare-v2 ───────────────────────────────────────────────────
const ROOM = process.argv[2];
if (ROOM) {
  const raw = JSON.parse(readFileSync(ROOM, "utf8"));
  const single = raw.graph ? raw : { header: raw.header, graph: Array.isArray(raw.graphs) ? raw.graphs[0] : Object.values(raw.graphs)[0], layout: raw.layout };
  const st = new DocumentStore(JSON.parse(JSON.stringify(single)));
  const start = graphOf(st);
  const before = numbers(st);
  const v0 = validate(st.doc);
  const t0 = performance.now();
  const r = C.compactProperties(st);
  const ms = performance.now() - t0;
  const after = numbers(st);
  const v1 = validate(st.doc);
  ok(r.units > 0, `templu-mare-v2: ${r.units} units compacted in ${ms.toFixed(0)} ms`);
  if (v1) {
    eq(v1.incoherences, 0, "templu-mare-v2: no paradata_group_incoherences after Compact");
    eq(v1.issues.filter((x) => !v0.issues.includes(x)), [], "templu-mare-v2: s3Dgraphy validate, no new issue");
  }
  const once = st.toJSON();
  eq(new DocumentStore(JSON.parse(once)).toJSON(), once, "templu-mare-v2: em.json → EMStudio → em.json stable");
  const units = Object.keys(Object.fromEntries(C.propertyBadges(st.doc)));
  const dr = C.dissolveGroups(st, units);
  const back = numbers(st);
  st.undo();
  st.undo();
  eq(graphOf(st), start, "templu-mare-v2: two undos (Dissolve, Compact) give the start back");
  report.room = { file: ROOM, before, after_compact: after, after_dissolve: back,
                  compact: { ...r, skipped: r.skipped }, dissolve: dr, ms: Math.round(ms),
                  validate_before: v0 && { ok: v0.ok, issues: v0.issues.length, incoherences: v0.incoherences },
                  validate_after: v1 && { ok: v1.ok, issues: v1.issues.length, incoherences: v1.incoherences } };
}

if (process.env.NUMBERS) writeFileSync(process.env.NUMBERS, JSON.stringify(report, null, 1));
console.log(`compact: ${checks} checks passed${existsSync(PY) ? "" : " (s3Dgraphy venv absent: validate skipped)"}`);
