// G5 · «Navigazione» (MICRO grafo reattivo, 9 ott 2026) — the gestures of a
// graph canvas, measured in a real browser on the camera they move.
//
//   PORT=5173 node scripts/check-navigation.mjs
//
// Pan: the right button held, the middle button, Space + drag, a two-finger
// trackpad scroll (a wheel without ctrlKey, in pixels, with a horizontal
// component or fine deltas). Zoom: a pinch (a wheel with ctrlKey) and the mouse
// wheel, centred on the cursor. The box selection stays on the left button over
// the background. The context menu opens on a right click that does not move
// (under 4 px), and a right drag opens none.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const PORT = process.env.PORT ?? "5173";
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
const { chromium } = await playwright();
const browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined });
const doc = JSON.parse(readFileSync(new URL("../testdata/TempluMare.em.json", import.meta.url), "utf8"));

let checks = 0, failed = 0;
const ok = (cond, what) => {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${what}`); } else console.log(`  ✓ ${what}`);
};

const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await p.addInitScript((d) => {
  window.__EM_TEST_DATA__ = d;
  try { localStorage.clear(); localStorage.setItem("emstudio.locale", "en"); } catch { /* */ }
}, doc);
await p.goto(`http://localhost:${PORT}/em/studio/`);
await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length > 0, null, { timeout: 30000 });
await p.waitForTimeout(800);

const vp = () => p.evaluate(() => window.__EM_SCENE__().vp);
const canvas = await p.evaluate(() => {
  const c = [...document.querySelectorAll("canvas")].filter((c) => c.offsetParent)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const r = c.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});
// an empty point of the canvas (no node under it), right of the lane labels
const empty = await p.evaluate((c) => {
  for (let y = 40; y < c.h - 20; y += 9)
    for (let x = 200; x < c.w - 260; x += 13)
      if (!window.__EM_DRAG__.hitAt(x, y)) return { x: c.x + x, y: c.y + y };
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
}, canvas);
const menuOpen = () => p.evaluate(() => !!document.querySelector(".addm, #context-menu:not(.hidden), .ctx-menu:not(.hidden)"));
const closeMenus = async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(150); };

