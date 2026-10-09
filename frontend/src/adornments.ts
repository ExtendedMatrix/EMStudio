// BADGE1 · ornament nodes (author / license / embargo) as attached miniatures.
//
// In the formal matrix language these are annotations of a referent, not
// stratigraphic elements, so the VIEW collapses them: the ornament nodes are not
// drawn as boxes and their edges are not drawn as edges — instead each becomes a
// small badge pinned to a corner of its referent (the PD-tag pattern,
// generalised). The DOCUMENT never changes: the nodes and edges stay in em.json,
// narrative-authorship keeps reading them; only the drawing collapses.
//
// The "is it an ornament?" question and the "which edge attaches one?" set both
// live in filters.ts (anchored to the `authors_licenses` ring) — this module is
// pure geometry-free bookkeeping over the graph, so it can be unit-checked.
import { ADORNMENT_EDGE_TYPES, isAdornmentNodeType } from "./filters";
import type { EmEdge, EmNode } from "./types";

export interface AdornmentBadge {
  /** the REAL ornament node id — a click on the badge selects THIS node.
   *  Empty for an INHERITED badge (FUNNEL1): there is no ornament node on this
   *  referent, the value comes from a wider scope, so it is not a click target. */
  ornamentId: string;
  /** runtime node_type: author | author_ai | license | embargo */
  kind: string;
  /** the node's name, for the tooltip */
  label: string;
  /** FUNNEL1 · true when the value is INHERITED (activity/epoch/canvas), drawn
   *  attenuated/outline. Absent/false for the node's own (explicit) ornament. */
  inherited?: boolean;
  /** PROPRIETA · the chip of a unit's paradata group (kind `property`): the
   *  group it opens and closes, the number of properties it holds, and whether
   *  it is open now. `ornamentId` is the group's id. */
  group?: string;
  count?: number;
  open?: boolean;
}

// stable badge order on a referent: attribution first, then rights, then embargo
const KIND_ORDER = ["author", "author_ai", "license", "embargo"];

/**
 * Badges to draw per referent id, resolved from the FULL document edges (the
 * ornament edges are otherwise hidden by the `edges_author` ring, so resolution
 * cannot use the already-filtered edge list). Only ornament nodes present in
 * `nodes` produce a badge — so the `authors_licenses` ring, which removes those
 * nodes upstream when off, turns the badges off with them. A badge is attached
 * only when its referent resolves to a NON-ornament node that is itself visible.
 *
 * `has_embargo` may sit on a LicenseNode (embargo of a licence); the walk then
 * hops through the licence to the licence's own referent, so both the licence
 * and the embargo badge land on the same stratigraphic host.
 */
export function adornmentBadges(
  nodes: readonly EmNode[],
  allEdges: readonly EmEdge[],
  visibleIds: ReadonlySet<string>,
): Map<string, AdornmentBadge[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // ornament → its immediate referent. PDMEM1 made the ornament a MEMBER of the
  // referent's ParadataNodeGroup, and that membership is the ONE source: resolve
  // ornament → (is_in_paradata_nodegroup) → PDG → (has_paradata_nodegroup) →
  // referent FIRST. The direct semantic edge (has_author/…, BADGE1) is the
  // FALLBACK, so a document whose ornaments are not yet PDG members still shows
  // badges. Both are created together by the attach, so they agree.
  const referentOf = new Map<string, string>();
  const pdgHost = new Map<string, string>(); // PDG → referent node
  for (const e of allEdges)
    if (e.edge_type === "has_paradata_nodegroup") pdgHost.set(e.target, e.source);
  for (const e of allEdges)
    if (e.edge_type === "is_in_paradata_nodegroup") {
      const host = pdgHost.get(e.target);
      if (host && !referentOf.has(e.source)) referentOf.set(e.source, host);
    }
  for (const e of allEdges) {
    if (!ADORNMENT_EDGE_TYPES.has(e.edge_type ?? "")) continue;
    if (!referentOf.has(e.target)) referentOf.set(e.target, e.source);
  }
  const resolve = (ornamentId: string): string | null => {
    let cur = referentOf.get(ornamentId);
    const seen = new Set<string>([ornamentId]);
    let depth = 0;
    while (cur && depth++ < 6) {
      if (seen.has(cur)) return null; // cycle guard
      seen.add(cur);
      const node = byId.get(cur);
      // stop at the first non-ornament host; if the host isn't in this node set
      // (byId), it isn't visible here — treat as unresolved
      if (node && !isAdornmentNodeType(node.node_type)) return cur;
      cur = referentOf.get(cur);
    }
    return null;
  };
  const out = new Map<string, AdornmentBadge[]>();
  for (const n of nodes) {
    if (!isAdornmentNodeType(n.node_type)) continue;
    const ref = resolve(n.id);
    if (!ref || !visibleIds.has(ref)) continue;
    const badge: AdornmentBadge = {
      ornamentId: n.id,
      kind: n.node_type ?? "author",
      label: n.name || n.node_type || "",
    };
    const arr = out.get(ref);
    if (arr) arr.push(badge);
    else out.set(ref, [badge]);
  }
  const rank = (k: string): number => {
    const i = KIND_ORDER.indexOf(k);
    return i < 0 ? KIND_ORDER.length : i;
  };
  for (const arr of out.values())
    arr.sort(
      (a, b) =>
        rank(a.kind) - rank(b.kind) ||
        a.label.localeCompare(b.label) ||
        a.ornamentId.localeCompare(b.ornamentId),
    );
  return out;
}
