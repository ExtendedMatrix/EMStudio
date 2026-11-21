/**
 * N3 — authoring a narrative.
 *
 * Every mutation here goes through `DocumentStore.updateNode`, the same call the
 * inspector uses to edit any other node. That is deliberate and it is the whole
 * design: the narrative is a node in the em.json, so editing it gets undo, the
 * dirty flag, the change notification that re-renders the view, the op broadcast
 * to a synced peer, and the existing save — for free, and identically to
 * everything else. A parallel "narrative save" would have been a second source
 * of truth, and the two-tier invariant says there is one.
 *
 * Nothing here writes triples. Authoring is the property graph; RDF is
 * projected from it by s3Dgraphy.
 */

import type { DocumentStore } from "./model";
import { narrativeViewTypes } from "./rules";
import type { EmNode } from "./types";
import { t } from "./i18n";
import { anchorsOf, setAnchorsOn } from "./narrative-lanes";
import { applyCoherenceFix, recordSeen, type CoherenceIssue } from "./narrative-coherence";
import { FIGURE_VIEW, figureBlock, figureInsertAt, figureOf, figureSig, newFigureLabel, type FigureKind } from "./narrative-figures";
import { headingSpan } from "./narrative-outline";

export interface EditableBlock {
  /** MICRO-SEG22 · `heading`: the title of a section (`level` 1) or of a
   *  subsection (`level` 2), in `text` — s3Dgraphy `BLOCK_HEADING` */
  block_type: "prose" | "embed" | "heading";
  text?: string;
  ref?: string;
  view_type?: string;
  options?: Record<string, unknown>;
  level?: number;
  authored_by?: string;
}

export interface EditableChapter {
  title: string;
  anchor?: string;
  /** MICRO-SEG23 · every lane the chapter narrates, `anchor` the first —
   *  written only when more than one (s3Dgraphy `set_anchors`) */
  anchors?: string[];
  canonical?: boolean;
  blocks?: EditableBlock[];
  authored_by?: string;
}

/**
 * The view types a user may choose from — READ FROM THE DATAMODEL.
 *
 * It used to be a hand-written copy of `NARRATIVE_VIEW_TYPES` (s3Dgraphy
 * `nodes/narrative_node.py`) with a comment promising the datamodel owned it.
 * The `epoch3d` → `scene3d` rename (G1) showed what that promise was worth: the
 * vocabulary had to be edited in two places, and a stale copy here would have
 * offered the author a term the model no longer accepts. It is now derived from
 * the vendored `narrative_nodes.NarrativeNode.valid_view_types` (ADR-001 §1), so
 * adding or renaming a term is one edit in s3Dgraphy plus `sync-datamodels.sh`.
 */
export const VIEW_TYPES: readonly string[] = narrativeViewTypes();

/** Retired spellings → current name. Mirrors `NARRATIVE_VIEW_TYPE_ALIASES` in
 *  s3Dgraphy: a narrative saved before the rename must still render, and be
 *  written back under the current name. Read-tolerant, write-canonical. */
const VIEW_TYPE_ALIASES: Record<string, string> = {
  epoch3d: "scene3d",
};

/** The current name of a view type, translating retired spellings. */
export function canonicalViewType(viewType: string | undefined): string {
  const v = viewType ?? "";
  return VIEW_TYPE_ALIASES[v] ?? v;
}

/**
 * The view a node gets when it is dropped in, before the author says otherwise.
 *
 * Read off the node's own type, because that is the only thing we know at drop
 * time. Every default here is the most literal reading of the node — a document
 * shows as a document — and the author can change it from the menu on the
 * block; guessing something cleverer would just be a guess they have to undo.
 */
