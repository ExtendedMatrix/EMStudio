/**
 * MICRO-MF03 (E.D., 22 Nov 2026) · THE LANDSCAPE MATRIX — a type of area — and
 * the SEMANTIC ZOOM of the Functional Matrix, from the room to the city.
 *
 * EMBARGO (MICRO-SEG30): the function `landscape-matrix` of the register
 * (features.ts) is under embargo. This module is reached ONLY through
 * `featureOn("landscape-matrix")` / `LAB` (rule 4 of the register); its texts
 * live in the `LAB_TEXTS` blocks of i18n.ts.
 *
 * What it draws (E.D.'s «scrivania», cc-runs/scrivania): a COLUMN per site, the
 * LANES of the container's horizons (H0–H7 at Sarmizegetusa, «no horizon»
 * last), the highest identities (the handles) as compact braces coloured by
 * their degree of evidence, the UT as hexagons, the `changed_from` (dotted)
 * and `is_after` (thin) chains, the alternative readings marked; it scrolls
 * sideways. P6: «the Landscape Matrix is the Functional Matrix seen from far
 * away» — so the Functional Matrix has a slider of four steps (variant B of
 * the scrivania): inside the building → the building in time → the site with
 * its neighbours → the whole city, which IS this drawing. The same lanes at
 * every step.
 *
 * Point C: a cited graph is bound to a site FROM HERE (the bar «Graphs cited»):
 * the bond is written in the LANDSCAPE file's header (`composition[i].site`,
 * s3Dgraphy `functional_zoom.bind_site`), never in the cited graph's file.
 *
 * NOTHING IS COMPUTED HERE (invariant 2): `POST /landscape-matrix` (tools/
 * em_py_lab.py) answers s3Dgraphy's `functional_zoom.landscape_view` — the
 * lanes of each row, the members it takes from the bound graph, its degree,
 * the neighbours of a site. This module asks, keeps the answer, draws it.
 */
import { bracePath, esc, evidenceColour, fit, type Evidence } from "./functional-matrix";
import { nodeStyle } from "./palette";

/** the UT's glyph colours (em_visual_rules «UT», a draft: E.D. decides) */
function utStyle(): { stroke: string; fill: string } {
  const st = nodeStyle("UT");
  return { stroke: st.border, fill: st.fill };
}

// ── the answer of the bridge (s3dgraphy.functional_zoom) ────────────────────

type Span = [number | null, number | null];
export interface LmLane { id: string; name: string; start: number | null; end: number | null; codes: number[] }
export interface LmRow {
  id: string; kind: "identity" | "ut"; name: string; site: string | null;
  lanes: string[]; lane: string | null; lane_rule: "dated" | "dated_declared" | "declared_horizon" | null;
  uncertain: boolean; scale: string | null; evidence: Evidence | null; members: number;
  members_rule: "own" | "identity" | "alive" | null;
  members_from: Array<{ graph_id: string; rule: string | null; handle: string | null; handle_name: string | null; members: number }>;
  rooms: string[]; alternative: string | null; life: Span; declared_horizon: string | null;
}
export interface LmColumn { id: string; name: string | null; code: string; rows: string[] }
export interface LmBinding {
  graph_id: string; title: string | null; path: string | null; site: string | null; site_name: string | null;
  origin: string | null; loaded: boolean; by: "declared" | "hdto" | null; cited: boolean;
}
export interface LmAnswer {
  lanes: LmLane[]; columns: LmColumn[]; rows: LmRow[];
  chain: Array<{ former: string; latter: string; kind: string | null; label: string; edge_id: string }>;
  after: Array<{ later: string; earlier: string; edge_id: string }>;
  bindings: LmBinding[]; sites: Array<{ id: string; name: string; code: string }>;
  neighbours: Record<string, string[]>; focus: string | null;
}

type Lanes = Array<{ id: string; name: string; start: number | null; end: number | null }>;

