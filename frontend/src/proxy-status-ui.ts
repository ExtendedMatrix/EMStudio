/**
 * MICRO-LG12 (E.D., 23 Nov 2026, 08:30–08:50) · THE PROXY NOT DRAWN YET — a
 * placeholder that prepares SOURCE-BASED MODELING.
 *
 * Many units have no 3D shape. A lack (nobody has tried) or a choice (it is
 * not drawn): in both cases it is worth saying so, with the little that is
 * known of the shape (in words) and where the documents to draw it are.
 *
 * The datum (s3Dgraphy `proxy_status`, em_qualia_types 1.6.20, node datamodel
 * 1.6.56) is a PropertyNode `proxy_status` of the unit: value the state
 * (not_yet_drawn · not_drawn_by_choice · drawable; «drawn» is READ from the
 * graph — a geometry property reaching a semantic shape — never declared
 * here), `data.placeholder` the shape in words, and its extractors: the ones
 * with `data.source_strength` (certain · probable · to_verify) are the
 * CANDIDATE SOURCES («look, you may find the shape here»), `extracted_from`
 * the document, `data.source_model` a model inside it, `has_author` who
 * proposes it (the person, or the AuthorAINode of an accepted AI proposal).
 *
 * Here:
 *  · the Inspector, for a unit WITHOUT a proxy, ONE quiet line «Proxy non
 *    ancora disegnato» — its state, placeholder and sources when said — with
 *    the form to declare them and the two scoutings (deterministic and AI,
 *    `POST /proxy-status`, bridge level 96): each proposal waits for a person
 *    to accept it (one undo step, with its paradata) or to discard it. A unit
 *    WITH a proxy: nothing (a placeholder left on it is said in one line);
 *  · the Tabular's computed view «Da disegnare» (`ToDraw`): the units to draw,
 *    ordered by s3Dgraphy (`to_draw`: the drawable first, by the strength of
 *    their sources), each with its placeholder and sources.
 *
 * ONE computation, in s3Dgraphy (CLAUDE.md, invariant 2): the list and its
 * order, the scoutings. What this module writes is a declaration and the
 * sources a person accepts. EM core: community build (no functional unit, no
 * Landscape Graph is read).
 */
import { t } from "./i18n";
import { helpGlyph } from "./help-glyph";
import { askConfirm } from "./app-dialog";
import type { DocumentStore } from "./model";
import type { EmDocument, EmNode } from "./types";
import { allowedEdgeTypes, isStratigraphicType } from "./rules";
import { addReading } from "./paradata-chain";
import { currentIdentity } from "./identity";

export const PXS_PROPERTY = "proxy_status";
// MICRO-PX1c · "to_refine": the unit HAS a proxy, a semantic shape drawn without a
// document (em_qualia_types 1.6.21) — declared by the tool that drew it
export const PXS_STATES = ["not_yet_drawn", "drawable", "not_drawn_by_choice", "drawn", "to_refine"] as const;
export type PxsState = (typeof PXS_STATES)[number];
export const PXS_STRENGTHS = ["certain", "probable", "to_verify"] as const;
export type PxsStrength = (typeof PXS_STRENGTHS)[number];

// ── reading the document ────────────────────────────────────────────────────

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const isLive = (n: EmNode | undefined): n is EmNode => {
  if (!n) return false;
  const d = (n.data ?? {}) as Record<string, unknown>;
  return !d.removed && !((n as { attributes?: Record<string, unknown> }).attributes?.removed);
};

class Ix {
  byId = new Map<string, EmNode>();
  out = new Map<string, Array<{ type: string; target: string }>>();
  constructor(doc: EmDocument) {
    for (const n of doc.graph.nodes ?? []) if (isLive(n)) this.byId.set(n.id, n);
    for (const e of doc.graph.edges ?? []) {
      const l = this.out.get(e.source) ?? this.out.set(e.source, []).get(e.source)!;
      l.push({ type: String(e.edge_type ?? ""), target: e.target });
    }
  }
  targets(id: string, type: string): string[] {
    return (this.out.get(id) ?? []).filter((e) => e.type === type && this.byId.has(e.target)).map((e) => e.target);
  }
}

const propType = (n: EmNode | undefined): string => {
  const d = (n?.data ?? {}) as Record<string, unknown>;
  return String(d.property_type ?? n?.name ?? "");
};

/** a unit that may have a proxy: a stratigraphic unit, never the continuity
 *  node (BR) or a stratigraphic event */
export function isProxyUnit(n: EmNode | undefined): boolean {
  return !!n && isStratigraphicType(n.node_type) && n.node_type !== "BR" && n.node_type !== "SE"
    && n.name !== "continuity_node";
}

/** the unit IS drawn: its geometry property reaches a semantic shape (or, in
 *  an old file, the unit reaches one itself) — s3Dgraphy `has_proxy` */
export function hasProxy(doc: EmDocument, unit: string, ix: Ix = new Ix(doc)): boolean {
  if (ix.targets(unit, "has_semantic_shape").length) return true;
  return ix.targets(unit, "has_property").some((p) => propType(ix.byId.get(p)) === "geometry"
    && ix.targets(p, "has_semantic_shape").length > 0);
}

