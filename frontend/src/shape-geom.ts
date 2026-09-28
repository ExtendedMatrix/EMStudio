/**
 * The geometry of a node's silhouette — ONE definition, used to draw it and to
 * click it (EM1).
 *
 * Before this module the two lived apart: `renderer.ts` built a canvas path per
 * shape, and `scene.ts::hitTest` compared the point against the node's rectangle.
 * That was invisible while every type filled its box, and became wrong as soon as
 * shapes stopped doing so — BR draws a 22 px rhombus inside a 90×32 box, so 85% of
 * its clickable area was empty canvas, and a click 30 px to the right of the
 * marker selected it.
 *
 * The fix is not "make the hit test match the drawing"; it is having ONE geometry
 * that both consume, so they cannot drift again:
 *
 *   drawBoxOf()  → the box the SHAPE occupies (shape_scale + shape_bbox)
 *   polygonOf()  → the vertices, for the shapes that are polygons
 *   shapePath()  → those vertices as a canvas path            [renderer]
 *   pointInShape() → those vertices as a containment test     [hit-test]
 *
 * Everything type-specific comes from `em_visual_rules` via `nodeStyle()`;
 * nothing about the EM language is decided here.
 */
import rules from "./assets/em_visual_rules.json";
import { ICON_NODE_TYPES } from "./icons";
import type { NodeStyle } from "./palette";

/**
 * TOCCARE · the tolerance of every pointer test on a node, in SCREEN pixels.
 *
 * One number, declared here and divided by the zoom at the call site: a node
 * that is 6 px tall on screen stays catchable, one that is 600 px tall does not
 * grow a 30 px halo. It is applied AROUND the silhouette, never instead of it —
 * `hitTest` tries the exact shape first, so a near miss can never steal a click
 * from the node that is actually under the pointer.
 */
export const HIT_TOL_PX = 3;

/** The tallest a glyph is ever drawn, world units (the renderer's historic 30). */
export const GLYPH_MAX_H = 30;

/** Width / height of the document SHEET the renderer draws in vector (not the
 *  bitmap `document.svg`, which nobody draws): one constant for both. */
export const DOC_SHEET_ASPECT = 0.78;

const GLYPHS: Record<string, { aspect?: unknown }> =
  (rules as unknown as { "2d_glyphs"?: Record<string, { aspect?: unknown }> })[
    "2d_glyphs"
  ] ?? {};

/**
 * The DECLARED aspect (width / height) of a node's glyph, or null.
 *
 * TOCCARE · this is what retires the "ICON nodes keep the box" exception of EM1:
 * the proportions were only knowable once a bitmap had decoded, so the hit area
 * would have changed shape as icons loaded. Since NIGHT-GLIFI the datamodel
 * declares `2d_glyphs[*].aspect` — keyed by node_type, or `dtc:<kind>` for the
 * DTC glyphs chosen per node — so the fitted rect is a number known before any
 * image exists, the same number em-core reads for the EM3 box.
 *
 * The order mirrors the renderer: a type that has its own icon draws that icon,
 * and only otherwise does a `dtc_kind` pick the glyph.
 */
export function glyphAspect(
  nodeType: string,
  data?: Record<string, unknown> | null,
): number | null {
  if (nodeType === "document") return DOC_SHEET_ASPECT;
  const kind = data?.["dtc_kind"];
  const entry = ICON_NODE_TYPES.has(nodeType)
    ? GLYPHS[nodeType]
    : typeof kind === "string"
      ? GLYPHS[`dtc:${kind}`]
      : undefined;
  const a = entry?.aspect;
  return typeof a === "number" && Number.isFinite(a) && a > 0 ? a : null;
}

/**
 * The rect a glyph is DRAWN in: "contain" fit of the declared aspect inside the
 * node box, never taller than GLYPH_MAX_H, centred. The renderer draws into it
 * and the hit test tests it — one expression, so they cannot drift.
 */
export function glyphRectOf(n: Box, aspect: number): Box {
  const h = Math.min(n.h, GLYPH_MAX_H, n.w / aspect);
  const w = h * aspect;
  return { x: n.x + n.w / 2 - w / 2, y: n.y + n.h / 2 - h / 2, w, h };
}

