/**
 * MICRO-G-SCHEDE · THE US AS A RECORDING SHEET — EMStudio as a SECOND READER of
 * the definitions of stratigraph-templates (E.D., 17 Nov 2026).
 *
 * EMStudio does not invent a sheet of its own. The definition is the COMPILED
 * form `stratigraph-templates build` produces (`dist/schede/<id>/<version>.json`,
 * SPEC §9), vendored by `scripts/sync-schede.sh` exactly as StratiField vendors
 * it (`stratigraph-chatbot/sync-schede.sh`): the VISUAL half says which boxes,
 * where, with which labels; the RECIPE says what each box is in the graph, in
 * the vocabulary of s3Dgraphy's five operations. This module reads both and
 * nothing else — no ICCD, no Italian, no stratigraphy is written here: every
 * name of a field, of a qualia, of an edge comes from the definition.
 *
 * Three things, each pure (no DOM, no store) so a check in node asks them:
 *
 * 1. THE LAYOUT (`sheetLayout`) — the definition's sheet as a tree of rows and
 *    cells, the same walk `render.sheet_html` does (`_layout`, `_row_html`,
 *    `_cell_html`): a field, a block (labelled or not, rotated or not), a
 *    spacer; widths in % of the row, heights in mm. A definition without a
 *    sheet gives one block per paragraph, as `_layout` does. `check-sheet`
 *    compares this tree with the HTML the Python renders, box by box.
 *
 * 2. THE READING (`readUnit`) — what the sheet shows for a unit of the graph,
 *    by walking the recipe BACKWARDS, the rule StratiField's
 *    `operazioni.values_from_graph` follows (with its LENS: a graph written by
 *    another door carries no mark of the box that wrote it, so a property is
 *    taken by its qualia when no field of this sheet has marked it). What the
 *    definition keeps out of the graph (`none`, an anchor it does not define,
 *    a box two fields share without a mark) is never shown as empty in silence:
 *    every box says what it is (`FieldReading.state`, `.how`).
 *
 * 3. THE EDIT (`planEdit`, `planRefAdd`, `planRefRemove`) — what to do to the
 *    graph when a box changes, as a list of ACTS the page applies in ONE
 *    `store.batch` (one delta, one undo). Same addresses as the recipe:
 *    `description`, `data.definition`, a PropertyNode by `has_property`, an
 *    edge in its canonical direction. A unit is never created and a number
 *    never invented or changed (E.D.): a relation towards a unit that does not
 *    exist is refused with the sentence that says so.
 */

import type { EmEdge, EmNode } from "./types";
import { VENDORED_DEFINITIONS, VENDORED_INDEX, VENDORED_VOCABULARIES } from "./assets/schede/vendored";
import {
  allowedEdgeTypes, canonicalEdgeType, classOf, edgeSpellings, isContinuityType,
  isStratigraphicType, isSymmetricEdgeType, relationKey,
} from "./rules";

// ─────────────────────────────────────────────────────────── the definitions

type Labels = Record<string, string>;
export interface SheetCellDef {
  field?: string | null;
  block?: string | null;
  block_labels?: Labels;
  rows?: SheetRowDef[];
  w?: number;
  label?: string;
  rotated?: boolean;
  style?: string | null;
}
export interface SheetRowDef { h?: number; cells?: SheetCellDef[] }
export interface VisualField {
  id: string;
  paragraph?: string;
  type: string;
  required?: boolean;
  repeatable?: boolean;
  recorded_in?: string;
  labels: Labels;
  help?: Labels;
  options?: Array<{ value: string; labels: Labels }>;
  vocabulary?: { scheme: string; provisional?: string };
  /** SPEC §2.6 (ICCD 4.0.0): the scheme whose term MAY classify the box's
   *  property — DEFINIZIONE's text, its term beside it */
  concept_vocabulary?: { scheme: string; provisional?: string };
  note?: string;
}
export interface RecipeStep { emit: Record<string, unknown>; when?: string }
export interface RecipeEntry {
  verdict: string;
  each?: boolean;
  steps?: RecipeStep[];
  resolve?: Record<string, { find?: Record<string, unknown>; create?: boolean; mint?: boolean; when_missing?: string }>;
  property?: { property_type?: string; per_item_from?: string; box?: string; registered_qualia?: boolean; accepts?: string[];
    /** SPEC §2.6: the box that writes this property's description */
    described_by?: string;
    /** SPEC §2.6: the term on the same node (`from: $value` = a term box) */
    concept?: { scheme?: string; em_json?: string; optional?: boolean; from?: string; provisional?: string } };
  defaults?: Record<string, string>;
  element?: { name: string; value?: string };
  node?: { class?: string; node_type?: string };
  edge?: { symmetric?: boolean; reverse?: string };
  table?: Record<string, { class?: string; node_type?: string }>;
  blocked_on?: { needs: string; reported?: string };
  reason?: string;
  scheme?: string;
  provisional?: string;
  after?: string[];
  /** SPEC §2.4 (3.0.0): what the node carries in `data` to be this box's */
  where?: Record<string, string>;
  /** SPEC §2.4: this box's epoch is a sub-epoch of that box's (FASE of PERIODO) */
  sub_epoch_of?: string;
  /** SPEC §2.4: that box takes the unit's edge when it has a value */
  yields_to?: string;
}
/** SPEC §2.5: an act a box hangs on, DEFINED by the definition. */
export interface AnchorDef {
  declared_by?: string[];
  defined?: boolean;
  node?: { class?: string; node_type?: string };
  where?: Record<string, string>;
  scope?: string;
  steps?: RecipeStep[];
}
export interface CompiledDef {
  header: {
    id: string;
    version: string;
    standard: { authority: string; code: string; version: string; title: Labels; invented?: boolean; license?: string; attribution?: string };
    source_language: string;
    languages: string[];
    digest?: string;
    vocabularies?: Array<{ id: string; status?: string; provisional?: string; provisional_for?: string }>;
  };
  visual: {
    identity: { human_key: string[]; pattern?: string; unit_field?: string };
    paragraphs: Array<{ id: string; labels: Labels; fields: string[] }>;
    fields: VisualField[];
    sheet: { page?: string; margins_mm?: Record<string, number>; sides: Array<{ id: string; labels?: Labels; rows: SheetRowDef[] }> } | null;
    notes?: Record<string, unknown>;
  };
  recipe: {
    fields: Record<string, RecipeEntry>;
    anchors?: Record<string, AnchorDef>;
    open?: Array<{ field: string; what: string }>;
    unit?: { record_status?: { em_json?: string; scheme?: string; values?: string[] } };
  };
}
interface VocabFile {
  scheme: string;
  status?: string;
  provisional?: string;
  provisional_for?: string;
  concepts: Array<{ concept: string; labels: Labels }>;
}

const DEFS: CompiledDef[] = VENDORED_DEFINITIONS as CompiledDef[];
const VOCABS = new Map((VENDORED_VOCABULARIES as VocabFile[]).map((v) => [v.scheme, v]));

/** What `sync-schede.sh` vendored, and from which commit of stratigraph-templates. */
export function vendoredFrom(): { commit?: string } {
  return ((VENDORED_INDEX as { from?: { commit?: string } }).from) ?? {};
}

/** MICRO-PL09 (W6) · the compiled sheets the community packages bring (their
 *  `forms`, stratigraph-templates' compiled form): after the vendored ones,
 *  never in place of one (an id already vendored keeps the vendored). */
const RUNTIME_DEFS: CompiledDef[] = [];
export function setRuntimeDefinitions(defs: CompiledDef[]): void {
  RUNTIME_DEFS.splice(0, RUNTIME_DEFS.length, ...defs.filter((d) => !DEFS.some((v) => v.header.id === d.header.id)));
}

/** Every vendored definition, the one per id this copy holds (its latest), then the packages'. */
export function definitions(): CompiledDef[] {
  return RUNTIME_DEFS.length ? [...DEFS, ...RUNTIME_DEFS] : DEFS;
}

/** The definition a study uses when it says none (MICRO-G p.2: the default for
 *  the v10 is ICCD US 2021). A constant of the APP, not of the module: the
 *  module reads whatever definition it is given. */
export const DEFAULT_SHEET = "iccd-us-2021";

/** Where the study's choice is kept: the graph-self node (`node_type` graph),
 *  `data.sheet_template = {id, version}` — beside `data.language`, the study's
 *  working language, which is where EMStudio keeps the other preferences of the
 *  study that travel with the document (translation.ts `STUDY_LANG_KEY`). */
