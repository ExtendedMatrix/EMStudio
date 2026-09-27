// Live socket validation from s3Dgraphy's datamodels — the same versioned
// JSONs that drive the Python side (EM 1.5/1.6 connector rules). The class
// hierarchy lives in the GENERATED registry `node_registry.generated.json`
// (node_types entries carry `parent` and `node_type`; derived from the Python
// classes by s3dgraphy.tools.sync_node_datamodel — ADR-001 / Phase 1 P1-A).
// The hand-authored datamodel keeps only semantics/CIDOC. Refresh both local
// copies with scripts/sync-datamodels.sh.
import connections from "./assets/s3Dgraphy_connections_datamodel.json";
import nodeRegistry from "./assets/node_registry.generated.json";
import nodeDatamodel from "./assets/s3Dgraphy_node_datamodel.json";
import visualRules from "./assets/em_visual_rules.json";
import datamodelTranslations from "./assets/datamodel_translations.json";
import { getLocale } from "./i18n";

interface EdgeTypeDef {
  name?: string;
  label?: string;
  description?: string;
  allowed_connections?: { source?: string[]; target?: string[] };
  /** `"chain"` on the DTC edges a provenance walk may traverse — connections
   *  datamodel 1.6.13. Absent means CONTEXT, which is what makes a new edge
   *  born non-traversable. */
  dtc_role?: string;
  /** An OLDER SPELLING of another edge type: the same relation under another
   *  name, accepted when read, never written (connections datamodel 1.6.20).
   *  `is_bonded_to.spelling_of = "bonded_to"`. */
  spelling_of?: string;
  /** `null` means SYMMETRIC — the same rule as s3Dgraphy's connections_loader
   *  (`is_symmetric = reverse is None`). */
  reverse?: { name?: string } | null;
}

interface NodeTypeEntry {
  class?: string;
  parent?: string | null;
  node_type?: string | null;
  description?: string;
}

const EDGE_TYPES = (
  connections as { edge_types: Record<string, EdgeTypeDef> }
).edge_types;

/**
 * Per-node-type narrowing of the class-level edge rules
 * (`node_type_restrictions`, connections datamodel 1.6.3 — POL5).
 *
 * The edge rules are stated by CLASS, so a subtype inherits everything its parent
 * may connect. This is how a subtype says LESS: `USN`, the NEUTRAL stratigraphic
 * unit (a risparmio — a window or door opening, the volume of a room), takes
 * `is_after` and nothing else, because a void cannot cut, fill, abut or bond.
 *
 * Absent block → no narrowing, which is why a consumer that ignores this simply
 * offers more instead of breaking.
 */
const NODE_RESTRICTIONS = (
  connections as {
    node_type_restrictions?: Record<
      string,
      { allowed_edges?: string[]; scope?: string; denied_edges?: string[] }
    >;
  }
).node_type_restrictions ?? {};

/**
 * The edges the restriction GOVERNS: relations between two stratigraphic units.
 *
 * Read off the data rather than listed here: the eleven unit-to-unit relations
 * (`is_after`, `cuts`, `fills`, `abuts`, `overlies`, `bonded_to`, `equals`, …) all
 * declare the BASE class `StratigraphicNode` on both endpoints, while everything
 * else names either other families (paradata, epochs, groups) or concrete
 * subclasses. `is_part_of` is the interesting case: it enumerates subclasses, and
 * NeutralStratigraphicUnit is not among them — so containment was already closed
 * to a USN by the ordinary rules and needs no exception here.
 *
 * Paradata and membership stay OPEN, deliberately: a risparmio is measured,
 * documented and dated like any other unit.
 */
const STRAT_BASE_CLASS = "StratigraphicNode";
function isUnitToUnitEdge(def: EdgeTypeDef): boolean {
  const ac = def.allowed_connections;
  return (
    !!ac &&
    !!ac.source?.includes(STRAT_BASE_CLASS) &&
    !!ac.target?.includes(STRAT_BASE_CLASS)
  );
}

const CLASS_ENTRIES = (
  nodeRegistry as unknown as { node_types: Record<string, NodeTypeEntry> }
).node_types;