export function defaultViewType(node: EmNode | undefined): string {
  const t = node?.node_type ?? "";
  if (t === "geo_position") return "map";
  if (t === "document") return "document";
  if (t === "property") return "paradata";
  if (t === "EpochNode") return "matrix";
  if (t === "representation_model" || t === "representation_model_doc"
      || t === "representation_model_sf") return "rm";
  if (t === "extractor" || t === "combiner") return "paradata";
  // Stratigraphic units and everything else that lives in the matrix read as a
  // unit; `us` is the view that shows a node with its certainty.
  return "us";
}

/** Deep-copy the chapters out of a narrative node, ready to be mutated. */
function chaptersOf(node: EmNode): EditableChapter[] {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return JSON.parse(
    JSON.stringify((data.chapters as EditableChapter[]) ?? []),
  ) as EditableChapter[];
}

/**
 * Apply a change to a narrative's chapters and persist it.
 *
 * The mutator receives a COPY: it may splice, reorder and rewrite freely, and
 * the result replaces `data.chapters` in one `updateNode` call — so the whole
 * edit is a single undo step, which is what a user means by "one change".
 */
export function editChapters(
  store: DocumentStore,
  narrativeId: string,
  mutate: (chapters: EditableChapter[]) => void,
  /** MICRO-SEG24 · and the narrative's other data (what it saw of the graph),
   *  in the same edit: still one undo step */
  mutateData?: (data: Record<string, unknown>, chapters: EditableChapter[]) => void,
): void {
  const node = store.node(narrativeId);
  if (!node) return;
  const chapters = chaptersOf(node);
  mutate(chapters);
  const data = { ...((node.data ?? {}) as Record<string, unknown>) };
  mutateData?.(data, chapters);
  data.chapters = chapters;
  store.updateNode(narrativeId, { data });
}

/** MICRO-SEG24 · what the story saw of these ids today (`data.narrated_seen`),
 *  for the notices of «Coherence with the Matrix». */
const seeing = (store: DocumentStore, ids: () => string[]) =>
  (data: Record<string, unknown>) => recordSeen(data, store.doc, ids());

/**
 * MICRO-SEG24 · a figure of an epoch or an activity, inserted from a part that
 * narrates it (`block` null: the chapter) at the end of the part's own words
 * (`figureInsertAt`). Its label is new in the story, its signature what it
 * shows now. One undo step. Returns where it went.
 */
export function insertFigure(store: DocumentStore, narrativeId: string,
                             chapter: number, block: number | null, ref: string,
                             kind: FigureKind): { chapter: number; block: number; label: string } | null {
  const node = store.node(ref);
  if (!node) return null;
  let at = -1, label = "";
  editChapters(store, narrativeId, (cs) => {
    const c = cs[chapter];
    if (!c) return;
    const blocks = (c.blocks ??= []);
    at = figureInsertAt(blocks, block);
    label = newFigureLabel(cs);
    blocks.splice(at, 0, figureBlock(ref, kind, label, figureSig(node, store.doc, kind)) as EditableBlock);
  }, seeing(store, () => [ref]));
  return at < 0 ? null : { chapter, block: at, label };
}

/** MICRO-SEG24 C · a notice's «Put it right», in one edit. */
export function applyCoherence(store: DocumentStore, narrativeId: string, issue: CoherenceIssue): boolean {
  let done = false;
  let chs: EditableChapter[] = [];
  editChapters(store, narrativeId, (cs) => { chs = cs; }, (data) => {
    done = applyCoherenceFix(chs, data, store.doc, issue);
  });
  return done;
}

// ── the story itself ─────────────────────────────────────────────────────────
//
// NARRATIVA-BLOCCHI p.1 · the title of the story is the node's `name`, its
// subtitle the node's `description` — the fields every node has, written by the
// same `updateNode` as everything else: one gesture, one undo step, and the page
// and the Inspector read the one field. A title cannot be emptied (a story with
// no name is listed by its id); a subtitle can, and then the page offers one.

export function renameNarrative(store: DocumentStore, narrativeId: string,
                                name: string): void {
  const node = store.node(narrativeId);
  const next = name.trim();
  if (!node || !next || next === node.name) return;
  store.updateNode(narrativeId, { name: next });
}

