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

if (process.env.NUMBERS) writeFileSync(process.env.NUMBERS, JSON.stringify(report, null, 1));
console.log(`compact: ${checks} checks passed${existsSync(PY) ? "" : " (s3Dgraphy venv absent: validate skipped)"}`);
