// Controlled vocabularies from the s3Dgraphy datamodels (em_qualia_types.json).
// EMStudio never hardcodes EM terms — the qualia catalogue is vendored and read
// here so the "create property" flow can offer a real, searchable vocabulary
// (e.g. absolute_time_start), each term carrying its rationale + example.
import raw from "./assets/em_qualia_types.json";

export interface Qualia {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  /** The category's own gloss from the vocabulary — what the whole family is
   *  for. Used as the tooltip of the section header, which had none. */
  categoryDescription?: string;
  subcategory: string;
  subcategoryLabel: string;
  subcategoryDescription?: string;
  description?: string;
  rationale?: string;
  example?: string;
  dataType?: string;
  units?: string[];
  values?: string[];
  /** Authority mappings (Getty AAT, CIDOC-CRM, Dublin Core). Present on most
   *  terms and previously unread; for a term with no prose they are the only
   *  thing the vocabulary can say, and saying it beats saying nothing. */
  mappings?: Record<string, string>;
  expectedExtractors?: string[];
  /** qualia 1.6.4 · the value is TEXT IN A NATURAL LANGUAGE (it leaves in RDF
   *  with its language tag, and can be translated) — the datamodel's marker */
  naturalLanguage?: boolean;
}

interface RawQ {
  id: string;
  name: string;
  description?: string;
  rationale?: string;
  example?: string;
  data_type?: string;
  units?: string[];
  values?: string[];
  mappings?: Record<string, string>;
  expected_extractors?: string[];
  natural_language?: boolean;
}
interface RawSub {
  name?: string;
  description?: string;
  qualia?: RawQ[];
}
interface RawCat {
  id: string;
  name?: string;
  description?: string;
  subcategories?: Record<string, RawSub>;
}

const doc = raw as unknown as {
  metadata?: { version?: string };
  qualia_categories?: RawCat[];
};

export const QUALIA_VERSION = doc.metadata?.version ?? "?";

const list: Qualia[] = [];
for (const c of doc.qualia_categories ?? []) {
  for (const [sk, sv] of Object.entries(c.subcategories ?? {})) {
    for (const q of sv.qualia ?? []) {
      list.push({
        id: q.id,
        name: q.name,
        category: c.id,
        categoryLabel: c.name ?? c.id,
        categoryDescription: c.description,
        subcategory: sk,
        subcategoryLabel: sv.name ?? sk,
        subcategoryDescription: sv.description,
        description: q.description,
        rationale: q.rationale,
        example: q.example,
        dataType: q.data_type,
        units: q.units,
        values: q.values,
        mappings: q.mappings,
        expectedExtractors: q.expected_extractors,
        naturalLanguage: q.natural_language === true,
      });
    }
  }
}

export function qualiaList(): Qualia[] {
  return list;
}

/** The controlled vocabulary backing a node type, or null if it has none.
 *  Today only PropertyNode is vocabulary-backed (qualia). */
export function vocabularyFor(nodeType: string | undefined): Qualia[] | null {
  return nodeType === "property" ? list : null;
}
