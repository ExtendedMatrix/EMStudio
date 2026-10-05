// E4 · T-E4 half B, LIVE: a `stratigraph://open?…&node=…` link opens EMStudio
// ON the unit — selected, in the Inspector, the view centred on it.
//
//   node scripts/check-handoff-node-live.mjs /tmp/te4
//
// Half A is EM Tools' `tests/blender_smoke_open_node_link.py`: it seats a graph
// in a NEW room of the dev node and writes the link «Edit USM02 in EMStudio»
// produced to <work>/link.txt (and the unit to <work>/unit.json). Here the link
// is given to EMStudio the way the web build takes one (`?handoff=<the link>`,
// `handoff.ts::handoffFromLocation`), so the path is the real one: the node's
// sign-in (Keycloak of the realm em-dev, user `dev`), the way back, the join,
// the room's snapshot, and the landing.
//
// Needs: the dev stack up (`stratigraph-server/dev-stack/fcn-up.sh`), Vite on
// 5173 (`npm run dev -- --port 5173`: em-console's redirect URIs admit it), and
// playwright-core (PLAYWRIGHT_CORE, or the audit's copy) with its Chromium.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WORK = process.argv[2] ?? "/tmp/te4";
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

const link = readFileSync(`${WORK}/link.txt`, "utf8").trim();
const unit = JSON.parse(readFileSync(`${WORK}/unit.json`, "utf8"));
console.log("link:", link);

const { chromium } = await playwright();
const browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined });
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

await browser.close();
console.log(`\nhandoff-node-live: ${checks - failures.length}/${checks} passed`);
if (failures.length) process.exit(1);
