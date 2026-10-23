// MICRO-GEOGLOBO · the globe of the Space, pure (`src/geoglobe.ts`):
//   1. the frame: geodetic ↔ ECEF against PROJ (EPSG:4979 → 4978) when
//      s3Dgraphy's venv is there; the site frame round trip; a point of the
//      GT16's CRS (EPSG:31700, PROJ through the bridge's own `site_frame`)
//      landing where the scene's metres say;
//   2. the modes: the passage by the altitude, with its hysteresis; the
//      flight never through the Earth, never NaN (the globe's target is the
//      Earth's centre);
//   3. the tiles: the GT16's tile (measured on the sources, 23 Oct), a box's
//      tiles, an extract's count;
//   4. the sources: every one with its licence, OSM online only; the URL
//      through the bridge carries the tile's extension;
//   5. the layers: the panel's order (top first) is the reverse of the drawing,
//      a move, an opacity clamped, an old list read back, the attribution.
//
//   node scripts/check-geoglobe.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./geoglobe";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} — got ${a}, want ${b} ± ${tol}`); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, `${m} — got ${JSON.stringify(a)}`); checks++; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const PY = process.env.PYTHON ?? new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const py = existsSync(PY) ? (code) => JSON.parse(execFileSync(PY, ["-c", code], { encoding: "utf8" })) : null;

// ── 1 · the frame ───────────────────────────────────────────────────────────
{
  const pts = [[22.789207886221057, 45.51388980543227, 500], [0, 0, 0], [-122.4, 37.8, 12], [151.2, -33.9, 80], [12.5, 89.9, 3000]];
  for (const [lon, lat, h] of pts) {
    const e = M.geodeticToEcef(lon, lat, h);
    const g = M.ecefToGeodetic(e);
    near(g.lon, lon, 1e-9, `ECEF round trip lon ${lon}`);
    near(g.lat, lat, 1e-9, `ECEF round trip lat ${lat}`);
    near(g.h, h, 1e-4, `ECEF round trip h ${h}`);
  }
  if (py) {
    // PROJ's own geodetic → geocentric, the same points
    const want = py(`import json; from pyproj import Transformer
t = Transformer.from_crs(4979, 4978, always_xy=True)
print(json.dumps([t.transform(*p) for p in ${JSON.stringify(pts)}]))`);
    pts.forEach((p, i) => near(dist(M.geodeticToEcef(...p), want[i]), 0, 1e-3, `ECEF as PROJ's (${p})`));
  }
  // the GT16's anchor, as the bridge measures it (`em_geotiles.site_frame`)
  const anchor = py ? py(`import json, sys; sys.path.insert(0, ${JSON.stringify(TOOLS)}); import em_geotiles as G
print(json.dumps(G.site_frame(31700, 327300, 448370, 500, 0)))`)
    : { lon: 22.789207886221057, lat: 45.51388980543227, h: 500, azimuth: -1.5838989932699294, scale: 1.000033199733276 };
  near(anchor.lat, 45.51389, 1e-5, "the GT16's anchor (EPSG:31700 327300 448370): Ulpia Traiana Sarmizegetusa, lat");
  near(anchor.lon, 22.78921, 1e-5, "…lon");
  near(anchor.azimuth, -1.584, 0.01, "the grid north of Stereo 70 at the anchor, −1.58° from true north");
  const a = { lon: anchor.lon, lat: anchor.lat, h: anchor.h, azimuth: anchor.azimuth, scale: anchor.scale };
  near(M.crsScale(a), 1.000112, 2e-6, "a scene metre (Stereo 70 at 500 m) is 1.000112 true metres: the grid's scale × the height's");
  eq(M.lonLatToLocal(a, a.lon, a.lat, a.h).map((v) => Math.round(v * 1e6) / 1e6 + 0), [0, 0, 0], "the anchor is the scene's origin");
  const F = M.siteFrame(a), I = M.invertRigid(F);
  for (const p of [[10, 2, -30], [-500, 40, 800], [3000, -100, 2500]]) near(dist(M.applyM4(I, M.applyM4(F, p)), p), 0, 1e-6, `the frame and its inverse (${p})`);
  for (const p of [[10, 2, -30], [-500, 40, 800]]) {
    const g = M.localToLonLat(a, p);
    near(dist(M.lonLatToLocal(a, g.lon, g.lat, g.h), p), 0, 1e-6, `local → lon/lat → local (${p})`);
  }
  // up is up, the Earth's centre is under the site
  const c = M.earthCentreLocal(a);
  near(c[1] * M.crsScale(a), -6367762, 5, "the Earth's centre is 6367.76 true km under the site (WGS84 radius at 45.5°)");
  ok(Math.abs(c[0]) < 1000 && Math.abs(c[2]) < 25000, "…and nearly straight down (the ellipsoid's normal is not radial)");
  if (py) {
    // points of the CRS around the anchor: (X − x0, Y − y0) ARE the scene's (x, −z) — the grid's
    // scale and the height are in the frame (`crsScale`); the ground drops with the Earth's
    // curvature (d²/2R: 7.8 cm at 1 km), the map plane does not
    const P = [[327300 + 100, 448370], [327300, 448370 + 100], [327300 - 1000, 448370 + 1000], [327300 + 250, 448370 - 400]];
    const ll = py(`import json; from pyproj import Transformer
t = Transformer.from_crs(31700, 4326, always_xy=True)
print(json.dumps([t.transform(*p) for p in ${JSON.stringify(P)}]))`);
    P.forEach(([X, Y], i) => {
      const L = M.lonLatToLocal(a, ll[i][0], ll[i][1], 500);
      const d = Math.hypot(X - 327300, Y - 448370);
      near(L[0], X - 327300, 0.002 + d * 2e-6, `CRS point ${i}: the scene's x is the CRS's easting offset`);
      near(-L[2], Y - 448370, 0.002 + d * 2e-6, `CRS point ${i}: the scene's −z is the CRS's northing offset`);
      near(L[1], -(d * d) / (2 * 6378137), 0.002 + d * 1e-6, `CRS point ${i}: the ground drops with the Earth's curvature`);
    });
  }
}

