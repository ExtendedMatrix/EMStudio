// MICRO-PROVA-DEV48 p.2 · the coverage of a tileset on its LEAF tiles — pure
// parts (`src/tileset-leaves.ts`), in node:
//
//   node scripts/check-tileset-leaves.mjs
//   TEMPLU_TILESET=<…/RB/cesium/TempluMare/tileset.json> TEMPLU_BOXES=<EM Tools'
//     tests/fixtures/templu_survey2015_boxes.json> node scripts/check-tileset-leaves.mjs
//
// A small tileset written here: a root cube far larger than its leaves, a
// transform composed down the tree, an external tileset.json, a sphere, a
// region, an external that cannot be read; EM Tools' footprint rule; the
// coverage. With the two variables, Templu Mare: 7,301 tiles, 5,476 leaves,
// their envelope EM Tools' to the centimetre, and the IoU with the survey's
// models high where the root's cube gave 0.02.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}tileset-leaves.ts`], bundle: true, format: "esm", write: false });
const L = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const near = (a, b, tol, what) => { assert.ok(Math.abs(a - b) <= tol, `${what} — got ${a}, want ${b} ± ${tol}`); checks++; };
const r2 = (b) => b.map((p) => p.map((x) => Math.round(x * 100) / 100));

// ── a tileset written here ───────────────────────────────────────────────────
const cube = (cx, cy, cz, h) => ({ box: [cx, cy, cz, h, 0, 0, 0, h, 0, 0, 0, h] });
const files = {
  "https://t/a/tileset.json": { asset: { version: "1.0" }, root: {
    boundingVolume: cube(0, 0, 0, 49.152),                   // the exporter's grid, 98 m
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 100, 1],   // a translation
    children: [
      { boundingVolume: cube(0, 0, 0, 20), children: [
        { boundingVolume: cube(-2, 0, 0, 1), content: { uri: "t0.b3dm", boundingVolume: cube(-2, 0, 0, 0.5) } },   // tight content volume
        { boundingVolume: cube(2, 0, 0, 1), content: { uri: "t1.b3dm" } },                                        // only the tile's
      ] },
      { boundingVolume: cube(0, 5, 0, 10), content: { uri: "Data/c1/tileset.json" } },                            // external
      { boundingVolume: { sphere: [0, -5, 0, 1] }, content: { uri: "s.b3dm" } },                                 // a sphere
      { boundingVolume: { region: [0, 0, 1, 1, 0, 10] }, content: { uri: "r.b3dm" } },                         // geographic
      { boundingVolume: cube(30, 0, 0, 2), content: { uri: "Data/lost/tileset.json" } },                         // unreadable
    ] } },
  "https://t/a/Data/c1/tileset.json": { asset: { version: "1.0" }, root: {
    boundingVolume: cube(0, 5, 0, 10),
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1],   // one more metre up, under the parent's
    children: [{ boundingVolume: cube(0, 5, 0, 1), content: { uri: "c.b3dm" } }] } },
};
const read = async (u) => files[u] ?? null;
const r = await L.readLeaves("https://t/a/tileset.json", read);
eq(r.tiles, 10, "every tile read: the root, a parent, two leaves, the tile calling the external and the external's root and leaf, a sphere, a region, the unreadable");
eq(r.leaves, 6, "the leaves: t0, t1, the external's c, the sphere, the region, the unreadable one");
eq(r.regions, 1, "a region is counted apart");
eq(r.unread, ["Data/lost/tileset.json"], "the external that could not be read is said");
eq(r2(r.boxes[0]), [[7.5, 19.5, 99.5], [8.5, 20.5, 100.5]], "a leaf's tight content volume, under the root's transform");
eq(r2(r.boxes[1]), [[11, 19, 99], [13, 21, 101]], "…else its own volume");
eq(r2(r.boxes[2]), [[9, 24, 100], [11, 26, 102]], "the external's leaf: its transform composed under the parent's (one metre up)");
eq(r2(r.boxes[3]), [[9, 14, 99], [11, 16, 101]], "a sphere as its box");
eq(r2(r.boxes[4]), [[38, 18, 98], [42, 22, 102]], "an unreadable external: its tile's own volume stands");
eq(await L.readLeaves("https://t/none.json", read), null, "no tileset: null");
eq(r2(L.envelope(r.boxes)), [[7.5, 14, 98], [42, 26, 102]], "the leaves' envelope — not the root's 98 m cube");
eq(r2(L.volumeBox(cube(0, 0, 0, 49.152))), [[-49.15, -49.15, -49.15], [49.15, 49.15, 49.15]], "the root's cube, for comparison");
// the frame: Z up (the tileset, Blender) → Y up (three): x, y, z → x, z, −y
eq(L.zUpToYUp([[1, 2, 3], [4, 5, 6]]), [[1, 3, -5], [4, 6, -2]], "Z up to Y up");
// a box under a rotation: its corners, not its centre
const rot = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];   // 90° about Z
eq(r2(L.volumeBox({ box: [1, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 1] }, rot)), [[-1, -1, -1], [1, 3, 1]], "a box turned 90° about Z: its corners");