// runtime node_type string → class name (e.g. "US" → "StratigraphicUnit")
const TYPE_TO_CLASS = new Map<string, string>();
for (const [className, entry] of Object.entries(CLASS_ENTRIES)) {
  if (entry.node_type) TYPE_TO_CLASS.set(entry.node_type, className);
}

// class name → ancestry, walking `parent` chains (the hierarchy is complete
// in the datamodel since the VirtualStratigraphicUnit curation of 2026-07-12)
const ANCESTRY = new Map<string, string[]>();
function classAncestors(className: string): string[] {
  const hit = ANCESTRY.get(className);
  if (hit) return hit;
  const out: string[] = [];
  let cur: string | null | undefined = className;
  let guard = 0;
  while (cur && guard++ < 20) {
    out.push(cur);
    cur = CLASS_ENTRIES[cur]?.parent;
  }
  ANCESTRY.set(className, out);
  return out;
}

export const GENERIC_EDGE = "generic_connection";

/** EM language version the palette/rules are aligned to (from the datamodel). */
export const DATAMODEL_VERSION = String(
  (connections as Record<string, unknown>)[
    "s3Dgraphy_connections_model_version"
  ] ?? "?",
);
export const EM_VERSION = DATAMODEL_VERSION.split(".").slice(0, 2).join(".");

/** MENU1 · datamodel versions surfaced in Help → Ontology models (the vendored
 *  single-source configs — ADR-001). Read from the same JSONs the UI is built
 *  from, so they never drift from what actually ships. */
export const NODE_DATAMODEL_VERSION = String(
  (nodeDatamodel as Record<string, unknown>)["s3Dgraphy_data_model_version"] ?? "?",
);
export const CONNECTIONS_VERSION = DATAMODEL_VERSION;
export const VISUAL_RULES_VERSION = String(
  (visualRules as Record<string, unknown>)["version"] ?? "?",
);

/** Class ancestry for a runtime node_type (always includes "Node"). */
export function ancestorsOf(nodeType: string | undefined): string[] {
  const className = TYPE_TO_CLASS.get(nodeType ?? "");
  return className ? classAncestors(className) : ["Node"];
}

export function classOf(nodeType: string | undefined): string {
  return TYPE_TO_CLASS.get(nodeType ?? "") ?? "Node";
}

/** Runtime node_type string for a datamodel class name (e.g.
 *  "HeritageEntityNode" → "heritage_entity"), read from the generated
 *  registry. Returns undefined for an unknown/abstract class. Lets callers
 *  reference a concept by its stable class name and resolve the wire string
 *  from the datamodel instead of hardcoding it. */
export function nodeTypeForClass(className: string): string | undefined {
  return CLASS_ENTRIES[className]?.node_type ?? undefined;
}

/** Runtime node_type strings of the gated HDT-O authoring layer — read from the
 *  datamodel's `hdto_nodes` section (HeritageEntity/HC1, Study/HC9, Project/HC13),
 *  NOT a hardcoded list. Keys starting with `_` (e.g. `_section_note`) are skipped.
 *  HDTNode(HC2)/GraphNode(HC16) are auto-authored by the panel, not hand-created,
 *  so they live in `container_nodes` and are intentionally absent here. */
export function hdtoAuthoringTypes(): string[] {
  const section = (nodeDatamodel as { hdto_nodes?: Record<string, unknown> })
    .hdto_nodes;
  if (!section) return [];
  const out: string[] = [];
  for (const cls of Object.keys(section)) {
    if (cls.startsWith("_")) continue;
    const nt = nodeTypeForClass(cls);
    if (nt) out.push(nt);
  }
  return out;
}

/** All HDT-O-profile node_types the per-graph panel authors: the `hdto_nodes`
 *  authoring types PLUS the auto-created twin (HC2/HDTNode) and proposition set
 *  (HC16/GraphNode). Resolved from the datamodel (class names → node_type), no
 *  hardcoded strings. Used to keep HDT-O metadata OFF the stratigraphic canvas
 *  (they stay in em.json for projection + the future HDT-O lens). */
