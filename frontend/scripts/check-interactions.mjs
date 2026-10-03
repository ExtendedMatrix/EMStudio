// NIGHT-AUDIT · «ogni pannello fa quello che promette» — the interactions,
// measured with a real browser (8 ott 2026).
//
//   node scripts/check-interactions.mjs            # every case
//   node scripts/check-interactions.mjs A1 A3      # some cases
//   node scripts/check-interactions.mjs --json out.json
//
// ONE CASE PER DEFECT of the audit (`.claude/wip/reports/2026-09-29-audit-
// interazioni/findings.md`: A1–A9) and one per promise of the night's parts. The
// rule of the night is «misura, non dedurre»: every case was written against the
// code BEFORE its repair and seen failing (the first run is in the night's
// report), then the repair made it pass.
//
// It needs what a person needs: the dev server (`npm run dev -- --port 5199`)
// and a bridge (`tools/em_bridge.py --port 8768 --fs-root <dir>`). The fs-root
// must hold the two folders `vuota/` (a photo, no stamp) and `modelli/` (a
// photo and a model), which `prepareFolders()` stamps as it needs. Chromium is
// Playwright's headless shell; `playwright-core` is resolved from this package
// or from `PLAYWRIGHT_CORE` (the night's report keeps one).
//
// The fixtures are the ones of the other checks (`testdata/`): catena,
// TempluMare, epochs48, PortaMarina-lite — plus `chronology-overlaps.em.json`
// (one epoch inside another, one that overhangs its neighbour by 20 years).
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const TD = new URL("../testdata/", import.meta.url).pathname;
const PORT = process.env.PORT ?? "5199";
const BRIDGE = process.env.BRIDGE ?? "http://localhost:8768";
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const FS_ROOT = process.env.FS_ROOT ?? null; // the bridge's fs-root, to reset the folders

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

const args = process.argv.slice(2);
const jsonAt = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");

const fixture = (name) => JSON.parse(readFileSync(`${TD}${name}.em.json`, "utf8"));

const { chromium } = await playwright();
const browser = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined });

/** A fresh page on a fixture, in a language, with an optional workspace. */
async function open({ doc = "catena", locale = "it", w = 1600, h = 1000, ws, init, hook, query = "", route, wsRoute } = {}) {
  const d = doc ? (typeof doc === "string" ? fixture(doc) : doc) : null;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
  // RISORSA-FILE · a simulated store, answered before the network
  if (route) await ctx.route(route.pattern, route.handler);
  // Y1 · a fake host on a WebSocket: registered BEFORE the page loads, or the
  // page's sockets are not routed
  if (wsRoute) await ctx.routeWebSocket(wsRoute.pattern, wsRoute.handler);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await p.addInitScript(([d, loc, extra]) => {
    if (d) window.__EM_TEST_DATA__ = d;
    try {
      if (!sessionStorage.getItem("probe")) {
        localStorage.clear();
        localStorage.setItem("emstudio.locale", loc);
        if (extra) for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
        sessionStorage.setItem("probe", "1");
      }
    } catch { /* private mode */ }
  }, [d, locale, init ?? null]);
  if (hook) await p.addInitScript(hook);
  await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(BRIDGE)}${query}`);
  if (d) await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length > 0, null, { timeout: 30000 });
  else await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 30000 });
  await p.waitForTimeout(500);
  if (ws) await workspace(p, ws);
  return { p, ctx, errors };
}
const workspace = async (p, ws) => {
  await p.click(`#workspace-bar .ws-tab[data-ws="${ws}"]`);
  await p.waitForTimeout(700);
};
/** the Narrativa space, with its story: since A8 the story is made at the
 *  first gesture («Proponi i capitoli»), not by opening the window */
const narrativeSpace = async (p) => {
  await workspace(p, "narrative");
  const go = p.locator('[data-action="scaffold"]').first();
  if (await go.count()) { await go.click(); await p.waitForTimeout(600); }
};
const pick = async (p, id) => {
  await p.evaluate((i) => window.__EM_DRAG__.select(i), id);
  await p.waitForTimeout(350);
};
const activeDesc = (p) => p.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return "body";
  return `${a.tagName.toLowerCase()}${a.className && typeof a.className === "string" ? "." + a.className.trim().split(/\s+/).join(".") : ""}${a.dataset?.field ? `[${a.dataset.field}]` : ""}`;
});
/** the page rectangle of the first window of a type */
const winOf = (p, type) => p.evaluate((ty) => {
  const w = window.__EM_DRAG__.wins().find((x) => x.type === ty);
  return w ? w.id : null;
}, type);

// ── the folders the stamp cases need ────────────────────────────────────────
async function bridgeJson(path, body) {
  // the /fs routes want the editor's Origin, as they would from the page
  const headers = { origin: `http://localhost:${PORT}` };
  const r = await fetch(`${BRIDGE}${path}`, body ? {
    method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body),
  } : { headers });
  return r.json();
}
async function rootPath() {
  const l = await bridgeJson("/fs/list");
  return l.entries?.[0]?.path ?? null;
}

// ── the cases ───────────────────────────────────────────────────────────────
const results = [];
const cases = [];
const test = (id, what, fn) => cases.push({ id, what, fn });

/** Enter a folder of the Storage window by double-clicking its rows. */
async function storageInto(p, names) {
  for (const n of names) {
    const row = p.locator(".storage-row", { has: p.locator(".storage-name", { hasText: new RegExp(`^${n}$`) }) }).first();
    await row.waitFor({ timeout: 8000 });
    await row.click();          // AUDIT N10 · one click opens a folder
    await p.waitForTimeout(600);
  }
}
async function storageClick(p, name) {
  const row = p.locator(".storage-row", { has: p.locator(".storage-name", { hasText: new RegExp(`^${name}$`) }) }).first();
  await row.waitFor({ timeout: 8000 });
  await row.click();
  await p.waitForTimeout(700);
}
async function openStampFor(p, folder, file) {
  await workspace(p, "assets");
  const root = await rootPath();
  const rootName = root.split("/").pop();
  await storageInto(p, [rootName, folder]);
  await storageClick(p, file);
  await p.click("button[data-action=compose-one]");
  await p.waitForSelector(".stamp-compose", { timeout: 8000 });
  await p.waitForTimeout(400);
}

// A1 · Storage ▸ EM Stamp: writing «Volo» leaves «Volo» and the focus in the field
test("A1", "timbro: «Volo» resta «Volo» e il focus nel campo", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await openStampFor(p, "vuota", "foto1.jpg");
  // the field that rebuilt the form per key: Operatore (present in both cases)
  const f = p.locator('.stamp-compose input[data-field="operator"]').first();
  await f.click();
  await p.keyboard.type("Volo", { delay: 60 });
  await p.waitForTimeout(500);
  const value = await p.locator('.stamp-compose input[data-field="operator"]').first().inputValue();
  const focus = await activeDesc(p);
  const loading = await p.evaluate(() => document.body.innerText.includes("Loading") || document.body.innerText.includes("Carico"));
  await ctx.close();
  return { pass: value === "Volo" && focus.includes("[operator]"), detail: { value, focus, loading } };
});

// A2 · Inspector: name → Tab → the focus is in the description
test("A2", "ispettore: nome → Tab → il focus è nella descrizione", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await pick(p, "USM101");
  await p.click(".insp-name-input");
  await p.keyboard.press("End");
  await p.keyboard.type("x");
  await p.keyboard.press("Tab");
  await p.waitForTimeout(500);
  const focus = await activeDesc(p);
  const name = await p.evaluate(() => window.__EM_DRAG__.nodeInfo("USM101").name);
  await ctx.close();
  return { pass: focus.includes("insp-desc-input") && name === "USM101x", detail: { focus, name } };
});

// A3 · Backspace on a focused button does not delete the node
test("A3", "Backspace su un pulsante con il focus non cancella il nodo", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await pick(p, "USM101");
  const before = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  // a button of the window chrome, focused as a keyboard user would reach it
  await p.evaluate(() => {
    const b = [...document.querySelectorAll(".tile-area button")].find((x) => x.offsetParent);
    b.focus();
  });
  await p.keyboard.press("Backspace");
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  await ctx.close();
  return { pass: before === after, detail: { before, after } };
});

// A4 · Mapping editor: the picker filter takes a whole word
test("A4", "mapping editor: nel filtro si scrive una parola intera", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  // MICRO-UN-POSTO · the editor is reached from its one door
  await p.evaluate(() => document.getElementById("btn-import-mapping").click());
  await p.waitForSelector(".me-panel", { timeout: 8000 });
  // «Sfoglia…»: the picker, whose filter is the field
  await p.locator(".me-panel button", { hasText: /Sfoglia|Browse|Durchsuchen/ }).first().click();
  await p.waitForSelector(".me-filter", { timeout: 8000 });
  await p.click(".me-filter");
  await p.keyboard.type("scavo", { delay: 60 });
  await p.waitForTimeout(400);
  const value = await p.locator(".me-filter").first().inputValue();
  const focus = await activeDesc(p);
  await ctx.close();
  return { pass: value === "scavo" && focus.includes("me-filter"), detail: { value, focus } };
});

// A5 · two graph windows: a click in the Graph-mode window selects ITS node
test("A5", "due finestre grafo: il clic nella finestra Graph seleziona il suo nodo", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await workspace(p, "provenance");
  const win = await winOf(p, "graph");
  const ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  // a unit visible inside the window
  const box = ws.boxes.find((b) => b.id === "USM101" && b.x > ws.rect.x && b.y > ws.rect.y
    && b.x + b.w < ws.rect.x + ws.rect.w && b.y + b.h < ws.rect.y + ws.rect.h)
    ?? ws.boxes.find((b) => b.x > ws.rect.x + 5 && b.y > ws.rect.y + 5
      && b.x + b.w < ws.rect.x + ws.rect.w - 5 && b.y + b.h < ws.rect.y + ws.rect.h - 5 && b.w > 20);
  await p.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
  await p.waitForTimeout(150);
  await p.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await p.waitForTimeout(400);
  const sel = await p.evaluate(() => window.__EM_DRAG__.selected());
  await ctx.close();
  return { pass: sel.length === 1 && sel[0] === box.id, detail: { mode: ws.mode, aimed: box.id, selected: sel } };
});

/** catena as a PROJECT with a documentation corpus (a flight and its photo) */
function catenaWithCorpus() {
  const c = fixture("catena");
  return {
    header: c.header, layout: c.layout, active_graph_id: c.graph.graph_id,
    graphs: {
      [c.graph.graph_id]: c.graph,
      dtc: { graph_id: "dtc", name: "Documentation (DTC)", data: { em_collection: "DTCCorpus" },
        nodes: [
          { id: "acq_a", name: "Volo marzo", node_type: "dtc_acquisition", description: "", data: { dtc_kind: "local_import" } },
          { id: "img1", name: "IMG_1.jpg", node_type: "resource", description: "", data: { residency: "resident" } },
        ],
        edges: [{ id: "o1", source: "acq_a", target: "img1", edge_type: "dtc_had_output" }] },
    },
  };
}

// A5b · the DTC window writes to the corpus
test("A5b", "finestra DTC: un nodo creato lì va nel corpus", async () => {
  const { p, ctx } = await open({ doc: catenaWithCorpus() });
  await workspace(p, "assets");
  const win = await winOf(p, "graph");
  const ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  await p.mouse.move(ws.rect.x + ws.rect.w / 2, ws.rect.y + ws.rect.h / 2);
  await p.waitForTimeout(250);
  const target = await p.evaluate(() => window.__EM_DOCS__().writeTarget);
  await ctx.close();
  return { pass: ws.mode === "dtc" && target === "corpus", detail: { mode: ws.mode, writeTarget: target } };
});

// A6 · a change from elsewhere does not wipe text not yet committed
test("A6", "un cambio da un'altra parte non cancella il testo non confermato", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await pick(p, "USM101");
  await p.click(".insp-desc-input");
  await p.keyboard.press("End");
  await p.keyboard.type(" appunto");
  // a peer renames ANOTHER node
  await p.evaluate(() => {
    const other = window.__EM_DRAG__.idsOfType("US")[0] ?? window.__EM_DRAG__.idsOfType("USM").find((i) => i !== "USM101");
    window.__EM_DRAG__.edit(other, { name: "rinominato-altrove" });
  });
  await p.waitForTimeout(500);
  const value = await p.locator(".insp-desc-input").first().inputValue().catch(() => "");
  const focus = await activeDesc(p);
  await ctx.close();
  return { pass: value.endsWith(" appunto") && focus.includes("insp-desc-input"), detail: { tail: value.slice(-20), focus } };
});

// A7 · writing in the placeholder paragraph does not mix into the placeholder
test("A7", "narrativa: scrivere nel paragrafo «da scrivere» non lo mescola", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await narrativeSpace(p);
  const para = p.locator(".nv-prose-edit").first();
  await para.waitFor({ timeout: 8000 });
  const before = await para.innerText();
  await para.click();
  await p.keyboard.type("Prova di scrittura");
  await p.waitForTimeout(200);
  const text = (await para.innerText()).trim();
  await ctx.close();
  return { pass: text === "Prova di scrittura", detail: { before: before.slice(0, 40), text: text.slice(0, 60) } };
});

// A8 · opening the Narrative space writes nothing
test("A8", "aprire lo spazio Narrativa non scrive nulla nel documento", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const state = () => p.evaluate(() => ({ n: window.__EM_DRAG__.nodeCount(), graph: window.__EM_DRAG__.graphJson().length }));
  const before = await state();
  await workspace(p, "narrative");
  await p.waitForTimeout(500);
  const after = await state();
  await ctx.close();
  return { pass: before.n === after.n && before.graph === after.graph, detail: { before, after } };
});

// A9 · a file dropped on a chapter does not reach the window loader
test("A9", "un file lasciato su un capitolo non arriva al caricatore globale", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await narrativeSpace(p);
  await p.waitForSelector(".nv-chapter, section", { timeout: 8000 });
  const reached = await p.evaluate(() => {
    let hit = false;
    window.addEventListener("drop", () => { hit = true; });
    const sec = document.querySelector(".nv-chapter") ?? document.querySelector(".nv-paper section");
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "foto.jpg", { type: "image/jpeg" }));
    sec.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    sec.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    return hit;
  });
  await p.waitForTimeout(300);
  // the chapter's own hook opens the new-document form: close it
  await p.keyboard.press("Escape");
  await ctx.close();
  return { pass: !reached, detail: { windowLoaderReached: reached } };
});

// ── PARTE 1 · il focus è sacro ──────────────────────────────────────────────
test("1.doc", "Doc: nome → Tab → il focus è nel titolo, vivo", async () => {
  const { p, ctx } = await open({ doc: "catena", ws: "provenance" });
  const first = p.locator(".doc-input").first();
  await first.waitFor({ timeout: 8000 });
  await first.click();
  await p.keyboard.press("End");
  await p.keyboard.type("z");
  await p.keyboard.press("Tab");
  await p.waitForTimeout(500);
  await p.keyboard.type("T");
  await p.waitForTimeout(300);
  const focus = await activeDesc(p);
  const second = await p.locator(".doc-input").nth(1).inputValue();
  await ctx.close();
  return { pass: focus.includes("doc-input") && second.endsWith("T"), detail: { focus, second } };
});
test("1.flush", "un cambio ridisegna una volta: tela e ispettore non due volte", async () => {
  const { p, ctx } = await open({ doc: "catena", init: { "em.perf": "1" } });
  await pick(p, "USM101");
  await p.evaluate(() => window.__EM_PERF__.reset());
  await p.evaluate(() => window.__EM_DRAG__.edit("US102", { description: "cambiato" }));
  await p.waitForTimeout(400);
  const counts = await p.evaluate(() => ({ ...window.__EM_PERF__.counts }));
  await ctx.close();
  const draws = counts.draw ?? 0;
  const insp = counts.inspector ?? 0;
  return { pass: draws <= 1 && insp <= 1 && (counts.onChange ?? 0) >= 1, detail: counts };
});
test("1.colour", "il colore scrive allo change, non a ogni input", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await pick(p, "EP_MED");
  const sw = p.locator('.tile-area input[type="color"]').first();
  const had = await sw.count();
  if (!had) { await ctx.close(); return { pass: false, detail: { swatch: 0 } }; }
  const before = await p.evaluate(() => window.__EM_DRAG__.canUndo());
  const writes = await p.evaluate(() => {
    const sw = document.querySelector('.tile-area input[type="color"]');
    const before = JSON.stringify(window.__EM_DRAG__.data("EP_MED"));
    for (const c of ["#112233", "#223344", "#334455"]) { sw.value = c; sw.dispatchEvent(new Event("input", { bubbles: true })); }
    const mid = JSON.stringify(window.__EM_DRAG__.data("EP_MED"));
    sw.dispatchEvent(new Event("change", { bubbles: true }));
    const after = JSON.stringify(window.__EM_DRAG__.data("EP_MED"));
    return { unchangedWhileDragging: before === mid, written: after.includes("#334455") };
  });
  await ctx.close();
  return { pass: writes.unchangedWhileDragging && writes.written, detail: { ...writes, before } };
});

// ── PARTE 2 · le scorciatoie hanno un ambito ────────────────────────────────
test("2.canvas", "tela + Backspace: il nodo se ne va, il toast dice chi, Annulla lo riporta", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await pick(p, "USM101");
  await p.evaluate(() => document.activeElement?.blur?.());
  const before = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  await p.keyboard.press("Backspace");
  await p.waitForTimeout(400);
  const gone = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  const toastText = await p.evaluate(() => document.getElementById("toast")?.innerText ?? "");
  await p.click("#toast .toast-action");
  await p.waitForTimeout(400);
  const back = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  await ctx.close();
  return { pass: gone < before && back === before && /USM101/.test(toastText) && /Annulla/.test(toastText),
           detail: { before, gone, back, toastText } };
});
test("2.space", "Spazio su un pulsante lo attiva (non fa il pan)", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const before = await p.evaluate(() => !document.getElementById("log-drawer")?.classList.contains("hidden"));
  await p.focus("#footer-log");
  await p.keyboard.press("Space");
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => !document.getElementById("log-drawer")?.classList.contains("hidden"));
  const panning = await p.evaluate(() => !!document.querySelector("canvas.space-pan"));
  await ctx.close();
  return { pass: before !== after && !panning, detail: { before, after, panning } };
});
test("2.select", "Backspace in una select dell'ispettore non cancella il nodo", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  // a document: its Inspector dates it with an epoch SELECT
  await pick(p, await p.evaluate(() => window.__EM_DRAG__.idsOfType("document")[0]));
  const before = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  const had = await p.evaluate(() => { const s = [...document.querySelectorAll(".tile-area select")].find((x) => x.offsetParent); if (!s) return false; s.focus(); return true; });
  await p.keyboard.press("Backspace");
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  await ctx.close();
  return { pass: had && before === after, detail: { had, before, after } };
});

// ── PARTE 3 · ogni finestra grafo ha la sua vista ───────────────────────────
test("3.dtcclick", "Stratigrafia (Matrix) e poi Contenuti (DTC): il clic su un nodo del DTC lo seleziona", async () => {
  const { p, ctx } = await open({ doc: catenaWithCorpus() });
  await workspace(p, "assets");
  const win = await winOf(p, "graph");
  let ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  await p.mouse.move(ws.rect.x + 20, ws.rect.y + 20);
  await p.waitForTimeout(200);
  ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const box = ws.boxes.find((b) => b.id === "acq_a");
  await p.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await p.waitForTimeout(400);
  const sel = await p.evaluate(() => window.__EM_DRAG__.selected());
  await ctx.close();
  return { pass: sel[0] === "acq_a", detail: { mode: ws.mode, selected: sel } };
});
test("3.edgemenu", "il menu d'arco in una finestra in basso si apre accanto al puntatore", async () => {
  const { p, ctx } = await open({ doc: "catena", ws: "provenance" });
  const win = await winOf(p, "graph");
  let ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  await p.mouse.move(ws.rect.x + 30, ws.rect.y + 30);
  await p.waitForTimeout(200);
  ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const a = ws.boxes.find((b) => b.id === "US102");
  const t = ws.boxes.find((b) => b.id === "USV106");
  // from US102's right-edge handle onto USV106
  const sx = a.x + a.w - 1, sy = a.y + a.h / 2;
  const ex = t.x + t.w / 2, ey = t.y + t.h / 2;
  await p.mouse.move(sx, sy);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(sx + (ex - sx) * i / 8, sy + (ey - sy) * i / 8);
  await p.mouse.up();
  await p.waitForTimeout(400);
  const m = await p.evaluate(() => {
    const el = document.getElementById("edge-menu");
    if (!el || el.classList.contains("hidden")) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await p.keyboard.press("Escape");
  await ctx.close();
  if (!m) return { pass: false, detail: { menu: "not shown" } };
  const inside = m.x >= ws.rect.x - 1 && m.y >= ws.rect.y - 40 && m.x + m.w <= ws.rect.x + ws.rect.w + 1;
  const near = Math.hypot(m.x - ex, m.y - ey) < 260;
  return { pass: inside && near, detail: { menu: m, pointer: { x: ex, y: ey }, window: ws.rect } };
});
test("3.filters", "attraversare un'altra finestra non chiude il pannello filtri", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const win = await winOf(p, "graph");
  const ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  await p.mouse.move(ws.rect.x + 50, ws.rect.y + 50);
  await p.waitForTimeout(150);
  await p.click("#btn-view-props");
  await p.waitForTimeout(200);
  const open1 = await p.evaluate(() => !document.getElementById("filter-panel")?.classList.contains("hidden"));
  const insp = await p.evaluate(() => { const r = document.querySelector('[data-win$="inspector"]')?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.move(insp.x, insp.y, { steps: 4 });
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => { const el = document.getElementById("filter-panel"); return { open: !el?.classList.contains("hidden"), x: el?.getBoundingClientRect().x }; });
  await ctx.close();
  return { pass: open1 && r.open && r.x < insp.x - 100, detail: { open1, after: r } };
});

// ── PARTE 4 · il timbro, in due domande ─────────────────────────────────────
import { readdirSync, rmSync } from "node:fs";
/** the two folders start without stamps (the bridge's root is on this disk) */
async function resetFolders() {
  const root = await rootPath();
  for (const f of ["vuota", "modelli"]) {
    for (const n of readdirSync(`${root}/${f}`)) if (n.endsWith(".stamp.json")) rmSync(`${root}/${f}/${n}`);
  }
  return root;
}
const roadOf = (p) => p.evaluate(() => ({
  road: document.querySelector(".stamp-compose")?.dataset.road ?? null,
  pressed: document.querySelector('.stamp-road[aria-pressed="true"]')?.dataset.mode ?? null,
  why: document.querySelector(".stamp-compose-why-road")?.textContent ?? "",
  fields: [...document.querySelectorAll(".stamp-compose [data-field]")].map((e) => e.dataset.field),
}));
async function stampHere(p, kindLabel, { inputs = [], software = "", operator = "Mario Rossi" } = {}) {
  const sel = p.locator('.stamp-compose select[data-field="kind"]');
  const value = await sel.evaluate((s, lbl) => [...s.options].find((o) => o.textContent === lbl)?.value, kindLabel);
  await sel.selectOption(value);
  for (const name of inputs) {
    await p.locator(".stamp-compose-input", { hasText: name }).click();
    await p.waitForTimeout(900);
  }
  if (software) await p.fill('.stamp-compose input[data-field="software"]', software);
  await p.fill('.stamp-compose input[data-field="operator"]', operator);
  await p.click('.stamp-compose button[data-field="today"]');
  await p.click('.stamp-compose button[data-action="stamp"]');
  await p.waitForTimeout(2500);
  // CAMPAGNA · a stamp that worked closes with its SEAL (a card over the
  // window): the person closes it, Esc as the card says, and goes on
  stampHere.sealed = await p.locator(".seal-veil").count() > 0;
  if (stampHere.sealed) { await p.keyboard.press("Escape"); await p.waitForTimeout(300); }
}
test("4.origin", "una cartella senza timbri apre su «È un'origine», e dice perché", async () => {
  await resetFolders();
  const { p, ctx } = await open({ doc: "catena" });
  await openStampFor(p, "vuota", "foto1.jpg");
  const r = await roadOf(p);
  await ctx.close();
  return { pass: r.road === "origin" && r.pressed === "origin" && /origine|origin/i.test(r.why)
    && !r.fields.includes("software") && !r.fields.includes("commit") && r.fields.includes("instrument"), detail: r };
});
test("4.examples", "gli esempi sono esempi: «es. …», e nessun valore finto nei campi", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await openStampFor(p, "vuota", "foto1.jpg");
  const f = await p.evaluate(() => [...document.querySelectorAll(".stamp-compose input[type=text], .stamp-compose input[type=date]")]
    .map((i) => ({ k: i.dataset.field, v: i.value, ph: i.placeholder })));
  const kinds = await p.evaluate(() => [...document.querySelectorAll('.stamp-compose select[data-field="kind"] optgroup')].map((g) => g.label));
  await ctx.close();
  const bad = f.filter((x) => x.k !== "title" && (x.v || (x.ph && !/^(es\.|e\.g\.)/.test(x.ph))));
  // MICRO-UN-POSTO · the groups are the datamodel's families now (em_visual_rules
  // 1.6.22): «Cattura», then «Recupero» — no longer «Acquisizione», which is the
  // AXIS both families belong to
  return { pass: !bad.length && kinds[0] === "Cattura" && kinds[1] === "Recupero", detail: { bad, kinds } };
});
test("4.focus", "con Tipo mancante «Timbra» mette il focus su Tipo, e l'errore sta accanto", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await openStampFor(p, "vuota", "foto1.jpg");
  await p.click('.stamp-compose button[data-action="stamp"]');
  await p.waitForTimeout(300);
  const focus = await activeDesc(p);
  const err = await p.evaluate(() => document.querySelector('.stamp-compose [data-err="kind"]')?.textContent ?? "");
  await ctx.close();
  return { pass: focus.includes("[kind]") && !!err, detail: { focus, err } };
});
test("4.sidecar", "origine timbrata, poi un modello in /modelli apre su «Viene da altri file»; i sidecar hanno kind e ingressi", async () => {
  const root = await resetFolders();
  const { p, ctx } = await open({ doc: "catena" });
  await openStampFor(p, "modelli", "foto1.jpg");
  const first = await roadOf(p);
  await stampHere(p, "Fotografia");
  const photo = existsSync(`${root}/modelli/foto1.jpg.stamp.json`)
    ? JSON.parse(readFileSync(`${root}/modelli/foto1.jpg.stamp.json`, "utf8")) : null;
  await storageClick(p, "muro.gltf");
  await p.click("button[data-action=compose-one]");
  await p.waitForSelector(".stamp-compose");
  const second = await roadOf(p);
  await stampHere(p, "Fotogrammetria", { inputs: ["foto1.jpg"], software: "Metashape 2.1" });
  const mesh = existsSync(`${root}/modelli/muro.gltf.stamp.json`)
    ? JSON.parse(readFileSync(`${root}/modelli/muro.gltf.stamp.json`, "utf8")) : null;
  await ctx.close();
  const kindOf = (st) => st?.how?.dtc_kind ?? null;
  const from = mesh?.from ?? [];
  return {
    // MICRO-UN-POSTO · the definitive form (s3Dgraphy 1.6.22): the capture IS
    // the act's kind, and the provisional `how.acquisition.capture` is gone
    pass: first.road === "origin" && !!photo && kindOf(photo) === "photo" && photo?.how?.acquisition?.capture === undefined
      && photo?.by?.operator?.label === "Mario Rossi"
      && second.road === "derived" && !!mesh && kindOf(mesh) === "photogrammetry" && from.length === 1,
    detail: { first: first.road, second: second.road, photoKind: kindOf(photo), capture: photo?.how?.acquisition ?? null, operator: photo?.by?.operator ?? null,
              meshKind: kindOf(mesh), from: from.map((f) => f.resource_id ?? f) },
  };
});

// ── PARTE 5 · un solo tracciatore, e la lettura parte dal documento ─────────
async function openDocImage(p) {
  await workspace(p, "provenance");
  // AUDIT N8 · in Fonti the Documents table is the list: the Doc shows its pick
  await p.locator('[data-win$=":docs"] .tv-card[data-id="D3"] h3').first().click();
  await p.waitForSelector(".rd-img img", { timeout: 8000 });
  await p.waitForFunction(() => document.querySelector(".rd-img img")?.complete, null, { timeout: 8000 });
  await p.waitForTimeout(300);
}
const docArea = (p) => p.evaluate(() => {
  const a = document.querySelector(".rd-stage")?.closest(".tile-area")?.getBoundingClientRect();
  return a && { x: a.x, y: a.y, w: a.width, h: a.height };
});
test("5.onebar", "una sola barra di strumenti nella Doc di un'immagine", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await openDocImage(p);
  const r = await p.evaluate(() => {
    const area = document.querySelector(".rd-stage").closest(".tile-area");
    return {
      bars: area.querySelectorAll(".rd-tools").length,
      tools: [...area.querySelectorAll(".rd-tools [data-tool]")].map((b) => b.dataset.tool),
      others: area.querySelectorAll(".rd-3d-tools, .annot-tools-host, .annot-tools").length,
      modes: [...area.querySelectorAll(".tile-bar button")].map((b) => b.textContent.trim()).filter((x) => /^(View|Annotate|Mask|Guarda|Annota|Maschera)$/.test(x)),
      annotatorType: window.__EM_DRAG__.wins().some((w) => w.type === "annotator"),
    };
  });
  await ctx.close();
  return { pass: r.bars === 1 && r.tools.join() === "rect,polygon" && !r.others && !r.modes.length, detail: r };
});
test("5.bubble", "tracciare senza proprietà apre il fumetto accanto alla regione; Invio sceglie e nasce la catena", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await openDocImage(p);
  const before = await p.evaluate(() => ({ x: window.__EM_DRAG__.idsOfType("extractor").length }));
  await p.click('.rd-tools [data-tool="rect"]');
  await p.waitForTimeout(200);
  const img = await p.evaluate(() => { const r = document.querySelector(".rd-img svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const a = [img.x + img.w * 0.3, img.y + img.h * 0.3], b = [img.x + img.w * 0.5, img.y + img.h * 0.45];
  await p.mouse.move(a[0], a[1]); await p.mouse.down();
  await p.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); await p.mouse.move(b[0], b[1]); await p.mouse.up();
  await p.waitForTimeout(300);
  const pop = await p.evaluate(() => { const r = document.querySelector(".rd-bubble")?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height, focus: document.activeElement?.className }; });
  const area = await docArea(p);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => {
    const xs = window.__EM_DRAG__.idsOfType("extractor");
    const sel = window.__EM_DRAG__.selected()[0];
    const info = sel ? window.__EM_DRAG__.nodeInfo(sel) : null;
    return { x: xs.length, sel, type: info?.type, region: (info?.edges ?? []).some((e) => e.type === "extracted_from"),
             chain: !!document.querySelector(".insp-chain"), bubble: !!document.querySelector(".rd-bubble") };
  });
  await p.evaluate(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(300);
  const undone = await p.evaluate(() => window.__EM_DRAG__.idsOfType("extractor").length);
  await ctx.close();
  const inside = pop && area && pop.x >= area.x && pop.y >= area.y && pop.x + pop.w <= area.x + area.w + 1 && pop.y + pop.h <= area.y + area.h + 1;
  // right under the region, right above it, or beside it — and never over it
  const overlaps = pop && !(pop.x > b[0] || pop.x + pop.w < a[0] || pop.y > b[1] || pop.y + pop.h < a[1]);
  const near = pop && !overlaps && Math.min(Math.abs(pop.y - b[1]), Math.abs(pop.y + pop.h - a[1]),
    Math.abs(pop.x - b[0]), Math.abs(pop.x + pop.w - a[0])) < 40;
  return { pass: !!pop && inside && near && after.x === before.x + 1 && after.type === "extractor" && after.region && after.chain && !after.bubble && undone === before.x,
           detail: { pop, area, after, before, undone } };
});
test("5.polygon", "un poligono si chiude con Invio", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await openDocImage(p);
  await p.click('.rd-tools [data-tool="polygon"]');
  await p.waitForTimeout(200);
  const img = await p.evaluate(() => { const r = document.querySelector(".rd-img svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  for (const [fx, fy] of [[0.2, 0.2], [0.4, 0.22], [0.42, 0.4], [0.22, 0.42]]) {
    await p.mouse.click(img.x + img.w * fx, img.y + img.h * fy);
    await p.waitForTimeout(120);
  }
  const vertices = await p.evaluate(() => document.querySelector(".rd-img")?.dataset.vertices);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  const bubble = await p.evaluate(() => !!document.querySelector(".rd-bubble"));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  const gone = await p.evaluate(() => !document.querySelector(".rd-bubble"));
  await ctx.close();
  return { pass: vertices === "4" && bubble && gone, detail: { vertices, bubble, gone } };
});

test("5.shelf", "Shelf ▸ Annota apre la finestra Doc con quella risorsa, senza Annotatore nel layout", async () => {
  const shelf = { id: "shelf", name: "Shelf", entries: [{ id: "sh1", name: "prospetto.jpg", kind: "image",
    locator: `http://localhost:${PORT}/em/studio/testdata/catena-prospetto.jpg`, scope: "own-study", residency: "reference" }] };
  const { p, ctx } = await open({ doc: "catena", init: { "emstudio.shelf": JSON.stringify(shelf) } });
  await workspace(p, "assets");
  const btn = p.locator(".shelf-row button", { hasText: /Annota|Annotate/ }).first();
  await btn.waitFor({ timeout: 8000 });
  await btn.click();
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const doc = document.querySelector(".rd-stage");
    return { ws: document.querySelector("#workspace-bar .ws-tab.active")?.dataset.ws, doc: doc?.dataset.doc ?? null,
             img: !!document.querySelector(".rd-img img"), tools: !!document.querySelector(".rd-tools"),
             annotator: window.__EM_DRAG__.wins().some((w) => w.type === "annotator") };
  });
  const name = r.doc ? await p.evaluate((id) => window.__EM_DRAG__.nodeInfo(id)?.name, r.doc) : null;
  await ctx.close();
  return { pass: !!r.doc && r.img && r.tools && !r.annotator, detail: { ...r, name } };
});

// ── PARTE 6 · la verifica della cronologia ──────────────────────────────────
const cards = (p) => p.evaluate(() => [...document.querySelectorAll(".chr-card[data-overlap]")]
  .map((c) => ({ pair: c.dataset.overlap, delta: Number(c.dataset.delta), text: c.querySelector("b").textContent,
    phaseDisabled: c.querySelector('[data-remedy="phase"]')?.getAttribute("aria-disabled") === "true",
    phaseTitle: c.querySelector('[data-remedy="phase"]')?.title ?? "" })));
