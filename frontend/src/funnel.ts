// FUNNEL1 · Data Funnel — propagative property resolution (EM 1.5 manual
// "Data Funnel"): a propagable property resolves from the MOST SPECIFIC to the
// most general, FIRST non-null wins (SUBSTITUTIVE). In EMStudio the chain is
//
//     Node → Activity (group) → Epoch (swimlane) → Canvas (header)
//
// mirroring the canonical s3dgraphy resolver `resolve_with_source`
// (property_resolver.py: node > swimlane > graph, first non-null, with a
// `source` label) and EMtools' DP-32 `resolve_propagative_property`. EMStudio
// adds the **Activity** tier between node and epoch and, since EM 1.6 formalises
// AuthorNode/LicenseNode/EmbargoNode as PDG members (PDMEM1), it READS the
// node/swimlane values that s3dgraphy's builtin getters still stub to None
// (pending DP-51). See the parity TODO at the bottom.
//
// The funnel RESOLVES; it never MATERIALISES — em.json is untouched, no
// inherited value is ever written onto a node (E.D. / the manual).
import type { EmDocument } from "./types";
import { t } from "./i18n";

/** Rule ids, kept general so the two temporal properties (already propagative in
 *  the manual) drop in without touching the resolver. Primary set for badges =
 *  author / license / embargo. */
export type RuleId =
  | "author"
  | "license"
  | "embargo"
  | "absolute_time_start"
  | "absolute_time_end";

/** The four funnel scopes, most-specific first. */
export type Scope = "node" | "activity" | "epoch" | "canvas";

export interface Effective {
  /** the resolved value, or null when nothing in the chain declares it */
  value: string | null;
  /** which scope supplied it, or null when unresolved */
  source: Scope | null;
  /** true when the value is declared on the NODE's own scope (source === node) */
  explicit: boolean;
}

/** ornament node_types that satisfy a rule id (the value = the member's name). */
const RULE_NODE_TYPES: Record<string, string[]> = {
  author: ["author", "author_ai"],
  license: ["license"],
  embargo: ["embargo"],
};

type Node = EmDocument["graph"]["nodes"][number];
type Edge = EmDocument["graph"]["edges"][number];

const nodeName = (n: Node | undefined): string | null =>
  n && n.name != null && String(n.name).trim() !== "" ? String(n.name) : null;

/**
 * The value a SCOPE declares for a rule — the SINGLE place that reads a scope
 * (invariant FUNNEL1: one reader per scope). Since MIG1-A / DP-65 ALL four
 * scopes read the same way: the ornament (or temporal property) that is a
 * MEMBER of the scope owner's ParadataNodeGroup (`is_in_paradata_nodegroup` ←
 * the owner's `has_paradata_nodegroup`).
 *
 *  - node / activity / epoch (A2): the owner is the scope node itself. An author
 *    in the epoch's PDG IS the epoch's authorship declaration.
 *  - canvas (A1): the owner is the GRAPH-SELF node (node_type `graph`), which
 *    anchors the graph-scope PDG (DP-65). MIG1-A removed the legacy
 *    `graph.data['author_name'|…]` / top-level branch — the graph-scope member
 *    nodes are now the single truth of the canvas tier.
 */
export function readScopeValue(
  doc: EmDocument,
  scope: Scope,
  scopeNodeId: string | null,
  ruleId: RuleId,
  ix?: FunnelIndex,
): string | null {
  if (ix) return readIndexed(ix, scope, scopeNodeId, ruleId);
  const g = doc.graph;
  // canvas: resolve the owner to the graph-self node; every scope then reads
  // its PDG members through the one code path below.
  const ownerId =
    scope === "canvas"
      ? (g.nodes.find((n) => n.node_type === "graph")?.id ?? null)
      : scopeNodeId;
  if (!ownerId) return null;
  // the owner's ParadataNodeGroup (has_paradata_nodegroup: owner → PDG)
  let pdgId: string | null = null;
  for (const e of g.edges)
    if (e.edge_type === "has_paradata_nodegroup" && e.source === ownerId) {
      pdgId = e.target;
      break;
    }
  if (!pdgId) return null;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const wantTypes = RULE_NODE_TYPES[ruleId];
  for (const e of g.edges) {
    if (e.edge_type !== "is_in_paradata_nodegroup" || e.target !== pdgId) continue;
    const m = byId.get(e.source);
    if (!m) continue;
    if (wantTypes) {
      if (wantTypes.includes(m.node_type)) return nodeName(m);
    } else if (m.node_type === "property") {
      // temporal rule: the property whose property_type matches; value in
      // description (EM convention) or the name fallback
      const pt = (m.data as Record<string, unknown> | undefined)?.property_type;
      if (pt === ruleId) {
        const d = m.description;
        return d != null && String(d).trim() !== "" ? String(d) : nodeName(m);
      }
    }
  }
  return null;
}

/**
 * GRAFO REATTIVO · the edges the funnel reads, indexed ONCE for a pass over many
 * nodes (the Matrix badges resolve every stratigraphic node × three rules × four
 * scopes, and each read scanned every edge: 2.5 s of a 5000-unit opening,
 * measured). The answers are the scan's: the FIRST `has_paradata_nodegroup` of
 * an owner, the members in edge order. Valid for the document as it was when
 * built — build one per pass, never keep it.
 */
export interface FunnelIndex {
  byId: Map<string, Node>;
  graphSelf: string | null;
  pdgOf: Map<string, string>;
  members: Map<string, Node[]>;
  activities: Map<string, string[]>;
  epoch: Map<string, string>;
}

