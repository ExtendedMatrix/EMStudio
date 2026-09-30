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
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync as readF, appendFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createServer } from "node:net";

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
      export { handleEdgeTypes, existingLinks } from "./add-menu";
      export * as aiv from "./ai-validation";
      export * as receipts from "./receipt";
      export * as tropy from "./tropy";
      export * as shelf from "./shelf";
      export { newDraft, emitDraft, readyToStamp, setComposeBridgeResolver, outputFrom, retitleStamp } from "./stamp-compose";
      export { dtcKindsFor } from "./rules";
      export { issues } from "./issues";
      export { ViewerKeeper } from "./viewer-keep";
      export * as rglb from "./reading-glb";
      export { ReadingFiles } from "./reading-files";
      export * as LEGACY from "./reading-files";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  plugins: [{
    // `./icons` uses import.meta.glob, which only Vite has (as in check-add-menu)
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
const { chain, DocumentStore, naming, isStratigraphicType, handleEdgeTypes, existingLinks, aiv, issues,
        receipts, tropy, shelf, ViewerKeeper, rglb, ReadingFiles, LEGACY } = M;
const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
/** ask s3Dgraphy (when its venv is there) a question about a document */
function py(doc, expr) {
  if (!existsSync(PY)) return undefined;
  const script = `
import json,sys
from s3dgraphy import api
g, w = api.load_emjson(json.loads(sys.stdin.read()))
print(json.dumps(${expr}))`;
  return JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify(doc),
    env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
}

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
  eq(N(st, r.extractorId).name, "D.3.01", "a reading on D.3 is D.3.01 (RIFINITURE: <source>.<NN>, the rule of s3Dgraphy)");
  eq(undoDepth(st) - before, 1, "…one undo step");
  ok(E(st, "has_data_provenance").some((e) => e.source === "P_H" && e.target === r.extractorId), "has_data_provenance from the property");
  ok(E(st, "is_in_paradata_nodegroup").some((e) => e.source === r.extractorId && e.target === "PD_USM101"),
     "…and the extractor joins the chain's paradata group");
  eq(r.combinerCreated, null, "a first source makes no combiner");
  // the geometry of an image reading: an AnnotationRegion on the document
  chain.setReadingGeometry(st, r.extractorId, "D3", { kind: "region2d", shape_kind: "rect", rect: [0.2, 0.4, 0.15, 0.2] });
  const g = chain.geometryOf(st.doc, r.extractorId);
  eq([g.kind, g.rect], ["region2d", [0.2, 0.4, 0.15, 0.2]], "the region is the reading's geometry");
  const region = N(st, g.regionId);
  eq([region.node_type, region.data.resource_id], ["annotation_region", "D3"], "…an annotation_region on D.3");
  ok(E(st, "is_on_resource").some((e) => e.source === region.id && e.target === "D3"), "…is_on_resource D.3");
  eq(N(st, r.extractorId).name, "D.3.01", "…and the extractor keeps its name");
  eq(chain.readingsOfDocument(st.doc, "D3"), [r.extractorId], "D.3 lists the reading once");
  // re-tracing replaces the region, never adds a second
  chain.setReadingGeometry(st, r.extractorId, "D3", { kind: "region2d", shape_kind: "rect", rect: [0.5, 0.5, 0.1, 0.1] });
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
     "P_DAT → C.1 → {D.1.1, D.2.01}");
  eq(N(st, r.extractorId).name, "D.2.01", "the new reading is D.2.01");
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
  eq(N(st, r.extractorId).name, "USM101.01", "a reading from USM101 is USM101.01 (the unit's name for the document's)");
  eq(chain.sourceOf(st.doc, r.extractorId).kind, "unit", "…its source is a unit");
  eq(chain.extractionSourceHints(st.doc, isStratigraphicType), [],
     "USM101 has a height of its own: no hint");
  const r2 = chain.addReading(st, "P_CAPH", { kind: "unit", id: "USV106" });
  eq(N(st, r2.extractorId).name, "USV106.01", "a second unit source: USV106.01");
  ok(r2.combinerCreated, "…the second source of P_CAPH made its combiner");
  eq(chain.extractionSourceHints(st.doc, isStratigraphicType).map((h) => [h.extractor_name, h.unit_name, h.property_name]),
     [["USV106.01", "USV106", "height"]], "USV106 has no height: ONE hint (api.validate info), through the combiner");
  HINT_DOC = st.doc;
}

