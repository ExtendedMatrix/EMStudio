/**
 * N6 — who wrote this, and who vouches for it.
 *
 * Three states, and the difference between them is the whole point:
 *
 *   `human`        a person wrote it and signed it
 *   `ai_draft`     a model wrote it and **nobody has vouched for it yet**
 *   `ai_endorsed`  a model wrote it and a named person put their name to it
 *
 * The state is **derived, never stored** — exactly as in s3Dgraphy's
 * `narrative_node.Block.status`. A stored status could disagree with the facts
 * (a block marked "endorsed" with no validator), and on a claim about an
 * archaeological site that disagreement is not a display bug.
 *
 * Everything here writes through the ordinary `DocumentStore` mutations, so an
 * authorship change is undoable, marks the document dirty, reaches a synced
 * peer and is written by the existing save. There is no parallel format: the
 * narrative-level author is a `has_author` EDGE (the N4 model), the
 * chapter-level author is `chapter.authored_by`, and an endorsement is
 * `block.validated_by`.
 *
 * Nothing in this module ever sets `validated_by` on its own. Endorsement is an
 * act by a person; pressing "generate" is not one.
 */

import { t } from "./i18n";
import type { DocumentStore } from "./model";
import { editChapters } from "./narrative-edit";
import type { EditableBlock, EditableChapter } from "./narrative-edit";
import type { EmDocument, EmNode } from "./types";

export type BlockStatus = "human" | "ai_draft" | "ai_endorsed";

/** The node types the datamodel gives authorship. `author_ai` is a SUBCLASS of
 *  `author`, which is why "is this an author" and "is this a human" are two
 *  different questions everywhere below. */
export const AUTHOR_TYPE = "author";
export const AI_AUTHOR_TYPE = "author_ai";

export interface AuthorRef {
  id: string;
  label: string;
  ai: boolean;
}

/** Mirrors `Block.status` in s3Dgraphy. Derived from the facts, every time. */
export function blockStatus(block: {
  ai_generated?: boolean;
  validated_by?: string | null;
}): BlockStatus {
  if (!block.ai_generated) return "human";
  return block.validated_by ? "ai_endorsed" : "ai_draft";
}

function label(node: EmNode): string {
  return String(node.name || node.id);
}

export function authorsIn(doc: EmDocument | null): AuthorRef[] {
  return (doc?.graph?.nodes ?? [])
    .filter((n) => n.node_type === AUTHOR_TYPE || n.node_type === AI_AUTHOR_TYPE)
    .map((n) => ({
      id: n.id,
      label: label(n),
      ai: n.node_type === AI_AUTHOR_TYPE,
    }));
}

/** Only these may endorse. A model vouching for a model is a signature with
 *  nobody behind it — the same refusal s3Dgraphy's `resolve_human_author`
 *  makes, restated here so the UI never offers the impossible choice. */
export function humanAuthorsIn(doc: EmDocument | null): AuthorRef[] {
  return authorsIn(doc).filter((a) => !a.ai);
}

export function authorLabel(doc: EmDocument | null, id: string | undefined):
    string {
  if (!id) return "";
  const node = (doc?.graph?.nodes ?? []).find((n) => n.id === id);
  return node ? label(node) : id;
}

export function isAiAuthor(doc: EmDocument | null,
                           id: string | undefined): boolean {
  if (!id) return false;
  return (doc?.graph?.nodes ?? []).some(
    (n) => n.id === id && n.node_type === AI_AUTHOR_TYPE);
}

// ── narrative-level authorship: an edge, not a field ──────────────────────────

export function narrativeAuthors(doc: EmDocument | null,
                                 narrativeId: string): AuthorRef[] {
  const known = new Map(authorsIn(doc).map((a) => [a.id, a]));
  const out: AuthorRef[] = [];
  for (const e of doc?.graph?.edges ?? []) {
    if (e.edge_type !== "has_author" || e.source !== narrativeId) continue;
    const a = known.get(e.target);
    if (a && !out.some((x) => x.id === a.id)) out.push(a);
  }
  return out;
}

