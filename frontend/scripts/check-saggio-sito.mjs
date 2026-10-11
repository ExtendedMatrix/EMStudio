// THE SAGGIO WITH ITS PLACE, THE SITE A PLACE, THE STUDY'S CODE.
//
//   node scripts/check-saggio-sito.mjs
//
// Giro dell'11 ottobre (E.D., 11 Oct 2026), EMStudio's half:
//
//  1 · the site is a place, not HDT-O: no place is ever dropped as HDT-O, the
//      HDT-O layer is study, HC1, twin, project and proposition set; the
//      Matrix draws NO place as a box (every LocationNodeGroup, empty or
//      full), the Graph view draws them as every node — and the document keeps
//      them, untouched;
//  2 · «Where it took place» proposes the sites and the saggi of the graph,
//      and a saggio chosen is hung off its site (is_in_location);
//  3 · the EM-ID is retired: no field in the panel, the code is the study's,
//      a file with an em_id shows it migrated (only when the study has no code;
//      no study, no code), and the EMtree card reads the study's code;
//  4 · un-ticking «a recognised heritage asset» asks before deleting HC1,
//      twin and «part of» — the text in en, it, de;
//  5 · parity with s3dgraphy's declare_hdto on the 10 Oct cases plus a saggio
//      under its site (`hdto_parity.py`, the local ../s3Dgraphy/src — `S3D=`).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as esbuild from "esbuild";
import { parseHTML } from "linkedom";