async function openChrono(p) {
  await p.click("#dd-tools .dd-toggle").catch(() => {});
  await p.evaluate(() => document.getElementById("btn-tool-chronology").click());
  await p.waitForSelector(".chr", { timeout: 8000 });
  await p.waitForTimeout(300);
}
test("6.deltas", "la fixture mostra due sovrapposizioni con i delta giusti", async () => {
  const { p, ctx } = await open({ doc: "chronology-overlaps" });
  await openChrono(p);
  const c = await cards(p);
  await ctx.close();
  const alto = c.find((x) => x.pair === "EP_ALTO|EP_MED");
  const tardo = c.find((x) => x.pair === "EP_TMED|EP_MED");
  return { pass: c.length === 2 && alto?.delta === 150 && !alto.phaseDisabled && tardo?.delta === 20 && tardo.phaseDisabled
    && /150/.test(tardo.phaseTitle) && /1280.1300/.test(tardo.text), detail: c };
});
test("6.remedies", "«Rendi fase» crea has_sub_epoch e toglie l'avviso; «inizia nel 1300» toglie l'altro; undo riporta tutto", async () => {
  const { p, ctx } = await open({ doc: "chronology-overlaps" });
  await openChrono(p);
  const graph0 = await p.evaluate(() => window.__EM_DRAG__.graphJson());
  await p.click('.chr-card[data-overlap="EP_ALTO|EP_MED"] [data-remedy="phase"]');
  await p.waitForTimeout(900);
  const sub = await p.evaluate(() => window.__EM_DRAG__.edgesOf("has_sub_epoch").map((e) => `${e.source}>${e.target}`));
  const after1 = await cards(p);
  const unitStays = await p.evaluate(() => window.__EM_DRAG__.epochOf("US1"));
  await p.click('.chr-card[data-overlap="EP_TMED|EP_MED"] [data-remedy="start"]');
  await p.waitForTimeout(500);
  const after2 = await cards(p);
  const start = await p.evaluate(() => window.__EM_DRAG__.data("EP_TMED").start_time);
  await p.evaluate(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(600);
  const back = await p.evaluate((g0) => window.__EM_DRAG__.graphJson() === g0, graph0);
  const after3 = await cards(p);
  await ctx.close();
  return { pass: sub.includes("EP_MED>EP_ALTO") && after1.length === 1 && unitStays === "EP_ALTO"
    && after2.length === 0 && Number(start) === 1300 && back && after3.length === 2,
    detail: { sub, after1: after1.length, unitStays, after2: after2.length, start, back, after3: after3.length } };
});
test("6.entries", "si arriva alla Cronologia dal menu della corsia e dall'ispettore dell'epoca", async () => {
  const { p, ctx } = await open({ doc: "chronology-overlaps" });
  await pick(p, "EP_MED");
  const inInspector = await p.evaluate(() => !!document.querySelector('.insp-chrono [data-action="check-chronology"]'));
  const says = await p.evaluate(() => document.querySelector(".insp-chrono")?.innerText ?? "");
  await p.click('.insp-chrono [data-action="check-chronology"]');
  await p.waitForTimeout(500);
  const opened = await p.evaluate(() => window.__EM_DRAG__.wins().some((w) => w.type === "chronology"));
  await ctx.close();
  return { pass: inInspector && opened && /20|150/.test(says), detail: { inInspector, opened, says } };
});

test("6.lanes", "epochs48: le fasi sono sotto-corsie, nessuna etichetta copre un'altra", async () => {
  const { p, ctx } = await open({ doc: "epochs48" });
  await p.waitForTimeout(400);
  const measure = () => p.evaluate(() => {
    const { lanes, bands } = window.__EM_DRAG__.labels();
    const x = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    let overLane = 0, overBand = 0;
    for (const b of bands) for (const l of lanes) if (x(b, l)) overLane++;
    for (let i = 0; i < bands.length; i++) for (let j = i + 1; j < bands.length; j++) if (x(bands[i], bands[j])) overBand++;
    return { lanes: lanes.length, bands: bands.length, overLane, overBand };
  });
  const fitted = await measure();
  // …and zoomed in, where the chips have room
  const win = await winOf(p, "graph");
  const ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  await p.mouse.move(ws.rect.x + 300, ws.rect.y + 60);
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -240); await p.waitForTimeout(80); }
  await p.waitForTimeout(300);
  const zoomed = await measure();
  await ctx.close();
  return { pass: fitted.bands > 0 && !fitted.overLane && !fitted.overBand && !zoomed.overLane && !zoomed.overBand,
           detail: { fitted, zoomed } };
});

test("6.lanemenu", "TempluMare: il clic destro sull'intestazione della corsia apre il menu (con la Cronologia) e non sposta la tela", async () => {
  const { p, ctx } = await open({ doc: "TempluMare" });
  const win = await winOf(p, "graph");
  const ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const x = ws.rect.x + 60, y = ws.rect.y + ws.rect.h * 0.4;
  await p.mouse.move(x, y);
  await p.waitForTimeout(100);
  const vp0 = await p.evaluate(() => window.__EM_SCENE__().vp);
  await p.mouse.click(x, y, { button: "right" });
  await p.waitForTimeout(300);
  const vp1 = await p.evaluate(() => window.__EM_SCENE__().vp);
  const items = await p.evaluate(() => [...document.querySelectorAll(".ctx-menu button")].map((b) => b.textContent));
  await ctx.close();
  return { pass: JSON.stringify(vp0) === JSON.stringify(vp1) && items.some((t) => /cronologia/i.test(t)), detail: { vp0, vp1, items } };
});

// ── PARTE 7 · stati vuoti che parlano, e i titoli ───────────────────────────
test("7.new", "File ▸ Nuovo: niente minimappa, e ogni finestra ha la sua frase", async () => {
  const { p, ctx } = await open({ doc: null });
  const before = await p.evaluate(() => ({
    minimap: [...document.querySelectorAll(".win-overview")].filter((m) => m.offsetParent && !m.classList.contains("hidden")).length,
    hint: document.querySelector(".canvas-empty-hint:not(.hidden)")?.innerText ?? "",
    outliner: document.querySelector(".nl-empty")?.textContent ?? "",
    inspector: document.querySelector('[data-win$="inspector"] .win-empty')?.textContent ?? "",
    title: document.getElementById("ns-title")?.textContent ?? "",
  }));
  await p.evaluate(() => document.getElementById("btn-new").click());
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => ({
    minimap: [...document.querySelectorAll(".win-overview")].filter((m) => m.offsetParent && !m.classList.contains("hidden")).length,
    hint: document.querySelector(".canvas-empty-hint:not(.hidden)")?.innerText ?? "",
    title: document.getElementById("ns-title")?.textContent ?? "",
  }));
  await ctx.close();
  return { pass: !before.minimap && /grafo/i.test(before.hint) && !!before.outliner && !!before.inspector
    && !after.minimap && !!after.hint && /Senza titolo/.test(before.title), detail: { before, after } };
});
test("7.title", "TempluMare mostra un titolo leggibile, mai l'UUID", async () => {
  const { p, ctx } = await open({ doc: "TempluMare" });
  const title = await p.evaluate(() => document.getElementById("ns-title")?.textContent ?? "");
  const info = await p.evaluate(() => document.getElementById("info")?.textContent ?? "");
  await ctx.close();
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-/i;
  return { pass: !!title && !uuid.test(title) && !uuid.test(info), detail: { title, info: info.slice(0, 80) } };
});
test("7.dtc", "la finestra DTC vuota dice che il DTC nasce dai timbri, e offre lo Storage", async () => {
  const { p, ctx } = await open({ doc: null });
  await p.evaluate(() => document.getElementById("btn-new").click());
  await p.waitForTimeout(500);
  await workspace(p, "assets");
  const txt = await p.evaluate(() => [...document.querySelectorAll(".canvas-empty-hint:not(.hidden)")].map((h) => h.innerText).join(" | "));
  await ctx.close();
  return { pass: /timbri/.test(txt) && /Storage/.test(txt) && !/Shift\+A/.test(txt), detail: { txt } };
});

// ── PARTE 8 · outliner e ricerca ───────────────────────────────────────────
test("8.count", "l'outliner conta «358 nodi · 12 epoche», e «n su 358» quando filtra", async () => {
  const { p, ctx } = await open({ doc: "epochs48" });
  const c0 = await p.evaluate(() => document.querySelector(".nl-count")?.textContent ?? "");
  await p.fill(".nl-filter", "USM10");
  await p.waitForTimeout(300);
  const c1 = await p.evaluate(() => document.querySelector(".nl-count")?.textContent ?? "");
  await ctx.close();
  const m = /^(\d+) su 358$/.exec(c1);
  return { pass: c0 === "358 nodi · 12 epoche" && !!m && Number(m[1]) <= 358, detail: { c0, c1 } };
});
test("8.once", "un elenco solo: per epoca ogni unità compare una volta; A–Z senza proprietà temporali", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const byEpoch = await p.evaluate(() => [...document.querySelectorAll(".nl-rows .nl-row")].map((r) => r.querySelector("b")?.textContent));
  await p.click('.nl-mode[data-mode="az"]');
  await p.waitForTimeout(200);
  const az = await p.evaluate(() => [...document.querySelectorAll(".nl-rows .nl-row")].map((r) => r.querySelector("b")?.textContent));
  await p.click('.nl-mode[data-mode="epoch"]');
  await ctx.close();
  const dup = byEpoch.filter((n, i) => byEpoch.indexOf(n) !== i);
  return { pass: !dup.length && byEpoch.includes("USM101") && az.includes("USM101") && !az.some((n) => /^absolute_time_(start|end)$/.test(n ?? "")),
           detail: { dup, byEpoch: byEpoch.length, az: az.length, temporal: az.filter((n) => /absolute_time/.test(n ?? "")) } };
});
test("8.search", "«USM101» + Invio seleziona l'unità, non PD_USM101; la tendina ha tipo, frecce e Invio", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await p.click("#search");
  await p.keyboard.type("USM101");
  await p.waitForTimeout(250);
  const list = await p.evaluate(() => ({ role: document.getElementById("search-results").getAttribute("role"),
    hits: [...document.querySelectorAll("#search-results .search-hit")].map((b) => [b.querySelector(".hit-name").textContent, b.querySelector(".hit-type").textContent]) }));
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  const sel1 = await p.evaluate(() => window.__EM_DRAG__.selected()[0]);
  await p.click("#search");
  await p.keyboard.type("USM101");
  await p.waitForTimeout(250);
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  const sel2 = await p.evaluate(() => window.__EM_DRAG__.selected()[0]);
  await ctx.close();
  return { pass: list.role === "listbox" && list.hits[0]?.[0] === "USM101" && sel1 === "USM101" && !!sel2 && sel2 !== "USM101",
           detail: { list, sel1, sel2 } };
});

// ── PARTE 9 · una selezione, tutti i pannelli ──────────────────────────────
test("9.docsel", "documento scelto (nella tabella Documenti di Fonti) → la Doc lo mostra e l'ispettore è del documento", async () => {
  const { p, ctx } = await open({ doc: "catena", ws: "provenance" });
  const docList = await p.evaluate(() => { const l = document.querySelector(".doc-list"); return l ? !l.classList.contains("hidden") && l.offsetParent !== null : false; });
  // a card of the Documents table
  await p.locator('[data-win$=":docs"] .tv-card[data-id="D3"] h3').first().click();
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ sel: window.__EM_DRAG__.selected()[0], doc: document.querySelector(".rd-stage")?.dataset.doc,
    insp: document.querySelector('[data-win$="inspector"] .insp-head')?.textContent ?? "" }));
  await ctx.close();
  return { pass: !docList && r.sel === "D3" && r.doc === "D3" && /document|D\.3/.test(r.insp), detail: { docList, ...r } };
});
test("9.reveal", "«Mostra sul canvas» in Fonti usa il grafo sotto la Doc (la Doc resta Doc)", async () => {
  const { p, ctx } = await open({ doc: "catena", ws: "provenance" });
  const before = await p.evaluate(() => window.__EM_DRAG__.wins().map((w) => w.type).sort().join());
  await p.locator(".doc-detail button", { hasText: /Mostra sul canvas|Show on canvas/ }).first().click();
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => window.__EM_DRAG__.wins().map((w) => w.type).sort().join());
  const ws = await p.evaluate(() => document.querySelector("#workspace-bar .ws-tab.active")?.dataset.ws);
  const sel = await p.evaluate(() => window.__EM_DRAG__.selected()[0]);
  await ctx.close();
  return { pass: before === after && ws === "provenance" && !!sel, detail: { before, after, ws, sel } };
});
// NIGHT-SPAZIO · the rule changed: a space without a Doc no longer sends the
// reader to Fonti — «Leggi» opens the service window BESIDE, in this space
test("9.read", "«Leggi» in uno spazio senza Doc apre la finestra di servizio accanto, nello stesso spazio (non più «→ Fonti»)", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await pick(p, "USM101");
  const labels = await p.evaluate(() => [...document.querySelectorAll(".insp-chain .chain-acts button")].map((b) => b.textContent));
  const ws0 = await p.evaluate(() => document.querySelector("#workspace-bar .ws-tab.active, #workspace-bar .ws-tab[aria-selected=true]")?.dataset.ws ?? null);
  await p.locator(".insp-chain .chain-acts button", { hasText: "Leggi" }).first().click();
  await p.waitForTimeout(900);
  const ws1 = await p.evaluate(() => document.querySelector("#workspace-bar .ws-tab.active, #workspace-bar .ws-tab[aria-selected=true]")?.dataset.ws ?? null);
  const docs = await p.evaluate(() => window.__EM_DRAG__.wins().filter((w) => w.type === "doc").map((w) => w.state["current.doc.role"] ?? null));
  await ctx.close();
  return { pass: labels.some((l) => /^Leggi$/.test(l.trim())) && !labels.some((l) => /Fonti/.test(l)) && ws0 === ws1
      && docs.length === 1 && docs[0] === "service", detail: { labels, ws0, ws1, docs } };
});

// ── PARTE 10 · intestazioni sobrie, un verbo per azione ─────────────────────
test("10.header", "l'intestazione del grafo: tipo, modo a segmenti, un solo menu «⋯» (niente tre «Graph»)", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const r = await p.evaluate(() => {
    const bar = document.querySelector('[data-win="canvas:1"] .tile-bar') ?? document.querySelector(".tile-active .tile-bar");
    return {
      seg: [...bar.querySelectorAll(".win-seg button")].map((b) => b.textContent),
      menus: [...bar.querySelectorAll(".win-menu-toggle")].map((b) => b.textContent.trim()),
      graphWords: (bar.innerText.match(/\bGrafo\b|\bGraph\b/g) ?? []).length,
    };
  });
  // the «⋯» gathers Layout and «Normalizza grafie…»
  await p.click('.tile-active .win-more');
  await p.waitForTimeout(150);
  const items = await p.evaluate(() => [...document.querySelectorAll(".dd-menu:not(.hidden) button")].map((b) => b.textContent));
  await p.keyboard.press("Escape");
  await ctx.close();
  return { pass: r.seg.length === 4 && r.menus.length === 1 && r.menus[0] === "⋯" && r.graphWords <= 2
    && items.some((i) => /grafie|spellings/i.test(i)), detail: { ...r, items } };
});
test("10.warnings", "la pillola degli avvisi porta alla tabella, non apre un popover sopra l'ispettore; conta solo il grafo", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await p.click("#footer-warnings");
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({ pop: !!document.getElementById("issues-pop") && !document.getElementById("issues-pop").classList.contains("hidden"),
    tables: window.__EM_DRAG__.wins().filter((w) => w.type === "table").length,
    active: document.querySelector(".tile-active")?.dataset.win, pill: document.getElementById("footer-warnings").textContent,
    issues: window.__EM_DRAG__.issues().filter((i) => i.rule === "log").length }));
  await ctx.close();
  return { pass: !r.pop && r.tables === 1 && /issues/.test(r.active ?? "") && !r.issues, detail: r };
});
test("10.publish", "«Pubblica» ha un posto solo: la striscia del nome; la narrativa «Esporta»", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const r = await p.evaluate(() => ({
    file: [...document.querySelectorAll("#dd-file button, #toolbar button")].filter((b) => /Pubblica|Publish/.test(b.textContent)).map((b) => b.id || b.textContent.trim()),
    strip: !!document.getElementById("ns-publish"),
  }));
  await narrativeSpace(p);
  const nv = await p.evaluate(() => [...document.querySelectorAll(".tile-bar button")].map((b) => b.textContent.trim()).filter((x) => /Pubblica|Esporta|Publish|Export/.test(x)));
  await ctx.close();
  return { pass: r.strip && !r.file.length && nv.some((x) => /Esporta/.test(x)) && !nv.some((x) => /Pubblica/.test(x)), detail: { ...r, nv } };
});
test("10.tabs", "doppio clic su una scheda dello spazio = rinomina, per tutte; il reset sta nel menu della scheda", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  p.once("dialog", (d) => d.accept("Strati"));
  await p.dblclick('#workspace-bar .ws-tab[data-ws="canvas"]');
  await p.waitForTimeout(300);
  const label = await p.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="canvas"] .ws-lb')?.textContent);
  await p.click('#workspace-bar .ws-tab[data-ws="canvas"]', { button: "right" });
  await p.waitForTimeout(200);
  const items = await p.evaluate(() => [...document.querySelectorAll(".ctx-menu button")].map((b) => b.textContent));
  await ctx.close();
  return { pass: label === "Strati" && items.some((i) => /Rinomina/.test(i)) && items.some((i) => /Ripristina/.test(i)), detail: { label, items } };
});

// ── PARTE 11 · shelf e storage leggibili ────────────────────────────────────
const SHELF3 = { id: "shelf", name: "Shelf di prova", entries: [
  { id: "sh1", name: "prospetto_nord_USM101_campagna2026.jpg", kind: "image", locator: "/Users/x/scavo/foto/prospetto_nord_USM101_campagna2026.jpg", scope: "own-study", residency: "resident", checksum: "sha256:4c5b80263bfa65b08e8f85db68426ebcfe31b0cbb36b07ad9286f11b3739679b" },
  { id: "sh2", name: "rilievo.glb", kind: "model", locator: "https://example.org/iiif/rilievo.glb", scope: "other-HDT", residency: "reference" },
  { id: "sh3", name: "scheda_US105.pdf", kind: "document", locator: "s3://bucket/room/scheda_US105.pdf", scope: "own-study", residency: "resident" }] };
for (const w of [1280, 1600]) {
  test(`11.shelf${w}`, `shelf a ${w}: righe a due livelli senza testo sovrapposto, conteggio intero`, async () => {
    const { p, ctx } = await open({ doc: "catena", ws: "assets", w, h: 860, init: { "emstudio.shelf": JSON.stringify(SHELF3) } });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const x = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      const bad = [];
      for (const row of document.querySelectorAll(".shelf-row")) {
        const parts = [...row.children].map((c) => c.getBoundingClientRect()).filter((q) => q.width && q.height);
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (x(parts[i], parts[j])) bad.push(`${row.dataset.entry}:${i}×${j}`);
        const name = row.querySelector(".shelf-name").getBoundingClientRect();
        if (name.width < 60) bad.push(`${row.dataset.entry}:name ${Math.round(name.width)}px`);
      }
      const c = document.querySelector('[data-win$=":shelf"] .win-strip-count');
      const cr = c?.getBoundingClientRect();
      // whole AND in view: inside every clipping box around it (the strip, the
      // bar), not scrolled or cut out of them
      let inView = !!cr && cr.width > 20;
      for (let e = c?.parentElement; e && inView && !e.classList.contains("tile-area"); e = e.parentElement) {
        const st = getComputedStyle(e);
        if (st.overflowX === "visible" && st.overflow === "visible") continue;
        const q = e.getBoundingClientRect();
        if (cr.left < q.left - 0.5 || cr.right > q.right + 0.5 || cr.top < q.top - 0.5 || cr.bottom > q.bottom + 0.5) inView = false;
      }
      return { bad, count: c?.textContent ?? "", countWhole: !!c && c.scrollWidth <= c.clientWidth + 1 && inView };
    });
    await ctx.close();
    return { pass: !r.bad.length && r.countWhole && /3/.test(r.count), detail: r };
  });
}
test("11.folder", "una cartella dello Storage si apre con un clic", async () => {
  const { p, ctx } = await open({ doc: "catena", ws: "assets" });
  const root = await rootPath();
  const row = p.locator(".storage-row", { has: p.locator(".storage-name", { hasText: /^fs$/ }) }).first();
  await row.waitFor({ timeout: 8000 });
  await row.click();
  await p.waitForTimeout(700);
  const names = await p.evaluate(() => [...document.querySelectorAll(".storage-row .storage-name")].map((n) => n.textContent));
  await ctx.close();
  return { pass: names.includes("vuota") && names.includes("modelli"), detail: { names, root } };
});

// ── PARTE 12 · coerenza ─────────────────────────────────────────────────────
test("12.shortcuts", "l'aiuto delle scorciatoie si genera dalla mappa dei tasti (≥ 40) ed è cercabile", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await p.evaluate(() => document.getElementById("btn-help-shortcuts").click());
  await p.waitForSelector(".modal.shortcuts");
  const all = await p.evaluate(() => document.querySelectorAll(".shortcuts-table tr[data-key]").length);
  await p.fill(".shortcuts-q", "poligono");
  await p.waitForTimeout(150);
  const found = await p.evaluate(() => [...document.querySelectorAll(".shortcuts-table tr[data-key]")].map((r) => r.dataset.key));
  await ctx.close();
  return { pass: all >= 40 && found.includes("polyClose") && found.length < all, detail: { all, found } };
});
test("12.undoall", "le eliminazioni danno «Annulla»: una connessione, una riga dello shelf", async () => {
  const shelf = { id: "shelf", name: "Shelf", entries: [{ id: "sh1", name: "prospetto.jpg", kind: "image", locator: "/x/prospetto.jpg", scope: "own-study", residency: "resident" }] };
  const { p, ctx } = await open({ doc: "catena", init: { "emstudio.shelf": JSON.stringify(shelf) } });
  // a connection, from the Inspector
  await pick(p, "USM101");
  const e0 = await p.evaluate(() => window.__EM_DRAG__.nodeInfo("USM101").edges.length);
  await p.locator('.tile-area button[title="Elimina questa connessione"]').first().click();
  await p.waitForTimeout(300);
  const toast1 = await p.evaluate(() => document.getElementById("toast").innerText);
  await p.click("#toast .toast-action");
  await p.waitForTimeout(300);
  const e1 = await p.evaluate(() => window.__EM_DRAG__.nodeInfo("USM101").edges.length);
  // a shelf row
  await workspace(p, "assets");
  await p.locator('.shelf-row[data-entry="sh1"] .shelf-actions button', { hasText: "✕" }).click();
  await p.waitForTimeout(300);
  const toast2 = await p.evaluate(() => document.getElementById("toast").innerText);
  await p.click("#toast .toast-action");
  await p.waitForTimeout(300);
  const back = await p.evaluate(() => !!document.querySelector('.shelf-row[data-entry="sh1"]'));
  await ctx.close();
  return { pass: /Annulla/.test(toast1) && e1 === e0 && /prospetto/.test(toast2) && back, detail: { toast1, e0, e1, toast2, back } };
});
test("12.settings", "Impostazioni: Annulla riporta la lingua e il tema; Salva dice cosa è cambiato", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await p.evaluate(() => document.getElementById("btn-settings").click());
  await p.waitForSelector("#settings-modal:not(.hidden)");
  await p.selectOption("#set-language", "en");
  await p.waitForTimeout(200);
  const mid = await p.evaluate(() => document.getElementById("ns-publish").textContent);
  await p.click("#settings-cancel");
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => document.getElementById("ns-publish").textContent);
  await p.evaluate(() => document.getElementById("btn-settings").click());
  await p.waitForSelector("#settings-modal:not(.hidden)");
  await p.evaluate(() => { const c = document.getElementById("set-edge-tips") ?? [...document.querySelectorAll("#settings-modal input[type=checkbox]")][0]; c.click(); });
  await p.click("#settings-save");
  await p.waitForTimeout(300);
  const saved = await p.evaluate(() => document.getElementById("toast").innerText);
  await ctx.close();
  return { pass: /Publish/.test(mid) && /Pubblica/.test(after) && /Salvato: /.test(saved) && !/Sync target/.test(saved), detail: { mid, after, saved } };
});

// ── MICRO-UN-POSTO · parte 0 · il sync: la cattura, le murature ──────────────
test("U0.families", "timbro, origine: i generi in due gruppi, come li chiama il datamodel (Cattura, poi Recupero)", async () => {
  await resetFolders();
  const { p, ctx } = await open({ doc: "catena" });
  await openStampFor(p, "vuota", "foto1.jpg");
  const groups = await p.evaluate(() => [...document.querySelectorAll('.stamp-compose select[data-field="kind"] optgroup')]
    .map((g) => ({ label: g.label, kinds: [...g.querySelectorAll("option")].map((o) => o.value) })));
  await ctx.close();
  const labels = groups.map((g) => g.label);
  const cap = groups[0]?.kinds ?? [];
  return { pass: JSON.stringify(labels) === JSON.stringify(["Cattura", "Recupero"])
      && ["photo", "gnss_survey", "field_drawing", "recording_sheet"].every((k) => cap.includes(k))
      && (groups[1]?.kinds ?? []).includes("local_import") && !cap.includes("local_import"),
    detail: { groups } };
});
test("U0.usm", "epochs48: le USM aprono come US muraria, l'ispettore dice «US · muraria», niente avvisi «untyped»", async () => {
  const { p, ctx, errors } = await open({ doc: "epochs48" });
  const types = await p.evaluate(() => {
    const g = JSON.parse(window.__EM_DRAG__.graphJson());
    const usm = g.nodes.filter((n) => /^USM/.test(n.name ?? ""));
    return { usm: usm.length, asUS: usm.filter((n) => n.node_type === "US" && n.data?.stratigraphic_kind === "masonry").length,
             legacy: g.nodes.filter((n) => n.node_type === "USM").length };
  });
  await pick(p, "U001");
  const chip = await p.evaluate(() => document.querySelector(".insp-chip")?.textContent ?? null);
  const scene = await p.evaluate(() => window.__EM_DRAG__.sceneOf("U001")?.node_type ?? window.__EM_DRAG__.node("U001")?.node_type);
  const untyped = await p.evaluate(() => window.__EM_DRAG__.issues().filter((i) => /untyped|not in this build/.test(i.txt ?? "")).length);
  await ctx.close();
  return { pass: types.usm === 13 && types.asUS === 13 && !types.legacy && chip === "US · muraria" && scene === "US" && !untyped && !errors.length,
    detail: { types, chip, scene, untyped, errors } };
});

// ── NIGHT-SPAZIO · parte 1 · i generi delle US e il decoratore del glifo ────
// `testdata/generi.em.json` = catena + a USR and a USS as an em.json of 29 Sep
// wrote them (node_type USR / USS) + a plain US beside them.
test("S1.genres", "epochs48 e generi: USM → US muraria, USR/USS → US di rivestimento (USS tiene il suo codice); l'ispettore lo dice", async () => {
  const kinds = async (doc) => {
    const { p, ctx, errors } = await open({ doc });
    const r = await p.evaluate(() => {
      const g = JSON.parse(window.__EM_DRAG__.graphJson());
      const by = (k) => g.nodes.filter((n) => n.data?.stratigraphic_kind === k).map((n) => n.id).sort();
      return { masonry: by("masonry").length, coating: by("coating"),
        legacy: g.nodes.filter((n) => ["USM", "USR", "USS"].includes(n.node_type)).length,
        codes: Object.fromEntries(g.nodes.filter((n) => n.data?.source_code).map((n) => [n.id, n.data.source_code])) };
    });
    return { p, ctx, errors, r };
  };
  const a = await kinds("epochs48");
  await a.ctx.close();
  const b = await kinds("generi");
  const chips = {};
  for (const id of ["USR201", "USS202", "US203"]) {
    await pick(b.p, id);
    chips[id] = await b.p.evaluate(() => document.querySelector(".insp-chip")?.textContent ?? null);
  }
  const element = await b.p.evaluate(() => [...document.querySelectorAll(".insp-element-label")].map((e) => e.textContent));
  await b.ctx.close();
  const pass = a.r.masonry === 13 && !a.r.coating.length && !a.r.legacy
    && b.r.coating.join() === "USR201,USS202" && b.r.masonry === 1 && !b.r.legacy && JSON.stringify(b.r.codes) === JSON.stringify({ USS202: "USS" })
    && chips.USR201 === "US · di rivestimento" && chips.USS202 === "US · di rivestimento" && chips.US203 === "US"
    && !a.errors.length && !b.errors.length;
  return { pass, detail: { epochs48: a.r, generi: b.r, chips, element, errors: [...a.errors, ...b.errors] } };
});

/** the genre decorators drawn in one graph window: single capital letters in
 *  the colour of the unit's border, inside its box, and what is drawn on the
 *  plain US beside them */
async function genreDraws(p, win) {
  await p.waitForTimeout(500);
  return p.evaluate((w) => {
    const sc = window.__EM_DRAG__.winScene(w);
    const draws = window.__TEXT_DRAWS__();
    const inside = (d, b) => d.x >= b.x - 1 && d.y >= b.y - 1 && d.x + d.w <= b.x + b.w + 1 && d.y + d.h <= b.y + b.h + 1;
    const out = {};
    for (const id of ["USR201", "USS202", "US203", "USM204"]) {
      const b = sc.boxes.find((x) => x.id === id);
      if (!b) { out[id] = null; continue; }
      const letters = draws.filter((d) => /^[A-Z]$/.test(d.text) && inside(d, b));
      out[id] = { box: { w: Math.round(b.w), h: Math.round(b.h) },
        letters: letters.map((d) => ({ text: d.text, fill: d.fill,
          // where it sits in the box: 0..1 from the left, 0..1 from the top
          fx: Number(((d.x + d.w / 2 - b.x) / b.w).toFixed(2)), fy: Number(((d.y + d.h / 2 - b.y) / b.h).toFixed(2)),
          px: Number(d.h.toFixed(1)) })),
        name: draws.some((d) => d.text === id && inside(d, b)) };
    }
    return { mode: sc.mode, out };
  }, win);
}
test("S1.decorator", "Matrix e Graph: «R» nell'angolo in basso a destra della USR e della USS, «M» della USM, nel colore del bordo; la forma e il nome restano quelli della US", async () => {
  const { p, ctx, errors } = await open({ doc: "generi", hook: textDrawHook });
  const win = await winOf(p, "graph");
  // the US's border as the vendored visual rules declare it (the canvas stroke)
  const border = JSON.parse(readFileSync(new URL("../src/assets/em_visual_rules.json", import.meta.url), "utf8"))
    .node_styles.US.style.border_color;
  const matrix = await genreDraws(p, win);
  await p.locator(`[data-win="${win}"] .win-seg button`).nth(1).click();
  const graph = await genreDraws(p, win);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s1-decoratori-graph.png` }).catch(() => {});
  await ctx.close();
  const ok = (m) => {
    const r = m.out.USR201, s = m.out.USS202, u = m.out.US203, w = m.out.USM204;
    const deco = (x, L) => x && x.letters.length === 1 && x.letters[0].text === L && x.letters[0].fx > 0.8 && x.letters[0].fy > 0.6
      && (!border || x.letters[0].fill.toLowerCase() === border.toLowerCase()) && x.name;
    return deco(r, "R") && deco(s, "R") && deco(w, "M") && u && !u.letters.length && u.name
      && r.box.w === u.box.w && r.box.h === u.box.h && s.box.w === u.box.w && w.box.w === u.box.w;
  };
  return { pass: ok(matrix) && ok(graph) && matrix.mode !== graph.mode && !errors.length, detail: { border, matrix, graph, errors } };
});

// ── NIGHT-SPAZIO · parte 2 · le letture nei dati del nodo ────────────────────
/** the place of a reading, as the graph holds it */
const placeOf = (p, x) => p.evaluate((id) => {
  const d = window.__EM_DRAG__;
  const e = d.edgesOf("extracted_from").find((ed) => ed.source === id && d.node(ed.target)?.node_type === "annotation_region");
  if (!e) return null;
  const r = d.node(e.target);
  return { id: r.id, data: r.data, shapes: d.edgesOf("has_semantic_shape").filter((ed) => ed.source === r.id).length };
}, x);
/** a reading on P_H read from D.2 (the model), in the Provenance space */
async function readingOnModel(p) {
  await pick(p, "USM101");
  await p.locator('[data-add-reading="P_H"]').first().click();
  await p.waitForTimeout(300);
  await p.locator(".addm-item", { hasText: "D.2 ·" }).first().click();
  await p.waitForTimeout(900);
  await p.waitForFunction(() => document.querySelector(".rd-3d-host")?.dataset.ready === "1", null, { timeout: 15000 });
  return (await p.evaluate(() => window.__EM_DRAG__.selected()))[0];
}
const modelCanvas = (p) => p.evaluate(() => { const cv = document.querySelector(".rd-3d-host canvas"); const r = cv.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const markerLabels = (p) => p.evaluate(() => [...document.querySelectorAll(".rd-3d-host .v3d-label")].filter((l) => !l.classList.contains("draft")).map((l) => l.textContent));
test("S2.trace", "punto, linea e polilinea tracciati: i vertici in data.coords, nessuna forma né glb; salvato e riaperto misura uguale", async () => {
  const { p, ctx, errors } = await open({ doc: "catena" });
  const glbCalls = [];
  p.on("request", (r) => { if (/place-reading|\.glb(\?|$)|fs\/(write|stage)/.test(r.url())) glbCalls.push(r.url().replace(/^.*\/\/[^/]+/, "")); });
  await workspace(p, "provenance");
  const at = (c, fx, fy) => [c.x + c.w * fx, c.y + c.h * fy];
  const xs = {};
  xs.polyline = await readingOnModel(p);
  await p.click('.rd-tool[data-tool="polyline"]');
  let c = await modelCanvas(p);
  for (const [fx, fy] of [[0.42, 0.45], [0.52, 0.47], [0.58, 0.56]]) { await p.mouse.click(...at(c, fx, fy)); await p.waitForTimeout(250); }
  await p.keyboard.press("Enter");
  await p.waitForTimeout(900);
  xs.line = await readingOnModel(p);
  await p.click('.rd-tool[data-tool="line"]');
  c = await modelCanvas(p);
  await p.mouse.click(...at(c, 0.45, 0.5)); await p.waitForTimeout(250);
  await p.mouse.click(...at(c, 0.6, 0.5)); await p.waitForTimeout(900);
  xs.point = await readingOnModel(p);
  await p.click('.rd-tool[data-tool="point"]');
  c = await modelCanvas(p);
  await p.mouse.click(...at(c, 0.5, 0.5)); await p.waitForTimeout(900);
  const places = {};
  for (const [k, x] of Object.entries(xs)) places[k] = await placeOf(p, x);
  const measures = await p.evaluate((ids) => Object.fromEntries(Object.entries(ids).map(([k, x]) => [k, window.__EM_DRAG__.measure?.(x) ?? null])), xs);
  const pending = await p.evaluate(() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).filter((t) => /glb/i.test(t)));
  const saved = await p.evaluate(() => window.__EM_DRAG__.docJson ? JSON.parse(window.__EM_DRAG__.docJson()) : { graph: JSON.parse(window.__EM_DRAG__.graphJson()) });
  const shapesInDoc = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.filter((n) => n.node_type === "semantic_shape").length);
  const markers = await markerLabels(p);
  await ctx.close();
  // «salva, riapri»: the saved document in a fresh page
  const again = await open({ doc: saved });
  const measures2 = await again.p.evaluate((ids) => Object.fromEntries(Object.entries(ids).map(([k, x]) => [k, window.__EM_DRAG__.measure?.(x) ?? null])), xs);
  await workspace(again.p, "provenance");
  await pick(again.p, "D2");
  await again.p.waitForFunction(() => document.querySelector(".rd-3d-host")?.dataset.ready === "1", null, { timeout: 15000 }).catch(() => {});
  await again.p.waitForTimeout(800);
  const markers2 = await markerLabels(again.p);
  await again.ctx.close();
  const coordsOk = places.polyline?.data?.coords?.length === 3 && places.line?.data?.coords?.length === 2 && places.point?.data?.coords?.length === 1
    && Object.values(places).every((q) => q && q.shapes === 0 && q.data.crs === "local" && q.data.vertex_count === q.data.coords.length);
  return { pass: coordsOk && !shapesInDoc && !glbCalls.length && !pending.length
      && JSON.stringify(measures) === JSON.stringify(measures2) && !!measures.polyline && !!measures.line
      && JSON.stringify(markers2) === JSON.stringify(markers) && !errors.length && !again.errors.length,
    detail: { places, measures, measures2, glbCalls, pending, shapesInDoc, markers, markers2, errors: [...errors, ...again.errors] } };
});

/** the 7-ott em.json in the bridge's folder, with its readings/ (copied fresh) */
function lettureFolder() {
  const dir = `${FS_ROOT}/letture`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${dir}/readings`, { recursive: true });
  for (const f of readdirSync(`${TD}letture-7ott/readings`)) copyFileSync(`${TD}letture-7ott/readings/${f}`, `${dir}/readings/${f}`);
  copyFileSync(`${TD}letture-7ott/letture-7ott.em.json`, `${dir}/letture-7ott.em.json`);
  return dir;
}
const regionsOf = (p) => p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes
  .filter((n) => n.node_type === "annotation_region")
  .map((n) => ({ id: n.id, kind: n.data.geometry_kind, coords: n.data.coords?.length ?? 0, length: n.data.length ?? null,
                 value: window.__EM_DRAG__.measureRegion?.(n.id)?.value ?? null })));
