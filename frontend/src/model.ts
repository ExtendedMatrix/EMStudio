// Editable document store with snapshot-based undo/redo. The graph section
// stays the single source of truth; layout mutations (positions, folding)
// live in the optional layout section, exactly as persisted in .em.json.
// NOTE: this is the phase-4 in-frontend editing model; it migrates behind
// em-core (WASM / Tauri IPC) when the core editing API lands.
import type {
  AuthorityRef,
  EmDocument,
  EmEdge,
  EmNode,
  LayoutRect,
  Swimlane,
} from "./types";
import { MEMBERSHIP_EDGES } from "./folding";
import { paradataGroupName } from "./naming";
import { edgeTypeFor, nodeTypeForClass, planUniformSpellings } from "./rules";
import type { SpellingPlan } from "./rules";
import { VOLATILE_KEY } from "./volatile";
import { currentIdentity } from "./identity";
import { resolveNodePair } from "./container";
import type { Conflict } from "./container";
import {
  applyOp as crdtApplyOp,
  canonicalValue, clearField, contentFields, getField,
  isRemoved,
  liveEdges as crdtLiveEdges, liveNodes as crdtLiveNodes,
  setFieldClock, unstampedFields, writeField,
} from "./crdt";
import type { CrdtOp, OpResult, Payload } from "./crdt";

/** A structured graph mutation for the live op-log bridge (ADR-002 phase 2).
 * Kept small and additive; more variants (add/delete node/edge) land next. */
/** P4.3 · which fields an `update_node` actually changed, with the clock the
 *  store stamped on each (P4.1b). Carried so a hub client can turn one local
 *  edit into the per-field operations the relay understands WITHOUT re-deriving
 *  the diff — re-deriving it would mean guessing at a "before" that only the
 *  store had. The sidecar bridge ignores the field; it is additive. */
export interface ChangedField {
  field: string;
  value: unknown;
  ts: string;
  by?: string | null;
  removed?: boolean;
}

export type GraphOp =
  | { op: "update_node"; node_id: string; patch: Partial<EmNode>;
      fields?: ChangedField[] }
  | { op: "add_node"; node: EmNode }
  | { op: "delete_node"; node_id: string }
  | { op: "add_edge"; edge: EmEdge }
  | { op: "delete_edge"; edge: EmEdge };

interface Snapshot {
  graph: string;
  layout: string;
}

const MAX_UNDO = 80;

/** MIG1 (2026-08-06) one-shot legacy migration: node_type strings renamed in
 *  this release. A legacy em.json still carries the old string; remap it in place
 *  at load so the dataset opens on the new model (LinkNode → ResourceNode →
 *  node_type "link" → "resource"). Mirrors the Python emjson importer's
 *  `_LEGACY_NODE_TYPE_ALIASES`. Add future renames here. */
const LEGACY_NODE_TYPE_ALIASES: Record<string, string> = { link: "resource" };
/** node_type strings that were never a type of the datamodel and open as a
 *  type + its node elements. Mirrors s3Dgraphy's emjson importer
 *  `_LEGACY_NODE_TYPE_MIGRATIONS` (node datamodel 1.6.12–1.6.13): a USM is a US
 *  whose `stratigraphic_kind` is `masonry`, a USR or a USS one whose kind is
 *  `coating` — the same thing in two languages, so the USS keeps the code it
 *  came in with (`source_code`, what goes back to pyArchInit). The name keeps
 *  saying USM / USR / USS. An element already written is not overwritten. */
