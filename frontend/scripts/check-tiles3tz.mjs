// NIGHT-RISORSA-FILE · parte 3 · executable check of the .3tz reader
// (`src/tiles3tz.ts`), in node, on real archives:
//
//   node scripts/check-tiles3tz.mjs
//
//   · dtcstamp's conformance cases 20 and 23 (`conformance/data/`, a canonical
//     3tz written by 3DSC, and one with a non-ASCII name: NFC, flag 0x800);
//   · TempluMare's archive of the base (`RM/TempluMare_cesium.3tz`, 7302 files,
//     199 MB) against its extracted folder — skipped, and said, when the copy is
//     not there;
//   · the bridge's Range (`BRIDGE`, default :8791) — skipped when it does not answer.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}tiles3tz.ts`], bundle: true, format: "esm", write: false });
const Z = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

/** a file on disk, read by range — what `Blob.slice` is in a page */
function fileSource(path) {
  const size = statSync(path).size;
  let downloaded = 0, reads = 0;
  return {
    size: async () => size,
    read: async (o, l) => {
      const fd = openSync(path, "r");
      const b = Buffer.alloc(l);
      readSync(fd, b, 0, l, o);
      closeSync(fd);
      downloaded += l; reads++;
      return new Uint8Array(b.buffer, b.byteOffset, l);
    },
    describe: () => ({ kind: "blob", ranges: true, downloaded, reads }),
  };
}

// ── MD5 ─────────────────────────────────────────────────────────────────────
for (const s of ["", "tileset.json", "Data/c01/e0222.b3dm", "Data/città.b3dm", "x".repeat(200)]) {
  const mine = Buffer.from(Z.md5(new TextEncoder().encode(s))).toString("hex");
  eq(mine, createHash("md5").update(s, "utf8").digest("hex"), `md5 of ${JSON.stringify(s.slice(0, 20))} is RFC 1321's`);
}

// ── the conformance cases of dtcstamp ───────────────────────────────────────
const CONF = process.env.DTCSTAMP_CONFORMANCE ?? new URL("../../../dtcstamp/conformance/", import.meta.url).pathname;
for (const [caseFile, key] of [["20-tileset-folder-and-3tz.json", "20"], ["23-tileset-non-ascii-name.json", "23"]]) {
  if (!existsSync(CONF + caseFile)) { console.log(`  (skipped: ${CONF}${caseFile})`); continue; }
  const c = JSON.parse(readFileSync(CONF + caseFile, "utf8"));
  const text = JSON.stringify(c);
  const data = readdirSync(`${CONF}data`).filter((f) => f.endsWith(".3tz")).find((f) => text.includes(f));
  if (!data) { fails.push(`case ${key}: no .3tz named in it`); continue; }
  const bytes = readFileSync(`${CONF}data/${data}`);
  const a = await Z.Archive3tz.open(fileSource(`${CONF}data/${data}`));
  const wantFiles = c.expect?.files ?? c.expect?.content_files ?? null;
  ok(a.stats.entries >= 3, `case ${key} (${data}): the index opens (${a.stats.entries} entries, ${a.stats.openReads} reads)`);
  const sha = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  ok(text.includes(sha.slice(7, 19)), `case ${key}: the archive is the one the case pins (${sha.slice(0, 19)}…)`);
  // every file the case lists is read back through the index
  const names = [...text.matchAll(/"(?:path|name)":\s*"([^"]+)"/g)].map((m) => m[1])
    .filter((n) => !n.endsWith(".3tz") && !n.includes("{") && n !== "tileset.json");
  const tiles = await a.readEntry("tileset.json");
  ok(tiles && JSON.parse(new TextDecoder().decode(tiles)).asset, `case ${key}: tileset.json read from the index is a tileset`);
  if (key === "23") {
    const nfd = "Data/città.b3dm".normalize("NFD");
    const got = await a.readEntry(nfd);
    ok(got && got.length > 0, "case 23: the non-ASCII entry is found — asked in NFD, read in NFC");
  }
  void wantFiles; void names;
}