export const STUDY_SHEET_KEY = "sheet_template";

export interface SheetChoice { id: string; version: string | null; declared: boolean }

export function studySheetChoice(graphSelfData: Record<string, unknown> | undefined): SheetChoice {
  const raw = graphSelfData?.[STUDY_SHEET_KEY];
  if (typeof raw === "string" && raw.trim()) return { id: raw.trim(), version: null, declared: true };
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.id === "string" && o.id.trim())
      return { id: o.id.trim(), version: typeof o.version === "string" ? o.version : null, declared: true };
  }
  return { id: DEFAULT_SHEET, version: null, declared: false };
}

/** The vendored definition for a choice, and what to SAY when it is not the
 *  one asked: an id not vendored (null), a version this copy does not hold. */
export function resolveDefinition(choice: SheetChoice):
  { def: CompiledDef | null; versionDiffers: string | null } {
  const def = DEFS.find((d) => d.header.id === choice.id) ?? RUNTIME_DEFS.find((d) => d.header.id === choice.id) ?? null;
  return { def, versionDiffers: def && choice.version && choice.version !== def.header.version ? choice.version : null };
}

/** The language the sheet is drawn in: the interface's if the DEFINITION
 *  declares it, else the definition's own (SPEC §1.5: no label is translated by
 *  us, and a language the definition does not speak is not asked of it). */
export function sheetLanguage(def: CompiledDef, uiLang: string): string {
  return def.header.languages.includes(uiLang) ? uiLang : def.header.source_language;
}

export function labelIn(labels: Labels | undefined, lang: string): string {
  return (labels && labels[lang]) || "";
}

export function visualField(def: CompiledDef, fid: string): VisualField | undefined {
  return def.visual.fields.find((f) => f.id === fid);
}

// ─────────────────────────────────────────────────────────── 1 · the layout

export type LayoutCell =
  | { kind: "field"; field: string; w: number; label: string | null; required: boolean; type: string; style: string | null }
  | { kind: "block"; w: number; label: string | null; rotated: boolean; rows: LayoutRow[] }
  | { kind: "spacer"; w: number };
export interface LayoutRow { h: number; cells: LayoutCell[] }
export interface LayoutSide { id: string; label: string; rows: LayoutRow[] }

function layoutRows(def: CompiledDef, rows: SheetRowDef[], lang: string): LayoutRow[] {
  return rows.map((r) => ({
    h: Number(r.h ?? 8),
    cells: (r.cells ?? []).map((c): LayoutCell => {
      const w = Number(c.w ?? 100);
      if (c.field) {
        const f = visualField(def, c.field);
        return { kind: "field", field: c.field, w, label: c.label === "none" ? null : labelIn(f?.labels, lang),
                 required: !!f?.required, type: f?.type ?? "text", style: c.style ?? null };
      }
      if (c.rows && c.rows.length)
        return { kind: "block", w, label: c.label === "none" ? null : labelIn(c.block_labels, lang),
                 rotated: !!c.rotated, rows: layoutRows(def, c.rows, lang) };
      return { kind: "spacer", w };
    }),
  }));
}

/** The sides to draw — `render._layout`: the sheet as declared, or one liquid
 *  page of the paragraphs when the definition declares no sheet (SPEC §4.1). */
export function sheetLayout(def: CompiledDef, lang: string): LayoutSide[] {
  const sheet = def.visual.sheet;
  if (sheet) return sheet.sides.map((s) => ({ id: s.id, label: labelIn(s.labels, lang), rows: layoutRows(def, s.rows, lang) }));
  const rows: SheetRowDef[] = def.visual.paragraphs.map((p) => ({
    h: 8, cells: [{ block: p.id, block_labels: p.labels, w: 100, rows: p.fields.map((fid) => ({ h: 8, cells: [{ field: fid, w: 100 }] })) }],
  }));
  return [{ id: "fields", label: labelIn(def.header.standard.title, lang), rows: layoutRows(def, rows, lang) }];
}

/** The field ids in drawing order (recto first) — for the parity check and the
 *  measure. */
export function layoutFields(sides: LayoutSide[]): string[] {
  const out: string[] = [];
  const walk = (rows: LayoutRow[]): void => {
    for (const r of rows) for (const c of r.cells) {
      if (c.kind === "field") out.push(c.field);
      else if (c.kind === "block") walk(c.rows);
    }
  };
  for (const s of sides) walk(s.rows);
  return out;
}

// ─────────────────────────────────────────────────────────── vocabularies

/** The concepts a `term` box offers: its scheme's, or — for a `declared`
 *  scheme — the provisional module's that answers for it (SPEC §3.2). */
export function conceptsFor(def: CompiledDef, fid: string, lang: string):
  { scheme: string | null; answeredBy: string | null; concepts: Array<{ concept: string; label: string }> } {
  const f = visualField(def, fid);
  // a term box's vocabulary, or the scheme whose term MAY classify a text box
  // (SPEC §2.6: DEFINIZIONE's term)
  const voc = f?.vocabulary ?? f?.concept_vocabulary;
  const scheme = voc?.scheme ?? null;
  if (!scheme) return { scheme: null, answeredBy: null, concepts: [] };
  let v = VOCABS.get(scheme);
  let answeredBy: string | null = scheme;
  if ((!v || !v.concepts.length) && (voc?.provisional || v?.provisional)) {
    answeredBy = voc?.provisional ?? v?.provisional ?? null;
    v = answeredBy ? VOCABS.get(answeredBy) : undefined;
  }
  if (!v || !v.concepts.length) return { scheme, answeredBy: null, concepts: [] };
  return { scheme, answeredBy, concepts: v.concepts.map((c) => ({ concept: c.concept, label: c.labels[lang] ?? Object.values(c.labels)[0] ?? c.concept })) };
}

/** A concept's label in `lang`, from the box's vocabularies; null when it is
 *  not one of theirs (the label carried by the data is then what shows). */
export function conceptLabel(def: CompiledDef, fid: string, concept: string, lang: string): string | null {
  return conceptsFor(def, fid, lang).concepts.find((c) => c.concept === concept)?.label ?? null;
}

/** A key of a module the definition names (em-record-status, em-place-level…)
 *  said in `lang`: the concept whose IRI ends with the key. */
export function schemeKeyLabel(scheme: string, key: string, lang: string): string {
  const v = VOCABS.get(scheme);
  const c = v?.concepts.find((x) => x.concept.endsWith(`/${key}`));
  return c ? (c.labels[lang] ?? Object.values(c.labels)[0] ?? key) : key;
}

// ─────────────────────────────────────────────────────────── 2 · the reading

export interface Graph { nodes: readonly EmNode[]; edges: readonly EmEdge[] }

/** Where StratiField writes the mark of the box that minted a node, inside
 *  `data` (`operazioni.MARK`, decision 7) and the pointers BY ROLE on the unit
 *  (`operazioni.LINKS`, decision 8, flattened keys `scheda_links.<field>`).
 *  The same keys here, so a node written by either reader is attributed by the
 *  other. */
export const MARK = "scheda";
export const LINKS = "scheda_links";

export type FieldState =
  | "filled"     // the graph says it
  | "empty"      // the graph could say it and says nothing
  | "silent"     // the definition keeps it out of the graph (verdict none, a blocked_on)
  | "open"       // the definition names what it hangs on and does not define it ($anchor)
  | "ambiguous"; // the graph has it, two boxes share that address and no mark says whose

export interface FieldReading {
  fid: string;
  type: string;
  verdict: string;
  state: FieldState;
  /** the value in the RECORD's shape (SPEC §5): string, list, {concept,label}… */
  value: unknown;
  /** the text the box shows */
  text: string;
  /** an i18n key and its parameters: where the value lives, or why it does not */
  how: { key: string; p?: Record<string, string> };
  /** read through the lens (no mark: a property taken by its qualia, a
   *  `definition` PropertyNode for the node element) */
  lens?: boolean;
  /** the nodes the value lives on (PropertyNodes, context nodes) */
  nodes: string[];
  /** for a relation box: one entry per edge, the other unit */
  refs?: Array<{ edge: EmEdge; other: string; name: string; numbered: boolean }>;
  /** the box cannot be changed from the sheet, and why (an i18n key) */
  readonly?: { key: string; p?: Record<string, string> };
  /** for an ambiguous box: what the graph has, that no mark attributes */
  candidates?: string[];
  /** DEFINIZIONE (SPEC §2.6): the term that classifies the definition, on the
   *  same PropertyNode (`data.concept`) */
  concept?: { concept?: string; label?: string } | null;
  /** INTERPRETAZIONE: the chain of the definition's PropertyNode (extractors,
   *  combiners, documents) — shown under the box, read only */
  chain?: Array<{ id: string; name: string; node_type: string }>;
  /** a remark on the box that corrects nothing (DESCRIZIONE ≈ DEFINIZIONE) */
  remark?: { key: string; p?: Record<string, string> };
}

