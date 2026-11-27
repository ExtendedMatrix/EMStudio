// MICRO-BK1, LIVE: a deposit into a room's bucket asks for, and writes, a DTC.
//
// A room made here (one document, D.1), opened in EMStudio with the node's
// sign-in, D.1 selected. In Archive ▸ room store («s3») the delivery form:
//
//   · the kinds are the vocabulary's (dtc_kinds.acquisition), the default is
//     the ingestion, the document is PRE-FILLED from the selection;
//   · no licence → not signed; a capture without its date → not signed;
//   · a capture declared (photo, 2015-07-03, campaign, technique, software,
//     CC-BY-4.0, embargo) and a file dropped: the bytes land, and
//       – the stamp that travels to the store says photo / technique / campaign
//         / the capture's date, and `declared` the licence and embargo;
//       – the register's acquisition carries dtc_kind photo;
//       – the graph links D.1 → has_linked_resource → the new resource.
//
//   node scripts/check-bucket-dtc-live.mjs
//
// Needs: the dev stack up (https://em.localhost:8443/em, EM_NODE), Vite on 5173
// serving this tree, the s3Dgraphy venv and dtcstamp beside it (it starts ITS
// bridge on a free port), playwright-core with its Chromium. The room it makes is
// DELETED at the end.
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = new URL(".", import.meta.url).pathname;
const NODE = process.env.EM_NODE ?? "https://em.localhost:8443/em";
const APP = process.env.APP ?? "http://localhost:5173";
const USER = process.env.LIVE_USER ?? "dev";
const PASSWORD = process.env.LIVE_PASSWORD ?? USER;
const S3D = process.env.S3DGRAPHY_DIR ?? `${HERE}../../../s3Dgraphy/`;
const DTC = `${HERE}../../../dtcstamp/`;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const ORCID = "0000-0002-1825-0097";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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

let token;
try { token = execFileSync(`${HERE}../../../stratigraph-server/dev-stack/token.sh`, { encoding: "utf8" }).trim(); }
catch { token = null; }
if (!token) { console.log("bucket-dtc-live: no token — is the stack up? SKIPPED"); process.exit(0); }

// ── the room: one epoch, one unit, one document ──────────────────────────────
const work = mkdtempSync(path.join(os.tmpdir(), "bucket-dtc-live-"));
const node = (id, node_type, name, data = {}) => ({ id, node_type, name, description: "", data });
writeFileSync(`${work}/site.em.json`, JSON.stringify({ header: { format: "em.json", version: "1.0" },
  graph: { graph_id: "bucket-dtc-live", name: "Bucket DTC (live)", description: "", data: {}, nodes: [
    node("EP1", "EpochNode", "Età romana", { start_time: -100, end_time: 300 }),
    node("US1", "US", "US1"),
    node("D1", "document", "D.1"),
  ], edges: [
    { id: "e1", edge_type: "has_first_epoch", source: "US1", target: "EP1" },
    { id: "e2", edge_type: "is_documented_by", source: "US1", target: "D1" },
  ] }, layout: {} }));
const room = `bucket-dtc-${Date.now().toString(36)}`;
execFileSync(PY, ["-m", "s3dgraphy", "room-import", `${work}/site.em.json`, "--node", NODE, "--room", room,
  "--title", `Bucket DTC ${room}`, "--token", token, "--journal", `${work}/journal.json`, "--report-dir", work,
  "--work-dir", `${work}/packs`, "--json"],
  { env: { ...process.env, PYTHONPATH: `${S3D}src` }, encoding: "utf8", maxBuffer: 1 << 26 });
ok(true, `room «${room}» made`);

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

