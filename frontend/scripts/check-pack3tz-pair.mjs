// MICRO-SEG03 (20 Nov 2026) · «a me serve solo la trasformazione»: a tileset
// in the RealityScan form (X.json beside X/) packed into a .3tz from Files,
// with no study open — the same file, byte for byte, as 3D Survey Collection.
//
//   node scripts/check-pack3tz-pair.mjs
//
//   · the rule: `tilesetSourcesIn` / `tilesetSourceOfJson` (pack3tz.ts) answer
//     what 3DSC's `cesium_exporter/archive_3tz.find_tileset_source` answers on
//     its four shapes (a tileset.json folder, X/ with X.json beside it, X.json
//     itself, the folder holding one pair); where 3DSC refuses two pairs in a
//     folder, the page lists both, by name;
//   · the bytes: one pair of proof (nested folders, a non-ASCII name, a
//     .DS_Store left out) packed by 3DSC (`find_tileset_source` +
//     `stage_tileset_pair` + `write_3tz`) and by a bridge of this tree
//     (`POST /fs/pack-3tz {folder, root}`, and the job `pack3tz` the page
//     starts): the same sha256 and content digest; the originals untouched, no
//     staging folder left beside them.
//
// Self-contained: a bridge of its own on a free port, a folder of its own in
// the system's temp. 3DSC is read from ../../3D-survey-collection (DSC_ARCHIVE),
// dtcstamp from ../../dtcstamp (DTCSTAMP_DIR).
import * as esbuild from "esbuild";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

const FE = new URL("..", import.meta.url).pathname;
const ROOT = new URL("../..", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? path.join(ROOT, "../s3Dgraphy");
const DTC = process.env.DTCSTAMP_DIR ?? path.join(ROOT, "../dtcstamp");
const DSC = process.env.DSC_ARCHIVE ?? path.join(ROOT, "../3D-survey-collection/cesium_exporter/archive_3tz.py");
const PY = process.env.PYTHON ?? path.join(S3D, ".venv/bin/python");

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${what}\n      got  ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); };
const sha = (file) => "sha256:" + createHash("sha256").update(fs.readFileSync(file)).digest("hex");

for (const [p, what] of [[PY, "the s3Dgraphy venv"], [DSC, "3DSC's archive_3tz.py"], [path.join(DTC, "dtcstamp.py"), "dtcstamp"]])
  if (!fs.existsSync(p)) { console.log(`check-pack3tz-pair: skipped (no ${what} at ${p})`); process.exit(0); }
const PYENV = { ...process.env, PYTHONPATH: `${DTC}${path.delimiter}${process.env.PYTHONPATH ?? ""}` };

// ── the bench: a pair of proof, and the other shapes ────────────────────────
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pack3tz-pair-")));
const put = (rel, body) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
const tile = (n) => Buffer.concat([Buffer.from("b3dm"), Buffer.alloc(24 + n * 7, n)]);
function pair(where, x) {
  const root = { asset: { version: "1.0", generator: "RealityScan 2.0" }, geometricError: 100,
    root: { boundingVolume: { box: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10] }, geometricError: 50, refine: "REPLACE",
      content: { uri: `${x}/Geometry/0/tile_0.b3dm` },
      children: [1, 2, 3].map((i) => ({ boundingVolume: { box: [i, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5] }, geometricError: 0,
        content: { uri: `${x}/Geometry/${i}/tile_${i}.b3dm` } })) } };
  put(`${where}/${x}.json`, JSON.stringify(root, null, 1));
  for (const i of [0, 1, 2, 3]) put(`${where}/${x}/Geometry/${i}/tile_${i}.b3dm`, tile(i));
  put(`${where}/${x}/Textures/città.jpg`, Buffer.alloc(300, 7));   // a non-ASCII name
  put(`${where}/${x}/.DS_Store`, Buffer.from("finder"));            // left out by both writers
}
pair("rs", "Templu");                               // X/ with X.json beside it; also «the folder holding one pair»
pair("two", "Nord"); pair("two", "Sud");             // a folder holding two pairs
put("plain/tileset.json", JSON.stringify({ asset: { version: "1.0" }, geometricError: 1, root: { geometricError: 0, boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] } } }));
fs.mkdirSync(path.join(dir, "empty"));

// ── the rule: the page's and 3DSC's ──────────────────────────────────────────
const bundle = await esbuild.build({ stdin: { contents: `export * from "./pack3tz";`, resolveDir: path.join(FE, "src"), loader: "ts" },
  bundle: true, format: "esm", write: false });
const P = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const dsc = (p) => JSON.parse(execFileSync(PY, ["-c", `
import sys, json, importlib.util
spec = importlib.util.spec_from_file_location("archive_3tz", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
try: print(json.dumps(list(m.find_tileset_source(sys.argv[2]))))
except ValueError as e: print(json.dumps({"error": str(e)}))`, DSC, p], { env: PYENV }).toString());
const listing = (p) => fs.readdirSync(p, { withFileTypes: true })
  .map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file", path: path.join(p, e.name) }));
