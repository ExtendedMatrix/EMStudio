// MICRO-OTTIMIZZA-3 · the .3tz reader (`src/tiles3tz.ts`) over HTTP, against a
// server made here with a simulated latency, COUNTING the requests:
//
//   node scripts/check-tiles3tz-http.mjs
//   BENCH_TILES=3000x58000 LAT_MS=0,20 node scripts/check-tiles3tz-http.mjs (a measure, also;
//   BENCH_3TZ=/path/x.3tz for a real archive)
//   TILES3TZ_SRC=/tmp/old-tiles3tz.ts MEASURE_ONLY=1 …                      (the reader of before)
//
//   · the opening: ONE request from the end (EOCD, zip64, the central
//     directory) when the directory is in the tail; two when it is longer
//     than the tail; the index `@3dtilesIndex1@` only past `cdMaxBytes`;
//   · a tile: ONE Range [lho, lho+30+name+margin+csize); a local extra field
//     longer than the margin, a second; through the index, one or two;
//   · archives written here: stored, zip64, a local extra of 200 bytes, a
//     directory longer than the tail, a non-ASCII name;
//   · a server without Range: the archive downloaded once, as before;
//   · the persistent tile cache (`src/tile-cache.ts`): a second pass after the
//     tiles left the memory asks nothing.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { crc32 } from "node:zlib";

const SRC = new URL("../src/", import.meta.url).pathname;
const entry = process.env.TILES3TZ_SRC ?? `${SRC}tiles3tz.ts`;
const MEASURE_ONLY = !!process.env.MEASURE_ONLY;
const load = async (contents) => {
  const b = await esbuild.build({ stdin: { contents, resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm",
                                  write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const Z = await load(`export * from ${JSON.stringify(entry)};`);
const C = MEASURE_ONLY ? null : await load(`export * from "./tile-cache";`);

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); else console.log(`  ✓ ${what}`); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); console.log(`  ✓ ${what}`); }
  catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

// ── a zip writer, for the cases (stored; zip64 on request; local extras) ────
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const md5 = (s) => createHash("md5").update(s, "utf8").digest();
/** `files`: [{ name, data, localExtra? }]; `index`: append `@3dtilesIndex1@` */
function writeZip(files, { zip64 = false, index = true } = {}) {
  const parts = [], cd = [];
  let at = 0;
  const put = (b) => { parts.push(b); at += b.length; };
  const add = (name, data, localExtra = Buffer.alloc(0)) => {
    const nb = Buffer.from(name, "utf8"), lho = at, crc = crc32(data);
    const flags = /^[\x00-\x7f]*$/.test(name) ? 0 : 0x800;
    const lx = zip64 ? Buffer.concat([u16(1), u16(16), u64(data.length), u64(data.length), localExtra]) : localExtra;
    const sz = zip64 ? 0xffffffff : data.length;
    put(Buffer.concat([u32(0x04034b50), u16(zip64 ? 45 : 20), u16(flags), u16(0), u16(0), u16(0x21), u32(crc),
                       u32(sz), u32(sz), u16(nb.length), u16(lx.length), nb, lx]));
    put(data);
    const cx = zip64 ? Buffer.concat([u16(1), u16(24), u64(data.length), u64(data.length), u64(lho)]) : Buffer.alloc(0);
    cd.push(Buffer.concat([u32(0x02014b50), u16(zip64 ? 45 : 20), u16(zip64 ? 45 : 20), u16(flags), u16(0), u16(0), u16(0x21),
                           u32(crc), u32(sz), u32(sz), u16(nb.length), u16(cx.length), u16(0), u16(0), u16(0), u32(0),
                           u32(zip64 ? 0xffffffff : lho), nb, cx]));
    return lho;
  };
  const keys = [];
  for (const f of files) keys.push([md5(f.name), add(f.name, f.data, f.localExtra)]);
  if (index) {
    // sorted by the MD5 read as two uint64 little-endian (3DSC `_sort_key`)
    keys.sort((a, b) => {
      const ka = [a[0].readBigUInt64LE(0), a[0].readBigUInt64LE(8)], kb = [b[0].readBigUInt64LE(0), b[0].readBigUInt64LE(8)];
      return ka[0] !== kb[0] ? (ka[0] < kb[0] ? -1 : 1) : ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0;
    });
    add("@3dtilesIndex1@", Buffer.concat(keys.map(([h, o]) => Buffer.concat([h, u64(o)]))));
  }
  const cdOff = at, cdBuf = Buffer.concat(cd);
  put(cdBuf);
  if (zip64) {
    const e64 = at;
    put(Buffer.concat([u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0), u64(cd.length), u64(cd.length),
                       u64(cdBuf.length), u64(cdOff)]));
    put(Buffer.concat([u32(0x07064b50), u32(0), u64(e64), u32(1)]));
    put(Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(0xffff), u16(0xffff), u32(0xffffffff), u32(0xffffffff), u16(0)]));
  } else {
    put(Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(cd.length), u16(cd.length), u32(cdBuf.length), u32(cdOff), u16(0)]));
  }
  return Buffer.concat(parts);
}