export function addNarrativeAuthor(store: DocumentStore, narrativeId: string,
                                   authorId: string): void {
  if (!authorId) return;
  if (store.hasEdge(narrativeId, authorId, "has_author")) return;
  store.addEdge(narrativeId, authorId, "has_author");
}

export function removeNarrativeAuthor(store: DocumentStore, narrativeId: string,
                                      authorId: string): void {
  const edge = store.doc.graph.edges.find(
    (e) => e.edge_type === "has_author"
      && e.source === narrativeId
      && e.target === authorId);
  if (edge) store.deleteEdge(edge);
}

// ── chapter-level authorship ──────────────────────────────────────────────────

export function setChapterAuthor(store: DocumentStore, narrativeId: string,
                                 index: number,
                                 authorId: string | null): void {
  editChapters(store, narrativeId, (cs) => {
    const c = cs[index];
    if (!c) return;
    if (authorId) (c as EditableChapter & { authored_by?: string })
      .authored_by = authorId;
    else delete (c as EditableChapter & { authored_by?: string }).authored_by;
  });
}

// ── endorsement ───────────────────────────────────────────────────────────────

/**
 * A person vouches for a generated block.
 *
 * Throws — with the reason — rather than silently doing nothing, because every
 * refusal here is something the user must understand: an unknown author, a node
 * that is not an author at all, or a model being asked to validate a model.
 */
export function endorseBlock(store: DocumentStore, narrativeId: string,
                             chapterIndex: number, blockIndex: number,
                             humanAuthorId: string): void {
  if (!humanAuthorId)
    throw new Error(t("endorse.needsName"));
  const node = store.node(humanAuthorId);
  if (!node)
    throw new Error(t("endorse.unknownAuthor", { id: humanAuthorId }));
  if (node.node_type === AI_AUTHOR_TYPE)
    throw new Error(t("endorse.aiAuthor", { name: label(node) }));
  if (node.node_type !== AUTHOR_TYPE)
    throw new Error(t("endorse.notAnAuthor", { name: label(node) }));
  editChapters(store, narrativeId, (cs) => {
    const b = cs[chapterIndex]?.blocks?.[blockIndex] as
      (EditableBlock & { validated_by?: string; ai_generated?: boolean })
      | undefined;
    if (b) b.validated_by = humanAuthorId;
  });
}

/** Withdraw an endorsement. Signing is reversible; that it happened is not
 *  hidden, the block simply goes back to reading as an unendorsed draft. */
export function retractEndorsement(store: DocumentStore, narrativeId: string,
                                   chapterIndex: number,
                                   blockIndex: number): void {
  editChapters(store, narrativeId, (cs) => {
    const b = cs[chapterIndex]?.blocks?.[blockIndex] as
      (EditableBlock & { validated_by?: string }) | undefined;
    if (b) delete b.validated_by;
  });
}

// ── transplanting a generated draft ───────────────────────────────────────────

/** What the bridge answers with (`POST /generate-narrative-draft`, N5). */
export interface DraftResult {
  ok: boolean;
  text: string;
  provider: string;
  model: string;
  narrative_id: string;
  chapter_title: string;
  author_id: string;
  prompt_id: string | null;
  status: string;
  pending_validation: number;
  sent: Record<string, unknown>;
  doc: EmDocument;
}

/**
 * Bring a generated draft into the live document.
 *
 * The bridge returns the WHOLE graph as s3Dgraphy rewrote it. Loading that
 * wholesale would be wrong twice over: it has no `layout` (s3Dgraphy does not
 * model one, so every position would be lost) and it would replace nodes the
 * user may have edited while the request was in flight.
 *
 * So we transplant only what the generation actually produced — the nodes it
 * minted (the AI author, the prompt-as-source) and the narrative's chapters as
 * s3Dgraphy rewrote them. s3Dgraphy stays the authority on *what* a draft is;
 * this side only files the result. One `batch`, so it is one undo.
 */
