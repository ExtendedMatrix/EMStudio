// EM-Data table renderer (DP-81). Draws the tabular VIEW built by em-data.ts and
// wires cell edits back through the DocumentStore (same mutation path as the
// Inspector). It owns NO data — every render rebuilds from the store, so it
// stays in sync with the canvas both ways.
//
// WIN6-RESIDUAL · the DOCK IS GONE. The window is the home now.
//
// STRUTTURA (30 set 2026) · the TABLE WINDOW of the desk:
//  · the sheet, the rows/cards choice, the text and the facets are PER WINDOW
//    (`win.state["current.table.*"]`): two tables are two questions;
//  · two groups of sheets — «Fogli EMdb» (editable, `em-data.ts`) and «Viste
//    calcolate» (Chronology, Warnings: read-only, `table-views.ts`);
//  · a filter bar that scales: a text box that also takes `key:value` tokens,
//    one button per facet the sheet declares, removable tokens (`facets.ts`);
//  · cards for Units (the provenance chain), Documents (master and instances)
//    and Chronology.

import { modelsTableHtml, type ModelsCtx } from "./models-sheet";
import type { Space } from "./space";
import type { DocumentStore } from "./model";
import type { Win } from "./workspace";
import { winCurrent, setWinCurrent } from "./workspace";
import { heldBy } from "./shell/hold";
import {
  addQualiaClaim,
  addRow,
  applyEdit,
  buildTable,
  deleteRow,
  type Column,
  type SheetKey,
  type VolatileProvider,
} from "./em-data";
import {
  CARD_VIEWS,
  chronRows,
  docCards,
  facetsFor,
  factsFor,
  indexOf,
  unitCards,
  type Chain,
  type TableView,
  type ViewCtx,
} from "./table-views";
import {
  facetCounts,
  passRow,
  selectionTokens,
  toggleValue,
  type FacetDef,
  type FacetRow,
  type FacetSelection,
} from "./facets";
import { t } from "./i18n";
import { chronologyFor, onChronologyUpdate, type ChronEntry, type ChronRule,
         type ChronState } from "./chron-bridge";

let getStore: () => DocumentStore | null = () => null;
let getCtx: () => ViewCtx | null = () => null;
/** the sheet of a table with no window (and the default of a new window) */
let defaultSheet: TableView = "Units";
let volatileProvider: VolatileProvider = () => false;

const LS_SHEET = "emdata.sheet";


/** AUX2 sets the single source of truth for "is this node volatile?"; the same
 *  predicate the canvas renderer uses, so table and graph never disagree. */
export function setVolatileProvider(fn: VolatileProvider): void {
  volatileProvider = fn;
}

// CURRENT-ELEMENT · the row this window is working on. The table VIEW does not
// own it — the window does (workspace.ts).
let currentRowOf: () => string | null = () => null;
let setCurrentRow: (id: string | null) => void = () => {};
//: ROWSELECT · what picking a row means BEYOND marking it current.
let onRowPicked: (id: string) => void = () => {};
/** a warning's one-click fix, run from the Warnings view */
let runIssueAction: (issueId: string) => void = () => {};
let runIssueBulk: (key: string, nodes: string[]) => void = () => {};

/**
 * WIN5 · where a table is drawn. One renderer, many mounts.
 */
export interface EmDataHost {
  body: HTMLElement;
  count?: HTMLElement | null;
  actions?: HTMLElement | null;
  /** STRUTTURA · the window whose sheet and filters this mount shows */
  win?: Win;
  /** false while the host is hidden (a collapsed dock, a window not shown) */
  enabled: () => boolean;
  /** Where this mount's reading position is kept, when it outlives the element. */
  place?: { recall: () => number; remember: (at: number) => void };
}

const hosts: EmDataHost[] = [];

export function addEmDataHost(host: EmDataHost): void {
  hosts.push(host);
  renderEmData();
}

/** Unregister a host — ownership is explicit (WIN-FIX1). */
export function removeEmDataHost(host: EmDataHost): void {
  const i = hosts.indexOf(host);
  if (i >= 0) hosts.splice(i, 1);
}

// ── per-window state ────────────────────────────────────────────────────────
interface TableState extends FacetSelection {
  sheet: TableView;
  view: "rows" | "cards";
}

const VIEWS: TableView[] = ["Units", "US", "Epochs", "Claims", "Authors", "Documents",
                            "Chron", "Issues", "Models"];
const noWin: TableState = { sheet: "Units", view: "rows", q: "", f: {} };

function stateOf(win?: Win): TableState {
  if (!win) return { ...noWin, sheet: defaultSheet };
  const sheet = winCurrent(win, "table.sheet") as TableView | null;
  const view = winCurrent(win, "table.view");
  const q = winCurrent(win, "table.q");
  const f = winCurrent(win, "table.f");
  return {
    sheet: sheet && VIEWS.includes(sheet) ? sheet : defaultSheet,
    view: view === "cards" ? "cards" : "rows",
    q: typeof q === "string" ? q : "",
    f: f && typeof f === "object" ? (f as Record<string, string[]>) : {},
  };
}

