/**
 * Naming rules for the paradata chain — pure functions over an em.json document.
 *
 * The EM domain has a naming convention for these three types, and it carries
 * meaning: an extractor called `D.10.2` says *"the second extraction made from
 * document D.10"*, so the name is a readable statement about provenance and a
 * wrong one is a wrong statement. Before this module the app named them
 * `extractor_01` (`DocumentStore.freshLabel`), which says nothing.
 *
 *   Document  `D.<n>`            — D.1, D.10, …           (unique, non-empty)
 *   Extractor `<sourceName>.<NN>` — D.03.01, USM101.01, D.12.101
 *                                  (the source's name AS IT IS, then an ordinal
 *                                  unique per source, TWO digits — three when
 *                                  they are needed: s3Dgraphy's `f"{n:02d}"`)
 *   Extractor `Temp<n>`          — while not yet attached to a document
 *   Combiner  `C.<n>`            — C.1, C.2, …             (unique)
 *
 * # Which edge means what (INSPECTED, not guessed)
 *
 * From `s3Dgraphy_connections_datamodel.json`:
 *
 * * **`extracted_from`** — `ExtractorNode → DocumentNode`, *"information is
 *   derived from a particular source"*. This is the document an extractor
 *   extracts FROM, so it is the one the name derives from.
 * * `has_visual_reference` also joins the two, but its source list is
 *   `[CombinerNode, ExtractorNode, ParadataNode, PropertyNode]` and it means
 *   *"has an associated visual reference"* — an illustration, not a provenance.
 *   Naming from it would rename an extractor because someone attached a picture.
 * * **`combines`** — `CombinerNode → ExtractorNode`: a combiner's sources. Not
 *   used for the name (a combiner is `C.<n>`, independent of its sources) but
 *   recorded here because it is the other half of the chain and the next reader
 *   will look for it.
 *
 * Everything here is a QUESTION about a document, never a change to one: no DOM,
 * no store, no settings lookup — the strict-naming flag arrives as an argument.
 * That is what makes `scripts/check-naming.mjs` able to exercise it.
 */

/** The minimum an em.json needs to answer a naming question. */
export interface NamingDoc {
  graph: {
    nodes: { id: string; node_type: string; name?: string | null }[];
    /**
     * `edge_type` is optional because em.json allows an edge without one (the
     * importer's generic fallback). An untyped edge simply is not the
     * `extracted_from` we are looking for, so nothing needs a special case.
     */
    edges?: { source: string; target: string; edge_type?: string }[];
  };
}

/** The edge that says "this extractor extracts from that document". */
export const EXTRACTED_FROM = "extracted_from";
/** The edge that says "this combiner combines those extractors". */
export const COMBINES = "combines";

export type NameStatus = "ok" | "warn" | "dup";

export interface NameCheck {
  status: NameStatus;
  /** The name the node should have — a correct one, or the next free one. */
  suggestion?: string;
  /** Why, in one phrase, for the tooltip and the context-menu entry. */
  reason?: string;
  /** RIFINITURE · an extractor named before the `<source>.<NN>` rule: the
   *  name is right but for the writing of its ordinal (information only) */
  outOfRule?: boolean;
}

export interface NamingOptions {
  /**
   * `D.<n>` is imposed on documents (default). When false a document may be
   * named freely — still unique and non-empty, but no format warning.
   *
   * A parameter and not a module-level read: `naming.ts` must stay answerable
   * from a test without a settings store.
   */
  strictDocumentNames: boolean;
}

export const DEFAULT_NAMING: NamingOptions = { strictDocumentNames: true };

const DOC_RE = /^D\.(\d+)$/;
const COMBINER_RE = /^C\.(\d+)$/;
const TEMP_RE = /^Temp(\d+)$/;

function nameOf(n: { name?: string | null }): string {
  return String(n.name ?? "").trim();
}

function nodesOfType(doc: NamingDoc, type: string) {
  return doc.graph.nodes.filter((n) => n.node_type === type);
}