export interface PxsSource {
  extractor: string; strength: PxsStrength; note: string;
  document: string | null; model: string | null; origin: "human" | "ai" | "derived";
  authors: Array<{ id: string; name: string; ai: boolean }>; actStart: string | null;
}
export interface PxsStatus {
  property: EmNode | null; declared: PxsState | null; placeholder: string;
  sources: PxsSource[]; statements: Array<{ extractor: string; note: string; documents: string[] }>;
}

const STRENGTH_SET = new Set<string>(PXS_STRENGTHS);
const STATE_SET = new Set<string>(PXS_STATES);

/** the declaration of a unit, as written (no computation: the data) */
export function proxyStatusOf(doc: EmDocument, unit: string, ix: Ix = new Ix(doc)): PxsStatus {
  const out: PxsStatus = { property: null, declared: null, placeholder: "", sources: [], statements: [] };
  const pid = ix.targets(unit, "has_property").find((p) => propType(ix.byId.get(p)) === PXS_PROPERTY);
  if (!pid) return out;
  const p = ix.byId.get(pid)!;
  const pd = (p.data ?? {}) as Record<string, unknown>;
  out.property = p;
  const v = String(pd.value ?? p.description ?? "").trim();
  out.declared = STATE_SET.has(v) ? (v as PxsState) : null;
  out.placeholder = String(pd.placeholder ?? "");
  // the extractors, directly or through a combiner (two or more sources of
  // one property are gathered under a combiner: `addReading`)
  const xids = ix.targets(pid, "has_data_provenance")
    .flatMap((x) => (ix.byId.get(x)?.node_type === "combiner" ? ix.targets(x, "combines") : [x]));
  for (const xid of [...new Set(xids)]) {
    const x = ix.byId.get(xid)!;
    if (x.node_type !== "extractor") continue;
    const xd = (x.data ?? {}) as Record<string, unknown>;
    const docs = ix.targets(xid, "extracted_from");
    if (xd.source_strength) {
      const authors = ix.targets(xid, "has_author").map((a) => {
        const an = ix.byId.get(a)!;
        return { id: a, name: String(an.name ?? a), ai: an.node_type === "author_ai" };
      });
      const s = String(xd.source_strength);
      out.sources.push({ extractor: xid, strength: (STRENGTH_SET.has(s) ? s : "to_verify") as PxsStrength,
        note: String(x.description ?? ""), document: docs[0] ?? null,
        model: xd.source_model ? String(xd.source_model) : null,
        origin: xd.origin === "derived" ? "derived" : authors.some((a) => a.ai) ? "ai" : "human",
        authors, actStart: xd.act_start ? String(xd.act_start) : null });
    } else out.statements.push({ extractor: xid, note: String(x.description ?? ""), documents: docs });
  }
  return out;
}

// ── writing (one undo step each) ────────────────────────────────────────────

function authorOfMe(store: DocumentStore): string | null {
  const me = currentIdentity();
  if (!me) return null;
  const a = store.doc.graph.nodes.find((n) => n.node_type === "author"
    && String(((n.data ?? {}) as Record<string, unknown>).orcid ?? "") === me.orcid);
  return a?.id ?? null;
}
function linkAuthor(store: DocumentStore, xid: string, aid: string | null): void {
  const a = aid ? store.node(aid) : undefined;
  if (!a || store.hasEdge(xid, a.id, "has_author")) return;
  if (allowedEdgeTypes("extractor", a.node_type).includes("has_author")) store.addEdge(xid, a.id, "has_author");
}

/** the unit's proxy_status property, made (no state) when missing — inside a batch */
function ensureProperty(store: DocumentStore, unit: string): string {
  const cur = proxyStatusOf(store.doc, unit).property;
  if (cur) return cur.id;
  const pid = store.newId();
  const pos = (store.doc.layout as { positions?: Record<string, { x: number; y: number }> } | undefined)?.positions?.[unit];
  store.addNode({ id: pid, node_type: "property", name: PXS_PROPERTY, description: "",
    data: { property_type: PXS_PROPERTY, value: "" } } as EmNode, pos ? { x: pos.x + 30, y: pos.y + 60, w: 160, h: 40 } : undefined);
  store.addEdge(unit, pid, "has_property");
  return pid;
}

export interface PxsDeclaration { state: PxsState | null; placeholder?: string; note?: string }

/** declare (or update) the state and the placeholder: ONE property per unit;
 *  a note writes the extractor that states it (has_author the current
 *  identity, when the graph knows it). Returns the property id. */
export function declareProxyStatus(store: DocumentStore, unit: string, dec: PxsDeclaration): string {
  if (!isProxyUnit(store.node(unit))) throw new Error("not a unit that can have a proxy");
  return store.batch(() => {
    const pid = ensureProperty(store, unit);
    const p = store.node(pid)!;
    const data = { ...((p.data ?? {}) as Record<string, unknown>) };
    if (dec.state) data.value = dec.state;
    if (dec.placeholder !== undefined) {
      if (dec.placeholder.trim()) data.placeholder = dec.placeholder.trim();
      else delete data.placeholder;
    }
    store.updateNode(pid, { data, description: String(data.value ?? "") } as Partial<EmNode>);
    const note = (dec.note ?? "").trim();
    if (note) {
      const xid = store.newId();
      store.addNode({ id: xid, node_type: "extractor", name: `${String(store.node(unit)?.name ?? unit)} proxy`,
        description: note, data: { act_start: new Date().toISOString().slice(0, 10) } } as EmNode);
      store.addEdge(pid, xid, "has_data_provenance");
      linkAuthor(store, xid, authorOfMe(store));
    }
    return pid;
  });
}

