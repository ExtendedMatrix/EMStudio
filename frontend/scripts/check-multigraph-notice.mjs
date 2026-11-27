// MICRO-PG1 (EMStudio#1; E.D. 27 Nov 2026) · a file with more than one graph
// SAYS so at the open: «This file contains N studies: you will find them in the
// Multigraph panel», with a button that opens the panel (`openEMTree`). A site
// is one graph; a container with more keeps them as different studies, and the
// ones that are not active become slots nobody would otherwise see.
//
//   node scripts/check-multigraph-notice.mjs      (PORT=<a Vite of this tree>, else one is started)
//
// A container of 3 graphs (one id «Scavo archeologico|II», the active one): 3
// slots, the notice in English and in Italian, its click opens the Multigraph
// window; with an empty graph among three, G5's question first and then the
// notice counting 2; a container of ONE graph and a legacy single-graph file: no notice.
// Skipped (rc 0, said) without playwright-core.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FE = fileURLToPath(new URL("..", import.meta.url));
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
const pw = await loadPw();
if (!pw) { console.log("– check-multigraph-notice: playwright-core not found (PLAYWRIGHT_CORE): skipped"); process.exit(0); }
const freePort = () => new Promise((res, rej) => {
  const s = createServer(); s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});
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

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; console.log(`  ✓ ${what}`); };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; console.log(`  ✓ ${what}`); };

const header = { format: "em.json", version: "1.0" };
const g = (id, name, u) => ({ graph_id: id, name, nodes: [{ id: u, node_type: "US", name: u }], edges: [] });
const three = { header, graphs: {
  "Scavo archeologico": g("Scavo archeologico", "Scavo archeologico", "US1"),
  "Scavo archeologico|II": g("Scavo archeologico|II", "Scavo archeologico II", "US2"),
  "Saggio B": g("Saggio B", "Saggio B", "US3") }, active_graph_id: "Scavo archeologico|II" };
const one = { header, graphs: { solo: g("solo", "Solo", "US9") }, active_graph_id: "solo" };
const legacy = { header, graph: g("legacy", "Legacy", "US7") };
// G5 · one of three is an empty graph: its question first, the notice after it
const withEmpty = { header, graphs: { tempio: g("tempio", "Tempio", "US4"),
  vuoto: { graph_id: "vuoto", name: "untitled graph", nodes: [], edges: [] },
  saggio: g("saggio", "Saggio", "US5") }, active_graph_id: "tempio" };

const browser = await pw.chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined });
const errors = [];
async function openWith(doc, path, locale) {
  const page = await (await browser.newContext({ viewport: { width: 1552, height: 914 } })).newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript((loc) => { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", loc); sessionStorage.setItem("probe", "1"); } }, locale);
  await page.goto(`http://localhost:${PORT}/em/studio/`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 90000 });
  await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, path]);
  await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 0, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  return page;
}
const toastOf = (page) => page.evaluate(() => {
  const el = document.getElementById("toast");
  return { shown: !el.classList.contains("hidden"), text: el.textContent ?? "",
    buttons: [...el.querySelectorAll("button.toast-action")].map((b) => b.textContent) };
});

try {
  // ── 3 graphs, English ──
  let page = await openWith(three, "/tmp/tre.em.json", "en");
  const slots = await page.evaluate(() => window.__EM_DRAG__.slots());
  eq(slots.length, 3, "3 members → 3 slots");
  eq(slots.map((s) => s.name), ["Scavo archeologico", "Scavo archeologico II", "Saggio B"], "every member is a slot, «Scavo archeologico|II» too");
  eq(slots.findIndex((s) => s.active), 1, "the active one is active_graph_id («Scavo archeologico|II»)");
  let t = await toastOf(page);
  ok(t.shown && t.text.startsWith("This file contains 3 studies: you will find them in the Multigraph panel"), `en: the notice — «${t.text}»`);
  eq(t.buttons, ["Open Multigraph"], "en: one button, Open Multigraph");
  const log = await page.evaluate(() => window.__EM_DRAG__.logTail(30).join("\n"));
  ok(/3 graphs open — the active one is «Scavo archeologico II»/.test(log), "the long sentence (which one is active) stays in the Log");
  const before = await page.evaluate(() => ({ n: window.__EM_DRAG__.wins().filter((w) => w.type === "emtree" || w.type === "outliner").length,
    active: window.__EM_DRAG__.wins().find((w) => w.id === window.__EM_DRAG__.activeWinId())?.type }));
  ok(before.active !== "emtree" && before.active !== "outliner", `before the click the active window is not the panel (${before.active})`);
  await page.evaluate(() => document.querySelector("#toast button.toast-action").click());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ wins: window.__EM_DRAG__.wins(), active: window.__EM_DRAG__.activeWinId(),
    hidden: document.getElementById("toast").classList.contains("hidden") }));
  const tree = after.wins.find((w) => w.type === "emtree") ?? after.wins.find((w) => w.type === "outliner");
  ok(!!tree && tree.id === after.active, `the click opens the Multigraph panel (window ${tree?.type}, active; before: ${before.n} such window(s), active ${before.active})`);
  ok(after.hidden, "the notice goes with the click");
  await page.context().close();

  // ── 3 graphs, Italian ──
  page = await openWith(three, "/tmp/tre.em.json", "it");
  t = await toastOf(page);
  ok(t.shown && t.text.startsWith("Questo file contiene 3 studi: li trovi nel pannello Multigrafo"), `it: the notice — «${t.text}»`);
  eq(t.buttons, ["Apri Multigrafo"], "it: one button, Apri Multigrafo");
  await page.context().close();

  // ── G5's question comes first; the notice after it, counting what is left ──
  page = await openWith(withEmpty, "/tmp/vuoto.em.json", "en");
  t = await toastOf(page);
  eq(t.buttons, ["Remove it", "Keep it"], `G5's question is shown first («${t.text}»)`);
  await page.evaluate(() => [...document.querySelectorAll("#toast .toast-action")].find((b) => b.textContent === "Remove it").click());
  await page.waitForTimeout(500);
  t = await toastOf(page);
  ok(t.shown && t.text.startsWith("This file contains 2 studies:"), `after «Remove it» the notice counts 2 studies («${t.text}»)`);
  eq(t.buttons, ["Open Multigraph"], "…with its button");
  await page.context().close();

  // ── one graph: nothing said ──
  for (const [doc, what] of [[one, "a container of one graph"], [legacy, "a legacy single-graph file"]]) {
    page = await openWith(doc, "/tmp/uno.em.json", "en");
    t = await toastOf(page);
    eq((await page.evaluate(() => window.__EM_DRAG__.slots())).length, 1, `${what}: one slot`);
    ok(!/studies/.test(t.text) && !t.buttons.includes("Open Multigraph"), `${what}: no notice («${t.shown ? t.text : ""}»)`);
    await page.context().close();
  }
  eq(errors, [], "no page error");
  console.log(`check-multigraph-notice: ${checks} checks passed`);
} finally {
  await browser.close();
  vite?.kill();
}
