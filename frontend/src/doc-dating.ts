// MICRO-BADGE-PD-CRONOLOGIA · the dating of a document, read once for the
// Inspector's «Dating of the document», the warnings and the checks — the same
// reading em-core makes to choose a document's lane (`layout.rs`, `dated_doc`):
//
//   · its YEAR is `absolute_time_start`: the property (`has_property`, the form
//     s3Dgraphy's GraphML importer gives it), else the node's own
//     `data.absolute_time_start` (the copy the importer keeps beside it);
//   · its EPOCH is the narrowest epoch (or phase) whose bounds hold that year,
//     else its `has_first_epoch`.
//
// Pure: a document in, no store (runs in node).
import type { EmDocument, EmNode } from "./types";
import { isRemoved } from "./crdt";

// a tombstone (CRDT) is not there
const gone = (x: unknown): boolean => !x || isRemoved(x as Parameters<typeof isRemoved>[0]);

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

const isStart = (p: EmNode | undefined): boolean =>
  !!p && p.node_type === "property" && (p.name === "absolute_time_start"
    || ((p.data ?? {}) as Record<string, unknown>).property_type === "absolute_time_start");

/** the value of a property (description first, as `paradata-chain.propertyValue`) */
const valueOf = (p: EmNode): string => {
  const d = String(p.description ?? "").trim();
  if (d) return d;
  const v = ((p.data ?? {}) as Record<string, unknown>).value;
  return v == null ? "" : String(v).trim();
};

export interface DocumentDating {
  /** the `absolute_time_start` property, if any */
  property: string | null;
  /** its value, and the node's own field */
  propertyValue: string;
  dataValue: string;
  /** the year (property, else data), null when none or not a number */
  year: number | null;
  /** `has_first_epoch` */
  declaredEpoch: string | null;
  /** the narrowest epoch whose bounds hold the year */
  yearEpoch: string | null;
  /** where the document stands: `yearEpoch`, else `declaredEpoch` */
  epoch: string | null;
}

export interface EpochBounds { id: string; lo: number; hi: number }

export function epochBounds(doc: EmDocument): EpochBounds[] {
  const out: EpochBounds[] = [];
  for (const n of doc.graph.nodes) {
    if (n.node_type !== "EpochNode" && n.node_type !== "epoch") continue;
    const d = (n.data ?? {}) as Record<string, unknown>;
    const a = num(d.start_time), b = num(d.end_time);
    if (a == null || b == null) continue;
    out.push({ id: n.id, lo: Math.min(a, b), hi: Math.max(a, b) });
  }
  return out;
}

/** the narrowest epoch (or phase) holding `year` */
export function epochHolding(bounds: EpochBounds[], year: number): EpochBounds | null {
  let best: EpochBounds | null = null;
  for (const b of bounds)
    if (year >= b.lo && year <= b.hi && (!best || b.hi - b.lo < best.hi - best.lo)) best = b;
  return best;
}

export function documentDating(doc: EmDocument, docId: string, bounds = epochBounds(doc)): DocumentDating {
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  let property: string | null = null;
  let declaredEpoch: string | null = null;
  for (const e of doc.graph.edges) {
    if (e.source !== docId || gone(e) || gone(byId.get(e.target))) continue;
    if (e.edge_type === "has_property" && !property && isStart(byId.get(e.target))) property = e.target;
    if (e.edge_type === "has_first_epoch" && !declaredEpoch && byId.has(e.target)) declaredEpoch = e.target;
  }
  const propertyValue = property ? valueOf(byId.get(property)!) : "";
  const dv = ((byId.get(docId)?.data ?? {}) as Record<string, unknown>).absolute_time_start;
  const dataValue = dv == null ? "" : String(dv).trim();
  const year = num(propertyValue) ?? num(dataValue);
  const yearEpoch = year != null ? epochHolding(bounds, year)?.id ?? null : null;
  return { property, propertyValue, dataValue, year, declaredEpoch, yearEpoch, epoch: yearEpoch ?? declaredEpoch };
}

/** the top-level epoch of an epoch or phase (`has_sub_epoch` upwards) */
export function topEpochOf(doc: EmDocument, id: string): string {
  const parent = new Map<string, string>();
  for (const e of doc.graph.edges) if (e.edge_type === "has_sub_epoch") parent.set(e.target, e.source);
  let cur = id;
  const seen = new Set<string>();
  while (parent.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parent.get(cur)!; }
  return cur;
}
