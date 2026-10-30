// MICRO-PROPRIETA-PARADATI (28 Oct 2026, E.D. on dev.82) · the property's
// value, the chain that enters the drawing, the reading that is not the value,
// the paradata admitted inside their group, the extractor always between a
// property and a document, the combiner and «Take from another property».
//
//   node scripts/check-proprieta-paradati.mjs
//
// On a COPY of Templu Mare (TEMPLU=<path>, default /tmp/pdfix/TempluMare_v4.em.json;
// the OneDrive original is only read, never written), unit SU020, group PD_SU020.
// The gestures of the real app (Inspector, Shift+A, screenshots) are in the
// night's probes, s3Dgraphy/.claude/wip/reports/2026-10-28-proprieta-paradati/.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * as chain from "./paradata-chain";
      export { DocumentStore } from "./model";
      export { handleEdgeTypes, existingLinks, linkedItems, handleItems, connectItems, throughExtractor } from "./add-menu";
      export { readFromProperty } from "./property-source";
      export { issues as computeIssues } from "./issues";
      export { buildMatrixScene } from "./views/matrix";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true, format: "esm", write: false,
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
    },
  }],
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const { chain, DocumentStore, handleEdgeTypes, existingLinks, linkedItems, handleItems, connectItems, throughExtractor,
        readFromProperty, buildMatrixScene, computeIssues } = M;

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const ONEDRIVE = `${homedir()}/Library/CloudStorage/OneDrive-CNR/Dottorato Bucarest/14_EM_1.6_lavoro/TempluMare_v2_for_3DR_2026-10-06/EM/TempluMare_v4.em.json`;
const PATH = process.env.TEMPLU ?? (existsSync("/tmp/pdfix/TempluMare_v4.em.json") ? "/tmp/pdfix/TempluMare_v4.em.json" : ONEDRIVE);
if (!existsSync(PATH)) { console.log(`SKIP check-proprieta-paradati: no Templu Mare at ${PATH}`); process.exit(0); }
const RAW = readFileSync(PATH, "utf8");
/** the active graph of the em.json as the document the store holds */
function fresh() {
  const f = JSON.parse(RAW);
  const gid = f.active_graph_id ?? Object.keys(f.graphs)[0];
  const g = f.graphs[gid];
  const layout = f.layout?.[gid] ?? f.layout ?? {};
  return new DocumentStore({ graph: { ...g, id: gid }, layout: layout.positions ? layout : (layout[gid] ?? {}) });
}
let st = fresh();
const by = (name, type) => st.doc.graph.nodes.find((n) => n.name === name && (!type || n.node_type === type))?.id;
const SU = by("SU020", "US"), PD = by("PD_SU020"), D01 = by("D.01", "document");
const propOf = (name) => st.doc.graph.edges.find((e) => e.source === SU && e.edge_type === "has_property" && st.node(e.target)?.name === name)?.target;
ok(SU && PD && D01, "SU020, PD_SU020 and D.01 are in the copy");
const GEOM = propOf("geometry"), CT = propOf("construction_technique");
const hasLayout = !!Object.keys(st.doc.layout?.positions ?? {}).length;

// ── p.1 · the value is read where it truly is ─────────────────────────────────
{
  const p = st.node(CT);
  const onDisk = JSON.parse(RAW).graphs[st.doc.graph.id]?.nodes.find((n) => n.id === CT);
  ok(onDisk && !String(onDisk.description ?? "").trim() && String(onDisk.data.value).startsWith("Rialzo dei muri"),
     "construction_technique has its value in data.value only in the file (the case E.D. saw empty)");
  ok(chain.propertyValue(p).startsWith("Rialzo dei muri"), "propertyValue reads data.value first");
  // MICRO valore-proprietà (E.D., 28 Oct 2026) overturns «reading writes nothing»:
  // opening completes the missing place IN MEMORY, the file changes when saved
  eq(String(p.description ?? ""), String(p.data.value),
     "opening completed the description from data.value, in memory (MICRO valore-proprietà)");
  eq(chain.propertyValue({ node_type: "property", description: "old", data: {} }), "old",
     "a value written only in the description (older files) is still read");
  st.setPropertyValue(CT, "Muro restaurato");
  eq([st.node(CT).description, st.node(CT).data.value], ["Muro restaurato", "Muro restaurato"],
     "a change writes both places, together, as before");
}