// ── right button: a drag pans, a click opens the menu ──────────────────────
{
  const a = await vp();
  await p.mouse.move(empty.x, empty.y);
  await p.mouse.down({ button: "right" });
  await p.mouse.move(empty.x + 60, empty.y + 25, { steps: 6 });
  await p.mouse.up({ button: "right" });
  await p.waitForTimeout(250);
  const b = await vp();
  ok(Math.abs(b.x - a.x - 60) <= 2 && Math.abs(b.y - a.y - 25) <= 2 && b.scale === a.scale,
    `a right drag of 60,25 pans the camera by 60,25 (got ${b.x - a.x},${b.y - a.y})`);
  ok(!(await menuOpen()), "a right drag opens no context menu");
  await closeMenus();
}
{
  await p.mouse.move(empty.x, empty.y);
  await p.mouse.down({ button: "right" });
  await p.mouse.move(empty.x + 2, empty.y + 1);
  await p.mouse.up({ button: "right" });
  await p.waitForTimeout(300);
  ok(await menuOpen(), "a right click that moves under 4 px opens the context menu");
  await closeMenus();
}
// ── the middle button and Space + drag still pan ───────────────────────────
{
  const a = await vp();
  await p.mouse.move(empty.x, empty.y);
  await p.mouse.down({ button: "middle" });
  await p.mouse.move(empty.x - 40, empty.y + 10, { steps: 5 });
  await p.mouse.up({ button: "middle" });
  await p.waitForTimeout(200);
  const b = await vp();
  ok(Math.abs(b.x - a.x + 40) <= 2 && Math.abs(b.y - a.y - 10) <= 2, "the middle button pans");
}
// ── the wheel: trackpad pans, pinch zooms, the mouse wheel zooms at the cursor ─
const wheel = (init) => p.evaluate(([init, pt]) => {
  const c = document.elementFromPoint(pt.x, pt.y);
  c.dispatchEvent(new WheelEvent("wheel", { clientX: pt.x, clientY: pt.y, bubbles: true, cancelable: true, ...init }));
}, [init, empty]);
{
  const a = await vp();
  await wheel({ deltaX: 12.5, deltaY: 30.25, deltaMode: 0 });
  await p.waitForTimeout(120);
  const b = await vp();
  ok(b.scale === a.scale && Math.abs(a.x - b.x - 12.5) <= 1 && Math.abs(a.y - b.y - 30.25) <= 1,
    `a two-finger trackpad scroll pans by its deltas (got ${a.x - b.x},${a.y - b.y}, scale ${a.scale}→${b.scale})`);
  await p.waitForTimeout(500); // the trackpad gesture is over
}
{
  const a = await vp();
  await wheel({ deltaY: -8, ctrlKey: true, deltaMode: 0 });
  await p.waitForTimeout(120);
  const b = await vp();
  ok(b.scale > a.scale, `a pinch out (ctrl-wheel −8) zooms in (${a.scale} → ${b.scale})`);
  await wheel({ deltaY: 8, ctrlKey: true, deltaMode: 0 });
  await p.waitForTimeout(120);
  const c = await vp();
  ok(Math.abs(c.scale - a.scale) < 0.002, "…and the inverse pinch zooms back out");
  await p.waitForTimeout(500);
}
{
  // a mouse notch: a whole delta in lines (Firefox) — and the point under the
  // cursor stays where it was
  const a = await vp();
  const world = { x: (empty.x - canvas.x - a.x) / a.scale, y: (empty.y - canvas.y - a.y) / a.scale };
  await wheel({ deltaY: -3, deltaMode: 1 });
  await p.waitForTimeout(120);
  const b = await vp();
  const sx = world.x * b.scale + b.x + canvas.x, sy = world.y * b.scale + b.y + canvas.y;
  ok(b.scale > a.scale && Math.abs(sx - empty.x) < 2 && Math.abs(sy - empty.y) < 2,
    `the mouse wheel zooms centred on the cursor (${a.scale} → ${b.scale}, the point drifted ${Math.round(sx - empty.x)},${Math.round(sy - empty.y)} px)`);
  await p.waitForTimeout(500);
  await p.mouse.move(empty.x, empty.y);
  const c = await vp();
  await p.mouse.wheel(0, 100); // Chrome's own mouse wheel event: a whole 100 px notch
  await p.waitForTimeout(150);
  const d = await vp();
  ok(d.scale < c.scale, `a mouse notch from the browser (deltaY 100) zooms out (${c.scale} → ${d.scale})`);
}
// ── the box selection is still the left button over the background ─────────
{
  await p.evaluate(() => window.__EM_DRAG__.select(null));
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.title?.startsWith("Fit to this window") && b.offsetParent)?.click());
  await p.waitForTimeout(400);
  const box = await p.evaluate((c) => {
    const s = window.__EM_SCENE__();
    for (const n of s.boxes) {
      const x = n.x - 8, y = n.y - 8;
      if (x > 170 && y > 0 && x < c.w && y < c.h && !window.__EM_DRAG__.hitAt(x, y))
        return { x0: c.x + x, y0: c.y + y, x1: c.x + n.x + n.w + 4, y1: c.y + n.y + n.h + 4 };
    }
    return null;
  }, canvas);
  const a = await vp();
  await p.mouse.move(box.x0, box.y0);
  await p.mouse.down();
  await p.mouse.move(box.x1, box.y1, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  const b = await vp();
  const sel = await p.evaluate(() => window.__EM_DRAG__.selected().length);
  ok(sel >= 1 && b.x === a.x && b.y === a.y, `a left drag on the background selects (${sel}) and does not pan`);
}
// ── G6 · the Outliner from the keyboard ─────────────────────────────────────
{
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-nl-id]")].filter((r) => !r.closest(".hidden")).map((r) => r.dataset.nlId));
  const at0 = await p.evaluate((id) => window.__EM_DRAG__.sceneOf(id), rows[0]);
  await p.click(`[data-nl-id="${rows[0]}"]`);
  await p.waitForTimeout(250);
  const sel = () => p.evaluate(() => window.__EM_DRAG__.selected()[0] ?? null);
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(200);
  ok(await sel() === rows[1], "↓ selects the next row (the app's selection)");
  await p.keyboard.press("ArrowUp"); await p.waitForTimeout(200);
  ok(await sel() === rows[0], "↑ the previous one");
  await p.keyboard.press("End"); await p.waitForTimeout(200);
  ok(await sel() === rows[rows.length - 1], "End: the last row");
  const inView = await p.evaluate(() => { const r = document.querySelector(".nl-rows .selected"), l = document.querySelector(".nl-rows"); const a = r.getBoundingClientRect(), c = l.getBoundingClientRect(); return a.top >= c.top - 1 && a.bottom <= c.bottom + 1; });
  ok(inView, "…scrolled into view");
  await p.keyboard.press("Home"); await p.waitForTimeout(200);
  ok(await sel() === rows[0], "Home: the first row");
  const at1 = await p.evaluate((id) => window.__EM_DRAG__.sceneOf(id), rows[0]);
  ok(JSON.stringify(at0) === JSON.stringify(at1), "the arrows move the selection, not the node on the canvas");
}
ok(!errors.length, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
console.log(`check-navigation: ${checks - failed}/${checks} ✓`);
await browser.close();
process.exit(failed ? 1 : 0);
