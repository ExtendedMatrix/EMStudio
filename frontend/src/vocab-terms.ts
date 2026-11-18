/**
 * MICRO-U-VOCABOLARI-COME-FONT (E.D., 18 Nov 2026) · the DOUBLE VALUE of a
 * controlled field, the twin of `s3dgraphy.terms`, field for field.
 *
 * A value taken from a vocabulary is kept twice: the CODE of the term (its URI,
 * the identity) and the LABEL written when it was entered, with its language,
 * the vocabulary and its version. On a PropertyNode it lives in `data.concept`
 * (node datamodel 1.6.48 `PropertyNode.properties.concept`, widened):
 *
 *   "data": { "value": "calcare",
 *             "concept": { "concept": "<uri>", "label": "calcare", "lang": "it",
 *                          "vocabulary": "iccd-ra-materia", "version": "2018-09" } }
 *
 * `value` (and its mirror `description`) stays the WORD. A field is CONTROLLED
 * when its quale (em_qualia_types: the name, or the quale `property_names`
 * gives it) is a `controlled_vocabulary` with an external `vocabulary_source`.
 * A text value there is valid and said «not controlled».
 *
 * The em.json DECLARES the vocabularies its values use (`vocabularies`, like a
 * document's fonts); a copy of the terms used may travel inside, off by
 * default, only for tiers A and B (`declareVocabularies`).
 *
 * Pure: the vocabularies installed on the machine are HANDED IN (the bridge
 * reads them, `s3dgraphy.authorities.packages`).
 */
import raw from "./assets/em_qualia_types.json";
import { canonical } from "./presentation";

export const TERM_KEY = "concept";
export const VOCABULARIES_KEY = "vocabularies";
export const RULE_UNCONTROLLED = "uncontrolled";
export const RULE_MISSING = "vocabmissing";

export interface Term {
  concept: string;
  label: string;
  lang: string;
  vocabulary?: string;
  version?: string;
}

/** one installed vocabulary, as `packages.vocab_installed` says it */
export interface VocabSummary {
  id: string;
  version?: string;
  snapshot_date?: string;
  title?: Record<string, string>;
  languages?: string[];
  license?: string;
  license_url?: string | null;
  tier?: "A" | "B" | "C";
  attribution?: string;
  serves?: string[];
  scheme?: string | null;
  homepage?: string | null;
  status?: "ready" | "stub" | "broken";
  local_copy?: boolean;
  installed_from?: string | null;
  problem?: string;
}

/** a concept of an index: labels per language */
export interface ConceptEntry {
  pref: Record<string, string>;
  alt?: Record<string, string[]>;
  broader?: string[];
}

export interface VocabSection {
  used: Record<string, Record<string, unknown>>;
  embed?: boolean;
}

interface NodeLike {
  id?: string;
  node_type?: string;
  name?: unknown;
  description?: unknown;
  data?: Record<string, unknown> | null;
}

// ── the controlled fields ───────────────────────────────────────────────────

interface RawQuale { id?: string; data_type?: string; vocabulary_source?: string; vocabulary_category?: string }
const QUALIA = new Map<string, RawQuale>();
const ALIASES = new Map<string, string>();
(function load(): void {
  const doc = raw as unknown as { qualia_categories?: unknown; property_names?: Record<string, { quale?: string }> };
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) { for (const v of o) walk(v); return; }
    if (!o || typeof o !== "object") return;
    const r = o as Record<string, unknown>;
    if (typeof r.id === "string" && typeof r.data_type === "string") QUALIA.set(r.id.toLowerCase(), r as RawQuale);
    for (const v of Object.values(r)) walk(v);
  };
  walk(doc.qualia_categories);
  for (const [k, v] of Object.entries(doc.property_names ?? {}))
    if (v && typeof v === "object" && v.quale) ALIASES.set(k.toLowerCase(), String(v.quale).toLowerCase());
})();

/** the quale id a property name stands for (`Material` → `material_type`) */
export function qualeOf(name: unknown): string | null {
  const key = String(name ?? "").trim().toLowerCase();
  if (!key) return null;
  if (QUALIA.has(key)) return key;
  return ALIASES.get(key) ?? null;
}

/** the quale when a property of this name takes its values from an external vocabulary */
export function controlledQuale(name: unknown): RawQuale | null {
  const q = qualeOf(name);
  if (!q) return null;
  const e = QUALIA.get(q);
  if (!e || !String(e.data_type ?? "").startsWith("controlled_vocabulary")) return null;
  if (String(e.vocabulary_source ?? "custom") === "custom") return null;
  return e;
}

function nameOf(n: NodeLike): unknown {
  const pt = n.data?.property_type;
  return n.name || (pt && pt !== "string" ? pt : null);
}

function valueOf(n: NodeLike): string {
  const v = n.data && "value" in n.data ? n.data.value : n.description;
  return v == null || typeof v === "object" ? "" : String(v);
}

export function isControlled(n: NodeLike | undefined): boolean {
  return !!n && n.node_type === "property" && controlledQuale(nameOf(n)) !== null;
}

