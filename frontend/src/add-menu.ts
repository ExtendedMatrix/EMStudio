/**
 * SHIFT-A · what the «Aggiungi» menu offers, decided once and testable in node
 * (`scripts/check-add-menu.mjs`). The DOM is `add-menu-ui.ts`; the creation is
 * `main.ts` (`addNodeFromMenu`). This file only answers two questions:
 *
 *   · in THIS context (a graph window's mode), which types can be added, grouped
 *     how, and which categories exist but are not for here;
 *   · with THIS selection, which «Collegato a X» entries exist.
 *
 * Nothing here is a second list of the EM language (invariant 1). The types come
 * from `SECTIONS` (the authoring surface, moved here from the palette that
 * retired with SHIFT-A), from the datamodel's `hdto_nodes` and `dtc_kinds`
 * (`hdtoAuthoringTypes`, `dtcAuthoringKinds`); the links come from
 * `allowedEdgeTypes`. What IS written here is the contextual rule — which
 * category belongs to which projection — and each rule says why.
 */
import { dropTargetAt, laneTargetAt, type DropTarget } from "./drag";
import { MEMBERSHIP_EDGES } from "./folding";
import type { DocumentStore } from "./model";
import { renameOnAttach } from "./naming";
import type { Scene } from "./scene";
import type { EmDocument } from "./types";
import connections from "./assets/s3Dgraphy_connections_datamodel.json";
import { t } from "./i18n";
import { DTC_REVERSED_EDGES } from "./views/dtc";

/** RISORSA-FILE · the edges a MENU may propose between two types: those the
 *  datamodel allows AND gives words to (`ui_phrase`). An edge with no phrase is
 *  made by an act, not by a menu — `was_revision_of` (connections 1.6.31) is
 *  written by `replaceFile`, and s3Dgraphy leaves its phrase out for that
 *  reason. Validation still reads `allowedEdgeTypes`: an edge a menu does not
 *  offer is not an illegal one. */
const PHRASED = new Set(Object.entries(
  (connections as { edge_types: Record<string, { ui_phrase?: unknown }> }).edge_types)
  .filter(([, v]) => !!v.ui_phrase).map(([k]) => k));
function menuEdgeTypes(from: string | undefined, to: string | undefined): string[] {
  return allowedEdgeTypes(from, to).filter((e) => PHRASED.has(e));
}
import {
  allowedEdgeTypes,
  connectValidity,
  dtcAuthoringKinds,
  hdtoAuthoringTypes,
  isGroupType,
  isParadataType,
  isStratigraphicType,
  isSymmetricEdgeType,
  nodeLabel,
  relationKey,
  typeDescription,
  typeLabel,
} from "./rules";

export interface Section {
  label: string;
  types: string[];
}

// Authoring surface, EM 1.5/1.6: stratigraphic units first, then series,
// paradata chain, groups, context/metadata nodes. This is the AUTHORING surface,
// not the datamodel: the datamodel still declares EpochNode (invariant 1), and
// an epoch is created as a lane (Matrix «Nuova epoca…»), not dropped as a node.
export const SECTIONS: Section[] = [
  {
    label: "Stratigraphic",
    // POL5/POL6: the two VOIDS sit side by side on purpose — `USN` is the
    // negative/destructive one (a cut, an erosion surface; displayed `US-`) and
    // `USNt` the neutral one (a risparmio: window, door, niche, room).
    types: ["US", "USVn", "USVs", "USD", "TSU", "USN", "USNt", "SE", "BR"],
  },
  { label: "Special finds", types: ["SF", "VSF", "RSF"] },
  { label: "Series", types: ["serSU", "serUSVn", "serUSVs", "serUSD"] },
  { label: "Paradata", types: ["property", "extractor", "combiner", "document"] },
  {
    label: "Groups",
    types: ["ActivityNodeGroup", "ParadataNodeGroup", "TimeBranchNodeGroup", "LocationNodeGroup"],
  },
  // `EpochNode` deliberately ABSENT (POL1): an epoch is a swimlane.
  { label: "Context", types: ["author", "author_ai", "resource", "license", "embargo"] },
];

/** The four projections of a graph window (`GRAPH_MODES`). */
export type AddContext = "matrix" | "graph" | "dtc" | "multigraph";

