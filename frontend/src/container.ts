/**
 * The em.json CONTAINER — a project is one file.
 *
 * Decided with E.D. (2026-08-13): an em.json/emj is **always a container**::
 *
 *   { "header": {…}, "graphs": { "<id>": <graph>, "shelf": <ShelfGraph> },
 *     "active_graph_id": "<id>" }
 *
 * A study is one or more graphs plus its shelf; a single graph is a
 * **container-of-one**. This is the shape **Heriverse already reads**, so
 * writing it means Heriverse does not change — the format was adopted, not
 * invented. s3Dgraphy reads and writes the same thing (`s3dgraphy/container.py`),
 * so the three tools agree on what a project file is.
 *
 * What changes for EMStudio: **Save writes every slot**, not just the active
 * one. Until now a workspace with three graphs saved one of them, and the other
 * two existed only until the tab closed — which is the kind of loss you discover
 * a week later.
 *
 * Reading accepts both shapes, always: every file written before today is a
 * single-graph document, and none of them may break.
 *
 * **One layout per graph (2026-10-02).** Each member keeps its arrangement in its
 * own section, `graphs.<id>.layout`; the file-level `layout` is still written, as
 * a COPY of the active graph's, for whoever reads only that (Heriverse, old
 * files). Reading: a member's own layout if it has one; else the file-level one
 * for ONE graph — the one whose nodes it positions, else the active one; the other graphs of an old file
 * are laid out afresh, said once. Same rule as `s3dgraphy/container.py`
 * (`resolve_layouts`), held equal by `testdata/container-layout-parity.json`, a
 * byte copy of s3Dgraphy's `tests/fixtures/` file.
 *
 * Pure module: no DOM, no store. It maps between container documents and the
 * per-graph `EmDocument` the DocumentStore already knows how to hold.
 */

import type { EmDocument } from "./types";
import { sha256Hex } from "./sha256";
import { contentSignature, mergePayloads } from "./crdt";

// P4.1 · re-exported so a caller that has the container has the algebra too:
// the merge of two files and the application of one operation are the same
// rules, and importing them from two places would invite two answers.
export { applyOp, applyOps, isRemoved, liveNodes, liveEdges, makeOp } from "./crdt";
export type { CrdtOp, OpResult, FieldOutcome } from "./crdt";

export const GRAPHS_KEY = "graphs";
export const SHELF_COLLECTION = "ShelfGraph";
export const SHELF_MEMBER_ID = "shelf";
/** The DOCUMENTATION member: acquisitions, transformations and the resources
 *  they are about — a forest that shares its leaves, and ontologically NOT a
 *  stratigraphic matrix. Same mechanism as the shelf (a marker on the graph, not
 *  a special key in the file), same words as `s3dgraphy.dtc.corpus`. */
export const DTC_CORPUS_COLLECTION = "DTCCorpus";
export const DTC_CORPUS_MEMBER_ID = "dtc";
/** P3 · where the project's revision travels. Deliberately NOT in `header`:
 *  the header describes the FORMAT, this describes the WORK. */
export const VERSION_KEY = "version";
/** Where a member keeps its own arrangement: `graphs.<id>.layout`. */
export const LAYOUT_KEY = "layout";

type GraphSection = Record<string, unknown>;

/** P3 · which revision of the project this file is. Mirrors
 *  `s3dgraphy.container.ProjectVersion` field for field — one vocabulary. */
export interface ProjectVersion {
  number: number;
  /** content digest of this version, `sha256:<12 hex>` */
  id: string;
  was_revision_of?: string | null;
  modified_at?: string | null;
}

export interface ContainerDoc {
  header?: Record<string, unknown>;
  graphs: Record<string, GraphSection>;
  active_graph_id?: string;
  layout?: Record<string, unknown>;
  version?: ProjectVersion;
}

/** One member, ready for a DocumentStore: the per-graph document shape. */
export interface ContainerMember {
  id: string;
  doc: EmDocument;
}

