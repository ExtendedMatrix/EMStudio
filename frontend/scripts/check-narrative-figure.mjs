// MICRO-SEG24 (21 Nov 2026) · the figures an epoch or an activity carries with
// it, their captions and numbers, and the story's coherence with the Matrix.
//
//   node scripts/check-narrative-figure.mjs
//
// From a part that narrates an epoch or an activity, «＋ Figure» offers its
// Matrix, 3D model, plan, three-quarter view, sub-epochs (refused ones say
// why); a figure is an embed with `options.figure` {kind, label, sig}, LIVE,
// numbered by chapter («Fig. 2.1»), captioned automatically (title, dates,
// «Extended Matrix · <file>») unless the author writes one, referred to with
// `[[fig:<label>]]`. «Coherence with the Matrix» says quietly what changed in
// the graph since — renamed, deleted, moved, split, divided, out of order, a
// figure whose content changed — each with a «Put it right» never applied alone.
import * as esbuild from "esbuild";
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
      export * as ED from "./narrative-edit";
      export * as INS from "./narrative-inspector";
      export * as P from "./narrative-projection";
      export * as F from "./narrative-figures";
      export * as C from "./narrative-coherence";
      export { DocumentStore } from "./model";
      export { setLocale, t } from "./i18n";
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
const { V, ED, INS, P, F, C, DocumentStore } = M;
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
const click = (el) => el.dispatchEvent(new window.Event("click", { bubbles: true }));

// ── a small site: II A.D. divided into two phases, two activities, units with proxies
const units = ["US1", "US2", "US3", "US4"];
const graph = (chapters, extra = {}) => ({
  header: {},
  graph: {
    graph_id: "g", name: "TempluMare",
    nodes: [
      { id: "E1", node_type: "EpochNode", name: "I A.D.", data: { start_time: 1, end_time: 100 } },
      { id: "E2", node_type: "EpochNode", name: "II A.D.", data: { start_time: 101, end_time: 200 } },
      ...(extra.phases === false ? [] : [
        { id: "E2b", node_type: "EpochNode", name: "Late II", data: { start_time: 151, end_time: 200 } },
        { id: "E2a", node_type: "EpochNode", name: "Early II", data: { start_time: 101, end_time: 150 } }]),
      { id: "A01", node_type: "ActivityNodeGroup", name: extra.a01 ?? "VAct.01 Foundations" },
      { id: "A02", node_type: "ActivityNodeGroup", name: "VAct.02 Walls" },
      ...(extra.a03 ? [{ id: "A03", node_type: "ActivityNodeGroup", name: "VAct.03 Floor" }] : []),
      ...units.map((u) => ({ id: u, node_type: "US", name: u })),
      ...units.map((u) => ({ id: `G${u}`, node_type: "property", name: "geometry", data: { property_type: "geometry" } })),
      ...units.map((u) => ({ id: `S${u}`, node_type: "semantic_shape", name: `${u}.glb` })),
      { id: "NR", node_type: "narrative", name: "TempluMare", data: { chapters, ...(extra.data ?? {}) } },
    ],
    edges: [
      { id: "ea1", source: "A01", target: extra.moveA01 ?? "E2", edge_type: "has_first_epoch" },
      { id: "ea2", source: "A02", target: "E2", edge_type: "has_first_epoch" },
      ...(extra.a03 ? [{ id: "ea3", source: "A03", target: "E2", edge_type: "has_first_epoch" }] : []),
      ...(extra.phases === false ? [] : [
        { id: "es1", source: "E2", target: "E2a", edge_type: "has_sub_epoch" },
        { id: "es2", source: "E2", target: "E2b", edge_type: "has_sub_epoch" }]),
      ...units.map((u) => ({ id: `ep${u}`, source: u, target: "E2", edge_type: "has_first_epoch" })),
      { id: "m1", source: "US1", target: "A01", edge_type: "is_in_activity" },
      { id: "m2", source: "US2", target: extra.splitUS2 ? "A03" : "A01", edge_type: "is_in_activity" },
      { id: "m3", source: "US3", target: "A02", edge_type: "is_in_activity" },
      { id: "m4", source: "US4", target: "A02", edge_type: "is_in_activity" },
      { id: "r1", source: "US2", target: "US1", edge_type: "is_after" },
      ...units.flatMap((u) => [{ id: `hp${u}`, source: u, target: `G${u}`, edge_type: "has_property" },
                               { id: `hs${u}`, source: `G${u}`, target: `S${u}`, edge_type: "has_semantic_shape" }]),
    ],
  },
});
const story = (st) => st.node("NR").data;
const chapters = (st) => story(st).chapters;
const base = () => [
  { title: "Introduction", blocks: [{ block_type: "prose", text: "Hello." }] },
  { title: "II A.D.", anchor: "E2", blocks: [
    { block_type: "prose", text: "The century." },
    { block_type: "heading", level: 1, text: "VAct.01 Foundations", options: { anchor: "A01" } },
    { block_type: "prose", text: "Dug." },
    { block_type: "heading", level: 1, text: "VAct.02 Walls", options: { anchor: "A02" } },
    { block_type: "prose", text: "Built." },
  ] },
];