export interface UnitReading {
  unitId: string;
  fields: Map<string, FieldReading>;
  /** the unit's properties no box of this sheet reads (StratiField's `unread`):
   *  shown under the sheet, never lost in silence */
  unread: Array<{ id: string; qualia: string; value: string }>;
  /** SPEC §5 (3.0.0): the record's status on the unit — a key of the scheme
   *  the definition names (em-record-status), or null when not said; absent
   *  when the definition does not write it */
  status?: { key: string | null; scheme: string; values: string[] };
}

const dataOf = (n: EmNode | undefined): Record<string, unknown> => (n?.data ?? {}) as Record<string, unknown>;
const markOf = (n: EmNode | undefined): Record<string, unknown> => {
  const m = dataOf(n)[MARK];
  return m && typeof m === "object" ? m as Record<string, unknown> : {};
};
const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
const propValue = (n: EmNode): string => {
  const d = str(n.description).trim();
  return d || str(dataOf(n).value).trim();
};
const qualiaOf = (n: EmNode): string => str(dataOf(n).property_type || n.name);
const readAs = qualiaOf;

// ─────────────────────── the definition, its interpretation, the description
// MICRO-K-DEFINIZIONE-E-PASSI (E.D., 17 Nov 2026 — withdraws MICRO-J §C): the
// DEFINITION is the VALUE of the unit's PropertyNode `definition`; the
// INTERPRETATION is the DESCRIPTION of that same node (none while it equals
// the value); the DESCRIPTION is the unit's own. The twin of s3Dgraphy's
// `s3dgraphy.definition` (same answers on the v10: check-sheet).

export const DEFINITION = "definition";
/** where the sheets up to ICCD US 2021 3.0.0 wrote INTERPRETAZIONE: read,
 *  never written */
export const LEGACY_INTERPRETATION = "interpretation";

/** `{value, interpretation, concept}` of a PropertyNode `definition`. */
export function definitionParts(p: EmNode | undefined): { value: string; interpretation: string; concept: { concept?: string; label?: string } | null } {
  if (!p) return { value: "", interpretation: "", concept: null };
  const d = dataOf(p);
  let v = str(d.value).trim();
  let i = str(p.description).trim();
  if (!v && i) { v = i; i = ""; }
  const c = d.concept;
  const concept = c && typeof c === "object"
    ? { concept: str((c as Record<string, unknown>).concept) || undefined, label: str((c as Record<string, unknown>).label) || undefined }
    : typeof c === "string" && c ? (/^(https?:|urn:)/.test(c) ? { concept: c } : { label: c }) : null;
  return { value: v, interpretation: i && i !== v ? i : "", concept };
}

const fold = (t: string): string => t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\p{L}\p{N}_]+/gu, " ").trim();

/** Ratcliff/Obershelp, as Python's `difflib.SequenceMatcher(autojunk=False).ratio()`. */
function likeness(a: string, b: string): number {
  const matches = (a0: number, a1: number, b0: number, b1: number): number => {
    let best = 0, bi = a0, bj = b0;
    let prev = new Map<number, number>();
    for (let i = a0; i < a1; i++) {
      const cur = new Map<number, number>();
      for (let j = b0; j < b1; j++) {
        if (a[i] !== b[j]) continue;
        const k = (prev.get(j - 1) ?? 0) + 1;
        cur.set(j, k);
        if (k > best) { best = k; bi = i - k + 1; bj = j - k + 1; }
      }
      prev = cur;
    }
    if (!best) return 0;
    return best + matches(a0, bi, b0, bj) + matches(bi + best, a1, bj + best, b1);
  };
  const n = a.length + b.length;
  return n ? (2 * matches(0, a.length, 0, b.length)) / n : 1;
}

/** Whether a unit's description is (almost) its definition — EM's historical
 *  use of the description as a label. SAID, never corrected
 *  (`s3dgraphy.definition.echoes`: the same words after case, accents and
 *  punctuation, or a likeness of 0.85). */
export function echoes(description: string, definition: string): boolean {
  const a = fold(str(description)), b = fold(str(definition));
  if (!a || !b) return false;
  return a === b || likeness(a, b) >= 0.85;
}

/** SPEC §2.4: does a node carry the discriminant of a box (`where`)? And does
 *  it carry ANY of its keys — then, not matching, it is another box's. */
const matchesWhere = (n: EmNode, where: Record<string, string>): boolean =>
  Object.entries(where).every(([k, v]) => str(dataOf(n)[k] ?? (n as unknown as Record<string, unknown>)[k]) === v);
const saysWhere = (n: EmNode, where: Record<string, string>): boolean =>
  Object.keys(where).some((k) => dataOf(n)[k] !== undefined && dataOf(n)[k] !== null);

/** The edge step of an entry that ties its node to the unit (or to an act, or
 *  to another box's node) — not FASE's `has_sub_epoch` between two epochs. */
function mainEdge(entry: RecipeEntry): Record<string, unknown> | undefined {
  const edges = (entry.steps ?? []).filter((s) => s.emit.op === "add_edge").map((s) => s.emit);
  const ends = (e: Record<string, unknown>) => [str(e.source), str(e.target)];
  return edges.find((e) => ends(e).some((x) => x === "$unit" || x.startsWith("$anchor.")))
    ?? edges.find((e) => !str(e.source).startsWith("$field.") || str(e.source).endsWith(".prop")) ?? edges[0];
}

/** SPEC §2.5: the act of the unit an anchor names — the node of the anchor's
 *  type, carrying its discriminant (`act_kind`), that the unit reaches by the
 *  anchor's edge. None: the act is not in the graph yet. */
export function actOf(def: CompiledDef, g: Graph, unitId: string, anchor: string): EmNode | null {
  const a = def.recipe.anchors?.[anchor];
  if (!a?.defined) return null;
  const ix = index(g);
  const edge = (a.steps ?? []).find((s) => s.emit.op === "add_edge")?.emit;
  const et = str(edge?.edge_type || "is_in_activity");
  const unitIsSource = !edge || str(edge.source) === "$unit";
  for (const e of unitIsSource ? (ix.out.get(unitId) ?? []) : (ix.inn.get(unitId) ?? [])) {
    if (!edgeSpellings(et).has(str(e.edge_type))) continue;
    const n = ix.byId.get(unitIsSource ? e.target : e.source);
    if (n && n.node_type === a.node?.node_type && matchesWhere(n, a.where ?? {})) return n;
  }
  return null;
}

/** A unit of the sheet's relations: a stratigraphic node that is not a
 *  continuity marker (a BR closes a life, it is not a unit one is in contact
 *  with — StratiField lists `BR` among its unit prefixes: a divergence, said in
 *  the report). `special_find_record`: the special finds. */
export function isKind(nodeType: string | undefined, kind: string): boolean {
  if (kind === "special_find_record") return /SpecialFind/.test(classOf(nodeType));
  return isStratigraphicType(nodeType) && !isContinuityType(nodeType);
}

/** Is this node a unit a sheet can be drawn for? */
export function isSheetUnit(n: EmNode | undefined): boolean {
  return !!n && isKind(n.node_type, "stratigraphic_unit");
}

