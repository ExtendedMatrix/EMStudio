// COLLEGARE · executable check of the narrative desk (3 ott 2026): the page is
// the reader, the Blocks menu, the map and the site, Verify as the identity,
// Stampa/Notebook faithful to s3Dgraphy's exporters, «Cita in…», the coverage,
// and one gesture = one undo step.
//
//   node scripts/check-narrative-desk.mjs
//
// The pure pieces run in node (one esbuild bundle, so one module instance): the
// page (`narrative.ts`) on a linkedom document, the mutators on a real
// `DocumentStore`, the projections and the coverage as data. FIDELITY is asked
// of s3Dgraphy itself: its sibling checkout's venv runs the exporters and the
// queries on the same fixture, and this compares. The same cases with a real
// mouse are the night's probes (`.claude/wip/reports/2026-10-03-collegare-spazi-racconto/`).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0 };
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * as V from "./narrative";
      export * as P from "./narrative-projection";
      export * as C from "./narrative-coverage";
      export * as ED from "./narrative-edit";
      export * as AU from "./narrative-authorship";
      export { issues } from "./issues";
      export { DocumentStore } from "./model";
      export { isStratigraphicType } from "./rules";
      export { renderSitePosition } from "./study-panel";
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
const { V, P, C, ED, AU } = M;

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// ── the fixture: one epoch, two units, two documents (one 3D), a property, the
//    graph, its 3D anchor, a model with a scene, and a story in two chapters ──
const N = (id, node_type, extra = {}) => ({ id, name: id, node_type, description: "", ...extra });
const Ed = (source, edge_type, target) => ({ id: `${source}__${edge_type}__${target}`, source, target, edge_type });
function fixture() {
  return {
    header: { format: "em.json", version: "1.0" },
    graph: {
      graph_id: "g1",
      nodes: [
        N("EP1", "EpochNode", { name: "Medioevo", data: { start_time: 1100, end_time: 1300 } }),
        N("u1", "US", { name: "US101" }), N("u2", "US", { name: "US102" }),
        N("D02", "document", { name: "D.02", description: "Rilievo 2026", data: { filename: "rilievo.glb" } }),
        N("D03", "document", { name: "D.03", description: "Scheda dei capitelli" }),
        N("p1", "property", { name: "height" }),
        N("G", "graph", { name: "pancia_A" }),
        N("GEO", "geo_position", { data: { epsg: 32633, shift_x: 282640, shift_y: 4694410 } }),
        N("RM1", "representation_model", { name: "RM muro", data: { url: "muro.glb" } }),
        N("AI1", "author_ai", { name: "frugale" }),
        N("NR1", "narrative", { name: "Il muro", data: { chapters: [
          { title: "Presentazione", blocks: [
            { block_type: "prose", text: "Questo racconto segue [[u1]]." },
            { block_type: "embed", ref: "D03", view_type: "document" }] },
          { title: "Medioevo", anchor: "EP1", blocks: [
            { block_type: "prose", text: "Bozza della macchina.", ai_generated: true, authored_by: "AI1" },
            { block_type: "embed", ref: "EP1", view_type: "matrix" },
            { block_type: "embed", ref: "G", view_type: "map" },
            { block_type: "prose", text: "" }] },
        ] } }),
      ],
      edges: [
        Ed("u1", "has_first_epoch", "EP1"), Ed("u2", "has_first_epoch", "EP1"),
        Ed("u1", "has_property", "p1"), Ed("RM1", "is_representation_model_of", "u2"),
      ],
    },
  };
}
const chaptersOf = (st) => st.node("NR1").data.chapters;
const isStrat = (t) => M.isStratigraphicType(t);
const is3d = (n) => /\.(glb|gltf)$/i.test(String(n.data?.filename ?? n.data?.url ?? ""));

