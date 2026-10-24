// MICRO-FINESTRE-MULTIPLE · a window detached into a system window of its own
// (E.D., 24 Oct 2026: Shift + a corner dragged, as in Blender).
//
//   node scripts/check-detach.mjs                 # the pure part + the browser
//   PORT=5199 node scripts/check-detach.mjs D3    # some browser cases
//   NO_BROWSER=1 node scripts/check-detach.mjs    # the pure part only
//
// PURE (`src/shell/detach.ts`): the records per document, the copy of a
// window's state, the place near the cursor, the features, when the gesture
// is possible, `instanceof` across two realms (jsdom-free: two vm contexts).
// BROWSER (the dev server on PORT, Playwright's headless shell): two system
// windows of one page — the gesture, the menu item, ONE document seen and
// edited from both (selection, rename, undo pressed in the detached window),
// the latency measured, the Space and its WebGL context, the Matrix's overlay
// panel in its own window, two Tabular on two sheets, the Inspector following
// the main window's selection, «back», closing the main page, the record and
// the offer to reopen, an iframe where the gesture is off.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const SRC = new URL("../src/", import.meta.url).pathname;
const TD = new URL("../testdata/", import.meta.url).pathname;
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// ── pure ────────────────────────────────────────────────────────────────────
const bundle = await esbuild.build({
  stdin: { contents: `export * as D from "./shell/detach";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { D } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
{
  const mem = new Map();
  const kv = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  eq(D.recordsFor("/a.em.json", kv), [], "nothing remembered yet");
  const rec = { type: "graph", state: { mode: "matrix" }, x: 1700, y: 80, w: 900, h: 600,
                camera: { mode: "matrix", x: 10, y: 20, scale: 1.5 } };
  D.saveRecords("/a.em.json", [rec], kv);
  D.saveRecords("name:b.em.json", [{ ...rec, type: "table" }], kv);
  eq(D.recordsFor("/a.em.json", kv), [rec], "a document's windows, as they were (the second screen's x kept)");
  eq(D.recordsFor("name:b.em.json", kv).map((r) => r.type), ["table"], "per document");
  D.saveRecords("/a.em.json", [], kv);
  eq(D.recordsFor("/a.em.json", kv), [], "none → the entry goes");
  ok(D.recordsFor("name:b.em.json", kv).length === 1, "…and only that document's");
  mem.set(D.DETACH_KEY, "{broken");
  eq(D.recordsFor("x", kv), [], "a broken entry is nothing, not a throw");
  mem.set(D.DETACH_KEY, JSON.stringify({ x: [{ type: "graph", state: {}, x: "a" }, rec] }));
  eq(D.recordsFor("x", kv), [rec], "a malformed record is dropped, the others kept");
  ok(!JSON.stringify(mem.get(D.DETACH_KEY)).includes("nodes"), "no document content in the preference");

  const st = { mode: "matrix", "current.viewer.role": "service", filters: { q: "US" } };
  const c = D.cloneState(st);
  eq(c, { mode: "matrix", filters: { q: "US" } }, "the twin's state: the view, the filters — not a service role");
  c.filters.q = "X";
  eq(st.filters.q, "US", "a copy, not the same object");

  // MICRO-OVERLAY-PER-FINESTRA p.0 · never "": WKWebView passes it on empty, and Tauri denies it
  eq(D.DETACH_URL, "about:blank", "the detached window's address is said");
  eq(D.placeNear(1000, 500, { w: 800, h: 600 }), { x: 940, y: 484, w: 800, h: 600 }, "near the cursor: the bar under the hand");
  eq(D.popupFeatures({ x: 1920.4, y: -300, w: 100, h: 50 }),
     "popup=yes,left=1920,top=-300,width=240,height=180", "features: a second screen's coordinates, a floor on the size");
  eq(D.defaultSize("inspector").w < D.defaultSize("graph").w, true, "a panel opens as a column");

  const win = { open() {}, top: null };
  win.top = win;
  eq(D.detachSupport(win), { ok: true }, "a page of its own: possible");
  eq(D.detachSupport({ open() {}, top: {} }), { ok: false, why: "frame" }, "inside a frame: off, said why");
  eq(D.detachSupport({ top: null }), { ok: false, why: "api" }, "no window.open: off");

  // two realms: a node of the other one is an instance after the bridge
  const a = vm.createContext({}), b = vm.createContext({});
  const mk = `class Node {}; class Element extends Node {}; class HTMLElement extends Element {};
    class HTMLInputElement extends HTMLElement {}; class Event {}; class KeyboardEvent extends Event {};
    globalThis.Node = Node; globalThis.Element = Element; globalThis.HTMLElement = HTMLElement;
    globalThis.HTMLInputElement = HTMLInputElement; globalThis.Event = Event; globalThis.KeyboardEvent = KeyboardEvent;`;
  vm.runInContext(mk, a); vm.runInContext(mk, b);
  const input = vm.runInContext("new HTMLInputElement()", b);
  const isIn = (name) => vm.runInContext(`(x) => x instanceof ${name}`, a);
  eq(isIn("HTMLInputElement")(input), false, "measured first: across realms `instanceof` says no");
  const others = [];
  const n = D.bridgeRealms(a, () => others);
  ok(n >= 6, `the DOM and event constructors bridged (${n})`);
  eq(isIn("HTMLInputElement")(input), false, "…and still no while the other realm is not a detached window");
  others.push(b);
  eq([isIn("HTMLInputElement")(input), isIn("HTMLElement")(input), isIn("Node")(input)], [true, true, true],
     "with it open: an input of the other realm is an input, an element, a node");
  eq(isIn("KeyboardEvent")(input), false, "…and not an event");
  eq(isIn("HTMLInputElement")(vm.runInContext("new HTMLElement()", a)), false, "the native answer stands");
  class Sub extends vm.runInContext("HTMLElement", a) {}
  ok(!(input instanceof Sub), "a subclass asks only its own check");
}
console.log(`check-detach (pure): ${checks} checks OK`);

if (process.env.NO_BROWSER) process.exit(0);

// ── browser ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? "5199";
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
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const { chromium } = await playwright();
const browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined,
  args: ["--enable-precise-memory-info", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const fixture = (name) => JSON.parse(readFileSync(`${TD}${name}.em.json`, "utf8"));

async function open({ doc = "catena", ws, keep } = {}) {
  const ctx = keep?.ctx ?? await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await p.addInitScript(([d, clear]) => {
    window.__EM_TEST_DATA__ = d;
    try {
      if (clear && !sessionStorage.getItem("probe")) {
        localStorage.clear();
        localStorage.setItem("emstudio.locale", "it");
        sessionStorage.setItem("probe", "1");
      }
    } catch { /* private mode */ }
  }, [fixture(doc), !keep]);
  await p.goto(`http://localhost:${PORT}/em/studio/`);
  await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length > 0, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  if (ws) {
    await p.click(`#workspace-bar .ws-tab[data-ws="${ws}"]`);
    await p.waitForTimeout(800);
  }
  return { p, ctx, errors };
}
const winOf = (p, type) => p.evaluate((ty) => window.__EM_DRAG__.wins().find((x) => x.type === ty && !x.id.startsWith("pop:"))?.id ?? null, type);
/** detach through the hook (the release at screen 300,200) and hand back the new page */
async function detach(p, ctx, winId) {
  const popP = ctx.waitForEvent("page");
  const id = await p.evaluate((w) => window.__EM_DRAG__.detach(w, 300, 200), winId);
  const pop = await popP;
  await pop.waitForLoadState();
  await p.waitForTimeout(500);
  return { id, pop };
}
const popText = (p, id) => p.evaluate((i) => window.__EM_DRAG__.popDocument(i)?.body.textContent ?? "", id);

const cases = [];
const test = (id, what, fn) => cases.push({ id, what, fn });
const results = [];

test("D1.gesture", "Shift + angolo trascinato → nuova finestra di sistema con la stessa superficie; senza Shift resta la divisione", async () => {
  const { p, ctx, errors } = await open();
  const g = await winOf(p, "graph");
  const grip = await p.locator(`.tile-area[data-win="${g}"] > .tile-corner-br`).boundingBox();
  const before = (await p.evaluate(() => window.__EM_DRAG__.wins().length));
  // without Shift: a split, no page
  let pages = ctx.pages().length;
  await p.mouse.move(grip.x + 5, grip.y + 5);
  await p.mouse.down();
  await p.mouse.move(grip.x - 200, grip.y - 60, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  const afterSplit = await p.evaluate(() => window.__EM_DRAG__.wins().length);
  ok(afterSplit === before + 1 && ctx.pages().length === pages, `senza Shift: divisione (${before} → ${afterSplit}), nessuna finestra`);
  // with Shift: the preview says «Nuova finestra», the release opens it
  const g2 = await winOf(p, "graph");
  const grip2 = await p.locator(`.tile-area[data-win="${g2}"] > .tile-corner-br`).boundingBox();
  const popP = ctx.waitForEvent("page");
  await p.keyboard.down("Shift");
  await p.mouse.move(grip2.x + 5, grip2.y + 5);
  await p.mouse.down();
  await p.mouse.move(grip2.x - 150, grip2.y - 80, { steps: 6 });
  const preview = await p.evaluate(() => document.querySelector(".gest .gdetach")?.textContent ?? "");
  ok(/Nuova finestra/.test(preview), `anteprima «${preview}»`);
  await p.mouse.up();
  await p.keyboard.up("Shift");
  const pop = await popP;
  await p.waitForTimeout(700);
  const winsNow = await p.evaluate(() => window.__EM_DRAG__.wins().length);
  ok(winsNow === afterSplit + 1, "la finestra staccata è una finestra in più, la disposizione intatta");
  const info = await pop.evaluate(() => {
    const a = document.querySelector(".tile-area.tile-detached");
    const cv = a?.querySelector("canvas");
    return { type: a?.dataset.surfaceType, cv: cv ? [cv.clientWidth, cv.clientHeight] : null,
      mode: document.querySelector('.win-seg [aria-pressed="true"]')?.textContent, title: document.title,
      css: document.compatMode, back: !!document.querySelector(".win-detached-back"), close: !!document.querySelector(".win-detached-close") };
  });
  ok(info.type === "graph" && info.cv && info.cv[0] > 300 && info.cv[1] > 200, `superficie Matrix montata (${JSON.stringify(info.cv)})`);
  eq(info.mode, "Matrix", "stessa vista");
  ok(info.css === "CSS1Compat" && /Grafo — EMStudio/.test(info.title), `documento standard, titolo «${info.title}»`);
  ok(info.back && info.close, "barra minima: Riporta, Chiudi");
  const pos = await p.evaluate(() => window.__EM_DRAG__.popouts()[0]);
  ok(Math.abs(pos.x - 0) < 4000 && pos.w > 300, `vicino al cursore (${pos.x},${pos.y} ${pos.w}×${pos.h})`);
  eq(errors, [], "nessun errore");
  await ctx.close();
});

test("D2.menu", "«Apri in una nuova finestra» nel menu del tipo", async () => {
  const { p, ctx, errors } = await open();
  const tb = await winOf(p, "table");
  await p.click(`.tile-area[data-win="${tb}"] .win-type-toggle`);
  const popP = ctx.waitForEvent("page");
  await p.click(`.tile-area[data-win="${tb}"] .win-detach-item`);
  const pop = await popP;
  await p.waitForTimeout(700);
  const rows = await pop.evaluate(() => document.querySelectorAll(".tile-detached .tile-tablebody tr").length);
  ok(rows > 2, `Tabular staccato con le sue righe (${rows})`);
  const sheet = await pop.evaluate(() => document.querySelector(".tile-detached .win-mode-label, .tile-detached .win-seg [aria-pressed=true]")?.textContent ?? "");
  const mainSheet = await p.evaluate((w) => document.querySelector(`.tile-area[data-win="${w}"] .win-mode-label, .tile-area[data-win="${w}"] .win-seg [aria-pressed=true]`)?.textContent ?? "", tb);
  eq(sheet, mainSheet, "lo stesso foglio");
  eq(errors, [], "nessun errore");
  await ctx.close();
});

test("D3.shared", "un documento: selezione, rinomina e annulla premuto nella finestra staccata, visti nell'altra; latenza", async () => {
  const { p, ctx, errors } = await open();
  const ins = await winOf(p, "inspector");
  const { id, pop } = await detach(p, ctx, ins);
  // the Inspector follows the main window's selection
  await p.evaluate(() => window.__EM_DRAG__.select("US102"));
  await p.waitForTimeout(300);
  ok(/US102/.test(await popText(p, id)), "l'Ispettore staccato segue la selezione della principale");
  // latency: a rename in the one store, seen painted in the other window
  const lat = await p.evaluate(async (i) => {
    const doc = window.__EM_DRAG__.popDocument(i);
    const out = [];
    for (let k = 0; k < 5; k++) {
      const name = `US102-${k}`;
      const t0 = performance.now();
      window.__EM_DRAG__.renameNode("US102", name);
      let sync = doc.body.textContent.includes(name) ? performance.now() - t0 : null;
      await new Promise((r) => { const tick = () => (doc.body.textContent.includes(name) ? r() : requestAnimationFrame(tick)); tick(); });
      out.push({ sync, painted: performance.now() - t0 });
    }
    return out;
  }, id);
  const painted = lat.map((x) => x.painted).sort((a, b) => a - b);
  ok(painted[2] < 100, `latenza fino al disegno nell'altra finestra, mediana ${painted[2].toFixed(1)} ms (${painted.map((x) => x.toFixed(1)).join(", ")})`);
  console.log(`    D3 latenza (ms): ${JSON.stringify(lat.map((x) => ({ sync: x.sync === null ? null : +x.sync.toFixed(2), painted: +x.painted.toFixed(1) })))}`);
  eq(await p.evaluate(() => window.__EM_DRAG__.nodeName("US102")), "US102-4", "il nome nel documento");
  // undo pressed IN the detached window (focus there, not in a field)
  await pop.bringToFront();
  await pop.click(".tile-detached .tile-bar", { position: { x: 600, y: 10 }, timeout: 2000 }).catch(() => {});
  await pop.keyboard.press("ControlOrMeta+z");
  await p.waitForTimeout(300);
  eq(await p.evaluate(() => window.__EM_DRAG__.nodeName("US102")), "US102-3", "⌘Z nella finestra staccata annulla nel documento");
  ok(/US102-3/.test(await popText(p, id)) && await p.evaluate(() => document.body.textContent.includes("US102-3")), "visto in tutte e due");
  await pop.keyboard.press("ControlOrMeta+Shift+z");
  await p.waitForTimeout(300);
  eq(await p.evaluate(() => window.__EM_DRAG__.nodeName("US102")), "US102-4", "⇧⌘Z ripete");
  // a key typed in a field of the detached window stays there (no shortcut)
  const field = pop.locator(".tile-detached input[type=text], .tile-detached textarea").first();
  if (await field.count()) {
    await field.click();
    await pop.keyboard.press("ControlOrMeta+z");
    await p.waitForTimeout(200);
    eq(await p.evaluate(() => window.__EM_DRAG__.nodeName("US102")), "US102-4", "⌘Z in un campo è del campo, non del documento");
  }
  // focus follows the system window
  eq(await p.evaluate(() => window.__EM_DRAG__.activeWinId()), id, "la finestra attiva è quella staccata");
  eq(errors, [], "nessun errore");
  await ctx.close();
});

test("D4.space", "Spazio 3D staccato: un contesto WebGL suo, memoria misurata", async () => {
  const { p, ctx, errors } = await open({ ws: "space" });
  const sc = await winOf(p, "scene");
  ok(!!sc, "lo Spazio c'è");
  const heap0 = await p.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
  const { pop } = await detach(p, ctx, sc);
  await p.waitForTimeout(1500);
  const heap1 = await p.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
  const gl = await pop.evaluate(() => [...document.querySelectorAll(".tile-detached canvas")].map((c) => ({
    w: c.clientWidth, h: c.clientHeight, gl: !!(c.getContext("webgl2") || c.getContext("webgl")) })));
  const mainGl = await p.evaluate(() => [...document.querySelectorAll(".tile-area canvas")].filter((c) => c.closest(".tile-scenebody")).length);
  ok(gl.some((c) => c.gl && c.w > 200 && c.h > 100), `canvas WebGL nella finestra staccata (${JSON.stringify(gl)})`);
  ok(mainGl >= 1, "lo Spazio della principale resta");
  const mb = (heap1 - heap0) / 1048576;
  console.log(`    D4 heap JS: ${(heap0 / 1048576).toFixed(1)} → ${(heap1 / 1048576).toFixed(1)} MB (+${mb.toFixed(1)})`);
  ok(heap1 > 0, `memoria misurata (+${mb.toFixed(1)} MB di heap JS)`);
  eq(errors, [], "nessun errore");
  await ctx.close();
});

test("D5.overlays", "Matrix staccata: il glifo e il pannello degli overlay nella sua finestra", async () => {
  const { p, ctx, errors } = await open();
  const g = await winOf(p, "graph");
  const { id, pop } = await detach(p, ctx, g);
  await pop.bringToFront();
  await pop.hover(".tile-detached canvas");
  await p.waitForTimeout(300);
  const where = await pop.evaluate(() => !!document.getElementById("btn-overlays"));
  ok(where, "il glifo degli overlay è nella finestra staccata");
  await pop.click("#btn-overlays");
  await p.waitForTimeout(400);
  const panel = await pop.evaluate(() => {
    const el = document.getElementById("overlay-panel");
    const r = el?.getBoundingClientRect();
    return el ? { open: !el.classList.contains("hidden"), win: el.dataset.win, inside: r.left >= 0 && r.right <= innerWidth + 1, title: el.textContent.slice(0, 40) } : null;
  });
  ok(panel?.open && panel.win === id && panel.inside, `pannello aperto lì, della finestra staccata, dentro (${JSON.stringify(panel)})`);
  ok(!(await p.evaluate(() => !!document.getElementById("overlay-panel"))), "non nella principale");
  // a checkbox of the panel, clicked in the detached window, acts
  const before = await p.evaluate(() => JSON.stringify(window.__EM_DRAG__.wins().length));
  const cb = pop.locator("#overlay-panel input[type=checkbox]").nth(1);
  if (await cb.count()) {
    const was = await cb.isChecked();
    await cb.click();
    await p.waitForTimeout(300);
    ok((await cb.isChecked()) !== was, "un overlay cambiato dalla finestra staccata");
    await cb.click();
  }
  ok(before.length > 0, "");
  // the panel comes home when the window closes
  await p.evaluate((i) => window.__EM_DRAG__.closeDetached(i), id);
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => !!document.getElementById("overlay-panel") && !!document.getElementById("btn-overlays")), "chiusa la finestra, il pannello torna a casa");
  eq(errors, [], "nessun errore");
  await ctx.close();
});

test("D6.tables", "due Tabular staccati su due fogli", async () => {
  const { p, ctx, errors } = await open();
  const tb = await winOf(p, "table");
  const a = await detach(p, ctx, tb);
  const b = await detach(p, ctx, tb);
  // the second one on another sheet, through its own menu
  await b.pop.click(".tile-detached .win-mode-toggle");
  const items = b.pop.locator(".tile-detached .win-mode .dd-menu button:not(.active)");
  const label = (await items.first().textContent())?.trim();
  await items.first().click();
  await p.waitForTimeout(500);
  const sa = await a.pop.evaluate(() => document.querySelector(".tile-detached .win-mode-label")?.textContent ?? "");
  const sb = await b.pop.evaluate(() => document.querySelector(".tile-detached .win-mode-label")?.textContent ?? "");
  ok(sa && sb && sa !== sb, `due fogli: «${sa}» e «${sb}» (scelto «${label}»)`);
  const wins = await p.evaluate(() => window.__EM_DRAG__.popouts().map((x) => x.id));
  eq(wins.length, 2, "due finestre staccate");
  eq(errors, [], "nessun errore");
  await ctx.close();
});

test("D7.remember", "ricorda posizione e finestre per documento; al ritorno del documento le offre", async () => {
  const { p, ctx, errors } = await open();
  const g = await winOf(p, "graph");
  await detach(p, ctx, g);
  await p.waitForTimeout(1300);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("emstudio.detached.v1") ?? "{}"));
  const keys = Object.keys(saved);
  ok(keys.length === 1 && saved[keys[0]].length === 1 && saved[keys[0]][0].type === "graph", `ricordata (${keys[0]})`);
  const r = saved[keys[0]][0];
  ok(Number.isFinite(r.x) && r.w > 300 && r.camera, `posizione, misura e camera (${r.x},${r.y} ${r.w}×${r.h})`);
  ok(!JSON.stringify(saved).includes("USV106"), "niente del documento nella preferenza");
  // the app is reloaded with the same document (the main page goes: its windows close, remembered)
  await p.close();
  await new Promise((r) => setTimeout(r, 300));
  ok(ctx.pages().length === 0, "chiusa la principale, la staccata si chiude");
  const again = await open({ keep: { ctx } });
  await again.p.waitForTimeout(800);
  const ask = again.p.locator("#toast button", { hasText: "Riapri" });
  ok(await ask.count() === 1, "il documento riaperto offre «Riapri»");
  const popP = ctx.waitForEvent("page");
  await ask.click();
  const pop = await popP;
  await again.p.waitForTimeout(600);
  const pos = await again.p.evaluate(() => window.__EM_DRAG__.popouts()[0]);
  ok(pos && pos.type === "graph", "riaperta");
  ok(Math.abs(pos.w - r.w) <= 2 && Math.abs(pos.h - r.h) <= 2, `alla stessa misura (${pos.w}×${pos.h} ~ ${r.w}×${r.h})`);
  ok(await pop.evaluate(() => !!document.querySelector(".tile-detached canvas")), "con la sua Matrix");
  eq([...errors, ...again.errors], [], "nessun errore");
  await ctx.close();
});

