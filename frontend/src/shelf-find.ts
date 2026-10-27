/**
 * MICRO-ARCHIVIO-1 · THE SHELF THAT SEARCHES — what each entry IS, for the
 * search, the pills and the groups (nota «L'Archivio ripensato» §3).
 *
 * 71 entries four to a screen was a list nobody could use: the shelf now has a
 * search field (name, title, description, EM id, the stamp's author), pills
 * (type · stamped · in use · study · where) and «group by» (folder, type, the
 * stamp's act, the graph's document). The rows are one line each.
 *
 * Pure module: no DOM, no network. `main.ts` reads the facts it alone can know
 * (the receipt, the sidecar, the open graphs) and hands them in as `EntryFacts`;
 * this module only filters and groups. The TYPE is the datamodel's
 * (`rules.resourceTypeOfLocator`, the `resource_types` of ResourceNode), plus
 * the one form the datamodel does not name yet and the Shelf must tell apart:
 * a tileset (a `.3tz`, a `tileset.json`).
 */

import { resourceTypeOfLocator } from "./rules";

/** what the Shelf knows of one entry, gathered by the caller */
export interface EntryFacts {
  id: string;
  name: string;
  locator: string;
  /** the datamodel's resource type, `tileset`, or `unknown` */
  type: string;
  stamped: boolean;
  /** cited by a node of an open graph (its document, or a resource with its url
   *  or its digest) */
  inUse: boolean;
  /** the study its stamp names, compared with the active graph: `this`,
   *  `other`, or null (not stamped, or not known here) */
  study: "this" | "other" | null;
  where: ShelfWhere;
  /** the folder of a path; the host of a web address */
  folder: string;
  /** the stamp's act — its label, and its id for the group key */
  act: { id: string; label: string } | null;
  /** the graph's document this entry became, by name */
  doc: string | null;
  /** everything the search reads: title, description, EM ids, author */
  words: string[];
}

export type ShelfWhere = "disk" | "room" | "web";
export type ShelfGroupBy = "none" | "folder" | "type" | "act" | "doc";
export const SHELF_GROUPS: ShelfGroupBy[] = ["none", "folder", "type", "act", "doc"];

export interface ShelfQuery {
  text: string;
  /** types kept; empty = all */
  types: string[];
  stamped: boolean | null;
  inUse: boolean | null;
  study: "this" | "other" | null;
  where: ShelfWhere | null;
  group: ShelfGroupBy;
}

export function emptyQuery(): ShelfQuery {
  return { text: "", types: [], stamped: null, inUse: null, study: null, where: null, group: "none" };
}

/** Is any filter on? (The search counts as one.) */
export function queryActive(q: ShelfQuery): boolean {
  return !!q.text.trim() || q.types.length > 0 || q.stamped !== null || q.inUse !== null
    || q.study !== null || q.where !== null;
}

const TILESET = /(\.3tz|(^|\/)tileset\.json)$/i;

