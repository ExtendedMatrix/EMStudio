/**
 * MICRO-SPAZIO-3D-2 · p.1 · the IMPLICIT paradata group, computed in the view
 * (E.D., 16 Oct 2026): «un'unità con proprietà sciolte si comporta nella vista
 * come se avesse un gruppo dei paradati». Pure (`scripts/check-implicit-pd.mjs`).
 *
 * A LOOSE property is one attached to a unit directly (`has_property`, not a
 * declared heir) and member of no paradata group; with it goes its chain — the
 * combiners and extractors that read it (`has_data_provenance`, `combines`),
 * when they too are in no group. The documents are not members: a group draws
 * them as computed instances (`paradata_instances`), as it draws the proxy of a
 * `geometry` property (`threed_instances`), so they follow by themselves.
 *
 *   · a unit with loose properties and NO group: the view gives it a group of
 *     its own, `IMPLICIT_PD + unit`, closed by default — the badge PD on the unit
 *     counts the properties and the instances, a click solos it, Shift + click
 *     opens it in place (an open implicit group is the view's, in memory);
 *   · a unit with a group AND loose properties: ONE badge, the loose ones join
 *     the real group in the view, marked «fuori dal gruppo» (`outside`).
 *
 * The data never changes: `withImplicitGroups` returns a VIEW document (the
 * original's nodes and edges, plus the view's), what every projection that
 * draws the paradata reads. «Compatta» stays the gesture that makes the group
 * true in the data; it gathers exactly what this rule gathers (one owner, its
 * combiners and extractors), so after it the view does not change.
 *
 * Why here and not in s3Dgraphy (measured 16 Oct 2026): the rule is a way of
 * DRAWING a graph of boxes; EM Tools lists a unit's properties by
 * `get_property_nodes_for_node` with no group at all (paradata_manager), and
 * Heriverse declares the two group edges and draws no group. Neither would read
 * it. If another client one day draws paradata groups, the rule is twenty lines
 * of `paradata_view.py` and this file is its model.
 */
import type { EmDocument, EmEdge, EmNode } from "./types";
import { classOf, isStratigraphicType } from "./rules";
import { paradataGroupName } from "./naming";

export const IMPLICIT_PD = "implicit-pd:";
const HAS_PROPERTY = "has_property";
const HAS_PARADATA_NODEGROUP = "has_paradata_nodegroup";
const IS_IN_PARADATA_NODEGROUP = "is_in_paradata_nodegroup";
const HAS_DATA_PROVENANCE = "has_data_provenance";
const COMBINES = "combines";

export interface ImplicitGroup {
  unit: string;
  /** the id of the group the view draws: the unit's real one, or an implicit one */
  group: string;
  /** true when the unit has no group and the view makes one */
  implicit: boolean;
  /** the loose properties, in edge order */
  properties: string[];
  /** their chain in no group: combiners and extractors */
  chain: string[];
}

const attrs = (e: EmEdge): Record<string, unknown> => (e.attributes ?? {}) as Record<string, unknown>;
const live = (e: EmEdge) => !attrs(e).removed;
const liveNode = (n: EmNode | undefined): n is EmNode => !!n && !((n.data ?? {}) as Record<string, unknown>).removed;

export function isImplicitGroup(id: string | null | undefined): boolean {
  return !!id && id.startsWith(IMPLICIT_PD);
}
export function implicitGroupId(unitId: string): string {
  return `${IMPLICIT_PD}${unitId}`;
}
export function unitOfImplicit(id: string): string {
  return id.slice(IMPLICIT_PD.length);
}