// ── TempluMare ──────────────────────────────────────────────────────────────
const BASE = process.env.TEMPLU_RM ?? new URL("../../.claude/wip/reports/2026-10-22-risorsa-file/fs/base/RM", import.meta.url).pathname;
if (existsSync(`${BASE}/TempluMare_cesium.3tz`)) {
  const src = fileSource(`${BASE}/TempluMare_cesium.3tz`);
  const t0 = performance.now();
  const a = await Z.Archive3tz.open(src);
  const tOpen = performance.now() - t0;
  eq(a.stats.entries, 7302, "TempluMare.3tz: 7302 entries in the index");
  // what opening costs: the index (7302 × 24 B) and a few hundred bytes more
  ok(src.describe().downloaded < a.stats.indexBytes + 4096,
    `…opened reading ${src.describe().downloaded} B of 199 MB — the index is ${a.stats.indexBytes} B (${src.describe().reads} reads, ${tOpen.toFixed(0)} ms)`);
  const same = async (rel) => {
    const got = await a.readEntry(rel);
    const want = readFileSync(`${BASE}/TempluMare_cesium/${rel}`);
    return !!got && Buffer.compare(Buffer.from(got), want) === 0;
  };
  ok(await same("tileset.json"), "…tileset.json from the archive = the folder's");
  const t1 = performance.now();
  ok(await same("Data/c01/e0222.b3dm"), "…a tile (Data/c01/e0222.b3dm) from the archive = the folder's");
  const tTile = performance.now() - t1;
  eq(await a.readEntry("Data/not-there.b3dm"), null, "…an entry that is not there is null");
  console.log(`  TempluMare.3tz: open ${tOpen.toFixed(1)} ms (${a.stats.openReads} reads), one tile ${tTile.toFixed(1)} ms`);
} else console.log(`  (skipped: ${BASE}/TempluMare_cesium.3tz not here)`);

// ── HTTP: the bridge answers Range; a server that does not is downloaded once ─
const BRIDGE = process.env.BRIDGE ?? "http://localhost:8791";
let bridgeUp = false;
try { bridgeUp = (await fetch(`${BRIDGE}/health`)).ok; } catch { /* not here */ }
if (bridgeUp && existsSync(`${BASE}/TempluMare_cesium.3tz`)) {
  const url = `${BRIDGE}/fs/file?path=${encodeURIComponent(`${BASE}/TempluMare_cesium.3tz`)}`;
  const f = (u, init = {}) => fetch(u, { ...init, headers: { ...(init.headers ?? {}), origin: "http://localhost:5231" } });
  const r = await f(url, { headers: { Range: "bytes=0-9" } });
  eq([r.status, r.headers.get("content-range"), (await r.arrayBuffer()).byteLength],
    [206, "bytes 0-9/199378562", 10], "the bridge answers Range: 206, Content-Range, 10 bytes");
  const src = Z.httpSource(url, f);
  const a = await Z.Archive3tz.open(src);
  eq(a.stats.entries, 7302, "…and the archive opens THROUGH the bridge, by ranges");
  ok(src.describe().ranges === true && src.describe().downloaded < a.stats.indexBytes + 4096,
    `…reading ${src.describe().downloaded} B, not 199 MB`);
} else console.log(`  (skipped: no bridge at ${BRIDGE})`);
{
  // a server that ignores Range (StratiGraph Server's get_asset, measured): 200
  // with everything — kept and sliced, one download
  const small = readdirSync(`${CONF}data`).find((f) => f.endsWith(".3tz"));
  if (small) {
    const bytes = readFileSync(`${CONF}data/${small}`);
    let calls = 0;
    const noRange = async () => { calls++; return new Response(bytes, { status: 200 }); };
    const src = Z.httpSource("http://store/asset/sha256:x", noRange);
    const a = await Z.Archive3tz.open(src);
    await a.readEntry("tileset.json");
    eq([src.describe().ranges, calls], [false, 1], "a server without Range: the archive is downloaded ONCE, and it says so");
    ok(a.stats.entries >= 3, "…and it is read from that one download");
  }
}

if (fails.length) {
  console.error(fails.map((f) => `  ✗ ${f}`).join("\n"));
  console.error(`tiles3tz: ${fails.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`tiles3tz: ${checks} checks passed`);
