// MICRO-SEG22 (21 Nov 2026) · sections and subsections, and «Transform into…».
//
//   node scripts/check-narrative-sezioni.mjs
//
// A story had the chapter and the paragraph; a «### Current researches»
// paragraph stood in for a title by hand. Now: chapter › section › subsection ›
// paragraph, the hierarchy born from the ORDER (a paragraph belongs to the
// nearest title above it), numbered 1, 1.1, 1.1.1 in Write, Read, Print and the
// notebook unless the story says `numbering: false`; every part with words can
// be transformed into another (menu, Inspector, Ctrl/Cmd+Alt+1/2/3/0), one undo
// step; a title moved in the Index takes its paragraphs; the «#» paragraphs are
// PROPOSED once, never transformed in silence; and a story with no title is
// exactly what it was.
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
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
      export * as O from "./narrative-outline";
      export * as INS from "./narrative-inspector";
      export * as IDX from "./narrative-index";
      export * as P from "./narrative-projection";
      export * as KM from "./keymap";
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
const { V, ED, O, INS, IDX, P, KM, DocumentStore } = M;
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

// ── E.D.'s case: «The Great Temple…», a «### Current researches» paragraph ──
const story = (extra = {}) => ({
  header: {},
  graph: {
    graph_id: "g", name: "TempluMare",
    nodes: [
      { id: "U1", node_type: "US", name: "SU019" },
      { id: "NR", node_type: "narrative", name: "TempluMare", data: { ...extra, chapters: [
        { title: "Introduction", blocks: [{ block_type: "prose", text: "The site." }] },
        { title: "The Great Temple: survey, analysis and reconstruction", anchor: "E1", blocks: [
          { block_type: "prose", text: "The temple stands on a podium." },
          { block_type: "prose", text: "### Current researches" },
          { block_type: "prose", text: "A survey in 2015 and a dig in 2022 near [[U1]]." },
          { block_type: "prose", text: "#### The cella\nIts walls are in opus caementicium." },
          { block_type: "embed", ref: "U1", view_type: "us" },
          { block_type: "prose", text: "## Reconstruction" },
          { block_type: "prose", text: "What it looked like." },
        ] },
      ] } },
    ],
    edges: [],
  },
});
const chapters = (st) => st.node("NR").data.chapters;
const shape = (st) => chapters(st).map((c) => [c.title, (c.blocks ?? []).map((b) =>
  b.block_type === "heading" ? `H${b.level}:${b.text}` : b.block_type === "prose" ? `P:${b.text}` : `E:${b.ref}`)]);

console.log("\nA · the levels: the tree from the order, numbered 1 · 1.1 · 1.1.1");
{
  const cs = [{ title: "One", blocks: [
    { block_type: "prose", text: "intro" },
    { block_type: "heading", level: 1, text: "Current researches" },
    { block_type: "prose", text: "p" },
    { block_type: "heading", level: 2, text: "The cella" },
    { block_type: "prose", text: "q" },
    { block_type: "heading", level: 1, text: "Analysis" },
  ] }, { title: "Two", blocks: [{ block_type: "heading", level: 2, text: "Orphan" }] }];
  eq(O.outlineOf(cs).map((r) => `${r.level}|${r.number}|${r.title}`),
     ["0|1|One", "1|1.1|Current researches", "2|1.1.1|The cella", "1|1.2|Analysis", "0|2|Two", "2|2.0.1|Orphan"],
     "chapter › section › subsection numbered as s3Dgraphy's outline (an orphan subsection 2.0.1, as LaTeX)");
  eq(O.headingSpan(cs[0].blocks, 1), [1, 5], "a section heads its paragraphs and its subsections, up to the next section");
  eq(O.headingSpan(cs[0].blocks, 3), [3, 5], "a subsection stops at the next section");
  eq(O.headingSpan(cs[0].blocks, 0), [0, 1], "a paragraph heads only itself");
  ok(O.numberingOn({}) && O.numberingOn(null) && !O.numberingOn({ numbering: false }), "numbered unless `numbering: false`");
}

