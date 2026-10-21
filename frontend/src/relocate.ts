// MICRO-PERCORSI-WINDOWS p.3 · «Ritrova i file…» — Blender's «Find Missing
// Files» for a study. A person names a folder; the bridge walks it and, for each
// file the document cannot find, proposes the file by its sha256 (the
// `checksum` the data already carries) and, without one, by name + size
// (s3Dgraphy `find_moved`, the same «Find moved files» of the Storage). Here:
// what each proposal IS for the person — found, ambiguous, missing, or «to be
// linked» (an `onedrive://` with no OneDrive folder set on this computer) — and
// the rewrite, every url written RELATIVE to the em.json (`../RB/x.glb`), the
// way Templu Mare v4 keeps its own. Pure: `check-relocate.mjs` asks it.
import { hasScheme, join, relativeTo, resolveRelative, toPosix } from "./paths";
import { makeBlendLocator, parseBlendLocator } from "./resources";

/** MICRO-PERCORSI-WINDOWS p.4 · where a locator of the document is on THIS
 *  computer: relative to the em.json (`../RB/x.glb`), absolute as it is, an
 *  `onedrive://<path>` under this computer's OneDrive folder (a setting per
 *  machine: `~/Library/CloudStorage/OneDrive-CNR` on the Mac, `C:\Users\<u>\
 *  OneDrive - CNR` on Windows), the `.blend` of a `blend://<path>#Type/name`
 *  (its path relative like any other). A web address, or an `onedrive://`
 *  with no OneDrive folder set: null. */
export function locatorOnDisk(emjsonPath: string | null, url: string, opts: { onedriveRoot?: string } = {}): string | null {
  const u = String(url ?? "").trim();
  if (!u) return null;
  const od = /^onedrive:\/\/(.*)$/i.exec(u);
  if (od) return opts.onedriveRoot ? join(opts.onedriveRoot, od[1]) : null;
  const blend = parseBlendLocator(u);
  if (blend) return resolveRelative(emjsonPath, blend[0]);
  if (hasScheme(u)) return null;
  return resolveRelative(emjsonPath, u);
}

/** a file the document cannot find (a row of `/files-state`) */
export interface LostFile { id: string; name: string; state: string; url: string }
/** a candidate the bridge found (s3Dgraphy `find_moved`) */
export interface Candidate { path: string; how: "exact" | "exact_renamed" | "probable" | "possible"; size: number }
export interface MovedRow { id: string; matches: Candidate[] }

export type VerdictKind = "found" | "ambiguous" | "missing" | "link";
export interface Verdict {
  id: string; name: string; url: string; kind: VerdictKind;
  /** the file proposed (found), or the one the person picked (ambiguous) */
  choice: string | null;
  candidates: Candidate[];
}

/** a match that names the file's own bytes or, without a digest, its name and size */
const SURE = new Set(["exact", "exact_renamed", "probable"]);

/** each lost file, as the person reads it: ONE sure candidate is «found»;
 *  several of the surest kind, or only a namesake, are «ambiguous» (the person
 *  picks); none is «missing» — or «to be linked» for an `onedrive://` while
 *  this computer has no OneDrive folder set (`onedriveRoot` empty). */
export function classify(lost: LostFile[], moved: MovedRow[], opts: { onedriveRoot?: string } = {}): Verdict[] {
  const byId = new Map(moved.map((m) => [m.id, m.matches ?? []]));
  return lost.map((f) => {
    const matches = byId.get(f.id) ?? [];
    const base = { id: f.id, name: f.name, url: f.url, candidates: matches };
    if (!matches.length) {
      const link = /^onedrive:\/\//i.test(f.url) && !opts.onedriveRoot;
      return { ...base, kind: link ? "link" : "missing", choice: null };
    }
    const best = matches[0].how;
    const tier = matches.filter((m) => m.how === best);
    if (SURE.has(best) && tier.length === 1) return { ...base, kind: "found", choice: tier[0].path };
    return { ...base, kind: "ambiguous", choice: null };
  });
}

/** the urls to write: each chosen file relative to the em.json (another disk —
 *  another drive, a share — stays absolute, POSIX-shaped). Unchanged urls are
 *  not rewritten. */
export function rewritePlan(verdicts: Verdict[], emjsonPath: string): Array<{ id: string; from: string; to: string }> {
  const out: Array<{ id: string; from: string; to: string }> = [];
  for (const v of verdicts) {
    if (!v.choice) continue;
    const rel = relativeTo(emjsonPath, toPosix(v.choice));
    // a datablock keeps its type and name: only its .blend moved
    const blend = parseBlendLocator(v.url);
    const to = blend ? makeBlendLocator(rel, blend[1], blend[2]) : rel;
    if (to && to !== v.url) out.push({ id: v.id, from: v.url, to });
  }
  return out;
}

/** a url the disk can answer for (relative or absolute, the .blend of a
 *  datablock, an `onedrive://`), as opposed to a web address */
export const isDiskUrl = (u: string): boolean => !!u && (!hasScheme(u) || /^(onedrive|blend):\/\//i.test(u));

/** the tally said at the opening and on top of the window */
export function tally(vs: Verdict[]): Record<VerdictKind, number> {
  const t: Record<VerdictKind, number> = { found: 0, ambiguous: 0, missing: 0, link: 0 };
  for (const v of vs) t[v.kind]++;
  return t;
}

/** MICRO-INSTALLER-PULSANTE p.2 · the status bar's «N missing files»: the files
 *  of the open document the disk cannot answer for, the `onedrive://` that wait
 *  for this computer's OneDrive folder counted apart («to link») — the same
 *  split as the window's (`classify`), so the bar and the window agree. */
export function missingCount(lost: LostFile[], opts: { onedriveRoot?: string } = {}): { missing: number; link: number } {
  let missing = 0, link = 0;
  for (const f of lost) {
    if (/^onedrive:\/\//i.test(f.url) && !opts.onedriveRoot) link++;
    else missing++;
  }
  return { missing, link };
}
