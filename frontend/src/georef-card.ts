/**
 * MICRO-P-GEOREF-PER-GRAFO (E.D., 17 Nov 2026) · the card «Georeferenziazione»,
 * opened from the Space's bar and from File ▸ Georeferenziazione….
 *
 * THE RULE (E.D., not negotiable): the georeference lives on each GRAPH, never
 * on the file. An em.json may hold graphs in different systems; the card shows
 * and edits the GeoPositionNode of ONE graph — the one chosen, the active one
 * at the opening — and, when the file holds more, lists each with its own
 * system. Nothing here writes one value over all the graphs, nothing moves the
 * georeference from a graph to the file.
 *
 * Two levels:
 *  - the GRAPH: one field «Coordinate system» (a code, or words of its name —
 *    «Stereo 70» → 3844, PROJ's database through the bridge), shift X / Y, the
 *    azimuth and its reference (grid / true); shift Z shown 0 and not editable
 *    (E.D.'s convention: the heights are in the models). No GeoPositionNode:
 *    «Not georeferenced» and «Georeference this graph». An empty system is «not
 *    georeferenced», never 4326. The datum operation is said only when two
 *    models of the Earth meet (a model on another datum, or one already
 *    declared); else it waits under «Advanced».
 *  - the MODELS of that graph (RM, RMDoc, tilesets): each «as the graph» (no
 *    frame: it follows every change of the graph's) or in a system of its own
 *    (`data.frame`: a CRS and a shift, and its datum operation when its datum is
 *    not the graph's), with what the Space does of it: «in the graph's system» /
 *    «reprojected from EPSG:xxxx» / «local, not georeferenced».
 *
 * Every change is one undo step of the graph's store, a line of the Log on the
 * node it changed (its history), and the Space redrawn: the models' positions
 * are never rewritten, only the transformation from their frame to the graph's.
 */
import { t } from "./i18n";
import { DocumentStore } from "./model";
import { openDialog } from "./app-dialog";
import type { EmNode } from "./types";
import { readFrame, makeFrame, type FileFrame } from "./file-frame";
import {
  crsQuery, datumOpen, epsgOf, fmtCoord, modelGeoState, normaliseDatumOperation, type CrsInfo,
} from "./georef";
import { crsInfoOf } from "./georef-panel";

export interface GeorefGraph {
  /** the slot's id */
  id: string;
  label: string;
  store: DocumentStore;
}

export interface CardModel {
  id: string;
  name: string;
  /** RM, RMDoc, a tileset */
  kind: "rm" | "rmdoc" | "tileset";
  /** its frame and the node that says it (s3Dgraphy's `frame_of` order) */
  frame: { frame: FileFrame; from: string } | null;
  /** where a new frame is written: the frame's node, else the tileset's asset, else the model */
  home: string;
}

