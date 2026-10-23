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
import type { EmEdge } from "./types";

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
//   · the reason (a real unit: removed, destroyed, relocated): not in the
//     datamodel (s3Dgraphy 1.6, ContinuityNode has no field of its own) — kept
//     in the BR's `data.end_reason` until s3Dgraphy declares it (the report's
//     proposal).

export const END_REASONS = ["removed", "destroyed", "relocated"] as const;
export type EndReason = (typeof END_REASONS)[number];

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
  /** a real unit's reason: undefined = leave as it is, null = none */
  reason?: EndReason | null;
}

export interface ContinuityPlan {
  /** a new BR is needed (`br` null in the request) */
  createBr: boolean;
  /** edges to add; `"$br"` stands for the BR when it is created */
  add: { source: string; target: string; edge_type: string }[];
  /** edges to take away (ids of the graph's edges) */
  remove: string[];
  /** the BR's data.end_reason after the gesture (undefined: untouched) */
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
  return { createBr: !req.br, add, remove, ...(req.reason !== undefined ? { reason: req.reason } : {}), survives };
}