console.log("\nA · what an epoch and an activity offer");
{
  const st = new DocumentStore(graph(base()));
  const kinds = (id) => F.figureChoices(st.node(id), st.doc).map((c) => `${c.kind}${c.why ? "✗" : ""}`);
  eq(kinds("E2"), ["matrix", "model", "plan", "three_quarter", "sub_epochs"], "an epoch: Matrix, 3D model, plan, 3/4 view, sub-epochs");
  eq(kinds("A01"), ["matrix", "model", "plan", "three_quarter"], "an activity: no sub-epochs");
  eq(kinds("E1"), ["matrix✗", "model✗", "plan✗", "three_quarter✗", "sub_epochs✗"], "an empty epoch: everything refused, with why");
  ok(F.figureChoices(st.node("E1"), st.doc).every((c) => c.why && c.why.length > 8), "…each refusal says why");
  eq(F.FIGURE_VIEW, { matrix: "matrix", model: "scene3d", plan: "scene3d", three_quarter: "scene3d", sub_epochs: "timeline" },
     "drawn with the datamodel's view types: no new one");
  eq(F.subEpochRows(st.doc, "E2").map((r) => `${r.name}:${r.start}-${r.end}`), ["Early II:101-150", "Late II:151-200"],
     "the sub-epochs, oldest first, with dates");
  eq(F.autoCaption("plan", st.node("E2"), st.doc, "TempluMare_v11.em.json"),
     "Plan of II A.D. (101 – 200) · Extended Matrix · TempluMare_v11.em.json", "the automatic caption: title, dates, source");
  eq(F.autoCaption("matrix", st.node("A01"), st.doc, null), "Matrix of VAct.01 Foundations (101 – 200) · Extended Matrix",
     "an activity with no dates of its own: its epoch's");
}

console.log("\nB · inserting: at the end of the part's own words, one undo step, a label, a signature");
{
  const st = new DocumentStore(graph(base()));
  const before = JSON.stringify(chapters(st));
  const at = ED.insertFigure(st, "NR", 1, null, "E2", "matrix");
  eq(at, { chapter: 1, block: 1, label: "f1" }, "from the chapter: before its first section");
  const b = chapters(st)[1].blocks[1];
  eq([b.block_type, b.ref, b.view_type, b.options.figure.kind, b.options.figure.label], ["embed", "E2", "matrix", "matrix", "f1"],
     "an ordinary embed, `options.figure` {kind, label}");
  ok(typeof b.options.figure.sig === "string" && b.options.figure.sig.length > 0, "…with the signature of what it shows");
  eq(story(st).narrated_seen?.E2?.name, "II A.D.", "what the story saw of the epoch is recorded (same edit)");
  st.undo();
  eq(JSON.stringify(chapters(st)), before, "⌘Z: one step, the story as it was");
  const at2 = ED.insertFigure(st, "NR", 1, 1, "A01", "plan");
  eq(at2, { chapter: 1, block: 3, label: "f1" }, "from a section: at the end of its run");
  eq(chapters(st)[1].blocks[3].view_type, "scene3d", "a plan is a scene3d");
  ED.insertFigure(st, "NR", 1, null, "E2", "sub_epochs");
  eq(F.figureOf(chapters(st)[1].blocks[1]).label, "f2", "a second figure: a new label");
  eq(chapters(st)[1].blocks[1].view_type, "timeline", "sub-epochs: a timeline");
  ED.setEmbedViewType(st, "NR", 1, 1, "matrix");
  ok(!F.figureOf(chapters(st)[1].blocks[1]), "a figure shown another way («Shown as» Matrix) becomes an ordinary embed");
  st.undo();
  ok(F.figureOf(chapters(st)[1].blocks[1])?.kind === "sub_epochs", "…undone, the figure is back");
}