export interface PxsSourceIn {
  document: string; strength: PxsStrength; note?: string; model?: string | null;
  /** an accepted AI proposal: its model and date (its AuthorAINode) */
  ai?: { model: string; date: string | null } | null;
  /** an accepted deterministic proposal */
  derived?: boolean;
}

function aiAuthor(store: DocumentStore, model: string): string {
  const found = store.doc.graph.nodes.find((n) => n.node_type === "author_ai"
    && String(((n.data ?? {}) as Record<string, unknown>).model ?? "") === model);
  if (found) return found.id;
  const id = store.newId();
  store.addNode({ id, node_type: "author_ai", name: `AI.${model}`,
    description: `AI scouting of the proxies to draw (${model})`, data: { model, prompt_reference: "MICRO-LG12 proxy scouting" } } as EmNode);
  return id;
}

/** add a CANDIDATE SOURCE (an extractor of the unit's proxy_status with its
 *  strength), ONE undo step; the current identity is its author (who
 *  declares or accepts it), an AI proposal adds its AuthorAINode. */
export function addProxySource(store: DocumentStore, unit: string, src: PxsSourceIn): string {
  if (!isProxyUnit(store.node(unit))) throw new Error("not a unit that can have a proxy");
  return store.batch(() => {
    const pid = ensureProperty(store, unit);
    const data: Record<string, unknown> = { source_strength: src.strength };
    if (src.model) data.source_model = src.model;
    if (src.derived) data.origin = "derived";
    if (src.ai?.date) data.act_start = src.ai.date;
    else data.act_start = new Date().toISOString().slice(0, 10);
    const { extractorId } = addReading(store, pid, { kind: "document", id: src.document },
      { description: (src.note ?? "").trim(), extractorData: data });
    if (src.ai) linkAuthor(store, extractorId, aiAuthor(store, src.ai.model || "ai"));
    linkAuthor(store, extractorId, authorOfMe(store));
    return extractorId;
  });
}

// ── asking the bridge (the list, the scoutings) ─────────────────────────────

let resolveBridge: () => Promise<string> = async () => "http://localhost:8765";
export function setProxyStatusBridgeResolver(fn: () => Promise<string>): void { resolveBridge = fn; }

export interface PxsHost {
  /** the em.json's path (the folder of its proxies and models), or null */
  path: () => string | null;
  ai: { provider: () => string; model: () => string; ready: () => Promise<boolean>; configure: (then: () => void) => void };
  lang: () => string;
}
let host: PxsHost | null = null;
export function setProxyStatusHost(h: PxsHost): void { host = h; }

export interface PxsProposal {
  key: string; kind?: string; origin: "derived" | "ai"; unit: string; unit_name: string;
  document: string; document_name: string; model: string | null; model_name: string | null;
  strength: PxsStrength; why: string; note?: string; author_ai?: { model: string; date: string | null };
}
export interface PxsPlaceholderProposal {
  key: string; unit: string; unit_name: string; placeholder: string; state: PxsState | null; why: string;
  author_ai?: { model: string; date: string | null };
}
interface ScoutSlot {
  status: "idle" | "loading" | "ok" | "error" | "unconfigured" | "missing";
  proposals: PxsProposal[]; placeholders: PxsPlaceholderProposal[]; error?: string; model?: string;
  dropped?: number;
}
const scouts = new WeakMap<DocumentStore, Map<string, ScoutSlot>>();
const discarded = new WeakMap<DocumentStore, Set<string>>();
function slotOf(store: DocumentStore, unit: string): ScoutSlot {
  let m = scouts.get(store);
  if (!m) scouts.set(store, (m = new Map()));
  let s = m.get(unit);
  if (!s) m.set(unit, (s = { status: "idle", proposals: [], placeholders: [] }));
  return s;
}
function discardedOf(store: DocumentStore): Set<string> {
  let s = discarded.get(store);
  if (!s) discarded.set(store, (s = new Set()));
  return s;
}

/** the em.json travels as the store's own text (`toJSON()` is a string),
 *  spliced in rather than parsed and serialised again */
async function post(docText: string, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const rest = JSON.stringify(body);
  const res = await fetch(`${await resolveBridge()}/proxy-status`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: `{"doc":${docText}${rest.length > 2 ? "," + rest.slice(1) : "}"}` });
  let json: Record<string, unknown> | null = null;
  try { json = (await res.json()) as Record<string, unknown>; } catch { /* not JSON */ }
  return { status: res.status, json };
}

/** run a scouting for ONE unit (Inspector) — deterministic or AI. Nothing is
 *  written: the proposals wait on the slot. */
