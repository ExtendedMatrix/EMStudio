/**
 * MICRO-MF01 (E.D., 22 Nov 2026) · THE FUNCTIONAL MATRIX — a type of area.
 *
 * EMBARGO (MICRO-SEG30): the function `functional-matrix` of the register
 * (features.ts) is under embargo. This module is reached ONLY through
 * `featureOn("functional-matrix")` / `LAB` (rule 4 of the register): in the
 * community build nothing imports what it draws, and its texts live in the
 * `LAB_TEXTS` blocks of i18n.ts.
 *
 * What it draws (the «scrivania», cc-runs/scrivania, approved by E.D.): the
 * LANES shared with the Matrix (the graph's epochs, or the container's
 * horizons when a Matrix reads by horizons); each functional unit
 * (FunctionalUnitNodeGroup, LG2) as a pair of BRACES with thin lines above
 * and below (U6-bis, E.D.'s glyph), opening in the lane where its declared
 * life begins, nested by `is_in_functional_unit`; the colour of the braces is
 * the DEGREE OF EVIDENCE s3Dgraphy reads from its members (red stratigraphic,
 * orange documentary, blue reconstructive, grey symbol — U5); inside, the
 * members as INSTANCES (the master's glyph, dashed; «↑epoch» when the member
 * comes from an earlier lane) — a US shared by two units is an instance in
 * both; a unit with many members is drawn CLOSED with its number («{ 37 }», a
 * click opens it); the `changed_from` chain between functional units dotted,
 * with its kind (ruin, reconstruction, reuse…).
 *
 * NOTHING IS COMPUTED HERE (CLAUDE.md, invariant 2): the bridge answers
 * `POST /functional-matrix` with s3Dgraphy's `functional_matrix` (the route
 * lives in tools/em_py_lab.py: the community sidecar has none). This module
 * asks when the document changes (a signature, a debounce), keeps the last
 * answer in memory, and draws it. The document receives nothing.
 */
import { nodeStyle } from "./palette";
import { polygonOf } from "./shape-geom";

// ── the answer of the bridge (s3dgraphy.functional_matrix) ──────────────────

export type Evidence = "stratigraphic" | "documentary" | "reconstructive" | "symbol";
type Span = [number | null, number | null];

export interface FmLane { id: string; name: string; start: number | null; end: number | null }
export interface FmMember {
  id: string; name: string; type: string | null; lane: string | null;
  from_lane: string | null; from_name: string | null; life: Span; alive: boolean;
  evidence: Evidence | null;
}
export interface FmUnit {
  id: string; name: string; scale: string | null; life: Span; lane: string | null; lanes: string[];
  parents: string[]; children: string[]; members: FmMember[]; count: number; count_all: number;
  evidence: Evidence; evidence_own: Evidence; collapsed: boolean;
}
export interface FmChain { edge_id: string; latter: string; former: string; change_type: string | null;
                           transformation_kind: string | null; label: string }
export interface FmSource { extractor: string; name: string; type: string | null; authors: string[];
                            sources: Array<{ id: string; name: string; type: string | null }> }
export interface FmProperty { id: string; name: string; value: unknown; sources: FmSource[] }
export interface FmHow {
  id: string; name: string; function: FmProperty | null; scale: string | null; life: Span;
  life_from: { start: "property" | "epochs"; end: "property" | "epochs" };
  epochs: { has_first_epoch: Array<{ id: string; name: string }>; survive_in_epoch: Array<{ id: string; name: string }> };
  uses: Array<{ property_id: string; value: unknown; valid_from: number | null; valid_to: number | null }>;
  properties: FmProperty[]; members: Array<{ id: string; name: string; type: string | null }>;
  members_all: number; children: string[]; parents: string[]; evidence: Evidence; sites: string[];
}
export interface FmCoherence {
  members_not_alive: Array<{ unit: string; member: string; unit_life: Span; member_life: Span }>;
  children_outside: Array<{ child: string; parent: string; child_life: Span; parent_life: Span }>;
  undated: Array<{ unit: string; member: string }>;
  coverage: Record<string, { name: string; interval: Span; alive: number; read: number; unread: string[] }>;
}
export interface FmAnswer {
  lanes: FmLane[]; units: FmUnit[]; roots: string[]; readers: Record<string, string[]>;
  chain: FmChain[]; coherence: FmCoherence; how: Record<string, FmHow>;
}

export type FmStatus = "idle" | "loading" | "ok" | "off" | "missing" | "error";
export interface FmState { status: FmStatus; answer: FmAnswer | null; error?: string; stale: boolean }

/** What the page gives this module (main.ts binds it: ONE place decides where
 *  the bridge is, what the document is, what is selected). */
