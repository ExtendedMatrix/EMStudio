/**
 * MICRO-LAB orizzonti · SEEING BY HORIZONS.
 *
 * Decisions of E.D. (24 Oct 2026): an horizon is a node of the MULTIGRAPH, at
 * the level of the container — the member `graphs.periodizations`
 * (`data.em_collection: "Periodizations"`, `s3dgraphy.periodization`), routed
 * like the shelf and the DTC corpus, never a study graph. A periodization
 * (E32) lists its horizons (crmgeo:SP10) through `is_in_periodization`. Several
 * periodizations per project; the person chooses which one to read with.
 * «Inside» is the OVERLAP: a unit is in an horizon when its interval intersects
 * it. The colours travel with the data.
 *
 * The intervals are NOT computed here (invariant 2, no port of s3dgraphy): they
 * are `Graph.chronology()` and `Graph.epoch_intervals()`, asked of the bridge
 * (`chron-bridge.ts`). This module only reads the member, compares intervals
 * with the rule of `s3dgraphy.periodization.overlaps` — the same cases are
 * checked in node (scripts/check-horizons.mjs) — and says, per node, which
 * colour and whether it is outside.
 *
 * Pure: no DOM, no store.
 */

export const PERIODIZATIONS_COLLECTION = "Periodizations";
export const PERIODIZATIONS_MEMBER_ID = "periodizations";
export const PERIODIZATION_TYPE = "periodization";
export const HORIZON_TYPE = "horizon";
export const MEMBERSHIP_EDGE = "is_in_periodization";

type Section = { graph_id?: unknown; data?: Record<string, unknown>; nodes?: unknown[]; edges?: unknown[] };
type RawNode = { id: string; node_type?: string; name?: string; description?: string;
                 data?: Record<string, unknown>; removed?: unknown };
type RawEdge = { source: string; target: string; edge_type?: string; removed?: unknown };

export interface Horizon {
  id: string;
  name: string;
  start: number | null;
  end: number | null;
  color: string;
  /** MICRO-SEG16 · the `data.order` the file carries, read for compatibility
   *  only: the ORDER of the horizons is their dates' (`byDate`). Written for a
   *  new horizon (its place in time), never rewritten behind the person. */
  order: number;
  /** EM Tools' CronoFilter flag (in use); a horizon not in use starts hidden */
  enabled: boolean;
}

export interface Periodization {
  id: string;
  name: string;
  description: string;
  source: string | null;
  horizons: Horizon[];
}

export interface PeriodizationsRead {
  list: Periodization[];
  /** the one the FILE proposes (`data.active_periodization`), else the first */
  active: string | null;
}

/** Is this container member the periodizations? From the MARKER. */
export function isPeriodizationsSection(section: unknown): boolean {
  const data = (section as Section | null)?.data;
  return !!data && data.em_collection === PERIODIZATIONS_COLLECTION;
}