export interface ParsedContainer {
  /** the study graphs, in the order the file lists them */
  members: ContainerMember[];
  /** the project shelf, when the container carries one */
  shelf: GraphSection | null;
  /** the DOCUMENTATION member (the DTC corpus), when the container carries one.
   *  Kept OUT of `members` for the reason the shelf is: a caller iterating the
   *  study's graphs must not meet it, and the bug that would cause is a
   *  provenance forest drawn as a stratigraphic matrix. */
  corpus: GraphSection | null;
  activeGraphId: string | null;
  /** true when the source was a legacy single-graph document */
  wasLegacy: boolean;
  /** P3 · the revision this file claims to be, when it says */
  version: ProjectVersion | null;
  /** F4 · the graphs of an OLD file that got no layout and are laid out afresh */
  freshLayouts: string[];
  warnings: string[];
}

type LayoutObj = Record<string, unknown>;

/** A layout worth writing: an object with something in it. */
function hasLayout(l: unknown): l is LayoutObj {
  return !!l && typeof l === "object" && !Array.isArray(l) && Object.keys(l as object).length > 0;
}

/**
 * Which layout each graph of a file gets, and which ones get none — THE reading
 * rule, the same as `s3dgraphy.container.resolve_layouts`:
 *
 * 1. a member that carries `graphs.<id>.layout` keeps its own;
 * 2. otherwise the file-level `layout` goes to ONE graph and to no other: in an
 *    old file it was ONE graph's arrangement, and handing it to the rest was the
 *    bug. That graph is the one whose nodes the layout positions (`nodeIds`, most
 *    positions wins) — not simply the active one: an old file kept the layout of
 *    the graph laid out LAST, which may be a seed (San Pietro, dev.17: the seed's
 *    three positions went to the real graph, which saved them as its own and was
 *    never laid out). Ties, no positions, no `nodeIds` → the ACTIVE graph, or the
 *    only one;
 * 3. the rest get nothing. They are `fresh` only in an OLD file (a file-level
 *    layout and no member with its own), where positions may have been lost to
 *    another graph — worth saying, once.
 */
export function resolveLayouts(
  graphIds: string[],
  own: Record<string, LayoutObj>,
  fileLayout: LayoutObj | null,
  activeGraphId: string | null,
  nodeIds?: Record<string, string[]>,
): { layouts: Record<string, LayoutObj>; fresh: string[] } {
  const layouts: Record<string, LayoutObj> = {};
  const fresh: string[] = [];
  const file = hasLayout(fileLayout) ? fileLayout : null;
  const anyOwn = Object.keys(own).length > 0;
  let heir = activeGraphId && graphIds.includes(activeGraphId) ? activeGraphId : graphIds[0] ?? null;
  if (graphIds.length === 1) heir = graphIds[0];
  else if (file && nodeIds) {
    const placed = new Set(Object.keys((file.positions as Record<string, unknown> | undefined) ?? {}));
    const counts: Record<string, number> = {};
    for (const gid of graphIds) {
      if (gid in own) continue;
      counts[gid] = (nodeIds[gid] ?? []).filter((n) => placed.has(n)).length;
    }
    const best = Math.max(0, ...Object.values(counts));
    if (best > 0 && (counts[heir ?? ""] ?? 0) < best) {
      heir = graphIds.find((gid) => counts[gid] === best) ?? heir;
    }
  }
  for (const gid of graphIds) {
    if (gid in own) layouts[gid] = own[gid];
    else if (gid === heir && file) layouts[gid] = file;
    else if (file && !anyOwn) fresh.push(gid);
  }
  return { layouts, fresh };
}

/** The one sentence about the graphs of an old file that had no layout. */
export function layoutFreshWarning(fresh: string[]): string {
  return `${fresh.length} graph(s) of this file carry no layout of their own ` +
    `(written before per-graph layouts): laid out afresh — ${fresh.join(", ")}`;
}

