// MICRO-SPAZIO-FIRMATO · in a room the 3D scene asks the node for the bytes
// WITH the signature, and a proxy the node serves is drawn.
//
//   node scripts/check-spazio-firmato.mjs
//
// A fake node answers `…/v1/rooms/R/asset/<digest>` 401 without a bearer and
// 200 with the right one (measured on em.localhost:8443, 13 ott 2026: the same
// two answers, HEAD and GET). The Scena 3D (`scene3d.ts`) and the Doc's viewer
// (`embed3d-native.ts`) are bundled with esbuild, the road (`node-road.ts`) set
// the way `main.ts` sets it — a fetch that writes the bearer in the HEADER at
// each send, as `nodeAuthFetch` does. Checked: with the token the glb is
// fetched and drawn; without it the scene says «access» and not «file
// missing»; a 404 stays «missing»; the token never appears in a URL asked; and
// `space.ts` keeps a refused file apart from a missing one.
//
// Needs playwright-core (PLAYWRIGHT_CORE, or the audit's copy) and its Chromium.
import * as esbuild from "esbuild";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SRC = new URL("../src/", import.meta.url).pathname;
const GLB = readFileSync(new URL("../testdata/lod/muro_LOD3.glb", import.meta.url));
const TOKEN = "TOKEN-firmato-0123456789";
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

let checks = 0;
const failures = [];
function ok(condition, what, detail = "") {
  checks += 1;
  console.log(`${condition ? "PASS" : "FAIL"}: ${what}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(what);
}

// ── space.ts: a refused file is not a missing one ───────────────────────────
{
  const b = await esbuild.build({ stdin: { contents: `export * from "./space";`, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false });
  const M = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
  const doc = JSON.parse(readFileSync(new URL("../testdata/spazio.em.json", import.meta.url), "utf8"));
  const UNITS = new Set(["US", "USVs", "USVn", "SF", "RSF", "VSF", "USD", "USM"]);
  const isUnit = (t) => UNITS.has(t);
  const sp = M.buildSpace(doc, { isUnit, refused: new Set(["RP_US103"]) });
  const med = sp.summary("EP_MED");
  ok(sp.proxies.get("US103").resource?.state === "refused", "space · a file the node refused is «refused»");
  ok(med.refused.join() === "US103" && med.missing.length === 0, "space · …listed apart, not among the missing",
     JSON.stringify({ refused: med.refused, missing: med.missing }));
  const sp2 = M.buildSpace(doc, { isUnit, notFound: new Set(["RP_US103"]) });
  ok(sp2.summary("EP_MED").missing.join() === "US103", "space · a file not found stays «missing»");
}

// ── the browser half ────────────────────────────────────────────────────────
const viteUrl = { name: "vite-url", setup(b) {
  b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: "vite-url" }));
  b.onLoad({ filter: /.*/, namespace: "vite-url" }, (a) => ({
    contents: `export default ${JSON.stringify("url:" + a.path.replace(/\?url$/, "").split("/").pop())};`, loader: "js" }));
} };
const bundle = (await esbuild.build({
  stdin: { contents: `export { mountSpaceScene } from "./scene3d"; export { mount3dViewer } from "./embed3d-native";
                      export { setNodeRoad } from "./node-road";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, define: { __EM_LAZY_3D__: "false" }, logLevel: "silent", plugins: [viteUrl],
})).outputFiles[0].text;

