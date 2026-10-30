/**
 * SPAZIO · what the graph says about 3D, epoch by epoch — pure.
 *
 * «Dove sta, e che forma ha in ogni epoca?» (the question of the Spazio
 * workspace, scrivania v11b). Two layers, read from the edges and nowhere else:
 *
 *   · the REPRESENTATION MODELS of an epoch — `has_representation_model` from
 *     the epoch (or one of its phases) to an RM, or the RM's own
 *     `has_first_epoch` / `survive_in_epoch` (the RM Manager's convention);
 *     the document that records it is the source of `has_representation_model`
 *     that is a DocumentNode; its bytes are a `has_linked_resource` resource;
 *   · the PROXIES of the units alive in that epoch — the unit's property of
 *     type `geometry` (`has_property`) → its SemanticShape
 *     (`has_semantic_shape`) → a `proxy_model` resource (`has_linked_resource`,
 *     connections 1.6.28, E.D. 30 set: the proxy is a property of the US, its glb
 *     a resource). Convex hulls and spheres stay in the shape's data.
 *
 * What CAN BE FETCHED is not decided here by guessing from a string: online it
 * is s3Dgraphy's `geometry_summary` (`store_backed`, through the bridge), handed
 * in as the set of resident resource ids; offline, the resource's own recorded
 * state, by the same rule (`is_resident`: a checksum and residency resident).
 * What the scene then finds when it fetches (a resident file that is not there)
 * is the caller's to add: `missing`.
 *
 * `scripts/check-space.mjs` exercises this file in node.
 */
import type { EmDocument, EmEdge, EmNode } from "./types";
import { classOf } from "./rules";
import { SCENE_USES, assetOf, chooseVersion, versionsOf, type VersionChoice, type VersionGraph } from "./asset-versions";
import { pickRepresentation, plainGraph } from "./resources";
import { alternativeSets, iterSets, type AlternativesRule, type AltResult } from "./alternatives";
import { frameAmong, type FileFrame } from "./file-frame";
import visualRules from "./assets/em_visual_rules.json";
import { basename } from "./paths";
import { epochInstances } from "./epoch-instances";

/** The rule of the alternatives (em_visual_rules 1.6.37 → `alternatives`). */
export const ALT_RULE = (visualRules as unknown as { alternatives: AlternativesRule }).alternatives;

/** The media type of a 3D Tiles archive (s3Dgraphy `MEDIA_TYPE_3TZ`). */
const MEDIA_3TZ = "application/vnd.maxar.archive.3tz+zip";

/** TEMPLU MARE v2 · C1 · what a resource is for the tiles reader, read from
 *  what it DECLARES and not only from its locator — a store URL
 *  (`…/asset/sha256:…`) says nothing: `3tz` (an archive the reader opens from
 *  its end), `directory` (a tree served as it lies: `packaging: directory`, or
 *  a `tileset.json` locator), or `""` (not a tileset; a plain zip is not one). */