export function setNarrativeDescription(store: DocumentStore, narrativeId: string,
                                        description: string): void {
  const node = store.node(narrativeId);
  const next = description.trim();
  if (!node || next === (node.description ?? "")) return;
  store.updateNode(narrativeId, { description: next });
}

// ── chapters ──────────────────────────────────────────────────────────────────

export function addChapter(store: DocumentStore, narrativeId: string,
                           title = t("narr.newChapter")): void {
  editChapters(store, narrativeId, (cs) =>
    cs.push({ title, canonical: false, blocks: [] }));
}

export function renameChapter(store: DocumentStore, narrativeId: string,
                              index: number, title: string): void {
  editChapters(store, narrativeId, (cs) => {
    if (cs[index]) cs[index].title = title;
  });
}

export function setChapterAnchor(store: DocumentStore, narrativeId: string,
                                 index: number, anchor: string | null): void {
  editChapters(store, narrativeId, (cs) => {
    if (!cs[index]) return;
    if (anchor) cs[index].anchor = anchor;
    else delete cs[index].anchor;
  });
}

/**
 * MICRO-SEG23 · what a chapter (`block` null) or a section / subsection (a
 * heading block) narrates — several ids, in the order ticked; the compatible
 * shape (`anchor` the first, `anchors` when more than one). One undo step.
 */
export function setPartAnchors(store: DocumentStore, narrativeId: string,
                               chapter: number, block: number | null, ids: string[]): void {
  // only what starts being narrated is recorded: a notice about one already
  // there (renamed, moved) stays until it is put right
  let fresh: string[] = [];
  editChapters(store, narrativeId, (cs) => {
    const c = cs[chapter];
    if (!c) return;
    const before = partAnchors(cs, chapter, block);
    fresh = ids.filter((x) => !before.includes(x));
    if (block == null) { setAnchorsOn(c as unknown as Record<string, unknown>, ids); return; }
    const b = c.blocks?.[block];
    if (!b || b.block_type !== "heading") return;
    const opts = { ...(b.options ?? {}) };
    setAnchorsOn(opts, ids);
    if (Object.keys(opts).length) b.options = opts; else delete b.options;
  }, seeing(store, () => fresh));
}

/** The ids a part narrates (a chapter, or a heading of it). */
export function partAnchors(chapters: EditableChapter[], chapter: number, block: number | null): string[] {
  const c = chapters[chapter];
  if (!c) return [];
  return block == null ? anchorsOf(c as never) : anchorsOf(c.blocks?.[block] as never);
}

/**
 * MICRO-SEG23 · «the epoch with all its activities as subsections»: the part
 * narrates the epoch (added to what it narrates), and under it a title is born
 * for each activity given — a SECTION under a chapter, a SUBSECTION under a
 * section — with the activity's name and «Narrates» set to it, at the end of
 * the part's run (a chapter's blocks, a section's span). One undo step; a
 * subsection cannot have titles under it (refused: false).
 */
export function narrateWithActivities(store: DocumentStore, narrativeId: string,
                                      chapter: number, block: number | null, epochId: string,
                                      activities: { id: string; name: string }[]): boolean {
  let done = false;
  editChapters(store, narrativeId, (cs) => {
    const c = cs[chapter];
    if (!c) return;
    const blocks = (c.blocks ??= []);
    let level: 1 | 2;
    let at: number;
    let host: Record<string, unknown>;
    if (block == null) {
      level = 1;
      at = blocks.length;
      host = c as unknown as Record<string, unknown>;
    } else {
      const b = blocks[block];
      if (!b || b.block_type !== "heading" || (b.level ?? 1) >= 2) return;
      level = 2;
      at = headingSpan(blocks, block)[1];
      host = (b.options = { ...(b.options ?? {}) });
    }
    setAnchorsOn(host, [...anchorsOf(host as never), epochId]);
    blocks.splice(at, 0, ...activities.map((a): EditableBlock =>
      ({ block_type: "heading", text: a.name, level, options: { anchor: a.id } })));
    done = true;
  }, seeing(store, () => [epochId, ...activities.map((a) => a.id)]));
  return done;
}