/** Smallest positive integer not in `used`. */
function firstFree(used: Set<number>): number {
  let i = 1;
  while (used.has(i)) i += 1;
  return i;
}

/** The edge that puts an annotation region on its image (P106i). */
export const IS_ON_RESOURCE = "is_on_resource";
/** The edge from a document to the file it is made of (P67). */
export const HAS_LINKED_RESOURCE = "has_linked_resource";

/** What an extractor reads FROM, as the name needs it. */
export interface ExtractorSource {
  /** the node the name derives from: a document, or a unit */
  id: string;
  name: string;
  kind: "document" | "unit";
  /** set when the reading goes through an annotation region of that document */
  regionId?: string;
}

/**
 * The document a REGION is on: its `is_on_resource` target (or `data.resource_id`)
 * when that is a document, else the document that `has_linked_resource` the
 * image file. Null when the region is on a bare file nobody promoted.
 */
function documentOfRegion(
  doc: NamingDoc,
  regionId: string,
  byId: Map<string, NamingDoc["graph"]["nodes"][number]>,
): { id: string; name: string } | null {
  const region = byId.get(regionId) as { data?: Record<string, unknown> } | undefined;
  const onIds = (doc.graph.edges ?? [])
    .filter((e) => e.edge_type === IS_ON_RESOURCE && e.source === regionId)
    .map((e) => e.target);
  const rid = region?.data?.resource_id;
  if (typeof rid === "string" && !onIds.includes(rid)) onIds.push(rid);
  for (const on of onIds) {
    const t = byId.get(on);
    if (t?.node_type === "document") return { id: t.id, name: nameOf(t) };
    for (const e of doc.graph.edges ?? []) {
      if (e.edge_type !== HAS_LINKED_RESOURCE || e.target !== on) continue;
      const d = byId.get(e.source);
      if (d?.node_type === "document") return { id: d.id, name: nameOf(d) };
    }
  }
  return null;
}

/**
 * What an extractor extracts FROM, via `extracted_from` — the node its name
 * derives from.
 *
 * Connections 1.6.24 lists three kinds of target, and each names the extractor:
 *   · a DOCUMENT — `D.3` → `D.3.<n>`;
 *   · an ANNOTATION REGION — the traced part of an image: the name comes from
 *     the DOCUMENT the region is on (`D.3.<n>`, the reading is still "the n-th of
 *     D.3"); a region on an unpromoted file names nothing, and the extractor
 *     stays `Temp<n>`;
 *   · a STRATIGRAPHIC UNIT (since 1.6.24, a property read off another unit) —
 *     `USM101` → `USM101.<n>`, the same rule with the unit's name.
 * The datamodel admits nothing else as a target, so any other target type is
 * read as a unit: the socket check (`issues`, rule `datamodel`) is where a wrong
 * edge is reported, not the name.
 *
 * When an extractor points at SEVERAL sources the first edge in document order
 * wins, deterministically. That is a legal graph (an extraction can cite more
 * than one source) and the name can only carry one, so the rule is stated rather
 * than left to chance.
 */
export function sourceOfExtractor(doc: NamingDoc, extractorId: string): ExtractorSource | null {
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  for (const e of doc.graph.edges ?? []) {
    if (e.edge_type !== EXTRACTED_FROM || e.source !== extractorId) continue;
    const target = byId.get(e.target);
    if (!target) continue;
    if (target.node_type === "document")
      return { id: target.id, name: nameOf(target), kind: "document" };
    if (target.node_type === "annotation_region") {
      const d = documentOfRegion(doc, target.id, byId);
      if (d) return { ...d, kind: "document", regionId: target.id };
      continue;
    }
    return { id: target.id, name: nameOf(target), kind: "unit" };
  }
  return null;
}

/**
 * The document (or, since connections 1.6.24, the unit) an extractor extracts
 * from — `sourceOfExtractor` without the kind. Kept under its old name: it is
 * the question every caller of NAME1 asks.
 */
