/**
 * MICRO-DOVE-CHI-MENU p.1 · the table of commands (`menu-table.ts`), drawn.
 *
 * The page's menus (File, Edit, Help) are filled from the rows BEFORE `main.ts`
 * wires its handlers, so every button keeps the id its handler already looks
 * for: the command IS the existing handler, the row only says where it is
 * drawn. A command without a page row on this platform (Settings on the Mac
 * desktop, which lives in the system's EMStudio menu) still gets its button,
 * in a hidden holder, so the handler is there for the system's item to press.
 *
 * On the Mac desktop the system's menu bar is built from the same rows through
 * Tauri's menu API, its items press the same buttons, and an item follows its
 * button's `disabled`. The keyboard goes through the same door (`runCommand`):
 * one press may arrive twice on the desktop (the webview's keydown and the
 * menu's accelerator), and the second within 400 ms is the same press.
 */
import { applyStaticTranslations, onLocaleChange, t } from "./i18n";
import {
  type CommandRow, type OptRow, type Platform, type Row, type RunRow, MENUS, findRun, keysFor, menuRows, menusFor,
  optionOn, setOption, slotRuns,
} from "./menu-table";

/** the dynamic sub-menus' content (p.2: the recent files), asked when drawn */
export interface DynamicItem { id: string; label: string; detail?: string; disabled?: boolean; run(): void }
export interface MenuHooks {
  recent?(): DynamicItem[];
  /** MICRO-PL17 · a run row (a plugin's command) chosen: the page invokes it */
  invoke?(id: string): void;
}
let hooks: MenuHooks = {};
let platformNow: Platform = "web";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function commandButton(row: CommandRow, platform: Platform): HTMLButtonElement {
  const b = el("button");
  b.id = row.button;
  b.type = "button";
  b.dataset.cmd = row.id;
  if (row.title) b.dataset.i18nTitle = row.title;
  const label = el("span", "dd-label-text");
  label.dataset.i18n = row.label;
  label.textContent = t(row.label);
  b.appendChild(label);
  const keys = keysFor(row, platform);
  if (keys) {
    const k = el("span", "dd-key");
    k.textContent = keys;
    b.appendChild(k);
  }
  return b;
}

/** Draw a dynamic sub-menu's items into its flyout, every time it opens. */
function fillDynamic(host: HTMLElement, which: "recent"): void {
  host.textContent = "";
  const items = which === "recent" ? hooks.recent?.() ?? [] : [];
  if (!items.length) {
    const none = el("div", "dd-empty");
    none.textContent = t("menu.recentNone");
    host.appendChild(none);
    return;
  }
  for (const it of items) {
    if (it.id === "—") { host.appendChild(el("div", "dd-sep")); continue; }
    const b = el("button", "dd-dyn");
    b.type = "button";
    b.dataset.dyn = it.id;
    b.disabled = !!it.disabled;
    const name = el("span", "dd-label-text");
    name.textContent = it.label;
    b.appendChild(name);
    if (it.detail) {
      const d = el("span", "dd-detail");
      d.textContent = it.detail;
      b.appendChild(d);
      b.title = `${it.label} · ${it.detail}`;
    }
    b.addEventListener("click", () => it.run());
    host.appendChild(b);
  }
}

/** MICRO-PL17 · a plugin's command as a menu item: no button id, an invocation */
function runButton(row: RunRow): HTMLButtonElement {
  const b = el("button", "dd-run");
  b.type = "button";
  b.dataset.run = row.id;
  if (row.title) b.title = row.title;
  const label = el("span", "dd-label-text");
  label.textContent = row.text;
  b.appendChild(label);
  if (row.badge) {                                  // W15a: seen, not only a tooltip
    const badge = el("span", "dd-badge plg-badge");
    badge.textContent = row.badge;
    b.appendChild(badge);
  }
  b.addEventListener("click", () => hooks.invoke?.(row.id));
  return b;
}

/** MICRO-TIL003 · an option of the command above: a box under it, indented.
 *  A click ticks it and leaves the menu open (the command is still to choose). */
function optionBox(row: OptRow): HTMLLabelElement {
  const l = el("label", "dd-opt");
  l.dataset.opt = row.id;
  if (row.title) l.dataset.i18nTitle = row.title;
  const box = el("input");
  box.type = "checkbox";
  box.checked = optionOn(row.id);
  box.addEventListener("change", () => { setOption(row.id, box.checked); void syncNativeOption(row.id); });
  const label = el("span", "dd-label-text");
  label.dataset.i18n = row.label;
  label.textContent = t(row.label);
  l.append(box, label);
  l.addEventListener("click", (e) => e.stopPropagation());
  return l;
}

