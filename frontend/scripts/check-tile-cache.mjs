// MICRO-OTTIMIZZA-3 · the tiles do not come again at every return: the
// persistent tile cache (`src/tile-cache.ts`) and the bridge's validators
// (`tools/em_bridge.py` `_fs_file`: ETag, Last-Modified, 304, If-Range; a
// stamped .3tz immutable), in node, against a bridge started here:
//
//   node scripts/check-tile-cache.mjs
//   LAT_MS=20 node scripts/check-tile-cache.mjs      (the latency of the passes)
//
//   · the cache alone (a store in memory): the ceiling, the least recently used
//     first, the index saved and read back, what the index does not know let go,
//     «Svuota», a tile too big for the ceiling left out;
//   · the bridge: a folder's file — ETag of mtime+size, 304 to If-None-Match and
//     If-Modified-Since, a Range too, If-Range; HEAD the same ETag; a stamped
//     .3tz — ETag = the stamp's sha256, immutable; touched after its stamp, back
//     to mtime+size and revalidation; the preflight lists the conditionals;
//   · a second pass after the tiles left the memory, with a latency on every
//     request: a folder (fresh: 0 requests; stale: one HEAD a tile, 0 bytes; a
//     tile rewritten comes again), a stamped .3tz (0 requests, under another URL
//     too), an unstamped one rewritten (its old tiles not served).
import * as esbuild from "esbuild";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
const LAT = Number(process.env.LAT_MS ?? 20);

