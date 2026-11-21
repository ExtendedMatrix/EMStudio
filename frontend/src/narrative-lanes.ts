/**
 * MICRO-SEG23 (E.D., 21 Nov 2026, Narrative ▸ Write, «Narrates the lane») ·
 * WHAT A PART OF THE STORY NARRATES, IN ORDER OF TIME.
 *
 * The menu was a flat list: every epoch twice (a grey «2015» heading and a
 * «2015» choice), the newest on top, the activities hung under one epoch with
 * no shape. Now a TREE: the epochs (or, by a switch, the horizons of the
 * container's periodization) from the OLDEST to the most recent — the order a
 * story is read in, top to bottom, not the Matrix's newest-on-top — and inside
 * each its activities (ActivityNodeGroup, VAct…), in order, each line once with
 * its interval of dates. A third level, the functional units
 * (FunctionalUnitNodeGroup, LG2), has its place in the shape (`children` of an
 * activity) and is not filled today (`FUNCTIONAL_UNITS_SHOWN`).
 *
 * The DATA (s3Dgraphy `narrative_node.anchors_of` / `set_anchors`, the same
 * rule): a chapter narrates `anchor` (the first) + `anchors` (all, written only
 * when more than one) — a file with one lane is byte for byte what it was; a
 * section or a subsection narrates in the same two keys inside its `options`.
 *
 * Pure: no DOM, no store.
 */
import type { EmDocument, EmNode } from "./types";

// ── the field ────────────────────────────────────────────────────────────────

type Part = { block_type?: string; anchor?: unknown; anchors?: unknown; options?: Record<string, unknown> } | null | undefined;

/** The ids a chapter or a heading narrates, in order, without repeats. Any
 *  other block narrates nothing. */
export function anchorsOf(part: Part): string[] {
  if (!part || typeof part !== "object") return [];
  let src: Record<string, unknown>;
  if (part.block_type !== undefined) {
    if (part.block_type !== "heading") return [];
    src = (part.options ?? {}) as Record<string, unknown>;
  } else src = part as Record<string, unknown>;
  const out: string[] = [];
  const list = Array.isArray(src.anchors) ? src.anchors : [];
  for (const v of [src.anchor, ...list]) if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  return out;
}

/** Write the ids the compatible way: `anchor` the first, `anchors` only when
 *  there is more than one, both gone when none. */
export function setAnchorsOn(target: Record<string, unknown>, ids: string[]): void {
  const clean: string[] = [];
  for (const v of ids) if (typeof v === "string" && v && !clean.includes(v)) clean.push(v);
  delete target.anchors;
  if (!clean.length) { delete target.anchor; return; }
  target.anchor = clean[0];
  if (clean.length > 1) target.anchors = clean;
}

/** Every act of narrating, in reading order (`block` null for the chapter). */
export function narratedParts(chapters: readonly unknown[]): { chapter: number; block: number | null; ref: string }[] {
  const rows: { chapter: number; block: number | null; ref: string }[] = [];
  chapters.forEach((c, ci) => {
    const ch = c as { blocks?: unknown[] } | null;
    if (!ch || typeof ch !== "object") return;
    for (const ref of anchorsOf(ch as Part)) rows.push({ chapter: ci, block: null, ref });
    (ch.blocks ?? []).forEach((b, bi) => {
      for (const ref of anchorsOf(b as Part)) rows.push({ chapter: ci, block: bi, ref });
    });
  });
  return rows;
}

// ── the tree ────────────────────────────────────────────────────────────────

/** The third level (the functional units of an activity) is in the shape and
 *  not shown yet. */
export const FUNCTIONAL_UNITS_SHOWN = false;

export type LaneKind = "epoch" | "horizon" | "activity" | "functional_unit" | "none";
export interface LaneItem {
  id: string;
  kind: LaneKind;
  name: string;
  start: number | null;
  end: number | null;
  children: LaneItem[];
}
export type LaneMode = "epochs" | "horizons";
export interface HorizonLike { id: string; name: string; start: number | null; end: number | null }

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const datesOf = (n: EmNode): { start: number | null; end: number | null } => {
  const d = (n.data ?? {}) as Record<string, unknown>;
  const start = num(d.start_time ?? d.start ?? (n as Record<string, unknown>).start_time);
  const end = num(d.end_time ?? d.end ?? (n as Record<string, unknown>).end_time);
  return { start, end };
};
const nameOf = (n: EmNode): string => String(n.name || n.id);
const natural = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Oldest first: by start, then end, an undated one after the dated, then by
 *  name (naturally: VAct.2 before VAct.10). */
export function byTime(a: { start: number | null; end: number | null; name: string },
                       b: { start: number | null; end: number | null; name: string }): number {
  const ka = a.start ?? a.end, kb = b.start ?? b.end;
  if (ka === null && kb !== null) return 1;
  if (kb === null && ka !== null) return -1;
  return (ka ?? 0) - (kb ?? 0) || (a.end ?? ka ?? 0) - (b.end ?? kb ?? 0) || natural(a.name, b.name);
}

