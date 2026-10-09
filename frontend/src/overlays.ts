// MICRO-SOVRAPPOSIZIONI · the OVERLAYS of a canvas: what EMStudio draws OVER
// or AROUND a node without it being a node or an edge of the graph — the
// badges of author, licence and embargo, the paradata chip, the warning «!»,
// the «AI ✓» chip… Like the Overlays menu of Blender's 3D viewport, where the
// decorators of the scene (relationship lines, grid, axes) are switched on and
// off: a menu of its own, beside the filter of the nodes and apart from it.
//
// The filter of the nodes decides which NODES exist in a view (and a hidden
// ring re-lays the Matrix out); an overlay decides which BADGES are seen, and
// nothing else: switching one off changes neither the layout nor the graph nor
// the scene — the renderer skips its pass, and its hit rects go with it.
//
// The state is per VIEW (Matrix, Graph, DTC, multigraph, and the soloing of a
// group, which is the hypergraph context of a window) and per PERSON (the
// identity working on this machine), in the local preferences
// (`localStorage`, key `emstudio.overlays`), like the other interface states.
// Never in the em.json, never in the room.
//
// Pure: no DOM, no store — checked in node (scripts/check-overlays.mjs).
import type { ViewKind } from "./types";

export type OverlayKey =
  // Authorship and rights (BADGE1 · FUNNEL1)
  | "author"
  | "author_ai"
  | "license"
  | "embargo"
  | "inherited"
  // Paradata
  | "pd_chip"
  | "pd_tablet"
  | "instance_badge"
  | "trace"
  | "doc_uses"
  // Time
  | "lane_pd_tag"
  | "date_invite"
  // Checks and warnings
  | "warning"
  | "lane_warning"
  | "ai_chip"
  | "name_status"
  // 3D
  | "version_format"
  // Drawing
  | "genre"
  | "lock"
  | "fold_count";

export type OverlayGroupKey = "rights" | "paradata" | "time" | "checks" | "threed" | "drawing";

export interface OverlayItem {
  key: OverlayKey;
  /** the glyph the menu shows beside the box: a datamodel node type whose 2D
   *  glyph is drawn (`kind`), or a short text that mimics the drawing */
  kind?: string;
  text?: string;
  /** drawn by the liquid Graph too (renderLiquid), not only by the box views */
  liquid?: boolean;
}

export interface OverlayGroup {
  key: OverlayGroupKey;
  items: OverlayItem[];
}

/** The inventory, grouped as the menu shows it. Measured in the code
 *  (renderer.ts, liquid-render.ts, pd-chip.ts; MICRO-SOVRAPPOSIZIONI report). */
export const OVERLAY_GROUPS: readonly OverlayGroup[] = [
  { key: "rights", items: [
    { key: "author", kind: "author" },
    { key: "author_ai", kind: "author_ai" },
    { key: "license", kind: "license" },
    { key: "embargo", kind: "embargo" },
    { key: "inherited", text: "┄" },
  ] },
  { key: "paradata", items: [
    { key: "pd_chip", text: "PD 7", liquid: true },
    { key: "pd_tablet", text: "PD" },
    { key: "instance_badge", text: "US 12" },
    { key: "trace", text: "✕" },
    { key: "doc_uses", text: "3" },
  ] },
  { key: "time", items: [
    { key: "lane_pd_tag", text: "PD" },
    { key: "date_invite", text: "—" },
  ] },
  { key: "checks", items: [
    { key: "warning", text: "!" },
    { key: "lane_warning", text: "▲" },
    { key: "ai_chip", text: "AI ✓" },
    { key: "name_status", text: "Aa" },
  ] },
  { key: "threed", items: [
    { key: "version_format", text: "GLB" },
  ] },
  { key: "drawing", items: [
    { key: "genre", text: "M", liquid: true },
    { key: "lock", text: "🔒" },
    { key: "fold_count", text: "9" },
  ] },
];

export const OVERLAY_KEYS: readonly OverlayKey[] = OVERLAY_GROUPS.flatMap((g) => g.items.map((i) => i.key));

/** The views with their own overlays: the four projections and the soloing. */
export type OverlayView = ViewKind | "soloing";
export const OVERLAY_VIEWS: readonly OverlayView[] = ["matrix", "graph", "dtc", "multigraph", "soloing"];

export interface OverlayState {
  /** «Show overlays» — the general switch, as in Blender */
  master: boolean;
  /** the overlays switched off one by one (kept while the master is off) */
  off: OverlayKey[];
}

/**
 * The default of a view. Measured: today every overlay is drawn in every view
 * where it has something to say (the BADGE1 ring `authors_licenses` is on by
 * default in all of them, and nothing else hides a badge), so the default is
 * everything on: at opening nothing changes.
 */
