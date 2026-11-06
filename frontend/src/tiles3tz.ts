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
 * What stays here is EMStudio's:
 *   · the sources as the app sees them: `describe()` (the ETag the tile cache
 *     keys on, the ranges still asked — `load-failure.ts`), errors carrying
 *     `range` and `status`;
 *   · `ZipArchive`, any zip (no index): its directory read here, in slices
 *     that let the page go; its entries read by the package;
 *   · the listing of a canonical archive's names (`names()`);
 *   · RealityScan's gzipped tiles (`gunzipIfGzip`), the plugin with the
 *     persistent tile cache, `archiveBase`, `sourceFor`.
 *
 * No three here: this module is pure, so `check-tiles3tz.mjs` reads the real
 * TempluMare archive in node with the same code.
 */

import { Archive3tz as Package3tz, blobSource as packageBlob, httpSource as packageHttp,
         type ByteSource as PackageSource, type EntryLocation } from "3d-tiles-renderer-3tz";
import { archiveIdentity, type TileCache } from "./tile-cache";

export const INDEX_NAME = "@3dtilesIndex1@";
const SIG_EOCD = 0x06054b50, SIG_EOCD64 = 0x06064b50, SIG_LOC64 = 0x07064b50, SIG_CDH = 0x02014b50;

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
 *  on; 200 → the whole archive kept and sliced, up to 1 GiB). Around it, what
 *  the app wants to know: the ETag, the ranges still asked.
 *  MICRO-DROP-3TZ-GRANDE · an error carries the range asked (and the status):
 *  the Log says which bytes did not come (`load-failure.ts rangeOf`). */
export function httpSource(url: string, fetchFn: typeof fetch = fetch.bind(globalThis)): ByteSource {
  let etag: string | null = null;
  let total: number | null = null;
  const asking = new Set<string>();
  /** the status of a range refused: the package's error says it in words only */
  const refused = new Map<string, number>();
  const p = packageHttp(url, {
    fetch: async (input, init) => {
      const r = await fetchFn(input, init);
      etag ??= r.headers.get("etag");
      const range = new Headers(init?.headers).get("range");
      if (!r.ok && range) refused.set(range, r.status);
      return r;
    },
  });
  const ask = async <T>(range: string, run: () => Promise<T>): Promise<T> => {
    asking.add(range);
    try { return await run(); }
    catch (e) {
      if (e && typeof e === "object") {
        if (!("range" in e)) Object.assign(e, { range });
        const status = refused.get(range);
        if (status && !("status" in e)) Object.assign(e, { status });
      }
      throw e;
    } finally { asking.delete(range); refused.delete(range); }
  };
  const tail = async (length: number) => {
    const t = await ask(`bytes=-${length}`, () => p.tail(length));
    total = t.size;
    return t;
  };
  return {
    // a suffix range answers the size in Content-Range
    size: async () => total ?? (await tail(1)).size,
    tail,
    read: (offset, length) => ask(`bytes=${offset}-${offset + length - 1}`, () => p.read(offset, length)),
    describe: () => {
      const s = p.stats();
      return { kind: "http", ranges: s.ranges, downloaded: s.bytes, url, etag, asking: [...asking] };
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

/** The archive path of an entry (3DSC `normalize`): NFC, `/`, no leading `/`
 *  — the package's own rule (not exported by it: proposal in the report). */
export const normalizePath = (p: string): string => p.normalize("NFC").replace(/\\/g, "/").replace(/^\/+/, "");

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
export const TAIL_BYTES = 256 * 1024;

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
   *  which finds by path and does not list. The package keeps the directory
   *  without exposing it: read here from its field (proposal: `names()`). */
  names(): string[] | null { return this.a._entries ? [...this.a._entries.keys()] : null; }

  /** whether `path` is in the archive — by the directory or the index, no request */
  has(path: string): boolean { return this.a.has(path); }

  /** The bytes of `path`, or null when the archive has no such entry. */
  readEntry(path: string): Promise<Uint8Array | null> { return this.a.read(path); }

  describe(): ReturnType<ByteSource["describe"]> { return this.src.describe(); }
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a); out.set(b, a.length);
  return out;
};
const u64 = (dv: DataView, at: number): number => dv.getUint32(at, true) + dv.getUint32(at + 4, true) * 2 ** 32;
const viewOf = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** A plain zip's central directory, whatever its length (no index to fall
 *  back on): the tail, and the rest of the directory when it is longer. Its
 *  bounds are checked as the package checks a .3tz's: a directory that does
 *  not end before the records describing it is refused before it is asked. */
