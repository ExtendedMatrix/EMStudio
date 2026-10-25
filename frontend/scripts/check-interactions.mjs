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
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, realpathSync } from "node:fs";

const require = createRequire(import.meta.url);
const TD = new URL("../testdata/", import.meta.url).pathname;
const PORT = process.env.PORT ?? "5199";
const BRIDGE = process.env.BRIDGE ?? "http://localhost:8768";
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const FS_ROOT = process.env.FS_ROOT ?? null; // the bridge's fs-root, to reset the folders
// MICRO-SUITE-VERDE (24 Oct) · the studies a case opens are given by the bench
// (`scripts/suite-bench.mjs` clones them each run and sets these variables), or
// by hand; never read from a copy a past session left in /tmp. Unset, the path
// says so, and the case that needs it fails saying it is missing.
const benchFile = (name) => process.env[name] ?? `(${name} unset: run scripts/suite-bench.mjs)`;

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
    // the Resource Timing buffer holds 250 entries by default, and the dev
    // server's modules fill it before a case asks for a file: the cases that
    // read what the page fetched saw nothing (MICRO-SUITE-VERDE)
    try { performance.setResourceTimingBufferSize(20000); } catch { /* old engine */ }
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

// E5 · «Images of the unit» in the Inspector, with their thumbnails (decisioni
// della sera, 5 ott 2026): a unit that links two images (has_linked_resource)
// shows both, each with its picture; a click opens the image; a unit with no
// image draws no section
test("E5.thumb", "ispettore: le immagini dell'unità con la miniatura, il clic apre l'immagine, nessuna sezione senza immagini", async () => {
  const doc = fixture("catena");
  const g = doc.graph ?? doc;
  // a 2×2 PNG, inline: the thumbnail path that needs no bridge and no node
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQIW2P8z8DwnwEIGBkYGBgYAAAdBQIA7mYc5wAAAABJRU5ErkJggg==";
  for (const [id, name] of [["IMG_1", "USM101_north.png"], ["IMG_2", "USM101_detail.png"]]) {
    g.nodes.push({ id, name, node_type: "resource", data: { kind: "image", media_type: "image/png", url: png } });
    g.edges.push({ id: `USM101_has_linked_resource_${id}`, source: "USM101", target: id, edge_type: "has_linked_resource" });
  }
  const { p, ctx, errors } = await open({ doc });
  await pick(p, "USM101");
  await p.waitForTimeout(500);
  const seen = await p.evaluate(() => {
    const sect = document.querySelector(".insp-unit-images");
    const imgs = [...(sect?.querySelectorAll("img") ?? [])];
    return { title: sect?.querySelector("h3")?.textContent ?? "", n: imgs.length,
             drawn: imgs.filter((i) => i.complete && i.naturalWidth > 0).length };
  });
  await p.locator(".insp-unit-image").first().click();
  await p.waitForTimeout(350);
  const opened = await p.evaluate(() => window.__EM_DRAG__.selected());
  await pick(p, "US102");
  const none = await p.evaluate(() => !document.querySelector(".insp-unit-images"));
  await ctx.close();
  return { pass: seen.n === 2 && seen.drawn === 2 && /· 2/.test(seen.title) && opened[0] === "IMG_1" && none
                 && !errors.length, detail: { seen, opened, none, errors } };
});

// A1 · «Also known as» in the Inspector: the alternative labels of a unit,
// their numbering and their documents (s3Dgraphy's golden)
test("A1.alt", "ispettore: «Detta anche» con le etichette alternative, lo schema e i documenti; il clic su un documento lo apre", async () => {
  const { p, ctx, errors } = await open({ doc: "alternative_labels", locale: "en" });
  await pick(p, "us10");
  const seen = await p.evaluate(() => {
    const sect = document.querySelector(".insp-alt-labels");
    return { title: sect?.querySelector("h3")?.textContent ?? "",
             rows: [...(sect?.querySelectorAll(".insp-alt-label") ?? [])].map((r) => r.innerText.replace(/\s+/g, " ")) };
  });
  await p.locator(".insp-alt-labels a", { hasText: "D.TESI" }).first().click();
  await p.waitForTimeout(350);
  const opened = await p.evaluate(() => window.__EM_DRAG__.selected());
  await ctx.close();
  const text = seen.rows.join(" | ");
  return { pass: /Also known as · 3/.test(seen.title) && /US 1004 · scavo 2013 D\.2013/.test(text)
                 && /A\.12 · tesi Demetrescu/.test(text) && /Muro del podio .*D\.1931.*D\.2013/.test(text)
                 && opened[0] === "dtesi" && !errors.length, detail: { seen, opened, errors } };
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
// MICRO-VIEWER-UNICO · the Doc window's fields are the Inspector's «Scheda del
// documento» now: the same promise there (Tab goes to the next field, alive)
test("1.doc", "Scheda del documento (Inspector): titolo → Tab → il focus è nel campo del file, vivo", async () => {
  const { p, ctx } = await open({ doc: "catena", ws: "provenance" });
  await pick(p, "D3");
  const first = p.locator('.insp-doc-card [data-doc-field="title"]').first();
  await first.waitFor({ timeout: 8000 });
  await first.click();
  await p.keyboard.press("End");
  await p.keyboard.type("z");
  await p.keyboard.press("Tab");
  await p.waitForTimeout(500);
  await p.keyboard.type("T");
  await p.waitForTimeout(300);
  const focus = await activeDesc(p);
  const second = await p.locator('.insp-doc-card [data-doc-field="url"]').first().inputValue();
  const title = await p.evaluate(() => window.__EM_DRAG__.data("D3")?.title ?? null);
  await ctx.close();
  return { pass: focus.includes("doc-input") && second.endsWith("T") && title === "z", detail: { focus, second, title } };
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
  // FONTE (v2, part 4) · a unit something leans on asks first: the dialog's
  // default, «Elimina lasciando la traccia», is the gesture's removal now
  await p.waitForTimeout(1500);
  const asked = await p.evaluate(() => !!document.querySelector("[data-role='delete-confirm']"));
  if (asked) {
    await p.click("[data-role='delete-confirm'] button[data-action='trace']");
    await p.waitForTimeout(400);
  }
  const gone = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  const toastText = await p.evaluate(() => document.getElementById("toast")?.innerText ?? "");
  await p.click("#toast .toast-action");
  await p.waitForTimeout(400);
  const back = await p.evaluate(() => window.__EM_DRAG__.nodeCount());
  await ctx.close();
  return { pass: gone < before && back === before && /USM101/.test(toastText) && /Annulla/.test(toastText),
           detail: { before, gone, back, toastText, asked } };
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
  // AUDIT N8 · in Fonti the Documents table is the list: the VIEWER shows its pick
  // (MICRO-VIEWER-UNICO: the Doc window is the Viewer, the table is in rows —
  // its gutter ● picks the row's node)
  await p.locator('[data-win$=":docs"] [data-pick="D3"]').first().click();
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
      annotatorType: window.__EM_DRAG__.wins().some((w) => w.type === "annotator" || w.type === "doc"),
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
// MICRO-VIEWER-UNICO · Fonti: the Tabular of the documents, the VIEWER (no list of its own)
test("9.docsel", "documento scelto (nella Tabular Documenti di Fonti) → il Viewer lo mostra e l'ispettore è del documento", async () => {
  const { p, ctx } = await open({ doc: "catena", ws: "provenance" });
  const docList = await p.evaluate(() => !!document.querySelector(".doc-list"));
  await p.locator('[data-win$=":docs"] [data-pick="D3"]').first().click();
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ sel: window.__EM_DRAG__.selected()[0], doc: document.querySelector(".rd-stage")?.dataset.doc,
    viewer: !!document.querySelector(".rd-stage")?.closest('[data-surface-type="viewer"]'),
    insp: document.querySelector('[data-win$="inspector"] .insp-head')?.textContent ?? "" }));
  await ctx.close();
  return { pass: !docList && r.sel === "D3" && r.doc === "D3" && r.viewer && /document|D\.3/.test(r.insp), detail: { docList, ...r } };
});
// MICRO-VIEWER-UNICO · the Doc's «Mostra sul canvas» went with its card: a
// document picked in Fonti's table is shown by the graph under the Viewer
// («Zoom to selection»), and no window changes type or space
test("9.reveal", "un documento scelto in Fonti è mostrato dal grafo sotto il Viewer; nessuna finestra cambia tipo né spazio", async () => {
  const { p, ctx } = await open({ doc: "catena", ws: "provenance" });
  const before = await p.evaluate(() => window.__EM_DRAG__.wins().map((w) => w.type).sort().join());
  await p.locator('[data-win$=":docs"] [data-pick="D3"]').first().click();
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => window.__EM_DRAG__.wins().map((w) => w.type).sort().join());
  const ws = await p.evaluate(() => document.querySelector("#workspace-bar .ws-tab.active")?.dataset.ws);
  const sel = await p.evaluate(() => window.__EM_DRAG__.selected()[0]);
  const win = await winOf(p, "graph");
  const sc = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const box = sc?.boxes.find((b) => b.id === "D3" || b.id.startsWith("D3"));
  const shown = !!box && box.x + box.w > sc.rect.x && box.x < sc.rect.x + sc.rect.w && box.y + box.h > sc.rect.y && box.y < sc.rect.y + sc.rect.h;
  await ctx.close();
  return { pass: before === after && ws === "provenance" && sel === "D3" && shown, detail: { before, after, ws, sel, box, rect: sc?.rect } };
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
  // MICRO-VIEWER-UNICO · the service window is a Viewer
  const docs = await p.evaluate(() => window.__EM_DRAG__.wins().filter((w) => w.type === "viewer").map((w) => w.state["current.viewer.role"] ?? null));
  await ctx.close();
  return { pass: labels.some((l) => /^Leggi$/.test(l.trim())) && !labels.some((l) => /Fonti/.test(l)) && ws0 === ws1
      && docs.length === 1 && docs[0] === "service", detail: { labels, ws0, ws1, docs } };
});

// ── PARTE 10 · intestazioni sobrie, un verbo per azione ─────────────────────
// MICRO-PULIZIA p.4 · the «⋯» no longer gathers Layout and «Normalizza
// grafie…»: Layout and «Compatta» are icons on the bar, the spellings are in
// Tools, and an empty «⋯» is not drawn (the Matrix's is empty)
test("10.header", "l'intestazione del grafo: tipo, modo a segmenti, nessun «⋯» vuoto (niente tre «Graph»); «Uniforma le grafie…» sta in Strumenti", async () => {
  const { p, ctx } = await open({ doc: "catena" });
  const r = await p.evaluate(() => {
    const bar = document.querySelector('[data-win="canvas:1"] .tile-bar') ?? document.querySelector(".tile-active .tile-bar");
    return {
      seg: [...bar.querySelectorAll(".win-seg button")].map((b) => b.textContent),
      menus: [...bar.querySelectorAll(".win-menu-toggle")].map((b) => b.textContent.trim()),
      graphWords: (bar.innerText.match(/\bGrafo\b|\bGraph\b/g) ?? []).length,
      tools: [...document.querySelectorAll("#dd-tools .dd-menu button")].map((b) => b.textContent.trim()),
    };
  });
  await ctx.close();
  return { pass: r.seg.length === 4 && r.menus.length === 0 && r.graphWords <= 2
    && r.tools.some((i) => /grafie|spellings/i.test(i)), detail: r };
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
  test(`11.shelf${w}`, `shelf a ${w}: righe a due livelli senza testo sovrapposto, conteggio intero (MICRO-PROVA-DEV47 p.6: l'intestazione su una riga, il conteggio raggiunto scorrendola)`, async () => {
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
      // MICRO-PROVA-DEV47 p.6 · the header is one line now: a count past its edge
      // is reached by scrolling the bar (whole, not cut), as Blender's headers
      const ol = c?.closest(".one-line");
      if (ol && c) ol.scrollLeft += c.getBoundingClientRect().right - ol.getBoundingClientRect().right + 2;
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
  // G3 (MICRO grafo reattivo) · the Graph draws DISCS now: sized by the degree,
  // named from 26 px, the genre's letter inside the disc (lower right, in the
  // disc's ink) — the letter is what the Graph must keep; the Matrix keeps it all
  const okDisc = (m) => {
    const r = m.out.USR201, s = m.out.USS202, u = m.out.US203, w = m.out.USM204;
    const deco = (x, L) => x && x.letters.length === 1 && x.letters[0].text === L && x.letters[0].fx > 0.6 && x.letters[0].fy > 0.6;
    return deco(r, "R") && deco(s, "R") && deco(w, "M") && u && !u.letters.length;
  };
  return { pass: ok(matrix) && okDisc(graph) && matrix.mode !== graph.mode && !errors.length, detail: { border, matrix, graph, errors } };
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
// MICRO-VIEWER-UNICO · the document's model is the Viewer's scene (the Space's
// engine): its readings are marks over it, the tools in the Viewer's bar
async function readingOnModel(p) {
  await pick(p, "USM101");
  await p.locator('[data-add-reading="P_H"]').first().click();
  await p.waitForTimeout(300);
  await p.locator(".addm-item", { hasText: "D.2 ·" }).first().click();
  await p.waitForTimeout(900);
  await p.waitForFunction(() => { const w = window.__EM_DRAG__.wins().find((x) => x.type === "viewer"); return !!w && window.__EM_DRAG__.viewerState(w.id)?.scene?.framed; }, null, { timeout: 30000 });
  await p.waitForTimeout(300);
  return (await p.evaluate(() => window.__EM_DRAG__.selected()))[0];
}
const modelCanvas = (p) => p.evaluate(() => { const cv = document.querySelector(".vw-scene canvas"); const r = cv.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const markerLabels = (p) => p.evaluate(() => [...document.querySelectorAll(".vw-scene .scn-mark-label")].map((l) => l.textContent));
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
  await p.click('.rd-tool[data-tool="elevation"]');
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
  await again.p.waitForFunction(() => { const w = window.__EM_DRAG__.wins().find((x) => x.type === "viewer"); return !!w && window.__EM_DRAG__.viewerState(w.id)?.scene?.framed; }, null, { timeout: 30000 }).catch(() => {});
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
    // MICRO-SPAZIO-3D-3 p.14 · a label carries its decorators after the name: its own text is the name
    labels: [...document.querySelectorAll(".scn-label")].map((l) => ({ t: l.firstChild?.nodeType === 3 ? l.firstChild.textContent : l.textContent, cls: l.className })),
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
// PARTE 0b (E.D. 17 Oct 2026) · two fingers turn the scene as the left drag:
// macOS's natural scrolling (its default) gives the fingers' movement with the
// opposite sign; the orbit read it as it came and turned the other way round
const azEl = (c) => { const d = [c[0] - c[3], c[1] - c[4], c[2] - c[5]]; const r = Math.hypot(...d);
  return { az: Math.atan2(d[0], d[2]), el: Math.asin(d[1] / r), r, target: c.slice(3) }; };
const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const padWheel = (p, o) => p.evaluate((o) => {
  const c = document.querySelector(".scn-host canvas"); const r = c.getBoundingClientRect();
  for (let i = 0; i < (o.n ?? 1); i++) c.dispatchEvent(new WheelEvent("wheel", { deltaX: o.dx ?? 0, deltaY: o.dy ?? 0, deltaMode: o.mode ?? 0,
    shiftKey: !!o.shift, ctrlKey: !!o.ctrl, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }));
}, o);
async function padCase(invert) {
  const init = invert ? { "emstudio.settings": JSON.stringify({ viewer: { invertTrackpadOrbit: true } }) } : undefined;
  const { p, ctx, errors } = await open({ doc: "spazio", ws: "space", init });
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
  await spaceOn(p, "EP_MED");
  const cam = async () => azEl((await sceneState(p)).camera);
  const r = await p.evaluate(() => { const c = document.querySelector(".scn-host canvas").getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
  const out = {};
  // the left drag to the right, then up
  let c0 = await cam();
  await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x + 80, r.y, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(300);
  let c1 = await cam(); out.dragRight = angle(c1.az - c0.az);
  c0 = c1; await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x, r.y - 60, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(300);
  c1 = await cam(); out.dragUp = c1.el - c0.el;
  // two fingers to the right with natural scrolling: deltaX negative (a fraction: a trackpad's)
  c0 = c1; await padWheel(p, { dx: -10.5, n: 8 }); await p.waitForTimeout(300);
  c1 = await cam(); out.fingersRight = angle(c1.az - c0.az);
  // two fingers up with natural scrolling: deltaY positive
  c0 = c1; await padWheel(p, { dy: 7.5, n: 8 }); await p.waitForTimeout(300);
  c1 = await cam(); out.fingersUp = c1.el - c0.el;
  // Shift + two fingers to the right: the scene slides right, as a pan drag to the right (Shift + middle)
  c0 = c1; await padWheel(p, { dx: -10.5, n: 6, shift: true }); await p.waitForTimeout(500);
  c1 = await cam(); const padPan = c1.target.map((v, i) => v - c0.target[i]);
  c0 = c1; await p.mouse.move(r.x, r.y); await p.keyboard.down("Shift"); await p.mouse.down({ button: "middle" });
  await p.mouse.move(r.x + 60, r.y, { steps: 6 }); await p.mouse.up({ button: "middle" }); await p.keyboard.up("Shift");
  await p.waitForTimeout(300);
  c1 = await cam(); const dragPan = c1.target.map((v, i) => v - c0.target[i]);
  out.panDot = padPan.reduce((a, v, i) => a + v * dragPan[i], 0);
  // Ctrl + two fingers away (natural: deltaY positive) and the mouse wheel away (natural: deltaY positive too)
  c0 = c1; await padWheel(p, { dy: 6, n: 4, ctrl: true }); await p.waitForTimeout(300);
  c1 = await cam(); out.ctrlFingers = c1.r - c0.r;
  c0 = c1; await padWheel(p, { dy: 1, mode: 1, n: 2 }); await p.waitForTimeout(300);
  c1 = await cam(); out.wheel = c1.r - c0.r;
  await ctx.close();
  return { out, errors };
}
test("S3.pad", "Spazio · PARTE 0b · due dita (scorrimento naturale) girano la scena come il trascinamento sinistro nello stesso verso; Maiusc+due dita come il pan, Ctrl+due dita come la rotella; con «Inverti l'orbita del trackpad» al contrario", async () => {
  const a = await padCase(false), b = await padCase(true);
  const same = (x, y) => Math.sign(x) === Math.sign(y) && x !== 0;
  const o = a.out, q = b.out;
  return { pass: same(o.dragRight, o.fingersRight) && same(o.dragUp, o.fingersUp) && o.panDot > 0 && same(o.ctrlFingers, o.wheel)
      && same(q.dragRight, -q.fingersRight) && same(q.dragUp, -q.fingersUp) && q.panDot > 0 && !a.errors.length && !b.errors.length,
    detail: { natural: o, inverted: q, errors: [...a.errors, ...b.errors] } };
});
// MICRO-GIZMO-ASSI · the navigation gizmo, top right, as Blender's
const gz = (p) => p.evaluate(() => document.querySelector(".scn-host").__spaceGizmo());
const camM = (p) => p.evaluate(() => document.querySelector(".scn-host").__spaceCamMatrix());
const viewTag = (p) => p.evaluate(() => document.querySelector(".scn-host").dataset.view);
const ballAt = async (p, axis) => (await gz(p)).balls.find((b) => b.axis === axis);
async function gizmoScene() {
  const { p, ctx, errors } = await open({ doc: "spazio", ws: "space" });
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
  await spaceOn(p, "EP_MOD");
  const start = await p.evaluate(() => document.querySelector(".scn-host").__spaceCamState());
  const reset = () => p.evaluate((c) => document.querySelector(".scn-host").__spaceSetCam(c), start);
  return { p, ctx, errors, start, reset };
}
test("S3.gizmo6", "Spazio · MICRO-GIZMO-ASSI · le sei viste dal gizmo sono quelle del tastierino (stessa matrice di camera): X destra (3), −X sinistra (Ctrl+3), Y retro (Ctrl+1), −Y frontale (1), Z dall'alto (7), −Z da sotto (Ctrl+7); ortometrica con Auto Perspective, l'etichetta lo dice", async () => {
  const { p, ctx, errors, reset } = await gizmoScene();
  const r = await p.evaluate(() => { const c = document.querySelector(".scn-host canvas").getBoundingClientRect(); return { x: c.x + 60, y: c.y + c.height - 60 }; });
  const KEYS = { x: "Numpad3", "-x": "Control+Numpad3", y: "Control+Numpad1", "-y": "Numpad1", z: "Numpad7", "-z": "Control+Numpad7" };
  const WANT = { x: "right", "-x": "left", y: "back", "-y": "front", z: "top", "-z": "bottom" };
  const out = {};
  let worst = 0;
  for (const [axis, key] of Object.entries(KEYS)) {
    await reset(); await p.waitForTimeout(150);
    await p.mouse.click(r.x, r.y);   // the 3D has the focus (an empty corner: nothing picked)
    await p.keyboard.press(key); await p.waitForTimeout(400);
    const k = await camM(p); const kv = await viewTag(p);
    await reset(); await p.waitForTimeout(150);
    const b = await ballAt(p, axis);
    await p.mouse.click(b.x, b.y); await p.waitForTimeout(400);
    const g = await camM(p); const gv = await viewTag(p);
    const d = Math.max(...k.world.map((v, i) => Math.abs(v - g.world[i])), ...k.proj.map((v, i) => Math.abs(v - g.proj[i])));
    worst = Math.max(worst, d);
    out[axis] = { key: kv, gizmo: gv, d, label: await p.evaluate(() => document.querySelector(".scn-view")?.textContent) };
  }
  await ctx.close();
  const pass = Object.entries(out).every(([a, o]) => o.key === `${WANT[a]}:ortho` && o.gizmo === o.key && o.d < 1e-6)
    && /Frontale · Ortometrica/.test(out["-y"].label) && !errors.length;
  return { pass, detail: { out, worst, errors } };
});
test("S3.gizmoAgain", "Spazio · MICRO-GIZMO-ASSI · un clic sull'asse già allineato dà la vista opposta, come Blender; il passaggio è animato (circa 200 ms) e finisce sulla vista esatta", async () => {
  const { p, ctx, errors, reset } = await gizmoScene();
  await reset(); await p.waitForTimeout(150);
  let b = await ballAt(p, "-y");
  await p.mouse.click(b.x, b.y);
  const during = (await gz(p)).animating;
  await p.waitForTimeout(80);
  const mid = await viewTag(p);
  await p.waitForTimeout(400);
  const first = await viewTag(p);
  // now −Y faces the viewer, in the middle: the same ball again
  b = await ballAt(p, "-y");
  const front = (await gz(p)).balls.slice(-1)[0].axis;
  await p.mouse.click(b.x, b.y); await p.waitForTimeout(400);
  const second = await viewTag(p);
  await ctx.close();
  return { pass: during === true && /^user:/.test(mid) && first === "front:ortho" && front === "-y" && second === "back:ortho" && !errors.length,
    detail: { during, mid, first, front, second, errors } };
});
test("S3.gizmoDrag", "Spazio · MICRO-GIZMO-ASSI · trascinare il gizmo orbita attorno al centro d'orbita, nel verso del trascinamento sinistro; la colonna: lente (zoom), mano (pan), inquadra tutto, prospettiva ⇄ ortometrica", async () => {
  const { p, ctx, errors, reset } = await gizmoScene();
  const azOf = (c) => Math.atan2(c[0] - c[3], c[2] - c[5]);
  const cam = () => p.evaluate(() => document.querySelector(".scn-host").__spaceCamera());
  await reset(); await p.waitForTimeout(150);
  const box = await p.evaluate(() => { const r = document.querySelector(".scn-nav-box").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
  // a corner of the gizmo with no ball: the drag starts there
  const sx = box.x + 6, sy = box.y + box.w - 6;
  let c0 = await cam();
  await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx + 60, sy, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(200);
  let c1 = await cam();
  const gizmoTurn = Math.atan2(Math.sin(azOf(c1) - azOf(c0)), Math.cos(azOf(c1) - azOf(c0)));
  const targetKept = c1.slice(3).every((v, i) => Math.abs(v - c0[3 + i]) < 1e-6);
  const viewAfterDrag = await viewTag(p);
  await reset(); await p.waitForTimeout(150);
  const r = await p.evaluate(() => { const c = document.querySelector(".scn-host canvas").getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
  c0 = await cam();
  await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x + 60, r.y, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(200);
  c1 = await cam();
  const dragTurn = Math.atan2(Math.sin(azOf(c1) - azOf(c0)), Math.cos(azOf(c1) - azOf(c0)));
  // the column
  const btn = (k) => p.evaluate((k) => { const r = document.querySelector(`.scn-nav-btn[data-nav="${k}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, title: document.querySelector(`.scn-nav-btn[data-nav="${k}"]`).title }; }, k);
  const dist = (c) => Math.hypot(c[0] - c[3], c[1] - c[4], c[2] - c[5]);
  await reset(); await p.waitForTimeout(150);
  const z = await btn("zoom"); c0 = await cam();
  await p.mouse.move(z.x, z.y); await p.mouse.down(); await p.mouse.move(z.x, z.y - 50, { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(200); c1 = await cam();
  const zoomUp = dist(c1) - dist(c0);
  const pn = await btn("pan"); c0 = await cam();
  await p.mouse.move(pn.x, pn.y); await p.mouse.down(); await p.mouse.move(pn.x + 50, pn.y, { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(200); c1 = await cam();
  const panMoved = Math.hypot(c1[3] - c0[3], c1[4] - c0[4], c1[5] - c0[5]);
  const o = await btn("ortho"); const v0 = await viewTag(p);
  await p.mouse.click(o.x, o.y); await p.waitForTimeout(200);
  const v1 = await viewTag(p);
  const h = await btn("home"); c0 = await cam();
  await p.mouse.click(h.x, h.y); await p.waitForTimeout(200); c1 = await cam();
  const homeMoved = c1.some((v, i) => Math.abs(v - c0[i]) > 1e-6);
  const titles = [z.title, pn.title, h.title, o.title];
  const tips = await p.evaluate(() => [...document.querySelectorAll(".scn-nav-ball")].map((b) => [b.dataset.axis, b.title]));
  await ctx.close();
  return { pass: gizmoTurn !== 0 && Math.sign(gizmoTurn) === Math.sign(dragTurn) && targetKept && /^user:/.test(viewAfterDrag)
      && zoomUp < 0 && panMoved > 0 && v0 === "user:persp" && v1 === "user:ortho" && homeMoved
      && tips.some(([a, t]) => a === "-y" && t === "Vista frontale (1)") && tips.some(([a, t]) => a === "y" && t === "Vista retro (Ctrl+1)") && !errors.length,
    detail: { gizmoTurn, dragTurn, targetKept, viewAfterDrag, zoomUp, panMoved, v0, v1, homeMoved, titles, tips, errors } };
});
test("S3.labels3", "Spazio · MICRO-GIZMO-ASSI · le etichette separate: modelli, proxy, abbozzi (tre voci nel gruppo «Testo»); di default modelli e proxy accesi, abbozzi spenti; spente una per volta", async () => {
  const { p, ctx, errors } = await gizmoScene();
  const kinds = () => p.evaluate(() => { const vis = [...document.querySelectorAll(".scn-label")].filter((e) => e.style.display !== "none" && e.closest(".scn-labels")?.style.display !== "none");
    return { rm: vis.filter((e) => e.classList.contains("k-rm")).length, proxy: vis.filter((e) => e.classList.contains("k-proxy")).length, sketch: vis.filter((e) => e.classList.contains("k-sketch")).length }; });
  const toggle = async (k) => { await p.click(`#overlay-panel input[data-ov="${k}"]`); await p.waitForTimeout(400); };
  const both = await kinds();
  await p.click(".scn-ovbtn"); await p.waitForTimeout(300);
  const groups = await p.evaluate(() => [...document.querySelectorAll("#overlay-panel .ov-group")].map((g) => [g.dataset.group, [...g.querySelectorAll("input[data-ov]")].map((i) => i.dataset.ov)]));
  await toggle("s3_labels_rm");
  const noRm = await kinds();
  await toggle("s3_labels_rm"); await toggle("s3_labels_proxy");
  const noPx = await kinds();
  await toggle("s3_labels_proxy");
  const back = await kinds();
  // a sketch (a cube of «Forme base»): no label until its switch is on
  await p.click('.scn-outliner button[data-shape="cube"]'); await p.waitForTimeout(600);
  const sk0 = await kinds();
  await toggle("s3_labels_sketch");
  const sk1 = await kinds();
  const skName = await p.evaluate(() => [...document.querySelectorAll(".scn-label.k-sketch")].map((e) => e.firstChild?.textContent));
  const proxyColour = await p.evaluate(() => { const e = [...document.querySelectorAll(".scn-label.k-proxy")].find((x) => !x.classList.contains("sel")); return e ? getComputedStyle(e).backgroundColor : null; });
  const rmColour = await p.evaluate(() => { const e = [...document.querySelectorAll(".scn-label.k-rm")].find((x) => !x.classList.contains("sel")); return e ? getComputedStyle(e).backgroundColor : null; });
  await ctx.close();
  const text = groups.find(([g]) => g === "s3_text")?.[1] ?? [];
  return { pass: both.rm > 0 && both.proxy > 0 && both.sketch === 0 && noRm.rm === 0 && noRm.proxy === both.proxy && noPx.proxy === 0 && noPx.rm === both.rm
      && back.rm === both.rm && back.proxy === both.proxy && JSON.stringify(text) === JSON.stringify(["s3_labels_rm", "s3_labels_proxy", "s3_labels_sketch"])
      && sk0.sketch === 0 && sk1.sketch === 1 && skName.length === 1
      && proxyColour && rmColour && proxyColour !== rmColour && !errors.length,
    detail: { both, noRm, noPx, back, sk0, sk1, skName, groups, proxyColour, rmColour, errors } };
});
// MICRO-PANNELLI-LATERALI (E.D. 17 Oct 2026) · the two side panels as Blender's:
// the same triangle on both edges, squeezed under 80 px a panel closes, its
// triangle dragged inwards opens it at the width it had; no button in the bar
test("S3.sides", "Spazio · MICRO-PANNELLI-LATERALI · i due pannelli come Blender: lo stesso triangolino sui due bordi (T e N), stretti sotto 80 px si chiudono, il triangolino trascinato verso l'interno li riapre alla larghezza di prima; nessun pulsante dell'Outliner nella barra; il gizmo resta nell'angolo della scena", async () => {
  const { p, ctx, errors } = await gizmoScene();
  const box = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, shown: getComputedStyle(e).display !== "none", text: e.textContent, title: e.title ?? null }; }, sel);
  const state = async () => ({ outl: (await box(".scn-outliner")).shown, npanel: (await box(".scn-npanel")).shown,
    tab: (await box(".scn-tab")).shown, ntab: (await box(".scn-ntab")).shown });
  const gizmoGap = async () => { const h = await box(".scn-host"); const g = await box(".scn-nav-box"); return Math.round(h.right - g.right); };
  const prefs = () => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem("emstudio.space3d") ?? "{}"))[0] ?? null);
  const corner = await p.evaluate(() => { const c = document.querySelector(".scn-host canvas").getBoundingClientRect(); return { x: c.x + 60, y: c.y + c.height - 60 }; });
  const key = async (k) => { await p.mouse.click(corner.x, corner.y); await p.keyboard.press(k); await p.waitForTimeout(300); };
  const noBarButton = await p.evaluate(() => !document.querySelector(".scn-bar [data-outliner]") && ![...document.querySelectorAll(".scn-bar button")].some((b) => b.textContent === "☰"));
  const s0 = await state();
  const gap0 = await gizmoGap();
  // T and N: the shortcuts stay
  await key("t");
  const sT = await state();
  const tab = await box(".scn-tab"), ntab = await box(".scn-ntab");
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-pannelli-chiusi-triangolini.png` }).catch(() => {});
  await key("n");
  const sN = await state();
  const gapN = await gizmoGap();
  await key("n"); await key("t");
  const sBack = await state();
  // the triangle's click opens: the left one, then the right one
  await key("t");
  await p.click(".scn-tab");  await p.waitForTimeout(250);
  const sTabClick = await state();
  await p.click(".scn-ntab"); await p.waitForTimeout(250);
  const sNtabClick = await state();
  // squeeze the Outliner: to 120 px it holds at 160; under 80 it closes, the width kept
  const w0 = (await box(".scn-outliner")).w;
  let g = await box(".scn-grip");
  const ox = (await box(".scn-outliner")).x;
  await p.mouse.move(g.x + 2, g.y + 100); await p.mouse.down();
  await p.mouse.move(ox + 120, g.y + 100, { steps: 6 });
  const held = (await box(".scn-outliner")).w;
  await p.mouse.move(ox + 40, g.y + 100, { steps: 6 });
  const midDrag = await state();
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-pannello-sinistro-stretto.png` }).catch(() => {});
  await p.mouse.up(); await p.waitForTimeout(250);
  const sSqueezed = await state();
  const pSqueezed = await prefs();
  // the triangle dragged inwards: open again, at the width it had
  const tb = await box(".scn-tab");
  await p.mouse.move(tb.x + 4, tb.y + tb.h / 2); await p.mouse.down(); await p.mouse.move(tb.x + 60, tb.y + tb.h / 2, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(250);
  const sDragOpen = await state();
  const wAgain = (await box(".scn-outliner")).w;
  // the N panel the same, to the right
  const nw0 = (await box(".scn-npanel")).w;
  g = await box(".scn-ngrip");
  const nright = (await box(".scn-npanel")).right;
  await p.mouse.move(g.x + 2, g.y + 100); await p.mouse.down(); await p.mouse.move(nright - 30, g.y + 100, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(250);
  const sNSqueezed = await state();
  const gapNClosed = await gizmoGap();
  const nt = await box(".scn-ntab");
  await p.mouse.move(nt.x + nt.w - 4, nt.y + nt.h / 2); await p.mouse.down(); await p.mouse.move(nt.x - 60, nt.y + nt.h / 2, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(250);
  const sNDragOpen = await state();
  const nwAgain = (await box(".scn-npanel")).w;
  const gapNOpen = await gizmoGap();
  await ctx.close();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const conds = {
    noBarButton,
    start: same(s0, { outl: true, npanel: false, tab: false, ntab: true }),
    T: same(sT, { outl: false, npanel: false, tab: true, ntab: true }),
    sameTriangle: tab.text === "›" && ntab.text === "‹" && tab.title === "Apri l'Outliner (T)" && Math.abs(tab.h - ntab.h) < 1 && Math.abs(tab.w - ntab.w) < 1.5 && Math.abs(tab.y - ntab.y) < 1,
    N: same(sN, { outl: false, npanel: true, tab: true, ntab: false }),
    back: same(sBack, { outl: true, npanel: false, tab: false, ntab: true }),
    tabClick: same(sTabClick, { outl: true, npanel: false, tab: false, ntab: true }),
    ntabClick: same(sNtabClick, { outl: true, npanel: true, tab: false, ntab: false }),
    held: held === 160,
    closedWhileDragging: midDrag.outl === false && midDrag.tab === true,
    squeezed: same(sSqueezed, { outl: false, npanel: true, tab: true, ntab: false }) && pSqueezed?.shown === false && pSqueezed?.width === w0,
    dragOpen: sDragOpen.outl === true && sDragOpen.tab === false && wAgain === w0,
    nSqueezed: sNSqueezed.npanel === false && sNSqueezed.ntab === true,
    nDragOpen: sNDragOpen.npanel === true && nwAgain === nw0,
    gizmoAnchored: gap0 === gapN && gapN === gapNClosed && gapNClosed === gapNOpen,
    errors: !errors.length,
  };
  return { pass: Object.values(conds).every(Boolean),
    detail: { conds, s0, sT, tab, ntab, sN, sBack, sTabClick, sNtabClick, w0, held, midDrag, sSqueezed, pSqueezed, sDragOpen, wAgain, nw0, sNSqueezed, sNDragOpen, nwAgain, gaps: [gap0, gapN, gapNClosed, gapNOpen], errors } };
});
// MICRO-PANNELLI-LATERALI p.2 (E.D. 17 Oct 2026) · «Associa a un'unità» in the
// Inspector, not a dropdown over the scene; the right click on a sketch as
// Blender's object menu. The spazio fixture opened FROM A FOLDER of the bridge,
// so the proxy's glb is written beside it (FS_ROOT, a copy per case)
async function assocScene(name, { w = 1600, h = 1000 } = {}) {
  const root = FS_ROOT ?? (await rootPath());
  const dir = `${root}/pannelli-${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  copyFileSync(`${TD}spazio.em.json`, `${dir}/spazio.em.json`);
  const { p, ctx, errors } = await open({ doc: null, w, h });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [fixture("spazio"), `${dir}/spazio.em.json`]);
  await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length > 0, null, { timeout: 20000 });
  await workspace(p, "space");
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
  await spaceOn(p, "EP_MED");
  return { p, ctx, errors, dir };
}
// the palette may sit below the Outliner's fold in a small window: scrolled to first
const addCube = async (p) => {
  await p.evaluate(() => { const b = document.querySelector('.scn-outliner button[data-shape="cube"]'); b.closest("details")?.setAttribute("open", ""); b.scrollIntoView({ block: "center" }); });
  await p.click('.scn-outliner button[data-shape="cube"]'); await p.waitForTimeout(700);
};
const assocView = (p) => p.evaluate(() => {
  const s = document.querySelector("[data-assoc]");
  if (!s) return null;
  const list = (k) => [...s.querySelectorAll(`[data-assoc-list="${k}"] .insp-assoc-unit`)].map((b) => b.dataset.unit);
  // MICRO-PROVA-DEV47 p.5 · a group's title and its count apart: read as «title (n)»
  return { head: s.querySelector(".insp-assoc-head")?.textContent, groups: [...s.querySelectorAll("[data-assoc-group]")].map((g) => g.querySelector(".insp-assoc-gt")
      ? `${g.querySelector(".insp-assoc-gt").textContent} (${g.querySelector(".insp-assoc-count").textContent})` : g.textContent),
    here: list("here"), elsewhere: list("elsewhere"), withProxy: list("withProxy"),
    metaSF100: s.querySelector('[data-unit="SF100"] .insp-assoc-meta')?.textContent ?? null,
    newFirst: s.firstElementChild?.nextElementSibling?.classList.contains("insp-assoc-new") ?? false,
    types: [...s.querySelectorAll("[data-assoc-new-type] option")].map((o) => o.value), name: s.querySelector("[data-assoc-new-name]")?.value };
});
/** a unit's geometry properties (the proxies' chains), read from the graph */
const geometryOf = (p, unit) => p.evaluate((u) => {
  const g = JSON.parse(window.__EM_DRAG__.graphJson());
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  return g.edges.filter((e) => e.source === u && e.edge_type === "has_property").map((e) => byId.get(e.target))
    .filter((n) => n && /geometry/i.test(String(n.name ?? "") + String(n.data?.property_type ?? ""))).length;
}, unit);
const nodeCount = (p) => p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
const inspName = (p) => p.evaluate(() => document.querySelector(".insp-name-input")?.value ?? document.querySelector(".insp-head h2")?.textContent ?? null);
test("S3.assocInsp", "Spazio · MICRO-PANNELLI-LATERALI p.2 · «Associa a un'unità» è una sezione dell'Inspector dell'abbozzo: in cima «Crea una nuova unità», poi le orfane dell'epoca, le altre epoche con l'epoca accanto, quelle con un proxy ◆; il pulsante porta alla ricerca; un clic su un'orfana la sceglie e «Associa» conferma (MICRO-PROVA-DEV47 p.5), l'Inspector mostra l'unità, un annulla toglie tutto", async () => {
  const { p, ctx, errors, dir } = await assocScene("insp");
  await addCube(p);
  const v = await assocView(p);
  await p.click('.s3-sketch-acts [data-s3="associate"]'); await p.waitForTimeout(400);
  const focus = await p.evaluate(() => ({ q: document.activeElement?.dataset?.assocQ === "1", floating: !!document.querySelector(".s3-assoc") }));
  // the search, the type filter
  await p.fill("[data-assoc-q]", "us10"); await p.waitForTimeout(150);
  const searched = await assocView(p);
  await p.fill("[data-assoc-q]", ""); await p.selectOption("[data-assoc-type]", "SF"); await p.waitForTimeout(150);
  const filtered = await assocView(p);
  await p.selectOption("[data-assoc-type]", ""); await p.waitForTimeout(150);
  const n0 = await nodeCount(p), g0 = await geometryOf(p, "US104");
  await p.click('[data-assoc-list="here"] [data-unit="US104"]');
  await p.click("[data-assoc-ok]");
  await p.waitForFunction(() => !document.querySelector(".scn-host").__spaceSketches().length, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(600);
  const n1 = await nodeCount(p), g1 = await geometryOf(p, "US104");
  const selected = await p.evaluate(() => window.__EM_DRAG__.selected()[0] ?? null);
  const shown = await inspName(p);
  const files = readdirSync(`${dir}/proxies`).filter((f) => f.endsWith(".glb"));
  await p.evaluate(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(500);
  const n2 = await nodeCount(p), g2 = await geometryOf(p, "US104");
  await ctx.close();
  const conds = {
    section: v?.head === "Associa a un'unità" && v.newFirst && v.types[0] === "US" && v.types.includes("USVs") && /^US\d+|^SU\d+/.test(v.name ?? ""),
    groups: v?.here.includes("US104") && !v.here.includes("SF100") && v.elsewhere.includes("SF100") && /Età imperiale/.test(v.metaSF100 ?? "")
      && v.withProxy.includes("US102") && /^Orfane di Medioevo/.test(v.groups[0]) && /\(\d+\)$/.test(v.groups[2]),
    focus: focus.q && !focus.floating,
    search: JSON.stringify([searched.here, searched.elsewhere]) === JSON.stringify([["US104"], []]) && searched.withProxy.every((u) => /us10/i.test(u)),
    filter: filtered.here.length === 0 && JSON.stringify(filtered.elsewhere) === JSON.stringify(["SF100"]) && filtered.withProxy.length === 0,
    associated: g1 === g0 + 1 && n1 > n0 && selected === "US104" && shown === "US104" && files.length === 1,
    undone: n2 === n0 && g2 === g0,
    errors: !errors.length,
  };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, v, focus, searched, filtered, n: [n0, n1, n2], g: [g0, g1, g2], selected, shown, files, errors } };
});
test("S3.assocNew", "Spazio · MICRO-PANNELLI-LATERALI p.2 · «Crea una nuova unità da questa forma» nell'Inspector: il tipo dal datamodel (USV/s), il nome proposto che segue il tipo; nasce l'unità con il proxy, nell'epoca in scena; un annulla la toglie", async () => {
  const { p, ctx, errors } = await assocScene("new");
  await addCube(p);
  const before = await assocView(p);
  await p.selectOption("[data-assoc-new-type]", "USVs"); await p.waitForTimeout(150);
  const after = await assocView(p);
  const n0 = await nodeCount(p);
  await p.click("[data-assoc-create]");
  await p.click("[data-assoc-ok]");
  await p.waitForFunction(() => !document.querySelector(".scn-host").__spaceSketches().length, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(600);
  const born = await p.evaluate((name) => { const g = JSON.parse(window.__EM_DRAG__.graphJson()); const n = g.nodes.find((x) => x.name === name);
    return n ? { id: n.id, type: n.node_type } : null; }, after.name);
  const g1 = born ? await geometryOf(p, born.id) : 0;
  const shown = await inspName(p);
  const n1 = await nodeCount(p);
  await p.evaluate(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(500);
  const gone = await p.evaluate((id) => !JSON.parse(window.__EM_DRAG__.graphJson()).nodes.some((x) => x.id === id), born?.id);
  const n2 = await nodeCount(p);
  await ctx.close();
  const conds = { proposed: before.name !== after.name && /USV/.test(after.name ?? ""), born: born?.type === "USVs" && g1 === 1 && shown === after.name,
    undone: gone && n2 === n0 && n1 > n0, errors: !errors.length };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, before: before.name, after: after.name, born, g1, shown, n: [n0, n1, n2], errors } };
});
test("S3.assocMenu", "Spazio · MICRO-PANNELLI-LATERALI p.2 · il clic destro su un abbozzo come Blender (associa, crea, inquadra, sposta/ruota/scala, elimina); «Associa a un'unità…» apre l'Inspector se è chiuso e mette il fuoco nella ricerca; un'unità con proxy chiede «Sostituisci / Aggiungi come parte»; nessun elemento fuori dalla finestra dello Spazio", async () => {
  const { p, ctx, errors } = await assocScene("menu", { w: 1100, h: 760 });
  // the Inspector closed: «Associa…» opens it
  const insp = await p.evaluate(() => window.__EM_DRAG__.wins().find((w) => w.type === "inspector")?.id ?? null);
  if (insp) await p.evaluate((id) => window.__EM_DRAG__.closeWin(id), insp);
  await p.waitForTimeout(400);
  const closed = await p.evaluate(() => !window.__EM_DRAG__.wins().some((w) => w.type === "inspector"));
  await addCube(p);
  // the cube is born at the 3D cursor, maybe out of the frame: «Inquadra» the selection
  await p.click('.sol-head [data-sol="frame"]'); await p.waitForTimeout(500);
  const at = await p.evaluate(() => { const h = document.querySelector(".scn-host"); const s = h.__spaceSketches()[0]; return h.__spaceProject(s.position); });
  await p.mouse.click(at.x, at.y, { button: "right" }); await p.waitForTimeout(400);
  const menu = await p.evaluate(() => [...document.querySelectorAll(".scn-menu button")].map((b) => b.dataset.s3));
  const labels = await p.evaluate(() => [...document.querySelectorAll(".scn-menu button")].map((b) => b.textContent));
  // «Sposta (G)» from the menu: the modal of G, as the key; Esc leaves it
  await p.click('.scn-menu [data-s3="grab"]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
  const grab = await p.evaluate(() => document.querySelector(".scn-host").__spaceModal());
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const grabGone = await p.evaluate(() => document.querySelector(".scn-host").__spaceModal());
  await p.mouse.click(at.x, at.y, { button: "right" }); await p.waitForTimeout(400);
  await p.click('.scn-menu [data-s3="associate"]', { timeout: 5000 }).catch((e) => errors.push(`menu: ${String(e).slice(0, 120)}`)); await p.waitForTimeout(700);
  const opened = await p.evaluate(() => ({ insp: window.__EM_DRAG__.wins().some((w) => w.type === "inspector"), q: document.activeElement?.dataset?.assocQ === "1",
    floating: !!document.querySelector(".s3-assoc") }));
  // nothing of the Space's window outside it (the summary open and folded)
  const outside = () => p.evaluate(() => {
    const area = document.querySelector(".scn").closest(".tile-area");
    const A = area.getBoundingClientRect();
    return [...area.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
      const out = r.right > A.right + 1 || r.left < A.left - 1 || r.bottom > A.bottom + 1 || r.top < A.top - 1;
      if (!out) return false;
      for (let a = e.parentElement; a && a !== area; a = a.parentElement) { const o = getComputedStyle(a); const R = a.getBoundingClientRect();
        if ((o.overflow !== "visible" || o.overflowX !== "visible") && R.right <= A.right + 1 && R.bottom <= A.bottom + 1) return false; }
      return true; }).map((e) => String(e.className).slice(0, 40));
  });
  const out1 = await outside();
  await p.evaluate(() => document.querySelector(".scn-ov [data-fold=summary]")?.click()); await p.waitForTimeout(300);
  const out2 = await outside();
  const foldTitle = await p.evaluate(() => document.querySelector(".scn-ov").title);
  await p.evaluate(() => document.querySelector(".scn-ov [data-fold=summary]")?.click()); await p.waitForTimeout(300);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-associa-inspector-stretto.png` }).catch(() => {});
  // a unit with a proxy: the question, «Aggiungi come parte»
  const g0 = await geometryOf(p, "US102");
  await p.evaluate(() => document.querySelector('[data-assoc-list="withProxy"] [data-unit="US102"]')?.click());
  await p.evaluate(() => document.querySelector("[data-assoc-ok]")?.click());
  await p.waitForSelector(".s3-conflict", { timeout: 5000 }).catch(() => {});
  const asked = await p.evaluate(() => [...document.querySelectorAll(".s3-conflict [data-conflict]")].map((b) => b.dataset.conflict));
  await p.click('.s3-conflict [data-conflict="part"]').catch(() => {});
  await p.waitForFunction(() => !document.querySelector(".scn-host").__spaceSketches().length, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(600);
  const g1 = await geometryOf(p, "US102");
  await p.evaluate(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(500);
  const g2 = await geometryOf(p, "US102");
  await ctx.close();
  const conds = {
    closed,
    menu: JSON.stringify(menu) === JSON.stringify(["associate", "create-unit", "frame", "isolate", "grab", "rotate", "scale", "delete"])
      && labels.includes("Sposta (G)") && labels.includes("Elimina l'abbozzo (X)"),
    grab: !!grab && !grabGone,
    opened: opened.insp && opened.q && !opened.floating,
    inside: !out1.length && !out2.length && /proxy/.test(foldTitle),
    asked: JSON.stringify(asked) === JSON.stringify(["replace", "part", "cancel"]),
    part: g1 === g0 + 1 && g2 === g0,
    errors: !errors.length,
  };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, closed, menu, labels, grab, grabGone, opened, out1, out2, foldTitle, asked, g: [g0, g1, g2], errors } };
});
// ── MICRO-PROVA-DEV47 (E.D. 17 Oct 2026, dev.47 on Templu Mare v3.2) ─────────
// p.1 · each 3D window its own overlays glyph, floating in the scene's corner
// above the navigation gizmo, whichever window has the focus
const ovGeo = (p) => p.evaluate(() => [...document.querySelectorAll(".scn-host")].map((h) => {
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const b = h.querySelector(".scn-ovbtn");
  const hit = (a, c) => !!(a && c && !(a[2] <= c[0] || c[2] <= a[0] || a[3] <= c[1] || c[3] <= a[1]));
  const rb = R(b), rh = R(h);
  return { win: h.dataset.scn, shown: !!b && getComputedStyle(b).display !== "none", title: b?.title ?? null,
    overGizmo: hit(rb, R(h.querySelector(".scn-nav-box"))) || hit(rb, R(h.querySelector(".scn-nav-col"))),
    inside: !!rb && rb[0] >= rh[0] && rb[2] <= rh[2] && rb[1] >= rh[1] };
}));
test("S3.ovbtn", "Spazio · MICRO-PROVA-DEV47 p.1 · il pulsante delle sovrapposizioni è flottante in ogni finestra 3D (anche la seconda), sopra il gizmo senza toccarlo, con il pannello N aperto e chiuso, anche quando il fuoco è in un'altra finestra; apre il menu per gruppi e spegnere le etichette dei proxy funziona, in quella finestra sola (MICRO-OVERLAY-PER-FINESTRA)", async () => {
  const { p, ctx, errors } = await gizmoScene();
  const corner = async () => p.evaluate(() => { const c = document.querySelector(".scn-host canvas").getBoundingClientRect(); return { x: c.x + 40, y: c.y + c.height - 40 }; });
  const g0 = await ovGeo(p);
  await p.click(".scn-ntab"); await p.waitForTimeout(300);
  const gN = await ovGeo(p);
  let c = await corner(); await p.mouse.click(c.x, c.y); await p.keyboard.press("n"); await p.keyboard.press("t"); await p.waitForTimeout(300);
  // the focus in another window: the glyph stays in the scene, the graph's floating one is not over it
  const other = await p.evaluate(() => window.__EM_DRAG__.wins().find((w) => w.type !== "scene")?.id);
  const oc = await p.evaluate((id) => { const r = document.querySelector(`.tile-area[data-win="${id}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, other);
  await p.mouse.click(oc.x, oc.y);
  await p.waitForTimeout(300);
  const gOther = await ovGeo(p);
  const sceneWin = await winOf(p, "scene");
  const second = await p.evaluate((id) => window.__EM_DRAG__.splitDoc(id), sceneWin);
  await p.waitForTimeout(1500);
  const g2 = await ovGeo(p);
  // MICRO-OVERLAY-PER-FINESTRA · each 3D window has its own overlays: switched
  // off in the second, the proxies' labels go there and stay in the first
  const labels = (id) => p.evaluate((w) => [...document.querySelectorAll(`.tile-area[data-win="${w}"] .scn-label.k-proxy`)].filter((e) => e.style.display !== "none" && e.closest(".scn-labels")?.style.display !== "none").length, id);
  const px0 = await labels(second);
  const first0 = await labels(sceneWin);
  await p.click(`.scn-ovbtn[data-scn-overlays="${second}"]`); await p.waitForTimeout(400);
  const panel = await p.evaluate(() => ({ open: !document.getElementById("overlay-panel").classList.contains("hidden"), view: document.getElementById("overlay-panel").dataset.view,
    groups: [...document.querySelectorAll("#overlay-panel .ov-group")].map((g) => g.dataset.group) }));
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-ovbtn-seconda-finestra.png` }).catch(() => {});
  await p.click('#overlay-panel input[data-ov="s3_labels_proxy"]'); await p.waitForTimeout(500);
  const px1 = await labels(second);
  const first1 = await labels(sceneWin);
  const dot = await p.evaluate(([a, b]) => document.querySelector(`.scn-ovbtn[data-scn-overlays="${b}"]`)?.classList.contains("ov-off")
    && !document.querySelector(`.scn-ovbtn[data-scn-overlays="${a}"]`)?.classList.contains("ov-off"), [sceneWin, second]);
  await ctx.close();
  const ok = (gs, n) => gs.length === n && gs.every((g) => g.shown && !g.overGizmo && g.inside && /Sovrapposizioni/.test(g.title ?? ""));
  const conds = { closed: ok(g0, 1), nOpen: ok(gN, 1), otherFocus: ok(gOther, 1), twoWindows: !!second && ok(g2, 2),
    menu: panel.open && panel.view === "space" && ["s3_guides", "s3_text", "s3_objects", "s3_geometry"].every((k) => panel.groups.includes(k)),
    proxyLabelsOff: px0 > 0 && px1 === 0, firstKept: first0 > 0 && first1 === first0, dot, errors: !errors.length };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, g0, gN, gOther, g2, panel, px: [px0, px1], first: [first0, first1], errors } };
});
/** MICRO-PROVA-DEV47 p.2 · the first point of each kind under a grid of the canvas */
async function firstHits(p, kinds) {
  return p.evaluate((kinds) => {
    const h = document.querySelector(".scn-host"); const c = h.querySelector("canvas").getBoundingClientRect();
    const found = {};
    for (let gy = 0.1; gy <= 0.9; gy += 0.04) for (let gx = 0.1; gx <= 0.9; gx += 0.03) {
      const x = c.x + c.width * gx, y = c.y + c.height * gy;
      // a point the canvas itself takes (no label, no panel over it)
      if (document.elementFromPoint(x, y)?.tagName !== "CANVAS") continue;
      const hit = h.__spaceHit(x, y);
      if (hit && kinds.includes(hit.kind) && !found[hit.kind]) found[hit.kind] = { x, y, id: hit.id };
    }
    return found;
  }, kinds);
}
test("S3.pickRm", "Spazio · MICRO-PROVA-DEV47 p.2, rivisto da MICRO-VIEWER-SPAZIO-EMTREE p.1 · un modello (RM) si seleziona con Alt+clic (il clic semplice è dei proxy: su un modello senza proxy sotto non seleziona niente); Outliner e Inspector lo seguono; Maiusc aggiunge; il clic destro apre il menu del modello", async () => {
  const { p, ctx, errors } = await gizmoScene();
  const f = await firstHits(p, ["rm", "proxy"]);
  const sel = () => p.evaluate(() => ({ sel: window.__EM_DRAG__.selected(), insp: document.querySelector(".insp-name-input")?.value ?? null,
    outl: [...document.querySelectorAll(".scn-outliner .sol-row.sel, .scn-outliner .sol-row[aria-selected=true]")].map((e) => e.dataset.key ?? e.textContent.trim().slice(0, 30)) }));
  const out = {};
  if (f.rm) { await p.mouse.click(f.rm.x, f.rm.y); await p.waitForTimeout(600); out.plain = await sel(); }
  if (f.rm) { await p.keyboard.down("Alt"); await p.mouse.click(f.rm.x, f.rm.y); await p.keyboard.up("Alt"); await p.waitForTimeout(600); out.rm = await sel(); }
  if (f.proxy) { await p.mouse.click(f.proxy.x, f.proxy.y); await p.waitForTimeout(600); out.proxy = await sel(); }
  if (f.rm && f.proxy) { await p.keyboard.down("Shift"); await p.keyboard.down("Alt"); await p.mouse.click(f.rm.x, f.rm.y); await p.keyboard.up("Alt"); await p.keyboard.up("Shift"); await p.waitForTimeout(600); out.shift = await sel(); }
  if (f.rm) { await p.mouse.click(f.rm.x, f.rm.y, { button: "right" }); await p.waitForTimeout(400);
    out.menu = await p.evaluate(() => [...document.querySelectorAll(".scn-menu button")].map((b) => b.dataset.s3)); await p.keyboard.press("Escape"); }
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-pickrm.png` }).catch(() => {});
  await ctx.close();
  const conds = { found: !!f.rm && !!f.proxy, plain: !(out.plain?.sel ?? []).includes(f.rm?.id), rm: out.rm?.sel?.length === 1 && out.rm.sel[0] === f.rm?.id,
    proxy: out.proxy?.sel?.length === 1 && out.proxy.sel[0] === f.proxy?.id,
    shift: (out.shift?.sel ?? []).includes(f.rm?.id) && (out.shift?.sel ?? []).includes(f.proxy?.id),
    menu: (out.menu ?? []).includes("rmg-new"), errors: !errors.length };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, f, out, errors } };
});
/** MICRO-PROVA-DEV47 · Templu Mare (a copy: TEMPLU=<em.json>, the bridge's fs-root over it) in the Space, an epoch by its name */
async function templuSpace(epochPrefix, { use = "realtime", w = 1600, h = 1000 } = {}) {
  const { p, ctx, errors } = await open({ doc: null, w, h, init: { "emstudio.space3d": JSON.stringify({ "-": { deviceUse: use } }) } });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(process.env.TEMPLU, "utf8")), process.env.TEMPLU]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await workspace(p, "space");
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 60000 });
  await templuEpoch(p, epochPrefix);
  return { p, ctx, errors };
}
async function templuEpoch(p, epochPrefix) {
  const ep = await p.evaluate((pre) => [...document.querySelectorAll(".scn-seg button[data-epoch]")].find((b) => b.textContent.trim().startsWith(pre))?.dataset.epoch, epochPrefix);
  if (ep) await p.click(`.scn-seg button[data-epoch="${ep}"]`);
  for (let i = 0; i < 400; i++) {
    const st = await p.evaluate(() => { const s = document.querySelector(".scn-host")?.__space?.() ?? []; return { pending: s.filter((x) => x.as === "pending").length, gates: document.querySelectorAll("[data-gate=load]").length }; });
    if (st.gates) { await p.click("[data-gate=load]"); continue; }
    if (!st.pending) break;
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(600);
  return ep;
}
const olRows = (p) => p.evaluate(() => [...document.querySelectorAll(".scn-outliner .sol-row.sol-rm, .scn-outliner .sol-row.sol-tileset")]
  .map((r) => ({ key: r.dataset.key, name: r.querySelector(".sol-name")?.textContent, chip: r.querySelector(".sol-chip")?.textContent ?? null })));
const menuItems = (p) => p.evaluate(() => [...document.querySelectorAll(".scn-menu button")].map((b) => ({ act: b.dataset.s3, label: b.textContent, disabled: b.disabled })));
if (process.env.TEMPLU) test("S3.lodTM", "Spazio · MICRO-PROVA-DEV47 p.3, regola di GLOBO-INTERAZIONE p.4 · Templu Mare v3.2 nel desktop (uso realtime): il rilievo apre la sua versione PIÙ LEGGERA (la glb web, «leggera»), non il LOD2 OBJ dell'autore; la copia glb della ricetta coincide al millimetro con il LOD2; la ricostruzione apre la più leggera, mai «intero» né «LOD1»; l'etichetta del livello nell'Outliner è un menu coi livelli (OBJ dell'autore, derivate con l'origine, il master .blend che dice perché non si apre); il LOD0 si carica e si misura", async () => {
  const { p, ctx, errors } = await templuSpace("XX");
  const xx = await olRows(p);
  const podio = xx.find((r) => /PODIO/.test(r.name ?? ""));
  const id = podio?.key?.slice(3);
  const sp = () => p.evaluate((id) => document.querySelector(".scn-host").__space().find((x) => x.id === id), id);
  const box = () => p.evaluate((id) => document.querySelector(".scn-host").__spaceBoxOf(id), id);
  const d2 = await sp(), b2 = await box();
  // every survey model a mesh: OB_PRATO_LOD2.obj has one stray edge among its faces (three made it lines)
  const meshes = await p.evaluate(() => { const h = document.querySelector(".scn-host"); return h.__space().filter((x) => /SM_OB_/.test(x.id)).map((x) => [x.id, h.__spaceMeshesOf(x.id)]); });
  await p.click(`.scn-outliner .sol-row[data-key="rm:${id}"] [data-sol="lod"]`); await p.waitForTimeout(300);
  const menu = await menuItems(p);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-lod-menu-outliner.png` }).catch(() => {});
  const copy = menu.find((m) => /derivata da LOD2 · copia/.test(m.label));
  if (copy) { await p.click(`.scn-menu button[data-s3="${copy.act}"]`); await templuEpoch(p, "XX"); }
  const b3 = await box(); const chip3 = (await olRows(p)).find((r) => r.key === podio.key)?.chip;
  await p.click(`.scn-outliner .sol-row[data-key="rm:${id}"] [data-sol="lod"]`); await p.waitForTimeout(300);
  const l0 = (await menuItems(p)).find((m) => /^. LOD0 · OBJ/.test(m.label));
  const t0 = Date.now();
  if (l0) await p.click(`.scn-menu button[data-s3="${l0.act}"]`);
  await p.waitForFunction((id) => /LOD0\.obj$/.test(document.querySelector(".scn-host").__space().find((x) => x.id === id)?.url ?? "")
    && document.querySelector(".scn-host").__space().find((x) => x.id === id)?.as === "mesh", id, { timeout: 120000 }).catch(() => {});
  const ms0 = Date.now() - t0;
  const b0 = await box(); const d0 = await sp();
  await templuEpoch(p, "II");
  const ii = await olRows(p);
  await ctx.close();
  const near = (a, b, tol) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const conds = {
    // GLOBO-INTERAZIONE p.4 (E.D., 23 Oct): the lightest version first — the survey's web glb, not the LOD2 OBJ
    podioLight: / · leggera( ▾)?$/.test(podio?.chip ?? "") && /(@|%40)lod4-web\.glb$/.test(d2?.url ?? "") && d2?.as === "mesh",
    allSurveyLight: xx.filter((r) => /SM_OB_/.test(r.name ?? "")).every((r) => / · leggera( ▾)?$/.test(r.chip ?? "")),
    allMeshes: meshes.length === 11 && meshes.every(([, m]) => m.meshes > 0 && m.other === 0),
    tilesetSaysTileset: xx.filter((r) => /tileset/i.test(r.name ?? "")).every((r) => /^tileset/.test(r.chip ?? "")),
    menu: ["LOD0 · OBJ", "LOD1 · OBJ", "LOD2 · OBJ", "derivata da LOD2 · copia · glb", "derivata da LOD2 · 50 %"].every((w) => menu.some((m) => m.label.includes(w)))
      && menu.some((m) => m.disabled && /master · \.blend.*aprilo in Blender/.test(m.label)) && menu.some((m) => m.act === "ver-auto") && menu.some((m) => m.act === "ver-use") && menu.some((m) => m.act === "ver-light"),
    copyCoincides: /^derivata · fisso/.test(chip3 ?? ""),
    lod0: /LOD0\.obj$/.test(d0?.url ?? "") && near(b0, b3, 0.0015),
    reconstructionLight: ii.length > 50 && ii.every((r) => / · leggera( ▾)?$/.test(r.chip ?? "") && !/^intero/.test(r.chip ?? "")),
    errors: !errors.length,
  };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, podio, d2url: d2?.url, d2as: d2?.as, b2, b3, b0, ms0, chip3, meshes, menu: menu.map((m) => m.label), iiChips: [...new Set(ii.map((r) => r.chip))], errors } };
});
if (process.env.TEMPLU) test("S3.lodTMpanel", "Spazio · MICRO-PROVA-DEV47 p.3b · il pannello N «Livello di dettaglio» per l'attivo, la selezione e l'epoca, con le parole di Cesium (Manuale / Per uso / Automatico); sull'epoca «Fisso: LOD0» per 11 modelli (1 GB) chiede prima, Annulla (Esc) non cambia nulla", async () => {
  const { p, ctx, errors } = await templuSpace("XX");
  const xx = await olRows(p);
  const podio = xx.find((r) => /PODIO/.test(r.name ?? ""));
  await p.click(`.scn-outliner .sol-row[data-key="${podio.key}"] .sol-name`); await p.waitForTimeout(400);
  if (!await p.$(".scn-npanel:not(.hidden) [data-np=lod], [data-np=lod]:visible")) { await p.click(".scn-ntab").catch(() => {}); await p.waitForTimeout(400); }
  const panel = () => p.evaluate(() => { const s = document.querySelector('[data-np="lod"]'); return s && { scope: [...s.querySelectorAll('[data-np="lod-scope"] button')].map((b) => `${b.dataset.v}:${b.getAttribute("aria-pressed")}`),
    mode: [...s.querySelectorAll('[data-np="lod-mode"] button')].map((b) => `${b.textContent}:${b.getAttribute("aria-pressed")}`),
    level: [...s.querySelectorAll('[data-np="lod-level"] option')].map((o) => o.textContent), drawn: s.querySelector('[data-np="lod-drawn"]')?.textContent }; });
  const active = await panel();
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-lod-pannello-n.png` }).catch(() => {});
  await p.click('[data-np="lod-scope"] button[data-v="epoch"]'); await p.waitForTimeout(300);
  await p.click('[data-np="lod-mode"] button[data-v="manual"]'); await p.waitForTimeout(400);
  const epoch = await panel();
  const opts = await p.evaluate(() => [...document.querySelectorAll('[data-np="lod-level"] option')].map((o) => ({ v: o.value, t: o.textContent })));
  const l0 = opts.find((o) => /LOD0/.test(o.t));
  if (l0) await p.selectOption('[data-np="lod-level"]', l0.v);
  await p.waitForTimeout(300);
  const ask = await p.evaluate(() => document.querySelector(".ask-modal .modal-body")?.textContent ?? null);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const afterCancel = await olRows(p);
  await ctx.close();
  const conds = {
    active: !!active && active.scope[0] === "active:true" && active.mode.join() === "Più leggera:true,Manuale:false,Per uso:false,Automatico:false" && active.level.some((x) => /LOD2 · OBJ/.test(x)) && /glb.*leggera/.test(active.drawn ?? ""),
    epoch: !!epoch && epoch.scope[2] === "epoch:true" && opts.some((o) => /Fisso: LOD0 \(11\)/.test(o.t)),
    asked: /11 modelli pesano 1\.\d\d GB insieme/.test(ask ?? ""),
    cancelKeeps: afterCancel.filter((r) => /SM_OB_/.test(r.name ?? "")).every((r) => / · fisso( ▾)?$/.test(r.chip ?? "")),
    errors: !errors.length,
  };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, active, epoch, opts, ask, chips: [...new Set(afterCancel.map((r) => r.chip))], errors } };
});
if (process.env.TEMPLU) test("S3.altTM", "Spazio · MICRO-PROVA-DEV48 p.1 (era DEV47 p.4) · l'alternativa del contenitore in un gesto su Templu Mare v3.2 (nessun contenitore): la sezione «Alternativa» del tileset dice «un modello a sé» e offre UN pulsante, «Fa da alternativa ai modelli di quest'epoca…»; la finestrella elenca gli 11 modelli spuntati, «Rilievo · XX sec», la copertura sulle foglie (IoU 0.97); TEMPLUM tolto, nome Survey2015, «Crea e dichiara» → rmgroup_Survey2015 con 10 modelli e il tileset sua alternativa, il contenitore selezionato con l'aiuto; Modelli / Tileset / Automatico sulla riga; UN passo di annulla toglie contenitore e cappello; salvato e riaperto, resta", async () => {
  const { p, ctx, errors } = await templuSpace("XX");
  const rows = () => p.evaluate(() => [...document.querySelectorAll(".scn-outliner .sol-row")].map((r) => ({ key: r.dataset.key, kind: [...r.classList].find((c) => c.startsWith("sol-") && c !== "sol-row"), name: r.querySelector(".sol-name")?.textContent, chips: [...r.querySelectorAll(".sol-chip")].map((c) => c.textContent) })));
  const insp = () => p.evaluate(() => { const s = document.querySelector(".insp-alt"); return s && { text: s.innerText, buttons: [...s.querySelectorAll("button")].map((b) => `${b.dataset.s3}:${b.disabled ? "off" : "on"}`), help: s.querySelector("[data-alt-help], [data-alt=proposal-help]") ? true : false, helpText: s.querySelector("[data-alt-help]")?.textContent ?? null }; });
  const dlg = () => p.evaluate(() => { const d = document.querySelector(".s3-altdlg"); return d && { rows: [...d.querySelectorAll(".s3-altdlg-row input")].map((c) => c.checked), name: d.querySelector(".s3-altdlg-name-in").value, cov: d.querySelector(".s3-altdlg-cov").textContent, ok: d.querySelector("[data-altdlg=ok]").textContent }; });
  const tileset = (await rows()).find((r) => /tileset/i.test(r.name ?? ""));
  await p.click(`.scn-outliner .sol-row[data-key="${tileset.key}"] .sol-name`); await p.waitForTimeout(1500);
  const before = await insp();
  await p.click('.insp-alt button[data-s3="alt-from-epoch"]');
  await p.waitForFunction(() => /IoU/.test(document.querySelector(".s3-altdlg-cov")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
  const opened = await dlg();
  await p.evaluate(() => [...document.querySelectorAll(".s3-altdlg-row")].find((x) => /TEMPLUM/.test(x.textContent)).querySelector("input").click());
  await p.fill(".s3-altdlg-name-in", "Survey2015");
  await p.selectOption(".s3-altdlg-doc", "");
  const ready = await dlg();
  await p.click(".s3-altdlg [data-altdlg=ok]"); await p.waitForTimeout(1500);
  const selected = await p.evaluate(() => window.__EM_DRAG__.selected());
  await templuEpoch(p, "XX"); await p.waitForTimeout(1500);
  const made = await rows();
  const group = made.find((r) => r.kind === "sol-rmgroup");
  const alt = made.find((r) => r.key === "rm:rmgroup_Survey2015");
  await p.click(`.scn-outliner .sol-row[data-key="rm:rmgroup_Survey2015"] .sol-name`); await p.waitForTimeout(800);
  const after = await insp();
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-alt-survey2015.png` }).catch(() => {});
  const drawn = () => p.evaluate(() => { const s = document.querySelector(".scn-host").__space(); return { tiles: s.some((x) => x.id === "rmgroup_Survey2015" && x.as === "tiles"),
    members: s.filter((x) => /SM_OB_/.test(x.id) && !/TEMPLUM/.test(x.id) && x.as === "mesh").length, templum: s.some((x) => /TEMPLUM/.test(x.id) && x.as === "mesh") }; });
  const modes = {};
  for (const m of ["tileset", "models"]) {
    await p.click(`.scn-outliner .sol-row[data-key="${group.key}"] [data-sol="alt"]`); await p.waitForTimeout(300);
    await p.click(`.scn-menu button[data-s3="alt-${m}"]`); await templuEpoch(p, "XX");
    modes[m] = await drawn();
  }
  const json = await p.evaluate(() => window.__EM_DRAG__.docJson());
  // ONE step of undo: the container and the hat together
  await p.evaluate(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(800);
  const undone = await p.evaluate(() => { const g = JSON.parse(window.__EM_DRAG__.docJson()); const gr = Object.values(g.graphs).find((x) => x.nodes);
    return { hat: gr.edges.some((e) => e.edge_type === "has_linked_resource" && e.source === "rmgroup_Survey2015"), group: gr.nodes.some((n) => n.id === "rmgroup_Survey2015"), tilesetRm: gr.nodes.some((n) => n.node_type === "representation_model" && /XX_tileset/.test(n.name ?? "")) }; });
  await ctx.close();
  const saved = `${process.env.TEMPLU.replace(/\.em\.json$/, "")}-s3alt.em.json`;
  writeFileSync(saved, json);
  const prev = process.env.TEMPLU; process.env.TEMPLU = saved;
  const again = await templuSpace("XX");
  process.env.TEMPLU = prev;
  const reopened = (await again.p.evaluate(() => [...document.querySelectorAll(".scn-outliner .sol-row.sol-rmgroup")].map((r) => ({ name: r.querySelector(".sol-name")?.textContent, chips: [...r.querySelectorAll(".sol-chip")].map((c) => c.textContent) }))));
  const reAlt = await again.p.evaluate(() => document.querySelector(".scn-host").__space().some((x) => x.id === "rmgroup_Survey2015"));
  await again.ctx.close();
  const conds = {
    before: /Un modello a sé/.test(before?.text ?? "") && before.buttons.includes("alt-from-epoch:on") && !before.buttons.some((b) => /alt-confirm|alt-new/.test(b)),
    dialog: opened?.rows.length === 11 && opened.rows.every(Boolean) && opened.name === "Rilievo · XX sec" && /IoU 0\.9/.test(opened.cov) && /foglia/.test(opened.cov),
    ready: ready?.rows.filter(Boolean).length === 10 && ready.ok === "Crea e dichiara" && /TEMPLUM/.test(ready.cov),
    made: group?.name === "Survey2015" && group.chips.some((c) => /Automatico/.test(c)) && !!alt && selected.includes("rmgroup_Survey2015"),
    help: /L'alternativa di «Survey2015»/.test(after?.text ?? "") && /foglia/.test(after?.helpText ?? ""),
    modes: modes.tileset?.tiles && modes.tileset.members === 0 && modes.models && !modes.models.tiles && modes.models.members === 10 && modes.tileset.templum && modes.models.templum,
    undo: !undone.hat && !undone.group && undone.tilesetRm,
    // the mode is the person's view (local), not the data's: a fresh profile reopens it «Automatico»
    reopened: reopened.some((r) => r.name === "Survey2015" && r.chips.some((c) => /Automatico|Modelli|Tileset/.test(c))) && reAlt,
    errors: !errors.filter((e) => !/Failed to load resource/.test(e)).length && !again.errors.filter((e) => !/Failed to load resource/.test(e)).length,
  };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, before, opened, ready, after, modes, undone, reopened, errors } };
});
if (process.env.TEMPLU_EMT) test("S3.altEmTools", "Spazio · MICRO-PROVA-DEV48 p.1 · un em.json salvato da EM Tools con i suoi contenitori (Survey2015, Legacy RMs; il tileset membro di Legacy RMs): la sezione del tileset PROPONE «Fa da alternativa al contenitore «Survey2015» (10 modelli)» con Conferma (il meglio coperto, IoU sulle foglie), Legacy RMs nel menu; la finestrella con TEMPLUM tolto dice «Dichiara su «Survey2015»» e non crea niente; Conferma: due contenitori prima e dopo, il cappello su rmgroup_Survey2015", async () => {
  const { p, ctx, errors } = await open({ doc: null, w: 1600, h: 1000, init: { "emstudio.space3d": JSON.stringify({ "-": { deviceUse: "realtime" } }) } });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(process.env.TEMPLU_EMT, "utf8")), process.env.TEMPLU_EMT]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await workspace(p, "space");
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 60000 });
  await templuEpoch(p, "XX");
  const groupsOf = () => p.evaluate(() => { const g = JSON.parse(window.__EM_DRAG__.docJson()); const gr = Object.values(g.graphs).find((x) => x.nodes);
    return { groups: gr.nodes.filter((n) => n.node_type === "RepresentationModelNodeGroup").map((n) => n.id).sort(), hat: gr.edges.filter((e) => e.edge_type === "has_linked_resource" && /rmgroup/.test(e.source)).map((e) => e.source) }; });
  const g0 = await groupsOf();
  const key = await p.evaluate(() => [...document.querySelectorAll(".scn-outliner .sol-row")].find((r) => /tileset/i.test(r.querySelector(".sol-name")?.textContent ?? ""))?.dataset.key);
  await p.click(`.scn-outliner .sol-row[data-key="${key}"] .sol-name`);
  await p.waitForSelector(".insp-alt [data-alt-proposal]", { timeout: 20000 }).catch(() => {});
  const sect = await p.evaluate(() => { const s = document.querySelector(".insp-alt"); return s && { proposal: s.querySelector("[data-alt-proposal]")?.textContent ?? null, options: [...s.querySelectorAll("select[data-alt-propose] option")].map((o) => o.textContent), confirm: !!s.querySelector('[data-s3="alt-confirm"]') }; });
  await p.click('.insp-alt button[data-s3="alt-from-epoch"]'); await p.waitForTimeout(1200);
  await p.evaluate(() => [...document.querySelectorAll(".s3-altdlg-row")].find((x) => /TEMPLUM/.test(x.textContent)).querySelector("input").click());
  const okText = await p.evaluate(() => document.querySelector(".s3-altdlg [data-altdlg=ok]")?.textContent);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await p.click('.insp-alt button[data-s3="alt-confirm"]'); await p.waitForTimeout(2000);
  const g1 = await groupsOf();
  await ctx.close();
  const conds = { proposal: /«Survey2015» \(10 modelli\)/.test(sect?.proposal ?? "") && sect.confirm && sect.options.some((o) => /Legacy RMs/.test(o)),
    dialog: okText === "Dichiara su «Survey2015»",
    noDouble: JSON.stringify(g0.groups) === JSON.stringify(g1.groups) && g1.groups.length === 2,
    hat: g1.hat.length === 1 && g1.hat[0] === "rmgroup_Survey2015",
    errors: !errors.filter((e) => !/Failed to load resource/.test(e)).length };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, sect, okText, g0, g1, errors } };
});
if (process.env.TEMPLU33) test("S3.tilesetCont", "Spazio · MICRO-TILESET-CONTENITORE · Templu Mare v3.3 (Survey2015 col cappello del tileset): aperta pulita il contenitore è in «Automatico» e da lontano disegna il solo tileset; da Automatico a Tileset la scena mostra il tileset senza riavvio (prima restava vuota: il visible=false dell'automatico); Modelli → Tileset → Automatico → Modelli con il conteggio di ciò che è disegnato, mai tutti e due; in automatico da lontano solo il tileset, da vicino solo le mesh dei membri, la striscia lo dice; il selettore Modelli / Tileset / Automatico nel pannello N, sulla riga dell'Outliner e nell'Inspector, una sola sorgente; la scelta Modelli resta riaprendo", async () => {
  const G = "rmgroup_Survey2015";
  const { p, ctx, errors } = await open({ doc: null, w: 1700, h: 1050, init: { "emstudio.space3d": JSON.stringify({ "-": { deviceUse: "realtime", nShown: true } }) } });
  const openDoc = async () => {
    await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(process.env.TEMPLU33, "utf8")), process.env.TEMPLU33]);
    await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
    await workspace(p, "space");
    await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 60000 });
    await templuEpoch(p, "XX");
  };
  // what is DRAWN: the tileset's visible meshes, the members' (TEMPLUM is outside the container)
  const drawnNow = () => p.evaluate((G) => { const h = document.querySelector(".scn-host"); const d = h.__spaceDrawn(); const ts = d[`rm:${G}`];
    return { tiles: ts?.visible ? ts.meshes : 0, members: Object.entries(d).filter(([k, x]) => /SM_OB_/.test(k) && !/TEMPLUM/.test(k) && x.visible && x.meshes > 0).length,
      chip: document.querySelector(".scn-outliner .sol-row.sol-rmgroup [data-sol=alt]")?.textContent ?? null, line: document.querySelector(".scn-altline")?.textContent ?? "" }; }, G);
  const until = async (ok, ms = 15000) => { const t0 = Date.now(); let d; do { d = await drawnNow(); if (ok(d)) return d; await p.waitForTimeout(250); } while (Date.now() - t0 < ms); return d; };
  const viaChip = async (m) => { await p.click(`.scn-outliner .sol-row.sol-rmgroup [data-sol="alt"]`); await p.waitForTimeout(300); await p.click(`.scn-menu button[data-s3="alt-${m}"]`); await templuEpoch(p, "XX"); };
  const one = (d) => (d.tiles > 0) !== (d.members > 0);
  await openDoc();
  const opened = await until((d) => d.tiles > 0 && /automatico/.test(d.line));
  // the case of E.D.: from «Automatico» straight to «Tileset»
  await viaChip("tileset");
  const tilesetFromAuto = await until((d) => d.tiles > 0 && d.members === 0, 8000);
  const steps = {};
  for (const m of ["models", "tileset", "auto", "models"]) {
    await viaChip(m);
    steps[m + (steps[m] ? "2" : "")] = await until((d) => (m === "models" ? d.members === 10 && d.tiles === 0 : m === "tileset" ? d.tiles > 0 && d.members === 0 : one(d)), 10000);
  }
  // the person's choice stays: «Modelli», the document opened again
  await openDoc();
  const reopened = await until((d) => d.members === 10, 10000);
  // the N panel: the container active, its three buttons; «Automatico» there → the chip and the Inspector follow
  await p.click(`.scn-outliner .sol-row[data-key="rm:${G}"] .sol-name`); await p.waitForTimeout(1200);
  const npBefore = await p.evaluate(() => [...document.querySelectorAll("[data-np=alt-mode] button")].map((b) => `${b.dataset.v}:${b.getAttribute("aria-pressed")}`));
  await p.click(`[data-np=alt-mode] button[data-v=auto]`); await p.waitForTimeout(1500);
  const oneSource = await p.evaluate(() => ({ chip: document.querySelector(".scn-outliner .sol-row.sol-rmgroup [data-sol=alt]")?.textContent,
    insp: [...document.querySelectorAll(".insp-alt [data-alt-mode] button[aria-pressed=true]")].map((b) => b.dataset.v), np: [...document.querySelectorAll("[data-np=alt-mode] button[aria-pressed=true]")].map((b) => b.dataset.v) }));
  // far and near, the camera on the members' centre along the view
  const geo = await p.evaluate(() => { const h = document.querySelector(".scn-host"); const bs = ["SM_OB_EST_bk_LOD1_model", "SM_OB_EST_fr_LOD1_model", "SM_OB_PODIO_LOD1_model", "SM_OB_PRATO_LOD1_model"].map((i) => h.__spaceBoxOf(i)).filter(Boolean);
    const c = [0, 1, 2].map((k) => (Math.min(...bs.map((b) => b[k])) + Math.max(...bs.map((b) => b[k + 3]))) / 2); const cam = h.__spaceCamera(); const d = [0, 1, 2].map((k) => cam[k] - c[k]); const n = Math.hypot(...d); return { c, dir: d.map((x) => x / n) }; });
  const at = (dist) => p.evaluate(([g, dist]) => document.querySelector(".scn-host").__spaceSetCam({ pos: g.c.map((v, k) => v + g.dir[k] * dist), target: g.c }), [geo, dist]);
  const dist = {};
  let both = 0;
  for (const d of [250, 60, 250]) {
    await at(d);
    const r = await until((x) => (d > 100 ? x.tiles > 0 && x.members === 0 : x.members > 0 && x.tiles === 0), 10000);
    if (r.tiles > 0 && r.members > 0) both++;
    dist[d + (dist[d] ? "b" : "")] = r;
  }
  await ctx.close();
  const conds = {
    opened: opened.tiles > 0 && opened.members === 0 && /Automatico/.test(opened.chip ?? "") && /Survey2015 · automatico · tileset/.test(opened.line),
    tilesetFromAuto: tilesetFromAuto.tiles > 0 && tilesetFromAuto.members === 0,
    switches: steps.models.members === 10 && steps.models.tiles === 0 && steps.tileset.tiles > 0 && steps.tileset.members === 0 && one(steps.auto) && steps.models2.members === 10 && steps.models2.tiles === 0,
    reopened: reopened.members === 10 && reopened.tiles === 0 && /Modelli/.test(reopened.chip ?? ""),
    npanel: npBefore.join() === "models:true,tileset:false,auto:false",
    oneSource: /Automatico/.test(oneSource.chip ?? "") && oneSource.insp.join() === "auto" && oneSource.np.join() === "auto",
    far: dist[250].tiles > 0 && dist[250].members === 0 && /tileset \(livell/.test(dist[250].line),
    near: dist[60].members === 10 && dist[60].tiles === 0 && /modelli \(/.test(dist[60].line),
    farAgain: dist["250b"].tiles > 0 && dist["250b"].members === 0,
    neverBoth: both === 0,
    errors: !errors.filter((e) => !/Failed to load resource/.test(e)).length,
  };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, opened, tilesetFromAuto, steps, reopened, npBefore, oneSource, dist, errors } };
});
if (process.env.TEMPLU) test("S3.showSelTM", "Spazio · MICRO-PROVA-DEV48 p.4 · con «Zoom to selection» acceso la selezione si vede in ogni finestra: dall'Outliner, dal Tabular e dalla Matrix lo Spazio inquadra (un passaggio di circa 200 ms), dalla scena non si muove; l'Outliner apre i rami e scorre (e non torna in cima dopo un clic); il Tabular scorre e passa alla scheda che ha la riga (un documento: «Documenti»); un'unità col proxy in un'altra epoca porta lo Spazio a quell'epoca e lo dice; spento, resta solo la selezione", async () => {
  const { p, ctx, errors } = await templuSpace("II", { w: 1700, h: 1050 });
  await p.click("[data-frame]"); await p.waitForTimeout(600);
  const H = () => document.querySelector(".scn-host");
  const cam = () => p.evaluate(() => document.querySelector(".scn-host").__spaceCamera().join(","));
  const home = await p.evaluate(() => document.querySelector(".scn-host").__spaceCamState());
  const aside = () => p.evaluate((c) => document.querySelector(".scn-host").__spaceSetCam({ pos: [c.pos[0] + 300, c.pos[1], c.pos[2]], target: [c.target[0] + 300, c.target[1], c.target[2]] }), home);
  const onScreen = (id) => p.evaluate((id) => { const h = document.querySelector(".scn-host"); const s = h.__spaceScreenOf(id); const c = h.querySelector("canvas").getBoundingClientRect(); return !!s && s.x > c.left && s.x < c.right && s.y > c.top && s.y < c.bottom; }, id);
  const rowSeen = (sel, box) => p.evaluate(([sel, box]) => { const r = document.querySelector(sel); const b = r && (box ? document.querySelector(box) : r.closest(".tile-area")); if (!r || !b) return false; const a = r.getBoundingClientRect(), c = b.getBoundingClientRect(); return a.top >= c.top - 1 && a.bottom <= c.bottom + 1; }, [sel, box]);
  // three units drawn here, hit in the scene
  const ids = await p.evaluate(() => { const h = document.querySelector(".scn-host"); const cv = h.querySelector("canvas"); const c = cv.getBoundingClientRect(); const at = new Map();
    for (let gx = 0.05; gx < 0.95; gx += 0.03) for (let gy = 0.05; gy < 0.95; gy += 0.03) { const x = c.left + gx * c.width, y = c.top + gy * c.height;
      if (document.elementFromPoint(x, y) !== cv) continue; const hit = h.__spaceHit(x, y); if (hit?.kind === "proxy" && !at.has(hit.id)) at.set(hit.id, { x, y }); }
    return [...at].map(([id, pt]) => ({ id, ...pt })); });
  const out = { n: ids.length };
  const [a, b, c] = [ids[0], ids[Math.floor(ids.length / 2)], ids[ids.length - 1]];
  // the Outliner: the Space frames, in about 200 ms; the list stays where it was; the table scrolls
  await aside();
  await p.evaluate((id) => document.querySelector(`.scn-outliner .sol-row[data-key="proxy:${id}"]`).scrollIntoView({ block: "center" }), a.id);
  const top0 = await p.evaluate(() => document.querySelector(".scn-outliner .sol-tree").scrollTop);
  await p.evaluate(() => { window.__smp = []; const h = document.querySelector(".scn-host"); let t0 = 0; const tick = () => { window.__smp.push(h.__spaceGizmo().animating); if (performance.now() - t0 < 700) requestAnimationFrame(tick); };
    document.addEventListener("pointerdown", () => { t0 = performance.now(); requestAnimationFrame(tick); }, { once: true, capture: true }); });
  const c0 = await cam();
  await p.click(`.scn-outliner .sol-row[data-key="proxy:${a.id}"] .sol-name`); await p.waitForTimeout(1200);
  out.outliner = { moved: c0 !== await cam(), seen: await onScreen(a.id), animFrames: (await p.evaluate(() => window.__smp)).filter(Boolean).length,
    listKept: Math.abs(await p.evaluate(() => document.querySelector(".scn-outliner .sol-tree").scrollTop) - top0) < 2,
    table: await rowSeen(`.tile-area tr[data-row="${a.id}"].tv-sel-act`) };
  // the table: the Space frames, the Outliner scrolls to the row
  await aside(); await p.evaluate(() => { document.querySelector(".scn-outliner .sol-tree").scrollTop = 0; });
  await p.evaluate((id) => document.querySelector(`.tile-area tr[data-row="${id}"]`).scrollIntoView({ block: "center" }), b.id);
  const c1 = await cam();
  await p.click(`.tile-area tr[data-row="${b.id}"] [data-go]`); await p.waitForTimeout(1200);
  out.table = { moved: c1 !== await cam(), seen: await onScreen(b.id), outliner: await rowSeen(`.scn-outliner .sol-row.sel[data-key="proxy:${b.id}"]`, ".scn-outliner .sol-tree") };
  // the Matrix: the Space frames
  await p.evaluate((id) => window.__EM_DRAG__.jumpTo(id), c.id); await p.waitForTimeout(400);
  await p.evaluate(() => window.__EM_DRAG__.select(null)); await aside(); await p.waitForTimeout(300);
  const mb = await p.evaluate((id) => { const ws = window.__EM_DRAG__.winScene("space:canvas"); const b = ws.boxes.find((x) => x.id === id); return b && { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }, c.id);
  const c2 = await cam();
  if (mb) { await p.mouse.click(mb.x, mb.y); await p.waitForTimeout(1200); }
  out.matrix = { clicked: !!mb, moved: c2 !== await cam(), seen: await onScreen(c.id) };
  // the scene: it does not move, the others show
  await p.evaluate((c) => document.querySelector(".scn-host").__spaceSetCam(c), home); await p.waitForTimeout(300);
  await p.evaluate(() => { document.querySelector(".scn-outliner .sol-tree").scrollTop = 0; });
  const c3 = await cam();
  await p.mouse.click(a.x, a.y); await p.waitForTimeout(1200);
  out.scene = { selected: (await p.evaluate(() => window.__EM_DRAG__.selected())).includes(a.id), still: c3 === await cam(),
    outliner: await rowSeen(`.scn-outliner .sol-row.sel[data-key="proxy:${a.id}"]`, ".scn-outliner .sol-tree") };
  // a document from the Matrix: the table goes to «Documenti»
  const doc = await p.evaluate(() => window.__EM_DRAG__.winScene("space:canvas").boxes.map((b) => b.id).find((id) => window.__EM_DRAG__.node(id)?.node_type === "document"));
  await p.evaluate((id) => window.__EM_DRAG__.jumpTo(id), doc); await p.waitForTimeout(400);
  await p.evaluate(() => window.__EM_DRAG__.select(null)); await p.waitForTimeout(300);
  const db = await p.evaluate((id) => { const ws = window.__EM_DRAG__.winScene("space:canvas"); const b = ws.boxes.find((x) => x.id === id); return b && { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }, doc);
  if (db) { await p.mouse.click(db.x, db.y); await p.waitForTimeout(1200); }
  out.sheet = { to: await p.evaluate(() => window.__EM_DRAG__.wins().find((w) => w.id === "space:models")?.state?.["current.table.sheet"]),
    row: await rowSeen(`.tile-area tr[data-row="${doc}"].tv-sel-act`) };
  await p.click('.tile-area[data-win="space:models"] .win-mode-toggle'); await p.waitForTimeout(200);
  await p.click('.tile-area[data-win="space:models"] .dd-menu button[data-sheet="Models"]'); await p.waitForTimeout(600);
  // a unit whose proxy is in XX sec, picked in the table while the Space shows II A.D.
  const here = new Set(await p.evaluate(() => document.querySelector(".scn-host").__space().filter((x) => x.kind === "proxy").map((x) => x.id)));
  await templuEpoch(p, "XX");
  const there = (await p.evaluate(() => document.querySelector(".scn-host").__space().filter((x) => x.kind === "proxy").map((x) => x.id))).filter((id) => !here.has(id));
  await templuEpoch(p, "II");
  if (there[0]) {
    await p.evaluate((id) => document.querySelector(`.tile-area tr[data-row="${id}"]`)?.scrollIntoView({ block: "center" }), there[0]);
    await p.click(`.tile-area tr[data-row="${there[0]}"] [data-go]`); await p.waitForTimeout(500);
    const toastText = await p.evaluate(() => document.querySelector("#toast")?.textContent ?? "");
    await templuEpoch(p, "XX"); await p.waitForTimeout(800);
    out.epoch = { to: await p.evaluate(() => document.querySelector(".scn-seg button[aria-pressed=true], .scn-seg button.active")?.textContent?.trim()), toast: toastText, seen: await onScreen(there[0]) };
  }
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-showsel.png` }).catch(() => {});
  // off: the selection only
  await p.evaluate(() => document.getElementById("btn-zoom-sel").click());
  await aside();
  const c4 = await cam();
  const k = await p.evaluate(() => [...document.querySelectorAll(".scn-outliner .sol-row")].map((r) => r.dataset.key).filter((k) => k.startsWith("proxy:")).at(-2));
  await p.evaluate((k) => document.querySelector(`.scn-outliner .sol-row[data-key="${k}"]`).scrollIntoView({ block: "center" }), k);
  await p.click(`.scn-outliner .sol-row[data-key="${k}"] .sol-name`); await p.waitForTimeout(1200);
  out.off = { still: c4 === await cam(), selected: (await p.evaluate(() => window.__EM_DRAG__.selected())).includes(k.slice(6)) };
  await p.evaluate(() => document.getElementById("btn-zoom-sel").click());
  await ctx.close();
  const conds = { found: ids.length >= 3,
    outliner: out.outliner.moved && out.outliner.seen && out.outliner.animFrames >= 1 && out.outliner.listKept && out.outliner.table,
    table: out.table.moved && out.table.seen && out.table.outliner,
    matrix: out.matrix.clicked && out.matrix.moved && out.matrix.seen,
    scene: out.scene.selected && out.scene.still && out.scene.outliner,
    sheet: out.sheet.to === "Documents" && out.sheet.row,
    epoch: !!out.epoch && /XX/.test(out.epoch.to ?? "") && /XX/.test(out.epoch.toast) && out.epoch.seen,
    off: out.off.still && out.off.selected,
    errors: !errors.filter((e) => !/Failed to load resource/.test(e)).length };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, out, errors } };
});
if (process.env.TEMPLU) test("S3.lodAutoTM", "Spazio · MICRO-PROVA-DEV48 p.3 e p.5 · l'automatico per distanza usa anche i livelli dell'autore: XX sec tutto in «auto» (l'etichetta dice «auto · derivata lod4»); OB_PODIO isolato, la rotella verso di lui passa per lod3 e LOD1 fino a LOD0 disegnato («auto · LOD0», la striscia lo dice); allontanandosi torna a una derivata e LOD0 lascia la memoria; mai due LOD0; le misure dei file stanno nella cache locale (emstudio.measures, «misurato»), l'em.json non cambia", async () => {
  const { p, ctx, errors } = await templuSpace("XX", { w: 1600, h: 1000 });
  const doc0 = await p.evaluate(() => window.__EM_DRAG__.docJson());
  const epKey = await p.evaluate(() => document.querySelector(".scn-outliner .sol-row.cur")?.dataset.key);
  await p.click(`.scn-outliner .sol-row[data-key="${epKey}"] .sol-chip`); await p.waitForTimeout(300);
  await p.click('.scn-menu button[data-s3="ver-auto"]'); await templuEpoch(p, "XX"); await p.waitForTimeout(1500);
  const chip = (k) => p.evaluate((k) => document.querySelector(`.scn-outliner .sol-row[data-key="${k}"] .sol-chip`)?.textContent ?? "", k);
  const podio = await p.evaluate(() => [...document.querySelectorAll(".scn-outliner .sol-row")].find((r) => /^rm:/.test(r.dataset.key) && /PODIO/.test(r.textContent))?.dataset.key);
  const chip0 = await chip(podio);
  await p.click(`.scn-outliner .sol-row[data-key="${podio}"] .sol-name`); await p.waitForTimeout(300);
  await p.click('.scn-outliner [data-sol="isolate"]'); await p.waitForTimeout(1500);
  await p.click(`.scn-outliner .sol-row[data-key="${podio}"] .sol-name`); await p.waitForTimeout(300);
  await p.click('.scn-outliner [data-sol="frame"]'); await p.waitForTimeout(800);
  const st = () => p.evaluate((k) => { const h = document.querySelector(".scn-host"); const f = h.__spaceFlow().find((x) => x.key === k);
    return { name: f?.name ?? null, lod0: h.__spaceCacheKeys().filter((u) => /_LOD0\.obj/.test(u)).length }; }, podio);
  const id = podio.slice(3);
  const seen = []; let maxLod0 = 0; let at0 = null;
  for (let i = 0; i < 60 && !at0; i++) {
    const c = await p.evaluate((rid) => { const h = document.querySelector(".scn-host"); const b = h.__spaceBoxOf(rid); return b && h.__spaceProject([(b[0] + b[3]) / 2, b[4], (b[2] + b[5]) / 2]); }, id);
    if (!c) break;
    await p.mouse.move(c.x, c.y + 20); await p.mouse.wheel(0, -240); await p.waitForTimeout(500);
    const s = await st(); maxLod0 = Math.max(maxLod0, s.lod0);
    if (s.name && seen[seen.length - 1] !== s.name) seen.push(s.name);
    if (s.name === "LOD0") at0 = { chip: await chip(podio), strip: await p.evaluate(() => document.querySelector(".scn-flow")?.textContent ?? "") };
  }
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-podio-auto-lod0.png` }).catch(() => {});
  let away = null;
  for (let i = 0; i < 40 && !away; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(400); const s = await st(); maxLod0 = Math.max(maxLod0, s.lod0); if (s.name && /derivata/.test(s.name)) away = s; }
  await p.waitForTimeout(1000);
  const after = await st();
  const ms = await p.evaluate(() => JSON.parse(localStorage.getItem("emstudio.measures") ?? "{}"));
  const doc1 = await p.evaluate(() => window.__EM_DRAG__.docJson());
  await ctx.close();
  const conds = { auto: /^auto · derivata lod4/.test(chip0),
    chain: seen.includes("LOD1") && seen[seen.length - 1] === "LOD0" && !!at0,
    label: /^auto · LOD0/.test(at0?.chip ?? "") && /LOD0/.test(at0?.strip ?? ""),
    away: !!away && after.lod0 === 0, oneLod0: maxLod0 <= 1,
    measures: Object.values(ms).some((m) => m.tris > 0 && /EMStudio/.test(m.by)), docSame: doc0 === doc1,
    errors: !errors.filter((e) => !/Failed to load resource/.test(e)).length };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, chip0, seen, at0, away, after, maxLod0, measures: Object.keys(ms).length, errors } };
});
test("S3.assocConfirm", "Spazio · MICRO-PROVA-DEV47 p.5 · «Associa a un'unità»: gruppi che si chiudono col titolo e il conteggio a destra; ogni riga col tipo colorato, il nome, l'epoca, alta uguale; il triangolino apre descrizione, tipo, epoca, documento, rapporti, proxy; il passaggio accende l'unità nella Matrix; un clic sceglie e NON associa, il riepilogo «Associa la forma … a …» con Associa e Annulla; Esc annulla, Invio conferma; lo stesso per «Crea una nuova unità»", async () => {
  const { p, ctx, errors } = await assocScene("conferma");
  await addCube(p);
  const rowsH = await p.evaluate(() => [...document.querySelectorAll("[data-assoc] .insp-assoc-unit")].slice(0, 12).map((b) => Math.round(b.getBoundingClientRect().height)));
  const chip = await p.evaluate(() => { const c = document.querySelector('[data-assoc] [data-unit="US104"] .insp-assoc-type'); return c && { t: c.textContent, bg: getComputedStyle(c).backgroundColor }; });
  // fold a group by its title, and back
  await p.click('[data-assoc-group="elsewhere"]'); await p.waitForTimeout(150);
  const folded = await p.evaluate(() => ({ list: !!document.querySelector('[data-assoc-list="elsewhere"]'), count: document.querySelector('[data-assoc-group="elsewhere"] .insp-assoc-count')?.textContent }));
  await p.click('[data-assoc-group="elsewhere"]'); await p.waitForTimeout(150);
  // a row opened
  await p.click('[data-assoc] [data-assoc-open="US104"]'); await p.waitForTimeout(200);
  const detail = await p.evaluate(() => document.querySelector('[data-assoc-detail="US104"]')?.innerText ?? null);
  // the pointer over a row lights the unit in the Matrix
  await p.hover('[data-assoc] [data-unit="US104"] .insp-assoc-name'); await p.waitForTimeout(200);
  const lit = await p.evaluate(() => window.__EM_DRAG__.hovered());
  await p.mouse.move(5, 5); await p.waitForTimeout(150);
  const unlit = await p.evaluate(() => window.__EM_DRAG__.hovered());
  // a click chooses, and nothing is written
  const g0 = await geometryOf(p, "US104");
  await p.click('[data-assoc-list="here"] [data-unit="US104"] .insp-assoc-name'); await p.waitForTimeout(300);
  const g1 = await geometryOf(p, "US104");
  const sum = await p.evaluate(() => ({ text: document.querySelector("[data-assoc-confirm].on .insp-assoc-sum")?.textContent ?? null, picked: document.querySelector('[data-unit="US104"]')?.getAttribute("aria-pressed") }));
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-associa-conferma.png` }).catch(() => {});
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  const afterEsc = await p.evaluate(() => !!document.querySelector("[data-assoc-confirm].on"));
  // «Crea»: the summary too, and «Annulla»
  await p.click("[data-assoc-create]"); await p.waitForTimeout(200);
  const sumNew = await p.evaluate(() => document.querySelector("[data-assoc-confirm].on .insp-assoc-sum")?.textContent ?? null);
  await p.click("[data-assoc-cancel]"); await p.waitForTimeout(200);
  const n0 = await nodeCount(p);
  // and Enter confirms
  await p.click('[data-assoc-list="here"] [data-unit="US104"] .insp-assoc-name'); await p.waitForTimeout(300);
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => !document.querySelector(".scn-host").__spaceSketches().length, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(500);
  const g2 = await geometryOf(p, "US104"), n1 = await nodeCount(p);
  await ctx.close();
  const conds = {
    rows: rowsH.length > 3 && new Set(rowsH).size === 1,
    chip: chip?.t === "US" && !!chip.bg && chip.bg !== "rgba(0, 0, 0, 0)",
    folded: !folded.list && /^\d+$/.test(folded.count ?? ""),
    detail: /Tipo/.test(detail ?? "") && /Epoca/.test(detail ?? "") && /Documento/.test(detail ?? "") && /Rapporti/.test(detail ?? "") && /Proxy/.test(detail ?? ""),
    hover: lit === "US104" && unlit === null,
    chooseOnly: g1 === g0 && /^Associa la forma .+ a US104 \(US, Medioevo\)$/.test(sum.text ?? "") && sum.picked === "true",
    escCancels: !afterEsc,
    newAsks: /^Crea .+ \(US, Medioevo\) dalla forma /.test(sumNew ?? "") && n0 > 0,
    enterConfirms: g2 === g0 + 1 && n1 > n0,
    errors: !errors.length,
  };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, rowsH, chip, folded, detail, lit, unlit, g: [g0, g1, g2], sum, sumNew, errors } };
});
if (process.env.TEMPLU) test("S3.proxyDel", "Spazio · MICRO-PROVA-DEV47 p.5 · «Elimina il proxy» su Templu Mare (proxy di EM Tools): nell'Inspector dell'unità, nel clic destro sul proxy in scena e con X, sempre con conferma («L'unità resta», e che viene da EM Tools); Annulla non tocca nulla; Elimina toglie la SemanticShape e la sua catena in un passo, l'unità resta, il glb resta in proxies/; ⌘Z lo riporta", async () => {
  const { p, ctx, errors } = await templuSpace("XX");
  const f = await firstHits(p, ["proxy"]);
  const unit = f.proxy?.id;
  const geom = () => p.evaluate((u) => { const g = JSON.parse(window.__EM_DRAG__.graphJson()); const by = new Map(g.nodes.map((n) => [n.id, n]));
    return { unit: by.has(u), name: by.get(u)?.name, shapes: g.edges.filter((e) => e.source === u && e.edge_type === "has_property").map((e) => e.target)
      .flatMap((pid) => g.edges.filter((e) => e.source === pid && e.edge_type === "has_semantic_shape")).length }; }, unit);
  const g0 = await geom();
  await p.mouse.click(f.proxy.x, f.proxy.y); await p.waitForTimeout(600);
  const insp = await p.evaluate(() => document.querySelector(".insp-proxy")?.innerText ?? null);
  await p.click('.insp-proxy [data-s3="delete-proxy"]'); await p.waitForTimeout(300);
  const ask = await p.evaluate(() => document.querySelector(".ask-modal .modal-body")?.textContent ?? null);
  await p.click('.ask-modal [data-a="no"]'); await p.waitForTimeout(300);
  const gCancel = await geom();
  await p.mouse.click(f.proxy.x, f.proxy.y, { button: "right" }); await p.waitForTimeout(300);
  const menu = await p.evaluate(() => [...document.querySelectorAll(".scn-menu button")].map((b) => b.dataset.s3));
  await p.click('.scn-menu [data-s3="delete-proxy"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-elimina-proxy.png` }).catch(() => {});
  await p.keyboard.press("Enter"); await p.waitForTimeout(800);
  const gDel = await geom();
  const file = `${TEMPLU_DIR()}/EM/proxies/${g0.name}.glb`;
  const fileStays = existsSync(file);
  const drawnAfter = await p.evaluate((u) => document.querySelector(".scn-host").__space().some((x) => x.id === u), unit);
  await p.evaluate(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(800);
  const gUndo = await geom();
  // X on the proxy selected: asked, Esc keeps it
  await templuEpoch(p, "XX");
  await p.waitForFunction((u) => document.querySelector(".scn-host").__space().some((x) => x.id === u && x.as === "mesh"), unit, { timeout: 30000 }).catch(() => {});
  const back = await p.evaluate((u) => document.querySelector(".scn-host").__space().find((x) => x.id === u)?.as ?? null, unit);
  // the camera may have moved with the redraw: the proxy's point again
  const f2 = await p.evaluate((u) => { const h = document.querySelector(".scn-host"); const c = h.querySelector("canvas").getBoundingClientRect();
    for (let gy = 0.1; gy <= 0.9; gy += 0.02) for (let gx = 0.1; gx <= 0.9; gx += 0.015) { const x = c.x + c.width * gx, y = c.y + c.height * gy;
      if (document.elementFromPoint(x, y)?.tagName !== "CANVAS") continue; const hit = h.__spaceHit(x, y); if (hit?.kind === "proxy" && hit.id === u) return { x, y }; }
    return null; }, unit) ?? f.proxy;
  // a click elsewhere first: again on the same spot would take the next one behind (Blender's cycle)
  const corner = await p.evaluate(() => { const c = document.querySelector(".scn-host canvas").getBoundingClientRect(); return { x: c.x + c.width - 30, y: c.y + c.height - 30 }; });
  await p.mouse.click(corner.x, corner.y); await p.waitForTimeout(200);
  await p.mouse.click(f2.x, f2.y); await p.waitForTimeout(500);
  const beforeX = await p.evaluate(() => ({ sel: window.__EM_DRAG__.selected(), active: document.activeElement?.className ?? document.activeElement?.tagName }));
  await p.keyboard.press("x"); await p.waitForTimeout(300);
  const askX = await p.evaluate(() => !!document.querySelector(".ask-modal"));
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const gX = await geom();
  await ctx.close();
  const conds = {
    found: !!unit && g0.shapes >= 1,
    inspector: /Elimina il proxy/.test(insp ?? "") && /proxies\//.test(insp ?? "") && /EM Tools/.test(insp ?? ""),
    asked: new RegExp(`Elimina il proxy di ${g0.name}\\? L'unità resta\\.`).test(ask ?? "") && /Viene da EM Tools/.test(ask ?? "") && /resta in proxies/.test(ask ?? ""),
    cancelKeeps: gCancel.shapes === g0.shapes,
    menu: menu.includes("delete-proxy"),
    deleted: gDel.unit && gDel.shapes === 0 && !drawnAfter && fileStays,
    undone: gUndo.shapes === g0.shapes,
    xAsks: askX && gX.shapes === g0.shapes,
    errors: !errors.length,
  };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, unit, g0, insp, ask, gCancel, menu, gDel, file, fileStays, gUndo, askX, gX, beforeX, back, errors } };
});
test("S3.oneLine", "Spazio · MICRO-PROVA-DEV47 p.6 · le intestazioni delle finestre (la riga EPOCA / Modelli / Proxy / ⤢ dello Spazio e le barre di ogni finestra: Tabular, Graph, Inspector) restano su UNA riga a 1100, 800 e 500 px con due finestre 3D affiancate; ciò che non entra scorre di lato con la rotella (e due dita), una sfumatura al bordo dice che c'è altro; il menu del tipo di finestra si apre ancora intero", async () => {
  const out = {};
  for (const w of [1100, 800, 500]) {
    const { p, ctx, errors } = await open({ doc: "spazio", w, h: 800 });
    // at 500 px the workspace's tab is past the top bar's edge: clicked from the page
    await p.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="space"]').click()); await p.waitForTimeout(700);
    await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
    const sceneWin = await winOf(p, "scene");
    await p.evaluate((id) => window.__EM_DRAG__.splitDoc(id), sceneWin); await p.waitForTimeout(1500);
    const bars = await p.evaluate(() => [...document.querySelectorAll(".tile-area .tile-bar, .tile-area .scn-bar")].filter((b) => b.getBoundingClientRect().width > 0).map((b) => {
      const kids = [...b.children].filter((c) => c.getBoundingClientRect().width > 0);
      const ys = kids.map((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2; }).sort((a, c) => a - c);
      let lines = 0, last = -1e9; for (const y of ys) { if (y - last > 10) lines++; last = y; }
      return { cls: b.className, win: b.closest(".tile-area")?.dataset.win, h: Math.round(b.getBoundingClientRect().height), lines, over: b.scrollWidth > b.clientWidth + 1, fadeR: b.classList.contains("ol-right") };
    }));
    const r = { bars, errors: errors.length };
    if (w === 1100) {
      // the wheel over a Space bar that does not fit: it moves sideways, and the left fade comes
      const wheel = await p.evaluate(() => { const b = [...document.querySelectorAll(".scn-bar.one-line")].find((x) => x.scrollWidth > x.clientWidth + 1); if (!b) return null;
        const r0 = b.getBoundingClientRect(); b.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, deltaMode: 0, clientX: r0.x + 20, clientY: r0.y + 10, bubbles: true, cancelable: true }));
        return { left: b.scrollLeft, fadeL: b.classList.contains("ol-left") }; });
      await p.waitForTimeout(200);
      const fadeL = await p.evaluate(() => [...document.querySelectorAll(".scn-bar.one-line")].some((b) => b.classList.contains("ol-left")));
      await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s3-intestazione-stretta.png` }).catch(() => {});
      // the type menu of a header that scrolls: whole, over everything
      await p.evaluate(() => { const b = [...document.querySelectorAll(".tile-bar.one-line")].find((x) => x.scrollWidth > x.clientWidth + 1) ?? document.querySelector(".tile-bar.one-line"); b.querySelector(".win-type-toggle")?.click(); });
      await p.waitForTimeout(300);
      const menu = await p.evaluate(() => { const m = [...document.querySelectorAll(".win-header .dd-menu")].find((x) => !x.classList.contains("hidden")); if (!m) return null;
        const r = m.getBoundingClientRect(); const at = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(20, r.height / 2));
        return { w: Math.round(r.width), h: Math.round(r.height), own: !!at && m.contains(at) }; });
      Object.assign(r, { wheel, fadeL, menu });
    }
    out[w] = r;
    await ctx.close();
  }
  const ok = (r) => r.bars.length >= 4 && r.bars.every((b) => b.lines <= 1 && b.h <= 46) && !r.errors;
  const conds = { w1100: ok(out[1100]), w800: ok(out[800]), w500: ok(out[500]),
    fadeRight: [1100, 800, 500].every((w) => out[w].bars.filter((b) => b.over).every((b) => b.fadeR)) && out[800].bars.some((b) => b.over),
    wheel: (out[1100].wheel?.left ?? 0) > 0 && out[1100].fadeL, menu: !!out[1100].menu?.own && out[1100].menu.h > 40 };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, out } };
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
// MICRO-VIEWER-UNICO · the windows a request lands in are VIEWERS: the
// document each shows (the pinned one, else the selection's), whether it is the
// service one, its pin, what it reads
const docWins = (p) => p.evaluate(() => window.__EM_DRAG__.wins().filter((w) => w.type === "viewer").map((w) => {
  const area = document.querySelector(`.tile-area[data-win="${w.id}"]`);
  const v = window.__EM_DRAG__.viewerState(w.id);
  return { id: w.id, doc: v?.target ? (v.target.kind === "document" ? v.target.id : v.target.docId) : null,
    role: w.state["current.viewer.role"] ?? null, service: w.state["current.viewer.role"] === "service",
    keep: !!area?.querySelector("[data-vw-keep]"), kept: v?.kept ?? null,
    medium: area?.querySelector(".vw-scene") ? "3d" : area?.querySelector(".rd-img") ? "image"
      : area?.querySelector(".rd-text, .rd-passage, .vw-pdf") ? "text" : null };
}));
// MICRO-VIEWER-UNICO · the service window is a Viewer, and «Tieni» is its pin:
// a Viewer pinned on a node is never taken by a request
test("S4.keep", "Spazio · un RM (3D) dalla Tabella apre il Viewer di servizio; 📌 lo tiene sul documento; una foto dall'ispettore va in un NUOVO Viewer di servizio e il 3D resta", async () => {
  const { p, ctx, errors } = await open({ doc: "spazio", ws: "space" });
  await p.waitForSelector('[data-open-doc="D2"]', { timeout: 15000 });
  const before = await docWins(p);
  await p.click('[data-open-doc="D2"]');
  await p.waitForTimeout(1500);
  const opened = await docWins(p);
  await p.screenshot({ path: `${process.env.SHOTS ?? "."}/s4-servizio-prima-di-tieni.png` }).catch(() => {});
  const o = opened.find((w) => w.doc === "D2");
  if (o) await p.locator(`.tile-area[data-win="${o.id}"] [data-vw-keep]`).first().click().catch(() => {});
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
  const k = kept.find((w) => w.id === o?.id);
  const a3d = after.find((w) => w.id === o?.id);
  const photo = after.find((w) => w.doc === "D3");
  return { pass: !before.length && opened.length === 1 && o?.service && o?.keep && k?.kept === "D2"
      && a3d?.doc === "D2" && after.length === 2 && photo && photo.id !== o.id && photo.service && !errors.length,
    detail: { before, opened, kept, after, errors } };
});
// MICRO-VIEWER-UNICO · Fonti's Viewer takes the request; two Viewers hold two
// documents when one is pinned (the Doc's own picker went with the Doc)
test("S4.sources", "Fonti · la richiesta usa il Viewer dello spazio (nessuna finestra nuova); due Viewer tengono due documenti, uno tenuto col 📌", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", ws: "provenance" });
  const w0 = await docWins(p);
  await pick(p, "USM101");
  await p.locator('[data-add-reading="P_H"]').first().click();
  await p.waitForTimeout(300);
  await p.locator(".addm-item", { hasText: "D.3 ·" }).first().click();
  await p.waitForTimeout(1200);
  const w1 = await docWins(p);
  // a second Viewer, opened by hand (split of the first), pinned on another document
  const second = await p.evaluate((id) => window.__EM_DRAG__.splitDoc?.(id) ?? null, w1[0]?.id);
  await p.waitForTimeout(600);
  await pick(p, "D1");
  await p.waitForTimeout(400);
  if (second) await p.locator(`.tile-area[data-win="${second}"] [data-vw-keep]`).first().click().catch(() => {});
  await p.waitForTimeout(300);
  await pick(p, "D3");
  await p.waitForTimeout(600);
  const w2 = await docWins(p);
  await ctx.close();
  const main = w2.find((w) => w.id === w1[0]?.id), other = w2.find((w) => w.id === second);
  return { pass: w0.length === 1 && w1.length === 1 && w1[0].doc === "D3" && !w1[0].service
      && main?.doc === "D3" && other?.doc === "D1" && other?.kept === "D1" && !errors.length,
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
      // MICRO-PANNELLI-OVERLAY-TABULAR p.2 · the count is in the window's head row now
      const f = [...document.querySelectorAll('[data-surface-type="table"] .fcount')].map((x) => x.textContent)[0] ?? null;
      return f ? Number((/\d+/.exec(f) ?? ["-1"])[0]) : null;
    });
  }
  await ctx.close();
  const groups = [...new Set(items.map((i) => i.group))];
  const sheets = items.filter((i) => i.group === "Schede").map((i) => i.label);
  const views = items.filter((i) => i.group === "Viste calcolate").map((i) => i.label);
  const counted = items.every((i) => i.count != null && i.note && Number(i.count) === shown[i.sheet]);
  return { pass: groups.join() === "Schede,Viste calcolate" && ["Unità", "Epoche", "Documenti", "Claims", "Autori"].every((x) => sheets.includes(x))
      // MICRO-VIEWER-UNICO p.6 · and the three new ones: the resources, the extractors, the combiners
      && views.join() === "Datazioni,Avvisi,Modelli e proxy,Risorse,Interpretazioni,Combinatori" && !items.some((i) => i.label === "Cronologia") && counted && !errors.length,
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
  // MICRO-VIEWER-UNICO · the menu «Documento» is the Viewer's
  const docWin = `.tile-area[data-win="${await winOf(p, "viewer")}"]`;
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
  // G5 (MICRO grafo reattivo) · the RIGHT button held pans now: a right CLICK
  // (still, or under 4 px) opens the menu and moves nothing; a right DRAG moves
  // the camera by exactly the drag (the lane label follows: +4 px down for a
  // 6,4 drag) and nothing moves after it, Esc and a free movement included
  const yOf = (d) => Number(/@\d+,(\d+)/.exec(d)?.[1] ?? NaN);
  let expectY = yOf(base);
  for (const fy of [0.15, 0.5, 0.85]) {
    const x = cvr.x + 60, y = cvr.y + cvr.h * fy;
    await p.mouse.move(x, y);
    await p.mouse.click(x, y, { button: "right" });
    await p.waitForTimeout(300);
    const c = await drawn();
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
    if (yOf(c) !== expectY || yOf(a) !== expectY || yOf(b) !== expectY + 4) moved.push({ fy, c, a, b, expectY });
    expectY = yOf(b);
  }
  await ctx.close();
  return { pass: !base.startsWith("none") && !moved.length && items.some((t) => /cronologia/i.test(t)), detail: { base, moved, items } };
});

// ── MICRO-3DTILES-LOD · parte 1 · i 3D Tiles nel visualizzatore ──────────────
// Since MICRO-VIEWER-UNICO p.5 (E.D., 20 Oct: «The Doc window is gone»)
// `openDoc` opens the Viewer and the document's model is the Viewer's scene,
// the Space's engine: its tileset has its strip (`.scn-strips .v3d-strip`, the
// bar «Manuale / Automatico / Più dettaglio qui / Meno dettaglio» and its
// line), its LOD selector and its gate. The cases below read that scene
// (MICRO-SUITE-VERDE, 24 Oct: until then they looked for the Doc's reader,
// `.rd-3d-host`, that no window draws any more, and timed out).
/** open a document of `tiles.em.json` in the Viewer (the Fonti space), and wait
 *  for its scene; `fetched()` lists every file the page asked for under testdata/ or /fs/at/ */
async function openTilesDoc(docId, { doc = "tiles", mutate, at } = {}) {
  let d = fixture(doc);
  if (mutate) d = mutate(d);
  const o = await open({ doc: d, ws: "provenance" });
  // a tileset ON THE DISK belongs to a document on the disk: opened at `at`, its
  // locators are read beside it, through the bridge (a document from nowhere
  // has no folder, and its locators stay what they are — `spaceFileUrl`)
  if (at) {
    await o.p.evaluate(([x, path]) => window.__EM_DRAG__.openAt(x, path), [d, at]);
    await o.p.waitForTimeout(800);
  }
  const win = await o.p.evaluate((id) => window.__EM_DRAG__.openDoc(id), docId);
  await o.p.waitForFunction((w) => {
    const h = document.querySelector(`.tile-area[data-win="${w}"] .vw-scene`);
    return h && h.dataset.ready === "1" && (h.__space?.() ?? []).some((i) => i.as && i.as !== "pending");
  }, win, { timeout: 20000 });
  // what the page fetched under testdata/ or /fs/at/: the Resource Timing entries
  // (Playwright's request events do not reach this headless shell's fetches)
  // (`bodies`: only the requests that brought a body — a HEAD brings none)
  return { ...o, win, fetched: (bodies = false) => o.p.evaluate((b) => performance.getEntriesByType("resource")
    .filter((e) => !b || e.encodedBodySize > 0).map((e) => e.name)
    .filter((u) => /testdata\/|\/fs\/at\//.test(u)).map((u) => decodeURIComponent(u.replace(/^.*?(testdata\/|\/fs\/at\/)/, ""))), bodies) };
}
const tilesState = (p, win) => p.evaluate((w) => {
  const h = document.querySelector(`.tile-area[data-win="${w}"] .vw-scene`);
  const t = h?.__spaceTiles?.()?.[0];
  const rm = (h?.__space?.() ?? []).find((i) => i.kind === "rm");
  const lod = /_LOD(\d+)\.[a-z0-9]+$/i.exec(rm?.url ?? "")?.[1] ?? null;
  return { tileset: !!t, model: rm?.url ?? null, as: rm?.as ?? null, lod,
    files: t?.files ?? null, status: t?.status ?? null, box: t?.box ?? null, points: t?.points ?? null,
    line: h?.querySelector(".tl-status")?.textContent ?? null,
    gate: [...(h?.querySelectorAll(".scn-label, .v3d-strip [data-gate]") ?? [])].map((e) => e.textContent).join(" · ") || null,
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
  const at = await p.evaluate(([w, u]) => document.querySelector(`.tile-area[data-win="${w}"] .vw-scene`).__spaceTileScreenOf(u), [win, uri]);
  const armed = await p.evaluate((w) => document.querySelector(`.tile-area[data-win="${w}"] .tl-more`)?.getAttribute("aria-pressed"), win);
  if (armed !== "true") await p.click(`.tile-area[data-win="${win}"] .tl-more`);
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
  await p.click(`.tile-area[data-win="${win}"] .tl-less`);
  const s3 = await tilesSettle(p, win, (s) => same(s.status?.level, [0, 1]) || same(s.status?.level, [1, 1]));
  await p.click(`.tile-area[data-win="${win}"] .tl-less`);
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
  await p.click(`.tile-area[data-win="${win}"] .tl-seg [data-mode="auto"]`);
  const a = await tilesSettle(p, win, (s) => (s.files ?? []).includes("tiles/c0_0.glb"));
  await p.click(`.tile-area[data-win="${win}"] .tl-seg [data-mode="manual"]`);
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
  const { p, ctx, errors, win, fetched } = await openTilesDoc("D1", { at: `${root}/tiles.em.json`, mutate: (d) => {
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
  await p.selectOption(`.tile-area[data-win="${win}"] .lod-pick`, "1");
  await tilesSettle(p, win, (s) => /muro_LOD1\.glb$/.test(s.model ?? "") && s.as === "mesh");
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
  await p.click(`.tile-area[data-win="${win}"] [data-gate="tileset"]`);
  const t = await tilesSettle(p, win, (s) => (s.files ?? []).length >= 1);
  await ctx.close();
  // the Viewer's scene says it on the model's label (the Space's words, T1.space)
  return { pass: /oltre la soglia \(858\.3 MB > 200\.0 MB\)/.test(g.gate ?? "") && /Apri il tileset/.test(g.gate ?? "")
      && /Caricalo comunque/.test(g.gate ?? "") && !before.length
      && t.tileset && same(t.files, ["punti.pnts"]) && !errors.length,
    detail: { gate: g.gate, before, after: t.files, errors } };
});
// MICRO-VIEWER-UNICO · the Doc's 3D reader went: the document's model is the
// Viewer's scene (the Space's engine), and its gate is the Space's
test("T2.gateLoad", "Soglia · nel Viewer «Caricalo comunque» carica il glb oltre la soglia; sotto la soglia (Preferenze alzate) si apre da solo", async () => {
  const gateIn = async (o) => {
    const win = await o.p.evaluate(() => window.__EM_DRAG__.openDoc("D3"));
    await o.p.waitForFunction((w) => { const h = document.querySelector(`.tile-area[data-win="${w}"] .vw-scene`); return !!h && (!!h.querySelector('[data-gate="load"]')
      || (window.__EM_DRAG__.viewerState(w)?.scene?.events ?? []).some((e) => e.what === "drawn")); }, win, { timeout: 20000 });
    return win;
  };
  const a = await open({ doc: fixture("tiles"), ws: "provenance" });
  const w1 = await gateIn(a);
  const gated = await a.p.evaluate((w) => !!document.querySelector(`.tile-area[data-win="${w}"] .vw-scene [data-gate="load"]`), w1);
  await a.p.click(`.tile-area[data-win="${w1}"] .vw-scene [data-gate="load"]`).catch(() => {});
  await a.p.waitForFunction((w) => (window.__EM_DRAG__.viewerState(w)?.scene?.events ?? []).some((e) => e.what === "drawn"), w1, { timeout: 15000 }).catch(() => {});
  const loaded = (await a.p.evaluate((w) => window.__EM_DRAG__.viewerState(w)?.scene?.events ?? [], w1)).filter((e) => e.what === "drawn").map((e) => e.url);
  await a.ctx.close();
  const o = await open({ doc: fixture("tiles"), ws: "provenance", init: { "emstudio.settings": JSON.stringify({ viewer: { lodLimitMB: 2000 } }) } });
  const w2 = await gateIn(o);
  const high = await o.p.evaluate((w) => ({ gate: !!document.querySelector(`.tile-area[data-win="${w}"] .vw-scene [data-gate="load"]`),
    drawn: (window.__EM_DRAG__.viewerState(w)?.scene?.events ?? []).filter((e) => e.what === "drawn").map((e) => e.url) }), w2);
  await o.ctx.close();
  return { pass: gated && loaded.some((u) => /catena-muro\.gltf$/.test(u ?? "")) && !high.gate && high.drawn.some((u) => /catena-muro\.gltf$/.test(u ?? ""))
      && !a.errors.length && !o.errors.length, detail: { gated, loaded, high, errors: [...a.errors, ...o.errors] } };
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
  return { pass: head.includes("Prima epoca") /* MICRO-PANNELLI-OVERLAY-TABULAR p.3 · the heading in the interface language */ && !items.some((i) => i.sheet === "US" || /Vista US|US view/.test(i.label))
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
      && r.head.includes("Prima epoca") && r.label.includes("Unità") && !errors.length,
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
  // (a copy to look at, beside the shots: the folder is made here — it was
  // expected to exist, and the case failed where it did not)
  if (process.env.SHOTS) { mkdirSync(`${process.env.SHOTS}/../dbg`, { recursive: true }); writeFileSync(`${process.env.SHOTS}/../dbg/saved-declared.em.json`, saved); }
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
// Since MICRO-VIEWER-UNICO p.5 (E.D., 20 Oct) the document's model is drawn by
// the Viewer's scene, not by the Doc's reader: what was read on `.rd-3d-host`
// (its kind, meshes, textured meshes, the files resolved) is read on the
// scene (`__space`, `__spaceMeshesOf`) and on what the page fetched
// (MICRO-SUITE-VERDE, 24 Oct)
const modelHost = (p, win) => p.evaluate((w) => {
  const h = document.querySelector(`.tile-area[data-win="${w}"] .vw-scene`);
  if (!h) return null;
  const rm = (h.__space?.() ?? []).find((i) => i.kind === "rm");
  const m = rm ? h.__spaceMeshesOf(rm.id) : null;
  const fetched = performance.getEntriesByType("resource").map((e) => decodeURIComponent(e.name));
  return { ready: rm?.as === "mesh" ? "1" : null, as: rm?.as ?? null, model: rm?.url ?? null,
    kind: /\.obj(\?|$)/i.test(rm?.url ?? "") ? "obj" : rm?.url ? "gltf" : null,
    meshes: m?.meshes ?? 0, textured: m?.textured ?? 0, fetched,
    note: [...h.querySelectorAll(".scn-label, .scn-status, .vw-note")].map((e) => e.textContent).join(" · ") };
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
  // the paths from the has_file edges: the mtl and the texture asked of the bridge beside the obj
  const got = { mtl: (m.fetched ?? []).find((u) => /\/fs\/at\/.*LOD1\/OB_PODIO_LOD1\.mtl$/.test(u)) ?? null,
    tex: (m.fetched ?? []).find((u) => /\/fs\/at\/.*LOD1\/textures\/T_OB_PODIO_LOD1\.jpg$/.test(u)) ?? null };
  return { pass: m.ready === "1" && m.kind === "obj" && m.meshes > 0 && m.textured > 0 && !!got.mtl && !!got.tex
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
  // the Viewer's scene draws the model's place (a dashed contour) and its label
  // says where the model is: in the .blend, by object (it said «file solo
  // referenziato, non si può scaricare» until MICRO-SUITE-VERDE, 24 Oct)
  const { p, ctx, errors, win } = await openBaseDoc("D4");
  await p.waitForFunction((w) => (document.querySelector(`.tile-area[data-win="${w}"] .vw-scene`)?.__space?.() ?? [])
    .some((i) => i.id === "RM_BLEND" && i.as === "contour"), win, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(400);
  const labels = await p.evaluate((w) => [...document.querySelectorAll(`.tile-area[data-win="${w}"] .vw-scene .scn-label`)].map((l) => l.textContent), win);
  const note = labels.find((l) => /Blender/.test(l)) ?? null;
  await p.screenshot({ path: SHOT("r3-solo-in-blender") }).catch(() => {});
  await ctx.close();
  return { pass: note === "RM_BLEND: solo in Blender · TempluMare_2021.blend · OB_PRATO_LOD1" && !errors.length, detail: { labels, errors } };
});
test("R3.3tz", "visualizzatore · TempluMare_cesium.3tz si apre senza estrarlo e si raffina come la cartella, con lo stesso allineamento", async () => {
  const root = await rootPath();
  const run = async (url) => {
    const t0 = Date.now();
    const o = await openTilesDoc("D1", { at: `${root}/tiles.em.json`, mutate: (d) => {
      for (const n of d.graph.nodes) if (n.id === "RES_TS") n.data.url = url;
      return d;
    } });
    const first = await tilesSettle(o.p, o.win, (s) => (s.files ?? []).length >= 1, 30000);
    const tFirst = Date.now() - t0;
    // «Automatico»: the renderer refines by the error on screen — the same
    // camera for both, so the same tiles when it has settled (the hollow temple
    // leaves nothing under a click at the centre of the root tile)
    await o.p.click(`.tile-area[data-win="${o.win}"] .tl-seg [data-mode="auto"]`);
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
  // the form's fields, not its frame: they are drawn after it (read too early
  // under load, the field list was empty — MICRO-SUITE-VERDE)
  await p.waitForSelector('.stamp-compose [data-field="campaign"]', { timeout: 30000 }).catch(() => {});
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
  // MICRO-BADGE-PD-CRONOLOGIA · the year is the document's absolute_time_start
  // (its property, and the data copy beside it), no more data.year
  const r1 = await p.evaluate(() => ({ year: window.__EM_DRAG__.node("d02").data.absolute_time_start,
    prop: window.__EM_DRAG__.edgesOf("has_property").filter((e) => e.source === "d02").map((e) => window.__EM_DRAG__.node(e.target))
      .filter((n) => n?.name === "absolute_time_start").map((n) => n.description), focus: document.activeElement?.dataset?.docEpoch ?? null,
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
  // MICRO-PULIZIA p.7 · the date lives in its PROPERTY only: no copy in the data
  return { pass: r1.year === undefined && r1.prop.join() === "150" && /falls in Età romana/.test(r1.hint) && r2.ep === "ep1" && r2.sel[0] === "d02"
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

// MICRO-VIEWER-UNICO · Fonti's table is in rows: the document's card is the
// Inspector's «Scheda del documento», and «Mostra nella Matrix» is there
test("W04.showmatrix", "U4 · dalla scheda del documento (Inspector) «Mostra nella Matrix»: lo seleziona e la finestra del grafo passa alla Matrix", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", ws: "provenance" });
  await pick(p, "d02");
  const has = await p.locator('.insp-doc-card [data-show-matrix="d02"]').count();
  if (has) await p.click('.insp-doc-card [data-show-matrix="d02"]');
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
  // the folder as the bridge names it: /tmp is /private/tmp on macOS
  return { pass: onShelf === 1 && r.open && [dir, realpathSync(dir)].includes(r.folder) && r.dup && !errors.length, detail: { onShelf, r, errors } };
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

test("W16.identity", "U13–U16, rifatto su DOVE-CHI-MENU p.4 · una sola verità sull'identità («Chi sei» e Impostazioni dicono la stessa frase, verificata con testimone e data; l'etichetta nome · iD, lo stato e la legenda); senza nodo «nessun nodo» con il rimando a «Dove sei»; «Esci da questa identità»; Impostazioni ▸ Identità piena e in inglese", async () => {
  const ids = JSON.stringify({ current: "0000-0002-5065-7970", known: [{ orcid: "0000-0002-5065-7970", name: "Emanuel", surname: "Demetrescu",
    verified: true, verifiedAt: "2026-10-02T14:10:00Z", verifiedBy: "orcid.org", authMode: "orcid" }] });
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", init: { "emstudio.identities": ids }, hook: tauriHook() });
  await p.evaluate((b) => { window.__BRIDGE__ = b; }, BRIDGE);
  // MICRO-DOVE-CHI-MENU p.4 (E.D., 19 Oct, 64af313): the label's tooltip says
  // «Name · iD», the state in one line and the legend of the outlines; the
  // panel keeps the one sentence; the nodes are «Where you are»'s (here «no
  // node yet» and the way there), «This computer's identities…» opens Settings ▸
  // Identity filled from it
  const chip = await p.evaluate(() => document.getElementById("footer-identity").title);
  await p.click("#footer-identity");
  await p.waitForTimeout(1500);
  const panel = await p.evaluate(() => ({ state: document.querySelector(".idpanel .idp-state")?.textContent ?? "",
    text: document.querySelector(".idpanel")?.textContent ?? "",
    where: !!document.querySelector("[data-idp-where]"), out: !!document.querySelector("[data-idp-signout]") }));
  await p.screenshot({ path: SHOT("w16-chi-sei") }).catch(() => {});
  await p.click("[data-idp-manage]");
  await p.waitForTimeout(600);
  const set = await p.evaluate(() => ({ orcid: document.getElementById("set-orcid").value, name: document.getElementById("set-orcid-name").value,
    state: document.getElementById("set-orcid-state").textContent, h: document.querySelector("#settings-sect-identity h4").textContent }));
  await ctx.close();
  const sentence = "Verified: Emanuel Demetrescu (0000-0002-5065-7970), witnessed by orcid.org on";
  return { pass: chip.startsWith("Emanuel Demetrescu · 0000-0002-5065-7970\nVerified") && /dashed: declared/.test(chip)
      && panel.state.startsWith(sentence) && set.state.startsWith(sentence)
      && /no node yet/.test(panel.text) && panel.where && panel.out
      && set.orcid === "0000-0002-5065-7970" && set.name === "Emanuel" && set.h === "Identity (ORCID)" && !errors.length,
    detail: { chip, panel: { ...panel, text: panel.text.slice(0, 200) }, set, errors } };
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
  const at = benchFile("G3_FILE");
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
const TEMPLU_DIR = () => (process.env.TEMPLU ?? "").replace(/\/EM\/[^/]+$/, "");
const K_SETTINGS = () => ({ "emstudio.settings": JSON.stringify({ sync: { hubUrl: K_NODE, hubRoom: "cantiere-demo" } }) });
if (K_NODE) test("TK1.live", "T-K1 dal vivo · nodo del dev stack, utente dev in «cantiere-demo»: la voce di stato dice nodo, accesso e nome della stanza; spento il nodo (le richieste cadono), dice «nodo non raggiungibile» entro 30 s", async () => {
  const { p, ctx, errors } = await open({ doc: null, locale: "en", init: K_SETTINGS() });
  // MICRO-LA-BARRA · the line is zone 1's ONE phrase now; node and reach are
  // its tooltip (and the panel), read here as the person would by hovering
  const line = () => p.evaluate(() => `${window.__EM_DRAG__.statusLine()} | ${document.getElementById("mode-indicator").title}`);
  await p.waitForFunction(() => /node reachable/.test(document.getElementById("mode-indicator").title), null, { timeout: 15000 }).catch(() => {});
  const first = await line();
  await p.evaluate(([u, tok]) => window.__EM_DRAG__.joinRoom(u, "cantiere-demo", tok), [K_NODE, kToken("dev")]);
  await p.waitForFunction(() => /Cantiere · demo/.test(window.__EM_DRAG__.statusLine()), null, { timeout: 15000 }).catch(() => {});
  const inRoom = await line();
  await ctx.route(`${K_NODE}/**`, (r) => r.abort());
  const t0 = Date.now();
  await p.waitForFunction(() => /node not reachable/.test(document.getElementById("mode-indicator").title), null, { timeout: 30000 }).catch(() => {});
  const off = await line();
  const secs = Math.round((Date.now() - t0) / 1000);
  await ctx.close();
  return { pass: /em\.localhost:8443/.test(first) && /node reachable/.test(first)
      && /em\.localhost/.test(inRoom) && /^Room Cantiere · demo \(due container\) · em\.localhost \|/.test(inRoom) && !/not signed in/.test(inRoom)
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
  await p.click("#mode-indicator");   // MICRO-DOVE-CHI-MENU p.3 · «Mode» left the bar
  await p.click('#conn-pop .conn-mode[data-mode="sidecar"]');
  await p.waitForTimeout(1200);
  const waiting = await p.evaluate(() => window.__EM_DRAG__.statusLine());
  await p.waitForTimeout(3500);
  blender = true;
  await p.waitForFunction(() => document.body.classList.contains("sync-active"), null, { timeout: 9000 }).catch(() => {});
  const back = await p.evaluate(() => ({ line: window.__EM_DRAG__.statusLine(), active: document.body.classList.contains("sync-active") }));
  await p.click("#mode-indicator");   // MICRO-DOVE-CHI-MENU p.3 · «Mode» left the bar
  await p.click('#conn-pop .conn-mode[data-mode="standalone"]');
  await p.waitForTimeout(400);
  const off = await p.evaluate(() => window.__EM_DRAG__.statusLine());
  const log = await p.evaluate(() => window.__EM_DRAG__.log().map((l) => l.message));
  await ctx.close();
  return { pass: /^On this computer · waiting for Blender…$/.test(waiting) && back.active && opened >= 1 && !/Waiting/.test(back.line)
      && /^On this computer$/.test(off) && log.some((m) => /Blender is back/.test(m)) && !errors.length,
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
  await p.click("#mode-indicator");   // MICRO-DOVE-CHI-MENU p.3 · «Mode» left the bar
  await p.click('#conn-pop .conn-mode[data-mode="sidecar"]');
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

test("X1.blocked", "X1 · in Standalone, Inspector di un'unità: «Model the proxy in Blender» (sotto PROXY, MICRO-INSPECTOR-SEZIONI) è spento in modo visibile (tratteggiato, aria-disabled) e accanto c'è la frase che dice dove si collega, col rimando «Connections…» che apre il pannello delle connessioni (non collega da qui)", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en" });
  await pick(p, "USM101");
  const r = await p.evaluate(() => {
    const b = [...document.querySelectorAll(".insp-btn")].find((x) => /Model the proxy in Blender/.test(x.textContent));
    const why = document.querySelector(".insp-blocked");
    return b && { disabled: b.disabled, aria: b.getAttribute("aria-disabled"), cls: b.className,
      border: getComputedStyle(b).borderStyle, why: why?.querySelector("span")?.textContent ?? null,
      inProxy: !!b.closest(".insp-proxy") && !!why?.closest(".insp-proxy"),
      fix: why?.querySelector(".insp-blocked-fix")?.textContent ?? null,
      connectBtn: [...document.querySelectorAll("#inspector button")].some((x) => /Connect to Blender/.test(x.textContent)) };
  });
  await p.click(".insp-blocked-fix"); await p.waitForTimeout(300);
  const pop = await p.evaluate(() => { const e = document.getElementById("conn-pop"); return !!e && !e.classList.contains("hidden"); });
  await ctx.close();
  return { pass: !!r && r.disabled && r.aria === "true" && r.border === "dashed" && /Connections/.test(r.why ?? "")
      && r.inProxy && r.fix === "Connections…" && !r.connectBtn && pop && !errors.length, detail: { r, pop, errors } };
});

test("IS1.sections", "MICRO-INSPECTOR-SEZIONI · Inspector di USM101 (catena): ogni azione sotto la sua sezione — «Continuity» tiene solo «End in…»; «Compact»/«Dissolve» sotto «Paradata group» (che nomina PD_USM101 e i suoi membri); «Model the proxy in Blender» sotto «Proxy»; nei metadati propagativi inizio e fine con la provenienza di s3Dgraphy, e un clic sulla provenienza dell'epoca porta a Medioevo", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en" });
  await pick(p, "USM101");
  // the time rows wait for the bridge's answer
  await p.waitForFunction(() => document.querySelector('.insp-time [data-time="end"]') || document.querySelector('.insp-time [data-time="none"]:not(:empty)') && !/computing/.test(document.querySelector(".insp-time").textContent), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const root = document.querySelector("#inspector") ?? document.body;
    const heads = [...root.querySelectorAll("h3.insp-sect")];
    const sectOf = (b) => {
      let h = null;
      for (const x of heads) if (x.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) h = x;
      return h?.textContent.replace(/^[▾▸]/, "").trim() ?? null;
    };
    const btn = (re) => [...root.querySelectorAll("button")].find((x) => re.test(x.textContent));
    const under = (re) => { const b = btn(re); return b ? sectOf(b) : null; };
    const contHead = heads.find((h) => /Continuity$/.test(h.textContent.trim()));
    const contButtons = [...root.querySelectorAll("button")].filter((b) => !b.closest("h3") && sectOf(b) === "Continuity").map((b) => b.textContent.trim());
    const pg = document.querySelector(".insp-pdgroup-state")?.textContent ?? null;
    const time = [...document.querySelectorAll(".insp-time .insp-prop-row")].map((x) => ({ side: x.dataset.time, rule: x.dataset.rule,
      value: x.querySelector(".insp-prop-value")?.textContent, from: x.querySelector(".insp-prop-source")?.textContent, go: x.querySelector("[data-go]")?.dataset.go ?? null }));
    return { cont: !!contHead, contButtons, dissolve: under(/^Dissolve the group$/), model: under(/Model the proxy in Blender/),
      pg, time, timeSect: (() => { const b = document.querySelector(".insp-time"); return b ? sectOf(b) : null; })() };
  });
  // a unit whose continuity is offered: its section holds that alone
  await pick(p, "US102");
  const cont2 = await p.evaluate(() => {
    const root = document.querySelector("#inspector") ?? document.body;
    const heads = [...root.querySelectorAll("h3.insp-sect")];
    const i = heads.findIndex((h) => /Continuity$/.test(h.textContent.trim()));
    if (i < 0) return null;
    const next = heads[i + 1] ?? null;
    return [...root.querySelectorAll("button")].filter((b) => !b.closest("h3") && (heads[i].compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      && (!next || (b.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING))).map((b) => b.textContent.trim());
  });
  await pick(p, "USM101"); await p.waitForTimeout(300);
  const endRow = r.time.find((x) => x.side === "end");
  let jumped = null;
  if (endRow?.go) {
    await p.click('.insp-time [data-time="end"] [data-go]'); await p.waitForTimeout(400);
    jumped = await p.evaluate(() => window.__EM_DRAG__.nodeName?.(window.__EM_DRAG__.selected?.()?.[0] ?? "") ?? document.querySelector("#inspector .insp-name, #inspector input")?.value ?? null);
  }
  await ctx.close();
  // «Continuity» holds only the unit's life in time
  return { pass: r.cont && r.contButtons.length >= 1 && r.contButtons.every((x) => /End in|Survives until/.test(x))
      && !!cont2 && cont2.length >= 1 && cont2.every((x) => /End in|Survives until/.test(x))
      && r.dissolve === "Paradata group" && r.model === "Proxy" && /PD_USM101/.test(r.pg ?? "") && /member/.test(r.pg ?? "")
      && /propagative/i.test(r.timeSect ?? "") && endRow?.rule === "epoch" && /Medioevo/.test(endRow?.from ?? "") && endRow?.value === "1300"
      && jumped === "Medioevo" && !errors.length, detail: { r, cont2, jumped, errors } };
});

test("IS2.blender", "MICRO-INSPECTOR-SEZIONI p.2 · «Model the proxy in Blender» nei suoi stati, con un Blender simulato (EM Tools risponde come `commands.create_proxy_for_unit`): Standalone → spento, «Not connected…»; Sidecar senza Blender → spento, «Waiting for Blender…»; Blender senza consenso → spento, «does not accept commands»; con consenso → acceso, il clic manda il comando e il delta (proprietà geometry) entra nel grafo con un annulla", async () => {
  const port = 8897;
  let blender = false, consent = false, sock = null;
  const commands = [];
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en",
    init: { "emstudio.settings": JSON.stringify({ sync: { protocol: "ws", host: "localhost", port } }) },
    wsRoute: { pattern: new RegExp(`localhost:${port}`), handler: (ws) => {
      if (!blender) { ws.close(); return; }
      sock = ws;
      const host = () => ({ tool: "Blender", accepts_commands: consent });
      ws.onMessage((m) => {
        const msg = JSON.parse(String(m));
        if (msg.type === "request_snapshot") ws.send(JSON.stringify({ v: 2, type: "snapshot_unavailable", source: "blender", payload: { reason: "no_graph", host: host() } }));
        if (msg.type === "command") {
          commands.push(msg.payload);
          ws.send(JSON.stringify({ v: 2, type: "command_result", source: "blender", payload: { cmd_id: msg.payload.cmd_id, ok: true,
            delta: { nodes: [{ id: "PX_geo", node_type: "property", name: "geometry", data: {} }],
                     edges: [{ id: "PX_e", edge_type: "has_property", source: msg.payload.target, target: "PX_geo" }] },
            info: { proxy_object: "USM101", reused_object: false } } }));
        }
      });
      ws.send(JSON.stringify({ v: 2, type: "host_info", source: "blender", payload: host() }));
    } } });
  // read as drawn, WITHOUT picking the unit again: the Inspector follows the
  // connection by itself
  const state = async () => {
    await p.waitForTimeout(300);
    return p.evaluate(() => {
      const b = document.querySelector('.insp-proxy [data-cmd="create_proxy_for_unit"]');
      return b && { disabled: b.disabled, why: document.querySelector(".insp-proxy .insp-blocked span")?.textContent ?? null,
        fix: document.querySelector(".insp-proxy .insp-blocked-fix")?.textContent ?? null, title: b.title };
    });
  };
  await pick(p, "USM101");
  const standalone = await state();
  await p.click("#mode-indicator");
  await p.click('#conn-pop .conn-mode[data-mode="sidecar"]');
  await p.waitForTimeout(1500);
  const waiting = await state();
  blender = true;
  await p.waitForFunction(() => document.body.classList.contains("sync-active"), null, { timeout: 9000 }).catch(() => {});
  await p.waitForTimeout(500);
  const noConsent = await state();
  consent = true;
  sock?.send(JSON.stringify({ v: 2, type: "host_info", source: "blender", payload: { tool: "Blender", accepts_commands: true } }));
  await p.waitForTimeout(400);
  const ready = await state();
  const graphs = () => p.evaluate(() => { const d = JSON.parse(window.__EM_DRAG__.docJson());
    const gs = d.graphs ? Object.entries(d.graphs).filter(([k]) => k !== "shelf").map(([, g]) => g) : [d.graph];
    return { nodes: gs.reduce((a, g) => a + g.nodes.length, 0), px: gs.some((g) => g.edges.some((e) => e.id === "PX_e")) }; });
  const g0 = await graphs(), n0 = g0.nodes;
  if (ready && !ready.disabled) await p.click('.insp-proxy [data-cmd="create_proxy_for_unit"]');
  await p.waitForTimeout(800);
  const g1 = await graphs(), n1 = g1.nodes, has = g1.px;
  await p.evaluate(() => window.__EM_DRAG__.undo?.());
  await p.waitForTimeout(300);
  const undone = !(await graphs()).px;
  await ctx.close();
  return { pass: standalone?.disabled && /Not connected to Blender/.test(standalone.why ?? "") && standalone.fix === "Connections…"
      && waiting?.disabled && /Waiting for Blender/.test(waiting.why ?? "")
      && noConsent?.disabled && /does not accept commands/.test(noConsent.why ?? "")
      && ready && !ready.disabled && /3D cursor/.test(ready.title) && commands.length === 1 && commands[0].verb === "create_proxy_for_unit"
      && n1 === n0 + 1 && has && undone && !errors.length,
    detail: { standalone, waiting, noConsent, ready, commands, n0, n1, has, undone, errors } };
});

const TEMPIO = benchFile("TEMPIO_FILE");
test("TI3.ids", "T-I3 · Tempio (copia), Inspector di USM01b: con «Show node UUIDs» spento nessun graph_id né original_id, la grafica yEd dietro «Technical details» chiuso, niente label né stratigraphic_kind doppi; acceso, gli id ci sono (dentro «Technical details»)", async () => {
  if (!existsSync(TEMPIO)) return { pass: false, detail: { missing: TEMPIO } };
  const run = async (showIds) => {
    const { p, ctx, errors } = await open({ doc: null, locale: "en",
      init: { "emstudio.settings": JSON.stringify({ developer: { showNodeIds: showIds } }) } });
    await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
    await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [JSON.parse(readFileSync(TEMPIO, "utf8")), TEMPIO]);
    await p.waitForTimeout(3000);
    await pick(p, "698e2c22-2e87-4773-97d4-c3107fc63fe9");
    const r = await p.evaluate(() => {
      const root = document.querySelector(".insp-data")?.closest("#inspector, .insp-root, [data-surface], .tile-area") ?? document;
      const keys = (sel) => [...root.querySelectorAll(sel)].map((d) => d.textContent);
      // MICRO-PULIZIA p.6 · the technical details are inside «Data», under a
      // small heading — one triangle for the whole of the data, not a second
      const tech = root.querySelector(".insp-tech");
      return { main: keys(":scope .insp-data:not(.insp-tech .insp-data) dt"), tech: tech ? [...tech.querySelectorAll("dt")].map((d) => d.textContent) : [],
        open: tech ? !!tech.closest(".insp-sect-body") && tech.querySelectorAll("details").length === 0 : null, text: root.textContent };
    });
    await ctx.close();
    return { ...r, errors };
  };
  const off = await run(false), on = await run(true);
  const noIds = (x) => !x.main.includes("graph_id") && !x.main.includes("original_id") && !x.tech.includes("graph_id") && !x.tech.includes("original_id");
  return { pass: noIds(off) && off.open === true && ["shape", "y_pos", "fill_color", "border_style", "symbol"].every((k) => off.tech.includes(k))
      && !off.main.includes("label") && !off.main.includes("stratigraphic_kind")
      && on.tech.includes("graph_id") && on.tech.includes("original_id") && !on.main.includes("graph_id") && !off.errors.length && !on.errors.length,
    detail: { off: { main: off.main, tech: off.tech, open: off.open }, on: { main: on.main, tech: on.tech } } };
});

test("TT1.undated", "T-T1 · Tempio (copia, nessuna epoca con date): «Check the chronology…» dice «No epoch has dates: nothing to check» col gesto «Write the epochs' dates…», mai «No overlap»", async () => {
  if (!existsSync(TEMPIO)) return { pass: false, detail: { missing: TEMPIO } };
  const { p, ctx, errors } = await open({ doc: null, locale: "en" });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [JSON.parse(readFileSync(TEMPIO, "utf8")), TEMPIO]);
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
  // MICRO-PULIZIA p.6 · one row of icons: an unavailable tool is aria-disabled
  // (still reached by Tab), and its why is the tooltip
  const insp = await p.evaluate(() => [...document.querySelectorAll(".insp-openwith [data-openwith]")].map((b) => ({
    key: b.dataset.openwith, off: b.getAttribute("aria-disabled") === "true" && !b.disabled, why: (b.title.split(" — ")[1] ?? "") })));
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

test("I5.click", "I5 · Tempio (copia), Matrix: un clic sinistro sul riquadro di un'unità la seleziona anche se il dito si sposta di qualche pixel tra pressione e rilascio (trackpad)", async () => {
  if (!existsSync(TEMPIO)) return { pass: false, detail: { missing: TEMPIO } };
  const { p, ctx, errors } = await open({ doc: null, locale: "en" });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [JSON.parse(readFileSync(TEMPIO, "utf8")), TEMPIO]);
  await p.waitForTimeout(3500);
  const win = await winOf(p, "graph");
  const ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const names = await p.evaluate(() => Object.fromEntries(JSON.parse(window.__EM_DRAG__.graphJson()).nodes.map((n) => [n.id, [n.name, n.node_type]])));
  const inside = (b) => b.x > ws.rect.x + 5 && b.y > ws.rect.y + 5 && b.x + b.w < ws.rect.x + ws.rect.w - 5
    && b.y + b.h < ws.rect.y + ws.rect.h - 5 && b.w > 20;
  const units = ws.boxes.filter((b) => inside(b) && /^US/.test(names[b.id]?.[1] ?? "") ).slice(0, 6);
  const out = [];
  for (const b of units) {
    await p.evaluate(() => window.__EM_DRAG__.select(null));
    await p.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
    await p.waitForTimeout(80);
    // a trackpad click: the finger moves a few pixels between press and release
    const jitter = Number(process.env.I5_JITTER ?? 4);
    await p.mouse.down();
    await p.mouse.move(b.x + b.w / 2 + jitter, b.y + b.h / 2 + 1, { steps: 2 });
    await p.mouse.up();
    await p.waitForTimeout(250);
    const sel = await p.evaluate(() => window.__EM_DRAG__.selected());
    out.push({ name: names[b.id]?.[0], ok: sel.includes(b.id), sel: sel.map((x) => names[x]?.[0] ?? x), box: [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)] });
  }
  await ctx.close();
  return { pass: out.length >= 3 && out.every((x) => x.ok) && !errors.length, detail: { out, errors } };
});

/** the text of every Settings tab, tab by tab */
async function settingsText(p) {
  await p.keyboard.press("Meta+,");
  await p.waitForSelector("#settings-modal:not(.hidden)", { timeout: 5000 });
  const tabs = await p.evaluate(() => [...document.querySelectorAll("#settings-tabs [role=tab], #settings-tabs button")].map((b) => b.dataset.tab ?? b.textContent));
  const out = {};
  for (let i = 0; i < tabs.length; i++) {
    await p.evaluate((k) => [...document.querySelectorAll("#settings-tabs [role=tab], #settings-tabs button")][k].click(), i);
    await p.waitForTimeout(150);
    out[tabs[i]] = await p.evaluate(() => {
      const body = document.querySelector("#settings-modal .modal-body");
      const shown = [...body.querySelectorAll(".settings-sect")].filter((x) => x.offsetParent !== null);
      return shown.map((x) => x.innerText + " " + [...x.querySelectorAll("input[placeholder]")].map((i) => i.placeholder).join(" ")).join("\n");
    });
  }
  return out;
}
const IT_WORDS = /\b(nessun[ao]?|finestra|perché|della|delle|degli|il tema|tema|chiaro|scuro|salva|incolla|modello|rimuovi|segue il sistema|consigliato|sconsigliato|dove vive|montata|scena:|server ATON|fornitore|chiave|accesso|indirizzo|stanza|per esempio)\b/i;
const EN_WORDS = /\b(the|show|save|paste|remove|recommended|follows the system|where the 3D|for example|address:|provider|key|room|theme|light|dark)\b/i;
test("TZ2.onelang", "T-Z2 · Settings aperto con ⌘, : interfaccia in English, nessuna stringa italiana nelle schede; in italiano, nessuna inglese nelle schede General, Viewers, Advanced", async () => {
  const en = await (async () => { const { p, ctx } = await open({ doc: "catena", locale: "en" }); const r = await settingsText(p); await ctx.close(); return r; })();
  const it = await (async () => { const { p, ctx } = await open({ doc: "catena", locale: "it" }); const r = await settingsText(p); await ctx.close(); return r; })();
  const hits = (texts, re) => Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, v.split("\n").filter((l) => re.test(l)).slice(0, 6)]).filter(([, v]) => v.length));
  const enIt = hits(en, IT_WORDS);
  const itEn = hits(Object.fromEntries(Object.entries(it).filter(([k]) => /general|viewers|advanced|generale|visual|avanzate/i.test(k))), EN_WORDS);
  return { pass: Object.keys(en).length >= 5 && !Object.keys(enIt).length && !Object.keys(itEn).length, detail: { tabs: Object.keys(en), enIt, itEn } };
});

test("TI2.contrast", "T-I2 · Tempio (copia), Inspector di USM01b e di USM05: ogni etichetta di relazione ha contrasto ≥ 4.5:1 sul suo fondo, nel tema scuro e nel chiaro", async () => {
  if (!existsSync(TEMPIO)) return { pass: false, detail: { missing: TEMPIO } };
  const run = async (theme) => {
    const { p, ctx, errors } = await open({ doc: null, locale: "en", init: { "emstudio.theme": theme } });
    await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
    await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [JSON.parse(readFileSync(TEMPIO, "utf8")), TEMPIO]);
    await p.waitForTimeout(3000);
    const ids = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.filter((n) => ["USM01b", "USM05"].includes(n.name)).map((n) => n.id));
    const rows = [];
    for (const id of ids) {
      await pick(p, id);
      rows.push(...await p.evaluate(() => {
        const rgb = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
        const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
          .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c; } return [255, 255, 255]; };
        return [...document.querySelectorAll(".insp-group-title")].map((el) => {
          const fg = rgb(getComputedStyle(el).color), bg = bgOf(el);
          const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
          return { label: el.textContent, ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100 };
        });
      }));
    }
    await ctx.close();
    return { rows, errors };
  };
  const dark = await run("dark"), light = await run("light");
  const low = [...dark.rows.map((r) => ({ ...r, theme: "dark" })), ...light.rows.map((r) => ({ ...r, theme: "light" }))].filter((r) => r.ratio < 4.5);
  return { pass: dark.rows.length > 2 && light.rows.length > 2 && !low.length && !dark.errors.length && !light.errors.length,
    detail: { low, dark: dark.rows.slice(0, 8), light: light.rows.slice(0, 4) } };
});

test("TW1.order", "T-W1/W2/W3 · Tempio (copia), Warnings: la prima riga è l'avviso (▲), poi gli hint; le righe con la stessa frase sotto la stessa regola stanno in un gruppo («n × …») che si apre; RULE ha spazio prima di NODE", async () => {
  if (!existsSync(TEMPIO)) return { pass: false, detail: { missing: TEMPIO } };
  const { p, ctx, errors } = await open({ doc: null, locale: "en" });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [JSON.parse(readFileSync(TEMPIO, "utf8")), TEMPIO]);
  await p.waitForTimeout(3000);
  await p.click("#footer-warnings");
  await p.waitForTimeout(300);
  const more = p.locator(".warn-pop button, #warnings-pop button", { hasText: /table|Open|all/i }).first();
  if (await more.count()) await more.click(); else await p.evaluate(() => document.querySelector("[data-open-issues], .warn-open-table")?.click());
  await p.waitForSelector(".tv-issues", { timeout: 8000 }).catch(() => {});
  const r = await p.evaluate(() => {
    const rows = [...document.querySelectorAll(".tv-issues tbody tr:not([hidden])")];
    const first = rows[0]?.querySelector(".sevtag")?.textContent ?? "";
    const sevs = rows.map((x) => x.querySelector(".sevtag")?.classList.contains("warn") ? "w" : "i").join("");
    const groups = [...document.querySelectorAll(".tv-group-toggle")].map((b) => b.textContent);
    const rule = document.querySelector(".tv-issues td.tv-rule"), node = rule?.nextElementSibling;
    const textBox = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
    const gap = rule && node ? Math.round(textBox(node).left - textBox(rule).right) : null;
    return { first, sevs, groups, gap, n: rows.length };
  });
  let opened = null;
  if (r.groups.length) {
    await p.click(".tv-group-toggle");
    await p.waitForTimeout(300);
    opened = await p.evaluate(() => document.querySelectorAll(".tv-issues tr.tv-grouped:not([hidden])").length);
  }
  await ctx.close();
  return { pass: /▲/.test(r.first) && !/iw/.test(r.sevs) && r.groups.some((g) => /^▸ \d+ × /.test(g)) && opened > 2 && r.gap >= 8 && !errors.length,
    detail: { ...r, opened, errors } };
});

test("G4.lanes", "G4 · San Pietro come la dev.17 l'aveva salvato (A_sanpietro, copia): nessuna corsia ha per nome un id; un'epoca senza nome è «Unnamed epoch · click to name it» e il clic sulla sua etichetta porta al campo del nome", async () => {
  const at = benchFile("A_SANPIETRO");
  if (!existsSync(at)) return { pass: false, detail: { missing: at } };
  const { p, ctx, errors } = await open({ doc: null, locale: "en" });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(at, "utf8")), at]);
  await p.waitForTimeout(3500);
  const sp = await p.evaluate(() => window.__EM_SCENE__?.()?.lanes ?? []);
  await ctx.close();
  const unnamedDoc = { header: { format: "em.json", version: "1.0" }, graph: { graph_id: "g4", name: "g4",
    nodes: [{ id: "E1", node_type: "EpochNode", name: "" }, { id: "U1", node_type: "US", name: "US1" }],
    edges: [{ id: "U1_E1", source: "U1", target: "E1", edge_type: "has_first_epoch" }] } };
  const o = await open({ doc: unnamedDoc, locale: "en" });
  const lanes = await o.p.evaluate(() => window.__EM_SCENE__?.()?.lanes ?? []);
  const chip = await o.p.evaluate(() => window.__EM_DRAG__.labels().lanes.find((l) => l.id === "E1") ?? null);
  const win = await winOf(o.p, "graph");
  const ws = await o.p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  if (chip) await o.p.mouse.click(ws.rect.x + 40, ws.rect.y + chip.y + chip.h / 2);
  await o.p.waitForTimeout(500);
  const focus = await o.p.evaluate(() => ({ cls: document.activeElement?.className ?? "", sel: window.__EM_DRAG__.selected() }));
  await o.ctx.close();
  return { pass: sp.length > 0 && !sp.some((l) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(l.label))
      && lanes.some((l) => l.id === "E1" && l.unnamed && /^Unnamed epoch · click to name it$/.test(l.label))
      && focus.sel.includes("E1") && /insp-name-input/.test(focus.cls) && !errors.length && !o.errors.length,
    detail: { sp, lanes, chip, focus, errors } };
});

test("G5.empty", "G5 · San Pietro com'era (copia): all'apertura l'«untitled graph» vuoto è proposto per la rimozione con una domanda (Log + «Remove it»/«Keep it»), mai tolto da solo; «Remove it» e ⌘S: il file ha solo il Tempio", async () => {
  const at = benchFile("G3_FILE");
  if (!existsSync(at)) return { pass: false, detail: { missing: at } };
  const doc = JSON.parse(readFileSync(at, "utf8"));
  const { p, ctx, errors } = await open({ doc: null, locale: "en", hook: tauriWrites() });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [doc, at]);
  await p.waitForTimeout(3500);
  const asked = await p.evaluate(() => ({ toast: document.getElementById("toast")?.textContent ?? "",
    buttons: [...document.querySelectorAll("#toast .toast-action")].map((b) => b.textContent),
    slots: window.__EM_DRAG__.slots().map((x) => x.name),
    log: window.__EM_DRAG__.log().map((l) => l.message).filter((m) => /empty graph/.test(m)) }));
  await p.evaluate(() => [...document.querySelectorAll("#toast .toast-action")].find((b) => /Remove it/.test(b.textContent))?.click());
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => window.__EM_DRAG__.slots().map((x) => x.name));
  await p.keyboard.press("Meta+s");
  await p.waitForTimeout(1500);
  const writes = await p.evaluate(() => window.__WRITES__);
  await ctx.close();
  const out = writes[0] ? JSON.parse(writes[0].text) : null;
  const graphsOut = out ? Object.values(out.graphs ?? {}).filter((g) => !/shelf|dtc/i.test(String(g.graph_id ?? ""))).map((g) => g.name) : null;
  return { pass: asked.slots.length === 2 && asked.log.length === 1 && asked.buttons.includes("Remove it") && asked.buttons.includes("Keep it")
      && after.length === 1 && writes.length === 1 && JSON.stringify(graphsOut) === JSON.stringify(["Tempio Giunone Moneta"]) && !errors.length,
    detail: { asked, after, graphsOut, errors } };
});

test("TC1.storage", "T-C1 · due file aperti in cartelle diverse: lo Storage mostra la cartella del grafo ATTIVO (si sposta quando si attiva il grafo dell'altro file)", async () => {
  if (!FS_ROOT) return { pass: false, detail: { why: "FS_ROOT not set" } };
  const a = `${FS_ROOT}/dev33/c1/scavoA`, b = `${FS_ROOT}/dev33/c1/scavoB`;
  mkdirSync(a, { recursive: true }); mkdirSync(b, { recursive: true });
  const one = (id, u) => ({ header: { format: "em.json", version: "1.0" }, graph: { graph_id: id, name: id, nodes: [{ id: u, node_type: "US", name: u }], edges: [] } });
  const { p, ctx, errors } = await open({ doc: null, locale: "en", ws: "assets" });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [one("gA", "UA1"), `${a}/A.em.json`]);
  await p.waitForTimeout(1500);
  await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [one("gB", "UB1"), `${b}/B.em.json`]);
  await p.waitForTimeout(1500);
  const fsPath = () => p.evaluate(() => window.__EM_DRAG__.wins().filter((w) => w.type === "storage").map((w) => w.state["current.fsPath"] ?? null));
  const afterB = await fsPath();
  await p.locator(".et-pick", { hasText: "gA" }).first().click();
  await p.waitForTimeout(1500);
  const afterA = await fsPath();
  await ctx.close();
  const real = (x) => (x ?? "").replace(/^\/private/, "");
  return { pass: afterB.some((x) => real(x) === real(b)) && afterA.some((x) => real(x) === real(a)) && !errors.length,
    detail: { afterB, afterA, a, b, errors } };
});

// MICRO-PULIZIA p.1 · «Publish…» no longer asks who you are first and then says
// «nowhere to publish to»: the path B1 measured is gone. What stays measurable:
// it is grey, reached by Tab, and its click explains and opens no panel.
test("B1.near", "B1 → PULIZIA p.1 · «Publish…» grigio (aria-disabled, raggiungibile da Tab): il clic dice «fase 2» e non apre «Who you are»", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "en" });
  await p.click("#ns-publish", { force: true });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({ aria: document.getElementById("ns-publish").getAttribute("aria-disabled"),
    disabled: document.getElementById("ns-publish").disabled, panel: !!document.querySelector(".idpanel"),
    toast: document.getElementById("toast").innerText }));
  await ctx.close();
  return { pass: r.aria === "true" && !r.disabled && !r.panel && /phase 2/.test(r.toast) && !errors.length, detail: { r, errors } };
});

test("TC2.scan", "T-C2 · Tempio (copia sotto la radice del bridge), scan di EM/DosCo: ID doppi D.04 e D.11, un file senza ID; Documents: D.02, D.32 e D.33 tutti presenti (nessun «absent»), con la miniatura; ogni orfano ha la miniatura, o dice «empty copy» se i suoi byte sono zeri", async () => {
  if (!FS_ROOT) return { pass: false, detail: { why: "FS_ROOT not set" } };
  const em = `${FS_ROOT}/dev33/tempio/EM`;
  if (!existsSync(`${em}/Tempio_Giunone_Moneta.em.json`)) return { pass: false, detail: { missing: em } };
  const { p, ctx, errors } = await open({ doc: null, locale: "en", ws: "assets" });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [JSON.parse(readFileSync(`${em}/Tempio_Giunone_Moneta.em.json`, "utf8")), `${em}/Tempio_Giunone_Moneta.em.json`]);
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById("btn-resources").click());
  await p.waitForTimeout(500);
  await p.fill("#res-folder", `${em}/DosCo`);
  await p.click("#res-scan");
  await p.waitForFunction(() => document.querySelectorAll("#res-shelf .res-row").length > 0, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(6000);
  const r = await p.evaluate(() => ({
    dups: [...document.querySelectorAll("#res-shelf .res-note[data-dup-id]")].map((n) => n.dataset.dupId).sort(),
    noId: Number(document.querySelector("#res-shelf .res-note[data-no-id]")?.dataset.noId ?? 0),
    docs: [...document.querySelectorAll("#res-docs .res-row")].map((row) => ({ name: row.querySelector(".res-row-main")?.textContent.trim().split(/\s/)[0],
      missing: !!row.querySelector(".rp-missing"), img: !!row.querySelector("img.rp-img") })),
    orphans: [...document.querySelectorAll("#res-shelf .res-row")].length,
    orphanImgs: [...document.querySelectorAll("#res-shelf .res-row img.rp-img")].length,
    orphanBoxes: [...document.querySelectorAll("#res-shelf .res-row")].slice(0, 10).map((row) => {
      const th = row.firstElementChild;
      return { img: !!th?.querySelector("img.rp-img"), text: th?.textContent ?? "", title: th?.title ?? "" };
    }),
  }));
  await ctx.close();
  return { pass: JSON.stringify(r.dups) === JSON.stringify(["D.04", "D.11"]) && r.noId === 1 && r.docs.length === 3
      && r.docs.every((d) => !d.missing && d.img) && r.orphanImgs > 0
      && r.orphanBoxes.every((b) => b.img || /empty copy/.test(b.text)) && !r.orphanBoxes.some((b) => /does not decode/.test(b.title)) && !errors.length,
    detail: { ...r, errors } };
});

test("S6.frame", "S6 · Tempio (copia), Fonti › «Show in the Matrix» su D.02: nella finestra bassa sotto il visore il documento e i nodi del suo gruppo (D.02.01, «existence») stanno dentro il riquadro, con margine per le etichette", async () => {
  if (!FS_ROOT) return { pass: false, detail: { why: "FS_ROOT not set" } };
  const em = `${FS_ROOT}/dev33/tempio/EM`;
  const { p, ctx, errors } = await open({ doc: null, locale: "en" });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [JSON.parse(readFileSync(`${em}/Tempio_Giunone_Moneta.em.json`, "utf8")), `${em}/Tempio_Giunone_Moneta.em.json`]);
  await p.waitForTimeout(2500);
  await workspace(p, "provenance");
  const names = await p.evaluate(() => Object.fromEntries(JSON.parse(window.__EM_DRAG__.graphJson()).nodes.map((n) => [n.id, n.name])));
  const d02 = Object.keys(names).find((k) => names[k] === "D.02");
  // MICRO-VIEWER-UNICO p.5 (E.D., 20 Oct): «Show in the Matrix» is on the
  // document's card in the Inspector — the document selected first
  await pick(p, d02);
  await p.locator(`[data-show-matrix="${d02}"]:visible`).first().click();
  await p.waitForTimeout(1500);
  const win = await winOf(p, "graph");
  const ws = await p.evaluate((w) => window.__EM_DRAG__.winScene(w), win);
  const want = ws.boxes.filter((b) => ["D.02.01"].includes(names[b.id]) || b.id === d02 || (b.instanceOf ?? "") === d02);
  // …and the «existence» box of its group, the one right above D.02.01 (cut at the top on dev.17)
  const r1 = want.find((b) => names[b.id] === "D.02.01");
  const above = r1 && ws.boxes.filter((b) => names[b.id] === "existence" && b.y < r1.y && r1.y - b.y < 140
    && b.x < r1.x + r1.w && b.x + b.w > r1.x).sort((a, b) => b.y - a.y)[0];
  if (above) want.push(above);
  else if (r1) want.push({ id: "existence?", x: -1, y: -1, w: 0, h: 0 });
  const inside = (b) => b.x >= ws.rect.x && b.y >= ws.rect.y + 20 && b.x + b.w <= ws.rect.x + ws.rect.w && b.y + b.h <= ws.rect.y + ws.rect.h - 20;
  await p.screenshot({ path: SHOT("s6-mostra-nella-matrix"), clip: { x: ws.rect.x, y: ws.rect.y, width: ws.rect.w, height: ws.rect.h } }).catch(() => {});
  await ctx.close();
  return { pass: want.length >= 1 && want.every(inside) && !errors.length,
    detail: { rect: ws.rect, want: want.map((b) => [names[b.id] ?? b.id, Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)]), errors } };
});

test("P1.3dobj", "P1 · Tempio (copia con 3d_obj/ accanto), Spazio: «Link n proxies from 3d_obj/ by name…» per le unità senza proxy, l'anteprima elenca le coppie unità ← file, «Link them» scrive le catene (s3Dgraphy, via bridge) in un passo annullabile, e lo dice nel Log", async () => {
  if (!FS_ROOT) return { pass: false, detail: { why: "FS_ROOT not set" } };
  const em = `${FS_ROOT}/dev33/tempio/EM`;
  const { p, ctx, errors } = await open({ doc: null, locale: "en" });
  await p.waitForFunction(() => !!window.__EM_DRAG__, null, { timeout: 20000 });
  await p.evaluate(([d, at]) => window.__EM_DRAG__.openAt(d, at), [JSON.parse(readFileSync(`${em}/Tempio_Giunone_Moneta.em.json`, "utf8")), `${em}/Tempio_Giunone_Moneta.em.json`]);
  await p.waitForTimeout(2500);
  await workspace(p, "space");
  // the epoch whose units are the masonry ones (USM02…): try every epoch until the offer shows
  const epochs = await p.evaluate(() => [...document.querySelectorAll(".scn-seg button[data-epoch]")].map((b) => b.dataset.epoch));
  let offer = null;
  for (const ep of epochs) {
    await p.click(`.scn-seg button[data-epoch="${ep}"]`);
    await p.waitForTimeout(1500);
    offer = await p.evaluate(() => document.querySelector("[data-action=link-3dobj]")?.textContent ?? null);
    if (offer) break;
  }
  if (!offer) { await ctx.close(); return { pass: false, detail: { epochs, offer } }; }
  const before = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
  await p.click("[data-action=link-3dobj]");
  await p.waitForTimeout(300);
  const pairs = await p.evaluate(() => [...document.querySelectorAll(".p1-preview li")].map((li) => li.textContent));
  await p.click("[data-action=link-3dobj-go]");
  await p.waitForTimeout(2500);
  const after = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()));
  const log = await p.evaluate(() => window.__EM_DRAG__.log().map((l) => l.message).filter((m) => /linked from 3d_obj/.test(m)));
  const geo = after.nodes.filter((n) => n.node_type === "property" && (n.data?.property_type === "geometry")).length;
  const res = after.nodes.filter((n) => n.node_type === "resource" && /3d_obj\//.test(String(n.data?.url ?? n.url ?? ""))).length;
  await p.evaluate(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(400);
  const undone = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.length);
  await ctx.close();
  return { pass: /^Link \d+ proxies from 3d_obj\/ by name/.test(offer) && pairs.length > 0 && pairs.every((x) => / ← 3d_obj\//.test(x))
      && after.nodes.length > before && geo >= pairs.length && res >= 1 && log.length === 1 && undone === before && !errors.length,
    detail: { offer, pairs: pairs.slice(0, 5), n: pairs.length, before, after: after.nodes.length, geo, res, log, undone, errors } };
});

test("F8.node", "F8 (U17), rifatto su DOVE-CHI-MENU p.4/p.5 · «Chi sei» rimanda a «Dove sei» (i nodi); Impostazioni › Connessioni: «Nodi StratiGraph» prima e a parte dalle app sincronizzate; ogni «nessun nodo» apre il campo dell'indirizzo, vuoto, che dice «per esempio …»; niente Stanza né Entra lì; un nodo aggiunto si prova: raggiungibile, versione e modi d'accesso", async () => {
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriHook(),
    route: { pattern: "https://nodo.test/**", handler: (r) => {
      const u = r.request().url();
      const h = { "access-control-allow-origin": "*" };
      if (u.endsWith("/v1/health")) return r.fulfill({ status: 200, headers: h, json: { service: "stratigraph-server", version: "0.9.1", s3dgraphy: "1.6.0.dev30", auth: "keycloak" } });
      if (u.endsWith("/v1/auth-config")) return r.fulfill({ status: 200, headers: h, json: { issuer: "https://nodo.test/realms/sg", client_id: "emstudio", authorization_endpoint: "https://nodo.test/a", token_endpoint: "https://nodo.test/t", enforcing: true, orcid_idp: "orcid", node_name: "Nodo di prova" } });
      return r.fulfill({ status: 404, headers: h, body: "" });
    } } });
  // MICRO-DOVE-CHI-MENU p.4/p.5 (E.D., 19 Oct, 64af313 and 209635c): «Who you
  // are» sends to «Where you are» (entering a node is there); Settings ▸
  // Connections holds the nodes as a LIST, with no Room and no Sign in; every
  // «no node configured» opens it with the cursor in the address field
  await p.click("#footer-identity");
  await p.waitForTimeout(600);
  const toWhere = await p.evaluate(() => !!document.querySelector("[data-idp-where]"));
  await p.click("[data-idp-where]");
  await p.waitForTimeout(600);
  const where = await p.evaluate(() => !document.getElementById("conn-pop")?.classList.contains("hidden")
    && [...document.querySelectorAll("#conn-pop > .conn-sect")].map((x) => x.dataset.sect).includes("nodes"));
  await p.keyboard.press("Escape");
  await p.evaluate(() => window.__EM_DRAG__.openNodeSettings());
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const node = document.getElementById("settings-sect-node"), sync = document.getElementById("settings-sect-sync");
    const url = document.getElementById("set-node-add");
    return { focus: document.activeElement?.id ?? null, nodeH: node?.querySelector("h4")?.textContent,
      syncH: sync?.querySelector("h4")?.textContent, order: !!node && !!sync && !!(node.compareDocumentPosition(sync) & Node.DOCUMENT_POSITION_FOLLOWING),
      ph: url?.placeholder, value: url?.value, roomInNode: !!node?.querySelector("#set-hub-room"), signin: !!node?.querySelector("#set-node-signin") };
  });
  await p.fill("#set-node-add", "https://nodo.test");
  await p.click("#set-node-add-btn");
  const said = '#set-nodes li[data-node="https://nodo.test"] .set-node-said';
  await p.waitForFunction((sel) => /Reachable|does not answer|not a/.test(document.querySelector(sel)?.textContent ?? ""), said, { timeout: 8000 }).catch(() => {});
  const result = await p.evaluate((sel) => document.querySelector(sel)?.textContent ?? "", said);
  await p.screenshot({ path: SHOT("f8-impostazioni-nodo") }).catch(() => {});
  await ctx.close();
  return { pass: toWhere && where && r.focus === "set-node-add" && r.nodeH === "StratiGraph nodes" && r.syncH === "Synchronised apps" && r.order
      && r.ph === "for example https://em.localhost:8443" && r.value === "" && !r.roomInNode && !r.signin
      && /Reachable: https:\/\/nodo\.test · StratiGraph Server 0\.9\.1/.test(result) && /ORCID, through the node/.test(result) && !errors.length,
    detail: { toWhere, where, r, result, errors } };
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
      // the shell always answers with both lists (`main.rs::DesktopQueue`)
      if (cmd === "take_desktop_queue") return { files: [], notices: [] };
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
  // MICRO-DOVE-CHI-MENU p.4 · the node's password is an ENTRY to a node, so it
  // is reached from «Where you are» (the node's row), with the declared iD
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriDesktop(), route: fakeNode(seen),
    init: { "emstudio.settings": JSON.stringify({ sync: { hubUrl: "https://nodo.test" } }),
            "emstudio.identities": JSON.stringify({ current: ORCID_ID, known: [{ orcid: ORCID_ID, verified: false }] }) } });
  await p.route(orcid.route.pattern, orcid.route.handler);
  await p.click("#mode-indicator");
  await p.waitForFunction(() => !!document.querySelector('#conn-pop .conn-node.on [data-act="enter-password"]'), null, { timeout: 8000 }).catch(() => {});
  const before = await p.evaluate(() => ({ enter: [...document.querySelectorAll('#conn-pop .conn-node.on [data-act^="enter"]')].map((b) => b.dataset.act),
    access: document.querySelector("#conn-pop .conn-node.on")?.dataset.access }));
  await p.locator('#conn-pop .conn-node.on [data-act="enter-password"]').click();
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
  return { pass: JSON.stringify(before.enter) === JSON.stringify(["enter-orcid", "enter-password"]) && before.access === "none"
      && opened.length === 1 && url?.searchParams.get("redirect_uri") === "org.extendedmatrix.emstudio:/oidc-return"
      && url?.searchParams.get("login_hint") === ORCID_ID && url?.searchParams.get("code_challenge_method") === "S256"
      && waiting.paste === "node"
      && seen.exchange?.redirect_uri === "org.extendedmatrix.emstudio:/oidc-return" && seen.whoamiAuth === "Bearer AT-nodo"
      && /attested by the node Nodo di prova/.test(after.chip) && /Attested by the node Nodo di prova: Dev \(0000-0002-1825-0097\)/.test(after.set) && !errors.length,
    detail: { before, opened, waiting: waiting.paste, exchange: seen.exchange && { ...seen.exchange, code_verifier: "…" }, whoami: seen.whoamiAuth, panelAfterReturn: seen.panelAfterReturn, after, errors } };
});

// ── MICRO-APRI-IN-EMSTUDIO (13 ott) · il link apre, non rientra ─────────────
/** fakeNode, with every URL asked of it written down, and a room's socket that
 *  opens (and counts how many times it was opened, and for which room) */
const roomNode = () => {
  const seen = { urls: [], sockets: [] };
  const node = fakeNode(seen);
  return { seen,
    route: { pattern: node.pattern, handler: (r) => { seen.urls.push(r.request().url()); return node.handler(r); } },
    wsRoute: { pattern: /nodo\.test/, handler: (ws) => { seen.sockets.push(ws.url()); ws.onMessage(() => {}); } } };
};
const ROOM = "tavolo-2026-10-12";
const APRI = (node = "us1") => `stratigraph://open?server=${encodeURIComponent("https://nodo.test/")}&room=${ROOM}&node=${node}`;

test("AE1.stay", "APRI-IN-EMSTUDIO · desktop già nella stanza tavolo-2026-10-12 su nodo.test: Blender › «Open in EMStudio» consegna stratigraph://open?server=…&room=…&node=us1 — nessuna navigazione della finestra principale, nessun accesso (né auth-config chiesta né browser aperto), stessa stanza sullo stesso socket, us1 selezionato", async () => {
  const n = roomNode();
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriDesktop(), route: n.route, wsRoute: n.wsRoute,
    init: { "emstudio.settings": JSON.stringify({ sync: { hubUrl: "https://nodo.test", hubRoom: ROOM } }) } });
  await p.evaluate(([r]) => window.__EM_DRAG__.joinRoom("https://nodo.test", r, "AT-nodo"), [ROOM]);
  await p.waitForFunction(() => /nodo\.test/.test(window.__EM_DRAG__.statusLine() ?? "") && !/connecting/i.test(window.__EM_DRAG__.statusLine()), null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(600);
  const href0 = await p.evaluate(() => location.href);
  const asked0 = n.seen.urls.length, sockets0 = n.seen.sockets.length;
  const navs = [];
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) navs.push(f.url()); });
  await p.evaluate((u) => window.__DEEPLINK__(u), APRI());
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({ href: location.href, opened: window.__OPENED__.slice(), sel: window.__EM_DRAG__.selected(),
    line: window.__EM_DRAG__.statusLine(), log: window.__EM_DRAG__.log().map((l) => l.message).filter((m) => /room|link/i.test(m)).slice(-3) }));
  const askedAfter = n.seen.urls.slice(asked0);
  await p.screenshot({ path: SHOT("ae1-link-nella-stanza") }).catch(() => {});
  await ctx.close();
  return { pass: sockets0 === 1 && r.href === href0 && !navs.length && !r.opened.length
      && !askedAfter.some((u) => /auth-config|openid-connect/.test(u)) && n.seen.sockets.length === 1
      && n.seen.sockets[0].includes(ROOM) && r.sel.length === 1 && r.sel[0] === "us1"
      && r.log.some((m) => /Already in room tavolo-2026-10-12/.test(m)) && !errors.length,
    detail: { sockets: n.seen.sockets, href0, r, navs, askedAfter, errors } };
});

test("AE2.signin", "APRI-IN-EMSTUDIO · desktop senza sessione: lo stesso link apre l'accesso del nodo nel BROWSER DI SISTEMA col redirect org.extendedmatrix.emstudio:/oidc-return (mai tauri://localhost/), la finestra principale non si muove; il codice torna per deep link e l'app entra nella stanza del link, su us1", async () => {
  const n = roomNode();
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriDesktop(), route: n.route, wsRoute: n.wsRoute });
  const href0 = await p.evaluate(() => location.href);
  const navs = [];
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) navs.push(f.url()); });
  await p.evaluate((u) => window.__DEEPLINK__(u), APRI());
  await p.waitForTimeout(1200);
  const opened = await p.evaluate(() => window.__OPENED__.slice());
  const url = opened[0] ? new URL(opened[0]) : null;
  if (url) {
    await p.evaluate((u) => window.__DEEPLINK__(u), `org.extendedmatrix.emstudio:/oidc-return?state=${url.searchParams.get("state")}&session_state=x&iss=https%3A%2F%2Fnodo.test&code=C0DE`);
    await p.waitForTimeout(2500);
  }
  const r = await p.evaluate(() => ({ href: location.href, sel: window.__EM_DRAG__.selected(), line: window.__EM_DRAG__.statusLine() }));
  await ctx.close();
  return { pass: opened.length === 1 && url?.origin === "https://nodo.test" && /\/protocol\/openid-connect\/auth$/.test(url?.pathname ?? "")
      && url?.searchParams.get("redirect_uri") === "org.extendedmatrix.emstudio:/oidc-return"
      && r.href === href0 && !navs.length && n.seen.exchange?.redirect_uri === "org.extendedmatrix.emstudio:/oidc-return"
      && n.seen.sockets.length === 1 && n.seen.sockets[0].includes(ROOM) && !errors.length,
    detail: { opened, href0, r, navs, sockets: n.seen.sockets, exchange: n.seen.exchange && { redirect_uri: n.seen.exchange.redirect_uri }, errors } };
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

test("E4.em", "E4 · Impostazioni › Connessioni, https://sito.test aggiunto (il sito davanti al nodo) si prova sulla sua riga: prova anche /em, dice dove risponde il nodo e lo propone; «Usa» lo mette nella lista al suo posto e la prova riparte, raggiungibile. Su un indirizzo dove risponde solo un sito, lo dice", async () => {
  const health = { service: "stratigraph-server", version: "0.9.2", s3dgraphy: "1.6.0.dev31", auth: "open" };
  const { p, ctx, errors } = await open({ doc: LITE(), locale: "en", hook: tauriHook(),
    route: { pattern: /https:\/\/(sito|solosito)\.test\/.*/, handler: (r) => {
      const u = r.request().url();
      if (u === "https://sito.test/em/v1/health") return r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, json: health });
      // the site in front: html, and NO CORS header — from a page, that looks like silence
      if (u.startsWith("https://sito.test/") || u.startsWith("https://solosito.test/")) return r.fulfill({ status: u.endsWith("/v1/health") ? 404 : 200, contentType: "text/html", body: "<!doctype html><title>site</title>" });
      return r.fulfill({ status: 404, body: "" });
    } } });
  // MICRO-DOVE-CHI-MENU p.5 (E.D., 19 Oct, 209635c): Settings ▸ Connections is
  // a LIST of nodes — an address is added («Add»), and tested on its own row;
  // the door is the one of every «no node configured» (`openNodeSettings`)
  await p.evaluate(() => window.__EM_DRAG__.openNodeSettings());
  await p.waitForTimeout(500);
  const said = (addr) => `#set-nodes li[data-node="${addr}"] .set-node-said`;
  const settle = (addr) => p.waitForFunction((sel) => { const t = document.querySelector(sel)?.textContent ?? "";
    return t.length > 3 && !/Testing|Provo/.test(t); }, said(addr), { timeout: 12000 }).catch(() => {});
  const test = async (addr) => {
    await p.fill("#set-node-add", addr);
    await p.click("#set-node-add-btn");
    await settle(addr);
    await p.waitForTimeout(300);
    return p.evaluate((sel) => ({ text: document.querySelector(sel)?.textContent ?? "", state: document.querySelector(sel)?.dataset.state,
      suggest: document.querySelector(`${sel} [data-node-suggest]`)?.dataset.nodeSuggest ?? null }), said(addr));
  };
  const a = await test("https://sito.test");
  let b = null;
  if (a.suggest) {
    await p.click(`${said("https://sito.test")} [data-node-suggest]`);
    await p.waitForFunction((sel) => /Reachable/.test(document.querySelector(sel)?.textContent ?? ""), said(a.suggest), { timeout: 12000 }).catch(() => {});
    b = await p.evaluate((sel) => ({ field: [...document.querySelectorAll("#set-nodes li[data-node]")].map((li) => li.dataset.node).join(" "),
      text: document.querySelector(sel)?.textContent ?? "" }), said(a.suggest));
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


// ── MICRO-LA-BARRA-E-LE-STANZE · the bar in four zones, the rooms ───────────
/** the bar as a person reads it: its zones, and each zone's visible text */
const barOf = (p) => p.evaluate(() => {
  const bar = document.getElementById("statusbar");
  const visible = (e) => !!e && e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden";
  const zones = [...bar.querySelectorAll(":scope > .sb-zone")].map((z) => ({
    zone: z.dataset.zone,
    text: [...z.querySelectorAll("*")].filter((e) => visible(e) && !e.children.length).map((e) => e.textContent.trim()).filter(Boolean).join(" ") }));
  const all = [...bar.querySelectorAll("*")].filter((e) => visible(e) && !e.children.length).map((e) => e.textContent).join(" ");
  const cut = [...bar.querySelectorAll(".sb-zone button, .sb-zone .where-text")].filter((e) => visible(e) && e.scrollWidth > e.clientWidth + 1).map((e) => e.id || e.className);
  return { zones, all, cut, health: document.getElementById("mode-indicator").dataset.health };
});
// MICRO-DOVE-CHI-MENU p.4 · «who» moved to the RIGHT end of the bar
const barOk = (b) => JSON.stringify(b.zones.map((z) => z.zone)) === JSON.stringify(["where", "message", "log", "who"])
  && !/run:|NOT WIRED|Take from|Prendo da|TOOL|\bAT\b/.test(b.all) && !b.cut.length;

test("TZ.standalone", "T-Z · Su questo computer: la barra ha esattamente quattro zone (dove · chi · messaggio · log), nessun «run:», «NOT WIRED» o «Take from…», niente tagliato; la zona 1 dice «On this computer» e il clic apre il pannello Connessione; il menu Mode apre lo stesso pannello", async () => {
  const { p, ctx, errors } = await open({ doc: "TempluMare", locale: "en" });
  await p.evaluate(() => window.__EM_DRAG__.setView?.("matrix"));
  const bar = await barOf(p);
  await p.screenshot({ path: SHOT("tz-barra-standalone"), clip: { x: 0, y: 960, width: 1600, height: 40 } }).catch(() => {});
  await p.click("#mode-indicator");
  await p.waitForTimeout(300);
  const panel = await p.evaluate(() => ({ open: !document.getElementById("conn-pop")?.classList.contains("hidden"),
    modes: [...document.querySelectorAll("#conn-pop .conn-mode")].map((b) => b.textContent),
    sects: [...document.querySelectorAll("#conn-pop .conn-sect")].map((s) => s.dataset.sect ?? "modes") }));
  await p.keyboard.press("Escape");
  // MICRO-DOVE-CHI-MENU p.3 · no «Mode» menu any more: ⇧⌘L opens the same panel
  await p.evaluate(() => document.getElementById("conn-pop")?.classList.add("hidden"));
  await p.keyboard.press("Shift+Meta+L");
  await p.waitForTimeout(300);
  const fromMenu = await p.evaluate(() => !document.getElementById("conn-pop")?.classList.contains("hidden")
    && !!document.querySelector("#conn-pop .conn-mode") && !document.getElementById("dd-mode"));
  const hubTitle = await p.evaluate(() => document.querySelector('#conn-pop .conn-mode[data-mode="hub"]')?.title ?? "");
  await ctx.close();
  return { pass: barOk(bar) && bar.zones[0].text === "On this computer" && bar.health === "ok" && panel.open
      && JSON.stringify(panel.modes) === JSON.stringify(["On this computer", "With an app", "In a room"])
      && fromMenu && !/NOT WIRED|[Hh]ub/.test(hubTitle) && !errors.length,
    detail: { bar, panel, fromMenu, hubTitle, errors } };
});

test("TZ.sidecar", "T-Z + T-B1 (lato EMStudio) · Con Blender: quattro zone, zona 1 «With Blender (GreatTemple….blend)», nessun nodo nella barra né nel pannello; «Take from…» è nel pannello («What you accept from Blender»); Blender risponde snapshot_unavailable → la frase «No graph loaded in Blender» nel messaggio, nel Log e nel pannello, pallino ambra; poi lo snapshot arriva da sé (senza riconnettere) e il pallino torna verde", async () => {
  const port = 8897;
  let sock = null, connects = 0;
  const doc = { header: { format: "em.json", version: "1.0" },
    graph: { graph_id: "gt-1", name: "GreatTemple", nodes: [{ id: "SU001", node_type: "US", name: "SU001" }], edges: [] } };
  const host = { tool: "Blender", file: "GreatTemple_2026_v3.blend" };
  const { p, ctx, errors } = await open({ doc: null, locale: "en",
    init: { "emstudio.settings": JSON.stringify({ sync: { protocol: "ws", host: "localhost", port, hubUrl: "https://em.localhost:8443/em" } }) },
    wsRoute: { pattern: new RegExp(`localhost:${port}`), handler: (ws) => {
      sock = ws; connects++;
      ws.onMessage((m) => {
        const msg = JSON.parse(String(m));
        if (msg.type === "request_snapshot") ws.send(JSON.stringify({ v: 2, type: "snapshot_unavailable", source: "emtools",
          payload: { reason: "no_graph_loaded", message: "No graph loaded in Blender: load it from the EM panel", graphs: ["GreatTemple"], host } }));
      });
    } } });
  await p.click("#mode-indicator");   // MICRO-DOVE-CHI-MENU p.3 · «Mode» left the bar
  await p.click('#conn-pop .conn-mode[data-mode="sidecar"]');
  await p.waitForFunction(() => document.body.classList.contains("sync-active"), null, { timeout: 9000 }).catch(() => {});
  await p.waitForTimeout(800);
  const empty = await barOf(p);
  const log1 = await p.evaluate(() => window.__EM_DRAG__.log().map((l) => l.message));
  await p.screenshot({ path: SHOT("tz-barra-sidecar-senza-grafo"), clip: { x: 0, y: 960, width: 1600, height: 40 } }).catch(() => {});
  await p.click("#mode-indicator");
  await p.waitForTimeout(300);
  const panel = await p.evaluate(() => {
    const pop = document.getElementById("conn-pop");
    return { text: pop.textContent, sects: [...pop.querySelectorAll(".conn-sect")].map((s) => s.dataset.sect ?? "modes"),
      accept: !!pop.querySelector("#sync-control .sync-ctl-btn"), head: pop.querySelector(".conn-where")?.textContent };
  });
  await p.screenshot({ path: SHOT("tz-pannello-sidecar") }).catch(() => {});
  await p.keyboard.press("Escape");
  // the graph gets loaded in Blender: the snapshot comes unasked
  sock.send(JSON.stringify({ v: 2, type: "snapshot", source: "emtools", payload: { doc, host } }));
  await p.waitForTimeout(1500);
  const loaded = await barOf(p);
  const slots = await p.evaluate(() => window.__EM_DRAG__.slots());
  // …and again (Blender re-sends it): still ONE slot from Blender
  sock.send(JSON.stringify({ v: 2, type: "snapshot", source: "emtools", payload: { doc, host } }));
  await p.waitForTimeout(1200);
  const slots2 = await p.evaluate(() => window.__EM_DRAG__.slots());
  await p.screenshot({ path: SHOT("tz-barra-sidecar"), clip: { x: 0, y: 960, width: 1600, height: 40 } }).catch(() => {});
  await ctx.close();
  return { pass: barOk(empty) && empty.zones[0].text === "On this computer · with Blender" && empty.health === "warn"
      && /No graph loaded in Blender \(GreatTemple is listed but not loaded\)/.test(empty.zones[1].text)
      && log1.some((m) => /No graph loaded in Blender/.test(m))
      && /No graph loaded in Blender/.test(panel.text) && panel.accept && /What you accept from Blender/.test(panel.text)
      // MICRO-DOVE-CHI-MENU p.3 · the panel always has its three sections (the
      // nodes too, with an app): the BAR still says no node in a Sidecar
      && JSON.stringify(panel.sects.slice(0, 3)) === JSON.stringify(["mode", "apps", "nodes"]) && !/em\.localhost/.test(empty.all)
      && barOk(loaded) && loaded.health === "ok" && slots.length === 1 && slots2.length === 1 && connects === 1 && !errors.length,
    detail: { empty, panel, loaded, slots, slots2, connects, log1: log1.slice(-4), errors } };
});

if (K_NODE) test("TZ.room", "T-Z + T-B2 dal vivo · in stanza: quattro zone, zona 1 «Room Cantiere · demo · em.localhost», zona 2 nome + ruolo; una seconda istantanea della stessa stanza NON apre un secondo file; il file dice «in the room … on em.localhost:8443», mai «opened in the browser»", async () => {
  const { p, ctx, errors } = await open({ doc: null, locale: "en", init: K_SETTINGS() });
  const tok = kToken("dev");
  await p.evaluate(([u, tk]) => window.__EM_DRAG__.joinRoom(u, "cantiere-demo", tk), [K_NODE, tok]);
  await p.waitForFunction(() => /^Room /.test(window.__EM_DRAG__.statusLine()), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const bar = await barOf(p);
  const files1 = await p.evaluate(() => window.__EM_DRAG__.files());
  await p.screenshot({ path: SHOT("tz-barra-stanza"), clip: { x: 0, y: 960, width: 1600, height: 40 } }).catch(() => {});
  // a second join of the same room = a second snapshot (a reconnection, a restore)
  await p.evaluate(([u, tk]) => window.__EM_DRAG__.joinRoom(u, "cantiere-demo", tk), [K_NODE, tok]);
  await p.waitForTimeout(3000);
  const files2 = await p.evaluate(() => window.__EM_DRAG__.files());
  await workspace(p, "assets");
  const tails = await p.evaluate(() => [...document.querySelectorAll(".et-file-tail")].map((e) => e.textContent));
  await ctx.close();
  const roomFiles = (fs) => fs.filter((f) => f.room?.id === "cantiere-demo");
  return { pass: barOk(bar) && /^Room Cantiere · demo \(due container\) · em\.localhost$/.test(bar.zones[0].text)
      && /^Dev User(⬢)? · ★ owner$/.test(bar.zones[3].text)
      && roomFiles(files1).length === 1 && roomFiles(files2).length === 1
      && tails.some((x) => /in the room Cantiere · demo \(due container\) on em\.localhost:8443/.test(x)) && !tails.some((x) => /browser/.test(x))
      && !errors.length,
    detail: { bar, files1, files2, tails, errors } };
});

if (K_NODE) test("TR1.live", "T-R1 dal vivo · il pannello Connessione chiede GET /v1/rooms: dev vede «Your rooms» con le sue stanze (e scavo-2026 se il nodo la elenca), viewer vede «cantiere-demo» in «Shared with you» col ruolo viewer; un clic entra nella stanza", async () => {
  const run = async (user) => {
    const { p, ctx, errors } = await open({ doc: null, locale: "en", init: K_SETTINGS() });
    const tok = kToken(user);
    await p.evaluate(([u, tk]) => window.__EM_DRAG__.joinRoom(u, "cantiere-demo", tk), [K_NODE, tok]);
    await p.waitForFunction(() => /^Room /.test(window.__EM_DRAG__.statusLine()), null, { timeout: 15000 }).catch(() => {});
    await p.click("#mode-indicator");
    await p.waitForFunction(() => !!document.querySelector('#conn-pop .conn-rooms[data-group="mine"]'), null, { timeout: 15000 }).catch(() => {});
    const r = await p.evaluate(() => {
      const g = (k) => [...document.querySelectorAll(`#conn-pop .conn-rooms[data-group="${k}"] li[data-room]`)]
        .map((li) => [li.dataset.room, li.querySelector(".conn-role")?.textContent ?? ""]);
      return { mine: g("mine"), shared: g("shared"), heads: [...document.querySelectorAll("#conn-pop h5")].map((h) => h.textContent),
        filter: !!document.querySelector("#conn-pop .conn-rooms-filter") };
    });
    await p.screenshot({ path: SHOT(`tr1-stanze-${user}`) }).catch(() => {});
    await ctx.close();
    return { ...r, errors };
  };
  const dev = await run("dev"), viewer = await run("viewer");
  const truth = kGet("/rooms", kToken("viewer"));
  return { pass: dev.mine.some(([r]) => r === "cantiere-demo") && dev.heads.some((h) => /^Your rooms · \d+/.test(h)) && dev.filter
      && viewer.shared.some(([r, role]) => r === "cantiere-demo" && role === "viewer")
      && viewer.shared.length === truth.filter((x) => x.your_role !== "owner" && !x.archived_at).length
      && !dev.errors.length && !viewer.errors.length,
    detail: { dev: { mine: dev.mine.length, scavo: dev.mine.find(([r]) => r === "scavo-2026") ?? null, heads: dev.heads }, viewer, nTruth: truth.length } };
});


// ── «Bring into a room…» is the ENGINE's (MICRO-PORTA-IN-STANZA-DAL-MOTORE,
// 16 Oct 2026): the dialog shows `s3dgraphy.room_import`'s plan (through the
// bridge's /room-import), sends the person's choices back, and EMStudio enters
// the room only after the engine has seated the graph.
//   LIVE_NODE=https://em.localhost:8443/em TEMPLU=<em.json> PORT=5173 \
//   BRIDGE=http://localhost:8768 node scripts/check-interactions.mjs TP2
// (the em.json's dataset under the bridge's --fs-root; read, never written)
const DEV_ID = () => JSON.stringify({ current: "0000-0002-1825-0097",
  known: [{ orcid: "0000-0002-1825-0097", name: "Dev", surname: "User", verified: false }] });
/** open `doc` at `path`, sign in as dev, «Bring into a room…» named `name`: the
 *  page with the dialog showing the engine's plan */
async function bringPage(doc, path, name, { w = 1600, h = 1000 } = {}) {
  const { p, ctx, errors } = await open({ doc: null, locale: "en", w, h, init: {
    "emstudio.settings": JSON.stringify({ sync: { hubUrl: K_NODE } }), "emstudio.identities": DEV_ID() } });
  await p.evaluate(([d, pa]) => window.__EM_DRAG__.openAt(d, pa), [doc, path]);
  await p.waitForTimeout(1500);
  await p.evaluate((tk) => window.__EM_DRAG__.useToken(tk), kToken("dev"));
  await p.evaluate(() => window.__EM_DRAG__.bringIntoRoom());
  await p.waitForSelector("#room-name", { timeout: 10000 });
  await p.fill("#room-name", name);
  await p.click('.modal-foot button[data-a="ok"]');
  await p.waitForSelector("#inv-pop .inv-go", { timeout: 300000 });
  return { p, ctx, errors };
}
const groupsOf = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll("#inv-pop .inv-group")]
  .map((g) => [g.dataset.group, g.querySelector("h5").textContent])));
const nOf = (h) => Number(/· (\d+)/.exec(h ?? "")?.[1] ?? -1);
const roomFile = (p) => p.evaluate(() => window.__EM_DRAG__.files().find((f) => f.room)?.room?.id ?? null);

if (K_NODE && process.env.TEMPLU) test("TP2.live", "T-P2 dal vivo · Templu Mare portato in una stanza nuova del nodo di sviluppo DAL MOTORE: il dialogo mostra il piano in cinque gruppi, le trovate salgono (il tileset come .3tz), il grafo è seduto dal motore e poi EMStudio entra nella stanza; un secondo lancio con lo stesso nome carica 0 byte e 0 operazioni", async () => {
  const path = process.env.TEMPLU;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const name = process.env.TP2_ROOM ?? `Templu prova ${Date.now() % 100000}`;
  const SH = process.env.SHOTS_PREFIX ?? "tp2";
  const t0 = Date.now();
  const { p, ctx, errors } = await bringPage(doc, path, name);
  const planSecs = Math.round((Date.now() - t0) / 1000);
  const groups = await groupsOf(p);
  const lots = await p.evaluate(() => [...document.querySelectorAll("#inv-pop .inv-lot")].map((r) => r.textContent));
  const total = await p.evaluate(() => document.querySelector("#inv-pop .inv-total")?.textContent ?? "");
  await p.screenshot({ path: SHOT(`${SH}-inventario`) }).catch(() => {});
  const t1 = Date.now();
  await p.click("#inv-pop .inv-go");
  await p.waitForSelector("#inv-pop .inv-link", { timeout: 1800000 });
  const secs = Math.round((Date.now() - t1) / 1000);
  const first = await p.evaluate(() => window.__EM_DRAG__.inventoryReport());
  await p.screenshot({ path: SHOT(`${SH}-referto`) }).catch(() => {});
  await p.waitForFunction(() => window.__EM_DRAG__.files().some((f) => f.room), null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(3000);
  const room = await roomFile(p);
  const state = await p.evaluate(() => ({ nodes: window.__EM_DRAG__.nodeCount(), status: window.__EM_DRAG__.statusLine() }));
  await p.evaluate(() => document.getElementById("inv-pop")?.classList.add("hidden"));
  await p.screenshot({ path: SHOT(`${SH}-in-stanza`) }).catch(() => {});
  const log = await p.evaluate(() => window.__EM_DRAG__.log().map((l) => l.message).filter((m) => /room-import|inventory|room:/.test(m)));
  await ctx.close();
  // the second launch: the same file, the same name — the engine takes the room up again
  const again = await bringPage(doc, path, name);
  const groups2 = await groupsOf(again.p);
  const total2 = await again.p.evaluate(() => document.querySelector("#inv-pop .inv-total")?.textContent ?? "");
  await again.p.screenshot({ path: SHOT(`${SH}-secondo-inventario`) }).catch(() => {});
  await again.p.click("#inv-pop .inv-go");
  await again.p.waitForSelector("#inv-pop .inv-link", { timeout: 600000 });
  const second = await again.p.evaluate(() => window.__EM_DRAG__.inventoryReport());
  await again.p.screenshot({ path: SHOT(`${SH}-secondo-referto`) }).catch(() => {});
  await again.ctx.close();
  const eng = first.engine ?? {}, eng2 = second.engine ?? {};
  return { pass: nOf(groups.on_disk) >= 0 && nOf(groups.missing) >= 0 && room === roomIdOf(name)
      && first.failed === 0 && (eng.seeded?.applied ?? 0) > 0 && (eng.seeded?.refused ?? 1) === 0
      && state.nodes > 200 && second.uploaded === 0 && second.bytes === 0 && (eng2.seeded?.sent ?? -1) === 0
      && /^To upload: 0 files/.test(total2) && !errors.length && !again.errors.length,
    detail: { name, room, planSecs, secs, groups, lots, total, first: { ...first, engine: undefined },
      seeded: eng.seeded, requests: eng.requests, timings: eng.timings, packs: eng.packs, state, groups2, total2,
      second: { ...second, engine: undefined }, seeded2: eng2.seeded, requests2: eng2.requests,
      log: log.slice(-40), errors: [...errors, ...again.errors] } };
});
const roomIdOf = (name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

if (K_NODE && process.env.TEMPLU) test("TU1.pause", "T-U1 (client) · un file nuovo da 100 MB sale dal motore a pezzi ripristinabili: «Pausa» ferma il motore fra due pezzi (l'avanzamento non si muove, il nodo non ha il file), «Riprendi» lo fa continuare dall'offset del server, e il file arriva intero (sha256 dal server)", async () => {
  const dir = TEMPLU_DIR();
  const scratch = process.env.U1_DIR ?? "/tmp/emstudio-u1";
  mkdirSync(scratch, { recursive: true });
  const file = `${scratch}/u1-pausa-${Date.now()}.bin`;
  execFileSync("dd", ["if=/dev/urandom", `of=${file}`, "bs=1m", "count=100"], { stdio: "ignore" });
  const local = "sha256:" + execFileSync("shasum", ["-a", "256", file], { encoding: "utf8" }).split(" ")[0];
  const doc = { header: { format: "em.json", version: "1.0" }, active_graph_id: "g-u1", graphs: {
    "g-u1": { graph_id: "g-u1", name: "U1", nodes: [{ id: "us1", node_type: "US", name: "US 1" }], edges: [] },
    shelf: { graph_id: "shelf", name: "Shelf", data: { em_collection: "ShelfGraph" }, edges: [],
      nodes: [{ id: "big-1", name: "u1.bin", node_type: "resource", data: { url: file, media_type: "application/octet-stream" } }] } } };
  const name = `u1 pausa ${Date.now() % 100000}`;
  const { p, ctx, errors } = await bringPage(doc, `${scratch}/u1.em.json`, name);
  await p.click("#inv-pop .inv-go");
  // on the dev node 100 MB go up in a few seconds: «Pause» as soon as it is
  // there — the engine holds before the next file or the next piece
  await p.waitForSelector("#inv-pop .inv-pause", { timeout: 10000 });
  await p.click("#inv-pop .inv-pause");
  await p.waitForTimeout(4000);       // the piece in flight ends, then it holds
  const a = await p.evaluate(() => document.querySelector("#inv-pop .inv-line:last-of-type")?.textContent ?? "");
  const room = roomIdOf(name);
  const head = () => execFileSync("curl", ["-sk", "-o", "/dev/null", "-w", "%{http_code}", "-I",
    `${K_NODE}/v1/rooms/${room}/asset/${local}`, "-H", `Authorization: Bearer ${kToken("dev")}`], { encoding: "utf8" });
  const during = head();
  await p.waitForTimeout(3000);
  const b = await p.evaluate(() => document.querySelector("#inv-pop .inv-line:last-of-type")?.textContent ?? "");
  const paused = await p.evaluate(() => window.__EM_DRAG__.log().filter((l) => /upload paused/.test(l.message)).length);
  await p.click("#inv-pop .inv-pause");
  await p.waitForSelector("#inv-pop .inv-link", { timeout: 300000 });
  const rep = await p.evaluate(() => window.__EM_DRAG__.inventoryReport());
  const lines = await p.evaluate(() => window.__EM_DRAG__.log().map((l) => l.message).filter((m) => /room-import: (paused|resumed)/.test(m)));
  await ctx.close();
  const after = head();
  execFileSync("rm", ["-f", file]);
  return { pass: paused === 1 && a === b && !/100\.0 MB of 100\.0 MB/.test(a) && during === "404" && after === "200"
      && rep.uploaded === 1 && rep.bytes === 100 * 1024 * 1024 && lines.length >= 2 && !errors.length,
    detail: { a, b, during, after, lines, rep: { ...rep, engine: undefined }, local, dir, errors } };
});

// ── F1 · L1 (MICRO-ASSET-VERSIONI) · one home per file, the lot rule ────────
//   LIVE_NODE=https://em.localhost:8443/em F1_DIR=/tmp/micro-asset-versioni/f1l1 \
//   BRIDGE=http://localhost:8768 node scripts/check-interactions.mjs TF1 TL1
// (F1_DIR under the bridge's --fs-root; TL1 writes its photos there when they
// are not, with Pillow from s3Dgraphy's venv)
if (K_NODE && process.env.F1_DIR) test("TF1.live", "T-F1 dal vivo · un file a casa nella stanza A (caricato lì, citato dal grafo di A); «Porta in stanza» B lo trova «a casa in un'altra stanza»: il motore propone di ospitarlo qui; scelto «Sposta qui», la conferma elenca A (lascia, e lì diventa riferimento); dopo il sì la casa è B sul server e nessun byte è stato rimandato", async () => {
  const dir = process.env.F1_DIR;
  mkdirSync(dir, { recursive: true });
  const stamp = Date.now() % 1000000;
  const file = `${dir}/f1-podio-${stamp}.bin`;
  execFileSync("dd", ["if=/dev/urandom", `of=${file}`, "bs=1k", "count=64"], { stdio: "ignore" });
  const tok = kToken("dev");
  const auth = ["-H", `Authorization: Bearer ${tok}`];
  const roomA = `f1-casa-a-${stamp}`;
  execFileSync("curl", ["-sk", "-X", "POST", `${K_NODE}/v1/rooms`, ...auth, "-H", "Content-Type: application/json",
    "-d", JSON.stringify({ room_id: roomA })]);
  const put = JSON.parse(execFileSync("curl", ["-sk", "-X", "PUT", `${K_NODE}/v1/rooms/${roomA}/asset?media_type=application/octet-stream`,
    ...auth, "--data-binary", `@${file}`], { encoding: "utf8" }));
  execFileSync("curl", ["-sk", "-X", "POST", `${K_NODE}/v1/rooms/${roomA}/ops`, ...auth, "-H", "Content-Type: application/json",
    "-d", JSON.stringify({ ops: [{ op: "add_node", id: "podio", node: { id: "podio", node_type: "resource", name: "podio",
      data: { checksum: put.ref, url: `${K_NODE}/v1/rooms/${roomA}/asset/${put.ref}`, residency: "resident" } } }] })]);
  const doc = { header: { format: "em.json", version: "1.0" }, active_graph_id: "g-f1", graphs: {
    "g-f1": { graph_id: "g-f1", name: "F1", nodes: [{ id: "us1", node_type: "US", name: "US 1" }], edges: [] },
    shelf: { graph_id: "shelf", name: "Shelf", data: { em_collection: "ShelfGraph" }, edges: [],
      nodes: [{ id: "podio-b", name: "podio.bin", node_type: "resource", data: { url: file, media_type: "application/octet-stream" } }] } } };
  const { p, ctx, errors } = await bringPage(doc, `${dir}/f1-${stamp}.em.json`, `f1 casa b ${stamp}`);
  const groups = await groupsOf(p);
  const sel = '#inv-pop .inv-group[data-group="elsewhere"] select';
  const proposal = await p.evaluate((s) => document.querySelector(s)?.value ?? null, sel);
  await p.selectOption(sel, "move");
  await p.click("#inv-pop .inv-go");
  await p.waitForSelector("#inv-pop .inv-move-ask", { timeout: 30000 });
  const ask = await p.evaluate(() => document.querySelector("#inv-pop .inv-move-ask")?.innerText ?? "");
  await p.screenshot({ path: SHOT("tf1-sposta-qui") }).catch(() => {});
  await p.click("#inv-pop .inv-move-yes");
  await p.waitForSelector("#inv-pop .inv-link", { timeout: 60000 });
  const rep = await p.evaluate(() => window.__EM_DRAG__.inventoryReport());
  // EMStudio enters the room after the engine: the shelf it reads is the room's
  await p.waitForFunction(() => window.__EM_DRAG__.shelf().some((e) => e.id === "podio-b" && /\/asset\//.test(e.locator)),
    null, { timeout: 30000 }).catch(() => {});
  const shelf = await p.evaluate(() => window.__EM_DRAG__.shelf());
  const roomB = await roomFile(p);
  await ctx.close();
  const view = kGet(`/rooms/${roomB}/asset-home/${put.ref}`, tok);
  const hex = put.sha256;
  const record = JSON.parse(execFileSync("docker", ["exec", "em-dev-server", "cat",
    `/srv/em-data/snapshots/asset-homes/${hex.slice(0, 2)}/${hex}.json`], { encoding: "utf8" }));
  const entry = shelf.find((e) => e.id === "podio-b");
  execFileSync("rm", ["-f", file]);
  return { pass: put.home === roomA && /^At home in another room · 1/.test(groups.elsewhere) && /^Found on this computer · 0/.test(groups.on_disk)
      && proposal === "host" && ask.includes(roomA) && /become «in another room»/.test(ask)
      && rep.moved === 1 && rep.uploaded === 0 && rep.bytes === 0
      && view.home === roomB && view.here === true && (view.references ?? []).includes(roomA)
      && record.home === roomB && (record.moves ?? []).length === 1
      && String(entry?.locator ?? "").includes(`/rooms/${encodeURIComponent(roomB)}/asset/`) && !errors.length,
    detail: { roomA, roomB, groups, proposal, ask, rep: { ...rep, engine: undefined }, view: { home: view.home, references: view.references }, record, entry, errors } };
});

/** L1 · the photos of the lot rule, written when they are not there: a session
 *  of 13 shots of one body in 3 minutes, five D.07.0x of the same body in a
 *  DosCo, eight photos with no EXIF */
function l1Fixture(dir) {
  if (existsSync(`${dir}/session`)) return;
  const py = new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname;
  execFileSync(py, ["-c", `
import os, sys
from PIL import Image
d = sys.argv[1]
def shot(path, at=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = Image.new("RGB", (8, 8), (120, 90, 60))
    if at is None:
        img.save(path, "JPEG"); return
    ex = Image.Exif()
    ex[0x010F] = "Canon"; ex[0x0110] = "Canon EOS R5"
    sub = ex.get_ifd(0x8769); sub[0xA431] = "012345"; sub[0x9003] = at
    img.save(path, "JPEG", exif=ex)
for i in range(13):
    shot(f"{d}/session/IMG_{i:04d}.JPG", f"2026:09:30 10:{(15 * i) // 60:02d}:{(15 * i) % 60:02d}")
for i in range(1, 6):
    shot(f"{d}/DosCo/D.07.0{i}.jpg", f"2026:09:30 11:00:0{i}")
for i in range(8):
    shot(f"{d}/noexif/foto_{i}.jpg")
`, dir]);
}

if (process.env.F1_DIR && K_NODE) test("TL1.live", "T-L1 dal vivo · il bridge legge l'EXIF e il MOTORE propone i lotti: un DosCo non diventa lotto, nemmeno D.07.0x con l'EXIF di una sola fotocamera; le foto di una sessione (stessa fotocamera, ≤ 30 min) sono UN lotto proposto, non confermato", async () => {
  const dir = process.env.F1_DIR;
  l1Fixture(dir);
  const pick = (folder) => existsSync(folder) ? execFileSync("ls", [folder], { encoding: "utf8" }).split("\n")
    .filter((f) => f && !f.startsWith(".")).map((f) => `${folder}/${f}`) : [];
  const files = [...pick(`${dir}/DosCo`), ...pick(`${dir}/session`), ...pick(`${dir}/noexif`)];
  const doc = { header: { format: "em.json", version: "1.0" }, active_graph_id: "g-l1", graphs: {
    "g-l1": { graph_id: "g-l1", name: "L1", nodes: [{ id: "us1", node_type: "US", name: "US 1" }], edges: [] },
    shelf: { graph_id: "shelf", name: "Shelf", data: { em_collection: "ShelfGraph" }, edges: [],
      nodes: files.map((f, i) => ({ id: `l1-${i}`, name: f.split("/").pop(), node_type: "resource", data: { url: f } })) } } };
  const { p, ctx, errors } = await bringPage(doc, `${dir}/l1.em.json`, `l1 lotto ${Date.now() % 100000}`);
  const lots = await p.evaluate(() => [...document.querySelectorAll("#inv-pop .inv-lot")].map((r) => ({
    text: r.querySelector("span")?.textContent ?? "", proposal: !!r.querySelector(".inv-lot-yes input"),
    checked: r.querySelector(".inv-lot-yes input")?.checked ?? null })));
  // the photos may already be on the node (an earlier run): «already in the
  // storage» or «at home in another room» — never a lot then (they have no path to send)
  const groups = await groupsOf(p);
  await p.screenshot({ path: SHOT("tl1-lotto-proposto") }).catch(() => {});
  await p.click("#inv-pop .inv-later, #inv-pop .conn-acts .conn-btn:not(.inv-go)").catch(() => {});
  await ctx.close();
  const n = (h) => Number(/· (\d+)/.exec(h ?? "")?.[1] ?? 0);
  return { pass: lots.length === 1 && /^Proposed lot «Canon EOS R5 #012345 · 2026-09-30 10:00–10:03» · 13 photos/.test(lots[0].text)
      && lots[0].proposal && lots[0].checked === false
      && n(groups.on_disk) + n(groups.in_store) + n(groups.elsewhere) === files.length && !errors.length,
    detail: { files: files.length, groups, lots, errors } };
});

// ── MICRO 6 ott 2026 · uscire dalla stanza svuota tutto, e il Tabular mostra il
// foglio scelto (report: s3Dgraphy/.claude/wip/reports/2026-10-06-emstudio-stanza-e-tabular)
const SPACES = ["canvas", "provenance", "assets", "narrative", "space"];
/** What every window of every space, the name strip, the status bar and the
 *  warnings pill SAY — as text, with the values of the fields. The EMTree's
 *  «Recent files» is left out: it is the app's history, not a document. */
async function everyWindowSays(p) {
  const out = [];
  for (const ws of SPACES) {
    await workspace(p, ws);
    out.push(...await p.evaluate((ws) => {
      const said = (el) => {
        if (!el) return "";
        const c = el.cloneNode(true);
        c.querySelectorAll(".et-recents").forEach((x) => x.remove());
        const vals = [...el.querySelectorAll("input, textarea")].map((e) => e.value).filter(Boolean).join(" ");
        return `${c.textContent} ${vals}`.replace(/\s+/g, " ");
      };
      // a graph window DRAWS on a canvas: what it shows is its scene's boxes
      const rows = [...document.querySelectorAll(".tile-area")].filter((a) => a.offsetWidth > 0)
        .map((a) => ({ ws, where: a.dataset.win, text: said(a),
                       boxes: window.__EM_DRAG__.winScene(a.dataset.win)?.boxes.length ?? 0 }));
      rows.push({ ws, where: "name-strip", text: said(document.getElementById("name-strip")) },
                { ws, where: "statusbar", text: said(document.getElementById("statusbar")) });
      return rows;
    }, ws));
  }
  return out;
}
/** The words of the document in front that the empty app never says: its
 *  title, «N nodes», the names of its units, the warnings pill's count. */
async function wordsOfTheDocument(p) {
  return p.evaluate(() => {
    const d = JSON.parse(window.__EM_DRAG__.graphJson());
    const units = (d?.nodes ?? []).map((n) => String(n.name ?? "")).filter((x) => x.length >= 5);
    return { title: document.getElementById("ns-title")?.textContent ?? "",
             nodes: `${window.__EM_DRAG__.nodeCount()} nodes`,
             pill: document.getElementById("footer-warnings")?.textContent ?? "",
             units: [...new Set(units)].slice(0, 40) };
  });
}
function leftoversOf(says, words, baseline) {
  const all = [words.title, words.nodes, words.pill, ...words.units]
    .filter((w) => w && !baseline.some((b) => b.text.includes(w)));
  const found = [];
  for (const row of says) for (const w of all) if (row.text.includes(w)) found.push(`${row.ws}/${row.where}: «${w}»`);
  for (const row of says) if (row.boxes) found.push(`${row.ws}/${row.where}: ${row.boxes} boxes drawn`);
  return { checked: all.length, found };
}

// T2 · the sheet chosen in a Tabular window is the sheet it SHOWS — in the three
// spaces that have one, on arrival and after «↺» (which re-makes the windows of
// a space under the same ids: the surface stayed on the old window object and
// went on drawing its sheet while the header followed the menu)
test("TT2.sheets", "MICRO T2 · Tabular: ogni foglio scelto dal menu mostra il SUO contenuto (Warnings → Units → Documents → Warnings e ritorno), nelle finestre Tabular di Stratigrafia, Fonti e Spazio, all'arrivo e dopo «↺»", async () => {
  const { p, ctx, errors } = await open({ doc: "TempluMare", locale: "en" });
  p.on("dialog", (d) => d.accept());
  const read = (win) => p.evaluate((w) => {
    const a = document.querySelector(`.tile-area[data-win="${w}"]`);
    const body = a?.querySelector(".tile-tablebody");
    return { head: a?.querySelector(".win-mode .dd-toggle")?.textContent.replace("▾", "").trim() ?? "",
             issues: !!body?.querySelector("[data-issues-tab]"),
             th: [...(body?.querySelectorAll("thead th") ?? [])].map((x) => x.textContent.trim()).filter(Boolean).slice(0, 2).join("|") };
  }, win);
  // what each sheet's OWN content looks like (the first two column heads)
  const own = { Warnings: (r) => r.issues && r.th === "Severity|Rule",
                Units: (r) => !r.issues && r.th === "ID|Type",
                Documents: (r) => !r.issues && r.th === "ID|Filename" };
  const pick = async (win, label) => {
    await p.click(`.tile-area[data-win="${win}"] .win-mode .dd-toggle`);
    await p.waitForTimeout(200);
    await p.locator(`.tile-area[data-win="${win}"] .win-mode .dd-menu button`, { hasText: label }).first().click();
    await p.waitForTimeout(400);
  };
  const tour = ["Warnings", "Units", "Documents", "Warnings", "Documents", "Units", "Warnings"];
  const wrong = [];
  let steps = 0;
  const walk = async (ws, when) => {
    const win = await p.evaluate(() => window.__EM_DRAG__.wins().find((x) => x.type === "table")?.id);
    if (!win) { wrong.push(`${ws}/${when}: no Tabular`); return; }
    for (const sheet of tour) {
      await pick(win, sheet);
      const r = await read(win);
      steps++;
      if (r.head !== sheet || !own[sheet](r)) wrong.push(`${ws}/${when}: ${sheet} → ${JSON.stringify(r)}`);
    }
  };
  for (const ws of ["canvas", "provenance", "space"]) {
    await workspace(p, ws);
    await walk(ws, "arrival");
    // reshape the space (a graph window to DTC), then «↺» puts it back
    const g = await p.evaluate(() => window.__EM_DRAG__.wins().find((x) => x.type === "graph")?.id);
    await p.locator(`.tile-area[data-win="${g}"] button`, { hasText: /^DTC$/ }).first().click();
    await p.waitForTimeout(400);
    const reset = p.locator(`#workspace-bar .ws-tab[data-ws="${ws}"] .ws-reset`);
    if (!(await reset.count())) { wrong.push(`${ws}: no ↺ after the reshape`); continue; }
    await reset.click();
    await p.waitForTimeout(700);
    await walk(ws, "after ↺");
  }
  await p.screenshot({ path: SHOT("tt2-tabular-dopo-reset") }).catch(() => {});
  await ctx.close();
  return { pass: steps === 42 && !wrong.length && !errors.length, detail: { steps, wrong: wrong.slice(0, 6), errors } };
});

// T1 · leaving the host empties EVERY window: here the Sidecar, with a Blender
// that is a WebSocket of this check (the room is TT1.live, on the node)
test("TT1.sidecar", "MICRO T1 · Con Blender: arriva il grafo, poi «On this computer» — dopo l'uscita nessuna finestra di nessuno spazio, né la testata, né la barra di stato, né la pillola degli avvisi mostra dati del grafo di Blender, e l'EMTree non lo tiene", async () => {
  const port = 8899;
  const doc = fixture("TempluMare");
  doc.graph.name = "TempluMareDaBlender";
  const host = { tool: "Blender", file: "TempluMare.blend" };
  const { p, ctx, errors } = await open({ doc: null, locale: "en",
    init: { "emstudio.settings": JSON.stringify({ sync: { protocol: "ws", host: "localhost", port } }) },
    wsRoute: { pattern: new RegExp(`localhost:${port}`), handler: (ws) => {
      ws.onMessage((m) => {
        const msg = JSON.parse(String(m));
        if (msg.type === "request_snapshot") ws.send(JSON.stringify({ v: 2, type: "snapshot", source: "emtools", payload: { doc, host } }));
      });
    } } });
  const baseline = await everyWindowSays(p);
  await workspace(p, "canvas");
  await p.click("#mode-indicator");   // MICRO-DOVE-CHI-MENU p.3 · «Mode» left the bar
  await p.click('#conn-pop .conn-mode[data-mode="sidecar"]');
  await p.waitForFunction(() => window.__EM_DRAG__.nodeCount() > 0, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  for (const ws of SPACES) await workspace(p, ws);   // every space mounted on the graph
  await workspace(p, "canvas");
  const words = await wordsOfTheDocument(p);
  const before = leftoversOf(await everyWindowSays(p), words, baseline);
  await workspace(p, "canvas");
  await p.click("#mode-indicator");   // MICRO-DOVE-CHI-MENU p.3 · «Mode» left the bar
  await p.click('#conn-pop .conn-mode[data-mode="standalone"]');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: SHOT("tt1-sidecar-dopo-uscita") }).catch(() => {});
  const after = leftoversOf(await everyWindowSays(p), words, baseline);
  const slots = await p.evaluate(() => window.__EM_DRAG__.slots());
  await ctx.close();
  return { pass: words.units.length > 10 && before.found.length > 0 && after.checked > 10 && !after.found.length
      && slots.length === 0 && !errors.length,
    detail: { words: { title: words.title, nodes: words.nodes, pill: words.pill, units: words.units.length },
              inside: before.found.length, after, slots, errors } };
});

if (K_NODE) test("TT1.live", "MICRO T1 dal vivo · utente dev in una stanza del nodo (LEAVE_ROOM, di base templu-mare-prova-claude), «Leave the room» dal pannello: nessuna finestra di nessuno spazio, né la testata, né la barra di stato, né la pillola mostra dati della stanza; l'EMTree non tiene il suo file", async () => {
  const room = process.env.LEAVE_ROOM ?? "templu-mare-prova-claude";
  const { p, ctx, errors } = await open({ doc: null, locale: "en",
    init: { "emstudio.settings": JSON.stringify({ sync: { hubUrl: K_NODE, hubRoom: room } }) } });
  const baseline = await everyWindowSays(p);
  await workspace(p, "canvas");
  await p.evaluate(([u, r, tk]) => window.__EM_DRAG__.joinRoom(u, r, tk), [K_NODE, room, kToken("dev")]);
  await p.waitForFunction(() => window.__EM_DRAG__.nodeCount() > 0, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  for (const ws of SPACES) await workspace(p, ws);
  await workspace(p, "canvas");
  const words = await wordsOfTheDocument(p);
  const before = leftoversOf(await everyWindowSays(p), words, baseline);
  await workspace(p, "canvas");
  await p.click("#mode-indicator");
  await p.waitForTimeout(500);
  await p.locator("#conn-pop button", { hasText: "Leave the room" }).first().click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: SHOT("tt1-stanza-dopo-uscita") }).catch(() => {});
  const after = leftoversOf(await everyWindowSays(p), words, baseline);
  const files = await p.evaluate(() => window.__EM_DRAG__.slots());
  await ctx.close();
  return { pass: words.units.length > 10 && before.found.length > 0 && after.checked > 10 && !after.found.length
      && files.length === 0 && !errors.length,
    detail: { room, words: { title: words.title, nodes: words.nodes, pill: words.pill, units: words.units.length },
              inside: before.found.length, after, files, errors } };
});

// ── MICRO-DOVE-CHI-MENU (19 ott 2026) · un posto per ogni cosa ─────────────
test("DC1.menu", "DOVE-CHI-MENU p.1 · il File della pagina viene dalla tabella: Nuovo, Apri…, Apri recenti ▸, Apri al posto…, Chiudi, Salva…, Importa ▸, Esporta ▸, Integra, Crea una stanza, Porta in una nuova stanza; Impostazioni non è più in Modifica ma nell'Aiuto (web)", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "it" });
  const file = await p.evaluate(() => [...document.querySelectorAll("#dd-file .dd-menu > *")].map((e) =>
    e.classList.contains("dd-sep") ? "—" : e.dataset.cmd ?? e.dataset.sub));
  const edit = await p.evaluate(() => [...document.querySelectorAll("#dd-edit .dd-menu > button")].map((e) => e.dataset.cmd));
  const help = await p.evaluate(() => [...document.querySelectorAll("#dd-help .dd-menu > button")].map((e) => e.dataset.cmd));
  const labels = await p.evaluate(() => [...document.querySelectorAll("#dd-file .dd-menu > button .dd-label-text")].map((e) => e.textContent));
  await ctx.close();
  const want = ["new", "open", "openRecent", "openReplace", "close", "—", "save", "saveAs", "saveAll", "pin", "—",
    "import", "export", "integrate", "relocate", "collect", "—", "createRoom", "bringIntoRoom"];
  return { pass: JSON.stringify(file) === JSON.stringify(want) && JSON.stringify(edit) === JSON.stringify(["undo", "redo"])
      && help.includes("settingsHelp") && help.includes("aboutHelp") && !help.includes("updatesHelp")
      && labels[0] === "Nuovo" && labels.includes("Chiudi") && !errors.length,
    detail: { file, edit, help, labels, errors } };
});

test("DC2.recent", "DOVE-CHI-MENU p.2 · Apri recenti dallo Spazio: la stanza (nodo · stanza), il file (cartella), quello trascinato (non riapribile), «Svuota l'elenco»; svuotato, anche il pannello di Stratigrafia è vuoto (una sorgente)", async () => {
  const recents = [
    { kind: "room", path: null, name: "Foro", node: "https://em.localhost:8443/em", room: "sarmitest-16102026", ts: 3 },
    { path: "/Users/ed/Scavi/sarmi.emj", name: "sarmi.emj", ts: 2 },
    { path: null, name: "trascinato.emj", ts: 1 }];
  const { p, ctx, errors } = await open({ doc: null, locale: "it", init: { "em.recentFiles": JSON.stringify(recents) } });
  await p.locator("#workspace-bar .ws-tab", { hasText: /Spazio|Space/ }).first().click().catch(() => {});
  await p.waitForTimeout(600);
  await p.click("#dd-file .dd-toggle");
  await p.click('#dd-file [data-sub="openRecent"] .dd-sub-toggle');
  await p.waitForTimeout(200);
  const items = await p.evaluate(() => [...document.querySelectorAll('#dd-file [data-sub="openRecent"] .dd-sub-menu > *')].map((e) =>
    e.classList.contains("dd-sep") ? "—" : `${e.querySelector(".dd-label-text")?.textContent}|${e.querySelector(".dd-detail")?.textContent ?? ""}|${e.disabled ? "off" : "on"}`));
  await p.screenshot({ path: SHOT("dc2-apri-recenti-spazio"), clip: { x: 0, y: 0, width: 900, height: 420 } }).catch(() => {});
  await p.locator('#dd-file [data-sub="openRecent"] [data-dyn="clear"]').click();
  await p.waitForTimeout(200);
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem("em.recentFiles") ?? "[]").length);
  await ctx.close();
  return { pass: items[0] === "Stanza Foro|em.localhost:8443 · sarmitest-16102026|on" && items[1] === "sarmi.emj|/Users/ed/Scavi|on"
      && /^trascinato\.emj\|.+\|off$/.test(items[2]) && items[3] === "—" && /^Svuota l'elenco/.test(items[4]) && after === 0 && !errors.length,
    detail: { items, after, errors } };
});

test("DC3.where", "DOVE-CHI-MENU p.3 · niente «Mode» in alto; ⇧⌘L apre «Dove sei»: Modo · App sincronizzate · Nodi e stanze; un nodo che non risponde lo dice in una riga con «Riprova», mai «Load failed»", async () => {
  const { p, ctx, errors } = await open({ doc: null, locale: "it",
    init: { "emstudio.settings": JSON.stringify({ sync: { hubUrl: "https://nodo.irraggiungibile.invalid/em", nodes: ["https://nodo.irraggiungibile.invalid/em"] } }) } });
  const mode = await p.evaluate(() => !!document.getElementById("dd-mode"));
  await p.keyboard.press("Shift+Meta+L");
  await p.waitForFunction(() => document.querySelector("#conn-pop .conn-node.on")?.dataset.reach === "unreachable", null, { timeout: 12000 }).catch(() => {});
  const panel = await p.evaluate(() => ({ sects: [...document.querySelectorAll("#conn-pop > .conn-sect")].map((s) => s.dataset.sect),
    text: document.getElementById("conn-pop")?.textContent ?? "",
    retry: !!document.querySelector('#conn-pop [data-err="unreachable"] [data-act="retry-node"]'),
    label: document.querySelector("#mode-indicator")?.textContent }));
  await p.screenshot({ path: SHOT("dc3-dove-sei-nodo-irraggiungibile") }).catch(() => {});
  await ctx.close();
  return { pass: !mode && JSON.stringify(panel.sects) === JSON.stringify(["mode", "apps", "nodes"]) && panel.retry
      && /non risponde/.test(panel.text) && !/Load failed|Failed to fetch/.test(panel.text) && panel.label === "Sul computer" && !errors.length,
    detail: { mode, panel: { ...panel, text: panel.text.slice(0, 300) }, errors } };
});

test("DC4.who", "DOVE-CHI-MENU p.4 · «Chi sei» a destra della barra: dichiarato = bordo tratteggiato, verificato = pieno, accreditato = pieno + segno del nodo; il tooltip dice nome · iD, lo stato e la legenda; il pannello ha UN pulsante «Verifica con ORCID», niente «Sign in to the node»", async () => {
  const ID = "0000-0003-1111-1112";
  const base = { orcid: ID, name: "Editor", surname: "Uno" };
  const seen = {};
  for (const [k, me] of Object.entries({ declared: { ...base, verified: false },
    verified: { ...base, verified: true, verifiedBy: "orcid.org", authMode: "orcid" },
    accredited: { ...base, verified: true, verifiedBy: "nodo.test", authMode: "orcid", accredited: true, attestedBy: "nodo.test" } })) {
    const { p, ctx, errors } = await open({ doc: null, locale: "it", init: { "emstudio.identities": JSON.stringify({ current: ID, known: [me] }) } });
    seen[k] = await p.evaluate(() => { const c = document.getElementById("footer-identity");
      return { state: c.dataset.identityState, border: getComputedStyle(c).borderTopStyle, mark: !!c.querySelector(".id-node-mark"),
        title: c.title, last: [...document.querySelectorAll("#statusbar .sb-zone")].pop()?.dataset.zone, errors: 0 }; });
    if (k === "declared") {
      await p.click("#footer-identity");
      await p.waitForTimeout(600);
      seen.panel = await p.evaluate(() => ({ buttons: [...document.querySelectorAll(".idpanel button")].map((b) => b.textContent) }));
    }
    seen[k].errors = errors.length;
    await ctx.close();
  }
  const d = seen.declared, v = seen.verified, a = seen.accredited;
  const verifyButtons = seen.panel.buttons.filter((b) => /Verifica con ORCID|Conferma con ORCID|Confirm with ORCID/.test(b));
  return { pass: d.state === "declared" && d.border === "dashed" && !d.mark && v.state === "verified" && v.border === "solid" && !v.mark
      && a.state === "accredited" && a.border === "solid" && a.mark && d.last === "who"
      && d.title.startsWith(`Editor Uno · ${ID}`) && /tratteggiato/.test(d.title) && /pieno/.test(d.title)
      && verifyButtons.length === 1 && !seen.panel.buttons.some((b) => /Sign in to the node|Entra nel nodo/.test(b))
      && !d.errors && !v.errors && !a.errors,
    detail: { seen } };
});

test("DC5.settings", "DOVE-CHI-MENU p.5 · Impostazioni per argomento: Generale · Identità · Connessioni · Visualizzatori · Avanzate; le impostazioni della dev.50 (nodo, stanza, Blender, client ORCID) arrivano al posto nuovo; Connessioni elenca il nodo (Prova, Rimuovi) senza Accedi né Stanza; il client ORCID in «Avanzate» chiuso; Salva non perde niente", async () => {
  const old = { identity: { orcidClientId: "APP-SANDBOX0001", orcidBase: "https://sandbox.orcid.org" },
    sync: { protocol: "ws", host: "192.168.1.5", port: 8790, tool: "blender", direction: "receive",
            hubUrl: "https://em.localhost:8443/em", hubRoom: "sarmitest-16102026" } };
  const { p, ctx, errors } = await open({ doc: null, locale: "it", init: { "emstudio.settings": JSON.stringify(old) } });
  await p.keyboard.press("Meta+,");   // the table's shortcut (Help ▸ Settings on the web)
  await p.waitForTimeout(400);
  await p.locator("#settings-tabs button", { hasText: "Identità" }).click();
  await p.waitForTimeout(300);
  const tabs = await p.evaluate(() => [...document.querySelectorAll("#settings-tabs button")].map((b) => b.textContent));
  const ident = await p.evaluate(() => ({ advOpen: document.getElementById("set-orcid-adv")?.open,
    client: document.getElementById("set-orcid-client")?.value, base: document.getElementById("set-orcid-base")?.value }));
  await p.screenshot({ path: SHOT("dc5-impostazioni-identita") }).catch(() => {});
  await p.locator("#settings-tabs button", { hasText: "Connessioni" }).click();
  await p.waitForTimeout(300);
  const conn = await p.evaluate(() => ({ nodes: [...document.querySelectorAll("#set-nodes li[data-node]")].map((li) => li.dataset.node),
    acts: [...document.querySelectorAll("#set-nodes li[data-node] button")].map((b) => b.textContent),
    room: !!document.getElementById("set-hub-room"), signin: !!document.getElementById("set-node-signin"),
    host: document.getElementById("set-sync-host")?.value, port: document.getElementById("set-sync-port")?.value }));
  await p.screenshot({ path: SHOT("dc5-impostazioni-connessioni") }).catch(() => {});
  await p.click("#settings-save");
  await p.waitForTimeout(300);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("emstudio.settings")));
  await ctx.close();
  return { pass: JSON.stringify(tabs) === JSON.stringify(["Generale", "Identità", "Connessioni", "Visualizzatori", "Avanzate"])
      && ident.advOpen === false && ident.client === "APP-SANDBOX0001" && ident.base === "https://sandbox.orcid.org"
      && JSON.stringify(conn.nodes) === JSON.stringify(["https://em.localhost:8443/em"]) && conn.acts.join("|") === "Prova|Rimuovi"
      && !conn.room && !conn.signin && conn.host === "192.168.1.5" && conn.port === "8790"
      && saved.sync.hubUrl === "https://em.localhost:8443/em" && saved.sync.hubRoom === "sarmitest-16102026"
      && JSON.stringify(saved.sync.nodes) === JSON.stringify(["https://em.localhost:8443/em"]) && saved.sync.port === 8790
      && saved.identity.orcidClientId === "APP-SANDBOX0001" && !errors.length,
    detail: { tabs, ident, conn, saved: saved.sync, errors } };
});

test("DC6.num", "DOVE-CHI-MENU p.6 · il campo numerico di Blender, con eventi sintetici: trascinare (1 cm/px), Maiusc fine, Ctrl a scatti, Esc annulla, clic per scrivere (Invio conferma, Esc annulla), ⌘C/⌘V e Backspace col mouse sopra, trascinare in giù su X·Y·Z li prende insieme; UN commit per gesto; nel pannello N il cursore 3D usa lo stesso campo", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "it" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await p.evaluate(async () => {
    const m = await import("/em/studio/src/num-field.ts");
    const box = document.createElement("div");
    box.id = "dc6";
    Object.assign(box.style, { position: "fixed", left: "200px", top: "200px", zIndex: 99999, background: "#fff", padding: "8px",
      display: "grid", gridTemplateColumns: "120px", gap: "4px" });
    window.__dc6 = { commits: [] };
    const g = new m.NumGroup((ch) => window.__dc6.commits.push(ch.map((c) => `${c.field}=${c.value}`).join(",")));
    for (const a of ["x", "y", "z"]) box.appendChild(m.numField({ value: 1, decimals: 3, unit: "m", defaultValue: 0, field: `p.${a}`, group: g, column: "p" }));
    box.appendChild(m.numField({ value: 10, decimals: 3, unit: "deg", defaultValue: 0, field: "r", commit: (v) => window.__dc6.commits.push(`r=${v}`) }));
    document.body.appendChild(box);
  });
  const c = async (f) => { const b = await p.locator(`#dc6 [data-field="${f}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const val = (f) => p.locator(`#dc6 [data-field="${f}"]`).inputValue();
  const commits = () => p.evaluate(() => window.__dc6.commits.slice());
  const drag = async (f, dx, steps = 10) => { const a = await c(f); await p.mouse.move(a.x, a.y); await p.mouse.down();
    for (let i = 1; i <= steps; i++) await p.mouse.move(a.x + (dx * i) / steps, a.y); await p.mouse.up(); await p.waitForTimeout(50); };
  const r = {};
  await drag("p.x", 50);                                   // 50 px × 1 cm
  r.drag = [await val("p.x"), (await commits()).length];
  await p.keyboard.down("Shift"); await drag("p.x", 50); await p.keyboard.up("Shift");   // fine: 50 × 1 mm
  r.shift = await val("p.x");
  await p.keyboard.down("Control"); await drag("r", 40); await p.keyboard.up("Control");  // 10° + 40° → notches of 5°
  r.ctrl = await val("r");
  { const a = await c("p.y"); await p.mouse.move(a.x, a.y); await p.mouse.down(); for (let i = 1; i <= 8; i++) await p.mouse.move(a.x + i * 8, a.y);
    await p.keyboard.press("Escape"); await p.mouse.up(); r.esc = [await val("p.y"), (await commits()).length]; }
  // a click types: Enter confirms, Esc cancels
  await p.click('#dc6 [data-field="p.z"]'); await p.keyboard.type("2,5"); await p.keyboard.press("Enter");   // the click selected the value
  r.typed = await val("p.z");
  await p.click('#dc6 [data-field="p.z"]'); await p.keyboard.press("End"); await p.keyboard.type("x"); await p.keyboard.press("Enter");
  r.typedBad = await val("p.z");   // not a number: the value comes back
  await p.click('#dc6 [data-field="p.z"]'); await p.keyboard.type("999"); await p.keyboard.press("Escape");
  r.typedEsc = await val("p.z");
  // over a field: ⌘C on X, ⌘V on Y, Backspace on Z
  await p.mouse.move(...Object.values(await c("p.x"))); await p.keyboard.press("Meta+c");
  await p.mouse.move(...Object.values(await c("p.y"))); await p.keyboard.press("Meta+v"); await p.waitForTimeout(150);
  r.paste = [await val("p.x"), await val("p.y")];
  await p.mouse.move(...Object.values(await c("p.z"))); await p.keyboard.press("Backspace"); await p.waitForTimeout(50);
  r.back = await val("p.z");
  // down over X, Y, Z, then sideways: the three together, ONE commit
  const n0 = (await commits()).length;
  { const a = await c("p.x"), z = await c("p.z"); await p.mouse.move(a.x, a.y); await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(a.x, a.y + ((z.y - a.y) * i) / 8);
    for (let i = 1; i <= 10; i++) await p.mouse.move(a.x + i * 3, z.y); await p.mouse.up(); await p.waitForTimeout(50); }
  const all = await commits();
  r.column = { n: all.length - n0, last: all.at(-1), vals: [await val("p.x"), await val("p.y"), await val("p.z")] };
  r.commits = all;
  // the N panel's 3D cursor is the same field
  await workspace(p, "space");
  await p.waitForTimeout(1200);
  if (!await p.$('.scn-npanel:not(.hidden) [data-field^="cursor."]')) { await p.click(".scn-ntab").catch(() => {}); await p.waitForTimeout(600); }
  r.npanel = await p.evaluate(() => [...document.querySelectorAll('.scn-npanel [data-field^="cursor."]')].map((i) => `${i.dataset.field}:${i.classList.contains("num-field")}`));
  await p.screenshot({ path: SHOT("dc6-campo-numerico") }).catch(() => {});
  await ctx.close();
  const pass = r.drag[0] === "1.500" && r.drag[1] === 1 && r.shift === "1.550" && r.ctrl === "50.000"
    && r.esc[0] === "1.000" && r.esc[1] === r.drag[1] + 2   // the Esc'd drag wrote nothing (shift + ctrl wrote one each)
    && r.typed === "2.500" && r.typedBad === "2.500" && r.typedEsc === "2.500" && r.paste[0] === "1.550" && r.paste[1] === "1.550" && r.back === "0.000"
    && r.column.n === 1 && /p\.x=.*p\.y=.*p\.z=/.test(r.column.last ?? "")
    && r.npanel.length >= 6 && r.npanel.every((x) => x.endsWith(":true")) && !errors.length;
  return { pass, detail: { r, errors } };
});

test("DC7.updates", "DOVE-CHI-MENU p.7 · «Controlla aggiornamenti…» chiede a GitHub (ExtendedMatrix/EMStudio) l'ultima release del canale: più nuova → «È uscita la …» con Scarica (e Installa e riavvia se c'è latest.json); uguale → «Hai l'ultima versione»; senza rete → lo dice, con Riprova", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "it" });
  const installed = await p.evaluate(() => document.querySelector("#btn-version, [data-version]")?.textContent ?? "");
  let answer = { status: 200, body: [] };
  const asked = [];
  await p.route("https://api.github.com/**", (route) => {
    asked.push(route.request().url());
    if (answer.abort) return route.abort("internetdisconnected");
    return route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
  });
  const run = async () => {
    await p.evaluate(() => document.getElementById("btn-help-updates")?.click());
    await p.waitForFunction(() => document.getElementById("help-pop")?.dataset.updates !== "checking", null, { timeout: 5000 }).catch(() => {});
    return p.evaluate(() => { const pop = document.getElementById("help-pop");
      return { kind: pop?.dataset.updates ?? null, text: pop?.innerText ?? "", acts: [...(pop?.querySelectorAll("[data-act]") ?? [])].map((b) => b.dataset.act) }; });
  };
  const r = {};
  answer = { status: 200, body: [
    { tag_name: "v99.0.0-dev.1", html_url: "https://github.com/ExtendedMatrix/EMStudio/releases/tag/v99.0.0-dev.1", draft: false, prerelease: true, assets: [{ name: "latest.json" }] },
    { tag_name: "v99.0.0", html_url: "https://github.com/ExtendedMatrix/EMStudio/releases/tag/v99.0.0", draft: true, prerelease: false, assets: [] },
    { tag_name: "v99.0.0-dev.0", html_url: "x", draft: false, prerelease: true, assets: [] } ] };
  r.newer = await run();
  await p.screenshot({ path: SHOT("dc7-aggiornamenti-nuova") }).catch(() => {});
  answer = { status: 200, body: [{ tag_name: "v0.0.1", html_url: "x", draft: false, prerelease: false, assets: [] }] };
  r.current = await run();
  await p.screenshot({ path: SHOT("dc7-aggiornamenti-ultima") }).catch(() => {});
  answer = { abort: true };
  r.offline = await run();
  await p.screenshot({ path: SHOT("dc7-aggiornamenti-senza-rete") }).catch(() => {});
  await ctx.close();
  const pass = r.newer.kind === "newer" && /99\.0\.0-dev\.1/.test(r.newer.text) && r.newer.acts.join() === "get-release,install"
    && r.current.kind === "current" && /ultima versione/.test(r.current.text) && !r.current.acts.length
    && r.offline.kind === "offline" && r.offline.acts.join() === "retry,releases"
    && asked.length === 3 && asked.every((u) => u.startsWith("https://api.github.com/repos/ExtendedMatrix/EMStudio/releases"))
    && !errors.filter((e) => !/internetdisconnected|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)).length;
  return { pass, detail: { installed, r, asked, errors } };
});

// ── MICRO-PULIZIA-INTERFACCIA (20 ott 2026) ─────────────────────────────────
test("PU1.strip", "PULIZIA p.1 · barra del nome: niente «em.json»; un pallino accanto al nome quando ci sono modifiche (tooltip «Modifiche non salvate · ⌘S»), il pallino salva e il salvataggio lo dice; «Pubblica…» grigio con il perché; «Progetto vN» senza impronta, l'impronta nel tooltip", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "it" });
  const st = () => p.evaluate(() => { const d = document.getElementById("dirty-dot"), v = document.getElementById("project-version"), pub = document.getElementById("ns-publish");
    return { save: !!document.getElementById("ns-save"), dot: !!d && !d.classList.contains("hidden"), tip: d?.title ?? "", aria: d?.getAttribute("aria-label") ?? "",
      inStrip: !!d?.closest("#name-strip"), pub: pub?.getAttribute("aria-disabled"), pubTip: pub?.title ?? "", ver: v?.textContent ?? "", verTip: v?.title ?? "" }; });
  const r0 = await st();
  const prop = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.find((n) => n.node_type === "property")?.id);
  await p.evaluate((id) => window.__EM_DRAG__.setValue(id, "pu1"), prop);
  await p.waitForTimeout(300);
  const r1 = await st();
  const dl = p.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await p.click("#dirty-dot");
  const file = (await dl)?.suggestedFilename() ?? null;
  await p.waitForTimeout(300);
  const r2 = await st();
  const toast = await p.evaluate(() => document.getElementById("toast").innerText);
  await ctx.close();
  const pass = !r0.save && r1.dot && r1.inStrip && /Modifiche non salvate · (⌘S|Ctrl\+S)/.test(r1.tip) && r1.aria === r1.tip
    && !!file && !r2.dot && /^Salvato: /.test(toast)
    && r0.pub === "true" && /fase 2/.test(r0.pubTip)
    && (!r2.ver || (/^Progetto v\d+$/.test(r2.ver) && /sha256:/.test(r2.verTip) && /Fissa versione/.test(r2.verTip)))
    && !errors.length;
  return { pass, detail: { r0, r1, r2, file, toast, errors } };
});

test("PU2.emtree", "PULIZIA p.2 · pannello dei file e dei grafi: niente testo introduttivo (è un «?» nella testata), niente Nuovo/Apri/Recenti; i file aperti con i loro grafi, l'attivo evidenziato; il triangolino solo dove il pannello è impilato su un altro; file ausiliari con un «?»", async () => {
  const { p, ctx, errors } = await open({ doc: "TempluMare", locale: "it" });
  const look = (win) => p.evaluate((win) => {
    const a = document.querySelector(`.tile-area[data-win="${win}"]`);
    const bar = a?.querySelector(".tile-bar");
    return { compress: !!bar?.querySelector(".win-act[title^='Comprimi'], .win-act[title^='Espandi']"),
      help: bar?.querySelector(".win-help")?.title ?? "", helpAria: bar?.querySelector(".win-help")?.getAttribute("aria-label") ?? "",
      intro: !!a?.querySelector(".et-intro"), actions: !!a?.querySelector('[data-et="et-new"], [data-et="et-open"]'), recents: !!a?.querySelector(".et-recents"),
      files: a?.querySelectorAll(".et-file").length ?? 0, slots: a?.querySelectorAll(".et-file .et-slot").length ?? 0,
      active: a?.querySelectorAll(".et-slot.active").length ?? 0, move: a?.querySelectorAll(".et-move").length ?? 0,
      auxQ: a?.querySelector(".aux-sect-head .et-q")?.title ?? "", todo: !!a?.querySelector(".et-todo") };
  }, win);
  const stacked = await look("canvas:graphs");
  // the Inspector is alone in its column: turned into the EMtree it has no triangle
  await p.click('.tile-area[data-win="canvas:inspector"] .win-type-toggle');
  await p.click('.tile-area[data-win="canvas:inspector"] .dd-menu [data-wt="emtree"]');
  await p.waitForTimeout(500);
  const aloneWin = await p.evaluate(() => [...document.querySelectorAll(".tile-area")].find((a) => a.dataset.surfaceType === "emtree" && a.dataset.win !== "canvas:graphs")?.dataset.win);
  const alone = aloneWin ? await look(aloneWin) : null;
  await p.screenshot({ path: SHOT("pu2-pannello-file-grafi") }).catch(() => {});
  await ctx.close();
  const pass = stacked.compress && !!alone && !alone.compress && /ciascuno con i suoi grafi/.test(stacked.help) && stacked.helpAria === stacked.help
    && !stacked.intro && !stacked.actions && !stacked.recents && !stacked.todo
    && stacked.files >= 1 && stacked.slots >= 1 && stacked.active === 1 && stacked.move >= 1 && /VOLATILI/.test(stacked.auxQ) && !errors.length;
  return { pass, detail: { stacked, aloneWin, alone, errors } };
});

test("PU3.views", "PULIZIA p.3 · viste del grafo: niente «Grafo completo»; «Paradati dei grafi» al posto di «Multigrafo» e niente distintivo nella Matrix; il Grafo disegna anche gli HDT-O e l'imbuto ha l'interruttore HDT-O; Monochrome solo dove vale (Matrix); il grafo ha la piastra quadrata", async () => {
  // the fixture with a study (HC9): one HDT-O node for the Graph to draw or hide
  const doc = fixture("TempluMare");
  doc.graph.nodes.push({ id: "pu3-study", node_type: "study", name: "PU3 study", data: { hdto_role: "study" } });
  const { p, ctx, errors } = await open({ doc, locale: "it" });
  const seg = () => p.evaluate(() => [...document.querySelectorAll('.tile-area[data-win="canvas:1"] .tile-bar button')].filter((b) => b.offsetParent && !b.closest(".dd-menu")).map((b) => b.textContent.trim()));
  const mode = (label) => p.evaluate((label) => [...document.querySelectorAll('.tile-area[data-win="canvas:1"] .tile-bar button')].find((b) => b.offsetParent && !b.closest(".dd-menu") && b.textContent.trim() === label)?.click(), label);
  const panel = () => p.evaluate(() => [...document.querySelectorAll("#filter-panel .fp-row")].map((e) => e.textContent.trim()));
  const r = { segs: await seg(), chip: await p.evaluate(() => !!document.querySelector('[data-act="graph-paradata"]')) };
  await p.evaluate(() => document.getElementById("btn-view-props")?.click());
  await p.waitForTimeout(300);
  r.matrixPanel = await panel();
  await p.evaluate(() => document.querySelector("#filter-panel .fp-close")?.click());
  await mode("Grafo");
  await p.waitForTimeout(1500);
  r.on = await p.evaluate(() => window.__EM_SCENE__().nodes.length);
  r.studyOn = await p.evaluate(() => window.__EM_SCENE__().nodes.includes("pu3-study"));
  await p.evaluate(() => document.getElementById("btn-view-props")?.click());
  await p.waitForTimeout(300);
  r.graphPanel = await panel();
  r.hdtoChecked = await p.evaluate(() => document.querySelector('#filter-panel [data-liq="hdto"]')?.checked ?? null);
  await p.click('#filter-panel [data-liq="hdto"]');
  await p.waitForTimeout(1200);
  r.off = await p.evaluate(() => window.__EM_SCENE__().nodes.length);
  r.studyOff = await p.evaluate(() => window.__EM_SCENE__().nodes.includes("pu3-study"));
  await p.click('#filter-panel [data-liq="hdto"]');
  await p.waitForTimeout(800);
  await p.screenshot({ path: SHOT("pu3-filtro-grafo-hdto") }).catch(() => {});
  await p.evaluate(() => document.querySelector("#filter-panel .fp-close")?.click());
  await mode("Paradati dei grafi");
  await p.waitForTimeout(1200);
  // the graph's node: what is selected and clicked is its square glyph
  r.rootBox = await p.evaluate(async () => {
    const sg = await import("/em/studio/src/scene.ts").catch(() => null);
    const sc = window.__EM_DRAG__.winScene("canvas:1");
    const b = sc?.boxes.find((x) => /graphroot$/.test(x.id)) ?? sc?.boxes[0];
    return b ? { w: Math.round(b.w), h: Math.round(b.h), mode: sc.mode, lib: !!sg } : null;
  });
  r.square = await p.evaluate(async () => {
    const sh = await import("/em/studio/src/shape-geom.ts");
    return { draws: sh.drawsAsGlyph("graph"), aspect: sh.glyphAspect("graph") };
  });
  await ctx.close();
  const pass = !r.segs.includes("Grafo completo") && !r.segs.includes("Multigrafo") && r.segs.includes("Paradati dei grafi") && !r.chip
    && r.matrixPanel.some((x) => /Monocromo/.test(x)) && !r.graphPanel.some((x) => /Monocromo/.test(x)) && r.graphPanel.some((x) => /^HDT-O/.test(x))
    && r.hdtoChecked === true && r.on > r.off && r.studyOn && !r.studyOff && r.square.draws === true && r.square.aspect === 1 && !errors.length;
  return { pass, detail: { ...r, errors } };
});

test("PU4.header", "PULIZIA p.4 · testata del grafo: Ricalcola layout è un'icona (senza «Layout»), accanto Compatta le proprietà; niente «+»; Uniforma le grafie in Strumenti; ⇧C adatta come 0; il «⋯» solo dove ha qualcosa (il Grafo: l'algoritmo)", async () => {
  const { p, ctx, errors } = await open({ doc: "TempluMare", locale: "it" });
  const bar = () => p.evaluate(() => {
    const b = document.querySelector('.tile-area[data-win="canvas:1"] .tile-bar');
    const acts = [...b.querySelectorAll(".win-act")].map((x) => ({ act: x.dataset.act ?? null, text: x.textContent.trim(), aria: x.getAttribute("aria-label") ?? "", title: x.title, svg: !!x.querySelector("svg") }));
    return { acts, more: !!b.querySelector(".win-more"), text: b.innerText };
  });
  const matrix = await bar();
  await p.evaluate(() => [...document.querySelectorAll('.tile-area[data-win="canvas:1"] .tile-bar button')].find((b) => b.offsetParent && !b.closest(".dd-menu") && b.textContent.trim() === "Grafo")?.click());
  await p.waitForTimeout(800);
  const graph = await bar();
  await p.evaluate(() => [...document.querySelectorAll('.tile-area[data-win="canvas:1"] .tile-bar button')].find((b) => b.offsetParent && !b.closest(".dd-menu") && b.textContent.trim() === "Matrix")?.click());
  await p.waitForTimeout(800);
  // ⇧C = 0: zoom in, then each key brings the same framing
  const cv = await p.evaluate(() => { const r = document.querySelector('.tile-area[data-win="canvas:1"] canvas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.click(cv.x, cv.y);
  const vpNow = () => p.evaluate(() => { const v = window.__EM_DRAG__.viewNow()?.vp; return v ? JSON.stringify([v.x, v.y, v.scale].map((n) => Math.round(n * 100) / 100)) : null; });
  await p.keyboard.press("0"); await p.waitForTimeout(200);
  const fit0 = await vpNow();
  await p.keyboard.press("+"); await p.keyboard.press("+"); await p.waitForTimeout(200);
  const zoomed = await vpNow();
  await p.keyboard.press("Shift+C"); await p.waitForTimeout(200);
  const fitC = await vpNow();
  const tools = await p.evaluate(() => [...document.querySelectorAll("#dd-tools .dd-menu button")].map((b) => b.id));
  await ctx.close();
  const lay = matrix.acts.find((a) => a.act === "layout"), comp = matrix.acts.find((a) => a.act === "compact-all");
  const pass = !!lay && lay.svg && !lay.text && /Ricalcola layout/.test(lay.aria) && !!comp && comp.svg && /Compatta le proprietà/.test(comp.aria)
    && !matrix.acts.some((a) => a.text === "+") && !/Disponi|Layout\b/.test(matrix.text) && !matrix.more && graph.more
    && tools.includes("btn-tool-uniform") && !!fit0 && zoomed !== fit0 && fitC === fit0 && !errors.length;
  return { pass, detail: { matrix, graphMore: graph.more, fit0, zoomed, fitC, tools, errors } };
});

test("PU5.matrix", "PULIZIA p.5 · la Matrix è disposta su ciò che disegna: layout di vista di em-core (epoche e archi compresi), nessun vuoto orizzontale oltre 120 in una corsia, nessun nodo fuori dalle corsie, corsie alte quanto il contenuto; il layout del documento non cambia", async () => {
  const { p, ctx, errors } = await open({ doc: "TempluMare", locale: "it" });
  const before = await p.evaluate(() => JSON.stringify(JSON.parse(window.__EM_DRAG__.docJson()).layout?.positions ?? JSON.parse(window.__EM_DRAG__.docJson()).graphs));
  await p.waitForFunction(() => !!window.__EM_DRAG__.matrixGeom()?.viewLayout, null, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(300);
  const g = await p.evaluate(() => window.__EM_DRAG__.matrixGeom());
  const after = await p.evaluate(() => JSON.stringify(JSON.parse(window.__EM_DRAG__.docJson()).layout?.positions ?? JSON.parse(window.__EM_DRAG__.docJson()).graphs));
  await ctx.close();
  // GLIFI-OVERLAY p.3 · a continuity node (BR) is drawn by the view above its
  // unit, in its epoch's lane, not where the layout put it: not a gap of the layout
  const top = g.nodes.filter((n) => !n.group && n.type !== "BR");
  const lanes = g.lanes;
  const laneOf = (n) => lanes.findIndex((l) => n.y + n.h / 2 >= l.y && n.y + n.h / 2 < l.y + l.height);
  const outside = g.nodes.filter((n) => !n.group).filter((n) => laneOf(n) < 0).map((n) => n.id);
  const gaps = [];
  const slack = [];
  lanes.forEach((l, i) => {
    const inl = top.filter((n) => laneOf(n) === i);
    const iv = inl.map((n) => [n.x, n.x + n.w]).sort((a, b) => a[0] - b[0]);
    const m = [];
    for (const [a, b] of iv) { if (m.length && a <= m[m.length - 1][1]) m[m.length - 1][1] = Math.max(m[m.length - 1][1], b); else m.push([a, b]); }
    for (let k = 1; k < m.length; k++) if (m[k][0] - m[k - 1][1] > 120) gaps.push(Math.round(m[k][0] - m[k - 1][1]));
    if (inl.length) slack.push(Math.round(l.height - (Math.max(...inl.map((n) => n.y + n.h)) - Math.min(...inl.map((n) => n.y)))));
  });
  const pass = !!g.viewLayout && !outside.length && !gaps.length && slack.every((x) => x <= 120) && before === after && !errors.length;
  return { pass, detail: { view: !!g.viewLayout, outside, gaps, slack, docUnchanged: before === after, errors } };
});

test("PU6.inspector", "PULIZIA p.6 · Inspector: ogni sezione si chiude col triangolo e lo stato si ricorda per tipo di nodo; «Dati» è un triangolo solo; Elimina nodo dopo «Storia di questo nodo»; la ricerca lascia solo ciò che corrisponde e apre la sezione chiusa che lo contiene; «Apri con…» è una riga di icone (aria-disabled + perché nel tooltip); «Interpretazione» porta il glifo dell'estrattore; i pulsanti della proprietà stanno su una riga ciascuno a 280 e 400 px", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", locale: "it" });
  const I = '[data-win$="inspector"]';
  await pick(p, "USM101");
  await p.waitForTimeout(400);
  const order = () => p.evaluate((I) => [...document.querySelector(I).querySelectorAll("h3.insp-sect, .insp-danger-zone")].map((e) => e.classList.contains("insp-danger-zone") ? "DANGER" : (e.dataset.sect ?? e.textContent.replace(/[▾▸]/, "").trim().split(" ·")[0])), I);
  const r = { order: await order() };
  r.toggles = await p.evaluate((I) => [...document.querySelector(I).querySelectorAll("h3.insp-sect")].every((h) => !!h.querySelector("button.insp-sect-toggle[aria-expanded]")), I);
  r.openWith = await p.evaluate((I) => [...document.querySelector(I).querySelectorAll(".insp-openwith [data-openwith]")].map((b) => ({ svg: !!b.querySelector("svg"), aria: b.getAttribute("aria-disabled"), disabled: b.disabled, tip: b.title })), I);
  // close «Connections» on a unit; another unit shows it closed, a property does not
  await p.evaluate((I) => [...document.querySelector(I).querySelectorAll(".insp-sect-toggle")].find((b) => /Connections/.test(b.textContent))?.click(), I);
  const sameType = await p.evaluate(() => { const g = JSON.parse(window.__EM_DRAG__.graphJson()); const t0 = g.nodes.find((n) => n.id === "USM101")?.node_type;
    return g.nodes.find((n) => n.id !== "USM101" && n.node_type === t0)?.id ?? null; });
  if (sameType) await pick(p, sameType);
  await p.waitForTimeout(300);
  r.otherUnitClosed = await p.evaluate((I) => [...document.querySelector(I).querySelectorAll("h3.insp-sect.closed")].map((h) => h.textContent.replace(/[▾▸]/, "").trim()), I);
  // the search opens the closed section holding a match, and hides the rest
  // a word that only the closed «Connections» holds: its first relation's name
  r.word = await p.evaluate((I) => { const h = [...document.querySelector(I).querySelectorAll("h3.insp-sect")].find((x) => /Connections/.test(x.textContent));
    return h?.nextElementSibling?.querySelector(".insp-group-title")?.textContent.replace(/\s*\(\d+\)$/, "") ?? "is after"; }, I);
  await p.fill(`${I} .insp-search-input`, r.word);
  await p.waitForTimeout(200);
  r.search = await p.evaluate((I) => ({ visible: [...document.querySelector(I).querySelectorAll("h3.insp-sect")].filter((h) => h.offsetParent).map((h) => h.textContent.replace(/[▾▸]/, "").trim()),
    opened: document.querySelector(I).querySelectorAll(".insp-sect-body[data-search-open]:not([hidden])").length }), I);
  await p.fill(`${I} .insp-search-input`, "");
  await p.evaluate(() => localStorage.removeItem("emstudio.inspSections"));
  // a property without a reading: «Interpretazione» with the extractor's glyph; the buttons at 280 / 400 px
  const prop = await p.evaluate(() => { const g = JSON.parse(window.__EM_DRAG__.graphJson());
    return g.nodes.find((n) => n.node_type === "property" && !g.edges.some((e) => e.source === n.id && e.edge_type === "has_data_provenance"))?.id ?? null; });
  if (prop) await pick(p, prop);
  await p.waitForTimeout(300);
  r.acts = {};
  for (const w of [280, 400]) {
    await p.evaluate(([I, w]) => { const a = document.querySelector(I); a.style.width = w + "px"; }, [I, w]);
    await p.waitForTimeout(150);
    r.acts[w] = await p.evaluate((I) => [...document.querySelectorAll(`${I} .chain-card-acts .insp-btn`)].map((b) => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), glyph: !!b.querySelector(".chain-glyph svg") })), I);
  }
  await p.screenshot({ path: SHOT("pu6-inspector") }).catch(() => {});
  await ctx.close();
  const hist = r.order.indexOf("history"), dz = r.order.indexOf("DANGER");
  const interp = (r.acts[280] ?? []).find((a) => /Interpretazione/.test(a.t));
  const pass = r.toggles && hist >= 0 && dz === r.order.length - 1 && dz > hist
    && r.openWith.length === 3 && r.openWith.every((x) => x.svg && x.aria === "true" && !x.disabled && / — .{10,}/.test(x.tip))
    && !!sameType && r.otherUnitClosed.some((x) => /Connections/.test(x))
    && r.search.visible.length === 1 && /Connections/.test(r.search.visible[0]) && r.search.opened === 1
    && (!prop || (!!interp && interp.glyph && [280, 400].every((w) => r.acts[w].every((a) => a.h <= 34))))
    && !errors.length;
  return { pass, detail: { ...r, prop, sameType, errors } };
});

test("PU7.residues", "PULIZIA p.7 · il salvataggio toglie il disegno di yEd (shape, fill_color, border_*, symbol, x/y) ma tiene il colore di un'epoca e il bordo di un documento senza certainty_class; «Sposta la data nella sua proprietà»: senza proprietà la crea, uguale toglie la copia, diversa chiede quale tenere; l'Inspector mostra la data solo nella sua sezione", async () => {
  const doc = fixture("catena");
  const g = doc.graph;
  const unit = g.nodes.find((n) => n.id === "USM101");
  unit.data = { ...(unit.data ?? {}), shape: "rectangle", fill_color: "#FFFFFF", border_style: "#9B3333", symbol: "white rectangle", y_pos: 12 };
  const ep = g.nodes.find((n) => n.node_type === "EpochNode");
  if (ep) ep.data = { ...(ep.data ?? {}), fill_color: "#CCFFCC" };
  // three documents: date only in data; same in both; two different years
  const mk = (id, v, prop) => {
    g.nodes.push({ id, name: id, node_type: "document", data: { absolute_time_start: v, border_color: "#000000", border_width: 4 } });
    if (prop != null) {
      g.nodes.push({ id: `${id}-p`, name: "absolute_time_start", node_type: "property", data: { property_type: "absolute_time_start", value: prop } });
      g.edges.push({ id: `${id}-e`, source: id, target: `${id}-p`, edge_type: "has_property" });
    }
  };
  mk("PU7-A", "1870", null); mk("PU7-B", "1900", "1900"); mk("PU7-C", "1950", "1960");
  const { p, ctx, errors } = await open({ doc, locale: "it" });
  const r = {};
  r.issues = await p.evaluate(() => window.__EM_DRAG__.issues().filter((i) => /^PU7-/.test(i.node ?? "")).map((i) => ({ n: i.node, fix: i.fix?.kind, opts: i.fix?.options ?? null })));
  // the Inspector: the date is not a field of «Data»
  await pick(p, "PU7-B");
  r.dataShowsDate = await p.evaluate(() => [...document.querySelectorAll('[data-win$="inspector"] .insp-data dt')].some((d) => d.textContent === "absolute_time_start"));
  r.fixed = await p.evaluate(() => ["PU7-A", "PU7-B"].map((id) => window.__EM_DRAG__.runIssueFix(id, id)).concat(window.__EM_DRAG__.runIssueFix("PU7-C", "PU7-C", "1950")));
  await p.waitForTimeout(300);
  const saved = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.docJson()));
  await ctx.close();
  const gg = saved.graph ?? Object.values(saved.graphs).find((x) => (x.nodes ?? []).some((n) => n.id === "USM101"));
  const node = (id) => gg.nodes.find((n) => n.id === id);
  const prop = (id) => { const e = gg.edges.find((x) => x.source === id && x.edge_type === "has_property"); return e ? node(e.target)?.data?.value : null; };
  r.unit = Object.keys(node("USM101").data ?? {}).filter((k) => ["shape", "fill_color", "border_style", "symbol", "y_pos"].includes(k));
  r.epochFill = ep ? node(ep.id)?.data?.fill_color ?? null : "n/a";
  r.docBorder = node("PU7-A").data?.border_color ?? null;
  r.dates = ["PU7-A", "PU7-B", "PU7-C"].map((id) => ({ id, copy: node(id)?.data?.absolute_time_start ?? null, prop: prop(id) }));
  const byN = Object.fromEntries(r.issues.filter((i) => !!i.fix).map((i) => [i.n, i]));
  const pass = byN["PU7-A"]?.fix === "button" && byN["PU7-B"]?.fix === "button" && byN["PU7-C"]?.fix === "pick" && byN["PU7-C"].opts?.join() === "1960,1950"
    && !r.dataShowsDate && r.fixed.every(Boolean)
    && !r.unit.length && (r.epochFill === "#CCFFCC" || r.epochFill === "n/a") && r.docBorder === "#000000"
    && r.dates.every((d) => d.copy === null) && r.dates.map((d) => d.prop).join() === "1870,1900,1950" && !errors.length;
  return { pass, detail: { ...r, errors } };
});

test("PU8.index", "PULIZIA p.8 · Indice della narrativa: un titolo lungo accanto a un distintivo lungo non va a capo una lettera per riga; il distintivo va sotto o si accorcia con l'ellissi e il nome intero è nel tooltip — largo e a 200 px", async () => {
  const doc = fixture("catena");
  const ep = doc.graph.nodes.find((n) => n.node_type === "EpochNode");
  ep.name = "VAct.01 Foundations of the temple and of its long podium";
  doc.graph.nodes.push({ id: "PU8-N", node_type: "narrative", name: "PU8 story", data: { chapters: [
    { title: "Ricostruzione — Virtual Activity 1: foundations of the building", anchor: ep.id, blocks: [] },
    { title: "Ricostruzione — Virtual Activity 2: colonnade", anchor: ep.id, blocks: [] } ] } });
  const { p, ctx, errors } = await open({ doc, locale: "it", ws: "narrative" });
  await p.waitForTimeout(800);
  const area = await p.evaluate(() => [...document.querySelectorAll(".tile-area")].find((a) => a.dataset.surfaceType === "narrative-index")?.dataset.win ?? null);
  const measure = () => p.evaluate((w) => [...document.querySelectorAll(`.tile-area[data-win="${w}"] .nidx-row`)].map((r) => {
    const t = r.querySelector(".nidx-t"), l = r.querySelector(".nidx-lane"); const lh = parseFloat(getComputedStyle(t).lineHeight) || 16;
    return { tw: Math.round(t.getBoundingClientRect().width), lines: Math.round(t.getBoundingClientRect().height / lh), tip: l?.title ?? null,
             laneInside: l ? l.getBoundingClientRect().right <= r.getBoundingClientRect().right + 1 : true }; }), area);
  const wide = await measure();
  await p.evaluate((a) => { document.querySelector(`.tile-area[data-win="${a}"]`).style.width = "200px"; }, area);
  await p.waitForTimeout(200);
  const narrow = await measure();
  await p.screenshot({ path: SHOT("pu8-indice") }).catch(() => {});
  await ctx.close();
  const ok = (rows) => rows.length === 2 && rows.every((r) => r.tw >= 100 && r.lines <= 5 && r.tip === ep.name && r.laneInside);
  return { pass: !!area && ok(wide) && ok(narrow) && !errors.length, detail: { area, wide, narrow, errors } };
});

test("PU9.tables", "PULIZIA p.9 · le tabelle si ordinano e si filtrano: clic sull'intestazione (crescente, decrescente, ordine della tabella) con aria-sort e freccia; un filtro per colonna (scelta per i valori fissi); «Azzera filtri»; lo stato resta quando la tabella si ridisegna", async () => {
  const { p, ctx, errors } = await open({ doc: "TempluMare", locale: "it" });
  const T = '[data-win="canvas:issues"]';
  await p.waitForSelector(`${T} table[data-tt="1"]`, { timeout: 8000 }).catch(() => {});
  const read = () => p.evaluate((T) => { const tb = document.querySelector(`${T} table[data-tt="1"]`);
    const heads = [...(tb?.tHead?.rows[0]?.cells ?? [])];
    const ci = heads.findIndex((h) => /Nodo/i.test(h.textContent));
    const rows = [...(tb?.tBodies[0]?.rows ?? [])].filter((r) => !r.classList.contains("tt-hidden"));
    return { n: rows.length, total: tb?.tBodies[0]?.rows.length ?? 0, col: rows.map((r) => r.cells[ci]?.textContent.trim() ?? ""),
             aria: heads[ci]?.getAttribute("aria-sort"), arrow: heads[ci]?.querySelector(".tt-arrow")?.textContent ?? "",
             // MICRO-PANNELLI-OVERLAY-TABULAR p.2 · «Clear filters» is the head row's, shown only with a filter set
             clear: ((b) => (b ? String(b.hidden) : null))(document.querySelector(`${T} .fclear`)) }; }, T);
  const r = { start: await read() };
  const click = () => p.evaluate((T) => [...document.querySelectorAll(`${T} th .tt-sort`)].find((b) => /Nodo/i.test(b.textContent))?.click(), T);
  await click(); r.asc = await read();
  await click(); r.desc = await read();
  // a filter with a choice (Gravità): the first value
  const sel = await p.evaluate((T) => { const s = [...document.querySelectorAll(`${T} select.tt-filter`)][0]; return s ? { col: s.dataset.col, v: s.options[1]?.value } : null; }, T);
  if (sel) await p.selectOption(`${T} select.tt-filter[data-col="${sel.col}"]`, sel.v);
  await p.waitForTimeout(150);
  r.filtered = await read();
  // the table is rebuilt by a change: it comes back sorted and filtered
  const prop = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.find((n) => n.node_type === "property")?.id);
  await p.evaluate((id) => window.__EM_DRAG__.setValue(id, "pu9"), prop);
  await p.waitForTimeout(600);
  r.rebuilt = await read();
  await p.click(`${T} .fclear`);
  await p.waitForTimeout(150);
  r.cleared = await read();
  await ctx.close();
  const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  const sorted = (xs, dir) => xs.every((x, i) => i === 0 || !x || !xs[i - 1] || cmp(xs[i - 1], x) * dir <= 0);
  const pass = r.start.total > 3 && r.asc.aria === "ascending" && /▲/.test(r.asc.arrow) && sorted(r.asc.col, 1)
    && r.desc.aria === "descending" && sorted(r.desc.col, -1)
    && !!sel && r.filtered.n < r.filtered.total && r.filtered.clear === "false"
    && r.rebuilt.n === r.filtered.n && r.rebuilt.aria === "descending"
    && r.cleared.n === r.cleared.total && r.cleared.clear === "true" && !errors.length;
  return { pass, detail: { ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v, col: v.col.slice(0, 4) }])), sel, errors } };
});

test("NB1.title", "NARRATIVA-BLOCCHI p.1 · titolo e sottotitolo si scrivono nella pagina (Scrivi), un annulla per gesto; sottotitolo vuoto → «Aggiungi un sottotitolo»; l'Inspector del racconto mostra e scrive lo stesso campo; la riga del modello è informazione", async () => {
  const { p, ctx, errors } = await open({ doc: "PortaMarina-lite", locale: "it" });
  await workspace(p, "narrative");
  await p.waitForTimeout(600);
  const story = () => p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.find((n) => n.node_type === "narrative"));
  const r = { start: (await story()).name };
  const title = p.locator(".nv-head .nv-title").first();
  await title.waitFor({ timeout: 8000 });
  r.editable = await title.getAttribute("contenteditable");
  await title.click();
  await p.evaluate(() => { const t = document.querySelector(".nv-head .nv-title"); const g = document.createRange(); g.selectNodeContents(t); g.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(g); });
  await p.keyboard.type(" NB1");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(400);
  r.typed = (await story()).name;
  await p.evaluate(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(400);
  r.undone = (await story()).name;
  const lede = p.locator(".nv-head .nv-lede").first();
  await lede.click();
  await p.evaluate(() => { const t = document.querySelector(".nv-head .nv-lede"); const g = document.createRange(); g.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(g); });
  await p.keyboard.press("Backspace");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(400);
  r.emptied = (await story()).description ?? "";
  r.placeholder = await p.evaluate(() => { const l = document.querySelector(".nv-head .nv-lede"); return l ? getComputedStyle(l, "::before").content : null; });
  await p.locator(".nv-head .nv-meta").first().click();
  await p.waitForTimeout(400);
  r.meta = await p.evaluate(() => ({ editable: document.querySelector(".nv-head .nv-meta")?.getAttribute("contenteditable"), tip: document.querySelector(".nv-head .nv-meta")?.title }));
  r.inspector = await p.evaluate(() => document.querySelector('[data-nvset="story-title"]')?.value ?? null);
  await p.fill('[data-nvset="story-subtitle"]', "Dal pannello NB1");
  await p.press('[data-nvset="story-subtitle"]', "Enter");
  await p.waitForTimeout(400);
  r.fromInspector = (await story()).description;
  r.pageLede = await p.evaluate(() => document.querySelector(".nv-head .nv-lede")?.textContent);
  await p.screenshot({ path: SHOT("nb1-titolo") }).catch(() => {});
  await ctx.close();
  const pass = r.editable === "true" && r.typed === `${r.start} NB1` && r.undone === r.start && r.emptied === ""
    && /Aggiungi un sottotitolo/.test(r.placeholder ?? "") && r.meta.editable !== "true" && /Calcolato/.test(r.meta.tip ?? "")
    && r.inspector === r.start && r.fromInspector === "Dal pannello NB1" && r.pageLede === "Dal pannello NB1" && !errors.length;
  return { pass, detail: { ...r, errors } };
});

test("NB2.blocks", "NARRATIVA-BLOCCHI p.2/p.3 · lo scheletro di una narrativa nuova mette i tre blocchi che interrogano il grafo (la bibliografia conta i documenti del grafo); l'Inspector di un blocco ne cambia l'ambito, un annulla; in Stampa sono testo con la data", async () => {
  const { p, ctx, errors } = await open({ doc: "TempluMare", locale: "it" });
  await workspace(p, "narrative");
  const go = p.locator('[data-action="scaffold"]').first();
  if (await go.count()) { await go.click(); await p.waitForTimeout(600); }
  const blocks = () => p.evaluate(() => [...document.querySelectorAll(".nv-query")].map((b) => `${b.dataset.query}:${b.dataset.count}`));
  const r = { scaffolded: await blocks() };
  const docs = await p.evaluate(() => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.filter((n) => n.node_type === "document").length);
  r.docs = docs;
  r.offered = await p.locator('[data-nidxact="standard"]').count();
  const bib = p.locator('.nv-query[data-query="bibliography"]').first();
  await bib.scrollIntoViewIfNeeded().catch(() => {});
  await bib.click({ position: { x: 20, y: 8 } }).catch(() => {});
  await p.waitForTimeout(500);
  r.scope = await p.evaluate(() => document.querySelector('[data-nvset="q-scope"]')?.value ?? null);
  await p.selectOption('[data-nvset="q-scope"]', "narrative").catch(() => {});
  await p.waitForTimeout(500);
  r.afterScope = await blocks();
  await p.evaluate(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(500);
  r.afterUndo = await blocks();
  await p.screenshot({ path: SHOT("nb2-blocchi") }).catch(() => {});
  await p.locator('.nv-readings button[data-reading="print"]').first().click();
  await p.waitForTimeout(600);
  r.printed = await p.evaluate(() => [...document.querySelectorAll(".nv-print-prose")].filter((x) => /calcolato il \d{4}-\d{2}-\d{2}/.test(x.textContent)).length);
  await ctx.close();
  const kinds = (xs) => xs.map((x) => x.split(":")[0]).sort().join(",");
  const pass = kinds(r.scaffolded) === "bibliography,heritage,research_history"
    && r.scaffolded.includes(`bibliography:${docs}`) && r.offered === 0 && r.scope === "graph"
    && r.afterScope.some((x) => x.startsWith("bibliography:") && x !== `bibliography:${docs}`)
    && r.afterUndo.includes(`bibliography:${docs}`) && r.printed === 3 && !errors.length;
  return { pass, detail: { ...r, errors } };
});

test("NB3.index", "NARRATIVA-BLOCCHI p.3 · una narrativa esistente non si tocca: l'Indice propone «Blocchi standard» (solo quelli che mancano) e li aggiunge in un annulla", async () => {
  const { p, ctx, errors } = await open({ doc: "PortaMarina-lite", locale: "it" });
  await workspace(p, "narrative");
  await p.waitForTimeout(600);
  const state = () => p.evaluate(() => JSON.stringify(JSON.parse(window.__EM_DRAG__.graphJson()).nodes.find((n) => n.node_type === "narrative").data));
  const before = await state();
  const btn = p.locator('[data-nidxact="standard"]').first();
  const r = { offered: await btn.count(), tip: await btn.getAttribute("title").catch(() => null) };
  await btn.click();
  await p.waitForTimeout(600);
  r.blocks = await p.evaluate(() => [...document.querySelectorAll(".nv-query")].map((b) => b.dataset.query));
  r.offeredAfter = await p.locator('[data-nidxact="standard"]').count();
  await p.evaluate(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(500);
  r.restored = (await state()) === before;
  await ctx.close();
  const pass = r.offered === 1 && /Storia delle ricerche/.test(r.tip ?? "") && r.blocks.length === 3 && r.offeredAfter === 0 && r.restored && !errors.length;
  return { pass, detail: { ...r, errors } };
});

// ── MICRO-VIEWER-UNICO · one Viewer per document and resource ───────────────
// VU1–VU3 need the Templu Mare v3.3 (a copy: `VIEWER_V33`) and a bridge that
// serves its folder (`VIEWER_BRIDGE`, e.g. `em_bridge.py --fs-root /tmp/viewer`);
// without them they say so and fail — the files are the case.
const V33 = benchFile("VIEWER_V33");
const V33_BRIDGE = process.env.VIEWER_BRIDGE ?? BRIDGE;
async function openV33(extra = {}) {
  if (!existsSync(V33)) throw new Error(`the v3.3 copy is not at ${V33}`);
  const ctx = await browser.newContext({ viewport: { width: extra.w ?? 1600, height: extra.h ?? 1000 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await p.addInitScript((loc) => { try { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", loc); sessionStorage.setItem("probe", "1"); } } catch { /* */ } }, extra.locale ?? "it");
  await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(V33_BRIDGE)}`);
  await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 30000 });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(V33, "utf8")), V33]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await p.waitForTimeout(600);
  return { p, ctx, errors };
}
const v33Id = (p, name, type = "document") => p.evaluate(([n, ty]) => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.find((x) => x.name === n && x.node_type === ty)?.id, [name, type]);
/** a Viewer in place of a window of the space (the Inspector of Stratigrafia, by default) */
const viewerIn = (p, type = "outliner") => p.evaluate((ty) => { const w = window.__EM_DRAG__.wins().find((x) => x.type === ty); window.__EM_DRAG__.retype(w.id, "viewer"); return w.id; }, type);
const vState = (p, w) => p.evaluate((x) => window.__EM_DRAG__.viewerState(x), w);

test("VU1.d01", "VIEWER-UNICO p.1/p.3 · D.01 nel Viewer: tutto il documento (i 10 modelli di Survey2015 e il contenitore), la riga dice da dove viene; la scena è inquadrata intera all'apertura (⇧C), non una striscia di taglio; D.09 dice «87 modelli» e nessun file", async () => {
  const { p, ctx, errors } = await openV33();
  const w = await viewerIn(p, "inspector");
  const d01 = await v33Id(p, "D.01");
  await p.evaluate((d) => window.__EM_DRAG__.select(d), d01);
  // MICRO-VIEWER-SPAZIO-EMTREE p.2 · the container's tileset is the default: its first tiles drawn (the framing follows them)
  await p.waitForFunction((x) => (window.__EM_DRAG__.viewerState(x)?.scene?.events ?? []).some((e) => e.what === "tiles" || e.what === "drawn"), w, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const s = await vState(p, w);
  await p.screenshot({ path: SHOT("vu1-d01") }).catch(() => {});
  const sc = s?.scene?.screen;
  const rw = sc?.rect ? sc.rect.x1 - sc.rect.x0 : 0, rh = sc?.rect ? sc.rect.y1 - sc.rect.y0 : 0;
  const d09 = await v33Id(p, "D.09");
  await p.evaluate((d) => window.__EM_DRAG__.select(d), d09);
  await p.waitForTimeout(1500);
  const s9 = await vState(p, w);
  await ctx.close();
  const pass = s?.target?.kind === "document" && s.target.models.length === 10 && s.target.groups.length === 1
    && /10 modelli di rappresentazione/.test(s.bar?.source ?? "") && /contenitore Survey2015/.test(s.bar?.source ?? "")
    && s.scene?.framed && sc?.boxes >= 1 && rw > sc.canvas.w * 0.3 && rh > sc.canvas.h * 0.2 && Math.min(rw, rh) / Math.max(rw, rh) > 0.15
    && s9?.target?.models.length === 87 && s9.target.parts.length === 0 && /87 modelli/.test(s9.bar?.source ?? "") && !errors.length;
  return { pass, detail: { source: s?.bar?.source, framed: s?.scene?.framed, screen: sc, rw, rh, d09: s9?.bar?.source, errors } };
});

test("VU2.versions", "VIEWER-SPAZIO-EMTREE p.2 · nessuna versione alta da sola: scorrendo 10 documenti e fermi 6 s su D.01 si vede il tileset del contenitore (il default), nessun livello alto chiesto; «Versioni» nella barra (tileset, livelli con peso e tipo, LOD0 oltre la soglia) e il tab laterale sono una sola scelta; LOD2 scelto a mano si carica", async () => {
  const { p, ctx, errors } = await openV33();
  const w = await viewerIn(p, "inspector");
  const reqs = [];
  p.on("request", (r) => { if (/\.(obj|glb|gltf)(\?|$)/i.test(r.url())) reqs.push({ t: Date.now(), u: decodeURIComponent(r.url()) }); });
  const d01 = await v33Id(p, "D.01");
  const names = ["D.02", "D.09", "D.03", "D.01", "D.05", "D.08", "D.09", "D.07", "D.11", "D.04"];
  const ids = [];
  for (const n of names) ids.push(await v33Id(p, n));
  const t0 = Date.now();
  for (const id of ids) { await p.evaluate((d) => window.__EM_DRAG__.select(d), id); await p.waitForTimeout(250); }
  const scrolled = reqs.filter((r) => r.t >= t0).map((r) => r.u);
  const heavy = (u) => !/@lod\d|lod1-realtime-web|lod4-web|TempluMare_tiles|\/tiles?\//i.test(u);
  const highWhileScrolling = scrolled.filter(heavy);
  await p.evaluate((d) => window.__EM_DRAG__.select(d), d01);
  await p.waitForFunction((x) => (window.__EM_DRAG__.viewerState(x)?.scene?.events ?? []).some((e) => e.what === "tiles" || e.what === "drawn"), w, { timeout: 60000 }).catch(() => {});
  reqs.length = 0;
  await p.waitForTimeout(6000);
  const still = await vState(p, w);
  const climbed = reqs.filter((r) => heavy(r.u)).map((r) => r.u);
  const area = `.tile-area[data-win="${w}"]`;
  const opts = await p.evaluate((a) => [...document.querySelectorAll(`${a} select[data-vw-versions] option`)].map((o) => [o.value, o.textContent]), area);
  // the side panel: the same list, as radio buttons
  await p.click(`${area} [data-vw-np-tab]`);
  await p.waitForTimeout(400);
  const radios = await p.evaluate((a) => [...document.querySelectorAll(`${a} [data-vw-choice]`)].map((r) => [r.dataset.vwChoice, r.checked]), area);
  // LOD2 by hand, from the panel: asked for, drawn, and the bar's list follows
  reqs.length = 0;
  await p.click(`${area} [data-vw-choice="LOD2"]`).catch(() => {});
  await p.waitForFunction((x) => /LOD2/.test(window.__EM_DRAG__.viewerState(x)?.scene?.seen ?? ""), w, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const chosen = await vState(p, w);
  const barNow = await p.evaluate((a) => document.querySelector(`${a} select[data-vw-versions]`)?.value ?? null, area);
  await p.screenshot({ path: SHOT("vu2-d01-versioni") }).catch(() => {});
  await ctx.close();
  const keys = opts.map((o) => o[0]);
  const pass = scrolled.length >= 0 && highWhileScrolling.length === 0
    && /^tileset:/.test(still?.scene?.choice ?? "") && /tileset/.test(still?.scene?.seen ?? "") && climbed.length === 0
    && !still?.scene?.events?.some((e) => e.what === "high")
    && /^tileset:/.test(keys[0] ?? "") && keys.includes("LOD2") && keys.includes("LOD0") && opts.some((o) => o[0] === "LOD0" && /soglia/.test(o[1]))
    && JSON.stringify(radios.map((r) => r[0])) === JSON.stringify(keys) && radios[0]?.[1] === true
    && chosen?.scene?.choice === "LOD2" && reqs.some((r) => /LOD2/i.test(r.u)) && barNow === "LOD2" && !errors.length;
  return { pass, detail: { scrolled: scrolled.length, highWhileScrolling: highWhileScrolling.slice(0, 4), still: still?.scene && { choice: still.scene.choice, seen: still.scene.seen },
    climbed: climbed.slice(0, 4), opts, radios, chosen: chosen?.scene && { choice: chosen.scene.choice, seen: chosen.scene.seen }, lod2Reqs: reqs.filter((r) => /LOD2/i.test(r.u)).length, barNow, errors } };
});

test("VS2.viewer-gestures", "VIEWER-SPAZIO-EMTREE p.2 · Viewer: il clic semplice non seleziona (è degli strumenti), Alt+clic seleziona la mesh e il Viewer resta sul documento intero, il doppio clic porta centro e zoom sul punto senza selezionare né isolare", async () => {
  const { p, ctx, errors } = await openV33();
  const w = await viewerIn(p, "inspector");
  const d01 = await v33Id(p, "D.01");
  await p.evaluate((d) => window.__EM_DRAG__.select(d), d01);
  await p.waitForFunction((x) => window.__EM_DRAG__.viewerState(x)?.scene?.framed, w, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const at = await p.evaluate((x) => {
    const host = document.querySelector(`.tile-area[data-win="${x}"] .vw-scene`), cv = host?.querySelector("canvas");
    if (!cv) return null; const b = cv.getBoundingClientRect();
    for (const fy of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65]) for (const fx of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65]) {
      const px = Math.round(b.x + b.width * fx), py = Math.round(b.y + b.height * fy);
      if (document.elementFromPoint(px, py) !== cv) continue;
      const h = host.__spaceHit?.(px, py); if (h) return { px, py, h };
    }
    return null;
  }, w);
  const r = { at: at && `${at.h.kind}:${at.h.id}` };
  const look = async () => { const s = await vState(p, w); return { sel: await p.evaluate(() => window.__EM_DRAG__.selected()), node: s?.node, kind: s?.target?.kind, models: s?.target?.models?.length }; };
  if (at) {
    await p.mouse.click(at.px, at.py); await p.waitForTimeout(800);
    r.click = await look();
    await p.keyboard.down("Alt"); await p.mouse.click(at.px, at.py); await p.keyboard.up("Alt"); await p.waitForTimeout(800);
    r.alt = await look();
    await p.evaluate((d) => window.__EM_DRAG__.select(d), d01); await p.waitForTimeout(600);
    await p.mouse.dblclick(at.px, at.py); await p.waitForTimeout(2500);
    r.dbl = await look();
    const c = await p.evaluate((x) => document.querySelector(`.tile-area[data-win="${x}"] .vw-scene`).__spaceCamState(), w);
    r.dist = Math.hypot(...c.target.map((v, i) => v - at.h.point[i]));
  }
  r.help = await p.evaluate(() => document.querySelector("[data-gestures=viewer]")?.getAttribute("title") ?? null);
  await ctx.close();
  const doc = (x) => x && x.node === d01 && x.kind === "document" && x.models === 10;
  const pass = !!at && JSON.stringify(r.click.sel) === JSON.stringify([d01]) && doc(r.click)
    && r.alt.sel.length === 1 && r.alt.sel[0] !== d01 && doc(r.alt)
    && JSON.stringify(r.dbl.sel) === JSON.stringify([d01]) && doc(r.dbl) && r.dist < 0.6 && /Alt/.test(r.help ?? "") && !errors.length;
  return { pass, detail: { ...r, d01, errors } };
});

test("VS3.tools", "VIEWER-SPAZIO-EMTREE p.3 · gli strumenti di annotazione a schermo (non solo nel codice): nel Viewer di Fonti e in un Viewer da solo, D.01 (3D) punto quota, imposta, piano di posa (3 punti e faccia), linea, polilinea; D.11 (immagine) regione e poligono; una tavola PDF (TM015) gli strumenti spenti con il motivo", async () => {
  const { p, ctx, errors } = await openV33();
  /** the tools of window w as on screen: inside the window, drawn, not covered */
  const onScreen = (w) => p.evaluate((x) => {
    const area = document.querySelector(`.tile-area[data-win="${x}"]`); if (!area) return null;
    const ar = area.getBoundingClientRect();
    return [...area.querySelectorAll("[data-tool]")].filter((b) => {
      const r = b.getBoundingClientRect(); if (!r.width || !r.height) return false;
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.x >= ar.x - 1 && r.right <= ar.right + 1 && r.y >= ar.y - 1 && r.bottom <= ar.bottom + 1 && (top === b || b.contains(top));
    }).map((b) => b.dataset.tool + (b.disabled ? ":off" : ""));
  }, w);
  const r = {};
  const look = async (w, name, k) => { await p.evaluate((d) => window.__EM_DRAG__.select(d), await v33Id(p, name)); await p.waitForTimeout(1500); r[k] = await onScreen(w); };
  await p.click(`#workspace-bar .ws-tab[data-ws="provenance"]`); await p.waitForTimeout(1000);
  const fonti = await p.evaluate(() => window.__EM_DRAG__.wins().find((x) => x.type === "viewer")?.id);
  await look(fonti, "D.01", "fontiD01"); await look(fonti, "D.11", "fontiD11"); await look(fonti, "TM015", "fontiPdf");
  r.pdfNote = await p.evaluate((x) => document.querySelector(`.tile-area[data-win="${x}"] [data-vw-pdf-tools]`)?.textContent ?? null, fonti);
  await p.screenshot({ path: SHOT("vs3-fonti-pdf") }).catch(() => {});
  await p.click(`#workspace-bar .ws-tab[data-ws="canvas"]`); await p.waitForTimeout(800);
  const alone = await viewerIn(p, "inspector");
  await look(alone, "D.01", "aloneD01"); await look(alone, "D.11", "aloneD11");
  await p.screenshot({ path: SHOT("vs3-alone-d11") }).catch(() => {});
  await ctx.close();
  const T3 = "elevation,impost,plane3,planeFace,line,polyline", TI = "rect,polygon";
  const pass = String(r.fontiD01) === T3 && String(r.aloneD01) === T3 && String(r.fontiD11) === TI && String(r.aloneD11) === TI
    && String(r.fontiPdf) === "rect:off,polygon:off" && /PDF/.test(r.pdfNote ?? "") && !errors.length;
  return { pass, detail: { ...r, errors } };
});

test("VS4.stats", "VIEWER-SPAZIO-EMTREE p.4 · «Statistiche» fra le sovrapposizioni: spenta di default; accesa dice triangoli, vertici, oggetti e FPS letti dal renderer, al massimo 2 volte al secondo, la lettura costa meno di 2 ms; il Viewer segue lo stesso interruttore", async () => {
  const { p, ctx, errors } = await openV33();
  await spaceV33(p);
  const st = (sel = ".scn-host") => p.evaluate((x) => document.querySelector(x)?.__spaceStats?.() ?? null, sel);
  const setStats = (on) => p.evaluate((o) => { const cur = window.__EM_DRAG__.overlays("space"); const off = new Set(cur.off ?? []); if (o) off.delete("s3_stats"); else off.add("s3_stats"); window.__EM_DRAG__.setOverlays("space", { off: [...off] }); }, on);
  const r = { def: await st() };
  r.inMenu = await p.evaluate(() => (window.__EM_DRAG__.overlays("space").off ?? []).includes("s3_stats"));
  await setStats(true); await p.waitForTimeout(800);
  const a = await st(); await p.waitForTimeout(3000); const b = await st();
  r.on = { text: b?.text, triangles: b?.stats?.triangles, vertices: b?.stats?.vertices, objects: b?.stats?.objects, fps: b?.stats?.fps, reads3s: (b?.readMs?.n ?? 0) - (a?.readMs?.n ?? 0), mean: b?.readMs?.mean };
  await p.click(`#workspace-bar .ws-tab[data-ws="canvas"]`); await p.waitForTimeout(800);
  const w = await viewerIn(p, "inspector");
  await p.evaluate((d) => window.__EM_DRAG__.select(d), await v33Id(p, "D.01"));
  await p.waitForTimeout(3000);
  r.viewer = await st(`.tile-area[data-win="${w}"] .vw-scene`);
  await setStats(false); await p.waitForTimeout(400);
  r.viewerOff = await st(`.tile-area[data-win="${w}"] .vw-scene`);
  await ctx.close();
  const pass = r.def && !r.def.on && !r.def.shown && r.inMenu && /triangoli.*vertici.*oggetti.*FPS/.test(r.on.text ?? "") && r.on.triangles > 0 && r.on.vertices > 0 && r.on.objects > 0
    && r.on.reads3s >= 4 && r.on.reads3s <= 7 && r.on.mean < 2 && r.viewer?.on && r.viewer?.shown && r.viewerOff && !r.viewerOff.on && !r.viewerOff.shown && !errors.length;
  return { pass, detail: { ...r, viewer: r.viewer && { on: r.viewer.on, text: r.viewer.text }, viewerOff: r.viewerOff && { on: r.viewerOff.on }, errors } };
});

test("VS5.gallery", "VIEWER-SPAZIO-EMTREE p.5 · Singola/Gallery solo dove ci sono più immagini: non per D.01 (3D), D.05 (PDF), D.08 (una immagine); sì per D.11 (tre immagini), dove Gallery le dispone e un clic ne apre una in Singola", async () => {
  const { p, ctx, errors } = await openV33();
  await p.click(`#workspace-bar .ws-tab[data-ws="provenance"]`); await p.waitForTimeout(1000);
  const w = await p.evaluate(() => window.__EM_DRAG__.wins().find((x) => x.type === "viewer")?.id);
  const bar = `.tile-area[data-win="${w}"] .tile-bar`;
  const modes = () => p.evaluate((b) => [...document.querySelectorAll(`${b} button`)].map((x) => x.textContent.trim()).filter((x) => /^(Singola|Gallery)$/.test(x)), bar);
  const r = {};
  for (const n of ["D.01", "D.05", "D.08", "D.11"]) { await p.evaluate((d) => window.__EM_DRAG__.select(d), await v33Id(p, n)); await p.waitForTimeout(1200); r[n] = await modes(); }
  // D.11: the Gallery, then one of its images
  await p.evaluate((b) => [...document.querySelectorAll(`${b} button`)].find((x) => x.textContent.trim() === "Gallery")?.click(), bar);
  await p.waitForTimeout(800);
  r.thumbs = await p.evaluate((x) => document.querySelectorAll(`.tile-area[data-win="${x}"] [data-vw-gallery] .viewer-thumb`).length, w);
  await p.screenshot({ path: SHOT("vs5-d11-gallery") }).catch(() => {});
  await p.evaluate((x) => document.querySelectorAll(`.tile-area[data-win="${x}"] [data-vw-gallery] .viewer-thumb`)[1]?.click(), w);
  await p.waitForTimeout(800);
  r.after = await p.evaluate((x) => window.__EM_DRAG__.viewerState(x)?.bar?.pos ?? null, w);
  r.modeAfter = await p.evaluate((b) => [...document.querySelectorAll(`${b} button`)].find((x) => /Singola/.test(x.textContent) )?.getAttribute("aria-pressed") ?? document.querySelector(`${b} .on, ${b} [aria-current]`)?.textContent ?? null, bar);
  // back to a 3D document: the selector goes again
  await p.evaluate((d) => window.__EM_DRAG__.select(d), await v33Id(p, "D.01")); await p.waitForTimeout(1200);
  r.backD01 = await modes();
  await ctx.close();
  const pass = !r["D.01"].length && !r["D.05"].length && !r["D.08"].length && r["D.11"].join() === "Singola,Gallery"
    && r.thumbs >= 2 && r.after === "2/3" && !r.backD01.length && !errors.length;
  return { pass, detail: { ...r, errors } };
});

test("VS6.emtree", "VIEWER-SPAZIO-EMTREE p.6 · l'EMtree: un file per riga col suo nome (il percorso nel tooltip), il pallino delle modifiche, le azioni al passaggio del mouse; sotto i grafi rientrati con nome, codice, nodi e il segno dell'attivo; la narrativa come voce secondaria; nessuna etichetta va a capo a 280 e a 400 px", async () => {
  const { p, ctx, errors } = await openV33();
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [fixture("PortaMarina-lite"), "/tmp/vse/scavi/PortaMarina/PortaMarina-lite.em.json"]);
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__EM_DRAG__.auxAdd({ locator: "/tmp/vse/scavi/PortaMarina/US_schede_2024.xlsx", fileType: "emdb_xlsx", expanded: false }));
  await p.waitForTimeout(500);
  const r = {};
  for (const W of [280, 400]) {
    r[W] = await p.evaluate((w) => {
      const a = document.querySelector('.tile-area[data-surface-type="emtree"]'); if (!a) return null;
      a.style.width = `${w}px`;
      const rows = [...a.querySelectorAll(".et-file-head, .et-row, .et-story, .et-aux")];
      const tall = rows.filter((e) => e.getBoundingClientRect().height > 30).map((e) => e.textContent.trim().slice(0, 30));
      const over = [...a.querySelectorAll(".et-file-name, .et-name, .et-story-name, .et-aux-names, .et-meta")].filter((e) => getComputedStyle(e).whiteSpace !== "nowrap" && !e.closest(".et-pick, .et-file-head, .et-story, .et-aux")).length;
      const files = [...a.querySelectorAll(".et-file")].map((f) => ({ name: f.querySelector(".et-file-name")?.textContent, tip: f.querySelector(".et-file-head")?.title,
        tail: !!f.querySelector(".et-file-tail"), dirty: !!f.querySelector(".et-file-head .et-dirty"),
        graphs: [...f.querySelectorAll(".et-slot")].map((g) => ({ name: g.querySelector(".et-name")?.textContent, code: g.querySelector(".et-code")?.textContent ?? null,
          meta: g.querySelector(".et-row .et-meta")?.textContent, active: g.querySelector(".et-pick")?.getAttribute("aria-current") === "true",
          stories: g.querySelectorAll(".et-story").length, aux: g.querySelector(".et-aux .et-aux-names")?.textContent ?? null })) }));
      const acts = [...a.querySelectorAll(".et-acts")].map((e) => getComputedStyle(e).opacity);
      return { tall, over, files, acts };
    }, W);
  }
  await p.hover('.tile-area[data-surface-type="emtree"] .et-file-head');
  await p.waitForTimeout(250);
  r.hoverActs = await p.evaluate(() => getComputedStyle(document.querySelector('.tile-area[data-surface-type="emtree"] .et-file-head .et-acts')).opacity);
  await p.screenshot({ path: SHOT("vs6-emtree") }).catch(() => {});
  await ctx.close();
  const ok = (x) => x && !x.tall.length && x.files.length === 2 && x.files.every((f) => !f.tail && /\.em\.json$/.test(f.tip ?? "") && /^[^/]+\.em\.json$/.test(f.name ?? ""))
    && x.files[0].graphs[0]?.code === "GT16" && /nodi/.test(x.files[0].graphs[0]?.meta ?? "") && x.files[0].graphs[0]?.stories >= 1
    && x.files[1].graphs[0]?.active && x.files[1].graphs[0]?.aux === "US_schede_2024.xlsx" && x.files.some((f) => f.dirty);
  const pass = ok(r[280]) && ok(r[400]) && r.hoverActs === "1" && !errors.length;
  return { pass, detail: { ...r, errors } };
});

test("VU3.quota", "VIEWER-UNICO p.4 · un punto quota sul 3D di D.01 crea l'estrattore del documento (coordinate del documento, il valore letto), il segno nella scena, la riga in «Estrazioni da questo documento»; «Interpretazione» lo collega a una proprietà; un annulla per gesto", async () => {
  const { p, ctx, errors } = await openV33();
  const w = await viewerIn(p, "outliner");
  const d01 = await v33Id(p, "D.01");
  await p.evaluate((d) => window.__EM_DRAG__.select(d), d01);
  await p.waitForFunction((x) => window.__EM_DRAG__.viewerState(x)?.scene?.framed, w, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(3000);
  const area = `.tile-area[data-win="${w}"]`;
  // the spot height is taken on a MODEL: the Viewer opens D.01 on Survey2015's
  // tileset (its default, the container's), whose tiles a pick does not hit —
  // the lightest model level is chosen in «Versions» first, then framed
  // (MICRO-SUITE-VERDE: the case was written when D.01 drew its models)
  const lightest = await p.evaluate((a) => [...document.querySelectorAll(`${a} select[data-vw-versions] option`)].map((o) => o.value).find((v) => !v.startsWith("tileset:")) ?? null, area);
  if (lightest) {
    await p.selectOption(`${area} select[data-vw-versions]`, lightest);
    await p.waitForFunction((x) => (window.__EM_DRAG__.viewerState(x)?.scene?.events ?? []).some((e) => e.what === "drawn"), w, { timeout: 60000 }).catch(() => {});
    await p.click(`${area} [data-vw-fit]`).catch(() => {});
    await p.waitForTimeout(1200);
  }
  // the tools are the bar's once the document's scene is there: under the whole
  // suite's load that came after the fixed 3 s (MICRO-SUITE-VERDE)
  await p.waitForSelector(`${area} [data-tool="elevation"]`, { state: "visible", timeout: 90000 }).catch(() => {});
  await p.click(`${area} [data-tool="elevation"]`);
  const box = await p.locator(`${area} .vw-scene canvas`).first().boundingBox();
  const at = await p.evaluate(([x, b]) => {
    const host = document.querySelector(`.tile-area[data-win="${x}"] .vw-scene`), cv = host.querySelector("canvas");
    // the whole canvas, from its centre out: in this small Viewer the tileset is
    // framed by its root volume and the model may lie at its lower edge, with
    // only air in the middle band (measured, MICRO-SUITE-VERDE)
    const fs = [0.5]; for (let d = 0.05; d <= 0.45; d += 0.05) fs.push(0.5 - d, 0.5 + d);
    for (const fy of fs) for (const fx of fs) {
      const px = b.x + b.width * fx, py = b.y + b.height * fy;
      if (document.elementFromPoint(px, py) !== cv) continue;
      const h = host.__spaceHit?.(px, py);
      if (h) return { px, py, h };
    }
    return null;
  }, [w, box]);
  const undo0 = await p.evaluate(() => window.__EM_DRAG__.undoDepth());
  if (at) await p.mouse.click(at.px, at.py);
  await p.waitForTimeout(1200);
  const g = JSON.parse(await p.evaluate(() => window.__EM_DRAG__.graphJson()));
  const sel = (await p.evaluate(() => window.__EM_DRAG__.selected()))[0];
  const x = g.nodes.find((n) => n.id === sel);
  const reg = x && g.nodes.find((n) => n.node_type === "annotation_region" && g.edges.some((e) => e.source === x.id && e.target === n.id && e.edge_type === "extracted_from"));
  const toDoc = x && g.edges.some((e) => e.source === x.id && e.target === d01 && e.edge_type === "extracted_from");
  const marks = await p.evaluate((x) => document.querySelector(`.tile-area[data-win="${x}"] .vw-scene`)?.__spaceMarks?.() ?? [], w);
  const undo1 = await p.evaluate(() => window.__EM_DRAG__.undoDepth());
  // the Inspector of the document lists it; «Interpretazione» → a property
  await p.evaluate((d) => window.__EM_DRAG__.select(d), d01);
  await p.waitForTimeout(800);
  const iw = await p.evaluate(() => window.__EM_DRAG__.wins().find((q) => q.type === "inspector").id);
  const ia = `.tile-area[data-win="${iw}"]`;
  const listed = await p.evaluate(([a, id]) => ({ head: [...document.querySelectorAll(`${a} h3.insp-sect`)].map((h) => h.textContent).find((t) => /Estrazioni da questo documento/.test(t)) ?? null,
    row: !!document.querySelector(`${a} .chain-reading[data-extractor="${id}"]`) }), [ia, x?.id]);
  let linked = null;
  if (x) {
    await p.click(`${ia} [data-link-extraction="${x.id}"]`);
    await p.waitForTimeout(300);
    const opt = await p.evaluate(() => document.querySelector(".rd-bubble-opt")?.dataset.property ?? null);
    if (opt) await p.click(`.rd-bubble-opt[data-property="${opt}"]`);
    await p.waitForTimeout(500);
    const g2 = JSON.parse(await p.evaluate(() => window.__EM_DRAG__.graphJson()));
    linked = g2.edges.some((e) => e.target === x.id && (e.edge_type === "has_data_provenance" || e.edge_type === "combines"));
  }
  await p.screenshot({ path: SHOT("vu3-quota") }).catch(() => {});
  await p.evaluate(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(300);
  const g3 = JSON.parse(await p.evaluate(() => window.__EM_DRAG__.graphJson()));
  const unlinked = !g3.edges.some((e) => e.target === x?.id && (e.edge_type === "has_data_provenance" || e.edge_type === "combines")) && g3.nodes.some((n) => n.id === x?.id);
  await p.evaluate(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(300);
  const gone = !JSON.parse(await p.evaluate(() => window.__EM_DRAG__.graphJson())).nodes.some((n) => n.id === x?.id);
  await ctx.close();
  // the coords in the scene's frame (glTF, Y up: the datamodel's), the height read on its vertical
  const z = reg?.data?.coords?.[0]?.[1];
  const pass = !!at && x?.node_type === "extractor" && toDoc && reg?.data?.reading_kind === "spot_height" && reg?.data?.resource_id === d01
    && Math.abs((z ?? 0) - at.h.point[1]) < 1e-3 && Math.abs((reg?.data?.value ?? 0) - at.h.point[1]) < 1e-3 && /quota/.test(x?.data?.result ?? "") && marks.some((m) => m.id === x.id && m.shown)
    && undo1 - undo0 === 1 && !!listed.head && listed.row && linked && unlinked && gone && !errors.length;
  return { pass, detail: { at: at?.h, x: x && { name: x.name, result: x.data?.result }, reg: reg?.data, toDoc, marks, steps: undo1 - undo0, listed, linked, unlinked, gone, errors } };
});

test("VU4.image", "VIEWER-UNICO p.3/p.4 · il documento di un'immagine nel Viewer: le regioni già fatte si vedono, Regione traccia e chiede che cosa estrae (come in Doc), «Copia le regioni come Web Annotations» è nel menu Documento del Viewer", async () => {
  const { p, ctx, errors } = await open({ doc: "catena" });
  const w = await viewerIn(p, "outliner");
  await p.evaluate(() => window.__EM_DRAG__.select("D3"));
  await p.waitForSelector(`.tile-area[data-win="${w}"] .rd-img img`, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(500);
  const area = `.tile-area[data-win="${w}"]`;
  const before = await p.evaluate(() => window.__EM_DRAG__.idsOfType("extractor").length);
  const tools = await p.evaluate((a) => [...document.querySelectorAll(`${a} .viewer-bar [data-tool]`)].map((b) => b.dataset.tool), area);
  await p.click(`${area} [data-tool="rect"]`).catch(() => {});
  await p.waitForTimeout(200);
  const img = await p.evaluate((a) => { const r = document.querySelector(`${a} .rd-img svg`)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height }; }, area);
  if (img) {
    await p.mouse.move(img.x + img.w * 0.3, img.y + img.h * 0.3); await p.mouse.down();
    await p.mouse.move(img.x + img.w * 0.4, img.y + img.h * 0.4); await p.mouse.move(img.x + img.w * 0.5, img.y + img.h * 0.45); await p.mouse.up();
  }
  await p.waitForTimeout(300);
  const bubble = await p.evaluate(() => !!document.querySelector(".rd-bubble"));
  await p.keyboard.press("Enter");
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => window.__EM_DRAG__.idsOfType("extractor").length);
  const regions = await p.evaluate((a) => document.querySelectorAll(`${a} .rd-region`).length, area);
  // the menu Documento of the Viewer has the Web Annotations
  await p.evaluate((x) => window.__EM_DRAG__.select?.(null) ?? null, w).catch(() => {});
  await p.evaluate(() => window.__EM_DRAG__.select("D3"));
  await p.waitForTimeout(300);
  // the window's «⋯»: the Viewer's menus, Documento first
  await p.click(`${area} .win-more`).catch(() => {});
  await p.waitForTimeout(300);
  const menuItems = await p.evaluate(() => [...document.querySelectorAll(".dd-menu:not(.hidden) .dd-group, .dd-menu:not(.hidden) button")].map((b) => b.textContent.trim()).filter(Boolean));
  await p.screenshot({ path: SHOT("vu4-immagine") }).catch(() => {});
  await ctx.close();
  const pass = tools.join() === "rect,polygon" && !!img && bubble && after === before + 1 && regions >= 1
    && menuItems.some((t) => /^Documento$/.test(t)) && menuItems.some((t) => /Web Annotation/.test(t)) && !errors.length;
  return { pass, detail: { tools, img: !!img, bubble, before, after, regions, menuItems: menuItems.slice(0, 10), errors } };
});

test("VU5.sources", "VIEWER-UNICO p.5 · la finestra Doc non c'è più: Fonti è Tabular dei documenti · Viewer · Matrix · Inspector; nessun Doc nel menu dei tipi; un workspace salvato con una Doc la apre come Viewer (tenuto sul suo documento se era tuo); l'Inspector del documento ha la sua scheda", async () => {
  const saved = { provenance: { activeId: "provenance:doc", wins: [
    { id: "provenance:doc", type: "doc", state: { "current.doc": "D3", "current.doc.role": "user" } },
    { id: "provenance:graph", type: "graph", state: { mode: "matrix" } },
    { id: "provenance:inspector", type: "inspector", state: {} }],
    layout: { kind: "split", dir: "row", ratio: 0.6, a: { kind: "leaf", winId: "provenance:doc" }, b: { kind: "split", dir: "col", ratio: 0.5, a: { kind: "leaf", winId: "provenance:graph" }, b: { kind: "leaf", winId: "provenance:inspector" } } } } };
  const fresh = await open({ doc: "catena" });
  await workspace(fresh.p, "provenance");
  const types = await fresh.p.evaluate(() => window.__EM_DRAG__.wins().map((w) => w.type + (w.type === "table" ? ":" + w.state["current.table.sheet"] : "")));
  const anyDoc = await fresh.p.evaluate(() => window.__EM_DRAG__.wins().some((w) => w.type === "doc"));
  await fresh.p.evaluate(() => window.__EM_DRAG__.select("D3"));
  await fresh.p.waitForTimeout(600);
  const card = await fresh.p.evaluate(() => ({ head: [...document.querySelectorAll("h3.insp-sect")].map((h) => h.textContent).some((t) => /Scheda del documento/.test(t)),
    fields: [...document.querySelectorAll(".insp-doc-card [data-doc-field]")].map((i) => i.dataset.docField) }));
  // the transform menu of a window: no «Doc»
  const typeMenu = await fresh.p.evaluate(() => [...document.querySelectorAll(".win-type-menu [data-type], [data-transform-type]")].map((b) => b.dataset.type ?? b.dataset.transformType));
  await fresh.p.screenshot({ path: SHOT("vu5-fonti") }).catch(() => {});
  await fresh.ctx.close();
  const old = await open({ doc: "catena", init: { "emstudio.windows": JSON.stringify(saved), "emstudio.workspaces.rev": "4" } });
  await workspace(old.p, "provenance");
  const migrated = await old.p.evaluate(() => window.__EM_DRAG__.wins().map((w) => ({ type: w.type, keep: w.state["current.viewer.keep"] ?? null })));
  await old.ctx.close();
  const pass = types[0] === "viewer" && types.includes("table:Documents") && types.includes("graph") && types.includes("inspector") && !anyDoc
    && card.head && card.fields.join() === "title,url" && !typeMenu.includes("doc")
    && !migrated.some((w) => w.type === "doc") && !fresh.errors.length && !old.errors.length;
  return { pass, detail: { types, card, typeMenu, migrated, errors: [...fresh.errors, ...old.errors] } };
});

test("VU6.tables", "VIEWER-UNICO p.6 · Risorse, Interpretazioni, Combinatori nella Tabular (una riga = un nodo, il clic lo seleziona, «↑ D.xx» sale al documento); con due e tre Tabular su schede diverse ognuna va alla sua riga, cambia scheda solo se il nodo non c'è, un filtro che nasconde la riga si toglie e lo si dice; la finestra cliccata non si muove", async () => {
  const { p, ctx, errors } = await open({ doc: "catena", w: 1800, h: 1100 });
  const wins = await p.evaluate(() => window.__EM_DRAG__.wins().map((w) => ({ id: w.id, type: w.type })));
  const T1 = wins.find((w) => w.type === "table").id, T2 = wins.find((w) => w.type === "outliner").id;
  await p.evaluate((x) => window.__EM_DRAG__.retype(x, "table"), T2);
  await p.waitForTimeout(400);
  const rows = (x) => p.evaluate((y) => window.__EM_DRAG__.tableRows(y), x);
  const sheet = async (x, s) => { await p.evaluate(([a, b]) => window.__EM_DRAG__.setSheet(a, b), [x, s]); await p.waitForTimeout(500); };
  const r = {};
  for (const s of ["Resources", "Interpretations", "Combiners"]) { await sheet(T1, s); r[s] = (await rows(T1))?.rows; }
  // a click on an Interpretations row selects the extractor; its «↑ D.1» goes to the document
  await sheet(T1, "Interpretations");
  const first = await p.evaluate((x) => document.querySelector(`.tile-area[data-win="${x}"] table.ledger-int tbody tr[data-row] td`)?.parentElement?.dataset.row, T1);
  await p.click(`.tile-area[data-win="${T1}"] table.ledger-int tbody tr[data-row="${first}"] td.ledger-name`).catch(() => {});
  await p.waitForTimeout(400);
  r.clicked = (await p.evaluate(() => window.__EM_DRAG__.selected()))[0] === first;
  const up = await p.evaluate((x) => document.querySelector(`.tile-area[data-win="${x}"] table.ledger-int tbody tr button[data-go]`)?.dataset.go, T1);
  if (up) await p.click(`.tile-area[data-win="${T1}"] table.ledger-int tbody tr button[data-go="${up}"]`).catch(() => {});
  await p.waitForTimeout(400);
  r.up = (await p.evaluate(() => window.__EM_DRAG__.selected()))[0] === up;
  // two Tabulars: Units and Models hold a unit — neither changes sheet
  await sheet(T1, "Units"); await sheet(T2, "Models");
  await p.evaluate(() => window.__EM_DRAG__.select("USM101"));
  await p.waitForTimeout(900);
  r.both = [await rows(T1), await rows(T2)].map((x) => [x.sheet, x.active, x.activeInView]);
  // an extractor: Units does not hold it → Interpretations; Models neither
  await p.evaluate(() => window.__EM_DRAG__.select("X1"));
  await p.waitForTimeout(900);
  r.extractor = [await rows(T1), await rows(T2)].map((x) => [x.sheet, x.active, x.activeInView]);
  // a column filter hiding the row: cleared, and said
  await sheet(T1, "Interpretations");
  await p.evaluate((x) => { const c = document.querySelector(`.tile-area[data-win="${x}"] .tt-filter[data-col="Nome"]`); if (c) { c.value = "zzz"; c.dispatchEvent(new Event("input")); } }, T1);
  await p.waitForTimeout(300);
  r.hidden = (await rows(T1)).hidden;
  const toastBefore = await p.evaluate(() => document.getElementById("toast")?.textContent ?? "");
  await p.evaluate(() => window.__EM_DRAG__.select("D1"));
  await p.waitForTimeout(200);
  await p.evaluate(() => window.__EM_DRAG__.select("X1"));
  await p.waitForTimeout(900);
  r.unfiltered = await rows(T1).then((x) => ({ hidden: x.hidden, filters: x.filters, inView: x.activeInView }));
  r.toast = await p.evaluate(() => document.getElementById("toast")?.textContent ?? "");
  // three Tabulars; a click IN one of them: that one does not scroll
  const T3 = wins.find((w) => w.type === "emtree").id;
  await p.evaluate((x) => window.__EM_DRAG__.retype(x, "table"), T3);
  await p.waitForTimeout(400);
  await sheet(T1, "Units"); await sheet(T2, "Models"); await sheet(T3, "Documents");
  await p.evaluate(() => window.__EM_DRAG__.select("D1"));
  await p.waitForTimeout(900);
  r.three = [await rows(T1), await rows(T2), await rows(T3)].map((x) => [x.sheet, x.active, x.activeInView]);
  await p.screenshot({ path: SHOT("vu6-tre-tabular") }).catch(() => {});
  await ctx.close();
  const pass = r.Resources >= 0 && r.Interpretations > 0 && r.Combiners >= 0 && r.clicked && r.up
    && r.both[0][0] === "Units" && r.both[1][0] === "Models" && r.both.every((x) => x[1] === "USM101")
    && r.extractor.every((x) => x[0] === "Interpretations" && x[1] === "X1" && x[2])
    && r.hidden > 0 && r.unfiltered.hidden === 0 && !r.unfiltered.filters.length && /filtro/.test(r.toast) && r.toast !== toastBefore
    && r.three.every((x) => x[0] === "Documents" && x[1] === "D1" && x[2]) && !errors.length;
  return { pass, detail: { ...r, errors } };
});

// ── MICRO-VIEWER-SPAZIO-EMTREE · clicks, versions, tools, statistics, EMtree ──
// VS1–VS3 read the Templu Mare v3.3 copy (`VIEWER_V33`, `VIEWER_BRIDGE`) as VU1–VU3.
/** the Space on the v3.3, epoch II, framed; the first canvas point whose hit is of `kind` */
async function spaceV33(p, epoch = "II") {
  await p.click(`#workspace-bar .ws-tab[data-ws="space"]`);
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 60000 });
  const ep = await p.evaluate((pre) => [...document.querySelectorAll(".scn-seg button[data-epoch]")].find((b) => b.textContent.trim().startsWith(pre))?.dataset.epoch, epoch);
  if (ep) await p.click(`.scn-seg button[data-epoch="${ep}"]`);
  for (let i = 0; i < 200; i++) {
    const n = await p.evaluate(() => (document.querySelector(".scn-host")?.__space?.() ?? []).filter((x) => x.as === "pending").length);
    if (!n) break;
    await p.waitForTimeout(250);
  }
  await p.evaluate(() => document.querySelector("[data-frame]")?.click());
  await p.waitForTimeout(1500);
}
const spaceHitOf = (p, kind) => p.evaluate((k) => {
  const h = document.querySelector(".scn-host"); const r = h.querySelector("canvas").getBoundingClientRect();
  for (let gy = 0.3; gy <= 0.8; gy += 0.03) for (let gx = 0.25; gx <= 0.75; gx += 0.03) {
    // whole pixels: a page event's coordinates are, and a grazing roof is a metre deep in 0.3 px
    const x = Math.round(r.left + r.width * gx), y = Math.round(r.top + r.height * gy);
    if (document.elementFromPoint(x, y)?.tagName !== "CANVAS") continue;
    const hit = h.__spaceHit(x, y); if (hit && hit.kind === k) return { x, y, hit };
  }
  return null;
}, kind);

test("VS1.gestures", "VIEWER-SPAZIO-EMTREE p.1 · Spazio: il clic seleziona il proxy (anche sotto la mesh), Alt+clic la mesh, il doppio clic porta centro e zoom sul punto senza selezionare né isolare (rapido e lento); il «?» e la mappa dei tasti dicono la regola", async () => {
  const { p, ctx, errors } = await openV33();
  await spaceV33(p);
  const sel = () => p.evaluate(() => document.querySelector(".scn-host").__spaceSelected().selected);
  const cam = () => p.evaluate(() => document.querySelector(".scn-host").__spaceCamState());
  const home = await cam();
  const r = {};
  const px = await spaceHitOf(p, "proxy"), rm = await spaceHitOf(p, "rm");
  // Escape redraws the scene: a click before it answers again hits nothing (measured on a loaded run)
  const reset = async () => { await p.evaluate((c) => document.querySelector(".scn-host").__spaceSetCam(c), home); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    await p.waitForFunction(([a, b]) => { const h = document.querySelector(".scn-host"); return h.__spaceHit(a.x, a.y)?.kind === "rm" && h.__spaceHit(b.x, b.y)?.kind === "proxy"; }, [rm, px], { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(300); };
  // MICRO-SUITE-VERDE (24 Oct) · a pick lands PICK_WAIT_MS (250 ms) after the
  // release, and then the selection is painted: under the whole suite's load
  // that was more than the 600 ms this case waited, and it read an empty
  // selection («instabile» in three reports). It waits for the selection to
  // CHANGE (up to 5 s); where nothing must change (the double clicks) it waits
  // for the camera to arrive, then beyond DOUBLE_MS for a pick that must not come
  // …and a change of the selection (Alt+A, a pick) rebuilds the scene: until it
  // is drawn again a press hits nothing (seen: 5 s and more under load, every
  // gesture after Alt+A empty). Before each gesture: the two points answer again
  const hitsBack = () => p.waitForFunction(([a, b]) => { const h = document.querySelector(".scn-host");
    return h.__spaceHit(a.x, a.y)?.kind === "rm" && h.__spaceHit(b.x, b.y)?.kind === "proxy"; }, [rm, px], { timeout: 20000 }).catch(() => {});
  const selChanged = async (prev) => {
    await p.waitForFunction((pv) => JSON.stringify(document.querySelector(".scn-host").__spaceSelected().selected) !== pv,
      JSON.stringify(prev), { timeout: 5000 }).catch(() => {});
    return sel();
  };
  // a click on the mesh in front: the proxy under it, not the mesh
  await reset();
  const s0 = await sel();
  await hitsBack();
  await p.mouse.click(rm.x, rm.y);
  r.clickOnMesh = await selChanged(s0);
  await p.mouse.move(rm.x, rm.y); await p.keyboard.press("Alt+KeyA");
  await p.waitForFunction(() => !document.querySelector(".scn-host").__spaceSelected().selected.length, null, { timeout: 5000 }).catch(() => {});
  r.afterNone = await sel();
  // (and past DOUBLE_MS: the next press is not the second of a double click)
  await p.waitForTimeout(550); await hitsBack();
  await p.mouse.click(px.x, px.y);
  r.click = await selChanged([]);
  await p.waitForTimeout(550); await hitsBack();
  await p.keyboard.down("Alt"); await p.mouse.click(rm.x, rm.y); await p.keyboard.up("Alt");
  r.alt = await selChanged(r.click);
  // the double click: the selection stays the mesh's, the centre goes to the point
  const before = await sel();
  await p.waitForTimeout(550); await hitsBack();
  await p.mouse.dblclick(px.x, px.y);
  await p.waitForFunction((pt) => { const c = document.querySelector(".scn-host").__spaceCamState();
    return Math.hypot(...c.target.map((v, i) => v - pt[i])) < 0.6; }, px.hit.point, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(800);
  const c1 = await cam();
  r.dbl = { sel: await sel(), dist: Math.hypot(...c1.target.map((v, i) => v - px.hit.point[i])), isolated: await p.evaluate(() => document.querySelector("[data-sol=isolate]")?.getAttribute("aria-pressed")) };
  // a slow double click (the first click has already picked): undone
  await reset();
  const s1 = await sel();
  await p.mouse.move(rm.x, rm.y); await p.keyboard.down("Alt"); await p.mouse.click(rm.x, rm.y); await p.keyboard.up("Alt");
  const beforeSlow = await selChanged(s1);
  await p.waitForTimeout(550); await hitsBack();
  await p.mouse.click(px.x, px.y); await p.waitForTimeout(330);
  await p.mouse.click(px.x, px.y, { clickCount: 2 });
  // the first click's pick landed and is undone by the second press: nothing to
  // wait for but the time of both (DOUBLE_MS) and a pick's
  await p.waitForTimeout(1200);
  r.slow = await sel();
  const help = await p.evaluate(() => document.querySelector("[data-gestures=space]")?.getAttribute("title") ?? null);
  await p.screenshot({ path: SHOT("vs1-spazio-gesti") }).catch(() => {});
  await ctx.close();
  const pk = `proxy:${px.hit.id}`, mk = `rm:${rm.hit.id}`;
  const pass = r.clickOnMesh.length === 1 && r.clickOnMesh[0].startsWith("proxy:") && JSON.stringify(r.click) === JSON.stringify([pk])
    && JSON.stringify(r.alt) === JSON.stringify([mk]) && JSON.stringify(r.dbl.sel) === JSON.stringify(before) && r.dbl.dist < 0.6 && r.dbl.isolated !== "true"
    && JSON.stringify(r.slow) === JSON.stringify(beforeSlow) && /Alt/.test(help ?? "") && !errors.length;
  return { pass, detail: { ...r, before, beforeSlow, pk, mk, help, errors } };
});

// ── MICRO-PERCORSI-WINDOWS · an em.json opened at a Windows path ────────────
// WP1 needs the Templu Mare v4 copy (`WINPATHS_V4`, the study of
// `/tmp/winpaths`) and a bridge that serves NONE of its folders
// (`WINPATHS_BRIDGE`, e.g. `em_bridge.py --fs-root /tmp/wp/empty`): the page is
// told the em.json is at C:\Users\ed\OneDrive - CNR\…\EM\, and what it asks the
// bridge under C:/… is rewritten to the copy on its way (nothing else). The
// rewrite holds the requests to 6 at a time, as the browser does: from node
// they would all go at once and the bridge's queue would reset them.
const WP_V4 = benchFile("WINPATHS_V4");
const WP_BRIDGE = (process.env.WINPATHS_BRIDGE ?? "http://127.0.0.1:8872").replace("//localhost:", "//127.0.0.1:");
test("WP1.windows", "PERCORSI-WINDOWS p.1/p.2 · Templu Mare v4 aperto da C:\\…\\EM\\ con un bridge che non serve nessuna sua cartella: la pagina dice al bridge quale em.json è aperto (/fs/doc), lo Spazio chiede i modelli come C:/…/RB/… e li disegna tutti (10 RM, il tileset, 5 proxy del XX sec), nessun «file mancante»", async () => {
  if (!existsSync(WP_V4)) throw new Error(`the v4 copy is not at ${WP_V4}`);
  const COPY = WP_V4.replace(/\/EM\/[^/]+$/, "");
  const WIN_STUDY = "C:/Users/ed/OneDrive - CNR/T6.5/TempluMare_v2_for_3DR_2026-10-06";
  const WIN = `${WIN_STUDY.replace(/\//g, "\\")}\\EM\\TempluMare_v4.em.json`;
  const enc = (x) => x.split("/").map(encodeURIComponent).join("/");
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const errors = [], asked = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  let busy = 0; const waiting = [];
  const slot = () => new Promise((r) => { if (busy < 6) { busy++; r(); } else waiting.push(r); });
  const free = () => { const n = waiting.shift(); if (n) n(); else busy--; };
  await ctx.route(`${WP_BRIDGE}/**`, async (route) => {
    const req = route.request();
    let url = req.url();
    const winAt = `${WP_BRIDGE}/fs/at/${enc(WIN_STUDY)}`;
    if (url.startsWith(winAt)) url = `${WP_BRIDGE}/fs/at/${enc(COPY.slice(1))}${url.slice(winAt.length)}`;
    let post = req.postData();
    if (post && /\/fs\/(doc|probe)$/.test(url)) post = post.split(WIN_STUDY).join(COPY);
    await slot();
    try {
      const res = await route.fetch({ url, postData: post ?? undefined });
      free();
      if (/\/fs\/(at|doc)/.test(req.url())) asked.push({ url: decodeURIComponent(req.url().slice(WP_BRIDGE.length)), status: res.status() });
      await route.fulfill({ response: res });
    } catch (e) { free(); asked.push({ url: req.url(), status: -1 }); await route.abort(); }
  });
  await p.addInitScript(() => { try { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "it"); sessionStorage.setItem("probe", "1"); } } catch { /* */ } });
  await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(WP_BRIDGE)}`);
  await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 30000 });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(WP_V4, "utf8")), WIN]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await p.waitForTimeout(1200);
  await p.click(`#workspace-bar .ws-tab[data-ws="space"]`);
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 60000 });
  await p.waitForFunction(() => { const s = document.querySelector(".scn-host")?.__space?.() ?? []; return s.length && !s.some((x) => x.as === "pending"); }, null, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const drawn = await p.evaluate(() => { const c = {}; for (const x of document.querySelector(".scn-host").__space()) c[`${x.kind}/${x.as}`] = (c[`${x.kind}/${x.as}`] ?? 0) + 1; return c; });
  const miss = await p.evaluate(() => [...document.querySelectorAll(".scn-host .miss")].map((e) => e.textContent.slice(0, 80)));
  await p.screenshot({ path: SHOT("wp1-windows") }).catch(() => {});
  await ctx.close();
  const at = asked.filter((a) => a.url.startsWith("/fs/at/"));
  const doc = asked.find((a) => a.url === "/fs/doc");
  const pass = doc?.status === 200 && at.length > 0 && at.every((a) => a.url.startsWith(`/fs/at/${WIN_STUDY}/`) && a.status >= 200 && a.status < 300)
    && drawn["rm/mesh"] === 10 && drawn["rm/tiles"] === 1 && drawn["proxy/mesh"] === 5 && !drawn["rm/label"] && !drawn["proxy/label"]
    && !miss.some((m) => /mancante/.test(m)) && !errors.length;
  return { pass, detail: { doc, asked: at.length, notOk: at.filter((a) => !(a.status >= 200 && a.status < 300)).slice(0, 3), first: at[0], drawn, miss, errors } };
});

// WP2 · «Ritrova i file…» on a study whose proxies were moved: Templu Mare v4's
// em.json alone in a study folder (made here, under the system's temp), its
// proxies copied to another folder with their names (`altrove/proxies-spostati`).
const WP2_BRIDGE = process.env.WINPATHS_BRIDGE ?? "http://127.0.0.1:8872";
test("WP2.relocate", "PERCORSI-WINDOWS p.3 · Templu Mare v4 senza i suoi file: all'apertura «N file non trovati · Ritrova i file…»; «Ritrova i file» in un'altra cartella trova i 65 proxy per sha256, dice ambigui, mancanti e da collegare (onedrive://); «Riscrivi» li rende relativi all'em.json (../../altrove/…) in un passo; Annulla li rimette tutti", async () => {
  if (!existsSync(WP_V4)) throw new Error(`the v4 copy is not at ${WP_V4}`);
  const { mkdtempSync, realpathSync: real } = await import("node:fs");
  const base = real(mkdtempSync(`${(await import("node:os")).tmpdir()}/wp2-`));
  const emj = `${base}/studio/EM/TempluMare_v4.em.json`;
  const away = `${base}/altrove/proxies-spostati`;
  mkdirSync(`${base}/studio/EM`, { recursive: true });
  mkdirSync(away, { recursive: true });
  copyFileSync(WP_V4, emj);
  const proxDir = WP_V4.replace(/[^/]+$/, "proxies");
  for (const f of readdirSync(proxDir)) copyFileSync(`${proxDir}/${f}`, `${away}/${f}`);
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await p.addInitScript(() => { try { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "it"); sessionStorage.setItem("probe", "1"); } } catch { /* */ } });
  await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(WP2_BRIDGE)}`);
  await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 30000 });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(emj, "utf8")), emj]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  // the opening's word, with its way in
  const atOpen = await p.waitForFunction(() => { const el = document.getElementById("toast"); const b = [...(el?.querySelectorAll("button.toast-action") ?? [])].map((x) => x.textContent);
    return el && !el.classList.contains("hidden") && /file non trovati/.test(el.textContent ?? "") ? { text: el.textContent, buttons: b } : null; }, null, { timeout: 120000 })
    .then((h) => h.jsonValue()).catch(() => null);
  const urlOf = (id) => p.evaluate((x) => JSON.parse(window.__EM_DRAG__.graphJson()).nodes.find((n) => n.id === x)?.data?.url, id);
  await p.evaluate((f) => window.__EM_DRAG__.relocate(f), `${base}/altrove`);
  await p.waitForSelector('.modal[data-dialog="relocate"]', { timeout: 180000 });
  const win = await p.evaluate(() => {
    const m = document.querySelector('.modal[data-dialog="relocate"]');
    const n = (k) => m.querySelectorAll(`.relocate-list[data-kind="${k}"] li`).length;
    return { tally: m.querySelector('[data-relocate="tally"]')?.textContent, found: n("found"), ambiguous: n("ambiguous"), missing: n("missing"), link: n("link"),
             go: m.querySelector('[data-act="relocate-go"]')?.textContent,
             sample: m.querySelector('.relocate-list[data-kind="found"] li .relocate-to')?.textContent };
  });
  await p.screenshot({ path: SHOT("wp2-relocate") }).catch(() => {});
  const st = await p.evaluate(() => window.__EM_DRAG__.relocateState());
  const su002 = st.verdicts.find((v) => /proxies\/SU002\.glb$/.test(v.url))?.id;
  const before = su002 ? await urlOf(su002) : null;
  await p.click('.modal[data-dialog="relocate"] [data-act="relocate-go"]');
  await p.waitForTimeout(500);
  const after = su002 ? await urlOf(su002) : null;
  const applied = (await p.evaluate(() => window.__EM_DRAG__.relocateState()))?.applied ?? [];
  const undoBtn = await p.$("#toast button.toast-action");
  if (undoBtn) await undoBtn.click();
  await p.waitForTimeout(300);
  const undone = su002 ? await urlOf(su002) : null;
  const allBack = await p.evaluate((ids) => { const g = JSON.parse(window.__EM_DRAG__.graphJson()); return ids.every(([id, from]) => g.nodes.find((n) => n.id === id)?.data?.url === from); }, applied.map((a) => [a.id, a.from]));
  await ctx.close();
  const pass = !!atOpen && atOpen.buttons.includes("Ritrova i file…") && win.found === 65 && win.link > 0 && win.missing > 0
    && /Riscrivi 65 percorsi/.test(win.go ?? "") && /^→ \.\.\/\.\.\/altrove\/proxies-spostati\/SU\d+\.glb · stessi byte \(sha256\)$/.test(win.sample ?? "")
    && before === "proxies/SU002.glb" && after === "../../altrove/proxies-spostati/SU002.glb" && applied.length === 65
    && undone === "proxies/SU002.glb" && allBack && !errors.length;
  return { pass, detail: { atOpen, win, before, after, applied: applied.length, undone, allBack, errors } };
});

// WP3 · this computer's OneDrive folder: a fake one under the system's temp
// (never E.D.'s own), holding two of the study's `onedrive://` (TM003's folder
// and its .obj), set in the settings as a person would.
test("WP3.onedrive", "PERCORSI-WINDOWS p.4 · Templu Mare v4 con la cartella di OneDrive di questo computer impostata: i suoi onedrive:// si cercano lì (TM003 e TM003.obj trovati), nessuno è più «da collegare», gli altri sono mancanti; senza impostazione sono «da collegare»; Impostazioni ▸ Generale mostra la cartella", async () => {
  if (!existsSync(WP_V4)) throw new Error(`the v4 copy is not at ${WP_V4}`);
  const { mkdtempSync, realpathSync: real } = await import("node:fs");
  const base = real(mkdtempSync(`${(await import("node:os")).tmpdir()}/wp3-`));
  const emj = `${base}/studio/EM/TempluMare_v4.em.json`;
  const od = `${base}/OneDrive - Prova`;
  mkdirSync(`${base}/studio/EM`, { recursive: true });
  mkdirSync(`${od}/Dottorato Bucarest/2_Rilievo/3DModels/TM003`, { recursive: true });
  writeFileSync(`${od}/Dottorato Bucarest/2_Rilievo/3DModels/TM003/TM003.obj`, "v 0 0 0\n");
  copyFileSync(WP_V4, emj);
  const run = async (root) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
    await p.addInitScript((r) => { try { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "it");
      if (r) localStorage.setItem("emstudio.settings", JSON.stringify({ files: { onedriveRoot: r } })); sessionStorage.setItem("probe", "1"); } } catch { /* */ } }, root);
    await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(WP2_BRIDGE)}`);
    await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 30000 });
    await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(emj, "utf8")), emj]);
    await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
    await p.evaluate((f) => window.__EM_DRAG__.relocate(f), `${base}/studio`);
    await p.waitForSelector('.modal[data-dialog="relocate"]', { timeout: 180000 });
    const st = await p.evaluate(() => window.__EM_DRAG__.relocateState());
    const od3 = st.verdicts.filter((v) => /^onedrive:/.test(v.url));
    let shown = null;
    if (root) {
      await p.evaluate(() => document.querySelector('.modal[data-dialog="relocate"]')?.remove());
      await p.evaluate(() => document.getElementById("btn-settings")?.click());
      await p.waitForTimeout(400);
      shown = await p.evaluate(() => document.getElementById("set-onedrive-root")?.value ?? null);
    }
    await ctx.close();
    return { kinds: od3.reduce((a, v) => ({ ...a, [v.kind]: (a[v.kind] ?? 0) + 1 }), {}), tm003: od3.filter((v) => /TM003(\/|\.obj)$/.test(v.url)).length, shown, errors };
  };
  const none = await run("");
  const set = await run(od);
  const pass = none.kinds.link === 44 && !none.kinds.missing && set.kinds.missing === 42 && !set.kinds.link && set.tm003 === 0
    && set.shown === od && !none.errors.length && !set.errors.length;
  return { pass, detail: { none, set } };
});

// ── MICRO-WINDOWS-MODELLI (21 ott 2026) · i modelli su Windows ──────────────
// Templu Mare v4 opened at E.D.'s Windows path (`C:/Users/Utente/OneDrive - CNR/…`),
// its requests answered from the copy (WP_V4), as WP1.
const WM_STUDY = "C:/Users/Utente/OneDrive - CNR/0_RACCOLTA_CNR/StratiGraph-grp - Documenti/WP 06 - Web Environment Development/T6.5/TempluMare_v2_for_3DR_2026-10-06";
const WM_WIN = `${WM_STUDY.replace(/\//g, "\\")}\\EM\\TempluMare_v4.em.json`;
const wmEnc = (x) => x.split("/").map(encodeURIComponent).join("/");
/** a page on the v4 copy at the Windows path; `refuse`: the bridge serves none of
 *  its folders (its /fs/doc refused, the models asked outside every root) */
async function wmOpen({ tauri = false, refuse = false } = {}) {
  if (!existsSync(WP_V4)) throw new Error(`the v4 copy is not at ${WP_V4}`);
  const COPY = WP_V4.replace(/\/EM\/[^/]+$/, "");
  const bport = new URL(WP_BRIDGE).port;
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const errors = [], asked = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  p.on("request", (r) => { const u = new URL(r.url()); if (/^(localhost|127\.0\.0\.1)$/.test(u.hostname) && u.port !== PORT) asked.push({ port: u.port, path: decodeURIComponent(u.pathname) }); });
  let busy = 0; const waiting = [];
  const slot = () => new Promise((r) => { if (busy < 6) { busy++; r(); } else waiting.push(r); });
  const free = () => { const n = waiting.shift(); if (n) n(); else busy--; };
  const handler = (base) => async (route) => {
    const req = route.request();
    let url = req.url().replace(base, WP_BRIDGE);
    if (refuse && /\/fs\/doc$/.test(url))
      return route.fulfill({ status: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": `http://localhost:${PORT}` }, body: JSON.stringify({ ok: false, error: "not an em.json on this computer" }) });
    const winAt = `${WP_BRIDGE}/fs/at/${wmEnc(WM_STUDY)}`;
    if (url.startsWith(winAt)) url = `${WP_BRIDGE}/fs/at/${refuse ? "private/var/empty/wm1" : wmEnc(COPY.slice(1))}${url.slice(winAt.length)}`;
    let post = req.postData();
    if (post && /\/fs\/(doc|probe)$/.test(url)) post = post.split(WM_STUDY).join(COPY);
    await slot();
    try { const res = await route.fetch({ url, postData: post ?? undefined }); free(); await route.fulfill({ response: res }); }
    catch { free(); await route.abort(); }
  };
  await ctx.route(`${WP_BRIDGE}/**`, handler(WP_BRIDGE));
  await ctx.route(`http://localhost:${bport}/**`, handler(`http://localhost:${bport}`));
  await p.addInitScript(([tauriOn, bridge]) => {
    try { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "it"); sessionStorage.setItem("probe", "1"); } } catch { /* */ }
    if (!tauriOn) return;
    // the shell's IPC, as much as the page asks at start: the port the shell decided
    let n = 1;
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
      transformCallback(cb) { const id = n++; window[`_${id}`] = cb; return id; },
      unregisterCallback() {}, convertFileSrc(x) { return x; },
      async invoke(cmd) {
        if (cmd === "transformer_url") { await new Promise((r) => setTimeout(r, 120)); return bridge; }
        if (cmd === "take_desktop_queue") return { files: [], notices: [] };
        if (cmd === "llm_key_status") return { available: false, set: false, detail: "" };
        if (cmd === "plugin:event|listen") return n++;
        if (cmd === "plugin:fs|exists") return false;
        if (cmd.startsWith("plugin:menu|")) return [n++, ""];
        if (cmd.startsWith("plugin:window|") || cmd.startsWith("plugin:webview|")) return null;
        if (cmd.startsWith("plugin:app|")) return "1.6.0-dev.57";
        throw new Error(`not simulated: ${cmd}`);
      },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  }, [tauri, `http://localhost:${bport}`]);
  await p.goto(`http://localhost:${PORT}/em/studio/${tauri ? "" : `?bridge=${encodeURIComponent(WP_BRIDGE)}`}`);
  await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 60000 });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(WP_V4, "utf8")), WM_WIN]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await p.waitForTimeout(1200);
  await p.click(`#workspace-bar .ws-tab[data-ws="space"]`);
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 60000 });
  await p.waitForFunction(() => { const s = document.querySelector(".scn-host")?.__space?.() ?? []; return s.length && !s.some((x) => x.as === "pending"); }, null, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const drawn = await p.evaluate(() => { const c = {}; for (const x of document.querySelector(".scn-host").__space()) c[`${x.kind}/${x.as}`] = (c[`${x.kind}/${x.as}`] ?? 0) + 1; return c; });
  return { p, ctx, errors, asked, drawn, bport };
}

test("WM1.loadfail", "WINDOWS-MODELLI p.1 · un modello che non arriva lo dice: con il bridge che non serve le cartelle dello studio (/fs/doc rifiutato, ogni modello 403) il Log ha una riga per i 10 RM, i 5 proxy e il tileset del XX sec — nome, url con la base del bridge, HTTP 403, «il bridge non serve la cartella» — più la riga di /fs/doc; nell'Outliner i modelli hanno il segno ⚠ con il motivo", async () => {
  const { p, ctx, errors, drawn } = await wmOpen({ refuse: true });
  await p.waitForTimeout(6000);   // the tileset's root waits 8 s before it is given up on
  const log = await p.evaluate(() => window.__EM_DRAG__.log().map((e) => `${e.level} ${e.message}`));
  const marks = await p.evaluate(() => [...document.querySelectorAll(".sol-fail")].map((e) => e.title));
  // a refused model is marked, the scene is drawn again and asks again before
  // it settles on the label: what is drawn is read when the ten labels are
  // there (measured: read at the opening, some were still «pending» — they all
  // became labels a few seconds later; MICRO-SUITE-VERDE)
  await p.waitForFunction(() => document.querySelector(".scn-host").__space().filter((x) => x.kind === "rm" && x.as === "label").length >= 10,
    null, { timeout: 60000 }).catch(() => {});
  const later = await p.evaluate(() => document.querySelector(".scn-host").__space().filter((x) => x.kind === "rm").map((x) => `${x.as}:${x.state}`));
  const drawnNow = await p.evaluate(() => { const c = {}; for (const x of document.querySelector(".scn-host").__space()) c[`${x.kind}/${x.as}`] = (c[`${x.kind}/${x.as}`] ?? 0) + 1; return c; });
  await p.screenshot({ path: SHOT("wm1-loadfail") }).catch(() => {});
  await ctx.close();
  const lines = log.filter((l) => /^warn Modello non caricato: /.test(l));
  const base = WP_BRIDGE.replace("127.0.0.1", "127.0.0.1");
  const pass = lines.length === 16 && lines.every((l) => l.includes(`${base}/fs/at/C:/Users/Utente/`) && /· HTTP 403 · il bridge non serve la cartella di questo file \(403\)$/.test(l))
    && lines.some((l) => /tileset\.json/.test(l)) && log.some((l) => /^warn Il bridge non ha servito le cartelle del documento aperto .*404\) not an em\.json/.test(l))
    && marks.length >= 10 && marks.every((m) => /il bridge non serve la cartella/.test(m)) && drawnNow["rm/label"] === 10 && !errors.length;
  return { pass, detail: { lines: lines.length, first: lines[0], doc: log.find((l) => /fs\/doc/.test(l)), marks: marks.length, drawn, drawnNow, later, errors } };
});

test("WM2.port", "WINDOWS-MODELLI p.2 · la pagina come il desktop (IPC simulato): la porta è quella decisa dalla shell (8765 di un altro programma → la successiva); con l'em.json in C:/Users/Utente/OneDrive - CNR/… ogni richiesta — modelli, tileset.json e tessere, proxy — va a quella base e mai alla 8765, nella forma C:/…; il XX sec è disegnato (10 RM, il tileset, 5 proxy), nessun segno di modello mancato", async () => {
  const { p, ctx, errors, asked, drawn, bport } = await wmOpen({ tauri: true });
  const marks = await p.evaluate(() => document.querySelectorAll(".sol-fail").length);
  const warn = await p.evaluate(() => window.__EM_DRAG__.log().filter((e) => /Modello non caricato/.test(e.message)).length);
  await ctx.close();
  const at = asked.filter((a) => a.path.startsWith("/fs/at/"));
  const pass = asked.length > 0 && asked.every((a) => a.port === bport) && at.length > 0 && at.every((a) => a.path.startsWith(`/fs/at/${WM_STUDY}/`))
    && at.some((a) => /cesium\/TempluMare\/(tileset\.json|Data\/)/.test(a.path))
    && drawn["rm/mesh"] === 10 && drawn["rm/tiles"] === 1 && drawn["proxy/mesh"] === 5 && !marks && !warn && !errors.length;
  return { pass, detail: { ports: [...new Set(asked.map((a) => a.port))], bport, asked: asked.length, fsAt: at.length, drawn, marks, warn, errors } };
});

/** the v4 copy opened at its own (Mac) path, no OneDrive folder set */
async function wmOpenCopy() {
  if (!existsSync(WP_V4)) throw new Error(`the v4 copy is not at ${WP_V4}`);
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await p.addInitScript(() => { try { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "it"); sessionStorage.setItem("probe", "1"); } } catch { /* */ } });
  await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(WP_BRIDGE)}`);
  await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 60000 });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(WP_V4, "utf8")), WP_V4]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  return { p, ctx, errors };
}

test("WM4.relocate", "WINDOWS-MODELLI p.4 · «Ritrova i file» nella cartella dello studio, senza cartella di OneDrive: 44 da collegare, che dicono di risolversi con la cartella di OneDrive di questo computer e non con quella scelta, con il pulsante «Imposta la cartella di OneDrive…»; nessun «Riscrivi 0 percorsi»: una riga dice cosa fare; la finestra è in italiano", async () => {
  const { p, ctx, errors } = await wmOpenCopy();
  await p.evaluate((f) => window.__EM_DRAG__.relocate(f), WP_V4.replace(/\/EM\/[^/]+$/, ""));
  await p.waitForSelector('.modal[data-dialog="relocate"]', { timeout: 180000 });
  const w = await p.evaluate(() => {
    const m = document.querySelector('.modal[data-dialog="relocate"]');
    const vis = (sel) => { const e = m.querySelector(sel); return e && !e.hidden ? e.textContent : null; };
    return { title: m.querySelector(".modal-head").textContent, tally: vis('[data-relocate="tally"]'), link: m.querySelectorAll('.relocate-list[data-kind="link"] li').length,
      why: vis('[data-relocate="link-why"]'), set: vis('[data-act="relocate-onedrive"]'), go: vis('[data-act="relocate-go"]'), hint: vis('[data-relocate="hint"]'),
      heads: [...m.querySelectorAll("h4")].map((h) => h.textContent), buttons: [...m.querySelectorAll("button")].filter((b) => !b.hidden).map((b) => b.textContent) };
  });
  await p.screenshot({ path: SHOT("wm4-relocate") }).catch(() => {});
  await ctx.close();
  const english = [w.title, w.tally, w.why, w.hint, ...w.heads, ...w.buttons].filter((x) => x && /\b(Find|missing|found|ambiguous|link|Rewrite|paths?|Cancel|Look|folder|Set)\b/.test(x));
  const pass = /^Ritrova i file — /.test(w.title) && w.tally === "0 trovati · 0 ambigui · 0 mancanti · 44 da collegare" && w.link === 44
    && /si ritrovano sotto la cartella di OneDrive di questo computer, non nella cartella scelta qui/.test(w.why ?? "") && w.set === "Imposta la cartella di OneDrive…"
    && w.go === null && /^Niente da riscrivere: i file da collegare si ritrovano impostando la cartella di OneDrive/.test(w.hint ?? "") && !english.length && !errors.length;
  return { pass, detail: { ...w, english, errors } };
});

test("WM5.collect", "WINDOWS-MODELLI p.5 · File ▸ «Raccogli le risorse…» su v4 senza cartella di OneDrive: 46 file fuori dallo studio (44 onedrive://, 2 smb://), nessuno raggiungibile da qui e ognuno dice perché; niente da copiare, nessun pulsante «Copia 0 file»: una riga dice cosa fare; le cartelle per tipo proposte sono modificabili", async () => {
  const { p, ctx, errors } = await wmOpenCopy();
  const inMenu = await p.evaluate(() => [...document.querySelectorAll("#dd-file .dd-menu > button")].map((e) => e.dataset.cmd).includes("collect"));
  await p.evaluate(() => window.__EM_DRAG__.collect());
  await p.waitForSelector('.modal[data-dialog="collect"]', { timeout: 60000 });
  await p.waitForTimeout(800);
  const w = await p.evaluate(() => {
    const m = document.querySelector('.modal[data-dialog="collect"]');
    const vis = (sel) => { const e = m.querySelector(sel); return e && !e.hidden ? e.textContent : null; };
    return { title: m.querySelector(".modal-head").textContent, tally: vis('[data-collect="tally"]'), go: vis('[data-act="collect-go"]'), hint: vis('[data-collect="hint"]'),
      kinds: [...m.querySelectorAll(".relocate-list")].map((u) => [u.dataset.kind, u.querySelectorAll("li").length]),
      disabled: [...m.querySelectorAll('.relocate-list input[type="checkbox"]')].every((b) => b.disabled),
      why: [...new Set([...m.querySelectorAll(".relocate-list li .relocate-to")].map((e) => e.textContent))],
      roots: [...m.querySelectorAll("[data-collect-root]")].map((i) => [i.dataset.collectRoot, i.value]) };
  });
  await p.screenshot({ path: SHOT("wm5-collect") }).catch(() => {});
  await ctx.close();
  const pass = inMenu && /^Raccogli le risorse — in /.test(w.title) && /^46 fuori · 0 scelti · 0 file, 0 B da copiare/.test(w.tally ?? "") && w.go === null
    && w.hint === "Niente scelto: spunta i file da raccogliere." && JSON.stringify(w.kinds) === JSON.stringify([["onedrive", 44], ["smb", 2]]) && w.disabled
    && w.why.length === 2 && w.why.some((x) => /imposta prima la cartella di OneDrive/.test(x)) && w.why.some((x) => /condivisione di rete/.test(x))
    && w.roots.length === 2 && !errors.length;
  return { pass, detail: { inMenu, ...w, errors } };
});

// ── MICRO-INSTALLER-PULSANTE ────────────────────────────────────────────────
test("IP2.pill", "INSTALLER-PULSANTE p.2 · «Ritrova i file» sempre a portata: nella barra in basso, accanto a «Log», «44 da collegare» su v4 senza cartella di OneDrive (gli onedrive:// contati a parte, nessun «0 file mancanti»); un clic apre «Ritrova i file…»; su un documento senza file mancanti l'indicatore non c'è", async () => {
  const { p, ctx, errors } = await wmOpenCopy();
  await p.waitForFunction(() => !document.getElementById("footer-missing")?.classList.contains("hidden"), null, { timeout: 120000 }).catch(() => {});
  const bar = await p.evaluate(() => {
    const b = document.getElementById("footer-missing");
    return { shown: !b.classList.contains("hidden"), text: b.textContent, title: b.title, missing: b.dataset.missing, link: b.dataset.link,
      besideLog: b.previousElementSibling?.id === "footer-log" && b.closest(".sb-log") !== null };
  });
  let asked = null;
  p.once("dialog", (d) => { asked = d.message(); void d.accept(WP_V4.replace(/\/EM\/[^/]+$/, "")); });
  await p.click("#footer-missing");
  const opened = await p.waitForSelector('.modal[data-dialog="relocate"]', { timeout: 180000 }).then(() => true, () => false);
  await p.screenshot({ path: SHOT("ip2-pill") }).catch(() => {});
  await ctx.close();
  const o = await open({ doc: "catena" });
  const none = await o.p.evaluate(() => document.getElementById("footer-missing")?.classList.contains("hidden"));
  await o.ctx.close();
  const pass = bar.shown && bar.text === "44 da collegare" && bar.missing === "0" && bar.link === "44" && bar.besideLog
    && /0 mancanti, 44 onedrive:\/\//.test(bar.title) && !!asked && opened && none === true && !errors.length && !o.errors.length;
  return { pass, detail: { bar, asked, opened, none, errors: [...errors, ...o.errors] } };
});

test("IP2.failmenu", "INSTALLER-PULSANTE p.2 · nell'Outliner dello Spazio il segno ⚠ di un modello che non arriva apre un piccolo menu: il motivo, poi «Ritrova…», che apre «Ritrova i file»; lo stesso «Ritrova…» in cima al menu del tasto destro sul modello", async () => {
  const { p, ctx, errors } = await wmOpen({ refuse: true });
  await p.waitForSelector(".sol-fail-menu", { timeout: 60000 });
  const mark = await p.evaluate(() => { const f = document.querySelector(".sol-fail-menu"); return { tag: f.tagName, title: f.title }; });
  await p.click(".sol-fail-menu");
  const menu = await p.evaluate(() => [...document.querySelectorAll(".scn-menu button")].map((b) => ({ act: b.dataset.s3, text: b.textContent, disabled: b.disabled })));
  let asked = null;
  p.once("dialog", (d) => { asked = d.message(); void d.dismiss(); });
  await p.click('.scn-menu button[data-s3="relocate"]');
  await p.waitForTimeout(600);
  // the right click on a model's row that did not come
  const row = p.locator(".sol-row.failed", { has: p.locator(".sol-fail-menu") }).first();
  const rowCount = await row.count();
  let ctxMenu = [];
  if (rowCount) {
    await row.click({ button: "right" });
    ctxMenu = await p.evaluate(() => [...document.querySelectorAll(".scn-menu button")].map((b) => b.dataset.s3));
  }
  await p.screenshot({ path: SHOT("ip2-failmenu") }).catch(() => {});
  await ctx.close();
  const pass = mark.tag === "BUTTON" && menu.length === 2 && menu[0].act === "fail-why" && menu[0].disabled && menu[0].text === mark.title
    && menu[1].act === "relocate" && menu[1].text === "Ritrova…" && !!asked && rowCount > 0 && ctxMenu[0] === "fail-why" && ctxMenu[1] === "relocate" && !errors.length;
  return { pass, detail: { mark, menu, asked, rowCount, ctxMenu: ctxMenu.slice(0, 4), errors } };
});

test("IP3.level", "INSTALLER-PULSANTE p.3 · il bridge che risponde è di un livello diverso da BRIDGE_LEVEL_WANTED: una riga nel Log (con url, PID e da quando) e un avviso — sul desktop «Il bridge che risponde è di una versione diversa (33 invece di 35): chiudi i processi em-bridge e riapri EMStudio», nel browser «…rilancialo (./dev.sh)»; detto una volta; il bridge di questo albero non dice niente", async () => {
  const wanted = Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(readFileSync(new URL("../src/main.ts", import.meta.url), "utf8"))[1]);
  const old = { pattern: `${BRIDGE}/health`, handler: (route) => route.fulfill({ status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, service: "em_bridge", bridge_level: 33, pid: 4242, started_at: "2026-10-20T08:00:00", sidecar: true }) }) };
  const said = async (p) => {
    await p.waitForFunction(() => window.__EM_DRAG__.log().some((e) => /versione diversa/.test(e.message)), null, { timeout: 20000 }).catch(() => {});
    return p.evaluate(() => ({ log: window.__EM_DRAG__.log().filter((e) => /versione diversa/.test(e.message)).map((e) => `${e.level} ${e.message}`),
      toast: document.getElementById("toast")?.classList.contains("hidden") ? null : document.getElementById("toast")?.textContent }));
  };
  // the browser, an old bridge
  const a = await open({ doc: null, route: old });
  const wa = await said(a.p);
  await a.ctx.close();
  // the desktop (IPC simulated), an old bridge
  const tauriHook = ([bridge]) => {
    let n = 1;
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
      transformCallback(cb) { const id = n++; window[`_${id}`] = cb; return id; },
      unregisterCallback() {}, convertFileSrc(x) { return x; },
      async invoke(cmd) {
        if (cmd === "transformer_url") return bridge;
        if (cmd === "take_desktop_queue") return { files: [], notices: [] };
        if (cmd === "llm_key_status") return { available: false, set: false, detail: "" };
        if (cmd === "plugin:event|listen") return n++;
        if (cmd === "plugin:fs|exists") return false;
        if (cmd.startsWith("plugin:menu|")) return [n++, ""];
        if (cmd.startsWith("plugin:window|") || cmd.startsWith("plugin:webview|")) return null;
        if (cmd.startsWith("plugin:app|")) return "1.6.0-dev.58";
        throw new Error(`not simulated: ${cmd}`);
      },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  };
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.route(old.pattern, old.handler);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await p.addInitScript(() => { try { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "it"); sessionStorage.setItem("probe", "1"); } } catch { /* */ } });
  await p.addInitScript(tauriHook, [BRIDGE]);
  await p.goto(`http://localhost:${PORT}/em/studio/`);
  await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 60000 });
  const wd = await said(p);
  await p.screenshot({ path: SHOT("ip3-level") }).catch(() => {});
  await ctx.close();
  // this tree's bridge: nothing
  const c = await open({ doc: null });
  await c.p.waitForTimeout(3000);
  const wc = await said(c.p);
  await c.ctx.close();
  const desk = `Il bridge che risponde è di una versione diversa (33 invece di ${wanted}): chiudi i processi em-bridge e riapri EMStudio`;
  const pass = wd.log.length === 1 && wd.log[0].startsWith(`warn ${desk} (${BRIDGE} · PID 4242 · acceso da 2026-10-20T08:00:00)`) && (wd.toast ?? "").startsWith(desk)
    && wa.log.length === 1 && /^warn Il bridge che risponde è di una versione diversa \(33 invece di \d+\): rilancialo \(\.\/dev\.sh\)/.test(wa.log[0])
    && wc.log.length === 0 && !errors.length && !a.errors.length && !c.errors.length;
  return { pass, detail: { wanted, desktop: wd, browser: wa, thisTree: wc, errors: [...errors, ...a.errors, ...c.errors] } };
});

// ── MICRO-PANNELLI-OVERLAY-TABULAR ───────────────────────────────────────────
// E.D.'s layout in the Space: the graph window (Matrix) narrow on the left, the
// 3D scene in the middle, the Tabular below the two, the Inspector on the right
const PO_LAYOUT = (graphFrac) => JSON.stringify({ space: {
  wins: [{ id: "space:1", type: "scene", state: {} },
    { id: "space:models", type: "table", state: { "current.table.sheet": "Models" } },
    { id: "space:canvas", type: "graph", state: { mode: "matrix" } },
    { id: "space:inspector", type: "inspector", state: {} }],
  activeId: "space:1",
  layout: { kind: "split", dir: "row", ratio: 0.8,
    a: { kind: "split", dir: "col", ratio: 0.72,
      a: { kind: "split", dir: "row", ratio: graphFrac, a: { kind: "leaf", winId: "space:canvas" }, b: { kind: "leaf", winId: "space:1" } },
      b: { kind: "leaf", winId: "space:models" } },
    b: { kind: "leaf", winId: "space:inspector" } } } });
const poOpen = (o = {}) => open({ locale: "en", w: 1728, h: 1000, init: { "emstudio.windows": PO_LAYOUT(0.3),
  "emstudio.workspaces.rev": "5", "emstudio.workspace": "space" }, ...o });
const poAreas = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll(".tile-area")].map((a) => {
  const r = a.getBoundingClientRect(); return [a.dataset.win, { x: r.left, y: r.top, w: r.width, h: r.height }]; })));
const poRect = (p, sel) => p.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((x) => !x.classList.contains("hidden") && x.getBoundingClientRect().width > 0);
  if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
const poInside = (b, a) => !!b && !!a && b.x >= a.x - 0.5 && b.x + b.w <= a.x + a.w + 0.5 && b.y >= a.y - 0.5 && b.y + b.h <= a.y + a.h + 0.5;
/** drag the divider at the graph window's right edge so the graph is `px` wide */
async function poGraphWidth(p, px) {
  const g = (await poAreas(p))["space:canvas"];
  const d = await p.evaluate((edge) => [...document.querySelectorAll(".tile-div:not(.hidden)")].map((x) => x.getBoundingClientRect())
    .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })).find((r) => Math.abs(r.x - edge) < 10 && r.h > 40), g.x + g.w);
  await p.mouse.move(d.x + d.w / 2, d.y + d.h / 2); await p.mouse.down();
  await p.mouse.move(g.x + px + d.w / 2, d.y + d.h / 2, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(300);
}

test("PO1.inside", "PANNELLI-OVERLAY p.1 · nel layout di E.D. (Matrix stretta a sinistra, scena 3D, Tabular sotto): con il grafo largo 380 e 260 px, il filtro e il glifo degli overlay stanno dentro il grafo e aprono «Overlays — Matrix» dentro di esso, che resta tale passando col mouse sulla scena; il glifo della scena apre «Overlays — Space» dentro la scena; il Tabular a fuoco non ha nessun glifo né pannello dentro di sé", async () => {
  const { p, ctx, errors } = await poOpen();
  const out = {};
  let ok = true;
  for (const px of [380, 260]) {
    await poGraphWidth(p, px);
    const A = await poAreas(p);
    const g = A["space:canvas"];
    await p.mouse.move(g.x + g.w / 2, g.y + g.h / 2); await p.waitForTimeout(250);
    const funnel = await poRect(p, "#btn-view-props"), glyph = await poRect(p, "#btn-overlays");
    // the pointer travels to the glyph from the graph's middle (focus follows the mouse)
    await p.mouse.move(glyph.x + glyph.w / 2, glyph.y + glyph.h / 2, { steps: 6 });
    await p.mouse.click(glyph.x + glyph.w / 2, glyph.y + glyph.h / 2); await p.waitForTimeout(300);
    const panel = await poRect(p, "#overlay-panel");
    const title = await p.evaluate(() => document.querySelector("#overlay-panel .fp-hint")?.textContent);
    const s = A["space:1"];
    await p.mouse.move(s.x + s.w / 2, s.y + s.h / 2, { steps: 6 }); await p.waitForTimeout(300);
    const titleAfter = await p.evaluate(() => document.querySelector("#overlay-panel .fp-hint")?.textContent);
    const panelAfter = await poRect(p, "#overlay-panel");
    await p.evaluate(() => document.querySelector("#overlay-panel .fp-close")?.click());
    out[px] = { w: Math.round(g.w), funnelIn: poInside(funnel, g), glyphIn: poInside(glyph, g), title, panelIn: poInside(panel, g), titleAfter, panelAfterIn: poInside(panelAfter, g) };
    ok &&= Math.abs(g.w - px) < 4 && out[px].funnelIn && out[px].glyphIn && title === "Overlays — Matrix" && out[px].panelIn && titleAfter === "Overlays — Matrix" && out[px].panelAfterIn;
  }
  await p.screenshot({ path: SHOT("po1-260") }).catch(() => {});
  // the scene's own glyph
  const A = await poAreas(p);
  const s = A["space:1"];
  await p.mouse.move(s.x + s.w / 2, s.y + s.h / 2); await p.waitForTimeout(250);
  const sg = await poRect(p, ".scn-ovbtn");
  await p.mouse.click(sg.x + sg.w / 2, sg.y + sg.h / 2); await p.waitForTimeout(300);
  const sp = await poRect(p, "#overlay-panel");
  out.scene = { glyphIn: poInside(sg, s), title: await p.evaluate(() => document.querySelector("#overlay-panel .fp-hint")?.textContent), panelIn: poInside(sp, s) };
  await p.evaluate(() => document.querySelector("#overlay-panel .fp-close")?.click());
  // the Tabular focused: nothing of the overlays inside it
  const tb = A["space:models"];
  await p.mouse.move(tb.x + tb.w / 2, tb.y + tb.h / 2, { steps: 4 }); await p.waitForTimeout(300);
  out.table = await p.evaluate((t) => [...document.querySelectorAll("#btn-overlays, #btn-view-props, .scn-ovbtn, #overlay-panel")]
    .filter((e) => !e.classList.contains("hidden")).map((e) => e.getBoundingClientRect())
    .filter((r) => r.width && r.left >= t.x && r.right <= t.x + t.w && r.top >= t.y && r.bottom <= t.y + t.h).length, tb);
  await ctx.close();
  const pass = ok && out.scene.glyphIn && out.scene.title === "Overlays — Space" && out.scene.panelIn && out.table === 0 && !errors.length;
  return { pass, detail: { ...out, errors } };
});

/** pick a sheet in the Space's Tabular (its rows) */
async function poSheet(p, sheet) {
  await p.evaluate((s) => document.querySelector(`.tile-area[data-win="space:models"] .dd-menu button[data-sheet="${s}"]`)?.click(), sheet);
  await p.waitForTimeout(700);
  await p.evaluate(() => { const b = [...document.querySelectorAll('.tile-area[data-win="space:models"] .tile-bar .win-seg button')].find((x) => /^(Rows|Righe)$/.test(x.textContent.trim())); if (b && b.getAttribute("aria-pressed") !== "true") b.click(); });
  await p.waitForTimeout(300);
}
/** what the Tabular's head shows, and whether, scrolled to `at`, the column headings and their filters are still seen */
const poHead = (p, at) => p.evaluate((at) => {
  const area = document.querySelector('.tile-area[data-win="space:models"]');
  const body = area.querySelector(".tile-tablebody");
  const bar = area.querySelector(":scope > .tile-bar");
  body.scrollTop = 0;
  const a = area.getBoundingClientRect();
  const first = [...body.querySelectorAll("table tbody tr")].find((tr) => tr.getBoundingClientRect().height > 0);
  const head = first ? Math.round(first.getBoundingClientRect().top - a.top) : null;
  const barRect = bar.getBoundingClientRect();
  const inBar = !!bar.querySelector(".fbar .fq") && !!bar.querySelector(".fbar .fcount");
  const rowsInBody = body.querySelectorAll(".fbar").length + [...body.querySelectorAll(".tt-bar")].filter((x) => x.getBoundingClientRect().height > 0).length;
  const clearShown = !bar.querySelector(".fclear")?.hidden;
  body.scrollTop = at;
  const b = body.getBoundingClientRect();
  const tb = document.elementFromPoint(b.left + 40, b.top + b.height * 0.75)?.closest("table");
  const seen = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + r.height / 2); return r.top >= b.top - 1 && !!hit && (hit === el || el.contains(hit)); };
  const th = tb?.tHead?.rows[0]?.cells[0];
  const filt = tb?.querySelector("tr.tt-filters .tt-filter")?.closest("th");
  const h4 = document.elementFromPoint(b.left + 60, b.top + 8)?.closest("h4")?.textContent ?? null;
  return { head, barH: Math.round(barRect.height), inBar, rowsInBody, clearShown, scrolled: body.scrollTop, headingSeen: seen(th), filterSeen: seen(filt), table: tb?.className ?? null, h4 };
}, at);

test("PO2.head", "PANNELLI-OVERLAY p.2 · il Tabular ha una sola riga di testa (tipo, scheda, Rows | Cards, Filter, chip, conteggio, «⋯»): niente seconda riga «Filter» né terza «Clear filters»; «Clear filters» compare solo con un filtro (anche di colonna) e li toglie tutti; scorrendo, intestazioni e filtri di colonna restano in alto in Units, Documents, Claims; nella vista dei modelli i proxy hanno il loro titolo e la loro testa", async () => {
  const { p, ctx, errors } = await poOpen({ doc: "TempluMare" });
  const out = {};
  for (const sh of ["Units", "Documents", "Claims"]) { await poSheet(p, sh); out[sh] = await poHead(p, 300); }
  // a column filter: «Clear filters» appears in the head row and clears it
  await poSheet(p, "Units");
  const col = await p.evaluate(() => { const c = document.querySelector('.tile-area[data-win="space:models"] .tile-tablebody input.tt-filter'); return c?.dataset.col ?? null; });
  await p.fill(`.tile-area[data-win="space:models"] .tile-tablebody input.tt-filter[data-col="${col}"]`, "1");
  await p.waitForTimeout(250);
  const filtered = await p.evaluate(() => { const bar = document.querySelector('.tile-area[data-win="space:models"] > .tile-bar');
    return { clearShown: !bar.querySelector(".fclear").hidden, count: bar.querySelector(".fcount").textContent }; });
  await p.click('.tile-area[data-win="space:models"] > .tile-bar .fclear');
  await p.waitForTimeout(250);
  const cleared = await p.evaluate(() => { const area = document.querySelector('.tile-area[data-win="space:models"]');
    return { clearShown: !area.querySelector(".tile-bar .fclear").hidden, left: [...area.querySelectorAll(".tt-filter")].filter((c) => c.value).length, count: area.querySelector(".tile-bar .fcount").textContent }; });
  // the models view, scrolled to the end: the proxies' own title and head
  await poSheet(p, "Models");
  out.Models = await poHead(p, 1e6);
  await p.screenshot({ path: SHOT("po2-head") }).catch(() => {});
  await ctx.close();
  const one = (r) => r.inBar && r.rowsInBody === 0 && !r.clearShown && r.headingSeen && r.filterSeen && r.scrolled > 0;
  const pass = ["Units", "Documents", "Claims"].every((k) => one(out[k]))
    && out.Models.inBar && /mdl-px/.test(out.Models.table ?? "") && out.Models.headingSeen && /prox/i.test(out.Models.h4 ?? "")
    && !!col && filtered.clearShown && cleared.clearShown === false && cleared.left === 0 && filtered.count !== cleared.count && !errors.length;
  return { pass, detail: { ...out, col, filtered, cleared, errors } };
});

/** the Tabular's «⋯»: absent, or the items it lists when opened */
async function poMenu(p) {
  const T = '.tile-area[data-win="space:models"] > .tile-bar';
  if (!(await p.locator(`${T} .win-more`).count())) return null;
  await p.click(`${T} .win-more`); await p.waitForTimeout(200);
  const items = await p.evaluate((T) => [...document.querySelectorAll(`${T} .win-menu .dd-menu button`)].map((b) => b.textContent.trim()), T);
  await p.keyboard.press("Escape"); await p.evaluate((T) => document.querySelector(`${T} .win-menu .dd-menu`)?.classList.add("hidden"), T);
  return items;
}

test("PO3.menu", "PANNELLI-OVERLAY p.3 · il «⋯» del Tabular: senza em.json non c'è, e compare quando il file si apre; «Add row» dove si aggiunge una riga, «Add a claim» solo nei Claims, «Delete the current row» solo con una riga scelta, niente nelle viste calcolate; tutto nella lingua dell'interfaccia (in italiano «Aggiungi riga», «Aggiungi claim»; le intestazioni delle schede tradotte)", async () => {
  const a = await poOpen({ doc: null });
  await poSheet(a.p, "Documents");
  const empty = await poMenu(a.p);
  await a.p.evaluate((d) => window.__EM_DRAG__.openAt(d, "/tmp/po3/TempluMare.em.json"), fixture("TempluMare"));
  await a.p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 0, null, { timeout: 30000 });
  await a.p.waitForTimeout(600);
  const opened = await poMenu(a.p);
  const out = { empty, opened };
  await poSheet(a.p, "Units"); out.units = await poMenu(a.p);
  await a.p.click('.tile-area[data-win="space:models"] .tile-tablebody table.emdata-table tbody tr td:nth-child(2)');
  await a.p.waitForTimeout(300);
  out.unitsRow = await poMenu(a.p);
  await poSheet(a.p, "Claims"); out.claims = await poMenu(a.p);
  await poSheet(a.p, "Models"); out.models = await poMenu(a.p);
  await poSheet(a.p, "Issues"); out.issues = await poMenu(a.p);
  await a.p.screenshot({ path: SHOT("po3-menu") }).catch(() => {});
  await a.ctx.close();
  const b = await poOpen({ doc: "TempluMare", locale: "it" });
  await poSheet(b.p, "Units"); out.itUnits = await poMenu(b.p);
  out.itHeads = await b.p.evaluate(() => [...document.querySelectorAll('.tile-area[data-win="space:models"] table.emdata-table thead tr:first-child th')].map((th) => th.textContent.trim()).filter(Boolean));
  await poSheet(b.p, "Claims"); out.itClaims = await poMenu(b.p);
  await b.ctx.close();
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const pass = empty === null && eq(opened, ["Add row"]) && eq(out.units, ["Add row"]) && eq(out.unitsRow, ["Add row", "Delete the current row"])
    && eq(out.claims, ["Add a claim"]) && out.models === null && out.issues === null
    && eq(out.itUnits, ["Aggiungi riga"]) && eq(out.itClaims, ["Aggiungi claim"]) && out.itHeads.includes("Nome") && out.itHeads.includes("Prima epoca")
    && !a.errors.length && !b.errors.length;
  return { pass, detail: { ...out, errors: [...a.errors, ...b.errors] } };
});

// p.4 needs the GT16 (Templu Mare v4, a COPY: `PANNELLI_V4`)
const PO_V4 = benchFile("PANNELLI_V4");
const poName = (p) => p.evaluate(() => { const id = window.__EM_DRAG__.selected()[0]; return id ? String(window.__EM_DRAG__.node(id)?.name ?? id) : null; });
const poInspector = (p) => p.evaluate(() => document.querySelector('.tile-area[data-win="space:inspector"] .insp-name-row .insp-name-input')?.value
  ?? document.querySelector('.tile-area[data-win="space:inspector"] .insp-name-row')?.textContent?.trim() ?? null);
/** the gutter ▸ of the row named `name` in the Space's Tabular */
const poPickRow = async (p, name) => {
  const id = await p.evaluate((n) => [...document.querySelectorAll('.tile-area[data-win="space:models"] .tile-tablebody tr[data-row]')]
    .map((tr) => tr.dataset.row).find((r) => String(window.__EM_DRAG__.node(r)?.name ?? "") === n), name);
  await p.click(`.tile-area[data-win="space:models"] .tile-tablebody [data-pick="${id}"]`);
  await p.waitForTimeout(400);
  return id;
};

test("PO4.arrows", "PANNELLI-OVERLAY p.4 · le frecce nelle liste: GT16, Tabular Documents, scelta D.02, ↓ → D.03 (selezione e Inspector), ancora ↓ → D.04; Units, ↑ dalla seconda riga → la prima; la riga resta in vista sotto la testa; nel pannello laterale dello Spazio ↓ passa alla riga dopo; una cella in scrittura tiene le sue frecce", async () => {
  if (!existsSync(PO_V4)) return { pass: false, detail: { missing: PO_V4 } };
  const { p, ctx, errors } = await poOpen({ doc: null });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(PO_V4, "utf8")), PO_V4]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  const out = {};
  await poSheet(p, "Documents");
  // sorted by ID, as in E.D.'s screenshot («ID ▲»): the arrows follow the order on screen
  await p.evaluate(() => { const th = document.querySelector('.tile-area[data-win="space:models"] table.emdata-table thead tr:first-child th[data-tt-label="ID"]');
    if (th?.getAttribute("aria-sort") !== "ascending") th?.querySelector(".tt-sort")?.click(); });
  await p.waitForTimeout(300);
  out.sorted = await p.evaluate(() => document.querySelector('.tile-area[data-win="space:models"] table.emdata-table th[data-tt-label="ID"]')?.getAttribute("aria-sort"));
  await poPickRow(p, "D.02");
  out.picked = await poName(p);
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(500);
  out.down1 = { sel: await poName(p), insp: await poInspector(p) };
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(500);
  out.down2 = await poName(p);
  // in view, under the head that stays
  out.inView = await p.evaluate(() => { const body = document.querySelector('.tile-area[data-win="space:models"] .tile-tablebody');
    const tr = body.querySelector("tr.tv-sel-act, tr.emdata-current"); if (!tr) return false;
    const r = tr.getBoundingClientRect(), h = tr.closest("table").tHead.getBoundingClientRect(), b = body.getBoundingClientRect();
    return r.top >= h.bottom - 1 && r.bottom <= b.bottom + 1; });
  // a cell being written keeps its arrows
  const title = '.tile-area[data-win="space:models"] .tile-tablebody tr.tv-sel-act input[data-col="TITLE"], .tile-area[data-win="space:models"] .tile-tablebody tr.emdata-current input[data-col="TITLE"]';
  await p.click(title); await p.keyboard.type("x"); await p.keyboard.press("ArrowDown"); await p.waitForTimeout(300);
  out.writing = await poName(p);
  await p.keyboard.press("Backspace"); await p.keyboard.press("Escape");
  // the Units: ↑ from the second row
  await poSheet(p, "Units");
  const names = await p.evaluate(() => [...document.querySelectorAll('.tile-area[data-win="space:models"] .tile-tablebody tr[data-row]')]
    .filter((tr) => !tr.classList.contains("tt-hidden")).slice(0, 2).map((tr) => String(window.__EM_DRAG__.node(tr.dataset.row)?.name ?? "")));
  await poPickRow(p, names[1]);
  await p.keyboard.press("ArrowUp"); await p.waitForTimeout(500);
  out.units = { names, up: await poName(p) };
  // the Space's side panel
  const keys = await p.evaluate(() => [...document.querySelectorAll(".sol-row")].filter((r) => /^proxy:/.test(r.dataset.key ?? "") && r.getBoundingClientRect().height > 0).slice(0, 2).map((r) => r.dataset.key));
  if (keys.length === 2) {
    await p.click(`.sol-row[data-key="${keys[0]}"]`); await p.waitForTimeout(400);
    const s0 = await p.evaluate(() => window.__EM_DRAG__.selected()[0]);
    const nextKey = await p.evaluate(() => { const ls = [...document.querySelectorAll(".sol-row")]; const i = ls.findIndex((l) => l.classList.contains("active")); return ls[i + 1]?.dataset.key ?? null; });
    await p.keyboard.press("ArrowDown"); await p.waitForTimeout(500);
    out.space = { s0, nextKey, active: await p.evaluate(() => document.querySelector(".sol-row.active")?.dataset.key ?? null) };
  }
  await p.screenshot({ path: SHOT("po4-arrows") }).catch(() => {});
  await ctx.close();
  const pass = out.picked === "D.02" && out.down1.sel === "D.03" && out.down1.insp === "D.03" && out.down2 === "D.04" && out.inView
    && out.writing === "D.04" && out.units.up === out.units.names[0]
    && !!out.space && out.space.nextKey && out.space.active === out.space.nextKey && !errors.length;
  return { pass, detail: { ...out, errors } };
});

// ── MICRO-GLIFI-OVERLAY-CONTINUITA · the GT16 (Templu Mare v4, a COPY: `GLIFI_V4`) ──
const GL_V4 = benchFile("GLIFI_V4");
const glOpen = async () => {
  const o = await open({ doc: null, locale: "en", w: 1728, h: 1000 });
  await o.p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(GL_V4, "utf8")), GL_V4]);
  await o.p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await o.p.waitForTimeout(1500);
  return o;
};
/** the Matrix framed at `s` around a world point (the probes' camera) */
const glFrame = async (p, s, cx = 2300, cy = 1080) => {
  const r = await p.evaluate(() => window.__EM_DRAG__.winScene(window.__EM_DRAG__.wins().find((w) => w.type === "graph")?.id ?? "canvas:1")?.rect);
  const w = (r.w - 60) / s, h = (r.h - 60) / s;
  await p.evaluate(([x, y, w, h]) => window.__EM_DRAG__.frameWorld(x, y, w, h, 30), [cx - w / 2, cy - h / 2, w, h]);
  await p.waitForTimeout(400);
  return r;
};

test("GL1.glyphs", "GLIFI-OVERLAY p.1 · i glifi decorativi non superano 0,75 dell'unità a schermo: GT16, Matrix a scala 0,2 nessun chip PD né distintivo (nascosti da lontano), a 0,4 i chip PD alti ≤ 0,75 × 12,8 px (prima: 14 fissi), a 0,6 intatti (14 px); un chip a 0,4 resta cliccabile (entra nel gruppo); «Nascondi i glifi da lontano» acceso di default nel pannello, spento i chip a 0,2 restano, ≤ 4,8 px", async () => {
  if (!existsSync(GL_V4)) return { pass: false, detail: { missing: GL_V4 } };
  const { p, ctx, errors } = await glOpen();
  const out = {};
  const read = () => p.evaluate(() => ({ chips: window.__EM_DRAG__.pdChips().map((c) => Math.round(c.h * 100) / 100),
    badges: window.__EM_DRAG__.adornmentHits().length }));
  await glFrame(p, 0.2, 1866, 1098); out.far = await read();
  await glFrame(p, 0.6); out.mid = await read();
  const rect = await glFrame(p, 0.4); out.between = await read();
  // a chip still answers a click: it solos its group
  const chip = await p.evaluate(() => window.__EM_DRAG__.pdChips()[0] ?? null);
  if (chip) {
    await p.mouse.click(rect.x + chip.x + chip.w / 2, rect.y + chip.y + chip.h / 2);
    await p.waitForTimeout(800);
    out.clicked = await p.evaluate(() => window.__EM_DRAG__.context().length);
  }
  // the switch, in the panel, on by default; off, the far chips stay (capped)
  out.panel = await p.evaluate(() => { document.querySelector("#btn-overlays")?.click(); return document.querySelector('#overlay-panel [data-ov="hide_far"]')?.checked ?? null; });
  out.state = await p.evaluate(() => window.__EM_DRAG__.overlays("matrix"));
  await p.evaluate(() => { const ctx = window.__EM_DRAG__.context(); if (ctx.length) window.__EM_DRAG__.goBack?.(); });
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  await p.evaluate(() => window.__EM_DRAG__.setOverlays("matrix", { keepFar: true }));
  await glFrame(p, 0.2, 1866, 1098); out.farKept = await read();
  await p.screenshot({ path: SHOT("gl1-glyphs") }).catch(() => {});
  await ctx.close();
  const pass = out.far.chips.length === 0 && out.far.badges === 0
    && out.between.chips.length > 20 && out.between.chips.every((h) => h <= 0.75 * 12.8 + 0.01)
    && out.mid.chips.length > 20 && out.mid.chips.every((h) => Math.abs(h - 14) < 0.01)
    && out.clicked > 0 && out.panel === true && out.state.hideFar === true
    && out.farKept.chips.length > 50 && out.farKept.chips.every((h) => h <= 0.75 * 6.4 + 0.01) && !errors.length;
  return { pass, detail: { far: out.far, mid: out.mid.chips.slice(0, 3), between: out.between.chips.slice(0, 3), n: out.between.chips.length,
    clicked: out.clicked, panel: out.panel, state: out.state, farKept: out.farKept.chips.slice(0, 3), errors } };
});

test("GL2.defaults", "GLIFI-OVERLAY p.2 · le sovrapposizioni di base sono quelle del pannello di E.D.: chi non ha una scelta salvata apre la Matrix del GT16 con Autore, Autore IA, Licenza, Embargo accesi, Ereditato spento (nessun distintivo ereditato disegnato), tutto il resto acceso; una scelta salvata resta; «Restore the default overlays» torna alla base", async () => {
  if (!existsSync(GL_V4)) return { pass: false, detail: { missing: GL_V4 } };
  const { p, ctx, errors } = await glOpen();
  const out = {};
  await glFrame(p, 0.6);
  out.state = await p.evaluate(() => window.__EM_DRAG__.overlays("matrix"));
  out.drawn = await p.evaluate(() => window.__EM_DRAG__.overlaysDrawn());
  out.panel = await p.evaluate(() => { document.querySelector("#btn-overlays")?.click();
    return Object.fromEntries([...document.querySelectorAll("#overlay-panel input[type=checkbox][data-ov]")].map((c) => [c.dataset.ov, c.checked])); });
  out.reset = await p.evaluate(() => document.querySelector("#overlay-panel .fp-reset")?.textContent ?? null);
  // a choice: the lock off and the inherited on; remembered; the reset comes back to the base
  await p.evaluate(() => window.__EM_DRAG__.setOverlays("matrix", { off: ["lock"] }));
  out.chosen = await p.evaluate(() => JSON.parse(localStorage.getItem("emstudio.overlays") ?? "{}"));
  await p.evaluate(() => document.querySelector("#overlay-panel .fp-reset")?.click());
  out.afterReset = await p.evaluate(() => window.__EM_DRAG__.overlays("matrix"));
  await ctx.close();
  // a saved choice stays: a person who had everything on keeps it
  const b = await open({ doc: "catena", locale: "en", init: { "emstudio.overlays": JSON.stringify({ "-": { matrix: { master: true, off: ["lock"] } } }) } });
  out.saved = await b.p.evaluate(() => window.__EM_DRAG__.overlays("matrix"));
  await b.ctx.close();
  const on = ["author", "author_ai", "license", "embargo", "pd_chip", "pd_tablet", "instance_badge", "trace", "doc_uses", "lane_pd_tag", "date_invite", "warning", "lane_warning", "ai_chip", "name_status", "version_format", "has_3d", "genre", "lock", "fold_count"];
  const pass = JSON.stringify(out.state.off) === JSON.stringify(["inherited"]) && out.state.master === true
    && !out.drawn.inherited && (out.drawn.has_3d ?? 0) > 0 && (out.drawn.pd_chip ?? 0) > 0
    && out.panel.inherited === false && on.every((k) => out.panel[k] === true) && out.panel.master === true
    && out.reset === "Restore the default overlays"
    && JSON.stringify(out.chosen["-"]?.matrix?.off) === JSON.stringify(["lock"])
    && JSON.stringify(out.afterReset.off) === JSON.stringify(["inherited"])
    && JSON.stringify(out.saved.off) === JSON.stringify(["lock"]) && !errors.length && !b.errors.length;
  return { pass, detail: { ...out, errors: [...errors, ...b.errors] } };
});

test("GL3.continuity", "GLIFI-OVERLAY p.3 · il nodo di continuità: nel GT16 i due BR di XX sec stanno dritti sopra SU002 e SU019, nella corsia di XX sec; la sovrapposizione «Continuity» (Tempo, accesa) spenta toglie i BR dal disegno e lascia il dato; dall'Inspector «End in…» su SU003 (Post antiquity, destroyed, D.02) e «Survives until…» su USV132 (XX sec) creano il BR e i suoi archi, un annulla ciascuno; il menu dell'unità offre il verbo", async () => {
  if (!existsSync(GL_V4)) return { pass: false, detail: { missing: GL_V4 } };
  const { p, ctx, errors } = await glOpen();
  const out = {};
  const geom = () => p.evaluate(() => { const g = window.__EM_DRAG__.matrixGeom(); for (const n of g.nodes) n.name = window.__EM_DRAG__.node(n.id)?.name; return g; });
  let g = await geom();
  const by = (name) => g.nodes.find((n) => n.name === name);
  const laneOf = (n) => g.lanes.find((l) => n.y >= l.y && n.y + n.h <= l.y + l.height)?.label ?? null;
  const brs = g.nodes.filter((n) => n.type === "BR");
  const units = await p.evaluate((ids) => ids.map((id) => window.__EM_DRAG__.edgesOf("is_after").find((e) => e.source === id)?.target), brs.map((b) => b.id));
  out.straight = brs.map((b, i) => { const u = g.nodes.find((n) => n.id === units[i]);
    return { unit: u?.name, dx: u ? Math.abs((b.x + b.w / 2) - (u.x + u.w / 2)) : null, lane: laneOf(b), above: u ? b.y + b.h <= u.y : null }; });
  // the overlay: in Time, on; off, the BRs leave the drawing, the data stays
  out.panelItem = await p.evaluate(() => { document.querySelector("#btn-overlays")?.click();
    const cb = document.querySelector('#overlay-panel .ov-group[data-group="time"] input[data-ov="continuity"]'); return cb ? cb.checked : null; });
  await p.evaluate(() => document.querySelector('#overlay-panel input[data-ov="continuity"]')?.click());
  await p.waitForTimeout(400);
  out.offDrawn = await p.evaluate((ids) => ids.filter((id) => window.__EM_DRAG__.viewNodeIds("matrix").includes(id)).length, brs.map((b) => b.id));
  out.offData = await p.evaluate((ids) => ids.filter((id) => !!window.__EM_DRAG__.node(id)).length, brs.map((b) => b.id));
  await p.evaluate(() => document.querySelector('#overlay-panel input[data-ov="continuity"]')?.click());
  await p.waitForTimeout(400);
  out.onDrawn = await p.evaluate((ids) => ids.filter((id) => window.__EM_DRAG__.viewNodeIds("matrix").includes(id)).length, brs.map((b) => b.id));
  await p.keyboard.press("Escape");
  // the two verbs, from the Inspector
  const insp = await p.evaluate(() => window.__EM_DRAG__.wins().find((w) => w.type === "inspector")?.id);
  const verb = async (name, epoch, reason, doc) => {
    const id = by(name).id;
    await p.evaluate((x) => window.__EM_DRAG__.select(x), id);
    await p.waitForTimeout(500);
    const btn = `.tile-area[data-win="${insp}"] [data-cmd^="continuity-"]`;
    const label = await p.textContent(btn);
    await p.click(btn); await p.waitForTimeout(300);
    await p.selectOption('.cont-form select[data-cont="epoch"]', g.lanes.find((l) => l.label === epoch).id);
    if (reason) await p.selectOption('.cont-form select[data-cont="reason"]', reason);
    if (doc) await p.selectOption('.cont-form select[data-cont="source"]', await p.evaluate((n) => [...document.querySelectorAll('.cont-form select[data-cont="source"] option')].find((o) => o.textContent.split(" · ")[0] === n)?.value, doc));
    const u0 = await p.evaluate(() => window.__EM_DRAG__.undoDepth());
    await p.click('.cont-form [data-cont="apply"]'); await p.waitForTimeout(700);
    const c = await p.evaluate((x) => window.__EM_DRAG__.continuityOf(x), id);
    return { label, steps: (await p.evaluate(() => window.__EM_DRAG__.undoDepth())) - u0, c,
      survive: await p.evaluate((x) => window.__EM_DRAG__.edgesOf("survive_in_epoch").filter((e) => e.source === x).map((e) => window.__EM_DRAG__.node(e.target)?.name).sort(), id),
      doc: c ? await p.evaluate((b) => window.__EM_DRAG__.edgesOf("has_documentation").filter((e) => e.source === b).map((e) => window.__EM_DRAG__.node(e.target)?.name), c.br) : null,
      state: await p.evaluate((w) => document.querySelector(`.tile-area[data-win="${w}"] .insp-cont-state`)?.textContent ?? null, insp) };
  };
  out.us = await verb("SU003", "Post antiquity", "destroyed", "D.02");
  out.usv = await verb("USV132", "XX sec", null, null);
  g = await geom();
  const placed = (name, c) => { const u = by(name), b = g.nodes.find((n) => n.id === c?.br); return b ? { dx: Math.abs((b.x + b.w / 2) - (u.x + u.w / 2)), lane: laneOf(b) } : null; };
  out.usPlaced = placed("SU003", out.us.c);
  out.usvPlaced = placed("USV132", out.usv.c);
  // the unit's menu offers the verb
  const box = await p.evaluate((id) => window.__EM_DRAG__.winScene(window.__EM_DRAG__.wins().find((w) => w.type === "graph").id).boxes.find((b) => b.id === id), by("USV132").id);
  await glFrame(p, 0.6, by("USV132").x + 45, by("USV132").y);
  const box2 = await p.evaluate((id) => window.__EM_DRAG__.winScene(window.__EM_DRAG__.wins().find((w) => w.type === "graph").id).boxes.find((b) => b.id === id), by("USV132").id);
  await p.mouse.click(box2.x + box2.w / 2, box2.y + box2.h / 2, { button: "right" }); await p.waitForTimeout(400);
  out.menu = await p.evaluate(() => [...document.querySelectorAll(".ctx-menu button[data-cmd^='continuity-']")].map((b) => b.textContent));
  await p.keyboard.press("Escape"); await p.evaluate(() => document.querySelector(".ctx-menu")?.remove());
  await glFrame(p, 0.35, by("USV132").x + 45, 700);
  await p.screenshot({ path: SHOT("gl3-continuity") }).catch(() => {});
  // one undo each
  await p.evaluate(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(300);
  out.undo1 = await p.evaluate(([a, b]) => [!!window.__EM_DRAG__.continuityOf(a), !!window.__EM_DRAG__.continuityOf(b)], [by("USV132").id, by("SU003").id]);
  await p.evaluate(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(300);
  out.undo2 = await p.evaluate(([a, b]) => [!!window.__EM_DRAG__.continuityOf(a), !!window.__EM_DRAG__.continuityOf(b)], [by("USV132").id, by("SU003").id]);
  void box;
  await ctx.close();
  const pass = out.straight.length === 2 && out.straight.every((x) => x.dx < 0.5 && x.lane === "XX sec" && x.above)
    && out.panelItem === true && out.offDrawn === 0 && out.offData === 2 && out.onDrawn === 2
    && out.us.label === "End in…" && out.us.steps === 1 && out.us.c?.reason === "destroyed" && JSON.stringify(out.us.survive) === JSON.stringify(["Post antiquity"])
    && JSON.stringify(out.us.doc) === JSON.stringify(["D.02"]) && /Ends in Post antiquity/.test(out.us.state ?? "")
    && out.usv.label === "Survives until…" && out.usv.steps === 1 && JSON.stringify(out.usv.survive) === JSON.stringify(["Post antiquity", "XX sec"])
    && out.usPlaced?.dx < 0.5 && out.usPlaced?.lane === "Post antiquity" && out.usvPlaced?.dx < 0.5 && out.usvPlaced?.lane === "XX sec"
    && JSON.stringify(out.menu) === JSON.stringify(["Survives until…"])
    && JSON.stringify(out.undo1) === JSON.stringify([false, true]) && JSON.stringify(out.undo2) === JSON.stringify([false, false]) && !errors.length;
  return { pass, detail: { ...out, errors } };
});

test("GL4.positions", "GLIFI-OVERLAY p.4 · la posizione di un nodo la decide la persona: GT16, gruppo PD di VSF125 aperto sul posto, trascinati combinatore, estrattore e istanza di documento e la scatola del gruppo: restano dopo chiudi/riapri, un'unità spostata in un'altra epoca, un anello del filtro spento e riacceso; nel soloing del gruppo combinatore, estrattore e istanza trascinati restano dopo uscita e rientro; spegnere un anello o chiudere un'attività non sposta nessun altro nodo della Matrix", async () => {
  if (!existsSync(GL_V4)) return { pass: false, detail: { missing: GL_V4 } };
  const { p, ctx, errors } = await glOpen();
  const D = (f, a) => p.evaluate(f, a);
  const W = await D(() => window.__EM_DRAG__.wins().find((w) => w.type === "graph").id);
  const out = {};
  const snap = () => D(() => Object.fromEntries(window.__EM_DRAG__.matrixGeom().nodes.map((n) => [n.id, [Math.round(n.x), Math.round(n.y)]])));
  const moved = (a, b, skip = []) => Object.keys(a).filter((id) => b[id] && !skip.includes(id) && Math.abs(a[id][0] - b[id][0]) + Math.abs(a[id][1] - b[id][1]) > 1).length;
  // the group: VSF125's paradata, with a combiner, an extractor and a document instance
  const grp = await D(() => { const E = window.__EM_DRAG__; const g = E.edgesOf("has_paradata_nodegroup").find((e) => E.node(e.source)?.name === "VSF125")?.target;
    const mem = E.edgesOf("is_in_paradata_nodegroup").filter((e) => e.target === g).map((e) => e.source);
    return { g, combiner: mem.find((m) => E.node(m)?.node_type === "combiner"), extractor: mem.find((m) => E.node(m)?.node_type === "extractor"), property: mem.find((m) => E.node(m)?.node_type === "property") }; });
  // the whole Matrix: a ring off and on, an activity closed and opened
  let s0 = await snap();
  await p.click("#btn-view-props"); await p.waitForTimeout(300);
  const ring = () => D(() => { const r = [...document.querySelectorAll("#filter-panel .fp-row")].find((x) => /^Continuity \(BR\)/.test(x.textContent.trim())); r?.querySelector("input")?.click(); return !!r; });
  out.ring = await ring(); await p.waitForTimeout(2500);
  out.ringMoved = moved(s0, await snap());
  await ring(); await p.waitForTimeout(2500);
  await p.keyboard.press("Escape");
  s0 = await snap();
  const act = await D(() => window.__EM_DRAG__.matrixGeom().nodes.find((n) => n.isGroup && n.type === "ActivityNodeGroup")?.id);
  await D((g) => window.__EM_DRAG__.fold(g, true), act); await p.waitForTimeout(2500);
  out.foldMoved = moved(s0, await snap(), [act]);
  await D((g) => window.__EM_DRAG__.fold(g, false), act); await p.waitForTimeout(2500);
  // a node born: a proposed place, kept through a ring off and on and a fold
  // …born from «Add» at the cursor, in an empty place of XX sec
  const sb = await snap();
  const rr = await glFrame(p, 0.6, 3500, 150);
  await p.mouse.click(rr.x + rr.w / 2, rr.y + rr.h / 2, { button: "right" }); await p.waitForTimeout(500);
  await p.fill(".addm .addm-q", "US"); await p.waitForTimeout(300);
  await p.click(".addm .addm-item"); await p.waitForTimeout(1500);
  const sa = await snap();
  const born = Object.keys(sa).find((id) => !sb[id]) ?? null;
  const bornAt0 = born ? sa[born] : null;
  await p.click("#btn-view-props"); await p.waitForTimeout(300);
  await ring(); await p.waitForTimeout(1500); await ring(); await p.waitForTimeout(1500);
  await p.keyboard.press("Escape");
  await D((g) => window.__EM_DRAG__.fold(g, true), act); await p.waitForTimeout(1500);
  await D((g) => window.__EM_DRAG__.fold(g, false), act); await p.waitForTimeout(1500);
  out.born = { at: bornAt0, after: (await snap())[born] ?? null };
  // in place
  await D((g) => window.__EM_DRAG__.fold(g, false), grp.g); await p.waitForTimeout(1200);
  const at = (sid) => D((sid) => { const n = window.__EM_DRAG__.matrixGeom().nodes.find((x) => x.id === sid); return n ? [Math.round(n.x), Math.round(n.y)] : null; }, sid);
  const scr = (id) => D(([w, id]) => { const ws = window.__EM_DRAG__.winScene(w); const b = ws.boxes.find((x) => x.id === id || x.instanceOf === id); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2, sid: b.id, scale: ws.scale, ox: ws.origin?.x, oy: ws.origin?.y, rx: ws.rect.x, ry: ws.rect.y } : null; }, [W, id]);
  const g0 = await D((g) => window.__EM_DRAG__.matrixGeom().nodes.find((n) => n.id === g), grp.g);
  const r = await D((w) => window.__EM_DRAG__.winScene(w).rect, W);
  await D(([x, y, w, h]) => window.__EM_DRAG__.frameWorld(x, y, w, h, 30), [g0.x + g0.w / 2 - (r.w - 60) / 2, g0.y + g0.h / 2 - (r.h - 60) / 2, r.w - 60, r.h - 60]);
  await p.waitForTimeout(500);
  const drag = async (id, dx = 70, dy = 45) => { const b = await scr(id); if (!b) return null;
    await p.mouse.move(b.x, b.y); await p.mouse.down(); await p.mouse.move(b.x + dx / 2, b.y + dy / 2, { steps: 4 }); await p.mouse.move(b.x + dx, b.y + dy, { steps: 4 }); await p.mouse.up();
    await p.waitForTimeout(700); return b.sid; };
  const inst = await D(([w]) => window.__EM_DRAG__.winScene(w).boxes.find((b) => b.instanceOf)?.id, [W]);
  const place = {};
  for (const [k, id] of Object.entries({ combiner: grp.combiner, extractor: grp.extractor, instance: inst })) {
    const before = await at(id); const sid = await drag(id); place[k] = { sid, before, after: await at(sid) };
  }
  // the box: dragged by its title bar
  const gb = await D(([w, g]) => window.__EM_DRAG__.winScene(w).boxes.find((b) => b.id === g), [W, grp.g]);
  const boxBefore = await at(grp.g);
  await p.mouse.move(gb.x + 40, gb.y + 8); await p.mouse.down(); await p.mouse.move(gb.x + 80, gb.y + 8, { steps: 4 }); await p.mouse.move(gb.x + 120, gb.y - 2, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(800);
  out.box = { before: boxBefore, after: await at(grp.g) };
  for (const v of Object.values(place)) v.afterBox = await at(v.sid);
  // close and reopen, an epoch change elsewhere, a ring off and on
  await D((g) => window.__EM_DRAG__.fold(g, true), grp.g); await p.waitForTimeout(600);
  await D((g) => window.__EM_DRAG__.fold(g, false), grp.g); await p.waitForTimeout(1000);
  for (const v of Object.values(place)) v.reopen = await at(v.sid);
  out.box.reopen = await at(grp.g);
  const other = await D(() => { const g = window.__EM_DRAG__.matrixGeom(); return { u: g.nodes.find((n) => n.type === "US" && !n.group && n.y > g.lanes[2].y)?.id, ep: g.lanes[1].id }; });
  out.epochUnit = other.u ? true : null;
  await D(([u, e]) => window.__EM_DRAG__.setFirstEpoch?.([u], e), [other.u, other.ep]); await p.waitForTimeout(1500);
  for (const v of Object.values(place)) v.epoch = await at(v.sid);
  await p.click("#btn-view-props"); await p.waitForTimeout(300);
  await ring(); await p.waitForTimeout(2000); await ring(); await p.waitForTimeout(2000);
  await p.keyboard.press("Escape");
  for (const v of Object.values(place)) v.filter = await at(v.sid);
  // the soloing: world positions relative to an untouched property
  await D((g) => window.__EM_DRAG__.enterGroup(g), grp.g); await p.waitForTimeout(1200);
  const rel = async (id) => { const a = await scr(id), q = await scr(grp.property); return a && q ? [Math.round((a.x - q.x) / a.scale), Math.round((a.y - q.y) / a.scale)] : null; };
  const solo = {};
  const sinst = await D(([w]) => window.__EM_DRAG__.winScene(w).boxes.find((b) => b.instanceOf)?.id, [W]);
  for (const [k, id] of Object.entries({ combiner: grp.combiner, extractor: grp.extractor, instance: sinst })) {
    const before = await rel(id); await drag(id, 60, 40); solo[k] = { before, after: await rel(id) };
  }
  await D(() => window.__EM_DRAG__.goBack()); await p.waitForTimeout(700);
  await D((g) => window.__EM_DRAG__.enterGroup(g), grp.g); await p.waitForTimeout(1200);
  for (const [k, v] of Object.entries(solo)) v.reenter = await rel(k === "instance" ? sinst : grp[k]);
  await p.screenshot({ path: SHOT("gl4-positions") }).catch(() => {});
  await ctx.close();
  const same = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
  const placedOk = Object.values(place).every((v) => v.before && v.after && !same(v.before, v.after) && same(v.afterBox ?? v.after, v.reopen) && same(v.reopen, v.epoch) && same(v.epoch, v.filter));
  const soloOk = Object.values(solo).every((v) => v.before && v.after && !same(v.before, v.after) && same(v.after, v.reenter));
  const pass = out.ring && out.ringMoved === 0 && out.foldMoved === 0 && placedOk && soloOk
    && !!out.born.at && JSON.stringify(out.born.at) === JSON.stringify(out.born.after)
    && !same(out.box.before, out.box.after) && same(out.box.after, out.box.reopen) && !errors.length;
  return { pass, detail: { ...out, place, solo, errors } };
});

// ── MICRO-CORSIA-GRUPPI-STANZA · the GT16 (a COPY: `GLIFI_V4`, or `CORSIA_V4`) ──
const CO_V4 = process.env.CORSIA_V4 ?? GL_V4;
test("GL5.lane", "CORSIA p.1 · un'unità messa in un'altra epoca fuori dal trascinamento va nella corsia nuova e nient'altro si muove: GT16, dal Tabular USV151 da II A.D. a Post antiquity → nella corsia Post antiquity, stessa x, nessuna sovrapposizione, 0 altri nodi spostati, un passo di annulla; annulla → epoca e posizione di prima; ripristina → di nuovo lì; il BR di SU002 che finisce in Post antiquity si ridisegna sopra la sua unità in quella corsia, gli altri fermi", async () => {
  if (!existsSync(CO_V4)) return { pass: false, detail: { missing: CO_V4 } };
  const { p, ctx, errors } = await glOpen();
  const D = (f, a) => p.evaluate(f, a);
  const geom = () => D(() => { const g = window.__EM_DRAG__.matrixGeom(); for (const n of g.nodes) n.name = window.__EM_DRAG__.node(n.id)?.name; return g; });
  const laneOf = (g, n) => g.lanes.find((l) => n.y + n.h / 2 >= l.y && n.y + n.h / 2 < l.y + l.height)?.label;
  const snap = (g) => Object.fromEntries(g.nodes.map((n) => [n.id, [Math.round(n.x), Math.round(n.y)]]));
  const moved = (a, b, skip) => Object.keys(a).filter((id) => !skip.includes(id) && b[id] && Math.abs(a[id][0] - b[id][0]) + Math.abs(a[id][1] - b[id][1]) > 1).length;
  let g = await geom();
  const u = g.nodes.find((n) => n.name === "USV151");
  const pa = g.lanes.find((l) => l.label === "Post antiquity");
  const out = { from: [Math.round(u.x), Math.round(u.y), laneOf(g, u)] };
  const s0 = snap(g);
  const bar = p.locator("[data-win] .tile-bar", { has: p.locator(".win-mode-toggle") }).filter({ hasText: /Tabular|Tabella/ }).first();
  await bar.locator(".win-mode-toggle").click(); await p.waitForTimeout(300);
  await p.locator('.dd-menu:not(.hidden) button[data-sheet="Units"]').first().click(); await p.waitForTimeout(800);
  const undo0 = await D(() => window.__EM_DRAG__.undoDepth());
  await p.selectOption(`select[data-col="EPOCH"][data-row="${u.id}"]`, pa.id);
  await p.waitForTimeout(1500);
  g = await geom();
  const a = g.nodes.find((n) => n.id === u.id);
  out.to = [Math.round(a.x), Math.round(a.y), laneOf(g, a)];
  out.steps = (await D(() => window.__EM_DRAG__.undoDepth())) - undo0;
  out.others = moved(s0, snap(g), [u.id]);
  out.overlaps = g.nodes.filter((n) => n.id !== u.id && !n.isGroup && n.x < a.x + a.w && a.x < n.x + n.w && n.y < a.y + a.h && a.y < n.y + n.h).map((n) => n.name);
  await D(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(1500);
  g = await geom();
  const b = g.nodes.find((n) => n.id === u.id);
  out.undo = [Math.round(b.x), Math.round(b.y), laneOf(g, b)];
  out.undoEpoch = await D((id) => window.__EM_DRAG__.edgesOf("has_first_epoch").filter((e) => e.source === id).map((e) => window.__EM_DRAG__.node(e.target)?.name), u.id);
  out.undoOthers = moved(s0, snap(g), []);
  await D(() => window.__EM_DRAG__.redo?.()); await p.waitForTimeout(1500);
  g = await geom();
  const c = g.nodes.find((n) => n.id === u.id);
  out.redo = [Math.round(c.x), Math.round(c.y), laneOf(g, c)];
  await D(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(1500);
  // the BR: SU002 ends in Post antiquity (was XX sec)
  g = await geom();
  const su = g.nodes.find((n) => n.name === "SU002");
  const br = (await D((id) => window.__EM_DRAG__.continuityOf(id), su.id)).br;
  const sB = snap(g);
  await D(([id, e]) => window.__EM_DRAG__.setContinuity(id, e, null, null), [su.id, pa.id]); await p.waitForTimeout(1500);
  g = await geom();
  const bn = g.nodes.find((n) => n.id === br);
  out.br = bn ? { dx: Math.round(bn.x + bn.w / 2 - (su.x + su.w / 2)), lane: laneOf(g, bn), above: bn.y < su.y } : null;
  out.brOthers = moved(sB, snap(g), [br]);
  await p.screenshot({ path: SHOT("gl5-lane") }).catch(() => {});
  await ctx.close();
  const same = (x, y) => x && y && Math.abs(x[0] - y[0]) <= 1 && Math.abs(x[1] - y[1]) <= 1 && x[2] === y[2];
  const pass = out.from[2] === "II A.D." && out.to[2] === "Post antiquity" && out.to[0] === out.from[0] && out.steps === 1
    && out.others === 0 && !out.overlaps.length && same(out.undo, out.from) && out.undoEpoch.join() === "II A.D." && out.undoOthers === 0
    && same(out.redo, out.to) && out.br?.lane === "Post antiquity" && out.br.dx === 0 && out.br.above && out.brOthers === 0 && !errors.length;
  return { pass, detail: { ...out, errors } };
});

/** CORSIA p.2 · a relay in this process speaking the room's wire: it seats every
 *  socket with the GT16 (no layout, as a room's snapshot), declares `layout` or
 *  not, fans out `layout` frames (and answers ops); `seen.layout` keeps them */
const layoutRelay = (doc, layout, folded = false) => {
  const seen = { layout: [], ops: 0, sockets: [] };
  const node = fakeNode(seen);
  const host = (i) => ({ tool: "stratigraph-server", file: "corsia", room: "corsia", connection_id: `c${i}`, role: "owner", can_write: true, ...(layout ? { layout: true } : {}), ...(folded ? { layout_folded: true } : {}) });
  return { seen, route: { pattern: node.pattern, handler: node.handler },
    wsRoute: { pattern: /nodo\.test/, handler: (ws) => {
      const i = seen.sockets.push(ws) - 1;
      ws.send(JSON.stringify({ v: 2, type: "snapshot", source: "em-server", payload: { doc, host: host(i) } }));
      ws.onMessage((raw) => {
        let m; try { m = JSON.parse(String(raw)); } catch { return; }
        if (m.type === "client_info") ws.send(JSON.stringify({ v: 2, type: "host_info", source: "em-server", payload: host(i) }));
        else if (m.type === "layout") {
          seen.layout.push(m);
          for (const o of seen.sockets) if (o !== ws) o.send(JSON.stringify({ v: 2, type: "layout", source: "em-server", graph_id: m.graph_id, payload: { ...m.payload, connection_id: `c${i}` } }));
        } else if (m.type === "op") {
          seen.ops++;
          ws.send(JSON.stringify({ v: 2, type: "op_result", source: "em-server", payload: { applied: true, op: m.payload, graph_id: m.graph_id } }));
          for (const o of seen.sockets) if (o !== ws) o.send(JSON.stringify({ v: 2, type: "op", source: "em-server", graph_id: m.graph_id, payload: m.payload }));
        }
      });
    } } };
};
/** two EMStudios in the relay's room, the GT16's paradata groups closed but VSF125's */
const twoInRoom = async (relay) => {
  const one = async () => {
    const o = await open({ doc: null, locale: "en", w: 1728, h: 1000, route: relay.route, wsRoute: relay.wsRoute,
      init: { "emstudio.settings": JSON.stringify({ sync: { hubUrl: "https://nodo.test" } }) } });
    await o.p.evaluate(() => window.__EM_DRAG__.joinRoom("https://nodo.test", "corsia", "AT-nodo"));
    await o.p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 120000 });
    await o.p.waitForTimeout(2500);
    return o;
  };
  const A = await one(), B = await one();
  const grp = await A.p.evaluate(() => { const E = window.__EM_DRAG__; const g = E.edgesOf("has_paradata_nodegroup").find((e) => E.node(e.source)?.name === "VSF125")?.target;
    const mem = E.edgesOf("is_in_paradata_nodegroup").filter((e) => e.target === g).map((e) => e.source);
    return { g, combiner: mem.find((m) => E.node(m)?.node_type === "combiner"), extractor: mem.find((m) => E.node(m)?.node_type === "extractor"), property: mem.find((m) => E.node(m)?.node_type === "property") }; });
  for (const c of [A, B]) {
    await c.p.evaluate((keep) => { const E = window.__EM_DRAG__; for (const n of E.matrixGeom().nodes) if (n.isGroup && n.type === "ParadataNodeGroup" && n.id !== keep) E.fold(n.id, true); E.fold(keep, false); }, grp.g);
    await c.p.waitForTimeout(1500);
  }
  return { A, B, grp };
};
const glAt = (p, id) => p.evaluate((id) => { const n = window.__EM_DRAG__.matrixGeom().nodes.find((x) => x.id === id); return n ? [Math.round(n.x), Math.round(n.y)] : null; }, id);
const glWin = (p) => p.evaluate(() => window.__EM_DRAG__.wins().find((w) => w.type === "graph").id);
const glScr = (p, w, id) => p.evaluate(([w, id]) => { const ws = window.__EM_DRAG__.winScene(w); const b = ws.boxes.find((x) => x.id === id || x.instanceOf === id); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2, scale: ws.scale } : null; }, [w, id]);
const glDrag = async (p, w, id, dx, dy) => { const b = await glScr(p, w, id); if (!b) return false;
  await p.mouse.move(b.x, b.y); await p.mouse.down(); await p.mouse.move(b.x + dx / 2, b.y + dy / 2, { steps: 4 }); await p.mouse.move(b.x + dx, b.y + dy, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(900); return true; };
const glFrameOn = async (p, w, id) => { const g0 = await p.evaluate((g) => window.__EM_DRAG__.matrixGeom().nodes.find((n) => n.id === g), id); const r = await p.evaluate((w) => window.__EM_DRAG__.winScene(w).rect, w);
  await p.evaluate(([x, y, w, h]) => window.__EM_DRAG__.frameWorld(x, y, w, h, 30), [g0.x + g0.w / 2 - (r.w - 60) / 2, g0.y + g0.h / 2 - (r.h - 60) / 2, r.w - 60, r.h - 60]); await p.waitForTimeout(500); };

test("GL6.room", "CORSIA p.2 · le posizioni dentro i gruppi viaggiano nella stanza che lo dichiara: due EMStudio nella stessa stanza (relay di prova con «layout» in host_info, il GT16): A trascina il combinatore nel gruppo di VSF125 aperto sul posto → B lo vede nella nuova posizione, anche dopo chiudi e riapri; A nel soloing del gruppo trascina l'estrattore → B nel soloing lo vede lì; nessuna operazione di grafo; una stanza che NON dichiara «layout» non riceve nulla, B resta com'era e il Log di A lo dice", async () => {
  if (!existsSync(CO_V4)) return { pass: false, detail: { missing: CO_V4 } };
  const full = JSON.parse(readFileSync(CO_V4, "utf8"));
  const doc = { ...full, graphs: Object.fromEntries(Object.entries(full.graphs).map(([k, g]) => { const { layout, ...rest } = g; return [k, rest]; })) };
  delete doc.layout;
  const out = {};
  // 1 · the room declares `layout`
  {
    const relay = layoutRelay(doc, true);
    const { A, B, grp } = await twoInRoom(relay);
    const wa = await glWin(A.p), wb = await glWin(B.p);
    await glFrameOn(A.p, wa, grp.g);
    const a0 = await glAt(A.p, grp.combiner), b0 = await glAt(B.p, grp.combiner);
    out.dragged = await glDrag(A.p, wa, grp.combiner, 70, 45);
    await B.p.waitForTimeout(1500);
    const a1 = await glAt(A.p, grp.combiner), b1 = await glAt(B.p, grp.combiner);
    await B.p.evaluate((g) => window.__EM_DRAG__.fold(g, true), grp.g); await B.p.waitForTimeout(800);
    await B.p.evaluate((g) => window.__EM_DRAG__.fold(g, false), grp.g); await B.p.waitForTimeout(1200);
    const b2 = await glAt(B.p, grp.combiner);
    out.inPlace = { a0, a1, b0, b1, reopened: b2 };
    // the soloing: world offset of the extractor from the property, A and then B
    const rel = async (p, w) => { const x = await glScr(p, w, grp.extractor), q = await glScr(p, w, grp.property); return x && q ? [Math.round((x.x - q.x) / x.scale), Math.round((x.y - q.y) / x.scale)] : null; };
    await A.p.evaluate((g) => window.__EM_DRAG__.enterGroup(g), grp.g); await A.p.waitForTimeout(1200);
    const s0 = await rel(A.p, wa);
    await glDrag(A.p, wa, grp.extractor, 60, 40);
    const s1 = await rel(A.p, wa);
    await B.p.waitForTimeout(1200);
    await B.p.evaluate((g) => window.__EM_DRAG__.enterGroup(g), grp.g); await B.p.waitForTimeout(1200);
    out.solo = { a0: s0, a1: s1, b: await rel(B.p, wb) };
    out.frames = relay.seen.layout.map((m) => ({ space: m.payload.space === grp.g, ids: Object.keys(m.payload.positions).length, graph: !!m.graph_id }));
    out.ops = relay.seen.ops;
    out.errors = [...A.errors, ...B.errors];
    await A.p.screenshot({ path: SHOT("gl6-room-A") }).catch(() => {});
    await B.p.screenshot({ path: SHOT("gl6-room-B") }).catch(() => {});
    await A.ctx.close(); await B.ctx.close();
  }
  // 2 · a room that does not declare it: nothing leaves, B stays, A's Log says so
  {
    const relay = layoutRelay(doc, false);
    const { A, B, grp } = await twoInRoom(relay);
    const wa = await glWin(A.p);
    await glFrameOn(A.p, wa, grp.g);
    const a0 = await glAt(A.p, grp.combiner), b0 = await glAt(B.p, grp.combiner);
    await glDrag(A.p, wa, grp.combiner, 70, 45);
    await B.p.waitForTimeout(1500);
    out.without = { a0, a1: await glAt(A.p, grp.combiner), b0, b1: await glAt(B.p, grp.combiner), frames: relay.seen.layout.length,
      log: (await A.p.evaluate(() => window.__EM_DRAG__.log().map((l) => l.message))).filter((m) => /stay on this screen/.test(m)).length,
      errors: [...A.errors, ...B.errors] };
    await A.ctx.close(); await B.ctx.close();
  }
  const same = (x, y) => !!x && !!y && Math.abs(x[0] - y[0]) <= 1 && Math.abs(x[1] - y[1]) <= 1;
  const ip = out.inPlace, so = out.solo, wo = out.without;
  const pass = out.dragged && same(ip.a0, ip.b0) && !same(ip.a0, ip.a1) && same(ip.a1, ip.b1) && same(ip.b1, ip.reopened)
    && !same(so.a0, so.a1) && same(so.a1, so.b) && out.frames.length >= 2 && out.frames.every((f) => f.space && f.ids >= 1) && out.ops === 0
    && !same(wo.a0, wo.a1) && same(wo.b0, wo.b1) && wo.frames === 0 && wo.log === 1 && !out.errors.length && !wo.errors.length;
  return { pass, detail: out };
});

test("GL8.folds", "GLOBO-INTERAZIONE p.5 · i gruppi chiusi viaggiano nella stanza che lo dichiara (relay di prova con «layout_folded», il GT16, due EMStudio): A chiude un gruppo PD → B lo vede chiuso, A lo riapre → B lo vede aperto; A apre il gruppo implicito dei paradati sciolti di un'unità → B lo vede aperto; un frame «layout» con il solo «folded» per gesto, nessuna operazione di grafo e nessun passo di annulla a B; una stanza che NON lo dichiara non riceve nulla, B resta com'era e il Log di A lo dice una volta", async () => {
  if (!existsSync(CO_V4)) return { pass: false, detail: { missing: CO_V4 } };
  const full = JSON.parse(readFileSync(CO_V4, "utf8"));
  const doc = { ...full, graphs: Object.fromEntries(Object.entries(full.graphs).map(([k, g]) => { const { layout, ...rest } = g; return [k, rest]; })) };
  delete doc.layout;
  // a loose property on a unit, so the view makes an implicit paradata group for it
  {
    const g = Object.values(doc.graphs).find((x) => (x.nodes ?? []).length > 100);
    const withGroup = new Set(g.edges.filter((e) => e.edge_type === "has_paradata_nodegroup").map((e) => e.source));
    const unit = g.nodes.find((n) => n.node_type === "US" && !withGroup.has(n.id));
    g.nodes.push({ id: "gl8-loose-prop", node_type: "property", name: "material", data: { property_type: "material", value: "tufo" } });
    g.edges.push({ id: "gl8-loose-edge", source: unit.id, target: "gl8-loose-prop", edge_type: "has_property" });
  }
  const out = {};
  const folded = (p) => p.evaluate(() => window.__EM_DRAG__.folded());
  {
    const relay = layoutRelay(doc, true, true);
    const { A, B, grp } = await twoInRoom(relay);
    const n0 = relay.seen.layout.length;      // the setup's own folds (every PD group but VSF125's) went first
    const g = grp.g;
    const b0 = (await folded(B.p)).includes(g);
    const undoB0 = await B.p.evaluate(() => window.__EM_DRAG__.undoDepth?.() ?? null);
    await A.p.evaluate((g) => window.__EM_DRAG__.fold(g, true), g); await B.p.waitForTimeout(1200);
    const b1 = (await folded(B.p)).includes(g);
    await A.p.evaluate((g) => window.__EM_DRAG__.fold(g, false), g); await B.p.waitForTimeout(1200);
    const b2 = (await folded(B.p)).includes(g);
    const imp = await A.p.evaluate(() => window.__EM_DRAG__.implicitGroupIds()[0] ?? null);
    const bi0 = imp ? (await B.p.evaluate(() => window.__EM_DRAG__.implicitOpen())).includes(imp) : null;
    if (imp) { await A.p.evaluate((id) => window.__EM_DRAG__.toggleImplicit(id), imp); await B.p.waitForTimeout(1200); }
    const bi1 = imp ? (await B.p.evaluate(() => window.__EM_DRAG__.implicitOpen())).includes(imp) : null;
    const undoB1 = await B.p.evaluate(() => window.__EM_DRAG__.undoDepth?.() ?? null);
    out.room = { g, b0, b1, b2, imp, bi0, bi1, undoB: [undoB0, undoB1],
      frames: relay.seen.layout.slice(n0).map((m) => ({ folded: m.payload.folded ?? null, positions: Object.keys(m.payload.positions ?? {}).length })).filter((f) => f.folded),
      ops: relay.seen.ops, errors: [...A.errors, ...B.errors] };
    await A.ctx.close(); await B.ctx.close();
  }
  {
    const relay = layoutRelay(doc, true, false);
    const { A, B, grp } = await twoInRoom(relay);
    const b0 = (await folded(B.p)).includes(grp.g);
    await A.p.evaluate((g) => window.__EM_DRAG__.fold(g, true), grp.g); await B.p.waitForTimeout(1200);
    await A.p.evaluate((g) => window.__EM_DRAG__.fold(g, false), grp.g); await B.p.waitForTimeout(600);
    await A.p.evaluate((g) => window.__EM_DRAG__.fold(g, true), grp.g); await B.p.waitForTimeout(800);
    out.without = { b0, b1: (await folded(B.p)).includes(grp.g), frames: relay.seen.layout.filter((m) => m.payload.folded).length,
      log: (await A.p.evaluate(() => window.__EM_DRAG__.log().map((l) => l.message))).filter((m) => /open or close stay so on this screen/.test(m)).length,
      errors: [...A.errors, ...B.errors] };
    await A.ctx.close(); await B.ctx.close();
  }
  const r = out.room, w = out.without;
  const pass = r.b0 === false && r.b1 === true && r.b2 === false && !!r.imp && r.bi0 === false && r.bi1 === true
    && r.frames.length === 3 && r.frames[0].folded[r.g] === true && r.frames[1].folded[r.g] === false && r.frames[2].folded[r.imp] === false
    && r.frames.every((f) => f.positions === 0 && Object.keys(f.folded).length === 1) && r.ops === 0 && (r.undoB[0] === null || r.undoB[0] === r.undoB[1])
    && !r.errors.length
    && w.b0 === false && w.b1 === false && w.frames === 0 && w.log === 1 && !w.errors.length;
  return { pass, detail: out };
});

// LIVE (LIVE_NODE + CORSIA_ROOM, a room holding the GT16): the dev node does not
// declare `layout` — A's positions inside a group stay with A, nothing leaves
if (K_NODE && process.env.CORSIA_ROOM) test("GL6.live", "CORSIA p.2 dal vivo · nodo di sviluppo, due EMStudio nella stanza del GT16: il nodo non dichiara «layout», quindi A che trascina il combinatore nel gruppo di VSF125 non manda nulla, B resta com'era, il Log di A lo dice; nessuna operazione di grafo", async () => {
  const one = async () => {
    const o = await open({ doc: null, locale: "en", w: 1728, h: 1000, init: { "emstudio.settings": JSON.stringify({ sync: { hubUrl: K_NODE } }) } });
    const frames = [];
    o.p.on("websocket", (ws) => ws.on("framesent", (f) => { try { const m = JSON.parse(f.payload); if (m.type === "layout" || m.type === "op") frames.push(m.type); } catch {} }));
    await o.p.evaluate(([u, r, tk]) => window.__EM_DRAG__.joinRoom(u, r, tk), [K_NODE, process.env.CORSIA_ROOM, kToken("dev")]);
    await o.p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 120000 });
    await o.p.waitForTimeout(2500);
    return { ...o, frames };
  };
  const A = await one(), B = await one();
  const g = await A.p.evaluate(() => { const E = window.__EM_DRAG__; const g = E.edgesOf("has_paradata_nodegroup").find((e) => E.node(e.source)?.name === "VSF125")?.target;
    return { g, combiner: E.edgesOf("is_in_paradata_nodegroup").filter((e) => e.target === g).map((e) => e.source).find((m) => E.node(m)?.node_type === "combiner") }; });
  for (const c of [A, B]) { await c.p.evaluate((keep) => { const E = window.__EM_DRAG__; for (const n of E.matrixGeom().nodes) if (n.isGroup && n.type === "ParadataNodeGroup" && n.id !== keep) E.fold(n.id, true); E.fold(keep, false); }, g.g); await c.p.waitForTimeout(1500); }
  const wa = await glWin(A.p);
  await glFrameOn(A.p, wa, g.g);
  const a0 = await glAt(A.p, g.combiner), b0 = await glAt(B.p, g.combiner);
  await glDrag(A.p, wa, g.combiner, 70, 45);
  await B.p.waitForTimeout(2000);
  const r = { a0, a1: await glAt(A.p, g.combiner), b0, b1: await glAt(B.p, g.combiner), sentA: [...A.frames],
    log: (await A.p.evaluate(() => window.__EM_DRAG__.log().map((l) => l.message))).filter((m) => /stay on this screen/.test(m)).length, errors: [...A.errors, ...B.errors] };
  await A.ctx.close(); await B.ctx.close();
  const same = (x, y) => !!x && !!y && Math.abs(x[0] - y[0]) <= 1 && Math.abs(x[1] - y[1]) <= 1;
  return { pass: !same(r.a0, r.a1) && same(r.b0, r.b1) && !r.sentA.length && r.log === 1 && !r.errors.length, detail: r };
});

// MICRO-STANZA-POSIZIONI (LAYOUT_NODE + LAYOUT_ROOM: a stratigraph-server that
// declares `layout`, a room holding the GT16 with no layout). The positions are
// the room's: the Matrix's and those inside a group travel, stay, and a late
// arrival sees them; a frame does not move the node under somebody's hand
const LAY_NODE = (process.env.LAYOUT_NODE ?? "").replace(/\/+$/, "");
const LAY_ROOM = process.env.LAYOUT_ROOM ?? "";
/** MICRO-SUITE-VERDE (24 Oct) · no case needs a room that already exists: given
 *  none (LAYOUT_ROOM, FOLDS_ROOM), the case makes its own on LAYOUT_NODE — the
 *  GT16's graph seated by the engine (`s3dgraphy room-import`, as «Bring into a
 *  room…»; the em.json alone, so no file goes up) — and DELETES it at the end,
 *  also when it fails. A room given is left as it was found. */
async function withLayRoom(prefix, given, body) {
  if (given) return body(given);
  const room = `${prefix}-claude-${Date.now().toString(36)}`;
  const { mkdtempSync, realpathSync: real } = await import("node:fs");
  const work = real(mkdtempSync(`${(await import("node:os")).tmpdir()}/${prefix}-room-`));
  mkdirSync(`${work}/EM`);
  copyFileSync(CO_V4, `${work}/EM/study.em.json`);
  const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
  const token = process.env.LAYOUT_TOKEN ? ["--token", process.env.LAYOUT_TOKEN] : [];
  const drop = async () => {
    for (let i = 0; i < 20; i++) {
      const r = await fetch(`${LAY_NODE}/v1/rooms/${encodeURIComponent(room)}`, { method: "DELETE",
        headers: { "content-type": "application/json", ...(process.env.LAYOUT_TOKEN ? { authorization: `Bearer ${process.env.LAYOUT_TOKEN}` } : {}) },
        body: JSON.stringify({ confirm: room }) }).catch(() => ({ status: 0 }));
      if (r.status === 200 || r.status === 404) return r.status === 200 ? "deleted" : "not there";
      if (r.status !== 409) return `NOT deleted (${r.status})`;
      await new Promise((res) => setTimeout(res, 500));
    }
    return "NOT deleted (somebody still connected)";
  };
  let out;
  try {
    execFileSync(`${S3D}.venv/bin/python`, ["-m", "s3dgraphy", "room-import", `${work}/EM/study.em.json`, "--node", LAY_NODE,
      "--room", room, "--title", room, ...token, "--journal", `${work}/journal.json`, "--report-dir", work,
      "--work-dir", `${work}/packs`, "--json"], { env: { ...process.env, PYTHONPATH: `${S3D}src` }, encoding: "utf8", maxBuffer: 1 << 26 });
    out = await body(room);
  } finally {
    const gone = await drop();
    if (out?.detail) out.detail.room = `${room}: ${gone}`;
  }
  return out;
}
if (LAY_NODE) test("GL7.room", "STANZA-POSIZIONI · istanza di prova del server con «layout», la stanza del GT16: A trascina un'unità della Matrix e il combinatore nel gruppo PD di VSF125 → B vede entrambi; B esce e rientra, restano; C che entra dopo li vede; un frame che arriva mentre B tiene l'unità in mano non la sposta, al rilascio vince B e A lo vede; «Layout» di A arriva intero e le tre Matrix restano uguali; un frame per rilascio, nessuna operazione di grafo; la stanza le tiene (lettura REST)", () => withLayRoom("gl7", LAY_ROOM, async (LAY_ROOM) => {
  const one = async () => {
    const o = await open({ doc: null, locale: "en", w: 1728, h: 1000, init: { "emstudio.settings": JSON.stringify({ sync: { hubUrl: LAY_NODE } }) } });
    const frames = [];
    o.p.on("websocket", (ws) => ws.on("framesent", (f) => { try { const m = JSON.parse(f.payload);
      // GLOBO-INTERAZIONE p.5 · a frame that only opens or closes groups (`fold`) is not a release's
      if (m.type === "layout" || m.type === "op") frames.push({ type: m.type, space: m.payload?.space, n: Object.keys(m.payload?.positions ?? {}).length, whole: !!m.payload?.whole,
        fold: !!m.payload?.folded && !Object.keys(m.payload?.positions ?? {}).length && !m.payload?.whole }); } catch {} }));
    await o.p.evaluate(([u, r]) => window.__EM_DRAG__.joinRoom(u, r, null), [LAY_NODE, LAY_ROOM]);
    await o.p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 120000 });
    await o.p.waitForTimeout(3500);
    return { ...o, frames };
  };
  const foldBut = async (c, keep) => { await c.p.evaluate((keep) => { const E = window.__EM_DRAG__; for (const n of E.matrixGeom().nodes) if (n.isGroup && n.type === "ParadataNodeGroup" && n.id !== keep) E.fold(n.id, true); E.fold(keep, false); }, keep); await c.p.waitForTimeout(1500); };
  const all = (p) => p.evaluate(() => Object.fromEntries(window.__EM_DRAG__.matrixGeom().nodes.map((n) => [n.id, [Math.round(n.x), Math.round(n.y)]])));
  const differ = (a, b) => Object.keys(a).filter((id) => b[id] && Math.abs(a[id][0] - b[id][0]) + Math.abs(a[id][1] - b[id][1]) > 2).length;
  const same = (x, y) => !!x && !!y && Math.abs(x[0] - y[0]) <= 1 && Math.abs(x[1] - y[1]) <= 1;
  const out = {};
  const A = await one(), B = await one();
  const g = await A.p.evaluate(() => { const E = window.__EM_DRAG__; const g = E.edgesOf("has_paradata_nodegroup").find((e) => E.node(e.source)?.name === "VSF125")?.target;
    const unit = E.matrixGeom().nodes.find((n) => E.node(n.id)?.name === "USV151")?.id;
    return { g, unit, combiner: E.edgesOf("is_in_paradata_nodegroup").filter((e) => e.target === g).map((e) => e.source).find((m) => E.node(m)?.node_type === "combiner") }; });
  out.ids = g;
  for (const c of [A, B]) await foldBut(c, g.g);
  out.start = { sameMatrix: differ(await all(A.p), await all(B.p)) };
  const wa = await glWin(A.p);
  const a0 = { u: await glAt(A.p, g.unit), c: await glAt(A.p, g.combiner) };
  // 1 · A moves a unit of the Matrix and the combiner inside VSF125's group
  await glFrameOn(A.p, wa, g.unit);
  out.draggedUnit = await glDrag(A.p, wa, g.unit, 90, 0);
  await glFrameOn(A.p, wa, g.g);
  out.draggedComb = await glDrag(A.p, wa, g.combiner, 70, 45);
  await B.p.waitForTimeout(2000);
  const a1 = { u: await glAt(A.p, g.unit), c: await glAt(A.p, g.combiner) }, b1 = { u: await glAt(B.p, g.unit), c: await glAt(B.p, g.combiner) };
  out.moved = { a0, a1, b1 };
  // 2 · B leaves and comes back
  await B.ctx.close();
  const B2 = await one();
  await foldBut(B2, g.g);
  const b2 = { u: await glAt(B2.p, g.unit), c: await glAt(B2.p, g.combiner) };
  // 3 · C enters after
  const C = await one();
  await foldBut(C, g.g);
  const c1 = { u: await glAt(C.p, g.unit), c: await glAt(C.p, g.combiner) };
  out.back = { b2, c1, matrixAvsB2: differ(await all(A.p), await all(B2.p)), matrixAvsC: differ(await all(A.p), await all(C.p)) };
  { const aa = await all(A.p), bb = await all(B2.p); out.backDiff = Object.keys(aa).filter((id) => bb[id] && Math.abs(aa[id][0] - bb[id][0]) + Math.abs(aa[id][1] - bb[id][1]) > 2).slice(0, 6).map((id) => [id, aa[id], bb[id]]);
    out.backFolded = [(await A.p.evaluate(() => window.__EM_DRAG__.folded())).length, (await B2.p.evaluate(() => window.__EM_DRAG__.folded())).length]; }
  // 4 · B2 holds the unit; A moves it meanwhile; B2 releases: B2's place wins
  const wb = await glWin(B2.p);
  await glFrameOn(B2.p, wb, g.unit);
  await glFrameOn(A.p, wa, g.unit);
  const hb = await glScr(B2.p, wb, g.unit);
  await B2.p.mouse.move(hb.x, hb.y); await B2.p.mouse.down(); await B2.p.mouse.move(hb.x + 20, hb.y, { steps: 4 }); await B2.p.mouse.move(hb.x + 40, hb.y, { steps: 4 });
  await B2.p.waitForTimeout(300);
  const held0 = await glAt(B2.p, g.unit);
  await glDrag(A.p, wa, g.unit, -120, 0);
  await B2.p.waitForTimeout(1500);
  const held1 = await glAt(B2.p, g.unit);
  await B2.p.mouse.move(hb.x + 60, hb.y, { steps: 4 }); await B2.p.mouse.up();
  await B2.p.waitForTimeout(2000);
  out.hand = { held0, held1, aMoved: await glAt(A.p, g.unit), b2: await glAt(B2.p, g.unit), a: null, c: null };
  out.hand.a = await glAt(A.p, g.unit); out.hand.c = await glAt(C.p, g.unit);
  // what the room keeps (REST), before and after the new layout
  const kept = async () => { const doc = await (await fetch(`${LAY_NODE}/v1/rooms/${LAY_ROOM}/document`)).json();
    const sec = Object.values(doc.doc.graphs).find((x) => (x.nodes ?? []).some((n) => n.id === g.unit));
    return { unit: sec?.layout?.positions?.[g.unit] ?? null, combiner: sec?.layout?.group_spaces?.[g.g]?.[g.combiner] ?? null, positions: Object.keys(sec?.layout?.positions ?? {}).length }; };
  out.kept = await kept();
  // 5 · A asks for a new layout: it travels whole. The ARCHIVE is the same on
  // every screen; the drawing is the same where the folds are (a fold is this
  // screen's, `layout.folded_groups`, and the view is laid out on what is
  // drawn): A opens every group again, as a room arrives, and so does D, who
  // enters after; B2 and C keep theirs folded
  const arch = (p) => p.evaluate(() => { const d = JSON.parse(window.__EM_DRAG__.docJson()); const l = d.layout ?? Object.values(d.graphs ?? {})[0]?.layout;
    return Object.fromEntries(Object.entries(l?.positions ?? {}).map(([id, r]) => [id, [Math.round(r.x), Math.round(r.y)]])); });
  const archDiff = (a, b) => Object.keys(a).filter((id) => !b[id] || Math.abs(a[id][0] - b[id][0]) + Math.abs(a[id][1] - b[id][1]) > 1).length + Object.keys(b).filter((id) => !a[id]).length;
  await A.p.evaluate(() => { const E = window.__EM_DRAG__; for (const id of E.folded()) E.fold(id, false); });
  await A.p.waitForTimeout(1500);
  const nA = A.frames.length;
  // (the toolbar's button, clicked as a script: it sits under the window bars)
  await A.p.evaluate(() => document.getElementById("btn-layout").click()); await A.p.waitForTimeout(5000);
  const archA = await arch(A.p);
  out.whole = { frames: A.frames.slice(nA), archAvsB2: archDiff(archA, await arch(B2.p)), archAvsC: archDiff(archA, await arch(C.p)),
    B2vsC: differ(await all(B2.p), await all(C.p)), archA: Object.keys(archA).length, kept: await kept() };
  out.framesA = A.frames.slice(0, nA); out.framesB2 = B2.frames;
  // 6 · D enters AFTER the new layout, its groups as they arrive (open, like A's)
  const D = await one();
  const probe = (p) => p.evaluate((u) => { const E = window.__EM_DRAG__; const g = E.matrixGeom();
    return { vp: E.viewPosition(u), lanes: g.lanes.map((l) => [l.label, Math.round(l.y), Math.round(l.height)]), nodes: g.nodes.length, folded: E.folded().length }; }, g.unit);
  out.afterWhole = { AvsD: differ(await all(A.p), await all(D.p)), archAvsD: archDiff(archA, await arch(D.p)), A: await probe(A.p), D: await probe(D.p) };
  await D.ctx.close();
  // 7 · A moves the unit after the new layout; E enters after that: the room's
  // `moved_from` gives E the same base, and the move on it
  await glFrameOn(A.p, wa, g.unit);
  await glDrag(A.p, wa, g.unit, 70, 0);
  await A.p.waitForTimeout(1500);
  const E = await one();
  out.afterWholeMove = { AvsE: differ(await all(A.p), await all(E.p)), archAvsE: archDiff(await arch(A.p), await arch(E.p)),
    unit: [await glAt(A.p, g.unit), await glAt(E.p, g.unit)] };
  await E.ctx.close();
  out.errors = [...A.errors, ...B2.errors, ...C.errors];
  await A.p.screenshot({ path: SHOT("gl7-room-A") }).catch(() => {});
  await C.p.screenshot({ path: SHOT("gl7-room-C") }).catch(() => {});
  await A.ctx.close(); await B2.ctx.close(); await C.ctx.close();
  const m = out.moved, bk = out.back, h = out.hand, w = out.whole;
  const pass = out.draggedUnit && out.draggedComb && out.start.sameMatrix === 0
    && !same(m.a0.u, m.a1.u) && !same(m.a0.c, m.a1.c) && same(m.a1.u, m.b1.u) && same(m.a1.c, m.b1.c)
    && same(bk.b2.u, m.a1.u) && same(bk.b2.c, m.a1.c) && same(bk.c1.u, m.a1.u) && same(bk.c1.c, m.a1.c) && bk.matrixAvsB2 === 0 && bk.matrixAvsC === 0
    && same(h.held0, h.held1) && !same(h.b2, h.held0) && same(h.a, h.b2) && same(h.c, h.b2)
    && w.frames.some((f) => f.space === "" && f.whole) && w.archAvsB2 === 0 && w.archAvsC === 0 && w.B2vsC === 0
    && out.afterWhole.AvsD === 0 && out.afterWhole.archAvsD === 0 && out.afterWholeMove.archAvsE === 0 && out.afterWholeMove.AvsE === 0
    && out.framesA.filter((f) => f.type === "layout" && !f.fold).length === 3 && !out.framesA.some((f) => f.type === "op")
    && out.framesA.filter((f) => f.type === "layout" && !f.fold && f.space === "").length === 2
    && !!out.kept.unit && !!out.kept.combiner && w.kept.positions > 50 && w.kept.positions === w.archA && !out.errors.length;
  return { pass, detail: out };
}));

// GLOBO-INTERAZIONE p.5 (LAYOUT_NODE + FOLDS_ROOM: a stratigraph-server that declares
// `layout_folded`, a room holding the GT16): the groups' open/closed are the room's
if (LAY_NODE) test("GL8.live", "GLOBO-INTERAZIONE p.5 dal vivo · istanza di prova del server con «layout_folded», la stanza del GT16: A chiude il gruppo PD di VSF125 → B lo vede chiuso; A lo riapre e chiude quello di un'altra unità → B li vede così; C che entra dopo li trova come li ha lasciati A (dall'istantanea); la stanza li tiene (lettura REST, folded_groups); nessuna operazione di grafo", () => withLayRoom("gl8", process.env.FOLDS_ROOM, async (room) => {
  const one = async () => {
    const o = await open({ doc: null, locale: "en", w: 1728, h: 1000, init: { "emstudio.settings": JSON.stringify({ sync: { hubUrl: LAY_NODE } }) } });
    const frames = [];
    o.p.on("websocket", (ws) => ws.on("framesent", (f) => { try { const m = JSON.parse(f.payload); if (m.type === "layout" || m.type === "op") frames.push({ type: m.type, folded: m.payload?.folded ?? null }); } catch {} }));
    await o.p.evaluate(([u, r]) => window.__EM_DRAG__.joinRoom(u, r, null), [LAY_NODE, room]);
    await o.p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 120000 });
    await o.p.waitForTimeout(3000);
    return { ...o, frames };
  };
  const folded = (p) => p.evaluate(() => window.__EM_DRAG__.folded());
  const A = await one(), B = await one();
  const ids = await A.p.evaluate(() => { const E = window.__EM_DRAG__; const pd = E.edgesOf("has_paradata_nodegroup");
    const g = pd.find((e) => E.node(e.source)?.name === "VSF125")?.target; const h = pd.find((e) => e.target !== g)?.target; return { g, h }; });
  const out = { ids };
  const a0 = new Set(await folded(A.p));
  await A.p.evaluate((g) => window.__EM_DRAG__.fold(g, true), ids.g); await B.p.waitForTimeout(1500);
  out.b1 = (await folded(B.p)).includes(ids.g);
  await A.p.evaluate(([g, h]) => { window.__EM_DRAG__.fold(g, false); window.__EM_DRAG__.fold(h, !window.__EM_DRAG__.folded().includes(h)); }, [ids.g, ids.h]); await B.p.waitForTimeout(1500);
  const aNow = new Set(await folded(A.p));
  out.b2 = { g: (await folded(B.p)).includes(ids.g), h: (await folded(B.p)).includes(ids.h), hA: aNow.has(ids.h) };
  const C = await one();
  const cNow = new Set(await folded(C.p));
  out.c = { g: cNow.has(ids.g), h: cNow.has(ids.h), sameAsA: [...aNow].every((x) => cNow.has(x)) && [...cNow].every((x) => aNow.has(x)) };
  const rest = await (await fetch(`${LAY_NODE}/v1/rooms/${room}/document`)).json().catch(() => null);
  const lay = Object.values(rest?.doc?.graphs ?? {}).find((g) => (g.nodes ?? []).length > 100)?.layout ?? {};
  out.rest = { g: (lay.folded_groups ?? []).includes(ids.g), h: (lay.folded_groups ?? []).includes(ids.h) };
  out.frames = A.frames.filter((f) => f.folded).length;
  out.ops = [...A.frames, ...B.frames, ...C.frames].filter((f) => f.type === "op").length;
  out.errors = [...A.errors, ...B.errors, ...C.errors];
  out.a0 = a0.size;
  await A.ctx.close(); await B.ctx.close(); await C.ctx.close();
  const pass = !!ids.g && !!ids.h && out.b1 === true && out.b2.g === false && out.b2.h === out.b2.hA && out.c.g === false && out.c.h === out.b2.hA && out.c.sameAsA
    && out.rest.g === false && out.rest.h === out.b2.hA && out.frames >= 2 && out.ops === 0 && !out.errors.length;
  return { pass, detail: out };
}));

// ── MICRO-GEOGLOBO · the GT16 (a COPY: `GEO_V4`) and a bridge of this tree that
// serves its folder (`GEO_BRIDGE`, level 36: /tiles, /geo); the orthophoto of the
// test (`GEO_ORTHO`, a GeoTIFF in EPSG:31700 made by the report's script). The
// globe's tiles come from the sources online through that bridge: offline the
// modes and the layers still answer, the pictures are empty ──
const GEO_V4 = benchFile("GEO_V4");
const GEO_BRIDGE = process.env.GEO_BRIDGE ?? BRIDGE;
const GEO_ORTHO = benchFile("GEO_ORTHO");
const geoOpen = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  p.on("console", (m) => { if (m.type() === "error" && /NaN|reading 'color'|could not be decoded/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  const asked = [];
  p.on("request", (r) => { if (/\/tiles\/|tiles\.maps\.eox|mapterhorn|openstreetmap/.test(r.url())) asked.push(r.url()); });
  await p.addInitScript(() => { try { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "en"); sessionStorage.setItem("probe", "1"); } } catch {} });
  await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(GEO_BRIDGE)}`);
  await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 30000 });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(GEO_V4, "utf8")), GEO_V4]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await workspace(p, "space");
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 120000 });
  await p.waitForTimeout(800);
  return { p, ctx, errors, asked };
};
const geoOn = async (p) => {
  await p.click('.scn-bar [data-geo="toggle"]');
  await p.waitForFunction(() => document.querySelector(".scn-host")?.__geo?.()?.ready, null, { timeout: 30000 });
};
const geoState = (p) => p.evaluate(() => document.querySelector(".scn-host").__geo());
const geoIdle = async (p, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const g = await geoState(p); if (!g.flying) return g; await p.waitForTimeout(200); }
  return geoState(p);
};

test("GG4.off", "GEOGLOBO · spento di default: lo Spazio del GT16 si apre come prima — niente globo, nessuna tessera chiesta (né al bridge né in rete); il pulsante «Territory» nella barra, senza i modi", async () => {
  if (!existsSync(GEO_V4)) return { pass: false, detail: { missing: GEO_V4 } };
  const { p, ctx, errors, asked } = await geoOpen();
  await p.waitForTimeout(1500);
  const out = { geo: await p.evaluate(() => !!document.querySelector(".scn-host").__geo), asked: asked.length,
    bar: await p.evaluate(() => ({ toggle: document.querySelector('.scn-bar [data-geo="toggle"]')?.getAttribute("aria-pressed"), modes: document.querySelectorAll(".scn-bar [data-geo-mode]").length })), errors };
  await ctx.close();
  return { pass: !out.geo && out.asked === 0 && out.bar.toggle === "false" && out.bar.modes === 0 && !errors.length, detail: out };
});

test("GG1.globe", "GEOGLOBO p.1 · il GT16 sul globo: «Territory» misura l'ancora (EPSG:31700 → 45,5139 N 22,7892 E, il nord della griglia a −1,58°); «Globe» vola sopra la Terra (oltre 10 000 km, nessun NaN per strada); la rotella sul sito scende e sotto i 3 km la camera passa alle mani dello Spazio SENZA muoversi (stessa posizione prima e dopo il passaggio); la rotella indietro oltre i 30 km la ridà al globo; «Go to the site» atterra in modo Sito; l'attribuzione delle fonti è in basso", async () => {
  if (!existsSync(GEO_V4)) return { pass: false, detail: { missing: GEO_V4 } };
  const { p, ctx, errors } = await geoOpen();
  const out = {};
  await geoOn(p);
  out.anchor = await p.evaluate(() => document.querySelector(".scn-host").__geoSpace().anchor);
  await p.click('.scn-bar [data-geo-mode="globe"]');
  await p.waitForTimeout(300);
  let g = await geoIdle(p);
  out.globe = { mode: g.mode, alt: Math.round(g.altitude) };
  out.attribution = await p.evaluate(() => document.querySelector(".scn-host .geo-attrib")?.textContent ?? "");
  // the wheel on the site
  const box = await (await p.$(".scn-host canvas")).boundingBox();
  for (let i = 0; i < 300; i++) {
    g = await geoState(p);
    if (g.mode !== "globe") break;
    const s = await p.evaluate(() => document.querySelector(".scn-host").__spaceProject([0, 0, 0]));
    const at = s && s.x > box.x && s.x < box.x + box.width && s.y > box.y && s.y < box.y + box.height ? s : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await p.mouse.move(at.x, at.y);
    await p.mouse.wheel(0, -240);
    await p.waitForTimeout(50);
    // MICRO-GLOBO-INTERAZIONE · the passage waits for the end of the gesture (a
    // wheel burst: 300 ms of quiet): under 3 km, stop and let it happen
    const h = await geoState(p);
    if (h.mode === "globe" && h.altitude < 3000) { out.heldBelow = Math.round(h.altitude); await p.waitForTimeout(500); }
  }
  out.down = (await geoState(p)).lastSwitch;
  for (let i = 0; i < 300; i++) {
    g = await geoState(p);
    if (g.mode === "globe") break;
    await p.mouse.wheel(0, 400);
    await p.waitForTimeout(40);
  }
  out.up = (await geoState(p)).lastSwitch;
  await p.click('.scn-bar [data-geo="site"]');
  await p.waitForTimeout(300);
  g = await geoIdle(p);
  out.landed = { mode: g.mode, alt: Math.round(g.altitude) };
  out.pressed = await p.evaluate(() => document.querySelector('.scn-bar [data-geo-mode][aria-pressed="true"]')?.dataset.geoMode);
  out.errors = errors;
  await ctx.close();
  const d = out.down, u = out.up;
  const still = (s) => !!s && Math.hypot(s.posBefore[0] - s.posAfter[0], s.posBefore[1] - s.posAfter[1], s.posBefore[2] - s.posAfter[2]) < 1e-3;
  const pass = Math.abs(out.anchor?.lat - 45.51389) < 1e-4 && Math.abs(out.anchor?.lon - 22.78921) < 1e-4 && Math.abs(out.anchor?.azimuth + 1.584) < 0.01
    && out.globe.mode === "globe" && out.globe.alt > 1e7
    && d?.from === "globe" && d?.to === "site" && d?.why === "auto" && still(d)
    && u?.from === "site" && u?.to === "globe" && u?.why === "auto" && still(u)
    && out.landed.mode === "site" && out.landed.alt < 3000 && out.pressed === "site"
    && /EOX/.test(out.attribution) && /Mapterhorn/.test(out.attribution) && !out.errors.length;
  return { pass, detail: out };
});

test("GG2.layers", "GEOGLOBO p.2–4 · il pannello «Layers»: un'ortofoto GeoTIFF in EPSG:31700 aggiunta dal suo percorso diventa un livello (il bridge la riproietta in un PMTiles accanto, l'originale resta) drappeggiato sul terreno, in cima all'elenco; l'opacità e l'ordine cambiano senza errori di three; «su un piano» la mette sul piano del sito con i suoi spigoli dove il CRS li dice (±100 m attorno all'ancora), appena sopra il terreno; «Estrai area» non offre OpenStreetMap (solo online); nessun «could not be decoded»", async () => {
  if (!existsSync(GEO_V4) || !existsSync(GEO_ORTHO)) return { pass: false, detail: { missing: [GEO_V4, GEO_ORTHO].filter((f) => !existsSync(f)) } };
  const { p, ctx, errors } = await geoOpen();
  const out = {};
  await geoOn(p);
  await p.click('.scn-bar [data-geo="panel"]');
  await p.waitForSelector(".geo-panel:not(.hidden)");
  await p.fill(".geo-panel [data-geo-raster]", GEO_ORTHO);
  await p.click('.geo-panel [data-geo-act="add-raster"]');
  await p.waitForFunction(() => (document.querySelector(".scn-host").__geoSpace().layers ?? []).some((l) => l.kind === "raster"), null, { timeout: 60000 });
  const id = `raster:${GEO_ORTHO}`;
  out.layers = await p.evaluate(() => document.querySelector(".scn-host").__geoSpace().layers.map((l) => [l.id, l.kind, l.maxZoom ?? null, !!l.path]));
  await p.waitForTimeout(1500);
  out.overlays = (await geoState(p)).overlays;
  // the opacity, the order
  await p.$eval(`.geo-panel [data-geo-layer="${id}"] input[type=range]`, (el) => { el.value = "0.4"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await p.click(`.geo-panel [data-geo-layer="${id}"] [data-geo-act="down"]`);
  out.order = await p.evaluate(() => document.querySelector(".scn-host").__geoSpace().layers.map((l) => l.id).slice(0, 2));
  out.opacity = await p.evaluate((i) => document.querySelector(".scn-host").__geoSpace().layers.find((l) => l.id === i)?.opacity, id);
  await p.click(`.geo-panel [data-geo-layer="${id}"] [data-geo-act="up"]`);
  // on a plane
  await p.click(`.geo-panel [data-geo-layer="${id}"] [data-geo-act="plane"]`);
  await p.evaluate(() => document.querySelector(".scn-host").__spaceSetCam({ pos: [150, 200, 300], target: [0, 0, 0] }));
  await p.waitForFunction(() => (document.querySelector(".scn-host").__geoPlanes?.() ?? []).length === 1, null, { timeout: 30000 });
  await p.waitForTimeout(4000);
  out.plane = await p.evaluate(() => { const h = document.querySelector(".scn-host"); return { planes: h.__geoPlanes(), ground: h.__geoGround(0, 0) }; });
  out.overlaysPlane = (await geoState(p)).overlays;
  out.osm = await p.evaluate(() => { const o = document.querySelector('.geo-panel [data-geo-act="source"] option[value="osm"]'); return o ? o.disabled : null; });
  out.errors = errors;
  await ctx.close();
  const c = out.plane.planes[0]?.corners ?? [];
  const corners = c.length === 4 && [[-100, 100], [100, 100], [100, -100], [-100, -100]].every(([x, z], i) => Math.abs(c[i][0] - x) < 1e-6 && Math.abs(c[i][2] - z) < 1e-6);
  const pass = out.layers[0]?.[0] === id && out.layers[0][1] === "raster" && out.layers[0][2] >= 19 && out.layers[0][3]
    && out.overlays.includes(id) && out.order[1] === id && out.opacity === 0.4
    && corners && out.plane.ground !== null && out.plane.planes[0].y >= out.plane.ground - 0.5 && !out.overlaysPlane.includes(id)
    && out.osm === true && !out.errors.length;
  return { pass, detail: out };
});

test("GG5.fail", "BRIDGE-CERTIFICATI · una fonte che il bridge non raggiunge (il caso di E.D.: il bridge installato, «certificate not verifiable») lo dice: nel pannello «Layers» un ⚠ accanto alla fonte, col motivo; nel Log una riga sola anche se il bridge la ripete; la fonte che torna a rispondere toglie il ⚠", async () => {
  if (!existsSync(GEO_V4)) return { pass: false, detail: { missing: GEO_V4 } };
  const { p, ctx, errors } = await geoOpen();
  const why = "certificate not verifiable (unable to get local issuer certificate)";
  let failing = true;
  await p.route("**/tiles/failures", (r) => r.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, sources: failing ? { "s2cloudless-2016": { reason: why, count: 12, since: 1, at: 2 } } : {} }) }));
  const out = {};
  await geoOn(p);
  await p.click('.scn-bar [data-geo="panel"]');
  await p.waitForSelector(".geo-panel:not(.hidden)");
  await p.waitForSelector('.geo-panel [data-geo-fail="s2cloudless-2016"]', { timeout: 15000 }).catch(() => {});
  out.mark = await p.evaluate(() => [...document.querySelectorAll(".geo-panel [data-geo-fail]")].map((e) => [e.closest("[data-geo-layer]")?.dataset.geoLayer, e.title]));
  await p.waitForTimeout(9000);    // two more polls: the same reason, not a second line
  out.log = await p.evaluate(() => window.__EM_DRAG__.log().filter((e) => /does not answer through the bridge/.test(e.message)).map((e) => `${e.level} ${e.message}`));
  failing = false;
  await p.waitForFunction(() => !document.querySelector(".geo-panel [data-geo-fail]"), null, { timeout: 15000 }).catch(() => {});
  out.after = await p.evaluate(() => document.querySelectorAll(".geo-panel [data-geo-fail]").length);
  out.errors = errors;
  await ctx.close();
  const pass = out.mark.length === 1 && out.mark[0][0] === "base:s2cloudless-2016" && out.mark[0][1].includes(why)
    && out.log.length === 1 && /^warn /.test(out.log[0]) && out.log[0].includes(why) && out.after === 0 && !out.errors.length;
  return { pass, detail: out };
});

test("GG6.hands", "GLOBO-INTERAZIONE p.2 · le mani di Google Earth nel Globo e nella Pianta, con eventi simulati: il sinistro trascinato afferra la Terra (il punto sotto il cursore resta sotto il cursore, entro 1 px) e il nord resta a 0° dopo il pan e dopo la rotella; il destro e Shift + sinistro ruotano e inclinano attorno al punto sotto il cursore; la bussola si vede, un clic la riporta a 0°, il doppio clic anche la vista dall'alto; nella Pianta il trascinamento afferra (non orbita) e il destro ruota senza inclinare; la rotella che scende sotto i 3 km non cambia le mani a metà raffica, le cambia appena finisce; nel Sito resta l'orbita (le mani del globo spente)", async () => {
  if (!existsSync(GEO_V4)) return { pass: false, detail: { missing: GEO_V4 } };
  const { p, ctx, errors } = await geoOpen();
  const out = {};
  await geoOn(p);
  const box = await (await p.$(".scn-host canvas")).boundingBox();
  const C = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const pick = (x, y) => p.evaluate(([x, y]) => document.querySelector(".scn-host").__geoPickAt(x, y), [x, y]);
  const scr = (P) => p.evaluate((P) => document.querySelector(".scn-host").__geoScreenOf(P), P);
  const drag = async (x0, y0, dx, dy, o = {}) => {
    if (o.key) await p.keyboard.down(o.key);
    await p.mouse.move(x0, y0); await p.mouse.down({ button: o.button ?? "left" });
    for (let i = 1; i <= 8; i++) { await p.mouse.move(x0 + (dx * i) / 8, y0 + (dy * i) / 8); await p.waitForTimeout(16); }
    await p.mouse.up({ button: o.button ?? "left" });
    if (o.key) await p.keyboard.up(o.key);
    // MICRO-SUITE-VERDE · read when the camera has stopped, not after a fixed 250 ms
    await p.waitForTimeout(100); await geoIdle(p, 5000);
  };
  const grabErr = async (x0, y0, dx, dy) => { const P = await pick(x0, y0); await drag(x0, y0, dx, dy); const s = P ? await scr(P) : null; return s ? Math.hypot(s.x - x0 - dx, s.y - y0 - dy) : null; };
  // the globe: north up after the flight, the compass shown
  await p.click('.scn-bar [data-geo-mode="globe"]');
  await p.waitForTimeout(300);
  let g = await geoIdle(p);
  out.globe = { mode: g.mode, heading: g.pose?.heading, compass: g.compass };
  out.grabGlobe = await grabErr(C.x + 40, C.y + 30, 60, -50);
  out.headingAfterGrab = (await geoState(p)).pose.heading;
  // the wheel toward the site, down to a region
  const site = await p.evaluate(() => document.querySelector(".scn-host").__spaceProject([0, 0, 0]));
  await p.mouse.move(site.x, site.y);
  for (let i = 0; i < 80; i++) { g = await geoState(p); if (g.altitude < 60000) break; await p.mouse.wheel(0, -300); await p.waitForTimeout(40);
    const s2 = await p.evaluate(() => document.querySelector(".scn-host").__spaceProject([0, 0, 0])); if (s2) await p.mouse.move(s2.x, s2.y); }
  await p.waitForTimeout(400);
  g = await geoState(p);
  out.region = { mode: g.mode, alt: Math.round(g.altitude), heading: g.pose.heading };
  out.grabRegion = await grabErr(C.x + 60, C.y + 50, -120, -40);
  {
    const x = C.x - 70, y = C.y + 40, P = await pick(x, y);
    await p.mouse.move(x, y);
    for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(40); }
    await p.waitForTimeout(400);
    const s = P ? await scr(P) : null;
    out.wheelRegion = { err: s ? Math.hypot(s.x - x, s.y - y) : null, heading: (await geoState(p)).pose.heading };
  }
  // right drag and Shift + left: turn and tilt around the point under the cursor
  {
    const x = C.x + 50, y = C.y + 40, P = await pick(x, y);
    const g0 = await geoState(p);
    await drag(x, y, 100, -60, { button: "right" });
    const g1 = await geoState(p);
    const s = P ? await scr(P) : null;
    out.turn = { err: s ? Math.hypot(s.x - x, s.y - y) : null, heading: [g0.pose.heading, g1.pose.heading], pitch: [g0.pose.pitch, g1.pose.pitch] };
    await drag(C.x, C.y, -60, 0, { key: "Shift" });
    out.shiftTurn = (await geoState(p)).pose.heading;
    out.grabTurned = await grabErr(C.x - 60, C.y + 30, 90, 30);
    out.headingKept = (await geoState(p)).pose.heading;
  }
  // the compass
  out.compassBefore = (await geoState(p)).compass;
  await p.click(".scn-host .geo-compass");
  await p.waitForTimeout(700);
  g = await geoState(p);
  out.compassClick = { heading: g.pose.heading, compass: g.compass, pitch: g.pose.pitch };
  await p.dblclick(".scn-host .geo-compass");
  await p.waitForTimeout(900);
  g = await geoState(p);
  out.compassDbl = { heading: g.pose.heading, pitch: g.pose.pitch };
  // the plan: the same hands
  await p.click('.scn-bar [data-geo-mode="plan"]');
  await p.waitForTimeout(300);
  g = await geoIdle(p);
  out.plan = { mode: g.mode, heading: g.pose.heading, hands: g.hands.enabled };
  out.grabPlan = await grabErr(C.x + 80, C.y + 30, -130, 70);
  await drag(C.x, C.y, 90, -70, { button: "right" });
  g = await geoState(p);
  out.planTurn = { heading: g.pose.heading, pitch: g.pose.pitch, mode: g.mode };
  // the globe again, just over 3 km above the site: a wheel burst down past it keeps the globe's hands until it ends
  await p.click(".scn-host .geo-compass");
  await p.click('.scn-bar [data-geo-mode="globe"]');
  await p.waitForTimeout(300);
  await geoIdle(p);
  const s3 = await p.evaluate(() => document.querySelector(".scn-host").__spaceProject([0, 0, 0]));
  await p.mouse.move(s3.x, s3.y);
  const burst = [];
  // a burst is wheel events less than 300 ms apart (geo-hands): ONE question to
  // the page per event (the state and where the site is), not three — under the
  // whole suite's load four round trips per event made gaps of more than 300 ms,
  // the burst ended early and the hand-off came above 2.5 km (MICRO-SUITE-VERDE)
  let at = s3;
  for (let i = 0; i < 200; i++) {
    const q = await p.evaluate(() => { const h = document.querySelector(".scn-host"); const g = h.__geo();
      return { altitude: g.altitude, mode: g.mode, site: h.__spaceProject([0, 0, 0]) }; });
    if (q.altitude < 2500 || q.mode !== "globe") break;
    if (q.site && Math.hypot(q.site.x - at.x, q.site.y - at.y) > 2) { at = q.site; await p.mouse.move(at.x, at.y); }
    await p.mouse.wheel(0, q.altitude > 10000 ? -300 : -60);
    await p.waitForTimeout(30);
  }
  g = await geoState(p);
  burst.push({ alt: Math.round(g.altitude), mode: g.mode, busy: g.hands.busy });
  await p.waitForTimeout(700);
  g = await geoState(p);
  burst.push({ alt: Math.round(g.altitude), mode: g.mode, hands: g.hands.enabled });
  out.burst = burst;
  // the site: the Space's orbit
  const c0 = await p.evaluate(() => document.querySelector(".scn-host").__spaceCamState());
  await drag(C.x, C.y, 100, 0, { button: "middle" });
  const c1 = await p.evaluate(() => document.querySelector(".scn-host").__spaceCamState());
  out.site = { mode: (await geoState(p)).mode, hands: (await geoState(p)).hands.enabled, compass: (await geoState(p)).compass,
    orbit: Math.hypot(...c0.pos.map((v, i) => v - c1.pos[i])) > 1 && Math.hypot(...c0.target.map((v, i) => v - c1.target[i])) < 1e-3 };
  out.errors = errors;
  await p.screenshot({ path: SHOT("gg6-hands") }).catch(() => {});
  await ctx.close();
  const z = (h) => Math.abs((((h ?? 99) + 540) % 360) - 180) < 0.01;
  const px = (e, tol = 1) => e !== null && e <= tol;
  const pass = out.globe.mode === "globe" && z(out.globe.heading) && out.globe.compass !== null && px(out.grabGlobe) && z(out.headingAfterGrab)
    && out.region.mode === "globe" && z(out.region.heading) && px(out.grabRegion) && px(out.wheelRegion.err, 2) && z(out.wheelRegion.heading)
    && px(out.turn.err) && Math.abs(out.turn.heading[1] - out.turn.heading[0]) > 10 && out.turn.pitch[1] > out.turn.pitch[0] + 5
    && Math.abs(out.shiftTurn - out.turn.heading[1]) > 5 && px(out.grabTurned) && Math.abs(out.headingKept - out.shiftTurn) < 1e-6
    && Math.abs(out.compassBefore) > 5 && z(out.compassClick.heading) && z(out.compassClick.compass) && Math.abs(out.compassDbl.pitch + 90) < 0.01 && z(out.compassDbl.heading)
    && out.plan.mode === "plan" && out.plan.hands && z(out.plan.heading) && px(out.grabPlan) && Math.abs(out.planTurn.heading) > 10 && Math.abs(out.planTurn.pitch + 90) < 0.01
    && burst[0].mode === "globe" && burst[0].alt < 3000 && burst[1].mode === "site" && !burst[1].hands
    && out.site.mode === "site" && !out.site.hands && out.site.compass === null && out.site.orbit && !errors.length;
  return { pass, detail: out };
});

test("GG7.globemin", "GLOBO-INTERAZIONE p.3 · il globo minimo resta: il pannello «Layers» dice ciò che il bridge legge dalla cartella (non la memoria di un job) — presente (sorgente, peso, z0–6) con «Download again» invece di «Download»; presente e l'ultimo download fallito: presente, e il fallimento detto accanto; assente: «not downloaded»; il bridge che non risponde: «not read», mai «not downloaded»", async () => {
  if (!existsSync(GEO_V4)) return { pass: false, detail: { missing: GEO_V4 } };
  const { p, ctx, errors } = await geoOpen();
  const pkg = { source: "s2cloudless-2016", path: "/x/globe/s2cloudless-2016-z0-6.pmtiles", bytes: 29762357, max_zoom: 6 };
  const body = (k) => k === "error" ? null : JSON.stringify({ ok: true, dir: "/x/globe", packages: k === "absent" ? [] : [pkg],
    status: { imagery: k === "absent" ? { source: "s2cloudless-2016", zmax: 6, state: "absent" } : { ...pkg, zmax: 6, state: "present" }, terrain: { source: "mapterhorn", zmax: 3, state: "absent" } },
    last_job: k === "failed" ? { job: "j1", state: "failed", error: "16 tiles in a row failed: connection refused", done: 0, failed: 16, total: 5461 } : null,
    plan: { imagery: { source: "s2cloudless-2016", zmax: 6 }, terrain: { source: "mapterhorn", zmax: 3 } } });
  let mode = "present";
  await p.route("**/tiles/globe-min", (r) => r.request().method() !== "GET" ? r.continue()
    : mode === "error" ? r.fulfill({ status: 500, headers: { "Access-Control-Allow-Origin": "*" }, body: "" })
    : r.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: body(mode) }));
  await geoOn(p);
  const out = {};
  const read = async () => {
    const panelBtn = '.scn-bar [data-geo="panel"]';
    if (await p.$(".geo-panel:not(.hidden)")) { await p.click(panelBtn); await p.waitForTimeout(200); }
    await p.click(panelBtn);
    await p.waitForSelector(".geo-panel:not(.hidden)");
    // the globe's tiles may hold the browser's connections to the bridge: the line says «reading» meanwhile
    out.sawReading ||= await p.evaluate(() => document.querySelector(".geo-panel .geo-min")?.dataset.geoMin === "reading");
    await p.waitForFunction(() => document.querySelector(".geo-panel .geo-min")?.dataset.geoMin !== "reading", null, { timeout: 60000 }).catch(() => {});
    return p.evaluate(() => { const g = document.querySelector(".geo-panel .geo-min"); return { state: g?.dataset.geoMin, text: g?.querySelector("span")?.textContent ?? "",
      button: g?.querySelector('[data-geo-act="globe-min"]')?.textContent ?? "", kept: g?.querySelector("[data-geo-min-kept]")?.textContent ?? null }; });
  };
  for (const k of ["present", "failed", "absent", "error"]) { mode = k; out[k] = await read(); }
  out.errors = errors.filter((e) => !/status of 500/.test(e));
  await ctx.close();
  const pass = out.present.state === "present" && /present/.test(out.present.text) && /28\.4 MB|28 MB/.test(out.present.text) && /z0–6/.test(out.present.text) && /again/i.test(out.present.button) && out.present.kept === null
    && out.failed.state === "present" && /present/.test(out.failed.text) && /connection refused/.test(out.failed.kept ?? "")
    && out.absent.state === "absent" && /not downloaded/.test(out.absent.text) && !/again/i.test(out.absent.button)
    && out.error.state === "unknown" && /not read/.test(out.error.text) && !/not downloaded/.test(out.error.text) && !out.errors.length;
  return { pass, detail: out };
});

test("GG3.viewer", "GEOGLOBO p.4 · il raster come documento nel Viewer: «Apri nel Viewer» dal pannello mostra la GeoTIFF in piano (l'anteprima PNG del bridge, nel suo CRS) e la didascalia dice il georiferimento — EPSG:31700 · 0.100 m/px · 2000×2000 · gli angoli", async () => {
  if (!existsSync(GEO_V4) || !existsSync(GEO_ORTHO)) return { pass: false, detail: { missing: [GEO_V4, GEO_ORTHO].filter((f) => !existsSync(f)) } };
  const { p, ctx, errors } = await geoOpen();
  await geoOn(p);
  await p.click('.scn-bar [data-geo="panel"]');
  await p.fill(".geo-panel [data-geo-raster]", GEO_ORTHO);
  await p.click('.geo-panel [data-geo-act="add-raster"]');
  await p.waitForFunction(() => (document.querySelector(".scn-host").__geoSpace().layers ?? []).some((l) => l.kind === "raster"), null, { timeout: 60000 });
  await p.click(`.geo-panel [data-geo-layer="raster:${GEO_ORTHO}"] [data-geo-act="viewer"]`);
  await p.waitForFunction(() => [...document.querySelectorAll("*")].some((e) => e.childElementCount === 0 && /EPSG:31700 ·/.test(e.textContent ?? ""))
    && [...document.querySelectorAll("img.viewer-media")].some((i) => i.naturalWidth > 0), null, { timeout: 30000 }).catch(() => null);
  const out = await p.evaluate(() => ({
    caption: [...document.querySelectorAll("*")].map((e) => (e.childElementCount === 0 ? e.textContent : "")).find((t) => /EPSG:31700 ·/.test(t ?? "")) ?? null,
    // the picture: the bridge's PNG (fetched as a blob), drawn flat
    img: [...document.querySelectorAll("img.viewer-media")].map((i) => ({ alt: i.alt, w: i.naturalWidth, h: i.naturalHeight })).find((i) => /ortho/.test(i.alt)) ?? null }));
  out.errors = errors;
  await ctx.close();
  return { pass: /EPSG:31700 · 0\.100 m\/px · 2000×2000 · 327200\.00, 448270\.00 – 327400\.00, 448470\.00/.test(out.caption ?? "") && out.img?.w === 2000 && !errors.length, detail: out };
});

// ── MICRO-SERVSF-FINE-ISTANZE ───────────────────────────────────────────────
const SV_V4 = benchFile("SERVSF_V4");
const svOpen = async (path = SV_V4) => {
  const o = await open({ doc: null, locale: "en", w: 1728, h: 1000 });
  await o.p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(readFileSync(path, "utf8")), path]);
  await o.p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await o.p.waitForTimeout(1500);
  return o;
};

test("SV1.servsf", "SERVSF-FINE-ISTANZE p.1 · la serie di VSF nell'interfaccia: GT16, Matrix, «Add» al cursore in XX sec, «VSF series» nel gruppo Series col suo cartellino (la ripetizione di uno stesso oggetto); nasce serVSF, disegnata nella Matrix e nel Grafo col glifo della VSF (ellisse, bordo #B19F61), l'Inspector dice «VSF series» (e nel cartellino del tipo la definizione), la Legenda EM la elenca (serVSF); il cartellino di un RSF sul canvas dice «Repositioned Special Find»", async () => {
  if (!existsSync(SV_V4)) return { pass: false, detail: { missing: SV_V4 } };
  const { p, ctx, errors } = await svOpen();
  const D = (f, a) => p.evaluate(f, a);
  const out = {};
  const before = new Set(await D(() => window.__EM_DRAG__.viewNodeIds("matrix")));
  const rr = await glFrame(p, 0.6, 3500, 150);
  await p.mouse.click(rr.x + rr.w / 2, rr.y + rr.h / 2, { button: "right" }); await p.waitForTimeout(500);
  await p.fill(".addm .addm-q", "VSF series"); await p.waitForTimeout(300);
  out.items = await D(() => [...document.querySelectorAll(".addm .addm-item")].map((b) => b.textContent.trim()).slice(0, 4));
  const item = p.locator(".addm .addm-item").first();
  await item.hover(); await p.waitForTimeout(250);
  out.card = await D(() => { const t = document.getElementById("tooltip"); return t && !t.classList.contains("hidden") ? t.textContent : null; });
  await item.click(); await p.waitForTimeout(1500);
  const born = (await D(() => window.__EM_DRAG__.viewNodeIds("matrix"))).find((id) => !before.has(id)) ?? null;
  out.born = born ? await D((id) => ({ type: window.__EM_DRAG__.node(id)?.node_type, name: window.__EM_DRAG__.node(id)?.name }), born) : null;
  out.style = await D(() => { const s = window.__EM_DRAG__.nodeStyleOf?.("serVSF"); return s ?? null; });
  const insp = await D(() => window.__EM_DRAG__.wins().find((w) => w.type === "inspector")?.id);
  if (born) { await D((id) => window.__EM_DRAG__.select(id), born); await p.waitForTimeout(500); }
  out.inspector = insp ? await D((w) => { const c = document.querySelector(`.tile-area[data-win="${w}"] .insp-chip`); return c ? { label: c.dataset.typeLabel, title: c.title.slice(0, 80) } : null; }, insp) : null;
  await p.screenshot({ path: SHOT("sv1-matrix") }).catch(() => {});
  // the Graph view draws it too
  out.inGraph = born ? await D(async (id) => { window.__EM_DRAG__.setGraphMode?.("graph"); await new Promise((r) => setTimeout(r, 1500)); return window.__EM_DRAG__.viewNodeIds("graph").includes(id); }, born) : null;
  // Help ▸ EM legend
  out.legend = await D(() => { document.getElementById("btn-help-legend")?.click();
    const row = [...document.querySelectorAll(".em-legend .gl-node, .em-legend .gl-item")].find((r) => r.querySelector(".gl-code")?.textContent === "serVSF");
    const txt = row ? row.textContent : null; document.querySelector(".em-legend .modal-foot button")?.click(); return txt; });
  // an RSF's card on the canvas
  await D(() => window.__EM_DRAG__.setGraphMode?.("matrix")); await p.waitForTimeout(1200);
  const rsf = await D(() => window.__EM_DRAG__.matrixGeom().nodes.find((n) => n.type === "RSF"));
  if (rsf) {
    await glFrame(p, 0.8, rsf.x + rsf.w / 2, rsf.y + rsf.h / 2);
    const b = await D((id) => window.__EM_DRAG__.winScene(window.__EM_DRAG__.wins().find((w) => w.type === "graph").id).boxes.find((x) => x.id === id), rsf.id);
    if (b) { await p.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await p.waitForTimeout(900); }
    out.rsfCard = await D(() => { const t = document.getElementById("tooltip"); return t && !t.classList.contains("hidden") ? t.textContent.slice(0, 160) : null; });
  }
  await ctx.close();
  const pass = out.items[0]?.includes("VSF series") && /repetition/i.test(out.card ?? "")
    && out.born?.type === "serVSF" && out.style?.shape === "ellipse" && String(out.style?.border).toUpperCase() === "#B19F61"
    && out.inspector?.label === "VSF series" && /repetition/i.test(out.inspector?.title ?? "") && out.inGraph === true && /VSF series/.test(out.legend ?? "") && /Repositioned Special Find/.test(out.rsfCard ?? "") && !errors.length;
  return { pass, detail: { ...out, errors } };
});

test("SV2.endtype", "SERVSF-FINE-ISTANZE p.2 · il tipo di fine: GT16, «End in…» dall'Inspector su cinque unità, una per tipo (SU003 destroyed, SU004 transformed, SU007 ignota e poi «removed» dall'Inspector del BR, RSF001 relocated, SU020 lasciata «unknown»): il modulo offre i cinque tipi del datamodel con le etichette tradotte, «unknown» scelto di default e non scritto; un annulla ciascuno; nella Matrix il BR dice il tipo accanto al rombo (non per «unknown»); l'Inspector del BR dice classe CIDOC, epoca «ereditata»; una data propria (1960) lo porta in XX sec con la regola «dalla sua data», l'unità sopravvive fino a lì; salva e riapri: i tipi restano; «Esporta RDF» dall'interfaccia (il bridge, s3Dgraphy) scrive per ciascuno la sua classe (E6, E81, E80, E9, E64) e la sua proprietà", async () => {
  if (!existsSync(SV_V4)) return { pass: false, detail: { missing: SV_V4 } };
  const { p, ctx, errors } = await svOpen();
  const D = (f, a) => p.evaluate(f, a);
  const out = {};
  const g = await D(() => { const g = window.__EM_DRAG__.matrixGeom(); for (const n of g.nodes) n.name = window.__EM_DRAG__.node(n.id)?.name; return g; });
  const by = (name) => g.nodes.find((n) => n.name === name);
  const insp = await D(() => window.__EM_DRAG__.wins().find((w) => w.type === "inspector")?.id);
  const IN = `.tile-area[data-win="${insp}"]`;
  const end = async (name, epoch, reason) => {
    const id = by(name)?.id;
    if (!id) return { missing: name };
    await D((x) => window.__EM_DRAG__.select(x), id); await p.waitForTimeout(500);
    await p.click(`${IN} [data-cmd^="continuity-"]`); await p.waitForTimeout(300);
    const options = await D(() => [...document.querySelectorAll('.cont-form select[data-cont="reason"] option')].map((o) => [o.value, o.textContent, o.selected]));
    await p.selectOption('.cont-form select[data-cont="epoch"]', g.lanes.find((l) => l.label === epoch).id);
    if (reason) await p.selectOption('.cont-form select[data-cont="reason"]', reason);
    const u0 = await D(() => window.__EM_DRAG__.undoDepth());
    await p.click('.cont-form [data-cont="apply"]'); await p.waitForTimeout(700);
    const c = await D((x) => window.__EM_DRAG__.continuityOf(x), id);
    return { id, options, steps: (await D(() => window.__EM_DRAG__.undoDepth())) - u0, br: c?.br, reason: c?.reason, written: c?.written,
      raw: c ? await D((b) => window.__EM_DRAG__.node(b)?.data?.end_reason ?? null, c.br) : null };
  };
  out.SU003 = await end("SU003", "Post antiquity", "destroyed");
  out.SU004 = await end("SU004", "Post antiquity", "transformed");
  out.SU007 = await end("SU007", "Post antiquity", null);
  out.RSF001 = await end("RSF001", "XX sec", "relocated");
  out.SU020 = await end("SU020", "Post antiquity", "unknown");
  // the BR's Inspector: SU007's type from unknown to removed, one undo step
  await D((b) => window.__EM_DRAG__.select(b), out.SU007.br); await p.waitForTimeout(500);
  out.brInsp = await D((w) => { const s = document.querySelector(`${w} .insp-br`); if (!s) return null;
    const v = (k) => s.querySelector(`[data-br="${k}"] .insp-br-v`)?.textContent ?? null;
    return { type: s.querySelector('select[data-br="type"]')?.value, class: v("class"), epoch: v("epoch"), unit: v("unit") }; }, IN);
  const u0 = await D(() => window.__EM_DRAG__.undoDepth());
  await p.selectOption(`${IN} .insp-br select[data-br="type"]`, "removed"); await p.waitForTimeout(500);
  out.brEdit = { steps: (await D(() => window.__EM_DRAG__.undoDepth())) - u0, raw: await D((b) => window.__EM_DRAG__.node(b)?.data?.end_reason, out.SU007.br),
    class: await D((w) => document.querySelector(`${w} .insp-br [data-br="class"] .insp-br-v`)?.textContent ?? null, IN) };
  // SU003's BR: a date of its own, 1960 → XX sec
  await D((b) => window.__EM_DRAG__.select(b), out.SU003.br); await p.waitForTimeout(500);
  await p.fill(`${IN} .insp-br input[data-br="start"]`, "1960"); await p.press(`${IN} .insp-br input[data-br="start"]`, "Enter");
  await p.locator(`${IN} .insp-br input[data-br="start"]`).blur().catch(() => {}); await p.waitForTimeout(800);
  out.dated = await D(([w, b, u]) => ({ epoch: document.querySelector(`${w} .insp-br [data-br="epoch"] .insp-br-v`)?.textContent ?? null,
    first: window.__EM_DRAG__.node(window.__EM_DRAG__.edgesOf("has_first_epoch").find((e) => e.source === b)?.target)?.name,
    survive: window.__EM_DRAG__.edgesOf("survive_in_epoch").filter((e) => e.source === u).map((e) => window.__EM_DRAG__.node(e.target)?.name).sort(),
    prop: window.__EM_DRAG__.edgesOf("has_property").filter((e) => e.source === b).map((e) => window.__EM_DRAG__.node(e.target)?.data?.property_type) }),
    [IN, out.SU003.br, out.SU003.id]);
  // the sign beside the rhombus
  const geo = await D(() => window.__EM_DRAG__.matrixGeom().nodes.filter((n) => n.type === "BR").map((n) => [n.id, n.endType ?? null]));
  out.signs = Object.fromEntries(["SU003", "SU004", "SU007", "RSF001", "SU020"].map((k) => [k, (geo.find(([id]) => id === out[k].br) ?? [])[1] ?? null]));
  const b3 = by("SU004"); if (b3) await glFrame(p, 0.7, b3.x + 40, b3.y - 40);
  await p.screenshot({ path: SHOT("sv2-endtypes") }).catch(() => {});
  // save and reopen
  const text = await D(() => window.__EM_DRAG__.docJson());
  await D(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(text), SV_V4]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  out.reopened = await D((ids) => ids.map((id) => window.__EM_DRAG__.continuityOf(id)?.reason ?? null), ["SU003", "SU004", "SU007", "RSF001", "SU020"].map((k) => out[k].id));
  // «Export RDF» from the interface: the bridge's s3Dgraphy
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }).catch(() => null), D(() => document.getElementById("btn-ttl")?.click())]);
  const ttl = dl ? readFileSync(await dl.path(), "utf8") : "";
  out.ttlBytes = ttl.length;
  // each BR's block: its rdf:type and the property to its unit (prefixed or full IRIs)
  const block = (brId) => { const i = ttl.indexOf(brId); if (i < 0) return ""; const j = ttl.lastIndexOf("\n\n", i); const k = ttl.indexOf("\n\n", i); return ttl.slice(j < 0 ? 0 : j, k < 0 ? ttl.length : k); };
  out.rdf = Object.fromEntries(["SU003", "SU004", "SU007", "RSF001", "SU020"].map((k) => {
    const b = block(out[k].br);
    return [k, ["E6_Destruction", "E81_Transformation", "E80_Part_Removal", "E9_Move", "E64_End_of_Existence"].filter((c) => b.includes(c))
      .concat(["P13_destroyed", "P124_transformed", "P113_removed", "P25_moved", "P93_took_out_of_existence"].filter((c) => b.includes(c)))];
  }));
  await ctx.close();
  const five = ["destroyed", "transformed", "removed", "relocated", "unknown"];
  const pass = JSON.stringify(out.SU003.options.map((o) => o[0])) === JSON.stringify(five) && out.SU007.options.find((o) => o[2])?.[0] === "unknown"
    && ["SU003", "SU004", "SU007", "RSF001", "SU020"].every((k) => out[k].steps === 1)
    && out.SU003.raw === "destroyed" && out.SU004.raw === "transformed" && out.SU007.raw === null && out.RSF001.raw === "relocated" && out.SU020.raw === null
    && out.brInsp?.type === "unknown" && /E64_End_of_Existence/.test(out.brInsp?.class ?? "") && /inherited/.test(out.brInsp?.epoch ?? "")
    && out.brEdit.steps === 1 && out.brEdit.raw === "removed" && /E80_Part_Removal/.test(out.brEdit.class ?? "")
    && /XX sec/.test(out.dated.epoch ?? "") && /own date/.test(out.dated.epoch ?? "") && out.dated.first === "XX sec" && out.dated.survive.includes("XX sec") && out.dated.prop.includes("absolute_time_start")
    && out.signs.SU003 === "destroyed" && out.signs.SU004 === "transformed" && out.signs.SU007 === "removed" && out.signs.RSF001 === "relocated" && out.signs.SU020 === null
    && JSON.stringify(out.reopened) === JSON.stringify(["destroyed", "transformed", "removed", "relocated", "unknown"])
    && out.rdf.SU003.includes("E6_Destruction") && out.rdf.SU003.includes("P13_destroyed")
    && out.rdf.SU004.includes("E81_Transformation") && out.rdf.SU004.includes("P124_transformed")
    && out.rdf.SU007.includes("E80_Part_Removal") && out.rdf.SU007.includes("P113_removed")
    && out.rdf.RSF001.includes("E9_Move") && out.rdf.RSF001.includes("P25_moved")
    && out.rdf.SU020.includes("E64_End_of_Existence") && out.rdf.SU020.includes("P93_took_out_of_existence") && !errors.length;
  return { pass, detail: { ...out, errors } };
});

test("SV3.instances", "SERVSF-FINE-ISTANZE p.3 · le istanze per epoca: GT16, Spazio in II A.D., T21 (SF col suo proxy): l'Inspector ha «Instances in the epochs» con una riga (II A.D., geometria propria); «New instance…» in XX sec, SF, uno stato, la posizione al cursore 3D: un annulla; nasce l'unità con has_first_epoch, changed_from verso T21, lo stato, un RMSF con la sola trasformazione sullo stesso asset; due righe dalla più antica; nello Spazio la linea tratteggiata fra le due istanze, la seconda al cursore; il clic sulla riga della nuova la seleziona e porta lo Spazio in XX sec, dove è disegnata con la geometria di T21 al cursore; «⌖» la sposta col cursore (un annulla); lo stato di T21 scritto dalla riga (un annulla); salva e riapri: due righe, gli stati", async () => {
  if (!existsSync(SV_V4)) return { pass: false, detail: { missing: SV_V4 } };
  const { p, ctx, errors } = await svOpen();
  const D = (f, a) => p.evaluate(f, a);
  const out = {};
  const near = (a, b, tol = 0.05) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) < tol);
  const wait = async () => { for (let i = 0; i < 200; i++) { const n = await D(() => (document.querySelector(".scn-host")?.__space?.() ?? []).filter((x) => x.as === "pending").length); if (!n) break; await p.waitForTimeout(250); } };
  await p.click(`#workspace-bar .ws-tab[data-ws="space"]`);
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 60000 });
  const epochBtn = (name) => D((n) => [...document.querySelectorAll(".scn-seg button[data-epoch]")].find((b) => b.textContent.trim() === n)?.dataset.epoch, name);
  const II = await epochBtn("II A.D."), XX = await epochBtn("XX sec");
  await p.click(`.scn-seg button[data-epoch="${II}"]`); await wait();
  await D(() => document.querySelector("[data-frame]")?.click()); await p.waitForTimeout(1500);
  const T21 = await D(() => window.__EM_DRAG__.viewNodeIds("matrix").find((id) => window.__EM_DRAG__.node(id)?.name === "T21") ?? null);
  await D((id) => window.__EM_DRAG__.select(id), T21); await p.waitForTimeout(800);
  const insp = await D(() => window.__EM_DRAG__.wins().find((w) => w.type === "inspector")?.id);
  const IN = `.tile-area[data-win="${insp}"]`;
  const rows = () => D((w) => [...document.querySelectorAll(`${w} .insp-inst-row`)].map((r) => ({ id: r.dataset.instRow,
    ep: r.querySelector(".insp-inst-ep")?.textContent, pos: r.querySelector(".insp-inst-pos")?.textContent, state: r.querySelector(".insp-inst-state")?.value })), IN);
  out.rows0 = await rows();
  out.drawn0 = await D((id) => (document.querySelector(".scn-host").__space() ?? []).find((x) => x.id === id)?.as ?? null, T21);
  const c21 = await D((id) => window.__EM_DRAG__.spaceCentre(`proxy:${id}`), T21);
  out.c21 = c21;
  const cursor = c21 ? [c21[0] + 3, c21[1] + 1, c21[2] + 0.5] : null;
  await D((c) => window.__EM_DRAG__.setSpaceCursor(c), cursor); await p.waitForTimeout(300);
  // «New instance…» in XX sec
  await p.click(`${IN} [data-cmd="instance-new"]`); await p.waitForTimeout(200);
  out.form = await D((w) => ({ epochs: [...document.querySelectorAll(`${w} .insp-inst-form select[data-inst="epoch"] option`)].map((o) => [o.textContent, o.disabled]),
    types: [...document.querySelectorAll(`${w} .insp-inst-form select[data-inst="type"] option`)].map((o) => o.value),
    atCursor: document.querySelector(`${w} .insp-inst-form input[data-inst="at-cursor"]`)?.checked }), IN);
  await p.selectOption(`${IN} .insp-inst-form select[data-inst="epoch"]`, XX);
  await p.fill(`${IN} .insp-inst-form input[data-inst="state"]`, "fragmentary, found in the collapse");
  const u0 = await D(() => window.__EM_DRAG__.undoDepth());
  await p.click(`${IN} .insp-inst-form [data-inst="create"]`); await p.waitForTimeout(1200);
  out.steps = (await D(() => window.__EM_DRAG__.undoDepth())) - u0;
  const chain = await D((id) => window.__EM_DRAG__.epochInstances(id), T21);
  const fresh = chain.find((r) => r.id !== T21);
  out.chain = chain.map((r) => ({ name: r.name, type: r.node_type, state: r.conservation_state, placements: r.placements.map((x) => x.node_type), geometry_from: r.geometry_from === T21 ? "T21" : r.geometry_from }));
  out.edges = fresh ? await D(([n, t]) => {
    const E = window.__EM_DRAG__;
    const name = (id) => E.node(id)?.name ?? id;
    const of = (type) => E.edgesOf(type).filter((e) => e.source === n).map((e) => name(e.target));
    const rm = E.edgesOf("has_representation_model_sf").find((e) => e.source === n)?.target;
    return { first: of("has_first_epoch"), changed: of("changed_from"), rmLinks: rm ? E.edgesOf("has_linked_resource").filter((e) => e.source === rm).map((e) => E.node(e.target)?.node_type) : null,
      proxyRes: (() => { const g = E.edgesOf("has_property").filter((e) => e.source === t).map((e) => e.target).find((x) => E.node(x)?.data?.property_type === "geometry");
        const sh = g && E.edgesOf("has_semantic_shape").find((e) => e.source === g)?.target; return sh ? E.edgesOf("has_linked_resource").filter((e) => e.source === sh).map((e) => e.target) : null; })(),
      rmRes: rm ? E.edgesOf("has_linked_resource").filter((e) => e.source === rm).map((e) => e.target) : null,
      rmData: rm ? Object.keys(E.node(rm)?.data ?? {}) : null };
  }, [fresh.id, T21]) : null;
  await D((id) => window.__EM_DRAG__.select(id), T21); await p.waitForTimeout(700);
  out.rows1 = await rows();
  out.marks = await D(() => window.__EM_DRAG__.instanceMarks());
  out.svgChain = await D(() => { const pl = document.querySelector(".scn-mark.k-chain polyline"); return pl ? pl.getAttribute("points")?.trim().split(/\s+/).length ?? 0 : null; });
  await p.screenshot({ path: SHOT("sv3-chain-II") }).catch(() => {});
  // the new instance's row: selected, the Space in XX sec, drawn at the cursor with T21's geometry
  if (fresh) await p.click(`${IN} .insp-inst-row[data-inst-row="${fresh.id}"] .insp-inst-ep`);
  await p.waitForTimeout(1500); await wait(); await p.waitForTimeout(800);
  out.after = fresh ? await D(([id]) => ({ selected: window.__EM_DRAG__.selected?.() ?? null,
    epoch: [...document.querySelectorAll(".scn-seg button[data-epoch]")].find((b) => b.getAttribute("aria-pressed") === "true")?.textContent.trim(),
    drawn: (document.querySelector(".scn-host").__space() ?? []).find((x) => x.id === id)?.as ?? null,
    centre: window.__EM_DRAG__.spaceCentre(`proxy:${id}`) }), [fresh.id]) : null;
  await p.screenshot({ path: SHOT("sv3-instance-XX") }).catch(() => {});
  // «⌖»: the cursor 2 m north, the instance follows
  const cursor2 = cursor ? [cursor[0], cursor[1] + 2, cursor[2]] : null;
  await D((c) => window.__EM_DRAG__.setSpaceCursor(c), cursor2);
  if (fresh) await D((id) => window.__EM_DRAG__.select(id), fresh.id); await p.waitForTimeout(600);
  const u1 = await D(() => window.__EM_DRAG__.undoDepth());
  if (fresh) await p.click(`${IN} .insp-inst-row[data-inst-row="${fresh.id}"] [data-inst-at]`);
  await p.waitForTimeout(1500);
  out.move = fresh ? { steps: (await D(() => window.__EM_DRAG__.undoDepth())) - u1, centre: await D((id) => window.__EM_DRAG__.spaceCentre(`proxy:${id}`), fresh.id) } : null;
  // T21's state, from its row
  const u2 = await D(() => window.__EM_DRAG__.undoDepth());
  await p.fill(`${IN} .insp-inst-row[data-inst-row="${T21}"] .insp-inst-state`, "restored, glued");
  await p.press(`${IN} .insp-inst-row[data-inst-row="${T21}"] .insp-inst-state`, "Enter"); await p.waitForTimeout(200);
  await D(() => document.activeElement?.blur()); await p.waitForTimeout(600);
  out.state = { steps: (await D(() => window.__EM_DRAG__.undoDepth())) - u2, value: (await D((id) => window.__EM_DRAG__.epochInstances(id), T21)).find((r) => r.id === T21)?.conservation_state };
  // save and reopen
  const text = await D(() => window.__EM_DRAG__.docJson());
  await D(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(text), SV_V4]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  out.reopened = (await D((id) => window.__EM_DRAG__.epochInstances(id), T21)).map((r) => [r.name, r.conservation_state, r.placements.length]);
  await ctx.close();
  const m = out.marks ?? [];
  const chainMark = m.find((x) => x.kind === "chain");
  const pass = out.rows0.length === 1 && out.rows0[0].ep === "II A.D." && /own geometry/.test(out.rows0[0].pos ?? "") && out.drawn0 === "mesh"
    && out.form.epochs.find((e) => e[0] === "II A.D.")?.[1] === true && out.form.types[0] === "SF" && out.form.atCursor === true
    && out.steps === 1 && out.chain.length === 2 && out.chain[0].name === "T21" && out.chain[1].type === "SF" && out.chain[1].state === "fragmentary, found in the collapse"
    && JSON.stringify(out.chain[1].placements) === JSON.stringify(["representation_model_sf"]) && out.chain[1].geometry_from === "T21"
    && JSON.stringify(out.edges?.first) === JSON.stringify(["XX sec"]) && JSON.stringify(out.edges?.changed) === JSON.stringify(["T21"])
    && out.edges?.rmData?.includes("transform") && !out.edges?.rmData?.some((k) => /url|geometry|checksum|convex|sphere/.test(k)) && JSON.stringify(out.edges?.rmRes) === JSON.stringify(out.edges?.proxyRes) && (out.edges?.rmRes ?? []).length === 1
    && out.rows1.length === 2 && out.rows1[0].ep === "II A.D." && out.rows1[1].ep === "XX sec" && /geometry of T21/.test(out.rows1[1].pos ?? "") && / m · /.test(out.rows1[1].pos ?? "")
    && chainMark?.n === 2 && near(chainMark.vertices[0], out.c21, 0.05) && near(chainMark.vertices[1], cursor, 0.05) && out.svgChain === 2
    && out.after?.epoch === "XX sec" && out.after?.drawn === "mesh" && near(out.after?.centre, cursor, 0.05)
    && out.move?.steps === 1 && near(out.move?.centre, cursor2, 0.05)
    && out.state.steps === 1 && out.state.value === "restored, glued"
    && JSON.stringify(out.reopened.map((r) => r[1])) === JSON.stringify(["restored, glued", "fragmentary, found in the collapse"]) && !errors.length;
  return { pass, detail: { ...out, cursor, cursor2, errors } };
});

// ── MICRO-GEOREF-GRAFO · the GT16 as it is now (EPSG:3844, shift z 0), a COPY
// (`GEOREF_V4`), and a bridge of this tree serving its folder (`GEOREF_BRIDGE`) ──
const GEOREF_V4 = benchFile("GEOREF_V4");
const GEOREF_BRIDGE = process.env.GEOREF_BRIDGE ?? GEO_BRIDGE;
const grOpen = async (doc = null) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  p.on("console", (m) => { if (m.type() === "error" && /NaN|reading 'color'|could not be decoded/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await p.addInitScript(() => { try { if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "en"); sessionStorage.setItem("probe", "1"); } } catch {} });
  await p.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(GEOREF_BRIDGE)}`);
  await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 30000 });
  await p.evaluate(([d, path]) => window.__EM_DRAG__.openAt(d, path), [doc ?? JSON.parse(readFileSync(GEOREF_V4, "utf8")), GEOREF_V4]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 });
  await p.waitForTimeout(800);
  return { p, ctx, errors };
};
const grSpace = async (p) => {
  await workspace(p, "space");
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 120000 });
  await p.waitForTimeout(800);
};
/** the camera's roll (deg: its right vector's height) and the angle on screen of
 *  the scene's vertical through the pivot (deg from the screen's up) */
const grLevel = (p) => p.evaluate(() => {
  const h = document.querySelector(".scn-host");
  const m = h.__spaceCamMatrix().world;
  const roll = (Math.asin(Math.max(-1, Math.min(1, m[1]))) * 180) / Math.PI;
  const t = h.__spaceCamState().target;
  const d = Math.hypot(...h.__spaceCamState().pos.map((v, i) => v - t[i])) * 0.1 || 1;
  const a = h.__spaceProject(t), b = h.__spaceProject([t[0], t[1] + d, t[2]]);
  const z = a && b ? (Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI : null;
  const g = h.__spaceGizmo?.();
  const zb = g?.balls?.find((x) => x.axis === "z"), c = g?.balls?.find((x) => x.axis === "-z");
  return { roll, zScreen: z, gizmoZ: zb && c ? (Math.atan2(zb.x - c.x, c.y - zb.y) * 180) / Math.PI : null };
});

test("GR1.level", "GEOREF-GRAFO p.0a · l'orbita del Sito resta in bolla: GT16, «Territory», Globe (le sue mani: una presa e un giro con inclinazione) → Pianta → Sito con la barra, poi «Frame all» (Home): il rollio della camera è 0 e la verticale della scena (la Z dei dati) è verticale sullo schermo, anche nel gizmo; 360° di orbita orizzontale (il gizmo trascinato) non lo cambiano; lo stesso dopo Globe (le mani) → Sito diretto", async () => {
  if (!existsSync(GEOREF_V4)) return { pass: false, detail: { missing: GEOREF_V4 } };
  const { p, ctx, errors } = await grOpen();
  await grSpace(p);
  await geoOn(p);
  const out = { steps: [] };
  const go = async (m) => { await p.click(`.scn-bar [data-geo-mode="${m}"]`); await p.waitForTimeout(300); await geoIdle(p, 30000); await p.waitForTimeout(400); };
  const orbit = async () => {
    const nav = await (await p.$(".scn-host .scn-nav-box")).boundingBox();
    const x0 = nav.x + nav.width / 2, y0 = nav.y + nav.height / 2;
    let worst = 0;
    await p.mouse.move(x0, y0);
    await p.mouse.down();
    // 2π at 0.005 rad a pixel: 1257 px, by steps of 60 back and forth on the gizmo
    let x = x0, dir = 1;
    for (let done = 0; done < 1260; done += 30) {
      if (Math.abs(x + dir * 30 - x0) > 40) dir = -dir;
      x += dir * 30;
      await p.mouse.move(x, y0);
      await p.waitForTimeout(16);
      if (dir < 0) continue;
      const l = await grLevel(p);
      worst = Math.max(worst, Math.abs(l.roll), Math.abs(l.zScreen ?? 99));
    }
    await p.mouse.up();
    return worst;
  };
  // the globe's hands, as a person uses them: a grab and a turn with tilt (they write the pose's up)
  const hands = async () => {
    const c = await (await p.$(".scn-host canvas")).boundingBox();
    const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 120, cy + 60, { steps: 8 }); await p.mouse.up();
    await p.waitForTimeout(300);
    await p.mouse.move(cx, cy); await p.mouse.down({ button: "right" }); await p.mouse.move(cx + 140, cy - 70, { steps: 8 }); await p.mouse.up({ button: "right" });
    await p.waitForTimeout(500);
    out.pose = (await geoState(p)).pose;
  };
  await go("globe");
  await hands();
  await go("plan");
  await go("site");
  out.steps.push({ after: "globe(hands)→plan→site", mode: (await geoState(p)).mode, ...(await grLevel(p)) });
  await p.click(".scn-bar [data-frame]");
  await p.waitForTimeout(600);
  out.steps.push({ after: "home", ...(await grLevel(p)) });
  out.orbitWorst = await orbit();
  await go("globe");
  await hands();
  await go("site");
  out.steps.push({ after: "globe(hands)→site", mode: (await geoState(p)).mode, ...(await grLevel(p)) });
  out.orbitWorst2 = await orbit();
  out.errors = errors;
  await ctx.close();
  const lvl = (s) => Math.abs(s.roll) < 0.05 && s.zScreen !== null && Math.abs(s.zScreen) < 0.1 && (s.gizmoZ === null || Math.abs(s.gizmoZ) < 1);
  const pass = out.steps.length === 3 && out.steps.every(lvl) && out.steps[0].mode === "site" && out.steps[2].mode === "site"
    && out.orbitWorst < 0.1 && out.orbitWorst2 < 0.1 && !errors.length;
  return { pass, detail: out };
});

test("GR2.clip", "GEOREF-GRAFO p.0b · il terreno non copre il rilievo: GT16 (EPSG:3844, shift z 0), «Territory», modo Sito — il terreno globale si ritaglia sull'impronta dei modelli più 10 m (i quattro piani su ogni materiale delle tessere), il GT16 si posa sul terreno senza sommare z (il terreno sopra il rilievo di pochi decimetri, misurato su una griglia sotto il tileset del rilievo); «Ritaglia il terreno sotto il sito» spento lo ridà intero, il margine a 25 m allarga il ritaglio di 15 m per lato, la scelta resta nelle preferenze locali (non nell'em.json); in Pianta il terreno è intero", async () => {
  if (!existsSync(GEOREF_V4)) return { pass: false, detail: { missing: GEOREF_V4 } };
  const { p, ctx, errors } = await grOpen();
  await grSpace(p);
  await geoOn(p);
  const H = (f, a) => p.evaluate(f, a);
  const st = () => H(() => document.querySelector(".scn-host").__geo());
  // the tiles refined at the site
  for (let i = 0, quiet = 0; i < 240 && quiet < 6; i++) {
    await p.waitForTimeout(500);
    const g = await st();
    quiet = g.tiles.downloading === 0 && g.tiles.parsing === 0 && g.terrainAsked > 0 ? quiet + 1 : 0;
  }
  const out = { height: (await st()).height, content: await H(() => document.querySelector(".scn-host").__geoContent()), on: (await st()).clip };
  // the terrain against the survey, on a grid under its tileset
  const box = await H(() => document.querySelector(".scn-host").__spaceBoxOf("rmgroup_Survey2015"));
  const ds = [];
  for (let i = 0; i <= 8 && box; i++) for (let j = 0; j <= 8; j++) {
    const x = box[0] + ((box[3] - box[0]) * i) / 8, z = box[2] + ((box[5] - box[2]) * j) / 8;
    const r = await H(([x, z]) => { const h = document.querySelector(".scn-host"); return { t: h.__geoGround(x, z), s: h.__spaceDown(x, z, "Survey2015") }; }, [x, z]);
    if (r.t !== null && r.s) ds.push(r.t - r.s.y);
  }
  ds.sort((a, b) => a - b);
  out.terrainOverSurvey = ds.length ? { n: ds.length, median: ds[Math.floor(ds.length / 2)], min: ds[0], max: ds[ds.length - 1] } : null;
  await p.click('.scn-bar [data-geo="panel"]');
  await p.waitForTimeout(300);
  out.panelOn = await H(() => document.querySelector(".geo-panel .geo-clip")?.textContent ?? "");
  await p.click('.geo-panel [data-geo-act="clip"]');
  await p.waitForTimeout(800);
  out.off = (await st()).clip;
  await p.click('.geo-panel [data-geo-act="clip"]');
  await p.fill('.geo-panel [data-geo-act="clip-margin"]', "25");
  await p.press('.geo-panel [data-geo-act="clip-margin"]', "Enter");
  await p.waitForTimeout(800);
  out.m25 = (await st()).clip;
  out.saved = await H(() => Object.entries(localStorage).filter(([k]) => k.startsWith("emstudio.geo.")).map(([, v]) => { const j = JSON.parse(v); return [j.clip, j.clipMargin]; }));
  out.docSays = await H(() => /clipMargin/.test(window.__EM_DRAG__.docJson()));
  await p.click('.scn-bar [data-geo-mode="plan"]');
  await p.waitForTimeout(300); await geoIdle(p, 30000); await p.waitForTimeout(500);
  out.plan = (await st()).clip;
  out.errors = errors;
  await ctx.close();
  const c = out.content;
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const b10 = out.on.box, b25 = out.m25.box;
  const pass = out.height?.h === 0 && out.height?.shiftZ === 0
    && !!c && !!b10 && near(b10[0], c[0][0] - 10) && near(b10[1], c[0][2] - 10) && near(b10[2], c[1][0] + 10) && near(b10[3], c[1][2] + 10) && out.on.materials > 0
    && /cut: \d+ × \d+ m/.test(out.panelOn)
    && out.off.on === false && out.off.box === null && out.off.materials === 0
    && !!b25 && near(b25[0], b10[0] - 15) && near(b25[3], b10[3] + 15) && out.m25.materials > 0
    && JSON.stringify(out.saved) === JSON.stringify([[true, 25]]) && out.docSays === false
    && out.plan.box === null && out.plan.materials === 0
    && !!out.terrainOverSurvey && out.terrainOverSurvey.n >= 20 && Math.abs(out.terrainOverSurvey.median) < 2 && !errors.length;
  return { pass, detail: out };
});

test("GR3.node", "GEOREF-GRAFO p.1 · il georiferimento è un nodo esposto del grafo: il GT16 (geo_TempluMare_v2, 0 archi su disco) all'apertura entra nel gruppo «Graph paradata» con un is_in_paradata_nodegroup — una correzione detta UNA volta nel Log, un passo che Ctrl+Z toglie, il file segnato come modificato; si vede nel Grafo e nella vista «Graphs paradata» accanto a licenza e autore; salvato e riaperto, l'arco c'è una volta e nessuna correzione è ridetta; i valori (EPSG:3844 327372.56 448682.65 0) non cambiano", async () => {
  if (!existsSync(GEOREF_V4)) return { pass: false, detail: { missing: GEOREF_V4 } };
  const GEO = "geo_TempluMare_v2";
  // the premise, made here (MICRO-SUITE-VERDE): a GT16 saved BEFORE GEOREF-GRAFO,
  // whose geo node is in no paradata group on disk — E.D.'s em.json has had the
  // edge since he saved it (24 Oct), so the copy loses it before opening
  const doc0 = JSON.parse(readFileSync(GEOREF_V4, "utf8"));
  for (const g of Object.values(doc0.graphs ?? {}))
    g.edges = (g.edges ?? []).filter((e) => !(e.edge_type === "is_in_paradata_nodegroup" && e.source === GEO));
  const { p, ctx, errors } = await grOpen(doc0);
  const D = (f, a) => p.evaluate(f, a);
  const geoEdges = () => D((g) => window.__EM_DRAG__.edgesOf("is_in_paradata_nodegroup").filter((e) => e.source === g).map((e) => e.target), GEO);
  const said = () => D(() => { const l = window.__EM_DRAG__.log(); return (Array.isArray(l) ? l : []).filter((x) => /joined the graph's paradata group/.test(x.message ?? "")).length; });
  const out = { edges: await geoEdges(), said: await said(), undo: await D(() => window.__EM_DRAG__.undoDepth()), dirty: await D(() => window.__EM_DRAG__.dirty()),
    data: await D((g) => { const d = window.__EM_DRAG__.node(g)?.data ?? {}; return [d.epsg, d.shift_x, d.shift_y, d.shift_z]; }, GEO) };
  await D(() => window.__EM_DRAG__.setGraphMode("graph"));
  await p.waitForTimeout(1500);
  out.inGraph = await D((g) => window.__EM_SCENE__().nodes.includes(g), GEO);
  await D(() => window.__EM_DRAG__.setGraphMode("graphs"));
  await p.waitForTimeout(1500);
  out.inGraphs = await D((g) => { const ns = window.__EM_SCENE__().nodes.map(String); return { geo: ns.some((n) => n.endsWith(g)), lic: ns.some((n) => n.endsWith("_graph_license")), n: ns.length }; }, GEO);
  await D(() => window.__EM_DRAG__.setGraphMode("graph"));
  await p.waitForTimeout(800);
  const text = await D(() => window.__EM_DRAG__.docJson());
  await D(() => window.__EM_DRAG__.undo());
  await p.waitForTimeout(400);
  out.afterUndo = await geoEdges();
  // saved (the text before the undo) and reopened
  await D(([d, path]) => window.__EM_DRAG__.openAt(d, path), [JSON.parse(text), GEOREF_V4]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  out.reopened = { edges: await geoEdges(), said: await said(), data: await D((g) => { const d = window.__EM_DRAG__.node(g)?.data ?? {}; return [d.epsg, d.shift_x, d.shift_y, d.shift_z]; }, GEO) };
  out.errors = errors;
  await ctx.close();
  const PD = "6af9866e-96a9-5c99-a6b1-78524ae2e2c2_graph_paradata";
  const V = JSON.stringify([3844, 327372.56, 448682.65, 0]);
  const pass = JSON.stringify(out.edges) === JSON.stringify([PD]) && out.said === 1 && out.undo === 1 && out.dirty === true && JSON.stringify(out.data) === V
    && out.inGraph && out.inGraphs.geo && out.inGraphs.lic && out.afterUndo.length === 0
    && JSON.stringify(out.reopened.edges) === JSON.stringify([PD]) && out.reopened.said === 1 && JSON.stringify(out.reopened.data) === V && !errors.length;
  return { pass, detail: out };
});

test("GR4.inspector", "GEOREF-GRAFO p.2 · la sezione «Georeferencing» nell'Inspector del grafo: il GT16 con l'EPSG di prima (31700) — all'apertura la proposta «Convert to EPSG:3844» UNA volta nel Log e nella vista Avvisi, col motivo e l'accuratezza prima/dopo (sconosciuta → 3 m), mai una sostituzione silenziosa; nella sezione il nome del sistema letto da PROJ, «deprecated», il sostituto della stessa griglia; un clic converte (solo il codice, lo shift resta) in un passo che Ctrl+Z toglie; shift Z ≠ 0 mostrato come scelta esplicita; le quote ortometriche/ellissoidiche scritte nel nodo; «Export shift.txt» scrive EPSG::NNNN X Y Z; «Import shift.txt» di un file senza z dà z 0; un grafo senza georiferimento: nessun nodo, «Georeference…» lo crea nel gruppo dei paradati", async () => {
  if (!existsSync(GEOREF_V4)) return { pass: false, detail: { missing: GEOREF_V4 } };
  const f = JSON.parse(readFileSync(GEOREF_V4, "utf8"));
  const gid = Object.keys(f.graphs).find((k) => (f.graphs[k].nodes ?? []).length > 100);
  const geo = f.graphs[gid].nodes.find((n) => n.node_type === "geo_position");
  geo.data = { ...geo.data, epsg: 31700 };
  const { p, ctx, errors } = await grOpen(f);
  const D = (fn, a) => p.evaluate(fn, a);
  const GEO = "geo_TempluMare_v2", ROOT = `${gid}_graphroot`;
  const node = () => D((g) => { const d = window.__EM_DRAG__.node(g)?.data ?? {}; return [d.epsg, d.shift_x, d.shift_y, d.shift_z, d.vertical_reference ?? null]; }, GEO);
  const logs = (re) => D((s) => window.__EM_DRAG__.log().filter((x) => new RegExp(s).test(x.message ?? "")).map((x) => x.message), re);
  const sec = (sel) => D((s) => { const e = document.querySelector(`[data-section="georef"] ${s}`); return e ? (e.dataset.to ?? e.dataset.accuracy ?? e.textContent) : null; }, sel);
  const out = {};
  await p.waitForFunction(() => window.__EM_DRAG__.log().some((x) => /Convert to EPSG:3844/.test(x.message ?? "")), null, { timeout: 30000 }).catch(() => null);
  out.proposed = await logs("Convert to EPSG:3844");
  out.issue = await D(() => (window.__EM_DRAG__.issues?.() ?? []).filter((i) => /EPSG:3844/.test(i.txt ?? "")).map((i) => [i.rule, i.sev, i.fix?.label ?? null]));
  await D((r) => window.__EM_DRAG__.select(r), ROOT);
  await p.waitForSelector('[data-section="georef"] [data-georef="convert"]', { timeout: 20000 }).catch(() => null);
  out.before = { crs: await sec('[data-georef="crs"]'), acc: await sec('[data-georef="accuracy"]'), warn: await sec('[data-georef="warn-deprecated"]'), to: await sec('[data-georef="convert"]'), node: await node() };
  const u0 = await D(() => window.__EM_DRAG__.undoDepth());
  await p.click('[data-section="georef"] [data-georef="convert"]');
  await p.waitForFunction((g) => window.__EM_DRAG__.node(g)?.data?.epsg === 3844, GEO, { timeout: 10000 }).catch(() => null);
  // the section reads the new CRS in PROJ's database through the bridge: under
  // the whole suite's load that took more than the fixed 2.5 s («Reading the
  // CRS…» read as the answer; MICRO-SUITE-VERDE) — read when it has answered
  await p.waitForFunction(() => { const e = document.querySelector('[data-section="georef"] [data-georef="crs"]');
    return !!e && !/Reading the CRS|Leggo il CRS/.test(e.textContent ?? ""); }, null, { timeout: 30000 }).catch(() => null);
  await p.waitForTimeout(500);
  out.after = { node: await node(), steps: (await D(() => window.__EM_DRAG__.undoDepth())) - u0, said: await logs("EPSG:31700 → EPSG:3844, the same grid"),
    crs: await sec('[data-georef="crs"]'), acc: await sec('[data-georef="accuracy"]'), warn: await sec(".georef-warn") };
  await D(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(500);
  out.undone = await node();
  await D(() => window.__EM_DRAG__.redo()); await p.waitForTimeout(800);
  // an explicit z
  await p.fill('[data-section="georef"] [data-georef-field="shift_z"]', "12.5");
  await p.press('[data-section="georef"] [data-georef-field="shift_z"]', "Enter"); await p.waitForTimeout(600);
  out.z = { node: await node(), choice: await sec('[data-georef="z-choice"]') };
  await D(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(600);
  out.zBack = { node: await node(), choice: await sec('[data-georef="z-choice"]') };
  // the vertical reference
  await p.selectOption('[data-section="georef"] [data-georef-field="vertical_reference"]', "ellipsoidal"); await p.waitForTimeout(600);
  out.vert = (await node())[4];
  await p.selectOption('[data-section="georef"] [data-georef-field="vertical_reference"]', "orthometric"); await p.waitForTimeout(600);
  out.vertBack = (await node())[4];
  // export
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }).catch(() => null), p.click('[data-section="georef"] [data-georef="export"]')]);
  out.exported = dl ? [dl.suggestedFilename(), readFileSync(await dl.path(), "utf8")] : null;
  // import a SHIFT.txt without z
  const txt = "/tmp/georef-gr4-shift-noz.txt";
  writeFileSync(txt, "EPSG::31700 327300 448370\n");
  const [fc] = await Promise.all([p.waitForEvent("filechooser", { timeout: 10000 }).catch(() => null), p.click('[data-section="georef"] [data-georef="import"]')]);
  if (fc) await fc.setFiles(txt);
  await p.waitForFunction((g) => window.__EM_DRAG__.node(g)?.data?.shift_x === 327300, GEO, { timeout: 15000 }).catch(() => null);
  out.imported = await node();
  await p.waitForFunction(() => window.__EM_DRAG__.log().filter((x) => /Convert to EPSG:3844/.test(x.message ?? "")).length >= 2, null, { timeout: 30000 }).catch(() => null);
  out.proposedAgain = (await logs("Convert to EPSG:3844")).length;
  await p.screenshot({ path: SHOT("gr4-inspector") }).catch(() => {});
  await ctx.close();
  // a graph without a georeference
  const g2 = JSON.parse(readFileSync(GEOREF_V4, "utf8"));
  g2.graphs[gid].nodes = g2.graphs[gid].nodes.filter((n) => n.node_type !== "geo_position");
  const o2 = await grOpen(g2);
  const D2 = (fn, a) => o2.p.evaluate(fn, a);
  out.bare = { geo: await D2(() => window.__EM_DRAG__.idsOfType("geo_position")) };
  await D2((r) => window.__EM_DRAG__.select(r), ROOT);
  await o2.p.waitForSelector('[data-section="georef"] [data-georef="create"]', { timeout: 10000 }).catch(() => null);
  const u1 = await D2(() => window.__EM_DRAG__.undoDepth());
  await o2.p.click('[data-section="georef"] [data-georef="create"]').catch(() => null);
  await o2.p.waitForTimeout(800);
  const made = await D2(() => window.__EM_DRAG__.idsOfType("geo_position"));
  out.bare.made = made;
  out.bare.steps = (await D2(() => window.__EM_DRAG__.undoDepth())) - u1;
  out.bare.edge = await D2((g) => window.__EM_DRAG__.edgesOf("is_in_paradata_nodegroup").filter((e) => e.source === g).map((e) => e.target), made[0]);
  out.bare.fields = await D2(() => [...document.querySelectorAll('[data-section="georef"] [data-georef-field]')].map((e) => e.dataset.georefField));
  await D2(() => window.__EM_DRAG__.undo()); await o2.p.waitForTimeout(400);
  out.bare.undone = await D2(() => window.__EM_DRAG__.idsOfType("geo_position"));
  out.errors = [...errors, ...o2.errors];
  await o2.ctx.close();
  const PD = `${gid}_graph_paradata`;
  const pass = out.proposed.length === 1 && /unknown → ±3 m/.test(out.proposed[0]) && out.issue.length === 1 && out.issue[0][2] === "Convert to EPSG:3844"
    && /Dealul Piscului 1970/.test(out.before.crs ?? "") && out.before.acc === "unknown" && !!out.before.warn && out.before.to === "3844"
    && JSON.stringify(out.before.node.slice(0, 4)) === JSON.stringify([31700, 327372.56, 448682.65, 0])
    && JSON.stringify(out.after.node.slice(0, 4)) === JSON.stringify([3844, 327372.56, 448682.65, 0]) && out.after.steps === 1 && out.after.said.length === 1
    && /Pulkovo 1942\(58\) \/ Stereo70/.test(out.after.crs ?? "") && out.after.acc === "3" && out.after.warn === null
    && out.undone[0] === 31700
    && out.z.node[3] === 12.5 && /explicit choice/.test(out.z.choice ?? "") && out.zBack.node[3] === 0 && out.zBack.choice === null
    && out.vert === "ellipsoidal" && out.vertBack === null
    && out.exported?.[0] === "SHIFT.txt" && out.exported?.[1] === "EPSG::3844 327372.56 448682.65 0\n"
    && JSON.stringify(out.imported.slice(0, 4)) === JSON.stringify([31700, 327300, 448370, 0]) && out.proposedAgain >= 2
    && out.bare.geo.length === 0 && out.bare.made.length === 1 && out.bare.steps === 1 && JSON.stringify(out.bare.edge) === JSON.stringify([PD])
    && out.bare.fields.includes("epsg") && out.bare.undone.length === 0 && !out.errors.length;
  return { pass, detail: out };
});

test("GR5.pin", "GEOREF-GRAFO p.3 · il segnaposto del sito propone il centro dei modelli: GT16 (EPSG:3844), lo Spazio disegna i modelli; nell'Inspector del grafo «Site position (map)» non è posato e sotto c'è la proposta — il centro dell'ingombro dei modelli, posato col georiferimento (ruotato, più lo shift, a WGS 84 dal bridge), a pochi metri dallo shift (le coordinate dei modelli sono quelle del sistema meno lo shift: la stessa distanza misurata contro l'ancora posata dal bridge); «Move…» apre il selettore con la proposta come candidato e non scrive nulla; «Use this» la scrive (site_position, un passo), poi la proposta tace", async () => {
  if (!existsSync(GEOREF_V4)) return { pass: false, detail: { missing: GEOREF_V4 } };
  const { p, ctx, errors } = await grOpen();
  await grSpace(p);
  await p.waitForTimeout(3000);
  const D = (fn, a) => p.evaluate(fn, a);
  const f = JSON.parse(readFileSync(GEOREF_V4, "utf8"));
  const gid = Object.keys(f.graphs).find((k) => (f.graphs[k].nodes ?? []).length > 100);
  const ROOT = `${gid}_graphroot`;
  const out = {};
  await D((r) => window.__EM_DRAG__.select(r), ROOT);
  await p.waitForSelector('[data-georef="pin"] [data-georef="pin-use"]', { timeout: 30000 }).catch(() => null);
  out.pin = await D(() => { const e = document.querySelector('[data-georef="pin"]'); return e ? { lat: Number(e.dataset.lat), lon: Number(e.dataset.lon), d: Number(e.dataset.fromShift), text: e.textContent } : null; });
  out.site0 = await D((r) => window.__EM_DRAG__.node(r)?.data?.site_position ?? null, ROOT);
  const u0 = await D(() => window.__EM_DRAG__.undoDepth());
  await p.click('[data-georef="pin"] [data-georef="pin-move"]').catch(() => null);
  await p.waitForTimeout(800);
  out.picker = await D(() => { const m = document.querySelector(".site-picker"); return m ? { lat: m.querySelector('[data-field="lat"]')?.value, lon: m.querySelector('[data-field="lon"]')?.value } : null; });
  await p.click('.site-picker [data-action="cancel"]').catch(() => null);
  await p.waitForTimeout(300);
  out.afterMove = { steps: (await D(() => window.__EM_DRAG__.undoDepth())) - u0, site: await D((r) => window.__EM_DRAG__.node(r)?.data?.site_position ?? null, ROOT) };
  await p.click('[data-georef="pin"] [data-georef="pin-use"]').catch(() => null);
  await p.waitForTimeout(800);
  out.used = { steps: (await D(() => window.__EM_DRAG__.undoDepth())) - u0, site: await D((r) => window.__EM_DRAG__.node(r)?.data?.site_position ?? null, ROOT),
    still: await D(() => !!document.querySelector('[data-georef="pin"]')) };
  out.errors = errors;
  await ctx.close();
  // the same distance read another way: the pin against the shift as the bridge places it (/geo/frame, PROJ)
  const geo = f.graphs[gid].nodes.find((n) => n.node_type === "geo_position").data;
  const fr = await (await fetch(`${GEOREF_BRIDGE}/geo/frame`, { method: "POST", headers: { origin: `http://localhost:${PORT}`, "content-type": "application/json" },
    body: JSON.stringify({ epsg: geo.epsg, x: geo.shift_x, y: geo.shift_y, z: 0, rotation: geo.rotation ?? 0 }) })).json();
  const R = 6371000, r = Math.PI / 180;
  const far = out.pin && fr?.ok ? R * Math.hypot((out.pin.lat - fr.lat) * r, (out.pin.lon - fr.lon) * r * Math.cos(fr.lat * r)) : null;
  out.anchor = fr?.ok ? [fr.lat, fr.lon] : fr;
  out.fromAnchor = far;
  const pass = !!out.pin && /the box of the models/.test(out.pin.text) && out.pin.d < 50 && far !== null && Math.abs(far - out.pin.d) < 0.5 && out.site0 === null
    && Math.abs(Number(out.picker?.lat) - +out.pin.lat.toFixed(6)) < 1e-9 && Math.abs(Number(out.picker?.lon) - +out.pin.lon.toFixed(6)) < 1e-9
    && out.afterMove.steps === 0 && out.afterMove.site === null
    && out.used.steps === 1 && Math.abs(out.used.site?.lat - out.pin.lat) < 1e-6 && Math.abs(out.used.site?.lon - out.pin.lon) < 1e-6 && out.used.site?.crs === "EPSG:4326"
    && out.used.still === false && !errors.length;
  return { pass, detail: out };
});

test("GR6.follow", "GEOREF-GRAFO · una sola fonte: il globo acceso sul GT16 con l'EPSG di prima (31700, il ballpark) si ricolloca da sé quando il nodo cambia — «Convert to EPSG:3844» dall'Inspector del grafo e l'ancora del globo diventa quella di 3844 (Pulkovo 1942(58) to WGS 84 (19)), circa 127 m più in là, senza spegnere e riaccendere «Territory»", async () => {
  if (!existsSync(GEOREF_V4)) return { pass: false, detail: { missing: GEOREF_V4 } };
  const f = JSON.parse(readFileSync(GEOREF_V4, "utf8"));
  const gid = Object.keys(f.graphs).find((k) => (f.graphs[k].nodes ?? []).length > 100);
  f.graphs[gid].nodes.find((n) => n.node_type === "geo_position").data.epsg = 31700;
  const { p, ctx, errors } = await grOpen(f);
  await grSpace(p);
  await geoOn(p);
  const D = (fn, a) => p.evaluate(fn, a);
  const anchor = () => D(() => document.querySelector(".scn-host").__geoSpace().anchor);
  const out = { before: await anchor() };
  await D((r) => window.__EM_DRAG__.select(r), `${gid}_graphroot`);
  await p.waitForSelector('[data-section="georef"] [data-georef="convert"]', { timeout: 30000 }).catch(() => null);
  await p.click('[data-section="georef"] [data-georef="convert"]').catch(() => null);
  await p.waitForFunction(() => document.querySelector(".scn-host").__geoSpace().anchor?.epsg === 3844, null, { timeout: 30000 }).catch(() => null);
  await p.waitForFunction(() => document.querySelector(".scn-host")?.__geo?.()?.ready, null, { timeout: 30000 }).catch(() => null);
  out.after = await anchor();
  out.on = await D(() => document.querySelector(".scn-host").__geoSpace().on);
  const R = 6371000, r = Math.PI / 180;
  out.moved = out.before && out.after ? R * Math.hypot((out.after.lat - out.before.lat) * r, (out.after.lon - out.before.lon) * r * Math.cos(out.before.lat * r)) : null;
  out.errors = errors;
  await ctx.close();
  const pass = out.before?.epsg === 31700 && out.after?.epsg === 3844 && out.on === true && out.moved !== null && Math.abs(out.moved - 127.3) < 2 && !errors.length;
  return { pass, detail: out };
});

// ── MICRO-FILTRI-DETTAGLIATI · the «Detail level» by families ──────────────
async function fdPanel(p) {
  return p.evaluate(() => [...document.querySelectorAll("#filter-panel .fp-fam")].map((f) => {
    const cb = f.querySelector("[data-fam-cb]");
    return { fam: f.dataset.fam, hidden: f.classList.contains("hidden"), count: f.querySelector(".fp-famrow .fp-count")?.textContent,
      on: cb.checked, ind: cb.indeterminate, rows: [...f.querySelectorAll(".fp-type:not(.hidden)")].map((r) => r.dataset.leaf) };
  }));
}
test("FD1.panel", "FILTRI-DETTAGLIATI · il livello di dettaglio a due livelli (famiglia → tipi): famiglie dal datamodel, cronologia relativa separata dalle relazioni stratigrafiche e dalle epoche (CRONO-MULTIPLA: le epoche non sono nel pannello della Matrix, nel Grafo sì con le due sottofamiglie), conteggi visibili/totali che sommano al grafo, ricerca, tutto/niente, «Solo stratigrafia» e «Solo cronologia relativa», scelte per vista salvate, Monochrome nella Matrix", async () => {
  const { p, ctx, errors } = await open({ doc: "TempluMare", locale: "en" });
  const D = (f, a) => p.evaluate(f, a);
  const r = {};
  r.doc = await D(() => { const d = JSON.parse(window.__EM_DRAG__.docJson()); const g = d.graph ?? d.graphs[d.active_graph_id]; return [g.nodes.length, g.edges.length,
    g.edges.filter((e) => ["has_first_epoch", "survive_in_epoch", "has_sub_epoch"].includes(e.edge_type)).length]; });
  const isAfter = () => D(() => window.__EM_SCENE__().edges.filter((e) => e.type === "is_after").length);
  r.isAfter0 = await isAfter();
  await p.click("#btn-view-props"); await p.waitForTimeout(300);
  const f0 = await fdPanel(p);
  r.fams = [f0.filter((x) => x.fam.startsWith("n:")).length, f0.filter((x) => x.fam.startsWith("e:")).length];
  const tot = (pre) => f0.filter((x) => x.fam.startsWith(pre)).reduce((a, x) => a + Number(x.count.split("/")[1]), 0);
  r.totals = [tot("n:"), tot("e:")];
  r.strat = f0.find((x) => x.fam === "e:stratigraphic")?.count;
  r.chrono = f0.find((x) => x.fam === "e:chronology")?.count;
  r.epochsInMatrix = f0.some((x) => x.fam === "e:epochs");
  r.chronoTip = await D(() => document.querySelector('#filter-panel .fp-fam[data-fam="e:chronology"] .fp-famrow .fp-name')?.title ?? "");
  // the relative chronology off: the sequence leaves the Matrix, the family says 0/N
  await p.click('#filter-panel [data-fam-cb="e:chronology"]'); await p.waitForTimeout(600);
  r.isAfterOff = await isAfter();
  r.stratOff = (await fdPanel(p)).find((x) => x.fam === "e:chronology");
  r.saved = await D(() => JSON.parse(localStorage.getItem("emstudio.detailLeaves") ?? "{}").matrix?.off ?? []);
  // «all» brings it back
  await p.click('#filter-panel [data-fam-all="e:chronology"]'); await p.waitForTimeout(600);
  r.isAfterBack = await isAfter();
  // one type only: a leaf off makes the family indeterminate
  await p.click('#filter-panel .fp-exp[data-fam-exp="e:chronology"]'); await p.waitForTimeout(150);
  await p.click('#filter-panel [data-leaf-cb="e:is_after"]'); await p.waitForTimeout(600);
  r.leafOff = { isAfter: await isAfter(), fam: (await fdPanel(p)).find((x) => x.fam === "e:chronology") };
  await p.click('#filter-panel [data-leaf-cb="e:is_after"]'); await p.waitForTimeout(600);
  // the search: «cuts» shows the one family and the one type
  await p.fill('#filter-panel [data-fp="search"]', "cuts"); await p.waitForTimeout(150);
  r.search = (await fdPanel(p)).filter((x) => !x.hidden).map((x) => [x.fam, x.rows]);
  await p.fill('#filter-panel [data-fp="search"]', ""); await p.waitForTimeout(150);
  // the templates
  await p.selectOption('#filter-panel [data-fp="template"]', "strat-only"); await p.waitForTimeout(600);
  const so = await fdPanel(p);
  r.stratOnly = { sel: await D(() => document.querySelector('#filter-panel [data-fp="template"]').value),
    strat: so.find((x) => x.fam === "e:stratigraphic").on, temporal: so.find((x) => x.fam === "e:chronology").on || so.find((x) => x.fam === "e:chronology").ind,
    paradata: so.find((x) => x.fam === "n:properties").on, isAfter: await isAfter() };
  await p.selectOption('#filter-panel [data-fp="template"]', "chrono-only"); await p.waitForTimeout(600);
  const co = await fdPanel(p);
  r.chronoOnly = { sel: await D(() => document.querySelector('#filter-panel [data-fp="template"]').value),
    strat: co.find((x) => x.fam === "e:stratigraphic").on || co.find((x) => x.fam === "e:stratigraphic").ind, temporal: co.find((x) => x.fam === "e:chronology").on, isAfter: await isAfter() };
  r.mono = await D(() => [...document.querySelectorAll("#filter-panel .fp-row")].some((x) => /Monochrome/.test(x.textContent)));
  await p.screenshot({ path: SHOT("fd1-matrix-chrono") }).catch(() => {});
  // the Graph keeps its own choice (everything: «Full detail»), the Matrix its own
  await p.keyboard.press("Escape");
  await p.evaluate(() => [...document.querySelectorAll('.tile-area[data-win="canvas:1"] .tile-bar button')].find((b) => b.offsetParent && b.textContent.trim() === "Graph")?.click());
  await p.waitForTimeout(1200);
  await p.click("#btn-view-props"); await p.waitForTimeout(300);
  r.graphSel = await D(() => document.querySelector('#filter-panel [data-fp="template"]').value);
  r.graphMono = await D(() => [...document.querySelectorAll("#filter-panel .fp-row")].some((x) => /Monochrome/.test(x.textContent)));
  // the Graph lists the epochs, with their two sub-families (and the sub-epochs), and every edge
  r.graphEpochs = await D(() => [...document.querySelectorAll('#filter-panel .fp-fam[data-fam="e:epochs"] .fp-subfam')].map((x) => x.dataset.subfam));
  r.graphTotal = (await fdPanel(p)).filter((x) => x.fam.startsWith("e:")).reduce((a, x) => a + Number(x.count.split("/")[1]), 0);
  await p.keyboard.press("Escape");
  await p.evaluate(() => [...document.querySelectorAll('.tile-area[data-win="canvas:1"] .tile-bar button')].find((b) => b.offsetParent && b.textContent.trim() === "Matrix")?.click());
  await p.waitForTimeout(1200);
  await p.click("#btn-view-props"); await p.waitForTimeout(300);
  r.matrixSel = await D(() => document.querySelector('#filter-panel [data-fp="template"]').value);
  await p.screenshot({ path: SHOT("fd1-matrix-back") }).catch(() => {});
  r.errors = errors;
  await ctx.close();
  const pass = r.fams[0] >= 15 && r.fams[1] >= 14 && r.totals[0] === r.doc[0] && r.totals[1] + r.doc[2] === r.doc[1] && r.graphTotal === r.doc[1]
    && !r.epochsInMatrix && /derived|imported/.test(r.chronoTip)
    && JSON.stringify(r.graphEpochs) === '["e:epochs.creation","e:epochs.survival","e:epochs.rest"]'
    && r.isAfter0 > 0 && r.isAfterOff === 0 && /^0\//.test(r.stratOff?.count ?? "") && r.saved.includes("e:is_after") && r.isAfterBack === r.isAfter0
    && r.leafOff.isAfter === 0 && r.leafOff.fam.ind
    && r.search.length === 1 && r.search[0][0] === "e:stratigraphic" && JSON.stringify(r.search[0][1]) === '["e:cuts"]'
    && r.stratOnly.sel === "strat-only" && r.stratOnly.strat && !r.stratOnly.temporal && !r.stratOnly.paradata && r.stratOnly.isAfter === 0
    && r.chronoOnly.sel === "chrono-only" && !r.chronoOnly.strat && r.chronoOnly.temporal && r.chronoOnly.isAfter > 0
    && r.mono && !r.graphMono && r.graphSel === "full" && r.matrixSel === "chrono-only" && !errors.length;
  return { pass, detail: r };
});
// ── MICRO-CRONO-MULTIPLA p.2 · one edit, the whole selection, with ⌘ / Alt ────
test("ME1.multi", "CRONO-MULTIPLA · con più nodi selezionati la modifica va al nodo attivo; tenendo premuto ⌘ (macOS) / Alt va a tutti i selezionati che hanno il campo: 5 documenti, epoca di creazione — il suggerimento «Applica a 5 nodi selezionati · 0 saltati» mentre il tasto è premuto, tutti e 5 nell'epoca, una riga nel Log, un solo annulla li riporta tutti; senza il tasto solo l'attivo; ⌘+Invio su una descrizione la scrive su tre unità", async () => {
  const { p, ctx, errors } = await open({ doc: "TempluMare", locale: "en" });
  const D = (f, a) => p.evaluate(f, a);
  const KEY = await D(() => (/Mac|iPhone|iPad/i.test(navigator.platform) ? "Meta" : "Alt"));
  const r = { key: KEY };
  const g = await D(() => { const d = JSON.parse(window.__EM_DRAG__.docJson()); const g = d.graph ?? d.graphs[d.active_graph_id];
    return { docs: g.nodes.filter((n) => n.node_type === "document").slice(0, 5).map((n) => n.id),
             units: g.nodes.filter((n) => n.node_type === "US").slice(0, 3).map((n) => n.id),
             epochs: g.nodes.filter((n) => n.node_type === "EpochNode").map((n) => n.id) }; });
  const epochOf = () => D((ids) => { const d = JSON.parse(window.__EM_DRAG__.docJson()); const gg = d.graph ?? d.graphs[d.active_graph_id];
    return ids.map((id) => gg.edges.filter((e) => e.source === id && e.edge_type === "has_first_epoch").map((e) => e.target).join(",")); }, g.docs);
  r.before = await epochOf();
  const active = g.docs[g.docs.length - 1];
  r.target = g.epochs.find((e) => !r.before.includes(e)) ?? g.epochs[0];
  const sel = `select[data-doc-epoch="${active}"]`;
  // without the key: the active document only
  await D((ids) => window.__EM_DRAG__.selectMany(ids), g.docs); await p.waitForTimeout(500);
  await p.waitForSelector(sel, { timeout: 5000 });
  r.hintHidden = await D(() => [...document.querySelectorAll(".multi-hint")].every((h) => !h.offsetParent));
  await p.selectOption(sel, r.target); await p.waitForTimeout(500);
  r.plain = await epochOf();
  await D(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(400);
  r.plainUndone = await epochOf();
  // with the key: the hint while it is held, then all five
  await D((ids) => window.__EM_DRAG__.selectMany(ids), g.docs); await p.waitForTimeout(500);
  await p.waitForSelector(sel, { timeout: 5000 });
  await p.keyboard.down(KEY); await p.waitForTimeout(150);
  r.hint = await D(() => [...document.querySelectorAll(".multi-hint")].filter((h) => h.offsetParent).map((h) => h.textContent));
  await p.screenshot({ path: SHOT("me1-hint") }).catch(() => {});
  const logN = await D(() => window.__EM_DRAG__.log().length);
  await p.selectOption(sel, r.target); await p.waitForTimeout(500);
  await p.keyboard.up(KEY); await p.waitForTimeout(150);
  r.multi = await epochOf();
  r.hintAfterUp = await D(() => [...document.querySelectorAll(".multi-hint")].filter((h) => h.offsetParent).length);
  r.log = await D((n) => window.__EM_DRAG__.log().slice(n).map((e) => e.message), logN);
  r.selKept = await D(() => window.__EM_DRAG__.selected().length);
  await D(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(400);
  r.undone = await epochOf();
  // ⌘/Alt+Enter on a description: three units
  await D((ids) => window.__EM_DRAG__.selectMany(ids), g.units); await p.waitForTimeout(500);
  await p.click(".insp-desc-input"); await p.fill(".insp-desc-input", "ME1 · same description");
  await p.keyboard.down(KEY); await p.keyboard.press("Enter"); await p.keyboard.up(KEY); await p.waitForTimeout(500);
  r.desc = await D((ids) => { const d = JSON.parse(window.__EM_DRAG__.docJson()); const gg = d.graph ?? d.graphs[d.active_graph_id];
    return ids.map((id) => gg.nodes.find((n) => n.id === id)?.description); }, g.units);
  r.errors = errors;
  await ctx.close();
  const all = (xs, v) => xs.every((x) => x === v);
  const pass = r.hintHidden
    && r.plain[4] === r.target && JSON.stringify(r.plain.slice(0, 4)) === JSON.stringify(r.before.slice(0, 4))
    && JSON.stringify(r.plainUndone) === JSON.stringify(r.before)
    && r.hint.some((x) => /Apply to 5 selected nodes · 0 skipped/.test(x))
    && all(r.multi, r.target) && r.hintAfterUp === 0
    && r.log.some((m) => /«Epoch of creation» applied to 5 selected nodes/.test(m)) && r.selKept === 5
    && JSON.stringify(r.undone) === JSON.stringify(r.before)
    && all(r.desc, "ME1 · same description") && !errors.length;
  return { pass, detail: r };
});
test("ME2.table", "CRONO-MULTIPLA · nel Tabular (Unità) la scelta della prima epoca con ⌘ / Alt premuto va a tutte le unità selezionate (righe del foglio), un solo annulla; senza il tasto solo la riga modificata; la colonna ID non si propaga", async () => {
  const { p, ctx, errors } = await open({ doc: "spazio" });
  const D = (f, a) => p.evaluate(f, a);
  const KEY = await D(() => (/Mac|iPhone|iPad/i.test(navigator.platform) ? "Meta" : "Alt"));
  await sheetMenu(p);
  await p.locator('.dd-menu:not(.hidden) button[data-sheet="Units"]').first().click();
  await p.waitForTimeout(600);
  const rows = await D(() => [...document.querySelectorAll('.tile-tablebody select[data-col="EPOCH"]')].map((x) => x.dataset.row).slice(0, 3));
  const ep = (ids) => D((xs) => xs.map((id) => window.__EM_DRAG__.nodeInfo(id).edges.filter((e) => e.type === "has_first_epoch").map((e) => e.target).join(",")), ids);
  const r = { rows, before: await ep(rows) };
  const active = rows[0];
  await D((ids) => window.__EM_DRAG__.selectMany([...ids.slice(1), ids[0]]), rows); await p.waitForTimeout(500);
  const sel = `.tile-tablebody select[data-col="EPOCH"][data-row="${active}"]`;
  r.choice = await D((s) => [...document.querySelector(s).options].map((o) => o.value).find((v) => v && v !== document.querySelector(s).value), sel);
  await p.selectOption(sel, r.choice); await p.waitForTimeout(500);
  r.plain = await ep(rows);
  await D(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(400);
  await D((ids) => window.__EM_DRAG__.selectMany([...ids.slice(1), ids[0]]), rows); await p.waitForTimeout(500);
  await p.keyboard.down(KEY); await p.waitForTimeout(120);
  r.hint = await D(() => [...document.querySelectorAll(".tile-tablebody .multi-hint")].filter((h) => h.offsetParent).map((h) => h.textContent));
  await p.selectOption(sel, r.choice); await p.waitForTimeout(500);
  await p.keyboard.up(KEY);
  r.multi = await ep(rows);
  await D(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(400);
  r.undone = await ep(rows);
  r.idCell = await D(() => !!document.querySelector('.tile-tablebody input[data-col="ID"][data-multi-field]'));
  r.errors = errors;
  await ctx.close();
  const pass = rows.length === 3 && r.plain[0] === r.choice && r.plain.slice(1).join("|") === r.before.slice(1).join("|")
    && r.hint.some((x) => /(Apply to|Applica a) 3 (selected nodes|nodi selezionati) · 0 (skipped|saltati)/.test(x)) && r.multi.every((x) => x === r.choice)
    && r.undone.join("|") === r.before.join("|") && !r.idCell && !errors.length;
  return { pass, detail: r };
});
test("FD2.esc", "FILTRI-DETTAGLIATI · Esc chiude il pannello del livello di dettaglio (fuoco nella ricerca, su una casella, sulla tela) e quello degli overlay, e restituisce il fuoco alla vista", async () => {
  const { p, ctx, errors } = await open({ doc: "TempluMare", locale: "en" });
  const D = (f, a) => p.evaluate(f, a);
  const state = () => D(() => ({ filter: !document.getElementById("filter-panel").classList.contains("hidden"),
    overlay: !document.getElementById("overlay-panel")?.classList.contains("hidden"),
    focusIn: !!document.activeElement?.closest?.("#filter-panel, #overlay-panel") }));
  const r = {};
  await p.click("#btn-view-props"); await p.waitForTimeout(300);
  await p.focus('#filter-panel [data-fp="search"]');
  await p.keyboard.type("epo");
  r.searchOpen = await state();
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  r.fromSearch = await state();
  await p.click("#btn-view-props"); await p.waitForTimeout(300);
  await p.focus('#filter-panel [data-fam-cb="n:units_real"]');
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  r.fromCheckbox = await state();
  await p.click("#btn-view-props"); await p.waitForTimeout(300);
  await D(() => document.activeElement?.blur?.());
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  r.fromView = await state();
  await p.click("#btn-overlays"); await p.waitForTimeout(300);
  r.overlayOpen = await state();
  await p.focus("#overlay-panel input");
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  r.overlayFromInput = await state();
  await p.click("#btn-overlays"); await p.waitForTimeout(300);
  await D(() => document.activeElement?.blur?.());
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  r.overlayFromView = await state();
  r.errors = errors;
  await ctx.close();
  const closed = (x) => !x.filter && !x.overlay && !x.focusIn;
  const pass = r.searchOpen.filter && closed(r.fromSearch) && closed(r.fromCheckbox) && closed(r.fromView)
    && r.overlayOpen.overlay && closed(r.overlayFromInput) && closed(r.overlayFromView) && !errors.length;
  return { pass, detail: r };
});

// ── MICRO-TILESET-CARTELLA (25 Oct 2026) · a tileset dropped as it is ──────
// The fixture: `tileset-disco` (44 KB, glb tiles) of the bench, turned into the
// RealityScan form — `disco_rs.json` beside `disco_rs/`, its contents written
// `disco_rs/tiles/…`, the root's transform the Basilica Iulia's (lat 0.0001°,
// lon 10.51°: «written as geocentric») — and zipped as a package.
const TSD_T = [-0.18243234, 0.98321841, 0.0, 0.0, -0.00000197, -0.00000036, 1.0, 0.0,
  0.98321841, 0.18243234, 0.000002, 0.0, 6271103.68898329, 1163587.9280063, 12.30476309, 1.0];
async function tsdBench(tag) {
  const root = FS_ROOT ?? (await rootPath());
  const dir = `${root}/tsdrop-${tag}`;
  execFileSync("rm", ["-rf", dir]);
  mkdirSync(dir, { recursive: true });
  execFileSync("cp", ["-cR", `${root}/tileset-disco`, `${dir}/disco`]);
  execFileSync("cp", ["-cR", `${root}/tileset-disco/tiles`, `${dir}/disco_rs`]);
  execFileSync("mkdir", ["-p", `${dir}/disco_rs_tmp`]);
  execFileSync("mv", [`${dir}/disco_rs`, `${dir}/disco_rs_tmp/tiles`]);
  execFileSync("mv", [`${dir}/disco_rs_tmp`, `${dir}/disco_rs`]);
  const doc = JSON.parse(readFileSync(`${root}/tileset-disco/tileset.json`, "utf8"));
  const walk = (t) => { if (t.content?.uri) t.content.uri = `disco_rs/${t.content.uri}`; for (const c of t.children ?? []) walk(c); };
  walk(doc.root);
  doc.root.transform = TSD_T;
  writeFileSync(`${dir}/disco_rs.json`, JSON.stringify(doc));
  execFileSync("python3", ["-I", "-c", `import os,sys,zipfile
src,out=sys.argv[1],sys.argv[2]
z=zipfile.ZipFile(out,'w',zipfile.ZIP_STORED)
for d,_,fs in os.walk(src):
  for f in sorted(fs): z.write(os.path.join(d,f),os.path.relpath(os.path.join(d,f),src))
z.close()`, `${dir}/disco`, `${dir}/disco.zip`]);
  return { root, dir };
}
/** a real drop event on a window's area: files of the system, or a Storage path */
const tsdDropFiles = (p, win, files) => p.evaluate(([w, fs]) => {
  const dt = new DataTransfer();
  for (const f of fs) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name));
  const area = document.querySelector(`.tile-area[data-win="${w}"]`);
  const r = area.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  area.dispatchEvent(new DragEvent("dragover", at));
  const ev = new DragEvent("drop", at);
  area.dispatchEvent(ev);
  return ev.defaultPrevented;
}, [win, files]);
const tsdDropPath = (p, win, payload) => p.evaluate(([w, pl]) => {
  const dt = new DataTransfer();
  dt.setData("application/x-em-storage-entry", JSON.stringify(pl));
  const area = document.querySelector(`.tile-area[data-win="${w}"]`);
  const at = { bubbles: true, cancelable: true, dataTransfer: dt };
  area.dispatchEvent(new DragEvent("dragover", at));
  const ev = new DragEvent("drop", at);
  area.dispatchEvent(ev);
  return ev.defaultPrevented;
}, [win, payload]);
const tsdBar = (p, win) => p.evaluate((w) => {
  const b = document.querySelector(`.tile-area[data-win="${w}"] [data-tileset-bar]`);
  if (!b) return null;
  return { id: b.dataset.tilesetBar, form: b.querySelector("[data-form]")?.dataset.form, pos: b.querySelector(".tsp-pos")?.textContent,
    warn: b.querySelector(".tsp-pos")?.dataset.warn === "true", recentred: !!b.querySelector("[data-recentred]"),
    note: b.querySelector("[data-recentred]")?.textContent ?? null,
    attach: { disabled: b.querySelector("[data-tsp-attach]")?.disabled ?? null, title: b.querySelector("[data-tsp-attach]")?.title ?? null },
    pack: b.querySelector("[data-tsp-pack]") ? { disabled: b.querySelector("[data-tsp-pack]").disabled } : null,
    status: b.querySelector(".tsp-status")?.textContent ?? "" };
}, win);
/** the tiles a Viewer's dropped tileset loaded (its `mount3dViewer` host) */
const tsdViewerTiles = (p, win) => p.evaluate((w) => {
  const h = document.querySelector(`.tile-area[data-win="${w}"] .tsp-host`);
  const s = h?.__tiles?.();
  return s ? { files: s.files, loaded: s.status.loaded, visible: s.status.visible, failed: s.status.failed, box: s.box } : null;
}, win);
const tsdWait = async (p, fn, ms = 30000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v || Date.now() - t0 > ms) return v; await p.waitForTimeout(250); } };

test("TD1.viewer", "tileset trascinato · uno zip dal sistema sul Viewer: si vede subito (le tile lette a pezzi dal Blob), la barra dice cos'è; «Attacca all'epoca…» chiede, scrive RM + risorsa nell'epoca, un passo di annulla", async () => {
  const { dir } = await tsdBench("td1");
  const { p, ctx, errors } = await open({ doc: "catena", ws: "provenance" });
  p.on("dialog", (d) => { void d.accept(); });
  const win = await winOf(p, "viewer");
  const prevented = await tsdDropFiles(p, win, [{ name: "disco.zip", b64: readFileSync(`${dir}/disco.zip`).toString("base64") }]);
  const bar = await tsdWait(p, () => tsdBar(p, win));
  const tiles = await tsdWait(p, async () => { const t = await tsdViewerTiles(p, win); return t && t.files.length ? t : null; });
  await p.screenshot({ path: SHOT("td1-viewer-zip") }).catch(() => {});
  const before = await p.evaluate(() => ({ rm: window.__EM_DRAG__.idsOfType("representation_model").length, res: window.__EM_DRAG__.idsOfType("resource").length }));
  const epoch = await p.evaluate((w) => document.querySelector(`.tile-area[data-win="${w}"] [data-tsp-epoch]`)?.value, win);
  await p.click(`.tile-area[data-win="${win}"] [data-tsp-attach]`);
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => {
    const D = window.__EM_DRAG__;
    const rms = D.idsOfType("representation_model").map((id) => D.node(id));
    const rm = rms.find((n) => n?.data?.is_tileset);
    const ep = rm ? D.edgesOf("has_first_epoch").find((e) => e.source === rm.id)?.target : null;
    const link = rm ? D.edgesOf("has_linked_resource").find((e) => e.source === rm.id)?.target : null;
    return { rm: rms.length, res: D.idsOfType("resource").length, url: rm?.data?.url ?? null, ep, res0: link ? D.node(link)?.data ?? null : null };
  });
  const line = await tsdBar(p, win);
  await p.evaluate(() => window.__EM_DRAG__.undo?.());
  await p.waitForTimeout(400);
  const undone = await p.evaluate(() => ({ rm: window.__EM_DRAG__.idsOfType("representation_model").length, res: window.__EM_DRAG__.idsOfType("resource").length }));
  await ctx.close();
  return { pass: prevented && bar?.form === "package" && !bar.warn && !bar.recentred && (tiles?.files ?? []).length >= 1
      && after.rm === before.rm + 1 && after.res === before.res + 1 && after.url === "disco.zip" && after.ep === epoch
      && after.res0?.packaging === "archive" && line?.attach.disabled === true
      && undone.rm === before.rm && undone.res === before.res && !errors.length,
    detail: { prevented, bar, tiles, before, after, undone, errors } };
});

test("TD2.pair", "tileset trascinato · la forma RealityScan (X/ dallo Storage, X.json accanto) sul Viewer: riconosciuta e detta, la posizione avvisa «geocentriche», centrata solo per la vista, le tile si vedono", async () => {
  const { dir } = await tsdBench("td2");
  const { p, ctx, errors } = await open({ doc: "catena", ws: "provenance" });
  const win = await winOf(p, "viewer");
  const prevented = await tsdDropPath(p, win, { path: `${dir}/disco_rs`, type: "dir", name: "disco_rs", ext: "" });
  const bar = await tsdWait(p, () => tsdBar(p, win));
  const tiles = await tsdWait(p, async () => { const t = await tsdViewerTiles(p, win); return t && t.files.length ? t : null; });
  const state = bar ? await p.evaluate((id) => window.__EM_DRAG__.tilesetDropped(id), bar.id) : null;
  await p.screenshot({ path: SHOT("td2-viewer-coppia-realityscan") }).catch(() => {});
  await ctx.close();
  // centred: the root's box (2 × 2 × 0.5 around 2,2,0.5) near the origin, not 6 371 km away
  const near = (tiles?.box ?? []).every((v) => Math.abs(v) < 100);
  return { pass: prevented && bar?.form === "pair" && bar.warn && /geocentric/.test(bar.pos) && bar.recentred
      && bar.attach.disabled === true && bar.pack?.disabled === false && (tiles?.files ?? []).length >= 1 && near
      && state?.disk?.root === `${dir}/disco_rs.json` && Math.abs(state.pos.lon - 10.5115) < 0.001 && !errors.length,
    detail: { prevented, bar, tiles, state, errors } };
});

test("TD3.pack", "tileset trascinato · «Prepara il pacchetto» sulla forma RealityScan: chiede, il bridge scrive disco_rs.3tz ACCANTO (canonico, X.json come tileset.json), gli originali intatti; poi si attacca", async () => {
  const { dir } = await tsdBench("td3");
  const listing = () => execFileSync("find", [dir, "-type", "f"], { encoding: "utf8" }).split("\n").filter(Boolean).sort();
  const before = listing();
  const { p, ctx, errors } = await open({ doc: "catena", ws: "provenance" });
  p.on("dialog", (d) => { void d.accept(); });
  const win = await winOf(p, "viewer");
  await tsdDropPath(p, win, { path: `${dir}/disco_rs.json`, type: "file", name: "disco_rs.json", ext: "json" });
  const bar0 = await tsdWait(p, () => tsdBar(p, win));
  await p.click(`.tile-area[data-win="${win}"] [data-tsp-pack]`);
  const bar1 = await tsdWait(p, async () => { const b = await tsdBar(p, win); return b?.form === "package" ? b : null; }, 30000);
  const after = listing();
  const added = after.filter((f) => !before.includes(f));
  let names = [];
  try { names = execFileSync("unzip", ["-Z1", `${dir}/disco_rs.3tz`], { encoding: "utf8" }).split("\n").filter(Boolean); } catch { /* not written */ }
  await p.click(`.tile-area[data-win="${win}"] [data-tsp-attach]`);
  await p.waitForTimeout(500);
  const rm = await p.evaluate(() => { const D = window.__EM_DRAG__; const n = D.idsOfType("representation_model").map((id) => D.node(id)).find((x) => x?.data?.is_tileset); return n?.data?.url ?? null; });
  await p.screenshot({ path: SHOT("td3-pacchetto-preparato") }).catch(() => {});
  await ctx.close();
  return { pass: bar0?.form === "pair" && bar1?.form === "package" && added.length === 1 && added[0] === `${dir}/disco_rs.3tz`
      && before.every((f) => after.includes(f)) && names.includes("tileset.json") && names.includes("disco_rs/tiles/root.glb")
      && names[names.length - 1] === "@3dtilesIndex1@" && rm === `${dir}/disco_rs.3tz` && !errors.length,
    detail: { bar0, bar1, added, names: names.slice(0, 4).concat(names.slice(-1)), rm, errors } };
});

test("TD4.scene", "tileset trascinato · sulla Scena 3D (X.json dallo Storage): anteprima nello spazio dello studio, la barra con la posizione e «messo al centro solo per la vista»; ✕ la chiude", async () => {
  const { dir } = await tsdBench("td4");
  const { p, ctx, errors } = await open({ doc: "catena", ws: "space" });
  const win = await winOf(p, "scene");
  await p.waitForTimeout(800);
  const prevented = await tsdDropPath(p, win, { path: `${dir}/disco_rs.json`, type: "file", name: "disco_rs.json", ext: "json" });
  const bar = await tsdWait(p, () => tsdBar(p, win));
  const layer = await tsdWait(p, () => p.evaluate(() => {
    const h = document.querySelector(".scn-host");
    const l = (h?.__spaceTiles?.() ?? []).find((x) => String(x.id).startsWith("preview:"));
    return l && l.files.length ? { id: l.id, files: l.files.length, box: l.box } : null;
  }), 40000);
  await p.screenshot({ path: SHOT("td4-scena-anteprima") }).catch(() => {});
  await p.click(`.tile-area[data-win="${win}"] [data-tsp-close]`);
  await p.waitForTimeout(600);
  const closed = await tsdBar(p, win);
  await ctx.close();
  return { pass: prevented && bar?.form === "pair" && bar.warn && /spazio/.test(bar.note ?? "") && !!layer
      && (layer.box ?? []).every((v) => Math.abs(v) < 100) && closed === null && !errors.length,
    detail: { prevented, bar, layer, closed, errors } };
});

test("TD5.refuse", "tileset trascinato · uno zip senza tileset dice che cosa c'è dentro; un .em.json trascinato sul Viewer non è preso dal tileset (va ad aprire il documento come prima)", async () => {
  const { dir } = await tsdBench("td5");
  execFileSync("python3", ["-I", "-c", "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],'w');z.writestr('note/leggimi.txt','x');z.close()", `${dir}/niente.zip`]);
  const { p, ctx, errors } = await open({ doc: "catena", ws: "provenance" });
  const win = await winOf(p, "viewer");
  await tsdDropFiles(p, win, [{ name: "niente.zip", b64: readFileSync(`${dir}/niente.zip`).toString("base64") }]);
  await p.waitForTimeout(1200);
  const toast = await p.evaluate(() => document.querySelector("#toast, .toast")?.textContent ?? "");
  const bar = await tsdBar(p, win);
  // an em.json: the area leaves it to the window's door (not prevented here)
  const emjson = await p.evaluate((w) => {
    const dt = new DataTransfer();
    dt.items.add(new File(["{}"], "x.em.json"));
    const area = document.querySelector(`.tile-area[data-win="${w}"]`);
    let atArea = null;
    const spy = (e) => { atArea = e.defaultPrevented; };
    // on the area's parent: after the area's own handler, before the window's door
    area.parentElement.addEventListener("drop", spy, { once: true });
    const ev = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
    area.dispatchEvent(ev);
    return { reachedWindow: atArea !== null, preventedBeforeWindow: atArea };
  }, win);
  await ctx.close();
  return { pass: /No tileset\.json in niente\.zip: it holds note\//.test(toast) && bar === null
      && emjson.reachedWindow && emjson.preventedBeforeWindow === false && !errors.length,
    detail: { toast, bar, emjson, errors } };
});

// the Basilica Iulia itself (E.D.'s RealityScan export, READ ONLY on the
// Desktop): measured, when it is on this machine — a clone (APFS) in the bench
test("TD6.basilica", "tileset trascinato · la Basilica Iulia (RealityScan 2.2, 1 GB): la coppia dallo Storage sul Viewer e sulla Scena, lo zip sistemato dal sistema sul Viewer — tile caricate, tempo alla prima tile, posizione", async () => {
  const SRC = process.env.BASILICA_DIR ?? `${process.env.HOME}/Desktop/BasilicaTSL_cesium`;
  const ZIP = process.env.BASILICA_FIXED ?? `${process.env.HOME}/Desktop/BasilicaTLS_tileset.zip`;
  if (!existsSync(`${SRC}/tileset_Basilica_TLS_ED.json`)) return { pass: true, detail: { skipped: `${SRC} not here` } };
  const root = FS_ROOT ?? (await rootPath());
  const dir = `${root}/basilica`;
  execFileSync("rm", ["-rf", dir]);
  mkdirSync(dir, { recursive: true });
  execFileSync("cp", ["-cR", `${SRC}/tileset_Basilica_TLS_ED`, `${SRC}/tileset_Basilica_TLS_ED.json`, dir]);
  const out = {};
  const settle = async (p, read, ms = 60000) => {
    const t0 = Date.now(); let last = null, same = 0;
    for (;;) {
      const v = await read();
      if (v && last && v.files === last.files) same++; else same = 0;
      last = v ?? last;
      if ((v && v.files > 0 && same >= 6) || Date.now() - t0 > ms) return last;
      await p.waitForTimeout(500);
    }
  };
  {
    const { p, ctx, errors } = await open({ doc: "catena", ws: "provenance" });
    const win = await winOf(p, "viewer");
    const t0 = Date.now();
    await tsdDropPath(p, win, { path: `${dir}/tileset_Basilica_TLS_ED`, type: "dir", name: "tileset_Basilica_TLS_ED", ext: "" });
    const bar = await tsdWait(p, () => tsdBar(p, win), 60000);
    const tiles = await settle(p, async () => { const t = await tsdViewerTiles(p, win); return t ? { files: t.files.length, loaded: t.loaded, visible: t.visible, box: t.box } : null; });
    const st = bar ? await p.evaluate((id) => window.__EM_DRAG__.tilesetDropped(id), bar.id) : null;
    await p.screenshot({ path: SHOT("td6-basilica-viewer") }).catch(() => {});
    out.viewerPair = { bar, tiles, firstTileMs: st?.firstTileMs, served: st?.served, wallMs: Date.now() - t0, errors };
    await ctx.close();
  }
  {
    const { p, ctx, errors } = await open({ doc: "catena", ws: "space" });
    const win = await winOf(p, "scene");
    await p.waitForTimeout(800);
    await tsdDropPath(p, win, { path: `${dir}/tileset_Basilica_TLS_ED.json`, type: "file", name: "tileset_Basilica_TLS_ED.json", ext: "json" });
    const bar = await tsdWait(p, () => tsdBar(p, win), 60000);
    const layer = await settle(p, () => p.evaluate(() => {
      const l = (document.querySelector(".scn-host")?.__spaceTiles?.() ?? []).find((x) => String(x.id).startsWith("preview:"));
      return l ? { files: l.files.length, loaded: l.status.loaded, visible: l.status.visible, box: l.box } : null;
    }));
    const st = bar ? await p.evaluate((id) => window.__EM_DRAG__.tilesetDropped(id), bar.id) : null;
    await p.screenshot({ path: SHOT("td6-basilica-scena") }).catch(() => {});
    out.scenePair = { bar, layer, firstTileMs: st?.firstTileMs, served: st?.served, errors };
    await ctx.close();
  }
  if (existsSync(ZIP)) {
    const { p, ctx, errors } = await open({ doc: "catena", ws: "provenance" });
    const win = await winOf(p, "viewer");
    // the 1 GB zip as a File of the system: Playwright hands the path, the page slices it
    await p.evaluate(() => { const i = document.createElement("input"); i.type = "file"; i.id = "tsd-file"; i.style.display = "none"; document.body.appendChild(i); });
    await p.setInputFiles("#tsd-file", ZIP);
    const t0 = Date.now();
    const id = await p.evaluate((w) => window.__EM_DRAG__.tilesetDrop(w, [{ path: document.getElementById("tsd-file").files[0].name, blob: document.getElementById("tsd-file").files[0] }]), win);
    const bar = await tsdWait(p, () => tsdBar(p, win), 60000);
    const tiles = await settle(p, async () => { const t = await tsdViewerTiles(p, win); return t ? { files: t.files.length, loaded: t.loaded, visible: t.visible, box: t.box } : null; });
    const st = id ? await p.evaluate((x) => window.__EM_DRAG__.tilesetDropped(x), id) : null;
    await p.screenshot({ path: SHOT("td6-basilica-zip-viewer") }).catch(() => {});
    out.viewerZip = { bar, tiles, firstTileMs: st?.firstTileMs, served: st?.served, wallMs: Date.now() - t0, errors };
    await ctx.close();
  }
  execFileSync("rm", ["-rf", dir]);
  const okOf = (x, files) => !!x && (files ?? 0) > 0 && !x.errors.length;
  return { pass: okOf(out.viewerPair, out.viewerPair?.tiles?.files) && out.viewerPair.bar?.warn
      && okOf(out.scenePair, out.scenePair?.layer?.files) && (!out.viewerZip || okOf(out.viewerZip, out.viewerZip?.tiles?.files)),
    detail: out };
});

// ── MICRO tileset, shift e epoche (E.D. 25 Oct 2026) ──────────────────────────
test("TF1.frame", "tileset · il caso di E.D.: un contenitore RM senza mesh (tls), il suo Documento D.1 in Epoch 1, l'alternativa un tileset scritto in EPSG:6708 meno SHIFT6708 (all'equatore) — Epoch 1 lo mostra nella scena e nell'Outliner; il frame lo ricolloca (bridge, residuo < 1 mm) alle coordinate del file; la sezione «Frame» dell'Inspector lo dice, «Togli» è un passo di annulla", async () => {
  const { p, ctx, errors } = await open({ doc: "tiles-frame", ws: "space" });
  const asked = [];
  p.on("response", (r) => { if (/tileset-frame|tiles-frame|tiles-prova/.test(r.url())) asked.push(`${r.status()} ${r.url().replace(/^.*?\/\/[^/]+/, "")}`); });
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 20000 });
  const sc = () => p.evaluate(() => {
    const h = document.querySelector(".scn-host");
    return { items: h.__space(), tiles: h.__spaceTiles?.() ?? [],
      rows: [...document.querySelectorAll(".scn-outliner .sol-row")].map((r) => r.dataset.key) };
  });
  const t0 = Date.now(); let s = await sc();
  while (Date.now() - t0 < 20000 && !(s.tiles.find((x) => x.id === "rmgroup_tls")?.relocated && s.tiles.find((x) => x.id === "rmgroup_tls")?.files.length)) { await p.waitForTimeout(250); s = await sc(); }
  await p.waitForTimeout(400); s = await sc();
  const layer = s.tiles.find((x) => x.id === "rmgroup_tls");
  const item = s.items.find((x) => x.id === "rmgroup_tls");
  const c = layer?.box ? [0, 1, 2].map((k) => (layer.box[k] + layer.box[k + 3]) / 2) : null;
  // the study declares no CRS: the file's own grid — the box centre (34.73, 14.34, 0.39) Z-up, (x, z, −y) in three
  const near = !!c && Math.abs(c[0] - 34.73) < 3 && Math.abs(c[1] - 0.39) < 3 && Math.abs(c[2] + 14.34) < 3;
  await p.screenshot({ path: SHOT("tf1-frame-scena") }).catch(() => {});
  await p.click('.scn-outliner .sol-row[data-key="rm:rmgroup_tls"] .sol-name'); await p.waitForTimeout(800);
  const insp = () => p.evaluate(() => {
    const f = document.querySelector(".insp-frame");
    return f ? { crs: f.querySelector('input[data-frame="crs"]')?.value, x: f.querySelector('input[data-frame="x"]')?.value,
      states: [...f.querySelectorAll("[data-frame-state]")].map((e) => `${e.dataset.frameState}:${e.textContent}`),
      buttons: [...f.querySelectorAll("[data-frame-action]")].map((b) => `${b.dataset.frameAction}:${b.disabled ? "off" : "on"}`) } : null;
  });
  const i0 = await insp();
  const frameOf = () => p.evaluate(() => { const g = JSON.parse(window.__EM_DRAG__.docJson()); const gr = Object.values(g.graphs ?? { a: g.graph }).find((x) => x.nodes?.some((n) => n.id === "RES_TF"));
    return gr.nodes.find((n) => n.id === "RES_TF").data.frame ?? null; });
  await p.click('.insp-frame [data-frame-action="remove"]'); await p.waitForTimeout(600);
  const removed = await frameOf();
  await p.evaluate(() => window.__EM_DRAG__.undo()); await p.waitForTimeout(600);
  const back = await frameOf();
  await ctx.close();
  const conds = {
    epoch: !!item && item.as === "tiles" && s.rows.includes("rm:rmgroup_tls"),
    relocated: !!layer?.relocated && !layer.relocated.error && layer.relocated.residual_max_m < 0.001 && near,
    inspector: i0?.crs === "EPSG:6708" && i0.x === "291407" && i0.states.some((x) => /^relocated:.*mm/.test(x)) && i0.buttons.includes("remove:on")
      && i0.buttons.includes("use-study:off"),
    undo: (removed === null || removed === undefined) && back?.crs === "EPSG:6708" && back.shift?.[1] === 4640813,
    errors: !errors.length,
  };
  return { pass: Object.values(conds).every(Boolean), detail: { conds, item, layer: layer && { files: layer.files, relocated: layer.relocated, box: layer.box }, c, rows: s.rows, i0, removed, back, asked, errors } };
});

// ── run ─────────────────────────────────────────────────────────────────────
const chosen =cases.filter((c) => !only.length || only.includes(c.id) || only.some((o) => c.id.startsWith(o + ".")));
for (const c of chosen) {
  let r;
  // the error's first line, and Playwright's call log after it (which element,
  // what intercepted the click): «Timeout 30000ms exceeded» alone names nothing
  try { r = await c.fn(); } catch (err) { const lines = String(err.message ?? err).split("\n");
    r = { pass: false, detail: { error: lines[0].slice(0, 240), log: lines.slice(1).filter((l) => l.trim()).slice(-6).map((l) => l.trim().slice(0, 200)) } }; }
  results.push({ id: c.id, what: c.what, ...r });
  console.log(`${r.pass ? "✓" : "✗"} ${c.id} ${c.what}${r.pass && !process.env.DETAIL ? "" : "  " + JSON.stringify(r.detail)}`);
}
await browser.close();
if (jsonAt) writeFileSync(jsonAt, JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.pass);
console.log(`interactions: ${results.length - failed.length}/${results.length} cases passed`);
if (failed.length) process.exit(1);
