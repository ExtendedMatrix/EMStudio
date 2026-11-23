/**
 * MICRO-PX1c (E.D., 23 Nov 2026) · «DAL PROSPETTO» / «FROM ELEVATION» — the
 * pure geometry. No DOM, no three (three is loaded lazily: importing it here
 * would bring it into the first bundle).
 *
 * One works on what one SEES: the outline is clicked on the visible face of a
 * wall or of an element, each click on the surface of a model (optionally
 * snapped to an edge of the mesh, `snapEdge`). The outline defines a MEAN PLANE
 * (fitted to the points: least squares, the normal the smallest axis of their
 * covariance — not the plane of the first three clicks, which a trembling hand
 * tilts) and a SHAPE. The DEPTH is decided after, the outline closed, and even
 * later: a click on a point of a model behind or beside (its distance along
 * the plane's normal), a number written, a handle dragged.
 *
 * The solid goes BACKWARDS from the face seen (`facing`: the side the person
 * looked from, the mean of the surface normals of the clicks). Choice, written
 * in the report: the FRONT face keeps the clicked points as they are (an
 * irregular surface is not flattened onto the mean plane: the face drawn IS the
 * face read), the BACK face is a plane parallel to the mean plane at `depth`
 * behind it — the depth is measured from the mean plane, so a point that stands
 * out of the face makes the solid thicker there, a recess thinner; a point
 * behind the back plane is held at `ELEV_TOL.minThick` in front of it (said).
 *
 * The mesh: 2n vertices (n front, n back), n side quads (two triangles each),
 * the two caps triangulated as the outline in the plane (the ear clipping of
 * `wall-from-plan.ts`, which uses every corner: no T-junction), normals
 * outward; closed and manifold, n − 2 + n − 2 + 2n triangles. Positions local
 * to `origin` (the outline's centroid on the mean plane), Y up, as every
 * sketch: its pose places it, the glb is in its own frame.
 */

import { selfIntersection, signedArea2, triangulate, type V3, type WallPoint } from "./wall-from-plan";

export type { V3, WallPoint };

/** how the depth was decided (the Item tab says it) */
export type DepthFrom = "click" | "number" | "handle" | "default";

/** what the sketch keeps to regenerate the solid (layout.sketches) */
export interface ElevationInput {
  /** the outline on the visible face, in click order (scene frame) */
  front: WallPoint[];
  /** metres behind the mean plane, > 0 */
  depth: number;
  /** the side the face was seen from (scene frame, about unit length) */
  facing: V3;
  /** how the depth was decided; with "click", the point clicked (a reading of a document too) */
  depthFrom?: DepthFrom;
  depthPoint?: WallPoint | null;
}

export const ELEV_TOL = {
  /** two consecutive clicks closer than this are one */
  merge: 0.01,
  /** a corner within this distance of its neighbours' line (inside their segment), in space, is not a corner */
  aligned: 0.01,
  /** the least thickness at a corner (a point behind the back plane is held there) */
  minThick: 0.01,
  /** the least depth */
  minDepth: 0.01,
  /** the default depth (the Tool panel) */
  depth: 0.5,
  /** the face is called IRREGULAR above this rms distance of the points from the mean plane (information) */
  irregular: 0.02,
  /** an outline whose mean width (2·area / perimeter) is under this has no area */
  minWidth: 0.01,
};

export type ElevationErrorCode = "too_few" | "self_intersect" | "no_area" | "depth" | "facing";
export interface ElevationError { code: ElevationErrorCode; edges?: [number, number] }
export type ElevationWarningCode = "merged" | "clamped" | "irregular";
export interface ElevationWarning { code: ElevationWarningCode; n?: number; rms?: number; max?: number }

export interface ElevationPlane {
  /** the centroid of the points, on the plane */
  c: V3;
  /** the normal, towards the side seen */
  n: V3;
  /** the plane's axes: u horizontal when it can be, v = n × u */
  u: V3;
  v: V3;
  /** distances of the points from the plane: rms and the largest */
  rms: number;
  max: number;
}

