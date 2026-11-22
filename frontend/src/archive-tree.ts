/**
 * MICRO-SEG28 (E.D., 22 Nov 2026) · WHAT A DOCUMENT HOLDS ON THE DISK, read off
 * the graph — the one reading of the Archive's Outliner, its «Selected
 * document» card and the Sources' Inspector, so the three say the same thing
 * with the same words.
 *
 * A document reaches its files by three roads, and the Archive used to walk
 * only the first:
 *
 *   document ─has_linked_resource→ resource (─has_file→ resource_file)
 *   document ─has_representation_model→ RM ─has_linked_resource→ resource …
 *   RM ─is_in_representation_model_group→ container ─has_linked_resource→ tileset
 *
 * (and `was_revision_of`: an older version of a resource hangs under it).
 * Templu Mare v11's D.01 has no file of its own: its ten models carry them, and
 * their container Survey2015 the tileset — which is why the card said «No file
 * yet» while Sources showed the tileset and ten models.
 *
 * Pure: the graph in, facts out (`scripts/check-archive-outliner.mjs`).
 */

export interface GNode { id: string; node_type?: string; name?: string; description?: string; data?: unknown }
export interface GEdge { source: string; target: string; edge_type?: string; attributes?: unknown }
export interface GraphLike { nodes: readonly GNode[]; edges: readonly GEdge[] }

/** what the resolver said of a file (s3Dgraphy `resources.locate`), when asked */
export interface FileFact { state?: string; changed?: boolean; path?: string }

export type HoldingKind = "resource" | "file" | "version" | "tileset";

export interface Holding {
  id: string;
  name: string;
  kind: HoldingKind;
  /** the node it hangs from (the document, an RM, a resource, a container) */
  via: string;
  /** it carries a digest: stamped */
  stamped: boolean;
  url: string;
  mediaType: string;
  bytes: number | null;
}

export interface ModelHolding { id: string; name: string; type: string; files: Holding[] }
export interface TilesetHolding { group: string; groupName: string; models: number; resource: Holding }

export interface DocHoldings {
  docId: string;
  /** the files the document links itself (with their members and versions) */
  own: Holding[];
  /** its representation models, each with its files */
  models: ModelHolding[];
  /** the tilesets of the containers its models are in */
  tilesets: TilesetHolding[];
  /** every file reached, once (resources, their members, versions, tilesets):
   *  what the state reads (a missing member is a missing file) */
  all: Holding[];
  /** the files LINKED: the resources the document, its models and their
   *  containers link (not their members nor their versions, which the tree
   *  shows under them) — what the line counts */
  top: Holding[];
  /** how many of `top` are stamped */
  stamped: number;
}

