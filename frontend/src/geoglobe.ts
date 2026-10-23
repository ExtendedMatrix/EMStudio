/**
 * MICRO-GEOGLOBO · the globe of the Space — pure.
 *
 * One georeferenced scene (E.D., 21 Oct 2026): the Space seen from far away is
 * the globe, seen from above it is the plan, from close it is the site. No
 * second WebGL engine: three.js and `3d-tiles-renderer` (0.5.3) already in
 * EMStudio draw the ellipsoid, the terrain (Terrarium) and the images on it
 * (`globe3d.ts`). What lives here is what can be decided without a GPU, and is
 * checked in node (`scripts/check-geoglobe.mjs`):
 *
 *   · THE SOURCES, each with its licence and terms read on the source's own
 *     page (the report says where), and whether «Estrai area» may copy it: the
 *     OpenStreetMap tile servers forbid any download for offline use, so OSM is
 *     online only;
 *   · THE BUDGET, after osiris (`docs/terrain-local-review.md`): terrain only
 *     from the site's zoom, few requests at a time, a memory ceiling, a pixel
 *     ratio ceiling;
 *   · THE FRAME. One frame for everything: east-north-up with its origin on
 *     the site's anchor, in three's axes (x east, y up, z south — the frame a
 *     glTF from Blender's scene lands in, `export_yup`). The globe is the
 *     ellipsoid PUT INTO that frame (its group carries the inverse of the
 *     site's ENU frame), so the site's models never leave their own small
 *     coordinates and nothing jumps when the camera goes from the globe to the
 *     site: only the controls change hands. The geodetic → ECEF formula is
 *     closed and exact; the reprojection from the project's EPSG is PROJ's
 *     (the bridge, `/geo/frame`), never guessed here (geo.ts's rule);
 *   · THE CAMERA MODES (globe, plan, site), the passage between them by the
 *     altitude with a hysteresis, and the flight «Vai al sito»;
 *   · THE TILES: a tile of a lon/lat, the tiles of a box, what an extract
 *     costs;
 *   · THE LAYERS of the Space (basemaps, terrain, rasters): order, opacity,
 *     visibility, kept per person and per document like the overlays, never
 *     in the em.json.
 */

export type V3 = [number, number, number];

// ── the sources ─────────────────────────────────────────────────────────────

export type SourceKind = "imagery" | "terrain";

export interface GeoSource {
  id: string;
  kind: SourceKind;
  /** a short name, the panel's */
  label: string;
  /** XYZ template, `{z}/{x}/{y}` (the WMTS of EOX in its GoogleMapsCompatible
   *  matrix is the same grid: TileMatrix/TileRow/TileCol = z/y/x) */
  url: string;
  minZoom: number;
  /** the deepest level with content (measured on the GT16's place, 23 Oct) */
  maxZoom: number;
  tileSize: 256 | 512;
  /** what each tile is */
  format: "jpg" | "png" | "webp";
  /** the line shown in the scene, bottom right */
  attribution: string;
  licence: string;
  licenceUrl: string;
  /** may «Estrai area» copy it into a project (the source's terms, not ours) */
  offline: boolean;
  /** why not, or under which condition */
  offlineNote: string;
  /** Terrarium: elevation = R·256 + G + B/256 − 32768 */
  encoding?: "terrarium";
  /** a PMTiles of the whole planet the source publishes (range reads) */
  planet?: string;
}