function index(g: Graph): { byId: Map<string, EmNode>; out: Map<string, EmEdge[]>; inn: Map<string, EmEdge[]> } {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out = new Map<string, EmEdge[]>();
  const inn = new Map<string, EmEdge[]>();
  for (const e of g.edges) {
    if ((e.attributes as Record<string, unknown> | undefined)?.removed) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  return { byId, out, inn };
}

/** The qualia a property box mints: fixed, or the per-row default. */
function boxQualia(entry: RecipeEntry): string | null {
  return entry.property?.property_type ?? entry.defaults?.["$item.qualia"] ?? null;
}

/** The anchor a property box hangs on, when it is not the unit. */
function anchorOf(entry: RecipeEntry): string | null {
  const edge = (entry.steps ?? []).find((s) => s.emit.op === "add_edge")?.emit;
  const src = str(edge?.source);
  return src.startsWith("$anchor.") ? src.slice("$anchor.".length) : null;
}

/** How many boxes of the definition produce `edgeType` towards `nodeType`
 *  (StratiField `_rivals`): one, and an unmarked node is that box's; more, and
 *  nobody can say whose it is. */
function rivals(def: CompiledDef, edgeType: string, nodeType: string | undefined): number {
  let n = 0;
  for (const e of Object.values(def.recipe.fields)) {
    if (e.node?.node_type !== nodeType) continue;
    if ((e.steps ?? []).some((s) => s.emit.op === "add_edge" && s.emit.edge_type === edgeType)) n++;
  }
  return n;
}

function textOf(type: string, value: unknown, labelOf: (c: string) => string | null): string {
  if (value === undefined || value === null || value === "") return "";
  const one = (v: unknown): string => {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.concept) return labelOf(str(o.concept)) ?? str(o.label || o.concept);
      if ("value" in o) return [str(o.label || o.qualia), str(o.value), str(o.unit)].filter(Boolean).join(" ");
      return str(o.name ?? o.label ?? o.ref);
    }
    return str(v);
  };
  if (Array.isArray(value)) return value.map(one).filter(Boolean).join(type === "quantity_list" ? "; " : ", ");
  return one(value);
}

/**
 * The sheet of one unit, read off the graph.
 *
 * The recipe walked backwards, entry by entry, with the address each verdict
 * writes to. Where several boxes of the definition write the SAME address
 * (five boxes make an `is_in_location` towards a LocationNodeGroup) a node
 * with no mark is not given to any of them: the box says what the graph has
 * and that it cannot say whose (`ambiguous`), as StratiField's `_belongs_to`.
 */