export async function scoutUnit(store: DocumentStore, unit: string, mode: "scout" | "ai"): Promise<boolean> {
  const slot = slotOf(store, unit);
  if (mode === "ai" && host && !(await host.ai.ready())) {
    slot.status = "unconfigured";
    repaintProxyStatus();
    host.ai.configure(() => { void scoutUnit(store, unit, mode); });
    return false;
  }
  slot.status = "loading";
  repaintProxyStatus();
  const body: Record<string, unknown> = { mode, base: host?.path() ?? null, units: [unit],
    lang: host?.lang() ?? "en", date: new Date().toISOString().slice(0, 10) };
  if (mode === "ai" && host) { body.provider = host.ai.provider(); body.model = host.ai.model(); }
  try {
    const { status, json } = await post(store.toJSON(), body);
    if (status === 404) Object.assign(slot, { status: "missing" });
    else if (status === 501 && mode === "ai") Object.assign(slot, { status: "unconfigured", error: String(json?.error ?? "") });
    else if (status !== 200 || !json?.ok) Object.assign(slot, { status: "error", error: String(json?.error ?? `bridge error ${status}`) });
    else {
      const stamp = Date.now().toString(36);
      const fresh = ((json.proposals as PxsProposal[]) ?? []).filter((p) => p.unit === unit)
        .map((p) => ({ ...p, key: `${mode}:${stamp}:${p.key}` }));
      const places = ((json.placeholders as PxsPlaceholderProposal[]) ?? []).filter((p) => p.unit === unit)
        .map((p) => ({ ...p, key: `${mode}:${stamp}:${p.key}` }));
      // a second scouting of the same kind replaces its open proposals
      const keep = slot.proposals.filter((p) => !p.key.startsWith(`${mode}:`));
      const keepP = slot.placeholders.filter((p) => !p.key.startsWith(`${mode}:`));
      Object.assign(slot, { status: "ok", proposals: [...keep, ...fresh], placeholders: [...keepP, ...places],
        error: undefined, model: String(json.model ?? ""), dropped: ((json.dropped as unknown[]) ?? []).length });
    }
  } catch {
    Object.assign(slot, { status: "error", error: t("pxs.scout.offline") });
  }
  repaintProxyStatus();
  return (slot.status as string) === "ok";
}

/** the open proposals of a unit (accepted or discarded ones out) */
export function openProposals(store: DocumentStore, unit: string): { sources: PxsProposal[]; placeholders: PxsPlaceholderProposal[]; status: ScoutSlot["status"]; error?: string } {
  const slot = slotOf(store, unit);
  const gone = discardedOf(store);
  const st = proxyStatusOf(store.doc, unit);
  const have = new Set(st.sources.map((s) => `${s.document}|${s.model ?? ""}`));
  return {
    sources: slot.proposals.filter((p) => !gone.has(p.key) && !have.has(`${p.document}|${p.model ?? ""}`)),
    placeholders: slot.placeholders.filter((p) => !gone.has(p.key) && p.placeholder !== st.placeholder),
    status: slot.status, error: slot.error,
  };
}

export function acceptProposal(store: DocumentStore, key: string): string | null {
  for (const [unit, slot] of scouts.get(store) ?? []) {
    const p = slot.proposals.find((x) => x.key === key);
    if (p) {
      const note = p.origin === "derived" && p.kind
        ? t(`pxs.why.${p.kind}`, { doc: p.document_name, model: p.model_name ?? "" })
        : [p.note, p.why].filter((x) => x && x.trim()).join(" — ");
      const id = addProxySource(store, unit, { document: p.document, strength: p.strength, note, model: p.model,
        ai: p.origin === "ai" ? (p.author_ai ?? { model: slot.model ?? "ai", date: null }) : null, derived: p.origin === "derived" });
      discardedOf(store).add(key);
      repaintProxyStatus();
      return id;
    }
    const q = slot.placeholders.find((x) => x.key === key);
    if (q) {
      const cur = proxyStatusOf(store.doc, unit);
      const ai = q.author_ai ?? { model: slot.model ?? "ai", date: null };
      const id = declareProxyStatus(store, unit, { state: cur.declared ?? q.state, placeholder: q.placeholder,
        note: `${t("pxs.placeholderFromAi", { model: ai.model })}${q.why ? ` — ${q.why}` : ""}` });
      discardedOf(store).add(key);
      repaintProxyStatus();
      return id;
    }
  }
  return null;
}
export function discardProposal(store: DocumentStore, key: string): void {
  discardedOf(store).add(key);
  repaintProxyStatus();
}

// the list «Da disegnare» (s3Dgraphy to_draw), asked when the document changed

export interface PxsRow {
  unit: string; name: string; type: string; state: PxsState | null; declared: PxsState | null;
  placeholder: string | null; description: string; weight: number; rank?: number;
  sources: Array<{ extractor: string; strength: PxsStrength; note: string; document: string | null; document_name: string | null; model_name: string | null; origin: string }>;
  unlinked_file: string | null;
}
interface ListSlot { status: "idle" | "loading" | "ok" | "off" | "missing" | "error"; sig: string | null; rows: PxsRow[]; byChoice: PxsRow[]; drawnDeclared: PxsRow[]; toRefine: PxsRow[]; hints: Array<Record<string, unknown>>; error?: string; seq: number }
const lists = new WeakMap<DocumentStore, ListSlot>();