export function documentOfExtractor(
  doc: NamingDoc,
  extractorId: string,
): { id: string; name: string } | null {
  const s = sourceOfExtractor(doc, extractorId);
  return s ? { id: s.id, name: s.name } : null;
}

/** Extractor ids attached to a given document id. */
export function extractorsOfDocument(doc: NamingDoc, documentId: string): string[] {
  const out: string[] = [];
  for (const e of doc.graph.edges ?? []) {
    if (e.edge_type !== EXTRACTED_FROM || out.includes(e.source)) continue;
    if (e.target === documentId || sourceOfExtractor(doc, e.source)?.id === documentId)
      out.push(e.source);
  }
  return out;
}

/**
 * RIFINITURE · the ordinal as the rule writes it: two digits, three (or more)
 * when they are needed — `1` → `01`, `101` → `101`. The same as s3Dgraphy's
 * xlsx importer (`f"{doc_short}.{counter:02d}"`, unified_xlsx_importer.py), so
 * an extractor named here and one named by the importer read the same.
 */
export function ordinalTag(n: number): string {
  return String(n).padStart(2, "0");
}

/** The ordinal a name carries after `<source>.`, whatever its format (`1`,
 *  `01`, `001` → 1), or null when the tail is not a number. */
function ordinalAfter(name: string, prefix: string): number | null {
  if (!name.startsWith(prefix)) return null;
  const tail = name.slice(prefix.length);
  return /^\d+$/.test(tail) && Number(tail) > 0 ? Number(tail) : null;
}

/**
 * The next free ordinal for extractors of a source, by NAME.
 *
 * Reads the ordinals off the existing names rather than counting nodes: with
 * `D.10.01` and `D.10.03` present the answer is 2, and filling the hole is right —
 * a document's extractors are a set of numbered extractions, not a sequence, and
 * jumping to 4 would suggest a `D.10.02` exists somewhere. An ordinal written
 * out of the rule (`D.10.1`, from before RIFINITURE) is still that ordinal: it
 * is TAKEN, so a new extractor never becomes a second «first of D.10».
 * `exceptId` leaves one extractor out — the one being (re)named.
 */
export function nextExtractorOrdinal(doc: NamingDoc, documentName: string, exceptId?: string): number {
  const base = documentName.trim();
  if (!base) return 1;
  const prefix = `${base}.`;
  const used = new Set<number>();
  for (const n of nodesOfType(doc, "extractor")) {
    if (n.id === exceptId) continue;
    const k = ordinalAfter(nameOf(n), prefix);
    if (k !== null) used.add(k);
  }
  return firstFree(used);
}

/**
 * The name an extractor SHOULD have, or null when it is attached to no document
 * (or to one whose own name is empty — then there is nothing to derive from and
 * the extractor keeps a temporary name).
 *
 * When the extractor already carries an ordinal for that source it KEEPS the
 * number: re-deriving would renumber a node every time the graph is checked. An
 * ordinal out of the rule keeps its number too and only changes its writing
 * (`D.3.1` → `D.3.01`), unless another extractor of the same source holds it.
 */
export function deriveExtractorName(
  doc: NamingDoc,
  extractorId: string,
): string | null {
  const parent = documentOfExtractor(doc, extractorId);
  if (!parent || !parent.name) return null;
  const self = doc.graph.nodes.find((n) => n.id === extractorId);
  const current = self ? nameOf(self) : "";
  const prefix = `${parent.name}.`;
  const mine = ordinalAfter(current, prefix);
  if (mine !== null) {
    const want = `${prefix}${ordinalTag(mine)}`;
    const clash = doc.graph.nodes.some((n) => {
      if (n.id === extractorId) return false;
      if (nameOf(n) === want) return true;
      return n.node_type === "extractor" && ordinalAfter(nameOf(n), prefix) === mine;
    });
    if (!clash) return want; // right, or right but for the writing of the number
  }
  return `${prefix}${ordinalTag(nextExtractorOrdinal(doc, parent.name, extractorId))}`;
}