/** What the page gives this module (main.ts binds it). */
export interface LmHost {
  bridge(): Promise<string>;
  /** the LANDSCAPE the page reads: an open graph whose file is a landscape
   *  (kind landscape, or a composition) — the active one's first */
  landscape(): null | { graphId: string; sig: string; json(): string; header(): Record<string, unknown>; base: string | null };
  /** the open graphs the landscape may cite (fresher than their files) */
  sources(): Array<{ graphId: string; sig: string; json(): string; name: string; path: string | null }>;
  /** the active graph */
  active(): null | { graphId: string; sig: string; json(): string; name: string; path: string | null; has(id: string): boolean };
  /** the container's horizons, newest first (null: none) */
  lanes(): Lanes | null;
  lang(): string;
  selected(): string | null;
  select(id: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
  /** write the bond graph ↔ site in the landscape's header (null: removed) */
  bind(graphId: string, siteId: string | null, entry: { path: string | null; title: string | null }): void;
  changed(): void;
}

let host: LmHost | null = null;
export function setLandscapeMatrixHost(h: LmHost): void { host = h; }

// ── the askers: the landscape, and one graph read alone (step 2) ────────────

type Status = "idle" | "loading" | "ok" | "off" | "missing" | "error" | "none";
interface Ask { status: Status; answer: LmAnswer | null; error?: string; stale: boolean;
                sig: string | null; seq: number; timer: ReturnType<typeof setTimeout> | null; tried: number }
const fresh = (): Ask => ({ status: "idle", answer: null, stale: false, sig: null, seq: 0, timer: null, tried: 0 });
const asks: Record<"landscape" | "identities", Ask> = { landscape: fresh(), identities: fresh() };
const DEBOUNCE_MS = 400;
const RETRY_MS = 5000;

export function lmState(kind: "landscape" | "identities" = "landscape"): Readonly<Ask> { return asks[kind]; }

function lang(): string { return host && host.lang().toLowerCase().startsWith("it") ? "it" : "en"; }

/** the composition ids of a header (the graphs it cites) */
export function composition(header: Record<string, unknown> | null | undefined): Array<Record<string, unknown>> {
  const raw = header?.composition;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return list.map((x) => (typeof x === "string" ? { id: x } : (x && typeof x === "object" ? { ...(x as Record<string, unknown>) } : null)))
    .filter((x): x is Record<string, unknown> => !!x && !!String(x.id ?? "").trim());
}

/** Point C · the header with the bond — the same rule as s3Dgraphy's
 *  `functional_zoom.bind_site`: the entry of the graph gets `site` (null:
 *  the key removed, the citation kept); a graph not cited yet is cited with
 *  its path and title. A NEW header: the one given is not touched. */
export function bindSite(header: Record<string, unknown> | null | undefined, graphId: string, siteId: string | null,
                         entry: { path?: string | null; title?: string | null } = {}): Record<string, unknown> {
  const entries = composition(header);
  let e = entries.find((x) => String(x.id).trim() === graphId);
  if (!e) {
    e = { id: graphId };
    if (entry.path) e.path = entry.path;
    if (entry.title) e.title = entry.title;
    entries.push(e);
  }
  if (siteId) e.site = siteId; else delete e.site;
  return { ...(header ?? {}), composition: entries };
}

function schedule(kind: "landscape" | "identities", sig: string, body: () => string): void {
  const a = asks[kind];
  const retry = (a.status === "off" || a.status === "error") && Date.now() - a.tried > RETRY_MS && a.timer == null;
  if (sig === a.sig && !retry) return;
  a.sig = sig;
  if (a.status === "ok") a.stale = true;
  if (a.timer != null) clearTimeout(a.timer);
  const wait = a.status === "idle" || a.status === "none" ? 0 : DEBOUNCE_MS;
  a.timer = setTimeout(() => { a.timer = null; void ask(kind, body()); }, wait);
}

async function ask(kind: "landscape" | "identities", body: string): Promise<void> {
  if (!host) return;
  const a = asks[kind];
  const mine = ++a.seq;
  a.tried = Date.now();
  if (a.status === "idle" || a.status === "off" || a.status === "none") a.status = "loading";
  let next: Partial<Ask>;
  try {
    const res = await fetch(`${await host.bridge()}/landscape-matrix`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    });
    if (res.status === 404) next = { status: "missing", answer: null };
    else if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try { const j = await res.json(); if (j?.error) msg = String(j.error); } catch { /* not JSON */ }
      next = { status: "error", answer: null, error: msg };
    } else next = { status: "ok", answer: (await res.json()) as LmAnswer, error: undefined };
  } catch {
    next = { status: "off", answer: null };
  }
  if (mine !== a.seq) return;
  Object.assign(a, next, { stale: false });
  host.changed();
}

