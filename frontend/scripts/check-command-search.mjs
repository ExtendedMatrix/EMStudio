// MICRO-SEG29 (E.D., 22 Nov 2026) · THE MENU «TOOLS» REDISTRIBUTED, AND F3.
//
//   node scripts/check-command-search.mjs
//   (page part: EM_V9=<a Templu Mare copy>, CHR / PLAYWRIGHT_CORE as page-bench.mjs)
//
// Node (no browser): `command-search.ts` over the one table of commands —
//   · NO COMMAND LOST: every command of before (the table at 7c2cdbd, and the
//     items of the menu Tools of index.html) is reachable, on every platform it
//     existed on, from a menu OR from the search (by its English and its
//     Italian label), and the search says where it lives now;
//   · the search answers in English and Italian and by synonyms («tools»,
//     «strumenti», «cronologia»), with the keys of each command;
//   · the plugins' rows of a menu's slot and the commands with no menu come in;
//   · the keys: F3 and ⌘K / Ctrl+K are no one else's (the table, the key map).
// Page (Templu Mare): F3 and ⌘K open it, «cronologia» → Enter opens «Check the
// chronology», the Matrix's header has «Add ▾» and «Chronology», Window and
// Edit ▸ Clean up are drawn, the Preferences have Colours and Vocabularies,
// «Bring in…» offers StratiMiner, the Inspector's value has «Edit vocabulary…».
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = new URL("../", import.meta.url).pathname;
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.navigator ??= { language: "en", platform: "MacIntel", userAgent: "node" };
const bundle = await esbuild.build({
  stdin: {
    contents: `export * from "./command-search"; export * from "./menu-table"; export { KEYMAP } from "./keymap";
               export { dictionaryOf } from "./i18n";`,
    resolveDir: SRC, loader: "ts",
  },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const EN = M.dictionaryOf("en"), IT = M.dictionaryOf("it");
const fill = (d) => (k, v = {}) => (d[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? `{${n}}`);
const catalog = (platform, lang = "en", extra = []) => M.commandEntries({
  platform, t: fill(lang === "it" ? IT : EN),
  dicts: (lang === "it" ? [IT, EN] : [EN, IT]).map((d) => (k) => d[k]), extra,
});

// ── 1 · no command lost ─────────────────────────────────────────────────────
// the commands of the table BEFORE (HEAD 7c2cdbd, `script-commands.json` there):
// id → the platforms where it existed (absent: all)
const TABLE_BEFORE = {
  about: ["mac"], aboutHelp: ["web", "win", "linux"], updates: ["mac"], updatesHelp: ["win", "linux"], settings: ["mac"],
  settingsHelp: ["web", "win", "linux"], workspaces: null, shortcuts: null, legend: null, pythonApi: null, new: null,
  newProject: null, open: null, openReplace: null, openProject: null, save: null, saveAs: null, saveAll: null, pin: null,
  bringIn: null, door: null, doorFolder: null, doorDosco: null, integrate: null, importGraphml: null, importMapping: null,
  exportSvg: null, exportTtl: null, composeFromGraph: null, consolidate: null, printSheets: null, relocate: null,
  collect: null, revealDoc: null, cleanFile: null, reorderProject: null, createRoom: null, bringIntoRoom: null,
  close: null, closeProject: null, quitFile: ["win", "linux"], georef: null, undo: null, redo: null,
};
// the items of the menu Tools (index.html at 7c2cdbd, plus the console made by
// main.ts) → the command they are now
const TOOLS_BEFORE = {
  "btn-tool-add": "addMenu", "btn-tool-stratiminer": "stratiminer", "btn-tool-uniform": "uniformSpellings",
  "btn-tool-colours": "colours", "btn-tool-vocabularies": "vocabularies", "btn-tool-extensions": "extensions",
  "btn-tool-chronology": "chronology", "btn-door-dosco-tools": "doorDosco", "btn-tool-console": "console", "btn-georef": "georef",
};
const ABOUT_SAME = { about: "aboutHelp", aboutHelp: "about", updates: "updatesHelp", updatesHelp: "updates", settings: "settingsHelp", settingsHelp: "settings" };
const findBy = (entries, q, id) => M.searchCommands(entries, q, 12).some((e) => e.id === id || e.id === ABOUT_SAME[id]);
for (const platform of ["web", "mac", "win", "linux"]) {
  for (const lang of ["en", "it"]) {
    const entries = catalog(platform, lang);
    const ids = new Set(entries.map((e) => e.id));
    const places = new Map(M.commandPlaces(platform).map((p) => [p.row.id, p]));
    const want = [...Object.entries(TABLE_BEFORE).filter(([, on]) => !on || on.includes(platform)).map(([id]) => id),
      ...Object.values(TOOLS_BEFORE)];
    const lost = [];
    for (const id of want) {
      const p = places.get(id) ?? places.get(ABOUT_SAME[id]);
      const inMenu = !!p?.path;
      const row = p?.row;
      const byEn = row && findBy(entries, EN[row.label], id);
      const byIt = row && findBy(entries, IT[row.label], id);
      if (!(inMenu || (byEn && byIt))) lost.push(id);
      // whatever the menu: the search finds it by both names
      if (!(byEn && byIt) || !(ids.has(id) || ids.has(ABOUT_SAME[id]))) lost.push(`${id}(search)`);
    }
    eq(lost, [], `${platform}/${lang}: every command of before is reachable (menu or search), and the search finds it in EN and IT`);
  }
}
// the search says where a command lives NOW
{
  const en = catalog("web", "en"), it = catalog("web", "it");
  const at = (es, id) => es.find((e) => e.id === id)?.where;
  eq(at(en, "chronology"), "Matrix header · the ▲ of the status bar", "Check the chronology… → the Matrix's header and the ▲");
  eq(at(it, "chronology"), "Intestazione della Matrix · il ▲ della barra di stato", "…in Italian");
  eq(at(en, "addMenu"), "Matrix header ▸ Add ▾ · ⇧A", "Add node… → the Matrix's Add ▾");
  eq(at(en, "stratiminer"), "File ▸ Bring in… (one of its choices)", "StratiMiner → File ▸ Bring in…");
  eq(at(en, "doorDosco"), "File ▸ Bring in… (one of its choices)", "Read as DosCo… → File ▸ Bring in…");
  eq(at(en, "uniformSpellings"), "Edit ▸ Clean up", "Normalise spellings… → Edit ▸ Clean up");
  eq(at(it, "uniformSpellings"), "Modifica ▸ Pulizia", "…Modifica ▸ Pulizia");
  eq(at(en, "colours"), "Preferences ▸ Colours · the Space's Colours ▾", "Colours… → Preferences");
  eq(at(en, "vocabularies"), "Preferences ▸ Vocabularies · the Inspector's values", "Vocabularies… → Preferences");
  eq(at(en, "extensions"), "Preferences ▸ Extensions", "Extensions… → Preferences");
  eq(at(en, "georef"), "File", "Georeferencing… → File");
  eq(at(en, "console"), "Window", "Python console… → Window");
  eq(at(it, "console"), "Finestra", "…Finestra");
  eq(at(en, "exportSvg"), "File ▸ Export", "a command of a sub-menu: its path");
  eq(at(catalog("mac", "en"), "settings"), "EMStudio", "Mac: Settings in the system's EMStudio menu");
  eq(at(en, "settingsHelp"), "Help", "web: Settings in Help");
  ok(!en.some((e) => e.id === "quitFile"), "web: Quit is not offered (the browser closes its tab)");
  ok(catalog("win", "en").some((e) => e.id === "quitFile"), "Windows: Quit is offered");
}

// ── 2 · English, Italian, synonyms, keys ────────────────────────────────────
{
  const en = catalog("mac", "en"), it = catalog("mac", "it");
  const first = (es, q) => M.searchCommands(es, q, 5)[0]?.id;
  eq(first(it, "cronologia"), "chronology", "«cronologia» → Verifica la cronologia…");
  eq(first(en, "chronology"), "chronology", "«chronology» → Check the chronology…");
  eq(first(en, "verifica crono"), "chronology", "Italian words in the English interface");
  eq(first(it, "check the chron"), "chronology", "English words in the Italian interface");
  eq(first(it, "colori"), "colours", "«colori» → Colori…");
  eq(first(en, "vocab"), "vocabularies", "«vocab» → Vocabularies…");
  eq(first(it, "console"), "console", "«console» → Console Python…");
  eq(first(en, "python console"), "console", "«python console» → Python console…");
  eq(first(it, "grafie"), "uniformSpellings", "«grafie» → Uniforma le grafie…");
  eq(first(en, "stratiminer"), "stratiminer", "«stratiminer» → StratiMiner");
  eq(first(it, "dosco"), "doorDosco", "«dosco» → Leggi come DosCo…");
  eq(first(en, "add node"), "addMenu", "«add node» → Add node…");
  eq(first(it, "georeferenz"), "georef", "«georeferenz» → Georeferenziazione…");
  eq(first(en, "salva"), "save", "«salva» (Italian) → Save");
  eq(first(it, "save as"), "saveAs", "«save as» (English) → Salva con nome…");
  // the synonym «Tools»: every command that was in the menu Tools answers
  for (const [es, q] of [[en, "tools"], [it, "strumenti"], [it, "tools"]]) {
    const got = new Set(M.searchCommands(es, q, 60).map((e) => e.id));
    eq(Object.values(TOOLS_BEFORE).filter((id) => !got.has(id)), [], `«${q}» finds every command that was in Tools`);
  }
  eq(M.searchCommands(en, "zzqx-nothing").length, 0, "a query nothing answers: no entry");
  eq(M.searchCommands(en, "").length, Math.min(50, en.length), "an empty query: everything (the table's order)");
  // keys
  const keys = (es, id) => es.find((e) => e.id === id)?.keys;
  eq(keys(en, "saveAs"), "⇧⌘S", "the keys of a command, as drawn on the Mac");
  eq(keys(catalog("win", "en"), "saveAs"), "Ctrl+Shift+S", "…on Windows");
  eq(keys(en, "commandSearch"), "⌘K", "Search commands… says ⌘K");
  eq(keys(catalog("linux", "en"), "commandSearch"), "Ctrl+K", "…Ctrl+K off the Mac");
  // accents and ellipsis do not matter
  eq(M.norm("Verifica la cronologia…"), "verifica la cronologia", "norm: the ellipsis out");
  eq(M.norm("Proprietà ▸ Città"), "proprieta citta", "norm: no accents, no arrows");
}

// ── 3 · the plugins' commands come in by themselves ─────────────────────────
{
  M.setSlotRuns("menu.file.import@1", [{ kind: "run", id: "plugin:geofisica/read_gpr", text: "GPR stack (folder)…", badge: "dev" }]);
  const es = catalog("web", "en", [{ id: "plugin:geofisica/slice", label: "Slice the GPR stack…", where: "Extension «Geofisica» · Preferences ▸ Extensions", syn: ["Geofisica"] }]);
  const gpr = M.searchCommands(es, "gpr", 10).map((e) => e.id);
  ok(gpr.includes("plugin:geofisica/read_gpr"), "a plugin's row of File ▸ Import is found");
  eq(es.find((e) => e.id === "plugin:geofisica/read_gpr")?.where, "File ▸ Import", "…and says where it is");
  ok(gpr.includes("plugin:geofisica/slice"), "a plugin's command with no menu (Tools ▸ Plugins before) is found");
  ok(M.searchCommands(es, "geofisica", 10).some((e) => e.id === "plugin:geofisica/slice"), "…by its extension's name");
  M.setSlotRuns("menu.file.import@1", []);
  ok(!catalog("web").some((e) => e.id === "plugin:geofisica/read_gpr"), "a plugin removed: its row is gone");
}

// ── 4 · the keys: F3 and ⌘K / Ctrl+K are no one else's ───────────────────────
{
  const accels = [];
  const walk = (rs) => rs.forEach((r) => { if (r.kind === "cmd" && r.accel) accels.push([r.id, r.accel]); if (r.kind === "sub") walk(r.rows); });
  M.MENUS.forEach((m) => walk(m.rows));
  eq(accels.filter(([, a]) => a === "CmdOrCtrl+K").map(([id]) => id), ["commandSearch"], "CmdOrCtrl+K: only the command search");
  const dup = accels.map(([, a]) => a).filter((a, i, all) => all.indexOf(a) !== i);
  // About/Settings rows of two menus press one button with one key: the same command
  eq(dup.filter((a) => a !== "CmdOrCtrl+,"), [], "no accelerator of the table bound to two commands");
  const km = M.KEYMAP.filter((r) => r.scope === "app");
  const keyParts = km.flatMap((r) => r.keys.split(" · ").map((k) => [r.id, k]));
  eq(keyParts.filter(([, k]) => k === "F3" || k === "⌘K").map(([id]) => id), ["commandSearch", "commandSearch"], "F3 and ⌘K in the key map: the command search alone");
  const appKeys = keyParts.filter(([, k]) => !k.startsWith("@")).map(([, k]) => k);
  eq(appKeys.filter((k, i) => appKeys.indexOf(k) !== i), [], "no key of the app scope listed twice");
  ok(M.isSearchKey({ key: "F3", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }), "F3 is the search key");
  ok(!M.isSearchKey({ key: "F3", metaKey: false, ctrlKey: false, altKey: false, shiftKey: true }), "⇧F3 is not");
  const src = readFileSync(`${SRC}main.ts`, "utf8");
  eq((src.match(/"F3"/g) ?? []).length, 0, "main.ts binds F3 only through isSearchKey");
}

// ── 5 · the sources: Tools is gone, the texts are in i18n ───────────────────
{
  const html = readFileSync(`${ROOT}index.html`, "utf8");
  ok(!/id="dd-tools"/.test(html), "index.html: no menu Tools");
  ok(/id="dd-window"/.test(html), "index.html: a menu Window");
  ok(/data-settings-tab="colours"/.test(html) && /data-settings-tab="vocabularies"/.test(html), "the Preferences have Colours and Vocabularies");
  ok(/id="set-ext-plugins"/.test(html), "the plugins' commands in Preferences ▸ Extensions");
  const keysUsed = ["cmds.menu", "cmds.title", "cmds.placeholder", "cmds.foot", "cmds.none", "cmds.notNow", "hdr.addMenu", "hdr.chronology",
    "chr.pillCount", "chr.pillTip", "settings.tab.colours", "settings.tab.vocabularies", "vt.editVocab", "door.choiceStratiminer",
    "menu.workspaces", "menu.graphCleanUp", "menu.areaHeaders", "keys.commandSearch"];
  eq(keysUsed.filter((k) => !EN[k] || !IT[k]), [], "the new words in English and Italian");
  const homes = [];
  const walk = (rs) => rs.forEach((r) => { if (r.kind === "cmd" && r.home) homes.push(r.home); if (r.kind === "sub") walk(r.rows); });
  M.MENUS.forEach((m) => walk(m.rows));
  eq(homes.filter((k) => !EN[k] || !IT[k]), [], "every home of a command drawn by no menu, in English and Italian");
}
// ── 6 · the Inspector's picker: «Edit vocabulary…» (Preferences ▸ Vocabularies) ──
{
  const { parseHTML } = await import("linkedom");
  const { document: d } = parseHTML("<!doctype html><html><body></body></html>");
  const vb = await esbuild.build({ stdin: { contents: `export { valueTermEl } from "./vocab-ui";`, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, logLevel: "silent" });
  const V = await import("data:text/javascript;base64," + Buffer.from(vb.outputFiles[0].text).toString("base64"));
  const host = { t: fill(IT), lang: () => "it", file: () => null };
  const state = { label: () => ({ text: "calcare", lang: "it", vocabulary: "aat" }) };
  let opened = 0, linked = 0;
  const node = { id: "P1", node_type: "property", name: "materiale", data: { value: "calcare" } };
  const row = V.valueTermEl(d, host, state, node, true, () => { linked++; }, () => { opened++; });
  const edit = row?.querySelector("[data-vt-edit]");
  eq(edit?.textContent, "Modifica vocabolario…", "a controlled value: «Modifica vocabolario…» beside «Collega a vocabolario…»");
  edit?.dispatchEvent(new d.defaultView.Event("click"));
  eq([opened, linked], [1, 0], "…it opens the vocabularies, not the link");
  const none = V.valueTermEl(d, host, state, node, true, () => {});
  ok(!none?.querySelector("[data-vt-edit]"), "without the door (an older caller): no button");
}
console.log(`check-command-search (node): ${checks} checks passed`);

// ── 6 · the page ────────────────────────────────────────────────────────────
const { bench } = await import("./page-bench.mjs");
const B = await bench("check-command-search (page)");
if (B) {
  let pageChecks = 0;
  const pok = (c, w) => { assert.ok(c, w); pageChecks++; };
  const peq = (g, w, what) => { assert.deepEqual(g, w, `${what} — got ${JSON.stringify(g)}`); pageChecks++; };
  try {
    const { page, errors } = await B.open();
    await page.waitForTimeout(1500);
    // the menus
    const menus = await page.evaluate(() => [...document.querySelectorAll("#toolbar > .dropdown")].filter((d) => !d.classList.contains("hidden")).map((d) => d.id));
    peq(menus, ["dd-file", "dd-edit", "dd-window", "dd-help"], "page: File, Edit, Window, Help");
    // F3 → the search; «cronologia» → Enter → the chronology window
    await page.mouse.click(5, 5);
    await page.keyboard.press("F3");
    await page.waitForSelector("#cmd-search", { timeout: 5000 });
    pok(await page.evaluate(() => document.activeElement?.classList.contains("cmd-search-q")), "F3 opens the search, the field has the focus");
    await page.keyboard.type("cronologia");
    await page.waitForTimeout(150);
    const top = await page.evaluate(() => { const r = document.querySelector("#cmd-search .cmd-search-row"); return r && { id: r.dataset.cmdSearch, where: r.querySelector("[data-cmd-where]")?.textContent }; });
    peq(top, { id: "chronology", where: "Intestazione della Matrix · il ▲ della barra di stato" }, "«cronologia»: Verifica la cronologia…, where it lives");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    pok(await page.evaluate(() => !document.getElementById("cmd-search") && window.__EM_DRAG__.wins().some((w) => w.type === "chronology")), "Enter: the search closes, the chronology window opens");
    // ⌘K / Ctrl+K, then Esc
    await page.mouse.click(5, 5);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
    await page.waitForSelector("#cmd-search", { timeout: 5000 });
    await page.keyboard.type("tools");
    await page.waitForTimeout(150);
    const tools = await page.evaluate(() => [...document.querySelectorAll("#cmd-search .cmd-search-row")].map((r) => r.dataset.cmdSearch));
    pok(["addMenu", "stratiminer", "uniformSpellings", "colours", "vocabularies", "extensions", "chronology", "doorDosco", "console", "georef"].every((id) => tools.includes(id)),
      `⌘K and «tools»: every command that was in Tools (${tools.length})`);
    await page.keyboard.press("Escape");
    pok(await page.evaluate(() => !document.getElementById("cmd-search")), "Esc closes the search");
    // F3 again on an open search closes it
    await page.keyboard.press("F3");
    await page.waitForSelector("#cmd-search");
    await page.keyboard.press("F3");
    pok(await page.evaluate(() => !document.getElementById("cmd-search")), "a second F3 closes it");
    // the Matrix's header: Add ▾ and Chronology
    const hdr = await page.evaluate(() => {
      const area = [...document.querySelectorAll(".tile-area")].find((a) => a.querySelector('[data-act="add-menu"]'));
      return { add: !!area?.querySelector('[data-act="add-menu"]'), chr: area?.querySelector('[data-act="chronology"]')?.textContent ?? null };
    });
    pok(hdr.add && /^Cronologia/.test(hdr.chr ?? ""), `the Matrix's header: «Aggiungi ▾» and «Cronologia» (${hdr.chr})`);
    await page.evaluate(() => document.querySelector('[data-act="add-menu"]')?.click());
    await page.waitForTimeout(300);
    pok(await page.evaluate(() => !!document.querySelector(".addm")), "«Aggiungi ▾» opens the add menu (as ⇧A)");
    await page.keyboard.press("Escape");
    // the pill's ▲ of the chronology, when there is one
    const pill = await page.evaluate(() => ({ chr: !!document.querySelector("#footer-warnings [data-chr-open]"), text: document.getElementById("footer-warnings")?.textContent }));
    if (pill.chr) {
      await page.evaluate(() => window.__EM_DRAG__.wins().filter((w) => w.type === "chronology").forEach((w) => window.__EM_DRAG__.closeWin?.(w.id)));
      await page.evaluate(() => document.querySelector("#footer-warnings [data-chr-open]").click());
      await page.waitForTimeout(400);
      pok(await page.evaluate(() => window.__EM_DRAG__.wins().some((w) => w.type === "chronology")), `the ▲ of the chronology opens it (${pill.text})`);
    } else console.log(`  (the document has no chronology warning: «${pill.text}»)`);
    // Window and Edit
    await page.click("#dd-window .dd-toggle");
    const win = await page.evaluate(() => [...document.querySelectorAll("#dd-window .dd-menu > *")].map((n) => n.dataset.cmd ?? n.dataset.sub ?? n.className));
    peq(win.filter((x) => x !== "dd-sep"), ["workspaces", "scripting", "console", "detachWindow", "returnWindows", "maximizeArea", "areaHeaders"], "Window's items");
    await page.click('#dd-window .dd-sub[data-sub="workspaces"] .dd-sub-toggle');
    const wss = await page.evaluate(() => [...document.querySelectorAll('#dd-window [data-sub="workspaces"] .dd-dyn')].map((b) => b.dataset.dyn));
    pok(wss.includes("scripting") && wss.length >= 5, `Window ▸ Workspaces lists the workspaces (${wss.length})`);
    await page.evaluate(() => document.querySelector('#dd-window [data-sub="workspaces"] .dd-dyn[data-dyn="scripting"]')?.click());
    await page.waitForTimeout(800);
    pok(await page.evaluate(() => document.querySelector("#workspace-bar .ws-tab.active, #workspace-bar .ws-tab[aria-selected=true]")?.dataset.ws === "scripting"), "a workspace chosen there comes to the front");
    await page.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="stratigraphy"], #workspace-bar .ws-tab')?.click());
    await page.waitForTimeout(800);
    // area headers off and back
    await page.evaluate(() => document.getElementById("btn-area-headers").click());
    pok(await page.evaluate(() => getComputedStyle(document.querySelector(".tile-area > .tile-bar")).display === "none"), "Window ▸ Area headers hides them");
    await page.evaluate(() => document.getElementById("btn-area-headers").click());
    pok(await page.evaluate(() => getComputedStyle(document.querySelector(".tile-area > .tile-bar")).display !== "none"), "…and brings them back");
    // the Preferences: Colours, Vocabularies (drawn), Extensions with the plugins' place
    await page.evaluate(() => document.getElementById("btn-tool-vocabularies").click());
    await page.waitForTimeout(800);
    const prefs = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll("#settings-tabs [data-tab-target]")].map((b) => b.dataset.tabTarget),
      active: document.querySelector("#settings-tabs .active")?.dataset.tabTarget,
      drawn: !!document.querySelector("#set-vocabularies .voc-root"),
    }));
    pok(prefs.tabs.includes("colours") && prefs.tabs.includes("vocabularies") && prefs.tabs.includes("extensions"), `Preferences: Colours, Vocabularies, Extensions (${prefs.tabs.join(",")})`);
    peq([prefs.active, prefs.drawn], ["vocabularies", true], "Vocabularies… opens Preferences ▸ Vocabularies, drawn");
    await page.evaluate(() => document.querySelector('#settings-tabs [data-tab-target="colours"]').click());
    pok(await page.evaluate(() => (document.getElementById("set-colours-space")?.textContent ?? "").length > 0), "Preferences ▸ Colours says which Space");
    await page.keyboard.press("Escape");
    await page.evaluate(() => { const m = document.getElementById("settings-modal"); if (m && !m.classList.contains("hidden")) document.querySelector("#settings-modal [data-close], #settings-cancel, #settings-close")?.click(); });
    // Bring in…: StratiMiner is a choice
    await page.evaluate(() => document.getElementById("btn-bring-in").click());
    await page.waitForSelector('[data-app-dialog="bring-in"], .bring-in', { timeout: 5000 });
    const choices = await page.evaluate(() => [...document.querySelectorAll(".bring-in-choice")].map((c) => c.dataset.choice));
    peq(choices, ["files", "folder", "dosco", "stratiminer"], "File ▸ Bring in…: files, folder, DosCo, StratiMiner");
    await page.keyboard.press("Escape");
    pok(errors.length === 0, `no page error (${errors.join(" | ")})`);
    console.log(`check-command-search (page): ${pageChecks} checks passed`);
  } finally {
    await B.close();
  }
}
