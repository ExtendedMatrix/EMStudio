// MICRO-OTTIMIZZA-2 · a tileset from a textured mesh, the bridge's side (level
// 44): Obj2Tiles and Cesium's validator as ADD-ONS (pinned, licence said; on
// Apple Silicon the Osx64 build under Rosetta, said), `POST /fs/tileset` (the
// plan: the depth from the model's size, the memory each file asks, the
// ceiling, how many side by side; what RealityScan or Metashape already made),
// `POST /jobs {kind: tileset}` — one heavy job, its files in parallel under the
// ceiling, each with its row, its progress (Obj2Tiles' JSON lines, or the
// estimate by phases from the lines it prints today) and its cancel; the
// validator inside the job (a tileset that does not pass is not packed); the
// .3tz with the route that exists; a process that stalls killed.
//
//   node scripts/check-tileset-bridge.mjs
//   EM_OBJ2TILES=/path/to/Obj2Tiles O2T_OBJ=/path/to/model.obj …   (one real tileset too)
//
// Obj2Tiles is FAKED here (a small Python program that prints the lines of
// v1.8.0 and writes a tileset of one glb): the checks are about the bridge.
import { spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { cpus, tmpdir } from "node:os";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
if (!existsSync(PY)) {
  console.log("tileset bridge: no s3Dgraphy checkout with its venv — SKIPPED");
  process.exit(0);
}
const REAL = process.env.EM_OBJ2TILES && existsSync(process.env.EM_OBJ2TILES) ? process.env.EM_OBJ2TILES : "";
const REAL_OBJ = process.env.O2T_OBJ && existsSync(process.env.O2T_OBJ) ? process.env.O2T_OBJ : "";

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); else console.log(`  ✓ ${what}`); };
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
  const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = realpathSync(mkdtempSync(`${tmpdir()}/tileset-bridge-`));
const fsroot = `${dir}/fs`;
mkdirSync(`${fsroot}/RB/LOD1`, { recursive: true });

// the fake Obj2Tiles: «--help» says its version (and «--progress» when asked
// to); a run prints the phase lines of v1.8.0 (or JSON lines with --progress)
// and writes tileset.json + one glb. The input's NAME says how it behaves:
// «broken» → a tileset naming a content that is not there; «slow» → 30 s;
// «stall» → silent for 30 s; «par» → 1.5 s, its start and end written down.
const fake = `${dir}/Obj2Tiles`;
writeFileSync(fake, `#!/usr/bin/env python3
import json, os, sys, time
a = sys.argv[1:]
if "--help" in a:
    print("Obj2Tiles 1.8.0+fake")
    if os.environ.get("FAKE_PROGRESS"): print("  --progress   JSON progress lines")
    sys.exit(0)
src, out = a[-2], a[-1]
name = os.path.basename(src)
prog = "--progress" in a
log = os.environ.get("FAKE_LOG")
if log: open(log, "a").write(f"start {name} {time.time()}\\n")
if "stall" in name:
    time.sleep(30)
if "slow" in name:
    for i in range(300):
        print(f" ?> iteration {i}", flush=True); time.sleep(0.1)
print(" *** OBJ to Tiles ***", flush=True)
print(" => Decimation stage with 3 LODs", flush=True)
if prog: print(json.dumps({"stage": "decimation", "done": 1, "total": 3, "percent": 33.3}), flush=True)
print(" ?> Output: 10 vertices, 10 triangles (0.6 reduction; 0.1 sec)", flush=True)
print(" ?> Output: 5 vertices, 5 triangles (0.3 reduction; 0.1 sec)", flush=True)
if "par" in name: time.sleep(1.5)
print(" => Splitting stage with 0 divisions ", flush=True)
for k in range(1, 5):
    print(f" ?> [LOD-0-Mesh-{k}/4] Done in 5ms", flush=True)
    if prog: print(json.dumps({"stage": "splitting", "lod": 0, "done": k, "total": 4, "percent": 25 * k}), flush=True)
print(" => Tiling stage with auto-computed baseError (AverageEdgeLength)", flush=True)
print(" -> Converting to glb 'x.obj'", flush=True)
os.makedirs(os.path.join(out, "LOD-0"), exist_ok=True)
js = json.dumps({"asset": {"version": "1.1"}}).encode()
js += b" " * ((4 - len(js) % 4) % 4)
glb = b"glTF" + (2).to_bytes(4, "little") + (12 + 8 + len(js)).to_bytes(4, "little") + len(js).to_bytes(4, "little") + b"JSON" + js
open(os.path.join(out, "LOD-0", "Mesh.glb"), "wb").write(glb)
uri = "LOD-0/Missing.glb" if "broken" in name else "LOD-0/Mesh.glb"
json.dump({"asset": {"version": "1.1"}, "geometricError": 0.27, "root": {"boundingVolume": {"box": [0,0,0,1,0,0,0,1,0,0,0,1]},
    "geometricError": 0.27, "refine": "REPLACE", "children": [{"boundingVolume": {"box": [0,0,0,1,0,0,0,1,0,0,0,1]},
    "geometricError": 0, "content": {"uri": uri}}]}}, open(os.path.join(out, "tileset.json"), "w"))
print(" -> Generating tileset.json", flush=True)
if prog: print(json.dumps({"stage": "tiling", "done": 1, "total": 1, "percent": 100}), flush=True)
print(" => Pipeline completed in 00:00:01", flush=True)
print(" ?> Cleaning up ok", flush=True)
if prog: print(json.dumps({"stage": "done", "percent": 100}), flush=True)
if log: open(log, "a").write(f"end {name} {time.time()}\\n")
`);
chmodSync(fake, 0o755);

