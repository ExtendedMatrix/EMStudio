/**
 * G1 — what the graph says about where it is, and how to get that onto a map.
 *
 * Two things live here, and neither is the map widget itself (that is
 * `osm-map.ts`):
 *
 *  1. **Reading the anchor.** The graph carries ONE GeoPositionNode — one per
 *     graph, not per epoch — with `epsg`, `shift_x/y/z` and (new in 1.6.1) a
 *     `rotation` azimuth. The shift is the origin of the scene-local frame
 *     expressed in that CRS: it is the anchor, *not the position*, and may sit
 *     hundreds of metres from the monument.
 *  2. **Reprojecting.** Two frames we can do exactly, in closed form, with no
 *     dependency and no round trip: 4326 (the shifts already ARE lon/lat) and
 *     3857 (Web Mercator metres — the tile grid itself). Everything else — every
 *     UTM zone, every national grid, i.e. **the normal case on an excavation** —
 *     needs PROJ, and PROJ is asked for over the bridge (`POST /reproject` →
 *     s3Dgraphy `api.reproject` → pyproj).
 *
 * Why not a datum library in TypeScript: because getting it subtly wrong is
 * invisible. A transverse-Mercator series with a typo still returns plausible
 * degrees, and the marker lands 300 m away — or a hemisphere away — with the
 * same confident dot. There is one implementation, it is the one with PROJ
 * inside it, and if it cannot be reached this module says so instead of
 * guessing. That refusal is a feature and it is tested.
 */

/** Injected once by `main.ts`, which owns the endpoint precedence. */
let resolveBridge: (() => Promise<string>) | null = null;

import { t } from "./i18n";

export function setBridgeResolver(fn: () => Promise<string>): void {
  resolveBridge = fn;
}

/** The frames we can convert without asking anybody. */
const LOCAL_FRAMES = new Set([4326, 3857, 900913, 3785]);

export interface GeoAnchor {
  epsg: number;
  /** Scene-local origin, in the CRS units of `epsg`. */
  x: number;
  y: number;
  z: number;
  /** Scene azimuth in degrees, clockwise from north. 0 = north up. */
  rotation: number;
}

/** What a `map` embed can show, or precisely why it cannot (yet). */
export type GeoRef =
  | { ok: true; lat: number; lon: number; epsg: number; rotation: number;
      note?: string }
  | { ok: false; reason: "no-coordinates" }
  | { ok: false; reason: "needs-reprojection"; anchor: GeoAnchor }
  | { ok: false; reason: "reprojection-unavailable"; anchor: GeoAnchor;
      detail: string };

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Spherical Mercator metres → degrees. Exact, closed form, no library. */
function webMercatorToWgs84(x: number, y: number): { lat: number; lon: number } {
  const R = 6378137;
  return {
    lon: (x / R) * (180 / Math.PI),
    lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
  };
}

/**
 * Read a position off a GeoPositionNode's `data`, honestly.
 *
 * An explicit `lat`/`lon` wins if some producer wrote one — it is unambiguous.
 * Otherwise the shifts are read in the frame `epsg` names: converted here when
 * that frame is 4326 or 3857, and handed on as `needs-reprojection` otherwise so
 * the caller can ask the bridge. Nothing is ever *assumed* to be degrees.
 */
export function geoOf(data: Record<string, unknown>): GeoRef {
  const rotation = num(data.rotation) ?? 0;
  const lat = num(data.lat ?? data.latitude);
  const lon = num(data.lon ?? data.lng ?? data.longitude);
  if (lat !== null && lon !== null && (lat !== 0 || lon !== 0))
    return { ok: true, lat, lon, epsg: 4326, rotation };

  // DEV29 · an ABSENT epsg is «not georeferenced» (s3Dgraphy dev29 A6: new
  // graphs and imported GraphML carry a GeoPositionNode without one), never
  // «WGS84 at the shift»: shifts in an undeclared frame place nothing
  const epsg = num(data.epsg);
  if (epsg === null) return { ok: false, reason: "no-coordinates" };
  const x = num(data.shift_x);
  const y = num(data.shift_y);
  const z = num(data.shift_z) ?? 0;
  if (x === null || y === null || (x === 0 && y === 0))
    return { ok: false, reason: "no-coordinates" };

  if (epsg === 4326) return { ok: true, lat: y, lon: x, epsg, rotation };
  if (LOCAL_FRAMES.has(epsg)) {
    const { lat: la, lon: lo } = webMercatorToWgs84(x, y);
    return {
      ok: true, lat: la, lon: lo, epsg, rotation,
      note: `riproiettato da EPSG:${epsg}`,
    };
  }
  return { ok: false, reason: "needs-reprojection",
           anchor: { epsg, x, y, z, rotation } };
}

/** True when this reference still needs PROJ to become degrees. */
export function needsBridge(geo: GeoRef): boolean {
  return !geo.ok && geo.reason === "needs-reprojection";
}

