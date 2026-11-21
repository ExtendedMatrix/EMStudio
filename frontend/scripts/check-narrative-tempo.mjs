// MICRO-SEG23 (21 Nov 2026) · «Narrates» in order of time, epochs with their
// activities inside.
//
//   node scripts/check-narrative-tempo.mjs
//
// The menu of a chapter's lane was flat (every epoch twice, the newest first,
// the activities hung with no shape). Now: a tree, oldest first, each epoch (or
// horizon, by a switch) with its activities inside, each line once with its
// dates; ticks for several lanes; ticking an epoch asks «only the epoch» or «the
// epoch with its activities as sections/subsections» (nothing made before the
// choice, one undo step); chips under the titles while writing, a click frames
// in the Matrix; the data compatible with the files (`anchor` + `anchors`), the
// coverage counting the bindings — as s3Dgraphy does.
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
      export * as L from "./narrative-lanes";
      export * as LP from "./narrative-lane-picker";
      export * as COV from "./narrative-coverage";
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
const { V, ED, O, INS, L, LP, COV, DocumentStore } = M;
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
const tick = (cb, on = true) => { cb.checked = on; cb.dispatchEvent(new window.Event("change", { bubbles: true })); };

// ── E.D.'s case: «Evolution of the site», epochs 2015 · II A.D. · I A.D., VAct.01–06
const graph = (chapters, extraNodes = []) => ({
  header: {},
  graph: {
    graph_id: "g", name: "TempluMare",
    nodes: [
      { id: "E2015", node_type: "EpochNode", name: "2015", data: { start_time: 2015, end_time: 2015 } },
      { id: "E2", node_type: "EpochNode", name: "II A.D.", data: { start_time: 101, end_time: 200 } },
      { id: "E1", node_type: "EpochNode", name: "I A.D.", data: { start_time: 1, end_time: 100 } },
      { id: "Ex", node_type: "EpochNode", name: "Undated" },
      ...["06", "02", "05", "01", "04", "03"].map((k) => ({ id: `A${k}`, node_type: "ActivityNodeGroup", name: `VAct.${k}` })),
      { id: "A10", node_type: "ActivityNodeGroup", name: "VAct.10" },
      { id: "Aold", node_type: "ActivityNodeGroup", name: "VAct.00 Foundations", data: { start_time: 20, end_time: 40 } },
      { id: "Afree", node_type: "ActivityNodeGroup", name: "Survey campaign" },
      ...extraNodes,
      { id: "NR", node_type: "narrative", name: "TempluMare", data: { chapters } },
    ],
    edges: [
      ...["01", "02", "03", "04", "05", "06", "10"].map((k) => ({ id: `e${k}`, source: `A${k}`, target: "E2", edge_type: "has_first_epoch" })),
      { id: "eold", source: "Aold", target: "E1", edge_type: "has_first_epoch" },
    ],
  },
});
const chapters = (st) => st.node("NR").data.chapters;

console.log("\nA · the data: `anchor` the first, `anchors` all — compatible with the files");
{
  eq(L.anchorsOf({ title: "x", anchor: "E2" }), ["E2"], "a chapter of the old files narrates its one lane");
  eq(L.anchorsOf({ anchor: "E2", anchors: ["E2", "A01", "A01", ""] }), ["E2", "A01"], "anchor + anchors, no repeats");
  eq(L.anchorsOf({ block_type: "heading", level: 1, text: "t", options: { anchor: "A01" } }), ["A01"], "a heading narrates in its options");
  eq(L.anchorsOf({ block_type: "prose", text: "t", options: { anchor: "A01" } }), [], "a paragraph narrates nothing");
  const d = { title: "x" };
  L.setAnchorsOn(d, ["E2"]);
  eq(d, { title: "x", anchor: "E2" }, "one lane: written as before (byte-stable), no `anchors`");
  L.setAnchorsOn(d, ["E2", "A01"]);
  eq(d, { title: "x", anchor: "E2", anchors: ["E2", "A01"] }, "two: `anchor` the first, `anchors` both");
  L.setAnchorsOn(d, []);
  eq(d, { title: "x" }, "none: both gone");
  eq(L.narratedParts([{ title: "a", anchors: ["E1", "E2"], blocks: [{ block_type: "heading", level: 1, text: "h", options: { anchor: "A01" } }] }]),
     [{ chapter: 0, block: null, ref: "E1" }, { chapter: 0, block: null, ref: "E2" }, { chapter: 0, block: 0, ref: "A01" }],
     "every binding in reading order (s3Dgraphy `narrated_parts`)");
}

