// MICRO-BRIDGE-CERTIFICATI · every HTTPS request of the bridge goes through
// `tools/em_net.py`, whose context carries certifi's CAs — the packaged bridge
// (a CI interpreter, frozen) found none of its own on E.D.'s Mac, and every tile
// was `failed: URLError`.
//   1. the source: no `urlopen` in tools/ outside em_net, no unverified context;
//   2. the context: with the interpreter's own CAs made unreachable
//      (SSL_CERT_FILE / SSL_CERT_DIR on a missing file — the frozen bridge's
//      state), em_net's context still holds certifi's CAs, and so does the
//      process default after `install_default()` (the library's requests);
//   3. each request site hands urlopen THAT context: fetch_online, the room's
//      HEAD and «Keep on disk», the LLM provider — urlopen replaced by a spy;
//   4. a failure says why: a local HTTPS server with a self-signed certificate
//      → `certificate not verifiable (…)` in the tile's X-EM-Tile, in
//      /tiles/failures (cleared by the next tile that comes);
//   5. a bridge started for real: /health says `tls_ca: certifi`, `--tls-check`
//      answers 0.
//
//   node scripts/check-bridge-tls.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const TOOLS = process.env.TOOLS_DIR ?? new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? (existsSync(`${S3D}.venv/bin/python`) ? `${S3D}.venv/bin/python` : "python3");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, `${m} — got ${JSON.stringify(a)}`); checks++; };
const dir = realpathSync(mkdtempSync(`${tmpdir()}/bridge-tls-`));
// the frozen bridge's state: the interpreter's own CA paths lead nowhere
const NO_CA = { SSL_CERT_FILE: `${dir}/none.pem`, SSL_CERT_DIR: `${dir}/none` };
const run = (code, env = {}) => {
  const r = spawnSync(PY, ["-c", `import json, sys, os\nsys.path.insert(0, ${JSON.stringify(TOOLS)})\nos.environ["EM_BRIDGE_STATE_DIR"] = ${JSON.stringify(`${dir}/state`)}\n${code}`],
    { encoding: "utf8", env: { ...process.env, ...NO_CA, ...env } });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout.trim().split("\n").pop());
};

