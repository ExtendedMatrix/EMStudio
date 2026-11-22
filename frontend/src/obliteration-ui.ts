/**
 * MICRO-LG6 (E.D., 22 Nov 2026, 20:30) · the section «Obliterazione» of the
 * Inspector — it replaces «Visibilità» (MICRO-LG5).
 *
 * The OBLITERATION: something that was part of the perceivable configuration
 * of its time stops being so, while it goes on existing. A property that
 * NORMALLY IS NOT THERE, so the section normally TAKES NO SPACE: one line,
 * «+ Annota un'obliterazione…», when nothing is said; the DIARY only when
 * there is something — declared on the unit (own, plain ink) or INHERITED
 * from a container (orange, «ereditata da <contenitore>», a click goes there,
 * «Sovrascrivi qui…» declares the unit's own over it). Between the windows
 * nothing is said: never «in view». Each window carries its paradata in view —
 * who states it, on which source, and what (the extractor's text: the doubts).
 *
 * ONE computation, in s3Dgraphy (CLAUDE.md, invariant 2): the diary —
 * propagation included — is `s3dgraphy.obliteration.obliteration_windows`,
 * its hints of coherence `obliteration_hints` (the physical cover, information
 * only), asked of the bridge (`POST /obliteration`, level 95) like the
 * chronology (`chron-bridge.ts`). What this module writes is a declaration: a
 * PropertyNode `obliteration` (value obliterated · partially_obliterated;
 * `data.valid_from` / `valid_from_latest` / `valid_to_earliest` / `valid_to`,
 * `valid_from_epoch` / `valid_to_epoch`, `valid_from_doubtful` — node
 * datamodel 1.6.54) on the unit or on a container, with its extractor and
 * source, ONE undo step.
 *
 * The obliteration is part of the EM core: on the unit this section is in the
 * community build; on the functional units it is where they exist (the lab).
 */
import { t } from "./i18n";
import { helpGlyph } from "./help-glyph";
import { askConfirm } from "./app-dialog";
import type { DocumentStore } from "./model";
import type { EmDocument, EmNode } from "./types";
import { allowedEdgeTypes, isStratigraphicType } from "./rules";
import { chronologySignature } from "./chron-bridge";
import { addReading } from "./paradata-chain";
import { initialName } from "./naming";
import { currentIdentity } from "./identity";

export const OBL_PROPERTY = "obliteration";
/** the property of MICRO-LG4/LG5, migrated by s3Dgraphy on load */
export const OBL_LEGACY_PROPERTY = "visibility";
export const OBL_STATES = ["obliterated", "partially_obliterated"] as const;
export type OblState = (typeof OBL_STATES)[number];
/** the containers a window declared on them reaches the members of */
export const OBL_CONTAINER_TYPES = new Set(["EpochNode", "ActivityNodeGroup", "TimeBranchNodeGroup", "FunctionalUnitNodeGroup"]);
const MEMBER_EDGE: Record<string, string> = {
  ActivityNodeGroup: "is_in_activity",
  TimeBranchNodeGroup: "is_in_timebranch",
  FunctionalUnitNodeGroup: "is_in_functional_unit",
};

// ── the answer of s3Dgraphy (obliteration_windows, obliteration_hints) ──────

export interface OblParadata { node: string; name: string | null; kind: string | null; description?: string | null; sources: Array<{ node: string; name: string | null }> }
export interface OblOrigin { node: string; name: string | null; kind: string; distance: number; via: string[] }
export interface OblWindow {
  state: string; start: number | null; end: number | null;
  start_scissor: Array<number | null>; end_scissor: Array<number | null>; doubtful_start?: boolean;
  source: string; sources: string[]; level: "own" | "inherited"; levels: string[];
  inherited_from: OblOrigin | null; property_ids: string[]; paradata: OblParadata[];
  start_epoch?: string | null; end_epoch?: string | null;
  parts?: Array<{ state: string; start: number | null; end: number | null; source: string; level?: string;
                  inherited_from?: OblOrigin | null; property_id?: string | null }>;
}
export interface OblConflict {
  kind: string; property_id: string; declared: string; start: number | null; end: number | null;
  other?: string; inherited_from?: OblOrigin; other_inherited_from?: OblOrigin;
}
export interface OblNotReached { container: OblOrigin; property_ids: string[]; state: string; start: number | null; member_start: number | null }
export interface OblHint { kind: string; unit: string; start: number | null; end: number | null; by: string[]; container?: OblOrigin;
                          covers?: string[]; edges?: string[] }
/** the kinds of hint the section says (MICRO-LG8: «not_reached» is gone —
 *  an older s3Dgraphy may still send it, and it is not said) */
