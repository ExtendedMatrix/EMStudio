// NIGHT-RISORSA-FILE · parte 4 · executable check of «Impacchetta un tileset in
// .3tz» and of the two forms of one content.
//
//   node scripts/check-pack3tz.mjs
//
//   · the writer (`tools/archive_3tz.py`) is 3D Survey Collection's, byte for byte;
//   · dtcstamp's conformance cases 20 and 23 («EVERY WRITER reproduces this case
//     byte for byte»): the tree materialised, packed, the sha256 and the
//     content_digest the case pins — 23 also from the folder written in NFD;
//   · the same through the bridge's route (`BRIDGE`, default :8791), and
//     TempluMare's tileset → `232dfcbc…`, 3DSC's digest;
//   · the graph: the folder and the archive are two forms of one content.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = new URL("../", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const SRC = `${HERE}src/`;
const CONF = process.env.DTCSTAMP_CONFORMANCE ?? new URL("../../../dtcstamp/conformance/", import.meta.url).pathname;
const DSC = process.env.DSC_ARCHIVE ?? new URL("../../../3D-survey-collection/cesium_exporter/archive_3tz.py", import.meta.url).pathname;
const REPORT_FS = process.env.FS_ROOT ?? new URL("../../.claude/wip/reports/2026-10-22-risorsa-file/fs", import.meta.url).pathname;
const BRIDGE = process.env.BRIDGE ?? "http://localhost:8791";

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};
const sha = (b) => "sha256:" + createHash("sha256").update(b).digest("hex");

// ── the writer is 3DSC's ────────────────────────────────────────────────────
const PINNED = "sha256:518ca8ffc1c487e2bf6a00828fcbad33df70a1d4fa09eebc201f9be8dc4d7752";
eq(sha(readFileSync(`${TOOLS}archive_3tz.py`)), PINNED, "tools/archive_3tz.py is the pinned copy (3DSC 11b2ecb)");
if (existsSync(DSC)) eq(sha(readFileSync(DSC)), sha(readFileSync(`${TOOLS}archive_3tz.py`)),
  "…and it is byte for byte 3D Survey Collection's own (a change there is a change here)");

/** a case's tree into a folder; `form` NFC or NFD for the names */
function materialise(c, dir, form = "NFC") {
  rmSync(dir, { recursive: true, force: true });
  for (const [name, f] of Object.entries(c.tree.files)) {
    const path = `${dir}/${name.normalize(form)}`;
    mkdirSync(path.replace(/\/[^/]*$/, ""), { recursive: true });
    writeFileSync(path, f.base64 !== undefined ? Buffer.from(f.base64, "base64") : Buffer.from(f.text, "utf8"));
  }
}
function pack(dir, out) {
  const r = execFileSync("python3", ["-c", `
import sys, json
sys.path.insert(0, sys.argv[1])
import archive_3tz
r = archive_3tz.write_3tz(sys.argv[2], sys.argv[3])
print(json.dumps({"sha256": "sha256:" + r["sha256"], "content_digest": r["content_digest"]["digest"], "files": r["content_digest"]["files"]}))`,
    TOOLS, dir, out]);
  return JSON.parse(r.toString());
}

// ── the conformance cases ───────────────────────────────────────────────────
const TMP = `${tmpdir()}/emstudio-pack3tz-${process.pid}`;
for (const [file, forms] of [["20-tileset-folder-and-3tz.json", ["NFC"]], ["23-tileset-non-ascii-name.json", ["NFC", "NFD"]]]) {
  if (!existsSync(CONF + file)) { console.log(`  (skipped: ${CONF}${file})`); continue; }
  const c = JSON.parse(readFileSync(CONF + file, "utf8"));
  for (const form of forms) {
    const dir = `${TMP}/${file.slice(0, 2)}-${form}/tileset`;
    materialise(c, dir, form);
    const got = pack(dir, `${dir}.3tz`);
    eq([got.sha256, got.content_digest, got.files], [c.expect.archive_sha256, c.expect.content_digest, c.expect.files],
      `case ${file.slice(0, 2)} (${form} on disk): EMStudio's writer gives the case's sha256 and content_digest`);
  }
}