export function hdtoProfileTypes(): Set<string> {
  const out = new Set<string>(hdtoAuthoringTypes());
  for (const cls of ["HDTNode", "GraphNode"]) {
    const nt = nodeTypeForClass(cls);
    if (nt) out.add(nt);
  }
  return out;
}

// class name → human `label` from the hand-authored datamodel (searches every
// section for an entry carrying both `class` and `label`).
const CLASS_TO_LABEL = new Map<string, string>();
(function buildClassLabels(node: unknown): void {
  if (Array.isArray(node)) {
    for (const v of node) buildClassLabels(v);
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.class === "string" && typeof o.label === "string")
      CLASS_TO_LABEL.set(o.class, o.label);
    for (const v of Object.values(o)) buildClassLabels(v);
  }
})(nodeDatamodel);

/** Human-readable datamodel label for a runtime node_type (e.g. "heritage_entity"
 *  → "Heritage Entity"); falls back to the node_type string when none is defined. */
export function nodeLabel(nodeType: string): string {
  const cls = TYPE_TO_CLASS.get(nodeType);
  return (cls && CLASS_TO_LABEL.get(cls)) || nodeType;
}

// ── DTC substrate profile (ECHOES): data-driven kinds + glyphs ────────────────
// The DTC node_types come from the `dtc_nodes` datamodel section — now just
// `dtc_process` (both INPUT and OUTPUT are Resources = ResourceNodes, no dedicated
// class). The per-kind vocabulary + glyph basenames come from the `dtc_kinds`
// block of em_visual_rules.json; a base with a dedicated `dtc_${base}` node uses
// it, else the kind creates a Resource (ResourceNode). Adding a kind is
// a `dtc_kinds` entry (+ an SVG) — NO code change here.

/** Runtime node_types of the gated DTC authoring layer (from `dtc_nodes`). */
function dtcNodeTypes(): Set<string> {
  const section = (nodeDatamodel as { dtc_nodes?: Record<string, unknown> })
    .dtc_nodes;
  const out = new Set<string>();
  if (!section) return out;
  for (const cls of Object.keys(section)) {
    if (cls.startsWith("_")) continue;
    const nt = nodeTypeForClass(cls);
    if (nt) out.add(nt);
  }
  return out;
}

/** True when a node_type belongs to the gated DTC authoring layer (`dtc_nodes`).
 *  The DTC projection asks THIS — never a hardcoded prefix list — so a new DTC
 *  class in the datamodel joins the view with no code change. */
export function isDtcNodeType(nodeType: string | undefined): boolean {
  return !!nodeType && dtcNodeTypes().has(nodeType);
}

/** The DTC CHAIN edges — the ones a provenance walk may traverse — READ from the
 *  datamodel, which marks them `"dtc_role": "chain"` (connections 1.6.13).
 *
 *  This used to be `startsWith("dtc_")` in `views/dtc.ts`, with the comment «and
 *  whatever the datamodel adds next». That comment was the good intention that
 *  held the defect: it PRESUMED every future `dtc_*` edge would be chain. A
 *  `dtc_annotated_by` that was context would have been a corridor on the client
 *  and not on the node — two rules with one name, and the client's the one
 *  nobody would have thought to check.
 *
 *  The fix was not to align the prefix to the three names. It was to take the
 *  decision away from the client: the list travels with the datamodel, like
 *  everything else here, and both sides read it. Same discipline
 *  `isDtcNodeType` above already follows for classes.
 *
 *  The fallback is the historical three and never NOTHING: a vendored datamodel
 *  from before the marker would otherwise make the projection draw no chain at
 *  all, and a view that quietly shows one node is worse than one that draws what
 *  it always drew. */
const DTC_CHAIN_EDGES: Set<string> = (() => {
  const marked = new Set<string>();
  for (const [name, def] of Object.entries(EDGE_TYPES)) {
    if (def?.dtc_role === "chain") marked.add(name);
  }
  if (marked.size) return marked;
  return new Set(["dtc_had_input", "dtc_had_output", "dtc_derived_from"]);
})();

export function isDtcChainEdge(edgeType: string | undefined): boolean {
  return !!edgeType && DTC_CHAIN_EDGES.has(edgeType);
}

