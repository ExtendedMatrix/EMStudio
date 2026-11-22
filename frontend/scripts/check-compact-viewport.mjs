// MICRO-SEG31 (22 Nov 2026) · a 3D area takes the form of its room.
//
//   node scripts/check-compact-viewport.mjs        (PORT=<a Vite already running> to reuse one)
//
// E.D.: «troppi menu dentro lo spazio 3D: di solito a quella dimensione non si
// dovrebbero vedere». Small (< 520 px wide or < 360 px high): the gizmo, «ⓘ»
// (the scene's state in a popover), «⋯» (the columns of buttons), «Follow the
// text» in the Narrative's companion; no line of text and no label over the
// scene, nothing covering anything. Mid (< 820 × 520): one line. Full: as before.
// The counts are neutral («64 of 108 units in this epoch have a 3D proxy · 87
// models»); a warning only when something does not load.
//
// Part 1 runs in node (the pure rules of `compact-viewport.ts`); part 2 opens
// the app in Chromium on `testdata/spazio.em.json`.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FE = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(FE, "src");
let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; console.log(`  ✓ ${what}`); };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; console.log(`  ✓ ${what}`); };

// ── part 1 · the pure rules ─────────────────────────────────────────────────
{
  const out = await esbuild.build({
    stdin: { contents: `export * from "./compact-viewport";`, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, logLevel: "silent",
  });
  const V = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  eq([V.VP_SMALL.w, V.VP_SMALL.h, V.VP_FULL.w, V.VP_FULL.h], [520, 360, 820, 520], "the thresholds: small < 520 × 360, one line < 820 × 520");
  eq([V.viewportSize(519, 800), V.viewportSize(900, 359), V.viewportSize(520, 360), V.viewportSize(819, 900), V.viewportSize(900, 519), V.viewportSize(820, 520)],
     ["small", "small", "mid", "mid", "mid", "full"], "either side under the threshold decides; the threshold itself belongs to the bigger form");
  eq(V.viewportSize(0, 0), "full", "an area not laid out yet keeps the full form (nothing hidden by mistake)");
  const sum = { rmMissing: ["R2"], missing: ["U1"], refused: [], rms: [{ id: "R1", name: "Wall", resource: { state: "resident" } }, { id: "R2", name: "Roof", resource: { state: "missing" } }, { id: "R3", name: "Gate", resource: { state: "refused" } }] };
  eq(V.loadTrouble(sum), { models: ["Roof", "Gate"], proxies: 1 }, "what does not load: the models missing or refused, the proxies missing or refused");
  eq(V.loadTrouble(sum, ["R1", "OTHER"]).models, ["Wall", "Roof", "Gate"], "…and a model whose load failed (another epoch's failure ignored)");
  const fine = { rmMissing: [], missing: [], refused: [], rms: [{ id: "R1", name: "Wall", resource: { state: "resident" } }] };
  eq(V.hasTrouble(V.loadTrouble(fine)), false, "a scene whose models are all there: no warning (44 units without a proxy are not a fault)");
}

// ── part 1b · the lab installed in /Applications (MICRO-SEG31 C) ───────────
{
  const emsh = readFileSync(join(FE, "..", "em.sh"), "utf8");
  const lab = emsh.slice(emsh.indexOf("do_build_lab() {"), emsh.indexOf("do_install_lab() {"));
  ok(/do_install_lab "\$app"/.test(lab), "C · ./em.sh build --lab ends by installing the app it built");
  const inst = emsh.slice(emsh.indexOf("do_install_lab() {"), emsh.indexOf("#: `embargo-guard"));
  ok(/EM_LAB_INSTALL_DIR:-\/Applications/.test(inst) && /ditto "\$src" "\$tmp"/.test(inst), "C · …ditto into /Applications/EMStudio_lab.app (a hidden copy first, then the swap)");
  ok(/xattr -dr com\.apple\.quarantine/.test(inst), "C · …the quarantine removed");
  ok(/lab_running "\$dest"/.test(inst) && !/osascript|kill /.test(inst), "C · …an open lab is never closed from here: it asks and waits (no quit event, no kill)");
  ok(/install-lab\) do_install_lab/.test(emsh) && /\.\/em\.sh install-lab/.test(emsh.slice(0, emsh.indexOf("# In a DISTRIBUTED"))), "C · ./em.sh install-lab, in the help");
}