const HINT_KINDS = new Set(["declared_uncovered", "covered_undeclared", "obliterating_member"]);
export interface OblDiary {
  unit: string; name: string | null; life: [number | null, number | null];
  windows: OblWindow[]; conflicts: OblConflict[]; warnings: string[];
  /** MICRO-LG8: always empty (the exclusion by date of MICRO-LG6 is gone); read by nobody */
  not_reached?: OblNotReached[];
  containers: Array<OblOrigin & { declares: boolean }>;
}
export type OblStatus = "idle" | "loading" | "ok" | "off" | "error";
export interface OblAnswer { status: OblStatus; diary: OblDiary | null; hints: OblHint[]; error?: string; stale: boolean }

// ── asking the bridge ───────────────────────────────────────────────────────

let resolveBridge: () => Promise<string> = async () => "http://localhost:8765";
export function setObliterationBridgeResolver(fn: () => Promise<string>): void { resolveBridge = fn; }

export function isObliterationProperty(n: EmNode | undefined): boolean {
  if (!n || n.node_type !== "property") return false;
  const d = (n.data ?? {}) as Record<string, unknown>;
  return n.name === OBL_PROPERTY || d.property_type === OBL_PROPERTY
    || n.name === OBL_LEGACY_PROPERTY || d.property_type === OBL_LEGACY_PROPERTY;
}

/** what the diary depends on: the chronology's signature (nodes, edges,
 *  property values, epochs), the data of every obliteration property and the
 *  names and texts of the paradata it shows */
export function obliterationSignature(doc: EmDocument): string {
  const extra: string[] = [];
  for (const n of doc.graph.nodes ?? []) {
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (isObliterationProperty(n)) extra.push(`o|${n.id}|${JSON.stringify(d)}`);
    else if (n.node_type === "extractor" || n.node_type === "combiner" || n.node_type === "document"
             || OBL_CONTAINER_TYPES.has(String(n.node_type)))
      extra.push(`p|${n.id}|${String(n.name ?? "")}|${String(n.description ?? "")}`);
  }
  return chronologySignature(doc) + "\n" + extra.join("\n");
}

const RETRY_MS = 5000;
type Slot = OblAnswer & { sig: string | null; seq: number; at: number };

class Asker {
  sig: string | null = null;
  rev = -1;
  states = new Map<string, Slot>();
  seq = 0;

  signature(store: DocumentStore): string {
    const rev = (store as unknown as { rev?: number }).rev ?? -1;
    if (this.sig == null || rev !== this.rev || rev < 0) { this.sig = obliterationSignature(store.doc); this.rev = rev; }
    return this.sig;
  }

  for(store: DocumentStore, unit: string): OblAnswer {
    const sig = this.signature(store);
    let st = this.states.get(unit);
    if (!st) { st = { status: "idle", diary: null, hints: [], stale: false, sig: null, seq: 0, at: 0 }; this.states.set(unit, st); }
    const retry = st.status === "off" && Date.now() - st.at > RETRY_MS;
    if (st.sig !== sig || retry) {
      st.sig = sig;
      st.at = Date.now();
      if (st.status === "ok") st.stale = true;
      else st.status = "loading";
      void this.ask(store, unit, st);
    }
    return st;
  }

  async ask(store: DocumentStore, unit: string, st: Slot): Promise<void> {
    const mine = ++this.seq;
    st.seq = mine;
    let next: OblAnswer;
    try {
      const body = `{"unit":${JSON.stringify(unit)},"doc":${store.toJSON()}}`;
      const res = await fetch(`${await resolveBridge()}/obliteration`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) {
        let msg = `bridge error ${res.status}`;
        try { const j = await res.json(); if (j?.error) msg = String(j.error); } catch { /* not JSON */ }
        next = { status: "error", diary: null, hints: [], error: msg, stale: false };
      } else {
        const j = (await res.json()) as { diary?: OblDiary; hints?: OblHint[] };
        next = { status: "ok", diary: j.diary ?? null, hints: ((j.hints ?? []) as OblHint[]).filter((h) => HINT_KINDS.has(h.kind)), stale: false };
      }
    } catch {
      next = { status: "off", diary: null, hints: [], stale: false };
    }
    if (st.seq !== mine) return;
    Object.assign(st, next);
    repaintObliteration();
  }
}

const askers = new WeakMap<DocumentStore, Asker>();
function askerOf(store: DocumentStore): Asker {
  let a = askers.get(store);
  if (!a) askers.set(store, (a = new Asker()));
  return a;
}
export function obliterationFor(store: DocumentStore, unit: string): OblAnswer { return askerOf(store).for(store, unit); }

const boxes = new Set<{ box: HTMLElement; paint: () => void }>();
const listeners: Array<() => void> = [];
/** an answer landed: every section still on screen paints again */
export function repaintObliteration(): void {
  for (const b of [...boxes]) { if (!b.box.isConnected) { boxes.delete(b); continue; } b.paint(); }
  for (const fn of listeners) fn();
}
export function onObliterationUpdate(fn: () => void): void { listeners.push(fn); }