// textured OBJ: a quad, an mtl, a texture (bytes are what the plan reads)
const obj = (name, kb = 4) => {
  const p = `${fsroot}/RB/LOD1/${name}.obj`;
  const pad = "# " + "x".repeat(1022) + "\n";
  writeFileSync(p, `mtllib ${name}.mtl\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl m\nf 1/1 2/2 3/3\nf 1/1 3/3 4/4\n`
    + pad.repeat(kb));
  writeFileSync(`${fsroot}/RB/LOD1/${name}.mtl`, `newmtl m\nmap_Kd T_${name}.jpg\n`);
  writeFileSync(`${fsroot}/RB/LOD1/T_${name}.jpg`, Buffer.alloc(2048, 1));
  return p;
};

const start = async (envExtra) => {
  const port = await freePort();
  const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`,
                PATH: "/usr/bin:/bin", EM_OBJ2TILES: fake, EM_NODE: "/nonexistent", EM_TILES_VALIDATOR: "", ...envExtra };
  const proc = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", fsroot],
                     { env, stdio: ["ignore", "ignore", "inherit"] });
  const B = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { await fetch(`${B}/health`); break; } catch { await sleep(250); } }
  return { proc, B };
};
const call = (B) => ({
  post: async (route, body) => {
    const r = await fetch(`${B}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
                                            body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  },
  get: async (route) => { const r = await fetch(`${B}${route}`); return { status: r.status, j: await r.json().catch(() => ({})) }; },
});
const until = async (get, id, ms = 60000, seen) => {
  const t0 = Date.now();
  let v = {};
  while (Date.now() - t0 < ms) {
    v = (await get(`/jobs?id=${id}`)).j;
    if (seen) seen(v);
    if (!["queued", "running"].includes(v.state)) return v;
    await sleep(150);
  }
  return v;
};