async function readDirectory(src: PackageSource, tailBytes: number) {
  let reads = 1;
  const { bytes: tail, size } = await src.tail(tailBytes);
  const tailAt = size - tail.length, tv = viewOf(tail);
  let e = -1;
  for (let i = tail.length - 22, stop = Math.max(0, tail.length - 22 - 0xffff); i >= stop; i--) {
    if (tv.getUint32(i, true) === SIG_EOCD) { e = i; break; }
  }
  if (e < 0) throw new Error("not a zip: no end of central directory");
  const read = async (at: number, len: number) => { reads++; return src.read(at, len); };
  let cdSize = tv.getUint32(e + 12, true), cdOffset = tv.getUint32(e + 16, true);
  let recordsAt = tailAt + e, zip64 = false;
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || tv.getUint16(e + 10, true) === 0xffff) {
    const loc = e - 20;
    if (loc < 0 || tv.getUint32(loc, true) !== SIG_LOC64) throw new Error("zip64 without its locator");
    recordsAt = u64(tv, loc + 8);
    if (recordsAt + 56 > tailAt + loc) throw new Error("damaged zip64: its end record is not before its locator");
    const rec = recordsAt >= tailAt ? tail.subarray(recordsAt - tailAt, recordsAt - tailAt + 56) : await read(recordsAt, 56);
    const rv = viewOf(rec);
    if (rv.getUint32(0, true) !== SIG_EOCD64) throw new Error("zip64 end of directory not found");
    cdSize = u64(rv, 40); cdOffset = u64(rv, 48); zip64 = true;
  }
  const cdEnd = cdOffset + cdSize;
  if (!Number.isSafeInteger(cdEnd) || cdEnd > recordsAt)
    throw new Error("damaged zip: the central directory does not end before the end records");
  const cd = cdOffset >= tailAt ? tail.subarray(cdOffset - tailAt, cdEnd - tailAt)
    : concat(await read(cdOffset, Math.min(cdSize, tailAt - cdOffset)), tail.subarray(0, Math.max(0, cdEnd - tailAt)));
  return { cd, zip64, reads };
}

/** MICRO-DROP-3TZ-GRANDE · records parsed between two yields to the page: a
 *  directory of 236 607 records (TempluMare_2013, 16.8 MB) held the page's
 *  thread ~0.3 s in one piece */
export const RECORDS_PER_SLICE = 16384;
const yieldToPage = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Every record of a central directory: path → where its bytes are, as the
 *  package's reader wants it. A long directory is read in slices, the page
 *  let go between them. */
async function parseDirectory(cd: Uint8Array): Promise<Map<string, EntryLocation>> {
  const cv = viewOf(cd);
  const dir = new Map<string, EntryLocation>();
  const dec = new TextDecoder();
  let n = 0;
  for (let p = 0; p + 46 <= cd.length && cv.getUint32(p, true) === SIG_CDH;) {
    if (++n % RECORDS_PER_SLICE === 0) await yieldToPage();
    const nlen = cv.getUint16(p + 28, true), xlen = cv.getUint16(p + 30, true), clen = cv.getUint16(p + 32, true);
    let csize = cv.getUint32(p + 20, true), usize = cv.getUint32(p + 24, true), lho = cv.getUint32(p + 42, true);
    const name = normalizePath(dec.decode(cd.subarray(p + 46, p + 46 + nlen)));
    if (usize === 0xffffffff || csize === 0xffffffff || lho === 0xffffffff) {
      let q = p + 46 + nlen; const end = q + xlen;
      while (q + 4 <= end) {
        const tag = cv.getUint16(q, true), ln = cv.getUint16(q + 2, true);
        if (tag === 1) {
          let r = q + 4;
          if (usize === 0xffffffff) { usize = u64(cv, r); r += 8; }
          if (csize === 0xffffffff) { csize = u64(cv, r); r += 8; }
          if (lho === 0xffffffff) lho = u64(cv, r);
          break;
        }
        q += 4 + ln;
      }
    }
    if (!name.endsWith("/")) dir.set(name, { offset: lho, compressedSize: csize, nameLength: nlen, method: cv.getUint16(p + 10, true) });
    p += 46 + nlen + xlen + clen;
  }
  return dir;
}

/**
 * MICRO-TILESET-CARTELLA · ANY zip, read by ranges: the whole central directory
 * once (the Basilica Iulia's 1 GB zip: 1638 records, ~140 KB), then each entry
 * at its offset. A tileset zipped by hand, or by RealityScan's export folder
 * zipped in the Finder, has no `@3dtilesIndex1@` — the package refuses it,
 * this reads it: the directory here, each entry by the package (its limits:
 * 256 MB an entry, inflated or not). Stored and deflated entries; zip64.
 */
export class ZipArchive {
  private constructor(private src: ByteSource, private dir: Map<string, EntryLocation>, private a: Package3tz) {}

  static async open(src: ByteSource, opts: OpenOptions = {}): Promise<ZipArchive> {
    const p = toPackage(src);
    const { cd, zip64, reads } = await readDirectory(p, opts.tailBytes ?? TAIL_BYTES);
    const dir = await parseDirectory(cd);
    dir.delete(INDEX_NAME);
    return new ZipArchive(src, dir, new Package3tz(p, { entries: dir, index: null, openRequests: reads, zip64 }));
  }

  /** every file's path (folders implied, the 3tz index left out) */
  names(): string[] { return [...this.dir.keys()]; }

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
