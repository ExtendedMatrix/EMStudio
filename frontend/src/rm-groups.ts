/**
 * MICRO-SPAZIO-3D-3 p.7 · the RM CONTAINERS of EM Tools in the Space — the
 * writes, pure (`scripts/check-rm-groups.mjs`).
 *
 * The datamodel has `RepresentationModelNodeGroup` since 1.6.5 (EM16-RMNG, 10
 * Sept 2026): a container of models as a group of the graph, membership
 * `is_in_representation_model_group`, ONE container per model, BESIDE the
 * direct Document → RM and Epoch → RM bonds, which stay. s3Dgraphy READS it
 * (`Graph.get_representation_model_groups`, `…_group_members`, `…_group_of`)
 * and has no function that writes it; EM Tools writes it
 * (`rm_manager/group_nodes.py`, bpy-free: `group_node_id_for`, `ensure_group`,
 * `attach_document`, `add_member`, `remove_member`). EMStudio writes from the
 * page, so this is the same rule with the SAME ids — a group made here is the
 * group EM Tools finds, and the reverse — and not a second idea of it:
 *
 *   · the group's id: `<document>_rmgroup`, or `rmgroup_<label slug>` when it
 *     has no document;
 *   · the membership edge: `<model>_is_in_representation_model_group_<group>`;
 *   · the document's edge: `<document>_has_representation_model_<group>`.
 *
 * One difference, asked by the MICRO: «Sposta nel contenitore» MOVES a model
 * (its membership elsewhere is taken away first), where EM Tools' `add_member`
 * refuses a model that is in another group (its mesh list is authoritative on
 * the Blender side, and it says so to the user). The 1:1 rule holds either way.
 * The proposal for s3Dgraphy — the writer functions in the library, so the two
 * tools stop carrying the rule twice — is in the report.
 */
import type { EmEdge, EmNode } from "./types";

export const RM_GROUP_TYPE = "RepresentationModelNodeGroup";
export const RM_GROUP_EDGE = "is_in_representation_model_group";
export const RM_DOC_EDGE = "has_representation_model";

interface DocLike { graph: { nodes: EmNode[]; edges: EmEdge[] } }

const alive = (e: EmEdge): boolean => !((e as { attributes?: Record<string, unknown> }).attributes?.removed);

/** EM Tools' `group_node_id_for`: from the document, else from the label. */
export function groupNodeIdFor(label: string, docId?: string | null): string {
  if (docId) return `${docId}_rmgroup`;
  const slug = [...(label || "unnamed")].map((ch) => (/[\p{L}\p{N}_-]/u.test(ch) ? ch : "_")).join("");
  return `rmgroup_${slug}`;
}
export const membershipEdgeId = (model: string, group: string): string => `${model}_${RM_GROUP_EDGE}_${group}`;
export const docEdgeId = (doc: string, group: string): string => `${doc}_${RM_DOC_EDGE}_${group}`;

export interface GroupPlan {
  addNodes: EmNode[];
  addEdges: Array<{ id: string; source: string; target: string; type: string }>;
  /** the edges to take away (their ids) */
  removeEdges: string[];
  /** the group the plan writes into (new or existing) */
  groupId: string | null;
  /** a new container refused: its document has one already (EM Tools' id is
   *  the document's — one container per document), its name */
  taken?: string;
}

/** The container a model is in (the first membership to a group), or null. */
export function groupOfModel(doc: DocLike, model: string): string | null {
  const groups = new Set(doc.graph.nodes.filter((n) => n.node_type === RM_GROUP_TYPE).map((n) => n.id));
  return doc.graph.edges.find((e) => alive(e) && e.edge_type === RM_GROUP_EDGE && e.source === model && groups.has(e.target))?.target ?? null;
}

/** Memberships of these models to any group: what a move takes away first (1:1). */
function membershipsOf(doc: DocLike, models: readonly string[]): string[] {
  const set = new Set(models);
  return doc.graph.edges.filter((e) => alive(e) && e.edge_type === RM_GROUP_EDGE && set.has(e.source) && !!e.id).map((e) => e.id!);
}

/** «Sposta nel contenitore…»: the models into `groupId`, out of the one they were in. */
export function planMove(doc: DocLike, groupId: string, models: readonly string[]): GroupPlan {
  const plan: GroupPlan = { addNodes: [], addEdges: [], removeEdges: [], groupId };
  const already = new Set(doc.graph.edges.filter((e) => alive(e) && e.edge_type === RM_GROUP_EDGE && e.target === groupId).map((e) => e.source));
  const moving = models.filter((m) => !already.has(m));
  plan.removeEdges = membershipsOf(doc, moving);
  for (const m of moving) plan.addEdges.push({ id: membershipEdgeId(m, groupId), source: m, target: groupId, type: RM_GROUP_EDGE });
  return plan;
}

/** «Nuovo contenitore dai selezionati…»: the group (with its document's edge,
 *  when there is a document), and the models moved into it. A DOCUMENT HAS ONE
 *  CONTAINER: EM Tools derives the group's id from it (`<doc>_rmgroup`), so a
 *  second container of the same document would be the first one — the plan is
 *  refused (`taken`) rather than merged; without a document the id comes from
 *  the label, and the same label is the same container (`ensure_group`). */
export function planNewGroup(doc: DocLike, label: string, docId: string | null, models: readonly string[]): GroupPlan {
  let gid = groupNodeIdFor(label, docId);
  const existing = doc.graph.nodes.find((n) => n.id === gid);
  if (docId && existing && existing.node_type === RM_GROUP_TYPE)
    return { addNodes: [], addEdges: [], removeEdges: [], groupId: gid, taken: String(existing.name ?? gid) };
  if (existing && existing.node_type !== RM_GROUP_TYPE) {
    // an id taken by something else: the next free one
    let k = 2;
    while (doc.graph.nodes.some((n) => n.id === `${gid}_${k}`)) k++;
    gid = `${gid}_${k}`;
  }
  const plan = planMove(doc, gid, models);
  if (!existing || existing.node_type !== RM_GROUP_TYPE)
    plan.addNodes.push({ id: gid, node_type: RM_GROUP_TYPE, name: label || gid, description: "" } as EmNode);
  if (docId && !doc.graph.edges.some((e) => alive(e) && e.edge_type === RM_DOC_EDGE && e.source === docId && e.target === gid))
    plan.addEdges.unshift({ id: docEdgeId(docId, gid), source: docId, target: gid, type: RM_DOC_EDGE });
  return plan;
}

/** «Togli dal contenitore»: the memberships go, nothing else (the epoch's and
 *  the document's bonds to the model stay — EM Tools' `remove_member`). */
export function planRemove(doc: DocLike, models: readonly string[]): GroupPlan {
  return { addNodes: [], addEdges: [], removeEdges: membershipsOf(doc, models), groupId: null };
}