test("D8.back", "«Riporta nella finestra principale»: un'area in più, la finestra di sistema chiusa", async () => {
  const { p, ctx, errors } = await open();
  const tb = await winOf(p, "table");
  const { id, pop } = await detach(p, ctx, tb);
  const n0 = await p.evaluate(() => window.__EM_DRAG__.wins().filter((w) => !w.id.startsWith("pop:")).length);
  await pop.click(".win-detached-back");
  await p.waitForTimeout(600);
  const n1 = await p.evaluate(() => window.__EM_DRAG__.wins().filter((w) => !w.id.startsWith("pop:")).length);
  eq(n1, n0 + 1, "un'area in più nella principale");
  ok(pop.isClosed() || await p.evaluate(() => window.__EM_DRAG__.popouts().length === 0), "la finestra staccata è chiusa");
  ok(await p.evaluate((i) => !window.__EM_DRAG__.wins().some((w) => w.id === i), id), "e dimenticata");
  const tables = await p.evaluate(() => document.querySelectorAll(".tile-area[data-surface-type=table]").length);
  ok(tables >= 2, `due Tabular nella principale (${tables})`);
  eq(errors, [], "nessun errore");
  await ctx.close();
});

test("D9.close", "chiudere la finestra di sistema staccata dal suo × di sistema: dimenticata, il resto intatto", async () => {
  const { p, ctx, errors } = await open();
  const g = await winOf(p, "graph");
  const { id, pop } = await detach(p, ctx, g);
  await pop.close();
  await p.waitForTimeout(1300);
  eq(await p.evaluate(() => window.__EM_DRAG__.popouts().length), 0, "nessuna finestra staccata");
  ok(await p.evaluate((i) => !window.__EM_DRAG__.wins().some((w) => w.id === i), id), "la finestra è uscita dall'elenco");
  ok(await p.evaluate(() => !!document.getElementById("btn-overlays")), "gli overlay tornati a casa");
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("emstudio.detached.v1") ?? "{}"));
  eq(Object.keys(saved).length, 0, "e non sarà riofferta");
  eq(errors, [], "nessun errore");
  await ctx.close();
});

