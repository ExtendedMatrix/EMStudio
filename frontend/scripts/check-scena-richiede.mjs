// MICRO-SCENA-RICHIEDE · a refused or missing file is true of the state of the
// graph it was born in: when the room's document changes what the Space cites,
// the scene asks again, and draws what arrives — without a new token.
//
//   node scripts/check-scena-richiede.mjs
//
// Measured 13 Oct 2026 (room tavolo-2026-10-12, desktop dev.38): «Model for
// ME_EST_bk_LOD0: the node did not give the file (access)» at 20:28; at 20:30
// the same digest answered 200 to every editor — the first attempt was made
// while the bytes were in the store and the room did not cite them yet (the
// D-C gate's 403), and the refusal stayed until the editor left the room.
//
// A fake node answers `…/v1/rooms/R/asset/<digest>` 403 until the digest is
// CITED (the gate, flipped by the test when it relays the operation that cites
// it) and 200 after. The scene (`scene3d.ts`), the Space (`space.ts`) and the
// road (`node-road.ts`) are bundled with esbuild and driven as `main.ts` drives
// them: `SpaceMarks` keyed by room + token + `citationKey(doc)`, the scene
// rebuilt on each change of the document, a failure marked through
// `onNotFound`. Checked: refused first; the same state asked ONCE however many
// times it is drawn again; the citing operation → asked again and drawn, same
// token; a shape moved from v1 to v2 → v2 fetched and drawn.
//
// Needs playwright-core (PLAYWRIGHT_CORE, or the audit's copy) and its Chromium.
import * as esbuild from "esbuild";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SRC = new URL("../src/", import.meta.url).pathname;
const GLB = readFileSync(new URL("../testdata/lod/muro_LOD3.glb", import.meta.url));
const TOKEN = "TOKEN-scena-0123456789";
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

let checks = 0;
const failures = [];
function ok(condition, what, detail = "") {
  checks += 1;
  console.log(`${condition ? "PASS" : "FAIL"}: ${what}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(what);
}

const D_WEB = "sha256:b43c08d6";     // the web version of the RM, as measured
const D_V1 = "sha256:51a1e001";
const D_V2 = "sha256:51a1e002";

// a unit of the epoch whose proxy shape cites one resource
const docOf = (digest, url) => ({ graph: {
  nodes: [
    { id: "EP", node_type: "EpochNode", name: "Epoch 1", data: { start_time: 0, end_time: 100 } },
    { id: "US1", node_type: "US", name: "US1", data: {} },
    { id: "PX1", node_type: "property", name: "proxy", data: { property_type: "geometry" } },
    { id: "SH1", node_type: "semantic_shape", name: "US1_shape", data: { type: "generic" } },
    { id: "R1", node_type: "resource", name: "US1.glb",
      data: { checksum: digest, residency: "resident", url, url_type: "proxy_model" } },
    { id: "DOC1", node_type: "document", name: "D.01", data: {} },
  ],
  edges: [
    { id: "e1", edge_type: "has_first_epoch", source: "US1", target: "EP" },
    { id: "e2", edge_type: "has_property", source: "US1", target: "PX1" },
    { id: "e3", edge_type: "has_semantic_shape", source: "PX1", target: "SH1" },
    { id: "e4", edge_type: "has_linked_resource", source: "SH1", target: "R1" },
  ],
} });

// ── space.ts: the key follows what the Space cites, and nothing else ───────
{
  const b = await esbuild.build({ stdin: { contents: `export * from "./space";`, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false });
  const M = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
  const d0 = docOf(D_V1, "x");
  const k0 = M.citationKey(d0);
  const renamed = structuredClone(d0);
  renamed.graph.nodes[1].name = "US1 bis";
  renamed.graph.nodes[1].data.description = "riempimento";
  ok(M.citationKey(renamed) === k0, "key · a rename of the unit does not change it");
  const cited = structuredClone(d0);
  cited.graph.edges.push({ id: "e5", edge_type: "has_linked_resource", source: "DOC1", target: "R1" });
  ok(M.citationKey(cited) !== k0, "key · an edge that cites the resource changes it");
  const dropped = structuredClone(cited);
  dropped.graph.edges[4].attributes = { removed: true };
  ok(M.citationKey(dropped) === k0, "key · …and its tombstone (attributes.removed) gives the state back");
  const v2 = structuredClone(d0);
  v2.graph.nodes[4].data.checksum = D_V2;
  ok(M.citationKey(v2) !== k0, "key · a new checksum changes it");
  const marks = new M.SpaceMarks();
  marks.at("a");
  ok(marks.mark("R1", "refused") && !marks.mark("R1", "refused"), "marks · a refusal is marked once");
  ok(!marks.at("a") && marks.refused.has("R1"), "marks · same key: kept");
  ok(marks.at("b") && !marks.refused.size, "marks · another key: emptied");
}

// ── the browser half ────────────────────────────────────────────────────────
const viteUrl = { name: "vite-url", setup(b) {
  b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: "vite-url" }));
  b.onLoad({ filter: /.*/, namespace: "vite-url" }, (a) => ({
    contents: `export default ${JSON.stringify("url:" + a.path.replace(/\?url$/, "").split("/").pop())};`, loader: "js" }));
} };
const bundle = (await esbuild.build({
  stdin: { contents: `export { mountSpaceScene } from "./scene3d"; export { setNodeRoad } from "./node-road";
                      export { buildSpace, citationKey, SpaceMarks } from "./space";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, define: { __EM_LAZY_3D__: "false" }, logLevel: "silent", plugins: [viteUrl],
})).outputFiles[0].text;

