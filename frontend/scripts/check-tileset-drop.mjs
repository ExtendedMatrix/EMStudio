// MICRO-TILESET-CARTELLA (25 Oct 2026) · executable check of `src/tileset-drop.ts`
// and of the zip reader it uses (`tiles3tz.ts ZipArchive`), in node:
//
//   node scripts/check-tileset-drop.mjs
//
//   · the forms, on small trees made here: a folder with tileset.json, the
//     RealityScan pair dropped as X.json + X/ and as the folder holding both,
//     X/ alone (the message), a plain zip, a zip with tileset.json in a folder,
//     a zip holding the pair, a zip holding X/ with its X.json dropped beside,
//     a zip with nothing (what is inside, what to do), a canonical .3tz written
//     by 3D Survey Collection's writer when its checkout is beside;
//   · what is served: tileset.json = the root's bytes, the tiles under the
//     root's folder, the root's transform left out when it puts it on the Earth;
//   · the position line: the Basilica Iulia's transform (lat 0.0001°, lon
//     10.51°: the warning), a true place (the Forum: no warning), a local frame;
//   · «Attacca all'epoca»: the RM in the epoch, its resource, one batch;
//   · the Basilica itself, READ ONLY from the Desktop (`BASILICA_DIR`,
//     `BASILICA_FIXED`): skipped, and said, when the copies are not there.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openAsBlob, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (what) => {
  const b = await esbuild.build({ stdin: { contents: what, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const D = await load(`export * from "./tileset-drop"; export { plainGraph } from "./resources";
  export { blobSource, ZipArchive, gunzipIfGzip } from "./tiles3tz";`);

/** a ByteSource that counts its reads and bytes (its tail too: MICRO-3TZ-DAL-PACCHETTO,
 *  `blobSource` has one now, the package's — the last bytes and the size in one read) */
const counted = (src) => { let n = 0, bytes = 0; return { ...src, read: async (o, l) => { n++; const b = await src.read(o, l); bytes += b.length; return b; },
  ...(src.tail ? { tail: async (l) => { n++; const t = await src.tail(l); bytes += t.bytes.length; return t; } } : {}),
  reads: () => n, bytes: () => bytes }; };

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};
const txt = (b) => (b ? new TextDecoder().decode(b) : null);

const BASILICA_T = [-0.18243234, 0.98321841, 0.0, 0.0, -0.00000197, -0.00000036, 1.0, 0.0,
  0.98321841, 0.18243234, 0.000002, 0.0, 6271103.68898329, 1163587.9280063, 12.30476309, 1.0];
const rootDoc = (prefix, transform = BASILICA_T) => JSON.stringify({
  asset: { version: "1.0", extras: { createdWith: "RealityScan 2.2.0.119430" } }, geometricError: 54.8,
  root: { boundingVolume: { box: [0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5] }, geometricError: 0.9, refine: "REPLACE",
    ...(transform ? { transform } : {}), content: { url: `${prefix}Geometry/lod1_0.b3dm` },
    children: [{ boundingVolume: { box: [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2] }, geometricError: 0.1,
      content: { url: `${prefix}tileset_lod1_0.json` } }] } });
const lod = JSON.stringify({ asset: { version: "1.0" }, geometricError: 0.1,
  root: { boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }, geometricError: 0, content: { url: "Geometry/lod0_0.b3dm" } } });
const blob = (s) => new Blob([s]);
/** RealityScan's export: X.json beside X/ */
const rsFiles = (at = "", x = "tileset_X") => [
  { path: `${at}${x}.json`, blob: blob(rootDoc(`${x}/`)) },
  { path: `${at}${x}/Geometry/lod1_0.b3dm`, blob: blob("b3dm-lod1") },
  { path: `${at}${x}/Geometry/lod0_0.b3dm`, blob: blob("b3dm-lod0") },
  { path: `${at}${x}/tileset_lod1_0.json`, blob: blob(lod) },
];

// ── the forms, from files of the system ─────────────────────────────────────
{
  const folder = [{ path: "T/tileset.json", blob: blob(rootDoc("")) }, { path: "T/Geometry/lod1_0.b3dm", blob: blob("x") }];
  const { tree, label, zipped } = await D.treeOfDrop(folder);
  const r = await D.recognise(tree, label, zipped);
  eq([r.form, r.ready, r.preparable, r.entry, r.prefix, r.name], ["folder", true, true, "T/tileset.json", "T/", "T"], "a folder with tileset.json");
  const s = D.servedSource(tree, r, false);
  eq(txt(await s.readEntry("Geometry/lod1_0.b3dm")), "x", "…its tiles served under it");
}
{
  const { tree, label, zipped } = await D.treeOfDrop(rsFiles());
  const r = await D.recognise(tree, label, zipped);
  eq([r.form, r.preparable, r.entry, r.prefix, r.name], ["pair", true, "tileset_X.json", "", "tileset_X"], "the pair dropped as X.json + X/");
  ok(/RealityScan form/.test(r.says) && /no tileset\.json/.test(r.says), `…said: ${r.says}`);
  const s = D.servedSource(tree, r, true);
  const doc = JSON.parse(txt(await s.readEntry("tileset.json")));
  ok(!("transform" in doc.root), "…served recentred: the geocentric transform left out (view only)");
  eq(doc.root.content.url, "tileset_X/Geometry/lod1_0.b3dm", "…its contents as the root names them");
  eq(txt(await s.readEntry("tileset_X/Geometry/lod1_0.b3dm")), "b3dm-lod1", "…the tile read from X/");
  ok(s.firstTileAt !== null, "…the first tile's time noted");
  const s2 = D.servedSource(tree, r, false);
  ok("transform" in JSON.parse(txt(await s2.readEntry("tileset.json"))).root, "…not recentred: the transform stays");
}
{
  const { tree, label, zipped } = await D.treeOfDrop(rsFiles("BasilicaTSL_cesium/"));
  const r = await D.recognise(tree, label, zipped);
  eq([r.form, r.entry, r.prefix], ["pair", "BasilicaTSL_cesium/tileset_X.json", "BasilicaTSL_cesium/"], "the folder that holds the pair");
  const s = D.servedSource(tree, r, false);
  eq(txt(await s.readEntry("tileset_X/tileset_lod1_0.json")), lod, "…the lod json read under the folder");
}
{
  const { tree, label, zipped } = await D.treeOfDrop(rsFiles().slice(1));
  const r = await D.recognise(tree, label, zipped);
  eq(r.form, "unknown", "X/ alone: not a tileset by itself");
  ok(/drop tileset_X\.json together with tileset_X\//.test(r.says), `…the message says what to do: ${r.says}`);
}

// ── zips, made by python's zipfile (stored and deflated) ────────────────────
const WORK = mkdtempSync(`${tmpdir()}/em-tsdrop-`);
const mk = (name, entries, deflate = false) => {
  const p = `${WORK}/${name}`;
  const spec = JSON.stringify(entries);
  execFileSync("python3", ["-I", "-c", `import json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED if sys.argv[3]=='1' else zipfile.ZIP_STORED)
for n,c in json.loads(sys.argv[2]): z.writestr(n,c)
z.close()`, p, spec, deflate ? "1" : "0"]);
  return p;
};
const fileBlob = async (p) => openAsBlob(p);
const rsEntries = (x = "tileset_X", withRoot = true) => [
  ...(withRoot ? [[`${x}.json`, rootDoc(`${x}/`)]] : []),
  [`${x}/Geometry/lod1_0.b3dm`, "b3dm-lod1"], [`${x}/Geometry/lod0_0.b3dm`, "b3dm-lod0"], [`${x}/tileset_lod1_0.json`, lod]];
{
  const p = mk("plain.zip", [["tileset.json", rootDoc("")], ["Geometry/lod1_0.b3dm", "z1"]], true);
  const { tree, label, zipped } = await D.treeOfDrop([{ path: "plain.zip", blob: await fileBlob(p) }]);
  const r = await D.recognise(tree, label, zipped);
  eq([r.form, r.ready, r.entry], ["package", true, "tileset.json"], "a plain zip (deflated, no 3tz index): a package");
  eq(txt(await D.servedSource(tree, r, false).readEntry("Geometry/lod1_0.b3dm")), "z1", "…a deflated tile inflated");
}
{
  const p = mk("nested.zip", [["inner/tileset.json", rootDoc("")], ["inner/Geometry/lod1_0.b3dm", "z2"]]);
  const { tree, label, zipped } = await D.treeOfDrop([{ path: "nested.zip", blob: await fileBlob(p) }]);
  const r = await D.recognise(tree, label, zipped);
  eq([r.form, r.entry, r.prefix], ["package", "inner/tileset.json", "inner/"], "a zip with tileset.json in its one folder");
  eq(txt(await D.servedSource(tree, r, false).readEntry("Geometry/lod1_0.b3dm")), "z2", "…served under the folder");
}
{
  const p = mk("Archivio.zip", rsEntries());
  const { tree, label, zipped } = await D.treeOfDrop([{ path: "Archivio.zip", blob: await fileBlob(p) }]);
  const r = await D.recognise(tree, label, zipped);
  eq([r.form, r.preparable, r.name], ["zip_pair", true, "tileset_X"], "a zip holding X.json and X/");
}
{
  const p = mk("solo.zip", rsEntries("tileset_X", false));
  const alone = await D.treeOfDrop([{ path: "solo.zip", blob: await fileBlob(p) }]);
  const r0 = await D.recognise(alone.tree, alone.label, alone.zipped);
  eq(r0.form, "unknown", "a zip holding X/ alone");
  ok(/No tileset\.json in solo\.zip: it holds tileset_X\/ \(1 json, 2 tiles\)/.test(r0.says)
     && /drop tileset_X\.json together with the zip/.test(r0.says), `…it says what is inside and what to do: ${r0.says}`);
  const both = await D.treeOfDrop([{ path: "solo.zip", blob: await fileBlob(p) }, { path: "tileset_X.json", blob: blob(rootDoc("tileset_X/")) }]);
  const r = await D.recognise(both.tree, both.label, both.zipped);
  eq([r.form, r.preparable], ["zip_no_root", true], "…with its X.json dropped beside it");
  eq(txt(await D.servedSource(both.tree, r, false).readEntry("tileset_X/Geometry/lod0_0.b3dm")), "b3dm-lod0", "…the tile read from the zip");
}
{
  const p = mk("nothing.zip", [["some/notes.txt", "x"]]);
  const t = await D.treeOfDrop([{ path: "nothing.zip", blob: await fileBlob(p) }]);
  const r = await D.recognise(t.tree, t.label, t.zipped);
  eq(r.form, "unknown", "a zip with nothing usable");
  ok(/it holds some\/ \(0 json, 0 tiles\); a tileset package holds tileset\.json/.test(r.says), `…said: ${r.says}`);
}
const A3 = new URL("../../../3D-survey-collection/cesium_exporter/archive_3tz.py", import.meta.url).pathname;
if (existsSync(A3)) {
  const dir = `${WORK}/canon`;
  mkdirSync(`${dir}/Geometry`, { recursive: true });
  writeFileSync(`${dir}/tileset.json`, rootDoc(""));
  writeFileSync(`${dir}/Geometry/lod1_0.b3dm`, "c1");
  execFileSync("python3", ["-I", "-c", `import importlib.util,sys
s=importlib.util.spec_from_file_location('a3',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
m.write_3tz(sys.argv[2],sys.argv[3])`, A3, dir, `${WORK}/canon.3tz`]);
  const t = await D.treeOfDrop([{ path: "canon.3tz", blob: await fileBlob(`${WORK}/canon.3tz`) }]);
  const r = await D.recognise(t.tree, t.label, t.zipped);
  eq(r.form, "package", "a canonical .3tz (3DSC's writer): a package");
  eq(txt(await D.servedSource(t.tree, r, false).readEntry("Geometry/lod1_0.b3dm")), "c1", "…its tile read through the index");
  const names = (await t.tree.list("")).join(",");
  ok(!names.includes("@3dtilesIndex1@"), "…the index is not a file of the tree");
  // MICRO-DROP-3TZ-GRANDE · recognised by its index, nothing listed: the tail and tileset.json
  const c = counted(D.blobSource(await fileBlob(`${WORK}/canon.3tz`)));
  const r2 = await D.recognise(await D.openArchive(c), "canon.3tz", true);
  eq([r2.form, c.reads()], ["package", 2], "…recognised with 2 reads (the tail, tileset.json), not its directory read twice");
} else console.log("· 3DSC's archive_3tz.py not beside: the canonical .3tz case skipped");

// MICRO-DROP-3TZ-GRANDE · E.D.'s 6.5 GB archive (236 607 entries, ZIP64, its
// directory 16.8 MB: opened by the index), read in place when it is here
const BIG = process.env.BIG_3TZ ?? `${process.env.HOME}/Library/CloudStorage/OneDrive-CNR/Dottorato Bucarest/14_EM_1.6_lavoro/TempluMare_v2_for_3DR_2026-10-06/RB/cesium/TempluMare_2013.3tz`;
if (existsSync(BIG)) {
  // read by position: node's openAsBlob says this file's size modulo 2³² (node 26:
  // 2 281 030 216 B) — node's limit, not the page's (the bridge's ranges past 4 GB answer)
  const fd = openSync(BIG, "r"), size = statSync(BIG).size;
  const c = counted({ size: async () => size, describe: () => ({ kind: "blob", ranges: true, downloaded: 0 }),
    read: async (o, l) => { const buf = Buffer.alloc(l); const n = readSync(fd, buf, 0, l, o); return new Uint8Array(buf.buffer, buf.byteOffset, n); } });
  const t0 = performance.now();
  const tree = await D.openArchive(c);
  const r = await D.recognise(tree, "TempluMare_2013.3tz", true);
  const openReads = c.reads(), openBytes = c.bytes(), openMs = Math.round(performance.now() - t0);
  const s = D.servedSource(tree, r, true);
  const doc = JSON.parse(txt(await s.readEntry("tileset.json")));
  const r0 = c.reads();
  const tile = await s.readEntry(doc.root.content.uri);
  console.log(`· TempluMare_2013.3tz (${(statSync(BIG).size / 1e9).toFixed(2)} GB): ${r.form} in ${openMs} ms, ${openReads} reads, ${(openBytes / 1e6).toFixed(1)} MB; root tile ${tile?.length} B in ${c.reads() - r0} read`);
  eq(r.form, "package", "the 6.5 GB .3tz: a package");
  ok(openReads <= 3 && openBytes < 7e6, `…opened and recognised by the index: ${openReads} reads, ${openBytes} B (the tail, the index, tileset.json; not the 16.8 MB directory)`);
  eq([!!tile, c.reads() - r0], [true, 1], "…its root tile in ONE read");
  closeSync(fd);
} else console.log(`· ${BIG}: not here, the 6.5 GB case skipped`);

{
  const gz = new Uint8Array(execFileSync("python3", ["-I", "-c", "import gzip,sys;sys.stdout.buffer.write(gzip.compress(b'b3dm-plain'))"]));
  eq(txt(await D.gunzipIfGzip(gz)), "b3dm-plain", "a gzipped tile inflated");
  eq(txt(await D.gunzipIfGzip(new TextEncoder().encode("b3dm"))), "b3dm", "…a plain one left as it is");
}

// ── hostile archives (MICRO-3TZ-DAL-PACCHETTO: the package's limits, kept) ──
{
  // a zip bomb (300 MB of zeros, ~300 KB deflated) in a canonical .3tz and in a
  // plain zip; a .3tz whose end record says its directory is ~4 GB long
  execFileSync("python3", ["-I", "-c", `import hashlib,struct,sys,zipfile
def write(path, files, index):
    with zipfile.ZipFile(path, 'w') as z:
        for n, d in files: z.writestr(zipfile.ZipInfo(n), d, compress_type=zipfile.ZIP_DEFLATED)
        if index:
            keys = sorted(((hashlib.md5(i.filename.encode()).digest(), i.header_offset) for i in z.infolist()),
                          key=lambda k: (int.from_bytes(k[0][:8], 'little'), int.from_bytes(k[0][8:], 'little')))
            z.writestr(zipfile.ZipInfo('@3dtilesIndex1@'), b''.join(h + struct.pack('<Q', o) for h, o in keys))
ts = b'{"asset":{"version":"1.0"},"geometricError":1,"root":{"geometricError":0,"content":{"uri":"bomb.b3dm"}}}'
w = sys.argv[1]
write(w + '/bomb.3tz', [('tileset.json', ts), ('bomb.b3dm', bytes(300 << 20))], True)
write(w + '/bomb.zip', [('tileset.json', ts), ('bomb.b3dm', bytes(300 << 20))], False)
write(w + '/liar.3tz', [('tileset.json', ts), ('bomb.b3dm', b'b3dm')], True)
b = bytearray(open(w + '/liar.3tz', 'rb').read())
struct.pack_into('<I', b, len(b) - 22 + 12, 0xfffffff0)
open(w + '/liar.3tz', 'wb').write(b)`, WORK]);
  const why = async (p) => { try { await p; return null; } catch (e) { return String(e?.message ?? e); } };
  for (const name of ["bomb.3tz", "bomb.zip"]) {
    const { tree, label, zipped } = await D.treeOfDrop([{ path: name, blob: await fileBlob(`${WORK}/${name}`) }]);
    const r = await D.recognise(tree, label, zipped);
    const served = D.servedSource(tree, r, false);
    const said = [];
    served.onFail = (p, e) => said.push([p, String(e?.message ?? e)]);
    const w = await why(served.readEntry("bomb.b3dm"));
    ok(r.form === "package" && /decompressed size is over the limit of 268435456 bytes/.test(w ?? ""),
      `${name}: a zip bomb's tile refused while it inflates (${w})`);
    eq(said.map(([p]) => p), ["bomb.b3dm"], "…and the refusal handed to the caller (the Log)");
    eq(txt(await served.readEntry("tileset.json"))?.slice(0, 9), '{"asset":', "…the other entries still read");
  }
  const w = await why(D.treeOfDrop([{ path: "liar.3tz", blob: await fileBlob(`${WORK}/liar.3tz`) }]));
  ok(/central directory does not end before the end records/.test(w ?? ""),
    `a .3tz whose directory runs past its end records: refused, as a .3tz and as a plain zip (${w})`);
}

// ── the position line ────────────────────────────────────────────────────────
{
  const p = D.position(JSON.parse(rootDoc("x/")));
  ok(p.kind === "earth" && p.warn, "the Basilica's transform: on the Earth, with the warning");
  ok(Math.abs(p.lat) < 0.001 && Math.abs(p.lon - 10.5115) < 0.001 && Math.abs(p.h - 3.7) < 0.5,
     `…lat 0.0001, lon 10.51, h 3.7 (got ${p.lat}, ${p.lon}, ${p.h})`);
  ok(/geocentric/.test(p.line) && /RealityScan/.test(p.line), "…said as EM Tools says it");
  const lat = 41.8925, lon = 12.4853, h = 40;
  const a = 6378137, e2 = 6.69437999014e-3, r = Math.PI / 180;
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat * r) ** 2);
  const t = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (n + h) * Math.cos(lat * r) * Math.cos(lon * r),
    (n + h) * Math.cos(lat * r) * Math.sin(lon * r), (n * (1 - e2) + h) * Math.sin(lat * r), 1];
  const q = D.position(JSON.parse(rootDoc("", t)));
  ok(!q.warn && Math.abs(q.lat - lat) < 1e-6 && Math.abs(q.h - h) < 1e-3, "the Forum: no warning, the place read back");
  eq(D.position(JSON.parse(rootDoc("", null))).kind, "local", "no transform: a local frame");
}

