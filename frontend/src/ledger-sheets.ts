/**
 * MICRO-VIEWER-UNICO p.6 · THREE SHEETS OF THE TABULAR: Resources,
 * Interpretations, Combiners (E.D., 20 Oct 2026).
 *
 * Until today the resources, the extractors and the combiners had no table:
 * the extractors were text in the Claims' «Provenance» column, the resources a
 * list in the Shelf, the combiners nowhere. Each is a computed view (read-only,
 * like «Modelli e proxy»): a row per node, `<tr data-row=id>` so a click
 * selects it and the Viewer and the Inspector follow, and the buttons in a cell
 * go to the node they name («↑ D.01», «→ US 12»). The column sort and filter
 * are the one component's (`table-tools.ts`), so the typical questions are a
 * filter each:
 *   · «the resources with no document» — column «Docs» = 0;
 *   · «the interpretations of D.01» — column «Document» contains D.01;
 *   · «the combiners with one interpretation» — column «n» = 1.
 *
 * Pure: a document in, rows and HTML out.
 */
import type { EmDocument, EmEdge, EmNode } from "./types";
import { assetOf, versionsOf, type VersionGraph } from "./asset-versions";
import { geometryOf, ownersOf, propertyOfExtractor, propertyValue, provenanceOf, resultOf, sourceOf } from "./paradata-chain";

export type LedgerSheet = "Resources" | "Interpretations" | "Combiners";
export const LEDGER_SHEETS: LedgerSheet[] = ["Resources", "Interpretations", "Combiners"];

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface LedgerCtx {
  t: (key: string, vars?: Record<string, string>) => string;
  /** where a resource's bytes are: on the disk, in the object store, both,
   *  missing, a reference only; null = not asked yet */
  where: (resourceId: string) => "disk" | "store" | "both" | "missing" | "reference" | null;
  /** the AI state of a node (`ai-validation.aiState`) */
  ai: (id: string) => "none" | "pending" | "verified";
  /** a node is a stratigraphic unit (the owner of a property) */
  isUnit: (nodeType: string | undefined) => boolean;
}

interface Ix {
  byId: Map<string, EmNode>;
  out: (id: string, type: string) => string[];
  inn: (id: string, type: string) => string[];
}

function indexOf(doc: EmDocument): Ix {
  const byId = new Map<string, EmNode>();
  for (const n of doc.graph.nodes) if (!((n.data ?? {}) as Record<string, unknown>).removed) byId.set(n.id, n);
  const outE = new Map<string, EmEdge[]>(), inE = new Map<string, EmEdge[]>();
  for (const e of doc.graph.edges) {
    if (((e as { attributes?: Record<string, unknown> }).attributes ?? {}).removed) continue;
    (outE.get(e.source) ?? outE.set(e.source, []).get(e.source)!).push(e);
    (inE.get(e.target) ?? inE.set(e.target, []).get(e.target)!).push(e);
  }
  return {
    byId,
    out: (id, type) => (outE.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.target).filter((x) => byId.has(x)),
    inn: (id, type) => (inE.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.source).filter((x) => byId.has(x)),
  };
}

