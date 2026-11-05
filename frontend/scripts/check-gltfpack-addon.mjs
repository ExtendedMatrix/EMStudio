// MICRO-PULIZIA (5 Nov 2026) · the gltfpack the bridge really finds, through
// the queue. check-optimize-bridge proves the variants with `EM_GLTFPACK` given
// by hand; this one gives the bridge NOTHING but the add-ons folder — no
// `EM_GLTFPACK`, a PATH of /usr/bin:/bin — so the tool it runs is the add-on
// `./em.sh gltfpack` installs (meshoptimizer's official release, pinned version
// and sha256, into `<state>/addons/gltfpack/<version>/`, as Settings › Add-ons).
// A glb of testdata/ is COPIED into a folder of /tmp, and the variant is asked
// as the page asks it: `POST /jobs {kind: variants}`, polled to its end.
//
//   node scripts/check-gltfpack-addon.mjs
//   EM_ADDONS_DIR=/other/addons node scripts/check-gltfpack-addon.mjs
//
// The add-ons folder is only READ (its installed.json and the binary); the
// bridge's state is a folder of its own in /tmp. No add-on → SKIPPED, and how
// to install it.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
const GLB = new URL("../testdata/lod/muro_LOD0.glb", import.meta.url).pathname;
const ADDONS = process.env.EM_ADDONS_DIR
  ?? `${process.env.EM_BRIDGE_STATE_DIR ?? `${homedir()}/.config/emstudio`}/addons`;
if (!existsSync(PY)) {
  console.log("gltfpack add-on: no s3Dgraphy checkout with its venv — SKIPPED");
  process.exit(0);
}
let manifest = null;
try { manifest = JSON.parse(readFileSync(`${ADDONS}/gltfpack/installed.json`, "utf8")); } catch { /* none */ }
if (!manifest || !existsSync(manifest.path ?? "")) {
  console.log(`gltfpack add-on: not installed in ${ADDONS} — SKIPPED (./em.sh gltfpack installs it)`);
  process.exit(0);
}

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); else console.log(`  ✓ ${what}`); };
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
  const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = realpathSync(mkdtempSync("/tmp/gltfpack-addon-"));
const part = `${dir}/fs/Muro/LOD0`;
mkdirSync(part, { recursive: true });
const src = `${part}/muro_LOD0.glb`;
copyFileSync(GLB, src);

const port = await freePort();
const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`,
              EM_ADDONS_DIR: ADDONS, PATH: "/usr/bin:/bin", EM_GLTFPACK: "" };
const proc = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", `${dir}/fs`],
                   { env, stdio: ["ignore", "ignore", "inherit"] });
const B = `http://127.0.0.1:${port}`;
const post = async (route, body) => {
  const r = await fetch(`${B}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
                                          body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
const get = async (route) => (await (await fetch(`${B}${route}`)).json().catch(() => ({})));

try {
  for (let i = 0; i < 120; i++) { try { await fetch(`${B}/health`); break; } catch { await sleep(250); } }
  const dry = await post("/fs/optimize", { sources: [src], preset: "web", dry_run: true });
  const tool = dry.j.tool ?? {};
  ok(tool.addon === true && tool.path === manifest.path, `the bridge finds the add-on: ${tool.path}`);
  ok(tool.version === `gltfpack ${manifest.version}`, `its version, asked of the binary: ${tool.version}`);
  const planned = dry.j.outputs?.[0] ?? {};
  //: no project root above the copy: the variant goes in a versions/ beside it
  ok(planned.path === `${part}/versions/muro_LOD0@lod4-web.glb` && planned.exists === false,
     `the variant's place, in /tmp: ${planned.path}`);

  const job = await post("/jobs", { kind: "variants", sources: [src], preset: "web" });
  ok(job.status === 202 && job.j.job, `queued: job ${job.j.job}`);
  let v = {};
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    v = await get(`/jobs?id=${job.j.job}`);
    if (!["queued", "running"].includes(v.state)) break;
    await sleep(200);
  }
  const out = v.result?.outputs?.[0] ?? {};
  ok(v.state === "done" && out.state === "written" && existsSync(out.path ?? ""),
     `the job done, the variant written (${out.bytes} bytes)`);
  const ex = out.facts?.extensions ?? [];
  ok(ex.includes("EXT_meshopt_compression"), `meshopt in it (${ex.join(", ")})`);
  ok(out.facts?.faces > 0, `its facts: ${out.facts?.faces} faces`);
  ok(readFileSync(src).equals(readFileSync(GLB)), "the source copy untouched");
} finally {
  proc.kill();
}

if (fails.length) {
  console.error(`✗ check-gltfpack-addon: ${fails.length} of ${checks} failed:\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`check-gltfpack-addon: ${checks} checks passed (${dir})`);