test("S2.legacy", "un em.json del 7 ott (vertici nei glb) si apre con le coords nel nodo e le misure uguali; i file restano; senza cartella resta com'era e lo dice", async () => {
  const dir = lettureFolder();
  const doc = fixture("letture-7ott/letture-7ott");
  const was = doc.graph.nodes.filter((n) => n.node_type === "annotation_region")
    .map((n) => ({ id: n.id, kind: n.data.geometry_kind, length: n.data.length ?? null }));
  // with its folder: opened from the file it is
  const { p, ctx, errors } = await open({ doc: null });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [doc, `${dir}/letture-7ott.em.json`]);
  await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length > 0, null, { timeout: 20000 });
  await p.waitForTimeout(2500);
  const now = await regionsOf(p);
  const shapes = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.filter((n) => n.node_type === "semantic_shape").length);
  const dirty = await p.evaluate(() => window.__EM_DRAG__.dirty());
  await ctx.close();
  const files = readdirSync(`${dir}/readings`).length;
  // without a folder: the old form stays (the glb is the only road), and a warning says so
  const b = await open({ doc });
  await b.p.waitForTimeout(1500);
  const bare = await regionsOf(b.p);
  const warned = await b.p.evaluate(() => (window.__EM_DRAG__.log?.() ?? [])
    .filter((e) => e.level === "warn" && /readings\//.test(e.message)).length);
  const bareShapes = await b.p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.filter((n) => n.node_type === "semantic_shape").length);
  await b.ctx.close();
  const same = was.every((w) => { const n = now.find((x) => x.id === w.id);
    return n && n.coords === ({ point: 1, line: 2, polyline: 4 })[w.kind]
      && (w.length == null || (n.length != null && n.length.toFixed(3) === w.length.toFixed(3))); });
  return { pass: same && !shapes && files === 3 && bareShapes === 3 && warned > 0 && !errors.length && !b.errors.length,
    detail: { was, now, shapes, dirty, files, bare, bareShapes, warned, errors: [...errors, ...b.errors] } };
});

// ── NIGHT-SPAZIO · parte 3 · lo spazio di lavoro «Spazio» ────────────────────
// `testdata/spazio.em.json` = catena + two RMs in Età moderna (the survey,
// resident; a reconstruction, reference only) and the proxies of Medioevo (a
// glb, convex hulls, a reference, a declared file that is not there, a unit
// without one); Età imperiale holds a unit and no 3D. Spheres for US102.
const sceneState = (p) => p.evaluate(() => {
  const h = document.querySelector(".scn-host");
  return { ready: h?.dataset.ready ?? null, items: h?.__space?.() ?? null,
    epoch: document.querySelector('.scn-seg button[aria-pressed="true"]')?.dataset.epoch ?? null,
    overlay: document.querySelector(".scn-ov:not(.hidden)")?.textContent ?? null,
    empty: document.querySelector(".scn-empty:not(.hidden)")?.textContent ?? null,
    labels: [...document.querySelectorAll(".scn-label")].map((l) => ({ t: l.textContent, cls: l.className })),
    camera: h?.__spaceCamera?.() ?? null };
});
async function spaceOn(p, epoch) {
  await p.click(`.scn-seg button[data-epoch="${epoch}"]`);
  await p.waitForTimeout(1800);
  return sceneState(p);
}
test("S3.layers", "Spazio · l'epoca con RM mostra i due livelli (RM e proxy), e gli interruttori li tolgono uno per volta", async () => {
  const { p, ctx, errors } = await open({ doc: "spazio", ws: "space" });
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
  const both = await spaceOn(p, "EP_MOD");
  await p.click('.scn-tg[data-toggle="rm"]'); await p.waitForTimeout(900);
  const noRm = await sceneState(p);
  await p.click('.scn-tg[data-toggle="rm"]'); await p.click('.scn-tg[data-toggle="px"]'); await p.waitForTimeout(900);
  const noPx = await sceneState(p);
  await p.click('.scn-tg[data-toggle="px"]'); await p.waitForTimeout(900);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-spazio-eta-moderna.png` }).catch(() => {});
  await ctx.close();
  const kinds = (st) => [...new Set((st.items ?? []).map((i) => i.kind))].sort().join();
  const rm01 = both.items?.find((i) => i.id === "RM01");
  return { pass: kinds(both) === "proxy,rm" && rm01?.as === "mesh" && kinds(noRm) === "proxy" && kinds(noPx) === "rm"
      && /RM Rilievo 2026/.test(both.overlay ?? "") && !errors.length,
    detail: { both: both.items, overlay: both.overlay, noRm: noRm.items, noPx: noPx.items, errors } };
});
test("S3.empty", "Spazio · l'epoca senza nulla mostra lo stato vuoto, che dice come aggiungere (sync con Blender, un glb)", async () => {
  const { p, ctx, errors } = await open({ doc: "spazio", ws: "space" });
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
  const st = await spaceOn(p, "EP_ROM");
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-spazio-eta-imperiale-vuota.png` }).catch(() => {});
  await ctx.close();
  return { pass: /Nessun 3D per Età imperiale/.test(st.empty ?? "") && /Blender/.test(st.empty ?? "") && /glb/.test(st.empty ?? "")
      && !(st.items ?? []).length && /senza: SF100/.test(st.overlay ?? "") && !errors.length, detail: { ...st, errors } };
});
test("S3.pick", "Spazio · un clic su un proxy seleziona l'unità: Ispettore e Matrix la seguono", async () => {
  const { p, ctx, errors } = await open({ doc: "spazio", ws: "space" });
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
  const st = await spaceOn(p, "EP_MED");
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-spazio-medioevo-soli-proxy.png` }).catch(() => {});
  const at = await p.evaluate(() => document.querySelector(".scn-host").__spaceScreenOf("USM101"));
  const cam0 = st.camera;
  if (at) await p.mouse.click(at.x, at.y + 20);
  await p.waitForTimeout(700);
  const selected = await p.evaluate(() => window.__EM_DRAG__.selected()[0] ?? null);
  const insp = await p.evaluate(() => document.querySelector(".insp-name-input")?.value ?? null);
  const after = await sceneState(p);
  await ctx.close();
  return { pass: !!at && selected === "USM101" && insp === "USM101" && after.labels.some((l) => l.t === "USM101" && /sel/.test(l.cls))
      && JSON.stringify(cam0) === JSON.stringify(after.camera) && !errors.length,
    detail: { at, selected, insp, labels: after.labels, cam0, cam1: after.camera, errors } };
});
test("S3.files", "Spazio · un file solo referenziato è un contorno con l'etichetta; uno dichiarato e assente, l'etichetta; il riepilogo li conta", async () => {
  const { p, ctx, errors } = await open({ doc: "spazio", ws: "space" });
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
  const med = await spaceOn(p, "EP_MED");
  const mod = await spaceOn(p, "EP_MOD");
  await ctx.close();
  const by = (st, id) => st.items?.find((i) => i.id === id);
  return { pass: by(med, "RSF100b")?.as === "contour" && by(med, "US103")?.as === "label" && by(med, "USV106")?.as === "mesh"
      && by(med, "USM101")?.as === "mesh" && by(mod, "RM02")?.as === "contour" && by(mod, "US102")?.as === "mesh"
      && med.labels.some((l) => /RSF100b: file solo referenziato/.test(l.t) && /ref/.test(l.cls))
      && med.labels.some((l) => /US103: dichiarato, file assente/.test(l.t))
      && /senza: US104/.test(med.overlay) && /file mancante: US103/.test(med.overlay) && /solo referenziato: RSF100b/.test(med.overlay)
      && !errors.length,
    detail: { med: med.items, mod: mod.items, overlay: med.overlay, labels: med.labels, errors } };
});
test("S3.shared", "Spazio · l'epoca è condivisa con la Cronologia: sceglierla in una la sceglie nell'altra; ⤢ reinquadra, cambiare epoca no", async () => {
  const { p, ctx, errors } = await open({ doc: "spazio", ws: "space" });
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
  // the epoch's Inspector opens the Chronology (one of its four doors)
  await spaceOn(p, "EP_MOD");
  await p.click('.insp-chrono [data-action="check-chronology"]');
  await p.waitForTimeout(900);
  await spaceOn(p, "EP_MED");
  const chrMarks = await p.evaluate(() => [...document.querySelectorAll(".chr-row.sel")].map((g) => g.dataset.chsel));
  // a click on the epoch's bar in the Chronology (the bar, not the row's empty box)
  await p.click('g[data-chsel="EP_ROM"] rect');
  await p.waitForTimeout(900);
  const sceneEpoch = (await sceneState(p)).epoch;
  const cam0 = (await sceneState(p)).camera;
  await spaceOn(p, "EP_MOD");
  const cam1 = (await sceneState(p)).camera;
  // orbit a little, then ⤢
  const r = await p.evaluate(() => { const c = document.querySelector(".scn-host canvas").getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
  await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x + 120, r.y + 30, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(400);
  const moved = (await sceneState(p)).camera;
  await p.click('.scn-tg[data-frame]'); await p.waitForTimeout(500);
  const framed = (await sceneState(p)).camera;
  await ctx.close();
  return { pass: chrMarks.includes("EP_MED") && sceneEpoch === "EP_ROM" && JSON.stringify(cam0) === JSON.stringify(cam1)
      && JSON.stringify(moved) !== JSON.stringify(cam1)
      && JSON.stringify(framed) !== JSON.stringify(moved) && !errors.length,
    detail: { chrMarks, sceneEpoch, cam0, cam1, moved, framed, errors } };
});

// ── NIGHT-SPAZIO · parte 4 · la finestra di servizio, e ogni Doc il suo documento
/** the Doc windows on screen: their document, their role, what they draw */
const docWins = (p) => p.evaluate(() => window.__EM_DRAG__.wins().filter((w) => w.type === "doc").map((w) => {
  const area = document.querySelector(`[data-win="${w.id}"]`);
  return { id: w.id, doc: w.state["current.doc"] ?? null, role: w.state["current.doc.role"] ?? null,
    service: !!area?.querySelector(".win-svc"), keep: !!area?.querySelector("[data-svc-keep]"),
    medium: area?.querySelector(".rd-3d-host") ? "3d" : area?.querySelector(".rd-img, .rd-image, img.rd-stage-img, .rd-2d") ? "image"
      : area?.querySelector(".rd-text, .rd-passage") ? "text" : null };
}));
test("S4.keep", "Spazio · un RM (3D) dalla Tabella apre la finestra di servizio; «Tieni» la fa tua; una foto dall'ispettore va in una NUOVA finestra di servizio e il 3D resta", async () => {
  const { p, ctx, errors } = await open({ doc: "spazio", ws: "space" });
  await p.waitForSelector('[data-open-doc="D2"]', { timeout: 15000 });
  const before = await docWins(p);
  await p.click('[data-open-doc="D2"]');
  await p.waitForTimeout(1500);
  const opened = await docWins(p);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s4-servizio-prima-di-tieni.png` }).catch(() => {});
  await p.locator("[data-svc-keep]").first().click().catch(() => {});
  await p.waitForTimeout(500);
  const kept = await docWins(p);
  // a photo, asked from the Inspector: a reading of P_H on D.3
  await pick(p, "USM101");
  await p.locator('[data-add-reading="P_H"]').first().click();
  await p.waitForTimeout(300);
  await p.locator(".addm-item", { hasText: "D.3 ·" }).first().click();
  await p.waitForTimeout(1500);
  const after = await docWins(p);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s4-servizio-dopo-tieni.png` }).catch(() => {});
  await ctx.close();
  const o = opened.find((w) => w.doc === "D2");
  const k = kept.find((w) => w.id === o?.id);
  const a3d = after.find((w) => w.id === o?.id);
  const photo = after.find((w) => w.doc === "D3");
  return { pass: !before.length && opened.length === 1 && o?.service && o?.keep && k && !k.service && k.role === "user"
      && a3d?.doc === "D2" && after.length === 2 && photo && photo.id !== o.id && photo.service && !errors.length,
    detail: { before, opened, kept, after, errors } };
});
test("S4.sources", "Fonti · la richiesta usa la Doc dello spazio (nessuna finestra nuova); due Doc tengono due documenti", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", ws: "provenance" });
  const w0 = await docWins(p);
  await pick(p, "USM101");
  await p.locator('[data-add-reading="P_H"]').first().click();
  await p.waitForTimeout(300);
  await p.locator(".addm-item", { hasText: "D.3 ·" }).first().click();
  await p.waitForTimeout(1200);
  const w1 = await docWins(p);
  // a second Doc, opened by hand (split of the first), on another document
  const second = await p.evaluate((id) => window.__EM_DRAG__.splitDoc?.(id) ?? null, w1[0]?.id);
  await p.waitForTimeout(600);
  if (second) {
    await p.selectOption(`[data-win="${second}"] select.doc-pick`, "D1").catch(() => {});
    await p.waitForTimeout(600);
  }
  const w2 = await docWins(p);
  await ctx.close();
  const main = w2.find((w) => w.id === w1[0]?.id), other = w2.find((w) => w.id === second);
  return { pass: w0.length === 1 && w1.length === 1 && w1[0].doc === "D3" && !w1[0].service
      && main?.doc === "D3" && other?.doc === "D1" && other?.role === "user" && !errors.length,
    detail: { w0, w1, second, w2, errors } };
});

// ── NIGHT-SPAZIO · parte 5 · eliminare un'epoca e travasarne il contenuto ────
// `testdata/travaso.em.json` = catena + a phase «Medioevo · fase 1» (with
// RSF100b in it) and an RM of the Medioevo: the epoch holds two units
// (USM101, USV106), one phase and one RM.
const epochEdges = (p) => p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).edges
  .filter((e) => ["has_first_epoch", "survive_in_epoch", "has_sub_epoch", "has_representation_model"].includes(e.edge_type))
  .map((e) => `${e.source} ${e.edge_type} ${e.target}`).sort());
test("S5.dissolve", "Cronologia · «Elimina…» dice cosa contiene (2 unità · 1 fase · 1 RM), travasa in Età imperiale in un passo, e «Annulla» riporta tutto", async () => {
  const { p, ctx, errors } = await open({ doc: "travaso" });
  const before = await epochEdges(p);
  const nodes0 = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  await pick(p, "EP_MED");
  await p.click('.insp-chrono [data-action="check-chronology"]');
  await p.waitForTimeout(800);
  await p.click('button.chr-del-ask[data-chdel="EP_MED"]');
  await p.waitForTimeout(400);
  const row = await p.evaluate(() => {
    const b = document.querySelector('[data-chdel-row="EP_MED"]');
    const h = b?.querySelector(".chr-del-holds");
    return b ? { text: b.textContent, units: h?.dataset.units, phases: h?.dataset.phases, rms: h?.dataset.rms,
      options: [...b.querySelectorAll("select option")].map((o) => o.value) } : null;
  });
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s5-cronologia-elimina.png` }).catch(() => {});
  const u0 = await p.evaluate(() => window.__EM_DRAG__.undoDepth());
  await p.selectOption('select[data-chdelto="EP_MED"]', "EP_ROM");
  await p.click('button[data-chdelgo="EP_MED"]');
  await p.waitForTimeout(1500);
  const u1 = await p.evaluate(() => window.__EM_DRAG__.undoDepth());
  const after = await epochEdges(p);
  const gone = await p.evaluate(() => !window.__EM_DRAG__.node("EP_MED"));
  const toast = await p.evaluate(() => document.getElementById("toast")?.innerText ?? "");
  await p.click("#toast .toast-action").catch(() => {});
  await p.waitForTimeout(1200);
  const back = await epochEdges(p);
  const nodes2 = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  await ctx.close();
  const want = ["D2 has_representation_model RM_MED", "EP_ROM has_representation_model RM_MED", "EP_ROM has_sub_epoch PH_MED1",
    "RSF100b has_first_epoch PH_MED1", "USM101 has_first_epoch EP_ROM", "USV106 has_first_epoch EP_ROM"];
  return { pass: row?.units === "2" && row?.phases === "1" && row?.rms === "1" && !row.options.includes("EP_MED") && !row.options.includes("PH_MED1")
      && gone && u1 - u0 === 1 && want.every((w) => after.includes(w)) && !after.some((e) => /EP_MED/.test(e))
      && /Medioevo eliminata · 2 unità, 1 fase, 1 RM passano a Età imperiale/.test(toast) && /Annulla/.test(toast) && JSON.stringify(back) === JSON.stringify(before) && nodes2 === nodes0 && !errors.length,
    detail: { row, before, after, back, u0, u1, toast, nodes0, nodes2, errors } };
});
test("S5.doors", "«Elimina e travasa…» anche nel menu della corsia e nell'ispettore dell'epoca; una fase che esce dall'epoca offre «Elimina e travasa in <epoca>…»", async () => {
  const { p, ctx, errors } = await open({ doc: "travaso" });
  await pick(p, "EP_MED");
  const inInsp = await p.evaluate(() => !!document.querySelector('.insp-chrono [data-action="dissolve-epoch"]'));
  await p.click('.insp-chrono [data-action="dissolve-epoch"]');
  await p.waitForTimeout(800);
  const opened = await p.evaluate(() => !!document.querySelector('[data-chdel-row="EP_MED"]'));
  // the lane menu: right click on a lane's header
  const lane = await p.evaluate(() => { const r = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0].getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; });
  let laneItem = false;
  for (const fy of [0.15, 0.4, 0.6]) {
    await p.mouse.click(lane.x + 60, lane.y + lane.h * fy, { button: "right" });
    await p.waitForTimeout(350);
    laneItem = await p.evaluate(() => [...document.querySelectorAll(".ctx-menu button")].some((b) => /Elimina e travasa/.test(b.textContent)));
    await p.keyboard.press("Escape");
    if (laneItem) break;
  }
  // move the phase out of its epoch: its card offers the dissolve INTO the epoch
  await p.evaluate(() => window.__EM_DRAG__.edit("PH_MED1", { data: { start_time: 700, end_time: 1100 } }));
  await p.waitForTimeout(800);
  const spill = await p.evaluate(() => [...document.querySelectorAll('.chr-card.other [data-remedy="dissolve"]')].map((b) => ({ t: b.textContent, id: b.dataset.chdel })));
  if (spill.length) {
    await p.click('.chr-card.other [data-remedy="dissolve"]');
    await p.waitForTimeout(500);
  }
  const preset = await p.evaluate(() => document.querySelector('select[data-chdelto="PH_MED1"]')?.value ?? null);
  await ctx.close();
  return { pass: inInsp && opened && laneItem && spill.some((x) => /Elimina e travasa in Medioevo/.test(x.t) && x.id === "PH_MED1") && preset === "EP_MED" && !errors.length,
    detail: { inInsp, opened, lane, laneItem, spill, preset, errors } };
});

// ── NIGHT-SPAZIO · parte 6 · i fogli della Tabella ──────────────────────────
/** the sheet menu of the first Table window: groups, labels, counts, notes */
async function sheetMenu(p) {
  const bar = p.locator('[data-win] .tile-bar', { has: p.locator(".win-mode-toggle") }).filter({ hasText: /Tabular|Tabella/ }).first();
  const open = () => p.evaluate(() => [...document.querySelectorAll(".dd-menu:not(.hidden)")].some((m) => m.querySelector("[data-sheet]")));
  if (!(await open())) await bar.locator(".win-mode-toggle").click();
  await p.waitForTimeout(250);
  if (!(await open())) { await bar.locator(".win-mode-toggle").click(); await p.waitForTimeout(250); }
  const items = await p.evaluate(() => {
    const m = [...document.querySelectorAll(".dd-menu:not(.hidden)")].pop();
    const out = [];
    let group = null;
    for (const c of m?.children ?? []) {
      if (c.classList.contains("dd-group")) { group = c.textContent; continue; }
      if (c.tagName !== "BUTTON") continue;
      out.push({ group, label: c.querySelector(".dd-label")?.textContent ?? c.textContent,
        count: c.querySelector(".dd-count")?.textContent ?? null, note: c.querySelector(".dd-note")?.textContent ?? null,
        sheet: c.dataset.sheet ?? null });
    }
    return out;
  });
  return { bar, items };
}
test("S6.sheets", "Tabella · due gruppi (Schede, Viste calcolate), ogni voce con il conteggio e una riga che dice cosa contiene; i conteggi coincidono con le righe", async () => {
  const { p, ctx, errors } = await open({ doc: "spazio" });
  const { items } = await sheetMenu(p);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s6-menu-fogli.png` }).catch(() => {});
  await p.keyboard.press("Escape");
  const shown = {};
  for (const it of items) {
    if (!it.sheet) continue;
    await sheetMenu(p);
    await p.locator(`.dd-menu:not(.hidden) button[data-sheet="${it.sheet}"]`).first().click({ timeout: 4000 });
    await p.waitForTimeout(500);
    shown[it.sheet] = await p.evaluate(() => {
      const f = [...document.querySelectorAll(".tile-tablebody .fcount")].map((x) => x.textContent)[0] ?? null;
      return f ? Number((/\d+/.exec(f) ?? ["-1"])[0]) : null;
    });
  }
  await ctx.close();
  const groups = [...new Set(items.map((i) => i.group))];
  const sheets = items.filter((i) => i.group === "Schede").map((i) => i.label);
  const views = items.filter((i) => i.group === "Viste calcolate").map((i) => i.label);
  const counted = items.every((i) => i.count != null && i.note && Number(i.count) === shown[i.sheet]);
  return { pass: groups.join() === "Schede,Viste calcolate" && ["Unità", "Epoche", "Documenti", "Claims", "Autori"].every((x) => sheets.includes(x))
      && views.join() === "Datazioni,Avvisi,Modelli e proxy" && !items.some((i) => i.label === "Cronologia") && counted && !errors.length,
    detail: { items, shown, errors } };
});
test("S6.datings", "Tabella · «Datazioni» (già «Cronologia») ha i dati di prima: una riga per unità, TPQ/TAQ e datazioni", async () => {
  const { p, ctx, errors } = await open({ doc: "catena" });
  const { bar } = await sheetMenu(p);
  await p.locator(".dd-menu:not(.hidden) button", { hasText: /^(Datazioni|Cronologia)/ }).first().click();
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const b = document.querySelector(".tile-tablebody");
    return { head: [...(b?.querySelectorAll("thead th") ?? [])].map((x) => x.textContent.trim()),
      rows: [...(b?.querySelectorAll("tbody tr") ?? [])].map((x) => x.innerText.replace(/\s+/g, " ").trim()),
      label: document.querySelector('[data-win] .win-mode-label')?.textContent ?? null };
  });
  await ctx.close();
  // «i dati di prima»: the rows the «Cronologia» sheet drew before the rename,
  // measured on the tree of 8b275ee and kept beside the report (DATINGS_BEFORE)
  const beforeAt = process.env.DATINGS_BEFORE;
  const before = beforeAt && existsSync(beforeAt) ? JSON.parse(readFileSync(beforeAt, "utf8")) : null;
  if (process.env.DATINGS_WRITE) writeFileSync(process.env.DATINGS_WRITE, JSON.stringify(r, null, 1));
  return { pass: r.label === "Datazioni" && r.rows.length === 5 && ["Scritta", "Dai reperti", "Propagata"].every((h) => r.head.includes(h))
      && (!before || JSON.stringify(before.rows) === JSON.stringify(r.rows)) && !errors.length,
    detail: { ...r, sameAsBefore: before ? JSON.stringify(before.rows) === JSON.stringify(r.rows) : "not measured", errors } };
});

// ── NIGHT-SPAZIO · parte 7 · la barra ───────────────────────────────────────
/** the master bar as drawn: its rows (tops of the visible children), overflow,
 *  and where the version is */
const barState = (p) => p.evaluate(() => {
  const bar = document.getElementById("toolbar");
  const kids = [...bar.children].filter((c) => c.offsetParent !== null && getComputedStyle(c).display !== "none");
  // one row = the children's vertical centres agree (heights differ: the mark, a tab)
  const mids = kids.map((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2; });
  const tops = mids.filter((m, i) => !mids.slice(0, i).some((x) => Math.abs(x - m) < 6));
  // …and nothing is cut: every workspace tab (and «+») ends inside the window
  const cut = [...bar.querySelectorAll("#workspace-bar > *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5
    || e.getBoundingClientRect().right > bar.getBoundingClientRect().right + 0.5).map((e) => e.textContent.trim());
  const brand = document.getElementById("brand");
  const verInBar = [...bar.querySelectorAll("*")].filter((e) => e.offsetParent !== null && /\d+\.\d+\.\d+/.test(e.childNodes.length === 1 ? e.textContent : ""))
    .map((e) => e.id || e.className);
  const wb = document.getElementById("workspace-bar");
  return { h: Math.round(bar.getBoundingClientRect().height), rows: tops.length, cut,
    overflow: Math.max(bar.scrollWidth - bar.clientWidth, wb ? wb.scrollWidth - wb.clientWidth : 0),
    verInBar, brandTitle: brand?.title ?? null, status: document.getElementById("footer-brand")?.innerText.replace(/\s+/g, " ").trim() ?? null };
});
test("S7.bar", "la barra: la versione esce (tooltip del marchio, barra di stato, Informazioni); a 1024 px una riga sola, come a 1600", async () => {
  const out = {};
  for (const w of [1024, 1600]) {
    const { p, ctx, errors } = await open({ doc: "catena", w, h: 800 });
    out[w] = { ...(await barState(p)), errors };
    await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s7-barra-${w}.png`, clip: { x: 0, y: 0, width: w, height: 110 } }).catch(() => {});
    if (w === 1600) {
      await p.evaluate(() => document.getElementById("btn-help-about")?.click());
      await p.waitForTimeout(300);
      out.about = await p.evaluate(() => document.getElementById("help-pop")?.innerText ?? "");
    }
    await ctx.close();
  }
  const good = (b) => b.rows === 1 && b.overflow <= 0 && !b.cut.length && !b.verInBar.length && /EMStudio 1\.6/.test(b.brandTitle ?? "")
    && /Extended Matrix 1\.6/.test(b.brandTitle ?? "") && /Extended Matrix 1\.6 · EMStudio 1\.6/.test(b.status ?? "") && !b.errors.length;
  return { pass: good(out[1024]) && good(out[1600]) && out[1024].h === out[1600].h && /1\.6\.0/.test(out.about ?? ""), detail: out };
});

test("S4.graph", "Stratigrafia · un doppio clic su un documento nel Matrix lo apre nella finestra di servizio, accanto al grafo", async () => {
  const { p, ctx, errors } = await open({ doc: "catena" });
  const win = await winOf(p, "graph");
  let ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  let box = ws.boxes.find((b) => b.id === "D3" || b.id.startsWith("D3"));
  // CAMPAGNA · the Matrix opens on its FIRST epoch with nodes now (difetto 13):
  // a document further down is brought on screen as a person would, with «0»
  if (box && box.y + box.h > 1000) {
    await p.keyboard.press("0");
    await p.waitForTimeout(500);
    ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
    box = ws.boxes.find((b) => b.id === "D3" || b.id.startsWith("D3"));
  }
  if (box) await p.mouse.dblclick(box.x + box.w / 2, box.y + box.h / 2);
  await p.waitForTimeout(1200);
  const docs = await docWins(p);
  await ctx.close();
  return { pass: !!box && docs.length === 1 && docs[0].doc === "D3" && docs[0].service && !errors.length, detail: { box, docs, errors } };
});

// ── MICRO-UN-POSTO · parte 1 · importare con una mappatura: una porta sola ───
const TAB = () => `${FS_ROOT}/tabelle`;
/** the editor as the door leaves it: who filled it, and its three questions */
const doorState = (p) => p.evaluate(() => {
  const ed = document.getElementById("mapping-editor");
  const float = document.getElementById("tool-float");
  const radios = (n) => [...ed.querySelectorAll(`input[name=${n}]`)].map((i) => ({ v: i.value, on: i.checked, off: i.disabled,
    label: i.parentElement.textContent.trim() }));
  return {
    open: !!ed && !ed.classList.contains("hidden") && !float.classList.contains("hidden"),
    from: ed.querySelector("[data-from]")?.dataset.from ?? "file",
    path: ed.querySelector('[data-field="source-path"]')?.value ?? null,
    mapping: radios("me-mapping").find((r) => r.on)?.v ?? null,
    target: radios("me-target").find((r) => r.on)?.v ?? null,
    landings: radios("me-landing"),
  };
});
const fileMenuDoor = (p) => p.evaluate(() => document.getElementById("btn-import-mapping").click());
test("U1.door", "File ▸ Importa ▸ Tabella con mappatura apre il Mapping editor; tre scelte con un vocabolario; Strumenti non ha una seconda porta", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const inImport = await p.evaluate(() => {
    const b = document.getElementById("btn-import-mapping");
    const sub = b?.closest(".dd-sub");
    return { sub: sub?.querySelector(".dd-sub-toggle")?.textContent.trim() ?? null, text: b?.textContent.trim(),
             tools: !!document.querySelector("#dd-tools #btn-tool-mapping"), graphml: !!sub?.querySelector("#btn-import-graphml") };
  });
  await fileMenuDoor(p);
  await p.waitForTimeout(400);
  const st = await doorState(p);
  await ctx.close();
  const labels = st.landings.map((l) => l.label);
  return { pass: /^Importa/.test(inImport.sub ?? "") && inImport.text === "Tabella con mappatura…" && inImport.graphml && !inImport.tools
      && st.open && st.from === "file"
      && JSON.stringify(labels) === JSON.stringify(["Provvisoria", "Scritta nel grafo", "Allegata come file ausiliario"]),
    detail: { inImport, st } };
});
test("U1.aux", "EMtree ▸ «Allega…» su un file ausiliario apre lo STESSO editor, con quel file, su questo grafo, «Allegata»", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const id = await p.evaluate((l) => window.__EM_DRAG__.auxAdd({ locator: `${l}/usm.csv`,
    options: { mappingPath: `${l}/usm_mapping.json` } }), TAB());
  await p.waitForTimeout(400);
  await p.locator(`[data-aux-map="${id}"]`).first().click();
  await p.waitForTimeout(500);
  const st = await doorState(p);
  await ctx.close();
  return { pass: st.open && st.from === "aux" && st.path === `${TAB()}/usm.csv` && st.mapping === "file" && st.target === "this"
      && st.landings.find((l) => l.on)?.v === "attached",
    detail: st };
});
test("U1.sm", "StratiMiner ▸ «converti» apre lo STESSO editor con le proposte (dati AI da verificare), senza mappatura", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await p.evaluate(() => document.getElementById("btn-tool-stratiminer").click());
  await p.waitForSelector("#sm-xlsx");
  await p.fill("#sm-xlsx", `${TAB()}/em_data.xlsx`);
  await p.dispatchEvent("#sm-xlsx", "change");
  await p.evaluate(() => { const b = document.getElementById("sm-transform"); b.disabled = false; b.click(); });
  await p.waitForTimeout(500);
  const st = await doorState(p);
  const banner = await p.evaluate(() => document.querySelector("#mapping-editor [data-from]")?.textContent ?? "");
  await ctx.close();
  return { pass: st.open && st.from === "stratiminer" && st.path === `${TAB()}/em_data.xlsx` && st.mapping === "none" && /AI/.test(banner),
    detail: { st, banner } };
});
/** fill the door by hand: a csv, its mapping file, the graph open now, a landing */
async function doorApply(p, landing) {
  await fileMenuDoor(p);
  await p.waitForTimeout(400);
  await p.fill('#mapping-editor [data-field="source-path"]', `${TAB()}/usm.csv`);
  await p.dispatchEvent('#mapping-editor [data-field="source-path"]', "change");
  await p.check('#mapping-editor input[name=me-mapping][value=file]');
  await p.waitForTimeout(150);
  await p.fill('#mapping-editor [data-field="mapping-ref"]', `${TAB()}/usm_mapping.json`);
  await p.dispatchEvent('#mapping-editor [data-field="mapping-ref"]', "change");
  await p.check('#mapping-editor input[name=me-target][value=this]');
  await p.check(`#mapping-editor input[name=me-landing][value=${landing}]`);
  await p.waitForTimeout(150);
  const u0 = await p.evaluate(() => window.__EM_DRAG__.undoDepth());
  const n0 = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
  await p.click('#mapping-editor [data-action="apply"]');
  await p.waitForTimeout(2500);
  const u1 = await p.evaluate(() => window.__EM_DRAG__.undoDepth());
  const g = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()));
  return { u0, u1, n0, n1: g.nodes.length, volatile: g.nodes.filter((n) => n.data?.aux_volatile).length };
}
test("U1.undo", "un'applicazione sul grafo aperto = UN passo di undo (scritta nel grafo; allegata); Annulla la toglie tutta", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const baked = await doorApply(p, "baked");
  await p.evaluate(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(300);
  const back = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
  const attached = await doorApply(p, "attached");
  const rows = await p.evaluate(() => document.querySelectorAll("[data-aux-unmap]").length);
  await ctx.close();
  return { pass: baked.u1 - baked.u0 === 1 && baked.n1 === baked.n0 + 1 && !baked.volatile && back === baked.n0
      && attached.u1 - attached.u0 === 1 && attached.volatile === 1,
    detail: { baked, back, attached, rows } };
});

// ── MICRO-UN-POSTO · parte 2 · la posizione del sito: un posto solo ─────────
/** the selector, filled with numbers and confirmed */
async function placeSite(p, from, lat, lon) {
  await p.locator(`${from} [data-action="site-set"]`).first().click();
  await p.waitForSelector(".site-picker", { timeout: 5000 });
  await p.fill('.site-picker [data-field="lat"]', String(lat));
  await p.fill('.site-picker [data-field="lon"]', String(lon));
  await p.dispatchEvent('.site-picker [data-field="lon"]', "change");
  await p.click('.site-picker [data-action="use"]');
  await p.waitForTimeout(400);
}
const siteNow = (p) => p.evaluate(() => {
  const g = JSON.parse(window.__EM_DRAG__.graphJson());
  const root = g.nodes.find((n) => n.node_type === "graph");
  return { root: root?.id ?? null, sp: root?.data?.site_position ?? null, selected: window.__EM_DRAG__.selected()[0] ?? null,
    lines: [...document.querySelectorAll(".site-line")].map((l) => ({ win: l.closest("[data-win]")?.dataset.win ?? "", site: l.dataset.site })),
    inInspector: !!document.querySelector('[data-win$=":inspector"] [data-section="site-position"]'),
    ids: document.querySelectorAll("#insp-site-position").length };
});
test("U2.site", "la posizione scelta da Study, ispettore del grafo, narrativa o embed mappa finisce in site_position e si vede negli altri", async () => {
  const { p, ctx, errors } = await open({ doc: "catena" });
  // the Study: a window of the stratigraphy space turned into one
  const outl = await winOf(p, "outliner");
  await p.evaluate((w) => window.__EM_DRAG__.retype(w, "study"), outl);
  await p.waitForTimeout(500);
  await placeSite(p, `[data-win="${outl}"]`, 42.3727, 12.4003);
  const a = await siteNow(p);
  // …the inspector of the graph node, where the selector opened it
  await placeSite(p, '[data-win$=":inspector"]', 42.2946, 12.4109);
  const b = await siteNow(p);
  // the story: its map block, and the map embed's section in the inspector —
  // a map block pointing at the graph, put in the first chapter as the Blocks
  // menu would (`addEmbed`)
  await narrativeSpace(p);
  await p.evaluate((root) => {
    const g = JSON.parse(window.__EM_DRAG__.graphJson());
    const nv = g.nodes.find((n) => n.node_type === "narrative");
    const data = JSON.parse(JSON.stringify(nv.data));
    data.chapters[0].blocks = [{ block_type: "embed", ref: root, view_type: "map" }, ...(data.chapters[0].blocks ?? [])];
    window.__EM_DRAG__.edit(nv.id, { data });
  }, b.root);
  await p.waitForTimeout(600);
  const story = await p.evaluate(() => {
    const m = document.querySelector(".nv-map");
    return { map: !!m, btn: !!m?.querySelector('[data-action="site-set"]') };
  });
  let c = null, d = null;
  if (story.btn) {
    await placeSite(p, ".nv-map", 42.46, 12.3862);
    c = await siteNow(p);
    await workspace(p, "narrative");
    await p.locator(".nv-map").first().click();
    await p.waitForTimeout(400);
    const inMap = await p.evaluate(() => !!document.querySelector('.ninsp-s [data-action="site-set"]'));
    if (inMap) { await placeSite(p, ".ninsp-s", 42.345, 12.356); d = await siteNow(p); }
  }
  await ctx.close();
  const at = (x, lat) => x && Math.abs(x.sp?.lat - lat) < 1e-6;
  return { pass: at(a, 42.3727) && a.selected === a.root && a.inInspector && a.lines.some((l) => l.site.startsWith("42.3727"))
      && at(b, 42.2946) && b.lines.every((l) => l.site.startsWith("42.2946")) && b.lines.length >= 2
      && at(c, 42.46) && at(d, 42.345) && !a.ids && !errors.length,
    detail: { a, b, story, c, d, errors } };
});