function overlaps(a: { start: number | null; end: number | null }, h: { start: number | null; end: number | null }): boolean {
  const as = a.start ?? a.end, ae = a.end ?? a.start;
  if (as === null || ae === null) return false;
  return (h.start === null || ae >= h.start) && (h.end === null || as <= h.end);
}

/**
 * The lanes a part may narrate, as a tree in time order. `epochs`: the epochs,
 * each with its activities (an activity is in the epoch it `has_first_epoch`).
 * `horizons`: the horizons given (the container's chosen periodization), each
 * with the activities whose epoch's interval overlaps it — an activity under
 * the FIRST such horizon only, so every line is there once. Activities in no
 * epoch (no horizon) close the list under a `none` item.
 */
export function laneTree(doc: EmDocument | null, mode: LaneMode = "epochs", horizons: HorizonLike[] = []): LaneItem[] {
  const nodes = (doc?.graph?.nodes ?? []).filter((n) => !((n.data ?? {}) as Record<string, unknown>).removed);
  const edges = (doc?.graph?.edges ?? []).filter((e) => !(e as { removed?: unknown }).removed);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isEpoch = (n?: EmNode) => !!n && (n.node_type === "EpochNode" || n.node_type === "epoch");
  const item = (n: EmNode, kind: LaneKind): LaneItem => ({ id: n.id, kind, name: nameOf(n), ...datesOf(n), children: [] });
  const epochOf = new Map<string, string>();
  for (const e of edges)
    if (e.edge_type === "has_first_epoch" && isEpoch(byId.get(e.target)) && !epochOf.has(e.source)) epochOf.set(e.source, e.target);
  const acts = nodes.filter((n) => n.node_type === "ActivityNodeGroup").map((a) => {
    const it = item(a, "activity");
    // an activity with no dates of its own sorts by its epoch's
    const ep = byId.get(epochOf.get(a.id) ?? "");
    const at = ep ? datesOf(ep) : { start: null, end: null };
    return { it, epoch: epochOf.get(a.id) ?? null, key: { start: it.start ?? at.start, end: it.end ?? at.end, name: it.name } };
  });
  const sortActs = (xs: typeof acts) => xs.sort((a, b) => byTime(a.key, b.key)).map((x) => x.it);
  const out: LaneItem[] = [];
  const placed = new Set<string>();
  if (mode === "horizons" && horizons.length) {
    for (const h of [...horizons].sort(byTime)) {
      const it: LaneItem = { id: h.id, kind: "horizon", name: h.name, start: h.start, end: h.end, children: [] };
      const inside = acts.filter((a) => !placed.has(a.it.id) && a.epoch && overlaps(datesOf(byId.get(a.epoch)!), h));
      inside.forEach((a) => placed.add(a.it.id));
      it.children = sortActs(inside);
      out.push(it);
    }
  } else {
    const epochs = nodes.filter((n) => isEpoch(n)).map((e) => item(e, "epoch")).sort(byTime);
    for (const e of epochs) {
      const inside = acts.filter((a) => a.epoch === e.id);
      inside.forEach((a) => placed.add(a.it.id));
      e.children = sortActs(inside);
      out.push(e);
    }
  }
  const rest = acts.filter((a) => !placed.has(a.it.id));
  if (rest.length) out.push({ id: "", kind: "none", name: "", start: null, end: null, children: sortActs(rest) });
  return out;
}

/** Every item of the tree, depth first (the order the picker lists them). */
export function flattenLanes(tree: LaneItem[]): LaneItem[] {
  const out: LaneItem[] = [];
  const walk = (xs: LaneItem[]) => xs.forEach((x) => { if (x.kind !== "none") out.push(x); walk(x.children); });
  walk(tree);
  return out;
}

/** «1 – 100», «−753 – −509», «1450»: the interval beside a line (empty when
 *  undated). A minus sign, not a hyphen, before a year BC. */
export function intervalLabel(start: number | null, end: number | null): string {
  const y = (v: number) => (v < 0 ? `−${-v}` : String(v));
  if (start === null && end === null) return "";
  if (start === null) return `… – ${y(end!)}`;
  if (end === null || end === start) return y(start);
  return `${y(start)} – ${y(end)}`;
}

/** What ticking an epoch with activities as subsections would create: the
 *  activities of the epoch the part does not narrate yet in its run (a heading
 *  that already narrates the activity is left, never made twice). */
export function missingActivityHeadings(epoch: LaneItem, existing: readonly unknown[]): LaneItem[] {
  const have = new Set<string>();
  for (const b of existing) for (const id of anchorsOf(b as Part)) have.add(id);
  return epoch.children.filter((a) => a.kind === "activity" && !have.has(a.id));
}
