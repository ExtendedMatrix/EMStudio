// Group-context canvas (hypergraph navigation): an isolated space showing
// only the members of one group. Positions are per-context, persisted in
// layout.group_spaces[groupId]; members without a stored position get a
// deterministic layered layout as the starting arrangement.
import { buildMembership, groupMembers } from "../folding";
import { isDtcChainEdge } from "../rules";
import type { Scene } from "../scene";
import type { EmDocument } from "../types";
import { layoutLayered } from "./graph";
import { paradataGroupScene } from "./pd-arrange";

function applyStored(doc: EmDocument, key: string, scene: Scene): Scene {
  const stored = doc.layout?.group_spaces?.[key];
  if (stored) {
    for (const sn of scene.nodes) {
      const r = stored[sn.id];
      if (r) {
        sn.x = r.x;
        sn.y = r.y;
        sn.w = r.w;
        sn.h = r.h;
      }
    }
  }
  return scene;
}

export function buildGroupScene(doc: EmDocument, groupId: string): Scene {
  const membership = buildMembership(doc);
  // MICRO-BADGE-PD · a paradata group: its members AND the instances it draws,
  // arranged by the one function the Matrix uses when it is open in place
  if (doc.graph.nodes.find((n) => n.id === groupId)?.node_type === "ParadataNodeGroup")
    return paradataGroupScene(doc, groupId, membership.membersOf.get(groupId) ?? []);
  const { nodes, edges } = groupMembers(doc, membership, groupId);
  return applyStored(doc, groupId, layoutLayered(nodes, edges));
}

/** The DTC genesis context: the upstream provenance subgraph of a produced
 *  Resource — its process and input resources — collected by a BFS over the DTC
 *  CHAIN edges from the Resource. Reuses the same layered layout + per-context
 *  position persistence as group folding. The EM-side facets
 *  (RepresentationModel / Document that reference the Resource) are NOT part of
 *  the genesis and are intentionally excluded.
 *
 *  This walks the STUDY document, and it is not a duplicate of the node's
 *  expansion (`s3dgraphy.dtc.neighbourhood`): a different graph, on this side of
 *  the wire. What it must share is the CLASSIFICATION — which edges are chain —
 *  and it does: `isDtcChainEdge` reads the datamodel's marker. It used to carry
 *  its own `startsWith("dtc_")`, a third copy of a rule that had already been
 *  written twice. */
export function buildDtcGenesisScene(doc: EmDocument, resourceId: string): Scene {
  const keep = new Set<string>([resourceId]);
  let frontier = new Set<string>([resourceId]);
  while (frontier.size) {
    const next = new Set<string>();
    for (const e of doc.graph.edges) {
      if (!isDtcChainEdge(e.edge_type)) continue;
      if (frontier.has(e.source) && !keep.has(e.target)) {
        keep.add(e.target);
        next.add(e.target);
      }
      if (frontier.has(e.target) && !keep.has(e.source)) {
        keep.add(e.source);
        next.add(e.source);
      }
    }
    frontier = next;
  }
  const nodes = doc.graph.nodes.filter((n) => keep.has(n.id));
  const edges = doc.graph.edges.filter(
    (e) => isDtcChainEdge(e.edge_type) && keep.has(e.source) && keep.has(e.target),
  );
  return applyStored(doc, resourceId, layoutLayered(nodes, edges));
}
