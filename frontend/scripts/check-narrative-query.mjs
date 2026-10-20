// NARRATIVA-BLOCCHI (20 ott 2026): the story's title and subtitle written in
// the page with one undo step each, and the three blocks that ask the graph
// (Storia delle ricerche, Bibliografia, Beni coinvolti), their parameters, the
// bake Print / Notebook / the export read, and the scaffolder's standard
// blocks.
//
//   node scripts/check-narrative-query.mjs
//   NARR_V33=/path/TempluMare_v3.3.em.json node scripts/check-narrative-query.mjs
//
// The pure pieces run in node (one esbuild bundle, one module instance): the
// queries on a synthetic file of two graphs with an HDT-O chain nested where its
// arcs say «part of», the page on a linkedom document, the mutators on a real
// `DocumentStore`. With `NARR_V33` (a COPY of the GT16 file) the three blocks
// are asked on it and their counts printed — the file is only read.
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
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0 };
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * as V from "./narrative";
      export * as Q from "./narrative-query";
      export * as ED from "./narrative-edit";
      export * as SC from "./narrative-scaffold";
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
const { V, Q, ED, SC, INS, IDX, P, DocumentStore } = M;
M.setLocale?.("it");

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) { passes++; console.log(`  ✓ ${msg}`); } else { fails++; console.log(`  ✗ ${msg}`); } };
const eq = (a, b, msg) => { try { assert.deepEqual(a, b); ok(true, msg); } catch { ok(false, `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// ── fixtures ─────────────────────────────────────────────────────────────────
const node = (id, node_type, name, data = {}, description = "") => ({ id, node_type, name, description, data });
const edge = (source, edge_type, target) => ({ id: `${source}_${edge_type}_${target}`, source, edge_type, target });
/** graph A: a forum study, the forum (HC1), a temple inside it that is a good of
 *  its own (HC1, heritage_part_of), the forum's twin with a component twin, a
 *  project including the study; licence, author, embargo on the graph; three
 *  documents (a survey with geometry, a comparative D.1001, a source); a story
 *  citing one unit whose property is read from the source. */
function graphA() {
  return { header: {}, graph: { graph_id: "GA", name: "Foro", nodes: [
    node("GA_root", "graph", "Graph", { hdto_role: "proposition_set" }),
    node("GA_pd", "ParadataNodeGroup", "Graph paradata"),
    node("GA_au", "author", "Ada Rossi"),
    node("GA_lic", "license", "CC-BY", { license_type: "CC-BY-4.0" }),
    node("GA_emb", "embargo", "EB", { embargo_start: "2026-01-01", embargo_end: "2027-01-01" }),
    node("ST", "study", "Scavo del foro 2019", { hdto_role: "study", date: "2019", authors: "A. Rossi", code: "FO19" }),
    node("PR", "project", "Progetto Foro", { hdto_role: "project" }),
    node("HF", "heritage_entity", "Foro", { hdto_role: "about" }),
    node("HT", "heritage_entity", "Tempio nel foro"),
    node("TW", "hdt", "Foro HDT", { hdto_role: "twin" }),
    node("TW2", "hdt", "Tempio HDT"),
    node("US1", "US", "US 1"),
    node("P1", "property", "material"),
    node("X1", "extractor", "D.02.01"),
    node("D1", "document", "D.01", { geometry: "reality_based", url: "rilievo.pdf" }, "Rilievo fotogrammetrico del foro"),
    node("D2", "document", "D.1001", {}, "Tempio di confronto"),
    node("D3", "document", "D.02", { url: "scavo.pdf" }, "Rossi, Relazione di scavo"),
    node("N", "narrative", "Il foro", { chapters: [
      { title: "Intro", blocks: [{ block_type: "prose", text: "Nel foro [[US1]] è chiaro." }] }] }, "Un sottotitolo"),
  ], edges: [
    edge("GA_root", "has_paradata_nodegroup", "GA_pd"),
    edge("GA_au", "is_in_paradata_nodegroup", "GA_pd"),
    edge("GA_lic", "is_in_paradata_nodegroup", "GA_pd"),
    edge("GA_emb", "is_in_paradata_nodegroup", "GA_pd"),
    edge("PR", "includes_study", "ST"),
    edge("ST", "study_about_heritage", "HF"),
    edge("ST", "study_produced_proposition_set", "GA_root"),
    edge("HT", "heritage_part_of", "HF"),
    edge("HF", "has_digital_twin", "TW"),
    edge("TW", "has_digital_twin_component", "TW2"),
    edge("TW", "contains_proposition_set", "GA_root"),
    edge("US1", "has_property", "P1"),
    edge("P1", "has_data_provenance", "X1"),
    edge("X1", "extracted_from", "D3"),
    edge("D3", "has_author", "GA_au"),
  ], links: [{ source: "US1", edge_type: "is_after", target: { graph_id: "GB", node_id: "US9" } }] } };
}
/** graph B: an older campaign on the same forum (the same HC1 by id), 1975 */
function graphB() {
  return { header: {}, graph: { graph_id: "GB", name: "Campagna 1975", nodes: [
    node("GB_root", "graph", "Graph"),
    node("GB_pd", "ParadataNodeGroup", "Graph paradata"),
    node("GB_au", "author", "H. Daicoviciu"),
    node("GB_date", "property", "date", {}, "1975"),
    node("ST2", "study", "Scavi 1975", { hdto_role: "study", date: "1975" }),
    node("HF", "heritage_entity", "Foro"),
    node("US9", "US", "US 9"),
  ], edges: [
    edge("GB_root", "has_paradata_nodegroup", "GB_pd"),
    edge("GB_au", "is_in_paradata_nodegroup", "GB_pd"),
    edge("GB_root", "has_property", "GB_date"),
    edge("ST2", "study_about_heritage", "HF"),
  ] } };
}
const A = graphA(), B = graphB();
const graphs = [{ graphId: "GA", label: "Foro · FO19", doc: A }, { graphId: "GB", label: "Campagna 1975", doc: B }];
const chapters = A.graph.nodes.find((n) => n.id === "N").data.chapters;
const input = { graphs, here: "GA", chapters };
const ask = (query, extra = {}) => Q.runQuery(input, Q.queryOf({ block_type: "embed", options: { query, ...extra } }));
const titles = (r) => r.groups.flatMap((g) => g.rows.map((x) => `${"  ".repeat(x.depth)}${x.title}`));

console.log("\nQ0 · a query block is a table embed of the graph, its question in options");
eq(Q.queryOf({ block_type: "embed", ref: "GA_root", view_type: "table", options: { query: "heritage" } }),
   { query: "heritage", scope: "file", types: [...Q.QUERY_TYPES.heritage], order: "type" }, "defaults filled in");
eq(Q.queryOf({ block_type: "embed", ref: "x", view_type: "table" }), null, "a table embed without a question is not a query");
eq(Q.queryOf({ block_type: "prose", options: { query: "heritage" } }), null, "a paragraph is never a query");

console.log("\nQ1 · Storia delle ricerche — by date, with who, when, project, licence, the rapporti");
const h = ask("research_history");
eq(titles(h), ["Campagna 1975", "Foro · FO19"], "the two graphs, oldest first (1975, then the 2019 study)");
const rowA = h.groups[0].rows[1];
ok(rowA.lines.some((l) => /Ada Rossi/.test(l) && /A\. Rossi/.test(l)), "who: the graph's author and the study's");
ok(rowA.lines.some((l) => /Progetto Foro/.test(l)), "which project (HC13 through the chain)");
ok(rowA.lines.some((l) => /CC-BY-4\.0/.test(l) && /2026-01-01 → 2027-01-01/.test(l)), "licence and embargo, from the graph's paradata");
ok(rowA.lines.some((l) => /Campagna 1975/.test(l) && /× 1/.test(l)), "the rapporto with the other graph (one link)");
ok(h.groups[0].rows[0].lines.some((l) => /1975/.test(l)), "the older graph's date: its study's");
eq(rowA.id, "ST", "an entry leads to its study");
eq(titles(ask("research_history", { order: "date_desc" })), ["Foro · FO19", "Campagna 1975"], "order: newest first");
eq(titles(ask("research_history", { scope: "graph" })), ["Foro · FO19"], "scope «this graph»: only its own");
ok(ask("research_history", { scope: "graph" }).notes.some((n) => /1/.test(n)), "…and says the file has another graph");

console.log("\nQ2 · Bibliografia — grouped as the datamodel tells them apart, one citation form");
const b = ask("bibliography");
eq(b.groups.map((g) => [g.key, g.rows.map((r) => r.title)]),
   [["survey", ["D.01"]], ["comparative", ["D.1001"]], ["source", ["D.02"]]], "survey (geometry) · comparative (D.≥1000) · source");
eq(b.groups[2].rows[0].lines[0], "Ada Rossi. Rossi, Relazione di scavo — scavo.pdf", "the citation: authors, text, url");
const bn = ask("bibliography", { scope: "narrative" });
eq(bn.groups.flatMap((g) => g.rows.map((r) => r.title)), ["D.02"], "scope «this story»: the document its cited unit's property is read from");
eq(ask("bibliography", { types: ["survey"] }).count, 1, "types: only the surveys");
const f = Q.bibliographyFields(A);
eq([f.documents, f.description, f.url, f.author, f.year, f.doi], [3, 3, 2, 1, 0, 0], "the bibliographic fields measured");

console.log("\nQ3 · Beni coinvolti — every HDT-O node, nested only where an arc says «part of»");
const hz = ask("heritage", { order: "name" });
const tz = titles(hz);
ok(tz.includes("Foro") && tz.includes("  Tempio nel foro"), "the temple is nested under the forum (heritage_part_of)");
ok(tz.includes("Foro HDT") && tz.includes("  Tempio HDT"), "the component twin under its twin (has_digital_twin_component)");
ok(tz.includes("Progetto Foro") && tz.includes("  Scavo del foro 2019"), "the study under its project (includes_study)");
ok(tz.filter((x) => x.trim() === "Foro").length === 1, "the forum named by two graphs is ONE good");
const forum = hz.groups[0].rows.find((r) => r.id === "HF");
ok(forum.lines.some((l) => /Scavo del foro 2019/.test(l) && /Scavi 1975/.test(l)), "a good: the studies about it, from both graphs");
ok(forum.lines.some((l) => /CC-BY-4\.0/.test(l)), "…its licence (the graphs')");
ok(forum.lines.some((l) => /scala: non dichiarato/.test(l)), "…its scale, said to be undeclared (no field)");
ok(!tz.some((x) => x.startsWith("  ") && /Scavi 1975/.test(x)), "no hierarchy presumed: the 1975 study is not nested (no «part of» arc)");
eq(ask("heritage", { types: ["HeritageEntityNode"] }).count, 2, "types: only the HC1");
const hn = ask("heritage", { scope: "narrative" });
ok(hn.count >= 5 && !titles(hn).includes("Scavi 1975"), "scope «this story»: the chain of its graph, not the other graph's study");

console.log("\nQ4 · the page draws it live; Print and Notebook as text with the date");
const docA = JSON.parse(JSON.stringify(A));
docA.graph.nodes.find((n) => n.id === "N").data.chapters[0].blocks.push(
  { block_type: "embed", ref: "GA_root", view_type: "table", options: { query: "bibliography" } });
const host = document.createElement("div");
V.setQueryContext({ graphs: () => graphs.map((g) => (g.graphId === "GA" ? { ...g, doc: docA } : g)), go: () => {} });
V.renderNarrativeView(host, docA, "N", () => {});
const qb = host.querySelector('.nv-query[data-query="bibliography"]');
ok(qb && qb.dataset.count === "3" && qb.querySelectorAll(".nv-query-row").length === 3, "the block is drawn with its three documents");
docA.graph.nodes.push(node("D4", "document", "D.03", {}, "Nuovo documento"));
V.renderNarrativeView(host, docA, "N", () => {});
ok(host.querySelector('.nv-query[data-query="bibliography"]').dataset.count === "4", "…and redrawn from the graph: a new document is there");
V.renderNarrativeView(host, docA, "N", () => {}, undefined, undefined, undefined, undefined, { reading: "print" });
const printed = host.textContent;
ok(/Bibliografia — calcolato il \d{4}-\d{2}-\d{2}/.test(printed) && /Nuovo documento/.test(printed), "Print: the answer as text, with the date");
V.renderNarrativeView(host, docA, "N", () => {}, undefined, undefined, undefined, undefined, { reading: "notebook" });
ok(/calcolato il/.test(host.textContent) && !host.querySelector(".nv-query"), "Notebook: text, no live block");
const baked = Q.bakeQueries(docA.graph.nodes.find((n) => n.id === "N").data.chapters, { graphs, here: "GA", chapters: [] }, new Date("2026-10-20T10:00:00Z"));
ok(baked[0].blocks[1].block_type === "prose" && baked[0].blocks[1].options.baked_query === "bibliography", "the bake: a prose block, marked");
ok(/\[\[D1\]\]/.test(baked[0].blocks[1].text), "…an entry of the story's graph is a mention (the printed name leads to it)");
eq(P.printItems(baked, new Map(docA.graph.nodes.map((n) => [n.id, n]))).items.filter((i) => i.kind === "figure").length, 0,
   "…so the exporters print text, not a figure of the graph");
V.setQueryContext(null);

console.log("\nP1 · title and subtitle in the page, one undo step each; the Inspector writes the same field");
const st = new DocumentStore(JSON.parse(JSON.stringify(A)));
const before = JSON.parse(JSON.stringify(st.doc.graph.nodes.find((n) => n.id === "N")));
const editor = { renameNarrative: (v) => ED.renameNarrative(st, "N", v), setDescription: (v) => ED.setNarrativeDescription(st, "N", v),
  canGenerate: () => false };
const ph = document.createElement("div");
V.renderNarrativeView(ph, st.doc, "N", () => {}, undefined, editor, undefined, undefined, { reading: "write", onSelectPart: () => {} });
const h1 = ph.querySelector(".nv-title");
ok(h1.getAttribute("contenteditable") === "true", "the title is editable in Write");
h1.textContent = "Il foro di Sarmizegetusa";
h1.dispatchEvent(new window.Event("blur"));
eq(st.node("N").name, "Il foro di Sarmizegetusa", "blur writes the name");
st.undo();
eq(st.node("N").name, before.name, "one undo: the old title");
ED.setNarrativeDescription(st, "N", "");
V.renderNarrativeView(ph, st.doc, "N", () => {}, undefined, editor, undefined, undefined, { reading: "write" });
const lede = ph.querySelector(".nv-lede");
ok(lede && lede.classList.contains("nv-empty-lede") && lede.dataset.placeholder === "Aggiungi un sottotitolo", "an empty subtitle is offered («Aggiungi un sottotitolo»)");
lede.textContent = "Rilievo e analisi";
lede.dispatchEvent(new window.Event("blur"));
eq(st.node("N").description, "Rilievo e analisi", "the subtitle is written");
st.undo();
eq(st.node("N").description ?? "", "", "one undo: empty again");
ED.renameNarrative(st, "N", "   ");
eq(st.node("N").name, before.name, "an empty title is refused");
const meta = ph.querySelector(".nv-meta");
ok(meta.getAttribute("contenteditable") !== "true" && /Calcolato/.test(meta.title), "the template line is information, said to be computed");
// the Inspector of the story: the same field
const ins = document.createElement("div");
const hooks = { doc: st.doc, narrativeId: "N", chapter: -1, block: null, lanes: [], identity: null,
  viewTypesFor: () => [], viewTypeLabel: (x) => x, onRename: () => {}, onSetAnchor: () => {}, onSignMe: () => {},
  onToggleCanonical: () => {}, canGenerate: () => false, generating: () => false, onGenerate: () => {}, pending: () => 0,
  onVerifyChapter: () => {}, onMove: () => {}, onDelete: () => {}, onVerify: () => {}, onRetract: () => {}, onReveal: () => {},
  onSetViewType: () => {}, onSetCaption: () => {},
  onRenameNarrative: (v) => ED.renameNarrative(st, "N", v), onSetDescription: (v) => ED.setNarrativeDescription(st, "N", v),
  onSetQuery: () => {} };
INS.renderNarrativeInspector(ins, hooks);
const ti = ins.querySelector('[data-nvset="story-title"]');
ok(ti && ti.value === before.name, "the story's Inspector shows the title");
ti.value = "Dal pannello";
ti.dispatchEvent(new window.Event("change"));
eq(st.node("N").name, "Dal pannello", "…and writes it (the same field)");
// the chapter's title in the Inspector (onRename connected)
let renamed = null;
INS.renderNarrativeInspector(ins, { ...hooks, doc: st.doc, chapter: 0, onRename: (v) => { renamed = v; } });
const ct = ins.querySelector('[data-nvset="title"]');
ct.value = "Introduzione";
ct.dispatchEvent(new window.Event("change"));
eq(renamed, "Introduzione", "the chapter's title in the Inspector calls onRename");

console.log("\nP2 · the Inspector of a query block: scope, types, order — each one undo step");
const s2 = new DocumentStore(JSON.parse(JSON.stringify(A)));
ED.editChapters(s2, "N", (cs) => cs[0].blocks.push({ block_type: "embed", ref: "GA_root", view_type: "table", options: { query: "heritage" } }));
const qins = document.createElement("div");
INS.renderNarrativeInspector(qins, { ...hooks, doc: s2.doc, chapter: 0, block: 1,
  onSetQuery: (patch) => ED.setBlockOptions(s2, "N", 0, 1, patch) });
ok(qins.querySelector('[data-nvset="q-scope"]') && qins.querySelector('[data-nvset="q-order"]')
   && qins.querySelectorAll(".ninsp-q-types input").length === 5, "scope, order and the five HDT-O types are there");
const sc = qins.querySelector('[data-nvset="q-scope"]');
for (const o of sc.querySelectorAll("option")) { if (o.value === "graph") o.setAttribute("selected", ""); else o.removeAttribute("selected"); }
sc.dispatchEvent(new window.Event("change"));
const opts = () => s2.node("N").data.chapters[0].blocks[1].options;
eq(opts().scope, "graph", "scope written");
s2.undo();
eq(opts().scope, undefined, "one undo: back to the default");
const cb = qins.querySelector('[data-nvset="q-type-GraphNode"]');
cb.checked = false;
cb.dispatchEvent(new window.Event("change"));
eq(opts().types, ["HeritageEntityNode", "HDTNode", "StudyNode", "ProjectNode"], "a type unticked");

console.log("\nP3 · the scaffolder's standard blocks; an existing story only when asked");
const s3 = new DocumentStore(JSON.parse(JSON.stringify(B)));
const nid = SC.scaffoldNarrativeFromGraph(s3);
const cs = s3.node(nid).data.chapters;
eq(Q.queryOf(cs[0].blocks[0])?.query, "research_history", "Storia delle ricerche opens the story");
eq(Q.queryOf(cs[0].blocks.at(-1))?.query, "heritage", "Beni coinvolti after the introduction");
eq([Q.queryOf(cs.at(-1).blocks[0])?.query, cs.at(-1).canonical], ["bibliography", true], "Bibliografia closes it (a settled chapter)");
s3.undo();
eq(s3.doc.graph.nodes.filter((n) => n.node_type === "narrative").length, 0, "the whole scaffold is one undo step");
const s4 = new DocumentStore(JSON.parse(JSON.stringify(A)));
const nBefore = JSON.stringify(s4.node("N").data);
eq(SC.missingStandardBlocks(s4, "N"), ["research_history", "heritage", "bibliography"], "an existing story lacks them…");
eq(JSON.stringify(s4.node("N").data), nBefore, "…and is not touched by asking");
const ih = document.createElement("div");
let added = null;
IDX.renderNarrativeIndex(ih, s4.doc, { narrativeId: "N", current: 0, onPick: () => {}, onAddChapter: () => {},
  standardMissing: () => SC.missingStandardBlocks(s4, "N"), onAddStandard: () => { added = SC.addStandardBlocks(s4, "N"); } });
const btn = ih.querySelector('[data-nidxact="standard"]');
ok(btn, "the Index offers «Aggiungi i blocchi standard»");
btn.click();
eq(added, ["research_history", "heritage", "bibliography"], "…which adds the three");
eq(SC.missingStandardBlocks(s4, "N"), [], "…and then none is missing");
s4.undo();
eq(JSON.stringify(s4.node("N").data), nBefore, "one undo step");

// ── the GT16 copy ────────────────────────────────────────────────────────────
const V33 = process.env.NARR_V33 ?? "/tmp/narrblocchi/EM/TempluMare_v3.3.em.json";
if (existsSync(V33)) {
  console.log(`\nV33 · the three blocks on ${V33} (read only)`);
  const raw = readFileSync(V33, "utf8");
  const file = JSON.parse(raw);
  const gid = file.active_graph_id;
  const g = file.graphs[gid];
  const doc = { header: file.header, graph: { ...g, graph_id: gid } };
  const nar = g.nodes.find((n) => n.node_type === "narrative");
  const fileGraphs = Object.entries(file.graphs).filter(([k]) => k !== "shelf")
    .map(([k, v]) => ({ graphId: k, label: `${v.name}${v.code ? ` · ${v.code}` : ""}`, doc: { graph: { ...v, graph_id: k } } }));
  const inp = { graphs: fileGraphs, here: gid, chapters: nar.data.chapters };
  const run = (query, extra = {}) => Q.runQuery(inp, Q.queryOf({ block_type: "embed", options: { query, ...extra } }));
  const counts = {};
  for (const k of Q.QUERY_KINDS) for (const sc of Q.QUERY_SCOPES) {
    const r = run(k, { scope: sc });
    counts[`${k}/${sc}`] = { n: r.count, groups: Object.fromEntries(r.groups.map((x) => [x.key, x.rows.length])) };
  }
  console.log(JSON.stringify({ narrative: nar.name, chapters: nar.data.chapters.length, graphs: fileGraphs.length, counts,
    fields: Q.bibliographyFields(doc) }, null, 1));
  const hist = run("research_history");
  console.log(Q.queryParagraphs(hist, new Date(), gid).join("\n"));
  console.log(Q.queryParagraphs(run("heritage"), new Date(), gid).join("\n"));
  ok(counts["bibliography/graph"].n === g.nodes.filter((n) => n.node_type === "document").length, "bibliography: every document of the graph");
  ok(counts["research_history/file"].n === fileGraphs.length, "research history: one entry per graph of the file");
  ok(counts["heritage/graph"].n >= 1, "heritage: at least the proposition set");
  eq(readFileSync(V33, "utf8"), raw, "the copy was only read");
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