export function applyGeneratedDraft(store: DocumentStore, result: DraftResult,
                                    anchor: string): void {
  const incoming = result.doc?.graph?.nodes ?? [];
  const narrative = incoming.find((n) => n.id === result.narrative_id);
  if (!narrative)
    throw new Error(t("draft.noNarrative"));
  const written = ((((narrative.data ?? {}) as Record<string, unknown>)
    .chapters ?? []) as EditableChapter[])
    .find((c) => c.anchor === anchor);
  if (!written)
    throw new Error(t("draft.noChapter", { anchor }));

  store.batch(() => {
    for (const id of [result.author_id, result.prompt_id]) {
      if (!id || store.node(id)) continue;
      const node = incoming.find((n) => n.id === id);
      if (node) store.addNode(JSON.parse(JSON.stringify(node)) as EmNode);
    }
    // the narrative is attributed to the model too, so "what did this model
    // write" is answerable from the edges and not only by reading the chapters
    if (result.author_id && store.node(result.author_id))
      addNarrativeAuthor(store, result.narrative_id, result.author_id);

    // Only the generated chapter is taken over. Replacing the whole list would
    // silently discard anything the author changed elsewhere while the request
    // was in flight — a request that can take a minute against a real model.
    editChapters(store, result.narrative_id, (chapters) => {
      const copy = JSON.parse(JSON.stringify(written)) as EditableChapter;
      const at = chapters.findIndex((c) => c.anchor === anchor);
      if (at >= 0) chapters[at] = copy;
      else chapters.push(copy);
    });
  });
}

// ── endorsing a whole chapter ─────────────────────────────────────────────────

/** The AI paragraphs in a chapter that nobody has vouched for yet. */
export function pendingInChapter(chapter: EditableChapter | undefined): number[] {
  const out: number[] = [];
  (chapter?.blocks ?? []).forEach((b, i) => {
    const block = b as EditableBlock & {
      ai_generated?: boolean; validated_by?: string };
    if (block.block_type === "prose" && blockStatus(block) === "ai_draft")
      out.push(i);
  });
  return out;
}

/**
 * Vouch for every unendorsed AI paragraph in one chapter.
 *
 * **The per-paragraph act is preserved.** This writes a separate `validated_by`
 * on each block rather than one flag on the chapter — a chapter is not a claim,
 * the paragraphs are, and "which sentences did this person put their name to"
 * has to stay answerable afterwards. What the gesture saves is clicks, not
 * granularity.
 *
 * One `batch`, so it is one undo: an endorsement half-applied across a chapter
 * would be worse than none.
 *
 * Returns how many paragraphs were endorsed.
 */
export function endorseChapter(store: DocumentStore, narrativeId: string,
                               chapterIndex: number,
                               humanAuthorId: string): number {
  const node = store.node(narrativeId);
  const chapters = ((node?.data ?? {}) as Record<string, unknown>)
    .chapters as EditableChapter[] | undefined;
  const pending = pendingInChapter(chapters?.[chapterIndex]);
  if (!pending.length) return 0;
  store.batch(() => {
    for (const blockIndex of pending)
      endorseBlock(store, narrativeId, chapterIndex, blockIndex, humanAuthorId);
  });
  return pending.length;
}

// ── the byline ────────────────────────────────────────────────────────────────

export interface Byline {
  /** People who carry responsibility: the human authors, plus anyone who has
   *  put their name to a generated paragraph. */
  responsible: AuthorRef[];
  /** Models that contributed text. Never co-authors — assistance. */
  assisted: AuthorRef[];
}