export function readUnit(def: CompiledDef, g: Graph, unitId: string, lang: string): UnitReading {
  const ix = index(g);
  const unit = ix.byId.get(unitId);
  const fields = new Map<string, FieldReading>();
  if (!unit) return { unitId, fields, unread: [] };
  const unitData = dataOf(unit);
  const links = (fid: string): string[] | null => {
    const v = unitData[`${LINKS}.${fid}`];
    return Array.isArray(v) ? v.map(String) : null;
  };
  // the unit's properties, with the field that marked them
  const nameOf = (n: EmNode | undefined): string => str(n?.name).trim();
  const props = (ix.out.get(unitId) ?? []).filter((e) => e.edge_type === "has_property")
    .map((e) => ix.byId.get(e.target)).filter((n): n is EmNode => !!n && n.node_type === "property");
  const minted = new Map<string, EmNode[]>();
  for (const p of props) {
    const m = markOf(p);
    if (m.field && (!m.template || m.template === def.header.id))
      (minted.get(str(m.field)) ?? minted.set(str(m.field), []).get(str(m.field))!).push(p);
  }
  for (const rows of minted.values()) rows.sort((a, b) => Number(markOf(a).index ?? 0) - Number(markOf(b).index ?? 0));
  const claimed = new Set([...minted.values()].flat().map((p) => p.id));
  const used = new Set<string>();
  const byQualia = (q: string): EmNode[] => props.filter((p) => !claimed.has(p.id) && !used.has(p.id) && readAs(p) === q);
  // the unit's definition (MICRO-K): its PropertyNode, whatever box marked it
  const defProp = props.find((p) => qualiaOf(p).toLowerCase() === DEFINITION);
  const chainOf = (pid: string): NonNullable<FieldReading["chain"]> => {
    const out: NonNullable<FieldReading["chain"]> = [];
    const seen = new Set<string>([pid]);
    const todo = [pid];
    while (todo.length && out.length < 50) {
      const id = todo.shift()!;
      for (const e of ix.out.get(id) ?? []) {
        if (!["has_data_provenance", "extracted_from", "combines"].includes(str(e.edge_type)) || seen.has(e.target)) continue;
        seen.add(e.target);
        const n = ix.byId.get(e.target);
        if (!n) continue;
        out.push({ id: n.id, name: nameOf(n) || n.id, node_type: str(n.node_type) });
        todo.push(n.id);
      }
    }
    return out;
  };

  for (const f of def.visual.fields) {
    const fid = f.id;
    const entry = def.recipe.fields[fid] ?? { verdict: "none" };
    const lab = (c: string) => conceptLabel(def, fid, c, lang);
    const r: FieldReading = { fid, type: f.type, verdict: entry.verdict, state: "empty", value: undefined, text: "", how: { key: "sheet.how.empty" }, nodes: [] };
    const done = (): void => {
      r.text = textOf(f.type, r.value, lab);
      if (r.state === "empty" && r.text) r.state = "filled";
      fields.set(fid, r);
    };

    if (entry.verdict === "identity") {
      const designator = def.visual.identity.unit_field || (def.visual.identity.human_key.length === 1 ? def.visual.identity.human_key[0] : "");
      if (fid === designator) {
        r.value = nameOf(unit) || undefined;
        r.how = { key: r.value ? "sheet.how.name" : "sheet.how.noNumber" };
        if (!r.value) r.state = "empty";
      } else {
        r.how = { key: "sheet.how.identityPart" };
      }
      r.readonly = { key: "sheet.ro.identity" };
      done();
      continue;
    }
    if (entry.verdict === "node_type") {
      for (const [opt, row] of Object.entries(entry.table ?? {}))
        if (row.node_type === unit.node_type) r.value = opt;
      r.how = { key: r.value ? "sheet.how.nodeType" : "sheet.how.nodeTypeNone", p: { type: str(unit.node_type) } };
      r.readonly = { key: "sheet.ro.nodeType" };
      done();
      continue;
    }
    if (entry.verdict === "none" || !(entry.steps ?? []).length) {
      r.state = "silent";
      r.how = entry.blocked_on
        ? { key: "sheet.how.blocked", p: { needs: entry.blocked_on.needs } }
        : { key: "sheet.how.none", p: { why: str(entry.reason) } };
      r.readonly = { key: "sheet.ro.silent" };
      done();
      continue;
    }

    if (entry.verdict === "edge") {
      const emit = entry.steps![0].emit;
      const kind = str(entry.resolve?.["$item"]?.find?.kind) || "stratigraphic_unit";
      const symmetric = !!entry.edge?.symmetric || isSymmetricEdgeType(str(emit.edge_type));
      const unitIsSource = emit.source === "$unit";
      const names = edgeSpellings(str(emit.edge_type));
      const refs: NonNullable<FieldReading["refs"]> = [];
      const cands = [...(ix.out.get(unitId) ?? []), ...(ix.inn.get(unitId) ?? [])];
      for (const e of cands) {
        if (!names.has(str(e.edge_type))) continue;
        let other: string | null = null;
        if (symmetric) other = e.source === unitId ? e.target : e.source;
        else if (unitIsSource ? e.source === unitId : e.target === unitId) other = unitIsSource ? e.target : e.source;
        if (!other || other === unitId) continue;
        const o = ix.byId.get(other);
        if (!o || !isKind(o.node_type, kind)) continue;
        const nm = nameOf(o);
        refs.push({ edge: e, other, name: nm || other, numbered: !!nm });
      }
      refs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      r.refs = refs;
      r.value = refs.length ? refs.map((x) => x.name) : undefined;
      r.how = { key: "sheet.how.edge", p: { edge: canonicalEdgeType(str(emit.edge_type)), dir: unitIsSource ? "→" : "←" } };
      done();
      continue;
    }

    const steps = entry.steps ?? [];
    const onAct = steps.length === 1 && steps[0].emit.op === "update_field" && str(steps[0].emit.node_id).startsWith("$anchor.");
    if (onAct) {
      // SPEC §2.5 (3.0.0): ANNO and the two dates are the TIME of an act
      const anchor = str(steps[0].emit.node_id).slice("$anchor.".length);
      const field = str(steps[0].emit.field);
      if (!def.recipe.anchors?.[anchor]?.defined) {
        r.state = "open";
        r.how = { key: "sheet.how.anchor", p: { anchor } };
        r.readonly = { key: "sheet.ro.anchor", p: { anchor } };
        done();
        continue;
      }
      const act = actOf(def, g, unitId, anchor);
      const raw = act ? (field.startsWith("data.") ? dataOf(act)[field.slice(5)] : (act as unknown as Record<string, unknown>)[field]) : undefined;
      if (act) r.nodes = [act.id];
      if (raw !== undefined && raw !== null && raw !== "")
        r.value = f.type === "integer" && /^-?\d+$/.test(str(raw)) ? Number(raw) : str(raw);
      r.how = { key: act ? "sheet.how.act" : "sheet.how.actNone", p: { anchor, field, act: str(act?.name) } };
      done();
      continue;
    }
    const onProp = steps.length === 1 && steps[0].emit.op === "update_field"
      && /^\$field\.[^.]+\.prop$/.test(str(steps[0].emit.node_id)) && str(steps[0].emit.field) === "description";
    if (onProp) {
      // SPEC §2.6 (ICCD 4.0.0): INTERPRETAZIONE is the description of the
      // PropertyNode another box mints (DEFINIZIONE's) — empty while it equals
      // the value; else an old PropertyNode `interpretation` (≤ 3.0.0), read
      const base = str(steps[0].emit.node_id).split(".")[1];
      const baseNode = fields.get(base)?.nodes[0];
      const prop = baseNode ? ix.byId.get(baseNode) : undefined;
      const parts = definitionParts(prop);
      if (prop) {
        r.nodes = [prop.id];
        r.chain = chainOf(prop.id);
      }
      if (parts.interpretation) {
        r.value = parts.interpretation;
        r.how = { key: "sheet.how.interpretation", p: { field: base } };
      } else {
        const legacy = byQualia(LEGACY_INTERPRETATION);
        if (legacy.length && propValue(legacy[0])) {
          legacy.forEach((p) => used.add(p.id));
          r.value = propValue(legacy[0]);
          r.lens = true;
          r.how = { key: "sheet.how.legacyInterpretation", p: { field: base } };
        } else r.how = { key: prop ? "sheet.how.interpretationNone" : "sheet.how.afterEmpty", p: { field: base } };
      }
      if (!prop) r.readonly = { key: "sheet.ro.definitionFirst", p: { field: base } };
      done();
      continue;
    }
    const native = steps.length === 1 && steps[0].emit.op === "update_field" && steps[0].emit.node_id === "$unit";
    if (native) {
      const field = str(steps[0].emit.field);
      const raw = field.startsWith("data.") ? unitData[field.slice(5)] : (unit as Record<string, unknown>)[field];
      if (raw !== undefined && raw !== null && raw !== "") {
        if (f.type === "term" && typeof raw === "string")
          r.value = /^(https?:|urn:)/.test(raw) ? { concept: raw } : { label: raw };
        else r.value = raw;
        r.how = { key: "sheet.how.native", p: { field } };
      } else if (entry.element) {
        // THE LENS on an element: a graph written before the element carries
        // it as a PropertyNode of the same name — read, said
        const lensProps = byQualia(entry.element.name);
        if (lensProps.length) {
          lensProps.forEach((p) => used.add(p.id));
          r.value = { label: propValue(lensProps[0]) };
          r.lens = true;
          r.nodes = lensProps.map((p) => p.id);
          r.how = { key: "sheet.how.lensElement", p: { field, qualia: entry.element.name } };
        } else r.how = { key: "sheet.how.nativeEmpty", p: { field } };
      } else r.how = { key: "sheet.how.nativeEmpty", p: { field } };
      // MICRO-K §A.3: a description that repeats the definition (EM's
      // historical use of the description as a label) is SAID, not corrected
      if (field === "description" && typeof r.value === "string" && defProp) {
        const dv = definitionParts(defProp).value;
        if (echoes(r.value, dv)) r.remark = { key: "sheet.remark.echo", p: { def: dv } };
      }
      done();
      continue;
    }

    const mintsProperty = steps.some((s) => s.emit.op === "add_node" && (s.emit.node as Record<string, unknown> | undefined)?.node_type === "property");
    if (mintsProperty) {
      const anchor = anchorOf(entry);
      if (anchor) {
        r.state = "open";
        r.how = { key: "sheet.how.anchor", p: { anchor } };
        r.readonly = { key: "sheet.ro.anchor", p: { anchor } };
        done();
        continue;
      }
      const q = boxQualia(entry);
      if (q === DEFINITION && !entry.each) {
        // MICRO-K §A (ICCD 4.0.0): the VALUE of the PropertyNode `definition`
        // (data.value before the description, which may be its interpretation);
        // its term in data.concept. No PropertyNode: the deprecated element
        // data.definition (nodes 1.6.48) is read, said
        let p = (minted.get(fid) ?? []).find((x) => qualiaOf(x).toLowerCase() === DEFINITION);
        if (!p) { p = byQualia(DEFINITION)[0] ?? props.find((x) => qualiaOf(x).toLowerCase() === DEFINITION && !used.has(x.id)); if (p) r.lens = !markOf(p).field; }
        if (p) {
          used.add(p.id);
          const parts = definitionParts(p);
          r.nodes = [p.id];
          r.concept = parts.concept;
          if (f.type === "term") r.value = parts.concept ?? (parts.value ? { label: parts.value } : undefined);
          else if (parts.value) r.value = parts.value;
          r.how = { key: r.lens ? "sheet.how.lensProperty" : "sheet.how.property", p: { qualia: DEFINITION } };
        } else {
          const el = unitData.definition;
          const label = el && typeof el === "object" ? str((el as Record<string, unknown>).label) : str(el);
          const concept = el && typeof el === "object" ? str((el as Record<string, unknown>).concept) : "";
          if (label || concept) {
            r.value = f.type === "term" ? { ...(concept ? { concept } : {}), ...(label ? { label } : {}) } : (label || concept);
            r.concept = concept || label ? { concept: concept || undefined, label: label || undefined } : null;
            r.lens = true;
            r.how = { key: "sheet.how.deprecatedElement", p: {} };
          } else r.how = { key: "sheet.how.property", p: { qualia: DEFINITION } };
        }
        done();
        continue;
      }
      let nodes = (minted.get(fid) ?? []).filter((p) => !entry.property?.property_type || qualiaOf(p) === entry.property.property_type);
      if (!nodes.length && q) {
        nodes = byQualia(q);
        if (nodes.length) r.lens = true;
      }
      const accepts = entry.property?.accepts ?? [];
      if (!nodes.length && accepts.length) {
        // SPEC §2.4 (3.0.0): the qualia the box accepts — `height` is MISURE's
        nodes = props.filter((p) => !claimed.has(p.id) && !used.has(p.id) && accepts.includes(readAs(p)));
        if (nodes.length) r.lens = true;
      }
      nodes.forEach((p) => used.add(p.id));
      r.nodes = nodes.map((p) => p.id);
      const valued = nodes.filter((p) => propValue(p) !== "");
      if (entry.each) {
        r.value = valued.length ? valued.map((p) => {
          const d = dataOf(p);
          const m = markOf(p);
          return f.type === "term_list"
            ? (m.uncontrolled ? { label: propValue(p) } : { concept: propValue(p), ...(m.label ? { label: m.label } : {}) })
            : { qualia: qualiaOf(p), ...(m.label ? { label: m.label } : {}), value: propValue(p), ...(d.units ? { unit: d.units } : {}) };
        }) : undefined;
      } else if (valued.length) {
        const p = valued[0];
        const v = propValue(p);
        const m = markOf(p);
        if (f.type === "term")
          r.value = m.uncontrolled || !/^(https?:|urn:)/.test(v) ? { label: str(m.label) || v } : { concept: v, ...(m.label ? { label: m.label } : {}) };
        else if (f.type === "integer" && /^-?\d+$/.test(v)) r.value = Number(v);
        else r.value = v;
      }
      r.how = { key: r.lens ? "sheet.how.lensProperty" : (q ? "sheet.how.property" : "sheet.how.propertyRows"), p: { qualia: q ?? "—" } };
      if (!entry.property?.property_type && !q && entry.each)
        r.how = accepts.length
          ? { key: r.lens ? "sheet.how.lensAccepts" : "sheet.how.accepts", p: { box: str(entry.property?.box), qualia: accepts.join(", ") } }
          : { key: "sheet.how.propertyRows", p: { box: str(entry.property?.box) } };
      done();
      continue;
    }

    // a node of its own, reached by an edge
    const edgeStep = mainEdge(entry);
    const nodeType = str(entry.node?.node_type || (entry.resolve?.["$node"]?.find?.node_type));
    if (!edgeStep) { r.state = "silent"; r.how = { key: "sheet.how.none", p: { why: "" } }; done(); continue; }
    let from = unitId;
    const src = str(edgeStep.source);
    if (src.startsWith("$field.")) {
      // anchored to the node another box made (elementi_datanti → datazione's property)
      const base = fields.get(src.split(".")[1]);
      if (!base || !base.nodes.length) {
        r.how = { key: "sheet.how.afterEmpty", p: { field: src.split(".")[1] } };
        r.readonly = { key: "sheet.ro.after", p: { field: src.split(".")[1] } };
        done();
        continue;
      }
      from = base.nodes[0];
    }
    if (src.startsWith("$anchor.")) {
      // SPEC §2.5: the responsible of an ACT — the act first, then its author
      const anchor = src.slice("$anchor.".length);
      const act = actOf(def, g, unitId, anchor);
      if (!act) {
        r.how = { key: "sheet.how.actNone", p: { anchor, field: str(edgeStep.edge_type), act: "" } };
        r.readonly = { key: "sheet.ro.actFirst", p: { anchor } };
        done();
        continue;
      }
      from = act.id;
    }
    const outgoing = src === "$unit" || src.startsWith("$field.") || src.startsWith("$anchor.");
    const et = str(edgeStep.edge_type);
    const pointed = links(fid);
    const found: EmNode[] = [];
    const unattributed: EmNode[] = [];
    const where = entry.where;
    const parentEpoch = (n: EmNode): EmNode | undefined => (ix.inn.get(n.id) ?? [])
      .filter((e) => edgeSpellings("has_sub_epoch").has(str(e.edge_type)))
      .map((e) => ix.byId.get(e.source)).find((p) => p?.node_type === "EpochNode");
    for (const e of outgoing ? (ix.out.get(from) ?? []) : (ix.inn.get(from) ?? [])) {
      if (!edgeSpellings(et).has(str(e.edge_type))) continue;
      const other = ix.byId.get(outgoing ? e.target : e.source);
      if (!other || other.node_type !== nodeType) continue;
      if (pointed) { if (pointed.includes(other.id)) found.push(other); continue; }
      if (entry.yields_to || entry.sub_epoch_of) {
        // SPEC §2.4 (3.0.0): FASE is the sub-epoch of PERIODO — the unit's
        // first epoch is the phase when it has a parent, the period otherwise
        const parent = parentEpoch(other);
        if (entry.yields_to) { const p = parent ?? other; if (!found.includes(p)) found.push(p); }
        else if (parent && !found.includes(other)) found.push(other);
        continue;
      }
      if (where) {
        // SPEC §2.4: the discriminant decides; a node that carries another
        // value of it is another box's, one that carries none is unattributed
        if (matchesWhere(other, where)) { found.push(other); continue; }
        if (saysWhere(other, where)) continue;
      } else if (dataOf(other).act_kind) continue; // an ACT (SPEC §2.5) is not ATTIVITÀ
      const m = markOf(other);
      if (m.field) { if (m.field === fid && (!m.template || m.template === def.header.id)) found.push(other); continue; }
      if (rivals(def, et, nodeType) <= 1) found.push(other);
      else unattributed.push(other);
    }
    r.nodes = found.map((n) => n.id);
    const byName = Array.isArray(entry.resolve?.["$node"]?.find?.any)
      && Object.keys((entry.resolve!["$node"]!.find!.any as Array<Record<string, unknown>>)[0] ?? {})[0] === "name";
    const shown = (n: EmNode): string => f.type === "longtext" ? str(n.description)
      : (f.type === "resource_ref_list" ? (byName ? str(n.name || dataOf(n).url) : str(dataOf(n).url || n.name)) : nameOf(n));
    if (found.length) {
      if (f.type === "resource_ref_list") r.value = found.map(shown);
      else if (f.type === "person_ref" || f.type === "actor_ref") r.value = { name: nameOf(found[0]) };
      else r.value = shown(found[0]);
      r.how = { key: "sheet.how.node", p: { edge: et, type: nodeType } };
    } else if (unattributed.length) {
      r.state = "ambiguous";
      r.candidates = [...new Set(unattributed.map(shown).filter(Boolean))];
      r.how = { key: "sheet.how.ambiguous", p: { edge: et, type: nodeType, n: String(rivals(def, et, nodeType)), what: r.candidates.join(", ") } };
    } else r.how = { key: "sheet.how.node", p: { edge: et, type: nodeType } };
    if (f.type === "epoch_ref") r.readonly = { key: "sheet.ro.epoch" };
    done();
  }

  const unread = props.filter((p) => !used.has(p.id) && !claimed.has(p.id))
    .map((p) => ({ id: p.id, qualia: qualiaOf(p), value: propValue(p) }))
    .sort((a, b) => a.qualia.localeCompare(b.qualia));
  const rs = def.recipe.unit?.record_status;
  const status = rs ? { key: str(unitData.record_status) || null, scheme: str(rs.scheme), values: rs.values ?? [] } : undefined;
  return { unitId, fields, unread, ...(status ? { status } : {}) };
}

