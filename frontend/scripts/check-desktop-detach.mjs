// MICRO-OVERLAY-PER-FINESTRA p.0 · a detached window opened IN THE DESKTOP APP
// (E.D., 24 Oct 2026, EMStudio.app dev.70: «The new window was blocked» — the
// webview handed Tauri an empty url, see shell/detach.ts DETACH_URL).
//
// The browser checks (check-detach.mjs) cannot see this: the window is made by
// WKWebView's delegate and Tauri's `on_new_window`. So this drives the REAL
// webview of a test build, with real events:
//  · the build: apps/desktop/src-tauri, `tauri.test.conf.json` merged in
//    (its own identifier: not handed to an EMStudio.app that is open; the page
//    from the Vite on PORT), the bridge on BRIDGE_PORT (never 8765);
//  · the page is driven by a script the debug build runs after the load
//    (`EMSTUDIO_SELFTEST_JS`): it asks this process for commands over HTTP;
//  · the hand is apps/desktop/tests/post-events.swift (mouse and keys of the
//    system, posted only while the test app is the frontmost one);
//  · what the system lists is counted (the app's windows), and photographed.
//
//   DESKTOP_BIN=/tmp/overlay-finestra/target/debug/emstudio-desktop PORT=5199 \
//     BRIDGE_PORT=8781 SHOTS=/tmp/overlay-finestra/desktop node scripts/check-desktop-detach.mjs
//
// macOS only (the hand is macOS's). Needs the terminal allowed to post events
// (System Settings › Privacy › Accessibility).
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const PORT = process.env.PORT ?? "5199";
const BRIDGE_PORT = process.env.BRIDGE_PORT ?? "8781";
const AGENT_PORT = Number(process.env.AGENT_PORT ?? 8797);
const BIN = process.env.DESKTOP_BIN;
const SHOTS = process.env.SHOTS ?? "/tmp/overlay-finestra/desktop";
const WORK = process.env.WORK ?? "/tmp/overlay-finestra";
const TD = new URL("../testdata/", import.meta.url).pathname;
const HAND_SRC = new URL("../../apps/desktop/tests/post-events.swift", import.meta.url).pathname;
if (process.platform !== "darwin" || !BIN || !existsSync(BIN)) {
  console.log("check-desktop-detach: skipped (macOS and DESKTOP_BIN needed)");
  process.exit(0);
}
if (BRIDGE_PORT === "8765") throw new Error("never the app's port");
mkdirSync(SHOTS, { recursive: true });
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; console.log(`    ✓ ${what}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the hand ────────────────────────────────────────────────────────────────
const HAND = `${WORK}/post-events`;
if (!existsSync(HAND)) execFileSync("swiftc", ["-O", HAND_SRC, "-o", HAND]);
const hand = (...a) => execFileSync(HAND, a.map(String), { encoding: "utf8" }).trim();
let pid = 0;
const sysWindows = () => JSON.parse(hand("windows", pid));
const front = () => hand("front", pid);
// activation from another process may be refused (macOS): the press itself
// brings the app forward, and the hand refuses a press that would land elsewhere
const act = (actions) => { try { front(); } catch { /* the press will */ } return hand("run", pid, JSON.stringify(actions)); };

// ── the page's side: commands over HTTP ─────────────────────────────────────
const queue = [];
const waiting = new Map();
let seq = 0;
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/cmd") {
    const c = queue.shift();
    res.end(JSON.stringify(c ?? {}));
  } else if (req.url === "/res") {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const r = JSON.parse(b);
      waiting.get(r.id)?.(r);
      waiting.delete(r.id);
      res.end("{}");
    });
  } else if (req.url.startsWith("/fixture/")) {
    res.end(readFileSync(`${TD}${req.url.slice(9)}.em.json`));
  } else res.end("{}");
});
await new Promise((r) => server.listen(AGENT_PORT, "127.0.0.1", r));
/** run `js` (an async function body) in the main page, its return value back */
function page(js, timeout = 15000) {
  const id = ++seq;
  queue.push({ id, js });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { waiting.delete(id); reject(new Error(`page: no answer (${js.slice(0, 60)})`)); }, timeout);
    waiting.set(id, (r) => { clearTimeout(t); r.ok ? resolve(r.value) : reject(new Error(r.value)); });
  });
}
const AGENT = `(() => {
  if (window.__EMSELF__) return; window.__EMSELF__ = 1;
  const base = "http://127.0.0.1:${AGENT_PORT}";
  // every window.open, and what it gave (the bug: null)
  const open0 = window.open;
  window.__opens = [];
  // __asBefore: the url of dev.70 (""), to see the cause in this webview
  window.open = function (...a) {
    if (window.__asBefore && a[0] === "about:blank") a[0] = "";
    const r = open0.apply(this, a);
    window.__opens.push({ url: String(a[0]), got: !!r, t: Math.round(performance.now()) });
    return r;
  };
  // where an element's centre (or a fraction of it) is in ITS window, and
  // which window: WKWebView's screenX/screenY/outerHeight are not the
  // window's (measured: 0, 1117, 0), so the screen point is made outside,
  // from the system's list of windows (\`pt\`)
  window.__scr = (el, fx = 0.5, fy = 0.5) => {
    if (!el) return null;
    const w = el.ownerDocument.defaultView;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { cx: r.x + r.width * fx, cy: r.y + r.height * fy, title: el.ownerDocument.title, iw: w.innerWidth, ih: w.innerHeight };
  };
  const loop = async () => {
    for (;;) {
      try {
        const c = await (await fetch(base + "/cmd", { cache: "no-store" })).json();
        if (c && c.id) {
          let out;
          try { out = { id: c.id, ok: true, value: await (0, eval)("(async () => {" + c.js + "\\n})()") }; }
          catch (e) { out = { id: c.id, ok: false, value: String((e && e.stack) || e) }; }
          await fetch(base + "/res", { method: "POST", body: JSON.stringify(out) });
          continue;
        }
      } catch { /* not yet */ }
      await new Promise((r) => setTimeout(r, 120));
    }
  };
  loop();
})();`;
writeFileSync(`${WORK}/selftest.js`, AGENT);

// ── the app ─────────────────────────────────────────────────────────────────
const app = spawn(BIN, [], {
  env: { ...process.env, EMSTUDIO_SELFTEST_JS: `${WORK}/selftest.js`, EMSTUDIO_BRIDGE_PORT: BRIDGE_PORT, EMSTUDIO_NO_KEYCHAIN: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
pid = app.pid;
let log = "";
app.stdout.on("data", (d) => (log += d));
app.stderr.on("data", (d) => (log += d));
/** the screen point of a \`__scr\` answer: its system window (by title, then
 *  by size), the content under the title bar */
function pt(e) {
  if (!e) return null;
  const ws = sysWindows();
  const cands = ws.filter((w) => w.name === e.title);
  const pool = cands.length ? cands : ws;
  const w = pool.sort((a, b) => Math.abs(a.w - e.iw) + Math.abs(a.h - e.ih) - Math.abs(b.w - e.iw) - Math.abs(b.h - e.ih))[0];
  return { x: Math.round(w.x + e.cx), y: Math.round(w.y + (w.h - e.ih) + e.cy) };
}
const results = [];
const shot = (name) => {
  const ws = sysWindows();
  const files = [];
  for (const [i, w] of ws.entries()) {
    const f = `${SHOTS}/${name}-${i}.png`;
    try { execFileSync("screencapture", ["-x", "-o", `-l${w.id}`, f]); files.push(f); } catch { /* no permission */ }
  }
  return files;
};
async function step(id, what, fn) {
  try {
    await fn();
    results.push({ id, ok: true });
    console.log(`  ✓ ${id} — ${what}`);
  } catch (e) {
    results.push({ id, ok: false, error: String(e.message ?? e).slice(0, 400) });
    console.log(`  ✗ ${id} — ${what}\n      ${String(e.message ?? e).slice(0, 400)}`);
    shot(`fail-${id}`);
  }
}
const popCount = () => page("return window.__EM_DRAG__.popouts().filter((p) => !p.closed).length");
const waitFor = async (js, ms = 8000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await page(js).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) return v;
    await sleep(200);
  }
};
let fresh = false;
const loadDoc = async () => {
  ok(await waitFor("return !!window.__EM_DRAG__", 60000), "la pagina dell'app di prova risponde");
  if (!fresh) {
    // the test app's storage is its own (its identifier), but it outlives a
    // run: the first load starts from nothing
    fresh = true;
    await page(`localStorage.clear(); localStorage.setItem("emstudio.locale", "it"); setTimeout(() => location.reload(), 50); return true`);
    await sleep(2500);
    ok(await waitFor("return !!window.__EM_DRAG__ && !localStorage.getItem('emstudio.detached.v1')", 60000), "ripartita da vuota");
  }
  await page(`const d = await (await fetch("http://127.0.0.1:${AGENT_PORT}/fixture/catena")).json();
    window.__EM_DRAG__.openAt(d, "${WORK}/catena.em.json"); return true;`);
  ok(await waitFor("return (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 0", 20000), "documento aperto (catena)");
  await sleep(800);
  // the first press on a window of an app in the background only brings it
  // forward (macOS): one on the main window's title bar, before the gestures
  await activateMain();
};
/** the screen point of an element of the n-th detached window: its system
 *  window found by a title given for the moment (two «Grafo — EMStudio» are
 *  told apart so), then the title back */
async function popPt(n, sel) {
  const tag = `probe-${n}-${Date.now() % 100000}`;
  const was = await page(`const p = window.__EM_DRAG__.popouts().filter((x) => !x.closed)[${n}]; const d = window.__EM_DRAG__.popDocument(p.id); const w = d.title; d.title = "${tag}"; return w`);
  await sleep(500);
  const e = await page(`const p = window.__EM_DRAG__.popouts().filter((x) => !x.closed)[${n}]; return window.__scr(window.__EM_DRAG__.popDocument(p.id)?.querySelector(${JSON.stringify(sel)}), 0.5, 0.5)`);
  const at = pt(e && { ...e, title: tag });
  if (process.env.DEBUG_PT) console.log("    popPt", tag, JSON.stringify(e), JSON.stringify(sysWindows()), JSON.stringify(at));
  // the first press on a window that is not the key one only makes it key
  const w = sysWindows().find((x) => x.name === tag);
  if (w) { act([{ t: "click", x: w.x + w.w / 2, y: w.y + 12 }]); await sleep(400); }
  await page(`const p = window.__EM_DRAG__.popouts().filter((x) => !x.closed)[${n}]; window.__EM_DRAG__.popDocument(p.id).title = ${JSON.stringify(was)}; return true`);
  return at;
}
/** a press on the main window's title bar: it is the key window again */
async function activateMain() {
  const title = await page("return document.title");
  const ws = sysWindows();
  const mw = ws.find((w) => w.name === title) ?? ws.sort((a, b) => b.w * b.h - a.w * a.h)[0];
  act([{ t: "click", x: mw.x + mw.w / 2, y: mw.y + 12 }]);
  await sleep(500);
}
/** Shift + the bottom-right corner of a window's area dragged up-left, released */
const shiftCorner = async (winId) => {
  await activateMain();
  const g = pt(await page(`return window.__scr(document.querySelector('.tile-area[data-win="${winId}"] > .tile-corner-br'))`));
  ok(!!g, `angolo dell'area ${winId} a ${g?.x},${g?.y}`);
  act([{ t: "move", x: g.x, y: g.y }, { t: "sleep", ms: 120 }, { t: "down", x: g.x, y: g.y, shift: true },
       { t: "drag", x: g.x - 160, y: g.y - 90, shift: true }, { t: "sleep", ms: 200 },
       { t: "up", x: g.x - 160, y: g.y - 90, shift: true }]);
  await sleep(1200);
};
const winOf = (type) => page(`return window.__EM_DRAG__.wins().find((w) => w.type === "${type}" && !w.id.startsWith("pop:"))?.id ?? null`);