/** Every unit with loose properties, and what the view gathers for it. */
export function implicitGroups(doc: EmDocument): ImplicitGroup[] {
  const node = new Map<string, EmNode>();
  for (const n of doc.graph.nodes) if (liveNode(n)) node.set(n.id, n);
  const out = new Map<string, EmEdge[]>();
  const inn = new Map<string, EmEdge[]>();
  for (const e of doc.graph.edges) {
    if (!live(e) || !node.has(e.source) || !node.has(e.target)) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  const cls = (id: string) => classOf(node.get(id)?.node_type);
  const outOf = (id: string, t: string) => (out.get(id) ?? []).filter((e) => e.edge_type === t);
  const inOf = (id: string, t: string) => (inn.get(id) ?? []).filter((e) => e.edge_type === t);
  const inGroup = (id: string) => outOf(id, IS_IN_PARADATA_NODEGROUP).some((e) => cls(e.target) === "ParadataNodeGroup");
  const groupOf = (id: string) => outOf(id, HAS_PARADATA_NODEGROUP).find((e) => cls(e.target) === "ParadataNodeGroup")?.target ?? null;
  const taken = new Set<string>();
  const res: ImplicitGroup[] = [];
  for (const [id, n] of node) {
    if (!isStratigraphicType(n.node_type)) continue;
    const properties: string[] = [];
    for (const e of outOf(id, HAS_PROPERTY)) {
      if (attrs(e).inherited || cls(e.target) !== "PropertyNode" || inGroup(e.target)) continue;
      // one property, one owner (Compatta leaves a property of two owners alone)
      const owners = inOf(e.target, HAS_PROPERTY).filter((x) => !attrs(x).inherited).map((x) => x.source);
      if (new Set(owners).size > 1) continue;
      if (!properties.includes(e.target) && !taken.has(e.target)) properties.push(e.target);
    }
    if (!properties.length) continue;
    const chain: string[] = [];
    const walk = (from: string, edge: string) => {
      for (const e of outOf(from, edge)) {
        const k = cls(e.target);
        if ((k !== "CombinerNode" && k !== "ExtractorNode") || inGroup(e.target) || taken.has(e.target)) continue;
        taken.add(e.target);
        chain.push(e.target);
        if (k === "CombinerNode") walk(e.target, COMBINES);
      }
    };
    for (const p of properties) { taken.add(p); walk(p, HAS_DATA_PROVENANCE); }
    const real = groupOf(id);
    res.push({ unit: id, group: real ?? implicitGroupId(id), implicit: !real, properties, chain });
  }
  return res;
}

/**
 * The VIEW document: `doc` plus, for every unit with loose properties, the group
 * the view draws — a node of type `ParadataNodeGroup` (`data.implicit_view`)
 * when the unit has none, and the memberships, marked `attributes.implicit_view`
 * (`outside` when the group is the unit's real one). An implicit group is closed
 * (in `layout.folded_groups`) unless `open` holds it. The original document is
 * not touched; with no loose property it is returned as it is.
 */
export function withImplicitGroups(doc: EmDocument, open: ReadonlySet<string> = new Set(),
                                   groupName: (unitName: string) => string = paradataGroupName): EmDocument {
  const gs = implicitGroups(doc);
  if (!gs.length) return doc;
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const nodes: EmNode[] = [];
  const edges: EmEdge[] = [];
  const folded: string[] = [];
  for (const g of gs) {
    if (g.implicit) {
      const unit = byId.get(g.unit);
      nodes.push({ id: g.group, node_type: "ParadataNodeGroup", name: groupName(String(unit?.name ?? g.unit)),
        data: { implicit_view: true, unit: g.unit } } as EmNode);
      edges.push({ id: `${g.group}#has`, source: g.unit, target: g.group, edge_type: HAS_PARADATA_NODEGROUP,
        attributes: { implicit_view: true } } as EmEdge);
      if (!open.has(g.group)) folded.push(g.group);
    }
    for (const m of [...g.properties, ...g.chain])
      edges.push({ id: `${g.group}#in#${m}`, source: m, target: g.group, edge_type: IS_IN_PARADATA_NODEGROUP,
        attributes: { implicit_view: true, ...(g.implicit ? {} : { outside: true }) } } as EmEdge);
  }
  return {
    ...doc,
    graph: { ...doc.graph, nodes: [...doc.graph.nodes, ...nodes], edges: [...doc.graph.edges, ...edges] },
    layout: { ...(doc.layout ?? {}), folded_groups: [...(doc.layout?.folded_groups ?? []), ...folded] },
  } as EmDocument;
}

/** The members the view put in a REAL group from outside it («fuori dal gruppo»). */
export function outsideMembers(viewDoc: EmDocument, groupId: string): Set<string> {
  const s = new Set<string>();
  for (const e of viewDoc.graph.edges)
    if (e.target === groupId && e.edge_type === IS_IN_PARADATA_NODEGROUP && attrs(e).implicit_view && attrs(e).outside) s.add(e.source);
  return s;
}