// ── part 2 · the page ───────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const pwMod = await (async () => {
  for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
    new URL("../../.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js", import.meta.url).pathname]) {
    if (!t) continue;
    try { const m = t.startsWith("/") ? await import(t) : require(t); return m.chromium ? m : m.default; } catch { /* next */ }
  }
  return null;
})();
if (!pwMod) { console.log(`compact-viewport: ${checks} checks passed (page part SKIPPED: playwright-core not found)`); process.exit(0); }
const CHR = process.env.CHR ?? [1248, 1243].map((v) => `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-${v}/chrome-headless-shell-mac-arm64/chrome-headless-shell`).find((p) => existsSync(p));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const PORT = process.env.PORT ?? String(await freePort());
let vite = null;
if (!process.env.PORT) {
  vite = spawn(process.execPath, [join(FE, "node_modules/vite/bin/vite.js"), "--port", PORT, "--strictPort"], { cwd: FE, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("vite did not start")), 60000);
    const on = (d) => { if (/Local:|ready in/i.test(String(d))) { clearTimeout(t); res(); } };
    vite.stdout.on("data", on); vite.stderr.on("data", on);
  });
}
const browser = await pwMod.chromium.launch({ executablePath: CHR, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const done = async (code) => { await browser.close().catch(() => {}); vite?.kill("SIGTERM"); process.exit(code); };
process.on("unhandledRejection", (e) => { console.error(e); void done(1); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SHOTS ?? null;

const fixture = () => {
  const d = JSON.parse(readFileSync(join(FE, "testdata/spazio.em.json"), "utf8"));
  // a story, so the Narrative has its companion 3D
  d.graph.nodes.push({ id: "NR", node_type: "narrative", name: "Il muro", data: { chapters: [
    { title: "Medioevo", anchor: "EP_MED", blocks: [{ block_type: "prose", text: "The fill [[USV106]] leans on the wall." }] },
  ] } });
  return d;
};

const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
await p.addInitScript(([d]) => {
  window.__EM_TEST_DATA__ = d;
  if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "en"); sessionStorage.setItem("probe", "1"); }
}, [fixture()]);
await p.goto(`http://localhost:${PORT}/em/studio/?bridge=http://127.0.0.1:9`);
await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length > 0, null, { timeout: 60000 });
await p.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="space"]')?.click());
await p.waitForFunction(() => !!document.querySelector('.scn-host')?.__spaceViewport && !!document.querySelector(".scn-host .scn-nav"), null, { timeout: 30000 });
// labels on, the stats on: the small form must take them away all the same
await p.evaluate(() => { const h = document.querySelector(".scn-host"); h.dataset.probe = "space"; });

