/**
 * MICRO-GEOREF-GRAFO · the georeference of a graph, read and written as a node.
 *
 * The GeoPositionNode (`geo_position`) is ONE per graph: a CRS (`epsg`), an
 * origin of the scene's metres in it (`shift_x/y/z`, the anchor — it may stand
 * outside the monument), the scene's azimuth (`rotation`, clockwise from the
 * grid north of the CRS: `rotation_reference: "grid"`) and, written here, the
 * vertical reference of the heights (`vertical_reference`: `orthometric`, the
 * default and what the globe draws, or `ellipsoidal`). The map's pin
 * (`site_position` on the graph's own node) is another thing: where the site
 * is, for a map — the models' centre, not the shift.
 *
 * Pure: what the Inspector shows and proposes, checked in node
 * (`check-georef.mjs`). PROJ's answers (the CRS's name, a deprecated code and
 * its replacement, the accuracy of a transformation) come from the bridge; the
 * decisions taken on them are here.
 */

type T = (k: string, v?: Record<string, string>) => string;

function num(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** the EPSG code a node's data declares, or null («EPSG:3844», «3844», 3844) */
export function epsgOf(data: Record<string, unknown>): number | null {
  const raw = data.epsg;
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/^EPSG:+/i, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type VerticalReference = "orthometric" | "ellipsoidal";
export const VERTICAL_REFERENCES: VerticalReference[] = ["orthometric", "ellipsoidal"];

export function verticalOf(data: Record<string, unknown>): VerticalReference {
  return data.vertical_reference === "ellipsoidal" ? "ellipsoidal" : "orthometric";
}

/** a coordinate as written in a SHIFT.txt and in the panel: no exponent, no float noise */
export function fmtCoord(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
}

/** «EPSG:3844 · 327372.56, 448682.65, 0» — the node's tooltip, the Inspector's line */
export function georefSummary(data: Record<string, unknown>, t?: T): string {
  const epsg = epsgOf(data);
  const x = num(data.shift_x) ?? 0, y = num(data.shift_y) ?? 0, z = num(data.shift_z) ?? 0;
  const rot = num(data.rotation) ?? 0;
  if (epsg === null) return t ? t("georef.undeclared") : "no CRS declared";
  return `EPSG:${epsg} · ${fmtCoord(x)}, ${fmtCoord(y)}, ${fmtCoord(z)}`
    + (rot ? ` · ${fmtCoord(rot)}°` : "");
}

/** The line of a SHIFT.txt, as EM Tools and 3DSC write it: `EPSG::3844 327372.56 448682.65 0` */
export function formatShiftTxt(data: Record<string, unknown>): string | null {
  const epsg = epsgOf(data);
  if (epsg === null) return null;
  return `EPSG::${epsg} ${fmtCoord(num(data.shift_x) ?? 0)} ${fmtCoord(num(data.shift_y) ?? 0)} ${fmtCoord(num(data.shift_z) ?? 0)}\n`;
}

/** A SHIFT.txt read as s3Dgraphy's `api.read_shift` reads it (the same pattern:
 *  the first line that reads as a shift; z 0 when the file has none — E.D.'s rule)
 *  — the bridge's reading is the one used; this one says what a file holds when
 *  there is no bridge, and the checks compare the two. */
export function parseShiftTxt(text: string): { epsg: number; shift_x: number; shift_y: number; shift_z: number; zGiven: boolean } | null {
  const N = "([-+]?\\d+(?:\\.\\d*)?(?:[eE][-+]?\\d+)?)";
  const re = new RegExp(`^\\s*EPSG\\s*:{1,2}\\s*(\\d+)[\\s,;]+${N}[\\s,;]+${N}(?:[\\s,;]+${N})?`, "i");
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const m = re.exec(line);
    if (m) return { epsg: Number(m[1]), shift_x: Number(m[2]), shift_y: Number(m[3]), shift_z: m[4] ? Number(m[4]) : 0, zGiven: !!m[4] };
  }
  return null;
}

/**
 * A point of the scene (the DATA's axes: x east, y the grid's north, metres of
 * the CRS) → the CRS: rotated by the azimuth (clockwise from the grid north,
 * s3Dgraphy's `georeference_scene`), then the shift added.
 */
export function localToCrs(data: Record<string, unknown>, x: number, y: number): [number, number] {
  const th = ((num(data.rotation) ?? 0) * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  return [x * c + y * s + (num(data.shift_x) ?? 0), -x * s + y * c + (num(data.shift_y) ?? 0)];
}

/** The centre of a box of the Space (three's axes: y up, z = −data y) in the data's x, y */
export function boxCentreData(box: [[number, number, number], [number, number, number]]): [number, number] {
  return [(box[0][0] + box[1][0]) / 2, -(box[0][2] + box[1][2]) / 2];
}

/** The distance in the CRS's metres between the shift (the scene's origin) and a CRS point */
export function distanceFromShift(data: Record<string, unknown>, X: number, Y: number): number {
  return Math.hypot(X - (num(data.shift_x) ?? 0), Y - (num(data.shift_y) ?? 0));
}

/** What the bridge says of a CRS (`/geo/crs-info`, PROJ's database) */
export interface CrsInfo {
  ok: boolean;
  epsg: number;
  name?: string;
  kind?: string;
  deprecated?: boolean;
  /** the codes PROJ's database names as its replacement (deprecation, supersession) */
  replacements?: Array<{ epsg: number; name: string; same_grid: boolean; source: string }>;
  /** the transformation to WGS 84 PROJ uses at the shift, and its accuracy (m; null: unknown) */
  to_wgs84?: { name: string; accuracy: number | null; ballpark: boolean } | null;
  error?: string;
}

/** Why a georeference is worth a word: a deprecated code, a transformation of
 *  unknown accuracy (PROJ's «ballpark»: no datum shift), or nothing */
export function crsWarning(info: CrsInfo | null): { why: "deprecated" | "ballpark"; to: CrsInfo["replacements"] } | null {
  if (!info?.ok) return null;
  if (info.deprecated) return { why: "deprecated", to: info.replacements ?? [] };
  if (info.to_wgs84?.ballpark) return { why: "ballpark", to: info.replacements ?? [] };
  return null;
}

/**
 * The conversion to another code, as data. Two cases (E.D., 23 Oct):
 *  - the SAME GRID (the same projection with the same parameters on the same
 *    ellipsoid, only the declared datum changes — 31700 → 3844): the code only,
 *    the shift as it is;
 *  - ANOTHER GRID: the shift reprojected (`reprojected`, from the bridge, with
 *    the accuracy of the transformation used), and the models, if they carry
 *    absolute coordinates in plan, need the same treatment (the caller says it).
 */
export function conversionPatch(sameGrid: boolean, to: number,
                                reprojected?: { x: number; y: number } | null): Record<string, unknown> | null {
  if (sameGrid) return { epsg: to };
  if (!reprojected || !Number.isFinite(reprojected.x) || !Number.isFinite(reprojected.y)) return null;
  return { epsg: to, shift_x: Math.round(reprojected.x * 1000) / 1000, shift_y: Math.round(reprojected.y * 1000) / 1000 };
}
