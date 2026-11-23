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
export const VIEWER_3D_TOOLS = ["elevation", "impost", "plane3", "planeFace", "line", "polyline", "alignment"] as const;
export type Viewer3dTool = (typeof VIEWER_3D_TOOLS)[number];

/** How many clicks a tool takes (0 = until Enter / a double click). */
export const CLICKS: Record<Viewer3dTool, number> = { elevation: 1, impost: 1, plane3: 3, planeFace: 1, line: 2, polyline: 0, alignment: 0 };

/** What each tool reads, as `reading_kind` (the vocabulary proposed to s3Dgraphy). */
export const READING_KIND: Record<Viewer3dTool, string> = {
  elevation: "spot_height", impost: "impost_height", plane3: "bedding_plane", planeFace: "bedding_plane",
  line: "length", polyline: "length",
  // MICRO-PX6 · the line (or the polyline) in plan, its azimuth, length, slope and fit
  alignment: "alignment",
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
  /** MICRO-PX6 · an alignment: its azimuth, its length in plan, its slope (null:
   *  level within 0.05°), and with more than two points the fit's largest
   *  deviation in cm and the number of points */
  alignment?: (az: string, m: string, slope: string | null, dev: string | null, n: number) => string;
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
  if (tool === "alignment") {
    const al = alignmentOf(zs);
    if (!al) return null;
    // the fitted line's ends in the frame of the coords (glTF), as a plane's origin is
    const stored = { ...al, start: r3(toGltf(al.start)), end: r3(toGltf(al.end)) };
    const slope = Math.abs(al.slope_deg) < 0.05 ? null : fmt(al.slope_deg, 1);
    const dev = al.points > 2 ? fmt(al.max_dev_m * 100, 1) : null;
    const words = texts.alignment ? texts.alignment(fmt(al.azimuth_deg, 1), fmt(al.length_m, 3), slope, dev, al.points)
      : `${fmt(al.azimuth_deg, 1)}° · ${fmt(al.length_m, 3)} m`;
    return { trace: { kind: vs.length === 2 ? "line" : "polyline", vertices: vs }, value: al.azimuth_deg,
             // `unit` is the region's own (the polyline's `length`, metres): the azimuth says its unit apart
             regionData: { reading_kind: READING_KIND.alignment, value: round(al.azimuth_deg, 3), value_unit: "deg", alignment: stored },
             result: words };
  }
  if (vs.length < 2 || (tool === "line" && vs.length !== 2)) return null;
  const m = pathLength(vs);
  return { trace: { kind: tool === "line" ? "line" : "polyline", vertices: vs }, value: m,
           regionData: { ...base, value: round(m, 4) }, result: texts.length(fmt(m, 3)) };
}

// ── MICRO-PX6 (E.D., 23 Nov 2026) · THE ALIGNMENT, AN EXTRACTOR OF ITS OWN ──
//
// In EM Tools the alignment lived inside the Proxy Box (`alignment_start` /
// `alignment_end`, the axis projected in plan). Here it is a reading of the
// document: two or more clicks on a model, and what is read —
//   · the line in PLAN: with two points the line through them; with more, the
//     line fitted by least squares in plan (total least squares: the principal
//     axis of the points' covariance, the deviation measured square to it), its
//     ends the projections of the FIRST and LAST click (the clicks' order gives
//     the sense);
//   · the AZIMUTH of that line, clockwise from the frame's north (+Y, Z up: the
//     same north as a plane's dip direction above), 0–360 in the sense of the
//     clicks, and the axis (0–180: an alignment of a wall has no sense);
//   · its LENGTH in plan (between the two ends), the path's length in plan and in
//     3D (the polyline as clicked);
//   · its SLOPE: the heights fitted along the line (least squares of z on the
//     distance along it), the angle from the horizontal (+ rising from the first
//     click to the last) and the rise between the ends;
//   · with more than two points, the LARGEST deviation and the rms in plan;
//   · each side of the polyline: its azimuth and its length in plan.
// Null when the clicks have no extent in plan (one point, or points one above
// the other within 1 cm). Every length in metres, every angle in degrees.

