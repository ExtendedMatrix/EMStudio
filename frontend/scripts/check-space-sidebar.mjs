// MICRO-SEG19 · THE SPACE'S SIDEBAR OF TABS (N) AND ITS TOOLBAR (T), as Blender's.
//
//   node scripts/check-space-sidebar.mjs
//
// What is defended (E.D., 21 Nov 2026: the Geofisica panel squeezed into a
// column between the Outliner and the view — «Geop stack / Folder / What it is»):
//
//   · the sidebar's tabs: Item, Tool, View, then one per tab the extensions'
//     panels name; a panel that names none goes in a tab with its extension's
//     name; two extensions naming the same tab share it; a panel of region
//     «window» (or the old place «window») is not in the sidebar;
//   · the old places right / left / below are the sidebar now: no panel is a
//     column between the areas any more;
//   · the tab chosen is remembered per workspace and falls back to «View» when
//     its extension is gone; a script finds a tab by id or by its words;
//   · the toolbar: Select and 3D cursor (the Space's own tools — no invented
//     measure or annotation), then the extensions' tools; the active one is an
//     extension's tool armed, else the core's; a tool found by id or command;
//   · a narrow window: the sidebar over the view;
//   · the wiring: main.ts draws the tabs, the toolbar, T and Esc, the API ops,
//     opens a panel in the sidebar; texts in i18n.ts EN + IT.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as S from "./space-sidebar"; export * as W from "./extensions-where"; export * as N from "./space-nav";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { S, W, N } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// ── the tabs ─────────────────────────────────────────────────────────────────
const geo = { plugin: "geofisica", id: "import", name: "geofisica/import", place: "right" };          // the manifest of today
const names = { geofisica: "Geofisica", stat: "Statuaria", other: "Altro" };
const nameOf = (p) => names[p] ?? null;
let tabs = S.sidebarTabs([geo], "it", nameOf);
eq(tabs.map((t) => t.id), ["item", "tool", "view", "ext:geofisica"], "Item, Tool, View, then the extension's tab");
eq(tabs[3], { id: "ext:geofisica", kind: "extension", label: "Geofisica", extensions: ["Geofisica"], panels: ["geofisica/import"] },
  "a panel that names no tab: the tab is the extension's name");
for (const place of ["right", "left", "below", undefined]) eq(S.panelRegion({ place }), "sidebar", `the old place ${place}: the sidebar (never a column)`);
eq(S.panelRegion({ place: "window" }), "window", "the old place «window»: a window of its own");
eq(S.panelRegion({ place: "window", region: "sidebar" }), "sidebar", "region wins over place");
tabs = S.sidebarTabs([
  geo,
  { plugin: "stat", id: "a", name: "stat/a", tab: { en: "Measures", it: "Misure" } },
  { plugin: "other", id: "b", name: "other/b", tab: "Misure" },
  { plugin: "other", id: "w", name: "other/w", region: "window" },
  { plugin: "other", id: "m", name: "other/m", space: "matrix" },
], "it", nameOf);
eq(tabs.map((t) => t.id), ["item", "tool", "view", "ext:geofisica", "ext:misure"], "a tab named by two extensions is one; a window is not a tab");
eq(tabs[4].panels, ["stat/a", "other/b"], "…its panels in their order");
eq(tabs[4].extensions, ["Statuaria", "Altro"], "…and who brings them");
eq(S.sidebarTabs([{ plugin: "stat", id: "a", name: "stat/a", tab: { en: "Measures", it: "Misure" } }], "en", nameOf)[3].label, "Measures", "the tab's words in the page's language");
eq(S.tabOfPanel(tabs, "other/b"), "ext:misure", "the tab of a panel");
eq(S.tabOfPanel(tabs, "other/w"), null, "a window's panel has no tab");

