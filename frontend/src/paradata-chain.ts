/**
 * CATENA · the paradata chain of a property, read and grown — pure over the
 * em.json document, mutations through the store (one gesture = one `batch`).
 *
 *     unit ──has_property──▶ property ──has_data_provenance──▶ extractor ──extracted_from──▶ document
 *                                    └──has_data_provenance──▶ combiner ──combines──▶ extractor …
 *
 * Every edge named here is read off the connections datamodel (1.6.26), not
 * invented: `has_property` (with more than one owner since 1.6.23, the heirs
 * marked `attributes.inherited`), `has_data_provenance`, `combines`,
 * `extracted_from` (document, annotation region, and since 1.6.24 a unit),
 * `is_on_resource` (a region on its document). The one thing that is NOT in the
 * datamodel is how a reading of TEXT or of a 3D MODEL records where it looked:
 * that is `data.geometry` on the extractor (see `Geometry`), declared here and
 * listed as open in the night's report. A reading of an IMAGE uses the
 * datamodel's own node, the AnnotationRegion.
 *
 * `scripts/check-paradata-chain.mjs` exercises this file in node.
 */
import type { DocumentStore } from "./model";
import type { EmDocument, EmEdge, EmNode } from "./types";
import {
  COMBINES,
  EXTRACTED_FROM,
  IS_ON_RESOURCE,
  deriveCombinerName,
  initialName,
  renameOnAttach,
  sourceOfExtractor,
  type ExtractorSource,
} from "./naming";

export const HAS_PROPERTY = "has_property";
export const HAS_DATA_PROVENANCE = "has_data_provenance";
export const IS_IN_PARADATA_NODEGROUP = "is_in_paradata_nodegroup";
export const HAS_PARADATA_NODEGROUP = "has_paradata_nodegroup";
/** the edge attribute that declares an inheriting owner (s3dgraphy.ownership) */
export const INHERITED_KEY = "inherited";

// ── reading the graph ────────────────────────────────────────────────────────

const isLiveEdge = (e: EmEdge): boolean =>
  !((e.attributes ?? {}) as Record<string, unknown>).removed;
const isLiveNode = (n: EmNode): boolean => !((n.data ?? {}) as Record<string, unknown>).removed;

function edges(doc: EmDocument): EmEdge[] {
  return doc.graph.edges.filter(isLiveEdge);
}
function nodeOf(doc: EmDocument, id: string | undefined): EmNode | undefined {
  return id ? doc.graph.nodes.find((n) => n.id === id && isLiveNode(n)) : undefined;
}
const out = (doc: EmDocument, id: string, type: string): string[] =>
  edges(doc).filter((e) => e.source === id && e.edge_type === type).map((e) => e.target);
const inn = (doc: EmDocument, id: string, type: string): string[] =>
  edges(doc).filter((e) => e.target === id && e.edge_type === type).map((e) => e.source);
const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

/** A property's value. EMStudio writes it in `description` (`setPropertyValue`);
 *  s3Dgraphy's importers also leave it in `data.value`. */
export function propertyValue(p: EmNode | undefined): string {
  if (!p) return "";
  const d = String(p.description ?? "").trim();
  if (d) return d;
  const v = ((p.data ?? {}) as Record<string, unknown>).value;
  return v == null ? "" : String(v);
}
/** The name a property is compared by: its qualia type, else its name. */
export function propertyKey(p: EmNode | undefined): string {
  if (!p) return "";
  const t = ((p.data ?? {}) as Record<string, unknown>).property_type;
  return String(t || p.name || "").trim().toLowerCase();
}

/** The properties a node owns (every live `has_property`). */
export function propertiesOf(doc: EmDocument, ownerId: string): string[] {
  return uniq(out(doc, ownerId, HAS_PROPERTY)).filter((id) => nodeOf(doc, id));
}

export interface Owner {
  owner: string;
  edge: EmEdge;
  original: boolean;
  inherited: boolean;
}

/**
 * The owners of a property, the ORIGINAL first — the TS reading of
 * `s3dgraphy.ownership.property_owners`, with its three rules in its order:
 * the edge without `inherited`, else the owner whose paradata group holds the
 * property, else the earliest `created_at`. When none decides, nobody is the
 * original (list order is not a rule).
 */