export function toDrawFor(store: DocumentStore): ListSlot {
  let s = lists.get(store);
  if (!s) lists.set(store, (s = { status: "idle", sig: null, rows: [], byChoice: [], drawnDeclared: [], toRefine: [], hints: [], seq: 0 }));
  const sig = String((store as unknown as { rev?: number }).rev ?? -1);
  if (s.sig !== sig) {
    s.sig = sig;
    if (s.status !== "ok") s.status = "loading";
    const mine = ++s.seq;
    const slot = s;
    void post(store.toJSON(), { mode: "list", base: host?.path() ?? null }).then(({ status, json }) => {
      if (mine !== slot.seq) return;
      if (status === 404) Object.assign(slot, { status: "missing" });
      else if (status !== 200 || !json?.ok) Object.assign(slot, { status: "error", error: String(json?.error ?? `bridge error ${status}`) });
      else {
        const td = (json.to_draw ?? {}) as { units?: PxsRow[]; by_choice?: PxsRow[]; drawn_declared?: PxsRow[]; to_refine?: PxsRow[] };
        Object.assign(slot, { status: "ok", rows: td.units ?? [], byChoice: td.by_choice ?? [], drawnDeclared: td.drawn_declared ?? [], toRefine: td.to_refine ?? [],
          hints: (json.hints as Array<Record<string, unknown>>) ?? [], error: undefined });
      }
      for (const fn of listListeners) fn();
    }).catch(() => {
      if (mine !== slot.seq) return;
      slot.status = "off";
      for (const fn of listListeners) fn();
    });
  }
  return s;
}
const listListeners: Array<() => void> = [];
export function onToDrawUpdate(fn: () => void): void { listListeners.push(fn); }

const escHtml = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** the Tabular's computed view «Da disegnare» */
export function toDrawTableHtml(store: DocumentStore, passes: (id: string, text: string) => boolean): { html: string; count: number } {
  const s = toDrawFor(store);
  if (s.status !== "ok") {
    const k = s.status === "missing" ? "pxs.list.missing" : s.status === "error" ? "pxs.list.error" : s.status === "off" ? "pxs.list.off" : "pxs.list.loading";
    return { html: `<div class="pxs-list" data-pxs-list="${s.status}"><p class="note2">${escHtml(t(k, { error: s.error ?? "" }))}</p></div>`, count: 0 };
  }
  const rows = s.rows.filter((r) => passes(r.unit, `${r.name} ${r.placeholder ?? ""} ${r.description} ${r.sources.map((x) => x.document_name).join(" ")}`));
  const stateWord = (st: PxsState | null) => (st ? t(`pxs.state.${st}`) : t("pxs.state.none"));
  let h = `<div class="pxs-list" data-pxs-list="ok"><table class="pxs-table" aria-label="${escHtml(t("table.sheet.ToDraw"))}"><thead><tr>`
    + `<th>#</th><th>${escHtml(t("pxs.col.unit"))}</th><th>${escHtml(t("pxs.col.state"))}</th><th>${escHtml(t("pxs.col.placeholder"))}</th>`
    + `<th>${escHtml(t("pxs.col.sources"))}</th></tr></thead><tbody>`;
  for (const r of rows) {
    const src = r.sources.map((x) => `<span class="pxs-src" data-pxs-strength="${escHtml(x.strength)}" title="${escHtml(x.note)}">`
      + `${x.document ? `<button class="tv-link" type="button" data-go="${escHtml(x.document)}">${escHtml(x.document_name ?? x.document)}</button>` : ""}`
      + `${x.model_name ? ` · ${escHtml(x.model_name)}` : ""} <i>${escHtml(t(`pxs.strength.${x.strength}`))}</i></span>`).join("<br>");
    const ph = r.placeholder ? escHtml(r.placeholder) : `<span class="d" title="${escHtml(t("pxs.list.fromDescription"))}">${escHtml(r.description)}</span>`;
    h += `<tr data-row="${escHtml(r.unit)}" data-pxs-row="${escHtml(r.name)}" data-pxs-state="${escHtml(r.declared ?? "")}" data-pxs-weight="${r.weight}">`
      + `<td class="num">${r.rank ?? ""}</td><td><button class="tv-link" type="button" data-go="${escHtml(r.unit)}">${escHtml(r.name)}</button> <span class="d">${escHtml(r.type)}</span>`
      + `${r.unlinked_file ? ` <span class="pxs-unlinked" title="${escHtml(r.unlinked_file)}">${escHtml(t("pxs.unlinked"))}</span>` : ""}</td>`
      + `<td>${escHtml(stateWord(r.declared))}</td><td>${ph}</td><td>${src || `<span class="d">${escHtml(t("pxs.noSources"))}</span>`}</td></tr>`;
  }
  h += `</tbody></table>`;
  if (s.byChoice.length)
    h += `<p class="note2" data-pxs-by-choice="${s.byChoice.length}">${escHtml(t("pxs.list.byChoice", { names: s.byChoice.map((r) => r.name).join(", ") }))}</p>`;
  if (s.drawnDeclared.length)
    h += `<p class="note2" data-pxs-drawn-declared="${s.drawnDeclared.length}">${escHtml(t("pxs.list.drawnDeclared", { names: s.drawnDeclared.map((r) => r.name).join(", ") }))}</p>`;
  // MICRO-PX1c · the proxies drawn as a semantic shape, without a document: to refine
  const refine = s.toRefine.filter((r) => passes(r.unit, `${r.name} ${r.placeholder ?? ""} ${r.description}`));
  if (refine.length) {
    h += `<p class="note2" data-pxs-to-refine="${refine.length}">${escHtml(t("pxs.list.toRefine"))} `
      + refine.map((r) => `<button class="tv-link" type="button" data-go="${escHtml(r.unit)}" data-pxs-refine="${escHtml(r.name)}" title="${escHtml(r.placeholder ?? "")}">${escHtml(r.name)}</button>`).join(", ")
      + `</p>`;
  }
  h += `<p class="note2">${escHtml(t("pxs.list.note"))}</p></div>`;
  return { html: h, count: rows.length };
}