/** P3 · read a version block defensively — a file may carry anything. */
export function readVersion(raw: unknown): ProjectVersion | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const n = Number(v.number);
  return {
    number: Number.isFinite(n) && n > 0 ? Math.floor(n) : 1,
    id: String(v.id ?? ""),
    was_revision_of: v.was_revision_of ? String(v.was_revision_of) : null,
    modified_at: v.modified_at ? String(v.modified_at) : null,
  };
}

/** "v3 (da v2)" — the sentence a status bar wants. */
export function versionLabel(v: ProjectVersion | null): string {
  if (!v) return "";
  return v.was_revision_of ? `v${v.number} (da ${v.was_revision_of})` : `v${v.number}`;
}

/** Structural, never a guess about content: either the `graphs` map is there or
 *  this is a legacy single-graph document. */
export function isContainer(doc: unknown): doc is ContainerDoc {
  const graphs = (doc as ContainerDoc | null)?.graphs;
  return !!graphs && typeof graphs === "object" && !Array.isArray(graphs);
}

/** Is this member the shelf? From the MARKER, never from the member id — an id
 *  is a name somebody chose, the marker is what the graph says it is. */
export function isShelfSection(section: unknown): boolean {
  const data = (section as { data?: Record<string, unknown> } | null)?.data;
  return !!data && data.em_collection === SHELF_COLLECTION;
}

/** Is this member the DTC corpus? Same rule, same reason: the MARKER decides. */
export function isCorpusSection(section: unknown): boolean {
  const data = (section as { data?: Record<string, unknown> } | null)?.data;
  return !!data && data.em_collection === DTC_CORPUS_COLLECTION;
}

/**
 * Does the DOCUMENTATION corpus take a node of this class from the canvas?
 *
 * The corpus is acquisitions, transformations and the resources they are about
 * (plus the rights ornaments an acquisition carries — that is where a lot's
 * licence and author live). It is NOT stratigraphy: a US in here would be a unit
 * in a document with no epochs, no lanes and no matrix to hold it, and the
 * paradata written about it would answer questions the corpus never asks.
 *
 * Takes the CLASS PREDICATES rather than a list of type names, so the rule stays
 * where the datamodel is the authority: the caller passes `isDtcNodeType` and
 * the runtime names of ResourceNode / AuthorNode / LicenseNode / EmbargoNode,
 * all resolved from the vendored JSON (ADR-001 — never a literal here).
 */
export function corpusAcceptsNodeType(
  nodeType: string,
  ctx: { isDtc: (t: string) => boolean; resource?: string; rights: Iterable<string> },
): boolean {
  if (ctx.isDtc(nodeType)) return true;
  if (ctx.resource && nodeType === ctx.resource) return true;
  for (const r of ctx.rights) if (nodeType === r) return true;
  return false;
}

/** An empty corpus section, tagged as one — for a project that has none yet. */
export function newCorpusSection(id: string = DTC_CORPUS_MEMBER_ID): GraphSection {
  return {
    graph_id: id,
    name: "Documentation (DTC)",
    data: { em_collection: DTC_CORPUS_COLLECTION },
    nodes: [],
    edges: [],
  };
}

/**
 * Read a container OR a legacy single-graph document.
 *
 * A legacy document comes back as a container-of-one, so every caller downstream
 * has ONE shape to handle instead of two.
 */