export function ownersOf(doc: EmDocument, propertyId: string): Owner[] {
  const es = edges(doc).filter((e) => e.edge_type === HAS_PROPERTY && e.target === propertyId);
  const seen = new Set<string>();
  const list: Owner[] = [];
  for (const e of es) {
    if (seen.has(e.source)) continue;
    seen.add(e.source);
    list.push({ owner: e.source, edge: e, original: false,
                inherited: !!((e.attributes ?? {}) as Record<string, unknown>)[INHERITED_KEY] });
  }
  const orig = originalOwner(doc, propertyId, list);
  for (const o of list) o.original = o.owner === orig;
  return list.sort((a, b) => Number(b.original) - Number(a.original));
}

function originalOwner(doc: EmDocument, propertyId: string, list: Owner[]): string | null {
  if (!list.length) return null;
  if (list.length === 1) return list[0].owner;
  const unmarked = list.filter((o) => !o.inherited);
  if (unmarked.length === 1) return unmarked[0].owner;
  const cands = unmarked.length ? unmarked : list;
  const groups = new Set(out(doc, propertyId, IS_IN_PARADATA_NODEGROUP));
  const groupOwners = new Set(edges(doc)
    .filter((e) => e.edge_type === HAS_PARADATA_NODEGROUP && groups.has(e.target))
    .map((e) => e.source));
  const inGroup = cands.filter((o) => groupOwners.has(o.owner));
  if (inGroup.length === 1) return inGroup[0].owner;
  const stamped = cands
    .map((o) => [String(((o.edge.attributes ?? {}) as Record<string, unknown>).created_at ?? ""), o.owner] as const)
    .filter(([ts]) => ts)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (stamped.length) {
    const first = stamped[0][0];
    const atFirst = new Set(stamped.filter(([ts]) => ts === first).map(([, o]) => o));
    if (atFirst.size === 1) return stamped[0][1];
  }
  return null;
}

/** The provenance of a property: its combiner (if any) and every extractor,
 *  each with the step it hangs from. */
export interface Provenance {
  combiners: string[];
  /** extractors directly under the property */
  direct: string[];
  /** extractors under a combiner, by combiner */
  combined: Map<string, string[]>;
}
export function provenanceOf(doc: EmDocument, propertyId: string): Provenance {
  const prov = uniq(out(doc, propertyId, HAS_DATA_PROVENANCE));
  const typeOf = (id: string) => nodeOf(doc, id)?.node_type;
  const combiners = prov.filter((id) => typeOf(id) === "combiner");
  const direct = prov.filter((id) => typeOf(id) === "extractor");
  const combined = new Map(combiners.map((c) =>
    [c, uniq(out(doc, c, COMBINES)).filter((x) => typeOf(x) === "extractor")] as const));
  return { combiners, direct, combined };
}
/** Every extractor of a property, direct or through a combiner. */
export function extractorsOfProperty(doc: EmDocument, propertyId: string): string[] {
  const p = provenanceOf(doc, propertyId);
  return uniq([...p.direct, ...[...p.combined.values()].flat()]);
}
/** The property an extractor feeds (directly, or through its combiner). */
export function propertyOfExtractor(doc: EmDocument, extractorId: string): string | null {
  const direct = inn(doc, extractorId, HAS_DATA_PROVENANCE)[0];
  if (direct) return direct;
  for (const c of inn(doc, extractorId, COMBINES)) {
    const p = inn(doc, c, HAS_DATA_PROVENANCE)[0];
    if (p) return p;
  }
  return null;
}
export function sourceOf(doc: EmDocument, extractorId: string): ExtractorSource | null {
  return sourceOfExtractor(doc, extractorId);
}

// ── the geometry of a reading ────────────────────────────────────────────────

/**
 * Where a reading looked, by medium.
 *
 *   region  — on an image: the datamodel's AnnotationRegionNode (normalised
 *             rect/polygon), which the extractor `extracted_from`s and which is
 *             `is_on_resource` its document;
 *   passage — in a text: `data.geometry = {kind:"passage", start, end, text}`,
 *             character offsets into the text as shown plus the quoted words
 *             (the W3C TextPosition + TextQuote pair: the offsets say where,
 *             the quote survives an edit that moves them);
 *   point3d — on a 3D model: `data.geometry = {kind:"point3d", p:[x,y,z], on?}`,
 *             in the model's own frame.
 */
export type Geometry =
  | { kind: "region"; regionId: string; shape_kind: string; rect?: number[]; points?: number[][] }
  | { kind: "passage"; start: number; end: number; text: string }
  | { kind: "point3d"; p: [number, number, number]; on?: string };

