// MICRO-DOVE-CHI-MENU p.1 · ONE TABLE, TWO SURFACES — the page's menus and the
// system's menu bar are generated from `src/menu-table.ts`, and this compares
// what each surface REALLY gets, per platform.
//
//   node scripts/check-menu-table.mjs
//
// The page side is drawn by `buildPageMenus` into `index.html` (linkedom); the
// system side is drawn by `installNativeMenu` against a recorder that stands in
// for `@tauri-apps/api/menu` (same calls, no window). Then:
//   · File and Help hold the same commands, in the same order, on both surfaces
//     of the Mac desktop; the web, Windows and Linux get no system menu at all;
//   · About / Settings / Check for updates are in ONE place per platform (the
//     system's EMStudio menu on the Mac, the page's Help elsewhere), never both;
//   · File's order is the MICRO's, Quit closes File on Windows and Linux only;
//   · every row has an English label and a handler in main.ts.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = new URL("../", import.meta.url).pathname;

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

// the recorder: Tauri's menu classes, keeping the tree they are given
const fakeMenu = `
  export const built = { bar: null };
  class Item { constructor(o, kind) { this.o = o; this.kind = kind; } async setEnabled(v) { this.o.enabled = v; }
    async items() { return this.o.items ?? []; } async remove(i) { this.o.items = this.o.items.filter((x) => x !== i); }
    async append(i) { (this.o.items ??= []).push(i); } async setAsWindowsMenuForNSApp() {} async setAsHelpMenuForNSApp() {} }
  export const MenuItem = { new: async (o) => new Item(o, "item") };
  export const PredefinedMenuItem = { new: async (o) => new Item(o, "os") };
  export const Submenu = { new: async (o) => new Item(o, "sub") };
  export const CheckMenuItem = { new: async (o) => { const i = new Item(o, "check"); i.setChecked = async (v) => { o.checked = v; }; return i; } };
  export const Menu = { new: async (o) => { const m = new Item(o, "bar"); m.setAsAppMenu = async () => { built.bar = m; return null; }; return m; } };
`;
const bundle = await esbuild.build({
  stdin: {
    contents: `export * from "./menu-table"; export * from "./menu-ui"; export { built } from "@tauri-apps/api/menu";`,
    resolveDir: SRC, loader: "ts",
  },
  bundle: true, format: "esm", write: false,
  plugins: [{ name: "fake-tauri-menu", setup(b) {
    b.onResolve({ filter: /^@tauri-apps\/api\/menu$/ }, () => ({ path: "fake", namespace: "fake" }));
    b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({ contents: fakeMenu, loader: "js" }));
  } }],
});
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const html = readFileSync(`${ROOT}index.html`, "utf8");
const { window: win, document: doc, MutationObserver: MO } = parseHTML(html);
globalThis.window = win; globalThis.document = doc;
globalThis.MutationObserver = MO ?? class { observe() {} disconnect() {} };
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

/** the page's menu as drawn: `id`, `—`, `sub▸` + `sub/child` (like `outline`) */
function pageOutline(menuEl, prefix = "") {
  const out = [];
  for (const node of menuEl.children) {
    if (node.classList.contains("dd-sep")) out.push(`${prefix}—`);
    else if (node.classList.contains("dd-sub")) {
      const id = node.dataset.sub;
      out.push(`${prefix}${id}▸`);
      out.push(...pageOutline(node.querySelector(".dd-sub-menu"), `${prefix}${id}/`));
    } else if (node.tagName === "BUTTON") out.push(`${prefix}${node.dataset.cmd}`);
    else if (node.classList.contains("dd-opt")) out.push(`${prefix}${node.dataset.opt}`);
  }
  return out;
}
/** the system's menu as recorded */
function nativeOutline(items, prefix = "") {
  const out = [];
  for (const it of items) {
    if (it.kind === "os" && it.o.item === "Separator") out.push(`${prefix}—`);
    else if (it.kind === "os") out.push(`${prefix}os:${it.o.item}`);
    else if (it.kind === "sub") {
      const id = it.o.id.replace(/^sub-/, "");
      out.push(`${prefix}${id}▸`);
      if (id !== "openRecent" && id !== "workspaces") out.push(...nativeOutline(it.o.items, `${prefix}${id}/`));
    } else out.push(`${prefix}${it.o.id}`);   // an item, or a check item (an option)
  }
  return out;
}

