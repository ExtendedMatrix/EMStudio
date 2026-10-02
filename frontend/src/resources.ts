import { packagingName } from "./rules";
// NIGHT-RISORSA-FILE · the resource and its files — one way to make a
// resource, one way to read it. The TypeScript MIRROR of s3Dgraphy's
// `resources/files.py` (`api.add_resource` & co., s3Dgraphy 1.6.17 /
// connections 1.6.31), with the same contract, the same ids and the same
// em.json it writes: `check-resources.mjs` compares this module's output with
// a golden written BY s3Dgraphy (`testdata/resources-golden.json`).
//
// Decided by E.D. on 30 Sep 2026 (brain: *La risorsa e i suoi file*):
//
// * the `resource` node is the SET, the `resource_file` node is each FILE, and
//   `has_file` carries the role (`entry_point` | `member`) and the path
//   relative to the entry point;
// * with ONE file the file is IMPLICIT: `url` (and `checksum`) on the resource,
//   no `has_file` — every graph written before today reads as it did;
// * the representations of a thing are sibling resources tied by
//   `dtc_derived_from`, picked by the declared `packaging`, inside one kind;
// * replacing a file makes a NEW resource that `was_revision_of` the old one.
//
// Why a mirror in TS when invariant 2 says «no JavaScript port of s3dgraphy»:
// this is not the semantics of the EM language (those live in em-core and the
// datamodels) but the ONE constructor of a node the editor writes by hand at
// ten places — the same reason `commands.ts` mirrors `uuid5`. The rule of the
// implicit file is applied HERE and nowhere else in EMStudio
// (`check-resources.mjs` §2 refuses a `node_type: "resource"` written anywhere
// else).
import { uuid5 } from "./commands";
import type { DocumentStore } from "./model";
import type { EmEdge, EmNode } from "./types";

export const EDGE_HAS_FILE = "has_file";
export const EDGE_DERIVED_FROM = "dtc_derived_from";
export const EDGE_REVISION_OF = "was_revision_of";
export const FILE_ROLES = ["entry_point", "member"] as const;
export type FileRole = (typeof FILE_ROLES)[number];

/** `uuid5(NAMESPACE_URL, "https://extendedmatrix.org/s3dgraphy/resource-file")`
 *  — s3Dgraphy's `_NS`: the same file gets the same id in every graph. */
const NAMESPACE_URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const NS = uuid5(NAMESPACE_URL, "https://extendedmatrix.org/s3dgraphy/resource-file");

/** The keys of a file spec; anything else is refused (a typo would otherwise
 *  be a field silently not written). */
const FILE_KEYS = new Set(["path", "url", "checksum", "size_bytes", "media_type", "role",
  "id", "stamp", "blend_file", "datablock", "datablock_type"]);

export interface FileSpec {
  path?: string;
  url?: string;
  checksum?: string | null;
  size_bytes?: number | null;
  media_type?: string | null;
  role?: FileRole;
  id?: string;
  stamp?: unknown;
  blend_file?: string;
  datablock?: string;
  datablock_type?: string;
}

// ── the graph a resource lives in ───────────────────────────────────────────

/** What this module needs of a graph. Two of them: the editor's
 *  `DocumentStore` (every write an undoable, op-emitting mutation) and a plain
 *  `{nodes, edges}` (the shelf, the corpus, a test). */
export interface ResourceGraph {
  nodes(): EmNode[];
  edges(): EmEdge[];
  node(id: string): EmNode | undefined;
  addNode(n: EmNode): void;
  addEdge(e: EmEdge & { id: string }): void;
  removeEdge(id: string): void;
  removeNode(id: string): void;
  /** replace a node's `data` wholesale */
  setData(id: string, data: Record<string, unknown>): void;
  batch<T>(fn: () => T): T;
}

export function plainGraph(g: { nodes: EmNode[]; edges: EmEdge[] }): ResourceGraph {
  return {
    nodes: () => g.nodes,
    edges: () => g.edges,
    node: (id) => g.nodes.find((n) => n.id === id),
    addNode: (n) => { g.nodes.push(n); },
    addEdge: (e) => { g.edges.push(e); },
    removeEdge: (id) => { g.edges = g.edges.filter((e) => e.id !== id); },
    removeNode: (id) => { g.nodes = g.nodes.filter((n) => n.id !== id); },
    setData: (id, data) => { const n = g.nodes.find((x) => x.id === id); if (n) n.data = data; },
    batch: (fn) => fn(),
  };
}