export interface FmHost {
  bridge(): Promise<string>;
  /** the active graph: an object that identifies it, its em.json, and the
   *  nodes and edges the signature reads */
  doc(): { owner: object; json: () => string;
           nodes: ReadonlyArray<{ id: string; node_type?: string; name?: string | null; data?: unknown; description?: string | null }>;
           edges: ReadonlyArray<{ edge_type?: string; source: string; target: string }> } | null;
  /** the lanes of the Matrix when it reads by horizons; null → the epochs */
  lanes(): Array<{ id: string; name: string; start: number | null; end: number | null }> | null;
  lang(): string;
  selected(): string | null;
  select(id: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
  /** an answer landed: repaint the windows, the issues, the Inspector */
  changed(): void;
}

let host: FmHost | null = null;
export function setFunctionalMatrixHost(h: FmHost): void { host = h; }

// ── the asker ────────────────────────────────────────────────────────────────

let state: FmState = { status: "idle", answer: null, stale: false };
let lastSig: string | null = null;
let lastOwner: object | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
let lastAttempt = 0;
const DEBOUNCE_MS = 400;
const RETRY_MS = 5000;

export function fmState(): FmState { return state; }

/** What the drawing depends on: every node's id, type and name, every
 *  property's value, every epoch's bounds, every edge; the lanes; the
 *  language. A description typed in the Inspector does not re-ask. */
export function fmSignature(doc: NonNullable<ReturnType<FmHost["doc"]>>,
                            lanes: unknown, lang: string): string {
  const parts: string[] = [lang, JSON.stringify(lanes ?? null)];
  for (const n of doc.nodes) {
    const d = (n.data ?? {}) as Record<string, unknown>;
    let extra = "";
    if (n.node_type === "property" || n.node_type === "PropertyNode")
      extra = String(d.value ?? n.description ?? "");
    else if (n.node_type === "EpochNode")
      extra = `${String(d.start_time ?? "")}/${String(d.end_time ?? "")}`;
    else if (n.node_type === "FunctionalUnitNodeGroup")
      extra = String(d.scale ?? "");
    parts.push(`${n.id}|${n.node_type ?? ""}|${n.name ?? ""}|${extra}`);
  }
  for (const e of doc.edges) parts.push(`${e.edge_type ?? ""}|${e.source}|${e.target}`);
  return parts.join("\n");
}

/** Ask again when what the drawing depends on changed (or the bridge was
 *  unreachable a while ago). Cheap when nothing changed. */
export function fmAsk(): void {
  if (!host) return;
  const doc = host.doc();
  if (!doc) {
    if (state.status !== "idle") { state = { status: "idle", answer: null, stale: false }; lastSig = null; host.changed(); }
    return;
  }
  const lanes = host.lanes();
  const lang = host.lang().toLowerCase().startsWith("it") ? "it" : "en";
  const sig = fmSignature(doc, lanes, lang);
  const changed = sig !== lastSig || doc.owner !== lastOwner;
  const retry = (state.status === "off" || state.status === "error") && Date.now() - lastAttempt > RETRY_MS && timer == null;
  if (!changed && !retry) return;
  if (doc.owner !== lastOwner) state = { status: "idle", answer: null, stale: false };
  lastSig = sig;
  lastOwner = doc.owner;
  if (state.status === "ok") state = { ...state, stale: true };
  if (timer != null) clearTimeout(timer);
  const wait = state.status === "idle" ? 0 : DEBOUNCE_MS;
  const body = () => `{"doc":${doc.json()},"lanes":${JSON.stringify(lanes)},"lang":"${lang}"}`;
  timer = setTimeout(() => { timer = null; void ask(body()); }, wait);
}

async function ask(body: string): Promise<void> {
  if (!host) return;
  const mine = ++seq;
  lastAttempt = Date.now();
  if (state.status === "idle" || state.status === "off") state = { ...state, status: "loading" };
  let next: FmState;
  try {
    const res = await fetch(`${await host.bridge()}/functional-matrix`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    });
    if (res.status === 404) {
      next = { status: "missing", answer: null, stale: false };
    } else if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try { const j = await res.json(); if (j?.error) msg = String(j.error); } catch { /* not JSON */ }
      next = { status: "error", answer: null, error: msg, stale: false };
    } else {
      next = { status: "ok", answer: (await res.json()) as FmAnswer, stale: false };
    }
  } catch {
    next = { status: "off", answer: null, stale: false };
  }
  if (mine !== seq) return;
  state = next;
  host.changed();
}

/** For a test or a reload: forget the answer. */
export function fmReset(): void {
  if (timer != null) clearTimeout(timer);
  timer = null; lastSig = null; lastOwner = null; seq++;
  state = { status: "idle", answer: null, stale: false };
}

