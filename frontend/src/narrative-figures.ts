/**
 * MICRO-SEG24 (21 Nov 2026) · the figures an epoch or an activity carries with it.
 *
 * From a part that NARRATES an epoch or an activity (the «Narrates» chips of
 * MICRO-SEG23), «Insert figure» offers what represents it: its **Matrix** (the
 * slice of the canvas, in EMStudio's layout), its **3D model** (the Space's
 * scene with only what is pertinent, the epoch set), its **plan** (orthographic,
 * from above), its **three-quarter view**, its **sub-epochs** (how the epoch is
 * divided, with dates). A figure is an ordinary embed of the story — `ref` the
 * epoch or activity, `view_type` from the datamodel (`matrix`, `scene3d`,
 * `timeline`) — whose `options.figure` says its kind and its label:
 *
 *     { block_type: "embed", ref: "E2", view_type: "scene3d",
 *       options: { figure: { kind: "plan", label: "f3", sig: "k2x9" } } }
 *
 * It is LIVE: what it shows is computed from the graph when drawn; Print and
 * the exports freeze it (the client's picture, filed as `scene3d:E2#plan`, and
 * a caption written automatically — title, dates, «Extended Matrix · <file>» —
 * unless the author wrote one). Its number is the chapter's and its place in it
 * («8.1»), a running one when the story is not numbered; `[[fig:<label>]]` in
 * the text is a reference to it (s3Dgraphy `figure_labels`, the same rule).
 *
 * Pure, apart from the sub-epochs' small drawing: no store.
 */
import { t } from "./i18n";
import { epochEnd, epochStart, sceneContent, scopeOf } from "./narrative-embeds";
import { intervalLabel } from "./narrative-lanes";
import type { EmDocument, EmNode } from "./types";

export const FIGURE_KINDS = ["matrix", "model", "plan", "three_quarter", "sub_epochs"] as const;
export type FigureKind = typeof FIGURE_KINDS[number];

export interface FigureSpec {
  kind: FigureKind;
  /** what `[[fig:<label>]]` refers to; unique in the story */
  label: string;
  /** what the figure showed when it was made (or last put right): MICRO-SEG24 C */
  sig?: string;
}

/** The datamodel's view type each kind is drawn as. */
export const FIGURE_VIEW: Record<FigureKind, string> = {
  matrix: "matrix", model: "scene3d", plan: "scene3d", three_quarter: "scene3d", sub_epochs: "timeline",
};

/** The prefix of a figure's reference in the text (s3Dgraphy `FIGURE_REF_PREFIX`). */
export const FIGURE_REF_PREFIX = "fig:";
export const isFigureRef = (ref: string): boolean => ref.startsWith(FIGURE_REF_PREFIX);

/** View types a reader cites rather than looks at (s3Dgraphy `CITED_VIEW_TYPES`). */
const CITED = new Set(["source", "document"]);

type Blockish = { block_type?: string; ref?: string; view_type?: string; options?: Record<string, unknown> } | null | undefined;
type Chapterish = { blocks?: Blockish[] } | null | undefined;

export function figureOf(block: Blockish): FigureSpec | null {
  if (!block || block.block_type !== "embed") return null;
  const f = (block.options ?? {})["figure"] as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object" || !FIGURE_KINDS.includes(f.kind as FigureKind)) return null;
  return { kind: f.kind as FigureKind, label: String(f.label ?? ""), ...(typeof f.sig === "string" ? { sig: f.sig } : {}) };
}

/** Is this block numbered as a figure? An embed with a ref, not cited, that
 *  resolves (when `resolves` is given) — `printItems`' «figure». A block that
 *  asks the graph (a query) is a text, not a figure. */
export function isFigureBlock(block: Blockish, resolves?: (id: string) => boolean): boolean {
  if (!block || block.block_type !== "embed" || !block.ref) return false;
  if ((block.options ?? {})["query"]) return false;
  if (CITED.has(String(block.view_type ?? ""))) return false;
  return resolves ? resolves(block.ref) : true;
}

/** `"ci:bi"` → «8.1» (numbered: the chapter, then the figure's place in it) or
 *  a running «3» (not numbered). */
export function figureNumbers(chapters: readonly Chapterish[], numbered: boolean,
                              resolves?: (id: string) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  let running = 0;
  chapters.forEach((c, ci) => {
    let k = 0;
    (c?.blocks ?? []).forEach((b, bi) => {
      if (!isFigureBlock(b, resolves)) return;
      k++; running++;
      out.set(`${ci}:${bi}`, numbered ? `${ci + 1}.${k}` : String(running));
    });
  });
  return out;
}

