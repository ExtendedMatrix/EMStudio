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
// ── MICRO-PROVA-DEV48 p.3 · the chain of the automatic mode: the author's levels too ──
// OB_PODIO of Templu Mare v3.2: LOD0, LOD1, LOD2 OBJ (the author's, no triangles in the data),
// lod3 (the recipe's glb copy of LOD2, ratio 1) and lod4 (its half), which declare triangles and tris_per_m2
const podio = [
  { id: "LOD0", url: "u0", rank: 0, name: "LOD0", data: {}, bytes: 107905000, format: "obj", obj: {}, big: true },
  { id: "LOD1", url: "u1", rank: 1, name: "LOD1", data: {}, bytes: 48254000, format: "obj", obj: {} },
  { id: "LOD2", url: "u2", rank: 2, name: "LOD2", data: {}, bytes: 9313994, format: "obj", obj: {} },
  { id: "lod3", url: "u3", rank: 3, name: "derivata lod3", data: { primitives: { triangles: 89623 }, tris_per_m2: 968.935 }, base: "LOD2", ratio: 1, bytes: 3785328, format: "gltf" },
  { id: "lod4", url: "u4", rank: 4, name: "derivata lod4", data: { primitives: { triangles: 44808 }, tris_per_m2: 487.671 }, base: "LOD2", ratio: 0.5, bytes: 456672, format: "gltf" },
];
const ch = F.buildChain(podio);
eq(ch.map((v) => v.id), ["LOD0", "LOD1", "LOD2", "lod3", "lod4"], "every level the Space opens, finest first: the author's OBJ too");
eq(ch.map((v) => v.ord), [0, 1, 2, 3, 4], "…numbered along the chain");
eq(ch.map((v) => v.errFrom), ["weight", "weight", "recipe", "triangles", "triangles"], "LOD2's triangles from its copy (ratio 1), LOD1 and LOD0 from the weight beside it");
eq(ch.find((v) => v.id === "LOD2").tris, 89623, "LOD2 has its copy's triangles");
eq(ch.find((v) => v.id === "LOD0").tris, Math.round(89623 * 107905000 / 9313994), "LOD0 estimated from its weight beside LOD2");
near(ch[3].err, Math.sqrt((89623 / 968.935 + 44808 / 487.671) / 2 / 89623), 0.0005, "one scale: √(area / triangles), the area from tris_per_m2");
eq(ch[2].err, ch[3].err, "LOD2 and its glb copy: the same error — the distance takes the lighter, later in the chain");
eq(ch.every((v, i) => i === 0 || v.err >= ch[i - 1].err), true, "finer is never coarser");
eq(ch[0].big === true && !ch[1].big, true, "the author's finest is big");
const measured = F.buildChain(podio.map((v) => (v.id === "LOD0" ? { ...v, measured: 1234567 } : v)));
eq([measured[0].errFrom, measured[0].tris], ["measured", 1234567], "once the Space counted LOD0: its measure, not the estimate");
// the distance through the chain: far the lightest, near the author's LOD1, nearest LOD0 — when it is its turn
const far = F.pickByDistance(ch, 30, 50, 1000);
eq(far.want, "lod4", "far: derivata lod4");
eq(F.pickByDistance(ch, 1.0, 50, 1000).want, "LOD1", "near (1 m): LOD1 of the author");
eq(F.pickByDistance(ch, 0.4, 50, 1000).want, "LOD0", "nearest (0.4 m), its turn: LOD0");
eq(F.pickByDistance(ch, 0.4, 50, 1000, null, F.SSE_PX, false).want, "LOD1", "…not its turn: its finest light version, LOD1");
eq(F.pickByDistance(ch, 0.4, 50, 1000, "LOD0", F.SSE_PX, false).want, "LOD1", "…and a model that holds LOD0 without the turn goes back to LOD1");
eq([F.pickByDistance(ch, 1.2, 50, 1000, "LOD1").want, F.pickByDistance(ch, 1.2, 50, 1000, "LOD1").preload], ["LOD1", null], "at 1.2 m LOD1, and its finer (big) is never preloaded");
// the turn: one at a time, the one that fills more of the screen, then the nearer
near(F.screenShare(1, 10, 50), 2 * Math.atan(0.1) / (50 * Math.PI / 180), 1e-12, "the share of the view a sphere fills");
eq(F.screenShare(5, 3, 50), 2, "inside it: all of it");
eq(F.bigTurn([{ key: "a", share: 0.5, dist: 1 }]), null, "under BIG_SCREEN (0.6): nobody's turn");
eq(F.bigTurn([{ key: "a", share: 0.9, dist: 2 }, { key: "b", share: 1.4, dist: 3 }]), "b", "the one that fills more");
eq(F.bigTurn([{ key: "a", share: 2, dist: 0.2 }, { key: "b", share: 2, dist: 0.1 }]), "b", "both fill it: the nearer");
eq(F.BIG_SCREEN, 0.6, "the rule's share, written");
console.log(`check-lod-flow: ${checks} checks passed`);