// ── 1 · the source ──────────────────────────────────────────────────────────
{
  const bad = [];
  for (const f of readdirSync(TOOLS).filter((n) => n.endsWith(".py") && n !== "em_net.py")) {
    readFileSync(TOOLS + f, "utf8").split("\n").forEach((line, i) => {
      const code = line.replace(/#.*$/, "");
      if (/\burlopen\s*\(/.test(code) && !/\bem_net\.urlopen\s*\(/.test(code)) bad.push(`${f}:${i + 1} ${line.trim()}`);
      if (/HTTPSConnection\s*\(|_create_unverified_context|CERT_NONE|check_hostname\s*=\s*False/.test(code)) bad.push(`${f}:${i + 1} ${line.trim()}`);
    });
  }
  eq(bad, [], "no request in tools/ opens a URL without em_net (or with verification off)");
}

// ── 2 · the context ─────────────────────────────────────────────────────────
{
  const r = run(`
import ssl, em_net
# the frozen bridge's state, whatever this interpreter's own paths: its defaults find nothing
ssl.SSLContext.load_default_certs = lambda self, purpose=None: None
own = ssl.create_default_context().cert_store_stats()["x509_ca"]
ours = em_net.ssl_context().cert_store_stats()["x509_ca"]
em_net.install_default()
dflt = ssl._create_default_https_context().cert_store_stats()["x509_ca"]
print(json.dumps({"own": own, "ours": ours, "dflt": dflt, "ca": em_net.ca_file(), "verify": em_net.ssl_context().verify_mode == ssl.CERT_REQUIRED, "host": em_net.ssl_context().check_hostname}))`);
  eq(r.own, 0, "the interpreter's own CAs made unreachable, as in the frozen bridge: none (its «URLError»)");
  ok(r.ca && r.ours > 100, `em_net's context holds certifi's CAs all the same (${r.ours}, ${r.ca})`);
  ok(r.dflt > 100, `install_default(): a request without a context (the library's) gets them too (${r.dflt})`);
  eq([r.verify, r.host], [true, true], "the certificate and the host name are verified");
}

// ── 3 · every request site hands over that context ─────────────────────────
{
  const r = run(`
import io, urllib.request, em_net, em_geotiles as G, em_bridge as B, llm_provider as L
seen = []
class Answer(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False
def spy(req, timeout=None, context=None, **kw):
    seen.append({"url": getattr(req, "full_url", str(req)), "ctx": context is em_net.ssl_context()})
    return Answer(b'{"content": [{"type": "text", "text": "ok"}]}')
urllib.request.urlopen = spy
G.fetch_online("osm", 1, 0, 0)
probe = B._room_probe({"base": "https://node.example", "room_id": "r", "token": "t"})
probe("ab" * 32)
try:
    B._files_route("/file-keep", {"room": {"base": "https://node.example", "room_id": "r"}, "sha256": "ab" * 32, "dest": ${JSON.stringify(`${dir}/kept.bin`)}})
except Exception:
    pass    # the spy's bytes are not the sha256's: refused after the request, as it should
try:
    L.ClaudeProvider(api_key="k").generate("s", "p", {})
except Exception:
    pass
print(json.dumps(seen))`);
  const where = (s) => r.filter((x) => x.url.includes(s));
  ok(where("openstreetmap").length === 1 && where("openstreetmap")[0].ctx, "fetch_online (tiles, globe minimum, «Estrai area»): em_net's context");
  ok(where("node.example").length === 2 && where("node.example").every((x) => x.ctx), "a room's assets on a node (the HEAD, «Keep on disk»): em_net's context");
  ok(where("anthropic").length === 1 && where("anthropic")[0].ctx, "the LLM provider (the spy answers: nothing leaves this machine): em_net's context");
  ok(r.every((x) => x.ctx), `every request the spy saw carried it (${r.length})`);
}

// ── 4 · a failure says why ──────────────────────────────────────────────────
const haveOpenssl = spawnSync("openssl", ["version"]).status === 0;
if (haveOpenssl) {
  spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${dir}/k.pem`, "-out", `${dir}/c.pem`, "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  const r = run(`
import ssl, threading, http.server, em_net, em_geotiles as G
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header("Content-Length", "3"); self.end_headers(); self.wfile.write(b"png")
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
sc = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); sc.load_cert_chain(${JSON.stringify(`${dir}/c.pem`)}, ${JSON.stringify(`${dir}/k.pem`)})
srv.socket = sc.wrap_socket(srv.socket, server_side=True)
threading.Thread(target=srv.serve_forever, daemon=True).start()
port = srv.server_address[1]
G.SOURCES["selfsigned"] = {"url": f"https://127.0.0.1:{port}/{{z}}/{{x}}/{{y}}.png", "max_zoom": 6, "type": "png", "offline": True, "attribution": "test"}
try:
    G.tile_for("selfsigned", 1, 0, 0)
    why = None
except G.FetchFailed as exc:
    why = str(exc)
fail = G.failures()["sources"].get("selfsigned")
job = G.Job("globe-min", 341)
G._run_extract(job, [(z, 0, (1 << z) - 1, 0, (1 << z) - 1) for z in range(0, 5)], ${JSON.stringify(`${dir}/x.pmtiles`)}, "selfsigned", {}, (-180, -85, 180, 85), [], 0)
# the same server, trusted: the tile comes and the failure is gone
em_net._CTX = em_net.new_context(); em_net._CTX.load_verify_locations(${JSON.stringify(`${dir}/c.pem`)})
data, where = G.tile_for("selfsigned", 2, 1, 1)
print(json.dumps({"why": why, "fail": fail, "job": job.view(), "after": [data.decode(), where], "left": G.failures()["sources"]}))`);
  ok(/^certificate not verifiable \(/.test(r.why ?? ""), `a self-signed server: «${r.why}», not «URLError»`);
  ok(r.fail?.reason === r.why && r.fail.count >= 1, "/tiles/failures names the source and the reason");
  eq(r.after, ["png", "online"], "trusted, the same server answers the tile");
  eq(r.left, {}, "and the source's failure is cleared by the tile that came");
} else {
  console.log("  · no openssl on PATH: the self-signed server (part 4) is skipped");
}

// ── 5 · a bridge for real ───────────────────────────────────────────────────
{
  const port = await new Promise((res) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
  const tc = spawnSync(PY, [`${TOOLS}em_bridge.py`, "--tls-check"], { encoding: "utf8", env: { ...process.env, ...NO_CA } });
  eq(tc.status, 0, "--tls-check: 0 when certifi's bundle is there");
  ok(JSON.parse(tc.stdout).present === true, "--tls-check names the bundle");
  const p = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", dir, "--s3dgraphy", `${S3D}src`],
    { env: { ...process.env, ...NO_CA, EM_BRIDGE_STATE_DIR: `${dir}/state` }, stdio: "ignore" });
  try {
    let h = null;
    for (let i = 0; i < 80 && !h; i++) {
      await new Promise((r) => setTimeout(r, 250));
      h = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json(), () => null);
    }
    eq(h?.tls_ca, "certifi", "/health: the bridge's HTTPS trust comes from certifi");
    const f = await fetch(`http://127.0.0.1:${port}/tiles/failures`, { headers: { Origin: "http://localhost:5173" } }).then((r) => r.json());
    eq([f.ok, f.sources], [true, {}], "/tiles/failures answers (nothing failing yet)");
  } finally {
    p.kill();
  }
}

console.log(`bridge-tls: ${checks} checks passed`);
