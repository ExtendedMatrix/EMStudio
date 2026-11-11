/**
 * NIGHT-TAGLI-E-NEUTRE (em_visual_rules 1.6.44, `threed_style`) · the EDGES of
 * a proxy as its type asks: the feature edges of the mesh (EdgesGeometry, at
 * the rule's `feature_angle_deg`), then cut by the `style`:
 *
 *   · `solid`   — whole;
 *   · `dashed`  — dash / gap as fractions of the proxy's bounding-box diagonal
 *                 (`dashed.dash_ratio`, `gap_ratio`), each edge starting with a
 *                 dash so every corner is marked;
 *   · `corners` — the 3D of `corner_brackets`: each end of each edge keeps a
 *                 tick of `corners.tick_ratio` × the SHORTEST side of the box
 *                 (never more than half the edge), as `bracketTick` = min(w, h) × 0.34.
 *
 * Pure: segments in (a flat [ax, ay, az, bx, by, bz, …]), segments out. The
 * same cut is done in EM Tools (`threed_edges.py`), so the two tools draw the
 * same dashes on the same proxy. Dashes are computed, not left to a dashed
 * material, because a material's dash runs along the line's distance and
 * would not restart at each corner.
 */
export type EdgeStyle = "solid" | "dashed" | "corners";

export interface EdgeCut {
  style: EdgeStyle;
  /** the proxy's bounding box sides */
  size: [number, number, number];
  dashRatio: number;
  gapRatio: number;
  tickRatio: number;
}

export function cutEdges(segments: ArrayLike<number>, cut: EdgeCut): number[] {
  const out: number[] = [];
  const [sx, sy, sz] = cut.size;
  const diag = Math.hypot(sx, sy, sz) || 1;
  const shortest = Math.min(...[sx, sy, sz].filter((s) => s > 1e-9)) || diag;
  for (let i = 0; i + 5 < segments.length; i += 6) {
    const a = [segments[i], segments[i + 1], segments[i + 2]];
    const b = [segments[i + 3], segments[i + 4], segments[i + 5]];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-12) continue;
    const at = (t: number) => [a[0] + d[0] * t / len, a[1] + d[1] * t / len, a[2] + d[2] * t / len];
    const push = (t0: number, t1: number) => out.push(...at(t0), ...at(t1));
    if (cut.style === "solid") push(0, len);
    else if (cut.style === "corners") {
      const tick = Math.min(cut.tickRatio * shortest, len / 2);
      push(0, tick);
      push(len - tick, len);
    } else {
      const dash = Math.max(cut.dashRatio * diag, 1e-9);
      const gap = Math.max(cut.gapRatio * diag, 0);
      for (let t = 0; t < len; t += dash + gap) push(t, Math.min(t + dash, len));
    }
  }
  return out;
}
