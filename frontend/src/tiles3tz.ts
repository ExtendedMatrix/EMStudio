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

export const INDEX_NAME = "@3dtilesIndex1@";
const SIG_EOCD = 0x06054b50, SIG_EOCD64 = 0x06064b50, SIG_LOC64 = 0x07064b50;
const SIG_CDH = 0x02014b50, SIG_LFH = 0x04034b50;

/** Somewhere the bytes of an archive can be read from, by range. */
export interface ByteSource {
  size(): Promise<number>;
  read(offset: number, length: number): Promise<Uint8Array>;
  /** what it is, and — for HTTP — whether the server honoured `Range` */
  describe(): { kind: "blob" | "http"; ranges: boolean | null; downloaded: number };
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
  let downloaded = 0;
  const grab = async (offset: number, length: number): Promise<Uint8Array> => {
    if (whole) return whole.subarray(offset, offset + length);
    const r = await fetchFn(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
    if (r.status === 206) {
      ranges = true;
      const cr = r.headers.get("content-range") ?? "";
      const m = /\/(\d+)\s*$/.exec(cr);
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
    return whole.subarray(offset, offset + length);
  };
  return {
    async size() {
      if (total !== null) return total;
      // a suffix range answers the size in Content-Range (and 22 bytes we need)
      const r = await fetchFn(url, { headers: { Range: "bytes=-1" } });
      if (r.status === 206) {
        ranges = true;
        const m = /\/(\d+)\s*$/.exec(r.headers.get("content-range") ?? "");
        await r.arrayBuffer();
        if (m) return (total = Number(m[1]));
      }
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      ranges = false;
      whole = new Uint8Array(await r.arrayBuffer());
      downloaded += whole.byteLength;
      return (total = whole.byteLength);
    },
    read: grab,
    describe: () => ({ kind: "http", ranges, downloaded }),
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
  /** the reads made to open it (EOCD, the directory's tail, the index) */
  openReads: number;
  zip64: boolean;
}

/** A `.3tz`, opened: its index, and the entries it serves on request. */
export class Archive3tz {
  private constructor(private src: ByteSource, private index: Uint8Array, readonly stats: ArchiveStats) {}

  /** Open from the end: EOCD, the last directory record (the index), the index. */
  static async open(src: ByteSource): Promise<Archive3tz> {
    let reads = 0;
    const read = async (o: number, l: number) => { reads++; return src.read(o, l); };
    const size = await src.size();
    // a canonical 3tz has no comment: the EOCD (and zip64's locator before it)
    // are in the last kilobyte; only a zip with a comment needs the 64 KB look
    let tailLen = Math.min(size, 1024);
    let tail = await read(size - tailLen, tailLen);
    let tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    const findEocd = () => {
      for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === SIG_EOCD) return i;
      return -1;
    };
    let e = findEocd();
    if (e < 0 && tailLen < size) {
      tailLen = Math.min(size, 22 + 0xffff);
      tail = await read(size - tailLen, tailLen);
      tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
      e = findEocd();
    }
    if (e < 0) throw new Error("not a zip: no end of central directory");
    let cdSize = tv.getUint32(e + 12, true), cdOffset = tv.getUint32(e + 16, true);
    let entries = tv.getUint16(e + 10, true);
    let zip64 = false;
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff || entries === 0xffff) {
      const loc = e - 20;
      if (loc < 0 || tv.getUint32(loc, true) !== SIG_LOC64) throw new Error("zip64 without its locator");
      const off64 = u64(tv, loc + 8);
      const rec = await read(off64, 56);
      const rv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
      if (rv.getUint32(0, true) !== SIG_EOCD64) throw new Error("zip64 end of directory not found");
      entries = u64(rv, 32); cdSize = u64(rv, 40); cdOffset = u64(rv, 48);
      zip64 = true;
    }
    // the LAST directory record is the index (specification): read the tail of
    // the directory and walk back to its signature with the index's name
    const want = new TextEncoder().encode(INDEX_NAME);
    const cdTailOf = async (len: number): Promise<Uint8Array> => {
      const at = cdOffset + cdSize - len;
      return at >= size - tailLen
        ? tail.subarray(at - (size - tailLen), cdOffset + cdSize - (size - tailLen))
        : read(at, len);
    };
    const findIndexRecord = (buf: Uint8Array): number => {
      const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      for (let i = buf.length - 46; i >= 0; i--) {
        if (v.getUint32(i, true) !== SIG_CDH) continue;
        const nlen = v.getUint16(i + 28, true);
        if (nlen === want.length && buf.subarray(i + 46, i + 46 + nlen).every((x, k) => x === want[k])) return i;
      }
      return -1;
    };
    // the record of the index is short (no extra field in a canonical 3tz): the
    // directory's last 1 KB first, the long look only if it is not there
    let cdTail = await cdTailOf(Math.min(cdSize, 1024));
    let rec = findIndexRecord(cdTail);
    if (rec < 0 && cdTail.length < cdSize) {
      cdTail = await cdTailOf(Math.min(cdSize, 46 + want.length + 0xffff));
      rec = findIndexRecord(cdTail);
    }
    const cv = new DataView(cdTail.buffer, cdTail.byteOffset, cdTail.byteLength);
    if (rec < 0) throw new Error(`not a 3tz: the last entry is not ${INDEX_NAME}`);
    const method = cv.getUint16(rec + 10, true);
    if (method !== 0) throw new Error(`${INDEX_NAME} must be stored, not compressed (method ${method})`);
    let isize = cv.getUint32(rec + 20, true);
    let lho = cv.getUint32(rec + 42, true);
    if (isize === 0xffffffff || lho === 0xffffffff) {
      const nlen = cv.getUint16(rec + 28, true), xlen = cv.getUint16(rec + 30, true);
      let p = rec + 46 + nlen; const end = p + xlen;
      while (p + 4 <= end) {
        const tag = cv.getUint16(p, true), ln = cv.getUint16(p + 2, true);
        if (tag === 1) {
          let q = p + 4;
          if (cv.getUint32(rec + 24, true) === 0xffffffff) q += 8;          // uncompressed
          if (isize === 0xffffffff) { isize = u64(cv, q); q += 8; }
          if (lho === 0xffffffff) lho = u64(cv, q);
          break;
        }
        p += 4 + ln;
      }
    }
    const lfh = await read(lho, 30);
    const lv = new DataView(lfh.buffer, lfh.byteOffset, lfh.byteLength);
    if (lv.getUint32(0, true) !== SIG_LFH) throw new Error("the index's local header is not there");
    const index = await read(lho + 30 + lv.getUint16(26, true) + lv.getUint16(28, true), isize);
    if (index.length % 24) throw new Error("index length is not a multiple of 24");
    return new Archive3tz(src, index, { entries: index.length / 24, indexBytes: isize, openReads: reads, zip64 });
  }

  /** The local header offset of `path`, or null (binary search on the MD5). */
  offsetOf(path: string): number | null {
    const key = md5(new TextEncoder().encode(normalizePath(path)));
    const dv = new DataView(this.index.buffer, this.index.byteOffset, this.index.byteLength);
    let lo = 0, hi = this.stats.entries - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = compareKey(this.index, mid * 24, key);
      if (c === 0) return u64(dv, mid * 24 + 16);
      if (c < 0) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  }

  /** The bytes of `path`, or null when the archive has no such entry. The
   *  name in the local header must be the one asked (an MD5 collision is
   *  refused, as 3DSC's reader refuses it). */
  async readEntry(path: string): Promise<Uint8Array | null> {
    const off = this.offsetOf(path);
    if (off === null) return null;
    const head = await this.src.read(off, 30);
    const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    if (hv.getUint32(0, true) !== SIG_LFH) throw new Error(`${path}: no local header at ${off}`);
    const flags = hv.getUint16(6, true), method = hv.getUint16(8, true);
    let csize = hv.getUint32(18, true);
    const nlen = hv.getUint16(26, true), xlen = hv.getUint16(28, true);
    const nx = await this.src.read(off + 30, nlen + xlen);
    const name = new TextDecoder().decode(nx.subarray(0, nlen));
    if (name !== normalizePath(path)) throw new Error(`the index points to ${name}, not ${path}`);
    if (csize === 0xffffffff) {
      const xv = new DataView(nx.buffer, nx.byteOffset + nlen, xlen);
      for (let p = 0; p + 4 <= xlen;) {
        const tag = xv.getUint16(p, true), ln = xv.getUint16(p + 2, true);
        if (tag === 1) { csize = u64(xv, p + 12); break; }
        p += 4 + ln;
      }
    }
    if (flags & 0x8 && !csize) throw new Error(`${path}: sizes only in a data descriptor (not a canonical 3tz)`);
    const data = await this.src.read(off + 30 + nlen + xlen, csize);
    if (method === 0) return data;
    if (method === 8) return inflateRaw(data);
    throw new Error(`${path}: compression method ${method} is not read here`);
  }

  describe(): ReturnType<ByteSource["describe"]> { return this.src.describe(); }
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
 */
export class Tiles3tzPlugin {
  readonly name = "EM_3TZ";
  /** what the archive served, for the probes and the status line */
  readonly served: string[] = [];
  /** the archive once open (null while it opens, or if it failed) */
  opened: Archive3tz | null = null;
  constructor(readonly archive: Promise<Archive3tz>, readonly base: string) {
    archive.then((a) => { this.opened = a; }, () => { /* the first fetch says why */ });
  }
  fetchData(url: string): Promise<Response> | null {
    if (!url.startsWith(this.base)) return null;
    const rel = decodeURIComponent(url.slice(this.base.length).split(/[?#]/)[0]);
    return this.archive.then((a) => a.readEntry(rel)).then((bytes) => {
      if (!bytes) return new Response(null, { status: 404, statusText: `${rel} is not in the archive` });
      this.served.push(rel);
      return new Response(bytes as BodyInit, { status: 200 });
    });
  }
}

/** A source for a locator: a `blob:` (a file on this machine) is sliced, the
 *  rest is asked by `Range`. */
export async function sourceFor(url: string): Promise<ByteSource> {
  if (url.startsWith("blob:")) return blobSource(await (await fetch(url)).blob());
  return httpSource(url);
}
