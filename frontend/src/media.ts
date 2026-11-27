/**
 * MICRO-B-DOCUMENTI-MEDIA (E.D., 14 Nov 2026) · THE MEDIA OF A NODE — what the
 * Inspector's strip and the image viewer show, for ANY node.
 *
 * One node per SET, not per photograph: a directory (or a logical group)
 * holds the list of its files inside itself (`data.members`), and a file
 * becomes a node only when it is used (`resources.ts › materializeMember`).
 * The sets nest (`has_sub_resource`: lapidary → category → piece); a
 * CATALOGUE is one document whose linked set has parts: its entries are the
 * leaves, cited «D.30 · 18383»; open (a start, no end: counts computed live)
 * or closed (its stamp, `data.catalog_stamp`: the counts are the stamp's).
 *
 * The rules are s3Dgraphy's (`resources/sets.py`, `catalog.py`,
 * `media_roles.py`), read here; `check-media.mjs` runs them in node.
 */
import { resourceFiles, plainGraph, memberRows, type ResourceGraph, type MemberRow } from "./resources";
import { unitImages, mediumOfLocator } from "./unit-images";
import { basename, dirname } from "./paths";
import { typeKeyOf } from "./file-type";

interface N { id: string; node_type?: string; name?: unknown; description?: unknown; data?: unknown }
interface E { id?: string; source: string; target: string; edge_type?: string; attributes?: unknown }
interface G { nodes: N[]; edges: E[] }

export const EDGE_SUB_RESOURCE = "has_sub_resource";

