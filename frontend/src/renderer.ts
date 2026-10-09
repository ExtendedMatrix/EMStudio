// Single canvas renderer serving both projections (matrix and graph view):
// one hit-testing model, one style system, styles driven by the EM palette
// metadata (palette.ts ← em_visual_rules.json). Edges are routed
// orthogonally with crossing bridges (routing.ts), yEd-style.
import { crispImage, dtcGlyphUrl, ICON_NODE_TYPES, imageFor, imageForUrl } from "./icons";
import { dtcGlyphName, stratigraphicKindLetter, stratigraphicKindOf } from "./rules";
import { documentVariant, edgeInk, edgeStyle, nodeStyle } from "./palette";
import {
  arrowheadPath,
  drawArrowhead,
  routeScene,
  SYMMETRIC_EDGES,
  traceRoute,
  type EdgeRoute,
} from "./routing";
import { BAND_GAP, visibleBoxOf } from "./scene";
import {
  segmentEntry, drawBoxOf, DOC_SHEET_ASPECT, glyphAspect, glyphRectOf, handleAnchor,
  shapePath } from "./shape-geom";
import { activeTheme, CANVAS_TYPE, canvasFont, canvasTheme, labelOn } from "./theme";
import { drawGlyph, glyphFor, type GlyphInk } from "./glyphs";

/** SHIFT-A fase 6b · the theme colours the RECOLOURABLE roles of a glyph take
 *  (`2d_glyphs._roles`): ink → the canvas ink, paper → the canvas ground, halo
 *  flipped — on a dark canvas only. Every other role keeps its EM hex. */
function glyphInk(): GlyphInk {
  const th = canvasTheme();
  return { ink: th.labelInk, paper: th.canvasBg, dark: activeTheme() === "dark" };
}
import type { Scene, Viewport } from "./scene";

export interface ConnectDrag {
  fromId: string;
  /** current pointer position, world space */
  x: number;
  y: number;
  targetId: string | null;
  validity: "valid" | "generic" | "invalid" | null;
  /**
   * Where the rubber band starts when the SOURCE NODE is not in this scene —
   * the point on the area's edge the connector came in through, world space.
   *
   * A connector that crossed from another tiled area is still one gesture, but
   * its origin can be off-screen (another projection, another framing). Without
   * this the line simply vanished and the only feedback left was the target
   * lighting up. Set by `main.ts` at the moment of the crossing; ignored as soon
   * as the source node is visible again.
   */
  fromAnchor?: { x: number; y: number };
  /** CATENA · the maniglia's direction, decided by the drag: up = the nodes
   *  above (they are the edge's source), down = the nodes below */
  dir?: "up" | "down" | null;
  /** world y where the drag started, to read the direction from */
  y0?: number;
}

export interface RenderState {
  /** E5 · the invitation to date an epoch that has no dates, in the reader's
   *  language («date: —», «add»). Drawn by the view, never saved: no node, no
   *  edge, no position. Absent → no invitation. */
  dateInvite?: { text: string; add: string } | null;
  hoverId: string | null;
  selectedId: string | null;
  /** multi-selection set (D3); the primary is still `selectedId` */
  selectedIds?: Set<string> | null;
  /** P4.3 · node id → who else has it selected, in a live room. Awareness, never
   *  a lock: nothing consults this before allowing an edit. */
  peerSelections?: Map<string, string[]> | null;
  /** edge_type predicate; edges failing it are skipped */
  edgeVisible: (edgeType: string | undefined) => boolean;
  /** index (into scene.edges) of the hovered connector, if any */
  hoverEdgeIdx?: number | null;
  /** index (into scene.edges) of the selected connector, if any */
  selectedEdgeIdx?: number | null;
  /** cache key for the edge filter (routes are recomputed when it changes) */
  filterKey?: string;
  /** live edge-drawing state (phase 4 editing) */
  connect?: ConnectDrag | null;
  /** show the connect handle on the hovered/selected node */
  editable?: boolean;
  /** EM-mode "insert epoch" hover: index of the lane boundary the cursor is
   *  near (0 = above the top lane … lanes.length = below the last). Draws a
   *  dashed insertion line + a "+" badge; the click is resolved in main.ts. */
  insertBoundary?: number | null;
  /** monochrome (B/W) mode: every node draws with a black border + white fill
   *  (shapes disambiguate; the pre-EM-1.3 look). Explicit user toggle. */
  monochrome?: boolean;
  /**
   * Nodes whose NAME breaks the paradata convention (NAME1), keyed by id:
   * `"warn"` = malformed / inconsistent / still temporary, `"dup"` = the name is
   * somebody else's. Computed once per document change in `main.ts` from the pure
   * `naming.ts`, so the label colour and the context-menu suggestion are the same
   * answer. Absent for every node that is fine, which is most of them.
   */
  nameStatus?: Map<string, { status: "ok" | "warn" | "dup" }> | null;
  /** STRUTTURA · nodes with a WARNING (`issues()`): an ochre «!» on the top-left
   *  corner, drawn over the node and outside the layout — the node, its size
   *  and its colours stay what `em_visual_rules` says. */
  warnIds?: Set<string> | null;
  /** COLLEGARE · the Matrix follows the story: the lane the current chapter
   *  narrates lights up, and the nodes it cites (embeds, mentions, the owners
   *  of a cited property) carry a mark. Chrome, never the node's own style. */
  storyLane?: string | null;
  storyCited?: Set<string> | null;
  /** CATENA · the AI chip of a node: dashed «AI» until a person verifies it,
   *  solid «AI ✓» after (data.ai_assisted / validated_by, connections 1.6.25) */
  aiNodes?: Map<string, "pending" | "verified"> | null;
  /** LEGENDA · the edge type picked in this window's legend: drawn on top at
   *  full strength, the others faded. Per window, never in the document. */
  highlightEdgeType?: string | null;
}

/** Label ink for a node: default, ORANGE when its name has a problem, RED when
 *  the name is a duplicate (NAME1).
 *
 *  The ONE place that decides it. The four label call sites below (document
 *  sheet, property annotation, icon glyph, shape) each had their own colour
 *  literal, and a fifth would have been added without noticing; now they ask.
 *
 *  Semantic colours, not theme colours: a name problem is a fact about the
 *  document and reads the same in any future theme. */
function labelInk(
  state: RenderState,
  nodeId: string,
  fallback: string,
): string {
  const st = state.nameStatus?.get(nodeId)?.status;
  if (st === "dup") return "#C62828"; // red — two nodes claim one name
  if (st === "warn") return "#C77700"; // orange — malformed or inconsistent
  return fallback;
}

// per-scene route cache (scenes are rebuilt on every document mutation)
interface RouteCache {
  key: string;
  routes: EdgeRoute[];
  visible: boolean[];
  /** GRAFO REATTIVO · per route its world box [x0, y0, x1, y1] (4 numbers per
   *  edge): the culling test of a paint, computed once per scene */
  boxes: Float64Array;
}
const routeCaches = new WeakMap<Scene, RouteCache>();

/** TOCCARE · a drag moves scene nodes in place (no rebuild), so the routes
 *  cached for that scene object must be recomputed on the next paint. */
export function invalidateRoutes(scene: Scene): void {
  routeCaches.delete(scene);
}

function routesFor(scene: Scene, state: RenderState): RouteCache {
  const key = state.filterKey ?? "all";
  const hit = routeCaches.get(scene);
  if (hit && hit.key === key) return hit;
  const visible = scene.edges.map((e) => state.edgeVisible(e.edge.edge_type));
  const routes = routeScene(scene, visible);
  const boxes = new Float64Array(routes.length * 4);
  routes.forEach((r, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of r.pts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    boxes.set([x0, y0, x1, y1], i * 4);
  });
  const cache = { key, routes, visible, boxes };
  routeCaches.set(scene, cache);
  return cache;
}

/**
 * GRAFO REATTIVO · G8 · the texts of a paint, fitted once. Every paint used to
 * fit every label again — a `measureText` per character removed until the
 * ellipsis fitted — and a label does not change between two frames of a pan.
 * Keyed by font, width (to a tenth of a unit) and text; emptied when it grows
 * past a few thousand entries.
 */
const fitCache = new Map<string, string>();
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  const key = `${ctx.font}|${Math.round(maxW * 10)}|${text}`;
  const hit = fitCache.get(key);
  if (hit !== undefined) return hit;
  let t = text;
  if (ctx.measureText(t).width > maxW) {
    while (t.length > 2 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    t += "…";
  }
  if (fitCache.size > 8000) fitCache.clear();
  fitCache.set(key, t);
  return t;
}

