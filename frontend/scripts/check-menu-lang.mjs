// MICRO-TIL001 (E.D., 20 Nov 2026, 07:47) · with the interface in English the
// File menu said «Porta dentro…», «Porta dentro una cartella…»: the English
// dictionary held the Italian words. Every menu item goes through `i18n.ts`
// with EN and IT; this opens EVERY menu of the page in English and fails on an
// item that has no key or whose English is the Italian.
//
//   node scripts/check-menu-lang.mjs          (PORT=<a Vite of this tree>, EM_V9=<an em.json>)
//   NO_BROWSER=1 node scripts/check-menu-lang.mjs   # the table only
//
// TABLE (pure): every row of `menu-table.ts` (label, sub-menu, tooltip) has an
// English text, and it differs from the Italian unless it is a NAME, the same
// in both languages (SAME_IN_BOTH).
// PAGE: the menu bar (File, Edit, Tools, Help and their sub-menus, opened one by
// one) and the «⋯» of every window of every workspace, read as drawn. An item is
// matched to its key by `data-i18n` when it carries one, else by its text
// against the English dictionary ({n}-style values as patterns); none found →
// «no key»; every key found has the Italian equal to the English → «Italian».
// Rows that are not words of the program are left out: the recent files (a
// file's name), a plugin's own commands (its author's words).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
let checks = 0;
const fails = [];
const ok = (c, what) => { if (c) checks++; else fails.push(what); };

