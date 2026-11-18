/**
 * MICRO-PL10-POSA-NELLO-SPAZIO (W7, E.D. 18 Nov 2026) · WHAT A PACKAGE PLACES
 * ON A MODEL, read in the page: the tools of its extractor types and landmark
 * sets, where a guided pose stands, which point comes next, and the GHOST of
 * the points still to place (SPEC-pacchetto §5.3–§5.5).
 *
 * The writing is the library's (the bridge's /pose/*: `place_extractor`,
 * `place_landmark`, `compute_available`); here only what the page needs to
 * guide a hand:
 *   · a pose is read back from the graph (the CombinerNode with
 *     `data.landmark_pose`, its `combines` extractors with `data.landmark`,
 *     each one's region's one coordinate): no id is recomputed here;
 *   · the next point: the symmetric one right after its pair (`mirror`), else
 *     the first not placed in the set's order;
 *   · the ghost: once three points with a reference position (`ref`) are
 *     placed, the similarity (rotation, uniform scale, translation: the set's
 *     reference frame is «normalized», its unit a distance of the face) that
 *     takes them onto the model — Horn's quaternion solution of Procrustes —
 *     carries every other `ref` to where it is EXPECTED. A ghost is help,
 *     never a value: nothing here writes a point (§5.4);
 *   · a point placed far from where it was expected (more than `FAR` of the
 *     set's unit on the model) is said, never refused.
 * Pure: `check-space-tools`.
 */
import type { V3 } from "./space-tools";

type Multi = Record<string, string> | string | undefined | null;
const labelIn = (v: Multi, lang: string): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return v[lang] ?? v[lang.split("-")[0]] ?? v.en ?? Object.values(v)[0] ?? "";
};

// ── the tools a package brings ──────────────────────────────────────────────

export type Primitive = "point" | "line" | "polyline" | "surface" | "volume";
export interface PackageGeometry {
  primitive: Primitive;
  produces?: string;
  unit: string;
  snap: "surface" | "vertex" | "free";
  frame: "model" | "graph";
  vertices: { min: number; max: number | null };
}
/** A type's geometry with the SPEC's defaults — the twin of
 *  `ProfileOverlay.extractor_geometry` (s3Dgraphy, W3). Null: no geometry. */
export function geometryOf(entry: { geometry?: unknown } | null | undefined): PackageGeometry | null {
  const g = entry?.geometry as Record<string, unknown> | undefined;
  if (!g || typeof g !== "object" || !g.primitive) return null;
  const prim = String(g.primitive) as Primitive;
  const least = ({ point: 1, line: 2, polyline: 2, surface: 3 } as Record<string, number>)[prim] ?? 0;
  const v = (g.vertices ?? {}) as { min?: number; max?: number };
  const min = Math.max(least, Number(v.min ?? least));
  const max = prim === "point" ? 1 : prim === "line" ? 2 : v.max != null ? Number(v.max) : null;
  const snap = String(g.snap ?? "surface");
  return { primitive: prim, produces: g.produces ? String(g.produces) : undefined,
           unit: String(g.unit ?? (prim === "surface" ? "m2" : prim === "volume" ? "m3" : "m")),
           snap: (snap === "vertex" || snap === "free" ? snap : "surface") as PackageGeometry["snap"],
           frame: g.frame === "graph" ? "graph" : "model", vertices: { min, max } };
}

export interface PackageTool {
  /** `pkg:<type>` or `lms:<set>` */
  id: string;
  kind: "extractor" | "landmarks";
  /** the extractor type, or the landmark set */
  ref: string;
  /** the extractor type a landmark set places */
  extractorType?: string;
  label: string;
  geometry: PackageGeometry;
  /** the package's name */
  origin: string;
  /** why it cannot be a tool (a volume: its hulls are a SemanticShape) */
  unplaceable?: "volume";
}
interface OverlayLike {
  profiles?: Array<{ name: string; prefix: string; iri?: string }>;
  extractor_types?: Record<string, { id: string; label?: Multi; geometry?: unknown; profile?: string }>;
  landmark_sets?: Record<string, unknown>;
}
const originOf = (ov: OverlayLike, id: string, iri?: string): string =>
  (ov.profiles ?? []).find((p) => (iri && p.iri === iri) || id.startsWith(`${p.prefix}:`))?.name ?? id.split(":")[0];

/** The tools of the overlay's packages, in its order: an extractor type with a
 *  geometry is one tool, a landmark set another (it places its set's type). */
export function packageToolsOf(ov: OverlayLike | null | undefined, lang: string): PackageTool[] {
  if (!ov) return [];
  const out: PackageTool[] = [];
  const types = ov.extractor_types ?? {};
  for (const e of Object.values(types)) {
    const g = geometryOf(e);
    if (!g) continue;
    out.push({ id: `pkg:${e.id}`, kind: "extractor", ref: e.id, label: labelIn(e.label, lang) || e.id, geometry: g,
               origin: originOf(ov, e.id, e.profile), ...(g.primitive === "volume" ? { unplaceable: "volume" as const } : {}) });
  }
  for (const [sid, raw] of Object.entries(ov.landmark_sets ?? {})) {
    const ls = raw as { label?: Multi; extractor_type?: string; profile?: string; set?: { label?: Multi } };
    const g = geometryOf(types[String(ls.extractor_type ?? "")]);
    if (!g || g.primitive !== "point") continue;
    out.push({ id: `lms:${sid}`, kind: "landmarks", ref: sid, extractorType: String(ls.extractor_type), geometry: g,
               label: labelIn(ls.label ?? ls.set?.label, lang) || sid, origin: originOf(ov, sid, ls.profile) });
  }
  return out;
}