export function parseContainer(doc: unknown): ParsedContainer {
  const warnings: string[] = [];
  if (!isContainer(doc)) {
    const single = doc as EmDocument | null;
    if (!single?.graph?.nodes) {
      return { members: [], shelf: null, corpus: null, activeGraphId: null,
               wasLegacy: true, version: null, freshLayouts: [],
               warnings: ["not an .em.json document (missing graph.nodes)"] };
    }
    const id = String(single.graph.graph_id ?? "graph");
    return { members: [{ id, doc: single }], shelf: null, corpus: null,
             activeGraphId: id, wasLegacy: true,
             version: readVersion((single as unknown as ContainerDoc).version),
             freshLayouts: [], warnings };
  }

  const header = doc.header ?? { format: "em.json", version: "1.0" };
  const members: ContainerMember[] = [];
  const own: Record<string, LayoutObj> = {};
  const nodeIds: Record<string, string[]> = {};
  let shelf: GraphSection | null = null;
  let corpus: GraphSection | null = null;
  for (const [memberId, section] of Object.entries(doc.graphs)) {
    if (!section || typeof section !== "object") {
      // One broken member must not cost the rest of the project.
      warnings.push(`container member '${memberId}' is not a graph; skipped`);
      continue;
    }
    if (isShelfSection(section)) {
      shelf = section;
      continue;
    }
    if (isCorpusSection(section)) {
      corpus = section;
      continue;
    }
    const { [LAYOUT_KEY]: ownLayout, ...rest } = section;
    const graph = { ...rest, graph_id: rest.graph_id ?? memberId };
    const id = String(graph.graph_id);
    if (ownLayout && typeof ownLayout === "object" && !Array.isArray(ownLayout)) {
      own[id] = ownLayout as LayoutObj;
    }
    // the layout is decided below, once every member and the active id are known
    const rawNodes = (rest as { nodes?: unknown }).nodes;
    nodeIds[id] = (Array.isArray(rawNodes) ? rawNodes : [])
      .filter((n: unknown) => !!n && typeof n === "object" && (n as { id?: unknown }).id != null)
      .map((n: unknown) => String((n as { id: unknown }).id));
    members.push({ id, doc: { header, graph } as unknown as EmDocument });
  }

  let activeGraphId = typeof doc.active_graph_id === "string" ? doc.active_graph_id : null;
  if (activeGraphId && !members.some((m) => m.id === activeGraphId)) {
    warnings.push(
      `active_graph_id '${activeGraphId}' is not a member of this container; ` +
        `showing the first graph`,
    );
    activeGraphId = null;
  }
  if (!activeGraphId) activeGraphId = members[0]?.id ?? null;

  // F4 · one layout per graph: its own, or the file's for the graph it places
  const { layouts, fresh } = resolveLayouts(
    members.map((m) => m.id), own, (doc.layout as LayoutObj | undefined) ?? null, activeGraphId,
    nodeIds);
  for (const m of members) {
    if (layouts[m.id]) (m.doc as unknown as { layout?: LayoutObj }).layout = layouts[m.id];
  }
  if (fresh.length) warnings.push(layoutFreshWarning(fresh));

  if (!members.length && (shelf || corpus)) {
    const held = [shelf ? "a shelf" : "", corpus ? "a DTC corpus" : ""]
      .filter(Boolean).join(" and ");
    warnings.push(
      `this project holds ${held} and no study graph — readable, but there is ` +
        `no matrix to draw`,
    );
  }
  return { members, shelf, corpus, activeGraphId, wasLegacy: false,
           version: readVersion(doc.version), freshLayouts: fresh, warnings };
}

/**
 * Build the container document from the graphs on screen.
 *
 * `graphs` are the per-graph documents (one per slot); `shelf` is the project
 * shelf's own graph section, when there is one.
 */
