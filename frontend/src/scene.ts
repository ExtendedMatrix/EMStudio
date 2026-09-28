import type { AdornmentBadge } from "./adornments";
import { nodeStyle } from "./palette";
import {
  drawBoxOf,
  drawsAsGlyph,
  glyphAspect,
  glyphRectOf,
  handleAnchor,
  pointNearRect,
  pointNearShape,
  type Box,
} from "./shape-geom";
import type { EmEdge, EmNode } from "./types";

export interface SceneNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  node: EmNode;
  /** number of hidden nodes this (folded group) node stands for */
  badge?: number;
  /**
   * EM 1.6 Master/Instance documents: a visual instance of a document node
   * (the graph holds ONE node; the drawing repeats it per usage context).
   * Points to the real node id — selection resolves to it.
   */
  instanceOf?: string;
  /** how many times this document is used in the scene (corner decorator) */
  useCount?: number;
  /** position is pinned (locked) — the renderer shows a small lock badge */
  pinned?: boolean;
  /** BADGE1 · ornament miniatures (author/license/embargo) pinned to a corner;
   *  a click on one selects the real ornament node. View-only — em.json is
   *  untouched (the nodes/edges stay in the document). */
  adornments?: AdornmentBadge[];
  /** PD1 · this node is a folded ParadataNodeGroup shown as a bottom-left tablet
   *  on its referent instead of a box. It must not be drawn as a node, must not
   *  get a connect handle, and must not be hit-tested (the tablet has its own
   *  hit rect). */
  collapsed?: boolean;
  /** BUGFIX-PDG · set on the REFERENT node: the id of a folded PDG collapsed onto
   *  it as a bottom-left tablet. The tablet is drawn from HERE (the referent's
   *  screen rect), so the collapsed PDG needs NO SceneGroup at all — no phantom
   *  box, no ± toggle. Clicking the tablet selects/enters this PDG. */
  pdCollapsed?: string;
}

export interface SceneEdge {
  source: string;
  target: string;
  edge: EmEdge;
}

export interface Lane {
  id: string;
  label: string;
  y: number;
  height: number;
  /** the epoch's own colour (data.color, e.g. #CCFFCC) — tints the swimlane */
  color?: string;
  /** epoch temporal bounds (data.start_time / end_time), shown in the label */
  start?: string;
  end?: string;
  /** the epoch's temporal ParadataNodeGroup id, if any — drawn as a small "PD"
   *  tag in the lane label chip (click to enter the group) instead of a box */
  paradataGroupId?: string;
  /** chronology-coherence conflict → a warning marker next to the name */
  warn?: boolean;
}

/** Vertical gap (world units) stacked between adjacent phase sub-bands. The
 *  dashed separator is drawn centred in this gap, so matrix.ts (which lays the
 *  bands out) and renderer.ts (which draws the separator) MUST share it. */
export const BAND_GAP = 26;

/**
 * A phase (sub-epoch) sub-band inside an epoch swimlane. Emitted only when the
 * epoch's phases are toggled visible; the renderer draws a dashed separator at
 * the band's top edge (except the first) plus a small phase label. Geometry is
 * view-only — the document is untouched.
 */
export interface SubBand {
  /** parent epoch lane id */
  laneId: string;
  /** the phase EpochNode id, or the parent epoch id for the residual band */
  phaseId: string;
  label: string;
  color?: string;
  /** world-space top of the band */
  y: number;
  height: number;
  /** true for the epoch's own (un-phased) residual band */
  residual?: boolean;
  /** true for the topmost band of a lane (no separator above it) */
  first?: boolean;
  /** nesting depth: 0 = a top-level phase / the epoch residual, 1+ = sub-phase */
  depth?: number;
  /** the phase's temporal ParadataNodeGroup id, if any — drawn as a small "PD"
   *  tag in the band label chip (click to enter) instead of a box */
  paradataGroupId?: string;
  /** phase temporal bounds (data.start_time / end_time), shown under the name */
  start?: string;
  end?: string;
  /** chronology-coherence conflict → a warning marker next to the name */
  warn?: boolean;
}

/** yEd-style group container drawn on the canvas (open box or closed tab). */
export interface SceneGroup {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  headerH: number;
  title: string;
  folded: boolean;
}

export interface Scene {
  nodes: SceneNode[];
  byId: Map<string, SceneNode>;
  edges: SceneEdge[];
  lanes: Lane[];
  /** phase sub-bands inside epoch lanes (matrix view; when phases are shown) */
  subBands?: SubBand[];
  /** container groups (matrix view); the group node itself stays in nodes */
  groups?: SceneGroup[];
  groupsById?: Map<string, SceneGroup>;
  /** member id → container group id (open containers only) */
  memberOf?: Map<string, string>;
}