function drawRows(host: HTMLElement, rows: Row[], platform: Platform, made: Set<string>): void {
  for (const row of rows) {
    if (row.kind === "sep") { host.appendChild(el("div", "dd-sep")); continue; }
    if (row.kind === "opt") { host.appendChild(optionBox(row)); continue; }
    if (row.kind === "os") continue;
    if (row.kind === "run") { host.appendChild(runButton(row)); continue; }
    if (row.kind === "cmd") {
      if (made.has(row.button)) continue;   // one button per command
      made.add(row.button);
      host.appendChild(commandButton(row, platform));
      continue;
    }
    const sub = el("div", "dd-sub");
    sub.dataset.sub = row.id;
    const toggle = el("button", "dd-sub-toggle");
    toggle.type = "button";
    if (row.title) toggle.dataset.i18nTitle = row.title;
    const label = el("span");
    label.dataset.i18n = row.label;
    label.textContent = t(row.label);
    const caret = el("span", "dd-sub-caret");
    caret.textContent = "▸";
    toggle.append(label, caret);
    const flyout = el("div", "dd-sub-menu hidden");
    if (row.dynamic) {
      flyout.dataset.dynamic = row.dynamic;
      const which = row.dynamic;
      // before main.ts's toggle handler (capture): the content is fresh when it shows
      toggle.addEventListener("click", () => fillDynamic(flyout, which), true);
    } else drawRows(flyout, row.rows, platform, made);
    sub.append(toggle, flyout);
    host.appendChild(sub);
  }
}

/**
 * Fill the page's menus for `platform`. Called once, before the handlers are
 * wired. Returns the ids of the buttons drawn (the check reads them).
 */
export function buildPageMenus(platform: Platform, h: MenuHooks = {}): string[] {
  platformNow = platform;
  hooks = h;
  const made = new Set<string>();
  for (const menu of MENUS) {
    const dd = document.getElementById(`dd-${menu.id}`);
    const host = dd?.querySelector<HTMLElement>(".dd-menu");
    const rows = menuRows(menu, platform, "internal");
    if (!dd || !host) continue;
    if (menu.anchor) {
      // MICRO-TIL003 · a menu of the page's own (Tools): the rows after the
      // anchor, the items of index.html kept; drawn again = the old ones out
      host.querySelectorAll(":scope > [data-table-row]").forEach((n) => n.remove());
      const box = el("div");
      drawRows(box, rows, platform, made);
      const at = host.querySelector<HTMLElement>(`#${menu.anchor}`);
      const items = [...box.children] as HTMLElement[];
      for (const n of items) n.dataset.tableRow = "1";
      if (at) at.after(...items); else host.append(...items);
      continue;
    }
    host.textContent = "";
    dd.classList.toggle("hidden", !rows.length);
    drawRows(host, rows, platform, made);
  }
  // every command still gets ONE button: the ones this platform draws only in
  // the system's menu wait, hidden, for the system's item to press them
  const holder = document.getElementById("menu-commands") ?? (() => {
    const d = el("div");
    d.id = "menu-commands";
    d.hidden = true;
    document.body.appendChild(d);
    return d;
  })();
  const walk = (rows: Row[]): void => {
    for (const row of rows) {
      if (row.kind === "sub") walk(row.rows);
      if (row.kind !== "cmd" || made.has(row.button)) continue;
      made.add(row.button);
      holder.appendChild(commandButton(row, platform));
    }
  };
  for (const menu of MENUS) walk(menu.rows);
  applyStaticTranslations(document.getElementById("toolbar") ?? document);
  return [...made];
}

// ── one door for a command: the page's item, the system's item, the key ─────

const lastRun = { button: "", at: 0 };
/** Press the command's button — once per physical press. */
export function runCommand(id: string): boolean {
  // MICRO-PL17 · a plugin's command: an invocation, not a button
  if (id.startsWith("plugin:")) {
    if (!findRun(id) && !hooks.invoke) return false;
    hooks.invoke?.(id);
    return true;
  }
  const row = findRow(id);
  if (!row) return false;
  const now = performance.now();
  if (lastRun.button === row.button && now - lastRun.at < 400) return true;
  lastRun.button = row.button;
  lastRun.at = now;
  const b = document.getElementById(row.button) as HTMLButtonElement | null;
  if (!b || b.disabled) return false;
  b.click();
  return true;
}

