// MICRO-FILE-DELLA-STANZA (EMStudio#2, PR #3), LIVE: a room filled by ANOTHER
// tool (`s3dgraphy room-import`, as pyArchInit's «Send site»): a unit with a
// photo and a GeoJSON plan in EPSG:3004, the scene in EPSG:32633. Opened in
// EMStudio (the node's sign-in, the join, the snapshot): the Inspector of the
// unit shows the photo (a blob fetched with the token), the viewer opens it,
// the plan is drawn in the Space through the bridge's cache by sha256
// (`/gis/store`, reprojected 3004 → 32633), and a second opening (a new page)
// reads it from that cache without sending the bytes again.
//
//   node scripts/check-room-files-live.mjs
//
// Needs: the dev stack up (https://em.localhost:8443/em, EM_NODE), Vite on 5173
// serving this tree, the s3Dgraphy venv (it starts ITS bridge, level ≥ 97, on
// a free port with a cache of its own), playwright-core with its Chromium. The
// room it makes is DELETED at the end.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const HERE = new URL(".", import.meta.url).pathname;
const NODE = process.env.EM_NODE ?? "https://em.localhost:8443/em";
const APP = process.env.APP ?? "http://localhost:5173";
const USER = process.env.LIVE_USER ?? "dev";
const PASSWORD = process.env.LIVE_PASSWORD ?? USER;
const S3D = process.env.S3DGRAPHY_DIR ?? `${HERE}../../../s3Dgraphy/`;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";   // the dev stack's own CA, for this script's fetches only

async function playwright() {
  const tries = [process.env.PLAYWRIGHT_CORE, "playwright-core",
    new URL("../../.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js", import.meta.url).pathname];
  for (const t of tries) {
    if (!t) continue;
    try { const m = t.startsWith("/") ? await import(t) : require(t); return m.chromium ? m : m.default; } catch { /* next */ }
  }
  throw new Error("playwright-core not found: set PLAYWRIGHT_CORE");
}

let checks = 0;
const failures = [];
const t0 = Date.now();
const ms = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
function ok(condition, what, detail = "") {
  checks += 1;
  console.log(`${condition ? "PASS" : "FAIL"} [${ms()}]: ${what}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(what);
}

// ── the study, made here: one unit, one photo, one plan (EPSG:3004) ─────────
let token;
try { token = execFileSync(`${HERE}../../../stratigraph-server/dev-stack/token.sh`, { encoding: "utf8" }).trim(); }
catch { token = null; }
if (!token) { console.log("room-files-live: no token — is the stack up? SKIPPED"); process.exit(0); }
const work = mkdtempSync(path.join(os.tmpdir(), "room-files-live-"));
mkdirSync(`${work}/foto`); mkdirSync(`${work}/plans`);
const W = 64, H = 48;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw.set(y > 20 && y < 28 ? [40, 40, 40] : [200, 150, 60], y * (W * 3 + 1) + 1 + x * 3);
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const td = Buffer.concat([Buffer.from(t), d]); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr.set([8, 2, 0, 0, 0], 8);
writeFileSync(`${work}/foto/US_1_1.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
const E0 = 2313000, N0 = 4640000;
writeFileSync(`${work}/plans/3dc36e3c.geojson`, JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { us: "1" },
  geometry: { type: "Polygon", coordinates: [[[E0, N0], [E0 + 12, N0], [E0 + 12, N0 + 8], [E0, N0 + 8], [E0, N0]]] } }] }));
const node = (id, node_type, name, data = {}) => ({ id, node_type, name, description: "", data });
writeFileSync(`${work}/site.em.json`, JSON.stringify({ header: { format: "em.json", version: "1.0" }, graph: { graph_id: "room-files-live", name: "Room files (live)",
  description: "", data: {}, nodes: [
    node("EP1", "EpochNode", "Età romana", { start_time: -100, end_time: 300 }),
    node("US1", "US", "1.1.US1"),
    node("RPH", "resource", "US_1_1.png", { url: "foto/US_1_1.png" }),
    node("RPL", "resource", "3dc36e3c.geojson", { url: "plans/3dc36e3c.geojson", url_type: "gis_layer", gis_format: "geojson", crs: "EPSG:3004" }),
    // EPSG:3004 (2313000, 4640000) in EPSG:32633, pyproj: (292996.1, 4639989.8)
    node("GEO", "geo_position", "geo_position", { epsg: 32633, shift_x: 292996.1, shift_y: 4639989.8, shift_z: 0 }),
  ], edges: [
    { id: "e1", edge_type: "has_first_epoch", source: "US1", target: "EP1" },
    { id: "e2", edge_type: "has_linked_resource", source: "US1", target: "RPH" },
    { id: "e3", edge_type: "has_linked_resource", source: "US1", target: "RPL" },
  ] }, layout: {} }));
