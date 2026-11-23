/**
 * MICRO-PX3 (E.D., 23 Nov 2026) · «ANNOTA SUPERFICIE» / «ANNOTATE SURFACE» —
 * the pure geometry of an AREAL drawn on a representation model.
 *
 * EM Tools' «Surface Areale» (`surface_areale/strategies.py`) makes a surface
 * proxy from a contour drawn on the RM with three strategies a classifier
 * chooses: A projective (PCA plane, Delaunay of the contour, vertices pulled
 * onto the RM, adaptive subdivision), B shrinkwrap (a dense patch wrapped on
 * the RM), C boolean («cookie cutter»: the contour extruded along the normals
 * and intersected with the RM). A and B build NEW triangles that approximate
 * the RM; only C keeps the RM's own — and costs an exact boolean on the whole
 * mesh (`benchmark.py`: ~2 s per million polygons in Blender, far more in a
 * browser, and impossible on 3D Tiles, which are not one closed mesh).
 *
 * «Areals are important» (E.D.): the geometry must FOLLOW what lies under it.
 * Here the cut is C's result reached by A's road, in the contour's plane: the
 * RM's triangles under the contour (seen from the side of the clicks, the
 * layer the clicks are on, reached from them by adjacency) are kept WHOLE when
 * inside, and clipped by the contour when they cross it (Sutherland–Hodgman,
 * the triangle as the window): every vertex of the areal is a vertex of the RM
 * or a point ON one of its triangles, nothing is simplified, and the border is
 * draped — each side of the contour is split wherever it crosses an edge of
 * the mesh (the mesh's own step), never a chord stretched over the relief.
 * Linear in the triangles under the contour: no BVH, no boolean, the same on a
 * glb and on the leaves of a tileset.
 *
 * The classifier of EM Tools is kept (`classifySurface`, the same metrics and
 * thresholds) and SAID; the cut does not depend on it. What a single direction
 * of projection cannot cut — the contour wrapping a column, a surface turned
 * more than 90° from the clicks' side — is refused by what it measures (the
 * coverage of the contour's area), with the reason: refine it in Blender.
 *
 * Frames: the scene's (three.js, Y up, metres), as the clicks; the mesh is
 * local to `origin` (the contour's centroid). The offset (anti z-fighting):
 * along the areal's vertex normals, `SURF_TOL.offset` (EM Tools' Surface
 * Areale 1 mm × overlaps; its «Offset proxy» 10 mm, non destructive), times
 * the areals already there on the same spot (EM Tools' rule, at most ×5).
 *
 * No DOM, no three: checked by scripts/check-surface-annotation.mjs.
 */
import { type V3, type WallPoint, selfIntersection, signedArea2, triangulate, insidePolygon } from "./wall-from-plan";
import { fitPlane, facingOf, type ElevationPlane } from "./from-elevation";

export type { V3, WallPoint };

/** the inputs a sketch keeps: the contour clicked (scene frame, each with its
 *  model and document), the surface's normal at each click, the offset */
export interface SurfaceInput {
  contour: WallPoint[];
  /** the RM's normal at each click (scene frame), null when not known */
  normals?: Array<V3 | null>;
  /** metres; default `SURF_TOL.offset` */
  offset?: number;
  /** areals already on the same spot (EM Tools' `count_overlapping_areali`) */
  stack?: number;
}

export const SURF_TOL = {
  /** the areal's distance from the RM: 2 mm (EM Tools' Surface Areale 1 mm,
   *  its «Offset proxy» 10 mm — a browser's depth buffer needs a little more
   *  than 1 mm at a room's distance; the material's polygon offset does the rest) */
  offset: 0.002,
  offsetMax: 0.01,
  /** EM Tools: the offset × (overlapping areals + 1), at most × 5 */
  stackMax: 5,
  /** consecutive clicks closer than this are one */
  merge: 0.002,
  /** the share of the contour's area the cut must cover */
  coverage: 0.98,
  /** above this share the cut overlaps itself in projection (folds) */
  overlap: 1.02,
  /** a triangle seen from the clicks' side: cos of its angle to the normal */
  facing: 0.02,
  /** vertices of the RM closer than this are the same */
  weld: 0.0005,
  /** …and across a seam (the leaves of a tileset do not share their border's
   *  vertices: measured on TempluMare's 2015 survey, 23 055 open edges among
   *  332 leaves) two triangles closer than this are neighbours */
  seam: 0.003,
  /** two meshes over the same place closer than this in depth: one surface (the seam's overlap) */
  overlapDepth: 0.01,
  /** a click farther than this from every triangle under it is off the model */
  onModel: 0.05,
  /** the triangles turned away (an overhang's underside, a crevice) joined to
   *  the surface seen when they lie at most this far behind it: no slit in the
   *  areal; a wall's back face (its thickness behind) is never reached */
  slit: 0.03,
} as const;

/** a soup of triangles: 9 numbers per triangle (scene frame); `owners`: the
 *  mesh each comes from (a tileset's leaf), one per triangle — where two
 *  meshes cover the same place at the same depth (the leaves' seams overlap
 *  by a few millimetres) only one is kept */
export interface SurfaceTris { positions: ArrayLike<number>; owners?: ArrayLike<number> }

export type SurfaceErrorCode = "too_few" | "self_intersect" | "no_plane" | "no_mesh" | "off_model" | "too_3d";
export interface SurfaceError { code: SurfaceErrorCode; edges?: [number, number]; coverage?: number; at?: number[] }
export type SurfaceWarningCode = "merged" | "folds" | "scenario";
export interface SurfaceWarning { code: SurfaceWarningCode; n?: number; ratio?: number; scenario?: "A" | "B" | "C" }

/** EM Tools' classifier (`classify_complexity`): planarity (PCA, the least
 *  spread over the total), the largest angle of a click's normal to their
 *  mean, the scenario and the strategy EM Tools would choose */
