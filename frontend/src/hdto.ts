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
 * Giro dell'11 ottobre (E.D., 11 Oct 2026):
 *
 * * the SAGGIO is a study and a place: a `LocationNodeGroup` (kind `study`)
 *   `is_in_location` the site, the study took place at it;
 * * a place is TOPOGRAPHY, not Heritage Digital Twin: it is never part of the
 *   HDT-O layer, and the Matrix draws no place as a box (the nodes and their
 *   memberships stay in the graph);
 * * the code is the STUDY's: the graph's «EM-ID» (`GraphNode.data.em_id`) is
 *   retired, read only to be shown migrated (`emIdMigration`).
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
  /** the ids of every node in the chain, its place included (the card) */
  ids: Set<string>;
  /** the HDT-O layer of the Graph view: the chain WITHOUT its place — study,
   *  HC1, twin, project, proposition set. A place is topography, drawn as
   *  every place is (E.D., 11 Oct 2026). */
  layerIds: Set<string>;
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
  const layerIds = new Set<string>();
  const empty: HdtoChain = { study: null, place: null, about: null, parent: null,
                             twin: null, project: null, ids, layerIds };
  if (!doc?.graph) return empty;
  for (const n of doc.graph.nodes)
    if (HDTO_ROLES.includes(dataOf(n).hdto_role as HdtoRole)) ids.add(n.id);
  for (const id of ids) layerIds.add(id);
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
    layerIds,
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
 * What a view leaves out of the HDT-O layer: the ids of `nodes` to drop. The
 * stratigraphic views always drop the HDT-O profile types and the role-marked
 * nodes (they live in the em.json, not on the matrix); with `layerOn` (the
 * Graph view's toggle) the chain's own nodes are kept — study, HC1, HC2,
 * project, proposition set. A PLACE is never part of it (E.D., 11 Oct 2026:
 * «un luogo è topografia, non Heritage Digital Twin»), empty or not: the site
 * the panel makes is a LocationNodeGroup like the others, and the views treat
 * it as they treat every place.
 */
export function hdtoDropped(doc: EmDocument, nodes: EmNode[], hiddenTypes: Set<string>,
                            layerOn: boolean): Set<string> {
  const layer = hdtoChain(doc).layerIds;
  const loc = placeNodeType();
  const drop = new Set<string>();
  for (const n of nodes) {
    if (n.node_type === loc) continue;
    const isHdto = hiddenTypes.has(n.node_type) || !!dataOf(n).hdto_role;
    if (isHdto && !(layerOn && layer.has(n.id))) drop.add(n.id);
  }
  return drop;
}

// ── the saggio and the site (11 Oct 2026) ───────────────────────────────────

/** A site: the place pyArchInit's projector (or this panel) makes for it,
 *  `level: sito`. */
export function isSite(n: EmNode | undefined): boolean {
  return !!n && n.node_type === placeNodeType() && dataOf(n).level === "sito";
}

/** The other dimensions of pyArchInit's study plane: places too, but an area
 *  or a sector is not where a study took place. */
const NOT_A_SAGGIO = new Set(["area", "settore", "quad_par"]);

/** A saggio (a trench, a sondage). Measured on a projected graph (11 Oct
 *  2026), pyArchInit gives it in two forms, often both: the importer's place
 *  `loc::saggio::study::<name>` and the projector's group `group_kind:
 *  saggio`. A place of the study plane made by hand (`kind: study`, no
 *  pyArchInit dimension) is one too; an area or a sector is not. */
export function isSaggio(n: EmNode | undefined): boolean {
  if (!n || n.node_type !== placeNodeType()) return false;
  const d = dataOf(n);
  if (d.group_kind === "saggio" || n.id.startsWith("loc::saggio::")) return true;
  if (d.kind !== "study") return false;
  const gk = text(d.group_kind);
  if (gk && NOT_A_SAGGIO.has(gk)) return false;
  return !/^loc::(area|settore|quad_par)::/.test(n.id) && !gk;
}

/** What «Where it took place» proposes: the sites of the graph, then its
 *  saggi — the other places (comune, region, a functional room) are not where
 *  a study took place. */
export function studyPlaceChoices(doc: EmDocument | null | undefined): EmNode[] {
  const places = placesIn(doc);
  return [...places.filter(isSite), ...places.filter(isSaggio)];
}

/** The site a saggio is in, up `is_in_location`, if it is in one. */
export function siteOf(doc: EmDocument, place: EmNode): EmNode | undefined {
  const up = withinEdgeType();
  const seen = new Set([place.id]);
  let cur: EmNode | undefined = place;
  while (cur) {
    const next: EmNode | undefined = outgoing(doc, cur.id, up)
      .find((n) => n.node_type === place.node_type && !seen.has(n.id));
    if (!next) return undefined;
    if (isSite(next)) return next;
    seen.add(next.id);
    cur = next;
  }
  return undefined;
}

/** The edge type of «a place is in a place» (`is_in_location`), from the
 *  datamodel. */
export function withinType(): string | undefined {
  return withinEdgeType();
}

// ── the retired EM-ID (11 Oct 2026) ─────────────────────────────────────────

/** The graph's retired «EM-ID» (`GraphNode.data.em_id`), or null. */
export function legacyEmId(doc: EmDocument | null | undefined): string | null {
  const root = (doc?.graph?.nodes ?? []).find((n) => classOf(n.node_type) === "GraphNode");
  return text(dataOf(root).em_id) || null;
}

/**
 * s3dgraphy's `migrate_em_id`, READ — nothing is written here: the em_id goes
 * to the study's code only when there is a study and it has no code; no study
 * is made for a code, a code is never overridden. `code` is what the study's
 * code is, or would be after the migration.
 */
export function emIdMigration(doc: EmDocument | null | undefined): {
  emId: string | null; code: string | null; migrated: boolean;
  reason: "no em_id" | "no study" | "study has its code" | "study has another code" | "migrated";
} {
  const emId = legacyEmId(doc);
  const study = roleNode(doc, "study");
  const own = text(dataOf(study).code);
  if (!emId) return { emId, code: own || null, migrated: false, reason: "no em_id" };
  if (!study) return { emId, code: null, migrated: false, reason: "no study" };
  if (own) return { emId, code: own, migrated: false,
                    reason: own === emId ? "study has its code" : "study has another code" };
  return { emId, code: emId, migrated: true, reason: "migrated" };
}

/** The code a view shows: the study's (`studyCode`), or the em_id it migrates
 *  to (`emIdMigration`). */
export function shownCode(doc: EmDocument | null | undefined): string | null {
  const m = emIdMigration(doc);
  return studyCode(doc) ?? (m.migrated ? m.code : null);
}