/**
 * Types the renderer draws as a GLYPH rather than as a shape — an image fitted
 * into the box (`ICON_NODE_TYPES`), the document sheet, or the property
 * annotation bracket.
 *
 * Listed once, here, because the hit test has to know the same thing the renderer
 * knows. `ICON_NODE_TYPES` comes from `icons.ts`; `document` and `property` are
 * the two branches `renderer.ts` handles with custom drawing code before the
 * shape path is reached. If a third custom branch is ever added there, it belongs
 * in this predicate too — otherwise its clickable area silently becomes whatever
 * `shape` its datamodel entry happens to declare.
 */
export function drawsAsGlyph(
  nodeType: string,
  data?: Record<string, unknown> | null,
): boolean {
  return (
    ICON_NODE_TYPES.has(nodeType) ||
    // the DTC profile picks a glyph per NODE, not per type: a plain `link` is a
    // chain, a `link` with a kind is a photograph or a mesh (EM2)
    (!!data && data["dtc_kind"] !== undefined) ||
    nodeType === "document" ||
    nodeType === "property"
  );
}

/**
 * Where a node's CONNECT HANDLE sits — the bullet you drag to draw an edge.
 *
 * One function because there were two call sites computing it separately: the
 * renderer's `arc(n.x + n.w, n.y + n.h / 2, …)` and `scene.ts::hitHandle`. They
 * agreed by coincidence, and a coincidence is not a contract — the visible bullet
 * and the grabbable bullet are the same object and must come from one expression.
 *
 * The anchor is the middle of the RIGHT EDGE of the box it is given. Callers
 * give it `visibleBoxOf(n)` (scene.ts), not the node box (TOCCARE): for most
 * types the two coincide — EM2 squared the glyph boxes in em-core precisely so
 * that they would — but a `document` keeps em-core's 90 × 32 box around a 23 px
 * sheet, and a handle 33 px to the right of the sheet is attached to nothing.
 * That is not a second geometry: it is the one the renderer draws with.
 */
export function handleAnchor(n: Box): { x: number; y: number } {
  return { x: n.x + n.w, y: n.y + n.h / 2 };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The box the DRAWING occupies inside a node's box.
 *
 * `shape_scale` shrinks it (BR = 0.7), `shape_bbox: "square"` squares it on the
 * smaller side, and the result is centred in the node box.
 *
 * # Why this has to be IDEMPOTENT
 *
 * Since EM1 em-core applies the same two rules to the node box itself
 * (`geometry.rs`), because the engine must reserve what the type actually draws —
 * a BR that books 90 × 32 of row for a 22 px marker is why matrices come out too
 * wide. So a freshly laid-out BR arrives here ALREADY 22.4 × 22.4, and applying
 * 0.7 again would draw it at 0.49 — a marker that shrinks a little every time the
 * pipeline is asked to do the same thing twice.
 *
 * Both places are needed, though: em-core sizes what the graph RESERVES, this
 * sizes what the type DRAWS, and a document that was laid out by an older build,
 * hand-written, or produced by another tool arrives with a 90 × 32 box that must
 * still draw a rhombus and not a lozenge.
 *
 * The test for "already applied" is a FACT about the box, not a guess about its
 * history: a square-bbox type whose box is already square has nothing left to do.
 * Limit, stated: this only works for a type that declares `shape_bbox: square`
 * (today, BR — the only type with any box geometry at all). A scale-only type
 * would need the engine's default box to compare against, and that number lives
 * in `LayoutOptions` on the Rust side; if one is ever added, the honest fix is to
 * publish that default rather than to add a second heuristic here.
 */
export function drawBoxOf(st: NodeStyle, n: Box): Box {
  if (st.shapeBox === "square" && Math.abs(n.w - n.h) < 0.5) return { ...n };
  let w = n.w * st.shapeScale;
  let h = n.h * st.shapeScale;
  if (st.shapeBox === "square") w = h = Math.min(w, h);
  return { x: n.x + (n.w - w) / 2, y: n.y + (n.h - h) / 2, w, h };
}

/**
 * The shape as a closed polygon, or `null` when it is not one (ellipse, rounded
 * rectangle, corner brackets).
 *
 * This is where every polygon's vertices are written down exactly once. The path
 * builder and the containment test read the same list, which is the whole point
 * of the module: a vertex moved here moves in both.
 */
export function polygonOf(shape: string, b: Box): [number, number][] | null {
  const { x, y, w, h } = b;
  switch (shape) {
    case "hexagon": {
      const c = Math.min(w * 0.2, h);
      return [
        [x + c, y],
        [x + w - c, y],
        [x + w, y + h / 2],
        [x + w - c, y + h],
        [x + c, y + h],
        [x, y + h / 2],
      ];
    }
    case "parallelogram": {
      const k = w * 0.18;
      return [
        [x + k, y],
        [x + w, y],
        [x + w - k, y + h],
        [x, y + h],
      ];
    }
    case "octagon": {
      const c = Math.min(w, h) * 0.29;
      return [
        [x + c, y],
        [x + w - c, y],
        [x + w, y + c],
        [x + w, y + h - c],
        [x + w - c, y + h],
        [x + c, y + h],
        [x, y + h - c],
        [x, y + c],
      ];
    }
    case "diamond":
      return [
        [x + w / 2, y],
        [x + w, y + h / 2],
        [x + w / 2, y + h],
        [x, y + h / 2],
      ];
    case "triangle":
      return [
        [x + w / 2, y],
        [x + w, y + h],
        [x, y + h],
      ];
    case "pentagon":
      return [
        [x + w / 2, y],
        [x + w, y + h * 0.4],
        [x + w * 0.8, y + h],
        [x + w * 0.2, y + h],
        [x, y + h * 0.4],
      ];
    case "star": {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const R = Math.min(w, h) / 2;
      const r = R * 0.45;
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? R : r;
        pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
      }
      return pts;
    }
    case "rectangle":
      return [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ];
    default:
      return null; // ellipse, rounded_rectangle, corner_brackets — see below
  }
}