const page = (p) => {
  if (fs.statSync(p).isFile()) { const s = P.tilesetSourceOfJson(p, fs.existsSync(p.slice(0, -5))); return s ? [s] : []; }
  return P.tilesetSourcesIn(p, listing(p), fs.existsSync(`${p}.json`) && fs.statSync(`${p}.json`).isFile());
};
const asDsc = (s) => [s.folder, s.root, s.out];
for (const [rel, what] of [["plain", "a folder with tileset.json at its root"], ["rs/Templu", "the folder X/ of the RealityScan form"],
    ["rs/Templu.json", "the X.json of the pair, chosen as a file"], ["rs", "the folder holding one pair"]]) {
  const p = path.join(dir, rel);
  const mine = page(p);
  eq(mine.map(asDsc), [dsc(p)], `rule · ${what}: the page answers what 3DSC's find_tileset_source answers`);
}
{
  const p = path.join(dir, "two");
  const mine = page(p);
  ok(/2 tilesets in the RealityScan form/.test(dsc(p).error ?? ""), "rule · two pairs in one folder: 3DSC refuses («choose one of their folders»)…");
  eq(mine.map((s) => [s.name, ...asDsc(s)]), ["Nord", "Sud"].map((x) => [x, ...dsc(path.join(dir, "two", x))]),
    "…the page answers each, by its name, as 3DSC answers each folder");
  const e = path.join(dir, "empty");
  ok(page(e).length === 0 && !!dsc(e).error, "rule · an empty folder: not a tileset for either");
}
eq(P.folderParentOf("sha256:0123456789abcdef0123456789abcdef"), { resource_id: "res:0123456789abcdef", digest: "sha256:0123456789abcdef0123456789abcdef" },
  "the parent of a .3tz whose folder has no stamp: 3DSC's _folder_parent (res: + 16 hex of the content digest, the digest)");

// ── the bytes: 3DSC, then the bridge ─────────────────────────────────────────
const snapshot = (p) => fs.readdirSync(p, { recursive: true }).sort().map((f) => {
  const q = path.join(p, f); return fs.statSync(q).isFile() ? `${f}:${sha(q)}` : f; });
const before = snapshot(path.join(dir, "rs"));
const out3dsc = path.join(dir, "dsc", "Templu.3tz");
fs.mkdirSync(path.dirname(out3dsc), { recursive: true });
const d = JSON.parse(execFileSync(PY, ["-c", `
import sys, json, shutil, importlib.util
spec = importlib.util.spec_from_file_location("archive_3tz", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
folder, root, out = m.find_tileset_source(sys.argv[2])
stage = m.stage_tileset_pair(root, folder)
try: r = m.write_3tz(stage, sys.argv[3])
finally: shutil.rmtree(stage, ignore_errors=True)
print(json.dumps({"sha256": "sha256:" + str(r["sha256"]).split(":")[-1], "cd": r["content_digest"]["digest"], "files": r["content_digest"]["files"]}))`,
  DSC, path.join(dir, "rs"), out3dsc], { env: PYENV }).toString());
ok(d.sha256 === sha(out3dsc), "3DSC wrote its .3tz of the pair (find_tileset_source → stage_tileset_pair → write_3tz)");
eq(d.files, 6, "…the six files of the pair (the root as tileset.json, four tiles, one texture; .DS_Store left out)");

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const bport = await freePort();
const bridge = spawn(PY, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(bport), "--fs-root", dir, "--s3dgraphy", path.join(S3D, "src")],
  { env: { ...PYENV, EM_BRIDGE_STATE_DIR: path.join(dir, ".state") }, stdio: ["ignore", "ignore", "pipe"] });
let berr = "";
bridge.stderr.on("data", (c) => { berr += c; });
const B = `http://127.0.0.1:${bport}`;
const post = (route, body) => fetch(`${B}${route}`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:5173" },
  body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }
  const folder = path.join(dir, "rs", "Templu"), root = `${folder}.json`, target = `${folder}.3tz`;
  const a = await post("/fs/pack-3tz", { folder, root });
  eq([a.status, a.body?.state, a.body?.path, a.body?.sha256, a.body?.content_digest?.digest, a.body?.canonical?.canonical],
    [200, "written", target, d.sha256, d.cd, true],
    "the bridge (POST /fs/pack-3tz {folder, root}): X.3tz beside the pair, 3DSC's sha256 and content digest, canonical by dtcstamp");
  ok(fs.existsSync(target) && sha(target) === sha(out3dsc), "…the two files byte for byte (sha256 of the files on disk)");
  const again = await post("/fs/pack-3tz", { folder, root });
  eq([again.status, again.body?.state], [200, "same"], "…packed again: «already there, the same bytes»");
  // the job the page starts (bridge level 43): {kind: pack3tz, folder, root}
  fs.unlinkSync(target);
  const j = await post("/jobs", { kind: "pack3tz", folder, root });
  let end = null;
  for (let i = 0; i < 200 && j.body?.job; i++) {
    const r = await fetch(`${B}/jobs`).then((x) => x.json()).catch(() => null);
    end = (r?.jobs ?? []).find((x) => x.id === j.body.job && /done|failed|cancelled/.test(x.state));
    if (end) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  eq([j.status, end?.state, end?.result?.sha256], [202, "done", d.sha256], "the job pack3tz with root (what Files starts): the same sha256");
  const after = snapshot(path.join(dir, "rs")).filter((f) => !/^Templu\.3tz/.test(f));
  eq(after, before, "the originals untouched, no staging folder left beside the pair");
} finally {
  bridge.kill();
}
if (/Traceback/.test(berr)) console.log(berr.split("\n").filter((l) => /Error|Traceback/.test(l)).slice(0, 8).join("\n"));
if (!process.env.KEEP_BENCH) fs.rmSync(dir, { recursive: true, force: true });
if (fails.length) {
  console.log(`check-pack3tz-pair: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-pack3tz-pair: ${checks} checks passed (3DSC ${d.sha256.slice(0, 19)}…)`);