// ── MICRO-UN-POSTO · parte 3 · via l'angolo IIIF del vecchio annotatore ──────
test("U3.webanno", "la Doc di un'immagine ha nel «⋯» «Copia le regioni come Web Annotation»: senza IIIF dice perché, con IIIF copia una AnnotationPage", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const gone = await p.evaluate(() => ({ corner: !!document.getElementById("annotator-iiif"), panel: !!document.getElementById("annotator-panel"),
    mirador: !!document.getElementById("set-mirador") }));
  await openDocImage(p);
  // one region, traced as 5.bubble traces it
  await p.click('.rd-tools [data-tool="rect"]');
  await p.waitForTimeout(200);
  const img = await p.evaluate(() => { const r = document.querySelector(".rd-img svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.mouse.move(img.x + img.w * 0.3, img.y + img.h * 0.3); await p.mouse.down();
  await p.mouse.move(img.x + img.w * 0.5, img.y + img.h * 0.45, { steps: 3 }); await p.mouse.up();
  await p.waitForTimeout(300);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(600);
  const docWin = `[data-win="${await winOf(p, "doc")}"]`;
  const menuItem = async () => {
    await p.click(`${docWin} .win-more`);
    await p.waitForTimeout(150);
    return p.locator(".dd-menu:not(.hidden) button", { hasText: "Web Annotation" }).first();
  };
  let item = await menuItem();
  const off = { disabled: await item.getAttribute("aria-disabled"), why: await item.getAttribute("title") };
  await item.evaluate((x) => x.click());
  await p.waitForTimeout(200);
  // an image served by IIIF: its sha256, and a service in the Settings
  await p.evaluate(() => window.__EM_DRAG__.edit("D3", { data: { ...window.__EM_DRAG__.data("D3"), checksum: `sha256:${"ab".repeat(32)}` } }));
  await p.evaluate(() => document.getElementById("btn-settings").click());
  await p.waitForSelector("#settings-modal:not(.hidden)");
  await p.click('#settings-tabs [data-tab-target="viewers"]');
  await p.fill("#set-iiif-base", "https://iiif.test/iiif/3");
  await p.click("#settings-save");
  await p.waitForTimeout(300);
  await p.evaluate(() => { window.__CLIP__ = null; navigator.clipboard.writeText = async (x) => { window.__CLIP__ = x; }; });
  item = await menuItem();
  const on = await item.getAttribute("aria-disabled");
  await item.evaluate((x) => x.click());
  await p.waitForTimeout(300);
  const clip = await p.evaluate(() => window.__CLIP__);
  const toastText = await p.evaluate(() => document.getElementById("toast").innerText);
  await ctx.close();
  const page = clip ? JSON.parse(clip) : null;
  return { pass: !gone.corner && !gone.panel && !gone.mirador && off.disabled === "true" && /IIIF/.test(off.why ?? "") && !on
      && page?.type === "AnnotationPage" && page.items.length === 1
      && page.items[0].target.source === `https://iiif.test/iiif/3/${"ab".repeat(32)}` && /1 region/.test(toastText),
    detail: { gone, off, on, items: page?.items?.length, source: page?.items?.[0]?.target?.source, toastText } };
});

// ── MICRO-UN-POSTO · parte 4 · i tre «prima» senza numero ────────────────────
//
// Each of these runs as it is against an older tree too (`PORT=` a dev server on
// a `git archive` of that commit): what it reads is the PAGE — the canvas's own
// text draws, rectangles, the viewport — never a probe that the old code lacks.

/** Every text drawn on the graph canvases, since the last full clear, in PAGE
 *  coordinates: the draw's transform, the font's size, `measureText`, and the
 *  canvas's `getBoundingClientRect`. */
function textDrawHook() {
  const P = CanvasRenderingContext2D.prototype;
  const fill = P.fillText, clear = P.clearRect;
  const log = new Map();
  window.__TEXT_DRAWS__ = () => {
    const out = [];
    for (const [cv, list] of log) {
      if (!cv.isConnected) continue;
      const r = cv.getBoundingClientRect();
      const k = r.width ? cv.width / r.width : 1;
      for (const d of list) out.push({ text: d.text, x: r.left + d.x / k, y: r.top + d.y / k, w: d.w / k, h: d.h / k, fill: d.fill });
    }
    return out;
  };
  P.clearRect = function (x, y, w, h) {
    if (x <= 0 && y <= 0 && w >= this.canvas.width && h >= this.canvas.height) log.set(this.canvas, []);
    return clear.apply(this, arguments);
  };
  P.fillText = function (text, x, y) {
    try {
      const m = this.getTransform();
      const px = Number((/(\d+(?:\.\d+)?)px/.exec(this.font) ?? [0, 12])[1]);
      const w = this.measureText(text).width;
      const bl = this.textBaseline;
      const top = bl === "middle" ? y - px / 2 : bl === "top" || bl === "hanging" ? y : bl === "bottom" ? y - px : y - px * 0.8;
      const al = this.textAlign;
      const left = al === "center" ? x - w / 2 : al === "right" || al === "end" ? x - w : x;
      const X = m.a * left + m.c * top + m.e, Y = m.b * left + m.d * top + m.f;
      const list = log.get(this.canvas) ?? [];
      list.push({ text: String(text), x: X, y: Y, w: w * m.a, h: px * m.d, fill: String(this.fillStyle) });
      log.set(this.canvas, list);
    } catch { /* a draw we cannot read is not a draw we measure */ }
    return fill.apply(this, arguments);
  };
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
test("U4.phaselabels", "epochs48: nessuna etichetta di fase copre un'etichetta di corsia o un'altra fase (testi disegnati, getBoundingClientRect)", async () => {
  const f = fixture("epochs48");
  const ep = new Map(f.graph.nodes.filter((n) => n.node_type === "EpochNode").map((n) => [n.id, n.name]));
  const phaseIds = new Set(f.graph.edges.filter((e) => e.edge_type === "has_sub_epoch").map((e) => e.target));
  const tops = [...ep].filter(([id]) => !phaseIds.has(id)).map(([, n]) => n);
  const phases = [...ep].filter(([id]) => phaseIds.has(id)).map(([, n]) => n);
  // a phase label is its name, or its name without the epoch's that it repeats
  const phaseTexts = new Set(phases.flatMap((n) => [n, n.split(" · ").pop()]));
  const { p, ctx } = await open({ doc: f, hook: textDrawHook });
  const measure = async () => {
    await p.waitForTimeout(500);
    const draws = await p.evaluate(() => window.__TEXT_DRAWS__());
    const lanes = draws.filter((d) => tops.includes(d.text));
    const bands = draws.filter((d) => phaseTexts.has(d.text) && !tops.includes(d.text));
    let overLane = 0, overBand = 0;
    for (const b of bands) for (const l of lanes) if (overlap(b, l)) overLane++;
    for (let i = 0; i < bands.length; i++) for (let j = i + 1; j < bands.length; j++) if (overlap(bands[i], bands[j])) overBand++;
    return { lanes: lanes.length, bands: bands.length, overLane, overBand };
  };
  const fitted = await measure();
  // …and zoomed in, where the chips have room
  const box = await p.evaluate(() => { const c = [...document.querySelectorAll("canvas")].sort((a, b) =>
    b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0].getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height }; });
  await p.mouse.move(box.x + 300, box.y + 60);
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -240); await p.waitForTimeout(80); }
  const zoomed = await measure();
  await ctx.close();
  return { pass: fitted.lanes > 0 && fitted.bands > 0 && !fitted.overLane && !fitted.overBand && !zoomed.overLane && !zoomed.overBand,
    detail: { fitted, zoomed } };
});

test("U4.lanemenu", "TempluMare: clic destro sull'intestazione di corsia (fermo, trascinato, poi Esc e un movimento) non sposta ciò che è disegnato", async () => {
  const { p, ctx } = await open({ doc: "TempluMare", hook: textDrawHook });
  // what is ON THE PAGE: where a lane's label is drawn, and the canvas's box.
  // Not `__EM_SCENE__().vp`: since AUDIT N2 that view follows the window under
  // the pointer, and a pointer that ends in the Issues table below reads THAT
  // window's camera — a jump that is not on the screen (measured: {0,0,1}).
  const drawn = () => p.evaluate(() => {
    const l = (window.__TEXT_DRAWS__() ?? []).filter((t) => /A\.D\.|B\.C\./.test(t.text)).sort((a, b) => a.text < b.text ? -1 : 1)[0];
    const cv = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0].getBoundingClientRect();
    return `${l ? `${l.text}@${Math.round(l.x)},${Math.round(l.y)}` : "none"} | ${[cv.x, cv.y, cv.width, cv.height].map(Math.round).join(",")} | ${window.scrollY}`;
  });
  const cvr = await p.evaluate(() => { const r = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0].getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; });
  await p.waitForTimeout(400);
  const base = await drawn();
  const moved = [];
  let items = [];
  for (const fy of [0.15, 0.5, 0.85]) {
    const x = cvr.x + 60, y = cvr.y + cvr.h * fy;
    await p.mouse.move(x, y);
    await p.mouse.click(x, y, { button: "right" });
    await p.waitForTimeout(300);
    if (!items.length) items = await p.evaluate(() => [...document.querySelectorAll(".ctx-menu button")].map((b) => b.textContent));
    await p.mouse.move(x + 40, y + 30, { steps: 5 });
    const a = await drawn();
    await p.keyboard.press("Escape");
    await p.mouse.move(x, y);
    await p.mouse.down({ button: "right" });
    await p.mouse.move(x + 6, y + 4, { steps: 3 });
    await p.mouse.up({ button: "right" });
    await p.waitForTimeout(250);
    await p.keyboard.press("Escape");
    await p.mouse.move(x + 150, y + 90, { steps: 8 });
    await p.waitForTimeout(250);
    const b = await drawn();
    if (a !== base || b !== base) moved.push({ fy, a, b });
  }
  await ctx.close();
  return { pass: !base.startsWith("none") && !moved.length && items.some((t) => /cronologia/i.test(t)), detail: { base, moved, items } };
});

// ── MICRO-3DTILES-LOD · parte 1 · i 3D Tiles nel visualizzatore ──────────────
/** open a document of `tiles.em.json` in a Doc (the Fonti space), and wait for
 *  its 3D stage; `fetched()` lists every file the page asked for under testdata/ or /fs/at/ */
async function openTilesDoc(docId, { doc = "tiles", mutate } = {}) {
  let d = fixture(doc);
  if (mutate) d = mutate(d);
  const o = await open({ doc: d, ws: "provenance" });
  const win = await o.p.evaluate((id) => window.__EM_DRAG__.openDoc(id), docId);
  await o.p.waitForFunction((w) => {
    const h = document.querySelector(`[data-win="${w}"] .rd-3d-host`);
    return h && (h.dataset.ready === "1" || h.dataset.gated === "1");
  }, win, { timeout: 20000 });
  // what the page fetched under testdata/ or /fs/at/: the Resource Timing entries
  // (Playwright's request events do not reach this headless shell's fetches)
  // (`bodies`: only the requests that brought a body — a HEAD brings none)
  return { ...o, win, fetched: (bodies = false) => o.p.evaluate((b) => performance.getEntriesByType("resource")
    .filter((e) => !b || e.encodedBodySize > 0).map((e) => e.name)
    .filter((u) => /testdata\/|\/fs\/at\//.test(u)).map((u) => decodeURIComponent(u.replace(/^.*?(testdata\/|\/fs\/at\/)/, ""))), bodies) };
}
const tilesState = (p, win) => p.evaluate((w) => {
  const h = document.querySelector(`[data-win="${w}"] .rd-3d-host`);
  const t = h?.__tiles?.();
  return { tileset: h?.dataset.tileset === "1", model: h?.dataset.model ?? null, lod: h?.dataset.lod ?? null,
    files: t?.files ?? null, status: t?.status ?? null, box: t?.box ?? null, points: t?.points ?? null,
    line: h?.querySelector(".tl-status")?.textContent ?? null, gate: h?.querySelector(".v3d-gate")?.textContent ?? null,
    options: [...(h?.querySelectorAll(".lod-pick option") ?? [])].map((o) => o.textContent) };
}, win);
/** wait until the loaded tile files are exactly `want` (or until time runs out) */
const tilesSettle = async (p, win, pred, ms = 10000) => {
  const t0 = Date.now();
  let st = await tilesState(p, win);
  while (Date.now() - t0 < ms) {
    if (pred(st) && !st.status?.busy) break;
    await p.waitForTimeout(250);
    st = await tilesState(p, win);
  }
  await p.waitForTimeout(400);
  return tilesState(p, win);
};
/** «Più dettaglio qui» armed, then a click on the tile whose content is `uri` */
async function moreHere(p, win, uri) {
  const at = await p.evaluate(([w, u]) => document.querySelector(`[data-win="${w}"] .rd-3d-host`).__tilesScreenOf(u), [win, uri]);
  const armed = await p.evaluate((w) => document.querySelector(`[data-win="${w}"] .tl-more`)?.getAttribute("aria-pressed"), win);
  if (armed !== "true") await p.click(`[data-win="${win}"] .tl-more`);
  if (at) await p.mouse.click(at.x, at.y);
  return at;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

test("T1.root", "3D Tiles · una risorsa `packaging: directory` con porta tileset.json si apre nella Doc, e mostra la radice", async () => {
  const { p, ctx, errors, win, fetched } = await openTilesDoc("D1");
  const st = await tilesSettle(p, win, (s) => (s.files ?? []).length >= 1);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/t1-radice.png` }).catch(() => {});
  const requests = await fetched();
  await ctx.close();
  const glbs = requests.filter((r) => /\.glb$/.test(r));
  return { pass: st.tileset && same(st.files, ["tiles/root.glb"]) && same(st.status?.level, [0, 0])
      && same(glbs, ["tiles-prova/tiles/root.glb"])
      && /livello 0/.test(st.line ?? "") && /1 tile caricati/.test(st.line ?? "") && !errors.length,
    detail: { st, requests, errors } };
});

test("T1.refine", "3D Tiles · in manuale «Più dettaglio qui» carica i figli di QUEL tile e non gli altri; «Meno dettaglio» torna indietro", async () => {
  const { p, ctx, errors, win, fetched } = await openTilesDoc("D1");
  const s0 = await tilesSettle(p, win, (s) => (s.files ?? []).length >= 1);
  // a click on the root: its four children
  await moreHere(p, win, "tiles/root.glb");
  const kids = ["tiles/c0.glb", "tiles/c1.glb", "tiles/c2.glb", "tiles/c3.glb"];
  const s1 = await tilesSettle(p, win, (s) => kids.every((k) => s.files?.includes(k)));
  // a click on c0: c0's four, and NOT c1's child
  await moreHere(p, win, "tiles/c0.glb");
  const g = [0, 1, 2, 3].map((j) => `tiles/c0_${j}.glb`);
  const s2 = await tilesSettle(p, win, (s) => g.every((k) => s.files?.includes(k)));
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/t1-piu-dettaglio.png` }).catch(() => {});
  const asked = [...new Set((await fetched()).filter((r) => /\.glb$/.test(r)))].sort();
  // «Meno dettaglio» twice: back to the root
  await p.click(`[data-win="${win}"] .tl-less`);
  const s3 = await tilesSettle(p, win, (s) => same(s.status?.level, [0, 1]) || same(s.status?.level, [1, 1]));
  await p.click(`[data-win="${win}"] .tl-less`);
  const s4 = await tilesSettle(p, win, (s) => same(s.status?.level, [0, 0]));
  await ctx.close();
  const vis = (s) => s.status?.visible;
  return { pass: same(s0.files, ["tiles/root.glb"])
      && kids.every((k) => s1.files.includes(k)) && !s1.files.some((f) => /c0_|c1_0/.test(f)) && same(s1.status?.level, [1, 1])
      && g.every((k) => s2.files.includes(k)) && same(s2.status?.level, [1, 2])
      // fetched: the root, its four, c0's four — and nothing of c1's (the missing one)
      && same(asked, ["root", ...kids, ...g].map((f) => `tiles-prova/${f === "root" ? "tiles/root.glb" : f}`).sort())
      && same(s4.status?.level, [0, 0]) && vis(s4) === 1 && !errors.length,
    detail: { s0: s0.files, s1: [s1.files, s1.status?.level], s2: [s2.files, s2.status?.level], asked,
      s3: [s3.status?.level, vis(s3)], s4: [s4.status?.level, vis(s4)], errors } };
});
test("T1.empty", "3D Tiles · una radice senza contenuto (3DSC senza LOD: contenuto solo alle foglie) scende da sé al primo livello che ha qualcosa da mostrare", async () => {
  const { p, ctx, errors, win } = await openTilesDoc("D1", { mutate: (d) => {
    for (const n of d.graph.nodes) if (n.id === "RES_TS") n.data.url = "/em/studio/testdata/tiles-cava/tileset.json";
    return d;
  } });
  const st = await tilesSettle(p, win, (s) => (s.files ?? []).length >= 2);
  await ctx.close();
  return { pass: same(st.files, ["../tiles-prova/tiles/c2.glb", "../tiles-prova/tiles/c3.glb"]) && same(st.status?.level, [0, 0])
      && st.status?.asked === 0 && !errors.length, detail: { st, errors } };
});
test("T1.missing", "3D Tiles · un tile il cui file non c'è: la riga di stato lo dice, con il nome del file", async () => {
  const { p, ctx, errors, win } = await openTilesDoc("D1");
  await tilesSettle(p, win, (s) => (s.files ?? []).length >= 1);
  await moreHere(p, win, "tiles/root.glb");
  await tilesSettle(p, win, (s) => (s.files ?? []).includes("tiles/c1.glb"));
  await moreHere(p, win, "tiles/c1.glb");
  const st = await tilesSettle(p, win, (s) => (s.status?.missing ?? []).length > 0);
  await ctx.close();
  return { pass: same(st.status?.missing, ["tiles/mancante/c1_0.glb"]) && /1 tile non trovati \(tiles\/mancante\/c1_0\.glb\)/.test(st.line ?? "")
      && !errors.filter((e) => !/c1_0/.test(e)).length,
    detail: { status: st.status, line: st.line, errors } };
});
test("T1.frame", "3D Tiles · il frame: il tile della radice nel tileset (Z-up, girato di −90° su X) cade dove cade il suo glb aperto come glTF (Y-up)", async () => {
  const { p, ctx, errors, win } = await openTilesDoc("D1");
  const st = await tilesSettle(p, win, (s) => (s.files ?? []).length >= 1);
  // the same glb, as a glTF: GLTFLoader in the page, the box of what it reads
  const gltf = await p.evaluate(async () => {
    const m = await import("/em/studio/src/embed3d-native.ts");
    const { THREE, GLTFLoader } = await m.engine();
    const g = await new GLTFLoader().loadAsync("/em/studio/testdata/tiles-prova/tiles/root.glb");
    const b = new THREE.Box3().setFromObject(g.scene);
    return [...b.min.toArray(), ...b.max.toArray()];
  });
  await ctx.close();
  const r = (a) => (a ?? []).map((x) => Math.round(x * 1e4) / 1e4);
  // Blender Z-up [0,4]×[0,4]×[0,0.6] → Y-up x∈[0,4] y∈[0,0.6] z∈[−4,0]
  return { pass: same(r(st.box), r(gltf)) && same(r(gltf), [0, 0, -4, 4, 0.6, 0]) && !errors.length,
    detail: { tiles: r(st.box), gltf: r(gltf), errors } };
});
test("T1.points", "3D Tiles · una nuvola in tile (pnts, e glTF POINTS nel figlio) si vede come punti", async () => {
  const { p, ctx, errors, win } = await openTilesDoc("D4");
  const s0 = await tilesSettle(p, win, (s) => (s.files ?? []).length >= 1);
  await moreHere(p, win, "punti.pnts");
  const s1 = await tilesSettle(p, win, (s) => (s.files ?? []).includes("punti-fini.glb"));
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/t1-nuvola.png` }).catch(() => {});
  await ctx.close();
  return { pass: same(s0.files, ["punti.pnts"]) && s0.points === 1 && same(s1.files, ["punti-fini.glb", "punti.pnts"]) && s1.points === 2
      && !errors.length, detail: { s0: [s0.files, s0.points], s1: [s1.files, s1.points, s1.box], errors } };
});
test("T1.auto", "3D Tiles · «Automatico» raffina da sé (errore sullo schermo); tornando a «Manuale» si resta al livello caricato", async () => {
  const { p, ctx, errors, win } = await openTilesDoc("D1");
  await tilesSettle(p, win, (s) => (s.files ?? []).length >= 1);
  await p.click(`[data-win="${win}"] .tl-seg [data-mode="auto"]`);
  const a = await tilesSettle(p, win, (s) => (s.files ?? []).includes("tiles/c0_0.glb"));
  await p.click(`[data-win="${win}"] .tl-seg [data-mode="manual"]`);
  await p.waitForTimeout(800);
  const m = await tilesState(p, win);
  await ctx.close();
  return { pass: a.files.includes("tiles/c0_0.glb") && a.status.mode === "auto" && m.status.mode === "manual"
      && same(m.status.level, a.status.level) && m.status.asked > 0 && !errors.filter((e) => !/c1_0/.test(e)).length,
    detail: { auto: [a.files, a.status.level], manual: [m.files, m.status.level, m.status.asked], errors } };
});
test("T1.disk", "3D Tiles · un tileset su disco passa dal bridge per percorso (`/fs/at/`): i tile relativi si risolvono accanto", async () => {
  const root = FS_ROOT ?? (await rootPath());
  const path = `${root}/tileset-disco/tileset.json`;
  const { p, ctx, errors, win, fetched } = await openTilesDoc("D1", { mutate: (d) => {
    for (const n of d.graph.nodes) if (n.id === "RES_TS") n.data.url = path;
    return d;
  } });
  const st = await tilesSettle(p, win, (s) => (s.files ?? []).length >= 1);
  const requests = await fetched();
  await ctx.close();
  return { pass: same(st.files, ["tiles/root.glb"]) && requests.some((r) => r.endsWith("tileset-disco/tiles/root.glb"))
      && /\/fs\/at\//.test(st.model ?? "") && !errors.length, detail: { model: st.model, requests, errors } };
});

test("T1.space", "3D Tiles · nella Scena 3D dello Spazio: il tileset dell'RM si apre alla radice e si raffina; il set LOD al più leggero, col selettore; il glb oltre la soglia chiede e propone il tileset", async () => {
  const { p, ctx, errors } = await open({ doc: "tiles", ws: "space" });
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
  const sc = () => p.evaluate(() => {
    const h = document.querySelector(".scn-host");
    return { items: h.__space(), tiles: h.__spaceTiles?.() ?? [],
      strips: [...h.querySelectorAll(".scn-strips .v3d-strip")].map((s) => ({ id: s.dataset.id, text: s.textContent })),
      labels: [...h.querySelectorAll(".scn-label")].map((l) => l.textContent) };
  });
  const settle = async (pred, ms = 10000) => {
    const t0 = Date.now(); let s = await sc();
    while (Date.now() - t0 < ms && !pred(s)) { await p.waitForTimeout(250); s = await sc(); }
    await p.waitForTimeout(300);
    return sc();
  };
  const by = (s, id) => s.items.find((i) => i.id === id);
  const s0 = await settle((s) => by(s, "RM1")?.as === "tiles" && by(s, "RM2")?.as === "mesh" && by(s, "RM3")?.as === "gated"
    && s.tiles.some((t) => t.files.length));
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/t1-spazio.png` }).catch(() => {});
  // «Più dettaglio qui» on RM1's strip, then a click on its root
  await p.click('.scn-strips .v3d-strip[data-id="RM1"] .tl-more');
  const at = await p.evaluate(() => document.querySelector(".scn-host").__spaceTileScreenOf("tiles/root.glb"));
  if (at) await p.mouse.click(at.x, at.y);
  const s1 = await settle((s) => (s.tiles.find((t) => t.id === "RM1")?.files ?? []).includes("tiles/c3.glb"));
  // RM2: the selector to LOD 1; RM3: «Apri il tileset»
  await p.selectOption('.scn-strips .v3d-strip[data-id="RM2"] .lod-pick', "1");
  await p.click('.scn-strips .v3d-strip[data-id="RM3"] [data-gate="tileset"]');
  const s2 = await settle((s) => /muro_LOD1/.test(by(s, "RM2")?.url ?? "") && by(s, "RM3")?.as === "tiles");
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/t1-spazio-dopo.png` }).catch(() => {});
  await ctx.close();
  const f = (s, id) => s.tiles.find((t) => t.id === id)?.files ?? [];
  return { pass: same(f(s0, "RM1"), ["tiles/root.glb"]) && /muro_LOD3\.glb$/.test(by(s0, "RM2")?.url ?? "")
      && s0.labels.some((l) => /Rilievo intero: oltre la soglia \(858\.3 MB > 200\.0 MB\)/.test(l))
      && same(f(s1, "RM1"), ["tiles/c0.glb", "tiles/c1.glb", "tiles/c2.glb", "tiles/c3.glb", "tiles/root.glb"])
      && /muro_LOD1\.glb$/.test(by(s2, "RM2")?.url ?? "") && by(s2, "RM3")?.as === "tiles" && same(f(s2, "RM3"), ["punti.pnts"])
      && !errors.filter((e) => !/c1_0/.test(e)).length,
    detail: { s0: [s0.items, s0.tiles, s0.labels], s1: s1.tiles, s2: [s2.items, s2.tiles], at, errors } };
});

// ── MICRO-3DTILES-LOD · parte 2 · il LOD più leggero, poi il dettaglio su richiesta
test("T2.lod", "LOD · un set `<base>_LOD0…N` (non un tileset) si apre al LOD più alto, il più leggero; il selettore passa a un altro glb", async () => {
  const { p, ctx, errors, win, fetched } = await openTilesDoc("D2");
  await p.waitForTimeout(600);
  const a = await tilesState(p, win);
  await p.selectOption(`[data-win="${win}"] .lod-pick`, "1");
  await p.waitForFunction((w) => /muro_LOD1\.glb$/.test(document.querySelector(`[data-win="${w}"] .rd-3d-host`)?.dataset.model ?? ""), win, { timeout: 10000 });
  const b = await tilesState(p, win);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/t2-lod.png` }).catch(() => {});
  const glbs = (await fetched(true)).filter((r) => /^lod\/.*\.glb$/.test(r));
  await ctx.close();
  // the whole glbs fetched: LOD3 at the opening, LOD1 on the selector — never LOD0 or LOD2
  return { pass: /muro_LOD3\.glb$/.test(a.model ?? "") && a.lod === "3"
      && same(a.options.map((o) => o.split(" · ")[0]), ["LOD 0", "LOD 1", "LOD 2", "LOD 3"])
      && /muro_LOD1\.glb$/.test(b.model ?? "") && b.lod === "1"
      && same([...new Set(glbs)].sort(), ["lod/muro_LOD1.glb", "lod/muro_LOD3.glb"]) && !errors.length,
    detail: { a: [a.model, a.lod, a.options], b: [b.model, b.lod], glbs, errors } };
});
test("T2.gate", "Soglia · un glb oltre la soglia (le Preferenze) non si carica da solo: si chiede, e si propone il tileset dello stesso modello", async () => {
  const { p, ctx, errors, win, fetched } = await openTilesDoc("D3");
  const g = await tilesState(p, win);
  // (the Fonti Doc showed D.1 before D.3 was asked for: only D.3's glb counts)
  const before = (await fetched()).filter((r) => /catena-muro/.test(r));
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/t2-soglia.png` }).catch(() => {});
  await p.click(`[data-win="${win}"] [data-gate="tileset"]`);
  const t = await tilesSettle(p, win, (s) => (s.files ?? []).length >= 1);
  await ctx.close();
  return { pass: /858\.3 MB, oltre la soglia di 200\.0 MB/.test(g.gate ?? "") && /Apri il tileset/.test(g.gate ?? "")
      && /Caricalo comunque/.test(g.gate ?? "") && !before.length
      && t.tileset && same(t.files, ["punti.pnts"]) && !errors.length,
    detail: { gate: g.gate, before, after: t.files, errors } };
});
test("T2.gateLoad", "Soglia · «Caricalo comunque» carica il glb; sotto la soglia (Preferenze alzate) si apre da solo", async () => {
  const a = await openTilesDoc("D3");
  await a.p.click(`[data-win="${a.win}"] [data-gate="load"]`);
  await a.p.waitForFunction((w) => document.querySelector(`[data-win="${w}"] .rd-3d-host`)?.dataset.ready === "1", a.win, { timeout: 10000 });
  const loaded = await tilesState(a.p, a.win);
  await a.ctx.close();
  const settings = JSON.stringify({ viewer: { lodLimitMB: 2000 } });
  let d = fixture("tiles");
  const o = await open({ doc: d, ws: "provenance", init: { "emstudio.settings": settings } });
  const win = await o.p.evaluate(() => window.__EM_DRAG__.openDoc("D3"));
  await o.p.waitForFunction((w) => { const h = document.querySelector(`[data-win="${w}"] .rd-3d-host`); return h && (h.dataset.ready === "1" || h.dataset.gated === "1"); }, win, { timeout: 15000 });
  const high = await tilesState(o.p, win);
  await o.ctx.close();
  return { pass: /catena-muro\.gltf$/.test(loaded.model ?? "") && !loaded.gate && /catena-muro\.gltf$/.test(high.model ?? "") && !high.gate
      && !a.errors.length && !o.errors.length, detail: { loaded: loaded.model, high: [high.model, high.gate], errors: [...a.errors, ...o.errors] } };
});

// ── MICRO-3DTILES-LOD · parte 3 · «US view» entra nelle Unità ─────────────────
test("T3.column", "Unità · la colonna «First epoch» (già della Vista US) è nelle Unità e si modifica: scrive `has_first_epoch`; la Vista US non c'è più", async () => {
  const { p, ctx, errors } = await open({ doc: "spazio" });
  const { items } = await sheetMenu(p);
  await p.locator('.dd-menu:not(.hidden) button[data-sheet="Units"]').first().click();
  await p.waitForTimeout(600);
  const head = await p.evaluate(() => [...document.querySelectorAll(".tile-tablebody thead th")].map((x) => x.textContent.trim()));
  const sel = 'select[data-col="EPOCH"][data-row="US102"]';
  const before = await p.evaluate(() => window.__EM_DRAG__.nodeInfo("US102").edges.filter((e) => e.type === "has_first_epoch").map((e) => e.target));
  await p.selectOption(sel, "EP_MED");
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => window.__EM_DRAG__.nodeInfo("US102").edges.filter((e) => e.type === "has_first_epoch").map((e) => e.target));
  const shown = await p.evaluate((s) => document.querySelector(s)?.value ?? null, sel);
  await ctx.close();
  return { pass: head.includes("First epoch") && !items.some((i) => i.sheet === "US" || /Vista US|US view/.test(i.label))
      && same(before, ["EP_MOD"]) && same(after, ["EP_MED"]) && shown === "EP_MED" && !errors.length,
    detail: { head, sheets: items.map((i) => i.sheet), before, after, shown, errors } };
});
test("T3.saved", "Unità · uno spazio salvato con una Tabella sulla «US view» si riapre sulle Unità (con la colonna della prima epoca)", async () => {
  // the arrangement as this build saves it, with its table turned to the old sheet
  const a = await open({ doc: "spazio" });
  const saved = await a.p.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); }
    return out;
  });
  await a.ctx.close();
  const reg = JSON.parse(saved["emstudio.windows"] ?? "{}");
  let turned = 0;
  for (const ws of Object.values(reg)) for (const w of ws.wins ?? []) if (w.type === "table") { w.state = { ...(w.state ?? {}), "current.table.sheet": "US" }; turned++; }
  saved["emstudio.windows"] = JSON.stringify(reg);
  saved["emdata.sheet"] = "US";
  const { p, ctx, errors } = await open({ doc: "spazio", init: saved });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => ({
    sheets: window.__EM_DRAG__.wins().filter((w) => w.type === "table").map((w) => w.state["current.table.sheet"] ?? null),
    stored: JSON.parse(localStorage.getItem("emstudio.windows") ?? "{}"),
    head: [...document.querySelectorAll(".tile-tablebody thead th")].map((x) => x.textContent.trim()),
    label: [...document.querySelectorAll("[data-win] .win-mode-label")].map((x) => x.textContent) }));
  await ctx.close();
  const storedSheets = Object.values(r.stored).flatMap((ws) => (ws.wins ?? []).filter((w) => w.type === "table").map((w) => w.state?.["current.table.sheet"]));
  return { pass: turned > 0 && r.sheets.length > 0 && r.sheets.every((s) => s === "Units") && !storedSheets.includes("US")
      && r.head.includes("First epoch") && r.label.includes("Unità") && !errors.length,
    detail: { turned, sheets: r.sheets, storedSheets, head: r.head, label: r.label, errors } };
});

// ── NIGHT-RISORSA-FILE · parte 1: la risorsa e i suoi file ─────────────────
const SHOT = (name) => `${process.env.SHOTS ?? "."}/${name}.png`;
/** «Fonti», its graph window turned to DTC: the DTC with the inspector beside it */
const openDtcWithInspector = async (doc) => {
  const o = await open({ doc, ws: "provenance" });
  await o.p.locator('button[aria-pressed]', { hasText: /^DTC$/ }).first().click();
  await o.p.waitForTimeout(600);
  return o;
};
const dtcBoxes = async (p) => {
  const win = await winOf(p, "graph");
  return p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
};
const resPanel = (p) => p.evaluate(() => {
  const panel = document.querySelector('[data-win$="inspector"] .res-panel');
  return panel && {
    kind: panel.dataset.resPanel,
    rows: [...panel.querySelectorAll(".res-file")].map((r) => [r.dataset.role, r.dataset.path]),
    shared: [...panel.querySelectorAll(".res-shared")].map((x) => x.textContent),
    toggle: panel.querySelector('[data-action="toggle-files"]')?.textContent ?? null,
    revisions: [...panel.querySelectorAll(".res-revisions button")].map((b) => b.textContent),
    latest: !!panel.querySelector('[data-action="latest"]'),
  };
});
test("R1.closed", "una risorsa di tre file è UN nodo, chiuso («▸ OB_PODIO_LOD1 · 3 file»), che si apre sui suoi file", async () => {
  const { p, ctx, errors } = await openDtcWithInspector("risorsa-file");
  let ws = await dtcBoxes(p);
  await p.mouse.move(ws.rect.x + 20, ws.rect.y + 20);
  ws = await dtcBoxes(p);
  const closed = ws.boxes.find((b) => b.id === "podio_lod1");
  const filesBefore = ws.boxes.filter((b) => b.instanceOf && b.id.startsWith("podio_lod1::")).length;
  await pick(p, "podio_lod1");
  const panel = await resPanel(p);
  await p.screenshot({ path: SHOT("r1-risorsa-chiusa") }).catch(() => {});
  await p.click('[data-win$="inspector"] .res-panel [data-action="toggle-files"]');
  await p.waitForTimeout(500);
  ws = await dtcBoxes(p);
  const open1 = ws.boxes.find((b) => b.id === "podio_lod1");
  const files = ws.boxes.filter((b) => b.id.startsWith("podio_lod1::file::")).map((b) => b.label);
  await p.screenshot({ path: SHOT("r1-risorsa-aperta") }).catch(() => {});
  await ctx.close();
  return { pass: closed?.label === "▸ OB_PODIO_LOD1 · 3 file" && filesBefore === 0
      && panel?.rows.length === 3 && panel.rows[0][0] === "entry_point" && panel.rows[0][1] === "OB_PODIO_LOD1.obj"
      && open1?.label === "▾ OB_PODIO_LOD1 · 3 file"
      && JSON.stringify(files) === JSON.stringify(["OB_PODIO_LOD1.obj", "OB_PODIO_LOD1.mtl", "textures/T_OB_PODIO_LOD1.jpg"])
      && !errors.length,
    detail: { closed: closed?.label, filesBefore, panel, open: open1?.label, files, errors } };
});
test("R1.shared", "una texture condivisa da due tile si vede sotto tutte e due, e l'ispettore lo dice", async () => {
  const { p, ctx, errors } = await openDtcWithInspector("risorsa-file");
  await pick(p, "estl_lod1");
  const panel = await resPanel(p);
  await p.click('[data-win$="inspector"] .res-panel [data-action="toggle-files"]');
  await pick(p, "estr_lod1");
  await p.click('[data-win$="inspector"] .res-panel [data-action="toggle-files"]');
  await p.waitForTimeout(500);
  const ws = await dtcBoxes(p);
  const shared = ws.boxes.filter((b) => b.label === "textures/T_shared.jpg").map((b) => b.id.split("::")[0]).sort();
  await ctx.close();
  return { pass: JSON.stringify(shared) === JSON.stringify(["estl_lod1", "estr_lod1"])
      && panel?.shared.some((x) => x.includes("OB_EST_R_LOD1")) && !errors.length,
    detail: { shared, panelShared: panel?.shared, errors } };
});
test("R1.replace", "«Sostituisci…» sulla texture: una revisione nuova, la domanda su chi spostare («tutti»), la catena nell'ispettore", async () => {
  const { p, ctx, errors } = await openDtcWithInspector("risorsa-file");
  await pick(p, "podio_lod1");
  const tex = p.locator('[data-win$="inspector"] .res-file[data-path="textures/T_OB_PODIO_LOD1.jpg"] .res-replace');
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), tex.click()]);
  await chooser.setFiles({ name: "T_OB_PODIO_LOD1.jpg", mimeType: "image/jpeg", buffer: Buffer.from("una texture corretta") });
  await p.waitForSelector('[data-dialog="replace-pointers"]', { timeout: 8000 });
  const dialog = await p.evaluate(() => ({
    rows: [...document.querySelectorAll('[data-dialog="replace-pointers"] .res-ptr:not(.res-ptr-all)')].map((r) => r.textContent.trim()),
    all: document.querySelector('[data-dialog="replace-pointers"] input[data-all]')?.checked ?? null,
    staying: document.querySelector('[data-dialog="replace-pointers"] .res-ptr-staying')?.textContent ?? "",
  }));
  await p.screenshot({ path: SHOT("r1-sostituisci-chi-spostare") }).catch(() => {});
  await p.click('[data-dialog="replace-pointers"] [data-action="move"]');
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const sel = window.__EM_DRAG__.selected()[0];
    const rm = window.__EM_DRAG__.edgesOf("has_linked_resource").filter((e) => e.source === "RM_PODIO").map((e) => e.target);
    const rev = window.__EM_DRAG__.edgesOf("was_revision_of").map((e) => [e.source, e.target]);
    return { sel, rm, rev };
  });
  const newer = await resPanel(p);
  await pick(p, "podio_lod1");
  const older = await resPanel(p);
  await p.screenshot({ path: SHOT("r1-revisioni") }).catch(() => {});
  await ctx.close();
  // the export that produced the OLD bytes is not proposed: it stays, and the dialog says so
  return { pass: dialog.rows.length === 1 && /RM_PODIO/.test(dialog.rows[0]) && dialog.all === true
      && /Export OBJ/.test(dialog.staying)
      && r.rev.length === 1 && r.rev[0][1] === "podio_lod1" && r.sel === r.rev[0][0]
      && r.rm.length === 1 && r.rm[0] === r.sel
      && newer?.revisions.length === 2 && !newer.latest && older?.latest === true && !errors.length,
    detail: { dialog, r, newer, older, errors } };
});

// ── NIGHT-RISORSA-FILE · parte 2: la maniglia e il padre dichiarato ────────
const TILES = ["base", "RM", "TempluMare_tiles"];
async function cleanTileStamps() {
  const root = await rootPath();
  for (const lod of ["LOD0", "LOD1", "LOD2"]) {
    const dir = `${root}/base/RM/TempluMare_tiles/${lod}`;
    if (!existsSync(dir)) continue;
    for (const n of readdirSync(dir)) if (n.endsWith(".stamp.json")) rmSync(`${dir}/${n}`);
  }
  return root;
}
const handleOf = (p) => p.evaluate(() => ({
  pressed: document.querySelector(".stamp-handle [aria-pressed=true]")?.dataset.handleChoice ?? null,
  labels: [...document.querySelectorAll(".stamp-handle [data-handle-choice] b")].map((b) => b.textContent),
  head: document.querySelector(".stamp-compose-head")?.textContent ?? "",
  doors: [...document.querySelectorAll(".stamp-handle-members li")].map((l) => l.dataset.door),
}));
test("R2.lod0", "maniglia · l'obj del LOD0 dà UNA risorsa di 6 file, e «Una risorsa, 6 file» è la scelta di partenza", async () => {
  const root = await cleanTileStamps();
  const { p, ctx, errors } = await open({ doc: "catena" });
  await workspace(p, "assets");
  await storageInto(p, [root.split("/").pop(), ...TILES, "LOD0"]);
  await storageClick(p, "OB_PODIO_LOD0.obj");
  await p.click("button[data-action=compose-one]");
  await p.waitForSelector(".stamp-handle", { timeout: 30000 });
  const h = await handleOf(p);
  await p.screenshot({ path: SHOT("r2-una-risorsa-6-file") }).catch(() => {});
  await ctx.close();
  return { pass: h.pressed === "resource" && h.labels[0] === "Una risorsa, 6 file" && /1/.test(h.head)
      && h.doors.length === 1 && h.doors[0] === "OB_PODIO_LOD0.obj" && !errors.length, detail: { ...h, errors } };
});
test("R2.folder", "maniglia · la cartella LOD1/ dà 11 risorse (non 22 uscite), e «22 uscite» resta possibile", async () => {
  const root = await cleanTileStamps();
  const { p, ctx, errors } = await open({ doc: "catena" });
  await workspace(p, "assets");
  await storageInto(p, [root.split("/").pop(), ...TILES, "LOD1"]);
  await p.click("button[data-action=compose-folder]");
  await p.waitForSelector(".stamp-handle", { timeout: 60000 });
  const h = await handleOf(p);
  await p.screenshot({ path: SHOT("r2-cartella-11-risorse") }).catch(() => {});
  await p.click('.stamp-handle [data-handle-choice="outputs"]');
  await p.waitForTimeout(600);
  const n = await handleOf(p);
  await ctx.close();
  return { pass: h.pressed === "resource" && h.labels[0] === "11 risorse, 33 file" && h.doors.length === 11
      && /11/.test(h.head) && n.pressed === "outputs" && /22/.test(n.head) && n.labels[1] === "22 uscite" && !errors.length,
    detail: { first: h, then: n, errors } };
});
test("R2.declared", "padre dichiarato · una tile timbrata col padre datablock (e la catena fino alle foto) si salva, si riapre, e il DTC mostra la catena", async () => {
  const root = await cleanTileStamps();
  const { p, ctx, errors } = await open({ doc: "catena" });
  await workspace(p, "assets");
  await storageInto(p, [root.split("/").pop(), ...TILES, "LOD1"]);
  await storageClick(p, "OB_PODIO_LOD1.obj");
  await p.click("button[data-action=compose-one]");
  await p.waitForSelector(".stamp-handle", { timeout: 30000 });
  // «viene da»: the road of a derived file, with nothing stamped nearby
  await p.click('.stamp-road[data-mode="derived"]');
  await p.waitForTimeout(300);
  const fillIn = async (sel, v) => { await p.fill(sel, v); await p.waitForTimeout(80); };
  // level 0: the object of the .blend
  await p.click('[data-action="declared-add-level"]');
  await fillIn('[data-parent="0.0"] input[data-declared="blend"]', "RB/TempluMare_2021.blend");
  await fillIn('[data-parent="0.0"] input[data-declared="datablock"]', "{name}");
  // level 1: LOD0, by the LODgenerator
  await p.click('[data-action="declared-add-level"]');
  await p.selectOption('[data-level="1"] select[data-declared="kind"]', "decimation");
  await fillIn('[data-level="1"] input[data-declared="technique"]', "LODgenerator 3DSC");
  await fillIn('[data-parent="1.0"] input[data-declared="blend"]', "RB/TempluMare_2021.blend");
  await fillIn('[data-parent="1.0"] input[data-declared="datablock"]', "{base}_LOD0");
  // level 2: the segmented tile and the photographs, by 3DSC4Metashape
  await p.click('[data-action="declared-add-level"]');
  await p.selectOption('[data-level="2"] select[data-declared="kind"]', "photogrammetry");
  await fillIn('[data-level="2"] input[data-declared="technique"]', "3DSC4Metashape");
  await fillIn('[data-parent="2.0"] input[data-declared="blend"]', "RB/TempluMare_2021.blend");
  await fillIn('[data-parent="2.0"] input[data-declared="datablock"]', "{base}");
  await p.click('[data-level="2"] [data-action="declared-add-parent"]');
  await p.selectOption('[data-parent="2.1"] select[data-declared="parent-kind"]', "sources");
  await fillIn('[data-parent="2.1"] input[data-declared="label"]', "foto TempluMare (Metashape)");
  await p.screenshot({ path: SHOT("r2-compositore-padre-dichiarato") }).catch(() => {});
  await p.selectOption('.stamp-compose select[data-field="kind"]', "format_conversion");
  await p.fill('.stamp-compose input[data-field="software"]', "Blender 2.92");
  await p.fill('.stamp-compose input[data-field="operator"]', "Mario Rossi");
  await p.click('.stamp-compose button[data-field="today"]');
  await p.click('.stamp-compose button[data-action="stamp"]');
  await p.waitForTimeout(4000);
  const sidecar = `${root}/base/RM/TempluMare_tiles/LOD1/OB_PODIO_LOD1.obj.stamp.json`;
  const stamp = existsSync(sidecar) ? JSON.parse(readFileSync(sidecar, "utf8")) : null;
  // saved, and reopened
  const saved = await p.evaluate(() => window.__EM_DRAG__.docJson());
  if (process.env.SHOTS) writeFileSync(`${process.env.SHOTS}/../dbg/saved-declared.em.json`, saved);
  const toasts = await p.evaluate(() => [...document.querySelectorAll(".toast, #toast, [data-toast]")].map((x) => x.textContent).slice(-4));
  const savedKeys = (() => { try { const d = JSON.parse(saved); return { graphs: Object.keys(d.graphs ?? {}), declared: saved.includes("declared_only") }; } catch { return null; } })();
  await ctx.close();
  const b = await open({ doc: "catena" });
  await b.p.evaluate((d) => window.__EM_DRAG__.openAt(JSON.parse(d), "/tmp/tile.em.json"), saved);
  await b.p.waitForTimeout(800);
  await b.p.click(`#workspace-bar .ws-tab[data-ws="provenance"]`);
  await b.p.waitForTimeout(600);
  await b.p.locator('button[aria-pressed]', { hasText: /^DTC$/ }).first().click();
  await b.p.waitForTimeout(900);
  const dtc = await b.p.evaluate(() => {
    const w = window.__EM_DRAG__.wins().find((x) => x.type === "graph").id;
    const s = window.__EM_DRAG__.winScene(w);
    return { names: s.boxes.map((b) => (b.label ?? "") + "|" + (window.__EM_DRAG__.node(b.id)?.name ?? b.id)),
             boxes: s.boxes.length, mode: s.mode, ids: s.boxes.map((b) => b.id) };
  });
  await b.p.screenshot({ path: SHOT("r2-dtc-padre-datablock") }).catch(() => {});
  // the inspector of the declared parent says so
  const blendId = dtc.ids.find((id) => id.startsWith("declared:")
    && dtc.names[dtc.ids.indexOf(id)].endsWith("|OB_PODIO_LOD1"));
  await pick(b.p, blendId);
  const insp = await b.p.evaluate(() => ({
    declared: document.querySelector('[data-win$="inspector"] .res-declared')?.textContent ?? "",
    blend: document.querySelector('[data-win$="inspector"] .res-blend')?.textContent ?? "" }));
  await b.p.screenshot({ path: SHOT("r2-ispettore-dichiarato") }).catch(() => {});
  await b.ctx.close();
  const from = stamp?.from ?? [];
  const want = ["|OB_PODIO_LOD1", "|Trasformazione di formato", "|LODgenerator 3DSC", "|OB_PODIO_LOD0", "|3DSC4Metashape",
    "|OB_PODIO", "|foto TempluMare (Metashape)", "▸ OB_PODIO_LOD1 · 3 file"];
  return { pass: stamp?.self?.packaging === "file_set" && stamp.self.digest_covers === "members"
      && stamp.self.members?.length === 3 && from.length === 1 && from[0].label === "OB_PODIO_LOD1"
      && !from[0].digest && !JSON.stringify(from).includes("blend://")
      && dtc.mode === "dtc" && want.every((w) => dtc.names.some((n) => n.includes(w)))
      && dtc.names.some((n) => n.endsWith("|foto TempluMare (Metashape)")) && dtc.names.some((n) => n.endsWith("|OB_PODIO_LOD0"))
      && /dichiarato, non timbrato/.test(insp.declared) && /solo in Blender · TempluMare_2021\.blend · OB_PODIO_LOD1/.test(insp.blend)
      && !errors.length && !b.errors.length,
    detail: { self: stamp?.self && { packaging: stamp.self.packaging, covers: stamp.self.digest_covers, members: stamp.self.members?.length },
              from, dtc, insp, savedKeys, toasts, errors, errorsB: b.errors } };
});