// ── reading the document ────────────────────────────────────────────────────

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const nodeOf = (doc: EmDocument, id: string | null | undefined): EmNode | undefined =>
  (id ? doc.graph.nodes.find((n) => n.id === id) : undefined);
const nameOf = (doc: EmDocument, id: string | null | undefined): string => String(nodeOf(doc, id)?.name ?? id ?? "?");
const isLive = (n: EmNode): boolean => {
  const d = (n.data ?? {}) as Record<string, unknown>;
  return !d.removed && !((n as { attributes?: Record<string, unknown> }).attributes?.removed);
};

/** the obliteration properties declared ON a node (its own has_property) */
export function declaredOn(doc: EmDocument, owner: string): EmNode[] {
  const out: EmNode[] = [];
  for (const e of doc.graph.edges) {
    if (e.edge_type !== "has_property" || e.source !== owner) continue;
    const p = nodeOf(doc, e.target);
    if (p && isLive(p) && isObliterationProperty(p)) out.push(p);
  }
  return out;
}

export function epochsOf(doc: EmDocument): Array<{ id: string; name: string; start: number | null; end: number | null }> {
  const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return doc.graph.nodes.filter((n) => n.node_type === "EpochNode" && isLive(n)).map((n) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    return { id: n.id, name: String(n.name ?? n.id), start: num(d.start_time), end: num(d.end_time) };
  }).sort((a, b) => (a.start ?? -Infinity) - (b.start ?? -Infinity) || a.name.localeCompare(b.name));
}

function documentsOf(doc: EmDocument): EmNode[] {
  return doc.graph.nodes.filter((n) => n.node_type === "document" && isLive(n))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { numeric: true }));
}

const fmtYear = (v: number | null | undefined): string => (v == null ? t("oblit.open") : String(Math.round(v * 1000) / 1000));

/** «200», «inizio di Post antiquity», «1979 (fra 1978 e 1979)», «in un momento di Post antiquity (dubbio)» */
function endWords(doc: EmDocument, v: number | null, sc: Array<number | null>, epoch: string | null | undefined,
                  side: "start" | "end", doubtful = false): string {
  const [a, b] = sc ?? [];
  if (doubtful && side === "start") {
    if (epoch) return t("oblit.doubtfulInEpoch", { epoch: nameOf(doc, epoch) });
    if (a != null && b != null && a !== b) return t("oblit.doubtfulBetween", { a: fmtYear(a), b: fmtYear(b) });
    if (a != null) return t("oblit.doubtfulNotBefore", { a: fmtYear(a) });
    return t("oblit.doubtfulUnknown");
  }
  if (epoch) return t(side === "start" ? "oblit.startEpoch" : "oblit.endEpoch", { epoch: nameOf(doc, epoch) });
  const base = fmtYear(v);
  if (v != null && a !== b && (a != null || b != null)) return `${base} (${t("oblit.scissor", { a: fmtYear(a ?? null), b: fmtYear(b ?? null) })})`;
  return base;
}

/** the property's own words of a window (the containers' list) */
function declaredWords(doc: EmDocument, p: EmNode): { state: string; from: string; to: string } {
  const d = (p.data ?? {}) as Record<string, unknown>;
  const num = (x: unknown): number | null => (x == null || x === "" ? null : Number(x));
  const doubtful = !!d.valid_from_doubtful;
  const fromEp = d.valid_from_epoch ? String(d.valid_from_epoch) : null;
  const from = doubtful
    ? endWords(doc, num(d.valid_from), [num(d.valid_from), num(d.valid_from_latest)], fromEp, "start", true)
    : fromEp ? t("oblit.startEpoch", { epoch: nameOf(doc, fromEp) })
    : d.valid_from != null ? endWords(doc, num(d.valid_from), [num(d.valid_from), num(d.valid_from_latest ?? d.valid_from)], null, "start") : t("oblit.open");
  const to = d.valid_to_epoch ? t("oblit.endEpoch", { epoch: nameOf(doc, String(d.valid_to_epoch)) })
    : d.valid_to != null ? endWords(doc, num(d.valid_to), [num(d.valid_to_earliest ?? d.valid_to), num(d.valid_to)], null, "end") : t("oblit.open");
  return { state: String(d.value ?? p.description ?? ""), from, to };
}

const stateWords = (s: string): string => (OBL_STATES.includes(s as OblState) ? t(`oblit.state.${s}`) : s);

// ── writing a declaration ───────────────────────────────────────────────────

export interface OblDeclaration {
  state: OblState;
  from: { mode: "year"; year: number; latest?: number | null } | { mode: "epoch"; epoch: string } | { mode: "open" };
  /** the start is doubtful (data.valid_from_doubtful): inside the epoch, not
   *  before the year, or not known */
  doubtful?: boolean;
  to: { mode: "year"; year: number; earliest?: number | null } | { mode: "epoch"; epoch: string } | { mode: "open" };
  /** the source: an existing document, a new one by name, or none */
  source?: { kind: "document"; id: string } | { kind: "new-document"; name: string } | null;
  /** who states it, and what (the doubts): the extractor's description */
  note?: string;
}

