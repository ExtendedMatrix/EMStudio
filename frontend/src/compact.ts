/**
 * PROPRIETA · the properties of a unit gathered in its paradata group, and the
 * property with more than one owner (MICRO-PROPRIETA-COMPATTA, E.D. 9 Oct 2026).
 *
 *     unit ──has_paradata_nodegroup──▶ PD_<unit>
 *     property · combiner · extractor ──is_in_paradata_nodegroup──▶ PD_<unit>
 *
 * The decisions of E.D. this file follows:
 *   1. the group of a unit gathers each property with its chain — the COMBINER
 *      and the EXTRACTOR are DUPLICATED when another unit's property uses them
 *      (no link from the copy to the original: there is no instantiation of the
 *      extractors); the DOCUMENT — and another unit's PROPERTY read as a source
 *      — is never a node of the group: the instance is a VIEW (E.D., 9 Oct
 *      2026 evening; s3Dgraphy 1.6.37, `em_visual_rules` → `paradata_instances`).
 *      The graph has no form for an instance and never will: the copies read
 *      the same master, and the view draws it inside every open group that
 *      reads it (`paradata-view.ts`). «Compact» brings the documents into the
 *      group AS A VIEW; in the data nothing changes;
 *   2. one property, one owner: two or more `has_property` without `inherited`
 *      is a warning, cured by «Duplicate for each owner». The declared heir
 *      (`attributes.inherited`) is not a second owner and is left alone;
 *   3. after «Compact» the groups are closed: a badge on the unit.
 *
 * Pure readers over the em.json document; mutations through the store, each
 * command ONE `batch` (one undo step). `scripts/check-compact.mjs` runs it.
 */
import type { DocumentStore } from "./model";
import type { EmDocument, EmEdge, EmNode, LayoutRect } from "./types";
import {
  HAS_DATA_PROVENANCE,
  HAS_PARADATA_NODEGROUP,
  HAS_PROPERTY,
  INHERITED_KEY,
  IS_IN_PARADATA_NODEGROUP,
} from "./paradata-chain";
import {
  COMBINES,
  deriveCombinerName,
  documentOfExtractor,
  nextExtractorOrdinal,
  ordinalTag,
  paradataGroupName,
} from "./naming";
import { META_KEYS } from "./crdt";
import { classOf, isStratigraphicType } from "./rules";

// ── reading ──────────────────────────────────────────────────────────────────

const attrs = (e: EmEdge): Record<string, unknown> =>
  (e.attributes ?? {}) as Record<string, unknown>;
const liveEdge = (e: EmEdge): boolean => !attrs(e).removed;
const liveNode = (n: EmNode): boolean => !((n.data ?? {}) as Record<string, unknown>).removed;
const isInherited = (e: EmEdge): boolean => !!attrs(e)[INHERITED_KEY];

/** The key a drawn edge is recognised by, folded or not (folding rewrites the
 *  ends and keeps the id). */
export function drawnEdgeKey(e: EmEdge): string {
  return e.id ?? `${e.source}|${e.edge_type ?? ""}|${e.target}`;
}

interface Index {
  node: Map<string, EmNode>;
  out: Map<string, EmEdge[]>;
  inn: Map<string, EmEdge[]>;
}

