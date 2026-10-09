// Contextual "circles of detail" filter (EM progressive disclosure).
// Each node / edge is assigned to a CIRCLE derived from the datamodel (never
// hardcoded): real stratigraphic units at the core, then virtual units, then
// paradata, with continuity as an orthogonal ring; authors/licenses and
// links/other split out. Edges split into temporal, paradata, author/license,
// other and generic. Structural things (group containers, epoch swimlanes,
// membership edges) are NOT filterable — they carry the drawing's structure —
// so they map to `null`.
import { MEMBERSHIP_EDGES } from "./folding";
import {
  ancestorsOf,
  classIsA,
  classOf,
  edgeEndpointClasses,
  edgeEndpointsRaw,
  edgeTypeNames,
  GENERIC_EDGE,
  isContinuityType,
  isGroupType,
  isParadataType,
  isStratigraphicType,
  isVirtualType,
} from "./rules";
import type { ViewKind } from "./types";

export type CircleKey =
  | "real"
  | "virtual"
  | "continuity"
  | "paradata_nodes"
  | "authors_licenses"
  | "links_other"
  | "edges_temporal"
  | "edges_paradata"
  | "edges_author"
  | "edges_other"
  | "edges_generic";

export interface Circle {
  key: CircleKey;
  label: string;
  kind: "node" | "edge";
  /** default visibility per view (Matrix hides the outer rings by default) */
  matrix: boolean;
  graph: boolean;
}

// Order = concentric rings, core first. The panel renders them top→down.
export const CIRCLES: Circle[] = [
  { key: "real", label: "Real stratigraphic units", kind: "node", matrix: true, graph: true },
  { key: "virtual", label: "Virtual stratigraphic units", kind: "node", matrix: true, graph: true },
  { key: "continuity", label: "Continuity (BR)", kind: "node", matrix: true, graph: true },
  { key: "paradata_nodes", label: "Paradata nodes", kind: "node", matrix: true, graph: true },
  // BADGE1 · author/license/embargo are no longer boxes but badges pinned to
  // their referent. MICRO-SOVRAPPOSIZIONI · this ring decides whether the
  // ornament NODES exist in the view (those still drawn as nodes: members of a
  // paradata group, every one in the multigraph); the BADGES are overlays,
  // switched in the Overlays menu (overlays.ts). Default ON in every view.
  { key: "authors_licenses", label: "Authors & licenses", kind: "node", matrix: true, graph: true },
  { key: "links_other", label: "Links & other", kind: "node", matrix: false, graph: true },
  { key: "edges_temporal", label: "Temporal edges", kind: "edge", matrix: true, graph: true },
  { key: "edges_paradata", label: "Paradata edges", kind: "edge", matrix: true, graph: true },
  { key: "edges_author", label: "Author & license edges", kind: "edge", matrix: false, graph: true },
  { key: "edges_other", label: "Other edges", kind: "edge", matrix: false, graph: true },
  { key: "edges_generic", label: "Generic edges", kind: "edge", matrix: false, graph: true },
];

const NODE_KEYS: CircleKey[] = [
  "real",
  "virtual",
  "continuity",
  "paradata_nodes",
  "authors_licenses",
  "links_other",
];
const EDGE_KEYS: CircleKey[] = [
  "edges_temporal",
  "edges_paradata",
  "edges_author",
  "edges_other",
  "edges_generic",
];

/** Detail-level presets applied at the top of the Detail panel — one click
 *  sets BOTH the node and edge rings. */
export interface DetailTemplate {
  key: string;
  label: string;
  circles: CircleKey[];
}
export const TEMPLATES: DetailTemplate[] = [
  { key: "full", label: "Full detail (all)", circles: [...NODE_KEYS, ...EDGE_KEYS] },
  {
    key: "harris",
    label: "Harris Matrix",
    circles: ["real", "continuity", "edges_temporal"],
  },
  {
    key: "em-compact",
    label: "EM compact",
    circles: ["real", "virtual", "continuity", "edges_temporal"],
  },
  {
    key: "em-complete",
    label: "EM complete",
    circles: [
      "real",
      "virtual",
      "continuity",
      "paradata_nodes",
      "edges_temporal",
      "edges_paradata",
    ],
  },
];

/** Which circle a node belongs to, or null if it is structural (group
 *  container / epoch swimlane) and therefore never filtered. */