/** may this node hold an obliteration (the datamodel's has_property) */
export function canDeclareOn(n: EmNode | undefined): boolean {
  return !!n && allowedEdgeTypes(n.node_type, "property").includes("has_property");
}

/** the declaration as ONE undo step: the PropertyNode on the owner, its
 *  extractor (who states it: the note, has_author the current identity when
 *  the graph knows it), its source. Returns the property's id. */
export function declareObliteration(store: DocumentStore, owner: string, dec: OblDeclaration): string {
  const ownerNode = store.node(owner);
  if (!canDeclareOn(ownerNode)) throw new Error(`a ${ownerNode?.node_type ?? "?"} cannot hold a property`);
  const data: Record<string, unknown> = { property_type: OBL_PROPERTY, value: dec.state };
  if (dec.from.mode === "year") {
    data.valid_from = dec.from.year;
    if (dec.from.latest != null && dec.from.latest !== dec.from.year) data.valid_from_latest = dec.from.latest;
  } else if (dec.from.mode === "epoch") data.valid_from_epoch = dec.from.epoch;
  if (dec.doubtful) data.valid_from_doubtful = true;
  if (dec.to.mode === "year") {
    data.valid_to = dec.to.year;
    if (dec.to.earliest != null && dec.to.earliest !== dec.to.year) data.valid_to_earliest = dec.to.earliest;
  } else if (dec.to.mode === "epoch") data.valid_to_epoch = dec.to.epoch;
  return store.batch(() => {
    const pid = store.newId();
    const pos = (store.doc.layout as { positions?: Record<string, { x: number; y: number }> } | undefined)?.positions?.[owner];
    store.addNode({ id: pid, node_type: "property", name: OBL_PROPERTY, description: dec.state, data } as EmNode,
      pos ? { x: pos.x + 30, y: pos.y + 60, w: 160, h: 40 } : undefined);
    store.addEdge(owner, pid, "has_property");
    const note = (dec.note ?? "").trim();
    let extractorId: string | null = null;
    if (dec.source && dec.source.kind === "document") {
      extractorId = addReading(store, pid, { kind: "document", id: dec.source.id }, { description: note }).extractorId;
    } else if (dec.source && dec.source.kind === "new-document") {
      extractorId = addReading(store, pid, { kind: "new-document", name: dec.source.name }, { description: note }).extractorId;
    } else if (note) {
      extractorId = store.newId();
      store.addNode({ id: extractorId, node_type: "extractor", name: initialName(store.doc, "extractor") ?? "Temp1",
        description: note } as EmNode);
      store.addEdge(pid, extractorId, "has_data_provenance");
    }
    const me = currentIdentity();
    if (extractorId && me) {
      const author = store.doc.graph.nodes.find((n) => (n.node_type === "author")
        && String(((n.data ?? {}) as Record<string, unknown>).orcid ?? "") === me.orcid);
      if (author && allowedEdgeTypes("extractor", "author").includes("has_author") && !store.hasEdge(extractorId, author.id, "has_author"))
        store.addEdge(extractorId, author.id, "has_author");
    }
    return pid;
  });
}

// ── drawing ─────────────────────────────────────────────────────────────────

/** the section «Obliterazione» for a unit or a container, or nothing */
export function renderObliteration(root: HTMLElement, store: DocumentStore, id: string, onJump: (id: string) => void): void {
  const n = store.node(id);
  if (!n) return;
  const unit = isStratigraphicType(n.node_type) && n.node_type !== "BR" && n.node_type !== "SE";
  const container = OBL_CONTAINER_TYPES.has(String(n.node_type));
  if (!unit && !container) return;
  const host = el("div", "insp-obliteration-host");
  root.appendChild(host);
  const paint = (): void => {
    host.replaceChildren();
    if (unit) paintUnit(host, store, id, onJump);
    else paintContainer(host, store, id, onJump);
  };
  boxes.add({ box: host, paint });
  paint();
}

/** the head and the box of the full section (only when something is said) */
function section(host: HTMLElement, id: string, kind: "unit" | "container"): HTMLElement {
  const h = el("h3", "insp-sect", t("oblit.sect"));
  h.dataset.sect = "obliteration";
  h.append(" ", helpGlyph(t("oblit.help"), "obliteration"));
  host.appendChild(h);
  const box = el("div", "insp-propagative insp-obliteration");
  box.dataset.oblSect = id;
  box.dataset.oblKind = kind;
  host.appendChild(box);
  return box;
}

/** the nodes whose form was opened from the empty line (kept open across a
 *  repaint, until declared or cancelled) */
const opening = new Set<string>();

/** the form opened from the empty line, in a full section */
function openedForm(host: HTMLElement, store: DocumentStore, id: string, kind: "unit" | "container"): void {
  const box = section(host, id, kind);
  box.appendChild(declareBar(store, id, null, true, () => { opening.delete(id); repaintObliteration(); }));
}