export interface GeorefCardDeps {
  /** the graphs of the active graph's FILE (one entry: a file of one graph) */
  graphs: () => GeorefGraph[];
  /** the slot of the graph active in the editor */
  activeId: () => string | null;
  /** the models of a graph, with their frames */
  models: (st: DocumentStore) => CardModel[];
  /** the bridge's base URL, or null when none answers */
  bridge: () => Promise<string | null>;
  /** a line in the Log on these nodes (their history) */
  log: (msg: string, ids: string[]) => void;
  /** a step was written in `st`: «Undo», the Space and the Inspector redrawn */
  done: (msg: string, st: DocumentStore) => void;
  /** the «?» of the card */
  help: (text: string, probe: string) => HTMLElement;
  close: () => void;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ── what the bridge says (PROJ), kept by question ───────────────────────────

export interface DatumOp { code: string; name: string; accuracy: number | null; ballpark: boolean; area: string | null; here: boolean | null }
export interface DatumInfo {
  ok: boolean; epsg: number; name?: string; datum?: string | null; wgs84?: boolean;
  ops?: DatumOp[]; best?: string | null;
  other?: { epsg: number; name: string; datum: string | null; wgs84: boolean; same_datum: boolean; same_grid: boolean };
  error?: string;
}
const asked = new Map<string, unknown>();
function ask<T>(key: string, url: (base: string) => string, redraw: () => void, bridge: () => Promise<string | null>): T | { error: string } | null {
  const have = asked.get(key);
  if (have === "pending") return null;
  if (have !== undefined) return have as T | { error: string };
  asked.set(key, "pending");
  void (async () => {
    const base = await bridge().catch(() => null);
    let out: unknown;
    if (!base) out = { error: t("gr.noBridge") };
    else {
      const r = await fetch(url(base)).catch(() => null);
      const j = await r?.json().catch(() => null);
      out = r?.status === 404 ? { error: t("georef.oldBridge") } : j ?? { error: `HTTP ${r?.status ?? "?"}` };
    }
    asked.set(key, out);
    redraw();
  })();
  return null;
}
export function datumInfo(epsg: number, other: number | null, at: [number, number] | null, redraw: () => void,
                          bridge: () => Promise<string | null>): DatumInfo | { error: string } | null {
  const q = `epsg=${epsg}${other ? `&other=${other}` : ""}${at ? `&x=${at[0]}&y=${at[1]}` : ""}`;
  return ask<DatumInfo>(`datum|${q}`, (b) => `${b}/geo/datum?${q}`, redraw, bridge);
}

export interface CrsHit { epsg: number; name: string; deprecated: boolean; kind: string; area: string | null }
async function searchCrs(q: string, bridge: () => Promise<string | null>): Promise<CrsHit[] | { error: string }> {
  const base = await bridge().catch(() => null);
  if (!base) return { error: t("gr.noBridge") };
  const r = await fetch(`${base}/geo/crs-search?q=${encodeURIComponent(q)}&limit=12`).catch(() => null);
  const j = await r?.json().catch(() => null);
  if (r?.status === 404) return { error: t("georef.oldBridge") };
  return j?.ok ? (j.hits as CrsHit[]) : { error: String(j?.error ?? r?.status ?? "?") };
}

// ── the field «Coordinate system»: a code, or words of its name ─────────────

/** an input whose value is a CRS: Enter or a pick writes it, words search PROJ */
function crsField(current: number | null, write: (epsg: number | null) => void, deps: GeorefCardDeps, probe: string): HTMLElement {
  const wrap = el("div", "gr-crs");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "insp-name-input gr-crs-input";
  input.value = current === null ? "" : `EPSG:${current}`;
  input.placeholder = t("gr.crsPlaceholder");
  input.dataset.grField = probe;
  input.autocomplete = "off";
  const list = el("div", "gr-crs-hits hidden");
  list.dataset.grHits = probe;
  wrap.append(input, list);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hits: CrsHit[] = [];
  const pick = (epsg: number | null) => { list.classList.add("hidden"); write(epsg); };
  const show = (r: CrsHit[] | { error: string }) => {
    list.textContent = "";
    if ("error" in r) { list.appendChild(el("div", "insp-hint", r.error)); list.classList.remove("hidden"); return; }
    hits = r;
    if (!r.length) list.appendChild(el("div", "insp-hint", t("gr.noHit")));
    for (const h of r) {
      const b = el("button", "gr-crs-hit" + (h.deprecated ? " deprecated" : "")) as HTMLButtonElement;
      b.type = "button";
      b.dataset.grHit = String(h.epsg);
      b.textContent = `EPSG:${h.epsg} · ${h.name}${h.deprecated ? ` · ${t("gr.deprecated")}` : ""}`;
      b.title = h.area ?? "";
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => pick(h.epsg));
      list.appendChild(b);
    }
    list.classList.remove("hidden");
  };
  input.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    const q = crsQuery(input.value);
    if (!q || "code" in q) { list.classList.add("hidden"); return; }
    timer = setTimeout(() => { void searchCrs(q.words, deps.bridge).then(show); }, 250);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = crsQuery(input.value);
    if (!q) { pick(null); return; }
    if ("code" in q) { pick(q.code); return; }
    if (hits.length) pick(hits[0].epsg);
  });
  input.addEventListener("change", () => {
    const q = crsQuery(input.value);
    if (!q) pick(null);
    else if ("code" in q && q.code !== current) pick(q.code);
  });
  input.addEventListener("blur", () => setTimeout(() => list.classList.add("hidden"), 150));
  return wrap;
}

/** a labelled cell of the card's grid */
function cell(grid: HTMLElement, label: string, control: HTMLElement, hint = ""): HTMLElement {
  const l = el("label", "gr-f");
  l.appendChild(el("span", "insp-field-label", label));
  l.appendChild(control);
  if (hint) l.title = hint;
  grid.appendChild(l);
  return l;
}
function numberInput(value: number, probe: string, onWrite: (v: number) => void, disabled = false): HTMLInputElement {
  const i = document.createElement("input");
  i.className = "insp-name-input";
  i.inputMode = "decimal";
  i.value = fmtCoord(value);
  i.dataset.grField = probe;
  i.disabled = disabled;
  i.addEventListener("change", () => {
    const s = i.value.trim().replace(",", ".");
    const n = s === "" ? 0 : Number(s);
    if (!Number.isFinite(n)) { i.value = fmtCoord(value); i.classList.add("georef-bad"); return; }
    if (n !== value) onWrite(n);
  });
  return i;
}

