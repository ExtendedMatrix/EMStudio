// MICRO-SEG26 (22 Nov 2026) · the 3D that accompanies the text.
//
//   node scripts/check-narrative-3d.mjs          (PORT=<a Vite already running> to reuse one)
//
// The Narrative workspace has a 3D area (a Space window, `follow: "narrative"`)
// that follows the ACTIVE BLOCK: the epoch or activity the block narrates (on
// itself, its section or subsection, its chapter) sets the epoch and keeps only
// the pertinent proxies and models; the units it cites are lit, the others
// faded; a block with no ties leaves the view as it was. While writing the 3D
// waits for the caret to rest ~1 s — it never flies while you type. From the
// 3D to the text: the parts that cite or narrate a unit, lit, with «Next». From
// the area, «Insert this view as a figure»; from the Space, «Bring into the
// Narrative…» (dynamic or static), one undo step. `em.app.narrative`.
//
// Part 1 runs in node (the pure rules of `narrative-follow.ts`); part 2 opens
// the app in Chromium on `testdata/spazio.em.json` with a story added.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const FE = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(FE, "src");
let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; console.log(`  ✓ ${what}`); };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; console.log(`  ✓ ${what}`); };

// ── the fixture: spazio.em.json + an activity and a story ───────────────────
const fixture = () => {
  const d = JSON.parse(readFileSync(join(FE, "testdata/spazio.em.json"), "utf8"));
  const g = d.graph;
  g.nodes.push({ id: "ACT_MURO", node_type: "ActivityNodeGroup", name: "Costruzione del muro", data: {} });
  g.edges.push({ id: "e_act_ep", source: "ACT_MURO", target: "EP_MED", edge_type: "has_first_epoch" },
               { id: "e_act_m1", source: "USM101", target: "ACT_MURO", edge_type: "is_in_activity" });
  g.nodes.push({ id: "NR", node_type: "narrative", name: "Il muro", data: { chapters: [
    { title: "Medioevo", anchor: "EP_MED", blocks: [
      { block_type: "prose", text: "The fill [[USV106]] leans on the wall." },
      { block_type: "heading", level: 1, text: "The wall", options: { anchor: "ACT_MURO" } },
      { block_type: "prose", text: "Built in stone, course after course." },
      { block_type: "prose", text: "Its height [[P_H]] is measured." },
    ] },
    { title: "Età moderna", anchor: "EP_MOD", blocks: [
      { block_type: "prose", text: "The surface [[US102]] today. " + "It was cleaned, drawn and photographed before the new floor was laid over it; the rest of the room is covered. ".repeat(4) },
    ] },
    { title: "Notes", blocks: [
      { block_type: "prose", text: "Nothing to show here." },
      ...Array.from({ length: 30 }, (_, i) => ({ block_type: "prose", text: `Note ${i + 1}: a line with no ties.` })),
    ] },
  ] } });
  return d;
};

