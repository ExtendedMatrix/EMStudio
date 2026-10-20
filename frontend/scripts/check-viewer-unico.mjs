// MICRO-VIEWER-UNICO · executable check of the one Viewer: what it opens for a
// node (a document whole, a resource, a model, a container), the rule of the
// versions (the lightest at once, the highest within the threshold after the
// pause, a new node cancels it), what a mark on the document's model reads (a
// spot height, an impost, a plane, a line), the extraction it makes and its
// «Interpretazione», and the three new sheets of the Tabular.
//
//   node scripts/check-viewer-unico.mjs
//
// The pure pieces are bundled with the project's esbuild and run in node on
// small documents built here and — when the copy is there — on the Templu Mare
// v3.3 (`VIEWER_V33`, default /tmp/viewer/EM/TempluMare_v3.3.em.json), read only.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const SRC = new URL("../src/", import.meta.url).pathname;
// the three sheets of Parte 6 are checked when their module is there
const LEDGER = existsSync(`${SRC}ledger-sheets.ts`);
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * as vn from "./viewer-node";
      export * as va from "./viewer-annot";
      ${LEDGER ? 'export * as ledger from "./ledger-sheets";' : "export const ledger = null;"}
      export * as chain from "./paradata-chain";
      export { DocumentStore } from "./model";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true, format: "esm", write: false,
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
    },
  }],
});
const { vn, va, ledger, chain, DocumentStore } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const near = (a, b, what, tol = 1e-6) => { assert.ok(Math.abs(a - b) <= tol, `${what} — got ${a}, want ${b}`); checks++; };

// ── a small document: a survey with a container of two models, a picture
//    document with its crops, a PDF with its linked resource ─────────────────
const n = (id, node_type, name, data = {}) => ({ id, node_type, name, description: "", data });
const e = (source, target, edge_type) => ({ id: `${source}>${edge_type}>${target}`, source, target, edge_type });
const G = {
  nodes: [
    n("D1", "document", "D.1"), n("RM1", "representation_model", "SM_A"), n("RM2", "representation_model", "SM_B"),
    n("GRP", "RepresentationModelNodeGroup", "Survey"), n("R1", "resource", "A mesh", { url: "a.glb" }),
    n("D2", "document", "D.2", { url: "D.2 foto.jpg" }), n("R2", "resource", "Link to D.2", { url: "DosCo/D.2 foto.jpg", checksum: "sha256:x" }),
    n("X1", "extractor", "D.2.01"), n("R3", "resource", "Link to D.2.01", { url: "DosCo/D.2.01.jpg" }),
    n("D3", "document", "D.3", { url: "D.3 relazione.pdf" }),
    n("D4", "document", "D.4"), n("U1", "US", "US 1"), n("P1", "property", "height"),
    n("REG", "annotation_region", "D.2.02 · region2d", { geometry_kind: "region2d", rect: [0, 0, 0.5, 0.5], resource_id: "D2" }),
    n("X2", "extractor", "D.2.02"),
  ],
  edges: [
    e("D1", "RM1", "has_representation_model"), e("D1", "RM2", "has_representation_model"),
    e("RM1", "GRP", "is_in_representation_model_group"), e("RM2", "GRP", "is_in_representation_model_group"),
    e("RM1", "R1", "has_linked_resource"),
    e("D2", "R2", "has_linked_resource"), e("X1", "D2", "extracted_from"), e("X1", "R3", "has_linked_resource"),
    e("U1", "P1", "has_property"), e("X2", "REG", "extracted_from"), e("REG", "D2", "is_on_resource"),
  ],
};

