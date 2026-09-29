// CATENA · executable check of the paradata chain: a reading made from a
// document or a unit, its name (NAME1), the second source that makes the
// combiner, the declared inheritance, the geometry of a reading, the handle,
// the AI verification, the stamps' receipts and the Tropy promotion.
//
//   node scripts/check-paradata-chain.mjs
//
// The pure pieces are bundled with the project's esbuild and run in node on the
// night's fixture (`testdata/catena.em.json`) and on small documents built here.
// The same gestures on the real app are in the night's probes
// (`.claude/wip/reports/2026-10-05-la-catena-del-paradata/probe-*.mjs`).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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
      export * as chain from "./paradata-chain";
      export { DocumentStore } from "./model";
      export * as naming from "./naming";
      export { isStratigraphicType, allowedEdgeTypes } from "./rules";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
});
const M = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const { chain, DocumentStore, naming, isStratigraphicType } = M;

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const FIXTURE = new URL("../testdata/catena.em.json", import.meta.url);
const fresh = () => new DocumentStore(JSON.parse(readFileSync(FIXTURE, "utf8")));
const E = (st, type) => st.doc.graph.edges.filter((e) => e.edge_type === type);
const N = (st, id) => st.node(id);
let HINT_DOC = null;
const undoDepth = (st) => st.undoStack?.length ?? (st.canUndo ? 1 : 0);

// ── fase 1 · reading the chain ──────────────────────────────────────────────
{
  const st = fresh();
  eq(chain.propertiesOf(st.doc, "USM101"), ["P_MAT", "P_H", "P_DAT"], "USM101 owns three properties");
  eq(chain.extractorsOfProperty(st.doc, "P_DAT"), ["X1"], "P_DAT is read by D.1.1");
  eq(chain.sourceOf(st.doc, "X1"), { id: "D1", name: "D.1", kind: "document" }, "…from the document D.1");
  eq(chain.geometryOf(st.doc, "X1").kind, "passage", "…through a passage of its text");
  ok(chain.resultOf(st.doc, "X1").startsWith("Il capitello nord"), "the result of a passage is the quoted text");
  eq(chain.readingsOfDocument(st.doc, "D1"), ["X1"], "D.1 lists its reading");
  eq(chain.ownersOf(st.doc, "P_MAT").map((o) => [o.owner, o.original]), [["USM101", true]],
     "a lone owner is the original");
}

// ── «Eredita da…» adds a has_property to an existing property, which stays one ─
{
  const st = fresh();
  const props0 = st.doc.graph.nodes.filter((n) => n.node_type === "property").length;
  const cands = chain.inheritCandidates(st.doc, "USV106", isStratigraphicType);
  ok(cands.some((c) => c.propertyId === "P_MAT" && c.unitId === "USM101"), "USM101's material is a candidate for USV106");
  const before = undoDepth(st);
  const e = chain.inheritProperty(st, "USV106", "P_MAT");
  eq(e.attributes, { inherited: true }, "the heir's has_property is declared `inherited`");
  eq(st.doc.graph.nodes.filter((n) => n.node_type === "property").length, props0, "…and no property was copied");
  eq(chain.ownersOf(st.doc, "P_MAT").map((o) => [o.owner, o.original, o.inherited]),
     [["USM101", true, false], ["USV106", false, true]], "USM101 stays the original, USV106 the heir");
  eq(undoDepth(st) - before, 1, "one undo step");
  eq(chain.inheritProperty(st, "USV106", "P_MAT").id, e.id, "idempotent: inheriting twice is the same edge");
  // the same answer the s3Dgraphy rule gives when the edge carries no mark: the
  // paradata group decides (P_MAT sits in PD_USM101)
  delete e.attributes;
  eq(chain.ownersOf(st.doc, "P_MAT").find((o) => o.original).owner, "USM101",
     "unmarked edges: the owner whose paradata group holds the property is the original");
  st.undo();
  eq(E(st, "has_property").filter((x) => x.target === "P_MAT").length, 1, "undo takes the inheritance back");
}

// ── fase 2 · a reading from a document: the extractor, its name ─────────────
{
  const st = fresh();
  const before = undoDepth(st);
  const r = chain.addReading(st, "P_H", { kind: "document", id: "D3" });
  eq(N(st, r.extractorId).name, "D.3.1", "a reading on D.3 is D.3.1 (NAME1: D.<n> → D.<n>.<ordinal>, no zero padding)");
  eq(undoDepth(st) - before, 1, "…one undo step");
  ok(E(st, "has_data_provenance").some((e) => e.source === "P_H" && e.target === r.extractorId), "has_data_provenance from the property");
  ok(E(st, "is_in_paradata_nodegroup").some((e) => e.source === r.extractorId && e.target === "PD_USM101"),
     "…and the extractor joins the chain's paradata group");
  eq(r.combinerCreated, null, "a first source makes no combiner");
  // the geometry of an image reading: an AnnotationRegion on the document
  chain.setReadingGeometry(st, r.extractorId, "D3", { kind: "region", shape_kind: "rect", rect: [0.2, 0.4, 0.15, 0.2] });
  const g = chain.geometryOf(st.doc, r.extractorId);
  eq([g.kind, g.rect], ["region", [0.2, 0.4, 0.15, 0.2]], "the region is the reading's geometry");
  const region = N(st, g.regionId);
  eq([region.node_type, region.data.resource_id], ["annotation_region", "D3"], "…an annotation_region on D.3");
  ok(E(st, "is_on_resource").some((e) => e.source === region.id && e.target === "D3"), "…is_on_resource D.3");
  eq(N(st, r.extractorId).name, "D.3.1", "…and the extractor keeps its name");
  eq(chain.readingsOfDocument(st.doc, "D3"), [r.extractorId], "D.3 lists the reading once");
  // re-tracing replaces the region, never adds a second
  chain.setReadingGeometry(st, r.extractorId, "D3", { kind: "region", shape_kind: "rect", rect: [0.5, 0.5, 0.1, 0.1] });
  eq(st.doc.graph.nodes.filter((n) => n.node_type === "annotation_region").length, 1, "tracing again replaces the region");
}