const EN = readFileSync(`${SRC}i18n.ts`, "utf8").split("const IT: Dict")[0];
const MAIN = readFileSync(`${SRC}main.ts`, "utf8");
// MICRO-TIL003 (E.D., 20 Nov 2026) · File on Blender's model: 28 items → 18 in
// six groups. Create and open (Open's box under it) · save · bring in and out ·
// the files outside · the room · close.
const FILE_ORDER = ["new", "newProject", "open", "openReplaceBox", "openProject", "openRecent▸", "—",
  "save", "saveAs", "saveAll", "pin", "—",
  "bringIn", "integrate",
  "import▸", "import/importGraphml", "import/importMapping",
  "export▸", "export/exportSvg", "export/exportTtl", "export/composeFromGraph", "export/consolidate", "export/printSheets", "—",
  "externalData▸", "externalData/relocate", "externalData/collect", "externalData/revealDoc",
  "cleanUp▸", "cleanUp/cleanFile", "cleanUp/reorderProject", "—",
  // MICRO-SEG29 · Georeferencing… back in File (Tools went), with the room
  "georef", "room▸", "room/createRoom", "room/bringIntoRoom", "—",
  "close", "closeProject"];
/** the 18 entries of File's first level (Quit aside), counted as E.D. counted them */
const FIRST_LEVEL = FILE_ORDER.filter((x) => x !== "—" && !x.includes("/") && x !== "openReplaceBox");
eq(FIRST_LEVEL.length, 19, "File: 19 entries on the first level (were 28; 18 + Georeferencing…, MICRO-SEG29)");

/** MICRO-TIL003 · every command of the table BEFORE the reorder (HEAD 8b211e8):
 *  menu/id → button. None may be lost: each is still a row, its button exists,
 *  runCommand presses it. */
const BEFORE = {
  "app/about": "btn-help-about", "app/updates": "btn-help-updates", "app/settings": "btn-settings",
  "file/new": "btn-new", "file/newProject": "btn-new-project", "file/openProject": "btn-open-project",
  "file/reorderProject": "btn-reorder-project", "file/closeProject": "btn-close-project", "file/revealDoc": "btn-reveal-doc",
  "file/open": "btn-open", "file/openReplace": "btn-open-replace", "file/close": "btn-close-doc",
  "file/save": "btn-save", "file/saveAs": "btn-save-as", "file/saveAll": "btn-save-all", "file/pin": "btn-pin-version",
  "file/door": "btn-porta-dentro", "file/doorFolder": "btn-porta-dentro-cartella", "file/doorDosco": "btn-door-dosco",  // ALLOW-IT: element ids
  "file/georef": "btn-georef", "file/import/importGraphml": "btn-import-graphml", "file/import/importMapping": "btn-import-mapping",
  "file/export/exportSvg": "btn-svg", "file/export/exportTtl": "btn-ttl", "file/printSheets": "btn-print-sheets",
  "file/integrate": "btn-add-project", "file/relocate": "btn-relocate-files", "file/collect": "btn-collect-files",
  "file/cleanFile": "btn-clean-file", "file/createRoom": "btn-create-room", "file/bringIntoRoom": "btn-bring-into-room",
  "file/consolidate": "btn-consolidate", "file/composeFromGraph": "btn-compose-graph", "file/quitFile": "btn-quit",
  "edit/undo": "btn-undo", "edit/redo": "btn-redo",
  "help/workspaces": "btn-help-workspaces", "help/shortcuts": "btn-help-shortcuts", "help/legend": "btn-help-legend",
  "help/pythonApi": "btn-help-python-api", "help/aboutHelp": "btn-help-about", "help/settingsHelp": "btn-settings",
  "help/updatesHelp": "btn-help-updates",
};
/** where each moved command is now (menu/…/id), the rest stayed */
const MOVED = {
  "file/reorderProject": "file/cleanUp/reorderProject", "file/revealDoc": "file/externalData/revealDoc",
  "file/printSheets": "file/export/printSheets", "file/relocate": "file/externalData/relocate",
  "file/collect": "file/externalData/collect", "file/cleanFile": "file/cleanUp/cleanFile",
  "file/createRoom": "file/room/createRoom", "file/bringIntoRoom": "file/room/bringIntoRoom",
  "file/consolidate": "file/export/consolidate", "file/composeFromGraph": "file/export/composeFromGraph",
};
const AFTER = {};
{
  const walk = (rs, p) => rs.forEach((r) => { if (r.kind === "cmd") AFTER[`${p}${r.id}`] = r; if (r.kind === "sub") walk(r.rows, `${p}${r.id}/`); });
  M.MENUS.forEach((m) => walk(m.rows, `${m.id}/`));
}
for (const [path, button] of Object.entries(BEFORE)) {
  const now = AFTER[MOVED[path] ?? path];
  ok(now && now.button === button, `${path}: still a command (${MOVED[path] ?? path}) pressing ${button}`);
}
// the commands that only lost their item: their id, kept, presses the same button
for (const id of ["openReplace", "door", "doorFolder", "doorDosco"]) {
  eq(AFTER[`file/${id}`]?.only, [], `${id}: a command drawn nowhere (its window or box took the item)`);
}
// the one new command
eq(AFTER["file/bringIn"]?.button, "btn-bring-in", "File ▸ Bring in… is a command of its own");