/** the ONE line when nothing is said: «+ Annota un'obliterazione…» */
function emptyLine(host: HTMLElement, store: DocumentStore, id: string, kind: "unit" | "container", hints: OblHint[]): void {
  if (opening.has(id)) { openedForm(host, store, id, kind); return; }
  const line = el("div", "insp-obliteration insp-obl-empty");
  line.dataset.oblSect = id;
  line.dataset.oblKind = kind;
  line.dataset.oblEmpty = "1";
  if (hints.length) {
    // the hints take no space either: said in the title, counted in data
    line.dataset.oblHints = String(hints.length);
    line.title = hints.map((h) => hintWords(store.doc, h)).join("\n");
  }
  if (!canDeclareOn(store.node(id))) return;
  const b = el("button", "insp-btn insp-btn-quiet", t("oblit.annotate")) as HTMLButtonElement;
  b.type = "button";
  b.dataset.oblDeclare = id;
  b.addEventListener("click", () => {
    opening.add(id);
    host.replaceChildren();
    openedForm(host, store, id, kind);
  });
  line.appendChild(b);
  host.appendChild(line);
}

function link(target: string, words: string, onJump: (id: string) => void, cls = "insp-prov-from insp-link"): HTMLElement {
  const b = el("button", cls, words) as HTMLButtonElement;
  b.type = "button";
  b.dataset.go = target;
  b.addEventListener("click", () => onJump(target));
  return b;
}

function paradataLine(doc: EmDocument, w: { paradata: OblParadata[] }, onJump: (id: string) => void): HTMLElement {
  const line = el("div", "insp-obl-pd");
  line.dataset.oblParadata = "";
  if (!w.paradata.length) { line.textContent = t("oblit.noParadata"); return line; }
  w.paradata.forEach((p, i) => {
    if (i) line.append(" · ");
    line.append(`${t("oblit.who")} `, link(p.node, p.name ?? nameOf(doc, p.node), onJump));
    if (p.sources.length) {
      line.append(` ${t("oblit.onSource")} `);
      p.sources.forEach((s, j) => { if (j) line.append(", "); line.append(link(s.node, s.name ?? nameOf(doc, s.node), onJump)); });
    }
    const said = (p.description ?? String(nodeOf(doc, p.node)?.description ?? "")).trim();
    if (said) {
      const q = el("q", "insp-obl-said", said);
      q.dataset.oblSaid = p.node;
      line.append(": ", q);
    }
  });
  return line;
}

function hintWords(doc: EmDocument, h: OblHint): string {
  const vars = { from: fmtYear(h.start), to: fmtYear(h.end), by: h.by.map((b) => nameOf(doc, b)).join(", "),
                 node: h.container ? (h.container.name ?? nameOf(doc, h.container.node)) : "",
                 covers: (h.covers ?? []).map((c) => nameOf(doc, c)).join(", ") };
  return t(`oblit.hint.${h.kind}`, vars);
}

function paintUnit(host: HTMLElement, store: DocumentStore, id: string, onJump: (id: string) => void): void {
  const doc = store.doc;
  const st = obliterationFor(store, id);
  const d = st.diary;
  const own = declaredOn(doc, id).length > 0;
  const something = own || !!(d && (d.windows.length || d.conflicts.length));
  if (!something) {
    emptyLine(host, store, id, "unit", st.hints);
    const line = host.querySelector<HTMLElement>("[data-obl-empty]");
    if (line) { line.dataset.oblStatus = st.status; if (st.stale) line.dataset.oblStale = "1"; }
    return;
  }
  const box = section(host, id, "unit");
  box.dataset.oblStatus = st.status;
  if (st.stale) box.dataset.oblStale = "1";
  if (st.status === "loading" || st.status === "idle") box.appendChild(el("p", "insp-hint", t("oblit.loading")));
  else if (st.status === "off") box.appendChild(el("p", "insp-hint", t("oblit.off")));
  else if (st.status === "error") box.appendChild(el("p", "insp-hint", t("oblit.error", { error: st.error ?? "" })));
  if (d) {
    const list = el("div", "insp-obl-list");
    for (const w of d.windows) list.appendChild(windowRow(store, id, w, onJump));
    box.appendChild(list);
    if (d.windows.length) box.appendChild(el("p", "insp-hint insp-obl-between", t("oblit.between")));
    if (d.conflicts.length) {
      const c = el("div", "insp-obl-conflicts");
      c.appendChild(el("div", "insp-hint", t("oblit.conflicts")));
      for (const k of d.conflicts) {
        const p = el("p", "insp-hint insp-prov-contra", conflictWords(doc, k));
        p.dataset.oblConflict = k.kind;
        c.appendChild(p);
      }
      box.appendChild(c);
    }
    for (const w of d.warnings) box.appendChild(el("p", "insp-hint", w));
  }
  if (st.hints.length) {
    const c = el("div", "insp-obl-hints");
    c.appendChild(el("div", "insp-hint", t("oblit.hints")));
    for (const h of st.hints) {
      const p = el("p", "insp-hint insp-obl-hint", hintWords(doc, h));
      p.dataset.oblHint = h.kind;
      c.appendChild(p);
    }
    box.appendChild(c);
  }
  box.appendChild(declareBar(store, id, null));
}

