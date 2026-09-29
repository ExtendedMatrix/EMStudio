/**
 * COLLEGARE · what a story BECOMES outside EMStudio — the rules of s3Dgraphy's
 * exporters, read here so the page can PREVIEW them (Stampa, Notebook) and the
 * inspector can say, embed by embed, what each will turn into.
 *
 * This is not a port of the exporters: nothing here writes a .tex or a .ipynb.
 * It is the handful of decisions the exporters make — which view types are
 * CITED and which are FIGURES (`latex_exporter.CITED_VIEW_TYPES`), which bake
 * to a picture (`bake.DEFERRED_RENDER_VIEW_TYPES`), which stay a link in a
 * notebook (`ipynb_exporter._SCENE_VIEW_TYPES`), the notebook's query cells
 * (`_CELLS`), and the rule that what no person validated is not printed
 * (`narrative_node.is_unvalidated`, `UNVALIDATED_NOTICE`). Each constant says
 * where it is from, and `check-narrative-desk.mjs` reads the Python source and
 * fails the day one of them moves — so the preview cannot drift from the file.
 */
import { canonicalViewType, VIEW_TYPES } from "./narrative-edit";
import type { EmDocument, EmNode } from "./types";

/** `latex_exporter.CITED_VIEW_TYPES`: a printed page CITES these. */
export const CITED_VIEW_TYPES = ["source", "document"];
/** `bake.DEFERRED_RENDER_VIEW_TYPES`: a picture baked at export time. */
export const DEFERRED_RENDER_VIEW_TYPES = ["scene3d", "matrix"];
/** `ipynb_exporter._SCENE_VIEW_TYPES`: a notebook links, it does not plot. */
export const SCENE_VIEW_TYPES = ["scene3d", "rm", "un_scene"];
/** `narrative_node.UNVALIDATED_NOTICE`, verbatim — the exporters write it. */
export const UNVALIDATED_NOTICE = "⚠︎ non validato da una persona"; // ALLOW-IT: s3Dgraphy's exported text
/** `narrative_node.MENTION_PATTERN`. */
export const MENTION_PATTERN = /\[\[\s*([^[\]\n]+?)\s*\]\]/g;

/** `ipynb_exporter._CELLS`, the templates verbatim (`{label}`, `{ref}`; `{{`/`}}`
 *  are Python's escaped braces and are written back as single braces). */
export const NB_CELLS: Record<string, string> = {
  us: `# {label}
node = index["{ref}"]
print(node.node_type, "·", getattr(node, "name", node.node_id))
# where this unit is cited, in reading order — the ordered answer SPARQL
# cannot give (the chapters are deliberately not reified in RDF)
api.narratives_citing(graph, "{ref}")`,
  paradata: `# {label} — the evidence chain, queried
[r for r in api.narrative_citations(graph) if r["ref"] == "{ref}"]`,
  matrix: `# {label}
# the units of this scope, per epoch. EMLab (DP-21) owns these numbers; the
# fallback is the library's own, and the cell says which one answered.
try:
    from emlab import metrics
    rows = metrics.units_per_epoch(graph)
    print("via EMLab (DP-21)")
except ImportError:
    rows = api.interpretive_coverage(graph)
    print("EMLab not installed — showing the library's coverage instead")
rows`,
  timeline: `# {label}
try:
    from emlab import metrics
    rows = metrics.epochs(graph)
    print("via EMLab (DP-21)")
except ImportError:
    rows = [{{"id": n.node_id, "name": getattr(n, "name", n.node_id)}}
            for n in graph.nodes if n.node_type in ("EpochNode", "epoch")]
    print("EMLab not installed — listing the epochs from the graph")
rows`,
  table: `# {label} — the live query, run now
api.interpretive_coverage(graph)`,
  document: `# {label}
node = index["{ref}"]
print(getattr(node, "name", node.node_id))
# the image itself is served by IIIF; here is what the graph says about it
getattr(node, "data", {{}})`,
  map: `# {label}
getattr(index["{ref}"], "data", {{}})`,
};

export interface ProjBlock {
  block_type?: string;
  text?: string;
  ref?: string;
  view_type?: string;
  options?: Record<string, unknown>;
  ai_generated?: boolean;
  validated_by?: string | null;
  authored_by?: string;
}
export interface ProjChapter { title?: string; anchor?: string; blocks?: ProjBlock[] }

/** `narrative_node.is_unvalidated`: machine prose no person put their name to. */
export function isUnvalidated(b: ProjBlock): boolean {
  return (b.block_type ?? "prose") === "prose" && !!b.ai_generated && !b.validated_by;
}

/** `narrative_node.unvalidated_for_export`: what an export leaves out. */
export function unvalidatedForExport(chapters: ProjChapter[]): { chapter: number; chapter_title: string; block: number }[] {
  const out: { chapter: number; chapter_title: string; block: number }[] = [];
  chapters.forEach((c, ci) => (c.blocks ?? []).forEach((b, bi) => {
    if (isUnvalidated(b)) out.push({ chapter: ci, chapter_title: String(c.title ?? ""), block: bi });
  }));
  return out;
}