const dataOf = (n: GNode | undefined): Record<string, unknown> =>
  (n?.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;
const removed = (n: GNode | undefined): boolean => !n || !!dataOf(n).removed;
const edgeGone = (e: GEdge): boolean => !!(e.attributes as { removed?: unknown } | undefined)?.removed;

/** A small index over a graph, built once per reading. */
export interface GIndex {
  node: (id: string) => GNode | undefined;
  out: (id: string, type: string) => string[];
  into: (id: string, type: string) => string[];
}

export function indexOf(g: GraphLike): GIndex {
  const byId = new Map<string, GNode>();
  for (const n of g.nodes) if (!removed(n)) byId.set(n.id, n);
  const outs = new Map<string, string[]>(), ins = new Map<string, string[]>();
  for (const e of g.edges) {
    if (edgeGone(e) || !byId.has(e.source) || !byId.has(e.target)) continue;
    const ko = `${e.source}\u0000${e.edge_type ?? ""}`, ki = `${e.target}\u0000${e.edge_type ?? ""}`;
    const a = outs.get(ko); if (a) a.push(e.target); else outs.set(ko, [e.target]);
    const b = ins.get(ki); if (b) b.push(e.source); else ins.set(ki, [e.source]);
  }
  return {
    node: (id) => byId.get(id),
    out: (id, type) => outs.get(`${id}\u0000${type}`) ?? [],
    into: (id, type) => ins.get(`${id}\u0000${type}`) ?? [],
  };
}

const isFileNode = (n: GNode | undefined): boolean => n?.node_type === "resource" || n?.node_type === "resource_file";

function holdingOf(n: GNode, kind: HoldingKind, via: string): Holding {
  const d = dataOf(n);
  const url = String(d.url ?? d.filename ?? d.path ?? d.locator ?? "");
  const size = d.size_bytes ?? d.size;
  return {
    id: n.id, name: String(n.name ?? n.id), kind, via,
    stamped: !!(d.checksum || d.sha256),
    url, mediaType: String(d.media_type ?? ""),
    bytes: typeof size === "number" && isFinite(size) ? size : null,
  };
}

/** a resource with what hangs from it: its members (`has_file`) and its older
 *  versions (`was_revision_of`, the newer → the older), depth first */
function resourceTree(ix: GIndex, resId: string, via: string, kind: HoldingKind, seen: Set<string>): Holding[] {
  if (seen.has(resId)) return [];
  const n = ix.node(resId);
  if (!isFileNode(n)) return [];
  seen.add(resId);
  const out = [holdingOf(n!, kind, via)];
  for (const f of ix.out(resId, "has_file")) if (!seen.has(f) && isFileNode(ix.node(f))) { seen.add(f); out.push(holdingOf(ix.node(f)!, "file", resId)); }
  for (const v of ix.out(resId, "was_revision_of")) out.push(...resourceTree(ix, v, resId, "version", seen));
  // the VERSIONS made from it (an LOD, an export: `dtc_derived_from` the master),
  // as the Space's ladder reads them
  for (const v of ix.into(resId, "dtc_derived_from")) out.push(...resourceTree(ix, v, resId, "version", seen));
  return out;
}

const MODEL_TYPES = new Set(["representation_model", "representation_model_doc", "representation_model_sf"]);

/** What one document holds, by the three roads. */
export function documentHoldings(g: GraphLike | GIndex, docId: string): DocHoldings {
  const ix = "node" in g && typeof g.node === "function" ? g as GIndex : indexOf(g as GraphLike);
  const seen = new Set<string>();
  const own: Holding[] = [];
  for (const r of ix.out(docId, "has_linked_resource")) own.push(...resourceTree(ix, r, docId, "resource", seen));
  const models: ModelHolding[] = [];
  const groups = new Map<string, number>();
  const rmIds = [...new Set([...ix.out(docId, "has_representation_model"), ...ix.out(docId, "has_representation_model_doc")])];
  for (const rm of rmIds) {
    const n = ix.node(rm);
    if (!n || !MODEL_TYPES.has(String(n.node_type))) continue;
    const files: Holding[] = [];
    for (const r of ix.out(rm, "has_linked_resource")) files.push(...resourceTree(ix, r, rm, "resource", seen));
    models.push({ id: rm, name: String(n.name ?? rm), type: String(n.node_type), files });
    for (const gid of ix.out(rm, "is_in_representation_model_group")) if (!groups.has(gid)) groups.set(gid, groups.size);
  }
  // a document may publish a container itself (`has_representation_model` → group)
  for (const gid of ix.out(docId, "has_representation_model"))
    if (ix.node(gid)?.node_type === "RepresentationModelNodeGroup" && !groups.has(gid)) groups.set(gid, groups.size);
  const tilesets: TilesetHolding[] = [];
  for (const gid of groups.keys()) {
    const gn = ix.node(gid);
    if (!gn) continue;
    const members = ix.into(gid, "is_in_representation_model_group").filter((m) => MODEL_TYPES.has(String(ix.node(m)?.node_type))).length;
    for (const r of ix.out(gid, "has_linked_resource")) {
      const tree = resourceTree(ix, r, gid, "tileset", seen);
      if (!tree.length) continue;
      tilesets.push({ group: gid, groupName: String(gn.name ?? gid), models: members, resource: tree[0] });
      // the tileset's own members (a file set) count as its files
      own.push(...tree.slice(1));
    }
  }
  const all = [...own, ...models.flatMap((m) => m.files), ...tilesets.map((t) => t.resource)];
  const top = [...own.filter((x) => x.via === docId), ...models.flatMap((m) => m.files.filter((x) => x.via === m.id)), ...tilesets.map((t) => t.resource)];
  return { docId, own, models, tilesets, all, top, stamped: top.filter((h) => h.stamped).length };
}

// ── the state of a document, for «by state» ────────────────────────────────

/** with files · without (to stamp and promote) · a file changed since its stamp · a file missing */
export type DocState = "with" | "without" | "changed" | "missing";
export const DOC_STATES: readonly DocState[] = ["with", "without", "changed", "missing"];

/** The state a document is grouped under. The worst of its files wins:
 *  missing > changed > without > with. «Without» is a document with no file,
 *  or with files none of which is stamped (linked, not yet stamped). */
export function docState(h: DocHoldings, fact: (id: string) => FileFact | null | undefined): DocState {
  let missing = false, changed = false;
  for (const x of h.all) {
    const f = fact(x.id);
    if (!f) continue;
    if (f.state === "missing" || f.state === "empty_copy") missing = true;
    if (f.changed) changed = true;
  }
  if (missing) return "missing";
  if (changed) return "changed";
  if (!h.top.length || !h.stamped) return "without";
  return "with";
}

/** The state of one file, as a quiet sign: stamped, not stamped, changed, missing. */
export type FileSign = "stamped" | "unstamped" | "changed" | "missing";
export function fileSign(x: Holding, f: FileFact | null | undefined): FileSign {
  if (f?.state === "missing" || f?.state === "empty_copy") return "missing";
  if (f?.changed) return "changed";
  return x.stamped ? "stamped" : "unstamped";
}

// ── the kind of a document, for «by type» ──────────────────────────────────

/** models and tilesets · images · PDF · drawings · other */
export type DocKind = "models" | "images" | "pdf" | "drawings" | "other";
export const DOC_KINDS: readonly DocKind[] = ["models", "images", "pdf", "drawings", "other"];

const ext = (url: string): string => (/\.([a-z0-9]+)(?:[?#].*)?$/i.exec(url.replace(/\/+$/, ""))?.[1] ?? "").toLowerCase();
const MODEL_EXT = new Set(["glb", "gltf", "obj", "ply", "fbx", "stl", "3tz", "b3dm", "blend", "e57", "las", "laz", "usdz", "dae", "3ds", "x3d", "nxs", "nxz"]);
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "tif", "tiff", "webp", "gif", "bmp", "heic", "jp2", "cr2", "nef", "dng", "arw"]);
const DRAWING_EXT = new Set(["dxf", "dwg", "svg", "ai", "eps", "shp", "gpkg", "kml", "geojson"]);

/** The kind of one file, by what it says of itself (media type, then extension). */
export function fileKind(x: Pick<Holding, "url" | "mediaType" | "name">): DocKind {
  const mt = x.mediaType.toLowerCase();
  const e = ext(x.url) || ext(x.name);
  const u = x.url.toLowerCase();
  if (mt.startsWith("model/") || mt === "application/x-blender" || MODEL_EXT.has(e) || u.startsWith("blend://") || /tileset\.json$/.test(u)) return "models";
  if (mt === "application/pdf" || e === "pdf") return "pdf";
  if (mt === "image/svg+xml" || mt.includes("dxf") || mt.includes("dwg") || DRAWING_EXT.has(e)) return "drawings";
  if (mt.startsWith("image/") || IMAGE_EXT.has(e)) return "images";
  return "other";
}

/** The kind a document is grouped under: models and tilesets when it has any
 *  (a model, a tileset, a 3D file), else the kind most of its files are (ties:
 *  in the order of `DOC_KINDS`), else «other». */
export function docKind(h: DocHoldings): DocKind {
  if (h.models.length || h.tilesets.length) return "models";
  const tally = new Map<DocKind, number>();
  for (const x of h.top) { const k = fileKind(x); tally.set(k, (tally.get(k) ?? 0) + 1); }
  if (!tally.size) for (const x of h.all) { const k = fileKind(x); tally.set(k, (tally.get(k) ?? 0) + 1); }
  let best: DocKind = "other", n = 0;
  for (const k of DOC_KINDS) { const c = tally.get(k) ?? 0; if (c > n) { best = k; n = c; } }
  return best;
}

// ── rights, as quiet signs ─────────────────────────────────────────────────

/** The licence and the embargo the document carries ITSELF (`has_license`,
 *  `has_embargo`, or `data.license` / `data.embargo`) — what is inherited from
 *  an epoch or the canvas is the Inspector's to say, not a sign of the row. */
export function docRights(ix: GIndex, docId: string): { license: string | null; embargo: string | null } {
  const d = dataOf(ix.node(docId));
  const lic = ix.out(docId, "has_license").map((x) => ix.node(x)).find(Boolean);
  const emb = ix.out(docId, "has_embargo").map((x) => ix.node(x)).find(Boolean);
  const license = lic ? String(dataOf(lic).license_type ?? lic.name ?? "") || null : typeof d.license === "string" && d.license ? d.license : null;
  let embargo: string | null = null;
  if (emb) {
    const ed = dataOf(emb);
    const end = ed.embargo_end ?? null;
    embargo = String(end ?? emb.name ?? "") || "—";
  } else if (typeof d.embargo === "string" && d.embargo) embargo = d.embargo;
  return { license, embargo };
}

// ── the words ──────────────────────────────────────────────────────────────

export interface HoldingCounts { models: number; tilesets: number; files: number; stamped: number; unstamped: number }

export function holdingCounts(h: DocHoldings): HoldingCounts {
  return { models: h.models.length, tilesets: h.tilesets.length, files: h.top.length, stamped: h.stamped, unstamped: h.top.length - h.stamped };
}

/** The one line the Archive's card and the Sources' Inspector both say:
 *  «10 models and 1 tileset linked · 11 of 11 files stamped». `w` carries the
 *  words (i18n): plural forms and the frame of the sentence. */
export interface HoldingWords {
  models: (n: number) => string;
  tilesets: (n: number) => string;
  files: (n: number) => string;
  and: string;
  /** «{what} linked» */
  linked: (what: string) => string;
  /** «{stamped} of {files} files stamped» */
  stamped: (stamped: number, files: number) => string;
  /** nothing at all */
  nothing: string;
}

export function holdingLine(c: HoldingCounts, w: HoldingWords): string {
  if (!c.files && !c.models && !c.tilesets) return w.nothing;
  const parts: string[] = [];
  if (c.models) parts.push(w.models(c.models));
  if (c.tilesets) parts.push(w.tilesets(c.tilesets));
  if (!parts.length) parts.push(w.files(c.files));
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} ${w.and} ${parts[parts.length - 1]}` : parts[0];
  return `${w.linked(what)} · ${w.stamped(c.stamped, c.files)}`;
}

// ── the DTC processes (the optional second branch) ─────────────────────────

export interface DtcProcess { id: string; name: string; kind: string; inputs: string[]; outputs: string[] }

/** Every `dtc_process` of the graph with its inputs and outputs (`dtc_had_input`,
 *  `dtc_had_output`, both from the process), by name. */
export function dtcProcesses(g: GraphLike, ix: GIndex = indexOf(g)): DtcProcess[] {
  const out: DtcProcess[] = [];
  for (const n of g.nodes) {
    if (n.node_type !== "dtc_process" || removed(n)) continue;
    out.push({ id: n.id, name: String(n.name ?? n.id), kind: String(dataOf(n).dtc_kind ?? ""),
      inputs: ix.out(n.id, "dtc_had_input"), outputs: ix.out(n.id, "dtc_had_output") });
  }
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return out.sort((a, b) => coll.compare(a.name, b.name));
}
