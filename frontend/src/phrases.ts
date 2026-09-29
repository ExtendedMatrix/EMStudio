// FRASI · the phrase of a «Linked to X» entry of the Add menu, from the datamodel.
//
// «Property of X», «US above X», «Document for X» are EM language (E.D., 1 ott
// 2026), so they live in s3Dgraphy: `ui_phrase` on an edge type of
// `s3Dgraphy_connections_datamodel.json`, in canonical English, with two
// directions —
//   · `as_source`: the NEW node is the edge's source;
//   · `as_target`: the NEW node is the edge's target —
// and the placeholders `{node}` (the new type's label) and `{x}` (the existing
// node's name). The other languages are in `datamodel_translations.json`.
//
// The reading, in order: the interface language, then English, then the single
// preposition the menu used before (the caller's `fallback`). A phrase that has
// lost a placeholder is skipped as if absent: a menu entry that does not name X
// or the new type says less than the fallback does.
//
// Pure: the book is handed in, so the test can write three phrases by hand
// while the vendored datamodel has none yet.

export type PhraseDir = "as_source" | "as_target";

/** Where the phrases come from. */
export interface PhraseBook {
  /** the canonical English phrase of the connections datamodel */
  canonical(edgeType: string, dir: PhraseDir): string | undefined;
  /** a translation in `lang` (`en` included, if the sidecar carries it) */
  translated(edgeType: string, dir: PhraseDir, lang: string): string | undefined;
}

export interface Phrase {
  text: string;
  /** which rung of the chain answered — for the report and the test */
  from: "locale" | "en" | "fallback";
}

/** A menu entry's link direction → the phrase's. `in` is new → X: the new node
 *  is the SOURCE. `out` is X → new: the new node is the target. */
export function phraseDirFor(linkDir: "in" | "out"): PhraseDir {
  return linkDir === "in" ? "as_source" : "as_target";
}

const usable = (s: unknown): s is string =>
  typeof s === "string" && s.includes("{node}") && s.includes("{x}");

const fill = (s: string, v: { node: string; x: string }): string =>
  s.replace(/\{node\}/g, v.node).replace(/\{x\}/g, v.x);

/** The phrase of `edgeType` in direction `dir`, in `lang`, filled. */
export function linkedPhrase(
  book: PhraseBook,
  edgeType: string,
  dir: PhraseDir,
  lang: string,
  vars: { node: string; x: string },
  fallback: string,
): Phrase {
  if (lang !== "en") {
    const loc = book.translated(edgeType, dir, lang);
    if (usable(loc)) return { text: fill(loc, vars), from: "locale" };
  }
  const en = book.translated(edgeType, dir, "en") ?? book.canonical(edgeType, dir);
  if (usable(en)) return { text: fill(en, vars), from: lang === "en" ? "locale" : "en" };
  return { text: fallback, from: "fallback" };
}

type Dict = Record<string, unknown>;
const obj = (v: unknown): Dict | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : undefined;

/**
 * The book over the vendored datamodels.
 *
 * The canonical phrase: `edge_types[e].ui_phrase[dir]`. The translations: the
 * sidecar keys an entry by name with a field per language (`label.it`), so an
 * edge's phrase is read from `entries[e]` or `edge_types[e]`, as either
 * `ui_phrase[dir][lang]` or `ui_phrase_<dir>[lang]`. Which of them s3Dgraphy
 * writes is settled when its MICRO lands and `sync-datamodels.sh` runs; the
 * test pins the reading, not the guess.
 */
export function datamodelPhraseBook(connections: unknown, translations: unknown): PhraseBook {
  const edges = obj(obj(connections)?.edge_types) ?? {};
  const tr = obj(translations) ?? {};
  const pools = [obj(tr.edge_types), obj(tr.entries), obj(tr.ui_phrases)].filter(Boolean) as Dict[];
  return {
    canonical(e, dir) {
      const v = obj(obj(edges[e])?.ui_phrase)?.[dir];
      return typeof v === "string" ? v : undefined;
    },
    translated(e, dir, lang) {
      for (const pool of pools) {
        const entry = obj(pool[e]);
        if (!entry) continue;
        const v = obj(obj(entry.ui_phrase)?.[dir])?.[lang] ?? obj(entry[`ui_phrase_${dir}`])?.[lang];
        if (typeof v === "string" && v.trim()) return v;
      }
      return undefined;
    },
  };
}