// ── part 1 · the pure rules ─────────────────────────────────────────────────
{
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement;
  const out = await esbuild.build({
    stdin: { contents: `export * as NF from "./narrative-follow"; export * as F from "./narrative-figures"; export * as W from "./workspace"; export { setLocale } from "./i18n";`, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, logLevel: "silent",
    plugins: [{ name: "stub-icons", setup(b) {
      b.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `export const ICON_NODE_TYPES = new Set(); export const imageFor = () => null;
        export const imageForUrl = () => null; export const dtcGlyphUrl = () => null; export const iconUrl = () => null;`, loader: "ts" }));
    } }],
  });
  const { NF, F, W, setLocale } = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  setLocale("en");
  const doc = fixture();
  const ch = doc.graph.nodes.find((n) => n.id === "NR").data.chapters;
  eq(NF.blockFocus(doc, ch, 0, 0), { narrates: ["EP_MED"], from: "chapter", cites: ["USV106"] },
     "a paragraph of a chapter: the chapter's epoch narrated, its mention cited");
  eq(NF.blockFocus(doc, ch, 0, 2).narrates, ["ACT_MURO"], "a paragraph under a section: the section's activity (the innermost part)");
  eq(NF.blockFocus(doc, ch, 0, 2).from, "section", "…said as the section's");
  eq(NF.blockFocus(doc, ch, 0, 1).from, "block", "a heading narrates on its own");
  eq(NF.blockFocus(doc, ch, 0, 3).cites, ["P_H", "USM101"], "a cited property stands for the unit that has it (the Inspector's «Cites»)");
  eq(NF.blockFocus(doc, ch, 2, 0), { narrates: [], from: null, cites: [] }, "a block with no ties: nothing");
  eq(NF.blockFocus(doc, ch, 0, null).cites, [], "a chapter's head cites nothing of its own");
  eq(NF.laneScope(doc, ["EP_MED"]), { epoch: "EP_MED", keys: null }, "an epoch: set, and the whole epoch drawn");
  const act = NF.laneScope(doc, ["ACT_MURO"]);
  eq(act.epoch, "EP_MED", "an activity: its epoch set");
  ok(act.keys.has("proxy:USM101") && !act.keys.has("proxy:USV106"), "…and only its units' proxies kept");
  eq(NF.laneScope(doc, ["ACT_MURO", "EP_MED"]).keys, null, "an epoch among the lanes: the whole epoch");
  eq(NF.blocksAbout(doc, ch, "USM101"), [{ chapter: 0, block: 1, why: "narrates" }, { chapter: 0, block: 3, why: "cites" }],
     "the parts about a unit: the section narrating its activity, the block citing its property — not the whole epoch's chapter");
  eq(NF.blocksAbout(doc, ch, "US102"), [{ chapter: 1, block: 0, why: "cites" }], "…a cited unit");
  const fig = (kind, label) => ({ block_type: "embed", ref: "EP_MED", view_type: "scene3d", options: { figure: { kind, label } } });
  eq([F.figureVariant(fig("view", "f3")), F.figureVariant(fig("still", "f4")), F.figureVariant(fig("plan", "f5"))], ["view-f3", "still-f4", "plan"],
     "a view brought from the Space is its own plate (`view-f3`), as s3Dgraphy files it");
  eq(F.FIGURE_VIEW.view, "scene3d", "…drawn as a scene3d");
  const sig = (id) => W.arrangementSignature(W.WORKSPACES.find((w) => w.id === id).arrangement);
  eq(sig("narrative"), "row(col(narrative-index,outliner),row(narrative,row(col(scene,graph:matrix),inspector)))",
     "the Narrative workspace: the 3D above the Matrix, beside the page");
  // never fly while typing: the timer is pushed back by every call
  const s = NF.settle();
  let fired = 0;
  for (let i = 0; i < 6; i++) { s.push(120, () => fired++); await new Promise((r) => setTimeout(r, 40)); }
  eq(fired, 0, "the settle timer does not fire while calls keep coming");
  await new Promise((r) => setTimeout(r, 200));
  eq(fired, 1, "…and fires once when they stop");
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
if (!pwMod) { console.log(`narrative-3d: ${checks} checks passed (page part SKIPPED: playwright-core not found)`); process.exit(0); }
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
await p.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="narrative"]')?.click());
await p.waitForSelector('.tile-area[data-surface-type="narrative"] .nv-block-row[data-block="1:0"]', { timeout: 20000 });
await p.waitForSelector("[data-nvf-strip]", { timeout: 20000 });
const st = () => p.evaluate(() => window.__EM_DRAG__.followState());
const flights = () => p.evaluate(() => document.querySelector("[data-nvf-strip]")?.closest(".scn-host")?.__spaceFlights?.()?.log?.length ?? -1);
const clickRow = (b) => p.evaluate((b) => document.querySelector(`.tile-area[data-surface-type="narrative"] .nv-block-row[data-block="${b}"]`)?.click(), b);
/** the flights asked, once none has come for 900 ms */
const settledFlights = async () => { let n = await flights(), t = Date.now(); while (Date.now() - t < 900) { await sleep(150); const m = await flights(); if (m !== n) { n = m; t = Date.now(); } } return n; };
const waitFor = async (pred, ms = 8000) => { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await st(); if (pred(s)) return s; await sleep(150); } return s; };

ok(await p.evaluate(() => !!document.querySelector('.tile-area[data-surface-type="scene"] [data-nvf-strip]')),
   "N1 · the Narrative opens with its 3D area (a Space window) and the strip «Follow the text · Frame this block · Insert this view as a figure»");
eq((await st()).on, true, "N1 · following is on by default");