// ── the card ─────────────────────────────────────────────────────────────────

/** which graph the card shows (kept across redraws; the active one at the opening) */
let chosen: string | null = null;
export function chooseGraph(id: string | null): void { chosen = id; }
export function chosenGraph(): string | null { return chosen; }

/** The card's content, drawn into `card` (emptied first) */
export function renderGeorefCard(card: HTMLElement, deps: GeorefCardDeps, redraw: () => void): void {
  card.textContent = "";
  const graphs = deps.graphs();
  if (!graphs.some((g) => g.id === chosen)) chosen = deps.activeId() && graphs.some((g) => g.id === deps.activeId()) ? deps.activeId() : graphs[0]?.id ?? null;
  const head = el("div", "ccard-head");
  head.appendChild(el("b", "", t("gr.title")));
  const x = el("button", "ccard-x", "✕") as HTMLButtonElement;
  x.type = "button";
  x.dataset.grClose = "1";
  x.title = t("cc.close");
  x.setAttribute("aria-label", t("cc.close"));
  x.addEventListener("click", () => deps.close());
  head.append(deps.help(t("gr.help"), "georef-card"), x);
  card.appendChild(head);
  card.appendChild(el("div", "insp-hint gr-rule", t("gr.rule")));
  if (!graphs.length) { card.appendChild(el("div", "insp-hint", t("gr.noGraph"))); return; }

  // the graphs of the file, each with its own system
  if (graphs.length > 1) {
    const box = el("section", "ccard-box gr-graphs");
    box.appendChild(el("div", "ccard-box-head", t("gr.graphsOfFile", { n: String(graphs.length) })));
    for (const g of graphs) {
      const d = (g.store.geoPositionNode()?.data ?? null) as Record<string, unknown> | null;
      const e = d ? epsgOf(d) : null;
      const row = el("button", "gr-graph" + (g.id === chosen ? " on" : "")) as HTMLButtonElement;
      row.type = "button";
      row.dataset.grGraph = g.id;
      row.dataset.grEpsg = e === null ? "" : String(e);
      row.append(el("span", "gr-graph-name", g.label), " · ",
        el("span", "gr-graph-crs", e === null ? t("gr.notGeoref") : `EPSG:${e} · ${fmtCoord(num(d?.shift_x))}, ${fmtCoord(num(d?.shift_y))}`));
      row.addEventListener("click", () => { chosen = g.id; redraw(); });
      box.appendChild(row);
    }
    card.appendChild(box);
  }
  const g = graphs.find((x0) => x0.id === chosen)!;
  const st = g.store;
  const geo = st.geoPositionNode();
  const gsec = el("section", "ccard-box gr-graph-sec");
  gsec.dataset.grGraphSec = g.id;
  gsec.appendChild(el("div", "ccard-box-head", t("gr.graphLevel", { name: g.label })));
  card.appendChild(gsec);
  if (!geo) {
    gsec.appendChild(el("div", "gr-state local", t("gr.notGeoref")));
    const b = el("button", "insp-btn primary", t("gr.create")) as HTMLButtonElement;
    b.type = "button";
    b.dataset.grCreate = "1";
    b.title = t("gr.createHint");
    b.addEventListener("click", () => {
      const n = st.setGeoreference({});
      const msg = t("gr.created", { name: g.label });
      deps.log(msg, [n.id]);
      deps.done(msg, st);
    });
    gsec.appendChild(b);
    renderModels(card, g, null, deps, redraw);
    return;
  }
  const { epsg, d, write } = renderGraphFields(gsec, g, geo, deps, redraw);
  if (graphs.length > 1) gsec.appendChild(applyAllButton(g, graphs, deps));

  // the models first (their datums decide whether the datum is said open)
  const models = deps.models(st);
  const otherDatum = { any: false };
  const modelsBox = renderModels(card, g, epsg, deps, redraw, otherDatum, models);
  // the datum: open when two models of the Earth meet, else under «Advanced»
  if (epsg !== null) card.insertBefore(renderDatum(st, g, epsg, d, datumOpen(d, otherDatum.any), deps, redraw, write), modelsBox);
}

/** The graph's fields — the system, shift X / Y, Z fixed at 0, the azimuth and
 *  its reference — drawn into `gsec`; ONE renderer, for the card and for the
 *  GeoPositionNode's Inspector */