for (const platform of ["web", "mac", "win", "linux"]) {
  // the page
  doc.body.innerHTML = parseHTML(html).document.body.innerHTML;
  M.buildPageMenus(platform, { recent: () => [] });
  const page = {};
  for (const id of ["file", "edit", "window", "help"]) {
    const dd = doc.getElementById(`dd-${id}`);
    page[id] = dd && !dd.classList.contains("hidden") ? pageOutline(dd.querySelector(".dd-menu")) : [];
  }
  // the system
  M.built.bar = null;
  const installed = await M.installNativeMenu(platform);
  const native = {};
  for (const sub of M.built.bar?.o.items ?? []) native[sub.o.id.replace(/^menu-/, "")] = nativeOutline(sub.o.items);

  // the table and the page agree (the page draws what the table says)
  for (const id of ["file", "edit", "window", "help"]) {
    const menu = M.MENUS.find((m) => m.id === id);
    eq(page[id], M.outline(M.menuRows(menu, platform, "internal")), `${platform}: page ${id} = the table's rows`);
  }
  const fileWant = platform === "win" || platform === "linux" ? [...FILE_ORDER, "—", "quitFile"] : FILE_ORDER;
  eq(page.file, fileWant, `${platform}: File in the MICRO's order`);
  // MICRO-SEG29 · the menu Tools is gone: File, Edit, Window, Help on every platform
  ok(!doc.getElementById("dd-tools"), `${platform}: no menu Tools`);
  eq([...doc.querySelectorAll("#toolbar > .dropdown")].filter((d) => !d.classList.contains("hidden")).map((d) => d.id),
     ["dd-file", "dd-edit", "dd-window", "dd-help"], `${platform}: the page's menus are File, Edit, Window, Help`);
  ok(doc.querySelector("#dd-file #btn-georef"), `${platform}: Georeferencing… in File`);
  eq(page.window, ["workspaces▸", "scripting", "console", "—", "detachWindow", "returnWindows", "—", "maximizeArea", "areaHeaders"],
     `${platform}: Window — the workspaces, the console, the detached windows, the areas`);
  eq(page.edit, ["undo", "redo", "—", "commandSearch", "—", "graphCleanUp▸", "graphCleanUp/uniformSpellings", "graphCleanUp/sortLanes"],
     `${platform}: Edit — undo, Search commands…, Clean up ▸ (Normalise spellings…)`);
  // every item Tools had is still a command, pressing the same button (the console's
  // and DosCo's second button aside: one command each now)
  const TOOLS_BEFORE = { addMenu: "btn-tool-add", stratiminer: "btn-tool-stratiminer", uniformSpellings: "btn-tool-uniform",
    colours: "btn-tool-colours", vocabularies: "btn-tool-vocabularies", extensions: "btn-tool-extensions",
    chronology: "btn-tool-chronology", doorDosco: "btn-door-dosco", console: "btn-tool-console", georef: "btn-georef" };
  for (const [id, button] of Object.entries(TOOLS_BEFORE)) {
    const b = doc.getElementById(button);
    let n = 0; const h = () => { n++; };
    b?.addEventListener("click", h);
    M.runCommand(id, { script: true });
    b?.removeEventListener("click", h);
    eq(n, 1, `${platform}: Tools' ${id} is the command ${id}, pressing ${button}`);
  }
  ok(!doc.getElementById("btn-door-dosco-tools"), `${platform}: Read as DosCo… has one button`);
  // every command of before has its button in the page (drawn, or in the hidden holder)
  for (const button of new Set(Object.values(BEFORE))) {
    if (button === "btn-quit" && !["win", "linux"].includes(platform)) continue;
    if (["btn-help-updates"].includes(button) && platform === "web") continue;
    ok(doc.querySelectorAll(`#${button}`).length >= 1, `${platform}: ${button} exists`);
  }
  for (const id of ["btn-open-replace", "btn-porta-dentro", "btn-porta-dentro-cartella", "btn-door-dosco"]) {  // ALLOW-IT: element ids
    ok(doc.getElementById(id)?.closest("#menu-commands"), `${platform}: ${id} waits in the hidden holder`);
  }
  // runCommand(id) presses the same button as before, for the moved ones too
  const pressed = [];
  for (const id of ["georef", "openReplace", "door", "doorFolder", "doorDosco", "relocate", "collect", "revealDoc", "cleanFile", "reorderProject",
    "createRoom", "bringIntoRoom", "consolidate", "composeFromGraph", "printSheets", "bringIn"]) {
    const row = Object.values(AFTER).find((r) => r.id === id);
    const b = doc.getElementById(row.button);
    let n = 0; const h = () => { n++; }; b.addEventListener("click", h);
    M.runCommand(id); b.removeEventListener("click", h);
    if (n === 1) pressed.push(id);
  }
  eq(pressed.length, 16, `${platform}: runCommand presses the button of every moved command — got ${pressed.length}`);
  // the box under Open: unticked, it ticks without closing the menu
  const box = doc.querySelector('#dd-file .dd-opt[data-opt="openReplaceBox"] input');
  ok(box && !box.checked && !M.optionOn("openReplaceBox"), `${platform}: Open's box, unticked`);

  if (platform !== "mac") {
    eq(installed, false, `${platform}: no system menu bar is drawn`);
    // About, Settings in Help; updates only on the desktop
    ok(page.help.includes("aboutHelp") && page.help.includes("settingsHelp"), `${platform}: About and Settings in Help`);
    eq(page.help.includes("updatesHelp"), platform !== "web", `${platform}: Check for updates only on the desktop`);
    ok(!page.edit.includes("settings"), `${platform}: Settings left Edit`);
    continue;
  }
  eq(installed, true, "mac: the system menu bar is drawn");
  eq(Object.keys(native), ["app", "file", "edit", "window", "help"], "mac: system menus in order");
  // SAME File and Help on both surfaces
  eq(native.file, page.file, "mac: system File = page File");
  eq(native.help, page.help, "mac: system Help = page Help");
  eq(native.app, ["about", "updates", "—", "settings", "—", "os:Services", "—",
    "os:Hide", "os:HideOthers", "os:ShowAll", "—", "os:Quit"], "mac: the EMStudio menu, macOS standard");
  for (const dup of ["aboutHelp", "settingsHelp", "updatesHelp"]) {
    ok(!page.help.includes(dup), `mac: ${dup} not doubled in Help`);
  }
  // the system's Edit is the OS's text editing; the page's undo stays in the page
  eq(native.edit, ["os:Undo", "os:Redo", "—", "os:Cut", "os:Copy", "os:Paste", "os:SelectAll"], "mac: system Edit = text editing");
  eq(native.window, [...page.window, "—", "os:Minimize", "os:Maximize", "os:Fullscreen"], "mac: system Window = page Window + the OS's three");
  // the hidden holder keeps the buttons the page does not draw
  for (const b of ["btn-settings", "btn-help-about", "btn-help-updates"]) {
    ok(doc.getElementById(b), `mac: ${b} exists (hidden holder) for the system item`);
  }
  // accelerators: what the item shows is what the system binds
  const acc = {};
  const walk = (items) => { for (const it of items) { if (it.kind === "item") acc[it.o.id] = it.o.accelerator; if (it.kind === "sub") walk(it.o.items); } };
  walk(M.built.bar.o.items);
  eq([acc.new, acc.open, acc.close, acc.save, acc.saveAs, acc.saveAll, acc.settings],
     ["CmdOrCtrl+N", "CmdOrCtrl+O", "CmdOrCtrl+W", "CmdOrCtrl+S", "CmdOrCtrl+Shift+S", "CmdOrCtrl+Alt+S", "CmdOrCtrl+,"],
     "mac: accelerators from the table");
}

