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
import { readFileSync, writeFileSync, existsSync } from "node:fs";

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
async function open({ doc = "catena", locale = "it", w = 1600, h = 1000, ws, init } = {}) {
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
    await row.dblclick();
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
  await p.evaluate(() => document.getElementById("btn-tool-mapping").click());
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

// A5b · the DTC window writes to the corpus
test("A5b", "finestra DTC: un nodo creato lì va nel corpus", async () => {
  const { p, ctx } = await open({ doc: "catena" });
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
  await workspace(p, "narrative");
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
  await workspace(p, "narrative");
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
