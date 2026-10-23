// MICRO-GLIFI-OVERLAY-CONTINUITA p.3 · the CONTINUITY NODE (BR, `ContinuityNode`)
// says how long a unit lasts. Measured in the datamodel (s3Dgraphy 1.6, the
// GraphML importer `connect_nodes_to_epochs`): a BR is a node with no fields of
// its own, joined to its unit by `is_after` (BR → unit: the BR is the more
// recent one, drawn above) and to an epoch by `has_first_epoch` (BR → epoch).
// Of a REAL unit it is the end (removed, destroyed, relocated: the unit lives
// in the epochs between its own and the BR's); of a VIRTUAL unit it extends the
// life up to that epoch.
//
// The Matrix used to place it as any node (em-core, in its epoch's lane,
// wherever the ranking put it) and route its `is_after` with the orthogonal
// router: a long right-angled connector across the Matrix (GT16: SU002). Now
// the view draws it as the unit's own: the rhombus straight above the unit, in
// the lane of its epoch, and ONE vertical line from the unit to it, with an end
// bar (a real unit) or a survival arrow (a virtual one). The line is not routed
// with the other edges: it takes no port of the unit and makes no bridges.
//
// Pure: no DOM, no store (scripts/check-continuity.mjs).
import type { EmDocument, EmEdge, EmNode } from "./types";
import nodeDatamodel from "./assets/s3Dgraphy_node_datamodel.json";
import { entityEpoch, epochBounds, yearOf } from "./doc-dating";

export type ContinuityKind = "end" | "survive";

/** what a BR stands for: its unit and its epoch (null when not declared) */
export interface ContinuityLink {
  unit: string;
  epoch: string | null;
}

/** the BR ↔ unit and BR → epoch of a graph, read from its edges; `isBr` says
 *  which ids are continuity nodes. One unit per BR: the first `is_after`
 *  (BR → unit), else an `is_before` (unit → BR). */
export function continuityLinks(edges: readonly EmEdge[], isBr: (id: string) => boolean): Map<string, ContinuityLink> {
  const out = new Map<string, ContinuityLink>();
  const unitOf = new Map<string, string>();
  for (const e of edges) {
    if (e.edge_type === "is_after" && isBr(e.source) && !isBr(e.target) && !unitOf.has(e.source)) unitOf.set(e.source, e.target);
  }
  for (const e of edges) {
    if (e.edge_type === "is_before" && isBr(e.target) && !isBr(e.source) && !unitOf.has(e.target)) unitOf.set(e.target, e.source);
  }
  const epochOf = new Map<string, string>();
  for (const e of edges) if (e.edge_type === "has_first_epoch" && isBr(e.source) && !epochOf.has(e.source)) epochOf.set(e.source, e.target);
  for (const [br, unit] of unitOf) out.set(br, { unit, epoch: epochOf.get(br) ?? null });
  return out;
}

/** the kind of a unit's continuity: a virtual unit survives, a real one ends */
export function continuityKind(unitIsVirtual: boolean): ContinuityKind {
  return unitIsVirtual ? "survive" : "end";
}

interface Box { x: number; y: number; w: number; h: number }
interface Band { y: number; height: number }

/** the gap between a unit's top and its BR when both are in one lane, and
 *  between the BR and the near edge of its lane otherwise (world units) */
export const CONTINUITY_GAP = 18;

/**
 * Where the rhombus goes: centred on the unit, in the lane of its epoch — at
 * the lane's near edge (its bottom when the lane is above the unit, the
 * Matrix's newer epochs being on top), or just above the unit when the unit is
 * in that lane itself. No lane (the epoch not drawn): just above the unit.
 */
export function continuityPlace(unit: Box, br: { w: number; h: number }, lane: Band | null): { x: number; y: number } {
  const x = unit.x + unit.w / 2 - br.w / 2;
  const above = unit.y - CONTINUITY_GAP - br.h;
  if (!lane) return { x, y: above };
  const top = lane.y, bottom = lane.y + lane.height;
  // the unit is in the lane: just above it (never above the lane's top)
  if (unit.y + unit.h / 2 >= top && unit.y + unit.h / 2 <= bottom) return { x, y: Math.max(top + 2, above) };
  // the lane is above the unit: at its bottom edge, inside it
  if (bottom <= unit.y) return { x, y: Math.max(top + 2, bottom - CONTINUITY_GAP - br.h) };
  // the lane is below (an older epoch than the unit's: the data says so): at its top
  return { x, y: Math.min(bottom - br.h - 2, top + CONTINUITY_GAP) };
}

