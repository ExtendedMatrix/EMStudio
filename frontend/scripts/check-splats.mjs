// MICRO-PX7 (PX5 A–C) · executable check of the Gaussian splats as
// representation models:
//   · what a file IS for the splat reader (src/splat-rules.ts): the forms of
//     Gaussian Splat Lite (PLY, SPZ, SOG, RAD, a SOG `lod-meta.json`, an LCC2
//     index) by the locator, else the resource's name (a store URL names no
//     extension); a PLY header read for Gaussian properties (the INRIA layout,
//     SuperSplat's compressed PLY) — a mesh or a cloud refused with its reason;
//     a tileset that declares `KHR_gaussian_splatting` tiles;
//   · the rule of the clicks: the alpha isosurface at EMStudio's threshold
//     (0.5, measured against the mesh of the same object: the MICRO's report),
//     and what an extractor read on a splat carries (pick_rule, pick_opacity);
//   · the resource (src/space.ts): a splat is not a tileset — a SOG folder
//     entered by its `lod-meta.json` included — and a tileset stays one;
//   · the door (src/door.ts): the splat files are models;
//   · the wiring, read in the sources: the Space's hits on a splat carry the
//     rule (scene3d.ts), a tool's point keeps it (main.ts wallPointOf), the
//     points for proxy_from_points and the alignment's data say it, «Annotate
//     surface» refuses a splat with words in EN and IT; the engine is lazy (no
//     static import of gaussian-splat-lite outside splat3d-entry.ts), its web
//     build takes three's core from engine3d.js; versions pinned exactly.
//
//   node scripts/check-splats.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const FE = new URL("../", import.meta.url).pathname;
const SRC = `${FE}src/`;
const bundle = await esbuild.build({
  stdin: { contents: `export * as R from "./splat-rules"; export { tilesKindOf } from "./space"; export { doorKindOf } from "./door";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const { R, tilesKindOf, doorKindOf } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, `${what} — got ${JSON.stringify(a)}`); checks++; };

// ── what a file is ──────────────────────────────────────────────────────────
for (const [n, k] of [["a.ply", "ply"], ["A.PLY", "ply"], ["b.spz", "spz"], ["c.sog", "sog"], ["d.rad", "rad"], ["e.lcc2", "lcc2"],
  ["scene/lod-meta.json", "sog-lod"], ["lod-meta.json", "sog-lod"], ["../RM/Splat/x.ply?token=1", "ply"], ["/fs/at/tmp/x.spz#v", "spz"],
  ["/fs/at/tmp%2Fsplat%2Fscene.rad", "rad"], ["C:\\scavi\\muro.sog", "sog"],
  ["m.glb", ""], ["tileset.json", ""], ["meta.json", ""], ["x.3tz", ""], ["https://node/v1/rooms/r/asset/sha256:ab", ""], ["", ""]])
  eq(R.splatKindOfName(n), k, `kind of ${n}`);
eq(R.splatKindOf({ url: "https://node/asset/sha256:ab" }, "muro.spz"), "spz", "a store URL: the resource's name says it");
eq(R.splatKindOf({ url: "https://node/asset/sha256:ab", original_name: "scene.rad" }), "rad", "…or the original name it keeps");
eq(R.splatKindOf({ url: "../RM/a.sog" }, "a mesh.glb"), "sog", "the locator first");
eq(R.splatKindOf({ url: "../RM/a.glb" }, "a.glb"), "", "a mesh is not a splat");
ok(R.SPLAT_STREAMED.has("rad") && R.SPLAT_STREAMED.has("sog-lod") && R.SPLAT_STREAMED.has("lcc2"), "RAD, SOG lod-meta and LCC2 stream");
ok(!R.SPLAT_STREAMED.has("ply") && !R.SPLAT_STREAMED.has("spz") && !R.SPLAT_STREAMED.has("sog"), "PLY, SPZ, a single SOG are one model");

// ── a PLY's header ──────────────────────────────────────────────────────────
const head = (props, extra = "", n = 1500000) => `ply\nformat binary_little_endian 1.0\n${extra}element vertex ${n}\n${props.map((p) => `property float ${p}\n`).join("")}end_header\n`;
const GS = ["x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
let h = R.plyHeaderKind(head(GS, "comment MICRO-PX7 synthetic splat\n"));
eq([h.gaussian, h.compressed, h.splats], [true, false, 1500000], "a 3DGS PLY (INRIA layout): Gaussian, its count");
h = R.plyHeaderKind(head([...GS, ...Array.from({ length: 45 }, (_, i) => `f_rest_${i}`)]));
ok(h.gaussian, "with SH coefficients (f_rest_*) too");
// (the compressed form names its vertex element after the chunk one)
h = R.plyHeaderKind("ply\nformat binary_little_endian 1.0\nelement chunk 12\nproperty float min_x\nelement vertex 3000\nproperty uint packed_position\nproperty uint packed_rotation\nend_header\n");
eq([h.gaussian, h.compressed], [true, true], "SuperSplat's compressed PLY");
h = R.plyHeaderKind("ply\nformat ascii 1.0\nelement vertex 8\nproperty float x\nproperty float y\nproperty float z\nelement face 12\nproperty list uchar int vertex_indices\nend_header\n");
eq([h.gaussian, /mesh/.test(h.why)], [false, true], "a mesh PLY: refused, said a mesh");
h = R.plyHeaderKind(head(["x", "y", "z", "red", "green", "blue"]));
eq([h.gaussian, /opacity/.test(h.why)], [false, true], "a coloured cloud: refused, what is missing said");
eq(R.plyHeaderKind("solid cube\nfacet normal 0 0 1\n").gaussian, false, "not a PLY at all");
ok(/magic/.test(R.plyHeaderKind("").why), "…said so");

// ── a tileset of splats ─────────────────────────────────────────────────────
// the plugin's own sample (data/SvirnasAlyt-3dtiles/tileset.json, 3DGS-PLY-3DTiles-Converter)
const svirnas = { asset: { version: "1.1" }, extensionsUsed: ["3DTILES_content_gltf"],
  extensions: { "3DTILES_content_gltf": { extensionsRequired: ["KHR_gaussian_splatting", "KHR_gaussian_splatting_compression_spz_2"],
    extensionsUsed: ["KHR_gaussian_splatting", "KHR_gaussian_splatting_compression_spz_2", "EXT_splat_opacity"] } }, root: {} };
ok(R.tilesetDeclaresSplats(svirnas), "the plugin's sample declares its splat tiles");
ok(R.tilesetDeclaresSplats({ extensionsUsed: ["KHR_spz_gaussian_splats_compression"] }), "the draft name too");
ok(!R.tilesetDeclaresSplats({ asset: {}, extensionsUsed: ["3DTILES_content_gltf"], extensions: { "3DTILES_content_gltf": { extensionsUsed: ["KHR_draco_mesh_compression"] } } }), "a tileset of meshes: no");
ok(!R.tilesetDeclaresSplats(null) && !R.tilesetDeclaresSplats("x"), "nothing read: no");

// ── the rule of the clicks ──────────────────────────────────────────────────
eq(R.SPLAT_PICK_OPACITY, 0.5, "the threshold measured (report: 0.2–0.4 cm on a clean splat, 1.5–2.7 cm on a noisy one)");
eq(R.splatPickAttributes(), { pick_rule: "splat_alpha_isosurface", pick_opacity: 0.5 }, "what an extractor read on a splat carries");
eq(R.splatPickAttributes(0.15), { pick_rule: "splat_alpha_isosurface", pick_opacity: 0.15 }, "…another threshold, said as it was");
ok(R.SURFACE_TOOLS.has("surface"), "«Annotate surface» needs a surface");

// ── the resource and the door ───────────────────────────────────────────────
eq(tilesKindOf({ url: "../RM/Splat/EST_L-sog/lod-meta.json", packaging: "directory" }), "", "a SOG folder (lod-meta.json) is not a tileset");
eq(tilesKindOf({ url: "../RB/x/tileset.json", packaging: "directory" }), "directory", "a tileset folder still is");
eq(tilesKindOf({ url: "../RB/x.3tz" }), "3tz", "a .3tz still is (a .3tz of splats too: the tiles' plugin reads it)");
for (const n of ["a.spz", "b.sog", "c.rad", "d.lcc2", "e/lod-meta.json", "f.ply"]) eq(doorKindOf(n), "model", `${n} at the door: a model`);

// ── the wiring, read in the sources ─────────────────────────────────────────
const src = (f) => readFileSync(`${SRC}${f}`, "utf8");
const scene = src("scene3d.ts"), main = src("main.ts"), i18n = src("i18n.ts"), sp3 = src("splat3d.ts"), tiles = src("tiles3d.ts");
ok(/splat\?: \{ opacity: number \} \| null;/.test(scene), "ToolHit says a point is on a splat");
ok((scene.match(/hh\.splat \? \{ splat: \{ opacity: SPLAT_PICK_OPACITY \} \}/g) ?? []).length === 2, "the click and the double click hand the rule over");
ok(/x\.layer\.intersect\(ray, SPLAT_PICK_OPACITY\)/.test(scene), "the Space's hits on a splat: GSL's raycast at EMStudio's threshold");
ok(/new S\.GaussianSplatPlugin\(\{ minRaycastOpacity: SPLAT_PICK_OPACITY \}\)/.test(scene), "a tileset's splats picked at the same threshold");
ok(/tilesetDeclaresSplats\(await readTilesetJson\(/.test(scene), "the plugin only for a tileset that declares splats");
ok(/splatRendererFor\(S, scene, renderer\)/.test(scene) && /scene\.userData\.__emSplatRenderer/.test(sp3), "ONE GaussianSplatRenderer per scene");
ok(/hit\.splat \? \{ splat: \{ opacity: hit\.splat\.opacity \} \}/.test(main), "a tool's point keeps how it was taken (wallPointOf)");
ok(/w\.splat \? \{ attributes: splatPickAttributes\(w\.splat\.opacity\) \}/.test(main), "the points for proxy_from_points say it");
ok(/tr\.points\.some\(\(w\) => w\.splat\) \? splatPickAttributes/.test(main), "the alignment's data says it");
ok(/if \(w\.splat\) \{ toast\(t\("surf\.onSplat"/.test(main), "«Annotate surface» refuses a splat");
ok((i18n.match(/"surf\.onSplat": "/g) ?? []).length >= 2 && /is a Gaussian splat/.test(i18n) && /è un Gaussian splat/.test(i18n), "…in words, EN and IT");
ok(/plugins\?: any\[\];/.test(tiles) && /for \(const p of opts\.plugins \?\? \[\]\) tiles\.registerPlugin\(p\);/.test(tiles), "the tiles layer takes the splat plugin");
// lazy: gaussian-splat-lite and its plugin are imported only by splat3d.ts (dynamic) and splat3d-entry.ts
const statics = readdirSync(SRC).filter((f) => f.endsWith(".ts") && f !== "splat3d-entry.ts")
  .filter((f) => /^import [^;]*from "(gaussian-splat-lite|3d-tiles-rendererjs-3dgs-plugin)"/m.test(src(f)));
eq(statics, [], "no static import of the splat engine (it comes with the first splat)");
ok(/import\("gaussian-splat-lite"\)/.test(sp3) && /new URL\("\.\/splat3d\.js", document\.baseURI\)/.test(sp3), "splat3d.ts: inline in the single file, beside the page on the web");
const vite = readFileSync(`${FE}vite.config.ts`, "utf8"), eng = src("engine3d-entry.ts");
ok(/function splatCoreFromEngine\(\)/.test(vite) && /three\\\.\(webgpu\|tsl\)/.test(vite), "the web build points three's core of three/webgpu and three/tsl at engine3d.js");
ok(/RAD2DEG, ReversedDepthFuncs, floorPowerOfTwo, generateUUID, getByteLength, isTypedArray, yieldToMain/.test(eng) && /FullScreenQuad, Pass/.test(eng), "engine3d.js exports the core's names they take");
const pkg = JSON.parse(readFileSync(`${FE}package.json`, "utf8"));
eq([pkg.dependencies.three, pkg.dependencies["@types/three"], pkg.dependencies["gaussian-splat-lite"], pkg.dependencies["3d-tiles-rendererjs-3dgs-plugin"]],
  ["0.187.0", "0.187.0", "1.11.0", "0.3.1"], "versions pinned exactly");
ok(/build:splat3d/.test(pkg.scripts["build:web"]), "the web build makes splat3d.js");
// a web build already made: splat3d.js takes three only from engine3d.js
if (existsSync(`${FE}dist/splat3d.js`)) {
  const js = readFileSync(`${FE}dist/splat3d.js`, "utf8");
  const froms = [...new Set([...js.matchAll(/from\s*"(\.\/[^"]+|three[^"]*)"/g)].map((m) => m[1]))];
  eq(froms, ["./engine3d.js"], "dist/splat3d.js imports only ./engine3d.js");
}

console.log(`check-splats: ${checks} checks passed`);