// ── 1 · the Blocks menu: «+» and «/», then a Scena 3D on D.02 and a Tabella ──
{
  const doc = fixture();
  const calls = [];
  const editor = {
    narrativeId: "NR1", addChapter() {}, renameChapter() {}, moveChapter() {}, deleteChapter() {},
    toggleCanonical() {}, setAnchor() {}, addProse() {}, setProse() {}, addEmbed() {}, setViewType() {},
    moveBlock() {}, deleteBlock() {}, lanes: () => [], authors: () => [], humanAuthors: () => [],
    addAuthor() {}, removeAuthor() {}, setChapterAuthor() {}, signer: () => null, setSigner() {},
    endorse() {}, endorseChapter() {}, pendingIn: () => 0, canGenerate: () => false, generate() {}, generating: () => false,
    retract() {},
  };
  let picked = 0;
  V.setSitePicker(() => { picked++; });
  const host = document.createElement("div");
  V.renderNarrativeView(host, doc, "NR1", () => {}, undefined, editor, { index: () => 0, set: () => {} }, undefined, {
    reading: "write", onInsert: (c, at, _a, replace) => calls.push([c, at, !!replace]), onSelectPart() {},
  });
  const plus = host.querySelector('.nv-chapter[data-chapter="1"] .nv-ins-btn');
  plus.dispatchEvent(new window.Event("click", { bubbles: true }));
  eq(calls.shift(), [1, 0, false], "blocchi · il «+» fra i blocchi apre il menu al suo posto");
  const empty = host.querySelector('.nv-block-row[data-block="1:3"] .nv-prose-edit');
  const slash = new window.Event("keydown", { bubbles: true, cancelable: true });
  slash.key = "/";
  empty.dispatchEvent(slash);
  eq(calls.shift(), [1, 3, true], "blocchi · «/» su un paragrafo vuoto apre il menu, che lo sostituisce");
  // the map with no site: says so, and offers «Posiziona il sito…»
  const pickBtn = host.querySelector(".nv-site-pick");
  ok(pickBtn, "mappa · senza sito il blocco offre «Posiziona il sito…»");
  pickBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  eq(picked, 1, "mappa · …e il bottone apre il picker");
  V.setSitePicker(null);

  // «prima il blocco, poi cosa mostra»: the refs of each view type
  const refs = (vt) => P.refsForViewType(vt, doc, isStrat, is3d).map((n) => n.id);
  ok(refs("scene3d").includes("D02") && !refs("scene3d").includes("D03"),
     `blocchi · Scena 3D offre il documento 3D (D.02), non l'immagine — ${refs("scene3d")}`);
  eq(refs("scene3d")[0], "G", "blocchi · …e il grafo per primo");
  ok(refs("table").includes("EP1") && !refs("table").includes("u1"), "blocchi · Tabella: un ambito (epoca, grafo), non un'unità");
  // the inserts on a real store: each ONE undo step
  const st = new M.DocumentStore(fixture());
  st.batch(() => ED.addEmbed(st, "NR1", 1, "D02", "scene3d", 0));
  eq(chaptersOf(st)[1].blocks[0], { block_type: "embed", ref: "D02", view_type: "scene3d" }, "blocchi · Scena 3D su D.02 inserita al posto del «+»");
  st.batch(() => { ED.deleteBlock(st, "NR1", 1, 4); ED.addEmbed(st, "NR1", 1, "EP1", "table", 4); });
  eq(chaptersOf(st)[1].blocks.map((b) => `${b.block_type}:${b.view_type ?? ""}`),
     ["embed:scene3d", "prose:", "embed:matrix", "embed:map", "embed:table"],
     "blocchi · «/» + Tabella: il paragrafo vuoto diventa la Tabella");
  st.undo();
  eq(chaptersOf(st)[1].blocks.length, 5, "undo · la sostituzione torna indietro in UN passo (il paragrafo vuoto c'è di nuovo)");
  eq(chaptersOf(st)[1].blocks[4].block_type, "prose", "undo · …ed è il paragrafo di prima");
}

// ── 2 · the site: the picker writes site_position on the graph, never the shift ─
{
  const st = new M.DocumentStore(fixture());
  const geoBefore = JSON.stringify(st.node("GEO").data);
  const host = document.createElement("div");
  M.renderSitePosition(host, st);
  const [lat, lon] = host.querySelectorAll(".insp-geo-coord");
  lat.value = "45.9431";
  lat.dispatchEvent(new window.Event("change"));
  eq(st.readSitePosition(), null, "sito · la sola latitudine non scrive niente (prima scriveva lon 0)");
  lon.value = "22.953";
  lon.dispatchEvent(new window.Event("change"));
  eq(st.readSitePosition(), { lon: 22.953, lat: 45.9431, crs: "EPSG:4326" }, "sito · le due coordinate: site_position");
  const graph = st.doc.graph.nodes.find((n) => n.node_type === "graph");
  eq(graph.data.site_position?.lat, 45.9431, "sito · …scritta sul nodo del grafo");
  eq(JSON.stringify(st.node("GEO").data), geoBefore, "sito · …e lo shift (GeoPositionNode) non cambia");
}