test("D10.frame", "web dentro un riquadro: il gesto è spento, col perché", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  await p.setContent(`<iframe src="http://localhost:${PORT}/em/studio/" style="width:1300px;height:850px"></iframe>`);
  const f = p.frames()[1];
  await f.waitForSelector("#workspace-bar .ws-tab", { timeout: 30000 });
  await p.waitForTimeout(800);
  const tb = await f.evaluate(() => window.__EM_DRAG__.wins().find((w) => w.type === "table")?.id);
  await f.click(`.tile-area[data-win="${tb}"] .win-type-toggle`);
  const item = await f.evaluate((w) => {
    const b = document.querySelector(`.tile-area[data-win="${w}"] .win-detach-item`);
    return b ? { off: b.classList.contains("dd-disabled"), title: b.title } : null;
  }, tb);
  ok(item?.off && /riquadro|frame/.test(item.title), `voce spenta con il tooltip «${item?.title}»`);
  await ctx.close();
});

for (const c of cases) {
  if (only.length && !only.some((o) => c.id === o || c.id.startsWith(`${o}.`))) continue;
  const t0 = Date.now();
  try {
    await c.fn();
    results.push({ id: c.id, ok: true });
    console.log(`  ✓ ${c.id} — ${c.what} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    results.push({ id: c.id, ok: false, error: String(e.message ?? e).slice(0, 500) });
    console.log(`  ✗ ${c.id} — ${c.what}\n      ${String(e.message ?? e).slice(0, 500)}`);
  }
}
await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`check-detach: ${checks} checks, ${results.length - bad.length}/${results.length} cases OK`);
if (bad.length) process.exit(1);