try {
  const t0 = Date.now();
  for (;;) {
    if (sysWindows().length) break;
    if (Date.now() - t0 > 60000) throw new Error("the test app showed no window");
    await sleep(500);
  }
  await step("A0.load", "l'app di prova si apre, con il suo identificatore e la sua porta", loadDoc);

  await step("A1.before", "la causa, vista in questa webview: con l'url di dev.70 (\"\") la finestra non nasce", async () => {
    const ins = await winOf("inspector");
    await page("window.__asBefore = true; window.__opens.length = 0; return true");
    const tg = pt(await page(`return window.__scr(document.querySelector('.tile-area[data-win="${ins}"] .win-type-toggle'))`));
    act([{ t: "click", x: tg.x, y: tg.y }]);
    await sleep(500);
    const it = pt(await page(`return window.__scr(document.querySelector('.tile-area[data-win="${ins}"] .win-detach-item'))`));
    act([{ t: "click", x: it.x, y: it.y }]);
    await sleep(1200);
    const opens = await page("return window.__opens");
    console.log(`    window.open: ${JSON.stringify(opens)}`);
    ok(opens.length === 1 && opens[0].url === "" && !opens[0].got, "window.open(\"\") dentro il gesto → null");
    const toast = await page(`return document.getElementById("toast")?.textContent ?? ""`);
    ok(/bloccat|blocked/i.test(toast), `il toast di E.D. («${toast.slice(0, 70)}»)`);
    ok(sysWindows().length === 1, "nessuna finestra di sistema in più");
    await page(`window.__asBefore = false; window.__opens.length = 0; const t = document.getElementById("toast"); if (t) t.textContent = ""; return true`);
  });

  await step("A1.menu", "«Apri in una nuova finestra» dal menu del tipo (Ispettore): una finestra di sistema", async () => {
    const ins = await winOf("inspector");
    const n0 = sysWindows().length;
    const tg = pt(await page(`return window.__scr(document.querySelector('.tile-area[data-win="${ins}"] .win-type-toggle'))`));
    act([{ t: "click", x: tg.x, y: tg.y }]);
    await sleep(500);
    const it = pt(await page(`return window.__scr(document.querySelector('.tile-area[data-win="${ins}"] .win-detach-item'))`));
    ok(!!it, "la voce c'è");
    act([{ t: "click", x: it.x, y: it.y }]);
    await sleep(1500);
    const toast = await page(`return document.getElementById("toast")?.textContent ?? ""`);
    console.log(`    window.open: ${JSON.stringify(await page("return window.__opens"))}`);
    ok(!/blocc|blocked/i.test(toast), `nessun toast «bloccata» («${toast.slice(0, 80)}»)`);
    ok(await popCount() === 1, "la pagina ha la sua finestra staccata");
    const ws = sysWindows();
    ok(ws.length === n0 + 1, `il sistema ne conta una in più (${n0} → ${ws.length})`);
    const mw = ws.find((w) => !/Ispettore|Inspector/.test(w.name)) ?? ws[0];
    const iw = ws.find((w) => /Ispettore|Inspector/.test(w.name));
    ok(!!iw && iw.y < mw.y + mw.h && iw.y >= mw.y, `vicino alla principale, sullo schermo (${iw?.x},${iw?.y}; principale ${mw.x},${mw.y})`);
    ok(await page(`const p = window.__EM_DRAG__.popouts()[0]; return /US|Ispettore|Inspector/.test(window.__EM_DRAG__.popDocument(p.id)?.body.textContent ?? "")`), "con il contenuto dell'Ispettore");
    console.log(`    foto: ${shot("A1-menu-inspector").join(", ")}`);
  });

  await step("A2.matrix", "Shift + angolo sulla Matrix: una finestra di sistema con la Matrix", async () => {
    const g = await winOf("graph");
    const n0 = await popCount();
    await shiftCorner(g);
    ok(await popCount() === n0 + 1, "una staccata in più");
    ok(await page(`const p = window.__EM_DRAG__.popouts().at(-1); return p.type === "graph" && !!window.__EM_DRAG__.popDocument(p.id)?.querySelector(".tile-detached canvas")`), "la Matrix disegnata lì");
    console.log(`    foto: ${shot("A2-shift-matrix").join(", ")}`);
  });

  await step("A3.undo", "⌘Z premuto nella Matrix staccata annulla nell'unico documento", async () => {
    await page(`window.__EM_DRAG__.renameNode("US102", "US102-desk"); return true`);
    await sleep(400);
    const n = (await popCount()) - 1;
    const bar = await popPt(n, ".tile-detached .tile-bar .win-mode-label, .tile-detached .tile-bar");
    act([{ t: "click", x: bar.x, y: bar.y }, { t: "sleep", ms: 300 }, { t: "key", code: 6, cmd: true }]);
    await sleep(700);
    const name = await page(`return window.__EM_DRAG__.nodeName("US102")`);
    ok(name === "US102", `il nome torna (${name})`);
  });

  await step("A4.space", "Shift + angolo sullo Spazio: una finestra di sistema con il suo WebGL", async () => {
    await activateMain();
    const tab = pt(await page(`return window.__scr(document.querySelector('#workspace-bar .ws-tab[data-ws="space"]'))`));
    act([{ t: "click", x: tab.x, y: tab.y }]);
    await sleep(1500);
    const sc = await winOf("scene");
    ok(!!sc, "lo Spazio c'è");
    const n0 = await popCount();
    await shiftCorner(sc);
    // the Space's first press may be taken by its canvas waking up: once more, said
    if (await popCount() === n0) { console.log("    (secondo tentativo)"); await shiftCorner(sc); }
    ok(await popCount() === n0 + 1, "una staccata in più");
    await sleep(1500);
    ok(await page(`const p = window.__EM_DRAG__.popouts().at(-1); const c = window.__EM_DRAG__.popDocument(p.id)?.querySelector(".tile-detached canvas"); return p.type === "scene" && !!c && c.clientWidth > 200`), "il canvas 3D nella staccata");
    console.log(`    foto: ${shot("A4-shift-space").join(", ")}`);
  });

  await step("A5.reopen", "la principale ricaricata chiude le staccate; riaperto il documento, «Riapri» le rimette", async () => {
    const n = await popCount();
    await sleep(1300);                  // remembered once a second
    await page(`setTimeout(() => location.reload(), 50); return true`).catch(() => {});
    await sleep(3000);
    const ws = sysWindows();
    ok(ws.length === 1, `chiusa la pagina, restano ${ws.length} finestre di sistema`);
    await loadDoc();
    const btn = pt(await waitFor(`return window.__scr([...document.querySelectorAll("#toast button")].find((b) => /Riapri|Reopen/.test(b.textContent)))`, 6000));
    ok(!!btn, "il documento riaperto offre «Riapri»");
    act([{ t: "click", x: btn.x, y: btn.y }]);
    await sleep(2500);
    ok(await popCount() === n, `riaperte ${n}`);
    ok(sysWindows().length === n + 1, "e il sistema le vede");
    // where they were (the record is the system's frame, not WKWebView's screenX)
    const onScreen = sysWindows().every((w) => w.y + 40 < 1117 && w.x + 40 < 1728 && w.y >= 0);
    ok(onScreen, `tutte sullo schermo (${JSON.stringify(sysWindows().map((w) => [w.x, w.y]))})`);
    console.log(`    foto: ${shot("A5-reopened").join(", ")}`);
  });

  await step("A6.close", "il × di una staccata la chiude", async () => {
    const n = await popCount();
    await page(`const p = window.__EM_DRAG__.popouts().filter((x) => !x.closed)[0]; const d = window.__EM_DRAG__.popDocument(p.id); window.__pp = []; d.addEventListener("pointerdown", (e) => window.__pp.push([e.clientX, e.clientY, String(e.target.className).slice(0, 30)]), true); return true`);
    const x = await popPt(0, ".win-detached-close");
    act([{ t: "click", x: x.x, y: x.y }]);
    await sleep(1200);
    console.log(`    pressioni nella staccata: ${JSON.stringify(await page("return window.__pp"))} (× a ${x.x},${x.y})`);
    ok(await popCount() === n - 1, "una in meno");
    ok(sysWindows().length === n, `e il sistema la toglie (${sysWindows().length} finestre)`);
  });
} finally {
  try { app.kill("SIGTERM"); } catch { /* gone */ }
  await sleep(1500);
  try { app.kill("SIGKILL"); } catch { /* gone */ }
  server.close();
  writeFileSync(`${SHOTS}/app.log`, log);
}
const bad = results.filter((r) => !r.ok);
console.log(`check-desktop-detach: ${checks} checks, ${results.length - bad.length}/${results.length} steps OK`);
process.exit(bad.length ? 1 : 0);
