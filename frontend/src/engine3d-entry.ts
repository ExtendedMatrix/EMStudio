/**
 * RIFINITURE · the 3D engine as ONE module of its own — `dist/engine3d.js`,
 * built by `npm run build:engine3d` (`EM_ENTRY=engine3d`).
 *
 * The editor is a single file, and inlining three.js in it cost the web build
 * +800 kB raw on the FIRST load of everybody, 3D or not (measured, RIFINITURE
 * parte 7: +0.33 s at 20 Mbit/s, +1.3 s at 5 Mbit/s, served as Caddy serves it).
 * In the web build (`__EM_LAZY_3D__`) `embed3d-native.ts` imports this file
 * beside the page the first time a model is opened; the desktop and `file://`
 * keep the engine inline, where the bytes come from the disk.
 */
export * as THREE from "three";
export { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// RISORSA-FILE · a tile of TempluMare is an obj that calls its mtl and textures
export { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
export { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
export { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// SPAZIO · the proxies' convex hulls (the Scena 3D draws them as they are)
export { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
// MICRO-3DTILES · three's NAMED exports too, and the one helper 3DTilesRendererJS
// takes from three's addons: `tiles3d.js` is built with three EXTERNAL and its
// imports rewritten to this file (`vite.config.ts`), so the page holds ONE three —
// two copies would each have their own classes, and `instanceof` between a
// tile's mesh and the scene's raycaster would quietly fail.
export * from "three";
export { estimateBytesUsed } from "three/examples/jsm/utils/BufferGeometryUtils.js";
// RISORSA-FILE · Draco-compressed tiles: tiles3d.js takes the loader from here
// (its decoder files ride in tiles3d.js)
export { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
// …and the one addon GLTFExtensionsPlugin's metadata reader takes from three
export { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
