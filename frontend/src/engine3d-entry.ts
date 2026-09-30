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
export { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// SPAZIO · the proxies' convex hulls (the Scena 3D draws them as they are)
export { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