/** Ask again when what the drawings depend on changed. Cheap otherwise. */
export function lmAsk(): void {
  if (!host) return;
  const h = host;
  const lanes = h.lanes();
  const L = lang();
  const land = h.landscape();
  if (!land) {
    const a = asks.landscape;
    if (a.status !== "none") { Object.assign(a, fresh(), { status: "none" }); }
  } else {
    const cited = new Set(composition(land.header()).map((e) => String(e.id).trim()));
    const srcs = h.sources().filter((s) => cited.has(s.graphId) && s.graphId !== land.graphId);
    const sig = [land.graphId, land.sig, JSON.stringify(land.header().composition ?? null), land.base ?? "",
                 JSON.stringify(lanes), L, ...srcs.map((s) => `${s.graphId}:${s.sig}`)].join("|");
    schedule("landscape", sig, () =>
      `{"landscape":${land.json()},"lanes":${JSON.stringify(lanes ?? [])},"lang":"${L}","base":${JSON.stringify(land.base)},` +
      `"sources":[${srcs.map((s) => `{"origin":${JSON.stringify(s.path ?? "open")},"doc":${s.json()}}`).join(",")}]}`);
  }
  const act = h.active();
  if (act && (!land || act.graphId !== land.graphId)) {
    const sig = [act.graphId, act.sig, JSON.stringify(lanes), L].join("|");
    schedule("identities", sig, () =>
      `{"mode":"identities","graph":${act.json()},"lanes":${JSON.stringify(lanes)},"lang":"${L}"}`);
  }
}

/** For a test or a reload: forget the answers. */
export function lmReset(): void {
  for (const k of ["landscape", "identities"] as const) {
    if (asks[k].timer != null) clearTimeout(asks[k].timer!);
    asks[k] = fresh();
  }
}

// ── what a step of the zoom shows ────────────────────────────────────────────

export type ZoomLevel = 1 | 2 | 3 | 4;

/** The site the active graph is bound to in the landscape (the building's),
 *  else — the landscape itself active — the site of the selection, else the
 *  first bound site. */
export function lmFocus(a: LmAnswer | null = asks.landscape.answer): string | null {
  if (!a || !host) return null;
  const act = host.active();
  const sel = host.selected();
  if (act) {
    const b = a.bindings.find((x) => x.graph_id === act.graphId && x.site);
    if (b?.site) return b.site;
  }
  if (sel) {
    if (a.sites.some((s) => s.id === sel)) return sel;
    const r = a.rows.find((x) => x.id === sel);
    if (r?.site) return r.site;
  }
  return a.bindings.find((x) => x.site)?.site ?? null;
}

/** The columns a step shows (null = all): 2 the building's site, 3 it and its
 *  neighbours (s3Dgraphy's), 4 the city. */
export function lmColumnsOf(level: ZoomLevel, a: LmAnswer | null = asks.landscape.answer): string[] | null {
  if (!a || level >= 4) return null;
  const f = lmFocus(a);
  if (!f) return null;
  return level === 3 ? (a.neighbours[f] ?? [f]) : [f];
}

// ── the drawing ──────────────────────────────────────────────────────────────

const NS = "http://www.w3.org/2000/svg";
const RAIL = 96;
const TOP = 30;          // the columns' names
const ROW_H = 36;        // an identity: the braces 30 + a gap
const ROW_H2 = 46;       // with the line of its rooms
const LANE_PAD = 8;
const NOLANE = "\u0000none";

export interface LmDrawOpts {
  columns?: string[] | null;   // only these columns
  colW?: number;               // a column's width
  counts?: boolean;            // «name · n» and the rooms (steps 2–4)
  sel?: string | null;
  t: LmHost["t"];
}