// ── the tab remembered per workspace ────────────────────────────────────────
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
eq(S.chosenTab(tabs, S.loadTabs().space), "view", "the first time: «View» (the panel it was)");
S.rememberTab("space", "ext:geofisica");
S.rememberTab("sheets", "item");
eq(S.loadTabs(), { space: "ext:geofisica", sheets: "item" }, "remembered per workspace");
eq(S.chosenTab(tabs, S.loadTabs().space), "ext:geofisica", "the Space's workspace: Geofisica");
eq(S.chosenTab(S.sidebarTabs([], "it", nameOf), S.loadTabs().space), "view", "the extension gone: back to «View»");
eq(S.findTab(tabs, "Geofisica"), "ext:geofisica", "a tab by its words");
eq(S.findTab(tabs, "VIEW"), "view", "a core tab by its id, in any case");
eq(S.findTab(tabs, "Vista", (id) => ({ item: "Elemento", tool: "Strumento", view: "Vista" })[id]), "view", "…or by its words in the page's language");
eq(S.findTab(tabs, "nowhere"), null, "no such tab");

// ── the toolbar ──────────────────────────────────────────────────────────────
eq([...S.CORE_TOOLS], ["select", "cursor"], "the Space's own tools: those that exist");
const ext = [{ id: "plugin:geofisica/geofisica.trace.point", glyph: "◉", title: "Anomalia puntuale su fetta — Geofisica (un punto)", off: null },
  { id: "plugin:geofisica/geofisica.trace.area", glyph: "▱", title: "Anomalia areale", off: "Nessuna fetta" }];
let bar = S.toolbarEntries({ core: "select", coreTitle: (id) => id, extensions: ext, armed: null });
eq(bar.map((e) => [e.id, e.group, e.active]), [["select", "core", true], ["cursor", "core", false],
  ["plugin:geofisica/geofisica.trace.point", "extension", false], ["plugin:geofisica/geofisica.trace.area", "extension", false]], "core first, then the extensions'");
bar = S.toolbarEntries({ core: "cursor", coreTitle: (id) => id, extensions: ext, armed: "plugin:geofisica/geofisica.trace.point" });
eq(bar.filter((e) => e.active).map((e) => e.id), ["plugin:geofisica/geofisica.trace.point"], "an extension's tool armed is the active one");
bar = S.toolbarEntries({ core: "cursor", coreTitle: (id) => id, extensions: ext, armed: "plugin:geofisica/geofisica.trace.area" });
eq(bar.filter((e) => e.active).map((e) => e.id), ["cursor"], "a tool that cannot be used is never the active one");
eq(S.findTool(bar, "geofisica.trace.point"), "plugin:geofisica/geofisica.trace.point", "a tool by its command");
eq(S.findTool(bar, "cursor"), "cursor", "…or its id");
eq(S.findTool(bar, "measure"), null, "no measure in the Space");
// MICRO-PX1 · the register's core tools («Muro da pianta») after Select and 3D cursor, in the core's group
const reg = [{ id: "wall", glyph: "▥", title: "Wall from plan", off: null }];
bar = S.toolbarEntries({ core: "wall", coreTitle: (id) => id, registered: reg, extensions: ext, armed: null });
eq(bar.map((e) => [e.id, e.group]).slice(0, 3), [["select", "core"], ["cursor", "core"], ["wall", "core"]], "the wall after Select and 3D cursor, in the core's group");
eq(bar.filter((e) => e.active).map((e) => e.id), ["wall"], "…the active one when chosen");
bar = S.toolbarEntries({ core: "wall", coreTitle: (id) => id, extensions: ext, armed: null });
eq(bar.filter((e) => e.active).map((e) => e.id), ["select"], "a core tool no longer registered: back to Select");
bar = S.toolbarEntries({ core: "wall", coreTitle: (id) => id, registered: reg, extensions: ext, armed: "plugin:geofisica/geofisica.trace.point" });
eq(bar.filter((e) => e.active).map((e) => e.id), ["plugin:geofisica/geofisica.trace.point"], "an extension's tool armed wins over the core's");

// ── a narrow window ──────────────────────────────────────────────────────────
ok(S.sidebarOverlays(400, 250) && S.sidebarOverlays(560, 180), "a telephone: the sidebar over the view");
ok(!S.sidebarOverlays(1500, 250) && !S.sidebarOverlays(0, 250), "a desktop: beside it");