export interface SurfaceClass {
  scenario: "A" | "B" | "C";
  planarity: number;
  normalVariation: number;
  strategy: "PROJECTIVE" | "SHRINKWRAP" | "BOOLEAN";
}

export interface SurfaceMesh {
  /** the contour's centroid (scene frame): the sketch's position */
  origin: V3;
  /** local to `origin`, the offset applied */
  positions: number[];
  indices: number[];
  /** the draped border, closed loops (scene frame, on the RM: no offset) */
  boundary: V3[][];
  /** m², on the RM (before the offset) */
  area: number;
  /** m, the draped border's length ON the contour (seams and holes inside apart: `stats.inner`) */
  perimeter: number;
  /** m², the contour's area in its plane, and what the cut covers of it */
  polygonArea: number;
  coverage: number;
  stats: { triangles: number; vertices: number; whole: number; clipped: number; candidates: number; source: number;
    /** border loops (1: no hole, no seam), the triangles turned away joined (slits
     *  closed), the RM's triangles given twice (a tileset's seams) left out, and the
     *  border's length that is NOT on the contour (seams and holes inside) */
    loops: number; turned: number; duplicates: number; inner: number;
    /** triangles of a second mesh over the same place (a seam's overlap) left out */
    overlaps: number };
  /** the effective offset (m) */
  offset: number;
  plane: { c: V3; n: V3; u: V3; v: V3 };
  classification: SurfaceClass;
  warnings: SurfaceWarning[];
}

export type SurfaceResult = { ok: true; mesh: SurfaceMesh } | { ok: false; error: SurfaceError };

// ── vectors ────────────────────────────────────────────────────────────────────
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => { const l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; };

interface P2 { x: number; y: number }

/** the clicks merged where consecutive ones coincide (the closing one too) */
export function surfaceContour(input: Pick<SurfaceInput, "contour" | "normals">): { points: WallPoint[]; normals: Array<V3 | null>; merged: number } {
  const pts: WallPoint[] = [];
  const nms: Array<V3 | null> = [];
  let merged = 0;
  input.contour.forEach((w, i) => {
    const last = pts[pts.length - 1];
    if (last && len(sub(w.p, last.p)) < SURF_TOL.merge) { merged++; return; }
    pts.push(w);
    nms.push(input.normals?.[i] ?? null);
  });
  while (pts.length > 1 && len(sub(pts[0].p, pts[pts.length - 1].p)) < SURF_TOL.merge) { pts.pop(); nms.pop(); merged++; }
  return { points: pts, normals: nms, merged };
}

/** EM Tools' `classify_complexity`, the same thresholds */
export function classifySurface(points: V3[], normals: Array<V3 | null | undefined>): SurfaceClass {
  const n0 = points.length;
  let planarity = 0;
  if (n0 >= 3) {
    const c: V3 = [0, 0, 0];
    for (const p of points) { c[0] += p[0] / n0; c[1] += p[1] / n0; c[2] += p[2] / n0; }
    // numpy's np.cov (n − 1); the ratio does not depend on it
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of points) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += d[i] * d[j]; }
    const ev = eigenValues3(m);
    const total = ev[0] + ev[1] + ev[2];
    planarity = total > 1e-10 ? Math.min(...ev) / total : 0;
  }
  const ns = normals.filter((x): x is V3 => !!x && len(x) > 0).map(unit);
  let normalVariation = 0;
  if (ns.length > 1) {
    const mean = unit(ns.reduce((s, x) => add(s, x), [0, 0, 0] as V3));
    for (const x of ns) normalVariation = Math.max(normalVariation, (Math.acos(Math.max(-1, Math.min(1, dot(x, mean)))) * 180) / Math.PI);
  }
  if (planarity < 0.02 && normalVariation < 20) return { scenario: "A", planarity, normalVariation, strategy: "PROJECTIVE" };
  if (planarity < 0.15 && normalVariation < 90) return { scenario: "B", planarity, normalVariation, strategy: "SHRINKWRAP" };
  return { scenario: "C", planarity, normalVariation, strategy: "BOOLEAN" };
}

/** eigenvalues of a symmetric 3×3 (closed form) */
function eigenValues3(m: number[][]): [number, number, number] {
  const p1 = m[0][1] ** 2 + m[0][2] ** 2 + m[1][2] ** 2;
  const q = (m[0][0] + m[1][1] + m[2][2]) / 3;
  if (p1 < 1e-30) return [m[0][0], m[1][1], m[2][2]];
  const p2 = (m[0][0] - q) ** 2 + (m[1][1] - q) ** 2 + (m[2][2] - q) ** 2 + 2 * p1;
  const p = Math.sqrt(p2 / 6);
  const b = m.map((r, i) => r.map((x, j) => (x - (i === j ? q : 0)) / p));
  const det = b[0][0] * (b[1][1] * b[2][2] - b[1][2] * b[2][1]) - b[0][1] * (b[1][0] * b[2][2] - b[1][2] * b[2][0]) + b[0][2] * (b[1][0] * b[2][1] - b[1][1] * b[2][0]);
  const r = Math.max(-1, Math.min(1, det / 2));
  const phi = Math.acos(r) / 3;
  const e1 = q + 2 * p * Math.cos(phi);
  const e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  return [e1, 3 * q - e1 - e3, e3];
}

/** the frame of the projection: the contour's mean plane turned to the clicks' side */
export function surfaceFrame(points: V3[], normals: Array<V3 | null | undefined>): ElevationPlane | null {
  const facing = facingOf(normals, null);
  if (points.length >= 3) {
    const pl = fitPlane(points, facing);
    if (pl) return pl;
  }
  // fewer than three clicks (the preview): the plane of the first click's normal
  if (!points.length || !facing) return null;
  const n = facing;
  let u = cross([0, 1, 0], n);
  if (len(u) < 1e-6) u = [1, 0, 0];
  u = unit(sub(u, mul(n, dot(u, n))));
  const c: V3 = mul(points.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / points.length);
  return { c, n, u, v: cross(n, u), rms: 0, max: 0 };
}