function renderGraphFields(gsec: HTMLElement, g: GeorefGraph, geo: EmNode, deps: GeorefCardDeps, redraw: () => void):
    { epsg: number | null; d: Record<string, unknown>; write: (patch: Record<string, unknown>, what: string) => void } {
  const st = g.store;
  const d = (geo.data ?? {}) as Record<string, unknown>;
  const epsg = epsgOf(d);
  const sx = num(d.shift_x), sy = num(d.shift_y), sz = num(d.shift_z);
  const write = (patch: Record<string, unknown>, what: string) => {
    st.setGeoreference(patch);
    const msg = t("gr.graphChanged", { name: g.label, what });
    deps.log(msg, [geo.id]);
    deps.done(msg, st);
  };
  const grid = el("div", "georef-grid gr-grid");
  gsec.appendChild(grid);
  const crsCell = cell(grid, t("gr.crs"), crsField(epsg, (e) => write({ epsg: e }, e === null ? t("gr.whatNoCrs") : `EPSG:${e}`), deps, "epsg"), t("gr.crsHint"));
  const crsName = el("div", "georef-crs gr-crs-name");
  crsName.dataset.grCrsName = "1";
  crsCell.appendChild(crsName);
  if (epsg === null) crsName.textContent = t("gr.notGeorefEmpty");
  else {
    const info = crsInfoOf(epsg, sx, sy, { bridge: deps.bridge, redraw });
    crsName.textContent = !info ? t("georef.reading") : "error" in info && !("ok" in info) ? t("georef.unread", { why: info.error })
      : (info as CrsInfo).name ?? "";
  }
  cell(grid, t("georef.x"), numberInput(sx, "shift_x", (v) => write({ shift_x: v }, `X ${fmtCoord(sx)} → ${fmtCoord(v)}`)), t("georef.shiftHint"));
  cell(grid, t("georef.y"), numberInput(sy, "shift_y", (v) => write({ shift_y: v }, `Y ${fmtCoord(sy)} → ${fmtCoord(v)}`)), t("georef.shiftHint"));
  cell(grid, t("georef.z"), numberInput(sz, "shift_z", () => undefined, true), t("gr.zFixed"));
  cell(grid, t("georef.azimuth"), numberInput(num(d.rotation), "rotation", (v) => write({ rotation: v }, `${t("georef.azimuth")} ${fmtCoord(v)}°`)), t("georef.azimuthHint"));
  const ref = document.createElement("select");
  ref.dataset.grField = "rotation_reference";
  for (const v of ["grid", "true"]) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t(`gr.ref.${v}`);
    o.selected = (d.rotation_reference === "true" ? "true" : "grid") === v;
    ref.appendChild(o);
  }
  ref.addEventListener("change", () => write({ rotation_reference: ref.value }, t(`gr.ref.${ref.value}`)));
  cell(grid, t("gr.reference"), ref, t("gr.referenceHint"));
  if (sz !== 0) {
    const z = el("div", "georef-warn", t("georef.zChoice", { z: fmtCoord(sz) }));
    z.dataset.grZ = "nonzero";
    gsec.appendChild(z);
  }

  return { epsg, d, write };
}

// ── MICRO-Q p.0 · «Applica a tutti i grafi del file…» ───────────────────────
// E.D. (17 Nov 2026): a command that makes sense and DESTROYS — so it is never
// automatic: a summary graph by graph (the value now → the new one), the graphs
// in another system said «will be overwritten», a confirmation, ONE undo step
// for all of them, the Log and each node's history told. The rule stays: the
// values are COPIED into each graph's GeoPositionNode; nothing becomes a value
// of the file.

/** the fields copied from one graph's GeoPositionNode into the others (shift Z
 *  is not: Z 0 is the convention, the heights are in the models) */
export const GEO_COPY_FIELDS = ["epsg", "shift_x", "shift_y", "rotation", "rotation_reference", "datum_operation"] as const;

export interface ApplyAllRow {
  id: string;
  label: string;
  /** the georeference now, in words («EPSG:3844 · 327372, 4986270» / not georeferenced) */
  from: string;
  to: string;
  /** what the copy does to it */
  effect: "overwrite" | "update" | "georeference" | "same";
}

