/**
 * MICRO-SPAZIO-3D-3 p.10 · the versions of a model as a FLOW OF LOD, by the
 * distance — pure (`scripts/check-lod-flow.mjs`).
 *
 * What the data already says (s3Dgraphy `resources/versions.py`, E.D. 30 Sept,
 * 3 and 4 Oct 2026): the asset is the master; each version (lod0, lod1…) is a
 * resource a `lod_generation` step made from the one before; the level is
 * COMPUTED from the chain (`versionsOf`, the TS twin), never written; the uses
 * are a list on the version (`data.use`); the measures (`LOD_MEASURES`) are the
 * version's data. Nothing is added to the datamodel: these functions read it.
 *
 * The rule of the flow is the 3D Tiles one: a version is fine enough while its
 * error, PROJECTED ON THE SCREEN, stays under a threshold in pixels
 * (`SSE_PX`, Cesium's 16); nearer, the next finer version is asked for.
 *
 *   · the error is `geometric_error_m` when the version declares it (measured
 *     on Templu Mare v3.2: only the tileset does, 6.144 m);
 *   · else it is ESTIMATED from `tris_per_m2` (196 of the 485 resources carry
 *     it): a triangle of area 1/tris_per_m2 has a side of about √(1/tris_per_m2)
 *     metres — the size of what the mesh cannot show;
 *   · else from the triangles and the model's box: tris_per_m2 ≈ triangles /
 *     (half the box's surface), the same side;
 *   · else none: the version is never chosen by the distance.
 */

export interface FlowVersion {
  id: string;
  /** the fetchable address (a glb, or an OBJ's entry) */
  url: string;
  /** the place in the chain, from the finest (0) to the coarsest */
  ord: number;
  /** the error in metres, and where it came from (MICRO-PROVA-DEV48 p.3: the
   *  triangles counted by the Space, «measured»; those a recipe's version says
   *  of the level it copied, «recipe»; estimated from the weight, «weight») */
  err: number | null;
  errFrom: "measure" | "tris_per_m2" | "triangles" | "measured" | "recipe" | "weight" | "none";
  bytes: number | null;
  uses: string[];
  /** the triangles, for an error estimated from the model's box (the scene knows the box) */
  tris?: number | null;
  /** MICRO-PROVA-DEV48 p.3 · what the label says it is («LOD0», «derivata lod4», «intero») */
  name?: string;
  /** an OBJ (the author's levels): read with the OBJ loader, its other files through `modifier` */
  obj?: { modifier?: (u: string) => string };
  /** a BIG version (the author's finest, or over 150 MB): see `BIG_SCREEN` */
  big?: boolean;
}

/**
 * MICRO-PROVA-DEV48 p.3 · the rule of a big version in the automatic mode
 * (E.D., 17 Oct 2026: «LOD0 non arriva mai»), written:
 *
 *   · it is never asked before (no question, no preload): it is loaded only
 *     when the distance asks for it AND the model fills the screen — its
 *     bounding sphere at least `BIG_SCREEN` of the view's height (or the
 *     camera inside it);
 *   · ONE at a time: of the models that ask, the one that fills more of the
 *     screen (then the nearer); another that holds one goes back to its finer
 *     light version first, and the big one it held leaves the memory before the
 *     next is loaded;
 *   · going away, it goes back to a light version and leaves the memory.
 */
export const BIG_SCREEN = 0.6;

/** The share of the view's height a sphere of `radius` at `dist` (from its
 *  centre) fills; 2 when the camera is inside it. */
export function screenShare(radius: number, dist: number, fovDeg: number): number {
  if (dist <= radius) return 2;
  return (2 * Math.atan(radius / dist)) / ((fovDeg * Math.PI) / 180);
}

/** Which of the models asking for a big version may have it now: the one that
 *  fills more of the screen (then the nearer), among those over BIG_SCREEN. */
export function bigTurn(asks: ReadonlyArray<{ key: string; share: number; dist: number }>): string | null {
  const ok = asks.filter((a) => a.share >= BIG_SCREEN).sort((a, b) => b.share - a.share || a.dist - b.dist);
  return ok[0]?.key ?? null;
}