/**
 * Toggle "the author has settled this chapter".
 *
 * The flag is not decoration: the s3Dgraphy scaffolder reads it and skips the
 * chapter when it regenerates. Canonising the introduction is how you stop a
 * template run from touching the paragraph you wrote.
 */
export function toggleCanonical(store: DocumentStore, narrativeId: string,
                                index: number): void {
  editChapters(store, narrativeId, (cs) => {
    if (cs[index]) cs[index].canonical = !cs[index].canonical;
  });
}

export function deleteChapter(store: DocumentStore, narrativeId: string,
                              index: number): void {
  editChapters(store, narrativeId, (cs) => cs.splice(index, 1));
}

export function moveChapter(store: DocumentStore, narrativeId: string,
                            index: number, delta: number): void {
  editChapters(store, narrativeId, (cs) => move(cs, index, delta));
}

/**
 * MICRO-NARRATIVE-MODULI p.8 · p.11 · a chapter born WHERE it is asked for.
 *
 * `at` is a place between the blocks of chapter `after`: the new chapter's
 * title goes there, so the blocks that follow it are its own (a heading put
 * between two paragraphs splits the chapter, as in any word processor); at the
 * end of a chapter it is simply the next chapter, empty. One undo step.
 * Returns the new chapter's index.
 */
export function insertChapterAt(store: DocumentStore, narrativeId: string,
                                after: number, at?: number,
                                title = t("narr.newChapter")): number {
  let made = -1;
  editChapters(store, narrativeId, (cs) => {
    const here = cs[after];
    const tail = here && at !== undefined && at < (here.blocks ?? []).length
      ? (here.blocks ?? []).splice(Math.max(0, at)) : [];
    const pos = Math.max(0, Math.min(cs.length, after + 1));
    cs.splice(pos, 0, { title, canonical: false, blocks: tail });
    made = pos;
  });
  return made;
}

/** p.10 · a chapter dragged: from `from` to the place `to` (before the chapter
 *  that is there now; `cs.length` = the end). One undo step. */
export function moveChapterTo(store: DocumentStore, narrativeId: string,
                              from: number, to: number): void {
  editChapters(store, narrativeId, (cs) => {
    if (from < 0 || from >= cs.length) return;
    const dest = Math.max(0, Math.min(cs.length, to));
    if (dest === from || dest === from + 1) return;
    const [ch] = cs.splice(from, 1);
    cs.splice(dest > from ? dest - 1 : dest, 0, ch);
  });
}

// ── blocks ────────────────────────────────────────────────────────────────────

export function addProse(store: DocumentStore, narrativeId: string,
                         chapterIndex: number, text = ""): void {
  editChapters(store, narrativeId, (cs) => {
    const c = cs[chapterIndex];
    if (!c) return;
    (c.blocks ??= []).push({ block_type: "prose", text });
  });
}

/** MICRO-SEG22 · a section's or subsection's title, written in the page or in
 *  the Inspector: one gesture, one undo step. A title cannot be emptied (a
 *  heading with no words prints nothing): Delete removes it. */
export function setHeading(store: DocumentStore, narrativeId: string,
                           chapterIndex: number, blockIndex: number, text: string): void {
  const next = text.replace(/\s+/g, " ").trim();
  if (!next) return;
  editChapters(store, narrativeId, (cs) => {
    const b = cs[chapterIndex]?.blocks?.[blockIndex];
    if (b && b.block_type === "heading") b.text = next;
  });
}

/** MICRO-SEG22 · a new section (1) or subsection (2) at `at` in a chapter. */
export function insertHeading(store: DocumentStore, narrativeId: string,
                              chapterIndex: number, at: number, level: 1 | 2, text: string): void {
  editChapters(store, narrativeId, (cs) => {
    const c = cs[chapterIndex];
    if (!c) return;
    const blocks = (c.blocks ??= []);
    blocks.splice(Math.max(0, Math.min(blocks.length, at)), 0, { block_type: "heading", text, level });
  });
}