// ── NIGHT-RISORSA-FILE · parte 3: il visualizzatore sceglie ────────────────
/** the risorsa-file fixture, opened as if from `fs/base/` (its files beside it) */
async function openBaseDoc(docId, opts = {}) {
  const root = await rootPath();
  const o = await open({ doc: "catena", ws: "provenance", ...opts });
  await o.p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path),
    [fixture("risorsa-file"), `${root}/base/risorsa-file.em.json`]);
  await o.p.waitForTimeout(800);
  const win = await o.p.evaluate((id) => window.__EM_DRAG__.openDoc(id), docId);
  return { ...o, win, root };
}
const modelHost = (p, win) => p.evaluate((w) => {
  const h = document.querySelector(`[data-win="${w}"] .rd-3d-host`);
  return h && { ready: h.dataset.ready ?? null, kind: h.dataset.modelKind ?? null, model: h.dataset.model ?? null,
    meshes: Number(h.dataset.meshes ?? 0), textured: Number(h.dataset.textured ?? 0),
    resolved: h.__v3dResolved?.() ?? [], note: h.querySelector(".nv-embed-note")?.textContent ?? "" };
}, win);
const waitModel = async (p, win, ms = 60000) => {
  const t0 = Date.now();
  let m = await modelHost(p, win);
  while (Date.now() - t0 < ms && !(m?.ready === "1" || /raggiungibile|unreachable/.test(m?.note ?? ""))) {
    await p.waitForTimeout(300);
    m = await modelHost(p, win);
  }
  return { ...m, ms: Date.now() - t0 };
};
test("R3.offline", "visualizzatore · OB_PODIO_LOD1 si apre dal file_set (obj + mtl + texture) offline, i percorsi dagli archi has_file", async () => {
  const { p, ctx, errors, win } = await openBaseDoc("D2");
  const m = await waitModel(p, win);
  await p.screenshot({ path: SHOT("r3-podio-lod1-offline") }).catch(() => {});
  await ctx.close();
  const got = Object.fromEntries(m.resolved ?? []);
  return { pass: m.ready === "1" && m.kind === "obj" && m.meshes > 0 && m.textured > 0
      && /\/fs\/at\/.*LOD1\/OB_PODIO_LOD1\.mtl$/.test(got["OB_PODIO_LOD1.mtl"] ?? "")
      && /\/fs\/at\/.*LOD1\/textures\/T_OB_PODIO_LOD1\.jpg$/.test(got["textures/T_OB_PODIO_LOD1.jpg"] ?? "")
      && !errors.length,
    detail: { ready: m.ready, kind: m.kind, meshes: m.meshes, textured: m.textured, resolved: got, ms: m.ms, note: m.note, errors } };
});
test("R3.online", "visualizzatore · lo stesso online: ogni file per digest dallo store (/asset/sha256:…), nessuno dal disco", async () => {
  const root = await rootPath();
  const sums = JSON.parse(readFileSync(`${TD}risorsa-file.sums.json`, "utf8"));
  const byDigest = new Map(Object.entries(sums).map(([rel, v]) => [v.checksum, `${root}/base/RM/TempluMare_tiles/${rel}`]));
  const asked = [];
  const route = { pattern: "http://store.invalid/asset/**", handler: async (r) => {
    const ref = decodeURIComponent(r.request().url().split("/asset/")[1] ?? "");
    asked.push(ref);
    const file = byDigest.get(ref);
    if (!file) return r.fulfill({ status: 404, body: "no asset" });
    return r.fulfill({ status: 200, body: readFileSync(file), headers: { "access-control-allow-origin": "*" } });
  } };
  const { p, ctx, errors, win } = await openBaseDoc("D2", { query: `&store=${encodeURIComponent("http://store.invalid/asset/")}`, route });
  const m = await waitModel(p, win);
  const fromDisk = await p.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((u) => /\/fs\/at\/.*TempluMare_tiles/.test(u)));
  await p.screenshot({ path: SHOT("r3-podio-lod1-online") }).catch(() => {});
  await ctx.close();
  const want = ["OB_PODIO_LOD1.obj", "OB_PODIO_LOD1.mtl", "textures/T_OB_PODIO_LOD1.jpg"].map((k) => sums[`LOD1/${k}`].checksum);
  return { pass: m.ready === "1" && m.kind === "obj" && m.textured > 0 && want.every((d) => asked.includes(d))
      && !fromDisk.length && !errors.length,
    detail: { ready: m.ready, textured: m.textured, asked, fromDisk, note: m.note, errors } };
});
test("R3.blender", "visualizzatore · un RM che ha solo il datablock dice «solo in Blender», con il nome del .blend", async () => {
  const { p, ctx, errors, win } = await openBaseDoc("D4");
  await p.waitForTimeout(800);
  const note = await p.evaluate((w) => document.querySelector(`[data-win="${w}"] [data-only-blender]`)?.textContent ?? null, win);
  await p.screenshot({ path: SHOT("r3-solo-in-blender") }).catch(() => {});
  await ctx.close();
  return { pass: note === "solo in Blender · TempluMare_2021.blend · OB_PRATO_LOD1" && !errors.length, detail: { note, errors } };
});
test("R3.3tz", "visualizzatore · TempluMare_cesium.3tz si apre senza estrarlo e si raffina come la cartella, con lo stesso allineamento", async () => {
  const root = await rootPath();
  const run = async (url) => {
    const t0 = Date.now();
    const o = await openTilesDoc("D1", { mutate: (d) => {
      for (const n of d.graph.nodes) if (n.id === "RES_TS") n.data.url = url;
      return d;
    } });
    const first = await tilesSettle(o.p, o.win, (s) => (s.files ?? []).length >= 1, 30000);
    const tFirst = Date.now() - t0;
    // «Automatico»: the renderer refines by the error on screen — the same
    // camera for both, so the same tiles when it has settled (the hollow temple
    // leaves nothing under a click at the centre of the root tile)
    await o.p.click(`[data-win="${o.win}"] .tl-seg [data-mode="auto"]`);
    let more = await tilesSettle(o.p, o.win, (s) => (s.files ?? []).length > (first.files ?? []).length, 40000);
    for (let i = 0; i < 20; i++) {
      await o.p.waitForTimeout(1000);
      const next = await tilesState(o.p, o.win);
      if (same(next.files, more.files) && !next.status?.busy) break;
      more = next;
    }
    more.files = [...(more.files ?? [])].sort();
    const got = await o.fetched(true);
    await o.p.screenshot({ path: SHOT(`r3-templumare-${url.endsWith(".3tz") ? "3tz" : "cartella"}`) }).catch(() => {});
    await o.ctx.close();
    return { first: first.files, more: more.files, box: more.box, line: more.line, tFirst, errors: o.errors,
             fetchedBodies: got.length };
  };
  const folder = await run(`${root}/base/RM/TempluMare_cesium/tileset.json`);
  const archive = await run(`${root}/base/RM/TempluMare_cesium.3tz`);
  const round = (b) => b && JSON.stringify(b, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v));
  return { pass: same(folder.first, archive.first) && same(folder.more, archive.more) && (archive.more ?? []).length > 1
      && round(folder.box) === round(archive.box) && !folder.errors.length && !archive.errors.length,
    detail: { folder, archive } };
});

// ── NIGHT-RISORSA-FILE · parte 4: impacchettare un tileset ─────────────────
test("R4.pack", "impacchettare · nel web il pulsante dice «nella desktop»; il flusso (quello della desktop) scrive il .3tz e il grafo ha UNA risorsa con due forme", async () => {
  const root = await rootPath();
  const copy = `${root}/pack-test/TempluMare_cesium`;
  // a fresh copy (APFS clone): the archive is really written beside it
  execFileSync("rm", ["-rf", copy, `${copy}.3tz`]);
  execFileSync("cp", ["-cR", `${root}/base/RM/TempluMare_cesium`, copy]);
  const { p, ctx, errors } = await open({ doc: "catena" });
  await workspace(p, "assets");
  await storageInto(p, [root.split("/").pop(), "pack-test", "TempluMare_cesium"]);
  const web = await p.evaluate(() => ({
    disabled: document.querySelector('[data-action="pack-3tz"]')?.disabled ?? null,
    note: document.querySelector('[data-pack="desktop-only"]')?.textContent ?? "" }));
  await p.screenshot({ path: SHOT("r4-web-nella-desktop") }).catch(() => {});
  const out = await p.evaluate((f) => window.__EM_DRAG__.packTileset(f), copy);
  await p.waitForTimeout(600);
  const graph = await p.evaluate(() => {
    const res = window.__EM_DRAG__.idsOfType("resource");
    return res.map((id) => window.__EM_DRAG__.node(id)).filter(Boolean)
      .map((n) => ({ id: n.id, name: n.name, packaging: n.data?.packaging, cd: n.data?.content_digest?.digest ?? null }));
  });
  await workspace(p, "provenance");
  const archiveId = graph.find((n) => n.packaging === "archive")?.id;
  if (archiveId) await pick(p, archiveId);
  const insp = await p.evaluate(() => [...document.querySelectorAll('[data-win$="inspector"] .res-forms [data-form]')].map((b) => b.dataset.form));
  await p.screenshot({ path: SHOT("r4-due-forme") }).catch(() => {});
  await ctx.close();
  const forms = graph.filter((n) => n.cd === "sha256:8aa6fbd3e5847e9f8c2e219fb4305d9a3ad52e41135120e79bb8c3d18b67caed");
  return { pass: web.disabled === true && /desktop/.test(web.note) && out?.ok && out.state === "written"
      && out.sha256 === "sha256:232dfcbc148f30e52098fef9c83606a3e1638a106fc0678563e909cde1db0c17"
      && forms.length === 2 && forms.some((n) => n.packaging === "directory") && forms.some((n) => n.packaging === "archive")
      && insp.length === 2 && !errors.length,
    detail: { web, out: out && { state: out.state, sha256: out.sha256, cd: out.content_digest }, forms, insp, errors } };
});

// ── NIGHT-RISORSA-FILE · parte 5: le rifiniture della prova ────────────────
test("R5.toast", "il «+ fase» premuto e rilasciato FUORI dalla tela non resta armato: il clic dopo (su una tela qualunque, anche mentre si compone un timbro) non crea «fase Phase 2»", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", ws: "canvas" });
  await p.waitForTimeout(600);
  const epochs = () => p.evaluate(() => window.__EM_DRAG__.idsOfType("EpochNode").length);
  const btn = (await p.evaluate(() => window.__EM_DRAG__.addPhaseButtons()))[0];
  const before = await epochs();
  // press on the «+» of an epoch, then leave the canvas and release there
  // (onto the Inspector: the hand went to write somewhere else)
  const insp = await p.evaluate(() => { const r = document.querySelector('[data-win$="inspector"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.move(btn.x, btn.y);
  await p.mouse.down();
  for (let i = 1; i <= 6; i++) await p.mouse.move(btn.x + (insp.x - btn.x) * i / 6, btn.y + (insp.y - btn.y) * i / 6);
  await p.mouse.up();
  await p.waitForTimeout(300);
  const afterRelease = await epochs();
  // …then an ordinary click on the canvas, far from any «+»
  const ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), await winOf(p, "graph"));
  await p.mouse.click(ws.rect.x + ws.rect.w * 0.6, ws.rect.y + ws.rect.h * 0.85);
  await p.waitForTimeout(400);
  const afterClick = await epochs();
  const toast = await p.evaluate(() => [...document.querySelectorAll("#toast, .toast")].map((t) => t.textContent).join(" | "));
  // and the «+» still works as a click
  await p.mouse.click(btn.x, btn.y);
  await p.waitForTimeout(400);
  const afterPlus = await epochs();
  await ctx.close();
  return { pass: !!btn && afterRelease === before && afterClick === before && !/fase .* creata/.test(toast)
      && afterPlus === before + 1 && !errors.length,
    detail: { btn, before, afterRelease, afterClick, afterPlus, toast, errors } };
});

test("R5.statusbar", "in Standalone la barra di stato dice «Standalone · nessun nodo», e il dettaglio sta nel tooltip", async () => {
  const { p, ctx, errors } = await open({ doc: "catena" });
  await workspace(p, "assets");
  const root = await rootPath();
  await storageInto(p, [root.split("/").pop(), "vuota"]);
  await storageClick(p, "foto1.jpg");
  await p.waitForTimeout(1200);
  // …then a graph window turned to DTC (Fonti, its mode button): the DTC reads
  // the selected file, and asks the node for its chain — there is no node
  await workspace(p, "provenance");
  await p.locator('button[aria-pressed]', { hasText: /^DTC$/ }).first().click();
  await p.waitForTimeout(900);
  const bar = await p.evaluate(() => { const i = document.getElementById("info"); return { text: i?.textContent ?? "", title: i?.title ?? "" }; });
  await p.screenshot({ path: SHOT("r5-barra-standalone") }).catch(() => {});
  await ctx.close();
  return { pass: bar.text === "Standalone · nessun nodo" && /Modo ▸ Hub/.test(bar.title) && /foto1\.jpg/.test(bar.title) && !errors.length,
    detail: { bar, errors } };
});

// ── VLONG-DEV29 · parte B: what Cowork saw on the Segni records (1 ott) ──────
test("V9b.open", "aprire un em.json sopra un grafo con modifiche non salvate CHIEDE; «Annulla» lascia tutto com'era, «OK» lo apre accanto (il primo resta nell'EMTree, ancora da salvare)", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en" });
  const first = await p.evaluate(() => window.__EM_DRAG__.idsOfType("US")[0]);
  await p.evaluate((id) => window.__EM_DRAG__.edit(id, { description: "edited, not saved" }), first);
  const dialogs = [];
  let answer = false;
  p.on("dialog", async (d) => { dialogs.push(d.message()); answer ? await d.accept() : await d.dismiss(); });
  await p.setInputFiles("#file-input", `${TD}TempluMare.em.json`);
  await p.waitForTimeout(1200);
  const afterCancel = await p.evaluate(() => window.__EM_DRAG__.slots());
  answer = true;
  await p.setInputFiles("#file-input", `${TD}TempluMare.em.json`);
  await p.waitForFunction(() => window.__EM_DRAG__.slots().length === 2, null, { timeout: 30000 }).catch(() => {});
  const afterOk = await p.evaluate(() => window.__EM_DRAG__.slots());
  await ctx.close();
  return { pass: dialogs.length === 2 && /unsaved changes/.test(dialogs[0])
      && afterCancel.length === 1 && afterCancel[0].dirty
      && afterOk.length === 2 && afterOk[0].dirty && afterOk[1].active && !errors.length,
    detail: { dialogs, afterCancel, afterOk, errors } };
});

test("V5.oneact", "«un atto per N file»: il nome dell'atto è proposto («Download 10.5281/zenodo.1234567») e chiesto, il Download chiede da dove, e gli N timbri hanno UN process_id e la provenienza", async () => {
  const root = FS_ROOT ?? (await rootPath());
  const dir = `${root}/zenodo-1234567`;
  mkdirSync(dir, { recursive: true });
  for (const f of ["a.xlsx", "b.txt", "c.ply"]) {
    writeFileSync(`${dir}/${f}`, `dev29 ${f}\n`);
    try { execFileSync("rm", ["-f", `${dir}/${f}.stamp.json`]); } catch { /* none */ }
  }
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en" });
  await workspace(p, "assets");
  await storageInto(p, [root.split("/").pop(), "zenodo-1234567"]);
  await p.click("button[data-action=compose-folder]");
  await p.waitForSelector(".stamp-compose", { timeout: 30000 });
  const before = await p.evaluate(() => [...document.querySelectorAll(".stamp-compose [data-field]")].map((x) => x.dataset.field));
  await p.selectOption('.stamp-compose select[data-field="kind"]', "download");
  await p.waitForTimeout(500);
  const src = await p.inputValue('.stamp-compose input[data-field="source"]').catch(() => null);
  const name = await p.inputValue('.stamp-compose input[data-field="campaign"]').catch(() => null);
  await p.fill('.stamp-compose input[data-field="operator"]', "0000-0002-5065-7970");
  await p.click('.stamp-compose button[data-field="today"]');
  await p.screenshot({ path: SHOT("v5-un-atto-da-dove") }).catch(() => {});
  await p.click('.stamp-compose button[data-action="stamp"]');
  await p.waitForTimeout(3000);
  if (await p.locator(".seal-veil").count()) await p.keyboard.press("Escape");
  const stamps = ["a.xlsx", "b.txt", "c.ply"].map((f) => existsSync(`${dir}/${f}.stamp.json`)
    ? JSON.parse(readFileSync(`${dir}/${f}.stamp.json`, "utf8")) : null);
  const pids = [...new Set(stamps.map((x) => x?.how?.process_id))];
  const from = [...new Set(stamps.map((x) => x?.how?.acquisition?.retrieved_from))];
  await ctx.close();
  return { pass: before.includes("campaign") && src === "10.5281/zenodo.1234567" && name === "Download 10.5281/zenodo.1234567"
      && stamps.every(Boolean) && pids.length === 1 && !!pids[0]
      && from.length === 1 && from[0] === "https://doi.org/10.5281/zenodo.1234567"
      && stamps.every((x) => Array.isArray(x.from) && x.from.length === 0) && !errors.length,
    detail: { before, src, name, pids, from, errors } };
});

test("V8.warnings", "avvisi nuovi: due documenti sullo stesso file, un url con //, il grafo non georiferito (con «Leggi uno SHIFT.txt…»), una risorsa dichiarata mancante; il messaggio non va a capo per lettera", async () => {
  const shift = `${FS_ROOT ?? "/tmp"}/SHIFT-dev29.txt`;
  writeFileSync(shift, "EPSG::3004 2355500 4617500 0\n");
  const can = await fetch(`${BRIDGE}/read-shift`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "EPSG::3004 2355500 4617500 0" }) }).then((r) => r.status).catch(() => 0);
  const { p, ctx, errors } = await open({ doc: "dev29-segni-lite", locale: "en" });
  const rows = await p.evaluate(() => window.__EM_DRAG__.issues().map((i) => ({ rule: i.rule, node: i.node, sev: i.sev })));
  const has = (rule, node) => rows.some((r) => r.rule === rule && (!node || r.node === node));
  await p.click("#footer-warnings");
  await p.waitForTimeout(800);
  const msgMin = await p.evaluate(() => {
    const td = document.querySelector("table.tv-table td.tv-msg");
    if (!td) return 0;
    const cs = getComputedStyle(td);
    const c = document.createElement("canvas").getContext("2d");
    c.font = cs.font;
    return parseFloat(cs.minWidth) / c.measureText("0").width;   // in ch
  });
  await p.screenshot({ path: SHOT("v8-avvisi") }).catch(() => {});
  const btn = p.locator('tr.tv-issue[data-rule="georef"] .tv-fix button').first();
  const [chooser] = await Promise.all([p.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null), btn.click()]);
  if (chooser) await chooser.setFiles(shift);
  await p.waitForTimeout(1500);
  const geo = await p.evaluate(() => window.__EM_DRAG__.node("geo_imported_graph")?.data ?? null);
  const after = await p.evaluate(() => window.__EM_DRAG__.issues().filter((i) => i.rule === "georef").length);
  const toast = await p.evaluate(() => [...document.querySelectorAll("#toast, .toast")].map((t) => t.textContent).join(" | "));
  await ctx.close();
  const declared = can === 200 ? geo?.epsg === 3004 && geo.shift_x === 2355500 && after === 0
                               : /dev29|read_shift/.test(toast) && geo?.epsg === 4326;
  return { pass: has("address", "d02") && has("address", "d32") && has("address", "d33") && !has("address", "d33_link")
      && rows.some((r) => r.rule === "georef" && r.sev === "warn") && has("missing", "res:pano")
      && msgMin >= 17.9 && !!chooser && declared && !errors.length,
    detail: { rows: rows.filter((r) => ["address", "georef", "missing"].includes(r.rule)), msgMin, chooser: !!chooser, bridgeReadShift: can, geo, after, toast: toast.slice(0, 200), errors } };
});

test("V2.dtc", "il DTC che si legge: un'acquisizione di N foto è UN blocco («▸ 8 photos») che si apre col clic, i processi dicono la tecnica, le corsie il passo, le etichette ci sono alla scala di adattamento; i due eventi dello stesso lotto (DEV30 D3) si collegano e restano due", async () => {
  const { p, ctx, errors } = await open({ doc: "dev29-segni-lite", locale: "en", ws: "provenance" });
  await p.locator('button[aria-pressed]', { hasText: /^DTC$/ }).first().click();
  await p.waitForTimeout(900);
  const win = await winOf(p, "graph");
  const sc = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const blocks = sc.boxes.filter((b) => b.id.endsWith("::set")).map((b) => b.label);
  const photos = sc.boxes.filter((b) => b.id.startsWith("res:dji")).length;
  const label = (id) => sc.boxes.find((b) => b.id === id)?.label;
  await p.screenshot({ path: SHOT("v2-dtc-blocchi") }).catch(() => {});
  const blk = sc.boxes.find((b) => b.id === "acq-drone::set");
  await p.mouse.click(blk.x + blk.w / 2, blk.y + blk.h / 2);
  await p.waitForTimeout(800);
  const sc2 = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const opened = sc2.boxes.filter((b) => b.id.startsWith("res:dji")).length;
  const sel = await p.evaluate(() => window.__EM_DRAG__.selected());
  // the twin events: DEV30 D3 · the warning's fix LINKS them (W14 measures it
  // on the canvas); they stay two
  const before = await p.evaluate(() => window.__EM_DRAG__.idsOfType("dtc_acquisition").length);
  await p.click("#footer-warnings");
  await p.waitForTimeout(700);
  await p.locator('tr.tv-issue[data-rule="twin"] .tv-fix button').first().click();
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => window.__EM_DRAG__.idsOfType("dtc_acquisition"));
  const kept = await p.evaluate(() => window.__EM_DRAG__.node("acq-drone"));
  const inputs = await p.evaluate(() => window.__EM_DRAG__.edgesOf("dtc_had_input").filter((e) => e.source === "c1eef313-29e1-5361-ad19-ca01930832e7").map((e) => e.target).sort());
  await ctx.close();
  return { pass: JSON.stringify(blocks.sort()) === JSON.stringify(["▸ 8 photos", "▸ 8 photos"]) && photos === 0
      && label("proc-align") === "allineamento" && label("proc-lod2") === "export: OBJ decimato"
      && !sc.lanes.some((l) => /\(\d\)/.test(l)) && sc.lanes.some((l) => /allineamento/.test(l))
      && sc.scale > 0.35 && opened === 8 && sel[0] === "acq-drone"
      && before === 4 && after.length === 4 && kept?.name === "Volo drone San Pietro (FC300X)"
      && inputs.includes("acq-drone") && !errors.length,
    detail: { blocks, photos, align: label("proc-align"), lanes: sc.lanes, scale: sc.scale, opened, sel, before, after, kept: kept?.name, inputs, errors } };
});