const nameOf = (ix: Ix, id: string | null | undefined): string => (id ? String(ix.byId.get(id)?.name || id) : "");
const dataOf = (n: EmNode | undefined): Record<string, unknown> => (n?.data ?? {}) as Record<string, unknown>;
const RM_TYPES = new Set(["representation_model", "representation_model_doc", "representation_model_sf"]);
const mb = (b: number | null): string => (b == null ? "" : b >= 1048576 ? `${(b / 1048576).toFixed(b >= 10 * 1048576 ? 0 : 1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);

// ── Resources ───────────────────────────────────────────────────────────────

export interface ResourceRow {
  id: string;
  name: string;
  media: string;
  versions: number;
  lightest: { name: string; bytes: number | null } | null;
  heaviest: { name: string; bytes: number | null } | null;
  bytes: number | null;
  license: string;
  author: string;
  where: string;
  /** the documents that recall it: directly, through a model, an extractor, or
   *  as a version of a resource that one of them recalls */
  docs: string[];
}

/** The documents that recall a resource. */
function docsOfResource(ix: Ix, rid: string, vg: VersionGraph): string[] {
  const out = new Set<string>();
  const isDoc = (id: string) => ix.byId.get(id)?.node_type === "document";
  const holders = (r: string) => {
    for (const h of ix.inn(r, "has_linked_resource")) {
      const ht = ix.byId.get(h)?.node_type ?? "";
      if (isDoc(h)) out.add(h);
      else if (RM_TYPES.has(ht) || ht === "RepresentationModelNodeGroup") for (const d of ix.inn(h, "has_representation_model")) { if (isDoc(d)) out.add(d); }
      else if (ht === "extractor") for (const d of ix.out(h, "extracted_from")) { if (isDoc(d)) out.add(d); }
    }
    // a file of a resource (has_file) is the resource's
    for (const r2 of ix.inn(r, "has_file")) if (r2 !== r) holders(r2);
  };
  holders(rid);
  // a version (an output of a lod_generation step) is recalled where its master is
  const master = assetOf(vg, rid);
  if (master !== rid) holders(master);
  return [...out];
}

export function resourceRows(doc: EmDocument, ctx: LedgerCtx): ResourceRow[] {
  const ix = indexOf(doc);
  const vg: VersionGraph = { node: (id) => ix.byId.get(id), out: ix.out, into: ix.inn };
  const rows: ResourceRow[] = [];
  for (const n of ix.byId.values()) {
    if (n.node_type !== "resource") continue;
    const d = dataOf(n);
    const url = String(d.url ?? d.filename ?? "");
    const ext = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
    const media = String(d.media_type ?? (d.packaging === "directory" ? "directory" : ext && ext.length <= 5 && url.includes(".") ? ext : ""));
    const master = assetOf(vg, n.id);
    const vs = master === n.id ? versionsOf(vg, n.id) : [];
    const weighed = vs.map((v) => ({ name: String(v.lod_level ?? v.level ?? (v.master ? "master" : v.name ?? v.id)), bytes: typeof v.size_bytes === "number" ? v.size_bytes : null }))
      .filter((v) => v.bytes != null).sort((a, b) => a.bytes! - b.bytes!);
    const lic = [...ix.out(n.id, "has_license")].map((x) => nameOf(ix, x)).join(", ") || String(d.license ?? "");
    const auth = [...ix.out(n.id, "has_author")].map((x) => nameOf(ix, x)).join(", ") || String(d.author ?? "");
    const w = ctx.where(n.id);
    rows.push({ id: n.id, name: String(n.name || n.id), media, versions: vs.length > 1 ? vs.length : 0,
      lightest: weighed[0] ?? null, heaviest: weighed.length > 1 ? weighed[weighed.length - 1] : null,
      bytes: typeof d.size_bytes === "number" ? d.size_bytes : null, license: lic, author: auth,
      where: w ? ctx.t(`ledger.where.${w}`) : "", docs: docsOfResource(ix, n.id, vg) });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

// ── Interpretations (the extractors) ────────────────────────────────────────

export interface InterpretationRow {
  id: string;
  name: string;
  /** the document it reads (directly, or through a region on it) */
  docId: string | null;
  /** what it reads: a IIIF region (an image), a 3D annotation, a passage of a
   *  text, another property, a unit, the document as a whole */
  reads: "region" | "annotation3d" | "passage" | "property" | "unit" | "document" | "none";
  value: string;
  propertyId: string | null;
  unitId: string | null;
  combinerId: string | null;
  /** who made it: the authors, or «AI, not verified» / «AI, verified» */
  who: string;
}

export function interpretationRows(doc: EmDocument, ctx: LedgerCtx): InterpretationRow[] {
  const ix = indexOf(doc);
  const rows: InterpretationRow[] = [];
  for (const n of ix.byId.values()) {
    if (n.node_type !== "extractor") continue;
    const src = sourceOf(doc, n.id);
    const g = geometryOf(doc, n.id);
    const docId = src?.kind === "document" ? src.id : null;
    const reads: InterpretationRow["reads"] = g ? (g.kind === "region2d" ? "region" : g.kind === "passage" ? "passage" : "annotation3d")
      : src?.kind === "property" ? "property" : src?.kind === "unit" ? "unit" : src?.kind === "document" ? "document" : "none";
    const p = propertyOfExtractor(doc, n.id);
    const owner = p ? (ownersOf(doc, p).find((o) => o.original) ?? ownersOf(doc, p)[0])?.owner ?? null : null;
    const comb = ix.inn(n.id, "combines").find((c) => ix.byId.get(c)?.node_type === "combiner") ?? null;
    const authors = ix.out(n.id, "has_author");
    const people = authors.filter((a) => ix.byId.get(a)?.node_type === "author").map((a) => nameOf(ix, a));
    const ai = ctx.ai(n.id);
    const who = [...people, ...(ai === "pending" ? [ctx.t("ledger.aiPending")] : ai === "verified" ? [ctx.t("ledger.aiVerified")] : [])].join(", ");
    rows.push({ id: n.id, name: String(n.name || n.id), docId, reads, value: resultOf(doc, n.id), propertyId: p,
      unitId: owner, combinerId: comb, who });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

// ── Combiners ───────────────────────────────────────────────────────────────

export interface CombinerRow {
  id: string;
  name: string;
  propertyId: string | null;
  unitId: string | null;
  /** the interpretations it combines */
  extractors: string[];
  rule: string;
  value: string;
}

export function combinerRows(doc: EmDocument): CombinerRow[] {
  const ix = indexOf(doc);
  const rows: CombinerRow[] = [];
  for (const n of ix.byId.values()) {
    if (n.node_type !== "combiner") continue;
    const p = ix.inn(n.id, "has_data_provenance").find((x) => ix.byId.get(x)?.node_type === "property") ?? null;
    const owner = p ? (ownersOf(doc, p).find((o) => o.original) ?? ownersOf(doc, p)[0])?.owner ?? null : null;
    const xs = ix.out(n.id, "combines").filter((x) => ix.byId.get(x)?.node_type === "extractor");
    const d = dataOf(n);
    const rule = String(d.rule ?? d.reasoning ?? n.description ?? "").trim();
    void provenanceOf;
    rows.push({ id: n.id, name: String(n.name || n.id), propertyId: p, unitId: owner, extractors: xs, rule,
      value: p ? propertyValue(ix.byId.get(p)) : "" });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

// ── the HTML (a table the one component sorts and filters) ──────────────────

const go = (ix: Ix, id: string | null, arrow: string, cls = ""): string =>
  id ? `<button type="button" class="tv-link ledger-go ${cls}" data-go="${esc(id)}" title="${esc(nameOf(ix, id))}">${arrow} ${esc(nameOf(ix, id))}</button>` : "";
const cut = (s: string, n = 90): string => (s.length > n ? `${s.slice(0, n)}…` : s);

export function ledgerTableHtml(doc: EmDocument, sheet: LedgerSheet, ctx: LedgerCtx,
                                passes: (id: string, text: string) => boolean): { html: string; count: number } {
  const ix = indexOf(doc);
  const { t } = ctx;
  if (sheet === "Resources") {
    const rows = resourceRows(doc, ctx).filter((r) => passes(r.id, `${r.name} ${r.media} ${r.license} ${r.author}`));
    const ver = (r: ResourceRow) => (r.versions ? `${r.versions}${r.lightest ? ` · ${esc(r.lightest.name)} ${mb(r.lightest.bytes)}` : ""}${r.heaviest ? ` → ${esc(r.heaviest.name)} ${mb(r.heaviest.bytes)}` : ""}` : "");
    const body = rows.map((r) => `<tr data-row="${esc(r.id)}"><td class="ledger-name" title="${esc(r.name)}">${esc(cut(r.name, 60))}</td><td>${esc(r.media)}</td>`
      + `<td class="num">${ver(r)}</td><td class="num">${esc(mb(r.bytes))}</td><td>${esc(r.license)}</td><td>${esc(r.author)}</td><td>${esc(r.where)}</td>`
      + `<td class="num">${r.docs.length}</td><td class="ledger-in">${r.docs.map((d) => go(ix, d, "↑", "doc")).join(" ")}</td></tr>`).join("");
    return { count: rows.length, html: `<table class="emdata-table ledger-table ledger-res"><thead><tr>`
      + [t("ledger.col.name"), t("ledger.col.media"), t("ledger.col.versions"), t("ledger.col.weight"), t("ledger.col.license"),
         t("ledger.col.author"), t("ledger.col.where"), t("ledger.col.ndocs"), t("ledger.col.in")].map((h) => `<th>${esc(h)}</th>`).join("")
      + `</tr></thead><tbody>${body}</tbody></table>` };
  }
  if (sheet === "Interpretations") {
    const rows = interpretationRows(doc, ctx).filter((r) => passes(r.id, `${r.name} ${nameOf(ix, r.docId)} ${r.value} ${nameOf(ix, r.propertyId)} ${r.who}`));
    const body = rows.map((r) => `<tr data-row="${esc(r.id)}"><td class="ledger-name">${esc(r.name)}</td>`
      + `<td>${go(ix, r.docId, "↑", "doc")}</td><td>${esc(t(`ledger.reads.${r.reads}`))}</td>`
      + `<td title="${esc(r.value)}">${esc(cut(r.value))}</td>`
      + `<td>${r.propertyId ? `${go(ix, r.propertyId, "→", "prop")} ${go(ix, r.unitId, "→", "unit")}` : ""}</td>`
      + `<td>${esc(nameOf(ix, r.combinerId))}</td><td>${esc(r.who)}</td></tr>`).join("");
    return { count: rows.length, html: `<table class="emdata-table ledger-table ledger-int"><thead><tr>`
      + [t("ledger.col.name"), t("ledger.col.document"), t("ledger.col.reads"), t("ledger.col.value"), t("ledger.col.feeds"),
         t("ledger.col.combiner"), t("ledger.col.who")].map((h) => `<th>${esc(h)}</th>`).join("")
      + `</tr></thead><tbody>${body}</tbody></table>` };
  }
  const rows = combinerRows(doc).filter((r) => passes(r.id, `${r.name} ${nameOf(ix, r.propertyId)} ${r.rule} ${r.value}`));
  const body = rows.map((r) => `<tr data-row="${esc(r.id)}"><td class="ledger-name">${esc(r.name)}</td>`
    + `<td>${go(ix, r.propertyId, "→", "prop")} ${go(ix, r.unitId, "→", "unit")}</td>`
    + `<td class="num">${r.extractors.length}</td>`
    + `<td><button type="button" class="tv-link ledger-show" data-ledger-show="${esc(r.name)}" title="${esc(t("ledger.showInt"))}">${esc(t("ledger.showIntN", { n: String(r.extractors.length) }))}</button></td>`
    + `<td title="${esc(r.rule)}">${esc(cut(r.rule))}</td><td title="${esc(r.value)}">${esc(cut(r.value))}</td></tr>`).join("");
  return { count: rows.length, html: `<table class="emdata-table ledger-table ledger-comb"><thead><tr>`
    + [t("ledger.col.name"), t("ledger.col.feeds"), t("ledger.col.n"), t("ledger.col.interpretations"), t("ledger.col.rule"),
       t("ledger.col.result")].map((h) => `<th>${esc(h)}</th>`).join("")
    + `</tr></thead><tbody>${body}</tbody></table>` };
}

/** The ids each sheet has a row for (the focus: which sheet holds a node). */
export function ledgerIds(doc: EmDocument, sheet: LedgerSheet): Set<string> {
  const type = sheet === "Resources" ? "resource" : sheet === "Interpretations" ? "extractor" : "combiner";
  return new Set(doc.graph.nodes.filter((n) => n.node_type === type && !((n.data ?? {}) as Record<string, unknown>).removed).map((n) => n.id));
}