/** Squared distance from a point to a segment (world space). */
function distSqToSeg(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const vx = b.x - a.x,
    vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 ? ((px - a.x) * vx + (py - a.y) * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (a.x + t * vx),
    dy = py - (a.y + t * vy);
  return dx * dx + dy * dy;
}

/** Index into `scene.edges` of the closest VISIBLE connector whose routed
 *  polyline passes within `tol` world units of (wx,wy); -1 if none. Uses the
 *  same cached routes the renderer draws, so picking matches the drawing. */
export function edgeAt(
  scene: Scene,
  state: RenderState,
  wx: number,
  wy: number,
  tol: number,
): number {
  const { routes, visible } = routesFor(scene, state);
  const tol2 = tol * tol;
  let best = -1;
  let bestD = tol2;
  for (let i = 0; i < routes.length; i++) {
    if (!visible[i]) continue;
    const pts = routes[i].pts;
    for (let s = 0; s < pts.length - 1; s++) {
      const d = distSqToSeg(wx, wy, pts[s], pts[s + 1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}

// DARK1 · the canvas chrome comes from `theme.ts`, never from a literal here.
// Functions and not constants: a constant would freeze the palette at module load
// and the theme can change while the app is running.
const LANE_COLORS = (): [string, string] => {
  const t = canvasTheme();
  return [t.laneA, t.laneB];
};
const accentColor = (): string => canvasTheme().accent;
/** PELLE · the fixed size of the desk's scale, stepped down to 10px only when
 *  the box is too short to hold it (a label never scales with the box height
 *  any more, and never goes below 10px: a long one is cut with an ellipsis). */
const fitPx = (px: number, boxH: number): number =>
  boxH >= px * 2 ? px : Math.max(CANVAS_TYPE.minPx, Math.min(px, boxH * 0.55));
const groupHeaderFill = (): string => canvasTheme().groupHeaderFallback;
const groupBodyFill = (): string => canvasTheme().groupBody;

// B/W (monochrome) border: pure black on a LIGHT fill, pure white on a DARK fill,
// so it always contrasts the node's own body (real US → black, virtual US → white).
function monoBorder(fill: string): string {
  const h = fill.replace("#", "");
  if (h.length < 6) return "#000000";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? "#000000" : "#FFFFFF";
}

// SPAZIO · the genre decorator: its letter (only for a known genre of the
// datamodel) and its size, a fraction of the drawn height — 32 px box → 11 px.
function genreLetterOf(n: { node: { node_type?: string; data?: unknown } }): string {
  const kind = stratigraphicKindOf(n.node);
  return kind ? stratigraphicKindLetter(kind) : "";
}
const genreSize = (drawnH: number): number => Math.max(6, drawnH * 0.34);

// Decorator geometry — the chip side AT 100% ZOOM, in CSS px.
//
// BUGS-UI (INVERTS DEC1/PD1): decorators now SCALE WITH THE NODE they hang on.
// DEC1 pinned them to a fixed screen size, which kept them readable but made a
// zoomed-out graph a field of chips as big as the nodes themselves — the
// decoration competing with the thing decorated. They are drawn after the world
// transform is reset (so the text stays crisp and the hit rects stay screen
// space), but every dimension is multiplied by `vp.scale`, which is exactly what
// the node's own box does: the ratio chip-to-node is now constant at any zoom.
// Accepted consequence: zoomed far out they become small, like everything else.
// One source, reused by the ornament badges (BADGE1, top-right) and the PD
// decorator (PD1, bottom-left).
export const BADGE_PX = 16; // chip side at scale 1, CSS px
const BADGE_GAP = 3; // gap between stacked chips, CSS px
const BADGE_ICON_INSET = 0.16; // icon inset as a fraction of the chip
// A node's rectangle in SCREEN (CSS px) space, from its world box and the vp.
const nodeScreenRect = (
  n: { x: number; y: number; w: number; h: number },
  vp: Viewport,
): { x: number; y: number; w: number; h: number } => ({
  x: n.x * vp.scale + vp.x,
  y: n.y * vp.scale + vp.y,
  w: n.w * vp.scale,
  h: n.h * vp.scale,
});

// Screen-space hit rects for the "PD" tags drawn in lane / band label chips
// (an epoch's / phase's temporal ParadataNodeGroup, shown as a tag instead of a
// box). Rebuilt every draw; queried by main.ts on click to enter that group.
let pdTagHits: { pdgId: string; x: number; y: number; w: number; h: number }[] = [];
export function hitPdTag(sx: number, sy: number): string | null {
  for (const t of pdTagHits)
    if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h)
      return t.pdgId;
  return null;
}

// SCREEN-space hit rects for BADGE1 ornament badges (author/license/embargo)
// pinned to a referent's corner → the REAL ornament node id to select on click
// (a "+N" overflow chip carries the REFERENT id). Screen space (DEC1), like
// pdTagHits, because the badges are a fixed pixel size drawn after the world
// transform is reset; main.ts tests them with screen (client-relative) coords.
let adornmentHits: { ornamentId: string; x: number; y: number; w: number; h: number }[] = [];
export function hitAdornmentBadge(sx: number, sy: number): string | null {
  for (const t of adornmentHits)
    if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h)
      return t.ornamentId;
  return null;
}

// SCREEN-space hit rects for PD1 collapsed-ParadataNodeGroup tablets (bottom-left
// of the referent) → the PDG id. Single click selects the group, double click
// enters the hypergraph (main.ts). Screen space + fixed size, like the badges.
let pdDecoratorHits: { pdgId: string; x: number; y: number; w: number; h: number }[] = [];
export function hitPdDecorator(sx: number, sy: number): string | null {
  for (const t of pdDecoratorHits)
    if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h)
      return t.pdgId;
  return null;
}

// Screen-space hit rects for phase sub-band label chips → the id to select on
// click (the phase id, or the epoch id for the residual band). Rebuilt each draw.
let bandLabelHits: { id: string; x: number; y: number; w: number; h: number }[] = [];
/** AUDIT N5 · the lane chips as drawn (screen), so a phase label never covers
 *  one — and so a check can measure that it does not */
let laneChipHits: { id: string; x: number; y: number; w: number; h: number }[] = [];
/** E5 · the «add» of an epoch's invitation to date it → the epoch id (screen) */
let dateInviteHits: { id: string; x: number; y: number; w: number; h: number }[] = [];
export function hitDateInvite(sx: number, sy: number): string | null {
  for (const t of dateInviteHits)
    if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h) return t.id;
  return null;
}
/** for the checks: the invitations as drawn */
export function drawnDateInvites(): { id: string; x: number; y: number; w: number; h: number }[] {
  return dateInviteHits.map((r) => ({ ...r }));
}
export function drawnLabelRects(): { lanes: typeof laneChipHits; bands: typeof bandLabelHits } {
  return { lanes: laneChipHits.map((r) => ({ ...r })), bands: bandLabelHits.map((r) => ({ ...r })) };
}
export function hitBandLabel(sx: number, sy: number): string | null {
  for (const t of bandLabelHits)
    if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h)
      return t.id;
  return null;
}

// Screen-space hit circles for the "+" quick-add-phase button on each epoch's
// rail → the epoch id to add a phase to. Rebuilt each draw.
let addPhaseHits: { id: string; cx: number; cy: number; r: number }[] = [];
/** …as drawn (canvas px), for a probe that aims at one */
export function drawnAddPhase(): { id: string; cx: number; cy: number; r: number }[] {
  return addPhaseHits.map((h) => ({ ...h }));
}
export function hitAddPhase(sx: number, sy: number): string | null {
  for (const t of addPhaseHits)
    if ((sx - t.cx) ** 2 + (sy - t.cy) ** 2 <= t.r * t.r) return t.id;
  return null;
}

/** group title-tab colour: the canonical `label_background` from
 *  em_visual_rules when present (Activity cyan / Paradata peach / TimeBranch
 *  green / Location grey), else a legacy fallback tint from the border. */