export function geometryOf(doc: EmDocument, extractorId: string): Geometry | null {
  for (const t of out(doc, extractorId, EXTRACTED_FROM)) {
    const r = nodeOf(doc, t);
    if (r?.node_type !== "annotation_region") continue;
    const d = (r.data ?? {}) as Record<string, unknown>;
    return { kind: "region", regionId: r.id, shape_kind: String(d.shape_kind ?? "rect"),
             ...(Array.isArray(d.rect) ? { rect: d.rect as number[] } : {}),
             ...(Array.isArray(d.points) ? { points: d.points as number[][] } : {}) };
  }
  const g = ((nodeOf(doc, extractorId)?.data ?? {}) as Record<string, unknown>).geometry as
    Record<string, unknown> | undefined;
  if (g?.kind === "passage")
    return { kind: "passage", start: Number(g.start ?? 0), end: Number(g.end ?? 0), text: String(g.text ?? "") };
  if (g?.kind === "point3d" && Array.isArray(g.p) && g.p.length === 3)
    return { kind: "point3d", p: (g.p as number[]).map(Number) as [number, number, number],
             ...(g.on ? { on: String(g.on) } : {}) };
  return null;
}

/** What a reading found — the text the next step can take as a value. */
export function resultOf(doc: EmDocument, extractorId: string): string {
  const g = geometryOf(doc, extractorId);
  const x = nodeOf(doc, extractorId);
  const own = String(((x?.data ?? {}) as Record<string, unknown>).result ?? "").trim();
  if (own) return own;
  if (!g) return "";
  if (g.kind === "passage") return g.text;
  if (g.kind === "point3d") return `z ${g.p[2].toFixed(2)} m`;
  if (g.rect) return `${Math.round(g.rect[2] * 100)}% × ${Math.round(g.rect[3] * 100)}%`;
  return "";
}

/** The extractors that read a document — directly, or through one of its regions. */
export function readingsOfDocument(doc: EmDocument, documentId: string): string[] {
  const direct = inn(doc, documentId, EXTRACTED_FROM);
  const regions = inn(doc, documentId, IS_ON_RESOURCE)
    .filter((r) => nodeOf(doc, r)?.node_type === "annotation_region");
  const viaRegion = regions.flatMap((r) => inn(doc, r, EXTRACTED_FROM));
  return uniq([...direct, ...viaRegion]).filter((x) => nodeOf(doc, x)?.node_type === "extractor");
}

// ── the paradata group ───────────────────────────────────────────────────────

/** The paradata group of an owner (`has_paradata_nodegroup`), if it has one. */
export function paradataGroupOf(doc: EmDocument, ownerId: string): string | null {
  return out(doc, ownerId, HAS_PARADATA_NODEGROUP)[0] ?? null;
}
/** The group the chain of a property lives in: its original owner's. */
function chainGroup(doc: EmDocument, propertyId: string): string | null {
  const inGroup = out(doc, propertyId, IS_IN_PARADATA_NODEGROUP)[0];
  if (inGroup) return inGroup;
  const orig = ownersOf(doc, propertyId).find((o) => o.original)?.owner;
  return orig ? paradataGroupOf(doc, orig) : null;
}

// ── growing the chain ────────────────────────────────────────────────────────

/**
 * «Eredita da…» — the candidates: the properties of OTHER units this owner does
 * not have yet, those with the same name as one of its own first (the case the
 * gesture exists for: the USV/s taking the material of the US it completes).
 * Declared, never automatic: this only lists.
 */
export function inheritCandidates(
  doc: EmDocument,
  ownerId: string,
  isUnit: (t: string | undefined) => boolean,
): Array<{ unitId: string; propertyId: string; sameName: boolean }> {
  const mine = new Set(propertiesOf(doc, ownerId));
  const mineKeys = new Set([...mine].map((p) => propertyKey(nodeOf(doc, p))));
  const outList: Array<{ unitId: string; propertyId: string; sameName: boolean }> = [];
  for (const u of doc.graph.nodes) {
    if (u.id === ownerId || !isLiveNode(u) || !isUnit(u.node_type)) continue;
    for (const p of propertiesOf(doc, u.id)) {
      if (mine.has(p)) continue;
      outList.push({ unitId: u.id, propertyId: p, sameName: mineKeys.has(propertyKey(nodeOf(doc, p))) });
    }
  }
  const nm = (id: string) => String(nodeOf(doc, id)?.name ?? id);
  return outList.sort((a, b) => Number(b.sameName) - Number(a.sameName)
    || nm(a.unitId).localeCompare(nm(b.unitId), undefined, { numeric: true })
    || nm(a.propertyId).localeCompare(nm(b.propertyId)));
}

