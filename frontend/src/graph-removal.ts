/**
 * «Delete the graph…» — one study graph taken out of an em.json, said first.
 *
 * The mirror of s3Dgraphy's `s3dgraphy.graph_removal` (MICRO contenuti-
 * workspace-elimina-grafo, 26 Oct 2026), on the container as a document
 * (`{graphs: {<id>: section}, active_graph_id}`): the REPORT — nodes and edges
 * that go, the links of the other graphs that would hang (kept MARKED
 * `target_graph_removed`, or dropped), the shelf entries only it used (kept or
 * dropped), the resources and files no other member names (a file is NEVER
 * deleted) — and the removal itself, which returns a new document. The shelf,
 * the DTC corpus, the periodizations and the last study graph are refused.
 *
 * `testdata/graph-removal-parity.json` is a byte copy of s3Dgraphy's
 * `tests/fixtures/graph-removal-parity.json`, and `scripts/check-graph-removal.mjs`
 * checks this module against it case by case: one rule, two implementations.
 * Pure: no DOM, no store.
 */

export type LinksAction = "keep" | "drop";
export type ShelfAction = "keep" | "drop";

export const TARGET_REMOVED_KEY = "target_graph_removed";

type Section = Record<string, unknown>;
type Node = { id?: unknown; node_type?: unknown; type?: unknown; name?: unknown; data?: Record<string, unknown>; url?: unknown };
type Edge = { id?: unknown; source?: unknown; target?: unknown; edge_type?: unknown };

export interface ContainerLike {
  graphs: Record<string, Section>;
  active_graph_id?: string | null;
  [k: string]: unknown;
}

export interface RemovalLinkIn {
  graph_id: string; link_id: string; edge_type: string;
  source: string; source_name: string; target: string; target_name: string;
}
export interface RemovalItem { id: string; name: string; locator: string }

export interface RemovalReport {
  graph_id: string;
  name: string;
  applied: boolean;
  nodes: number;
  edges: number;
  nodes_by_type: Record<string, number>;
  links_out: number;
  links_in: RemovalLinkIn[];
  links_action: LinksAction;
  shelf_only_here: RemovalItem[];
  shelf_action: ShelfAction;
  resources_alone: RemovalItem[];
  files_alone: string[];
  active_graph_id: string | null;
  active_changed: boolean;
}

export class GraphRemovalError extends Error {
  constructor(message: string, readonly code: "unknown" | "special" | "last") { super(message); }
}

const SHELF = "ShelfGraph", CORPUS = "DTCCorpus", PERIODS = "Periodizations";
const collection = (s: Section): string => String((s.data as Record<string, unknown> | undefined)?.em_collection ?? "");
const isSpecial = (s: Section): boolean => [SHELF, CORPUS, PERIODS].includes(collection(s));

const nodesOf = (s: Section | null | undefined): Node[] => (Array.isArray(s?.nodes) ? s!.nodes as Node[] : []);
const edgesOf = (s: Section | null | undefined): Edge[] => (Array.isArray(s?.edges) ? s!.edges as Edge[] : []);
const linksOf = (s: Section): Array<Record<string, unknown>> => (Array.isArray(s.links) ? s.links as Array<Record<string, unknown>> : []);
const typeOf = (n: Node): string => String(n.node_type ?? n.type ?? "") || "?";

/** a name as one string: a multilingual `{default, it…}` gives its default */
function text(v: unknown): string {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    v = o.default || Object.values(o)[0] || "";
  }
  return v == null ? "" : String(v);
}
const locator = (n: Node): string => text(n.url || n.data?.url || "");
const resources = (s: Section | null | undefined): Node[] => nodesOf(s).filter((n) => typeOf(n) === "resource");

/** s3Dgraphy's `classify_locator`, reduced to «is it a file of the project?» */
function isFileLocator(loc: string): boolean {
  const low = loc.trim().toLowerCase();
  if (low.startsWith("file://")) return true;
  return !/^(https?:\/\/|s3:\/\/|blend:\/\/|psx:\/\/)/.test(low);
}

/** a link as s3Dgraphy normalises it, or null */
function normLink(raw: Record<string, unknown>): { id: string; edge_type: string; source: string; tg: string; tn: string } | null {
  const tgt = (raw.target ?? {}) as Record<string, unknown>;
  const tg = String(tgt.graph_id ?? "").trim(), tn = String(tgt.node_id ?? "").trim();
  const src = String(raw.source ?? "").trim(), et = String(raw.edge_type ?? "").trim();
  if (!(tg && tn && src && et)) return null;
  return { id: String(raw.id ?? "").trim() || `${src}__${et}__${tg}::${tn}`, edge_type: et, source: src, tg, tn };
}