/** For a check that wants to see the list rather than ask about one name. */
export function dtcChainEdges(): string[] {
  return [...DTC_CHAIN_EDGES].sort();
}

const DTC_KINDS =
  (
    visualRules as unknown as {
      dtc_kinds?: Record<
        string,
        Record<string, { label?: string; glyph?: string }>
      >;
    }
  ).dtc_kinds ?? {};

export interface DtcKindItem {
  nodeType: string; // dtc_process | (input/output →) link (a Resource)
  kind: string; // photo | mesh | …
  label: string;
  glyph: string | null;
  /** true when creating this item yields a RESOURCE (ResourceNode) rather than a
   *  dedicated DTC node — the output facet (slice b): the DTC output is a file
   *  Resource, so it also gets a `resource_type`. */
  isResource: boolean;
}

/**
 * I generi di UN SOLO asse del vocabolario DTC — `acquisition`, `process`,
 * `input`, `output` — letti dal datamodel e **mai elencati a mano**.
 *
 * Serve a comporre un passo (DTCEMS2): un'origine sceglie fra i generi
 * dell'asse `acquisition`, un passo derivato fra quelli dell'asse `process`, e
 * sono due specie di evento che il vocabolario tiene separate da sempre.
 * `dtcAuthoringKinds` appiattisce gli assi perché alla tavolozza serve così;
 * qui l'asse è la domanda.
 *
 * **Il vocabolario non si allarga da qui.** Un genere nuovo è una voce in
 * `em_visual_rules.json` di s3Dgraphy più `sync-datamodels.sh` — mai una
 * stringa scritta in un campo dell'interfaccia, e mai un valore arrivato in un
 * corpo JSON (il bridge lo rifiuta di suo: sono due recinti sullo stesso campo).
 */
export function dtcKindsFor(axis: string): Array<{ kind: string; label: string }> {
  const entries = DTC_KINDS[axis] ?? {};
  const out: Array<{ kind: string; label: string }> = [];
  for (const kind of Object.keys(entries)) {
    if (kind.startsWith("_")) continue;
    out.push({ kind, label: entries[kind]?.label ?? kind });
  }
  return out;
}

/** The DTC authoring palette, fully data-driven: one entry per (base kind) ×
 *  (specific kind) from `dtc_kinds`. A base backed by a dedicated DTC node_type
 *  (`dtc_${base}`) creates that node; a base WITHOUT one (the OUTPUT, slice b —
 *  DTCOutputNode retired) creates a RESOURCE = the ResourceNode. Empty when the
 *  datamodel carries no DTC profile. */
export function dtcAuthoringKinds(): DtcKindItem[] {
  const types = dtcNodeTypes();
  const resourceNt = nodeTypeForClass("ResourceNode"); // the Resource node ("resource")
  const out: DtcKindItem[] = [];
  for (const base of Object.keys(DTC_KINDS)) {
    if (base.startsWith("_")) continue;
    const dedicated = `dtc_${base}`;
    const hasNode = types.has(dedicated);
    const nodeType = hasNode ? dedicated : resourceNt;
    if (!nodeType) continue; // no dedicated node AND no Resource type available
    const entries = DTC_KINDS[base] ?? {};
    for (const kind of Object.keys(entries)) {
      if (kind.startsWith("_")) continue;
      const e = entries[kind] ?? {};
      out.push({
        nodeType,
        kind,
        label: e.label ?? kind,
        glyph: e.glyph ?? null,
        isResource: !hasNode,
      });
    }
  }
  return out;
}

// flat kind → glyph basename (kinds are unique across the input/process/output
// bases), so a glyph resolves from a node's `data.dtc_kind` regardless of its
// node_type — covers the dtc_* chunks AND the output Resource (a ResourceNode).
const DTC_KIND_GLYPH = new Map<string, string>();
for (const base of Object.keys(DTC_KINDS)) {
  if (base.startsWith("_")) continue;
  for (const [kind, e] of Object.entries(DTC_KINDS[base] ?? {})) {
    if (kind.startsWith("_")) continue;
    if (e?.glyph) DTC_KIND_GLYPH.set(kind, e.glyph);
  }
}