// ── the «where you find it» of the Extensions page ──────────────────────────
const places = W.whereOf({ commands: [], panels: [{ id: "import", label: { en: "Geophysical stack", it: "Pila geofisica" }, place: "right" }],
  vocabularies: [], codeActive: true, dataActive: true, lang: "it", pluginId: "geofisica", extensionName: "Geofisica" });
eq([places[0].place, places[0].tab], ["sidebar", "Geofisica"], "the page says: Space ▸ sidebar ▸ tab «Geofisica»");
eq(W.whereOf({ commands: [], panels: [{ id: "x", label: "X", region: "window" }], vocabularies: [], codeActive: true, dataActive: true, lang: "it" })[0].place,
  "window", "…or a window of its own");

// ── T and N ──────────────────────────────────────────────────────────────────
const k = (key) => N.spaceKeyAction({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }, true);
eq([k("t"), k("T"), k("n"), k("N")], ["toolbar", "toolbar", "sidebar", "sidebar"], "T the toolbar, N the sidebar");

// ── the wiring ───────────────────────────────────────────────────────────────
const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const em = readFileSync(new URL("../../tools/em_py.py", import.meta.url), "utf8");
ok(/role", "tablist"/.test(main) && /np-vtab/.test(main) && /setSidebarTab\(tb\.id\)/.test(main), "the vertical tabs, a click chooses one");
ok(/if \(tabNow === "tool"\) \{ renderToolTab/.test(main) && /renderExtensionTab\(body, extTab\)/.test(main) && /if \(tabNow === "item"\)/.test(main), "Item, Tool and an extension's tab drawn");
ok(/if \(panelRegion\(panel\) === "sidebar"\) \{ openPanelInSidebar\(panel\); return; \}/.test(main), "a panel opens in the sidebar");
ok(!/splitWindow\(anchor\.id, "row", activeWorkspace\(\), 0\.3, "a"\)/.test(main) && !/panel\.place === "below" \? splitWindow/.test(main), "…never as a column left, right or below");
ok(/retirePanelColumns\(\)/.test(main), "an old column closed");
ok(/a === "toolbar"/.test(main) && /a === "cancel"/.test(main) && /spaceCoreTools\.get\(win\.id\) !== "cursor"/.test(main), "T, Esc, the 3D cursor's click");
for (const op of ["space.sidebar.tabs", "space.sidebar.active", "space.sidebar.open", "space.sidebar.close", "space.tools", "space.tools.active", "space.tools.activate"]) {
  ok(main.includes(`case "${op}"`), `the page answers ${op}`);
  ok(em.includes(`"${op}"`), `em.app.space asks ${op}`);
}
ok(/self\.sidebar = EMStudioSidebar\(run\)/.test(em) && /self\.tools = EMStudioTools\(run\)/.test(em), "em.app.space.sidebar, em.app.space.tools");
for (const key of ["sb.tab.item", "sb.tab.tool", "sb.tab.view", "sb.tabs", "sb.extTabTitle", "tb.label", "tb.select", "tb.cursor", "tb.extOff", "tt.active",
  "tt.selectHow", "tt.cursorHow", "tt.back", "py.noTab", "py.noTool", "ext.w.panel.sidebar", "keys.s3toolbar"]) {
  eq((i18n.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")) ?? []).length, 2, `${key}: EN and IT`);
}
ok(/\.scn-row\.np-over > \.scn-npanel \{ position: absolute/.test(css) && /writing-mode: vertical-rl/.test(css), "the vertical tabs, the overlay on a narrow window");
ok(!/#[0-9a-f]{3,6}/i.test(css.slice(css.indexOf("MICRO-SEG19 · the toolbar (T)"), css.indexOf("MICRO-SEG19 · the toolbar (T)") + 1600)), "the toolbar's colours are the design system's tokens");

console.log(`check-space-sidebar: ${checks} checks passed`);
