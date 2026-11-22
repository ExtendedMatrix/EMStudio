/**
 * MICRO-LG5 (E.D., 22 Nov 2026, 17:00) · the section «Visibilità» of the
 * Inspector — the DIARY of a unit: when it was in view, buried, partly in view.
 *
 * As the author (`provenance-ui.ts`, MICRO-A-PROPRIO-EREDITATO): every window
 * says WHOSE it is — declared on the unit (own, plain ink), INHERITED from a
 * container (orange, «ereditata da <contenitore>», a click goes there, and
 * «Sovrascrivi qui…» declares a window of the unit's own over it), or DERIVED
 * from the stratigraphy (the units that cover or cut it). Each declared or
 * inherited window carries its paradata: who states it (the extractor) and on
 * which source; an inherited one keeps the container's — who declared it there
 * stays its author.
 *
 * ONE computation, in s3Dgraphy (CLAUDE.md, invariant 2): the diary —
 * propagation included — is `s3dgraphy.visibility.visibility_windows`, asked
 * of the bridge (`POST /visibility`, level 94) like the chronology
 * (`chron-bridge.ts`); this module computes nothing of it. What it writes is
 * a declaration: a PropertyNode `visibility` (value exposed · buried ·
 * partially_exposed; `data.valid_from` / `valid_from_latest` /
 * `valid_to_earliest` / `valid_to`, or `valid_from_epoch` / `valid_to_epoch`,
 * node datamodel 1.6.53) on the unit or on a container (an epoch, an
 * activity, a time branch, a functional unit — connections 1.6.59), with its
 * extractor and source, ONE undo step.
 *
 * Visibility is part of the EM core, not of the functional part: this section
 * is in the community build (not under embargo).
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

export const VIS_PROPERTY = "visibility";
export const VIS_STATES = ["exposed", "buried", "partially_exposed"] as const;
export type VisState = (typeof VIS_STATES)[number];
/** the containers a window declared on them reaches the members of */
export const VIS_CONTAINER_TYPES = new Set(["EpochNode", "ActivityNodeGroup", "TimeBranchNodeGroup", "FunctionalUnitNodeGroup"]);
const MEMBER_EDGE: Record<string, string> = {
  ActivityNodeGroup: "is_in_activity",
  TimeBranchNodeGroup: "is_in_timebranch",
  FunctionalUnitNodeGroup: "is_in_functional_unit",
};

// ── the answer of s3Dgraphy (visibility_windows) ────────────────────────────

export interface VisParadata { node: string; name: string | null; kind: string | null; sources: Array<{ node: string; name: string | null }> }
export interface VisOrigin { node: string; name: string | null; kind: string; distance: number; via: string[] }
export interface VisWindow {
  state: string; start: number | null; end: number | null;
  start_scissor: Array<number | null>; end_scissor: Array<number | null>;
  source: string; sources: string[]; level: "own" | "inherited" | "derived"; levels: string[];
  inherited_from: VisOrigin | null; by: string[]; property_ids: string[]; paradata: VisParadata[];
  start_epoch?: string | null; end_epoch?: string | null;
  parts?: Array<{ state: string; start: number | null; end: number | null; source: string; level?: string;
                  inherited_from?: VisOrigin | null; property_id?: string | null; start_epoch?: string | null; end_epoch?: string | null }>;
}
export interface VisConflict {
  kind: string; property_id: string; declared: string; derived: string | null; start: number | null; end: number | null;
  by: string[]; other?: string; inherited_from?: VisOrigin; other_inherited_from?: VisOrigin;
}
export interface VisDiary {
  unit: string; name: string | null; life: [number | null, number | null]; status: string;
  windows: VisWindow[]; conflicts: VisConflict[]; warnings: string[];
  containers: Array<VisOrigin & { declares: boolean }>;
}
export type VisStatus = "idle" | "loading" | "ok" | "off" | "error";
export interface VisState2 { status: VisStatus; diary: VisDiary | null; error?: string; stale: boolean }

