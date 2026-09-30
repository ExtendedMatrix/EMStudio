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
