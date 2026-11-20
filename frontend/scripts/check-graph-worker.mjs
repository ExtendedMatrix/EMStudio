// MICRO-TIL03 (row T2 of the tileset plan) · POST /geometry-summary does not
// starve the tiles any more. The bridge is one Python process: a whole
// em.json loaded there held the GIL ~1 s on TempluMare v11 (8.5 s before
// s3Dgraphy 03c7758), and the /fs/at ranges of a .3tz fell from 2000+/s to
// ~10/s. Now the graph is loaded and summed in the graph worker
// (tools/em_graphwork.py), a process of its own.
//   1. /health names the worker (`graph_worker`, another pid);
//   2. the answer is byte-identical with the worker and without it
//      (EM_BRIDGE_GRAPH_WORKER=0: the same call inline, as before);
//   3. a body that is not JSON is still a 400;
//   4. with TempluMare v11 on this machine (S3D_TEMPLUMARE_V11, or
//      ~/Documents/GitHub/_datasets/templumare-v11; skipped when absent):
//      ranges of a .3tz served one after another DURING the request at
//      ≥ 1000/s, and at least 5× the rate of the inline bridge (which
//      measures ~10–40/s; HEAD fails this);
//   5. a worker killed under the bridge is started again, the answer the same.
//
//   node scripts/check-graph-worker.mjs        (PYTHON=… the bridge's Python)
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir, homedir } from "node:os";
import { createHash } from "node:crypto";
import http from "node:http";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? (existsSync(`${S3D}.venv/bin/python`) ? `${S3D}.venv/bin/python` : "python3");
const V11 = process.env.S3D_TEMPLUMARE_V11 ?? `${homedir()}/Documents/GitHub/_datasets/templumare-v11/TempluMare_v11.em.json`;
// /fs/* answers a local page only (MICRO-PERCORSI): the Origin of a Vite
const ORIGIN = "http://localhost:5173";
let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); };
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = realpathSync(mkdtempSync(`${tmpdir()}/graphwork-`));
const until = async (f, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await new Promise((r) => setTimeout(r, 150)); } return null; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sha = (b) => createHash("sha256").update(b).digest("hex");

// a .3tz of 400 small members, as the tiles of a survey
const archive = `${dir}/tiles.3tz`;
execFileSync(PY, ["-c", `import zipfile,os,sys
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_STORED)
[z.writestr(f't/{i}.glb', os.urandom(40000)) for i in range(400)]
z.close()`, archive]);
const spans = execFileSync(PY, ["-c", `import zipfile,sys
z=zipfile.ZipFile(sys.argv[1])
print('\\n'.join(f'{i.header_offset} {i.header_offset+30+len(i.filename)+i.compress_size}' for i in z.infolist()))`, archive])
  .toString().trim().split("\n").map((l) => l.split(" ").map(Number));

const start = async (env) => {
  const port = await freePort();
  const p = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--s3dgraphy", `${S3D}src`, "--fs-root", dir],
    { env: { ...process.env, EM_BRIDGE_STATE_DIR: `${dir}/.state-${port}`, EM_BRIDGE_PARENT_PID: "", ...env }, stdio: "ignore" });
  const h = await until(() => fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json(), () => null));
  return { port, p, h };
};
const post = (port, body) => fetch(`http://127.0.0.1:${port}/geometry-summary`, { method: "POST", body, headers: { "Content-Type": "application/json", Origin: ORIGIN } })
  .then(async (r) => ({ status: r.status, body: Buffer.from(await r.arrayBuffer()) }));
// one range at a time, a new connection each (as the measure of MICRO-TIL01)
const range = (port, [a, b]) => new Promise((res, rej) => {
  const req = http.get({ host: "127.0.0.1", port, path: `/fs/at${encodeURI(archive)}`, agent: false, headers: { Range: `bytes=${a}-${b - 1}`, Origin: ORIGIN } },
    (r) => { r.resume(); r.on("end", () => res(r.statusCode)); });
  req.on("error", rej);
});
const ratesDuring = async (port, body) => {
  let stop = false, n = 0, bad = 0, i = 0;
  const loop = (async () => { while (!stop) { const s = await range(port, spans[i++ % spans.length]); if (s === 206) n++; else bad++; } })();
  await new Promise((r) => setTimeout(r, 300));
  n = 0;
  const t0 = performance.now();
  const r = await post(port, body);
  const secs = (performance.now() - t0) / 1000;
  const during = n;
  stop = true; await loop;
  return { perS: during / secs, secs, status: r.status, bad };
};