export interface ElevationMesh {
  /** local to `origin`, Y up */
  positions: number[];
  indices: number[];
  origin: V3;
  plane: ElevationPlane;
  /** the corners kept, in the mesh's order (counter-clockwise seen from the front), scene frame */
  front: V3[];
  back: V3[];
  /** for each corner of the mesh, the index of its click in `input.front` */
  order: number[];
  /** the thickness at each corner */
  thickness: number[];
  stats: { corners: number; triangles: number; depth: number; area: number };
  warnings: ElevationWarning[];
}

export type ElevationResult = { ok: true; mesh: ElevationMesh } | { ok: false; error: ElevationError };

// ── small vector helpers ─────────────────────────────────────────────────────
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => { const l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; };

/** eigen-decomposition of a symmetric 3×3 matrix (Jacobi): values and vectors (columns) */
export function eigenSym3(m: number[][]): { values: number[]; vectors: V3[] } {
  const a = m.map((r) => [...r]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) off += a[i][j] * a[i][j];
    if (off < 1e-24) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: [0, 1, 2].map((k) => [v[0][k], v[1][k], v[2][k]] as V3) };
}

/**
 * The MEAN PLANE of the points (least squares): the centroid, the normal the
 * axis of least spread, turned towards `facing` (the side seen). The axes: u
 * horizontal (up × n) when the face is not horizontal, else the scene's x; v
 * = n × u (so u, v, n is right-handed and an outline counter-clockwise in (u, v)
 * is seen counter-clockwise from the front).
 */
export function fitPlane(points: V3[], facing: V3 | null): ElevationPlane | null {
  const n0 = points.length;
  if (n0 < 3) return null;
  const c: V3 = [0, 0, 0];
  for (const p of points) { c[0] += p[0] / n0; c[1] += p[1] / n0; c[2] += p[2] / n0; }
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) {
    const d = sub(p, c);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += d[i] * d[j];
  }
  const e = eigenSym3(m);
  const order = [0, 1, 2].sort((a, b) => e.values[a] - e.values[b]);
  // two points spread along the same line: no plane
  if (e.values[order[1]] <= 1e-12 * Math.max(1, e.values[order[2]])) return null;
  let n = unit(e.vectors[order[0]]);
  if (facing && dot(n, facing) < 0) n = mul(n, -1);
  const up: V3 = [0, 1, 0];
  let u = cross(up, n);
  if (len(u) < 1e-6) u = [1, 0, 0];
  u = unit(sub(u, mul(n, dot(u, n))));
  const v = cross(n, u);
  let s2 = 0, mx = 0;
  for (const p of points) { const d = dot(sub(p, c), n); s2 += d * d; mx = Math.max(mx, Math.abs(d)); }
  return { c, n, u, v, rms: Math.sqrt(s2 / n0), max: mx };
}

/** the points merged where consecutive clicks coincide (the closing one too),
 *  and aligned in space (a click in the middle of a side is not a corner) */
function simplify(front: WallPoint[], pl: ElevationPlane): { keep: number[]; merged: number } {
  let keep = front.map((_, i) => i);
  const q = (i: number) => { const d = sub(front[i].p, pl.c); return { x: dot(d, pl.u), y: dot(d, pl.v) }; };
  let merged = 0;
  // coinciding (3D)
  for (let k = keep.length - 1; k >= 0 && keep.length > 1; k--) {
    const a = keep[k], b = keep[(k + 1) % keep.length];
    if (a !== b && len(sub(front[a].p, front[b].p)) < ELEV_TOL.merge) { keep.splice(k, 1); merged++; }
  }
  // aligned IN SPACE, inside the neighbours' segment: a click in the middle of
  // a side that also lies on the face as they do. One aligned in the plane but
  // standing out of the face (or recessed) is kept: it reads the face's relief
  void q;
  let changed = true;
  while (changed && keep.length > 3) {
    changed = false;
    for (let k = 0; k < keep.length; k++) {
      const L = keep.length;
      const a = front[keep[(k - 1 + L) % L]].p, b = front[keep[k]].p, c = front[keep[(k + 1) % L]].p;
      const ac = sub(c, a), l2 = dot(ac, ac);
      if (l2 <= 0) continue;
      const t = dot(sub(b, a), ac) / l2;
      const d = len(sub(b, add(a, mul(ac, t))));
      if (t > 0 && t < 1 && d < ELEV_TOL.aligned) { keep = keep.filter((_, i) => i !== k); merged++; changed = true; break; }
    }
  }
  return { keep, merged };
}