const asked = [];          // every URL the server saw, and with which bearer
const server = createServer((req, res) => {
  asked.push({ url: req.url, method: req.method, auth: req.headers.authorization ?? null });
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><body style="margin:0"><div id="scn" style="width:640px;height:400px;position:relative"></div>
      <div id="doc" style="width:640px;position:relative"></div><script type="module" src="/bundle.js"></script></body>`);
    return;
  }
  if (req.url === "/bundle.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(bundle + `\nwindow.__M = { mountSpaceScene, mount3dViewer, setNodeRoad };`);
    return;
  }
  const m = /^\/em\/v1\/rooms\/R\/asset\/([^/?]+)$/.exec(req.url ?? "");
  if (m) {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); res.end(); return; }
    if (decodeURIComponent(m[1]) !== "sha256:b793dd12") { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": "model/gltf-binary", "content-length": String(GLB.length) });
    res.end(req.method === "HEAD" ? undefined : GLB);
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const ASSET = `${BASE}/em/v1/rooms/R/asset/${encodeURIComponent("sha256:b793dd12")}`;
const ABSENT = `${BASE}/em/v1/rooms/R/asset/${encodeURIComponent("sha256:00000000")}`;

async function playwright() {
  const tries = [process.env.PLAYWRIGHT_CORE, "playwright-core",
    new URL("../../.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js", import.meta.url).pathname];
  for (const t of tries) {
    if (!t) continue;
    try {
      const m = t.startsWith("/") ? await import(t) : require(t);
      return m.chromium ? m : m.default;
    } catch { /* next */ }
  }
  throw new Error("playwright-core not found: set PLAYWRIGHT_CORE");
}
const { chromium } = await playwright();
const browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
const pageUrls = [];
page.on("request", (r) => pageUrls.push(r.url()));
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(BASE);
await page.waitForFunction(() => !!window.__M, null, { timeout: 30000 });

// one mount of the scene per case, with the road as main.ts sets it
const scene = (token, url) => page.evaluate(async ({ token, url }) => {
  const { mountSpaceScene, setNodeRoad } = window.__M;
  setNodeRoad({
    owns: (u) => /\/v1\/rooms\/[^/]+\/asset\//.test(u),
    fetch: (u, init = {}) => {
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(u, { ...init, headers });
    },
  });
  const host = document.getElementById("scn");
  host.textContent = "";
  delete host.dataset.ready;
  const notFound = [];
  const h = mountSpaceScene(host, {
    texts: { loading: "…", noEngine: "no engine", referenceOnly: (x) => `${x}: ref`, missing: (x) => `${x}: declared, file missing`,
             refused: (x) => `${x}: the node did not give the file (access)`, overLimit: (x) => x, openTileset: "", loadAnyway: "",
             lodNote: () => "" },
    onNotFound: (rid, why) => notFound.push([rid, why]),
  });
  h.update([{ kind: "proxy", id: "US1", label: "US 1", state: "resident", url, resourceId: "R1", rgb: [0.3, 0.03, 0.03] }]);
  const t0 = Date.now();
  while (host.dataset.ready !== "1" && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  const out = { drawn: host.__space?.() ?? null, labels: [...host.querySelectorAll(".scn-label")].map((l) => [l.className, l.textContent]),
                notFound };
  h.dispose();
  return out;
}, { token, url });

{
  const r = await scene(TOKEN, ASSET);
  const d = r.drawn?.[0];
  ok(d?.as === "mesh" && d?.state === "resident", "scene · with the token the proxy's glb is fetched and DRAWN", JSON.stringify(r.drawn));
  ok(!r.labels.some(([c]) => /miss/.test(c)) && r.notFound.length === 0, "scene · …and nothing says «missing»", JSON.stringify(r.labels));
}
{
  const r = await scene(null, ASSET);
  const d = r.drawn?.[0];
  ok(d?.as === "label" && d?.state === "refused", "scene · without the token the proxy is «refused», not drawn", JSON.stringify(r.drawn));
  ok(r.labels.some(([c, t]) => /refused/.test(c) && /access/.test(t)) && !r.labels.some(([, t]) => /file missing/.test(t)),
     "scene · …its label says «access», not «file missing»", JSON.stringify(r.labels));
  ok(JSON.stringify(r.notFound) === JSON.stringify([["R1", "refused"]]), "scene · …and the caller hears «refused»", JSON.stringify(r.notFound));
}
{
  const r = await scene(TOKEN, ABSENT);
  ok(r.drawn?.[0]?.state === "missing" && JSON.stringify(r.notFound) === JSON.stringify([["R1", "missing"]]),
     "scene · a 404 with the token stays «missing»", JSON.stringify(r));
}
{
  // a failure is not kept: the same URL, refused first, is drawn once the token is there
  const r1 = await scene(null, ASSET);
  const r2 = await scene(TOKEN, ASSET);
  ok(r1.drawn?.[0]?.state === "refused" && r2.drawn?.[0]?.as === "mesh", "scene · refused, then with the token drawn (nothing kept)");
}

// the Doc's viewer: the same store URL
const doc = (token) => page.evaluate(async ({ token, url }) => {
  const { mount3dViewer, setNodeRoad } = window.__M;
  setNodeRoad({
    owns: (u) => /\/v1\/rooms\/[^/]+\/asset\//.test(u),
    fetch: (u, init = {}) => {
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(u, { ...init, headers });
    },
  });
  const host = document.getElementById("doc");
  host.textContent = "";
  for (const k of Object.keys(host.dataset)) delete host.dataset[k];
  const v = mount3dViewer(host, url, { model: { lods: false } });
  const t0 = Date.now();
  while (host.dataset.ready !== "1" && host.dataset.refused !== "1" && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  const out = { ready: host.dataset.ready ?? null, refused: host.dataset.refused ?? null, text: host.textContent };
  v.dispose();
  return out;
}, { token, url: ASSET });
{
  const r = await doc(TOKEN);
  ok(r.ready === "1", "doc viewer · with the token the store's glb opens", JSON.stringify(r));
  const r2 = await doc(null);
  ok(r2.refused === "1" && r2.ready === null, "doc viewer · without it, the refusal is said as access", JSON.stringify(r2));
}

ok(asked.some((a) => a.auth === `Bearer ${TOKEN}`), "the node was asked WITH the bearer, in the header");
ok(![...asked.map((a) => a.url), ...pageUrls].some((u) => u.includes(TOKEN)), "the token is in NO URL asked",
   `${asked.length} server requests, ${pageUrls.length} page requests`);
ok(errors.length === 0, "no page error", errors.join(" | "));

await browser.close();
server.close();
console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) process.exit(1);