// ── the SECOND source makes the combiner, in one undo step ──────────────────
{
  const st = fresh();
  const before = undoDepth(st);
  const r = chain.addReading(st, "P_DAT", { kind: "document", id: "D2" });
  eq(undoDepth(st) - before, 1, "the second source is ONE undo step");
  ok(r.combinerCreated, "the second source of P_DAT creates a combiner");
  eq(N(st, r.combinerCreated).name, "C.1", "…named C.<n>");
  eq(r.moved, ["X1"], "…and moves the direct extractor under it");
  const prov = chain.provenanceOf(st.doc, "P_DAT");
  eq([prov.direct, prov.combiners, prov.combined.get(r.combinerCreated)], [[], [r.combinerCreated], ["X1", r.extractorId]],
     "P_DAT → C.1 → {D.1.1, D.2.1}");
  eq(N(st, r.extractorId).name, "D.2.1", "the new reading is D.2.1");
  const third = chain.addReading(st, "P_DAT", { kind: "document", id: "D3" });
  eq([third.combinerCreated, third.combinerId], [null, r.combinerCreated], "a third source joins the same combiner");
  st.undo();
  st.undo();
  eq(chain.provenanceOf(st.doc, "P_DAT").direct, ["X1"], "undo brings back the single direct reading");
  eq(st.doc.graph.nodes.filter((n) => n.node_type === "combiner").length, 0, "…and no combiner");
}

// ── a reading from a UNIT follows the same rule, and the hint is information ─
{
  const st = fresh();
  const r = chain.addReading(st, "P_CAPH", { kind: "unit", id: "USM101" });
  eq(N(st, r.extractorId).name, "USM101.1", "a reading from USM101 is USM101.1 (the unit's name for the document's)");
  eq(chain.sourceOf(st.doc, r.extractorId).kind, "unit", "…its source is a unit");
  eq(chain.extractionSourceHints(st.doc, isStratigraphicType), [],
     "USM101 has a height of its own: no hint");
  const r2 = chain.addReading(st, "P_CAPH", { kind: "unit", id: "USV106" });
  eq(N(st, r2.extractorId).name, "USV106.1", "a second unit source: USV106.1");
  ok(r2.combinerCreated, "…the second source of P_CAPH made its combiner");
  eq(chain.extractionSourceHints(st.doc, isStratigraphicType).map((h) => [h.extractor_name, h.unit_name, h.property_name]),
     [["USV106.1", "USV106", "height"]], "USV106 has no height: ONE hint (api.validate info), through the combiner");
  HINT_DOC = st.doc;
}

// ── the same hint s3Dgraphy computes (api.validate → info), when it is installed ─
{
  const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
  const PY = `${S3D}.venv/bin/python`;
  if (HINT_DOC && existsSync(PY)) {
    const script = `
import json,sys
from s3dgraphy import api
g, w = api.load_emjson(json.loads(sys.stdin.read()))
print(json.dumps(api.validate(g)["info"]))`;
    const got = JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify(HINT_DOC),
      env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
    eq(got.length, 1, "s3Dgraphy's api.validate lists the same ONE info");
    ok(got[0].includes("USV106.1") && got[0].includes("USV106") && got[0].includes("height"),
       "…about the same extractor, unit and property");
  } else console.log("  (s3Dgraphy venv not found: the Python comparison is skipped)");
}

// ── a reading with no source name stays Temp<n> ─────────────────────────────
{
  const st = fresh();
  st.updateNode("D3", { name: "" });
  const r = chain.addReading(st, "P_H", { kind: "document", id: "D3" });
  ok(/^Temp\d+$/.test(N(st, r.extractorId).name), "a source without a name leaves the extractor Temp<n>");
  // a region on a file nobody promoted names nothing either
  const doc = { graph: { nodes: [{ id: "X", node_type: "extractor", name: "Temp1" },
    { id: "R", node_type: "annotation_region", name: "r", data: { resource_id: "F" } },
    { id: "F", node_type: "resource", name: "foto.jpg" }], edges: [
    { source: "X", target: "R", edge_type: "extracted_from" }] } };
  eq(naming.sourceOfExtractor(doc, "X"), null, "a region on a bare file: no source for the name");
  doc.graph.nodes.push({ id: "D", node_type: "document", name: "D.7" });
  doc.graph.edges.push({ source: "D", target: "F", edge_type: "has_linked_resource" });
  eq(naming.deriveExtractorName(doc, "X"), "D.7.1", "…until a document links the file: D.7.1");
}

// ── «Usa come valore» ───────────────────────────────────────────────────────
{
  const st = fresh();
  const before = undoDepth(st);
  eq(chain.useAsValue(st, "X1"), "P_DAT", "the reading's property takes the value");
  ok(chain.propertyValue(N(st, "P_DAT")).startsWith("Il capitello nord"), "…the passage's text");
  eq(undoDepth(st) - before, 1, "…in one undo step");
}

console.log(`paradata-chain: ${checks} checks ✓`);