const room = `room-files-${Date.now().toString(36)}`;
const imp = JSON.parse(execFileSync(PY, ["-m", "s3dgraphy", "room-import", `${work}/site.em.json`, "--node", NODE, "--room", room,
  "--title", `Room files ${room}`, "--token", token, "--journal", `${work}/journal.json`, "--report-dir", work, "--work-dir", `${work}/packs`, "--json"],
  { env: { ...process.env, PYTHONPATH: `${S3D}src` }, encoding: "utf8", maxBuffer: 1 << 26 }));
ok((imp.uploaded?.files ?? 0) + (imp.already?.files ?? 0) === 2, `room-import: 2 files in «${room}» (sent, or already on the node by sha256)`,
   JSON.stringify({ uploaded: imp.uploaded, already: imp.already }));

async function deleteRoom() {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${NODE}/v1/rooms/${encodeURIComponent(room)}`, {
      method: "DELETE", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ confirm: room }) }).catch((e) => ({ status: 0, text: async () => String(e) }));
    if (r.status === 200 || r.status === 404) return r.status === 200 ? "deleted" : "not there";
    if (r.status !== 409) return `NOT deleted (${r.status} ${(await r.text()).slice(0, 120)})`;
    await new Promise((res) => setTimeout(res, 500));
  }
  return "NOT deleted (somebody still connected after 10 s)";
}

// ── the bridge of this tree, with a cache of its own ─────────────────────────
const cache = mkdtempSync(path.join(os.tmpdir(), "room-files-gis-"));
const port = 18765 + Math.floor(Math.random() * 500);
const bridge = spawn(PY, [`${HERE}../../tools/em_bridge.py`, "--port", String(port)],
  { env: { ...process.env, EM_GIS_STORE_DIR: cache }, stdio: ["ignore", "ignore", "pipe"] });
const bridgeLog = [];
bridge.stderr.on("data", (d) => bridgeLog.push(...String(d).split("\n").filter(Boolean)));
const BR = `http://127.0.0.1:${port}`;
for (let i = 0; i < 150; i++) { try { if ((await fetch(`${BR}/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }
const health = await (await fetch(`${BR}/health`)).json();
ok(health.bridge_level >= 97, `the bridge of this tree (level ${health.bridge_level}) on :${port}`);

const link = `stratigraph://open?server=${encodeURIComponent(NODE)}&room=${room}&node=US1`;
const { chromium } = await playwright();
const browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined });
const storePosts = [];
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 950 } });
  // the bridge of this tree: `?bridge=` does not survive the sign-in's way back
  await context.addInitScript((b) => { window.EM_BRIDGE = b; }, BR);
  context.on("request", (rq) => {
    if (rq.url().includes("/gis/store")) storePosts.push({ at: ms(), bytes: rq.postDataBuffer()?.length ?? 0 });
    if (rq.url().startsWith(BR) && rq.headers().authorization) failures.push("a bearer went to the bridge");
  });
  const assets = [];
  context.on("request", (rq) => { if (/\/asset\/sha256:/.test(rq.url())) assets.push({ req: rq.url().replace(/^(https?:\/\/[^/]+).*(sha256:.{8}).*$/, "$1…$2"), bearer: !!rq.headers().authorization }); });
  context.on("response", (rs) => { if (/\/asset\/sha256:/.test(rs.url())) assets.push({ status: rs.status(), url: rs.url().replace(/^(https?:\/\/[^/]+).*(sha256:.{8}).*$/, "$1…$2") }); });

  const open = async (page, signIn) => {
    await page.goto(`${APP}/?handoff=${encodeURIComponent(link)}`);
    if (signIn) {
      await page.waitForSelector("#username", { timeout: 60000 });
      await page.fill("#username", USER);
      await page.fill("#password", PASSWORD);
      await Promise.all([page.waitForURL((u) => u.toString().startsWith(APP), { timeout: 60000 }), page.click("#kc-login")]);
    }
    await page.waitForFunction(() => window.__EM_DRAG__?.selected?.().includes("US1"), null, { timeout: 60000 });
  };

  // ── 1 · the Inspector of the unit: the photo, a blob fetched with the token ─
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  await open(page, true);
  ok(true, "signed in, the room joined, 1.1.US1 selected");
  // the workspace that has an Inspector (the room's layout opens on «Viewer & card»)
  const wsWithInspector = await page.evaluate(async () => {
    for (const t of document.querySelectorAll("#workspace-bar .ws-tab[data-ws]")) {
      t.click();
      await new Promise((r) => setTimeout(r, 700));
      if (document.querySelector(".ims-row")) return t.dataset.ws;
    }
    return null;
  });
  console.log(`    the Inspector's strip in workspace «${wsWithInspector}»`);
  const strip = await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll(".ims-row img")];
    const done = imgs.filter((i) => i.src.startsWith("blob:") && i.complete && i.naturalWidth > 0);
    return done.length ? { n: imgs.length, w: done[0].naturalWidth, h: done[0].naturalHeight } : null;
  }, null, { timeout: 30000 }).then((h) => h.jsonValue(), () => null);
  ok(!!strip && strip.w === 64 && strip.h === 48, "Inspector: the photo of the room is shown (blob, 64×48)",
     JSON.stringify(strip ?? await page.evaluate(() => [...document.querySelectorAll(".ims-row img, .ims-row figure, [class*=ims] img")].map((i) => `${i.tagName}.${i.className}:${(i.src ?? "").slice(0, 40)}`).slice(0, 6))));
  ok(assets.some((a) => a.status === 200) && !assets.some((a) => a.status === 401), "the store answered 200 (the token sent), never 401",
     JSON.stringify({ assets, thumbs: await page.evaluate(() => window.__EM_DRAG__.thumbStats()) }));

  // ── 2 · the viewer ──────────────────────────────────────────────────────────
  await page.evaluate(() => window.__EM_DRAG__.openMediaViewer("US1"));
  const viewer = await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll(".mv-single img, .mv-grid img")].filter((i) => i.src.startsWith("blob:") && i.complete && i.naturalWidth > 0);
    return imgs.length ? imgs.length : null;
  }, null, { timeout: 30000 }).then((h) => h.jsonValue(), () => null);
  ok(!!viewer, "the viewer shows the photo", `images ${viewer}`);
  await page.screenshot({ path: `${work}/inspector-viewer.png` });

  // ── 3 · the plan in the Space, through the bridge's cache ───────────────────
  const gisOf = (p) => p.evaluate(() => (window.__EM_DRAG__.documentResidue().scenes ?? []).map((s) => s.gis).find(Boolean) ?? null);
  const space = async (p) => {
    await p.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="space"]')?.click());
    return p.waitForFunction(() => {
      const g = (window.__EM_DRAG__.documentResidue().scenes ?? []).map((s) => s.gis).find(Boolean);
      const d = (g?.driver?.drawn ?? []).find((x) => x.id === "RPL");
      return d && (d.features || d.error) ? d : null;
    }, null, { timeout: 60000 }).then((h) => h.jsonValue(), () => null);
  };
  const drawn = await space(page);
  ok(!!drawn && drawn.features === 1 && !drawn.error, "Space: the plan is drawn (1 feature)", JSON.stringify(drawn ?? (await gisOf(page))?.driver ?? null).slice(0, 300));
  ok(drawn?.layer_crs === "EPSG:3004" && /3004/.test(String(drawn?.said ?? "")) && /32633/.test(String(drawn?.said ?? "")),
     "…reprojected EPSG:3004 → the scene's EPSG:32633", String(drawn?.said ?? ""));
  const kept = readdirSync(cache, { recursive: true }).filter((f) => /\.geojson$/.test(String(f)));
  ok(kept.length === 1, "the bridge keeps it once, by sha256", kept.join(", "));
  const sent1 = storePosts.filter((x) => x.bytes > 0).length;
  ok(sent1 === 1, "the bytes handed to the bridge once", JSON.stringify(storePosts));
  await page.screenshot({ path: `${work}/space.png` });

  // ── 4 · a second opening: a new page, the cache answers ────────────────────
  await page.close();
  const before = storePosts.length;
  const p2 = await context.newPage();
  await open(p2, false);
  const again = await space(p2);
  const posts2 = storePosts.slice(before);
  ok(!!again && again.features === 1, "second opening: the plan drawn again", JSON.stringify(again).slice(0, 200));
  ok(posts2.length >= 1 && posts2.every((x) => x.bytes === 0), "…from the bridge's cache: asked, no bytes sent", JSON.stringify(posts2));
  ok(readdirSync(cache, { recursive: true }).filter((f) => /\.(geojson|part)$/.test(String(f))).length === 1, "…still one file, no temporary per view");
  if (process.env.DEBUG) console.log("CONSOLE:", logs.slice(-40).join("\n"));
} catch (err) {
  ok(false, "the run went to its end", String(err.message ?? err).split("\n")[0]);
} finally {
  await browser.close();
  bridge.kill();
  console.log(`room ${room}: ${await deleteRoom()}`);
  console.log(`screenshots in ${work}`);
  rmSync(cache, { recursive: true, force: true });
}
console.log(`\nroom-files-live: ${checks - failures.length}/${checks} passed (${ms()})`);
if (failures.length) { console.log("failures:", failures); process.exit(1); }