console.log("\nB · «Transform into…»: every direction, one undo step each");
{
  const st = new DocumentStore(story());
  const run = (c, b, to) => { let r = null; ED.editChapters(st, "NR", (cs) => { r = O.transformPart(cs, c, b, to); }); return r; };
  // paragraph → section: the «#» marks go, the text is the title
  eq(run(1, 1, "section"), { chapter: 1, block: 1 }, "paragraph «### Current researches» → section (selected after)");
  eq(chapters(st)[1].blocks[1], { block_type: "heading", text: "Current researches", level: 1 }, "…its title without «###»");
  st.undo();
  eq(chapters(st)[1].blocks[1], { block_type: "prose", text: "### Current researches" }, "one undo: the paragraph again");
  st.redo();
  eq(chapters(st)[1].blocks[1].block_type, "heading", "redo: the section again");
  // a paragraph of two lines → title + paragraph
  run(1, 3, "subsection");
  eq(shape(st)[1][1].slice(3, 5), ["H2:The cella", "P:Its walls are in opus caementicium."],
     "a paragraph of two lines: the first line the title, the rest stays a paragraph under it");
  // heading ⇄ heading, heading → paragraph keeps the text
  run(1, 3, "section");
  eq(chapters(st)[1].blocks[3].level, 1, "subsection → section: only the level changes");
  run(1, 3, "paragraph");
  eq(chapters(st)[1].blocks[3], { block_type: "prose", text: "The cella" }, "section → paragraph: the title is the text");
  // paragraph → chapter splits the chapter; the blocks after go with it
  const before = chapters(st).length;
  const landed = run(1, 6, "chapter");
  eq(landed, { chapter: 2, block: null }, "«## Reconstruction» → chapter: a new chapter, selected");
  eq(chapters(st).length, before + 1, "…one chapter more");
  eq(shape(st)[2], ["Reconstruction", ["P:What it looked like."]], "…its title, and the paragraph after it went with it");
  // chapter → section of the chapter above: its blocks follow, its lane rides on the heading
  chapters(st); // (fresh read)
  ED.editChapters(st, "NR", (cs) => { cs[2].anchor = "E9"; cs[2].canonical = true; });
  run(2, null, "section");
  eq(chapters(st).length, before, "chapter → section: the chapter enters the one above");
  const last = chapters(st)[1].blocks.slice(-2);
  eq(last, [{ block_type: "heading", text: "Reconstruction", level: 1, options: { anchor: "E9", canonical: true } },
            { block_type: "prose", text: "What it looked like." }], "…its title a section at the end, its blocks after it, lane and ★ kept");
  run(1, chapters(st)[1].blocks.length - 2, "chapter");
  eq([chapters(st)[2].title, chapters(st)[2].anchor, chapters(st)[2].canonical], ["Reconstruction", "E9", true],
     "…and made a chapter again it has its lane and ★ back");
  // refusals, said
  eq(O.transformRefusal(chapters(st), 0, null, "section"), "nv.tf.whyFirstChapter", "the first chapter cannot go into a chapter above");
  eq(O.transformRefusal(chapters(st), 1, 5, "section"), "nv.tf.whyEmbed", "an embed has no words to become a title");
  eq(O.transformRefusal(chapters(st), 1, 1, "section"), "same", "a section into a section: nothing to do");
  ED.editChapters(st, "NR", (cs) => cs[0].blocks.push({ block_type: "prose", text: "  " }));
  eq(O.transformRefusal(chapters(st), 0, 1, "section"), "nv.tf.whyEmpty", "an empty paragraph cannot become a title");
  for (const k of ["nv.tf.whyFirstChapter", "nv.tf.whyEmbed", "nv.tf.whyEmpty", "nv.tf.whyGone"])
    ok(M.t(k) !== k, `${k} has words`);
}