const bundle = await esbuild.build({
  stdin: { contents: `export { MENUS } from "./menu-table"; export { dictionaryOf } from "./i18n";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const EN = M.dictionaryOf("en"), IT = M.dictionaryOf("it");

/** the words that are names in both languages (a product, a format) */
const SAME_IN_BOTH = new Set(["EMStudio", "StratiMiner", "GitHub", "Blender", "DosCo", "Matrix", "DTC", "OK",
  "File",            // the Italian menu is called «File» too
  "GraphML", "SVG", "Turtle (.ttl)", "PDF", "JSON", "CSV", "Excel"]);
const sameOk = (s) => SAME_IN_BOTH.has(String(s).replace(/[….:]+$/, "").trim()) || !/[a-zà-ú]{3,}/i.test(String(s));

// ── the table ────────────────────────────────────────────────────────────────
{
  const walk = (rows, where) => {
    for (const r of rows) {
      if (r.kind === "sub") { check(r.label, `${where} ▸ ${r.id}`); if (r.title) check(r.title, `${where} ▸ ${r.id} (tooltip)`); walk(r.rows, `${where} ▸ ${r.id}`); }
      if (r.kind === "cmd") { check(r.label, `${where} · ${r.id}`); if (r.title) check(r.title, `${where} · ${r.id} (tooltip)`); }
    }
  };
  function check(key, where) {
    ok(typeof EN[key] === "string" && EN[key].length > 0, `table ${where}: «${key}» has no English`);
    ok(typeof IT[key] === "string" && IT[key].length > 0, `table ${where}: «${key}» has no Italian`);
    if (EN[key] && IT[key]) ok(EN[key] !== IT[key] || sameOk(EN[key]), `table ${where}: «${key}» English is the Italian («${EN[key]}»)`);
  }
  for (const m of M.MENUS) { if (m.label) check(m.label, m.id); walk(m.rows, m.id); }
}

// ── the page ─────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// a value made only of placeholders and punctuation («{a} — {b}») is no pattern: it matches anything
const patterns = Object.entries(EN).filter(([, v]) => /[a-z]{3,}/i.test(v.replace(/\{\w+\}/g, "")))
  .map(([k, v]) => [k, new RegExp("^" + esc(v).replace(/\\\{\w+\\\}/g, ".+?") + "$")]);
function keysOf(text) {
  const exact = Object.keys(EN).filter((k) => EN[k] === text);
  return exact.length ? exact : patterns.filter(([, re]) => re.test(text)).map(([k]) => k);
}
function judge(item, where) {
  const text = item.text.replace(/^✓\s*/, "").trim();
  if (!text) return;
  // a label made of two sentences («Name — what it does», «… · …») is judged a part at a time
  if (!item.key && !keysOf(text).length && / — | · /.test(text)) {
    for (const part of text.split(/ — | · /)) judge({ key: null, text: part }, where);
    return;
  }
  const keys = item.key ? [item.key] : keysOf(text);
  ok(keys.length > 0, `${where}: «${text}» has no key in i18n.ts`);
  if (!keys.length) return;
  const translated = keys.some((k) => IT[k] && IT[k] !== EN[k]) || keys.every((k) => sameOk(EN[k] ?? text));
  ok(translated, `${where}: «${text}» (${keys.slice(0, 3).join(", ")}) is the same in Italian`);
  if (item.key) ok((EN[item.key] ?? "").replace(/\{\w+\}/g, "") !== "" , `${where}: «${item.key}» not in the English dictionary`);
}

if (!process.env.NO_BROWSER) {
  const { bench } = await import("./page-bench.mjs");
  const B = await bench("check-menu-lang");
  if (B) {
    const { page, errors } = await B.open({ seed: { "emstudio.locale": "en" } });
    // the menu bar: each top menu opened, then each of its sub-menus
    const tops = await page.evaluate(() => [...document.querySelectorAll("#toolbar .dropdown[id^='dd-']")].filter((d) => !d.classList.contains("hidden")).map((d) => d.id));
    ok(tops.length >= 4, `the menu bar has its menus (${tops.join(" ")})`);
    for (const id of tops) {
      await page.evaluate((id) => document.querySelector(`#${id} > .dd-toggle`)?.click(), id);
      await page.waitForTimeout(150);
      for (const sub of await page.evaluate((id) => [...document.querySelectorAll(`#${id} .dd-sub-toggle`)].map((b) => b.closest(".dd-sub")?.dataset.sub ?? ""), id)) {
        await page.evaluate(([id, s]) => document.querySelector(`#${id} .dd-sub[data-sub="${s}"] > .dd-sub-toggle`)?.click(), [id, sub]);
        await page.waitForTimeout(120);
      }
      const items = await page.evaluate((id) => {
        const out = [];
        for (const b of document.querySelectorAll(`#${id} .dd-menu button, #${id} .dd-menu .dd-sub-toggle`)) {
          if (b.closest("[data-dynamic='recent']") || b.dataset.run || b.closest(".dd-run")) continue;   // a file's name, a plugin's words
          if (b.classList.contains("hidden") || b.hidden) continue;
          const lab = b.querySelector("[data-i18n]") ?? (b.dataset.i18n ? b : null);
          const own = [...b.childNodes].filter((n) => n.nodeType === 3 || (n.nodeType === 1 && !n.classList.contains("dd-key") && !n.classList.contains("dd-sub-caret") && !n.classList.contains("beta-mark"))).map((n) => n.textContent).join("").trim();
          out.push({ key: lab?.dataset.i18n ?? null, text: lab ? lab.textContent.trim() : own });
        }
        return out;
      }, id);
      ok(items.length > 0, `${id}: items read`);
      for (const it of items) judge(it, `menu ${id}`);
      await page.keyboard.press("Escape");
      await page.evaluate(() => document.body.click());
    }
    // the «⋯» of every window, in every workspace
    const wss = await page.evaluate(() => [...document.querySelectorAll("#workspace-bar .ws-tab")].map((b) => b.dataset.ws).filter(Boolean));
    let menus = 0;
    for (const ws of wss) {
      await page.evaluate((w) => document.querySelector(`#workspace-bar .ws-tab[data-ws="${w}"]`)?.click(), ws);
      await page.waitForTimeout(1500);
      const n = await page.evaluate(() => document.querySelectorAll(".tile-area .tile-bar .win-menu > .win-menu-toggle").length);
      for (let i = 0; i < n; i++) {
        const items = await page.evaluate((i) => {
          const tg = document.querySelectorAll(".tile-area .tile-bar .win-menu > .win-menu-toggle")[i];
          if (!tg || !tg.offsetParent) return null;
          tg.click();
          const list = tg.parentElement.querySelector(".dd-menu");
          const out = [...(list?.children ?? [])].filter((x) => x.tagName === "BUTTON" || x.classList.contains("dd-group"))
            .map((x) => ({ key: null, text: x.textContent.trim() }));
          tg.click();
          return { win: tg.closest("[data-win]")?.dataset.win ?? "?", out };
        }, i);
        if (!items) continue;
        menus++;
        for (const it of items.out) judge(it, `${ws} · ${items.win} ⋯`);
      }
    }
    ok(menus > 0, `the windows' «⋯» read (${menus})`);
    ok(!errors.length, `no page error (${errors.join(" | ")})`);
    await B.close();
  }
}

if (fails.length) {
  for (const f of fails) console.log(`✗ ${f}`);
  console.log(`check-menu-lang: ${fails.length} failed, ${checks} passed`);
  process.exit(1);
}
assert.ok(checks > 0);
console.log(`✓ check-menu-lang: ${checks} checks`);
