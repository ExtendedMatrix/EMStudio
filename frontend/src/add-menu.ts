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
import type { Scene } from "./scene";
import type { EmDocument } from "./types";
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
  if (!selType || ctx === "dtc") return [];
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
      const eo = allowedEdgeTypes(selType, t)[0];
      if (eo && !(tStrat && !selStrat))
        out.push({
          ...it,
          dir: "out",
          edgeType: eo,
          relation: tStrat && selStrat && !isSymmetricEdgeType(eo) ? "below" : "for",
        });
      // new → X
      const ei = allowedEdgeTypes(t, selType)[0];
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
      for (const e of allowedEdgeTypes(srcType, it.nodeType))
        out.push({ ...it, dir: "out", edgeType: e, relation: "for" });
    }
  return out;
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
