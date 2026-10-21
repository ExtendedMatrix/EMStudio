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
      if (id !== "openRecent") out.push(...nativeOutline(it.o.items, `${prefix}${id}/`));
    } else out.push(`${prefix}${it.o.id}`);
  }
  return out;
}

const EN = readFileSync(`${SRC}i18n.ts`, "utf8").split("const IT: Dict")[0];
const MAIN = readFileSync(`${SRC}main.ts`, "utf8");
const FILE_ORDER = ["new", "open", "openRecent▸", "openReplace", "close", "—",
  "save", "saveAs", "saveAll", "pin", "—",
  "import▸", "import/importGraphml", "import/importMapping",
  "export▸", "export/exportSvg", "export/exportTtl", "integrate", "relocate", "collect", "—",
  "createRoom", "bringIntoRoom"];

for (const platform of ["web", "mac", "win", "linux"]) {
  // the page
  doc.body.innerHTML = parseHTML(html).document.body.innerHTML;
  M.buildPageMenus(platform, { recent: () => [] });
  const page = {};
  for (const id of ["file", "edit", "help"]) {
    const dd = doc.getElementById(`dd-${id}`);
    page[id] = dd && !dd.classList.contains("hidden") ? pageOutline(dd.querySelector(".dd-menu")) : [];
  }
  // the system
  M.built.bar = null;
  const installed = await M.installNativeMenu(platform);
  const native = {};
  for (const sub of M.built.bar?.o.items ?? []) native[sub.o.id.replace(/^menu-/, "")] = nativeOutline(sub.o.items);

  // the table and the page agree (the page draws what the table says)
  for (const id of ["file", "edit", "help"]) {
    const menu = M.MENUS.find((m) => m.id === id);
    eq(page[id], M.outline(M.menuRows(menu, platform, "internal")), `${platform}: page ${id} = the table's rows`);
  }
  const fileWant = platform === "win" || platform === "linux" ? [...FILE_ORDER, "—", "quitFile"] : FILE_ORDER;
  eq(page.file, fileWant, `${platform}: File in the MICRO's order`);

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
  eq(page.edit, ["undo", "redo"], "mac: page Edit = the document's undo");
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

// every command has an English label and a handler in main.ts
const all = [];
const collect = (rs) => rs.forEach((r) => { if (r.kind === "cmd") all.push(r); if (r.kind === "sub") { collect(r.rows); all.push(r); } });
M.MENUS.forEach((m) => { collect(m.rows); all.push(m); });
for (const r of all) ok(EN.includes(`"${r.label}":`), `label ${r.label} has an English value`);
for (const r of all.filter((x) => x.kind === "cmd")) {
  ok(MAIN.includes(`getElementById("${r.button}")`), `${r.button} has a handler in main.ts`);
}

console.log(`check-menu-table: ${checks} checks passed`);