// ── p.3 · a geometry's value is its shape, never a reading ────────────────────
{
  st = fresh();
  const g = chain.geometryValueOf(st.doc, GEOM);
  eq([st.node(g.shape)?.name, g.empty, g.stray, g.file], ["Shape for SU020", false, null, "proxies/SU020.glb"],
     "geometry of SU020: its value is the shape «Shape for SU020», its file proxies/SU020.glb");
  const bare = new DocumentStore({ graph: { nodes: [
      { id: "p", node_type: "property", name: "geometry", data: { property_type: "geometry", value: "s" } },
      { id: "s", node_type: "semantic_shape", name: "Shape", data: { convexshapes: [], spheres: [] } }],
    edges: [{ id: "e", source: "p", target: "s", edge_type: "has_semantic_shape" }] } });
  eq(chain.geometryValueOf(bare.doc, "p").empty, true, "a shape with no part and no file is «no value»");
  ok(chain.isGeometryProperty(st.node(GEOM)) && !chain.takesReadingAsValue(st.node(GEOM)),
     "a geometry does not take a reading as its value");
  ok(chain.takesReadingAsValue(st.node(CT)), "…another property does, by the explicit gesture");
  const r = chain.addReading(st, GEOM, { kind: "document", id: D01 });
  st.updateNode(r.extractorId, { data: { result: "height 492.771 m" } });
  eq(chain.resultOf(st.doc, r.extractorId), "height 492.771 m", "the extractor holds the reading");
  eq(chain.propertyValue(st.node(GEOM)), g.shape, "…the geometry's value is untouched by it (nothing copied)");
  eq(chain.useAsValue(st, r.extractorId), null, "«Use as value» refuses a geometry");
  eq(st.node(GEOM).data.value, g.shape, "…and the reference to the shape stays");
  // a reading copied there before (what E.D.'s header said) is shown as stray
  st.updateNode(GEOM, { description: "height 492.771 m", data: { ...st.node(GEOM).data, value: "height 492.771 m" } });
  const g2 = chain.geometryValueOf(st.doc, GEOM);
  eq([g2.shape, g2.stray], [g.shape, "height 492.771 m"], "a reading in the value field is said stray, the shape still found by its edge");
  ok(chain.restoreGeometryValue(st, GEOM), "«Remove it» restores the reference");
  eq([st.node(GEOM).data.value, st.node(GEOM).description], [g.shape, ""], "…data.value = the shape, no copied text");
  // another property: the explicit gesture still works
  const r2 = chain.addReading(st, CT, { kind: "document", id: D01 });
  st.updateNode(r2.extractorId, { data: { result: "due filari" } });
  eq(chain.useAsValue(st, r2.extractorId), CT, "«Use as value» on construction_technique writes it");
  eq(chain.propertyValue(st.node(CT)), "due filari", "…only when asked");
}

// ── p.2 / p.6 · what the Inspector adds enters the Matrix and PD_SU020 ────────
function drawn(doc, id) {
  const layout = { ...doc.layout, folded_groups: (doc.layout?.folded_groups ?? []).filter((g) => g !== PD) };
  const s = buildMatrixScene({ ...doc, layout }, undefined, layout);
  return s ? s.byId.get(id) ?? null : null;
}
if (hasLayout) {
  st = fresh();
  const r = chain.addReading(st, GEOM, { kind: "document", id: D01 });
  ok(st.hasEdge(r.extractorId, PD, "is_in_paradata_nodegroup"), "the new extractor is a member of PD_SU020");
  ok(!st.doc.layout.positions[r.extractorId], "…it has no stored position (nothing is written for the view)");
  const sn = drawn(st.doc, r.extractorId), gb = drawn(st.doc, PD), sib = drawn(st.doc, by("D.12.10"));
  ok(!!sn, "D.01.61 (the extractor of geometry) is drawn in the Matrix");
  ok(sn && gb && sn.x >= gb.x && sn.x + sn.w <= gb.x + gb.w && sn.y >= gb.y && sn.y + sn.h <= gb.y + gb.h,
     "…inside the PD_SU020 box");
  eq([sn?.w, sn?.h], [sib?.w, sib?.h], "…sized as its sibling extractor D.12.10");
  // p.6 · «+ source»: the second source makes the combiner, all of it drawn
  const r2 = chain.addReading(st, CT, { kind: "document", id: D01 });
  ok(r2.combinerCreated && st.hasEdge(CT, r2.combinerCreated, "has_data_provenance"), "+ source: property → combiner");
  ok(st.hasEdge(r2.combinerCreated, r2.extractorId, "combines") && st.hasEdge(r2.combinerCreated, by("D.12.10"), "combines"),
     "…combiner → the two extractors");
  ok(st.hasEdge(r2.extractorId, D01, "extracted_from"), "…extractor → document");
  ok(drawn(st.doc, r2.combinerCreated) && drawn(st.doc, r2.extractorId), "…combiner and new extractor drawn in the Matrix");
  // p.6 · «Take from another property…»: the extractor reads the master property
  const other = st.doc.graph.nodes.find((n) => n.node_type === "property" && n.name === "conservation_state" && n.id !== propOf("conservation_state"));
  const pr = readFromProperty(st, propOf("absolute_time_start"), other.id);
  ok(st.hasEdge(propOf("absolute_time_start"), pr.combinerCreated ?? pr.extractorId, "has_data_provenance"),
     "Take from another property: property → (combiner →) extractor");
  ok(st.hasEdge(pr.extractorId, other.id, "extracted_from") && drawn(st.doc, pr.extractorId), "…extractor → the master, drawn");
}