/** MICRO-SEG22 · the story numbered (1, 1.1, 1.1.1) or not: `data.numbering`,
 *  absent when on (the default), `false` when off. */
export function setNumbering(store: DocumentStore, narrativeId: string, on: boolean): void {
  const node = store.node(narrativeId);
  if (!node) return;
  const data = { ...((node.data ?? {}) as Record<string, unknown>) };
  if ((data.numbering !== false) === on) return;
  if (on) delete data.numbering; else data.numbering = false;
  store.updateNode(narrativeId, { data });
}

export function setProse(store: DocumentStore, narrativeId: string,
                         chapterIndex: number, blockIndex: number,
                         text: string): void {
  editChapters(store, narrativeId, (cs) => {
    const b = cs[chapterIndex]?.blocks?.[blockIndex] as
      (EditableBlock & { ai_generated?: boolean; validated_by?: string | null }) | undefined;
    if (!b || b.block_type !== "prose") return;
    // MICRO-NARRATIVE-MODULI p.17 · a paragraph of AI origin changed AFTER a
    // person signed it is to be verified again: the signature was for the
    // other words. The origin stays (`ai_generated`), and so does who had
    // signed it (`options.signed_before`), as the trace of the act.
    if (b.ai_generated && b.validated_by && (b.text ?? "") !== text) {
      b.options = { ...(b.options ?? {}), signed_before: b.validated_by };
      delete b.validated_by;
    }
    b.text = text;
  });
}

/** p.16 · the language of the story (`data.lang`), set at its birth and
 *  changeable: the AI's drafts are asked in it. */
export function setNarrativeLang(store: DocumentStore, narrativeId: string, lang: string): void {
  const node = store.node(narrativeId);
  if (!node) return;
  const data = { ...((node.data ?? {}) as Record<string, unknown>) };
  if ((data.lang ?? "") === lang) return;
  if (lang) data.lang = lang; else delete data.lang;
  store.updateNode(narrativeId, { data });
}

/** p.16 · the language the written prose is IN, when the story does not say
 *  (a count of the commonest words, enough to tell the languages EM is
 *  written in apart); "" when there is too little text to tell. */
const LANG_WORDS: Record<string, string[]> = {
  en: ["the", "and", "of", "is", "was", "with", "which", "this", "that", "have"],
  it: ["il", "di", "che", "della", "delle", "nel", "sono", "una", "con", "dei"],  // ALLOW-IT: words to recognise, not shown
  fr: ["le", "les", "des", "est", "une", "dans", "avec", "qui", "pour", "sur"],
  de: ["der", "die", "und", "das", "ist", "mit", "den", "von", "ein", "eine"],
  es: ["el", "los", "las", "del", "que", "una", "con", "por", "para", "es"],
  ro: ["și", "în", "care", "din", "este", "pentru", "una", "cu", "fost", "sunt"],
};
export function detectProseLang(texts: string[]): string {
  const words = texts.join(" ").toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 20) return "";
  let best = "", score = 0;
  for (const [lang, list] of Object.entries(LANG_WORDS)) {
    const set = new Set(list);
    const n = words.filter((w) => set.has(w)).length;
    if (n > score) { best = lang; score = n; }
  }
  return score >= 3 ? best : "";
}

/** The story's language: declared, else the one its prose is written in. */
export function narrativeLang(data: Record<string, unknown> | undefined,
                              chapters: EditableChapter[]): { lang: string; declared: boolean } {
  const declared = typeof data?.lang === "string" ? String(data.lang) : "";
  if (declared) return { lang: declared, declared: true };
  const texts = chapters.flatMap((c) => (c.blocks ?? []).filter((b) => b.block_type === "prose")
    .map((b) => String(b.text ?? "").replace(/\[\[[^\]]*\]\]/g, " ")));
  return { lang: detectProseLang(texts), declared: false };
}

