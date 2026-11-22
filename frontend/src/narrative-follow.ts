/**
 * MICRO-SEG26 (22 Nov 2026) · the 3D view that ACCOMPANIES the text.
 *
 * The Narrative workspace has a 3D area (a Space window, `follow: "narrative"`)
 * that follows the ACTIVE BLOCK — the one the caret is in while writing, the
 * one under the reading line while reading:
 *
 * - a block bound to an epoch or an activity (the «Narrates» chips of SEG23, on
 *   the block itself if it is a heading, else on the section / subsection it is
 *   in, else on its chapter) sets the epoch, shows only the pertinent proxies
 *   and models, and frames them;
 * - the units the block CITES (its `[[mentions]]`, its embed's ref, the owners
 *   of a cited property — the Inspector's «Cites» row) are lit, the others faded;
 * - a block with neither leaves the 3D on its last framing.
 *
 * And the other way: a proxy picked in the 3D → the blocks that cite or narrate
 * that unit (`blocksAbout`), lit in the page and the Index, «next» going through
 * them.
 *
 * Pure: no store, no DOM, apart from the small timer `settle` (the 3D never
 * flies while the person types: it waits for the caret to rest).
 */
import { anchorsOf } from "./narrative-lanes";
import { sceneContent, scopeOf } from "./narrative-embeds";
import { mentionsIn } from "./narrative-projection";
import { epochOfActivity, isFigureRef } from "./narrative-figures";
import type { EmDocument, EmNode } from "./types";

export interface BlockRef { narrativeId: string; chapter: number; block: number | null }

type Blockish = { block_type?: string; text?: string; ref?: string; level?: number; options?: Record<string, unknown> } | null | undefined;
type Chapterish = { title?: string; anchor?: string; anchors?: string[]; blocks?: Blockish[] } | null | undefined;

/** Where the lanes of a block come from. */
export type NarratesFrom = "block" | "subsection" | "section" | "chapter" | null;

export interface BlockFocus {
  /** the lanes (epochs, activities, horizons) the block is narrating, innermost part first */
  narrates: string[];
  from: NarratesFrom;
  /** the ids the block cites: mentions, the embed's ref, the owners of a cited property */
  cites: string[];
}

const live = (doc: EmDocument | null) => (doc?.graph?.edges ?? []).filter((e) => !(e as { removed?: unknown }).removed);
const isEpoch = (n?: EmNode | null): boolean => !!n && (n.node_type === "EpochNode" || n.node_type === "epoch");
const levelOf = (b: Blockish): 1 | 2 => ((b?.level ?? 1) >= 2 ? 2 : 1);

/** The ids a block cites, as the Inspector's «Cites» says them. */
export function citesOf(doc: EmDocument | null, block: Blockish): string[] {
  if (!block) return [];
  const out: string[] = [];
  const add = (id: string) => { if (id && !isFigureRef(id) && !out.includes(id)) out.push(id); };
  if (block.block_type === "prose" || block.block_type === "heading") for (const id of mentionsIn(block.text)) add(id);
  else if (block.ref && !(block.options ?? {})["query"]) add(block.ref);
  // a cited property stands for the unit that has it
  const props = new Set(out);
  for (const e of live(doc)) if (e.edge_type === "has_property" && props.has(e.target)) add(e.source);
  return out;
}

/** What a block narrates and cites (`block` null: the chapter's head; chapter
 *  -1: the story's head, which narrates nothing). */
export function blockFocus(doc: EmDocument | null, chapters: readonly Chapterish[], chapter: number, block: number | null): BlockFocus {
  const ch = chapters[chapter];
  if (!ch) return { narrates: [], from: null, cites: [] };
  const blocks = ch.blocks ?? [];
  const cites = block === null ? [] : citesOf(doc, blocks[block]);
  if (block !== null && blocks[block]) {
    const own = anchorsOf(blocks[block] as never);
    if (own.length) return { narrates: own, from: "block", cites };
    // the section and the subsection it is in: the nearest heading of each
    // level above it (a section closes the subsections before it)
    let sub: Blockish = null, sec: Blockish = null;
    for (let i = block - 1; i >= 0 && !sec; i--) {
      const b = blocks[i];
      if (b?.block_type !== "heading") continue;
      if (levelOf(b) === 2) { if (!sub) sub = b; }
      else sec = b;
    }
    if (blocks[block]?.block_type === "heading" && levelOf(blocks[block]) === 1) sub = null;
    const subA = sub ? anchorsOf(sub as never) : [];
    if (subA.length) return { narrates: subA, from: "subsection", cites };
    const secA = sec ? anchorsOf(sec as never) : [];
    if (secA.length) return { narrates: secA, from: "section", cites };
  }
  const chA = anchorsOf(ch as never);
  return { narrates: chA, from: chA.length ? "chapter" : null, cites };
}

