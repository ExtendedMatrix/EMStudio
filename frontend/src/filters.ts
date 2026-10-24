// MICRO-FILTRI-DETTAGLIATI · the «Detail level» filter: FAMILIES of node and
// edge types, two levels deep (family → the datamodel's types). The grouping is
// the table of detail-families.ts; the types, their labels and descriptions are
// the datamodel's (rules.ts). What the panel switches is a LEAF — one node type
// (`n:<type>`) or one edge type (`e:<type>`), plus `n:*` / `e:*` for the types a
// document carries and the datamodel does not know. Structural types (group
// boxes, epochs, membership edges) have no leaf: they carry the drawing and are
// never filtered — the panel lists and counts them all the same.
//
// This replaced the eleven «circles of detail» (real, virtual, continuity,
// paradata, authors & licences, links & other; temporal, paradata, author,
// other, generic edges): every view's defaults and every template show, type by
// type, what the circles showed (check-detail-families).
import {
  EDGE_FAMILY_TABLE,
  type EdgeFamilyKey,
  NODE_FAMILY_TABLE,
  type NodeFamilyKey,
  TEMPLATE_TABLE,
} from "./detail-families";
import {
  canonicalEdgeType,
  classAncestorsOf,
  classOf,
  edgeEndpointsRaw,
  edgeTypeNames,
  GENERIC_EDGE,
  typesOfClass,
} from "./rules";
import type { ViewKind } from "./types";

export type { EdgeFamilyKey, NodeFamilyKey } from "./detail-families";
export type FamilyKey = NodeFamilyKey | EdgeFamilyKey;

/** the leaf a type the datamodel does not know falls in («Other») */
export const UNKNOWN_NODE_LEAF = "n:*";
export const UNKNOWN_EDGE_LEAF = "e:*";

export interface Family {
  key: FamilyKey;
  kind: "node" | "edge";
  /** i18n key of the family's label */
  label: string;
  /** the datamodel's types in this family (node_types or edge names), table order */
  types: string[];
  /** the types among them that are structure (never switched off) */
  structural: ReadonlySet<string>;
  /** sub-families (edges only): a heading over their types, i18n `<label>.<key>` */
  subfamilies?: ReadonlyArray<{ key: string; types: string[] }>;
  /** views whose panel does not list the family */
  hiddenIn?: ReadonlyArray<ViewKind>;
}

// ---- node families ----------------------------------------------------------
const DATAMODEL_NODE_TYPES: string[] = typesOfClass("Node");
const KNOWN_NODE_TYPES: ReadonlySet<string> = new Set(DATAMODEL_NODE_TYPES);
const CLASS_TO_NODE_FAMILY = new Map<string, NodeFamilyKey>();
for (const f of NODE_FAMILY_TABLE) for (const c of f.classes) CLASS_TO_NODE_FAMILY.set(c, f.key);

function nodeFamilyOfKnown(nodeType: string): NodeFamilyKey {
  // nearest named class of the type's ancestry (the class itself first)
  for (const c of classAncestorsOf(classOf(nodeType))) {
    const f = CLASS_TO_NODE_FAMILY.get(c);
    if (f) return f;
  }
  return "other";
}

/** The family of a node type — always one («Other» for what the table does
 *  not name, or a type the datamodel does not know). */
export function nodeFamilyOf(nodeType: string | undefined): NodeFamilyKey {
  const t = nodeType ?? "";
  return KNOWN_NODE_TYPES.has(t) ? nodeFamilyOfKnown(t) : "other";
}

function isStructuralNodeType(nodeType: string): boolean {
  const def = NODE_FAMILY_TABLE.find((f) => f.key === nodeFamilyOf(nodeType));
  if (!def?.structural?.length) return false;
  const anc = classAncestorsOf(classOf(nodeType));
  // the nearest named class decides: a ParadataNodeGroup is a GroupNode too
  const nearest = anc.find((c) => CLASS_TO_NODE_FAMILY.has(c));
  return !!nearest && def.structural.includes(nearest);
}

/** The leaf the panel switches for a node type, or null when it is structure. */
export function nodeLeaf(nodeType: string | undefined): string | null {
  const t = nodeType ?? "";
  if (!KNOWN_NODE_TYPES.has(t)) return UNKNOWN_NODE_LEAF;
  return isStructuralNodeType(t) ? null : `n:${t}`;
}

