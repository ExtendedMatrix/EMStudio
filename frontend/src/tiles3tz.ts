/**
 * NIGHT-RISORSA-FILE · parte 3 · a `.3tz` (the 3D Tiles archive, a zip by
 * specification) read WITHOUT extracting it — and a 3DTilesRendererJS plugin
 * that serves a tileset's files from it.
 *
 * The reading is the one of 3D Survey Collection's `cesium_exporter/
 * archive_3tz.py` (`read_index` / `read_entry`, «random access to one entry
 * through the index, as a viewer would do with an HTTP Range request or
 * File.slice»), in the order the archive allows:
 *
 *   1. from the END: the End Of Central Directory (zip64 when it says so), and
 *      the LAST record of the central directory, which by the specification is
 *      the index `@3dtilesIndex1@` — one small read, not the whole directory;
 *   2. the index: 24-byte records, MD5 of the NFC path (16 bytes) + the offset
 *      of its local header (uint64 LE), sorted by the MD5 read as two uint64 LE;
 *   3. a tile: MD5 of its path → binary search → local header → its bytes.
 *
 * The bytes come from a `ByteSource`: `Blob.slice` for a file on this machine
 * (a drop, a pick, the desktop), HTTP `Range` for one behind a URL (the bridge
 * since RISORSA-FILE, a store). A server that ignores `Range` answers 200 with
 * the whole archive — measured on StratiGraph Server's `get_asset` — and the
 * source then keeps that one download and slices it: the archive arrives once,
 * and the status says so.
 *
 * No three here: this module is pure, so `check-tiles3tz.mjs` reads the real
 * TempluMare archive in node with the same code.
 */

import { archiveIdentity, type TileCache } from "./tile-cache";

export const INDEX_NAME = "@3dtilesIndex1@";
const SIG_EOCD = 0x06054b50, SIG_EOCD64 = 0x06064b50, SIG_LOC64 = 0x07064b50;
const SIG_CDH = 0x02014b50, SIG_LFH = 0x04034b50;

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
  describe(): { kind: "blob" | "http"; ranges: boolean | null; downloaded: number; url?: string; etag?: string | null };
}

export function blobSource(blob: Blob): ByteSource {
  let downloaded = 0;
  return {
    size: async () => blob.size,
    read: async (offset, length) => {
      const b = new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
      downloaded += b.byteLength;
      return b;
    },
    describe: () => ({ kind: "blob", ranges: true, downloaded }),
  };
}

/** HTTP with `Range`. The first answer decides: 206 → ranges from then on;
 *  200 → the server sent everything, which is kept and sliced. */
export function httpSource(url: string, fetchFn: typeof fetch = fetch.bind(globalThis)): ByteSource {
  let whole: Uint8Array | null = null;
  let ranges: boolean | null = null;
  let total: number | null = null;
  let etag: string | null = null;
  let downloaded = 0;
  /** the answer to a `Range`: its bytes (206), or the whole archive kept (200) */
  const ask = async (range: string): Promise<Uint8Array | null> => {
    const r = await fetchFn(url, { headers: { Range: range } });
    etag ??= r.headers.get("etag");
    if (r.status === 206) {
      ranges = true;
      const m = /\/(\d+)\s*$/.exec(r.headers.get("content-range") ?? "");
      if (m) total = Number(m[1]);
      const b = new Uint8Array(await r.arrayBuffer());
      downloaded += b.byteLength;
      return b;
    }
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    ranges = false;
    whole = new Uint8Array(await r.arrayBuffer());
    downloaded += whole.byteLength;
    total = whole.byteLength;
    return null;
  };
  // `ask` may have set it: read through a function, not a narrowed variable
  const kept = (): Uint8Array | null => whole;
  const grab = async (offset: number, length: number): Promise<Uint8Array> => {
    const w = kept();
    if (w) return w.subarray(offset, offset + length);
    return (await ask(`bytes=${offset}-${offset + length - 1}`)) ?? kept()!.subarray(offset, offset + length);
  };
  return {
    async size() {
      if (total !== null) return total;
      // a suffix range answers the size in Content-Range (and 22 bytes we need)
      await ask("bytes=-1");
      if (total === null) throw new Error(`${url}: no size in the answer to a Range`);
      return total;
    },
    async tail(length) {
      if (!kept()) {
        const b = await ask(`bytes=-${length}`);
        if (b && total !== null) return { bytes: b, size: total };
        if (b) throw new Error(`${url}: no size in the answer to a Range`);
      }
      const w = kept()!;
      return { bytes: w.subarray(Math.max(0, w.byteLength - length)), size: w.byteLength };
    },
    read: grab,
    describe: () => ({ kind: "http", ranges, downloaded, url, etag }),
  };
}