console.log("\nB · the tree: oldest first, the activities inside their epoch, each once with its dates");
{
  const doc = graph([]).graph ? new DocumentStore(graph([])).doc : null;
  const tree = L.laneTree(doc, "epochs");
  eq(tree.map((x) => x.kind === "none" ? "—" : x.name), ["I A.D.", "II A.D.", "2015", "Undated", "—"],
     "epochs from the oldest to the most recent, the undated after, the activities in no epoch last");
  eq(tree[1].children.map((x) => x.name), ["VAct.01", "VAct.02", "VAct.03", "VAct.04", "VAct.05", "VAct.06", "VAct.10"],
     "II A.D.'s activities in order (VAct.10 after VAct.06, naturally)");
  eq(tree[0].children.map((x) => x.name), ["VAct.00 Foundations"], "I A.D. holds its own activity");
  eq(tree.at(-1).children.map((x) => x.name), ["Survey campaign"], "an activity in no epoch closes the list");
  const flat = L.flattenLanes(tree).map((x) => x.id);
  eq(flat.length, new Set(flat).size, "every line ONCE (the epoch was twice: heading + choice)");
  eq([L.intervalLabel(1, 100), L.intervalLabel(2015, 2015), L.intervalLabel(-753, -509), L.intervalLabel(null, null)],
     ["1 – 100", "2015", "−753 – −509", ""], "the interval beside the line (a minus before BC, nothing when undated)");
  ok(!L.FUNCTIONAL_UNITS_SHOWN && tree.every((e) => e.children.every((a) => Array.isArray(a.children) && !a.children.length)),
     "a third level (the functional units) is in the shape, empty today");
  const hz = [{ id: "H2", name: "Imperial", start: 50, end: 300 }, { id: "H1", name: "Early", start: -100, end: 49 },
              { id: "H3", name: "Modern", start: 1900, end: null }];
  const ht = L.laneTree(doc, "horizons", hz);
  eq(ht.map((x) => x.kind === "none" ? "—" : x.name), ["Early", "Imperial", "Modern", "—"], "horizons by their dates, oldest first");
  eq(ht[0].children.map((x) => x.name), ["VAct.00 Foundations"], "an activity under the first horizon its epoch overlaps");
  eq(ht[1].children.length, 7, "…the II A.D. activities under «Imperial»");
  const hf = L.flattenLanes(ht).map((x) => x.id);
  eq(hf.length, new Set(hf).size, "…and each still once");
}