// ── asking the bridge ───────────────────────────────────────────────────────

let resolveBridge: () => Promise<string> = async () => "http://localhost:8765";
export function setVisibilityBridgeResolver(fn: () => Promise<string>): void { resolveBridge = fn; }

/** what the diary depends on: the chronology's signature (nodes, edges,
 *  property values, epochs) and the data of every visibility property and the
 *  names of the paradata it shows */
export function visibilitySignature(doc: EmDocument): string {
  const extra: string[] = [];
  for (const n of doc.graph.nodes ?? []) {
    const d = (n.data ?? {}) as Record<string, unknown>;
    if ((n.node_type === "property" && (n.name === VIS_PROPERTY || d.property_type === VIS_PROPERTY)))
      extra.push(`v|${n.id}|${JSON.stringify(d)}`);
    else if (n.node_type === "extractor" || n.node_type === "combiner" || n.node_type === "document"
             || VIS_CONTAINER_TYPES.has(String(n.node_type)))
      extra.push(`p|${n.id}|${String(n.name ?? "")}`);
  }
  return chronologySignature(doc) + "\n" + extra.join("\n");
}

const RETRY_MS = 5000;

class Asker {
  sig: string | null = null;
  rev = -1;
  states = new Map<string, VisState2 & { sig: string | null; seq: number; at: number }>();
  seq = 0;

  signature(store: DocumentStore): string {
    const rev = (store as unknown as { rev?: number }).rev ?? -1;
    if (this.sig == null || rev !== this.rev || rev < 0) { this.sig = visibilitySignature(store.doc); this.rev = rev; }
    return this.sig;
  }