/** The datamodel's resource type of a locator — or `tileset`. */
export function shelfTypeOf(locator: string): string {
  const clean = locator.split(/[?#]/)[0];
  if (TILESET.test(clean)) return "tileset";
  if (/^https?:/i.test(locator)) {
    const t = resourceTypeOfLocator(locator);
    // an address with no extension IS a web page: the datamodel's `web_page`
    return t === "unknown" ? "web_page" : t;
  }
  return resourceTypeOfLocator(locator);
}

export function whereOf(locator: string): ShelfWhere {
  if (/^https?:/i.test(locator)) return "web";
  if (/^s3:/i.test(locator)) return "room";
  return "disk";
}

/** The folder of a path, the host of an address, the bucket of an `s3://`. */
export function folderOf(locator: string): string {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i.exec(locator);
  if (m) return m[1].toLowerCase() === "s3" ? `s3://${m[2]}` : m[2];
  const posix = locator.replace(/\\/g, "/").replace(/\/+$/, "");
  const at = posix.lastIndexOf("/");
  return at > 0 ? posix.slice(0, at) : at === 0 ? "/" : "";
}

/** lower case, accents gone: «Città» is found by «citta» */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Every word of the search somewhere in the entry (name, locator, words). */
export function matchesText(f: EntryFacts, text: string): boolean {
  const words = fold(text).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([f.name, f.locator, ...f.words].join(" \u0001 "));
  return words.every((w) => hay.includes(w));
}

export function matches(f: EntryFacts, q: ShelfQuery): boolean {
  if (q.types.length && !q.types.includes(f.type)) return false;
  if (q.stamped !== null && f.stamped !== q.stamped) return false;
  if (q.inUse !== null && f.inUse !== q.inUse) return false;
  if (q.study !== null && f.study !== q.study) return false;
  if (q.where !== null && f.where !== q.where) return false;
  return matchesText(f, q.text);
}

export interface ShelfGroup {
  /** stable key ("" = the one group of an ungrouped list) */
  key: string;
  /** what the head of the group says; null = the caller's word for «none» */
  label: string | null;
  ids: string[];
}

function groupKey(f: EntryFacts, by: ShelfGroupBy): { key: string; label: string | null } {
  switch (by) {
    case "folder": return f.folder ? { key: `f:${f.folder}`, label: f.folder } : { key: "f:", label: null };
    case "type": return { key: `t:${f.type}`, label: f.type };
    case "act": return f.act ? { key: `a:${f.act.id}`, label: f.act.label } : { key: "a:", label: null };
    case "doc": return f.doc ? { key: `d:${f.doc}`, label: f.doc } : { key: "d:", label: null };
    default: return { key: "", label: null };
  }
}

/**
 * The entries that pass the query, in groups. The shelf's own order is kept
 * inside a group (the newest first, as it was put on the shelf); the groups go
 * by label, and the group of «none» (no act, not a document…) goes last.
 */
export function findOnShelf(facts: EntryFacts[], q: ShelfQuery): ShelfGroup[] {
  const groups = new Map<string, ShelfGroup>();
  for (const f of facts) {
    if (!matches(f, q)) continue;
    const { key, label } = groupKey(f, q.group);
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, label, ids: [] });
    g.ids.push(f.id);
  }
  return [...groups.values()].sort((a, b) =>
    a.label === null ? (b.label === null ? 0 : 1) : b.label === null ? -1 : a.label.localeCompare(b.label));
}

/** How many entries of each value a pill would keep — so a pill can say its
 *  number, and a value nobody has is not offered. Counted on the entries the
 *  OTHER filters keep: the number on a pill is what pressing it gives. */
export function pillCounts(facts: EntryFacts[], q: ShelfQuery): {
  types: Map<string, number>; stamped: [number, number]; inUse: [number, number];
  study: [number, number]; where: Map<ShelfWhere, number>;
} {
  const types = new Map<string, number>();
  const where = new Map<ShelfWhere, number>();
  const stamped: [number, number] = [0, 0];
  const inUse: [number, number] = [0, 0];
  const study: [number, number] = [0, 0];
  for (const f of facts) {
    if (matches(f, { ...q, types: [] })) types.set(f.type, (types.get(f.type) ?? 0) + 1);
    if (matches(f, { ...q, stamped: null })) stamped[f.stamped ? 0 : 1]++;
    if (matches(f, { ...q, inUse: null })) inUse[f.inUse ? 0 : 1]++;
    if (matches(f, { ...q, study: null }) && f.study) study[f.study === "this" ? 0 : 1]++;
    if (matches(f, { ...q, where: null })) where.set(f.where, (where.get(f.where) ?? 0) + 1);
  }
  return { types, stamped, inUse, study, where };
}

/** A range of ids in the order shown, for a ⇧-click from `from` to `to`. */
export function rangeOf(order: string[], from: string, to: string): string[] {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}