console.log("\nC · the picker: ticks, and an epoch with activities ASKS first");
{
  const doc = new DocumentStore(graph([])).doc;
  const draw = (over = {}) => {
    const calls = [];
    const host = document.createElement("div");
    let sel = over.selected ?? [];
    LP.renderLanePicker(host, {
      tree: (m) => L.laneTree(doc, m, over.horizons ?? []), hasHorizons: !!over.horizons, mode: over.mode ?? "epochs",
      onMode: (m) => calls.push(["mode", m]), selected: sel, onSet: (ids) => calls.push(["set", ids]),
      subKind: "subKind" in over ? over.subKind : "section",
      missingUnder: (it) => L.missingActivityHeadings(it, over.run ?? []),
      onWithActivities: (it, acts) => calls.push(["with", it.id, acts.map((a) => a.id)]),
      nameOf: (id) => (id === "H9" ? "Late antique" : null),
    });
    return { host, calls };
  };
  let { host, calls } = draw();
  const rows = [...host.querySelectorAll(".nlp-row")];
  eq(rows.slice(0, 3).map((r) => text(r.querySelector(".nlp-name"))), ["I A.D.", "VAct.00 Foundations", "II A.D."],
     "the rows: an epoch, its activities indented under it, then the next epoch");
  ok(rows[1].style.paddingLeft === "20px" && rows[0].style.paddingLeft === "4px", "…the activity one step in");
  eq(text(rows[0].querySelector(".nlp-dates")), "1 – 100", "…the dates beside");
  ok(!host.querySelector("[data-nlp-mode]"), "no Epochs / Horizons switch without horizons");
  tick(host.querySelector('[data-nlp-id="A03"] input'));
  eq(calls.at(-1), ["set", ["A03"]], "ticking an activity adds it");
  tick(host.querySelector('[data-nlp-id="E2"] input'));
  ok(calls.length === 1 && host.querySelector('.nlp-ask[data-nlp-ask="E2"]'), "ticking an epoch with activities: nothing yet, it asks in place");
  ok(!host.querySelector('[data-nlp-id="E2"] input').checked, "…the tick waits for the choice");
  const ask = host.querySelector(".nlp-ask");
  ok(text(ask).includes("Only the epoch") && text(ask).includes("The epoch with its activities as 7 sections"), "«Only the epoch» · «The epoch with its activities as 7 sections»");
  ok(text(ask.querySelector(".nlp-ask-names")).startsWith("VAct.01 · VAct.02"), "…the activities that would be born listed");
  click(ask.querySelector('[data-nlp-choice="with"]'));
  eq(calls.at(-1), ["with", "E2", ["A01", "A02", "A03", "A04", "A05", "A06", "A10"]], "«with its activities» → the sections, in order");
  ({ host, calls } = draw());
  tick(host.querySelector('[data-nlp-id="E2"] input'));
  click(host.querySelector('[data-nlp-choice="only"]'));
  eq(calls.at(-1), ["set", ["E2"]], "«Only the epoch» → only the epoch");
  ({ host, calls } = draw());
  tick(host.querySelector('[data-nlp-id="E2"] input'));
  click(host.querySelector('[data-nlp-choice="cancel"]'));
  ok(!calls.length && !host.querySelector(".nlp-ask"), "«Cancel»: nothing");
  ({ host, calls } = draw({ subKind: null }));
  tick(host.querySelector('[data-nlp-id="E2"] input'));
  eq(calls.at(-1), ["set", ["E2"]], "on a subsection (no titles under it) the epoch is ticked directly");
  ({ host, calls } = draw({ run: ["01", "02", "03", "04", "05", "06", "10"].map((k) => ({ block_type: "heading", level: 1, text: "x", options: { anchor: `A${k}` } })) }));
  tick(host.querySelector('[data-nlp-id="E2"] input'));
  eq(calls.at(-1), ["set", ["E2"]], "activities already narrated by the run's titles: nothing to ask, never twice");
  ({ host, calls } = draw({ subKind: "subsection" }));
  tick(host.querySelector('[data-nlp-id="E2"] input'));
  ok(text(host.querySelector(".nlp-ask")).includes("as 7 subsections"), "under a section: «as 7 subsections»");
  ({ host, calls } = draw({ selected: ["E2", "A01"] }));
  tick(host.querySelector('[data-nlp-id="A01"] input'), false);
  eq(calls.at(-1), ["set", ["E2"]], "untick removes");
  ({ host, calls } = draw({ horizons: [{ id: "H1", name: "Early", start: -100, end: 49 }], selected: ["H9", "ghost"] }));
  const modes = [...host.querySelectorAll("[data-nlp-mode]")];
  eq(modes.map((b) => text(b)), ["Epochs", "Horizons"], "with horizons: the Epochs / Horizons switch");
  ok(modes[0].classList.contains("on") && modes[0].getAttribute("aria-pressed") === "true", "…Epochs on");
  click(modes[1]);
  eq(calls.at(-1), ["mode", "horizons"], "…Horizons asked");
  eq([...host.querySelectorAll(".nlp-other .nlp-name")].map(text), ["Late antique", "lane not in this graph"],
     "what the part narrates beyond the list stays, ticked, to be removed");
  ({ host, calls } = draw({ horizons: [{ id: "H1", name: "Early", start: -100, end: 49 }], mode: "horizons" }));
  eq(host.querySelector(".nlp-row").dataset.nlpKind, "horizon", "Horizons: the horizons at the first level");
}