function patchState(win: Win | undefined, patch: Partial<TableState>): void {
  if (!win) {
    if (patch.sheet) defaultSheet = patch.sheet;
    return;
  }
  if (patch.sheet !== undefined) setWinCurrent(win, "table.sheet", patch.sheet);
  if (patch.view !== undefined) setWinCurrent(win, "table.view", patch.view);
  if (patch.q !== undefined) setWinCurrent(win, "table.q", patch.q || null);
  if (patch.f !== undefined)
    setWinCurrent(win, "table.f", Object.values(patch.f).some((v) => v.length) ? patch.f : null);
}

const hostOf = (win?: Win): EmDataHost | undefined =>
  hosts.find((h) => h.win && win && h.win.id === win.id);

/** HDR1 · the text filter of a table window (the header box is gone: the text
 *  box is the filter bar's first field). */
export function emDataFilter(win?: Win): string {
  return stateOf(win).q;
}

export function setEmDataFilter(q: string, win?: Win): void {
  if (q === stateOf(win).q) return;
  patchState(win, { q });
  renderEmData();
}

/** The sheet a table window shows. */
export function currentSheetKey(win?: Win): TableView {
  return stateOf(win).sheet;
}

export function setSheet(key: TableView, win?: Win): void {
  const st = stateOf(win);
  // a new sheet starts unfiltered: its facets are not the old sheet's
  patchState(win, { sheet: key, f: {}, view: CARD_VIEWS.includes(key) ? st.view : "rows" });
  defaultSheet = key;
  try { localStorage.setItem(LS_SHEET, key); } catch { /* not fatal */ }
  closePop();
  renderEmData();
}

export function tableViewOf(win: Win): "rows" | "cards" {
  return stateOf(win).view;
}

export function setTableView(win: Win, view: "rows" | "cards"): void {
  patchState(win, { view });
  renderEmData();
}

/** Add a row to the sheet on screen — the `Righe ▸` menu's own path. */
export function addEmDataRow(store: DocumentStore, win?: Win): string | null {
  const sheet = stateOf(win).sheet;
  if (sheet === "Chron" || sheet === "Issues" || sheet === "Models") return null;
  const id = addRow(store, sheet);
  if (id) renderEmData();
  return id;
}

/** Open/close the claim form of the Claims sheet. */
export function toggleEmDataClaimForm(store: DocumentStore, win?: Win): boolean {
  if (stateOf(win).sheet !== "Claims") return false;
  toggleClaimForm(store, hostOf(win)?.body ?? document.body);
  return true;
}

let onDeleted: ((name: string, store: DocumentStore) => void) | null = null;
/** SPAZIO · the «Modelli e proxy» view: the graph's 3D, read by `space.ts` */
let getSpace: () => { space: Space; units: string[]; ctx: ModelsCtx } | null = () => null;
let onOpenDoc: (docId: string, from: HTMLElement) => void = () => {};
export function initEmData(opts: {
  getStore: () => DocumentStore | null;
  getCtx?: () => ViewCtx | null;
  currentRow?: () => string | null;
  setCurrentRow?: (id: string | null) => void;
  onRowPicked?: (id: string) => void;
  runIssueAction?: (issueId: string) => void;
  /** CATENA · the bulk fix of the rows on screen */
  runIssueBulk?: (key: string, nodes: string[]) => void;
  /** AUDIT N11 · a row went: say which, and give it back («Annulla») */
  onDeleted?: (name: string, store: DocumentStore) => void;
  /** SPAZIO · the space of the graph, for «Modelli e proxy» */
  getSpace?: () => { space: Space; units: string[]; ctx: ModelsCtx } | null;
  /** SPAZIO · «Apri» on an RM: its document, in the service window */
  onOpenDoc?: (docId: string, from: HTMLElement) => void;
}): void {
  if (opts.onDeleted) onDeleted = opts.onDeleted;
  if (opts.getSpace) getSpace = opts.getSpace;
  if (opts.onOpenDoc) onOpenDoc = opts.onOpenDoc;
  getStore = opts.getStore;
  if (opts.getCtx) getCtx = opts.getCtx;
  if (opts.currentRow) currentRowOf = opts.currentRow;
  if (opts.setCurrentRow) setCurrentRow = opts.setCurrentRow;
  if (opts.onRowPicked) onRowPicked = opts.onRowPicked;
  if (opts.runIssueAction) runIssueAction = opts.runIssueAction;
  if (opts.runIssueBulk) runIssueBulk = opts.runIssueBulk;
  // MICRO-cronologia · an answer from the bridge redraws the tables
  onChronologyUpdate(() => renderEmData());
  try {
    const saved = localStorage.getItem(LS_SHEET) as TableView | null;
    if (saved && VIEWS.includes(saved)) defaultSheet = saved;
  } catch { /* private mode */ }
  renderEmData();
}

/** Rebuild the visible tables from the store. */
export function renderEmData(): void {
  for (const h of hosts) {
    if (!h.enabled()) continue;
    // AUDIT N0 · a cell being written keeps its table until the focus leaves it
    if (heldBy(h.body, () => renderEmDataInto(h))) continue;
    renderEmDataInto(h);
  }
  drawPop();
}