/**
 * GEO1 · the SITE POSITION — a symbolic lon/lat point for "where the site is on
 * the map". This is NOT the shift: the shift (`GeoPositionNode`) is the 3D
 * anchor/origin and is untouched here. The site position is graph-scope
 * metadata stored on the graph-self node's `data.site_position`
 * (`{ lon, lat, crs }`, DP-65 / MIG1-A). Returns `null` when the graph is not
 * positioned — NEVER a fabricated 0/0 (BUGFIX-EPOCH lesson). Consumed by the
 * narrative mini-map and the graph overview.
 */
export interface SitePosition {
  lon: number;
  lat: number;
  /** CRS of the point; site positions are authored in WGS84. */
  crs: string;
}

export function readSitePosition(doc: unknown): SitePosition | null {
  const graph = (doc as { graph?: { nodes?: Array<Record<string, unknown>> } })
    ?.graph;
  const nodes = graph?.nodes;
  if (!Array.isArray(nodes)) return null;
  const root = nodes.find((n) => n.node_type === "graph");
  const sp = (root?.data as Record<string, unknown> | undefined)?.site_position as
    | Record<string, unknown>
    | undefined;
  if (!sp) return null;
  const lon = num(sp.lon ?? sp.lng ?? sp.longitude);
  const lat = num(sp.lat ?? sp.latitude);
  if (lon === null || lat === null) return null;
  return { lon, lat, crs: typeof sp.crs === "string" ? sp.crs : "EPSG:4326" };
}

export interface ReprojectResult {
  points: [number, number][];
}

/**
 * Ask the bridge to convert points from `epsgSource` to WGS84.
 *
 * Returns `null` — never a guess — when the bridge is unreachable or answers 501
 * (the `[geo]` extra is not installed). The caller shows the coordinates and the
 * frame instead, which is the honest fallback N9 established and G1 keeps.
 */
export async function reprojectToWgs84(
  points: [number, number][],
  epsgSource: number,
): Promise<{ points: [number, number][] } | { error: string }> {
  if (!resolveBridge) return { error: t("geo.noBridge") };
  try {
    const base = await resolveBridge();
    const res = await fetch(`${base}/reproject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points, epsg_source: epsgSource,
                             epsg_target: 4326 }),
    });
    if (!res.ok) {
      let detail = `bridge ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) detail = String(j.error);
      } catch {
        /* non-JSON body */
      }
      // 501 is the one worth naming: it is not a failure, it is a missing extra.
      if (res.status === 501)
        detail = "pyproj non installato nel bridge (extra [geo])";
      return { error: detail };
    }
    const j = (await res.json()) as { points?: [number, number][] };
    if (!j.points?.length) return { error: t("geo.noPoints") };
    return { points: j.points };
  } catch {
    return { error: t("bridge.unreachable") };
  }
}

/** One point, for the common case. */
export async function reprojectPoint(
  x: number, y: number, epsgSource: number,
): Promise<{ lat: number; lon: number } | { error: string }> {
  const out = await reprojectToWgs84([[x, y]], epsgSource);
  if ("error" in out) return out;
  const [lon, lat] = out.points[0];
  return { lat, lon };
}

// ── the scene, posed on the ground (G3) ───────────────────────────────────────

/** A scene placed in WGS84: where it is, how big it is, which way it faces. */
export interface PlacedScene {
  /** The footprint ring, lon/lat, SW → SE → NE → NW. */
  corners: [number, number][];
  /** The centroid, lon/lat — where the marker belongs. */
  centroid: [number, number];
  /** Scene azimuth, degrees clockwise from north (0 = north up). */
  rotation: number;
  /** Local extent in CRS units (metres), for a caption degrees cannot state. */
  width: number;
  height: number;
  epsgSource: number;
}

/**
 * Ask the bridge to pose the whole scene: rotate → shift → reproject.
 *
 * `null` when the graph carries no geometry to place — which is the common case
 * and not a failure: an EM graph holds spatial proxies only where somebody made
 * them. `{error}` when the op could not run at all. A footprint is never
 * synthesised from nothing here or anywhere: a bounding box nobody measured
 * would be a fabrication drawn at metre precision.
 */
export async function georeferenceScene(
  doc: unknown,
): Promise<PlacedScene | null | { error: string }> {
  if (!resolveBridge) return { error: t("geo.noBridge") };
  try {
    const base = await resolveBridge();
    const res = await fetch(`${base}/georeference-scene`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc }),
    });
    if (!res.ok) {
      let detail = `bridge ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) detail = String(j.error);
      } catch {
        /* non-JSON body */
      }
      if (res.status === 501)
        detail = "pyproj non installato nel bridge (extra [geo])";
      return { error: detail };
    }
    const j = (await res.json()) as {
      extent?: { min_x: number; min_y: number; max_x: number; max_y: number } | null;
      corners?: [number, number][];
      centroid?: [number, number];
      rotation?: number;
      epsg_source?: number;
    };
    if (!j.extent || !j.corners?.length || !j.centroid) return null;
    return {
      corners: j.corners,
      centroid: j.centroid,
      rotation: j.rotation ?? 0,
      width: j.extent.max_x - j.extent.min_x,
      height: j.extent.max_y - j.extent.min_y,
      epsgSource: j.epsg_source ?? 4326,
    };
  } catch {
    return { error: t("bridge.unreachable") };
  }
}
