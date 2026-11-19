/**
 * MICRO-DOVE-CHI-MENU p.1 · ONE TABLE OF COMMANDS, two surfaces.
 *
 * E.D. on the dev.50 desktop (19 Oct 2026) found three menus that looked alike
 * and did not agree: the page's File (twelve items), the system's File (New
 * Graph, Save, Save As, Close Window) and the system's EMStudio menu. The rule
 * since then: every command is a row here, and both the menu inside the page
 * (web and desktop) and the system's menu bar (desktop) are GENERATED from these
 * rows. A command that does not hold on a platform is not drawn there — never
 * drawn disabled, never kept as a second door.
 *
 * Pure: no DOM, no Tauri. `menu-ui.ts` draws the rows; `check-menu-table.mjs`
 * compares what the two surfaces get, per platform.
 */

/** Where the app runs. The web is one platform whatever the OS under it: the
 *  browser owns its own menu bar. */
export type Platform = "web" | "mac" | "win" | "linux";
/** The page's own menu bar, or the system's (only the macOS desktop draws one:
 *  measured in tauri 2.11.5, `enable_macos_default_menu` — Windows and Linux
 *  windows carry no menu bar, so the page's menu is the only one there). */
export type Surface = "internal" | "native";

export const DESKTOP: Platform[] = ["mac", "win", "linux"];

/** An OS item drawn by the system (Services, Hide…, Quit on the Mac): it has no
 *  page counterpart and exists only on the native surface. */
export type Predefined =
  | "services" | "hide" | "hideOthers" | "showAll" | "quit"
  | "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll"
  | "minimize" | "maximize" | "fullscreen";

export interface CommandRow {
  kind: "cmd";
  /** stable id: the native item's id, the check's key */
  id: string;
  /** i18n key of the label */
  label: string;
  /** i18n key of the tooltip (page only) */
  title?: string;
  /** the page's button id — the handler that already exists is the command */
  button: string;
  /** Tauri accelerator syntax (`CmdOrCtrl+Shift+S`); drawn as ⇧⌘S / Ctrl+Shift+S */
  accel?: string;
  /** the accelerator is not shown on the web (the browser keeps ⌘W, ⌘Q) */
  accelNotOnWeb?: boolean;
  /** the platforms the command exists on; absent = all */
  only?: Platform[];
}
export interface PredefinedRow { kind: "os"; id: string; os: Predefined; label?: string }
/** MICRO-PL17 (W14) · an INVOCATION, not a button: a plugin's command
 *  (`plugin:<id>/<command>`), registered at run time in a slot of a sub-menu
 *  (`SubRow.slot`). Its label is already in the page's language (the plugin's
 *  own words); what it does goes to the bridge (menu-ui's `invoke` hook). */
export interface RunRow {
  kind: "run";
  id: string;
  text: string;
  title?: string;
  /** MICRO-PL18 (W15a) · the plugin's mark, drawn beside the label («non verificato», «sviluppo») */
  badge?: string;
}
export interface SepRow { kind: "sep" }
export interface SubRow {
  kind: "sub";
  id: string;
  label: string;
  title?: string;
  /** filled when it opens (the recent files) rather than from rows */
  dynamic?: "recent";
  /** MICRO-PL17 · the plugin slot this sub-menu offers (`menu.file.import@1`):
   *  the commands registered there follow its rows, after a separator */
  slot?: string;
  rows: Row[];
  only?: Platform[];
}
export type Row = CommandRow | PredefinedRow | SepRow | SubRow | RunRow;

// ── MICRO-PL17 · the rows registered at run time, per slot ──────────────────
const runs = new Map<string, RunRow[]>();
/** The plugins' commands of a slot (replacing those of before); [] takes them away. */
export function setSlotRuns(slot: string, rows: RunRow[]): void {
  if (rows.length) runs.set(slot, rows.map((r) => ({ ...r }))); else runs.delete(slot);
}
export function slotRuns(slot: string): RunRow[] {
  return runs.get(slot) ?? [];
}
export function findRun(id: string): RunRow | null {
  for (const rows of runs.values()) { const f = rows.find((r) => r.id === id); if (f) return f; }
  return null;
}

export interface MenuDef {
  id: "app" | "file" | "edit" | "window" | "help";
  /** i18n key; the app menu is named by the system after the app */
  label: string;
  /** which surfaces draw this menu, per platform */
  surfaces: Partial<Record<Platform, Surface[]>>;
  rows: Row[];
}