/** the line: from the unit's edge facing the BR to the BR's facing edge,
 *  vertical (both centred on the unit) */
export function continuityRoute(unit: Box, br: Box): { x: number; y: number }[] {
  const x = unit.x + unit.w / 2;
  if (br.y + br.h <= unit.y) return [{ x, y: br.y + br.h }, { x, y: unit.y }];
  if (br.y >= unit.y + unit.h) return [{ x, y: br.y }, { x, y: unit.y + unit.h }];
  return [{ x, y: br.y + br.h / 2 }, { x, y: unit.y + unit.h / 2 }];
}

/** The overlay «Continuity» switched off: the continuity nodes and their lines
 *  leave the drawn scene (the data stays in the graph). In place. */
export function dropContinuity<N extends { id: string; node: { node_type?: string } }, E extends { source: string; target: string }>(
  scene: { nodes: N[]; byId: Map<string, N>; edges: E[] },
  isBr: (nodeType: string | undefined) => boolean,
): number {
  const gone = new Set(scene.nodes.filter((n) => isBr(n.node.node_type)).map((n) => n.id));
  if (!gone.size) return 0;
  scene.nodes = scene.nodes.filter((n) => !gone.has(n.id));
  for (const id of gone) scene.byId.delete(id);
  scene.edges = scene.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target));
  return gone.size;
}

// ── «End in…» / «Survives until…» (p.3) ──────────────────────────────────────
//
// What the two gestures write, measured on the GT16 (TempluMare v4): SU002
// (II A.D.) with its BR in «XX sec» survives in «Post antiquity» AND «XX sec»
// — the BR's epoch is the last one the unit is in (it ends during it). So:
//   · the BR: `is_after` BR → unit, `has_first_epoch` BR → the chosen epoch;
//   · the unit: `survive_in_epoch` to every epoch after its first, up to the
//     chosen one INCLUDED (the others it had are taken away);
//   · the source: `has_documentation` BR → a document (the datamodel allows it
//     from any StratigraphicNode, the BR being one);
//   · the TYPE of the end (MICRO-SERVSF-FINE-ISTANZE p.2): the BR's
//     `data.end_reason`, declared since s3Dgraphy node datamodel 1.6.36
//     (`ContinuityNode.properties.end_reason`, E.D. 23 Oct 2026): destroyed,
//     transformed, removed, relocated, unknown — the default, which is NOT
//     written (a BR without a type is «unknown», and stays without one: the
//     round trip of s3Dgraphy's RDF keeps it so). The list, the default, the
//     CIDOC class each type decides are read from the datamodel, never here.

interface EndReasonRule {
  default?: string;
  values?: Record<string, string>;
  labels?: Record<string, string>;
  rdf?: { class_when?: Record<string, string>; unit_predicate_when?: Record<string, string>; concepts?: Record<string, string> };
}
const END_RULE: EndReasonRule = ((nodeDatamodel as unknown as {
  stratigraphic_nodes?: { StratigraphicNode?: { subtypes?: { BR?: { properties?: { end_reason?: EndReasonRule } } } } };
}).stratigraphic_nodes?.StratigraphicNode?.subtypes?.BR?.properties?.end_reason) ?? {};

/** the types of the end of a unit, in the datamodel's order */
export const END_REASONS: readonly string[] = Object.keys(END_RULE.values ?? {});
export type EndReason = string;
/** the datamodel's default («unknown»): what a BR without a type is */
export const END_REASON_DEFAULT: string = END_RULE.default ?? "unknown";

