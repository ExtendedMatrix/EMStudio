/**
 * NARRATIVA-BLOCCHI p.2 · the blocks that ASK THE GRAPH.
 *
 * E.D., 20 Oct 2026: the standard blocks of a story are blocks that filter —
 * they put a question to the graph and show what answers, recomputed every time
 * the page is drawn, like every other embed. One mechanism for the three:
 *
 *   · **Storia delle ricerche** (`research_history`) — the campaigns and studies,
 *     by date: the graphs of the file (a graph is a study, D3.1 §3.3), their
 *     rapporti (the links the «Graphs paradata» view draws), the HC9 studies and
 *     the HC13 projects, with who, when, which project, which licence;
 *   · **Bibliografia** (`bibliography`) — the documents, grouped as the datamodel
 *     tells them apart, in one form of citation;
 *   · **Beni coinvolti** (`heritage`) — every HDT-O node (HC1, HC2, HC9, HC13,
 *     HC16) and the arcs that really join them, nested ONLY where an arc says
 *     «part of» (no hierarchy is presumed: a study of a forum may touch a good
 *     inside it that has a biography of its own).
 *
 * WHERE IT LIVES. A query block is an embed of the GRAPH (`ref` = the graph-self
 * node), `view_type: "table"` — the datamodel's «a query over the em.json» — and
 * its question in `options`: `{query, scope, types, order}`. `Block.options` is
 * free in s3Dgraphy (`narrative_node.Block`), so nothing in the NarrativeNode
 * changes; an exporter that does not know `options.query` still sees a valid
 * table embed of the graph. Nothing is cached in the block: the answer is the
 * graph's, now.
 *
 * Pure: graphs in, rows out. No DOM, no store; the page draws the rows, the
 * print and notebook previews write them as text with the date they were
 * computed, and `check-narrative-query.mjs` counts them.
 */
import { t } from "./i18n";
import { hdtoChain, roleNode } from "./hdto";
import { linksOfGraph } from "./links";
import { documentDating, yearOf } from "./doc-dating";
import { sourceOfExtractor } from "./naming";
import { classOf, edgeLabel, nodeLabel } from "./rules";
import { isRemoved } from "./crdt";
import type { EmDocument, EmEdge, EmNode } from "./types";

export type QueryKind = "research_history" | "bibliography" | "heritage";
export type QueryScope = "narrative" | "graph" | "file";

export const QUERY_KINDS: readonly QueryKind[] = ["research_history", "heritage", "bibliography"];
export const QUERY_SCOPES: readonly QueryScope[] = ["narrative", "graph", "file"];
/** the view type a query block is stored as: the datamodel's «a query over the
 *  em.json» (`valid_view_types.table`) */
export const QUERY_VIEW_TYPE = "table";

/** What a block may include, per kind — the values of `options.types`. */
export const QUERY_TYPES: Record<QueryKind, readonly string[]> = {
  // a graph is a study (D3.1 §3.3); a StudyNode / ProjectNode not already the
  // graph's own is an entry of its own
  research_history: ["graph", "study", "project"],
  // the datamodel's axes (`em_visual_rules`: document_variant_styles = geometry,
  // document_roles = role): a document with a geometry has a model (a survey); a
  // comparative one is a comparison; the rest are sources — the datamodel does
  // not tell a bibliographic reference from an archive record
  bibliography: ["survey", "comparative", "source"],
  heritage: ["HeritageEntityNode", "HDTNode", "StudyNode", "ProjectNode", "GraphNode"],
};
/** The orders a block may take, the first is the default. */
export const QUERY_ORDERS: Record<QueryKind, readonly string[]> = {
  research_history: ["date_asc", "date_desc"],
  bibliography: ["name", "date"],
  heritage: ["type", "name"],
};
const DEFAULT_SCOPE: Record<QueryKind, QueryScope> = {
  research_history: "file",
  bibliography: "graph",
  heritage: "file",
};

export interface QueryOptions {
  query: QueryKind;
  scope: QueryScope;
  types: string[];
  order: string;
}

interface AnyBlock { block_type?: string; ref?: string; view_type?: string; text?: string;
                     options?: Record<string, unknown> }

