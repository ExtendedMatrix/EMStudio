/**
 * NIGHT-RISORSA-FILE · parte 3 · a `.3tz` (the 3D Tiles archive, a zip by
 * specification) read WITHOUT extracting it — and a 3DTilesRendererJS plugin
 * that serves a tileset's files from it.
 *
 * MICRO-3TZ-DAL-PACCHETTO (7 Nov 2026) · ONE reading of the archives: the
 * package `3d-tiles-renderer-3tz` (E.D., MIT — extracted from this module on
 * 6 Nov, pinned in `package.json`) opens the archive from its end, finds a
 * file by the central directory or by the index `@3dtilesIndex1@`, reads one
 * entry, with the limits of a damaged or hostile archive (a directory past
 * its end records, an entry or an inflation over 256 MB, a 206 that does not
 * answer the range asked, a server without `Range` sending over 1 GiB). Its
 * `archiveOnly` is OFF: EMStudio does not use the package's plugin, and a
 * tileset of ours may point to files outside its archive.
 *
 * MICRO-3TZ-0-3-0 (12 Nov 2026) · the package at 0.3.0 does what this module
 * kept a copy of: a zip without index (`requireIndex: false`), its directory
 * read in slices (`yieldEvery`), `names()`, `normalizePath`, `INDEX_NAME`, the
 * ETag and the ranges in progress (`stats()`), errors carrying `range` and
 * `status`, its own `.d.ts`.
 *
 * What stays here is EMStudio's:
 *   · the sources as the app sees them: `size()` and `describe()` (the ETag
 *     the tile cache keys on, the ranges still asked — `load-failure.ts`);
 *   · `ZipArchive`, any zip: the package's archive opened without index;
 *   · RealityScan's gzipped tiles (`gunzipIfGzip`), the plugin with the
 *     persistent tile cache, `archiveBase`, `sourceFor`.
 *
 * No three here: this module is pure, so `check-tiles3tz.mjs` reads the real
 * TempluMare archive in node with the same code.
 */

import { Archive3tz as Package3tz, blobSource as packageBlob, httpSource as packageHttp, normalizePath,
         DEFAULT_TAIL_BYTES, type ByteSource as PackageSource } from "3d-tiles-renderer-3tz";
import { archiveIdentity, type TileCache } from "./tile-cache";

export { INDEX_NAME, normalizePath } from "3d-tiles-renderer-3tz";

/** Somewhere the bytes of an archive can be read from, by range. */
export interface ByteSource {
  size(): Promise<number>;
  read(offset: number, length: number): Promise<Uint8Array>;
  /** MICRO-OTTIMIZZA-3 · the last `length` bytes AND the size, in one read
   *  (HTTP: a suffix `Range`, whose `Content-Range` says the size) */
  tail?(length: number): Promise<{ bytes: Uint8Array; size: number }>;
  /** what it is, and — for HTTP — whether the server honoured `Range`; the
   *  URL and the validator of the archive (`ETag`), the persistent tile
   *  cache's key (`tile-cache.ts`) */
  describe(): { kind: "blob" | "http"; ranges: boolean | null; downloaded: number; url?: string; etag?: string | null;
                /** MICRO-DROP-3TZ-GRANDE · the ranges asked and not yet answered */
                asking?: string[] };
}

export function blobSource(blob: Blob): ByteSource {
  const p = packageBlob(blob);
  return {
    size: async () => blob.size,
    read: (offset, length) => p.read(offset, length),
    tail: (length) => p.tail(length),
    describe: () => ({ kind: "blob", ranges: true, downloaded: p.stats().bytes }),
  };
}

/** HTTP with `Range`, read by the package's source (206 → ranges from then
 *  on; 200 → the whole archive kept and sliced, up to 1 GiB). Its errors carry
 *  the range asked and the status (`load-failure.ts rangeOf`); its stats the
 *  ETag and the ranges still asked. */
