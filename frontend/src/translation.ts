/**
 * TRADUZIONI · the client reading of `s3dgraphy.translation` (dev26, node
 * datamodel 1.6.20 · connections 1.6.34), same names, same rules — the way
 * `ai-validation.ts` reads `s3dgraphy.ai_validation`.
 *
 *   the ORIGINAL stays a string in its own field, in the language it was born
 *   in: `data.lang` on the node says which, else the study's working language
 *   (`GraphNode.data.language`). A translation never overwrites it.
 *
 *   every TRANSLATION is a node (`TranslationNode`, crm:E33) reached by
 *   `has_translation` (crm:P73), signed by `has_author`, from an edition by
 *   `extracted_from` → the edition's DocumentNode, with
 *   `data.{lang, from_lang, field, text, method, source_digest, review_requested}`.
 *
 * The id is the library's: `uuid5(NS, "translation|node|field|lang|by|method|digest")`
 * with `NS = uuid5(NAMESPACE_URL, …/s3dgraphy/translation)`, so the same
 * translation made here and by s3Dgraphy is the same node. `check-translations`
 * holds the two to one golden written BY s3Dgraphy (`tools/translations_golden.py`).
 *
 * The field vocabulary is the CRDT's (`description`, `data.<key>`). One thing
 * MEASURED and not in the library's docstring: in em.json a PropertyNode carries
 * its value in `description` (what s3Dgraphy's loader puts there too — `data.value`
 * is empty after `load_container`), so a property's value is translated as
 * `description`, and `data.value` would find no text.
 */
import type { DocumentStore } from "./model";
import type { EmDocument, EmEdge, EmNode } from "./types";
import { sha256Hex } from "./sha256";
import { uuid5 } from "./commands";
import { ancestorsOf, nodeTypeForClass } from "./rules";
import { qualiaList, type Qualia } from "./vocab";
import nodeDatamodel from "./assets/s3Dgraphy_node_datamodel.json";
import { needsReview, type ReviewReason } from "./ai-validation";

export const TRANSLATION_TYPE = nodeTypeForClass("TranslationNode") ?? "translation";
export const EDGE_HAS_TRANSLATION = "has_translation";
export const EDGE_HAS_AUTHOR = "has_author";
export const EDGE_FROM_EDITION = "extracted_from";
export const METHODS = ["manual", "ai", "edition"] as const;
export type TranslationMethod = (typeof METHODS)[number];

export const NODE_LANG_KEY = "lang";
export const STUDY_LANG_KEY = "language";
export const UNDETERMINED = "und";

const NAMESPACE_URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
/** `uuid5(NAMESPACE_URL, "https://extendedmatrix.org/s3dgraphy/translation")` */
export const TRANSLATION_NS = uuid5(NAMESPACE_URL, "https://extendedmatrix.org/s3dgraphy/translation");

/** Refused: nothing was written. `code` is what the interface translates. */
export class TranslationError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

const dataOf = (n: EmNode | undefined): Record<string, unknown> =>
  ((n?.data ?? {}) as Record<string, unknown>);
const removed = (x: EmNode | EmEdge): boolean =>
  !!((x as EmEdge).attributes as Record<string, unknown> | undefined)?.removed
  || !!dataOf(x as EmNode).removed;

// ── the language ─────────────────────────────────────────────────────────────

const BCP47 = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$/;

export const isLanguageTag = (v: unknown): v is string =>
  typeof v === "string" && BCP47.test(v.trim());

/** BCP 47 tags compare case-insensitively (`en-GB` is `en-gb`). */
export const sameLanguage = (a: unknown, b: unknown): boolean =>
  typeof a === "string" && typeof b === "string" && !!a && !!b
  && a.trim().toLowerCase() === b.trim().toLowerCase();

/** dev27 (s3Dgraphy `language.NOT_TEXT_LANGUAGE_TYPES`): node types whose
 *  `data.lang` is not the language of their own text — a resource's is the
 *  language of its CONTENT, a translation's its language of arrival — or that
 *  are not texts (the graph-self node, places and shapes). They are not born
 *  with a language, and a resource's does not enter the cascade. */
export const NOT_TEXT_LANGUAGE_TYPES = new Set(["resource", "resource_file", "translation", "graph",
  "annotation_region", "semantic_shape", "geo_position"]);

