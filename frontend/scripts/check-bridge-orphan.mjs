// MICRO-WINDOWS-MODELLI p.3 · the bridge as a desktop's sidecar, for real:
//   1. its /health says who it is: its pid, `sidecar`, the app it watches;
//   2. its pipes closed under it (the app that read them gone) it still
//      answers — before, the first log line failed and the orphan kept the
//      port answering NOTHING, which no app could recognise as a bridge;
//   3. it leaves when the app named in EM_BRIDGE_PARENT_PID is gone (on
//      Windows `getppid` never changes, so the old watch never fired);
//   4. a bridge started by hand (./dev.sh) says `sidecar: false`.
// What it cannot prove here: Windows' OpenProcess (the same rule, asked of a
// handle instead of a signal) — left to E.D.
//
//   node scripts/check-bridge-orphan.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? "python3";
let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); };
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = realpathSync(mkdtempSync(`${tmpdir()}/orphan-`));
const health = (port) => fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json(), () => null);
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await new Promise((r) => setTimeout(r, 150)); } return null; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// the "app": a process the bridge is told to watch
const app = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
const port = await freePort();
const br = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--exit-with-parent", "--s3dgraphy", `${S3D}src`],
  { env: { ...process.env, EM_BRIDGE_STATE_DIR: `${dir}/.state`, EM_BRIDGE_PARENT_PID: String(app.pid) }, stdio: ["ignore", "pipe", "pipe"] });
const h = await until(() => health(port));
ok(!!h, "the sidecar starts");
ok(h?.sidecar === true && h?.parent_pid === app.pid && h?.pid === br.pid, `/health says who it is: ${JSON.stringify({ sidecar: h?.sidecar, parent_pid: h?.parent_pid, pid: h?.pid })}`);
// its pipes closed, as when the app that read them is gone
br.stdout.destroy();
br.stderr.destroy();
await new Promise((r) => setTimeout(r, 300));
let answered = 0;
for (let i = 0; i < 5; i++) if ((await health(port))?.service === "em_bridge") answered++;
ok(answered === 5, `with its pipes closed it still answers (${answered}/5)`);
// the app leaves: the bridge leaves after it
app.kill("SIGKILL");
const gone = await until(async () => !alive(br.pid) && !(await health(port)), 10000);
ok(!!gone, "the app gone, the bridge leaves and frees the port");
if (alive(br.pid)) br.kill("SIGKILL");

// by hand (./dev.sh): not a sidecar
const port2 = await freePort();
const dev = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port2), "--s3dgraphy", `${S3D}src`],
  { env: { ...process.env, EM_BRIDGE_STATE_DIR: `${dir}/.state2`, EM_BRIDGE_PARENT_PID: "" }, stdio: "ignore" });
const h2 = await until(() => health(port2));
ok(h2?.sidecar === false && h2?.parent_pid === null, `a bridge started by hand says it is not a sidecar: ${JSON.stringify({ sidecar: h2?.sidecar, parent_pid: h2?.parent_pid })}`);
dev.kill();

if (fails.length) {
  console.log(`check-bridge-orphan: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-bridge-orphan: ${checks} checks OK`);