export function httpSource(url: string, fetchFn?: typeof fetch): ByteSource {
  const p = packageHttp(url, { fetch: fetchFn });
  let total: number | null = null;
  const tail = async (length: number) => {
    const t = await p.tail(length);
    total = t.size;
    return t;
  };
  return {
    // a suffix range answers the size in Content-Range
    size: async () => total ?? (await tail(1)).size,
    tail,
    read: (offset, length) => p.read(offset, length),
    describe: () => {
      const s = p.stats();
      return { kind: "http", ranges: s.ranges, downloaded: s.bytes, url, etag: s.etag ?? null, asking: s.pending ?? [] };
    },
  };
}

/** One of ours as the package's source (a source without `tail` — a test's
 *  file on disk — gives it from its size). */
function toPackage(src: ByteSource): PackageSource {
  return {
    tail: src.tail ? (length) => src.tail!(length) : async (length) => {
      const size = await src.size(), at = Math.max(0, size - length);
      return { bytes: await src.read(at, size - at), size };
    },
    read: (offset, length) => src.read(offset, length),
    stats: () => {
      const d = src.describe();
      return { kind: d.kind, ranges: d.ranges, requests: 0, bytes: d.downloaded };
    },
  };
}

export interface ArchiveStats {
  entries: number;
  /** the reads made to open it (the tail; the rest of a long directory; the index) */
  openReads: number;
  zip64: boolean;
  /** MICRO-OTTIMIZZA-3 · where the entries were found: the central directory
   *  (offset, name length and size of each: one request a tile), or — for a
   *  directory over `cdMaxBytes` (16 MB) — the index (the offset only) */
  directory: "central" | "index";
}

/** MICRO-OTTIMIZZA-3 · what ONE request from the end of a plain zip brings
 *  (the package asks the same for a .3tz): the EOCD with any comment, zip64's
 *  records, and in most tilesets the whole central directory. */
export const TAIL_BYTES = DEFAULT_TAIL_BYTES;

export interface OpenOptions { tailBytes?: number; cdMaxBytes?: number }

/** A `.3tz`, opened by the package: its entries, served on request. */
export class Archive3tz {
  private constructor(private src: ByteSource, private a: Package3tz, readonly stats: ArchiveStats) {}

  /** Open from the end: ONE read of the tail (EOCD, zip64, the central
   *  directory), a second when the directory is longer than the tail; the
   *  index `@3dtilesIndex1@` only for a directory over `cdMaxBytes`. */
  static async open(src: ByteSource, opts: OpenOptions = {}): Promise<Archive3tz> {
    const a = await Package3tz.open(toPackage(src), { tailBytes: opts.tailBytes, maxDirectoryBytes: opts.cdMaxBytes });
    return new Archive3tz(src, a, { entries: a.info.files, openReads: a.info.openRequests, zip64: a.info.zip64,
                                    directory: a.info.lookup === "index" ? "index" : "central" });
  }

  /** MICRO-DROP-3TZ-GRANDE · every file's path when the archive was opened by
   *  its central directory (it is in hand); null when opened by the index,
   *  which finds by path and does not list. */
  names(): string[] | null { return this.a.names(); }

  /** whether `path` is in the archive — by the directory or the index, no request */
  has(path: string): boolean { return this.a.has(path); }

  /** The bytes of `path`, or null when the archive has no such entry. */
  readEntry(path: string): Promise<Uint8Array | null> { return this.a.read(path); }

  describe(): ReturnType<ByteSource["describe"]> { return this.src.describe(); }
}

/**
 * MICRO-TILESET-CARTELLA · ANY zip, read by ranges: the whole central directory
 * once (the Basilica Iulia's 1 GB zip: 1638 records, ~140 KB), then each entry
 * at its offset. A tileset zipped by hand, or by RealityScan's export folder
 * zipped in the Finder, has no `@3dtilesIndex1@`: the package opens it with
 * `requireIndex: false` — the directory read whatever its length, in slices
 * that let the page go (a directory of 236 607 records, TempluMare_2013,
 * 16.8 MB, held the page ~0.3 s in one piece), the bounds and limits of a
 * .3tz (256 MB an entry, inflated or not). Stored and deflated entries; zip64.
 */
export class ZipArchive {
  private constructor(private src: ByteSource, private a: Package3tz) {}