// ── what a selection lights ──────────────────────────────────────────────────

function unitsById(a: FmAnswer): Map<string, FmUnit> {
  return new Map(a.units.map((u) => [u.id, u]));
}

function descendants(by: Map<string, FmUnit>, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const todo = [id];
  while (todo.length) {
    const cur = todo.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    for (const c of by.get(cur)?.children ?? []) todo.push(c);
  }
  return out;
}

function ancestors(by: Map<string, FmUnit>, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  const todo = [...(by.get(id)?.parents ?? [])];
  while (todo.length) {
    const cur = todo.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    for (const p of by.get(cur)?.parents ?? []) todo.push(p);
  }
  return out;
}

export interface FmLit { units: Set<string>; fus: Set<string> }

/** What a selection lights (B): a click on a unit lights the functional units
 *  that read it (and the ones they are in); a click on a functional unit
 *  lights it, the units nested in it, the ones it is in, its chain, and ALL
 *  its members (from earlier lanes too). Null: nothing to light. */
export function fmLitOf(sel: string | null, a: FmAnswer | null = state.answer): FmLit | null {
  if (!sel || !a) return null;
  const by = unitsById(a);
  if (by.has(sel)) {
    const fus = new Set<string>([...descendants(by, sel), ...ancestors(by, sel)]);
    for (const c of a.chain) {
      if (c.latter === sel) fus.add(c.former);
      if (c.former === sel) fus.add(c.latter);
    }
    const units = new Set<string>();
    for (const d of descendants(by, sel)) for (const m of by.get(d)?.members ?? []) units.add(m.id);
    return { units, fus };
  }
  const readers = a.readers[sel];
  if (readers?.length) {
    const fus = new Set<string>();
    for (const r of readers) { fus.add(r); for (const x of ancestors(by, r)) fus.add(x); }
    return { units: new Set([sel]), fus };
  }
  return null;
}

/** The members the Matrix rings when a functional unit is selected (B). */
export function fmMatrixLit(sel: string | null): Set<string> | null {
  const a = state.answer;
  if (!sel || !a || !a.units.some((u) => u.id === sel)) return null;
  return fmLitOf(sel, a)?.units ?? null;
}

// ── C · coherence as issues of the one model (issues.ts) ────────────────────

export interface FmIssue { id: string; node: string; sev: "warn" | "info"; rule: "functional"; txt: string }

function year(v: number | null): string {
  if (v == null) return "…";
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}
export function fmSpan(s: Span | null | undefined): string {
  if (!s) return "—";
  return `${year(s[0])}–${year(s[1])}`;
}

/** The checks of `functional_units.coherence` (U3) as rows of `issues()`:
 *  a member not alive in its unit, a child outside its parent (warnings, on
 *  the member / the child); the units of an epoch no functional unit reads
 *  («not read», a MEASURE: a hint on the epoch). */
export function fmIssues(name: (id: string) => string): FmIssue[] {
  const a = state.answer;
  if (!a || !host) return [];
  const t = host.t;
  const out: FmIssue[] = [];
  a.coherence.members_not_alive.forEach((x, i) => out.push({
    id: `functional:member:${x.member}:${x.unit}:${i}`, node: x.member, sev: "warn", rule: "functional",
    txt: t("fm.issue.notAlive", { member: name(x.member), unit: name(x.unit), m: fmSpan(x.member_life), u: fmSpan(x.unit_life) }),
  }));
  a.coherence.children_outside.forEach((x, i) => out.push({
    id: `functional:child:${x.child}:${x.parent}:${i}`, node: x.child, sev: "warn", rule: "functional",
    txt: t("fm.issue.childOutside", { child: name(x.child), parent: name(x.parent), c: fmSpan(x.child_life), p: fmSpan(x.parent_life) }),
  }));
  const hasUnits = a.units.length > 0;
  if (hasUnits) {
    for (const [ep, c] of Object.entries(a.coherence.coverage)) {
      if (!c.unread.length) continue;
      const some = c.unread.slice(0, 8).map(name).join(", ") + (c.unread.length > 8 ? "…" : "");
      out.push({ id: `functional:unread:${ep}`, node: ep, sev: "info", rule: "functional",
                 txt: t("fm.issue.unread", { epoch: c.name, n: c.unread.length, alive: c.alive, list: some }) });
    }
  }
  return out;
}

// ── the drawing ──────────────────────────────────────────────────────────────

const NS = "http://www.w3.org/2000/svg";
const RAIL = 96;          // the lanes' names, on the left
const IW = 60, IH = 18;   // an instance
const GAP = 4;
const HEAD = 22;          // the braces' label row
const PAD = 12;           // inside the braces, left and right
const LANE_MIN = 40;
const SYMBOL_GREY = "#8c8c8c";