export function buildContainer(input: {
  graphs: Array<{ id: string; doc: EmDocument }>;
  shelf?: GraphSection | null;
  /** the DOCUMENTATION member, written back under its own id */
  corpus?: GraphSection | null;
  activeGraphId?: string | null;
}): ContainerDoc {
  const graphs: Record<string, GraphSection> = {};
  for (const { id, doc } of input.graphs) {
    const section = { ...(doc.graph as unknown as GraphSection) };
    section.graph_id = section.graph_id ?? id;
    // F4 · each graph's arrangement travels in its own section
    delete section[LAYOUT_KEY];
    if (hasLayout(doc.layout)) section[LAYOUT_KEY] = doc.layout;
    graphs[id] = section;
  }
  if (input.shelf) {
    const shelfId = String(input.shelf.graph_id ?? SHELF_MEMBER_ID);
    graphs[shelfId] = input.shelf;
  }
  if (input.corpus) {
    const corpusId = String(input.corpus.graph_id ?? DTC_CORPUS_MEMBER_ID);
    graphs[corpusId] = input.corpus;
  }
  // The header comes from the first member so the format/version/datamodel
  // stamps stay written in one place (whoever wrote that document wrote them) —
  // but the two stamps that SAY WHAT THIS FILE IS are filled in when the member
  // has none.
  //
  // Measured, and it was not a cosmetic gap: a document created with File → New
  // carries a header of `{last_editor}` alone, so the project built from it went
  // out with no `format` — and s3Dgraphy refused every member of it with
  // "not an em.json document (format=None)". The file looked fine in EMStudio
  // (which does not check) and was unreadable by the library that defines the
  // format. Whoever wrote a header still wins; this only fills a blank.
  const memberHeader =
    (input.graphs[0]?.doc.header as Record<string, unknown> | undefined) ?? {};
  const header: Record<string, unknown> = {
    format: "em.json", version: "1.0", ...memberHeader,
  };
  if (!header.format) header.format = "em.json";
  if (!header.version) header.version = "1.0";
  const out: ContainerDoc = { header, graphs };
  const active = input.activeGraphId ?? input.graphs[0]?.id ?? null;
  if (active) out.active_graph_id = active;
  // F4 · the file-level layout is a COPY of the ACTIVE graph's, for whoever
  // reads only that (Heriverse, old readers). Until today it was the first
  // graph's that had one — on San Pietro, an empty seed's.
  const activeLayout = input.graphs.find((g) => g.id === active)?.doc.layout;
  if (hasLayout(activeLayout)) out.layout = activeLayout as Record<string, unknown>;
  return out;
}

// ── P3 · light-weight versioning ────────────────────────────────────────────

/** JSON with the keys sorted, the way Python's `json.dumps(sort_keys=True,
 *  separators=(",",":"))` writes it — so the two tools hash the same bytes.
 *
 *  DECLARED LIMIT: numbers are spelled by each language's own rules, so a float
 *  Python writes as `1.0` and JS as `1` would give different digests. EM content
 *  carries integers and strings, and the layout (where the floats live) is not
 *  hashed at all — but if that ever changes, this is the seam that has to. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/**
 * `sha256:<12 hex>` over the project's CONTENT — the graphs and which one was
 * active. NOT the layout, and not the version block itself.
 *
 * This is what decides whether a save is a new version, so "did the content
 * change" is MEASURED. Moving a box is not a new version of a study, and
 * pressing save three times on an unchanged project must not invent three
 * revisions.
 */
export function contentDigest(doc: ContainerDoc): string {
  // a member's own layout is arrangement, not content (F4)
  const graphs: Record<string, unknown> = {};
  for (const [gid, section] of Object.entries(doc.graphs ?? {})) {
    if (section && typeof section === "object") {
      const { [LAYOUT_KEY]: _layout, ...rest } = section;
      graphs[gid] = rest;
    } else graphs[gid] = section;
  }
  const payload = {
    graphs,
    active_graph_id: doc.active_graph_id ?? null,
  };
  return `sha256:${sha256Hex(canonicalJson(payload)).slice(0, 12)}`;
}

/**
 * Advance the project's version IF the content changed, and stamp it on `doc`.
 *
 * `previous` is the version the project carried before this write. An unchanged
 * digest keeps it: a save is not an edit. A changed one records
 * `was_revision_of` pointing at the digest it grew out of — the chain a citation
 * follows backwards, and `prov:wasRevisionOf` in the RDF projection.
 */