/** The question a block asks, defaults filled in; null for any other block. */
export function queryOf(block: AnyBlock | undefined | null): QueryOptions | null {
  const o = (block?.options ?? {}) as Record<string, unknown>;
  const kind = o.query as QueryKind;
  if (!block || block.block_type !== "embed" || !QUERY_KINDS.includes(kind)) return null;
  const scope = QUERY_SCOPES.includes(o.scope as QueryScope) ? (o.scope as QueryScope) : DEFAULT_SCOPE[kind];
  const all = QUERY_TYPES[kind];
  const types = Array.isArray(o.types) ? (o.types as unknown[]).map(String).filter((x) => all.includes(x)) : [...all];
  const order = QUERY_ORDERS[kind].includes(String(o.order)) ? String(o.order) : QUERY_ORDERS[kind][0];
  return { query: kind, scope, types, order };
}

/** The `options` a new query block is written with (only the question: the
 *  defaults are not written, so a default that changes reaches old blocks). */
export function newQueryOptions(kind: QueryKind): Record<string, unknown> {
  return { query: kind };
}

/** One graph the question may read. `label` is how the workspace names it. */
export interface QueryGraph { graphId: string; label: string; doc: EmDocument }

export interface QueryInput {
  /** the graphs of the file, the one holding the story included */
  graphs: QueryGraph[];
  /** the graph the story lives in */
  here: string;
  /** the story's chapters (the «this narrative» scope) */
  chapters: { blocks?: AnyBlock[] }[];
}

export interface QueryRow {
  id: string;
  graphId: string;
  title: string;
  /** the type badge (HC1, a study, a graph…) */
  kind: string;
  lines: string[];
  /** nesting, where an arc says «part of» (heritage) */
  depth: number;
  /** the title IS the node's name (a printed mention would say the same) */
  named?: boolean;
  year: number | null;
}
export interface QueryGroup { key: string; label: string; rows: QueryRow[] }
export interface QueryResult {
  options: QueryOptions;
  groups: QueryGroup[];
  count: number;
  /** what the answer cannot say, said (a field missing in the graph) */
  notes: string[];
}

// ── shared readings ──────────────────────────────────────────────────────────

const text = (v: unknown): string => (v == null ? "" : String(v).trim());
const dataOf = (n: EmNode | undefined): Record<string, unknown> => (n?.data ?? {}) as Record<string, unknown>;
const live = (n: EmNode): boolean => !isRemoved(n as unknown as Record<string, unknown>);
const nameOf = (n: EmNode | undefined): string => (n ? text(n.name) || n.id : "");
const MENTION = /\[\[\s*([^[\]\n]+?)\s*\]\]/g;

/** every id a story cites, embed or mention, in reading order */
export function citedIds(chapters: { blocks?: AnyBlock[] }[]): string[] {
  const out: string[] = [];
  const add = (id: string): void => { if (id && !out.includes(id)) out.push(id); };
  for (const c of chapters)
    for (const b of c.blocks ?? []) {
      if (b.block_type === "embed") { if (!queryOf(b)) add(text(b.ref)); }
      else for (const m of String(b.text ?? "").matchAll(MENTION)) add(m[1]);
    }
  return out;
}

function graphsInScope(input: QueryInput, scope: QueryScope): QueryGraph[] {
  if (scope === "file") return input.graphs;
  return input.graphs.filter((g) => g.graphId === input.here);
}

/** the graph's own paradata: the members of the group the graph-self node has
 *  (`has_paradata_nodegroup`), and what hangs from it directly — the same
 *  reading as the «Graphs paradata» view (`views/graphs.ts`) */
