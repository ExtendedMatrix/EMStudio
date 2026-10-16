// MICRO-SPAZIO-3D-3 p.10 · the flow of LOD by the distance — pure (`src/lod-flow.ts`):
//   node scripts/check-lod-flow.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ stdin: { contents: `export * as F from "./lod-flow";`, resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false });
const { F } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const near = (a, b, e, what) => { assert.ok(Math.abs(a - b) <= e, `${what} — ${a} vs ${b}`); checks++; };
// the errors: a measure, tris_per_m2 (Column_light1 of v3.2: 4539.18 and 2269.32), the triangles and the box
eq(F.versionError({ geometric_error_m: 6.144 }), { err: 6.144, from: "measure" }, "the tileset's measure (the only one in v3.2)");
near(F.versionError({ tris_per_m2: 4539.182 }).err, 0.01484, 1e-5, "lod0 of Column_light1: √(1/4539) = 1.48 cm");
near(F.versionError({ tris_per_m2: 2269.317 }).err, 0.02099, 1e-5, "lod1: 2.10 cm");
eq(F.versionError({ tris_per_m2: 2269.317 }).from, "tris_per_m2", "…estimated from tris_per_m2");
near(F.versionError({ primitives: { triangles: 1000 } }, { x: 1, y: 1, z: 1 }).err, Math.sqrt(3 / 1000), 1e-12, "from the triangles and the box: half the box's surface over the triangles");
eq(F.versionError({}), { err: null, from: "none" }, "no measure: never chosen by the distance");
// the screen error, 3D Tiles' formula
near(F.screenError(0.021, 0.687, 40, 430), 0.021 * 430 / (2 * 0.687 * Math.tan(20 * Math.PI / 180)), 1e-9, "the projected error");
const vs = [{ id: "l0", url: "a", ord: 0, err: 0.01484, errFrom: "tris_per_m2", bytes: 3956920, uses: [] },
            { id: "l1", url: "b", ord: 1, err: 0.02099, errFrom: "tris_per_m2", bytes: 437468, uses: [] }];
eq(F.pickByDistance(vs, 200, 40, 430).want, "l1", "far: the lightest");
eq(F.pickByDistance(vs, 0.6, 40, 430).want, "l0", "near (0.6 m): the finer");
eq(F.pickByDistance(vs, 0.9, 40, 430).want, "l1", "at 0.9 m the lighter is enough (14 px)…");
eq(F.pickByDistance(vs, 0.9, 40, 430, "l0").want, "l0", "…but a finer drawn stays (hysteresis: under 80 % of the threshold to coarsen)");
eq(F.pickByDistance(vs, 3, 40, 430, "l0").want, "l1", "…then the lighter again");
eq(F.pickByDistance(vs, 1.0, 40, 430).preload, "l0", "approaching: the finer is preloaded");
eq(F.pickByDistance(vs, 0.01, 40, 430).want, "l0", "nearer than any threshold: the finest");
eq(F.pickByDistance([{ ...vs[0], err: null }], 1, 40, 430), { want: null, preload: null }, "no error anywhere: nothing chosen");
eq(F.SSE_PX, 16, "the threshold: 16 px, Cesium's");
console.log(`check-lod-flow: ${checks} checks passed`);