const load = async (contents) => {
  const b = await esbuild.build({ stdin: { contents, resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm",
                                  write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const M = await load(`export * from "./tile-cache"; export { Archive3tz, Tiles3tzPlugin, httpSource } from "./tiles3tz";`);

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); else console.log(`  ✓ ${what}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MB = 1024 * 1024;

// ── the cache alone ─────────────────────────────────────────────────────────
{
  const store = M.memoryStore();
  const c = new M.TileCache(store, { maxMB: 1 });
  const tile = (i) => new Uint8Array(100 * 1024).fill(i);
  for (let i = 0; i < 9; i++) await c.put(`k${i}`, tile(i));
  await c.get("k0");                                  // k0 the most recent now
  for (let i = 9; i < 15; i++) await c.put(`k${i}`, tile(i));
  const s = await c.stats();
  ok(s.bytes <= MB && s.entries < 15, `under the ceiling (1 MB): ${s.entries} tiles, ${(s.bytes / 1024).toFixed(0)} KB, ${s.evicted} let go`);
  ok(store.map.has("k0") && !store.map.has("k1"), "the least recently used go first (k1 gone; k0, read again, kept)");
  ok((await c.get("k14"))?.[0] === 14, "…and a tile kept is read back as it was");
  await c.flush();
  store.map.set("stranger", new Uint8Array(10));      // another window's, unknown to the index
  const c2 = new M.TileCache(store, { maxMB: 1 });
  const s2 = await c2.stats();
  ok(s2.entries === s.entries && !store.map.has("stranger"), `the index read back (${s2.entries} tiles); an entry it does not know let go`);
  store.map.delete("k14");                            // the browser let it go
  ok((await c2.get("k14")) === null && (await c2.stats()).entries === s.entries - 1, "an entry the browser dropped: a miss, its row gone");
  await c2.put("huge", new Uint8Array(200 * 1024));
  ok(!store.map.has("huge"), "a tile over an eighth of the ceiling is not kept");
  c2.setCeilingMB(0.5);
  await sleep(0);
  ok((await c2.stats()).bytes <= 0.5 * MB, "the ceiling lowered: the least used go at once");
  await c2.clear();
  ok((await c2.stats()).entries === 0 && store.map.size === 0, "«Svuota la cache delle tile»: nothing left");
  ok(!new M.TileCache(null).enabled, "no Cache Storage (an insecure context): the cache is off");
  const h = (cc) => new Headers({ "cache-control": cc });
  ok(M.freshUntil(h("max-age=60, must-revalidate"), 1000) === 61_000 && M.freshUntil(h("no-store")) === null
     && M.freshUntil(h("public, max-age=31536000, immutable"), 0) > 3e10 && M.freshUntil(new Headers()) === 0,
     "freshness from Cache-Control: max-age, immutable, no-store (not kept), nothing (revalidate)");
  const hex = "a".repeat(64);
  ok(M.archiveIdentity({ kind: "http", ranges: true, url: "http://b/fs/file?path=x.3tz", etag: `"sha256-${hex}"` }) === `sha256:${hex}`
     && M.archiveIdentity({ kind: "http", ranges: true, url: `https://node/v1/assets/sha256:${hex}`, etag: null }) === `sha256:${hex}`
     && M.archiveIdentity({ kind: "http", ranges: true, url: "http://b/x.3tz", etag: '"1-2"' }) === 'http://b/x.3tz#"1-2"'
     && M.archiveIdentity({ kind: "http", ranges: true, url: "http://b/x.3tz", etag: null }) === null
     && M.archiveIdentity({ kind: "http", ranges: false, url: "http://b/x.3tz", etag: '"1-2"' }) === null
     && M.archiveIdentity({ kind: "blob", ranges: true }) === null,
     "an archive's identity: the stamp's sha256, a content address, URL + ETag; none without a validator, Range, or for a local file");
}

// ── the bridge ──────────────────────────────────────────────────────────────
if (!existsSync(PY)) {
  console.log("  (skipped: the bridge — no s3Dgraphy checkout with its venv)");
} else {
  const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
    const p = s.address().port; s.close(() => res(p)); }); });
  const dir = realpathSync(mkdtempSync(`${tmpdir()}/tile-cache-`));
  const fsroot = `${dir}/fs`;
  const ts = `${fsroot}/ts`;
  mkdirSync(`${ts}/tiles`, { recursive: true });
  const N = 120;
  const names = Array.from({ length: N }, (_, i) => `tiles/t${i}.b3dm`);
  writeFileSync(`${ts}/tileset.json`, JSON.stringify({ asset: { version: "1.0" }, geometricError: 1,
    root: { boundingVolume: { sphere: [0, 0, 0, 1] }, geometricError: 1, content: { uri: names[0] },
            children: names.slice(1).map((u) => ({ boundingVolume: { sphere: [0, 0, 0, 1] }, geometricError: 0, content: { uri: u } })) } }));
  for (let i = 0; i < N; i++) writeFileSync(`${ts}/${names[i]}`, Buffer.alloc(20_000 + i * 50, i & 255));
  // a canonical .3tz (dtcstamp's writer, 3DSC's profile), stamped; and a copy unstamped
  const made = spawnSync(PY, ["-c", `
import sys, dtcstamp
src, out = sys.argv[1], sys.argv[2]
dtcstamp.write_canonical_3tz(src, out)
dtcstamp.write_stamp(dtcstamp.new_tree_stamp(out, "res:test"), out + ".stamp.json")
import shutil; shutil.copyfile(out, sys.argv[3])
`, ts, `${fsroot}/ts.3tz`, `${fsroot}/plain.3tz`], { env: { ...process.env, PYTHONPATH: DTC }, encoding: "utf8" });
  ok(made.status === 0, `a canonical .3tz and its stamp, by dtcstamp ${made.status ? made.stderr.slice(-300) : ""}`);
  const sha = createHash("sha256").update(readFileSync(`${fsroot}/ts.3tz`)).digest("hex");

  const port = await freePort();
  const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state` };
  const bridge = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", fsroot],
                       { env, stdio: ["ignore", "ignore", "inherit"] });
  const B = `http://127.0.0.1:${port}`;
  const ORIGIN = "http://localhost:5173";
  const at = (abs) => `${B}/fs/at/${abs.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/")}`;
  const get = (u, headers = {}, method = "GET") => fetch(u, { method, headers: { Origin: ORIGIN, ...headers } });
  try {
    for (let i = 0; i < 120; i++) { try { await fetch(`${B}/health`); break; } catch { await sleep(250); } }

    // a folder's file
    const u = at(`${ts}/tiles/t3.b3dm`);
    const r = await get(u);
    const etag = r.headers.get("etag"), lm = r.headers.get("last-modified");
    await r.arrayBuffer();
    ok(r.status === 200 && /^"[0-9a-f]+-[0-9a-f]+"$/.test(etag ?? "") && !!lm && r.headers.get("cache-control") === "max-age=60, must-revalidate",
       `a folder's tile: 200, ETag of mtime+size (${etag}), Last-Modified, revalidated after 60 s`);
    ok(/\bETag\b/.test(r.headers.get("access-control-expose-headers") ?? ""), "…its ETag readable by the page (Expose-Headers)");
    const n1 = await get(u, { "If-None-Match": etag });
    ok(n1.status === 304 && (await n1.arrayBuffer()).byteLength === 0 && n1.headers.get("etag") === etag, "If-None-Match: 304, no body");
    const n2 = await get(u, { "If-Modified-Since": lm });
    ok(n2.status === 304, "If-Modified-Since: 304");
    const n3 = await get(u, { "If-None-Match": '"other"', "If-Modified-Since": lm });
    ok(n3.status === 200 && (await n3.arrayBuffer()).byteLength > 0, "another ETag: 200 (If-None-Match wins over the date)");
    const n4 = await get(u, { "If-None-Match": etag, Range: "bytes=0-9" });
    ok(n4.status === 304, "a Range that holds this file: 304");
    const n5 = await get(u, { Range: "bytes=0-9", "If-Range": etag });
    const n6 = await get(u, { Range: "bytes=0-9", "If-Range": '"old"' });
    ok(n5.status === 206 && (await n5.arrayBuffer()).byteLength === 10 && n6.status === 200,
       "If-Range: the same ETag, 206; another, the whole file (200)");
    await n6.arrayBuffer();
    const hd = await get(u, {}, "HEAD");
    ok(hd.status === 200 && hd.headers.get("etag") === etag, "HEAD: the same ETag");
    const pre = await fetch(u, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "GET",
                                                               "Access-Control-Request-Headers": "if-none-match" } });
    ok(/If-None-Match/.test(pre.headers.get("access-control-allow-headers") ?? ""), "the preflight lists If-None-Match");

    // a stamped .3tz; and once touched after its stamp
    const tz = at(`${fsroot}/ts.3tz`);
    const s1 = await get(tz, { Range: "bytes=-100" });
    await s1.arrayBuffer();
    ok(s1.status === 206 && s1.headers.get("etag") === `"sha256-${sha}"` && /immutable/.test(s1.headers.get("cache-control") ?? ""),
       `a stamped .3tz: its ETag the stamp's sha256 (= the file's), immutable`);
    const s2 = await get(tz, { Range: "bytes=0-99", "If-None-Match": `"sha256-${sha}"` });
    ok(s2.status === 304, "…a Range of it, with that ETag: 304");
    const pl = await get(at(`${fsroot}/plain.3tz`), { Range: "bytes=0-9" });
    await pl.arrayBuffer();
    ok(/^"[0-9a-f]+-[0-9a-f]+"$/.test(pl.headers.get("etag") ?? "") && pl.headers.get("cache-control") === "max-age=60, must-revalidate",
       "an unstamped .3tz: mtime+size, revalidated");

    // ── the second pass, with a latency on every request ─────────────────
    const wire = { reqs: 0, heads: 0, bytes: 0 };
    const fetchFn = async (url, init = {}) => {
      wire.reqs++;
      if ((init.method ?? "GET") === "HEAD") wire.heads++;
      await sleep(LAT);
      const res = await fetch(url, { ...init, headers: { Origin: ORIGIN, ...(init.headers ?? {}) } });
      if ((init.method ?? "GET") !== "HEAD") wire.bytes += Number(res.headers.get("content-length") ?? 0);
      return res;
    };
    const reset = () => { wire.reqs = 0; wire.heads = 0; wire.bytes = 0; };
    /** every file of the tileset through `fetchData`, 6 at a time */
    const pass = async (fd, base, list = ["tileset.json", ...names]) => {
      reset();
      const t0 = performance.now();
      let i = 0;
      const got = new Map();
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (i < list.length) {
          const n = list[i++];
          const res = await fd(`${base}${n}`);
          got.set(n, Buffer.from(await res.arrayBuffer()));
        }
      }));
      return { ...wire, ms: Math.round(performance.now() - t0), got };
    };
    const line = (p) => `${p.reqs} requests (${p.heads} HEAD), ${(p.bytes / 1e6).toFixed(2)} MB, ${p.ms} ms`;

    // a folder
    const fcache = new M.TileCache(M.memoryStore(), { maxMB: 64 });
    const fp = new M.TileCachePlugin(fcache, fetchFn);
    const fbase = at(ts) + "/";
    const f1 = await pass((x) => fp.fetchData(x), fbase);
    ok(f1.reqs === N + 1 && f1.bytes > 2e6, `folder, pass 1 (${LAT} ms): ${line(f1)}`);
    const f2 = await pass((x) => fp.fetchData(x), fbase);
    ok(f2.reqs === 0 && f2.bytes === 0, `folder, pass 2 within max-age: ${line(f2)}`);
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;              // a minute later: stale
    try {
      const f3 = await pass((x) => fp.fetchData(x), fbase);
      ok(f3.reqs === N + 1 && f3.heads === N + 1 && f3.bytes === 0, `folder, pass 2 after max-age: one HEAD a file, no bytes — ${line(f3)}`);
      ok(f3.got.get("tiles/t5.b3dm").equals(readFileSync(`${ts}/tiles/t5.b3dm`)), "…the bytes served from the cache are the file's");
      // a tile rewritten under the window: it comes again, new
      writeFileSync(`${ts}/tiles/t7.b3dm`, Buffer.alloc(1234, 7));
      const later = new Date(realNow() + 5000);
      utimesSync(`${ts}/tiles/t7.b3dm`, later, later);
      Date.now = () => realNow() + 122_000;
      const f4 = await pass((x) => fp.fetchData(x), fbase);
      ok(f4.got.get("tiles/t7.b3dm").length === 1234 && f4.bytes < 5000,
         `…a tile rewritten in the folder comes again, the new one (${line(f4)})`);
    } finally { Date.now = realNow; }

    // a stamped .3tz: its tiles keyed on its sha256
    const zcache = new M.TileCache(M.memoryStore(), { maxMB: 64 });
    const zpass = (url) => {
      const plugin = new M.Tiles3tzPlugin(M.Archive3tz.open(M.httpSource(url, fetchFn)), "https://emstudio.invalid/__3tz__/9/", zcache);
      return { plugin, run: () => plugin.archive.then(() => pass((x) => plugin.fetchData(x), plugin.base)) };
    };
    const z1 = await zpass(tz).run();
    ok(z1.reqs === N + 1 && z1.got.get("tiles/t9.b3dm").equals(readFileSync(`${ts}/tiles/t9.b3dm`)),
       `stamped .3tz, pass 1: one request a tile — ${line(z1)}`);
    const again = zpass(tz);
    const z2 = await again.run();
    ok(z2.reqs === 0 && z2.bytes === 0 && again.plugin.cacheHits === N + 1, `stamped .3tz, pass 2 (a new layer): ${line(z2)}`);
    const other = zpass(`${B}/fs/file?path=${encodeURIComponent(`${fsroot}/ts.3tz`)}`);
    const z3 = await other.run();
    ok(z3.reqs === 0 && other.plugin.cacheHits === N + 1, "…asked under another URL (/fs/file): the same sha256, the same tiles, 0 requests");
    // touched after its stamp: not trusted any more — mtime+size, revalidated
    const later = new Date(realNow() + 10_000);
    utimesSync(`${fsroot}/ts.3tz`, later, later);
    const t1 = await get(tz, { Range: "bytes=-10" });
    await t1.arrayBuffer();
    ok(/^"[0-9a-f]+-[0-9a-f]+"$/.test(t1.headers.get("etag") ?? "") && !/immutable/.test(t1.headers.get("cache-control") ?? ""),
       "a .3tz touched after its stamp: the stamp not trusted (mtime+size, revalidated)");

    // an unstamped .3tz rewritten: its old tiles are not served
    const ucache = new M.TileCache(M.memoryStore(), { maxMB: 64 });
    // the opening counted apart (`pass` counts from after it): an unstamped
    // archive is trusted only through the ETag its tail brings at each opening
    const upass = async () => {
      reset();
      const plugin = new M.Tiles3tzPlugin(M.Archive3tz.open(M.httpSource(at(`${fsroot}/plain.3tz`), fetchFn)), "https://emstudio.invalid/__3tz__/8/", ucache);
      await plugin.archive;
      const opened = wire.reqs;
      return { opened, ...(await pass((x) => plugin.fetchData(x), plugin.base, ["tileset.json", "tiles/t7.b3dm"])) };
    };
    await upass();
    const u2 = await upass();
    ok(u2.opened === 1 && u2.reqs === 0, `unstamped .3tz, pass 2: only the tail to open it (${u2.opened} request), the tiles from the cache (${u2.reqs})`);
    const re = spawnSync(PY, ["-c", "import sys, dtcstamp; dtcstamp.write_canonical_3tz(sys.argv[1], sys.argv[2])", ts, `${fsroot}/plain.3tz`],
                         { env: { ...process.env, PYTHONPATH: DTC }, encoding: "utf8" });
    utimesSync(`${fsroot}/plain.3tz`, new Date(realNow() + 20_000), new Date(realNow() + 20_000));
    const u3 = await upass();
    ok(re.status === 0 && u3.got.get("tiles/t7.b3dm").length === 1234 && u3.opened === 1 && u3.reqs === 2,
       "…rewritten (t7 changed): another ETag, another archive — its tiles read again, the new t7");
  } finally {
    bridge.kill();
  }
}

if (fails.length) {
  console.error(fails.map((f) => `  ✗ ${f}`).join("\n"));
  console.error(`tile-cache: ${fails.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`tile-cache: ${checks} checks passed`);
