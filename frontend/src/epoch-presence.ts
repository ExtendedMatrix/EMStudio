/**
 * MICRO-TESTATE-COERENTI p.7 (E.D., 13 Nov 2026, 12:16) · what is IN an epoch —
 * «I proxy di un'epoca sono quelli che nascono lì E quelli che ci sopravvivono».
 *
 * The rule is s3Dgraphy's `epoch_scope.epoch_presence` (born: `has_first_epoch`,
 * survived: `survive_in_epoch`; a mother epoch the union of its sub-epochs by
 * `has_sub_epoch`; the models an epoch of the family reaches with
 * `has_representation_model`). This is its reading in the page — the ONE every
 * view by epoch uses (the Outliner's Space tree, the scene's summary «proxies n
 * of m», the table filtered by epoch); `scripts/check-epoch-presence.mjs`
 * compares it with s3Dgraphy's on Templu Mare v9, epoch by epoch.
 *
 * Pure: the graph in, an index out (built once per document, then O(epoch)).
 * Removed nodes and edges (tombstones) do not count. A legacy `is_in_epoch`
 * from a node that is not an epoch counts as born (s3Dgraphy reads it the same).
 */
import type { EmDocument, EmEdge, EmNode } from "./types";

export interface Presence {
  /** the epoch and its sub-epochs, deep, the epoch first */
  epochs: string[];
  /** born there (or in a sub-epoch) */
  born: string[];
  /** surviving there, not born there: `first` the epoch it was born in */
  survive: { id: string; first: string | null }[];
  /** the models (RM, containers) an epoch of the family reaches */
  models: string[];
}

const removedNode = (n: EmNode | undefined): boolean => !n || !!(n.data as Record<string, unknown> | undefined)?.removed;
const removedEdge = (e: EmEdge): boolean => {
  const x = e as { attributes?: Record<string, unknown>; data?: Record<string, unknown> };
  return !!(x.attributes?.removed || x.data?.removed);
};

export interface PresenceIndex {
  (epochId: string, family?: boolean): Presence;
  /** where a node is born, null without a first epoch */
  firstOf(id: string): string | null;
  /** the epoch and its sub-epochs */
  family(epochId: string): string[];
}

const memo = new WeakMap<object, { rev: number; idx: PresenceIndex }>();

/** The index of a document. The store edits the graph in place: pass its
 *  `rev` to reuse the index while nothing changed (without it, a fresh one). */
export function presenceIndex(doc: EmDocument, rev = -1): PresenceIndex {
  const g = doc.graph as object;
  const hit = memo.get(g);
  if (rev >= 0 && hit && hit.rev === rev) return hit.idx;
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const isEp = (id: string) => byId.get(id)?.node_type === "EpochNode" && !removedNode(byId.get(id));
  const kids = new Map<string, string[]>();
  const firstOf = new Map<string, string>();
  const bornAt = new Map<string, string[]>();
  const survAt = new Map<string, string[]>();
  const modelsAt = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => { const l = m.get(k); if (l) { if (!l.includes(v)) l.push(v); } else m.set(k, [v]); };
  const live = doc.graph.edges.filter((e) => !removedEdge(e) && !removedNode(byId.get(e.source)) && !removedNode(byId.get(e.target)));
  for (const e of live) {
    if (e.edge_type === "has_sub_epoch" && isEp(e.source) && isEp(e.target)) push(kids, e.source, e.target);
    else if ((e.edge_type === "has_first_epoch" || (e.edge_type === "is_in_epoch" && !isEp(e.source))) && isEp(e.target)) {
      if (!firstOf.has(e.source)) firstOf.set(e.source, e.target);
      push(bornAt, e.target, e.source);
    } else if (e.edge_type === "survive_in_epoch" && isEp(e.target)) push(survAt, e.target, e.source);
    else if (e.edge_type === "has_representation_model" && isEp(e.source)) push(modelsAt, e.source, e.target);
  }
  const family = (epochId: string): string[] => {
    const out: string[] = [];
    const todo = [epochId];
    while (todo.length) {
      const cur = todo.shift()!;
      if (out.includes(cur)) continue;
      out.push(cur);
      todo.push(...(kids.get(cur) ?? []));
    }
    return out;
  };
  const cache = new Map<string, Presence>();
  const idx = ((epochId: string, fam = true): Presence => {
    const key = `${fam ? 1 : 0}|${epochId}`;
    const c = cache.get(key);
    if (c) return c;
    const epochs = fam ? family(epochId) : [epochId];
    const born: string[] = [], models: string[] = [];
    const bornSet = new Set<string>();
    for (const ep of epochs) for (const id of bornAt.get(ep) ?? []) if (!bornSet.has(id)) { bornSet.add(id); born.push(id); }
    for (const ep of epochs) for (const id of modelsAt.get(ep) ?? []) if (!models.includes(id)) models.push(id);
    const survive: Presence["survive"] = [];
    const seen = new Set(bornSet);
    for (const ep of epochs) for (const id of survAt.get(ep) ?? []) if (!seen.has(id)) { seen.add(id); survive.push({ id, first: firstOf.get(id) ?? null }); }
    const p = { epochs, born, survive, models };
    cache.set(key, p);
    return p;
  }) as PresenceIndex;
  idx.firstOf = (id) => firstOf.get(id) ?? null;
  idx.family = family;
  if (rev >= 0) memo.set(g, { rev, idx });
  return idx;
}

/** One epoch's presence (the index built or reused). */
export function epochPresence(doc: EmDocument, epochId: string, family = true, rev = -1): Presence {
  return presenceIndex(doc, rev)(epochId, family);
}