// ── MD5 (RFC 1321), for the index keys ──────────────────────────────────────

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
export function md5(bytes: Uint8Array): Uint8Array {
  const n = bytes.length;
  const padded = new Uint8Array(((n + 8) >>> 6 << 6) + 64);
  padded.set(bytes);
  padded[n] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, (n * 8) >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(n / 0x20000000), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < padded.length; off += 64) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const tmp = d; d = c; c = b;
      const x = (a + f + K[i] + dv.getUint32(off + g * 4, true)) >>> 0;
      const s = S[(i >> 4) * 4 + (i % 4)];
      b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true));
  return out;
}

/** The archive path of an entry (3DSC `normalize`): NFC, `/`, no leading `/`. */
export const normalizePath = (p: string): string => p.normalize("NFC").replace(/\\/g, "/").replace(/^\/+/, "");

const u64 = (dv: DataView, at: number): number => dv.getUint32(at, true) + dv.getUint32(at + 4, true) * 2 ** 32;
/** The order of the index: the MD5 read as two uint64 little-endian (3DSC `_sort_key`). */
function compareKey(a: Uint8Array, ao: number, b: Uint8Array): number {
  for (const half of [0, 8]) {
    for (let i = 7; i >= 0; i--) {
      const x = a[ao + half + i], y = b[half + i];
      if (x !== y) return x - y;
    }
  }
  return 0;
}

export interface ArchiveStats {
  entries: number;
  indexBytes: number;
  /** the reads made to open it (the tail; the rest of a long directory; the index) */
  openReads: number;
  zip64: boolean;
  /** MICRO-OTTIMIZZA-3 · where the entries were found: the central directory
   *  (offset, name length and size of each: one request a tile), or — for a
   *  directory over `cdMaxBytes` — the index (the offset only) */
  directory: "central" | "index";
}

/** MICRO-OTTIMIZZA-3 (E.D.'s MICRO, measured in `_datasets/cc-runs/bench-3tz`:
 *  at 20 ms of latency the .3tz read 3× slower than its folder, 3000 tiles in
 *  37 s against 13 s, the first tile at 290 ms against 55 ms — three Range in a
 *  row a tile, five to open). What ONE request from the end brings: the EOCD
 *  with any comment (64 KB at most), zip64's locator and record, and in most
 *  tilesets the whole central directory (3000 tiles: ~190 KB; TempluMare's
 *  7302: ~480 KB, the rest in a second request). */
export const TAIL_BYTES = 256 * 1024;
/** a central directory over this is not read: the index is, 24 B an entry
 *  (~250 000 entries: the archives the index was made for) */
export const CD_MAX_BYTES = 16 * 1024 * 1024;
/** what a tile's request asks past its name for the LOCAL extra field (none
 *  in a canonical 3tz, 20 B with zip64; Info-ZIP's timestamps ~28): a longer
 *  one costs a second request */
export const EXTRA_MARGIN = 64;
/** through the index the size is not known before the local header: its
 *  first request brings this much of the data with it, a longer tile the
 *  rest in a second */
export const SPECULATIVE_BYTES = 64 * 1024;

export interface OpenOptions { tailBytes?: number; cdMaxBytes?: number }