// ── the term ────────────────────────────────────────────────────────────────

export function makeTerm(concept: string, label: string, lang: string, vocabulary?: string | null,
                         version?: string | null): Term {
  const c = String(concept ?? "").trim();
  if (!/^(https?:\/\/|urn:)/.test(c)) throw new Error(`a term's code is an URI, not «${c}»`);
  const t: Term = { concept: c, label: String(label ?? "").trim(), lang: String(lang ?? "").trim().toLowerCase() };
  if (vocabulary) t.vocabulary = String(vocabulary);
  if (version) t.version = String(version);
  return t;
}

export function termOf(n: NodeLike | undefined): Term | null {
  if (!n) return null;
  const data = n.data ?? {};
  let r = data[TERM_KEY] as unknown;
  if (r == null && data.definition && (typeof data.definition === "object" || typeof data.definition === "string"))
    r = data.definition;
  if (typeof r === "string" && /^(https?:\/\/|urn:)/.test(r.trim())) return { concept: r.trim(), label: "", lang: "" };
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const concept = String(o.concept ?? "").trim();
  if (!concept) return null;
  const t: Term = { concept, label: String(o.label ?? "").trim(), lang: String(o.lang ?? "").trim().toLowerCase() };
  if (o.vocabulary) t.vocabulary = String(o.vocabulary);
  if (o.version) t.version = String(o.version);
  return t;
}

/** the `data` patch that writes a term (the value untouched: the word stays) */
export function termPatch(n: NodeLike, term: Term | null): Record<string, unknown> {
  const data: Record<string, unknown> = { ...(n.data ?? {}) };
  if (term) data[TERM_KEY] = { ...term };
  else delete data[TERM_KEY];
  return data;
}

export function labelIn(c: ConceptEntry | undefined | null, lang: string | null | undefined): [string, string] | null {
  if (!c || !lang) return null;
  const pref = c.pref ?? {};
  const l = lang.toLowerCase();
  if (pref[l]) return [pref[l], l];
  const base = l.split("-")[0];
  for (const k of Object.keys(pref).sort()) if (k.split("-")[0] === base) return [pref[k], k];
  return null;
}

export interface ValueLabel {
  text: string;
  lang: string | null;
  from: "vocabulary" | "stored" | "text";
  concept: string | null;
  missingVocabulary: boolean;
  vocabulary: string | null;
  attribution: string | null;
}

/** What to SHOW for a value in `lang`: the installed vocabulary's label in that
 *  language (or the copy in the file), else the label saved, and the sign
 *  «vocabulary missing» when neither is here. `lookup(uri)` gives the concept
 *  and its vocabulary when it is installed (the bridge's answer, cached). */
export function valueLabel(n: NodeLike, lang: string | null,
                           lookup: (uri: string) => { concept: ConceptEntry; vocab: VocabSummary } | null,
                           embedded?: VocabSection | null): ValueLabel {
  const value = valueOf(n);
  const term = termOf(n);
  if (!term) return { text: value, lang: null, from: "text", concept: null, missingVocabulary: false,
                      vocabulary: null, attribution: null };
  const stored = term.label || value || term.concept;
  const found = lookup(term.concept);
  let concept: ConceptEntry | null = null;
  let vocab = term.vocabulary ?? null;
  let attribution: string | null = null;
  if (found) { concept = found.concept; vocab = found.vocab.id; attribution = found.vocab.attribution ?? null; }
  else if (embedded) {
    concept = embeddedConcept(embedded, term.concept);
    if (concept && vocab) attribution = String((embedded.used[vocab] ?? {}).attribution ?? "") || null;
  }
  if (concept) {
    const hit = labelIn(concept, lang) ?? labelIn(concept, term.lang);
    if (hit) return { text: hit[0], lang: hit[1], from: "vocabulary", concept: term.concept, missingVocabulary: false,
                      vocabulary: vocab, attribution };
    return { text: stored, lang: term.lang || null, from: "stored", concept: term.concept, missingVocabulary: false,
             vocabulary: vocab, attribution };
  }
  return { text: stored, lang: term.lang || null, from: "stored", concept: term.concept, missingVocabulary: true,
           vocabulary: vocab, attribution: null };
}

// ── warnings ────────────────────────────────────────────────────────────────

export interface VocabRow {
  rule: typeof RULE_UNCONTROLLED | typeof RULE_MISSING;
  node: string;
  name: string;
  value: string;
  quale: string | null;
  vocabulary?: string;
  source?: string;
}

/** «not controlled» (a text in a field that takes a vocabulary's values) and
 *  «vocabulary missing» (a term whose vocabulary is not installed here).
 *  `installed` null = not known (no bridge): no «missing» is said then; a term
 *  whose concept the file carries is not missing either. */
