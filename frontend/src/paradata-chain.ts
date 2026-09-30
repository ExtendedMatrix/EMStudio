/**
 * CATENA · the paradata chain of a property, read and grown — pure over the
 * em.json document, mutations through the store (one gesture = one `batch`).
 *
 *     unit ──has_property──▶ property ──has_data_provenance──▶ extractor ──extracted_from──▶ document
 *                                    └──has_data_provenance──▶ combiner ──combines──▶ extractor …
 *
 * Every edge named here is read off the connections datamodel (1.6.27), not
 * invented: `has_property` (with more than one owner since 1.6.23, the heirs
 * marked `attributes.inherited`), `has_data_provenance`, `combines`,
 * `extracted_from` (document, annotation region, and since 1.6.24 a unit),
 * `is_on_resource` (a region on its document or model). Where a reading looked
 * is, for every medium, the datamodel's AnnotationRegion (node datamodel 1.6.10,
 * `geometry_kind`), the 3D kinds with their vertices in `data.coords`.
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
import { uuid5 } from "./commands";
import { polylineLength, pyFixed, type GlbKind, type Vec3 } from "./reading-glb";
import nodeDatamodel from "./assets/s3Dgraphy_node_datamodel.json";

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

// ── the place of a reading ───────────────────────────────────────────────────

/**
 * Where a reading looked — ONE node for every medium (E.D. 29 set; s3Dgraphy
 * `annotation/reading.py`, node datamodel 1.6.10): the AnnotationRegionNode the
 * extractor `extracted_from`s, `is_on_resource` the image, text or model it is
 * on, told apart by `data.geometry_kind`:
 *
 *   region2d — a rect or polygon on an image (normalised; the default, and what
 *              every older region is);
 *   passage  — characters start–end of a text plus the quoted words (the W3C
 *              TextPosition + TextQuote pair: the offsets say where, the quote
 *              survives an edit that moves them);
 *   point · line · polyline — on a 3D model. The vertices are IN THE NODE,
 *              `data.coords` (node datamodel 1.6.15, E.D. 30 set: the geometry
 *              divides by origin — the sign of whoever argues is data of the
 *              node), with `vertex_count`, `crs`, and for a measure `length`
 *              computed from them and `unit`. From 7 to 11 ott they were
 *              `readings/<region id>.glb` behind a `generic` SemanticShape;
 *              such a file is migrated when it opens (`reading-files.ts`).
 *
 * `data.geometry` on the extractor is the shape EMStudio wrote from 5 to 7 ott;
 * it is READ here only so an old file shows its readings (s3Dgraphy migrates it
 * to a region when it opens the file), never written again.
 */
export const GEOMETRY_KINDS = ["region2d", "passage", "point", "line", "polyline"] as const;
export type GeometryKind = (typeof GEOMETRY_KINDS)[number];
export const GLB_KINDS: readonly GeometryKind[] = ["point", "line", "polyline"];
export const MEASURE_KINDS: readonly GeometryKind[] = ["line", "polyline"];
export const HAS_SEMANTIC_SHAPE = "has_semantic_shape";
export const DEFAULT_UNIT = "m";
export const DEFAULT_CRS = "local";
export const isGlbKind = (k: string | undefined): k is GlbKind => GLB_KINDS.includes(k as GeometryKind);

export type Geometry =
  | { kind: "region2d"; regionId: string; shape_kind: string; rect?: number[]; points?: number[][]; page: number }
  | { kind: "passage"; regionId: string | null; start: number; end: number; text: string }
  | { kind: GlbKind; regionId: string | null; vertex_count: number; length?: number; unit?: string; crs?: string;
      /** the glb (project-relative) of a region written 7–11 ott, not migrated
       *  yet (no folder, no file): its vertices are there and nowhere else */
      url?: string;
      /** the vertices: the region's `data.coords` (node datamodel 1.6.15), or a
       *  legacy `data.geometry` point's own */
      vertices?: Vec3[] };

/** What a gesture traces, before it is a node. The 3D kinds carry their
 *  vertices, in the frame of the model's glb; they become the region's
 *  `data.coords` (E.D. 30 set: the geometry of whoever argues is data of the node). */
export type TraceGeometry =
  | { kind: "region2d"; shape_kind: "rect" | "polygon"; rect?: number[]; points?: number[][]; page?: number }
  | { kind: "passage"; start: number; end: number; text: string }
  | { kind: GlbKind; vertices: Vec3[] };

/** The region an extractor reads, if it reads one. */
export function regionOfExtractor(doc: EmDocument, extractorId: string): EmNode | null {
  for (const t of out(doc, extractorId, EXTRACTED_FROM)) {
    const r = nodeOf(doc, t);
    if (r?.node_type === "annotation_region") return r;
  }
  return null;
}