const sep: SepRow = { kind: "sep" };
const cmd = (id: string, label: string, button: string, more: Partial<CommandRow> = {}): CommandRow =>
  ({ kind: "cmd", id, label, button, ...more });
const os = (id: string, which: Predefined, label?: string): PredefinedRow =>
  ({ kind: "os", id, os: which, ...(label ? { label } : {}) });

/** Help ▸ About / Settings / Check for updates live in the system's EMStudio
 *  menu on the Mac desktop, and in the page's Help everywhere else. Check for
 *  updates is desktop only (p.7): the web build is updated by its node. */
const NOT_MAC_DESKTOP: Platform[] = ["web", "win", "linux"];

export const MENUS: MenuDef[] = [
  {
    id: "app",
    label: "menu.app",
    surfaces: { mac: ["native"] },
    rows: [
      cmd("about", "toolbar.about", "btn-help-about"),
      cmd("updates", "toolbar.updates", "btn-help-updates"),
      sep,
      cmd("settings", "toolbar.settingsItem", "btn-settings", { accel: "CmdOrCtrl+," }),
      sep,
      os("services", "services", "menu.services"),
      sep,
      os("hide", "hide", "menu.hide"),
      os("hideOthers", "hideOthers", "menu.hideOthers"),
      os("showAll", "showAll", "menu.showAll"),
      sep,
      os("quit", "quit", "menu.quit"),
    ],
  },
  {
    id: "file",
    label: "toolbar.file",
    surfaces: { web: ["internal"], mac: ["internal", "native"], win: ["internal"], linux: ["internal"] },
    rows: [
      cmd("new", "toolbar.new", "btn-new", { title: "menu.newTitle", accel: "CmdOrCtrl+N" }),
      // MICRO-CONTENTS-1 D9 · the folders of a new EM project, beside New (it was
      // among the file tools of a graph already open, in the Storage)
      cmd("newProject", "fs.newProject", "btn-new-project", { title: "fs.newProjectMenuTitle" }),
      // MICRO-ARCHIVIO-2 · the project is the folder: open it, reorder it, close it
      cmd("openProject", "fs.openProject", "btn-open-project", { title: "fs.openProjectTitle" }),
      cmd("reorderProject", "fs.reorderItem", "btn-reorder-project", { title: "fs.reorderItemTitle" }),
      cmd("closeProject", "fs.closeProject", "btn-close-project", { title: "fs.closeProjectTitle" }),
      // MICRO-SPAZIO-RITOCCHI-2 p.1 · the active em.json's folder, the file selected
      cmd("revealDoc", "fs.revealDoc", "btn-reveal-doc", { title: "fs.revealDocTitle" }),
      cmd("open", "toolbar.open", "btn-open", { title: "menu.openTitle", accel: "CmdOrCtrl+O" }),
      { kind: "sub", id: "openRecent", label: "menu.openRecent", title: "menu.openRecentTitle", dynamic: "recent", rows: [] },
      cmd("openReplace", "toolbar.openReplace", "btn-open-replace", { title: "menu.openReplaceTitle" }),
      cmd("close", "toolbar.close", "btn-close-doc", { title: "menu.closeTitle", accel: "CmdOrCtrl+W", accelNotOnWeb: true }),
      sep,
      cmd("save", "toolbar.save", "btn-save", { title: "menu.saveTitle", accel: "CmdOrCtrl+S" }),
      cmd("saveAs", "toolbar.saveAs", "btn-save-as", { title: "menu.saveAsTitle", accel: "CmdOrCtrl+Shift+S" }),
      cmd("saveAll", "toolbar.saveAll", "btn-save-all", { title: "menu.saveAllTitle", accel: "CmdOrCtrl+Alt+S" }),
      cmd("pin", "version.pin", "btn-pin-version", { title: "version.pinTitle" }),
      sep,
      // MICRO-E p.1 · «Porta dentro…»: the one door (files into a document)
      cmd("door", "door.menu", "btn-porta-dentro", { title: "door.menuHint" }),
      // MICRO-GEO09 · a folder (a stack of slices): read by a plugin's reader of folders (door.reader@2)
      cmd("doorFolder", "door.folderMenu", "btn-porta-dentro-cartella", { title: "door.folderMenuHint" }),  // ALLOW-IT: an element id (as btn-porta-dentro), not words on screen
      // MICRO-P-GEOREF-PER-GRAFO · the card «Georeferenziazione»: each graph its system
      cmd("georef", "gr.menu", "btn-georef", { title: "gr.menuTitle" }),
      { kind: "sub", id: "import", label: "toolbar.import", slot: "menu.file.import@1", rows: [
        cmd("importGraphml", "toolbar.importGraphmlItem", "btn-import-graphml", { title: "toolbar.importGraphmlTitle" }),
        cmd("importMapping", "impmap.menu", "btn-import-mapping", { title: "impmap.menuTitle" }),
      ] },
      { kind: "sub", id: "export", label: "toolbar.export", title: "menu.exportTitle", slot: "menu.file.export@1", rows: [
        cmd("exportSvg", "menu.svgItem", "btn-svg", { title: "menu.svgTitle" }),
        cmd("exportTtl", "menu.ttlItem", "btn-ttl", { title: "menu.ttlTitle" }),
      ] },
      // MICRO-PL002 · the sheets printed: which ones (criteria), how many, in which order
      cmd("printSheets", "skp.menu", "btn-print-sheets", { title: "skp.menuTitle" }),
      cmd("integrate", "container.addToProject", "btn-add-project", { title: "container.addToProjectTitle" }),
      // MICRO-PERCORSI-WINDOWS p.3 · Blender's «Find Missing Files», for a study
      cmd("relocate", "fs.relocate", "btn-relocate-files", { title: "fs.relocateTitle" }),
      // MICRO-WINDOWS-MODELLI p.5 · Maya's «Collect Files», Blender's «Pack Resources»
      cmd("collect", "fs.collect", "btn-collect-files", { title: "fs.collectTitle" }),
      // MICRO-T · the presentation section out of the file, after saying what it holds
      cmd("cleanFile", "pres.clean", "btn-clean-file", { title: "pres.cleanTitle" }),
      sep,
      cmd("createRoom", "room.createItem", "btn-create-room", { title: "room.createItemTitle" }),
      cmd("bringIntoRoom", "room.bringItem", "btn-bring-into-room", { title: "room.bringItemTitle" }),
      // MICRO-BLEND-OFFICINA-3 · two actions, not one (E.D.): what a viewer will
      // find, model by model, and a working .blend composed from the graph
      cmd("consolidate", "cons.menu", "btn-consolidate", { title: "cons.menuTitle" }),
      cmd("composeFromGraph", "gcomp.menu", "btn-compose-graph", { title: "gcomp.menuTitle" }),
      // Windows and Linux: Quit at the bottom of File, as is the custom there
      // (the Mac has it in the EMStudio menu; the web closes its tab)
      { ...sep, only: ["win", "linux"] } as SepRow,
      cmd("quitFile", "menu.quit", "btn-quit", { accel: "CmdOrCtrl+Q", only: ["win", "linux"] }),
    ],
  },
  {
    id: "edit",
    label: "toolbar.edit",
    // the system's Edit on the Mac is the OS's text editing (cut, copy, paste in
    // a field): the page's undo is the document's, and stays in the page
    surfaces: { web: ["internal"], mac: ["internal", "native"], win: ["internal"], linux: ["internal"] },
    rows: [
      cmd("undo", "toolbar.undoItem", "btn-undo", { title: "toolbar.undo" }),
      cmd("redo", "toolbar.redoItem", "btn-redo", { title: "toolbar.redo" }),
      os("osUndo", "undo"), os("osRedo", "redo"),
      sep,
      os("cut", "cut"), os("copy", "copy"), os("paste", "paste"), os("selectAll", "selectAll"),
    ],
  },
  {
    id: "window",
    label: "menu.window",
    surfaces: { mac: ["native"] },
    rows: [os("minimize", "minimize"), os("maximize", "maximize"), os("fullscreen", "fullscreen")],
  },
  {
    id: "help",
    label: "toolbar.help",
    surfaces: { web: ["internal"], mac: ["internal", "native"], win: ["internal"], linux: ["internal"] },
    rows: [
      cmd("workspaces", "ws.helpMenu", "btn-help-workspaces"),
      cmd("shortcuts", "shortcuts.menu", "btn-help-shortcuts"),
      cmd("legend", "legend.full", "btn-help-legend"),
      { ...sep, only: NOT_MAC_DESKTOP } as SepRow,
      cmd("aboutHelp", "toolbar.about", "btn-help-about", { only: NOT_MAC_DESKTOP }),
      cmd("settingsHelp", "toolbar.settingsItem", "btn-settings", { accel: "CmdOrCtrl+,", only: NOT_MAC_DESKTOP }),
      cmd("updatesHelp", "toolbar.updates", "btn-help-updates", { only: ["win", "linux"] }),
    ],
  },
];