// ── the triangles in the frame ─────────────────────────────────────────────────
interface Prepared {
  pl: ElevationPlane;
  /** 2D of each corner (x, y), depth along n */
  x: Float64Array; y: Float64Array; d: Float64Array;
  /** 3D of each corner */
  p: Float64Array;
  /** triangle count, and those seen from the clicks' side */
  count: number;
  front: Uint8Array;
  /** 0: degenerate (no area in 3D) */
  solid: Uint8Array;
}
function prepare(tris: SurfaceTris, pl: ElevationPlane, twoSided: boolean): Prepared {
  const P = tris.positions;
  const count = Math.floor(P.length / 9);
  const x = new Float64Array(count * 3), y = new Float64Array(count * 3), d = new Float64Array(count * 3), p = new Float64Array(count * 9);
  const front = new Uint8Array(count);
  const solid = new Uint8Array(count);
  const { c, n, u, v } = pl;
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      const px = P[o] - c[0], py = P[o + 1] - c[1], pz = P[o + 2] - c[2];
      p[o] = P[o]; p[o + 1] = P[o + 1]; p[o + 2] = P[o + 2];
      x[t * 3 + k] = px * u[0] + py * u[1] + pz * u[2];
      y[t * 3 + k] = px * v[0] + py * v[1] + pz * v[2];
      d[t * 3 + k] = px * n[0] + py * n[1] + pz * n[2];
    }
    const o = t * 9;
    const e1: V3 = [P[o + 3] - P[o], P[o + 4] - P[o + 1], P[o + 5] - P[o + 2]];
    const e2: V3 = [P[o + 6] - P[o], P[o + 7] - P[o + 1], P[o + 8] - P[o + 2]];
    const nt = cross(e1, e2);
    const l = len(nt);
    if (l <= 1e-14) continue;
    solid[t] = 1;
    const cs = dot(nt, n) / l;
    front[t] = (twoSided ? Math.abs(cs) : cs) > SURF_TOL.facing ? 1 : 0;
  }
  return { pl, x, y, d, p, count, front, solid };
}

/** the depth of the triangle's plane at a 2D point, and its barycentrics (null: degenerate in plan) */
function bary(pr: Prepared, t: number, X: number, Y: number): [number, number, number] | null {
  const ax = pr.x[t * 3], ay = pr.y[t * 3], bx = pr.x[t * 3 + 1], by = pr.y[t * 3 + 1], cx = pr.x[t * 3 + 2], cy = pr.y[t * 3 + 2];
  const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(det) < 1e-18) return null;
  const l1 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / det;
  const l2 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / det;
  return [l1, l2, 1 - l1 - l2];
}
function lift(pr: Prepared, t: number, b: [number, number, number]): V3 {
  const o = t * 9;
  return [b[0] * pr.p[o] + b[1] * pr.p[o + 3] + b[2] * pr.p[o + 6],
    b[0] * pr.p[o + 1] + b[1] * pr.p[o + 4] + b[2] * pr.p[o + 7],
    b[0] * pr.p[o + 2] + b[1] * pr.p[o + 5] + b[2] * pr.p[o + 8]];
}
const depthAt = (pr: Prepared, t: number, b: [number, number, number]) => b[0] * pr.d[t * 3] + b[1] * pr.d[t * 3 + 1] + b[2] * pr.d[t * 3 + 2];

/** a uniform grid over the triangles' 2D boxes (only those `keep` says) */
class Grid {
  cell: number; x0: number; y0: number; nx: number; ny: number; cells: Map<number, number[]> = new Map();
  constructor(pr: Prepared, keep: (t: number) => boolean, box: [number, number, number, number]) {
    const [x0, y0, x1, y1] = box;
    const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6);
    let n = 0;
    for (let t = 0; t < pr.count; t++) if (keep(t)) n++;
    const side = Math.max(1, Math.round(Math.sqrt(Math.max(1, n) / 2)));
    this.cell = Math.max(w, h) / side;
    this.x0 = x0; this.y0 = y0;
    this.nx = Math.max(1, Math.ceil(w / this.cell)); this.ny = Math.max(1, Math.ceil(h / this.cell));
    for (let t = 0; t < pr.count; t++) {
      if (!keep(t)) continue;
      const xs = [pr.x[t * 3], pr.x[t * 3 + 1], pr.x[t * 3 + 2]], ys = [pr.y[t * 3], pr.y[t * 3 + 1], pr.y[t * 3 + 2]];
      const i0 = this.ix(Math.min(...xs)), i1 = this.ix(Math.max(...xs)), j0 = this.iy(Math.min(...ys)), j1 = this.iy(Math.max(...ys));
      if (i1 < 0 || j1 < 0 || i0 >= this.nx || j0 >= this.ny) continue;
      for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) for (let j = Math.max(0, j0); j <= Math.min(this.ny - 1, j1); j++) {
        const k = i * this.ny + j;
        const a = this.cells.get(k);
        if (a) a.push(t); else this.cells.set(k, [t]);
      }
    }
  }
  ix(x: number) { return Math.floor((x - this.x0) / this.cell); }
  iy(y: number) { return Math.floor((y - this.y0) / this.cell); }
  /** the triangles whose box may meet the box (x0, y0)–(x1, y1) */
  near(x0: number, y0: number, x1: number, y1: number): number[] {
    const out = new Set<number>();
    const i0 = Math.max(0, this.ix(x0)), i1 = Math.min(this.nx - 1, this.ix(x1)), j0 = Math.max(0, this.iy(y0)), j1 = Math.min(this.ny - 1, this.iy(y1));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const t of this.cells.get(i * this.ny + j) ?? []) out.add(t);
    return [...out];
  }
}

