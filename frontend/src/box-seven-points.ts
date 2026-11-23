/**
 * MICRO-PX2 (E.D., 23 Nov 2026) · «SCATOLA A SETTE PUNTI» / «SEVEN-POINT BOX»
 * — the pure geometry. No DOM, no three.
 *
 * EM Tools' «Proxy Box Creator» (EM-blender-tools/proxy_box_creator/utils.py,
 * `calculate_box_geometry` and `create_box_mesh`) brought into the Space. Seven
 * MEASUREMENT points, each with a fixed role, become a HORIZONTAL box (its
 * sides vertical, its top and bottom level):
 *
 *   0 alignment start  ┐ the longitudinal axis: their direction PROJECTED in
 *   1 alignment end    ┘ plan (the slope between them is ignored)
 *   2 thickness        — the side of the box: the axis in plan perpendicular to
 *                        the alignment, towards this point; the thickness is its
 *                        distance from the alignment's line (EM Tools: IN 3D)
 *   3 quota min        — the bottom (its height only)
 *   4 quota max        — the top (its height only)
 *   5 length start     ┐ where the structure starts and ends along the axis
 *   6 length end       ┘ (their projections in plan on the alignment)
 *
 * The box is EM Tools' to the vertex (check-box-seven-points.mjs compares with
 * the values its own code computes): the same points give the same box in
 * EMStudio and in Blender, so a proxy begun here is refined there without loss.
 * Two of EM Tools' rules are reproduced as they are and SAID (a warning, never
 * a different box — choice written in the MICRO's report):
 *   · the thickness is the 3D distance of the thickness point from the 3D
 *     alignment line: a point clicked higher or lower than the alignment makes
 *     the box thicker than the wall in plan («thickness_slant», with both
 *     values);
 *   · the box starts at the length's START and runs ALONG the alignment's
 *     direction for |end − start|: a start beyond the end makes the box go past
 *     the start, away from the end («length_reversed»; the Item tab swaps them).
 * A quota max under the quota min gives EM Tools' same eight vertices (said,
 * «quota_swapped»); the faces are turned outward in any case.
 *
 * Refused, with the reason: a point missing, the alignment with no direction in
 * plan (its two points one above the other), the thickness point on the
 * alignment's line in plan (the points aligned), no height, no length — each
 * under `BOX_TOL.min` (1 cm).
 *
 * The computation is in Blender's frame (Z up, x, −z, y of the scene: the frame
 * of EM Tools and of the extractors' x/y/z); the mesh is in the scene's (Y up),
 * local to its origin — EM Tools' PIVOT (bottom: the centre in plan at quota
 * min, EM Tools' default; centre; top), so the glb's origin is where Blender's
 * object would stand. 8 vertices, 12 triangles, closed and manifold.
 */

import { blenderXYZ, type V3, type WallPivot, type WallPoint } from "./wall-from-plan";

export type { V3, WallPoint, WallPivot };

/** the seven roles, in EM Tools' order; `point_type` of the extractors is EM Tools' label */
export const BOX_ROLES = ["alignment_start", "alignment_end", "thickness", "quota_min", "quota_max", "length_start", "length_end"] as const;
export type BoxRole = typeof BOX_ROLES[number];
/** EM Tools' POINT_TYPE_LABELS (operators.py): the extractors' point_type, the same string */
export const BOX_POINT_TYPES: Record<BoxRole, string> = {
  alignment_start: "Alignment Start", alignment_end: "Alignment End", thickness: "Thickness",
  quota_min: "Quota Min", quota_max: "Quota Max", length_start: "Length Start", length_end: "Length End",
};

/** what the sketch keeps to regenerate the box (layout.sketches) */
export interface BoxInput {
  /** seven slots in role order (scene frame); null: not recorded yet */
  points: Array<WallPoint | null>;
  /** EM Tools' pivot (absent: "bottom", EM Tools' default) */
  pivot?: WallPivot;
}

export const BOX_TOL = {
  /** the least alignment in plan, thickness, height, length (m) */
  min: 0.01,
  /** a thickness measured in 3D that differs from the one in plan by more than this is said */
  slant: 0.01,
} as const;

export type BoxErrorCode = "missing" | "alignment" | "thickness" | "height" | "length";
export interface BoxError { code: BoxErrorCode; missing?: number[] }
export type BoxWarningCode = "thickness_slant" | "length_reversed" | "quota_swapped" | "provisional";
export interface BoxWarning { code: BoxWarningCode; plan?: number; measured?: number }

export interface BoxMesh {
  /** local to `origin`, scene frame (Y up) */
  positions: number[];
  indices: number[];
  /** the pivot, scene frame */
  origin: V3;
  /** EM Tools' eight vertices, in ITS order (z level × thickness side × length end), Blender frame */
  vertices: V3[];
  /** length × thickness × height (EM Tools' `dimensions`; height ≥ 0 here) */
  dims: { length: number; thickness: number; height: number };
  /** the box's axes in Blender's frame: along, across (towards the thickness point), up */
  axes: { along: V3; across: V3; up: V3 };
  /** the thickness in plan (perpendicular distance in plan of the thickness point) */
  thicknessPlan: number;
  warnings: BoxWarning[];
  stats: { volume: number };
}
export type BoxResult = { ok: true; mesh: BoxMesh } | { ok: false; error: BoxError };