/** Glyph basename for a node's `data.dtc_kind` — data-driven from `dtc_kinds`;
 *  null when there is no kind / no glyph. Resolves for the dtc_* chunks and for
 *  the output Resource (ResourceNode) alike, keyed purely on the kind. */
export function dtcGlyphName(dtcKind: string | undefined): string | null {
  return (dtcKind && DTC_KIND_GLYPH.get(dtcKind)) || null;
}

/** The single edge type the datamodel permits between two node_types, or
 *  undefined if none (or, defensively, the first when several qualify). Reads
 *  `allowed_connections` — no edge-name literals in caller code. */
export function edgeTypeFor(
  sourceType: string | undefined,
  targetType: string | undefined,
): string | undefined {
  return allowedEdgeTypes(sourceType, targetType)[0];
}

// TRAD1 · multilingual descriptions from the vendored sidecar (keyed by class).
// en is the source; other langs are translation surface with validated_<lang>.
const _TRANSLATIONS = (
  datamodelTranslations as {
    entries?: Record<string, Record<string, Record<string, string | boolean>>>;
  }
).entries ?? {};

/** The datamodel description of a node type in the ACTIVE locale, English
 *  fallback (TRAD1). Chain: sidecar[class].description[locale] → sidecar en →
 *  the datamodel's own English string (which the sidecar's en mirrors). */
export function typeDescription(nodeType: string | undefined): string {
  const className = TYPE_TO_CLASS.get(nodeType ?? "");
  if (!className) return "";
  const field = _TRANSLATIONS[className]?.description;
  if (field) {
    const loc = field[getLocale()];
    if (typeof loc === "string" && loc.trim()) return loc;
    const en = field.en;
    if (typeof en === "string" && en.trim()) return en;
  }
  return CLASS_ENTRIES[className]?.description || "";
}

function intersects(allowed: string[] | undefined, anc: string[]): boolean {
  if (!allowed || !allowed.length) return false;
  return allowed.some((a) => anc.includes(a));
}

/**
 * Edge types permitted from a source node_type to a target node_type,
 * specific rules only (generic_connection excluded).
 */
export function allowedEdgeTypes(
  sourceType: string | undefined,
  targetType: string | undefined,
): string[] {
  const sa = ancestorsOf(sourceType);
  const ta = ancestorsOf(targetType);
  const out: string[] = [];
  for (const [name, def] of Object.entries(EDGE_TYPES)) {
    if (name === GENERIC_EDGE) continue;
    // 1.6.20 · a spelling is not a relation of its own: the menu offers the
    // canonical name only, and a validator still sees the relation through it.
    if (def.spelling_of) continue;
    const ac = def.allowed_connections;
    if (!ac) continue;
    if (!intersects(ac.source, sa) || !intersects(ac.target, ta)) continue;
    // BUGFIX-CONN · a node type may DENY specific edges its CLASS would otherwise
    // allow (`denied_edges`, the blacklist mirror of `allowed_edges`). Unlike the
    // scoped `allowed_edges` whitelist below, this is NOT gated on the edge family
    // — it names exact edges to withhold, so a subtype can say LESS than its
    // parent for one edge without leaving the class hierarchy (e.g. an
    // ExtractorNode/CombinerNode does not offer has_visual_reference, even though
    // their parent ParadataNode is a listed source).
    const deniedBySource = sourceType ? NODE_RESTRICTIONS[sourceType]?.denied_edges : undefined;
    const deniedByTarget = targetType ? NODE_RESTRICTIONS[targetType]?.denied_edges : undefined;
    if (deniedBySource?.includes(name) || deniedByTarget?.includes(name)) continue;
    // POL5 · a restricted type narrows the unit-to-unit relations, at EITHER end:
    // "USN cuts US" is as wrong as "US cuts USN".
    if (isUnitToUnitEdge(def)) {
      const blocked = [sourceType, targetType].some((t) => {
        const allow = t ? NODE_RESTRICTIONS[t]?.allowed_edges : undefined;
        return !!allow && !allow.includes(name);
      });
      if (blocked) continue;
    }
    out.push(name);
  }
  return out;
}