const dataOf = (n: N | undefined): Record<string, unknown> =>
  (n?.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;
const attrsOf = (e: E): Record<string, unknown> =>
  (e.attributes && typeof e.attributes === "object" ? e.attributes : {}) as Record<string, unknown>;
const removed = (n: N | undefined): boolean => !!dataOf(n).removed;
const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

// ── roles: the vocabulary em-media-role, extensible by the project ───────────

/** The base concepts (stratigraph-templates `vocabularies/skos/media-role.ttl`,
 *  s3Dgraphy `media_roles.BASE_ROLES`): id, it, en. */
export const BASE_ROLES: ReadonlyArray<readonly [string, string, string]> = [
  ["photogrammetry", "fotogrammetria", "photogrammetry"],
  ["frontispiece", "frontespizio", "frontispiece"],
  ["detail", "dettaglio", "detail"],
  ["vector_drawing", "disegno vettoriale", "vector drawing"],
  ["raster_drawing", "disegno raster", "raster drawing"],
  ["model_3d", "modello 3D", "3D model"],
  ["orthophoto", "ortofoto", "orthophoto"],
  ["archival_documentation", "documentazione d'archivio", "archival documentation"],
];
export const FRONTISPIECE = "frontispiece";
export const ROLE_NS = "https://w3id.org/extendedmatrix/vocab/media-role/";

export interface Role { id: string; label: Record<string, string>; origin: "base" | "local"; added_by?: string; added_at?: string }

export function mediaRoles(g: G): Role[] {
  const out: Role[] = BASE_ROLES.map(([id, it, en]) => ({ id, label: { it, en }, origin: "base" }));
  const gn = g.nodes.find((n) => n.node_type === "graph");
  const local = dataOf(gn).media_roles_local;
  if (Array.isArray(local))
    for (const r of local as Array<Record<string, unknown>>)
      if (r && r.id) out.push({ id: str(r.id), label: { ...((r.label ?? {}) as Record<string, string>) }, origin: "local",
                                added_by: r.added_by ? str(r.added_by) : undefined, added_at: r.added_at ? str(r.added_at) : undefined });
  return out;
}
export function roleLabel(g: G, id: string | null | undefined, lang = "it"): string {
  if (!id) return "";
  const r = mediaRoles(g).find((x) => x.id === id);
  return r ? (r.label[lang] ?? r.label.en ?? Object.values(r.label)[0] ?? id) : id;
}
const slug = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "role";
/** s3Dgraphy `add_local_role`: `local:<slug>`; a base label answers with the base id. */
export function localRoleId(label: string): string {
  const base = BASE_ROLES.find(([, it, en]) => slug(it) === slug(label) || slug(en) === slug(label));
  return base ? base[0] : `local:${slug(label)}`;
}

// ── an index ─────────────────────────────────────────────────────────────────

export function mediaIndex(g: G) {
  const byId = new Map<string, N>();
  for (const n of g.nodes) if (!removed(n)) byId.set(n.id, n);
  const outE = new Map<string, E[]>(), inE = new Map<string, E[]>();
  for (const e of g.edges) {
    if (attrsOf(e).removed || !byId.has(e.source) || !byId.has(e.target)) continue;
    (outE.get(e.source) ?? outE.set(e.source, []).get(e.source)!).push(e);
    (inE.get(e.target) ?? inE.set(e.target, []).get(e.target)!).push(e);
  }
  const outEdges = (id: string, type: string) => (outE.get(id) ?? []).filter((e) => e.edge_type === type);
  const out = (id: string, type: string) => outEdges(id, type).map((e) => e.target);
  const inn = (id: string, type: string) => (inE.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.source);
  const rg: ResourceGraph = plainGraph({ nodes: [...byId.values()] as never, edges: g.edges.filter((e) => !attrsOf(e).removed) as never });
  // plainGraph's node() is a scan: give it the map
  rg.node = (id: string) => byId.get(id) as never;
  return { g, byId, out, inn, outEdges, rg };
}
export type MediaIx = ReturnType<typeof mediaIndex>;

// ── sets inside sets ─────────────────────────────────────────────────────────

const edgePath = (e: E): string => str(attrsOf(e).path);

export function subResources(ix: MediaIx, id: string): string[] {
  return ix.outEdges(id, EDGE_SUB_RESOURCE)
    .sort((a, b) => edgePath(a).localeCompare(edgePath(b), undefined, { numeric: true })
      || str(ix.byId.get(a.target)?.name).localeCompare(str(ix.byId.get(b.target)?.name), undefined, { numeric: true }))
    .map((e) => e.target);
}
export const parentSets = (ix: MediaIx, id: string): string[] => ix.inn(id, EDGE_SUB_RESOURCE);
export const isSet = (ix: MediaIx, id: string): boolean => {
  const n = ix.byId.get(id);
  if (n?.node_type !== "resource") return false;
  const d = dataOf(n);
  return d.packaging === "directory" || d.packaging === "file_set" || memberRows(ix.rg, id).length > 0
    || ix.out(id, "has_file").length > 1 || subResources(ix, id).length > 0;
};

export interface SetTree {
  id: string; name: string; path: string; role: string | null; packaging: string;
  own: number; files: number; bytes: number; children: SetTree[];
}

/** s3Dgraphy `sets.set_tree`: files / bytes of the whole subtree, live. */
export function setTree(ix: MediaIx, root: string, seen: Set<string> = new Set([root]), path = ""): SetTree {
  const n = ix.byId.get(root);
  const d = dataOf(n);
  const listed = memberRows(ix.rg, root).length > 0 || ix.out(root, "has_file").length > 0;
  const own = listed || !["directory", "file_set"].includes(str(d.packaging)) ? safeFiles(ix, root) : [];
  const bytes = own.reduce((k, f) => k + Number(f.member?.size_bytes ?? dataOf(f.node as N).size_bytes ?? 0), 0);
  const children: SetTree[] = [];
  for (const e of ix.outEdges(root, EDGE_SUB_RESOURCE)) {
    if (seen.has(e.target)) continue;
    children.push(setTree(ix, e.target, new Set([...seen, e.target]), edgePath(e)));
  }
  children.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { id: root, name: str(n?.name) || root, path, role: d.media_role ? str(d.media_role) : null, packaging: str(d.packaging),
           own: own.length, files: own.length + children.reduce((k, c) => k + c.files, 0),
           bytes: bytes + children.reduce((k, c) => k + c.bytes, 0), children };
}
function safeFiles(ix: MediaIx, id: string) {
  try { return resourceFiles(ix.rg, id); } catch { return []; }
}

/** s3Dgraphy `sets.tree_rows`: every row of a set and of its parts, the
 *  children's paths prefixed by their path under the parent. */
export function treeRows(ix: MediaIx, root: string): MemberRow[] {
  const out: MemberRow[] = [];
  const seen = new Set<string>();
  const walk = (id: string, prefix: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const r of memberRows(ix.rg, id)) out.push({ ...r, path: `${prefix}${r.path}` });
    for (const e of ix.outEdges(id, EDGE_SUB_RESOURCE)) walk(e.target, edgePath(e) ? `${prefix}${edgePath(e)}/` : prefix);
  };
  walk(root, "");
  return out;
}

