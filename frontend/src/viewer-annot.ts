/**
 * MICRO-VIEWER-UNICO p.4 · WHAT A MARK ON A DOCUMENT'S MODEL READS.
 *
 * The Viewer's 3D tools, on ONE document (the annotations that rest on several
 * documents together stay in the Space): a spot height, the height of an
 * impost, a bedding plane (from three points, or from the face under one
 * click), a line. Each becomes an extractor of the document (`addFreeExtraction`)
 * with its region in the document's frame and the VALUE it read.
 *
 * The shape of the data is the one a 2D region already has (an
 * `annotation_region`, `extracted_from` by the extractor, `is_on_resource` the
 * document; measured on `setReadingGeometry`): the 3D kinds the datamodel
 * knows (point, line, polyline) carry the vertices in `data.coords`, and what
 * was read goes beside them — `reading_kind`, `value`, `unit` and, for a plane,
 * `plane` {normal, origin, dip_deg, dip_direction_deg}. `reading_kind` and
 * `plane` are not in the datamodel yet: the proposal for s3Dgraphy is in the
 * report (REFERTO, «Proposte»), and the vertices alone stay readable by any
 * s3Dgraphy that ignores them.
 *
 * Coordinates: the frame the datamodel says (`AnnotationRegionNode.coords`, «the
 * vertices in the model's glTF frame»): the scene's, Y up — the frame the old Doc
 * wrote too, so a reading of before and one of today are in one frame. The
 * VALUES are read in the document's frame, Z up (the data's, Blender's: the
 * survey's real heights, 492 m on D.01): a height is the vertical coordinate,
 * a dip is from the horizontal, a direction is clockwise from the frame's
 * north (+Y in Z up = −Z in glTF). `crs: "local"` as every 3D region. Pure.
 */
import type { TraceGeometry } from "./paradata-chain";

export type Vec3 = [number, number, number];

/** The tools, in the bar's order. */
export const VIEWER_3D_TOOLS = ["elevation", "impost", "plane3", "planeFace", "line", "polyline"] as const;
export type Viewer3dTool = (typeof VIEWER_3D_TOOLS)[number];

/** How many clicks a tool takes (0 = until Enter / a double click). */
export const CLICKS: Record<Viewer3dTool, number> = { elevation: 1, impost: 1, plane3: 3, planeFace: 1, line: 2, polyline: 0 };