/** The depth a point gives: its distance BEHIND the mean plane along the normal
 *  (> 0 behind the face seen). `in_front`: the point is not behind the face. */
export function depthFromPoint(front: WallPoint[], facing: V3, q: V3):
    { ok: true; depth: number } | { ok: false; why: "in_front" | "no_plane" } {
  const pl = fitPlane(front.map((w) => w.p), facing);
  if (!pl) return { ok: false, why: "no_plane" };
  const d = -dot(sub(q, pl.c), pl.n);
  if (d < ELEV_TOL.minDepth) return { ok: false, why: "in_front" };
  return { ok: true, depth: d };
}

/** The facing of a set of clicks: the mean of their surface normals, else the
 *  direction towards the camera; null when neither says anything. */
export function facingOf(normals: Array<V3 | null | undefined>, towardCamera: V3 | null): V3 | null {
  const s: V3 = [0, 0, 0];
  let k = 0;
  for (const n of normals) if (n && len(n) > 0) { const u = unit(n); s[0] += u[0]; s[1] += u[1]; s[2] += u[2]; k++; }
  if (k && len(s) > 1e-6) return unit(s);
  return towardCamera && len(towardCamera) > 0 ? unit(towardCamera) : null;
}

/** Build the solid. Errors: fewer than three corners, an outline that crosses
 *  itself (its two sides, 1-based in the mesh's order), no area, no depth. */
export function buildElevation(input: ElevationInput): ElevationResult {
  if (input.front.length < 3) return { ok: false, error: { code: "too_few" } };
  if (!(input.depth >= ELEV_TOL.minDepth)) return { ok: false, error: { code: "depth" } };
  if (!input.facing || len(input.facing) < 1e-9) return { ok: false, error: { code: "facing" } };
  const pl0 = fitPlane(input.front.map((w) => w.p), input.facing);
  if (!pl0) return { ok: false, error: { code: "no_area" } };
  const warnings: ElevationWarning[] = [];
  const sim = simplify(input.front, pl0);
  if (sim.keep.length < 3) return { ok: false, error: { code: "too_few" } };
  if (sim.merged) warnings.push({ code: "merged", n: sim.merged });
  // the plane again on the corners kept
  const pl = fitPlane(sim.keep.map((i) => input.front[i].p), input.facing)!;
  if (!pl) return { ok: false, error: { code: "no_area" } };
  let order = [...sim.keep];
  let q = order.map((i) => { const d = sub(input.front[i].p, pl.c); return { x: dot(d, pl.u), y: dot(d, pl.v) }; });
  // counter-clockwise seen from the front (in u, v)
  if (signedArea2(q) < 0) { order = order.reverse(); q = q.reverse(); }
  const n = order.length;
  const si = selfIntersection(q);
  if (si) return { ok: false, error: { code: "self_intersect", edges: si } };
  const area = signedArea2(q) / 2;
  let per = 0;
  for (let i = 0; i < n; i++) per += Math.hypot(q[(i + 1) % n].x - q[i].x, q[(i + 1) % n].y - q[i].y);
  if (per <= 0 || (2 * area) / per < ELEV_TOL.minWidth) return { ok: false, error: { code: "no_area" } };
  if (pl.rms > ELEV_TOL.irregular) warnings.push({ code: "irregular", rms: pl.rms, max: pl.max });
  // the corners: the front as clicked, the back on the plane `depth` behind
  const front = order.map((i) => [...input.front[i].p] as V3);
  const back: V3[] = [];
  const thickness: number[] = [];
  let clamped = 0;
  for (let k = 0; k < n; k++) {
    const off = dot(sub(front[k], pl.c), pl.n);
    let t = off + input.depth;
    if (t < ELEV_TOL.minThick) { t = ELEV_TOL.minThick; clamped++; }
    back.push(sub(front[k], mul(pl.n, t)));
    thickness.push(t);
  }
  if (clamped) warnings.push({ code: "clamped", n: clamped });
  const origin = pl.c;
  const positions: number[] = [];
  for (const p of [...front, ...back]) positions.push(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
  const indices: number[] = [];
  const caps = triangulate(q);
  // the front: counter-clockwise seen from +n — outward
  for (const [a, b, c] of caps) indices.push(a, b, c);
  // the back: the same triangles, reversed (outward is −n)
  for (const [a, b, c] of caps) indices.push(n + a, n + c, n + b);
  // the sides: front_i, back_i, back_{i+1}, front_{i+1}
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, n + i, n + j, i, n + j, j);
  }
  return { ok: true, mesh: { positions, indices, origin, plane: pl, front, back, order, thickness,
    stats: { corners: n, triangles: indices.length / 3, depth: input.depth, area }, warnings } };
}

