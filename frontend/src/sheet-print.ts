/**
 * MICRO-PL002 · PRINTING THE SHEETS — which ones, in which order, how many pages.
 *
 * E.D. (18 Nov 2026, dev.130): «Print A4…» printed the sheet of ONE unit, and
 * there was no way to print more. The window «Stampa schede» (from «Print A4…»
 * and File ▸ Stampa schede…) chooses WHAT to print with criteria that combine
 * (all of them hold): every unit of the graph or the selection; the unit types
 * (US, USV, SF…); the epochs; the activities / groups; the state of the sheet
 * (full, with empty boxes, to complete = a required box empty) and its record
 * status; a range or list of numbers; a text search. It says the count before
 * printing («37 schede, 74 pagine»), orders them (number, epoch, as in the
 * Matrix), prints recto + verso or recto only, one PDF or one PDF per sheet.
 *
 * Pure (no DOM, no store): the page gives the units as `PrintUnit`s, a node
 * check (`check-sheet-print.mjs`) asks these functions.
 */

import type { EmEdge, EmNode } from "./types";

/** One unit as the print window sees it. `state`/`status` are filled lazily
 *  (reading a sheet walks its recipe): undefined = not read yet. */
export interface PrintUnit {
  id: string;
  name: string;
  type: string;
  /** the epochs the unit is in (has_first_epoch first, then survive_in_epoch) */
  epochs: string[];
  /** the start of its first epoch (a year), null when it has none */
  epochStart: number | null;
  /** the groups it belongs to (activity, paradata group, location, part of…) */
  groups: string[];
  /** what the text search reads: name, description */
  text: string;
  /** its place in the Matrix (view, else archive), null when it has none */
  at: { x: number; y: number } | null;
  state?: SheetState;
  status?: string | null;
}

/** full = no box the graph could fill is empty; gaps = some are; todo = a
 *  REQUIRED box is empty (the sheet cannot be handed in as it is) */
export type SheetState = "full" | "gaps" | "todo";

export type Order = "number" | "epoch" | "matrix";
export type Sides = "both" | "recto";
export type Output = "one" | "each";

export interface PrintCriteria {
  scope: "all" | "selection";
  /** node types; empty = every type */
  types: string[];
  /** epoch ids; empty = any (a unit in ANY of them passes) */
  epochs: string[];
  /** group ids; empty = any (a unit in ANY of them passes) */
  groups: string[];
  /** sheet states; empty = any */
  states: SheetState[];
  /** record status keys, "" for «no status»; empty = any */
  statuses: string[];
  /** «1-20, 35, 40-45», or names: «USM12, US3» */
  numbers: string;
  /** words that must all be in the name or the description */
  text: string;
  order: Order;
  sides: Sides;
  output: Output;
}

/** Nothing chosen: every unit, by number, recto and verso, one PDF. A NEW
 *  object each time — the window pushes into its lists. */
export function freshCriteria(): PrintCriteria {
  return { scope: "all", types: [], epochs: [], groups: [], states: [], statuses: [],
           numbers: "", text: "", order: "number", sides: "both", output: "one" };
}

/** The edges that put a unit in a group (main.ts MEMBER, the Matrix's). */
export const MEMBERSHIP_EDGES = new Set(["is_in_activity", "is_in_paradata_nodegroup", "is_in_location", "is_in_timebranch", "is_part_of"]);
const EPOCH_EDGES = ["has_first_epoch", "survive_in_epoch"];

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

function yearOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = /-?\d+/.exec(str(v));
  return m ? Number(m[0]) : null;
}

/** The units of a graph as the window sees them. `isUnit` says which nodes
 *  have a sheet (`sheet.isSheetUnit`); `at` their Matrix place. */
