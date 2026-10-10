// THE STUDY, ITS PLACE, ITS CODE — and the chain made visible.
//
//   node scripts/check-studio-luogo.mjs
//
// MICRO «lo studio, il suo luogo, il suo codice» (E.D., 10 Oct 2026): the
// trench is a study (HC9, A9 when it is an excavation), the site is topography
// (a LocationNodeGroup, `study_took_place_at`), HC1 is heritage where it is
// RECOGNISED and never made by default, the study code is the source's or the
// user's and never derived. What is pinned here:
//
//  A · `applyHdto` is `declare_hdto`: an HC1 only by the explicit gesture; the
//      place found or made with s3dgraphy's id; `data.code` and
//      `data.study_kind` on the study; and, for the same input, THE SAME nodes,
//      roles and edges as s3dgraphy — compared with what the local
//      `../s3Dgraphy/src` writes (`hdto_parity.py`), not with a copy of it;
//  B · the code beside the name, read and never made up;
//  C · `y_pos` / `x_pos` leave the em.json at save, and stay in memory;
//  D · the chain visible: the card (inspector and narrative), the narrative's
//      intro citing the study, the Graph view's layer — on the real Tempio
//      Grande/SB file, READ ONLY, and on a graph with no chain, which shows
//      nothing invented.
//
// The real file is read from OneDrive (`STUDY=` to point elsewhere); when it is
// not mounted those checks say so and the rest still runs. The parity needs a
// Python that imports s3dgraphy from the local tree (`S3D=` for the checkout,
// default `../../s3Dgraphy`); without one the run FAILS, because the parity is
// the point of part A.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import * as esbuild from "esbuild";
import { parseHTML } from "linkedom";