/**
 * RIFINITURE · true when an extractor's name is the rule's name but for the
 * writing of its ordinal (`D.3.1`, `USM101.1`, `D.3.001` beside `D.3.01`): an
 * extractor named before the rule changed. INFORMATION, never a warning, and
 * never renamed on its own — `ruleRenames` is the explicit command.
 */
export function isOutOfRule(doc: NamingDoc, extractorId: string): boolean {
  const self = doc.graph.nodes.find((n) => n.id === extractorId);
  if (!self || self.node_type !== "extractor") return false;
  const parent = documentOfExtractor(doc, extractorId);
  if (!parent?.name) return false;
  const name = nameOf(self);
  const prefix = `${parent.name}.`;
  const k = ordinalAfter(name, prefix);
  return k !== null && name !== `${prefix}${ordinalTag(k)}`;
}

/**
 * RIFINITURE · «Rinomina secondo la regola»: the renames that bring the given
 * extractors (all the out-of-rule ones when `ids` is omitted) to the rule,
 * computed ONE AFTER THE OTHER on a copy of the names — so two extractors never
 * receive the same free ordinal. Pure: the caller applies the list in one
 * `batch` (one undo step).
 */
export function ruleRenames(
  doc: NamingDoc,
  ids?: string[],
): { id: string; from: string; to: string }[] {
  const work: NamingDoc = {
    graph: { nodes: doc.graph.nodes.map((n) => ({ ...n })), edges: doc.graph.edges },
  };
  const targets = ids ?? work.graph.nodes.filter((n) => isOutOfRule(work, n.id)).map((n) => n.id);
  const out: { id: string; from: string; to: string }[] = [];
  for (const id of targets) {
    const node = work.graph.nodes.find((n) => n.id === id);
    if (!node || node.node_type !== "extractor") continue;
    const to = deriveExtractorName(work, id);
    const from = nameOf(node);
    if (!to || to === from) continue;
    node.name = to;
    out.push({ id, from, to });
  }
  return out;
}

/** Next free `C.<n>`. */
export function deriveCombinerName(doc: NamingDoc): string {
  const used = new Set<number>();
  for (const n of doc.graph.nodes) {
    const m = COMBINER_RE.exec(nameOf(n));
    if (m) used.add(Number(m[1]));
  }
  return `C.${firstFree(used)}`;
}

/** Next free `D.<n>`. */
export function nextDocumentName(doc: NamingDoc): string {
  const used = new Set<number>();
  // CAMPAGNA (1 ott, difetto 4) · the GRAPH's spelling: TempluMare writes D.01…
  // D.08, and the next one is D.09, not D.9. The width is the widest number
  // written with a leading zero (D.1000 or D.20 say nothing about padding); a
  // graph with no zero-padded document keeps D.1, D.2…
  let pad = 0;
  for (const n of doc.graph.nodes) {
    const m = DOC_RE.exec(nameOf(n));
    if (!m) continue;
    used.add(Number(m[1]));
    if (m[1].length > 1 && m[1].startsWith("0")) pad = Math.max(pad, m[1].length);
  }
  return `D.${String(firstFree(used)).padStart(pad, "0")}`;
}

/** Next free `Temp<n>` — an extractor that has no document yet. */
export function nextTempName(doc: NamingDoc): string {
  const used = new Set<number>();
  for (const n of doc.graph.nodes) {
    const m = TEMP_RE.exec(nameOf(n));
    if (m) used.add(Number(m[1]));
  }
  return `Temp${firstFree(used)}`;
}

/**
 * The name to give a NEW node of one of the three types.
 *
 * Called at creation, when the node usually has no edges yet: an extractor born
 * unattached gets `Temp<n>`, and it is the moment the `extracted_from` edge
 * appears that gives it its real name (see `renameOnAttach`).
 */
export function initialName(doc: NamingDoc, nodeType: string, nodeId?: string): string | null {
  if (nodeType === "combiner") return deriveCombinerName(doc);
  if (nodeType === "document") return nextDocumentName(doc);
  if (nodeType === "extractor") {
    const derived = nodeId ? deriveExtractorName(doc, nodeId) : null;
    return derived ?? nextTempName(doc);
  }
  return null; // every other type keeps the store's own fresh label
}

