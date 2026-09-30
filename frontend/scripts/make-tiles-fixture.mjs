// MICRO-3DTILES-LOD · the small tilesets the checks open, written by hand.
//
//   node scripts/make-tiles-fixture.mjs        # rewrites testdata/{tiles-prova,tiles-punti,tiles-cava}
//
// They have the SHAPE of what 3D Survey Collection writes (`cesium_exporter/
// native_export.py`): bounding volumes in Blender's frame (Z-up), glb content
// exported Y-up (`export_yup=True`), no `root.transform` — so a check on these is
// a check on the frame of the real ones. Tiny on purpose: a box per tile.
//
//   tiles-prova/   explicit REPLACE tree on [0,4]×[0,4]×[0,1] (Z-up metres):
//                  root → c0..c3 (quadrants) → c0 has c0_0..c0_3; c1 has ONE child
//                  whose file is missing (the status line must say so)
//   tiles-punti/   a point cloud in tiles: root `punti.pnts` (POSITION + RGB),
//                  one ADD child with a glTF POINTS glb
//   tiles-cava/    a root WITHOUT content over two tiles of tiles-prova — the
//                  shape of a 3DSC tileset without LODs (content at the leaves
//                  only, `sarcofago_v3_baseline`): the root of what is seen is
//                  the first level with content
//
// Deterministic: the same bytes every run (no clock, no random).
import { mkdirSync, writeFileSync } from "node:fs";

const TD = new URL("../testdata/", import.meta.url).pathname;

// ── a minimal glb writer ─────────────────────────────────────────────────────
const pad4 = (n) => (n + 3) & ~3;
function glb(json, bin) {
  const j = Buffer.from(JSON.stringify(json));
  const jl = pad4(j.length), bl = pad4(bin.length);
  const out = Buffer.alloc(12 + 8 + jl + 8 + bl);
  let o = 0;
  out.writeUInt32LE(0x46546c67, o); o += 4;          // "glTF"
  out.writeUInt32LE(2, o); o += 4;
  out.writeUInt32LE(out.length, o); o += 4;
  out.writeUInt32LE(jl, o); o += 4;
  out.writeUInt32LE(0x4e4f534a, o); o += 4;          // JSON
  j.copy(out, o); out.fill(0x20, o + j.length, o + jl); o += jl;
  out.writeUInt32LE(bl, o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4;          // BIN
  bin.copy(out, o);
  return out;
}

/** Blender Z-up (x, y, z) → glTF Y-up (x, z, −y), as `export_yup` writes it. */
const yup = ([x, y, z]) => [x, z, -y];

/** A mesh glb: triangles (positions in Z-up, written Y-up) and one colour. */
function meshGlb(tris, rgba, name) {
  const pos = new Float32Array(tris.flat().flatMap(yup));
  const n = pos.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], pos[i * 3 + k]); max[k] = Math.max(max[k], pos[i * 3 + k]);
  }
  const bin = Buffer.from(pos.buffer);
  return glb({
    asset: { version: "2.0", generator: "EMStudio make-tiles-fixture" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0 }, material: 0, mode: 4 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: rgba, metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true }],
    accessors: [{ bufferView: 0, componentType: 5126, count: n, type: "VEC3", min, max }],
    bufferViews: [{ buffer: 0, byteLength: bin.length }],
    buffers: [{ byteLength: bin.length }],
  }, bin);
}

/** The 12 triangles of an axis-aligned box, Z-up. */
function box([x0, y0, z0], [x1, y1, z1]) {
  const v = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const f = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  return f.flatMap(([a, b, c, d]) => [[v(a), v(b), v(c)], [v(a), v(c), v(d)]]);
}