const geoWords = (d: Record<string, unknown> | null): string => {
  const e = d ? epsgOf(d) : null;
  if (!d || e === null) return d && (num(d.shift_x) || num(d.shift_y)) ? `${t("gr.notGeoref")} · ${fmtCoord(num(d.shift_x))}, ${fmtCoord(num(d.shift_y))}` : t("gr.notGeoref");
  const rot = num(d.rotation);
  return `EPSG:${e} · ${fmtCoord(num(d.shift_x))}, ${fmtCoord(num(d.shift_y))}${rot ? ` · ${fmtCoord(rot)}°` : ""}`
    + (typeof d.datum_operation === "string" ? ` · ${d.datum_operation}` : "");
};

/** the patch that makes a GeoPositionNode say what `src` says (a field `src`
 *  lacks is removed — `null` in `setGeoreference`) */
export function geoCopyPatch(src: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const k of GEO_COPY_FIELDS) p[k] = src[k] === undefined ? null : JSON.parse(JSON.stringify(src[k]));
  if (p.rotation_reference === null) p.rotation_reference = "grid";
  return p;
}

/** the summary of «apply to every graph», graph by graph, the source excluded */
export function applyAllPlan(src: GeorefGraph, graphs: GeorefGraph[]): ApplyAllRow[] {
  const sd = (src.store.geoPositionNode()?.data ?? {}) as Record<string, unknown>;
  const se = epsgOf(sd);
  const to = geoWords(sd);
  const canon = (d: Record<string, unknown>) => JSON.stringify(GEO_COPY_FIELDS.map((k) => k === "rotation_reference" ? (d[k] ?? "grid") : k === "epsg" ? epsgOf(d) : d[k] ?? null));
  return graphs.filter((g) => g.id !== src.id).map((g) => {
    const d = (g.store.geoPositionNode()?.data ?? null) as Record<string, unknown> | null;
    const e = d ? epsgOf(d) : null;
    const effect: ApplyAllRow["effect"] = d && canon(d) === canon(sd) ? "same"
      : e === null ? "georeference" : e !== se ? "overwrite" : "update";
    return { id: g.id, label: g.label, from: geoWords(d), to, effect };
  });
}

/** writes the source's georeference into every other graph of the file: ONE
 *  linked step (an undo in any graph takes back all). Returns the graphs written. */
export function applyGeorefToAll(src: GeorefGraph, graphs: GeorefGraph[]): GeorefGraph[] {
  const sd = (src.store.geoPositionNode()?.data ?? {}) as Record<string, unknown>;
  const patch = geoCopyPatch(sd);
  const plan = new Map(applyAllPlan(src, graphs).map((r) => [r.id, r]));
  const targets = graphs.filter((g) => plan.has(g.id) && plan.get(g.id)!.effect !== "same");
  const moved = DocumentStore.linked(targets.map((g) => g.store), () => {
    for (const g of targets) g.store.setGeoreference(patch);
  }, [src.store]);
  return targets.filter((g) => moved.includes(g.store));
}

function applyAllButton(src: GeorefGraph, graphs: GeorefGraph[], deps: GeorefCardDeps): HTMLElement {
  const b = el("button", "insp-btn gr-apply-all", t("gr.applyAll")) as HTMLButtonElement;
  b.type = "button";
  b.dataset.grApplyAll = src.id;
  b.title = t("gr.applyAllHint");
  b.addEventListener("click", () => { void confirmApplyAll(src, graphs, deps); });
  return b;
}

/** the summary, the question, and — only on «Applica» — the copy */
export async function confirmApplyAll(src: GeorefGraph, graphs: GeorefGraph[], deps: GeorefCardDeps): Promise<boolean> {
  const rows = applyAllPlan(src, graphs);
  const body = el("div", "gr-apply-plan");
  const table = document.createElement("table");
  table.className = "gr-apply-table";
  const hr = document.createElement("tr");
  for (const h of [t("gr.aaGraph"), t("gr.aaNow"), t("gr.aaNew"), ""]) hr.appendChild(el("th", "", h));
  table.appendChild(hr);
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.dataset.grAaRow = r.id;
    tr.dataset.grAaEffect = r.effect;
    if (r.effect === "overwrite") tr.className = "overwrite";
    tr.append(el("td", "", r.label), el("td", "", r.from), el("td", "", r.effect === "same" ? "—" : r.to),
      el("td", `gr-aa-effect ${r.effect}`, t(`gr.aa.${r.effect}`)));
    table.appendChild(tr);
  }
  body.appendChild(table);
  const n = rows.filter((r) => r.effect !== "same").length;
  const over = rows.filter((r) => r.effect === "overwrite").length;
  if (over) body.appendChild(el("div", "georef-warn", t("gr.aaOverwriteWarn", { n: String(over) })));
  body.appendChild(el("p", "insp-hint", t("gr.aaRule")));
  const a = await openDialog({
    title: t("gr.applyAllTitle", { name: src.label }),
    message: n ? t("gr.aaQuestion", { n: String(n) }) : t("gr.aaNothing"),
    body, kind: "georef-apply-all", ok: n ? t("gr.aaOk") : t("dlg.ok"), cancel: n ? undefined : null, danger: over > 0,
  });
  if (!a.ok || !n) return false;
  const written = applyGeorefToAll(src, graphs);
  if (!written.length) return false;
  const msg = t("gr.aaDone", { name: src.label, n: String(written.length), graphs: written.map((g) => g.label).join(", ") });
  deps.log(msg, written.map((g) => g.store.geoPositionNode()?.id).filter((x): x is string => !!x));
  deps.done(msg, src.store);
  return true;
}