// ── 2 · the modes and the flight ────────────────────────────────────────────
{
  eq(M.autoMode("globe", 2500, 1000), "site", "coming down near the site under 3 km: the site's hands");
  eq(M.autoMode("globe", 2500, 60000), "globe", "…not 60 km away from it");
  eq(M.autoMode("globe", 10000, 0), "globe", "…not at 10 km");
  eq(M.autoMode("site", 10000, 0), "site", "going up: between the two heights the mode stays (hysteresis)");
  eq(M.autoMode("site", 31000, 0), "globe", "over 30 km the globe's hands");
  eq(M.autoMode("plan", 31000, 0), "globe", "…from the plan too");
  eq(M.autoMode("plan", 2000, 0), "plan", "the plan stays the plan near the site");
  const a = { lon: 22.789, lat: 45.514, h: 500, azimuth: 0 };
  const c = M.earthCentreLocal(a);
  const up = [-c[0], -c[1], -c[2]], L = Math.hypot(...up), k = (6378137 * 3.2) / L;
  const globe = { pos: [c[0] + up[0] * k, c[1] + up[1] * k, c[2] + up[2] * k], target: c };
  const site = { pos: [100, 120, 160], target: [0, 0, 0] };
  // the antipodes: a flight that must go around
  const far = { pos: M.lonLatToLocal(a, -157, -45, 2000), target: M.lonLatToLocal(a, -157, -45, 0) };
  for (const [from, to, name] of [[site, globe, "site → globe"], [globe, site, "globe → site"], [far, site, "the antipodes → site"]]) {
    let minR = Infinity, nan = false;
    for (let i = 0; i <= 200; i++) {
      const f = M.flyAt(from, to, c, i / 200);
      if (![...f.pos, ...f.target].every(Number.isFinite)) nan = true;
      minR = Math.min(minR, dist(f.pos, c));
    }
    ok(!nan, `${name}: no NaN on the way (the globe's target is the Earth's centre)`);
    ok(minR >= 6356752 - 1, `${name}: the camera never goes through the Earth (closest ${Math.round(minR)} m from the centre)`);
    eq(M.flyAt(from, to, c, 1), to, `${name}: the flight ends on the view asked`);
  }
  const ms = M.flyMs(site.pos, globe.pos, c);
  ok(ms >= 600 && ms <= 3000, `a flight lasts 0.6–3 s (${ms} ms)`);
}