/** What the node itself declares (`data.lang`), or null. Not a tag → none. A
 *  resource's `data.lang` is its content's (`contentLanguages`), not read here. */
export function nodeLanguage(n: EmNode | undefined): string | null {
  if (n && (n.node_type === "resource" || n.node_type === "resource_file")) return null;
  const v = dataOf(n)[NODE_LANG_KEY];
  return isLanguageTag(v) ? v.trim() : null;
}

/** dev27 · the languages of a resource's CONTENT (`data.lang`: one tag or a
 *  sorted list — «latino e italiano a fronte» = ["it", "la"]); [] if none. */
export function contentLanguages(n: EmNode | undefined): string[] {
  const v = dataOf(n)[NODE_LANG_KEY];
  const all = Array.isArray(v) ? v : [v];
  return all.filter(isLanguageTag).map((t) => (t as string).trim());
}

/** The canonical value for `data.lang` of a resource: one tag as a string,
 *  more as a sorted list without repeats, none as undefined (the key goes) —
 *  s3Dgraphy `set_content_languages`. Throws on a value that is not a tag. */
export function contentLanguagesValue(tags: string[]): string | string[] | undefined {
  for (const t of tags) if (!isLanguageTag(t)) throw new Error(`'${t}' is not a language tag`);
  const uniq = [...new Set(tags.map((t) => t.trim()))].sort();
  return uniq.length === 0 ? undefined : uniq.length === 1 ? uniq[0] : uniq;
}

/** The graph-self node (node_type `graph`). */
export function graphSelf(doc: EmDocument): EmNode | undefined {
  const nt = nodeTypeForClass("GraphNode") ?? "graph";
  return doc.graph.nodes.find((n) => n.node_type === nt);
}

/** The study's working language: the graph-self node, then the legacy
 *  `graph.data.language` — the library's precedence. */
export function workingLanguage(doc: EmDocument): string | null {
  const own = dataOf(graphSelf(doc))[STUDY_LANG_KEY];
  if (typeof own === "string" && own.trim()) return own.trim();
  const legacy = ((doc.graph as Record<string, unknown>).data as Record<string, unknown> | undefined)?.[STUDY_LANG_KEY];
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  return null;
}

/** The language of the node's text, and where it comes from. */
export function originalLanguage(doc: EmDocument, n: EmNode | undefined):
  { lang: string | null; from: "node" | "study" | null } {
  const own = nodeLanguage(n);
  if (own) return { lang: own, from: "node" };
  const study = workingLanguage(doc);
  return study ? { lang: study, from: "study" } : { lang: null, from: null };
}

// ── the field ────────────────────────────────────────────────────────────────

/** The CRDT spelling of a translated field. `value` → `data.value`; `name` and
 *  anything that is not `description` / `data.<key>` are refused. */
export function normalizeField(field: string): string {
  let f = (field ?? "").trim();
  if (f === "value") f = "data.value";
  if (f === "name")
    throw new TranslationError("name", "the name is never translated: names are invariant identities");
  if (f !== "description" && !(f.startsWith("data.") && f.length > 5))
    throw new TranslationError("field", `${JSON.stringify(field)} is not a translatable field`);
  return f;
}

/** The current text of `field` on the node (the original), or null. */
export function fieldText(n: EmNode | undefined, field: string): string | null {
  if (!n) return null;
  const f = normalizeField(field);
  let v: unknown = f === "description" ? n.description : dataOf(n)[f.slice(5)];
  if (v === undefined && f !== "description") v = (n as Record<string, unknown>)[f.slice(5)];
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    v = o.default ?? Object.values(o)[0];
  }
  return typeof v === "string" ? v : null;
}

/** `sha256:<hex>` of a text, NFC + UTF-8 — the library's `text_digest`. */
export const textDigest = (text: string): string =>
  `sha256:${sha256Hex((text ?? "").normalize("NFC"))}`;

const NODE_TYPES = ((nodeDatamodel as { node_types?: Record<string, unknown> }).node_types ?? {}) as
  Record<string, { properties?: Record<string, unknown> }>;