/** a BR's type: its `data.end_reason` when the datamodel knows it, else the default */
export function endReasonOf(data: unknown): string {
  const r = (data as { end_reason?: unknown } | null | undefined)?.end_reason;
  return typeof r === "string" && END_REASONS.includes(r) ? r : END_REASON_DEFAULT;
}
/** …and whether it is written (a type chosen), not the default by absence */
export function endReasonWritten(data: unknown): boolean {
  const r = (data as { end_reason?: unknown } | null | undefined)?.end_reason;
  return typeof r === "string" && END_REASONS.includes(r) && r !== END_REASON_DEFAULT;
}
/** the CIDOC class the type decides (`rdf.class_when`: E6, E81, E80, E9, E64) */
export function endReasonClass(reason: string): string | null {
  return END_RULE.rdf?.class_when?.[reason] ?? null;
}
/** the property the BR reaches its unit by (`rdf.unit_predicate_when`) */
export function endReasonPredicate(reason: string): string | null {
  return END_RULE.rdf?.unit_predicate_when?.[reason] ?? null;
}
/** the datamodel's English description of a type */
export function endReasonDescription(reason: string): string {
  return END_RULE.values?.[reason] ?? "";
}

export interface ContinuityRequest {
  unit: string;
  /** the epoch the unit ends in / survives until */
  epoch: string;
  /** the top-level epochs, OLDEST first */
  chrono: readonly string[];
  /** the unit's own first epoch (null: none declared) */
  firstEpoch: string | null;
  /** the unit's BR if it has one */
  br: string | null;
  /** a document backing it: a document id, null = none (taken away),
   *  undefined = leave as it is */
  source?: string | null;
  /** the type of the end: undefined = leave as it is, null or the default =
   *  none written (a BR without a type is the default, «unknown») */
  reason?: EndReason | null;
}

export interface ContinuityPlan {
  /** a new BR is needed (`br` null in the request) */
  createBr: boolean;
  /** edges to add; `"$br"` stands for the BR when it is created */
  add: { source: string; target: string; edge_type: string }[];
  /** edges to take away (ids of the graph's edges) */
  remove: string[];
  /** the BR's data.end_reason after the gesture (undefined: untouched; null:
   *  none written — the default) */
  reason?: EndReason | null;
  /** the epochs the unit survives in after the gesture */
  survives: string[];
}

export function planContinuity(edges: readonly (EmEdge & { id?: string })[], req: ContinuityRequest): ContinuityPlan {
  const br = req.br ?? "$br";
  const add: ContinuityPlan["add"] = [];
  const remove: string[] = [];
  const has = (s: string, t: string, type: string): boolean => edges.some((e) => e.source === s && e.target === t && e.edge_type === type);
  const idOf = (e: EmEdge & { id?: string }): string => e.id ?? `${e.source}__${e.edge_type}__${e.target}`;
  if (!req.br) add.push({ source: br, target: req.unit, edge_type: "is_after" });
  // the BR's epoch: one, the chosen
  if (req.br) for (const e of edges) if (e.source === req.br && e.edge_type === "has_first_epoch" && e.target !== req.epoch) remove.push(idOf(e));
  if (!req.br || !has(req.br, req.epoch, "has_first_epoch")) add.push({ source: br, target: req.epoch, edge_type: "has_first_epoch" });
  // the unit survives in the epochs after its first, up to the chosen included
  const i0 = req.firstEpoch ? req.chrono.indexOf(req.firstEpoch) : -1;
  const i1 = req.chrono.indexOf(req.epoch);
  const survives = i0 >= 0 && i1 > i0 ? req.chrono.slice(i0 + 1, i1 + 1) : [];
  const want = new Set(survives);
  for (const e of edges) if (e.source === req.unit && e.edge_type === "survive_in_epoch" && !want.has(e.target)) remove.push(idOf(e));
  for (const ep of survives) if (!has(req.unit, ep, "survive_in_epoch")) add.push({ source: req.unit, target: ep, edge_type: "survive_in_epoch" });
  // the source
  if (req.source !== undefined) {
    if (req.br) for (const e of edges) if (e.source === req.br && e.edge_type === "has_documentation" && e.target !== req.source) remove.push(idOf(e));
    if (req.source && (!req.br || !has(req.br, req.source, "has_documentation"))) add.push({ source: br, target: req.source, edge_type: "has_documentation" });
  }
  const reason = req.reason === undefined ? undefined
    : req.reason && req.reason !== END_REASON_DEFAULT && END_REASONS.includes(req.reason) ? req.reason : null;
  return { createBr: !req.br, add, remove, ...(reason !== undefined ? { reason } : {}), survives };
}

