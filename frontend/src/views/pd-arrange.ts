// MICRO-BADGE-PD · the arrangement of a paradata group: ONE function for the
// soloing (the group's own canvas, `buildGroupScene`) and for the group opened
// in place in the Matrix (`buildMatrixScene`), where it takes the place of the
// general layout inside the box.
//
// It is the soloing's arrangement as it was — `layoutLayered` over the group's
// content (E.D., 9 Oct 2026: «È l'ordine giusto») — with two things said out
// loud: the content includes the computed instances (`paradata_instances`, the
// readings re-attached to them), and the documents and the instances share the
// LAST row whatever their depth, no row left empty between the levels. So the
// properties are a row on top, the combiners and the extractors the rows under
// them (the barycentre keeps each under its property), the sources at the
// bottom. The positions the soloing stored (`layout.group_spaces[group]`) win,
// as they always did there; the Matrix reads them too, so a hand that arranged
// the group in one place finds it arranged in the other.
import type { Scene, SceneNode } from "../scene";
import type { EmDocument, EmEdge, EmNode } from "../types";
import { viewIndex, viewInstances, type ViewIndex, type ViewInstance } from "../paradata-view";
import { layoutLayered, NODE_H, NODE_W } from "./graph";

/** the cell a node of the arrangement is centred in (context space) */
export const PD_CELL = { w: NODE_W, h: NODE_H };

/** edge key → the instance a reading is re-attached to (the Matrix's rule) */
export function reattachedReadings(vix: ViewIndex, instances: ViewInstance[]): Map<string, string> {
  const readEdge = new Map<string, EmEdge[]>();
  for (const e of vix.edges)
    if (e.edge_type === "extracted_from")
      (readEdge.get(e.source) ?? readEdge.set(e.source, []).get(e.source)!).push(e);
  const out = new Map<string, string>();
  for (const r of instances)
    for (const x of r.extractors)
      for (const e of readEdge.get(x) ?? [])
        if (e.target === r.master || r.through.includes(e.target))
          out.set(edgeKey(e), r.id);
  return out;
}

export const edgeKey = (e: EmEdge): string => e.id ?? `${e.source}→${e.target}`;

/**
 * The group's arranged scene: `memberIds` (the members drawn in it) and the
 * instances the group draws, laid out by the soloing's rule, the stored
 * positions applied. Instance nodes carry `instanceOf` and their badge.
 */
export function paradataGroupScene(
  doc: EmDocument,
  groupId: string,
  memberIds: readonly string[],
  vix: ViewIndex = viewIndex(doc),
  instances: ViewInstance[] = viewInstances(doc, groupId, vix),
  /** the widest box the caller draws (the Matrix's sizes are its own) */
  cellW?: number,
): Scene {
  const ids = new Set(memberIds);
  const nodes: EmNode[] = doc.graph.nodes.filter((n) => ids.has(n.id));
  const inst = new Map<string, ViewInstance>();
  for (const r of instances) {
    const m = vix.node.get(r.master);
    if (!m || ids.has(r.id)) continue;
    nodes.push({ ...m, id: r.id });
    inst.set(r.id, r);
    ids.add(r.id);
  }
  const re = reattachedReadings(vix, instances);
  const edges: EmEdge[] = [];
  for (const e of vix.edges) {
    const target = re.get(edgeKey(e)) ?? e.target;
    if (ids.has(e.source) && ids.has(target) && e.source !== target)
      edges.push(target === e.target ? e : { ...e, target });
  }
  const isDoc = (id: string): boolean => vix.node.get(inst.get(id)?.master ?? id)?.node_type === "document";
  const scene = layoutLayered(nodes, edges, undefined, { bottom: (id) => inst.has(id) || isDoc(id), cellW });
  for (const sn of scene.nodes) {
    const r = inst.get(sn.id);
    if (!r) continue;
    sn.node = vix.node.get(r.master)!;
    sn.instanceOf = r.master;
    sn.instanceBadge = { owner: r.owner, ownerName: r.owner_name, ownerKind: r.owner_kind, group: groupId };
    if (r.removed) sn.trace = true;
  }
  const stored = doc.layout?.group_spaces?.[groupId];
  if (stored)
    for (const sn of scene.nodes) {
      const r = stored[sn.id];
      if (r) Object.assign(sn, { x: r.x, y: r.y, w: r.w, h: r.h });
    }
  return scene;
}

/** The centre of a node of the arrangement (context space). */
export function arrangedCentre(sn: SceneNode): { x: number; y: number } {
  return { x: sn.x + sn.w / 2, y: sn.y + sn.h / 2 };
}