// ── Parte 1 · what the Viewer opens ────────────────────────────────────────
{
  const d1 = vn.viewerTargetOf(G, "D1");
  eq([d1.kind, d1.models, d1.groups, d1.parts.length], ["document", ["RM1", "RM2"], ["GRP"], 0],
     "P1 · a survey: the WHOLE document — its two models and their container, not the first file");
  const d2 = vn.viewerTargetOf(G, "D2");
  eq(d2.parts.map((p) => [p.id, p.via, p.medium]), [["R2", "linked", "image"], ["R3", "extractor", "image"]],
     "P1 · a picture: its file once (the resource with the folder wins over the bare name) and the crop of its extractor");
  eq(d2.parts[1].through, "X1", "…the crop says which extractor it came through");
  eq(vn.viewerTargetOf(G, "D3").parts.map((p) => p.medium), ["pdf"], "P1 · a PDF is a PDF (its own reader), not a text");
  eq(vn.viewerTargetOf(G, "D4").kind, "document", "P1 · a document with nothing…");
  eq(vn.viewerSourceLine(vn.viewerTargetOf(G, "D4"), { models: () => "", group: () => "", own: "", linked: () => "", crops: () => "", nothing: "NOTHING", name: (x) => x }),
     "NOTHING", "…says so");
  const x = vn.viewerTargetOf(G, "X2");
  eq([x.id, x.reading, x.from], ["D2", "X2", "X2"], "P1 · an extractor selected opens ITS document, with the reading");
  eq(vn.viewerTargetOf(G, "REG").id, "D2", "P1 · …and so does its region");
  eq([vn.viewerTargetOf(G, "GRP").kind, vn.viewerTargetOf(G, "GRP").models, vn.viewerTargetOf(G, "GRP").docId], ["group", ["RM1", "RM2"], "D1"],
     "P1 · a container: its members, recorded by the survey");
  eq([vn.viewerTargetOf(G, "R1").kind, vn.viewerTargetOf(G, "R1").models, vn.viewerTargetOf(G, "R1").docId], ["resource", ["RM1"], "D1"],
     "P1 · a 3D resource a model holds is shown as that model, of its document");
  eq(vn.viewerTargetOf(G, "U1").kind, "none", "P1 · a unit is not the Viewer's (the Inspector's, the Space's)");
  eq(vn.viewerSourceLine(d2, { models: (k) => `${k} M`, group: (g) => `C ${g}`, own: "own", linked: (k) => `${k} L`, crops: (k) => `${k} X`, nothing: "-", name: (q) => q }),
     "1 L · 1 X", "P1 · the line says where what is shown comes from");
}

// ── Parte 2 · the versions ─────────────────────────────────────────────────
{
  const v = (id, label, bytes, rank, origin = "recipe") => ({ id, label, bytes, tris: null, rank, origin });
  const l = vn.ladderOf([v("lod0", "LOD0", 160e6, 0, "author"), v("lod4", "derivata lod4", 2e6, 4), v("lod2", "LOD2", 9e6, 2, "author")]);
  eq(l.map((x) => x.id), ["lod4", "lod2", "lod0"], "P2 · the ladder: from the lightest to the heaviest, by the weight measured");
  const unknown = vn.ladderOf([v("a", "A", null, 0), v("b", "B", null, 3)]);
  eq(unknown.map((x) => x.id), ["b", "a"], "P2 · …weights unknown: by the chain (a coarser rank is lighter)");
  const one = vn.scenePlan(new Map([["m", l]]), 200e6);
  eq([one.light.get("m").id, one.high.get("m").id, one.hasHigh, one.heavier], ["lod4", "lod0", true, null],
     "P2 · one model, 160 MB under 200: the light one first, then the author's LOD0");
  const ten = new Map(Array.from({ length: 10 }, (_, i) => [`m${i}`, l]));
  const p10 = vn.scenePlan(ten, 200e6);
  eq([p10.high.get("m0").id, p10.highBytes, p10.heavier?.label], ["lod2", 90e6, "LOD0"],
     "P2 · ten models: the threshold is the document's (1.6 GB of LOD0 is asked, not loaded) — the scene climbs to LOD2 as a whole");
  const tight = vn.scenePlan(ten, 1e6);
  eq([tight.hasHigh, tight.high.get("m0").id], [false, "lod4"], "P2 · even the light step over the threshold: the light one stays");
  // the pause: a fake clock
  const timers = [];
  const clock = { set: (f, ms) => { timers.push({ f, ms, live: true }); return timers.length - 1; }, clear: (h) => { timers[h].live = false; } };
  const hl = new vn.HighLoader(() => 2000, clock);
  const ran = [];
  hl.arm("D.01", () => ran.push("D.01"));
  eq(timers[0].ms, 2000, "P2 · the pause is a parameter (2 s by default)");
  hl.arm("D.01", () => ran.push("again"));
  eq(timers.length, 1, "P2 · the same node still waiting: the pause goes on (not restarted at every repaint)");
  hl.arm("D.02", () => ran.push("D.02"));
  ok(!timers[0].live, "P2 · a new node selected cancels the load in progress");
  for (const t of timers) if (t.live) t.f();
  eq(ran, ["D.02"], "P2 · …only the node still shown loads its high version");
  hl.arm("D.09", () => ran.push("D.09"));
  hl.cancel();
  for (const t of timers) if (t.live) t.f();
  eq(ran, ["D.02"], "P2 · cancel: nothing");
  eq(vn.HIGH_DELAY_MS, 2000, "P2 · the default pause");
}