// ── the catalogue ────────────────────────────────────────────────────────────

/** s3Dgraphy `catalogue_root`: the first set a document links that has parts or rows. */
export function catalogueRoot(ix: MediaIx, docId: string): string | null {
  for (const r of ix.out(docId, "has_linked_resource"))
    if (ix.byId.get(r)?.node_type === "resource" && (subResources(ix, r).length || memberRows(ix.rg, r).length)) return r;
  return null;
}
export const isCatalogue = (ix: MediaIx, docId: string): boolean => {
  const r = catalogueRoot(ix, docId);
  return !!r && subResources(ix, r).length > 0;
};

/** The document a set (or a file of a set) is in: up the parents to a set a document links. */
export function documentOf(ix: MediaIx, id: string): string | null {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const d = ix.inn(cur, "has_linked_resource").find((x) => ix.byId.get(x)?.node_type === "document");
    if (d) return d;
    stack.push(...parentSets(ix, cur));
    if (ix.byId.get(cur)?.node_type === "resource_file") stack.push(...ix.inn(cur, "has_file"));
  }
  return null;
}

/** «D.30 · 18383»: the catalogue's name and the entry's; the root is the catalogue itself. */
export function cite(ix: MediaIx, id: string): string {
  const name = str(ix.byId.get(id)?.name) || id;
  const doc = documentOf(ix, id);
  if (!doc) return name;
  const dn = str(ix.byId.get(doc)?.name) || doc;
  return catalogueRoot(ix, doc) === id || doc === id ? dn : `${dn} · ${name}`;
}

export interface CatalogueState {
  state: "open" | "closed" | "ended_unstamped" | "undated";
  start: number | null; end: number | null; live: boolean;
  entries: number; sections: number; files: number; bytes: number; root: string | null;
}

function ownDate(ix: MediaIx, id: string, rule: string): number | null {
  for (const p of ix.out(id, "has_property")) {
    const n = ix.byId.get(p);
    if (n?.node_type !== "property") continue;
    const pt = str(dataOf(n).property_type) || str((n as { property_type?: unknown }).property_type);
    if (pt !== rule && str(n.name) !== rule) continue;
    const v = Number(str(dataOf(n).value ?? (n as { value?: unknown }).value ?? n.description));
    if (Number.isFinite(v) && str(dataOf(n).value ?? (n as { value?: unknown }).value ?? n.description) !== "") return v;
  }
  const d = dataOf(ix.byId.get(id));
  const v = d[rule];
  return typeof v === "number" ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;
}

function leaves(t: SetTree): SetTree[] {
  return t.children.flatMap((c) => (c.children.length ? leaves(c) : [c]));
}
const countSets = (t: SetTree): number => t.children.reduce((k, c) => k + 1 + countSets(c), 0);

/** s3Dgraphy `catalogue_state` — `start` / `end` as the document's own or
 *  inherited dates (`dates` given by the caller: the Inspector's resolver),
 *  else its own date properties. */
