/**
 * THE HDT-O CHAIN OF A GRAPH, READ — the study, its place, the heritage it is
 * about, the twin of that heritage. Pure: a document in, data out, no DOM and
 * no store, so the Study panel, the inspector's card, the narrative and the
 * Graph view's layer read the SAME chain and cannot disagree about it.
 *
 * MICRO «lo studio, il suo luogo, il suo codice» (E.D., 10 Oct 2026):
 *
 * * the stratigraphic trench is a STUDY (HC9; crmarchaeo:A9 too when it is an
 *   excavation — `data.study_kind`, from the datamodel);
 * * the site is TOPOGRAPHY: a `LocationNodeGroup`, the last link of the toponym
 *   chain, reached from the study by `study_took_place_at` (crm:P7);
 * * HC1 is heritage where it is RECOGNISED, with an identity of its own, and is
 *   never made by default;
 * * the study code (GT16) is the source's or the user's, never derived, and it
 *   lives on the study (`data.code`).
 *
 * This is the reader of what `DocumentStore.applyHdto` writes and of what
 * s3dgraphy's `hdto.declare_hdto` writes — the same roles, the same node types,
 * the same edges (`scripts/check-studio-luogo.mjs` compares the two). Edge and
 * node types are resolved from the vendored datamodel, never spelled here.
 */

import nodeDatamodel from "./assets/s3Dgraphy_node_datamodel.json";
import { classOf, edgeTypeFor, nodeTypeForClass } from "./rules";
import { sha1Hex } from "./sha1";
import type { EmDocument, EmEdge, EmNode } from "./types";

/** The per-graph singletons, marked in `data.hdto_role`. The PLACE is not one
 *  of them: it is topography the graph may already have (pyArchInit's site),
 *  found through the study's `study_took_place_at`, and s3dgraphy does not
 *  mark it either. */
export type HdtoRole =
  | "proposition_set" // GraphNode (HC16)
  | "about" // HeritageEntityNode (HC1) — the subject
  | "parent" // HeritageEntityNode (HC1) — the optional whole
  | "twin" // HDTNode (HC2)
  | "study" // StudyNode (HC9)
  | "project"; // ProjectNode (HC13)

export const HDTO_ROLES: readonly HdtoRole[] = [
  "proposition_set", "about", "parent", "twin", "study", "project",
];

const text = (v: unknown): string => (v == null ? "" : String(v).trim());
const dataOf = (n: EmNode | undefined): Record<string, unknown> =>
  (n?.data ?? {}) as Record<string, unknown>;

/** The node type of a place, and the two edges a place is reached by — read
 *  from the datamodel (`allowed_connections`), not spelled. */
export function placeNodeType(): string | undefined {
  return nodeTypeForClass("LocationNodeGroup");
}
export function placeEdgeType(): string | undefined {
  return edgeTypeFor(nodeTypeForClass("StudyNode"), placeNodeType());
}
function withinEdgeType(): string | undefined {
  const loc = placeNodeType();
  return edgeTypeFor(loc, loc);
}

/** The values `StudyNode.data.study_kind` may take — the datamodel's enum
 *  (`hdto_nodes.StudyNode.fields.study_kind.values`), in its order. */
export function studyKinds(): string[] {
  const f = (nodeDatamodel as unknown as {
    hdto_nodes?: { StudyNode?: { fields?: { study_kind?: { values?: unknown } } } };
  }).hdto_nodes?.StudyNode?.fields?.study_kind?.values;
  return Array.isArray(f) ? f.map(String) : [];
}

/**
 * s3dgraphy's `hdto.site_place_id`: the id of the LocationNodeGroup of a site,
 * so the place EMStudio makes and the one pyArchInit's projector makes are ONE
 * node. The source's identity when there is one (`entity_uuid`), otherwise
 * `sha1("<site>|site")[:32]` — the `|site` suffix keeps a site apart from the
 * comune it is often named after (Volterra in Volterra).
 */