/** Corner radius of the default rounded rectangle. Shared by path and hit test. */
export function cornerRadius(h: number): number {
  return Math.min(6, h / 2);
}

/** Tick length of the `corner_brackets` shape (USN). */
export function bracketTick(b: Box): number {
  return Math.min(b.w, b.h) * 0.34;
}

/**
 * Build the shape as a canvas path. Does NOT begin or close a path for the
 * caller's fill/stroke decisions beyond what the shape needs — `corner_brackets`
 * is deliberately left OPEN, so a fill cannot invent a surface for it.
 */
export function shapePath(
  ctx: CanvasRenderingContext2D,
  shape: string,
  b: Box,
): void {
  const { x, y, w, h } = b;
  ctx.beginPath();
  const poly = polygonOf(shape, b);
  if (poly) {
    poly.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    return;
  }
  switch (shape) {
    case "ellipse":
    case "circle":
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      return;
    case "corner_brackets": {
      // Four L ticks, no continuous edge, deliberately UNCLOSED (see the
      // em_visual_rules comment on USN: a filled corner would invent the surface
      // a void does not have).
      const t = bracketTick(b);
      ctx.moveTo(x, y + t);
      ctx.lineTo(x, y);
      ctx.lineTo(x + t, y);
      ctx.moveTo(x + w - t, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + t);
      ctx.moveTo(x + w, y + h - t);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w - t, y + h);
      ctx.moveTo(x + t, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + h - t);
      return;
    }
    default: {
      // rounded_rectangle, roundrectangle, shield, chain, globe, model, …
      ctx.roundRect(x, y, w, h, cornerRadius(h));
    }
  }
}

/** Even-odd ray cast. Vertices come from `polygonOf`, so this cannot disagree
 *  with what was drawn. */