/** The glb of a region written 7–11 ott (`has_semantic_shape` → shape `data.url`):
 *  read only by the migration (`reading-files.ts`), never written. */
export function glbUrlOfRegion(doc: EmDocument, regionId: string): string | null {
  for (const s of out(doc, regionId, HAS_SEMANTIC_SHAPE)) {
    const u = ((nodeOf(doc, s)?.data ?? {}) as Record<string, unknown>).url;
    if (typeof u === "string" && u) return u;
  }
  return null;
}

export function geometryOfRegion(doc: EmDocument, r: EmNode): Geometry {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const kind = String(d.geometry_kind || "region2d") as GeometryKind;
  if (kind === "passage")
    return { kind, regionId: r.id, start: Number(d.start ?? 0), end: Number(d.end ?? 0), text: String(d.text ?? "") };
  if (isGlbKind(kind)) {
    const coords = coordsOf(d);
    const url = coords ? null : glbUrlOfRegion(doc, r.id);
    // the length of inline vertices is theirs: computed, never a second number
    const length = coords && MEASURE_KINDS.includes(kind) ? polylineLength(coords)
      : d.length != null ? Number(d.length) : null;
    return { kind, regionId: r.id, vertex_count: coords ? coords.length : Number(d.vertex_count ?? 0),
             ...(length != null ? { length, unit: String(d.unit || DEFAULT_UNIT), crs: String(d.crs || DEFAULT_CRS) } : {}),
             ...(coords ? { vertices: coords } : {}),
             ...(url ? { url } : {}) };
  }
  return { kind: "region2d", regionId: r.id, shape_kind: String(d.shape_kind ?? "rect"),
           ...(Array.isArray(d.rect) ? { rect: d.rect as number[] } : {}),
           ...(Array.isArray(d.points) ? { points: d.points as number[][] } : {}),
           page: Number(d.page ?? 0) };
}

export function geometryOf(doc: EmDocument, extractorId: string): Geometry | null {
  const r = regionOfExtractor(doc, extractorId);
  if (r) return geometryOfRegion(doc, r);
  // a file written 5–7 ott, not reopened by s3Dgraphy yet: read, never written
  const g = ((nodeOf(doc, extractorId)?.data ?? {}) as Record<string, unknown>).geometry as
    Record<string, unknown> | undefined;
  if (g?.kind === "passage")
    return { kind: "passage", regionId: null, start: Number(g.start ?? 0), end: Number(g.end ?? 0), text: String(g.text ?? "") };
  if (g?.kind === "point3d" && Array.isArray(g.p) && g.p.length === 3)
    return { kind: "point", regionId: null, vertex_count: 1,
             vertices: [(g.p as number[]).map(Number) as Vec3] };
  return null;
}

/** A region's `data.coords`, when they are a list of [x, y, z]. */
export function coordsOf(d: Record<string, unknown> | undefined): Vec3[] | null {
  const c = d?.coords;
  if (!Array.isArray(c) || !c.length) return null;
  const out: Vec3[] = [];
  for (const p of c) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
    out.push([p[0], p[1], p[2]]);
  }
  return out;
}

/** How many vertices a 3D region may carry in `data.coords` — the node
 *  datamodel's `AnnotationRegionNode.coords.inline_max_vertices` (500), never a
 *  constant here. */
export function inlineMaxVertices(): number {
  const spec = (nodeDatamodel as unknown as {
    visualization_nodes?: { AnnotationRegionNode?: { coords?: { inline_max_vertices?: number } } };
  }).visualization_nodes?.AnnotationRegionNode?.coords?.inline_max_vertices;
  return typeof spec === "number" && spec > 0 ? spec : Infinity;
}

/**
 * `api.measure` in the client, over the node (count and length from
 * `data.coords`; for a region of 7–11 ott, the cached numbers): `value` is what «Usa come valore» writes — `"1.234 m"`, s3Dgraphy's
 * `f"{length:.3f} {unit}"` — and null for what measures nothing.
 */
export function measureOf(doc: EmDocument, regionId: string): {
  region_id: string; geometry_kind: GeometryKind; vertex_count: number | null;
  length: number | null; unit: string | null; crs: string | null; value: string | null;
} | null {
  const r = nodeOf(doc, regionId);
  if (r?.node_type !== "annotation_region") return null;
  const d = (r.data ?? {}) as Record<string, unknown>;
  const kind = String(d.geometry_kind || "region2d") as GeometryKind;
  // count and length from data.coords, as `api.measure`; a legacy region's cache
  const coords = isGlbKind(kind) ? coordsOf(d) : null;
  const length = coords && MEASURE_KINDS.includes(kind) ? polylineLength(coords)
    : d.length == null ? null : Number(d.length);
  const unit = d.unit == null ? (length != null ? DEFAULT_UNIT : null) : String(d.unit);
  return { region_id: regionId, geometry_kind: kind,
           vertex_count: coords ? coords.length : d.vertex_count == null ? null : Number(d.vertex_count),
           length, unit, crs: d.crs == null ? null : String(d.crs),
           value: MEASURE_KINDS.includes(kind) && length != null ? `${pyFixed(length, 3)} ${unit || DEFAULT_UNIT}` : null };
}