/**
 * SHIFT-A · «the next free identifier of the type» for a unit or any other node
 * outside the paradata convention: read off the names the document already
 * gives to that type, never invented.
 *
 * The prefix and the digit width are the ones most used by existing nodes of
 * the SAME type (`SU001…SU050` → `SU051`; `RSF101` → `RSF102`), the number the
 * first after the highest in use. A type with no numbered names yet answers
 * null, and the caller keeps the store's generic label.
 */
export function nextFreeName(doc: NamingDoc, nodeType: string): string | null {
  const re = /^([A-Za-z]+[._-]?)(\d+)$/;
  const byPrefix = new Map<string, { count: number; width: number; max: number }>();
  const names = new Set<string>();
  for (const n of doc.graph.nodes) {
    const name = nameOf(n);
    names.add(name);
    if ((n as { node_type?: string }).node_type !== nodeType) continue;
    const m = re.exec(name);
    if (!m) continue;
    const e = byPrefix.get(m[1]) ?? { count: 0, width: 0, max: 0 };
    e.count++;
    e.width = Math.max(e.width, m[2].length);
    e.max = Math.max(e.max, Number(m[2]));
    byPrefix.set(m[1], e);
  }
  const best = [...byPrefix].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))[0];
  if (!best) return null;
  const [prefix, e] = best;
  let k = e.max + 1;
  let out = `${prefix}${String(k).padStart(e.width, "0")}`;
  while (names.has(out)) out = `${prefix}${String(++k).padStart(e.width, "0")}`;
  return out;
}

/** True when this type takes part in the convention at all. */
export function isNamedType(nodeType: string | undefined): boolean {
  return nodeType === "extractor" || nodeType === "combiner" || nodeType === "document";
}

/**
 * Status of one node's name: `ok`, `warn` (malformed, inconsistent, still
 * temporary) or `dup` (another node has the same name).
 *
 * `dup` outranks `warn`: two nodes with one name is the failure that makes a
 * matrix unreadable, and it is also the only one a reader cannot spot by looking
 * at a single node.
 */
export function computeNameStatus(
  doc: NamingDoc,
  nodeId: string,
  opts: NamingOptions = DEFAULT_NAMING,
): NameCheck {
  const node = doc.graph.nodes.find((n) => n.id === nodeId);
  if (!node || !isNamedType(node.node_type)) return { status: "ok" };
  const name = nameOf(node);

  // empty is an error for all three types, whatever the flag says
  if (!name) {
    return {
      status: "warn",
      suggestion: initialName(doc, node.node_type, nodeId) ?? undefined,
      reason: "the name is empty",
    };
  }

  // duplicates first
  const twin = doc.graph.nodes.find((n) => n.id !== nodeId && nameOf(n) === name);
  if (twin) {
    const suggestion =
      node.node_type === "extractor"
        ? (deriveExtractorName(doc, nodeId) ?? nextTempName(doc))
        : node.node_type === "combiner"
          ? deriveCombinerName(doc)
          : nextDocumentName(doc);
    return {
      status: "dup",
      suggestion,
      reason: `"${name}" is already used by another node`,
    };
  }

  if (node.node_type === "document") {
    if (!opts.strictDocumentNames || DOC_RE.test(name)) return { status: "ok" };
    return {
      status: "warn",
      suggestion: nextDocumentName(doc),
      reason: `a document should be named D.<n> (strict naming is on)`,
    };
  }

  if (node.node_type === "combiner") {
    if (COMBINER_RE.test(name)) return { status: "ok" };
    return {
      status: "warn",
      suggestion: deriveCombinerName(doc),
      reason: "a combiner should be named C.<n>",
    };
  }

  // extractor
  const derived = deriveExtractorName(doc, nodeId);
  if (!derived) {
    // no document yet → a temporary name is the CORRECT state, not a problem…
    if (TEMP_RE.test(name)) {
      return {
        status: "warn",
        reason: "temporary name — attach it to a document to number it",
      };
    }
    // …but anything else is a name that claims a provenance it does not have
    return {
      status: "warn",
      suggestion: nextTempName(doc),
      reason: "not attached to a document: the name should be Temp<n>",
    };
  }
  if (name === derived) return { status: "ok" };
  const parent = documentOfExtractor(doc, nodeId);
  if (isOutOfRule(doc, nodeId))
    return {
      status: "warn",
      outOfRule: true,
      suggestion: derived,
      reason: `named before the rule <source>.<NN>: ${derived}`,
    };
  return {
    status: "warn",
    suggestion: derived,
    reason: `extracted from ${parent?.name ?? "a document"}: the name should be ${derived}`,
  };
}

