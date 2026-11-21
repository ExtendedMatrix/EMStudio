// MICRO-SEG13 · the floating panels close with a click outside and with Esc
// (E.D., 21 Nov 2026: «vorrei poter chiudere questi pannelli flottanti cliccando
// fuori, senza inseguire obbligatoriamente la X in alto»). One rule, `floating.ts`.
//
//   node scripts/check-floating.mjs            # its own Vite on a free port
//   PORT=5199 node scripts/check-floating.mjs  # a Vite already running
//
// In light and in dark: the overlays panel of a graph window, the Space's
// «Visibilità ▾» and «Colori ▾», a header menu (File) and a window head's «▾»,
// a dialog holding something typed (a work window). For each: a press outside
// closes it AND does nothing else (no selection on the canvas, no other menu
// opened), Esc closes it, the opener again closes it, the focus goes back to the
// opener; the dialog with data stays on a press outside and asks on Esc.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const FE = fileURLToPath(new URL("..", import.meta.url));
const TD = join(FE, "testdata/");
let checks = 0;
const say = (what) => { if (process.env.VERBOSE) console.log(`  ✓ ${what}`); };
const ok = (c, what) => { assert.ok(c, what); checks++; say(what); };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; say(what); };

async function playwright() {
  for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
    new URL("../../.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js", import.meta.url).pathname]) {
    if (!t) continue;
    try { const m = t.startsWith("/") ? await import(t) : require(t); return m.chromium ? m : m.default; } catch { /* next */ }
  }
  return null;
}
const pw = await playwright();
if (!pw) { console.log("– check-floating: playwright-core not found (PLAYWRIGHT_CORE): skipped"); process.exit(0); }
const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});
let PORT = process.env.PORT;
let vite = null;
if (!PORT) {
  PORT = String(await freePort());
  vite = spawn(process.execPath, [join(FE, "node_modules/vite/bin/vite.js"), "--port", PORT, "--strictPort"], { cwd: FE, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/em/studio/`)).ok) break; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}
const CHR = process.env.CHR ?? [1248, 1243].map((v) =>
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-${v}/chrome-headless-shell-mac-arm64/chrome-headless-shell`).find(existsSync);
const browser = await pw.chromium.launch({ executablePath: CHR && existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const fixture = JSON.parse(readFileSync(`${TD}catena.em.json`, "utf8"));
const SHOTS = process.env.SHOTS ?? null;

async function open(theme, ws = null) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await p.addInitScript(([d, theme]) => {
    window.__EM_TEST_DATA__ = d;
    if (!sessionStorage.getItem("probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", "it");
      localStorage.setItem("emstudio.theme", theme);
      sessionStorage.setItem("probe", "1");
    }
  }, [fixture, theme]);
  await p.goto(`http://localhost:${PORT}/em/studio/`);
  await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length > 0, null, { timeout: 60000 });
  await p.waitForTimeout(2500);   // the camera's framing settles
  if (ws) { await p.click(`#workspace-bar .ws-tab[data-ws="${ws}"]`); await p.waitForTimeout(1500); }
  return { p, ctx, errors };
}
const floatingNow = (p) => p.evaluate(() => window.__EM_DRAG__.floatingOpen());
const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains("hidden") && !e.hidden && e.getClientRects().length > 0; }, sel);
const focusIs = (p, sel) => p.evaluate((s) => document.activeElement === document.querySelector(s), sel);
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) }); };