/** the parameters [t0, t1] of the segment A→B inside a triangle (2D, Cyrus–Beck), null: outside */
function segInTri(pr: Prepared, t: number, A: P2, B: P2): [number, number] | null {
  let t0 = 0, t1 = 1;
  const xs = [pr.x[t * 3], pr.x[t * 3 + 1], pr.x[t * 3 + 2]], ys = [pr.y[t * 3], pr.y[t * 3 + 1], pr.y[t * 3 + 2]];
  const area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
  if (Math.abs(area) < 1e-18) return null;
  const s = area > 0 ? 1 : -1;
  const dx = B.x - A.x, dy = B.y - A.y;
  for (let k = 0; k < 3; k++) {
    const ax = xs[k], ay = ys[k], bx = xs[(k + 1) % 3], by = ys[(k + 1) % 3];
    // inside: s · cross(b − a, p − a) ≥ 0
    const ex = bx - ax, ey = by - ay;
    const num = s * (ex * (A.y - ay) - ey * (A.x - ax));
    const den = s * (ex * dy - ey * dx);
    if (Math.abs(den) < 1e-18) { if (num < -1e-12) return null; continue; }
    const tt = -num / den;
    if (den > 0) t0 = Math.max(t0, tt); else t1 = Math.min(t1, tt);
    if (t0 > t1) return null;
  }
  return t1 - t0 > 1e-12 ? [t0, t1] : null;
}

/**
 * The DRAPED path of the clicks (the live preview): each side split wherever
 * it crosses an edge of the mesh and lifted on the triangle under it — of the
 * triangles under a stretch, the one nearest to the side's chord (the layer
 * the two clicks are on). A stretch with no triangle under it stays straight.
 */
export function drapePath(points: V3[], closed: boolean, tris: SurfaceTris, frame: ElevationPlane | null = null): V3[] {
  if (points.length < 2) return points.map((p) => [...p] as V3);
  const pl = frame ?? surfaceFrame(points, []);
  if (!pl) return points.map((p) => [...p] as V3);
  const pr = prepare(tris, pl, false);
  const q = (p: V3): P2 => { const d = sub(p, pl.c); return { x: dot(d, pl.u), y: dot(d, pl.v) }; };
  const dq = (p: V3) => dot(sub(p, pl.c), pl.n);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const p of points) { const a = q(p); bx0 = Math.min(bx0, a.x); by0 = Math.min(by0, a.y); bx1 = Math.max(bx1, a.x); by1 = Math.max(by1, a.y); }
  const grid = new Grid(pr, (t) => pr.front[t] === 1, [bx0, by0, bx1, by1]);
  const out: V3[] = [];
  const push = (p: V3) => { const l = out[out.length - 1]; if (!l || len(sub(l, p)) > 1e-6) out.push(p); };
  const n = points.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a3 = points[i], b3 = points[(i + 1) % n];
    const A = q(a3), B = q(b3), da = dq(a3), db = dq(b3);
    const cand = grid.near(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.max(A.x, B.x), Math.max(A.y, B.y));
    const spans: Array<{ t: number; s: [number, number] }> = [];
    const cuts = new Set<number>([0, 1]);
    for (const t of cand) { const s = segInTri(pr, t, A, B); if (s) { spans.push({ t, s }); cuts.add(s[0]); cuts.add(s[1]); } }
    const ts = [...cuts].sort((x, y) => x - y);
    const at = (tt: number): P2 => ({ x: A.x + (B.x - A.x) * tt, y: A.y + (B.y - A.y) * tt });
    push([...a3] as V3);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if (t1 - t0 < 1e-9) continue;
      const tm = (t0 + t1) / 2, M = at(tm), chord = da + (db - da) * tm;
      let best = -1, bd = Infinity;
      for (const sp of spans) {
        if (sp.s[0] > tm || sp.s[1] < tm) continue;
        const b = bary(pr, sp.t, M.x, M.y);
        if (!b) continue;
        const dd = Math.abs(depthAt(pr, sp.t, b) - chord);
        if (dd < bd) { bd = dd; best = sp.t; }
      }
      for (const tt of [t0, t1]) {
        if (tt === 0 || tt === 1) continue;
        const P = at(tt);
        const b = best >= 0 ? bary(pr, best, P.x, P.y) : null;
        push(b ? lift(pr, best, b) : add(a3, mul(sub(b3, a3), tt)));
      }
    }
    if (!closed && i === n - 2) push([...b3] as V3);
  }
  return out;
}

/** a point brought onto the model along the frame's normal: of the triangles
 *  under it (seen from the clicks' side), the one nearest in depth — a point
 *  inserted on a side (its chord may run inside the relief); null: none under it */
export function surfaceLift(p: V3, tris: SurfaceTris, frame: ElevationPlane): V3 | null {
  const pr = prepare(tris, frame, false);
  const d = sub(p, frame.c);
  const X = dot(d, frame.u), Y = dot(d, frame.v), D = dot(d, frame.n);
  let best: V3 | null = null, bd = Infinity;
  for (let t = 0; t < pr.count; t++) {
    if (!pr.front[t]) continue;
    const b = bary(pr, t, X, Y);
    if (!b || b.some((l) => l < -1e-9)) continue;
    const dd = Math.abs(depthAt(pr, t, b) - D);
    if (dd < bd) { bd = dd; best = lift(pr, t, b); }
  }
  return best;
}

// ── the cut ────────────────────────────────────────────────────────────────────

/** weld points closer than `tol` (a hash of cells, the 27 neighbours looked at) */
class Welder {
  private cells = new Map<string, number[]>();
  readonly pts: V3[] = [];
  constructor(private tol: number) {}
  id(p: V3): number {
    const s = this.tol * 2;
    const i = Math.floor(p[0] / s), j = Math.floor(p[1] / s), k = Math.floor(p[2] / s);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const q of this.cells.get(`${i + a},${j + b},${k + c}`) ?? []) {
        const o = this.pts[q];
        if (Math.abs(o[0] - p[0]) <= this.tol && Math.abs(o[1] - p[1]) <= this.tol && Math.abs(o[2] - p[2]) <= this.tol) return q;
      }
    }
    const id = this.pts.length;
    this.pts.push([p[0], p[1], p[2]]);
    const key = `${i},${j},${k}`;
    const arr = this.cells.get(key);
    if (arr) arr.push(id); else this.cells.set(key, [id]);
    return id;
  }
}

