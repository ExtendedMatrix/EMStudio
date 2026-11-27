# Third-party notices shipped with EMStudio

MICRO-PX7 (27 November 2026). The components below are bundled into the
frontend (the desktop's single file; on the web, `splat3d.js` beside the page)
and carry notices their licences ask to be reproduced with any distribution.
The files are copied verbatim from the npm packages at the pinned versions
(`frontend/package.json`); refresh them with the package.

| Component | Licence | Files |
|---|---|---|
| Gaussian Splat Lite 1.11.0 (William Liu) — the Gaussian splat renderer: PLY, SPZ, SOG, RAD; RAD / SOG / LCC2 streaming | Apache-2.0 | `gaussian-splat-lite-1.11.0/LICENSE`, `NOTICE` (Apache-2.0 §4(d): reproduced), `THIRD_PARTY_LICENSES.md` (SparkJS MIT, PlayCanvas SuperSplat / splat-transform MIT, ruzstd MIT, flate2 MIT, zlib-rs zlib, libwebp BSD-3-Clause, Emscripten MIT, musl MIT; the LCC2 data organisation format is XGRIDS') |
| 3d-tiles-rendererjs-3dgs-plugin 0.3.1 (William Liu) — tilesets of Gaussian splats in 3DTilesRendererJS | Apache-2.0 | `3d-tiles-rendererjs-3dgs-plugin-0.3.1/LICENSE` (no NOTICE file in the package) |

Both are Apache-2.0, compatible with EMStudio's GPL-3.0-or-later (the Apache
licence is one-way compatible with GPL v3). The full table of EMStudio's
components and licences is `docs/ARCHITECTURE.md` §7.