/** the class entries of every section, by class name (node_types holds only Node) */
const CLASS_INDEX: Record<string, { properties?: Record<string, unknown> }> = (() => {
  const out: Record<string, { properties?: Record<string, unknown> }> = { ...NODE_TYPES };
  for (const [sec, body] of Object.entries(nodeDatamodel as Record<string, unknown>)) {
    if (sec === "node_types" || !body || typeof body !== "object" || Array.isArray(body)) continue;
    for (const [k, v] of Object.entries(body as Record<string, unknown>))
      if (v && typeof v === "object" && !Array.isArray(v) && "class" in (v as object))
        out[k] = v as { properties?: Record<string, unknown> };
  }
  return out;
})();

/**
 * Is this field of this node TEXT IN A NATURAL LANGUAGE? Read from the MARKER
 * (`natural_language: true`), never from a list: the first class in the node's
 * ancestry whose `properties.<prop>` is an object carrying the marker answers
 * (node datamodel 1.6.19 marks `Node.properties.description`, every class
 * inherits it) — `rdf_exporter._Datamodel.is_natural_language`, read here.
 * `name` is marked nowhere. The translation node itself is not translated.
 */
export function isNaturalLanguage(n: EmNode | undefined, field: string): boolean {
  if (!n || n.node_type === TRANSLATION_TYPE) return false;
  let f: string;
  try { f = normalizeField(field); } catch { return false; }
  const prop = f === "description" ? "description" : f.slice(5);
  if (prop === "value" && n.node_type === "property") {
    return qualeOf(n)?.naturalLanguage === true;
  }
  for (const cls of ancestorsOf(n.node_type)) {
    const rule = CLASS_INDEX[cls]?.properties?.[prop];
    if (rule && typeof rule === "object" && "natural_language" in (rule as object))
      return (rule as Record<string, unknown>).natural_language === true;
  }
  return false;
}

/** The text fields of a node the language row is drawn under. Today the marker
 *  sits on `description` alone (and on the value of six qualia, which in em.json
 *  IS the description). */
export function naturalFields(n: EmNode | undefined): string[] {
  return isNaturalLanguage(n, "description") ? ["description"] : [];
}

/** The quale a PropertyNode names, as the exporter resolves it (exact, last
 *  dotted segment, lowercase), or null. */
export function qualeOf(n: EmNode): Qualia | null {
  const d = dataOf(n);
  let pt = String(d.property_type ?? "");
  if (!pt || pt.toLowerCase() === "string") pt = String(n.name ?? "");
  if (!pt) return null;
  const tail = pt.split(".").pop() ?? pt;
  const all = qualiaList();
  for (const key of [pt, tail, pt.toLowerCase(), tail.toLowerCase()]) {
    const q = all.find((x) => x.id === key);
    if (q) return q;
  }
  return null;
}

/**
 * A property whose value comes from a controlled vocabulary and is NOT
 * reconciled (no `authority_refs` with `match: exact`): its label keeps its own
 * language, and a translation by hand is a BRIDGE that is withdrawn when it is
 * reconciled (the decision, «I campi da vocabolario ingeriti a mano»).
 */
export function unreconciledVocabulary(n: EmNode | undefined): boolean {
  if (!n || n.node_type !== "property") return false;
  const q = qualeOf(n);
  if (!q || q.dataType !== "controlled_vocabulary") return false;
  const refs = dataOf(n).authority_refs;
  return !(Array.isArray(refs) && refs.some((r) =>
    r && typeof r === "object" && (r as Record<string, unknown>).match === "exact"));
}

// ── the translations ─────────────────────────────────────────────────────────

const byId = (doc: EmDocument): Map<string, EmNode> => new Map(doc.graph.nodes.map((n) => [n.id, n]));

/** The TranslationNodes of a node (optionally of one field), by language then
 *  id — `api.translations(graph, node, field)`. */
