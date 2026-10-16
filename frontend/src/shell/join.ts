/**
 * MICRO-SPAZIO-3D-3 p.8 · windows joined without the precision of a pixel — pure
 * (`scripts/check-tile-join.mjs`).
 *
 * The defect (E.D., 16 Oct 2026): two windows side by side would not join,
 * «Cannot join: the two windows do not share a whole side», when their border
 * was not aligned to the pixel. Measured in the code: a join was a question
 * about the SPLIT TREE, not about the picture — only the window on the other
 * side of the split that directly holds this one could be absorbed
 * (`siblingIdsOf`). Two Matrix windows one above the other, each the right half
 * of its own row ([Space | Matrix] over [Tabular | Matrix]), share a whole side
 * on screen and are not siblings; when the two rows' dividers differ by a few
 * pixels, they do not even share it on screen. There was no magnet either: a
 * divider dragged near another stopped wherever the hand left it.
 *
 * Here the join is a question about RECTANGLES. The areas the tree draws
 * (`layoutRects`) are brought together within a tolerance (`SNAP_PX`): edges
 * nearer than that are one edge. Two areas that then touch along a whole side
 * become one rectangle; the tree is rebuilt from the rectangles
 * (`treeFromRects`, the guillotine cuts that every split tree is), so the
 * neighbours whose edges moved with them follow. When one side is shorter, the
 * plan «Allinea e unisci» stretches the shorter window to the longer one's
 * side, taking the band from the windows beside it — if what is left of them is
 * still a rectangle. Anything else is not adjacent, and the message says what
 * to do.
 */
import type { Pane } from "../workspace";
import { DIVIDER, layoutRects, type Rect } from "./layout";

/** The magnet and the tolerance of a join, in pixels (E.D.'s MICRO: 12). */
export const SNAP_PX = 12;

type Rects = Map<string, Rect>;

const right = (r: Rect) => r.x + r.w;
const bottom = (r: Rect) => r.y + r.h;

/**
 * The split tree of a set of rectangles that tile `root` with `gap`-wide
 * dividers: a vertical cut where no rectangle crosses it (a «row» split), else
 * a horizontal one («col»), recursively. Null when the rectangles are not a
 * guillotine tiling — not every tiling is a tree of splits.
 */
export function treeFromRects(rects: Rects, root: Rect, gap = DIVIDER, tol = 1): Pane | null {
  const ids = [...rects.keys()];
  const build = (inside: string[], R: Rect): Pane | null => {
    if (inside.length === 1) return { kind: "leaf", winId: inside[0] };
    if (!inside.length) return null;
    for (const dir of ["row", "col"] as const) {
      // candidate cuts: the far edges of the rectangles, but the region's own
      const edges = [...new Set(inside.map((id) => (dir === "row" ? right(rects.get(id)!) : bottom(rects.get(id)!))))]
        .filter((e) => e < (dir === "row" ? right(R) : bottom(R)) - tol).sort((a, b) => a - b);
      for (const at of edges) {
        const a: string[] = [], b: string[] = [];
        let clean = true;
        for (const id of inside) {
          const r = rects.get(id)!;
          const lo = dir === "row" ? r.x : r.y, hi = dir === "row" ? right(r) : bottom(r);
          if (hi <= at + tol) a.push(id);
          else if (lo >= at + gap - tol) b.push(id);
          else { clean = false; break; }
        }
        if (!clean || !a.length || !b.length) continue;
        const along = dir === "row" ? R.w : R.h;
        const usable = Math.max(1, along - gap);
        const first = at - (dir === "row" ? R.x : R.y);
        const ratio = first / usable;
        const Ra: Rect = dir === "row" ? { x: R.x, y: R.y, w: first, h: R.h } : { x: R.x, y: R.y, w: R.w, h: first };
        const Rb: Rect = dir === "row" ? { x: at + gap, y: R.y, w: right(R) - at - gap, h: R.h }
          : { x: R.x, y: at + gap, w: R.w, h: bottom(R) - at - gap };
        const pa = build(a, Ra), pb = build(b, Rb);
        if (pa && pb) return { kind: "split", dir, ratio, a: pa, b: pb };
      }
    }
    return null;
  };
  return build(ids, root);
}

/** Edges nearer than `tol` become one: each cluster of left edges (and of
 *  right edges plus the divider) takes the value of the `prefer` area's edge
 *  when it is in the cluster, else the cluster's first. */
function snapRects(rects: Rects, prefer: string, tol: number, gap: number): Rects {
  const out: Rects = new Map([...rects].map(([k, r]) => [k, { ...r }]));
  for (const axis of ["x", "y"] as const) {
    // a «seam» is where one area ends and the next begins: right + gap ≈ left
    const seams: Array<{ v: number; id: string; end: boolean }> = [];
    for (const [id, r] of out) {
      const lo = axis === "x" ? r.x : r.y;
      const hi = axis === "x" ? right(r) : bottom(r);
      seams.push({ v: lo, id, end: false }, { v: hi + gap, id, end: true });
    }
    seams.sort((a, b) => a.v - b.v);
    const clusters: Array<typeof seams> = [];
    for (const s of seams) {
      const c = clusters[clusters.length - 1];
      if (c && s.v - c[0].v <= tol) c.push(s); else clusters.push([s]);
    }
    for (const c of clusters) {
      const pick = c.find((s) => s.id === prefer)?.v ?? c[0].v;
      for (const s of c) {
        const r = out.get(s.id)!;
        if (axis === "x") {
          if (s.end) r.w = pick - gap - r.x; else { const R = right(r); r.x = pick; r.w = R - pick; }
        } else {
          if (s.end) r.h = pick - gap - r.y; else { const B = bottom(r); r.y = pick; r.h = B - pick; }
        }
      }
    }
  }
  return out;
}