// keys as drawn
const row = (id) => { let f = null; const w = (rs) => rs.forEach((r) => { if (r.id === id && r.kind === "cmd") f = r; if (r.kind === "sub") w(r.rows); }); M.MENUS.forEach((m) => w(m.rows)); return f; };
eq(M.keysFor(row("saveAs"), "mac"), "⇧⌘S", "⇧⌘S on the Mac");
eq(M.keysFor(row("saveAll"), "win"), "Ctrl+Alt+S", "Ctrl+Alt+S on Windows");
eq(M.keysFor(row("close"), "web"), "", "⌘W not shown on the web (the browser keeps it)");
// the key a press means
const key = (k, mods = {}) => ({ key: k, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, ...mods });
eq(M.commandForKey(key("s"), "mac"), "save", "⌘S → save");
eq(M.commandForKey(key("S", { shiftKey: true }), "mac"), "saveAs", "⇧⌘S → saveAs");
eq(M.commandForKey(key("s", { altKey: true }), "mac"), "saveAll", "⌥⌘S → saveAll");
eq(M.commandForKey(key(","), "mac"), "settings", "⌘, → settings (Mac: the system's menu)");
eq(M.commandForKey(key(","), "web"), "settingsHelp", "⌘, → settings (web: Help)");
eq(M.commandForKey(key("w"), "web"), null, "⌘W is the browser's on the web");
eq(M.commandForKey(key("w"), "mac"), "close", "⌘W → close on the desktop");
// MICRO-SEG29 · ⌘K / Ctrl+K: the command search, on every platform
eq(M.commandForKey(key("k"), "mac"), "commandSearch", "⌘K → the command search (Mac)");
eq(M.commandForKey(key("k"), "web"), "commandSearch", "⌘K → the command search (web)");
eq(M.commandForKey({ ...key("k"), metaKey: false, ctrlKey: true }, "win"), "commandSearch", "Ctrl+K → the command search (Windows)");

// every command has an English label and a handler in main.ts
const all = [];
const collect = (rs) => rs.forEach((r) => { if (r.kind === "cmd") all.push(r); if (r.kind === "sub") { collect(r.rows); all.push(r); } });
M.MENUS.forEach((m) => { collect(m.rows); all.push(m); });
for (const r of all) ok(EN.includes(`"${r.label}":`), `label ${r.label} has an English value`);
for (const r of all.filter((x) => x.kind === "cmd")) {
  ok(MAIN.includes(`getElementById("${r.button}")`), `${r.button} has a handler in main.ts`);
}

console.log(`check-menu-table: ${checks} checks passed`);