export function vocabularyRows(nodes: NodeLike[], installed: Set<string> | null,
                               embedded?: VocabSection | null): VocabRow[] {
  const out: VocabRow[] = [];
  for (const n of nodes) {
    if (n.node_type !== "property" || !n.id) continue;
    const name = nameOf(n);
    const term = termOf(n);
    const text = valueOf(n).trim();
    if (term) {
      const v = term.vocabulary;
      if (v && installed && !installed.has(v) && !(embedded && embeddedConcept(embedded, term.concept)))
        out.push({ rule: RULE_MISSING, node: n.id, name: String(name ?? ""), value: term.label || text,
                   quale: qualeOf(name), vocabulary: v });
      continue;
    }
    const q = controlledQuale(name);
    if (!q || !text) continue;
    out.push({ rule: RULE_UNCONTROLLED, node: n.id, name: String(name ?? ""), value: text, quale: qualeOf(name),
               source: q.vocabulary_source });
  }
  return out;
}

/** the nodes whose value is the same text, on a field of the same quale, still
 *  without a term — what «all the nodes with this text» touches */
export function sameText(nodes: NodeLike[], n: NodeLike): NodeLike[] {
  const q = qualeOf(nameOf(n));
  const key = valueOf(n).trim().toLowerCase();
  return nodes.filter((x) => x.node_type === "property" && qualeOf(nameOf(x)) === q && !termOf(x)
    && valueOf(x).trim().toLowerCase() === key);
}

// ── the declaration ─────────────────────────────────────────────────────────

const DECLARED_KEYS = ["version", "snapshot_date", "title", "license", "license_url", "tier",
                       "attribution", "scheme", "homepage"] as const;

export function readVocabularies(doc: unknown): VocabSection | null {
  const r = (doc as Record<string, unknown> | null)?.[VOCABULARIES_KEY];
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const used: Record<string, Record<string, unknown>> = {};
  if (o.used && typeof o.used === "object")
    for (const [k, v] of Object.entries(o.used as Record<string, unknown>))
      if (v && typeof v === "object") used[k] = { ...(v as Record<string, unknown>) };
  return o.embed ? { used, embed: true } : { used };
}

export function embeddedConcept(section: VocabSection, uri: string): ConceptEntry | null {
  for (const e of Object.values(section.used ?? {})) {
    const terms = (e as { terms?: Record<string, ConceptEntry> }).terms;
    if (terms && terms[uri]) return terms[uri];
  }
  return null;
}

const empty = (v: unknown): boolean =>
  v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length);

/** The `vocabularies` section for these graphs — the twin of
 *  `s3dgraphy.terms.declare`. `installed` and `concepts` are this machine's (the
 *  bridge's), empty when it is not reachable: the previous declaration then
 *  speaks. Null when no value has a term (nothing is written). */
export function declareVocabularies(graphs: Array<{ nodes: NodeLike[] }>, previous: VocabSection | null,
                                    installed: Map<string, VocabSummary>, concepts: Map<string, ConceptEntry>,
                                    embed?: boolean): VocabSection | null {
  const used = new Map<string, { versions: Set<string>; concepts: Set<string> }>();
  for (const g of graphs) for (const n of g.nodes ?? []) {
    const t = termOf(n);
    if (!t || !t.vocabulary) continue;
    const slot = used.get(t.vocabulary) ?? used.set(t.vocabulary, { versions: new Set(), concepts: new Set() }).get(t.vocabulary)!;
    if (t.version) slot.versions.add(t.version);
    slot.concepts.add(t.concept);
  }
  if (!used.size) return null;
  const doEmbed = embed ?? !!previous?.embed;
  const outUsed: Record<string, Record<string, unknown>> = {};
  for (const vid of [...used.keys()].sort()) {
    const info = used.get(vid)!;
    const before = (previous?.used ?? {})[vid] ?? {};
    const src = (installed.get(vid) ?? {}) as Record<string, unknown>;
    const entry: Record<string, unknown> = {};
    for (const k of DECLARED_KEYS) {
      const v = !empty(src[k]) ? src[k] : before[k];
      if (!empty(v)) entry[k] = v;
    }
    entry.versions_used = [...info.versions].sort();
    entry.concepts_used = info.concepts.size;
    if (doEmbed) {
      const tier = entry.tier as string | undefined;
      if (tier === "A" || tier === "B") {
        const old = (before.terms && typeof before.terms === "object" ? before.terms : {}) as Record<string, ConceptEntry>;
        const terms: Record<string, ConceptEntry> = {};
        for (const uri of [...info.concepts].sort()) {
          const c = (installed.get(vid)?.status === "ready" ? concepts.get(uri) : undefined) ?? old[uri];
          if (!c) continue;
          const keep: ConceptEntry = { pref: c.pref };
          if (c.alt && Object.keys(c.alt).length) keep.alt = c.alt;
          if (c.broader && c.broader.length) keep.broader = c.broader;
          terms[uri] = keep;
        }
        entry.terms = terms;
      } else {
        entry.embedded = false;
        entry.not_embedded_because = `tier ${tier || "unknown"}: the licence does not let its terms travel in a file`;
      }
    }
    outUsed[vid] = entry;
  }
  const out: VocabSection = { used: outUsed };
  if (doEmbed) out.embed = true;
  return canonical(out);
}