/** MICRO-P-GEOREF-PER-GRAFO p.4 · the GeoPositionNode's Inspector: its data
 *  edited with the card's controls (the datum under «Advanced» unless the graph
 *  declares one) and «Open in the Georeferencing card» */
export function renderGeorefInspector(host: HTMLElement, g: GeorefGraph, deps: GeorefCardDeps, redraw: () => void,
                                      openCard: () => void): void {
  const geo = g.store.geoPositionNode();
  if (!geo) return;
  const sec = el("div", "gr-insp");
  sec.dataset.grInspector = geo.id;
  sec.appendChild(el("h3", "insp-sect", t("gr.title")));
  const link = el("button", "link gr-open-card", t("gr.openCard")) as HTMLButtonElement;
  link.type = "button";
  link.dataset.grOpenCard = "1";
  link.dataset.grOpen = "1";
  link.addEventListener("click", () => openCard());
  sec.appendChild(link);
  const box = el("div", "gr-insp-fields");
  sec.appendChild(box);
  host.appendChild(sec);
  const { epsg, d, write } = renderGraphFields(box, g, geo, deps, redraw);
  if (epsg !== null) sec.appendChild(renderDatum(g.store, g, epsg, d, datumOpen(d, false), deps, redraw, write));
}

/** the datum operation of the graph, as one recipe among PROJ's */
function renderDatum(st: DocumentStore, g: GeorefGraph, epsg: number, d: Record<string, unknown>, open: boolean,
                     deps: GeorefCardDeps, redraw: () => void, write: (p: Record<string, unknown>, what: string) => void): HTMLElement {
  const det = document.createElement("details");
  det.className = "ccard-box gr-datum";
  det.dataset.grDatum = open ? "open" : "advanced";
  det.open = open;
  const sum = document.createElement("summary");
  sum.textContent = open ? t("gr.datumTitle") : t("gr.advanced");
  det.appendChild(sum);
  det.appendChild(el("p", "insp-hint gr-datum-prose", t("gr.datumProse")));
  const declared = typeof d.datum_operation === "string" ? d.datum_operation : null;
  const info = datumInfo(epsg, null, [num(d.shift_x), num(d.shift_y)], redraw, deps.bridge);
  if (!info) { det.appendChild(el("div", "insp-hint", t("georef.reading"))); return det; }
  if ("error" in info && !("ok" in info)) { det.appendChild(el("div", "insp-hint warn", t("georef.unread", { why: info.error }))); return det; }
  const di = info as DatumInfo;
  if (di.wgs84) {
    det.appendChild(el("div", "insp-hint", t("gr.onWgs84", { datum: di.datum ?? "WGS 84" })));
    if (declared) det.appendChild(el("div", "georef-warn", t("gr.declaredUseless", { op: declared })));
    return det;
  }
  det.appendChild(el("div", "insp-hint", t("gr.datumOf", { datum: di.datum ?? "?" })));
  det.appendChild(datumSelect(di, declared, "graph", (op) => write({ datum_operation: op }, op ? t("gr.whatDatum", { op }) : t("gr.whatDatumBest"))));
  // a declared operation whose area does not hold the site: said, never changed
  const dop = declared ? di.ops?.find((o) => o.code === declared) : undefined;
  if (dop && dop.here === false) {
    const best = di.ops?.find((o) => o.code === di.best);
    const w = el("div", "georef-warn", t("gr.declaredElsewhere", { op: declared!, area: dop.area ?? "?",
      best: best ? `${best.code} (${accWords(best.accuracy)})` : t("gr.noBest") }));
    w.dataset.grDatumWarn = "area";
    det.appendChild(w);
  }
  void st; void g;
  return det;
}