// N2 · a block citing a unit in the modern epoch
await clickRow("1:0");
let s = await st();
eq(s.pending, true, "N2 · writing: a click arms the follow — it waits for the caret to rest");
s = await waitFor((x) => x.focus?.epoch === "EP_MOD", 4000);
eq([s.epoch, s.focus?.lit], ["EP_MOD", ["US102"]], "N2 · …then the epoch narrated is set and the cited unit lit");
const f2 = await (async () => { const t0 = Date.now(); let n = 0; while (Date.now() - t0 < 6000) { n = await flights(); if (n > 0) break; await sleep(200); } return n; })();
ok(f2 > 0, `N2 · the camera flies to it (${f2} flight)`);

// N3 · a paragraph under the section narrating the activity: only its proxies
await clickRow("0:2");
s = await waitFor((x) => x.focus?.epoch === "EP_MED" && !!x.focus?.keys, 4000);
ok(s.focus.keys.includes("proxy:USM101") && !s.focus.keys.includes("proxy:USV106"), "N3 · a section's activity: its epoch, only its units' proxies kept");
s = await waitFor((x) => (x.wins[0]?.items ?? []).length > 0 && !(x.wins[0].items).some((i) => i.id === "USV106"), 4000);
ok(!s.wins[0].items.some((i) => i.id === "USV106") && s.wins[0].items.some((i) => i.id === "USM101"),
   `N3 · the 3D draws the activity's proxy and not the others (${JSON.stringify(s.wins[0].items.map((i) => i.id))})`);

// N4 · a block of the chapter citing one unit: the others faded
await clickRow("0:0");
s = await waitFor((x) => x.focus?.lit?.[0] === "USV106" && (x.wins[0]?.items ?? []).some((i) => i.id === "USM101"), 4000);
eq(s.focus.keys, null, "N4 · the chapter's epoch: the whole epoch drawn");
ok(s.wins[0].items.find((i) => i.id === "USM101")?.dim === true && s.wins[0].items.find((i) => i.id === "USV106")?.dim === false,
   "N4 · the cited unit lit, the others faded");

// N5 · a block with no ties: the view stays
const before = await settledFlights();
await clickRow("2:0");
s = await waitFor((x) => x.focus?.idle === true, 4000);
eq([s.focus.idle, s.epoch], [true, "EP_MED"], "N5 · a block with no ties: the epoch and the framing stay");
await sleep(600);
eq(await flights(), before, "N5 · …and no flight");
eq(await p.evaluate(() => document.querySelector("[data-nvf-strip]")?.dataset.nvfIdle), "true", "N5 · the strip says so");

// N6 · Write does not fly while typing
await p.evaluate(() => {
  const ed = document.querySelector('.tile-area[data-surface-type="narrative"] .nv-block-row[data-block="1:0"] [contenteditable="true"]');
  ed.focus();
  const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
});
const typing0 = await settledFlights();
const t0 = Date.now();
let flewWhileTyping = false;
while (Date.now() - t0 < 3000) {
  await p.keyboard.type("x");
  await sleep(250);
  if ((await flights()) !== typing0) flewWhileTyping = true;
}
const sType = await st();
ok(!flewWhileTyping, "N6 · writing: no flight while the keys come (3 s of typing in another block)");
eq([sType.pending, sType.epoch], [true, "EP_MED"], "N6 · …the follow still waiting, the epoch not yet changed");
s = await waitFor((x) => x.epoch === "EP_MOD", 3000);
eq(s.epoch, "EP_MOD", "N6 · the caret at rest: the 3D takes the block (epoch of «Età moderna»)");
ok(await (async () => { const t1 = Date.now(); while (Date.now() - t1 < 4000) { if ((await flights()) > typing0) return true; await sleep(150); } return false; })(),
   "N6 · …and flies once the typing stopped");
await p.keyboard.press("Escape");

// N7 · «Frame this block» flies now; the switch turns following off and on
await clickRow("0:0");
await waitFor((x) => x.focus?.epoch === "EP_MED", 4000);
const fb = await settledFlights();
await p.evaluate(() => document.querySelector("[data-nvf=frame]").click());
ok(await (async () => { const t1 = Date.now(); while (Date.now() - t1 < 4000) { if ((await flights()) > fb) return true; await sleep(150); } return false; })(),
   "N7 · «Frame this block» flies at once");