for (const theme of ["light", "dark"]) {
  // ── 1 · the overlays panel of a graph window (the screenshot's panel) ──────
  {
    const { p, ctx, errors } = await open(theme);
    eq(await p.evaluate(() => document.documentElement.dataset.theme), theme, `${theme}: the page in ${theme}`);
    const gw = await p.evaluate(() => window.__EM_DRAG__.wins().find((w) => w.type === "graph")?.id ?? null);
    ok(gw, `${theme}: a graph window`);
    const box = await p.evaluate((w) => window.__EM_DRAG__.winScene(w).boxes.find((b) => /^US\d/.test(b.id) && b.w > 20 && b.h > 10), gw);
    ok(box, `${theme}: a node drawn on the canvas`);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    // the baseline: a click on that node selects it
    await p.mouse.click(cx, cy);
    await p.waitForTimeout(200);
    const selBase = await p.evaluate(() => window.__EM_DRAG__.selected());
    eq(selBase.length, 1, `${theme}: without a panel a click on the node selects it`);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(200);
    eq(await p.evaluate(() => window.__EM_DRAG__.selected()), [], `${theme}: Esc empties the selection`);

    await p.click("#btn-overlays");
    await p.waitForTimeout(200);
    ok(await visible(p, "#overlay-panel"), `${theme}: the overlays glyph opens its panel`);
    eq(await floatingNow(p), ["overlay"], `${theme}: the panel is a floating panel`);
    await shot(p, `${theme}-overlay-open`);
    await p.mouse.click(cx, cy);
    await p.waitForTimeout(250);
    ok(!(await visible(p, "#overlay-panel")), `${theme}: a click outside (on a node) closes the overlays panel`);
    eq(await p.evaluate(() => window.__EM_DRAG__.selected()), [], `${theme}: …and does NOT select the node under it`);
    ok(await focusIs(p, "#btn-overlays"), `${theme}: the focus is back on the glyph that opened it`);
    await p.mouse.click(cx, cy);
    await p.waitForTimeout(200);
    eq(await p.evaluate(() => window.__EM_DRAG__.selected()), selBase, `${theme}: the next click selects as always`);
    await p.keyboard.press("Escape");

    await p.click("#btn-overlays");
    await p.waitForTimeout(150);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    ok(!(await visible(p, "#overlay-panel")), `${theme}: Esc closes the overlays panel`);
    ok(await focusIs(p, "#btn-overlays"), `${theme}: …and the focus goes back to the glyph`);

    // (the glyph is not there while its panel is: MICRO-PANNELLI-OVERLAY puts the
    // panel in its corner — «the same button again» is tested on File, «▾», Colori)
    await p.click("#btn-overlays");
    await p.waitForTimeout(150);
    ok(!(await visible(p, "#btn-overlays")), `${theme}: the glyph gives its corner to the panel`);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    eq(await floatingNow(p), [], `${theme}: nothing floating left`);

    // the filter (the funnel's panel): the same rule
    await p.evaluate(() => document.getElementById("btn-view-props").click());
    await p.waitForTimeout(150);
    ok(await visible(p, "#filter-panel"), `${theme}: the funnel opens the filter`);
    await p.mouse.click(cx, cy);
    await p.waitForTimeout(200);
    ok(!(await visible(p, "#filter-panel")), `${theme}: a click outside closes the filter`);

    // ── 2 · a header menu (File): the first click outside only closes ────────
    await p.click("#dd-file .dd-toggle");
    await p.waitForTimeout(150);
    ok(await visible(p, "#dd-file .dd-menu"), `${theme}: File opens`);
    eq(await floatingNow(p), ["dd"], `${theme}: File is a floating panel`);
    await shot(p, `${theme}-file-open`);
    await p.click("#dd-edit .dd-toggle");
    await p.waitForTimeout(200);
    ok(!(await visible(p, "#dd-file .dd-menu")), `${theme}: a click on Edit closes File`);
    ok(!(await visible(p, "#dd-edit .dd-menu")), `${theme}: …and does not open Edit (the first click only closes)`);
    ok(await focusIs(p, "#dd-file .dd-toggle"), `${theme}: the focus back on «File»`);
    await p.click("#dd-file .dd-toggle");
    await p.waitForTimeout(100);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(100);
    ok(!(await visible(p, "#dd-file .dd-menu")), `${theme}: Esc closes File (it did not before)`);
    await p.click("#dd-file .dd-toggle");
    await p.waitForTimeout(100);
    await p.click("#dd-file .dd-toggle");
    await p.waitForTimeout(150);
    ok(!(await visible(p, "#dd-file .dd-menu")), `${theme}: «File» again closes it`);

    // ── 3 · a window head's «▾» (the graph window's type menu) ───────────────
    const tog = await p.evaluate(() => {
      const t = [...document.querySelectorAll(".area-head .dd-toggle, .tile-head .dd-toggle, [class*='win-head'] .dd-toggle")].find((x) => x.getClientRects().length);
      if (!t) return null;
      t.dataset.probeTog = "1";
      return true;
    });
    ok(tog, `${theme}: a window head has a «▾»`);
    await p.click("[data-probe-tog]");
    await p.waitForTimeout(150);
    const headMenu = await p.evaluate(() => {
      const m = document.querySelector("[data-probe-tog]").closest(".dropdown")?.querySelector(".dd-menu");
      if (m) m.dataset.probeMenu = "1";
      return !!m && !m.classList.contains("hidden");
    });
    ok(headMenu, `${theme}: the head's «▾» opens its menu`);
    eq(await floatingNow(p), ["bar"], `${theme}: the head's menu is a floating panel`);
    await p.mouse.click(cx, cy);
    await p.waitForTimeout(200);
    ok(!(await visible(p, "[data-probe-menu]")), `${theme}: a click on the canvas closes the head's menu`);
    eq(await p.evaluate(() => window.__EM_DRAG__.selected()), [], `${theme}: …and does not select`);
    ok(await focusIs(p, "[data-probe-tog]"), `${theme}: the focus back on the «▾»`);
    await p.click("[data-probe-tog]");
    await p.waitForTimeout(100);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(100);
    ok(!(await visible(p, "[data-probe-menu]")), `${theme}: Esc closes the head's menu`);

    // ── 4 · a dialog holding something typed: a work window ──────────────────
    await p.evaluate(() => { window.__probeAns = null; import("/em/studio/src/app-dialog.ts").then((m) => m.openDialog({ message: "probe", input: { value: "" }, kind: "probe" }).then((a) => { window.__probeAns = a; })); });
    await p.waitForSelector('[data-app-dialog="probe"] input');
    await p.mouse.click(10, 990);   // the backdrop, far from the card
    await p.waitForTimeout(150);
    ok(!(await p.$('[data-app-dialog="probe"]')), `${theme}: an EMPTY dialog: a press outside the card cancels it`);
    await p.evaluate(() => { window.__probeAns = null; import("/em/studio/src/app-dialog.ts").then((m) => m.openDialog({ message: "probe", input: { value: "" }, kind: "probe" }).then((a) => { window.__probeAns = a; })); });
    await p.waitForSelector('[data-app-dialog="probe"] input');
    await p.keyboard.type("US 12 — appunto");
    await shot(p, `${theme}-dialog-typed`);
    await p.mouse.click(10, 990);
    await p.waitForTimeout(150);
    ok(!!(await p.$('[data-app-dialog="probe"]')), `${theme}: something typed: a press outside does NOT close the dialog`);
    eq(await p.$eval('[data-app-dialog="probe"] input', (i) => i.value), "US 12 — appunto", `${theme}: …and the text is there`);
    await p.keyboard.press("Escape");
    await p.waitForSelector('[data-app-dialog="discard"]');
    ok(true, `${theme}: Esc asks «discard what you wrote?»`);
    await shot(p, `${theme}-dialog-discard`);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    ok(!(await p.$('[data-app-dialog="discard"]')) && !!(await p.$('[data-app-dialog="probe"]')),
      `${theme}: Esc on the question keeps writing (the dialog stays)`);
    await p.keyboard.press("Escape");
    await p.waitForSelector('[data-app-dialog="discard"]');
    await p.click('[data-app-dialog="discard"] [data-dialog-ok]');
    await p.waitForFunction(() => !!window.__probeAns);
    eq(await p.evaluate(() => window.__probeAns.ok), false, `${theme}: «Discard» closes the dialog, cancelled`);
    // Enter in the question is the question's, not the dialog's under it
    await p.evaluate(() => { window.__probeAns = null; import("/em/studio/src/app-dialog.ts").then((m) => m.openDialog({ message: "probe", input: { value: "" }, kind: "probe" }).then((a) => { window.__probeAns = a; })); });
    await p.waitForSelector('[data-app-dialog="probe"] input');
    await p.keyboard.type("x");
    await p.keyboard.press("Escape");
    await p.waitForSelector('[data-app-dialog="discard"]');
    // «Discard» is a danger: the focus starts on «Keep writing», Enter presses it
    await p.keyboard.press("Enter");
    await p.waitForTimeout(200);
    eq(await p.evaluate(() => [window.__probeAns, [...document.querySelectorAll(".app-dialog")].map((d) => d.dataset.appDialog),
      document.querySelector('[data-app-dialog="probe"] input')?.value]), [null, ["probe"], "x"],
      `${theme}: Enter on the question answers the question (keep writing), never the dialog under it`);
    await p.keyboard.press("Escape");
    await p.waitForSelector('[data-app-dialog="discard"]');
    await p.click('[data-app-dialog="discard"] [data-dialog-ok]');
    await p.waitForFunction(() => !!window.__probeAns);

    eq(errors, [], `${theme}: no page error`);
    await ctx.close();
  }

  // ── 5 · the Space: «Visibilità ▾» and «Colori ▾» ───────────────────────────
  {
    const { p, ctx, errors } = await open(theme, "space");
    // the baseline: the scene's canvas hears a click (its handlers select); a
    // listener of the check's own counts what reaches it
    await p.evaluate(() => {
      window.__sceneHeard = [];
      const host = document.querySelector(".scn-host");
      for (const t of ["pointerdown", "pointerup", "click", "contextmenu"]) host.addEventListener(t, () => window.__sceneHeard.push(t), true);
    });
    const host0 = await p.evaluate(() => { const r = document.querySelector(".scn-host canvas")?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height * 0.75 } : null; });
    await p.mouse.click(host0.x, host0.y);
    await p.waitForTimeout(300);
    eq(await p.evaluate(() => window.__sceneHeard), ["pointerdown", "pointerup", "click"], `${theme}: without a panel the scene hears the click (${await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [host0.x, host0.y])})`);
    await p.evaluate(() => window.__EM_DRAG__.select("US102"));
    await p.waitForTimeout(400);
    await p.evaluate(() => { window.__sceneHeard = []; });
    const has = await p.evaluate(() => !!document.querySelector("[data-vis]"));
    ok(has, `${theme}: the Space's head has «Visibilità ▾»`);
    await p.evaluate(() => document.querySelector("[data-vis]").click());
    await p.waitForTimeout(250);
    ok(await visible(p, ".vis-menu[data-vis-menu]"), `${theme}: «Visibilità ▾» opens`);
    eq(await floatingNow(p), ["vis"], `${theme}: «Visibilità» is a floating panel`);
    await shot(p, `${theme}-space-vis`);
    const host = await p.evaluate(() => { const r = document.querySelector(".scn-host canvas")?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height * 0.75 } : null; });
    ok(host, `${theme}: the 3D scene is there`);
    const sel0 = ["US102"];
    await p.mouse.click(host.x, host.y);
    await p.waitForTimeout(300);
    ok(!(await visible(p, ".vis-menu[data-vis-menu]")), `${theme}: a click on the 3D scene closes «Visibilità»`);
    eq(await p.evaluate(() => window.__sceneHeard), [], `${theme}: …the scene hears nothing of that click`);
    eq(await p.evaluate(() => window.__EM_DRAG__.selected()), sel0, `${theme}: …and does not select in the scene`);
    ok(await p.evaluate(() => document.activeElement?.matches?.("[data-vis]") ?? false), `${theme}: the focus back on «Visibilità ▾»`);
    await p.evaluate(() => document.querySelector("[data-vis]").click());
    await p.waitForTimeout(200);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    ok(!(await visible(p, ".vis-menu[data-vis-menu]")), `${theme}: Esc closes «Visibilità»`);

    const colm = await p.evaluate(() => !!document.querySelector("[data-colours-menu]"));
    ok(colm, `${theme}: «Colori» has its «▾»`);
    await p.click("[data-colours-menu]");
    await p.waitForTimeout(250);
    ok(await visible(p, ".col-menu"), `${theme}: «Colori ▾» opens`);
    eq(await floatingNow(p), ["colours"], `${theme}: «Colori» is a floating panel`);
    await shot(p, `${theme}-space-colours`);
    await p.mouse.click(host.x, host.y);
    await p.waitForTimeout(300);
    ok(!(await visible(p, ".col-menu")), `${theme}: a click on the scene closes «Colori»`);
    eq(await p.evaluate(() => window.__sceneHeard), [], `${theme}: …the scene hears nothing of that click either`);
    eq(await p.evaluate(() => window.__EM_DRAG__.selected()), sel0, `${theme}: …and does not select`);
    await p.click("[data-colours-menu]");
    await p.waitForTimeout(200);
    await p.click("[data-colours-menu]");
    await p.waitForTimeout(200);
    ok(!(await visible(p, ".col-menu")), `${theme}: the «▾» again closes «Colori»`);
    await p.click("[data-colours-menu]");
    await p.waitForTimeout(200);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    ok(!(await visible(p, ".col-menu")), `${theme}: Esc closes «Colori»`);
    // a RIGHT click outside: it closes, and no context menu opens under it
    await p.click("[data-colours-menu]");
    await p.waitForTimeout(200);
    await p.evaluate(() => { window.__sceneHeard = []; });
    await p.mouse.click(host0.x, host0.y, { button: "right" });
    await p.waitForTimeout(300);
    ok(!(await visible(p, ".col-menu")), `${theme}: a right click on the scene closes «Colori»`);
    eq([await p.evaluate(() => window.__sceneHeard), await floatingNow(p)], [[], []], `${theme}: …the scene hears nothing, no context menu opens`);
    eq(errors, [], `${theme}: no page error in the Space`);
    await ctx.close();
  }
}

await browser.close();
vite?.kill();
console.log(`✓ check-floating: ${checks} checks`);
