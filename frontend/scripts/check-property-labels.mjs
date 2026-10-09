// MICRO-BADGE-PD · part 5: a property shows a readable label in the interface
// language beside its technical name (`rules.propertyLabel`). The words are the
// datamodel's — the qualia (translations `qualia`) and the EM names in use that
// are not a quale (`property_names`, em_qualia_types 1.6.8) — matched as
// s3Dgraphy's RDF exporter matches a name to a quale (as written, the tail after
// a dot, lower case); a free name is shown as it is. The search finds a
// property by its label and by its technical name.
//
//   node scripts/check-property-labels.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map([["emstudio.locale", "it"]]);
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const el = () => ({ setAttribute() {}, removeAttribute() {}, style: {}, dataset: {} });
globalThis.document = { documentElement: el(), body: el(), title: "", querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export { propertyLabel } from "./rules"; export { setLocale, getLocale } from "./i18n"; export { searchGraph } from "./search";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const L = (name, data = {}) => { const r = M.propertyLabel({ name, data }); return [r.label, r.technical, r.term]; };

M.setLocale("it");
eq(L("height"), ["Altezza", "height", "height"], "height → Altezza");
eq(L("Height"), ["Altezza", "Height", "height"], "Height (yEd) → Altezza");
eq(L("Dimension.height"), ["Altezza", "Dimension.height", "height"], "Dimension.height → Altezza (the tail after the dot)");
eq(L("absolute_time_start"), ["Data di inizio", "absolute_time_start", "absolute_time_start"], "absolute_time_start → Data di inizio");
eq(L("material"), ["Materiale", "material", "material"], "material → Materiale (property_names)");
eq(L("Material"), ["Materiale", "Material", "material"], "Material → Materiale");
eq(L("definition"), ["Definizione", "definition", "definition"], "definition → Definizione");
eq(L("Riser depth"), ["Riser depth", "Riser depth", null], "a free name is shown as it is");
eq(L("step_dimensions"), ["step_dimensions", "step_dimensions", null], "…step_dimensions too");
eq(L("altezza scala", { property_type: "height" }), ["Altezza", "altezza scala", "height"], "property_type first, when it is a term");
eq(L("Riser depth", { property_type: "string" }), ["Riser depth", "Riser depth", null], "property_type «string» is no term");
M.setLocale("de");
eq(L("absolute_time_start")[0], "Anfangsdatum", "de: Anfangsdatum");
M.setLocale("en");
eq(L("material")[0], "Material", "en: Material");

// the search: by the label and by the technical name
M.setLocale("it");
const doc = { graph: { nodes: [
  { id: "U1", node_type: "US", name: "US 1" },
  { id: "P1", node_type: "property", name: "height", description: "2 m" },
  { id: "P2", node_type: "property", name: "Riser depth", description: "18" },
], edges: [{ id: "e1", source: "U1", target: "P1", edge_type: "has_property" },
           { id: "e2", source: "U1", target: "P2", edge_type: "has_property" }] } };
const hits = (q) => M.searchGraph(doc, q).map((h) => h.label);
eq(hits("Altezza")[0], "US 1 · height — Altezza", "«Altezza» finds height, and says both");
eq(hits("height")[0], "US 1 · height — Altezza", "«height» too");
eq(hits("Riser")[0], "US 1 · Riser depth", "a free name by its name");
console.log(`check-property-labels: ${checks} checks passed`);