let bridge;
try {
  const a = obj("OB_A"), b = obj("OB_B_par"), c = obj("OB_C_par"), broken = obj("OB_broken"), slow = obj("OB_slow");
  bridge = await start({});
  const { post, get } = call(bridge.B);
  const h = (await get("/health")).j;
  ok(h.bridge_level >= 44, `the bridge is at level 44 (${h.bridge_level})`);

  // ── the add-ons ──
  const ad = (await get("/addons")).j.addons ?? [];
  const o2t = ad.find((x) => x.id === "obj2tiles");
  ok(o2t && o2t.licence === "AGPL-3.0" && /zalmoxes-laran\/Obj2Tiles/.test(o2t.source) && o2t.project === "OpenDroneMap",
     "Obj2Tiles is an add-on: AGPL-3.0, its source E.D.'s fork, the credits OpenDroneMap's (MICRO-PREPARA-RITOCCHI p.6)");
  ok(o2t && o2t.version === "1.8.0-em.3" && /^[0-9a-f]{64}$/.test(o2t.sha256 ?? "") && /v1\.8\.0-em\.3\//.test(o2t.url ?? ""),
     "pinned at the fork's release 1.8.0-em.3 with its sha256");
  ok(o2t && /Apple Silicon/.test(o2t.build_note ?? "") && /#107/.test(o2t.pending ?? "") && /#108/.test(o2t.pending ?? ""),
     "the build said (1.8.0 + Apple Silicon + progress) and the way back to upstream (#107, #108)");
  if (o2t?.platform === "darwin-arm64") ok(!o2t.emulated && /OsxArm64/.test(o2t.url), "on Apple Silicon: the native OsxArm64 build, no Rosetta");
  const val = ad.find((x) => x.id === "tiles-validator");
  ok(val && val.licence === "Apache-2.0" && val.needs === "node" && /^sha512-/.test(val.sha256 ?? ""), "the validator is an add-on: Apache-2.0, a Node program, its integrity pinned");
  const nodeA = ad.find((x) => x.id === "node");
  ok(nodeA && nodeA.licence === "MIT" && /nodejs\.org\/dist\/v26\.13\.0\//.test(nodeA.url ?? "") && /^[0-9a-f]{64}$/.test(nodeA.sha256 ?? ""),
     "Node.js is an add-on of its own: MIT, nodejs.org's LTS 26.13.0, its sha256 (p.5)");
  ok(val && val.node === null && (nodeA?.available ? val.available === true && val.with_node === true && val.node_version === "26.13.0"
                                                    : val.available === false),
     "without a Node here the validator installs WITH Node.js (one gesture)");
  ok(["gltfpack", "obj2tiles", "tiles-validator", "node"].every((id) => (ad.find((x) => x.id === id)?.serves?.actions ?? []).length),
     "each add-on says the actions it serves (p.4)");

  // ── the plan ──
  const pl = (await post("/fs/tileset", { sources: [a, `${fsroot}/RB/LOD1`, `${fsroot}/nothing.obj`] })).j;
  ok(pl.ok && pl.tool?.path === fake && pl.tool.progress === false, "Obj2Tiles found (EM_OBJ2TILES), without --progress");
  const ia = pl.items?.find((i) => i.source === a);
  ok(ia && ia.folder === `${fsroot}/RB/LOD1/versions/OB_A@tiles` && ia.path === `${ia.folder}.3tz`,
     "each OBJ → <model>@tiles/ and <model>@tiles.3tz in its versions/ (s3Dgraphy's variant_path)");
  ok(ia && ia.lods === 1 && ia.divisions === 0 && ia.estimate_mb >= 300, "a small model: one level, no split; its memory said");
  ok(ia && /--preset standard --no-zsplit --lods 1 -d 0 --no-root-content --error-estimation-mode ToplevelBoundingBoxDiagonal/.test(ia.command), "our preset: standard, no z-split, the depth, no root content, the errors from the top level");
  ok((pl.items ?? []).filter((i) => i.source.endsWith(".obj") && !i.error).length >= 6, "a folder brings the OBJ at its top");
  ok((pl.items ?? []).some((i) => /nothing\.obj/.test(i.source) && i.error), "a file that is not there is refused in its row");
  ok(pl.ceiling_mb > 0 && pl.memory_mb >= pl.ceiling_mb && pl.workers >= 1, "the ceiling, the memory, the workers");
  ok(pl.validator?.name === "EMStudio structural check", "without the validator: the structural check, said");

  // ── recognition: RealityScan's pair, Metashape's blocks ──
  mkdirSync(`${fsroot}/RS/Model`, { recursive: true });
  writeFileSync(`${fsroot}/RS/Model.json`, JSON.stringify({ asset: { version: "1.0", generator: "RealityScan 2.0" }, root: {} }));
  mkdirSync(`${fsroot}/MS`, { recursive: true });
  writeFileSync(`${fsroot}/MS/block_x000_y000.obj`, "v 0 0 0\n");
  writeFileSync(`${fsroot}/MS/block_x001_y000.obj`, "v 0 0 0\n");
  writeFileSync(`${fsroot}/MS/metadata.xml`, "<ModelMetadata><SRS>EPSG:32635</SRS><SRSOrigin>500000,4800000,0</SRSOrigin></ModelMetadata>");
  const rc = (await post("/fs/tileset", { sources: [`${fsroot}/RS/Model`, `${fsroot}/MS`] })).j;
  const rs = rc.recognized?.find((r) => r.engine === "tileset");
  ok(rs && rs.software === "RealityScan" && rs.form === "pair", "RealityScan's tileset (X.json beside X/) recognised as theirs");
  const ms = rc.recognized?.find((r) => r.engine === "blocks");
  ok(ms && ms.blocks === 2 && ms.srs_origin === "500000,4800000,0", "Metashape + 3DSC's blocks recognised, with their SRSOrigin");

  // ── one tileset: estimate by phases, structural check, the .3tz ──
  const j1 = await post("/jobs", { kind: "tileset", sources: [a] });
  ok(j1.status === 202 && j1.j.job, "a tileset job starts (202)");
  const shares = [];
  const v1 = await until(get, j1.j.job, 60000, (v) => { if (v.items?.[0]) shares.push(v.items[0].progress); });
  ok(v1.state === "done" && v1.heavy === true, "it ends; it is a HEAVY job");
  const o1 = v1.result?.outputs?.[0];
  ok(o1?.state === "done" && existsSync(o1.path) && o1.sha256?.startsWith("sha256:"), "validated and packed: the .3tz with its sha256");
  ok(o1?.validation?.validator === "EMStudio structural check" && o1.validation.ok && o1.progress_estimated === true,
     "judged by the structural check; its progress estimated by phases");
  ok(o1?.facts?.geometric_error_m === 0.27 && o1.facts.files === 2, "the tileset's facts: files, root geometric error");
  ok(o1?.run?.seconds >= 0 && (o1.run.peak_mb === null || o1.run.peak_mb > 0), "its time and its peak memory");
  ok(o1?.pack?.content_digest && o1.pack.writer?.module === "dtcstamp.write_canonical_3tz", "packed by the route that exists (dtcstamp's writer)");
  ok(v1.items?.length === 1 && v1.items[0].state === "done", "its row");
  const again = await post("/jobs", { kind: "tileset", sources: [a] });
  ok(again.status === 400, "made again: nothing to make (the tileset exists)");

  // ── a tileset that does not pass is not packed ──
  const j2 = await post("/jobs", { kind: "tileset", sources: [broken] });
  const v2 = await until(get, j2.j.job);
  const o2 = v2.result?.outputs?.[0];
  ok(o2?.state === "invalid" && o2.validation?.errors >= 1 && !existsSync(o2.path), "does not pass the validator → no .3tz (it stays out of the graph)");
  ok(/missing/.test(o2?.error ?? ""), "and says why");
  const p2 = (await post("/fs/tileset", { sources: [broken] })).j;
  ok(/without its \.3tz/.test(p2.items?.[0]?.error ?? ""), "its folder stays to see why, and is never written over");

  // ── a batch: in parallel under the ceiling; one file cancelled ──
  const log = `${dir}/par.log`;
  bridge.proc.kill();
  bridge = await start({ FAKE_LOG: log });
  const c2 = call(bridge.B);
  const j3 = await c2.post("/jobs", { kind: "tileset", sources: [b, c, slow] });
  ok(j3.status === 202, "a batch of three starts");
  let cancelled = false;
  const v3 = await until(c2.get, j3.j.job, 60000, (v) => {
    const i = v.items?.findIndex((x) => /OB_slow/.test(x.source));
    if (!cancelled && i >= 0 && v.items[i].state === "running") { cancelled = true; void c2.post("/jobs", { step: "cancel", id: v.id, item: i }); }
  });
  const by = Object.fromEntries((v3.result?.outputs ?? []).map((o) => [o.name, o.state]));
  ok(v3.state === "done" && by["OB_B_par@tiles"] === "done" && by["OB_C_par@tiles"] === "done", "the batch ends with the others made");
  ok(by["OB_slow@tiles"] === "cancelled" && !existsSync(`${fsroot}/RB/LOD1/versions/OB_slow@tiles.3tz`)
     && !existsSync(`${fsroot}/RB/LOD1/versions/OB_slow@tiles`), "one file cancelled alone, nothing half-made left");
  if (cpus().length >= 8) {
    const t = {};
    for (const line of readFileSync(log, "utf8").trim().split("\n")) { const [w, n, s] = line.split(" "); (t[n] ??= {})[w] = Number(s); }
    const B1 = t["OB_B_par.obj"], C1 = t["OB_C_par.obj"];
    ok(B1 && C1 && B1.start < C1.end && C1.start < B1.end, "two files ran side by side (their estimates under the ceiling together)");
  }

  // ── the ceiling: a file that alone passes it is refused before it starts ──
  bridge.proc.kill();
  bridge = await start({ EM_TILES_MEMORY_MB: "420" });
  const c3 = call(bridge.B);
  const big = obj("OB_big", 2048);
  const p4 = (await c3.post("/fs/tileset", { sources: [big] })).j;
  ok(p4.ceiling_mb === 420 && p4.items[0].estimate_mb > 420, "a ceiling of 420 MB, a file asking more");
  const j4 = await c3.post("/jobs", { kind: "tileset", sources: [big, obj("OB_tiny", 0)] });
  const v4 = await until(c3.get, j4.j.job);
  const big4 = v4.result?.outputs?.find((o) => /OB_big/.test(o.source));
  ok(big4?.state === "refused" && /over the ceiling/.test(big4.error ?? ""), "refused before it starts, never past the ceiling");

  // ── a process that stalls is killed (and tried once more) ──
  bridge.proc.kill();
  bridge = await start({ EM_TILES_STALL_S: "2" });
  const c4 = call(bridge.B);
  const j5 = await c4.post("/jobs", { kind: "tileset", sources: [obj("OB_stall")] });
  const v5 = await until(c4.get, j5.j.job, 30000);
  const o5 = v5.result?.outputs?.[0];
  ok(o5?.state === "failed" && /stalled twice/.test(o5.error ?? ""), "a run that writes nothing is stopped, tried once more, then failed");
  ok((v5.lines ?? []).some((l) => /wrote nothing for 2 s/.test(l)), "and the job's lines say so");

  // ── Obj2Tiles' own JSON progress lines, when it writes them ──
  bridge.proc.kill();
  bridge = await start({ FAKE_PROGRESS: "1" });
  const c5 = call(bridge.B);
  const p6 = (await c5.post("/fs/tileset", { sources: [obj("OB_json")] })).j;
  ok(p6.tool?.progress === true && /--progress/.test(p6.items[0].command), "a build with --progress: asked for its JSON lines");
  const j6 = await c5.post("/jobs", { kind: "tileset", sources: [`${fsroot}/RB/LOD1/OB_json.obj`] });
  const v6 = await until(c5.get, j6.j.job);
  ok(v6.result?.outputs?.[0]?.progress_estimated === false, "its progress read from them, not estimated");

  // ── MICRO-OTTIMIZZA-3 p.3 · many meshes, ONE tileset of the survey ──
  bridge.proc.kill();
  bridge = await start({});
  const c8 = call(bridge.B);
  mkdirSync(`${fsroot}/EM`, { recursive: true });
  const parts = ["OB_EST_L_LOD0", "OB_INT_R_LOD0", "OB_PODIO_LOD0"].map((n) => obj(n));
  const p9 = (await c8.post("/fs/tileset", { sources: parts, combine: true, combine_name: "Survey.em.json" })).j;
  const cb = p9.combined ?? {};
  ok(cb.name === "Survey_LOD0@tiles" && cb.parts === 3 && /\/RB\/versions\/Survey_LOD0@tiles\.3tz$/.test(cb.path ?? ""),
     `one tileset for the survey: ${cb.name}, the document's name and the parts' ending, in the project's RB/versions/`);
  ok(p9.items.every((it) => it.folder === `${cb.folder}/${it.name}` && it.path === null),
     "each part tiled into its sub-folder of it, none packed on its own");
  const p9b = (await c8.post("/fs/tileset", { sources: parts })).j;
  ok(!p9b.combined && p9b.items.every((it) => /@tiles$/.test(it.name)), "without combine: a tileset per file, as before");
  const j9 = await c8.post("/jobs", { kind: "tileset", sources: parts, combine: true, combine_name: "Survey.em.json" });
  ok(j9.status === 202, "the job of the survey starts");
  const v9 = await until(c8.get, j9.j.job, 60000);
  const co = v9.result?.combined ?? {};
  ok(v9.state === "done" && co.state === "done" && existsSync(co.path) && !parts.some((x) => existsSync(x.replace(/^.*\//, `${fsroot}/RB/versions/`).replace(/\.obj$/, "@tiles.3tz"))),
     "ONE .3tz, no archive per part");
  const parent = JSON.parse(readFileSync(`${co.folder}/tileset.json`, "utf8"));
  ok(parent.root.children.length === 3 && parent.root.children.every((ch, i) => ch.content.uri === `${co.parts[i]}/tileset.json`)
     && !parent.root.content && parent.root.refine === "ADD", "the parent: each part an external tileset, the root without content, ADD");
  ok(parent.root.children.every((ch) => ch.geometricError <= parent.root.geometricError && ch.geometricError >= 0.27),
     "its errors: the root's the largest, a part's never below its own");
  ok(co.validation?.ok && co.validation.errors === 0, `the whole judged (${co.validation?.validator}) and passed`);
  ok(co.sources?.length === 3 && /^sha256:/.test(co.sha256 ?? ""), "its sources are the three OBJ, its sha256 for the stamp");
  const again9 = await c8.post("/jobs", { kind: "tileset", sources: parts, combine: true, combine_name: "Survey.em.json" });
  ok(again9.status === 400, "made again: nothing to make (the survey's tileset exists)");
  // registered as an alternative visualisation of the WHOLE document: one
  // resource, ONE step with three inputs
  const header9 = { format: "em.json", version: "1.0" };
  const doc9 = { header: header9, graph: { graph_id: "g9", nodes: parts.map((x, i) => ({ id: `res-${i}`, node_type: "resource",
    name: x.replace(/^.*\//, ""), data: { url: `../RB/LOD1/${x.replace(/^.*\//, "")}`, url_type: "3d_model", tier: "master" } })), edges: [] } };
  const av9 = await c8.post("/graph/add-version", { doc: doc9, sources: parts, em_json: `${fsroot}/EM/Survey.em.json`,
    locator: "../RB/versions/Survey_LOD0@tiles.3tz", sha256: co.sha256, bytes: co.bytes, level: "tiles", destination: "tileset",
    use: ["web", "realtime"], packaging: "archive", technique: "tiling", tool: "Obj2Tiles", software: [{ name: "Obj2Tiles", version: "1.8.0" }],
    at: "2026-10-30" });
  if (!av9.j.registered) console.log("  add-version said:", JSON.stringify(av9.j).slice(0, 400));
  const res9 = (av9.j.nodes ?? []).find((n) => n.id === av9.j.version_id);
  const steps9 = (av9.j.nodes ?? []).filter((n) => n.node_type === "dtc_process");
  const ins9 = (av9.j.edges ?? []).filter((e) => e.edge_type === "dtc_had_input").map((e) => e.target).sort();
  ok(av9.j.registered && res9?.data?.represents === "document" && res9.data.url === "../RB/versions/Survey_LOD0@tiles.3tz",
     "registered as a visualisation of the whole document, its .3tz its file");
  ok(steps9.length === 1 && ins9.join(",") === "res-0,res-1,res-2", "ONE step with the three parts as its inputs");

  // ── the validator of Cesium, when it is here (EM_TILES_VALIDATOR + Node) ──
  if (process.env.CESIUM_VALIDATOR && existsSync(process.env.CESIUM_VALIDATOR)) {
    bridge.proc.kill();
    bridge = await start({ EM_NODE: process.execPath, EM_TILES_VALIDATOR: process.env.CESIUM_VALIDATOR });
    const c6 = call(bridge.B);
    const j7 = await c6.post("/jobs", { kind: "tileset", sources: [obj("OB_cesium")] });
    const v7 = await until(c6.get, j7.j.job, 120000);
    const o7 = v7.result?.outputs?.[0];
    ok(/^3d-tiles-validator/.test(o7?.validation?.validator ?? "") && existsSync(o7.validation.report ?? ""), "Cesium's validator judges, its report beside the tileset");
  } else console.log("  · CESIUM_VALIDATOR not given: Cesium's validator is not run here");

  // ── one real tileset ──
  if (REAL && REAL_OBJ) {
    bridge.proc.kill();
    const real = `${fsroot}/REAL`;
    mkdirSync(real, { recursive: true });
    // the obj with what sits beside it (its mtl, its textures)
    const from = REAL_OBJ.replace(/[^/]+$/, "");
    const name = REAL_OBJ.replace(/^.*\//, "");
    cpSync(from, real, { recursive: true, filter: (f) => !/\.(obj)$/i.test(f) || f === REAL_OBJ || f === from });
    bridge = await start({ EM_OBJ2TILES: REAL, EM_NODE: process.execPath,
                           EM_TILES_VALIDATOR: process.env.CESIUM_VALIDATOR ?? "" });
    const c7 = call(bridge.B);
    const p8 = (await c7.post("/fs/tileset", { sources: [`${real}/${name}`] })).j;
    const j8 = await c7.post("/jobs", { kind: "tileset", sources: [`${real}/${name}`] });
    const v8 = await until(c7.get, j8.j.job, 600000);
    const o8 = v8.result?.outputs?.[0];
    console.log(`  · real: ${REAL} --progress=${p8.tool?.progress} · ${JSON.stringify(o8?.run)} · ${o8?.facts?.files} files · `
      + `${o8?.validation?.validator}: ${o8?.validation?.errors} errors · progress estimated: ${o8?.progress_estimated}`);
    ok(o8?.state === "done" && o8.validation?.ok, `a real tileset by ${REAL}, validated and packed`);
    if (p8.tool?.progress) ok(o8?.progress_estimated === false, "the real build writes its JSON progress lines, and they are read");
  }
} finally {
  try { bridge?.proc.kill(); } catch { /* gone */ }
}
if (fails.length) {
  console.error(`check-tileset-bridge: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-tileset-bridge: ${checks} checks passed`);