function pointInPolygon(
  poly: [number, number][],
  px: number,
  py: number,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Is the point inside the shape?
 *
 * `b` is the DRAWING box (`drawBoxOf`), not the node box — for BR the two differ
 * by design.
 *
 * Two shapes answer for their whole box, and both are deliberate:
 *
 * * **`corner_brackets`** (USN). The four ticks are ~4 px of ink; requiring the
 *   click to land on one would make a neutral unit practically unselectable. What
 *   the brackets denote IS the extent of the void, so the extent is the honest
 *   target — and it never exceeds the node's own box, so it cannot steal a
 *   neighbour's clicks, which is the constraint that matters.
 * * **rounded rectangles and the fallback**: the box minus the four corner
 *   radii, computed here rather than approximated — 6 px per corner is small but
 *   it is exactly the kind of "close enough" that accumulates.
 */
export function pointInShape(
  shape: string,
  b: Box,
  px: number,
  py: number,
): boolean {
  // outside the box → outside every shape, and the cheap test first
  if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) return false;
  const poly = polygonOf(shape, b);
  if (poly) return pointInPolygon(poly, px, py);
  const { x, y, w, h } = b;
  switch (shape) {
    case "ellipse":
    case "circle": {
      const nx = (px - (x + w / 2)) / (w / 2);
      const ny = (py - (y + h / 2)) / (h / 2);
      return nx * nx + ny * ny <= 1;
    }
    case "corner_brackets":
      return true; // the extent, on purpose — see the doc comment
    default:
      return inRoundRect(x, y, w, h, cornerRadius(h), px, py);
  }
}

/** Inside a rounded rectangle, the radius computed exactly (no "close enough"). */
function inRoundRect(
  x: number, y: number, w: number, h: number, r: number, px: number, py: number,
): boolean {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  // inside the cross made by the two inner rectangles → in, no corner to test
  const inX = px >= x + r && px <= x + w - r;
  const inY = py >= y + r && py <= y + h - r;
  if (inX || inY) return true;
  const cx = px < x + r ? x + r : x + w - r;
  const cy = py < y + r ? y + r : y + h - r;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function distSqToSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return dx * dx + dy * dy;
}

/**
 * Inside the shape, or within `tol` world units of its outline (TOCCARE).
 *
 * The tolerance follows the silhouette — a band of constant width around the
 * polygon, the ellipse or the rounded rectangle — instead of inflating the box,
 * which would hand a rhombus back the corners EM1 took away from it.
 */
export function pointNearShape(
  shape: string,
  b: Box,
  px: number,
  py: number,
  tol: number,
): boolean {
  if (pointInShape(shape, b, px, py)) return true;
  if (tol <= 0) return false;
  if (px < b.x - tol || px > b.x + b.w + tol || py < b.y - tol || py > b.y + b.h + tol)
    return false;
  const poly = polygonOf(shape, b);
  if (poly) {
    const t2 = tol * tol;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (distSqToSegment(px, py, poly[j][0], poly[j][1], poly[i][0], poly[i][1]) <= t2)
        return true;
    }
    return false;
  }
  const { x, y, w, h } = b;
  switch (shape) {
    case "ellipse":
    case "circle": {
      const nx = (px - (x + w / 2)) / (w / 2 + tol);
      const ny = (py - (y + h / 2)) / (h / 2 + tol);
      return nx * nx + ny * ny <= 1;
    }
    case "corner_brackets":
      return true; // the box grown by tol, tested just above
    default:
      // Minkowski sum of a rounded rect and a disc: the same rect, radius + tol
      return inRoundRect(x - tol, y - tol, w + 2 * tol, h + 2 * tol,
                         cornerRadius(h) + tol, px, py);
  }
}

/** Inside a rect grown by `tol` on every side. */
export function pointNearRect(b: Box, px: number, py: number, tol: number): boolean {
  return px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol;
}

/**
 * Where a segment ENTERS the visible rectangle — the point the rubber band
 * should start from when its real origin is off screen.
 *
 * Liang-Barsky, kept to the entry parameter: the band is drawn from there to the
 * pointer, so the far end is always inside by construction. Returns null when the
 * whole segment misses the view (nothing sensible to draw).
 */
export function segmentEntry(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: { x0: number; y0: number; x1: number; y1: number },
): { x: number; y: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0; // parallel: inside iff not beyond the edge
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (
    clip(-dx, a.x - r.x0) &&
    clip(dx, r.x1 - a.x) &&
    clip(-dy, a.y - r.y0) &&
    clip(dy, r.y1 - a.y)
  )
    return { x: a.x + t0 * dx, y: a.y + t0 * dy };
  return null;
}
