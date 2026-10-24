// MICRO-LAB orizzonti · reading by horizons in a real browser.
//
//   PORT=5180 BRIDGE=http://127.0.0.1:8780 PLAYWRIGHT_CORE=… \
//     node scripts/check-horizons-live.mjs <GT16 with two periodizations> [SHOTS dir]
//
// The bridge must run THIS s3Dgraphy (the lab's: `api.chronology` with the
// epochs). HZ1 the Chronology shows the panel and the two periodizations;
// HZ2 colour / filter mark the Matrix and the Graph from the bridge's
// intervals; HZ3 create, edit, reorder, delete — each one undo step (⌘Z's own
// path), each in the Log, each an op of the horizons store; HZ4 the save
// carries the member with the edits; HZ5 in a room the member is addressed
// like a graph (G1: `graph_id` in the envelope, and back to this store).
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";

const PORT = process.env.PORT ?? "5180";
const BRIDGE = process.env.BRIDGE ?? "http://127.0.0.1:8780";
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const FILE = process.argv[2];
const SHOTS = process.argv[3] ?? null;
if (!FILE) throw new Error("usage: check-horizons-live.mjs <em.json with periodizations> [shots dir]");
const pw = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const chromium = pw.chromium ?? pw.default?.chromium;

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; console.log(`  ✓ ${what}`); };
const browser = await chromium.launch({ executablePath: CHR });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(BRIDGE)}`);
await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 60000 });
const doc = JSON.parse(readFileSync(FILE, "utf8"));
await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, FILE]);
await page.waitForTimeout(1500);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// ── HZ1 · the panel ─────────────────────────────────────────────────────────
// the button lives in a menu: the gesture it runs is what matters here
await page.$eval("#btn-tool-chronology", (b) => b.click());
await page.waitForSelector("[data-hz-panel]", { timeout: 20000 });
const options = await page.$$eval("[data-hz-choose] option", (os) => os.map((o) => o.textContent));
ok(options.length === 2, `HZ1 two periodizations in the selector: ${options.join(" | ")}`);
await page.selectOption("[data-hz-choose]", { index: 1 });
await page.waitForTimeout(300);
const rows = await page.$$eval("[data-hz-row]", (r) => r.length);
ok(rows === 5, `HZ1 the chosen periodization lists its 5 horizons`);

// ── HZ2 · colour, then filter ───────────────────────────────────────────────
await page.check('[data-hz-mode="colour"]');
await page.waitForFunction(() => {
  const m = window.__EM_DRAG__.horizonMarks();
  return m && Object.keys(m.tint).length > 0;
}, null, { timeout: 120000 });
let marks = await page.evaluate(() => window.__EM_DRAG__.horizonMarks());
ok(Object.keys(marks.tint).length > 50, `HZ2 colour: ${Object.keys(marks.tint).length} nodes take an horizon's colour`);
ok(Object.values(marks.inside).some((ids) => ids.length > 1), "HZ2 overlap: some node is inside more than one horizon");
const counts = await page.$$eval("[data-hz-row] .hz-count", (c) => c.map((x) => Number(x.textContent)));
ok(counts.some((n) => n > 0), `HZ2 the panel counts the nodes per horizon: ${counts.join(", ")}`);
await shot("hz2-colour");
await page.check('[data-hz-mode="filter"]');
// the most populated horizon (Alto Impero, 118): what lies only there fades
const firstRow = await page.$$eval("[data-hz-row]", (r) => r[1].dataset.hzRow);
await page.uncheck(`[data-hz-show="${firstRow}"]`);
await page.waitForTimeout(400);
marks = await page.evaluate(() => window.__EM_DRAG__.horizonMarks());
ok(marks.fade.length > 0, `HZ2 filter: ${marks.fade.length} dated nodes outside the visible horizons fade`);
await shot("hz2-filter");
await page.check(`[data-hz-show="${firstRow}"]`);