/** One version as the chain is built from the graph and the cache. */
export interface ChainIn {
  id: string;
  url: string;
  /** the order of `lod-levels.ts` (the author's levels by the chain, each
   *  derived version right after the level it comes from) */
  rank: number;
  name: string;
  /** the version's data (`geometric_error_m`, `tris_per_m2`, `primitives`) */
  data: Record<string, unknown>;
  /** the triangles the Space counted (the measures' cache), when the data has none */
  measured?: number | null;
  /** a recipe's version: the level it was made from, and the share it kept */
  base?: string | null;
  ratio?: number | null;
  bytes?: number | null;
  format?: string;
  uses?: string[];
  obj?: { modifier?: (u: string) => string };
  big?: boolean;
}

/**
 * MICRO-PROVA-DEV48 p.3 · the chain of the automatic mode: EVERY level the
 * Space opens — for a survey the recipe's lod4 and lod3, then the author's
 * LOD2, LOD1, LOD0; for a reconstruction the derived one and the whole —
 * finest first, with an error each, from ONE scale so they can be compared:
 *
 *   · the triangles: the data's, else those the Space counted (the cache,
 *     «measured»), else those a recipe's version says of its base (a copy
 *     with `ratio` r of a level with T triangles has r·T: T = its own / r),
 *     else estimated from the weight beside a level of the same form whose
 *     triangles are known;
 *   · the error: `geometric_error_m` when declared; else √(area / triangles),
 *     the side of a mean triangle, with the model's area from the versions
 *     that declare `tris_per_m2` (area = triangles / tris_per_m2); without an
 *     area the triangles go to the scene, which estimates from the box (the
 *     same scale for all); `tris_per_m2` alone, √(1 / tris_per_m2);
 *   · finer is never coarser: along the chain an error is at least the one
 *     before it (two versions of one geometry — LOD2 and its glb copy — have
 *     the same, and the distance takes the lighter, later in the chain).
 */
export function buildChain(vs: readonly ChainIn[]): FlowVersion[] {
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);
  const sorted = [...vs].sort((a, b) => a.rank - b.rank);
  const tris = new Map<string, { n: number; from: FlowVersion["errFrom"] }>();
  for (const v of sorted) {
    const prim = (v.data.primitives && typeof v.data.primitives === "object" ? v.data.primitives : {}) as Record<string, unknown>;
    const t = num(prim.triangles ?? prim.faces);
    if (Number.isFinite(t) && t > 0) tris.set(v.id, { n: t, from: "triangles" });
    else if (v.measured && v.measured > 0) tris.set(v.id, { n: v.measured, from: "measured" });
  }
  // a recipe's version says the triangles of the level it was made from
  for (let pass = 0; pass < 4; pass++) for (const v of sorted) {
    const own = tris.get(v.id);
    if (!own || !v.base || !(v.ratio && v.ratio > 0) || tris.has(v.base) || !sorted.some((x) => x.id === v.base)) continue;
    tris.set(v.base, { n: Math.round(own.n / v.ratio), from: "recipe" });
  }
  // the weight, beside the nearest level of the same form whose triangles are known
  for (const v of sorted) {
    if (tris.has(v.id) || !(v.bytes && v.bytes > 0)) continue;
    const ref = sorted.filter((w) => w.format === v.format && tris.has(w.id) && w.bytes && w.bytes > 0 && tris.get(w.id)!.from !== "weight")
      .sort((a, b) => Math.abs(a.rank - v.rank) - Math.abs(b.rank - v.rank))[0];
    if (ref) tris.set(v.id, { n: Math.round(tris.get(ref.id)!.n * v.bytes / ref.bytes!), from: "weight" });
  }
  // the model's area, from the versions that declare tris_per_m2 and their triangles
  const areas = sorted.map((v) => { const t = tris.get(v.id); const d = num(v.data.tris_per_m2); return t && t.from === "triangles" && d > 0 ? t.n / d : NaN; })
    .filter((a) => Number.isFinite(a) && a > 0).sort((a, b) => a - b);
  const area = areas.length ? areas[Math.floor(areas.length / 2)] : null;
  const out: FlowVersion[] = sorted.map((v, i) => {
    const g = num(v.data.geometric_error_m);
    const tpm = num(v.data.tris_per_m2);
    const t = tris.get(v.id);
    let err: number | null = null;
    let errFrom: FlowVersion["errFrom"] = "none";
    if (Number.isFinite(g) && g > 0) { err = g; errFrom = "measure"; }
    else if (area && t) { err = Math.sqrt(area / t.n); errFrom = t.from; }
    else if (Number.isFinite(tpm) && tpm > 0) { err = Math.sqrt(1 / tpm); errFrom = "tris_per_m2"; }
    return { id: v.id, url: v.url, ord: i, err, errFrom, bytes: v.bytes ?? null, uses: v.uses ?? [], tris: t?.n ?? null, name: v.name,
      ...(v.obj ? { obj: v.obj } : {}), ...(v.big ? { big: true } : {}) };
  });
  let prev = 0;
  for (const v of out) if (v.err != null) { if (v.err < prev) v.err = prev; prev = v.err; }
  return out;
}

