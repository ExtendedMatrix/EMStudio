// NARRATIVE · executable check of the embeds — the test P1 declared it did not have.
//
//   node scripts/check-narrative.mjs
//
// P1 made five placeholder view types real and proved them in a browser. A
// browser proof is worth having and cannot be run in CI, so this is the same
// proof, headless: it renders every embed against the P1 fixture and asserts
// that what comes out is **content**, not a polite "not rendered yet".
//
// Three things are defended here, and they are the three that would rot first:
//
// **The embeds resolve.** A matrix with lanes and chips, an evidence chain with
// its four links, a timeline with bars, a table with rows, a certainty ladder
// with the right rung lit. Not "it did not throw" — the actual strings.
//
// **An embed is a REFERENCE.** Rename a unit in the DOCUMENT, leave the
// narrative untouched, render again: the chip, the table row and the chain link
// must all say the new name. This is the invariant the whole viewer exists for,
// and it is one careless `.slice()` away from becoming false.
//
// **There is one palette.** Every colour an embed paints comes from `nodeStyle`
// — including the TEXT colour, which is computed from the fill's luminance. A
// literal in the module would be a second palette in miniature, and the first
// time it happened it made the USV chip black on black.
//
// The DOM is linkedom: enough of one to build elements and read them back, and
// small enough that a check script does not need a browser.
import assert from "node:assert/strict";
import * as Sorg from "./sorgenti.mjs";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";
import { parseHTML } from "linkedom";

// A DOM before the module loads: `narrative-embeds.ts` calls
// `document.createElement` at render time, so the global has to be there.
const { window, document } = parseHTML("<html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;

const SRC = new URL("../src/", import.meta.url).pathname;
//: `./icons` uses `import.meta.glob` (Vite-only), so a module whose chain
//: reaches it is stubbed the way `check-shape-geom` does it: the names it
//: exports, empty. Nothing under test here draws an icon.
const STUB_ICONS = {
  name: "stub-icons",
  setup(build) {
    build.onResolve({ filter: /\.\/icons$/ }, () => ({
      path: "icons-stub", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `export const ICON_NODE_TYPES = new Set();
export const imageFor = () => null;
export const imageForUrl = () => null;
export const dtcGlyphUrl = () => null;
export const iconUrl = () => null;`,
      loader: "ts" }));
  },
};

const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false,
                                  plugins: [STUB_ICONS] });
  return import("data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const E = await load("narrative-embeds.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};
const has = (el, needle, what) => {
  const text = el.textContent ?? "";
  assert.ok(text.includes(needle),
    `${what} — «${needle}» not in: ${text.slice(0, 200)}`);
  checks++;
};