// ── what the sketch keeps, read back ─────────────────────────────────────────

const pt = (x: unknown): WallPoint | null => {
  const r = x as Record<string, unknown> | null;
  const p = r?.p;
  if (!Array.isArray(p) || p.length !== 3 || !p.every((c) => Number.isFinite(Number(c)))) return null;
  return { p: p.map(Number) as V3, rm: typeof r!.rm === "string" ? r!.rm : null, doc: typeof r!.doc === "string" ? r!.doc : null,
           ...(typeof r!.note === "string" && r!.note.trim() ? { note: r!.note } : {}) };
};

/** An input read back from a layout (plain data): null when it is not one. */
export function readElevationInput(v: unknown): ElevationInput | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const front = Array.isArray(o.front) ? o.front.map(pt).filter((q): q is WallPoint => !!q) : [];
  if (front.length < 3) return null;
  const f = o.facing;
  if (!Array.isArray(f) || f.length !== 3 || !f.every((c) => Number.isFinite(Number(c)))) return null;
  const depth = Number(o.depth);
  const from = o.depthFrom === "click" || o.depthFrom === "number" || o.depthFrom === "handle" || o.depthFrom === "default" ? o.depthFrom : undefined;
  const dp = o.depthPoint ? pt(o.depthPoint) : null;
  return { front, facing: f.map(Number) as V3, depth: Number.isFinite(depth) && depth > 0 ? depth : ELEV_TOL.depth,
           ...(from ? { depthFrom: from } : {}), ...(dp ? { depthPoint: dp } : {}) };
}

// ── the corrections: pure edits of the inputs ───────────────────────────────

export type ElevationEdit =
  | { op: "move"; k: number; to: WallPoint }
  | { op: "insert"; after: number; point: WallPoint }
  | { op: "remove"; k: number }
  /** the annotation of a point (k: a corner; -1: the depth's point) */
  | { op: "note"; k: number; note: string }
  | { op: "depth"; depth: number; from: DepthFrom; point?: WallPoint | null };