/** The measure's text, for a line or a polyline. */
export function measureText(g: Geometry | null): string {
  if (!g || !MEASURE_KINDS.includes(g.kind) || !("length" in g) || g.length == null) return "";
  return `${pyFixed(g.length, 3)} ${g.unit || DEFAULT_UNIT}`;
}

/** What a reading found — the text the next step can take as a value. A point's
 *  height is its z, from its coords (`vertices` supplies them for a region of
 *  7–11 ott whose glb was read but not migrated). */
export function resultOf(doc: EmDocument, extractorId: string,
                         vertices?: (regionId: string) => Vec3[] | null): string {
  const g = geometryOf(doc, extractorId);
  const x = nodeOf(doc, extractorId);
  const own = String(((x?.data ?? {}) as Record<string, unknown>).result ?? "").trim();
  if (own) return own;
  if (!g) return "";
  if (g.kind === "passage") return g.text;
  if (g.kind === "line" || g.kind === "polyline") return measureText(g);
  if (g.kind === "point") {
    const v = g.vertices ?? (g.regionId && vertices ? vertices(g.regionId) : null);
    return v?.length === 1 ? `z ${v[0][2].toFixed(2)} m` : "";
  }
  if (g.kind === "region2d" && g.rect) return `${Math.round(g.rect[2] * 100)}% × ${Math.round(g.rect[3] * 100)}%`;
  return "";
}

// ── ids: the ones s3Dgraphy derives, so the bridge and the client agree ──────

/** `uuid5(NAMESPACE_URL, "https://w3id.org/em/annotation")` — s3dgraphy
 *  `annotation.paradata._ANNOT_NAMESPACE`. */
const NAMESPACE_URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
export const ANNOT_NAMESPACE = uuid5(NAMESPACE_URL, "https://w3id.org/em/annotation");

/** The selector string of a region2d or a passage — `AnnotationRegionNode.selector()`. */
function selectorOf(g: TraceGeometry): string {
  if (g.kind === "passage") return `char=${g.start},${g.end}`;
  if (g.kind !== "region2d") return "";
  if (g.shape_kind === "rect") return "xywh=percent:" + (g.rect ?? []).map((v) => pyFixed(v * 100, 6)).join(",");
  return `polygon(percent:${(g.points ?? []).map(([x, y]) => `${pyFixed(x * 100, 6)},${pyFixed(y * 100, 6)}`).join(" ")})`;
}

/** The region's id — `reading._region_key` through `_stable_id`: the same
 *  reading on the same thing is the same node, in Python and here. */
