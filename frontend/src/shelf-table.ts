/**
 * SHELF · THE TABLE — the shelf as the library sees it.
 *
 * The wide list (`shelf.ts`) is what you drag into; this is the shelf READ BACK
 * from s3Dgraphy, as rows. The difference matters and it is the whole reason
 * this module exists: three of the columns are things only the library can
 * answer —
 *
 *   · **RESIDENCE** (disk / s3 / uri) — read off the locator, plus what the
 *     origin says about where it came from;
 *   · **ROLE** (comparandum / internal_source) — STATED, never derived, and
 *     orthogonal to the fence: my own asset can be a comparandum and somebody
 *     else's URI can be a source inside my own argument;
 *   · **MODE** (only_shelf / used_in_graph) — the hatting reference-check across
 *     every graph of the container.
 *
 * …and answering them here, in TypeScript, would be a second answer. A shelf
 * with two opinions on "is this in use?" is worse than a shelf with no badge, so
 * this module computes NOTHING about a row. It parses what the bridge returned
 * (`api.shelf_table` / `api.shelf_table_columns` / `api.resource_roles` /
 * `api.access_modes`), keeps the column order the library gave, and turns values
 * into class names without knowing what any of them mean.
 *
 * That constraint is checkable, and `scripts/check-shelf.mjs` checks it: there is
 * no locator regex in this file and not one of the badge VALUES appears in it.
 *
 * Pure module: no DOM, no fetch. The caller does the round trip.
 */

/** One row, exactly as the library emitted it — keyed by the column names it
 *  also gave us. Deliberately not a typed record per column: the columns are the
 *  library's to change, and a frozen interface here would be a second schema. */
export type ShelfRow = Record<string, string | number | null>;

export interface ShelfTable {
  /** column order as the library gave it — the reading order, not ours */
  columns: string[];
  rows: ShelfRow[];
  /** the vocabularies, from the API: a UI that hardcoded them would be a third
   *  place they live (they are already the class's and the datamodel's) */
  roles: string[];
  accessModes: string[];
  /** the ShelfGraph section the answer came with, to adopt back into the
   *  container after a write (paste-URI). Absent when the project has no shelf. */
  shelf?: Record<string, unknown> | null;
}

export const EMPTY_TABLE: ShelfTable = {
  columns: [], rows: [], roles: [], accessModes: [], shelf: null,
};

/** The columns drawn as BADGES rather than text. Names only — what their values
 *  mean is the library's business, and this module never asks. */
export const BADGE_COLUMNS = ["RESIDENCE", "ROLE", "MODE"] as const;

/** The column that identifies a row, for selection and for a right-click. */
export const ID_COLUMN = "ID";

/**
 * Read the bridge's answer. Returns null when it is not a shelf-table answer at
 * all — a caller that got HTML back from a proxy should say "the bridge did not
 * answer" rather than draw an empty table, which looks like an empty shelf.
 */
export function parseShelfTable(raw: unknown): ShelfTable | null {
  const a = raw as {
    columns?: unknown; rows?: unknown; roles?: unknown;
    access_modes?: unknown; shelf?: unknown;
  } | null;
  if (!a || !Array.isArray(a.columns) || !Array.isArray(a.rows)) return null;
  const columns = a.columns.filter((c): c is string => typeof c === "string");
  if (!columns.length) return null;
  const rows: ShelfRow[] = [];
  for (const row of a.rows) {
    if (!row || typeof row !== "object") continue;
    rows.push(row as ShelfRow);
  }
  return {
    columns,
    rows,
    roles: Array.isArray(a.roles)
      ? a.roles.filter((r): r is string => typeof r === "string") : [],
    accessModes: Array.isArray(a.access_modes)
      ? a.access_modes.filter((m): m is string => typeof m === "string") : [],
    shelf: (a.shelf ?? null) as Record<string, unknown> | null,
  };
}

/** A cell, as text. Numbers are left to the caller to format — a size is a
 *  number here and stays one, so nobody has to un-format it. */
export function cellText(row: ShelfRow, column: string): string {
  const value = row[column];
  return value === null || value === undefined ? "" : String(value);
}

/**
 * The class names for a badge cell. Built from the column and the value with no
 * knowledge of either: `shelf-badge b-role v-comparandum`. The COLOURS live in
 * `style.css`, which is where the palette lives — a module that wrote a hex
 * would be a second palette, and one that switched on the value would be a
 * second opinion about what the values are.
 */
export function badgeClass(column: string, value: string): string {
  const base = `shelf-badge b-${slug(column)}`;
  return value ? `${base} v-${slug(value)}` : `${base} v-unset`;
}

/** kebab/underscore-safe: whatever the library says becomes a usable class. */
export function slug(value: string): string {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

export function rowId(row: ShelfRow): string {
  return cellText(row, ID_COLUMN);
}

export function findRow(table: ShelfTable, id: string): ShelfRow | undefined {
  return table.rows.find((r) => rowId(r) === id);
}

/** Is this column one of the three badges? */
export function isBadgeColumn(column: string): boolean {
  return (BADGE_COLUMNS as readonly string[]).includes(column);
}

/**
 * A human size for the SIZE column. Formatting, not semantics: the row still
 * carries the number, and nothing downstream parses this back.
 */
export function humanSize(value: string | number | null | undefined): string {
  const n = Number(value);
  if (!n || !Number.isFinite(n)) return "";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