  static async open(src: ByteSource, opts: OpenOptions = {}): Promise<ZipArchive> {
    const a = await Package3tz.open(toPackage(src), { requireIndex: false, maxDirectoryBytes: Infinity, tailBytes: opts.tailBytes ?? TAIL_BYTES });
    return new ZipArchive(src, a);
  }

  /** every file's path (folders implied, the 3tz index left out) */
  names(): string[] { return this.a.names() ?? []; }

  readEntry(path: string): Promise<Uint8Array | null> { return this.a.read(path); }

  describe(): ReturnType<ByteSource["describe"]> { return this.src.describe(); }
}

/** MICRO-TILESET-CARTELLA · RealityScan (and RealityCapture) write every tile
 *  GZIPPED — `1f 8b` where `b3dm` should be (measured on the Basilica Iulia's
 *  `Geometry/lod5_0.b3dm`) — for a server that sends them with
 *  `Content-Encoding: gzip`. Read from an archive or a dropped file there is
 *  no server: the bytes are inflated here, as a browser would. */
export async function gunzipIfGzip(bytes: Uint8Array | null): Promise<Uint8Array | null> {
  if (!bytes || bytes.length < 3 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 0x08) return bytes;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The origin-local base a `.3tz`'s files are asked under: nobody serves it —
 *  the plugin answers before the network (3DTilesRendererJS `fetchData`). */
let seq = 0;
export function archiveBase(): string {
  const origin = typeof location !== "undefined" && /^https?:/.test(location.origin) ? location.origin : "https://emstudio.invalid";
  return `${origin}/__3tz__/${++seq}/`;
}

/**
 * The 3DTilesRendererJS plugin: every file of the tileset under `base` is read
 * from the archive. Registered FIRST, so its `fetchData` answers before the
 * renderer's own `fetch`; a URL outside `base` is not its business (null).
 * MICRO-OTTIMIZZA-3 · with a `cache` (`tile-cache.ts`), a tile read once is
 * kept on disk under the archive's identity: asked again — the tile came back
 * into view after the memory let it go, or another session — no request.
 * (Not the package's `Tiles3tzPlugin`: this one takes an archive already
 * opening — a drop, the store's signed road — and has the cache.)
 */
export class Tiles3tzPlugin {
  readonly name = "EM_3TZ";
  /** what the archive served, for the probes and the status line */
  readonly served: string[] = [];
  /** the archive once open (null while it opens, or if it failed) */
  opened: Archive3tz | null = null;
  /** the tiles the persistent cache answered */
  cacheHits = 0;
  constructor(readonly archive: Promise<Archive3tz>, readonly base: string, readonly cache: TileCache | null = null) {
    archive.then((a) => { this.opened = a; }, () => { /* the first fetch says why */ });
  }
  fetchData(url: string): Promise<Response> | null {
    if (!url.startsWith(this.base)) return null;
    const rel = decodeURIComponent(url.slice(this.base.length).split(/[?#]/)[0]);
    return this.archive.then(async (a) => {
      const id = this.cache?.enabled ? archiveIdentity(a.describe()) : null;
      const key = id ? `a ${id} ${normalizePath(rel)}` : null;
      let bytes = key ? await this.cache!.get(key) : null;
      if (bytes) this.cacheHits++;
      else {
        bytes = await gunzipIfGzip(await a.readEntry(rel));
        if (bytes && key) void this.cache!.put(key, bytes);
      }
      if (!bytes) return new Response(null, { status: 404, statusText: `${rel} is not in the archive` });
      this.served.push(rel);
      return new Response(bytes as BodyInit, { status: 200 });
    });
  }
}

/** A source for a locator: a `blob:` (a file on this machine) is sliced, the
 *  rest is asked by `Range` — with the caller's fetch: the room's store asks
 *  through the signed road (`node-road.ts`; this module rides in the lazy
 *  tiles bundle, so the road is handed in, not imported). */
export async function sourceFor(url: string, fetchFn?: typeof fetch): Promise<ByteSource> {
  if (url.startsWith("blob:")) return blobSource(await (await fetch(url)).blob());
  return httpSource(url, fetchFn);
}