/** who USES a resource in a section: the non-acquisition nodes pointing at it
 *  (s3Dgraphy's `shelf.core.referrers`) */
function referrers(s: Section, rid: string): string[] {
  const out: string[] = [];
  for (const e of edgesOf(s)) {
    if (String(e.target) !== rid) continue;
    const src = nodesOf(s).find((n) => String(n.id) === String(e.source));
    if (!src || typeOf(src) === "dtc_acquisition") continue;
    out.push(String(e.source));
  }
  return out;
}

function members(doc: ContainerLike): { study: Array<[string, Section]>; shelf: [string, Section] | null; corpus: Section | null; periods: Section | null } {
  const study: Array<[string, Section]> = [];
  let shelf: [string, Section] | null = null, corpus: Section | null = null, periods: Section | null = null;
  for (const [id, s] of Object.entries(doc.graphs ?? {})) {
    if (!s || typeof s !== "object") continue;
    const c = collection(s);
    if (c === SHELF) shelf = [id, s];
    else if (c === CORPUS) corpus = s;
    else if (c === PERIODS) periods = s;
    else study.push([String(s.graph_id ?? id), s]);
  }
  return { study, shelf, corpus, periods };
}

function check(doc: ContainerLike, graphId: string): Section {
  const m = members(doc);
  const hit = m.study.find(([id]) => id === graphId);
  if (hit) {
    if (m.study.length === 1) {
      throw new GraphRemovalError(`'${graphId}' is the only study graph of this container: a container without a graph has no matrix to show`, "last");
    }
    return hit[1];
  }
  const sp = Object.entries(doc.graphs ?? {}).find(([id, s]) => (id === graphId || String(s?.graph_id ?? "") === graphId) && isSpecial(s));
  if (sp) throw new GraphRemovalError(`'${graphId}' is the shelf, the DTC corpus or the periodizations of this container, not a study graph: it is not removed this way`, "special");
  throw new GraphRemovalError(`no study graph '${graphId}' in this container`, "unknown");
}

