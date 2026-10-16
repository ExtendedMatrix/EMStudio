// MICRO-SPAZIO-3D-3 p.11 · a model's name without its level suffix — pure (`src/rm-names.ts`):
//   node scripts/check-rm-names.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ stdin: { contents: `export * as N from "./rm-names";`, resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false });
const { N } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
// the forms measured on Templu Mare v3.2
eq(N.splitLevel("SM_OB_EST_fr_LOD1"), { base: "SM_OB_EST_fr", level: "LOD1", tail: "" }, "_LOD1 (11 models of v3.2)");
eq(N.splitLevel("OB_EST_L (surveyed mesh) lod3"), { base: "OB_EST_L (surveyed mesh)", level: "LOD3", tail: "" }, "« lod3» (198 resources)");
eq(N.splitLevel("OB_EST_L LOD0 (OBJ)"), { base: "OB_EST_L", level: "LOD0", tail: "(OBJ)" }, "« LOD0 (OBJ)» (33 resources): the format kept apart");
eq(N.splitLevel("Rocchio-lod12"), { base: "Rocchio", level: "LOD12", tail: "" }, "a dash, two digits");
eq(N.splitLevel("Podio.Lod_2"), { base: "Podio", level: "LOD2", tail: "" }, "a dot, «Lod_2»");
eq(N.splitLevel("Column_light1_model"), { base: "Column_light1_model", level: null, tail: "" }, "no level: as it is");
eq(N.splitLevel("LOD1"), { base: "LOD1", level: null, tail: "" }, "only a level: as it is");
eq(N.splitLevel("Templod1"), { base: "Templod1", level: null, tail: "" }, "a word ending in «lod1» without a separator: as it is");
eq(N.shownModelName("SM_OB_EST_fr_LOD1", true), { shown: "SM_OB_EST_fr", technical: "SM_OB_EST_fr_LOD1", level: "LOD1" }, "a model with versions: shortened, the level a chip");
eq(N.shownModelName("SM_OB_EST_fr_LOD1", false), { shown: "SM_OB_EST_fr_LOD1", technical: "SM_OB_EST_fr_LOD1", level: null }, "without versions: as it is");
console.log(`check-rm-names: ${checks} checks passed`);