// the smallest em.json, written by the library itself (one unit, no 3D)
const small = execFileSync(PY, ["-c", `import sys,json
sys.path.insert(0, sys.argv[1])
from s3dgraphy import api
from s3dgraphy.graph import Graph
from s3dgraphy.nodes.stratigraphic_node import StratigraphicUnit
g = Graph("g"); g.add_node(StratigraphicUnit("n1", "US1"))
print(json.dumps(api.graph_to_emjson(g)))`, `${S3D}src`]).toString();
const docs = [["empty graph", Buffer.from(small)]];
const haveV11 = existsSync(V11);
if (haveV11) docs.push(["TempluMare v11", readFileSync(V11)]);

const w = await start({});
const n = await start({ EM_BRIDGE_GRAPH_WORKER: "0" });
try {
  ok(!!w.h && !!n.h, "both bridges start");
  ok(Number.isInteger(w.h?.graph_worker) && w.h.graph_worker !== w.p.pid && alive(w.h.graph_worker), `/health names a live graph worker: ${w.h?.graph_worker}`);
  ok(n.h?.graph_worker === null, `EM_BRIDGE_GRAPH_WORKER=0: no worker (${n.h?.graph_worker})`);
  for (const [name, body] of docs) {
    const a = await post(w.port, body), b = await post(n.port, body);
    ok(a.status === 200 && b.status === 200, `${name}: 200 from both (${a.status}, ${b.status})`);
    ok(sha(a.body) === sha(b.body), `${name}: the same answer with the worker and inline`);
  }
  const bad = await post(w.port, "x{");
  ok(bad.status === 400 && /invalid JSON/.test(bad.body.toString()), `a body that is not JSON is a 400 (${bad.status})`);
  if (haveV11) {
    const body = docs[1][1];
    const rw = await ratesDuring(w.port, body);
    const rn = await ratesDuring(n.port, body);
    console.log(`  tiles during /geometry-summary of v11: worker ${rw.perS.toFixed(0)}/s over ${rw.secs.toFixed(2)} s; inline ${rn.perS.toFixed(0)}/s over ${rn.secs.toFixed(2)} s`);
    ok(rw.status === 200 && rw.bad === 0, `v11 with the tiles running: 200, every range a 206 (${rw.status}, ${rw.bad} not 206)`);
    ok(rw.perS >= 1000, `tiles during the request ≥ 1000/s (${rw.perS.toFixed(0)}/s)`);
    ok(rw.perS >= 5 * rn.perS, `tiles during the request ≥ 5× the inline bridge (${rw.perS.toFixed(0)} vs ${rn.perS.toFixed(0)}/s)`);
  } else {
    console.log(`  TempluMare v11 not on this machine (${V11}): the rate is not measured`);
  }
  // the worker killed under the bridge: started again, the same answer
  const old = w.h?.graph_worker;
  if (Number.isInteger(old)) { process.kill(old, "SIGKILL"); await until(async () => !alive(old), 5000); }
  const again = await post(w.port, docs[docs.length - 1][1]);
  const ref = await post(n.port, docs[docs.length - 1][1]);
  const h2 = await fetch(`http://127.0.0.1:${w.port}/health`).then((r) => r.json());
  ok(again.status === 200 && sha(again.body) === sha(ref.body), `a killed worker: the next request answers the same (${again.status})`);
  ok(Number.isInteger(h2.graph_worker) && h2.graph_worker !== old && alive(h2.graph_worker), `…from a new worker (${old} → ${h2.graph_worker})`);
} finally {
  const wk = (await fetch(`http://127.0.0.1:${w.port}/health`).then((r) => r.json(), () => ({}))).graph_worker;
  w.p.kill(); n.p.kill();
  if (wk) await until(async () => !alive(wk), 5000);
}

if (fails.length) {
  console.log(`check-graph-worker: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-graph-worker: ${checks} checks OK`);