function index(doc: EmDocument): Index {
  const node = new Map<string, EmNode>();
  for (const n of doc.graph.nodes) if (liveNode(n)) node.set(n.id, n);
  const out = new Map<string, EmEdge[]>();
  const inn = new Map<string, EmEdge[]>();
  for (const e of doc.graph.edges) {
    if (!liveEdge(e) || !node.has(e.source) || !node.has(e.target)) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  return { node, out, inn };
}

const outOf = (ix: Index, id: string, type: string): EmEdge[] =>
  (ix.out.get(id) ?? []).filter((e) => e.edge_type === type);
const inOf = (ix: Index, id: string, type: string): EmEdge[] =>
  (ix.inn.get(id) ?? []).filter((e) => e.edge_type === type);
const cls = (ix: Index, id: string): string => classOf(ix.node.get(id)?.node_type);

/** The paradata group of an owner (`has_paradata_nodegroup`), or null. */
function groupOf(ix: Index, ownerId: string): string | null {
  for (const e of outOf(ix, ownerId, HAS_PARADATA_NODEGROUP))
    if (cls(ix, e.target) === "ParadataNodeGroup") return e.target;
  return null;
}

/** The groups a node is a member of. */
function groupsHolding(ix: Index, id: string): string[] {
  return outOf(ix, id, IS_IN_PARADATA_NODEGROUP).map((e) => e.target);
}

/** The owners of a property that are NOT declared heirs, in edge order. */
function declaredOwners(ix: Index, propertyId: string): string[] {
  const seen: string[] = [];
  for (const e of inOf(ix, propertyId, HAS_PROPERTY))
    if (!isInherited(e) && !seen.includes(e.source)) seen.push(e.source);
  return seen;
}

// FONTE (v2, part 4) · rule 2's DIAGNOSIS and its CURES are the library's now:
// `undeclared_owners`, `duplicate_per_owner` and `declare_inheritance` of
// s3Dgraphy's property_source, through the bridge (`property-source.ts`). The
// diagnosis written here on 9 Oct (`undeclaredOwners`) and the local
// «Duplicate for each owner» (`duplicateForEachOwner`) are gone: one rule, one
// place. «Compact» still leaves such a property out (`declaredOwners`).

/**
 * The `has_property` edges whose thread the GROUP carries: the property is a
 * member of its owner's own paradata group, so `has_paradata_nodegroup` already
 * draws the bond and a second line would be a duplicate. The edge stays in the
 * graph — only the drawing leaves it out.
 */
export function carriedPropertyEdges(doc: EmDocument): Set<string> {
  const ix = index(doc);
  const out = new Set<string>();
  for (const e of doc.graph.edges) {
    if (e.edge_type !== HAS_PROPERTY || !liveEdge(e)) continue;
    const g = groupOf(ix, e.source);
    if (g && groupsHolding(ix, e.target).includes(g)) out.add(drawnEdgeKey(e));
  }
  return out;
}

/** The badge of a unit: its paradata group and the properties in it. Epochs
 *  keep their «PD» tag in the lane (their group is the chronology). */
export function propertyBadges(doc: EmDocument): Map<string, { group: string; count: number }> {
  const ix = index(doc);
  const out = new Map<string, { group: string; count: number }>();
  for (const [id, n] of ix.node) {
    if (!isStratigraphicType(n.node_type)) continue;
    const g = groupOf(ix, id);
    if (!g) continue;
    const count = inOf(ix, g, IS_IN_PARADATA_NODEGROUP)
      .filter((e) => cls(ix, e.source) === "PropertyNode").length;
    if (count) out.set(id, { group: g, count });
  }
  return out;
}

/** The units every element of a chain serves: the declared owners of every
 *  property that reaches it from above (`has_data_provenance`, `combines`). */
function unitsServed(ix: Index, id: string, seen = new Set<string>()): Set<string> {
  const units = new Set<string>();
  if (seen.has(id)) return units;
  seen.add(id);
  for (const e of [...inOf(ix, id, HAS_DATA_PROVENANCE), ...inOf(ix, id, COMBINES)]) {
    if (cls(ix, e.source) === "PropertyNode")
      for (const o of declaredOwners(ix, e.source)) units.add(o);
    else for (const u of unitsServed(ix, e.source, seen)) units.add(u);
  }
  return units;
}

/** The units that have properties to gather: direct properties (owned without
 *  `inherited`) not yet in the unit's own group, or a chain left outside it. */
export function compactableUnits(doc: EmDocument): string[] {
  const ix = index(doc);
  const out: string[] = [];
  for (const [id, n] of ix.node) {
    if (!isStratigraphicType(n.node_type)) continue;
    if (outOf(ix, id, HAS_PROPERTY).some((e) => !isInherited(e) && cls(ix, e.target) === "PropertyNode"))
      out.push(id);
  }
  return out;
}

// ── writing ──────────────────────────────────────────────────────────────────

export interface CompactResult {
  units: number;
  /** properties that entered a group */
  properties: number;
  groupsCreated: number;
  /** combiner/extractor copies made for a group */
  duplicates: number;
  /** document instances written — always 0: see the head of this file */
  instances: number;
  /** properties left alone: more than one owner without `inherited` */
  skipped: Array<{ property: string; owners: string[] }>;
  /** the groups touched (closed after the command) */
  groups: string[];
}

/** Data of a copy: the original's, without the clocks, the stamps and the yEd
 *  identity (`original_id`/`original_emid`: a copy is no yEd element). */
function copyData(n: EmNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((n.data ?? {}) as Record<string, unknown>)) {
    if (META_KEYS.has(k) || k === "created_auth" || k === "modified_auth") continue;
    if (k === "original_id" || k === "original_emid") continue;
    out[k] = v === undefined ? v : JSON.parse(JSON.stringify(v));
  }
  return out;
}

/** An edge's attributes for a NEW edge: without the stamps and the tombstone. */
function freshAttrs(e: EmEdge): Record<string, unknown> {
  const a = { ...attrs(e) };
  for (const k of ["created_at", "created_by", "created_auth", "modified_at", "modified_by",
                   "modified_auth", "removed", "field_clocks"]) delete a[k];
  return a;
}

function rectOf(store: DocumentStore, id: string): LayoutRect | undefined {
  return store.doc.layout?.positions?.[id];
}