// ── the END of a unit, read (MICRO-SERVSF-FINE-ISTANZE p.2) ──────────────────
//
// The BR is a spatiotemporal unit like the others (s3Dgraphy node datamodel
// 1.6.36): paradata, its OWN start and end (`absolute_time_start` /
// `absolute_time_end`, properties as any unit's), and an epoch read by one
// rule, s3Dgraphy's `spatiotemporal.end_of_unit`: a date of its own → the epoch
// of the date (`own_date`); else the LAST epoch its unit lives in — the latest
// of the unit's `has_first_epoch` / `survive_in_epoch` by its start —
// (`inherited`); only when the unit has none, the BR's own `has_first_epoch`
// (`declared`). `scripts/check-continuity.mjs` compares it with s3Dgraphy.

export interface EndOfUnit {
  id: string;
  unit: string | null;
  units: string[];
  end_reason: string;
  cidoc_class: string | null;
  epoch: string | null;
  epoch_rule: "own_date" | "inherited" | "declared" | null;
  start: number | null;
  end: number | null;
}

const goneN = (x: { data?: unknown } | undefined): boolean => !!(x?.data as { removed?: unknown } | undefined)?.removed;
const goneE = (e: EmEdge): boolean => !!((e as { attributes?: unknown }).attributes as { removed?: unknown } | undefined)?.removed;

/** the year ONE of an entity's own dates says: the property (value, else
 *  description), else the node's own field (s3Dgraphy `own_time`) */
export function ownTime(doc: EmDocument, id: string, quale: "absolute_time_start" | "absolute_time_end",
                        byId: Map<string, EmNode> = new Map(doc.graph.nodes.map((n) => [n.id, n]))): number | null {
  for (const e of doc.graph.edges) {
    if (e.source !== id || e.edge_type !== "has_property" || goneE(e)) continue;
    const p = byId.get(e.target);
    if (!p || goneN(p) || p.node_type !== "property") continue;
    const pd = (p.data ?? {}) as Record<string, unknown>;
    if (pd.property_type !== quale && p.name !== quale) continue;
    const y = yearOf(pd.value) ?? yearOf(p.description);
    if (y != null) return y;
  }
  return yearOf(((byId.get(id)?.data ?? {}) as Record<string, unknown>)[quale]);
}

/** everything the graph says about the end of a unit — a BR; null for a node
 *  that is not one */
export function endOfUnit(doc: EmDocument, brId: string): EndOfUnit | null {
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const br = byId.get(brId);
  if (!br || br.node_type !== "BR" || goneN(br)) return null;
  const units: string[] = [];
  for (const e of doc.graph.edges) {
    if (goneE(e)) continue;
    if (e.edge_type === "is_after" && e.source === brId && !units.includes(e.target)) units.push(e.target);
    else if (e.edge_type === "is_before" && e.target === brId && !units.includes(e.source)) units.push(e.source);
  }
  const reason = endReasonOf(br.data);
  const start = ownTime(doc, brId, "absolute_time_start", byId), end = ownTime(doc, brId, "absolute_time_end", byId);
  let epoch: string | null = null;
  let rule: EndOfUnit["epoch_rule"] = null;
  if (start != null || end != null) {
    epoch = entityEpoch(doc, brId, epochBounds(doc), byId).epoch;
    rule = "own_date";
  }
  if (epoch == null && units.length) {
    const startOf = (id: string): number => yearOf(((byId.get(id)?.data ?? {}) as Record<string, unknown>).start_time) ?? -Infinity;
    const lanes = doc.graph.edges.filter((e) => !goneE(e) && e.source === units[0]
      && (e.edge_type === "has_first_epoch" || e.edge_type === "survive_in_epoch")).map((e) => e.target);
    if (lanes.length) {
      // the latest by its start; on a tie the first written (Python's max)
      let best = lanes[0];
      for (const l of lanes) if (startOf(l) > startOf(best)) best = l;
      epoch = best;
      rule = "inherited";
    }
  }
  if (epoch == null) {
    const d = doc.graph.edges.find((e) => !goneE(e) && e.source === brId && e.edge_type === "has_first_epoch");
    if (d) { epoch = d.target; rule = "declared"; }
  }
  return { id: brId, unit: units[0] ?? null, units, end_reason: reason, cidoc_class: endReasonClass(reason), epoch, epoch_rule: rule, start, end };
}