export function funnelIndex(doc: EmDocument): FunnelIndex {
  const g = doc.graph;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const pdgOf = new Map<string, string>();
  const members = new Map<string, Node[]>();
  const activities = new Map<string, string[]>();
  const epoch = new Map<string, string>();
  for (const e of g.edges) {
    if (e.edge_type === "has_paradata_nodegroup") {
      if (!pdgOf.has(e.source)) pdgOf.set(e.source, e.target);
    } else if (e.edge_type === "is_in_paradata_nodegroup") {
      const m = byId.get(e.source);
      if (m) (members.get(e.target) ?? members.set(e.target, []).get(e.target)!).push(m);
    } else if (e.edge_type === "is_in_activity") {
      (activities.get(e.source) ?? activities.set(e.source, []).get(e.source)!).push(e.target);
    } else if (e.edge_type === "has_first_epoch") {
      if (!epoch.has(e.source)) epoch.set(e.source, e.target);
    }
  }
  const graphSelf = g.nodes.find((n) => n.node_type === "graph")?.id ?? null;
  return { byId, graphSelf, pdgOf, members, activities, epoch };
}

function readIndexed(ix: FunnelIndex, scope: Scope, scopeNodeId: string | null, ruleId: RuleId): string | null {
  const ownerId = scope === "canvas" ? ix.graphSelf : scopeNodeId;
  if (!ownerId) return null;
  const pdgId = ix.pdgOf.get(ownerId);
  if (!pdgId) return null;
  const wantTypes = RULE_NODE_TYPES[ruleId];
  for (const m of ix.members.get(pdgId) ?? []) {
    if (wantTypes) {
      if (wantTypes.includes(m.node_type)) return nodeName(m);
    } else if (m.node_type === "property") {
      const pt = (m.data as Record<string, unknown> | undefined)?.property_type;
      if (pt === ruleId) {
        const d = m.description;
        return d != null && String(d).trim() !== "" ? String(d) : nodeName(m);
      }
    }
  }
  return null;
}

/** ids of the ActivityNodeGroups that CONTAIN a node (is_in_activity). */
function activitiesOf(edges: Edge[], nodeId: string): string[] {
  const out: string[] = [];
  for (const e of edges)
    if (e.edge_type === "is_in_activity" && e.source === nodeId)
      out.push(e.target);
  return out;
}

/** the node's epoch (has_first_epoch: node → epoch), or null. */
function epochOf(edges: Edge[], nodeId: string): string | null {
  for (const e of edges)
    if (e.edge_type === "has_first_epoch" && e.source === nodeId) return e.target;
  return null;
}

/**
 * Resolve the EFFECTIVE value of a propagative property for a node, walking
 * Node → Activity → Epoch → Canvas and returning the FIRST non-null (substitutive
 * — the more specific scope overrides, no summing). `explicit` marks a value
 * declared on the node's own scope. Same shape as DP-32's
 * `resolve_propagative_property → (value, source)`.
 */
export function resolveEffective(
  doc: EmDocument,
  nodeId: string,
  ruleId: RuleId,
  ix?: FunnelIndex,
): Effective {
  const edges = doc.graph.edges;
  // 1 · node
  const own = readScopeValue(doc, "node", nodeId, ruleId, ix);
  if (own != null) return { value: own, source: "node", explicit: true };
  // 2 · activity (a node can be in several; first that declares wins)
  for (const a of ix ? (ix.activities.get(nodeId) ?? []) : activitiesOf(edges, nodeId)) {
    const v = readScopeValue(doc, "activity", a, ruleId, ix);
    if (v != null) return { value: v, source: "activity", explicit: false };
  }
  // 3 · epoch (swimlane)
  const ep = ix ? (ix.epoch.get(nodeId) ?? null) : epochOf(edges, nodeId);
  if (ep) {
    const v = readScopeValue(doc, "epoch", ep, ruleId, ix);
    if (v != null) return { value: v, source: "epoch", explicit: false };
  }
  // 4 · canvas (header)
  const cv = readScopeValue(doc, "canvas", null, ruleId, ix);
  if (cv != null) return { value: cv, source: "canvas", explicit: false };
  return { value: null, source: null, explicit: false };
}

/** The three badge rule ids, in display order. */
export const BADGE_RULES: RuleId[] = ["author", "license", "embargo"];

/** Human label for a source scope (tooltip: "proprio" / "da Epoca …"). */
export function sourceLabel(source: Scope | null): string {
  switch (source) {
    case "node":
      return t("funnel.ownSource");
    case "activity":
      return t("funnel.fromActivity");
    case "epoch":
      return t("funnel.fromEpoch");
    case "canvas":
      return t("funnel.fromCanvas");
    default:
      return "";
  }
}

// PARITY (s3dgraphy ↔ EMStudio): the canonical resolver lives in s3dgraphy
// (`resolvers/property_resolver.py::resolve_with_source` + `builtin_rules.py`).
// MIG1-A (DP-65) aligned the GRAPH tier on both sides: s3dgraphy's graph getters
// now read the AuthorNode/LicenseNode/EmbargoNode MEMBERS of the graph-scope
// ParadataNodeGroup owned by the GraphNode (the same shape this file reads for
// the canvas scope), and the legacy `graph.attributes`/`graph.data` reads are
// gone on both sides (clean cut). Residual divergence: EMStudio adds the
// Activity tier absent from s3dgraphy's node>swimlane>graph, and s3dgraphy's
// node/swimlane author getters still follow has_author edges (not PDG
// membership). Reconciling those two is the remaining parity work.
