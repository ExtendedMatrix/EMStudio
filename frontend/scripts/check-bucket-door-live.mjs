// MICRO-BK2, LIVE: EMStudio deposits through the bucket's door
// (`POST /v1/rooms/{room}/objects`, stratigraph-server ≥ 1.6.0-dev.93).
//
// A room made here, opened in EMStudio with the node's sign-in, Archive ▸ room
// store. On the dev node:
//
//   1 · a SURVEY (capture «topographic», its date, campaign, technique,
//       software), the depositor answering: ONE request through the door, the
//       record part first, none of the older steps; the register says the kind,
//       the facts and the depositor as responsible; the stamp read back says the
//       survey;
//   2 · a DOWNLOAD with a responsible accredited on the node (Editor Uno): the
//       form refuses an empty or malformed iD, the preview carries
//       who.responsible, the register says it;
//   3 · a responsible the node has NOT accredited: the file is refused with a
//       sentence naming the iD, and its bytes are not in the store;
//   4 · an OLDER node (the profile and the door answer 404, routed in the page):
//       a responsible stops the delivery before any byte moves; without one the
//       file goes the older way (PUT + three acts), said in the log.
//
//   node scripts/check-bucket-door-live.mjs
//
// Needs what check-bucket-dtc-live needs (dev stack up, Vite 5173 on this tree,
// the s3Dgraphy venv and dtcstamp). The room is DELETED at the end; the few
// test bytes stay in the dev store (content-addressed).
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import crypto from "node:crypto";
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
const work = mkdtempSync(path.join(os.tmpdir(), "bucket-door-live-"));
const node = (id, node_type, name, data = {}) => ({ id, node_type, name, description: "", data });
writeFileSync(`${work}/site.em.json`, JSON.stringify({ header: { format: "em.json", version: "1.0" },
  graph: { graph_id: "bucket-door-live", name: "Bucket door (live)", description: "", data: {}, nodes: [
    node("EP1", "EpochNode", "Età romana", { start_time: -100, end_time: 300 }),
    node("US1", "US", "US1"),
    node("D1", "document", "D.1"),
  ], edges: [
    { id: "e1", edge_type: "has_first_epoch", source: "US1", target: "EP1" },
    { id: "e2", edge_type: "is_documented_by", source: "US1", target: "D1" },
  ] }, layout: {} }));