export function defaultOverlays(_view: OverlayView): OverlayState {
  return { master: true, off: [] };
}

/** The items a view can draw: the liquid Graph draws only its own few. */
export function overlayItemsFor(view: OverlayView): OverlayItem[] {
  const all = OVERLAY_GROUPS.flatMap((g) => g.items);
  return view === "graph" ? all.filter((i) => i.liquid) : all;
}

/** Is this overlay drawn under this state? */
export function overlayShown(st: OverlayState | null | undefined, key: OverlayKey): boolean {
  if (!st) return true;
  return st.master && !st.off.includes(key);
}

/** True when something the view can draw is hidden — the menu's glyph shows a
 *  dot, so that what is hidden is not forgotten. */
export function overlaysHideSomething(st: OverlayState, view: OverlayView): boolean {
  if (!st.master) return true;
  const can = new Set(overlayItemsFor(view).map((i) => i.key));
  return st.off.some((k) => can.has(k));
}

/** The overlay of a badge of the ornament row (BADGE1 · FUNNEL1): its kind,
 *  and for an inherited one the «inherited» switch too. */
export function adornmentShown(st: OverlayState | null | undefined,
                               b: { kind: string; inherited?: boolean }): boolean {
  const k = (OVERLAY_KEYS as readonly string[]).includes(b.kind) ? (b.kind as OverlayKey) : null;
  if (k && !overlayShown(st, k)) return false;
  if (b.inherited && !overlayShown(st, "inherited")) return false;
  return true;
}

/** Switch one overlay. */
export function withOverlay(st: OverlayState, key: OverlayKey, on: boolean): OverlayState {
  const off = st.off.filter((k) => k !== key);
  if (!on) off.push(key);
  return { master: st.master, off: OVERLAY_KEYS.filter((k) => off.includes(k)) };
}

/** «All» / «None» of a group. */
export function withGroup(st: OverlayState, group: OverlayGroupKey, on: boolean,
                          view?: OverlayView): OverlayState {
  const g = OVERLAY_GROUPS.find((x) => x.key === group);
  if (!g) return st;
  const can = view ? new Set(overlayItemsFor(view).map((i) => i.key)) : null;
  let out = st;
  for (const i of g.items) if (!can || can.has(i.key)) out = withOverlay(out, i.key, on);
  return out;
}

// ── memory: per person and per view, in the local preferences ────────────────

export const OVERLAYS_KEY = "emstudio.overlays";
/** the person of a machine with nobody declared */
export const NOBODY = "-";

type Stored = Record<string, Partial<Record<OverlayView, OverlayState>>>;

function readAll(): Stored {
  try {
    const raw = globalThis.localStorage?.getItem(OVERLAYS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function clean(v: unknown, view: OverlayView): OverlayState {
  const d = defaultOverlays(view);
  if (!v || typeof v !== "object") return d;
  const o = v as { master?: unknown; off?: unknown };
  const off = Array.isArray(o.off)
    ? OVERLAY_KEYS.filter((k) => (o.off as unknown[]).includes(k))
    : d.off;
  return { master: typeof o.master === "boolean" ? o.master : d.master, off };
}

/** The overlays of a view for a person: what was remembered, else the default. */
export function loadOverlays(person: string | null | undefined, view: OverlayView): OverlayState {
  return clean(readAll()[person || NOBODY]?.[view], view);
}

/** Remember the overlays of a view for a person. A state equal to the default
 *  is forgotten, so a default changed later reaches whoever never touched it. */
export function saveOverlays(person: string | null | undefined, view: OverlayView, st: OverlayState): void {
  const all = readAll();
  const who = person || NOBODY;
  const mine = { ...(all[who] ?? {}) };
  const d = defaultOverlays(view);
  if (st.master === d.master && st.off.length === 0 && d.off.length === 0) delete mine[view];
  else mine[view] = { master: st.master, off: [...st.off] };
  if (Object.keys(mine).length) all[who] = mine;
  else delete all[who];
  try {
    globalThis.localStorage?.setItem(OVERLAYS_KEY, JSON.stringify(all));
  } catch {
    /* private mode: the state lives for this session */
  }
}

// ── for the checks: what the last paint drew, per overlay ────────────────────
// The renderers count each overlay they draw (one per badge, mark or tag);
// the page exposes it (`__EM_DRAG__.overlaysDrawn`). A count, never a state.
let drew = new Map<OverlayKey, number>();
export function beginOverlayFrame(): void {
  drew = new Map();
}
export function markOverlay(k: OverlayKey): void {
  drew.set(k, (drew.get(k) ?? 0) + 1);
}
export function drawnOverlayCounts(): Partial<Record<OverlayKey, number>> {
  return Object.fromEntries(drew);
}