/** The SVG of a Landscape Matrix (exported for the checks). */
export function lmSvg(a: LmAnswer, o: LmDrawOpts): string {
  const t = o.t;
  const keep = o.columns ? new Set(o.columns) : null;
  const cols = a.columns.filter((c) => !keep || keep.has(c.id));
  const rows = new Map(a.rows.map((r) => [r.id, r]));
  const lanes: Array<{ id: string; name: string; start: number | null; end: number | null }> = [...a.lanes];
  const shown = cols.flatMap((c) => c.rows.map((id) => rows.get(id)!).filter(Boolean));
  if (shown.some((r) => !r.lane || !a.lanes.some((l) => l.id === r.lane)))
    lanes.push({ id: NOLANE, name: t("lm.noHorizon"), start: null, end: null });
  const laneOf = (r: LmRow) => (r.lane && a.lanes.some((l) => l.id === r.lane) ? r.lane : NOLANE);
  const colW = Math.max(110, o.colW ?? 150);
  const rowH = (r: LmRow) => (o.counts && r.kind === "identity" && r.rooms.length ? ROW_H2 : ROW_H);
  // lane heights: the tallest stack of any column in it
  const need = new Map<string, number>();
  for (const ln of lanes) {
    let max = 0;
    for (const c of cols) {
      const h = c.rows.map((id) => rows.get(id)!).filter((r) => r && laneOf(r) === ln.id)
        .reduce((s, r) => s + rowH(r), 0);
      max = Math.max(max, h);
    }
    need.set(ln.id, Math.max(34, max + 2 * LANE_PAD + 4));
  }
  const W = RAIL + cols.length * colW + 12;
  const laneY = new Map<string, { y0: number; y1: number }>();
  let y = TOP;
  for (const ln of lanes) { const h = need.get(ln.id)!; laneY.set(ln.id, { y0: y, y1: y + h }); y += h; }
  const H = y + 6;
  let s = "";
  lanes.forEach((ln, i) => {
    const { y0, y1 } = laneY.get(ln.id)!;
    s += `<g class="fm-lane" data-lm-lane="${esc(ln.id === NOLANE ? "" : ln.id)}">` +
      `<rect class="${i % 2 ? "fm-lanebg" : "fm-lanebg2"}" x="0" y="${y0}" width="${W}" height="${y1 - y0}"/>` +
      `<line class="fm-laneline" x1="0" x2="${W}" y1="${y0}" y2="${y0}"/>` +
      `<text class="fm-lanetxt" x="8" y="${y0 + 15}">${esc(fit(ln.name, RAIL - 12, 5.4))}<title>${esc(ln.name)}</title></text>` +
      (ln.start != null || ln.end != null ? `<text class="fm-lanedate" x="8" y="${y0 + 28}">${ln.start ?? "…"}–${ln.end ?? "…"}</text>` : "") +
      `</g>`;
  });
  // the columns: a dashed separator, the site's code and name on top
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  cols.forEach((c, ci) => {
    const x = RAIL + ci * colW;
    const name = c.id ? `${c.code ? c.code + " · " : ""}${c.name ?? ""}` : t("lm.noSite");
    s += `<g class="lm-col" data-lm-col="${esc(c.id)}" data-lm-code="${esc(c.code)}">` +
      `<line class="lm-colline" x1="${x}" x2="${x}" y1="${TOP - 4}" y2="${H - 4}"/>` +
      `<text class="lm-coltxt" x="${x + 6}" y="${TOP - 10}">${esc(fit(name, colW - 10, 5.2))}<title>${esc(name)}</title></text></g>`;
    const stack = new Map<string, number>();
    for (const id of c.rows) {
      const r = rows.get(id);
      if (!r) continue;
      const ln = laneOf(r);
      const ly = laneY.get(ln)!;
      const off = stack.get(ln) ?? 0;
      stack.set(ln, off + rowH(r));
      pos.set(id, { x: x + 6, y: ly.y0 + LANE_PAD + off, w: colW - 12, h: rowH(r) - 6 });
    }
  });
  // the life above the home lane: a dotted line up to the newest lane it meets
  let spans = "";
  for (const [id, p] of pos) {
    const r = rows.get(id)!;
    if (r.lanes.length < 2) continue;
    const top = laneY.get(r.lanes[0]);
    if (!top || top.y0 + 14 >= p.y) continue;
    spans += `<line class="lm-span" data-lm-span="${esc(id)}" x1="${p.x + p.w - 4}" x2="${p.x + p.w - 4}" y1="${p.y}" y2="${top.y0 + 10}"/>`;
  }
  let body = "";
  for (const [id, p] of pos) {
    const r = rows.get(id)!;
    const selected = o.sel === id || r.members_from.some((m) => m.handle && m.handle === o.sel);
    const attrs = `data-lm-row="${esc(id)}" data-lm-kind="${r.kind}" data-lm-lane="${esc(r.lane ?? "")}" ` +
      `data-lm-site="${esc(r.site ?? "")}" data-lm-members="${r.members}"` +
      `${r.evidence ? ` data-lm-evidence="${r.evidence}"` : ""}${r.members_rule ? ` data-lm-rule="${r.members_rule}"` : ""}` +
      `${r.uncertain ? ' data-lm-uncertain="1"' : ""}${r.alternative ? ' data-lm-alt="1"' : ""}${selected ? ' data-lm-selected="1"' : ""}`;
    const tip = [r.name, r.declared_horizon ? `${t("lm.horizon")}: ${r.declared_horizon}` : "",
                 r.evidence ? t(`fm.ev.${r.evidence}`) : "", r.members ? t("lm.members", { n: r.members }) : "",
                 r.alternative ?? ""].filter(Boolean).join(" · ");
    if (r.kind === "ut") {
      const h = 22, cy = p.y + 4, w = p.w;
      body += `<g class="lm-ut" ${attrs}><title>${esc(tip)}</title>` +
        (selected ? `<rect class="fm-hl" x="${p.x - 2}" y="${cy - 2}" width="${w + 4}" height="${h + 4}" rx="4"/>` : "") +
        `<polygon class="lm-hex" stroke="${esc(utStyle().stroke)}" fill="${esc(utStyle().fill)}" points="${p.x + 6},${cy} ${p.x + w - 6},${cy} ${p.x + w},${cy + h / 2} ${p.x + w - 6},${cy + h} ${p.x + 6},${cy + h} ${p.x},${cy + h / 2}"/>` +
        `<text class="lm-uttxt" x="${p.x + w / 2}" y="${cy + 15}" text-anchor="middle">${esc(fit(r.name, w - 14, 5.4))}</text></g>`;
      continue;
    }
    const col = evidenceColour(r.evidence ?? "symbol");
    const dash = (r.evidence ?? "symbol") === "symbol" ? ' stroke-dasharray="1.5 3"' : "";
    const h = 30, x = p.x, yy = p.y, w = p.w;
    let label = r.name;
    if (o.counts && r.members) label = `${r.name} · ${r.members}`;
    body += `<g class="lm-id fm-unit" ${attrs}><title>${esc(tip)}</title>` +
      (selected ? `<rect class="fm-hl" x="${x}" y="${yy}" width="${w}" height="${h}" rx="4"/>` : "") +
      `<rect class="fm-hit" x="${x}" y="${yy}" width="${w}" height="${h}" fill="transparent"/>` +
      `<path d="${bracePath(x + 1, yy, h, 1)}" fill="none" stroke="${col}" stroke-width="1.6"${dash}/>` +
      `<path d="${bracePath(x + w - 1, yy, h, -1)}" fill="none" stroke="${col}" stroke-width="1.6"${dash}/>` +
      `<line x1="${x + 12}" y1="${yy + 1.5}" x2="${x + w - 12}" y2="${yy + 1.5}" stroke="${col}" stroke-width="1.6"${dash}/>` +
      `<line x1="${x + 12}" y1="${yy + h - 1.5}" x2="${x + w - 12}" y2="${yy + h - 1.5}" stroke="${col}" stroke-width="1.6"${dash}/>` +
      `<text class="fm-label lm-label" x="${x + 12}" y="${yy + 13}">${esc(fit(label + (r.uncertain ? " ?" : ""), w - 22, 5.6))}</text>`;
    if (r.alternative) body += `<text class="lm-alt" x="${x + w - 11}" y="${yy + 25}" text-anchor="end">${esc(t("lm.alternative"))}</text>`;
    else if (r.scale) body += `<text class="fm-scale" x="${x + 12}" y="${yy + 25}">${esc(t(`fm.scale.${r.scale}`))}</text>`;
    if (o.counts && r.rooms.length)
      body += `<text class="lm-rooms" data-lm-rooms="${esc(id)}" x="${x + 12}" y="${yy + 39}">${esc(fit(r.rooms.map((n) => n.split(/[ (]/)[0]).join(" · "), w - 16, 5))}</text>`;
    body += "</g>";
  }
  // the chains: changed_from dotted, is_after thin
  let chains = "";
  for (const c of a.chain) {
    const p = pos.get(c.former), q = pos.get(c.latter);
    if (!p || !q) continue;
    chains += `<g class="lm-chain" data-lm-chain="${esc(c.edge_id)}" data-lm-kind="${esc(c.kind ?? "")}"><title>${esc(c.label)}</title>` +
      `<line class="fm-chainline" x1="${q.x + q.w / 2}" y1="${q.y + 30}" x2="${p.x + p.w / 2}" y2="${p.y}"/></g>`;
  }
  for (const c of a.after) {
    const p = pos.get(c.earlier), q = pos.get(c.later);
    if (!p || !q) continue;
    chains += `<line class="lm-after" data-lm-after="${esc(c.edge_id)}" x1="${q.x + q.w / 2}" y1="${q.y + 30}" x2="${p.x + p.w / 2}" y2="${p.y}"/>`;
  }
  return `<svg xmlns="${NS}" class="fm-svg lm-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("feat.landscapeMatrix.title"))}">` +
    s + spans + chains + body + "</svg>";
}