// ── the footprint (EM Tools' rule), in three's frame: the plan is x–z ────────
const leaves = [[[0, 0, 0], [10, 1, 10]]];   // a flat leaf, 10 × 10 m, 1 m high
eq(L.footprintShare([[2, 0.2, 2], [8, 0.8, 8]], leaves), 1, "a model over the leaf: all of its footprint");
eq(L.footprintShare([[5, 0.2, 0], [15, 0.8, 10]], leaves), 0.5, "half over it: half");
eq(L.footprintShare([[2, 5, 2], [8, 6, 8]], leaves), 0, "above it, not meeting its height: none");
eq(L.footprintShare([[10.1, 0.2, 0], [12, 0.8, 10]], leaves), 0.1, "within the tolerance (0.25 m): the first column");
// a skin: a box mostly air, a leaf only at its bottom — the share of volume would be small, the footprint is whole
eq(L.footprintShare([[0, 0, 0], [10, 8, 10]], leaves), 1, "a survey's skin: whole by its footprint");

// ── the coverage ─────────────────────────────────────────────────────────────
const models = new Map([["A", [[0, 0, 0], [5, 1, 10]]], ["B", [[5, 0, 0], [10, 1, 10]]]]);
const c = L.leafCoverage(leaves, models, 0.9);
eq([c.coverage, Math.round(c.iou * 100) / 100, c.inside], ["whole", 1, ["A", "B"]], "the leaves are the models: whole, IoU 1");
const c2 = L.leafCoverage(leaves, new Map([["A", [[0, 0, 0], [5, 1, 10]]]]), 0.9);
eq([c2.coverage, c2.inside], ["more", ["A"]], "one model, the leaves reach farther: more");
const c3 = L.leafCoverage(leaves, new Map([...models, ["far", [[50, 0, 0], [60, 1, 10]]]]), 0.9);
eq([c3.coverage, c3.inside], ["partial", ["A", "B"]], "a model the leaves do not reach: partial");
eq(L.leafCoverage([], models, 0.9), null, "no leaves: null");

// ── Templu Mare, when it is here ─────────────────────────────────────────────
if (process.env.TEMPLU_TILESET) {
  const url = pathToFileURL(process.env.TEMPLU_TILESET).href;
  const t0 = performance.now();
  const tm = await L.readLeaves(url, async (u) => { try { return JSON.parse(readFileSync(fileURLToPath(u), "utf8")); } catch { return null; } });
  const ms = Math.round(performance.now() - t0);
  eq([tm.tiles, tm.leaves, tm.unread.length, tm.regions], [7301, 5476, 0, 0], "Templu Mare: 7,301 tiles, 5,476 leaves, every external read");
  eq(r2(L.envelope(tm.boxes)), [[-38.11, -47.24, 490.08], [12.52, 16.93, 498.33]], "their envelope: EM Tools' (Z up)");
  if (process.env.TEMPLU_BOXES) {
    const fx = JSON.parse(readFileSync(process.env.TEMPLU_BOXES, "utf8"));
    const all = new Map(Object.entries({ ...fx.members, ...(fx.extra ?? fx.graph_only ?? {}) }));
    const yUp = (b) => L.zUpToYUp(b);
    const leavesY = tm.boxes.map(yUp);
    const modelsY = new Map([...all].map(([k, b]) => [k, yUp(b)]));
    const cov = L.leafCoverage(leavesY, modelsY, 0.9);
    const root = L.volumeBox(JSON.parse(readFileSync(process.env.TEMPLU_TILESET, "utf8")).root.boundingVolume,
                             JSON.parse(readFileSync(process.env.TEMPLU_TILESET, "utf8")).root.transform);
    const rootIou = L.iou(yUp(root), L.envelope([...modelsY.values()]));
    console.log(`Templu Mare: ${ms} ms; ${modelsY.size} models; IoU on the leaves ${cov.iou.toFixed(3)}, on the root ${rootIou.toFixed(3)}; inside ${cov.inside.length}`);
    ok(cov.iou >= 0.9, `the IoU on the leaves is high (${cov.iou.toFixed(3)})`);
    ok(rootIou < 0.05, `…where the root's cube gives ${rootIou.toFixed(3)}`);
    eq(cov.inside.length, modelsY.size, "every survey model stands in the tileset by its footprint");
  }
}
console.log(`check-tileset-leaves: ${checks} checks passed`);