test("V3.inspector", "ispettore della risorsa: un file_set dice «File set» (chip e barra del nome), l'embargo è in inglese, la licenza proposta è quella del grafo (CC-BY-ND), members_digest = checksum una volta sola, gli indirizzi dicono i file", async () => {
  const { p, ctx, errors } = await open({ doc: "dev29-segni-lite", locale: "en", ws: "provenance" });
  await pick(p, "res:lod0");
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const insp = document.querySelector('[data-win$="inspector"]');
    const txt = insp?.innerText ?? "";
    const dts = [...(insp?.querySelectorAll(".insp-data dt") ?? [])].map((d) => d.textContent);
    return { chip: insp?.querySelector(".insp-chip")?.textContent, strip: document.getElementById("ns-ctx")?.textContent,
             apply: insp?.querySelector('[data-action="apply-licence"]')?.textContent,
             italian: /fino al|Motivo dell|Citata da/.test(txt), dts,
             addr: insp?.querySelector("[data-res-addresses] .insp-hint")?.textContent, produced: /export: OBJ 12 materiali/.test(txt) };
  });
  await p.screenshot({ path: SHOT("v3-ispettore-file-set") }).catch(() => {});
  await ctx.close();
  return { pass: r.chip === "File set" && /^File set/.test(r.strip ?? "") && r.apply === "Apply CC-BY-ND — the graph's licence"
      && !r.italian && r.dts.includes("checksum") && !r.dts.includes("members_digest") && /3 files/.test(r.addr ?? "")
      && r.produced && !errors.length, detail: { ...r, errors } };
});

test("V4.storage", "Storage: il percorso si legge (la coda, e intero al passaggio), un file timbrato apre la microscheda (chi, quando, atto, da dove, sigillo) col JSON chiuso, la radice sospesa è detta una volta, il doppio clic non seleziona il testo", async () => {
  const root = FS_ROOT ?? (await rootPath());
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en", w: 1280,
    route: { pattern: "**/fs/roots", handler: async (r) => {
      const res = await r.fetch(); const j = await res.json();
      await r.fulfill({ response: res, json: { ...j, suspended: ["/", "/", "/"] } });
    } } });
  await workspace(p, "assets");
  const held = await p.evaluate(() => [...document.querySelectorAll(".storage-held")].map((x) => x.textContent));
  await storageInto(p, [root.split("/").pop()]);
  const row = p.locator(".storage-row", { has: p.locator(".storage-name", { hasText: /^zenodo-1234567$/ }) }).first();
  await row.dblclick();
  await p.waitForTimeout(700);
  const selection = await p.evaluate(() => String(window.getSelection() ?? ""));
  const crumb = await p.evaluate(() => { const c = document.querySelector("input.storage-path"); return c && { title: c.title, value: c.value,
    tail: c.scrollLeft + c.clientWidth >= c.scrollWidth - 2, long: c.scrollWidth > c.clientWidth }; });
  const file = p.locator(".storage-row", { has: p.locator(".storage-name", { hasText: /^a\.xlsx$/ }) }).first();
  await file.click();
  await p.waitForTimeout(1500);
  const card = await p.evaluate(() => {
    const c = document.querySelector(".stamp-card");
    const det = document.querySelector("details.stamp-json");
    return { rows: c ? [...c.querySelectorAll("dd")].map((d) => d.dataset.card) : [],
             from: c?.querySelector('[data-card="from"]')?.textContent ?? "",
             jsonClosed: !!det && !det.open && !!det.querySelector("pre.stamp-emitted-body"),
             jsonVisible: !!det?.querySelector("pre")?.checkVisibility?.({ contentVisibilityAuto: true }) };
  });
  await p.screenshot({ path: SHOT("v4-storage-microscheda") }).catch(() => {});
  await ctx.close();
  return { pass: held.length === 1 && (held[0].match(/saved list/g) ?? []).length === 1
      && selection === "" && !!crumb && crumb.title.includes(crumb.value.replace(/^…/, "")) && crumb.title.includes("zenodo-1234567") && /zenodo-1234567$/.test(crumb.value)
      && ["who", "when", "act", "from", "seal"].every((k) => card.rows.includes(k)) && /zenodo\.1234567/.test(card.from)
      && card.jsonClosed && !card.jsonVisible && !errors.length,
    detail: { held, selection, crumb, card, errors } };
});

test("V6.resources", "Strumenti ▸ Risorse: due file con lo stesso id (D.04) avvisano, un file senza id è nominato, e i documenti «/DosCo/…» non restano «assenti» dopo lo scan della cartella", async () => {
  const root = FS_ROOT ?? (await rootPath());
  const dir = `${root}/dev29/DosCo`;
  mkdirSync(dir, { recursive: true });
  // a 1×1 JPEG: the thumbnail decodes, the test is about RESOLVING the file
  const jpg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
  for (const f of ["D.02.jpg", "D.33.jpg", "D.04_Frammento.JPG", "D.04_Pilastrino.JPG", "photo_2022-02-07_11-47-54.jpg"]) writeFileSync(`${dir}/${f}`, jpg);
  const { p, ctx, errors } = await open({ doc: "dev29-segni-lite", locale: "en" });
  await p.evaluate(() => document.getElementById("btn-resources").click());
  await p.fill("#res-folder", dir);
  await p.click("#res-scan");
  await p.waitForTimeout(2500);
  const notes = await p.evaluate(() => [...document.querySelectorAll("#res-shelf .res-note")].map((n) => ({ dup: n.dataset.dupId ?? null, noId: n.dataset.noId ?? null, txt: n.textContent })));
  // the Documents section re-asks its previews with the folder now set
  await p.evaluate(() => { document.getElementById("resources-done").click(); document.getElementById("btn-resources").click(); });
  await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById("res-docs")?.scrollIntoView());
  await p.waitForTimeout(2500);
  const docs = await p.evaluate(() => [...document.querySelectorAll("#res-docs .res-row")].map((r) => ({ name: r.querySelector(".res-row-title")?.textContent, missing: !!r.querySelector(".rp-missing") })));
  await p.screenshot({ path: SHOT("v6-risorse-dosco") }).catch(() => {});
  await ctx.close();
  return { pass: notes.some((n) => n.dup === "D.04" && /D\.04_Frammento/.test(n.txt) && /D\.04_Pilastrino/.test(n.txt))
      && notes.some((n) => n.noId === "1" && /photo_2022-02-07_11-47-54\.jpg/.test(n.txt))
      && docs.length === 3 && docs.every((d) => !d.missing) && !errors.length,
    detail: { notes, docs, errors } };
});

test("V7.mapping", "Mapping editor: il primo clic su «Leggi i campi» funziona; il template sourcelist di EM è riconosciuto (em_sourcelist_it, riga 2); «Una mappa registrata» mostra l'elenco; l'errore si legge nella finestra; il primo clic su «Applica» funziona", async () => {
  mkdirSync(TAB(), { recursive: true });
  copyFileSync(`${TD}dev29-em-sourcelist-lite.xlsx`, `${TAB()}/dev29-em-sourcelist-lite.xlsx`);
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en" });
  await fileMenuDoor(p);
  await p.waitForTimeout(500);
  // type the path and click «Read the fields» ONCE, without leaving the field first
  await p.click('#mapping-editor [data-field="source-path"]');
  await p.keyboard.type(`${TAB()}/dev29-em-sourcelist-lite.xlsx`);
  await p.click('#mapping-editor [data-action="read-fields"]');
  await p.waitForFunction(() => document.querySelector("#mapping-editor .me-recognised, #mapping-editor .me-muted"), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const read = await p.evaluate(() => ({
    format: [...document.querySelectorAll("#mapping-editor .me-muted")].map((x) => x.textContent).find((x) => /read as/.test(x)) ?? null,
    recognised: document.querySelector("#mapping-editor .me-recognised")?.dataset.recognised ?? null,
    mapping: document.querySelector("#mapping-editor input[name=me-mapping]:checked")?.value ?? null,
    ref: document.querySelector('#mapping-editor [data-field="mapping-ref"]')?.value ?? null,
    registered: [...document.querySelectorAll("#mapping-editor .me-registered [data-mapping]")].map((b) => b.dataset.mapping),
  }));
  await p.screenshot({ path: SHOT("v7-mapping-riconosciuto") }).catch(() => {});
  // the error: a name the registry does not know, then ONE click on Apply
  await p.click('#mapping-editor [data-field="mapping-ref"]', { clickCount: 3 });
  await p.keyboard.type("no_such_mapping");
  await p.click('#mapping-editor [data-action="apply"]');
  await p.waitForTimeout(2500);
  const note = await p.evaluate(() => document.querySelector("#mapping-editor .me-note, #mapping-editor [class*=note]")?.textContent ?? "");
  // …and the good one, one click: a new graph with the three documents
  await p.click('#mapping-editor .me-registered [data-mapping="em_sourcelist_it"]');
  await p.waitForTimeout(300);
  const slotsBefore = await p.evaluate(() => window.__EM_DRAG__.slots().length);
  await p.click('#mapping-editor [data-action="apply"]');
  await p.waitForFunction((n) => window.__EM_DRAG__.slots().length > n, slotsBefore, { timeout: 15000 }).catch(() => {});
  const docs = await p.evaluate(() => window.__EM_DRAG__.idsOfType("document").length);
  await ctx.close();
  return { pass: !!read.format && read.recognised === "em_sourcelist_it" && read.mapping === "registry" && read.ref === "em_sourcelist_it"
      && read.registered.includes("em_sourcelist_it") && read.registered.length >= 2
      && /no_such_mapping|not|unknown|non/i.test(note) && note !== "It did not work — the message says why."
      && docs === 3 && !errors.length,
    detail: { read, note: note.slice(0, 200), docs, errors } };
});

test("V1.addlinked", "DTC: tasto destro su un'acquisizione ▸ «Add linked» offre risorse e processi (non «0 types allowed»), e la stessa risposta del «+» col nodo selezionato", async () => {
  const { p, ctx, errors } = await open({ doc: "dev29-segni-lite", locale: "en", ws: "provenance" });
  await p.locator('button[aria-pressed]', { hasText: /^DTC$/ }).first().click();
  await p.waitForTimeout(800);
  const win = await winOf(p, "graph");
  const sc = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const acq = sc.boxes.find((b) => b.id === "acq-canon");
  await pick(p, "acq-canon");
  await p.mouse.click(acq.x + acq.w / 2, acq.y + acq.h / 2, { button: "right" });
  await p.waitForTimeout(300);
  await p.locator(".ctx-menu button", { hasText: /^Add linked/ }).first().click();
  await p.waitForTimeout(400);
  const menu = await p.evaluate(() => ({ items: [...document.querySelectorAll(".addm .addm-item")].map((b) => b.textContent.trim()),
    foot: document.querySelector(".addm-foot")?.textContent ?? "" }));
  await p.screenshot({ path: SHOT("v1-add-linked-acquisizione") }).catch(() => {});
  await p.keyboard.press("Escape");
  await ctx.close();
  return { pass: menu.items.length > 5 && !/0 types allowed/.test(menu.foot) && !/No node type/.test(menu.foot) && !errors.length,
    detail: { n: menu.items.length, first: menu.items.slice(0, 8), foot: menu.foot, errors } };
});

// ── MICRO-LE-DECISIONI-DELLA-DEV29 · parte B: E.D. on the desktop dev.15 (2 ott) ──
const PNG1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const LITE = () => fixture("dev29-segni-lite");
const wsWin = (p, type) => p.evaluate((ty) => window.__EM_DRAG__.wins().find((w) => w.type === ty) ?? null, type);
/** a Tauri shell, enough for the save and the identity paths: every call answered, the writes recorded */
const tauriHook = (savePath) => (() => {
  window.__CALLS__ = [];
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
    transformCallback: () => 1, unregisterCallback: () => {}, convertFileSrc: (x) => x,
    invoke: async (cmd, args, opts) => {
      window.__CALLS__.push({ cmd, path: opts?.headers?.path ?? args?.path ?? null });
      if (cmd === "transformer_url") return window.__BRIDGE__;
      if (cmd === "plugin:dialog|save") return window.__SAVE_PATH__;
      if (cmd === "llm_key_status") return { available: false, set: false, detail: "test" };
      return null;
    },
  };
});

test("W01.docimage", "U1 · il documento D.02 (url «/DosCo/D.02.jpg») si vede nella Doc: il percorso si legge nella cartella dello studio, e l'immagine arriva come blob (l'<img> diretto il /fs lo rifiuta)", async () => {
  const dir = `${FS_ROOT}/dev30/u1`;
  mkdirSync(`${dir}/DosCo`, { recursive: true });
  writeFileSync(`${dir}/DosCo/D.02.jpg`, PNG1);
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en", ws: "provenance" });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [LITE(), `${dir}/study.em.json`]);
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__EM_DRAG__.openDoc("d02"));
  await p.waitForFunction(() => document.querySelector(".rd-img img")?.complete && document.querySelector(".rd-img img").naturalWidth > 0, null, { timeout: 10000 }).catch(() => {});
  const img = await p.evaluate(() => { const i = document.querySelector(".rd-img img"); return i && { blob: i.src.startsWith("blob:"), w: i.naturalWidth }; });
  await p.screenshot({ path: SHOT("w01-documento-immagine") }).catch(() => {});
  await ctx.close();
  return { pass: !!img && img.blob && img.w === 1 && !errors.length, detail: { img, errors } };
});

test("W02.dating", "U2 · l'anno propone l'epoca che lo contiene (un bottone la conferma); un clic sul menu mentre l'anno è ancora nel campo non si perde; scegliere l'epoca data il documento e la selezione resta sul documento", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en" });
  await pick(p, "d02");
  await p.click("input[data-doc-year]");
  await p.keyboard.type("150");
  await p.click("select[data-doc-epoch]");     // the click that dev.15 lost
  await p.waitForTimeout(600);
  const r1 = await p.evaluate(() => ({ year: window.__EM_DRAG__.node("d02").data.year, focus: document.activeElement?.dataset?.docEpoch ?? null,
    hint: document.querySelector("[data-doc-year-hint]")?.textContent ?? "" }));
  await p.click('[data-action="date-in-proposed"]');
  await p.waitForTimeout(1200);
  const r2 = await p.evaluate(() => ({ ep: window.__EM_DRAG__.epochOf("d02"), sel: window.__EM_DRAG__.selected() }));
  await p.screenshot({ path: SHOT("w02-datazione-proposta") }).catch(() => {});
  // no epoch with dates: it says so, and offers to write them
  const noDates = LITE();
  for (const n of noDates.graph.nodes) if (n.node_type === "EpochNode") n.data = {};
  const { p: q, ctx: c2 } = await open({ doc: noDates, locale: "en" });
  await pick(q, "d02");
  await q.fill("input[data-doc-year]", "1834");
  await q.press("input[data-doc-year]", "Enter");
  await q.waitForTimeout(600);
  const r3 = await q.evaluate(() => ({ hint: document.querySelector("[data-doc-year-hint]")?.textContent ?? "", btn: !!document.querySelector('[data-action="write-epoch-dates"]') }));
  await c2.close();
  await ctx.close();
  return { pass: r1.year === 150 && /falls in Età romana/.test(r1.hint) && r2.ep === "ep1" && r2.sel[0] === "d02"
      && /No epoch has its dates/.test(r3.hint) && r3.btn && !errors.length, detail: { r1, r2, r3, errors } };
});

test("W03.lock", "U3 · «Blocca la posizione» è nel menu del nodo sulla Matrix (e il Layout la tiene); l'Ispettore del documento non lo ha più", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en" });
  await pick(p, "d02");
  const inInspector = await p.evaluate(() => [...document.querySelectorAll(".insp-btn")].some((b) => /Lock position/.test(b.textContent)));
  await pick(p, "us1");
  const win = await winOf(p, "graph");
  const box = await p.evaluate((w) => window.__EM_DRAG__.winScene(w).boxes.find((b) => b.id === "us1"), win);
  await p.mouse.click(box.x + box.w / 2, box.y + box.h / 2, { button: "right" });
  await p.waitForTimeout(300);
  const items = await p.evaluate(() => [...document.querySelectorAll(".ctx-menu button")].map((b) => b.textContent));
  await p.screenshot({ path: SHOT("w03-blocca-nel-menu") }).catch(() => {});
  await p.locator(".ctx-menu button", { hasText: /^Lock position/ }).first().click();
  await p.waitForTimeout(300);
  const pinned = await p.evaluate(() => (JSON.parse(window.__EM_DRAG__.docJson()).layout?.pinned ?? []).includes("us1"));
  await ctx.close();
  return { pass: !inInspector && items.some((x) => /^Lock position/.test(x)) && pinned && !errors.length, detail: { inInspector, items: items.slice(0, 5), pinned, errors } };
});

test("W04.showmatrix", "U4 · dalla scheda del documento «Mostra nella Matrix»: lo seleziona e la finestra del grafo passa alla Matrix", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", ws: "provenance" });
  const has = await p.locator('[data-show-matrix="d02"]').count();
  if (has) await p.click('[data-show-matrix="d02"]');
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => ({ sel: window.__EM_DRAG__.selected(), mode: window.__EM_DRAG__.wins().find((w) => w.type === "graph")?.state?.mode }));
  await p.screenshot({ path: SHOT("w04-mostra-nella-matrix") }).catch(() => {});
  await ctx.close();
  return { pass: has === 1 && r.sel[0] === "d02" && r.mode === "matrix" && !errors.length, detail: { has, r, errors } };
});

test("W05.lang", "U5 · «Riconosci le lingue…»: proposta per gruppo, un gesto la conferma, e si scrive SOLO data.lang (niente ai_assisted, niente registro)", async () => {
  const d = LITE();
  for (const n of d.graph.nodes) if (n.id === "us1") n.description = "Fondazione del tempio";
    else if (n.id === "us2") n.description = "I recognize a wall made of three levels of stone";
  const { p, ctx, errors } = await open({ doc: d, locale: "en" });
  const btn = p.locator('tr.tv-issue[data-rule="language"] .tv-fix button');
  await p.click("#footer-warnings");
  await p.waitForTimeout(700);
  const n = await btn.count();
  if (n) await p.evaluate(() => document.querySelector('tr.tv-issue[data-rule="language"] .tv-fix button')?.click());
  await p.waitForTimeout(400);
  const groups = await p.evaluate(() => [...document.querySelectorAll('[data-role="lang-recognise"] .lang-rec-row b')].map((b) => b.textContent));
  await p.screenshot({ path: SHOT("w05-lingue-riconosciute") }).catch(() => {});
  if (n) await p.click('[data-action="apply-languages"]');
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => ["us1", "us2"].map((id) => window.__EM_DRAG__.data(id)));
  const graphData = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).data ?? {});
  await ctx.close();
  const markers = after.some((x) => x && ("ai_assisted" in x || "ai_generated" in x || "validated_by" in x));
  return { pass: n >= 1 && after[0]?.lang === "it" && after[1]?.lang === "en" && !markers && !JSON.stringify(graphData).includes("lang")
      && groups.length >= 2 && !errors.length, detail: { n, groups, after, errors } };
});

test("W06.sources", "U6 · la finestra del grafo di Fonti si apre sulla Matrix, la vista standard", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", ws: "provenance" });
  const mode = await p.evaluate(() => window.__EM_DRAG__.wins().find((w) => w.type === "graph")?.state?.mode);
  await ctx.close();
  return { pass: mode === "matrix" && !errors.length, detail: { mode, errors } };
});

test("W07.scan", "U7 · «Scansiona come DosCo…» è sulla cartella dello Storage e sullo shelf vuoto, e apre le Risorse con la scansione fatta", async () => {
  const root = FS_ROOT ?? (await rootPath());
  const dir = `${root}/dev30/DosCo`;
  mkdirSync(dir, { recursive: true });
  for (const f of ["D.02.jpg", "D.04_a.JPG", "D.04_b.JPG"]) writeFileSync(`${dir}/${f}`, PNG1);
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", ws: "assets" });
  await storageInto(p, [root.split("/").pop(), "dev30", "DosCo"]);
  const onShelf = await p.locator('.viewer-empty [data-action="scan-dosco"]').count();
  await p.locator('.storage-detail [data-action="scan-dosco"]').first().click();
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => ({ open: !document.getElementById("resources-modal")?.classList.contains("hidden"),
    folder: document.getElementById("res-folder").value, dup: [...document.querySelectorAll("#res-shelf .res-note")].some((n) => n.dataset.dupId === "D.04") }));
  await p.screenshot({ path: SHOT("w07-scansiona-dosco") }).catch(() => {});
  await ctx.close();
  return { pass: onShelf === 1 && r.open && r.folder === dir && r.dup && !errors.length, detail: { onShelf, r, errors } };
});

test("W08.save", "U8 · nel desktop, dopo «Salva come» e un cambio di grafo, «Salva» scrive sul file aperto senza riaprire il dialogo", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriHook(),
    init: undefined });
  await p.evaluate(([b, sp]) => { window.__BRIDGE__ = b; window.__SAVE_PATH__ = sp; }, [BRIDGE, "/tmp/dev30-u8/study.em.json"]);
  await p.keyboard.press("Meta+s");
  await p.waitForTimeout(700);
  await p.setInputFiles("#file-input", `${TD}TempluMare.em.json`);
  await p.waitForTimeout(2000);
  await workspace(p, "assets");
  await p.locator(".et-pick, .ov-pick").first().click();
  await p.waitForTimeout(700);
  await p.evaluate(() => { window.__CALLS__.length = 0; });
  await p.keyboard.press("Meta+s");
  await p.waitForTimeout(700);
  const calls = await p.evaluate(() => window.__CALLS__.filter((c) => /dialog\|save|write_text_file/.test(c.cmd)).map((c) => c.cmd));
  await ctx.close();
  return { pass: calls.length === 1 && calls[0] === "plugin:fs|write_text_file" && !errors.length, detail: { calls, errors } };
});

test("W09.shift", "U9 · «Leggi uno SHIFT.txt…» contro un bridge più vecchio (404 senza CORS) dice quale bridge e perché, non «Load failed»", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en",
    route: { pattern: "**/read-shift", handler: (r) => r.request().method() === "OPTIONS" ? r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST" } }) : r.fulfill({ status: 404, contentType: "text/html", body: "<html>Error code: 404</html>" }) } });
  await ctx.route("**/health", async (r) => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, json: { ok: true, service: "em_bridge" } }));
  const shift = `${FS_ROOT ?? "/tmp"}/SHIFT-dev30.txt`;
  writeFileSync(shift, "EPSG::3004 2355500 4617500 0\r\n");
  await p.click("#footer-warnings");
  await p.waitForTimeout(700);
  const [chooser] = await Promise.all([p.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
    p.locator('tr.tv-issue[data-rule="georef"] .tv-fix button').first().click()]);
  if (chooser) await chooser.setFiles(shift);
  await p.waitForTimeout(1500);
  const toast = await p.evaluate(() => [...document.querySelectorAll("#toast, .toast")].map((t) => t.textContent).join(" | "));
  await p.screenshot({ path: SHOT("w09-bridge-vecchio") }).catch(() => {});
  await ctx.close();
  return { pass: /older than this EMStudio/.test(toast) && /\/read-shift/.test(toast) && !/Load failed|Failed to fetch/.test(toast) && !errors.length,
    detail: { toast: toast.slice(0, 240), errors } };
});

test("W10.storage", "U10–U12, V1, V2 · Storage: il dettaglio è un riquadro fisso fuori dalla lista (che scorre da sola), con i comandi sulla selezione; il percorso scrive la coda; i .stamp.json sono nascosti; «Quando» si legge, «Da dove» è retrieved_from", async () => {
  const root = FS_ROOT ?? (await rootPath());
  const dir = `${root}/zenodo-1234567`;
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en", w: 1280 });
  await workspace(p, "assets");
  await storageInto(p, [root.split("/").pop(), "zenodo-1234567"]);
  const names = await p.evaluate(() => [...document.querySelectorAll(".storage-row .storage-name")].map((x) => x.textContent));
  await storageClick(p, "a.xlsx");
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const list = document.querySelector(".storage-list"), det = document.querySelector(".storage-detail");
    const crumb = document.querySelector("input.storage-path");
    return { apart: !!list && !!det && !list.contains(det) && det.contains(document.querySelector(".stamp-card")),
             listScrolls: list && getComputedStyle(list).overflowY, cmds: [...(det?.querySelectorAll(".storage-commands button") ?? [])].map((b) => b.dataset.action),
             crumb: crumb?.value, title: crumb?.title, when: document.querySelector('.stamp-card [data-card="when"]')?.textContent,
             from: document.querySelector('.stamp-card [data-card="from"]')?.textContent, sidecars: document.querySelector('[data-action="toggle-stamp-files"]')?.textContent };
  });
  await p.screenshot({ path: SHOT("w10-storage-dettaglio") }).catch(() => {});
  await ctx.close();
  return { pass: r.apart && r.listScrolls === "auto" && r.cmds.includes("compose-from") && r.cmds.includes("show-in-graph")
      && /zenodo-1234567$/.test(r.crumb ?? "") && (r.title ?? "").includes(dir.replace(/^\/tmp\//, "")) && !/T\d\d:/.test(r.when ?? "T00:")
      && r.from === "https://doi.org/10.5281/zenodo.1234567" && !names.some((n) => /\.stamp\.json$/.test(n)) && /3 stamp files/.test(r.sidecars ?? "")
      && !errors.length, detail: { names, ...r, errors } };
});

test("W11.seed", "V3 · un grafo nuovo che nessuno ha toccato (New / «Prima unità» e Esc) cede il posto al GraphML importato e non si salva; uno toccato resta", async () => {
  const { p, ctx, errors } = await open({ doc: null, locale: "en" });
  const dialogs = [];
  p.on("dialog", async (d) => { dialogs.push(d.message().slice(0, 60)); await d.accept(); });
  await p.evaluate(() => document.getElementById("btn-new").click());
  await p.waitForTimeout(700);
  await p.setInputFiles("#file-input", `${TD}TempluMare.em.json`);
  await p.waitForFunction(() => window.__EM_DRAG__.nodeCount() > 20, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(500);
  const slots = await p.evaluate(() => window.__EM_DRAG__.slots().map((s) => s.name));
  const graphs = await p.evaluate(() => Object.values(JSON.parse(window.__EM_DRAG__.docJson()).graphs ?? {}).map((g) => g.name ?? g.graph_id));
  // a seed somebody renamed is a graph of theirs: it stays
  await p.evaluate(() => document.getElementById("btn-new").click());
  await p.waitForTimeout(700);
  await p.evaluate(() => { const ep = window.__EM_DRAG__.idsOfType("EpochNode")[0]; window.__EM_DRAG__.edit(ep, { name: "Età del ferro" }); });
  await p.setInputFiles("#file-input", `${TD}TempluMare.em.json`);
  await p.waitForTimeout(2500);
  const slots2 = await p.evaluate(() => window.__EM_DRAG__.slots().length);
  await ctx.close();
  return { pass: slots.length === 1 && graphs.length === 1 && !graphs.some((g) => /untitled/.test(String(g))) && dialogs.length === 1 && slots2 === 3 && !errors.length,
    detail: { slots, graphs, dialogs, slots2, errors } };
});

test("W12.editor", "V4 · header.last_editor dice la versione vera di EMStudio", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en" });
  const r = await p.evaluate(() => ({ ed: JSON.parse(window.__EM_DRAG__.docJson()).header?.last_editor, brand: document.querySelector(".brand, #brand")?.title ?? "" }));
  await ctx.close();
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  return { pass: r.ed === `EMStudio ${pkg}` && !errors.length, detail: { ...r, pkg, errors } };
});

test("W13.compose", "D1/D2 · il compositore: per un Download «da dove» è obbligatorio e già riempito (cartella zenodo), il nome dell'atto è obbligatorio con 32 uscite e proposto «Download <DOI>»; i 32 timbri hanno UN process_id; con un'uscita il nome non c'è", async () => {
  const root = FS_ROOT ?? (await rootPath());
  const dir = `${root}/zenodo-7654321`;
  mkdirSync(dir, { recursive: true });
  const files = Array.from({ length: 32 }, (_, i) => `f${String(i).padStart(2, "0")}.txt`);
  for (const f of files) { writeFileSync(`${dir}/${f}`, `dev30 ${f}\n`); try { execFileSync("rm", ["-f", `${dir}/${f}.stamp.json`]); } catch { /* none */ } }
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en" });
  await workspace(p, "assets");
  await storageInto(p, [root.split("/").pop(), "zenodo-7654321"]);
  await p.click("button[data-action=compose-folder]");
  await p.waitForSelector(".stamp-compose", { timeout: 30000 });
  await p.selectOption('.stamp-compose select[data-field="kind"]', "download");
  await p.waitForTimeout(500);
  const src = await p.inputValue('.stamp-compose input[data-field="source"]').catch(() => null);
  const name = await p.inputValue('.stamp-compose input[data-field="campaign"]').catch(() => null);
  await p.fill('.stamp-compose input[data-field="operator"]', "0000-0002-5065-7970");
  await p.click('.stamp-compose button[data-field="today"]');
  // emptied, the origin stops the stamp (no «stamp anyway?»)
  const dialogs = [];
  p.on("dialog", async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  await p.fill('.stamp-compose input[data-field="source"]', "");
  await p.click('.stamp-compose button[data-action="stamp"]');
  await p.waitForTimeout(500);
  const blocked = await p.evaluate(() => ({ focus: document.activeElement?.dataset?.field ?? null, err: document.querySelector('.stamp-compose [data-err="source"]')?.textContent ?? "" }));
  const none = existsSync(`${dir}/${files[0]}.stamp.json`);
  await p.fill('.stamp-compose input[data-field="source"]', "10.5281/zenodo.7654321");
  await p.screenshot({ path: SHOT("w13-compositore-download") }).catch(() => {});
  await p.click('.stamp-compose button[data-action="stamp"]');
  await p.waitForTimeout(6000);
  if (await p.locator(".seal-veil").count()) await p.keyboard.press("Escape");
  const stamps = files.map((f) => existsSync(`${dir}/${f}.stamp.json`) ? JSON.parse(readFileSync(`${dir}/${f}.stamp.json`, "utf8")) : null);
  const pids = [...new Set(stamps.map((x) => x?.how?.process_id))];
  const from = [...new Set(stamps.map((x) => x?.how?.acquisition?.retrieved_from))];
  // one output: no act's name
  await storageClick(p, files[0]);
  const one = await p.evaluate(() => !!document.querySelector('.stamp-compose input[data-field="campaign"]'));
  await ctx.close();
  return { pass: src === "10.5281/zenodo.7654321" && name === "Download 10.5281/zenodo.7654321"
      && blocked.focus === "source" && !!blocked.err && !none && !dialogs.length
      && stamps.every(Boolean) && pids.length === 1 && !!pids[0] && from.length === 1 && from[0] === "https://doi.org/10.5281/zenodo.7654321"
      && !one && !errors.length,
    detail: { src, name, blocked, none, dialogs, stamped: stamps.filter(Boolean).length, pids, from, one, errors } };
});

test("W14.lot", "D3 · i due eventi dello stesso lotto: l'avviso dice che non si citano, il Fix li collega (il download cita la cattura), restano due, e il DTC li mostra come due righe della corsia delle acquisizioni con le date, sopra UN blocco", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", ws: "provenance" });
  await p.click("#footer-warnings");
  await p.waitForTimeout(700);
  const fix = p.locator('tr.tv-issue[data-rule="twin"] .tv-fix button').first();
  const label = (await fix.count()) ? await fix.textContent() : null;
  if (label) await fix.click();
  await p.waitForTimeout(800);
  await p.locator('button[aria-pressed]', { hasText: /^DTC$/ }).first().click();
  await p.waitForTimeout(900);
  const win = await winOf(p, "graph");
  const sc = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const DL = "c1eef313-29e1-5361-ad19-ca01930832e7";
  const a = sc.boxes.find((b) => b.id === "acq-drone"), b = sc.boxes.find((x) => x.id === DL);
  const r = await p.evaluate((dl) => ({ acq: window.__EM_DRAG__.idsOfType("dtc_acquisition").length,
    cite: window.__EM_DRAG__.edgesOf("dtc_had_input").some((e) => e.source === dl && e.target === "acq-drone"),
    twins: window.__EM_DRAG__.issues().filter((i) => i.rule === "twin").length }), DL);
  await p.screenshot({ path: SHOT("w14-due-eventi-un-blocco") }).catch(() => {});
  await ctx.close();
  const blocks = sc.boxes.filter((x) => x.id.endsWith("::set")).map((x) => x.id);
  return { pass: /cites/.test(label ?? "") && r.acq === 4 && r.cite && r.twins === 0 && JSON.stringify(blocks) === JSON.stringify(["acq-drone::set"])
      && !!a && !!b && b.y > a.y && /2018-02-17/.test(a.label ?? "") && /2026-09-29/.test(b.label ?? "") && !errors.length,
    detail: { label, r, blocks, a: a && { y: a.y, label: a.label }, b: b && { y: b.y, label: b.label }, errors } };
});

test("W15.library", "D6 · gli avvisi della libreria (api.validate via /validate) sono nella vista Avvisi: «download without origin» sull'evento degli stamp", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en" });
  await p.waitForFunction(() => window.__EM_DRAG__.issues().some((i) => i.rule === "library"), null, { timeout: 8000 }).catch(() => {});
  const rows = await p.evaluate(() => window.__EM_DRAG__.issues().filter((i) => i.rule === "library").map((i) => ({ node: i.node, txt: i.txt.slice(0, 60) })));
  await ctx.close();
  return { pass: rows.some((x) => /download without origin/.test(x.txt) && x.node === "c1eef313-29e1-5361-ad19-ca01930832e7") && !errors.length, detail: { rows, errors } };
});

test("W16.identity", "U13–U16 · una sola verità sull'identità (barra, «Chi sei», Impostazioni dicono la stessa frase, verificata con testimone e data); sul desktop senza nodo «nessun nodo configurato» con il gesto per configurarlo; «Esci · dimentica»; Impostazioni ▸ Identità piena e in inglese", async () => {
  const ids = JSON.stringify({ current: "0000-0002-5065-7970", known: [{ orcid: "0000-0002-5065-7970", name: "Emanuel", surname: "Demetrescu",
    verified: true, verifiedAt: "2026-10-02T14:10:00Z", verifiedBy: "orcid.org", authMode: "orcid" }] });
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", init: { "emstudio.identities": ids }, hook: tauriHook() });
  await p.evaluate((b) => { window.__BRIDGE__ = b; }, BRIDGE);
  const chip = await p.evaluate(() => document.getElementById("footer-identity").title);
  await p.click("#footer-identity");
  await p.waitForTimeout(1500);
  const panel = await p.evaluate(() => ({ state: document.querySelector(".idpanel .idp-state")?.textContent ?? "",
    way1: document.querySelector('.idpanel [data-idp-way="stratigraph"] .idp-d')?.textContent ?? "",
    configure: !!document.querySelector("[data-idp-configure]"), out: !!document.querySelector("[data-idp-signout]") }));
  await p.screenshot({ path: SHOT("w16-chi-sei") }).catch(() => {});
  await p.evaluate(() => [...document.querySelectorAll(".idpanel button")].find((b) => /Manage the identities/.test(b.textContent))?.click());
  await p.waitForTimeout(600);
  const set = await p.evaluate(() => ({ orcid: document.getElementById("set-orcid").value, name: document.getElementById("set-orcid-name").value,
    state: document.getElementById("set-orcid-state").textContent, h: document.querySelector("#settings-sect-identity h4").textContent }));
  await ctx.close();
  const sentence = "Verified: Emanuel Demetrescu (0000-0002-5065-7970), witnessed by orcid.org on";
  return { pass: chip.startsWith(sentence) && panel.state.startsWith(sentence) && set.state.startsWith(sentence)
      && /No StratiGraph node configured/.test(panel.way1) && !/tauri:\/\//.test(panel.way1) && panel.configure && panel.out
      && set.orcid === "0000-0002-5065-7970" && set.name === "Emanuel" && set.h === "Identity (ORCID)" && !errors.length,
    detail: { chip, panel, set, errors } };
});