// ── the filter bar ──────────────────────────────────────────────────────────
function filterBarHtml(host: EmDataHost, st: TableState, defs: FacetDef[],
                       count: number): string {
  const key = host.win?.id ?? "";
  const btns = defs.map((d) => {
    const n = (st.f[d.key] ?? []).length;
    const open = pop && pop.win === key && pop.key === d.key;
    return `<button class="fbtn${n ? " on" : ""}" type="button" data-fpop="${escapeAttr(d.key)}" ` +
      `aria-haspopup="listbox" aria-expanded="${open ? "true" : "false"}">` +
      `${escapeHtml(t(d.labelKey))}${n ? ` <b>${n}</b>` : ""} <span class="car">▾</span></button>`;
  }).join("");
  const toks = selectionTokens(st, defs).map((tk) =>
    `<button class="ftok" type="button" data-ftok="${escapeAttr(tk.key)}|${escapeAttr(tk.v)}">` +
    (tk.v === "*" ? `${escapeHtml(t(tk.label))}: ${tk.count}` : escapeHtml(tk.label)) +
    ` <span>×</span></button>`).join("");
  const any = st.q || defs.some((d) => (st.f[d.key] ?? []).length);
  return `<div class="fbar">` +
    `<input class="fq" type="search" data-fq="1" value="${escapeAttr(st.q)}" ` +
    `placeholder="${escapeAttr(t(defs.length ? "table.filterTokens" : "table.filter"))}" ` +
    `aria-label="${escapeAttr(t("table.filter"))}">` +
    btns + toks + `<span class="fgrow"></span>` +
    `<span class="fcount">${escapeHtml(t("table.rows", { n: String(count) }))}</span>` +
    (any ? `<button class="fclear" type="button" data-fclear="1">${escapeHtml(t("table.clear"))}</button>` : "") +
    `</div>`;
}

// ── the facet popover (one at a time, over everything) ─────────────────────
let pop: { win: string; key: string; q: string } | null = null;

function closePop(): void {
  pop = null;
  document.querySelector(".fpop")?.remove();
}