/**
 * Declare that `ownerId` instantiates an existing property: one more
 * `has_property`, with `attributes.inherited = true` — s3dgraphy
 * `ownership.inherit_property`, same rule: idempotent, refused on a property
 * with no owner yet, the property is not copied and stays in its original
 * owner's group. One undo step.
 */
export function inheritProperty(store: DocumentStore, ownerId: string, propertyId: string): EmEdge {
  const doc = store.doc;
  const already = edges(doc).find((e) => e.edge_type === HAS_PROPERTY && e.source === ownerId && e.target === propertyId);
  if (already) return already;
  if (!ownersOf(doc, propertyId).length)
    throw new Error(`property '${propertyId}' has no owner yet: nothing to inherit from`);
  return store.batch(() => store.addEdge(ownerId, propertyId, HAS_PROPERTY, { [INHERITED_KEY]: true }));
}

/** Where a new reading reads from. */
export type ReadingSource =
  | { kind: "document"; id: string }
  | { kind: "unit"; id: string }
  | { kind: "new-document"; name?: string; description?: string; data?: Record<string, unknown> };

export interface NewReading {
  extractorId: string;
  sourceId: string;
  /** set when THIS reading made the combiner (the property's second source) */
  combinerCreated: string | null;
  /** the combiner the reading hangs under, new or old */
  combinerId: string | null;
  /** extractors moved under the new combiner (the direct ones before) */
  moved: string[];
  /** set when the reading minted its document */
  documentCreated: string | null;
}

/**
 * «+ lettura» — a new extractor for a property, from a source. ONE undo step
 * that holds everything the gesture means:
 *   · the document, when the source is «Nuovo documento…» (named `D.<n>`);
 *   · the extractor, `has_data_provenance` from the property (or `combines` from
 *     its combiner), `extracted_from` the source, named by NAME1 from it
 *     (`<fonte>.<ordinale>`; `Temp<n>` if the source has no name);
 *   · THE SECOND SOURCE: when the property already had a direct extractor and
 *     no combiner, a combiner `C.<n>` is created, the direct extractors move
 *     under it (`combines`), and the property's provenance becomes the combiner;
 *   · every new node joins the chain's paradata group, when there is one.
 */
export function addReading(
  store: DocumentStore,
  propertyId: string,
  source: ReadingSource,
  opts: { extractorData?: Record<string, unknown>; description?: string } = {},
): NewReading {
  return store.batch(() => {
    const doc = store.doc;
    const group = chainGroup(doc, propertyId);
    const join = (id: string) => { if (group) store.addEdge(id, group, IS_IN_PARADATA_NODEGROUP); };
    let sourceId: string;
    let documentCreated: string | null = null;
    if (source.kind === "new-document") {
      sourceId = store.newId();
      store.addNode({ id: sourceId, node_type: "document",
        name: source.name?.trim() || initialName(doc, "document") || "D.1",
        description: source.description ?? "",
        ...(source.data ? { data: { ...source.data } } : {}) } as EmNode);
      documentCreated = sourceId;
      join(sourceId);
    } else sourceId = source.id;

    const prov = provenanceOf(doc, propertyId);
    let combinerId = prov.combiners[0] ?? null;
    let combinerCreated: string | null = null;
    const moved: string[] = [];
    if (!combinerId && prov.direct.length) {
      combinerId = store.newId();
      store.addNode({ id: combinerId, node_type: "combiner", name: deriveCombinerName(doc),
                      description: "" } as EmNode);
      combinerCreated = combinerId;
      join(combinerId);
      for (const x of prov.direct) {
        const e = edges(doc).find((ed) => ed.edge_type === HAS_DATA_PROVENANCE
          && ed.source === propertyId && ed.target === x);
        if (e) store.deleteEdge(e);
        store.addEdge(combinerId, x, COMBINES);
        moved.push(x);
      }
      store.addEdge(propertyId, combinerId, HAS_DATA_PROVENANCE);
    }

    const extractorId = store.newId();
    store.addNode({ id: extractorId, node_type: "extractor",
      name: initialName(doc, "extractor") ?? "Temp1",
      description: opts.description ?? "",
      ...(opts.extractorData ? { data: { ...opts.extractorData } } : {}) } as EmNode);
    if (combinerId) store.addEdge(combinerId, extractorId, COMBINES);
    else store.addEdge(propertyId, extractorId, HAS_DATA_PROVENANCE);
    store.addEdge(extractorId, sourceId, EXTRACTED_FROM);
    const renamed = renameOnAttach(doc, extractorId);
    if (renamed) store.updateNode(extractorId, { name: renamed });
    join(extractorId);
    return { extractorId, sourceId, combinerCreated, combinerId, moved, documentCreated };
  });
}

