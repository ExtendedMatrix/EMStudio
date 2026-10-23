// MICRO-PROVA-DEV47 p.3 · the levels of a model, the author's and the recipe's
// — pure (`src/lod-levels.ts`), on the two families of Templu Mare v3.2 as
// measured (17 Oct 2026):
//
//   node scripts/check-lod-levels.mjs
//
// · the survey, OB_PODIO: the master (.blend), three OBJ levels of E.D.
//   (LOD0 2026, LOD1 and LOD2 2021, Blender), then two glb of the recipe of EM
//   Tools — lod3 a copy of LOD2 (ratio 1), lod4 its half (ratio 0.5, Draco);
// · the reconstruction, Column_light1: the master, the recipe's lod0 (ratio 1,
//   textures as they are: the WHOLE model) and lod1 (its half);
// · the default of a desktop: LOD2 for the survey, the whole for the
//   reconstruction; the order finest first; the weight that asks first.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as L from "./lod-levels";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { L } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// the steps, as v3.2 has them
const author = (technique) => ({ dtc_kind: "lod_generation", parameters: { level: "x" }, technique, tool: { name: "Blender" } });
const recipe = (ratio, tex, draco) => ({ dtc_kind: "lod_generation", parameters: { draco, level: "x", max_texture_px: tex, ratio, size_bytes: 1, textures_resized: 0, tool: "EM Tools · Prepare for a use" },
  technique: ratio < 1 ? "decimation" : "compression", tool: { name: "EM Tools" } });

eq(L.stepOrigin(author("OBJ export of the LOD0 mesh, Blender 5.2 (E.D., 30 Sep 2026)")), "author", "an OBJ export by Blender: the author's");
eq(L.stepOrigin(recipe(1, 0, false)), "recipe", "«EM Tools · Prepare for a use»: the recipe's");
eq(L.stepOrigin({ parameters: { ratio: 0.5 }, tool: { name: "EM Tools" } }), "recipe", "EM Tools with its knobs, the name of the recipe lost: the recipe's");
eq(L.stepOrigin({ parameters: { origin: "author", tool: "EM Tools · Prepare for a use" } }), "author", "parameters.origin decides, when a step has it");
eq(L.stepOrigin(null), "author", "no step known: not the recipe's");

const podio = [
  { id: "M", master: true, lod: null },
  { id: "L0", master: false, lod: "lod0", step: author("OBJ export"), input: "M", bytes: 113_000_000 },
  { id: "L1", master: false, lod: "lod1", step: author("decimation and texture baking"), input: "L0", bytes: 48_000_000 },
  { id: "L2", master: false, lod: "lod2", step: author("decimation and texture baking"), input: "L1", bytes: 9_313_994 },
  { id: "V3", master: false, lod: "lod3", step: recipe(1, 0, false), input: "L2", bytes: 3_785_328, tris: 89623 },
  { id: "V4", master: false, lod: "lod4", step: recipe(0.5, 1024, true), input: "V3", bytes: 456_672, tris: 44808 },
];
const P = L.levelsOf(podio);
const T = { whole: "intero", derived: "derivata", master: "master" };
eq(["M", "L0", "L1", "L2", "V3", "V4"].map((id) => L.levelShort(P.get(id), T)), ["master", "LOD0", "LOD1", "LOD2", "derivata", "derivata"],
  "the survey: LOD0–2 the author's, lod3 and lod4 derived");
eq([P.get("V3").base, P.get("V3").ratio, P.get("V4").base, P.get("V4").ratio], ["L2", 1, "L2", 0.5],
  "lod3 a copy of LOD2, lod4 its half — both from LOD2 (lod4 through lod3)");