// ── a landmark set and a pose ───────────────────────────────────────────────

/** a point as the bridge says it (/pose/points): its label in the language */
export interface SetPoint {
  id: string; concept?: string | null; label: string; label_lang?: string | null;
  side?: string | null; mirror?: string | null; required: boolean; ref?: number[] | null;
}

interface NodeLike { id: string; node_type?: string; name?: string; data?: unknown }
interface EdgeLike { source: string; target: string; edge_type?: string }
const dataOf = (n: NodeLike | undefined): Record<string, unknown> => (n?.data ?? {}) as Record<string, unknown>;

export interface PlacedPoint { extractorId: string; regionId: string | null; position: V3 | null }
export interface PoseState {
  /** the act's CombinerNode, when there is one */
  poseId: string | null;
  placed: Map<string, PlacedPoint>;
}

/** Where a pose of `set` on `on` (for `subject`) stands, read from the graph. */
export function poseStateOf(graph: { nodes: NodeLike[]; edges: EdgeLike[] }, set: string, on: string | null,
                            subject: string | null): PoseState {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const pose = graph.nodes.find((n) => {
    if (n.node_type !== "combiner") return false;
    const lp = dataOf(n).landmark_pose as { set?: string; on?: string | null; subject?: string | null } | undefined;
    return !!lp && lp.set === set && (lp.on ?? null) === on && (lp.subject ?? null) === subject;
  });
  const placed = new Map<string, PlacedPoint>();
  if (!pose) return { poseId: null, placed };
  for (const e of graph.edges) {
    if (e.source !== pose.id || e.edge_type !== "combines") continue;
    const x = byId.get(e.target);
    const lm = dataOf(x).landmark as { set?: string; point?: string } | undefined;
    if (!x || !lm || lm.set !== set || !lm.point) continue;
    const re = graph.edges.find((r) => r.source === x.id && r.edge_type === "extracted_from"
      && byId.get(r.target)?.node_type === "annotation_region");
    const coords = re ? dataOf(byId.get(re.target)).coords : null;
    const p = Array.isArray(coords) && Array.isArray(coords[0]) && (coords[0] as unknown[]).length === 3
      ? (coords[0] as number[]).map(Number) as V3 : null;
    placed.set(String(lm.point), { extractorId: x.id, regionId: re?.target ?? null, position: p });
  }
  return { poseId: pose.id, placed };
}

/** The poses of a set on a model already in the graph: one per unit (null = none). */
export function posesOn(graph: { nodes: NodeLike[] }, set: string, on: string | null): Array<string | null> {
  const out: Array<string | null> = [];
  for (const n of graph.nodes) {
    const lp = dataOf(n).landmark_pose as { set?: string; on?: string | null; subject?: string | null } | undefined;
    if (n.node_type === "combiner" && lp && lp.set === set && (lp.on ?? null) === on) out.push(lp.subject ?? null);
  }
  return out;
}

/** The points still missing: the required, then the others. */
export function missingOf(points: readonly SetPoint[], placed: ReadonlyMap<string, unknown>): { required: string[]; optional: string[] } {
  return { required: points.filter((p) => p.required && !placed.has(p.id)).map((p) => p.id),
           optional: points.filter((p) => !p.required && !placed.has(p.id)).map((p) => p.id) };
}

/** The point to ask next: the symmetric one of the point just placed, when it
 *  is still missing; else the first missing in the set's order (after
 *  `after`, wrapping, so «Salta» moves on); null when every point is there. */
export function nextPoint(points: readonly SetPoint[], placed: ReadonlyMap<string, unknown>,
                          justPlaced?: string | null, after?: string | null): string | null {
  if (justPlaced) {
    const m = points.find((p) => p.id === justPlaced)?.mirror;
    if (m && !placed.has(m) && points.some((p) => p.id === m)) return m;
  }
  const start = after ? points.findIndex((p) => p.id === after) + 1 : 0;
  for (let k = 0; k < points.length; k++) {
    const p = points[(start + k) % points.length];
    if (!placed.has(p.id) && p.id !== after) return p.id;
  }
  return after && !placed.has(after) ? after : null;
}

/** «esocantion (destro)»: the label a person saw, with the side of the point
 *  (the side is on the point, not in the concept: SPEC §5.4) */
export function pointLabel(p: SetPoint, sideWord: (side: string) => string): string {
  return p.side ? `${p.label} (${sideWord(p.side)})` : p.label;
}

// ── the ghost: Procrustes on the points placed ──────────────────────────────