const LEGACY_NODE_TYPE_MIGRATIONS: Record<string, { to: string; data: Record<string, string> }> = {
  USM: { to: "US", data: { stratigraphic_kind: "masonry" } },
  USR: { to: "US", data: { stratigraphic_kind: "coating" } },
  USS: { to: "US", data: { stratigraphic_kind: "coating", source_code: "USS" } },
};
function migrateLegacyNodeTypes(doc: EmDocument): void {
  for (const n of doc.graph?.nodes ?? []) {
    const to = LEGACY_NODE_TYPE_ALIASES[n.node_type];
    if (to) n.node_type = to;
    const m = LEGACY_NODE_TYPE_MIGRATIONS[n.node_type];
    if (m) {
      n.node_type = m.to;
      const data = (n.data ??= {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(m.data)) if (data[k] === undefined) data[k] = v;
    }
  }
}

/** MIG1-A (DP-65) legacy field → class for the graph-scope rights metadata. */
const LEGACY_GRAPH_SCOPE: Array<{ key: string; cls: string }> = [
  { key: "author_name", cls: "AuthorNode" },
  { key: "license", cls: "LicenseNode" },
  { key: "embargo", cls: "EmbargoNode" },
];

/**
 * MIG1-A (DP-65) one-shot legacy migration: the graph-scope author / licence /
 * embargo used to live as `graph.author_name`/`graph.data['author_name'|…]`
 * fields (BUGFIX-CANVAS-IMPORT). EM 1.6 formalises them as first-class MEMBER
 * nodes of a graph-scope ParadataNodeGroup owned by the graph-self node
 * (`GraphNode`, node_type `graph`) via `has_paradata_nodegroup` ←
 * `is_in_paradata_nodegroup`. Materialise the nodes in place at load and drop
 * the legacy fields; the Data Funnel canvas tier reads these nodes.
 *
 * Silent (no checkpoint / no op / no change event, like `ensureAllEpochParadata`)
 * and idempotent: reuses an existing graph-self node / graph-scope PDG (HDT-O
 * may have created the GraphNode), never duplicates a member class, and mints
 * ids matching the Python emjson importer so both migrations agree.
 */
function migrateLegacyGraphScope(doc: EmDocument): void {
  const g = doc.graph as unknown as Record<string, unknown> & {
    graph_id?: string;
    nodes: EmNode[];
    edges: EmEdge[];
    data?: Record<string, unknown>;
  };
  if (!g || !Array.isArray(g.nodes)) return;
  const data = (g.data ??= {}) as Record<string, unknown>;
  const read = (key: string): string | null => {
    const top = g[key];
    if (top != null && String(top).trim() !== "") return String(top);
    const dv = data[key];
    return dv != null && String(dv).trim() !== "" ? String(dv) : null;
  };
  const legacy = LEGACY_GRAPH_SCOPE.map((x) => ({ ...x, val: read(x.key) })).filter(
    (x) => x.val != null,
  );
  if (legacy.length === 0) return;

  const graphNt = nodeTypeForClass("GraphNode") ?? "graph";
  const pdgNt = nodeTypeForClass("ParadataNodeGroup") ?? "ParadataNodeGroup";
  const gid = String(g.graph_id ?? "graph");

  // 1 · the graph-self node (reuse an existing one, e.g. authored by HDT-O)
  let root = g.nodes.find((n) => n.node_type === graphNt);
  if (!root) {
    root = { id: `${gid}_graphroot`, name: "Graph", node_type: graphNt, description: "" };
    g.nodes.push(root);
  }
  // 2 · its graph-scope ParadataNodeGroup (reuse if already anchored)
  let pdgId: string | null = null;
  for (const e of g.edges)
    if (e.edge_type === "has_paradata_nodegroup" && e.source === root.id) {
      pdgId = e.target;
      break;
    }
  if (!pdgId) {
    pdgId = `${gid}_graph_paradata`;
    g.nodes.push({ id: pdgId, name: "Graph paradata", node_type: pdgNt, description: "" });
    g.edges.push({
      id: `${root.id}__has_paradata_nodegroup__${pdgId}`,
      source: root.id,
      target: pdgId,
      edge_type: "has_paradata_nodegroup",
    });
  }
  // 3 · existing member node_types (idempotency — never a second author/…)
  const present = new Set<string>();
  for (const e of g.edges)
    if (e.edge_type === "is_in_paradata_nodegroup" && e.target === pdgId) {
      const m = g.nodes.find((n) => n.id === e.source);
      if (m) present.add(m.node_type);
    }
  for (const item of legacy) {
    const nt = nodeTypeForClass(item.cls);
    if (!nt || present.has(nt)) continue;
    const mid = `${gid}_graph_${nt}`;
    g.nodes.push({ id: mid, name: String(item.val), node_type: nt, description: "" });
    g.edges.push({
      id: `${mid}__is_in_paradata_nodegroup__${pdgId}`,
      source: mid,
      target: pdgId,
      edge_type: "is_in_paradata_nodegroup",
    });
  }
  // 4 · drop the legacy fields we consumed (the nodes are now the truth)
  for (const item of legacy) {
    delete g[item.key];
    delete data[item.key];
  }
}

/**
 * THE THREE STATES OF AN ATTRIBUTION, and why there are three and not two.
 *
 * A digital twin is not found lying in the ground: it is **attributed**, and the
 * attribution matures downstream of the study. E.D., 30 September 2026, and it
 * is archaeology rather than software: *when I open a trench I do not yet know
 * what I am finding.* The other case — digging the Colosseum, where everything
 * found belongs to the Colosseum — is rarer than it looks, and both live in the
 * real world.
 *
 * So:
 *
 * * `none` — **no twin yet**. Not an empty field and not an error: the state of
 *   somebody who is excavating and does not yet know what it pertains to. The
 *   Catalog has had a real bucket for it since its first day.
 * * `provisional` — a twin **I made myself**, because I needed somewhere to put
 *   what I am finding. A legitimate, ordinary act. Its identity is the id its
 *   own document minted, so nobody else can have meant the same key.
 * * `registered` — an identity a register knows, which is what makes it
 *   findable by other people and mergeable with theirs.
 *
 * The passage from provisional to registered happens **at publication**, where
 * it is said either «this is new» or «this is somebody else's». Nothing in this
 * editor forces the passage, and nothing forces the first step either.
 */
export type TwinState = "none" | "provisional" | "registered";

/** WHICH twin this study is attributed to, and how firmly.
 *
 *  The invariant, enforced in {@link DocumentStore.applyHdto} and measured by
 *  `scripts/check-hdt.mjs`: **`registered` if and only if there is a shared
 *  `key`.** A status claiming more than the identity supports would be a state
 *  that reads as certainty on this screen and as a bare uuid in the Catalog. */
export interface TwinAttribution {
  state: TwinState;
  /** the twin's display name — free text, ours to write */
  name: string;
  /** the SHARED identity: the IRI two catalogues can agree on. Empty for a
   *  provisional twin, which is exactly what makes it provisional. Persisted as
   *  `heritage_entity_iri`, the field `s3dgraphy.study` already reads. */
  key: string;
  /** which register the key came from, when it came from one. `label` is what a
   *  person reads («Sarmizegetusa Catalogue»), `source` the machine id. */
  registry?: { source: string; label?: string; url?: string };
}

/** The empty attribution — the honest starting point of every study. */
export const NO_TWIN: TwinAttribution = { state: "none", name: "", key: "" };

/** The per-graph HDT-O (ECHOES D7.1) authoring fields surfaced by the Canvas
 *  inspector. A graph is a Study (HC9) whose proposition set (HC16) is about a
 *  Heritage Entity (HC1, optionally with a digital twin HC2), optionally under
 *  a Project (HC13). All fields optional — empty ones create/keep nothing. */
export interface HdtoFields {
  studyTitle: string;
  studyAuthors: string;
  studyDate: string;
  heritageName: string;
  heritageUri: string;
  /** A resolved authority candidate picked from the /resolve-authority
   *  autocomplete — stored verbatim (uri/authority/label/rank/match) as the
   *  HC1's authority_refs. When absent, `heritageUri` free-text becomes a bare
   *  `[{uri}]` ref (offline / no pick). */
  heritageAuthorityRef?: AuthorityRef;
  parentName: string;
  /** §5 · the parent whole gets the SAME treatment as the entity: an authority
   *  URI with its resolved ref, or free text that degrades and says so. */
  parentUri: string;
  parentAuthorityRef?: AuthorityRef;
  projectName: string;
  /** The twin, and its state. Absent in a document written before the three
   *  states existed → read back as `provisional` when a twin node is there
   *  without a shared key, which is what it always was. */
  twin: TwinAttribution;
}

/** Marker stored in a node's `data.hdto_role` so the per-graph HDT-O singletons
 *  stay idempotent (no duplicates) and the two Heritage Entities — the graph's
 *  subject ("about") and its optional whole ("parent") — are distinguishable.
 *  Internal to EMStudio; the RDF exporter ignores it (it reads specific
 *  attributes only), so it never leaks into the projected Turtle. */
type HdtoRole =
  | "proposition_set" // GraphNode (HC16)
  | "about" // HeritageEntityNode (HC1) — the subject
  | "parent" // HeritageEntityNode (HC1) — the optional whole
  | "twin" // HDTNode (HC2)
  | "study" // StudyNode (HC9)
  | "project"; // ProjectNode (HC13)

/** role → the s3Dgraphy datamodel CLASS whose runtime node_type is resolved
 *  from the vendored registry (never hardcode the wire string). */
const HDTO_ROLE_CLASS: Record<HdtoRole, string> = {
  proposition_set: "GraphNode",
  about: "HeritageEntityNode",
  parent: "HeritageEntityNode",
  twin: "HDTNode",
  study: "StudyNode",
  project: "ProjectNode",
};

/** AUDIT N5 · two top-level epochs that share an interval (see `epochOverlaps`). */
export interface EpochOverlap {
  /** the one that starts later, and the other */
  later: string;
  earlier: string;
  /** the shared interval and its length, in the epochs' own unit (years) */
  from: number;
  to: number;
  delta: number;
  /** when one lies ENTIRELY inside the other: that one, and its container */
  inner: string | null;
  outer: string | null;
  /** how far the later one sticks out of the other, when not contained */
  overhang: number;
}

export class DocumentStore {
  doc: EmDocument;
  dirty = false;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners: Array<() => void> = [];
  // op-log listener (ADR-002 phase 2): every mutation also emits a structured
  // operation for the live bridge. Suppressed while APPLYING a remote op.
  private opFn: ((op: GraphOp) => void) | null = null;
  private suppressOp = false;

  constructor(doc: EmDocument) {
    this.doc = doc;
    migrateLegacyNodeTypes(doc);
    migrateLegacyGraphScope(doc);
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  onOp(fn: (op: GraphOp) => void): void {
    this.opFn = fn;
  }

  /** MULTIGRAPH · tell the world the document changed under us.
   *
   * Needed by the container merge: the incoming nodes were folded straight into
   * the very object this store owns, so nothing called a mutator and no listener
   * ran. The alternative — re-creating the store — would throw away the undo
   * stack of a graph the user only ADDED to. */
  touch(): void {
    this.emit();
  }

  private emit(): void {
    this.dirty = true;
    for (const fn of this.listeners) fn();
  }

  private emitOp(op: GraphOp): void {
    if (!this.suppressOp) this.opFn?.(op);
  }

  /** P3 · conflicts produced by REMOTE operations, in arrival order. The live
   *  channel is not implemented (P4); this is where its conflicts collect so the
   *  UI has one place to read them from when it is. */
  readonly remoteConflicts: Conflict[] = [];

  /**
   * The nodes a SURFACE should show: the document's, minus the tombstoned.
   *
   * P4.1 keeps a deleted node in the document — the merge needs to tell
   * "deleted" from "not yet known to you" — and the canvas has always hidden
   * them. Once removals arrive LIVE (P4.5) every other surface needs the same
   * reading, or a node somebody just deleted stays findable in the search and
   * counted in the status bar. One reader, used by all of them, rather than the
   * same filter written four times and forgotten in the fifth.
   */
  liveNodes(): EmNode[] {
    return crdtLiveNodes(this.doc.graph as unknown as Payload) as unknown as EmNode[];
  }

  /** The connectors a surface should show: live, and between live nodes. */
  liveEdges(): EmEdge[] {
    const alive = new Set(this.liveNodes().map((n) => n.id));
    return (crdtLiveEdges(this.doc.graph as unknown as Payload) as unknown as EmEdge[])
      .filter((e) => alive.has(e.source) && alive.has(e.target));
  }

  /**
   * P4.5 · apply a CRDT operation from the room — **every verb**, live.
   *
   * The one entry point for the wire's own vocabulary (`add_node`,
   * `update_field`, `remove_node`, `add_edge`, `remove_edge`), applied by
   * `crdt.applyOp`: the same algebra the library and the relay run, so what a
   * remote peer did lands here the way it landed there.
   *
   * Two properties this buys, and both were missing while only `update_field`
   * was wired:
   *
   * * **structural work is live.** A node or an edge somebody else creates
   *   appears now, not at the next re-sync — which is the difference between a
   *   shared canvas and a shared file;
   * * **a removal is a TOMBSTONE, not a missing key.** `crdt.applyOp` marks
   *   `data.removed` / `attributes.removed` with the operation's clock, so the
   *   merge keeps knowing the difference between "she deleted it" and "I have
   *   something she has never seen". The views already hide what is tombstoned.
   *
   * Nothing is re-stamped: the clock travels with the payload (`ts`/`author`
   * from the room), and `suppressOp` keeps this from bouncing back out.
   *
   * Returns the CRDT's own verdict, so a caller can say "applied" or "stale"
   * rather than guessing.
   */
  applyCrdtOp(op: Record<string, unknown>): OpResult {
    this.suppressOp = true;
    try {
      const section = this.doc.graph as unknown as Payload;
      const result = crdtApplyOp(section, op as unknown as CrdtOp);
      if (result.applied) this.emit();
      return result;
    } finally {
      this.suppressOp = false;
    }
  }

  /** Apply an operation that arrived from a peer, WITHOUT re-emitting it. */
  applyRemoteOp(op: GraphOp): void {
    this.suppressOp = true;
    try {
      switch (op.op) {
        case "update_node": {
          // P3 · a remote edit of a node I also edited is the SAME conflict the
          // container merge resolves, arriving one operation at a time — so it
          // is judged by the same function (`resolveNodePair`) and not by a
          // second rule. Only the ARBITRATION is shared: the transport, the
          // broadcast and the CRDT are P4 and are not implemented here.
          const mine = this.node(op.node_id);
          if (mine) {
            const theirs = { ...mine, ...op.patch } as Record<string, unknown>;
            const { merged, conflicts } = resolveNodePair(
              op.node_id, mine as unknown as Record<string, unknown>, theirs,
            );
            this.remoteConflicts.push(...conflicts);
            // P4.1 · not accept-or-refuse any more: the MERGED node lands, so a
            // remote edit to one field and a local edit to another both survive.
            // What loses is a field, and the loss is in `conflicts` — never
            // silence, and never the whole node.
            const patch: Partial<EmNode> = {};
            for (const key of ["name", "description", "data"]) {
              if (key in merged) (patch as Record<string, unknown>)[key] = merged[key];
            }
            this.updateNode(op.node_id, patch);
            break;
          }
          this.updateNode(op.node_id, op.patch);
          break;
        }
        case "add_node":
          if (!this.node(op.node.id)) this.addNode(op.node);
          break;
        case "delete_node":
          this.deleteNode(op.node_id);
          break;
        case "add_edge":
          if (!this.doc.graph.edges.some((e) => e.id === op.edge.id)) {
            this.doc.graph.edges.push(op.edge);
            this.emit();
          }
          break;
        case "delete_edge":
          this.deleteEdge(op.edge);
          break;
      }
    } finally {
      this.suppressOp = false;
    }
  }

  private take(): Snapshot {
    return {
      graph: JSON.stringify(this.doc.graph),
      layout: JSON.stringify(this.doc.layout ?? null),
    };
  }

  private restore(s: Snapshot): void {
    this.doc.graph = JSON.parse(s.graph);
    const layout = JSON.parse(s.layout);
    if (layout === null) delete this.doc.layout;
    else this.doc.layout = layout;
  }

  private checkpoint(): void {
    // Inside a batch the enclosing call already took the snapshot; taking
    // another would split one user-level change into several undo steps.
    if (this.batchDepth > 0) return;
    this.undoStack.push(this.take());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  private batchDepth = 0;

  /**
   * Run several mutations as ONE undoable change.
   *
   * Some edits are only meaningful whole: writing a generated draft adds the AI
   * author, files the prompt as a source and appends the paragraph. Undoing
   * that one gesture must not leave an author and a prompt behind with no text
   * to explain them. Nesting is safe — the outermost call owns the step.
   */
  batch<T>(fn: () => T): T {
    if (this.batchDepth > 0) return fn();
    this.checkpoint();
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      this.emit();
    }
  }

  /** how many undo steps are held — a probe for «one gesture, one step» */
  get undoDepth(): number {
    return this.undoStack.length;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.take());
    this.restore(s);
    this.emit();
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.take());
    this.restore(s);
    this.emit();
  }

  // ---------- lookups ----------
  node(id: string): EmNode | undefined {
    return this.doc.graph.nodes.find((n) => n.id === id);
  }

  /** A globally-unique node identity (UUID). New nodes MUST use this so
   * they never collide with EMtools / imported nodes when graphs are merged
   * or synced — the id is the identity, the human label is `name`. */
  newId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto)
      return crypto.randomUUID();
    // Fallback for non-secure contexts (shouldn't happen on localhost/Tauri).
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /** A fresh human-readable label ("US_01", "US_02", …), unique among the
   * existing node NAMES. This is the display name, NOT the id (see newId). */
  freshLabel(nodeType: string): string {
    const names = new Set(
      this.doc.graph.nodes.map((n) => String(n.name ?? "")),
    );
    const base = nodeType.replace(/[^A-Za-z0-9]/g, "") || "node";
    let i = 1;
    while (names.has(`${base}_${String(i).padStart(2, "0")}`)) i++;
    return `${base}_${String(i).padStart(2, "0")}`;
  }

  // ---------- AUDIT1 · the editorial stamps (last hand) ----------
  //
  // Every node records who made it and who touched it last, taken from the
  // session identity and the clock — like git, and for the same reason: an
  // authorship you have to remember to type is an authorship nobody types.
  //
  // These are NOT `has_author`. That edge is INTERPRETIVE responsibility — who
  // stands behind the reading — and it is chosen, published and argued over.
  // This is bookkeeping: who typed it in. A node created by a student and
  // interpreted by a director carries both, and they answer different
  // questions. (Historical time is a third thing again: the epochs.)
  //
  // WITH NO IDENTITY DECLARED, `*_by` STAYS EMPTY. The clock is always
  // knowable, so the times are recorded either way; the author is not invented.

  /** The ORCID iD authoring right now, or null when nobody said. */
  private editorOrcid(): string | null {
    return currentIdentity()?.orcid ?? null;
  }

  /** Stamp a node's creation. No-op for an operation that arrived from a peer:
   *  their edit is not our hand, and `suppressOp` is exactly that condition. */
  private stampNew(node: EmNode): void {
    if (this.suppressOp) return;
    const data = ((node as Record<string, unknown>).data ??= {}) as Record<string, unknown>;
    const who = this.editorOrcid();
    if (who && !data.created_by) data.created_by = who;
    if (!data.created_at) data.created_at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  }

  /** Stamp an edit. Overwrites — this is a stamp, not a log. */
  private stampEdit(node: EmNode): void {
    if (this.suppressOp) return;
    const data = ((node as Record<string, unknown>).data ??= {}) as Record<string, unknown>;
    const who = this.editorOrcid();
    if (who) data.modified_by = who;
    data.modified_at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  }

  /**
   * P4.1b · stamp the FIELDS an edit actually changed.
   *
   * The contract field-level merging rests on — *if you write a field, stamp
   * it* — cannot be a promise the caller remembers to keep, or one day somebody
   * writes a field without its clock and it is silently back-dated to the node's
   * last save. So the stamping happens HERE, in the one function every edit goes
   * through, and it stamps exactly what CHANGED: a patch that carries the whole
   * `data` (most of them do) must not re-date fields nobody touched.
   */
  private stampFields(node: EmNode, before: Record<string, unknown>): ChangedField[] {
    if (this.suppressOp) return [];
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const who = this.editorOrcid();
    const after = node as unknown as Record<string, unknown>;
    const payload = after as Payload;
    const changed: string[] = [];
    for (const name of new Set([...contentFields(before), ...contentFields(payload)])) {
      if (canonicalValue(getField(before, name)) !== canonicalValue(getField(payload, name)))
        changed.push(name);
    }
    const stamped: ChangedField[] = [];
    for (const name of changed) {
      // a field emptied by an edit is EMPTIED, not absent: it gets the tombstone
      // that tells the other side this was an act (P4.1b)
      const value = getField(payload, name);
      const removed = value === undefined || value === null || value === "";
      setFieldClock(payload, name, { ts: now, by: who }, removed);
      stamped.push({ field: name, value, ts: now, by: who, removed });
    }
    if (import.meta.env?.DEV) {
      // the exact guard: HERE we know what changed, so an unstamped change is a
      // bug we can name rather than a state we can only suspect
      const missed = unstampedFields(payload).filter((f) => changed.includes(f));
      if (missed.length)
        console.warn(`[P4.1b] fields written without a clock on ${node.id}:`,
                     missed.join(", "));
    }
    return stamped;
  }

  /**
   * P4.1b · write ONE field and stamp it — the single act, exposed.
   *
   * `updateNode` already stamps what changes; this is for callers that want to
   * say plainly *which* field they are writing (an operation arriving from a
   * peer, a gesture that edits one thing).
   */
  setField(nodeId: string, field: string, value: unknown): void {
    const node = this.node(nodeId);
    if (!node) return;
    this.checkpoint();
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    writeField(node as unknown as Payload, field, value, {
      ts: now, by: this.editorOrcid(),
    });
    this.stampEdit(node);
    this.emit();
    this.emitOp({ op: "update_node", node_id: nodeId, patch: { data: node.data },
                  fields: [{ field, value, ts: now, by: this.editorOrcid() }] });
  }

  /**
   * P4.1b · empty a field, leaving its tombstone. The only way to remove one.
   *
   * Dropping the key would leave the other side unable to tell "she emptied it"
   * from "I have something she never had" — and the rule that protects your work
   * (absence is not deletion) would hand the value back.
   */
  clearField(nodeId: string, field: string): void {
    const node = this.node(nodeId);
    if (!node) return;
    this.checkpoint();
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    clearField(node as unknown as Payload, field, { ts: now, by: this.editorOrcid() });
    this.stampEdit(node);
    this.emit();
    this.emitOp({ op: "update_node", node_id: nodeId, patch: { data: node.data },
                  fields: [{ field, value: null, ts: now,
                             by: this.editorOrcid(), removed: true }] });
  }

  // ---------- mutations ----------
  addNode(node: EmNode, pos?: LayoutRect): EmNode {
    this.checkpoint();
    this.stampNew(node);
    this.doc.graph.nodes.push(node);
    if (pos) {
      const layout = (this.doc.layout ??= {});
      (layout.positions ??= {})[node.id] = pos;
    }
    this.emit();
    this.emitOp({ op: "add_node", node });
    return node;
  }

  /** Create an epoch: an EpochNode in the graph PLUS a swimlane in the layout
   * so it shows as a lane in Matrix view (it renders as a node in Graph view,
   * invariant 4). The lane is appended below the existing ones; the optional
   * `pos` places the node for the graph view. */
  addEpoch(name?: string, pos?: LayoutRect): EmNode {
    this.checkpoint();
    const id = this.newId();
    const node: EmNode = {
      id,
      name: name ?? this.freshLabel("Epoch"),
      node_type: "EpochNode",
      description: "",
    };
    this.stampNew(node);
    this.doc.graph.nodes.push(node);
    const layout = (this.doc.layout ??= {});
    const lanes = (layout.swimlanes ??= []);
    const DEFAULT_H = 200;
    const y = lanes.length ? Math.max(...lanes.map((l) => l.y + l.height)) : 0;
    const lane: Swimlane = { epoch_id: id, y, height: DEFAULT_H, order: lanes.length };
    lanes.push(lane);
    (layout.positions ??= {})[id] = pos ?? { x: 0, y, w: 140, h: 30 };
    this.emit();
    this.emitOp({ op: "add_node", node }); // swimlane is layout; the EpochNode is the graph part
    // a new epoch always gets its temporal paradata scaffold (group + the two
    // absolute_time_* properties), so the chronology is authorable as paradata
    this.ensureEpochTemporalParadata(id);
    return node;
  }

  /** Create an epoch and insert its swimlane at a given position in the
   *  top-level lane stack (index 0 = top/newest). Optional numeric start/end
   *  seed the chronology (used by the spatial insert to interpolate between
   *  neighbours). INCREMENTAL — no em-core relayout: a DEFAULT_H gap is opened
   *  at the insertion point and only the lanes + nodes BELOW it slide down, so
   *  the existing arrangement is untouched (the layout is recomputed only on the
   *  explicit Layout action). */
  addEpochAt(index: number, name?: string, start?: number, end?: number): EmNode {
    this.checkpoint();
    const id = this.newId();
    const node: EmNode = {
      id,
      name: name ?? this.freshLabel("Epoch"),
      node_type: "EpochNode",
      description: "",
    };
    if (start != null || end != null) {
      const d: Record<string, unknown> = {};
      if (start != null) d.start_time = start;
      if (end != null) d.end_time = end;
      node.data = d;
    }
    this.stampNew(node);
    this.doc.graph.nodes.push(node);
    const layout = (this.doc.layout ??= {});
    const lanes = (layout.swimlanes ??= []);
    const DEFAULT_H = 200;
    const tops = lanes
      .filter((l) => this.parentEpoch(l.epoch_id) == null)
      .sort((a, b) => a.y - b.y);
    const clamped = Math.max(0, Math.min(index, tops.length));
    // y at which the new lane opens: the top of the lane currently at `clamped`,
    // or the bottom of the whole stack when appended.
    const insertionY =
      clamped < tops.length
        ? tops[clamped].y
        : tops.length
          ? Math.max(...tops.map((l) => l.y + l.height))
          : 0;
    // open a gap: everything at/below insertionY slides down by DEFAULT_H
    // (lanes AND node positions) — a rigid shift, not a re-layout.
    for (const l of lanes) if (l.y >= insertionY) l.y += DEFAULT_H;
    const positions = (layout.positions ??= {});
    for (const p of Object.values(positions))
      if (p && typeof p.y === "number" && p.y >= insertionY) p.y += DEFAULT_H;
    lanes.push({ epoch_id: id, y: insertionY, height: DEFAULT_H, order: clamped });
    // renumber top-level order top→bottom
    lanes
      .filter((l) => this.parentEpoch(l.epoch_id) == null)
      .sort((a, b) => a.y - b.y)
      .forEach((l, i) => (l.order = i));
    positions[id] = { x: 0, y: insertionY, w: 140, h: 30 };
    this.emit();
    this.emitOp({ op: "add_node", node });
    this.ensureEpochTemporalParadata(id);
    return node;
  }

  /** Move an epoch's swimlane one slot up (dir -1) or down (dir +1) in the
   *  stack, restacking the y of all lanes. Layout-only (no op-log: lane order
   *  is a visualisation concern; epoch membership stays semantic via edges). */
  reorderEpoch(epochId: string, dir: -1 | 1): boolean {
    // reordering an epoch that already holds units risks upward-connection
    // errors (arrows point down within the stack) — block it (E.D.'s rule)
    if (!this.isEpochEmpty(epochId)) return false;
    const lanes = this.doc.layout?.swimlanes;
    if (!lanes || lanes.length < 2) return false;
    const sorted = [...lanes].sort((a, b) => a.y - b.y); // current visual order
    const i = sorted.findIndex((l) => l.epoch_id === epochId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return false;
    this.checkpoint();
    // Set the new lane order + y. The caller then runs a FROM-SKETCH relayout,
    // which reads this swimlane order (em-core `compute_with_sketch`) and re-lays
    // out every node into its lane semantically — so nodes follow their lane and
    // lane heights are recomputed (a phased lane with sub-bands stays correct),
    // instead of a geometric node-shift that broke on phased/taller lanes.
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    let y = Math.min(...lanes.map((l) => l.y)); // keep the stack's top anchor
    sorted.forEach((l, idx) => {
      l.order = idx;
      l.y = y;
      y += l.height;
    });
    this.emit();
    return true;
  }

  // ---- Epoch temporal paradata (EM 1.6) --------------------------------
  //
  // BUGS-UI · the DISPLAY NAME of a paradata group is `PD_<referent>`
  // (`PD_US_100`), not a prose caption: the group is read next to its referent
  // in lists, in the EMTree and on the canvas, where "US_100 · paradata" is the
  // referent's name plus noise. Ids stay UUIDs — this is the label only.

  // ---- (helper shared by every PDG creation site) ------------------------
  // An epoch's absolute chronology (start/end) is authored as two PropertyNodes
  // — absolute_time_start / absolute_time_end — inside the epoch's
  // ParadataNodeGroup (has_paradata_nodegroup, datamodel 1.6.1). The property
  // VALUE mirrors the epoch's start_time/end_time attribute (what Matrix reads),
  // and the property is the anchor for a provenance chain
  // (combiner → extractor → document). The two views stay in sync via
  // setEpochBound / setPropertyValue.

  /** The ParadataNodeGroup attached to an epoch, or null. */
  epochParadataGroup(epochId: string): string | null {
    for (const e of this.doc.graph.edges)
      if (e.source === epochId && e.edge_type === "has_paradata_nodegroup")
        return e.target;
    return null;
  }

  /** The ParadataNodeGroup attached to ANY node via has_paradata_nodegroup, or
   *  null — the same edge the epochs use, node-agnostic (a US carries its
   *  paradata the same way an epoch carries its chronology). */
  paradataGroupOf(nodeId: string): string | null {
    return this.epochParadataGroup(nodeId);
  }

  /**
   * PDMEM1 · make an ornament (author / license / embargo) a MEMBER of the
   * referent's ParadataNodeGroup, so it shows loose inside the exploded PDG next
   * to the qualia, and the badge previews it. Ensures the referent has a PDG
   * (creates it + `has_paradata_nodegroup` if missing, like
   * `ensureEpochTemporalParadata` does for epochs) and adds
   * `is_in_paradata_nodegroup(ornament → PDG)`. Idempotent; the semantic edge
   * (`has_author`/…) is created by the caller and left untouched. Returns the
   * PDG id (null only if the referent is missing / an epoch — those use the
   * temporal PDG path).
   */
  attachAdornmentToParadata(referentId: string, ornamentId: string): string | null {
    const ref = this.node(referentId);
    if (!ref || ref.node_type === "EpochNode") return null;
    let pdgId = this.paradataGroupOf(referentId);
    if (!pdgId) {
      const pos = this.doc.layout?.positions?.[referentId];
      const g = this.addNode(
        {
          id: this.newId(),
          name: paradataGroupName(ref.name),
          node_type: "ParadataNodeGroup",
          description: "",
        },
        pos
          ? { x: pos.x + (pos.w ?? 90) + 30, y: pos.y, w: 200, h: 44 }
          : undefined,
      );
      pdgId = g.id;
      this.addEdge(referentId, pdgId, "has_paradata_nodegroup");
    }
    if (!this.hasEdge(ornamentId, pdgId, "is_in_paradata_nodegroup"))
      this.addEdge(ornamentId, pdgId, "is_in_paradata_nodegroup");
    return pdgId;
  }

  /** The PropertyNode of a given property_type inside a paradata group. */
  private propInGroup(pdgId: string, propType: string): EmNode | undefined {
    for (const e of this.doc.graph.edges) {
      if (e.edge_type === "is_in_paradata_nodegroup" && e.target === pdgId) {
        const n = this.node(e.source);
        if (
          n &&
          n.node_type === "property" &&
          (n.data as Record<string, unknown> | undefined)?.property_type ===
            propType
        )
          return n;
      }
    }
    return undefined;
  }

  /** The epoch owning the paradata group a temporal PropertyNode lives in. */
  epochOfTemporalProperty(propId: string): string | null {
    let pdgId: string | null = null;
    for (const e of this.doc.graph.edges)
      if (e.edge_type === "is_in_paradata_nodegroup" && e.source === propId) {
        pdgId = e.target;
        break;
      }
    if (!pdgId) return null;
    for (const e of this.doc.graph.edges)
      if (e.edge_type === "has_paradata_nodegroup" && e.target === pdgId)
        return e.source;
    return null;
  }

  /** Ensure an epoch has a ParadataNodeGroup holding absolute_time_start /
   *  absolute_time_end PropertyNodes, seeding each value from the epoch's
   *  start_time/end_time. Idempotent — returns the group + property ids. */
  ensureEpochTemporalParadata(
    epochId: string,
  ): { pdgId: string; startId: string; endId: string } | null {
    const epoch = this.node(epochId);
    if (!epoch || epoch.node_type !== "EpochNode") return null;
    // A phase (sub-epoch) is an EpochNode too, and gets its own temporal PDG —
    // but NO em-core anchor: a phase has no swimlane, so its box is placed
    // view-side at its sub-band's bottom-left (matrix.ts) and hidden when the
    // phase bands are off. Epochs keep the portable em-core bottom-left anchor.
    const isPhase = this.parentEpoch(epochId) != null;
    const ed = (epoch.data ?? {}) as Record<string, unknown>;
    // A stored position matters: Matrix skips nodes without one, so a
    // freshly-created group/property would be invisible. Seed positions in the
    // epoch's lane; the matrix anchoring pass then tucks them bottom-left.
    const lane = this.doc.layout?.swimlanes?.find((l) => l.epoch_id === epochId);
    const laneY = lane?.y ?? 0;
    const laneH = lane?.height ?? 200;
    const baseY = laneY + Math.max(0, laneH - 46);
    let pdgId = this.epochParadataGroup(epochId);
    if (!pdgId) {
      const g = this.addNode(
        {
          id: this.newId(),
          name: paradataGroupName(epoch.name),
          node_type: "ParadataNodeGroup",
          description: "",
        },
        { x: 10, y: baseY - 4, w: 200, h: 44 },
      );
      pdgId = g.id;
      this.addEdge(epochId, pdgId, "has_paradata_nodegroup");
    }
    let slot = 0;
    const ensureProp = (propType: string, boundKey: string): string => {
      const existing = this.propInGroup(pdgId!, propType);
      if (existing) {
        // keep its system anchor current even for a pre-existing prop (epochs
        // only — phases are placed view-side against their sub-band)
        if (!isPhase) this.setAnchor(existing.id, epochId, "bl", slot++ * 100, 8);
        else slot++;
        return existing.id;
      }
      const seed = ed[boundKey] != null ? String(ed[boundKey]) : "";
      // A PropertyNode's VALUE lives in `description` (the EM convention: real
      // graphml-imported properties carry the value there, `value` stays null).
      // property_type is the only thing we keep in data.
      const s = slot++;
      const p = this.addNode(
        {
          id: this.newId(),
          name: propType,
          node_type: "property",
          description: seed,
          data: { property_type: propType },
        },
        { x: 20 + s * 100, y: baseY, w: 90, h: 30 },
      );
      this.addEdge(p.id, pdgId!, "is_in_paradata_nodegroup");
      // system anchor: the box sits bottom-left of the epoch (rule pin, so a
      // Layout run keeps it there — resolved by em-core, portable to Heriverse).
      // Phases get no anchor: they're placed view-side against their sub-band.
      if (!isPhase) this.setAnchor(p.id, epochId, "bl", s * 100, 8);
      return p.id;
    };
    const startId = ensureProp("absolute_time_start", "start_time");
    const endId = ensureProp("absolute_time_end", "end_time");
    return { pdgId, startId, endId };
  }

  /** A load-time migration that needs I/O, so it lands after the load (the
   *  glbs of the readings of 7–11 ott): the same silence as
   *  `ensureAllEpochParadata` — NO checkpoint, NO op, and `dirty` untouched —
   *  but the views are told, since they have drawn the document already.
   *  `fn` mutates the document and says whether it changed anything. */
  migrateSilently(fn: (doc: EmDocument) => boolean): void {
    if (!fn(this.doc)) return;
    const dirty = this.dirty;
    this.emit();
    this.dirty = dirty;
  }

  /** Ensure EVERY epoch has its temporal ParadataNodeGroup — a SILENT
   *  load-time completion: pushes nodes/edges/positions straight onto the doc,
   *  with NO checkpoint, NO op emission and NO change event (so it neither
   *  pollutes undo nor pushes structural additions to a sync host). */
  ensureAllEpochParadata(): void {
    const g = this.doc.graph;
    const layout = (this.doc.layout ??= {});
    const positions = (layout.positions ??= {});
    // phases (has_sub_epoch targets) also get their temporal box, but with NO
    // em-core anchor — they have no swimlane, so matrix.ts places their box at
    // the phase sub-band's bottom-left and hides it when phase bands are off.
    const phaseIds = new Set<string>();
    for (const e of g.edges)
      if (e.edge_type === "has_sub_epoch") phaseIds.add(e.target);
    for (const epoch of [...g.nodes]) {
      if (epoch.node_type !== "EpochNode") continue;
      // every EpochNode (top-level epoch OR phase) gets a box. NOTE: do NOT gate
      // on having a swimlane — a Blender sync snapshot has NO swimlanes at load
      // (em-core computes them after), yet those epochs still need their box.
      const isPhase = phaseIds.has(epoch.id);
      const existingPdg = this.epochParadataGroup(epoch.id);
      if (existingPdg) {
        // PDG already present (e.g. a Blender sync snapshot, or an earlier
        // session): don't recreate it. For epochs, STILL ensure the bottom-left
        // system anchor exists (setAnchor is idempotent) so a Layout run
        // positions it; phases carry no anchor (placed view-side), so skip.
        if (isPhase) continue;
        const order = ["absolute_time_start", "absolute_time_end"];
        g.edges
          .filter(
            (e) =>
              e.edge_type === "is_in_paradata_nodegroup" && e.target === existingPdg,
          )
          .map((e) => this.node(e.source))
          .filter(
            (n): n is EmNode =>
              !!n &&
              n.node_type === "property" &&
              order.includes(
                String((n.data as Record<string, unknown> | undefined)?.property_type),
              ),
          )
          .sort(
            (a, b) =>
              order.indexOf(String((a.data as Record<string, unknown>).property_type)) -
              order.indexOf(String((b.data as Record<string, unknown>).property_type)),
          )
          .forEach((p, s) => this.setAnchor(p.id, epoch.id, "bl", s * 100, 8));
        continue;
      }
      const ed = (epoch.data ?? {}) as Record<string, unknown>;
      const lane = layout.swimlanes?.find((l) => l.epoch_id === epoch.id);
      const baseY = (lane?.y ?? 0) + Math.max(0, (lane?.height ?? 200) - 46);
      const pdgId = this.newId();
      g.nodes.push({
        id: pdgId,
        name: paradataGroupName(epoch.name),
        node_type: "ParadataNodeGroup",
        description: "",
      });
      positions[pdgId] = { x: 10, y: baseY - 4, w: 200, h: 44 };
      g.edges.push({
        id: `${epoch.id}__has_paradata_nodegroup__${pdgId}`,
        source: epoch.id,
        target: pdgId,
        edge_type: "has_paradata_nodegroup",
      });
      let slot = 0;
      for (const [pt, bk] of [
        ["absolute_time_start", "start_time"],
        ["absolute_time_end", "end_time"],
      ] as const) {
        const pid = this.newId();
        g.nodes.push({
          id: pid,
          name: pt,
          node_type: "property",
          // value lives in description (uniform with real EM property data)
          description: ed[bk] != null ? String(ed[bk]) : "",
          data: { property_type: pt },
        });
        const s = slot++;
        positions[pid] = { x: 20 + s * 100, y: baseY, w: 90, h: 30 };
        g.edges.push({
          id: `${pid}__is_in_paradata_nodegroup__${pdgId}`,
          source: pid,
          target: pdgId,
          edge_type: "is_in_paradata_nodegroup",
        });
        // system anchor: epoch bottom-left (resolved by em-core on layout).
        // Phases carry no anchor — matrix.ts places their box view-side.
        if (!isPhase)
          (layout.anchors ??= []).push({
            node: pid,
            to: epoch.id,
            corner: "bl",
            dx: s * 100,
            dy: 8,
          });
      }
    }
  }

  // ---- Phases (sub-epochs, EM 1.6 periodisation) -----------------------
  // A phase is an EpochNode connected to its parent epoch by has_sub_epoch
  // (reverse is_in_epoch). Phases partition the parent's time-span. Rendering
  // as lane sub-bands comes later; here we manage the data + coherence.

  /** The sub-epochs (phases) of an epoch, in creation order. */
  epochPhases(epochId: string): string[] {
    const out: string[] = [];
    for (const e of this.doc.graph.edges)
      if (e.edge_type === "has_sub_epoch" && e.source === epochId)
        out.push(e.target);
    return out;
  }

  /** The parent epoch of a phase (via has_sub_epoch), or null if top-level. */
  parentEpoch(phaseId: string): string | null {
    for (const e of this.doc.graph.edges)
      if (e.edge_type === "has_sub_epoch" && e.target === phaseId)
        return e.source;
    return null;
  }

  /** True if no unit is attributed to this epoch (or its phases) via
   *  has_first_epoch / survive_in_epoch — i.e. it is safe to reorder without
   *  risking upward-connection errors. */
  isEpochEmpty(epochId: string): boolean {
    const ids = new Set([epochId, ...this.epochPhases(epochId)]);
    for (const e of this.doc.graph.edges)
      if (
        (e.edge_type === "has_first_epoch" ||
          e.edge_type === "survive_in_epoch") &&
        ids.has(e.target)
      )
        return false;
    return true;
  }

  /** Create a phase (sub-epoch) under an epoch: an EpochNode joined by
   *  has_sub_epoch. No swimlane (rendering as a lane sub-band comes later). */
  addPhase(epochId: string, name?: string, pos?: LayoutRect): EmNode {
    this.checkpoint();
    // the FIRST phase of a top-level epoch absorbs all the epoch's directly
    // attributed units, so there is no confusing "unphased" residual; the user
    // then adds more phases and repartitions (E.D., 2026-07).
    const isFirstPhase =
      this.parentEpoch(epochId) == null && this.epochPhases(epochId).length === 0;
    const id = this.newId();
    const n = this.epochPhases(epochId).length + 1;
    const node: EmNode = {
      id,
      name: name ?? `Phase ${n}`,
      node_type: "EpochNode",
      description: "",
    };
    this.stampNew(node);
    this.doc.graph.nodes.push(node);
    if (pos) {
      const layout = (this.doc.layout ??= {});
      (layout.positions ??= {})[id] = pos;
    }
    this.emit();
    this.emitOp({ op: "add_node", node });
    this.addEdge(epochId, id, "has_sub_epoch");
    // give the new phase its temporal PDG right away (auto for all phases, like
    // epochs). The has_sub_epoch edge is in place, so ensureEpochTemporalParadata
    // sees it as a phase and skips the em-core anchor (view-side placement).
    this.ensureEpochTemporalParadata(id);
    // absorb the epoch's units into this first phase (re-target has_first_epoch /
    // survive_in_epoch that pointed at the epoch to the new phase)
    if (isFirstPhase) {
      const g = this.doc.graph;
      const removed = g.edges.filter(
        (e) =>
          (e.edge_type === "has_first_epoch" ||
            e.edge_type === "survive_in_epoch") &&
          e.target === epochId,
      );
      if (removed.length) {
        const rset = new Set(removed);
        g.edges = g.edges.filter((e) => !rset.has(e));
        const added: EmEdge[] = removed.map((e) => ({
          id: `${e.source}__${e.edge_type}__${id}`,
          source: e.source,
          target: id,
          edge_type: e.edge_type,
        }));
        g.edges.push(...added);
        this.emit();
        for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
        for (const e of added) this.emitOp({ op: "add_edge", edge: e });
      }
    }
    return node;
  }

  /** Chronology-coherence warnings for an epoch and its phases: bounds order,
   *  phases within the parent span, sibling phase overlap. Empty = coherent. */
  epochCoherenceWarnings(epochId: string): string[] {
    const warns: string[] = [];
    const num = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const bounds = (
      id: string,
    ): { s: number | null; e: number | null; name: string } => {
      const d = (this.node(id)?.data ?? {}) as Record<string, unknown>;
      return {
        s: num(d.start_time),
        e: num(d.end_time),
        name: this.node(id)?.name ?? id,
      };
    };
    // A bound that was typed but doesn't parse as a number is silently ignored
    // by the ordering/coherence maths — flag it so the user knows their date
    // won't sort the lane.
    const nonNumericWarn = (id: string): void => {
      const d = (this.node(id)?.data ?? {}) as Record<string, unknown>;
      const name = this.node(id)?.name ?? id;
      for (const [k, lbl] of [
        ["start_time", "start"],
        ["end_time", "end"],
      ] as const) {
        const raw = d[k];
        if (raw != null && String(raw).trim() !== "" && num(raw) == null)
          warns.push(`${name}: ${lbl} "${raw}" is not a number.`);
      }
    };
    // If this is a PHASE, report ITS conflicts (vs the parent span + siblings)
    // so the same warnings show at phase level, not only on the parent epoch.
    const parentId = this.parentEpoch(epochId);
    if (parentId != null) {
      const par = bounds(parentId);
      const ph = bounds(epochId);
      nonNumericWarn(epochId);
      if (ph.s != null && ph.e != null && ph.s > ph.e)
        warns.push(`${ph.name}: start (${ph.s}) is after end (${ph.e}).`);
      if (par.s != null && ph.s != null && ph.s < par.s)
        warns.push(`${ph.name}: starts before its epoch (${ph.s} < ${par.s}).`);
      if (par.e != null && ph.e != null && ph.e > par.e)
        warns.push(`${ph.name}: ends after its epoch (${ph.e} > ${par.e}).`);
      for (const sid of this.epochPhases(parentId)) {
        if (sid === epochId) continue;
        const sib = bounds(sid);
        if (
          ph.s != null &&
          ph.e != null &&
          sib.s != null &&
          sib.e != null &&
          ph.s < sib.e &&
          sib.s < ph.e
        )
          warns.push(`${ph.name} overlaps ${sib.name}.`);
      }
      return warns;
    }
    const ep = bounds(epochId);
    nonNumericWarn(epochId);
    for (const pid of this.epochPhases(epochId)) nonNumericWarn(pid);
    if (ep.s != null && ep.e != null && ep.s > ep.e)
      warns.push(`${ep.name}: start (${ep.s}) is after end (${ep.e}).`);
    const phases = this.epochPhases(epochId).map(bounds);
    for (const ph of phases) {
      if (ph.s != null && ph.e != null && ph.s > ph.e)
        warns.push(`${ph.name}: start (${ph.s}) is after end (${ph.e}).`);
      if (ep.s != null && ph.s != null && ph.s < ep.s)
        warns.push(`${ph.name}: starts before its epoch (${ph.s} < ${ep.s}).`);
      if (ep.e != null && ph.e != null && ph.e > ep.e)
        warns.push(`${ph.name}: ends after its epoch (${ph.e} > ${ep.e}).`);
    }
    const withStart = phases.filter((p) => p.s != null) as {
      s: number;
      e: number | null;
      name: string;
    }[];
    withStart.sort((a, b) => a.s - b.s);
    for (let i = 1; i < withStart.length; i++)
      if (
        withStart[i - 1].e != null &&
        withStart[i].s < (withStart[i - 1].e as number)
      )
        warns.push(`${withStart[i].name} overlaps ${withStart[i - 1].name}.`);
    return warns;
  }

  // ---- chronology ordering & cross-epoch validation (item 10) ----------

  /** Numeric start_time of an epoch/phase, or null if unset/non-numeric. */
  private startOf(id: string): number | null {
    const n = Number((this.node(id)?.data as { start_time?: unknown })?.start_time);
    // BUGFIX-EPOCH: an undated epoch has no finite start_time → null, so the
    // ordering keeps it in document/manual order instead of treating it as a
    // date. A real, explicit -10000 (e.g. a "Geologic" epoch, as in Aiano) is a
    // legitimate oldest date and is NOT special-cased.
    return Number.isFinite(n) ? n : null;
  }
  private endOf(id: string): number | null {
    const n = Number((this.node(id)?.data as { end_time?: unknown })?.end_time);
    return Number.isFinite(n) ? n : null;
  }

  /** Ids of the top-level epochs (EpochNodes that are not a phase). */
  topEpochIds(): string[] {
    return this.doc.graph.nodes
      .filter(
        (n) =>
          (n.node_type === "EpochNode" || n.node_type === "epoch") &&
          this.parentEpoch(n.id) == null,
      )
      .map((n) => n.id);
  }

  /** Top-level epochs in CHRONOLOGICAL reading order — OLDEST first (a story
   *  runs forward in time). Uses the same date key the lanes order by
   *  (`start_time` via `startOf`); undated epochs keep their document order and
   *  fall after the dated ones. Reused by the narrative auto-scaffold (NARR1). */
  topEpochIdsChrono(): string[] {
    const ids = this.topEpochIds();
    const pos = new Map(ids.map((id, i) => [id, i]));
    return ids.slice().sort((a, b) => {
      const sa = this.startOf(a);
      const sb = this.startOf(b);
      if (sa == null && sb == null) return pos.get(a)! - pos.get(b)!;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sa - sb || pos.get(a)! - pos.get(b)!;
    });
  }

  /** Does the current lane stack (top→bottom) follow newest-first chronology?
   *  Undated epochs are skipped (can't judge). True when there's nothing to
   *  order or dates agree with the visual order. */
  lanesMatchDateOrder(): boolean {
    const lanes = this.doc.layout?.swimlanes;
    if (!lanes || lanes.length < 2) return true;
    const order = lanes
      .filter((l) => this.parentEpoch(l.epoch_id) == null)
      .slice()
      .sort((a, b) => a.y - b.y)
      .map((l) => l.epoch_id);
    let prev: number | null = null;
    for (const id of order) {
      const s = this.startOf(id);
      if (s == null) continue;
      if (prev != null && s > prev) return false; // a lower lane is NEWER
      prev = s;
    }
    return true;
  }

  /**
   * Move a PHASE one slot up (dir −1) or down (dir +1) among its siblings.
   * Returns false when the move would be meaningless — see below.
   *
   * **Phases are ordered by their DATE, not by an order field.** The Matrix builds
   * the sub-band stack by sorting a parent's phases on `start_time`, newest on
   * top (`views/matrix.ts`, `collect`); only UNDATED phases fall back to the order
   * of their `has_sub_epoch` edges, which is what this method swaps.
   *
   * So: for undated phases — the normal case right after creating them — this is
   * the reorder the user expects. For a DATED phase it would be a no-op, because
   * the sort puts it straight back. **Refused rather than silently ignored**, on
   * the same principle as `reorderEpoch` refusing a non-empty epoch: a button that
   * looks like it worked and did nothing is worse than one that says no. The
   * caller shows the buttons disabled, and the way to move a dated phase is to
   * change its date.
   *
   * Edge order — not a layout field — because a phase sequence IS chronological
   * information about the site, unlike lane y or a camera position: it belongs in
   * the document.
   */
  reorderPhase(phaseId: string, dir: -1 | 1): boolean {
    const parent = this.parentEpoch(phaseId);
    if (!parent) return false; // not a phase
    const siblings = this.epochPhases(parent);
    if (siblings.length < 2) return false;
    const dated = (id: string): boolean => this.startOf(id) != null;
    const i = siblings.indexOf(phaseId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= siblings.length) return false;
    // Either endpoint dated → the date decides, and the swap would be undone by
    // the sort. Say no.
    if (dated(phaseId) || dated(siblings[j])) return false;

    // Swap the two `has_sub_epoch` edges in place, which is what the undated
    // fallback order reads.
    const edges = this.doc.graph.edges;
    const at = (target: string): number =>
      edges.findIndex(
        (e) => e.edge_type === "has_sub_epoch" &&
          e.source === parent && e.target === target,
      );
    const ei = at(phaseId);
    const ej = at(siblings[j]);
    if (ei < 0 || ej < 0) return false;
    this.checkpoint();
    [edges[ei], edges[ej]] = [edges[ej], edges[ei]];
    this.emit();
    return true;
  }

  /** Does this epoch/phase declare a start date? Public because the UI needs to
   *  EXPLAIN why a reorder is refused, and `startOf` is an internal accessor —
   *  the question the interface asks is "is it dated", not "what is its start". */
  isDated(epochId: string): boolean {
    return this.startOf(epochId) != null;
  }

  /** True when this phase can be moved in direction `dir` — drives whether the
   *  inspector offers the button at all, so the answer comes from one place. */
  canReorderPhase(phaseId: string, dir: -1 | 1): boolean {
    const parent = this.parentEpoch(phaseId);
    if (!parent) return false;
    const siblings = this.epochPhases(parent);
    const i = siblings.indexOf(phaseId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= siblings.length) return false;
    return this.startOf(phaseId) == null && this.startOf(siblings[j]) == null;
  }

  /** Reorder the top-level swimlanes newest-first by start_time (undated → tail,
   *  stable). Layout-only, like reorderEpoch — NOT gated by isEpochEmpty because
   *  this is canonicalisation, not an arbitrary move; the caller runs a
   *  from-sketch relayout so em-core re-lays nodes into the new lane order. */
  sortLanesByDate(): void {
    const lanes = this.doc.layout?.swimlanes;
    if (!lanes || lanes.length < 2) return;
    const tops = lanes.filter((l) => this.parentEpoch(l.epoch_id) == null);
    if (tops.length < 2) return;
    this.checkpoint();
    const idx = new Map(tops.map((l, i) => [l, i]));
    const sorted = [...tops].sort((a, b) => {
      const sa = this.startOf(a.epoch_id);
      const sb = this.startOf(b.epoch_id);
      if (sa == null && sb == null) return idx.get(a)! - idx.get(b)!;
      if (sa == null) return 1;
      if (sb == null) return -1;
      if (sb !== sa) return sb - sa; // newest (larger start) on top
      return idx.get(a)! - idx.get(b)!;
    });
    let y = Math.min(...tops.map((l) => l.y));
    sorted.forEach((l, i) => {
      l.order = i;
      l.y = y;
      y += l.height;
    });
    this.emit();
  }

  /** Overlaps between the date spans of top-level epochs (a real chronology
   *  conflict — two epochs claiming the same absolute time). Gaps are NOT
   *  reported: a hiatus between epochs is legitimate in archaeology. */
  crossEpochWarnings(): string[] {
    // the words of the warnings table; the Chronology window says it in the
    // reader's language, from the same data (`epochOverlaps`)
    return this.epochOverlaps().map((o) =>
      `${this.node(o.later)?.name ?? o.later} overlaps ${this.node(o.earlier)?.name ?? o.earlier} by ${o.delta} years (${o.from}–${o.to}).`);
  }

  /**
   * AUDIT N5 · the OVERLAPS between top-level epochs, as data: which two, the
   * interval they share and its length, and whether one lies entirely inside
   * the other (then it is usually a PHASE of it, E.D.: «epoche e periodi non si
   * sovrappongono»).
   *
   * EVERY PAIR, not neighbours by start. The old check compared each epoch
   * with the one before it only, so an epoch nested in a long one hid the next
   * overlap: measured on `chronology-overlaps.em.json`, Medioevo 900–1300 with
   * Alto medioevo 950–1100 inside it and Tardo medioevo 1280–1450 — the 20
   * years Tardo medioevo shares with Medioevo were never reported.
   */
  epochOverlaps(): EpochOverlap[] {
    const tops = this.topEpochIds()
      .map((id) => ({ id, s: this.startOf(id), e: this.endOf(id) }))
      .filter((x): x is { id: string; s: number; e: number } => x.s != null && x.e != null && x.s <= x.e);
    const out: EpochOverlap[] = [];
    for (let i = 0; i < tops.length; i++)
      for (let j = i + 1; j < tops.length; j++) {
        const [p, q] = [tops[i], tops[j]];
        const from = Math.max(p.s, q.s), to = Math.min(p.e, q.e);
        if (from >= to) continue;
        // the LATER is the one that starts later (a tie: the one that ends first)
        const later = p.s !== q.s ? (p.s > q.s ? p : q) : (p.e <= q.e ? p : q);
        const earlier = later === p ? q : p;
        const inP = p.s >= q.s && p.e <= q.e, inQ = q.s >= p.s && q.e <= p.e;
        const inner = inP && inQ ? later : inP ? p : inQ ? q : null;
        const outer = inner ? (inner === p ? q : p) : null;
        out.push({
          later: later.id, earlier: earlier.id, from, to, delta: to - from,
          inner: inner?.id ?? null, outer: outer?.id ?? null,
          overhang: inner ? 0 : Math.min(Math.abs(later.e - earlier.e), Math.abs(later.s - earlier.s)),
        });
      }
    // the widest first: the one most likely to be a wrong bound
    return out.sort((a, b) => b.delta - a.delta || a.from - b.from);
  }

  /** AUDIT N5 · «Rendi fase di Y»: X becomes a sub-epoch of Y (`has_sub_epoch`).
   *  Its units stay with it (their `has_first_epoch` still points at X), its
   *  lane goes (a phase is a band inside its epoch's lane). One undo step. */
  makePhaseOf(innerId: string, outerId: string): void {
    if (innerId === outerId || !this.node(innerId) || !this.node(outerId)) return;
    this.batch(() => {
      for (const e of this.doc.graph.edges.filter((x) => x.edge_type === "has_sub_epoch" && x.target === innerId))
        this.deleteEdge(e);
      this.addEdge(outerId, innerId, "has_sub_epoch");
      const lanes = this.doc.layout?.swimlanes;
      if (Array.isArray(lanes)) {
        const kept = lanes.filter((l) => l.epoch_id !== innerId);
        kept.forEach((l, i) => { l.order = i; });
        this.doc.layout!.swimlanes = kept;
      }
    });
  }

  /** AUDIT N5 · «— epoca —»: a phase goes back to being an epoch. One step. */
  makeTopEpoch(phaseId: string): void {
    const edges = this.doc.graph.edges.filter((x) => x.edge_type === "has_sub_epoch" && x.target === phaseId);
    if (!edges.length) return;
    this.batch(() => { for (const e of edges) this.deleteEdge(e); });
  }

  /** All chronology problems across the document: cross-epoch span overlaps +
   *  every top-level epoch's coherence warnings (start>end, phases outside the
   *  parent span, sibling-phase overlaps, non-numeric bounds — the per-epoch
   *  call already covers that epoch's phases). Deduped, for the ingestion /
   *  banner report. Lane ordering (lanesMatchDateOrder) is reported separately
   *  because it has a one-click fix. */
  chronologyIssues(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (w: string) => {
      if (!seen.has(w)) {
        seen.add(w);
        out.push(w);
      }
    };
    for (const w of this.crossEpochWarnings()) add(w);
    for (const id of this.topEpochIds())
      for (const w of this.epochCoherenceWarnings(id)) add(w);
    return out;
  }

  /** Set an epoch's start/end bound; mirror the value into its
   *  absolute_time_* PropertyNode when the paradata group exists. */
  setEpochBound(epochId: string, which: "start" | "end", value: string): void {
    // AUDIT N5 · the bound and its absolute_time_* property: ONE undo step
    this.batch(() => this.setEpochBoundNow(epochId, which, value));
  }
  private setEpochBoundNow(epochId: string, which: "start" | "end", value: string): void {
    const epoch = this.node(epochId);
    if (!epoch) return;
    const v = value.trim();
    const boundKey = which === "start" ? "start_time" : "end_time";
    const propType =
      which === "start" ? "absolute_time_start" : "absolute_time_end";
    const d = { ...((epoch.data ?? {}) as Record<string, unknown>) };
    // Store the bound as a NUMBER when it parses (canonical sort key — em-core
    // reads it with as_f64 to order the lanes, and a JSON string there sorts to
    // f64::MIN). A non-numeric entry is kept as-is (surfaced by
    // epochCoherenceWarnings) so nothing the user typed is silently dropped.
    if (v === "") delete d[boundKey];
    else {
      const n = Number(v);
      d[boundKey] = Number.isFinite(n) && v !== "" ? n : v;
    }
    this.updateNode(epochId, { data: d });
    const pdgId = this.epochParadataGroup(epochId);
    if (pdgId) {
      const p = this.propInGroup(pdgId, propType);
      if (p) this.updateNode(p.id, { description: v }); // value = description
    }
  }

  /** Set a PropertyNode's value; if it is an epoch temporal property, mirror
   *  the value back onto the owning epoch's start_time/end_time. */
  setPropertyValue(propId: string, value: string): void {
    const p = this.node(propId);
    if (!p) return;
    const v = value.trim();
    // the value lives in `description` (uniform with real EM property data)
    this.updateNode(propId, { description: v });
    const propType = ((p.data ?? {}) as Record<string, unknown>).property_type;
    if (propType === "absolute_time_start" || propType === "absolute_time_end") {
      const epochId = this.epochOfTemporalProperty(propId);
      const epoch = epochId ? this.node(epochId) : undefined;
      if (epoch) {
        const boundKey =
          propType === "absolute_time_start" ? "start_time" : "end_time";
        const ed = { ...((epoch.data ?? {}) as Record<string, unknown>) };
        if (v === "") delete ed[boundKey];
        else ed[boundKey] = v;
        this.updateNode(epoch.id, { data: ed });
      }
    }
  }

  /**
   * `attributes` are DECLARED attributes of the relation — today one:
   * `inherited: true` on the `has_property` of an heir (connections 1.6.23). They
   * travel in the op (`add_edge` carries them, crdt.ts and s3dgraphy crdt.py
   * alike), so a declaration made live reaches the other side as a declaration.
   */
  addEdge(source: string, target: string, edgeType: string,
          attributes?: Record<string, unknown>): EmEdge {
    this.checkpoint();
    const ids = new Set(this.doc.graph.edges.map((e) => e.id));
    let id = `${source}__${edgeType}__${target}`;
    let i = 2;
    while (ids.has(id)) id = `${source}__${edgeType}__${target}__${i++}`;
    const edge: EmEdge = { id, source, target, edge_type: edgeType,
                           ...(attributes && Object.keys(attributes).length
                             ? { attributes: { ...attributes } } : {}) };
    this.doc.graph.edges.push(edge);
    this.emit();
    this.emitOp({ op: "add_edge", edge });
    return edge;
  }

  hasEdge(source: string, target: string, edgeType: string): boolean {
    return this.doc.graph.edges.some(
      (e) =>
        e.source === source && e.target === target && e.edge_type === edgeType,
    );
  }

  deleteNode(id: string): void {
    this.checkpoint();
    const g = this.doc.graph;
    g.nodes = g.nodes.filter((n) => n.id !== id);
    g.edges = g.edges.filter((e) => e.source !== id && e.target !== id);
    const layout = this.doc.layout;
    if (layout) {
      if (layout.positions) delete layout.positions[id];
      if (layout.folded_groups)
        layout.folded_groups = layout.folded_groups.filter((f) => f !== id);
      if (layout.group_spaces) {
        delete layout.group_spaces[id];
        for (const space of Object.values(layout.group_spaces))
          delete space[id];
      }
    }
    this.emit();
    this.emitOp({ op: "delete_node", node_id: id });
  }

  /** Delete several nodes as ONE undo step (multi-selection). */
  deleteNodes(ids: string[]): void {
    if (!ids.length) return;
    if (ids.length === 1) return this.deleteNode(ids[0]);
    this.checkpoint();
    const set = new Set(ids);
    const g = this.doc.graph;
    g.nodes = g.nodes.filter((n) => !set.has(n.id));
    g.edges = g.edges.filter((e) => !set.has(e.source) && !set.has(e.target));
    const layout = this.doc.layout;
    if (layout) {
      for (const id of ids) {
        if (layout.positions) delete layout.positions[id];
        if (layout.group_spaces) {
          delete layout.group_spaces[id];
          for (const space of Object.values(layout.group_spaces))
            delete space[id];
        }
      }
      if (layout.folded_groups)
        layout.folded_groups = layout.folded_groups.filter((f) => !set.has(f));
    }
    this.emit();
    for (const id of ids) this.emitOp({ op: "delete_node", node_id: id });
  }

  deleteEdge(edge: EmEdge): void {
    this.checkpoint();
    const g = this.doc.graph;
    const ix = g.edges.findIndex(
      (e) =>
        (edge.id && e.id === edge.id) ||
        (e.source === edge.source &&
          e.target === edge.target &&
          e.edge_type === edge.edge_type),
    );
    let removed: EmEdge | null = null;
    if (ix >= 0) {
      removed = g.edges[ix];
      g.edges.splice(ix, 1);
    }
    this.emit();
    if (removed) this.emitOp({ op: "delete_edge", edge: removed });
  }

  /** What «Uniforma le grafie» would do to the LIVE edges, without doing it. */
  spellingPlan(): SpellingPlan<EmEdge> {
    return planUniformSpellings(this.liveEdges());
  }

  /**
   * «Uniforma le grafie» — the explicit command that brings the document to the
   * canonical spelling (never done silently at load: a spelling is accepted when
   * read). ONE undo step, and every change leaves through the same door as an
   * inspector edit: `delete_edge` / `add_edge` on `emitOp`, which a room turns
   * into `remove_edge` / `add_edge` and a sidecar forwards as is.
   *
   * A respelled edge keeps every key it carried (`attributes`, label, …) and its
   * place in the list; only `edge_type` and `id` change. The id is NEW, not the
   * old one: in a room the old edge stays as a tombstone under its id, and
   * `remove_edge` matches by id first — one id for two relations would make the
   * next removal hit the tombstone and leave the live edge standing
   * (check-uniform-spellings measures it).
   */
  uniformSpellings(): SpellingPlan<EmEdge> {
    const plan = this.spellingPlan();
    if (!plan.steps.length) return plan;
    this.batch(() => {
      const g = this.doc.graph;
      const ids = new Set(g.edges.map((e) => e.id));
      for (const step of plan.steps) {
        const ix = g.edges.indexOf(step.edge);
        if (ix < 0) continue;
        const old = g.edges[ix];
        if (step.kind === "respell") {
          const base = `${old.source}__${step.canonical}__${old.target}`;
          let id = base;
          let i = 2;
          while (ids.has(id)) id = `${base}__${i++}`;
          ids.add(id);
          const edge: EmEdge = {
            ...(JSON.parse(JSON.stringify(old)) as EmEdge),
            id,
            edge_type: step.canonical,
          };
          g.edges.splice(ix, 1, edge);
          this.emitOp({ op: "delete_edge", edge: old });
          this.emitOp({ op: "add_edge", edge });
        } else {
          g.edges.splice(ix, 1);
          this.emitOp({ op: "delete_edge", edge: old });
        }
      }
    });
    return plan;
  }

  /** Remove a node from a container/group: drop the membership edge(s) from
   * `nodeId` to `containerId` (is_part_of / is_in_*). Other memberships stay.
   * `pos` places the freed node on the canvas at the drop point. */
  removeFromGroup(nodeId: string, containerId: string, pos?: LayoutRect): void {
    this.checkpoint();
    const g = this.doc.graph;
    const removed: EmEdge[] = [];
    g.edges = g.edges.filter((e) => {
      const drop =
        e.source === nodeId &&
        e.target === containerId &&
        MEMBERSHIP_EDGES.has(e.edge_type ?? "");
      if (drop) removed.push(e);
      return !drop;
    });
    if (pos) {
      const layout = (this.doc.layout ??= {});
      (layout.positions ??= {})[nodeId] = pos;
    }
    this.emit();
    for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
  }

  /** Move a node INTO a group (drop-into-group, inverse of removeFromGroup):
   * re-parent by dropping the OLD primary membership (secondaries stay) and
   * adding a new membership edge of `edgeType` to `groupId`. */
  moveToGroup(
    nodeId: string,
    groupId: string,
    edgeType: string,
    oldContainerId: string | null,
  ): void {
    if (groupId === nodeId) return;
    this.checkpoint();
    const g = this.doc.graph;
    const removed: EmEdge[] = [];
    if (oldContainerId) {
      g.edges = g.edges.filter((e) => {
        const drop =
          e.source === nodeId &&
          e.target === oldContainerId &&
          MEMBERSHIP_EDGES.has(e.edge_type ?? "");
        if (drop) removed.push(e);
        return !drop;
      });
      // drop the stale group-local position so it re-grids in the new box
      const sp = this.doc.layout?.group_spaces?.[oldContainerId];
      if (sp) delete sp[nodeId];
    }
    const exists = g.edges.some(
      (e) => e.source === nodeId && e.target === groupId && e.edge_type === edgeType,
    );
    let addedEdge: EmEdge | null = null;
    if (!exists) {
      addedEdge = {
        id: `${nodeId}__${edgeType}__${groupId}`,
        source: nodeId,
        target: groupId,
        edge_type: edgeType,
      };
      g.edges.push(addedEdge);
    }
    this.emit();
    for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
    if (addedEdge) this.emitOp({ op: "add_edge", edge: addedEdge });
  }

  /** Create a NEW group node of `groupType` and make each of `nodeIds` a
   * member of it (edge `edgeType`). Used by right-click → Group (D3). */
  groupNodes(
    nodeIds: string[],
    groupType: string,
    edgeType: string,
    pos?: LayoutRect,
  ): EmNode {
    this.checkpoint();
    const id = this.newId();
    const group: EmNode = {
      id,
      name: this.freshLabel(groupType),
      node_type: groupType,
      description: "",
    };
    this.stampNew(group);
    this.doc.graph.nodes.push(group);
    const added: EmEdge[] = [];
    for (const nid of nodeIds) {
      if (nid === id) continue;
      const dup = this.doc.graph.edges.some(
        (e) => e.source === nid && e.target === id && e.edge_type === edgeType,
      );
      if (!dup) {
        const edge: EmEdge = {
          id: `${nid}__${edgeType}__${id}`,
          source: nid,
          target: id,
          edge_type: edgeType,
        };
        this.doc.graph.edges.push(edge);
        added.push(edge);
      }
    }
    if (pos) {
      const l = (this.doc.layout ??= {});
      (l.positions ??= {})[id] = pos;
    }
    this.emit();
    this.emitOp({ op: "add_node", node: group });
    for (const edge of added) this.emitOp({ op: "add_edge", edge });
    return group;
  }

  /** Re-assign the FIRST epoch (swimlane) of one or more nodes: drop each
   * node's existing has_first_epoch edge and point it at `epochId`. Used when
   * a node/group is dragged into a different lane. */
  setFirstEpoch(nodeIds: string[], epochId: string): void {
    this.checkpoint();
    const g = this.doc.graph;
    const removed: EmEdge[] = [];
    const added: EmEdge[] = [];
    for (const nid of nodeIds) {
      if (nid === epochId) continue;
      g.edges = g.edges.filter((e) => {
        const drop = e.source === nid && e.edge_type === "has_first_epoch";
        if (drop) removed.push(e);
        return !drop;
      });
      const edge: EmEdge = {
        id: `${nid}__has_first_epoch__${epochId}`,
        source: nid,
        target: epochId,
        edge_type: "has_first_epoch",
      };
      g.edges.push(edge);
      added.push(edge);
    }
    this.emit();
    for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
    for (const e of added) this.emitOp({ op: "add_edge", edge: e });
  }

  /** Units attributed to a phase (has_first_epoch / survive_in_epoch) plus its
   *  own sub-phases — the nodes orphaned if the phase is deleted. */
  phaseOrphans(phaseId: string): { units: string[]; subPhases: string[] } {
    const units: string[] = [];
    const subPhases: string[] = [];
    for (const e of this.doc.graph.edges) {
      if (
        e.target === phaseId &&
        (e.edge_type === "has_first_epoch" || e.edge_type === "survive_in_epoch")
      )
        units.push(e.source);
      if (e.source === phaseId && e.edge_type === "has_sub_epoch")
        subPhases.push(e.target);
    }
    return { units, subPhases };
  }

  /** Delete a phase (sub-epoch), re-homing the units attributed to it — and any
   *  sub-phases it holds — onto `reassignTo` (typically the parent epoch, to
   *  un-phase the units, or an adjacent sibling phase). Emits granular edge ops
   *  so a synced host replays the same retargeting, then drops the phase node. */
  deletePhase(phaseId: string, reassignTo: string): void {
    this.checkpoint();
    const g = this.doc.graph;
    // the phase's temporal PDG + its property members are deleted too — otherwise
    // they'd be orphaned (no has_paradata_nodegroup source) and render as stray
    // "· paradata" boxes on the canvas.
    const pdgId = g.edges.find(
      (e) => e.edge_type === "has_paradata_nodegroup" && e.source === phaseId,
    )?.target;
    const propIds = pdgId
      ? g.edges
          .filter(
            (e) => e.edge_type === "is_in_paradata_nodegroup" && e.target === pdgId,
          )
          .map((e) => e.source)
      : [];
    const del = new Set<string>([
      phaseId,
      ...(pdgId ? [pdgId] : []),
      ...propIds,
    ]);
    const removed: EmEdge[] = [];
    const added: EmEdge[] = [];
    const kept: EmEdge[] = [];
    for (const e of g.edges) {
      if (
        e.target === phaseId &&
        (e.edge_type === "has_first_epoch" || e.edge_type === "survive_in_epoch")
      ) {
        removed.push(e);
        const ne: EmEdge = {
          id: `${e.source}__${e.edge_type}__${reassignTo}`,
          source: e.source,
          target: reassignTo,
          edge_type: e.edge_type,
        };
        added.push(ne);
        kept.push(ne);
      } else if (e.source === phaseId && e.edge_type === "has_sub_epoch") {
        // reparent this sub-phase under the new home
        removed.push(e);
        const ne: EmEdge = {
          id: `${reassignTo}__has_sub_epoch__${e.target}`,
          source: reassignTo,
          target: e.target,
          edge_type: "has_sub_epoch",
        };
        added.push(ne);
        kept.push(ne);
      } else if (del.has(e.source) || del.has(e.target)) {
        // edges on the phase, its PDG or its props (incl. the parent→phase link)
        removed.push(e);
      } else {
        kept.push(e);
      }
    }
    g.edges = kept;
    g.nodes = g.nodes.filter((n) => !del.has(n.id));
    const layout = this.doc.layout;
    if (layout?.positions) for (const id of del) delete layout.positions[id];
    if (layout?.anchors)
      layout.anchors = layout.anchors.filter(
        (a) => !del.has(a.node) && !del.has(a.to),
      );
    this.emit();
    for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
    for (const e of added) this.emitOp({ op: "add_edge", edge: e });
    for (const id of del) this.emitOp({ op: "delete_node", node_id: id });
  }

  /** All epoch/phase ids in an epoch's subtree (itself + recursive sub-phases
   *  via has_sub_epoch). */
  private epochSubtree(epochId: string): Set<string> {
    const all = new Set<string>([epochId]);
    let frontier = [epochId];
    while (frontier.length) {
      const next: string[] = [];
      for (const e of this.doc.graph.edges)
        if (
          e.edge_type === "has_sub_epoch" &&
          all.has(e.source) &&
          !all.has(e.target)
        ) {
          all.add(e.target);
          next.push(e.target);
        }
      frontier = next;
    }
    return all;
  }

  /** What deleting an epoch affects: units are un-attributed (kept), sub-phases
   *  are cascade-deleted. For the confirm prompt. */
  epochDeletionImpact(epochId: string): { units: number; phases: number } {
    const sub = this.epochSubtree(epochId);
    const units = new Set<string>();
    for (const e of this.doc.graph.edges)
      if (
        (e.edge_type === "has_first_epoch" ||
          e.edge_type === "survive_in_epoch") &&
        sub.has(e.target)
      )
        units.add(e.source);
    return { units: units.size, phases: sub.size - 1 };
  }

  /** Delete a top-level epoch coherently (mirrors deletePhase's cleanup):
   *  cascade-delete its sub-phases, remove every epoch/phase in the subtree with
   *  its temporal PDG + property nodes AND its swimlane, drop the units'
   *  has_first_epoch/survive_in_epoch edges (units are KEPT — they lose their
   *  epoch), and clean positions/anchors. The caller runs a from-sketch relayout
   *  so no phantom lane remains. */
  deleteEpoch(epochId: string): void {
    this.checkpoint();
    const g = this.doc.graph;
    const sub = this.epochSubtree(epochId);
    const del = new Set<string>(sub);
    // fold in each epoch/phase's temporal PDG + its property members
    for (const e of g.edges)
      if (e.edge_type === "has_paradata_nodegroup" && sub.has(e.source)) {
        del.add(e.target);
        for (const p of g.edges)
          if (
            p.edge_type === "is_in_paradata_nodegroup" &&
            p.target === e.target
          )
            del.add(p.source);
      }
    const removed: EmEdge[] = [];
    g.edges = g.edges.filter((e) => {
      if (del.has(e.source) || del.has(e.target)) {
        removed.push(e);
        return false;
      }
      return true;
    });
    g.nodes = g.nodes.filter((n) => !del.has(n.id));
    const layout = this.doc.layout;
    if (layout?.swimlanes)
      layout.swimlanes = layout.swimlanes.filter((s) => !del.has(s.epoch_id));
    if (layout?.positions) for (const id of del) delete layout.positions[id];
    if (layout?.anchors)
      layout.anchors = layout.anchors.filter(
        (a) => !del.has(a.node) && !del.has(a.to),
      );
    this.emit();
    for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
    for (const id of del) this.emitOp({ op: "delete_node", node_id: id });
  }

  updateNode(id: string, patch: Partial<EmNode>): void {
    const n = this.node(id);
    if (!n) return;
    this.checkpoint();
    // snapshot BEFORE, so the field stamps land on what actually changed
    const before = JSON.parse(JSON.stringify(n)) as Record<string, unknown>;
    Object.assign(n, patch);
    const fields = this.stampFields(n, before);
    this.stampEdit(n);
    this.emit();
    this.emitOp({ op: "update_node", node_id: id, patch, fields });
  }

  /** Edit the canvas header metadata (graph name + id). The GraphML/em.json
   * header shows these; both are user-editable (identity + display). */
  updateGraphMeta(patch: { name?: string; graph_id?: string }): void {
    this.checkpoint();
    const g = this.doc.graph as Record<string, unknown> & {
      graph_id: string;
    };
    if (patch.name !== undefined) g["name"] = patch.name;
    if (patch.graph_id) g.graph_id = patch.graph_id;
    this.emit();
  }

  // ── MIG1-A · graph-scope rights metadata as first-class nodes (DP-65) ──────
  // CANVAS1's author/licence/embargo are no longer graph.data fields: they are
  // AuthorNode/LicenseNode/EmbargoNode MEMBERS of a graph-scope ParadataNodeGroup
  // owned by the graph-self node (`GraphNode`). The funnel canvas tier reads
  // these nodes (one reader per scope). The EM-ID (human-readable site id) is a
  // field on the graph-self node — the import key detail is deferred to IMP1.

  /** The graph-self node (node_type `graph`) — anchor of the graph-scope PDG
   *  and, when HDT-O is authored, the proposition_set (HC16). One per document. */
  graphRootNode(): EmNode | undefined {
    const nt = nodeTypeForClass("GraphNode") ?? "graph";
    return this.doc.graph.nodes.find((n) => n.node_type === nt);
  }

  /** Ensure the graph-self node exists (create if missing). */
  private ensureGraphRootNode(): EmNode {
    const existing = this.graphRootNode();
    if (existing) return existing;
    const nt = nodeTypeForClass("GraphNode") ?? "graph";
    const gid = String((this.doc.graph as Record<string, unknown>).graph_id ?? "graph");
    return this.addNode({
      id: `${gid}_graphroot`,
      name: "Graph",
      node_type: nt,
      description: "",
    });
  }

  /** The graph-self node id, creating it if missing — for callers that need a
   *  stable ref to the graph (e.g. a narrative "site map" embed). */
  ensureGraphRootId(): string {
    return this.ensureGraphRootNode().id;
  }

  /** The graph-scope ParadataNodeGroup id, or null (no creation). */
  graphParadataGroup(): string | null {
    const root = this.graphRootNode();
    return root ? this.paradataGroupOf(root.id) : null;
  }

  /** Ensure the graph-scope PDG (and its graph-self node) exist; return its id. */
  private ensureGraphParadata(): string {
    const root = this.ensureGraphRootNode();
    let pdgId = this.paradataGroupOf(root.id);
    if (!pdgId) {
      const gid = String((this.doc.graph as Record<string, unknown>).graph_id ?? "graph");
      const g = this.addNode({
        id: `${gid}_graph_paradata`,
        name: "Graph paradata",
        node_type: "ParadataNodeGroup",
        description: "",
      });
      pdgId = g.id;
      this.addEdge(root.id, pdgId, "has_paradata_nodegroup");
    }
    return pdgId;
  }

  /** rule key → the s3Dgraphy datamodel CLASS of its graph-scope member node. */
  private static readonly GRAPH_SCOPE_CLASS: Record<
    "author" | "license" | "embargo",
    string
  > = { author: "AuthorNode", license: "LicenseNode", embargo: "EmbargoNode" };

  /** The graph-scope PDG member of a given node_type, or undefined. */
  private graphScopeMember(pdgId: string, nt: string): EmNode | undefined {
    for (const e of this.doc.graph.edges)
      if (e.edge_type === "is_in_paradata_nodegroup" && e.target === pdgId) {
        const m = this.node(e.source);
        if (m && m.node_type === nt) return m;
      }
    return undefined;
  }

  /** Read the graph-scope rights metadata from the PDG member nodes + the EM-ID
   *  field. The value lives in each member's `name` (what the funnel reads).
   *  Inverse of {@link setGraphScope}. */
  readGraphScope(): {
    author: string;
    /** ORCID of the graph-scope author, when the AuthorNode carries one (IMP1). */
    orcid: string;
    license: string;
    embargo: string;
    em_id: string;
  } {
    const out = { author: "", orcid: "", license: "", embargo: "", em_id: "" };
    const root = this.graphRootNode();
    if (root)
      out.em_id = String((root.data as Record<string, unknown> | undefined)?.em_id ?? "");
    const pdgId = this.graphParadataGroup();
    if (pdgId)
      for (const key of ["author", "license", "embargo"] as const) {
        const nt = nodeTypeForClass(DocumentStore.GRAPH_SCOPE_CLASS[key]);
        const m = nt ? this.graphScopeMember(pdgId, nt) : undefined;
        if (m) {
          out[key] = String(m.name ?? "");
          if (key === "author") {
            const orcid = (m.data as Record<string, unknown> | undefined)?.orcid;
            if (orcid != null) out.orcid = String(orcid);
          }
        }
      }
    return out;
  }

  /** Author / update the graph-scope rights metadata + EM-ID as REAL nodes
   *  (create / rename the PDG member; an empty value deletes it). The whole
   *  reconciliation is ONE undo step (batched). Replaces `updateCanvasDefaults`
   *  — the canvas tier is now the nodes, not graph.data. */
  setGraphScope(patch: {
    author?: string;
    license?: string;
    embargo?: string;
    em_id?: string;
    /** IDENTITY · the author's ORCID iD and whether it has been verified.
     *  Written on the AuthorNode's data, which is where s3Dgraphy reads them
     *  (`AuthorNode.data.orcid` / `.verified`) — the same two fields, so the
     *  graph says the same thing on both sides of the bridge. Only applied
     *  together with a non-empty `author`: an orcid with no author node has
     *  nowhere to live. */
    orcid?: string;
    verified?: boolean;
  }): void {
    this.batch(() => {
      if (patch.em_id !== undefined) {
        const v = patch.em_id.trim();
        if (v) {
          const root = this.ensureGraphRootNode();
          const d = (root.data ??= {}) as Record<string, unknown>;
          d.em_id = v;
        } else {
          const root = this.graphRootNode();
          const d = root?.data as Record<string, unknown> | undefined;
          if (d) delete d.em_id;
        }
      }
      for (const key of ["author", "license", "embargo"] as const) {
        const v = patch[key];
        if (v === undefined) continue;
        const nt = nodeTypeForClass(DocumentStore.GRAPH_SCOPE_CLASS[key]);
        if (!nt) continue;
        const val = v.trim();
        if (val) {
          const pdgId = this.ensureGraphParadata();
          const existing = this.graphScopeMember(pdgId, nt);
          // The identity fields ride with the AUTHOR member only.
          const identity: Record<string, unknown> = {};
          if (key === "author") {
            if (patch.orcid !== undefined) identity.orcid = patch.orcid;
            // `=== true`, so a truthy non-boolean can never verify an author:
            // this value decides whether a publication may bear their name.
            if (patch.verified !== undefined) identity.verified = patch.verified === true;
          }
          if (existing) {
            this.updateNode(existing.id, { name: val });
            if (Object.keys(identity).length) {
              const d = (existing.data ??= {}) as Record<string, unknown>;
              Object.assign(d, identity);
              this.emit();
            }
          } else {
            const gid = String(
              (this.doc.graph as Record<string, unknown>).graph_id ?? "graph",
            );
            const m = this.addNode({
              id: `${gid}_graph_${nt}`,
              name: val,
              node_type: nt,
              description: "",
              ...(Object.keys(identity).length ? { data: identity } : {}),
            });
            this.addEdge(m.id, pdgId, "is_in_paradata_nodegroup");
          }
        } else {
          const pdgId = this.graphParadataGroup();
          const existing = pdgId ? this.graphScopeMember(pdgId, nt) : undefined;
          if (existing) this.deleteNode(existing.id);
        }
      }
    });
  }

  // ── RIGHTS ON ONE NODE (DTC) · licence / embargo / author of a resource ────
  //
  // The graph-scope trio above is the DEFAULT everything inherits. This is the
  // statement about ONE object — "this photograph is CC-BY, embargoed until
  // March, taken by me" — and it is what StratiGraph Server reads before serving the
  // bytes (`s3dgraphy.rights`, `GET /rooms/{id}/asset/{ref}`).
  //
  // Same three classes, attached DIRECTLY to the node with `has_license` /
  // `has_embargo` / `has_author` rather than through a paradata group: the
  // group is the graph's own furniture, and a licence on a photograph is not
  // paradata about the graph. The edges are the ones the datamodel already
  // defines for exactly this, and the DTC chain reads them the same way.

  private static readonly RIGHTS_EDGE: Record<
    "author" | "license" | "embargo", string
  > = { author: "has_author", license: "has_license", embargo: "has_embargo" };

  /** The node attached to `nodeId` by one of the rights edges, if any. */
  private rightsMember(
    nodeId: string,
    key: "author" | "license" | "embargo",
  ): EmNode | undefined {
    const edgeType = DocumentStore.RIGHTS_EDGE[key];
    const nt = nodeTypeForClass(DocumentStore.GRAPH_SCOPE_CLASS[key]);
    for (const e of this.doc.graph.edges) {
      if (e.edge_type !== edgeType) continue;
      const other = e.source === nodeId ? e.target : e.target === nodeId ? e.source : null;
      if (!other) continue;
      const found = this.node(other);
      // …and it must still be STANDING. A tombstoned licence is one somebody
      // removed: reusing it would write the new statement onto a dead node —
      // measured live, where "apponi" after a "rimuovi" updated the corpse and
      // the server went on reading nothing.
      if (found && (!nt || found.node_type === nt)
          && !isRemoved(found as unknown as Payload)) return found;
    }
    return undefined;
  }

  /** What this node says about its own rights. Empty strings where it says
   *  nothing — the graph-scope default is a different question, asked
   *  elsewhere, and answering it here would hide which of the two you are
   *  looking at. */
  readNodeRights(nodeId: string): {
    author: string;
    orcid: string;
    license: string;
    embargo: string;
    reason: string;
    /** who signed the most recent of these statements, and when */
    attributedBy: string;
    attributedAt: string;
  } {
    const out = { author: "", orcid: "", license: "", embargo: "", reason: "",
                  attributedBy: "", attributedAt: "" };
    for (const key of ["author", "license", "embargo"] as const) {
      const m = this.rightsMember(nodeId, key);
      if (!m) continue;
      out[key] = String(m.name ?? "");
      const data = (m.data ?? {}) as Record<string, unknown>;
      // the most recent signature wins the summary line: the panel says who
      // vouches for what is written there NOW
      if (data.attributed_at != null
          && String(data.attributed_at) >= out.attributedAt) {
        out.attributedAt = String(data.attributed_at);
        out.attributedBy = String(data.attributed_by ?? "");
      }
      if (key === "author" && data.orcid != null) out.orcid = String(data.orcid);
      if (key === "embargo") {
        if (data.reason != null) out.reason = String(data.reason);
        if (data.embargo_end != null) out.embargo = String(data.embargo_end);
      }
    }
    return out;
  }

  /** Attach (or update, or remove) the rights of ONE node — as an ACT.
   *
   *  ATTRIBUTION IS AN ACT, NOT A FIELD (protocol:
   *  `s3Dgraphy/docs/asset-dtc-protocol.md`). The **author** is who made the
   *  data — an ORCID that may belong to somebody absent, retired or dead — and
   *  the **attributor** is who says so, now. They are frequently different:
   *  anything catalogued after the fact is attributed by a cataloguer. So each
   *  statement carries `attributed_by` + `attributed_at`, the signature of the
   *  act, exactly as `enrich_asset_dtc` writes it on the Python side.
   *
   *  Distinct from the editorial stamps (`created_by`/`modified_by`), which
   *  record the hand that touched the FILE: "somebody edited this" and
   *  "somebody vouches for this" are different sentences.
   *
   *  An empty value REMOVES the statement rather than storing an empty one:
   *  "no licence declared" and "declared to be nothing" would look identical in
   *  the file and mean different things to a reader. One undo step.
   */
  setNodeRights(
    nodeId: string,
    patch: {
      author?: string;
      orcid?: string;
      license?: string;
      /** ISO date the embargo runs until; empty removes it */
      embargo?: string;
      reason?: string;
      /** ORCID of whoever is MAKING this declaration. Defaults to the session's
       *  identity — the person at the keyboard is the one signing. */
      attributor?: string;
      /** when the act was made (ISO); defaults to now, so a posthumous
       *  attribution says when it was made rather than pretending to be
       *  contemporary with the file */
      at?: string;
    },
  ): void {
    if (!this.node(nodeId)) return;
    this.batch(() => {
      for (const key of ["author", "license", "embargo"] as const) {
        const value = patch[key];
        if (value === undefined) continue;
        const nt = nodeTypeForClass(DocumentStore.GRAPH_SCOPE_CLASS[key]);
        if (!nt) continue;
        const val = value.trim();
        const existing = this.rightsMember(nodeId, key);
        if (!val) {
          if (existing) this.deleteNode(existing.id);
          continue;
        }
        // The fields s3Dgraphy's own classes read, so the same statement means
        // the same thing on the Python side: `LicenseNode.data.license_type`,
        // `EmbargoNode.data.embargo_end`, `AuthorNode.data.orcid`.
        const data: Record<string, unknown> = {};
        if (key === "author" && patch.orcid) data.orcid = patch.orcid;
        if (key === "license") data.license_type = val;
        if (key === "embargo") {
          data.embargo_end = val;
          if (patch.reason !== undefined) data.reason = patch.reason.trim();
        }
        // THE SIGNATURE OF THE ACT. On every statement, including one that only
        // changed value: an attribution somebody revised is theirs now, not
        // still the first person's.
        const signer = patch.attributor ?? currentIdentity()?.orcid;
        if (signer) {
          data.attributed_by = signer;
          data.attributed_at = patch.at ?? new Date().toISOString();
        }
        if (existing) {
          // ONE update, name AND data together — not a rename followed by a
          // silent `Object.assign`. Measured live: the assignment emitted no
          // operation, so a room received the new NAME of a licence and kept
          // the old `license_type` in its data, and the server (which reads the
          // data first) went on serving the licence nobody had chosen any more.
          this.updateNode(existing.id, {
            name: val,
            data: { ...(existing.data as Record<string, unknown> | undefined), ...data },
          } as Partial<EmNode>);
        } else {
          const made = this.addNode({
            id: `${nodeId}_${nt}_${this.newId().slice(0, 8)}`,
            name: val,
            node_type: nt,
            description: "",
            ...(Object.keys(data).length ? { data } : {}),
          });
          this.addEdge(nodeId, made.id, DocumentStore.RIGHTS_EDGE[key]);
        }
      }
    });
  }

  // ── GEO1 · site position (symbolic lon/lat) — DISTINCT from the shift ──────
  // The shift (GeoPositionNode, node_type "geo_position") stays the 3D anchor.
  // The SITE POSITION is "where the site is on the map": a graph-scope symbolic
  // point stored on the graph-self node's `data.site_position` ({lon,lat,crs}),
  // like em_id. Absent = not positioned (no fabricated 0/0). The two never mix.

  /** The site position, or null when the graph is not positioned. */
  readSitePosition(): { lon: number; lat: number; crs: string } | null {
    const root = this.graphRootNode();
    const sp = (root?.data as Record<string, unknown> | undefined)
      ?.site_position as Record<string, unknown> | undefined;
    if (!sp) return null;
    const lon = Number(sp.lon);
    const lat = Number(sp.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return { lon, lat, crs: typeof sp.crs === "string" ? sp.crs : "EPSG:4326" };
  }

  /** Set the site position (creates the graph-self node if needed). One undo
   *  step. Distinct from the shift — never touches the GeoPositionNode. */
  setSitePosition(lon: number, lat: number, crs = "EPSG:4326"): void {
    this.batch(() => {
      const root = this.ensureGraphRootNode();
      const d = (root.data ??= {}) as Record<string, unknown>;
      d.site_position = { lon, lat, crs };
      this.emit();
    });
  }

  /** Clear the site position (back to "not positioned"). Leaves the shift and
   *  the graph-self node otherwise intact. */
  clearSitePosition(): void {
    const root = this.graphRootNode();
    const d = root?.data as Record<string, unknown> | undefined;
    if (!d || !("site_position" in d)) return;
    this.checkpoint();
    delete d.site_position;
    this.emit();
  }

  /** Find the (single) HDT-O singleton node carrying a given role marker. The
   *  proposition_set (HC16) IS the graph-self node (node_type `graph`) and may
   *  already exist as the graph-scope paradata anchor (DP-65) without the
   *  hdto_role marker — so share that one node rather than minting a second. */
  private hdtoNode(role: HdtoRole): EmNode | undefined {
    const byRole = this.doc.graph.nodes.find(
      (n) => (n.data as Record<string, unknown> | undefined)?.hdto_role === role,
    );
    if (byRole) return byRole;
    if (role === "proposition_set") return this.graphRootNode();
    return undefined;
  }

  /** Read back the HDT-O authoring fields from the real gated nodes, so the
   *  Canvas inspector can populate the panel. Inverse of {@link applyHdto}. */
  readHdto(): HdtoFields {
    const study = this.hdtoNode("study");
    const about = this.hdtoNode("about");
    const parent = this.hdtoNode("parent");
    const project = this.hdtoNode("project");
    const sd = (study?.data ?? {}) as Record<string, unknown>;
    // the first authority ref of a node, and whether it was a resolved pick (a
    // pick carries an `authority`; a bare free-text uri has none)
    const refOf = (n?: EmNode): { uri: string; ref?: AuthorityRef } => {
      const d = (n?.data ?? {}) as Record<string, unknown>;
      const refs = Array.isArray(d.authority_refs)
        ? (d.authority_refs as AuthorityRef[])
        : [];
      const first = refs.find((r) => r?.uri);
      return {
        uri: String(first?.uri ?? ""),
        ref: first?.authority ? first : undefined,
      };
    };
    const aboutRef = refOf(about);
    const parentRef = refOf(parent);
    return {
      studyTitle: String(study?.name ?? ""),
      studyAuthors: String(sd.authors ?? ""),
      studyDate: String(sd.date ?? ""),
      heritageName: String(about?.name ?? ""),
      heritageUri: aboutRef.uri,
      heritageAuthorityRef: aboutRef.ref,
      parentName: String(parent?.name ?? ""),
      parentUri: parentRef.uri,
      parentAuthorityRef: parentRef.ref,
      projectName: String(project?.name ?? ""),
      twin: this.readTwin(),
    };
  }

  /** The attribution as the document holds it — the three states, read back.
   *
   *  No twin node → `none`. A twin node with a shared key → `registered`. A
   *  twin node without one → `provisional`, whatever `hdt_status` says: the
   *  identity is the fact, the marker is the declaration, and when they
   *  disagree the fact wins. That is also what makes documents written before
   *  the three states existed read correctly — they had no marker, and the
   *  twin the panel used to create silently was exactly a provisional one. */
  private readTwin(): TwinAttribution {
    const twin = this.hdtoNode("twin");
    if (!twin) return { ...NO_TWIN };
    const d = (twin.data ?? {}) as Record<string, unknown>;
    const key = String(d.heritage_entity_iri ?? "").trim();
    const registry = d.hdt_registry as TwinAttribution["registry"] | undefined;
    return {
      state: key ? "registered" : "provisional",
      name: String(twin.name ?? ""),
      key,
      registry: key && registry?.source ? registry : undefined,
    };
  }

  /** Author / update the per-graph HDT-O layer from the panel fields, as REAL
   *  gated nodes + edges in the em.json graph (the single source of truth),
   *  idempotently — singletons are keyed by `data.hdto_role`, so repeated calls
   *  never duplicate. Node types come from the vendored registry and edge types
   *  from the datamodel's allowed_connections (no hardcoded wire strings). The
   *  whole reconciliation is ONE undo step.
   *
   *  Chain authored (HDT-O / ECHOES D7.1):
   *    Project(HC13) ─includes_study→ Study(HC9) ─study_about_heritage→ HC1
   *    HC1 ─has_digital_twin→ HC2 ─contains_proposition_set→ HC16(GraphNode)
   *    Study(HC9) ─study_produced_proposition_set→ HC16
   *    HC1(about) ─heritage_part_of→ HC1(parent)   [optional]
   *
   *  **The HC2 link is optional and is an ACT** ({@link TwinAttribution}): a
   *  study whose excavator does not yet know what they are digging is a
   *  complete, valid document with an entity and no twin, and the whole chain
   *  above works without it. See `TwinState` for why there are three states.
   */
  applyHdto(fields: HdtoFields): void {
    this.checkpoint();
    const g = this.doc.graph;
    const trim = (s: string): string => (s ?? "").trim();
    const addedNodes: EmNode[] = [];
    const addedEdges: EmEdge[] = [];
    const removed: EmEdge[] = [];

    const nodeType = (role: HdtoRole): string | undefined =>
      nodeTypeForClass(HDTO_ROLE_CLASS[role]);

    // ensure a singleton node for `role` exists; returns it (or undefined if the
    // datamodel doesn't know the class — defensive, keeps the panel from
    // fabricating an untyped node).
    const ensure = (role: HdtoRole, name: string): EmNode | undefined => {
      let n = this.hdtoNode(role);
      if (n) {
        if (name && n.name !== name) n.name = name;
        return n;
      }
      const nt = nodeType(role);
      if (!nt) return undefined;
      n = {
        id: this.newId(),
        name: name || "",
        node_type: nt,
        description: "",
        data: { hdto_role: role },
      };
      g.nodes.push(n);
      addedNodes.push(n);
      return n;
    };

    const removeRole = (role: HdtoRole): void => {
      const n = this.hdtoNode(role);
      if (!n) return;
      // MIG1-A: the proposition_set (HC16) doubles as the graph-self node that
      // anchors the graph-scope PDG (DP-65). When that PDG exists, clearing the
      // HDT-O layer must NOT delete the node (it would orphan author/licence/
      // embargo): keep the node + its has_paradata_nodegroup edge, drop only its
      // HDT-O edges.
      const keepGraphRoot =
        role === "proposition_set" &&
        this.graphRootNode()?.id === n.id &&
        this.graphParadataGroup() != null;
      g.edges = g.edges.filter((e) => {
        const touches = e.source === n.id || e.target === n.id;
        const drop =
          touches && !(keepGraphRoot && e.edge_type === "has_paradata_nodegroup");
        if (drop) removed.push(e);
        return !drop;
      });
      if (keepGraphRoot) return;
      g.nodes = g.nodes.filter((x) => x.id !== n.id);
      const pos = this.doc.layout?.positions;
      if (pos) delete pos[n.id];
    };

    // idempotent typed edge between two existing nodes; type resolved from the
    // datamodel for the concrete node_type pair.
    const ensureEdge = (src?: EmNode, tgt?: EmNode): void => {
      if (!src || !tgt) return;
      const et = edgeTypeFor(src.node_type, tgt.node_type);
      if (!et) return;
      if (g.edges.some((e) => e.source === src.id && e.target === tgt.id && e.edge_type === et))
        return;
      const edge: EmEdge = {
        id: `${src.id}__${et}__${tgt.id}`,
        source: src.id,
        target: tgt.id,
        edge_type: et,
      };
      g.edges.push(edge);
      addedEdges.push(edge);
    };

    // THE ATTRIBUTION IS AN ACT, so it is normalised before anything is
    // written: `registered` requires a shared key, and a twin with a key is
    // registered whatever the caller said. The panel cannot produce a state the
    // identity does not support, and neither can a remote op.
    const twinKey = trim(fields.twin?.key ?? "");
    const twinState: TwinState =
      fields.twin?.state === "none" || !fields.twin
        ? "none"
        : twinKey
          ? "registered"
          : "provisional";

    const hasHeritage = !!(trim(fields.heritageName) || trim(fields.heritageUri));
    const hasStudy = !!(
      trim(fields.studyTitle) ||
      trim(fields.studyAuthors) ||
      trim(fields.studyDate)
    );
    // the proposition set (HC16) anchors both contains_ and produced_ edges; it
    // is needed as soon as there's any HDT-O content to attach.
    const needSet = hasHeritage || hasStudy;

    let set: EmNode | undefined;
    if (needSet) {
      set = ensure("proposition_set", trim(this.graphName()) || "Proposition set");
    } else {
      removeRole("proposition_set");
    }

    // Heritage Entity (HC1) + its digital twin (HC2)
    let about: EmNode | undefined;
    let twin: EmNode | undefined;
    if (hasHeritage) {
      about = ensure("about", trim(fields.heritageName));
      if (about) {
        const d = (about.data ??= {}) as Record<string, unknown>;
        d.hdto_role = "about";
        // Authority link, P1-D shape. A resolved pick (heritageAuthorityRef)
        // is stored verbatim (uri/authority/label/rank/match); otherwise the
        // free-text URI becomes a bare {uri} ref (offline / no pick).
        const picked = fields.heritageAuthorityRef;
        const uri = trim(fields.heritageUri);
        if (picked?.uri && trim(picked.uri) === uri) d.authority_refs = [picked];
        else if (uri) d.authority_refs = [{ uri }];
        else d.authority_refs = [];
        // THE TWIN IS NO LONGER CREATED BY TYPING A NAME.
        //
        // It used to be: the moment somebody typed the entity's name, this
        // line minted an HC2 — an attribution nobody had made, in a document
        // that then travelled to a Catalog which keyed a monument on it. That
        // is the same failure as a required field, arrived at from the other
        // side: instead of forcing a choice it made one silently.
        //
        // Now the twin exists when the attribution says it does, and «not yet»
        // is a state the document can hold (`TwinState`). Old documents keep
        // their twin: `readTwin` reads it back as provisional, which is what
        // it always was.
        if (twinState !== "none") {
          twin = ensure(
            "twin",
            trim(fields.twin.name) ||
              `${trim(fields.heritageName) || "Heritage"} HDT`,
          );
          if (twin) {
            const td = (twin.data ??= {}) as Record<string, unknown>;
            td.hdto_role = "twin";
            td.hdt_status = twinState;
            // the SHARED key, in the field s3dgraphy already reads, so a
            // registered twin arrives at a catalogue as one identity and not
            // as a fresh uuid per document
            if (twinKey) td.heritage_entity_iri = twinKey;
            else delete td.heritage_entity_iri;
            const reg = fields.twin.registry;
            if (twinKey && reg?.source) td.hdt_registry = reg;
            else delete td.hdt_registry;
          }
          ensureEdge(about, twin); // HC1 → HC2 (has_digital_twin)
          ensureEdge(twin, set); // HC2 → HC16 (contains_proposition_set)
        } else {
          removeRole("twin");
        }
      }
    } else {
      removeRole("about");
      removeRole("twin");
      removeRole("parent");
    }

    // optional parent Heritage Entity (HC1) + part-whole
    if (about && (trim(fields.parentName) || trim(fields.parentUri))) {
      const parent = ensure("parent", trim(fields.parentName));
      if (parent) {
        // §5 · the same authority treatment as the entity itself. A whole named
        // «Roma» in free text stays exactly as it is and is nameable as
        // unresolved; nothing migrates a document that already said it.
        const pd = (parent.data ??= {}) as Record<string, unknown>;
        pd.hdto_role = "parent";
        const picked = fields.parentAuthorityRef;
        const uri = trim(fields.parentUri);
        if (picked?.uri && trim(picked.uri) === uri) pd.authority_refs = [picked];
        else if (uri) pd.authority_refs = [{ uri }];
        else pd.authority_refs = [];
      }
      ensureEdge(about, parent); // HC1(about) → HC1(parent) (heritage_part_of)
    } else {
      removeRole("parent");
    }

    // Study (HC9)
    let study: EmNode | undefined;
    if (hasStudy) {
      study = ensure("study", trim(fields.studyTitle));
      if (study) {
        const d = (study.data ??= {}) as Record<string, unknown>;
        d.hdto_role = "study";
        d.authors = trim(fields.studyAuthors);
        d.date = trim(fields.studyDate);
        ensureEdge(study, about); // HC9 → HC1 (study_about_heritage)
        ensureEdge(study, set); // HC9 → HC16 (study_produced_proposition_set)
      }
    } else {
      removeRole("study");
    }

    // optional Project (HC13)
    if (trim(fields.projectName)) {
      const project = ensure("project", trim(fields.projectName));
      ensureEdge(project, study); // HC13 → HC9 (includes_study)
    } else {
      removeRole("project");
    }

    this.emit();
    for (const e of removed) this.emitOp({ op: "delete_edge", edge: e });
    for (const n of addedNodes) this.emitOp({ op: "add_node", node: n });
    for (const e of addedEdges) this.emitOp({ op: "add_edge", edge: e });
  }

  /** The graph's display name (header metadata), or "". */
  private graphName(): string {
    return String(
      (this.doc.graph as Record<string, unknown>)["name"] ?? "",
    );
  }

  /** Persisted position (matrix canvas). */
  moveNode(id: string, x: number, y: number, checkpoint: boolean): void {
    const layout = (this.doc.layout ??= {});
    const positions = (layout.positions ??= {});
    const r = positions[id];
    if (!r) return;
    if (checkpoint) this.checkpoint();
    r.x = x;
    r.y = y;
    this.emit();
  }

  /** Shift a set of nodes by a delta (dragging a whole group). */
  moveNodesBy(ids: string[], dx: number, dy: number, checkpoint: boolean): void {
    const positions = this.doc.layout?.positions;
    if (!positions) return;
    if (checkpoint) this.checkpoint();
    for (const id of ids) {
      const r = positions[id];
      if (r) {
        r.x += dx;
        r.y += dy;
      }
    }
    this.emit();
  }

  /** Position inside a group context (layout.group_spaces). */
  moveInGroupSpace(
    groupId: string,
    id: string,
    rect: LayoutRect,
    checkpoint: boolean,
  ): void {
    const layout = (this.doc.layout ??= {});
    const spaces = (layout.group_spaces ??= {});
    if (checkpoint) this.checkpoint();
    (spaces[groupId] ??= {})[id] = rect;
    this.emit();
  }

  /** Replace the layout (recompute), preserving fold state + group spaces. */
  setLayout(layout: import("./types").EmLayout): void {
    this.checkpoint();
    const old = this.doc.layout;
    if (old?.folded_groups?.length) layout.folded_groups = old.folded_groups;
    if (old?.group_spaces && Object.keys(old.group_spaces).length)
      layout.group_spaces = old.group_spaces;
    this.doc.layout = layout;
    this.emit();
  }

  /** Fold/unfold a whole set of groups as ONE undo step. */
  setFoldedMany(groupIds: string[], folded: boolean): void {
    if (!groupIds.length) return;
    this.checkpoint();
    const layout = (this.doc.layout ??= {});
    const set = new Set(layout.folded_groups ?? []);
    for (const id of groupIds) {
      if (folded) set.add(id);
      else set.delete(id);
    }
    layout.folded_groups = [...set].sort();
    this.emit();
  }

  isFolded(groupId: string): boolean {
    return this.doc.layout?.folded_groups?.includes(groupId) ?? false;
  }

  setFolded(groupId: string, folded: boolean): void {
    this.checkpoint();
    const layout = (this.doc.layout ??= {});
    const set = new Set(layout.folded_groups ?? []);
    if (folded) set.add(groupId);
    else set.delete(groupId);
    layout.folded_groups = [...set].sort();
    this.emit();
  }

  // ---- Node pinning (position lock) ------------------------------------
  // A pinned node keeps its exact Rect through a re-layout (em-core honours
  // layout.pinned). Pins are set by the user (a lock) or by the system.

  isPinned(nodeId: string): boolean {
    return this.doc.layout?.pinned?.includes(nodeId) ?? false;
  }

  /** Add/replace a rule pin: place `node` at `corner` of container `to` (+dx,dy).
   *  Deduped by node id. Written straight onto the layout (no checkpoint) — used
   *  by system anchoring (e.g. the epoch paradata box). */
  setAnchor(
    node: string,
    to: string,
    corner = "bl",
    dx = 0,
    dy = 0,
  ): void {
    const layout = (this.doc.layout ??= {});
    const list = (layout.anchors ??= []);
    const i = list.findIndex((a) => a.node === node);
    const anchor = { node, to, corner, dx, dy };
    if (i >= 0) list[i] = anchor;
    else list.push(anchor);
  }

  /** Pin/unpin one or more nodes. When pinning, the node's CURRENT position is
   *  frozen into layout.positions so the engine has an exact Rect to keep. */
  setPinned(nodeIds: string[], pinned: boolean, checkpoint = true): void {
    if (checkpoint) this.checkpoint();
    const layout = (this.doc.layout ??= {});
    const set = new Set(layout.pinned ?? []);
    for (const id of nodeIds) {
      if (pinned) set.add(id);
      else set.delete(id);
    }
    layout.pinned = [...set].sort();
    if (checkpoint) this.emit();
  }

  // ---------- AUX2 · volatile lifecycle ----------
  /** Inject a mapped auxiliary's nodes/edges into the graph, each node marked
   *  volatile (VOLATILE_KEY = auxId). ONE undoable change. Volatile nodes show on
   *  the canvas and in the EM-Data table (blue) but are excluded from `toJSON`
   *  until baked. Nodes/edges already present (by id) are skipped. */
  mapVolatile(auxId: string, nodes: EmNode[], edges: EmEdge[]): number {
    this.checkpoint();
    const have = new Set(this.doc.graph.nodes.map((n) => n.id));
    let added = 0;
    for (const n of nodes) {
      if (have.has(n.id)) continue;
      (n.data ??= {} as Record<string, unknown>)[VOLATILE_KEY] = auxId;
      this.doc.graph.nodes.push(n);
      have.add(n.id);
      added++;
    }
    const edgeIds = new Set(this.doc.graph.edges.map((e) => e.id));
    for (const e of edges) {
      const id = e.id ?? `${e.source}__${e.edge_type}__${e.target}`;
      if (edgeIds.has(id)) continue;
      this.doc.graph.edges.push({ ...e, id });
      edgeIds.add(id);
    }
    this.emit();
    return added;
  }

  /**
   * A2 · insert a subgraph computed ELSEWHERE, verbatim, in one undo step.
   *
   * The annotation chain is built by s3Dgraphy (through the bridge), which mints
   * its own deterministic ids — so the nodes and edges arrive already named and
   * must go in AS THEY ARE. `addNode`/`addEdge` would be wrong twice: `addEdge`
   * mints an id of its own, and each call would be its own undo step, so undoing
   * one annotation would take five presses.
   *
   * Ids already present are SKIPPED rather than replaced: the upstream ids are
   * deterministic, so a re-sent annotation is the same annotation, and skipping
   * is what makes the round trip idempotent on this side too.
   *
   * AUDIT1 · these nodes are NOT stamped here. They were made elsewhere and may
   * already say who made them; stamping on the way in would put this session's
   * hand on somebody else's work, which is precisely what an audit trail must
   * not do. Same reasoning as the container merge.
   *
   * Returns how many nodes and edges were actually new.
   */
  addSubgraph(nodes: EmNode[], edges: EmEdge[]): { nodes: number; edges: number } {
    this.checkpoint();
    const haveNodes = new Set(this.doc.graph.nodes.map((n) => n.id));
    const haveEdges = new Set(this.doc.graph.edges.map((e) => e.id));
    let addedNodes = 0;
    let addedEdges = 0;
    for (const n of nodes) {
      if (!n?.id || haveNodes.has(n.id)) continue;
      this.doc.graph.nodes.push(n);
      haveNodes.add(n.id);
      addedNodes++;
    }
    for (const e of edges) {
      const id = e.id ?? `${e.source}__${e.edge_type}__${e.target}`;
      if (haveEdges.has(id)) continue;
      this.doc.graph.edges.push({ ...e, id });
      haveEdges.add(id);
      addedEdges++;
    }
    if (addedNodes || addedEdges) this.emit();
    return { nodes: addedNodes, edges: addedEdges };
  }

  /** Bake an auxiliary's volatile nodes into the document: clear the marker so
   *  they become persistent (and travel with `toJSON`). Returns how many. */
  bakeVolatile(auxId: string): number {
    this.checkpoint();
    let n = 0;
    for (const node of this.doc.graph.nodes) {
      const d = node.data as Record<string, unknown> | undefined;
      if (d && d[VOLATILE_KEY] === auxId) {
        delete d[VOLATILE_KEY];
        n++;
      }
    }
    this.emit();
    return n;
  }

  /** Drop an auxiliary's volatile nodes (unmap / remove-before-bake): delete the
   *  nodes still marked with this auxId and their incident edges. Baked nodes
   *  (marker already cleared) are left untouched. Returns how many removed. */
  dropVolatile(auxId: string): number {
    this.checkpoint();
    const g = this.doc.graph;
    const doomed = new Set(
      g.nodes
        .filter((n) => (n.data as Record<string, unknown> | undefined)?.[VOLATILE_KEY] === auxId)
        .map((n) => n.id),
    );
    if (!doomed.size) {
      this.undoStack.pop(); // nothing to do — don't leave an empty undo step
      return 0;
    }
    g.nodes = g.nodes.filter((n) => !doomed.has(n.id));
    g.edges = g.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target));
    const layout = this.doc.layout;
    if (layout?.positions) for (const id of doomed) delete layout.positions[id];
    this.emit();
    return doomed.size;
  }

  toJSON(): string {
    const header = { ...(this.doc.header ?? {}) };
    header["last_editor"] = "EMStudio 0.1.0";
    // AUX2: volatile (mapped-but-not-baked) nodes NEVER travel with the saved
    // document. Drop them and any edge incident to one — the canvas/table keep
    // showing them (they read the live graph), but the file, sync and bridge
    // payloads see only baked content.
    const volatile = new Set(
      this.doc.graph.nodes
        .filter((n) => !!(n.data as Record<string, unknown> | undefined)?.[VOLATILE_KEY])
        .map((n) => n.id),
    );
    const graph = volatile.size
      ? {
          ...this.doc.graph,
          nodes: this.doc.graph.nodes.filter((n) => !volatile.has(n.id)),
          edges: this.doc.graph.edges.filter(
            (e) => !volatile.has(e.source) && !volatile.has(e.target),
          ),
        }
      : this.doc.graph;
    return JSON.stringify({ header, graph, layout: this.doc.layout }, null, 1);
  }
}