// ── the server: Range or not, a latency, every request counted ─────────────
const served = new Map();     // path → Buffer | { file, size }
const log = { reqs: 0, bytes: 0, heads: 0, n304: 0 };
const server = { lat: 0, ranges: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const http = createServer(async (req, res) => {
  log.reqs++;
  if (server.lat) await sleep(server.lat);
  const it = served.get(decodeURIComponent(req.url.split("?")[0]));
  if (!it) { res.writeHead(404, { "Content-Length": 0 }); res.end(); return; }
  const size = Buffer.isBuffer(it) ? it.length : it.size;
  const etag = `"${size.toString(16)}-x"`;
  if (req.headers["if-none-match"] === etag) { log.n304++; res.writeHead(304, { ETag: etag }); res.end(); return; }
  let a = 0, b = size - 1, code = 200;
  const m = server.ranges && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (m) {
    code = 206;
    if (m[1] === "") a = Math.max(0, size - Number(m[2]));
    else { a = Number(m[1]); b = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  }
  const slice = Buffer.isBuffer(it) ? it.subarray(a, b + 1) : (() => {
    const out = Buffer.alloc(b - a + 1); const fd = openSync(it.file, "r"); readSync(fd, out, 0, out.length, a); closeSync(fd); return out;
  })();
  const h = { "Content-Length": slice.length, ETag: etag };
  if (code === 206) h["Content-Range"] = `bytes ${a}-${b}/${size}`;
  if (req.method === "HEAD") { log.heads++; res.writeHead(code, h); res.end(); return; }
  log.bytes += slice.length;
  res.writeHead(code, h);
  res.end(slice);
});
await new Promise((r) => http.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${http.address().port}`;
const reset = () => { log.reqs = 0; log.bytes = 0; log.heads = 0; log.n304 = 0; };

// ── a tileset: tileset.json + n tiles of ~k bytes ───────────────────────────
function tileset(n, k, extra = null) {
  const names = Array.from({ length: n }, (_, i) => `tiles/t${i}.b3dm`);
  const tj = { asset: { version: "1.0" }, geometricError: 10,
               root: { boundingVolume: { sphere: [0, 0, 0, 1] }, geometricError: 5, content: { uri: names[0] },
                       children: names.slice(1).map((u) => ({ boundingVolume: { sphere: [0, 0, 0, 1] }, geometricError: 0, content: { uri: u } })) } };
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const files = [{ name: "tileset.json", data: Buffer.from(JSON.stringify(tj)) },
                 ...names.map((name, i) => ({ name, data: Buffer.from(Array.from({ length: Math.round(k * (0.5 + rnd())) }, (_, j) => (i * 31 + j) & 255)),
                                              localExtra: extra && i % 2 ? extra : undefined }))];
  return { names, files };
}
const order = (tj) => {
  const out = [], q = [tj.root];
  while (q.length) { const t = q.shift(); if (t.content?.uri) out.push(t.content.uri); q.push(...(t.children ?? [])); }
  return out;
};

/** open + read every tile (conc at a time): what the measure reports */
async function run(url, { conc = 6, open = (src) => Z.Archive3tz.open(src), keep = null } = {}) {
  reset();
  const t0 = performance.now();
  const src = Z.httpSource(url);
  const a = await open(src);
  const tOpen = performance.now() - t0, openReqs = log.reqs;
  const tj = JSON.parse(new TextDecoder().decode(await a.readEntry("tileset.json")));
  const names = order(tj);
  const first = await a.readEntry(names[0]);
  const tFirst = performance.now() - t0;
  let i = 1, bytes = first.length;
  const bad = [];
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < names.length) {
      const n = names[i++];
      const got = await a.readEntry(n);
      bytes += got.length;
      if (keep && Buffer.compare(Buffer.from(got), keep.get(n)) !== 0) bad.push(n);
    }
  }));
  return { a, src, tiles: names.length, openReqs, reqs: log.reqs, wire: log.bytes, bytes, bad,
           open_ms: +tOpen.toFixed(1), first_ms: +tFirst.toFixed(1), all_s: +((performance.now() - t0) / 1000).toFixed(2) };
}

const say = (what, r) => console.log(`  · ${what}: ${r.tiles} tiles, open ${r.openReqs} req ${r.open_ms} ms, first tile ${r.first_ms} ms, ` +
  `total ${r.all_s} s, ${r.reqs} requests, ${(r.wire / 1e6).toFixed(2)} MB on the wire`);

try {
  // ── the measure: a big archive (BENCH_3TZ) at LAT_MS ──────────────────────
  // BENCH_TILES=3000x58000: the bench's synthetic tileset (cc-runs/bench-3tz
  // `sintetico.py`), written here with a canonical index — the bench's own
  // ts.3tz sorts its index by the raw MD5 bytes, not as two uint64 LE, and a
  // reader that searches it (this one) does not find its entries
  const synth = /^(\d+)x(\d+)$/.exec(process.env.BENCH_TILES ?? "");
  if (synth) served.set("/bench.3tz", writeZip(tileset(Number(synth[1]), Number(synth[2])).files));
  else if (process.env.BENCH_3TZ && existsSync(process.env.BENCH_3TZ)) {
    const f = process.env.BENCH_3TZ;
    served.set("/bench.3tz", { file: f, size: statSync(f).size });
  }
  if (served.has("/bench.3tz")) {
    const f = synth ? `synthetic ${synth[0]}` : process.env.BENCH_3TZ;
    for (const lat of (process.env.LAT_MS ?? "0,20").split(",").map(Number)) {
      server.lat = lat;
      const r = await run(`${BASE}/bench.3tz`);
      say(`BENCH ${f.split("/").pop()} at ${lat} ms (conc 6)`, r);
      console.log("BENCH " + JSON.stringify({ lat_ms: lat, reader: entry.split("/").pop(), ...r, a: undefined, src: undefined, bad: r.bad.length }));
    }
    server.lat = 0;
  }
  if (MEASURE_ONLY) {
    // the same small measure as below, for the reader of before
    const { files } = tileset(300, 20_000);
    served.set("/m.3tz", writeZip(files));
    server.lat = 20;
    say("300 tiles at 20 ms", await run(`${BASE}/m.3tz`));
    process.exit(0);
  }

  // ── a canonical (stored) archive ──────────────────────────────────────────
  const T1 = tileset(300, 20_000);
  const keep1 = new Map(T1.files.map((f) => [f.name, f.data]));
  served.set("/a.3tz", writeZip(T1.files));
  server.lat = 20;
  const r1 = await run(`${BASE}/a.3tz`, { keep: keep1 });
  say("stored, 300 tiles, 20 ms", r1);
  eq(r1.openReqs, 1, "stored: the archive opens with ONE request (the tail: EOCD + the whole central directory)");
  eq(r1.a.stats.directory, "central", "…and reads the central directory, not the index");
  eq(r1.reqs, 1 + 1 + r1.tiles, "…then one request a tile (tileset.json + 300 tiles + the opening)");
  eq(r1.bad, [], "…every tile's bytes are the file's");
  ok(r1.wire < r1.bytes * 1.02 + 300_000, `…the bytes on the wire are the tiles' and the tail (${r1.wire} for ${r1.bytes})`);
  ok(r1.first_ms < 4 * 20 + 40, `…the first tile after 3 round trips (open, tileset.json, tile): ${r1.first_ms} ms`);
  eq(await r1.a.readEntry("tiles/none.b3dm"), null, "…an entry that is not there is null, and asks nothing");

  // ── zip64 ──────────────────────────────────────────────────────────────────
  const T2 = tileset(40, 5_000);
  served.set("/z64.3tz", writeZip(T2.files, { zip64: true }));
  const r2 = await run(`${BASE}/z64.3tz`, { keep: new Map(T2.files.map((f) => [f.name, f.data])) });
  eq([r2.a.stats.zip64, r2.openReqs, r2.reqs - r2.openReqs], [true, 1, r2.tiles + 1],
     "zip64: EOCD64 and its locator from the same tail, one request to open, one a tile (the local zip64 extra inside the margin)");
  eq(r2.bad, [], "…the bytes are the files'");

  // ── a local extra longer than the margin: a second request ───────────────
  const T3 = tileset(20, 3_000, Buffer.concat([u16(0xcafe), u16(196), Buffer.alloc(196, 1)]));
  served.set("/x.3tz", writeZip(T3.files));
  const r3 = await run(`${BASE}/x.3tz`, { keep: new Map(T3.files.map((f) => [f.name, f.data])) });
  const withExtra = T3.files.filter((f) => f.localExtra).length;
  eq(r3.reqs - r3.openReqs, r3.tiles + 1 + withExtra,
     `a local extra of 200 B (past the margin): the ${withExtra} tiles that have it ask twice, the others once`);
  eq(r3.bad, [], "…and their bytes are right");

  // ── a directory longer than the tail: two requests; past cdMax, the index ─
  const T4 = tileset(400, 2_000);
  const big = writeZip(T4.files);
  served.set("/big.3tz", big);
  const keep4 = new Map(T4.files.map((f) => [f.name, f.data]));
  const r4 = await run(`${BASE}/big.3tz`, { keep: keep4, open: (s) => Z.Archive3tz.open(s, { tailBytes: 8 * 1024 }) });
  eq([r4.openReqs, r4.a.stats.directory, r4.reqs - r4.openReqs], [2, "central", r4.tiles + 1],
     "a central directory longer than the tail (8 KB here): the rest of it in a second request, then one a tile");
  const r5 = await run(`${BASE}/big.3tz`, { keep: keep4, open: (s) => Z.Archive3tz.open(s, { tailBytes: 8 * 1024, cdMaxBytes: 4 * 1024 }) });
  eq([r5.a.stats.directory, r5.openReqs, r5.a.stats.entries], ["index", 2, 401],
     "past cdMaxBytes (4 KB here): the index @3dtilesIndex1@, header and bytes in one request after the tail");
  eq(r5.reqs - r5.openReqs, r5.tiles + 1, "…a tile through the index: one request (header + the first 64 KB)");
  eq(r5.bad, [], "…and its bytes are right");
  {
    // through the index, a tile longer than the speculative read: two
    const T6 = tileset(3, 150_000);
    served.set("/idx-big.3tz", writeZip(T6.files));
    const r6 = await run(`${BASE}/idx-big.3tz`, { keep: new Map(T6.files.map((f) => [f.name, f.data])),
                                                 open: (s) => Z.Archive3tz.open(s, { tailBytes: 100, cdMaxBytes: 64 }) });
    const long = T6.files.filter((f) => f.name !== "tileset.json" && f.data.length > 64 * 1024).length;
    eq([r6.a.stats.directory, r6.reqs - r6.openReqs, r6.bad], ["index", r6.tiles + 1 + long, []],
       `…a tile over 64 KB through the index: the rest in a second request (${long} such)`);
  }

  // ── a non-ASCII name (NFC, flag 0x800), asked in NFD ────────────────────
  served.set("/nfc.3tz", writeZip([{ name: "tileset.json", data: Buffer.from("{}") },
                                   { name: "Data/città.b3dm", data: Buffer.from("città") }]));
  {
    reset();
    const a = await Z.Archive3tz.open(Z.httpSource(`${BASE}/nfc.3tz`));
    const got = await a.readEntry("Data/città.b3dm".normalize("NFD"));
    eq([got && Buffer.from(got).toString(), log.reqs], ["città", 2], "a non-ASCII entry asked in NFD is found, in one request");
  }

  // ── a server without Range: downloaded once, as before ──────────────────
  server.ranges = false;
  const r7 = await run(`${BASE}/a.3tz`, { keep: keep1 });
  eq([r7.src.describe().ranges, r7.reqs, r7.bad], [false, 1, []],
     "a server without Range: ONE request, the whole archive, every tile sliced from it (unchanged)");
  server.ranges = true;

  // ── the plain zip (no index) reads the same way ─────────────────────────
  served.set("/plain.zip", writeZip(T2.files, { index: false }));
  {
    reset();
    const z = await Z.ZipArchive.open(Z.httpSource(`${BASE}/plain.zip`));
    const o = log.reqs;
    const got = await z.readEntry("tiles/t3.b3dm");
    eq([o, log.reqs - o, Buffer.compare(Buffer.from(got), T2.files[4].data)], [1, 1, 0],
       "a plain zip (no index): one request to open, one an entry");
  }

  // ── the persistent cache: a second pass asks nothing ────────────────────
  {
    const mem = C.memoryStore();
    const cache = new C.TileCache(mem, { maxMB: 64 });
    const url = `${BASE}/a.3tz`;
    const pass = async () => {
      const plugin = new Z.Tiles3tzPlugin(Z.Archive3tz.open(Z.httpSource(url)), "https://emstudio.invalid/__3tz__/1/", cache);
      const before = { reqs: log.reqs, bytes: log.bytes };
      await plugin.archive;
      const after = { reqs: log.reqs, bytes: log.bytes };
      for (const n of ["tileset.json", ...T1.names]) {
        const r = await plugin.fetchData(`${plugin.base}${n}`);
        if (r.status !== 200) throw new Error(`${n}: ${r.status}`);
        await r.arrayBuffer();
      }
      await cache.flush();
      return { open: after.reqs - before.reqs, tiles: log.reqs - after.reqs, tileBytes: log.bytes - after.bytes, plugin };
    };
    reset();
    const p1 = await pass();
    const p2 = await pass();
    ok(p1.tiles === 301 && p1.tileBytes > 5e6, `cache, pass 1: ${p1.tiles} tile requests, ${(p1.tileBytes / 1e6).toFixed(1)} MB`);
    eq([p2.tiles, p2.tileBytes], [0, 0], "cache, pass 2 (a new layer, the tiles out of memory): 0 tile requests, 0 bytes");
    ok(p2.plugin.cacheHits === 301, `…301 tiles from the cache (${p2.plugin.cacheHits})`);
  }
} finally {
  http.close();
}

if (fails.length) {
  console.error(fails.map((f) => `  ✗ ${f}`).join("\n"));
  console.error(`tiles3tz-http: ${fails.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`tiles3tz-http: ${checks} checks passed`);