export type ConnectValidity = "valid" | "generic" | "invalid";

export function connectValidity(
  sourceType: string | undefined,
  targetType: string | undefined,
): ConnectValidity {
  if (allowedEdgeTypes(sourceType, targetType).length) return "valid";
  const g = EDGE_TYPES[GENERIC_EDGE]?.allowed_connections;
  const ok =
    g &&
    intersects(g.source, ancestorsOf(sourceType)) &&
    intersects(g.target, ancestorsOf(targetType));
  return ok ? "generic" : "invalid";
}

/**
 * The canonical name of an edge type: an older spelling (`spelling_of`) reads as
 * the relation it spells, anything else is itself. Read off the datamodel, so a
 * third spelling added in s3Dgraphy needs no edit here.
 */
export function canonicalEdgeType(edgeType: string | undefined): string {
  const t = edgeType ?? "";
  return EDGE_TYPES[t]?.spelling_of ?? t;
}

/** Every name accepted for the relation `edgeType` spells (itself included) —
 *  the TS twin of s3Dgraphy's `ConnectionsDatamodel.spellings()`. A reverse is
 *  NOT a spelling: `overlies` → {overlies}. */
export function edgeSpellings(edgeType: string): Set<string> {
  const canonical = canonicalEdgeType(edgeType);
  const out = new Set<string>([canonical]);
  for (const [name, def] of Object.entries(EDGE_TYPES))
    if (def.spelling_of === canonical) out.add(name);
  return out;
}

/** Symmetric per the datamodel: an explicit `reverse: null`. */
export function isSymmetricEdgeType(edgeType: string | undefined): boolean {
  const def = EDGE_TYPES[canonicalEdgeType(edgeType)];
  return !!def && "reverse" in def && def.reverse === null;
}

/**
 * One key per RELATION: the canonical name plus the pair — unordered when the
 * relation is symmetric (a bond between A and B is one bond, whichever end it
 * was written from). Two edges with the same key say the same thing.
 */
export function relationKey(e: {
  source: string;
  target: string;
  edge_type?: string;
}): string {
  const t = canonicalEdgeType(e.edge_type);
  // generic_connection has no reverse either, but its verso is the author's
  const unordered = isSymmetricEdgeType(t) && t !== GENERIC_EDGE;
  const [a, b] =
    unordered && e.target < e.source
      ? [e.target, e.source]
      : [e.source, e.target];
  return `${t}\u0000${a}\u0000${b}`;
}

/**
 * The VIEW of an edge list with one edge per relation. The document keeps every
 * edge it was given (a spelling is accepted when read); only what is DRAWN is
 * collapsed, so a pair written `bonded_to` and `is_bonded_to` shows one line.
 * The canonically-spelled edge wins when present, else the first; order is the
 * order of first appearance. `generic_connection` is left alone: its direction
 * is the author's, even though the datamodel gives it no reverse.
 */
export function collapseSpellings<
  E extends { source: string; target: string; edge_type?: string },
>(edges: readonly E[]): E[] {
  const slot = new Map<string, number>();
  const out: E[] = [];
  for (const e of edges) {
    if ((e.edge_type ?? "") === GENERIC_EDGE) {
      out.push(e);
      continue;
    }
    const k = relationKey(e);
    const at = slot.get(k);
    if (at === undefined) {
      slot.set(k, out.length);
      out.push(e);
    } else if (
      out[at].edge_type !== canonicalEdgeType(out[at].edge_type) &&
      e.edge_type === canonicalEdgeType(e.edge_type)
    ) {
      out[at] = e; // prefer the canonical spelling
    }
  }
  return out;
}

/** A property the datamodel declares as an ELEMENT OF THE NODE (`kind:
 *  "node_element"`, node datamodel 1.6.9 — today only `definition`): it lives
 *  in `data.<field>` (`em_json`), not on a PropertyNode. */
export interface NodeElementRule {
  field: string;
  value?: string;
  em_json?: string;
  description?: string;
}