/** The ids `[[id]]` a prose text mentions, once each, in order. */
export function mentionsIn(text: string | undefined): string[] {
  const seen: string[] = [];
  for (const m of String(text ?? "").matchAll(MENTION_PATTERN))
    if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/** What an embed becomes in a printed format (DOCX, LaTeX). */
export type PrintKind = "citation" | "figure-baked" | "figure";
export function printKindOf(viewType: string | undefined): PrintKind {
  const v = canonicalViewType(viewType);
  if (CITED_VIEW_TYPES.includes(v)) return "citation";
  if (DEFERRED_RENDER_VIEW_TYPES.includes(v)) return "figure-baked";
  return "figure";
}

/** What an embed becomes in the notebook. */
export type NotebookKind = "link" | "cell" | "cell-generic";
export function notebookKindOf(viewType: string | undefined): NotebookKind {
  const v = canonicalViewType(viewType);
  if (SCENE_VIEW_TYPES.includes(v)) return "link";
  return NB_CELLS[v] ? "cell" : "cell-generic";
}

/** The query cell the notebook writes for an embed, as `_embed_cells` does. */
export function notebookCell(viewType: string | undefined, ref: string): string {
  const v = canonicalViewType(viewType);
  const label = `embed · ${v || "reference"} → ${ref}`;
  const tpl = NB_CELLS[v];
  if (!tpl) return `# ${label} (no query defined for this view type yet)\nindex.get("${ref}")`;
  return tpl.replace(/\{label\}/g, label).replace(/\{ref\}/g, ref)
    .replace(/\{\{/g, "{").replace(/\}\}/g, "}");
}

// ── which view types a node can be SHOWN as ──────────────────────────────────
//
// The datamodel's `valid_view_types` is ONE list for the NarrativeNode, with a
// sentence each — it does not say which node types each view admits. What does
// say it is the renderers (`narrative.ts`, `narrative-embeds.ts`): a matrix, a
// timeline and a table read a SCOPE (the graph, an epoch, an activity); a map
// reads a position (the graph's site, a GeoPosition); paradata reads a chain;
// a scene reads a model. Measured, not guessed: this is what each one draws
// without falling to «nothing to show». Filtered by `VIEW_TYPES`, so a view
// the datamodel does not declare is never offered.

const SCOPE_TYPES = ["GraphNode", "graph", "EpochNode", "epoch", "ActivityNodeGroup"];

export function viewTypesFor(node: EmNode | undefined, isStrat: (t: string) => boolean,
                             is3dDoc: (n: EmNode) => boolean = () => false): string[] {
  const t = String(node?.node_type ?? "");
  let out: string[];
  if (t === "graph" || t === "GraphNode") out = ["map", "scene3d", "matrix", "timeline", "table"];
  else if (SCOPE_TYPES.includes(t)) out = ["matrix", "timeline", "table"];
  else if (t === "geo_position") out = ["map"];
  else if (t === "document") out = node && is3dDoc(node) ? ["scene3d", "rm", "document", "source", "paradata"]
    : ["document", "source", "paradata"];
  else if (t === "property" || t === "extractor" || t === "combiner") out = ["paradata"];
  else if (t.startsWith("representation_model")) out = ["rm", "scene3d"];
  else if (isStrat(t)) out = ["us", "matrix", "timeline", "table"];
  else out = ["us"];
  return out.filter((v) => VIEW_TYPES.includes(v));
}

/** …and the inverse, for «prima il blocco, poi cosa mostra»: the nodes a view
 *  type can point at. The graph first where it is one of them. */
export function refsForViewType(viewType: string, doc: EmDocument | null,
                                isStrat: (t: string) => boolean,
                                is3dDoc: (n: EmNode) => boolean = () => false): EmNode[] {
  const nodes = doc?.graph?.nodes ?? [];
  const hits = nodes.filter((n) => viewTypesFor(n, isStrat, is3dDoc).includes(viewType));
  const isGraph = (n: EmNode): boolean => n.node_type === "graph" || n.node_type === "GraphNode";
  return [...hits.filter(isGraph), ...hits.filter((n) => !isGraph(n))];
}

// ── the two previews, as data (the page draws them; the check reads them) ────

/** Prose with its mentions resolved: text runs and named mentions. */
export type Segment = { text: string } | { mention: string; ref: string; missing: boolean };
export function segmentsOf(text: string, nameOf: (id: string) => string | null): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_PATTERN)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    const name = nameOf(m[1]);
    out.push({ mention: name ?? m[1], ref: m[1], missing: name == null });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export type PrintItem =
  | { kind: "chapter"; chapter: number; title: string }
  | { kind: "prose"; chapter: number; block: number; segments: Segment[]; marked: boolean }
  | { kind: "withheld"; chapter: number; block: number }
  | { kind: "citation"; chapter: number; block: number; ref: string; name: string; key: number }
  | { kind: "figure"; chapter: number; block: number; ref: string; name: string; caption: string;
      number: number; baked: boolean; viewType: string }
  | { kind: "unresolved"; chapter: number; block: number; ref: string };