console.log("\nD · the edits: several lanes, «the epoch with its activities as subsections» — one undo step");
{
  const st = new DocumentStore(graph([
    { title: "Evolution of the site", canonical: false, blocks: [{ block_type: "prose", text: "Intro." }] },
    { title: "Second", canonical: false, blocks: [
      { block_type: "heading", level: 1, text: "Imperial age" },
      { block_type: "prose", text: "p" },
      { block_type: "heading", level: 2, text: "Deep" },
      { block_type: "heading", level: 1, text: "Later" },
    ] },
  ]));
  ED.setPartAnchors(st, "NR", 0, null, ["E2", "A01"]);
  eq([chapters(st)[0].anchor, chapters(st)[0].anchors], ["E2", ["E2", "A01"]], "a chapter narrates two lanes");
  ED.setPartAnchors(st, "NR", 0, null, ["E2"]);
  ok(chapters(st)[0].anchor === "E2" && !("anchors" in chapters(st)[0]), "back to one: the old shape");
  st.undo();
  eq(chapters(st)[0].anchors, ["E2", "A01"], "one undo step");
  ED.setPartAnchors(st, "NR", 0, null, []);
  ok(!("anchor" in chapters(st)[0]), "none: no key");
  ED.setPartAnchors(st, "NR", 1, 0, ["E2"]);
  eq(chapters(st)[1].blocks[0].options, { anchor: "E2" }, "a section narrates in its options");
  eq(ED.partAnchors(chapters(st), 1, 0), ["E2"], "…and is read back");
  // the chapter becomes the epoch's, its sections born
  const acts = [{ id: "A01", name: "VAct.01" }, { id: "A02", name: "VAct.02" }];
  ok(ED.narrateWithActivities(st, "NR", 0, null, "E2", acts), "the epoch with its activities on a chapter");
  eq(chapters(st)[0].anchor, "E2", "…the chapter narrates the epoch");
  eq(chapters(st)[0].blocks.slice(1), [
    { block_type: "heading", text: "VAct.01", level: 1, options: { anchor: "A01" } },
    { block_type: "heading", text: "VAct.02", level: 1, options: { anchor: "A02" } }],
    "…a SECTION per activity, its title, «Narrates» set (after what the chapter had)");
  st.undo();
  eq(chapters(st)[0].blocks.length, 1, "one undo: no section, no binding");
  ok(!("anchor" in chapters(st)[0]), "…the chapter's lane gone with it");
  st.redo();
  eq(chapters(st)[0].blocks.length, 3, "redo: back");
  ok(ED.narrateWithActivities(st, "NR", 1, 0, "E2", acts), "on a section");
  eq(chapters(st)[1].blocks.map((b) => `${b.level ?? "-"}:${b.text}`),
     ["1:Imperial age", "-:p", "2:Deep", "2:VAct.01", "2:VAct.02", "1:Later"],
     "…SUBSECTIONS, at the end of the section's run (before the next section)");
  eq(chapters(st)[1].blocks[0].options, { anchor: "E2" }, "…the section narrates the epoch once (already there)");
  ok(!ED.narrateWithActivities(st, "NR", 1, 2, "E2", acts), "a subsection cannot have titles under it: refused");
  const outline = O.outlineOf(chapters(st)).map((r) => `${r.number} ${r.title}`);
  ok(outline.includes("1.1 VAct.01") && outline.includes("2.1.2 VAct.01"), "the new titles numbered by SEG22's outline");
}

console.log("\nE · the Inspector: the picker on a chapter and on a section, not on a paragraph");
{
  const st = new DocumentStore(graph([{ title: "Evolution", canonical: false, anchor: "E2", blocks: [
    { block_type: "heading", level: 1, text: "VAct.01", options: { anchor: "A01" } }, { block_type: "prose", text: "p" }] }]));
  const picker = (sel) => ({ tree: (m) => L.laneTree(st.doc, m), hasHorizons: false, mode: "epochs", onMode: () => {},
    selected: sel, onSet: () => {}, subKind: "section", missingUnder: () => [], onWithActivities: () => {}, nameOf: () => null });
  const hooks = (block, lp) => ({
    doc: st.doc, narrativeId: "NR", chapter: 0, block, lanes: [], identity: null, viewTypesFor: () => ["us"], viewTypeLabel: (v) => v,
    onRename: () => {}, onRenameNarrative: () => {}, onSetDescription: () => {}, onSetQuery: () => {},
    onSignMe: () => {}, onToggleCanonical: () => {}, canGenerate: () => false, generating: () => false, onGenerate: () => {},
    pending: () => 0, onVerifyChapter: () => {}, onMove: () => {}, onDelete: () => {}, onVerify: () => {}, onRetract: () => {},
    onReveal: () => {}, onSetViewType: () => {}, onSetCaption: () => {}, lanePicker: lp,
  });
  let root = document.createElement("div");
  INS.renderNarrativeInspector(root, hooks(null, picker(["E2"])));
  ok(root.querySelector('.nlp[data-nvset="anchor"]') && !root.querySelector('select[data-nvset="anchor"]'), "a chapter: the tree, not the flat select");
  ok(root.querySelector('[data-nlp-id="E2"] input').checked, "…its lane ticked");
  ok(text(root.querySelector(".nlp-head")).startsWith("Narrates"), "…under «Narrates»");
  root = document.createElement("div");
  INS.renderNarrativeInspector(root, hooks(0, picker(["A01"])));
  ok(root.querySelector('[data-nlp-id="A01"] input')?.checked, "a section: the same tree, its activity ticked");
  root = document.createElement("div");
  INS.renderNarrativeInspector(root, hooks(1, undefined));
  ok(!root.querySelector(".nlp"), "a paragraph: none");
}