export function nodeCircle(nodeType: string | undefined): CircleKey | null {
  if (isGroupType(nodeType)) {
    // a ParadataNodeGroup IS paradata — it hides/reveals with the paradata
    // ring; the other groups hold stratigraphic content and are structural.
    return classOf(nodeType) === "ParadataNodeGroup" ? "paradata_nodes" : null;
  }
  if (classOf(nodeType) === "EpochNode") return null; // swimlane
  if (isStratigraphicType(nodeType)) {
    if (isContinuityType(nodeType)) return "continuity";
    if (isVirtualType(nodeType)) return "virtual";
    return "real";
  }
  if (isParadataType(nodeType)) return "paradata_nodes";
  const anc = ancestorsOf(nodeType);
  if (
    anc.includes("AuthorNode") ||
    anc.includes("LicenseNode") ||
    anc.includes("EmbargoNode")
  )
    return "authors_licenses";
  return "links_other"; // links, geo-position, representations, … the rest
}

// ---- ornament (adornment) classification — the ONE source (BADGE1) ----------
// author / license / embargo are annotations of a referent, not stratigraphic
// elements: the view collapses them into badges attached to the referent instead
// of boxes joined by edges. "Is it an ornament?" is answered HERE, anchored to
// the `authors_licenses` circle, so the filter and the collapse cannot disagree.
const ORNAMENT_CLASSES: ReadonlySet<string> = new Set([
  "AuthorNode",
  "AuthorAINode",
  "LicenseNode",
  "EmbargoNode",
]);

/** True for a node type that is a pure annotation of a referent (author /
 *  author_ai / license / embargo). Same answer as the `authors_licenses`
 *  ring — one source of truth. */
export function isAdornmentNodeType(nodeType: string | undefined): boolean {
  return nodeCircle(nodeType) === "authors_licenses";
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

/** Which circle an edge belongs to, or null for structural membership edges
 *  (is_part_of / is_in_*) that build the containers and are never filtered. */
export function edgeCircle(edgeType: string | undefined): CircleKey | null {
  const t = edgeType ?? "";
  if (MEMBERSHIP_EDGES.has(t)) return null; // container structure
  if (t === GENERIC_EDGE) return "edges_generic";
  const cls = edgeEndpointClasses(t);
  if (cls.has("AuthorNode") || cls.has("LicenseNode") || cls.has("EmbargoNode"))
    return "edges_author";
  // PROPRIETA · the ARRIVAL decides: an edge whose every admitted target is
  // paradata (ParadataNode and its subclasses — property, extractor, combiner,
  // document — or a ParadataNodeGroup) is a paradata edge, whatever its sources
  // admit. The union of the two ends used to decide, and `has_property` admits
  // EpochNode among its sources, so the epoch rule below sent it to "Other
  // edges", off in the Matrix: a property of a US was drawn without its thread.
  // The BUGS-UI test on the raw target (`has_paradata_nodegroup`, which also
  // admits an epoch as source) is this same rule. Read off the RAW target (not
  // the union): `has_first_epoch` ADMITS a ParadataNodeGroup — as a source —
  // and is a temporal edge, not a paradata one.
  const rawTarget = edgeEndpointsRaw(t).target;
  if (
    rawTarget.length > 0 &&
    rawTarget.every((c) => classIsA(c, "ParadataNode") || classIsA(c, "ParadataNodeGroup"))
  )
    return "edges_paradata";
  // epoch links are structural in the swimlane view (epochs ARE lanes), plus
  // resources/geo/representation/HDT — none of these is a paradata edge
  if (
    cls.has("EpochNode") ||
    cls.has("ResourceNode") ||
    cls.has("GeoPositionNode") ||
    cls.has("RepresentationNode") ||
    cls.has("HDTNode") ||
    cls.has("SemanticShapeNode")
  )
    return "edges_other";
  if (cls.has("ParadataNode")) return "edges_paradata";
  if (cls.has("StratigraphicNode")) return "edges_temporal";
  return "edges_other";
}

/** The set of circles visible by default in a given view. Matrix hides the outer
 *  rings; Graph and DTC show them — the DTC substrate IS resources and links, so
 *  the projection would be empty under the Matrix defaults. MULTIGRAPH turns
 *  every ring on: "show me everything attached to this graph" is the whole point
 *  of that mode, and a ring left off would silently hide what it came to find. */
export function defaultVisibleCircles(view: ViewKind): Set<CircleKey> {
  if (view === "multigraph") return new Set(CIRCLES.map((c) => c.key));
  const out = new Set<CircleKey>();
  for (const c of CIRCLES) if (view === "matrix" ? c.matrix : c.graph) out.add(c.key);
  return out;
}
