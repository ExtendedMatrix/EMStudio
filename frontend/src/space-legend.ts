/**
 * MICRO-PL09 p.0 (E.D., 18 Nov 2026: «la legenda può diventare troppo grande»)
 * · the legend of «Colori» in the Space, as a view keeps it.
 *
 *  - it FOLDS into one line («Proprietà · material · 14 valori ▸»);
 *  - it is RESIZED by its corner and scrolls;
 *  - past `LEGEND_ROWS` rows it shows that many and «+N altri», which opens
 *    the rest;
 *  - it is MOVED by its head to the corner of the scene it is dropped nearest
 *    to (bottom left, as before, unless chosen).
 *
 * Where, how big, folded or open: per view (the Space window), in this
 * machine's preferences — never in the em.json. `main.ts` draws it; this file
 * is what a check can read without a page.
 */
export type LegendCorner = "bl" | "br" | "tl" | "tr";
export interface LegendPref {
  corner: LegendCorner;
  /** the size the person gave it (null: its content's) */
  w: number | null;
  h: number | null;
  folded: boolean;
  /** «+N altri» opened */
  all: boolean;
}
export const LEGEND_KEY = "emstudio.legend.v1";
/** the rows shown before «+N altri» */
export const LEGEND_ROWS = 8;
export const defaultLegendPref = (): LegendPref => ({ corner: "bl", w: null, h: null, folded: false, all: false });

const CORNERS: LegendCorner[] = ["bl", "br", "tl", "tr"];
type KV = Pick<Storage, "getItem" | "setItem">;
function safe(): KV | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}
function readAll(kv: KV | null): Record<string, Partial<LegendPref>> {
  try {
    const v = JSON.parse(kv?.getItem(LEGEND_KEY) ?? "null");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
/** the legend of a view (a Space window's id) */
export function loadLegendPref(view: string, kv: KV | null = safe()): LegendPref {
  const v = readAll(kv)[view] ?? {};
  const d = defaultLegendPref();
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : null);
  return {
    corner: CORNERS.includes(v.corner as LegendCorner) ? v.corner as LegendCorner : d.corner,
    w: num(v.w), h: num(v.h), folded: v.folded === true, all: v.all === true,
  };
}
export function saveLegendPref(view: string, p: LegendPref, kv: KV | null = safe()): void {
  const all = readAll(kv);
  all[view] = p;
  try { kv?.setItem(LEGEND_KEY, JSON.stringify(all)); } catch { /* storage refused: kept for the session */ }
}
/** the corner a box dropped at (x, y, w, h) inside a scene (W × H) is nearest to */
export function nearestCorner(x: number, y: number, w: number, h: number, W: number, H: number): LegendCorner {
  const cx = x + w / 2, cy = y + h / 2;
  return `${cy < H / 2 ? "t" : "b"}${cx < W / 2 ? "l" : "r"}` as LegendCorner;
}
/** the rows drawn: all, or the first `LEGEND_ROWS` and how many wait behind «+N altri» */
export function legendRowsShown<T>(rows: T[], all: boolean, max = LEGEND_ROWS): { shown: T[]; more: number } {
  // one hidden row is not worth a line of its own: «+1 altro» would take the room of the row
  if (all || rows.length <= max + 1) return { shown: rows, more: 0 };
  return { shown: rows.slice(0, max), more: rows.length - max };
}

/**
 * MICRO-COR06 (E.D., 19 Nov 2026: in a Space of ~680×420 the legend covered
 * half the scene, its labels cut, the measure's label over it) · the legend
 * comes down BY DEGREES with the room of its scene:
 *  - `full`: the rows, colour · value · number (above `LEGEND_FULL`);
 *  - `swatches`: the colours and their numbers only, the value on hover
 *    (above `LEGEND_SWATCHES`);
 *  - `chip`: one label «Legend (n)», which opens the full legend with a click.
 * In every form a SWATCH is a switch (shows / hides its class) and the whole
 * text of a value lives in its tooltip.
 */
export type LegendForm = "full" | "swatches" | "chip";
export const LEGEND_FULL = { w: 640, h: 400 };
export const LEGEND_SWATCHES = { w: 420, h: 260 };
/** the form of the legend for a scene of w × h pixels (0 × 0: not measured yet, full) */
export function legendForm(w: number, h: number): LegendForm {
  if (!(w > 0 && h > 0)) return "full";
  if (w >= LEGEND_FULL.w && h >= LEGEND_FULL.h) return "full";
  if (w >= LEGEND_SWATCHES.w && h >= LEGEND_SWATCHES.h) return "swatches";
  return "chip";
}
/** do two boxes (left, top, right, bottom) overlap? (the legend and a measure's label) */
export function boxesMeet(a: { left: number; top: number; right: number; bottom: number },
                          b: { left: number; top: number; right: number; bottom: number }): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}