export interface AddItem {
  nodeType: string;
  /** DTC: the specific kind stamped on `data.dtc_kind` */
  kind?: string;
  /** DTC output: a Resource, so `data.resource_type` too */
  isResource?: boolean;
  label: string;
  /** the category id it belongs to (shown beside it in a flat search) */
  category: string;
  description: string;
  /** also found by: the datamodel's own (English) label, whatever the locale */
  alias?: string;
  /** RISORSA-FILE · what the node is born with (a declared parent's packaging) */
  preset?: { name?: string; description?: string; data?: Record<string, unknown> };
}

/**
 * How a category stands in a context:
 *  · `on`: its items can be added here;
 *  · `off`: it exists, but not in this projection («non in questo contesto»);
 *  · `linked`: only as a link to a selected unit (Matrix paradata).
 */
export type CategoryState = "on" | "off" | "linked";

export interface AddCategory {
  id: string;
  label: string;
  state: CategoryState;
  items: AddItem[];
}

export const HDTO_CATEGORY = "HDT-O";
export const DTC_CATEGORY = "DTC";

/**
 * THE CONTEXTUAL RULE, one line per category and a reason for each.
 *
 *  · DTC chunks belong to the DTC projection only: there they are written to
 *    the corpus (`canvasWritesToCorpus`), anywhere else they would be a
 *    provenance forest inside a stratigraphic matrix — which is what the corpus
 *    separation exists to prevent. Conversely, the DTC projection offers
 *    nothing BUT the DTC chunks (WIN3, the palette's per-mode rule).
 *  · HDT-O types are only drawn by `multigraph` (`filteredView` drops them
 *    unless `wholeGraph`): adding one anywhere else would create a node you
 *    cannot see.
 *  · Matrix paradata only LINKED: a paradata node loose in Matrix has no lane
 *    and no unit to hang from, so it would float with nowhere to be (E.D., 30 set).
 */
export function categoryState(ctx: AddContext, category: string): CategoryState {
  if (category === DTC_CATEGORY) return ctx === "dtc" ? "on" : "off";
  if (ctx === "dtc") return "off";
  if (category === HDTO_CATEGORY) return ctx === "multigraph" ? "on" : "off";
  if (ctx === "matrix" && category === "Paradata") return "linked";
  return "on";
}

function itemOf(nodeType: string, category: string, label?: string): AddItem {
  return {
    nodeType,
    label: label ?? typeLabel(nodeType),
    category,
    description: typeDescription(nodeType),
    alias: nodeLabel(nodeType),
  };
}

/** Every category, in menu order, with its state in `ctx`. Off categories keep
 *  their items (so the menu can say they exist) but none of them is offered. */
export function addCategories(ctx: AddContext): AddCategory[] {
  const out: AddCategory[] = SECTIONS.map((s) => ({
    id: s.label,
    label: s.label,
    state: categoryState(ctx, s.label),
    items: s.types.map((t) => itemOf(t, s.label)),
  }));
  const hdto = hdtoAuthoringTypes();
  if (hdto.length)
    out.push({
      id: HDTO_CATEGORY,
      label: HDTO_CATEGORY,
      state: categoryState(ctx, HDTO_CATEGORY),
      items: hdto.map((t) => itemOf(t, HDTO_CATEGORY)),
    });
  const dtc = dtcAuthoringKinds();
  if (dtc.length)
    out.push({
      id: DTC_CATEGORY,
      label: DTC_CATEGORY,
      state: categoryState(ctx, DTC_CATEGORY),
      items: dtc.map((d) => ({
        ...itemOf(d.nodeType, DTC_CATEGORY, d.label),
        kind: d.kind,
        isResource: d.isResource,
      })),
    });
  return out;
}

/** The items a plain (unlinked) add can create in `ctx`. */
export function addableItems(ctx: AddContext): AddItem[] {
  return addCategories(ctx).flatMap((c) => (c.state === "on" ? c.items : []));
}

/** The node_types `ctx` can create at all — plainly or linked. */
export function allowedTypes(ctx: AddContext): string[] {
  const s = new Set<string>();
  for (const c of addCategories(ctx))
    if (c.state !== "off") for (const i of c.items) s.add(i.nodeType);
  return [...s];
}

