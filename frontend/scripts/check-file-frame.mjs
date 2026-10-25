// MICRO tileset, shift e epoche (E.D. 25 Oct 2026) · THE FRAME OF A FILE —
// «the coordinates of this file are CRS X minus shift S» (s3Dgraphy nodes
// datamodel 1.6.38, `data.frame`; `s3dgraphy.geometry.frame`).
//
//   node scripts/check-file-frame.mjs
//
// `file-frame.ts`: the tolerant reading (s3Dgraphy's `read_frame`), the order a
// frame is looked for in (the resource, its asset, its hat), the frame the
// Space lands in (the study's CRS and shift, else the file's own grid), the key
// a layer is relocated again by. The bridge's relocation is check-geotiles'.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ stdin: { contents: `export * from "./file-frame";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent" });
const F = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, `${m} — got ${JSON.stringify(a)}`); n++; };

eq([F.normaliseCrs(6708), F.normaliseCrs("epsg:6708"), F.normaliseCrs("6708"), F.normaliseCrs("")], ["EPSG:6708", "EPSG:6708", "EPSG:6708", null], "the CRS as the datamodel writes it");
eq(F.readFrame({ frame: { crs: "6708", shift: { x: "291407", y: "4640813,5" } } }), { crs: "EPSG:6708", shift: [291407, 4640813.5, 0] }, "a shift as {x, y} and text, read");
eq(F.readFrame({ frame: { epsg: 6708, shift_x: 1, shift_y: 2, shift_z: 3, source: "file", note: "SHIFT" } }), { crs: "EPSG:6708", shift: [1, 2, 3], note: "SHIFT", source: "file" }, "…as shift_x/y/z, with its note and source");
eq([F.readFrame({}), F.readFrame({ frame: { shift: [0, 0, 0] } }), F.readFrame({ frame: "x" })], [null, null, null], "no frame, or one that says nothing");
eq(F.makeFrame(6708, ["291407", 4640813], "n", "manual"), { crs: "EPSG:6708", shift: [291407, 4640813, 0], note: "n", source: "manual" }, "the frame written: numbers");
const data = { R: {}, A: { frame: { crs: "EPSG:6708", shift: [1, 2, 0] } }, G: { frame: { crs: "EPSG:3004", shift: [9, 9, 0] } } };
eq(F.frameAmong(["R", "A", "G"], (i) => data[i])?.from, "A", "the resource says none: its asset's");
eq(F.frameAmong([null, "R", "G"], (i) => data[i])?.from, "G", "…else the hat's (the container whose alternative it is)");
eq(F.frameAmong(["R"], (i) => data[i]), null, "nobody says one");
const fr = F.readFrame(data.A);
eq(F.studyTarget({ epsg: 6708, shift_x: 291000, shift_y: 4640000 }, fr), { crs: "EPSG:6708", shift: [291000, 4640000, 0], own: false }, "the study declares a CRS: its frame (CRS minus its shift)");
eq(F.studyTarget({ shift_x: 0, shift_y: 0 }, fr), { crs: "EPSG:6708", shift: [1, 2, 0], own: true }, "…none (E.D.'s graph): the file's own grid");
eq(F.studyTarget(null, { crs: null, shift: [1, 2, 3] }), null, "a frame without a CRS lands nowhere");
eq(F.frameKey(fr, { crs: "EPSG:6708", shift: [1, 2, 0] }), "EPSG:6708|1,2,0>EPSG:6708|1,2,0", "the key a layer is relocated again by");
eq(await F.relocation(null, { transform: null, boundingVolume: null }, fr, { crs: "EPSG:6708", shift: [0, 0, 0] }), { ok: false, error: "no-bridge" }, "no bridge: said, nothing moved");

// ── MICRO tileset dritto e nitido · the relocation in the browser ────────────
// The Basilica's root (RealityScan, the `-2` export) and the bridge's answer to
// it (s3Dgraphy `relocate_transform`, PROJ), recorded 25 Oct 2026 on E.D.'s file
const W = [-0.18243234, 0.98321841, 0.0, 0.0, -1.97e-06, -3.6e-07, 1.0, 0.0, 0.98321841, 0.18243234, 2e-06, 0.0,
  6271099.97842686, 1163587.23952703, 12.30475555, 1.0];
