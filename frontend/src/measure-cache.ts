/**
 * MICRO-PROVA-DEV48 p.5 · what EMStudio MEASURES of a file is a cache, not a
 * datum (E.D., 17 Oct 2026): the derivable (a version's triangles, its
 * vertices, its box) is kept apart from the assigned (who made a level or a
 * proxy, written in the em.json). So the measures live here, in the person's
 * browser or desktop, keyed by the file's FINGERPRINT and marked «misurato»;
 * never in the document.
 *
 * The fingerprint is the one the graph declares for the file (its `checksum`,
 * for a set the checksum of its entry file) with the size it declares: a file
 * that changes takes another checksum when a tool writes it again, and a new
 * fingerprint is a new measure. And every time the Space loads a file it
 * counts it again: a count that differs from the cache's replaces it (the file
 * changed under the same name), so a measure is never older than the last
 * load.
 *
 * Pure but for the store (localStorage, as the Space's other preferences),
 * which a test replaces (`scripts/check-measure-cache.mjs`).
 */

export const MEASURE_KEY = "emstudio.measures";
/** the most measures kept: the oldest go first */
export const MEASURE_MAX = 4000;

export interface Measure {
  /** the triangles and vertices counted in the file as the Space drew it */
  tris: number;
  verts?: number;
  /** its box, in the file's own frame (metres), when known */
  box?: [[number, number, number], [number, number, number]];
  /** when, and by what */
  at: string;
  by: string;
}

type Store = Record<string, Measure>;
let mem: Store | null = null;
const ls = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };

function load(): Store {
  if (mem) return mem;
  try { mem = JSON.parse(ls()?.getItem(MEASURE_KEY) ?? "{}") as Store; } catch { mem = {}; }
  if (!mem || typeof mem !== "object" || Array.isArray(mem)) mem = {};
  return mem;
}
function save(): void {
  const s = load();
  const keys = Object.keys(s);
  if (keys.length > MEASURE_MAX) {
    keys.sort((a, b) => String(s[a].at).localeCompare(String(s[b].at)));
    for (const k of keys.slice(0, keys.length - MEASURE_MAX)) delete s[k];
  }
  try { ls()?.setItem(MEASURE_KEY, JSON.stringify(s)); } catch { /* full: the measures stay for this session */ }
}

/** A file's fingerprint: its declared checksum and size; null without a checksum
 *  (a file nobody fingerprinted is measured, never cached). */
export function fingerprint(checksum: unknown, size?: unknown): string | null {
  const c = typeof checksum === "string" ? checksum.trim() : "";
  if (!c) return null;
  const n = typeof size === "number" && Number.isFinite(size) ? size : typeof size === "string" && size.trim() ? Number(size) : NaN;
  return Number.isFinite(n) ? `${c}|${n}` : c;
}

export function getMeasure(fp: string | null | undefined): Measure | null {
  return fp ? load()[fp] ?? null : null;
}

/** Keep a count; true when it is new or differs from the one kept (the file changed). */
export function putMeasure(fp: string | null | undefined, m: Omit<Measure, "at"> & { at?: string }): boolean {
  if (!fp || !(m.tris > 0)) return false;
  const s = load();
  const old = s[fp];
  if (old && old.tris === m.tris && (old.verts ?? null) === (m.verts ?? null)) return false;
  s[fp] = { ...m, at: m.at ?? new Date().toISOString() };
  save();
  return true;
}

/** Forget the measures (a test, or «clear the caches»). */
export function clearMeasures(): void {
  mem = {};
  try { ls()?.removeItem(MEASURE_KEY); } catch { /* nothing kept */ }
}