/** Sutherland–Hodgman: the polygon `subject` clipped by the CONVEX counter-clockwise `win` */
function clipConvex(subject: P2[], win: P2[]): P2[] {
  let out = subject;
  for (let k = 0; k < win.length && out.length; k++) {
    const a = win[k], b = win[(k + 1) % win.length];
    const inside = (p: P2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-14;
    const cut = (p: P2, q: P2): P2 => {
      const ex = b.x - a.x, ey = b.y - a.y;
      const den = ex * (q.y - p.y) - ey * (q.x - p.x);
      const tt = den === 0 ? 0 : (ex * (a.y - p.y) - ey * (a.x - p.x)) / den;
      return { x: p.x + (q.x - p.x) * tt, y: p.y + (q.y - p.y) * tt };
    };
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const p = inp[i], q = inp[(i + 1) % inp.length];
      const pin = inside(p), qin = inside(q);
      if (pin) { out.push(p); if (!qin) out.push(cut(p, q)); }
      else if (qin) out.push(cut(p, q));
    }
  }
  return out;
}

const segCross = (a: P2, b: P2, c: P2, d: P2): boolean => {
  const o = (p: P2, q: P2, r: P2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

/**
 * Cut the areal: the RM's triangles under the contour, inside kept whole,
 * crossing clipped, lifted back on their own plane, the offset applied.
 * `tris`: the RM's triangles around the contour (scene frame) — all those
 * under it (the caller gathers them with a margin; on a tileset, its leaves).
 */
export function cutSurface(input: SurfaceInput, tris: SurfaceTris, opts: { slits?: boolean } = {}): SurfaceResult {
  const cleaned = surfaceContour(input);
  const pts = cleaned.points.map((w) => w.p);
  if (pts.length < 3) return { ok: false, error: { code: "too_few" } };
  const pl = surfaceFrame(pts, cleaned.normals);
  if (!pl) return { ok: false, error: { code: "no_plane" } };
  const twoSided = !facingOf(cleaned.normals, null);
  let poly: P2[] = pts.map((p) => { const d = sub(p, pl.c); return { x: dot(d, pl.u), y: dot(d, pl.v) }; });
  const si = selfIntersection(poly);
  if (si) return { ok: false, error: { code: "self_intersect", edges: si } };
  if (signedArea2(poly) < 0) poly = [...poly].reverse();
  const polygonArea = Math.abs(signedArea2(poly)) / 2;
  if (polygonArea < 1e-8) return { ok: false, error: { code: "no_plane" } };
  const classification = classifySurface(pts, cleaned.normals);
  const pr = prepare(tris, pl, twoSided);
  if (!pr.count) return { ok: false, error: { code: "no_mesh" } };

  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const a of poly) { bx0 = Math.min(bx0, a.x); by0 = Math.min(by0, a.y); bx1 = Math.max(bx1, a.x); by1 = Math.max(by1, a.y); }
  // ── the candidates: meeting the contour in plan (seen from the clicks' side, or turned away: joined only behind them, a little)
  const state = new Int8Array(pr.count);             // 0 no, 1 inside, 2 crossing
  let candidates = 0;
  for (let t = 0; t < pr.count; t++) {
    if (!pr.solid[t]) continue;
    const tx = [pr.x[t * 3], pr.x[t * 3 + 1], pr.x[t * 3 + 2]], ty = [pr.y[t * 3], pr.y[t * 3 + 1], pr.y[t * 3 + 2]];
    if (Math.max(...tx) < bx0 || Math.min(...tx) > bx1 || Math.max(...ty) < by0 || Math.min(...ty) > by1) continue;
    const ins = [0, 1, 2].map((k) => insidePolygon(poly, tx[k], ty[k]));
    let crosses = false;
    const tri2: P2[] = [0, 1, 2].map((k) => ({ x: tx[k], y: ty[k] }));
    const tminx = Math.min(...tx), tmaxx = Math.max(...tx), tminy = Math.min(...ty), tmaxy = Math.max(...ty);
    for (let i = 0; i < poly.length && !crosses; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (Math.max(a.x, b.x) < tminx || Math.min(a.x, b.x) > tmaxx || Math.max(a.y, b.y) < tminy || Math.min(a.y, b.y) > tmaxy) continue;
      for (let k = 0; k < 3; k++) if (segCross(a, b, tri2[k], tri2[(k + 1) % 3])) { crosses = true; break; }
      // a corner of the contour inside the triangle
      if (!crosses && bary(pr, t, a.x, a.y)?.every((l) => l >= 0)) crosses = true;
    }
    if (ins.every(Boolean) && !crosses) state[t] = 1;
    else if (ins.some(Boolean) || crosses) state[t] = 2;
    if (state[t] && pr.front[t]) candidates++;
  }
  // ── the layer the clicks are on: seeds under each click, adjacency from them
  // the adjacency: vertices welded at the seam's tolerance (a tileset's leaves); a
  // triangle given twice (the same three vertices) is left out
  const welder = new Welder(SURF_TOL.seam);
  const twin = new Welder(SURF_TOL.weld);
  const vid = new Int32Array(pr.count * 3).fill(-1);
  const byVertex = new Map<number, number[]>();
  const tri3 = new Set<string>();
  let duplicates = 0;
  for (let t = 0; t < pr.count; t++) {
    if (!state[t]) continue;
    const ids: number[] = [];
    for (let k = 0; k < 3; k++) { const o = t * 9 + k * 3; ids.push(twin.id([pr.p[o], pr.p[o + 1], pr.p[o + 2]])); }
    const key = ids.sort((a, b) => a - b).join(",");
    if (tri3.has(key)) { state[t] = 0; duplicates++; continue; }
    tri3.add(key);
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      const id = welder.id([pr.p[o], pr.p[o + 1], pr.p[o + 2]]);
      vid[t * 3 + k] = id;
      const a = byVertex.get(id);
      if (a) a.push(t); else byVertex.set(id, [t]);
    }
  }
  const off: number[] = [];
  const seeds: number[] = [];
  const diag = Math.hypot(bx1 - bx0, by1 - by0);
  pts.forEach((p, i) => {
    const d = sub(p, pl.c);
    const X = dot(d, pl.u), Y = dot(d, pl.v), D = dot(d, pl.n);
    let best = -1, bd = Infinity;
    for (let t = 0; t < pr.count; t++) {
      if (!state[t] || !pr.front[t]) continue;
      const b = bary(pr, t, X, Y);
      if (!b || b.some((l) => l < -1e-6)) continue;
      const dd = Math.abs(depthAt(pr, t, b) - D);
      if (dd < bd) { bd = dd; best = t; }
    }
    if (best < 0 || bd > Math.max(SURF_TOL.onModel, diag * 0.02)) off.push(i);
    else seeds.push(best);
  });
  if (off.length) return { ok: false, error: { code: "off_model", at: off } };
  const keep = new Uint8Array(pr.count);
  const stack = [...seeds];
  for (const s of seeds) keep[s] = 1;
  while (stack.length) {
    const t = stack.pop()!;
    for (let k = 0; k < 3; k++) for (const u of byVertex.get(vid[t * 3 + k]) ?? []) if (!keep[u] && pr.front[u]) { keep[u] = 1; stack.push(u); }
  }
  // the slits: a triangle turned away (the underside of a stone's lip, a joint) joined
  // to the surface seen when it lies at most `slit` behind the front triangle it is
  // reached from — never deeper (a wall's back face is its thickness behind)
  let turned = 0;
  if (opts.slits !== false) {
    const ref = new Float64Array(pr.count).fill(NaN);
    const minD = (t: number) => Math.min(pr.d[t * 3], pr.d[t * 3 + 1], pr.d[t * 3 + 2]);
    const queue: number[] = [];
    for (let t = 0; t < pr.count; t++) if (keep[t]) { ref[t] = minD(t); queue.push(t); }
    while (queue.length) {
      const t = queue.pop()!;
      for (let k = 0; k < 3; k++) for (const u of byVertex.get(vid[t * 3 + k]) ?? []) {
        if (keep[u] || pr.front[u] || !state[u]) continue;
        if (minD(u) < ref[t] - SURF_TOL.slit) continue;
        keep[u] = 1; ref[u] = ref[t]; turned++; queue.push(u);
      }
    }
  }
  // the seams' overlaps: a kept triangle whose centre lies on a kept triangle of
  // ANOTHER mesh (the lower-numbered wins) at the same depth is the same surface twice
  let overlaps = 0;
  const own = tris.owners;
  if (own && own.length >= pr.count) {
    const live = (t: number) => keep[t] === 1 && state[t] !== 0 && pr.front[t] === 1;
    const g = new Grid(pr, live, [bx0, by0, bx1, by1]);
    for (let t = 0; t < pr.count; t++) {
      if (!live(t)) continue;
      const X = (pr.x[t * 3] + pr.x[t * 3 + 1] + pr.x[t * 3 + 2]) / 3, Y = (pr.y[t * 3] + pr.y[t * 3 + 1] + pr.y[t * 3 + 2]) / 3;
      const D = (pr.d[t * 3] + pr.d[t * 3 + 1] + pr.d[t * 3 + 2]) / 3;
      for (const u of g.near(X, Y, X, Y)) {
        if (u === t || !live(u) || own[u] >= own[t]) continue;
        const b = bary(pr, u, X, Y);
        if (!b || b.some((l) => l < -1e-9)) continue;
        if (Math.abs(depthAt(pr, u, b) - D) < SURF_TOL.overlapDepth) { keep[t] = 0; overlaps++; break; }
      }
    }
  }
  // ── the cut: whole inside, clipped across, lifted on the triangle's own plane
  const out = new Welder(1e-6);
  const indices: number[] = [];
  let projected = 0, seen = 0, area = 0, whole = 0, clipped = 0;
  const facingSign = twoSided ? 0 : 1;
  const emit = (t: number, a: V3, b: V3, c: V3) => {
    // the RM's own orientation
    const o = t * 9;
    const nt = cross([pr.p[o + 3] - pr.p[o], pr.p[o + 4] - pr.p[o + 1], pr.p[o + 5] - pr.p[o + 2]],
      [pr.p[o + 6] - pr.p[o], pr.p[o + 7] - pr.p[o + 1], pr.p[o + 8] - pr.p[o + 2]]);
    const nn = cross(sub(b, a), sub(c, a));
    const ar = len(nn) / 2;
    if (ar < 1e-12) return;
    area += ar;
    const ia = out.id(a), ib = out.id(b), ic = out.id(c);
    if (ia === ib || ib === ic || ia === ic) return;
    if (dot(nn, nt) >= 0) indices.push(ia, ib, ic); else indices.push(ia, ic, ib);
  };
  void facingSign;
  for (let t = 0; t < pr.count; t++) {
    if (!keep[t] || !state[t]) continue;
    const tri2: P2[] = [0, 1, 2].map((k) => ({ x: pr.x[t * 3 + k], y: pr.y[t * 3 + k] }));
    const a2 = (tri2[1].x - tri2[0].x) * (tri2[2].y - tri2[0].y) - (tri2[2].x - tri2[0].x) * (tri2[1].y - tri2[0].y);
    if (state[t] === 1) {
      const o = t * 9;
      emit(t, [pr.p[o], pr.p[o + 1], pr.p[o + 2]], [pr.p[o + 3], pr.p[o + 4], pr.p[o + 5]], [pr.p[o + 6], pr.p[o + 7], pr.p[o + 8]]);
      projected += Math.abs(a2) / 2;
      if (pr.front[t]) seen += Math.abs(a2) / 2;
      whole++;
      continue;
    }
    const win = a2 >= 0 ? tri2 : [tri2[0], tri2[2], tri2[1]];
    let piece = clipConvex(poly, win);
    piece = piece.filter((p, i) => { const q = piece[(i + 1) % piece.length]; return Math.hypot(p.x - q.x, p.y - q.y) > 1e-9; });
    if (piece.length < 3) continue;
    if (signedArea2(piece) < 0) piece.reverse();
    let any = false;
    for (const [i, j, k] of triangulate(piece)) {
      const A = piece[i], B = piece[j], C = piece[k];
      const sa = ((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
      if (sa <= 1e-14) continue;
      // a triangle of a weakly simple piece that leaves the contour is not the areal's
      if (!insidePolygon(poly, (A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3)) continue;
      const la = bary(pr, t, A.x, A.y), lb = bary(pr, t, B.x, B.y), lc = bary(pr, t, C.x, C.y);
      if (!la || !lb || !lc) continue;
      emit(t, lift(pr, t, la), lift(pr, t, lb), lift(pr, t, lc));
      // the folds count the surface SEEN only (a slit's underside projects under its lip)
      projected += sa;
      if (pr.front[t]) seen += sa;
      any = true;
    }
    if (any) clipped++;
  }
  if (!indices.length) return { ok: false, error: { code: "off_model", coverage: 0 } };
  const coverage = projected / polygonArea;
  if (coverage < SURF_TOL.coverage) {
    // the clicks' normals turned more than 90° from each other: one direction cannot see it
    if (classification.normalVariation >= 90) return { ok: false, error: { code: "too_3d", coverage } };
    return { ok: false, error: { code: "off_model", coverage } };
  }
  // ── the border (edges of one triangle), chained into loops
  const edgeUse = new Map<string, number>();
  const ek = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let i = 0; i < indices.length; i += 3) for (let k = 0; k < 3; k++) {
    const key = ek(indices[i + k], indices[i + (k + 1) % 3]);
    edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
  }
  const next = new Map<number, number[]>();
  let perimeter = 0, inner = 0;
  // a border edge ON the contour: both ends on one of its sides, in plan
  const onContour = (q: V3): number => {
    const d = sub(q, pl.c);
    const X = dot(d, pl.u), Y = dot(d, pl.v);
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const tt = l2 > 0 ? Math.max(0, Math.min(1, ((X - a.x) * dx + (Y - a.y) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(a.x + tt * dx - X, a.y + tt * dy - Y));
    }
    return best;
  };
  for (let i = 0; i < indices.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = indices[i + k], b = indices[i + (k + 1) % 3];
    if (edgeUse.get(ek(a, b)) !== 1) continue;
    const el = len(sub(out.pts[a], out.pts[b]));
    if (onContour(out.pts[a]) < 1e-6 && onContour(out.pts[b]) < 1e-6) perimeter += el; else inner += el;
    const l = next.get(a);
    if (l) l.push(b); else next.set(a, [b]);
  }
  const boundary: V3[][] = [];
  const used = new Set<string>();
  for (const [start, outs] of next) for (const first of outs) {
    if (used.has(`${start}>${first}`)) continue;
    const loop: V3[] = [out.pts[start]];
    let a = start, b = first, guard = 0;
    used.add(`${a}>${b}`);
    while (b !== start && guard++ < 1e6) {
      loop.push(out.pts[b]);
      const nx = (next.get(b) ?? []).find((c) => !used.has(`${b}>${c}`));
      if (nx === undefined) break;
      used.add(`${b}>${nx}`);
      a = b; b = nx;
    }
    void a;
    if (loop.length >= 3) boundary.push(loop);
  }
  const loopLen = (l: V3[]) => l.reduce((s, p, i) => s + len(sub(l[(i + 1) % l.length], p)), 0);
  boundary.sort((x, y) => loopLen(y) - loopLen(x));

  // ── the offset along the vertex normals (area-weighted), EM Tools' stacking
  const nrm = out.pts.map(() => [0, 0, 0] as V3);
  for (let i = 0; i < indices.length; i += 3) {
    const a = out.pts[indices[i]], b = out.pts[indices[i + 1]], c = out.pts[indices[i + 2]];
    const fn = cross(sub(b, a), sub(c, a));
    for (let k = 0; k < 3; k++) { const v = nrm[indices[i + k]]; v[0] += fn[0]; v[1] += fn[1]; v[2] += fn[2]; }
  }
  const stackN = Math.min(Math.max(0, Math.floor(input.stack ?? 0)) + 1, SURF_TOL.stackMax);
  const base = Math.max(0, Math.min(SURF_TOL.offsetMax, Number.isFinite(input.offset) ? Number(input.offset) : SURF_TOL.offset));
  const offset = base * stackN;
  // the normals turned to the clicks' side (a mesh wound the other way)
  const sideOf = (v: V3) => (twoSided ? 1 : Math.sign(dot(v, pl.n)) || 1);
  const origin: V3 = mul(pts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / pts.length);
  const positions: number[] = [];
  out.pts.forEach((p, i) => {
    const n = unit(nrm[i]);
    const q = add(p, mul(n, offset * sideOf(n)));
    positions.push(q[0] - origin[0], q[1] - origin[1], q[2] - origin[2]);
  });
  const warnings: SurfaceWarning[] = [];
  if (cleaned.merged) warnings.push({ code: "merged", n: cleaned.merged });
  if (seen / polygonArea > SURF_TOL.overlap) warnings.push({ code: "folds", ratio: seen / polygonArea });
  warnings.push({ code: "scenario", scenario: classification.scenario });
  return { ok: true, mesh: {
    origin, positions, indices, boundary, area, perimeter, polygonArea, coverage,
    stats: { triangles: indices.length / 3, vertices: out.pts.length, whole, clipped, candidates, source: pr.count, loops: boundary.length, turned, duplicates, inner, overlaps },
    offset, plane: { c: pl.c, n: pl.n, u: pl.u, v: pl.v }, classification, warnings,
  } };
}

// ── the inputs: read back, edited, signed ──────────────────────────────────────

/** the inputs read back from the layout (null: not an areal's) */
export function readSurfaceInput(v: unknown): SurfaceInput | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.contour)) return null;
  const tri = (x: unknown): V3 | null => (Array.isArray(x) && x.length === 3 && x.every((c) => Number.isFinite(Number(c))) ? x.map(Number) as V3 : null);
  const contour: WallPoint[] = [];
  for (const w of o.contour as unknown[]) {
    const r = w as Record<string, unknown>;
    const p = tri(r?.p);
    if (!p) return null;
    contour.push({ p, rm: typeof r.rm === "string" ? r.rm : null, doc: typeof r.doc === "string" ? r.doc : null,
      ...(typeof r.note === "string" && r.note ? { note: r.note } : {}) });
  }
  if (contour.length < 3) return null;
  const normals = Array.isArray(o.normals) ? (o.normals as unknown[]).map(tri) : undefined;
  return { contour, ...(normals ? { normals } : {}),
    ...(Number.isFinite(Number(o.offset)) ? { offset: Number(o.offset) } : {}),
    ...(Number.isFinite(Number(o.stack)) ? { stack: Number(o.stack) } : {}) };
}