function drawPop(): void {
  document.querySelector(".fpop")?.remove();
  if (!pop) return;
  const host = hosts.find((h) => (h.win?.id ?? "") === pop!.win);
  const ctx = getCtx();
  const btn = host?.body.querySelector<HTMLElement>(`[data-fpop="${CSS.escape(pop.key)}"]`);
  if (!host || !ctx || !btn) { pop = null; return; }
  const st = stateOf(host.win);
  const ix = indexOf(ctx);
  const def = facetsFor(st.sheet, ctx, ix).find((d) => d.key === pop!.key);
  if (!def) { pop = null; return; }
  const vals = def.values();
  const rows = [...rowsForCounts(st.sheet, ctx, ix).values()];
  const cnt = facetCounts(rows, st, def.key, labelOfFor(st.sheet, ctx, ix));
  const q = pop.q.toLowerCase();
  const shown = vals.filter((v) => !q || v.label.toLowerCase().includes(q) ||
                                   v.v.toLowerCase().includes(q));
  const sel = new Set(st.f[def.key] ?? []);
  const r = btn.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "fpop";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", t(def.labelKey));
  el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 300))}px`;
  el.style.top = `${r.bottom + 4}px`;
  // never past the bottom of the app: the list scrolls inside instead
  el.style.maxHeight = `${Math.max(180, Math.min(innerHeight * 0.6, innerHeight - r.bottom - 12))}px`;
  el.innerHTML =
    (vals.length > 6
      ? `<input class="fpq" type="search" value="${escapeAttr(pop.q)}" ` +
        `placeholder="${escapeAttr(t("table.findIn", { f: t(def.labelKey).toLowerCase() }))}">`
      : "") +
    `<div class="fpl" role="listbox" aria-multiselectable="true">` +
    (shown.length
      ? shown.map((v) =>
          `<label style="padding-left:${12 + (q ? 0 : (v.depth ?? 0) * 18)}px">` +
          `<input type="checkbox" data-fval="${escapeAttr(v.v)}"${sel.has(v.v) ? " checked" : ""}>` +
          `<span class="l">${escapeHtml(v.label)}</span>` +
          (v.hint ? `<span class="h">${escapeHtml(v.hint)}</span>` : "") +
          `<span class="c">${cnt.get(v.v) ?? 0}</span></label>`).join("")
      : `<p class="fpnone">${escapeHtml(t("strip.noResults"))}</p>`) +
    `</div><div class="fpf">` +
    `<button type="button" data-fall="1">${escapeHtml(t("table.all"))}</button>` +
    `<button type="button" data-fall="0">${escapeHtml(t("table.none"))}</button></div>`;
  document.body.appendChild(el);
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  const pq = el.querySelector<HTMLInputElement>(".fpq");
  if (pq) {
    pq.addEventListener("input", () => {
      pop!.q = pq.value;
      const pos = pq.selectionStart ?? pq.value.length;
      drawPop();
      const again = document.querySelector<HTMLInputElement>(".fpop .fpq");
      again?.focus();
      again?.setSelectionRange(pos, pos);
    });
  }
  el.querySelectorAll<HTMLInputElement>("[data-fval]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const v = vals.find((x) => x.v === cb.dataset.fval);
      if (!v) return;
      const next = toggleValue(stateOf(host.win), def.key, v, cb.checked);
      patchState(host.win, { f: next.f });
      renderEmData();
    });
  });
  el.querySelectorAll<HTMLButtonElement>("[data-fall]").forEach((b) => {
    b.addEventListener("click", () => {
      const f = { ...stateOf(host.win).f, [def.key]: b.dataset.fall === "1" ? shown.map((x) => x.v) : [] };
      patchState(host.win, { f });
      renderEmData();
    });
  });
}

document.addEventListener("pointerdown", (e) => {
  if (!pop) return;
  const tgt = e.target as HTMLElement;
  if (tgt.closest?.(".fpop, [data-fpop]")) return;
  closePop();
  renderEmData();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pop) { closePop(); renderEmData(); }
});

// ── rows for filtering and counting ─────────────────────────────────────────
function rowsForCounts(sheet: TableView, ctx: ViewCtx, ix: ReturnType<typeof indexOf>):
    Map<string, FacetRow> {
  return factsFor(sheet, ctx, ix);
}

function labelOfFor(sheet: TableView, ctx: ViewCtx, ix: ReturnType<typeof indexOf>):
    (key: string, v: string) => string {
  const defs = facetsFor(sheet, ctx, ix);
  const cache = new Map<string, Map<string, string>>();
  return (key, v) => {
    let m = cache.get(key);
    if (!m) {
      m = new Map((defs.find((d) => d.key === key)?.values() ?? []).map((x) => [x.v, x.label]));
      cache.set(key, m);
    }
    return m.get(v) ?? v;
  };
}

// ── drawing ─────────────────────────────────────────────────────────────────
function renderEmDataInto(host: EmDataHost): void {
  const body = host.body;
  const wasAt = body.scrollTop || host.place?.recall() || 0;
  if (body.scrollTop) host.place?.remember(body.scrollTop);
  const keepScroll = (): void => {
    if (!wasAt) return;
    body.scrollTop = wasAt;
    if (body.scrollTop !== wasAt) requestAnimationFrame(() => { body.scrollTop = wasAt; });
    host.place?.remember(wasAt);
  };
  const countEl = host.count;
  if (host.actions) host.actions.innerHTML = "";

  const store = getStore();
  const ctx = getCtx();
  if (!store || !ctx) {
    body.innerHTML = `<div class="emdata-empty">${escapeHtml(t("table.empty"))}</div>`;
    if (countEl) countEl.textContent = "";
    return;
  }
  // keep the focus in the text box across the rebuild (a keystroke re-renders)
  const hadFocus = document.activeElement?.closest?.(".tile-tablebody") === body &&
                   (document.activeElement as HTMLElement).matches(".fq");
  const caret = hadFocus ? (document.activeElement as HTMLInputElement).selectionStart : null;

  const st = stateOf(host.win);
  const ix = indexOf(ctx);
  const defs = facetsFor(st.sheet, ctx, ix);
  const facts = factsFor(st.sheet, ctx, ix);
  const labelOf = labelOfFor(st.sheet, ctx, ix);
  const passes = (id: string, fallbackText: string): boolean => {
    const r = facts.get(id);
    return passRow(r ?? { text: fallbackText.toLowerCase(), fx: {} }, st, labelOf);
  };

  let content = "";
  let count = 0;
  const cards = st.view === "cards" && CARD_VIEWS.includes(st.sheet);

  if (st.sheet === "Chron") {
    // asked of s3Dgraphy through the bridge when the view is drawn and the
    // document changed; the answer lives in memory, the document gets nothing
    const cs = chronologyFor(store.doc, () => store.toJSON());
    const rows = chronRows(ctx, ix, cs.status === "ok" ? cs.map : null)
      .filter((r) => passes(r.node.id, String(r.node.name)));
    count = rows.length;
    content = cards ? chronCardsHtml(rows, cs) : chronTableHtml(rows, cs);
  } else if (st.sheet === "Models") {
    const sp = getSpace();
    if (sp) {
      const r = modelsTableHtml(sp.space, sp.units, sp.ctx, (id, text) => passes(id, text));
      count = r.count;
      content = r.html;
    }
  } else if (st.sheet === "Issues") {
    const rows = ctx.issues.filter((i) => passes(i.id, i.txt));
    count = rows.length;
    content = issuesTableHtml(rows, ctx, ix);
  } else if (cards && st.sheet === "Units") {
    const ids = new Set([...facts.keys()].filter((id) => passes(id, id)));
    const cs = unitCards(ctx, ix, ids);
    count = cs.length;
    content = unitCardsHtml(cs);
  } else if (cards && st.sheet === "Documents") {
    const ids = new Set(ctx.nodes.filter((n) => n.node_type === "document" &&
      passes(n.id, [n.name, n.id, n.description].join(" "))).map((n) => n.id));
    const cs = docCards(ctx, ix, ids);
    count = cs.length;
    content = docCardsHtml(cs);
  } else {
    const r = emdbTableHtml(store, st.sheet as SheetKey, passes);
    count = r.count;
    content = r.html;
  }
  // the count lives in the filter bar, next to what it counts
  if (countEl) countEl.textContent = "";

  body.innerHTML = filterBarHtml(host, st, defs, count) + content;
  wireBody(host, store, st);
  if (hadFocus) {
    const f = body.querySelector<HTMLInputElement>(".fq");
    f?.focus();
    if (f && caret != null) f.setSelectionRange(caret, caret);
  }
  keepScroll();
}

/** The EDITABLE sheets, as they were — filtered by the facets now. */
function emdbTableHtml(store: DocumentStore, sheet: SheetKey,
                       passes: (id: string, text: string) => boolean): { html: string; count: number } {
  const table = buildTable(store, sheet, volatileProvider);
  const rows = table.rows.filter((r) =>
    passes(r.id, [r.id, ...Object.values(r.cells)].join(" ")));
  const claimForm = sheet === "Claims" ? '<div class="emdata-claimform-slot"></div>' : "";
  const head = `<tr><th class="emdata-gutter-head" title="${escapeAttr(t("table.pickHint"))}"></th>` +
    table.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("") + `<th></th></tr>`;
  const rowsHtml = rows.map((row) => {
    const cells = table.columns.map((col, ci) =>
      renderCell(row.readonly ? { ...col, editor: { kind: "readonly" } } : col,
                 row.id, row.cells[col.key] ?? "", ci === 0 ? row.depth ?? 0 : 0)).join("");
    const del = row.readonly ? `<td class="emdata-rowop"></td>`
      : `<td class="emdata-rowop"><button data-del="${escapeAttr(row.id)}" title="${escapeAttr(t("table.delete"))}">✕</button></td>`;
    const cur = row.id === currentRowOf() ? " emdata-current" : "";
    const gutter = `<td class="emdata-gutter"><button class="emdata-pick" data-pick="${escapeAttr(
      row.id)}" title="${escapeAttr(t("table.pickRow"))}" tabindex="-1">▸</button></td>`;
    return `<tr class="${row.volatile ? "emdata-vol" : ""}${row.readonly ? " emdata-ro-row" : ""}${cur}" ` +
      `data-row="${escapeAttr(row.id)}">${gutter}${cells}${del}</tr>`;
  }).join("");
  return {
    count: rows.length,
    html: claimForm + `<table class="emdata-table"><thead>${head}</thead><tbody>${rowsHtml}</tbody></table>`,
  };
}

