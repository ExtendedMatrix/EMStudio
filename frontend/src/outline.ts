/**
 * STUDIO · the outliner BY EPOCH — the shape of the list, as data.
 *
 * The desk's outliner (`drawUnits`, scrivania v5) reads a stratigraphic record
 * the way an archaeologist does: epoch by epoch, newest on top, each unit under
 * the epoch it was born in, and the units a container holds indented beneath it.
 * This module computes that shape and nothing else — `nodelist.ts` draws it.
 *
 * Pure, so it is checkable in node without a DOM (`check-outline.mjs`).
 *
 * Two readings are ASSERTIONS of the graph, never inferences:
 *  · the nesting of epochs is `has_sub_epoch` (the importer's assertion,
 *    `unified_xlsx_importer.py`), never "this span sits inside that one";
 *  · a unit's epoch is its `has_first_epoch` target.
 * The dates only ORDER siblings (newest first, like the lanes: invariant 4).
 */
import type { EmDocument, EmNode } from "./types";

export interface OutlineUnit {
  node: EmNode;
  /** depth under its container: 0 = a root of its epoch, 1 = a member, … */
  depth: number;
}

export interface OutlineEpoch {
  node: EmNode;
  /** 0 = top-level epoch, 1 = sub-epoch, … */
  depth: number;
  start: number | null;
  end: number | null;
  units: OutlineUnit[];
}

export interface Outline {
  epochs: OutlineEpoch[];
  /** stratigraphic units with no `has_first_epoch` */
  unplaced: OutlineUnit[];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const epochStart = (n: EmNode): number | null =>
  num((n.data as Record<string, unknown> | undefined)?.start_time);
export const epochEnd = (n: EmNode): number | null =>
  num((n.data as Record<string, unknown> | undefined)?.end_time);

/** "1100–1350", "?–1350", or "" when neither bound is known. */
export function epochSpan(n: EmNode): string {
  const s = epochStart(n);
  const e = epochEnd(n);
  if (s == null && e == null) return "";
  return `${s ?? "?"}–${e ?? "?"}`;
}

/**
 * Build the outline.
 *
 * @param nodes the LIVE nodes (the caller filters tombstones, like every view)
 * @param isUnit which node types count as units (stratigraphic, from the
 *   datamodel — injected so this module does not import the rules)
 * @param match an optional filter: a unit that fails it is left out, and a
 *   container is kept when any of its members passes (so the match stays in
 *   context). Epochs with nothing left are dropped while filtering.
 */
export function buildOutline(
  doc: EmDocument,
  nodes: EmNode[],
  isUnit: (nodeType: string | undefined) => boolean,
  match?: (n: EmNode) => boolean,
): Outline {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = doc.graph.edges ?? [];
  const firstEpoch = new Map<string, string>();
  const subOf = new Map<string, string>();       // sub-epoch → parent epoch
  const children = new Map<string, string[]>();  // epoch → sub-epochs
  const partOf = new Map<string, string>();      // member → container (first)
  const members = new Map<string, string[]>();   // container → members
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (e.edge_type === "has_first_epoch" && !firstEpoch.has(e.source))
      firstEpoch.set(e.source, e.target);
    else if (e.edge_type === "has_sub_epoch") {
      subOf.set(e.target, e.source);
      children.set(e.source, [...(children.get(e.source) ?? []), e.target]);
    } else if (e.edge_type === "is_part_of" && !partOf.has(e.source)) {
      partOf.set(e.source, e.target);
      members.set(e.target, [...(members.get(e.target) ?? []), e.source]);
    }
  }

  const units = nodes.filter((n) => isUnit(n.node_type));
  const unitIds = new Set(units.map((u) => u.id));
  const byName = (a: EmNode, b: EmNode): number =>
    String(a.name || a.id).localeCompare(String(b.name || b.id), undefined,
                                         { numeric: true });
  const newestFirst = (a: EmNode, b: EmNode): number =>
    (epochStart(b) ?? -Infinity) - (epochStart(a) ?? -Infinity) || byName(a, b);

  // a unit passes when it matches, or when one of its (recursive) members does
  const passes = new Map<string, boolean>();
  const passOf = (id: string, seen = new Set<string>()): boolean => {
    if (!match) return true;
    const known = passes.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return false;
    seen.add(id);
    const n = byId.get(id)!;
    const r = match(n) ||
      (members.get(id) ?? []).some((m) => unitIds.has(m) && passOf(m, seen));
    passes.set(id, r);
    return r;
  };

  /** the units of ONE epoch, containers first with their members indented */
  const unitsOf = (inEpoch: (u: EmNode) => boolean): OutlineUnit[] => {
    const here = units.filter(inEpoch);
    const hereIds = new Set(here.map((u) => u.id));
    const out: OutlineUnit[] = [];
    const placed = new Set<string>();
    const walk = (u: EmNode, depth: number): void => {
      if (placed.has(u.id) || !passOf(u.id)) return;
      placed.add(u.id);
      out.push({ node: u, depth });
      const ms = (members.get(u.id) ?? [])
        .map((m) => byId.get(m)!)
        .filter((m) => hereIds.has(m.id))
        .sort(byName);
      for (const m of ms) walk(m, depth + 1);
    };
    // roots: a unit whose container is not in this same epoch
    for (const u of here.filter((u) => !hereIds.has(partOf.get(u.id) ?? "")).sort(byName))
      walk(u, 0);
    return out;
  };

  const epochs: OutlineEpoch[] = [];
  const isEpoch = (n: EmNode): boolean => n.node_type === "EpochNode";
  const visit = (ep: EmNode, depth: number, seen: Set<string>): void => {
    if (seen.has(ep.id)) return;
    seen.add(ep.id);
    epochs.push({
      node: ep, depth, start: epochStart(ep), end: epochEnd(ep),
      units: unitsOf((u) => firstEpoch.get(u.id) === ep.id),
    });
    const subs = (children.get(ep.id) ?? []).map((c) => byId.get(c)!)
      .filter(Boolean).sort(newestFirst);
    for (const s of subs) visit(s, depth + 1, seen);
  };
  const seen = new Set<string>();
  for (const ep of nodes.filter((n) => isEpoch(n) && !subOf.has(n.id)).sort(newestFirst))
    visit(ep, 0, seen);

  const unplaced = unitsOf((u) => !firstEpoch.has(u.id) ||
                                  !byId.has(firstEpoch.get(u.id)!));

  // while filtering, an epoch with nothing left says nothing — unless one of its
  // sub-epochs still has something, in which case it stays as their heading
  if (match) {
    const keep = new Set<string>();
    for (let i = epochs.length - 1; i >= 0; i--) {
      const e = epochs[i];
      const kidKept = (children.get(e.node.id) ?? []).some((c) => keep.has(c));
      if (e.units.length || kidKept) keep.add(e.node.id);
    }
    return { epochs: epochs.filter((e) => keep.has(e.node.id)), unplaced };
  }
  return { epochs, unplaced };
}