// ── 3 · the tiles ───────────────────────────────────────────────────────────
{
  eq(M.lonLatToTile(22.7892, 45.5139, 14), { x: 9229, y: 5860 }, "the GT16's tile at z14 (fetched from both sources, 23 Oct)");
  eq(M.lonLatToTile(22.7892, 45.5139, 17), { x: 73833, y: 46884 }, "…and at z17");
  eq(M.lonLatToTile(0, 0, 1), { x: 1, y: 1 }, "null island at z1");
  const b = M.tileBounds(14, 9229, 5860);
  ok(b[0] <= 22.7892 && b[2] >= 22.7892 && b[1] <= 45.5139 && b[3] >= 45.5139, "the tile's box holds the place");
  const box = M.boxAround(22.7892, 45.5139, 1000);
  near((box[3] - box[1]) * 111320, 2000, 1, "a box of ±1 km: 2 km north–south");
  const r = M.bboxTileRange(box, 15);
  ok(r.n >= 4 && r.n <= 16, `±1 km at z15 (a tile ≈ 860 m there): a few tiles (${r.n})`);
  eq(M.extractTileCount([-180, -85, 180, 85], 0, 5), 1365, "the world z0–z5: 1365 tiles (the globe minimum's first levels)");
  ok(M.extractTileCount(M.boxAround(22.7892, 45.5139, 5000), 0, 19) > M.EXTRACT_MAX_TILES, "±5 km to z19 is over the ceiling of one extract");
}

// ── 4 · the sources ─────────────────────────────────────────────────────────
{
  for (const s of M.SOURCES) {
    ok(s.licence && s.licenceUrl && s.attribution, `${s.id}: its licence, where it is written, its attribution`);
    ok(/\{z\}/.test(s.url) && /\{x\}/.test(s.url) && /\{y\}/.test(s.url), `${s.id}: an XYZ template`);
  }
  eq(M.sourceById("osm").offline, false, "OpenStreetMap's tile servers: online only (their usage policy forbids offline copies)");
  eq(M.sourceById("s2cloudless-2016").licence, "CC BY 4.0", "Sentinel-2 cloudless: the 2016 layer, CC BY 4.0 (the later years are NC)");
  eq(M.sourceById("mapterhorn").encoding, "terrarium", "the terrain: Terrarium");
  eq(M.tileTemplate(M.sourceById("mapterhorn"), "http://localhost:8765/", "/tmp/a b/geo"),
    "http://localhost:8765/tiles/xyz/mapterhorn/{z}/{x}/{y}.webp?pkg=%2Ftmp%2Fa%20b%2Fgeo", "through the bridge: its extension (the renderer reads the kind from the URL), the project's packages");
  eq(M.tileTemplate(M.sourceById("osm"), null), M.sourceById("osm").url, "no bridge: the source itself");
  ok(M.BUDGET.terrainMinZoom === 10 && M.BUDGET.maxPixelRatio === 1.5, "the budget after osiris: terrain from z10, pixel ratio ≤ 1.5");
}