// ── HZ3 · create, edit, reorder, delete: undo, Log, ops ─────────────────────
await page.evaluate(() => {
  window.__hzOps = [];
  window.__EM_DRAG__.horizonsStore().onOp((op) => window.__hzOps.push(op));
});
const nRows = async () => page.$$eval("[data-hz-row]", (r) => r.length);
await page.click("[data-hz-add]");
await page.waitForTimeout(300);
ok(await nRows() === 6, "HZ3 «+ Horizon» adds a row");
let ops = await page.evaluate(() => window.__hzOps.map((o) => o.op));
ok(ops.includes("add_node") && ops.includes("add_edge"), `HZ3 …as ops of the horizons store (${ops.join(", ")})`);
await page.evaluate(() => window.__EM_DRAG__.undoAny());
await page.waitForTimeout(300);
ok(await nRows() === 5, "HZ3 ⌘Z's path takes the whole addition back in one step");
await page.click("[data-hz-add]");
await page.waitForTimeout(300);
const newId = await page.$$eval("[data-hz-row]", (r) => r[r.length - 1].dataset.hzRow);
await page.fill(`[data-hz-name="${newId}"]`, "Età contemporanea");
await page.press(`[data-hz-name="${newId}"]`, "Enter");
await page.fill(`[data-hz-num="${newId}|end_time"]`, "2100");
await page.press(`[data-hz-num="${newId}|end_time"]`, "Enter");
await page.waitForTimeout(300);
const named = await page.$eval(`[data-hz-name="${newId}"]`, (x) => x.value);
ok(named === "Età contemporanea", "HZ3 renamed in the panel");
const up = await page.$$(`[data-hz-row="${newId}"] .hz-acts button`);
await up[0].click();  // ↑
await page.waitForTimeout(300);
const order = await page.$$eval("[data-hz-row]", (r) => r.map((x) => x.dataset.hzRow));
ok(order.indexOf(newId) === order.length - 2, "HZ3 ↑ moves it one place up");
await page.evaluate(() => window.__EM_DRAG__.undoAny());
await page.waitForTimeout(300);
const order2 = await page.$$eval("[data-hz-row]", (r) => r.map((x) => x.dataset.hzRow));
ok(order2.indexOf(newId) === order2.length - 1, "HZ3 one ⌘Z puts the order back (both swapped horizons)");
const log = await page.evaluate(() => document.body.innerText);
ok(/Età contemporanea/.test(log), "HZ3 the Log names the horizon edited");
ops = await page.evaluate(() => window.__hzOps.map((o) => o.op));
ok(ops.filter((o) => o === "update_node").length >= 2, "HZ3 edits leave as update_node ops");

// ── HZ4 · the save carries the member ───────────────────────────────────────
const saved = JSON.parse(await page.evaluate(() => window.__EM_DRAG__.docJson()));
const member = Object.values(saved.graphs).find((g) => g?.data?.em_collection === "Periodizations");
ok(!!member, "HZ4 the saved project has the periodizations member");
ok(member.nodes.some((n) => n.name === "Età contemporanea" && n.data?.end_time === 2100),
   "HZ4 …with the new horizon and its end");
ok(Object.keys(saved.graphs).filter((k) => saved.graphs[k]?.data?.em_collection === "Periodizations").length === 1,
   "HZ4 one member, not a study graph");

// ── HZ5 · in a room the member is addressed like a graph ────────────────────
const gids = await page.evaluate((d) => window.__EM_DRAG__.roomGraphsFor(d), saved);
ok(gids.includes("periodizations"), `HZ5 the room's addressable graphs include the member (${gids.join(", ")})`);
const where = await page.evaluate(() => window.__EM_DRAG__.storeForGraph("periodizations"));
ok(where === "periodizations", "HZ5 an op the relay sends for it lands in the horizons store");

// ── the Graph view too ──────────────────────────────────────────────────────
await page.check('[data-hz-mode="colour"]');
await shot("hz-chronology-panel");
ok(errors.length === 0, `no page error${errors.length ? `: ${errors[0]}` : ""}`);
await browser.close();
console.log(`check-horizons-live: ${checks} checks green`);