export function sitePlaceId(site: string, entityUuid?: string | null): string {
  if (text(entityUuid)) return text(entityUuid);
  return sha1Hex(`${text(site)}|site`).slice(0, 32);
}

/** The node s3dgraphy's `make_site_place` makes, as the em.json carries it:
 *  kind `toponym`, level `sito`, and the propagation the LocationNodeGroup
 *  constructor gives. */
export function makeSitePlace(site: string, entityUuid?: string | null): EmNode | undefined {
  const nt = placeNodeType();
  if (!nt) return undefined;
  const id = sitePlaceId(site, entityUuid);
  const data: Record<string, unknown> = {
    kind: "toponym", propagation: "additive", group_kind: "toponym",
    level: "sito", name: text(site), group_uuid: id,
  };
  if (text(entityUuid)) data.entity_uuid = text(entityUuid);
  return { id, name: text(site), node_type: nt, description: "Site", data };
}

/** The node carrying a role. The proposition set is the graph-self node, marked
 *  or not (the store's `graphRootNode`, read the same way s3dgraphy reads it). */
export function roleNode(doc: EmDocument | null | undefined, role: HdtoRole): EmNode | undefined {
  const nodes = doc?.graph?.nodes ?? [];
  const byRole = nodes.find((n) => dataOf(n).hdto_role === role);
  if (byRole || role !== "proposition_set") return byRole;
  return nodes.find((n) => classOf(n.node_type) === "GraphNode");
}

function outgoing(doc: EmDocument, id: string, edgeType: string | undefined): EmNode[] {
  if (!edgeType) return [];
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  return doc.graph.edges
    .filter((e: EmEdge) => e.source === id && e.edge_type === edgeType)
    .map((e) => byId.get(e.target))
    .filter((n): n is EmNode => !!n);
}

/** The places of the graph a study can be said to have taken place at: every
 *  LocationNodeGroup it holds (the toponym chain, the areas), named. */
export function placesIn(doc: EmDocument | null | undefined): EmNode[] {
  const nt = placeNodeType();
  return (doc?.graph?.nodes ?? []).filter((n) => n.node_type === nt);
}

/** The study's place, if it has one: the target of its `study_took_place_at`. */
export function studyPlace(doc: EmDocument | null | undefined): EmNode | undefined {
  const study = roleNode(doc, "study");
  if (!doc || !study) return undefined;
  const loc = placeNodeType();
  return outgoing(doc, study.id, placeEdgeType()).find((n) => n.node_type === loc);
}

export interface ChainPlace {
  id: string;
  name: string;
  level: string | null;
  /** the places it is in, up `is_in_location`: comune, province, region… */
  within: { id: string; name: string; level: string | null }[];
}
export interface ChainHeritage {
  id: string;
  name: string;
  /** the first authority link, when there is one */
  uri: string | null;
  authority: string | null;
  label: string | null;
}
export interface HdtoChain {
  study: {
    id: string; name: string; code: string | null; studyKind: string | null;
    authors: string | null; date: string | null;
  } | null;
  place: ChainPlace | null;
  about: ChainHeritage | null;
  parent: ChainHeritage | null;
  twin: { id: string; name: string; state: "provisional" | "registered"; key: string | null } | null;
  project: { id: string; name: string } | null;
  /** the ids of every node in the chain (the Graph view's layer) */
  ids: Set<string>;
}

function heritage(n: EmNode | undefined): ChainHeritage | null {
  if (!n) return null;
  const refs = Array.isArray(dataOf(n).authority_refs)
    ? (dataOf(n).authority_refs as Record<string, unknown>[]) : [];
  const first = refs.find((r) => text(r?.uri));
  return {
    id: n.id, name: text(n.name),
    uri: first ? text(first.uri) : null,
    authority: first && text(first.authority) ? text(first.authority) : null,
    label: first && text(first.label) ? text(first.label) : null,
  };
}