/** Cesium's maximum screen-space error, in pixels. */
export const SSE_PX = 16;

/** A version's error in metres, from its data (and the model's box, in metres). */
export function versionError(d: Record<string, unknown>, box?: { x: number; y: number; z: number } | null): { err: number | null; from: FlowVersion["errFrom"] } {
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);
  const g = num(d.geometric_error_m);
  if (Number.isFinite(g) && g > 0) return { err: g, from: "measure" };
  const t = num(d.tris_per_m2);
  if (Number.isFinite(t) && t > 0) return { err: Math.sqrt(1 / t), from: "tris_per_m2" };
  const prim = (d.primitives && typeof d.primitives === "object" ? d.primitives : {}) as Record<string, unknown>;
  const tri = num(prim.triangles ?? prim.faces);
  if (Number.isFinite(tri) && tri > 0 && box) {
    const half = box.x * box.y + box.y * box.z + box.z * box.x;      // half the box's surface
    if (half > 0) return { err: Math.sqrt(half / tri), from: "triangles" };
  }
  return { err: null, from: "none" };
}

/** The error of `err` metres at `dist` metres, on a screen `heightPx` high
 *  under a vertical field of `fovDeg` — 3D Tiles' screen-space error. */
export function screenError(err: number, dist: number, fovDeg: number, heightPx: number): number {
  const d = Math.max(1e-6, dist);
  return (err * heightPx) / (2 * d * Math.tan((fovDeg * Math.PI) / 360));
}

/**
 * The version a distance asks for: the COARSEST whose projected error stays
 * under the threshold; the finest when none does. `current` keeps a finer one
 * a little longer (hysteresis: it coarsens only under 80 % of the threshold),
 * and `preload` is the next finer one once the wanted one passes 60 % — so it
 * is there when the camera arrives.
 */
export function pickByDistance(versions: readonly FlowVersion[], dist: number, fovDeg: number, heightPx: number,
                               current: string | null = null, threshold = SSE_PX, allowBig = true): { want: string | null; preload: string | null } {
  // MICRO-PROVA-DEV48 p.3 · a big version only when it is this model's turn (`bigTurn`)
  // (a model that holds one and has not the turn goes back to its finest light version)
  const ok = versions.filter((v) => v.err != null && v.url && (allowBig || !v.big));
  if (!ok.length) return { want: null, preload: null };
  const fineToCoarse = [...ok].sort((a, b) => a.ord - b.ord);
  const coarseToFine = [...fineToCoarse].reverse();
  const sse = (v: FlowVersion) => screenError(v.err!, dist, fovDeg, heightPx);
  let want = coarseToFine.find((v) => sse(v) <= threshold) ?? fineToCoarse[0];
  const cur = current ? ok.find((v) => v.id === current) : undefined;
  // hysteresis: a finer current stays until the coarser is well under the threshold
  if (cur && cur.ord < want.ord && sse(want) > threshold * 0.8) want = cur;
  const finer = fineToCoarse.filter((v) => v.ord < want.ord).pop() ?? null;
  // a big version is never preloaded: it comes when it is asked, and only then
  const preload = finer && !finer.big && sse(want) > threshold * 0.6 ? finer.id : null;
  return { want: want.id, preload };
}

/** The modes of a model's versions: the one chosen, the one of the device's
 *  use, or the distance. */
export type VersionMode = "manual" | "use" | "auto";