/** The reading's description (the extractor's `description`). */
export function setReadingDescription(store: DocumentStore, extractorId: string, text: string): void {
  const x = store.node(extractorId);
  if (!x || String(x.description ?? "") === text) return;
  store.updateNode(extractorId, { description: text });
}

/**
 * Fix where a reading looked. A REGION becomes an AnnotationRegion node on the
 * document (`is_on_resource`) that the extractor `extracted_from`s — replacing a
 * previous region of the same reading; a passage or a point goes to
 * `data.geometry`. One undo step; the extractor keeps its NAME1 name (the region
 * is on the same document).
 */
export function setReadingGeometry(
  store: DocumentStore,
  extractorId: string,
  documentId: string,
  g: { kind: "region"; shape_kind: "rect" | "polygon"; rect?: number[]; points?: number[][]; page?: number }
    | { kind: "passage"; start: number; end: number; text: string }
    | { kind: "point3d"; p: [number, number, number]; on?: string },
): void {
  store.batch(() => {
    const doc = store.doc;
    const x = store.node(extractorId);
    if (!x) return;
    const data = { ...((x.data ?? {}) as Record<string, unknown>) };
    if (g.kind === "region") {
      for (const r of out(doc, extractorId, EXTRACTED_FROM)) {
        if (nodeOf(doc, r)?.node_type === "annotation_region") store.deleteNode(r);
      }
      const rid = store.newId();
      store.addNode({ id: rid, node_type: "annotation_region",
        name: `${String(x.name ?? "")} · region`,
        data: { shape_kind: g.shape_kind, ...(g.rect ? { rect: g.rect } : {}),
                ...(g.points ? { points: g.points } : {}), page: g.page ?? 0,
                resource_id: documentId } } as EmNode);
      store.addEdge(rid, documentId, IS_ON_RESOURCE);
      store.addEdge(extractorId, rid, EXTRACTED_FROM);
      if (data.geometry) { delete data.geometry; store.updateNode(extractorId, { data }); }
    } else {
      data.geometry = { ...g };
      store.updateNode(extractorId, { data });
    }
  });
}

/** «Usa come valore»: the reading's result becomes the property's value. */
export function useAsValue(store: DocumentStore, extractorId: string): string | null {
  const p = propertyOfExtractor(store.doc, extractorId);
  const v = resultOf(store.doc, extractorId);
  if (!p || !v) return null;
  store.batch(() => store.setPropertyValue(p, v));
  return p;
}

/**
 * `api.validate["info"]` in the client — `s3dgraphy.diagnostics.
 * extraction_source_hints`, same rule: one record per (extractor, unit,
 * property) where the extractor reads FROM a unit (connections 1.6.24) that has
 * no property of the same key (`property_type`, else name) as a property the
 * extractor feeds, directly or through a combiner. Read-only.
 */
export function extractionSourceHints(
  doc: EmDocument,
  isUnit: (t: string | undefined) => boolean,
): Array<{ extractor: string; extractor_name: string; unit: string; unit_name: string; property: string; property_name: string }> {
  const outList: ReturnType<typeof extractionSourceHints> = [];
  for (const e of edges(doc)) {
    if (e.edge_type !== EXTRACTED_FROM) continue;
    const unit = nodeOf(doc, e.target);
    if (!unit || !isUnit(unit.node_type)) continue;
    const has = new Set(propertiesOf(doc, unit.id).map((p) => propertyKey(nodeOf(doc, p))));
    const p = propertyOfExtractor(doc, e.source);
    const prop = nodeOf(doc, p ?? undefined);
    if (!prop || prop.node_type !== "property") continue;
    const key = propertyKey(prop);
    if (has.has(key)) continue;
    outList.push({ extractor: e.source, extractor_name: String(nodeOf(doc, e.source)?.name ?? e.source),
                   unit: unit.id, unit_name: String(unit.name ?? unit.id), property: prop.id, property_name: key });
  }
  return outList;
}