export function translationsOf(doc: EmDocument, nodeId: string, field?: string): EmNode[] {
  const want = field ? normalizeField(field) : null;
  const nodes = byId(doc);
  const out: EmNode[] = [];
  for (const e of doc.graph.edges) {
    if (e.edge_type !== EDGE_HAS_TRANSLATION || e.source !== nodeId || removed(e)) continue;
    const t = nodes.get(e.target);
    if (!t || t.node_type !== TRANSLATION_TYPE || removed(t)) continue;
    if (want && dataOf(t).field !== want) continue;
    out.push(t);
  }
  return out.sort((a, b) => String(dataOf(a).lang ?? "").localeCompare(String(dataOf(b).lang ?? ""))
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The node a translation translates. */
export function originalOf(doc: EmDocument, t: EmNode | string): EmNode | undefined {
  const tid = typeof t === "string" ? t : t.id;
  const e = doc.graph.edges.find((x) => x.edge_type === EDGE_HAS_TRANSLATION && x.target === tid && !removed(x));
  return e ? doc.graph.nodes.find((n) => n.id === e.source) : undefined;
}

/** «Da riallineare»: the original is no longer the text that was translated.
 *  False when it cannot be told (no digest, no original): a measured fact. */
export function isStale(doc: EmDocument, t: EmNode): boolean {
  const d = dataOf(t);
  const digest = d.source_digest;
  if (!digest) return false;
  const original = originalOf(doc, t);
  if (!original) return false;
  let current: string | null;
  try { current = fieldText(original, String(d.field ?? "")); } catch { return false; }
  if (current === null) return true;
  return textDigest(current) !== digest;
}

export const reviewRequested = (n: EmNode | undefined): boolean => dataOf(n).review_requested === true;

/** The edition a translation was taken from (`extracted_from` → DocumentNode). */
export function editionOf(doc: EmDocument, t: EmNode): EmNode | undefined {
  const e = doc.graph.edges.find((x) => x.source === t.id && x.edge_type === EDGE_FROM_EDITION && !removed(x));
  return e ? doc.graph.nodes.find((n) => n.id === e.target) : undefined;
}

/** Who translated (`has_author` → AuthorNode / AuthorAINode). */
export function translatorsOf(doc: EmDocument, t: EmNode): EmNode[] {
  const nodes = byId(doc);
  return doc.graph.edges
    .filter((x) => x.source === t.id && x.edge_type === EDGE_HAS_AUTHOR && !removed(x))
    .map((x) => nodes.get(x.target)).filter((x): x is EmNode => !!x);
}

// ── the text in a language ───────────────────────────────────────────────────

export interface TextIn {
  text: string | null;
  lang: string | null;
  /** true: this is the original (already in `lang`, or nothing in `lang` exists) */
  original: boolean;
  translation: string | null;
  /** what the translation shown still waits for (`[]` = nothing) */
  reasons: ReviewReason[];
}

/**
 * The text of `field` in `lang`, and which one it is — `api.text(graph, node,
 * field, lang)`: the original when it is already in `lang` or when no
 * translation in `lang` exists; otherwise the translation that waits for the
 * fewest things (verified before waiting, aligned before stale), then by id.
 */
export function textIn(doc: EmDocument, nodeId: string, field: string, lang: string): TextIn {
  const node = doc.graph.nodes.find((n) => n.id === nodeId);
  const f = normalizeField(field);
  const originalLang = nodeLanguage(node) || workingLanguage(doc);
  const orig: TextIn = { text: fieldText(node, f), lang: originalLang, original: true, translation: null, reasons: [] };
  if (originalLang && sameLanguage(originalLang, lang)) return orig;
  const candidates = translationsOf(doc, nodeId, f).filter((t) => sameLanguage(dataOf(t).lang, lang));
  if (!candidates.length) return orig;
  const ranked = candidates.map((t) => ({ t, r: needsReview(doc, t.id) }))
    .sort((a, b) => a.r.length - b.r.length || (a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0));
  const best = ranked[0];
  return { text: (dataOf(best.t).text as string) ?? null, lang: (dataOf(best.t).lang as string) ?? null,
           original: false, translation: best.t.id, reasons: best.r };
}

/** The state of one translation, for its pill: ✓ verified · ◐ to review ·
 *  ✦ AI to verify · ↻ to realign (stale wins: no signature closes it). */
export type TranslationState = "verified" | "review" | "ai" | "stale" | "plain";
export function translationState(doc: EmDocument, t: EmNode): TranslationState {
  const r = needsReview(doc, t.id);
  if (r.includes("stale")) return "stale";
  if (r.includes("ai")) return "ai";
  if (r.includes("review_requested")) return "review";
  return dataOf(t).validated_by ? "verified" : "plain";
}

// ── adding one ───────────────────────────────────────────────────────────────

export interface AddTranslationOptions {
  /** the AuthorNode who translated — for an AI translation, the person who accepted it */
  by: string;
  method?: TranslationMethod;
  /** the DocumentNode of the edition (method `edition`) */
  edition?: string;
  /** «da rivedere» — for an AI translation the library leaves it to the marker */
  review?: boolean;
  /** the AuthorAINode that helped (method `ai`) */
  ai?: string;
  model?: string;
  /** the original's language when neither the node nor the study declares one */
  fromLang?: string;
}

/**
 * Every refusal of `addTranslation` that does not depend on WHO translates —
 * so an interface can ask before it creates the translator's AuthorNode (a
 * refusal after it would leave the author behind). Returns what the
 * translation will be made of.
 */
export function checkTranslation(doc: EmDocument, nodeId: string, field: string, lang: string, text: string,
                                 opts: { method?: TranslationMethod; edition?: string; fromLang?: string } = {}):
  { node: EmNode; field: string; target: string; source: string; original: string; method: TranslationMethod; edition?: EmNode } {
  const node = doc.graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new TranslationError("node", `no node ${nodeId}`);
  const f = normalizeField(field);
  const method = opts.method ?? "manual";
  if (!METHODS.includes(method)) throw new TranslationError("method", `method must be one of ${METHODS.join(", ")}`);
  if (!isLanguageTag(lang)) throw new TranslationError("lang", `${JSON.stringify(lang)} is not a language tag`);
  const target = lang.trim();
  const original = fieldText(node, f);
  if (!original) throw new TranslationError("empty-original", `${node.name ?? nodeId} has no text in ${f}`);
  if (typeof text !== "string" || !text.trim()) throw new TranslationError("empty", "the translation is empty");
  const source = opts.fromLang || nodeLanguage(node) || workingLanguage(doc);
  if (!source) throw new TranslationError("no-source-lang", "the language of the original is not declared");
  if (!isLanguageTag(source)) throw new TranslationError("lang", `${JSON.stringify(source)} is not a language tag`);
  if (sameLanguage(source, target)) throw new TranslationError("same-lang", `the original is already in ${target}`);
  let edition: EmNode | undefined;
  if (method === "edition") {
    if (!opts.edition) throw new TranslationError("edition", "a translation from an edition names its DocumentNode");
    edition = doc.graph.nodes.find((n) => n.id === opts.edition);
    if (!edition || edition.node_type !== "document") throw new TranslationError("edition", `${opts.edition} is not a DocumentNode`);
  } else if (opts.edition) throw new TranslationError("edition", `edition is for method 'edition'; this translation is ${method}`);
  return { node, field: f, target, source: source.trim(), original, method, edition };
}

/**
 * Translate `field` of `nodeId` into `lang` — `api.add_translation`, one undo
 * step. Returns the TranslationNode id (the one already there for the same
 * translation: the id is derived from what it is). Refused with a
 * `TranslationError`, nothing written: `name`, an empty original or translation,
 * an invalid tag, a translation into the original's language, an unknown
 * author, an AI translation without its AuthorAINode, an edition that is not a
 * DocumentNode.
 */
export function addTranslation(store: DocumentStore, nodeId: string, field: string, lang: string,
                               text: string, opts: AddTranslationOptions,
                               markAi?: (store: DocumentStore, id: string, m: { by: string; model?: string }) => void): string {
  const { node, field: f, target, source, original, method, edition } =
    checkTranslation(store.doc, nodeId, field, lang, text, opts);
  const author = store.node(opts.by);
  if (!author || (author.node_type !== "author" && author.node_type !== "author_ai"))
    throw new TranslationError("author", `${opts.by} is not an AuthorNode of this graph`);
  let aiId: string | null = null;
  if (method === "ai") {
    aiId = opts.ai ?? (author.node_type === "author_ai" ? author.id : null);
    if (!aiId) throw new TranslationError("ai", "an AI translation names the AuthorAINode that made it");
    if (store.node(aiId)?.node_type !== "author_ai") throw new TranslationError("ai", `${aiId} is not an AuthorAINode`);
  } else if (opts.ai) throw new TranslationError("ai", `ai is for method 'ai'; this translation is ${method}`);
  const digest = textDigest(original);
  const tid = uuid5(TRANSLATION_NS, `translation|${node.id}|${f}|${target}|${opts.by}|${method}|${digest}`);
  if (store.node(tid)) return tid;
  store.batch(() => {
    store.addNode({
      id: tid, node_type: TRANSLATION_TYPE, name: `${node.name ?? node.id}@${target}`, description: "",
      // `review_requested` only when asked — the library writes nothing otherwise
      data: { lang: target, from_lang: source, field: f, text, method,
              source_digest: digest, ...(opts.review ? { review_requested: true } : {}) },
    } as EmNode);
    store.addEdge(node.id, tid, EDGE_HAS_TRANSLATION);
    store.addEdge(tid, opts.by, EDGE_HAS_AUTHOR);
    if (edition) store.addEdge(tid, edition.id, EDGE_FROM_EDITION);
    if (aiId && markAi) markAi(store, tid, { by: aiId, model: opts.model });
  });
  return tid;
}

/**
 * Change a translation's text, or bring it back in line with the original —
 * the ONLY act that closes «da riallineare» (no signature does). The node stays
 * (its id is the first version's), its digest becomes the original's of today,
 * and a verification is dropped: it was a signature on another text. NOT in
 * s3Dgraphy's api (dev26 has no update of a translation): said in the report.
 */
export function updateTranslation(store: DocumentStore, tid: string, text: string,
                                  opts: { review?: boolean; by?: string } = {}): void {
  const t = store.node(tid);
  if (!t || t.node_type !== TRANSLATION_TYPE) throw new TranslationError("node", `${tid} is not a translation`);
  if (!text.trim()) throw new TranslationError("empty", "the translation is empty");
  const original = originalOf(store.doc, t);
  const now = original ? fieldText(original, String(dataOf(t).field ?? "")) : null;
  if (!now) throw new TranslationError("empty-original", "the original has no text any more");
  const d = { ...dataOf(t) };
  const changed = d.text !== text || d.source_digest !== textDigest(now);
  d.text = text;
  d.source_digest = textDigest(now);
  const from = original ? (nodeLanguage(original) || workingLanguage(store.doc)) : null;
  if (from) d.from_lang = from;
  if (opts.review === true) d.review_requested = true;
  else if (opts.review === false) delete d.review_requested;
  if (changed) { delete d.validated_by; delete d.validated_at; }
  store.batch(() => {
    store.updateNode(tid, { data: d });
    if (opts.by && !store.hasEdge(tid, opts.by, EDGE_HAS_AUTHOR)) store.addEdge(tid, opts.by, EDGE_HAS_AUTHOR);
  });
}

/** Declare the language of a node's original (`data.lang`), one undo step.
 *  `null` withdraws it (the cascade goes back to the study). */
export function declareNodeLanguage(store: DocumentStore, nodeId: string, lang: string | null): void {
  const n = store.node(nodeId);
  if (!n) return;
  if (lang !== null && !isLanguageTag(lang)) throw new TranslationError("lang", `${JSON.stringify(lang)} is not a language tag`);
  if (lang === null) { if (NODE_LANG_KEY in dataOf(n)) store.clearField(nodeId, `data.${NODE_LANG_KEY}`); return; }
  store.updateNode(nodeId, { data: { ...dataOf(n), [NODE_LANG_KEY]: lang.trim() } });
}

/** Declare the study's working language on the graph-self node. */
export function declareStudyLanguage(store: DocumentStore, lang: string): void {
  if (!isLanguageTag(lang)) throw new TranslationError("lang", `${JSON.stringify(lang)} is not a language tag`);
  const id = store.ensureGraphRootId();
  const n = store.node(id)!;
  store.updateNode(id, { data: { ...dataOf(n), [STUDY_LANG_KEY]: lang.trim() } });
}

// ── the languages an interface offers ────────────────────────────────────────

/** A short list to choose from; any BCP 47 tag can be typed beside it. */
export const COMMON_LANGUAGES = ["it", "en", "la", "ro", "fr", "de", "es", "el", "grc", "he", "ar", "und"];

/** The language's name in the interface language, from the platform. */
export function languageName(tag: string, uiLocale: string): string {
  if (tag === UNDETERMINED) return uiLocale.startsWith("it") ? "sconosciuta" : "unknown";
  try {
    const dn = new Intl.DisplayNames([uiLocale], { type: "language" });
    return dn.of(tag) ?? tag;
  } catch { return tag; }
}