export function bumpVersion(
  doc: ContainerDoc,
  previous: ProjectVersion | null,
  at?: string,
): ProjectVersion {
  const digest = contentDigest(doc);
  if (previous && previous.id === digest) {
    doc.version = previous;
    return previous;
  }
  const next: ProjectVersion = {
    number: previous ? previous.number + 1 : 1,
    id: digest,
    was_revision_of: previous?.id || null,
    modified_at: at ?? new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  };
  doc.version = next;
  return next;
}

// ── integrating later ───────────────────────────────────────────────────────

/** Why a contested node was resolved the way it was. Mirrors
 *  `s3dgraphy.container.CONFLICT_REASONS`. */
export type ConflictReason = "newer" | "tie-author" | "unstamped" | "resurrected";

/** P3 · one node two people edited — who won, who lost, and why. */
export interface Conflict {
  nodeId: string;
  reason: ConflictReason;
  winner: { by: string | null; at: string | null; stamp: string | null; side: string };
  loser: { by: string | null; at: string | null; stamp: string | null; side: string };
  /** which fields diverged (`name`, `data.value`, …) — a pointer, not a diff */
  fieldHint: string[];
  /** the losing version verbatim, so "keep A's version" needs no second file */
  loserPayload: Record<string, unknown>;
  /** P4.1 · WHICH field this outcome is about (one entry per contested field) */
  field?: string;
  /** the value that lost, for that field */
  loserValue?: unknown;
}

export interface MergeReport {
  addedGraphs: string[];
  mergedGraphs: string[];
  mergedNodes: number;
  addedNodes: number;
  addedEdges: number;
  /** P3/P4.1 · the contested FIELDS. `mergedNodes` says how many nodes were
   *  seen twice; this says which fields had to be decided, and whose value lost. */
  conflicts: Conflict[];
  /** P4.1 · presence outcomes: deleted, and brought back by a later edit. */
  removedNodes: number;
  resurrectedNodes: number;
  warnings: string[];
}

/** Let the merged version take the place of the local one, IN PLACE.
 *
 *  In place and not by swapping the array element, because the node object may
 *  already be referenced elsewhere (a store, a selection). And the local keys
 *  the merged payload does not have are DROPPED: `Object.assign` alone would
 *  leave a field the other author deleted quietly alive, which is a third
 *  version neither of them wrote. */
function replaceNode(
  nodes: Array<Record<string, unknown>>,
  byId: Map<string, Record<string, unknown>>,
  id: string,
  incoming: Record<string, unknown>,
): void {
  const existing = byId.get(id);
  if (!existing) {
    nodes.push(incoming);
    byId.set(id, incoming);
    return;
  }
  for (const key of Object.keys(existing)) {
    if (!(key in incoming)) delete existing[key];
  }
  Object.assign(existing, incoming);
}

/**
 * Resolve ONE node two sides both have — the single point where "who wins" is
 * decided. The container merge calls it per node, and so does the live op-log
 * (`applyRemoteOp`): a conflict that arrives one operation at a time is the same
 * conflict and must not be judged by a second rule.
 *
 * P4.1 · the arbitration moved to `crdt.ts`: **OR-Set** for presence and
 * **LWW-per-field** for content. So this returns the MERGED payload — two people
 * who edited different fields both keep their edit — plus one `Conflict` per
 * field that actually had to be decided.
 */
export function resolveNodePair(
  _nodeId: string,
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
): {
  side: "mine" | "theirs";
  reason: ConflictReason;
  merged: Record<string, unknown>;
  conflicts: Conflict[];
  removed: boolean;
  resurrected: boolean;
  /** back-compat with the P3 callers: the first field outcome, or null */
  conflict: Conflict | null;
} {
  const outcome = mergePayloads(mine, theirs);
  const conflicts: Conflict[] = outcome.fields.map((f) => ({
    nodeId: f.nodeId,
    reason: f.reason as ConflictReason,
    winner: f.winner,
    loser: f.loser,
    fieldHint: [f.field],
    field: f.field,
    loserValue: f.loserValue,
    loserPayload: f.winner.side === "mine" ? { ...theirs } : { ...mine },
  }));
  // "which side won" is no longer one answer for the whole node — the merge is
  // per field. For the callers that still ask one question, the honest one is
  // "did anything of theirs land?", measured on CONTENT: a clock written by the
  // merge is not a change somebody made.
  const side: "mine" | "theirs" =
    contentSignature(outcome.payload) === contentSignature(mine) ? "mine" : "theirs";
  return {
    side,
    reason: (conflicts[0]?.reason ?? "newer") as ConflictReason,
    merged: outcome.payload,
    conflicts,
    removed: outcome.removed,
    resurrected: outcome.resurrected,
    conflict: conflicts[0] ?? null,
  };
}