// class name → its hand-authored `properties`, from every section of the node
// datamodel (entries carry `class`; subtypes nest under `subtypes`).
const CLASS_PROPERTIES = new Map<string, Record<string, unknown>>();
(function index(v: unknown): void {
  if (!v || typeof v !== "object" || Array.isArray(v)) return;
  const o = v as Record<string, unknown>;
  if (typeof o.class === "string" && o.properties && typeof o.properties === "object")
    CLASS_PROPERTIES.set(o.class, o.properties as Record<string, unknown>);
  for (const child of Object.values(o)) index(child);
})(nodeDatamodel);

/**
 * The node elements a node_type carries, INHERITED up its class chain — the
 * same walk s3Dgraphy's `get_node_element_rule` does over the MRO: the first
 * class that declares a field as an OBJECT answers; the string entries
 * (`"name": "P1_is_identified_by"`) are mapping notes and are skipped.
 */
export function nodeElements(nodeType: string | undefined): NodeElementRule[] {
  const out: NodeElementRule[] = [];
  const seen = new Set<string>();
  for (const cls of ancestorsOf(nodeType)) {
    const props = CLASS_PROPERTIES.get(cls);
    if (!props) continue;
    for (const [field, rule] of Object.entries(props)) {
      if (seen.has(field) || !rule || typeof rule !== "object") continue;
      const r = rule as Record<string, unknown>;
      if (r.kind !== "node_element") continue;
      seen.add(field);
      out.push({
        field,
        value: typeof r.value === "string" ? r.value : undefined,
        em_json: typeof r.em_json === "string" ? r.em_json : undefined,
        description: typeof r.description === "string" ? r.description : undefined,
      });
    }
  }
  return out;
}

/**
 * `(concept, label)` of a concept-valued element — the TS twin of s3Dgraphy's
 * `definition_parts`: `{concept, label}`; a bare IRI string is a concept with no
 * label; any other string is a label with NO concept (nothing is invented).
 */
export function conceptParts(value: unknown): { concept: string; label: string } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return {
      concept: typeof o.concept === "string" ? o.concept.trim() : "",
      label: typeof o.label === "string" ? o.label.trim() : "",
    };
  }
  if (typeof value === "string") {
    const v = value.trim();
    // exactly Python's prefixes, so the two readers split the same strings
    return ["http://", "https://", "urn:"].some((p) => v.startsWith(p))
      ? { concept: v, label: "" }
      : { concept: "", label: v };
  }
  return { concept: "", label: "" };
}

export function edgeTypeLabel(edgeType: string): string {
  return EDGE_TYPES[edgeType]?.label ?? edgeType;
}

export function edgeTypeDescription(edgeType: string): string {
  return EDGE_TYPES[edgeType]?.description ?? "";
}

/** All specific edge type names (excludes the generic connection). Lets callers
 *  derive edge-class sets from the datamodel instead of hardcoding names. */
export function edgeTypeNames(): string[] {
  return Object.keys(EDGE_TYPES).filter((n) => n !== GENERIC_EDGE);
}

/** Raw declared endpoint CLASS names of an edge type, VERBATIM from the
 *  datamodel's `allowed_connections` (NOT expanded to ancestors — the caller
 *  that needs "target is exactly these classes" must see the declared set, not
 *  every ancestor up to Node). */
export function edgeEndpointsRaw(edgeType: string): {
  source: string[];
  target: string[];
} {
  const ac = EDGE_TYPES[edgeType]?.allowed_connections;
  return { source: ac?.source ?? [], target: ac?.target ?? [] };
}

/** node_types whose class ancestry includes the given class name. */
export function typesOfClass(className: string): string[] {
  return [...TYPE_TO_CLASS.keys()].filter((t) =>
    ancestorsOf(t).includes(className),
  );
}

export function isGroupType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("GroupNode");
}

export function isStratigraphicType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("StratigraphicNode");
}

/** Reasoning-chain (paradata) node: property / extractor / combiner / document. */
export function isParadataType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("ParadataNode");
}

/** Continuity node (BR) — the boundary marker of a unit's life-span. */
export function isContinuityType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).includes("ContinuityNode");
}

/** Virtual stratigraphic unit — detected from the datamodel class names
 *  (VirtualStratigraphicUnit / …VirtualSpecialFindUnit / SeriesOf…Virtual…),
 *  so it also covers VSF and the virtual series, not just USVn/USVs. */