/**
 * Every node whose name needs attention, for a whole-document pass.
 *
 * Used by the renderer (label colour) and by the context menu, so both read one
 * answer instead of computing their own.
 */
export function nameStatusMap(
  doc: NamingDoc,
  opts: NamingOptions = DEFAULT_NAMING,
): Map<string, NameCheck> {
  const out = new Map<string, NameCheck>();
  for (const n of doc.graph.nodes) {
    if (!isNamedType(n.node_type)) continue;
    const check = computeNameStatus(doc, n.id, opts);
    if (check.status !== "ok") out.set(n.id, check);
  }
  return out;
}

/**
 * The rename an `extracted_from` edge implies, or null when nothing should change.
 *
 * This is the trigger the convention actually hangs on: EMStudio has no
 * "create a node from the document's handle and name it on the way" path — the
 * connect gesture creates the node first and the edge second (`finishConnect` →
 * `createNodeAt`). So the extractor is born `Temp<n>` and gets its real name the
 * instant it is attached, which is also the right behaviour for an extractor a
 * user attaches by hand ten minutes later.
 */
export function renameOnAttach(doc: NamingDoc, extractorId: string): string | null {
  const node = doc.graph.nodes.find((n) => n.id === extractorId);
  if (!node || node.node_type !== "extractor") return null;
  const derived = deriveExtractorName(doc, extractorId);
  if (!derived) return null;
  return nameOf(node) === derived ? null : derived;
}

/** The edge that gives a paradata group its referent (owner → group). */
export const HAS_PARADATA_NODEGROUP = "has_paradata_nodegroup";

/**
 * BUGS-UI · the display name of a paradata group: **`PD_<referent>`** — the
 * group of `US_100` is `PD_US_100`.
 *
 * A paradata group is always read NEXT TO its referent (in the EMTree, in the
 * node list, as a tablet on the node), where a prose caption like
 * "US_100 · paradata" is the referent's name plus noise. The `PD_` prefix says
 * what the box is in the two characters the eye already has to cross.
 *
 * Ids stay UUIDs — this is the LABEL only.
 */
export function paradataGroupName(referentName: string | undefined): string {
  const base = (referentName ?? "").trim();
  return base ? `PD_${base}` : "PD";
}

/**
 * The name a paradata group should take once it is attached to a referent, or
 * null when it already has it. The counterpart of `renameOnAttach` for the
 * connect gesture: a PDG created from the palette is born with a generic label
 * and only learns its referent when the `has_paradata_nodegroup` edge is drawn.
 */
export function paradataGroupRenameOnAttach(
  doc: NamingDoc,
  pdgId: string,
): string | null {
  const pdg = doc.graph.nodes.find((n) => n.id === pdgId);
  if (!pdg) return null;
  const edge = (doc.graph.edges ?? []).find(
    (e) => e.edge_type === HAS_PARADATA_NODEGROUP && e.target === pdgId,
  );
  const referent = doc.graph.nodes.find((n) => n.id === edge?.source);
  if (!referent) return null;
  const derived = paradataGroupName(nameOf(referent) || referent.id);
  return nameOf(pdg) === derived ? null : derived;
}