// ── p.5 · between a property and a document there is always the extractor ────
{
  st = fresh();
  ok(throughExtractor("property", "document"), "property → document goes through an extractor");
  ok(!throughExtractor("extractor", "document") && !throughExtractor("document", "property"), "…only that pair");
  eq(handleEdgeTypes("property", "document", "down"), [], "the handle ↓ of a property offers no direct edge to a document");
  ok(!linkedItems("matrix", "property").some((i) => i.nodeType === "document" && i.edgeType === "has_documentation"),
     "Shift+A on a property: no «Document for X (has documentation)»");
  ok(!handleItems("matrix", "property", "down").some((i) => i.edgeType === "has_documentation"), "…nor in the handle's menu");
  ok(!connectItems("matrix", "property").some((i) => i.edgeType === "has_documentation"), "…nor in the connector's");
  ok(linkedItems("matrix", "property").some((i) => i.nodeType === "extractor" && i.edgeType === "has_data_provenance"),
     "…the extractor is offered");
  const ex = existingLinks(st.doc, GEOM).find((l) => l.nodeId === D01);
  eq([ex?.via, ex?.dir], ["extractor", "out"], "«Link to an existing one…»: D.01 through a new extractor");
  const n0 = st.doc.graph.nodes.length, e0 = st.doc.graph.edges.length;
  ok(chain.nextExtractorNameFor(st.doc, D01).startsWith("D.01."), "the name asked is the rule's, D.01.<NN>");
  const r = chain.extractBetween(st, GEOM, D01, { name: "D.01.61", description: "point on the model, the base's height" });
  eq([st.node(r.extractorId).name, st.node(r.extractorId).description], ["D.01.61", "point on the model, the base's height"],
     "the extractor takes the name and the text given in line");
  ok(st.hasEdge(GEOM, r.extractorId, "has_data_provenance") && st.hasEdge(r.extractorId, D01, "extracted_from"),
     "geometry → D.01.61 → D.01");
  ok(!st.hasEdge(GEOM, D01, "has_documentation"), "no direct property → document edge is born");
  ok(st.hasEdge(r.extractorId, PD, "is_in_paradata_nodegroup"), "…and the extractor is in PD_SU020");
  st.undo();
  eq([st.doc.graph.nodes.length, st.doc.graph.edges.length], [n0, e0], "ONE undo takes all of it back");
  // an existing has_documentation (an old file) is left as it is
  const legacy = st.addEdge(CT, D01, "has_documentation");
  ok(st.doc.graph.edges.includes(legacy), "an old direct edge is still admitted when read (the datamodel is unchanged)");
}

// MICRO-OTTIMIZZA-3 p.4 · the Issues panel: a connection degraded between a
// property and a document (an old yEd line) is cured with the extractor in
// between, never with the `has_documentation` the datamodel still admits
{
  const doc = { graph: { nodes: [{ id: "P", node_type: "property", name: "height" }, { id: "D", node_type: "document", name: "D.09" },
                                 { id: "U", node_type: "US", name: "US1" }], edges: [] } };
  const ran = [];
  const fixers = { retype: () => ran.push("retype"), edgeLabel: (e) => e,
                   viaExtractor: { label: "Through a new extractor", between: throughExtractor, run: (...a) => ran.push(a) } };
  const diag = (s, d) => ({ kind: "degraded", nodeId: s, targetId: d, edgeId: `${s}-${d}`, message: "", candidates: ["has_documentation"], reverse: [] });
  const issues = computeIssues({ doc, nodes: doc.graph.nodes, isUnit: () => false, t: (k) => k, fixers,
                                 diagnostics: [diag("P", "D"), diag("D", "P"), diag("U", "D")] }).filter((i) => i.rule === "datamodel");
  eq(issues.map((i) => i.fix?.kind), ["button", "button", "pick"], "property–document: one button, either way round; another pair keeps its pick");
  ok(issues[0].fix.label === "Through a new extractor" && !JSON.stringify(issues[0].fix).includes("has_documentation"),
     "…the button says the extractor, has_documentation is not offered");
  issues[0].fix.run(); issues[1].fix.run();
  eq(ran, [["P-D", "P", "D"], ["D-P", "P", "D"]], "…and it runs with (edge, property, document)");
}

console.log(`check-proprieta-paradati: ${checks} checks OK (${PATH})`);
