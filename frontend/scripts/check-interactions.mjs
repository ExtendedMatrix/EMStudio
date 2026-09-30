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
async function open({ doc = "catena", locale = "it", w = 1600, h = 1000, ws, init, hook } = {}) {
  const d = doc ? (typeof doc === "string" ? fixture(doc) : doc) : null;
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
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
  await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(BRIDGE)}`);
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
test("9.read", "«Leggi» dice «→ Fonti» quando lo spazio non ha una Doc", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  await pick(p, "USM101");
  const labels = await p.evaluate(() => [...document.querySelectorAll(".insp-chain .chain-acts button")].map((b) => b.textContent));
  await ctx.close();
  return { pass: labels.some((l) => /Leggi → Fonti/.test(l)), detail: { labels } };
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