  for(store: DocumentStore, unit: string): VisState2 {
    const sig = this.signature(store);
    let st = this.states.get(unit);
    if (!st) { st = { status: "idle", diary: null, stale: false, sig: null, seq: 0, at: 0 }; this.states.set(unit, st); }
    // an unreachable bridge is tried again after a while (RETRY_MS)
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

  async ask(store: DocumentStore, unit: string, st: VisState2 & { sig: string | null; seq: number; at: number }): Promise<void> {
    const mine = ++this.seq;
    st.seq = mine;
    let next: VisState2;
    try {
      const body = `{"unit":${JSON.stringify(unit)},"doc":${store.toJSON()}}`;
      const res = await fetch(`${await resolveBridge()}/visibility`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) {
        let msg = `bridge error ${res.status}`;
        try { const j = await res.json(); if (j?.error) msg = String(j.error); } catch { /* not JSON */ }
        next = { status: "error", diary: null, error: msg, stale: false };
      } else {
        const j = (await res.json()) as { diary?: VisDiary };
        next = { status: "ok", diary: j.diary ?? null, stale: false };
      }
    } catch {
      next = { status: "off", diary: null, stale: false };
    }
    if (st.seq !== mine) return;
    Object.assign(st, next);
    repaintVisibility();
  }
}

const askers = new WeakMap<DocumentStore, Asker>();
function askerOf(store: DocumentStore): Asker {
  let a = askers.get(store);
  if (!a) askers.set(store, (a = new Asker()));
  return a;
}
export function visibilityFor(store: DocumentStore, unit: string): VisState2 { return askerOf(store).for(store, unit); }

const boxes = new Set<{ box: HTMLElement; paint: () => void }>();
const listeners: Array<() => void> = [];
/** an answer landed: every section still on screen paints again */
export function repaintVisibility(): void {
  for (const b of [...boxes]) { if (!b.box.isConnected) { boxes.delete(b); continue; } b.paint(); }
  for (const fn of listeners) fn();
}
export function onVisibilityUpdate(fn: () => void): void { listeners.push(fn); }

// ── reading the document (for the form and the containers) ──────────────────

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

export function isVisibilityProperty(n: EmNode | undefined): boolean {
  if (!n || n.node_type !== "property") return false;
  const d = (n.data ?? {}) as Record<string, unknown>;
  return n.name === VIS_PROPERTY || d.property_type === VIS_PROPERTY;
}

/** the visibility properties declared ON a node (its own has_property) */
export function declaredOn(doc: EmDocument, owner: string): EmNode[] {
  const out: EmNode[] = [];
  for (const e of doc.graph.edges) {
    if (e.edge_type !== "has_property" || e.source !== owner) continue;
    const p = nodeOf(doc, e.target);
    if (p && isLive(p) && isVisibilityProperty(p)) out.push(p);
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

const fmtYear = (v: number | null | undefined): string => (v == null ? t("visib.open") : String(Math.round(v * 1000) / 1000));

/** «200», «inizio di Post antiquity», «1979 (fra 1978 e 1979)», «aperto» */
function endWords(doc: EmDocument, v: number | null, sc: Array<number | null>, epoch: string | null | undefined, side: "start" | "end"): string {
  if (epoch) return t(side === "start" ? "visib.startEpoch" : "visib.endEpoch", { epoch: nameOf(doc, epoch) });
  const base = fmtYear(v);
  const [a, b] = sc ?? [];
  if (v != null && a !== b && (a != null || b != null)) return `${base} (${t("visib.scissor", { a: fmtYear(a ?? null), b: fmtYear(b ?? null) })})`;
  return base;
}

/** the property's own words of a window (for the form prefilled, and the
 *  containers' list) */
function declaredWords(doc: EmDocument, p: EmNode): { state: string; from: string; to: string } {
  const d = (p.data ?? {}) as Record<string, unknown>;
  const num = (x: unknown): number | null => (x == null || x === "" ? null : Number(x));
  const from = d.valid_from_epoch ? t("visib.startEpoch", { epoch: nameOf(doc, String(d.valid_from_epoch)) })
    : d.valid_from != null ? endWords(doc, num(d.valid_from), [num(d.valid_from), num(d.valid_from_latest ?? d.valid_from)], null, "start") : t("visib.open");
  const to = d.valid_to_epoch ? t("visib.endEpoch", { epoch: nameOf(doc, String(d.valid_to_epoch)) })
    : d.valid_to != null ? endWords(doc, num(d.valid_to), [num(d.valid_to_earliest ?? d.valid_to), num(d.valid_to)], null, "end") : t("visib.open");
  return { state: String(d.value ?? p.description ?? ""), from, to };
}

const stateWords = (s: string): string => (VIS_STATES.includes(s as VisState) ? t(`visib.state.${s}`) : s);

// ── writing a declaration ───────────────────────────────────────────────────

export interface VisDeclaration {
  state: VisState;
  from: { mode: "year"; year: number; latest?: number | null } | { mode: "epoch"; epoch: string } | { mode: "open" };
  to: { mode: "year"; year: number; earliest?: number | null } | { mode: "epoch"; epoch: string } | { mode: "open" };
  /** the source: an existing document, a new one by name, or none */
  source?: { kind: "document"; id: string } | { kind: "new-document"; name: string } | null;
  /** who states it, and what: the extractor's description */
  note?: string;
}

/** may this node hold a visibility (the datamodel's has_property) */
export function canDeclareOn(n: EmNode | undefined): boolean {
  return !!n && allowedEdgeTypes(n.node_type, "property").includes("has_property");
}

/** the declaration as ONE undo step: the PropertyNode on the owner, its
 *  extractor (who states it: the note, has_author the current identity when
 *  the graph knows it), its source. Returns the property's id. */
export function declareVisibility(store: DocumentStore, owner: string, dec: VisDeclaration): string {
  const ownerNode = store.node(owner);
  if (!canDeclareOn(ownerNode)) throw new Error(`a ${ownerNode?.node_type ?? "?"} cannot hold a property`);
  const data: Record<string, unknown> = { property_type: VIS_PROPERTY, value: dec.state };
  if (dec.from.mode === "year") {
    data.valid_from = dec.from.year;
    if (dec.from.latest != null && dec.from.latest !== dec.from.year) data.valid_from_latest = dec.from.latest;
  } else if (dec.from.mode === "epoch") data.valid_from_epoch = dec.from.epoch;
  if (dec.to.mode === "year") {
    data.valid_to = dec.to.year;
    if (dec.to.earliest != null && dec.to.earliest !== dec.to.year) data.valid_to_earliest = dec.to.earliest;
  } else if (dec.to.mode === "epoch") data.valid_to_epoch = dec.to.epoch;
  return store.batch(() => {
    const pid = store.newId();
    const pos = (store.doc.layout as { positions?: Record<string, { x: number; y: number }> } | undefined)?.positions?.[owner];
    store.addNode({ id: pid, node_type: "property", name: VIS_PROPERTY, description: dec.state, data } as EmNode,
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
    // who states it: the current identity, when the graph has its author node
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

/** the section «Visibilità» for a unit or a container, or nothing */
export function renderVisibility(root: HTMLElement, store: DocumentStore, id: string, onJump: (id: string) => void): void {
  const n = store.node(id);
  if (!n) return;
  const unit = isStratigraphicType(n.node_type) && n.node_type !== "BR" && n.node_type !== "SE";
  const container = VIS_CONTAINER_TYPES.has(String(n.node_type));
  if (!unit && !container) return;
  const h = el("h3", "insp-sect", t("visib.sect"));
  h.dataset.sect = "visibility";
  h.append(" ", helpGlyph(t("visib.help"), "visibility"));
  root.appendChild(h);
  const box = el("div", "insp-propagative insp-visibility");
  box.dataset.visSect = id;
  box.dataset.visKind = unit ? "unit" : "container";
  root.appendChild(box);
  const paint = (): void => {
    box.replaceChildren();
    if (unit) paintUnit(box, store, id, onJump);
    else paintContainer(box, store, id, onJump);
  };
  boxes.add({ box, paint });
  paint();
}

function link(target: string, words: string, onJump: (id: string) => void, cls = "insp-prov-from insp-link"): HTMLElement {
  const b = el("button", cls, words) as HTMLButtonElement;
  b.type = "button";
  b.dataset.go = target;
  b.addEventListener("click", () => onJump(target));
  return b;
}

function paradataLine(doc: EmDocument, w: { paradata: VisParadata[] }, onJump: (id: string) => void): HTMLElement {
  const line = el("div", "insp-vis-pd");
  line.dataset.visParadata = "";
  if (!w.paradata.length) { line.textContent = t("visib.noParadata"); return line; }
  w.paradata.forEach((p, i) => {
    if (i) line.append(" · ");
    line.append(`${t("visib.who")} `, link(p.node, p.name ?? nameOf(doc, p.node), onJump));
    if (p.sources.length) {
      line.append(` ${t("visib.onSource")} `);
      p.sources.forEach((s, j) => { if (j) line.append(", "); line.append(link(s.node, s.name ?? nameOf(doc, s.node), onJump)); });
    }
  });
  return line;
}

function paintUnit(box: HTMLElement, store: DocumentStore, id: string, onJump: (id: string) => void): void {
  const doc = store.doc;
  const st = visibilityFor(store, id);
  box.dataset.visStatus = st.status;
  if (st.stale) box.dataset.visStale = "1";
  else delete box.dataset.visStale;
  if (st.status === "loading" || st.status === "idle") { box.appendChild(el("p", "insp-hint", t("visib.loading"))); }
  else if (st.status === "off") box.appendChild(el("p", "insp-hint", t("visib.off")));
  else if (st.status === "error") box.appendChild(el("p", "insp-hint", t("visib.error", { error: st.error ?? "" })));
  const d = st.diary;
  if (d) {
    if (d.status !== "ok") {
      const p = el("p", "insp-hint", t(`visib.status.${d.status}`));
      p.dataset.visDerived = d.status;
      box.appendChild(p);
    }
    if (!d.windows.length) box.appendChild(el("p", "insp-hint insp-vis-empty", t("visib.empty")));
    const list = el("div", "insp-vis-list");
    for (const w of d.windows) list.appendChild(windowRow(store, id, w, onJump));
    box.appendChild(list);
    if (d.conflicts.length) {
      const c = el("div", "insp-vis-conflicts");
      c.appendChild(el("div", "insp-hint", t("visib.conflicts")));
      for (const k of d.conflicts) {
        const p = el("p", "insp-hint insp-prov-contra", conflictWords(doc, k));
        p.dataset.visConflict = k.kind;
        c.appendChild(p);
      }
      box.appendChild(c);
    }
    for (const w of d.warnings) box.appendChild(el("p", "insp-hint", w));
  }
  box.appendChild(declareBar(store, id, null));
}

function windowRow(store: DocumentStore, unit: string, w: VisWindow, onJump: (id: string) => void): HTMLElement {
  const doc = store.doc;
  const level = w.level ?? "derived";
  const row = el("div", `insp-prop-row insp-vis-row${level === "own" ? " insp-prop-own" : level === "inherited" ? " insp-prov-inherited" : " insp-vis-derived"}`);
  row.dataset.visWindow = "";
  row.dataset.state = w.state;
  row.dataset.level = level;
  row.dataset.source = w.source;
  row.dataset.from = w.start == null ? "" : String(w.start);
  row.dataset.to = w.end == null ? "" : String(w.end);
  if (w.inherited_from) row.dataset.origin = w.inherited_from.node;
  const st = el("span", "insp-prop-rule insp-vis-state", stateWords(w.state));
  st.dataset.visState = w.state;
  row.appendChild(st);
  const span = `${endWords(doc, w.start, w.start_scissor, w.start_epoch, "start")} – ${endWords(doc, w.end, w.end_scissor, w.end_epoch, "end")}`;
  row.appendChild(el("span", "insp-prop-value insp-vis-span", span));
  const src = el("span", "insp-prov-src insp-vis-src");
  if (level === "inherited" && w.inherited_from) {
    const o = w.inherited_from;
    src.append(link(o.node, t("visib.inheritedFrom", { node: o.name ?? nameOf(doc, o.node) }), onJump));
    src.append(` (${t(`visib.kind.${o.kind}`)})`);
    if (o.via.length > 1) src.append(` · ${t("visib.via", { nodes: o.via.slice(0, -1).map((v) => nameOf(doc, v)).join(" › ") })}`);
    src.append(` · ${t(`visib.src.${w.source}`)}`);
  } else if (level === "own") src.append(t(`visib.src.${w.source}`));
  else {
    src.append(t("visib.src.derived"));
    if (w.by.length) {
      src.append(` · ${t(w.state === "partially_exposed" ? "visib.cutBy" : "visib.coveredBy")} `);
      w.by.forEach((b, i) => { if (i) src.append(", "); src.append(link(b, nameOf(doc, b), onJump)); });
    } else if (w.state === "exposed") src.append(` · ${t("visib.nothingCovers")}`);
  }
  // a window merged from pieces of different levels (an inherited and a
  // derived one of the same state, contiguous): said, with its covers
  const others = (w.levels ?? []).filter((l) => l !== level);
  if (others.length) {
    row.dataset.levels = (w.levels ?? []).join(" ");
    src.append(` · ${t("visib.merged", { levels: others.map((l) => t(`visib.level.${l}`)).join(", ") })}`);
    if (level !== "derived" && w.by.length) {
      src.append(` · ${t("visib.coveredBy")} `);
      w.by.forEach((b, i) => { if (i) src.append(", "); src.append(link(b, nameOf(doc, b), onJump)); });
    }
  }
  row.appendChild(src);
  if (level !== "derived") row.appendChild(paradataLine(doc, w, onJump));
  // the gestures: an inherited window is overridden here, an own one removed
  if (level === "inherited") {
    const b = el("button", "insp-btn insp-prov-own", t("visib.override")) as HTMLButtonElement;
    b.type = "button";
    b.dataset.visOverride = w.inherited_from?.node ?? "";
    b.title = t("visib.overrideTitle");
    b.addEventListener("click", () => {
      const host = row.closest<HTMLElement>(".insp-visibility");
      const bar = host?.querySelector<HTMLElement>("[data-vis-declare-bar]");
      if (bar) bar.replaceWith(declareBar(store, unit, w, true));
    });
    row.appendChild(b);
  } else if (level === "own") {
    const own = (w.parts?.length ? w.parts.filter((p) => p.level === "own").map((p) => p.property_id) : w.property_ids)
      .filter((x): x is string => !!x && declaredOn(doc, unit).some((p) => p.id === x));
    for (const pid of own) {
      const b = el("button", "insp-btn", t("visib.remove")) as HTMLButtonElement;
      b.type = "button";
      b.dataset.visRemove = pid;
      b.addEventListener("click", () => {
        void askConfirm(t("visib.removeAsk", { state: stateWords(w.state), node: nameOf(doc, unit) }), { kind: "visibility-remove", ok: t("visib.remove") })
          .then((yes) => { if (yes) store.batch(() => store.deleteNode(pid)); });
      });
      row.appendChild(b);
    }
  }
  return row;
}

function conflictWords(doc: EmDocument, c: VisConflict): string {
  const vars = {
    from: fmtYear(c.start), to: fmtYear(c.end), declared: stateWords(c.declared),
    derived: stateWords(c.derived ?? ""), other: stateWords(c.other ?? ""),
    node: c.inherited_from ? (c.inherited_from.name ?? nameOf(doc, c.inherited_from.node)) : "",
    other_node: c.other_inherited_from ? (c.other_inherited_from.name ?? nameOf(doc, c.other_inherited_from.node)) : "",
    by: c.by.map((b) => nameOf(doc, b)).join(", "),
  };
  return t(`visib.conflict.${c.kind}`, vars);
}

function paintContainer(box: HTMLElement, store: DocumentStore, id: string, onJump: (id: string) => void): void {
  const doc = store.doc;
  const n = store.node(id)!;
  const reach = n.node_type === "EpochNode" ? t("visib.containerEpoch")
    : t("visib.container", { n: String(doc.graph.edges.filter((e) => e.edge_type === MEMBER_EDGE[n.node_type] && e.target === id).length) });
  box.appendChild(el("p", "insp-hint", reach));
  const props = declaredOn(doc, id);
  if (!props.length) box.appendChild(el("p", "insp-hint insp-vis-empty", t("visib.containerNone")));
  for (const p of props) {
    const w = declaredWords(doc, p);
    const row = el("div", "insp-prop-row insp-vis-row insp-prop-own");
    row.dataset.visDeclared = p.id;
    row.dataset.state = w.state;
    row.append(el("span", "insp-prop-rule insp-vis-state", stateWords(w.state)), el("span", "insp-prop-value insp-vis-span", `${w.from} – ${w.to}`));
    const pd: VisParadata[] = [];
    for (const e of doc.graph.edges) {
      if (e.edge_type !== "has_data_provenance" || e.source !== p.id) continue;
      const sources = doc.graph.edges.filter((x) => x.edge_type === "extracted_from" && x.source === e.target)
        .map((x) => ({ node: x.target, name: nameOf(doc, x.target) }));
      pd.push({ node: e.target, name: nameOf(doc, e.target), kind: String(nodeOf(doc, e.target)?.node_type ?? ""), sources });
    }
    row.appendChild(paradataLine(doc, { paradata: pd }, onJump));
    const b = el("button", "insp-btn", t("visib.remove")) as HTMLButtonElement;
    b.type = "button";
    b.dataset.visRemove = p.id;
    b.addEventListener("click", () => {
      void askConfirm(t("visib.removeAsk", { state: stateWords(w.state), node: nameOf(doc, id) }), { kind: "visibility-remove", ok: t("visib.remove") })
        .then((yes) => { if (yes) store.batch(() => store.deleteNode(p.id)); });
    });
    row.appendChild(b);
    box.appendChild(row);
  }
  box.appendChild(declareBar(store, id, null));
}

/** «Dichiara una finestra…»: the button, or the form open (prefilled by the
 *  inherited window being overridden) */
function declareBar(store: DocumentStore, owner: string, from: VisWindow | null, open = false): HTMLElement {
  const bar = el("div", "insp-actions insp-vis-declare");
  bar.dataset.visDeclareBar = "";
  const n = store.node(owner);
  if (!canDeclareOn(n)) {
    bar.appendChild(el("p", "insp-hint", t("visib.form.notAllowed", { type: String(n?.node_type ?? "?") })));
    return bar;
  }
  if (!open) {
    const b = el("button", "insp-btn", t("visib.declare")) as HTMLButtonElement;
    b.type = "button";
    b.dataset.visDeclare = owner;
    b.addEventListener("click", () => bar.replaceWith(declareBar(store, owner, null, true)));
    bar.appendChild(b);
    return bar;
  }
  bar.appendChild(declareForm(store, owner, from, () => bar.replaceWith(declareBar(store, owner, null))));
  return bar;
}

function declareForm(store: DocumentStore, owner: string, from: VisWindow | null, close: () => void): HTMLElement {
  const doc = store.doc;
  const form = el("div", "insp-vis-form");
  form.dataset.visForm = owner;
  if (from?.inherited_from) form.dataset.visOverriding = from.inherited_from.node;
  const field = (label: string, input: HTMLElement): HTMLElement => {
    const l = el("label", "insp-vis-field");
    l.append(el("span", "insp-vis-label", label), input);
    return l;
  };
  const select = (key: string, opts: Array<[string, string]>, value?: string): HTMLSelectElement => {
    const s = document.createElement("select");
    s.className = "insp-input";
    s.dataset.visF = key;
    for (const [v, w] of opts) { const o = document.createElement("option"); o.value = v; o.textContent = w; s.appendChild(o); }
    if (value != null) s.value = value;
    return s;
  };
  const input = (key: string, value = "", ph = ""): HTMLInputElement => {
    const i = document.createElement("input");
    i.className = "insp-input";
    i.dataset.visF = key;
    i.value = value;
    i.placeholder = ph;
    return i;
  };
  const epochs = epochsOf(doc).map((e) => [e.id, `${e.name}${e.start != null || e.end != null ? ` (${fmtYear(e.start)}–${fmtYear(e.end)})` : ""}`] as [string, string]);
  const modes: Array<[string, string]> = [["year", t("visib.form.mode.year")], ["epoch", t("visib.form.mode.epoch")], ["open", t("visib.form.mode.open")]];
  const yr = (v: number | null | undefined): string => (v == null ? "" : String(v));

  const state = select("state", VIS_STATES.map((s) => [s, t(`visib.state.${s}`)] as [string, string]), from?.state ?? "buried");
  form.appendChild(field(t("visib.form.state"), state));

  const side = (key: "from" | "to", w: VisWindow | null): { mode: HTMLSelectElement; year: HTMLInputElement; other: HTMLInputElement; epoch: HTMLSelectElement } => {
    const ep = key === "from" ? w?.start_epoch : w?.end_epoch;
    const v = key === "from" ? w?.start : w?.end;
    const sc = key === "from" ? w?.start_scissor : w?.end_scissor;
    const mode = select(`${key}Mode`, modes, ep ? "epoch" : v != null ? "year" : "open");
    const year = input(key, yr(v), t("visib.form.mode.year"));
    const other = input(key === "from" ? "fromLatest" : "toEarliest",
      sc && v != null ? yr(key === "from" ? (sc[1] !== v ? sc[1] : null) : (sc[0] !== v ? sc[0] : null)) : "",
      t(key === "from" ? "visib.form.latest" : "visib.form.earliest"));
    const epoch = select(`${key}Epoch`, epochs, ep ?? epochs[0]?.[0]);
    const row = el("div", "insp-vis-side");
    row.append(mode, year, other, epoch);
    const sync = (): void => {
      year.hidden = other.hidden = mode.value !== "year";
      epoch.hidden = mode.value !== "epoch";
    };
    mode.addEventListener("change", sync);
    sync();
    form.appendChild(field(t(key === "from" ? "visib.form.from" : "visib.form.to"), row));
    return { mode, year, other, epoch };
  };
  const f = side("from", from);
  const to = side("to", from);

  const docs = documentsOf(doc);
  const src = select("source", [["", t("visib.form.noSource")], ["__new__", t("visib.form.newSource")],
    ...docs.map((d) => [d.id, String(d.name ?? d.id)] as [string, string])]);
  const newName = input("newSource", "", t("visib.form.newSourceName"));
  newName.hidden = true;
  src.addEventListener("change", () => { newName.hidden = src.value !== "__new__"; });
  const srcBox = el("div", "insp-vis-side");
  srcBox.append(src, newName);
  form.appendChild(field(t("visib.form.source"), srcBox));

  const me = currentIdentity();
  const today = new Date().toISOString().slice(0, 10);
  const note = input("note", me ? `${[me.name, me.surname].filter(Boolean).join(" ") || me.orcid}, ${today}` : today, t("visib.form.note"));
  form.appendChild(field(t("visib.form.note"), note));

  const msg = el("p", "insp-hint insp-vis-msg");
  msg.hidden = true;
  form.appendChild(msg);
  const bar = el("div", "insp-actions");
  const ok = el("button", "insp-btn", t("visib.form.ok")) as HTMLButtonElement;
  ok.type = "button";
  ok.dataset.visF = "ok";
  const cancel = el("button", "insp-btn", t("visib.form.cancel")) as HTMLButtonElement;
  cancel.type = "button";
  cancel.dataset.visF = "cancel";
  cancel.addEventListener("click", close);
  ok.addEventListener("click", () => {
    const num = (s: string): number | null => (s.trim() === "" ? null : Number(s.trim()));
    const end = (s: typeof f, which: "from" | "to"): VisDeclaration["from"] | VisDeclaration["to"] | null => {
      if (s.mode.value === "open") return { mode: "open" };
      if (s.mode.value === "epoch") return s.epoch.value ? { mode: "epoch", epoch: s.epoch.value } : null;
      const y = num(s.year.value), o = num(s.other.value);
      if (y == null || !Number.isFinite(y) || (o != null && !Number.isFinite(o))) return null;
      if (which === "from") return o != null && o < y ? null : { mode: "year", year: y, latest: o };
      return o != null && o > y ? null : { mode: "year", year: y, earliest: o };
    };
    const a = end(f, "from"), b = end(to, "to");
    const bad = !a || !b || (a.mode === "year" && b.mode === "year" && a.year > b.year);
    if (bad) { msg.hidden = false; msg.textContent = t("visib.form.bad"); return; }
    const source: VisDeclaration["source"] = src.value === "__new__"
      ? { kind: "new-document", name: newName.value.trim() } : src.value ? { kind: "document", id: src.value } : null;
    declareVisibility(store, owner, { state: state.value as VisState, from: a as VisDeclaration["from"], to: b as VisDeclaration["to"], source, note: note.value });
    close();
  });
  bar.append(ok, cancel);
  form.appendChild(bar);
  return form;
}
