// DEV30 U5 · recognising the language of a text — assisted CLEANING of the
// data, and nothing more.
//
// E.D.'s decision (2 Oct 2026): the language EMStudio recognises is proposed,
// confirmed by a person with one gesture, and written ONLY as `data.lang`. No
// `ai_assisted`, no entry in the graph's register: it is the explicit exception
// to the AI marker, because the language of a text is checkable by anyone who
// reads it, and it says nothing about how the text was made. s3Dgraphy writes
// the same rule in `s3dgraphy.language.confirm_recognised_language`.
//
// The recogniser is deliberately small and LOCAL (no model, no network): the
// function words of each language, a few spellings that belong to one language,
// and how words end. It answers only when one language clearly leads; a text too
// short to say (one word: «Campanile») is given the language most of the
// graph's recognised texts have, and the proposal says that it is so.
//
// Not an EM vocabulary (invariant 1 is about EM concepts): these are features
// of natural languages, used to propose, never to decide.

export type Guess = { tag: string; score: number; margin: number };

const STOP: Record<string, string[]> = {
  it: ["il", "lo", "la", "i", "gli", "le", "un", "una", "di", "del", "della", "dei", "delle", "degli", "e", "ed", "in", "nel", "nella", "con", "per", "su", "sul", "sulla", "da", "dal", "dalla", "che", "come", "non", "è", "sono", "al", "alla", "ai", "tra", "fra", "anche", "più", "suo", "sua", "dello", "negli"], // ALLOW-IT · function words of Italian, the data the recogniser reads (DEV30 U5)
  en: ["the", "of", "and", "a", "an", "in", "on", "with", "for", "to", "from", "by", "is", "are", "was", "were", "that", "this", "it", "its", "at", "as", "or", "be", "made", "i", "which", "into"],
  de: ["der", "die", "das", "und", "ein", "eine", "des", "dem", "den", "mit", "von", "zu", "im", "ist", "nicht", "auf", "für", "aus", "bei", "wird", "sind"],
  fr: ["le", "la", "les", "un", "une", "des", "du", "de", "et", "en", "dans", "avec", "pour", "sur", "par", "est", "sont", "qui", "que", "au", "aux", "ce"],
  es: ["el", "la", "los", "las", "un", "una", "de", "del", "y", "en", "con", "por", "para", "que", "es", "son", "al", "se", "su"],
  la: ["et", "in", "est", "ad", "cum", "de", "ex", "ab", "per", "quod", "qui", "quae", "sunt", "non", "ac", "atque", "sub"],
};
const MARKS: Record<string, RegExp[]> = {
  it: [/zion[ei]$/, /zz/, /cch/, /gli/, /cci/, /ggi/, /ss[oaie]$/, /[aeiou]tt[oaie]$/],
  en: [/th/, /^wh/, /ing$/, /tion$/, /ed$/, /w/, /k/, /ly$/, /ou/],
  de: [/sch/, /[äöüß]/, /ung$/, /ei/, /ie/, /tz/, /cht/],
  fr: [/[éèêàçù]/, /eau/, /aux$/, /tion$/, /ou/, /ais/, /qu/],
  es: [/ñ/, /ción$/, /ll/, /[áéíóú]/],
  la: [/(us|um|ae|orum|arum|ibus)$/, /^qu/],
};

/** Words of a text, lower-case, letters only (accents kept). */
function words(text: string): string[] {
  return text.toLowerCase().normalize("NFC").split(/[^\p{L}']+/u)
    .flatMap((w) => w.split("'")).filter((w) => w.length > 0);
}

/** The language of one text, when one clearly leads; else null. */
export function recogniseLanguage(text: string): Guess | null {
  const ws = words(text);
  if (!ws.length) return null;
  const score: Record<string, number> = {};
  for (const tag of Object.keys(STOP)) score[tag] = 0;
  for (const w of ws) {
    for (const [tag, list] of Object.entries(STOP)) if (list.includes(w)) score[tag] += 2;
    if (w.length < 3) continue;
    for (const [tag, rx] of Object.entries(MARKS)) for (const r of rx) if (r.test(w)) score[tag] += 1;
    // how words end: a vowel is Italian/Spanish/Latin, a consonant English/German
    if (/[aeiouàèéìòù]$/.test(w)) { score.it += 0.6; score.es += 0.3; }
    else if (/[bcdfghklmnprtvwz]$/.test(w)) { score.en += 0.4; score.de += 0.3; }
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  const margin = best[1] - (second?.[1] ?? 0);
  // a lead of at least 1.5 points, and something said in the language
  if (best[1] < 1.5 || margin < 1.5) return null;
  return { tag: best[0], score: best[1], margin };
}

export interface LanguageProposal {
  /** the node */
  id: string;
  /** the language proposed */
  tag: string;
  /** recognised from its own text, or given by the graph's other texts */
  by: "text" | "others";
}

/**
 * The proposals for a set of texts (one per node: its natural-language fields
 * joined). A node whose text says nothing clear gets the language most of the
 * recognised ones have — `by: "others"` — and none when nothing was recognised.
 */
export function proposeLanguages(texts: Array<{ id: string; text: string }>): LanguageProposal[] {
  const out: LanguageProposal[] = [];
  const unsure: string[] = [];
  const count = new Map<string, number>();
  for (const { id, text } of texts) {
    const g = recogniseLanguage(text);
    if (g) { out.push({ id, tag: g.tag, by: "text" }); count.set(g.tag, (count.get(g.tag) ?? 0) + 1); }
    else unsure.push(id);
  }
  const major = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (major) for (const id of unsure) out.push({ id, tag: major, by: "others" });
  return out;
}