/** An edit: a new input, or why not. The input is never changed. */
export function editElevation<T extends ElevationInput>(input: T, e: ElevationEdit):
    { ok: true; input: T } | { ok: false; why: "too_few" | "range" | "depth" } {
  const copy = (w: WallPoint): WallPoint => ({ p: [...w.p] as V3, rm: w.rm ?? null, doc: w.doc ?? null, ...(w.note ? { note: w.note } : {}) });
  const front = input.front.map(copy);
  if (e.op === "move") {
    if (e.k < 0 || e.k >= front.length) return { ok: false, why: "range" };
    front[e.k] = copy({ ...e.to, note: e.to.note ?? front[e.k].note });
  } else if (e.op === "insert") {
    if (e.after < 0 || e.after >= front.length) return { ok: false, why: "range" };
    front.splice(e.after + 1, 0, copy(e.point));
  } else if (e.op === "remove") {
    if (e.k < 0 || e.k >= front.length) return { ok: false, why: "range" };
    if (front.length - 1 < 3) return { ok: false, why: "too_few" };
    front.splice(e.k, 1);
  } else if (e.op === "note") {
    const text = e.note.trim();
    if (e.k === -1) {
      if (!input.depthPoint) return { ok: false, why: "range" };
      const dp = copy(input.depthPoint);
      if (text) dp.note = text; else delete dp.note;
      return { ok: true, input: { ...input, front, depthPoint: dp } };
    }
    if (e.k < 0 || e.k >= front.length) return { ok: false, why: "range" };
    if (text) front[e.k].note = text; else delete front[e.k].note;
  } else {
    if (!(e.depth >= ELEV_TOL.minDepth)) return { ok: false, why: "depth" };
    // a depth not from a click lets the clicked point go (it no longer says the depth)
    const dp = e.from === "click" && e.point ? copy(e.point) : null;
    const out = { ...input, front, depth: e.depth, depthFrom: e.from } as T;
    if (dp) out.depthPoint = dp; else delete out.depthPoint;
    return { ok: true, input: out };
  }
  return { ok: true, input: { ...input, front } };
}

/** the sides of the outline (the «+» handles): the midpoint after each corner */
export function elevationSides(front: WallPoint[]): Array<{ after: number; p: V3 }> {
  const n = front.length;
  const out: Array<{ after: number; p: V3 }> = [];
  for (let k = 0; k < n && n >= 2; k++) {
    const a = front[k].p, b = front[(k + 1) % n].p;
    out.push({ after: k, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] });
  }
  return out;
}

/** the depth handle: the centre of the back face, and the axis it slides on */
export function depthHandle(m: ElevationMesh): { p: V3; axis: { o: V3; d: V3 } } {
  const c = m.plane.c;
  return { p: sub(c, mul(m.plane.n, m.stats.depth)), axis: { o: c, d: m.plane.n } };
}

/** the depth a point on the axis says (the handle dragged): its distance behind the plane */
export function depthOnAxis(m: ElevationMesh, p: V3): number {
  return -dot(sub(p, m.plane.c), m.plane.n);
}

/** A short signature of an input — the preview is built again only when it changes. */
export function elevationSig(input: ElevationInput, extra = ""): string {
  const r = (v: number) => Math.round(v * 1e4);
  return `${input.front.map((w) => w.p.map(r).join(",")).join(";")}|${r(input.depth)}|${input.facing.map((x) => Math.round(x * 1e3)).join(",")}|${extra}`;
}

