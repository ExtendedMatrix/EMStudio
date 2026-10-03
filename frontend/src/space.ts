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

/** What becomes of a resource in the scene. */
export type FileState =
  /** in the store: the bytes can be fetched */
  | "resident"
  /** somebody's NAS or laptop: a locator nothing here can follow */
  | "reference"
  /** named by the graph, and not in the store (no checksum, or not found) */
  | "missing";

export interface SpaceResource {
  id: string;
  name: string;
  url: string;
  checksum: string;
  state: FileState;
  /** MICRO-3DTILES · what the resource declares: `file` | `directory` (a
   *  tileset tree, the `_link` EMtools writes) | `archive`; its weight and, for
   *  a cloud, its points (`size_bytes`, `primitives.points`) */
  packaging: string;
  bytes: number | null;
  points: number | null;
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
  /** MICRO-3DTILES · the TILESET of the same model, when its first resource is
   *  not one (proposed instead of a glb over the threshold) */
  tileset: SpaceResource | null;
}

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
  summary(epochId: string): EpochSummary | null;
  /** the top epoch a node (epoch or phase) belongs to */
  topOf(epochId: string): string | null;
}

/** The edges that put a unit in an epoch (the ones the narrative reads). */
export const EPOCH_LINKS = ["has_first_epoch", "survive_in_epoch", "is_in_epoch"] as const;
const RM_TYPES = new Set(["representation_model", "representation_model_doc", "representation_model_sf"]);
const GEOMETRY_PROPERTY_TYPE = "geometry";

const dataOf = (n: EmNode | undefined): Record<string, unknown> => (n?.data ?? {}) as Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const alive = (x: { data?: unknown }): boolean => !dataOf(x as EmNode).removed;

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
    /** Y6 · units whose proxy object the connected host has in its scene */
    sceneProxies?: Set<string> | null;
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
    if (state === "resident" && opts.notFound?.has(r.id)) state = "missing";
    const prims = (d.primitives ?? {}) as Record<string, unknown>;
    return { id: r.id, name: str(r.name) || str(d.url).split("/").pop() || r.id, url: str(d.url),
             checksum: str(d.checksum), state, packaging: str(d.packaging),
             bytes: num(d.size_bytes), points: num(prims.points) };
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
    return { id: rm.id, name: str(rm.name) || rm.id, epochs: [...eps], documentId, genre, resource: resourceOf(rm.id),
             tileset: tilesetOf(rm.id) };
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
      proxies.set(u.id, { unitId: u.id, propertyId: pid, shapeId: sid, geometry, convexshapes, spheres, resource });
      break;
    }
  }

  const unitsIn = (epochId: string): string[] => {
    const out2: string[] = [];
    for (const u of nodes) {
      // P2 · a continuity node says how long a unit lives; it is not a unit
      // to model, so it is neither counted nor listed without a proxy
      if (!opts.isUnit(u.node_type) || classOf(u.node_type) === "ContinuityNode") continue;
      const eps = EPOCH_LINKS.flatMap((l) => outOf(u.id, l));
      if (eps.some((e) => topOf(e) === epochId)) out2.push(u.id);
    }
    return out2;
  };

  return {
    epochs, rms, proxies, topOf,
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
        reference: withProxy.filter((u) => st(u) === "reference"),
        rmMissing: mine.filter((r) => !r.resource || r.resource.state === "missing").map((r) => r.id),
        rmReference: mine.filter((r) => r.resource?.state === "reference").map((r) => r.id),
      };
    },
  };
}