const { window, document } = parseHTML("<html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// linkedom's <select> has no settable value: the same shim as check-studio-luogo
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
const S = await load("study-panel.ts");
const R = await load("rules.ts");
const I = await load("i18n.ts");
const L = await load("views/liquid.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const LOC = R.nodeTypeForClass("LocationNodeGroup");
const HC1 = R.nodeTypeForClass("HeritageEntityNode");
const GRAPH = R.nodeTypeForClass("GraphNode");
const BASE = {
  studyTitle: "", studyAuthors: "", studyDate: "",
  heritageName: "", heritageUri: "", heritageAuthorityRef: undefined,
  parentName: "", parentUri: "", parentAuthorityRef: undefined,
  projectName: "", twin: { state: "none", name: "", key: "" },
};
const typed = (s, t) => s.doc.graph.nodes.filter((n) => n.node_type === t);
const edgeOf = (s, src, tgt) => s.doc.graph.edges.find((e) => e.source === src && e.target === tgt);

/** A pyArchInit-like graph: comune › site, two saggi (one in the site, one not
 *  yet), a unit in each. */
function projected() {
  const site = H.makeSitePlace("Aiano");
  const comune = { id: "c-pog", name: "Poggibonsi", node_type: LOC, data: { level: "comune", kind: "toponym" } };
  const s1 = { id: "sg-1", name: "Saggio 1", node_type: LOC, data: { kind: "study", group_kind: "saggio", sito: "Aiano" } };
  const s2 = { id: "sg-2", name: "Saggio 2", node_type: LOC, data: { kind: "study", group_kind: "saggio", sito: "Aiano" } };
  const room = { id: "f-1", name: "Ambiente A", node_type: LOC, data: { kind: "functional" } };
  const area = { id: "loc::area::study::1", name: "1", node_type: LOC, data: { kind: "study" } };
  const u1 = { id: "u1", name: "US1", node_type: "US", data: {} };
  const u2 = { id: "u2", name: "US2", node_type: "US", data: {} };
  const e = (a, t, b) => ({ id: `${a}__${t}__${b}`, source: a, target: b, edge_type: t });
  return new M.DocumentStore({ graph: { graph_id: "g", name: "Aiano", nodes: [site, comune, s1, s2, room, area, u1, u2],
    edges: [e(site.id, "is_in_location", comune.id), e("sg-1", "is_in_location", site.id),
            e("u1", "is_in_location", "sg-1"), e("u2", "is_in_location", "sg-2"),
            e("u1", "is_in_location", site.id)] } });
}

// ── 1 · the site is a place, not HDT-O ───────────────────────────────────────
console.log("\n1 · a place is topography: never HDT-O; the Matrix draws no place");
{
  const s = projected();
  s.applyHdto({ ...BASE, studyTitle: "Saggio 1", placeId: "sg-1", placeName: "Saggio 1",
                heritageDeclared: true, heritageName: "Villa di Aiano",
                twin: { state: "provisional", name: "Aiano HDT", key: "" }, projectName: "Aiano project" });
  const chain = H.hdtoChain(s.doc);
  const places = typed(s, LOC).map((n) => n.id);
  for (const on of [false, true]) {
    const dropped = H.hdtoDropped(s.doc, s.doc.graph.nodes, R.hdtoProfileTypes(), on);
    ok(places.every((id) => !dropped.has(id)), `no place is dropped as HDT-O (layer ${on ? "on" : "off"}) — empty or full`);
  }
  eq([...chain.layerIds].map((id) => s.node(id)?.data?.hdto_role).sort(),
     ["about", "project", "proposition_set", "study", "twin"],
     "the HDT-O layer: study, heritage, twin, project, proposition set — no place");
  ok(chain.ids.has("sg-1") && !chain.layerIds.has("sg-1"), "…the place stays on the card, out of the layer");
  const on = H.hdtoDropped(s.doc, s.doc.graph.nodes, R.hdtoProfileTypes(), true);
  const study = H.roleNode(s.doc, "study");
  ok(!on.has(study.id) && !on.has("sg-1") && edgeOf(s, study.id, "sg-1")?.edge_type === "study_took_place_at",
     "layer on · study_took_place_at has both ends in the Graph view, so it is drawn");
  // the Graph view draws a place as every place, a HALO behind its members;
  // with the layer on, study_took_place_at is that membership
  const view = { nodes: s.doc.graph.nodes.filter((n) => !on.has(n.id)),
                 edges: s.doc.graph.edges, badges: new Map(), adornments: new Map() };
  const liq = L.buildLiquidScene(s.doc, view, new Map(), () => ({ x: 0, y: 0 }));
  const halo = liq.liquid.halos.find((h) => h.id === "sg-1");
  ok(halo && halo.members.includes(study.id) && halo.members.includes("u1"),
     "Graph view · the saggio is a halo; with the layer on the study is in it, beside its unit");
  ok(!liq.nodes.some((n) => n.node?.node_type === LOC), "…and no place is a disc");
  const site = liq.liquid.halos.find((h) => h.id === H.sitePlaceId("Aiano"));
  ok(site && site.members.includes("u1"), "…the site is a halo too, of the units in it");
  // the Matrix: every LocationNodeGroup out of the picture, the data intact
  const main = readFileSync(`${SRC}main.ts`, "utf-8");
  ok(/const noPlaces = v === "matrix";/.test(main) && /placesUndrawn: noPlaces/.test(main),
     "the Matrix view (and only it) is built with placesUndrawn");
  ok(/if \(opts\.placesUndrawn && !wholeGraph\) \{\s*const loc = nodeTypeForClass\("LocationNodeGroup"\);\s*for \(const n of vNodes\) if \(n\.node_type === loc\) dropped\.add\(n\.id\);/.test(main),
     "…placesUndrawn leaves out every LocationNodeGroup, whatever it holds");
  ok(/filteredView\(\{ placesUndrawn: true \}\)/.test(main), "…and the Matrix's own re-layout reads the same picture");
  // measured: the Matrix scene already skipped every place (B1, #25); the view
  // now leaves them out before it, so the re-layout and the edges agree
  ok(/if \(ancestorsOf\(node\.node_type\)\.includes\("LocationNodeGroup"\)\) continue;/.test(
       readFileSync(`${SRC}views/matrix.ts`, "utf-8")), "…and the Matrix scene's own rule (B1, #25) is still there");
  ok(!/mmHdto|memberCount/.test(main), "the old «empty place = HDT-O» test is gone");
  ok(typed(s, LOC).length === 6 && s.doc.graph.edges.filter((e) => e.edge_type === "is_in_location").length >= 5,
     "the document keeps every place and every membership");
}

// ── 2 · «Where it took place» ────────────────────────────────────────────────
console.log("\n2 · «Where it took place»: the sites and the saggi; a saggio goes in its site");
{
  const s = projected();
  eq(H.studyPlaceChoices(s.doc).map((n) => n.name), ["Aiano", "Saggio 1", "Saggio 2"],
     "proposed: the site, then the saggi — not the comune, not a functional room, not an area");
  ok(H.isSaggio({ id: "loc::saggio::study::Saggio 1", name: "Saggio 1", node_type: LOC, data: { kind: "study" } }) && !H.isSaggio({ id: "x", node_type: LOC, data: { kind: "study", group_kind: "area" } }),
     "the importer's loc::saggio:: place is a saggio; a grouped area is not");
  const root = document.createElement("div");
  S.renderStudyPanel(root, s, {});
  eq([...root.querySelectorAll("datalist option")].map((o) => o.getAttribute("value")),
     ["Aiano", "Saggio 1", "Saggio 2"], "the panel's list is the same");
  ok(/saggio/.test(root.querySelectorAll("datalist option")[1].getAttribute("label")),
     "…a saggio says it is one");
  // Saggio 2 is in no site yet: chosen, it is hung off Aiano
  s.applyHdto({ ...BASE, studyTitle: "Saggio 2", placeId: "sg-2", placeName: "Saggio 2" });
  const site = H.sitePlaceId("Aiano");
  const e = edgeOf(s, "sg-2", site);
  eq([e?.edge_type, e?.id], ["is_in_location", `sg-2__is_in_location__${site}`], "the saggio chosen is in its site");
  eq(H.hdtoChain(s.doc).place.within.map((w) => w.name), ["Aiano", "Poggibonsi"], "…the chain goes up through the site");
  eq(typed(s, LOC).filter((n) => n.data?.level === "sito").length, 1, "…and no second site was made");
  s.applyHdto({ ...s.readHdto() });
  eq(s.doc.graph.edges.filter((x) => x.source === "sg-2" && x.edge_type === "is_in_location").length, 1,
     "re-applied: one membership, not two");
  // Saggio 1 is already in the site: nothing added
  const t = projected();
  const before = t.doc.graph.edges.length;
  t.applyHdto({ ...BASE, studyTitle: "Saggio 1", placeId: "sg-1", placeName: "Saggio 1" });
  eq(t.doc.graph.edges.length - before, 2, "a saggio already in its site: only the study's two edges");
  // a saggio whose site the graph does not have yet: made from the name it carries
  const u = new M.DocumentStore({ graph: { graph_id: "g", nodes: [
    { id: "sg-9", name: "Saggio 9", node_type: LOC, data: { kind: "study", sito: "Volterra" } }], edges: [] } });
  u.applyHdto({ ...BASE, studyTitle: "Saggio 9", placeId: "sg-9", placeName: "Saggio 9" });
  ok(u.node(H.sitePlaceId("Volterra"))?.data?.level === "sito" && edgeOf(u, "sg-9", H.sitePlaceId("Volterra")),
     "a saggio of a site the graph lacks: the site made with s3dgraphy's id, the saggio in it");
  const v = new M.DocumentStore({ graph: { graph_id: "g", nodes: [
    { id: "sg-0", name: "Saggio 0", node_type: LOC, data: { kind: "study" } }], edges: [] } });
  v.applyHdto({ ...BASE, studyTitle: "Saggio 0", placeId: "sg-0", placeName: "Saggio 0" });
  eq(typed(v, LOC).length, 1, "a saggio that names no site, in a graph with none: no site invented");
}

// ── 3 · the EM-ID is retired ─────────────────────────────────────────────────
console.log("\n3 · the code is the study's; an em_id is shown migrated");
{
  const withEmId = (study) => new M.DocumentStore({ graph: { graph_id: "g", nodes: [
    { id: "g_graphroot", name: "Graph", node_type: GRAPH, data: { em_id: "TM" } }], edges: [] } });
  const s = withEmId();
  const root = document.createElement("div");
  S.renderStudyPanel(root, s, {});
  ok(![...root.querySelectorAll("label")].some((l) => /EM-ID/.test(l.textContent)),
     "the panel has no «EM-ID (site id)» field");
  // giro 2 (E.D., 11 Oct 2026): the em_id is the code's last source, READ —
  // no study is made for it, and the file is not changed
  eq([H.emIdMigration(s.doc).reason, s.readHdto().studyCode, H.shownCode(s.doc), H.studyCode(s.doc)],
     ["no study", "", "TM", "TM"], "no study → the em_id is read as the code, no study made for it");
  ok(!H.roleNode(s.doc, "study"), "…and nothing was written");
  ok(root.querySelector('[data-hdto="emid-note"]'), "…and the panel says the file has a former EM-ID");
  s.applyHdto({ ...BASE, studyTitle: "Templu Mare 2016" });
  eq([H.emIdMigration(s.doc).reason, s.readHdto().studyCode, H.shownCode(s.doc), H.studyCode(s.doc), H.isCodeProposed(s.doc)],
     ["study has its code", "TM", "TM", "TM", false],
     "the study born in a file with an em_id takes it as its code — written as it is, not a proposal");
  const root2 = document.createElement("div");
  S.renderStudyPanel(root2, s, {});
  eq(root2.querySelector('[data-hdto="code"]').value, "TM", "the code field holds it");
  s.applyHdto({ ...s.readHdto() });
  eq([H.roleNode(s.doc, "study").data.code, s.node("g_graphroot").data.em_id], ["TM", "TM"],
     "written with the study; the em_id stays where it was (nothing lost)");
  const t = withEmId();
  t.applyHdto({ ...BASE, studyTitle: "S", studyCode: "TM16" });
  eq([H.emIdMigration(t.doc).reason, t.readHdto().studyCode, H.shownCode(t.doc)],
     ["study has another code", "TM16", "TM16"], "a study with its own code keeps it");
  const emtree = readFileSync(`${SRC}emtree.ts`, "utf-8");
  ok(/const code = shownCode\(slot\.store\.doc\)/.test(emtree) && /emtree\.noCode/.test(emtree) && !/em_id/.test(emtree.replace(/\/\/.*$/gm, "")),
     "the EMtree card reads the study's code, not the em_id");
}

// ── 4 · the confirmation ─────────────────────────────────────────────────────
console.log("\n4 · un-ticking the heritage asks first");
{
  const s = new M.DocumentStore({ graph: { graph_id: "g", nodes: [], edges: [] } });
  s.applyHdto({ ...BASE, studyTitle: "S", heritageDeclared: true, heritageName: "Colosseo",
                parentName: "Roma", twin: { state: "provisional", name: "Colosseo HDT", key: "" } });
  const asked = [];
  const untick = (answer) => {
    S.setUndeclareConfirm((name) => { asked.push(name); return answer; });
    const root = document.createElement("div");
    S.renderStudyPanel(root, s, {});
    const cb = root.querySelector('[data-hdto="declared"]');
    cb.checked = false;
    cb.dispatchEvent(new window.Event("change"));
    return cb;
  };
  const cb = untick(false);
  ok(cb.checked && typed(s, HC1).length === 2 && H.roleNode(s.doc, "twin"), "«no» → nothing deleted, the tick back");
  eq(asked, ["Colosseo"], "…the question names the heritage");
  untick(true);
  ok(typed(s, HC1).length === 0 && !H.roleNode(s.doc, "twin"), "«yes» → HC1, twin and «part of» go");
  s.undo();
  ok(typed(s, HC1).length === 2, "…and one undo brings them back");
  for (const lang of ["en", "it", "de"]) {
    I.setLocale(lang);
    const text = I.t("insp.hdtUndeclareConfirm", { name: "Colosseo" });
    ok(text && text !== "insp.hdtUndeclareConfirm" && /Colosseo/.test(text), `the question in ${lang}`);
  }
  I.setLocale("en");
}

// ── 5 · parity ───────────────────────────────────────────────────────────────
console.log("\n5 · applyHdto = declare_hdto, a saggio under its site included");
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
  { label: "a saggio under its site",
    pre: "Aiano", saggio: { id: "saggio-aiano-1", name: "Saggio 1" },
    fields: { ...BASE, studyTitle: "Saggio 1", studyKind: "stratigraphic_excavation",
              placeName: "Saggio 1", placeId: "saggio-aiano-1" },
    declare: { study: { name: "Saggio 1", study_kind: "stratigraphic_excavation" },
               place: { id: "saggio-aiano-1" } } },
];
const py = (() => {
  for (const exe of [process.env.PYTHON, `${S3D}/.venv/bin/python`, "python3"]) {
    if (!exe || (exe.startsWith("/") && !existsSync(exe))) continue;
    try {
      const out = execFileSync(exe, ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(`${S3D}/src`)}); exec(open(${JSON.stringify(`${HERE}hdto_parity.py`)}).read())`],
        { input: JSON.stringify(CASES.map((c, i) => ({ graph_id: `g${i}`, name: "Villa di Aiano",
            pre_place: c.pre, pre_saggio: c.saggio, declare: c.declare }))),
          encoding: "utf-8", maxBuffer: 1 << 26 });
      return JSON.parse(out);
    } catch (e) { console.log(`  (${exe}: ${String(e.message).split("\n")[0]})`); }
  }
  return null;
})();
ok(py, "s3dgraphy (local tree) answered — the parity cannot be skipped");
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
  CASES.forEach((c, i) => {
    const pre = py[i].pre_graph;
    const s = new M.DocumentStore({ graph: pre
      ? { ...pre, graph_id: `g${i}`, name: "Villa di Aiano",
          nodes: pre.nodes.filter((n) => n.node_type !== "geo_position"),
          edges: pre.edges }
      : { graph_id: `g${i}`, name: "Villa di Aiano", nodes: [], edges: [] } });
    if (c.pre && !pre) s.doc.graph.nodes.push(H.makeSitePlace(c.pre));
    s.applyHdto(c.fields);
    const mine = norm(s.doc.graph), theirs = norm(py[i].graph);
    eq(Object.keys(mine.nodes).sort(), Object.keys(theirs.nodes).sort(), `${c.label} · the same roles`);
    eq(mine.nodes, theirs.nodes, `${c.label} · the same nodes (type, name, data)`);
    eq(mine.edges, theirs.edges, `${c.label} · the same edges`);
    ok(mine.idsOk && theirs.idsOk, `${c.label} · edge ids <src>__<type>__<tgt> on both sides`);
  });
  const last = norm(py[CASES.length - 1].graph);
  ok(last.edges.includes("study ─study_took_place_at→ place:saggio-aiano-1") &&
     last.edges.includes(`place:saggio-aiano-1 ─is_in_location→ place:${H.sitePlaceId("Aiano")}`),
     "the saggio case · the study at the saggio, the saggio in the site");
}

console.log(`\nsaggio-sito: ${checks} checks passed`);