export interface Similarity { s: number; R: number[][]; t: V3; rms: number; n: number }

const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mean = (ps: readonly (readonly number[])[]): V3 => {
  const c: V3 = [0, 0, 0];
  for (const p of ps) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return [c[0] / ps.length, c[1] / ps.length, c[2] / ps.length];
};
const mul = (R: number[][], p: readonly number[]): V3 =>
  [R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2], R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2], R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]];

/** The eigenvector of the largest eigenvalue of a symmetric 4×4 (Jacobi). */
function topEigenvector(M: number[][]): number[] {
  const a = M.map((r) => r.slice());
  const v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
    if (off < 1e-22) break;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const tt = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(tt * tt + 1), s = tt * c;
      for (let k = 0; k < 4; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 4; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 4; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  return [v[0][best], v[1][best], v[2][best], v[3][best]];
}

/**
 * The similarity x ↦ s·R·x + t that takes the reference positions `from` onto
 * the placed ones `to` in the least squares (Horn 1987, unit quaternions; the
 * scale of Umeyama 1991). Null with fewer than three pairs or when the
 * reference points are on one line (no rotation is fixed by them).
 */
export function similarityFit(from: readonly (readonly number[])[], to: readonly (readonly number[])[]): Similarity | null {
  const n = Math.min(from.length, to.length);
  if (n < 3) return null;
  const cf = mean(from.slice(0, n)), ct = mean(to.slice(0, n));
  const P = from.slice(0, n).map((p) => sub(p, cf)), Q = to.slice(0, n).map((q) => sub(q, ct));
  // on one line? the largest triangle of the reference must have an area
  let area = 0;
  const size = Math.max(...P.map((p) => Math.hypot(...p)), 1e-12);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) area = Math.max(area, Math.hypot(...cross(P[i], P[j])));
  if (area < 1e-6 * size * size) return null;
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let k = 0; k < n; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += P[k][i] * Q[k][j];
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const [w, x, y, z] = topEigenvector(N);
  const R = [
    [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
  ];
  const pp = P.reduce((a, p) => a + dot(p, p), 0);
  const s = pp > 0 ? P.reduce((a, p, k) => a + dot(Q[k], mul(R, p)), 0) / pp : 1;
  const Rc = mul(R, cf);
  const t: V3 = [ct[0] - s * Rc[0], ct[1] - s * Rc[1], ct[2] - s * Rc[2]];
  let e = 0;
  for (let k = 0; k < n; k++) {
    const m = mul(R, from[k]);
    e += Math.hypot(s * m[0] + t[0] - to[k][0], s * m[1] + t[1] - to[k][1], s * m[2] + t[2] - to[k][2]) ** 2;
  }
  return { s, R, t, rms: Math.sqrt(e / n), n };
}
export function applySimilarity(f: Similarity, p: readonly number[]): V3 {
  const m = mul(f.R, p);
  return [f.s * m[0] + f.t[0], f.s * m[1] + f.t[1], f.s * m[2] + f.t[2]];
}

const refOf = (p: SetPoint | undefined): V3 | null =>
  p && Array.isArray(p.ref) && p.ref.length === 3 && p.ref.every((c) => Number.isFinite(Number(c))) ? p.ref.map(Number) as V3 : null;

/** The fit of the placed points that have a reference position (except `skip`). */
export function poseFit(points: readonly SetPoint[], placed: ReadonlyMap<string, PlacedPoint>, skip?: string): Similarity | null {
  const from: V3[] = [], to: V3[] = [];
  for (const p of points) {
    const r = refOf(p), q = placed.get(p.id)?.position;
    if (!r || !q || p.id === skip) continue;
    from.push(r); to.push(q);
  }
  return similarityFit(from, to);
}

/** Where the points not placed yet are expected, after three placed. */
export function ghostsOf(points: readonly SetPoint[], placed: ReadonlyMap<string, PlacedPoint>): Array<{ id: string; position: V3 }> {
  const f = poseFit(points, placed);
  if (!f) return [];
  const out: Array<{ id: string; position: V3 }> = [];
  for (const p of points) {
    const r = refOf(p);
    if (r && !placed.has(p.id)) out.push({ id: p.id, position: applySimilarity(f, r) });
  }
  return out;
}

/** The share of the set's unit (on the model) past which a point is «far from
 *  where it was expected» */
export const FAR = 0.15;

/** A point just placed, against where the OTHER placed points expected it:
 *  null when they cannot say (fewer than three, no reference). */
export function farFromExpected(points: readonly SetPoint[], placed: ReadonlyMap<string, PlacedPoint>, id: string,
                                at: readonly number[]): { expected: V3; distance: number; unit: number; far: boolean } | null {
  const r = refOf(points.find((p) => p.id === id));
  if (!r) return null;
  const f = poseFit(points, placed, id);
  if (!f) return null;
  const expected = applySimilarity(f, r);
  const distance = Math.hypot(at[0] - expected[0], at[1] - expected[1], at[2] - expected[2]);
  return { expected, distance, unit: f.s, far: distance > FAR * f.s };
}