/** an entry of the central directory: what reading it in one request needs */
interface DirEntry { lho: number; csize: number; nlen: number; xlen: number; method: number }

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a); out.set(b, a.length);
  return out;
};

/** The end of a zip, from one read of its tail: the EOCD (zip64's when it says
 *  so), and the central directory — sliced from the tail when it is inside it,
 *  its first part asked when it is longer (up to `cdMax`), else not read (null:
 *  the caller goes to the index). */
async function openEnd(src: ByteSource, tailBytes: number, cdMax: number) {
  let reads = 0;
  const read = async (o: number, l: number) => { reads++; return src.read(o, l); };
  let tail: Uint8Array, size: number;
  if (src.tail) { reads++; ({ bytes: tail, size } = await src.tail(tailBytes)); }
  else { size = await src.size(); const l = Math.min(size, tailBytes); tail = await read(size - l, l); }
  let tailAt = size - tail.length;
  let tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const findEocd = () => {
    for (let i = tail.length - 22, stop = Math.max(0, tail.length - 22 - 0xffff); i >= stop; i--) {
      if (tv.getUint32(i, true) === SIG_EOCD) return i;
    }
    return -1;
  };
  let e = findEocd();
  if (e < 0 && tail.length < Math.min(size, 22 + 0xffff)) {
    // a tail shorter than the longest comment (a caller's choice): the 64 KB look
    const l = Math.min(size, 22 + 0xffff);
    tail = await read(size - l, l); tailAt = size - l;
    tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    e = findEocd();
  }
  if (e < 0) throw new Error("not a zip: no end of central directory");
  /** bytes [at, at+len) — from the tail when they are in it */
  const bytesAt = async (at: number, len: number): Promise<Uint8Array> =>
    at >= tailAt && at + len <= size ? tail.subarray(at - tailAt, at - tailAt + len) : read(at, len);
  let cdSize = tv.getUint32(e + 12, true), cdOffset = tv.getUint32(e + 16, true);
  let records = tv.getUint16(e + 10, true);
  let zip64 = false;
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || records === 0xffff) {
    const loc = e - 20;
    if (loc < 0 || tv.getUint32(loc, true) !== SIG_LOC64) throw new Error("zip64 without its locator");
    const rec = await bytesAt(u64(tv, loc + 8), 56);
    const rv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    if (rv.getUint32(0, true) !== SIG_EOCD64) throw new Error("zip64 end of directory not found");
    records = u64(rv, 32); cdSize = u64(rv, 40); cdOffset = u64(rv, 48);
    zip64 = true;
  }
  const cdEnd = cdOffset + cdSize;
  let cd: Uint8Array | null = null;
  if (cdOffset >= tailAt) cd = tail.subarray(cdOffset - tailAt, cdEnd - tailAt);
  else if (cdSize <= cdMax) cd = concat(await read(cdOffset, tailAt - cdOffset), tail.subarray(0, Math.max(0, cdEnd - tailAt)));
  /** the directory's last `len` bytes (the index's record is the last one) */
  const cdTail = (len: number) => bytesAt(cdEnd - len, len);
  return { size, zip64, records, cdSize, cd, cdTail, bytesAt, reads: () => reads };
}

/** Every record of a central directory: path → where its bytes are. The last
 *  record's path too (a 3tz's must be the index). */
function parseDirectory(cd: Uint8Array): { dir: Map<string, DirEntry>; last: string; lastEntry: DirEntry | null } {
  const cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const dir = new Map<string, DirEntry>();
  const dec = new TextDecoder();
  let last = "", lastEntry: DirEntry | null = null;
  for (let p = 0; p + 46 <= cd.length && cv.getUint32(p, true) === SIG_CDH;) {
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
    const at: DirEntry = { lho, csize, nlen, xlen, method: cv.getUint16(p + 10, true) };
    if (!name.endsWith("/")) dir.set(name, at);
    last = name; lastEntry = at;
    p += 46 + nlen + xlen + clen;
  }
  return { dir, last, lastEntry };
}

