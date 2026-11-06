// MICRO-MEMORIA-SESSIONE p.4 · «Salva come» in another folder (E.D., 1 Nov 2026:
// v7 saved on the Desktop → 536 files missing, the queue all blocked). The urls
// of a document are written RELATIVE to its em.json (`DosCo/D.05.pdf`,
// `../RB/x.glb`, `blend://../RB/T.blend#Mesh/x`): an em.json written somewhere
// else carries them unchanged, and from there they name nothing. Here, pure: the
// urls that the new place would break, and each one rewritten so that it names
// the SAME file from the new place (relative again when both are on one disk,
// absolute when the new place is on another disk or share). `check-save-rebase.mjs`
// asks it, and opens the rewritten Templu Mare from another folder.
import { dirname, hasScheme, isAbsolute, normalize, relativeTo, resolveRelative } from "./paths";
import { makeBlendLocator, parseBlendLocator } from "./resources";

/** a node's url, by the graph it is in */
export interface RebaseRow { graph: string; id: string; from: string; to: string }

type Container = { graphs?: Record<string, { nodes?: Array<{ id: string; data?: Record<string, unknown> | null }> } | unknown> };

/** a url the em.json's folder answers for: a relative path, or the `.blend` of a
 *  datablock written relative. Absolute paths, `onedrive://`, the web: no. */
export function isRelativeDiskUrl(u: unknown): u is string {
  const s = typeof u === "string" ? u.trim() : "";
  if (!s) return false;
  const blend = parseBlendLocator(s);
  if (blend) return !isAbsolute(blend[0]) && !hasScheme(blend[0]);
  return !hasScheme(s) && !isAbsolute(s);
}

/** the url that names, from `newEm`, the file `url` names from `oldEm`; null
 *  when it does not change (not relative, or the same folder) */
export function rebaseUrl(url: string, oldEm: string, newEm: string): string | null {
  if (!isRelativeDiskUrl(url)) return null;
  const blend = parseBlendLocator(url);
  const rel = blend ? blend[0] : url.trim();
  const abs = resolveRelative(oldEm, rel);
  const to = relativeTo(newEm, abs);
  if (normalize(to) === normalize(rel)) return null;
  return blend ? makeBlendLocator(to, blend[1], blend[2]) : to;
}

/** the same folder (the rewrite has nothing to do) */
export const sameFolder = (a: string, b: string): boolean => normalize(dirname(a)) === normalize(dirname(b));

function nodesOf(c: Container): Array<[string, { id: string; data?: Record<string, unknown> | null }]> {
  const out: Array<[string, { id: string; data?: Record<string, unknown> | null }]> = [];
  for (const [gid, g] of Object.entries(c.graphs ?? {})) {
    const nodes = (g as { nodes?: unknown }).nodes;
    if (!Array.isArray(nodes)) continue;
    for (const n of nodes) if (n && typeof n === "object" && typeof (n as { id?: unknown }).id === "string") out.push([gid, n as { id: string; data?: Record<string, unknown> | null }]);
  }
  return out;
}

/** how many urls of the document are written relative to its em.json */
export function relativeUrlCount(c: Container): number {
  return nodesOf(c).filter(([, n]) => isRelativeDiskUrl(n.data?.url)).length;
}

/** every url `oldEm → newEm` changes, graph by graph */
export function rebasePlan(c: Container, oldEm: string, newEm: string): RebaseRow[] {
  const out: RebaseRow[] = [];
  for (const [gid, n] of nodesOf(c)) {
    const u = n.data?.url;
    if (typeof u !== "string") continue;
    const to = rebaseUrl(u, oldEm, newEm);
    if (to != null) out.push({ graph: gid, id: n.id, from: u, to });
  }
  return out;
}

/** the plan written into the container (the text that goes to disk) */
export function applyRebase(c: Container, plan: RebaseRow[]): void {
  const by = new Map(plan.map((p) => [`${p.graph}\u0000${p.id}`, p.to]));
  for (const [gid, n] of nodesOf(c)) {
    const to = by.get(`${gid}\u0000${n.id}`);
    if (to != null && n.data) n.data.url = to;
  }
}