export const SOURCES: GeoSource[] = [
  {
    id: "s2cloudless-2016",
    kind: "imagery",
    label: "Sentinel-2 cloudless 2016 (EOX)",
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
    minZoom: 0,
    maxZoom: 15,
    tileSize: 256,
    format: "jpg",
    attribution: "Sentinel-2 cloudless 2016 © EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    offline: true,
    offlineNote: "CC BY 4.0: copying is allowed with the attribution; later years (2018–2025) are CC BY-NC-SA and are left out",
  },
  {
    id: "osm",
    kind: "imagery",
    label: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    format: "png",
    attribution: "© OpenStreetMap contributors (ODbL)",
    licence: "ODbL 1.0 (data), CC BY-SA 2.0 (tiles)",
    licenceUrl: "https://www.openstreetmap.org/copyright",
    offline: false,
    offlineNote: "the OSMF tile usage policy forbids «download for offline» and any prefetch: online only",
  },
  {
    id: "mapterhorn",
    kind: "terrain",
    label: "Mapterhorn (Copernicus GLO-30 + open national DEMs)",
    url: "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp",
    minZoom: 0,
    maxZoom: 16,
    tileSize: 512,
    format: "webp",
    encoding: "terrarium",
    planet: "https://download.mapterhorn.com/planet.pmtiles",
    attribution: "Terrain © Mapterhorn — Copernicus GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the EU and ESA, and national open DEMs (mapterhorn.com/attribution)",
    licence: "open data, per source (Copernicus full free and open licence; national CC BY 4.0 / OGL); code BSD-3",
    licenceUrl: "https://mapterhorn.com/attribution",
    offline: true,
    offlineNote: "Mapterhorn publishes its PMTiles for download; the attribution goes with the copy",
  },
  {
    id: "aws-terrarium",
    kind: "terrain",
    label: "Terrain Tiles (AWS Open Data, Mapzen)",
    url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 15,
    tileSize: 256,
    format: "png",
    encoding: "terrarium",
    attribution: "Terrain Tiles (AWS Open Data): SRTM, GMTED2010 and 3DEP courtesy of the U.S. Geological Survey; EU-DEM produced using Copernicus data; ETOPO1 NOAA; and others (github.com/tilezen/joerd attribution)",
    licence: "per source, attribution required (tilezen/joerd attribution.md)",
    licenceUrl: "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
    offline: true,
    offlineNote: "open data on AWS: copying is allowed with the attribution list",
  },
];

export const DEFAULT_IMAGERY = "s2cloudless-2016";
export const DEFAULT_TERRAIN = "mapterhorn";