/** The bytes of the entry whose local header is at `lho`, in ONE request when
 *  its size is known (the central directory's): [lho, lho+30+name+margin+csize),
 *  the data cut after the local header is read. A local extra past the margin
 *  — or, through the index, data past the speculative read — costs a second.
 *  The name in the local header must be the one asked (an MD5 collision, or a
 *  directory that lies, is refused, as 3DSC's reader refuses it). */
async function readLocal(src: ByteSource, path: string, lho: number, known: DirEntry | null): Promise<Uint8Array> {
  const want = normalizePath(path);
  const nlen0 = known?.nlen ?? new TextEncoder().encode(want).length;
  let buf = await src.read(lho, 30 + nlen0 + EXTRA_MARGIN + (known ? known.csize : SPECULATIVE_BYTES));
  /** at least `n` bytes from `lho`: one more request for what is missing */
  const ensure = async (n: number) => {
    if (buf.length < n) buf = concat(buf, await src.read(lho + buf.length, n - buf.length));
  };
  await ensure(30);
  const hv = () => new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (hv().getUint32(0, true) !== SIG_LFH) throw new Error(`${path}: no local header at ${lho}`);
  const flags = hv().getUint16(6, true), method = hv().getUint16(8, true);
  const nlen = hv().getUint16(26, true), xlen = hv().getUint16(28, true);
  const start = 30 + nlen + xlen;
  let csize: number;
  if (known) csize = known.csize;
  else {
    await ensure(start);
    csize = hv().getUint32(18, true);
    if (csize === 0xffffffff) {
      for (let p = 30 + nlen; p + 4 <= start;) {
        const tag = hv().getUint16(p, true), ln = hv().getUint16(p + 2, true);
        if (tag === 1) { csize = u64(hv(), p + 12); break; }
        p += 4 + ln;
      }
    }
    if (flags & 0x8 && !csize) throw new Error(`${path}: sizes only in a data descriptor (not a canonical 3tz)`);
  }
  await ensure(start + csize);
  // normalised as the directory's keys are (a zip from the Finder writes NFD)
  const name = normalizePath(new TextDecoder().decode(buf.subarray(30, 30 + nlen)));
  if (name !== want) throw new Error(`the index points to ${name}, not ${path}`);
  const data = buf.subarray(start, start + csize);
  if (method === 0) return data;
  if (method === 8) return inflateRaw(data);
  throw new Error(`${path}: compression method ${method} is not read here`);
}

/** A `.3tz`, opened: its entries, served on request. */
export class Archive3tz {
  private constructor(private src: ByteSource, private dir: Map<string, DirEntry> | null,
                      private index: Uint8Array | null, readonly stats: ArchiveStats) {}

