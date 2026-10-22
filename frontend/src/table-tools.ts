/**
 * MICRO-PULIZIA p.9 · EVERY TABLE SORTS AND FILTERS — one component.
 *
 * The tables of EMStudio are written by a dozen renderers, most of them as one
 * HTML string rebuilt on every change (the Tabular sheets, its computed views,
 * the Shelf, the Space's models, the node's orphans…). Rather than teach each
 * of them to sort, this module ENHANCES a table once it is in the page: a click
 * on a heading sorts (ascending, descending, back to the table's own order),
 * with `aria-sort` and a visible arrow; a row under the headings filters each
 * column — a text, or a choice when the column holds a handful of fixed values;
 * «Clear filters» empties them. The state is remembered per table (its kind and
 * its headings), so a sheet rebuilt by an edit comes back sorted and filtered
 * as it was left.
 *
 * It only moves and hides the rows the renderer wrote: the document is never
 * touched, and a renderer that rebuilds the table simply gets enhanced again.
 * A table that has its own sort, whose order IS its meaning, or that is
 * content rather than a working list says so with `data-no-table-tools` or one
 * of the classes in `SKIP` (the reasons are in the report of 20 Oct 2026).
 */

export interface TableToolsLabels {
  filter: string;
  any: string;
  clear: string;
  clearNone: string;
  sortBy: (col: string) => string;
  shown: (n: number, total: number) => string;
}

interface TableState {
  sort?: { col: string; dir: 1 | -1 };
  filters?: Record<string, string>;
}

const STORE_KEY = "emstudio.tableTools";
/** tables left alone, and why (short): their own sort, their order is their
 *  meaning, or they are content of a story / a legend */
export const SKIP: Record<string, string> = {
  "fs-table": "own sort and filters (file states)",
  "chr-table": "the order is the chronology; rows carry inline forms",
  "nv-table-grid": "content of a story (read, printed, exported)",
  "ninsp-out": "a three-line summary",
  "shortcuts-table": "the shortcuts help has its own search",
  "ws-help-table": "a legend",
};
/** a column with at most this many distinct values (and more rows than values)
 *  filters with a choice instead of a text */
const CHOICE_MAX = 8;

function readAll(): Record<string, TableState> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") ?? {}; } catch { return {}; }
}
function writeState(key: string, st: TableState): void {
  const all = readAll();
  const empty = !st.sort && !Object.values(st.filters ?? {}).some(Boolean);
  if (empty) delete all[key]; else all[key] = st;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch { /* private mode */ }
}