// The P1 fixture, unmodified: the check and the browser proof must be looking at
// the same graph, or one of them is testing something nobody ships.
const FIXTURE = new URL("../testdata/dp79-embeds.em.json", import.meta.url);
const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));
const doc = { header: raw.header, graph: raw.graphs.portico };
const byId = (id) => doc.graph.nodes.find((n) => n.id === id);
const text = (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
const all = (el, sel) => [...el.querySelectorAll(sel)].map(text);
/** `scopeOf` of one node of a doc built inline (the laid-out variants below). */
const scopeIn = (doc, id) =>
  E.scopeOf(doc.graph.nodes.find((n) => n.id === id), doc);

// ── the fixture is what we think it is ──────────────────────────────────────
// The counts are asserted so a fixture edited for one test cannot silently
// change what another one measures. P5 added an image and two annotated
// regions (the IIIF embed needs something to be live ABOUT).
eq(doc.graph.nodes.length, 17, "fixture · nodes");
eq(doc.graph.edges.length, 14, "fixture · edges");
// P4 corrected the fixture to the datamodel's real class names (`EpochNode`,
// `ActivityNodeGroup`): the lowercase spellings are what a hand-written em.json
// carries, and the Python side loaded them as generic nodes. Both are read by
// the code; the fixture now uses the ones a real study has.
eq(doc.graph.nodes.filter(
     (n) => n.node_type === "EpochNode" || n.node_type === "epoch").length, 3,
   "fixture · epochs");

// ── matrix ──────────────────────────────────────────────────────────────────
{
  const box = E.matrixEmbed(byId("act-1"), doc);
  const chips = all(box, ".nv-chip");
  eq(chips.length, 3, "matrix · one chip per unit in scope");
  ok(chips.includes("US 1 · muro"), "matrix · the unit is named");
  eq(all(box, ".nv-matrix-lane-label").length, 2,
     "matrix · one lane per epoch touched");
  // invariant 4: newest lane on top. Asserted on the ORDER of the two labels,
  // not on one of them — an assertion that compares a value with itself passes
  // whatever the code does, which is worse than no assertion at all.
  eq(all(box, ".nv-matrix-lane-label").map((l) => l.split(" ·")[0]),
     ["Fase 2", "Fase 1"],
     "matrix · NEWEST epoch first (invariant 4)");
  has(box, "1 stratigraphic relation", "matrix · singular is singular");
  ok(!text(box).includes("1 rapporti"), "matrix · no '1 rapporti'");
  ok(!text(box).includes("not rendered yet"), "matrix · not a placeholder");

  // an empty scope is an honest placeholder, not an error
  const empty = E.matrixEmbed(byId("ep-0"), doc);
  ok(empty.querySelector(".nv-empty"), "matrix · empty scope says so");
  has(empty, "the reference is valid", "matrix · and says the ref is fine");
}

// ── timeline ────────────────────────────────────────────────────────────────
{
  const box = E.timelineEmbed(byId("act-1"), doc);
  const bars = all(box, ".nv-timeline-bar");
  eq(bars.length, 2, "timeline · one bar per dated epoch");
  ok(bars.some((b) => b.includes("1200 → 1450")), "timeline · dates are shown");
  // proportion, not decoration: the 250-year epoch is wider than the 70-year one
  const widths = [...box.querySelectorAll(".nv-timeline-bar")]
    .map((b) => parseFloat(b.style.width));
  ok(widths[0] > widths[1],
     `timeline · a longer epoch is drawn longer (${widths})`);

  // an epoch with no dates is kept and marked — dropping it would be a lie by
  // omission, and a study in progress has plenty of them
  const whole = E.timelineEmbed(byId("us1"), doc);
  ok(text(whole).length > 0, "timeline · a unit scope still renders");
}

// ── table ───────────────────────────────────────────────────────────────────
{
  const box = E.tableEmbed(byId("act-1"), doc, {});
  const rows = [...box.querySelectorAll("tr")];
  eq(rows.length, 4, "table · header + one row per unit");
  eq(all(rows[0], "th"), ["unit", "type", "epoch", "dating", "certainty"],
     "table · the columns of the design's example query");
  const first = all(rows[1], "td");
  ok(first.includes("US"), "table · the type is read from the node");
  ok(first.some((c) => c.includes("1200") || c.includes("→")),
     `table · the dating comes from the epoch (${first})`);
  has(box, "just now, from the document", "table · says it is computed now");

  // the author can narrow the columns
  const narrow = E.tableEmbed(byId("act-1"), doc, { columns: ["name"] });
  eq(all([...narrow.querySelectorAll("tr")][0], "th"), ["unit"],
     "table · options.columns narrows it");
}

// ── paradata — the chain, and the break ─────────────────────────────────────
{
  const box = E.paradataEmbed(byId("us1"), doc);
  const roles = all(box, ".nv-chain-role");
  const names = all(box, ".nv-chain-name");
  eq(roles, ["source", "extractor", "property", "unit"],
     "paradata · source → extractor → property → unit, in that order");
  eq(names[0], "Rossi 1987, tav. XII", "paradata · the source is named");
  eq(names[3], "US 1 · muro", "paradata · the chain lands on the unit");
  ok(!box.querySelector(".nv-chain-broken"),
     "paradata · a complete chain reports no break");

  // …and a chain that does not resolve SAYS SO, at the point it breaks. This is
  // the one failure this embed cannot afford: a reader would take an incomplete
  // chain for a complete one.
  const retracted = structuredClone(doc);
  retracted.graph.edges = retracted.graph.edges.filter(
    (e) => e.edge_type !== "extracted_from");
  const broken = E.paradataEmbed(byId("us1"), retracted);
  ok(broken.querySelector(".nv-chain-broken"),
     "paradata · a retracted source breaks the chain visibly");
  has(broken, "cites no source", "paradata · and says why, in words");

  // a property with no extraction at all
  const orphan = structuredClone(doc);
  orphan.graph.edges = orphan.graph.edges.filter(
    (e) => e.edge_type !== "has_data_provenance");
  has(E.paradataEmbed(byId("us1"), orphan), "no extraction says",
      "paradata · a value with no provenance says so");

  // a unit that carries no properties at all: honest, not empty
  has(E.paradataEmbed(byId("us2"), doc), "carries no documented property",
      "paradata · nothing to show is said, not shown blank");
}

// ── us · the existence-certainty ladder ─────────────────────────────────────
{
  const declared = E.existenceCertainty(byId("usv1"), doc);
  eq(declared.rung, "observable", "certainty · read from the qualia claim");
  eq(declared.source, "qualia", "certainty · and says where it came from");
  const ladder = E.certaintyLadder(declared);
  eq(all(ladder, ".nv-rung").length, 4, "certainty · the whole ladder is drawn");
  eq(all(ladder, ".nv-rung-on"), ["observable"],
     "certainty · exactly one rung is lit");
  has(ladder, "certainty_level: probable", "certainty · the claim is quoted");

  // no claim anywhere: implied from the family, and MARKED as implied — a
  // default presented as a statement is how a guess becomes a citation
  const implied = E.existenceCertainty(byId("us2"), doc);
  eq(implied.source, "implied", "certainty · falls back to the family");
  eq(implied.rung, "observable", "certainty · a real unit reads as observable");
  ok(E.certaintyLadder(implied).querySelector(".nv-implied"),
     "certainty · an implied rung is marked implied");
  // a virtual unit implies a weaker rung than a real one
  const virtual = E.existenceCertainty(
    { id: "x", node_type: "USVn", data: {} }, doc);
  eq(virtual.rung, "asserted", "certainty · a virtual unit is asserted");
}

// ── un_scene — a declared skip, not a fake ──────────────────────────────────
{
  const box = E.unSceneEmbed(byId("scene1"), doc);
  has(box, "DP-29", "un_scene · names the design project it waits for");
  has(box, "does not carry the composition relations yet", "un_scene · declares the gap");
  ok(!text(box).includes("not rendered yet"), "un_scene · not a placeholder");
}

// ── the invariant: an embed is a REFERENCE ──────────────────────────────────
{
  const renamed = structuredClone(doc);
  renamed.graph.nodes.find((n) => n.id === "us1").name = "US 1 · RINOMINATA";
  // the narrative node is NOT touched — that is the whole point
  const narrative = JSON.stringify(
    renamed.graph.nodes.find((n) => n.node_type === "narrative"));
  ok(!narrative.includes("RINOMINATA"),
     "reference · the narrative itself carries no copy of the name");

  has(E.matrixEmbed(byId("act-1"), renamed), "US 1 · RINOMINATA",
      "reference · the matrix chip says the new name");
  has(E.tableEmbed(byId("act-1"), renamed, {}), "US 1 · RINOMINATA",
      "reference · the table row says the new name");
  has(E.paradataEmbed(renamed.graph.nodes.find((n) => n.id === "us1"), renamed),
      "US 1 · RINOMINATA",
      "reference · the evidence chain says the new name");
}

// ── one palette: no colour is written by hand ───────────────────────────────
{
  // Every painted element must carry an INLINE colour — which can only have come
  // from `nodeStyle`, because the module has no literals — and the text colour
  // must be set too, or a dark family renders unreadable (measured in P1).
  const box = E.matrixEmbed(byId("act-1"), doc);
  const chips = [...box.querySelectorAll(".nv-chip")];
  for (const chip of chips) {
    ok(chip.style.backgroundColor || chip.style.background,
       "palette · a chip is filled from the palette");
    ok(chip.style.color, "palette · …and its TEXT colour comes from there too");
  }
  const chain = E.paradataEmbed(byId("us1"), doc);
  for (const link of chain.querySelectorAll(".nv-chain-link")) {
    ok(link.style.color, "palette · a chain link takes its text colour too");
  }

  // and the source of truth for that: the module must not contain a colour
  // literal. One palette, and this is the tripwire that keeps it one.
  const src = readFileSync(new URL("../src/narrative-embeds.ts",
                                   import.meta.url), "utf8");
  const literals = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  eq(literals, [], "palette · no colour literal in narrative-embeds.ts");
}

// ── the view types the datamodel declares are all handled ───────────────────
{
  // The vocabulary is the datamodel's (invariant 1). This asserts the dispatcher
  // in narrative.ts has a branch for every term — a new view type must arrive
  // WITH its renderer, not as a silent placeholder.
  const dm = JSON.parse(readFileSync(
    new URL("../src/assets/s3Dgraphy_node_datamodel.json", import.meta.url),
    "utf8"));
  const declared = Object.keys(
    dm.narrative_nodes.NarrativeNode.valid_view_types);
  eq(declared.length, 11, "view types · the datamodel declares eleven");
  const dispatcher = readFileSync(
    new URL("../src/narrative.ts", import.meta.url), "utf8");
  const unhandled = declared.filter((v) => !dispatcher.includes(`"${v}"`));
  eq(unhandled, [], "view types · every declared type has a branch");
}


// ── RMDoc — the domain correction (DP-79 P3) ────────────────────────────────
//
// RM and RMSF are 3D; an RMDoc is a 2D document that had to be PLACED. Two
// families, two embeds — and what is graded is different in each, which is the
// whole reason they cannot share a card.
{
  const N = await load("narrative-embeds.ts");
  const rm = { id: "rm-1", node_type: "representation_model", name: "Modello" };
  const rmsf = { id: "rm-2", node_type: "representation_model_sf", name: "RMSF" };
  const rmdoc = {
    id: "rmdoc-1", node_type: "representation_model_doc",
    name: "Prospetto nord, collocato",
    data: { geometry: "observable" },
  };
  ok(N.isRm3D(rm) && N.isRm3D(rmsf), "rm · RM and RMSF are the 3D family");
  ok(!N.isRm3D(rmdoc), "rm · an RMDoc is not");
  ok(N.isRmDoc(rmdoc) && !N.isRmDoc(rm), "rm · and is recognised as its own case");

  const card = N.rmDocEmbed(rmdoc, doc, "");
  has(card, "documento spazializzato", "rmdoc · says what it is");
  has(card, "authority of the placement", "rmdoc · grades the PLACEMENT");
  has(card, "not the existence", "rmdoc · …and says it is not the existence");
  eq(all(card, ".nv-rung-on"), ["observable"], "rmdoc · the declared rung is lit");
  // the ladder comes from the visual rules, not from a list in the module
  eq(N.spatialisationRungs(),
     ["reality_based", "observable", "asserted", "symbolic"],
     "rmdoc · the axis is read from em_visual_rules");

  // an RMDoc nobody placed: said, not guessed
  const unplaced = N.rmDocEmbed({ ...rmdoc, data: {} }, doc, "");
  eq(all(unplaced, ".nv-rung-on"), [], "rmdoc · no rung lit when none declared");
  has(unplaced, "nobody has declared",
      "rmdoc · and it says nobody declared it");

  // the dispatcher routes an RMDoc away from the 3D stage
  const dispatcher = readFileSync(
    new URL("../src/narrative.ts", import.meta.url), "utf8");
  ok(/viewType === "rm" && isRmDoc\(node\)/.test(dispatcher),
     "rm · the dispatcher checks RMDoc BEFORE the 3D branch");

  // IIIF stays on the 2D side: a 3D asset must not be asked for a thumbnail
  ok(N.documentEmbed(rm, "https://example.org/iiif/3") === null,
     "iiif · a 3D representation model gets no image thumbnail");
}


// ── P5 · the image embed, live ──────────────────────────────────────────────
//
// IIIF is on the 2D DOCUMENT and nowhere else (the P3 correction). What is
// asserted here is that the thumbnail is a size request on the service, that
// the annotated regions are found however the graph records them, and that a
// study with no IIIF service degrades rather than showing a broken frame.
{
  const N = await load("narrative-embeds.ts");
  const BASE = "https://em.example.org/iiif/3";
  const image = byId("img-1");

  const fig = N.documentEmbed(image, BASE, doc);
  ok(fig, "iiif · an image resource gets a figure");
  const img = fig.querySelector("img");
  ok(img.getAttribute("src").startsWith(BASE), "iiif · served by the service");
  ok(/!240,240|240,/.test(img.getAttribute("src")),
     `iiif · the thumbnail is a SIZE REQUEST, not a second copy (${img.getAttribute("src")})`);
  has(fig, "2 annotated regions", "iiif · the annotated regions are named");

  // found by edge AND by the resource_id a region carries: the annotator writes
  // one, older graphs carry the other, and a reader should not have to know
  const regions = N.annotationsOn(image, doc);
  eq(regions.map((r) => r.name), ["muro", "soglia"], "iiif · both regions found");

  // no service configured → no figure at all, and the card degrades to what it
  // was. A broken frame in a story is worse than no picture.
  eq(N.documentEmbed(image, "", doc), null, "iiif · no service, no frame");
  // …and a node that is not an image never asks for one
  eq(N.documentEmbed(byId("us1"), BASE, doc), null,
     "iiif · a stratigraphic unit is not an image");
}


// ── P5 · the workspace gestures NARRWS1 left open ───────────────────────────
//
// Two drops, and they are different acts: a NODE on a chapter becomes a
// citation (D2); a VIEW TYPE on an embed changes how that embed is shown
// (D1-full). Both go through the `NarrativeEditor` — the same mutators every
// button uses — so there is no second write path and undo keeps working.
{
  const V = await load("narrative.ts");
  const calls = [];
  const editor = {
    narrativeId: "narr-1",
    addChapter() {}, renameChapter() {}, moveChapter() {}, deleteChapter() {},
    toggleCanonical() {}, setAnchor() {}, addProse() {}, setProse() {},
    addEmbed: (chapter, ref, at) => calls.push(["addEmbed", chapter, ref, at]),
    setViewType: (c, b, vt) => calls.push(["setViewType", c, b, vt]),
    moveBlock() {}, deleteBlock() {}, lanes: () => [],
    authors: () => [], humanAuthors: () => [], addAuthor() {}, removeAuthor() {},
    setChapterAuthor() {}, signer: () => null, setSigner() {}, endorse() {},
    endorseChapter() {}, pendingIn: () => 0,
    // the optional half of the interface: a stub answers "no" to everything it
    // is asked, which is what an editor without a bridge says anyway
    canGenerate: () => false, canRegenerate: () => false,
    undescribedEpochs: () => [], generateDraft() {}, promptOf: () => null,
  };

  const host = document.createElement("div");
  V.renderNarrativeView(host, doc, "narr-1", () => {}, undefined, editor,
                        { index: () => 0, set: () => {} });

  const chapter = host.querySelector(".nv-chapter");
  ok(chapter, "workspace · the chapter renders in editing mode");

  const drag = (target, type, value, kind) => {
    const data = new Map([[type, value]]);
    const event = new host.ownerDocument.defaultView.Event(kind,
      { bubbles: true, cancelable: true });
    event.dataTransfer = {
      types: [type],
      getData: (t) => data.get(t) ?? "",
      setData: (t, v) => data.set(t, v),
      dropEffect: "", effectAllowed: "",
    };
    target.dispatchEvent(event);
    return event;
  };

  // D2 · a node dropped on a chapter becomes a citation. This gesture already
  // existed; the check is here so it stays true — and because adding a SECOND
  // handler for it (which P5 briefly did) inserted the citation twice, which
  // this assertion is what caught.
  drag(chapter, V.NODE_MIME, "us2", "dragover");
  ok(chapter.classList.contains("nv-drop-over"),
     "workspace · a chapter that will take the node says so");
  drag(chapter, V.NODE_MIME, "us2", "drop");
  eq(calls.filter((c) => c[0] === "addEmbed").map((c) => [c[1], c[2]]),
     [[0, "us2"]],
     "workspace · dropping a node cites it ONCE, through the editor's mutator");

  // D1-full · a view type dropped on an EMBED changes it
  const embed = host.querySelector(".nv-embed");
  ok(embed, "workspace · there is an embed to drop on");
  drag(embed, V.VIEW_TYPE_MIME, "table", "dragover");
  ok(embed.classList.contains("nv-drop-target"),
     "workspace · an embed that will take the view type says so");
  drag(embed, V.VIEW_TYPE_MIME, "table", "drop");
  eq(calls.filter((c) => c[0] === "setViewType").map((c) => c[3]), ["table"],
     "workspace · dropping a view type re-renders that embed, via setViewType");

  // …and a view type may NOT create a block: an embed with no reference points
  // at nothing, and a story does not need a way to write an empty citation.
  const countBefore = calls.filter((c) => c[0] === "addEmbed").length;
  drag(chapter, V.VIEW_TYPE_MIME, "matrix", "drop");
  eq(calls.filter((c) => c[0] === "addEmbed").length, countBefore,
     "workspace · a view type on a chapter creates nothing");

  // read-only stays read-only: no editor, no drop targets
  const readOnly = document.createElement("div");
  V.renderNarrativeView(readOnly, doc, "narr-1", () => {});
  const ch = readOnly.querySelector(".nv-chapter");
  drag(ch, V.NODE_MIME, "us2", "dragover");
  ok(!ch.classList.contains("nv-drop-over"),
     "workspace · the dissemination viewer accepts no drops");
}



// ── P5b/A · the 3D embed, as a CONTRACT — in BOTH modes ─────────────────────
//
// The engine moved out of this module (arc A): a model is shown by a factory
// the CALLER injects — nothing in the editor, three in the reader. So the
// contract is asserted twice against one card: with a factory (a viewer, aimed
// at the right asset) and without one (the ATON path, never a broken box).
// A fake factory is enough, because what is under test is the seam.
{
  const rm = byId("rm-1");
  ok(rm, "3d · the fixture carries a representation model");
  eq(rm.data.residency, "reference",
     "3d · it is a REFERENCE (DP-76), never a copy of the geometry");
  ok(String(rm.data.checksum).startsWith("sha256:"),
     "3d · …with the digest that makes it verifiable");

  const V = await load("narrative.ts");

  // READER mode: a factory is injected, and it is handed the locator the graph
  // names — resolved now, not a copy stored in the story.
  const asked = [];
  const host = document.createElement("div");
  V.renderNarrativeView(host, doc, "narr-1", () => {}, undefined, undefined,
                        undefined,
                        (stage, spec) => {
                          asked.push(spec);
                          stage.appendChild(document.createElement("canvas"));
                        });
  const card = [...host.querySelectorAll(".nv-embed.nv-3d")]
    .find((e) => e.textContent.includes("Colonnato · modello"));
  ok(card, "3d · the rm embed renders");
  ok(!card.className.includes("nv-pending"),
     "3d · …as a viewer, not as a placeholder");
  ok(card.querySelector(".nv-3d-stage"), "3d · …with a stage for the model");
  eq(asked.map((s) => s.url), ["/testdata/colonnato.gltf"],
     "3d · the factory is aimed at the asset the graph names");
  eq(asked[0].label, "Colonnato · modello", "3d · …and told what it is");
  ok(!card.querySelector("iframe"),
     "3d · a MODEL is not handed to an ATON iframe when a viewer exists");

  // EDITOR mode: no factory. The card must still render something honest —
  // never a stage with nothing in it, which would read as a broken viewer.
  const plain = document.createElement("div");
  V.renderNarrativeView(plain, doc, "narr-1", () => {});
  const editorCard = [...plain.querySelectorAll(".nv-embed.nv-3d")]
    .find((e) => e.textContent.includes("Colonnato · modello"));
  ok(editorCard, "3d · the editor renders the embed too");
  ok(!editorCard.querySelector(".nv-3d-stage"),
     "3d · …with no empty stage: without an engine there is nothing to stage");
}

// ── the SERVED reader: shell and assets, and the promise between them ────────
//
// The reader is no longer one self-contained file — arc A took `viteSingleFile`
// off it so the 3D engine could be a chunk fetched on demand instead of 800 kB
// of base64 in the HTML. What that bought has a price, and this is it: the page
// now depends on WHERE it is served from, because it asks for its assets
// relatively.
//
// StratiGraph Catalog holds up its end by serving the whole `dist/` as a directory with
// the shell at its root (`READER_MOUNT`). This asserts the other end: that the
// shell asks relatively and that what it asks for is actually in the dist. A
// build that started emitting absolute `/assets/…` would 404 every asset behind
// any prefix, and the symptom would be a blank page that reads like an empty
// study — the exact failure the 501 exists to avoid.
{
  const dist = new URL("../dist/", import.meta.url);
  let shell = null;
  try {
    shell = readFileSync(new URL("reader.html", dist), "utf-8");
  } catch {
    // Not built here. Said out loud rather than passed silently: a check that
    // reports success for work it did not do is worse than no check.
    console.log("reader: dist/reader.html absent — served-reader checks SKIPPED "
                + "(npm run build:reader)");
  }
  if (shell) {
    const refs = [...shell.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    const assets = refs.filter((r) => !r.startsWith("data:"));
    ok(assets.length > 0, "reader · the shell references its bundle");
    for (const ref of assets) {
      ok(ref.startsWith("./"),
         `reader · «${ref}» must be RELATIVE: an absolute path nails the reader `
         + "to one deployment's prefix");
      ok(readFileSync(new URL(ref.replace(/^\.\//, ""), dist)).length > 0,
         `reader · «${ref}» exists in the dist that will be served`);
    }
    // …and the shell is a SHELL: if it ever grows back to a megabyte, the
    // single-file plugin has crept back onto the reader entry and the 3D chunk
    // is inlined again.
    ok(shell.length < 100_000,
       `reader · the shell stays a shell (${shell.length} bytes)`);
  }
}

{
  // ── PHASES · an epoch's scope includes its sub-epochs ─────────────────────
  //
  // Measured in the browser (2026-08-20): a chapter anchored to a PERIODISED
  // epoch — one whose units hang off its phases (`has_sub_epoch`) — rendered
  // "nessuna unità stratigrafica in questo ambito" while the graph's matrix drew
  // those units in that epoch's lane. The reference was valid and the embed said
  // the chapter was about nothing, which is the worst kind of wrong: it reads as
  // a study with a hole in it.
  const phased = {
    header: { format: "em.json", version: "1.0" },
    graph: {
      graph_id: "fasi", name: "Saggio a fasi",
      nodes: [
        { id: "EP1", name: "Fase I", node_type: "EpochNode", description: "",
          data: { start_time: -200, end_time: -50 } },
        { id: "EP1a", name: "Fase Ia", node_type: "EpochNode", description: "",
          data: { start_time: -200, end_time: -120 } },
        { id: "EP1b", name: "Fase Ib", node_type: "EpochNode", description: "",
          data: { start_time: -120, end_time: -50 } },
        { id: "EP2", name: "Fase II", node_type: "EpochNode", description: "",
          data: { start_time: -50, end_time: 200 } },
        { id: "US1", name: "US1", node_type: "US", description: "", data: {} },
        { id: "US2", name: "US2", node_type: "US", description: "", data: {} },
        { id: "US4", name: "US4", node_type: "US", description: "", data: {} },
      ],
      edges: [
        { id: "p1", source: "EP1", target: "EP1a", edge_type: "has_sub_epoch" },
        { id: "p2", source: "EP1", target: "EP1b", edge_type: "has_sub_epoch" },
        { id: "a1", source: "US1", target: "EP1a", edge_type: "has_first_epoch" },
        { id: "a2", source: "US2", target: "EP1b", edge_type: "has_first_epoch" },
        { id: "a3", source: "US4", target: "EP2", edge_type: "has_first_epoch" },
      ],
    },
  };
  const node = (id) => phased.graph.nodes.find((n) => n.id === id);

  const parent = E.scopeOf(node("EP1"), phased);
  eq(parent.units.map((u) => u.id).sort(), ["US1", "US2"],
     "phases · an epoch's scope includes the units of its PHASES");
  const leaf = E.scopeOf(node("EP1a"), phased);
  eq(leaf.units.map((u) => u.id), ["US1"],
     "phases · a phase itself still scopes only its own units");
  const other = E.scopeOf(node("EP2"), phased);
  eq(other.units.map((u) => u.id), ["US4"],
     "phases · an epoch with no phases is unchanged");

  // …and the embed says so, rather than "nothing here yet"
  const drawn = text(E.matrixEmbed(node("EP1"), phased));
  ok(!drawn.includes("no stratigraphic unit"),
     `phases · the embed of a periodised epoch is not empty — «${drawn.slice(0, 80)}»`);
  ok(drawn.includes("US1") && drawn.includes("US2"),
     "phases · …it names the units");
  ok(drawn.includes("Fase Ia") && drawn.includes("Fase Ib"),
     "phases · …under their own phase lanes, as the matrix draws them");

  // a cycle in a hand-edited document must not hang the reader
  const cyclic = JSON.parse(JSON.stringify(phased));
  cyclic.graph.edges.push({ id: "loop", source: "EP1a", target: "EP1",
                            edge_type: "has_sub_epoch" });
  const survived = E.scopeOf(node("EP1"), cyclic);
  ok(survived.units.length >= 2,
     "phases · a cyclic periodisation is answered, not hung");
}

{
  // ── EPOCA PIATTA · le US attaccate direttamente all'epoca ─────────────────
  //
  // Il caso di E.D. (20 ago): epoche piatte, US legate con `has_first_epoch`,
  // Matrix Mode le disegna e l'embed diceva «nessuna unità in questo ambito».
  // Due risoluzioni, entrambe difese qui: gli ARCHI (un grafo appena importato,
  // senza layout) e la CORSIA DEL LAYOUT (quel che la tela disegna davvero —
  // `views/matrix.ts` piazza per posizione, quindi un'unità incorsiata dalla
  // catena `is_after` è invisibile a qualunque cammino sugli archi).
  const flat = {
    header: { format: "em.json", version: "1.0" },
    graph: {
      graph_id: "pm", name: "PortaMarina piatta",
      nodes: [
        { id: "EP1", name: "Fase repubblicana", node_type: "EpochNode",
          description: "", data: { start_time: -200, end_time: -50 } },
        { id: "EP2", name: "Fase imperiale", node_type: "EpochNode",
          description: "", data: { start_time: -50, end_time: 200 } },
        { id: "US1", name: "US1", node_type: "US", description: "", data: {} },
        { id: "US2", name: "US2", node_type: "US", description: "", data: {} },
        { id: "US3", name: "US3", node_type: "US", description: "", data: {} },
        { id: "US4", name: "US4", node_type: "US", description: "", data: {} },
        { id: "USV1", name: "USV1", node_type: "USVs", description: "", data: {} },
        { id: "USV2", name: "USV2", node_type: "USVn", description: "", data: {} },
      ],
      edges: [
        { id: "e1", source: "US1", target: "EP1", edge_type: "has_first_epoch" },
        { id: "e2", source: "US2", target: "EP1", edge_type: "has_first_epoch" },
        { id: "e3", source: "US3", target: "EP1", edge_type: "has_first_epoch" },
        { id: "e4", source: "US4", target: "EP2", edge_type: "has_first_epoch" },
        { id: "e5", source: "USV1", target: "EP2", edge_type: "has_first_epoch" },
        { id: "e6", source: "USV2", target: "EP2", edge_type: "has_first_epoch" },
      ],
    },
  };
  const at = (id) => flat.graph.nodes.find((n) => n.id === id);

  eq(E.scopeOf(at("EP1"), flat).units.map((u) => u.id).sort(),
     ["US1", "US2", "US3"],
     "epoca piatta · gli archi bastano quando il grafo non è disposto (EP1)");
  eq(E.scopeOf(at("EP2"), flat).units.map((u) => u.id).sort(),
     ["US4", "USV1", "USV2"],
     "epoca piatta · …e per EP2");
  const drawn = text(E.matrixEmbed(at("EP1"), flat));
  ok(!drawn.includes("no unit in this epoch"),
     `epoca piatta · l'embed non è vuoto — «${drawn.slice(0, 70)}»`);
  for (const id of ["US1", "US2", "US3"])
    ok(drawn.includes(id), `epoca piatta · l'embed nomina ${id}`);

  // …e la PARITÀ con la tela: un'unità SENZA arco d'epoca, incorsiata dal
  // layout (è così che l'engine assegna le corsie: catena + membership), deve
  // comparire nell'embed come compare sul canvas.
  const laid = JSON.parse(JSON.stringify(flat));
  laid.graph.nodes.push({ id: "US9", name: "US9", node_type: "US",
                          description: "", data: {} });
  laid.layout = {
    swimlanes: [{ epoch_id: "EP1", y: 0, height: 100 },
                { epoch_id: "EP2", y: 100, height: 100 }],
    positions: {
      US1: { x: 0, y: 10, w: 90, h: 30 }, US2: { x: 100, y: 10, w: 90, h: 30 },
      US3: { x: 200, y: 10, w: 90, h: 30 }, US9: { x: 300, y: 40, w: 90, h: 30 },
      US4: { x: 0, y: 110, w: 90, h: 30 }, USV1: { x: 100, y: 110, w: 90, h: 30 },
      USV2: { x: 200, y: 110, w: 90, h: 30 },
    },
  };
  eq(scopeIn(laid, "EP1").units.map((u) => u.id).sort(),
     ["US1", "US2", "US3", "US9"],
     "parità · la corsia del layout porta anche l'unità senza arco d'epoca");
  eq(scopeIn(laid, "EP2").units.map((u) => u.id).sort(),
     ["US4", "USV1", "USV2"],
     "parità · e non sconfina nella corsia accanto");

  // un'epoca davvero vuota lo dice, e dice COSA ha chiesto
  const empty = JSON.parse(JSON.stringify(flat));
  empty.graph.nodes.push({ id: "EP0", name: "Fase 0", node_type: "EpochNode",
                           description: "", data: {} });
  const said = text(E.matrixEmbed(
    empty.graph.nodes.find((n) => n.id === "EP0"), empty));
  ok(said.includes("has_first_epoch") && said.includes("layout's lane"),
     `epoca vuota · dice quali risoluzioni ha provato — «${said.slice(0, 90)}»`);
  ok(said.includes("the reference is valid"),
     "epoca vuota · …e che il riferimento non è il problema");
}

{
  // ── I CONTROLLI RISPONDONO A UN CLICK VERO ────────────────────────────────
  //
  // Il difetto, misurato col mouse vero il 20 ago: premere «+ prose» non faceva
  // niente, perché il capitolo impostava il «capitolo corrente» su `mousedown`
  // e impostarlo RICOSTRUIVA la vista: il bottone spariva fra down e up, e un
  // `click` esiste solo se down e up cadono sullo stesso elemento.
  //
  // COLLEGARE (3 ott 2026) · la pagina è il lettore: i controlli del capitolo
  // e del blocco sono nell'Ispettore, e nella pagina restano il «+» fra i
  // blocchi e la selezione di una parte. Le due proprietà valgono per loro:
  //   1. il solo `click` fa scattare l'azione;
  //   2. un `mousedown` su un capitolo NON rifà il DOM.
  const V = await load("narrative.ts");
  const acts = [];
  const editor = {
    narrativeId: "narr-1",
    addChapter() {}, renameChapter() {}, moveChapter() {}, deleteChapter() {},
    toggleCanonical() {}, setAnchor() {}, addProse() {}, setProse() {}, addEmbed() {},
    setViewType() {}, moveBlock() {}, deleteBlock() {},
    lanes: () => [], authors: () => [], humanAuthors: () => [], addAuthor() {},
    removeAuthor() {}, setChapterAuthor() {}, signer: () => null, setSigner() {},
    endorse() {}, endorseChapter() {}, pendingIn: () => 0,
    canGenerate: () => false, canRegenerate: () => false,
    undescribedEpochs: () => [], generateDraft() {}, promptOf: () => null,
  };
  const sets = [];
  const host = document.createElement("div");
  V.renderNarrativeView(host, doc, "narr-1", () => {}, undefined, editor,
                        { index: () => 0, set: (i) => sets.push(i) }, undefined, {
    reading: "write",
    onInsert: (c, at) => acts.push(["insert", c, at]),
    onSelectPart: (sel) => acts.push(["select", sel.chapter, sel.block]),
  });
  const chapters = [...host.querySelectorAll(".nv-chapter")];
  const second = chapters.find((c) => c.querySelector(".nv-ins-btn"));
  ok(second, "click · c'è un capitolo con il suo «+» fra i blocchi");
  const chapterIndex = chapters.indexOf(second);
  const plus = second.querySelector(".nv-ins-btn");
  const fire = (element, type) => element.dispatchEvent(
    new host.ownerDocument.defaultView.Event(type, { bubbles: true, cancelable: true }));
  fire(plus, "click");
  eq(acts, [["insert", chapterIndex, 0]], "click · il solo `click` apre l'inserimento AL SUO posto");
  acts.length = 0;
  for (const type of ["pointerdown", "mousedown", "pointermove", "mousemove",
                      "pointerup", "mouseup", "click"])
    fire(plus, type);
  eq(acts, [["insert", chapterIndex, 0]], "click · un click con un micro-movimento conta come UN click");
  // 3 · il mousedown sul capitolo non rifà il DOM
  const beforeNodes = [...second.querySelectorAll("button")];
  fire(second, "mousedown");
  ok(sets.length > 0 && sets.every((v) => v === chapterIndex),
     `click · il mousedown nel capitolo lo rende corrente (${JSON.stringify(sets)})`);
  const afterNodes = [...second.querySelectorAll("button")];
  ok(afterNodes.length === beforeNodes.length && beforeNodes.every((b, i) => b === afterNodes[i]),
     "click · …e non sostituisce nessun controllo: gli stessi oggetti DOM sono ancora lì");
  // 4 · un clic su un blocco lo seleziona per l'Ispettore, sul testa del capitolo il capitolo
  acts.length = 0;
  const row = second.querySelector(".nv-block-row");
  fire(row, "click");
  fire(second.querySelector(".nv-chapter-head"), "click");
  eq(acts, [["select", chapterIndex, 0], ["select", chapterIndex, null]],
     "click · un blocco e la testa del capitolo si selezionano: gli attrezzi sono nell'Ispettore");
}

{
  // ── LE FIGURE DEGLI EMBED FINISCONO NEGLI EXPORT ──────────────────────────
  //
  // Il difetto (20 ago): ogni embed visuale usciva come SEGNAPOSTO — in LaTeX un
  // `\includegraphics` commentato accanto a una didascalia vera — quindi il PDF
  // aveva le didascalie e nessuna matrice. Il render non può stare
  // nell'esportatore: la matrice la disegna il motore di layout, e il motore sta
  // QUI. Quindi il client rende e nomina, e la libreria colloca.
  //
  // Questo check difende la metà che vive nel frontend: la FETTA di scena che
  // diventa la figura. Le quattro rese (html/docx/latex/ipynb) sono difese in
  // `s3Dgraphy/tests/test_narrative_figures.py`, dove vivono gli esportatori.
  // `views/matrix.ts` is not loadable here (its chain uses Vite's import.meta
  // glob); the SCENE it produces is what matters, and that is plain data, so the
  // slice is checked against a scene of exactly that shape.
  const S = await load("svg-export.ts");

  // una scena matrice con due corsie e le loro unità, come la disegna la tela
  const scene = {
    nodes: [
      { id: "US1", x: 0, y: 10, w: 90, h: 30, node: { id: "US1", name: "US1", node_type: "US" } },
      { id: "US2", x: 100, y: 10, w: 90, h: 30, node: { id: "US2", name: "US2", node_type: "US" } },
      { id: "US4", x: 0, y: 110, w: 90, h: 30, node: { id: "US4", name: "US4", node_type: "US" } },
    ],
    byId: new Map(),
    edges: [{ source: "US2", target: "US1", edge: { edge_type: "is_after" } }],
    lanes: [{ id: "EP1", label: "Fase repubblicana", y: 0, height: 100 },
            { id: "EP2", label: "Fase imperiale", y: 100, height: 100 }],
  };
  scene.byId = new Map(scene.nodes.map((n) => [n.id, n]));

  // la fetta: la corsia dell'epoca, i nodi il cui centro cade in quella banda
  // (il test della tela), e le relazioni fra loro
  const slice = (epochId) => {
    const lane = scene.lanes.find((l) => l.id === epochId);
    if (!lane) return null;
    const nodes = scene.nodes.filter((n) => {
      const centre = n.y + n.h / 2;
      return centre >= lane.y && centre < lane.y + lane.height;
    });
    if (!nodes.length) return null;
    const keep = new Set(nodes.map((n) => n.id));
    return { ...scene, nodes, byId: new Map(nodes.map((n) => [n.id, n])),
             edges: scene.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
             lanes: [lane] };
  };

  const ep1 = slice("EP1");
  eq(ep1.nodes.map((n) => n.id), ["US1", "US2"],
     "figure · la fetta di EP1 sono le sue unità");
  eq(slice("EP2").nodes.map((n) => n.id), ["US4"],
     "figure · …e quella di EP2 le sue");
  eq(slice("EP9"), null,
     "figure · un'epoca senza corsia non produce figura (→ segnaposto)");

  const svg = S.sceneToSvg(ep1, () => true, "Fase repubblicana");
  ok(svg.startsWith("<svg") && svg.includes("</svg>"),
     "figure · la fetta si rende in SVG");
  ok(svg.includes("US1") && svg.includes("US2"),
     "figure · l'SVG nomina le unità di quell'epoca");
  ok(!svg.includes("US4"),
     "figure · …e non quelle dell'epoca accanto");
  ok(svg.includes("Fase repubblicana"),
     "figure · e porta l'etichetta della corsia, come la tela");
  ok(svg.length > 400,
     `figure · un'immagine vera, non un guscio (${svg.length} byte)`);
  // DISEGNATA, non solo etichettata: i nomi da soli sarebbero una lista, non una
  // matrice. Un rettangolo per il fondo, uno per la corsia, e UNO PER UNITÀ —
  // così togliendo le forme dei nodi (misurato: rect 4 → 2) il check cade.
  const rects = (svg.match(/<rect\b/g) || []).length;
  ok(rects >= 2 + ep1.nodes.length,
     `figure · un rettangolo per unità oltre a fondo e corsia (rect=${rects}, `
     + `unità=${ep1.nodes.length})`);
  ok(/<path[^>]*stroke=/.test(svg),
     "figure · e il rapporto stratigrafico è tracciato");
}

{
  // ── LA MAPPA E LA TIMELINE COME FIGURE ────────────────────────────────────
  //
  // Le due che restavano segnaposto, e per due ragioni diverse:
  //
  // * la **mappa** in app è un canvas con TILE cross-origin, quindi è tainted e
  //   `toDataURL` si rifiuta. La figura è perciò il **solo livello vettoriale**:
  //   il punto, l'impronta quando la posa è nota, il nord, le coordinate. Niente
  //   basemap — non per pigrizia: i tile sono cartografia di altri, con una
  //   licenza e un'attribuzione che una figura in un PDF non porta;
  // * la **timeline** è DOM (chip), non una scena: serviva un renderer, e legge
  //   `timelineSpans`, la STESSA computazione dell'embed a schermo, così la
  //   figura non può collocare un'epoca dove la tela non la mette.
  //
  // I due renderer stanno in `svg-export.ts` — il modulo del disegno stampabile,
  // dove i neutri della figura sono già decisi (`INK`) — e non in
  // `narrative-embeds.ts`, che per regola non contiene UN colore scritto a mano.
  // Il dato invece resta lì: `timelineSpans`, letto da entrambi.
  const N = await load("svg-export.ts");
  const D = await load("narrative-embeds.ts");

  // — la mappa: solo il punto (nessuna posa dal bridge)
  const bare = N.mapToSvg({ lat: 40.7489, lon: 14.4839, epsg: 4326,
                            label: "Saggio 3" });
  ok(bare && bare.startsWith("<svg") && bare.includes("</svg>"),
     "map-figura · un punto posizionato si rende in SVG");
  ok(bare.includes("40.748900") && bare.includes("14.483900"),
     "map-figura · e scrive le coordinate, che sono il dato");
  ok(bare.includes("EPSG:4326"),
     "map-figura · col suo sistema di riferimento");
  ok(bare.includes("Saggio 3"), "map-figura · e l'etichetta del nodo");
  ok(/<circle\b/.test(bare), "map-figura · il marcatore è DISEGNATO");
  ok(/<polygon\b/.test(bare), "map-figura · e la freccia del nord c'è");
  // nessun RIFERIMENTO esterno: né un <image>, né un href, né un host di tile.
  // (La parola «tile» nel commento del file c'è, ed è giusto che ci sia: dice
  // perché non ci sono — misurato, questo check la contava come una violazione.)
  const external = bare.replace('xmlns="http://www.w3.org/2000/svg"', "");
  ok(!/<image\b|href=|https?:\/\//i.test(external),
     "map-figura · nessun tile, nessuna immagine esterna: niente taint, "
     + "nessuna cartografia di altri dentro un export");
  ok(!/\bm<\/text>|\d+ m</.test(bare),
     "map-figura · e SENZA impronta non c'è scala: una barra sotto un punto "
     + "misurerebbe il nulla");

  // — la mappa con l'impronta: allora sì la scala, e la rotazione sul nord
  const placed = N.mapToSvg({
    lat: 40.7489, lon: 14.4839, epsg: 4326, label: "Saggio 3", rotation: 12,
    // ~40 m di lato attorno al punto
    corners: [[14.48366, 40.74872], [14.48414, 40.74872],
              [14.48414, 40.74908], [14.48366, 40.74908]],
  });
  ok(/<polygon[^>]*points="[^"]{40,}"/.test(placed),
     "map-figura · l'impronta è un poligono con i suoi vertici");
  ok(/\d+ m<\/text>/.test(placed),
     "map-figura · con l'impronta arriva la barra di scala metrica");
  ok(placed.includes("rotate(-12"),
     "map-figura · e il nord è girato dell'azimut della scena");
  // the wording comes from the dictionary now, and the default is ENGLISH
  ok(placed.includes("rotation 12"),
     "map-figura · detto anche a parole, non solo disegnato");
  // riproiettata: i gradi sono WGS84, e il frame di PARTENZA è detto — non il
  // codice proiettato appiccicato a dei gradi (misurato su un'ancora UTM vera)
  const utm = N.mapToSvg({ lat: 40.7489, lon: 14.4839, epsg: 4326,
                           epsgFrom: 32633, label: "Saggio 3" });
  ok(utm.includes("WGS84, from EPSG:32633"),
     "map-figura · dei gradi riproiettati dicono da dove vengono");
  ok(!utm.includes("(EPSG:32633)"),
     "map-figura · …e non si spacciano per coordinate proiettate");

  eq(N.mapToSvg({ lat: NaN, lon: 14.4839 }), null,
     "map-figura · senza coordinate NESSUNA figura (→ segnaposto onesto)");

  // — la timeline: le epoche sull'asse, dallo stesso calcolo dell'embed
  const withEpochs = {
    graph: {
      nodes: [
        // anni a quattro cifre di proposito: è il caso che ha tagliato
        // «1450 → 1520» sul PDF compilato — l'etichetta più lunga è quella
        // dell'ULTIMA epoca, cioè quella incollata al bordo destro
        { id: "EP1", name: "Fase repubblicana", node_type: "epoch",
          data: { start_time: 1200, end_time: 1450 } },
        { id: "EP2", name: "Fase imperiale", node_type: "epoch",
          data: { start_time: 1450, end_time: 1520 } },
        { id: "EPX", name: "Fase non datata", node_type: "epoch", data: {} },
        { id: "GRAPH", name: "Porta Marina", node_type: "graph", data: {} },
      ],
      edges: [],
    },
  };
  const graphSelf = withEpochs.graph.nodes.find((n) => n.id === "GRAPH");
  const tl = N.timelineToSvg(graphSelf, withEpochs);
  ok(tl && tl.startsWith("<svg"), "timeline-figura · si rende in SVG");
  ok(tl.includes("Fase repubblicana") && tl.includes("Fase imperiale"),
     "timeline-figura · nomina le epoche in ambito");
  ok(tl.includes("1200") && tl.includes("1520"),
     "timeline-figura · e le loro date, che sono l'asse");
  const bars = (tl.match(/<rect\b/g) || []).length;
  ok(bars >= 1 + 2,
     `timeline-figura · una barra per epoca datata oltre al fondo `
     + `(rect=${bars})`);
  ok(tl.includes("Fase non datata") && /off the axis/.test(tl),
     "timeline-figura · l'epoca senza datazione è NOMINATA fuori dall'asse, "
     + "non lasciata cadere");
  // la parità: le stesse epoche, nello stesso ordine, del calcolo dell'embed
  const spans = D.timelineSpans(graphSelf, withEpochs);
  eq(spans.dated.map((e) => e.id), ["EP1", "EP2"],
     "timeline-figura · la figura e l'embed leggono UN solo calcolo");
  const order = tl.indexOf("Fase repubblicana") < tl.indexOf("Fase imperiale");
  ok(order, "timeline-figura · dal più antico, come l'embed");
  // nessuna etichetta oltre il bordo: sul PDF compilato «1450 → 1520» perdeva
  // l'anno finale. Le date stanno DENTRO la cornice, dovunque cada la barra.
  const overflow = [...tl.matchAll(/<text x="([\d.]+)"[^>]*>([^<]*→[^<]*)</g)]
    .filter(([, x, t]) => Number(x) + t.length * 6.6 > 520);
  eq(overflow.map((m) => m[2]), [],
     "timeline-figura · nessuna data tagliata dal bordo della figura");

  // — il degrado: nessuna epoca in ambito, nessuna figura
  const empty = { graph: { nodes: [{ id: "G", name: "vuoto",
                                     node_type: "graph", data: {} }],
                           edges: [] } };
  eq(N.timelineToSvg(empty.graph.nodes[0], empty), null,
     "timeline-figura · senza epoche NESSUNA figura (→ resta il blocco di "
     + "prima, che dice perché)");
}

{
  // ── LA PAGINA È IL LETTORE · la stessa storia in Scrivi e in Leggi ────────
  //
  // COLLEGARE (E.D., 29 set 2026). Fino a stanotte la difesa contro la
  // ri-impaginazione era una CORSIA riservata accanto a ogni blocco, vuota in
  // lettura e piena di ★, select e ▲▼✕ in scrittura. Gli attrezzi sono andati
  // nell'Ispettore, quindi la corsia non ha più niente da riservare: la
  // colonna è quella del lettore, intera, nelle quattro letture. Scrivere
  // aggiunge due cose soltanto: il testo modificabile sul posto e il «+» fra i
  // blocchi, in una grondaia ALTA ZERO (la storia non si sposta).
  const V = await load("narrative.ts");
  const chrome = {
    narrativeId: "narr-1",
    addChapter() {}, renameChapter() {}, moveChapter() {}, deleteChapter() {},
    toggleCanonical() {}, setAnchor() {}, addProse() {}, setProse() {},
    addEmbed() {}, setViewType() {}, moveBlock() {}, deleteBlock() {},
    lanes: () => [], authors: () => [], humanAuthors: () => [],
    addAuthor() {}, removeAuthor() {}, setChapterAuthor() {},
    signer: () => null, setSigner() {}, endorse() {}, retract() {},
    endorseChapter() {}, pendingIn: () => 0, canGenerate: () => false,
    canRegenerate: () => false, undescribedEpochs: () => [],
    generateDraft() {}, promptOf: () => null,
  };
  const render = (editor) => {
    const host = document.createElement("div");
    V.renderNarrativeView(host, doc, "narr-1", () => {}, undefined, editor,
                          editor ? { index: () => 0, set: () => {} } : undefined, undefined,
                          editor ? { reading: "write", onInsert() {}, onSelectPart() {} } : {});
    return host;
  };
  const reading = render(undefined);
  const writing = render(chrome);
  const count = (host, sel) => host.querySelectorAll(sel).length;
  const rowsR = count(reading, ".nv-block-row");
  ok(rowsR > 0, `lettore · in lettura i blocchi sono in una riga (${rowsR})`);
  eq(count(writing, ".nv-block-row"), rowsR, "lettore · e sono le STESSE righe scrivendo");
  eq(count(writing, ".nv-block-body"), count(reading, ".nv-block-body"), "lettore · lo stesso numero di corpi-blocco");
  for (const sel of [".nv-block-tools", ".nv-chapter-tools", ".nv-add-row", ".nv-authors-tools",
                     "select", ".nv-mini"])
    eq(count(writing, sel), 0, `lettore · in Scrivi nessun ${sel} nella pagina: gli attrezzi sono nell'Ispettore`);
  ok(count(writing, ".nv-prose-edit") > 0 &&
     [...writing.querySelectorAll(".nv-prose-edit")].every((p) => p.getAttribute("contenteditable") === "true"),
     "lettore · in Scrivi il testo si scrive sul posto (contentEditable), nel DOM del lettore");
  eq(count(reading, ".nv-ins"), 0, "lettore · in Leggi nessuna grondaia d'inserimento");
  ok(count(writing, ".nv-ins") > 0, "lettore · in Scrivi il «+» fra i blocchi c'è");
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  ok(Sorg.dichiara(css, ".nv-block-row", "grid-template-columns") &&
     !Sorg.bloccoCss(css, ".nv-block-row").includes("var(--nv-tools-w)"),
     "lettore · la riga ha UNA traccia: la corsia non è più riservata perché non c'è niente da metterci");
  ok(Sorg.dichiara(css, ".nv-ins", "height", "0"),
     "lettore · la grondaia del «+» è alta zero: scrivere non ri-impagina");
  // LA PAGINA, sulla classe condivisa (invariato dal 14 settembre)
  ok(Sorg.dichiara(css, ".nv-view", "padding") &&
     Sorg.dichiara(css, ".nv-view", "background"),
     "stabile · `.nv-view` porta il fondo e il padding della pagina");
  ok(!Sorg.miraA(css, "#narrative-view"),
     "stabile · e NESSUNA regola punta più a `#narrative-view`");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  ok(Sorg.elementi(html, "#narrative-view").length === 0,
     "stabile · …e l'elemento non è più nel markup");
  ok(/tile-narrative nv-view/.test(
       readFileSync(new URL("../src/shell/types.ts", import.meta.url), "utf8")),
     "stabile · …ed è il costruttore della superficie a mettere `.nv-view` sull'host");
}

console.log(`narrative: ${checks} checks passed`);