export function isVirtualType(nodeType: string | undefined): boolean {
  return ancestorsOf(nodeType).some((c) => c.includes("Virtual"));
}

/**
 * The narrative embed view types, from the datamodel
 * (`narrative_nodes.NarrativeNode.valid_view_types`).
 *
 * One vocabulary, owned by s3Dgraphy — not a hand-written list that has to be
 * remembered when a term is renamed. Order is the datamodel's, which is the
 * order the author sees in the menu.
 */
export function narrativeViewTypes(): string[] {
  const dm = nodeDatamodel as unknown as {
    narrative_nodes?: Record<string, { valid_view_types?: Record<string, string> }>;
  };
  const declared = dm.narrative_nodes?.NarrativeNode?.valid_view_types;
  return declared ? Object.keys(declared) : [];
}

/** What the datamodel says a view type shows — straight into the tooltip of the
 *  block's view-type picker, so the author reads the definition, not a guess. */
export function narrativeViewTypeDescription(viewType: string): string {
  const dm = nodeDatamodel as unknown as {
    narrative_nodes?: Record<string, { valid_view_types?: Record<string, string> }>;
  };
  return dm.narrative_nodes?.NarrativeNode?.valid_view_types?.[viewType] ?? "";
}

// ── resource types (ResourceNode) ────────────────────────────────────────────────
// A resource's *kind* — image, document, 3d_model, … — is a vocabulary the
// datamodel owns (`reference_nodes.ResourceNode.resource_types`: kind → extensions),
// and it is the same table `s3dgraphy.resources.classify_resource_type` reads on
// the Python side. So: no second list of extensions in the UI. The previews
// (N10) and the 3D embed (N9) both ask this.
const RESOURCE_TYPES: Record<string, string[]> =
  ((
    nodeDatamodel as unknown as {
      reference_nodes?: Record<string, { resource_types?: Record<string, string[]> }>;
    }
  ).reference_nodes?.ResourceNode?.resource_types) ?? {};

const EXT_TO_RESOURCE_TYPE = new Map<string, string>();
for (const [kind, exts] of Object.entries(RESOURCE_TYPES))
  for (const ext of exts) EXT_TO_RESOURCE_TYPE.set(ext.toLowerCase(), kind);

/**
 * Classify a filename / locator into an EM resource type, by extension.
 *
 * Mirrors `classify_resource_type` (s3Dgraphy): the extension table is the
 * datamodel's, and "unknown" is a legitimate answer rather than a guess. Query
 * strings and fragments are stripped first — a locator is not a filename.
 */
export function resourceTypeOfLocator(locator: string | undefined): string {
  const clean = String(locator ?? "").split(/[?#]/)[0];
  const base = clean.split(/[\\/]/).pop() ?? "";
  if (!base.includes(".")) return "unknown";
  const ext = base.slice(base.lastIndexOf(".") + 1).toLowerCase();
  return EXT_TO_RESOURCE_TYPE.get(ext) ?? "unknown";
}

/** The resource types that are 3D geometry — read off the datamodel's own kind
 *  names, so a new 3D kind added there is 3D here too. `proxy_model` (glb) and
 *  `3d_model` (gltf/obj/…) both qualify; point clouds do not (ATON loads meshes
 *  in the preview app, not e57/las). */
export function is3dResourceType(resourceType: string | undefined): boolean {
  const t = String(resourceType ?? "");
  return Object.keys(RESOURCE_TYPES).includes(t) && /model/.test(t);
}

/** Union of the node classes (with ancestry) an edge type may connect —
 *  from the datamodel `allowed_connections`. Used to categorise edges
 *  (epoch / paradata / stratigraphic) without hardcoding edge names. */
export function edgeEndpointClasses(edgeType: string | undefined): Set<string> {
  const ac = EDGE_TYPES[edgeType ?? ""]?.allowed_connections;
  const out = new Set<string>();
  for (const c of [...(ac?.source ?? []), ...(ac?.target ?? [])])
    for (const a of classAncestors(c)) out.add(a);
  return out;
}
