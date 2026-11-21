/**
 * MICRO-SEG22 (E.D., 21 Nov 2026) · the LEVELS of a story — chapter › section ›
 * subsection › paragraph — and «Transform into…».
 *
 * A section and a subsection are `heading` blocks (s3Dgraphy
 * `narrative_node.BLOCK_HEADING`, `level` 1 or 2) inside a chapter. The
 * hierarchy is born from the ORDER, as the headings of a document are: a
 * paragraph belongs to the nearest heading above it, a subsection to the nearest
 * section, and nothing is nested by hand. So a story with no heading is what it
 * always was (chapters and paragraphs), and moving a section moves the run of
 * blocks it heads (`headingSpan`).
 *
 * Everything here is PURE: it reads, or it rewrites the copy of the chapters
 * `editChapters` hands it — one call, one undo step. The numbers, the spans and
 * the transforms mirror s3Dgraphy's `outline` / `heading_span` (the exporters
 * number with the same rule, so the page and the PDF say «1.0.1» alike).
 */
import type { EditableBlock, EditableChapter } from "./narrative-edit";

/** What a part of the story IS, and what it can be transformed into. */
export type PartKind = "chapter" | "section" | "subsection" | "paragraph";
export const PART_KINDS: readonly PartKind[] = ["chapter", "section", "subsection", "paragraph"];

/** 1 a section, 2 a subsection (the chapter is 0 and is not a block). */
export type HeadingLevel = 1 | 2;
export const levelOfKind = (k: PartKind): HeadingLevel | null =>
  k === "section" ? 1 : k === "subsection" ? 2 : null;
export const kindOfLevel = (l: number): PartKind => (l >= 2 ? "subsection" : "section");

/** The keyboard digit of each kind: Ctrl/Cmd+Alt+1/2/3, and 0 the paragraph. */
export const KIND_DIGIT: Record<PartKind, string> = { chapter: "1", section: "2", subsection: "3", paragraph: "0" };
export function kindOfDigit(code: string): PartKind | null {
  const d = /^(?:Digit|Numpad)([0-3])$/.exec(code)?.[1];
  return (PART_KINDS.find((k) => KIND_DIGIT[k] === d) ?? null);
}

/** Is the story numbered? Yes unless `data.numbering` is false. */
export function numberingOn(data: Record<string, unknown> | undefined | null): boolean {
  return (data ?? {}).numbering !== false;
}

export interface OutlineRow {
  chapter: number;
  /** null for the chapter itself */
  block: number | null;
  /** 0 chapter, 1 section, 2 subsection */
  level: 0 | 1 | 2;
  title: string;
  /** «1», «1.2», «1.2.1» — a subsection with no section above it «1.0.1» */
  number: string;
}

const isHeading = (b: { block_type?: string } | undefined): boolean => b?.block_type === "heading";
const levelOf = (b: { level?: number } | undefined): HeadingLevel => ((b?.level ?? 1) >= 2 ? 2 : 1);

/** The tree, in reading order: a row per chapter and per heading. */
export function outlineOf(chapters: { title?: string; blocks?: { block_type?: string; text?: string; level?: number }[] }[]): OutlineRow[] {
  const rows: OutlineRow[] = [];
  chapters.forEach((c, ci) => {
    const cn = String(ci + 1);
    rows.push({ chapter: ci, block: null, level: 0, title: String(c.title ?? ""), number: cn });
    let sec = 0, sub = 0;
    (c.blocks ?? []).forEach((b, bi) => {
      if (!isHeading(b)) return;
      const level = levelOf(b);
      let number: string;
      if (level === 1) { sec++; sub = 0; number = `${cn}.${sec}`; }
      else { sub++; number = `${cn}.${sec}.${sub}`; }
      rows.push({ chapter: ci, block: bi, level, title: String(b.text ?? ""), number });
    });
  });
  return rows;
}

/** `${chapter}` / `${chapter}:${block}` → its number. */
export function outlineNumbers(chapters: Parameters<typeof outlineOf>[0]): Map<string, string> {
  return new Map(outlineOf(chapters).map((r) => [r.block == null ? String(r.chapter) : `${r.chapter}:${r.block}`, r.number]));
}

/** The blocks a heading heads: `[start, end)` — itself and what follows, up to
 *  the next heading of its level or higher. Any other block: just itself. */
export function headingSpan(blocks: { block_type?: string; level?: number }[], index: number): [number, number] {
  if (index < 0 || index >= blocks.length) return [index, index];
  if (!isHeading(blocks[index])) return [index, index + 1];
  const level = levelOf(blocks[index]);
  let end = index + 1;
  while (end < blocks.length && !(isHeading(blocks[end]) && levelOf(blocks[end]) <= level)) end++;
  return [index, end];
}

/** The kind of a part: a chapter (`block` null), a heading, a paragraph — or
 *  "embed" (a reference has no words to become a title), null if absent. */
