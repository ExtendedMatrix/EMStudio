// MICRO-LG11 (E.D., 23 Nov 2026) · A UNIT WITHOUT A NUMBER — the datamodel's
// form (node datamodel 1.6.55, StratigraphicNode `data.unnumbered`), shown in
// the Inspector beside the type («Senza numero», the label of the datamodel's
// translations, `node_elements`) and warned by the issues («unità senza numero:
// assegnarne uno»). Never a number invented: a person assigns it.
//
//   node scripts/check-unnumbered.mjs
//
//   1 · the DATAMODEL copies: node 1.6.55 with the element, translations 1.25
//       with its label EN + IT, connections 1.6.61 (a USN member of a functional
//       unit);
//   2 · the RULES: the texts issues.unnumbered / issues.unnumberedName /
//       insp.unnumberedTip in EN and IT, none in the LAB_TEXTS blocks; the
//       inspector draws the badge from rules.ts (isUnnumbered,
//       nodeElementText), not from a word of its own;
//   3 · the ISSUES (pure, in node): a declared unit and a unit whose name holds
//       no number → one warning each, rule «unnumbered»; SU051, the continuity
//       node and a document → none; the label in IT and EN.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, what); checks++; };


// 1 · the datamodel copies
const read = (f) => JSON.parse(fs.readFileSync(`${SRC}assets/${f}`, "utf8"));
const dm = read("s3Dgraphy_node_datamodel.json");
eq(dm.s3Dgraphy_data_model_version, "1.6.55", "node datamodel 1.6.55");
const el = dm.stratigraphic_nodes.StratigraphicNode.properties.unnumbered;
eq([el.em_json, el.value], ["data.unnumbered", "boolean"], "the element data.unnumbered, boolean");
const tr = read("datamodel_translations.json");
eq(tr.version, "1.25", "translations 1.25");
eq([tr.node_elements.unnumbered.label.en, tr.node_elements.unnumbered.label.it],
   ["Without number", "Senza numero"], "its label EN + IT");
const cn = read("s3Dgraphy_connections_datamodel.json");
eq(cn.s3Dgraphy_connections_model_version, "1.6.61", "connections 1.6.61");
ok(cn.edge_types.is_in_functional_unit.allowed_connections.source.includes("NegativeStratigraphicUnit"),
   "a USN may be a member of a functional unit");

// 2 · the rules
const i18n = fs.readFileSync(`${SRC}i18n.ts`, "utf8");
for (const k of ["issues.unnumbered", "issues.unnumberedName", "insp.unnumberedTip"])
  eq((i18n.match(new RegExp(`"${k.replace(".", "\\.")}":`, "g")) ?? []).length >= 2, true, `${k} in EN and IT`);
const lab = [...i18n.matchAll(/\n  \.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]).join("\n");
ok(!/unnumbered/.test(lab), "no text of the unit without a number under embargo");
const insp = fs.readFileSync(`${SRC}inspector.ts`, "utf8");
ok(/isUnnumbered\(node\)/.test(insp) && /nodeElementText\("unnumbered"\)/.test(insp),
   "the inspector's badge reads the datamodel (isUnnumbered, nodeElementText)");

// 3 · the issues — one bundle (issues + rules + i18n share ONE locale) per
// language, the language chosen as the app does: localStorage «emstudio.locale»
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v),
                            removeItem: (k) => store.delete(k), clear: () => store.clear() };
async function bundle(lang) {
  store.set("emstudio.locale", lang);
  const b = await esbuild.build({ stdin: { contents:
      'export * as I from "./issues.ts"; export * as R from "./rules.ts"; export { t } from "./i18n.ts";',
      resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false, logLevel: "silent",
      loader: { ".json": "json" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64") + `#${lang}`);
}
const g = { nodes: [
  { id: "e", node_type: "US", name: "US non numerata — terra", data: { unnumbered: true } },
  { id: "x", node_type: "US", name: "X_TOPSOIL" },
  { id: "n", node_type: "US", name: "SU051" },
  { id: "br", node_type: "BR", name: "continuity_node" },
  { id: "d", node_type: "document", name: "relazione" }], edges: [] };
for (const [lang, phrase, label] of [["it", "unità senza numero — assegnarne uno", "Senza numero"],
                                     ["en", "unit without a number — assign one", "Without number"]]) {
  const { I, R, t } = await bundle(lang);
  const rows = I.issues({ doc: { graph: g }, nodes: g.nodes, isUnit: R.isStratigraphicType, t })
    .filter((i) => i.rule === "unnumbered");
  eq(rows.map((i) => [i.node, i.sev]), [["e", "warn"], ["x", "warn"]],
     `${lang}: two warnings, the declared unit and X_TOPSOIL; none for SU051, the BR, a document`);
  ok(rows[0].txt.includes(phrase), `${lang}: «${phrase}»`);
  eq(R.nodeElementText("unnumbered"), label, `${lang}: the badge says «${label}»`);
  eq([R.isUnnumbered(g.nodes[0]), R.isUnnumbered(g.nodes[2])], [true, false], `${lang}: isUnnumbered`);
}

console.log(`check-unnumbered: ${checks} checks ok`);