const nm = (n: { name?: unknown; id: string } | undefined | null): string =>
  n ? String(n.name || n.id) : "—";
const link = (n: { name?: unknown; id: string } | undefined | null): string =>
  n ? `<button class="tv-link" type="button" data-go="${escapeAttr(n.id)}">${escapeHtml(nm(n))}</button>` : "—";

type ChronRowT = ReturnType<typeof chronRows>[number];

/** The pieces both chronology renderers share: one reading of each cell. */
function chronCells(cs: ChronState) {
  const ix = getCtx() ? indexOf(getCtx()!) : null;
  const byName = (id?: string | null): string => (id && ix ? nm(ix.byId.get(id)) : "");
  const ruleLabel = (r: ChronRule | null): string => (r ? t(`table.rule.${r}`) : "");
  const dim = (s: string): string => `<span class="tv-d">${escapeHtml(s)}</span>`;
  // the provenance of a propagated bound IS the relation it arrived along
  // (E.D., 29 set): «≥ 1100 · is_after USM101», «≥ 100 · contenuti · RSF100b ←
  // SF100», «≤ 1300 · epoca · Medioevo», «≥ 180 · scritta»
  const why = (e: ChronEntry, side: "start" | "end"): string => {
    const rule = side === "start" ? e.start_rule : e.end_rule;
    const src = byName(side === "start" ? e.start_source : e.end_source);
    const rel = side === "start" ? e.start_relation : e.end_relation;
    if (rule === "written") return ruleLabel(rule);   // the unit's own date
    if (rule === "contained" && e.contained)
      return `${ruleLabel(rule)} · ${byName(e.contained.source)}` +
        (e.contained.original ? " ← " + byName(e.contained.original) : "");
    if (rule === "tpq" || rule === "taq") return `${rel ?? ruleLabel(rule)} ${src}`;
    return `${ruleLabel(rule)}${src ? " · " + src : ""}`;
  };
  const bound = (e: ChronEntry, side: "start" | "end"): string => {
    const v = side === "start" ? e.start : e.end;
    if (v == null) return "";
    return `${side === "start" ? "≥" : "≤"} ${v} ` + dim(`· ${why(e, side)}`);
  };
  const stale = cs.stale ? " " + dim(t("table.chronStale")) : "";
  const prop = (r: ChronRowT): string => {
    if (r.chron) {
      const parts = [bound(r.chron, "start"), bound(r.chron, "end")].filter(Boolean);
      return (parts.join("<br>") || "—") + stale;
    }
    switch (cs.status) {
      case "ok": return "—";
      case "off": return dim(t("table.chronOff"));
      case "error": return dim(t("table.chronError", { x: cs.error ?? "" }));
      default: return dim(t("table.chronLoading"));
    }
  };
  // the rule from the contents: s3Dgraphy's when the bridge answered, the TS
  // preview (marked) when it did not
  const finds = (r: ChronRowT): string => {
    if (cs.status === "ok") {
      const c = r.chron?.contained;
      return c
        ? `≥ ${c.start} ${dim(t("table.tpqFrom", { x: byName(c.source) }) +
            (c.original ? " ← " + byName(c.original) : ""))}`
        : "—";
    }
    return r.finds
      ? `≥ ${r.finds.v} ${dim(t("table.tpqFrom", { x: byName(r.finds.via) }) +
          (r.finds.origin ? " ← " + byName(r.finds.origin) : "") +
          (r.finds.fromEpoch ? " · " + t("table.byEpoch") : ""))} ` +
        `<span class="tv-tag">${escapeHtml(t("table.preview"))}</span>`
      : "—";
  };
  // what surrounds the table: how to start the bridge, and what s3Dgraphy said
  const notes = (): string => {
    if (cs.status === "off")
      return `<p class="tv-lead"><b>${escapeHtml(t("table.chronOff"))}.</b> ` +
        `${escapeHtml(t("table.chronOffHow"))}</p>`;
    if (cs.status === "ok" && cs.warnings.length)
      return `<details class="tv-lead"><summary>${escapeHtml(
        t("table.chronWarnings", { n: String(cs.warnings.length) }))}</summary><ul>` +
        cs.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("") + `</ul></details>`;
    return "";
  };
  return { prop, finds, notes };
}