await p.evaluate(() => document.querySelector("[data-nvf=toggle]").click());
eq((await st()).on, false, "N7 · «Follow the text» off");
await clickRow("1:0");
await sleep(1500);
eq((await st()).epoch, "EP_MED", "N7 · …another block does not move the 3D");
await p.evaluate(() => document.querySelector("[data-nvf=toggle]").click());
s = await waitFor((x) => x.on && x.epoch === "EP_MOD", 4000);
eq([s.on, s.epoch], [true, "EP_MOD"], "N7 · on again: it takes the active block");

// N8 · from the 3D to the text
await p.evaluate(() => window.__EM_DRAG__.aboutUnit("USM101"));
await sleep(300);
eq(await p.evaluate(() => [...document.querySelectorAll('.tile-area[data-surface-type="narrative"] .nv-about')].map((e) => e.dataset.block ?? "head")),
   ["0:1", "0:3"], "N8 · a unit picked in the 3D: the parts that narrate or cite it lit in the page");
ok(await p.evaluate(() => !!document.querySelector(".nidx-row.nidx-about .nidx-about-n")), "N8 · …and in the Index, with how many");
ok((await p.evaluate(() => document.querySelector(".nv-about-bar")?.textContent ?? "")).includes("2 parts"), "N8 · the bar says «in 2 parts of the story»");
await p.evaluate(() => document.querySelector("[data-nv-about-go=next]").click());
await sleep(200);
eq(await p.evaluate(() => document.querySelector(".nv-about-now")?.dataset.block), "0:1", "N8 · «Next» goes to the first, and selects it");
await p.evaluate(() => document.querySelector("[data-nv-about-go=next]").click());
await sleep(200);
eq(await p.evaluate(() => document.querySelector(".nv-about-now")?.dataset.block), "0:3", "N8 · …then the second");
await p.evaluate(() => document.querySelector("[data-nv-about-go=close]").click());
eq(await p.evaluate(() => document.querySelectorAll(".nv-about").length), 0, "N8 · × takes the lights away");

// N9 · «Insert this view as a figure» — a live figure after the active block, one undo
await clickRow("1:0");
await waitFor((x) => x.focus?.epoch === "EP_MOD", 4000);
const blocksOf = () => p.evaluate(() => JSON.parse(window.__EM_DRAG__.docJson()).graph?.nodes?.find((n) => n.id === "NR")?.data.chapters[1].blocks
  ?? Object.values(JSON.parse(window.__EM_DRAG__.docJson()).graphs ?? {}).flatMap((g) => g.nodes ?? []).find((n) => n.id === "NR")?.data.chapters[1].blocks);
await p.evaluate(() => document.querySelector("[data-nvf=figure]").click());
let bl = await (async () => { const t1 = Date.now(); let b; while (Date.now() - t1 < 25000) { b = await blocksOf(); if (b?.length === 2) return b; await sleep(300); } return b; })();
eq(bl?.length, 2, "N9 · a block inserted after the active one");
eq([bl?.[1]?.view_type, bl?.[1]?.options?.figure?.kind, bl?.[1]?.ref], ["scene3d", "view", "EP_MOD"], "N9 · …a live figure of kind «view» of the epoch followed");
ok(!!bl?.[1]?.options?.camera?.pos && Array.isArray(bl?.[1]?.options?.view?.layers), "N9 · …with the camera and the view's parameters");
await p.evaluate(() => window.__EM_DRAG__.undo());
bl = await blocksOf();
eq(bl?.length, 1, "N9 · one ⌘Z takes it back");

// N10 · «Bring into the Narrative…» from the 3D's ⋯: dynamic or static; static = a frozen picture with its caption
const winId = await p.evaluate(() => document.querySelector("[data-nvf-strip]").dataset.nvfStrip);
await p.evaluate((w) => { void window.__EM_DRAG__.bringView(w, null, "space"); }, winId);
await p.waitForSelector('[data-app-dialog="nv-bring"]', { timeout: 5000 });
ok((await p.evaluate(() => document.querySelector('[data-app-dialog="nv-bring"]')?.textContent ?? "")).includes("camera"),
   "N10 · the dialog says what goes (camera, epoch, layers, selection, LOD) and where");