/** OS rows are the native surface's; command rows the page's AND the system's,
 *  except in Edit, where the system draws the OS's text editing instead. */
function rowOnSurface(menu: MenuDef, row: Row, surface: Surface): boolean {
  if (row.kind === "os") return surface === "native";
  if (menu.id === "edit" && row.kind === "cmd") return surface === "internal";
  return true;
}

function rowOnPlatform(row: Row, platform: Platform): boolean {
  const only = (row as { only?: Platform[] }).only;
  return !only || only.includes(platform);
}

/** The rows a surface draws for a menu on a platform: filtered, separators
 *  never doubled, never leading, never trailing. Empty = the menu is absent. */
export function menuRows(menu: MenuDef, platform: Platform, surface: Surface): Row[] {
  if (!(menu.surfaces[platform] ?? []).includes(surface)) return [];
  const pick = (rows: Row[]): Row[] => {
    const out: Row[] = [];
    for (const row of rows) {
      if (!rowOnPlatform(row, platform) || !rowOnSurface(menu, row, surface)) continue;
      if (row.kind === "sep" && (!out.length || out[out.length - 1].kind === "sep")) continue;
      if (row.kind === "sub") {
        const inner = row.dynamic ? [] : pick(row.rows);
        const extra = row.slot ? slotRuns(row.slot) : [];
        if (extra.length) inner.push(...(inner.length ? [{ kind: "sep" } as SepRow] : []), ...extra);
        if (!row.dynamic && !inner.length) continue;
        out.push({ ...row, rows: inner });
        continue;
      }
      out.push(row);
    }
    while (out.length && out[out.length - 1].kind === "sep") out.pop();
    return out;
  };
  return pick(menu.rows);
}