function chronTableHtml(rows: ChronRowT[], cs: ChronState): string {
  const c = chronCells(cs);
  return `<div class="tv-pad"><p class="tv-lead">${escapeHtml(t("table.chronLead"))}</p>${c.notes()}` +
    `<table class="emdata-table tv-table"><thead><tr><th>${escapeHtml(t("table.col.unit"))}</th>` +
    `<th>${escapeHtml(t("table.col.epoch"))}</th><th>${escapeHtml(t("table.col.written"))}</th>` +
    `<th>${escapeHtml(t("table.col.finds"))}</th><th>${escapeHtml(t("table.col.propagated"))}</th></tr></thead><tbody>` +
    rows.map((r) => `<tr data-id="${escapeAttr(r.node.id)}"${r.node.id === currentRowOf() ? ' class="emdata-current"' : ""}>` +
      `<td class="tv-id">${escapeHtml(nm(r.node))}</td><td>${escapeHtml(r.epoch || "—")}</td>` +
      `<td class="tv-num tv-w">${r.written ?? `<span class="tv-d">${escapeHtml(t("table.nothing"))}</span>`}</td>` +
      `<td class="tv-num">${c.finds(r)}</td><td class="tv-num">${c.prop(r)}</td></tr>`).join("") +
    `</tbody></table></div>`;
}

function chronCardsHtml(rows: ChronRowT[], cs: ChronState): string {
  const c = chronCells(cs);
  return `<div class="tv-pad"><p class="tv-lead">${escapeHtml(t("table.chronLead"))}</p>${c.notes()}<div class="tv-cols">` +
    rows.map((r) => `<div class="tv-card" data-id="${escapeAttr(r.node.id)}"><h3>${escapeHtml(nm(r.node))}</h3>` +
      `<div class="tv-f"><span>${escapeHtml(t("table.col.written"))}</span><span class="tv-num">${r.written ?? escapeHtml(t("table.nothing"))}</span></div>` +
      `<div class="tv-f"><span>${escapeHtml(t("table.col.finds"))}</span><span class="tv-num">${c.finds(r)}</span></div>` +
      `<div class="tv-f"><span>${escapeHtml(t("table.col.propagated"))}</span><span class="tv-num">${c.prop(r)}</span></div></div>`).join("") +
    `</div></div>`;
}

function chainHtml(c: Chain): string {
  return `<div class="tv-chain"><div><span class="tv-tag">${escapeHtml(String(c.prop.name || ""))}</span>` +
    `<b>${escapeHtml(c.value || "—")}</b></div>` +
    (c.combiner ? `<div><span class="tv-ar">←</span>${link(c.combiner)}</div>` : "") +
    (c.extractors.length ? `<div><span class="tv-ar">←</span>${c.extractors.map(link).join(" · ")}` +
      (c.authors.length ? ` <span class="tv-d">${escapeHtml(c.authors.map(nm).join(", "))}</span>` : "") + `</div>` : "") +
    (c.docs.length ? `<div><span class="tv-ar">←</span>${c.docs.map(link).join(" · ")}</div>` : "") +
    `</div>`;
}

function unitCardsHtml(cs: ReturnType<typeof unitCards>): string {
  return `<div class="tv-pad"><p class="tv-lead">${escapeHtml(t("table.provLead"))}</p><div class="tv-cols">` +
    cs.map((c) => `<div class="tv-card" data-id="${escapeAttr(c.node.id)}"><h3>${escapeHtml(nm(c.node))}</h3>` +
      `<div class="tv-meta"><span class="tv-tag">${escapeHtml(c.node.node_type)}</span>` +
      `<span class="tv-tag">${escapeHtml(c.epoch || "—")}</span>${c.hasPd ? '<span class="tv-tag pd">PD</span>' : ""}</div>` +
      (c.chains.length ? c.chains.map(chainHtml).join("")
        : `<p class="tv-d">${escapeHtml(t("table.noProps"))}</p>`) + `</div>`).join("") +
    `</div></div>`;
}