export function sourceById(id: string): GeoSource | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** A source's tile, by its template. */
export function tileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** Where the scene asks a source's tiles: through the bridge when there is
 *  one (its disk cache, the project's PMTiles first, the globe minimum), else
 *  the source itself. `pkg`: the project's folder of packages. */
export function tileTemplate(src: GeoSource, bridge: string | null, pkg?: string | null): string {
  if (!bridge) return src.url;
  const q = pkg ? `?pkg=${encodeURIComponent(pkg)}` : "";
  // the extension: the tiles renderer reads a tile's kind from its URL
  return `${bridge.replace(/\/$/, "")}/tiles/xyz/${src.id}/{z}/{x}/{y}.${src.format}${q}`;
}

// ── the budget (osiris, `docs/terrain-local-review.md`, adapted) ───────────

export const BUDGET = {
  /** below this tile level the terrain is FLAT: no elevation tile is asked
   *  (osiris: terrain active only from zoom 10) */
  terrainMinZoom: 10,
  /** the deepest terrain level asked (Mapterhorn's 512 px tiles: z14 ≈ 4.7 m a
   *  pixel at 45°; osiris stops at z10 with 256 px) */
  terrainMaxZoom: 14,
  /** downloads at the same time, per queue (tiles; each image overlay) —
   *  osiris 2 for MapLibre; 4 here because the terrain and the image are two
   *  queues and the browser keeps six connections a host */
  maxJobs: 4,
  /** the tiles' memory ceiling (three's own byte count of geometry and
   *  textures), and the size the LRU goes back to */
  lruMaxBytes: 320 * 1024 * 1024,
  lruMinBytes: 192 * 1024 * 1024,
  /** the pixel ratio while the globe is drawn (osiris 1.5) */
  maxPixelRatio: 1.5,
  /** the screen-space error the terrain refines to, in pixels */
  errorTarget: 2,
  /** the resolution of the textures the overlays compose per tile */
  overlayResolution: 256,
} as const;

// ── the frame ───────────────────────────────────────────────────────────────

/** WGS84 (the ellipsoid 3d-tiles-renderer draws) */
export const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
const E2 = WGS84.f * (2 - WGS84.f);
const D2R = Math.PI / 180;

/** geodetic (degrees, metres on the ellipsoid) → ECEF metres */
export function geodeticToEcef(lonDeg: number, latDeg: number, h: number): V3 {
  const lat = latDeg * D2R, lon = lonDeg * D2R;
  const s = Math.sin(lat), c = Math.cos(lat);
  const N = WGS84.a / Math.sqrt(1 - E2 * s * s);
  return [(N + h) * c * Math.cos(lon), (N + h) * c * Math.sin(lon), (N * (1 - E2) + h) * s];
}

/** ECEF → geodetic (Bowring, then two iterations: sub-millimetre on the ground) */
export function ecefToGeodetic(p: V3): { lon: number; lat: number; h: number } {
  const [x, y, z] = p;
  const lon = Math.atan2(y, x);
  const r = Math.hypot(x, y);
  let lat = Math.atan2(z, r * (1 - E2));
  let h = 0;
  for (let i = 0; i < 5; i++) {
    const s = Math.sin(lat);
    const N = WGS84.a / Math.sqrt(1 - E2 * s * s);
    h = r / Math.cos(lat) - N;
    lat = Math.atan2(z, r * (1 - (E2 * N) / (N + h)));
  }
  return { lon: lon / D2R, lat: lat / D2R, h };
}

/** east, north, up of a place, in ECEF */
export function enuAxes(lonDeg: number, latDeg: number): { e: V3; n: V3; u: V3 } {
  const lat = latDeg * D2R, lon = lonDeg * D2R;
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  return { e: [-so, co, 0], n: [-sl * co, -sl * so, cl], u: [cl * co, cl * so, sl] };
}

/**
 * The site's anchor, as the bridge measures it from the GeoPositionNode
 * (`/geo/frame`, pyproj): where the scene's origin is on the ellipsoid, and
 * which way its +y (the CRS's grid north, turned by the node's `rotation`)
 * points, clockwise from true north. `h` is the shift's z, an ORTHOMETRIC
 * height: the terrain tiles are orthometric too and are drawn as if it were
 * ellipsoidal, so the two agree with each other (the geoid, ~40 m in Romania,
 * shifts both alike).
 */
export interface SiteAnchor {
  lon: number;
  lat: number;
  h: number;
  /** degrees, clockwise from true north, of the scene's +y */
  azimuth: number;
  /** the CRS's scale at the anchor (a local metre is `scale` true metres) */
  scale?: number;
  epsg?: number;
}

/** column-major 4×4 (three's `Matrix4.fromArray`) */
export type M4 = number[];

/**
 * How many true metres a metre of the scene is. The scene's metres are the
 * CRS's (the models are the CRS's coordinates minus the shift): a projected
 * grid's metre is not a metre on the ground (its scale factor, `scale`, measured
 * by the bridge: 1.0000337 at the GT16) and the ground is `h` over the ellipsoid
 * the grid is drawn on (500 m: ×1.0000784). Measured before this (23 Oct): a
 * point 100 m east in EPSG:31700 fell at 100.011 m of the scene — 11 cm a km.
 */
export function crsScale(a: SiteAnchor): number {
  return (a.scale ?? 1) * (1 + a.h / WGS84.a);
}

/**
 * The site frame: local three coordinates (x east, y up, z south — turned by
 * the azimuth, in the CRS's metres) → ECEF. Its inverse is the matrix of the
 * globe's group.
 */
export function siteFrame(a: SiteAnchor): M4 {
  const { e, n, u } = enuAxes(a.lon, a.lat);
  const az = a.azimuth * D2R;
  // the scene's +y (grid north turned) and +x, in ECEF
  const yN: V3 = [Math.cos(az) * n[0] + Math.sin(az) * e[0], Math.cos(az) * n[1] + Math.sin(az) * e[1], Math.cos(az) * n[2] + Math.sin(az) * e[2]];
  const xE: V3 = [Math.cos(az) * e[0] - Math.sin(az) * n[0], Math.cos(az) * e[1] - Math.sin(az) * n[1], Math.cos(az) * e[2] - Math.sin(az) * n[2]];
  const o = geodeticToEcef(a.lon, a.lat, a.h);
  const k = crsScale(a);
  // three: X = xE, Y = up, Z = −yN (export_yup: data y → −z); a scene metre is k true metres
  return [xE[0] * k, xE[1] * k, xE[2] * k, 0, u[0] * k, u[1] * k, u[2] * k, 0, -yN[0] * k, -yN[1] * k, -yN[2] * k, 0, o[0], o[1], o[2], 1];
}

/** the inverse of a similarity 4×4 (rotation × a uniform scale + translation) */
export function invertRigid(m: M4): M4 {
  const k2 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];   // the scale, squared
  const r = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]].map((v) => v / k2);
  const t = [m[12], m[13], m[14]];
  // Rᵀ / k
  const c0 = [r[0], r[3], r[6]], c1 = [r[1], r[4], r[7]], c2 = [r[2], r[5], r[8]];
  const tt = [-(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2])];
  return [c0[0], c0[1], c0[2], 0, c1[0], c1[1], c1[2], 0, c2[0], c2[1], c2[2], 0, tt[0], tt[1], tt[2], 1];
}