// ── small vector helpers (Blender frame) ────────────────────────────────────
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
/** mathutils' `normalized`: a zero vector stays zero */
const unit = (a: V3): V3 => { const l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; };
/** mathutils' `project`: the component of a along b */
const project = (a: V3, b: V3): V3 => { const d = dot(b, b); return d > 0 ? mul(b, dot(a, b) / d) : [0, 0, 0]; };
const xy = (a: V3): V3 => [a[0], a[1], 0];
/** Blender (x, y, z) → scene (x, z, −y) */
const toScene = (b: V3): V3 => [b[0], b[2], -b[1]];

/** the roles not recorded yet (indices) */
export function boxMissing(input: Pick<BoxInput, "points">): number[] {
  const out: number[] = [];
  for (let k = 0; k < 7; k++) if (!input.points[k]) out.push(k);
  return out;
}

/** the next role to record: the first empty slot (7: all there) */
export function boxNextRole(input: Pick<BoxInput, "points">): number {
  const m = boxMissing(input);
  return m.length ? m[0] : 7;
}

/**
 * The box. `provisional`: while the points are being recorded, the length's
 * two points missing are taken as the alignment's (the preview from five
 * points on; warned «provisional»).
 */
export function buildBox(input: BoxInput, opts: { provisional?: boolean } = {}): BoxResult {
  const slots = input.points.slice(0, 7);
  while (slots.length < 7) slots.push(null);
  const warnings: BoxWarning[] = [];
  let pts = slots.map((w) => (w ? blenderXYZ(w.p) : null));
  if (opts.provisional && pts[0] && pts[1] && (!pts[5] || !pts[6])) {
    pts = [...pts];
    if (!pts[5]) pts[5] = pts[0];
    if (!pts[6]) pts[6] = pts[1];
    warnings.push({ code: "provisional" });
  }
  const missing = pts.map((p, k) => (p ? -1 : k)).filter((k) => k >= 0);
  if (missing.length) return { ok: false, error: { code: "missing", missing } };
  const [pA, pB, pT, pZmin, pZmax, pS, pE] = pts as V3[];

  // EM Tools · the alignment, projected in plan
  const alignment3d = sub(pB, pA);
  const alongXY = xy(alignment3d);
  if (len(alongXY) < BOX_TOL.min) return { ok: false, error: { code: "alignment" } };
  const along = unit(alongXY);
  // EM Tools · the thickness: the direction in plan perpendicular to the axis, its size IN 3D
  const toT = sub(pT, pA);
  const toTxy = xy(toT);
  const acrossRaw = sub(toTxy, project(toTxy, along));
  const thicknessPlan = len(acrossRaw);
  if (thicknessPlan < BOX_TOL.min) return { ok: false, error: { code: "thickness" } };
  const across = unit(acrossRaw);
  const thickness = len(sub(toT, project(toT, alignment3d)));
  if (Math.abs(thickness - thicknessPlan) > BOX_TOL.slant) warnings.push({ code: "thickness_slant", plan: thicknessPlan, measured: thickness });
  const up: V3 = [0, 0, 1];
  // EM Tools · the height: the two quotas
  const height = pZmax[2] - pZmin[2];
  if (Math.abs(height) < BOX_TOL.min) return { ok: false, error: { code: "height" } };
  if (height < 0) warnings.push({ code: "quota_swapped" });
  // EM Tools · the length: the two points projected on the axis in plan
  const a0 = xy(pA);
  const startProj = project(sub(xy(pS), a0), along);
  const endProj = project(sub(xy(pE), a0), along);
  const length = len(sub(endProj, startProj));
  if (length < BOX_TOL.min) return { ok: false, error: { code: "length" } };
  if (dot(sub(endProj, startProj), along) < 0) warnings.push({ code: "length_reversed" });
  // EM Tools · the origin: the length's start in plan, at quota min
  const o = add(a0, startProj);
  const origin: V3 = [o[0], o[1], pZmin[2]];
  const vertices: V3[] = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++)
    vertices.push(add(add(add(origin, mul(along, k * length)), mul(across, j * thickness)), mul(up, i * height)));
  const c = mul(vertices.reduce((s, v) => add(s, v), [0, 0, 0] as V3), 1 / 8);
  const pivot = input.pivot ?? "bottom";
  const zMin = pZmin[2], zMax = pZmax[2];
  const pivB: V3 = pivot === "top" ? [c[0], c[1], zMax] : pivot === "center" ? c : [c[0], c[1], zMin];
  // EM Tools' six faces (create_box_mesh), each as two triangles; turned outward
  const quads = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
  const sceneV = vertices.map((v) => toScene(sub(v, pivB)));
  const positions = sceneV.flat();
  const indices: number[] = [];
  for (const q of quads) {
    // orient each quad so that its normal leaves the box's centre
    const [a, b, cc, d] = q;
    const nrm = crossV(sub(sceneV[b], sceneV[a]), sub(sceneV[cc], sceneV[a]));
    const mid = mul(add(add(sceneV[a], sceneV[b]), add(sceneV[cc], sceneV[d])), 0.25);
    const centre = toScene(sub(c, pivB));
    const outward = dot(nrm, sub(mid, centre)) > 0;
    indices.push(...(outward ? [a, b, cc, a, cc, d] : [a, cc, b, a, d, cc]));
  }
  return { ok: true, mesh: { positions, indices, origin: toScene(pivB), vertices, dims: { length, thickness, height: Math.abs(height) },
    axes: { along, across, up }, thicknessPlan, warnings, stats: { volume: length * thickness * Math.abs(height) } } };
}
function crossV(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// ── what the sketch keeps, read back ─────────────────────────────────────────

const pt = (x: unknown): WallPoint | null => {
  const r = x as Record<string, unknown> | null;
  const p = r?.p;
  if (!Array.isArray(p) || p.length !== 3 || !p.every((c) => Number.isFinite(Number(c)))) return null;
  return { p: p.map(Number) as V3, rm: typeof r!.rm === "string" ? r!.rm : null, doc: typeof r!.doc === "string" ? r!.doc : null,
           ...(typeof r!.note === "string" && r!.note.trim() ? { note: r!.note } : {}) };
};

/** An input read back from a layout: null when it is not one (seven points needed). */
export function readBoxInput(v: unknown): BoxInput | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.points)) return null;
  const points = o.points.slice(0, 7).map((x) => (x ? pt(x) : null));
  while (points.length < 7) points.push(null);
  if (points.some((w) => !w)) return null;
  const pivot = o.pivot === "center" || o.pivot === "top" || o.pivot === "bottom" ? o.pivot : undefined;
  return { points, ...(pivot ? { pivot } : {}) };
}