console.log("\nC · numbers by chapter, print and the page");
{
  const st = new DocumentStore(graph(base()));
  ED.insertFigure(st, "NR", 1, null, "E2", "matrix");        // 1:1
  ED.insertFigure(st, "NR", 1, 2, "A01", "plan");             // after A01's run
  const chs = chapters(st);
  const idx = new Map(st.doc.graph.nodes.map((n) => [n.id, n]));
  const nums = F.figureNumbers(chs, true, (id) => idx.has(id));
  eq([...nums.values()], ["2.1", "2.2"], "numbered: «2.1», «2.2» (the chapter, then the place)");
  eq([...F.figureNumbers(chs, false).values()], ["1", "2"], "not numbered: a running number");
  eq(F.figureKey("scene3d", "A01", "plan"), "scene3d:A01#plan", "the export key carries the kind (s3Dgraphy `figure_key`)");
  const pr = P.printItems(chs, idx, { numbered: true }).items.filter((i) => i.kind === "figure").map((i) => i.number);
  eq(pr, ["2.1", "2.2"], "Print numbers them the same");
  // a reference in the text
  ED.editChapters(st, "NR", (cs) => { cs[1].blocks[0].text = "See [[fig:f2]] and [[fig:f9]]."; });
  const editor = { narrativeId: "NR", renameChapter: () => {}, setProse: () => {}, addEmbed: () => {}, lanes: () => [],
    canGenerate: () => false, generating: () => false, pendingIn: () => 0, signer: () => null };
  const menus = [];
  const draw = (reading) => {
    const host = document.createElement("div");
    V.renderNarrativeView(host, st.doc, "NR", () => {}, () => {}, reading === "write" ? editor : undefined, undefined, undefined,
      { reading, onSelectPart: () => {}, onFigureMenu: (c, b) => menus.push([c, b]), figureFile: "TempluMare_v11.em.json" });
    return host;
  };
  let host = draw("write");
  const caps = [...host.querySelectorAll(".nv-figcap")].map(text);
  eq(caps, ["Fig. 2.1 — Matrix of II A.D. (101 – 200) · Extended Matrix · TempluMare_v11.em.json",
            "Fig. 2.2 — Plan of VAct.01 Foundations (101 – 200) · Extended Matrix · TempluMare_v11.em.json"],
     "Write: under each figure its number and its caption (automatic, in italics)");
  ok(host.querySelector(".nv-figcap").classList.contains("nv-figcap-auto"), "…marked automatic");
  const refs = [...host.querySelectorAll(".nv-figref")].map(text);
  eq(refs, ["Fig. 2.2", "Fig. ?"], "`[[fig:f2]]` prints «Fig. 2.2»; a figure no longer there «Fig. ?»");
  eq(V.serializeProse(host.querySelector(".nv-figref").parentElement), "See [[fig:f2]] and [[fig:f9]].",
     "…and is written back as it was");
  const adds = [...host.querySelectorAll("[data-nv-figure]")];
  eq(adds.map((a) => a.dataset.nvFigure), ["1", "1:2", "1:5"], "«＋ Figure» beside the chips of the chapter and of each section");
  click(adds[1]);
  eq(menus.at(-1), [1, 2], "…a click opens the menu for that part");
  ok(host.querySelector(".nv-subepochs") === null, "no sub-epochs figure yet");
  // the author's caption wins
  ED.setEmbedCaption(st, "NR", 1, 1, "The epoch's Matrix, as laid out in 2026");
  host = draw("read");
  eq(text(host.querySelector(".nv-figcap")), "Fig. 2.1 — The epoch's Matrix, as laid out in 2026", "Read: the author's caption");
  ok(!host.querySelector("[data-nv-figure]"), "Read: no «＋ Figure»");
  host = draw("print");
  const figs = [...host.querySelectorAll(".nv-print-fig figcaption")].map(text);
  eq(figs, ["Figure 2.1 — The epoch's Matrix, as laid out in 2026",
            "Figure 2.2 — Plan of VAct.01 Foundations (101 – 200) · Extended Matrix · TempluMare_v11.em.json"],
     "Print: frozen with its caption (the author's, else the automatic one)");
  // sub-epochs drawn
  ED.insertFigure(st, "NR", 1, null, "E2", "sub_epochs");
  host = draw("write");
  eq([...host.querySelectorAll(".nv-subepochs [data-sub-epoch]")].map((r) => r.dataset.subEpoch), ["E2a", "E2b"],
     "the sub-epochs figure: one row per sub-epoch, oldest first");
  ok(F.subEpochsSvg(st.node("E2"), st.doc).includes("Early II · 101 – 150"), "…and as an SVG for the exports");
  // inspector
  const root = document.createElement("div");
  INS.renderNarrativeInspector(root, { doc: st.doc, narrativeId: "NR", chapter: 1, block: 5, lanes: [], identity: null,
    viewTypesFor: () => ["scene3d"], viewTypeLabel: (v) => v, onRename() {}, onRenameNarrative() {}, onSetDescription() {},
    onSetQuery() {}, onSignMe() {}, onToggleCanonical() {}, canGenerate: () => false, generating: () => false, onGenerate() {},
    pending: () => 0, onVerifyChapter() {}, onMove() {}, onDelete() {}, onVerify() {}, onRetract() {}, onReveal() {},
    onSetViewType() {}, onSetCaption() {}, figureNumber: "2.3", figureFile: "TempluMare_v11.em.json" });
  eq(text(root.querySelector('[data-nvset="figure"]')), "Fig. 2.3 · Plan", "the Inspector: which figure, its number");
  ok(root.querySelector('[data-nvset="cap"]').placeholder.startsWith("Plan of VAct.01 Foundations (101 – 200)"),
     "…the caption field shows the automatic one as its placeholder");
}