/** What removing `graphId` would take away — the document untouched. */
export function graphRemovalReport(doc: ContainerLike, graphId: string,
    opts: { links?: LinksAction; shelf?: ShelfAction } = {}): RemovalReport {
  const links = opts.links ?? "keep", shelfAction = opts.shelf ?? "keep";
  const graph = check(doc, graphId);
  const m = members(doc);
  const others = m.study.filter(([id]) => id !== graphId);

  const byType: Record<string, number> = {};
  for (const n of nodesOf(graph)) byType[typeOf(n)] = (byType[typeOf(n)] ?? 0) + 1;
  const nodesByType = Object.fromEntries(Object.entries(byType).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

  const findIn = (s: Section, id: string): Node | undefined => nodesOf(s).find((n) => String(n.id) === id);
  const linksIn: RemovalLinkIn[] = [];
  for (const [gid, s] of others) {
    for (const raw of linksOf(s)) {
      const l = normLink(raw);
      if (!l || l.tg !== graphId) continue;
      linksIn.push({ graph_id: gid, link_id: l.id, edge_type: l.edge_type, source: l.source,
        source_name: text(findIn(s, l.source)?.name), target: l.tn, target_name: text(findIn(graph, l.tn)?.name) });
    }
  }

  // the shelf entries only this graph uses — across every member, as
  // `shelf_entry_status` looks (study graphs, the shelf, the corpus)
  const shelfOnly: RemovalItem[] = [];
  if (m.shelf) {
    const looked: Array<[string, Section]> = [...m.study, [String(m.shelf[1].graph_id ?? m.shelf[0]), m.shelf[1]]];
    if (m.corpus) looked.push([String(m.corpus.graph_id ?? "dtc"), m.corpus]);
    for (const entry of resources(m.shelf[1])) {
      const rid = String(entry.id);
      const where = new Set(looked.filter(([, s]) => referrers(s, rid).length).map(([id]) => id));
      if (where.size === 1 && where.has(graphId)) shelfOnly.push({ id: rid, name: text(entry.name), locator: locator(entry) });
    }
  }
  const droppedShelf = new Set(shelfAction === "drop" ? shelfOnly.map((e) => e.id) : []);

  // resources no other member names, by id or by locator
  const ids = new Set<string>(), locs = new Set<string>();
  const remember = (n: Node): void => { ids.add(String(n.id)); if (locator(n)) locs.add(locator(n)); };
  for (const [, s] of others) resources(s).forEach(remember);
  for (const s of [m.corpus, m.periods]) resources(s).forEach(remember);
  if (m.shelf) for (const n of resources(m.shelf[1])) if (!droppedShelf.has(String(n.id))) remember(n);
  const alone: RemovalItem[] = [], files: string[] = [];
  for (const n of resources(graph)) {
    const loc = locator(n);
    if (ids.has(String(n.id)) || (loc && locs.has(loc))) continue;
    alone.push({ id: String(n.id), name: text(n.name), locator: loc });
    if (loc && isFileLocator(loc) && !files.includes(loc)) files.push(loc);
  }

  const active = doc.active_graph_id ?? null;
  const newActive = active && others.some(([id]) => id === active) ? active : (others[0]?.[0] ?? null);
  return {
    graph_id: graphId,
    name: text(graph.name) || graphId,
    applied: false,
    nodes: nodesOf(graph).length,
    edges: edgesOf(graph).length,
    nodes_by_type: nodesByType,
    links_out: linksOf(graph).length,
    links_in: linksIn,
    links_action: links,
    shelf_only_here: shelfOnly,
    shelf_action: shelfAction,
    resources_alone: alone,
    files_alone: files,
    active_graph_id: newActive,
    active_changed: newActive !== active,
  };
}

/** Take a shelf resource out of a shelf section, with its acquisition events
 *  left with no output (s3Dgraphy's `remove_resource`); refused while the shelf
 *  itself uses it. */
export function dropShelfResource(shelf: Section, rid: string): boolean {
  const node = nodesOf(shelf).find((n) => String(n.id) === rid);
  if (!node || typeOf(node) !== "resource" || referrers(shelf, rid).length) return false;
  const acq = new Set(edgesOf(shelf).filter((e) => e.edge_type === "dtc_had_output" && String(e.target) === rid).map((e) => String(e.source)));
  let nodes = nodesOf(shelf).filter((n) => String(n.id) !== rid);
  let edges = edgesOf(shelf).filter((e) => String(e.source) !== rid && String(e.target) !== rid);
  for (const a of acq) {
    const ev = nodes.find((n) => String(n.id) === a);
    if (!ev || typeOf(ev) !== "dtc_acquisition") continue;
    if (edges.some((e) => e.edge_type === "dtc_had_output" && String(e.source) === a)) continue;
    nodes = nodes.filter((n) => String(n.id) !== a);
    edges = edges.filter((e) => String(e.source) !== a && String(e.target) !== a);
  }
  shelf.nodes = nodes;
  shelf.edges = edges;
  return true;
}

/** The other graphs' links towards `graphId`, kept marked or dropped (in place). */
export function settleLinksTowards(section: Section, graphId: string, action: LinksAction): number {
  const raw = linksOf(section);
  let n = 0;
  const kept: Array<Record<string, unknown>> = [];
  for (const l of raw) {
    const k = normLink(l);
    if (!k || k.tg !== graphId) { kept.push(l); continue; }
    n++;
    if (action === "keep") {
      const attrs = { ...((l.attributes as Record<string, unknown> | undefined) ?? {}), [TARGET_REMOVED_KEY]: graphId };
      kept.push({ ...l, attributes: attrs });
    }
  }
  if (n) section.links = kept;
  return n;
}

/** Remove `graphId` from a container document: a NEW document and the report.
 *  The document given is not touched. */
export function removeGraph(doc: ContainerLike, graphId: string,
    opts: { links?: LinksAction; shelf?: ShelfAction } = {}): { doc: ContainerLike; report: RemovalReport } {
  const report = graphRemovalReport(doc, graphId, opts);
  const out = JSON.parse(JSON.stringify(doc)) as ContainerLike;
  for (const [id, s] of Object.entries(out.graphs)) {
    if (!isSpecial(s) && String(s.graph_id ?? id) === graphId) delete out.graphs[id];
  }
  for (const [, s] of Object.entries(out.graphs)) if (!isSpecial(s)) settleLinksTowards(s, graphId, report.links_action);
  if (report.shelf_action === "drop") {
    const shelf = Object.values(out.graphs).find((s) => collection(s) === SHELF);
    if (shelf) for (const e of report.shelf_only_here) dropShelfResource(shelf, e.id);
  }
  if (report.active_changed) {
    out.active_graph_id = report.active_graph_id;
    // the file-level layout was the removed graph's: it goes with it
    if (report.active_graph_id && out.graphs[report.active_graph_id]?.layout) out.layout = out.graphs[report.active_graph_id].layout;
    else delete out.layout;
  }
  return { doc: out, report: { ...report, applied: true } };
}