eq(["L0", "L1", "L2", "V3", "V4"].sort((a, b) => P.get(a).rank - P.get(b).rank), ["L0", "L1", "L2", "V3", "V4"], "finest first: the chain, the derived after LOD2");
eq(L.defaultLevel(P, new Set(["L0", "L1", "L2", "V3", "V4"])), "L2", "the desktop's default for the survey: the lightest of the author, LOD2");
eq(L.defaultLevel(P, new Set(["V3", "V4"])), null, "no level of the author opens: no default (the use decides)");

const column = [
  { id: "M", master: true, lod: null },
  { id: "C0", master: false, lod: "lod0", step: recipe(1, 0, false), input: "M", bytes: 3_956_920, tris: 53332 },
  { id: "C1", master: false, lod: "lod1", step: recipe(0.5, 1024, false), input: "C0", bytes: 437_468, tris: 26666 },
];
const C = L.levelsOf(column);
eq(["C0", "C1"].map((id) => L.levelShort(C.get(id), T)), ["intero", "derivata"], "the reconstruction: no LOD of the author, the whole and a derived one — never «LOD1»");
eq([C.get("C1").base, C.get("C1").ratio], ["C0", 0.5], "lod1 is the half of the whole");
eq(L.defaultLevel(C, new Set(["C0", "C1"])), "C0", "the desktop's default for the reconstruction: the whole");
eq(C.get("C0").rank < C.get("C1").rank, true, "the whole before what the recipe made from it");

const shrunk = L.levelsOf([{ id: "M", master: true, lod: null }, { id: "S", master: false, lod: "lod0", step: recipe(1, 2048, false), input: "M" }]);
eq(shrunk.get("S").whole, false, "a copy of the master with its textures reduced is not the whole");

eq(L.isHeavy({ bytes: 113_000_000 }), false, "LOD0 of OB_PODIO, 108 MB: loaded without asking");
eq(L.isHeavy({ bytes: 160 * 1024 * 1024 }), true, "over 150 MB: asked first");
eq(L.isHeavy({ tris: 6_000_000 }), true, "over 5 million triangles: asked first");

// MICRO-GLOBO-INTERAZIONE p.4 · the lightest version first (E.D., 23 Oct 2026): the default
// tileset when there is one, else the lightest by the files' weight, a glb before an OBJ
{
  const podio = [{ id: "master", master: true, format: "blend", bytes: 541690739 }, { id: "lod0", format: "obj", bytes: 151182800 },
    { id: "lod1", format: "obj", bytes: 70024402 }, { id: "lod2", format: "obj", bytes: 13421902 }, { id: "lod3", format: "gltf", bytes: 5103988 }, { id: "lod4", format: "gltf", bytes: 515888 }];
  eq(L.lightestVersion(podio)?.id, "lod4", "the survey (OB_EST_bk): the 0.5 MB web glb, not the author's 13.4 MB LOD2 OBJ");
  eq(L.lightestVersion([{ id: "m", master: true, format: "blend", bytes: 92279767 }, { id: "lod0", format: "gltf", bytes: 436664 }, { id: "lod1", format: "gltf", bytes: 81320 }])?.id,
    "lod1", "the reconstruction (D.09, an architrave): its 81 KB lod1, not the whole 437 KB lod0");
  eq(L.lightestVersion([{ id: "a", format: "obj", bytes: 1000 }, { id: "b", format: "gltf", bytes: 1000 }])?.id, "b", "the same weight: the glb before the OBJ");
  eq(L.lightestVersion([{ id: "a", format: "gltf" }, { id: "b", format: "obj", bytes: 9e8 }])?.id, "b", "an unknown weight goes after every known one");
  eq(L.lightestVersion([{ id: "g", format: "gltf", bytes: 1000 }, { id: "t", format: "tiles", bytes: 198361152 }])?.id, "t", "a tileset is the default when the model has one (it streams its own levels)");
  eq(L.lightestVersion([{ id: "m", master: true, format: "gltf", bytes: 1 }]), null, "only a master: nothing to choose here (the rule of the use decides)");
}

console.log(`check-lod-levels: ${checks} checks, all green`);
