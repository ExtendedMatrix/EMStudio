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
  /** the fetchable address (a glb) */
  url: string;
  /** the level computed from the chain (lod0 = 0, the finest drawn) */
  ord: number;
  /** the error in metres, and where it came from */
  err: number | null;
  errFrom: "measure" | "tris_per_m2" | "triangles" | "none";
  bytes: number | null;
  uses: string[];
  /** the triangles, for an error estimated from the model's box (the scene knows the box) */
  tris?: number | null;
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
                               current: string | null = null, threshold = SSE_PX): { want: string | null; preload: string | null } {
  const ok = versions.filter((v) => v.err != null && v.url);
  if (!ok.length) return { want: null, preload: null };
  const fineToCoarse = [...ok].sort((a, b) => a.ord - b.ord);
  const coarseToFine = [...fineToCoarse].reverse();
  const sse = (v: FlowVersion) => screenError(v.err!, dist, fovDeg, heightPx);
  let want = coarseToFine.find((v) => sse(v) <= threshold) ?? fineToCoarse[0];
  const cur = current ? ok.find((v) => v.id === current) : undefined;
  // hysteresis: a finer current stays until the coarser is well under the threshold
  if (cur && cur.ord < want.ord && sse(want) > threshold * 0.8) want = cur;
  const finer = fineToCoarse.filter((v) => v.ord < want.ord).pop() ?? null;
  const preload = finer && sse(want) > threshold * 0.6 ? finer.id : null;
  return { want: want.id, preload };
}

/** The modes of a model's versions: the one chosen, the one of the device's
 *  use, or the distance. */
export type VersionMode = "manual" | "use" | "auto";
