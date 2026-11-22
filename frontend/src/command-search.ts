/**
 * MICRO-SEG29 (E.D., 22 Nov 2026) · THE COMMAND SEARCH — Blender's F3.
 *
 * The menu «Tools» was a drawer of commands with no home; it went, and its
 * commands live where they serve (the Matrix's header, File ▸ Bring in…, Edit ▸
 * Clean up, the Preferences, Window). What a person used to find in a drawer is
 * found by name instead: F3 (or ⌘K / Ctrl+K) opens one field, and every command
 * of the table (`menu-table.ts`) — drawn by a menu or not — answers by its name
 * in English AND in Italian, by its synonyms (`cmds.syn.<id>`: «tools»,
 * «cronologia»…), and says WHERE it lives now and its keys. The plugins'
 * commands come in by themselves (the run rows of every slot, and the commands
 * the page gives).
 *
 * Pure: no DOM. The page builds the entries (`commandEntries`) with its own
 * dictionaries and draws the list (`main.ts`, `openCommandSearch`);
 * `check-command-search.mjs` reads both.
 */
import {
  type CommandRow, type MenuDef, type Platform, type Row, type RunRow, MENUS, keysFor, menuRows, slotRuns,
} from "./menu-table";

export interface CommandEntry {
  /** the command's id (`runCommand(id)`), or a plugin's `plugin:<id>/<command>` */
  id: string;
  /** the label in the interface's language */
  label: string;
  /** where it lives now, in the interface's language («File ▸ Export», «Matrix header») */
  where: string;
  /** its keys as drawn on this platform («⇧⌘S»), or "" */
  keys: string;
  /** the tooltip, said under the label when it is chosen */
  title: string;
  /** everything a query is matched against, normalised: labels and synonyms in
   *  every language given, the place, the id */
  hay: string;
  /** the label words only (normalised): a match there ranks first */
  names: string;
  kind: "cmd" | "run";
}

/** lower case, no accents, no ellipsis or arrows: «Verifica la cronologia…» → «verifica la cronologia» */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[…▸·•→—–|"'«»()[\]{}:;,.!?¿¡]/g, " ").replace(/\s+/g, " ").trim();
}

/** A dictionary: a key → its text, or undefined when it has none. */
export type Dict = (key: string) => string | undefined;

export interface CatalogOptions {
  platform: Platform;
  /** the interface's language first, then the others to match (EN, IT) */
  dicts: Dict[];
  /** the words of the interface (the labels and places shown) */
  t: (key: string, vars?: Record<string, string>) => string;
  /** MICRO-SEG29 · commands given by the page beyond the table (a plugin's
   *  command of a slot that has no menu, `menu.tools@1`): already in words */
  extra?: Array<{ id: string; label: string; where: string; title?: string; syn?: string[] }>;
}

/** The menus as the page shows them on this platform: the page's own, and on
 *  the Mac the system's bar too (Settings, About live there). */
function surfacesOf(platform: Platform): Array<{ menu: MenuDef; rows: Row[] }> {
  const out: Array<{ menu: MenuDef; rows: Row[] }> = [];
  for (const menu of MENUS) {
    const inner = menuRows(menu, platform, "internal");
    const native = menuRows(menu, platform, "native");
    if (inner.length) out.push({ menu, rows: inner });
    if (native.length) out.push({ menu, rows: native });
  }
  return out;
}

/** Every command row of the table (drawn or not), with the menu path where a
 *  menu draws it on this platform (first found), else null. */
export function commandPlaces(platform: Platform): Array<{ row: CommandRow; path: string[] | null }> {
  const drawn = new Map<string, string[]>();
  for (const { menu, rows } of surfacesOf(platform)) {
    const walk = (list: Row[], path: string[]): void => {
      for (const r of list) {
        if (r.kind === "sub") walk(r.rows, [...path, r.label]);
        else if (r.kind === "cmd" && !drawn.has(r.id)) drawn.set(r.id, path);
      }
    };
    walk(rows, [menu.id === "app" ? "@app" : menu.label]);
  }
  const out: Array<{ row: CommandRow; path: string[] | null }> = [];
  const walkAll = (list: Row[]): void => {
    for (const r of list) {
      if (r.kind === "sub") walkAll(r.rows);
      else if (r.kind === "cmd") out.push({ row: r, path: drawn.get(r.id) ?? null });
    }
  };
  for (const m of MENUS) walkAll(m.rows);
  return out;
}

