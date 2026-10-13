/**
 * MICRO-SPAZIO-FIRMATO · the ONE road the 3D loaders take to the bytes of a
 * room's store.
 *
 * The node serves `…/v1/rooms/<room>/asset/<digest>` only to a request that
 * carries the session's bearer (measured: HEAD with `Authorization` 200, without
 * 401). three's loaders ask with a plain `fetch` or an `<img>`, so a proxy the
 * graph declares resident came back «file missing». Here a URL the node owns is
 * asked through `main.ts nodeAuthFetch` — the bearer in the header, NEVER in
 * the URL, the renewal and the one retry on a 401 kept in that one place — and
 * the bytes are handed to the loader (`parse`, a blob URL, a tiles plugin).
 * Offline, and for a web locator that is not the node's, nothing changes: the
 * plain `fetch` it always was.
 *
 * `main.ts` installs the road (`setNodeRoad`) because only it holds the token
 * and knows the room; this module keeps the loaders free of both.
 */

export interface NodeRoad {
  /** the signed fetch (`nodeAuthFetch`) */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** is this URL the node's store (the room's, or another room of the same node)? */
  owns: (url: string) => boolean;
}

let road: NodeRoad | null = null;
export function setNodeRoad(r: NodeRoad | null): void { road = r; }

export function ownedByNode(url: string | null | undefined): boolean {
  return !!url && !!road && road.owns(url);
}

/** A fetch that is signed when the node owns the URL, plain otherwise. */
export function roadFetch(url: string, init?: RequestInit): Promise<Response> {
  return road && road.owns(url) ? road.fetch(url, init) : fetch(url, init);
}

/** Why a file did not come: the node REFUSED it (401/403 — access, not
 *  absence), or it is not there / not readable. */
export type FetchFailure = "refused" | "missing";
export function failureOf(status: number): FetchFailure {
  return status === 401 || status === 403 ? "refused" : "missing";
}

export class RoadError extends Error {
  constructor(readonly why: FetchFailure, readonly status: number, readonly url: string) {
    super(`${url}: HTTP ${status}`);
  }
}

/** The bytes of a node URL, signed; a RoadError says why they did not come. */
export async function nodeBytes(url: string): Promise<ArrayBuffer> {
  let r: Response;
  try { r = await roadFetch(url); } catch { throw new RoadError("missing", 0, url); }
  if (!r.ok) throw new RoadError(failureOf(r.status), r.status, url);
  return await r.arrayBuffer();
}

// a blob URL per node URL, fetched once: what an `<img>`, a texture or a file
// of a set (obj → mtl → textures, gltf → bin) is handed instead of the URL
// it cannot sign. Failures are NOT kept: once access is granted, asking again
// must ask the node again.
const blobs = new Map<string, Promise<string>>();
const ready = new Map<string, string>();
export function nodeBlobUrl(url: string): Promise<string> {
  let p = blobs.get(url);
  if (!p) {
    p = (async () => {
      let r: Response;
      try { r = await roadFetch(url); } catch { throw new RoadError("missing", 0, url); }
      if (!r.ok) throw new RoadError(failureOf(r.status), r.status, url);
      const u = URL.createObjectURL(await r.blob());
      ready.set(url, u);
      return u;
    })();
    blobs.set(url, p);
    p.catch(() => { if (blobs.get(url) === p) blobs.delete(url); });
  }
  return p;
}
/** the blob URL of a node URL already fetched, else null (synchronous: for a
 *  three `LoadingManager.setURLModifier`) */
export function nodeBlobReady(url: string): string | null {
  return ready.get(url) ?? null;
}

/**
 * A 3DTilesRendererJS plugin: every tile file the node owns is fetched signed
 * (a tileset in the store, its children by their own store URLs). Anything
 * else is not its business (null → the renderer's own fetch).
 */
export class NodeRoadTilesPlugin {
  readonly name = "EM_NODE_ROAD";
  fetchData(url: string, options?: RequestInit): Promise<Response> | null {
    return ownedByNode(url) ? roadFetch(url, options) : null;
  }
}