// ── MICRO-OGNI-FILE-I-SUOI-GRAFI (2 ott) · F1–F4 on the canvas ───────────────
/** a Tauri shell that RECORDS what is written: path and text of every write */
const tauriWrites = () => (() => {
  window.__WRITES__ = [];
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
    transformCallback: () => 1, unregisterCallback: () => {}, convertFileSrc: (x) => x,
    invoke: async (cmd, args, opts) => {
      if (cmd === "plugin:fs|write_text_file") {
        const raw = opts?.headers?.path ?? args?.path ?? "";
        const text = args instanceof Uint8Array ? new TextDecoder().decode(args) : String(args?.data ?? "");
        window.__WRITES__.push({ path: decodeURIComponent(raw), text });
        return null;
      }
      if (cmd === "transformer_url") return window.__BRIDGE__ ?? null;
      if (cmd === "plugin:dialog|save") return window.__SAVE_PATH__ ?? null;
      if (cmd === "llm_key_status") return { available: false, set: false, detail: "test" };
      return null;
    },
  };
});
const OF_GRAPH = (id, units, x0) => ({
  graph_id: id, name: `grafo ${id}`,
  nodes: units.map((u) => ({ id: u, node_type: "US", name: u })),
  edges: units.slice(1).map((u, i) => ({ id: `${units[i]}_${u}`, source: units[i], target: u, edge_type: "is_after" })),
  layout: { positions: Object.fromEntries(units.map((u, i) => [u, { x: x0 + i * 37, y: 100 + i * 61, w: 90, h: 30 }])) },
});
/** the two files of the case: A with two graphs (each its own layout), B with one */
const OF_FILES = () => ({
  A: { header: { format: "em.json", version: "1.0" }, active_graph_id: "gA1",
       graphs: { gA1: OF_GRAPH("gA1", ["A1", "A2"], 11), gA2: OF_GRAPH("gA2", ["A3", "A4", "A5"], 503) } },
  B: { header: { format: "em.json", version: "1.0" }, active_graph_id: "gB1",
       graphs: { gB1: OF_GRAPH("gB1", ["B1", "B2"], 1207) } },
});
const ofContent = (section) => JSON.stringify((section.nodes ?? []).map((n) => [n.id, n.node_type, n.name, n.description ?? ""])
  .concat((section.edges ?? []).map((e) => [e.source, e.edge_type, e.target])));
const ofPositions = (section) => Object.fromEntries(Object.entries(section.layout?.positions ?? {})
  .filter(([id]) => (section.nodes ?? []).some((n) => n.id === id && n.node_type === "US"))
  .map(([id, r]) => [id, [Math.round(r.x), Math.round(r.y)]]));

test("F1.files", "F1–F4 · due file, tre grafi: l'EMTree li mostra per file; ⌘S scrive il file del grafo attivo con i soli suoi grafi; riaperti, ogni grafo ha le sue posizioni", async () => {
  const files = OF_FILES();
  const want = Object.fromEntries(Object.values(files).flatMap((f) => Object.entries(f.graphs)).map(([g, s]) => [g, ofPositions(s)]));
  const { p, ctx, errors } = await open({ doc: null, locale: "en", hook: tauriWrites() });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([b]) => { window.__BRIDGE__ = b; }, [BRIDGE]);
  await p.evaluate(([a]) => window.__EM_DRAG__.openAt(a, "/tmp/of/A.em.json"), [files.A]);
  await p.waitForTimeout(1500);
  await p.evaluate(([b]) => window.__EM_DRAG__.openAt(b, "/tmp/of/B.em.json"), [files.B]);
  await p.waitForTimeout(1500);
  await workspace(p, "assets");
  const tree = await p.evaluate(() => [...document.querySelectorAll(".et-file")].map((f) => ({
    name: f.querySelector(".et-file-name")?.textContent, target: f.classList.contains("et-file-active"),
    graphs: [...f.querySelectorAll(".et-slot .et-name")].map((x) => x.textContent) })));
  await p.screenshot({ path: SHOT("f1-emtree-due-file") }).catch(() => {});
  // an edit in B's graph (active), then ⌘S
  await p.evaluate(() => window.__EM_DRAG__.edit("B1", { description: "scritto in B" }));
  await p.keyboard.press("Meta+s");
  await p.waitForTimeout(800);
  // to A's second graph, an edit, ⌘S
  await p.locator(".et-pick", { hasText: "grafo gA2" }).first().click();
  await p.waitForTimeout(800);
  await p.evaluate(() => window.__EM_DRAG__.edit("A4", { description: "scritto in A" }));
  await p.keyboard.press("Meta+s");
  await p.waitForTimeout(800);
  const writes = await p.evaluate(() => window.__WRITES__);
  await ctx.close();
  const docs = writes.map((w) => ({ path: w.path, doc: JSON.parse(w.text) }));
  const byPath = Object.fromEntries(docs.map((d) => [d.path, d.doc]));
  const A = byPath["/tmp/of/A.em.json"], B = byPath["/tmp/of/B.em.json"];
  const keysOf = (d) => Object.keys(d?.graphs ?? {}).sort();
  // the digest per graph: an untouched graph is the same content; an edited
  // one differs in its edited node only
  const same = A && ofContent(A.graphs.gA1) === ofContent(files.A.graphs.gA1);
  const editedA = A && JSON.stringify(A.graphs.gA2.nodes.find((n) => n.id === "A4")?.description) === '"scritto in A"'
    && ofContent({ ...A.graphs.gA2, nodes: A.graphs.gA2.nodes.filter((n) => n.id !== "A4") })
      === ofContent({ ...files.A.graphs.gA2, nodes: files.A.graphs.gA2.nodes.filter((n) => n.id !== "A4") });
  const posWritten = docs.length === 2 && Object.fromEntries([...Object.entries(A.graphs), ...Object.entries(B.graphs)]
    .map(([g, s]) => [g, ofPositions(s)]));
  // reopen both files from what was written: every graph has ITS positions
  const r = await open({ doc: null, locale: "en", hook: tauriWrites() });
  await r.p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  const reopened = {};
  if (A && B) {
    await r.p.evaluate(([a]) => window.__EM_DRAG__.openAt(a, "/tmp/of/A.em.json"), [A]);
    await r.p.waitForTimeout(1500);
    await r.p.evaluate(([b]) => window.__EM_DRAG__.openAt(b, "/tmp/of/B.em.json"), [B]);
    await r.p.waitForTimeout(1500);
    await workspace(r.p, "assets");
    for (const name of ["grafo gA1", "grafo gA2", "grafo gB1"]) {
      await r.p.locator(".et-pick", { hasText: name }).first().click();
      await r.p.waitForTimeout(900);
      const doc = JSON.parse(await r.p.evaluate(() => window.__EM_DRAG__.docJson()));
      const gid = name.split(" ")[1];
      reopened[gid] = ofPositions(doc.graphs[gid]);
      reopened[`${gid}.top`] = ofPositions({ ...doc.graphs[gid], layout: doc.layout });
    }
  }
  const log = await r.p.evaluate(() => (window.__EM_DRAG__.log?.() ?? []).map((x) => x.message).join("\n")).catch(() => "");
  await r.ctx.close();
  const pass = tree.length === 2 && tree[0].graphs.length === 2 && tree[1].graphs.length === 1 && tree[1].target && !tree[0].target
    && docs.length === 2 && JSON.stringify(keysOf(B)) === '["gB1"]' && JSON.stringify(keysOf(A)) === '["gA1","gA2"]'
    && same && editedA
    && JSON.stringify(posWritten) === JSON.stringify(want)
    && JSON.stringify(ofPositions({ ...A.graphs.gA2, layout: A.layout })) === JSON.stringify(want.gA2)
    && ["gA1", "gA2", "gB1"].every((g) => JSON.stringify(reopened[g]) === JSON.stringify(want[g])
                                        && JSON.stringify(reopened[`${g}.top`]) === JSON.stringify(want[g]))
    && !/laid out afresh/.test(log) && !errors.length && !r.errors.length;
  return { pass, detail: { tree, paths: docs.map((d) => [d.path, keysOf(d.doc)]), same, editedA, posWritten, want, reopened,
                           errors: [...errors, ...r.errors] } };
});

test("F2.saveas", "F2 · un grafo importato sta in «Senza file»; ⌘S è «Salva come», e gli dà un file suo con lui solo", async () => {
  const files = OF_FILES();
  const { p, ctx, errors } = await open({ doc: null, locale: "en", hook: tauriWrites() });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([b, sp]) => { window.__BRIDGE__ = b; window.__SAVE_PATH__ = sp; }, [BRIDGE, "/tmp/of/nuovo.em.json"]);
  await p.evaluate(([a]) => window.__EM_DRAG__.openAt(a, "/tmp/of/A.em.json"), [files.A]);
  await p.waitForTimeout(1500);
  await p.setInputFiles("#file-input", `${TD}catena.em.json`);   // a drop: a file without a path (browser-like)
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById("btn-new")?.click());   // New: a graph with no file
  await p.waitForTimeout(1200);
  await workspace(p, "assets");
  const before = await p.evaluate(() => [...document.querySelectorAll(".et-file")].map((f) => ({
    nofile: f.classList.contains("et-nofile"), n: f.querySelectorAll(".et-slot").length, target: f.classList.contains("et-file-active") })));
  await p.keyboard.press("Meta+s");
  await p.waitForTimeout(1000);
  const writes = await p.evaluate(() => window.__WRITES__.map((w) => ({ path: w.path, graphs: Object.keys(JSON.parse(w.text).graphs) })));
  const after = await p.evaluate(() => [...document.querySelectorAll(".et-file")].map((f) => ({
    name: f.querySelector(".et-file-name")?.textContent, nofile: f.classList.contains("et-nofile"), n: f.querySelectorAll(".et-slot").length })));
  await p.screenshot({ path: SHOT("f2-salva-come-da-senza-file") }).catch(() => {});
  await ctx.close();
  const loose = before.find((g) => g.nofile);
  return { pass: !!loose && loose.target && writes.length === 1 && writes[0].path === "/tmp/of/nuovo.em.json"
      && writes[0].graphs.length === 1 && after.some((g) => g.name?.startsWith("nuovo.em.json") && g.n === 1) && !errors.length,
    detail: { before, writes, after, errors } };
});

test("F4.oldfile", "F4 · un file VECCHIO (un solo layout, del grafo attivo): il grafo attivo tiene le sue posizioni, l'altro si dispone da capo e lo si dice una volta; al Salva ciascuno scrive il suo", async () => {
  const gX = OF_GRAPH("gX", ["X1", "X2"], 301);
  const gY = OF_GRAPH("gY", ["Y1", "Y2", "Y3"], 0);
  const top = gX.layout; delete gX.layout; delete gY.layout;
  // as San Pietro was: the other graph FIRST in the file, the real one active
  const old = { header: { format: "em.json", version: "1.0" }, active_graph_id: "gX", graphs: { gY, gX }, layout: top };
  const { p, ctx, errors } = await open({ doc: null, locale: "en", hook: tauriWrites() });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d]) => window.__EM_DRAG__.openAt(d, "/tmp/of/vecchio.em.json"), [old]);
  await p.waitForTimeout(2500);
  await workspace(p, "assets");
  await p.locator(".et-pick", { hasText: "grafo gY" }).first().click();
  await p.waitForTimeout(2000);
  const ySeen = await p.evaluate(() => window.__EM_SCENE__?.()?.nodes ?? []);
  await p.evaluate(() => window.__EM_DRAG__.edit("Y1", { description: "toccato" }));
  await p.keyboard.press("Meta+s");
  await p.waitForTimeout(900);
  const writes = await p.evaluate(() => window.__WRITES__);
  const log = await p.evaluate(() => (window.__EM_DRAG__.log?.() ?? []).map((x) => x.message));
  await ctx.close();
  const doc = writes[0] ? JSON.parse(writes[0].text) : null;
  const xPos = doc && ofPositions(doc.graphs.gX), yPos = doc && ofPositions(doc.graphs.gY);
  const said = log.filter((m) => /laid out afresh/.test(m));
  const want = ofPositions({ ...OF_GRAPH("gX", ["X1", "X2"], 301) });
  return { pass: writes.length === 1 && JSON.stringify(xPos) === JSON.stringify(want)
      && Object.keys(yPos ?? {}).sort().join() === "Y1,Y2,Y3" && JSON.stringify(yPos) !== JSON.stringify(xPos)
      && ["Y1", "Y2", "Y3"].every((id) => ySeen.includes(id))
      && JSON.stringify(ofPositions({ ...doc.graphs.gY, layout: doc.layout })) === JSON.stringify(yPos)
      && said.length === 1 && !errors.length,
    detail: { xPos, yPos, want, ySeen, said, top: doc && Object.keys(doc.layout?.positions ?? {}), errors } };
});

// ── MICRO-IL-GIRO-DELLA-DEV17 (3 ott) ─────────────────────────────────────────
/** every graph's section places only its own nodes; returns {gid: [placed, own-of-placed, units, unitsPlaced]} */
const g3Sections = (doc) => Object.fromEntries(Object.entries(doc?.graphs ?? {}).map(([gid, g]) => {
  const ids = new Set((g.nodes ?? []).map((n) => n.id));
  const placed = Object.keys(g.layout?.positions ?? {});
  const units = (g.nodes ?? []).filter((n) => /^(US|USV|USM|USD|SF|VSF|serSU|serUSD|USVs|USVn|US_|unit)/i.test(String(n.node_type)));
  return [gid, { placed: placed.length, foreign: placed.filter((id) => !ids.has(id)).length,
    units: units.length, unitsPlaced: units.filter((n) => placed.includes(n.id)).length,
    lanes: (g.layout?.swimlanes ?? []).length }];
}));
async function g3Save(doc, path) {
  const { p, ctx, errors } = await open({ doc: null, locale: "en", hook: tauriWrites() });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [doc, path]);
  await p.waitForTimeout(4000);
  await p.keyboard.press("Meta+s");
  await p.waitForTimeout(1500);
  const writes = await p.evaluate(() => window.__WRITES__);
  const log = await p.evaluate(() => (window.__EM_DRAG__.log?.() ?? []).map((x) => x.message));
  await ctx.close();
  return { writes, log, errors, out: writes[0] ? JSON.parse(writes[0].text) : null };
}

test("G3.seed", "G3 · un file VECCHIO il cui layout è del SEME, non del grafo attivo: al Salva il grafo vero ha le posizioni dei suoi nodi, il seme le sue, nessuna sezione ha posizioni d'altri", async () => {
  const seme = OF_GRAPH("seme", ["S1"], 0), vero = OF_GRAPH("vero", ["V1", "V2", "V3"], 400);
  const top = seme.layout; delete seme.layout; delete vero.layout;
  const old = { header: { format: "em.json", version: "1.0" }, active_graph_id: "vero", graphs: { seme, vero }, layout: top };
  const { writes, log, errors, out } = await g3Save(old, "/tmp/g3/seme.em.json");
  const sec = g3Sections(out);
  const said = log.filter((m) => /laid out afresh/.test(m));
  return { pass: writes.length === 1 && sec.vero?.foreign === 0 && sec.vero?.unitsPlaced === 3
      && sec.seme?.foreign === 0 && sec.seme?.unitsPlaced === 1
      && JSON.stringify(ofPositions(out.graphs.seme)) === JSON.stringify(ofPositions(OF_GRAPH("seme", ["S1"], 0)))
      && said.length === 1 && /vero/.test(said[0]) && !errors.length,
    detail: { sec, said, errors } };
});

test("G3.real", "G3 · San Pietro com'era (copia di Tempio_Giunone_Moneta.em.json prima della pulizia), ⌘S: ogni grafo ha nella sua sezione le posizioni dei SUOI nodi; il Tempio le ha tutte", async () => {
  const at = process.env.G3_FILE ?? "/tmp/dev33-banco/G3-sanpietro.em.json";
  if (!existsSync(at)) return { pass: false, detail: { missing: at } };
  const doc = JSON.parse(readFileSync(at, "utf8"));
  const { writes, errors, log, out } = await g3Save(doc, at);
  const sec = g3Sections(out);
  const tempio = sec["3ba146db-9e6a-541c-877e-8e4d85fed6a3"];
  return { pass: writes.length === 1 && Object.values(sec).every((s) => s.foreign === 0)
      && tempio?.units > 0 && tempio.unitsPlaced === tempio.units && tempio.lanes >= 8 && !errors.length,
    detail: { sec, fresh: log.filter((m) => /laid out afresh/.test(m)), errors } };
});

/** catena with a reading on the PICTURE D3 (X9 · D.3.1), as D.02.01 on D.02 */
const catenaReadingOnImage = () => {
  const d = fixture("catena");
  d.graph.nodes.push({ id: "X9", node_type: "extractor", name: "D.3.1" });
  d.graph.edges.push({ id: "X9_D3", source: "X9", target: "D3", edge_type: "extracted_from" });
  return d;
};
test("TS4.noregion", "T-S4 (a) · Doc aperto su una lettura (D.3.1 su D.3): trascinare o cliccare sull'immagine non crea nessun nodo finché non si preme «Region»; la barra dice di sceglierlo", async () => {
  const { p, ctx, errors } = await open({ doc: catenaReadingOnImage(), locale: "en" });
  await p.evaluate(() => window.__EM_DRAG__.openReading("X9"));
  await p.waitForSelector(".rd-img img", { timeout: 8000 });
  await p.waitForFunction(() => document.querySelector(".rd-img img")?.complete, null, { timeout: 8000 });
  await p.waitForTimeout(300);
  const before = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
  const img = await p.evaluate(() => { const r = document.querySelector(".rd-img svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const armedClass = await p.evaluate(() => document.querySelector(".rd-img").classList.contains("armed"));
  const bar = await p.evaluate(() => document.querySelector(".rd-armed")?.textContent ?? "");
  await p.mouse.click(img.x + img.w * 0.4, img.y + img.h * 0.4);
  await p.mouse.move(img.x + img.w * 0.3, img.y + img.h * 0.3); await p.mouse.down();
  await p.mouse.move(img.x + img.w * 0.5, img.y + img.h * 0.5, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
  const bubble = await p.evaluate(() => !!document.querySelector(".rd-bubble"));
  await ctx.close();
  return { pass: after === before && !armedClass && !bubble && /Region or Polygon/.test(bar) && !errors.length,
    detail: { before, after, armedClass, bubble, bar, errors } };
});
test("TS4.logged", "T-S4 (b) · una regione fatta col gesto «Region» crea nodi e il Log ne ha una riga («Edit: …», con i nodi)", async () => {
  const { p, ctx, errors } = await open({ doc: catenaReadingOnImage(), locale: "en" });
  await p.evaluate(() => window.__EM_DRAG__.openReading("X9"));
  await p.waitForSelector(".rd-img img", { timeout: 8000 });
  await p.waitForFunction(() => document.querySelector(".rd-img img")?.complete, null, { timeout: 8000 });
  await p.waitForTimeout(300);
  const before = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
  const logBefore = await p.evaluate(() => window.__EM_DRAG__.log().length);
  await p.click('.rd-tools [data-tool="rect"]');
  await p.waitForTimeout(200);
  const img = await p.evaluate(() => { const r = document.querySelector(".rd-img svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.mouse.move(img.x + img.w * 0.3, img.y + img.h * 0.3); await p.mouse.down();
  await p.mouse.move(img.x + img.w * 0.5, img.y + img.h * 0.5, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
  const lines = await p.evaluate((n) => window.__EM_DRAG__.log().slice(n), logBefore);
  const edit = lines.filter((l) => /^Edit: /.test(l.message));
  await ctx.close();
  return { pass: after > before && edit.length >= 1 && edit.some((l) => l.ids.length > 0 && /created/.test(l.message)) && !errors.length,
    detail: { before, after, edit, errors } };
});

// ── K1 · K2 · the status line and the room, on the dev stack's node (LIVE) ──
const K_NODE = (process.env.LIVE_NODE ?? "").replace(/\/+$/, "");
const kToken = (user) => {
  const out = execFileSync("curl", ["-sk", "-X", "POST",
    K_NODE.replace(/\/em$/, "") + "/auth/realms/em-dev/protocol/openid-connect/token",
    "-d", "grant_type=password", "-d", "client_id=em-server", "-d", "client_secret=em-dev-secret",
    "-d", `username=${user}`, "-d", `password=${user}`], { encoding: "utf8" });
  return JSON.parse(out).access_token;
};
const kGet = (path, tok) => JSON.parse(execFileSync("curl", ["-sk", `${K_NODE}/v1${path}`, "-H", `Authorization: Bearer ${tok}`], { encoding: "utf8" }));
const K_SETTINGS = () => ({ "emstudio.settings": JSON.stringify({ sync: { hubUrl: K_NODE, hubRoom: "cantiere-demo" } }) });
if (K_NODE) test("TK1.live", "T-K1 dal vivo · nodo del dev stack, utente dev in «cantiere-demo»: la voce di stato dice nodo, accesso e nome della stanza; spento il nodo (le richieste cadono), dice «nodo non raggiungibile» entro 30 s", async () => {
  const { p, ctx, errors } = await open({ doc: null, locale: "en", init: K_SETTINGS() });
  await p.waitForFunction(() => /node reachable/.test(window.__EM_DRAG__.statusLine()), null, { timeout: 15000 }).catch(() => {});
  const first = await p.evaluate(() => window.__EM_DRAG__.statusLine());
  await p.evaluate(([u, tok]) => window.__EM_DRAG__.joinRoom(u, "cantiere-demo", tok), [K_NODE, kToken("dev")]);
  await p.waitForFunction(() => /Cantiere · demo/.test(window.__EM_DRAG__.statusLine()), null, { timeout: 15000 }).catch(() => {});
  const inRoom = await p.evaluate(() => window.__EM_DRAG__.statusLine());
  await ctx.route(`${K_NODE}/**`, (r) => r.abort());
  const t0 = Date.now();
  await p.waitForFunction(() => /node not reachable/.test(window.__EM_DRAG__.statusLine()), null, { timeout: 30000 }).catch(() => {});
  const off = await p.evaluate(() => window.__EM_DRAG__.statusLine());
  const secs = Math.round((Date.now() - t0) / 1000);
  await ctx.close();
  return { pass: /em\.localhost:8443/.test(first) && /node reachable/.test(first)
      && /em\.localhost:8443/.test(inRoom) && /Cantiere · demo/.test(inRoom) && !/not signed in/.test(inRoom)
      && /node not reachable/.test(off) && secs <= 30 && !errors.length,
    detail: { first, inRoom, off, secs, errors } };
});
if (K_NODE) test("TK2.live", "T-K2 dal vivo · stanza «cantiere-demo» di dev: il pannello dice «yours» e i membri sono quelli di GET /v1/rooms/{id}/members; con viewer dice «of <dev>», nessun gesto d'invito, «Leave the room»", async () => {
  const run = async (user) => {
    const { p, ctx, errors } = await open({ doc: null, locale: "en", init: K_SETTINGS() });
    const tok = kToken(user);
    await p.evaluate(([u, tk]) => window.__EM_DRAG__.joinRoom(u, "cantiere-demo", tk), [K_NODE, tok]);
    await p.waitForTimeout(1500);
    await p.evaluate(() => window.__EM_DRAG__.roomPanel("cantiere-demo"));
    await p.waitForFunction(() => !!document.querySelector("#conn-pop.conn-room h4"), null, { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const pop = document.getElementById("conn-pop");
      return { head: pop?.querySelector("h4")?.textContent ?? "", own: pop?.querySelector("h4")?.dataset.own,
        rows: [...(pop?.querySelectorAll(".conn-members li[data-orcid]") ?? [])].map((li) => [li.dataset.orcid, li.querySelector(".conn-role")?.textContent]),
        invite: !!pop?.querySelector(".conn-add"), leave: [...(pop?.querySelectorAll(".conn-btn") ?? [])].some((b) => /Leave the room/.test(b.textContent)),
        onNode: [...(pop?.querySelectorAll(".conn-btn") ?? [])].some((b) => /Open on the node/.test(b.textContent)) };
    });
    await p.screenshot({ path: SHOT(`tk2-stanza-${user}`) }).catch(() => {});
    await ctx.close();
    return { ...r, errors, tok };
  };
  const dev = await run("dev"), viewer = await run("viewer");
  const truth = kGet("/rooms/cantiere-demo/members", dev.tok);
  const want = [[truth.owner, "owner"], ...truth.members.map((m) => [m.orcid, m.role])];
  return { pass: dev.own === "yours" && /· yours$/.test(dev.head) && JSON.stringify(dev.rows) === JSON.stringify(want) && dev.invite && dev.onNode
      && viewer.own === "theirs" && /of 0000-0002-1825-0097/.test(viewer.head) && !viewer.invite && !viewer.rows.length && viewer.leave
      && !dev.errors.length && !viewer.errors.length,
    detail: { dev: { ...dev, tok: undefined }, viewer: { ...viewer, tok: undefined }, want } };
});

test("TY5.already", "T-Y5 (lato EMStudio) · Blender risponde «il proxy c'è già» (delta vuoto, info.already): nessun nodo aggiunto, il messaggio lo dice con l'oggetto selezionato, e il Log ne ha la riga", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en" });
  const before = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
  await p.evaluate(() => window.__EM_DRAG__.commandResult({ cmd_id: "c1", ok: true, delta: { nodes: [], edges: [] },
    info: { proxy_object: "GT16.SU002", reused_object: true, already: true } }));
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
  const log = await p.evaluate(() => window.__EM_DRAG__.log().map((l) => l.message));
  await ctx.close();
  const line = log.find((m) => /already there \(GT16\.SU002\): selected in Blender, nothing added/.test(m));
  return { pass: after === before && !!line && !errors.length, detail: { before, after, line, errors } };
});

test("Y1.wait", "Y1 · Sidecar senza Blender: la voce di stato dice «in attesa di Blender…» e riprova da sola; quando Blender apre il server, si collega senza rifare Mode › Sidecar; Standalone smette di aspettare", async () => {
  const port = 8899;
  let blender = false, opened = 0, tries = 0;
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en",
    init: { "emstudio.settings": JSON.stringify({ sync: { protocol: "ws", host: "localhost", port } }) },
    wsRoute: { pattern: new RegExp(`localhost:${port}`), handler: (ws) => {
      tries++;
      if (!blender) { ws.close(); return; }
      opened++;
      ws.onMessage(() => {});
    } } });
  await p.click("#dd-mode .dd-toggle");
  await p.click("#btn-mode-sidecar");
  await p.waitForTimeout(1200);
  const waiting = await p.evaluate(() => window.__EM_DRAG__.statusLine());
  await p.waitForTimeout(3500);
  blender = true;
  await p.waitForFunction(() => document.body.classList.contains("sync-active"), null, { timeout: 9000 }).catch(() => {});
  const back = await p.evaluate(() => ({ line: window.__EM_DRAG__.statusLine(), active: document.body.classList.contains("sync-active") }));
  await p.click("#dd-mode .dd-toggle");
  await p.click("#btn-mode-standalone");
  await p.waitForTimeout(400);
  const off = await p.evaluate(() => window.__EM_DRAG__.statusLine());
  const log = await p.evaluate(() => window.__EM_DRAG__.log().map((l) => l.message));
  await ctx.close();
  return { pass: /Sidecar · waiting for Blender/.test(waiting) && back.active && opened >= 1 && !/waiting/.test(back.line)
      && /^Standalone/.test(off) && log.some((m) => /Blender is back/.test(m)) && !errors.length,
    detail: { waiting, back, opened, tries, off, errors } };
});

test("Y2.blender", "Y2 · un file «Temple» (EM 1.6.16) aperto, poi Sidecar: il grafo di Blender «Temple» (EM 1.6.24) si chiama «Temple · from Blender (sync)» nell'EMTree e nella striscia del nome, una riga dice che è attivo, e le versioni EM diverse sono dette", async () => {
  const temple = (em, units) => ({ header: { format: "em.json", version: "1.0", datamodel_versions: { nodes: em } },
    graph: { graph_id: `t-${em}`, name: "Temple", nodes: units.map((u) => ({ id: u, node_type: "US", name: u })), edges: [] } });
  const fromBlender = temple("1.6.24", ["SU001", "SU002"]);
  const { p, ctx, errors } = await open({ doc: null, locale: "en",
    init: { "emstudio.settings": JSON.stringify({ sync: { protocol: "ws", host: "localhost", port: 8898 } }) },
    wsRoute: { pattern: /localhost:8898/, handler: (ws) => {
      ws.onMessage((m) => {
        const msg = JSON.parse(String(m));
        if (msg.type === "request_snapshot") ws.send(JSON.stringify({ v: 2, type: "snapshot", source: "blender", payload: { doc: fromBlender, host: { tool: "Blender" } } }));
      });
    } } });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d]) => window.__EM_DRAG__.openAt(d, "/tmp/y2/Temple.em.json"), [temple("1.6.16", ["SU001"])]);
  await p.waitForTimeout(1500);
  await p.click("#dd-mode .dd-toggle");
  await p.click("#btn-mode-sidecar");
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => ({ slots: window.__EM_DRAG__.slots(), strip: document.getElementById("ns-title")?.textContent,
    log: window.__EM_DRAG__.log().map((l) => l.message) }));
  await workspace(p, "assets");
  const tree = await p.evaluate(() => [...document.querySelectorAll(".et-pick")].map((e) => e.textContent.trim()));
  await ctx.close();
  const active = r.slots.find((x) => x.active);
  return { pass: active?.name === "Temple · from Blender (sync)" && /Temple · from Blender \(sync\)/.test(r.strip ?? "")
      && tree.some((x) => /Temple · from Blender \(sync\)/.test(x))
      && r.log.some((m) => /active graph is now «Temple · from Blender \(sync\)», EM 1\.6\.24/.test(m))
      && r.log.some((m) => /EM 1\.6\.24, the open file with EM 1\.6\.16/.test(m)) && !errors.length,
    detail: { slots: r.slots, strip: r.strip, tree, log: r.log.filter((m) => /Blender|EM 1/.test(m)), errors } };
});

test("X1.blocked", "X1 · in Standalone, Inspector di un'unità: «Model the proxy in Blender» è spento in modo visibile (tratteggiato, aria-disabled) e accanto c'è la frase «connect (Mode › Sidecar)» col gesto «Connect to Blender»", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en" });
  await pick(p, "USM101");
  const r = await p.evaluate(() => {
    const b = [...document.querySelectorAll(".insp-btn")].find((x) => /Model the proxy in Blender/.test(x.textContent));
    const why = document.querySelector(".insp-blocked");
    return b && { disabled: b.disabled, aria: b.getAttribute("aria-disabled"), cls: b.className,
      border: getComputedStyle(b).borderStyle, why: why?.querySelector("span")?.textContent ?? null,
      fix: why?.querySelector(".insp-blocked-fix")?.textContent ?? null };
  });
  await ctx.close();
  return { pass: !!r && r.disabled && r.aria === "true" && r.border === "dashed" && /Mode › Sidecar/.test(r.why ?? "")
      && r.fix === "Connect to Blender" && !errors.length, detail: { r, errors } };
});

const TEMPIO = process.env.TEMPIO_FILE ?? "/tmp/dev33-banco/tempio.em.json";
test("TI3.ids", "T-I3 · Tempio (copia), Inspector di USM01b: con «Show node UUIDs» spento nessun graph_id né original_id, la grafica yEd dietro «Technical details» chiuso, niente label né stratigraphic_kind doppi; acceso, gli id ci sono (dentro «Technical details»)", async () => {
  if (!existsSync(TEMPIO)) return { pass: false, detail: { missing: TEMPIO } };
  const run = async (showIds) => {
    const { p, ctx, errors } = await open({ doc: null, locale: "en",
      init: { "emstudio.settings": JSON.stringify({ developer: { showNodeIds: showIds } }) } });
    await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
    await p.evaluate(([d]) => window.__EM_DRAG__.openAt(d, "/tmp/dev33-banco/tempio.em.json"), [JSON.parse(readFileSync(TEMPIO, "utf8"))]);
    await p.waitForTimeout(3000);
    await pick(p, "698e2c22-2e87-4773-97d4-c3107fc63fe9");
    const r = await p.evaluate(() => {
      const root = document.querySelector(".insp-data")?.closest("#inspector, .insp-root, [data-surface], .tile-area") ?? document;
      const keys = (sel) => [...root.querySelectorAll(sel)].map((d) => d.textContent);
      const tech = root.querySelector("details.insp-tech");
      return { main: keys(":scope .insp-data:not(details .insp-data) dt"), tech: tech ? [...tech.querySelectorAll("dt")].map((d) => d.textContent) : [],
        open: tech?.open ?? null, text: root.textContent };
    });
    await ctx.close();
    return { ...r, errors };
  };
  const off = await run(false), on = await run(true);
  const noIds = (x) => !x.main.includes("graph_id") && !x.main.includes("original_id") && !x.tech.includes("graph_id") && !x.tech.includes("original_id");
  return { pass: noIds(off) && off.open === false && ["shape", "y_pos", "fill_color", "border_style", "symbol"].every((k) => off.tech.includes(k))
      && !off.main.includes("label") && !off.main.includes("stratigraphic_kind")
      && on.tech.includes("graph_id") && on.tech.includes("original_id") && !on.main.includes("graph_id") && !off.errors.length && !on.errors.length,
    detail: { off: { main: off.main, tech: off.tech, open: off.open }, on: { main: on.main, tech: on.tech } } };
});

test("TT1.undated", "T-T1 · Tempio (copia, nessuna epoca con date): «Check the chronology…» dice «No epoch has dates: nothing to check» col gesto «Write the epochs' dates…», mai «No overlap»", async () => {
  if (!existsSync(TEMPIO)) return { pass: false, detail: { missing: TEMPIO } };
  const { p, ctx, errors } = await open({ doc: null, locale: "en" });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d]) => window.__EM_DRAG__.openAt(d, "/tmp/dev33-banco/tempio.em.json"), [JSON.parse(readFileSync(TEMPIO, "utf8"))]);
  await p.waitForTimeout(3000);
  await openChrono(p);
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => ({ cards: [...document.querySelectorAll(".chr-card")].map((c) => c.textContent),
    gesture: [...document.querySelectorAll(".chr-card.none button")].map((b) => b.textContent) }));
  if (r.gesture.length) await p.click(".chr-card.none button");
  await p.waitForTimeout(200);
  const focus = await p.evaluate(() => document.activeElement?.dataset?.chnum ?? null);
  await ctx.close();
  return { pass: r.cards.some((c) => /No epoch has dates: nothing to check/.test(c)) && !r.cards.some((c) => /No overlap/.test(c))
      && r.gesture.includes("Write the epochs' dates…") && /\|start$/.test(focus ?? "") && !errors.length,
    detail: { ...r, focus, errors } };
});