// ── the Inspector ───────────────────────────────────────────────────────────

const boxes = new Set<{ box: HTMLElement; paint: () => void }>();
export function repaintProxyStatus(): void {
  for (const b of [...boxes]) { if (!b.box.isConnected) { boxes.delete(b); continue; } b.paint(); }
}
/** the units whose form is open (kept open across a repaint) */
const opening = new Set<string>();

/** the section of a unit WITHOUT a proxy, or one line for a placeholder left
 *  on a drawn unit, or nothing */
export function renderProxyStatus(root: HTMLElement, store: DocumentStore, id: string, onJump: (id: string) => void): void {
  const n = store.node(id);
  if (!isProxyUnit(n)) return;
  const host_ = el("div", "insp-pxs-host");
  root.appendChild(host_);
  const paint = (): void => {
    host_.replaceChildren();
    paintUnit(host_, store, id, onJump);
  };
  boxes.add({ box: host_, paint });
  paint();
}

const docName = (doc: EmDocument, id: string | null): string =>
  (id ? String(doc.graph.nodes.find((x) => x.id === id)?.name ?? id) : "");

function link(target: string, words: string, onJump: (id: string) => void): HTMLElement {
  const b = el("button", "insp-prov-from insp-link", words) as HTMLButtonElement;
  b.type = "button";
  b.dataset.go = target;
  b.addEventListener("click", () => onJump(target));
  return b;
}
function btn(words: string, attrs: Record<string, string>, title?: string, cls = "insp-btn insp-btn-quiet"): HTMLButtonElement {
  const b = el("button", cls, words) as HTMLButtonElement;
  b.type = "button";
  for (const [k, v] of Object.entries(attrs)) b.dataset[k] = v;
  if (title) b.title = title;
  return b;
}