export function catalogueState(ix: MediaIx, docId: string, dates?: { start: number | null; end: number | null }): CatalogueState {
  const start = dates ? dates.start : ownDate(ix, docId, "absolute_time_start");
  const end = dates ? dates.end : ownDate(ix, docId, "absolute_time_end");
  const stamp = dataOf(ix.byId.get(docId)).catalog_stamp as Record<string, number> | undefined;
  const state: CatalogueState["state"] = end != null && stamp ? "closed" : end != null ? "ended_unstamped" : start != null ? "open" : "undated";
  const root = catalogueRoot(ix, docId);
  if (state === "closed" && stamp)
    return { state, start, end, live: false, root, entries: Number(stamp.entries ?? 0), sections: Number(stamp.sections ?? 0),
             files: Number(stamp.files ?? 0), bytes: Number(stamp.bytes ?? 0) };
  if (!root) return { state, start, end, live: true, root, entries: 0, sections: 0, files: 0, bytes: 0 };
  const t = setTree(ix, root);
  const lv = leaves(t);
  return { state, start, end, live: true, root, entries: lv.length, sections: countSets(t) - lv.length, files: t.files, bytes: t.bytes };
}

export function catalogueEntries(ix: MediaIx, docId: string): Array<{ id: string; name: string; path: string; files: number; citation: string }> {
  const root = catalogueRoot(ix, docId);
  if (!root) return [];
  const dn = str(ix.byId.get(docId)?.name) || docId;
  const out: Array<{ id: string; name: string; path: string; files: number; citation: string }> = [];
  const walk = (t: SetTree, prefix: string) => {
    for (const c of t.children) {
      const p = prefix ? `${prefix}/${c.path || c.name}` : (c.path || c.name);
      if (c.children.length) walk(c, p); else out.push({ id: c.id, name: c.name, path: p, files: c.files, citation: `${dn} · ${c.name}` });
    }
  };
  walk(setTree(ix, root), "");
  return out;
}

// ── the media of a node ──────────────────────────────────────────────────────

export type MediaKind = "image" | "pdf" | "3d" | "drawing" | "other";

export interface MediaItem {
  /** unique in a list: a node id, or `<set>#<path>` for a listed member */
  key: string;
  /** the node it is, or the id it WILL have when materialized (listed) */
  id: string;
  /** a node of the graph (false: a member listed in its set) */
  isNode: boolean;
  /** the set it is a member of (null: a resource of its own, a model) */
  setId: string | null;
  /** its path in the set (a listed member, a file of a set) */
  path: string | null;
  name: string;
  locator: string;
  medium: MediaKind;
  checksum: string | null;
  sizeBytes: number | null;
  /** the role: its own, else its set's */
  role: string | null;
  /** the document it is in («nel documento D.xx»), null = not censused */
  doc: string | null;
  /** the folder in its set (the tree of the viewer) */
  folder: string;
  /** the camera and the date a reading said of it */
  camera: string; date: string;
}