console.log("\nF · the chips: under the titles while writing, a click frames; reading draws what it drew");
{
  const st = new DocumentStore(graph([{ title: "Evolution of the site", canonical: false, anchor: "E2", anchors: ["E2", "H9"], blocks: [
    { block_type: "heading", level: 1, text: "VAct.01", options: { anchor: "A01" } }, { block_type: "prose", text: "p" }] }]));
  const framed = [];
  const editor = { narrativeId: "NR", renameChapter: () => {}, setProse: () => {}, addEmbed: () => {}, lanes: () => [],
    canGenerate: () => false, generating: () => false, pendingIn: () => 0, signer: () => null };
  const draw = (reading) => {
    const host = document.createElement("div");
    V.renderNarrativeView(host, st.doc, "NR", () => {}, () => {}, reading === "write" ? editor : undefined, undefined, undefined,
      { reading, onSelectPart: () => {}, onSetHeading: () => {}, laneName: (id) => (id === "H9" ? "Imperial" : null),
        onFrameLane: (id) => framed.push(id) });
    return host;
  };
  let host = draw("write");
  const chips = [...host.querySelectorAll('.nv-chapter > .nv-lanes [data-nv-lane]')];
  eq(chips.map((c) => text(c)), ["II A.D.", "Imperial"], "a chip per lane under the chapter's title (a horizon by its name)");
  ok(chips[0].title.includes("Narrates «II A.D.»") && chips[0].title.includes("Matrix"), "…its tooltip says it narrates and frames");
  click(chips[0]);
  eq(framed.at(-1), "E2", "a click → the Matrix frames the epoch");
  const hchip = host.querySelector(".nv-heading-wrap .nv-lanes [data-nv-lane]");
  eq(hchip && text(hchip), "VAct.01", "a section's chip under its title");
  click(hchip);
  eq(framed.at(-1), "A01", "…a click frames the activity");
  ok(!host.querySelector(".nv-chapter-head .nv-anchor"), "while writing, no chip beside the title (it is under it)");
  host = draw("read");
  ok(!host.querySelector(".nv-lanes") && !host.querySelector("[data-nv-lane]"), "Read: no chip row, nothing more than before");
  eq(text(host.querySelector(".nv-chapter-head .nv-anchor")), "II A.D.", "…the head's lane chip as it was");
}

console.log("\nG · the coverage counts the bindings (s3Dgraphy's rule)");
{
  const st = new DocumentStore(graph([{ title: "Both", canonical: false, anchors: ["E1"], blocks: [
    { block_type: "heading", level: 1, text: "VAct.02", options: { anchor: "A02" } }] }]));
  const rows = new Map(COV.interpretiveCoverage(st.doc).map((r) => [r.id, r]));
  ok(rows.get("E1").narratives === 1 && rows.get("E1").narrated === 1 && rows.get("E1").direct_citations === 0,
     "an epoch narrated by a chapter: covered, `narrated` 1, no citation");
  ok(rows.get("E2").narratives === 1 && rows.get("E2").narrated === 0, "an activity narrated by a section covers its epoch");
  ok(rows.get("E2015").narratives === 0, "the rest untouched");
  eq(COV.narrated(st.doc).map((r) => [r.chapter, r.block, r.ref]), [[0, null, "E1"], [0, 0, "A02"]], "`narrated` rows say where");
  const sc = COV.storyCoverage(st.doc, "NR", () => true);
  ok(sc.epochs.find((e) => e.id === "E1").hasChapter, "the story's coverage: the epoch has its chapter");
}

console.log("\nH · the words, EN + IT");
{
  M.setLocale("it");
  eq([M.t("ninsp.narrates"), M.t("nlp.mode.epochs"), M.t("nlp.mode.horizons"), M.t("nlp.onlyEpoch"),
      M.t("nlp.withActs", { what: M.t("nlp.asSubsections", { n: "6" }) })],
     ["Racconta", "Epoche", "Orizzonti", "Solo l'epoca", "L'epoca con le sue attività come 6 sottosezioni"], "IT");
  M.setLocale("en");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