// ── «Attacca all'epoca» ──────────────────────────────────────────────────────
{
  const g = { nodes: [{ id: "ep1", node_type: "EpochNode", name: "Età augustea", data: {} }], edges: [] };
  let batches = 0;
  const pg = D.plainGraph(g);
  const counted = { ...pg, batch: (fn) => { batches++; return pg.batch(fn); } };
  let k = 0;
  const out = D.attachTileset(counted, { name: "Basilica", epochId: "ep1", locator: "../RM/Basilica.3tz", packaging: "archive", sizeBytes: 1035736079 }, () => `rm${++k}`);
  const rm = g.nodes.find((n) => n.id === out.rmId);
  const res = g.nodes.find((n) => n.id === out.resourceId);
  ok(rm?.node_type === "representation_model" && rm.data.is_tileset === true && rm.data.url === "../RM/Basilica.3tz", "the RM, as EM Tools' Add Cesium Tileset");
  ok(res?.node_type === "resource" && res.data.url === "../RM/Basilica.3tz" && res.data.packaging === "archive", "…its resource");
  ok(g.edges.some((e) => e.edge_type === "has_representation_model" && e.source === "ep1" && e.target === out.rmId),
    "…in the epoch, the canonical way: epoch → has_representation_model → RM (MICRO-SOTTOFASI-E-TILESET-TEMPLU)");
  ok(!g.edges.some((e) => e.edge_type === "has_first_epoch"), "…and no has_first_epoch of the RM's own");
  ok(g.edges.some((e) => e.edge_type === "has_linked_resource" && e.source === out.rmId && e.target === out.resourceId), "…linked to its resource");
  ok(batches >= 1 && g.nodes.length === 3, "…in one batch (one step of undo in the store)");
  ok(!res.data.checksum && !res.data.residency, "no digest given: none written (the Space will say «declared, file missing»)");
}
// MICRO-SOTTOFASI-E-TILESET-TEMPLU · with the archive's sha256 the resource is
// resident, and the Space (s3Dgraphy is_resident) fetches it
{
  const g = { nodes: [{ id: "e13", node_type: "EpochNode", name: "2013", data: {} }], edges: [] };
  const ck = "sha256:" + "ab".repeat(32) + "";
  const out = D.attachTileset(D.plainGraph(g), { name: "TempluMare_2013_egm2008", epochId: "e13", locator: "../RB/cesium/TempluMare_2013_egm2008.3tz",
    packaging: "archive", sizeBytes: 6576593070, checksum: ck }, () => "rm13");
  const res = g.nodes.find((n) => n.id === out.resourceId);
  ok(res.data.checksum === ck && res.data.residency === "resident" && res.data.size_bytes === 6576593070, "a digest: checksum and residency resident on the resource");
  const S = await load(`export { buildSpace } from "./space"; export { isStratigraphicType } from "./rules";`);
  const sp = S.buildSpace({ graph: g }, { isUnit: S.isStratigraphicType });
  eq(sp.summary("e13").rms.map((r) => [r.id, r.resource?.state, r.resource?.tiles]), [["rm13", "resident", "3tz"]], "…and the Space draws it: resident, a .3tz");
  const g2 = { nodes: [{ id: "e13", node_type: "EpochNode", name: "2013", data: {} }], edges: [] };
  D.attachTileset(D.plainGraph(g2), { name: "T", epochId: "e13", locator: "../RB/cesium/T.3tz", packaging: "archive" }, () => "rmX");
  eq(S.buildSpace({ graph: g2 }, { isUnit: S.isStratigraphicType }).summary("e13").rms.map((r) => r.resource?.state), ["missing"],
    "…without a digest it is «missing» (the bug of 7 Nov: counted, never drawn)");
  const g3 = { nodes: [{ id: "e", node_type: "EpochNode", name: "e", data: {} }], edges: [] };
  const o3 = D.attachTileset(D.plainGraph(g3), { name: "F", epochId: "e", locator: "../RB/F/tileset.json", packaging: "directory", checksum: ck }, () => "rmF");
  ok(g3.nodes.find((n) => n.id === o3.resourceId).data.checksum_of === "entry-point", "a folder: the digest is its tileset.json's (checksum_of entry-point)");
  eq(D.attachDigestPath({ dropped: "/a/x.3tz", archive: "/a/x.3tz" }, "archive"), "/a/x.3tz", "the file hashed: the archive");
  eq(D.attachDigestPath({ dropped: "/a/X", folder: "/a/X" }, "directory"), "/a/X/tileset.json", "…a folder's tileset.json");
  eq(D.attachDigestPath(null, "archive"), null, "…nothing without a path (a drop from the system)");
}