const cited = new Set([D_V1, D_V2]);   // the gate: what the room cites
const asked = [];
const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><body style="margin:0"><div id="scn" style="width:640px;height:400px;position:relative"></div>
      <script type="module" src="/bundle.js"></script></body>`);
    return;
  }
  if (req.url === "/bundle.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(bundle + `\nwindow.__M = { mountSpaceScene, setNodeRoad, buildSpace, citationKey, SpaceMarks };`);
    return;
  }
  const m = /^\/em\/v1\/rooms\/R\/asset\/([^/?]+)$/.exec(req.url ?? "");
  if (m) {
    const digest = decodeURIComponent(m[1]);
    asked.push({ digest, method: req.method });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); res.end(); return; }
    if (!cited.has(digest)) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, { "content-type": "model/gltf-binary", "content-length": String(GLB.length) });
    res.end(req.method === "HEAD" ? undefined : GLB);
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const assetUrl = (d) => `${BASE}/em/v1/rooms/R/asset/${encodeURIComponent(d)}`;
const gets = (d) => asked.filter((a) => a.digest === d && a.method === "GET").length;

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
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(BASE);
await page.waitForFunction(() => !!window.__M, null, { timeout: 30000 });

// the Space mounted as main.ts mounts it: one document, the marks keyed by
// room + token + citationKey, a refresh on each change and on each new mark
await page.evaluate(({ token }) => {
  const { mountSpaceScene, setNodeRoad, buildSpace, citationKey, SpaceMarks } = window.__M;
  setNodeRoad({
    owns: (u) => /\/v1\/rooms\/[^/]+\/asset\//.test(u),
    fetch: (u, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(u, { ...init, headers });
    },
  });
  const host = document.getElementById("scn");
  const marks = new SpaceMarks();
  const S = window.__S = { doc: null, refreshes: 0 };
  const refresh = () => {
    S.refreshes++;
    marks.at(`R\u0000${token}\u0000${citationKey(S.doc)}`);
    const sp = buildSpace(S.doc, { isUnit: (t) => t === "US", notFound: marks.notFound, refused: marks.refused, fromStore: true });
    const sum = sp.summary("EP");
    const items = sum.withProxy.map((u) => {
      const r = sp.proxies.get(u).resource;
      return { kind: "proxy", id: u, label: u, state: r.state, url: r.url, resourceId: r.id, rgb: [0.3, 0.03, 0.03] };
    });
    delete host.dataset.ready;
    h.update(items);
  };
  const h = mountSpaceScene(host, {
    texts: { loading: "…", noEngine: "no engine", referenceOnly: (x) => `${x}: ref`, missing: (x) => `${x}: declared, file missing`,
             refused: (x) => `${x}: the node did not give the file (access)`, overLimit: (x) => x, openTileset: "", loadAnyway: "",
             lodNote: () => "" },
    onNotFound: (rid, why) => { if (marks.mark(rid, why)) queueMicrotask(refresh); },
  });
  // what the relay does: the document changes, the store's change redraws
  S.set = (doc) => { S.doc = doc; refresh(); };
}, { token: TOKEN });

const settle = () => page.evaluate(async () => {
  const host = document.getElementById("scn");
  const t0 = Date.now();
  let last = "";
  // quiet for 400 ms: the scene is drawn and no refresh follows a new mark
  for (let quiet = 0; quiet < 4 && Date.now() - t0 < 20000;) {
    await new Promise((r) => setTimeout(r, 100));
    const now = `${host.dataset.ready}|${window.__S.refreshes}`;
    quiet = host.dataset.ready === "1" && now === last ? quiet + 1 : 0;
    last = now;
  }
  return { drawn: host.__space?.() ?? null, labels: [...host.querySelectorAll(".scn-label")].map((l) => [l.className, l.textContent]),
           refreshes: window.__S.refreshes };
});
const relay = (doc) => page.evaluate((doc) => window.__S.set(doc), doc);

// ── 1 · refused until the room cites the digest, then asked again and drawn ─
{
  const doc0 = docOf(D_WEB, assetUrl(D_WEB));
  await relay(doc0);
  const r0 = await settle();
  ok(r0.drawn?.[0]?.state === "refused" && r0.labels.some(([c, t]) => /refused/.test(c) && /access/.test(t)),
     "refused · before the citation the scene says «access»", JSON.stringify(r0));
  ok(gets(D_WEB) === 1, "refused · …asked once", `GET ${gets(D_WEB)}`);
  // the document is drawn again, on the same state: nothing is asked again
  const renamed = structuredClone(doc0);
  renamed.graph.nodes[1].data.description = "riempimento";
  await relay(renamed);
  await relay(structuredClone(renamed));
  const r1 = await settle();
  ok(r1.drawn?.[0]?.state === "refused" && gets(D_WEB) === 1,
     "no loop · the same state drawn again three times: still one GET", `GET ${gets(D_WEB)}, ${r1.refreshes} refreshes`);
  // the operation that cites it arrives; the gate opens with it; same token
  cited.add(D_WEB);
  const citing = structuredClone(renamed);
  citing.graph.edges.push({ id: "e5", edge_type: "has_linked_resource", source: "DOC1", target: "R1" });
  await relay(citing);
  const r2 = await settle();
  ok(r2.drawn?.[0]?.as === "mesh" && r2.drawn?.[0]?.state === "resident",
     "cited · the scene asked again and DREW it, without a new token", JSON.stringify(r2.drawn));
  ok(gets(D_WEB) === 2 && !r2.labels.some(([c]) => /miss/.test(c)), "cited · …one GET more, and no «access» left",
     `GET ${gets(D_WEB)} · ${JSON.stringify(r2.labels)}`);
}

// ── 2 · a shape moved from v1 to v2: the scene loads v2 ─────────────────────
{
  const v1 = docOf(D_V1, assetUrl(D_V1));
  await relay(v1);
  const r1 = await settle();
  ok(r1.drawn?.[0]?.as === "mesh" && gets(D_V1) === 1, "v1 · drawn", JSON.stringify(r1.drawn));
  // the relay: the old citation tombstoned, the new version cited
  const v2 = structuredClone(v1);
  v2.graph.edges[3].attributes = { removed: true };
  v2.graph.nodes.push({ id: "R2", node_type: "resource", name: "US1_v2.glb",
    data: { checksum: D_V2, residency: "resident", url: assetUrl(D_V2), url_type: "proxy_model" } });
  v2.graph.edges.push({ id: "e6", edge_type: "has_linked_resource", source: "SH1", target: "R2" });
  await relay(v2);
  const r2 = await settle();
  ok(r2.drawn?.[0]?.as === "mesh" && gets(D_V2) === 1, "v2 · the scene fetched v2 and drew it",
     `${JSON.stringify(r2.drawn)} · GET v2 ${gets(D_V2)}`);
  ok(gets(D_V1) === 1, "v2 · …and did not fetch v1 again", `GET v1 ${gets(D_V1)}`);
}

ok(errors.length === 0, "no page error", errors.join(" | "));

await browser.close();
server.close();
console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) process.exit(1);