// ── the window ──────────────────────────────────────────────────────────────

/** the row picked here when it is not a node of the active graph (the card) */
let localSel: string | null = null;
export function lmLocalSelection(): string | null { return localSel; }

function note(key: string, vars?: Record<string, string | number>, state = ""): HTMLElement {
  const p = document.createElement("p");
  p.className = "fm-note";
  p.dataset.lmState = state;
  p.textContent = host ? host.t(key, vars) : key;
  return p;
}

function legend(t: LmHost["t"]): HTMLElement {
  const el = document.createElement("div");
  el.className = "fm-legend";
  const sw = (ev: Evidence) => `<span class="fm-sw" style="border-color:${evidenceColour(ev)}${ev === "symbol" ? ";border-style:dotted" : ""}"></span>`;
  el.innerHTML = (["stratigraphic", "documentary", "reconstructive", "symbol"] as Evidence[])
    .map((ev) => `<span class="fm-legend-item" data-lm-legend="${ev}">${sw(ev)}${esc(t(`fm.ev.${ev}`))}</span>`).join("") +
    `<span class="fm-legend-item"><span class="lm-sw-hex" style="border-color:${esc(utStyle().stroke)}"></span>${esc(t("lm.legend.ut"))}</span>` +
    `<span class="fm-legend-item">${esc(t("lm.legend.chain"))}</span>`;
  return el;
}