/** Insert an embed. `at` places it (drop position); omitted means append. */
export function addEmbed(store: DocumentStore, narrativeId: string,
                         chapterIndex: number, ref: string, viewType: string,
                         at?: number): void {
  editChapters(store, narrativeId, (cs) => {
    const c = cs[chapterIndex];
    if (!c) return;
    const blocks = (c.blocks ??= []);
    const block: EditableBlock = {
      block_type: "embed", ref, view_type: viewType,
    };
    if (at === undefined || at < 0 || at > blocks.length) blocks.push(block);
    else blocks.splice(at, 0, block);
  });
}

export function setEmbedViewType(store: DocumentStore, narrativeId: string,
                                 chapterIndex: number, blockIndex: number,
                                 viewType: string): void {
  editChapters(store, narrativeId, (cs) => {
    const b = cs[chapterIndex]?.blocks?.[blockIndex];
    if (b && b.block_type === "embed") {
      b.view_type = viewType;
      // MICRO-SEG24 · a figure shown another way is no longer that figure (a
      // plan made a Matrix): it becomes an ordinary embed of the same subject
      const f = figureOf(b);
      if (f && FIGURE_VIEW[f.kind] !== viewType && b.options) {
        const { figure: _gone, ...rest } = b.options;
        void _gone;
        if (Object.keys(rest).length) b.options = rest; else delete b.options;
      }
    }
  });
}

/** COLLEGARE · an embed's caption, where the exporters read it
 *  (`options.caption`: the LaTeX figure's caption, the DOCX figure's). Empty
 *  removes it, so a figure falls back to the node's name. */
export function setEmbedCaption(store: DocumentStore, narrativeId: string,
                                chapterIndex: number, blockIndex: number,
                                caption: string): void {
  editChapters(store, narrativeId, (cs) => {
    const b = cs[chapterIndex]?.blocks?.[blockIndex] as
      (EditableBlock & { options?: Record<string, unknown> }) | undefined;
    if (!b || b.block_type !== "embed") return;
    const opts = { ...(b.options ?? {}) };
    if (caption.trim()) opts.caption = caption.trim();
    else delete opts.caption;
    if (Object.keys(opts).length) b.options = opts;
    else delete b.options;
  });
}

/** NARRATIVA-BLOCCHI p.2 · a block's `options`, merged: a key set to `null`
 *  or `undefined` is removed. One call, one undo step (a query block's scope,
 *  types and order are each one gesture in its Inspector). */
export function setBlockOptions(store: DocumentStore, narrativeId: string,
                                chapterIndex: number, blockIndex: number,
                                patch: Record<string, unknown>): void {
  editChapters(store, narrativeId, (cs) => {
    const b = cs[chapterIndex]?.blocks?.[blockIndex];
    if (!b) return;
    const opts: Record<string, unknown> = { ...(b.options ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete opts[k];
      else opts[k] = v;
    }
    if (Object.keys(opts).length) b.options = opts;
    else delete b.options;
  });
}

export function deleteBlock(store: DocumentStore, narrativeId: string,
                            chapterIndex: number, blockIndex: number): void {
  editChapters(store, narrativeId, (cs) => {
    cs[chapterIndex]?.blocks?.splice(blockIndex, 1);
  });
}

export function moveBlock(store: DocumentStore, narrativeId: string,
                          chapterIndex: number, blockIndex: number,
                          delta: number): void {
  editChapters(store, narrativeId, (cs) => {
    const blocks = cs[chapterIndex]?.blocks;
    if (blocks) move(blocks, blockIndex, delta);
  });
}

function move<T>(arr: T[], index: number, delta: number): void {
  const to = index + delta;
  if (index < 0 || index >= arr.length || to < 0 || to >= arr.length) return;
  const [item] = arr.splice(index, 1);
  arr.splice(to, 0, item);
}