export interface FigureEntry { label: string; number: string; chapter: number; block: number; kind: FigureKind; ref: string }

/** Every figure of an epoch or an activity, in reading order, with its number. */
export function figureEntries(chapters: readonly Chapterish[], numbered: boolean,
                              resolves?: (id: string) => boolean): FigureEntry[] {
  const nums = figureNumbers(chapters, numbered, resolves);
  const out: FigureEntry[] = [];
  chapters.forEach((c, ci) => (c?.blocks ?? []).forEach((b, bi) => {
    const f = figureOf(b);
    const number = nums.get(`${ci}:${bi}`);
    if (f && f.label && number) out.push({ label: f.label, number, chapter: ci, block: bi, kind: f.kind, ref: String(b!.ref) });
  }));
  return out;
}

/** label → number: what `[[fig:<label>]]` prints. */
export function figureLabels(chapters: readonly Chapterish[], numbered: boolean,
                             resolves?: (id: string) => boolean): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of figureEntries(chapters, numbered, resolves)) if (!m.has(e.label)) m.set(e.label, e.number);
  return m;
}

/** The key a client-rendered picture is filed under (s3Dgraphy `figure_key`). */
export function figureKey(view: string, ref: string, variant = ""): string {
  return variant ? `${view}:${ref}#${variant}` : `${view}:${ref}`;
}

/** A label nobody in the story uses yet: «f1», «f2»… */
export function newFigureLabel(chapters: readonly Chapterish[]): string {
  const used = new Set<string>();
  for (const c of chapters) for (const b of c?.blocks ?? []) { const f = figureOf(b); if (f?.label) used.add(f.label); }
  let n = used.size + 1;
  while (used.has(`f${n}`)) n++;
  return `f${n}`;
}

// ── what a figure shows ─────────────────────────────────────────────────────

const edgesOf = (doc: EmDocument | null) => (doc?.graph?.edges ?? []).filter((e) => !(e as { removed?: unknown }).removed);
const isEpoch = (n?: EmNode | null): boolean => !!n && (n.node_type === "EpochNode" || n.node_type === "epoch");
const nameOf = (n: EmNode): string => String(n.name || n.id);

export interface SubEpochRow { id: string; name: string; start: number | null; end: number | null; depth: number }

/** The sub-epochs of an epoch (`has_sub_epoch`, transitively), each under its
 *  parent, oldest first at every level; cycle-safe. */
export function subEpochRows(doc: EmDocument | null, epochId: string): SubEpochRow[] {
  const byId = new Map((doc?.graph?.nodes ?? []).map((n) => [n.id, n]));
  const kids = (id: string): EmNode[] => edgesOf(doc)
    .filter((e) => e.edge_type === "has_sub_epoch" && e.source === id)
    .map((e) => byId.get(e.target)).filter((n): n is EmNode => isEpoch(n));
  const date = (v: number): number | null => (Number.isFinite(v) ? v : null);
  const out: SubEpochRow[] = [];
  const seen = new Set<string>([epochId]);
  const walk = (id: string, depth: number): void => {
    const xs = kids(id).sort((a, b) => epochStart(a) - epochStart(b) || nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true }));
    for (const k of xs) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      out.push({ id: k.id, name: nameOf(k), start: date(epochStart(k)), end: date(epochEnd(k)), depth });
      walk(k.id, depth + 1);
    }
  };
  walk(epochId, 0);
  return out;
}

/** The dates of an epoch or an activity, «100 – 199» (an activity with none
 *  of its own: its epoch's). */