// ── 3 · Verify: without an identity nothing; with it, AI ✓ and out of the warnings ─
{
  const st = new M.DocumentStore(fixture());
  const aiWarnings = () => M.issues({ doc: st.doc, nodes: st.doc.graph.nodes, isUnit: isStrat, t: (k) => k })
    .filter((i) => i.rule === "ai");
  eq(aiWarnings().length, 1, "verifica · il paragrafo AI è negli avvisi (regola ai)");
  eq(AU.verifyAs(st, "NR1", 1, 0, null), "needs-identity", "verifica · senza identità non firma: si apre l'identità");
  ok(!chaptersOf(st)[1].blocks[0].validated_by && !st.canUndo, "verifica · …e non scrive niente");
  const me = { orcid: "0000-0002-1825-0097", label: "Josiah Carberry" };
  eq(AU.verifyAs(st, "NR1", 1, 0, me), "verified", "verifica · con l'identità firma");
  const by = chaptersOf(st)[1].blocks[0].validated_by;
  eq([st.node(by)?.node_type, st.node(by)?.data?.orcid], ["author", me.orcid], "verifica · il firmatario è l'AuthorNode con l'ORCID dell'identità");
  eq(AU.blockStatus(chaptersOf(st)[1].blocks[0]), "ai_endorsed", "verifica · il paragrafo è AI ✓");
  eq(aiWarnings().length, 0, "verifica · …e lascia gli avvisi");
  st.undo();
  ok(!st.node(by) && !chaptersOf(st)[1].blocks[0].validated_by, "undo · autore e firma se ne vanno in UN passo");
  AU.verifyAs(st, "NR1", 1, 0, me);
  AU.signChapterAs(st, "NR1", 0, me);
  eq(st.doc.graph.nodes.filter((n) => n.node_type === "author").length, 1, "verifica · la stessa identità riusa lo stesso autore");
}

// ── 4 · Stampa and Notebook: the exporters' rules ────────────────────────────
{
  const doc = fixture();
  const index = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const chapters = doc.graph.nodes.find((n) => n.id === "NR1").data.chapters;
  const pr = P.printItems(chapters, index);
  ok(pr.items.some((i) => i.kind === "citation" && i.ref === "D03"), "stampa · un embed document diventa citazione");
  ok(pr.items.some((i) => i.kind === "figure" && i.ref === "EP1" && i.baked), "stampa · un matrix una figura, cotta all'export");
  ok(pr.items.some((i) => i.kind === "withheld" && i.chapter === 1 && i.block === 0), "stampa · il paragrafo non validato resta fuori");
  const forced = P.printItems(chapters, index, { force: true });
  ok(forced.items.some((i) => i.kind === "prose" && i.marked && i.segments[0].text === "Bozza della macchina."),
     "stampa · con la forzatura esce, marcato (⚠︎ accanto)");
  eq(pr.bibliography.map((b) => b.ref), ["D03"], "stampa · la bibliografia ha la fonte citata");
  const nb = P.notebookCells("Il muro", chapters, index);
  ok(!nb.some((c) => c.source.includes("Bozza della macchina")), "notebook · senza forzatura il paragrafo non validato non c'è");
  ok(nb.some((c) => c.cell_type === "code" && c.source.includes("metrics.units_per_epoch")), "notebook · il matrix è la cella di query di _CELLS");
  ok(P.notebookCells("Il muro", chapters, index, { force: true }).some((c) => c.marked && c.source.includes(P.UNVALIDATED_NOTICE)),
     "notebook · con la forzatura la cella porta l'avviso");
  eq(P.unvalidatedForExport(chapters), [{ chapter: 1, chapter_title: "Medioevo", block: 0 }], "export · l'elenco di ciò che resta fuori");
}

// ── 5 · «Cita in…» from a node of the coverage: the embed, and the numbers ────
{
  const st = new M.DocumentStore(fixture());
  const before = C.storyCoverage(st.doc, "NR1", isStrat).epochs.find((e) => e.id === "EP1");
  eq([before.cited, before.units.slice().sort()], [["u1"], ["u1", "u2"]], "copertura · 1/2: US101 citata (menzione), US102 no");
  ED.addEmbed(st, "NR1", 1, "u2", ED.defaultViewType(st.node("u2")));
  const after = C.storyCoverage(st.doc, "NR1", isStrat).epochs.find((e) => e.id === "EP1");
  eq(after.cited.slice().sort(), ["u1", "u2"], "cita in · l'embed aggiunto porta la copertura a 2/2");
  eq(C.unexplainedReconstructions(st.doc).map((r) => r.id), [], "cita in · …e il modello di US102 ora è spiegato");
  st.undo();
  eq(C.storyCoverage(st.doc, "NR1", isStrat).epochs.find((e) => e.id === "EP1").cited, ["u1"], "undo · un passo, e i numeri tornano");
  const marks = C.chapterCitedIds(st.doc, "NR1", 0);
  ok(marks.has("u1") && marks.has("D03"), "matrix · il capitolo marca ciò che cita (menzione ed embed)");
}