const BOX = { box: [-4.57201767, -2.57119942, 6.87701082, 94.33929443, 0, 0, 0, 49.22309113, 0, 0, 0, 12.4116478] };
const BRIDGE = [1.0026948894298064, -1.209348508456373e-07, 6.867324093317718e-07, 0.0, 1.263819739060443e-07, 1.0026948820423216,
  -4.6624380546976004e-07, 0.0, -6.885731064939673e-07, 4.648824526360204e-07, 1.0000000001329121, 0.0,
  32.72659987720822, 12.33792545625081, -0.10815612947233255, 1.0];
const SHIFT = { crs: "EPSG:6708", shift: [291407, 4640813, 0] };
const app = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
const corners = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push([0, 1, 2].map((d) => BOX.box[d] + sx * BOX.box[3 + d] + sy * BOX.box[6 + d] + sz * BOX.box[9 + d]));
const apart = (A, B) => Math.max(...corners.map((p) => { const a = app(A, p), b = app(B, p); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }));
const rb = F.relocateInBrowser({ transform: W, boundingVolume: BOX }, { crs: "EPSG:6708", shift: SHIFT.shift }, SHIFT);
eq([rb.ok, rb.via, apart(rb.transform, BRIDGE) < 1e-6, rb.residual_max_m < 0.001], [true, "browser", true, true],
  "the Basilica's root, relocated in the browser: the bridge's transform within a micrometre (the fit's residual under 1 mm)");
eq([Math.abs(rb.transform[10] - 1) < 1e-5, Math.abs(rb.transform[0] - 1.00269) < 1e-5], [true, true],
  "…upright (its Z stays the study's up), the UTM scale on the equator kept (1.0027: RealityScan projected the shifted grid there)");
eq(["EPSG:6708", "EPSG:7792", "EPSG:25833", "EPSG:32633", "EPSG:3045"].map((c) => JSON.stringify(F.tmParams(c))),
  Array(5).fill(JSON.stringify({ lon0: 15, k0: 0.9996, fe: 500000, fn: 0 })), "UTM 33N, whoever writes it (RDN2008 N-E and E-N, ETRS89, WGS84)");
eq([F.tmParams("EPSG:32733")?.fn, F.tmParams("EPSG:6875")?.k0, F.tmParams("EPSG:3004"), F.tmParams("EPSG:4326"), F.tmParams(null)],
  [10000000, 0.9985, null, null, null], "the southern hemisphere, Italy zone; Gauss-Boaga and the rest are the bridge's");
eq(F.relocateInBrowser({ transform: W, boundingVolume: BOX }, { crs: "EPSG:6708", shift: SHIFT.shift }, { crs: "EPSG:3004", shift: [0, 0, 0] }).error,
  "crs-needs-bridge", "a study in another projection: the bridge's (PROJ)");
eq(F.relocateInBrowser({ transform: W, boundingVolume: BOX }, { crs: "EPSG:6708", shift: SHIFT.shift }, { crs: "EPSG:25833", shift: [291000, 4640000, 0] }).transform
  .slice(12, 14).map((v) => Math.round(v * 100) / 100), [439.73, 825.34], "the same projection under another code and another shift: moved by the difference");
// the bridge cannot (the Lab's sidecar): the browser answers in its place, and says why
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: "geo: a dependency is missing in this bridge (numpy: pyproj or Pillow)" }), { status: 200 });
  const r = await F.relocation("http://bridge.test", { transform: W, boundingVolume: BOX }, { crs: "EPSG:6708", shift: SHIFT.shift }, SHIFT);
  globalThis.fetch = async () => new Response("", { status: 404 });
  const old = await F.relocation("http://old.test", { transform: W, boundingVolume: BOX }, { crs: "EPSG:6708", shift: SHIFT.shift }, SHIFT);
  globalThis.fetch = realFetch;
  eq([r.ok, r.via, /pyproj/.test(r.bridgeError), old.ok, old.bridgeError], [true, "browser", true, true, "old-bridge"],
    "a bridge without pyproj, an old bridge: relocated by the browser, the refusal kept");
  const none = await F.relocation(null, { transform: W, boundingVolume: BOX }, { crs: "EPSG:6708", shift: SHIFT.shift }, SHIFT);
  eq([none.ok, none.bridgeError], [true, "no-bridge"], "…no bridge at all (the web build): the same");
}
console.log(`check-file-frame: ${n} checks passed`);