export function datesOf(node: EmNode, doc: EmDocument | null): string {
  const d = (node.data ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  let s = num(d.start_time ?? d.start), e = num(d.end_time ?? d.end);
  if (s === null && e === null && !isEpoch(node)) {
    const ep = epochOfActivity(node.id, doc);
    const en = ep ? (doc?.graph?.nodes ?? []).find((n) => n.id === ep) : undefined;
    if (en) { const ed = (en.data ?? {}) as Record<string, unknown>; s = num(ed.start_time ?? ed.start); e = num(ed.end_time ?? ed.end); }
  }
  return intervalLabel(s, e);
}

/** The epoch an activity is in (`has_first_epoch`), as the «Narrates» tree reads it. */
export function epochOfActivity(id: string, doc: EmDocument | null): string | null {
  const byId = new Map((doc?.graph?.nodes ?? []).map((n) => [n.id, n]));
  for (const e of edgesOf(doc))
    if (e.edge_type === "has_first_epoch" && e.source === id && isEpoch(byId.get(e.target))) return e.target;
  return null;
}

export interface FigureChoice { kind: FigureKind; why: string | null }

/** The kinds a narrated epoch or activity offers, each enabled or refused with
 *  why (a model, a plan, a 3/4 view need something to draw; sub-epochs need an
 *  epoch that has them). An activity has no sub-epochs: not offered. */
export function figureChoices(node: EmNode, doc: EmDocument | null): FigureChoice[] {
  const epoch = isEpoch(node);
  const c = sceneContent(node, doc);
  const nothing3d = !c || (!c.models.length && !c.proxies.length);
  const out: FigureChoice[] = [];
  const units = scopeOf(node, doc).units.length;
  out.push({ kind: "matrix", why: units ? null : t("nv.fig.why.noUnits") });
  for (const k of ["model", "plan", "three_quarter"] as const)
    out.push({ kind: k, why: nothing3d ? t("nv.fig.why.no3d") : null });
  if (epoch) out.push({ kind: "sub_epochs", why: subEpochRows(doc, node.id).length ? null : t("nv.fig.why.noSubEpochs") });
  return out;
}

/** djb2, base 36: short and stable. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** What a figure shows NOW, as a signature: the units (ids and names) of a
 *  Matrix, the models and proxies of a 3D figure, the sub-epochs and their
 *  dates. The same signature as when it was made: nothing changed. */
export function figureSig(node: EmNode, doc: EmDocument | null, kind: FigureKind): string {
  if (kind === "sub_epochs")
    return hash(subEpochRows(doc, node.id).map((r) => `${r.id}|${r.name}|${r.start}|${r.end}|${r.depth}`).join(";"));
  if (kind === "matrix") {
    const units = scopeOf(node, doc).units.map((u) => `${u.id}|${nameOf(u)}`).sort();
    const keep = new Set(scopeOf(node, doc).units.map((u) => u.id));
    const edges = edgesOf(doc).filter((e) => keep.has(e.source) && keep.has(e.target))
      .map((e) => `${e.source}>${e.target}:${e.edge_type}`).sort();
    return hash(`${units.join(";")}#${edges.join(";")}`);
  }
  const c = sceneContent(node, doc);
  return hash(`${[...(c?.models ?? [])].sort().join(";")}#${[...(c?.proxies ?? [])].sort().join(";")}`);
}

/** The caption written for the author (they can change it): «Plan of II A.D.
 *  (100 – 199) · Extended Matrix · TempluMare_v11.em.json». */
export function autoCaption(kind: FigureKind, node: EmNode, doc: EmDocument | null, file: string | null): string {
  const dates = datesOf(node, doc);
  const what = t(`nv.fig.cap.${kind}`, { name: nameOf(node) });
  const source = file ? `Extended Matrix · ${file}` : "Extended Matrix";
  return `${what}${dates ? ` (${dates})` : ""} · ${source}`;
}

/** Where a figure inserted from a part goes: at the end of the part's own
 *  words — a chapter's before its first section (or at its end), a section's
 *  or subsection's at the end of its run. */
export function figureInsertAt(blocks: readonly Blockish[], block: number | null): number {
  if (block === null) {
    const first = blocks.findIndex((b) => b?.block_type === "heading");
    return first < 0 ? blocks.length : first;
  }
  const head = blocks[block] as { block_type?: string; level?: number } | undefined;
  if (head?.block_type !== "heading") return Math.min(block + 1, blocks.length);
  const level = (head.level ?? 1) >= 2 ? 2 : 1;
  let end = block + 1;
  while (end < blocks.length) {
    const b = blocks[end] as { block_type?: string; level?: number } | undefined;
    if (b?.block_type === "heading" && ((b.level ?? 1) >= 2 ? 2 : 1) <= level) break;
    end++;
  }
  return end;
}

/** The new figure block. */
export function figureBlock(ref: string, kind: FigureKind, label: string, sig: string): {
  block_type: "embed"; ref: string; view_type: string; options: Record<string, unknown>;
} {
  return { block_type: "embed", ref, view_type: FIGURE_VIEW[kind], options: { figure: { kind, label, sig } } };
}

// ── the sub-epochs, drawn ───────────────────────────────────────────────────

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** How the epoch is divided: its sub-epochs on an axis, each under its parent,
 *  with dates; an undated one named below the axis. */
export function subEpochsEmbed(node: EmNode, doc: EmDocument | null): HTMLElement {
  const b = el("div", "nv-embed nv-subepochs");
  b.appendChild(el("div", "nv-embed-kind", t("nv.fig.kind.sub_epochs")));
  b.appendChild(el("div", "nv-embed-title", nameOf(node)));
  const rows = subEpochRows(doc, node.id);
  if (!rows.length) {
    b.appendChild(el("div", "nv-embed-note nv-empty", t("nv.fig.why.noSubEpochs")));
    return b;
  }
  // the axis spans the sub-epochs (the epoch's own dates are in the title):
  // a short phase at the end of a long epoch would otherwise be a sliver
  const dated = rows.filter((r) => r.start !== null);
  const min = dated.length ? Math.min(...dated.map((r) => r.start!)) : 0;
  const max = dated.length ? Math.max(...dated.map((r) => r.end ?? r.start!)) : 1;
  const span = (max - min) || 1;
  const dates = datesOf(node, doc);
  if (dates) b.appendChild(el("div", "nv-embed-note", dates));
  const axis = el("div", "nv-subepochs-axis");
  for (const r of rows) {
    const line = el("div", "nv-subepochs-row");
    line.dataset.subEpoch = r.id;
    line.style.paddingLeft = `${r.depth * 12}px`;
    const bar = el("div", "nv-timeline-bar");
    if (r.start !== null) {
      // at least a quarter of the line, so its name and dates read; never
      // past the end of the line
      const width = Math.max((((r.end ?? r.start) - r.start) / span) * 100, 25);
      bar.style.width = `${width}%`;
      bar.style.marginLeft = `${Math.min(((r.start - min) / span) * 100, 100 - width)}%`;
    }
    bar.appendChild(el("span", "nv-timeline-name", r.name));
    const d = intervalLabel(r.start, r.end);
    if (d) bar.appendChild(el("span", "nv-timeline-dates", d));
    bar.title = d ? `${r.name} — ${d}` : r.name;
    line.appendChild(bar);
    axis.appendChild(line);
  }
  b.appendChild(axis);
  const undated = rows.filter((r) => r.start === null).map((r) => r.name);
  if (undated.length) b.appendChild(el("div", "nv-embed-note nv-implied", t("nv.undatedOffAxis", { list: undated.join(", ") })));
  return b;
}

/** The same, as an SVG for the exports. */
export function subEpochsSvg(node: EmNode, doc: EmDocument | null): string | null {
  const rows = subEpochRows(doc, node.id);
  if (!rows.length) return null;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const W = 960, rowH = 30, top = 44, left = 16, right = 16;
  const H = top + rows.length * rowH + 16;
  const dated = rows.filter((r) => r.start !== null);
  const min = dated.length ? Math.min(...dated.map((r) => r.start!)) : 0;
  const max = dated.length ? Math.max(...dated.map((r) => r.end ?? r.start!)) : 1;
  const span = (max - min) || 1;
  const x = (v: number) => left + ((v - min) / span) * (W - left - right - 220);
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${left}" y="24" font-family="Helvetica,Arial,sans-serif" font-size="16" font-weight="bold" fill="#222">${esc(nameOf(node))}${datesOf(node, doc) ? ` (${esc(datesOf(node, doc))})` : ""}</text>`];
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const x0 = r.start !== null ? x(r.start) : left;
    const x1 = r.start !== null ? Math.max(x(r.end ?? r.start), x0 + 220) : W - right;
    parts.push(`<rect x="${x0.toFixed(1)}" y="${y}" width="${(x1 - x0).toFixed(1)}" height="${rowH - 8}" rx="3" fill="#e8eef7" stroke="#5b7bb0"/>`);
    const d = intervalLabel(r.start, r.end);
    parts.push(`<text x="${(x0 + 6 + r.depth * 10).toFixed(1)}" y="${y + rowH - 14}" font-family="Helvetica,Arial,sans-serif" font-size="12" fill="#222">${esc(r.name)}${d ? ` · ${esc(d)}` : ""}</text>`);
  });
  parts.push("</svg>");
  return parts.join("");
}