export interface LaneScope {
  /** the epoch to set (an epoch lane, an activity's epoch), null: keep it */
  epoch: string | null;
  /** the scene keys that are pertinent (`proxy:<unit>`, `rm:<id>`), null: the whole epoch */
  keys: Set<string> | null;
}

/** What the 3D shows for the lanes a block narrates: the first epoch named (or
 *  the epoch of the first activity), and — when no lane is a whole epoch — only
 *  the proxies of the activities' units and the models bound to them. */
export function laneScope(doc: EmDocument | null, lanes: readonly string[]): LaneScope {
  const byId = new Map((doc?.graph?.nodes ?? []).map((n) => [n.id, n]));
  let epoch: string | null = null;
  let whole = false;
  const keys = new Set<string>();
  for (const id of lanes) {
    const n = byId.get(id);
    if (!n) continue;
    if (isEpoch(n)) { epoch ??= id; whole = true; continue; }
    epoch ??= epochOfActivity(id, doc);
    const c = sceneContent(n, doc);
    for (const m of c?.models ?? []) keys.add(`rm:${m}`);
    for (const u of c?.proxies ?? []) keys.add(`proxy:${u}`);
    for (const u of scopeOf(n, doc).units) keys.add(`proxy:${u.id}`);
  }
  return { epoch, keys: whole || !keys.size ? null : keys };
}

export interface BlockAbout { chapter: number; block: number | null; why: "cites" | "narrates" }

/** The parts of the story that cite or narrate a unit, in reading order: a
 *  block citing it, a heading or a chapter narrating it, an activity or a
 *  group it belongs to (not a whole epoch: every unit of it would light every
 *  chapter of that epoch). */
export function blocksAbout(doc: EmDocument | null, chapters: readonly Chapterish[], unitId: string): BlockAbout[] {
  const byId = new Map((doc?.graph?.nodes ?? []).map((n) => [n.id, n]));
  const memo = new Map<string, boolean>();
  const narratesIt = (lanes: string[]): boolean => lanes.some((id) => {
    if (id === unitId) return true;
    if (memo.has(id)) return memo.get(id)!;
    const n = byId.get(id);
    const yes = !!n && !isEpoch(n) && scopeOf(n, doc).units.some((u) => u.id === unitId);
    memo.set(id, yes);
    return yes;
  });
  const out: BlockAbout[] = [];
  chapters.forEach((ch, ci) => {
    if (narratesIt(anchorsOf(ch as never))) out.push({ chapter: ci, block: null, why: "narrates" });
    (ch?.blocks ?? []).forEach((b, bi) => {
      if (citesOf(doc, b).includes(unitId)) out.push({ chapter: ci, block: bi, why: "cites" });
      else if (b?.block_type === "heading" && narratesIt(anchorsOf(b as never))) out.push({ chapter: ci, block: bi, why: "narrates" });
    });
  });
  return out;
}

/** Same block? (null-safe) */
export function sameBlock(a: BlockRef | null, b: BlockRef | null): boolean {
  return !!a && !!b && a.narrativeId === b.narrativeId && a.chapter === b.chapter && a.block === b.block;
}

/** How long the caret must rest before the 3D follows, while writing (ms). */
export const WRITE_SETTLE_MS = 1000;
/** …and the reading line, while reading (a scroll that stops). */
export const READ_SETTLE_MS = 350;

/**
 * A timer that runs `fn` once the calls have stopped for `ms`: every call (a
 * key, a caret move) pushes it back. «Never fly while typing».
 */
export function settle(): { push(ms: number, fn: () => void): void; cancel(): void; pending(): boolean } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    push(ms, fn) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(); }, ms);
    },
    cancel() { if (timer) clearTimeout(timer); timer = null; },
    pending() { return timer !== null; },
  };
}