// ── Parte 4 · what a mark on the model reads ───────────────────────────────
{
  const T = { spot: (z) => `quota ${z}`, impost: (z) => `imposta ${z}`, plane: (z, d, dir) => `piano ${z} ${d} ${dir}`, length: (m) => `lung ${m}` };
  // the scene gives glTF (Y up); the values are read in the document's frame (Z up)
  const q = va.readingOf("elevation", [va.toGltf([1, 2, 492.1234])], null, T);
  eq([q.trace.kind, q.regionData.reading_kind, q.regionData.value, q.result], ["point", "spot_height", 492.1234, "quota 492.123"],
     "P4 · a spot height: a point, its height (the document's z) read");
  eq(q.trace.vertices, [[1, 492.1234, -2]], "P4 · …its vertex written in the glTF frame of the model (the datamodel's frame of coords, the old Doc's)");
  eq(va.readingOf("impost", [va.toGltf([0, 0, 3.5])], null, T).regionData.reading_kind, "impost_height", "P4 · an impost height");
  const pl = va.planeFrom3([0, 0, 10], [1, 0, 10], [0, 1, 10]);
  eq([pl.normal, pl.dip_deg, pl.dip_direction_deg, pl.origin[2]], [[0, 0, 1], 0, null, 10], "P4 · three points level: a level plane at their height");
  const tilt = va.planeFrom3([0, 0, 0], [1, 0, 0], [0, 1, 1]);
  near(tilt.dip_deg, 45, "P4 · a plane rising 1 in 1 northwards dips 45°", 1e-3);
  near(tilt.dip_direction_deg, 180, "P4 · …towards the south (180°)", 1e-3);
  eq(va.planeFrom3([0, 0, 0], [1, 1, 1], [2, 2, 2]), null, "P4 · three points on a line: no plane");
  eq(va.readingOf("plane3", [[0, 0, 0], [1, 1, 1], [2, 2, 2]], null, T), null, "P4 · …and no reading");
  const face = va.readingOf("planeFace", [va.toGltf([0, 0, 5])], va.toGltf([0, 0, -2]), T);
  eq([face.trace.kind, face.regionData.plane.normal, face.regionData.plane_from, face.value], ["point", [0, 1, 0], "face", 5],
     "P4 · a face: its normal, turned up (stored in the frame of the coords: glTF's up is Y)");
  const tiltG = va.readingOf("plane3", [[0, 0, 0], [1, 0, 0], va.toGltf([0, 1, 1])], null, T);
  near(tiltG.regionData.plane.dip_deg, 45, "P4 · three clicks on a slope: its dip, read in the document's frame", 1e-3);
  near(tiltG.regionData.plane.dip_direction_deg, 180, "P4 · …and its direction (from the frame's north)", 1e-3);
  const ln = va.readingOf("line", [[0, 0, 0], [3, 4, 0]], null, T);
  eq([ln.trace.kind, ln.value, ln.result], ["line", 5, "lung 5.000"], "P4 · a line: its length");
  eq(va.readingOf("line", [[0, 0, 0]], null, T), null, "P4 · a line of one point is no reading");
  eq(Object.keys(va.CLICKS), [...va.VIEWER_3D_TOOLS], "P4 · every tool says how many clicks it takes");
}

// ── Parte 4 · the extraction born in the Viewer, and «Interpretazione» ─────
{
  const st = new DocumentStore({ version: "1", graph: JSON.parse(JSON.stringify(G)), layout: {} });
  const before = st.undoDepth ?? 0;
  const r = va.readingOf("elevation", [[1, 492.5, -2]], null, { spot: (z) => `quota ${z} m`, impost: () => "", plane: () => "", length: () => "" });
  const made = chain.addFreeExtraction(st, "D1", r.trace, { regionData: r.regionData, result: r.result });
  ok(made && st.node(made.extractorId)?.node_type === "extractor", "P4 · the mark makes an extractor");
  eq(chain.sourceOf(st.doc, made.extractorId)?.id, "D1", "P4 · …that points at the document");
  eq(chain.readingsOfDocument(st.doc, "D1"), [made.extractorId], "P4 · …and is among its extractions (the Inspector's list)");
  const reg = st.node(made.regionId);
  eq([reg.data.geometry_kind, reg.data.coords, reg.data.reading_kind, reg.data.value, reg.data.crs, reg.data.resource_id],
     ["point", [[1, 492.5, -2]], "spot_height", 492.5, "local", "D1"], "P4 · its region: the coordinates in the model's frame, what was read, its value");
  eq(chain.resultOf(st.doc, made.extractorId), "quota 492.500 m", "P4 · the value read is the extractor's result («Usa come valore» writes it)");
  eq(chain.propertyOfExtractor(st.doc, made.extractorId), null, "P4 · it feeds nothing yet");
  eq((st.undoDepth ?? 0) - before, 1, "P4 · one undo step");
  ok(chain.linkExtraction(st, "P1", made.extractorId), "P4 · «Interpretazione»: it feeds a property");
  eq(chain.propertyOfExtractor(st.doc, made.extractorId), "P1", "P4 · …the property chosen");
  const second = chain.addFreeExtraction(st, "D1", { kind: "point", vertices: [[0, 0, 1]] }, { result: "quota 1" });
  chain.linkExtraction(st, "P1", second.extractorId);
  const prov = chain.provenanceOf(st.doc, "P1");
  eq([prov.combiners.length, prov.direct.length, (prov.combined.get(prov.combiners[0]) ?? []).length], [1, 0, 2],
     "P4 · a second interpretation of the same property makes the combiner, both under it");
  eq(chain.linkExtraction(st, "P1", second.extractorId), false, "P4 · linking again what is linked: nothing");
  st.undo();
  st.undo();
  eq(chain.propertyOfExtractor(st.doc, made.extractorId), "P1", "P4 · undo goes back one gesture at a time");
}