export function kindOfPart(chapters: EditableChapter[], ci: number, bi: number | null): PartKind | "embed" | null {
  const ch = chapters[ci];
  if (!ch) return null;
  if (bi == null) return "chapter";
  const b = (ch.blocks ?? [])[bi];
  if (!b) return null;
  if (b.block_type === "heading") return kindOfLevel(b.level ?? 1);
  if (b.block_type === "prose") return "paragraph";
  return "embed";
}

/** A paragraph read as a title: its first line, the markdown «#» marks taken
 *  away; `rest` is what follows the first line (stays a paragraph). */
export function titleOfText(text: string | undefined): { title: string; rest: string } {
  const s = String(text ?? "").replace(/\r/g, "").trim();
  const nl = s.indexOf("\n");
  const first = nl < 0 ? s : s.slice(0, nl);
  const rest = nl < 0 ? "" : s.slice(nl + 1).replace(/^\n+/, "").trim();
  return { title: first.replace(/^#{1,6}\s+/, "").trim(), rest };
}

/** Why a transform cannot be done (an i18n KEY), or null when it can. Same
 *  kind = nothing to do (`"same"`). */
export function transformRefusal(chapters: EditableChapter[], ci: number, bi: number | null, to: PartKind): string | null {
  const from = kindOfPart(chapters, ci, bi);
  if (from == null) return "nv.tf.whyGone";
  if (from === "embed") return "nv.tf.whyEmbed";
  if (from === to) return "same";
  if (from === "chapter" && ci === 0) return "nv.tf.whyFirstChapter";
  if (from === "paragraph" && !titleOfText((chapters[ci].blocks ?? [])[bi!]?.text).title) return "nv.tf.whyEmpty";
  return null;
}

/** The provenance a block carries, kept through a transform (who wrote it,
 *  whether a machine did, who vouched for it). */
const PROVENANCE = ["authored_by", "prompt_ref", "validated_by", "validated_at", "ai_generated"] as const;
function provenanceOf(b: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PROVENANCE) if (b && b[k] !== undefined && b[k] !== null && b[k] !== "") out[k] = b[k];
  return out;
}

/**
 * Transform one part into another kind, on the COPY of the chapters
 * (`editChapters`). Returns the part to select afterwards, or null when nothing
 * was done (refused, or already that kind).
 *
 *  · paragraph → section/subsection: its first line becomes the title (the
 *    «#» marks dropped), the rest stays a paragraph under it;
 *  · paragraph/heading → chapter: the chapter is split there — the title opens
 *    a new chapter, and the blocks after it go with it (as «New chapter here»);
 *  · heading → paragraph: the title becomes the paragraph's text;
 *  · heading → heading: only its level changes;
 *  · chapter → section/subsection/paragraph: it enters the chapter above it —
 *    its title becomes a heading (or a paragraph) at the end of that chapter,
 *    its blocks follow. Its lane and ★ ride on the heading (`options.anchor`,
 *    `options.canonical`) and come back if it is made a chapter again.
 */
export function transformPart(chapters: EditableChapter[], ci: number, bi: number | null,
                              to: PartKind): { chapter: number; block: number | null } | null {
  if (transformRefusal(chapters, ci, bi, to)) return null;
  const ch = chapters[ci];
  const blocks = (ch.blocks ??= []);
  if (bi == null) {
    // a chapter goes into the chapter above it
    const prev = chapters[ci - 1];
    const into = (prev.blocks ??= []);
    const at = into.length;
    const opts: Record<string, unknown> = {};
    if (ch.anchor) opts.anchor = ch.anchor;
    if (ch.canonical) opts.canonical = true;
    const lifted: EditableBlock = to === "paragraph"
      ? { block_type: "prose", text: ch.title ?? "" }
      : { block_type: "heading", text: ch.title ?? "", level: levelOfKind(to)!,
          ...(Object.keys(opts).length ? { options: opts } : {}) };
    if (ch.authored_by) lifted.authored_by = ch.authored_by;
    into.push(lifted, ...blocks);
    chapters.splice(ci, 1);
    return { chapter: ci - 1, block: at };
  }
  const b = blocks[bi] as EditableBlock & Record<string, unknown>;
  const prov = provenanceOf(b);
  if (to === "chapter") {
    const tail = blocks.splice(bi);
    tail.shift();
    let title: string;
    if (b.block_type === "prose") {
      const { title: t0, rest } = titleOfText(b.text);
      title = t0;
      if (rest) tail.unshift({ block_type: "prose", text: rest, ...prov } as EditableBlock);
    } else title = String(b.text ?? "");
    const opts = (b.options ?? {}) as Record<string, unknown>;
    const made: EditableChapter = { title, canonical: opts.canonical === true, blocks: tail };
    if (typeof opts.anchor === "string" && opts.anchor) made.anchor = opts.anchor;
    if (typeof b.authored_by === "string" && b.authored_by && !b.ai_generated) made.authored_by = b.authored_by;
    chapters.splice(ci + 1, 0, made);
    return { chapter: ci + 1, block: null };
  }
  if (to === "paragraph") {
    // heading → paragraph: the title is the text
    const para: EditableBlock = { block_type: "prose", text: String(b.text ?? ""), ...prov } as EditableBlock;
    blocks.splice(bi, 1, para);
    return { chapter: ci, block: bi };
  }
  const level = levelOfKind(to)!;
  if (b.block_type === "heading") {
    b.level = level;
    return { chapter: ci, block: bi };
  }
  // paragraph → heading
  const { title, rest } = titleOfText(b.text);
  const head: EditableBlock = { block_type: "heading", text: title, level, ...prov } as EditableBlock;
  const next: EditableBlock[] = [head];
  if (rest) next.push({ block_type: "prose", text: rest, ...prov } as EditableBlock);
  blocks.splice(bi, 1, ...next);
  return { chapter: ci, block: bi };
}

/**
 * Move a heading WITH ITS BLOCKS (`headingSpan`) to chapter `toCi`, before
 * block `toAt` there (the number of blocks = the end). Any other block moves
 * alone. Returns where it landed, or null when the place is inside the run
 * being moved (nothing to do).
 */
export function moveSpan(chapters: EditableChapter[], ci: number, bi: number, toCi: number,
                         toAt: number): { chapter: number; block: number } | null {
  const from = chapters[ci]?.blocks;
  const dest = chapters[toCi];
  if (!from || !dest || bi < 0 || bi >= from.length) return null;
  const [s, e] = headingSpan(from, bi);
  let at = Math.max(0, Math.min((dest.blocks ?? []).length, toAt));
  if (toCi === ci) {
    if (at >= s && at <= e) return null;
    if (at > e) at -= e - s;
  }
  const run = from.splice(s, e - s);
  (dest.blocks ??= []).splice(at, 0, ...run);
  return { chapter: toCi, block: at };
}

/** ▲ ▼ for a heading: past the previous / next SIBLING (a heading of its level
 *  under the same parent) with all its blocks. Null when there is none. */
export function moveHeadingBy(chapters: EditableChapter[], ci: number, bi: number,
                              delta: number): { chapter: number; block: number } | null {
  const blocks = chapters[ci]?.blocks ?? [];
  if (!isHeading(blocks[bi])) return null;
  const level = levelOf(blocks[bi]);
  if (delta < 0) {
    for (let i = bi - 1; i >= 0; i--) {
      if (!isHeading(blocks[i])) continue;
      if (levelOf(blocks[i]) < level) return null;      // the parent: no sibling above
      if (levelOf(blocks[i]) === level) return moveSpan(chapters, ci, bi, ci, i);
    }
    return null;
  }
  const [, e] = headingSpan(blocks, bi);
  if (e >= blocks.length || !isHeading(blocks[e]) || levelOf(blocks[e]) !== level) return null;
  const [, e2] = headingSpan(blocks, e);
  return moveSpan(chapters, ci, bi, ci, e2);
}

/**
 * C · paragraphs written as titles by hand: one that STARTS with «#» marks.
 * The levels are this app's own markdown — the notebook writes the story's
 * title «#», a chapter «##», a section «###», a subsection «####» — so «#»
 * and «##» propose a chapter, «###» a section, «####» or more a subsection.
 */
export interface HeadingHint { chapter: number; block: number; to: PartKind; title: string; marks: string }
export function markdownHeadingHints(chapters: EditableChapter[]): HeadingHint[] {
  const out: HeadingHint[] = [];
  chapters.forEach((c, ci) => (c.blocks ?? []).forEach((b, bi) => {
    if (b.block_type !== "prose") return;
    const m = /^\s*(#{1,6})\s+(\S[^\n]*)/.exec(String(b.text ?? ""));
    if (!m) return;
    const n = m[1].length;
    const to: PartKind = n <= 2 ? "chapter" : n === 3 ? "section" : "subsection";
    out.push({ chapter: ci, block: bi, to, title: m[2].trim(), marks: m[1] });
  }));
  return out;
}

/** A hint's identity for «do not propose it again»: the story, and the text. */
export function hintKey(narrativeId: string, text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${narrativeId}|${(h >>> 0).toString(36)}`;
}

/** Transform every hint at once, in one pass over the copy (the caller's one
 *  undo step). From the last to the first, so the indices still hold. */
export function applyHints(chapters: EditableChapter[], hints: HeadingHint[]): number {
  let n = 0;
  const order = [...hints].sort((a, b) => b.chapter - a.chapter || b.block - a.block);
  for (const h of order) if (transformPart(chapters, h.chapter, h.block, h.to)) n++;
  return n;
}
