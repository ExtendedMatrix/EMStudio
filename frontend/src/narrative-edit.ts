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

export interface EditableBlock {
  block_type: "prose" | "embed";
  text?: string;
  ref?: string;
  view_type?: string;
  options?: Record<string, unknown>;
}

export interface EditableChapter {
  title: string;
  anchor?: string;
  canonical?: boolean;
  blocks?: EditableBlock[];
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
): void {
  const node = store.node(narrativeId);
  if (!node) return;
  const chapters = chaptersOf(node);
  mutate(chapters);
  const data = { ...((node.data ?? {}) as Record<string, unknown>) };
  data.chapters = chapters;
  store.updateNode(narrativeId, { data });
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

// ── blocks ────────────────────────────────────────────────────────────────────

export function addProse(store: DocumentStore, narrativeId: string,
                         chapterIndex: number, text = ""): void {
  editChapters(store, narrativeId, (cs) => {
    const c = cs[chapterIndex];
    if (!c) return;
    (c.blocks ??= []).push({ block_type: "prose", text });
  });
}

export function setProse(store: DocumentStore, narrativeId: string,
                         chapterIndex: number, blockIndex: number,
                         text: string): void {
  editChapters(store, narrativeId, (cs) => {
    const b = cs[chapterIndex]?.blocks?.[blockIndex];
    if (b && b.block_type === "prose") b.text = text;
  });
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
    if (b && b.block_type === "embed") b.view_type = viewType;
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
