/**
 * PROPRIETA · the properties of a unit gathered in its paradata group, and the
 * property with more than one owner (MICRO-PROPRIETA-COMPATTA, E.D. 9 Oct 2026).
 *
 *     unit ──has_paradata_nodegroup──▶ PD_<unit>
 *     property · combiner · extractor ──is_in_paradata_nodegroup──▶ PD_<unit>
 *
 * The decisions of E.D. this file follows:
 *   1. the group of a unit gathers each property with its chain — the COMBINER
 *      and the EXTRACTOR are DUPLICATED when another unit's property uses them
 *      (no link from the copy to the original: there is no instantiation of the
 *      extractors yet); the DOCUMENT would be INSTANTIATED, but the graph has no
 *      form for an instance as a node pointing at its master (measured: the
 *      only forms are the yEd records of `data.instances` and the Matrix's own
 *      drawing-time re-instancing), so documents stay OUT of the group and the
 *      copies read the same master — the Matrix draws its instance in the group;
 *   2. one property, one owner: two or more `has_property` without `inherited`
 *      is a warning, cured by «Duplicate for each owner». The declared heir
 *      (`attributes.inherited`) is not a second owner and is left alone;
 *   3. after «Compact» the groups are closed: a badge on the unit.
 *
 * Pure readers over the em.json document; mutations through the store, each
 * command ONE `batch` (one undo step). `scripts/check-compact.mjs` runs it.
 */
import type { EmDocument, EmEdge, EmNode } from "./types";
import {
  HAS_PARADATA_NODEGROUP,
  HAS_PROPERTY,
  IS_IN_PARADATA_NODEGROUP,
} from "./paradata-chain";
import { classOf } from "./rules";

// ── reading ──────────────────────────────────────────────────────────────────

const attrs = (e: EmEdge): Record<string, unknown> =>
  (e.attributes ?? {}) as Record<string, unknown>;
const liveEdge = (e: EmEdge): boolean => !attrs(e).removed;
const liveNode = (n: EmNode): boolean => !((n.data ?? {}) as Record<string, unknown>).removed;

/** The key a drawn edge is recognised by, folded or not (folding rewrites the
 *  ends and keeps the id). */
export function drawnEdgeKey(e: EmEdge): string {
  return e.id ?? `${e.source}|${e.edge_type ?? ""}|${e.target}`;
}

interface Index {
  node: Map<string, EmNode>;
  out: Map<string, EmEdge[]>;
  inn: Map<string, EmEdge[]>;
}

function index(doc: EmDocument): Index {
  const node = new Map<string, EmNode>();
  for (const n of doc.graph.nodes) if (liveNode(n)) node.set(n.id, n);
  const out = new Map<string, EmEdge[]>();
  const inn = new Map<string, EmEdge[]>();
  for (const e of doc.graph.edges) {
    if (!liveEdge(e) || !node.has(e.source) || !node.has(e.target)) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  return { node, out, inn };
}

const outOf = (ix: Index, id: string, type: string): EmEdge[] =>
  (ix.out.get(id) ?? []).filter((e) => e.edge_type === type);
const cls = (ix: Index, id: string): string => classOf(ix.node.get(id)?.node_type);

/** The paradata group of an owner (`has_paradata_nodegroup`), or null. */
function groupOf(ix: Index, ownerId: string): string | null {
  for (const e of outOf(ix, ownerId, HAS_PARADATA_NODEGROUP))
    if (cls(ix, e.target) === "ParadataNodeGroup") return e.target;
  return null;
}

/** The groups a node is a member of. */
function groupsHolding(ix: Index, id: string): string[] {
  return outOf(ix, id, IS_IN_PARADATA_NODEGROUP).map((e) => e.target);
}

/**
 * The `has_property` edges whose thread the GROUP carries: the property is a
 * member of its owner's own paradata group, so `has_paradata_nodegroup` already
 * draws the bond and a second line would be a duplicate. The edge stays in the
 * graph — only the drawing leaves it out.
 */
export function carriedPropertyEdges(doc: EmDocument): Set<string> {
  const ix = index(doc);
  const out = new Set<string>();
  for (const e of doc.graph.edges) {
    if (e.edge_type !== HAS_PROPERTY || !liveEdge(e)) continue;
    const g = groupOf(ix, e.source);
    if (g && groupsHolding(ix, e.target).includes(g)) out.add(drawnEdgeKey(e));
  }
  return out;
}
