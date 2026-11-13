// MICRO-TESTATE-COERENTI · the bench the page checks share: a Vite of this tree
// (PORT, else one started on a free port), headless Chromium (CHR) or WebKit
// (ENGINE=webkit), a copy of Templu Mare v9 opened (EM_V9). Not a check itself.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FE = fileURLToPath(new URL("..", import.meta.url));
export const V9 = process.env.EM_V9 ?? "/tmp/tc/T/EM/TempluMare_v9.em.json";
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

async function loadPw() {
  for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
    new URL("../../.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js", import.meta.url).pathname]) {
    if (!t) continue;
    try { const m = await import(t); return m.chromium ? m : m.default; } catch { /* next */ }
  }
  return null;
}
const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});

/** null when the bench cannot stand (no v9 copy, no playwright): the check says «skipped» */
export async function bench(name) {
  if (!existsSync(V9)) { console.log(`– ${name}: no copy of Templu Mare v9 at ${V9} (EM_V9): skipped`); return null; }
  const pw = await loadPw();
  if (!pw) { console.log(`– ${name}: playwright-core not found (PLAYWRIGHT_CORE): skipped`); return null; }
  let vite = null;
  let PORT = process.env.PORT;
  if (!PORT) {
    PORT = String(await freePort());
    vite = spawn(process.execPath, [join(FE, "node_modules/vite/bin/vite.js"), "--port", PORT, "--strictPort"], { cwd: FE, stdio: "ignore" });
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(`http://localhost:${PORT}/em/studio/`)).ok) break; } catch { /* not yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const browser = process.env.ENGINE === "webkit" ? await pw.webkit.launch()
    : await pw.chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const doc = JSON.parse(readFileSync(V9, "utf8"));
  const open = async ({ width = 1552, height = 914, ws = null } = {}) => {
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
    await page.addInitScript(() => { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "it"); sessionStorage.setItem("probe", "1"); } });
    await page.goto(`http://localhost:${PORT}/em/studio/${process.env.BRIDGE ? `?bridge=${encodeURIComponent(process.env.BRIDGE)}` : ""}`);
    await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 90000 });
    await page.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [doc, V9]);
    await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 90000 });
    if (ws) { await page.evaluate((w) => document.querySelector(`#workspace-bar .ws-tab[data-ws="${w}"]`)?.click(), ws); await page.waitForTimeout(2500); }
    return { page, errors };
  };
  const close = async () => { await browser.close(); vite?.kill(); };
  return { open, close, doc };
}
