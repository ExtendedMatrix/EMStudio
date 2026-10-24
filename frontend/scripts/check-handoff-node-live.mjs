// E4 · T-E4 half B, LIVE: a `stratigraph://open?…&node=…` link opens EMStudio
// ON the unit — selected, in the Inspector, the view centred on it.
//
//   node scripts/check-handoff-node-live.mjs            # prepares its own room
//   node scripts/check-handoff-node-live.mjs /tmp/te4   # the link EM Tools wrote
//
// Half A is EM Tools' `tests/blender_smoke_open_node_link.py`: it seats a graph
// in a NEW room of the dev node and writes the link «Edit USM02 in EMStudio»
// produced to <work>/link.txt (and the unit to <work>/unit.json). Here the link
// is given to EMStudio the way the web build takes one (`?handoff=<the link>`,
// `handoff.ts::handoffFromLocation`), so the path is the real one: the node's
// sign-in (Keycloak of the realm em-dev, user `dev`), the way back, the join,
// the room's snapshot, and the landing.
//
// Without a work dir holding `link.txt` (MICRO-SUITE-VERDE, 24 Oct: the check
// failed wherever half A had not been run first), it prepares the same thing
// itself: the engine seats `testdata/catena.em.json` in a NEW room of the node
// (`s3dgraphy room-import`, as «Bring into a room…»), the link is the one EM
// Tools writes (`stratigraph://open?server=…&room=…&node=…`) for US102, and
// the room is DELETED at the end, also when a check fails.
//
// Needs: the dev stack up (`stratigraph-server/dev-stack/fcn-up.sh`), Vite on
// 5173 (`npm run dev -- --port 5173`: em-console's redirect URIs admit it), and
// playwright-core (PLAYWRIGHT_CORE, or the audit's copy) with its Chromium.
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = new URL(".", import.meta.url).pathname;
const WORK = process.argv[2] ?? null;
const NODE = process.env.EM_NODE ?? "http://localhost:8000";
const APP = process.env.APP ?? "http://localhost:5173";
const USER = process.env.LIVE_USER ?? "dev";
const PASSWORD = process.env.LIVE_PASSWORD ?? USER;
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

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

let checks = 0;
const failures = [];
function ok(condition, what, detail = "") {
  checks += 1;
  console.log(`${condition ? "PASS" : "FAIL"}: ${what}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(what);
}

// ── the room and the link: EM Tools' (a work dir), or made here ─────────────
let link, unit, made = null, token = null;
if (WORK && existsSync(`${WORK}/link.txt`)) {
  link = readFileSync(`${WORK}/link.txt`, "utf8").trim();
  unit = JSON.parse(readFileSync(`${WORK}/unit.json`, "utf8"));
} else {
  try { token = execFileSync(`${HERE}../../../stratigraph-server/dev-stack/token.sh`, { encoding: "utf8" }).trim(); }
  catch { token = null; }
  if (!token) { console.log("handoff-node-live: no token — is the stack up? SKIPPED"); process.exit(0); }
  const S3D = process.env.S3DGRAPHY_DIR ?? `${HERE}../../../s3Dgraphy/`;
  made = `handoff-claude-${Date.now().toString(36)}`;
  const work = `${process.env.TMPDIR ?? "/tmp/"}handoff-node-live/${made}`;
  mkdirSync(work, { recursive: true });
  const out = JSON.parse(execFileSync(`${S3D}.venv/bin/python`, ["-m", "s3dgraphy", "room-import",
    `${HERE}../testdata/catena.em.json`, "--node", NODE, "--room", made, "--title", `Handoff ${made}`,
    "--token", token, "--journal", `${work}/journal.json`, "--report-dir", work, "--work-dir", `${work}/packs`, "--json"],
    { env: { ...process.env, PYTHONPATH: `${S3D}src` }, encoding: "utf8", maxBuffer: 1 << 26 }));
  if (!out.room_state?.created || !(out.seeded?.applied > 0)) {
    console.log("handoff-node-live: the room was not seated", JSON.stringify(out.room_state), JSON.stringify(out.seeded));
    await deleteRoom(made);
    process.exit(1);
  }
  unit = { node: "US102", name: "US102", room: made };
  link = `stratigraph://open?server=${encodeURIComponent(NODE)}&room=${made}&node=${unit.node}`;
}
console.log("link:", link);

/** DELETE the room this check made (409 while a socket is still open: asked
 *  again for a few seconds). */
async function deleteRoom(room) {
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

const { chromium } = await playwright();
const browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));

  await page.goto(`${APP}/?handoff=${encodeURIComponent(link)}`);

  // the node's sign-in: Keycloak's own form, filled the way a person fills it
  await page.waitForSelector("#username", { timeout: 60000 });
  ok(/\/realms\/em-dev\//.test(page.url()), "the link sends to the node's sign-in (realm em-dev)", page.url().split("?")[0]);
  await page.fill("#username", USER);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL((u) => u.toString().startsWith(APP), { timeout: 60000 }),
                     page.click("#kc-login")]);
  ok(true, `signed in as ${USER}, back in EMStudio`);

  // the room's snapshot, then the landing
  let selected = [];
  try {
    await page.waitForFunction((id) => window.__EM_DRAG__?.selected?.().includes(id),
                               unit.node, { timeout: 60000 });
    selected = await page.evaluate(() => window.__EM_DRAG__.selected());
  } catch {
    selected = await page.evaluate(() => window.__EM_DRAG__?.selected?.() ?? []);
  }
  ok(selected.length === 1 && selected[0] === unit.node, `${unit.name} is selected`, JSON.stringify(selected));
  const name = await page.evaluate((id) => window.__EM_DRAG__.nodeInfo(id)?.name ?? null, unit.node);
  ok(name === unit.name, "the selected node is the unit of the link", String(name));
  const inspector = await page.evaluate(() => {
    const area = document.querySelector('.tile-area[data-win="canvas:inspector"]')
      ?? [...document.querySelectorAll(".tile-area")].find((a) => (a.dataset.win || "").includes("inspector"));
    if (!area) return "";
    // the name is a field of the Inspector: its value, not its text
    const values = [...area.querySelectorAll("input, textarea")].map((e) => e.value);
    return [area.innerText, ...values].join(" ");
  });
  ok(inspector.includes(unit.name), "the Inspector shows it", inspector.slice(0, 80).replace(/\s+/g, " "));
  // the scene of a document that has just arrived is built a little later: the
  // landing centres when it exists, so this waits for it (up to 15 s)
  const centred = await page.waitForFunction((id) => {
    const canvases = [...document.querySelectorAll("canvas")].filter((c) => c.clientWidth > 200);
    return canvases.some((c) => window.__EM_DRAG__.hitAt(c.clientWidth / 2, c.clientHeight / 2) === id);
  }, unit.node, { timeout: 15000 }).then(() => true, () => false);
  ok(centred, "the view is centred on it (the unit is under the centre of the canvas)");

  if (process.env.DEBUG) console.log("CONSOLE:", logs.slice(-30).join("\n"));
} catch (err) {
  ok(false, "the run went to its end", String(err.message ?? err).split("\n")[0]);
} finally {
  await browser.close();
  if (made) console.log(`room ${made}: ${await deleteRoom(made)}`);
}
console.log(`\nhandoff-node-live: ${checks - failures.length}/${checks} passed`);
if (failures.length) process.exit(1);
