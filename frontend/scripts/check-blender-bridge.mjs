// MICRO-OTTIMIZZA-3 · Blender as the second way, the bridge's side (level 45):
// `GET /blender` (the Blenders found, the one used, its last probe), `POST
// /blender` (the one chosen in Settings, remembered), `POST /jobs {kind:
// blender}` — the probe (what loads, and WHY an add-on does not: its wheels
// for another Python), the objects of a .blend, the experiences' LOD set and
// an atlas by 3D Survey Collection, EM Tools' «Prepare for a use» on the open
// graph: heavy jobs one at a time with their memory said, progress from the
// runner's and 3DSC's lines, cancel, outputs in versions/ under s3Dgraphy's
// names and never over a file that exists.
//
//   node scripts/check-blender-bridge.mjs
//   EM_BLENDER_REAL="/Applications/Blender 520.app/Contents/MacOS/Blender" …   (one real probe too)
//
// Blender is FAKED here (a small Python program that reads the runner's JSON
// argument and answers as the runner does): the checks are about the bridge.
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
if (!existsSync(PY)) {
  console.log("blender bridge: no s3Dgraphy checkout with its venv — SKIPPED");
  process.exit(0);
}
const REAL = process.env.EM_BLENDER_REAL && existsSync(process.env.EM_BLENDER_REAL) ? process.env.EM_BLENDER_REAL : "";

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); else console.log(`  ✓ ${what}`); };
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
  const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = realpathSync(mkdtempSync(`${tmpdir()}/blender-bridge-`));
const fsroot = `${dir}/fs`;
mkdirSync(`${fsroot}/RB/LOD1`, { recursive: true });
mkdirSync(`${fsroot}/RM`, { recursive: true });
mkdirSync(`${fsroot}/EM`, { recursive: true });

// the fake Blender (scripts/fake-blender.py)
const fake = `${dir}/Blender`;
copyFileSync(new URL("./fake-blender.py", import.meta.url).pathname, fake);
chmodSync(fake, 0o755);
writeFileSync(`${fsroot}/RB/LOD1/OB_PODIO.obj`, "v 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n");
writeFileSync(`${fsroot}/RB/LOD1/OB_slow.obj`, "v 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n");
writeFileSync(`${fsroot}/RB/LOD1/OB_fail.obj`, "v 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n");
writeFileSync(`${fsroot}/RM/scene.blend`, "BLENDER-v502 fake");