/**
 * Copy a combiner or an extractor for a group: the same data and the same
 * connections DOWNWARDS (a combiner's extractors — themselves copied by the
 * caller — and an extractor's sources, read as they are). Named by NAME1, so
 * no two extractors of a document share a name. Returns the copy's id.
 */
function copyElement(store: DocumentStore, id: string, near: string): string {
  const ix = index(store.doc);
  const orig = ix.node.get(id)!;
  const kind = cls(ix, id);
  let name = orig.name;
  if (kind === "CombinerNode") name = deriveCombinerName(store.doc);
  else {
    const source = documentOfExtractor(store.doc, id);
    if (source?.name)
      name = `${source.name}.${ordinalTag(nextExtractorOrdinal(store.doc, String(source.name)))}`;
  }
  const at = rectOf(store, near) ?? rectOf(store, id);
  const own = rectOf(store, id);
  const copy = store.addNode(
    {
      id: store.newId(),
      name,
      node_type: orig.node_type,
      description: orig.description ?? "",
      data: copyData(orig),
    },
    at ? { x: at.x, y: at.y + (at.h ?? 30) + 24, w: own?.w ?? at.w, h: own?.h ?? at.h } : undefined,
  );
  // the downward edges (an extractor's sources, an author…): the same. A
  // combiner's `combines` are rebuilt by the caller, membership is the group's
  for (const e of ix.out.get(id) ?? []) {
    if (e.edge_type === IS_IN_PARADATA_NODEGROUP || e.edge_type === COMBINES) continue;
    store.addEdge(copy.id, e.target, e.edge_type ?? "", freshAttrs(e));
  }
  return copy.id;
}

/** Move one upper edge (`has_data_provenance` / `combines`) from an element
 *  to its copy. */
function rewire(store: DocumentStore, edge: EmEdge, newTarget: string): void {
  store.deleteEdge(edge);
  store.addEdge(edge.source, newTarget, edge.edge_type ?? "", freshAttrs(edge));
}

/** FONTE (v2, part 5) · the mark of what «Compact» wrote, so that «Dissolve»
 *  takes back only that: an attribute on the memberships it adds, a data key
 *  on the groups it makes. A group or a membership without it was there before
 *  and stays. */
export const COMPACTED_KEY = "compacted";

function ensureMember(store: DocumentStore, id: string, group: string, mark = false): boolean {
  if (store.hasEdge(id, group, IS_IN_PARADATA_NODEGROUP)) return false;
  store.addEdge(id, group, IS_IN_PARADATA_NODEGROUP, mark ? { [COMPACTED_KEY]: true } : undefined);
  return true;
}

/** The unit's group, made when missing — the form of `ensureEpochTemporalParadata`
 *  and `attachAdornmentToParadata`: a ParadataNodeGroup `PD_<unit>`, joined by
 *  `has_paradata_nodegroup`, placed over the members it will hold. */
export function ensureGroup(store: DocumentStore, unitId: string, members: string[]): { id: string; created: boolean } {
  const existing = groupOf(index(store.doc), unitId);
  if (existing) return { id: existing, created: false };
  const unit = store.node(unitId)!;
  const rects = members.map((m) => rectOf(store, m)).filter((r): r is LayoutRect => !!r);
  const u = rectOf(store, unitId);
  let pos: LayoutRect | undefined;
  if (rects.length) {
    const x = Math.min(...rects.map((r) => r.x)) - 12;
    const y = Math.min(...rects.map((r) => r.y)) - 34;
    pos = { x, y, w: 200, h: 44 };
  } else if (u) pos = { x: u.x + (u.w ?? 90) + 30, y: u.y, w: 200, h: 44 };
  const g = store.addNode(
    { id: store.newId(), name: paradataGroupName(unit.name), node_type: "ParadataNodeGroup", description: "" },
    pos,
  );
  store.addEdge(unitId, g.id, HAS_PARADATA_NODEGROUP);
  return { id: g.id, created: true };
}

/**
 * Take one element of a chain into `group` (rule 1), reached through `upper`
 * (the edge from the property or the combiner above it). Returns the id that
 * now serves the chain — the original, or its copy.
 *
 *   · documents (and every other target of `extracted_from`) are not taken;
 *   · an element serving this unit only joins the group;
 *   · an element serving other units too: the FIRST group that collects it
 *     keeps the original; every other group gets a copy, and `upper` moves to it.
 */
