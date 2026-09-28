/**
 * THE ARRANGEMENT AS GEOMETRY · the split tree turned into rectangles.
 *
 * Why this exists, measured rather than argued (2026-09-12).
 *
 * The tree used to be rendered as NESTED FLEX BOXES, which meant every leaf's
 * area was a child of a `.tile-split` that was itself a child of another one —
 * so any change to the arrangement, and any change of FOCUS, re-parented the
 * areas. Re-parenting is what `tileRoot.innerHTML = ""` did in one line, and
 * three modules existed to compensate for it: `surface-scroll.ts` put the
 * readers back, `wrapWin` remembered whose surfaces the wrap held because the
 * focus had already moved on, `releaseTilePanels` rescued the singleton panels
 * from the reset.
 *
 * The two candidates were measured against each other before choosing:
 *
 *  · KEEP THE FLEX and defend the reuse: the areas would have to be pulled from
 *    a cache and re-appended into freshly built splits on every structural
 *    change. Every registry (`tileCanvases`, the EM-Data hosts, the Storage
 *    hosts, the surface repaints) would still need clearing and rebuilding,
 *    because a re-append is a detach — so the whole of the bookkeeping stays,
 *    and only the focus path gets better.
 *  · RECTANGLES: the areas are absolutely positioned children of `#tile-root`,
 *    created once and NEVER MOVED. A split, a join, a ratio drag, a magnify and
 *    a window resize are then four numbers written onto an element that is
 *    already where it belongs. Nothing is ever detached, so nothing has to be
 *    put back — and the registries simply survive.
 *
 * The second is shorter, and shorter in the part that matters: it deletes the
 * compensations instead of narrowing them. It also makes the arrangement
 * testable in node with REAL numbers (this module is pure arithmetic over the
 * tree) instead of a hand-modelled layout that a checker had to simulate.
 *
 * The cost, stated: the browser no longer reflows the arrangement on its own, so
 * a resize has to recompute. That is one listener, and it was already there for
 * the canvas.
 */
import type { Pane } from "../workspace";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A divider between two areas: where it is, which way it resizes, and the id
 *  the ratio is recorded against (`setSplitRatio` keys on the first leaf of the
 *  `a` side, exactly as the flex version did). */
export interface DividerRect {
  firstId: string;
  dir: "row" | "col";
  rect: Rect;
  /** the rectangle of the SPLIT this divider belongs to — the drag reads the
   *  ratio off it, and reading it from here means the drag never has to ask the
   *  DOM where anything is. */
  span: Rect;
  /** STRUTTURA · the split's PATH from the root ("" = root, then "a"/"b" per
   *  level): the one name that is never ambiguous. Two nested splits can share
   *  a first leaf; they cannot share a path. The divider drag resizes and
   *  closes by it (`setSplitRatioAt`, `closeSplitSide`). */
  path: string;
}

export interface LayoutResult {
  areas: Map<string, Rect>;
  dividers: DividerRect[];
}

/** The handle's thickness, in px. One number, shared with the stylesheet
 *  through `--tile-div`, so the gap the geometry reserves and the strip the
 *  user grabs can never be two different widths. */
export const DIVIDER = 6;

/** The first leaf id of a subtree — the name a split's ratio is filed under. */
export function firstLeafId(p: Pane): string {
  return p.kind === "leaf" ? p.winId : firstLeafId(p.a);
}

/**
 * Every area's rectangle, and every divider's, for one tree inside one box.
 *
 * Pure: no DOM, no rounding to device pixels, no state. `check-surfaces.mjs`
 * runs it on real trees with real numbers — which is the whole reason the
 * checker no longer has to model a layout of its own.
 */
export function layoutRects(pane: Pane, rect: Rect): LayoutResult {
  const areas = new Map<string, Rect>();
  const dividers: DividerRect[] = [];
  const walk = (p: Pane, r: Rect, path = ""): void => {
    if (p.kind === "leaf") {
      areas.set(p.winId, r);
      return;
    }
    const along = p.dir === "row" ? r.w : r.h;
    // A split narrower than its own handle cannot be drawn honestly; the
    // arithmetic below would hand one side a negative extent. Clamp once, here,
    // so no caller has to defend against it.
    const usable = Math.max(0, along - DIVIDER);
    const first = Math.round(usable * p.ratio);
    const second = usable - first;
    if (p.dir === "row") {
      walk(p.a, { x: r.x, y: r.y, w: first, h: r.h }, path + "a");
      dividers.push({
        firstId: firstLeafId(p.a),
        dir: "row",
        rect: { x: r.x + first, y: r.y, w: DIVIDER, h: r.h },
        span: r,
        path,
      });
      walk(p.b, { x: r.x + first + DIVIDER, y: r.y, w: second, h: r.h }, path + "b");
    } else {
      walk(p.a, { x: r.x, y: r.y, w: r.w, h: first }, path + "a");
      dividers.push({
        firstId: firstLeafId(p.a),
        dir: "col",
        rect: { x: r.x, y: r.y + first, w: r.w, h: DIVIDER },
        span: r,
        path,
      });
      walk(p.b, { x: r.x, y: r.y + first + DIVIDER, w: r.w, h: second }, path + "b");
    }
  };
  walk(pane, rect);
  return { areas, dividers };
}

/** True when two rectangles are the same to the pixel — the test that lets a
 *  re-layout write nothing at all when nothing moved. */
export function sameRect(a: Rect | undefined, b: Rect | undefined): boolean {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