export function storeGraph(store: DocumentStore): ResourceGraph {
  return {
    nodes: () => store.liveNodes(),
    edges: () => store.liveEdges(),
    node: (id) => store.node(id),
    addNode: (n) => { store.addNode(n); },
    addEdge: (e) => {
      const { id, source, target, edge_type, attributes } = e as EmEdge & {
        id: string; attributes?: Record<string, unknown> };
      store.addEdge(source, target, String(edge_type), attributes, id);
    },
    removeEdge: (id) => {
      const e = store.liveEdges().find((x) => x.id === id);
      if (e) store.deleteEdge(e);
    },
    removeNode: (id) => store.deleteNode(id),
    setData: (id, data) => store.updateNode(id, { data } as Partial<EmNode>),
    batch: (fn) => store.batch(fn),
  };
}

// ── small helpers, as in files.py ───────────────────────────────────────────

const dataOf = (n: EmNode): Record<string, unknown> =>
  (n.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;
const isResource = (n: EmNode | undefined): n is EmNode => n?.node_type === "resource";
const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

function mustResource(g: ResourceGraph, id: string): EmNode {
  const n = g.node(id);
  if (!isResource(n)) throw new Error(`'${id}' is not a resource of this graph`);
  return n;
}

const fileEdges = (g: ResourceGraph, resId: string): EmEdge[] =>
  g.edges().filter((e) => e.edge_type === EDGE_HAS_FILE && e.source === resId);

/** Python's `urllib.parse.quote(s, safe)`: unreserved kept, the rest UTF-8
 *  percent-encoded (`encodeURIComponent` also keeps `!'()*`, Python does not). */
function pyQuote(s: string, safe = ""): string {
  let out = encodeURIComponent(s).replace(/[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  for (const ch of safe) out = out.split(encodeURIComponent(ch)).join(ch);
  return out;
}
function pyUnquote(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

const BLEND_SCHEME = "blend://";

/** `blend://<path>#<Type>/<name>`, encoded — s3Dgraphy `make_blend_locator`. */
export function makeBlendLocator(blendPath: string, datablockType: string, name: string): string {
  if (!blendPath || !name) return "";
  return BLEND_SCHEME + pyQuote(blendPath, "/") + "#" + pyQuote(datablockType || "Object")
    + "/" + pyQuote(name);
}

/** `[path, type, name]` from a `blend://` locator, or null — never throws. */
export function parseBlendLocator(locator: string): [string, string, string] | null {
  const s = str(locator).trim();
  if (!s.toLowerCase().startsWith(BLEND_SCHEME)) return null;
  const rest = s.slice(BLEND_SCHEME.length);
  const hash = rest.indexOf("#");
  if (hash < 0) return null;
  const path = rest.slice(0, hash), frag = rest.slice(hash + 1);
  const slash = frag.indexOf("/");
  if (slash < 0) return null;
  const type = frag.slice(0, slash), name = frag.slice(slash + 1);
  if (!path || !name) return null;
  return [pyUnquote(path), pyUnquote(type), pyUnquote(name)];
}

/** The name a single file is known by at its entry point. */
export function leaf(url: string): string {
  const b = parseBlendLocator(url);
  if (b) return b[2];
  const u = str(url).replace(/\/+$/, "");
  const base = u.slice(u.lastIndexOf("/") + 1);
  return base || str(url);
}

/** From the CHECKSUM when there is one (the same bytes are one node wherever
 *  they turn up), otherwise from the resource and the path. */
export function fileIdFor(resId: string, path: string, checksum?: string | null): string {
  return checksum ? uuid5(NS, `file|${checksum}`) : uuid5(NS, `file|${resId}|${path}`);
}

export function revisionIdFor(resId: string, oldFileId: string, checksum: string): string {
  return uuid5(NS, `revision|${resId}|${oldFileId}|${checksum}`);
}

const findFileByChecksum = (g: ResourceGraph, checksum?: string | null): EmNode | undefined =>
  checksum ? g.nodes().find((n) => n.node_type === "resource_file"
    && (dataOf(n).checksum || null) === checksum) : undefined;

// ── the node readings (ResourceNode.effective_*) ───────────────────────────

/** s3Dgraphy `ResourceNode.RESOURCE_TYPES` — how the constructor reads a kind
 *  from an extension when it is asked to (`kind: ""`). Mirrored as it is: a
 *  table of the Python class, not of the datamodel. */
const RESOURCE_TYPES: Array<[string, string[]]> = [
  ["3d_model", ["gltf", "obj", "fbx", "3ds", "blend"]],
  ["proxy_model", ["glb"]],
  ["image", ["jpg", "jpeg", "png", "tif", "tiff", "bmp"]],
  ["document", ["pdf", "doc", "docx", "txt"]],
  ["web_page", ["http", "https"]],
  ["video", ["mp4", "avi", "mov"]],
  ["point_cloud", ["e57", "pts", "las", "laz"]],
];
function determineUrlType(url: string): string {
  if (/^https?:\/\//.test(url)) return "web_page";
  const ext = url.includes(".") ? url.toLowerCase().split(".").pop()! : "";
  for (const [kind, exts] of RESOURCE_TYPES) if (exts.includes(ext)) return kind;
  return "unknown";
}

export function effectiveTier(n: EmNode): string {
  const d = dataOf(n);
  if (d.tier) return String(d.tier);
  return str(d.url).startsWith(BLEND_SCHEME) ? "master" : "distribution";
}

/** The packaging to USE: the declared one, or the reading of the locator's
 *  grammar (`blend://` datablock, `.zip`/`.3tz` archive, a trailing slash a
 *  directory, else one file). Never from any other extension. */
export function effectivePackaging(n: EmNode): string {
  const d = dataOf(n);
  if (d.packaging) return String(d.packaging);
  const url = str(d.url);
  if (url.startsWith(BLEND_SCHEME)) return "datablock";
  if (/\.(zip|3tz)$/i.test(url)) return "archive";
  return url.endsWith("/") ? "directory" : "file";
}

// ═════════════════════════════════════════════════════════════════════════════
// READING
// ═════════════════════════════════════════════════════════════════════════════

export interface ResourceFile {
  role: FileRole;
  path: string;
  node: EmNode;
  implicit: boolean;
  edge_id: string | null;
}

/** The files of a resource, entry point first. With `has_file` edges, those;
 *  with none and a `url`, ONE implicit file — a transient node `<res>#file`,
 *  NOT added to the graph (reading must not write); with neither, `[]`. */
export function resourceFiles(g: ResourceGraph, resId: string): ResourceFile[] {
  const res = mustResource(g, resId);
  const edges = fileEdges(g, resId);
  if (edges.length) {
    const out: ResourceFile[] = edges.map((e) => {
      const f = g.node(e.target) ?? { id: e.target, node_type: "resource_file" };
      const a = (e.attributes ?? {}) as Record<string, unknown>;
      return { role: (a.role as FileRole) || "member",
               path: str(a.path) || leaf(str(dataOf(f).url)),
               node: f, implicit: false, edge_id: e.id ?? null };
    });
    // Python sorts on (role != entry_point, path): a code-point order
    out.sort((a, b) => (Number(a.role !== "entry_point") - Number(b.role !== "entry_point"))
      || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return out;
  }
  const d = dataOf(res);
  const url = str(d.url);
  if (!url) return [];
  return [{ role: "entry_point", path: leaf(url), implicit: true, edge_id: null,
            node: fileNode(`${resId}#file`, leaf(url), { url, checksum: d.checksum,
              size_bytes: d.size_bytes, media_type: d.media_type }) }];
}

export const entryPoint = (g: ResourceGraph, resId: string): ResourceFile | null =>
  resourceFiles(g, resId).find((f) => f.role === "entry_point") ?? null;

/** Every resource that holds this file (a file shared by two tiles is seen in
 *  both), in edge order. */
export function resourcesOfFile(g: ResourceGraph, fileId: string): string[] {
  return g.edges().filter((e) => e.edge_type === EDGE_HAS_FILE && e.target === fileId)
    .map((e) => e.source);
}

const KIND_WILDCARDS = new Set(["", "unknown", "External link"]);
const kindOf = (n: EmNode): string => str(dataOf(n).url_type);
const sameKind = (a: EmNode, b: EmNode): boolean => {
  const ka = kindOf(a), kb = kindOf(b);
  return KIND_WILDCARDS.has(ka) || KIND_WILDCARDS.has(kb) || ka === kb;
};

export interface Representation {
  id: string; name: string; kind: string;
  tier: string; packaging: string;
  tier_declared: string | null; packaging_declared: string | null;
  preferred: boolean;
  relation: "self" | "source" | "derived" | "related";
  distance: number;
}

function reprEntry(n: EmNode, relation: Representation["relation"], distance: number): Representation {
  const d = dataOf(n);
  return { id: n.id, name: str(n.name), kind: kindOf(n),
           tier: effectiveTier(n), packaging: effectivePackaging(n),
           tier_declared: (d.tier as string) || null,
           packaging_declared: (d.packaging as string) || null,
           preferred: !!d.preferred, relation, distance };
}

const byStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The resources tied to `resId` by derivation, both directions, transitively,
 *  nearest first — **inside one kind** (decision of E.D.: a glb made from an
 *  image is a derivation of the image, not a representation of it). */
export function representationsOf(g: ResourceGraph, resId: string, includeSelf = false): Representation[] {
  const start = mustResource(g, resId);
  const ups = new Map<string, string[]>(), downs = new Map<string, string[]>();
  for (const e of g.edges()) {
    if (e.edge_type !== EDGE_DERIVED_FROM) continue;
    (ups.get(e.source) ?? ups.set(e.source, []).get(e.source)!).push(e.target);
    (downs.get(e.target) ?? downs.set(e.target, []).get(e.target)!).push(e.source);
  }
  const seen = new Set([resId]);
  const out = includeSelf ? [reprEntry(start, "self", 0)] : [];
  let frontier = [resId], distance = 0;
  while (frontier.length) {
    distance++;
    const next: string[] = [];
    for (const cur of frontier) {
      const steps: Array<[string, "source" | "derived"]> = [
        ...[...(ups.get(cur) ?? [])].sort(byStr).map((t) => [t, "source"] as [string, "source"]),
        ...[...(downs.get(cur) ?? [])].sort(byStr).map((s) => [s, "derived"] as [string, "derived"]),
      ];
      for (const [other, rel] of steps) {
        if (seen.has(other)) continue;
        const n = g.node(other);
        if (!isResource(n) || !sameKind(start, n)) continue;
        seen.add(other);
        out.push(reprEntry(n, distance === 1 ? rel : "related", distance));
        next.push(other);
      }
    }
    frontier = next;
  }
  return out;
}

export interface Pick { picked: Representation | null; candidates: Representation[]; reason: string }

const pyList = (xs: string[]) => `[${xs.map((x) => `'${x}'`).join(", ")}]`;

/** The first representation a reader can open — `canOpen` is the set of
 *  PACKAGINGS it handles (web viewer: file_set, file, directory, archive;
 *  Blender: datablock). The start, then nearest first; a `preferred` one
 *  first at equal distance (a suggestion, never a gate). */
export function pickRepresentation(g: ResourceGraph, resId: string, canOpen: Iterable<string>): Pick {
  const wanted = new Set(canOpen);
  const ordered = representationsOf(g, resId, true)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.distance - b.r.distance)
      || (Number(!a.r.preferred) - Number(!b.r.preferred)) || (a.i - b.i))
    .map((x) => x.r);
  for (const r of ordered) {
    if (wanted.has(r.packaging)) {
      const how = r.packaging_declared ? "declared" : "read from the locator";
      return { picked: r, candidates: ordered,
               reason: `${r.id} is ${r.packaging} (${how}), which this reader opens` };
    }
  }
  const have = [...new Set(ordered.map((r) => r.packaging))].sort(byStr);
  return { picked: null, candidates: ordered,
           reason: `none of the ${ordered.length} representation(s) opens here: `
             + `they are ${pyList(have)}, this reader opens ${pyList([...wanted].sort(byStr))}` };
}

/** The chain of revisions `resId` belongs to, OLDEST FIRST. A fork or a merge
 *  throws, naming the resources: which branch is current is not ours to say. */
export function revisionsOf(g: ResourceGraph, resId: string): string[] {
  mustResource(g, resId);
  const newer = new Map<string, Set<string>>(), older = new Map<string, Set<string>>();
  for (const e of g.edges()) {
    if (e.edge_type !== EDGE_REVISION_OF) continue;
    (older.get(e.source) ?? older.set(e.source, new Set()).get(e.source)!).add(e.target);
    (newer.get(e.target) ?? newer.set(e.target, new Set()).get(e.target)!).add(e.source);
  }
  const chain = [resId], seen = new Set([resId]);
  for (const [steps, before] of [[older, true], [newer, false]] as const) {
    let cur = resId;
    while (steps.get(cur)?.size) {
      const nxt = [...steps.get(cur)!].sort(byStr);
      if (nxt.length > 1) {
        const what = before ? "is a revision of" : "has the revisions";
        throw new RevisionFork(`'${cur}' ${what} ${pyList(nxt)}: the chain of revisions `
          + "branches here and has no single order", cur, nxt);
      }
      cur = nxt[0];
      if (seen.has(cur)) throw new Error(`the revisions of '${resId}' loop at '${cur}'`);
      seen.add(cur);
      if (before) chain.unshift(cur); else chain.push(cur);
    }
  }
  return chain;
}

/** A chain that branches: the inspector shows it as a warning. */
export class RevisionFork extends Error {
  constructor(message: string, readonly at: string, readonly branches: string[]) { super(message); }
}

export const currentRevision = (g: ResourceGraph, resId: string): string =>
  revisionsOf(g, resId).at(-1)!;

// ═════════════════════════════════════════════════════════════════════════════
// WRITING
// ═════════════════════════════════════════════════════════════════════════════

function checkFile(spec: FileSpec): FileSpec {
  if (!spec || typeof spec !== "object") throw new Error(`a file is an object, got ${spec}`);
  const unknown = Object.keys(spec).filter((k) => !FILE_KEYS.has(k)).sort();
  if (unknown.length)
    throw new Error(`unknown file key(s) ${pyList(unknown)}; known: ${pyList([...FILE_KEYS].sort())}`);
  if (spec.role !== undefined && spec.role !== null && !FILE_ROLES.includes(spec.role))
    throw new Error(`file role must be one of ['entry_point', 'member'], got '${spec.role}'`);
  return spec;
}

function locatorOf(spec: FileSpec): string {
  if (spec.url) return String(spec.url);
  if (spec.blend_file && spec.datablock)
    return makeBlendLocator(spec.blend_file, spec.datablock_type || "Object", spec.datablock);
  return str(spec.path);
}

const hasIdentity = (spec: FileSpec): boolean => !!(spec.id || spec.stamp);

/** A `resource_file` node as s3Dgraphy's `ResourceFileNode` writes it. */
function fileNode(id: string, name: string, f: { url?: unknown; checksum?: unknown;
  size_bytes?: unknown; media_type?: unknown }): EmNode {
  const data: Record<string, unknown> = {};
  if (f.url) data.url = String(f.url);
  if (f.checksum) data.checksum = String(f.checksum);
  if (f.size_bytes !== undefined && f.size_bytes !== null) data.size_bytes = sizeOf(f.size_bytes);
  if (f.media_type) data.media_type = String(f.media_type);
  return { id, name: name || id, node_type: "resource_file", data };
}

function sizeOf(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`size_bytes must be an integer number of bytes, got ${v}`);
  if (n < 0) throw new Error(`size_bytes cannot be negative, got ${n}`);
  return n;
}

/** Create (or reuse by id, then by checksum) a file node — no edge. */
function writeFileNode(g: ResourceGraph, resId: string, spec: FileSpec): [EmNode, string] {
  const locator = locatorOf(spec);
  const path = str(spec.path) || leaf(locator);
  const checksum = spec.checksum || null;
  let node = spec.id ? g.node(spec.id) : undefined;
  node ??= findFileByChecksum(g, checksum);
  if (!node) {
    const fid = spec.id || fileIdFor(resId, path, checksum);
    node = g.node(fid);
    if (!node) {
      node = fileNode(fid, leaf(locator) || path, { url: locator, checksum,
        size_bytes: spec.size_bytes, media_type: spec.media_type });
      if (spec.stamp) (node.data as Record<string, unknown>).stamp_receipt = spec.stamp;
      g.addNode(node);
    }
  }
  return [node, path];
}

/** The file node and its `has_file` edge (role and path set, as Python does,
 *  on an edge that already exists too: then the edge is written again). */
function writeFile(g: ResourceGraph, resId: string, spec: FileSpec, role: FileRole): EmNode {
  const [node, path] = writeFileNode(g, resId, spec);
  const id = `${resId}__${EDGE_HAS_FILE}__${node.id}`;
  const old = g.edges().find((e) => e.id === id);
  const attributes = { ...((old?.attributes ?? {}) as Record<string, unknown>), role, path };
  if (old) {
    const a = (old.attributes ?? {}) as Record<string, unknown>;
    if (a.role === role && a.path === path) return node;
    g.removeEdge(id);
  }
  g.addEdge({ id, edge_type: EDGE_HAS_FILE, source: resId, target: node.id, attributes });
  return node;
}

export interface AddResourceOptions {
  name: string;
  /** the genre (`url_type`): undefined keeps the constructor's «External
   *  link», "" reads it from the url — the two behaviours, kept apart */
  kind?: string;
  files?: FileSpec[];
  packaging?: string;
  tier?: string;
  scope?: string;
  residency?: string;
  role?: string;
  derivedFrom?: string[];
  resourceId?: string;
  description?: string;
  sizeBytes?: number | null;
  primitives?: Record<string, number>;
  preferred?: boolean;
  /** extra `data` fields, written as they come (author, dtc_kind…) */
  data?: Record<string, unknown>;
  /** EMStudio: the top-level `description` the inspector edits; s3Dgraphy
   *  writes `data.description`, and both are written */
}

const TIERS = ["master", "distribution"];
const PACKAGINGS = ["file", "directory", "archive", "file_set", "datablock"];

/** A `resource` node as s3Dgraphy's `ResourceNode(...)` builds it. */
function resourceNode(id: string, o: AddResourceOptions, url: string, checksum: string | null): EmNode {
  const data: Record<string, unknown> = {
    url,
    url_type: o.kind === undefined ? "External link" : (o.kind || determineUrlType(url)),
    description: o.description ?? "",
  };
  if (checksum) data.checksum = String(checksum);
  if (o.scope !== undefined && o.scope !== null) data.scope = o.scope;
  if (o.residency !== undefined && o.residency !== null) data.residency = o.residency;
  if (o.role !== undefined && o.role !== null) data.role = o.role;
  if (o.tier !== undefined && o.tier !== null) {
    if (!TIERS.includes(o.tier)) throw new Error(`tier must be one of ${pyList(TIERS)}, got '${o.tier}'`);
    data.tier = o.tier;
  }
  if (o.packaging !== undefined && o.packaging !== null) {
    if (!PACKAGINGS.includes(o.packaging))
      throw new Error(`packaging must be one of ${pyList(PACKAGINGS)}, got '${o.packaging}'`);
    data.packaging = o.packaging;
  }
  if (o.primitives) data.primitives = { ...o.primitives };
  if (o.preferred) data.preferred = true;
  return { id, name: o.name, node_type: "resource", description: o.description ?? "", data };
}

/** Make a resource — THE one way, for every creation point.
 *
 *  * no file → `url: ""` (a placeholder, a parent named by a stamp);
 *  * one file → the IMPLICIT form (url, checksum, size_bytes, media_type on
 *    the resource), unless that file has an `id` or a `stamp`;
 *  * several → one `resource_file` each, reached by `has_file` with role and
 *    path; the first is the entry point unless one says so.
 *
 *  `g` may be null: the node is returned without being added. */
export function addResource(g: ResourceGraph | null, o: AddResourceOptions): EmNode {
  const specs = (o.files ?? []).map((f) => checkFile({ ...f }));
  const rid = o.resourceId || uuid4();
  const single = specs.length === 1 && !hasIdentity(specs[0]);
  const node = resourceNode(rid, o, single ? locatorOf(specs[0]) : "",
    single ? (specs[0].checksum || null) : null);
  const d = node.data as Record<string, unknown>;
  let weight = o.sizeBytes;
  if (single && (weight === undefined || weight === null)) weight = specs[0].size_bytes;
  if (weight !== undefined && weight !== null) {
    // `set_measures` writes size_bytes where the constructor put its measures:
    // after primitives when both came in (the key order s3Dgraphy writes)
    d.size_bytes = sizeOf(weight);
  }
  if (single && specs[0].media_type) d.media_type = specs[0].media_type;
  for (const [k, v] of Object.entries(o.data ?? {})) d[k] = v;
  if (!g) {
    if (specs.length && !single)
      throw new Error("a resource of several files needs a graph to hold its file nodes");
    if (o.derivedFrom?.length) throw new Error("derived_from needs a graph to hold the edges");
    return node;
  }
  return g.batch(() => {
    g.addNode(node);
    if (specs.length && !single) writeFiles(g, rid, specs);
    for (const parent of o.derivedFrom ?? []) declareRepresentation(g, rid, parent);
    return g.node(rid) ?? node;
  });
}

function writeFiles(g: ResourceGraph, rid: string, specs: FileSpec[]): void {
  const entries = specs.filter((s) => s.role === "entry_point");
  if (entries.length > 1) throw new Error(`a resource has ONE entry point, ${entries.length} given`);
  const hasEntry = entries.length > 0 || resourceFiles(g, rid).some((r) => r.role === "entry_point");
  specs.forEach((s, i) => {
    writeFile(g, rid, s, s.role || (i === 0 && !hasEntry ? "entry_point" : "member"));
  });
}

/** `resId ──dtc_derived_from──▶ parentId`. Idempotent; returns the edge id. */
export function declareRepresentation(g: ResourceGraph, resId: string, parentId: string): string {
  const id = `${resId}~>${parentId}`;
  if (!g.edges().some((e) => e.id === id))
    g.addEdge({ id, edge_type: EDGE_DERIVED_FROM, source: resId, target: parentId });
  return id;
}

function materializeImplicit(g: ResourceGraph, resId: string): EmNode | null {
  const res = g.node(resId)!;
  if (fileEdges(g, resId).length) return null;
  const d = dataOf(res);
  const url = str(d.url);
  if (!url) return null;
  const spec: FileSpec = dropNull({ path: leaf(url), url, checksum: d.checksum as string,
    size_bytes: d.size_bytes as number, media_type: d.media_type as string });
  const node = writeFile(g, resId, spec, "entry_point");
  const nd: Record<string, unknown> = { ...dataOf(g.node(resId)!), url: "" };
  delete nd.checksum;
  g.setData(resId, nd);
  return node;
}

function dropNull<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;
}

export interface AddFileResult { file_id: string | null; role: FileRole; path: string; materialized: boolean }

/** Add a file. A resource of one IMPLICIT file first becomes a resource of
 *  files (url and checksum move — once — into its entry point). */
export function addFile(g: ResourceGraph, resId: string, file: FileSpec & { path: string }): AddFileResult {
  const res = mustResource(g, resId);
  const spec = checkFile(dropNull({ ...file }));
  return g.batch(() => {
    const current = resourceFiles(g, resId);
    if (!current.length && !hasIdentity(spec)) {
      const d: Record<string, unknown> = { ...dataOf(res), url: locatorOf(spec) };
      if (spec.checksum) d.checksum = spec.checksum;
      if (spec.size_bytes !== undefined && spec.size_bytes !== null) d.size_bytes = sizeOf(spec.size_bytes);
      if (spec.media_type) d.media_type = spec.media_type;
      g.setData(resId, d);
      return { file_id: null, role: "entry_point" as FileRole, path: spec.path!, materialized: false };
    }
    const materialized = materializeImplicit(g, resId) !== null;
    const hasEntry = resourceFiles(g, resId).some((f) => f.role === "entry_point");
    if (spec.role === "entry_point" && hasEntry) throw new Error(`'${resId}' already has an entry point`);
    const role: FileRole = spec.role || (hasEntry ? "member" : "entry_point");
    const node = writeFile(g, resId, spec, role);
    return { file_id: node.id, role, path: spec.path!, materialized };
  });
}

/** Take a file out: its edge goes, and the node too when nothing else holds
 *  it. Back to one file brings nothing back into the resource. */
export function removeFile(g: ResourceGraph, resId: string, fileId: string):
    { removed_edge: string; removed_node: boolean; entry_point_left: boolean } {
  const edges = fileEdges(g, resId).filter((e) => e.target === fileId);
  if (!edges.length) throw new Error(`'${fileId}' is not a file of '${resId}'`);
  return g.batch(() => {
    for (const e of edges) g.removeEdge(e.id!);
    const held = g.edges().some((e) => e.source === fileId || e.target === fileId);
    if (!held) g.removeNode(fileId);
    const left = resourceFiles(g, resId).some((f) => f.role === "entry_point");
    return { removed_edge: edges[0].id!, removed_node: !held, entry_point_left: left };
  });
}

/** What a revision does NOT copy: the fields of the old BYTES and the hands
 *  and receipts of the old resource. */
const NOT_REVISED = new Set(["url", "checksum", "checksum_of", "size_bytes", "media_type",
  "stamp_receipt", "created_by", "created_at", "modified_by", "modified_at"]);

export interface Pointer { edge_id: string; edge_type: string; source: string }
export interface ReplaceResult {
  old_resource_id: string; new_resource_id: string;
  old_file_id: string; new_file_id: string;
  role: FileRole; path: string;
  pointing_at_old: Pointer[];
  old_derived_from: string[];
}

/** A corrected file makes a NEW VERSION of the resource: a new resource (id
 *  derived, so twice changes nothing) with the same fields and files but the
 *  replaced one, `new ──was_revision_of──▶ old`. The old stays as it was;
 *  nothing that pointed at it moves — `pointing_at_old` says who, the caller
 *  decides (`movePointers`). `oldFileId: null` names the implicit file. */
export function replaceFile(g: ResourceGraph, resId: string, oldFileId: string | null,
    nu: { checksum: string; path?: string; size_bytes?: number; media_type?: string; url?: string;
          declare_parent?: boolean }): ReplaceResult {
  const res = mustResource(g, resId);
  return g.batch(() => {
    const files = resourceFiles(g, resId);
    let old: ResourceFile | undefined;
    if (oldFileId === null) {
      old = files.find((f) => f.implicit);
      if (!old) throw new Error(`'${resId}' has no implicit file to replace`);
      const d = dataOf(res);
      const url = str(d.url);
      oldFileId = writeFileNode(g, resId, dropNull({ path: leaf(url), url, checksum: d.checksum as string,
        size_bytes: d.size_bytes as number, media_type: d.media_type as string }))[0].id;
    } else {
      old = files.find((f) => !f.implicit && f.node.id === oldFileId);
      if (!old) throw new Error(`'${oldFileId}' is not a file of '${resId}'`);
    }
    const newId = revisionIdFor(resId, oldFileId, nu.checksum);
    const newPath = nu.path || old.path;
    const spec: FileSpec = dropNull({ path: newPath, checksum: nu.checksum, size_bytes: nu.size_bytes,
      media_type: nu.media_type, url: nu.url || newPath });
    if (!g.node(newId)) {
      const kept = Object.fromEntries(Object.entries(dataOf(res)).filter(([k]) => !NOT_REVISED.has(k)));
      addResource(g, { name: str(res.name), resourceId: newId, data: kept,
                       description: str(res.description) });
      let newFile: EmNode | null = null;
      for (const f of files) {
        if (f === old) newFile = writeFile(g, newId, spec, old.role);
        else writeFile(g, newId, { id: f.node.id, path: f.path }, f.role);
      }
      if ((nu.declare_parent ?? true) && newFile && newFile.id !== oldFileId) {
        const eid = `${newFile.id}~>${oldFileId}`;
        if (!g.edges().some((e) => e.id === eid))
          g.addEdge({ id: eid, edge_type: EDGE_DERIVED_FROM, source: newFile.id, target: oldFileId });
      }
      g.addEdge({ id: `${newId}~revision~>${resId}`, edge_type: EDGE_REVISION_OF,
                  source: newId, target: resId });
    }
    const newFileId = resourceFiles(g, newId).find((f) => f.path === newPath)!.node.id;
    return {
      old_resource_id: resId, new_resource_id: newId, old_file_id: oldFileId!, new_file_id: newFileId,
      role: old.role, path: newPath,
      pointing_at_old: pointingAt(g, resId),
      old_derived_from: g.edges().filter((e) => e.source === resId && e.edge_type === EDGE_DERIVED_FROM)
        .map((e) => e.target).sort(byStr),
    };
  });
}

/** Every edge INTO a resource but its revisions: who points at it. */
export function pointingAt(g: ResourceGraph, resId: string): Pointer[] {
  return g.edges().filter((e) => e.target === resId && e.edge_type !== EDGE_REVISION_OF)
    .map((e) => ({ edge_id: String(e.id), edge_type: String(e.edge_type), source: e.source }));
}

/** EMStudio's half of a revision: move the chosen pointers from the old
 *  resource to the new one (the edge is re-made with the same type and
 *  attributes on the new target). Returns how many moved. */
export function movePointers(g: ResourceGraph, fromId: string, toId: string, edgeIds: string[]): number {
  const want = new Set(edgeIds);
  return g.batch(() => {
    let moved = 0;
    for (const e of g.edges().filter((x) => want.has(String(x.id)) && x.target === fromId)) {
      const { id: _id, ...rest } = e;
      g.removeEdge(String(e.id));
      const nid = String(e.id).split(fromId).join(toId);
      if (!g.edges().some((x) => x.id === nid))
        g.addEdge({ ...rest, id: nid, target: toId } as EmEdge & { id: string });
      moved++;
    }
    return moved;
  });
}

function uuid4(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// DRAWING · a resource of several files is ONE node, closed by default
// ═════════════════════════════════════════════════════════════════════════════

/** How many files each resource holds through `has_file` (a resource of one
 *  implicit file is not in the map: it has no file nodes to open). */
export function fileCounts(edges: readonly EmEdge[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of edges)
    if (e.edge_type === EDGE_HAS_FILE) out.set(e.source, (out.get(e.source) ?? 0) + 1);
  return out;
}

/** The view of a graph with the files of the CLOSED resources folded away: a
 *  `resource_file` node is shown only when one of the resources that hold it
 *  is open — a file shared by two tiles appears as soon as either is — and its
 *  edges go with it. The document is not touched: only what is drawn. */
export function foldFiles<N extends EmNode, E extends EmEdge>(nodes: N[], edges: E[],
    open: ReadonlySet<string>): { nodes: N[]; edges: E[] } {
  if (!nodes.some((n) => n.node_type === "resource_file")) return { nodes, edges };
  const shown = new Set<string>();
  for (const e of edges)
    if (e.edge_type === EDGE_HAS_FILE && open.has(e.source)) shown.add(e.target);
  const hidden = new Set(nodes.filter((n) => n.node_type === "resource_file" && !shown.has(n.id))
    .map((n) => n.id));
  if (!hidden.size) return { nodes, edges };
  return { nodes: nodes.filter((n) => !hidden.has(n.id)),
           edges: edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)) };
}

/** «OB_PODIO_LOD1 · 3 file», with the disclosure the reader clicks on: ▸ closed,
 *  ▾ open. `files` is the word in the reader's language. */
export function resourceLabel(name: string, count: number, open: boolean, files: string): string {
  return `${open ? "▾" : "▸"} ${name} · ${count} ${files}`;
}

/** DEV29 B3 · what a resource IS, by its packaging (s3Dgraphy ResourceNode
 *  PACKAGINGS): «File set», «Folder», «Archive», «Blender object» — said by the
 *  inspector's chip and the name strip instead of «resource» / «Link». Null for
 *  a plain file or any other node (the type's own label stays). */
export function packagingLabel(n: { node_type?: string; data?: unknown } | null | undefined): string | null {
  if (!n || n.node_type !== "resource") return null;
  const p = String(((n.data ?? {}) as Record<string, unknown>).packaging ?? "");
  if (!p || p === "file") return null;
  return packagingName(p);   // DEV30 A3 · the datamodel's word, in the locale
}