const { window, document } = parseHTML("<html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
Object.defineProperty(window.HTMLSelectElement.prototype, "value", {
  configurable: true,
  get() {
    const chosen = [...this.querySelectorAll("option")].find((o) => o.hasAttribute("selected"));
    return chosen ? chosen.getAttribute("value") ?? chosen.textContent : "";
  },
  set(v) {
    for (const o of this.querySelectorAll("option")) {
      const val = o.getAttribute("value") ?? o.textContent;
      if (val === String(v)) o.setAttribute("selected", "");
      else o.removeAttribute("selected");
    }
  },
});

const HERE = new URL(".", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;
const S3D = process.env.S3D ?? `${HERE}../../../s3Dgraphy`;
const STUDY = process.env.STUDY ?? `${homedir()}/Library/Group Containers/UBF8T346G9.OneDriveStandaloneSuite/OneDrive - CNR.noindex/OneDrive - CNR/Extended Matrix/EM_CaseStudies/01_EM_Tempio Grande/SB/modelli/2002d3d6-e910-453d-8fcd-1f22865135b7.em.json`;

const STUB_ICONS = {
  name: "stub-icons",
  setup(build) {
    build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
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
                                  format: "esm", write: false, plugins: [STUB_ICONS] });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const M = await load("model.ts");
const H = await load("hdto.ts");
const C = await load("hdto-card.ts");
const S = await load("study-panel.ts");
const N = await load("narrative.ts");
const SC = await load("narrative-scaffold.ts");
const R = await load("rules.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const fresh = (name = "Villa di Aiano") => new M.DocumentStore({
  graph: { graph_id: "g1", name, nodes: [], edges: [] },
});
const BASE = {
  studyTitle: "", studyAuthors: "", studyDate: "",
  heritageName: "", heritageUri: "", heritageAuthorityRef: undefined,
  parentName: "", parentUri: "", parentAuthorityRef: undefined,
  projectName: "", twin: { state: "none", name: "", key: "" },
};
const typed = (s, t) => s.doc.graph.nodes.filter((n) => n.node_type === t);
const HC1 = R.nodeTypeForClass("HeritageEntityNode");
const LOC = R.nodeTypeForClass("LocationNodeGroup");
const STUDY_T = R.nodeTypeForClass("StudyNode");

// ── A1 · the explicit gesture ────────────────────────────────────────────────
console.log("\nA1 · an HC1 only when somebody says the heritage is recognised");
{
  const s = fresh();
  // the field invited the site's name: written there, without the gesture
  s.applyHdto({ ...BASE, studyTitle: "Saggio 1", heritageName: "Aiano" });
  eq(typed(s, HC1).length, 0, "a name in the heritage field, no gesture → NO HC1");
  ok(!s.doc.graph.edges.some((e) => e.edge_type === "study_about_heritage"),
     "…and no study_about_heritage");
  s.applyHdto({ ...BASE, studyTitle: "Saggio 1", heritageName: "Aiano", heritageDeclared: false });
  eq(typed(s, HC1).length, 0, "declared false → no HC1");
  s.applyHdto({ ...BASE, studyTitle: "Saggio 1", heritageName: "Colosseo", heritageDeclared: true });
  eq(typed(s, HC1).map((n) => n.name), ["Colosseo"], "the gesture + a name → the HC1");
  eq(s.readHdto().heritageDeclared, true, "…read back declared");
  s.applyHdto({ ...BASE, studyTitle: "Saggio 1", heritageName: "Colosseo", heritageDeclared: false });
  eq(typed(s, HC1).length, 0, "un-declaring removes it (one undo step brings it back)");
  s.undo();
  eq(typed(s, HC1).length, 1, "…and undo restores it");
}
{
  // a file written before the gesture: its HC1 stays, and a caller that does
  // not know the field (a remote op, an old panel) leaves it as it is
  const s = fresh();
  s.applyHdto({ ...BASE, studyTitle: "S", heritageName: "Templu Mare", heritageDeclared: true });
  const before = JSON.stringify(s.doc.graph);
  const back = s.readHdto();
  s.applyHdto(back);
  eq(JSON.stringify(s.doc.graph), before, "an existing HC1, re-applied as read → byte-identical graph");
  const { heritageDeclared, ...older } = back;
  s.applyHdto(older);
  eq(typed(s, HC1).length, 1, "a caller without the field keeps the HC1 that is there");
  const t = fresh();
  t.applyHdto({ ...older, heritageName: "Aiano" });
  eq(typed(t, HC1).length, 0, "…and does not make one where there is none");
}

// ── A2 · the place ───────────────────────────────────────────────────────────
console.log("\nA2 · the study took place at the site — found, or made with s3dgraphy's id");
{
  const s = fresh();
  s.applyHdto({ ...BASE, studyTitle: "Saggio 1", placeName: "Aiano" });
  const places = typed(s, LOC);
  eq(places.length, 1, "one place made");
  eq(places[0].id, H.sitePlaceId("Aiano"), "with the deterministic id of the site");
  eq([places[0].data.level, places[0].data.kind], ["sito", "toponym"], "level sito, kind toponym");
  const study = typed(s, STUDY_T)[0];
  const e = s.doc.graph.edges.find((x) => x.source === study.id && x.target === places[0].id);
  eq(e?.edge_type, "study_took_place_at", "study ─study_took_place_at→ place (type from the datamodel)");
  eq(e?.id, `${study.id}__study_took_place_at__${places[0].id}`, "edge id <src>__<type>__<tgt>");
  eq([s.readHdto().placeName, s.readHdto().placeId], ["Aiano", places[0].id], "read back");
  s.applyHdto({ ...s.readHdto() });
  eq(typed(s, LOC).length, 1, "re-applied: still one place");
  eq(s.doc.graph.edges.filter((x) => x.edge_type === "study_took_place_at").length, 1, "…one edge");
}
{
  // pyArchInit's projector already made the site (same id) inside its comune
  const s = fresh();
  const site = H.makeSitePlace("Volterra");
  const comune = { id: "comune-volterra", name: "Volterra", node_type: LOC, data: { level: "comune", kind: "toponym" } };
  s.doc.graph.nodes.push(site, comune);
  s.doc.graph.edges.push({ id: `${site.id}__is_in_location__${comune.id}`, source: site.id, target: comune.id, edge_type: "is_in_location" });
  s.applyHdto({ ...BASE, studyTitle: "Saggio 2", placeName: "Volterra" });
  eq(typed(s, LOC).length, 2, "the projector's site is REUSED: no third place (the comune of the same name is not it)");
  const chain = H.hdtoChain(s.doc);
  eq([chain.place.id, chain.place.within.map((w) => w.name)], [site.id, ["Volterra"]],
     "the chain reads the place and the places it is in");
  // a place of the graph picked by id (an area, the comune)
  s.applyHdto({ ...s.readHdto(), placeName: "Volterra", placeId: comune.id });
  eq(H.studyPlace(s.doc).id, comune.id, "a place picked by id is the one used");
  ok(s.doc.graph.nodes.some((n) => n.id === site.id), "…and the site, still spoken of by is_in_location, is NOT deleted");
}
{
  const s = fresh();
  s.applyHdto({ ...BASE, studyTitle: "S", placeName: "Aiano" });
  s.applyHdto({ ...BASE, studyTitle: "S", placeName: "Poggibonsi" });
  eq(typed(s, LOC).map((n) => n.name), ["Poggibonsi"], "a place the panel made and nothing else speaks of goes when the place changes");
  s.applyHdto({ ...BASE, studyTitle: "S", placeName: "" });
  eq([typed(s, LOC).length, H.studyPlace(s.doc)], [0, undefined], "cleared → no place, no edge");
}

// ── A3 · the code and the kind ───────────────────────────────────────────────
console.log("\nA3 · data.code only when written; data.study_kind from the datamodel");
{
  eq(H.studyKinds(), ["stratigraphic_excavation", "survey", "documentation", "other"],
     "the kinds are the datamodel's enum");
  const s = fresh("GT16 — Tempio Grande");
  s.applyHdto({ ...BASE, studyTitle: "GT16 campaign", placeName: "Sarmizegetusa" });
  const st = () => typed(s, STUDY_T)[0];
  ok(!("code" in st().data), "a title that LOOKS like a code makes no code: nothing derived");
  eq(H.studyCode(s.doc), null, "studyCode → null");
  s.applyHdto({ ...s.readHdto(), studyCode: " GT16 ", studyKind: "stratigraphic_excavation" });
  eq([st().data.code, st().data.study_kind], ["GT16", "stratigraphic_excavation"], "written: code (trimmed) and kind");
  s.applyHdto({ ...s.readHdto(), studyKind: "trincea" });
  ok(!("study_kind" in st().data), "a kind the datamodel does not know is not written");
  s.applyHdto({ ...s.readHdto(), studyCode: "" });
  ok(!("code" in st().data), "the code cleared → the key gone");
  const g = fresh(); g.doc.graph.graph_code = "MISSINGCODE";
  eq(H.studyCode(g.doc), null, "a GraphML's MISSINGCODE is never a code");
  g.doc.graph.graph_code = "TM16";
  eq(H.studyCode(g.doc), "TM16", "…its real header ID is read when no study says one");
}

// ── A4 · parity with s3dgraphy ───────────────────────────────────────────────
console.log("\nA4 · applyHdto and declare_hdto write the same chain");
const CASES = [
  { label: "the whole chain",
    fields: { ...BASE, studyTitle: "Campagna 2026", studyAuthors: "Rossi", studyDate: "2026",
              studyCode: "VA26", studyKind: "stratigraphic_excavation", placeName: "Aiano",
              heritageDeclared: true, heritageName: "Villa di Aiano", heritageUri: "https://vocab.getty.edu/tgn/7000874",
              parentName: "Poggibonsi", parentUri: "https://vocab.getty.edu/tgn/7010191",
              projectName: "Aiano project", twin: { state: "provisional", name: "Aiano HDT", key: "" } },
    declare: { study: { name: "Campagna 2026", authors: "Rossi", date: "2026", code: "VA26",
                        study_kind: "stratigraphic_excavation" },
               place: { name: "Aiano" },
               about: { name: "Villa di Aiano", uri: "https://vocab.getty.edu/tgn/7000874" },
               parent: { name: "Poggibonsi", uri: "https://vocab.getty.edu/tgn/7010191" },
               project: { name: "Aiano project" }, twin: { name: "Aiano HDT" } } },
  { label: "a trench, no recognised heritage",
    fields: { ...BASE, studyTitle: "Saggio 3", studyKind: "survey", placeName: "Volterra",
              heritageName: "Volterra" },
    declare: { study: { name: "Saggio 3", study_kind: "survey" }, place: { name: "Volterra" } } },
  { label: "a registered twin",
    fields: { ...BASE, studyTitle: "S", heritageDeclared: true, heritageName: "Colosseo",
              twin: { state: "registered", name: "Colosseo HDT", key: "https://x/colosseo" } },
    declare: { study: { name: "S" }, about: { name: "Colosseo" },
               twin: { name: "Colosseo HDT", key: "https://x/colosseo" } } },
  { label: "the projector's site already there",
    pre: "Volterra",
    fields: { ...BASE, studyTitle: "Saggio 4", placeName: "Volterra" },
    declare: { study: { name: "Saggio 4" }, place: { name: "Volterra" } } },
];
const py = (() => {
  for (const exe of [process.env.PYTHON, `${S3D}/.venv/bin/python`, "python3"]) {
    if (!exe || (exe.startsWith("/") && !existsSync(exe))) continue;
    try {
      const out = execFileSync(exe, ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(`${S3D}/src`)}); exec(open(${JSON.stringify(`${HERE}hdto_parity.py`)}).read())`],
        { input: JSON.stringify(CASES.map((c, i) => ({ graph_id: `g${i}`, name: "Villa di Aiano",
            pre_place: c.pre, declare: c.declare, ask_ids: ["Aiano", "Volterra", "Città di Castello"] }))),
          encoding: "utf-8", maxBuffer: 1 << 26 });
      return JSON.parse(out);
    } catch (e) { console.log(`  (${exe}: ${String(e.message).split("\n")[0]})`); }
  }
  return null;
})();
ok(py, "s3dgraphy (local tree) answered — the parity cannot be skipped");
// normalised: a node by its ROLE (a place by its id, which is deterministic), its
// type, name, description and data without the nulls and empty strings the two
// constructors fill differently; an edge by type and the roles at its ends
const norm = (graph) => {
  const roleOf = new Map();
  const nodes = {};
  for (const n of graph.nodes) {
    const d = n.data ?? {};
    const role = d.hdto_role ?? (n.node_type === LOC ? `place:${n.id}` : null);
    if (!role) continue;
    roleOf.set(n.id, role);
    const data = Object.fromEntries(Object.entries(d)
      .filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length)));
    nodes[role] = { node_type: n.node_type, name: n.name ?? "", description: n.description || "", data };
  }
  const edges = graph.edges.filter((e) => roleOf.has(e.source) && roleOf.has(e.target))
    .map((e) => ({ k: `${roleOf.get(e.source)} ─${e.edge_type}→ ${roleOf.get(e.target)}`,
                   idOk: e.id === `${e.source}__${e.edge_type}__${e.target}` }));
  return { nodes, edges: edges.map((e) => e.k).sort(), idsOk: edges.every((e) => e.idOk) };
};
if (py) {
  eq(Object.values(py[0].site_place_ids),
     ["Aiano", "Volterra", "Città di Castello"].map((n) => H.sitePlaceId(n)),
     "sitePlaceId = site_place_id (sha1, UTF-8 included)");
  CASES.forEach((c, i) => {
    const s = new M.DocumentStore({ graph: { graph_id: `g${i}`, name: "Villa di Aiano", nodes: [], edges: [] } });
    if (c.pre) s.doc.graph.nodes.push(H.makeSitePlace(c.pre));
    s.applyHdto(c.fields);
    const mine = norm(s.doc.graph), theirs = norm(py[i].graph);
    eq(Object.keys(mine.nodes).sort(), Object.keys(theirs.nodes).sort(), `${c.label} · the same roles`);
    eq(mine.nodes, theirs.nodes, `${c.label} · the same nodes (type, name, data)`);
    eq(mine.edges, theirs.edges, `${c.label} · the same edges`);
    ok(mine.idsOk && theirs.idsOk, `${c.label} · edge ids <src>__<type>__<tgt> on both sides`);
  });
}

// ── A5 · the panel ───────────────────────────────────────────────────────────
console.log("\nA5 · the Study panel: code empty, kinds from the datamodel, the gesture");
{
  const s = fresh();
  const root = document.createElement("div");
  S.renderStudyPanel(root, s, {});
  const code = root.querySelector('[data-hdto="code"]');
  ok(code && code.value === "" && !code.getAttribute("placeholder"),
     "the code field is EMPTY and proposes nothing (no value, no placeholder)");
  eq([...root.querySelectorAll('[data-hdto="kind"] option')].map((o) => o.getAttribute("value")),
     ["", ...H.studyKinds()], "the kind: «not said», then the datamodel's values");
  const decl = root.querySelector('[data-hdto="declared"]');
  ok(decl && !decl.checked, "the heritage gesture is OFF on a new study");
  ok(root.querySelector(".insp-hdto-heritage").style.display === "none",
     "…and the heritage fields are not offered until it is made");
  ok(root.querySelector('[data-hdto="place"]'), "the place field is there");
}

// ── B · the code in the view ─────────────────────────────────────────────────
console.log("\nB · the code beside the name, never made up");
{
  eq(H.withCode("Templu Mare", "GT16"), "Templu Mare (GT16)", "name (code)");
  eq(H.withCode("Templu Mare", null), "Templu Mare", "no code → the name as it is");
  eq(H.withCode("Templu Mare (GT16)", "GT16"), "Templu Mare (GT16)", "never twice");
  const src = readFileSync(`${SRC}emtree.ts`, "utf-8");
  ok(/withCode\(name, studyCode\(slot\.store\.doc\)\)/.test(src), "the EMtree overview card names the graph with its code");
  const main = readFileSync(`${SRC}main.ts`, "utf-8");
  ok(/return withCode\(name \|\| t\("strip\.untitled"\), studyCode\(st\.doc\)\)/.test(main),
     "the name strip (and the status bar, through graphTitle) carry the code");
  ok(/withCode\(name, studyCode\(store\.doc\)\)/.test(main), "…and the desktop window title");
  // measured, not assumed: no label is built with the study code as a prefix
  // anywhere in the frontend (naming.ts prefixes an extractor with its
  // document's name, a new unit with the most used prefix of its siblings)
  const naming = readFileSync(`${SRC}naming.ts`, "utf-8");
  ok(!/studyCode|graph_code|em_id/.test(naming), "naming.ts builds no code-prefixed labels (nothing to align)");
}

// ── C · y_pos / x_pos at save ────────────────────────────────────────────────
console.log("\nC · the drawing keys leave the em.json, and stay in memory");
{
  const s = new M.DocumentStore({ graph: { graph_id: "g", nodes: [
    { id: "a", node_type: "US", name: "US1", data: { y_pos: 12.5, x_pos: 3, description: "keep" } },
    { id: "d", node_type: "document", name: "D1", data: { instances: [{ y_pos: 1, original_id: "n1" }, { label: "x" }] } },
    { id: "b", node_type: "US", name: "US2", data: { keep: 1 } },
  ], edges: [] } });
  const out = JSON.parse(s.toJSON());
  const a = out.graph.nodes.find((n) => n.id === "a");
  eq(a.data, { description: "keep" }, "y_pos and x_pos are gone from data, the rest stays");
  eq(out.graph.nodes.find((n) => n.id === "d").data.instances, [{ original_id: "n1" }, { label: "x" }],
     "…and from every instance");
  eq(s.node("a").data.y_pos, 12.5, "the document in memory keeps them (the inspector's Technical details)");
  const clean = new M.DocumentStore({ graph: { graph_id: "g", nodes: [{ id: "b", node_type: "US", data: { k: 1 } }], edges: [] } });
  eq(JSON.parse(clean.toJSON()).graph, clean.doc.graph, "a graph without them is written as it is");
  const insp = readFileSync(`${SRC}inspector.ts`, "utf-8");
  ok(/TECH_FIELDS = new Set\(\["is_canonical", "y_pos", "x_pos"/.test(insp), "the inspector still lists them as technical details");
}

// ── D · the chain, visible ───────────────────────────────────────────────────
console.log("\nD · the chain, in the card, in the narrative, in the Graph layer");
const doD = (label, doc, expectChain) => {
  const chain = H.hdtoChain(doc);
  const card = C.chainCard(doc, {});
  if (!expectChain) {
    eq([card, chain.ids.size], [null, 0], `${label} · no chain → no card, nothing in the layer`);
    const s = new M.DocumentStore(JSON.parse(JSON.stringify(doc)));
    SC.scaffoldNarrativeFromGraph(s);
    const narr = s.doc.graph.nodes.find((n) => n.node_type === "narrative");
    ok(!JSON.stringify(narr.data.chapters).includes('"view_type":"us"') ||
       !narr.data.chapters[0].blocks.some((b) => b.block_type === "embed"),
       `${label} · the narrative's intro cites no study it does not have`);
    const host = document.createElement("div");
    N.renderNarrativeView(host, s.doc, narr.id, () => {});
    ok(!host.querySelector("[data-hdto-card]"), `${label} · and draws no chain card`);
    return;
  }
  ok(card, `${label} · the card is drawn`);
  return { chain, card };
};
let realDoc = null;
if (existsSync(STUDY)) {
  realDoc = JSON.parse(readFileSync(STUDY, "utf-8"));
  const frozen = JSON.stringify(realDoc);
  const { chain, card } = doD("Tempio Grande/SB", realDoc, true);
  eq([chain.study.name, chain.about.name, chain.parent.name, chain.twin.state],
     ["Extended Matrix of the Great Temple", "Templu Mare", "Sarmizegetusa Ulpia Traiana", "provisional"],
     "Tempio Grande/SB · study, heritage, whole, twin read from the file");
  const rows = Object.fromEntries([...card.querySelectorAll(".hdto-row")].map((r) => [r.dataset.hdtoRow, r.textContent]));
  ok(/Extended Matrix of the Great Temple/.test(rows.study), "the card · the study");
  ok(/place not said yet/.test(rows.place), "the card · the file has no place, and the card SAYS so");
  ok(/Templu Mare/.test(rows.about) && /aat/.test(rows.about) && card.querySelector('a.hdto-link[href="http://vocab.getty.edu/aat/300007595"]'),
     "the card · the heritage, with its authority link");
  ok(/Sarmizegetusa/.test(rows.parent), "the card · part of");
  ok(/Templu Mare HDT/.test(rows.twin) && /Provisional/.test(rows.twin), "the card · the twin and its state");
  // the inspector: selecting the study, or the HC1
  const I = await load("inspector.ts");
  const s = new M.DocumentStore(JSON.parse(frozen));
  for (const role of ["study", "about"]) {
    const node = s.doc.graph.nodes.find((n) => n.data?.hdto_role === role);
    const root = document.createElement("div");
    const jumps = [];
    I.renderInspector(root, s, node.id, {
      onJump: (id) => jumps.push(id), onClose() {}, onDeleteNode() {}, onDeleteEdge() {},
      onToggleFold() {}, onEnterGroup() {}, onAddPhase() {}, onTogglePhases() {},
      isPhasesVisible: () => false, onDeletePhase() {}, onDeleteEpoch() {},
      onReorderEpoch() {}, onReorderPhase() {}, onAssignEpoch() {},
      onTogglePin() {}, isPinned: () => false });
    const c = root.querySelector("[data-hdto-card]");
    ok(c && c.querySelector(".hdto-focus")?.dataset.hdtoRow === role,
       `the inspector · selecting the ${role} shows the chain, its own row marked`);
    c.querySelector('[data-hdto-row="twin"] button').click();
    ok(jumps.at(-1) === chain.twin.id, `…and a row is a way to the node (${role} → twin)`);
  }
  // the narrative: scaffolded, the intro cites the study, and the view draws the chain
  SC.scaffoldNarrativeFromGraph(s);
  const narr = s.doc.graph.nodes.find((n) => n.node_type === "narrative");
  const intro = narr.data.chapters[0];
  ok(intro.blocks.some((b) => b.block_type === "embed" && b.ref === chain.study.id && b.view_type === "us"),
     "the narrative · the intro cites the study (a reference, not copied text)");
  const host = document.createElement("div");
  N.renderNarrativeView(host, s.doc, narr.id, () => {});
  const nv = host.querySelector(".nv-hdto [data-hdto-card]");
  ok(nv && /Templu Mare/.test(nv.textContent) && /Templu Mare HDT/.test(nv.textContent),
     "the narrative · draws the chain, read from the graph");
  s.updateNode(s.doc.graph.nodes.find((n) => n.data?.hdto_role === "about").id, { name: "Templu Mare (renamed)" });
  N.renderNarrativeView(host, s.doc, narr.id, () => {});
  ok(/renamed/.test(host.querySelector(".nv-hdto").textContent), "…and follows the graph: rename the HC1, the story says the new name");
  // the layer: off → no HDT-O node in the view; on → the chain
  const hidden = R.hdtoProfileTypes();
  const nodes = realDoc.graph.nodes;
  const off = H.hdtoDropped(realDoc, nodes, hidden, () => 0, false);
  const on = H.hdtoDropped(realDoc, nodes, hidden, () => 0, true);
  ok([...chain.ids].every((id) => off.has(id)), "the layer OFF · every node of the chain stays out of the view (Matrix and Graph)");
  ok([...chain.ids].every((id) => !on.has(id)), "the layer ON · every node of the chain is in the Graph view");
  eq(chain.ids.size, 5, "…five: proposition set, HC1, whole, twin, study");
  ok(nodes.filter((n) => !chain.ids.has(n.id)).every((n) => off.has(n.id) === on.has(n.id)),
     "…and the layer changes nothing else");
  eq(JSON.stringify(realDoc), frozen, "the real file was only READ");
} else {
  console.log(`  (the Tempio Grande/SB file is not mounted: ${STUDY})`);
}
{
  // a graph with no chain at all: nothing invented anywhere
  const doc = { graph: { graph_id: "bare", name: "Bare", nodes: [
    { id: "e1", node_type: "EpochNode", name: "Roman", data: { start_time: -100, end_time: 300 } },
    { id: "u1", node_type: "US", name: "US1", data: {} },
  ], edges: [{ id: "u1__has_first_epoch__e1", source: "u1", target: "e1", edge_type: "has_first_epoch" }] } };
  doD("a graph without a chain", doc, false);
  eq(H.hdtoDropped(doc, doc.graph.nodes, R.hdtoProfileTypes(), () => 0, true).size, 0,
     "a graph without a chain · the layer on adds and removes nothing");
}
{
  // a study with no heritage: the card says «not yet attributed», nothing more
  const s = fresh();
  s.applyHdto({ ...BASE, studyTitle: "Saggio 5", placeName: "Aiano", studyKind: "stratigraphic_excavation" });
  const card = C.chainCard(s.doc, {});
  const about = card.querySelector('[data-hdto-row="about"]');
  ok(/not yet attributed to a heritage asset/.test(about.textContent) && about.classList.contains("hdto-missing"),
     "a study without HC1 · «study not yet attributed to a heritage asset» (D3.2 not yet known)");
  ok(!card.querySelector('[data-hdto-row="twin"]'), "…and no twin row: a twin is of an HC1");
  ok(/Aiano/.test(card.querySelector('[data-hdto-row="place"]').textContent), "…its place is there");
  ok(/Stratigraphic excavation/.test(card.querySelector('[data-hdto-row="study"]').textContent), "…and its kind");
  // its place, a site with no member, is in the layer and out of the Matrix
  const dropped = H.hdtoDropped(s.doc, s.doc.graph.nodes, R.hdtoProfileTypes(), () => 0, false);
  ok(dropped.has(H.sitePlaceId("Aiano")), "the panel's site, empty, stays out of the stratigraphic views");
  const kept = H.hdtoDropped(s.doc, s.doc.graph.nodes, R.hdtoProfileTypes(), (id) => (id === H.sitePlaceId("Aiano") ? 3 : 0), false);
  ok(!kept.has(H.sitePlaceId("Aiano")), "…a place holding units is topography the views draw, and stays");
}

console.log(`\nstudio-luogo: ${checks} checks passed`);