function docCardsHtml(cs: ReturnType<typeof docCards>): string {
  return `<div class="tv-pad"><p class="tv-lead">${escapeHtml(t("table.docsLead"))}</p><div class="tv-cols">` +
    cs.map((c) => `<div class="tv-card" data-id="${escapeAttr(c.node.id)}"><h3>${escapeHtml(nm(c.node))} ` +
      `<span class="tv-tag">${escapeHtml(t("table.master"))}</span></h3>` +
      `<p class="tv-desc">${escapeHtml(String(c.node.description ?? ""))}</p>` +
      `<div class="tv-eyebrow">${escapeHtml(t("table.uses", { n: String(c.uses) }))}</div>` +
      c.owners.map((o, i) => `<div class="tv-chain"><div><span class="tv-tag">${escapeHtml(t("table.instance", { n: String(i + 1) }))}</span>` +
        `${link(o.unit)} <span class="tv-d">· ${escapeHtml(o.extractors.map(nm).join(", "))}</span></div></div>`).join("") +
      `</div>`).join("") + `</div></div>`;
}

function issuesTableHtml(rows: ViewCtx["issues"], ctx: ViewCtx, ix: ReturnType<typeof indexOf>): string {
  void ctx;
  const ico = (s: string): string => (s === "warn" ? "▲" : "●");
  // CATENA · «Verifica tutti» over the rows ON SCREEN (the filters decide which)
  const bulkRows = rows.filter((i) => i.bulk && i.node);
  const bulkKeys = [...new Set(bulkRows.map((i) => i.bulk!.key))];
  const bulkBtns = bulkKeys.map((k) => {
    const rs = bulkRows.filter((i) => i.bulk!.key === k);
    const nodes = [...new Set(rs.map((i) => i.node))].join(" ");
    return rs.length > 1 ? `<button class="tv-act" type="button" data-issue-bulk="${escapeAttr(k)}" data-nodes="${escapeAttr(nodes)}">${escapeHtml(rs[0].bulk!.label(rs.length))}</button>` : "";
  }).join(" ");
  return `<div class="tv-pad"><p class="tv-lead">${escapeHtml(t("issues.lead"))} ${bulkBtns}</p>` +
    `<table class="emdata-table tv-table"><thead><tr><th>${escapeHtml(t("table.fx.sev"))}</th>` +
    `<th>${escapeHtml(t("table.fx.rule"))}</th><th>${escapeHtml(t("table.col.node"))}</th>` +
    `<th>${escapeHtml(t("table.col.msg"))}</th><th></th></tr></thead><tbody>` +
    (rows.length ? rows.map((i) =>
      `<tr${i.node ? ` data-id="${escapeAttr(i.node)}"` : ""}>` +
      `<td><span class="sevtag ${i.sev}">${ico(i.sev)} ${escapeHtml(t(`issues.sev.${i.sev}`))}</span></td>` +
      `<td class="tv-num">${escapeHtml(i.rule)}</td>` +
      `<td class="tv-id">${i.node ? escapeHtml(nm(ix.byId.get(i.node))) : "—"}</td>` +
      `<td>${escapeHtml(i.txt)}</td>` +
      `<td>${i.action ? `<button class="tv-act" type="button" data-issue-act="${escapeAttr(i.id)}">${escapeHtml(i.action.label)}</button>` : ""}</td></tr>`).join("")
      : `<tr><td colspan="5" class="tv-ok">${escapeHtml(t("issues.none"))}</td></tr>`) +
    `</tbody></table></div>`;
}