/** C · the bar of the graphs cited: each with its site, a select to bind it */
function bindingsBar(a: LmAnswer, t: LmHost["t"]): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "lm-bindings";
  const head = document.createElement("span");
  head.className = "lm-bindings-title";
  head.textContent = t("lm.bind.title");
  head.title = t("lm.bind.hint");
  bar.appendChild(head);
  const act = host?.active() ?? null;
  const rows = [...a.bindings];
  const land = host?.landscape() ?? null;
  // an open graph the landscape does not cite yet can be bound (and so cited)
  if (act && land && act.graphId !== land.graphId && !rows.some((b) => b.graph_id === act.graphId))
    rows.push({ graph_id: act.graphId, title: act.name, path: act.path, site: null, site_name: null,
                origin: null, loaded: true, by: null, cited: false });
  if (!rows.length) { bar.appendChild(document.createTextNode(t("lm.bind.none"))); return bar; }
  for (const b of rows) {
    const lab = document.createElement("label");
    lab.className = "lm-binding";
    lab.dataset.lmBinding = b.graph_id;
    lab.dataset.lmBy = b.by ?? "";
    const name = document.createElement("span");
    name.textContent = (b.title || b.graph_id) + (b.loaded ? "" : ` (${t("lm.bind.notLoaded")})`) + (b.cited ? "" : ` (${t("lm.bind.notCited")})`);
    name.title = b.path ?? b.origin ?? b.graph_id;
    const sel = document.createElement("select");
    sel.dataset.lmBind = b.graph_id;
    sel.setAttribute("aria-label", t("lm.bind.aria", { graph: b.title || b.graph_id }));
    const none = document.createElement("option");
    none.value = "";
    none.textContent = t("lm.bind.noSite");
    sel.appendChild(none);
    for (const s of a.sites) {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = `${s.code ? s.code + " · " : ""}${s.name}`;
      sel.appendChild(o);
    }
    sel.value = b.site ?? "";
    if (b.by === "hdto") { sel.disabled = true; sel.title = t("lm.bind.byHdto"); }
    sel.addEventListener("change", () => {
      host?.bind(b.graph_id, sel.value || null, { path: b.cited ? null : b.path, title: b.cited ? null : b.title });
    });
    lab.append(name, sel);
    bar.appendChild(lab);
  }
  return bar;
}