export type JoinPlan =
  /** the two touch along a whole side (within the tolerance): joined, aligned if they were not */
  | { kind: "join"; tree: Pane; aligned: boolean; side: Rect; union: Rect }
  /** one side is shorter: «Allinea e unisci» stretches it, the band taken from the windows beside */
  | { kind: "extend"; tree: Pane; side: Rect; union: Rect; stretched: string }
  /** not adjacent (or the result is not a tree of splits) */
  | { kind: "no"; why: "apart" | "shape" };

/**
 * `keep` absorbs `gone` (the dragged window stays, as today). `pane` is the
 * workspace's tree, `root` its rectangle.
 */
export function planJoin(pane: Pane, root: Rect, keep: string, gone: string, tol = SNAP_PX, gap = DIVIDER): JoinPlan {
  const raw = layoutRects(pane, root).areas;
  if (!raw.has(keep) || !raw.has(gone)) return { kind: "no", why: "apart" };
  const rects = snapRects(raw, keep, tol, gap);
  const A = rects.get(keep)!, B = rects.get(gone)!;
  // which side they touch along, after the snap
  const horiz = right(A) + gap === B.x || right(B) + gap === A.x;
  const vert = bottom(A) + gap === B.y || bottom(B) + gap === A.y;
  const overlapY = Math.min(bottom(A), bottom(B)) - Math.max(A.y, B.y);
  const overlapX = Math.min(right(A), right(B)) - Math.max(A.x, B.x);
  if (!((horiz && overlapY > 0) || (vert && overlapX > 0))) return { kind: "no", why: "apart" };
  const union: Rect = { x: Math.min(A.x, B.x), y: Math.min(A.y, B.y), w: 0, h: 0 };
  union.w = Math.max(right(A), right(B)) - union.x;
  union.h = Math.max(bottom(A), bottom(B)) - union.y;
  const side: Rect = horiz
    ? { x: Math.min(right(A), right(B)), y: Math.max(A.y, B.y), w: gap, h: overlapY }
    : { x: Math.max(A.x, B.x), y: Math.min(bottom(A), bottom(B)), w: overlapX, h: gap };
  const whole = horiz ? A.y === B.y && bottom(A) === bottom(B) : A.x === B.x && right(A) === right(B);
  const next: Rects = new Map(rects);
  next.delete(gone);
  next.set(keep, union);
  const alignedNow = [...raw].some(([k, r]) => { const s = rects.get(k)!; return s.x !== r.x || s.y !== r.y || s.w !== r.w || s.h !== r.h; });
  if (whole) {
    const tree = treeFromRects(next, root, gap);
    return tree ? { kind: "join", tree, aligned: alignedNow, side, union } : { kind: "no", why: "shape" };
  }
  // «Allinea e unisci»: the shorter is stretched; the windows the band covers
  // give it up, if what is left of each is still a rectangle
  const stretched = horiz ? (A.h < B.h ? keep : gone) : (A.w < B.w ? keep : gone);
  for (const [id, r] of [...next]) {
    if (id === keep) continue;
    const ix = Math.min(right(r), right(union)) - Math.max(r.x, union.x);
    const iy = Math.min(bottom(r), bottom(union)) - Math.max(r.y, union.y);
    if (ix <= 0 || iy <= 0) continue;
    // the union covers a band of r along its whole width (or height): r shrinks
    let n: Rect | null = null;
    if (r.x >= union.x && right(r) <= right(union)) {
      if (r.y < union.y && bottom(r) <= bottom(union)) n = { ...r, h: union.y - gap - r.y };
      else if (bottom(r) > bottom(union) && r.y >= union.y) n = { ...r, y: bottom(union) + gap, h: bottom(r) - bottom(union) - gap };
    } else if (r.y >= union.y && bottom(r) <= bottom(union)) {
      if (r.x < union.x && right(r) <= right(union)) n = { ...r, w: union.x - gap - r.x };
      else if (right(r) > right(union) && r.x >= union.x) n = { ...r, x: right(union) + gap, w: right(r) - right(union) - gap };
    }
    if (!n || n.w < 40 || n.h < 40) return { kind: "no", why: "shape" };
    next.set(id, n);
  }
  const tree = treeFromRects(next, root, gap);
  return tree ? { kind: "extend", tree, side, union, stretched } : { kind: "no", why: "shape" };
}

/**
 * The magnet of a divider dragged: the position (page px along its axis) of
 * the nearest other divider of the same direction within `tol`, else `at`.
 */
export function snapDivider(at: number, others: readonly number[], tol = SNAP_PX): number {
  let best = at, d = tol + 1;
  for (const o of others) { const e = Math.abs(o - at); if (e <= tol && e < d) { d = e; best = o; } }
  return best;
}
