// MICRO-WINDOWS-MODELLI p.1 · executable check of `src/load-failure.ts`: a
// model that does not come says why, read from the answer.
//   1. the rules, with the probes simulated: an HTTP status from three's
//      HttpError / a RoadError, a decoding error, a network error whose HEAD
//      answers, no answer and no bridge, no answer and a bridge (CORS), an
//      older bridge; one line per (url, cause);
//   2. a real bridge on a temporary study: 403 (the folder not served), 404,
//      200 + unreadable bytes (decoding); a port where nobody listens (the
//      bridge on 8766, the page asking 8765); a bridge of level 33 (dev.55's)
//      that has no /fs/doc and answers 403 → «older».
//
//   node scripts/check-load-failure.mjs
import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { createServer as httpServer } from "node:http";
import { tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? "python3";
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./load-failure";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const L = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const eq = (a, b, what) => { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); };

// ── 1 · the rules ───────────────────────────────────────────────────────────
const AT = "http://localhost:8766/fs/at/C:/Users/Utente/OneDrive%20-%20CNR/T6.5/RB/LOD2/OB_PODIO.obj";
const mock = (head, health) => ({ head: async () => head, health: async () => health, wanted: 34 });
const http = (status) => Object.assign(new Error(`fetch for "${AT}" responded with ${status}`), { name: "HttpError", response: { status } });
const d = async (err, probes, url = AT) => { const f = await L.diagnose("OB_PODIO", url, err, probes); return [f.cause, f.status]; };
eq(await d(http(403), mock(null, { bridge_level: 34 })), ["folder", 403], "three's HttpError 403 from the bridge: the folder is not served");
eq(await d(http(404), mock(null, { bridge_level: 34 })), ["missing", 404], "404: the file is not there");
eq(await d(http(409), mock(null, { bridge_level: 34 })), ["cloud-only", 409], "409 from the bridge: OneDrive online only");
eq(await d(http(403), mock(null, { bridge_level: 33 })), ["older", 403], "403 from a bridge of level 33: the bridge is older (no /fs/doc)");
eq(await d(http(403), mock(null, null), "https://node.example/v1/rooms/r/asset/sha256-x"), ["refused", 403], "403 from a node: access");
eq(await d(Object.assign(new Error("x"), { status: 401 }), mock(null, null), "https://node.example/v1/rooms/r/asset/sha256-x"), ["refused", 401], "a RoadError's 401: access");
eq(await d(new SyntaxError("Unexpected token 'g', \"glTF-fake\" is not valid JSON"), mock(200, { bridge_level: 34 })), ["decode", null], "a parse error: decoding");
eq(await d(new RangeError("Invalid typed array length: 12"), mock(200, { bridge_level: 34 })), ["decode", null], "a typed-array error: decoding");
eq(await d(new TypeError("Failed to fetch"), mock(403, { bridge_level: 34 })), ["folder", 403], "a network error whose HEAD answers 403: the folder");
eq(await d(new TypeError("Failed to fetch"), mock(null, null)), ["down", null], "no answer, no /health: nothing listens at that base (another port)");
eq(await d(new TypeError("Load failed"), mock(null, { bridge_level: 34 })), ["cors", null], "no answer but the bridge is up: the browser hid it (CORS)");
eq(await d(new TypeError("Failed to fetch"), mock(null, { bridge_level: 30 })), ["older", null], "no answer from an old bridge (its 404 without CORS): older");
eq(await d({ type: "error", message: "tileset: tileset.json" }, mock(404, { bridge_level: 34 })), ["missing", 404], "a tileset's root that did not come: the HEAD says 404");
eq(await d({ type: "error", message: "tileset: no root" }, mock(200, { bridge_level: 34 })), ["slow", 200], "a tileset that answers a HEAD and whose root did not come: slow (OneDrive downloading it)");
eq(L.statusOf({ status: 0 }), null, "a RoadError of no answer has no status");
const log = new L.FailureLog();
const f1 = await L.diagnose("A", AT, http(403), mock(null, { bridge_level: 34 }));
eq([log.note("rm:a", f1), log.note("rm:a", f1), log.byKey.has("rm:a"), log.cleared("rm:a"), log.byKey.has("rm:a")],
   [true, false, true, true, false], "one line per (url, cause); the mark goes when the model comes");

// ── 2 · a real bridge ──────────────────────────────────────────────────────
const dir = realpathSync(mkdtempSync(`${tmpdir()}/loadfail-`));
const study = `${dir}/Studio`;
mkdirSync(`${study}/EM`, { recursive: true });
mkdirSync(`${study}/RB`, { recursive: true });
mkdirSync(`${dir}/served`, { recursive: true });
writeFileSync(`${study}/EM/s.em.json`, JSON.stringify({ header: { format: "em.json" }, graphs: {} }));
writeFileSync(`${study}/RB/bad.glb`, "glTF-fake");
const freePort = () => new Promise((res) => { const s = netServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort();
const br = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", `${dir}/served`, "--s3dgraphy", `${S3D}src`],
                 { env: { ...process.env, EM_BRIDGE_STATE_DIR: `${dir}/.state` }, stdio: ["ignore", "pipe", "pipe"] });
let blog = "";
br.stdout.on("data", (b) => { blog += b; });
br.stderr.on("data", (b) => { blog += b; });
const B = `http://127.0.0.1:${port}`;
const H0 = { Origin: "http://localhost:5173" };
const probes = {
  head: (u) => fetch(u, { method: "HEAD", headers: H0 }).then((r) => r.status, () => null),
  health: (b) => fetch(`${b}/health`, { headers: H0 }).then((r) => (r.ok ? r.json() : null), () => null),
  wanted: 34,
};
let up = false;
for (let i = 0; i < 100 && !up; i++) { await new Promise((r) => setTimeout(r, 150)); up = await fetch(`${B}/health`).then((r) => r.ok, () => false); }
eq(up, true, "the bridge starts");
const at = (base, abs) => `${base}/fs/at/${abs.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/")}`;
// a loader asks like three's FileLoader: the status, then an HttpError
const load = async (url) => { try { const r = await fetch(url, { headers: H0 }); if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { name: "HttpError", response: { status: r.status } }); JSON.parse(await r.text()); return null; } catch (e) { return e; } };
if (up) {
  const bad = at(B, `${study}/RB/bad.glb`);
  let f = await L.diagnose("bad", bad, await load(bad), probes);
  eq([f.cause, f.status], ["folder", 403], "real bridge, the study not served: 403 → «the bridge does not serve this file's folder»");
  await fetch(`${B}/fs/doc`, { method: "POST", headers: { ...H0, "Content-Type": "application/json" }, body: JSON.stringify({ em_json: `${study}/EM/s.em.json`, locators: ["../RB/bad.glb"] }) });
  f = await L.diagnose("gone", at(B, `${study}/RB/gone.glb`), await load(at(B, `${study}/RB/gone.glb`)), probes);
  eq([f.cause, f.status], ["missing", 404], "real bridge, the folder served, the file not there: 404");
  f = await L.diagnose("bad", bad, await load(bad), probes);
  eq([f.cause, f.status], ["decode", null], "real bridge, the bytes served but unreadable: decoding");
  // the page asking 8765 while the bridge is elsewhere: nobody listens there
  const dead = await freePort();
  const wrong = at(`http://127.0.0.1:${dead}`, `${study}/RB/bad.glb`);
  f = await L.diagnose("bad", wrong, await load(wrong), probes);
  eq([f.cause, f.status], ["down", null], "a port where nobody listens (the bridge moved to the next one): «nothing answers at …»");
}
br.kill();
// a bridge of level 33 (dev.55): no /fs/doc, the study's folder refused
const oldPort = await freePort();
const old = httpServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, service: "em_bridge", bridge_level: 33 })); return; }
  res.writeHead(403, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "path outside the allowed roots" }));
}).listen(oldPort, "127.0.0.1");
await new Promise((r) => old.once("listening", r));
const viaOld = at(`http://127.0.0.1:${oldPort}`, `${study}/RB/bad.glb`);
const fo = await L.diagnose("bad", viaOld, await load(viaOld), probes);
eq([fo.cause, fo.status], ["older", 403], "a bridge of level 33 that refuses the folder: «an older level»");
old.close();

if (fails.length) {
  console.log(`check-load-failure: ${fails.length} of ${checks} FAILED`);
  for (const x of fails) console.log(`  ✗ ${x}`);
  if (!up) console.log(blog.slice(-1500));
  process.exit(1);
}
console.log(`check-load-failure: ${checks} checks OK`);