// ── 6 · FIDELITY: s3Dgraphy itself, on the same fixture ──────────────────────
const PY = new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname;
const S3D = new URL("../../../s3Dgraphy/src", import.meta.url).pathname;
if (!existsSync(PY)) {
  console.log("  (fidelity · s3Dgraphy venv not found at ../../s3Dgraphy/.venv — SKIPPED, say so in the report)");
} else {
  const dir = mkdtempSync(join(tmpdir(), "nvdesk-"));
  const path = join(dir, "fixture.em.json");
  writeFileSync(path, JSON.stringify(fixture()));
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(S3D)})
from s3dgraphy import api
from s3dgraphy.narrative import query as q
from s3dgraphy.narrative import bake
from s3dgraphy.exporter import latex_exporter as lx, ipynb_exporter as nb
from s3dgraphy.nodes import narrative_node as nn
doc = json.load(open(${JSON.stringify(path)}))
graph, _ = api.load_emjson(doc)
out = {
  "cited": list(lx.CITED_VIEW_TYPES), "deferred": list(bake.DEFERRED_RENDER_VIEW_TYPES),
  "scene": list(nb._SCENE_VIEW_TYPES), "cells": nb._CELLS, "notice": nn.UNVALIDATED_NOTICE,
  "coverage": q.interpretive_coverage(graph), "unexplained": q.unexplained_reconstructions(graph),
  "tex": api.export_narrative_latex(graph, "NR1", fragment=True)["tex"],
  "tex_forced": api.export_narrative_latex(graph, "NR1", fragment=True, include_unvalidated=True)["tex"],
  "left_out": api.narrative_unvalidated(graph, "NR1"),
}
print(json.dumps(out, default=str))
`;
  const py = JSON.parse(execFileSync(PY, ["-c", script], { encoding: "utf8" }));
  eq(P.CITED_VIEW_TYPES, py.cited, "fedeltà · CITED_VIEW_TYPES è quello di latex_exporter");
  eq(P.DEFERRED_RENDER_VIEW_TYPES, py.deferred, "fedeltà · DEFERRED_RENDER_VIEW_TYPES è quello di bake");
  eq(P.SCENE_VIEW_TYPES, py.scene, "fedeltà · _SCENE_VIEW_TYPES è quello di ipynb_exporter");
  eq(P.NB_CELLS, py.cells, "fedeltà · le celle del notebook sono _CELLS, verbatim");
  eq(P.UNVALIDATED_NOTICE, py.notice, "fedeltà · l'avviso è UNVALIDATED_NOTICE");
  const doc = fixture();
  const strip = (rows) => rows.map((r) => ({ id: r.id, narratives: r.narratives, direct: r.direct_citations, members: r.members }));
  eq(strip(C.interpretiveCoverage(doc)), strip(py.coverage), "fedeltà · interpretive_coverage: stesse righe del client");
  eq(C.unexplainedReconstructions(doc).map((r) => r.id), py.unexplained.map((r) => r.id), "fedeltà · unexplained_reconstructions idem");
  ok(!py.tex.includes("Bozza della macchina"), "fedeltà · LaTeX senza forzatura: il paragrafo non validato non c'è");
  ok(py.tex_forced.includes(py.notice) && py.tex_forced.includes("Bozza della macchina"), "fedeltà · con la forzatura c'è, con ⚠︎ accanto");
  const pr = P.printItems(doc.graph.nodes.find((n) => n.id === "NR1").data.chapters, new Map(doc.graph.nodes.map((n) => [n.id, n])));
  eq((py.tex.match(/\\cite\{/g) ?? []).length, pr.items.filter((i) => i.kind === "citation").length, "fedeltà · stesse citazioni dell'anteprima");
  eq((py.tex.match(/\\begin\{figure\}/g) ?? []).length, pr.items.filter((i) => i.kind === "figure").length, "fedeltà · stesse figure dell'anteprima");
  eq(py.left_out.map((r) => [r.chapter, r.block]), P.unvalidatedForExport(doc.graph.nodes.find((n) => n.id === "NR1").data.chapters).map((r) => [r.chapter, r.block]),
     "fedeltà · ciò che resta fuori è narrative_unvalidated");
}

console.log(`narrative-desk: ${checks} checks ✓`);
