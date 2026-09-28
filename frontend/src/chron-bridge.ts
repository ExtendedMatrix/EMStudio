/**
 * MICRO-cronologia · the propagated chronology, ASKED OF THE BRIDGE.
 *
 * The decision (E.D., 29 set 2026, «cronologia calcolata implicita»): the
 * propagated chronology is derived state. It is computed when it is needed and
 * never written into the document, and it gets no field of its own: its
 * provenance is the stratigraphic relation it travels along (`is_after` with
 * that unit, `is_part_of`, `changed_from`), which the document already holds.
 * So the Chronology view sends the open document to `POST /chronology`,
 * s3Dgraphy answers with `graph.chronology()` — value AND relation, as the
 * explanation to show — and the answer lives HERE, in memory. The document
 * receives nothing.
 *
 * One propagation, in s3Dgraphy (CLAUDE.md, invariant 2): this module computes
 * nothing. It knows when to ask again — when the view is drawn and the part of
 * the document the chronology depends on has changed — and it waits a moment
 * (debounce) so a burst of edits is one request, not twenty.
 *
 * The bridge endpoint is resolved by main.ts and handed in (`setChronology-
 * BridgeResolver`), like every other bridge module: ONE place decides where the
 * bridge is.
 */
import type { EmDocument } from "./types";

export type ChronRule = "written" | "epoch" | "contained" | "tpq" | "taq";

/** One node's entry of `Graph.chronology()` (s3Dgraphy). */
export interface ChronEntry {
  start: number | null;
  end: number | null;
  /** the node at the other end of the relation the bound arrived along */
  start_source: string | null;
  end_source: string | null;
  /** THE PROVENANCE: the edge type the bound arrived along (`is_after`,
   *  `has_first_epoch`, `is_part_of`, `has_property`…) */
  start_relation: string | null;
  end_relation: string | null;
  rule: ChronRule | null;
  start_rule: ChronRule | null;
  end_rule: ChronRule | null;
  /** the rule from the contents, reported beside the value (even when a
   *  written start stands over it); `via` = the relations walked */
  contained?: { start: number; source: string; original: string | null; via?: string[] };
}

/** `off` = the bridge did not answer at all; `error` = it answered with a
 *  failure (an s3Dgraphy too old for `/chronology` is a 501). */
export type ChronStatus = "idle" | "loading" | "ok" | "off" | "error";

export interface ChronState {
  status: ChronStatus;
  map: Record<string, ChronEntry>;
  warnings: string[];
  error?: string;
  /** the map answers an OLDER version of the document; a new one is on its way */
  stale: boolean;
}

const DEBOUNCE_MS = 500;
/** how often an unreachable bridge is tried again while the view is drawn */
const RETRY_MS = 5000;

let resolveBridge: () => Promise<string> = async () => "http://localhost:8765";
let onUpdate: () => void = () => {};

let state: ChronState = { status: "idle", map: {}, warnings: [], stale: false };
let lastSig: string | null = null;
let lastAttempt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

export function setChronologyBridgeResolver(fn: () => Promise<string>): void {
  resolveBridge = fn;
}

/** called when an answer lands, so the view can redraw itself */
export function onChronologyUpdate(fn: () => void): void {
  onUpdate = fn;
}

/**
 * What the chronology depends on, as a string: every node's id and type, every
 * edge, every property's name and value, every epoch's bounds. A rename or a
 * description does not change it, so typing in the Inspector does not re-ask;
 * a new relation, a moved find, a corrected epoch or date does.
 *
 * Deliberately NOT a list of "stratigraphic" edge types: that list belongs to
 * the datamodel and to s3Dgraphy, and a copy of it here would drift.
 */
export function chronologySignature(doc: EmDocument): string {
  const g = doc.graph;
  const parts: string[] = [String(g.graph_id ?? "")];
  for (const n of g.nodes ?? []) {
    const d = (n.data ?? {}) as Record<string, unknown>;
    let extra = "";
    if (n.node_type === "property" || n.node_type === "PropertyNode")
      extra = `${String(n.name ?? "")}=${String(d.value ?? n.description ?? "")}`;
    else if (n.node_type === "EpochNode" || n.node_type === "epoch")
      extra = `${String(d.start_time ?? "")}/${String(d.end_time ?? "")}`;
    parts.push(`n|${n.id}|${n.node_type}|${extra}`);
  }
  for (const e of g.edges ?? []) parts.push(`e|${e.edge_type}|${e.source}|${e.target}`);
  return parts.join("\n");
}

/**
 * The current answer for this document — and, when the document changed since
 * the last request (or an unreachable bridge is due another try), a new request
 * scheduled after the debounce. `serialize` is called when the request LEAVES,
 * so it carries the document as it is then.
 */
export function chronologyFor(doc: EmDocument, serialize: () => string): ChronState {
  const sig = chronologySignature(doc);
  const now = Date.now();
  const changed = sig !== lastSig;
  const retry = (state.status === "off" || state.status === "error") &&
    now - lastAttempt > RETRY_MS && timer == null;
  if (changed || retry) {
    lastSig = sig;
    if (changed && state.status === "ok") state = { ...state, stale: true };
    if (timer != null) clearTimeout(timer);
    // the first request (the view opening) goes at once; edits wait
    const wait = state.status === "idle" ? 0 : DEBOUNCE_MS;
    timer = setTimeout(() => {
      timer = null;
      void ask(serialize());
    }, wait);
  }
  return state;
}

async function ask(body: string): Promise<void> {
  const mine = ++seq;
  lastAttempt = Date.now();
  if (state.status === "idle" || state.status === "off") state = { ...state, status: "loading" };
  let next: ChronState;
  try {
    const res = await fetch(`${await resolveBridge()}/chronology`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = String(j.error);
      } catch { /* non-JSON error body */ }
      next = { status: "error", map: {}, warnings: [], error: msg, stale: false };
    } else {
      const j = (await res.json()) as { chronology?: Record<string, ChronEntry>; warnings?: string[] };
      next = { status: "ok", map: j.chronology ?? {}, warnings: j.warnings ?? [], stale: false };
    }
  } catch {
    next = { status: "off", map: {}, warnings: [], stale: false };
  }
  // an answer to an older request than the latest one is dropped
  if (mine !== seq) return;
  state = next;
  onUpdate();
}

/** test/reset hook: forget everything (a new session, a closed document) */
export function resetChronology(): void {
  if (timer != null) clearTimeout(timer);
  timer = null;
  state = { status: "idle", map: {}, warnings: [], stale: false };
  lastSig = null;
  lastAttempt = 0;
  seq++;
}