/** The measure of MICRO-G: how many of the boxes are full, which are empty. */
export function fillCounts(reading: UnitReading): Record<FieldState, string[]> {
  const out: Record<FieldState, string[]> = { filled: [], empty: [], silent: [], open: [], ambiguous: [] };
  for (const r of reading.fields.values()) out[r.state].push(r.fid);
  return out;
}

/** The record for the print (SPEC §5): the definition, its version, the values
 *  the graph gives. What is empty is absent, as in any record. */
export function recordOf(def: CompiledDef, reading: UnitReading): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const r of reading.fields.values()) {
    if (r.value === undefined || r.value === null || r.value === "") continue;
    values[r.fid] = r.value;
  }
  return { template: def.header.id, template_version: def.header.version,
           ...(reading.status?.key ? { status: reading.status.key } : {}), values };
}

// ─────────────────────────────────────────────────────────── 3 · the edit

export type Act =
  | { op: "update"; nodeId: string; patch: Record<string, unknown> }
  | { op: "setField"; nodeId: string; field: string; value: unknown }
  | { op: "setProp"; propId: string; value: string; mark?: Record<string, unknown> }
  | { op: "addProp"; unitId: string; qualia: string; value: string; mark: Record<string, unknown> }
  | { op: "addNode"; node: EmNode }
  | { op: "addEdge"; source: string; target: string; edgeType: string }
  | { op: "delEdge"; edge: EmEdge };

export interface Plan {
  acts: Act[];
  /** nothing written, and why (an i18n key + params) */
  refused?: { key: string; p?: Record<string, string> };
  /** written, and something to say about it */
  notes: Array<{ key: string; p?: Record<string, string> }>;
}

const refuse = (key: string, p?: Record<string, string>): Plan => ({ acts: [], refused: { key, p }, notes: [] });

function markFor(def: CompiledDef, fid: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { field: fid, template: def.header.id, template_version: def.header.version, by: "emstudio", ...extra };
}

/**
 * A box changed: what to write. `input` is what the box holds now — a string
 * for a text box, a choice's value, a term's text (matched to a concept of its
 * vocabulary by label; a word that matches none is written as a WORD, marked
 * uncontrolled — SPEC §3: it does not become a concept). Relation boxes go
 * through `planRefAdd` / `planRefRemove`, one unit at a time.
 */