// ---- edge families ----------------------------------------------------------
const EDGE_TO_FAMILY = new Map<string, EdgeFamilyKey>();
for (const f of EDGE_FAMILY_TABLE) for (const e of f.edges) EDGE_TO_FAMILY.set(e, f.key);
const DATAMODEL_EDGE_TYPES: string[] = [...edgeTypeNames(), GENERIC_EDGE];
const KNOWN_EDGE_TYPES: ReadonlySet<string> = new Set(DATAMODEL_EDGE_TYPES);

/** The family of an edge type (an older spelling reads as the relation it spells). */
export function edgeFamilyOf(edgeType: string | undefined): EdgeFamilyKey {
  return EDGE_TO_FAMILY.get(canonicalEdgeType(edgeType)) ?? "other";
}

/** The leaf the panel switches for an edge type, or null when it is structure
 *  (the membership edges that build the containers). */
export function edgeLeaf(edgeType: string | undefined): string | null {
  const t = canonicalEdgeType(edgeType);
  if (!KNOWN_EDGE_TYPES.has(t)) return UNKNOWN_EDGE_LEAF;
  const def = EDGE_FAMILY_TABLE.find((f) => f.key === edgeFamilyOf(t));
  return def?.structural?.includes(t) ? null : `e:${t}`;
}

// ---- the families as the panel lists them ----------------------------------
export const NODE_FAMILIES: Family[] = NODE_FAMILY_TABLE.map((f) => ({
  key: f.key,
  kind: "node" as const,
  label: `fam.n.${f.key}`,
  types: DATAMODEL_NODE_TYPES.filter((t) => nodeFamilyOfKnown(t) === f.key),
  structural: new Set(DATAMODEL_NODE_TYPES.filter((t) => nodeFamilyOfKnown(t) === f.key && isStructuralNodeType(t))),
}));
export const EDGE_FAMILIES: Family[] = EDGE_FAMILY_TABLE.map((f) => ({
  key: f.key,
  kind: "edge" as const,
  label: `fam.e.${f.key}`,
  // the table's order, then what the datamodel adds and no row names («Other»)
  types: f.key === "other"
    ? DATAMODEL_EDGE_TYPES.filter((t) => !EDGE_TO_FAMILY.has(t))
    : f.edges.filter((t) => KNOWN_EDGE_TYPES.has(t)),
  structural: new Set(f.structural ?? []),
  ...(f.subfamilies ? { subfamilies: f.subfamilies.map((x) => ({ key: x.key, types: x.edges.filter((t) => KNOWN_EDGE_TYPES.has(t)) })) } : {}),
  ...(f.hiddenIn ? { hiddenIn: f.hiddenIn } : {}),
}));

/** MICRO-CRONO-MULTIPLA · where an edge comes from, as far as the data says it:
 *  `derived` — s3Dgraphy's own mark of a computed edge (`attributes.derived`, the
 *  one it writes on propagated properties); `imported` — the GraphML importer
 *  keeps the yEd edge it read (`attributes.original_edge_id`); `unmarked` — the
 *  edge says nothing (drawn here, or from a file that does not tell). The data
 *  has no mark for «written by the user»: unmarked is not «the user's». */
export type EdgeOrigin = "derived" | "imported" | "unmarked";
export function edgeOrigin(e: { attributes?: unknown; [k: string]: unknown }): EdgeOrigin {
  const a = (e.attributes ?? {}) as Record<string, unknown>;
  if (a.derived === true || a.derived === "true") return "derived";
  if (a.original_edge_id != null && a.original_edge_id !== "") return "imported";
  return "unmarked";
}

/** every leaf of a family (its switchable types, «Other» with its wildcard) */
export function familyLeaves(f: Family): string[] {
  const p = f.kind === "node" ? "n:" : "e:";
  const out = f.types.filter((t) => !f.structural.has(t)).map((t) => p + t);
  if (f.key === "other") out.push(f.kind === "node" ? UNKNOWN_NODE_LEAF : UNKNOWN_EDGE_LEAF);
  return out;
}

const ALL_LEAVES: string[] = [...NODE_FAMILIES, ...EDGE_FAMILIES].flatMap(familyLeaves);

// ---- defaults per view, templates ------------------------------------------
function defaultOn(view: "matrix" | "graph", def: { matrix: boolean; graph: boolean; matrixExcept?: string[] }, type: string): boolean {
  if (view === "graph") return def.graph;
  return def.matrixExcept?.includes(type) ? !def.matrix : def.matrix;
}

/** The leaves visible by default in a view. The Matrix hides the outer ring;
 *  Graph and DTC show it — the DTC substrate IS resources and links, so the
 *  projection would be empty under the Matrix defaults. «Graphs paradata» (and
 *  the multigraph) turn everything on: "show me everything attached to this
 *  graph" is the point of that view, and a family left off would silently hide
 *  what it came to find. */