/** ± toggle button of a group container under a world-space point. */
export function hitGroupToggle(
  scene: Scene,
  wx: number,
  wy: number,
): SceneGroup | null {
  for (const g of scene.groups ?? []) {
    if (wx >= g.x + 3 && wx <= g.x + 19 && wy >= g.y + 3 && wy <= g.y + 19)
      return g;
  }
  return null;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function sceneBounds(scene: Scene): Bounds {
  if (!scene.nodes.length) return { x: 0, y: 0, w: 100, h: 100 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of scene.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  for (const l of scene.lanes) {
    minY = Math.min(minY, l.y);
    maxY = Math.max(maxY, l.y + l.height);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Pan/zoom transform between world (layout) and screen (CSS px) space. */
export class Viewport {
  x = 0; // screen-space translation
  y = 0;
  scale = 1;

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.x) / this.scale, y: (sy - this.y) / this.scale };
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const next = Math.min(8, Math.max(0.02, this.scale * factor));
    const f = next / this.scale;
    this.x = sx - (sx - this.x) * f;
    this.y = sy - (sy - this.y) * f;
    this.scale = next;
  }

  fit(b: Bounds, viewW: number, viewH: number, pad = 40): void {
    const sw = (viewW - pad * 2) / Math.max(b.w, 1);
    const sh = (viewH - pad * 2) / Math.max(b.h, 1);
    // Very wide canvases (long EM matrices): fitting both axes makes nodes
    // microscopic — fit height instead and start at the left edge.
    if (b.w / Math.max(b.h, 1) > 4 * (viewW / Math.max(viewH, 1))) {
      this.scale = Math.min(2, Math.max(0.02, sh));
      this.x = pad - b.x * this.scale;
      this.y = (viewH - b.h * this.scale) / 2 - b.y * this.scale;
      return;
    }
    this.scale = Math.min(2, Math.max(0.02, Math.min(sw, sh)));
    this.x = (viewW - b.w * this.scale) / 2 - b.x * this.scale;
    this.y = (viewH - b.h * this.scale) / 2 - b.y * this.scale;
  }
}

/** Is a world-space point on a node's connect handle (right-edge circle)? */
export function hitHandle(
  n: SceneNode,
  wx: number,
  wy: number,
  scale: number,
): boolean {
  const r = 8 / Math.sqrt(scale); // slightly larger than drawn, easier to grab
  // the SAME anchor the renderer draws (EM2 · shape-geom.ts): grabbing a handle
  // that is not where you can see it is the kind of bug nobody reports, they
  // just stop using the gesture
  const vb = visibleBoxOf(n);
  const a = handleAnchor(vb);
  const dx = wx - a.x;
  const dy = wy - a.y;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Topmost node under a world-space point (nodes drawn in array order).
 *
 * TOCCARE · two passes. The exact silhouette first, top to bottom, so the node
 * that is really under the pointer always wins; only if none is, the same walk
 * again with `tol` (world units — the caller passes `HIT_TOL_PX / vp.scale`), so
 * a near miss lands on the nearest drawing instead of on empty canvas.
 */
export function hitTest(
  scene: Scene,
  wx: number,
  wy: number,
  tol = 0,
): SceneNode | null {
  for (const t of tol > 0 ? [0, tol] : [0]) {
    for (let i = scene.nodes.length - 1; i >= 0; i--) {
      const n = scene.nodes[i];
      if (n.collapsed) continue; // PD1 · collapsed-to-tablet node is not on the canvas
      if (wx < n.x - t || wx > n.x + n.w + t || wy < n.y - t || wy > n.y + n.h + t)
        continue;
      if (pointInNodeShape(n, wx, wy, t)) return n;
    }
  }
  return null;
}

/**
 * The rect the node's DRAWING occupies — what hover, selection ring, marquee,
 * connect handle and edge ports all use (TOCCARE).
 *
 * * a glyph → its fitted rect (`glyphRectOf`, the declared aspect);
 * * the property annotation → its whole box (it fills it);
 * * any shape → `drawBoxOf` (BR's 22 px rhombus, every other type its box).
 *
 * A glyph whose aspect is not declared keeps its box: better a target a little
 * larger than the drawing than one that changes shape when a bitmap decodes.
 */
export function visibleBoxOf(n: SceneNode): Box {
  const type = n.node.node_type;
  const data = n.node.data as Record<string, unknown> | undefined;
  if (drawsAsGlyph(type, data)) {
    if (type === "property") return { x: n.x, y: n.y, w: n.w, h: n.h };
    const a = glyphAspect(type, data);
    return a ? glyphRectOf(n, a) : { x: n.x, y: n.y, w: n.w, h: n.h };
  }
  return drawBoxOf(nodeStyle(type), n);
}

/**
 * Inside the node's SILHOUETTE, not merely inside its box (EM1), or within `tol`
 * of it (TOCCARE).
 *
 * The box test alone was right while every type filled its box and wrong the
 * moment they stopped: a click 30 px to the right of BR's 22 px rhombus selected
 * it, and the corner of a triangle's box selected an SE that was not drawn there.
 * The geometry comes from `shape-geom.ts` — the same vertices the renderer
 * strokes — so what you can click is what you can see, by construction.
 *
 * Glyphs test their fitted rect (`visibleBoxOf`). They used to keep the whole
 * box because the fit was only known once the image had decoded; the aspect is
 * declared in `2d_glyphs` now, and a `document` — 90 × 32 of box around a 23 px
 * sheet — was the worst of it: 67 px of invisible wings that selected it.
 */
function pointInNodeShape(n: SceneNode, wx: number, wy: number, tol: number): boolean {
  const type = n.node.node_type;
  // the node's data too: a DTC node is a glyph even when its type is not (EM2)
  if (drawsAsGlyph(type, n.node.data as Record<string, unknown> | undefined))
    return pointNearRect(visibleBoxOf(n), wx, wy, tol);
  const st = nodeStyle(type);
  return pointNearShape(st.shape, drawBoxOf(st, n), wx, wy, tol);
}