function findRow(id: string): CommandRow | null {
  const walk = (rows: Row[]): CommandRow | null => {
    for (const r of rows) {
      if (r.kind === "cmd" && r.id === id) return r;
      if (r.kind === "sub") { const f = walk(r.rows); if (f) return f; }
    }
    return null;
  };
  for (const m of MENUS) { const f = walk(m.rows); if (f) return f; }
  return null;
}

/** The command a key press means on this platform (from the rows' accelerators),
 *  or null. `⌘` is Ctrl off the Mac. */
export function commandForKey(e: KeyboardEvent, platform: Platform = platformNow): string | null {
  if (!(e.metaKey || e.ctrlKey)) return null;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  for (const { rows } of menusFor(platform, "internal").concat(menusFor(platform, "native"))) {
    const walk = (list: Row[]): string | null => {
      for (const r of list) {
        if (r.kind === "sub") { const f = walk(r.rows); if (f) return f; }
        if (r.kind !== "cmd" || !r.accel || !keysFor(r, platform)) continue;
        const parts = r.accel.split("+");
        const k = parts[parts.length - 1].toUpperCase();
        if (k !== key && !(k === "," && e.key === ",")) continue;
        if (parts.includes("Shift") !== e.shiftKey) continue;
        if (parts.includes("Alt") !== e.altKey) continue;
        return r.id;
      }
      return null;
    };
    const found = walk(rows);
    if (found) return found;
  }
  return null;
}

// ── the system's menu bar (the Mac desktop) ──────────────────────────────────

type TauriMenu = typeof import("@tauri-apps/api/menu");
type NativeItem = Awaited<ReturnType<TauriMenu["MenuItem"]["new"]>>;
type NativeSub = Awaited<ReturnType<TauriMenu["Submenu"]["new"]>>;

const PREDEFINED: Record<string, string> = {
  services: "Services", hide: "Hide", hideOthers: "HideOthers", showAll: "ShowAll",
  quit: "Quit", undo: "Undo", redo: "Redo", cut: "Cut", copy: "Copy", paste: "Paste",
  selectAll: "SelectAll", minimize: "Minimize", maximize: "Maximize", fullscreen: "Fullscreen",
};

let nativeItems: { button: string; item: NativeItem }[] = [];
/** MICRO-TIL003 · the system's check items of the options, to follow the page's box */
const nativeOptions = new Map<string, { setChecked(v: boolean): Promise<void> }>();
async function syncNativeOption(id: string): Promise<void> {
  try { await nativeOptions.get(id)?.setChecked(optionOn(id)); } catch { /* the bar is being rebuilt */ }
}
/** the page's box follows the system's check item */
function syncPageOption(id: string): void {
  document.querySelectorAll<HTMLInputElement>(`.dd-opt[data-opt="${id}"] input`).forEach((b) => { b.checked = optionOn(id); });
}
let nativeRecent: NativeSub | null = null;
let observer: MutationObserver | null = null;

async function nativeRows(api: TauriMenu, rows: Row[], platform: Platform): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const row of rows) {
    if (row.kind === "sep") { out.push(await api.PredefinedMenuItem.new({ item: "Separator" })); continue; }
    if (row.kind === "os") {
      out.push(await api.PredefinedMenuItem.new({
        item: PREDEFINED[row.os] as "Quit",
        ...(row.label ? { text: t(row.label) } : {}),
      }));
      continue;
    }
    if (row.kind === "opt") {
      // MICRO-TIL003 · the box of a command: a check item under it
      if (!api.CheckMenuItem) continue;            // an older shell: the page's box is enough
      const id = row.id;
      const item = await api.CheckMenuItem.new({
        id, text: t(row.label), checked: optionOn(id),
        action: () => { setOption(id, !optionOn(id)); syncPageOption(id); void syncNativeOption(id); },
      });
      nativeOptions.set(id, item);
      out.push(item);
      continue;
    }
    if (row.kind === "run") {
      // W15a · the system's menu has no badge: the mark goes in the words
      const text = row.badge ? `${row.text} (${row.badge})` : row.text;
      out.push(await api.MenuItem.new({ id: row.id, text, action: () => { hooks.invoke?.(row.id); } }));
      continue;
    }
    if (row.kind === "cmd") {
      const b = document.getElementById(row.button) as HTMLButtonElement | null;
      const item = await api.MenuItem.new({
        id: row.id,
        text: t(row.label),
        accelerator: keysFor(row, platform) ? row.accel : undefined,
        enabled: !!b && !b.disabled,
        action: () => { runCommand(row.id); },
      });
      nativeItems.push({ button: row.button, item });
      out.push(item);
      continue;
    }
    const sub = await api.Submenu.new({
      id: `sub-${row.id}`,
      text: t(row.label),
      items: row.dynamic ? await dynamicNative(api) as never : await nativeRows(api, row.rows, platform) as never,
    });
    if (row.dynamic === "recent") nativeRecent = sub;
    out.push(sub);
  }
  return out;
}