// ── through the bridge ──────────────────────────────────────────────────────
let up = false;
try { up = (await fetch(`${BRIDGE}/health`)).ok; } catch { /* not here */ }
const post = (route, body) => fetch(`${BRIDGE}${route}`, { method: "POST",
  headers: { "content-type": "application/json", origin: "http://localhost:5231" }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
if (up && existsSync(REPORT_FS)) {
  const c20 = JSON.parse(readFileSync(CONF + "20-tileset-folder-and-3tz.json", "utf8"));
  const dir = `${REPORT_FS}/pack-test/conf20/tileset`;
  materialise(c20, dir);
  rmSync(`${dir}.3tz`, { force: true });
  const a = await post("/fs/pack-3tz", { folder: dir });
  eq([a.status, a.body?.state, a.body?.sha256, a.body?.content_digest?.digest, a.body?.canonical?.canonical],
    [200, "written", c20.expect.archive_sha256, c20.expect.content_digest, true],
    "the bridge's route: case 20 written beside its folder, canonical by dtcstamp");
  const b = await post("/fs/pack-3tz", { folder: dir });
  eq([b.status, b.body?.state], [200, "same"], "…packed again: «already there, the same bytes», nothing rewritten");
  writeFileSync(`${dir}/tileset.json`, "{\"asset\":{\"version\":\"1.0\"},\"changed\":1}");
  const d = await post("/fs/pack-3tz", { folder: dir });
  ok(d.status === 409 && /not overwritten/.test(JSON.stringify(d.body)), "…the folder changed: the old archive is not overwritten (409)");
  const nt = await post("/fs/pack-3tz", { folder: `${REPORT_FS}/vuota` });
  eq(nt.status, 400, "a folder without tileset.json is not a tileset");
  // TempluMare, into a fresh copy (APFS clone) so the archive is really written
  const tm = `${REPORT_FS}/base/RM/TempluMare_cesium`;
  if (existsSync(tm)) {
    const copy = `${REPORT_FS}/pack-test/TempluMare_cesium`;
    rmSync(copy, { recursive: true, force: true }); rmSync(`${copy}.3tz`, { force: true });
    execFileSync("cp", ["-cR", tm, copy]);
    const t0 = Date.now();
    const r = await post("/fs/pack-3tz", { folder: copy });
    const ms = Date.now() - t0;
    eq([r.body?.state, r.body?.sha256, r.body?.content_digest?.digest, r.body?.content_digest?.files, r.body?.canonical?.canonical],
      ["written", "sha256:232dfcbc148f30e52098fef9c83606a3e1638a106fc0678563e909cde1db0c17",
       "sha256:8aa6fbd3e5847e9f8c2e219fb4305d9a3ad52e41135120e79bb8c3d18b67caed", 7302, true],
      `TempluMare_cesium packed by EMStudio: 3DSC's sha256 (232dfcbc…) and content_digest (${ms} ms, ${r.body?.seconds} s in the writer)`);
    console.log(`  TempluMare: ${r.body?.bytes} B, ${r.body?.entries} entries, ${r.body?.seconds} s in the writer, ${ms} ms round trip`);
  }
} else console.log(`  (skipped: no bridge at ${BRIDGE})`);

// ── the graph: two forms of one content ─────────────────────────────────────
{
  const bundle = await esbuild.build({ stdin: { contents: `export * from "./pack3tz"; export * from "./resources";`,
    resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false });
  const P = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
  const G = { nodes: [], edges: [] };
  const g = P.plainGraph(G);
  // the folder was already in the graph (the _link form EMtools writes)
  P.addResource(g, { resourceId: "ts_link", name: "TempluMare_cesium", packaging: "directory",
    files: [{ path: "RM/TempluMare_cesium/tileset.json" }] });
  const out = { ok: true, path: "RM/TempluMare_cesium.3tz", bytes: 199378562,
    sha256: "sha256:232dfcbc148f30e52098fef9c83606a3e1638a106fc0678563e909cde1db0c17",
    content_digest: { digest: "sha256:8aa6fbd3e5847e9f8c2e219fb4305d9a3ad52e41135120e79bb8c3d18b67caed", files: 7302, computed_by: "producer" } };
  const ids = P.landPack(g, "RM/TempluMare_cesium", out, { folder: "TempluMare_cesium", archive: "TempluMare_cesium.3tz" });
  eq(ids.folderId, "ts_link", "the folder already in the graph is found by its url, not made twice");
  const arch = G.nodes.find((n) => n.id === ids.archiveId);
  eq([arch.data.packaging, arch.data.checksum, arch.data.url], ["archive", out.sha256, out.path], "the archive: packaging archive, its sha256, its path");
  eq(P.formsOf(g, "ts_link").map((n) => n.id), ["ts_link", ids.archiveId], "the two FORMS: recognised by their equal content_digest");
  const f = P.foldForms(G.nodes, G.edges, new Set());
  eq([f.nodes.length, f.forms.get("ts_link")], [1, 2], "the drawing: ONE resource, «2 forme», the folder standing for both");
  eq(P.foldForms(G.nodes, G.edges, new Set(["ts_link"])).nodes.length, 2, "…opened: both forms");
  eq(P.pickRepresentation(g, "ts_link", ["archive"]).picked?.id, ids.archiveId, "a reader that opens archives is handed the .3tz from the folder");
  P.landPack(g, "RM/TempluMare_cesium", out, { folder: "x", archive: "y" });
  eq(G.nodes.length, 2, "packing again changes nothing in the graph");
}

rmSync(TMP, { recursive: true, force: true });
if (fails.length) {
  console.error(fails.map((f) => `  ✗ ${f}`).join("\n"));
  console.error(`pack3tz: ${fails.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`pack3tz: ${checks} checks passed`);
