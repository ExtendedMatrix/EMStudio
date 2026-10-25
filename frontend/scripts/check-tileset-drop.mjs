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
import { existsSync, mkdtempSync, openAsBlob, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (what) => {
  const b = await esbuild.build({ stdin: { contents: what, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const D = await load(`export * from "./tileset-drop"; export { plainGraph } from "./resources";
  export { blobSource, ZipArchive, gunzipIfGzip } from "./tiles3tz";`);

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
} else console.log("· 3DSC's archive_3tz.py not beside: the canonical .3tz case skipped");

{
  const gz = new Uint8Array(execFileSync("python3", ["-I", "-c", "import gzip,sys;sys.stdout.buffer.write(gzip.compress(b'b3dm-plain'))"]));
  eq(txt(await D.gunzipIfGzip(gz)), "b3dm-plain", "a gzipped tile inflated");
  eq(txt(await D.gunzipIfGzip(new TextEncoder().encode("b3dm"))), "b3dm", "…a plain one left as it is");
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
  ok(g.edges.some((e) => e.edge_type === "has_first_epoch" && e.source === out.rmId && e.target === "ep1"), "…in the epoch");
  ok(g.edges.some((e) => e.edge_type === "has_linked_resource" && e.source === out.rmId && e.target === out.resourceId), "…linked to its resource");
  ok(batches >= 1 && g.nodes.length === 3, "…in one batch (one step of undo in the store)");
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