const vp = () => p.evaluate(() => document.querySelector('.scn-host[data-probe="space"]').__spaceViewport());
/** resize the page until the Space's 3D area takes `form` (the panels around it share the page) */
const sizeFor = async (form) => {
  const tries = { full: [[1900, 1200], [2200, 1300]], mid: [[1240, 820], [1100, 760], [1400, 760]], small: [[900, 600], [760, 560], [700, 420]] }[form];
  for (const [w, h] of tries) {
    await p.setViewportSize({ width: w, height: h });
    await sleep(500);
    const v = await vp();
    if (v.size === form) return v;
  }
  return vp();
};
/** the visible boxes of what floats over the scene (canvas and layers that hold the scene's own marks excepted) */
const floating = () => p.evaluate(() => {
  const host = document.querySelector('.scn-host[data-probe="space"]');
  const skip = (el) => el.matches("canvas, .scn-labels, .scn-mark-labels, .scn-marks, .scn-cursor, .scn-modal, .scn-box, .scn-vptr, .scn-guides, .v3d-labels, .scn-vp-pop") || !el.getBoundingClientRect().width;
  const out = [];
  const visit = (el) => {
    for (const c of el.children) {
      const cs = getComputedStyle(c);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (skip(c)) continue;
      // a group (the follow strip, the nav, the topline): its parts, each one a box
      if (c.matches(".scn-follow, .scn-nav, .scn-vp-btns, .scn-topline")) { visit(c); continue; }
      const r = c.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      out.push({ what: (c.className && String(c.className)) || c.tagName, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    }
  };
  visit(host);
  return out;
});
const overlaps = (boxes) => {
  const bad = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x0 < b.x1 - 1 && a.x1 > b.x0 + 1 && a.y0 < b.y1 - 1 && a.y1 > b.y0 + 1) bad.push(`${a.what} × ${b.what}`);
  }
  return bad;
};
const shown = (sel) => p.evaluate((sel) => [...document.querySelectorAll(`.scn-host[data-probe="space"] ${sel}`)].some((e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0), sel);

// F · full: as before
let v = await sizeFor("full");
eq(v.size, "full", `F1 · a large Space (${v.w}×${v.h}): the full form`);
ok(await shown(".scn-topline") && await shown(".scn-ovbtn") && await shown(".scn-nav-col"), "F1 · the information line, the overlays' glyph, the column under the gizmo");
eq(await shown(".scn-vp-btns"), false, "F1 · no «ⓘ» in the full form: everything is in sight");
const counts = await p.evaluate(() => document.querySelector('.scn-host[data-probe="space"] [data-sum=counts]')?.textContent ?? "");
ok(/^\d+ of \d+ units in this epoch have a 3D proxy · \d+ models?$/.test(counts), `F2 · the counts are neutral words («${counts}»)`);
// the bench has no bridge: the fixture's two models have no file to read — a real fault, said with «why»
const trouble = await p.evaluate(() => { const h = document.querySelector('.scn-host[data-probe="space"]'); const x = h.querySelector("[data-sum=trouble]");
  return x ? { text: x.textContent, why: !!h.querySelector("[data-sum=why]") } : null; });
console.log("    trouble:", JSON.stringify(trouble));
ok(!trouble || (/do(es)? not load/.test(trouble.text) && trouble.why), "F2 · a warning only for what does not load, with «why»");
eq(await p.evaluate(() => document.querySelector('.scn-host[data-probe="space"] .scn-stats')?.classList.contains("hidden")), true, "F3 · the statistics only when asked (Overlays ▸ Statistics), off by default");

// M · mid: one line
v = await sizeFor("mid");
eq(v.size, "mid", `M1 · a middle Space (${v.w}×${v.h}): one line`);
const line = await p.evaluate(() => { const l = document.querySelector('.scn-host[data-probe="space"] .scn-topline'); const kids = [...l.children].filter((c) => getComputedStyle(c).display !== "none");
  return { kids: kids.map((c) => c.className.split(" ")[0]), h: l.getBoundingClientRect().height }; });
eq(line.kids, ["scn-ov"], "M1 · the line keeps only the epoch's summary (view name, stats, hardware in «ⓘ»)");
ok(line.h <= 26, `M1 · …on ONE line (${line.h.toFixed(0)} px)`);
ok(await shown(".scn-vp-info") && !(await shown(".scn-vp-more")), "M1 · «ⓘ» beside it; the buttons stay (no «⋯»)");
eq(overlaps(await floating()), [], "M2 · nothing over anything");

// S · small
v = await sizeFor("small");
eq(v.size, "small", `S1 · a small Space (${v.w}×${v.h}): the compact form`);
eq(await shown(".scn-topline"), false, "S1 · no line of text over the scene");
eq([await shown(".scn-toolbar"), await shown(".scn-nav-col"), await shown(".scn-ovbtn"), await shown(".scn-tab"), await shown(".scn-ntab")],
   [false, false, false, false, false], "S1 · no column of buttons (toolbar, the gizmo's column, overlays, side tabs)");
ok(await shown(".scn-nav-box") && await shown(".scn-vp-info") && await shown(".scn-vp-more"), "S1 · the gizmo, «ⓘ» and «⋯»");
const gz = await p.evaluate(() => document.querySelector('.scn-host[data-probe="space"] .scn-nav-box').getBoundingClientRect().width);
ok(gz < 80, `S1 · the gizmo smaller (${gz.toFixed(0)} px)`);
eq(await shown(".scn-labels"), false, "S1 · the proxies' labels off by default");
const fb = await floating();
eq(overlaps(fb), [], `S2 · nothing over anything (${fb.map((b) => b.what.split(" ")[0]).join(", ")})`);
if (SHOTS) await p.screenshot({ path: join(SHOTS, "space-small.png") });

// S3 · «ⓘ»: the scene's state in a popover
await p.evaluate(() => document.querySelector('.scn-host[data-probe="space"] [data-vp=info]').click());
v = await vp();
eq(v.pop, true, "S3 · «ⓘ» opens the popover");
ok(["epoch", "content", "stats", "hw"].every((k) => k in v.rows), `S3 · …with the epoch, the content, the statistics, the hardware (${Object.keys(v.rows).join(", ")})`);
ok(/units in this epoch have a 3D proxy/.test(v.rows.content), "S3 · …the content in the neutral words");
eq(v.rows.stats, "off — Overlays ▸ Statistics", "S3 · …the statistics say where they are turned on");
if (SHOTS) await p.screenshot({ path: join(SHOTS, "space-small-info.png") });
await p.keyboard.press("Escape");
eq((await vp()).pop, false, "S3 · Escape closes it");
await p.evaluate(() => document.querySelector('.scn-host[data-probe="space"] [data-vp=info]').click());
await p.mouse.click(5, 5);
eq((await vp()).pop, false, "S3 · …and so does a click elsewhere");

// S4 · the labels can be turned on
await p.evaluate(() => document.querySelector('.scn-host[data-probe="space"] [data-vp=info]').click());
await p.evaluate(() => { const c = document.querySelector('.scn-host[data-probe="space"] [data-vp=labels]'); c.checked = true; c.dispatchEvent(new Event("change")); });
eq((await vp()).labels, true, "S4 · «Labels of the proxies» in the popover turns them on");
await p.evaluate(() => { const c = document.querySelector('.scn-host[data-probe="space"] [data-vp=labels]'); c.checked = false; c.dispatchEvent(new Event("change")); });
await p.keyboard.press("Escape");

// S5 · «⋯»: the columns come back; growing takes them away
await p.evaluate(() => document.querySelector('.scn-host[data-probe="space"] [data-vp=more]').click());
ok(await shown(".scn-toolbar") && await shown(".scn-nav-col") && await shown(".scn-ovbtn"), "S5 · «⋯» brings the columns back");
eq((await vp()).cols, true, "S5 · …«⋯» pressed");
await p.evaluate(() => document.querySelector('.scn-host[data-probe="space"] [data-vp=more]').click());
eq(await shown(".scn-toolbar"), false, "S5 · …and takes them away again");

// N · the Narrative's companion (E.D.'s case)
await p.setViewportSize({ width: 1440, height: 900 });
await p.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="narrative"]')?.click());
await p.waitForSelector("[data-nvf-strip]", { timeout: 20000 });
await sleep(600);
const comp = await p.evaluate(() => { const h = document.querySelector("[data-nvf-strip]").closest(".scn-host"); h.dataset.probe = "comp"; return h.__spaceViewport(); });
ok(comp.size !== "full", `N1 · the companion 3D beside the page (${comp.w}×${comp.h}) is not full: ${comp.size}`);
const compShown = (sel) => p.evaluate((sel) => [...document.querySelectorAll(`.scn-host[data-probe="comp"] ${sel}`)].filter((e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0).length, sel);
if (comp.size === "small") {
  eq([await compShown("[data-nvf=toggle]"), await compShown("[data-nvf=frame]"), await compShown("[data-nvf=what]"), await compShown(".scn-topline")], [1, 0, 0, 0],
     "N1 · small: «Follow the text» stays; the other buttons, the activity's line and the information line go");
}
// force the small form on the companion, as a narrow area beside the page
await p.setViewportSize({ width: 1100, height: 760 });
await sleep(600);
const c2 = await p.evaluate(() => document.querySelector('.scn-host[data-probe="comp"]').__spaceViewport());
eq(c2.size, "small", `N2 · a narrower window: the companion small (${c2.w}×${c2.h})`);
eq([await compShown("[data-nvf=toggle]"), await compShown("[data-nvf=frame]"), await compShown("[data-nvf=figure]"), await compShown("[data-nvf=what]")], [1, 0, 0, 0],
   "N2 · only «Follow the text» of the strip");
const cb = await p.evaluate(() => {
  const host = document.querySelector('.scn-host[data-probe="comp"]');
  const els = [...host.querySelectorAll(".scn-vp-btns > button, [data-nvf=toggle], .scn-nav-box")].filter((e) => getComputedStyle(e).display !== "none");
  return els.map((e) => { const r = e.getBoundingClientRect(); return { what: e.className || e.dataset.nvf, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; });
});
eq(overlaps(cb), [], `N2 · «ⓘ», «⋯», «Follow the text» and the gizmo side by side, none over another (${cb.length})`);
await p.evaluate(() => document.querySelector('.scn-host[data-probe="comp"] [data-vp=more]').click());
eq([await compShown("[data-nvf=toggle]"), await compShown("[data-nvf=frame]"), await compShown("[data-nvf=figure]"), await compShown("[data-nvf=what]")], [1, 1, 1, 0],
   "N2 · «⋯» brings back «Frame this block» and «Insert this view as a figure» (the line of what it follows stays in «ⓘ»)");
const cb2 = await p.evaluate(() => {
  const host = document.querySelector('.scn-host[data-probe="comp"]');
  const els = [...host.querySelectorAll(".scn-vp-btns > button, .scn-follow > button, .scn-nav-box")].filter((e) => getComputedStyle(e).display !== "none");
  return els.map((e) => { const r = e.getBoundingClientRect(); return { what: e.className || e.dataset.nvf, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; });
});
eq(overlaps(cb2), [], "N2 · …still none over another");
await p.evaluate(() => document.querySelector('.scn-host[data-probe="comp"] [data-vp=more]').click());
await p.evaluate(() => document.querySelector('.scn-host[data-probe="comp"] [data-vp=info]').click());
const c3 = await p.evaluate(() => document.querySelector('.scn-host[data-probe="comp"]').__spaceViewport());
ok("follow" in c3.rows, `N3 · «ⓘ» of the companion says what it follows («${c3.rows.follow ?? ""}»)`);
if (SHOTS) await p.screenshot({ path: join(SHOTS, "narrative-small-info.png") });
await p.keyboard.press("Escape");

// I · Italian
await p.evaluate(() => { localStorage.setItem("emstudio.locale", "it"); });
await p.reload();
await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length > 0, null, { timeout: 60000 });
await p.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="space"]')?.click());
await p.setViewportSize({ width: 1900, height: 1200 });
await p.waitForFunction(() => !!document.querySelector('.scn-host [data-sum=counts]'), null, { timeout: 30000 });
const it = await p.evaluate(() => document.querySelector('.scn-host [data-sum=counts]').textContent);
ok(/^\d+ unità su \d+ di questa epoca hanno un proxy 3D · \d+ modell[oi]$/.test(it), `I1 · in Italian («${it}»)`);

eq(errors, [], "no page error");
console.log(`compact-viewport: ${checks} checks passed`);
await done(0);