export function printUnits(nodes: readonly EmNode[], edges: readonly EmEdge[],
                           isUnit: (n: EmNode) => boolean,
                           at: (id: string) => { x: number; y: number } | null = () => null): PrintUnit[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const epochsOf = new Map<string, string[]>(), groupsOf = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const l = m.get(k) ?? m.set(k, []).get(k)!;
    if (!l.includes(v)) l.push(v);
  };
  for (const kind of EPOCH_EDGES)
    for (const e of edges) if (e.edge_type === kind && !(e.attributes as { removed?: boolean } | undefined)?.removed) push(epochsOf, e.source, e.target);
  for (const e of edges) {
    if (!MEMBERSHIP_EDGES.has(str(e.edge_type)) || (e.attributes as { removed?: boolean } | undefined)?.removed) continue;
    const g = byId.get(e.target);
    if (g && !isUnit(g)) push(groupsOf, e.source, e.target);
  }
  const out: PrintUnit[] = [];
  for (const n of nodes) {
    if (!isUnit(n)) continue;
    const epochs = epochsOf.get(n.id) ?? [];
    const first = epochs[0] ? byId.get(epochs[0]) : undefined;
    out.push({
      id: n.id, name: str(n.name) || n.id, type: str(n.node_type), epochs,
      epochStart: first ? yearOf((first.data as Record<string, unknown> | undefined)?.start_time) : null,
      groups: groupsOf.get(n.id) ?? [],
      text: `${str(n.name)} ${str(n.description)}`.toLowerCase(),
      at: at(n.id),
    });
  }
  return out;
}

/** The number in a unit's name, for ranges and for the order: «USM012» → 12,
 *  «US 3a» → 3; none → null. The LAST run of digits (a prefix may carry one:
 *  «US2-14» is 14). */
export function numberOf(name: string): number | null {
  const all = name.match(/\d+/g);
  return all ? Number(all[all.length - 1]) : null;
}

/** «1-20, 35, 40–45, USM12»: a range or a number matches the unit's number, a
 *  word matches its name (case and spaces aside). Empty = everything. A spec
 *  that says nothing a unit could match (only commas) is everything too. */
export function numberMatcher(spec: string): ((u: { name: string }) => boolean) | null {
  const parts = spec.replace(/\s*[-–]\s*/g, "-").split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const ranges: Array<[number, number]> = [], names = new Set<string>();
  for (const p of parts) {
    const r = /^(\d+)-(\d+)$/.exec(p);
    if (r) { const a = Number(r[1]), b = Number(r[2]); ranges.push([Math.min(a, b), Math.max(a, b)]); continue; }
    if (/^\d+$/.test(p)) { ranges.push([Number(p), Number(p)]); continue; }
    names.add(p.toLowerCase().replace(/\s+/g, ""));
  }
  return (u) => {
    if (names.has(u.name.toLowerCase().replace(/\s+/g, ""))) return true;
    const n = numberOf(u.name);
    return n !== null && ranges.some(([a, b]) => n >= a && n <= b);
  };
}

/** Does the filter need the sheets READ (state, status)? The page reads them
 *  only then — a read walks the recipe, unit by unit. */
export function needsReading(c: PrintCriteria): boolean {
  return c.states.length > 0 || c.statuses.length > 0;
}

/** The units the criteria keep, in the order asked. Units not read yet pass a
 *  state/status filter only once read (`needsReading`). */
export function selectUnits(units: readonly PrintUnit[], c: PrintCriteria, selection: ReadonlySet<string>): PrintUnit[] {
  const num = numberMatcher(c.numbers);
  const words = c.text.toLowerCase().split(/\s+/).filter(Boolean);
  const kept = units.filter((u) =>
    (c.scope !== "selection" || selection.has(u.id))
    && (!c.types.length || c.types.includes(u.type))
    && (!c.epochs.length || u.epochs.some((e) => c.epochs.includes(e)))
    && (!c.groups.length || u.groups.some((g) => c.groups.includes(g)))
    && (!c.states.length || (u.state !== undefined && c.states.includes(u.state)))
    && (!c.statuses.length || (u.status !== undefined && c.statuses.includes(u.status ?? "")))
    && (!num || num(u))
    && words.every((w) => u.text.includes(w)));
  return orderUnits(kept, c.order);
}