export type SurfaceEdit =
  | { op: "set"; k: number; to: WallPoint; normal?: V3 | null }
  | { op: "insert"; after: number; at: WallPoint; normal?: V3 | null }
  | { op: "remove"; k: number }
  | { op: "offset"; offset: number };
/** a correction of the contour (as the wall's, PX1b): a point moved, one inserted after a side's start, one taken away (three stay) */
export function editSurface<T extends SurfaceInput>(input: T, e: SurfaceEdit): { ok: true; input: T } | { ok: false; why: "too_few" | "range" } {
  const contour = input.contour.map((w) => ({ ...w }));
  const normals = input.contour.map((_, i) => input.normals?.[i] ?? null);
  if (e.op === "offset") return { ok: true, input: { ...input, offset: Math.max(0, Math.min(SURF_TOL.offsetMax, e.offset)) } };
  if (e.op === "set") {
    if (e.k < 0 || e.k >= contour.length) return { ok: false, why: "range" };
    contour[e.k] = { ...e.to, ...(contour[e.k].note && !e.to.note ? { note: contour[e.k].note } : {}) };
    if (e.normal !== undefined) normals[e.k] = e.normal;
  } else if (e.op === "insert") {
    if (e.after < 0 || e.after >= contour.length) return { ok: false, why: "range" };
    contour.splice(e.after + 1, 0, { ...e.at });
    normals.splice(e.after + 1, 0, e.normal ?? null);
  } else {
    if (e.k < 0 || e.k >= contour.length) return { ok: false, why: "range" };
    if (contour.length <= 3) return { ok: false, why: "too_few" };
    contour.splice(e.k, 1);
    normals.splice(e.k, 1);
  }
  return { ok: true, input: { ...input, contour, normals } };
}