console.log("\nB · provenance rides through a transform");
{
  const st = new DocumentStore(story());
  ED.editChapters(st, "NR", (cs) => Object.assign(cs[1].blocks[1], { authored_by: "AI1", ai_generated: true, validated_by: "P1" }));
  ED.editChapters(st, "NR", (cs) => O.transformPart(cs, 1, 1, "section"));
  const h = chapters(st)[1].blocks[1];
  eq([h.block_type, h.authored_by, h.ai_generated, h.validated_by], ["heading", "AI1", true, "P1"], "who wrote it, AI, who vouched: kept on the title");
}

console.log("\nB · the keys: Ctrl/Cmd+Alt+1/2/3/0, AltGr is a character");
{
  const K = (code, o = {}) => ({ code, altKey: true, metaKey: !!o.meta, ctrlKey: !!o.ctrl, shiftKey: !!o.shift,
    getModifierState: (m) => (m === "AltGraph" ? !!o.altgr : false) });
  eq(["Digit1", "Digit2", "Digit3", "Digit0"].map((c) => V.transformKeyOf(K(c, { meta: true }))),
     ["chapter", "section", "subsection", "paragraph"], "⌘⌥1/2/3/0 → chapter, section, subsection, paragraph");
  eq(V.transformKeyOf(K("Digit2", { ctrl: true })), "section", "Ctrl+Alt+2 on Windows/Linux");
  eq(V.transformKeyOf(K("Digit2", { ctrl: true, altgr: true })), null, "AltGr+2 (² on many layouts) is NOT a transform");
  eq(V.transformKeyOf(K("Digit4", { meta: true })), null, "⌘⌥4 is nothing");
  eq(V.transformKeyOf(K("Digit2", { meta: true, shift: true })), null, "⇧⌘⌥2 is nothing");
  eq(V.transformKeyOf({ code: "Digit2", altKey: false, metaKey: true, ctrlKey: false, shiftKey: false }), null, "⌘2 alone is nothing");
  const ids = KM.KEYMAP.map((r) => r.id);
  ok(["nvTfChapter", "nvTfSection", "nvTfSubsection", "nvTfParagraph"].every((id) => ids.includes(id)), "the keymap lists the four keys (Help ▸ Shortcuts)");
  const clash = KM.KEYMAP.filter((r) => /^⌘⌥[0-3]$/.test(r.keys)).map((r) => r.id);
  eq(clash.sort(), ["nvTfChapter", "nvTfParagraph", "nvTfSection", "nvTfSubsection"], "no other row uses ⌘⌥0–3");
}

console.log("\nB · the page: a key in a paragraph transforms it (what was typed first)");
{
  const st = new DocumentStore(story());
  const calls = [];
  const editor = {
    narrativeId: "NR", renameChapter: (i, t) => calls.push(["rename", i, t]), setProse: (c, b, t) => calls.push(["prose", c, b, t]),
    addEmbed: () => {}, lanes: () => [], canGenerate: () => false, generating: () => false, pendingIn: () => 0, signer: () => null,
  };
  const host = document.createElement("div");
  V.renderNarrativeView(host, st.doc, "NR", () => {}, undefined, editor, undefined, undefined, {
    reading: "write", onSelectPart: () => {}, onTransform: (c, b, to) => calls.push(["tf", c, b, to]),
  });
  const para = host.querySelector('.nv-block-row[data-block="1:0"] .nv-prose-edit');
  const ev = new window.Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(ev, { key: "2", code: "Digit2", altKey: true, metaKey: true, ctrlKey: false, shiftKey: false, getModifierState: () => false });
  para.dispatchEvent(ev);
  eq(calls.at(-1), ["tf", 1, 0, "section"], "⌘⌥2 in a paragraph → «Transform into section» of that paragraph");
  const title = host.querySelector('.nv-chapter[data-chapter="1"] .nv-chapter-title');
  const ev2 = new window.Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(ev2, { key: "0", code: "Digit0", altKey: true, metaKey: true, ctrlKey: false, shiftKey: false, getModifierState: () => false });
  title.dispatchEvent(ev2);
  eq(calls.at(-1), ["tf", 1, null, "paragraph"], "⌘⌥0 on a chapter's title → «Transform into paragraph» of the chapter");
}