/** the value a cell SAYS: a field's value, else its text */
export function cellValue(td: Element | undefined): string {
  if (!td) return "";
  const f = td.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:not([type=checkbox]):not([type=radio]), select, textarea");
  if (f) {
    if (f instanceof HTMLSelectElement) return (f.selectedOptions[0]?.textContent ?? f.value).trim();
    return f.value.trim();
  }
  const cb = td.querySelector<HTMLInputElement>("input[type=checkbox]");
  if (cb && !td.textContent?.trim()) return cb.checked ? "✓" : "";
  return (td.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** numbers as numbers (a comma decimal too), the rest in the reader's order */
export function compareValues(a: string, b: string): number {
  const na = Number(a.replace(",", ".")), nb = Number(b.replace(",", "."));
  if (a !== "" && b !== "" && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  if (a === "" && b !== "") return 1;      // the empty ones last, either way
  if (b === "" && a !== "") return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** the key a table is remembered by: what kind of table, and its headings */
export function tableKeyOf(table: HTMLTableElement): string {
  const where = table.closest<HTMLElement>("[data-surface-type]")?.dataset.surfaceType ?? "";
  const cls = [...table.classList].filter((c) => !c.startsWith("tt-")).sort().join(".");
  const heads = headCells(table).map((th) => th.dataset.ttLabel ?? th.textContent?.trim() ?? "").join("|");
  return `${where}:${cls}:${heads}`;
}

function headCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const row = table.tHead?.rows[0] ?? null;
  return row ? [...row.cells] : [];
}

/** the body's rows, each with the rows attached to it (a full-width row after
 *  it: a form, a note), which travel with it */
function rowGroups(table: HTMLTableElement, cols: number): HTMLTableRowElement[][] {
  const out: HTMLTableRowElement[][] = [];
  for (const body of [...table.tBodies])
    for (const tr of [...body.rows]) {
      const span = [...tr.cells].reduce((n, c) => n + (c.colSpan || 1), 0);
      const attached = tr.cells.length === 1 && span >= cols && out.length > 0;
      if (attached) out[out.length - 1].push(tr);
      else out.push([tr]);
    }
  return out;
}

/**
 * Enhance ONE table. Idempotent: a table already enhanced is left as it is.
 */
export function enhanceTable(table: HTMLTableElement, labels: TableToolsLabels): void {
  if (table.dataset.tt === "1") return;
  const heads = headCells(table);
  if (!heads.length || !table.tBodies.length) return;
  table.dataset.tt = "1";
  const key = tableKeyOf(table);
  const cols = heads.reduce((n, c) => n + (c.colSpan || 1), 0);
  const groups = rowGroups(table, cols);
  groups.forEach((g, i) => { for (const tr of g) tr.dataset.ttOrder = String(i); });
  const state: TableState = readAll()[key] ?? {};
  state.filters ??= {};
  const labelOf = (th: HTMLTableCellElement): string => th.dataset.ttLabel ?? (th.textContent ?? "").trim();
  const sortable = heads.map((th) => !!labelOf(th));

  // ── the headings: a button each, that sorts ──────────────────────────────
  heads.forEach((th, ci) => {
    if (!sortable[ci]) return;
    const label = labelOf(th);
    th.dataset.ttLabel = label;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tt-sort";
    b.title = labels.sortBy(label);
    b.setAttribute("aria-label", labels.sortBy(label));
    // the heading's own content moves into the button, the arrow after it
    while (th.firstChild) b.appendChild(th.firstChild);
    const arrow = document.createElement("span");
    arrow.className = "tt-arrow";
    arrow.setAttribute("aria-hidden", "true");
    b.appendChild(arrow);
    th.appendChild(b);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const cur = state.sort?.col === label ? state.sort.dir : 0;
      // ascending → descending → the table's own order
      state.sort = cur === 0 ? { col: label, dir: 1 } : cur === 1 ? { col: label, dir: -1 } : undefined;
      writeState(key, state);
      apply();
    });
  });

  // ── the filters, a row under the headings ────────────────────────────────
  const fr = document.createElement("tr");
  fr.className = "tt-filters";
  const values = (ci: number): string[] => groups.map((g) => cellValue(g[0].cells[ci]));
  heads.forEach((th, ci) => {
    const cell = document.createElement("th");
    cell.className = "tt-filter-cell";
    if (th.colSpan > 1) cell.colSpan = th.colSpan;
    if (sortable[ci]) {
      const label = labelOf(th);
      const distinct = [...new Set(values(ci).filter(Boolean))].sort(compareValues);
      const choice = distinct.length > 0 && distinct.length <= CHOICE_MAX && groups.length > distinct.length;
      let ctl: HTMLInputElement | HTMLSelectElement;
      if (choice) {
        const sel = document.createElement("select");
        sel.appendChild(new Option(labels.any, ""));
        for (const v of distinct) sel.appendChild(new Option(v, v));
        sel.value = distinct.includes(state.filters![label] ?? "") ? state.filters![label] : "";
        sel.addEventListener("change", () => { state.filters![label] = sel.value; writeState(key, state); apply(); });
        ctl = sel;
      } else {
        const inp = document.createElement("input");
        inp.type = "search";
        inp.placeholder = labels.filter;
        inp.value = state.filters![label] ?? "";
        inp.addEventListener("input", () => { state.filters![label] = inp.value; writeState(key, state); apply(); });
        ctl = inp;
      }
      ctl.className = "tt-filter";
      ctl.dataset.col = label;
      ctl.setAttribute("aria-label", `${labels.filter} · ${label}`);
      ctl.addEventListener("keydown", (e) => e.stopPropagation());
      ctl.addEventListener("click", (e) => e.stopPropagation());
      cell.appendChild(ctl);
    }
    fr.appendChild(cell);
  });
  table.tHead!.appendChild(fr);

  // ── «Clear filters», and how many rows are shown ─────────────────────────
  const bar = document.createElement("div");
  bar.className = "tt-bar";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "tt-clear";
  clear.textContent = labels.clear;
  const count = document.createElement("span");
  count.className = "tt-count";
  clear.addEventListener("click", () => {
    if (clear.getAttribute("aria-disabled") === "true") return;
    state.filters = {};
    for (const c of fr.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".tt-filter")) c.value = "";
    writeState(key, state);
    apply();
  });
  bar.append(clear, count);
  table.before(bar);

  function apply(): void {
    const f = Object.entries(state.filters ?? {}).filter(([, v]) => v.trim());
    const colOf = (label: string): number => heads.findIndex((th) => th.dataset.ttLabel === label);
    let shown = 0;
    for (const g of groups) {
      const ok = f.every(([label, v]) => {
        const ci = colOf(label);
        if (ci < 0) return true;
        const val = cellValue(g[0].cells[ci]).toLowerCase();
        const ctl = fr.querySelector<HTMLElement>(`.tt-filter[data-col="${CSS.escape(label)}"]`);
        return ctl instanceof HTMLSelectElement ? val === v.toLowerCase() : val.includes(v.trim().toLowerCase());
      });
      for (const tr of g) tr.classList.toggle("tt-hidden", !ok);
      if (ok) shown++;
    }
    // the order: the sort's, else the table's own
    const s = state.sort;
    const ci = s ? colOf(s.col) : -1;
    const ordered = [...groups].sort((a, b) => ci >= 0
      ? compareValues(cellValue(a[0].cells[ci]), cellValue(b[0].cells[ci])) * s!.dir || Number(a[0].dataset.ttOrder) - Number(b[0].dataset.ttOrder)
      : Number(a[0].dataset.ttOrder) - Number(b[0].dataset.ttOrder));
    const body = table.tBodies[0];
    for (const g of ordered) for (const tr of g) body.appendChild(tr);
    heads.forEach((th, i) => {
      if (!sortable[i]) return;
      const on = ci === i;
      th.setAttribute("aria-sort", on ? (s!.dir === 1 ? "ascending" : "descending") : "none");
      const arrow = th.querySelector(".tt-arrow");
      if (arrow) arrow.textContent = on ? (s!.dir === 1 ? " ▲" : " ▼") : "";
      th.classList.toggle("tt-sorted", on);
    });
    const any = f.length > 0;
    clear.setAttribute("aria-disabled", String(!any));
    clear.title = any ? labels.clear : labels.clearNone;
    count.textContent = any ? labels.shown(shown, groups.length) : "";
    // MICRO-PANNELLI-OVERLAY-TABULAR p.2 · said to whoever holds the table (the
    // Tabular's head row, where «Clear filters» and the count are)
    table.dataset.ttShown = String(shown);
    table.dataset.ttTotal = String(groups.length);
    table.dispatchEvent(new CustomEvent("tt:change", { bubbles: true, detail: { any, shown, total: groups.length } }));
  }
  apply();
}