/** The menus a surface draws on a platform, in order, with their rows. */
export function menusFor(platform: Platform, surface: Surface): { menu: MenuDef; rows: Row[] }[] {
  return MENUS.map((menu) => ({ menu, rows: menuRows(menu, platform, surface) }))
    .filter((m) => m.rows.length);
}

/** A flat outline of rows (`file/new`, `file/export/exportSvg`, `—`) — what the
 *  check compares between the two surfaces. */
export function outline(rows: Row[], prefix = ""): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (r.kind === "sep") out.push(`${prefix}—`);
    else if (r.kind === "sub") {
      out.push(`${prefix}${r.id}▸`);
      out.push(...outline(r.rows, `${prefix}${r.id}/`));
    } else out.push(`${prefix}${r.id}`);   // a run row: its `plugin:<id>/<command>`
  }
  return out;
}

/** The accelerator as drawn: ⇧⌘S on the Mac, Ctrl+Shift+S elsewhere; nothing
 *  on the web for the keys the browser keeps. */
export function keysFor(row: CommandRow, platform: Platform): string {
  if (!row.accel || (platform === "web" && row.accelNotOnWeb)) return "";
  const parts = row.accel.split("+");
  const key = parts.pop()!;
  const mac = platform === "mac" || (platform === "web" && /Mac/.test(globalThis.navigator?.platform ?? ""));
  if (mac) {
    const sym: Record<string, string> = { Shift: "⇧", Alt: "⌥", CmdOrCtrl: "⌘", Ctrl: "⌃" };
    const order = ["Ctrl", "Alt", "Shift", "CmdOrCtrl"];
    return order.filter((m) => parts.includes(m)).map((m) => sym[m]).join("") + key.toUpperCase();
  }
  const word: Record<string, string> = { Shift: "Shift", Alt: "Alt", CmdOrCtrl: "Ctrl", Ctrl: "Ctrl" };
  return [...parts.map((m) => word[m]), key.toUpperCase()].join("+");
}

/** Where this page runs. */
export function currentPlatform(isDesktop: boolean, ua = globalThis.navigator?.userAgent ?? ""): Platform {
  if (!isDesktop) return "web";
  if (/Mac/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "win";
  return "linux";
}