console.log("\nA · drawn: Write, Read, Print, Notebook — numbered, and not");
{
  const st = new DocumentStore(story());
  ED.editChapters(st, "NR", (cs) => { O.transformPart(cs, 1, 3, "subsection"); O.transformPart(cs, 1, 1, "section"); });
  const draw = (doc, reading, editor) => {
    const host = document.createElement("div");
    V.renderNarrativeView(host, doc, "NR", () => {}, reading === "read" ? () => {} : undefined, editor, undefined, undefined,
      { reading, onSelectPart: () => {}, onInsert: () => {}, onSetHeading: () => {} });
    return host;
  };
  const editor = { narrativeId: "NR", renameChapter: () => {}, setProse: () => {}, addEmbed: () => {}, lanes: () => [],
    canGenerate: () => false, generating: () => false, pendingIn: () => 0, signer: () => null };
  for (const reading of ["write", "read"]) {
    const host = draw(st.doc, reading, reading === "write" ? editor : undefined);
    const h3 = host.querySelector(".nv-heading.nv-h1");
    const h4 = host.querySelector(".nv-heading.nv-h2");
    ok(h3?.tagName === "H3" && text(h3) === "2.1 Current researches", `${reading}: the section is an h3, «2.1 Current researches»`);
    ok(h4?.tagName === "H4" && text(h4) === "2.1.1 The cella", `${reading}: the subsection is an h4, «2.1.1 The cella»`);
    eq(text(host.querySelector('.nv-chapter[data-chapter="1"] .nv-chapter-head .nv-num')), "2", `${reading}: the chapter's number before its title`);
    ok(!text(host.querySelector('.nv-chapter[data-chapter="1"] .nv-chapter-title')).startsWith("2"), `${reading}: the number is not in the title's text`);
  }
  {
    const host = draw(st.doc, "write", editor);
    const t3 = host.querySelector(".nv-heading.nv-h1 .nv-heading-text");
    ok(t3?.getAttribute("contenteditable") === "true", "write: a title is written in place");
    ok(host.querySelector(".nv-heading .nv-num")?.getAttribute("contenteditable") === "false", "…its number is not editable");
  }
  const print = draw(st.doc, "print");
  eq([...print.querySelectorAll(".nv-print h2, .nv-print h3, .nv-print h4")].map((e) => `${e.tagName}:${text(e)}`).slice(0, 4),
     ["H2:1 Introduction", "H2:2 The Great Temple: survey, analysis and reconstruction", "H3:2.1 Current researches", "H4:2.1.1 The cella"],
     "print: chapter, section, subsection at their levels, numbered as the exporters");
  const nb = draw(st.doc, "notebook");
  ok([...nb.querySelectorAll("h3")].some((e) => text(e) === "2.1 Current researches"), "notebook: «### 2.1 Current researches»");
  const cells = P.notebookCells("T", chapters(st), new Map(st.doc.graph.nodes.map((n) => [n.id, n])));
  ok(cells.some((c) => c.source === "### 2.1 Current researches") && cells.some((c) => c.source === "#### 2.1.1 The cella"),
     "notebook cells: «###» a section, «####» a subsection (ipynb_exporter's levels)");
  // off
  ED.setNumbering(st, "NR", false);
  eq(st.node("NR").data.numbering, false, "numbering off: `data.numbering: false`");
  const off = draw(st.doc, "read");
  ok(!off.querySelector(".nv-num") && text(off.querySelector(".nv-heading.nv-h1")) === "Current researches", "off: no numbers in Read");
  const offPrint = draw(st.doc, "print");
  ok(text(offPrint.querySelector(".nv-print h3")) === "Current researches", "off: no numbers in Print");
  ok(P.notebookCells("T", chapters(st), new Map(), { numbered: false }).some((c) => c.source === "### Current researches"), "off: no numbers in the notebook");
  st.undo();
  ok(!("numbering" in st.node("NR").data), "one undo: numbered again (the key absent, the default)");
}