/** the card of a row: the scrivania's «scheda» */
function card(a: LmAnswer, id: string, t: LmHost["t"]): HTMLElement | null {
  const r = a.rows.find((x) => x.id === id);
  if (!r) return null;
  const box = document.createElement("div");
  box.className = "lm-card fm-insp";
  box.dataset.lmCard = id;
  const kv = (k: string, v: string, key: string) => {
    const row = document.createElement("div");
    row.className = "fm-kv";
    row.dataset.lmRowKey = key;
    const a1 = document.createElement("span"); a1.className = "fm-k"; a1.textContent = k;
    const b1 = document.createElement("span"); b1.className = "fm-v"; b1.textContent = v;
    row.append(a1, b1);
    box.appendChild(row);
  };
  const h = document.createElement("h3");
  h.className = "insp-sect";
  h.textContent = r.kind === "ut" ? t("lm.card.ut") : t("lm.card.identity");
  box.appendChild(h);
  const site = a.sites.find((s) => s.id === r.site);
  kv(t("lm.card.name"), r.name, "name");
  kv(t("lm.card.site"), site ? `${site.code} · ${site.name}` : "—", "site");
  const laneName = (id2: string) => a.lanes.find((l) => l.id === id2)?.name ?? id2;
  kv(t("lm.card.horizons"), (r.lanes.length ? r.lanes.map(laneName).reverse().join(", ") : t("lm.noHorizon")) +
     (r.lane_rule ? ` — ${t(`lm.rule.${r.lane_rule}`)}` : "") + (r.uncertain ? " (?)" : ""), "horizons");
  if (r.kind === "identity") {
    kv(t("lm.card.scale"), r.scale ? t(`fm.scale.${r.scale}`) : "—", "scale");
    kv(t("lm.card.evidence"), t(`fm.ev.${r.evidence ?? "symbol"}`), "evidence");
    const from = r.members_from.map((m) => {
      const b = a.bindings.find((x) => x.graph_id === m.graph_id);
      const g = b?.title || m.graph_id;
      return m.rule === "identity" ? t("lm.card.fromIdentity", { graph: g, unit: m.handle_name ?? "", n: m.members })
        : t("lm.card.fromAlive", { graph: g, n: m.members });
    });
    kv(t("lm.card.members"), r.members ? [String(r.members), ...from].join(" — ") : t("lm.card.noMembers"), "members");
    if (r.rooms.length) kv(t("lm.card.rooms"), r.rooms.join(" · "), "rooms");
    if (r.alternative) kv(t("lm.card.note"), r.alternative, "alternative");
  }
  return box;
}

function wire(wrap: HTMLElement, a: LmAnswer): void {
  wrap.addEventListener("click", (ev) => {
    if (!host) return;
    const g = (ev.target as Element).closest<SVGElement>("[data-lm-row]");
    if (!g) return;
    const id = g.getAttribute("data-lm-row")!;
    const r = a.rows.find((x) => x.id === id);
    const act = host.active();
    // the identity IS a unit of the active graph (the handle it took its
    // members from): select that one — the Inspector, the Matrix follow
    const mine = r?.members_from.find((m) => m.handle && act && m.graph_id === act.graphId && act.has(m.handle));
    if (mine?.handle) { localSel = id; host.select(mine.handle); return; }
    if (act?.has(id)) { localSel = null; host.select(id); return; }
    localSel = localSel === id ? null : id;
    host.changed();
  });
}

/** Draw the drawing of a step (or of the area) into `body`. */
function drawInto(body: HTMLElement, a: LmAnswer, opts: Omit<LmDrawOpts, "t" | "sel">, withBar: boolean): void {
  if (!host) return;
  const t = host.t;
  const head = document.createElement("div");
  head.className = "fm-head";
  const keep = opts.columns ? new Set(opts.columns) : null;
  const cols = a.columns.filter((c) => !keep || keep.has(c.id));
  const ids = cols.flatMap((c) => c.rows);
  const rows = a.rows.filter((r) => ids.includes(r.id));
  const count = document.createElement("span");
  count.className = "fm-count-line";
  count.dataset.lmIdentities = String(rows.filter((r) => r.kind === "identity").length);
  count.dataset.lmColumns = String(cols.filter((c) => c.id).length);
  count.textContent = t("lm.count", { n: rows.filter((r) => r.kind === "identity").length,
                                      s: cols.filter((c) => c.id).length, u: rows.filter((r) => r.kind === "ut").length });
  head.append(count, legend(t));
  if (asks.landscape.stale) head.classList.add("fm-stale");
  body.appendChild(head);
  if (withBar) body.appendChild(bindingsBar(a, t));
  if (!a.lanes.length) body.appendChild(note("lm.noLanes", undefined, "nolanes"));
  const wrap = document.createElement("div");
  wrap.className = "fm-scroll lm-scroll";
  const sel = localSel ?? host.selected();
  wrap.innerHTML = lmSvg(a, { ...opts, sel, t });
  body.appendChild(wrap);
  wire(wrap, a);
  const c = sel ? card(a, sel, t) : null;
  if (c) body.appendChild(c);
}

function statusNote(st: Ask): HTMLElement | null {
  if (st.status === "missing") return note("lm.missing", undefined, "missing");
  if (st.status === "off") return note("fm.off", undefined, "off");
  if (st.status === "error") return note("fm.error", { why: st.error ?? "" }, "error");
  if (!st.answer) return note("fm.loading", undefined, "loading");
  return null;
}

