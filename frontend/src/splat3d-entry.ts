/**
 * MICRO-PX7 · Gaussian Splat Lite (William Liu, Apache-2.0) and its 3D Tiles
 * plugin (`3d-tiles-rendererjs-3dgs-plugin`, Apache-2.0) as a module of their
 * own — `dist/splat3d.js`, built by `npm run build:splat3d`, fetched the first
 * time a splat is drawn (never with the page, never with the first model).
 *
 * Built like `tiles3d.js`: `three` EXTERNAL and pointed at `./engine3d.js` (one
 * three on the page). GSL also imports `three/webgpu` and `three/tsl`: those
 * two are bundled here, and their own import of three's core
 * (`./three.core.js`) is pointed at `./engine3d.js` too (`vite.config.ts
 * splatCoreFromEngine`), which exports the seven names of the core three's
 * public entry does not (`engine3d-entry.ts`).
 */
export { GaussianSplatRenderer, SplatMesh, SplatFileType, RadStreamScheduler, SogStreamScheduler, Lcc2StreamScheduler } from "gaussian-splat-lite";
export { GaussianSplatPlugin } from "3d-tiles-rendererjs-3dgs-plugin";