const accWords = (a: number | null | undefined): string => (a == null ? t("georef.accUnknown") : t("georef.acc", { m: fmtCoord(a) }));

/** PROJ's operations of a datum to WGS 84: the declared one, else the best preselected (a proposal: written only by a choice) */
function datumSelect(di: DatumInfo, declared: string | null, probe: string, write: (op: string | null) => void): HTMLElement {
  const row = el("div", "gr-datum-row");
  const sel = document.createElement("select");
  sel.dataset.grDatumOp = probe;
  const none = document.createElement("option");
  none.value = "";
  none.textContent = t("gr.datumBest");
  sel.appendChild(none);
  const ops = [...(di.ops ?? [])];
  if (declared && !ops.some((o) => o.code === declared)) ops.unshift({ code: declared, name: t("gr.declaredUnknown"), accuracy: null, ballpark: false, area: null, here: null });
  for (const o of ops) {
    const opt = document.createElement("option");
    opt.value = o.code;
    opt.textContent = `${o.code} · ${o.name} · ${accWords(o.accuracy)}${o.area ? ` · ${o.area}` : ""}${o.code === di.best ? ` · ${t("gr.best")}` : ""}${o.here === false ? ` · ${t("gr.notHere")}` : ""}`;
    sel.appendChild(opt);
  }
  sel.value = declared ?? di.best ?? "";
  row.appendChild(sel);
  if (!declared && di.best) {
    const p = el("span", "insp-hint gr-proposed", t("gr.proposed", { op: di.best }));
    p.dataset.grProposed = di.best;
    const b = el("button", "insp-btn", t("gr.useProposed")) as HTMLButtonElement;
    b.type = "button";
    b.dataset.grDatumUse = probe;
    b.addEventListener("click", () => write(sel.value || null));
    row.append(p, b);
  }
  sel.addEventListener("change", () => {
    let v: string | null;
    try { v = normaliseDatumOperation(sel.value); } catch { return; }
    if (v !== declared) write(v);
  });
  return row;
}