/** The area «Landscape Matrix»: the whole city, the bar of the bonds. */
export function renderLandscapeMatrixInto(body: HTMLElement, _winId: string): void {
  if (!host) return;
  lmAsk();
  body.textContent = "";
  body.classList.add("fm-body", "lm-body");
  if (!host.landscape()) { body.appendChild(note("lm.noLandscape", undefined, "none")); return; }
  const st = asks.landscape;
  const n = statusNote(st);
  if (n) { body.appendChild(n); return; }
  drawInto(body, st.answer!, { columns: null, colW: 150, counts: true }, true);
}

// ── the zoom of the Functional Matrix ───────────────────────────────────────

const zoomOf = new Map<string, ZoomLevel>();
export function lmZoom(winId: string): ZoomLevel { return zoomOf.get(winId) ?? 1; }
export function setLmZoom(winId: string, level: number): void {
  zoomOf.set(winId, Math.max(1, Math.min(4, Math.round(level))) as ZoomLevel);
}

/** The slider of the four steps, for the head of a Functional Matrix. */
export function zoomControl(winId: string, onChange: () => void): HTMLElement {
  const t = host!.t;
  const lab = document.createElement("label");
  lab.className = "lm-zoom";
  const level = lmZoom(winId);
  const input = document.createElement("input");
  input.type = "range"; input.min = "1"; input.max = "4"; input.step = "1";
  input.value = String(level);
  input.dataset.fmZoom = winId;
  input.setAttribute("aria-label", t("lm.zoom.aria"));
  const out = document.createElement("span");
  out.className = "lm-zoom-label";
  out.dataset.fmZoomLabel = String(level);
  out.textContent = t(`lm.zoom.${level}`);
  input.setAttribute("aria-valuetext", out.textContent);
  input.addEventListener("input", () => { setLmZoom(winId, Number(input.value)); onChange(); });
  lab.append(document.createTextNode(t("lm.zoom")), input, out);
  lab.title = t("lm.zoom.hint");
  return lab;
}

/** Steps 2–4 into the body of a Functional Matrix. */
export function renderZoomInto(body: HTMLElement, winId: string): void {
  if (!host) return;
  lmAsk();
  const level = lmZoom(winId);
  const land = host.landscape();
  const width = Math.max(420, (body.clientWidth || 640) - 8);
  if (land && asks.landscape.answer) {
    const a = asks.landscape.answer;
    const cols = lmColumnsOf(level, a);
    if (level < 4 && !cols) {
      if (level === 2) return identitiesInto(body, width);
      body.appendChild(note("lm.zoom.noSite", undefined, "nosite"));
      return;
    }
    const n = cols?.length ?? a.columns.length;
    const colW = level === 2 ? Math.max(220, width - 120) : level === 3 ? Math.max(130, Math.floor((width - 110) / Math.max(1, n))) : 150;
    const hint = note(`lm.zoom.hint${level}`, undefined, `zoom${level}`);
    hint.classList.add("lm-zoom-hint");
    body.appendChild(hint);
    drawInto(body, a, { columns: cols, colW, counts: true }, level === 4);
    return;
  }
  if (land) {
    const n = statusNote(asks.landscape);
    if (n) { body.appendChild(n); return; }
  }
  if (level === 2) return identitiesInto(body, width);
  body.appendChild(note("lm.zoom.noLandscape", undefined, "nolandscape"));
}

function identitiesInto(body: HTMLElement, width: number): void {
  const st = asks.identities;
  const n = statusNote(st);
  if (n) { body.appendChild(n); return; }
  const a = st.answer!;
  if (!a.rows.length) { body.appendChild(note("lm.zoom.noIdentities", undefined, "empty")); return; }
  const hint = note("lm.zoom.hint2alone", undefined, "zoom2");
  hint.classList.add("lm-zoom-hint");
  body.appendChild(hint);
  drawInto(body, a, { columns: null, colW: Math.max(220, width - 120), counts: true }, false);
}

/** A path relative to a folder (the composition writes the cited file's path
 *  relative to the landscape file, as LG2 did); the path itself when the two
 *  do not share a root. Pure: no file is read. */
export function relPath(fromDir: string, to: string): string {
  const sep = /\\/.test(fromDir) || /\\/.test(to) ? "\\" : "/";
  const a = fromDir.split(/[\\/]/).filter(Boolean);
  const b = to.split(/[\\/]/).filter(Boolean);
  if (!a.length || !b.length || a[0] !== b[0]) return to;
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join(sep);
}