// ── the bridge of this tree (dtcstamp on its path: it emits the stamps) ──────
const port = 19265 + Math.floor(Math.random() * 500);
const bridge = spawn(PY, [`${HERE}../../tools/em_bridge.py`, "--port", String(port), "--s3dgraphy", `${S3D}src`],
  { env: { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${work}/.state` },
    stdio: ["ignore", "ignore", "pipe"] });
const BR = `http://127.0.0.1:${port}`;
for (let i = 0; i < 150; i++) { try { if ((await fetch(`${BR}/health`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }

const link = `stratigraph://open?server=${encodeURIComponent(NODE)}&room=${room}&node=D1`;
const { chromium } = await playwright();
const browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined });
const jsonPuts = [];
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 1100 } });
  await context.addInitScript(([b, orcid, nodeUrl]) => {
    window.EM_BRIDGE = b;
    if (location.port === "5173" || location.host.startsWith("localhost")) {
      localStorage.setItem("emstudio.identities", JSON.stringify({
        current: orcid, known: [{ orcid, name: "Dev", surname: "User", verified: true, authMode: "orcid" }] }));
      const s = JSON.parse(localStorage.getItem("emstudio.settings") || "{}");
      s.sync = { ...(s.sync || {}), hubUrl: nodeUrl };
      localStorage.setItem("emstudio.settings", JSON.stringify(s));
    }
  }, [BR, ORCID, NODE]);
  // the stamps travel to the store as JSON objects of their own: catch the
  // store's answer (the ref), then read each one BACK from the node
  const jsonRefs = [];
  context.on("response", async (rs) => {
    if (rs.request().method() === "PUT" && /\/asset\?media_type=application%2Fjson/.test(rs.url())) {
      try { jsonRefs.push((await rs.json()).ref); } catch { /* no body */ }
    }
  });
  const readBack = async () => {
    jsonPuts.length = 0;
    for (const ref of jsonRefs) {
      const r = await fetch(`${NODE}/v1/rooms/${encodeURIComponent(room)}/asset/${encodeURIComponent(ref)}`,
        { headers: { authorization: `Bearer ${token}` } });
      try { jsonPuts.push(JSON.parse(await r.text())); } catch { jsonPuts.push({ status: r.status }); }
    }
  };

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message ?? e)));
  await page.goto(`${APP}/?handoff=${encodeURIComponent(link)}`);
  await page.waitForSelector("#username", { timeout: 60000 });
  await page.fill("#username", USER);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL((u) => u.toString().startsWith(APP), { timeout: 60000 }), page.click("#kc-login")]);
  await page.waitForFunction(() => window.__EM_DRAG__?.selected?.().includes("D1"), null, { timeout: 60000 });
  ok(true, "signed in, the room joined, D.1 selected");

  // ── the room store's panel ───────────────────────────────────────────────
  const opened = await page.evaluate(async () => {
    for (const t of document.querySelectorAll("#workspace-bar .ws-tab[data-ws]")) {
      if (window.__EM_DRAG__.storageAt().length) break;
      t.click();
      await new Promise((r) => setTimeout(r, 700));
    }
    if (!window.__EM_DRAG__.storageAt().length) return null;
    window.__EM_DRAG__.archiveView("s3");
    await new Promise((r) => setTimeout(r, 500));
    return window.__EM_DRAG__.storageAt()[0];
  });
  ok(opened?.mode === "s3", "Archive ▸ room store opened", JSON.stringify(opened));
  await page.waitForSelector('[data-field="bucket-kind"]', { timeout: 20000 });

  const form = () => page.evaluate(() => {
    const kind = document.querySelector('[data-field="bucket-kind"]');
    const doc = document.querySelector('[data-field="bucket-document"]');
    return {
      kinds: [...(kind?.querySelectorAll("option") ?? [])].map((o) => o.value),
      groups: [...(kind?.querySelectorAll("optgroup") ?? [])].map((g) => g.label),
      kind: kind?.value, document: doc?.value,
      unsigned: document.querySelector(".ing-delivery .ing-unsigned")?.textContent ?? null,
      signed: document.querySelector(".ing-delivery .ing-signed")?.textContent ?? null,
      capture: !!document.querySelector('[data-field="bucket-technique"]'),
      preview: document.querySelector(".ing-dtc-preview pre")?.textContent ?? "",
    };
  });
  let f = await form();
  ok(f.kinds.includes("photo") && f.kinds.includes("download") && f.kinds.includes("ingest") && f.groups.length === 2,
     "the kinds are the vocabulary's, in its two families", `${f.kinds.join(" ")} | ${f.groups.join(" / ")}`);
  ok(f.kind === "ingest", "the default kind is the ingestion");
  ok(f.document === "D1", "the document is pre-filled from the selection (D.1)");
  ok(!!f.unsigned && !f.signed, "no licence: not signed", f.unsigned ?? "");
  ok(!f.capture, "no technique box for a retrieval");

  // ── declare a capture ─────────────────────────────────────────────────────
  const set = async (sel, value) => {
    await page.evaluate(([s, v]) => {
      const el = document.querySelector(s);
      el.value = v;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, [sel, value]);
    await page.waitForTimeout(250);
  };
  // the licence box is the one with the «required» placeholder (no data-field)
  await page.evaluate(() => {
    const lic = [...document.querySelectorAll(".ing-delivery input.insp-name-input")]
      .find((i) => !i.dataset.field && i.type !== "date" && i.classList.contains("insp-input-bad"));
    lic.value = "CC-BY-4.0";
    lic.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await set('[data-field="bucket-kind"]', "photo");
  f = await form();
  ok(f.capture, "a capture offers campaign / technique / software");
  ok(!!f.unsigned, "a capture without its date: not signed", f.unsigned ?? "");
  await set('[data-field="bucket-madeAt"]', "2015-07-03");
  await set('[data-field="bucket-campaign"]', "Aiano 2015");
  await set('[data-field="bucket-technique"]', "close-range photogrammetry");
  await set('[data-field="bucket-software"]', "Metashape 2.1.3");
  await page.evaluate(() => {
    const until = document.querySelector('.ing-delivery input[type="date"]:not([data-field])');
    until.value = "2027-01-01";
    until.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(400);
  f = await form();
  ok(!!f.signed && !f.unsigned, "signed once the capture is said", f.signed ?? f.unsigned ?? "");
  let preview = null;
  try { preview = JSON.parse(f.preview); } catch { /* shown below */ }
  ok(preview?.profile === "em-bucket-dtc/1" && preview?.source?.dtc_kind === "photo"
     && preview?.rights?.license === "CC-BY-4.0" && preview?.target?.document_id === "D1"
     && preview?.when?.made_at === "2015-07-03",
     "«What will be written» shows the request", f.preview.slice(0, 160).replace(/\s+/g, " "));
  await page.screenshot({ path: `${work}/form.png`, fullPage: false });

  // ── drop a file ───────────────────────────────────────────────────────────
  const bytes = Buffer.from(`bucket-dtc-live ${room} ${Date.now()}`);
  await page.setInputFiles(".ing-funnel input[type=file]", { name: "scatto-01.txt", mimeType: "text/plain", buffer: bytes });
  const landed = await page.waitForFunction(() => {
    const doc = JSON.parse(window.__EM_DRAG__.docJson());
    const graphs = doc?.graphs ? Object.values(doc.graphs) : [doc?.graph].filter(Boolean);
    for (const g of graphs) {
      const res = (g.nodes ?? []).find((n) => n.name === "scatto-01.txt");
      if (res) {
        const linked = (g.edges ?? []).some((e) => e.source === "D1" && e.target === res.id && e.edge_type === "has_linked_resource");
        return { id: res.id, checksum: res.data?.checksum ?? null, linked };
      }
    }
    return null;
  }, null, { timeout: 30000 }).then((h) => h.jsonValue(), () => null);
  ok(!!landed?.checksum, "the bytes landed: a resource with its digest", JSON.stringify(landed));
  ok(!!landed?.linked, "D.1 → has_linked_resource → the new resource");

  for (let i = 0; i < 40 && !jsonPuts.some((s) => s?.self?.digest === landed?.checksum); i++) {
    await page.waitForTimeout(250);
    await readBack();
  }
  const stamp = jsonPuts.find((s) => s?.self?.digest === landed?.checksum);
  ok(!!stamp, "a stamp travelled to the store for these bytes",
     `${jsonPuts.length} JSON object(s) put: ${JSON.stringify(jsonPuts.map((s) => s?.self ?? Object.keys(s ?? {}))).slice(0, 300)}`);
  ok(stamp?.how?.dtc_kind === "photo" && stamp?.how?.technique === "close-range photogrammetry"
     && stamp?.how?.acquisition?.campaign === "Aiano 2015" && stamp?.how?.software?.[0]?.name === "Metashape",
     "…saying the capture: kind, technique, campaign, software", JSON.stringify(stamp?.how ?? null).slice(0, 240));
  ok(stamp?.by?.at === "2015-07-03T00:00:00Z", "…dated by the capture", stamp?.by?.at ?? "");
  ok(stamp?.declared?.license === "CC-BY-4.0" && stamp?.declared?.embargo_until === "2027-01-01",
     "…and `declared` the licence and the embargo", JSON.stringify(stamp?.declared ?? null));
  ok(!!stamp?.declared?.as_of && stamp.declared.as_of.slice(0, 4) !== "2015",
     "…as of the day it was said, not the day of the photograph", stamp?.declared?.as_of ?? "");

  // ── the register ──────────────────────────────────────────────────────────
  let acq = null;
  for (let i = 0; i < 20 && !acq; i++) {
    const r = await fetch(`${NODE}/v1/corpus?sha256=${encodeURIComponent(landed?.checksum ?? "")}`,
      { headers: { authorization: `Bearer ${token}` } });
    const body = r.ok ? await r.json() : null;
    acq = (body?.graph?.nodes ?? []).find((n) => n.node_type === "dtc_acquisition") ?? null;
    if (!acq) await new Promise((res) => setTimeout(res, 300));
  }
  ok(acq?.data?.dtc_kind === "photo" || acq?.data?.kind === "photo",
     "the register's acquisition says dtc_kind photo", JSON.stringify(acq?.data ?? null).slice(0, 240));
  ok(errors.length === 0, "no page error", errors.join(" | ").slice(0, 200));
  await page.screenshot({ path: `${work}/after.png`, fullPage: false });
} catch (err) {
  ok(false, "the run went to its end", String(err.message ?? err).split("\n")[0]);
} finally {
  await browser.close();
  bridge.kill();
  console.log(`room ${room}: ${await deleteRoom()}`);
  console.log(`screenshots in ${work}`);
}
console.log(`\nbucket-dtc-live: ${checks - failures.length}/${checks} passed (${ms()})`);
if (failures.length) { console.log("failures:", failures); process.exit(1); }