/** The documents the clicks fell on, in order of first appearance (the depth's point too). */
export function elevationDocuments(input: Pick<ElevationInput, "front" | "depthPoint">): Array<string | null> {
  const out: Array<string | null> = [];
  for (const w of [...input.front, ...(input.depthPoint ? [input.depthPoint] : [])]) {
    const d = w.doc ?? null;
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** A pose moved after the build (G / R / S): the inputs carried along (the
 *  clicks and the facing moved; the depth scaled by the mean scale). */
export function bakeElevationPose(input: ElevationInput, origin: V3, pose: { position: V3; rotation: V3; scale: V3 }): ElevationInput {
  const [a, b, c] = pose.rotation;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  const R = [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
  const rot = (d: number[]): V3 => [0, 1, 2].map((k) => R[k][0] * d[0] + R[k][1] * d[1] + R[k][2] * d[2]) as V3;
  const move = (w: WallPoint): WallPoint => {
    const d = [0, 1, 2].map((k) => (w.p[k] - origin[k]) * pose.scale[k]);
    return { ...w, p: add(pose.position, rot(d)) };
  };
  const s = (Math.abs(pose.scale[0]) + Math.abs(pose.scale[1]) + Math.abs(pose.scale[2])) / 3;
  return { ...input, front: input.front.map(move), facing: unit(rot(input.facing)), depth: input.depth * s,
           ...(input.depthPoint ? { depthPoint: move(input.depthPoint) } : {}) };
}

// ── MICRO-PX1c · reading an EDGE of the mesh («aggancio agli spigoli») ──────

/**
 * Where is the edge near a click? The scene casts a small ring of rays around
 * the pointer (`samples`: each the point hit and the surface normal there).
 * On a photogrammetric mesh an edge is not an edge of a triangle (they are
 * everywhere): it is where the SURFACE turns. The samples are split in two (or
 * three) groups by their normals; when two groups differ by more than
 * `angleDeg`, each defines a plane (fitted to its points) and the edge is the
 * line where the two planes meet: the click goes to the nearest point of that
 * line («edge»). Three groups: the corner where the three planes meet
 * («corner»). Otherwise the click stays where it was («surface»).
 */
export function snapEdge(center: { p: V3; n: V3 | null }, samples: Array<{ p: V3; n: V3 | null }>, angleDeg = 30):
    { kind: "surface" | "edge" | "corner"; p: V3; angle?: number } {
  const all = [center, ...samples].filter((s) => s.n && len(s.n) > 0) as Array<{ p: V3; n: V3 }>;
  if (all.length < 4) return { kind: "surface", p: center.p };
  const cosT = Math.cos((angleDeg * Math.PI) / 180);
  // groups by normal: greedy, the first normal of each group its seed
  const groups: Array<{ seed: V3; pts: V3[]; ns: V3[] }> = [];
  for (const s of all) {
    const nn = unit(s.n);
    const g = groups.find((x) => dot(x.seed, nn) >= cosT);
    if (g) { g.pts.push(s.p); g.ns.push(nn); } else groups.push({ seed: nn, pts: [s.p], ns: [nn] });
  }
  const big = groups.filter((g) => g.pts.length >= 2).sort((a, b) => b.pts.length - a.pts.length);
  if (big.length < 2) return { kind: "surface", p: center.p };
  const planeOf = (g: { pts: V3[]; ns: V3[] }) => {
    const nm = unit(g.ns.reduce((s, x) => add(s, x), [0, 0, 0] as V3));
    const c = mul(g.pts.reduce((s, x) => add(s, x), [0, 0, 0] as V3), 1 / g.pts.length);
    return { n: nm, d: dot(nm, c) };
  };
  const P = big.slice(0, 3).map(planeOf);
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot(P[0].n, P[1].n)))) * 180) / Math.PI;
  if (P.length >= 3) {
    // three planes: n1·x = d1, n2·x = d2, n3·x = d3
    const [p1, p2, p3] = P;
    const det = dot(p1.n, cross(p2.n, p3.n));
    if (Math.abs(det) > 0.2) {
      const x = mul(add(add(mul(cross(p2.n, p3.n), p1.d), mul(cross(p3.n, p1.n), p2.d)), mul(cross(p1.n, p2.n), p3.d)), 1 / det);
      if (len(sub(x, center.p)) < 4 * Math.max(...samples.map((s) => len(sub(s.p, center.p))), 1e-6))
        return { kind: "corner", p: x, angle };
    }
  }
  // two planes: the line where they meet, the nearest point to the click
  const [a, b] = P;
  const dir = cross(a.n, b.n);
  const l2 = dot(dir, dir);
  if (l2 < 1e-9) return { kind: "surface", p: center.p };
  // a point on the line: ((d1 n2 − d2 n1) × dir) / |dir|²... the standard formula
  const p0 = mul(add(mul(cross(b.n, dir), a.d), mul(cross(dir, a.n), b.d)), 1 / l2);
  const du = unit(dir);
  const t = dot(sub(center.p, p0), du);
  return { kind: "edge", p: add(p0, mul(du, t)), angle };
}
