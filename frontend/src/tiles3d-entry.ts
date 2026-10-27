/**
 * MICRO-3DTILES · 3DTilesRendererJS (NASA-AMMOS, `3d-tiles-renderer`) as a module
 * of its own — `dist/tiles3d.js`, built by `npm run build:tiles3d`.
 *
 * It comes AFTER three, never with it: a model opens with `engine3d.js`, a
 * TILESET opens with this too (`tiles3d.ts`). Built with `three` external and
 * its imports pointed at `./engine3d.js`, so it adds only its own bytes.
 * `ImplicitTilingPlugin` because 3D Survey Collection writes 3D Tiles 1.1
 * implicit octrees (`cesium_exporter/native_export.py`).
 */
export { TilesRenderer } from "3d-tiles-renderer/three";
export { ImplicitTilingPlugin } from "3d-tiles-renderer/core/plugins";
// MICRO-GEOGLOBO · the globe of the Space rides with the renderer too: the
// Terrarium terrain, the image overlays (XYZ tiles: the bridge's `/tiles/...`, a
// source online). By their own files, as below: the plugins index would bring
// every plugin. (The globe's hands are EMStudio's since MICRO-GLOBO-INTERAZIONE,
// `geo-hands.ts`: the library's `GlobeControls` is not shipped.)
// …with queues and a memory of its own: the renderer's defaults are module-wide,
// shared with every tileset of the Space
export { LRUCache, PriorityQueue, DownloadPriorityQueue } from "3d-tiles-renderer/core";
export { TerrariumMeshPlugin } from "3d-tiles-renderer/src/three/plugins/images/terrain-rgb/TerrariumMeshPlugin.js";
export { ImageOverlayPlugin, XYZTilesOverlay } from "3d-tiles-renderer/src/three/plugins/images/ImageOverlayPlugin.js";
// RISORSA-FILE · the `.3tz` reader rides with the renderer: it arrives with the
// first tileset, never before
export { Archive3tz, Tiles3tzPlugin, sourceFor, archiveBase } from "./tiles3tz";
// RISORSA-FILE · Draco: the tiles of TempluMare's tileset are Draco-compressed
// b3dm (measured: «THREE.GLTFLoader: No DRACOLoader instance provided»). The
// decoder rides with the renderer — the glTF build of three's (wrapper + wasm)
// (DRACOLoader is three's: engine3d.js exports it, as it exports three itself;
// the decoder's two files are imported by PATH, not as `three/…`, which this
// build makes external and points at engine3d.js)
export { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
// MICRO-OTTIMIZZA-1 · meshopt and KTX2 (gltfpack's variants): both from
// engine3d.js, as DRACOLoader; the Basis transcoder's two files beside this one
// (`vite.config.ts dracoBeside`, `dist/basis/`), as Draco's
export { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
export { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
// by its own file: the plugins index would bring every plugin (and three's FullScreenQuad)
export { GLTFExtensionsPlugin } from "3d-tiles-renderer/src/three/plugins/GLTFExtensionsPlugin.js";
// the two files are emitted BESIDE this one by the build (`vite.config.ts
// dracoBeside`, `dist/draco/`) and asked relative to it at run time — a library
// build would inline them — so they cost nothing until a Draco tile arrives
const DRACO_DIR = "./draco/";
export const DRACO_FILES: Record<string, string> = Object.fromEntries(
  ["draco_wasm_wrapper.js", "draco_decoder.wasm"].map((f) => [f, new URL(DRACO_DIR + f, import.meta.url).href]));
const BASIS_DIR = "./basis/";
export const BASIS_FILES: Record<string, string> = Object.fromEntries(
  ["basis_transcoder.js", "basis_transcoder.wasm"].map((f) => [f, new URL(BASIS_DIR + f, import.meta.url).href]));