function windowRow(store: DocumentStore, unit: string, w: OblWindow, onJump: (id: string) => void): HTMLElement {
  const doc = store.doc;
  const level = w.level ?? "own";
  const row = el("div", `insp-prop-row insp-obl-row${level === "own" ? " insp-prop-own" : " insp-prov-inherited"}`);
  row.dataset.oblWindow = "";
  row.dataset.state = w.state;
  row.dataset.level = level;
  row.dataset.source = w.source;
  row.dataset.from = w.start == null ? "" : String(w.start);
  row.dataset.to = w.end == null ? "" : String(w.end);
  if (w.doubtful_start) row.dataset.doubtful = "1";
  if (w.inherited_from) row.dataset.origin = w.inherited_from.node;
  const st = el("span", "insp-prop-rule insp-obl-state", stateWords(w.state));
  st.dataset.oblState = w.state;
  row.appendChild(st);
  const span = `${endWords(doc, w.start, w.start_scissor, w.start_epoch, "start", !!w.doubtful_start)} – ${endWords(doc, w.end, w.end_scissor, w.end_epoch, "end")}`;
  row.appendChild(el("span", "insp-prop-value insp-obl-span", span));
  const src = el("span", "insp-prov-src insp-obl-src");
  if (level === "inherited" && w.inherited_from) {
    const o = w.inherited_from;
    src.append(link(o.node, t("oblit.inheritedFrom", { node: o.name ?? nameOf(doc, o.node) }), onJump));
    src.append(` (${t(`oblit.kind.${o.kind}`)})`);
    if (o.via.length > 1) src.append(` · ${t("oblit.via", { nodes: o.via.slice(0, -1).map((v) => nameOf(doc, v)).join(" › ") })}`);
    src.append(` · ${t(`oblit.src.${w.source}`)}`);
  } else src.append(t(`oblit.src.${w.source}`));
  const others = (w.levels ?? []).filter((l) => l !== level);
  if (others.length) {
    row.dataset.levels = (w.levels ?? []).join(" ");
    src.append(` · ${t("oblit.merged", { levels: others.map((l) => t(`oblit.level.${l}`)).join(", ") })}`);
  }
  row.appendChild(src);
  row.appendChild(paradataLine(doc, w, onJump));
  if (level === "inherited") {
    const b = el("button", "insp-btn insp-prov-own", t("oblit.override")) as HTMLButtonElement;
    b.type = "button";
    b.dataset.oblOverride = w.inherited_from?.node ?? "";
    b.title = t("oblit.overrideTitle");
    b.addEventListener("click", () => {
      const host = row.closest<HTMLElement>(".insp-obliteration");
      const bar = host?.querySelector<HTMLElement>("[data-obl-declare-bar]");
      if (bar) bar.replaceWith(declareBar(store, unit, w, true));
    });
    row.appendChild(b);
  } else {
    const own = (w.parts?.length ? w.parts.filter((p) => (p.level ?? "own") === "own").map((p) => p.property_id) : w.property_ids)
      .filter((x): x is string => !!x && declaredOn(doc, unit).some((p) => p.id === x));
    for (const pid of own) row.appendChild(removeButton(store, unit, pid, w.state));
  }
  return row;
}

function removeButton(store: DocumentStore, owner: string, pid: string, state: string): HTMLElement {
  const b = el("button", "insp-btn", t("oblit.remove")) as HTMLButtonElement;
  b.type = "button";
  b.dataset.oblRemove = pid;
  b.addEventListener("click", () => {
    void askConfirm(t("oblit.removeAsk", { state: stateWords(state), node: nameOf(store.doc, owner) }), { kind: "obliteration-remove", ok: t("oblit.remove") })
      .then((yes) => { if (yes) store.batch(() => store.deleteNode(pid)); });
  });
  return b;
}

function conflictWords(doc: EmDocument, c: OblConflict): string {
  const vars = {
    from: fmtYear(c.start), to: fmtYear(c.end), declared: stateWords(c.declared), other: stateWords(c.other ?? ""),
    node: c.inherited_from ? (c.inherited_from.name ?? nameOf(doc, c.inherited_from.node)) : "",
    other_node: c.other_inherited_from ? (c.other_inherited_from.name ?? nameOf(doc, c.other_inherited_from.node)) : "",
  };
  return t(`oblit.conflict.${c.kind}`, vars);
}

