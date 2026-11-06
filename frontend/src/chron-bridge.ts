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

export type ChronRule = "written" | "epoch" | "sub_epoch" | "contained" | "tpq" | "taq";

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
  /** MICRO-LAB orizzonti · the epochs' effective intervals
   *  (`Graph.epoch_intervals()`: a sub-epoch restricted by its parent), when
   *  the bridge's s3dgraphy gives them */
  epochs?: Record<string, { start: number | null; end: number | null; start_rule?: string | null;
                            end_rule?: string | null; parent?: string | null }>;
}

const DEBOUNCE_MS = 500;
/** how often an unreachable bridge is tried again while the view is drawn */
const RETRY_MS = 5000;

let resolveBridge: () => Promise<string> = async () => "http://localhost:8765";
/** every view that shows something computed from the chronology (the
 *  Chronology view, the Data panel, the horizons of the Matrix and the Graph,
 *  and since MICRO-INSPECTOR-SEZIONI the Inspector's propagative metadata) is
 *  told when an answer lands */
const onUpdate: Array<() => void> = [];

export function setChronologyBridgeResolver(fn: () => Promise<string>): void {
  resolveBridge = fn;
}

/** called when an answer lands, so the view can redraw itself */
export function onChronologyUpdate(fn: () => void): void {
  onUpdate.push(fn);
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
 * One asker per document: its answer, the signature it answers, its timer.
 * MICRO-LAB orizzonti come bande · a Matrix in horizons draws EVERY graph
 * switched on, each with its own answer. MICRO-LAB bande-3 · since dev.74 the
 * Inspector asks too (start/end of a node), and its node may be in another
 * document than the one the Chronology view or the bands are reading: with ONE
 * state the two would ask in turn, each answer throwing the other's away. So
 * the asker belongs to the document's OWNER (its store), whoever asks.
 */
class Asker {
  state: ChronState = { status: "idle", map: {}, warnings: [], stale: false };
  lastSig: string | null = null;
  lastAttempt = 0;
  timer: ReturnType<typeof setTimeout> | null = null;
  seq = 0;

  for(doc: EmDocument, serialize: () => string): ChronState {
    const sig = chronologySignature(doc);
    const now = Date.now();
    const changed = sig !== this.lastSig;
    const retry = (this.state.status === "off" || this.state.status === "error") &&
      now - this.lastAttempt > RETRY_MS && this.timer == null;
    if (changed || retry) {
      this.lastSig = sig;
      if (changed && this.state.status === "ok") this.state = { ...this.state, stale: true };
      if (this.timer != null) clearTimeout(this.timer);
      // the first request (the view opening) goes at once; edits wait
      const wait = this.state.status === "idle" ? 0 : DEBOUNCE_MS;
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.ask(serialize());
      }, wait);
    }
    return this.state;
  }

  async ask(body: string): Promise<void> {
    const mine = ++this.seq;
    this.lastAttempt = Date.now();
    if (this.state.status === "idle" || this.state.status === "off") this.state = { ...this.state, status: "loading" };
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
        const j = (await res.json()) as { chronology?: Record<string, ChronEntry>; warnings?: string[];
                                          epochs?: ChronState["epochs"] };
        next = { status: "ok", map: j.chronology ?? {}, warnings: j.warnings ?? [], stale: false,
                 ...(j.epochs ? { epochs: j.epochs } : {}) };
      }
    } catch {
      next = { status: "off", map: {}, warnings: [], stale: false };
    }
    // an answer to an older request than the latest one is dropped
    if (mine !== this.seq) return;
    this.state = next;
    for (const fn of onUpdate) fn();
  }

  reset(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    this.state = { status: "idle", map: {}, warnings: [], stale: false };
    this.lastSig = null;
    this.lastAttempt = 0;
    this.seq++;
  }
}

const main = new Asker();
const owned = new Map<object | string, Asker>();
function askerOf(owner: object | string): Asker {
  let a = owned.get(owner);
  if (!a) owned.set(owner, (a = new Asker()));
  return a;
}

/**
 * The current answer for this document — and, when the document changed since
 * the last request (or an unreachable bridge is due another try), a new request
 * scheduled after the debounce. `serialize` is called when the request LEAVES,
 * so it carries the document as it is then.
 */
export function chronologyFor(doc: EmDocument, serialize: () => string, owner?: object): ChronState {
  return (owner ? askerOf(owner) : main).for(doc, serialize);
}

/** The same, for the document of `key` (an open graph): each one its own answer. */
export function chronologyOfKey(key: string, doc: EmDocument, serialize: () => string): ChronState {
  return askerOf(key).for(doc, serialize);
}

/** test/reset hook: forget everything (a new session, a closed document) */
export function resetChronology(): void {
  main.reset();
  for (const a of owned.values()) a.reset();
  owned.clear();
}