export function readingRegionId(onId: string | null, g: TraceGeometry): string {
  const on = onId ?? "";
  let key: string;
  if (g.kind === "region2d") key = `region|${on}|${g.page ?? 0}|${selectorOf(g)}`;
  else if (g.kind === "passage") key = `passage|${on}|${selectorOf(g)}|${g.text ?? ""}`;
  else key = `${g.kind}|${on}|${g.vertices.map((p) => p.map((v) => pyFixed(v, 6)).join(",")).join(";")}`;
  return uuid5(ANNOT_NAMESPACE, key);
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

/** What placing a reading made. */
export interface PlacedReading {
  extractorId: string;
  regionId: string;
  onId: string | null;
  geometry_kind: GeometryKind;
  /** the 3D kinds: the vertices now in the region's `data.coords` */
  vertices: Vec3[] | null;
  /** regions this reading no longer reads (its place moved) */
  replaced: string[];
}

/**
 * Fix where a reading looked: `api.place_reading` in the client, ONE undo step.
 *
 *   · an `annotation_region` with `data.geometry_kind` and its fields (region2d:
 *     the selector; passage: start, end, text; point/line/polyline: `coords`
 *     = the vertices in the model's glTF frame, `vertex_count`, `crs` `local`,
 *     and for a measure `length` computed from the coords and unit `m`), plus
 *     `resource_id`; id = s3Dgraphy's uuid5, so a replay is the same node —
 *     the data is `AnnotationRegionNode.data` key for key (node datamodel
 *     1.6.15, `check-paradata-chain`);
 *   · `extracted_from` extractor → region, `is_on_resource` region → the
 *     document (image, text or 3D model) it is on.
 *
 * No file, no shape: until 11 ott the 3D vertices went to a glb behind a
 * semantic_shape. More than `inlineMaxVertices()` is not a trace a hand makes;
 * s3Dgraphy puts such a path in a file resource, and here it is refused.
 *
 * Placing again MOVES the reading (its `extracted_from` to the old region goes).
 * s3Dgraphy keeps the old region; here a region nobody reads any more is removed
 * with its shape — the gesture is «trace again», and an orphan would be a node
 * nobody can reach from the chain. A legacy `data.geometry` leaves the extractor.
 */
export function setReadingGeometry(
  store: DocumentStore,
  extractorId: string,
  onId: string | null,
  trace: TraceGeometry | { kind: "region"; shape_kind: "rect" | "polygon"; rect?: number[]; points?: number[][]; page?: number }
    | { kind: "point3d"; p: Vec3 },
): PlacedReading | null {
  const g: TraceGeometry = trace.kind === "region" ? { ...trace, kind: "region2d" }
    : trace.kind === "point3d" ? { kind: "point", vertices: [trace.p] } : trace;
  if (isGlbKind(g.kind)) {
    const v = (g as { vertices: Vec3[] }).vertices;
    const least = g.kind === "point" ? 1 : 2;
    if (!Array.isArray(v) || v.length < least || (g.kind === "line" && v.length !== 2))
      throw new Error(`a ${g.kind} needs ${g.kind === "line" ? "exactly 2" : `at least ${least}`} vertices`);
    if (v.length > inlineMaxVertices())
      throw new Error(`${v.length} vertices exceed coords.inline_max_vertices (${inlineMaxVertices()}): a path like that is a file`);
  }
  return store.batch(() => {
    const doc = store.doc;
    const x = store.node(extractorId);
    if (!x) return null;
    const on = onId && store.node(onId) ? onId : null;
    const regionId = readingRegionId(onId, g);
    const kind = g.kind;
    let vertices: Vec3[] | null = null;
    if (!store.node(regionId)) {
      const data: Record<string, unknown> = { geometry_kind: kind };
      if (g.kind === "region2d") {
        data.shape_kind = g.shape_kind;
        data.page = g.page ?? 0;
        if (g.rect) data.rect = g.rect;
        if (g.points) data.points = g.points;
      } else if (g.kind === "passage") {
        Object.assign(data, { start: g.start, end: g.end, text: g.text ?? "" });
      } else {
        const coords = g.vertices.map((p) => [Number(p[0]), Number(p[1]), Number(p[2])] as Vec3);
        data.coords = coords;
        data.vertex_count = coords.length;
        if (MEASURE_KINDS.includes(kind))
          Object.assign(data, { length: polylineLength(coords), unit: DEFAULT_UNIT });
        data.crs = DEFAULT_CRS;
      }
      if (onId) data.resource_id = onId;
      store.addNode({ id: regionId, node_type: "annotation_region",
                      name: `${String(x.name ?? extractorId)} · ${kind}`, description: "", data } as EmNode);
    }
    if (g.kind === "point" || g.kind === "line" || g.kind === "polyline")
      vertices = g.vertices.map((p) => [Number(p[0]), Number(p[1]), Number(p[2])] as Vec3);
    // the reading moves: off every other region it read
    const replaced: string[] = [];
    for (const e of edges(doc).filter((ed) => ed.source === extractorId && ed.edge_type === EXTRACTED_FROM
                                              && ed.target !== regionId)) {
      if (nodeOf(doc, e.target)?.node_type !== "annotation_region") continue;
      store.deleteEdge(e);
      replaced.push(e.target);
    }
    for (const r of replaced) {
      if (inn(store.doc, r, EXTRACTED_FROM).length) continue;       // somebody else still reads it
      for (const sh of out(store.doc, r, HAS_SEMANTIC_SHAPE))
        if (inn(store.doc, sh, HAS_SEMANTIC_SHAPE).length === 1) store.deleteNode(sh);
      store.deleteNode(r);
    }
    if (!store.hasEdge(extractorId, regionId, EXTRACTED_FROM)) store.addEdge(extractorId, regionId, EXTRACTED_FROM);
    if (on && !store.hasEdge(regionId, on, IS_ON_RESOURCE)) store.addEdge(regionId, on, IS_ON_RESOURCE);
    const data = { ...((store.node(extractorId)?.data ?? {}) as Record<string, unknown>) };
    if (data.geometry) { delete data.geometry; store.updateNode(extractorId, { data }); }
    return { extractorId, regionId, onId: on, geometry_kind: kind, vertices, replaced };
  });
}

/** «Usa come valore»: the reading's result becomes the property's value — for a
 *  line or a polyline the measure, `api.measure(...).value`. */
export function useAsValue(store: DocumentStore, extractorId: string,
                           vertices?: (regionId: string) => Vec3[] | null): string | null {
  const p = propertyOfExtractor(store.doc, extractorId);
  const v = resultOf(store.doc, extractorId, vertices);
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