/** A «Collegato a X» entry: a new node of `nodeType`, joined to X by `edgeType`. */
export interface LinkedItem extends AddItem {
  /** `out` = X → new (X is the edge source), `in` = new → X */
  dir: "out" | "in";
  edgeType: string;
  /** stratigraphic pairs read as position (invariant 3: source above target) */
  relation: "above" | "below" | "for";
}

/**
 * The «Collegato a X» entries for a selected node of type `selType`.
 *
 * From `allowedEdgeTypes` in both directions, ONE edge per (type, direction) —
 * the first the datamodel lists, which for unit → unit is `is_after`, the
 * canonical EM relation. The rest of the vocabulary is still one connector drag
 * away; a menu offering every relation for every type is the palette again.
 *
 * Three filters keep it a list a person reads:
 *  · no GROUPS: a group «for X» is X grouped, and grouping is its own verb (the
 *    node's context menu, «Group into …»), with its own bounding box;
 *  · a UNIT links to a unit of its OWN type (US above/below US): the next one in
 *    the sequence, which is what «US sopra X» means;
 *  · an incoming link (new → X) is offered only when the new node is NOT a unit
 *    (an extractor for a document, yes; «a US for this property», no) — except
 *    unit → unit, where incoming is «sopra».
 */
export function linkedItems(ctx: AddContext, selType: string | undefined): LinkedItem[] {
  if (!selType) return [];
  // DEV29 B1 · the DTC is read with its own arrows (DTC_REVERSED_EDGES): the
  // «Collegato a X» of a DTC node is what the maniglia offers above AND below
  // it — the same answer the «+» of the bar gives for this selection, instead
  // of the «0 types allowed» measured on an acquisition and on a resource.
  if (ctx === "dtc") return dtcLinkedItems(selType);
  const selStrat = isStratigraphicType(selType);
  const out: LinkedItem[] = [];
  const seen = new Set<string>();
  for (const cat of addCategories(ctx)) {
    if (cat.state === "off") continue;
    for (const it of cat.items) {
      const t = it.nodeType;
      if (seen.has(t)) continue;
      seen.add(t);
      if (isGroupType(t)) continue;
      const tStrat = isStratigraphicType(t);
      if (tStrat && selStrat && t !== selType) continue;
      // X → new
      const eo = menuEdgeTypes(selType, t)[0];
      if (eo && !(tStrat && !selStrat))
        out.push({
          ...it,
          dir: "out",
          edgeType: eo,
          relation: tStrat && selStrat && !isSymmetricEdgeType(eo) ? "below" : "for",
        });
      // new → X
      const ei = menuEdgeTypes(t, selType)[0];
      if (ei && (!tStrat || selStrat) && !(tStrat && selStrat && isSymmetricEdgeType(ei)))
        if (!(eo && !tStrat && ei === eo))
          out.push({
            ...it,
            dir: "in",
            edgeType: ei,
            relation: tStrat && selStrat ? "above" : "for",
          });
    }
  }
  // «sopra» before «sotto», then the chain in menu order
  const rank = (i: LinkedItem): number => (i.relation === "above" ? 0 : i.relation === "below" ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

/**
 * The entries of the anchor drag (a connector dropped in the void): the edge is
 * already decided in its SOURCE — X is the source, the new node the target — so
 * the list is every addable type whose connection from X the datamodel allows.
 * One entry per edge when there is more than one, so the pick is one gesture.
 */
export function connectItems(ctx: AddContext, srcType: string | undefined): LinkedItem[] {
  const out: LinkedItem[] = [];
  const cats = addCategories(ctx).filter((c) => c.state !== "off");
  for (const c of cats)
    for (const it of c.items) {
      if (connectValidity(srcType, it.nodeType) !== "valid") continue;
      for (const e of menuEdgeTypes(srcType, it.nodeType))
        out.push({ ...it, dir: "out", edgeType: e, relation: "for" });
    }
  return out;
}

// ── CATENA · the maniglia: up for the nodes above, down for the nodes below ──

export type HandleDir = "up" | "down";

/**
 * The edges the maniglia offers between X and another node in one direction —
 * `allowedEdgeTypes` read with the arrows-down rule (invariant 3: the source of
 * a directed edge is ABOVE its target):
 *   · DOWN — X is the source: `allowedEdgeTypes(X, other)` (US below, the
 *     property of a US, the extractor of a property, the document or the unit
 *     of an extractor);
 *   · UP — the other is the source: `allowedEdgeTypes(other, X)` (US above, the
 *     owner of a property, the property of an extractor).
 * Symmetric relations sit side by side and belong to neither direction.
 */
export function handleEdgeTypes(selfType: string | undefined, otherType: string | undefined,
                                dir: HandleDir): string[] {
  const list = dir === "down" ? menuEdgeTypes(selfType, otherType) : menuEdgeTypes(otherType, selfType);
  return list.filter((e) => !isSymmetricEdgeType(e));
}

/** The «Nuovo» half of the maniglia dropped in the void, for one direction:
 *  every addable type the datamodel lets sit above (up) or below (down) X, one
 *  entry per edge — the same shape as `connectItems`. */
export function handleItems(ctx: AddContext, selType: string | undefined, dir: HandleDir): LinkedItem[] {
  if (ctx === "dtc") return dtcHandleItems(selType, dir);
  const out: LinkedItem[] = [];
  const selStrat = isStratigraphicType(selType);
  for (const c of addCategories(ctx).filter((k) => k.state !== "off"))
    for (const it of c.items) {
      if (isGroupType(it.nodeType)) continue;
      const pair = selStrat && isStratigraphicType(it.nodeType);
      for (const e of handleEdgeTypes(selType, it.nodeType, dir))
        out.push({ ...it, dir: dir === "down" ? "out" : "in", edgeType: e,
                   relation: pair ? (dir === "up" ? "above" : "below") : "for" });
    }
  return out;
}

/**
 * RISORSA-FILE · the maniglia in the DTC: «Sopra» is above IN THE DTC PICTURE.
 *
 * The DTC reverses `dtc_had_input` / `dtc_derived_from` (DTC_REVERSED_EDGES:
 * the target sits above), so the stratigraphic rule «source above target» put
 * half of the entries on the wrong side — measured: «Sopra» a mesh offered a
 * process via dtc_had_input, which the picture then drew BELOW. Here both
 * directions of every allowed edge are tried and kept when the new node lands
 * on the side asked for.
 *
 * Above a resource come also the DECLARED parents E.D. did not find on 30 Sep:
 * a set of photographs, a Blender object, a mesh, a textured mesh — not new
 * vocabulary (that is s3Dgraphy's), but the existing kinds (`photo`, `mesh`)
 * with a declared packaging, each drawn with its kind's glyph and the dashed
 * frame of «declared, not stamped».
 */
function dtcHandleItems(selType: string | undefined, dir: HandleDir): LinkedItem[] {
  const out: LinkedItem[] = [];
  const wantAbove = dir === "up";
  for (const c of addCategories("dtc").filter((k) => k.state !== "off"))
    for (const it of c.items) {
      if (isGroupType(it.nodeType)) continue;
      // new → X: the new node is the source
      for (const e of menuEdgeTypes(it.nodeType, selType)) {
        if (isSymmetricEdgeType(e)) continue;
        const newAbove = !DTC_REVERSED_EDGES.has(e);
        if (newAbove === wantAbove) out.push({ ...it, dir: "in", edgeType: e, relation: "for" });
      }
      // X → new: the new node is the target
      for (const e of menuEdgeTypes(selType, it.nodeType)) {
        if (isSymmetricEdgeType(e)) continue;
        const newAbove = DTC_REVERSED_EDGES.has(e);
        if (newAbove === wantAbove) out.push({ ...it, dir: "out", edgeType: e, relation: "for" });
      }
    }
  if (wantAbove && selType === "resource" && menuEdgeTypes("resource", "resource").includes("dtc_derived_from"))
    for (const p of DECLARED_PARENT_PRESETS)
      out.push({ nodeType: "resource", kind: p.kind, isResource: true, category: "declared",
        label: t(p.label), description: t("declared.menuHint"), alias: p.alias,
        preset: { data: { declared_only: true, declared_kind: p.declared, packaging: p.packaging,
                          ...(p.tier ? { tier: p.tier } : {}) } },
        dir: "out", edgeType: "dtc_derived_from", relation: "for" });
  return out;
}

/** DEV29 B1 · «Collegato a X» in the DTC: the maniglia's two halves, one entry
 *  per (kind, edge, direction). A study unit has none (the DTC chunks do not
 *  hang from the matrix); the declared parents of a resource stay with the
 *  maniglia «Sopra», where they are a choice of packaging, not a link. */
function dtcLinkedItems(selType: string): LinkedItem[] {
  if (isStratigraphicType(selType)) return [];
  const out: LinkedItem[] = [];
  const seen = new Set<string>();
  for (const dir of ["up", "down"] as HandleDir[])
    for (const it of dtcHandleItems(selType, dir)) {
      if (it.category === "declared") continue;
      const k = `${it.nodeType}|${it.kind ?? ""}|${it.dir}|${it.edgeType}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
  return out;
}

/** The declared parents of «Sopra»: EXISTING kinds (dtc_kinds: `photo` of the
 *  acquisition axis, `mesh` of the output axis — their glyphs) with a declared
 *  packaging (s3Dgraphy ResourceNode.PACKAGINGS). A textured mesh has no kind of
 *  its own in the vocabulary: it is a mesh whose packaging is a file_set (obj +
 *  mtl + textures), and the report says so. */
const DECLARED_PARENT_PRESETS: Array<{ label: string; alias: string; kind: string;
    declared: "sources" | "datablock" | "file"; packaging: string; tier?: string }> = [
  { label: "declared.menu.photos", alias: "photo set images", kind: "photo", declared: "sources", packaging: "directory" },
  { label: "declared.menu.blender", alias: "blender object datablock", kind: "mesh", declared: "datablock",
    packaging: "datablock", tier: "master" },
  { label: "declared.menu.mesh", alias: "mesh", kind: "mesh", declared: "file", packaging: "file" },
  { label: "declared.menu.textured", alias: "textured mesh obj mtl", kind: "mesh", declared: "file", packaging: "file_set" },
];

// ── COLLEGARE · linking to what already exists ────────────────────────────────

/**
 * The groups of «Collega a un nodo esistente», in menu order (E.D., desk v9b):
 * Documents, Units, Properties, Extractors, Combiners. The types are the
 * authoring surface's own (`SECTIONS`): every stratigraphic type is «Unità», and
 * the Paradata section's types are one group each. Anything else (groups,
 * context nodes, epochs) is not a link target here — an epoch is a lane, a group
 * is grouped, an ornament has its own row.
 */
export type LinkGroup = "document" | "strat" | "property" | "extractor" | "combiner";
const PARADATA_TYPES = SECTIONS.find((s) => s.label === "Paradata")?.types ?? [];
export const LINK_GROUP_ORDER: LinkGroup[] = [
  "document", "strat",
  ...(PARADATA_TYPES.filter((t) => t !== "document") as LinkGroup[]),
];

export function linkGroupOf(nodeType: string | undefined): LinkGroup | null {
  if (!nodeType) return null;
  if (isStratigraphicType(nodeType)) return "strat";
  return PARADATA_TYPES.includes(nodeType) ? (nodeType as LinkGroup) : null;
}

/** One entry of «Collega a un nodo esistente»: an edge between X and a node
 *  that is already in the graph. */
export interface ExistingLink {
  nodeId: string;
  nodeType: string;
  name: string;
  description: string;
  group: LinkGroup;
  edgeType: string;
  /** `out` = X → existing, `in` = existing → X */
  dir: "out" | "in";
  relation: "above" | "below" | "for";
}

/**
 * The existing nodes X can be linked to, from the SAME `allowedEdgeTypes` the
 * «Nuovo» entries read — one edge per (node, direction), the first the datamodel
 * lists, as `linkedItems` does for types.
 *
 * Two of `linkedItems`' filters are about CREATING and do not carry over: «a
 * unit links to a unit of its own type» (the next US in a sequence) and «no new
 * unit for a paradata node» (it would float with no lane). Linking an existing
 * USM above a US, or an existing US to a property, is the ordinary case.
 *
 * Left out: X itself, and a node already joined to X by that relation — under
 * any spelling, from either end when symmetric (`relationKey`), and for
 * `is_after` also in the opposite verso, which would close a cycle.
 *
 * `anchor`: the connector drag, whose SOURCE is decided (X → existing only),
 * with one entry per edge when the datamodel allows several — the same shape as
 * `connectItems`, so the pick is one gesture.
 */
export function existingLinks(
  doc: EmDocument,
  selId: string,
  opts: { anchor?: boolean } = {},
): ExistingLink[] {
  const nodes = doc.graph.nodes;
  const sel = nodes.find((n) => n.id === selId);
  if (!sel) return [];
  const selType = sel.node_type;
  const selStrat = isStratigraphicType(selType);
  const have = new Set(doc.graph.edges.map((e) => relationKey(e)));
  const joined = (source: string, target: string, edgeType: string): boolean =>
    have.has(relationKey({ source, target, edge_type: edgeType })) ||
    (edgeType === "is_after" && have.has(relationKey({ source: target, target: source, edge_type: edgeType })));
  const out: ExistingLink[] = [];
  for (const n of nodes) {
    if (n.id === selId) continue;
    const group = linkGroupOf(n.node_type);
    if (!group) continue;
    const base = {
      nodeId: n.id, nodeType: n.node_type, name: String(n.name ?? n.id),
      description: String(n.description ?? ""), group,
    };
    const tStrat = isStratigraphicType(n.node_type);
    if (opts.anchor) {
      if (connectValidity(selType, n.node_type) !== "valid") continue;
      for (const e of menuEdgeTypes(selType, n.node_type))
        if (!joined(selId, n.id, e)) out.push({ ...base, edgeType: e, dir: "out", relation: "for" });
      continue;
    }
    const pair = tStrat && selStrat;
    const firstOf = (from: string | undefined, to: string | undefined): string | undefined =>
      menuEdgeTypes(from, to).find((e) => !(pair && isSymmetricEdgeType(e)));
    const eo = firstOf(selType, n.node_type);
    if (eo && !joined(selId, n.id, eo))
      out.push({ ...base, edgeType: eo, dir: "out", relation: pair ? "below" : "for" });
    const ei = firstOf(n.node_type, selType);
    // the same relation read from the other end is one entry, not two
    if (ei && !(eo && !pair && ei === eo) && !joined(n.id, selId, ei))
      out.push({ ...base, edgeType: ei, dir: "in", relation: pair ? "above" : "for" });
  }
  const rank = (l: ExistingLink): number => (l.relation === "above" ? 0 : l.relation === "below" ? 1 : 2);
  return out.sort((a, b) =>
    LINK_GROUP_ORDER.indexOf(a.group) - LINK_GROUP_ORDER.indexOf(b.group) ||
    a.name.localeCompare(b.name, undefined, { numeric: true }) ||
    rank(a) - rank(b));
}

/** How many existing entries a group shows before «altri: scrivi per cercare». */
export const EXISTING_PER_GROUP = 6;

/** Does `q` find this existing node? Name, description, node_type. */
export function matchesExisting(l: ExistingLink, q: string): boolean {
  const ql = q.trim().toLowerCase();
  if (!ql) return true;
  return [l.name, l.description, l.nodeType, typeLabel(l.nodeType)]
    .some((s) => s.toLowerCase().includes(ql));
}

/**
 * A property linked to a second unit becomes SHARED: it now belongs to both.
 * Returns the owners (the units with `has_property` → it) when there are two or
 * more after the link, else null — the caller says so in the toast and the log.
 */
export function sharedPropertyOwners(doc: EmDocument, propertyId: string): string[] | null {
  const prop = doc.graph.nodes.find((n) => n.id === propertyId);
  if (!prop || prop.node_type !== "property") return null;
  const owners = [...new Set(doc.graph.edges
    .filter((e) => e.target === propertyId && e.edge_type === "has_property")
    .map((e) => e.source))];
  return owners.length > 1 ? owners : null;
}

/**
 * Link X to an existing node: the edge, and what the edge means, in ONE undo
 * step. An extractor attached to a document is NAMED by that edge (NAME1,
 * `renameOnAttach` — the same trigger `createEdge` uses), so «estrattore senza
 * documento → D.03» comes out as D.03.nn in the same step.
 */
export function applyExistingLink(
  store: DocumentStore,
  selId: string,
  link: Pick<ExistingLink, "nodeId" | "edgeType" | "dir">,
): { source: string; target: string; renamed: string | null; sharedWith: string[] | null } {
  const [source, target] = link.dir === "out" ? [selId, link.nodeId] : [link.nodeId, selId];
  let renamed: string | null = null;
  store.batch(() => {
    store.addEdge(source, target, link.edgeType);
    renamed = renameOnAttach(store.doc, source);
    if (renamed) store.updateNode(source, { name: renamed });
  });
  const sharedWith = link.edgeType === "has_property" ? sharedPropertyOwners(store.doc, target) : null;
  return { source, target, renamed, sharedWith };
}

/** Does `q` find this item? Label, node_type, description and category. */
export function matchesAdd(item: AddItem, q: string): boolean {
  const ql = q.trim().toLowerCase();
  if (!ql) return true;
  return [item.label, item.alias ?? "", item.nodeType, item.kind ?? "", item.description, item.category]
    .some((s) => s.toLowerCase().includes(ql));
}

/** True when `t` is a paradata type, which in Matrix waits for a selection. */
export function needsUnitInMatrix(ctx: AddContext, t: string): boolean {
  return ctx === "matrix" && isParadataType(t);
}

/** The context × type table, generated from the datamodel — for the night's
 *  report and for the check that the menu shows exactly this. */
export function contextTable(): { type: string; category: string; cells: Record<AddContext, CategoryState> }[] {
  const ctxs: AddContext[] = ["matrix", "graph", "dtc", "multigraph"];
  const rows: { type: string; category: string; cells: Record<AddContext, CategoryState> }[] = [];
  for (const c of addCategories("graph"))
    for (const it of c.items) {
      const key = it.kind ? `${it.nodeType}:${it.kind}` : it.nodeType;
      const cells = {} as Record<AddContext, CategoryState>;
      for (const x of ctxs) cells[x] = categoryState(x, c.id);
      rows.push({ type: key, category: c.id, cells });
    }
  return rows;
}

// ── the «ultimi tre tipi usati» ───────────────────────────────────────────────
const RECENT_KEY = "emstudio.addmenu.recent";

/** The last types added (most recent first), per viewer. Browser storage is a
 *  convenience here, never state: an empty or throwing store is an empty list. */
export function recentTypes(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function rememberType(key: string): void {
  try {
    const list = [key, ...recentTypes().filter((k) => k !== key)].slice(0, 3);
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* a viewer without storage simply has no recents */
  }
}

/** The key an item is remembered by (a DTC item needs its kind). */
export function itemKey(i: { nodeType: string; kind?: string }): string {
  return i.kind ? `${i.nodeType}:${i.kind}` : i.nodeType;
}

// ── where a node is born ──────────────────────────────────────────────────────

export interface AddPlan {
  /** group or lane the new node lands in (TOCCARE's rule), null = a free drop */
  target: DropTarget | null;
  /** the first epoch it is born into, or null */
  epochId: string | null;
}

/**
 * WHERE a new node of `type` goes when it is added at world (wx, wy) — decided
 * on the scene the user is looking at, before the node exists, with the rules
 * of a drop (`dropTargetAt`: a group's BODY takes the membership, its title bar
 * does not, Alt aims at the lane only).
 *
 * The epoch: a unit linked to a unit («US sopra X») is born in X's epoch; any
 * other unit in the lane — or phase band — under the cursor, also when a group
 * body took its membership (a unit with no epoch is a warning waiting to happen).
 * Only units take an epoch here; everything else inherits it from what it hangs
 * on, as it always has.
 */
export function planAdd(
  scene: Scene | null,
  doc: EmDocument,
  type: string,
  wx: number,
  wy: number,
  opts: { alt: boolean; matrix: boolean; otherId?: string },
): AddPlan {
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const target =
    opts.matrix && scene
      ? dropTargetAt(scene, wx, wy, {
          alt: opts.alt,
          forbidden: new Set(),
          own: new Set(),
          accepts: (gid) =>
            allowedEdgeTypes(type, byId.get(gid)?.node_type).some((e) => MEMBERSHIP_EDGES.has(e)),
        })
      : null;
  let epochId: string | null = null;
  if (isStratigraphicType(type)) {
    const other = opts.otherId ? byId.get(opts.otherId) : undefined;
    if (other && isStratigraphicType(other.node_type))
      epochId =
        doc.graph.edges.find((e) => e.source === other.id && e.edge_type === "has_first_epoch")
          ?.target ?? null;
    if (!epochId && opts.matrix && scene)
      epochId = (target?.kind === "lane" ? target : laneTargetAt(scene, wy))?.epochId ?? null;
  }
  return { target, epochId };
}