test("I6.openwith", "I6 · «Open with…» nell'Inspector e nel menu contestuale del nodo: StratiField · scheda US, Blender, Heriverse; in Standalone senza stanza né scena tutte spente, ognuna col motivo in una riga", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en" });
  await pick(p, "USM101");
  const insp = await p.evaluate(() => [...document.querySelectorAll(".insp-openwith-row")].map((r) => ({
    key: r.querySelector("button")?.dataset.openwith, off: r.querySelector("button")?.disabled, why: r.querySelector(".insp-openwith-why")?.textContent ?? "" })));
  // the context menu: right-click on the selected node
  const win = await winOf(p, "graph");
  const ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const inside = (b) => b.x > ws.rect.x + 5 && b.y > ws.rect.y + 5
    && b.x + b.w < ws.rect.x + ws.rect.w - 5 && b.y + b.h < ws.rect.y + ws.rect.h - 5 && b.w > 20;
  const bx = ws.boxes.find((b) => b.id === "USM101" && inside(b)) ?? ws.boxes.find(inside);
  const at = bx ? { x: bx.x + bx.w / 2, y: bx.y + bx.h / 2 } : null;
  if (bx && bx.id !== "USM101") await pick(p, bx.id);
  let menu = null;
  if (at) {
    await p.mouse.click(at.x, at.y, { button: "right" });
    await p.waitForTimeout(300);
    menu = await p.evaluate(() => ({ head: document.querySelector(".ctx-menu .ctx-sub")?.textContent,
      items: [...document.querySelectorAll(".ctx-menu [data-openwith]")].map((b) => [b.dataset.openwith, b.disabled]),
      whys: [...document.querySelectorAll(".ctx-menu .ctx-why")].length }));
  }
  await ctx.close();
  return { pass: insp.map((x) => x.key).join() === "stratifield,blender,heriverse" && insp.every((x) => x.off && x.why.length > 10)
      && !!at && menu?.head === "Open with…" && menu.items.length === 3 && menu.whys >= 1 && !errors.length,
    detail: { insp, menu, at, picked: bx?.id, errors } };
});

test("F8.node", "F8 (U17) · Impostazioni › Sync: «Il tuo nodo StratiGraph» prima e a parte da Blender; il campo vuoto dice «per esempio …»; il rimando di «Chi sei» porta dritto al campo; «Prova» dice raggiungibile, versione e modi d'accesso; la stanza sta col nodo, nella lingua dell'interfaccia", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriHook(),
    route: { pattern: "https://nodo.test/**", handler: (r) => {
      const u = r.request().url();
      const h = { "access-control-allow-origin": "*" };
      if (u.endsWith("/v1/health")) return r.fulfill({ status: 200, headers: h, json: { service: "stratigraph-server", version: "0.9.1", s3dgraphy: "1.6.0.dev30", auth: "keycloak" } });
      if (u.endsWith("/v1/auth-config")) return r.fulfill({ status: 200, headers: h, json: { issuer: "https://nodo.test/realms/sg", client_id: "emstudio", authorization_endpoint: "https://nodo.test/a", token_endpoint: "https://nodo.test/t", enforcing: true, orcid_idp: "orcid", node_name: "Nodo di prova" } });
      return r.fulfill({ status: 404, headers: h, body: "" });
    } } });
  await p.click("#footer-identity");
  await p.waitForTimeout(600);
  await p.click("[data-idp-configure]");
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const node = document.getElementById("settings-sect-node"), sync = document.getElementById("settings-sect-sync");
    const url = document.getElementById("set-hub-url");
    return { focus: document.activeElement?.id ?? null, nodeH: node?.querySelector("h4")?.textContent,
      syncH: sync?.querySelector("h4")?.textContent, order: !!node && !!sync && !!(node.compareDocumentPosition(sync) & Node.DOCUMENT_POSITION_FOLLOWING),
      ph: url?.placeholder, value: url?.value, room: node?.querySelector("#set-hub-room")?.closest("label")?.textContent.trim(),
      roomInNode: !!node?.querySelector("#set-hub-room"), signin: !!node?.querySelector("#set-node-signin") };
  });
  await p.fill("#set-hub-url", "https://nodo.test");
  await p.click("#set-node-test");
  await p.waitForFunction(() => /Reachable|does not answer|not a/.test(document.getElementById("set-node-result")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  const result = await p.evaluate(() => document.getElementById("set-node-result")?.textContent ?? "");
  await p.screenshot({ path: SHOT("f8-impostazioni-nodo") }).catch(() => {});
  await ctx.close();
  return { pass: r.focus === "set-hub-url" && r.nodeH === "Your StratiGraph node" && r.syncH === "Sync with Blender / EMtools" && r.order
      && r.ph === "for example https://em.localhost:8443" && r.value === "" && r.roomInNode && r.room === "Room" && r.signin
      && /Reachable: https:\/\/nodo\.test · StratiGraph Server 0\.9\.1/.test(result) && /ORCID, through the node/.test(result) && !errors.length,
    detail: { r, result, errors } };
});

// ── MICRO-ENTRARE-DAL-DESKTOP (3 ott) · E1–E5 ────────────────────────────────
/** a Tauri shell that RECORDS the URLs opened in the system browser and can
 *  DELIVER a deep link the way the OS does (`deep-link://new-url` → onOpenUrl) */
const tauriDesktop = () => (() => {
  window.__OPENED__ = [];
  window.__WRITES__ = [];
  const callbacks = new Map();
  const listeners = [];
  let next = 1;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
    transformCallback: (cb) => { const id = next++; callbacks.set(id, cb); return id; },
    unregisterCallback: (id) => callbacks.delete(id), convertFileSrc: (x) => x,
    invoke: async (cmd, args, opts) => {
      if (cmd === "plugin:opener|open_url") { window.__OPENED__.push(String(args?.url ?? "")); return null; }
      if (cmd === "plugin:event|listen") { listeners.push({ event: args.event, handler: args.handler }); return listeners.length; }
      if (cmd === "plugin:deep-link|get_current") return null;
      if (cmd === "plugin:fs|write_text_file") {
        const raw = opts?.headers?.path ?? args?.path ?? "";
        const text = args instanceof Uint8Array ? new TextDecoder().decode(args) : String(args?.data ?? "");
        window.__WRITES__.push({ path: decodeURIComponent(raw), text });
        return null;
      }
      if (cmd === "transformer_url") return window.__BRIDGE__ ?? null;
      if (cmd === "plugin:dialog|save") return window.__SAVE_PATH__ ?? null;
      if (cmd === "llm_key_status") return { available: false, set: false, detail: "test" };
      return null;
    },
  };
  // ORCID reachable: the panel's probe is a no-cors fetch of ORCID's favicon,
  // and Playwright cannot fulfil an intercepted no-cors request (measured: it
  // always fails, whatever the answer) — so the probe alone is answered here
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const u = typeof input === "string" ? input : input?.url ?? "";
    if (init?.mode === "no-cors" && /^https:\/\/(sandbox\.)?orcid\.org\/favicon\.ico$/.test(u)) return Promise.resolve(new Response(null, { status: 200 }));
    return realFetch(input, init);
  };
  /** the OS hands the app a URL */
  window.__DEEPLINK__ = (url) => {
    for (const l of listeners) if (l.event === "deep-link://new-url") callbacks.get(l.handler)?.({ event: l.event, id: 1, payload: [url] });
  };
});
const ORCID_ID = "0000-0002-1825-0097";
/** a key that plays ORCID: it signs id_tokens, and its public half is served as ORCID's JWKS */
const fakeOrcid = async () => {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await subtle.exportKey("jwk", key.publicKey)), kid: "bench-orcid", use: "sig" };
  const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = async (claims) => {
    const h = b64u(JSON.stringify({ alg: "RS256", kid: jwk.kid })), q = b64u(JSON.stringify(claims));
    const sig = await subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, new TextEncoder().encode(`${h}.${q}`));
    return `${h}.${q}.${b64u(sig)}`;
  };
  const route = { pattern: "https://orcid.org/**", handler: (r) => {
    const u = r.request().url(), h = { "access-control-allow-origin": "*" };
    if (u.endsWith("/oauth/jwks")) return r.fulfill({ status: 200, headers: h, json: { keys: [jwk] } });
    return r.fulfill({ status: 200, headers: h, body: "" });         // the favicon: ORCID is reachable
  } };
  return { token, route };
};
const idPanel = (p) => p.evaluate(() => ({
  state: document.querySelector(".idpanel .idp-state")?.dataset.idpState ?? null,
  stateText: document.querySelector(".idpanel .idp-state")?.textContent ?? "",
  paste: document.querySelector(".idpanel [data-idp-paste]")?.dataset.idpPaste ?? null,
  ways: Object.fromEntries([...document.querySelectorAll(".idpanel [data-idp-way]")].map((w) => [w.dataset.idpWay,
    { ready: w.dataset.idpReady, hidden: w.hidden, closed: w.dataset.idpClosed ?? null, desc: w.querySelector(".idp-d")?.textContent ?? "" }])),
}));

test("E1.orcid", "E1 · «Sign in with ORCID» sul desktop: ORCID si apre nel BROWSER DI SISTEMA (mai nella webview) col client di EMStudio e il ritorno https://extendedmatrix.org/orcid/callback/; la risposta torna per deep link org.extendedmatrix.emstudio:/orcid-return#…, è verificata (firma, nonce) e l'iD diventa verificato da orcid.org", async () => {
  const orcid = await fakeOrcid();
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriDesktop(), route: orcid.route });
  await p.click("#footer-identity");
  await p.waitForFunction(() => document.querySelector('.idpanel [data-idp-way="orcid"]')?.dataset.idpReady === "true", null, { timeout: 8000 }).catch(() => {});
  const before = await idPanel(p);
  const href0 = await p.evaluate(() => location.href);
  await p.locator('.idpanel [data-idp-way="orcid"] button').click();
  await p.waitForTimeout(800);
  const opened = await p.evaluate(() => window.__OPENED__.slice());
  const waiting = await idPanel(p);
  const url = opened[0] ? new URL(opened[0]) : null;
  const q = (k) => url?.searchParams.get(k) ?? null;
  let after = null, chip = "";
  if (url) {
    const tk = await orcid.token({ iss: "https://orcid.org", aud: q("client_id"), sub: ORCID_ID, nonce: q("nonce"), exp: Math.floor(Date.now() / 1000) + 600, given_name: "Emanuel", family_name: "Demetrescu" });
    await p.evaluate((u) => window.__DEEPLINK__(u), `org.extendedmatrix.emstudio:/orcid-return#id_token=${tk}&state=${q("state")}`);
    await p.waitForTimeout(1200);
    chip = await p.evaluate(() => document.getElementById("footer-identity")?.title ?? "");
    await p.click("#footer-identity");
    await p.waitForTimeout(500);
    after = await idPanel(p);
  }
  const href1 = await p.evaluate(() => location.href);
  await p.screenshot({ path: SHOT("e1-orcid-desktop") }).catch(() => {});
  await ctx.close();
  return { pass: before.ways.orcid?.ready === "true" && opened.length === 1 && url?.origin === "https://orcid.org"
      && q("client_id") === "APP-DBYSPGP676HKN8OE" && q("redirect_uri") === "https://extendedmatrix.org/orcid/callback/"
      && q("response_type") === "id_token" && waiting.paste === "orcid" && href1 === href0
      && after?.state === "verified" && /0000-0002-1825-0097/.test(after?.stateText ?? "") && /orcid\.org/.test(after?.stateText ?? "") && !errors.length,
    detail: { before: before.ways.orcid, opened, waiting: waiting.paste, after, chip, href0, href1, errors } };
});

test("E1.paste", "E1 · il ripiego: se lo schema non si apre, la pagina mostra la risposta come codice; «Incolla la risposta di ORCID» la prende e la verifica uguale; un token di un altro giro (altro nonce) è rifiutato e l'identità resta com'era", async () => {
  const orcid = await fakeOrcid();
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriDesktop(), route: orcid.route });
  const start = async () => {
    await p.click("#footer-identity");
    await p.waitForFunction(() => document.querySelector('.idpanel [data-idp-way="orcid"]')?.dataset.idpReady === "true", null, { timeout: 8000 }).catch(() => {});
    await p.locator('.idpanel [data-idp-way="orcid"] button').click();
    await p.waitForTimeout(700);
    return new URL(await p.evaluate(() => window.__OPENED__.at(-1)));
  };
  const paste = async (text) => {
    await p.fill(".idpanel [data-idp-paste-input]", text);
    await p.click(".idpanel [data-idp-paste-go]");
    await p.waitForTimeout(1200);
  };
  // 1 · a token minted for ANOTHER round trip: refused
  let url = await start();
  const exp = Math.floor(Date.now() / 1000) + 600;
  const wrong = await orcid.token({ iss: "https://orcid.org", aud: url.searchParams.get("client_id"), sub: ORCID_ID, nonce: "0".repeat(48), exp });
  await paste(`#id_token=${wrong}&state=${url.searchParams.get("state")}`);
  const refused = await p.evaluate(() => ({ toast: [...document.querySelectorAll(".toast, #toast")].map((x) => x.textContent).join(" | "),
    chip: document.getElementById("footer-identity")?.dataset.state ?? document.getElementById("footer-identity")?.className ?? "" }));
  const log1 = await p.evaluate(() => (window.__EM_DRAG__.log?.() ?? []).map((x) => x.message).filter((m) => /identity/.test(m)).join("\n"));
  // 2 · the right one, pasted the way the page shows it
  url = await start();
  const right = await orcid.token({ iss: "https://orcid.org", aud: url.searchParams.get("client_id"), sub: ORCID_ID, nonce: url.searchParams.get("nonce"), exp });
  await paste(`  #id_token=${right}&state=${url.searchParams.get("state")}  `);
  await p.click("#footer-identity");
  await p.waitForTimeout(500);
  const after = await idPanel(p);
  await p.screenshot({ path: SHOT("e1-incolla") }).catch(() => {});
  await ctx.close();
  return { pass: /nonce/.test(log1) && after.state === "verified" && /0000-0002-1825-0097/.test(after.stateText) && !errors.length,
    detail: { refused, log1, after, errors } };
});

/** a node at https://nodo.test whose realm has an ORCID provider WITHOUT a client
 *  (`orcid_idp_ready: false`), a token endpoint that checks the exchange, and a
 *  whoami that says «the node's password» */
const fakeNode = (seen) => ({ pattern: "https://nodo.test/**", handler: async (r) => {
  const u = r.request().url();
  const h = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
  if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: h });
  if (u.endsWith("/v1/health")) return r.fulfill({ status: 200, headers: h, json: { service: "stratigraph-server", version: "0.9.2", s3dgraphy: "1.6.0.dev31", auth: "keycloak" } });
  if (u.endsWith("/v1/auth-config")) return r.fulfill({ status: 200, headers: h, json: { issuer: "https://nodo.test/realms/em-dev", client_id: "em-console",
    authorization_endpoint: "https://nodo.test/realms/em-dev/protocol/openid-connect/auth", token_endpoint: "https://nodo.test/realms/em-dev/protocol/openid-connect/token",
    enforcing: true, orcid_idp: "orcid", orcid_idp_ready: false, orcid_idp_why: "the realm's «orcid» provider has no ORCID client (client id: orcid-client-not-registered)", node_name: "Nodo di prova" } });
  if (u.endsWith("/protocol/openid-connect/token")) {
    const body = Object.fromEntries(new URLSearchParams(r.request().postData() ?? ""));
    seen.exchange = body;
    const good = body.code === "C0DE" && body.redirect_uri === "org.extendedmatrix.emstudio:/oidc-return" && !!body.code_verifier && !body.client_secret;
    return r.fulfill({ status: good ? 200 : 400, headers: h, json: good ? { access_token: "AT-nodo", refresh_token: "RT", expires_in: 900 } : { error: "invalid_grant" } });
  }
  if (u.endsWith("/v1/whoami")) {
    seen.whoamiAuth = r.request().headers().authorization ?? null;
    return r.fulfill({ status: 200, headers: h, json: { orcid: ORCID_ID, name: "Dev", enforcing: true, auth_mode: "node_password", attested_by: "Nodo di prova" } });
  }
  return r.fulfill({ status: 404, headers: h, body: "" });
} });

test("E2.nodepw", "E2+E3 · dal desktop, «iD and the node's password»: il nodo dice che il suo ORCID non ha client e «Chi sei» chiude quella via col perché; la password del nodo apre il login nel browser di sistema col redirect org.extendedmatrix.emstudio:/oidc-return; il codice torna per deep link, lo scambio nomina lo stesso redirect (PKCE, niente segreto) e l'identità è attestata dal nodo", async () => {
  const seen = {};
  const orcid = await fakeOrcid();
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriDesktop(), route: fakeNode(seen),
    init: { "emstudio.settings": JSON.stringify({ sync: { hubUrl: "https://nodo.test" } }) } });
  await p.route(orcid.route.pattern, orcid.route.handler);
  await p.click("#footer-identity");
  await p.waitForFunction(() => document.querySelector('.idpanel [data-idp-way="nodepw"]')?.dataset.idpReady === "true", null, { timeout: 8000 }).catch(() => {});
  const before = await idPanel(p);
  await p.fill(".idpanel [data-idp-orcid]", ORCID_ID);
  await p.locator('.idpanel [data-idp-way="nodepw"] button').click();
  await p.waitForTimeout(900);
  const opened = await p.evaluate(() => window.__OPENED__.slice());
  const waiting = await idPanel(p);
  const url = opened[0] ? new URL(opened[0]) : null;
  if (url) {
    await p.evaluate((u) => window.__DEEPLINK__(u), `org.extendedmatrix.emstudio:/oidc-return?state=${url.searchParams.get("state")}&session_state=x&iss=https%3A%2F%2Fnodo.test&code=C0DE`);
    await p.waitForTimeout(1500);
  }
  seen.panelAfterReturn = await p.evaluate(() => ({ open: !!document.querySelector(".idpanel"), expanded: document.getElementById("footer-identity")?.getAttribute("aria-expanded"),
    log: (window.__EM_DRAG__.log?.() ?? []).map((x) => x.message).filter((m) => /identity/.test(m)).slice(-4) }));
  // signed in to the node, the chip leads to the node's settings (rung «identity»):
  // the identity is read where it is said — the chip and Settings › Identity
  const after = await p.evaluate(() => ({ chip: document.getElementById("footer-identity")?.title ?? "" }));
  await p.evaluate(() => window.__EM_DRAG__.openSettings?.("settings-sect-identity"));
  await p.waitForTimeout(400);
  after.set = await p.evaluate(() => document.getElementById("set-orcid-state")?.textContent ?? "");
  await p.screenshot({ path: SHOT("e2-password-del-nodo") }).catch(() => {});
  await ctx.close();
  const w1 = before.ways.stratigraph ?? {};
  return { pass: w1.ready === "false" && w1.closed === "no-client" && /no ORCID client/.test(w1.desc)
      && before.ways.nodepw?.ready === "true" && !before.ways.nodepw?.hidden
      && opened.length === 1 && url?.searchParams.get("redirect_uri") === "org.extendedmatrix.emstudio:/oidc-return"
      && url?.searchParams.get("login_hint") === ORCID_ID && url?.searchParams.get("code_challenge_method") === "S256"
      && waiting.paste === "node"
      && seen.exchange?.redirect_uri === "org.extendedmatrix.emstudio:/oidc-return" && seen.whoamiAuth === "Bearer AT-nodo"
      && /attested by the node Nodo di prova/.test(after.chip) && /Attested by the node Nodo di prova: Dev \(0000-0002-1825-0097\)/.test(after.set) && !errors.length,
    detail: { w1, nodepw: before.ways.nodepw, opened, waiting: waiting.paste, exchange: seen.exchange && { ...seen.exchange, code_verifier: "…" }, whoami: seen.whoamiAuth, panelAfterReturn: seen.panelAfterReturn, after, errors } };
});

/** the realm's login form, filled the way a person fills it, with curl: the
 *  authorize URL the app opened → the form → user and password → the 302 that
 *  Keycloak sends towards the app's scheme. Returns that Location. */
const keycloakLogin = (authorizeUrl, user, password) => {
  const jar = `${process.env.TMPDIR ?? "/tmp"}/e2-live-cookies-${process.pid}`;
  const html = execFileSync("curl", ["-sk", "-c", jar, "-b", jar, authorizeUrl], { encoding: "utf8" });
  const action = (html.match(/action="([^"]+)"/)?.[1] ?? "").replace(/&amp;/g, "&");
  if (!action) throw new Error("no login form at the realm");
  const head = execFileSync("curl", ["-sk", "-c", jar, "-b", jar, "-o", "/dev/null", "-D", "-",
    "--data-urlencode", `username=${user}`, "--data-urlencode", `password=${password}`, action], { encoding: "utf8" });
  return head.match(/^location:\s*(\S+)/im)?.[1] ?? null;
};

// LIVE: only with LIVE_NODE (e.g. https://em.localhost:8443/em) — the dev stack's
// real Keycloak (realm em-dev, client em-console with the desktop's redirect)
// and the real StratiGraph Server. The page is served from localhost:5199, not
// tauri://localhost, so this browser runs without CORS: the realm's answer to
// `Origin: tauri://localhost` is measured with curl in the night's report.
if (process.env.LIVE_NODE) test("E2.live", "E2 dal vivo · il nodo del dev stack: «iD and the node's password» con l'utente dev del realm em-dev — il login vero di Keycloak torna per org.extendedmatrix.emstudio:/oidc-return, lo scambio del codice passa, /v1/whoami dice dev e l'identità è attestata dal nodo", async () => {
  const node = process.env.LIVE_NODE.replace(/\/+$/, "");
  const live = await chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined, args: ["--disable-web-security"] });
  const ctx = await live.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await p.addInitScript(([settings]) => {
    if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "en"); localStorage.setItem("emstudio.settings", settings); sessionStorage.setItem("probe", "1"); }
  }, [JSON.stringify({ sync: { hubUrl: node } })]);
  await p.addInitScript(tauriDesktop());
  await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(BRIDGE)}`);
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 30000 });
  await p.click("#footer-identity");
  await p.waitForFunction(() => document.querySelector('.idpanel [data-idp-way="nodepw"]')?.dataset.idpReady === "true", null, { timeout: 15000 }).catch(() => {});
  const before = await idPanel(p);
  await p.fill(".idpanel [data-idp-orcid]", ORCID_ID);           // dev's iD in the realm
  await p.locator('.idpanel [data-idp-way="nodepw"] button').click({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const opened = await p.evaluate(() => window.__OPENED__.slice());
  let location = null;
  if (opened[0]) {
    location = keycloakLogin(opened[0], process.env.LIVE_USER ?? "dev", process.env.LIVE_PASSWORD ?? "dev");
    if (location) await p.evaluate((u) => window.__DEEPLINK__(u), location);
    await p.waitForTimeout(2500);
  }
  const chip = await p.evaluate(() => document.getElementById("footer-identity")?.title ?? "");
  await p.evaluate(() => window.__EM_DRAG__.openSettings?.("settings-sect-identity"));
  await p.waitForTimeout(400);
  const set = await p.evaluate(() => document.getElementById("set-orcid-state")?.textContent ?? "");
  const log = await p.evaluate(() => (window.__EM_DRAG__.log?.() ?? []).map((x) => x.message).filter((m) => /identity/.test(m)).slice(-5));
  await p.screenshot({ path: SHOT("e2-dal-vivo") }).catch(() => {});
  await live.close();
  const u = opened[0] ? new URL(opened[0]) : null;
  return { pass: !!u && u.searchParams.get("redirect_uri") === "org.extendedmatrix.emstudio:/oidc-return"
      && /^org\.extendedmatrix\.emstudio:\/oidc-return\?.*code=/.test(location ?? "")
      && /attested by the node/.test(chip) && /0000-0002-1825-0097/.test(set) && !errors.length,
    detail: { ways: before.ways, opened: u && u.origin + u.pathname, location: location && location.replace(/code=[^&]+/, "code=…"), chip, set, log, errors } };
});

test("E4.em", "E4 · Impostazioni › Sync, «Prova» su https://sito.test (il sito davanti al nodo): prova anche /em, dice dove risponde il nodo e lo propone; «Usa» lo mette nel campo e la prova riparte, raggiungibile. Su un indirizzo dove risponde solo un sito, lo dice", async () => {
  const health = { service: "stratigraph-server", version: "0.9.2", s3dgraphy: "1.6.0.dev31", auth: "open" };
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriHook(),
    route: { pattern: /https:\/\/(sito|solosito)\.test\/.*/, handler: (r) => {
      const u = r.request().url();
      if (u === "https://sito.test/em/v1/health") return r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, json: health });
      // the site in front: html, and NO CORS header — from a page, that looks like silence
      if (u.startsWith("https://sito.test/") || u.startsWith("https://solosito.test/")) return r.fulfill({ status: u.endsWith("/v1/health") ? 404 : 200, contentType: "text/html", body: "<!doctype html><title>site</title>" });
      return r.fulfill({ status: 404, body: "" });
    } } });
  await p.click("#footer-identity");
  await p.waitForTimeout(500);
  await p.click("[data-idp-configure]");
  await p.waitForTimeout(500);
  const test = async (addr) => {
    await p.fill("#set-hub-url", addr);
    await p.click("#set-node-test");
    await p.waitForFunction(() => !/Testing|Provo/.test(document.getElementById("set-node-result")?.textContent ?? "") && (document.getElementById("set-node-result")?.textContent ?? "").length > 3, null, { timeout: 12000 }).catch(() => {});
    await p.waitForTimeout(300);
    return p.evaluate(() => ({ text: document.getElementById("set-node-result")?.textContent ?? "", state: document.getElementById("set-node-result")?.dataset.state,
      suggest: document.querySelector("#set-node-result [data-node-suggest]")?.dataset.nodeSuggest ?? null }));
  };
  const a = await test("https://sito.test");
  let b = null;
  if (a.suggest) {
    await p.click("#set-node-result [data-node-suggest]");
    await p.waitForFunction(() => /Reachable/.test(document.getElementById("set-node-result")?.textContent ?? ""), null, { timeout: 12000 }).catch(() => {});
    b = await p.evaluate(() => ({ field: document.getElementById("set-hub-url").value, text: document.getElementById("set-node-result")?.textContent ?? "" }));
  }
  const c = await test("https://solosito.test");
  await p.screenshot({ path: SHOT("e4-indirizzo-em") }).catch(() => {});
  await ctx.close();
  return { pass: a.suggest === "https://sito.test/em" && /the node answers at https:\/\/sito\.test\/em/.test(a.text)
      && b?.field === "https://sito.test/em" && /Reachable: https:\/\/sito\.test\/em/.test(b?.text ?? "")
      // a site with no CORS header is «a site, not a node»; one whose status a page CAN
      // read (Playwright's fulfilled answers are readable) is «answers (404), not a node»
      && /https:\/\/solosito\.test answers.*(it is a site|not a StratiGraph node)/.test(c.text) && !c.suggest && !errors.length,
    detail: { a, b, c, errors } };
});

/** two files, each with its OWN DTC corpus (one acquisition each) */
const corpusOf = (id, name) => ({ graph_id: "dtc", name: "Documentation (DTC)", data: { em_collection: "DTCCorpus" },
  nodes: [{ id, node_type: "AcquisitionNode", name }], edges: [] });
const CORPUS_FILES = () => ({
  A: { header: { format: "em.json", version: "1.0" }, active_graph_id: "gA1", graphs: { gA1: OF_GRAPH("gA1", ["A1", "A2"], 11), dtc: corpusOf("acqA", "Rilievo di A") } },
  B: { header: { format: "em.json", version: "1.0" }, active_graph_id: "gB1", graphs: { gB1: OF_GRAPH("gB1", ["B1", "B2"], 1207), dtc: corpusOf("acqB", "Rilievo di B") } },
});

test("E5.corpus", "E5 · due file col proprio corpus DTC: ognuno lo dice sotto il suo nome nell'EMTree (mostrato / tenuto nel file); «Mostra» porta quello del secondo nel DTC e il primo torna nel suo file; salvati, ognuno scrive il suo corpus", async () => {
  const files = CORPUS_FILES();
  const { p, ctx, errors } = await open({ doc: null, locale: "en", hook: tauriWrites() });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([a]) => window.__EM_DRAG__.openAt(a, "/tmp/e5/A.em.json"), [files.A]);
  await p.waitForTimeout(1500);
  await p.evaluate(([b]) => window.__EM_DRAG__.openAt(b, "/tmp/e5/B.em.json"), [files.B]);
  await p.waitForTimeout(1500);
  await workspace(p, "assets");
  const rows = () => p.evaluate(() => [...document.querySelectorAll(".et-file")].map((f) => ({ file: f.querySelector(".et-file-name")?.textContent?.replace(" •", ""),
    corpus: f.querySelector(".et-corpus")?.dataset.corpusState ?? null, meta: f.querySelector(".et-corpus .et-meta")?.textContent ?? "",
    retained: f.querySelector(".et-retained")?.textContent ?? "" })));
  const first = await rows();
  const shown1 = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.docJson()).graphs?.dtc?.nodes?.map((n) => n.id) ?? null);
  await p.locator('.et-file:has(.et-file-name:text("B.em.json")) [data-show-corpus]').click().catch(() => {});
  await p.waitForTimeout(800);
  const second = await rows();
  await p.screenshot({ path: SHOT("e5-corpus-per-file") }).catch(() => {});
  // save both files: each writes its own corpus
  for (const name of ["grafo gA1", "grafo gB1"]) {
    await p.locator(".et-pick", { hasText: name }).first().click();
    await p.waitForTimeout(700);
    await p.keyboard.press("Meta+s");
    await p.waitForTimeout(700);
  }
  const writes = await p.evaluate(() => window.__WRITES__);
  await ctx.close();
  const byPath = Object.fromEntries(writes.map((w) => [w.path, JSON.parse(w.text)]));
  const corpusIn = (d) => (d?.graphs?.dtc?.nodes ?? []).map((n) => n.id).join(",");
  return { pass: first.length === 2 && first[0].corpus === "shown" && first[1].corpus === "kept" && !first[1].retained
      && second[0].corpus === "kept" && second[1].corpus === "shown"
      && corpusIn(byPath["/tmp/e5/A.em.json"]) === "acqA" && corpusIn(byPath["/tmp/e5/B.em.json"]) === "acqB" && !errors.length,
    detail: { first, shown1, second, written: Object.fromEntries(Object.entries(byPath).map(([k, d]) => [k, corpusIn(d)])), errors } };
});

/** one epoch with dates, one WITHOUT */
const UNDATED = () => ({ header: { format: "em.json", version: "1.0" }, graph: { graph_id: "gE5", name: "epoche",
  nodes: [{ id: "epA", node_type: "EpochNode", name: "Età romana", data: { start_time: -100, end_time: 300 } },
          { id: "epB", node_type: "EpochNode", name: "Età ignota", data: {} },
          { id: "u1", node_type: "US", name: "US1" }, { id: "u2", node_type: "US", name: "US2" }],
  edges: [{ id: "u1__has_first_epoch__epA", edge_type: "has_first_epoch", source: "u1", target: "epA" },
          { id: "u2__has_first_epoch__epB", edge_type: "has_first_epoch", source: "u2", target: "epB" },
          { id: "u2__is_after__u1", edge_type: "is_after", source: "u2", target: "u1" }] } });

test("E5.date", "E5 · un'epoca senza date ha nella sua corsia l'invito «date: — · add», disegnato dalla vista: salvato, il file non ha né nodi né archi né posizioni per lui; riaperto, l'invito c'è; «add» apre la Cronologia col cursore nell'inizio, e la data scritta nasce con has_property (l'invito sparisce)", async () => {
  const { p, ctx, errors } = await open({ doc: UNDATED(), locale: "en", hook: tauriWrites() });
  await p.evaluate(() => { window.__SAVE_PATH__ = "/tmp/e5/epoche.em.json"; });
  await p.waitForTimeout(800);
  const inv1 = await p.evaluate(() => window.__EM_DRAG__.dateInvites());
  await p.keyboard.press("Meta+s");
  await p.waitForTimeout(1000);
  const writes = await p.evaluate(() => window.__WRITES__);
  const saved = writes.length ? JSON.parse(writes.at(-1).text) : null;
  const g = saved?.graph ?? (saved?.graphs ? Object.values(saved.graphs).find((x) => (x.nodes ?? []).some((n) => n.id === "epB")) : null);
  const ids = new Set((g?.nodes ?? []).map((n) => n.id));
  // nothing of the invitation in the file: no edge from the undated epoch, no
  // group named for it, no position of anything that is not a node, no text
  const savedClean = !!g && !(g.edges ?? []).some((e) => e.source === "epB")
    && !(g.nodes ?? []).some((n) => /Età ignota/.test(String(n.name)) && n.id !== "epB")
    && Object.keys({ ...(saved.layout?.positions ?? {}), ...(g.layout?.positions ?? {}) }).every((id) => ids.has(id))
    && !/date: —|"add"/.test(JSON.stringify(saved));
  await ctx.close();
  // reopened from what was written
  const seen5 = {};
  const r = await open({ doc: saved, locale: "en", hook: tauriWrites() });
  await r.p.waitForTimeout(800);
  const inv2 = await r.p.evaluate(() => window.__EM_DRAG__.dateInvites());
  let focus = null, after = null, edges = null;
  const target = inv2.find((x) => x.id === "epB");
  await r.p.screenshot({ path: SHOT("e5-invito-prima") }).catch(() => {});
  if (target) {
    await r.p.mouse.click(target.x, target.y);
    await r.p.waitForTimeout(900);
    focus = await r.p.evaluate(() => document.activeElement?.dataset?.chnum ?? null);
    await r.p.keyboard.type("500");
    await r.p.keyboard.press("Enter");
    await r.p.waitForTimeout(800);
    after = await r.p.evaluate(() => window.__EM_DRAG__.dateInvites().map((x) => x.id));
    const doc = JSON.parse(await r.p.evaluate(() => window.__EM_DRAG__.docJson()));
    const gg = doc.graph ?? Object.values(doc.graphs ?? {})[0];
    seen5.dump = gg.nodes.filter((n) => !["US", "EpochNode"].includes(n.node_type)).map((n) => [n.id.slice(0, 6), n.node_type, n.name, JSON.stringify(n.data ?? {}).slice(0, 80)]);
    seen5.edges = gg.edges.filter((e) => e.source === "epB" || e.target === "epB").map((e) => [e.source.slice(0, 6), e.edge_type, e.target.slice(0, 6)]);
    seen5.epB = gg.nodes.find((n) => n.id === "epB")?.data;
    const prop = gg.nodes.find((n) => gg.edges.some((e) => e.edge_type === "has_property" && e.source === "epB" && e.target === n.id)
      && /absolute_time_start/.test(String(n.name)));
    edges = { prop: prop?.id ?? null, has_property: !!prop, start: gg.nodes.find((n) => n.id === "epB")?.data?.start_time ?? null };
  }
  await r.p.screenshot({ path: SHOT("e5-invito-a-datare") }).catch(() => {});
  await r.ctx.close();
  return { pass: inv1.map((x) => x.id).join() === "epB" && savedClean && inv2.map((x) => x.id).join() === "epB"
      && focus === "epB|start" && Array.isArray(after) && !after.includes("epB") && edges?.has_property && edges.start === 500 && !errors.length && !r.errors.length,
    detail: { inv1, savedClean, nodes: g?.nodes?.map((n) => n.id), inv2, focus, after, edges, seen5, errors, rerrors: r.errors } };
});

// ── run ─────────────────────────────────────────────────────────────────────
const chosen = cases.filter((c) => !only.length || only.includes(c.id) || only.some((o) => c.id.startsWith(o + ".")));
for (const c of chosen) {
  let r;
  try { r = await c.fn(); } catch (err) { r = { pass: false, detail: { error: String(err.message ?? err).split("\n")[0].slice(0, 240) } }; }
  results.push({ id: c.id, what: c.what, ...r });
  console.log(`${r.pass ? "✓" : "✗"} ${c.id} ${c.what}${r.pass ? "" : "  " + JSON.stringify(r.detail)}`);
}
await browser.close();
if (jsonAt) writeFileSync(jsonAt, JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.pass);
console.log(`interactions: ${results.length - failed.length}/${results.length} cases passed`);
if (failed.length) process.exit(1);