async function dynamicNative(api: TauriMenu): Promise<unknown[]> {
  const items = hooks.recent?.() ?? [];
  if (!items.length) return [await api.MenuItem.new({ id: "recent-none", text: t("menu.recentNone"), enabled: false })];
  const out: unknown[] = [];
  for (const it of items) {
    if (it.id === "—") { out.push(await api.PredefinedMenuItem.new({ item: "Separator" })); continue; }
    out.push(await api.MenuItem.new({
      id: `recent-${it.id}`,
      text: it.detail ? `${it.label} — ${it.detail}` : it.label,
      enabled: !it.disabled,
      action: () => it.run(),
    }));
  }
  return out;
}

/** p.2 · the recent files changed: the system's «Open Recent» is drawn again. */
export async function refreshNativeRecent(): Promise<void> {
  if (!nativeRecent) return;
  try {
    const api = await import("@tauri-apps/api/menu");
    const old = await nativeRecent.items();
    for (const it of old) await nativeRecent.remove(it as never);
    for (const it of await dynamicNative(api)) await nativeRecent.append(it as never);
  } catch { /* an older shell: the page's File has the same list */ }
}

/**
 * The Mac desktop's menu bar, from the table. Elsewhere it does nothing: the
 * web has the browser's bar, and Windows and Linux windows carry none.
 */
export async function installNativeMenu(platform: Platform): Promise<boolean> {
  if (platform !== "mac") return false;
  try {
    const api = await import("@tauri-apps/api/menu");
    nativeItems = [];
    nativeRecent = null;
    const subs: NativeSub[] = [];
    let windowSub: NativeSub | null = null;
    let helpSub: NativeSub | null = null;
    for (const { menu, rows } of menusFor(platform, "native")) {
      const sub = await api.Submenu.new({
        id: `menu-${menu.id}`,
        text: menu.id === "app" ? "EMStudio" : t(menu.label),
        items: await nativeRows(api, rows, platform) as never,
      });
      if (menu.id === "window") windowSub = sub;
      if (menu.id === "help") helpSub = sub;
      subs.push(sub);
    }
    const bar = await api.Menu.new({ items: subs });
    const previous = await bar.setAsAppMenu();
    await windowSub?.setAsWindowsMenuForNSApp().catch(() => {});
    await helpSub?.setAsHelpMenuForNSApp().catch(() => {});
    void previous?.close?.().catch(() => {});
    // an item follows its button: disabled there, disabled here
    observer?.disconnect();
    observer = new MutationObserver(() => {
      for (const { button, item } of nativeItems) {
        const b = document.getElementById(button) as HTMLButtonElement | null;
        void item.setEnabled(!!b && !b.disabled).catch(() => {});
      }
    });
    for (const { button } of nativeItems) {
      const b = document.getElementById(button);
      if (b) observer.observe(b, { attributes: true, attributeFilter: ["disabled"] });
    }
    return true;
  } catch {
    return false;   // an older shell keeps the menu it was built with
  }
}

/** MICRO-PL17 · the plugins' rows changed: the run rows of every sub-menu
 *  with a slot drawn again IN PLACE (the buttons and the toggles keep their
 *  handlers), and the system's bar built again. */
export function redrawSlots(): void {
  const walk = (rows: Row[]): void => {
    for (const row of rows) {
      if (row.kind !== "sub") continue;
      walk(row.rows);
      if (!row.slot) continue;
      document.querySelectorAll<HTMLElement>(`.dd-sub[data-sub="${row.id}"] > .dd-sub-menu`).forEach((flyout) => {
        flyout.querySelectorAll(":scope > .dd-run, :scope > .dd-sep[data-runs]").forEach((n) => n.remove());
        const extra = slotRuns(row.slot!);
        if (!extra.length) return;
        if (flyout.children.length) { const sep = el("div", "dd-sep"); sep.dataset.runs = "1"; flyout.appendChild(sep); }
        for (const r of extra) flyout.appendChild(runButton(r));
      });
    }
  };
  for (const menu of MENUS) walk(menu.rows);
  void installNativeMenu(platformNow);
}

/** Language changed: the system's labels follow (the page's follow data-i18n). */
export function followLocale(platform: Platform): void {
  onLocaleChange(() => { void installNativeMenu(platform); });
}