function skipped(table: HTMLTableElement): boolean {
  if (table.dataset.noTableTools !== undefined) return true;
  return Object.keys(SKIP).some((c) => table.classList.contains(c));
}

/** Enhance every table already in `root` and every one that arrives later. */
export function installTableTools(root: HTMLElement, labels: () => TableToolsLabels): MutationObserver {
  const scan = (el: ParentNode): void => {
    const list = el instanceof HTMLTableElement ? [el] : [...el.querySelectorAll("table")];
    for (const tb of list) if (!skipped(tb as HTMLTableElement)) enhanceTable(tb as HTMLTableElement, labels());
  };
  scan(root);
  const mo = new MutationObserver((recs) => {
    for (const r of recs)
      for (const n of r.addedNodes)
        if (n instanceof HTMLElement && (n.tagName === "TABLE" || n.querySelector?.("table"))) scan(n);
  });
  mo.observe(root, { childList: true, subtree: true });
  return mo;
}

/** MICRO-VIEWER-UNICO p.6 · set a column's filter from outside (a button that
 *  shows «the interpretations of C.4»): the same control the person types in,
 *  so the state is written and the count said as by hand. False: no such column. */
export function setColumnFilter(table: HTMLTableElement, label: string, value: string): boolean {
  const ctl = table.querySelector<HTMLInputElement | HTMLSelectElement>(`.tt-filter[data-col="${CSS.escape(label)}"]`);
  if (!ctl) return false;
  if (ctl instanceof HTMLSelectElement && value && ![...ctl.options].some((o) => o.value === value))
    ctl.appendChild(new Option(value, value));
  ctl.value = value;
  ctl.dispatchEvent(new Event(ctl instanceof HTMLSelectElement ? "change" : "input"));
  return true;
}

/** MICRO-VIEWER-UNICO p.6 · «Zoom to selection» reaching a row a column filter
 *  hides: the filters that hide THAT row are cleared (the others stay), and
 *  their columns are returned — the caller says so in a line. */
export function clearFiltersHiding(table: HTMLTableElement, tr: HTMLTableRowElement): string[] {
  if (!tr.classList.contains("tt-hidden")) return [];
  const heads = headCells(table);
  const cleared: string[] = [];
  for (const ctl of [...table.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".tt-filter")]) {
    const v = ctl.value.trim();
    if (!v) continue;
    const label = ctl.dataset.col ?? "";
    const ci = heads.findIndex((th) => th.dataset.ttLabel === label);
    if (ci < 0) continue;
    const val = cellValue(tr.cells[ci]).toLowerCase();
    const ok = ctl instanceof HTMLSelectElement ? val === v.toLowerCase() : val.includes(v.toLowerCase());
    if (ok) continue;
    ctl.value = "";
    ctl.dispatchEvent(new Event(ctl instanceof HTMLSelectElement ? "change" : "input"));
    cleared.push(label);
  }
  return cleared;
}