export function mergeGraphSections(
  target: GraphSection,
  incoming: GraphSection,
  report: MergeReport,
): void {
  const targetNodes = (target.nodes ?? []) as Array<Record<string, unknown>>;
  const incomingNodes = (incoming.nodes ?? []) as Array<Record<string, unknown>>;
  const byId = new Map(targetNodes.map((n) => [String(n.id), n]));
  for (const node of incomingNodes) {
    const id = String(node.id);
    const existing = byId.get(id);
    if (existing) {
      report.mergedNodes++;
      // ONE decision point, shared with the live op-log — see `resolveNodePair`.
      const { merged, conflicts, removed, resurrected } = resolveNodePair(id, existing, node);
      replaceNode(targetNodes, byId, id, merged);
      report.conflicts.push(...conflicts);
      if (removed) report.removedNodes++;
      if (resurrected) report.resurrectedNodes++;
    } else {
      targetNodes.push(node);
      byId.set(id, node);
      report.addedNodes++;
    }
  }
  target.nodes = targetNodes;

  const targetEdges = (target.edges ?? []) as Array<Record<string, unknown>>;
  const incomingEdges = (incoming.edges ?? []) as Array<Record<string, unknown>>;
  const key = (e: Record<string, unknown>): string =>
    `${String(e.source)}|${String(e.edge_type)}|${String(e.target)}`;
  const seen = new Set(targetEdges.map(key));
  const ids = new Set(targetEdges.map((e) => String(e.id)));
  for (const edge of incomingEdges) {
    if (seen.has(key(edge))) continue;
    let id = String(edge.id ?? key(edge));
    while (ids.has(id)) id = `${id}_merged`;
    targetEdges.push({ ...edge, id });
    seen.add(key(edge));
    ids.add(id);
    report.addedEdges++;
  }
  target.edges = targetEdges;
}

/**
 * Take another project into this one — the offline "integrate later".
 *
 * ADDITIVE: a graph you do not have arrives whole; a graph you both have merges
 * by UUID. No server, no session, no lock.
 */
export function mergeContainers(
  into: { members: ContainerMember[]; shelf: GraphSection | null },
  other: ParsedContainer,
): MergeReport {
  const report: MergeReport = {
    addedGraphs: [], mergedGraphs: [], mergedNodes: 0,
    addedNodes: 0, addedEdges: 0, conflicts: [], removedNodes: 0,
    resurrectedNodes: 0, warnings: [...other.warnings],
  };
  for (const incoming of other.members) {
    const mine = into.members.find((m) => m.id === incoming.id);
    if (mine) {
      mergeGraphSections(
        mine.doc.graph as unknown as GraphSection,
        incoming.doc.graph as unknown as GraphSection,
        report,
      );
      report.mergedGraphs.push(incoming.id);
    } else {
      into.members.push(incoming);
      report.addedGraphs.push(incoming.id);
      report.addedNodes += ((incoming.doc.graph.nodes ?? []) as unknown[]).length;
      report.addedEdges += ((incoming.doc.graph.edges ?? []) as unknown[]).length;
    }
  }
  if (other.shelf) {
    if (!into.shelf) into.shelf = other.shelf;
    else mergeGraphSections(into.shelf, other.shelf, report);
  }
  return report;
}
