// MICRO-NARRATIVE-MODULI (13 Nov 2026) · every module of the text, inserted and
// drawn — the check that stays in the suite.
//
//   node scripts/check-narrative-moduli.mjs
//   NARR_V9=/tmp/…/TempluMare_v9.em.json node scripts/check-narrative-moduli.mjs
//
// For each of the ELEVEN view types of s3Dgraphy's NarrativeNode
// (`valid_view_types`) and for the mention «[[id]]»: it is inserted (the
// editor's mutator), drawn in Scrivi and in Leggi, it FOLLOWS the graph (a unit
// renamed, a node removed: it is a reference, not a copy), it survives a save
// and a reopening (the JSON round trip), and it becomes what the exporters say
// (citation, baked figure, figure, notebook cell or link). Then the edge cases:
// an empty epoch, a document with nothing to show, a scene with no model, a map
// with no position, a table whose question finds nothing — an honest line, never
// a broken box. With NARR_V9 (a COPY of Templu Mare v9) the cases E.D. saw.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Event = window.Event;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0 };
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * as V from "./narrative";
      export * as E from "./narrative-embeds";
      export * as ED from "./narrative-edit";
      export * as INS from "./narrative-inspector";
      export * as IDX from "./narrative-index";
      export * as P from "./narrative-projection";
      export { DocumentStore } from "./model";
      export { setLocale } from "./i18n";
    `,
    resolveDir: SRC, loader: "ts",
  },
  bundle: true, format: "esm", write: false, logLevel: "silent",
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const ICON_NODE_TYPES = new Set(); export const imageFor = () => null;
          export const imageForUrl = () => null; export const dtcGlyphUrl = () => null; export const iconUrl = () => null;`,
        loader: "ts" }));
    },
  }],
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const { V, E, ED, INS, IDX, P, DocumentStore } = M;
M.setLocale("en");