const IMAGE_RE = /\.(jpe?g|png|tiff?|webp|bmp|gif|heic)$/i;
const DRAW_RE = /\.(svg|dxf|dwg|ai|eps)$/i;
const M3D_RE = /\.(glb|gltf|obj|ply|spz|sog|rad|lcc2|fbx|3tz|las|laz|e57)$/i;
export function mediaKindOf(locator: string, mediaType?: string | null): MediaKind {
  const clean = locator.split(/[?#]/)[0];
  if (/\.pdf$/i.test(clean) || mediaType === "application/pdf") return "pdf";
  if (DRAW_RE.test(clean)) return "drawing";
  if (IMAGE_RE.test(clean) || (mediaType ?? "").startsWith("image/")) return "image";
  if (M3D_RE.test(clean) || (mediaType ?? "").startsWith("model/")) return "3d";
  return "other";
}

const leaf = (s: string): string => basename(s.split(/[?#]/)[0]) || s;

function setItems(ix: MediaIx, setId: string, prefix: string, doc: string | null, setRole: string | null, out: MediaItem[]): void {
  const d = dataOf(ix.byId.get(setId));
  const role = d.media_role ? str(d.media_role) : setRole;
  // a set split into its parts lists nothing of its own: its url is a folder
  const listed = memberRows(ix.rg, setId).length > 0 || ix.out(setId, "has_file").length > 0;
  const own = listed || !["directory", "file_set"].includes(str(d.packaging)) ? safeFiles(ix, setId) : [];
  for (const f of own) {
    const n = f.node as N;
    const nd = dataOf(n);
    const loc = str(nd.url);
    const row: MemberRow | undefined = f.member;
    out.push({
      key: f.listed ? `${setId}#${f.path}` : n.id, id: n.id, isNode: !f.listed, setId, path: f.path,
      name: str(n.name) || leaf(f.path), locator: loc, medium: mediaKindOf(f.listed ? loc || f.path : typeKeyOf(n) || loc || f.path, str(nd.media_type)),
      checksum: str(row?.digest ?? nd.checksum) || null, sizeBytes: Number(row?.size_bytes ?? nd.size_bytes ?? NaN) || null,
      role: str(row?.media_role ?? nd.media_role) || role, doc,
      folder: [prefix, f.path.includes("/") ? dirname(f.path) : ""].filter(Boolean).join("/"),
      camera: str(row?.camera_label ?? nd.camera_label ?? row?.sensor_label ?? nd.sensor_label),
      date: str(row?.taken_at ?? nd.taken_at).slice(0, 10),
    });
  }
  for (const e of ix.outEdges(setId, EDGE_SUB_RESOURCE)) {
    const name = str(ix.byId.get(e.target)?.name) || e.target;
    setItems(ix, e.target, [prefix, edgePath(e) || name].filter(Boolean).join("/"), doc, role, out);
  }
}

function resourceItem(ix: MediaIx, id: string, doc: string | null): MediaItem | null {
  const n = ix.byId.get(id);
  const d = dataOf(n);
  const loc = str(d.url ?? d.filename ?? d.path);
  if (!n || !loc || /^sha256:/i.test(loc)) return null;
  return { key: id, id, isNode: true, setId: null, path: null, name: str(n.name) || leaf(loc), locator: loc,
           medium: mediaKindOf(typeKeyOf(n) || loc, str(d.media_type)), checksum: str(d.checksum) || null,
           sizeBytes: Number(d.size_bytes ?? NaN) || null, role: d.media_role ? str(d.media_role) : null, doc,
           folder: "", camera: "", date: "" };
}

/** What a resource stands for: its tree when it is a set, else itself. */
function itemsOfResource(ix: MediaIx, r: string, out: MediaItem[], docHint?: string | null): void {
  const doc = docHint !== undefined ? docHint : documentOf(ix, r);
  if (isSet(ix, r)) setItems(ix, r, "", doc, null, out);
  else { const it = resourceItem(ix, r, doc); if (it) out.push(it); }
}

/** The models of a node as items (a thumbnail glyph: the Space draws them). */
function modelItems(ix: MediaIx, id: string, doc: string | null, out: MediaItem[]): void {
  for (const et of ["has_representation_model", "has_representation_model_doc", "has_representation_model_sf"])
    for (const m of ix.out(id, et)) {
      const n = ix.byId.get(m);
      if (!n || !/representation_model/.test(str(n.node_type))) continue;
      out.push({ key: m, id: m, isNode: true, setId: null, path: null, name: str(n.name) || m, locator: "", medium: "3d",
                 checksum: null, sizeBytes: null, role: "model_3d", doc, folder: "", camera: "", date: "" });
    }
}

const STRAT_LIKE = (t: string) => !["resource", "resource_file", "document", "extractor", "combiner", "property",
  "annotation_region", "EpochNode", "graph", "author", "author_ai", "license", "embargo", "geo_position"].includes(t);

/** The media of ANY node, frontispiece first, each once (key, then checksum). */
export function mediaOf(g: G | MediaIx, nodeId: string): MediaItem[] {
  const ix = "byId" in g ? g : mediaIndex(g);
  const n = ix.byId.get(nodeId);
  if (!n) return [];
  const nt = str(n.node_type);
  const out: MediaItem[] = [];
  if (nt === "document") {
    for (const r of ix.out(nodeId, "has_linked_resource")) itemsOfResource(ix, r, out, nodeId);
    const own = resourceItem(ix, nodeId, nodeId);
    if (own && !out.some((x) => leaf(x.locator).toLowerCase() === leaf(own.locator).toLowerCase())) out.push(own);
    modelItems(ix, nodeId, nodeId, out);
  } else if (nt === "resource") {
    itemsOfResource(ix, nodeId, out);
  } else if (nt === "resource_file") {
    const it = resourceItem(ix, nodeId, documentOf(ix, nodeId));
    if (it) out.push(it);
  } else {
    // a unit, a model, any node: its linked sets and resources, then the
    // roads of a unit's images (unit-images.ts), then its models
    for (const r of ix.out(nodeId, "has_linked_resource")) itemsOfResource(ix, r, out);
    if (STRAT_LIKE(nt)) {
      for (const grp of unitImages(ix.g as never, nodeId))
        for (const it of grp.items) {
          const node = ix.byId.get(it.id);
          out.push({ key: it.id, id: it.id, isNode: true, setId: null, path: null, name: it.name, locator: it.locator,
                     medium: it.medium, checksum: it.checksum, sizeBytes: Number(dataOf(node).size_bytes ?? NaN) || null,
                     role: str(dataOf(node).media_role) || null, doc: documentOf(ix, it.id), folder: "", camera: "", date: "" });
        }
    }
    modelItems(ix, nodeId, null, out);
  }
  const seenKey = new Set<string>(), seenSum = new Set<string>();
  const uniq = out.filter((x) => {
    if (seenKey.has(x.key) || seenKey.has(x.id) || (x.checksum && seenSum.has(x.checksum))) return false;
    seenKey.add(x.key); seenKey.add(x.id);
    if (x.checksum) seenSum.add(x.checksum);
    return true;
  });
  // the frontispiece first (its own role, or its set's), the order kept otherwise
  return uniq.map((x, i) => ({ x, i })).sort((a, b) => Number(b.x.role === FRONTISPIECE) - Number(a.x.role === FRONTISPIECE) || a.i - b.i)
    .map((p) => p.x);
}

/** The groups a set item belongs to (logical groups drawing from its set). */
export function groupsOfItem(ix: MediaIx, it: MediaItem): string[] {
  if (!it.setId || !it.path) return [];
  const out: string[] = [];
  for (const n of ix.byId.values()) {
    if (n.node_type !== "resource") continue;
    const d = dataOf(n);
    if (d.members_from !== it.setId && n.id !== it.setId) continue;
    if (n.id === it.setId) continue;
    if (memberRows(ix.rg, n.id).some((r) => r.path === it.path)) out.push(n.id);
  }
  return out;
}

/** The tree of the viewer: by folder, by group, by role — `[key, items]`. */
export function groupItems(ix: MediaIx, items: MediaItem[], by: "folder" | "group" | "role",
  words: { none: string; role: (id: string) => string }): Array<[string, MediaItem[]]> {
  const m = new Map<string, MediaItem[]>();
  const add = (k: string, it: MediaItem) => (m.get(k) ?? m.set(k, []).get(k)!).push(it);
  for (const it of items) {
    if (by === "folder") add(it.folder || words.none, it);
    else if (by === "role") add(it.role ? words.role(it.role) : words.none, it);
    else {
      const gs = groupsOfItem(ix, it);
      if (!gs.length) add(words.none, it);
      for (const gid of gs) add(str(ix.byId.get(gid)?.name) || gid, it);
    }
  }
  return [...m.entries()].sort((a, b) => (a[0] === words.none ? 1 : 0) - (b[0] === words.none ? 1 : 0)
    || a[0].localeCompare(b[0], undefined, { numeric: true }));
}

/** A unit's own items in a viewer: the pictures linked to it (directly, its
 *  groups, its photo resource) — the filter «solo le foto di <unità>». */
export function unitItemKeys(ix: MediaIx, unitId: string): Set<string> {
  const keys = new Set<string>();
  for (const it of mediaOf(ix, unitId)) { keys.add(it.key); keys.add(it.id); if (it.checksum) keys.add(it.checksum); }
  return keys;
}
export const itemIsOf = (keys: Set<string>, it: MediaItem): boolean =>
  keys.has(it.key) || keys.has(it.id) || (!!it.checksum && keys.has(it.checksum));

export { mediumOfLocator };