/**
 * Who is responsible, and what assisted.
 *
 * The two are **not** the same line (E.D., 2026-08-02). Listing a model beside a
 * person as an equal co-author states something false: only one of them can be
 * asked about the claim afterwards. So the people come first and the models
 * follow as *assistance* — which is also the honest reading of what happened,
 * since nothing a model wrote counts until a person endorses it.
 *
 * A human who endorsed a paragraph without being a declared author is included
 * among the responsible: signing IS taking responsibility, and a byline that
 * omitted them would hide the one person who vouched for the text.
 */
export function bylineOf(doc: EmDocument | null, narrativeId: string,
                         chapters: EditableChapter[]): Byline {
  const known = new Map(authorsIn(doc).map((a) => [a.id, a]));
  const declared = narrativeAuthors(doc, narrativeId);
  const responsible = declared.filter((a) => !a.ai);
  const assisted = declared.filter((a) => a.ai);

  for (const chapter of chapters) {
    for (const b of chapter.blocks ?? []) {
      const block = b as EditableBlock & {
        validated_by?: string; authored_by?: string };
      const signer = known.get(block.validated_by ?? "");
      if (signer && !signer.ai && !responsible.some((r) => r.id === signer.id))
        responsible.push(signer);
      const wrote = known.get(block.authored_by ?? "");
      if (wrote?.ai && !assisted.some((a) => a.id === wrote.id))
        assisted.push(wrote);
    }
  }
  return { responsible, assisted };
}

// ── COLLEGARE · the signer IS the identity of the header ─────────────────────

/** The identity signing: its ORCID and the name to show. */
export interface SignerIdentity {
  orcid: string;
  label: string;
  verified?: boolean;
}

/**
 * The human AuthorNode that carries this identity's ORCID (`data.orcid`) —
 * found, or CREATED (call it inside the batch of the act that needs it, so the
 * author and the signature are one undo step). A signature has somebody behind
 * it, and that somebody is the person at the keyboard, not a pick from a list.
 */
export function authorForIdentity(store: DocumentStore, me: SignerIdentity): string {
  const found = store.doc.graph.nodes.find((n) => n.node_type === AUTHOR_TYPE
    && String(((n.data ?? {}) as Record<string, unknown>).orcid ?? "") === me.orcid);
  if (found) return found.id;
  const id = store.newId();
  store.addNode({ id, name: me.label, node_type: AUTHOR_TYPE, description: "",
                  data: { orcid: me.orcid, verified: !!me.verified } });
  return id;
}

/** Verify one AI paragraph AS the identity: one undo step (author + signature).
 *  Without an identity nothing is written — the caller opens the identity. */
export function verifyAs(store: DocumentStore, narrativeId: string, chapter: number, block: number,
                         me: SignerIdentity | null): "needs-identity" | "verified" {
  if (!me) return "needs-identity";
  store.batch(() => endorseBlock(store, narrativeId, chapter, block, authorForIdentity(store, me)));
  return "verified";
}

/** …a whole chapter, one act per paragraph, one undo step. */
export function verifyChapterAs(store: DocumentStore, narrativeId: string, chapter: number,
                                me: SignerIdentity | null): number | "needs-identity" {
  if (!me) return "needs-identity";
  let n = 0;
  store.batch(() => { n = endorseChapter(store, narrativeId, chapter, authorForIdentity(store, me)); });
  return n;
}

/** «Firmo io» on a chapter. */
export function signChapterAs(store: DocumentStore, narrativeId: string, chapter: number,
                              me: SignerIdentity | null): "needs-identity" | "signed" {
  if (!me) return "needs-identity";
  store.batch(() => setChapterAuthor(store, narrativeId, chapter, authorForIdentity(store, me)));
  return "signed";
}

/** NARRATIVE-DESK · «Firmo io» on the whole story: the identity becomes a
 *  responsible author of the narrative (`has_author`), one undo step. */
export function signNarrativeAs(store: DocumentStore, narrativeId: string,
                                me: SignerIdentity | null): "needs-identity" | "signed" {
  if (!me) return "needs-identity";
  store.batch(() => addNarrativeAuthor(store, narrativeId, authorForIdentity(store, me)));
  return "signed";
}
