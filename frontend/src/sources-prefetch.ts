/**
 * MICRO-SEG25 · THE READ-AHEAD OF THE SOURCES (E.D., 22 Nov 2026: «la prima
 * volta che seleziono D.01 ci vogliono molti secondi»). After a file opens, in
 * the background and one at a time, the roots of the tilesets the documents
 * show are read — the archive's directory and its tileset.json, never a tile —
 * so the first look at a survey starts from its tiles. This module is the PLAN,
 * pure: which tilesets, in which order; `main.ts` runs it.
 *
 * Rules: only the tilesets a document's Viewer would draw (its own models that
 * are tilesets, the tileset of a container it shows); each once; only those
 * the scene can fetch (an address, a state not missing/refused); a file with
 * none plans nothing — and the read-ahead does not start.
 */

export interface PrefetchTarget { id: string; models: string[]; groups: string[] }
export interface PrefetchAlternative { group: string; tileset: string }
export interface PrefetchRm { id: string; tiles: boolean; url: string | null | undefined; state: string | null | undefined }
export interface PrefetchItem { rmId: string; url: string; docs: string[] }

const UNFETCHABLE = new Set(["missing", "refused", "reference", "cloud"]);

/** The tilesets to read ahead, in the order of the documents (the first
 *  document's first). */
export function prefetchPlan(targets: PrefetchTarget[], alternatives: PrefetchAlternative[], rms: PrefetchRm[]): PrefetchItem[] {
  const byId = new Map(rms.map((r) => [r.id, r]));
  const tilesetOf = new Map<string, string[]>();
  for (const a of alternatives) (tilesetOf.get(a.group) ?? tilesetOf.set(a.group, []).get(a.group)!).push(a.tileset);
  const out = new Map<string, PrefetchItem>();
  for (const t of targets) {
    const ids = [...t.models, ...t.groups.flatMap((g) => tilesetOf.get(g) ?? [])];
    for (const id of ids) {
      const r = byId.get(id);
      if (!r || !r.tiles || !r.url || (r.state && UNFETCHABLE.has(r.state))) continue;
      const had = out.get(r.url);
      if (had) { if (!had.docs.includes(t.id)) had.docs.push(t.id); continue; }
      out.set(r.url, { rmId: r.id, url: r.url, docs: [t.id] });
    }
  }
  return [...out.values()];
}