export function defaultVisibleLeaves(view: ViewKind): Set<string> {
  if (view === "multigraph" || view === "graphs") return new Set(ALL_LEAVES);
  const v = view === "matrix" ? "matrix" : "graph";
  const out = new Set<string>();
  for (const f of NODE_FAMILY_TABLE) {
    const fam = NODE_FAMILIES.find((x) => x.key === f.key)!;
    for (const leaf of familyLeaves(fam)) if (defaultOn(v, f, leaf.slice(2))) out.add(leaf);
  }
  for (const f of EDGE_FAMILY_TABLE) {
    const fam = EDGE_FAMILIES.find((x) => x.key === f.key)!;
    for (const leaf of familyLeaves(fam)) if (defaultOn(v, f, leaf.slice(2))) out.add(leaf);
  }
  return out;
}

/** Detail-level presets at the top of the panel — one click sets every leaf. */
export interface DetailTemplate {
  key: string;
  /** i18n key */
  label: string;
  leaves: ReadonlySet<string>;
}
export const TEMPLATES: DetailTemplate[] = TEMPLATE_TABLE.map((tp) => {
  const leaves = new Set<string>();
  for (const k of tp.nodeFamilies) for (const l of familyLeaves(NODE_FAMILIES.find((f) => f.key === k)!)) leaves.add(l);
  for (const k of tp.edgeFamilies) for (const l of familyLeaves(EDGE_FAMILIES.find((f) => f.key === k)!)) leaves.add(l);
  for (const t of tp.nodeTypes ?? []) { const l = nodeLeaf(t); if (l) leaves.add(l); }
  for (const t of tp.edgeTypes ?? []) { const l = edgeLeaf(t); if (l) leaves.add(l); }
  return { key: tp.key, label: tp.label, leaves };
});

/** the family (node or edge) a leaf belongs to */
export function familyOfLeaf(leaf: string): Family | undefined {
  const kind = leaf.startsWith("n:") ? "node" : "edge";
  const t = leaf.slice(2);
  if (t === "*") return (kind === "node" ? NODE_FAMILIES : EDGE_FAMILIES).find((f) => f.key === "other");
  const key = kind === "node" ? nodeFamilyOf(t) : edgeFamilyOf(t);
  return (kind === "node" ? NODE_FAMILIES : EDGE_FAMILIES).find((f) => f.key === key);
}

// ---- ornament (adornment) classification — the ONE source (BADGE1) ----------
// author / license / embargo are annotations of a referent, not stratigraphic
// elements: the view collapses them into badges attached to the referent instead
// of boxes joined by edges. "Is it an ornament?" is answered HERE, anchored to
// the `rights` family, so the filter and the collapse cannot disagree.
const ORNAMENT_CLASSES: ReadonlySet<string> = new Set([
  "AuthorNode",
  "AuthorAINode",
  "LicenseNode",
  "EmbargoNode",
]);

/** True for a node type that is a pure annotation of a referent (author /
 *  author_ai / license / embargo). Same answer as the `rights` family — one
 *  source of truth. */
export function isAdornmentNodeType(nodeType: string | undefined): boolean {
  return nodeFamilyOf(nodeType) === "rights";
}

/**
 * Edge types that ATTACH an ornament to its referent, DERIVED from the
 * connections datamodel — never hardcoded. The rule: the edge's target is
 * exclusively ornament classes AND its source admits a content class (anything
 * that is neither an ornament nor NarrativeNode). That yields exactly
 * `has_author` / `has_license` / `has_embargo` and, crucially, EXCLUDES
 * `validated_by` — whose target is AuthorNode too, but whose source is
 * NarrativeNode only: that edge is a narrative endorsement, not an attribution,
 * and must keep drawing (narrative-authorship.ts still reads it).
 *
 * The ornament is always the edge's TARGET and the referent its SOURCE, verified
 * for all three against the datamodel (see the BADGE1 report).
 */
export const ADORNMENT_EDGE_TYPES: ReadonlySet<string> = new Set(
  edgeTypeNames().filter((name) => {
    const { source, target } = edgeEndpointsRaw(name);
    const targetIsOrnament =
      target.length > 0 && target.every((c) => ORNAMENT_CLASSES.has(c));
    const sourceHasContent = source.some(
      (c) => !ORNAMENT_CLASSES.has(c) && c !== "NarrativeNode",
    );
    return targetIsOrnament && sourceHasContent;
  }),
);
