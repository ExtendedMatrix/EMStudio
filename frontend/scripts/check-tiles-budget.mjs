// MICRO tileset dritto e nitido (E.D., 25 Oct 2026) · a tileset drawn upright
// and refined within a steady memory.
//
//   node scripts/check-tiles-budget.mjs
//
// `tiles-budget.ts` (pure): when a root is on the Earth (and is centred when
// nothing relocates it), the errors' multiplier estimated from the root, the
// side a tile's texture keeps, and the machine's ceiling (`settings.ts`). The
// numbers are the Basilica's two RealityScan exports, measured on E.D.'s files.
// In the browser: `node scripts/suite-bench.mjs TN1 TN2 TN3` (the layer centred and
// upright, the textures reduced, the levels going down in both modes).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (what) => {
  const b = await esbuild.build({ stdin: { contents: what, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const B = await load(`export * from "./tiles-budget";`);
let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, `${m} — got ${JSON.stringify(a)}`); n++; };

// the root's transform: RealityScan's ENU on the equator (6 371 km out), a local one, none
const W = [-0.18243234, 0.98321841, 0, 0, -1.97e-06, -3.6e-07, 1, 0, 0.98321841, 0.18243234, 2e-06, 0, 6271099.97842686, 1163587.23952703, 12.30475555, 1];
eq([B.onEarth(W), B.onEarth([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 28, 10, 7, 1]), B.onEarth(null), B.onEarth([1, 2])], [true, false, false, false],
  "on the Earth: a translation over 1 km (then centred when no frame relocates it)");

// the two exports' roots (the diagonal of their box, the error they write)
const box2 = { box: [-4.57, -2.57, 6.88, 94.33929443, 0, 0, 0, 49.22309113, 0, 0, 0, 12.4116478] };
const box1 = { box: [-4.6, -2.48, 6.83, 94.20596313, 0, 0, 0, 49.0687027, 0, 0, 0, 12.45930481] };
const d2 = B.volumeDiagonal(box2), d1 = B.volumeDiagonal(box1);
eq([Math.round(d2 * 10) / 10, Math.round(d1 * 10) / 10, B.volumeDiagonal({ sphere: [0, 0, 0, 5] }), B.volumeDiagonal({ region: [] })], [214.3, 213.9, 10, 0],
  "the diagonal of a box (and of a sphere; a region is not measured)");
eq(B.estimateErrorScale(0.2450995, d2), { small: true, scale: 16 },
  "the `-2` export: 0.245 m on 214 m — too small for its size, ×16 (to about 1/60 of the diagonal)");
eq(B.estimateErrorScale(0.89665262, d1), { small: false, scale: 1 }, "the first export: 0.90 m on 214 m — in proportion, left as written");
eq([B.estimateErrorScale(0, 100).scale, B.estimateErrorScale(5, 0).scale, B.estimateErrorScale(4, Math.hypot(4, 4, 1)).small],
  [1024, 1, false], "an error of 0 at the root: the most (×1024); no volume: nothing; the fixture of tiles-prova: in proportion");

// the texture's side: the canvas's to the next power of two, and the ceiling's sixteenth
const MB = 1024 * 1024;
eq([B.textureSideFor(1000, 1024 * MB), B.textureSideFor(1600, 1024 * MB), B.textureSideFor(3200, 1024 * MB), B.textureSideFor(3200, 4096 * MB)],
  [1024, 2048, 2048, 4096], "a canvas of 1000 / 1600 px: 1024 / 2048; a retina canvas is held by a 1 GB ceiling (4096² = 85 MB > 64 MB)");
eq([B.textureSideFor(1600, 400 * MB), B.textureSideFor(1600, 256 * MB), B.textureSideFor(100, 64 * MB), B.textureSideFor(8000, 8192 * MB, 4096)],
  [2048, 1024, 512, 4096], "400 MB: 2048; 256 MB: 1024; never under 512; never over what the GPU takes");
// what the Basilica's `-2` tile costs before and after (RGBA + mipmaps)
const cost = (side) => Math.round(side * side * 4 * 4 / 3 / MB);
eq([cost(8192), cost(2048), cost(1024)], [341, 21, 5], "an 8192² texture holds 341 MB; reduced to 2048², 21 MB; to 1024², 5 MB");

// the machine's ceiling
const S = await load(`export { machineTilesMemoryMB, TILES_MEMORY_MB_OLD } from "./settings";`);
eq([S.machineTilesMemoryMB(8), S.machineTilesMemoryMB(4), S.machineTilesMemoryMB(2), S.machineTilesMemoryMB(0.5), S.machineTilesMemoryMB(32), S.machineTilesMemoryMB(null)],
  [1024, 512, 256, 256, 2048, 1024], "an eighth of the machine's memory, 256 MB – 2 GB; unknown (WebKit): 8 GB → 1 GB");
eq(S.TILES_MEMORY_MB_OLD, 400, "the fixed ceiling of before (a settings file holding it reads as the machine's)");

console.log(`check-tiles-budget: ${n} checks passed`);