export interface Alignment {
  /** clockwise from the frame's north (+Y), from the first click toward the last */
  azimuth_deg: number;
  /** the axis, without a sense: the azimuth folded into [0, 180) */
  axis_deg: number;
  /** the fitted line's length in plan, between its two ends */
  length_m: number;
  /** the polyline as clicked: its length in plan and in space */
  path_plan_m: number;
  path_3d_m: number;
  /** the fitted heights along the line: the angle (+ rising toward the last click), the rise end − start */
  slope_deg: number;
  rise_m: number;
  /** the fitted line's ends (the first and the last click projected, at their fitted heights), Z up */
  start: Vec3;
  end: Vec3;
  /** how many points; the fit's largest deviation and rms in plan (0 for two points) */
  points: number;
  max_dev_m: number;
  rms_m: number;
  /** which point deviates most (0-based), null for two points */
  max_dev_at: number | null;
  /** each side of the polyline: azimuth and length in plan */
  sides: Array<{ azimuth_deg: number; length_m: number }>;
  /** how the line was found: «two_points» or «least_squares_plan» */
  fit: "two_points" | "least_squares_plan";
}

/** The alignment read from points in the document's frame (Z up). */
export function alignmentOf(zs: readonly Vec3[]): Alignment | null {
  const n = zs.length;
  if (n < 2) return null;
  const az = (dx: number, dy: number): number => (((Math.atan2(dx, dy) * 180) / Math.PI) + 360) % 360;
  // the centroid in plan, then the principal axis (2×2 covariance, closed form)
  let cx = 0, cy = 0;
  for (const p of zs) { cx += p[0]; cy += p[1]; }
  cx /= n; cy /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of zs) { const dx = p[0] - cx, dy = p[1] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  let ux: number, uy: number;
  if (n === 2) {
    ux = zs[1][0] - zs[0][0]; uy = zs[1][1] - zs[0][1];
  } else {
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    ux = Math.cos(th); uy = Math.sin(th);
  }
  const ul = Math.hypot(ux, uy);
  if (ul < 1e-9) return null;
  ux /= ul; uy /= ul;
  // the sense: from the first click toward the last
  const along = (p: Vec3) => (p[0] - cx) * ux + (p[1] - cy) * uy;
  if (along(zs[n - 1]) < along(zs[0])) { ux = -ux; uy = -uy; }
  const ts = zs.map(along);
  const t0 = ts[0], t1 = ts[n - 1];
  const length = t1 - t0;
  if (!(length >= 0.01)) return null;
  // the deviations, square to the line in plan
  let maxDev = 0, maxAt = -1, ss = 0;
  zs.forEach((p, i) => {
    const d = Math.abs(-(p[0] - cx) * uy + (p[1] - cy) * ux);
    ss += d * d;
    if (d > maxDev) { maxDev = d; maxAt = i; }
  });
  // the heights along the line: z = a + b t (least squares; with two points, through both)
  let mt = 0, mz = 0;
  for (let i = 0; i < n; i++) { mt += ts[i]; mz += zs[i][2]; }
  mt /= n; mz /= n;
  let stt = 0, stz = 0;
  for (let i = 0; i < n; i++) { stt += (ts[i] - mt) ** 2; stz += (ts[i] - mt) * (zs[i][2] - mz); }
  const b = stt > 1e-12 ? stz / stt : 0;
  const zAt = (tt: number) => mz + b * (tt - mt);
  const at = (tt: number): Vec3 => [cx + ux * tt, cy + uy * tt, zAt(tt)];
  const start = at(t0), end = at(t1);
  const sides: Alignment["sides"] = [];
  let plan = 0, path3 = 0;
  for (let i = 1; i < n; i++) {
    const dx = zs[i][0] - zs[i - 1][0], dy = zs[i][1] - zs[i - 1][1];
    const l = Math.hypot(dx, dy);
    plan += l;
    path3 += len(sub(zs[i], zs[i - 1]));
    sides.push({ azimuth_deg: round(l < 1e-9 ? 0 : az(dx, dy), 3), length_m: round(l, 4) });
  }
  const azimuth = az(ux, uy);
  return {
    azimuth_deg: round(azimuth, 3),
    axis_deg: round(azimuth % 180, 3),
    length_m: round(length, 4),
    path_plan_m: round(plan, 4),
    path_3d_m: round(path3, 4),
    slope_deg: round((Math.atan(b) * 180) / Math.PI, 3),
    rise_m: round(end[2] - start[2], 4),
    start: r3(start), end: r3(end),
    points: n,
    max_dev_m: n > 2 ? round(maxDev, 4) : 0,
    rms_m: n > 2 ? round(Math.sqrt(ss / n), 4) : 0,
    max_dev_at: n > 2 && maxAt >= 0 ? maxAt : null,
    sides,
    fit: n === 2 ? "two_points" : "least_squares_plan",
  };
}

/** An alignment's region data (`reading_kind` «alignment»), or null. */
export function alignmentOfRegion(data: Record<string, unknown> | null | undefined): Alignment | null {
  if (!data || data.reading_kind !== "alignment") return null;
  const a = data.alignment as Alignment | undefined;
  return a && typeof a.azimuth_deg === "number" ? a : null;
}