function take(store: DocumentStore, id: string, upper: EmEdge, unitId: string, group: string,
              res: CompactResult, seen: Set<string>): string {
  const ix = index(store.doc);
  const kind = cls(ix, id);
  if (kind !== "CombinerNode" && kind !== "ExtractorNode") return id;
  if (seen.has(id)) return id;
  seen.add(id);
  const served = unitsServed(ix, id);
  const shared = [...served].some((u) => u !== unitId);
  const holders = groupsHolding(ix, id);
  let mine = id;
  if (shared && holders.length && !holders.includes(group)) {
    mine = copyElement(store, id, upper.source);
    rewire(store, upper, mine);
    res.duplicates++;
  }
  ensureMember(store, mine, group, true);
  if (kind === "CombinerNode") {
    // the extractors under it, from the ORIGINAL (a copy has none yet)
    const below = outOf(index(store.doc), id, COMBINES);
    for (const e of below) {
      if (mine === id) {
        take(store, e.target, e, unitId, group, res, seen);
      } else {
        // the copy combines the extractor (or its copy for this group)
        const link = store.addEdge(mine, e.target, COMBINES, freshAttrs(e));
        take(store, e.target, link, unitId, group, res, seen);
      }
    }
  }
  return mine;
}

/**
 * «Compact the properties» for the given units (all units with direct
 * properties when omitted). ONE undo step; the groups touched are closed.
 */
export function compactProperties(store: DocumentStore, unitIds?: string[]): CompactResult {
  const res: CompactResult = { units: 0, properties: 0, groupsCreated: 0, duplicates: 0,
                               instances: 0, skipped: [], groups: [] };
  const units = (unitIds ?? compactableUnits(store.doc))
    .filter((id) => isStratigraphicType(store.node(id)?.node_type));
  const skipped = new Set<string>();
  store.batch(() => {
    for (const unitId of units) {
      const ix = index(store.doc);
      const props: string[] = [];
      for (const e of outOf(ix, unitId, HAS_PROPERTY)) {
        if (isInherited(e) || cls(ix, e.target) !== "PropertyNode") continue;
        const owners = declaredOwners(ix, e.target);
        if (owners.length > 1) {
          if (!skipped.has(e.target)) {
            skipped.add(e.target);
            res.skipped.push({ property: e.target, owners });
          }
          continue;
        }
        if (!props.includes(e.target)) props.push(e.target);
      }
      if (!props.length) continue;
      const g = ensureGroup(store, unitId, props);
      if (g.created) {
        res.groupsCreated++;
        store.updateNode(g.id, { data: { ...((store.node(g.id)?.data ?? {}) as Record<string, unknown>), [COMPACTED_KEY]: true } });
      }
      res.units++;
      res.groups.push(g.id);
      const seen = new Set<string>();
      for (const p of props) {
        if (ensureMember(store, p, g.id, true)) res.properties++;
        for (const e of outOf(index(store.doc), p, HAS_DATA_PROVENANCE))
          take(store, e.target, e, unitId, g.id, res, seen);
      }
    }
    if (res.groups.length) store.setFoldedMany(res.groups, true);
  });
  return res;
}

const CHAIN_CLASSES = new Set(["PropertyNode", "CombinerNode", "ExtractorNode", "DocumentNode"]);

export interface DissolveResult {
  units: number;
  /** memberships removed */
  memberships: number;
  /** groups removed because «Compact» made them and they were left empty */
  groupsRemoved: number;
  /** groups kept because they were there before «Compact» (or hold more) */
  groupsKept: number;
}

/**
 * «Dissolve the group»: takes back what «Compact» did — the memberships it
 * added (marked `compacted`) leave the group, and the group goes when Compact
 * made it and nothing else is in it. A group that was there BEFORE «Compact»
 * stays, with the members it had (FONTE, v2 part 5: measured on the fixture,
 * PD_US2 held P2A before and used to go with the dissolve); it is opened.
 * Copies stay: they are data. Memberships and groups written before this mark
 * existed (a «Compact» of 9 Oct) carry none and are kept. ONE undo step.
 */
export function dissolveGroups(store: DocumentStore, unitIds: string[]): DissolveResult {
  const res: DissolveResult = { units: 0, memberships: 0, groupsRemoved: 0, groupsKept: 0 };
  store.batch(() => {
    for (const unitId of unitIds) {
      const ix = index(store.doc);
      const g = groupOf(ix, unitId);
      if (!g) continue;
      res.units++;
      for (const e of inOf(ix, g, IS_IN_PARADATA_NODEGROUP))
        if (CHAIN_CLASSES.has(cls(ix, e.source)) && attrs(e)[COMPACTED_KEY]) {
          store.deleteEdge(e);
          res.memberships++;
        }
      const made = !!((ix.node.get(g)?.data ?? {}) as Record<string, unknown>)[COMPACTED_KEY];
      if (made && !inOf(index(store.doc), g, IS_IN_PARADATA_NODEGROUP).length) {
        store.deleteNode(g);
        res.groupsRemoved++;
      } else {
        res.groupsKept++;
        if (store.isFolded(g)) store.setFolded(g, false);
      }
    }
  });
  return res;
}