/** the models of the graph, each «as the graph» or in a system of its own */
function renderModels(card: HTMLElement, g: GeorefGraph, graphEpsg: number | null, deps: GeorefCardDeps, redraw: () => void,
                      otherDatum: { any: boolean } = { any: false }, models = deps.models(g.store)): HTMLElement {
  const st = g.store;
  const geo = (st.geoPositionNode()?.data ?? null) as Record<string, unknown> | null;
  const box = el("section", "ccard-box gr-models");
  box.dataset.grModels = String(models.length);
  box.appendChild(el("div", "ccard-box-head", t("gr.models", { n: String(models.length) })));
  card.appendChild(box);
  if (!models.length) { box.appendChild(el("div", "insp-hint", t("gr.noModels"))); return box; }
  const list = el("div", "gr-model-list");
  box.appendChild(list);
  const nm = (id: string) => String(st.node(id)?.name ?? id);
  const writeFrame = (m: CardModel, f: FileFrame | null, msg: string) => {
    const has = !!readFrame((st.node(m.home)?.data ?? null) as Record<string, unknown> | null);
    if (f) st.setField(m.home, "data.frame", f);
    else if (has) st.clearField(m.home, "data.frame");
    else return;
    deps.log(msg, [m.home]);
    deps.done(msg, st);
  };
  for (const m of models) {
    const row = el("div", "gr-model");
    row.dataset.grModel = m.id;
    const f = m.frame?.frame ?? null;
    const s = modelGeoState(f, geo);
    row.dataset.grState = s.kind;
    const name = el("span", "gr-model-name", m.name);
    name.title = t(`gr.kind.${m.kind}`);
    const tag = el("span", "gr-model-kind", t(`gr.kind.${m.kind}`));
    const state = el("span", `gr-state ${s.kind}`, s.kind === "reprojected" ? t("gr.state.reprojected", { from: s.from ?? "?" })
      : s.kind === "graph-shift" ? t("gr.state.graphShift", { dx: fmtCoord(Math.round(((f?.shift[0] ?? 0) - num(geo?.shift_x)) * 1000) / 1000),
          dy: fmtCoord(Math.round(((f?.shift[1] ?? 0) - num(geo?.shift_y)) * 1000) / 1000) })
      : t(`gr.state.${s.kind}`));
    state.dataset.grStateLabel = s.kind;
    const mode = document.createElement("select");
    mode.dataset.grModelMode = m.id;
    for (const v of ["graph", "own"]) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t(`gr.mode.${v}`);
      o.selected = (f ? "own" : "graph") === v;
      mode.appendChild(o);
    }
    mode.addEventListener("change", () => {
      if (mode.value === "graph") writeFrame(m, null, t("gr.modelAsGraph", { name: m.name, graph: g.label }));
      // its own: it starts from the graph's (nothing moves until a value changes)
      else writeFrame(m, makeFrame(graphEpsg ?? null, [num(geo?.shift_x), num(geo?.shift_y), 0], "", "manual"),
        t("gr.modelOwn", { name: m.name }));
    });
    const top = el("div", "gr-model-top");
    top.append(name, tag, state, mode);
    row.appendChild(top);
    if (m.frame && m.frame.from !== m.id) row.appendChild(el("div", "insp-hint gr-from", t("frm.from", { name: nm(m.frame.from) })));
    if (f) {
      const grid = el("div", "georef-grid gr-grid gr-model-grid");
      const fe = epsgOf({ epsg: f.crs });
      const put = (patch: Omit<Partial<FileFrame>, "datum_operation"> & { datum_operation?: string | null }, what: string) => {
        const nf = makeFrame(patch.crs !== undefined ? patch.crs : f.crs, patch.shift ?? f.shift, f.note ?? "", "manual",
          patch.datum_operation !== undefined ? patch.datum_operation : f.datum_operation ?? null);
        writeFrame(m, nf, t("gr.modelChanged", { name: m.name, what }));
      };
      cell(grid, t("gr.crs"), crsField(fe, (e) => put({ crs: e === null ? null : `EPSG:${e}`, datum_operation: null }, e === null ? t("gr.whatNoCrs") : `EPSG:${e}`), deps, `m-epsg-${m.id}`), t("gr.modelCrsHint"));
      for (const [i, k] of (["x", "y", "z"] as const).entries())
        cell(grid, t(`frm.shift${k.toUpperCase()}`), numberInput(f.shift[i], `m-shift_${k}-${m.id}`, (v) => {
          const sh = [...f.shift] as [number, number, number];
          sh[i] = v;
          put({ shift: sh }, `${k.toUpperCase()} ${fmtCoord(v)}`);
        }));
      row.appendChild(grid);
      // two models of the Earth: the recipe, open
      if (fe !== null && graphEpsg !== null && fe !== graphEpsg) {
        const di = datumInfo(fe, graphEpsg, [f.shift[0], f.shift[1]], redraw, deps.bridge);
        if (di && !("error" in di && !("ok" in di))) {
          const info = di as DatumInfo;
          if (info.other && !info.other.same_datum && !info.other.same_grid) {
            otherDatum.any = true;
            const dd = el("div", "gr-model-datum");
            dd.dataset.grModelDatum = m.id;
            dd.appendChild(el("p", "insp-hint gr-datum-prose", t("gr.datumProse")));
            if (info.wgs84) dd.appendChild(el("div", "insp-hint", t("gr.modelOnWgs", { graph: info.other.datum ?? "?" })));
            else {
              dd.appendChild(el("div", "insp-hint", t("gr.datumBetween", { a: info.datum ?? "?", b: info.other.datum ?? "?" })));
              dd.appendChild(datumSelect(info, f.datum_operation ?? null, `m-${m.id}`, (op) => put({ datum_operation: op }, op ? t("gr.whatDatum", { op }) : t("gr.whatDatumBest"))));
            }
            row.appendChild(dd);
          }
        } else if (!di) row.appendChild(el("div", "insp-hint", t("georef.reading")));
      }
    }
    list.appendChild(row);
  }
  return box;
}

/** The models of a graph as the card lists them, from the Space's reading
 *  (`buildSpace`): an RM, an RMDoc, a tileset (an RM drawn as tiles, a
 *  container's own tileset); the GIS sheets have their panel */
export function cardModelsOf(rms: Array<{ id: string; name: string; altOf?: string | null; resource: { tiles?: unknown } | null;
                                         frame?: { frame: FileFrame; from: string } | null; frameHome?: string | null }>,
                             nodeOf: (id: string) => EmNode | undefined): CardModel[] {
  return rms.map((r) => {
    const tiles = !!r.resource?.tiles || !!r.altOf;
    const nt = String(nodeOf(r.id)?.node_type ?? "");
    const kind: CardModel["kind"] = tiles ? "tileset" : nt === "representation_model_doc" ? "rmdoc" : "rm";
    return { id: r.id, name: r.name, kind, frame: r.frame ?? null, home: r.frame?.from ?? (tiles ? r.frameHome ?? r.id : r.id) };
  });
}