/** s3dgraphy's `read_hdto`, for a document: whatever is missing is null. */
export function hdtoChain(doc: EmDocument | null | undefined): HdtoChain {
  const ids = new Set<string>();
  const empty: HdtoChain = { study: null, place: null, about: null, parent: null,
                             twin: null, project: null, ids };
  if (!doc?.graph) return empty;
  for (const n of doc.graph.nodes)
    if (HDTO_ROLES.includes(dataOf(n).hdto_role as HdtoRole)) ids.add(n.id);
  const study = roleNode(doc, "study");
  const sd = dataOf(study);
  const place = studyPlace(doc);
  let placeView: ChainPlace | null = null;
  if (place) {
    ids.add(place.id);
    const within: ChainPlace["within"] = [];
    const seen = new Set([place.id]);
    let cur: EmNode | undefined = place;
    const up = withinEdgeType();
    while (cur) {
      const next: EmNode | undefined = outgoing(doc, cur.id, up)
        .find((n) => n.node_type === place.node_type && !seen.has(n.id));
      if (!next) break;
      seen.add(next.id);
      within.push({ id: next.id, name: text(next.name), level: text(dataOf(next).level) || null });
      cur = next;
    }
    placeView = { id: place.id, name: text(place.name),
                  level: text(dataOf(place).level) || null, within };
  }
  const twin = roleNode(doc, "twin");
  const key = text(dataOf(twin).heritage_entity_iri);
  const project = roleNode(doc, "project");
  return {
    study: study ? {
      id: study.id, name: text(study.name),
      code: text(sd.code) || null,
      studyKind: text(sd.study_kind) || null,
      authors: text(sd.authors) || null,
      date: text(sd.date) || null,
    } : null,
    place: placeView,
    about: heritage(roleNode(doc, "about")),
    parent: heritage(roleNode(doc, "parent")),
    twin: twin ? { id: twin.id, name: text(twin.name),
                   state: key ? "registered" : "provisional", key: key || null } : null,
    project: project ? { id: project.id, name: text(project.name) } : null,
    ids,
  };
}

/** True when the graph has an HDT-O chain at all (a study or an HC1). */
export function hasChain(c: HdtoChain): boolean {
  return !!(c.study || c.about);
}

/**
 * s3dgraphy's `study_code`: the short name of the study, or null. ONE source,
 * the study's `data.code`; a GraphML header's `graph_code` only when no study
 * says one, and never its `MISSINGCODE` placeholder. Nothing is derived.
 */
export function studyCode(doc: EmDocument | null | undefined): string | null {
  const own = text(dataOf(roleNode(doc, "study")).code);
  if (own) return own;
  const legacy = text((doc?.graph as Record<string, unknown> | undefined)?.graph_code);
  return legacy && legacy !== "MISSINGCODE" ? legacy : null;
}

/** A name with its code beside it, when there is one: «Templu Mare (GT16)». */
export function withCode(name: string, code: string | null | undefined): string {
  const c = text(code);
  if (!c || name.includes(`(${c})`)) return name;
  return name ? `${name} (${c})` : c;
}

/**
 * What a view leaves out of the HDT-O layer (MICRO studio-luogo, part D): the
 * ids of `nodes` to drop. The stratigraphic views always drop the HDT-O profile
 * types and the role-marked nodes (they live in the em.json, not on the
 * matrix), and with them the study's PLACE when it is the panel's own site with
 * no member — a place of the toponym chain holding units is topography the
 * views already draw, and stays. With `layerOn` (the Graph view's toggle) the
 * chain's own nodes are kept: study, place, HC1, HC2, project, proposition set.
 */
export function hdtoDropped(doc: EmDocument, nodes: EmNode[], hiddenTypes: Set<string>,
                            memberCount: (id: string) => number,
                            layerOn: boolean): Set<string> {
  const chain = hdtoChain(doc).ids;
  const drop = new Set<string>();
  for (const n of nodes) {
    const isHdto = hiddenTypes.has(n.node_type) || !!dataOf(n).hdto_role ||
      (chain.has(n.id) && memberCount(n.id) === 0);
    if (isHdto && !(layerOn && chain.has(n.id))) drop.add(n.id);
  }
  return drop;
}