export function applyM4(m: M4, p: V3): V3 {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}

/** a place → the scene's local three coordinates */
export function lonLatToLocal(a: SiteAnchor, lon: number, lat: number, h: number): V3 {
  return applyM4(invertRigid(siteFrame(a)), geodeticToEcef(lon, lat, h));
}

/** a local three point → lon/lat/h */
export function localToLonLat(a: SiteAnchor, p: V3): { lon: number; lat: number; h: number } {
  return ecefToGeodetic(applyM4(siteFrame(a), p));
}

/** the Earth's centre in the scene */
export function earthCentreLocal(a: SiteAnchor): V3 {
  return applyM4(invertRigid(siteFrame(a)), [0, 0, 0]);
}

/** the camera's height above the ellipsoid, from its local position */
export function altitudeOf(a: SiteAnchor, p: V3): number {
  return localToLonLat(a, p).h;
}

// ── the camera modes ────────────────────────────────────────────────────────

export type GeoMode = "globe" | "plan" | "site";

export const MODE_ALT = {
  /** coming down from the globe, under this height above the site (and near
   *  it) the site's hands take the camera */
  siteEnter: 3000,
  /** going up from the site, over this height the globe's hands take it */
  globeEnter: 30000,
  /** «near the site»: the ground distance the passage is measured within */
  siteRadius: 25000,
} as const;

/**
 * The automatic passage: globe → site under `siteEnter` near the site; site
 * (or plan) → globe over `globeEnter`. Between the two heights the mode stays
 * (the hysteresis): no flicker on a slow zoom. A mode chosen by hand stays
 * until the camera crosses the far threshold of the other.
 */
export function autoMode(current: GeoMode, altitude: number, groundDistance: number): GeoMode {
  if (current === "globe") {
    return altitude < MODE_ALT.siteEnter && groundDistance < MODE_ALT.siteRadius ? "site" : "globe";
  }
  return altitude > MODE_ALT.globeEnter ? "globe" : current;
}