console.log("\nD · coherence with the Matrix: quiet notices, «Put it right» never alone");
{
  // the story made against the graph of that day
  const st0 = new DocumentStore(graph(base()));
  ED.setPartAnchors(st0, "NR", 1, 1, ["A01"]);       // already: nothing fresh
  ok(!story(st0).narrated_seen, "re-ticking what was narrated records nothing");
  ED.setPartAnchors(st0, "NR", 1, null, ["E2", "A02"]);
  eq(Object.keys(story(st0).narrated_seen ?? {}), ["A02"], "ticking records only what starts being narrated");
  const data0 = JSON.parse(JSON.stringify(story(st0)));
  let iss = C.coherenceIssues(st0.doc, data0);
  eq(iss.map((i) => i.kind), ["unrecorded"], "a file from before: one quiet line, «record them now»");
  ED.applyCoherence(st0, "NR", iss[0]);
  ED.insertFigure(st0, "NR", 1, 1, "A01", "matrix");
  ED.insertFigure(st0, "NR", 1, null, "E2", "plan");
  eq(C.coherenceIssues(st0.doc, story(st0)), [], "recorded: the story agrees with the Matrix");
  const made = JSON.parse(JSON.stringify(story(st0)));

  // the graph moved: A01 renamed, US2 left A01 for a new activity A03, E2 divided
  const st = new DocumentStore(graph(made.chapters, { a01: "VAct.01 Foundations of the temple", a03: true, splitUS2: true,
    data: { narrated_seen: made.narrated_seen } }));
  // (the record was taken with the phases there: take them away from the record to see «divided»)
  const seen = JSON.parse(JSON.stringify(story(st).narrated_seen));
  seen.E2.subs = [];
  ED.editChapters(st, "NR", () => {}, (d) => { d.narrated_seen = seen; });
  iss = C.coherenceIssues(st.doc, story(st));
  const kinds = iss.map((i) => i.kind);
  ok(kinds.includes("renamed") && kinds.includes("split") && kinds.includes("divided") && kinds.includes("figure_changed"),
     `renamed, split, divided, figure changed are said (${kinds.join(", ")})`);
  const ren = iss.find((i) => i.kind === "renamed");
  eq(ren.text, "«VAct.01 Foundations» is now called «VAct.01 Foundations of the temple» — VAct.01 Foundations", "renamed: in words, where");
  eq(ren.fix.kind, "retitle", "…the section still has the old name as title: «Retitle»");
  const pre = JSON.stringify(chapters(st));
  ED.applyCoherence(st, "NR", ren);
  eq(chapters(st)[1].blocks.find((b) => b.options?.anchor === "A01").text, "VAct.01 Foundations of the temple", "Retitle: the section's title follows");
  st.undo();
  eq(JSON.stringify(chapters(st)), pre, "…one undo step");
  ok(C.coherenceIssues(st.doc, story(st)).some((i) => i.kind === "renamed"), "nothing applied by itself: undone, the notice is back");
  const split = C.coherenceIssues(st.doc, story(st)).find((i) => i.kind === "split");
  eq(split.text, "«VAct.01 Foundations of the temple» was divided: 1 of its units are now in VAct.03 Floor", "split: said");
  ED.applyCoherence(st, "NR", split);
  ok(chapters(st)[1].blocks.some((b) => b.block_type === "heading" && b.options?.anchor === "A03" && b.text === "VAct.03 Floor"),
     "«Add a section for VAct.03 Floor»: a section narrating it, after VAct.01's run");
  const div = C.coherenceIssues(st.doc, story(st)).find((i) => i.kind === "divided");
  eq(div.fix.kind, "insert_sub_epochs", "divided: «Insert the sub-epochs figure»");
  ED.applyCoherence(st, "NR", div);
  ok(chapters(st)[1].blocks.some((b) => F.figureOf(b)?.kind === "sub_epochs"), "…inserted");
  const fig = C.coherenceIssues(st.doc, story(st)).find((i) => i.kind === "figure_changed");
  ok(fig && fig.text.includes("Matrix of"), "a figure whose content changed: said");
  ED.setBlockOptions(st, "NR", fig.chapter, fig.block, { still: "data:image/png;base64,AA" });
  ED.applyCoherence(st, "NR", fig);
  const fb = chapters(st)[fig.chapter].blocks[fig.block];
  ok(!fb.options.still && fb.options.figure.sig === F.figureSig(st.node(fb.ref), st.doc, "matrix"),
     "«Regenerate»: the new signature, the old still gone (taken again at export)");

  // moved to another epoch, deleted, order
  const st2 = new DocumentStore(graph([
    ...made.chapters,
    { title: "I A.D.", anchor: "E1", blocks: [] },
  ], { moveA01: "E1", data: { narrated_seen: made.narrated_seen } }));
  const mv = C.coherenceIssues(st2.doc, story(st2)).find((i) => i.kind === "moved");
  eq(mv.text, "«VAct.01 Foundations» moved from II A.D. to I A.D. — VAct.01 Foundations", "moved: from, to, where");
  eq(mv.fix.kind, "move", "…a chapter narrates the new epoch: «Move to «I A.D.»»");
  ED.applyCoherence(st2, "NR", mv);
  ok(chapters(st2)[2].blocks.some((b) => b.options?.anchor === "A01"), "…the section went there with its run");
  // order: swap the two sections by hand
  const st3 = new DocumentStore(graph(base(), { data: {} }));
  ED.editChapters(st3, "NR", (cs) => { const b = cs[1].blocks; cs[1].blocks = [b[0], b[3], b[4], b[1], b[2]]; });
  const ord = C.coherenceIssues(st3.doc, story(st3)).find((i) => i.kind === "order");
  eq(ord?.text, "The sections of «II A.D.» are not in the Matrix's order", "sections out of the Matrix's order: said");
  ED.applyCoherence(st3, "NR", ord);
  eq(chapters(st3)[1].blocks.map((b) => b.text), ["The century.", "VAct.01 Foundations", "Dug.", "VAct.02 Walls", "Built."],
     "«Reorder as the Matrix»: each section with its paragraphs");
  // deleted, with a node of the same name to relink to
  const st4 = new DocumentStore(graph(base(), { data: { narrated_seen: { A09: { name: "VAct.02 Walls", kind: "activity" } } } }));
  ED.editChapters(st4, "NR", (cs) => { cs[1].blocks[3].options = { anchor: "A09" }; });
  const gone = C.coherenceIssues(st4.doc, story(st4)).find((i) => i.kind === "missing");
  eq([gone.text, gone.fix.kind, gone.fix.arg], ["«VAct.02 Walls» is no longer in the graph — VAct.02 Walls", "relink", "A02"],
     "deleted: said; another «VAct.02 Walls» exists: «Relink»");
  ED.applyCoherence(st4, "NR", gone);
  eq(chapters(st4)[1].blocks[3].options.anchor, "A02", "…relinked");
}

console.log("\nE · the words, EN + IT");
{
  M.setLocale("it");
  eq([M.t("nv.fig.menuTitle"), M.t("nv.fig.kind.plan"), M.t("nv.fig.kind.three_quarter"), M.t("nv.coh.title"), M.t("nv.coh.fix.reorder")],
     ["Inserisci figura", "Planimetria", "Vista di tre quarti", "Coerenza con la Matrix", "Riordina come la Matrix"], "IT");
  const st = new DocumentStore(graph(base()));
  eq(F.autoCaption("plan", st.node("E2"), st.doc, "x.em.json"), "Planimetria di II A.D. (101 – 200) · Extended Matrix · x.em.json", "IT caption");
  M.setLocale("en");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