/** the midpoints of the contour's sides (the «+» handles) */
export function surfaceSides(contour: WallPoint[]): Array<{ after: number; p: V3 }> {
  return contour.map((w, i) => ({ after: i, p: mul(add(w.p, contour[(i + 1) % contour.length].p), 0.5) }));
}

export function surfaceSig(input: SurfaceInput, extra = ""): string {
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  return `${input.contour.map((w) => w.p.map(r).join(",")).join(";")}|${input.offset ?? ""}|${input.stack ?? ""}|${extra}`;
}

/** the models the contour fell on (an areal is extracted from ONE) */
export function surfaceModels(contour: WallPoint[]): Array<string | null> {
  const out: Array<string | null> = [];
  for (const w of contour) { const m = w.rm ?? null; if (!out.includes(m)) out.push(m); }
  return out;
}

// ── the mesh kept in the layout (base64 of float32 / uint32) ───────────────────
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return s;
}
function fromB64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length && clean[i + 2] !== undefined) out[o++] = (n >> 8) & 255;
    if (o < out.length && clean[i + 3] !== undefined) out[o++] = n & 255;
  }
  return out;
}
export interface PackedMesh { p: string; i: string; nv: number; nt: number }
/** the areal's mesh as the layout keeps it: its vertices (float32, local) and triangles (uint32) */
export function packMesh(positions: ArrayLike<number>, indices: ArrayLike<number>): PackedMesh {
  const f = Float32Array.from(positions as ArrayLike<number>);
  const u = Uint32Array.from(indices as ArrayLike<number>);
  return { p: toB64(new Uint8Array(f.buffer)), i: toB64(new Uint8Array(u.buffer)), nv: f.length / 3, nt: u.length / 3 };
}
export function unpackMesh(m: unknown): { positions: Float32Array; indices: Uint32Array } | null {
  const o = m as Record<string, unknown> | null;
  if (!o || typeof o.p !== "string" || typeof o.i !== "string") return null;
  const pb = fromB64(o.p), ib = fromB64(o.i);
  if (pb.length % 12 || ib.length % 12) return null;
  const positions = new Float32Array(pb.buffer.slice(pb.byteOffset, pb.byteOffset + pb.length));
  const indices = new Uint32Array(ib.buffer.slice(ib.byteOffset, ib.byteOffset + ib.length));
  for (const k of indices) if (k >= positions.length / 3) return null;
  return { positions, indices };
}
