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
console.log(`check-file-frame: ${n} checks passed`);