let pass = 0, fail = 0;
const ok = (c, what) => {
  if (c) { pass++; console.log(`  ✓ ${what}`); } else { fail++; console.log(`  ✗ ${what}`); }
};
const eq = (a, b, what) => {
  const same = JSON.stringify(a) === JSON.stringify(b);
  ok(same, same ? what : `${what} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};
const text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

// ── the small graph: every type has something to point at ───────────────────
const N = (id, node_type, name, data = {}, description) => ({ id, node_type, name, data, ...(description ? { description } : {}) });
const Ed = (source, target, edge_type) => ({ id: `${source}>${edge_type}>${target}`, source, target, edge_type });
const small = () => ({
  header: {},
  graph: {
    graph_id: "g", name: "Small",
    nodes: [
      N("G", "graph", "Small"),
      N("E1", "EpochNode", "II A.D.", { start_time: 100, end_time: 199 }),
      N("E2", "EpochNode", "Post antiquity", { start_time: 200, end_time: 1800 }),
      N("E3", "EpochNode", "Empty", { start_time: 1900, end_time: 1950 }),
      N("A1", "ActivityNodeGroup", "VAct.01 Lintel"),
      N("U1", "US", "SU019"),
      N("U2", "RSF", "RSF005"),
      N("U3", "USVn", "USV105"),
      N("U4", "SF", "T15"),
      N("D1", "document", "D.07", { url: "DosCo/plan.png" }, "Maison Carrée, plan"),
      N("D2", "document", "D.12", { url: "DosCo/report.pdf" }, "Cronica 2013"),
      N("D3", "document", "D.99", {}, "A note with no file"),
      N("D4", "document", "D.01", { geometry: "reality_based" }, "3D survey"),
      N("RM1", "representation_model", "SM_EST"),
      N("RM2", "representation_model", "SM_INT"),
      N("RG", "RepresentationModelNodeGroup", "Survey2015", { active_alternative: { "*": "container" } }),
      N("R1", "resource", "TempluMare tileset", { url: "SB/tileset.json", packaging: "directory" }),
      N("X1", "extractor", "D.07.01"),
      N("P1", "property", "height", { value: "3.2 m" }),
      N("PG", "property", "geometry", { property_type: "geometry" }),
      N("S1", "semantic_shape", "proxy USV105"),
      N("GP", "geo_position", "anchor", {}),
      N("UN", "un_scene", "A scene"),
    ],
    edges: [
      Ed("U1", "E2", "has_first_epoch"), Ed("U2", "E1", "has_first_epoch"), Ed("U2", "E2", "survive_in_epoch"),
      Ed("U3", "E1", "has_first_epoch"), Ed("U4", "E1", "has_first_epoch"), Ed("U3", "A1", "is_in_activity"),
      Ed("A1", "E1", "has_first_epoch"), Ed("U1", "U2", "is_after"),
      Ed("X1", "D1", "extracted_from"), Ed("P1", "X1", "has_data_provenance"), Ed("U1", "P1", "has_property"),
      Ed("U3", "PG", "has_property"), Ed("PG", "S1", "has_semantic_shape"),
      Ed("D4", "RM1", "has_representation_model"), Ed("E1", "RM2", "has_representation_model"),
      Ed("RM1", "RG", "is_in_representation_model_group"), Ed("RM2", "RG", "is_in_representation_model_group"),
      Ed("RG", "R1", "has_linked_resource"),
    ],
  },
  // the canvas's lanes: SU019 and the reused RSF005 drawn in Post antiquity's band
  layout: {
    swimlanes: [{ epoch_id: "E2", y: 0, height: 100 }, { epoch_id: "E1", y: 100, height: 100 }],
    positions: { U1: { y: 10, h: 20 }, U2: { y: 40, h: 20 }, U3: { y: 120, h: 20 }, U4: { y: 150, h: 20 } },
  },
});

const isStrat = (t) => /^(US|USV|USVn|USVs|USD|SF|VSF|RSF|ser|TSU|UL|USN|USNt|BR|SE)/.test(String(t));
const TYPES = ["matrix", "scene3d", "us", "rm", "document", "source", "paradata", "map", "timeline", "table", "un_scene"];
// the node each type is inserted on, in the small graph
const REF = { matrix: "E2", scene3d: "RG", us: "U1", rm: "RM1", document: "D1", source: "D1", paradata: "U1",
              map: "G", timeline: "A1", table: "G", un_scene: "UN" };

console.log("\nT0 · the vocabulary is the datamodel's");
eq([...ED.VIEW_TYPES].sort(), [...TYPES].sort(), "the eleven view types of s3Dgraphy's NarrativeNode");
eq(V.renderedViewTypes().sort(), [...TYPES].sort(), "…and each has a renderer");

// ── insert every type through the editor's mutator ───────────────────────────
console.log("\nT1 · inserted (the editor's mutator, one undo step each) and drawn in Scrivi and Leggi");
const doc0 = small();
doc0.graph.nodes.push(N("NR", "narrative", "Story", { chapters: [{ title: "One", blocks: [{ block_type: "prose", text: "SU019 is [[U1]]." }] }] }));
const st = new DocumentStore(JSON.parse(JSON.stringify(doc0)));
for (const vt of TYPES) {
  const before = st.doc.graph.nodes.find((n) => n.id === "NR").data.chapters[0].blocks.length;
  ED.addEmbed(st, "NR", 0, REF[vt], vt);
  const after = st.doc.graph.nodes.find((n) => n.id === "NR").data.chapters[0].blocks.length;
  ok(after === before + 1, `${vt} · inserted`);
}
const editor = {
  narrativeId: "NR", renameChapter: () => {}, setProse: () => {}, addEmbed: () => {}, lanes: () => [],
  canGenerate: () => false, generating: () => false, pendingIn: () => 0, signer: () => null,
};
const drawn = (doc, reading) => {
  const host = document.createElement("div");
  V.renderNarrativeView(host, doc, "NR", () => {}, reading === "read" ? () => {} : undefined,
    reading === "write" ? editor : undefined, undefined, undefined, { reading, onSelectPart: () => {}, onInsert: () => {} });
  return host;
};
const blockOf = (host, i) => host.querySelector(`.nv-block-row[data-block="0:${i}"]`);
for (const reading of ["write", "read"]) {
  const host = drawn(st.doc, reading);
  TYPES.forEach((vt, i) => {
    const row = blockOf(host, i + 1);
    const t = text(row);
    ok(row && row.querySelector(".nv-embed") && !/not rendered yet|unresolved reference/.test(t),
       `${vt} · drawn in ${reading === "write" ? "Scrivi" : "Leggi"} («${t.slice(0, 60)}»)`);
  });
  ok(text(host).includes("SU019 is SU019"), `mention · drawn as the unit's name in ${reading}`);
}

// ── what each one SHOWS (the cases E.D. saw) ─────────────────────────────────
console.log("\nT2 · what each module shows");
const g = st.doc;
const node = (id) => g.graph.nodes.find((n) => n.id === id);
{
  const m = E.matrixEmbed(node("E2"), g);
  const lanes = [...m.querySelectorAll(".nv-matrix-lane-label")].map(text);
  eq(lanes, ["Post antiquity"], "p.7 · the matrix of ONE epoch has ONE lane (the reused find does not open «II A.D.»)");
  const reused = m.querySelector(".nv-chip-reused");
  ok(reused && text(reused).includes("RSF005") && (reused.getAttribute("title") ?? "").includes("II A.D."),
     "p.7 · …the reused RSF005 is in it, marked ↺, its first epoch in the tooltip");
  const whole = E.matrixEmbed(node("G"), g);
  ok([...whole.querySelectorAll(".nv-matrix-lane-label")].length >= 2, "p.7 · the whole graph keeps a lane per first epoch");
}
{
  const host = drawn(st.doc, "read");
  const sc = blockOf(host, 2);
  ok(text(sc).includes("Survey2015") && text(sc).includes("2 models") && text(sc).includes("tileset"),
     "p.12 · the scene of a CONTAINER says its models and its alternative with the choice kept");
  const c = E.sceneContent(node("E1"), g);
  eq([c.models, c.proxies], [["RM2"], ["U3"]], "p.12 · the scene of an EPOCH: its models and its units' proxies");
  eq(E.sceneContent(node("D4"), g).models, ["RM1"], "p.12 · the scene of a document that publishes models");
  eq(E.sceneContent(node("E3"), g).models.length + E.sceneContent(node("E3"), g).proxies.length, 0, "p.12 · an empty epoch has nothing to show");
  const refs = P.refsForViewType("scene3d", g, isStrat).map((n) => P.scene3dRefKind(n));
  ok(refs.includes("epoch") && refs.includes("group") && refs.includes("document") && refs.includes("graph"),
     "p.12 · a scene is offered on the graph, an epoch, a container, a document with models");
  ok(!P.viewTypesFor(node("D1"), isStrat, () => false, g).includes("scene3d"), "p.12 · …not on a document without models");
  ok(P.viewTypesFor(node("D4"), isStrat, () => false, g).includes("scene3d"), "p.12 · …but on D.01, which publishes them");
}
{
  const host = drawn(st.doc, "read");
  const d = text(blockOf(host, 5)), s = text(blockOf(host, 6));
  ok(d !== s, "p.13 · Document and Source of the same node are not the same box");
  ok(d.includes("Maison Carrée") && d.includes("plan.png"), "p.13 · Document: the citation and the file");
  ok(s.includes("D.07.01") && s.includes("height") && s.includes("SU019"), "p.13 · Source: who reads it, what it yields, for which unit");
  const p = text(blockOf(host, 7));
  ok(p.includes("D.07") && p.includes("D.07.01") && p.includes("height"), "p.13 · Paradata: the chain source → extractor → property");
}
{
  const rows = E.tableRows(node("G"), g, { types: ["USVn", "SF"], sort: { key: "name", dir: "asc" }, columns: ["name", "epoch"] });
  eq(rows.units.map((u) => u.name), ["T15", "USV105"], "p.18 · a table filtered by type and ordered by name");
  eq(rows.cols.map((c) => c.key), ["name", "epoch"], "p.18 · …with the columns chosen");
  const ch = E.tableRows(node("G"), g, { scope: "chapter" }, V.citedContext(st.doc.graph.nodes.find((n) => n.id === "NR").data.chapters[0].blocks, 99));
  eq(ch.units.map((u) => u.name), ["SU019"], "p.18 · scope «units cited in the chapter» (mention + embeds)");
  const ep = E.tableRows(node("G"), g, { scope: "E1" });
  eq(ep.units.map((u) => u.name).sort(), ["T15", "USV105"].sort(), "p.18 · scope: an epoch (the canvas's band)");
}

// ── it follows the graph: a reference, not a copy ────────────────────────────
console.log("\nT3 · it follows the graph (rename a unit, remove a source)");
{
  const d2 = JSON.parse(JSON.stringify(st.doc));
  d2.graph.nodes.find((n) => n.id === "U1").name = "SU019-bis";
  const host = drawn(d2, "read");
  for (const [vt, i] of [["matrix", 1], ["us", 3], ["paradata", 7], ["table", 10], ["source", 6]])
    ok(text(blockOf(host, i)).includes("SU019-bis"), `${vt} · says the new name`);
  ok(text(host).includes("SU019 is SU019-bis"), "mention · says the new name (the text keeps [[U1]])");
  const d3 = JSON.parse(JSON.stringify(st.doc));
  d3.graph.nodes = d3.graph.nodes.filter((n) => n.id !== "D1");
  const h3 = drawn(d3, "read");
  ok(text(blockOf(h3, 5)).includes("unresolved reference"), "document · a removed node is said, not a broken box");
  const d4 = JSON.parse(JSON.stringify(st.doc));
  d4.graph.nodes = d4.graph.nodes.filter((n) => n.id !== "U1");
  ok(text(drawn(d4, "read")).includes("U1 ?"), "mention · a removed node shows its id and «?», not a hole");
}

// ── save and reopen ──────────────────────────────────────────────────────────
console.log("\nT4 · saved and reopened (the JSON round trip draws the same page)");
{
  const before = text(drawn(st.doc, "read"));
  const reopened = JSON.parse(JSON.stringify(st.doc));
  eq(text(drawn(reopened, "read")), before, "the page after a reopening is the page before");
  const blocks = reopened.graph.nodes.find((n) => n.id === "NR").data.chapters[0].blocks;
  eq(blocks.slice(1).map((b) => b.view_type), TYPES, "every block keeps its view type");
}

// ── what the exporters make of each ──────────────────────────────────────────
console.log("\nT5 · exports: citation, baked figure, figure, notebook cell or link");
{
  const index = new Map(st.doc.graph.nodes.map((n) => [n.id, n]));
  const chs = st.doc.graph.nodes.find((n) => n.id === "NR").data.chapters;
  const { items } = P.printItems(chs, index);
  const kinds = items.filter((x) => x.kind !== "chapter" && x.kind !== "prose").map((x) => x.kind === "figure" ? (x.baked ? "baked" : "figure") : x.kind);
  eq(kinds, ["baked", "baked", "figure", "figure", "citation", "citation", "figure", "figure", "figure", "figure", "figure"],
     "DOCX · LaTeX: matrix, scene3d baked; document, source cited; the rest figures");
  const prose = items.find((x) => x.kind === "prose");
  ok(prose.segments.some((s) => s.mention === "SU019"), "the printed text keeps the unit's NAME for a mention");
  const nb = P.notebookCells("Story", chs, index);
  const nbKinds = nb.slice(4).map((c) => c.cell_type === "code" ? "cell" : c.source.includes("navigated") ? "link" : "md");
  eq(nbKinds.filter((k) => k !== "md").length + nbKinds.filter((k) => k === "link").length * 0, 11, "Jupyter: one cell or link per module");
  ok(nb.some((c) => c.source.includes("embed · scene3d")) && nb.some((c) => c.source.includes("embed · un_scene")), "…scene3d and un_scene are links");
}

// ── the edge cases ───────────────────────────────────────────────────────────
console.log("\nT6 · edge cases: an honest line, never a broken box");
{
  ok(E.matrixEmbed(node("E3"), g).querySelector(".nv-empty"), "an empty epoch: «no unit in this epoch»");
  const d = JSON.parse(JSON.stringify(st.doc));
  d.graph.nodes.find((n) => n.id === "NR").data.chapters[0].blocks.push(
    { block_type: "embed", ref: "D3", view_type: "document" },
    { block_type: "embed", ref: "E3", view_type: "scene3d" },
    { block_type: "embed", ref: "G", view_type: "table", options: { types: ["BR"] } },
    { block_type: "embed", ref: "D2", view_type: "source" },
    { block_type: "embed", ref: "D4", view_type: "document" });
  const host = drawn(d, "read");
  const n0 = TYPES.length + 1;
  ok(text(blockOf(host, n0)).includes("Nothing to show here"), "a document with nothing to show says so in one line");
  ok(blockOf(host, n0 + 1).querySelector(".nv-empty") && text(blockOf(host, n0 + 1)).includes("Nothing to show yet"), "a scene with no model and no proxy: «nothing yet»");
  ok(blockOf(host, n0 + 2).querySelector(".nv-empty"), "a table whose question finds no row: «nothing yet»");
  ok(text(blockOf(host, n0 + 3)).includes("No extractor reads this source yet"), "a source nobody reads says so");
  ok(text(blockOf(host, n0 + 4)).includes("1 model") && !text(blockOf(host, n0 + 4)).includes("Nothing to show"),
     "a document with no file that publishes models (D.01): its models, not «nothing»");
  ok(/not placed|site/i.test(text(blockOf(host, 8))), "a map of a graph with no position says so (and offers the picker in the editor)");
  for (const row of host.querySelectorAll(".nv-block-row"))
    if (/not rendered yet/.test(text(row))) ok(false, `no placeholder: ${text(row).slice(0, 60)}`);
}

// ── the gestures on chapters, the signature, the language ────────────────────
console.log("\nT7 · chapters where one writes; dragged; a signature undone by an edit; the story's language");
{
  const s = new DocumentStore(JSON.parse(JSON.stringify(doc0)));
  ED.addProse(s, "NR", 0, "second");
  ED.addProse(s, "NR", 0, "third");
  const made = ED.insertChapterAt(s, "NR", 0, 2);
  const cs = () => s.node("NR").data.chapters;
  eq([made, cs().length, cs()[0].blocks.length, cs()[1].blocks.map((b) => b.text)], [1, 2, 2, ["third"]],
     "p.8 · «Nuovo capitolo qui» between two blocks: the title goes there, what follows is its text");
  s.undo();
  eq(cs().length, 1, "p.8 · …one undo step");
  ED.insertChapterAt(s, "NR", 0);
  ED.renameChapter(s, "NR", 1, "Two");
  ED.moveChapterTo(s, "NR", 1, 0);
  eq(cs().map((c) => c.title), ["Two", "One"], "p.10 · a chapter dragged before another");
  s.undo();
  eq(cs().map((c) => c.title), ["One", "Two"], "p.10 · …and Undo takes it back");
  ED.editChapters(s, "NR", (c) => { c[0].blocks.push({ block_type: "prose", text: "AI text", ai_generated: true, validated_by: "AUTH" }); });
  const bi = cs()[0].blocks.length - 1;
  ED.setProse(s, "NR", 0, bi, "AI text, changed");
  const b = cs()[0].blocks[bi];
  ok(!b.validated_by && b.ai_generated && b.options?.signed_before === "AUTH",
     "p.17 · an AI paragraph changed after the signature is to verify again (its origin and who had signed stay)");
  const en = ED.narrativeLang({}, [{ blocks: [{ block_type: "prose", text: "The courtyard original level is known from the excavation of 2013 and the stairs of the temple, which have the same measures as the ones of the building." }] }]);
  eq(en, { lang: "en", declared: false }, "p.16 · the story's language read from what is written (not the interface's)");
  eq(ED.narrativeLang({ lang: "it" }, []), { lang: "it", declared: true }, "p.16 · …a declared one wins");
}

// ── the Index and the Inspector ──────────────────────────────────────────────
console.log("\nT8 · the Index (one «+ Aggiungi…», coverage closed) and the Inspector");
{
  const host = document.createElement("div");
  let opened = false;
  IDX.renderNarrativeIndex(host, st.doc, { narrativeId: "NR", current: 0, onPick: () => {},
    onAddMenu: () => {}, onMoveChapter: () => {}, coverage: () => { opened = true; }, coverageOpen: false,
    laneLabel: (id) => (id === "A1" ? "II A.D. › VAct.01 Lintel" : id) });
  eq(host.querySelectorAll(".nidx-add button").length, 1, "p.9 · ONE «+ Aggiungi…» under the chapters");
  ok(host.querySelector("details.nidx-cov") && !host.querySelector("details.nidx-cov").open && !opened,
     "p.9 · the coverage is a section of its own, closed, not drawn until opened");
  ok(host.querySelector("li[draggable]"), "p.10 · the chapters can be dragged in the Index");
  const ih = document.createElement("div");
  const nrBlocks = st.doc.graph.nodes.find((n) => n.id === "NR").data.chapters[0].blocks;
  const ti = nrBlocks.findIndex((x) => x.view_type === "table");
  INS.renderNarrativeInspector(ih, { doc: st.doc, narrativeId: "NR", chapter: 0, block: ti,
    lanes: [{ id: "E1", label: "II A.D.", group: "II A.D." }, { id: "A1", label: "VAct.01 Lintel", group: "II A.D." }],
    identity: null, viewTypesFor: (n) => P.viewTypesFor(n, isStrat, () => false, st.doc), viewTypeLabel: (v) => v,
    onSetQuery: () => {}, onSetViewType: () => {}, onSetCaption: () => {}, onMove: () => {}, onDelete: () => {},
    onReveal: () => {}, pending: () => 0, canGenerate: () => false, generating: () => false });
  ok(ih.querySelector('[data-nvset="tbl-scope"]') && ih.querySelector('[data-nvset="tbl-sort"]')
     && ih.querySelector('[data-nvset^="tbl-col-"]') && ih.querySelector('[data-nvset^="tbl-type-"]'),
     "p.18 · the table's Inspector: scope, filters, columns, order");
  ok(ih.querySelector('[data-nvset="tbl-scope"] optgroup'), "p.15 · the lanes grouped by epoch");
  const di = document.createElement("div");
  INS.renderNarrativeInspector(di, { doc: st.doc, narrativeId: "NR", chapter: 0, block: 5,
    lanes: [], identity: null, viewTypesFor: (n) => P.viewTypesFor(n, isStrat, () => false, st.doc), viewTypeLabel: (v) => v,
    onSetQuery: () => {}, onSetViewType: () => {}, onSetCaption: () => {}, onMove: () => {}, onDelete: () => {},
    onReveal: () => {}, pending: () => 0, canGenerate: () => false, generating: () => false });
  const rows = [...di.querySelectorAll(".ninsp-vt-row")].map(text);
  ok(rows.length >= 3 && rows.every((r) => r.length > 12), "p.13 · «Shown as»: each choice with the line saying what it changes");
}

// ── Templu Mare v9 (a COPY) ──────────────────────────────────────────────────
const V9 = process.env.NARR_V9 ?? "/tmp/nvmod/T/EM/TempluMare_v9.em.json";
if (existsSync(V9)) {
  console.log(`\nV9 · ${V9} (read only)`);
  const file = JSON.parse(readFileSync(V9, "utf8"));
  const gid = file.active_graph_id;
  const doc = { header: file.header, graph: { ...file.graphs[gid], graph_id: gid }, layout: file.graphs[gid].layout ?? file.layout };
  const by = (pred) => doc.graph.nodes.find(pred);
  const post = by((n) => n.node_type === "EpochNode" && n.name === "Post antiquity");
  const m = E.matrixEmbed(post, doc);
  const lanes = [...m.querySelectorAll(".nv-matrix-lane-label")].map(text);
  ok(lanes.length >= 1 && lanes.every((l) => l !== "II A.D."), `p.7 · Post antiquity's matrix: no «II A.D.» lane (lanes: ${lanes.join(", ")})`);
  const reused = [...m.querySelectorAll(".nv-chip-reused")].map(text);
  ok(reused.some((r) => r.includes("RSF")), `p.7 · …the RSF reused are in it, marked (${reused.join(", ")})`);
  const rec = by((n) => n.node_type === "RepresentationModelNodeGroup" && n.name === "Reconstruction II AC");
  const sv = by((n) => n.node_type === "RepresentationModelNodeGroup" && n.name === "Survey2015");
  const d01 = by((n) => n.node_type === "document" && n.name === "D.01");
  const iiad = by((n) => n.node_type === "EpochNode" && n.name === "II A.D.");
  const cRec = E.sceneContent(rec, doc), cSv = E.sceneContent(sv, doc), cD01 = E.sceneContent(d01, doc), cII = E.sceneContent(iiad, doc);
  ok(cRec.models.length >= 80, `p.12 · Reconstruction II AC: ${cRec.models.length} models`);
  ok(cSv.models.length >= 9 && cSv.alternatives.length === 1, `p.12 · Survey2015: ${cSv.models.length} models and its tileset as the alternative`);
  ok(cD01.models.length >= 9, `p.12 · D.01 publishes ${cD01.models.length} models`);
  ok(cII.models.length >= 80 && cII.proxies.length > 0, `p.12 · the epoch II A.D.: ${cII.models.length} models, ${cII.proxies.length} unit proxies`);
  const refs = P.refsForViewType("scene3d", doc, isStrat);
  const proposed = refs.filter((n) => P.scene3dRefKind(n) !== "model");
  ok(proposed.length < 20 && refs.length > 90, `p.12 · the scene's menu proposes ${proposed.length} scopes (not the ${refs.length - proposed.length} models one by one)`);
  const du = E.sourceUse(d01, doc);
  ok(du.extractors.length >= 50, `p.13 · D.01 as Source: ${du.extractors.length} extractors, ${du.properties} properties, ${du.units.length} units`);
  const t = E.tableRows(by((n) => n.node_type === "graph"), doc, { scope: iiad.id, types: ["USVn"], sort: { key: "name" } });
  ok(t.units.length > 0 && t.units.every((u) => u.node_type === "USVn"), `p.18 · a table of II A.D., USVn only: ${t.units.length} rows`);
  const nar = by((n) => n.node_type === "narrative");
  eq(ED.narrativeLang(nar.data, nar.data.chapters).lang, "en", "p.16 · the v9 story is in English (declared)");
} else {
  console.log(`\nV9 · skipped: no copy at ${V9}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