export function tilesKindOf(d: Record<string, unknown>): "" | "directory" | "3tz" {
  const url = String(d.url ?? "");
  if (/\.3tz(\?|#|$)/i.test(url) || d.media_type === MEDIA_3TZ) return "3tz";
  if (d.packaging === "directory" || /(^|\/)tileset\.json(\?|#|$)/i.test(url)) return "directory";
  return "";
}

/** What becomes of a resource in the scene. */
export type FileState =
  /** in the store: the bytes can be fetched */
  | "resident"
  /** somebody's NAS or laptop: a locator nothing here can follow */
  | "reference"
  /** named by the graph, and not in the store (no checksum, or not found) */
  | "missing"
  /** MICRO-SPAZIO-FIRMATO · in the store, and the node did not give it (401/
   *  403): access, not absence */
  | "refused";

export interface SpaceResource {
  id: string;
  name: string;
  url: string;
  checksum: string;
  /** the residency as recorded (`resident` | `reference` | ""): where the
   *  bytes are read is decided by it and the checksum (`store-url.ts`) */
  residency: string;
  state: FileState;
  /** MICRO-3DTILES · what the resource declares: `file` | `directory` (a
   *  tileset tree, the `_link` EMtools writes) | `archive`; its weight and, for
   *  a cloud, its points (`size_bytes`, `primitives.points`) */
  packaging: string;
  bytes: number | null;
  points: number | null;
  /** TEMPLU MARE v2 · C1 · a tileset, and in which form (`tilesKindOf`) */
  tiles: "" | "directory" | "3tz";
}

export interface SpaceRM {
  id: string;
  name: string;
  /** the top epochs it depicts */
  epochs: string[];
  /** the document that records it (its «scheda») */
  documentId: string | null;
  /** the placement axis of the document (`document_variant_styles`):
   *  reality_based = a survey, em_based = a source-based reconstruction… */
  genre: string | null;
  resource: SpaceResource | null;
  /** the version the scene loads, by the rule of s3Dgraphy's `version_for`
   *  with the uses of a scene (web, realtime, heriverse, aton) — null when the
   *  model has no versions (its first resource is shown, as before) */
  choice?: VersionChoice | null;
  /** MICRO-3DTILES · the TILESET of the same model, when its first resource is
   *  not one (proposed instead of a glb over the threshold) */
  tileset: SpaceResource | null;
  /** MICRO-SPAZIO-3D · every version of the model (the Outliner lists them,
   *  the one drawn highlighted); empty when it has none */
  versions?: Array<{ id: string; name: string; url: string; master: boolean; lod: string | null;
    /** MICRO-SPAZIO-3D-3 p.10 · the uses it declares, its data (the measures), whether a glTF loader opens it, its file */
    uses?: string[]; data?: Record<string, unknown>; drawable?: boolean; resource?: SpaceResource | null;
    /** MICRO-PROVA-DEV47 p.3 · the step that made it (its data), what that step
     *  took in, its weight (its files', for a set), its triangles, its form */
    step?: Record<string, unknown> | null; input?: string | null; bytes?: number | null; tris?: number | null;
    format?: VersionFormat }>;
  /** MICRO-SPAZIO-3D-3 p.7 · the RM container it is in (EM16-RMNG,
   *  `is_in_representation_model_group`, 1:1), or null */
  group?: string | null;
  /** THE COMMON HAT (E.D. 17 Oct 2026) · not a model: the container's OWN
   *  alternative (a tileset of the whole, hatted by the container — connections
   *  1.6.41). Its id is the container's; drawn instead of the members, or they
   *  instead of it */
  altOf?: string | null;
  /** MICRO tileset, shift e epoche · a tileset's FRAME (s3Dgraphy 1.6.38,
   *  `data.frame`: its coordinates are a CRS minus a shift) and the node that
   *  says it — the resource, its asset, then its hat (`frame_of`'s order) */
  frame?: { frame: FileFrame; from: string } | null;
  /** …and where a new frame is written: the tileset's asset (its versions inherit it) */
  frameHome?: string | null;
}

/** MICRO-SPAZIO-3D-3 p.7 · an RM container as the graph has it (EM Tools writes
 *  it, s3Dgraphy reads it: `RepresentationModelNodeGroup`) — its Document
 *  (`has_representation_model` to the group), its members. */
/** MICRO-PROVA-DEV47 p.3a · what a version is, for the Space: a glTF, an OBJ
 *  (with its mtl and textures, a file set), a tileset, a .blend datablock
 *  (Blender only), or another file */
export type VersionFormat = "gltf" | "obj" | "tiles" | "blend" | "other";

export interface SpaceRMGroup { id: string; name: string; documentId: string | null; members: string[] }

export type ProxyGeometry = "glb" | "convex" | "spheres" | "empty";

export interface SpaceProxy {
  unitId: string;
  propertyId: string;
  shapeId: string;
  geometry: ProxyGeometry;
  /** flat [x,y,z,…] lists, one per hull (ATON's and s3Dgraphy's form) */
  convexshapes: number[][];
  /** [x, y, z, r] */
  spheres: number[][];
  resource: SpaceResource | null;
  /** MICRO-SPAZIO-3D-3 p.6 · the unit's other `geometry` properties («Aggiungi
   *  come parte»: s3Dgraphy writes one property per payload), in the graph's order */
  parts?: SpaceProxy[];
  /** MICRO-SERVSF-FINE-ISTANZE p.3 · an INSTANCE drawn with another's geometry:
   *  the unit of the chain whose proxy it is (`geometry_from`) — its property,
   *  shape and file are that unit's, never this one's to change */
  instanceOf?: string;
  /** …and the node whose `data.transform` places it: its first model (RM /
   *  RMSF) — the one with a transform, else the first; null = none yet (it
   *  stands where the shared proxy stands) */
  xfNode?: string | null;
}

export interface SpaceEpoch {
  id: string;
  name: string;
  start: number | null;
  end: number | null;
}

export interface EpochSummary {
  epoch: SpaceEpoch;
  rms: SpaceRM[];
  /** the units alive in the epoch (stratigraphic nodes) */
  units: string[];
  withProxy: string[];
  /** Y6 · of `withProxy`, the ones whose proxy is in the connected 3D scene only */
  inScene: string[];
  without: string[];
  /** proxies whose file is declared and not there */
  missing: string[];
  /** proxies whose file the node refused (access) */
  refused: string[];
  /** proxies whose file is only referenced */
  reference: string[];
  /** RMs whose file is declared and not there / only referenced */
  rmMissing: string[];
  rmReference: string[];
}

export interface Space {
  epochs: SpaceEpoch[];
  rms: SpaceRM[];
  proxies: Map<string, SpaceProxy>;
  /** MICRO-SPAZIO-3D-3 p.7 · the RM containers, empty ones too */
  rmGroups: Map<string, SpaceRMGroup>;
  /** THE COMMON HAT · the sets of alternatives (s3Dgraphy `alternative_sets`) */
  alternatives: AltResult;
  summary(epochId: string): EpochSummary | null;
  /** the top epoch a node (epoch or phase) belongs to */
  topOf(epochId: string): string | null;
}

/** The edges that put a unit in an epoch (the ones the narrative reads). */
export const EPOCH_LINKS = ["has_first_epoch", "survive_in_epoch", "is_in_epoch"] as const;
const RM_TYPES = new Set(["representation_model", "representation_model_doc", "representation_model_sf"]);
const GEOMETRY_PROPERTY_TYPE = "geometry";
/** EM16-RMNG · the RM container and its membership (s3Dgraphy `Graph.RM_GROUP_EDGE`) */
export const RM_GROUP_TYPE = "RepresentationModelNodeGroup";
export const RM_GROUP_EDGE = "is_in_representation_model_group";

const dataOf = (n: EmNode | undefined): Record<string, unknown> => (n?.data ?? {}) as Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
/** alive: a node's tombstone is `data.removed`, an EDGE's is
 *  `attributes.removed` (crdt `liveEdges`). Measured 13 Oct 2026: reading only
 *  `data` kept every withdrawn citation alive, and the Space drew the first —
 *  the OLDEST — version of each proxy (US 1–4 at their old place). */
const alive = (x: { data?: unknown; attributes?: unknown }): boolean =>
  !dataOf(x as EmNode).removed && !((x.attributes ?? {}) as Record<string, unknown>).removed;

/** MICRO-SCENA-RICHIEDE · the state of the graph the Space's files belong to:
 *  every live resource (id, checksum, locator, residency) and every live edge
 *  that touches one — a `has_linked_resource` that cites or drops it, its
 *  version chain, its representations. A refusal or a «missing» is true of the
 *  state it was born in: measured 13 Oct 2026, a 403 asked before the room cited
 *  the digest stayed for the session, though the node answered 200 two minutes
 *  later. Same state, same key: a refusal is asked again once per state. */
export function citationKey(doc: EmDocument | null): string {
  let h = 0x811c9dc5;
  const mix = (s: string): void => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    h = Math.imul(h ^ 0x1f, 0x01000193);
  };
  const res = new Set<string>();
  for (const n of doc?.graph.nodes ?? []) {
    if (n.node_type !== "resource" || !alive(n)) continue;
    const d = dataOf(n);
    res.add(n.id);
    mix(n.id); mix(str(d.checksum)); mix(str(d.url)); mix(str(d.residency));
  }
  let edges = 0;
  for (const e of doc?.graph.edges ?? []) {
    if (!alive(e as unknown as { data?: unknown }) || (!res.has(e.source) && !res.has(e.target))) continue;
    mix(str(e.edge_type)); mix(e.source); mix(e.target);
    edges++;
  }
  return `${res.size}.${edges}.${(h >>> 0).toString(36)}`;
}

/** …and the two marks the scene keeps, bound to a key (the room, the token and
 *  `citationKey`): when it changes they are emptied and the scene asks again. */
export class SpaceMarks {
  /** resident files the scene fetched and did not find */
  readonly notFound = new Set<string>();
  /** resident files the node refused to the scene (401/403) */
  readonly refused = new Set<string>();
  private key: string | null = null;
  /** the key of the state now; true when marks were dropped */
  at(key: string): boolean {
    if (key === this.key) return false;
    this.key = key;
    if (!this.notFound.size && !this.refused.size) return false;
    this.notFound.clear();
    this.refused.clear();
    return true;
  }
  /** a failure heard from the scene; true when it is new */
  mark(resourceId: string, why: "missing" | "refused"): boolean {
    const into = why === "refused" ? this.refused : this.notFound;
    if (into.has(resourceId)) return false;
    into.add(resourceId);
    return true;
  }
}

/** PARTE 0 · I MODELLI SPARITI (E.D. 17 Oct 2026) · the resident files whose
 *  fetch got NO answer — the bridge or the node not listening yet (the
 *  desktop's sidecar still starting when the Space opens): not a verdict on
 *  the file. They wait and are asked again; one is missing only when it stays
 *  silent after the bridge answered (a refusal without CORS, a dead route) or
 *  after `giveUpMs` of silence. `scripts/check-space-models.mjs`. */
export class UnansweredFiles {
  private readonly waiting = new Map<string, number>();
  private readonly retried = new Map<string, { since: number; up: boolean }>();
  constructor(readonly giveUpMs = 120_000) {}
  get size(): number { return this.waiting.size; }
  /** a fetch got no answer: `wait` (the first: the caller starts asking
   *  again), `waiting` (already), `missing` (the verdict: mark it) */
  heard(resourceId: string, now: number): "wait" | "waiting" | "missing" {
    if (this.waiting.has(resourceId)) return "waiting";
    const was = this.retried.get(resourceId);
    this.retried.delete(resourceId);
    if (was && (was.up || now - was.since > this.giveUpMs)) return "missing";
    const first = !this.waiting.size;
    this.waiting.set(resourceId, was?.since ?? now);
    return first ? "wait" : "waiting";
  }
  /** still silent for less than `giveUpMs`: keep waiting for the bridge */
  patient(now: number): boolean {
    return !this.waiting.size || now - Math.min(...this.waiting.values()) <= this.giveUpMs;
  }
  /** asked again now (`up`: the bridge answered /health first) */
  retry(up: boolean): void {
    for (const [id, since] of this.waiting) this.retried.set(id, { since, up });
    this.waiting.clear();
  }
}

/** Is a URL somewhere else (a web locator), as `effective_residency` reads it? */
const isRemote = (url: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^file:/i.test(url);

/** The offline rule, s3Dgraphy's `is_resident`: no checksum is never resident;
 *  a recorded residency decides; failing that a remote URI is a reference. */
export function recordedState(r: EmNode): FileState {
  const d = dataOf(r);
  const residency = str(d.residency).trim();
  const url = str(d.url).trim();
  if (residency === "reference" || (!residency && isRemote(url))) return "reference";
  if (!str(d.checksum).trim()) return "missing";
  return residency && residency !== "resident" ? "reference" : "resident";
}

export function buildSpace(
  doc: EmDocument | null,
  opts: {
    isUnit: (nodeType: string | undefined) => boolean;
    /** resource ids s3Dgraphy says are resident (the bridge); absent = offline */
    resident?: Set<string> | null;
    /** resources the scene tried and did not find */
    notFound?: Set<string>;
    /** resources the node refused to the scene (401/403) */
    refused?: Set<string>;
    /** Y6 · units whose proxy object the connected host has in its scene */
    sceneProxies?: Set<string> | null;
    /** TEMPLU MARE v2 · C1 · the bytes come from a node's store, one file per
     *  digest: a tileset FOLDER cannot be served from there, its archive can */
    fromStore?: boolean;
  },
): Space {
  const nodes = (doc?.graph.nodes ?? []).filter(alive);
  const edges = (doc?.graph.edges ?? []).filter((e) => alive(e as unknown as { data?: unknown }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, EmEdge[]>();
  const inn = new Map<string, EmEdge[]>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  const outOf = (id: string, type: string) => (out.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.target);
  const inOf = (id: string, type: string) => (inn.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.source);

  // epochs: the top ones (not the target of a has_sub_epoch), newest first
  const isEpoch = (n: EmNode | undefined) => n?.node_type === "EpochNode";
  const parentOf = new Map<string, string>();
  for (const e of edges) if (e.edge_type === "has_sub_epoch" && isEpoch(byId.get(e.source)) && isEpoch(byId.get(e.target)))
    parentOf.set(e.target, e.source);
  const topOf = (id: string): string | null => {
    let cur = id;
    const seen = new Set<string>();
    while (parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parentOf.get(cur)!; }
    return isEpoch(byId.get(cur)) ? cur : null;
  };
  const epochs: SpaceEpoch[] = nodes.filter((n) => isEpoch(n) && !parentOf.has(n.id))
    .map((n) => ({ id: n.id, name: str(n.name) || n.id, start: num(dataOf(n).start_time), end: num(dataOf(n).end_time) }))
    .sort((a, b) => (b.start ?? -Infinity) - (a.start ?? -Infinity));

  const asResource = (r: EmNode): SpaceResource => {
    const d = dataOf(r);
    let state: FileState = opts.resident ? (opts.resident.has(r.id) ? "resident"
      : recordedState(r) === "reference" ? "reference" : "missing") : recordedState(r);
    if (state === "resident" && opts.refused?.has(r.id)) state = "refused";
    else if (state === "resident" && opts.notFound?.has(r.id)) state = "missing";
    const prims = (d.primitives ?? {}) as Record<string, unknown>;
    return { id: r.id, name: str(r.name) || basename(str(d.url)) || r.id, url: str(d.url),
             checksum: str(d.checksum), residency: str(d.residency).trim(), state, packaging: str(d.packaging),
             bytes: num(d.size_bytes), points: num(prims.points), tiles: tilesKindOf(d) };
  };
  const resourcesOf = (id: string): EmNode[] => outOf(id, "has_linked_resource")
    .map((x) => byId.get(x)).filter((r): r is EmNode => r?.node_type === "resource");
  const resourceOf = (id: string): SpaceResource | null => {
    const r = resourcesOf(id)[0];
    return r ? asResource(r) : null;
  };
  /** a tileset: `packaging: directory`, or a `tileset.json` locator */
  const isTileset = (r: SpaceResource) => r.packaging === "directory" || /(^|\/)tileset\.json(\?|#|$)/i.test(r.url);
  const tilesetOf = (id: string): SpaceResource | null => {
    const all = resourcesOf(id).map(asResource);
    return all.length > 1 && !isTileset(all[0]) ? all.slice(1).find(isTileset) ?? null : null;
  };

  // TEMPLU MARE v2 · the version a scene loads. A model whose resources have
  // VERSIONS (an asset and its lod_generation chain) shows the one the rule of
  // `version_for` picks for SCENE_USES among those a glTF loader opens — not its
  // first resource, which for a study made with the tools is the master (a
  // .blend datablock, or a set of OBJ files). No versions: as before.
  const vg: VersionGraph = { node: (id) => byId.get(id), out: outOf, into: inOf };
  // C1 · a TILESET version too (a folder or a .3tz): the scene draws it as tiles
  const opensGltf = (d: Record<string, unknown>): boolean =>
    /\.(glb|gltf)(\?|#|$)/i.test(str(d.url)) || /^model\/gltf/i.test(str(d.media_type)) || tilesKindOf(d) !== "";
  // MICRO-PROVA-DEV47 p.3a · an OBJ: its own url, or the entry of its file set
  // (`has_file`: the .obj, its .mtl, the textures), as RB/LOD0–2 of Templu Mare
  const filesOf = (id: string) => outOf(id, "has_file").map((x) => byId.get(x)).filter((f): f is EmNode => !!f);
  const isObj = (d: Record<string, unknown>) => /\.obj(\?|#|$)/i.test(str(d.url)) || /^model\/obj/i.test(str(d.media_type));
  const formatOf = (n: EmNode | undefined): VersionFormat => {
    const d = dataOf(n);
    if (tilesKindOf(d)) return "tiles";
    if (opensGltf(d)) return "gltf";
    if (isObj(d) || (n && filesOf(n.id).some((f) => isObj(dataOf(f))))) return "obj";
    if (/^blend:\/\//i.test(str(d.url)) || str(d.packaging) === "datablock") return "blend";
    return "other";
  };
  // MICRO-GLOBO-INTERAZIONE p.4 · the EFFECTIVE weight: an OBJ set is its files
  // (the .obj, the .mtl, the textures), a glb its own; both known, the larger
  const weightOf = (n: EmNode | undefined): number | null => {
    const own = num(dataOf(n).size_bytes);
    const fs = n ? filesOf(n.id).map((f) => num(dataOf(f).size_bytes)) : [];
    const files = fs.length && fs.every((x) => x != null) ? fs.reduce((a, b) => a! + b!, 0) : null;
    return own != null && files != null ? Math.max(own, files) : own ?? files;
  };
  const stepOf = (id: string): { step: Record<string, unknown> | null; input: string | null } => {
    for (const proc of inOf(id, "dtc_had_output")) {
      const pd = dataOf(byId.get(proc));
      if (pd.dtc_kind !== "lod_generation") continue;
      return { step: pd, input: outOf(proc, "dtc_had_input").find((x) => byId.get(x)?.node_type === "resource") ?? null };
    }
    return { step: null, input: null };
  };
  const versionRow = (e: { id: string; name?: string; url?: string; master?: boolean; lod_level?: string | null; use?: string[]; data?: Record<string, unknown> }) => {
    const vn = byId.get(e.id);
    const fmt = formatOf(vn);
    const prim = (dataOf(vn).primitives ?? {}) as Record<string, unknown>;
    return { id: e.id, name: str(e.name) || e.id, url: str(e.url ?? dataOf(vn).url),
             master: !!e.master, lod: e.lod_level ?? null, uses: e.use ?? [], data: e.data ?? dataOf(vn),
             drawable: !e.master && (fmt === "gltf" || fmt === "tiles" || fmt === "obj"), resource: vn ? asResource(servable(vn)) : null,
             ...stepOf(e.id), bytes: weightOf(vn), tris: num(prim.triangles), format: fmt };
  };
  // C1 · the version's REPRESENTATION a store can serve: a tileset folder is
  // thousands of files and the store holds one per digest, so from a node the
  // scene reads the folder's archive (`dtc_derived_from`, the `preferred` one
  // first — s3Dgraphy's pick_representation); a plain zip is not a tileset
  const rg = plainGraph({ nodes, edges });
  const servable = (node: EmNode): EmNode => {
    if (!opts.fromStore || tilesKindOf(dataOf(node)) !== "directory") return node;
    const pick = pickRepresentation(rg, node.id, ["archive"]);
    const alt = pick.picked ? byId.get(pick.picked.id) : undefined;
    return alt && tilesKindOf(dataOf(alt)) === "3tz" ? alt : node;
  };
  const entriesOf = (rmId: string) => {
    const linked = resourcesOf(rmId);
    const models = linked.filter((r) => str(dataOf(r).url_type) === "3d_model");
    const assets = [...new Set((models.length ? models : linked).map((r) => assetOf(vg, r.id)))].sort();
    return assets.flatMap((a) => versionsOf(vg, a));
  };
  const chosenOf = (rmId: string): { resource: SpaceResource; choice: VersionChoice } | null => {
    const entries = entriesOf(rmId);
    if (!entries.some((e) => !e.master)) return null;
    const choice = chooseVersion(entries.filter((e) => opensGltf(e.data ?? {})), SCENE_USES);
    const node = choice?.entry ? byId.get(choice.entry.id) : undefined;
    return node && choice ? { resource: asResource(servable(node)), choice } : null;
  };

  // representation models
  const rms: SpaceRM[] = nodes.filter((n) => RM_TYPES.has(n.node_type)).map((rm) => {
    const from = inOf(rm.id, "has_representation_model");
    const eps = new Set<string>();
    for (const s of [...from.filter((x) => isEpoch(byId.get(x))),
                     ...outOf(rm.id, "has_first_epoch"), ...outOf(rm.id, "survive_in_epoch")]) {
      const top = topOf(s);
      if (top) eps.add(top);
    }
    const documentId = from.find((x) => byId.get(x)?.node_type === "document") ?? null;
    const dd = dataOf(documentId ? byId.get(documentId) : undefined);
    const own = dataOf(rm);
    const genre = str(own.geometry ?? own.certainty_class ?? dd.geometry ?? dd.certainty_class).trim() || null;
    const chosen = chosenOf(rm.id);
    const entries = entriesOf(rm.id);
    // a membership to a node that is not a group is not one (a hand-edited file)
    const group = outOf(rm.id, RM_GROUP_EDGE).find((g) => byId.get(g)?.node_type === RM_GROUP_TYPE) ?? null;
    const resource = chosen ? chosen.resource : resourceOf(rm.id);
    const frame = resource?.tiles ? frameAmong([resource.id, assetOf(vg, resource.id), rm.id], (i) => dataOf(byId.get(i))) : null;
    return { id: rm.id, name: str(rm.name) || rm.id, epochs: [...eps], documentId, genre, group,
             resource, choice: chosen?.choice ?? null, ...(frame ? { frame } : {}),
             ...(resource?.tiles ? { frameHome: assetOf(vg, resource.id) } : {}),
             tileset: tilesetOf(rm.id),
             // MICRO-SPAZIO-3D-3 p.10 · its uses, its data (the measures), its file as the scene reads it
             versions: entries.map(versionRow) };
  });

  // proxies: unit → property(geometry) → shape (→ resource)
  const proxies = new Map<string, SpaceProxy>();
  for (const u of nodes) {
    if (!opts.isUnit(u.node_type)) continue;
    for (const pid of outOf(u.id, "has_property")) {
      const p = byId.get(pid);
      if (p?.node_type !== "property" || str(dataOf(p).property_type) !== GEOMETRY_PROPERTY_TYPE) continue;
      const sid = outOf(pid, "has_semantic_shape").find((x) => byId.get(x)?.node_type === "semantic_shape");
      if (!sid) continue;
      const sd = dataOf(byId.get(sid));
      const convexshapes = Array.isArray(sd.convexshapes)
        ? (sd.convexshapes as unknown[]).filter((c): c is number[] => Array.isArray(c) && c.length >= 9) : [];
      const spheres = Array.isArray(sd.spheres)
        ? (sd.spheres as unknown[]).filter((c): c is number[] => Array.isArray(c) && c.length === 4) : [];
      const resource = resourceOf(sid);
      const geometry: ProxyGeometry = resource ? "glb" : convexshapes.length ? "convex" : spheres.length ? "spheres" : "empty";
      const px: SpaceProxy = { unitId: u.id, propertyId: pid, shapeId: sid, geometry, convexshapes, spheres, resource };
      const first = proxies.get(u.id);
      if (!first) proxies.set(u.id, px);
      else (first.parts ??= []).push(px);
    }
  }

  // MICRO-SERVSF-FINE-ISTANZE p.3 · the INSTANCES of an object in the other
  // epochs (the chain of `changed_from`, s3Dgraphy `epoch_instances`): one
  // without a geometry of its own is drawn with the chain's ONE proxy (its
  // `geometry_from`), at its OWN position — the transform of its model —
  // never a copy of the geometry. An instance with no model has no position of
  // its own and is NOT drawn: standing where the other instance stands would
  // say a place nobody gave (the capital reused in a wall today was not in the
  // wall in Roman times); the panel lists it and «⌖» gives it one. Only the
  // nodes a chain touches are read.
  {
    const inChain = new Set<string>();
    for (const e of edges) if (e.edge_type === "changed_from" || e.edge_type === "changed_to") { inChain.add(e.source); inChain.add(e.target); }
    const done = new Set<string>();
    const sub = { graph: { nodes, edges } } as unknown as EmDocument;
    for (const id of inChain) {
      if (done.has(id) || !opts.isUnit(byId.get(id)?.node_type)) continue;
      const chain = epochInstances(sub, id);
      for (const r of chain) done.add(r.id);
      for (const r of chain) {
        if (proxies.has(r.id) || !r.geometry_from || r.geometry_from === r.id || !opts.isUnit(r.node_type ?? undefined)) continue;
        const src = proxies.get(r.geometry_from);
        if (!src || src.instanceOf) continue;
        const xf = r.placements.find((p) => p.transform)?.model ?? r.placements[0]?.model ?? null;
        if (!xf) continue;
        proxies.set(r.id, { ...src, unitId: r.id, instanceOf: src.unitId, xfNode: xf });
      }
    }
  }

  // GRAFO REATTIVO · the units of every top epoch, in ONE pass over the nodes and
  // on first use: asked per epoch it was a pass over every node per question, and
  // the Models sheet asks once per unit (165 s to open 5000 units, measured)
  let unitsByTop: Map<string, string[]> | null = null;
  const unitsIn = (epochId: string): string[] => {
    if (!unitsByTop) {
      unitsByTop = new Map();
      for (const u of nodes) {
        // P2 · a continuity node says how long a unit lives; it is not a unit
        // to model, so it is neither counted nor listed without a proxy
        if (!opts.isUnit(u.node_type) || classOf(u.node_type) === "ContinuityNode") continue;
        const tops = new Set<string>();
        for (const l of EPOCH_LINKS) for (const e of outOf(u.id, l)) { const t = topOf(e); if (t) tops.add(t); }
        for (const t of tops) (unitsByTop.get(t) ?? unitsByTop.set(t, []).get(t)!).push(u.id);
      }
    }
    return unitsByTop.get(epochId) ?? [];
  };

  const rmGroups = new Map<string, SpaceRMGroup>();
  for (const g of nodes) {
    if (g.node_type !== RM_GROUP_TYPE) continue;
    const doc = inOf(g.id, "has_representation_model").find((x) => byId.get(x)?.node_type === "document") ?? null;
    rmGroups.set(g.id, { id: g.id, name: str(g.name) || g.id, documentId: doc, members: rms.filter((r) => r.group === g.id).map((r) => r.id) });
  }

  // THE COMMON HAT (E.D. 17 Oct 2026) · the sets of alternatives; a container
  // with an alternative of its own (a tileset of the whole, hatted by the
  // container) gets it as a model of the Space, under the container's id: its
  // versions, the one a scene loads, the epochs of the members it replaces
  // (with no member: the container's own)
  // MICRO-VERSIONE-CONTENITORE (E.D. 30 Oct 2026) · a container's version EM
  // Tools wrote before it linked it (`data.represents: container`,
  // `data.container`, no hat): read as hatted by its container — a view, the
  // graph is not written (EM Tools mends the file when it opens and saves it)
  const hatted = new Set(edges.filter((e) => e.edge_type === ALT_RULE.hat_edge).map((e) => e.target));
  const implied = nodes.flatMap((n) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    const gid = String(d.container ?? "");
    if (n.node_type !== "resource" || d.represents !== "container" || !gid || hatted.has(n.id)
        || !ALT_RULE.hats.container.includes(String(byId.get(gid)?.node_type ?? ""))) return [];
    return [{ id: `${gid}_${ALT_RULE.hat_edge}_${n.id}`, source: gid, target: n.id, edge_type: ALT_RULE.hat_edge } as EmEdge];
  });
  const alternatives = alternativeSets({ nodes, edges: implied.length ? [...edges, ...implied] : edges }, ALT_RULE);
  for (const set of iterSets(alternatives.sets)) {
    if (set.hat_kind !== "container" || !set.alternatives.length) continue;
    const g = rmGroups.get(set.hat);
    const entries = set.alternatives;
    const choice = chooseVersion(entries.filter((e) => opensGltf(e.data ?? {})), SCENE_USES);
    const node = choice?.entry ? byId.get(choice.entry.id) : byId.get(set.assets[0]);
    const eps = new Set(rms.filter((r) => set.covers.includes(r.id)).flatMap((r) => r.epochs));
    // MICRO tileset, shift e epoche (E.D. 25 Oct 2026) · no member, or members
    // without epochs: the container's own (its Document's), as s3Dgraphy says
    // (`alternative_sets` → `epochs`, em_visual_rules 1.6.40)
    if (!eps.size) for (const ep of set.epochs) eps.add(ep);
    const asset = byId.get(set.assets[0]);
    const frame = frameAmong([node?.id, set.assets[0], set.hat], (i) => dataOf(byId.get(i)));
    rms.push({ id: set.hat, name: str(asset?.name) || set.name, epochs: [...eps], documentId: g?.documentId ?? null, genre: null,
               ...(frame ? { frame } : {}), frameHome: set.assets[0] ?? null,
               group: null, altOf: set.hat, resource: node ? asResource(servable(node)) : null, choice: choice?.entry ? choice : null,
               tileset: null,
               versions: entries.map(versionRow) });
  }

  return {
    epochs, rms, proxies, rmGroups, alternatives, topOf,
    summary(epochId) {
      const epoch = epochs.find((e) => e.id === epochId);
      if (!epoch) return null;
      const mine = rms.filter((r) => r.epochs.includes(epochId));
      const units = unitsIn(epochId);
      const scene = opts.sceneProxies ?? null;
      const has = (u: string): boolean => proxies.has(u) || !!scene?.has(u);
      const withProxy = units.filter(has);
      const st = (u: string) => proxies.get(u)?.resource?.state;
      return {
        epoch, rms: mine, units, withProxy,
        inScene: withProxy.filter((u) => !proxies.has(u)),
        without: units.filter((u) => !has(u)),
        missing: withProxy.filter((u) => st(u) === "missing"),
        refused: withProxy.filter((u) => st(u) === "refused"),
        reference: withProxy.filter((u) => st(u) === "reference"),
        rmMissing: mine.filter((r) => !r.resource || r.resource.state === "missing").map((r) => r.id),
        rmReference: mine.filter((r) => r.resource?.state === "reference").map((r) => r.id),
      };
    },
  };
}