function paintContainer(host: HTMLElement, store: DocumentStore, id: string, onJump: (id: string) => void): void {
  const doc = store.doc;
  const n = store.node(id)!;
  const props = declaredOn(doc, id);
  if (!props.length) { emptyLine(host, store, id, "container", []); return; }
  const box = section(host, id, "container");
  const reach = n.node_type === "EpochNode" ? t("oblit.containerEpoch")
    : t("oblit.container", { n: String(doc.graph.edges.filter((e) => e.edge_type === MEMBER_EDGE[n.node_type] && e.target === id).length) });
  box.appendChild(el("p", "insp-hint", reach));
  for (const p of props) {
    const w = declaredWords(doc, p);
    const row = el("div", "insp-prop-row insp-obl-row insp-prop-own");
    row.dataset.oblDeclared = p.id;
    row.dataset.state = w.state;
    if (((p.data ?? {}) as Record<string, unknown>).valid_from_doubtful) row.dataset.doubtful = "1";
    row.append(el("span", "insp-prop-rule insp-obl-state", stateWords(w.state)), el("span", "insp-prop-value insp-obl-span", `${w.from} – ${w.to}`));
    const pd: OblParadata[] = [];
    for (const e of doc.graph.edges) {
      if (e.edge_type !== "has_data_provenance" || e.source !== p.id) continue;
      const sources = doc.graph.edges.filter((x) => x.edge_type === "extracted_from" && x.source === e.target)
        .map((x) => ({ node: x.target, name: nameOf(doc, x.target) }));
      const x = nodeOf(doc, e.target);
      pd.push({ node: e.target, name: nameOf(doc, e.target), kind: String(x?.node_type ?? ""), description: String(x?.description ?? ""), sources });
    }
    row.appendChild(paradataLine(doc, { paradata: pd }, onJump));
    row.appendChild(removeButton(store, id, p.id, w.state));
    box.appendChild(row);
  }
  box.appendChild(declareBar(store, id, null));
}

/** «Annota un'obliterazione…»: the button, or the form open (prefilled by the
 *  inherited window being overridden) */
function declareBar(store: DocumentStore, owner: string, from: OblWindow | null, open = false, onClose?: () => void): HTMLElement {
  const bar = el("div", "insp-actions insp-obl-declare");
  bar.dataset.oblDeclareBar = "";
  const n = store.node(owner);
  if (!canDeclareOn(n)) {
    bar.appendChild(el("p", "insp-hint", t("oblit.form.notAllowed", { type: String(n?.node_type ?? "?") })));
    return bar;
  }
  if (!open) {
    const b = el("button", "insp-btn", t("oblit.declare")) as HTMLButtonElement;
    b.type = "button";
    b.dataset.oblDeclare = owner;
    b.addEventListener("click", () => bar.replaceWith(declareBar(store, owner, null, true)));
    bar.appendChild(b);
    return bar;
  }
  bar.appendChild(declareForm(store, owner, from, () => {
    if (onClose) onClose();
    else bar.replaceWith(declareBar(store, owner, null));
  }));
  return bar;
}