/** The plugins' rows registered in the slots of the table's sub-menus, with their path. */
function runPlaces(): Array<{ row: RunRow; path: string[] }> {
  const out: Array<{ row: RunRow; path: string[] }> = [];
  const walk = (list: Row[], path: string[]): void => {
    for (const r of list) {
      if (r.kind !== "sub") continue;
      const here = [...path, r.label];
      walk(r.rows, here);
      if (r.slot) for (const run of slotRuns(r.slot)) out.push({ row: run, path: here });
    }
  };
  for (const m of MENUS) walk(m.rows, [m.label]);
  return out;
}

/**
 * The entries of the search on a platform. A command appears ONCE (two rows
 * pressing one button — About in Help and in the Mac's EMStudio menu — are one
 * command: the first drawn wins). A command that exists nowhere on this
 * platform (Quit on the web) is not offered; one drawn by no menu is offered
 * with its `home`.
 */
export function commandEntries(o: CatalogOptions): CommandEntry[] {
  const { t, dicts, platform } = o;
  const words = (key: string): string[] => dicts.map((d) => d(key)).filter((x): x is string => !!x);
  const syn = (id: string): string[] => words(`cmds.syn.${id}`);
  const pathText = (path: string[]): string => path.map((k) => (k === "@app" ? "EMStudio" : t(k))).join(" ▸ ");
  const out: CommandEntry[] = [];
  const seenButton = new Set<string>();
  const places = commandPlaces(platform);
  // drawn first, so that a button shared by two rows keeps the drawn one
  places.sort((a, b) => Number(!a.path) - Number(!b.path));
  for (const { row, path } of places) {
    const exists = !row.only || row.only.includes(platform) || (row.only.length === 0 && !!row.home);
    if (!exists || seenButton.has(row.button)) continue;
    if (!path && !row.home) continue;
    seenButton.add(row.button);
    const where = path ? pathText(path) : t(row.home!);
    const labels = words(row.label);
    const homeWords = path ? path.flatMap((k) => (k === "@app" ? ["EMStudio"] : words(k))) : words(row.home!);
    const label = t(row.label);
    out.push({
      id: row.id, label, where, keys: keysFor(row, platform), title: row.title ? t(row.title) : "",
      names: norm([label, ...labels].join(" ")),
      hay: norm([label, ...labels, ...syn(row.id), ...homeWords, row.id].join(" ")),
      kind: "cmd",
    });
  }
  for (const { row, path } of runPlaces()) {
    out.push({
      id: row.id, label: row.text, where: pathText(path), keys: "", title: row.title ?? "",
      names: norm(row.text), hay: norm([row.text, row.badge ?? "", ...path.flatMap(words), row.id].join(" ")), kind: "run",
    });
  }
  for (const x of o.extra ?? []) {
    if (out.some((e) => e.id === x.id)) continue;
    out.push({ id: x.id, label: x.label, where: x.where, keys: "", title: x.title ?? "",
      names: norm(x.label), hay: norm([x.label, x.where, ...(x.syn ?? []), x.id].join(" ")), kind: "run" });
  }
  return out;
}

/** How well an entry answers a query: 0 = not at all. Every word of the query
 *  must be in the entry; a word at the start of the label ranks highest, then
 *  a word starting a word of the label, then anywhere (synonyms, place). */
export function scoreEntry(e: CommandEntry, q: string): number {
  const toks = norm(q).split(" ").filter(Boolean);
  if (!toks.length) return 1;
  let score = 0;
  for (const tok of toks) {
    if (!e.hay.includes(tok)) return 0;
    if (e.names.startsWith(tok)) score += 8;
    else if (` ${e.names}`.includes(` ${tok}`)) score += 5;
    else if (e.names.includes(tok)) score += 3;
    else if (` ${e.hay}`.includes(` ${tok}`)) score += 2;
    else score += 1;
  }
  return score;
}

/** The entries answering `q`, best first (ties: the order of the table). */
export function searchCommands(entries: CommandEntry[], q: string, limit = 50): CommandEntry[] {
  return entries.map((e, i) => ({ e, i, s: scoreEntry(e, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.e);
}

/** MICRO-SEG29 · the keys this search answers to. F3 is free everywhere in
 *  the app (no field takes it); ⌘K / Ctrl+K is a row of the table (Edit). */
export const SEARCH_KEYS = { f3: "F3", accel: "CmdOrCtrl+K" } as const;
export function isSearchKey(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): boolean {
  return e.key === "F3" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
}