  /** Open from the end: ONE read of the tail (EOCD, zip64, the central
   *  directory), a second when the directory is longer than the tail; the
   *  index `@3dtilesIndex1@` only for a directory over `cdMaxBytes`. */
  static async open(src: ByteSource, opts: OpenOptions = {}): Promise<Archive3tz> {
    const end = await openEnd(src, opts.tailBytes ?? TAIL_BYTES, opts.cdMaxBytes ?? CD_MAX_BYTES);
    if (end.cd) {
      const { dir, last, lastEntry } = parseDirectory(end.cd);
      // the LAST directory record is the index (specification)
      if (last !== INDEX_NAME || !lastEntry) throw new Error(`not a 3tz: the last entry is not ${INDEX_NAME}`);
      if (lastEntry.method !== 0) throw new Error(`${INDEX_NAME} must be stored, not compressed (method ${lastEntry.method})`);
      dir.delete(INDEX_NAME);
      return new Archive3tz(src, dir, null, { entries: dir.size, indexBytes: lastEntry.csize, openReads: end.reads(),
                                              zip64: end.zip64, directory: "central" });
    }
    // a directory too long to read: its last record (the index), then the index
    const want = new TextEncoder().encode(INDEX_NAME);
    const findIndexRecord = (buf: Uint8Array): number => {
      const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      for (let i = buf.length - 46; i >= 0; i--) {
        if (v.getUint32(i, true) !== SIG_CDH) continue;
        const nlen = v.getUint16(i + 28, true);
        if (nlen === want.length && buf.subarray(i + 46, i + 46 + nlen).every((x, k) => x === want[k])) return i;
      }
      return -1;
    };
    // the record of the index is short (no extra field in a canonical 3tz)
    let cdTail = await end.cdTail(Math.min(end.cdSize, 1024));
    let rec = findIndexRecord(cdTail);
    if (rec < 0 && cdTail.length < end.cdSize) {
      cdTail = await end.cdTail(Math.min(end.cdSize, 46 + want.length + 0xffff));
      rec = findIndexRecord(cdTail);
    }
    if (rec < 0) throw new Error(`not a 3tz: the last entry is not ${INDEX_NAME}`);
    const { dir } = parseDirectory(cdTail.subarray(rec));
    const at = dir.get(INDEX_NAME)!;
    if (at.method !== 0) throw new Error(`${INDEX_NAME} must be stored, not compressed (method ${at.method})`);
    const index = await readLocal(src, INDEX_NAME, at.lho, at);
    if (index.length % 24) throw new Error("index length is not a multiple of 24");
    return new Archive3tz(src, null, index, { entries: index.length / 24, indexBytes: at.csize, openReads: end.reads() + 1,
                                              zip64: end.zip64, directory: "index" });
  }

  /** The local header offset of `path`, or null (the directory; else a
   *  binary search on the MD5 in the index). */
  offsetOf(path: string): number | null {
    if (this.dir) return this.dir.get(normalizePath(path))?.lho ?? null;
    const index = this.index!;
    const key = md5(new TextEncoder().encode(normalizePath(path)));
    const dv = new DataView(index.buffer, index.byteOffset, index.byteLength);
    let lo = 0, hi = this.stats.entries - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = compareKey(index, mid * 24, key);
      if (c === 0) return u64(dv, mid * 24 + 16);
      if (c < 0) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  }

  /** The bytes of `path`, or null when the archive has no such entry. */
  async readEntry(path: string): Promise<Uint8Array | null> {
    if (this.dir) {
      const at = this.dir.get(normalizePath(path));
      return at ? readLocal(this.src, path, at.lho, at) : null;
    }
    const off = this.offsetOf(path);
    return off === null ? null : readLocal(this.src, path, off, null);
  }

  describe(): ReturnType<ByteSource["describe"]> { return this.src.describe(); }
}

/**
 * MICRO-TILESET-CARTELLA · ANY zip, read by ranges: the whole central directory
 * once (the Basilica Iulia's 1 GB zip: 1638 records, ~140 KB), then each entry
 * at its offset. A tileset zipped by hand, or by RealityScan's export folder
 * zipped in the Finder, has no `@3dtilesIndex1@` — `Archive3tz` refuses it,
 * this reads it. Stored and deflated entries; zip64 sizes and offsets.
 * MICRO-OTTIMIZZA-3 · opened and read as a .3tz is: one read of the tail (and
 * the rest of a long directory), one request an entry.
 */
export class ZipArchive {
  private constructor(private src: ByteSource, private dir: Map<string, DirEntry>, readonly zip64: boolean) {}

  static async open(src: ByteSource, opts: OpenOptions = {}): Promise<ZipArchive> {
    // no index to fall back on: the directory is read whatever its length
    const end = await openEnd(src, opts.tailBytes ?? TAIL_BYTES, Infinity);
    const { dir } = parseDirectory(end.cd!);
    dir.delete(INDEX_NAME);
    return new ZipArchive(src, dir, end.zip64);
  }

  /** every file's path (folders implied, the 3tz index left out) */
  names(): string[] { return [...this.dir.keys()]; }

  async readEntry(path: string): Promise<Uint8Array | null> {
    const at = this.dir.get(normalizePath(path));
    return at ? readLocal(this.src, path, at.lho, at) : null;
  }

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

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
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
