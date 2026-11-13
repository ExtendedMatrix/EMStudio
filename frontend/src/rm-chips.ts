/**
 * MICRO-MATRIX-FASI p.3 (E.D., 6 Nov 2026) · the chips of the 3D, beside «ha 3D».
 *
 * The decision of the day (brain: decisioni/rm-e-rmdoc): whatever comes in as a
 * DOCUMENT shows in the Space as an RMDoc, its representation; an RM is only a
 * visual replica of a place in an epoch. So two chips, drawn as the proxy's on
 * the units:
 *
 *  · on a DOCUMENT, its RMDoc: full when the representation has a file
 *    (`has_linked_resource` → a resource), hollow when it is declared and has
 *    none. A document's representation is the `representation_model_doc` it
 *    has (`has_representation_model_doc`); a document that still carries a
 *    `representation_model` (`has_representation_model`, the files before the
 *    decision: Templu Mare's 97 surveys) shows that one — it IS the document's
 *    representation, whatever its type says;
 *  · on an EPOCH or a phase, how many RM (`representation_model`, attached by
 *    `has_representation_model`) it has, its sub-phases' included — what the
 *    Space shows when that epoch is chosen (a phase: its own; the mother: all).
 *
 * Pure: the graph in, maps out. Removed nodes and edges (tombstones) do not count.
 */
import type { EmDocument, EmEdge, EmNode } from "./types";

export interface DocRmDoc {
  /** the representation the chip opens */
  rm: string;
  /** a file is linked to it */
  full: boolean;
}

const removedNode = (n: EmNode | undefined): boolean =>
  !n || !!(n.data as Record<string, unknown> | undefined)?.removed;
const removedEdge = (e: EmEdge): boolean =>
  !!((e as { attributes?: Record<string, unknown> }).attributes?.removed);
const RM_LIKE = new Set(["representation_model", "representation_model_doc", "representation_model_sf"]);

/** document id → its RMDoc (the first with a file, else the first declared).
 *
 *  MICRO-TESTATE-COERENTI p.8 (E.D., 13 Nov 2026: «XX sec mostra RMDoc 1/1 ma non è
 *  un RMDoc») · `strict`: only a node that IS an RMDoc (`representation_model_doc`).
 *  The criterion is the datamodel's (node datamodel 1.6.44, scope_note): an RM
 *  published by a document (`has_representation_model`, D.01 → its meshes) is
 *  not for that an RMDoc. The Outliner reads it strict; the «ha 3D» chip of a
 *  document keeps the wide reading (the document has a representation). */
export function documentRmDocs(doc: EmDocument, strict = false): Map<string, DocRmDoc> {
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const edges = doc.graph.edges.filter((e) => !removedEdge(e));
  const withFile = new Set<string>();
  for (const e of edges)
    if (e.edge_type === "has_linked_resource" && !removedNode(byId.get(e.target))) withFile.add(e.source);
  const out = new Map<string, DocRmDoc>();
  for (const e of edges) {
    if (e.edge_type !== "has_representation_model_doc" && e.edge_type !== "has_representation_model") continue;
    const d = byId.get(e.source), rm = byId.get(e.target);
    if (!d || d.node_type !== "document" || removedNode(d) || removedNode(rm) || !RM_LIKE.has(String(rm!.node_type))) continue;
    if (strict && rm!.node_type !== "representation_model_doc") continue;
    const full = withFile.has(e.target);
    const was = out.get(e.source);
    // a declared `representation_model_doc` wins over an old `representation_model`
    // of the same fullness; a full one over a hollow one
    if (!was || (full && !was.full)
        || (full === was.full && rm!.node_type === "representation_model_doc" && byId.get(was.rm)?.node_type !== "representation_model_doc"))
      out.set(e.source, { rm: e.target, full });
  }
  return out;
}

/** epoch (or phase) id → the number of RM it shows, its sub-phases' included */
export function epochRmCounts(doc: EmDocument): Map<string, number> {
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const own = new Map<string, Set<string>>();
  const kids = new Map<string, string[]>();
  for (const e of doc.graph.edges) {
    if (removedEdge(e)) continue;
    if (e.edge_type === "has_sub_epoch") {
      const k = kids.get(e.source);
      if (k) k.push(e.target);
      else kids.set(e.source, [e.target]);
    } else if (e.edge_type === "has_representation_model") {
      const ep = byId.get(e.source), rm = byId.get(e.target);
      if (ep?.node_type !== "EpochNode" || removedNode(ep) || removedNode(rm) || rm!.node_type !== "representation_model") continue;
      let s = own.get(e.source);
      if (!s) own.set(e.source, (s = new Set()));
      s.add(e.target);
    }
  }
  const all = new Map<string, Set<string>>();
  const of = (id: string, seen: Set<string>): Set<string> => {
    const hit = all.get(id);
    if (hit) return hit;
    const s = new Set(own.get(id) ?? []);
    if (!seen.has(id)) {
      seen.add(id);
      for (const k of kids.get(id) ?? []) for (const r of of(k, seen)) s.add(r);
    }
    all.set(id, s);
    return s;
  };
  const out = new Map<string, number>();
  for (const n of doc.graph.nodes) {
    if (n.node_type !== "EpochNode" || removedNode(n)) continue;
    const c = of(n.id, new Set()).size;
    if (c) out.set(n.id, c);
  }
  return out;
}