/**
 * What DOCX / LaTeX will contain, in order — `latex_exporter` read as a list.
 * `force` is the export's «Esporta comunque»: the unvalidated paragraph goes
 * in, `marked` (the exporter writes `UNVALIDATED_NOTICE` at its start). Without
 * it the paragraph is `withheld` — the preview shows the hole, not the text.
 */
export function printItems(chapters: ProjChapter[], index: Map<string, EmNode>,
                           opts: { force?: boolean } = {}): { items: PrintItem[]; bibliography: { key: number; ref: string; name: string; description: string }[] } {
  const items: PrintItem[] = [];
  const bib: { key: number; ref: string; name: string; description: string }[] = [];
  const nameOf = (id: string): string | null => {
    const n = index.get(id);
    return n ? String(n.name || n.id) : null;
  };
  let fig = 0;
  chapters.forEach((c, ci) => {
    items.push({ kind: "chapter", chapter: ci, title: String(c.title ?? "") });
    (c.blocks ?? []).forEach((b, bi) => {
      if ((b.block_type ?? "prose") === "prose") {
        const text = String(b.text ?? "");
        if (isUnvalidated(b) && !opts.force) {
          items.push({ kind: "withheld", chapter: ci, block: bi });
          return;
        }
        if (!text.trim()) return;
        items.push({ kind: "prose", chapter: ci, block: bi, segments: segmentsOf(text, nameOf),
                     marked: isUnvalidated(b) });
        return;
      }
      const ref = String(b.ref ?? "");
      const node = index.get(ref);
      if (!node) {
        items.push({ kind: "unresolved", chapter: ci, block: bi, ref });
        return;
      }
      const name = String(node.name || node.id);
      const kind = printKindOf(b.view_type);
      if (kind === "citation") {
        let entry = bib.find((x) => x.ref === ref);
        if (!entry) {
          entry = { key: bib.length + 1, ref, name, description: String(node.description ?? "") };
          bib.push(entry);
        }
        items.push({ kind: "citation", chapter: ci, block: bi, ref, name, key: entry.key });
        return;
      }
      fig++;
      items.push({ kind: "figure", chapter: ci, block: bi, ref, name,
                   caption: String(b.options?.caption ?? ""), number: fig, baked: kind === "figure-baked",
                   viewType: canonicalViewType(b.view_type) });
    });
  });
  return { items, bibliography: bib };
}

export type NbCell =
  | { cell_type: "markdown"; source: string; chapter?: number; block?: number; marked?: boolean }
  | { cell_type: "code"; source: string; chapter?: number; block?: number };

/** What the notebook will contain — `ipynb_exporter.build_notebook`, as cells
 *  (the loader and report cells shortened to their first lines). */
export function notebookCells(title: string, chapters: ProjChapter[], index: Map<string, EmNode>,
                              opts: { force?: boolean } = {}): NbCell[] {
  const nameOf = (id: string): string | null => {
    const n = index.get(id);
    return n ? String(n.name || n.id) : null;
  };
  const cells: NbCell[] = [
    { cell_type: "markdown", source: `# ${title}` },
    { cell_type: "code", source: `from s3dgraphy import api\nSOURCE = "study.em.json"  # ← put your container here\n…\nindex = {n.node_id: n for n in graph.nodes}` },
    { cell_type: "code", source: "report = api.narrative_report(graph)\n…\nreport['broken_citations']" },
  ];
  chapters.forEach((c, ci) => {
    cells.push({ cell_type: "markdown", source: `## ${String(c.title ?? "")}` });
    (c.blocks ?? []).forEach((b, bi) => {
      if ((b.block_type ?? "prose") === "prose") {
        const text = String(b.text ?? "").trim();
        if (!text) return;
        const plain = segmentsOf(text, nameOf).map((s) => ("text" in s ? s.text : s.mention)).join("");
        if (isUnvalidated(b)) {
          if (!opts.force) return;
          cells.push({ cell_type: "markdown", chapter: ci, block: bi, marked: true,
                       source: `> **${UNVALIDATED_NOTICE}**\n>\n> ${plain}` });
          return;
        }
        cells.push({ cell_type: "markdown", chapter: ci, block: bi, source: plain });
        return;
      }
      const ref = String(b.ref ?? "");
      const v = canonicalViewType(b.view_type);
      if (SCENE_VIEW_TYPES.includes(v)) {
        cells.push({ cell_type: "markdown", chapter: ci, block: bi,
          source: `> **embed · ${v} → ${ref}** — a 3D scene is navigated, not plotted. Open it in EMStudio or in the study's viewer; a still picture here would claim to show something a notebook cannot.` });
        return;
      }
      cells.push({ cell_type: "code", chapter: ci, block: bi, source: notebookCell(v, ref) });
    });
  });
  return cells;
}