const byName = (a: PrintUnit, b: PrintUnit): number => {
  const na = numberOf(a.name), nb = numberOf(b.name);
  const pa = a.name.replace(/\d+\D*$/, ""), pb = b.name.replace(/\d+\D*$/, "");
  if (pa !== pb) return pa.localeCompare(pb);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  return a.name.localeCompare(b.name, undefined, { numeric: true });
};

/** number: by prefix then number (US2 before US10); epoch: the oldest first,
 *  no epoch last, then by number; matrix: top to bottom, left to right, as
 *  the Matrix draws them (no place: last, by number). */
export function orderUnits(units: PrintUnit[], order: Order): PrintUnit[] {
  const out = [...units];
  if (order === "number") return out.sort(byName);
  if (order === "epoch") return out.sort((a, b) =>
    (a.epochStart ?? Infinity) - (b.epochStart ?? Infinity) || (a.epochs[0] ?? "").localeCompare(b.epochs[0] ?? "") || byName(a, b));
  return out.sort((a, b) => {
    if (!a.at || !b.at) return a.at ? -1 : b.at ? 1 : byName(a, b);
    return a.at.y - b.at.y || a.at.x - b.at.x || byName(a, b);
  });
}

/** The pages a print takes: sheets × the sides printed (a definition's sheet
 *  has `sidesPerSheet` sides; «recto only» prints the first). The definitions
 *  fit a side on a page; a box that grows is said by the PDF, not here. */
export function pageCount(sheets: number, sides: Sides, sidesPerSheet: number): number {
  return sheets * (sides === "recto" ? Math.min(1, sidesPerSheet) : sidesPerSheet);
}

/** «ICCD-US-2021 · Scavo 2026 · 2026-11-18», safe as a file name on the three
 *  systems (no / \ : * ? " < > |, no control characters), «.pdf» added. A
 *  sheet's own file adds its unit: «… · US12.pdf». */
export function printFileName(template: string, graph: string, date: Date, unit?: string): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const clean = (s: string) => s.replace(/[/\\:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim();
  const parts = [template, graph, unit ?? day].map(clean).filter(Boolean);
  if (unit) parts.splice(2, 0, day);
  return `${parts.join(" · ").slice(0, 180)}.pdf`;
}

/** Several sheets as ONE printable page: the style of the first, the sections
 *  of all (each side is a `<section class="sheet">` that breaks the page after
 *  itself, `render.sheet_html(mode="print")`). «recto only» keeps the first
 *  side of every sheet. */
export function joinSheets(htmls: readonly string[], sides: Sides, title: string): string {
  if (!htmls.length) return "";
  const style = /<style>[\s\S]*?<\/style>/.exec(htmls[0])?.[0] ?? "";
  const lang = /<html lang='([^']*)'/.exec(htmls[0])?.[1] ?? "";
  const bodies = htmls.map((h) => {
    const body = /<body>([\s\S]*)<\/body>/.exec(h)?.[1] ?? "";
    if (sides === "both") return body;
    return /<section class="sheet"[\s\S]*?<\/section>/.exec(body)?.[0] ?? body;
  });
  const esc = title.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!DOCTYPE html><html lang='${lang}'><head><meta charset='utf-8'><title>${esc}</title>${style}</head><body>${bodies.join("")}</body></html>`;
}

/** Records into batches for the bridge: one request carries `size` sheets, so
 *  the window can say how far it is and stop between two. */
export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The state of a sheet from its boxes (`sheet.fillCounts`'s states): a
 *  REQUIRED box empty → todo; another empty → gaps; none → full. Boxes the
 *  definition keeps out of the graph (silent, open) do not count. */
export function sheetStateOf(fields: Iterable<{ fid: string; state: string }>, required: (fid: string) => boolean): SheetState {
  let gaps = false;
  for (const f of fields) {
    if (f.state !== "empty") continue;
    if (required(f.fid)) return "todo";
    gaps = true;
  }
  return gaps ? "gaps" : "full";
}