await p.evaluate(() => document.querySelector('[data-app-dialog="nv-bring"] [data-dialog-choice="still"]').click());
bl = await (async () => { const t1 = Date.now(); let b; while (Date.now() - t1 < 30000) { b = await blocksOf(); if (b?.length === 2) return b; await sleep(300); } return b; })();
eq(bl?.[1]?.options?.figure?.kind, "still", "N10 · «Static»: a frozen figure");
ok(/^data:image\/png;base64,/.test(bl?.[1]?.options?.still ?? "") && (bl?.[1]?.options?.still_w ?? 0) >= 600, `N10 · …its picture at high resolution (${bl?.[1]?.options?.still_w}×${bl?.[1]?.options?.still_h})`);
const cap = bl?.[1]?.options?.caption ?? "";
ok(/frozen on/.test(cap) && /epoch Età moderna/.test(cap) && /layers:/.test(cap), `N10 · …the date and the view's parameters in its caption («${cap.slice(0, 90)}…»)`);
ok(await p.evaluate(() => !!document.querySelector(".nv-frozen img.nv-frozen-img")), "N10 · the page shows the picture");
await p.evaluate(() => window.__EM_DRAG__.undo());
eq((await blocksOf())?.length, 1, "N10 · ⌘Z takes it back");
await p.evaluate(() => window.__EM_DRAG__.redo?.());
eq((await blocksOf())?.length, 2, "N10 · ⇧⌘Z puts it again");
await p.evaluate(() => window.__EM_DRAG__.undo());

// N11 · em.app.narrative (the requests a script sends)
eq(await p.evaluate(() => window.__EM_DRAG__.appOp("narrative.follow", {})), true, "N11 · em.app.narrative.follow reads the switch");
eq(await p.evaluate(() => window.__EM_DRAG__.appOp("narrative.set_follow", { on: false })), false, "N11 · …and sets it");
await p.evaluate(() => window.__EM_DRAG__.appOp("narrative.set_follow", { on: true }));
await p.evaluate(() => window.__EM_DRAG__.appOp("narrative.set_active", { chapter: 0, block: 2 }));
const act = await p.evaluate(() => window.__EM_DRAG__.appOp("narrative.active", {}));
eq([act.chapter, act.block, act.narrates], [0, 2, ["ACT_MURO"]], "N11 · em.app.narrative.go / .active: the block, what it narrates");
s = await waitFor((x) => x.focus?.lanes?.[0] === "ACT_MURO", 3000);
eq(s.focus?.lanes, ["ACT_MURO"], "N11 · …and the 3D follows it at once");

// N12 · Italian
await p.evaluate(() => { localStorage.setItem("emstudio.locale", "it"); });
await p.reload();
await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length > 0, null, { timeout: 60000 });
await p.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="narrative"]')?.click());
await p.waitForSelector("[data-nvf=toggle]", { timeout: 20000 });
eq(await p.evaluate(() => [...document.querySelectorAll("[data-nvf-strip] .scn-follow-btn .scn-follow-words")].map((b) => b.textContent.trim())),
   ["Segui il testo", "Inquadra questo blocco", "Inserisci questa vista come figura"], "N12 · in Italian");

// N13 · reading: the block under the reading line, when the scroll stops — at once, no caret to wait for
await p.evaluate(() => document.querySelector('.tile-area[data-surface-type="narrative"] [data-reading="read"]')?.click());
await p.waitForSelector('.tile-area[data-surface-type="narrative"] .nv-paper .nv-block-row[data-block="1:0"]', { timeout: 10000 });
await sleep(400);
await p.evaluate(() => {
  const head = document.querySelector('.tile-area[data-surface-type="narrative"] .nv-chapter[data-chapter="1"] > .nv-chapter-head');
  let sc = head.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  const r = sc.getBoundingClientRect();
  sc.scrollTop += head.getBoundingClientRect().top - (r.top + r.height * 0.15);
});
s = await waitFor((x) => x.active?.chapter === 1 && x.reading === "read" && x.focus?.epoch === "EP_MOD", 4000);
eq([s.active?.chapter, s.reading, s.focus?.epoch], [1, "read", "EP_MOD"], "N13 · reading: the part under the reading line is the active block, the 3D follows (Età moderna)");
await p.evaluate(() => {
  const head = document.querySelector('.tile-area[data-surface-type="narrative"] .nv-chapter[data-chapter="0"] > .nv-chapter-head');
  let sc = head.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  sc.scrollTop = 0;
});
s = await waitFor((x) => x.active?.chapter === 0 && x.focus?.epoch === "EP_MED", 4000);
eq([s.active?.chapter, s.focus?.epoch], [0, "EP_MED"], "N13 · scrolled back up: the first chapter's epoch");

eq(errors, [], "no page error");
console.log(`narrative-3d: ${checks} checks passed`);
await done(0);