/** A 3D Tiles `box` bounding volume (centre + three half axes), Z-up. */
const bv = ([x0, y0, z0], [x1, y1, z1]) => ({ box: [
  (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2,
  (x1 - x0) / 2, 0, 0, 0, (y1 - y0) / 2, 0, 0, 0, (z1 - z0) / 2] });

// ── tiles-prova ──────────────────────────────────────────────────────────────
function tilesProva() {
  const dir = `${TD}tiles-prova/`;
  mkdirSync(`${dir}tiles`, { recursive: true });
  const put = (rel, lo, hi, rgba) => writeFileSync(`${dir}${rel}`, meshGlb(box(lo, hi), rgba, rel));
  const tile = (uri, lo, hi, err, children) => ({
    boundingVolume: bv(lo, hi), geometricError: err, refine: "REPLACE",
    content: { uri }, ...(children ? { children } : {}) });
  // the root: one coarse slab over the whole site
  put("tiles/root.glb", [0, 0, 0], [4, 4, 0.6], [0.55, 0.55, 0.55, 1]);
  const q = [[0, 0], [2, 0], [0, 2], [2, 2]];
  const cols = [[0.75, 0.35, 0.25, 1], [0.3, 0.6, 0.35, 1], [0.3, 0.45, 0.75, 1], [0.8, 0.7, 0.3, 1]];
  const kids = q.map(([x, y], i) => {
    put(`tiles/c${i}.glb`, [x + 0.05, y + 0.05, 0], [x + 1.95, y + 1.95, 0.8], cols[i]);
    let children;
    if (i === 0) {
      children = q.map(([u, v], j) => {
        const lo = [x + u / 2, y + v / 2, 0], hi = [x + u / 2 + 1, y + v / 2 + 1, 1];
        put(`tiles/c0_${j}.glb`, [lo[0] + 0.05, lo[1] + 0.05, 0], [hi[0] - 0.05, hi[1] - 0.05, 1], cols[0]);
        return tile(`tiles/c0_${j}.glb`, lo, hi, 0);
      });
    } else if (i === 1) {
      // a tile whose file is NOT written: «Un tile che non si trova lo dice»
      children = [tile("tiles/mancante/c1_0.glb", [x, y, 0], [x + 2, y + 2, 1], 0)];
    }
    return tile(`tiles/c${i}.glb`, [x, y, 0], [x + 2, y + 2, 1], i < 2 ? 0.5 : 0, children);
  });
  const ts = {
    asset: { version: "1.1", generator: "EMStudio make-tiles-fixture (3DSC frame: Z-up volumes, Y-up glb)" },
    geometricError: 16,
    root: tile("tiles/root.glb", [0, 0, 0], [4, 4, 1], 4, kids),
  };
  writeFileSync(`${dir}tileset.json`, JSON.stringify(ts, null, 2) + "\n");
}

// ── tiles-punti ──────────────────────────────────────────────────────────────
/** 3D Tiles 1.0 `pnts`: a feature table with POSITION (float) and RGB. */
function pnts(points, rgb) {
  const n = points.length;
  const pos = Buffer.from(new Float32Array(points.flat()).buffer);
  const col = Buffer.from(Uint8Array.from(rgb.flat()));
  const body = Buffer.concat([pos, col, Buffer.alloc(pad8(pos.length + col.length) - pos.length - col.length)]);
  let json = Buffer.from(JSON.stringify({ POINTS_LENGTH: n, POSITION: { byteOffset: 0 }, RGB: { byteOffset: pos.length } }));
  const jl = pad8(28 + json.length) - 28;
  json = Buffer.concat([json, Buffer.alloc(jl - json.length, 0x20)]);
  const head = Buffer.alloc(28);
  head.write("pnts", 0, "ascii");
  head.writeUInt32LE(1, 4);
  head.writeUInt32LE(28 + json.length + body.length, 8);
  head.writeUInt32LE(json.length, 12);
  head.writeUInt32LE(body.length, 16);
  head.writeUInt32LE(0, 20);
  head.writeUInt32LE(0, 24);
  return Buffer.concat([head, json, body]);
}
function pad8(n) { return (n + 7) & ~7; }

/** A glTF POINTS glb (mode 0), positions Z-up written Y-up, a colour each. */
function pointsGlb(points, rgb) {
  const pos = new Float32Array(points.flatMap(yup));
  const col = new Float32Array(rgb.flatMap(([r, g, b]) => [r / 255, g / 255, b / 255]));
  const n = points.length;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], pos[i * 3 + k]); max[k] = Math.max(max[k], pos[i * 3 + k]);
  }
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(col.buffer)]);
  return glb({
    asset: { version: "2.0", generator: "EMStudio make-tiles-fixture" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "punti" }],
    meshes: [{ name: "punti", primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, mode: 0 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: n, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: n, type: "VEC3" }],
    bufferViews: [{ buffer: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: col.byteLength }],
    buffers: [{ byteLength: bin.length }],
  }, bin);
}

function tilesPunti() {
  const dir = `${TD}tiles-punti/`;
  mkdirSync(dir, { recursive: true });
  // a deterministic cloud: a 20×20 grid on a gentle dome, Z-up (the pnts
  // feature table is in the tileset frame, like a 3DSC bounding volume)
  const grid = (k, z0) => {
    const pts = [], rgb = [];
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      const x = (i + 0.5) * (4 / k), y = (j + 0.5) * (4 / k);
      pts.push([x, y, z0 + 0.4 * Math.sin((x / 4) * Math.PI) * Math.sin((y / 4) * Math.PI)]);
      rgb.push([Math.round(60 + 190 * (x / 4)), Math.round(60 + 190 * (y / 4)), 120]);
    }
    return { pts, rgb };
  };
  const a = grid(20, 0), b = grid(40, 0.02);
  writeFileSync(`${dir}punti.pnts`, pnts(a.pts, a.rgb));
  // the glTF POINTS child: the glb is Y-up, as any glb content is
  writeFileSync(`${dir}punti-fini.glb`, pointsGlb(b.pts, b.rgb));
  const ts = {
    asset: { version: "1.0", generator: "EMStudio make-tiles-fixture" },
    geometricError: 8,
    root: { boundingVolume: bv([0, 0, 0], [4, 4, 0.5]), geometricError: 2, refine: "ADD",
            content: { uri: "punti.pnts" },
            children: [{ boundingVolume: bv([0, 0, 0], [4, 4, 0.5]), geometricError: 0, content: { uri: "punti-fini.glb" } }] },
  };
  writeFileSync(`${dir}tileset.json`, JSON.stringify(ts, null, 2) + "\n");
}

function tilesCava() {
  const dir = `${TD}tiles-cava/`;
  mkdirSync(dir, { recursive: true });
  const leaf = (uri, lo, hi) => ({ boundingVolume: bv(lo, hi), geometricError: 0, content: { uri } });
  const ts = {
    asset: { version: "1.1", generator: "EMStudio make-tiles-fixture" },
    geometricError: 16,
    root: { boundingVolume: bv([0, 0, 0], [4, 4, 1]), geometricError: 4, refine: "REPLACE",
            children: [leaf("../tiles-prova/tiles/c2.glb", [0, 2, 0], [2, 4, 1]), leaf("../tiles-prova/tiles/c3.glb", [2, 2, 0], [4, 4, 1])] },
  };
  writeFileSync(`${dir}tileset.json`, JSON.stringify(ts, null, 2) + "\n");
}

tilesProva();
tilesPunti();
tilesCava();
console.log("written: testdata/tiles-prova, testdata/tiles-punti, testdata/tiles-cava");