/** spherical interpolation of two directions (unit vectors) */
function slerp(a: V3, b: V3, t: number): V3 {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const w = Math.acos(d);
  if (w < 1e-9) return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const s = Math.sin(w);
  const ka = Math.sin((1 - t) * w) / s, kb = Math.sin(t * w) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

/**
 * «Vai al sito»: a point of the flight at `t` ∈ [0, 1], around the Earth and
 * never through it. The position turns about the Earth's centre (great
 * circle) and its distance from it goes as a smooth ease; the height
 * rises in the middle when the two ends are far apart (a hop, as a globe's
 * fly-to does), so the camera sees where it goes.
 */
export function flyAt(from: { pos: V3; target: V3 }, to: { pos: V3; target: V3 }, centre: V3, t: number): { pos: V3; target: V3 } {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const e = t * t * (3 - 2 * t);
  const one = (a: V3, b: V3, hop: number): V3 => {
    const ra = sub(a, centre), rb = sub(b, centre);
    const la = len(ra), lb = len(rb);
    const da = scale(ra, 1 / la), db = scale(rb, 1 / lb);
    const ang = Math.acos(Math.max(-1, Math.min(1, da[0] * db[0] + da[1] * db[1] + da[2] * db[2])));
    // the hop: a fraction of the arc's length, highest in the middle
    const lift = hop * ang * WGS84.a * 0.25 * Math.sin(Math.PI * e);
    const r = la + (lb - la) * e + lift;
    return add(centre, scale(slerp(da, db, e), r));
  };
  // the target is a point looked at, never passed through: a straight line
  // (the globe's target is the Earth's centre, which has no direction of its own)
  const tg: V3 = [from.target[0] + (to.target[0] - from.target[0]) * e, from.target[1] + (to.target[1] - from.target[1]) * e,
    from.target[2] + (to.target[2] - from.target[2]) * e];
  return { pos: one(from.pos, to.pos, 1), target: tg };
}

/** the flight's length, ms: longer when it goes far (none with «Reduce motion») */
export function flyMs(from: V3, to: V3, centre: V3): number {
  const a = sub(from, centre), b = sub(to, centre);
  const ang = Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b)))));
  const zoom = Math.abs(Math.log10(Math.max(1, len(a) - WGS84.a)) - Math.log10(Math.max(1, len(b) - WGS84.a)));
  return Math.round(Math.min(3000, 600 + ang * 1500 + zoom * 350));
}

// ── the tiles ───────────────────────────────────────────────────────────────

export const MERC_MAX_LAT = 85.0511287798066;

/** the XYZ tile of a place (Web Mercator) */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const la = Math.max(-MERC_MAX_LAT, Math.min(MERC_MAX_LAT, lat)) * D2R;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan(la)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** a tile's box, lon/lat: [west, south, east, north] */
export function tileBounds(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z;
  const lon = (i: number) => (i / n) * 360 - 180;
  const lat = (j: number) => Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) / D2R;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}

export type BBox = [number, number, number, number];

/** the tiles of a box at a zoom: the x and y ranges, inclusive */
export function bboxTileRange(b: BBox, z: number): { x0: number; x1: number; y0: number; y1: number; n: number } {
  const a = lonLatToTile(b[0], b[3], z), c = lonLatToTile(b[2], b[1], z);
  const n = (c.x - a.x + 1) * (c.y - a.y + 1);
  return { x0: a.x, x1: c.x, y0: a.y, y1: c.y, n };
}

/** how many tiles an extract asks, levels `zmin`…`zmax` */
export function extractTileCount(b: BBox, zmin: number, zmax: number): number {
  let n = 0;
  for (let z = zmin; z <= zmax; z++) n += bboxTileRange(b, z).n;
  return n;
}

/** the ceiling of one extract (a district, not a country): over it the panel
 *  asks for a smaller box or a lower zoom */
export const EXTRACT_MAX_TILES = 40000;