// ── wiring ──────────────────────────────────────────────────────────────────
function wireBody(host: EmDataHost, store: DocumentStore, st: TableState): void {
  const body = host.body;
  const win = host.win;
  const fq = body.querySelector<HTMLInputElement>(".fq");
  fq?.addEventListener("input", () => setEmDataFilter(fq.value, win));
  fq?.addEventListener("pointerdown", (e) => e.stopPropagation());
  body.querySelectorAll<HTMLButtonElement>("[data-fpop]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = b.dataset.fpop!;
      const same = pop && pop.win === (win?.id ?? "") && pop.key === key;
      pop = same ? null : { win: win?.id ?? "", key, q: "" };
      renderEmData();
      document.querySelector<HTMLInputElement>(".fpop .fpq")?.focus();
    }));
  body.querySelectorAll<HTMLButtonElement>("[data-ftok]").forEach((b) =>
    b.addEventListener("click", () => {
      const [key, v] = b.dataset.ftok!.split("|");
      const f = { ...st.f, [key]: v === "*" ? [] : (st.f[key] ?? []).filter((x) => x !== v) };
      patchState(win, { f });
      renderEmData();
    }));
  body.querySelector<HTMLButtonElement>("[data-fclear]")?.addEventListener("click", () => {
    patchState(win, { q: "", f: {} });
    closePop();
    renderEmData();
  });
  // a node named anywhere in a view (a card, a link, a computed row) is a pick
  body.querySelectorAll<HTMLElement>("[data-go]").forEach((el) =>
    el.addEventListener("click", (e) => { e.stopPropagation(); onRowPicked(el.dataset.go!); }));
  body.querySelectorAll<HTMLElement>("[data-open-doc]").forEach((el) =>
    el.addEventListener("click", (e) => { e.stopPropagation(); onOpenDoc(el.dataset.openDoc!, el); }));
  body.querySelectorAll<HTMLElement>("[data-id]").forEach((el) =>
    el.addEventListener("click", () => {
      setCurrentRow(el.dataset.id!);
      onRowPicked(el.dataset.id!);
    }));
  body.querySelectorAll<HTMLButtonElement>("[data-issue-act]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); runIssueAction(b.dataset.issueAct!); }));
  body.querySelectorAll<HTMLButtonElement>("[data-issue-bulk]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      runIssueBulk(b.dataset.issueBulk!, (b.dataset.nodes ?? "").split(" ").filter(Boolean));
    }));

  // the editable sheets: cell editors, row selection, delete
  const sheet = st.sheet as SheetKey;
  body.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => {
    const rowId = el.getAttribute("data-row")!;
    const colKey = el.getAttribute("data-col")!;
    const commit = (): void => {
      const value = (el as HTMLInputElement | HTMLSelectElement).value;
      applyEdit(store, sheet, rowId, colKey, value);
    };
    el.addEventListener("change", commit);
    if (el.tagName !== "SELECT")
      el.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") (el as HTMLInputElement).blur();
      });
  });
  const markCurrent = (rowId: string | null): void => {
    setCurrentRow(rowId);
    body.querySelectorAll("tr.emdata-current").forEach((r) => r.classList.remove("emdata-current"));
    if (rowId) body.querySelector(`tr[data-row="${CSS.escape(rowId)}"]`)?.classList.add("emdata-current");
  };
  body.querySelectorAll<HTMLTableRowElement>("tr[data-row]").forEach((tr) =>
    tr.addEventListener("mousedown", () => markCurrent(tr.getAttribute("data-row"))));
  body.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((btn) => {
    const rowId = btn.getAttribute("data-pick")!;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      markCurrent(rowId);
      onRowPicked(rowId);
    });
    btn.addEventListener("click", (e) => e.preventDefault());
  });
  body.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-del")!;
      const name = String(store.node(id)?.name || id);
      deleteRow(store, id);
      onDeleted?.(name, store);
    };
  });
}

function renderCell(col: Column, rowId: string, value: string, depth = 0): string {
  const e = col.editor;
  const pad = depth ? ` style="padding-left:${10 + depth * 20}px"` : "";
  const lead = depth ? `<span class="tv-d">└ </span>` : "";
  const common = `data-edit data-row="${escapeAttr(rowId)}" data-col="${escapeAttr(col.key)}"`;
  if (e.kind === "readonly")
    return `<td class="emdata-ro"${pad}>${lead}${escapeHtml(value)}</td>`;
  if (e.kind === "select") {
    const opts = e.options.map((o) =>
      `<option value="${escapeAttr(o.value)}"${o.value === value ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("");
    return `<td${pad}>${lead}<select ${common}>${opts}</select></td>`;
  }
  return `<td${pad}>${lead}<input ${common} type="${e.kind === "number" ? "number" : "text"}" value="${escapeAttr(value)}" /></td>`;
}

// ── add-claim affordance (Claims sheet) ─────────────────────────────────────
function toggleClaimForm(store: DocumentStore, root: HTMLElement): void {
  const slot = root.querySelector<HTMLElement>(".emdata-claimform-slot");
  if (!slot) return;
  if (slot.firstChild) {
    slot.innerHTML = "";
    return;
  }
  const units = store.doc.graph.nodes.filter(
    (n) =>
      n.node_type &&
      (n.node_type === "EpochNode" ||
        n.node_type === "epoch" ||
        /^(US|USV|USD|USN|SF|SE|VSF|RSF|UL|BR|ser)/.test(n.node_type)),
  );
  const opts = units
    .map((u) => `<option value="${escapeAttr(u.id)}">${escapeHtml(String(u.name ?? u.id))}</option>`)
    .join("");
  // AUDIT C · no ids: with two tables open the form appeared twice and
  // `#cf-add` found the first one; each form's fields are read inside it
  slot.innerHTML = `<div class="emdata-claimform">
    <label>${escapeHtml(t("claim.target"))} <select data-cf="target">${opts}</select></label>
    <label>${escapeHtml(t("claim.property"))} <input data-cf="prop" placeholder="${escapeAttr(t("claim.propertyEg"))}" /></label>
    <label>${escapeHtml(t("claim.value"))} <input data-cf="value" placeholder="${escapeAttr(t("claim.valueEg"))}" /></label>
    <button data-cf="add">${escapeHtml(t("claim.add"))}</button>
  </div>`;
  const cf = <T extends HTMLElement>(k: string) => slot.querySelector<T>(`[data-cf="${k}"]`);
  cf<HTMLButtonElement>("add")!.onclick = () => {
    const target = cf<HTMLSelectElement>("target")?.value;
    const prop = cf<HTMLInputElement>("prop")?.value.trim();
    const value = cf<HTMLInputElement>("value")?.value.trim();
    if (!target || !prop) return;
    addQualiaClaim(store, target, prop, value ?? "");
    slot.innerHTML = "";
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