/** What each tool reads, as `reading_kind` (the vocabulary proposed to s3Dgraphy). */
export const READING_KIND: Record<Viewer3dTool, string> = {
  elevation: "spot_height", impost: "impost_height", plane3: "bedding_plane", planeFace: "bedding_plane",
  line: "length", polyline: "length",
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
// no «-0» in the data (a flipped normal's zero): it would be written as -0
const round = (v: number, d = 6): number => (Math.round(v * 10 ** d) / 10 ** d) || 0;
const r3 = (p: Vec3): Vec3 => [round(p[0]), round(p[1]), round(p[2])];

export interface Plane {
  /** the unit normal, pointing up (z ≥ 0) */
  normal: Vec3;
  /** the point it is stated at: the three points' centroid, or the click */
  origin: Vec3;
  /** the angle with the horizontal, in degrees (0 = level) */
  dip_deg: number;
  /** where it goes down, clockwise from +Y (the frame's north), in degrees;
   *  null for a level plane */
  dip_direction_deg: number | null;
}

/** The plane of three points; null when they are on one line. */
export function planeFrom3(a: Vec3, b: Vec3, c: Vec3): Plane | null {
  let n = cross(sub(b, a), sub(c, a));
  const l = len(n);
  if (l < 1e-9) return null;
  n = [n[0] / l, n[1] / l, n[2] / l];
  const origin: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  return planeOf(n, origin);
}

/** The plane of a face: its normal at the point clicked. */
export function planeFromFace(p: Vec3, normal: Vec3): Plane | null {
  const l = len(normal);
  if (l < 1e-9) return null;
  return planeOf([normal[0] / l, normal[1] / l, normal[2] / l], p);
}

function planeOf(n: Vec3, origin: Vec3): Plane {
  if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
  const dip = (Math.acos(Math.min(1, Math.max(-1, n[2]))) * 180) / Math.PI;
  // the steepest way down is the horizontal part of the upward normal
  const h = Math.hypot(n[0], n[1]);
  const dir = h < 1e-9 ? null : (((Math.atan2(n[0], n[1]) * 180) / Math.PI) + 360) % 360;
  return { normal: r3(n), origin: r3(origin), dip_deg: round(dip, 3), dip_direction_deg: dir == null ? null : round(dir, 3) };
}

/** The length of an open path. */
export function pathLength(vs: readonly Vec3[]): number {
  let s = 0;
  for (let i = 1; i < vs.length; i++) s += len(sub(vs[i], vs[i - 1]));
  return s;
}

/** glTF (Y up) ⇄ the data's frame (Z up): `space-nav`'s `threeToBlender` / `blenderToThree`. */
export const toZUp = (p: readonly number[]): Vec3 => [p[0], -p[2], p[1]];
export const toGltf = (p: readonly number[]): Vec3 => [p[0], p[2], -p[1]];

/** The words of a value, in the language given (`fmt` makes the numbers). */
export interface ReadTexts {
  spot: (z: string) => string;
  impost: (z: string) => string;
  plane: (z: string, dip: string, dir: string | null) => string;
  length: (m: string) => string;
}

export interface Reading3d {
  trace: TraceGeometry;
  regionData: Record<string, unknown>;
  /** the value read, as the extractor's `data.result` («quota 492.13 m») */
  result: string;
  /** the number read (the height, the plane's height, the length), in metres */
  value: number;
}

/**
 * The reading a tool made with the vertices clicked (`normal`: the face's, for
 * `planeFace`). Null when the clicks do not make it (three points on a line,
 * a line of one point).
 */
export function readingOf(tool: Viewer3dTool, vertices: readonly Vec3[], normal: Vec3 | null,
                          texts: ReadTexts, fmt: (v: number, digits: number) => string = (v, d) => v.toFixed(d)): Reading3d | null {
  // the vertices as the scene gives them (glTF, Y up) are what is written; the
  // values are read in the document's frame (Z up)
  const vs = vertices.map(r3);
  const zs = vs.map(toZUp);
  const base = { reading_kind: READING_KIND[tool], unit: "m" };
  if (tool === "elevation" || tool === "impost") {
    if (vs.length !== 1) return null;
    const z = zs[0][2];
    return { trace: { kind: "point", vertices: [vs[0]] }, value: z,
             regionData: { ...base, value: round(z, 4) },
             result: tool === "elevation" ? texts.spot(fmt(z, 3)) : texts.impost(fmt(z, 3)) };
  }
  if (tool === "plane3" || tool === "planeFace") {
    const pl = tool === "plane3" ? (zs.length === 3 ? planeFrom3(zs[0], zs[1], zs[2]) : null)
      : zs.length === 1 && normal ? planeFromFace(zs[0], toZUp(normal)) : null;
    if (!pl) return null;
    const z = pl.origin[2];
    const trace: TraceGeometry = tool === "plane3" ? { kind: "polyline", vertices: vs } : { kind: "point", vertices: [vs[0]] };
    // the plane in the frame of the coords (glTF), its dip and direction read in the document's
    const stored = { ...pl, normal: r3(toGltf(pl.normal)), origin: r3(toGltf(pl.origin)) };
    return { trace, value: z, regionData: { ...base, value: round(z, 4), plane: stored, plane_from: tool === "plane3" ? "three_points" : "face" },
             result: texts.plane(fmt(z, 3), fmt(pl.dip_deg, 1), pl.dip_direction_deg == null ? null : fmt(pl.dip_direction_deg, 0)) };
  }
  if (vs.length < 2 || (tool === "line" && vs.length !== 2)) return null;
  const m = pathLength(vs);
  return { trace: { kind: tool === "line" ? "line" : "polyline", vertices: vs }, value: m,
           regionData: { ...base, value: round(m, 4) }, result: texts.length(fmt(m, 3)) };
}