/** the zoom a box is fully seen at in about `px` pixels (the extract's default) */
export function zoomForBox(b: BBox, px = 1024, tileSize = 256): number {
  const w = Math.max(1e-9, (b[2] - b[0]) / 360);
  return Math.max(0, Math.min(18, Math.floor(Math.log2(px / tileSize / w))));
}

/** a box of `half` metres around a place (the extract's default: the site) */
export function boxAround(lon: number, lat: number, half: number): BBox {
  const dLat = half / 111320;
  const dLon = half / (111320 * Math.max(0.01, Math.cos(lat * D2R)));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

// ── the layers ──────────────────────────────────────────────────────────────

export interface GeoLayer {
  id: string;
  kind: "imagery" | "terrain" | "raster";
  /** the source (imagery, terrain) */
  source?: string;
  name: string;
  visible: boolean;
  /** 0…1 */
  opacity: number;
  /** a raster: its PMTiles (3857, made by the bridge at import), its box,
   *  its original (the document), what it is */
  url?: string;
  path?: string;
  original?: string;
  bounds?: BBox;
  raster?: "image" | "dem";
  minZoom?: number;
  maxZoom?: number;
  /** a raster on a plane at the site's height rather than on the terrain */
  plane?: boolean;
}

/** The layers as the panel lists them: the TOP first (drawn last, over the
 *  others), as a GIS's layer panel does; the terrain is the surface they lie on. */
export function defaultLayers(): GeoLayer[] {
  return [
    { id: "base:osm", kind: "imagery", source: "osm", name: sourceById("osm")!.label, visible: false, opacity: 1 },
    { id: "base:" + DEFAULT_IMAGERY, kind: "imagery", source: DEFAULT_IMAGERY, name: sourceById(DEFAULT_IMAGERY)!.label, visible: true, opacity: 1 },
    { id: "terrain:" + DEFAULT_TERRAIN, kind: "terrain", source: DEFAULT_TERRAIN, name: sourceById(DEFAULT_TERRAIN)!.label, visible: true, opacity: 1 },
  ];
}

/** the image layers in DRAWING order: the list's last first (under), its first last (over) */
export function imageOrder(layers: GeoLayer[]): GeoLayer[] {
  return layers.filter((l) => l.kind !== "terrain").reverse();
}

/** a layer one place up (−1: over the one above it) or down (+1) in the list */
export function moveLayer(layers: GeoLayer[], id: string, delta: -1 | 1): GeoLayer[] {
  const i = layers.findIndex((l) => l.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= layers.length) return layers;
  const out = layers.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function setLayer(layers: GeoLayer[], id: string, patch: Partial<GeoLayer>): GeoLayer[] {
  return layers.map((l) => (l.id === id ? { ...l, ...patch, ...(patch.opacity !== undefined ? { opacity: Math.max(0, Math.min(1, patch.opacity)) } : {}) } : l));
}

/** the attribution line: the sources of the layers shown, once each */
export function attributionOf(layers: GeoLayer[]): string[] {
  const out: string[] = [];
  for (const l of layers) {
    if (!l.visible) continue;
    const s = l.source ? sourceById(l.source) : undefined;
    const a = s?.attribution;
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}

/** the layers of a document, read back (a list from an older version keeps
 *  what it can, and the default basemaps it lacks are added at the end) */
export function readLayers(raw: unknown): GeoLayer[] {
  const def = defaultLayers();
  if (!Array.isArray(raw)) return def;
  const ok = raw.filter((l): l is GeoLayer => !!l && typeof l === "object" && typeof (l as GeoLayer).id === "string"
    && ["imagery", "terrain", "raster"].includes((l as GeoLayer).kind));
  for (const d of def) if (!ok.some((l) => l.id === d.id)) ok.push(d);
  return ok;
}

/** the key of a document's layers in the person's local preferences */
export function layersKey(person: string | null | undefined, docKey: string): string {
  return `emstudio.geo.${person || "anon"}.${docKey}`;
}
