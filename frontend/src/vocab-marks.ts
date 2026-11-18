/**
 * MICRO-PL02 (residue of MICRO-U, E.D., 18 Nov 2026) · the «controlled
 * vocabulary» mark NEXT TO A PROPERTY in the Outliner and in the Matrix — the
 * same reading as the sign the Inspector draws under a value (`valueTermEl`):
 *
 *   ◆   linked to a concept of a vocabulary installed here
 *   ◆?  linked, but its vocabulary is not installed on this machine
 *   ◇   «not controlled»: a controlled field (its quale is a
 *       `controlled_vocabulary` with an external `vocabulary_source`) whose
 *       value has no concept
 *
 * A property that is neither linked nor a controlled field has no mark.
 *
 * Pure: the machine's vocabularies, the concept lookup, the file's copy and
 * the words are HANDED IN (the page's one `VocabState`, never a second state);
 * no bridge call here. `VocabMarkCache` keeps one answer per node until its
 * key (the store's revision, the vocabularies' revision, the language) moves.
 */
import {
  isControlled, termOf, valueLabel,
  type ConceptEntry, type VocabSection, type VocabSummary,
} from "./vocab-terms";

export type VocabMarkState = "linked" | "missing" | "uncontrolled";

export interface VocabMark {
  state: VocabMarkState;
  /** what is drawn: «◆», «◆?», «◇» */
  glyph: string;
  /** the tooltip: the label in the interface language · the vocabulary, its attribution */
  tip: string;
}

export interface VocabMarkCtx {
  /** the interface language (the label shown) */
  lang: string;
  /** the concept and its vocabulary when installed (VocabState.lookup) */
  lookup: (uri: string) => { concept: ConceptEntry; vocab: VocabSummary } | null;
  /** the ids of the vocabularies ready on this machine; null = not known (no bridge) */
  installed: Set<string> | null;
  /** the file's declaration (its copy of the terms, when it travels) */
  embedded?: VocabSection | null;
  t: (key: string, vars?: Record<string, string>) => string;
}

type NodeIn = Parameters<typeof valueLabel>[0];

export const MARK_GLYPH: Record<VocabMarkState, string> = { linked: "◆", missing: "◆?", uncontrolled: "◇" };

/** The state alone (no words): what the Matrix needs per frame. */
export function vocabMarkState(n: NodeIn | undefined, ctx: Pick<VocabMarkCtx, "lookup" | "installed" | "embedded" | "lang">): VocabMarkState | null {
  if (!n || n.node_type !== "property") return null;
  const term = termOf(n);
  if (!term) return isControlled(n) ? "uncontrolled" : null;
  // «missing» as the warnings say it (`vocabularyRows`): only when the machine
  // is KNOWN not to have the vocabulary, and the file carries no copy of the
  // concept; a term without a vocabulary id: when no lookup knows its concept
  if (ctx.installed === null) return "linked";
  const lab = valueLabel(n, ctx.lang, ctx.lookup, ctx.embedded ?? null);
  if (term.vocabulary) return !ctx.installed.has(term.vocabulary) && lab.missingVocabulary ? "missing" : "linked";
  return lab.missingVocabulary ? "missing" : "linked";
}

/** The mark of a property node, with its tooltip; null: no mark. */
export function vocabMarkOf(n: NodeIn | undefined, ctx: VocabMarkCtx): VocabMark | null {
  const state = vocabMarkState(n, ctx);
  if (!state || !n) return null;
  const { t } = ctx;
  if (state === "uncontrolled") return { state, glyph: MARK_GLYPH[state], tip: t("vocabMark.uncontrolled") };
  const term = termOf(n)!;
  const lab = valueLabel(n, ctx.lang, ctx.lookup, ctx.embedded ?? null);
  const v = lab.vocabulary ?? term.vocabulary ?? "?";
  const head = state === "missing"
    ? t("vocabMark.missing", { label: lab.text, v })
    : lab.lang ? t("vocabMark.linked", { label: lab.text, lang: lab.lang, v })
      : t("vocabMark.linkedNoLang", { label: lab.text, v });
  const tip = [head, lab.attribution ?? "", t("vocabMark.code", { uri: term.concept })].filter(Boolean).join("\n");
  return { state, glyph: MARK_GLYPH[state], tip };
}

/** One answer per node until its key moves (the store's revision, the
 *  vocabularies' revision, the language): the Outliner's virtual rows and
 *  the Matrix's frames ask it as often as they like. */
export class VocabMarkCache {
  private marks = new Map<string, { key: string; mark: VocabMark | null }>();
  private states = new Map<string, { key: string; map: Map<string, VocabMarkState> }>();

  /** the mark of node `id` (of the graph `scope`), computed when `key` moved */
  mark(scope: string, id: string, key: string, compute: () => VocabMark | null): VocabMark | null {
    const k = `${scope}\u0000${id}`;
    const hit = this.marks.get(k);
    if (hit && hit.key === key) return hit.mark;
    if (this.marks.size > 50000) this.marks.clear();
    const mark = compute();
    this.marks.set(k, { key, mark });
    return mark;
  }

  /** every marked property of a graph: node id → state (the Matrix's map) */
  statesOf(scope: string, key: string, nodes: () => Iterable<NodeIn & { id?: string }>,
          ctx: Pick<VocabMarkCtx, "lookup" | "installed" | "embedded" | "lang">): Map<string, VocabMarkState> {
    const hit = this.states.get(scope);
    if (hit && hit.key === key) return hit.map;
    const map = new Map<string, VocabMarkState>();
    for (const n of nodes()) {
      if (n.node_type !== "property" || !n.id) continue;
      const s = vocabMarkState(n, ctx);
      if (s) map.set(n.id, s);
    }
    this.states.set(scope, { key, map });
    return map;
  }

  clear(): void { this.marks.clear(); this.states.clear(); }
}