// ── 5 · the layers ──────────────────────────────────────────────────────────
{
  const d = M.defaultLayers();
  eq(d.map((l) => [l.id, l.visible]), [["base:osm", false], ["base:s2cloudless-2016", true], ["terrain:mapterhorn", true]], "the default layers: OSM off over Sentinel-2, the terrain");
  const r = { id: "raster:/x/o.tif", kind: "raster", name: "o.tif", visible: true, opacity: 1, path: "/x/o.em3857.pmtiles" };
  const L = [r, ...d];
  eq(M.imageOrder(L).map((l) => l.id), ["base:s2cloudless-2016", "base:osm", "raster:/x/o.tif"], "drawn bottom up: the panel's top last (over)");
  eq(M.moveLayer(L, "raster:/x/o.tif", 1).map((l) => l.id)[1], "raster:/x/o.tif", "a move down");
  eq(M.moveLayer(L, "raster:/x/o.tif", -1), L, "the top cannot go higher");
  eq(M.setLayer(L, "raster:/x/o.tif", { opacity: 3 })[0].opacity, 1, "an opacity is clamped to 0…1");
  eq(M.attributionOf(L).length, 2, "the attribution: the sources shown (Sentinel-2 and the terrain), once each");
  ok(M.attributionOf(M.setLayer(L, "base:osm", { visible: true }))[0].includes("OpenStreetMap"), "OSM shown: its attribution");
  eq(M.readLayers([{ id: "base:osm", kind: "imagery", source: "osm", visible: true, opacity: 0.5 }, { junk: 1 }]).map((l) => l.id),
    ["base:osm", "base:s2cloudless-2016", "terrain:mapterhorn"], "an old list: kept, the junk dropped, the missing defaults added");
  eq(M.readLayers(null).length, 3, "nothing saved: the defaults");
}

// ── 6 · MICRO-GLOBO-INTERAZIONE p.1 · the site's height, applied once ─────────
{
  // the GT16: the shift file says z 500, the models stand at 491–495 m (their glTF nodes carry 495.2)
  const gt = M.siteHeight(500, { minY: 491.2, maxY: 495.3 });
  eq([gt.applied, gt.h, gt.reason, gt.reference], ["coords", 0, "near-shift", "orthometric"], "GT16: the z is already in the models — not added again");
  const sh = M.siteHeight(500, { minY: -4, maxY: 12 });
  eq([sh.applied, sh.h, sh.reason], ["shift", 500, "near-zero"], "a model made by subtracting the shift (near 0): the z is added");
  eq(M.siteHeight(500, { minY: 489.25, maxY: 587.56 }).applied, "coords", "GT16 with the survey's tileset (its declared box up to 587 m): still in the models");
  eq(M.siteHeight(0.12, { minY: 489.25, maxY: 587.56 }).applied, "shift", "a small z (the 2015 estimate, 0.12 m) is simply added");
  eq(M.siteHeight(500, null).reason, "no-content", "no model yet: wait (the shift's z meanwhile)");
  eq(M.siteHeight(0, { minY: 3, maxY: 9 }).reason, "no-z", "no z: nothing to decide");
  eq([M.siteHeight(500, { minY: 491, maxY: 495 }, "shift").applied, M.siteHeight(500, { minY: -1, maxY: 1 }, "coords").h], ["shift", 0], "the person's choice wins");
  eq(M.siteHeight(500, { minY: 491, maxY: 495 }, "auto", false).applied, "shift", "the geo_position's word wins over the rule");
  // applied once: the origin at 0, the models at their own 491–495 m; the CRS scaled at the site's height
  const a = { lon: 22.789207886221057, lat: 45.51388980543227, h: gt.h, siteH: gt.h + gt.contentMid, azimuth: -1.584, scale: 1.0000337 };
  // (5.5 cm over: the frame's one scale is the grid's, horizontal, applied to the heights too)
  near(M.localToLonLat(a, [0, 493.25, 0]).h, 493.25, 0.06, "a model at y 493.25 is at 493.25 m (once), not 993.25");
  near(M.crsScale(a), 1.0000337 * (1 + 493.25 / 6378137), 1e-9, "the CRS's metres scaled at the site's height, not the origin's");
}

console.log(`geoglobe: ${checks} checks passed${py ? "" : " (no s3Dgraphy venv: PROJ comparisons skipped)"}`);