// ── Parte 6 · the three sheets ─────────────────────────────────────────────
if (LEDGER) {
  const ctx = { t: (k) => k, where: () => null, ai: () => "none", isUnit: (t) => t === "US" };
  const doc = { graph: G };
  const res = ledger.resourceRows(doc, ctx);
  eq(res.map((r) => [r.name, r.docs]), [["A mesh", ["D1"]], ["Link to D.2", ["D2"]], ["Link to D.2.01", ["D2"]]],
     "P6 · Resources: every resource, with the documents that recall it (directly, through a model, through an extractor)");
  const int = ledger.interpretationRows(doc, ctx);
  eq(int.map((r) => [r.name, r.docId, r.reads]), [["D.2.01", "D2", "document"], ["D.2.02", "D2", "region"]],
     "P6 · Interpretations: the document they read and what they read");
  eq(ledger.combinerRows(doc), [], "P6 · Combiners: none here");
  const h = ledger.ledgerTableHtml(doc, "Resources", ctx, () => true);
  ok(/<tr data-row="R1">/.test(h.html) && /data-go="D1"/.test(h.html), "P6 · a row is the node (data-row), «↑ D.1» goes to the document");
  eq(h.count, 3, "P6 · …counted");
  eq([...ledger.ledgerIds(doc, "Interpretations")].sort(), ["X1", "X2"], "P6 · the ids a sheet holds (the focus asks)");
}

// ── on the Templu Mare v3.3, when the copy is there (read only) ────────────
const V33 = process.env.VIEWER_V33 ?? "/tmp/viewer/EM/TempluMare_v3.3.em.json";
if (existsSync(V33)) {
  const before = statSync(V33).mtimeMs;
  const full = JSON.parse(readFileSync(V33, "utf8"));
  const gid = Object.keys(full.graphs).find((k) => k !== "shelf");
  const g = full.graphs[gid];
  const byName = (nm) => g.nodes.find((x) => x.name === nm && x.node_type === "document")?.id;
  const d01 = vn.viewerTargetOf(g, byName("D.01"));
  eq([d01.models.length, d01.groups.length], [10, 1], "v3.3 · D.01: the ten models of Survey2015 and the container");
  const d09 = vn.viewerTargetOf(g, byName("D.09"));
  eq([d09.parts.length, d09.models.length], [0, 87], "v3.3 · D.09: no file, 87 representation models (the 3D the old Doc showed under «0 file»)");
  eq(vn.viewerTargetOf(g, byName("D.07")).parts.length, 6, "v3.3 · D.07: its picture and the five crops of its extractors");
  const ctx = { t: (k) => k, where: () => null, ai: () => "none", isUnit: () => true };
  const doc = { graph: g };
  if (LEDGER) {
  eq(ledger.resourceRows(doc, ctx).length, 485, "v3.3 · Resources: 485 rows");
  eq(ledger.interpretationRows(doc, ctx).length, 301, "v3.3 · Interpretations: 301");
  eq(ledger.combinerRows(doc).length, 23, "v3.3 · Combiners: 23");
  eq(ledger.interpretationRows(doc, ctx).filter((r) => r.docId === byName("D.01")).length, 60, "v3.3 · the interpretations of D.01: 60");
  eq(ledger.combinerRows(doc).filter((r) => r.extractors.length === 1).length, 4, "v3.3 · the combiners with one interpretation: 4");
  }
  eq(statSync(V33).mtimeMs, before, "v3.3 · the copy was only read");
} else console.log(`  (the v3.3 copy is not at ${V33}: its cases are skipped)`);

console.log(`viewer-unico: ${checks} checks passed`);