export function graphParadata(doc: EmDocument): EmNode[] {
  const root = roleNode(doc, "proposition_set");
  if (!root) return [];
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const groups = new Set(doc.graph.edges
    .filter((e) => e.source === root.id && e.edge_type === "has_paradata_nodegroup").map((e) => e.target));
  const out: EmNode[] = [];
  for (const e of doc.graph.edges) {
    const id = groups.has(e.target) && e.edge_type === "is_in_paradata_nodegroup" ? e.source
      : e.source === root.id && ["has_author", "has_license", "has_embargo", "has_property"].includes(e.edge_type ?? "")
        ? e.target : null;
    const n = id ? byId.get(id) : undefined;
    if (n && live(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

interface GraphRights { authors: string[]; licence: string[]; embargo: string[]; date: string | null }

function rightsOf(doc: EmDocument): GraphRights {
  const pd = graphParadata(doc);
  const embargo = pd.filter((n) => n.node_type === "embargo").map((n) => {
    const d = dataOf(n);
    const span = [text(d.embargo_start), text(d.embargo_end)].filter(Boolean).join(" → ");
    return span && span !== nameOf(n) ? `${nameOf(n)} (${span})` : nameOf(n);
  });
  const date = pd.find((n) => n.node_type === "property" && /date|absolute_time_start/i.test(text(n.name)));
  return {
    authors: pd.filter((n) => n.node_type === "author" || n.node_type === "author_ai").map(nameOf),
    licence: pd.filter((n) => n.node_type === "license").map((n) => text(dataOf(n).license_type) || nameOf(n)),
    embargo,
    date: date ? text(date.description) || text(dataOf(date).value) || null : null,
  };
}

const naturalCmp = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

// ── 2a · the history of the research ─────────────────────────────────────────

function researchHistory(input: QueryInput, o: QueryOptions): QueryResult {
  const rows: QueryRow[] = [];
  const notes: string[] = [];
  const graphs = graphsInScope(input, o.scope);
  const labelOfGraph = new Map(input.graphs.map((g) => [g.graphId, g.label]));
  const usedStudies = new Set<string>();
  const usedProjects = new Set<string>();
  let undated = 0;
  for (const g of graphs) {
    const chain = hdtoChain(g.doc);
    const r = rightsOf(g.doc);
    if (chain.study) usedStudies.add(chain.study.id);
    if (chain.project) usedProjects.add(chain.project.id);
    if (!o.types.includes("graph")) continue;
    const when = chain.study?.date || r.date;
    const who = [...r.authors, ...(chain.study?.authors ? [chain.study.authors] : [])];
    const lines: string[] = [];
    lines.push(`${t("nq.when")}: ${when || t("nq.undeclared")}`);
    lines.push(`${t("nq.who")}: ${who.length ? who.join(", ") : t("nq.undeclared")}`);
    if (chain.study) lines.push(`${t("nq.study")}: ${chain.study.name}${chain.study.code ? ` · ${chain.study.code}` : ""}${chain.study.studyKind ? ` · ${chain.study.studyKind}` : ""}`);
    lines.push(`${t("nq.project")}: ${chain.project?.name || t("nq.undeclared")}`);
    lines.push(`${t("nq.licence")}: ${r.licence.join(", ") || t("nq.undeclared")}${r.embargo.length ? ` · ${t("nq.embargo")}: ${r.embargo.join(", ")}` : ""}`);
    // the rapporti with the other graphs of the file (`graphs.<id>.links`)
    const per = new Map<string, number>();
    for (const l of linksOfGraph(g.doc)) {
      const k = `${l.target.graph_id}|${l.edge_type}`;
      per.set(k, (per.get(k) ?? 0) + 1);
    }
    for (const other of input.graphs) {
      if (other.graphId === g.graphId) continue;
      for (const l of linksOfGraph(other.doc)) {
        if (l.target.graph_id !== g.graphId) continue;
        const k = `${other.graphId}|←${l.edge_type}`;
        per.set(k, (per.get(k) ?? 0) + 1);
      }
    }
    for (const [k, n] of per) {
      const [gid, et] = k.split("|");
      const back = et.startsWith("←");
      const name = labelOfGraph.get(gid) ?? gid;
      lines.push(`${t("nq.link")}: ${back ? `${name} → ` : `→ ${name} `}${edgeLabel(et.replace(/^←/, ""))} × ${n}`);
    }
    const year = yearOf(when);
    if (year == null) undated++;
    const root = roleNode(g.doc, "proposition_set");
    rows.push({ id: chain.study?.id ?? root?.id ?? g.graphId, graphId: g.graphId, title: g.label,
                kind: t("nq.kind.graph"), lines, depth: 0, year, named: false });
  }
  // the HC9 studies and HC13 projects that are not a graph's own
  for (const g of graphs) {
    for (const n of g.doc.graph.nodes) {
      if (!live(n)) continue;
      const cls = classOf(n.node_type);
      if (cls === "StudyNode" && o.types.includes("study") && !usedStudies.has(n.id)) {
        usedStudies.add(n.id);
        const d = dataOf(n);
        const year = yearOf(d.date);
        if (year == null) undated++;
        rows.push({ id: n.id, graphId: g.graphId, title: nameOf(n), kind: t("nq.kind.study"), depth: 0, year,
          lines: [`${t("nq.when")}: ${text(d.date) || t("nq.undeclared")}`,
                  `${t("nq.who")}: ${text(d.authors) || t("nq.undeclared")}`,
                  `${t("nq.inGraph")}: ${g.label}`] });
      }
      if (cls === "ProjectNode" && o.types.includes("project") && !usedProjects.has(n.id)) {
        usedProjects.add(n.id);
        const studies = g.doc.graph.edges.filter((e) => e.source === n.id && e.edge_type === "includes_study")
          .map((e) => nameOf(g.doc.graph.nodes.find((x) => x.id === e.target))).filter(Boolean);
        undated++;
        rows.push({ id: n.id, graphId: g.graphId, title: nameOf(n), kind: t("nq.kind.project"), depth: 0, year: null,
          lines: [`${t("nq.includes")}: ${studies.join(", ") || "—"}`, `${t("nq.inGraph")}: ${g.label}`] });
      }
    }
  }
  const dir = o.order === "date_desc" ? -1 : 1;
  rows.sort((a, b) => (a.year == null ? 1 : 0) - (b.year == null ? 1 : 0)
    || (a.year != null && b.year != null ? (a.year - b.year) * dir : 0) || naturalCmp(a.title, b.title));
  if (undated) notes.push(t("nq.undatedNote", { n: String(undated) }));
  if (o.scope !== "file" && input.graphs.length > 1) notes.push(t("nq.otherGraphsNote", { n: String(input.graphs.length - 1) }));
  return { options: o, groups: rows.length ? [{ key: "all", label: "", rows }] : [], count: rows.length, notes };
}

// ── 2b · the bibliography ────────────────────────────────────────────────────

/** the datamodel's legacy convention (`DocumentNode.effective_role`): D.NNN with
 *  NNN ≥ 1000 is comparative, an explicit `data.role` wins */
export function documentRole(n: EmNode): "analytical" | "comparative" {
  const r = text(dataOf(n).role);
  if (r === "analytical" || r === "comparative") return r;
  const m = /^D\.(\d+)(?:\.|$)/.exec(text(n.name));
  return m && Number(m[1]) >= 1000 ? "comparative" : "analytical";
}

/** survey (it has a geometry: a model) · comparative · source */
export function documentGroup(n: EmNode): "survey" | "comparative" | "source" {
  if (text(dataOf(n).geometry)) return "survey";
  return documentRole(n) === "comparative" ? "comparative" : "source";
}

/** the documents a story rests on: those it cites, and those its cited nodes'
 *  properties are read from (property → extractor/combiner → document) */
function documentsOfStory(doc: EmDocument, chapters: QueryInput["chapters"]): Set<string> {
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const outOf = (id: string, et: string): string[] =>
    doc.graph.edges.filter((e: EmEdge) => e.source === id && e.edge_type === et).map((e) => e.target);
  const docs = new Set<string>();
  const extractorDocs = (x: string): void => {
    const s = sourceOfExtractor(doc, x);
    if (s?.kind === "document") docs.add(s.id);
  };
  for (const id of citedIds(chapters)) {
    const n = byId.get(id);
    if (!n) continue;
    if (n.node_type === "document") { docs.add(id); continue; }
    const props = n.node_type === "property" ? [id] : outOf(id, "has_property");
    if (n.node_type === "extractor") extractorDocs(id);
    for (const p of props)
      for (const step of outOf(p, "has_data_provenance")) {
        if (byId.get(step)?.node_type === "combiner") for (const x of outOf(step, "combines")) extractorDocs(x);
        else extractorDocs(step);
      }
  }
  return docs;
}

export interface Citation { code: string; authors: string[]; year: number | null; text: string; url: string }

/** One form for every document: «code — Authors (year). Text. url», the parts
 *  the graph does not have left out (and counted, `bibliographyFields`). */
export function citationOf(doc: EmDocument, n: EmNode): Citation {
  const byId = new Map(doc.graph.nodes.map((x) => [x.id, x]));
  const authors = doc.graph.edges.filter((e) => e.source === n.id && e.edge_type === "has_author")
    .map((e) => nameOf(byId.get(e.target))).filter(Boolean);
  const year = documentDating(doc, n.id).year ?? yearOf(dataOf(n).date);
  return { code: nameOf(n), authors, year, text: text(n.description), url: text(dataOf(n).url) };
}

export function citationText(c: Citation): string {
  const head = [c.authors.join(", "), c.year != null ? `(${c.year})` : ""].filter(Boolean).join(" ");
  return [head, c.text].filter(Boolean).join(". ") + (c.url ? ` — ${c.url}` : "");
}

/** What the documents of a graph carry for a citation — the measure the report
 *  asks for (which bibliographic fields exist today). */
export function bibliographyFields(doc: EmDocument): Record<string, number> {
  const docs = doc.graph.nodes.filter((n) => n.node_type === "document" && live(n));
  const count = (f: (n: EmNode) => boolean): number => docs.filter(f).length;
  return {
    documents: docs.length,
    description: count((n) => !!text(n.description)),
    url: count((n) => !!text(dataOf(n).url)),
    author: count((n) => citationOf(doc, n).authors.length > 0),
    year: count((n) => citationOf(doc, n).year != null),
    role: count((n) => !!text(dataOf(n).role)),
    content_nature: count((n) => !!text(dataOf(n).content_nature)),
    geometry: count((n) => !!text(dataOf(n).geometry)),
    doi: count((n) => !!text(dataOf(n).doi)),
    title: count((n) => !!text(dataOf(n).title)),
  };
}

function bibliography(input: QueryInput, o: QueryOptions): QueryResult {
  const groups = new Map<string, QueryRow[]>(QUERY_TYPES.bibliography.map((k) => [k, []]));
  for (const g of graphsInScope(input, o.scope)) {
    const wanted = o.scope === "narrative" ? documentsOfStory(g.doc, input.chapters) : null;
    for (const n of g.doc.graph.nodes) {
      if (n.node_type !== "document" || !live(n)) continue;
      if (wanted && !wanted.has(n.id)) continue;
      const grp = documentGroup(n);
      if (!o.types.includes(grp)) continue;
      const c = citationOf(g.doc, n);
      const geometry = text(dataOf(n).geometry);
      groups.get(grp)!.push({
        id: n.id, graphId: g.graphId, title: c.code, depth: 0, year: c.year,
        kind: geometry || (grp === "comparative" ? t("nq.bib.comparative") : t("nq.bib.source")),
        lines: [citationText(c) || t("nq.noCitation")],
      });
    }
  }
  const out: QueryGroup[] = [];
  for (const [key, rows] of groups) {
    if (!rows.length) continue;
    rows.sort((a, b) => o.order === "date"
      ? (a.year == null ? 1 : 0) - (b.year == null ? 1 : 0) || (a.year ?? 0) - (b.year ?? 0) || naturalCmp(a.title, b.title)
      : naturalCmp(a.title, b.title));
    out.push({ key, label: t(`nq.bib.${key}`), rows });
  }
  const count = out.reduce((s, g) => s + g.rows.length, 0);
  const notes: string[] = [];
  if (o.scope === "narrative") notes.push(t("nq.bib.narrativeNote"));
  return { options: o, groups: out, count, notes };
}

// ── 2c · the goods involved (HDT-O) ──────────────────────────────────────────

/** the arcs that are «part of», and which end is the part (the child) */
const PART_OF: Record<string, "source" | "target"> = {
  heritage_part_of: "source",            // HC1 part of HC1 (crm:P46i)
  has_digital_twin_component: "target",  // HC2 has component HC2 (HP3)
  includes_study: "target",              // HC13 includes HC9 (crm:P9)
};

const HDTO_CLASSES = QUERY_TYPES.heritage;
const HC: Record<string, string> = {
  HeritageEntityNode: "HC1", HDTNode: "HC2", StudyNode: "HC9", ProjectNode: "HC13", GraphNode: "HC16",
};

function heritage(input: QueryInput, o: QueryOptions): QueryResult {
  // the HDT-O nodes of the scope, merged by id across the graphs (one HC1 named
  // by two studies is one good), with the graphs that hold them
  const nodes = new Map<string, { n: EmNode; graphId: string; graphs: string[]; cls: string }>();
  const arcs: { s: string; t: string; et: string }[] = [];
  const seenArc = new Set<string>();
  const graphs = o.scope === "file" ? input.graphs : input.graphs.filter((g) => g.graphId === input.here);
  for (const g of graphs) {
    for (const n of g.doc.graph.nodes) {
      const cls = classOf(n.node_type);
      if (!HDTO_CLASSES.includes(cls) || !live(n)) continue;
      const have = nodes.get(n.id);
      if (have) { if (!have.graphs.includes(g.graphId)) have.graphs.push(g.graphId); }
      else nodes.set(n.id, { n, graphId: g.graphId, graphs: [g.graphId], cls });
    }
    for (const e of g.doc.graph.edges) {
      const k = `${e.source}|${e.edge_type}|${e.target}`;
      if (seenArc.has(k)) continue;
      seenArc.add(k);
      arcs.push({ s: e.source, t: e.target, et: String(e.edge_type ?? "") });
    }
  }
  const hdtoArcs = arcs.filter((a) => nodes.has(a.s) && nodes.has(a.t));
  // «this narrative»: the HDT-O nodes it cites and the graph it lives in, with
  // everything an HDT-O arc joins to them
  let keep: Set<string> | null = null;
  if (o.scope === "narrative") {
    keep = new Set(citedIds(input.chapters).filter((id) => nodes.has(id)));
    const here = input.graphs.find((g) => g.graphId === input.here);
    const root = here ? roleNode(here.doc, "proposition_set") : undefined;
    if (root && nodes.has(root.id)) keep.add(root.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const a of hdtoArcs)
        if (keep.has(a.s) !== keep.has(a.t)) { keep.add(a.s); keep.add(a.t); grew = true; }
    }
  }
  const inScope = (id: string): boolean => (!keep || keep.has(id)) && o.types.includes(nodes.get(id)!.cls);
  // the parent of each node, where an arc says «part of» (the first such arc)
  const parent = new Map<string, string>();
  for (const a of hdtoArcs) {
    const side = PART_OF[a.et];
    if (!side) continue;
    const child = side === "source" ? a.s : a.t;
    const whole = side === "source" ? a.t : a.s;
    if (!parent.has(child) && child !== whole && inScope(child) && inScope(whole)) parent.set(child, whole);
  }
  // a cycle of «part of» (data's own contradiction) is cut where it closes
  for (const [c] of parent) {
    const seen = new Set([c]);
    let cur = parent.get(c);
    while (cur && !seen.has(cur)) { seen.add(cur); cur = parent.get(cur); }
    if (cur === c) parent.delete(c);
  }
  /** the arc IS the nesting drawn (not repeated as a line) */
  const isNesting = (a: { s: string; t: string; et: string }): boolean => {
    const side = PART_OF[a.et];
    if (!side) return false;
    return side === "source" ? parent.get(a.s) === a.t : parent.get(a.t) === a.s;
  };
  const labelOfGraph = new Map(input.graphs.map((g) => [g.graphId, g.label]));
  const rightsCache = new Map<string, GraphRights>();
  const rights = (gid: string): GraphRights => {
    let r = rightsCache.get(gid);
    if (!r) {
      const g = input.graphs.find((x) => x.graphId === gid);
      r = g ? rightsOf(g.doc) : { authors: [], licence: [], embargo: [], date: null };
      rightsCache.set(gid, r);
    }
    return r;
  };
  const rowOf = (id: string, depth: number): QueryRow => {
    const { n, graphId, graphs: gs, cls } = nodes.get(id)!;
    const d = dataOf(n);
    const lines: string[] = [];
    if (cls === "HeritageEntityNode") {
      lines.push(`${t("nq.scale")}: ${text(d.scale) || t("nq.undeclared")}`);
      const studies = hdtoArcs.filter((a) => a.t === id && a.et === "study_about_heritage").map((a) => nameOf(nodes.get(a.s)?.n));
      lines.push(`${t("nq.studies")}: ${studies.join(", ") || "—"}`);
    }
    if (cls === "HDTNode")
      lines.push(`${t("nq.twinState")}: ${text(d.heritage_entity_iri) ? t("nq.twinRegistered") : t("nq.twinProvisional")}`);
    if (cls === "StudyNode" && (text(d.date) || text(d.authors)))
      lines.push([text(d.authors), text(d.date)].filter(Boolean).join(" · "));
    // licence and embargo are the graph's (`has_license`, `has_embargo` leave a
    // GraphNode only): a good carries those of the graphs that hold it
    const lic = [...new Set(gs.flatMap((g) => rights(g).licence))];
    const emb = [...new Set(gs.flatMap((g) => rights(g).embargo))];
    lines.push(`${t("nq.licence")}: ${lic.join(", ") || t("nq.undeclared")}${emb.length ? ` · ${t("nq.embargo")}: ${emb.join(", ")}` : ""}`);
    // every other real arc, both ways (the «part of» one is the nesting)
    for (const a of hdtoArcs) {
      if (isNesting(a)) continue;
      if (a.s === id) lines.push(`${edgeLabel(a.et)} → ${nameOf(nodes.get(a.t)?.n)}`);
      else if (a.t === id) lines.push(`← ${edgeLabel(a.et)} · ${nameOf(nodes.get(a.s)?.n)}`);
    }
    if (gs.length > 1 || graphId !== input.here)
      lines.push(`${t("nq.inGraph")}: ${gs.map((g) => labelOfGraph.get(g) ?? g).join(", ")}`);
    // an HC16 IS a graph: it is named as the workspace names its graph
    const own = cls === "GraphNode" ? input.graphs.find((g) => roleNode(g.doc, "proposition_set")?.id === id) : undefined;
    return { id, graphId, title: own ? own.label : nameOf(n), named: !own,
             kind: `${HC[cls] ?? ""} · ${nodeLabel(n.node_type)}`, lines, depth, year: null };
  };
  const ids = [...nodes.keys()].filter(inScope);
  const cmp = (a: string, b: string): number => {
    const A = nodes.get(a)!, B = nodes.get(b)!;
    return (o.order === "type" ? HDTO_CLASSES.indexOf(A.cls) - HDTO_CLASSES.indexOf(B.cls) : 0)
      || naturalCmp(nameOf(A.n), nameOf(B.n));
  };
  const rows: QueryRow[] = [];
  const walk = (id: string, depth: number): void => {
    rows.push(rowOf(id, depth));
    for (const c of ids.filter((x) => parent.get(x) === id).sort(cmp)) walk(c, depth + 1);
  };
  for (const id of ids.filter((x) => !parent.has(x)).sort(cmp)) walk(id, 0);
  const notes: string[] = [];
  if (rows.some((r) => nodes.get(r.id)!.cls === "HeritageEntityNode")) notes.push(t("nq.scaleNote"));
  if (!rows.some((r) => nodes.get(r.id)!.cls !== "GraphNode")) notes.push(t("nq.noChainNote"));
  return { options: o, groups: rows.length ? [{ key: "all", label: "", rows }] : [], count: rows.length, notes };
}

/** Ask the graph. */
export function runQuery(input: QueryInput, o: QueryOptions): QueryResult {
  if (o.query === "research_history") return researchHistory(input, o);
  if (o.query === "bibliography") return bibliography(input, o);
  return heritage(input, o);
}

/** The answer as paragraphs of plain text — what Print and Notebook write,
 *  and what an export carries: the block's title with the date it was
 *  computed, then one paragraph per entry. An entry of the story's own graph
 *  is written as a mention (`[[id]]`), so the printed name still leads to the
 *  node; an entry of another graph is its name. */
export function queryParagraphs(r: QueryResult, computedAt: Date, here: string): string[] {
  const out = [`${t(`nq.title.${r.options.query}`)} — ${t("nq.computedAt", { date: computedAt.toISOString().slice(0, 10) })}`];
  for (const g of r.groups) {
    if (g.label) out.push(`${g.label} (${g.rows.length})`);
    for (const row of g.rows) {
      const name = row.graphId === here && row.named !== false ? `[[${row.id}]]` : row.title;
      out.push(`${"↳ ".repeat(row.depth)}${name}${row.kind ? ` [${row.kind}]` : ""} — ${row.lines.join("; ")}`);
    }
  }
  if (!r.count) out.push(t("nq.empty"));
  for (const n of r.notes) out.push(n);
  return out;
}

/** The chapters with every query block BAKED into a prose block (a copy: the
 *  story is not touched). Print, Notebook and the export read this, so the
 *  preview and the file say the same thing (s3Dgraphy's exporters do not know
 *  `options.query`; a table embed of the graph is what they would draw). */
export function bakeQueries<C extends { blocks?: AnyBlock[] }>(chapters: C[], input: QueryInput,
                                                              computedAt: Date): C[] {
  return chapters.map((c) => ({
    ...c,
    blocks: (c.blocks ?? []).map((b) => {
      const q = queryOf(b);
      if (!q) return b;
      return { block_type: "prose", text: queryParagraphs(runQuery(input, q), computedAt, input.here).join("\n\n"),
               options: { baked_query: q.query, computed_at: computedAt.toISOString() } } as AnyBlock;
    }),
  }));
}