// ── «Attacca all'epoca» from a preview: the TRUE frame (MICRO-ANTEPRIMA-AGGANCIATA) ──
// E.D., 7 Nov 2026: two surveys in true ECEF attached from their previews stayed
// on the origin, each centred on its own volume. The model is placed by the
// bridge (`/geo/tileset-frame`, frame EPSG:4978 → `em_gis.relocate_true_ecef`),
// never where the preview was centred «for the view only». The app's sidecar is
// frozen WITHOUT numpy (build-bridge.sh): the fit is computed here with numpy
// blocked, as the frozen bridge computes it — and against numpy's when it is here.
// (The page's half — the preview closed, the model framed, its loading handed
// over, the Log when the bridge refuses — is TD8.attach / TD8.refused in
// check-interactions: `node scripts/suite-bench.mjs TD8.attach TD8.refused`.)
{
  const TOOLS = new URL("../../tools/", import.meta.url).pathname;
  const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
  const PY = [`${S3D}.venv/bin/python`, "python3"].find((p) => p === "python3" || existsSync(p));
  const py = `
import json, math, sys
sys.path[:0] = [${JSON.stringify(TOOLS)}, ${JSON.stringify(S3D + "src")}]
try:
    import numpy as np
    from s3dgraphy.geometry.frame import _fit_affine as numpy_fit
except ImportError:
    numpy_fit = None
sys.modules["numpy"] = None          # the frozen sidecar: no numpy
import em_gis
from s3dgraphy.geometry import frame as F
lon, lat, h = math.radians(22.787762), math.radians(45.515966), 521.557
a, f = 6378137.0, 1 / 298.257223563; e2 = f * (2 - f); n = a / math.sqrt(1 - e2 * math.sin(lat) ** 2)
x, y, z = (n + h) * math.cos(lat) * math.cos(lon), (n + h) * math.cos(lat) * math.sin(lon), (n * (1 - e2) + h) * math.sin(lat)
E = [-math.sin(lon), math.cos(lon), 0.0]; N = [-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)]
U = [math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)]
T = [*E, 0, *N, 0, *U, 0, x, y, z, 1]
bv = {"box": [2, 2, 0.3, 2, 0, 0, 0, 2, 0, 0, 0, 0.3]}
target = {"crs": "EPSG:3844", "shift": [327372.56, 448682.65, 0]}
out = {"ecef": em_gis.relocate_true_ecef(T, bv, target)}
em_gis.lend_fit()
out["shifted"] = F.relocate_transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 6378137, 0, 0, 1], {"crs": "EPSG:32633", "shift": [400000, 4600000, 0]},
                                      bounding_volume={"box": [0, 0, 0, 20, 0, 0, 0, 20, 0, 0, 0, 5]})
pts = F.volume_points({"box": [3, -4, 1, 40, 0, 0, 0, 25, 0, 0, 0, 0]}, 3)          # a flat volume: numpy's minimum norm
dst = [[0.3 * p[0] - 0.9 * p[1] + 4127760.9, 0.9 * p[0] + 0.3 * p[1] + 1734113.5, p[2] + 4528084.8] for p in pts]
mine = em_gis.fit_affine(pts, dst)
if numpy_fit is not None:
    sys.modules["numpy"] = np        # numpy back, for its own answer only
out["vs_numpy"] = None if numpy_fit is None else max(abs(u - v) for r1, r2 in zip(mine, numpy_fit(pts, dst)) for u, v in zip(r1, r2))
print(json.dumps(out))
`;
  let out = null;
  try { out = JSON.parse(execFileSync(PY, ["-c", py], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").pop()); }
  catch (e) { console.log(`· the bridge's relocation: not run here (${String(e.message ?? e).split("\n")[0]})`); }
  if (out) {
    const r = out.ecef;
    ok(r.ok && r.transform?.length === 16, `numpy blocked: a true ECEF root still placed (${r.error ?? "ok"})`);
    ok(r.residual_max_m < 0.01, `…the fit within a centimetre (${r.residual_max_m})`);
    // the root's origin in three's frame: the preview's centring puts it at Rx(−90°)·W⁻¹·W·0 = 0;
    // the true frame at Rx(−90°)·A·0 = (tx, tz, −ty)
    const truePos = [r.transform[12], r.transform[14], -r.transform[13]];
    ok(Math.abs(truePos[0] + 56) < 1 && Math.abs(truePos[2] - 46.5) < 1, `…56 m west, 46.5 m south of the study's origin (${truePos.map((v) => v.toFixed(2))})`);
    ok(Math.hypot(truePos[0], truePos[2]) > 40, "…no trace of the preview's centre (the origin)");
    ok(out.shifted.ok, `numpy blocked: shifted coordinates in a CRS relocated too (relocate_transform with the lent fit: ${out.shifted.error ?? "ok"})`);
    if (out.vs_numpy !== null) ok(out.vs_numpy < 1e-6, `…the fit without numpy = numpy's lstsq, a flat volume included (${out.vs_numpy.toExponential(1)})`);
  }
  const build = readFileSync(new URL("../../apps/desktop/build-bridge.sh", import.meta.url), "utf8");
  ok(/check-bridge\.sh/.test(build), "build-bridge.sh asks the FROZEN bridge the geo routes (check-bridge.sh): no release without them");
}

// ── the Basilica, read only ──────────────────────────────────────────────────
const BAS = process.env.BASILICA_DIR ?? `${homedir()}/Desktop/BasilicaTSL_cesium`;
const FIXED = process.env.BASILICA_FIXED ?? `${homedir()}/Desktop/BasilicaTLS_tileset.zip`;
if (existsSync(`${BAS}/tileset_Basilica_TLS_ED.json`)) {
  const files = [];
  const walk = async (abs, rel) => {
    for (const n of readdirSync(abs).sort()) {
      if (n === ".DS_Store") continue;
      const st = statSync(`${abs}/${n}`);
      if (st.isDirectory()) await walk(`${abs}/${n}`, `${rel}${n}/`);
      else files.push({ path: `${rel}${n}`, blob: await openAsBlob(`${abs}/${n}`) });
    }
  };
  const t0 = performance.now();
  files.push({ path: "tileset_Basilica_TLS_ED.json", blob: await openAsBlob(`${BAS}/tileset_Basilica_TLS_ED.json`) });
  await walk(`${BAS}/tileset_Basilica_TLS_ED`, "tileset_Basilica_TLS_ED/");
  const d = await D.treeOfDrop(files);
  const r = await D.recognise(d.tree, d.label, d.zipped);
  eq([r.form, r.name], ["pair", "tileset_Basilica_TLS_ED"], "the Basilica, X.json + X/ dropped: the RealityScan pair");
  const s = D.servedSource(d.tree, r, true);
  const doc = JSON.parse(txt(await s.readEntry("tileset.json")));
  const first = await s.readEntry(doc.root.content.url);
  console.log(`· Basilica pair: ${files.length} files, ${r.says}; root tile ${doc.root.content.url} ${first?.length} B, ${Math.round(performance.now() - t0)} ms`);
  ok(first && first.length > 1000, "…its root tile served");
  const inflated = await D.gunzipIfGzip(first);
  eq([first[0], first[1]], [0x1f, 0x8b], "…RealityScan's tile is GZIPPED on disk (for a server that says so)");
  eq(txt(inflated.subarray(0, 4)), "b3dm", "…inflated by the plugin's road: a b3dm");
  const p = D.position(r.root);
  console.log(`· ${p.line}`);
  ok(p.warn, "…the position line warns");
  const z0 = performance.now();
  const ar = await D.treeOfDrop([{ path: "Archivio.zip", blob: await openAsBlob(`${BAS}/Archivio.zip`) }]);
  const ra = await D.recognise(ar.tree, ar.label, ar.zipped);
  console.log(`· Archivio.zip: ${ra.form} in ${Math.round(performance.now() - z0)} ms — ${ra.says}`);
  ok(["zip_pair", "zip_no_root"].includes(ra.form), "Archivio.zip recognised (its root inside or beside)");
} else console.log(`· ${BAS}: not here, the Basilica's pair skipped`);
if (existsSync(FIXED)) {
  const z0 = performance.now();
  const d = await D.treeOfDrop([{ path: "BasilicaTLS_tileset.zip", blob: await openAsBlob(FIXED) }]);
  const r = await D.recognise(d.tree, d.label, d.zipped);
  const s = D.servedSource(d.tree, r, true);
  const doc = JSON.parse(txt(await s.readEntry("tileset.json")));
  const tile = await s.readEntry(doc.root.content.url);
  console.log(`· BasilicaTLS_tileset.zip (${(statSync(FIXED).size / 2 ** 20).toFixed(0)} MB): ${r.form}, root tile ${tile?.length} B in ${Math.round(performance.now() - z0)} ms`);
  eq(r.form, "package", "E.D.'s fixed zip: a package (a plain zip, no 3tz index)");
} else console.log(`· ${FIXED}: not here, skipped`);

console.log(`check-tileset-drop: ${checks - fails.length}/${checks}`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