function paintUnit(host_: HTMLElement, store: DocumentStore, id: string, onJump: (id: string) => void): void {
  const doc = store.doc;
  const ix = new Ix(doc);
  const st = proxyStatusOf(doc, id, ix);
  if (hasProxy(doc, id, ix)) {
    // MICRO-PX1c · a semantic shape, no document: one quiet line, its placeholder
    if (st.property && st.declared === "to_refine") {
      const line = el("div", "insp-pxs insp-pxs-refine");
      line.dataset.pxsSect = id;
      line.dataset.pxsState = "to_refine";
      line.append(el("span", "insp-hint", t("pxs.toRefine")));
      if (st.placeholder) line.title = st.placeholder;
      host_.appendChild(line);
      return;
    }
    // drawn: nothing — unless a placeholder was left on it (a hint, never corrected)
    if (st.property && st.declared && st.declared !== "drawn") {
      const line = el("div", "insp-pxs insp-pxs-stale");
      line.dataset.pxsSect = id;
      line.dataset.pxsStale = st.declared;
      line.append(el("span", "insp-hint", t("pxs.stale")), " ");
      const rm = btn(t("pxs.removePlaceholder"), { pxsRemove: st.property.id });
      rm.addEventListener("click", () => {
        void askConfirm(t("pxs.removeConfirm"), { kind: "proxy-status-remove", ok: t("pxs.removePlaceholder") }).then((yes) => { if (yes) store.batch(() => store.deleteNode(st.property!.id)); });
      });
      line.appendChild(rm);
      host_.appendChild(line);
    }
    return;
  }
  const box = el("div", "insp-pxs");
  box.dataset.pxsSect = id;
  box.dataset.pxsState = st.declared ?? "";
  box.dataset.pxsSources = String(st.sources.length);
  // the ONE line: «Proxy non ancora disegnato» (or the state said)
  const head = el("div", "insp-pxs-line");
  const word = st.declared ? t(`pxs.state.${st.declared}`) : t("pxs.notDrawn");
  const label = el("span", "insp-pxs-label", st.declared ? t("pxs.proxyState", { state: word }) : word);
  head.append(label, " ", helpGlyph(t("pxs.help"), "proxy-status"));
  if (st.sources.length) head.append(" ", el("span", "insp-pxs-count", t("pxs.nSources", { n: String(st.sources.length) })));
  const open = btn(opening.has(id) ? t("pxs.close") : (st.property ? t("pxs.edit") : t("pxs.declare")), { pxsDeclare: id });
  open.addEventListener("click", () => {
    if (opening.has(id)) opening.delete(id); else opening.add(id);
    repaintProxyStatus();
  });
  head.append(" ", open);
  box.appendChild(head);
  if (st.placeholder) {
    const ph = el("p", "insp-pxs-placeholder", st.placeholder);
    ph.dataset.pxsPlaceholder = "";
    box.appendChild(ph);
  }
  if (st.sources.length) {
    const ul = el("ul", "insp-pxs-sources");
    for (const s of st.sources) {
      const li = el("li", "insp-pxs-source");
      li.dataset.pxsSource = s.extractor;
      li.dataset.pxsStrength = s.strength;
      li.dataset.pxsOrigin = s.origin;
      if (s.document) li.appendChild(link(s.document, docName(doc, s.document), onJump));
      if (s.model) li.append(" · ", link(s.model, docName(doc, s.model), onJump));
      li.append(" ", el("span", `insp-pxs-strength pxs-${s.strength}`, t(`pxs.strength.${s.strength}`)));
      if (s.note) li.append(" ", el("span", "insp-hint", s.note));
      const who = s.authors.map((a) => (a.ai ? t("pxs.byAi", { name: a.name }) : a.name)).join(", ");
      if (who || s.origin === "derived") li.append(" ", el("span", "insp-hint", [s.origin === "derived" ? t("pxs.derived") : "", who].filter(Boolean).join(" · ")));
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  if (opening.has(id)) box.appendChild(declareForm(store, id, st));
  // the scoutings: their proposals wait here until accepted or discarded
  const props = openProposals(store, id);
  if (opening.has(id) || props.sources.length || props.placeholders.length || props.status === "loading" || props.status === "error" || props.status === "unconfigured") {
    box.appendChild(scoutBox(store, id, props, onJump));
  }
  host_.appendChild(box);
}

function declareForm(store: DocumentStore, unit: string, st: PxsStatus): HTMLElement {
  const doc = store.doc;
  const form = el("div", "insp-pxs-form");
  form.dataset.pxsForm = unit;
  const field = (label: string, input: HTMLElement): HTMLElement => {
    const l = el("label", "insp-obl-field");
    l.append(el("span", "insp-obl-label", label), input);
    return l;
  };
  const select = (key: string, opts: Array<[string, string]>, value?: string): HTMLSelectElement => {
    const s = document.createElement("select");
    s.className = "insp-input";
    s.dataset.pxsF = key;
    for (const [v, w] of opts) { const o = document.createElement("option"); o.value = v; o.textContent = w; s.appendChild(o); }
    if (value != null) s.value = value;
    return s;
  };
  const state = select("state", [["", t("pxs.state.none")], ...(["not_yet_drawn", "drawable", "not_drawn_by_choice"] as const)
    .map((s) => [s, t(`pxs.state.${s}`)] as [string, string])], st.declared ?? "not_yet_drawn");
  form.appendChild(field(t("pxs.form.state"), state));
  const ph = document.createElement("textarea");
  ph.className = "insp-input";
  ph.rows = 3;
  ph.dataset.pxsF = "placeholder";
  ph.value = st.placeholder;
  ph.placeholder = t("pxs.form.placeholderHint");
  form.appendChild(field(t("pxs.form.placeholder"), ph));
  const me = currentIdentity();
  const today = new Date().toISOString().slice(0, 10);
  const note = document.createElement("input");
  note.className = "insp-input";
  note.dataset.pxsF = "note";
  note.value = me ? `${[me.name, me.surname].filter(Boolean).join(" ") || me.orcid}, ${today}` : today;
  note.placeholder = t("pxs.form.note");
  form.appendChild(field(t("pxs.form.note"), note));
  const bar = el("div", "insp-actions");
  const ok = btn(t("pxs.form.ok"), { pxsF: "ok" }, undefined, "insp-btn");
  ok.addEventListener("click", () => {
    declareProxyStatus(store, unit, { state: (state.value || null) as PxsState | null, placeholder: ph.value,
      note: st.property ? undefined : note.value });
    opening.delete(unit);
    repaintProxyStatus();
  });
  bar.appendChild(ok);
  form.appendChild(bar);

  // a source by hand: a document (a model inside it), a strength, a note
  const docs = doc.graph.nodes.filter((n) => n.node_type === "document" && isLive(n))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { numeric: true }));
  const srcBox = el("div", "insp-pxs-addsrc");
  srcBox.dataset.pxsAddSource = unit;
  const dsel = select("srcDocument", [["", t("pxs.form.pickDocument")], ...docs.map((d) => [d.id, `${d.name ?? d.id}${d.description ? ` — ${String(d.description).slice(0, 50)}` : ""}`] as [string, string])]);
  const models = doc.graph.nodes.filter((n) => /representation_model/i.test(String(n.node_type)) && isLive(n));
  const msel = select("srcModel", [["", t("pxs.form.noModel")], ...models.map((m) => [m.id, String(m.name ?? m.id)] as [string, string])]);
  const ssel = select("srcStrength", PXS_STRENGTHS.map((s) => [s, t(`pxs.strength.${s}`)] as [string, string]), "probable");
  const snote = document.createElement("input");
  snote.className = "insp-input";
  snote.dataset.pxsF = "srcNote";
  snote.placeholder = t("pxs.form.srcNoteHint");
  const add = btn(t("pxs.form.addSource"), { pxsF: "addSource" }, undefined, "insp-btn");
  const msg = el("p", "insp-hint");
  msg.hidden = true;
  add.addEventListener("click", () => {
    if (!dsel.value) { msg.hidden = false; msg.textContent = t("pxs.form.needDocument"); return; }
    addProxySource(store, unit, { document: dsel.value, model: msel.value || null, strength: ssel.value as PxsStrength, note: snote.value });
    repaintProxyStatus();
  });
  const row = el("div", "insp-obl-side");
  row.append(dsel, msel, ssel);
  srcBox.append(field(t("pxs.form.source"), row), field(t("pxs.form.srcNote"), snote), add, msg);
  form.appendChild(srcBox);
  return form;
}

