// Giro dell'11 ottobre (2) · the study's code is STABLE, proposed once and
// marked until confirmed; the rapporti between the graphs of one em.json are
// shown and lead to the other graph (E.D., 11 Oct 2026).
//
//   node scripts/check-codice-stabile.mjs
//
// 1 · parity with s3dgraphy (the local ../s3Dgraphy/src — `S3D=`,
//     `codice_stabile_parity.py`): `studyCode` and `proposalFor` give what
//     `hdto.study_code` and `hdto.proposal_for` give, on the same sections.
// 2 · the Study panel: a study born without a code gets the proposal, marked
//     and shown AS a proposal; «Confirm» takes the mark away and keeps the
//     code; a code the user writes is no proposal; a code cleared stays
//     cleared (proposed once, then fixed); the codes of the other graphs are
//     avoided; a file's em_id is the code of a study born in it.
// 3 · the links: `linksOf` equals s3dgraphy's `links_of` for every unit of a
//     container with a rapporto between two saggi; the container travels
//     through parseContainer → buildContainer with its links; the Inspector
//     draws them with the graph they are in and a click runs the jump.
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
const LK = await load("links.ts");
const C = await load("container.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; console.log(`  ✓ ${what}`); };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
  console.log(`  ✓ ${what}`);
};

const py = (() => {
  for (const exe of [process.env.PYTHON, `${S3D}/.venv/bin/python`, "python3"]) {
    if (!exe || (exe.startsWith("/") && !existsSync(exe))) continue;
    try {
      const out = execFileSync(exe, ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(`${S3D}/src`)}); exec(open(${JSON.stringify(`${HERE}codice_stabile_parity.py`)}).read())`],
        { encoding: "utf-8", maxBuffer: 1 << 26 });
      return JSON.parse(out);
    } catch (e) { console.log(`  (${exe}: ${String(e.message).split("\n")[0]})`); }
  }
  return null;
})();

// ── 1 · parity of the code with s3dgraphy ────────────────────────────────────
console.log("\n1 · studyCode and proposalFor are s3dgraphy's study_code and proposal_for");
ok(py, "s3dgraphy (local tree) answered — the parity cannot be skipped");
for (const c of py.codes) {
  const doc = { graph: c.graph };
  eq([H.studyCode(doc), H.proposalFor(doc, c.taken)], [c.study_code, c.proposal],
     `${c.graph.graph_id}: code ${c.study_code ?? "—"}, proposal ${c.proposal}`);
}

// ── 2 · the panel ────────────────────────────────────────────────────────────
console.log("\n2 · the Study panel: the proposal marked, the confirmation, the user's code");
const BASE = { studyTitle: "", studyAuthors: "", studyDate: "", heritageName: "", heritageUri: "",
               parentName: "", parentUri: "", projectName: "", twin: { state: "none" } };
{
  const s = new M.DocumentStore({ graph: { graph_id: "g", nodes: [], edges: [] } });
  s.applyHdto({ ...BASE, studyTitle: "Saggio A", studyDate: "2016", placeName: "Grotta di Tiberio",
                takenCodes: ["GT16"] });
  const study = () => H.roleNode(s.doc, "study");
  eq([study().data.code, study().data.code_proposed, s.readHdto().studyCodeProposed],
     ["GT16-2", true, true], "born without a code: the proposal (site initials + year, GT16 taken) is written, marked");
  const root = document.createElement("div");
  let asked = 0;
  S.renderStudyPanel(root, s, { otherStudyCodes: () => { asked++; return ["GT16"]; } });
  ok(root.querySelector('[data-hdto="code-proposed"]') && root.querySelector('[data-hdto="code"]').classList.contains("insp-proposed"),
     "the panel shows it AS a proposal");
  eq(root.querySelector('[data-hdto="code"]').value, "GT16-2", "…in the code field");
  s.applyHdto({ ...s.readHdto(), studyAuthors: "E.D.", takenCodes: [] });
  eq([study().data.code, study().data.code_proposed], ["GT16-2", true],
     "another commit, the neighbours gone: the proposal does not move, still marked");
  root.querySelector('[data-hdto="code-confirm"]').click();
  eq([study().data.code, "code_proposed" in study().data, H.isCodeProposed(s.doc)], ["GT16-2", false, false],
     "«Confirm»: the mark goes, the code stays");
  ok(asked > 0, "the panel asked for the other graphs' codes");
  const root2 = document.createElement("div");
  S.renderStudyPanel(root2, s, {});
  ok(!root2.querySelector('[data-hdto="code-proposed"]'), "confirmed: no proposal shown");
  s.undo();
  eq(study().data.code_proposed, true, "undo brings the mark back");

  const u = new M.DocumentStore({ graph: { graph_id: "g", nodes: [], edges: [] } });
  u.applyHdto({ ...BASE, studyTitle: "Saggio B", placeName: "Volterra", studyDate: "2024" });
  eq(H.roleNode(u.doc, "study").data.code, "VO24", "Volterra 2024 → VO24");
  u.applyHdto({ ...u.readHdto(), studyCode: "VLT24" });
  eq([H.roleNode(u.doc, "study").data.code, "code_proposed" in H.roleNode(u.doc, "study").data],
     ["VLT24", false], "a code the user writes replaces the proposal and is no proposal");
  u.applyHdto({ ...u.readHdto(), studyCode: "" });
  u.applyHdto({ ...u.readHdto(), studyAuthors: "x" });
  ok(!("code" in H.roleNode(u.doc, "study").data), "a code cleared stays cleared: proposed once, at the birth, then fixed");

  const w = new M.DocumentStore({ graph: { graph_id: "g", nodes: [], edges: [] } });
  w.applyHdto({ ...BASE, studyTitle: "Saggio C", studyCode: "SC1" });
  eq([H.roleNode(w.doc, "study").data.code, "code_proposed" in H.roleNode(w.doc, "study").data],
     ["SC1", false], "born WITH a code: nothing is proposed");
  const v = new M.DocumentStore({ graph: { graph_id: "g", graph_code: "GT16", nodes: [], edges: [] } });
  v.applyHdto({ ...BASE, studyTitle: "Saggio D" });
  eq([H.roleNode(v.doc, "study").data.code, "code_proposed" in H.roleNode(v.doc, "study").data],
     ["GT16", false], "born in a GraphML with ID GT16: the header's code, written as it is");
}

// ── 3 · the links ────────────────────────────────────────────────────────────
console.log("\n3 · the rapporti between graphs: read, kept, shown, navigable");
{
  const parsed = C.parseContainer(py.container);
  const docs = parsed.members.map((m) => ({ graphId: m.id, doc: m.doc }));
  for (const [key, want] of Object.entries(py.links)) {
    const [gid, nid] = key.includes("|u") ? [key.slice(0, key.lastIndexOf("|")), key.slice(key.lastIndexOf("|") + 1)] : [key, undefined];
    eq(LK.linksOf(docs, gid, nid), want, `linksOf(${key}) = s3dgraphy's links_of`);
  }
  for (const [gid, want] of Object.entries(py.linked)) {
    eq(LK.linkedGraphs(docs, gid), want, `linkedGraphs(${gid})`);
  }
  const back = C.buildContainer({ graphs: parsed.members.map((m) => ({ id: m.id, doc: m.doc })),
                                  activeGraphId: parsed.activeGraphId });
  eq(back.graphs["Site|S1"].links, py.container.graphs["Site|S1"].links,
     "the links travel through parseContainer → buildContainer as they came");
  ok(!("links" in back.graphs["Site|S2"]), "…and a graph without links gets no key");
  const s1 = docs.find((d) => d.graphId === "Site|S1").doc;
  ok(s1.graph.edges.every((e) => s1.graph.nodes.some((n) => n.id === e.target)),
     "no edge of the graph points out of it: the rapporto is a link, not an edge");
  // a link whose other graph is not open: unresolved, said
  eq(LK.linksOf([docs[0]], "Site|S1", "u3")[0].resolved, false, "the other graph not open → unresolved");

  // the Inspector draws them; a click runs the jump
  const I = await load("inspector.ts");
  const src = readFileSync(`${SRC}inspector.ts`, "utf-8");
  ok(/cb\.crossGraphLinks\?\.\(nodeId\)/.test(src) && /t\("insp\.crossGraph"\)/.test(src),
     "the Inspector asks for the rapporti with other graphs and titles them");
  const main = readFileSync(`${SRC}main.ts`, "utf-8");
  ok(/crossGraphLinks: \(nodeId\) => crossGraphLinks\(nodeId\)/.test(main)
     && /activateSlot\(slot\.id\);\s*jumpTo\(l\.other\.node_id\)/.test(main),
     "main wires them: the other graph comes in front, then the jump to the unit");
  ok(typeof I.renderInspector === "function", "inspector.ts builds");
  const i18n = readFileSync(`${SRC}i18n.ts`, "utf-8");
  for (const key of ["insp.crossGraph", "insp.crossGraphGo", "insp.crossGraphMissing",
                     "insp.hdtStudyCodeProposed", "insp.hdtStudyCodeConfirm"]) {
    eq(i18n.split(`"${key}":`).length - 1 >= 3, true, `${key} in en, it, de`);
  }
}

console.log(`\ncodice-stabile: ${checks} checks passed`);