console.log("\nC · the «#» paragraphs: proposed once, transformed only when asked");
{
  const st = new DocumentStore(story());
  const hints = O.markdownHeadingHints(chapters(st));
  eq(hints.map((h) => `${h.chapter}:${h.block}:${h.marks}>${h.to}`), ["1:1:###>section", "1:3:####>subsection", "1:5:##>chapter"],
     "«###» a section, «####» a subsection, «##» a chapter (the app's markdown: the notebook writes a chapter «##»)");
  const host = document.createElement("div");
  const applied = [];
  V.renderNarrativeView(host, st.doc, "NR", () => {}, undefined,
    { narrativeId: "NR", renameChapter: () => {}, setProse: () => {}, addEmbed: () => {}, lanes: () => [],
      canGenerate: () => false, generating: () => false, pendingIn: () => 0, signer: () => null },
    undefined, undefined, { reading: "write", onSelectPart: () => {}, headingHints: hints,
      onApplyHint: (h) => applied.push(h), onApplyAllHints: () => applied.push("all"), onDismissHints: () => applied.push("leave") });
  const bar = host.querySelector(".nv-hints");
  ok(bar && bar.dataset.nvHints === "3", "one bar: «3 paragraphs start with #»");
  ok(text(bar).includes("Transform all (3)") && text(bar).includes("Leave them"), "…with «Transform all» and «Leave them»");
  eq(host.querySelectorAll(".nv-hint-go").length, 3, "each such paragraph carries its own «Transform»");
  host.querySelector('[data-nv-hint="1:1"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  eq(applied.at(-1)?.block, 1, "«Transform» on one: that one");
  eq(shape(st)[1][1][1], "P:### Current researches", "nothing was transformed by drawing (no silent change)");
  let n = 0;
  ED.editChapters(st, "NR", (cs) => { n = O.applyHints(cs, hints); });
  eq(n, 3, "«Transform all»: three, in one edit");
  eq(shape(st).map((c) => c[0]), ["Introduction", "The Great Temple: survey, analysis and reconstruction", "Reconstruction"], "…the «##» opened a chapter");
  eq(shape(st)[1][1].slice(0, 5), ["P:The temple stands on a podium.", "H1:Current researches",
    "P:A survey in 2015 and a dig in 2022 near [[U1]].", "H2:The cella", "P:Its walls are in opus caementicium."], "…the section and the subsection in place");
  st.undo();
  eq(shape(st)[1][1][1], "P:### Current researches", "one undo takes all three back");
  eq(O.markdownHeadingHints([{ title: "x", blocks: [{ block_type: "prose", text: "#hashtag is not a title" }] }]).length, 0,
     "«#hashtag» (no space) is not proposed");
  const k1 = O.hintKey("NR", "### Current researches"), k2 = O.hintKey("NR", "### Current researches");
  ok(k1 === k2 && k1 !== O.hintKey("NR", "### Other"), "a hint left as it is is remembered by the story and its text");
}

console.log("\nD · old files open the same; moving a title moves its paragraphs");
{
  const old = { header: {}, graph: { graph_id: "g", name: "Old", nodes: [{ id: "NR", node_type: "narrative", name: "Old",
    data: { chapters: [{ title: "Cap", blocks: [{ block_type: "prose", text: "testo" }] }] } }], edges: [] } };
  const st = new DocumentStore(JSON.parse(JSON.stringify(old)));
  const host = document.createElement("div");
  V.renderNarrativeView(host, st.doc, "NR", () => {}, () => {});
  ok(!host.querySelector(".nv-heading") && text(host.querySelector(".nv-chapter-title")) === "Cap", "a story with no title: chapter and paragraph, as before");
  eq(JSON.parse(st.toJSON()).graph.nodes[0].data, old.graph.nodes[0].data, "…and its data are written back unchanged");
}
{
  const cs = [{ title: "A", blocks: [
    { block_type: "heading", level: 1, text: "S1" }, { block_type: "prose", text: "a" },
    { block_type: "heading", level: 2, text: "S1.1" }, { block_type: "prose", text: "b" },
    { block_type: "heading", level: 1, text: "S2" }, { block_type: "prose", text: "c" },
  ] }, { title: "B", blocks: [{ block_type: "prose", text: "d" }] }];
  const copy = () => JSON.parse(JSON.stringify(cs));
  let x = copy();
  eq(O.moveSpan(x, 0, 0, 0, 6), { chapter: 0, block: 2 }, "S1 dragged after S2: lands after it");
  eq(x[0].blocks.map((b) => b.text), ["S2", "c", "S1", "a", "S1.1", "b"], "…with its paragraph AND its subsection");
  x = copy();
  eq(O.moveSpan(x, 0, 0, 1, 1), { chapter: 1, block: 1 }, "S1 dragged into chapter B");
  eq([x[0].blocks.map((b) => b.text), x[1].blocks.map((b) => b.text)], [["S2", "c"], ["d", "S1", "a", "S1.1", "b"]], "…its run went with it");
  x = copy();
  eq(O.moveSpan(x, 0, 0, 0, 3), null, "dropped inside its own run: nothing to do");
  x = copy();
  eq(O.moveHeadingBy(x, 0, 4, -1), { chapter: 0, block: 0 }, "▲ on S2: before S1, with its paragraph");
  eq(x[0].blocks.map((b) => b.text), ["S2", "c", "S1", "a", "S1.1", "b"], "…the order after ▲");
  x = copy();
  eq(O.moveHeadingBy(x, 0, 2, -1), null, "▲ on S1.1 (first under its section): no sibling above");
}

console.log("\nD · the Index shows the tree; a title dragged moves with its paragraphs");
{
  const st = new DocumentStore(story());
  ED.editChapters(st, "NR", (cs) => { O.transformPart(cs, 1, 3, "subsection"); O.transformPart(cs, 1, 1, "section"); });
  const host = document.createElement("div");
  const moved = [], picked = [];
  IDX.renderNarrativeIndex(host, st.doc, { narrativeId: "NR", current: 1, onPick: () => {},
    onPickPart: (c, b) => picked.push([c, b]), onMoveSpan: (...a) => moved.push(a), onMoveChapter: () => {} });
  const rows = [...host.querySelectorAll(".nidx-h")].map((b) => text(b));
  eq(rows, ["2.1 Current researches", "2.1.1 The cella"], "under chapter 2: its section and subsection, numbered");
  ok(host.querySelector(".nidx-hli.nidx-l2"), "…the subsection one step further in");
  host.querySelector('.nidx-h[data-block="1"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  eq(picked.at(-1), [1, 1], "a click on a title: that part");
  ok(host.querySelector('.nidx-hli[data-nidx-heading="1:1"]')?.draggable === true, "a title row is draggable");
  const mentionRow = [...host.querySelectorAll(".nidx-t")].some((e) => text(e).includes("[["));
  ok(!mentionRow, "no «[[id]]» in the tree");
}

console.log("\nB · the Inspector: «Transform into…» beside ▲ ▼ Delete; the story's numbering switch");
{
  const st = new DocumentStore(story());
  ED.editChapters(st, "NR", (cs) => O.transformPart(cs, 1, 1, "section"));
  const done = [];
  const hooks = (block, chapter = 1) => ({
    doc: st.doc, narrativeId: "NR", chapter, block, lanes: [], identity: null,
    viewTypesFor: () => ["us"], viewTypeLabel: (v) => v,
    onRename: () => {}, onRenameNarrative: () => {}, onSetDescription: () => {}, onSetQuery: () => {}, onSetAnchor: () => {},
    onSignMe: () => {}, onToggleCanonical: () => {}, canGenerate: () => false, generating: () => false, onGenerate: () => {},
    pending: () => 0, onVerifyChapter: () => {}, onMove: () => {}, onDelete: () => {}, onVerify: () => {}, onRetract: () => {},
    onReveal: () => {}, onSetViewType: () => {}, onSetCaption: () => {},
    onTransform: (k) => done.push(k), transformWhy: (k) => O.transformRefusal(chapters(st), chapter, block, k),
    onSetHeading: (v) => done.push(["h", v]), onSetNumbering: (v) => done.push(["num", v]), modKeys: "⌘⌥",
  });
  const root = document.createElement("div");
  INS.renderNarrativeInspector(root, hooks(1));
  ok(text(root.querySelector(".ninsp-head b")) === "Section 2.1", "a heading's Inspector: «Section 2.1»");
  const seg = [...root.querySelectorAll("[data-nv-tf]")];
  eq(seg.map((b) => b.dataset.nvTf), ["chapter", "section", "subsection", "paragraph"], "«Transform into…»: the four kinds");
  ok(seg[1].classList.contains("on") && seg[1].disabled, "…the current one lit");
  ok((seg[2].title ?? "").includes("⌘⌥3"), "…the shortcut in the tooltip");
  seg[2].dispatchEvent(new window.Event("click", { bubbles: true }));
  eq(done.at(-1), "subsection", "a click transforms");
  ok(root.querySelector('[data-nvact="up"]') && root.querySelector('[data-nvact="del"]'), "▲ ▼ Delete still there");
  const r2 = document.createElement("div");
  INS.renderNarrativeInspector(r2, hooks(4));   // the embed
  ok(!r2.querySelector("[data-nv-tf]"), "an embed has no «Transform into…»");
  const r3 = document.createElement("div");
  INS.renderNarrativeInspector(r3, hooks(null, 0));
  const first = r3.querySelector('[data-nv-tf="section"]');
  ok(first?.disabled && first.title === M.t("nv.tf.whyFirstChapter"), "chapter 1 → section: greyed, with why");
  const r4 = document.createElement("div");
  INS.renderNarrativeInspector(r4, hooks(null, -1));
  const cb = r4.querySelector('[data-nvset="numbering"]');
  ok(cb && cb.checked === true, "the story's Inspector: «Number chapters and sections», on");
  cb.checked = false;
  cb.dispatchEvent(new window.Event("change", { bubbles: true }));
  eq(done.at(-1), ["num", false], "…switched off");
}

console.log("\nE · words: EN + IT, in the dictionary");
{
  const src = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");
  const keys = ["nv.tf.into", "nv.tf.kind.chapter", "nv.tf.kind.section", "nv.tf.kind.subsection", "nv.tf.kind.paragraph",
    "nv.tf.hintsBar", "nv.tf.hintsAll", "nv.tf.hintsLeave", "nv.tf.transform", "nv.blk.section", "nv.blk.subsection",
    "ninsp.numbering", "nidx.dragHeading", "keys.nvTfChapter", "keys.nvTfParagraph"];
  for (const k of keys) {
    const n = (src.match(new RegExp(`"${k.replace(/\./g, "\\.")}":`, "g")) ?? []).length;
    ok(n >= 2, `${k}: EN + IT (${n})`);
  }
  M.setLocale("it");
  eq([M.t("nv.tf.kind.section"), M.t("nv.tf.kind.subsection"), M.t("nv.tf.into")], ["Sezione", "Sottosezione", "Trasforma in…"], "IT: Sezione, Sottosezione, Trasforma in…");
  M.setLocale("en");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