/** the colour of the braces: the EM colours of the degree (U5) */
export function evidenceColour(ev: Evidence | null | undefined): string {
  switch (ev) {
    case "stratigraphic": return nodeStyle("US").border;
    case "documentary": return nodeStyle("USD").border;
    case "reconstructive": return nodeStyle("USVs").border;
    default: return SYMBOL_GREY;
  }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** a brace, `k` = +1 the left one, −1 the right one (the scrivania's) */
function bracePath(x: number, y: number, h: number, k: number): string {
  const m = y + h / 2, b = x + 5 * k, c = x + 8 * k;
  return `M${c},${y} C${b},${y} ${b},${y + 3} ${b},${y + 8} L${b},${m - 5} C${b},${m - 2} ${x + 2 * k},${m} ${x},${m} ` +
    `C${x + 2 * k},${m} ${b},${m + 2} ${b},${m + 5} L${b},${y + h - 8} C${b},${y + h - 3} ${b},${y + h} ${c},${y + h}`;
}

/** the master's glyph (em_visual_rules via `nodeStyle`), as an SVG shape,
 *  dashed: an instance */
function glyphSvg(type: string | null, x: number, y: number, w: number, h: number, dashed: boolean): string {
  const st = nodeStyle(type ?? undefined);
  const stroke = st.border;
  const fill = st.fill;
  const dash = dashed ? ' stroke-dasharray="3.5 2"' : "";
  const common = `fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="1.4"${dash}`;
  const poly = polygonOf(st.shape, { x, y, w, h });
  if (poly) return `<polygon points="${poly.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ")}" ${common}/>`;
  if (st.shape === "ellipse" || st.shape === "circle")
    return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${common}/>`;
  if (st.shape === "corner_brackets") {
    const t = Math.min(6, h / 3);
    return `<path d="M${x},${y + t}V${y}H${x + t}M${x + w - t},${y}H${x + w}V${y + t}M${x + w},${y + h - t}V${y + h}H${x + w - t}M${x + t},${y + h}H${x}V${y + h - t}" fill="none" stroke="${esc(stroke)}" stroke-width="1.4"${dash}/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" ${common}/>`;
}

/** a text that fits `max` px (≈ 5.6 px a character at 9 px) */
function fit(s: string, max: number, px = 5.6): string {
  const n = Math.max(3, Math.floor(max / px));
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

interface Box { id: string; w: number; h: number; draw(x: number, y: number): string }

interface DrawCtx {
  a: FmAnswer; by: Map<string, FmUnit>; laneName: Map<string, string>;
  lit: FmLit | null; sel: string | null; open: Set<string>; closed: Set<string>;
  t: FmHost["t"]; rects: Map<string, { x: number; y: number; w: number; h: number }>;
}

function isClosed(c: DrawCtx, u: FmUnit): boolean {
  if (c.open.has(u.id)) return false;
  if (c.closed.has(u.id)) return true;
  return u.collapsed;
}

function unitBox(c: DrawCtx, id: string, w: number, path: Set<string>): Box {
  const u = c.by.get(id)!;
  const closed = isClosed(c, u);
  const cols = Math.max(1, Math.floor((w - 2 * PAD + GAP) / (IW + GAP)));
  const n = closed ? 0 : u.members.length;
  // a row of instances leaves room above for «↑epoch» when one of them says it
  const RH = IH + GAP + (u.members.some((m) => m.from_name) ? 8 : 0);
  const top = u.members.some((m) => m.from_name) ? 8 : 0;
  const mh = n ? top + Math.ceil(n / cols) * RH + 2 : 0;
  const kids = closed ? [] : u.children.filter((k) => c.by.has(k) && !path.has(k));
  const rows: Array<{ row: Box[]; h: number }> = [];
  let chH = 0;
  if (kids.length) {
    const per = w >= 380 ? 2 : 1;
    const cw = (w - 2 * (PAD - 2) - (per - 1) * 8) / per;
    const inner = new Set([...path, id]);
    for (let i = 0; i < kids.length; i += per) {
      const row = kids.slice(i, i + per).map((k) => unitBox(c, k, cw, inner));
      const rh = Math.max(...row.map((b) => b.h));
      rows.push({ row, h: rh });
      chH += rh + 8;
    }
  }
  const h = closed ? 30 : HEAD + mh + chH + 6;
  return {
    id, w, h,
    draw(x: number, y: number): string {
      c.rects.set(id, { x, y, w, h });
      const col = evidenceColour(u.evidence);
      const dash = u.evidence === "symbol" ? ' stroke-dasharray="1.5 3"' : "";
      const dim = c.lit && !c.lit.fus.has(id) ? " fm-dim" : "";
      const selected = c.sel === id;
      const title = `${u.name}${u.scale ? ` · ${c.t(`fm.scale.${u.scale}`)}` : ""} · ${fmSpan(u.life)} · ${c.t(`fm.ev.${u.evidence}`)}`;
      let s = `<g class="fm-unit${dim}" data-fm-unit="${esc(id)}" data-fm-evidence="${u.evidence}" data-fm-lit="${c.lit ? (c.lit.fus.has(id) ? 1 : 0) : ""}"` +
        `${closed ? ' data-fm-collapsed="1"' : ""}${selected ? ' data-fm-selected="1"' : ""}>`;
      s += `<title>${esc(title)}</title>`;
      if (selected) s += `<rect class="fm-hl" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`;
      s += `<rect class="fm-hit" x="${x}" y="${y}" width="${w}" height="${HEAD}" fill="transparent"/>`;
      const sw = 1.6;
      s += `<path d="${bracePath(x + 1, y, h, 1)}" fill="none" stroke="${col}" stroke-width="${sw}"${dash}/>`;
      s += `<path d="${bracePath(x + w - 1, y, h, -1)}" fill="none" stroke="${col}" stroke-width="${sw}"${dash}/>`;
      s += `<line x1="${x + 12}" y1="${y + 1.5}" x2="${x + w - 12}" y2="${y + 1.5}" stroke="${col}" stroke-width="${sw}"${dash}/>`;
      s += `<line x1="${x + 12}" y1="${y + h - 1.5}" x2="${x + w - 12}" y2="${y + h - 1.5}" stroke="${col}" stroke-width="${sw}"${dash}/>`;
      const scale = u.scale ? c.t(`fm.scale.${u.scale}`) : "";
      const labW = w - 2 * PAD - (scale ? scale.length * 5 + 10 : 0) - (closed ? 40 : 0);
      s += `<text class="fm-label" x="${x + PAD + 1}" y="${y + 14}">${esc(fit(u.name, labW))}</text>`;
      if (scale) s += `<text class="fm-scale" x="${x + w - PAD - 1}" y="${y + 14}" text-anchor="end">${esc(scale)}</text>`;
      if (closed) {
        s += `<text class="fm-count" data-fm-fold="${esc(id)}" x="${x + w / 2}" y="${y + 24}" text-anchor="middle">{ ${u.count_all} }</text>`;
      } else if (u.count > 0 || u.children.length) {
        // an open unit with many members: the way to close it again
        if (u.collapsed || c.open.has(id))
          s += `<text class="fm-fold" data-fm-fold="${esc(id)}" x="${x + w - PAD - 1}" y="${y + h - 5}" text-anchor="end">−</text>`;
      }
      if (!closed) {
        u.members.forEach((m, i) => {
          const mx = x + PAD + (i % cols) * (IW + GAP);
          const my = y + HEAD + top + Math.floor(i / cols) * RH;
          const mdim = c.lit && !c.lit.units.has(m.id) ? " fm-dim" : "";
          const msel = c.sel === m.id;
          const tip = `${m.name}${m.from_name ? ` · ↑${m.from_name}` : ""} · ${fmSpan(m.life)}${m.alive ? "" : ` · ${c.t("fm.notAlive")}`}`;
          s += `<g class="fm-inst${mdim}${m.alive ? "" : " fm-dead"}" data-fm-inst="${esc(id)}:${esc(m.id)}" data-fm-member="${esc(m.id)}"` +
            `${m.from_lane ? ` data-fm-from="${esc(m.from_lane)}"` : ""}${msel ? ' data-fm-selected="1"' : ""}>`;
          s += `<title>${esc(tip)}</title>`;
          if (msel) s += `<rect class="fm-hl" x="${mx - 2}" y="${my - 2}" width="${IW + 4}" height="${IH + 4}" rx="3"/>`;
          s += glyphSvg(m.type, mx, my, IW, IH, true);
          s += `<text class="fm-inst-name" x="${mx + IW / 2}" y="${my + IH / 2 + 3}" text-anchor="middle" style="fill:${esc(nodeStyle(m.type ?? undefined).textColor)}">${esc(fit(m.name, IW - 4, 5))}</text>`;
          if (m.from_name)
            s += `<text class="fm-from" x="${mx + IW}" y="${my - 1}" text-anchor="end">↑${esc(fit(m.from_name, IW, 4.2))}</text>`;
          s += "</g>";
        });
        let yy = y + HEAD + mh;
        for (const { row, h: rh } of rows) {
          let xx = x + PAD - 2;
          for (const b of row) { s += b.draw(xx, yy); xx += b.w + 8; }
          yy += rh + 8;
        }
      }
      return s + "</g>";
    },
  };
}

/** per window: the units opened / closed by hand (the session's, never saved) */
const folds = new Map<string, { open: Set<string>; closed: Set<string> }>();
function foldsOf(winId: string): { open: Set<string>; closed: Set<string> } {
  let f = folds.get(winId);
  if (!f) folds.set(winId, (f = { open: new Set(), closed: new Set() }));
  return f;
}
export function fmToggleFold(winId: string, unitId: string): void {
  const a = state.answer;
  const u = a?.units.find((x) => x.id === unitId);
  if (!u) return;
  const f = foldsOf(winId);
  const closedNow = f.open.has(unitId) ? false : f.closed.has(unitId) ? true : u.collapsed;
  f.open.delete(unitId); f.closed.delete(unitId);
  if (closedNow) f.open.add(unitId); else f.closed.add(unitId);
}

/** The SVG of the whole Matrix (exported for the checks). */
export function fmSvg(a: FmAnswer, width: number, sel: string | null, t: FmHost["t"],
                      fold: { open: Set<string>; closed: Set<string> } = { open: new Set(), closed: new Set() }): string {
  const by = unitsById(a);
  const c: DrawCtx = { a, by, laneName: new Map(a.lanes.map((l) => [l.id, l.name])), lit: fmLitOf(sel, a), sel,
                       open: fold.open, closed: fold.closed, t, rects: new Map() };
  const W = Math.max(360, width);
  const inner = W - RAIL - 62;   // room on the right for the chain and its kind
  const lanes = [...a.lanes];
  const roots = a.roots.filter((r) => by.has(r));
  // a unit with parents only outside this graph's units, or in a cycle: a root too
  const reach = new Set<string>();
  for (const r of roots) for (const d of descendants(by, r)) reach.add(d);
  for (const u of a.units) if (!reach.has(u.id)) { roots.push(u.id); for (const d of descendants(by, u.id)) reach.add(d); }
  const NOLANE = "\u0000none";
  const perLane = new Map<string, Box[]>();
  for (const r of roots) {
    const u = by.get(r)!;
    const lane = u.lane && c.laneName.has(u.lane) ? u.lane : NOLANE;
    const box = unitBox(c, r, inner, new Set());
    (perLane.get(lane) ?? perLane.set(lane, []).get(lane)!).push(box);
  }
  if (perLane.has(NOLANE)) lanes.push({ id: NOLANE, name: t("fm.noLane"), start: null, end: null });
  let y = 4;
  let body = "";
  let rails = "";
  lanes.forEach((ln, i) => {
    const boxes = perLane.get(ln.id) ?? [];
    let h = 10;
    for (const b of boxes) h += b.h + 10;
    h = Math.max(LANE_MIN, h + 4);
    rails += `<g class="fm-lane" data-fm-lane="${esc(ln.id === NOLANE ? "" : ln.id)}">` +
      `<rect class="${i % 2 ? "fm-lanebg" : "fm-lanebg2"}" x="0" y="${y}" width="${W}" height="${h}"/>` +
      `<line class="fm-laneline" x1="0" x2="${W}" y1="${y}" y2="${y}"/>` +
      `<text class="fm-lanetxt" x="8" y="${y + 15}">${esc(fit(ln.name, RAIL - 12, 5.4))}</text>` +
      (ln.start != null || ln.end != null ? `<text class="fm-lanedate" x="8" y="${y + 28}">${esc(fmSpan([ln.start, ln.end]))}</text>` : "") +
      `</g>`;
    let yy = y + 10;
    for (const b of boxes) { body += b.draw(RAIL + 6, yy); yy += b.h + 10; }
    y += h;
  });
  // the chain of identities: dotted, with its kind, on the right
  let chain = "";
  for (const ch of a.chain) {
    const ra = c.rects.get(ch.former), rb = c.rects.get(ch.latter);
    if (!ra || !rb) continue;
    const x = RAIL + 6 + inner + 6;
    const ya = ra.y + ra.h / 2, yb = rb.y + rb.h / 2;
    const mid = (ya + yb) / 2;
    const dim = c.lit && !(c.lit.fus.has(ch.former) && c.lit.fus.has(ch.latter)) ? " fm-dim" : "";
    chain += `<g class="fm-chain${dim}" data-fm-chain="${esc(ch.edge_id)}" data-fm-kind="${esc(ch.transformation_kind ?? ch.change_type ?? "")}">` +
      `<path d="M${ra.x + ra.w},${ya} C${x + 26},${ya} ${x + 26},${yb} ${rb.x + rb.w},${yb}" fill="none" class="fm-chainline"/>` +
      `<text class="fm-chaintxt" x="${x + 34}" y="${mid}" transform="rotate(90 ${x + 34} ${mid})" text-anchor="middle">${esc(ch.label)}</text></g>`;
  }
  return `<svg xmlns="${NS}" class="fm-svg" width="${W}" height="${y + 4}" viewBox="0 0 ${W} ${y + 4}" role="img" aria-label="${esc(t("fm.title"))}">` +
    rails + body + chain + "</svg>";
}

/** Draw the Functional Matrix of THIS window into its body. */
export function renderFunctionalMatrixInto(body: HTMLElement, winId: string): void {
  if (!host) return;
  fmAsk();
  const h = host;
  const t = h.t;
  body.textContent = "";
  body.classList.add("fm-body");
  const head = document.createElement("div");
  head.className = "fm-head";
  const note = (key: string, vars?: Record<string, string | number>): HTMLElement => {
    const p = document.createElement("p");
    p.className = "fm-note";
    p.dataset.fmState = state.status;
    p.textContent = t(key, vars);
    return p;
  };
  if (!h.doc()) { body.appendChild(note("fm.noDoc")); return; }
  if (state.status === "missing") { body.appendChild(note("fm.missing")); return; }
  if (state.status === "off") { body.appendChild(note("fm.off")); return; }
  if (state.status === "error") { body.appendChild(note("fm.error", { why: state.error ?? "" })); return; }
  const a = state.answer;
  if (!a) { body.appendChild(note("fm.loading")); return; }
  const legend = document.createElement("div");
  legend.className = "fm-legend";
  const sw = (ev: Evidence) => `<span class="fm-sw" style="border-color:${evidenceColour(ev)}${ev === "symbol" ? ";border-style:dotted" : ""}"></span>`;
  legend.innerHTML = (["stratigraphic", "documentary", "reconstructive", "symbol"] as Evidence[])
    .map((ev) => `<span class="fm-legend-item" data-fm-legend="${ev}">${sw(ev)}${esc(t(`fm.ev.${ev}`))}</span>`).join("") +
    `<span class="fm-legend-item">${esc(t("fm.legend.instance"))}</span>`;
  const count = document.createElement("span");
  count.className = "fm-count-line";
  count.dataset.fmUnits = String(a.units.length);
  count.textContent = t("fm.count", { n: a.units.length });
  head.append(count, legend);
  if (state.stale) head.classList.add("fm-stale");
  body.appendChild(head);
  if (!a.units.length) { body.appendChild(note("fm.none")); return; }
  const wrap = document.createElement("div");
  wrap.className = "fm-scroll";
  const width = Math.max(420, (body.clientWidth || 640) - 8);
  wrap.innerHTML = fmSvg(a, width, h.selected(), t, foldsOf(winId));
  body.appendChild(wrap);
  wrap.addEventListener("click", (ev) => {
    const el = ev.target as Element;
    const fold = el.closest<SVGElement>("[data-fm-fold]");
    if (fold) {
      fmToggleFold(winId, fold.getAttribute("data-fm-fold")!);
      h.changed();
      return;
    }
    const inst = el.closest<SVGElement>("[data-fm-member]");
    if (inst) { h.select(inst.getAttribute("data-fm-member")!); return; }
    const unit = el.closest<SVGElement>("[data-fm-unit]");
    if (unit) h.select(unit.getAttribute("data-fm-unit")!);
  });
  wrap.addEventListener("dblclick", (ev) => {
    const unit = (ev.target as Element).closest<SVGElement>("[data-fm-unit]");
    if (!unit || (ev.target as Element).closest("[data-fm-member]")) return;
    fmToggleFold(winId, unit.getAttribute("data-fm-unit")!);
    h.changed();
  });
}

// ── B · the Inspector: «how we know it» ──────────────────────────────────────

function sect(hostEl: HTMLElement, key: string, title: string): HTMLElement {
  const h = document.createElement("h3");
  h.className = "insp-sect";
  h.dataset.sect = key;
  h.textContent = title;
  hostEl.appendChild(h);
  const box = document.createElement("div");
  box.className = `fm-insp fm-insp-${key}`;
  hostEl.appendChild(box);
  return box;
}

/** The Inspector's section for the selected node: for a functional unit
 *  «How we know it» (function, scale, declared life, sources and extractors,
 *  members); for a unit read by functional units, «Read by» (the units, each
 *  a link). Nothing when the answer is not there or says nothing of it. */
export function fmInspectorInto(hostEl: HTMLElement, nodeId: string): void {
  const a = state.answer;
  if (!a || !host) return;
  const h = host;
  const t = h.t;
  const name = (id: string) => a.units.find((u) => u.id === id)?.name ?? a.how[id]?.name ?? id;
  const link = (id: string, label: string): HTMLButtonElement => {
    const b = document.createElement("button");
    b.className = "tv-link";
    b.dataset.fmGo = id;
    b.textContent = label;
    b.addEventListener("click", () => h.select(id));
    return b;
  };
  const row = (box: HTMLElement, label: string, ...vals: Array<string | Node>): HTMLElement => {
    const r = document.createElement("div");
    r.className = "fm-kv";
    const k = document.createElement("span");
    k.className = "fm-k";
    k.textContent = label;
    const v = document.createElement("span");
    v.className = "fm-v";
    vals.forEach((x, i) => { if (i) v.append(" · "); v.append(x); });
    r.append(k, v);
    box.appendChild(r);
    return r;
  };
  const how = a.how[nodeId];
  if (how) {
    const box = sect(hostEl, "fm-how", t("fm.how.title"));
    box.dataset.fmHow = nodeId;
    const u = a.units.find((x) => x.id === nodeId);
    const fn = how.function;
    row(box, t("fm.how.function"), fn ? String(fn.value ?? "—") : t("fm.how.noFunction")).dataset.fmRow = "function";
    row(box, t("fm.how.scale"), how.scale ? t(`fm.scale.${how.scale}`) : "—").dataset.fmRow = "scale";
    const from = (side: "start" | "end") => how.life_from[side] === "property" ? t("fm.how.fromProperty") : t("fm.how.fromEpochs");
    const eps = [...how.epochs.has_first_epoch.map((e) => e.name), ...how.epochs.survive_in_epoch.map((e) => `+${e.name}`)];
    row(box, t("fm.how.life"), fmSpan(how.life),
        t("fm.how.lifeFrom", { start: from("start"), end: from("end") }) + (eps.length ? ` (${eps.join(", ")})` : ""))
      .dataset.fmRow = "life";
    const ev = document.createElement("span");
    ev.innerHTML = `<span class="fm-sw" style="border-color:${evidenceColour(how.evidence)}"></span>${esc(t(`fm.ev.${how.evidence}`))}`;
    row(box, t("fm.how.evidence"), ev).dataset.fmRow = "evidence";
    // the sources: of the function first, then of every other property
    const props = [...(fn ? [fn] : []), ...how.properties.filter((p) => p !== fn && p.id !== fn?.id)];
    const srcRows = props.flatMap((p) => p.sources.map((s) => ({ p, s })));
    if (!srcRows.length) row(box, t("fm.how.sources"), t("fm.how.noSources")).dataset.fmRow = "sources";
    for (const { p, s } of srcRows) {
      const what: Array<string | Node> = [link(s.extractor, s.name)];
      for (const src of s.sources) what.push(link(src.id, src.name));
      if (s.authors.length) what.push(s.authors.join(", "));
      const r = row(box, p.name === "primary_function" ? t("fm.how.sourceOfFunction") : p.name, ...what);
      r.dataset.fmRow = "source";
    }
    for (const us of how.uses)
      row(box, t("fm.how.use"), String(us.value ?? "—"), fmSpan([us.valid_from, us.valid_to])).dataset.fmRow = "use";
    if (how.parents.length) row(box, t("fm.how.inside"), ...how.parents.map((p) => link(p, name(p)))).dataset.fmRow = "parents";
    if (how.children.length) row(box, t("fm.how.children"), ...how.children.map((c) => link(c, name(c)))).dataset.fmRow = "children";
    const mem = row(box, t("fm.how.members", { n: how.members.length, all: how.members_all }),
                    ...how.members.slice(0, 40).map((m) => link(m.id, m.name)));
    mem.dataset.fmRow = "members";
    if (how.members.length > 40) mem.querySelector(".fm-v")?.append(" …");
    const chain = a.chain.filter((c) => c.latter === nodeId || c.former === nodeId);
    for (const c of chain) {
      const other = c.latter === nodeId ? c.former : c.latter;
      row(box, c.latter === nodeId ? t("fm.how.changedFrom") : t("fm.how.changedInto"), link(other, name(other)), c.label)
        .dataset.fmRow = "chain";
    }
    if (u && !u.members.every((m) => m.alive))
      row(box, t("fm.how.check"), t("fm.how.notAliveN", { n: u.members.filter((m) => !m.alive).length })).dataset.fmRow = "check";
    return;
  }
  const readers = a.readers[nodeId];
  if (readers?.length) {
    const box = sect(hostEl, "fm-readers", t("fm.readers.title", { n: readers.length }));
    row(box, t("fm.readers.by"), ...readers.map((r) => link(r, name(r)))).dataset.fmRow = "readers";
  }
}