function scoutBox(store: DocumentStore, unit: string, props: ReturnType<typeof openProposals>, onJump: (id: string) => void): HTMLElement {
  const doc = store.doc;
  const box = el("div", "insp-pxs-scout");
  box.dataset.pxsScout = props.status;
  const bar = el("div", "insp-actions");
  const det = btn(t("pxs.scout.det"), { pxsScout: "scout" }, t("pxs.scout.detTitle"), "insp-btn");
  det.addEventListener("click", () => { void scoutUnit(store, unit, "scout"); });
  const ai = btn(t("pxs.scout.ai"), { pxsScout: "ai" }, t("pxs.scout.aiTitle"), "insp-btn");
  ai.addEventListener("click", () => { void scoutUnit(store, unit, "ai"); });
  bar.append(det, ai);
  box.appendChild(bar);
  if (props.status === "loading") box.appendChild(el("p", "insp-hint", t("pxs.scout.loading")));
  if (props.status === "error") box.appendChild(el("p", "insp-hint", t("pxs.scout.error", { error: props.error ?? "" })));
  if (props.status === "unconfigured") box.appendChild(el("p", "insp-hint", t("pxs.scout.unconfigured")));
  if (props.status === "missing") box.appendChild(el("p", "insp-hint", t("pxs.scout.missing")));
  if (props.status === "ok" && !props.sources.length && !props.placeholders.length) box.appendChild(el("p", "insp-hint", t("pxs.scout.none")));
  for (const p of props.sources) {
    const row = el("div", "insp-pxs-proposal");
    row.dataset.pxsProposal = p.key;
    row.dataset.pxsOrigin = p.origin;
    row.dataset.pxsKind = p.kind ?? "";
    row.append(el("span", "insp-pxs-origin", p.origin === "ai" ? t("pxs.proposal.ai", { model: p.author_ai?.model ?? "" }) : t("pxs.proposal.det")), " ");
    row.appendChild(link(p.document, p.document_name, onJump));
    if (p.model) row.append(" · ", link(p.model, p.model_name ?? docName(doc, p.model), onJump));
    row.append(" ", el("span", `insp-pxs-strength pxs-${p.strength}`, t(`pxs.strength.${p.strength}`)));
    // the reason of a deterministic proposal in the interface's words (the
    // library's `why` is English, for its API); an AI one as the model wrote it
    const reason = p.origin === "derived" && p.kind
      ? t(`pxs.why.${p.kind}`, { doc: p.document_name, model: p.model_name ?? "" })
      : [p.note, p.why].filter((x) => x && x.trim()).join(" — ");
    const why = el("p", "insp-hint", reason);
    const acc = btn(t("pxs.accept"), { pxsAccept: p.key }, undefined, "insp-btn");
    acc.addEventListener("click", () => { acceptProposal(store, p.key); });
    const dis = btn(t("pxs.discard"), { pxsDiscard: p.key });
    dis.addEventListener("click", () => { discardProposal(store, p.key); });
    row.append(" ", acc, " ", dis, why);
    box.appendChild(row);
  }
  for (const p of props.placeholders) {
    const row = el("div", "insp-pxs-proposal");
    row.dataset.pxsProposal = p.key;
    row.dataset.pxsOrigin = "ai";
    row.dataset.pxsKind = "placeholder";
    row.append(el("span", "insp-pxs-origin", t("pxs.proposal.placeholder", { model: p.author_ai?.model ?? "" })), " ",
      el("span", "insp-pxs-placeholder", p.placeholder));
    const acc = btn(t("pxs.acceptPlaceholder"), { pxsAccept: p.key }, undefined, "insp-btn");
    acc.addEventListener("click", () => { acceptProposal(store, p.key); });
    const dis = btn(t("pxs.discard"), { pxsDiscard: p.key });
    dis.addEventListener("click", () => { discardProposal(store, p.key); });
    row.append(" ", acc, " ", dis);
    if (p.why) row.appendChild(el("p", "insp-hint", p.why));
    box.appendChild(row);
  }
  return box;
}
