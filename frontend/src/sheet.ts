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
  note?: string;
}
export interface RecipeStep { emit: Record<string, unknown>; when?: string }
export interface RecipeEntry {
  verdict: string;
  each?: boolean;
  steps?: RecipeStep[];
  resolve?: Record<string, { find?: Record<string, unknown>; create?: boolean; mint?: boolean; when_missing?: string }>;
  property?: { property_type?: string; per_item_from?: string; box?: string; registered_qualia?: boolean };
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
    anchors?: Record<string, { declared_by?: string[]; defined?: boolean }>;
    open?: Array<{ field: string; what: string }>;
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

/** Every vendored definition, the one per id this copy holds (its latest). */
export function definitions(): CompiledDef[] {
  return DEFS;
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
  const def = DEFS.find((d) => d.header.id === choice.id) ?? null;
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
  const scheme = f?.vocabulary?.scheme ?? null;
  if (!scheme) return { scheme: null, answeredBy: null, concepts: [] };
  let v = VOCABS.get(scheme);
  let answeredBy: string | null = scheme;
  if ((!v || !v.concepts.length) && (f?.vocabulary?.provisional || v?.provisional)) {
    answeredBy = f?.vocabulary?.provisional ?? v?.provisional ?? null;
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
}

export interface UnitReading {
  unitId: string;
  fields: Map<string, FieldReading>;
  /** the unit's properties no box of this sheet reads (StratiField's `unread`):
   *  shown under the sheet, never lost in silence */
  unread: Array<{ id: string; qualia: string; value: string }>;
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
  const byQualia = (q: string): EmNode[] => props.filter((p) => !claimed.has(p.id) && !used.has(p.id) && qualiaOf(p) === q);

  const nameOf = (n: EmNode | undefined): string => str(n?.name).trim();

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
        // THE LENS on an element: a graph written before `definition` became an
        // element of the node (nodes 1.6.9) carries it as a PropertyNode of the
        // same name — read, said, never translated into the element on its own
        const lensProps = byQualia(entry.element.name);
        if (lensProps.length) {
          lensProps.forEach((p) => used.add(p.id));
          r.value = { label: propValue(lensProps[0]) };
          r.lens = true;
          r.nodes = lensProps.map((p) => p.id);
          r.how = { key: "sheet.how.lensElement", p: { field, qualia: entry.element.name } };
        } else r.how = { key: "sheet.how.nativeEmpty", p: { field } };
      } else r.how = { key: "sheet.how.nativeEmpty", p: { field } };
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
      let nodes = (minted.get(fid) ?? []).filter((p) => !entry.property?.property_type || qualiaOf(p) === entry.property.property_type);
      if (!nodes.length && q) {
        nodes = byQualia(q);
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
        r.how = { key: "sheet.how.propertyRows", p: { box: str(entry.property?.box) } };
      done();
      continue;
    }

    // a node of its own, reached by an edge
    const edgeStep = steps.find((s) => s.emit.op === "add_edge")?.emit;
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
    const outgoing = src === "$unit" || src.startsWith("$field.");
    const et = str(edgeStep.edge_type);
    const pointed = links(fid);
    const found: EmNode[] = [];
    const unattributed: EmNode[] = [];
    for (const e of outgoing ? (ix.out.get(from) ?? []) : (ix.inn.get(from) ?? [])) {
      if (!edgeSpellings(et).has(str(e.edge_type))) continue;
      const other = ix.byId.get(outgoing ? e.target : e.source);
      if (!other || other.node_type !== nodeType) continue;
      if (pointed) { if (pointed.includes(other.id)) found.push(other); continue; }
      const m = markOf(other);
      if (m.field) { if (m.field === fid && (!m.template || m.template === def.header.id)) found.push(other); continue; }
      if (rivals(def, et, nodeType) <= 1) found.push(other);
      else unattributed.push(other);
    }
    r.nodes = found.map((n) => n.id);
    const shown = (n: EmNode): string => f.type === "longtext" ? str(n.description) : (f.type === "resource_ref_list" ? str(dataOf(n).url || n.name) : nameOf(n));
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
  return { unitId, fields, unread };
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
  return { template: def.header.id, template_version: def.header.version, values };
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
  const edgeStep = steps.find((s) => s.emit.op === "add_edge")?.emit;
  const nodeType = str(entry.node?.node_type);
  if (!edgeStep || !nodeType || str(edgeStep.source) !== "$unit") return refuse("sheet.no.shape");
  if (f.type === "resource_ref_list" || f.type === "record_ref_list") return refuse("sheet.no.rows");
  const et = str(edgeStep.edge_type);
  const ix = index(g);
  const acts: Act[] = [];
  const notes: Plan["notes"] = [];
  // the edges of THIS box that are there now: they go
  for (const id of r.nodes) {
    const e = (ix.out.get(unitId) ?? []).find((x) => x.target === id && edgeSpellings(et).has(str(x.edge_type)));
    if (e) acts.push({ op: "delEdge", edge: e });
  }
  let targetId: string | null = null;
  if (v) {
    const same = g.nodes.filter((n) => n.node_type === nodeType && str(n.name).trim().toLowerCase() === v.toLowerCase());
    if (same.length > 1) return refuse("sheet.no.manyNamed", { v, type: nodeType, n: String(same.length) });
    if (same.length === 1) targetId = same[0].id;
    else if (f.type === "person_ref" || f.type === "actor_ref" || nodeType === "EpochNode")
      return refuse("sheet.no.person", { v, type: nodeType });
    else {
      targetId = `__new__:${fid}`;
      acts.push({ op: "addNode", node: { id: targetId, node_type: nodeType, name: v, description: "", data: { [MARK]: markFor(def, fid) } } });
      notes.push({ key: "sheet.note.created", p: { v, type: nodeType } });
    }
    if (!(ix.out.get(unitId) ?? []).some((x) => x.target === targetId && edgeSpellings(et).has(str(x.edge_type))))
      acts.push({ op: "addEdge", source: unitId, target: targetId, edgeType: et });
  }
  // the pointer BY ROLE: from now on this box's node is this one
  acts.push({ op: "setField", nodeId: unitId, field: `data.${LINKS}.${fid}`, value: targetId ? [targetId] : [] });
  return { acts, notes };
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
      if (a.op === "update") st.updateNode(a.nodeId, a.patch as Partial<EmNode>);
      else if (a.op === "setField") {
        const v = Array.isArray(a.value) ? a.value.map((x) => id(String(x))) : a.value;
        if (v === "" || v === null || v === undefined || (Array.isArray(v) && !v.length)) st.clearField(a.nodeId, a.field);
        else st.setField(a.nodeId, a.field, v);
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