function declareForm(store: DocumentStore, owner: string, from: OblWindow | null, close: () => void): HTMLElement {
  const doc = store.doc;
  const form = el("div", "insp-obl-form");
  form.dataset.oblForm = owner;
  if (from?.inherited_from) form.dataset.oblOverriding = from.inherited_from.node;
  const field = (label: string, input: HTMLElement): HTMLElement => {
    const l = el("label", "insp-obl-field");
    l.append(el("span", "insp-obl-label", label), input);
    return l;
  };
  const select = (key: string, opts: Array<[string, string]>, value?: string): HTMLSelectElement => {
    const s = document.createElement("select");
    s.className = "insp-input";
    s.dataset.oblF = key;
    for (const [v, w] of opts) { const o = document.createElement("option"); o.value = v; o.textContent = w; s.appendChild(o); }
    if (value != null) s.value = value;
    return s;
  };
  const input = (key: string, value = "", ph = ""): HTMLInputElement => {
    const i = document.createElement("input");
    i.className = "insp-input";
    i.dataset.oblF = key;
    i.value = value;
    i.placeholder = ph;
    return i;
  };
  const epochs = epochsOf(doc).map((e) => [e.id, `${e.name}${e.start != null || e.end != null ? ` (${fmtYear(e.start)}–${fmtYear(e.end)})` : ""}`] as [string, string]);
  const modes: Array<[string, string]> = [["year", t("oblit.form.mode.year")], ["epoch", t("oblit.form.mode.epoch")], ["open", t("oblit.form.mode.open")]];
  const yr = (v: number | null | undefined): string => (v == null ? "" : String(v));

  const state = select("state", OBL_STATES.map((s) => [s, t(`oblit.state.${s}`)] as [string, string]), from?.state ?? "obliterated");
  form.appendChild(field(t("oblit.form.state"), state));

  const side = (key: "from" | "to", w: OblWindow | null): { mode: HTMLSelectElement; year: HTMLInputElement; other: HTMLInputElement; epoch: HTMLSelectElement; row: HTMLElement } => {
    const ep = key === "from" ? w?.start_epoch : w?.end_epoch;
    const v = key === "from" ? w?.start : w?.end;
    const sc = key === "from" ? w?.start_scissor : w?.end_scissor;
    const mode = select(`${key}Mode`, modes, ep ? "epoch" : v != null ? "year" : "open");
    const year = input(key, yr(v), t("oblit.form.mode.year"));
    const other = input(key === "from" ? "fromLatest" : "toEarliest",
      sc && v != null && !(key === "from" && w?.doubtful_start) ? yr(key === "from" ? (sc[1] !== v ? sc[1] : null) : (sc[0] !== v ? sc[0] : null)) : "",
      t(key === "from" ? "oblit.form.latest" : "oblit.form.earliest"));
    const epoch = select(`${key}Epoch`, epochs, ep ?? epochs[0]?.[0]);
    const row = el("div", "insp-obl-side");
    row.append(mode, year, other, epoch);
    const sync = (): void => {
      year.hidden = other.hidden = mode.value !== "year";
      epoch.hidden = mode.value !== "epoch";
    };
    mode.addEventListener("change", sync);
    sync();
    form.appendChild(field(t(key === "from" ? "oblit.form.from" : "oblit.form.to"), row));
    return { mode, year, other, epoch, row };
  };
  const f = side("from", from);
  // the doubtful start: inside the epoch, not before the year, or not known
  const doubt = document.createElement("input");
  doubt.type = "checkbox";
  doubt.dataset.oblF = "doubtful";
  doubt.checked = from ? !!from.doubtful_start : true;
  const doubtLabel = el("label", "insp-obl-doubt");
  doubtLabel.append(doubt, " ", t("oblit.form.doubtful"));
  doubtLabel.title = t("oblit.form.doubtfulTitle");
  f.row.appendChild(doubtLabel);
  const to = side("to", from);

  const docs = documentsOf(doc);
  const src = select("source", [["", t("oblit.form.noSource")], ["__new__", t("oblit.form.newSource")],
    ...docs.map((d) => [d.id, String(d.name ?? d.id)] as [string, string])]);
  const newName = input("newSource", "", t("oblit.form.newSourceName"));
  newName.hidden = true;
  src.addEventListener("change", () => { newName.hidden = src.value !== "__new__"; });
  const srcBox = el("div", "insp-obl-side");
  srcBox.append(src, newName);
  form.appendChild(field(t("oblit.form.source"), srcBox));

  const me = currentIdentity();
  const today = new Date().toISOString().slice(0, 10);
  const note = input("note", me ? `${[me.name, me.surname].filter(Boolean).join(" ") || me.orcid}, ${today}` : today, t("oblit.form.note"));
  form.appendChild(field(t("oblit.form.note"), note));

  const msg = el("p", "insp-hint insp-obl-msg");
  msg.hidden = true;
  form.appendChild(msg);
  const bar = el("div", "insp-actions");
  const ok = el("button", "insp-btn", t("oblit.form.ok")) as HTMLButtonElement;
  ok.type = "button";
  ok.dataset.oblF = "ok";
  const cancel = el("button", "insp-btn", t("oblit.form.cancel")) as HTMLButtonElement;
  cancel.type = "button";
  cancel.dataset.oblF = "cancel";
  cancel.addEventListener("click", close);
  ok.addEventListener("click", () => {
    const num = (s: string): number | null => (s.trim() === "" ? null : Number(s.trim()));
    const end = (s: typeof f, which: "from" | "to"): OblDeclaration["from"] | OblDeclaration["to"] | null => {
      if (s.mode.value === "open") return { mode: "open" };
      if (s.mode.value === "epoch") return s.epoch.value ? { mode: "epoch", epoch: s.epoch.value } : null;
      const y = num(s.year.value), o = num(s.other.value);
      if (y == null || !Number.isFinite(y) || (o != null && !Number.isFinite(o))) return null;
      if (which === "from") return o != null && o < y ? null : { mode: "year", year: y, latest: o };
      return o != null && o > y ? null : { mode: "year", year: y, earliest: o };
    };
    const a = end(f, "from"), b = end(to as typeof f, "to");
    const bad = !a || !b || (a.mode === "year" && b.mode === "year" && a.year > b.year);
    if (bad) { msg.hidden = false; msg.textContent = t("oblit.form.bad"); return; }
    const source: OblDeclaration["source"] = src.value === "__new__"
      ? { kind: "new-document", name: newName.value.trim() } : src.value ? { kind: "document", id: src.value } : null;
    declareObliteration(store, owner, { state: state.value as OblState, from: a as OblDeclaration["from"], doubtful: doubt.checked,
      to: b as OblDeclaration["to"], source, note: note.value });
    close();
  });
  bar.append(ok, cancel);
  form.appendChild(bar);
  return form;
}