const start = async (envExtra) => {
  const port = await freePort();
  const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`,
                PATH: "/usr/bin:/bin", FAKE_LOG: `${dir}/fake.log`, ...envExtra };
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
  // ── found: no Blender at first, then the one chosen ─────────────────────
  bridge = await start({ EM_BLENDER: "", HOME: dir });
  let { get, post } = call(bridge.B);
  const h = (await get("/health")).j;
  ok(h.bridge_level >= 45, `the bridge is at level 45 (${h.bridge_level})`);
  let st = (await get("/blender")).j;
  ok(st.ok && Array.isArray(st.found), "GET /blender answers the Blenders found");
  const none = await post("/jobs", { kind: "blender", op: "probe", blender: `${dir}/nope` });
  ok(none.status === 400 && /Blender is not here/.test(none.j.error ?? ""), "a Blender that is not there is refused, said");
  const bad = await post("/blender", { path: `${fsroot}/RB/LOD1/OB_PODIO.obj` });
  ok(bad.status === 400 && /not a program/.test(bad.j.error ?? ""), "choosing a file that does not run is refused");
  const ch = await post("/blender", { path: fake });
  ok(ch.status === 200 && ch.j.chosen === fake && ch.j.current === fake, "the Blender chosen is remembered and used");
  ok(JSON.parse(readFileSync(`${dir}/.state/blender.json`, "utf8")).path === fake, "…in the state folder (blender.json)");
  st = (await get("/blender")).j;
  ok(st.found[0] === fake && st.probe === null, "the chosen one comes first, not asked yet");

  // ── asked: the probe, and why EM Tools does not load ─────────────────────
  let r = await post("/jobs", { kind: "blender", op: "probe" });
  ok(r.status === 202 && r.j.plan?.heavy === false, "the probe is a LIGHT job");
  let v = await until(get, r.j.job);
  ok(v.state === "done" && v.result?.ok, "the probe answers");
  ok(v.result?.emtools?.loaded === false && v.result.emtools.why?.code === "wheels" && v.result.emtools.why.wheels === "3.11"
     && v.result.emtools.why.python === "3.13", "EM Tools with cp311 wheels in a Python 3.13: why said (wheels 3.11, python 3.13)");
  ok(v.result?.dsc?.headless && v.result.dsc.version === "1.7.0-dev.17", "3DSC's headless module and its version");
  st = (await get("/blender")).j;
  ok(st.probe?.ok && st.probe.path === fake, "the last probe is kept for GET /blender");
  ok(existsSync(`${dir}/.state/addons/blender/emstudio_runner.py`), "the runner is written beside the add-ons");

  // ── used: a LOD set (heavy), its plan, its outputs ───────────────────────
  const src = `${fsroot}/RB/LOD1/OB_PODIO.obj`;
  const plan = await post("/jobs", { kind: "blender", op: "lod_set", source: src, levels: 3, dry_run: true });
  ok(plan.status === 200 && plan.j.heavy === true && plan.j.estimate_mb > 0, "the LOD set's plan: heavy, its memory said");
  ok(plan.j.outputs?.map((o) => o.name).join(",") === "OB_PODIO@lod1-realtime.glb,OB_PODIO@lod2-realtime.glb,OB_PODIO@lod3-realtime.glb"
     && plan.j.outputs[0].path === `${fsroot}/RB/versions/OB_PODIO@lod1-realtime.glb`, "named by s3Dgraphy, in RB/versions/");
  r = await post("/jobs", { kind: "blender", op: "lod_set", source: src, levels: 3 });
  ok(r.status === 202, "the LOD set starts (202)");
  const stages = new Set();
  v = await until(get, r.j.job, 60000, (x) => { if (x.stage) stages.add(x.stage); });
  ok(v.state === "done" && v.heavy, "…done, as a heavy job");
  ok([...stages].some((s) => /^LOD\d$/.test(s)), `…its stages from 3DSC's lines (${[...stages].join(", ")})`);
  const outs = v.result?.outputs ?? [];
  ok(outs.length === 3 && outs.every((o) => o.state === "written" && existsSync(o.path)), "three glb kept in versions/");
  ok(outs[0].level === "lod1" && outs[0].facts?.faces === 500 && /^sha256:[0-9a-f]{64}$/.test(outs[0].sha256), "…each its level, faces and sha256");
  ok(outs[0].textures === 4 && outs[0].texture_px === 2048, "…and the textures 3DSC counted for its level");
  r = await post("/jobs", { kind: "blender", op: "lod_set", source: src, levels: 3 });
  ok(r.status === 400 && /nothing to make/.test(r.j.error ?? ""), "made again: nothing to make, never over a file that exists");

  // ── an atlas ─────────────────────────────────────────────────────────────
  r = await post("/jobs", { kind: "blender", op: "atlas", source: src, size: 2048 });
  v = await until(get, r.j.job);
  ok(v.state === "done" && v.result?.outputs?.[0]?.name === "OB_PODIO@atlas.glb" && existsSync(`${fsroot}/RB/versions/OB_PODIO@atlas.glb`),
     "the atlas: OB_PODIO@atlas.glb in RB/versions/");

  // ── a .blend: its objects, a LOD set from one, «Prepare for a use» ───────
  const blend = `${fsroot}/RM/scene.blend`;
  r = await post("/jobs", { kind: "blender", op: "objects", blend });
  v = await until(get, r.j.job);
  ok(v.state === "done" && v.result?.result?.objects?.length === 2 && !v.heavy, "the objects of a .blend (a light job), with their faces");
  const log0 = readFileSync(`${dir}/fake.log`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  ok(log0.at(-1).blend === blend, "…Blender opened that .blend");
  r = await post("/jobs", { kind: "blender", op: "lod_set", blend, levels: 2, dry_run: true });
  ok(r.status === 400 && /which object/.test(r.j.error ?? ""), "a .blend without an object is refused");
  r = await post("/jobs", { kind: "blender", op: "lod_set", blend, object: "ME_PODIO", levels: 2 });
  v = await until(get, r.j.job);
  ok(v.state === "done" && v.result?.outputs?.map((o) => o.name).join(",") === "ME_PODIO@lod1-realtime.glb,ME_PODIO@lod2-realtime.glb"
     && existsSync(`${fsroot}/RM/versions/ME_PODIO@lod1-realtime.glb`), "a LOD set from an object of the .blend: RM/versions/ME_PODIO@lodN-realtime.glb");
  r = await post("/jobs", { kind: "blender", op: "prepare", source: src, dry_run: true });
  ok(r.status === 400 && /object of a \.blend/.test(r.j.error ?? ""), "«Prepare» wants an object of a .blend");
  const doc = { version: "1.6", graph: { graph_id: "g1", nodes: [], edges: [] } };
  r = await post("/jobs", { kind: "blender", op: "prepare", blend, object: "ME_PODIO", use: ["web"], level: "lod3", doc });
  v = await until(get, r.j.job);
  ok(v.state === "done" && v.result?.outputs?.[0]?.name === "ME_PODIO@lod3-web.glb" && existsSync(`${fsroot}/RM/versions/ME_PODIO@lod3-web.glb`),
     "«Prepare for a use» (web): EM Tools' glb kept as RM/versions/ME_PODIO@lod3-web.glb");
  const lp = readFileSync(`${dir}/fake.log`, "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);
  ok(lp.op === "prepare" && lp.args.object === "ME_PODIO" && lp.args.use[0] === "web" && lp.args.em_json && !existsSync(lp.args.em_json),
     "…EM Tools got a COPY of the open graph, thrown away after");

  // ── a failure, a cancel, one heavy at a time ─────────────────────────────
  r = await post("/jobs", { kind: "blender", op: "lod_set", source: `${fsroot}/RB/LOD1/OB_fail.obj` });
  v = await until(get, r.j.job);
  ok(v.state === "failed" && /asked to fail/.test(v.error ?? ""), "a Blender error is the job's answer, said");
  const slow = await post("/jobs", { kind: "blender", op: "lod_set", source: `${fsroot}/RB/LOD1/OB_slow.obj` });
  await sleep(800);
  const second = await post("/jobs", { kind: "blender", op: "atlas", source: `${fsroot}/RB/LOD1/OB_fail.obj` });
  await sleep(600);
  const w = (await get(`/jobs?id=${second.j.job}`)).j;
  ok(w.state === "queued" && w.stage === "waiting", "a second heavy Blender job waits for the first");
  const t0 = Date.now();
  await post("/jobs", { step: "cancel", id: slow.j.job });
  v = await until(get, slow.j.job, 10000);
  ok(v.state === "cancelled" && Date.now() - t0 < 6000, `cancel ends Blender (${Date.now() - t0} ms)`);
  ok(!existsSync(`${fsroot}/RB/versions/OB_slow@lod1-realtime.glb`), "…and leaves nothing in versions/");
  await until(get, second.j.job);
  r = await post("/blender", { path: "" });
  ok(r.j.ok && r.j.chosen === "", "«the newest found» forgets the choice");

  // ── a real Blender, when given ───────────────────────────────────────────
  if (REAL) {
    r = await post("/jobs", { kind: "blender", op: "probe", blender: REAL });
    v = await until(get, r.j.job, 180000);
    ok(v.state === "done" && v.result?.ok && /^\d+\.\d+/.test(v.result.blender ?? ""), `a real probe: Blender ${v.result?.blender} (Python ${v.result?.python}) in ${v.result?.seconds} s`);
    console.log(`    EM Tools: ${JSON.stringify(v.result?.emtools)}\n    3DSC: ${JSON.stringify(v.result?.dsc)}`);
  }
} finally {
  bridge?.proc.kill();
}

console.log(`\nblender bridge: ${checks - fails.length}/${checks}`);
if (fails.length) { for (const f of fails) console.log(`  ✗ ${f}`); process.exit(1); }
