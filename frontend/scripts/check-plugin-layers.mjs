// MICRO-GEO12 (row G11 of the geophysics plan) · executable check of the
// layers a plugin describes, drawn in the Space (src/plugin-layers.ts):
//   · the pure geometry: a horizontal plane at ground − its mean depth (a
//     product without depth on the ground), a section from the ground down
//     along its line, a section without a line in a row south of the stack;
//     the texture's rows (v = 1 the north / the surface);
//   · where: an origin in doubles and the study's frame in the same EPSG → the
//     world (minus the shift, turned, z = −north; a UTM origin kept to the
//     millimetre); no origin, no frame, another EPSG → the stack's own frame;
//   · the drape: the ground sampled ONCE per stack on a grid, every slice the
//     same grid minus its depth; a hole takes the flat ground;
//   · the depth cursor: all / one / down to, «all» over 60 horizontal planes
//     is «one», «down to» at most 60, ↑/↓ kept inside the stack, the sections
//     on or off;
//   · the wiring: the scene's third driver (setLayers), main.ts asking
//     space.layer@1 while a Space is open and drawing after each answer, the
//     pictures fetched behind the secret, the words EN + IT.
//
//   node scripts/check-plugin-layers.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const near = (a, b, eps, what) => {
  const d = Array.isArray(a) ? Math.max(...a.map((x, i) => Math.abs(x - b[i]))) : Math.abs(a - b);
  assert.ok(d <= eps, `${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); checks++;
};

const L = await load("plugin-layers.ts");

const slice = (id, top, bottom, ext = [0, 0, 92, 50]) => ({ id, label: id, image: `cache/k/${id}.png`, extent: ext, orientation: "horizontal",
  depth_top: top, depth_bottom: bottom, line: null });
const section = (id, len, depth, line = null) => ({ id, label: id, image: `cache/k/${id}.png`, extent: [0, -depth, len, 0], orientation: "vertical",
  depth_top: 0, depth_bottom: depth, line });
const layer = (items, extra = {}) => ({ kind: "raster_stack", id: "acq1", name: "Pila", frame: { epsg: null, origin: null, rotation: 0, local: true },
  ground: { mode: "flat", z: 0, surface: null }, items, display: { mode: "all", index: 0 }, opacity: 1, ...extra });

// ── the Basilica's stack: 6 slices + 6 sections, declared, not placed ────────
const bands = [[1, 1.5], [2.5, 3], [3, 3.5], [3.5, 4], [4.5, 5], [5.5, 6]];
const bas = layer([...bands.map(([a, b], i) => slice(`D.0${i + 1}`, a, b)),
  section("V1", 92, 8), section("V2", 92, 8), section("V3", 92, 8), section("V4", 50, 8), section("V5", 50, 8), section("V6", 50, 8)]);
eq([L.horizontalsOf(bas).length, L.verticalsOf(bas).length], [6, 6], "6 slices and 6 sections");
const pl = L.placementOf(bas, null);
eq([pl.how, pl.why], ["local", "no_origin"], "no origin: the stack's own frame");
const g1 = L.planeGeometry(bas, bas.items[0], pl, 0);
eq(g1.pos.length / 3, 4, "a flat slice: 4 vertices");
near(g1.pos.filter((_, i) => i % 3 === 1), [-1.25, -1.25, -1.25, -1.25], 1e-9, "1.00–1.50 m at ground − 1.25");
eq([g1.pos[0], g1.pos[2]], [0, -0], "the corner (0, 0) at three's (0, 0)");
eq([g1.pos[3], g1.pos[5], g1.pos[6], g1.pos[8]], [92, -0, 0, -50], "x east, north = −z");
eq(g1.uv, [0, 0, 1, 0, 0, 1, 1, 1], "v = 1 on the north edge (the PNG's top row)");
const g6 = L.planeGeometry(bas, bas.items[5], pl, 3);
near(g6.pos[1], 3 - 5.75, 1e-9, "5.50–6.00 m under a ground at 3");
eq(L.planeDepth({ depth_top: null, depth_bottom: null }), 0, "a product without depth lies on the ground");
eq(L.planeDepth({ depth_top: 2, depth_bottom: null }), 2, "only a top: the top");
// sections without a line: a row south of the stack, the order of the plugin
const s1 = L.sectionLine(bas, bas.items[6]), s2 = L.sectionLine(bas, bas.items[7]), s4 = L.sectionLine(bas, bas.items[9]);
eq([s1.said, s1.line[0][0], s1.line[1][0]], [false, 0, 92], "VERT1 laid from the west edge, 92 m long");
ok(s1.line[0][1] < 0 && s2.line[0][1] < s1.line[0][1], "south of the stack, the next one further");
near(s1.line[0][1] - s2.line[0][1], 8, 1e-9, "one section's height apart (8 m)");
eq(s4.line[1][0] - s4.line[0][0], 50, "VERT4: 50 m long");
const gv = L.planeGeometry(bas, bas.items[6], pl, 0);
eq([gv.pos[1], gv.pos[7], gv.line.said], [-8, 0, false], "a section from −8 to the ground");
eq(gv.uv, [0, 0, 1, 0, 1, 1, 0, 1], "a section's surface on top (v = 1)");
const said = L.sectionLine(layer([slice("a", 1, 2), section("s", 10, 3, [[5, 5], [15, 5]])]), section("s", 10, 3, [[5, 5], [15, 5]]));
eq([said.said, said.line], [true, [[5, 5], [15, 5]]], "a section's own line kept");

// ── where: the world when origin + frame agree ───────────────────────────────
const ilici = layer([slice("S1", null, null, [0, 0, 73.4, 58.8])], { frame: { epsg: 25830, origin: [701756.9629999999, 4234802.482], rotation: 0 } });
const scene = { epsg: 25830, x: 701700, y: 4234800, z: 100, rotation: 0 };
const w = L.placementOf(ilici, scene);
eq([w.how, w.why], ["world", null], "origin + the study's frame in EPSG:25830: the world");
near(w.xz(0, 0), [56.9629999999, -2.482], 1e-6, "the origin minus the shift (millimetre kept)");
near(w.world(10, 20), [701766.9629999999, 4234822.482], 1e-6, "local → the scene's CRS in doubles");
eq(L.placementOf(ilici, { ...scene, epsg: 32633 }).why, "other_crs", "another EPSG: its own frame");
eq(L.placementOf(ilici, null).why, "no_scene_frame", "no GeoPositionNode: its own frame");
const turned = L.placementOf(layer([], { frame: { epsg: 25830, origin: [0, 0], rotation: 90 } }), { epsg: 25830, x: 0, y: 0, z: 0, rotation: 0 });
near(turned.xz(1, 0), [0, -1], 1e-9, "a frame turned 90°: east goes north");
const rot = L.placementOf(ilici, { ...scene, rotation: 90 });
near(rot.xz(0, 0), [-2.482, -56.9629999999], 1e-6, "the study's rotation as a GIS sheet's (toThree)");

// ── the drape: one grid per stack ────────────────────────────────────────────
const grid = { x0: 701700, y0: 4234900, step: 10, nx: 21, ny: 21, heights: Array.from({ length: 441 }, (_, k) => 100 + (k % 21)) };
near(L.heightAt(grid, 701705, 4234900), 100.5, 1e-9, "bilinear between two nodes");
eq(L.heightAt(grid, 701000, 4234900), null, "outside the grid: none");
const dr = L.drapeOf(ilici, w, grid, 0, scene.z, 8);
eq([dr.cells, dr.heights.length, dr.holes], [8, 81, 0], "one 9 × 9 grid over the footprint");
near(dr.heights[0], L.heightAt(grid, 701756.9629999999, 4234802.482) - 100, 1e-9, "a node: the DEM's height minus the shift z");
const gd = L.planeGeometry(ilici, { ...ilici.items[0], depth_top: 1, depth_bottom: 2 }, w, 0, dr);
eq(gd.pos.length / 3, 81, "a draped slice: the grid's 81 vertices");
near(gd.pos[1], dr.heights[0] - 1.5, 1e-9, "a draped slice: ground − depth at each node");
const holey = { ...grid, heights: grid.heights.map(() => null) };
const dh = L.drapeOf(ilici, w, holey, 7, scene.z, 4);
eq([dh.holes, dh.heights[0]], [25, 7], "holes take the flat ground");

// ── the depth cursor ─────────────────────────────────────────────────────────
eq(L.shownPlanes(bas).length, 12, "all: 6 slices + 6 sections");
eq(L.shownPlanes(bas, { mode: "one", cursor: 2 }), [2, 6, 7, 8, 9, 10, 11], "one: the third slice and the sections");
eq(L.shownPlanes(bas, { mode: "up_to", cursor: 3, sections: false }), [0, 1, 2, 3], "down to the fourth, no sections");
eq(L.shownPlanes(bas, { hidden: true }), [], "a stack hidden: nothing");
eq(L.cursorOf(bas, { cursor: 99 }), 5, "the cursor kept inside the stack");
eq([L.stepCursor(6, 0, -1), L.stepCursor(6, 5, 1), L.stepCursor(6, 2, 1)], [0, 5, 3], "↑/↓ kept inside");
const alc = layer(Array.from({ length: 601 }, (_, i) => slice(`A${i}`, i * 0.005, i * 0.005)));
eq(L.modeOf(alc), "one", "601 slices: «all» is «one» (over 60)");
eq(L.modeOf(alc, { mode: "all" }), "one", "…even when the person asks «all»");
eq(L.shownPlanes(alc, { cursor: 300 }), [300], "one at a time: one plane, one texture");
const up = L.shownPlanes(alc, { mode: "up_to", cursor: 300 });
eq([up.length, up[0], up.at(-1)], [60, 241, 300], "down to: at most 60, the deepest");
const sixty = layer(Array.from({ length: 60 }, (_, i) => slice(`B${i}`, i, i + 1)));
eq(L.modeOf(sixty), "all", "60 slices: still all");
eq(L.cursorOf(layer(bas.items, { display: { mode: "one", index: 3 } })), 3, "the plugin's index as the first cursor");
eq(L.cursorOf(layer(bas.items, { display: { mode: "one", index: 8 } })), 0, "an index on a section: the first slice");

// ── the answers of /py/compute ───────────────────────────────────────────────
const ls = L.layersOfValues([{ plugin: "geofisica", command: "layer", value: [bas, { ...bas }, { kind: "other" }] },
  { plugin: "x", command: "y", value: null }, { plugin: "x", command: "z", value: [bas] }]);
eq(ls.map(L.layerKey), ["geofisica/acq1", "x/acq1"], "one layer per plugin and id; a wrong shape or a failure: none");

// ── the wiring ───────────────────────────────────────────────────────────────
const main = fs.readFileSync(`${SRC}main.ts`, "utf8");
const scene3d = fs.readFileSync(`${SRC}scene3d.ts`, "utf8");
const pls = fs.readFileSync(`${SRC}plugin-layers.ts`, "utf8");
const pcs = fs.readFileSync(`${SRC}plugin-commands.ts`, "utf8");
ok(/setLayers\(g: GeoDriver \| null\): void;/.test(scene3d) && /plgLayers\?\.far\(\)/.test(scene3d) && /if \(plgLayers\) plgLayers\.attach\(geoCtx\)/.test(scene3d),
  "the scene's third driver: attached, its far plane reached");
ok(/\| "space\.layer";/.test(pcs), "space.layer a slot the page knows");
ok(/if \(layerSpaces\.size\) for \(const c of ps\.commandsIn\("space\.layer"\)\) add\("space\.layer@1"/.test(main), "asked while a Space is open");
ok(/if \(layerSpaces\.size && plugins\(\)\.commandsIn\("space\.layer"\)\.length\) refreshSurfaces\("scene"\)/.test(main)
  && /gisSpace\.refresh\(\);\n    layerSpace\.refresh\(\);/.test(main), "drawn after each answer (the Space's refresh)");
ok(/store && \(!sp \|\| !sum\) && pluginLayersNow\(\)\.length/.test(main), "a graph without epochs but with layers: the scene not covered");
ok(/if \(pluginLayersNow\(\)\.length\) box\.appendChild\(layerSpace\.section\(\)\)/.test(main), "its section in «Visibilità ▾»");
ok(/layerSpace\.destroy\(\)/.test(main), "freed with the window");
ok(/\/py\/layer-image\?plugin=/.test(pls) && /Authorization: `Bearer \$\{token\}`/.test(pls), "the pictures behind the secret");
ok(/texture\?\.dispose\?\.\(\)/.test(pls) && /if \(!keep\.has\(mk\)\) free\(mk\)/.test(pls), "a hidden plane's texture freed");
const i18n = fs.readFileSync(`${SRC}i18n.ts`, "utf8");
const keys = [...new Set([...pls.matchAll(/t\("(plyr\.[a-z_.]+)"/g)].map((m) => m[1]))];
for (const k of ["plyr.mode.all", "plyr.mode.one", "plyr.mode.up_to", "plyr.local.no_origin", "plyr.local.no_scene_frame", "plyr.local.other_crs"]) keys.push(k);
for (const k of keys) eq(i18n.split(`"${k}":`).length - 1, 2, `${k} in EN and IT`);

console.log(`check-plugin-layers: ${checks} checks ok`);