/** An empty member, tagged as one. */
export function newPeriodizationsSection(id: string = PERIODIZATIONS_MEMBER_ID): Record<string, unknown> {
  return { graph_id: id, name: "Periodizations",
           data: { em_collection: PERIODIZATIONS_COLLECTION }, nodes: [], edges: [] };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A tombstoned node or edge (P4.1) is not there. */
const live = (x: { removed?: unknown }): boolean => !x.removed;

/**
 * MICRO-SEG16 (E.D., 21 Nov 2026: «non deve seguire le epoche dalle date?») ·
 * horizons are intervals of time and their order is their DATES': by «From»,
 * then by «To», oldest first — an open «From» is the oldest, an open «To» the
 * latest. The file's `order` only breaks a tie of identical dates, then the
 * name. Views that list them newest on top (the Matrix's bands, the panel)
 * read this order backwards.
 */
export function byDate(a: Horizon, b: Horizon): number {
  return (a.start ?? -Infinity) - (b.start ?? -Infinity) || (a.end ?? Infinity) - (b.end ?? Infinity)
    || a.order - b.order || a.name.localeCompare(b.name);
}

/** The periodizations of the member, each with its horizons in time order. */
export function readPeriodizations(section: unknown): PeriodizationsRead {
  const sec = (section ?? {}) as Section;
  const nodes = ((sec.nodes ?? []) as RawNode[]).filter((n) => n && live(n));
  const edges = ((sec.edges ?? []) as RawEdge[]).filter((e) => e && live(e));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const list: Periodization[] = [];
  for (const p of nodes) {
    if (p.node_type !== PERIODIZATION_TYPE) continue;
    const horizons: Horizon[] = [];
    for (const e of edges) {
      if (e.edge_type !== MEMBERSHIP_EDGE || e.target !== p.id) continue;
      const h = byId.get(e.source);
      if (!h || h.node_type !== HORIZON_TYPE) continue;
      const d = h.data ?? {};
      horizons.push({
        id: h.id,
        name: String(h.name ?? h.id),
        start: num(d.start_time),
        end: num(d.end_time),
        color: String(d.color ?? "#888888"),
        order: num(d.order) ?? 0,
        enabled: d.enabled !== false && d.enabled !== "false",
      });
    }
    horizons.sort(byDate);
    list.push({ id: p.id, name: String(p.name ?? p.id), description: String(p.description ?? ""),
                source: (p.data?.source as string | undefined) ?? null, horizons });
  }
  const proposed = sec.data?.active_periodization;
  const active = list.some((p) => p.id === proposed) ? String(proposed) : list[0]?.id ?? null;
  return { list, active };
}

export type Interval = [number | null, number | null];

/**
 * «Inside» an horizon = the two intervals INTERSECT — the rule of
 * `s3dgraphy.periodization.overlaps`, case for case: a missing bound is open;
 * intervals that only touch do not overlap (contiguous horizons do not share
 * their border units); a point on a border is inside; an interval with no bound
 * at all is not dated and overlaps nothing.
 */
export function overlaps(iv: Interval, h: Interval): boolean {
  const [s1, e1] = iv;
  const [s2, e2] = h;
  if (s1 === null && e1 === null) return false;
  let lo1 = s1 ?? -Infinity, hi1 = e1 ?? Infinity;
  let lo2 = s2 ?? -Infinity, hi2 = e2 ?? Infinity;
  if (lo1 > hi1) [lo1, hi1] = [hi1, lo1];
  if (lo2 > hi2) [lo2, hi2] = [hi2, lo2];
  if (lo1 === hi1 || lo2 === hi2) return lo1 <= hi2 && lo2 <= hi1;
  return lo1 < hi2 && lo2 < hi1;
}

/** How the views read the chosen periodization: not at all, colouring the
 *  nodes, or colouring and FILTERING (what falls in no visible horizon fades). */
export type HorizonMode = "off" | "colour" | "filter";

export interface HorizonView {
  mode: HorizonMode;
  /** the periodization chosen in THIS session (null = the file's) */
  periodizationId: string | null;
  /** horizons switched off in this session (view state, never in the file) */
  hidden: Set<string>;
}

export interface HorizonMarks {
  /** node id → the colour of the FIRST visible horizon (in the periodization's
   *  order) its interval overlaps */
  tint: Map<string, string>;
  /** node id → every visible horizon it overlaps (for the tooltip / the count) */
  inside: Map<string, string[]>;
  /** filter mode: DATED nodes that fall in no visible horizon. An undated node
   *  is never faded — nobody knows it is outside. */
  fade: Set<string>;
}

/** The periodization a view reads: the session's choice, else the file's. */
export function chosenPeriodization(read: PeriodizationsRead, view: HorizonView): Periodization | null {
  const id = view.periodizationId && read.list.some((p) => p.id === view.periodizationId)
    ? view.periodizationId : read.active;
  return read.list.find((p) => p.id === id) ?? null;
}

/** What a horizon not in use (`enabled: false`) means for the view: hidden
 *  until the person shows it. */
export function initialHidden(per: Periodization | null): Set<string> {
  return new Set((per?.horizons ?? []).filter((h) => !h.enabled).map((h) => h.id));
}

/**
 * The marks of the nodes of one graph, from its computed intervals (unit,
 * document, author: `chronology()`; epoch: `epoch_intervals()`). The SAME
 * horizon applies to every graph of the studio: the caller passes the
 * intervals of whichever graph a view shows.
 */
export function horizonMarks(per: Periodization | null, view: HorizonView,
                             intervals: Map<string, Interval>): HorizonMarks {
  const out: HorizonMarks = { tint: new Map(), inside: new Map(), fade: new Set() };
  if (!per || view.mode === "off") return out;
  const visible = per.horizons.filter((h) => !view.hidden.has(h.id));
  for (const [id, iv] of intervals) {
    if (iv[0] === null && iv[1] === null) continue;
    const hits = visible.filter((h) => overlaps(iv, [h.start, h.end]));
    if (hits.length) {
      out.tint.set(id, hits[0].color);
      out.inside.set(id, hits.map((h) => h.id));
    } else if (view.mode === "filter") {
      out.fade.add(id);
    }
  }
  return out;
}

/** The intervals of a graph from the bridge's answer: the chronology of the
 *  units and the effective intervals of the epochs (sub-epochs restricted). */
export function intervalsFrom(chronology: Record<string, { start: number | null; end: number | null }>,
                              epochs?: Record<string, { start: number | null; end: number | null }> | null):
                              Map<string, Interval> {
  const m = new Map<string, Interval>();
  for (const [id, e] of Object.entries(chronology ?? {})) m.set(id, [num(e.start), num(e.end)]);
  for (const [id, e] of Object.entries(epochs ?? {})) m.set(id, [num(e.start), num(e.end)]);
  return m;
}

/** MICRO-SEG16 · what the panel says on a horizon's row: a «From» after its
 *  «To», and against the horizon before and after it IN TIME, the years they
 *  overlap or leave uncovered. Nothing is corrected: the person decides. */
export type HorizonCheck =
  | { kind: "inverted"; from: number; to: number }
  | { kind: "overlap" | "gap"; other: string; years: number; from: number; to: number };

export function horizonChecks(per: Periodization | null): Map<string, HorizonCheck[]> {
  const out = new Map<string, HorizonCheck[]>();
  const hs = per?.horizons ?? [];
  const add = (id: string, c: HorizonCheck) => {
    if (!out.has(id)) out.set(id, []);
    out.get(id)!.push(c);
  };
  for (const h of hs)
    if (h.start !== null && h.end !== null && h.start > h.end) add(h.id, { kind: "inverted", from: h.start, to: h.end });
  for (let i = 1; i < hs.length; i++) {
    const a = hs[i - 1], b = hs[i];
    if (a.end === null || b.start === null) continue;   // an open bound: nothing to measure
    if (a.end > b.start) {
      const from = b.start, to = b.end === null ? a.end : Math.min(a.end, b.end);
      add(a.id, { kind: "overlap", other: b.id, years: to - from, from, to });
      add(b.id, { kind: "overlap", other: a.id, years: to - from, from, to });
    } else if (a.end < b.start) {
      const from = a.end, to = b.start;
      add(a.id, { kind: "gap", other: b.id, years: to - from, from, to });
      add(b.id, { kind: "gap", other: a.id, years: to - from, from, to });
    }
  }
  return out;
}

/** MICRO-SEG16 · the interval «+ Horizon» proposes: right after the LAST in
 *  time (From = its To), a hundred years long. */
export function nextInterval(per: Periodization | null): { start: number; end: number } {
  const hs = per?.horizons ?? [];
  const last = hs[hs.length - 1];
  const start = last ? (last.end ?? last.start ?? 0) : 0;
  return { start, end: start + 100 };
}

/** A pleasant next colour for a new horizon (cycled; a person picks another). */
export const HORIZON_SWATCHES = ["#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#16a085",
                                 "#2980b9", "#8e44ad", "#7f8c8d"];
export function nextSwatch(per: Periodization | null): string {
  return HORIZON_SWATCHES[(per?.horizons.length ?? 0) % HORIZON_SWATCHES.length];
}