function headerFillFor(
  nodeType: string,
  border: string,
  labelBg?: string,
): string {
  if (labelBg) return labelBg;
  if (nodeType === "ParadataNodeGroup") return groupHeaderFill();
  const h = border.replace("#", "");
  if (h.length < 6) return groupHeaderFill();
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.22)`;
}

function drawGroupContainer(
  ctx: CanvasRenderingContext2D,
  g: import("./scene").SceneGroup,
  borderColor: string,
  headerFill: string,
  scale: number,
  badge: number | undefined,
  drawLabels: boolean,
): void {
  // body
  ctx.beginPath();
  ctx.roundRect(g.x, g.y, g.w, g.h, 5);
  ctx.fillStyle = groupBodyFill();
  ctx.fill();
  ctx.setLineDash([5, 3]);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.2 / Math.sqrt(scale);
  ctx.stroke();
  ctx.setLineDash([]);
  // header band
  ctx.beginPath();
  ctx.roundRect(g.x, g.y, g.w, g.headerH, [5, 5, 0, 0]);
  ctx.fillStyle = headerFill;
  ctx.fill();
  // ± toggle
  ctx.fillStyle = canvasTheme().handleFill;
  ctx.strokeStyle = canvasTheme().handleRing;
  ctx.lineWidth = 1 / Math.sqrt(scale);
  ctx.fillRect(g.x + 4, g.y + 4, 13, 13);
  ctx.strokeRect(g.x + 4, g.y + 4, 13, 13);
  ctx.strokeStyle = canvasTheme().labelInk;
  ctx.lineWidth = 1.4 / Math.sqrt(scale);
  ctx.beginPath();
  ctx.moveTo(g.x + 7, g.y + 10.5);
  ctx.lineTo(g.x + 14, g.y + 10.5);
  if (g.folded) {
    ctx.moveTo(g.x + 10.5, g.y + 7);
    ctx.lineTo(g.x + 10.5, g.y + 14);
  }
  ctx.stroke();
  // title — the ink is decided by the header FILL (semantic label_background:
  // cyan/peach/green/grey), not by the theme: the tab colour is the same in both
  // themes, so a per-theme ink went illegible on it (peach-on-cyan in dark). The
  // label carries its own contrast via labelOn (DARK2).
  if (drawLabels) {
    ctx.font = canvasFont(CANVAS_TYPE.groupHeader.weight, fitPx(CANVAS_TYPE.groupHeader.px, g.headerH));
    ctx.fillStyle = labelOn(headerFill);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const maxW = g.w - 26;
    const t = fitText(ctx, g.title, maxW);
    ctx.fillText(t, g.x + 21, g.y + g.headerH / 2 + 0.5);
  }
  // badge for folded containers
  if (badge) {
    const r = 9 / Math.sqrt(scale);
    ctx.beginPath();
    ctx.arc(g.x + g.w, g.y, r, 0, Math.PI * 2);
    ctx.fillStyle = accentColor();
    ctx.fill();
    ctx.fillStyle = canvasTheme().onAccent;
    ctx.font = canvasFont(600, r * 1.1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(badge), g.x + g.w, g.y + r * 0.05);
  }
}

// The shape geometry moved to `shape-geom.ts` (EM1): the canvas path and the
// hit test are now built from ONE set of vertices, so the drawn silhouette and
// the clickable one cannot drift. `shapePath` below is that module's, called with
// the DRAWING box (shape_scale / shape_bbox applied) instead of x/y/w/h.

// "Arrows point DOWN": a directed edge means source-above-target. An edge that
// points UP (target above source) conflicts with the lane chronology (e.g. an
// is_after toward a unit in a more-recent lane). Mirrors em-core `upward_edges`:
// symmetric / membership / epoch-attribution / paradata-group edges are exempt.
const CONFLICT_COLOR = "#ff1e1e"; // bright red
const CONFLICT_EXEMPT = new Set<string>([
  ...SYMMETRIC_EDGES,
  "is_in_activity",
  "is_in_paradata_nodegroup",
  "is_in_location",
  "is_in_timebranch",
  "is_part_of",
  "has_first_epoch",
  "survive_in_epoch",
  "has_paradata_nodegroup",
  // DTCEMS1 · LA CATENA DTC, e non è un'esenzione di comodo: è la stessa
  // ragione per cui ci sono le sette righe qui sopra. L'invariante 3 governa
  // l'ORDINE STRATIGRAFICO — «chronologically earlier = lower on screen» — e la
  // catena digitale non è stratigrafia.
  //
  // In più la proiezione DTC disegna questi archi CONTRO la loro direzione, e lo
  // dichiara: «the flow is not the edge direction: `dtc_had_input` points from
  // the process to the resource it CONSUMED» (`views/dtc.ts`, il calcolo dei
  // ranghi). Quindi un `dtc_had_input` in quella vista punta all'insù per
  // costruzione, sempre.
  //
  // MISURATO stanotte, e la misura è che ogni singolo `dtc_had_input` di ogni
  // figura DTC era dipinto del colore del conflitto — anche quelli del corpus e
  // quelli della risposta del nodo, che passano di qui da prima. Un segnale che
  // si accende sempre non è un segnale; e sui legami verso un genitore
  // irrisolto faceva sembrare un ERRORE quella che è un'assenza dichiarata.
  "dtc_had_input",
  "dtc_derived_from",
]);
function upwardConflict(scene: Scene, e: Scene["edges"][number]): boolean {
  if (CONFLICT_EXEMPT.has(e.edge.edge_type ?? "")) return false;
  const s = scene.byId.get(e.source);
  const tg = scene.byId.get(e.target);
  if (!s || !tg) return false;
  return tg.y + 0.5 < s.y; // target above source → arrow points up → conflict
}

/** How one edge is stroked, beyond its type. */
export interface EdgeStrokeOpts {
  /** the zoom correction every width and dash is divided by: 1/√scale */
  k: number;
  arrowSize: number;
  bridgeR: number;
  /** points up against invariant 3: red, solid, at least 2.5 */
  conflict?: boolean;
  /** DTCEMS1 · a link to a parent that did not resolve: its own long dash */
  unresolved?: boolean;
  /** DTCEMS2 · a draft edge: faded, not coloured */
  draft?: boolean;
  /** the hovered node's edges, or the relation picked in the legend: full
   *  strength, double width */
  emphasis?: boolean;
  /** another relation is picked in the legend: this one steps back */
  faded?: boolean;
}

/**
 * THE stroke of an edge: colour, alpha, width, dash and arrowhead, from its
 * type's `edge_style` (em_visual_rules) and the theme's ink.
 *
 * One function, because two callers draw edges: the canvas, and the legend's
 * samples (`legend.ts`), which hand it a short straight route. A legend drawn
 * any other way would one day stop looking like the canvas it explains.
 */
export function strokeEdge(
  ctx: CanvasRenderingContext2D,
  route: EdgeRoute,
  edgeType: string | undefined,
  o: EdgeStrokeOpts,
): void {
  strokeEdges(ctx, [route], edgeType, o, true, true);
}

/**
 * GRAFO REATTIVO · G8 · many edges of ONE style in one path: one `stroke` and one
 * `fill` for the arrowheads, instead of one of each per edge (5000 units, 8000
 * edges: the paint was 8000 strokes). The style is `strokeEdge`'s, unchanged.
 *
 * LOD: `bridges` and `arrows` false drop the crossing bumps and the arrowheads —
 * the caller asks for them only when they are big enough on screen to be seen
 * (a 3.5-unit bump at 30% zoom is one pixel, and it was half of the paint).
 */
export function strokeEdges(
  ctx: CanvasRenderingContext2D,
  routes: EdgeRoute[],
  edgeType: string | undefined,
  o: EdgeStrokeOpts,
  bridges: boolean,
  arrows: boolean,
): void {
  if (!routes.length) return;
  const st = edgeStyle(edgeType);
  const conflict = !!o.conflict;
  // CONN-NIGHT: colour from the THEME (edgeInk), dash pattern from edgeStyle.
  const col = conflict ? CONFLICT_COLOR : edgeInk(edgeType);
  ctx.strokeStyle = col;
  if (o.emphasis) {
    ctx.globalAlpha = 1;
    ctx.lineWidth = st.width * 2 * o.k;
    ctx.setLineDash(st.dash.map((d) => d * o.k));
  } else {
    ctx.globalAlpha = conflict ? 1 : edgeType === "is_after" ? 0.85 : 0.45;
    if (o.draft) ctx.globalAlpha = 0.28;
    if (o.faded) ctx.globalAlpha *= 0.2;
    ctx.lineWidth = (conflict ? Math.max(st.width, 2.5) : st.width) * o.k;
    ctx.setLineDash(conflict ? [] : o.unresolved
      ? [11 * o.k, 7 * o.k]
      : st.dash.map((d) => d * o.k));
  }
  ctx.beginPath();
  for (const route of routes) traceRoute(ctx, route, bridges ? o.bridgeR : 0);
  ctx.stroke();
  ctx.setLineDash([]);
  if (arrows && !SYMMETRIC_EDGES.has(edgeType ?? "")) {
    ctx.beginPath();
    for (const route of routes) arrowheadPath(ctx, route, o.emphasis ? o.arrowSize * 1.4 : o.arrowSize);
    ctx.fillStyle = col;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function render(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  vp: Viewport,
  state: RenderState,
  viewW: number,
  viewH: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.translate(vp.x, vp.y);
  ctx.scale(vp.scale, vp.scale);

  const worldLeft = -vp.x / vp.scale;
  const worldRight = (viewW - vp.x) / vp.scale;

  // lanes whose colour wash is provided by their phase sub-bands instead (so
  // the lane's own wash is suppressed there — otherwise the two stack and the
  // phase colour muddies against the epoch colour underneath)
  const lanesWithBands = new Set(scene.subBands?.map((sb) => sb.laneId));

  // epoch swimlanes
  scene.lanes.forEach((lane, i) => {
    ctx.fillStyle = LANE_COLORS()[i % 2];
    ctx.fillRect(worldLeft, lane.y, worldRight - worldLeft, lane.height);
    // tint the whole lane with the epoch's own colour (data.color) at a very
    // low alpha — a 5%-visible wash; the strong colour lives in the left rail
    // + the label circle (drawn screen-space below). Skip it when sub-bands
    // cover the lane: each band paints its own single-colour wash below.
    if (lane.color && !lanesWithBands.has(lane.id)) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = lane.color;
      ctx.fillRect(worldLeft, lane.y, worldRight - worldLeft, lane.height);
      ctx.restore();
    }
    // COLLEGARE · the lane the current chapter narrates: a wash and a rail
    if (lane.id === state.storyLane) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = accentColor();
      ctx.fillRect(worldLeft, lane.y, worldRight - worldLeft, lane.height);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(worldLeft, lane.y, 5 / vp.scale, lane.height);
      ctx.restore();
    }
    // selected epoch → a faint accent wash over the whole lane (visual feedback)
    if (lane.id === state.selectedId) {
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = accentColor();
      ctx.fillRect(worldLeft, lane.y, worldRight - worldLeft, lane.height);
      ctx.restore();
    }
    ctx.strokeStyle = canvasTheme().laneLine;
    ctx.lineWidth = 1 / vp.scale;
    ctx.beginPath();
    ctx.moveTo(worldLeft, lane.y);
    ctx.lineTo(worldRight, lane.y);
    ctx.stroke();
  });

  // phase sub-bands: a faint per-phase colour wash + a dashed separator at the
  // top edge of every band below the first (the first band's top is the lane
  // border already drawn above)
  if (scene.subBands?.length) {
    for (const sb of scene.subBands) {
      if (sb.color) {
        // single wash per band (the lane wash is suppressed under bands), so a
        // touch stronger than the old stacked 6% for a clean, legible tint
        ctx.save();
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = sb.color;
        ctx.fillRect(worldLeft, sb.y, worldRight - worldLeft, sb.height);
        ctx.restore();
      }
      // selected phase → accent wash over its band (same feedback as an epoch
      // lane); the residual band defers to the epoch's own lane highlight
      if (!sb.residual && sb.phaseId === state.selectedId) {
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = accentColor();
        ctx.fillRect(worldLeft, sb.y, worldRight - worldLeft, sb.height);
        ctx.restore();
      }
      if (sb.first) continue; // topmost band: the lane border is its top edge
      ctx.save();
      ctx.strokeStyle = sb.color || canvasTheme().labelMuted;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.5 / vp.scale;
      ctx.setLineDash([9 / vp.scale, 6 / vp.scale]);
      ctx.beginPath();
      const sepY = sb.y - BAND_GAP / 2; // centre the line in the inter-band gap
      ctx.moveTo(worldLeft, sepY);
      ctx.lineTo(worldRight, sepY);
      ctx.stroke();
      ctx.restore();
    }
  }

  // edges (below nodes); incident edges of the HOVERED node get an accent pass
  // (a transient connection preview). Selection does NOT light up edges — that
  // read as "selecting all connected edges" and was unwanted (E.D.).
  const focusId = state.hoverId;
  const { routes, visible } = routesFor(scene, state);
  const bridgeR = 3.5;
  const arrowSize = 6 / Math.sqrt(vp.scale);
  const k = 1 / Math.sqrt(vp.scale);
  const accent: number[] = [];
  // LEGENDA · a relation picked in the legend: its edges drawn last and at full
  // strength, every other one faded. A view state, never a document fact.
  const lit = state.highlightEdgeType ?? null;
  const litIdx: number[] = [];
  // G8 · culling: an edge whose box does not touch the view is not traced
  const { boxes } = routesFor(scene, state);
  const cull = 24 / vp.scale;
  const wx0 = -vp.x / vp.scale - cull, wy0 = -vp.y / vp.scale - cull;
  const wx1 = (viewW - vp.x) / vp.scale + cull, wy1 = (viewH - vp.y) / vp.scale + cull;
  // G8 · LOD: the crossing bumps when they are 1.5 px on screen, the arrowheads
  // when they are 3 px; below that the edge is a line
  const lodBridges = bridgeR * vp.scale >= 1.5;
  const lodArrows = arrowSize * vp.scale >= 3;
  const batches = new Map<string, { type: string | undefined; o: EdgeStrokeOpts; routes: EdgeRoute[] }>();
  for (let i = 0; i < scene.edges.length; i++) {
    if (!visible[i]) continue;
    if (boxes[i * 4] > wx1 || boxes[i * 4 + 2] < wx0 || boxes[i * 4 + 1] > wy1 || boxes[i * 4 + 3] < wy0) continue;
    const e = scene.edges[i];
    if (focusId && (e.source === focusId || e.target === focusId)) {
      accent.push(i);
      continue;
    }
    const type = e.edge.edge_type ?? "";
    if (lit && type === lit) {
      litIdx.push(i);
      continue;
    }
    // DTCEMS1 · the link to a parent that did not resolve. A DRAWING rule about
    // a drawing-only construct — a chain read off the disk is in no graph — and
    // NOT an EM edge type invented at a call site.
    //
    // It needs its own pattern because the obvious one was already taken:
    // measured on `em_visual_rules.json`, the three DTC chain edges declare no
    // style at all and fall to `edgeStyle`'s generic `[4, 3]`, so in the DTC
    // view EVERY chain edge is already dashed. A dash here would have been a
    // signal identical to its background.
    const mark = (e.edge as { data?: { unresolved?: boolean; draft?: boolean } })
      .data;
    const conflict = upwardConflict(scene, e);
    const unresolved = !!mark?.unresolved;
    // DTCEMS2 · una BOZZA non è ancora niente: nessuno di questi archi esiste,
    // né nel documento né sul disco. Attenuata, non colorata — un colore avrebbe
    // detto «guarda qui», e quello che va detto è «non c'è ancora».
    const draft = !!mark?.draft;
    const key = `${type}|${+conflict}|${+unresolved}|${+draft}`;
    let b = batches.get(key);
    if (!b) {
      b = { type: e.edge.edge_type, routes: [],
            o: { k, arrowSize, bridgeR, conflict, unresolved, draft, faded: !!lit } };
      batches.set(key, b);
    }
    b.routes.push(routes[i]);
  }
  // the conflicts last, so a red edge is never under a grey one
  const order = [...batches.values()].sort((a, b) => +!!a.o.conflict - +!!b.o.conflict);
  for (const b of order) strokeEdges(ctx, b.routes, b.type, b.o, lodBridges, lodArrows);
  for (const i of litIdx) {
    const e = scene.edges[i];
    // the ochre halo of a picked connector under it (the selection's signal),
    // so a short edge still reads at full-figure zoom; the edge's own stroke —
    // colour, dash, arrow — stays on top, the one the legend shows
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = accentColor();
    ctx.lineWidth = (edgeStyle(e.edge.edge_type).width + 7) * k;
    ctx.beginPath();
    traceRoute(ctx, routes[i], bridgeR);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.globalAlpha = 1;
    strokeEdge(ctx, routes[i], e.edge.edge_type, {
      k, arrowSize, bridgeR, conflict: upwardConflict(scene, e), emphasis: true,
    });
  }
  for (const i of accent) {
    const e = scene.edges[i];
    strokeEdge(ctx, routes[i], e.edge.edge_type, {
      k, arrowSize, bridgeR, conflict: upwardConflict(scene, e), emphasis: true,
    });
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  // picked connector (hover / selection): a blue halo + a bold solid stroke so
  // one edge stands out for inspection or deletion. Selection beats hover.
  const pickEdge = (idx: number | null | undefined, sel: boolean): void => {
    if (idx == null || idx < 0 || !visible[idx]) return;
    const e = scene.edges[idx];
    const base = edgeStyle(e.edge.edge_type).width;
    ctx.lineCap = "round";
    ctx.globalAlpha = sel ? 0.28 : 0.16;
    ctx.strokeStyle = accentColor();
    ctx.lineWidth = (base + (sel ? 9 : 7)) / Math.sqrt(vp.scale);
    ctx.beginPath();
    traceRoute(ctx, routes[idx], bridgeR);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = (base + (sel ? 2.4 : 1.4)) / Math.sqrt(vp.scale);
    ctx.beginPath();
    traceRoute(ctx, routes[idx], bridgeR);
    ctx.stroke();
    ctx.lineCap = "butt";
    if (!SYMMETRIC_EDGES.has(e.edge.edge_type ?? ""))
      drawArrowhead(ctx, routes[idx], arrowSize * 1.4, accentColor());
  };
  pickEdge(state.hoverEdgeIdx, false);
  pickEdge(state.selectedEdgeIdx, true);
  ctx.globalAlpha = 1;

  // G8 · culling: the nodes whose box (with a margin for the label under a
  // glyph, the badges and the handles) touches the view. Every per-node pass
  // below walks THIS list; nothing off screen is drawn or measured.
  const nm = 90 / vp.scale;
  const nx0 = -vp.x / vp.scale - nm, ny0 = -vp.y / vp.scale - nm;
  const nx1 = (viewW - vp.x) / vp.scale + nm, ny1 = (viewH - vp.y) / vp.scale + nm;
  const shown = scene.nodes.filter((n) => n.x < nx1 && n.x + n.w > nx0 && n.y < ny1 && n.y + n.h > ny0);

  // nodes
  const drawLabels = vp.scale > 0.35;
  const isSel = (n: { id: string; instanceOf?: string }): boolean =>
    n.id === state.selectedId ||
    n.instanceOf === state.selectedId ||
    (state.selectedIds?.has(n.id) ?? false);
  for (const n of shown) {
    if (n.collapsed) continue; // PD1 · shown as a bottom-left tablet, not a node
    const st = nodeStyle(n.node.node_type);
    // Monochrome (B/W) mode: EVERY node draws with a black BORDER only — fills,
    // text and container header tints are left untouched (nodes are told apart by
    // SHAPE + their existing fills, e.g. virtual USVn/USVs keep their black fill +
    // white text). Explicit user toggle, not tied to any template.
    const mono = state.monochrome === true;
    // B/W mode: the border must CONTRAST the node's own fill — BLACK on a light
    // fill (real US, #F0F0F0), WHITE on a dark fill (virtual USVn/USVs, black).
    // Using the theme's labelInk instead painted a real US's border white on the
    // dark canvas — invisible on its white body (E.D.). This reads the fill, not
    // the theme, so it is right in both themes.
    const borderCol = mono ? monoBorder(st.fill || "#FFFFFF") : st.border;
    const group = scene.groupsById?.get(n.id);
    if (group) {
      drawGroupContainer(
        ctx,
        group,
        borderCol,
        headerFillFor(n.node.node_type, st.border, st.labelBackground),
        vp.scale,
        n.badge,
        drawLabels,
      );
      if (isSel(n) || n.id === state.hoverId) {
        const active = n.id === state.selectedId || n.instanceOf === state.selectedId;
        ctx.strokeStyle = active ? accentColor() : isSel(n) ? canvasTheme().selectSoft : canvasTheme().hoverSoft;
        ctx.lineWidth = (active ? 3.6 : isSel(n) ? 2.6 : 1.6) / vp.scale;
        ctx.strokeRect(n.x - 2, n.y - 2, n.w + 4, n.h + 4);
      }
      continue;
    }

    // paradata nodes render as their official 2D icon (yEd parity):
    // extractor / combiner get the glyph with the label top-left,
    // document gets the sheet with the label over it
    // extractor/combiner → official 2D icon; DTC nodes → their per-kind glyph
    // (data-driven from node.data.dtc_kind via dtc_kinds). Both render glyph-only.
    //
    // SHIFT-A fase 6b · a type with an entry in `2d_glyphs` is drawn FROM ITS
    // PATHS (`glyphs.ts`), and its bitmap is never even requested: sharp at every
    // zoom, in every engine, and never a file that can be missing. The bitmap
    // path below stays for a glyph the datamodel does not describe.
    const pathGlyph = glyphFor(
      n.node.node_type,
      n.node.data as Record<string, unknown> | undefined,
    );
    let icon = pathGlyph
      ? null
      : ICON_NODE_TYPES.has(n.node.node_type)
        ? imageFor(n.node.node_type)
        : null;
    if (!icon && !pathGlyph) {
      const glyph = dtcGlyphUrl(
        dtcGlyphName(
          (n.node.data as Record<string, unknown> | undefined)?.dtc_kind as
            | string
            | undefined,
        ),
      );
      if (glyph) icon = imageForUrl(glyph);
    }
    // document: vector sheet with ITS OWN border — thickness carries the
    // Canonical/Instance role, colour the geometry-axis variant
    // (em_visual_rules.document_variant_styles); corner decorator counts
    // the scene uses.
    // em.json schema 2 spells the flag `is_canonical`; `is_master` is the
    // legacy spelling, still READ so older em.json files render, never written.
    if (n.node.node_type === "document") {
      const data = (n.node.data ?? {}) as Record<string, unknown>;
      const isCanonical =
        data["is_canonical"] === true ||
        data["is_master"] === true ||
        (!n.instanceOf && ((n.useCount ?? 0) > 1 || !!n.dated));
      // WIDTH says canonical/instance, COLOUR says geometry — resolved once,
      // from the datamodel, by the same rule s3Dgraphy uses.
      const variant = documentVariant(data, isCanonical);
      // TOCCARE · the sheet's rect is `glyphRectOf` — the one the hit test uses
      const { x: x0, y: y0, w: iw, h: ih } = glyphRectOf(n, DOC_SHEET_ASPECT);
      const f = iw * 0.32; // folded corner
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + iw - f, y0);
      ctx.lineTo(x0 + iw, y0 + f);
      ctx.lineTo(x0 + iw, y0 + ih);
      ctx.lineTo(x0, y0 + ih);
      ctx.closePath();
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      // The datamodel's widths are yEd stroke widths (4.0 canonical / 1.0
      // instance); scale them to the canvas the way every other border here is
      // scaled, and keep a floor so a thin border never disappears when zoomed
      // out.
      const bw = Math.max(0.9, variant.width * 0.6) / Math.sqrt(vp.scale);
      ctx.strokeStyle = variant.color;
      ctx.lineWidth = bw;
      ctx.stroke();
      // fold — always hairline, it is a fold and not a border
      ctx.beginPath();
      ctx.moveTo(x0 + iw - f, y0);
      ctx.lineTo(x0 + iw - f, y0 + f);
      ctx.lineTo(x0 + iw, y0 + f);
      ctx.strokeStyle = variant.color;
      ctx.lineWidth = 0.9 / Math.sqrt(vp.scale);
      ctx.stroke();
      if (drawLabels) {
        const label = (n.label ?? String(n.node.name || n.id));
        ctx.font = canvasFont(CANVAS_TYPE.nodeLabel.weight, CANVAS_TYPE.minPx);
        // ON the sheet, whose fill is white paper from the datamodel: the ink
        // follows the FILL, not the theme (`labelOn`). Using the canvas ink here
        // made the name disappear on a white sheet in dark mode.
        ctx.fillStyle = labelInk(state, n.node.id ?? n.id, labelOn("#FFFFFF"));
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, n.x + n.w / 2, y0 + ih * 0.62);
      }
      if (n.useCount) {
        // BUGS-UI · world-constant, like every other node decorator
        const r = 6.5;
        const bx = x0 + iw + 1;
        const by = y0 + ih + 1;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fillStyle = n.instanceOf ? canvasTheme().labelMuted : canvasTheme().labelInk;
        ctx.fill();
        ctx.fillStyle = canvasTheme().handleFill;
        ctx.font = canvasFont(600, r * 1.15);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(n.useCount), bx, by + r * 0.05);
      }
      if (isSel(n) || n.id === state.hoverId) {
        const active = n.id === state.selectedId || n.instanceOf === state.selectedId;
        ctx.strokeStyle = active ? accentColor() : isSel(n) ? canvasTheme().selectSoft : canvasTheme().hoverSoft;
        ctx.lineWidth = (active ? 3.6 : isSel(n) ? 2.6 : 1.6) / vp.scale;
        ctx.strokeRect(x0 - 3, y0 - 3, iw + 6, ih + 6);
      }
      continue;
    }

    // property: the BPMN **text annotation**, which is what the palette
    // template actually uses — `y:GenericNode` with configuration
    // `com.yworks.bpmn.Artifact.withShadow` and
    // `com.yworks.bpmn.type = ARTIFACT_TYPE_ANNOTATION`.
    //
    // The annotation has NO closed rectangle: it is a bracket on the left edge
    // and the text beside it, over a near-white field (#FFFFFFE6). The previous
    // rendering stroked a full box AND drew the ticks outside it, which read as
    // a framed chip — a different shape from the one the author draws in yEd.
    if (n.node.node_type === "property") {
      const st = nodeStyle(n.node.node_type);
      ctx.fillStyle = st.fill || canvasTheme().laneChip;
      ctx.fillRect(n.x, n.y, n.w, n.h);
      // the bracket: short tick, down the left edge, short tick
      const tick = Math.min(5, n.w * 0.18);
      ctx.beginPath();
      ctx.moveTo(n.x + tick, n.y);
      ctx.lineTo(n.x, n.y);
      ctx.lineTo(n.x, n.y + n.h);
      ctx.lineTo(n.x + tick, n.y + n.h);
      ctx.strokeStyle = st.border || "#000000";
      ctx.lineWidth = 1.1 / Math.sqrt(vp.scale);
      ctx.stroke();
      if (drawLabels) {
        const label = (n.label ?? String(n.node.name || n.id));
        ctx.font = canvasFont(500, fitPx(CANVAS_TYPE.nodeLabel.px, n.h));
        // the annotation draws its own pale field (st.fill): ink from the fill
        ctx.fillStyle = labelInk(
          state,
          n.node.id ?? n.id,
          labelOn(st.fill || "#FFFFFF"),
        );
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const maxW = n.w - 10;
        const text = fitText(ctx, label, maxW);
        ctx.fillText(text, n.x + n.w / 2, n.y + n.h / 2);
      }
      if (isSel(n) || n.id === state.hoverId) {
        const active = n.id === state.selectedId || n.instanceOf === state.selectedId;
        ctx.strokeStyle = active ? accentColor() : isSel(n) ? canvasTheme().selectSoft : canvasTheme().hoverSoft;
        ctx.lineWidth = (active ? 3.6 : isSel(n) ? 2.6 : 1.6) / vp.scale;
        ctx.strokeRect(n.x - 3, n.y - 3, n.w + 6, n.h + 6);
      }
      continue;
    }

    if (icon || pathGlyph) {
      // POL2 · the icon is FITTED to the node box, preserving its aspect ratio.
      //
      // It used to be sized from the height alone (`min(n.h, 30)`) and the width
      // left to follow — so a wide glyph in a narrow box spilled past the border
      // and read as off-centre (E.D. saw it on `document_01`). Constraining both
      // axes and taking the smaller scale is the standard "contain" fit: the icon
      // never overflows, and because both axes shrink together it is never
      // stretched either.
      //
      // NOTE (follow-up, not done here): the deeper ask was for the node BOX to
      // take the icon's proportions — same height everywhere, width = height ×
      // aspect. That is a LAYOUT change, not a drawing one: `n.w`/`n.h` come from
      // em-core, they are what hit-testing and edge routing use, and node sizes
      // sit under the determinism contract (invariant 7, the 8 layout tests).
      // Doing it in the renderer alone would draw a box that clicks do not match.
      //
      // TOCCARE · the aspect is the DECLARED one (`2d_glyphs`, via glyphAspect)
      // whenever there is one, so the drawn rect is `glyphRectOf` — the rect the
      // hit test, the ring and the handle use. The bitmap's own proportions are
      // the fallback for a glyph the datamodel does not describe.
      const aspect =
        pathGlyph?.aspect ??
        glyphAspect(n.node.node_type, n.node.data as Record<string, unknown> | undefined) ??
        (icon ? icon.naturalWidth / Math.max(1, icon.naturalHeight) : 1);
      const { x: ix, y: iy, w: iw, h: ih } = glyphRectOf(n, aspect);
      if (pathGlyph) {
        // "contain" fit of the viewBox into the rect the hit test uses; the
        // stroke widths are viewBox units, so they scale with the glyph
        drawGlyph(ctx, pathGlyph, ix, iy, iw, ih, glyphInk());
        // RISORSA-FILE · a parent DECLARED and not stamped (an object of a
        // .blend, the photographs of a model): the same glyph inside a DASHED
        // frame, where a stamped resource has none — «there, and nobody took
        // its fingerprint». The dash is the language the graph already uses for
        // a parent it cannot see (the unresolved `?`), the frame keeps it apart.
        if ((n.node.data as { declared_only?: boolean } | undefined)?.declared_only) {
          const pad = 3 / Math.sqrt(vp.scale);
          ctx.save();
          ctx.setLineDash([4 / vp.scale, 3 / vp.scale]);
          ctx.strokeStyle = canvasTheme().labelInk;
          ctx.lineWidth = 1.1 / vp.scale;
          ctx.beginPath();
          ctx.roundRect(ix - pad, iy - pad, iw + 2 * pad, ih + 2 * pad, 4 / vp.scale);
          ctx.stroke();
          ctx.restore();
        }
      } else if (icon) {
        // PELLE · a bitmap rasterised at the size it occupies on the device
        // (drawn size × dpr × zoom band), not the SVG's 23 px natural size scaled up
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(crispImage(icon, iw, ih, dpr * vp.scale), ix, iy, iw, ih);
      }
      if (drawLabels) {
        const label = (n.label ?? String(n.node.name || n.id));
        ctx.font = canvasFont(CANVAS_TYPE.nodeLabel.weight, CANVAS_TYPE.minPx);
        ctx.fillStyle = labelInk(state, n.node.id ?? n.id, canvasTheme().labelInk);
        if (st.labelPosition === "top_left") {
          // STRUTTURA · PELLE's defect 3: the yEd `top_left` label sat on the
          // glyph's top edge and covered it («X.01» over the extractor's
          // disc), and its underline crossed the connector coming in from
          // above. It goes UNDER the glyph now, centred, ellipsised to the node
          // box — the node, its size and its glyph are untouched.
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const maxW = Math.max(n.w, iw + 16) - 4;
          const text = fitText(ctx, label, maxW);
          ctx.fillText(text, n.x + n.w / 2, iy + ih + 2 / Math.sqrt(vp.scale));
        } else if (ctx.measureText(label).width > iw - 10 && n.w > iw + 8) {
          // DAG · a glyph-only node whose name does not fit ON the glyph. The
          // ellipsis path below would print "…" over a 30px gear, so the node
          // ends up NAMELESS — measured on a DTC corpus where the processes are
          // the story ("Metashape", "raddrizzamento") and read as three
          // identical circles. When the node box is wider than its glyph, the
          // name goes UNDER the glyph, inside the box that hit-testing uses.
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const maxW = n.w - 6;
          const text = fitText(ctx, label, maxW);
          ctx.fillText(text, n.x + n.w / 2, iy + ih + 2);
        } else {
          // "over": centred on the icon (document sheet / property chip)
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const maxW = iw - 10;
          const text = fitText(ctx, label, maxW);
          ctx.fillText(text, n.x + n.w / 2, iy + ih * 0.62);
        }
      }
      if (isSel(n) || n.id === state.hoverId) {
        const active = n.id === state.selectedId || n.instanceOf === state.selectedId;
        ctx.strokeStyle = active ? accentColor() : isSel(n) ? canvasTheme().selectSoft : canvasTheme().hoverSoft;
        ctx.lineWidth = (active ? 3.6 : isSel(n) ? 2.6 : 1.6) / vp.scale;
        ctx.strokeRect(ix - 3, iy - 3, iw + 6, ih + 6);
      }
      continue;
    }

    // POL4/POL5 · the DRAWING box, from the visual rules: `shape_scale` shrinks it
    // inside the node box (BR = 0.7), `shape_bbox: square` makes it square so a
    // diamond is a rhombus and not a lozenge flattened by the 90×32 node. Both are
    // no-ops for every other type. The node box stays n.w × n.h: hit-testing, edge
    // ports and routing all use it, and shrinking it here would draw a node that
    // clicks and connectors do not follow (invariant 7 — per-type sizes are
    // em-core's, and EM1 is where they land).
    // ONE geometry, shared with the hit test (EM1 · shape-geom.ts)
    const box = drawBoxOf(st, n);
    const { x: sx, y: sy, w: sw, h: sh } = box;
    if (st.shape === "corner_brackets") {
      // the corner path is deliberately NOT closed (see shapePath), so it cannot
      // be filled: fill the box, then stroke the corners over it
      ctx.beginPath();
      ctx.rect(sx, sy, sw, sh);
      ctx.fillStyle = st.fill;
      ctx.fill();
      shapePath(ctx, st.shape, box);
    } else {
      shapePath(ctx, st.shape, box);
      ctx.fillStyle = st.fill;
      ctx.fill();
    }
    // monochrome → black border only (see `mono`); fill untouched. Else EM colour.
    ctx.strokeStyle = borderCol;
    // thick coloured frame so US/USV/SF/… read like the historical EM icons.
    // yEd parity: the border is a fixed fraction of the node (world units), so
    // it stays proportionally thick at every zoom — the old `/sqrt(scale)` made
    // it look thin once you zoomed IN on a node. A screen-space floor keeps it
    // visible when zoomed far out.
    ctx.lineWidth = Math.max(st.borderWidth, 1.4 / vp.scale);
    // DTCEMS1 · a parent that did not resolve is drawn as an ABSENCE WITH A
    // NAME: dashed border, so it reads as "there was one and I do not have it"
    // rather than as a fault. Same species as the funnel-inherited badge below
    // — attenuation for something that is drawn without being in the graph.
    // …and a DECLARED parent drawn as a box (no glyph for its kind) reads the
    // same way: dashed, there and not fingerprinted
    const absent = !!(n.node.data as { unresolved?: boolean; declared_only?: boolean } | undefined)
      ?.unresolved || !!(n.node.data as { declared_only?: boolean } | undefined)?.declared_only;
    // …e lo stesso per un nodo della bozza: si vede che c'è e si vede che non
    // è ancora stato emesso.
    const draft = !!(n.node.data as { draft?: boolean } | undefined)?.draft;
    if (draft) ctx.globalAlpha = 0.55;
    ctx.setLineDash(
      absent
        ? [7 / vp.scale, 4 / vp.scale]
        : st.borderStyle === "dashed"
          ? [5, 3]
          : st.borderStyle === "dotted"
            ? [2, 2]
            : [],
    );
    ctx.stroke();
    ctx.setLineDash([]);
    if (draft) ctx.globalAlpha = 1;

    if (n.id === state.selectedId || n.instanceOf === state.selectedId || n.id === state.hoverId) {
      // the halo hugs the DRAWN shape, not the box: a 90×32 outline around BR's
      // 22px square would read as a selection of something else
      shapePath(ctx, st.shape, { x: sx - 2, y: sy - 2, w: sw + 4, h: sh + 4 });
      ctx.strokeStyle = n.id === state.selectedId || n.instanceOf === state.selectedId ? accentColor() : canvasTheme().selectSoft;
      ctx.lineWidth = 2.2 / vp.scale;
      ctx.stroke();
    }

    if (drawLabels) {
      const label = (n.label ?? String(n.node.name || n.id));
      ctx.font = canvasFont(CANVAS_TYPE.nodeLabel.weight, fitPx(CANVAS_TYPE.nodeLabel.px, n.h));
      // A SHRUNKEN shape (BR) cannot hold its own name: `textColor` is computed
      // from the fill, so over BR's black square it is near-white — and the name
      // is far wider than 22 px, so most of it would land outside the square as
      // white text on a white canvas, i.e. invisible. So a scaled shape captions
      // BELOW the glyph in ink, the way a marker is annotated on a drawing.
      const captionOutside = st.shapeScale < 1;
      // the label sits ON the node's semantic fill (or below it, for a scaled
      // glyph): `labelOn` picks black/white from the FILL's luminance, because the
      // fill comes from the datamodel and does not change with the theme. NAME1's
      // orange/red still wins — a broken name is a fact, not decoration.
      ctx.fillStyle = labelInk(
        state,
        n.node.id ?? n.id,
        captionOutside ? canvasTheme().labelInk : labelOn(st.fill),
      );
      ctx.textAlign = "center";
      ctx.textBaseline = captionOutside ? "top" : "middle";
      // a genre decorator takes the bottom-right corner: the name keeps its
      // centre and gives up the same width on both sides
      const kindLetter = genreLetterOf(n);
      const maxW = n.w - 8 - (kindLetter && !captionOutside ? 2 * genreSize(sh) : 0);
      const text = fitText(ctx, label, maxW);
      ctx.fillText(
        text,
        n.x + n.w / 2,
        captionOutside ? sy + sh + 1 : n.y + n.h / 2,
      );
    }

    // SPAZIO · the GENRE of a US (node datamodel `stratigraphic_kind`): a small
    // letter — M masonry, R coating, from the datamodel's default code — in the
    // bottom-right corner INSIDE the drawing, in the colour of its border. The
    // EM colours and the shape do not change (E.D., 30 Sep 2026); the other
    // corners are taken (warning top-left, lock/use-count/ornaments top-right,
    // PD tablet bottom-left, the AI chip just outside bottom-right, the handle on
    // the right edge at mid-height).
    {
      const letter = genreLetterOf(n);
      if (letter) {
        const gs = genreSize(sh);
        ctx.font = canvasFont(700, gs);
        ctx.fillStyle = borderCol;
        ctx.textAlign = "right";
        ctx.textBaseline = "alphabetic";
        const inset = Math.max(st.borderWidth, 1.4 / vp.scale) + gs * 0.18;
        ctx.fillText(letter, sx + sw - inset, sy + sh - inset);
      }
    }

    // folded-group badge (count of hidden nodes)
    if (n.badge) {
      // BUGS-UI · a world-constant radius: the count badge scales with the node
      // exactly like the ornament chips (it used to grow as 1/sqrt(scale),
      // a half-measure that made it swell on a zoomed-out canvas).
      const r = 9;
      const bx = n.x + n.w;
      const by = n.y;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = accentColor();
      ctx.fill();
      ctx.fillStyle = canvasTheme().onAccent;
      ctx.font = canvasFont(600, r * 1.1);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n.badge), bx, by + r * 0.05);
    }
  }

  // P4.3 · AWARENESS: a dashed ring on the nodes somebody ELSE has selected.
  //
  // One pass, after the nodes, instead of a branch inside each of the four
  // shapes — the mark is the same for all of them, and threading it through the
  // per-shape code would be four places to keep in step.
  //
  // Dashed, and never the selection colour: this is not YOUR selection, and a
  // ring that looked like one would make you think you had clicked something.
  // It is awareness, so it says "somebody is here" and nothing more — there is
  // no code path from this to refusing an edit, which is what "soft" has to mean
  // to be true (design P4 §6).
  if (state.peerSelections?.size) {
    ctx.save();
    ctx.setLineDash([6 / vp.scale, 4 / vp.scale]);
    ctx.strokeStyle = canvasTheme().peerAware;
    ctx.lineWidth = 2.2 / vp.scale;
    for (const n of shown) {
      if (n.collapsed) continue;
      if (!state.peerSelections.has(n.id)) continue;
      ctx.strokeRect(n.x - 4, n.y - 4, n.w + 8, n.h + 8);
    }
    ctx.restore();
  }

  // connect handles: a bullet on the right edge of EVERY node (drag it to
  // draw an edge, or drop in the void to create a target node). Shown on all
  // nodes once zoomed in enough to be legible; only the hovered/selected node
  // keeps its accent bullet at low zoom so the overview stays uncluttered.
  if (state.editable && !state.connect) {
    const active = state.hoverId ?? state.selectedId;
    const showAll = vp.scale > 0.5;
    for (const n of shown) {
      if (n.collapsed) continue; // PD1 · no handle on a collapsed-to-tablet node
      const isActive = n.id === active;
      if (!isActive && !showAll) continue;
      const r = (isActive ? 5.5 : 4) / Math.sqrt(vp.scale);
      // the anchor is `shape-geom.ts::handleAnchor` of `visibleBoxOf` — the same
      // expression `scene.ts::hitHandle` grabs (EM2, TOCCARE): ON the drawing,
      // also for the document sheet that em-core leaves in a 90 × 32 box.
      const ha = handleAnchor(visibleBoxOf(n));
      ctx.beginPath();
      ctx.arc(ha.x, ha.y, r, 0, Math.PI * 2);
      ctx.fillStyle = canvasTheme().handleFill;
      ctx.fill();
      ctx.strokeStyle = isActive ? accentColor() : canvasTheme().handleRing;
      ctx.lineWidth = (isActive ? 2 : 1.3) / Math.sqrt(vp.scale);
      ctx.stroke();
    }
  }
  // pinned badge: a small lock at the top-right corner of every locked node
  for (const n of shown) {
    if (!n.pinned || n.collapsed) continue;
    const s = 12 / vp.scale;
    ctx.font = canvasFont(400, s);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔒", n.x + n.w - s * 0.35, n.y + s * 0.35);
  }

  // STRUTTURA · the WARNING badge: an ochre disc with «!», on the top-left
  // corner (the top-right one is the lock's and the use-count's). World-space
  // like the lock, a constant screen size; chrome, never a node's own style.
  if (state.warnIds?.size) {
    const r = 7 / vp.scale;
    for (const n of shown) {
      if (!state.warnIds.has(n.id)) continue;
      const cx = n.x;
      const cy = n.y;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#e3b43a";
      ctx.fill();
      ctx.lineWidth = 2 / vp.scale;
      ctx.strokeStyle = canvasTheme().handleRing;
      ctx.stroke();
      ctx.fillStyle = "#1d1d1b";
      ctx.font = canvasFont(700, 10 / vp.scale);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", cx, cy + 0.5 / vp.scale);
    }
  }

  // COLLEGARE · what the current chapter cites: a dashed accent frame around it
  if (state.storyCited?.size) {
    ctx.save();
    ctx.strokeStyle = accentColor();
    ctx.lineWidth = 2.2 / vp.scale;
    ctx.setLineDash([5 / vp.scale, 3 / vp.scale]);
    const pad = 4 / vp.scale;
    for (const n of shown) {
      if (!state.storyCited.has(n.instanceOf ?? n.id)) continue;
      ctx.strokeRect(n.x - pad, n.y - pad, n.w + pad * 2, n.h + pad * 2);
    }
    ctx.restore();
  }

  if (state.aiNodes?.size) {
    ctx.save();
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ai-ink").trim() || "#7a4fc4";
    const panel = css.getPropertyValue("--bg-panel").trim() || "#fff";
    const h = 13 / Math.sqrt(vp.scale);
    ctx.font = canvasFont(700, h * 0.7);
    ctx.textBaseline = "middle";
    for (const n of shown) {
      const st = state.aiNodes.get(n.instanceOf ?? n.id);
      if (!st) continue;
      const label = st === "verified" ? "AI ✓" : "AI";
      const w = ctx.measureText(label).width + h * 0.7;
      const vb = visibleBoxOf(n);
      // just OUTSIDE the drawing, bottom-right: the selection frame and the
      // top corners (warning, lock, ornament badges) are drawn over the inside
      const x = vb.x + vb.w + 3 / vp.scale, y = vb.y + vb.h - h;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h / 2);
      ctx.fillStyle = panel;
      ctx.fill();
      ctx.setLineDash(st === "verified" ? [] : [2.5 / vp.scale, 2 / vp.scale]);
      ctx.lineWidth = 1.2 / vp.scale;
      ctx.strokeStyle = ink;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.fillText(label, x + h * 0.35, y + h / 2);
    }
    ctx.restore();
  }

  // BADGE1 ornament badges are drawn in SCREEN space (DEC1) — see the pass after
  // the transform is reset to device pixels below.

  if (state.connect) {
    const from = scene.byId.get(state.connect.fromId);
    // The band starts at the source node's handle when that node is here, and
    // at the AREA EDGE the connector crossed when it is not (see `fromAnchor`).
    const origin = from ? handleAnchor(visibleBoxOf(from)) : state.connect.fromAnchor;
    // The band must always have a VISIBLE start. Its origin can be off screen in
    // two ways: the node is in another area (`fromAnchor`, set at the crossing)
    // or it is in this scene but outside the current framing — panned away, or
    // simply on a graph bigger than the window. Either way the line is clipped
    // to the view and starts at the edge it comes in through, with a dot to say
    // "it continues out there".
    const end = { x: state.connect.x, y: state.connect.y };
    const margin = 6 / vp.scale;
    const view = {
      x0: worldLeft + margin,
      y0: -vp.y / vp.scale + margin,
      x1: worldRight - margin,
      y1: (viewH - vp.y) / vp.scale - margin,
    };
    const originVisible =
      !!origin &&
      origin.x >= view.x0 &&
      origin.x <= view.x1 &&
      origin.y >= view.y0 &&
      origin.y <= view.y1;
    const start =
      origin && !originVisible ? segmentEntry(origin, end, view) : origin;
    const anchored = !!start && !originVisible;
    if (start) {
      const colors = {
        valid: "#1a7f37",
        generic: canvasTheme().labelMuted,
        invalid: "#c93c37",
      } as const;
      const c = state.connect.validity
        ? colors[state.connect.validity]
        : canvasTheme().labelMuted;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2 / vp.scale;
      ctx.setLineDash([6 / vp.scale, 4 / vp.scale]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(state.connect.x, state.connect.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // a small tick where the connector entered, so the line reads as coming
      // FROM somewhere rather than starting nowhere
      if (anchored) {
        ctx.beginPath();
        ctx.arc(start.x, start.y, 4 / vp.scale, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
      }
      const t = state.connect.targetId
        ? scene.byId.get(state.connect.targetId)
        : null;
      if (t) {
        ctx.strokeStyle = c;
        ctx.lineWidth = 3 / vp.scale;
        shapePath(ctx, nodeStyle(t.node.node_type).shape,
                  { x: t.x - 3, y: t.y - 3, w: t.w + 6, h: t.h + 6 });
        ctx.stroke();
      }
    }
  }

  // ── BADGE1 · ornament badges, SCALED WITH THE NODE (BUGS-UI) ────────────────
  // Drawn with the device-pixel transform (not the world one) so the glyphs and
  // text stay crisp and the hit rects are screen space — but every dimension is
  // `BADGE_PX * vp.scale`, so the chip keeps a CONSTANT RATIO to the node box it
  // hangs on instead of a constant pixel size (this inverts DEC1). If more
  // badges than fit along the top edge, the overflow collapses to a "+N" chip
  // (click selects the referent, whose Inspector lists them all). Hit rects
  // match the drawing exactly, at any zoom.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  adornmentHits = [];
  const badgePx = BADGE_PX * vp.scale;
  const badgeGap = BADGE_GAP * vp.scale;
  for (const n of shown) {
    const ads = n.adornments;
    if (!ads || !ads.length) continue;
    const r = nodeScreenRect(n, vp);
    if (r.x + r.w < -badgePx || r.x > viewW || r.y + r.h < -badgePx || r.y > viewH)
      continue; // node (plus its badge row) entirely off-screen
    const step = badgePx + badgeGap;
    const fit = Math.max(1, Math.floor((r.w + badgeGap) / step));
    const showAll = ads.length <= fit;
    const nShown = showAll ? ads.length : Math.max(1, fit - 1);
    const slots = showAll ? ads.length : nShown + 1; // last slot = "+N"
    const topY = r.y - badgePx * 0.55; // straddle the top edge
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < slots; i++) {
      const bx = r.x + r.w - (i + 1) * badgePx - i * badgeGap;
      const isMore = !showAll && i === slots - 1;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function")
        ctx.roundRect(bx, topY, badgePx, badgePx, badgePx * 0.22);
      else ctx.rect(bx, topY, badgePx, badgePx);
      ctx.fillStyle = canvasTheme().handleFill;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = canvasTheme().chipBorder;
      ctx.stroke();
      if (isMore) {
        ctx.fillStyle = labelOn(canvasTheme().handleFill);
        ctx.font = canvasFont(700, Math.round(badgePx * 0.5));
        ctx.fillText(`+${ads.length - nShown}`, bx + badgePx / 2, topY + badgePx / 2 + 0.5);
        adornmentHits.push({ ornamentId: n.id, x: bx, y: topY, w: badgePx, h: badgePx });
        continue;
      }
      const b = ads[i];
      // FUNNEL1 · an INHERITED value (from activity/epoch/canvas) is drawn
      // attenuated (dimmed, dashed outline) and is NOT a click target — it has
      // no ornament node on this referent. The node's own value is a full badge.
      if (b.inherited) ctx.globalAlpha = 0.5;
      const pad = badgePx * BADGE_ICON_INSET;
      // SHIFT-A fase 6b · the ornament's own paths, when the datamodel has them
      const bg = glyphFor(b.kind);
      const img = bg ? null : imageFor(b.kind);
      if (bg) {
        const side = badgePx - 2 * pad;
        // the chip is `handleFill` — dark on a dark canvas — so the glyph takes
        // the same theme recolouring as on the canvas
        drawGlyph(ctx, bg, bx + pad, topY + pad, side, side, glyphInk());
      } else if (img) {
        const side = badgePx - 2 * pad; // already screen px: the band is dpr alone
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(crispImage(img, side, side, dpr), bx + pad, topY + pad, side, side);
      }
      else {
        ctx.fillStyle = labelOn(canvasTheme().handleFill);
        ctx.font = canvasFont(700, Math.round(badgePx * 0.62));
        ctx.fillText((b.kind[0] || "?").toUpperCase(), bx + badgePx / 2, topY + badgePx / 2 + 0.5);
      }
      if (b.inherited) {
        // dashed outline marks it as a funnel-inherited preview, not a real node
        ctx.globalAlpha = 1;
        ctx.setLineDash([2, 1.5]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = canvasTheme().accent;
        ctx.strokeRect(bx + 0.5, topY + 0.5, badgePx - 1, badgePx - 1);
        ctx.setLineDash([]);
        continue; // no hit rect for an inherited badge
      }
      if (b.ornamentId === state.selectedId) {
        ctx.strokeStyle = accentColor();
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - 1, topY - 1, badgePx + 2, badgePx + 2);
      }
      adornmentHits.push({ ornamentId: b.ornamentId, x: bx, y: topY, w: badgePx, h: badgePx });
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // ── PD1 · collapsed ParadataNodeGroup tablets, bottom-left of the referent ───
  // A folded PDG with a node referent shows as a small "PD" tablet (the Paradata
  // tab colour) at the referent's bottom-left — the ornament badges of BADGE1
  // are top-right, so the two never collide. Single click selects the group;
  // double click enters the hypergraph (main.ts). BUGS-UI: sized off `badgePx`,
  // so it scales with its referent like the badges do.
  pdDecoratorHits = [];
  const PD_W = badgePx * 1.5;
  const pdFill = nodeStyle("ParadataNodeGroup").labelBackground || groupHeaderFill();
  // BUGFIX-PDG · drawn from the REFERENT node (`pdCollapsed` = the PDG id), so the
  // collapsed PDG needs no SceneGroup — nothing draws a phantom box behind it.
  for (const ref of scene.nodes) {
    const pdgId = ref.pdCollapsed;
    if (!pdgId) continue;
    const r = nodeScreenRect(ref, vp);
    if (r.x + r.w < 0 || r.x - PD_W > viewW || r.y > viewH || r.y + r.h < 0)
      continue;
    const tx = r.x - PD_W * 0.12; // bottom-left, nudged just outside the corner
    const ty = r.y + r.h - badgePx * 0.55; // straddle the bottom edge
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(tx, ty, PD_W, badgePx, 3);
    else ctx.rect(tx, ty, PD_W, badgePx);
    ctx.fillStyle = pdFill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = canvasTheme().chipBorder;
    ctx.stroke();
    ctx.fillStyle = labelOn(pdFill);
    ctx.font = canvasFont(700, Math.round(badgePx * 0.55));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PD", tx + PD_W / 2, ty + badgePx / 2 + 0.5);
    if (pdgId === state.selectedId) {
      ctx.strokeStyle = accentColor();
      ctx.lineWidth = 2;
      ctx.strokeRect(tx - 1, ty - 1, PD_W + 2, badgePx + 2);
    }
    pdDecoratorHits.push({ pdgId, x: tx, y: ty, w: PD_W, h: badgePx });
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // lane colour rail + label chip, pinned to the left edge (screen space)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const RAIL = 6; // strong colour rail width (px) on the first pixels of a lane
  // "PD" tag: a small clickable badge for an epoch/phase temporal PDG, drawn in
  // the label chip instead of a box. Registers its screen rect for click-to-enter.
  pdTagHits = [];
  addPhaseHits = [];
  const PD_TAG_W = 22;
  const PD_TAG_H = 14;
  const drawPdTag = (x: number, y: number, pdgId: string): void => {
    ctx.save();
    // STRUTTURA · the PARADATA colour itself — the group's `label_background`
    // from em_visual_rules (the peach folder tab), the same in both themes like
    // every semantic fill. It used to be the theme's `groupHeaderFallback`,
    // which in dark is a brown #6b5324 under a brown #5a4522 ink: the tablet
    // read as a smudge (PELLE's defect 2). The ink follows the fill (`labelOn`).
    ctx.fillStyle = pdFill;   // declared with the PD decorators above
    ctx.strokeStyle = "rgba(0,0,0,0.30)";
    ctx.lineWidth = 1;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, PD_TAG_W, PD_TAG_H, 3);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, PD_TAG_W, PD_TAG_H);
      ctx.strokeRect(x, y, PD_TAG_W, PD_TAG_H);
    }
    ctx.fillStyle = labelOn(pdFill) === canvasTheme().onLight ? "#5a3200" : labelOn(pdFill);
    ctx.font = canvasFont(700, 9);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PD", x + PD_TAG_W / 2, y + PD_TAG_H / 2 + 0.5);
    ctx.restore();
    pdTagHits.push({ pdgId, x, y, w: PD_TAG_W, h: PD_TAG_H });
  };
  // amber warning triangle (chronology-coherence conflict), centred at (x, cy)
  const WARN_W = 13;
  const drawWarn = (x: number, cy: number): void => {
    ctx.save();
    const h = 11;
    ctx.beginPath();
    ctx.moveTo(x + WARN_W / 2, cy - h / 2);
    ctx.lineTo(x + WARN_W, cy + h / 2);
    ctx.lineTo(x, cy + h / 2);
    ctx.closePath();
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = "#3a2a00";
    ctx.font = canvasFont(700, 8);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x + WARN_W / 2, cy + 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.restore();
  };
  laneChipHits = [];
  bandLabelHits = [];
  dateInviteHits = [];
  for (const lane of scene.lanes) {
    const sy = lane.y * vp.scale + vp.y;
    const sh = lane.height * vp.scale;
    if (sy + sh < 0 || sy > viewH) continue;
    // strong epoch colour on the left edge of the lane
    if (lane.color) {
      const y0 = Math.max(sy, 0);
      const y1 = Math.min(sy + sh, viewH);
      ctx.fillStyle = lane.color;
      ctx.fillRect(0, y0, RAIL, y1 - y0);
    }
    if (sh < 18) continue; // lane too thin on screen — the chip would overlap
    const ty = Math.max(sy + 4, 4);
    // start–end collapses out when the lane is too short to fit two lines
    const boundsText =
      lane.start || lane.end ? `${lane.start ?? "?"} – ${lane.end ?? "?"}` : "";
    // E5 · an epoch with NO dates (none in its data, no temporal group) shows,
    // where the bounds would be, an invitation to date it: «date: — · add».
    // The view draws it; nothing of it is in the document.
    const invite = !boundsText && !lane.paradataGroupId && state.dateInvite && state.editable !== false
      ? state.dateInvite : null;
    const inviteText = invite ? `${invite.text} · ` : "";
    const showBounds = (!!boundsText || !!invite) && sh > 36;
    // The chip now carries the epoch's own colour, so there is no separate
    // colour dot: the whole pastille IS the colour swatch (DARK2).
    ctx.font = canvasFont(CANVAS_TYPE.laneLabel.weight, CANVAS_TYPE.laneLabel.px);
    const nameW = ctx.measureText(lane.label).width;
    ctx.font = canvasFont(CANVAS_TYPE.laneDates.weight, CANVAS_TYPE.laneDates.px, { mono: true });
    const inviteTextW = invite ? ctx.measureText(inviteText).width : 0;
    const inviteAddW = invite ? ctx.measureText(invite.add).width : 0;
    const boundsW = !showBounds ? 0 : invite ? inviteTextW + inviteAddW : ctx.measureText(boundsText).width;
    const hasPd = !!lane.paradataGroupId;
    const tagSpace = hasPd ? PD_TAG_W + 6 : 0;
    const hasWarn = !!lane.warn;
    const warnSpace = hasWarn ? WARN_W + 4 : 0;
    const chipX = RAIL + 4;
    const chipW = 8 + Math.max(nameW, boundsW) + warnSpace + tagSpace + 8;
    const chipH = showBounds ? 32 : 18;
    const selectedLane = lane.id === state.selectedId;
    laneChipHits.push({ id: lane.id, x: chipX, y: ty - 2, w: chipW, h: chipH });
    // fill = the epoch's semantic colour (falls back to the neutral chip when
    // the epoch declares none); ink = labelOn(that fill) so the contrast lives
    // in the chip, not in a per-theme token laid on a semantic surface.
    const chipFill = lane.color || canvasTheme().laneChip;
    const chipInk = lane.color ? labelOn(lane.color) : canvasTheme().laneChipInk;
    ctx.fillStyle = chipFill;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(chipX, ty - 2, chipW, chipH, 5);
      ctx.fill();
      // hairline to separate the chip from the lane, or the accent when selected
      ctx.lineWidth = selectedLane ? 2 : 1;
      ctx.strokeStyle = selectedLane ? accentColor() : canvasTheme().chipBorder;
      ctx.stroke();
    } else {
      ctx.fillRect(chipX, ty - 2, chipW, chipH);
      ctx.lineWidth = selectedLane ? 2 : 1;
      ctx.strokeStyle = selectedLane ? accentColor() : canvasTheme().chipBorder;
      ctx.strokeRect(chipX, ty - 2, chipW, chipH);
    }
    const textX = chipX + 8;
    ctx.fillStyle = chipInk;
    ctx.font = canvasFont(CANVAS_TYPE.laneLabel.weight, CANVAS_TYPE.laneLabel.px);
    ctx.fillText(lane.label, textX, ty);
    if (showBounds && invite) {
      // the invitation: «date: —» softened, and «add» underlined — a link
      ctx.save();
      ctx.font = canvasFont(CANVAS_TYPE.laneDates.weight, CANVAS_TYPE.laneDates.px, { mono: true });
      ctx.fillStyle = chipInk;
      ctx.globalAlpha = 0.6;
      ctx.fillText(inviteText, textX, ty + 16);
      ctx.globalAlpha = 0.95;
      const ax = textX + inviteTextW;
      ctx.fillText(invite.add, ax, ty + 16);
      ctx.fillRect(ax, ty + 16 + CANVAS_TYPE.laneDates.px + 1, inviteAddW, 1);
      ctx.restore();
      dateInviteHits.push({ id: lane.id, x: ax - 2, y: ty + 13, w: inviteAddW + 4, h: CANVAS_TYPE.laneDates.px + 6 });
    } else if (showBounds) {
      // the bounds line is the same ink, softened — still derived from the fill
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = chipInk;
      ctx.font = canvasFont(CANVAS_TYPE.laneDates.weight, CANVAS_TYPE.laneDates.px, { mono: true });
      ctx.fillText(boundsText, textX, ty + 16);
      ctx.restore();
    }
    if (hasWarn) drawWarn(textX + nameW + 4, ty + 6);
    if (hasPd)
      drawPdTag(chipX + chipW - PD_TAG_W - 6, ty - 1, lane.paradataGroupId!);
    // "+" quick-add-phase button: a small circle in the epoch's colour hanging
    // off the coloured rail just below the name chip. Lanes ARE top-level epochs
    // (phases don't render as lanes), so this only ever adds a phase to an epoch.
    const addR = 7;
    const addCx = RAIL + 14;
    const addCy = ty - 2 + chipH + 12;
    // AUDIT N5 · only when it fits in THIS lane: in a thin lane it hung over the
    // next one (the lane menu and the Inspector's «+ Add phase» remain)
    if (addCy + addR > sy + sh - 1) continue;
    laneChipHits[laneChipHits.length - 1].h = addCy + addR - (ty - 2);
    const ecol = lane.color || canvasTheme().labelMuted;
    ctx.strokeStyle = ecol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(RAIL, addCy);
    ctx.lineTo(addCx - addR, addCy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(addCx, addCy, addR, 0, Math.PI * 2);
    ctx.fillStyle = ecol;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.stroke();
    // the "+" sits on the epoch-coloured circle, so its ink comes from labelOn
    // of that colour, not a per-theme token (DARK2, same anti-pattern).
    ctx.strokeStyle = labelOn(ecol);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(addCx - 3.2, addCy);
    ctx.lineTo(addCx + 3.2, addCy);
    ctx.moveTo(addCx, addCy - 3.2);
    ctx.lineTo(addCx, addCy + 3.2);
    ctx.stroke();
    addPhaseHits.push({ id: lane.id, cx: addCx, cy: addCy, r: addR + 2 });
  }

  // EM-mode "insert epoch" indicator at the hovered lane boundary (main.ts
  // computes which boundary from the same geometry and resolves the click).
  if (state.insertBoundary != null && scene.lanes.length) {
    const bi = state.insertBoundary;
    const worldY =
      bi < scene.lanes.length
        ? scene.lanes[bi].y
        : scene.lanes[bi - 1].y + scene.lanes[bi - 1].height;
    const by = worldY * vp.scale + vp.y;
    ctx.save();
    ctx.strokeStyle = accentColor();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(RAIL, by);
    ctx.lineTo(viewW, by);
    ctx.stroke();
    ctx.setLineDash([]);
    const bx = RAIL + 12;
    ctx.beginPath();
    ctx.arc(bx, by, 8, 0, Math.PI * 2);
    ctx.fillStyle = accentColor();
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = canvasTheme().handleFill;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - 3.5, by);
    ctx.lineTo(bx + 3.5, by);
    ctx.moveTo(bx, by - 3.5);
    ctx.lineTo(bx, by + 3.5);
    ctx.stroke();
    ctx.restore();
  }

  // phase sub-band labels. AUDIT N5 · THE PHASES ARE SUB-LANES INSIDE THE LANE,
  // not tags drawn over its label: measured on epochs48 at the fitted zoom, a
  // 30 px chip in a 14 px band covered «Età contemporanea» and its neighbours.
  // So a label (1) stays INSIDE its band — full chip, one line, bare text or
  // nothing, by the room there is; (2) never covers a lane chip — it moves to
  // its right; (3) drops the epoch's name it repeats («Età contemporanea ·
  // fase II» inside Età contemporanea reads «fase II»).
  if (scene.subBands?.length) {
    const laneLabelOf = new Map(scene.lanes.map((l) => [l.id, l.label]));
    const clash = (x: number, y: number, w: number, h: number) =>
      laneChipHits.find((r) => x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h) ?? null;
    for (const sb of scene.subBands) {
      const sy = sb.y * vp.scale + vp.y;
      const sh = sb.height * vp.scale;
      if (sy + sh < 0 || sy > viewH || sh < 11) continue;
      // nesting rail: a vertical colour bar indented by depth, echoing the
      // lane's own left rail so a sub-phase reads as contained at a glance.
      // Skip the residual band — that IS the epoch, already marked by the lane
      // rail; drawing another bar there would just double it.
      if (!sb.residual && sb.color) {
        const railX = RAIL + (sb.depth ?? 0) * 16;
        const y0 = Math.max(sy, 0);
        const y1 = Math.min(sy + sh, viewH);
        if (y1 > y0) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = sb.color;
          ctx.fillRect(railX, y0, 4, y1 - y0);
          ctx.restore();
        }
      }
      // the residual band IS the epoch, and the lane chip already names it
      if (sb.residual) continue;
      const parent = laneLabelOf.get(sb.laneId) ?? "";
      const label = parent && sb.label.startsWith(`${parent} · `) ? sb.label.slice(parent.length + 3) : sb.label;
      const fullRoom = sh >= 34, lineRoom = sh >= 19;
      if (!lineRoom) {
        // bare text, no box: the band is thinner than a chip
        ctx.save();
        ctx.font = canvasFont(600, 9.5);
        const w = ctx.measureText(label).width;
        let x = RAIL + 14 + (sb.depth ?? 0) * 16;
        const y = sy + (sh - 10) / 2;
        const c = clash(x, y, w, 10);
        if (c) x = c.x + c.w + 6;
        ctx.fillStyle = canvasTheme().labelMuted;
        ctx.textBaseline = "top";
        ctx.fillText(label, x, y);
        ctx.restore();
        bandLabelHits.push({ id: sb.phaseId, x, y, w, h: 10 });
        continue;
      }
      const ty = Math.max(sy + 2, 4);
      // a phase band shows its start–end under the name (like the lane chip)
      // when the band has the room for two lines
      const hasBounds = fullRoom && (sb.start != null || sb.end != null);
      const boundsText = hasBounds ? `${sb.start ?? "?"} – ${sb.end ?? "?"}` : "";
      ctx.font = canvasFont(sb.residual ? 400 : 600, 11, { italic: sb.residual });
      const nameW = ctx.measureText(label).width;
      ctx.font = canvasFont(400, CANVAS_TYPE.minPx, { mono: true });
      const boundsW = hasBounds ? ctx.measureText(boundsText).width : 0;
      // indent deeper (sub-phase) bands so the hierarchy reads at a glance
      let chipX = RAIL + 14 + (sb.depth ?? 0) * 16;
      const hasPd = !!sb.paradataGroupId;
      const tagSpace = hasPd ? PD_TAG_W + 5 : 0;
      const hasWarn = !!sb.warn;
      const warnSpace = hasWarn ? WARN_W + 4 : 0;
      const chipW = 7 + 5 + Math.max(nameW, boundsW) + warnSpace + tagSpace + 8;
      const chipH = hasBounds ? 30 : 17;
      const hit = clash(chipX, ty - 1, chipW, chipH);
      if (hit) chipX = hit.x + hit.w + 6;
      const selectedBand = sb.phaseId === state.selectedId;
      // same rule as the lane chip: a coloured phase fills its own colour and
      // takes labelOn for the ink; the residual band (the epoch) has no colour
      // and stays the neutral chip, its italic name in the muted ink.
      const bandFill = sb.color || canvasTheme().laneChip;
      const bandInk = sb.color
        ? labelOn(sb.color)
        : sb.residual
          ? canvasTheme().labelMuted
          : canvasTheme().laneChipInk;
      ctx.fillStyle = bandFill;
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(chipX, ty - 1, chipW, chipH, 4);
        ctx.fill();
        ctx.lineWidth = selectedBand ? 2 : 1;
        ctx.strokeStyle = selectedBand ? accentColor() : canvasTheme().chipBorder;
        ctx.stroke();
      } else {
        ctx.fillRect(chipX, ty - 1, chipW, chipH);
        ctx.lineWidth = selectedBand ? 2 : 1;
        ctx.strokeStyle = selectedBand ? accentColor() : canvasTheme().chipBorder;
        ctx.strokeRect(chipX, ty - 1, chipW, chipH);
      }
      const bandTextX = chipX + 7 + 5;
      ctx.fillStyle = bandInk;
      ctx.font = canvasFont(sb.residual ? 400 : 600, 11, { italic: sb.residual });
      ctx.fillText(label, bandTextX, ty);
      if (hasBounds) {
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = bandInk;
        ctx.font = canvasFont(400, CANVAS_TYPE.minPx, { mono: true });
        ctx.fillText(boundsText, bandTextX, ty + 15);
        ctx.restore();
      }
      if (hasWarn) drawWarn(bandTextX + nameW + 4, ty + 5);
      if (hasPd)
        drawPdTag(chipX + chipW - PD_TAG_W - 5, ty - 1, sb.paradataGroupId!);
      // the chip is a click target → select the phase (residual → the epoch)
      bandLabelHits.push({ id: sb.phaseId, x: chipX, y: ty - 1, w: chipW, h: chipH });
    }
  }
}