// ── the same hint s3Dgraphy computes (api.validate → info), when it is installed ─
{
  if (HINT_DOC && existsSync(PY)) {
    const script = `
import json,sys
from s3dgraphy import api
g, w = api.load_emjson(json.loads(sys.stdin.read()))
print(json.dumps(api.validate(g)["info"]))`;
    const got = JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify(HINT_DOC),
      env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
    eq(got.length, 1, "s3Dgraphy's api.validate lists the same ONE info");
    ok(got[0].includes("USV106.01") && got[0].includes("USV106") && got[0].includes("height"),
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
  eq(naming.deriveExtractorName(doc, "X"), "D.7.01", "…until a document links the file: D.7.01");
}

// ── RIFINITURE · the 3D camera stays where it is ─────────────────────────────
// A repaint of the Doc window (a traced point is one) keeps the viewer of the
// same model: nothing is mounted again, so nothing frames it again. The reframe
// happens when the model OPENS and on the explicit ⤢ (`frame`), nowhere else.
{
  const K = new ViewerKeeper();
  const owner = {};
  let mounted = 0, framed = 0, disposed = 0;
  const make = () => { mounted++; framed++; // mounting frames (the model opens)
    return { v: { dispose: () => { disposed++; }, frame: () => { framed++; } }, extra: null }; };
  const a = K.keep(owner, "D1\u0000colonnato.gltf", make);
  eq([a.fresh, mounted, framed], [true, 1, 1], "the model opens: one mount, one frame");
  for (let i = 0; i < 3; i++) K.keep(owner, "D1\u0000colonnato.gltf", make); // three traced points = three repaints
  eq([mounted, framed, disposed], [1, 1, 0], "three repaints of the same model: no mount, NO reframe");
  K.get(owner).v.frame();
  eq(framed, 2, "⤢ is the explicit reframe");
  const b = K.keep(owner, "D2\u0000muro.gltf", make);
  eq([b.fresh, mounted, framed, disposed], [true, 2, 3, 1], "another model: the old viewer goes, the new one is framed on opening");
  K.drop(owner);
  eq(disposed, 2, "another medium: the kept viewer is disposed");
}

// ── «Usa come valore» ───────────────────────────────────────────────────────
{
  const st = fresh();
  const before = undoDepth(st);
  eq(chain.useAsValue(st, "X1"), "P_DAT", "the reading's property takes the value");
  ok(chain.propertyValue(N(st, "P_DAT")).startsWith("Il capitello nord"), "…the passage's text");
  eq(undoDepth(st) - before, 1, "…in one undo step");
}

// ── fase 4 · the maniglia: up = the nodes above (they are the source) ────────
{
  const has = (a, b, dir, e) => handleEdgeTypes(a, b, dir).includes(e);
  ok(has("US", "US", "up", "is_after") && has("US", "US", "down", "is_after"), "US: US above and below (is_after)");
  ok(has("US", "property", "down", "has_property") && !has("US", "property", "up", "has_property"),
     "a US's property is BELOW it");
  ok(has("property", "US", "up", "has_property"), "a property's owner is ABOVE it");
  ok(has("property", "extractor", "down", "has_data_provenance"), "a property's extractor is below it");
  ok(has("extractor", "property", "up", "has_data_provenance"), "an extractor's property is above it");
  ok(has("extractor", "document", "down", "extracted_from") && has("extractor", "US", "down", "extracted_from"),
     "an extractor's document — or unit (1.6.24) — is below it");
  eq(handleEdgeTypes("US", "extractor", "down"), [], "nothing admits an extractor below a US: ⊘");
  ok(!handleEdgeTypes("US", "US", "up").some((e) => ["has_same_time", "equals", "contrasts_with"].includes(e)),
     "symmetric relations belong to neither direction");
  // the gesture's write: RSF100b ↓ onto the existing P_H — one has_property,
  // the same the app makes (createEdge with the one admitted type)
  const st = fresh();
  const types = handleEdgeTypes(N(st, "RSF100b").node_type, N(st, "P_H").node_type, "down");
  eq(types, ["has_property"], "RSF100b ↓ height: has_property is the one relation");
  st.addEdge("RSF100b", "P_H", types[0]);
  eq(chain.ownersOf(st.doc, "P_H").map((o) => o.owner), ["USM101", "RSF100b"], "…and the property now has two owners");
  // in the void: the existing half of the menu, in that direction only
  const down = existingLinks(st.doc, "USV106").filter((l) => l.dir === "out");
  ok(down.every((l) => handleEdgeTypes("USVs", l.nodeType, "down").includes(l.edgeType) || l.relation === "below"),
     "the void menu's «Esistenti» (down) are links X → existing");
}

// ── fase 5 · an AI proposal stays among the warnings until a person verifies ─
{
  const st = fresh();
  const r = chain.addReading(st, "P_MAT", { kind: "document", id: "D1" });
  const x = r.extractorId;
  st.batch(() => {
    chain.setReadingGeometry(st, x, "D1", { kind: "passage", start: 0, end: 10, text: st.node("D1").data.text.slice(0, 10) });
    const by = aiv.aiAuthorFor(st, "echo", "echo-1");
    aiv.markAiAssisted(st, x, { by, model: "echo-1", fields: ["data.geometry"] });
  });
  eq(N(st, st.node(x).data.ai_assisted.by).node_type, "author_ai", "ai_assisted.by names an AuthorAINode");
  const warn = () => issues({ doc: st.doc, nodes: st.doc.graph.nodes, isUnit: isStratigraphicType,
    aiNodes: aiv.unvalidatedAi(st.doc), t: (k) => k }).filter((i) => i.rule === "ai" && i.node === x);
  eq(warn().map((i) => i.sev), ["warn"], "the AI reading is a warning (rule ai)");
  const libRows = py(st.doc, "[r['node'] for r in api.unvalidated_ai(g)]");
  if (libRows) eq(libRows, [x], "s3Dgraphy's api.unvalidated_ai lists the same node");
  eq(aiv.verifyNodesAs(st, [x], null), "needs-identity", "Verify without an identity writes nothing");
  ok(!st.node(x).data.validated_by, "…validated_by stays absent");
  const ME = { orcid: "0000-0002-1825-0097", label: "Emanuel Demetrescu", verified: true };
  const before = undoDepth(st);
  eq(aiv.verifyNodesAs(st, [x], ME, "2026-10-05T01:00:00Z").verified, [x], "Verify with the identity");
  const v = st.node(x).data;
  eq([N(st, v.validated_by).node_type, N(st, v.validated_by).data.orcid, v.validated_at],
     ["author", ME.orcid, "2026-10-05T01:00:00Z"], "validated_by = the person's AuthorNode (ORCID), validated_at");
  eq(undoDepth(st) - before, 1, "…one undo step (the author and the signature)");
  eq(warn(), [], "…and it leaves the warnings");
  const after = py(st.doc, "[r['node'] for r in api.unvalidated_ai(g)]");
  if (after) eq(after, [], "s3Dgraphy agrees: nothing left to verify");
  eq(aiv.verifyNodesAs(st, ["USM101"], ME).verified, [], "a human node is not «verified» (nothing to verify)");
  // E.D.'s rule: an extractor authored by an AuthorAINode (StratiMiner) is AI data too
  const ai = aiv.aiAuthorFor(st, "claude", "sm");
  st.addEdge("X1", ai, "has_author");
  eq(aiv.unvalidatedAi(st.doc).map((r2) => [r2.node, r2.via]), [["X1", "has_author"]],
     "a StratiMiner extractor (has_author → AuthorAINode) stays among the warnings");
  aiv.verifyNodesAs(st, ["X1"], ME);
  eq(aiv.unvalidatedAi(st.doc), [], "…until a person verifies it");
}

// ── fase 6 · a GROUP stamp on three files writes three receipts ────────────
{
  const BR = new URL("../../tools/em_bridge.py", import.meta.url).pathname;
  if (!existsSync(PY)) console.log("  (s3Dgraphy venv not found: the stamp round trip is skipped)");
  else {
    const dir = realpathSync(mkdtempSync(`${tmpdir()}/catena-stamp-`)); // /var → /private/var
    const files = ["prospetto_01.jpg", "prospetto_02.jpg", "prospetto_03.jpg"].map((n, i) => {
      const p = `${dir}/${n}`;
      writeFileSync(p, `bytes of photo ${i} ${"x".repeat(100 + i)}`);
      return p;
    });
    const port = await new Promise((res) => { const srv = createServer(); srv.listen(0, () => {
      const pt = srv.address().port; srv.close(() => res(pt)); }); });
    const proc = spawn(PY, [BR, "--port", String(port), "--s3dgraphy", `${S3D}src`, "--fs-root", dir],
                       { stdio: "ignore", env: { ...process.env, PYTHONPATH: `${S3D}src` } });
    const base = `http://127.0.0.1:${port}`;
    try {
      for (let i = 0; i < 80; i++) {
        try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not yet */ }
        await new Promise((r) => setTimeout(r, 150));
      }
      M.setComposeBridgeResolver(async () => base);
      // the bridge's /fs and /stamp routes want the local EMStudio's Origin, which a
      // browser sends and node does not
      const nodeFetch = globalThis.fetch;
      globalThis.fetch = (u, init = {}) => nodeFetch(u, { ...init,
        headers: { ...(init.headers ?? {}), Origin: "http://localhost:5173" } });
      const sha = (p) => `sha256:${createHash("sha256").update(readF(p)).digest("hex")}`;
      const outs = files.map((p) => ({ ...M.outputFrom({ name: p.split("/").pop(), path: p, type: "file",
        size: readF(p).length, mtime: 0, ext: "jpg" }), digest: sha(p) }));
      const draft = M.newDraft(outs);
      Object.assign(draft, { origin: true, originDeclared: true, campaign: "CE26",
        kind: M.dtcKindsFor("acquisition")[0]?.kind ?? "", at: "2026-03-14T09:00:00Z",
        description: "prospetto nord di USM101, campagna 2026",
        operator: { id: "https://orcid.org/0000-0002-1825-0097", label: "Emanuel Demetrescu" } });
      eq(M.readyToStamp(draft), null, "the group draft is ready (origin declared, kind, date)");
      const res = await M.emitDraft(draft, { graph_id: "catena" });
      if (res.written.length !== 3) console.log(JSON.stringify(res).slice(0, 1500));
      eq(res.written.length, 3, "ONE act, three stamps written");
      const recs = receipts.receiptsOfEmission(res.stamps);
      eq(recs.length, 3, "…three receipts");
      ok(recs.every((r, i) => r.checksum === outs[i].digest), "…each with the file's sha256 as its checksum");
      ok(recs.every((r) => r.extra.stamp_receipt.description === "prospetto nord di USM101, campagna 2026"),
         "…the group's description on each (a copy)");
      eq(Object.keys(recs[0].extra.stamp_receipt).sort(), ["checksum", "description", "id", "parents", "stamp", "title"],
         "the receipt is dtcstamp's form {id, checksum, stamp, parents, title?, description?}");
      const side = JSON.parse(readF(`${files[0]}.stamp.json`, "utf8"));
      eq([side.self.label, side.self.description], ["prospetto_01.jpg", "prospetto nord di USM101, campagna 2026"],
         "the sidecar carries self.label and self.description");
      const before = shelf.shelfEntries().length;
      for (const r of recs) shelf.addToShelf(r);
      eq(shelf.shelfEntries().length - before, 3, "three shelf entries");
      const e0 = shelf.shelfEntries().find((e) => e.locator === files[0]);
      const rec0 = receipts.receiptOf(e0);
      eq(receipts.checkReceipt(rec0, side, sha(files[0])), "ok", "the receipt matches the sidecar and the bytes");
      appendFileSync(files[0], "retouched");
      eq(receipts.checkReceipt(rec0, side, sha(files[0])), "file-changed", "a file changed under its receipt is said so");
      eq(receipts.checkReceipt(rec0, null, null), "unreachable", "nothing reachable: nothing claimed");
      // RIFINITURE · the description is written IN THE STAMP: «Modifica nel
      // timbro» rewrites self.label/description, the act stays the same, and
      // the receipt and the shelf's copy follow
      const f1 = files[1];
      const sideBefore = JSON.parse(readF(`${f1}.stamp.json`, "utf8"));
      const rt = await M.retitleStamp(f1, "Prospetto nord, foto 2", "il prospetto nord con il capitello reimpiegato");
      eq(rt.ok, true, "retitle · the bridge rewrites the stamp's title and description");
      const sideAfter = JSON.parse(readF(`${f1}.stamp.json`, "utf8"));
      eq([sideAfter.self.label, sideAfter.self.description],
         ["Prospetto nord, foto 2", "il prospetto nord con il capitello reimpiegato"], "retitle · …in the sidecar");
      const strip = (x) => { const c = JSON.parse(JSON.stringify(x)); delete c.self.label; delete c.self.description; return c; };
      eq(strip(sideAfter), strip(sideBefore), "retitle · …and NOTHING else of the act changed");
      eq([rt.receipt.title, rt.receipt.description, rt.receipt.id],
         ["Prospetto nord, foto 2", "il prospetto nord con il capitello reimpiegato", sideBefore.self.resource_id],
         "retitle · the new receipt, same identity");
      const e1 = shelf.shelfEntries().find((e) => e.locator === f1);
      for (const u of receipts.refreshedCopies(shelf.shelfEntries(), f1, rt.receipt)) shelf.updateShelfEntry(u.id, u.patch);
      const e1b = shelf.shelfEntries().find((e) => e.id === e1.id);
      eq([receipts.receiptOf(e1b).description, e1b.name], ["il prospetto nord con il capitello reimpiegato", "Prospetto nord, foto 2"],
         "retitle · the shelf's copy is the new receipt (and the name followed the title it was)");
      eq(receipts.checkReceipt(receipts.receiptOf(e1b), sideAfter, sha(f1)), "ok", "retitle · …and it agrees with the sidecar");
      const none = await M.retitleStamp(`${dir}/non_timbrato.jpg`, "x", "y");
      eq(none.ok, false, "retitle · a file with no stamp has nothing to retitle");
    } finally {
      proc.kill();
    }
  }
}


// ── LUOGO · the place of a reading is a node, for every medium ──────────────
// region, passage, point, line, polyline: the node s3Dgraphy's
// `api.place_reading` makes (same uuid5 id, same data key for key), its edges.
// SPAZIO (node datamodel 1.6.15): the three 3D kinds carry their vertices in
// `data.coords` — no shape, no glb.
const pyRun = (payload, body) => {
  if (!existsSync(PY)) return undefined;
  const script = `
import json,sys
from s3dgraphy import api
a = json.loads(sys.stdin.read())
${body}`;
  return JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify(payload),
    env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
};
/** s3Dgraphy's placement of the same reading on the same document */
const pyPlace = (doc, x, on, geometry) => pyRun({ doc, x, on, geometry }, `
g, w = api.load_emjson(a["doc"])
r = api.place_reading(g, a["x"], a["on"], a["geometry"])
n = g.find_node_by_id(r.region_id)
m = api.measure(g, r.region_id)
print(json.dumps({"region_id": r.region_id, "glb_url": r.glb_url,
  "data": n.data, "name": n.name, "value": m["value"],
  "edges": sorted([e.edge_type for e in g.edges if r.region_id in (e.edge_source, e.edge_target)])}))`);
/** data key for key; `length` to 1e-12 (math.dist vs Math.hypot: the last bit) */
const sameData = (a, b, what) => {
  const { length: la, ...ra } = a, { length: lb, ...rb } = b;
  eq(ra, rb, what);
  ok((la == null && lb == null) || Math.abs(la - lb) <= 1e-12 * Math.max(1, Math.abs(lb)),
     `${what} — length ${la} ≈ ${lb}`);
};
const withModel = (st) => {
  st.addNode({ id: "M1", node_type: "document", name: "D.9", description: "rilievo di USM101",
               data: { url: "rilievo_USM101.glb" } });
  return st;
};
const PLACES = [
  ["region2d", "D3", { kind: "region2d", shape_kind: "rect", rect: [0.125, 0.25, 0.2, 0.3] },
   { geometry_kind: "region2d", shape_kind: "rect", rect: [0.125, 0.25, 0.2, 0.3] }],
  ["passage", "D1", { kind: "passage", start: 4, end: 21, text: "capitello nord è" },
   { geometry_kind: "passage", start: 4, end: 21, text: "capitello nord è" }],
  ["point", "M1", { kind: "point", vertices: [[1.25, 2.5, -0.375]] }, null],
  ["line", "M1", { kind: "line", vertices: [[0, 0, 0], [1.2, 0, 0.5]] }, null],
  ["polyline", "M1", { kind: "polyline", vertices: [[0, 0, 0], [1, 0, 0], [1, 2, 0], [1, 2, 0.234]] }, null],
];
for (const [kind, on, trace, pyGeomIn] of PLACES) {
  const st = withModel(fresh());
  const r = chain.addReading(st, "P_H", { kind: "document", id: on });
  const pre = JSON.parse(JSON.stringify(st.doc));
  const before = undoDepth(st);
  const placed = chain.setReadingGeometry(st, r.extractorId, on, trace);
  eq(undoDepth(st) - before, 1, `${kind} · one undo step`);
  const region = N(st, placed.regionId);
  eq([region.node_type, region.data.geometry_kind, region.data.resource_id], ["annotation_region", kind, on],
     `${kind} · an annotation_region with geometry_kind ${kind}, on ${on}`);
  ok(E(st, "extracted_from").some((e) => e.source === r.extractorId && e.target === region.id), `${kind} · extracted_from extractor → region`);
  ok(E(st, "is_on_resource").some((e) => e.source === region.id && e.target === on), `${kind} · is_on_resource region → ${on}`);
  eq(chain.geometryOf(st.doc, r.extractorId).kind, kind, `${kind} · geometryOf reads geometry_kind`);
  eq(N(st, r.extractorId).data?.geometry, undefined, `${kind} · nothing in data.geometry`);
  eq(chain.readingsOfDocument(st.doc, on).filter((x) => x === r.extractorId).length, 1, `${kind} · ${on} lists the reading once`);
  const is3d = chain.isGlbKind(kind);
  if (is3d) {
    eq(region.data.coords, trace.vertices, `${kind} · the vertices are the node's data.coords, verbatim`);
    eq([region.data.vertex_count, region.data.crs], [trace.vertices.length, "local"], `${kind} · vertex_count and crs local`);
    eq(chain.geometryOf(st.doc, r.extractorId).vertices, trace.vertices, `${kind} · the markers read them from the node`);
    eq(E(st, "has_semantic_shape").filter((e) => e.source === region.id).length, 0, `${kind} · no semantic_shape, no glb`);
    eq(st.doc.graph.nodes.filter((n) => n.node_type === "semantic_shape").length, 0, `${kind} · no shape in the graph`);
    ok(!("glb" in placed) && !("glbUrl" in placed), `${kind} · nothing to write outside the undo step`);
  }
  const pyr = pyGeomIn || is3d ? pyPlace(pre, r.extractorId, on,
    pyGeomIn ?? { geometry_kind: kind, vertices: trace.vertices }) : undefined;
  if (pyr) {
    eq(region.id, pyr.region_id, `${kind} · the region id is s3Dgraphy's uuid5`);
    const unstamped = (d) => Object.fromEntries(Object.entries(d).filter(([k]) => !/^(created|modified)_(at|by)$/.test(k)));
    sameData(unstamped(region.data), pyr.data, `${kind} · …and so is its data (the store's stamps aside)`);
    eq(region.name, pyr.name, `${kind} · …and its name`);
    if (is3d) eq(pyr.glb_url, null, `${kind} · s3Dgraphy writes no glb either (≤ inline_max_vertices)`);
    const mine = chain.measureOf(st.doc, region.id);
    eq(mine.value, pyr.value, `${kind} · measureOf = api.measure (${pyr.value})`);
  }
  if (kind === "polyline") {
    eq(chain.resultOf(st.doc, r.extractorId), "3.234 m", "polyline · the result is the measure");
    const p = chain.useAsValue(st, r.extractorId);
    eq([p, chain.propertyValue(N(st, "P_H"))], ["P_H", "3.234 m"], "polyline · «Usa come valore» writes the measure into the property");
  }
  if (kind === "point") eq(chain.resultOf(st.doc, r.extractorId), "z -0.38 m", "point · its height is read from its coords");
  if (kind === "line") {
    // tracing again MOVES the reading; the old region nobody reads goes
    const old = placed.regionId;
    const again = chain.setReadingGeometry(st, r.extractorId, on, { kind: "line", vertices: [[0, 0, 0], [0, 3, 0]] });
    ok(again.regionId !== old && !N(st, old), "line · traced again: the old place goes");
    eq(chain.measureOf(st.doc, again.regionId).value, "3.000 m", "line · …the new one measures 3.000 m");
    st.undo();
    ok(N(st, old) && chain.geometryOf(st.doc, r.extractorId).regionId === old, "line · undo brings the old place back");
  }
}
if (!existsSync(PY)) console.log("  (s3Dgraphy venv not found: the comparison with api.place_reading is skipped)");
{
  // more than the datamodel's threshold is not a trace: refused, said
  const st = withModel(fresh());
  const r = chain.addReading(st, "P_H", { kind: "document", id: "M1" });
  const many = Array.from({ length: chain.inlineMaxVertices() + 1 }, (_, i) => [i / 100, 0, 0]);
  eq(chain.inlineMaxVertices(), 500, "coords.inline_max_vertices is read from the node datamodel (500)");
  let why = "";
  try { chain.setReadingGeometry(st, r.extractorId, "M1", { kind: "polyline", vertices: many }); } catch (e) { why = String(e.message); }
  ok(/inline_max_vertices \(500\)/.test(why), `${many.length} vertices are refused: «${why}»`);
}

// SPAZIO · an em.json of 7–11 ott (vertices in readings/<id>.glb): the client
// migrates it as s3Dgraphy's `migrate_reading_glbs` does — the same data
{
  const FIX = new URL("../testdata/letture-7ott/", import.meta.url).pathname;
  const doc = JSON.parse(readF(`${FIX}letture-7ott.em.json`, "utf8"));
  const legacy = LEGACY.legacyReadingGlbs(doc);
  eq(legacy.map((l) => l.kind).sort(), ["line", "point", "polyline"], "7 ott · three regions whose vertices are in a glb");
  const was = Object.fromEntries(doc.graph.nodes.filter((n) => n.node_type === "annotation_region")
    .map((n) => [n.id, chain.measureOf(doc, n.id).value]));
  const bare = await new ReadingFiles({ projectRoot: () => null, bridge: async () => null })
    .migrate(JSON.parse(JSON.stringify(doc)), () => { throw new Error("nothing to write without a folder"); });
  eq([bare.migrated.length, bare.pending.map((q) => q.why)], [0, ["no-folder", "no-folder", "no-folder"]],
     "7 ott · without a folder nothing moves, and each one says why");
  const files = new ReadingFiles({ projectRoot: () => FIX.replace(/\/$/, ""), bridge: async () => null,
    readFile: async (path) => new Uint8Array(readF(path)) });
  const mine = JSON.parse(JSON.stringify(doc));
  const res = await files.migrate(mine, (w) => w());
  eq([res.migrated.length, res.pending.length], [3, 0], "7 ott · with its folder the three are migrated");
  eq(LEGACY.legacyReadingGlbs(mine).length, 0, "…idempotent: nothing left to migrate");
  eq(mine.graph.nodes.filter((n) => n.node_type === "semantic_shape").length, 0, "…the shapes left the graph");
  eq(Object.fromEntries(mine.graph.nodes.filter((n) => n.node_type === "annotation_region")
    .map((n) => [n.id, chain.measureOf(mine, n.id).value])), was, "…and the measures are the ones of 7 ott");
  if (existsSync(PY)) {
    const py = pyRun({ doc, root: FIX }, `
from s3dgraphy.annotation.migrate_reading import migrate_reading_glbs
g, w = api.load_emjson(a["doc"])
rep = migrate_reading_glbs(g, project_root=a["root"])
print(json.dumps({"migrated": len(rep["migrated"]), "regions": {n.node_id: n.data for n in g.nodes if n.node_type == "annotation_region"},
  "shapes": len([n for n in g.nodes if n.node_type == "semantic_shape"])}))`);
    const unstamped = (d) => Object.fromEntries(Object.entries(d).filter(([k]) => !/^(created|modified)_(at|by)$/.test(k)));
    eq(py.migrated, 3, "7 ott · s3Dgraphy migrates the same three");
    for (const n of mine.graph.nodes.filter((x) => x.node_type === "annotation_region"))
      sameData(unstamped(n.data), unstamped(py.regions[n.id]), `7 ott · ${n.data.geometry_kind}: the client's data is s3Dgraphy's, key for key`);
  }
}

// an old file with data.geometry (5–7 ott) opens migrated by s3Dgraphy
{
  const st = withModel(fresh());
  const xp = chain.addReading(st, "P_H", { kind: "document", id: "M1" }).extractorId;
  st.updateNode(xp, { data: { geometry: { kind: "point3d", p: [0.25, 1.5, -2], on: "rilievo_USM101" } } });
  const legacy = chain.geometryOf(st.doc, xp);
  eq([legacy.kind, legacy.regionId, legacy.vertices], ["point", null, [[0.25, 1.5, -2]]],
     "a legacy point3d is still READ (the one copy of its coordinates), never written");
  eq(chain.resultOf(st.doc, xp), "z -2.00 m", "…its height is still a result");
  if (existsSync(PY)) {
    const dir = realpathSync(mkdtempSync(`${tmpdir()}/luogo-old-`));
    writeFileSync(`${dir}/vecchio.em.json`, JSON.stringify(st.doc));
    const migrated = pyRun({ path: `${dir}/vecchio.em.json` }, `
g, w = api.load_emjson_file(a["path"])
print(json.dumps(api.graph_to_emjson(g)))`);
    const st2 = new DocumentStore(migrated);
    const g2 = chain.geometryOf(st2.doc, xp);
    ok(g2.kind === "point" && g2.regionId && !g2.url,
       "opened by s3Dgraphy: the point is a region, with no glb");
    eq(st2.node(xp).data?.geometry, undefined, "…and data.geometry left the extractor");
    eq(st2.node(g2.regionId).data.resource_id, "M1", "…on the model the extractor read");
    eq(g2.vertices, [[0.25, 1.5, -2]], "…its coords are the point");
    const x1 = chain.geometryOf(st2.doc, "X1");
    ok(x1.kind === "passage" && x1.regionId && x1.text.startsWith("Il capitello nord"),
       "the fixture's legacy passage became a passage region too");
  }
}

// ── a Tropy item promoted becomes a document and its readings ─────────────
{
  const session = {
    "@context": "https://tropy.org/v1/contexts/item.jsonld",
    "@graph": [{
      "@type": "Item", "@id": "tropy:item/2144", "title": "Foto storica USM101, 1932",
      "photo": [{ "@type": "Photo", "@id": "tropy:photo/9", "path": "/archivio/foto_USM101_1932.jpg",
        "width": 2000, "height": 1000, "checksum": "a1b2", "note": [{ "text": "Il capitello nord è già visibile" }],
        "selection": [{ "@type": "Selection", "x": 400, "y": 300, "width": 300, "height": 200,
                        "note": [{ "html": "<p>capitello nord in situ</p>" }] },
                      { "@type": "Selection", "x": 1200, "y": 250, "width": 250, "height": 220, "note": [] }] }],
    }],
  };
  const items = tropy.parseTropy(session);
  eq(items.map((i) => [i.id, i.title, i.photos.length]), [["tropy:item/2144", "Foto storica USM101, 1932", 1]],
     "a Tropy session parses to its item");
  eq(items[0].photos[0].selections.map((x) => [x.rect, x.note]),
     [[[0.2, 0.3, 0.15, 0.2], "capitello nord in situ"], [[0.6, 0.25, 0.125, 0.22], ""]],
     "…the selections, normalised to the photo, with their notes");
  const inputs = tropy.tropyShelfInputs(items);
  const entry = shelf.addToShelf(inputs[0]);
  ok(tropy.tropyOf(entry)?.selections.length === 2, "the shelf entry keeps the selections");
  const st = fresh();
  const before = undoDepth(st);
  const r = tropy.promoteToDocument(st, entry);
  eq(undoDepth(st) - before, 1, "«Promuovi a documento» is one undo step");
  const d = N(st, r.documentId);
  eq([d.node_type, d.name, d.data.tropy, d.data.url], ["document", "D.4", "tropy:item/2144", "/archivio/foto_USM101_1932.jpg"],
     "…a DocumentNode D.<n>, the Tropy item kept, the file as its url");
  eq(r.extractors.map((x) => N(st, x).name), ["D.4.01", "D.4.02"],
     "…one extractor per selection, named by NAME1 from the document its region is on (not Temp<n>)");
  const g = chain.geometryOf(st.doc, r.extractors[0]);
  eq([g.kind, g.rect], ["region2d", [0.2, 0.3, 0.15, 0.2]], "…the selection's region is the reading's geometry");
  eq(N(st, r.extractors[0]).description, "capitello nord in situ", "…its note the reading's description");
  eq(chain.readingsOfDocument(st.doc, r.documentId).length, 2, "the document lists the two readings");
}

console.log(`paradata-chain: ${checks} checks ✓`);