export function planEdit(def: CompiledDef, g: Graph, unitId: string, fid: string, input: string, lang: string): Plan {
  const reading = readUnit(def, g, unitId, lang);
  const r = reading.fields.get(fid);
  const f = visualField(def, fid);
  const entry = def.recipe.fields[fid];
  if (!r || !f || !entry) return refuse("sheet.no.field", { field: fid });
  if (r.readonly) return { acts: [], refused: r.readonly, notes: [] };
  const v = input.trim();
  if (v === r.text.trim()) return { acts: [], notes: [] };
  const steps = entry.steps ?? [];

  // the term: a concept of the box's vocabulary, by its label, or a word
  const asTerm = (): { concept?: string; label: string } => {
    const hit = conceptsFor(def, fid, lang).concepts.find((c) => c.label.toLowerCase() === v.toLowerCase() || c.concept === v);
    return hit ? { concept: hit.concept, label: hit.label } : { label: v };
  };

  if (f.type === "integer" && v && !/^-?\d+$/.test(v)) return refuse("sheet.no.integer", { v });
  if (f.type === "decimal" && v && !/^-?\d+([.,]\d+)?$/.test(v)) return refuse("sheet.no.decimal", { v });
  if (f.type === "date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return refuse("sheet.no.date", { v });
  if (f.type === "choice" && v && !(f.options ?? []).some((o) => o.value === v)) return refuse("sheet.no.choice", { v });

  const onProp = steps.length === 1 && steps[0].emit.op === "update_field"
    && /^\$field\.[^.]+\.prop$/.test(str(steps[0].emit.node_id)) && str(steps[0].emit.field) === "description";
  if (onProp) {
    // SPEC §2.6: INTERPRETAZIONE writes the description of the definition's
    // PropertyNode. Emptied, the description goes back to the value — the EM
    // form an old reader reads, and that says «no interpretation»
    const prop = r.nodes[0] ? index(g).byId.get(r.nodes[0]) : undefined;
    if (!prop) return refuse("sheet.ro.definitionFirst", { field: str(steps[0].emit.node_id).split(".")[1] });
    const value = definitionParts(prop).value;
    const notes: Plan["notes"] = r.lens ? [{ key: "sheet.note.legacyInterpretation" }] : [];
    return { acts: [{ op: "update", nodeId: prop.id, patch: { description: v || value } }], notes };
  }
  const onAct = steps.length === 1 && steps[0].emit.op === "update_field" && str(steps[0].emit.node_id).startsWith("$anchor.");
  if (onAct) return planActTime(def, g, unitId, str(steps[0].emit.node_id).slice("$anchor.".length),
                                str(steps[0].emit.field), f.type === "integer" && v ? Number(v) : v);
  const native = steps.length === 1 && steps[0].emit.op === "update_field" && steps[0].emit.node_id === "$unit";
  if (native) {
    const field = str(steps[0].emit.field);
    if (f.type === "term") {
      if (!v) return { acts: [{ op: "setField", nodeId: unitId, field, value: "" }], notes: [] };
      const term = asTerm();
      const notes: Plan["notes"] = term.concept ? [] : [{ key: "sheet.note.word", p: { v } }];
      if (r.lens) notes.push({ key: "sheet.note.lensElement", p: { field } });
      return { acts: [{ op: "setField", nodeId: unitId, field, value: term }], notes };
    }
    if (field === "description" || field === "name") return { acts: [{ op: "update", nodeId: unitId, patch: { [field]: v } }], notes: [] };
    return { acts: [{ op: "setField", nodeId: unitId, field, value: v }], notes: [] };
  }

  const mintsProperty = steps.some((s) => s.emit.op === "add_node" && (s.emit.node as Record<string, unknown> | undefined)?.node_type === "property");
  if (mintsProperty) {
    if (entry.each) return refuse("sheet.no.rows");
    const q = boxQualia(entry);
    if (!q) return refuse("sheet.no.qualia");
    let value = v;
    let extra: Record<string, unknown> = {};
    const notes: Plan["notes"] = [];
    if (f.type === "term") {
      const term = v ? asTerm() : { label: "" };
      value = term.concept ?? term.label;
      extra = term.concept ? { label: term.label } : { uncontrolled: true, label: term.label };
      if (v && !term.concept) notes.push({ key: "sheet.note.word", p: { v } });
    }
    if (q === DEFINITION && f.type === "term" && r.nodes.length) {
      // a term box on the definition (es-ue, DAI): the term in data.concept,
      // its label the value (SPEC §2.6)
      const term = v ? asTerm() : { label: "" };
      return { acts: [{ op: "setProp", propId: r.nodes[0], value: term.label },
                      { op: "setField", nodeId: r.nodes[0], field: "data.concept", value: v ? term : "" }], notes };
    }
    if (r.nodes.length) {
      // the property is there (marked, or read through the lens): its value
      // changes where it lives — never a second node beside it
      const prop = r.nodes[0];
      return { acts: [{ op: "setProp", propId: prop, value, mark: f.type === "term" ? markFor(def, fid, extra) : undefined }], notes };
    }
    if (!v) return { acts: [], notes: [] };
    return { acts: [{ op: "addProp", unitId, qualia: q, value, mark: markFor(def, fid, extra) }], notes };
  }

  // a node of its own (context: a location, a functional unit, an activity…;
  // a person; a document): found by name, never invented where the recipe says
  // it is somebody else's to make
  const edgeStep = mainEdge(entry);
  const nodeType = str(entry.node?.node_type);
  const src = str(edgeStep?.source);
  if (!edgeStep || !nodeType || !(src === "$unit" || src.startsWith("$anchor."))) return refuse("sheet.no.shape");
  if (f.type === "resource_ref_list" || f.type === "record_ref_list") return refuse("sheet.no.rows");
  // SPEC §2.5: a responsible is the author of an ACT — the box hangs on it
  const from = src === "$unit" ? unitId : actOf(def, g, unitId, src.slice("$anchor.".length))?.id;
  if (!from) return refuse("sheet.ro.actFirst", { anchor: src.slice("$anchor.".length) });
  const et = str(edgeStep.edge_type);
  const ix = index(g);
  const acts: Act[] = [];
  const notes: Plan["notes"] = [];
  // the edges of THIS box that are there now: they go
  for (const id of r.nodes) {
    const e = (ix.out.get(from) ?? []).find((x) => x.target === id && edgeSpellings(et).has(str(x.edge_type)));
    if (e) acts.push({ op: "delEdge", edge: e });
  }
  let targetId: string | null = null;
  if (v) {
    const same = g.nodes.filter((n) => n.node_type === nodeType && str(n.name).trim().toLowerCase() === v.toLowerCase()
      && (!entry.where || matchesWhere(n, entry.where) || !saysWhere(n, entry.where)));
    if (same.length > 1) return refuse("sheet.no.manyNamed", { v, type: nodeType, n: String(same.length) });
    if (same.length === 1) targetId = same[0].id;
    else if (f.type === "person_ref" || f.type === "actor_ref" || nodeType === "EpochNode")
      return refuse("sheet.no.person", { v, type: nodeType });
    else {
      targetId = `__new__:${fid}`;
      // SPEC §2.4: created carrying the box's discriminant (a place's kind + level)
      acts.push({ op: "addNode", node: { id: targetId, node_type: nodeType, name: v, description: "", data: { ...(entry.where ?? {}), [MARK]: markFor(def, fid) } } });
      notes.push({ key: "sheet.note.created", p: { v, type: nodeType } });
    }
    if (!(ix.out.get(from) ?? []).some((x) => x.target === targetId && edgeSpellings(et).has(str(x.edge_type))))
      acts.push({ op: "addEdge", source: from, target: targetId, edgeType: et });
  }
  // the pointer BY ROLE: from now on this box's node is this one
  acts.push({ op: "setField", nodeId: unitId, field: `data.${LINKS}.${fid}`, value: targetId ? [targetId] : [] });
  return { acts, notes };
}

/** SPEC §2.6 (ICCD 4.0.0): the TERM that classifies the definition, on its
 *  PropertyNode (`data.concept`): a concept of the box's concept vocabulary
 *  by label, or cleared. Refused while there is no definition. */
export function planConcept(def: CompiledDef, g: Graph, unitId: string, fid: string, input: string, lang: string): Plan {
  const r = readUnit(def, g, unitId, lang).fields.get(fid);
  const entry = def.recipe.fields[fid];
  const c = entry?.property?.concept;
  if (!r || !c) return refuse("sheet.no.field", { field: fid });
  if (!r.nodes.length || r.how.key === "sheet.how.deprecatedElement") return refuse("sheet.ro.definitionFirst", { field: fid });
  const v = input.trim();
  const field = str(c.em_json || "data.concept");
  if (!v) return { acts: [{ op: "setField", nodeId: r.nodes[0], field, value: "" }], notes: [] };
  const hit = conceptsFor(def, fid, lang).concepts.find((x) => x.concept === v || x.label.toLowerCase() === v.toLowerCase());
  if (!hit) return refuse("sheet.no.concept", { v });
  return { acts: [{ op: "setField", nodeId: r.nodes[0], field, value: { concept: hit.concept, label: hit.label } }], notes: [] };
}

/**
 * SPEC §2.5 (3.0.0): the TIME of an act changes (ANNO, DATA RILEVAMENTO, DATA
 * RIELABORAZIONE → `data.act_start`). The act of the unit is found by its
 * discriminant; when there is none it is made — an ActivityNodeGroup carrying
 * `act_kind`, tied to the unit by the anchor's edge — as the recipe's anchor
 * says (`create: true`). A SHARED act (the excavation, `scope: value:anno`) is
 * the one of that year: the unit moves to it, or a new one is made for the year.
 */
export function planActTime(def: CompiledDef, g: Graph, unitId: string, anchor: string, field: string,
                            value: string | number): Plan {
  const a = def.recipe.anchors?.[anchor];
  if (!a?.defined || !a.node?.node_type) return refuse("sheet.ro.anchor", { anchor });
  const edge = (a.steps ?? []).find((s) => s.emit.op === "add_edge")?.emit;
  const et = str(edge?.edge_type || "is_in_activity");
  const ix = index(g);
  const act = actOf(def, g, unitId, anchor);
  const key = field.startsWith("data.") ? field.slice(5) : field;
  const empty = value === "" || value === null || value === undefined;
  const scope = str(a.scope || "unit");
  const notes: Plan["notes"] = [];
  if (scope === "unit" || empty) {
    if (act) return { acts: [{ op: "setField", nodeId: act.id, field, value: empty ? "" : value }], notes };
    if (empty) return { acts: [], notes };
  }
  const acts: Act[] = [];
  let target: string | null = null;
  if (scope !== "unit") {
    // shared: the act of THAT value (an excavation is one per year)
    const same = g.nodes.filter((n) => n.node_type === a.node!.node_type && matchesWhere(n, a.where ?? {})
      && str(dataOf(n)[key]) === str(value) && !dataOf(n).removed);
    if (act && same.some((n) => n.id === act.id)) return { acts: [], notes };
    if (act) {
      const old = (ix.out.get(unitId) ?? []).find((e) => e.target === act.id && edgeSpellings(et).has(str(e.edge_type)));
      if (old) acts.push({ op: "delEdge", edge: old });
    }
    if (same.length) target = same[0].id;
  }
  if (!target) {
    const unit = ix.byId.get(unitId);
    target = `__new__:act:${anchor}`;
    acts.push({ op: "addNode", node: { id: target, node_type: a.node.node_type,
      name: scope === "unit" ? `${str(unit?.name)} · ${anchor}` : str(value), description: "",
      data: { ...(a.where ?? {}), [key]: value } } });
    notes.push({ key: "sheet.note.actCreated", p: { anchor, v: str(value) } });
  } else if (scope === "unit") acts.push({ op: "setField", nodeId: target, field, value });
  acts.push({ op: "addEdge", source: unitId, target, edgeType: et });
  return { acts, notes };
}

/** SPEC §5 (3.0.0): the record's status on the unit (`data.record_status`), a
 *  key of the scheme the definition names — or cleared. */
export function planStatus(def: CompiledDef, unitId: string, key: string): Plan {
  const rs = def.recipe.unit?.record_status;
  if (!rs) return refuse("sheet.no.status");
  if (key && !(rs.values ?? []).includes(key)) return refuse("sheet.no.choice", { v: key });
  return { acts: [{ op: "setField", nodeId: unitId, field: str(rs.em_json || "data.record_status"), value: key }], notes: [] };
}

/** Which unit a typed reference means — never invented, never guessed between
 *  two. The exact name first; then a number alone (`19` for SU019) when ONE
 *  unit of the kind carries that number. */
export function resolveRef(g: Graph, text: string, kind: string):
  { id: string } | { refused: { key: string; p?: Record<string, string> } } {
  const v = text.trim();
  if (!v) return { refused: { key: "sheet.no.number" } };
  const units = g.nodes.filter((n) => isKind(n.node_type, kind) && !(dataOf(n).removed));
  const exact = units.filter((n) => str(n.name).trim().toLowerCase() === v.toLowerCase());
  if (exact.length === 1) return { id: exact[0].id };
  if (exact.length > 1) return { refused: { key: "sheet.no.manyUnits", p: { v, list: exact.map((n) => str(n.name)).join(", ") } } };
  const digits = v.match(/\d+/g);
  if (!digits || digits.length !== 1) return { refused: { key: digits ? "sheet.no.unit" : "sheet.no.number", p: { v } } };
  const want = Number(digits[0]);
  const byNumber = units.filter((n) => {
    const d = str(n.name).match(/\d+/g);
    return !!d && d.length === 1 && Number(d[0]) === want && str(n.name).replace(/\d+/g, "").toLowerCase().includes(v.replace(/\d+/g, "").toLowerCase());
  });
  if (byNumber.length === 1) return { id: byNumber[0].id };
  if (byNumber.length > 1) return { refused: { key: "sheet.no.manyUnits", p: { v, list: byNumber.map((n) => str(n.name)).join(", ") } } };
  return { refused: { key: "sheet.no.unit", p: { v } } };
}

/** A unit added to a relation box: ONE edge, in the canonical direction the
 *  recipe writes, validated as the Matrix validates a connection — the
 *  datamodel admits it between those two types, it is not there already (any
 *  spelling, either end for a symmetric relation). A cycle it closes is said
 *  after it is written (`cyclesThrough`), as the Matrix draws it in red. */
export function planRefAdd(def: CompiledDef, g: Graph, unitId: string, fid: string, text: string): Plan {
  const entry = def.recipe.fields[fid];
  if (!entry || entry.verdict !== "edge") return refuse("sheet.no.field", { field: fid });
  const emit = entry.steps![0].emit;
  const kind = str(entry.resolve?.["$item"]?.find?.kind) || "stratigraphic_unit";
  const hit = resolveRef(g, text, kind);
  if ("refused" in hit) return { acts: [], refused: hit.refused, notes: [] };
  if (hit.id === unitId) return refuse("sheet.no.self");
  const et = canonicalEdgeType(str(emit.edge_type));
  const [s, t] = emit.source === "$unit" ? [unitId, hit.id] : [hit.id, unitId];
  const ix = index(g);
  const sn = ix.byId.get(s), tn = ix.byId.get(t);
  const allowed = allowedEdgeTypes(sn?.node_type, tn?.node_type).map((x) => canonicalEdgeType(x));
  if (!allowed.includes(et))
    return refuse("sheet.no.allowed", { s: str(sn?.name), t: str(tn?.name), edge: et, st: str(sn?.node_type), tt: str(tn?.node_type) });
  const key = relationKey({ source: s, target: t, edge_type: et });
  if (g.edges.some((e) => relationKey(e) === key)) return refuse("sheet.no.there", { s: str(sn?.name), t: str(tn?.name), edge: et });
  return { acts: [{ op: "addEdge", source: s, target: t, edgeType: et }], notes: [] };
}

/** A unit taken out of a relation box: the edge that put it there goes. */
export function planRefRemove(edge: EmEdge): Plan {
  return { acts: [{ op: "delEdge", edge }], notes: [] };
}

/** What `applyPlan` needs of a store: `model.ts`'s DocumentStore has it all. */
export interface StoreLike {
  batch<T>(fn: () => T): T;
  node(id: string): EmNode | undefined;
  newId(): string;
  updateNode(id: string, patch: Partial<EmNode>): void;
  setField(nodeId: string, field: string, value: unknown): void;
  clearField(nodeId: string, field: string): void;
  setPropertyValue(propId: string, value: string): void;
  addNode(node: EmNode): EmNode;
  addEdge(source: string, target: string, edgeType: string): EmEdge;
  deleteEdge(edge: EmEdge): void;
}

/** A plan applied as ONE delta (`store.batch`: one undo step). The ids of the
 *  nodes a plan creates are minted here (`store.newId`), never by the plan;
 *  a new property is made the way the Tabular makes one (`addProperty`, which
 *  `main.ts` passes: em-data's `addQualiaClaim`), then marked. */
export function applyPlan(st: StoreLike, plan: Plan,
                          addProperty: (unitId: string, qualia: string, value: string) => string | null): boolean {
  if (plan.refused || !plan.acts.length) return false;
  const ids = new Map<string, string>();
  const id = (x: string): string => ids.get(x) ?? x;
  const withMark = (nodeId: string, mark: Record<string, unknown>): void => {
    const n = st.node(nodeId);
    if (n) st.updateNode(nodeId, { data: { ...dataOf(n), [MARK]: mark } });
  };
  st.batch(() => {
    for (const a of plan.acts) {
      if (a.op === "update") st.updateNode(id(a.nodeId), a.patch as Partial<EmNode>);
      else if (a.op === "setField") {
        const v = Array.isArray(a.value) ? a.value.map((x) => id(String(x))) : a.value;
        if (v === "" || v === null || v === undefined || (Array.isArray(v) && !v.length)) st.clearField(id(a.nodeId), a.field);
        else st.setField(id(a.nodeId), a.field, v);
      } else if (a.op === "setProp") {
        st.setPropertyValue(a.propId, a.value);
        if (a.mark) withMark(a.propId, a.mark);
      } else if (a.op === "addProp") {
        const pid = addProperty(a.unitId, a.qualia, a.value);
        if (pid) withMark(pid, a.mark);
      } else if (a.op === "addNode") {
        const nid = st.newId();
        ids.set(a.node.id, nid);
        st.addNode({ ...a.node, id: nid });
      } else if (a.op === "addEdge") st.addEdge(id(a.source), id(a.target), a.edgeType);
      else if (a.op === "delEdge") st.deleteEdge(a.edge);
    }
  });
  return true;
}