const room = `bucket-door-${Date.now().toString(36)}`;
execFileSync(PY, ["-m", "s3dgraphy", "room-import", `${work}/site.em.json`, "--node", NODE, "--room", room,
  "--title", `Bucket door ${room}`, "--token", token, "--journal", `${work}/journal.json`, "--report-dir", work,
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
const EDITOR = "0000-0003-1111-1112";         // Editor Uno, accredited on the dev node
const STRANGER = "0000-0001-5109-3700";       // a valid iD the dev node has NOT accredited
const auth = { authorization: `Bearer ${token}` };
const enc = encodeURIComponent;

const { chromium } = await playwright();
const browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined });
const evidence = {};
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

  // every call the page makes to the node, by kind
  const calls = [];
  const jsonRefs = [];
  context.on("request", (rq) => {
    const u = rq.url();
    if (!u.startsWith(NODE)) return;
    const kind = rq.method() === "POST" && /\/objects$/.test(u) ? "door"
      : rq.method() === "PUT" && /\/asset\?media_type=application%2Fjson/.test(u) ? "stamp"
      : rq.method() === "PUT" && /\/asset\?/.test(u) ? "put"
      : rq.method() === "POST" && /\/corpus\/append$/.test(u) ? "append"
      : /\/dtc\/profile\//.test(u) ? "probe" : null;
    if (kind) {
      const raw = kind === "door" ? rq.postDataBuffer() : null;
      calls.push({ kind, body: raw ? raw.toString("latin1") : null,
                   type: rq.headers()["content-type"] ?? "" });
    }
  });
  context.on("requestfailed", (rq) => {
    if (rq.url().startsWith(NODE)) console.log(`  (request failed: ${rq.method()} ${rq.url().slice(NODE.length)} ${rq.failure()?.errorText ?? ""})`);
  });
  context.on("response", async (rs) => {
    if (rs.request().method() === "PUT" && /\/asset\?media_type=application%2Fjson/.test(rs.url())) {
      try { jsonRefs.push((await rs.json()).ref); } catch { /* no body */ }
    }
  });

  async function openPanel(page) {
    await page.goto(`${APP}/?handoff=${encodeURIComponent(link)}`);
    const first = await Promise.race([
      page.waitForSelector("#username", { timeout: 60000 }).then(() => "login"),
      page.waitForFunction(() => window.__EM_DRAG__?.selected?.().includes("D1"), null, { timeout: 60000 }).then(() => "in"),
    ]);
    if (first === "login") {
      await page.fill("#username", USER);
      await page.fill("#password", PASSWORD);
      await Promise.all([page.waitForURL((u) => u.toString().startsWith(APP), { timeout: 60000 }), page.click("#kc-login")]);
      await page.waitForFunction(() => window.__EM_DRAG__?.selected?.().includes("D1"), null, { timeout: 60000 });
    }
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
    await page.waitForSelector('[data-field="bucket-kind"]', { timeout: 20000 });
    return opened;
  }
  const setOn = (page) => async (sel, value) => {
    await page.evaluate(([s, v]) => {
      const el = document.querySelector(s);
      el.value = v;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, [sel, value]);
    await page.waitForTimeout(300);
  };
  const licence = (page) => page.evaluate(() => {
    const lic = [...document.querySelectorAll(".ing-delivery input.insp-name-input")]
      .find((i) => !i.dataset.field && i.type !== "date" && i.classList.contains("insp-input-bad"));
    if (!lic) return false;
    lic.value = "CC-BY-4.0";
    lic.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  const editorSelect = (page, value) => page.evaluate((v) => {
    const sel = [...document.querySelectorAll(".ing-delivery select.ing-select")]
      .find((s) => [...s.options].some((o) => o.value === "other"));
    sel.value = v;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  const signedState = (page) => page.evaluate(() => ({
    unsigned: document.querySelector(".ing-delivery .ing-unsigned")?.textContent ?? null,
    signed: document.querySelector(".ing-delivery .ing-signed")?.textContent ?? null,
    preview: document.querySelector(".ing-dtc-preview pre")?.textContent ?? "",
  }));
  const rows = (page) => page.evaluate(() => [...document.querySelectorAll(".ing-row")].map((r) => ({
    name: r.querySelector(".storage-name")?.textContent, cls: r.className,
    state: r.querySelector(".ing-state")?.textContent })));
  async function drop(page, name) {
    const bytes = Buffer.from(`bucket-door-live ${room} ${name} ${Date.now()}`);
    await page.setInputFiles(".ing-funnel input[type=file]", { name, mimeType: "text/plain", buffer: bytes });
    const settled = await page.waitForFunction((n) => {
      const r = [...document.querySelectorAll(".ing-row")].find((x) => x.querySelector(".storage-name")?.textContent === n);
      return r && !/ing-(pending|working)/.test(r.className) ? r.className : null;
    }, name, { timeout: 30000 }).then((h) => h.jsonValue(), () => null);
    const landed = await page.evaluate((n) => {
      const doc = JSON.parse(window.__EM_DRAG__.docJson());
      const graphs = doc?.graphs ? Object.values(doc.graphs) : [doc?.graph].filter(Boolean);
      for (const g of graphs) {
        const res = (g.nodes ?? []).find((x) => x.name === n);
        if (res) return { id: res.id, checksum: res.data?.checksum ?? null,
          linked: (g.edges ?? []).some((e) => e.source === "D1" && e.target === res.id && e.edge_type === "has_linked_resource") };
      }
      return null;
    }, name);
    const sha = crypto.createHash("sha256").update(bytes).digest("hex");
    return { settled, landed, sha };
  }
  async function corpusOf(sha) {
    for (let i = 0; i < 20; i++) {
      const r = await fetch(`${NODE}/v1/corpus?sha256=${enc("sha256:" + sha)}`, { headers: auth });
      const body = r.ok ? await r.json() : null;
      const nodes = body?.graph?.nodes ?? [];
      const acq = nodes.find((n) => n.node_type === "dtc_acquisition");
      if (acq) return { nodes, edges: body?.graph?.edges ?? [], acq };
      await new Promise((res) => setTimeout(res, 300));
    }
    return null;
  }
  async function stampOf(sha) {
    for (let i = 0; i < 40; i++) {
      for (const ref of jsonRefs) {
        const r = await fetch(`${NODE}/v1/rooms/${enc(room)}/asset/${enc(ref)}`, { headers: auth });
        try { const s = JSON.parse(await r.text()); if (s?.self?.digest === `sha256:${sha}`) return s; } catch { /* next */ }
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    return null;
  }
  const inStore = async (sha) => (await fetch(`${NODE}/v1/rooms/${enc(room)}/asset/sha256:${sha}`,
    { method: "HEAD", headers: auth })).status;
  const since = (n) => calls.slice(n);
  // THROUGH THE DOOR, in either of its shapes: ONE multipart request (the
  // contract), or — on a node whose door cannot parse multipart (dev.93, measured)
  // — the record by digest FIRST, then the bytes (PUT with their digest), then
  // the record again. Never a corpus/append from the page.
  const doorShape = (mine) => {
    const doors = mine.filter((c) => c.kind === "door");
    const seq = mine.map((c) => c.kind + (c.kind === "door" ? (/json/.test(c.type) ? ":json" : ":multipart") : "")).join(" ");
    const one = doors.length === 1 && /multipart/.test(doors[0].type) && !mine.some((c) => c.kind === "put");
    const json = mine.map((c, i) => (c.kind === "door" && /json/.test(c.type) ? i : -1)).filter((i) => i >= 0);
    const put = mine.findIndex((c) => c.kind === "put");
    const digest = json.length >= 1 && (put < 0 ? json.length === 1 : json[0] < put && json[json.length - 1] > put);
    return { ok: (one || digest) && !mine.some((c) => c.kind === "append"),
             shape: one ? "multipart" : digest ? "by digest" : "?", seq };
  };
  const recordOf = (mine) => {
    const json = mine.find((c) => c.kind === "door" && /json/.test(c.type));
    if (json) { try { return JSON.parse(json.body); } catch { return null; } }
    const mp = mine.find((c) => c.kind === "door")?.body ?? "";
    const m = mp.match(/name="dtc"\r\n\r\n([\s\S]*?)\r\n--/);
    try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
  };

  // ═════ PAGE 1 · a node WITH the door ═════════════════════════════════════
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message ?? e)));
  const opened = await openPanel(page);
  ok(opened?.mode === "s3", "signed in, room joined, Archive ▸ room store open");
  const set = setOn(page);
  ok(await licence(page), "licence said (CC-BY-4.0)");

  // ── 1 · a SURVEY (capture: topographic), no responsible ──────────────────
  await set('[data-field="bucket-kind"]', "topographic");
  await set('[data-field="bucket-madeAt"]', "2024-06-12");
  await set('[data-field="bucket-campaign"]', "Aiano 2024");
  await set('[data-field="bucket-technique"]', "stazione totale");
  await set('[data-field="bucket-software"]', "QGIS 3.34");
  let st = await signedState(page);
  ok(!!st.signed, "the survey is signed", st.signed ?? st.unsigned ?? "");
  let mark = calls.length;
  const survey = await drop(page, "rilievo-01.txt");
  let mine = since(mark);
  ok(/ing-(done|same)/.test(survey.settled ?? ""), "the survey landed", survey.settled ?? "");
  ok(survey.landed?.checksum === `sha256:${survey.sha}`, "…as a resource with its digest", JSON.stringify(survey.landed));
  ok(survey.landed?.linked, "…linked from D.1");
  let shape = doorShape(mine);
  evidence.surveyShape = shape;
  ok(shape.ok, `through the door (${shape.shape}), no corpus/append from the page`, shape.seq);
  const sent1 = mine.find((c) => c.kind === "door" && /multipart/.test(c.type))?.body ?? "";
  if (sent1) {
    ok(sent1.indexOf('name="dtc"') >= 0 && sent1.indexOf('name="dtc"') < sent1.indexOf('name="file"'),
       "the multipart attempt carries the record part FIRST, the file after");
  } else {
    console.log("  (the multipart body is not visible to Playwright: its order is asserted in check-bucket-dtc)");
  }
  ok(/ing-done/.test(survey.settled ?? ""), "…said as stored, not as «already there»", survey.settled ?? "");
  const rec1 = recordOf(mine);
  ok(rec1?.profile === "em-bucket-dtc/1" && rec1?.source?.dtc_kind === "topographic" && !rec1?.who?.responsible,
     "the record is the preview's, with no responsible: the depositor answers", JSON.stringify(rec1?.who ?? null));
  let c1 = await corpusOf(survey.sha);
  evidence.survey = c1?.acq?.data;
  ok(c1?.acq?.data?.dtc_kind === "topographic", "the register's acquisition says topographic",
     JSON.stringify(c1?.acq?.data ?? null).slice(0, 300));
  const m1 = c1?.acq?.data?.metadata ?? c1?.acq?.data ?? {};
  ok(m1.campaign === "Aiano 2024" && m1.technique === "stazione totale" && m1.software === "QGIS 3.34",
     "…with the campaign, the technique and the software", JSON.stringify(m1).slice(0, 300));
  ok(m1.responsible === ORCID, "…and the depositor answers for publishing", String(m1.responsible));
  ok(m1.documents === "D1", "…and the document", String(m1.documents));
  const res1 = c1?.nodes.find((n) => n.data?.checksum === `sha256:${survey.sha}`);
  evidence.surveyResource = res1?.data;
  ok(!!res1 && (res1.data?.license === "CC-BY-4.0" || JSON.stringify(c1.nodes).includes("CC-BY-4.0")),
     "the licence is in the register", JSON.stringify(res1?.data ?? null).slice(0, 300));
  const s1 = await stampOf(survey.sha);
  ok(s1?.how?.dtc_kind === "topographic" && s1?.by?.at === "2024-06-12T00:00:00Z" && s1?.declared?.license === "CC-BY-4.0",
     "the stamp read back from the node says the survey, its date and the licence",
     JSON.stringify({ how: s1?.how?.dtc_kind, at: s1?.by?.at, declared: s1?.declared }));
  const dtcRoute = await fetch(`${NODE}/v1/rooms/${enc(room)}/objects/sha256:${survey.sha}/dtc`, { headers: auth });
  evidence.dtcRoute = dtcRoute.status;
  console.log(`  (GET …/objects/{sha}/dtc answers ${dtcRoute.status})`);

  // ── 2 · a DOWNLOAD, with a responsible accredited on the node ─────────────
  await set('[data-field="bucket-kind"]', "download");
  await set('[data-field="bucket-retrievedFrom"]', "https://doi.org/10.5281/zenodo.1234567");
  await set('[data-field="bucket-madeAt"]', "2019-03-01");
  await editorSelect(page, "other");
  await page.waitForTimeout(300);
  st = await signedState(page);
  ok(!!st.unsigned && !st.signed, "«somebody else» with no iD: not signed", st.unsigned ?? "");
  await set('[data-field="bucket-responsible"]', "0000-0003-1111-1113");
  st = await signedState(page);
  ok(!!st.unsigned, "…a malformed iD: not signed", st.unsigned ?? "");
  await set('[data-field="bucket-responsible"]', EDITOR);
  st = await signedState(page);
  ok(!!st.signed, "…an iD: signed", st.signed ?? st.unsigned ?? "");
  let pv = null; try { pv = JSON.parse(st.preview); } catch { /* below */ }
  ok(pv?.who?.responsible === EDITOR && pv?.source?.dtc_kind === "download" && !pv?.transformation?.technique,
     "«What will be written» carries who.responsible, and no technique on a download",
     JSON.stringify(pv?.who) + " " + JSON.stringify(pv?.transformation));
  mark = calls.length;
  const dl = await drop(page, "scaricato-01.txt");
  mine = since(mark);
  ok(/ing-(done|same)/.test(dl.settled ?? ""), "the download landed", dl.settled ?? JSON.stringify(await rows(page)));
  shape = doorShape(mine);
  ok(shape.ok, `…through the door (${shape.shape})`, shape.seq);
  ok(recordOf(mine)?.who?.responsible === EDITOR, "…the record names Editor Uno");
  const c2 = await corpusOf(dl.sha);
  evidence.download = c2?.acq?.data;
  const m2 = c2?.acq?.data?.metadata ?? c2?.acq?.data ?? {};
  ok(c2?.acq?.data?.dtc_kind === "download", "the register's acquisition says download",
     JSON.stringify(c2?.acq?.data ?? null).slice(0, 300));
  ok(m2.retrieved_from === "https://doi.org/10.5281/zenodo.1234567" && m2.content_date === "2019-03-01",
     "…where from, and the content's date as a fact", JSON.stringify(m2).slice(0, 300));
  ok(m2.responsible === EDITOR, "…and Editor Uno answers for publishing", String(m2.responsible));
  ok(!m2.technique && !m2.campaign, "…no technique, no campaign");
  ok(c2?.acq?.id && c1?.acq?.id && c2.acq.id !== c1.acq.id,
     "the download is ANOTHER lot than the survey (another act)", `${c1?.acq?.id} / ${c2?.acq?.id}`);
  const again = await corpusOf(survey.sha);
  const m1b = again?.acq?.data?.metadata ?? again?.acq?.data ?? {};
  ok(again?.acq?.data?.dtc_kind === "topographic" && m1b.responsible === ORCID && !m1b.retrieved_from,
     "…and the survey's lot still says what it said (its kind, its responsible)", JSON.stringify(m1b).slice(0, 200));
  const s2 = await stampOf(dl.sha);
  ok(s2?.how?.dtc_kind === "download" && !s2?.how?.technique, "the download's stamp says download, no technique",
     JSON.stringify(s2?.how ?? null).slice(0, 200));

  // ── 3 · a responsible the node has NOT accredited: refused, in words ─────
  await set('[data-field="bucket-responsible"]', STRANGER);
  mark = calls.length;
  const nope = await drop(page, "scaricato-02.txt");
  mine = since(mark);
  const r3 = (await rows(page)).find((r) => r.name === "scaricato-02.txt");
  evidence.refusal = r3?.state;
  ok(/ing-failed/.test(r3?.cls ?? ""), "an iD not accredited: the file is refused", r3?.cls ?? "");
  ok(r3?.state?.includes(STRANGER) && /accredit/i.test(r3?.state ?? "") && !/\b4\d\d\b/.test(r3?.state ?? ""),
     "…with a sentence naming the iD, not a status number", r3?.state ?? "");
  ok(await inStore(nope.sha) === 404, "…and its bytes are NOT in the store", String(await inStore(nope.sha)));
  ok(!mine.some((c) => c.kind === "put" || c.kind === "append"), "…and no byte moved: the record was refused first",
     mine.map((c) => c.kind).join(" "));
  ok(!nope.landed, "…and no resource was written in the graph");
  await page.screenshot({ path: `${work}/door.png` });

  // ── 4 · a reference cannot carry a responsible ───────────────────────────
  ok(errors.length === 0, "no page error (node with the door)", errors.join(" | ").slice(0, 200));

  // ═════ PAGE 2 · a node WITHOUT the door (the profile route answers 404) ══
  const old = await context.newPage();
  const errors2 = [];
  old.on("pageerror", (e) => errors2.push(String(e.message ?? e)));
  await old.route(/\/v1\/dtc\/profile\//, (route) => route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"Not Found"}' }));
  await old.route(/\/v1\/rooms\/[^/]+\/objects$/, (route) => route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"Not Found"}' }));
  await openPanel(old);
  const set2 = setOn(old);
  ok(await licence(old), "older node: licence said");
  await editorSelect(old, "other");
  await old.waitForTimeout(300);
  await set2('[data-field="bucket-responsible"]', EDITOR);
  mark = calls.length;
  const blocked = await drop(old, "vecchio-01.txt");
  mine = since(mark);
  const r4 = (await rows(old)).find((r) => r.name === "vecchio-01.txt");
  evidence.oldWithResponsible = r4?.state;
  ok(/ing-failed/.test(r4?.cls ?? "") && !mine.some((c) => c.kind === "put" || c.kind === "door"),
     "older node + a responsible: stopped before any byte moves", `${r4?.state} · ${mine.map((c) => c.kind).join(" ")}`);
  ok(await inStore(blocked.sha) === 404, "…and nothing reached the store");
  await editorSelect(old, "me");
  await old.waitForTimeout(300);
  mark = calls.length;
  const fb = await drop(old, "vecchio-02.txt");
  for (let i = 0; i < 40 && since(mark).filter((c) => c.kind === "append").length < 3; i++) await old.waitForTimeout(250);
  mine = since(mark);
  ok(/ing-(done|same)/.test(fb.settled ?? ""), "older node, the depositor answers: the file lands", fb.settled ?? "");
  ok(mine.some((c) => c.kind === "put") && mine.filter((c) => c.kind === "append").length >= 3
     && !mine.some((c) => c.kind === "door"),
     "…the older way: PUT of the bytes + the three acts", mine.map((c) => c.kind).join(" "));
  const log2 = await old.evaluate(() => window.__EM_DRAG__.logTail?.(40) ?? []);
  const logText = JSON.stringify(log2);
  evidence.fallbackLog = (logText.match(/[^"]*1\.6\.0-dev\.93[^"]*/) ?? [""])[0];
  ok(/1\.6\.0-dev\.93/.test(logText), "…said once, soberly, in the log", evidence.fallbackLog.slice(0, 160));
  const c4 = await corpusOf(fb.sha);
  ok(c4?.acq?.data?.dtc_kind === "ingest", "…and the register has it all the same", JSON.stringify(c4?.acq?.data ?? null).slice(0, 200));
  ok(errors2.length === 0, "no page error (older node)", errors2.join(" | ").slice(0, 200));
} catch (err) {
  ok(false, "the run went to its end", String(err.message ?? err).split("\n")[0]);
} finally {
  await browser.close();
  bridge.kill();
  writeFileSync(`${work}/evidence.json`, JSON.stringify(evidence, null, 1));
  console.log(`room ${room}: ${await deleteRoom()}`);
  console.log(`evidence and screenshots in ${work}`);
}
console.log(`\nbucket-door-live: ${checks - failures.length}/${checks} passed (${ms()})`);
if (failures.length) { console.log("failures:", failures); process.exit(1); }