// ── the corrections: pure edits of the inputs ───────────────────────────────

export type BoxEdit =
  | { op: "set"; k: number; to: WallPoint | null }
  | { op: "note"; k: number; note: string }
  | { op: "swapLength" }
  | { op: "pivot"; pivot: WallPivot };

/** An edit: a new input, or why not. The input is never changed. A moved point keeps its annotation. */
export function editBox<T extends BoxInput>(input: T, e: BoxEdit): { ok: true; input: T } | { ok: false; why: "range" } {
  const copy = (w: WallPoint | null): WallPoint | null => (w ? { p: [...w.p] as V3, rm: w.rm ?? null, doc: w.doc ?? null, ...(w.note ? { note: w.note } : {}) } : null);
  const points = input.points.slice(0, 7).map(copy);
  while (points.length < 7) points.push(null);
  if (e.op === "set") {
    if (e.k < 0 || e.k > 6) return { ok: false, why: "range" };
    const keep = points[e.k]?.note;
    points[e.k] = e.to ? copy({ ...e.to, note: e.to.note ?? keep }) : null;
  } else if (e.op === "note") {
    const w = points[e.k];
    if (e.k < 0 || e.k > 6 || !w) return { ok: false, why: "range" };
    const text = e.note.trim();
    if (text) w.note = text; else delete w.note;
  } else if (e.op === "swapLength") {
    [points[5], points[6]] = [points[6], points[5]];
  } else {
    return { ok: true, input: { ...input, points, pivot: e.pivot } };
  }
  return { ok: true, input: { ...input, points } };
}

/** A short signature of an input — the preview is built again only when it changes. */
export function boxSig(input: BoxInput, extra = ""): string {
  const r = (v: number) => Math.round(v * 1e4);
  return `${input.points.map((w) => (w ? w.p.map(r).join(",") : "-")).join(";")}|${input.pivot ?? "bottom"}|${extra}`;
}

/** The documents the clicks fell on, in order of first appearance. */
export function boxDocuments(input: Pick<BoxInput, "points">): Array<string | null> {
  const out: Array<string | null> = [];
  for (const w of input.points) {
    if (!w) continue;
    const d = w.doc ?? null;
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** A pose moved after the build (G / R / S): the points carried along (the
 *  box built again stays horizontal: a rotation about a horizontal axis is
 *  read through the points, as EM Tools would read them). */
export function bakeBoxPose(input: BoxInput, origin: V3, pose: { position: V3; rotation: V3; scale: V3 }): BoxInput {
  const [a, b, c] = pose.rotation;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  const R = [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
  const move = (w: WallPoint | null): WallPoint | null => {
    if (!w) return null;
    const d = [0, 1, 2].map((k) => (w.p[k] - origin[k]) * pose.scale[k]);
    return { ...w, p: [0, 1, 2].map((k) => pose.position[k] + R[k][0] * d[0] + R[k][1] * d[1] + R[k][2] * d[2]) as V3 };
  };
  return { ...input, points: input.points.map(move) };
}
