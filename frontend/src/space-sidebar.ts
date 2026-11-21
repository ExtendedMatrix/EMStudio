/**
 * MICRO-SEG19 (E.D., 21 Nov 2026: «come la N di Blender… gli strumenti a
 * sinistra come la T») · THE SPACE'S SIDEBAR OF TABS AND ITS TOOLBAR, as data.
 *
 * The sidebar on the right of the 3D view has vertical tabs, each a set of
 * panels: «Item» (the object selected), «Tool» (the active tool's options),
 * «View» (the view, the 3D cursor, the level of detail, the snap) and one tab
 * per tab an extension's panels name — a panel that names none goes in a tab
 * with its extension's name. No extension panel is a column between the areas
 * any more: a panel goes in the sidebar, or (`region = "window"`) in a window
 * of its own.
 *
 * The toolbar on the left of the 3D view is a column of icons: the Space's own
 * tools first (select, 3D cursor), a separator, then the extensions' tools
 * (`space.tool@1`), each with its name and its extension in the tooltip.
 *
 * The tab chosen is remembered per workspace. Pure: no DOM, no store
 * (`scripts/check-space-sidebar.mjs`).
 */

/** the Space's own tabs, in Blender's order */
export const CORE_TABS = ["item", "tool", "view"] as const;
export type CoreTab = typeof CORE_TABS[number];
/** the tab the sidebar opens on the first time: «View», the panel it was before */
export const DEFAULT_TAB: CoreTab = "view";

/** a declarative panel as the bridge describes it (`panel@1`) — the fields that place it */
export interface SidebarPanelDecl {
  plugin: string;
  id: string;
  /** `<plugin>/<panel>` */
  name: string;
  /** where it opened before MICRO-SEG19 (right, left, below, window): read when `region` is absent */
  place?: string;
  /** the editor it lives in (today only the Space) */
  space?: string;
  /** the sidebar, or a window of its own */
  region?: string;
  /** the tab's words by language; absent: the extension's name */
  tab?: Record<string, string> | string | null;
}

export interface SidebarTab {
  /** `item` · `tool` · `view` · `ext:<word>` */
  id: string;
  kind: "core" | "extension";
  /** the extension's tab: its words in the page's language (a core tab's are the page's i18n) */
  label?: string;
  /** the extensions whose panels are in it (their names), in order */
  extensions?: string[];
  /** the panels in it (`<plugin>/<panel>`), in the order they were declared */
  panels: string[];
}

/** words in the page's language: the language, its base, English, any */
export function wordsIn(v: Record<string, string> | string | null | undefined, lang: string): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  const base = lang.split("-")[0];
  return (v[lang] ?? v[base] ?? v.en ?? Object.values(v)[0] ?? "").trim();
}

/** Where a panel goes: the sidebar, or a window of its own. An old manifest's
 *  `place` «window» is a window; right, left, below are the sidebar now. */
export function panelRegion(p: Pick<SidebarPanelDecl, "region" | "place">): "sidebar" | "window" {
  if (p.region === "window" || p.region === "sidebar") return p.region;
  return p.place === "window" ? "window" : "sidebar";
}

/** The tab of a panel: its own words, else the extension's name, else its plugin's id. */
export function panelTabLabel(p: Pick<SidebarPanelDecl, "tab" | "plugin">, lang: string, extensionName?: string | null): string {
  return wordsIn(p.tab ?? null, lang) || (extensionName ?? "").trim() || p.plugin;
}

/** the id of an extension's tab, from its words (two extensions naming the same tab share it, as Blender's) */
export function extTabId(label: string): string {
  return `ext:${label.trim().toLocaleLowerCase()}`;
}

/** The tabs of the sidebar: the three of the Space, then one per tab the
 *  sidebar's panels name, in the order the panels come. */
export function sidebarTabs(panels: SidebarPanelDecl[], lang: string, nameOf: (plugin: string) => string | null | undefined): SidebarTab[] {
  const out: SidebarTab[] = CORE_TABS.map((id) => ({ id, kind: "core", panels: [] }));
  const byId = new Map<string, SidebarTab>();
  for (const p of panels) {
    if (panelRegion(p) !== "sidebar" || (p.space && p.space !== "space")) continue;
    const ext = (nameOf(p.plugin) ?? "").trim() || p.plugin;
    const label = panelTabLabel(p, lang, ext);
    const id = extTabId(label);
    let tab = byId.get(id);
    if (!tab) { tab = { id, kind: "extension", label, extensions: [], panels: [] }; byId.set(id, tab); out.push(tab); }
    if (!tab.extensions!.includes(ext)) tab.extensions!.push(ext);
    tab.panels.push(p.name);
  }
  return out;
}

/** The tab a panel is in (null: it is not in the sidebar). */
export function tabOfPanel(tabs: SidebarTab[], panelName: string): string | null {
  return tabs.find((t) => t.panels.includes(panelName))?.id ?? null;
}

/** The tab to show: the one remembered if it is still there, else «View». */
export function chosenTab(tabs: SidebarTab[], remembered: string | null | undefined): string {
  return remembered && tabs.some((t) => t.id === remembered) ? remembered : DEFAULT_TAB;
}

/** A tab asked by a script or a person: its id, a core tab's name in any case,
 *  or an extension tab's words. Null: no such tab. */
export function findTab(tabs: SidebarTab[], ref: string, coreLabel: (id: CoreTab) => string = (id) => id): string | null {
  const r = ref.trim().toLocaleLowerCase();
  if (!r) return null;
  for (const t of tabs) {
    if (t.id.toLocaleLowerCase() === r) return t.id;
    const words = t.kind === "core" ? coreLabel(t.id as CoreTab) : t.label ?? "";
    if (words.toLocaleLowerCase() === r) return t.id;
    if (t.kind === "extension" && t.id === extTabId(r)) return t.id;
  }
  return null;
}

// ── the tab remembered per workspace ─────────────────────────────────────────

export const SIDEBAR_TAB_KEY = "emstudio.space.sidebarTab";

/** the tabs remembered: workspace → tab id */
export function loadTabs(): Record<string, string> {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(SIDEBAR_TAB_KEY) ?? "{}") as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch { return {}; }
}
export function rememberTab(workspace: string, tab: string): Record<string, string> {
  const all = { ...loadTabs(), [workspace]: tab };
  try { globalThis.localStorage?.setItem(SIDEBAR_TAB_KEY, JSON.stringify(all)); } catch { /* private mode: the session keeps it */ }
  return all;
}

// ── the toolbar ──────────────────────────────────────────────────────────────

/** the Space's own tools: those that exist (E.D.'s list named measure and
 *  annotation too: the Space has neither — they are the Viewer's, on one
 *  document's model — so the bar does not invent them) */
export const CORE_TOOLS = ["select", "cursor"] as const;
export type CoreTool = typeof CORE_TOOLS[number];
export const CORE_TOOL_GLYPH: Record<CoreTool, string> = { select: "↖", cursor: "⊕" };

export interface ToolbarEntry {
  id: string;
  group: "core" | "extension";
  glyph: string;
  /** the tooltip: its name, and its extension's */
  title: string;
  /** why it cannot be used here (disabled), null: it can */
  off: string | null;
  active: boolean;
}

/** The column of the toolbar: the core's, then the extensions' (a separator
 *  between the two groups is the drawer's). The active one: an extension's
 *  tool armed, else the core's. */
export function toolbarEntries(o: {
  core: CoreTool;
  coreTitle: (id: CoreTool) => string;
  extensions: Array<{ id: string; glyph: string; title: string; off: string | null }>;
  armed: string | null;
}): ToolbarEntry[] {
  const active = o.armed && o.extensions.some((x) => x.id === o.armed && !x.off) ? o.armed : o.core;
  return [
    ...CORE_TOOLS.map((id): ToolbarEntry => ({ id, group: "core", glyph: CORE_TOOL_GLYPH[id], title: o.coreTitle(id), off: null, active: active === id })),
    ...o.extensions.map((x): ToolbarEntry => ({ id: x.id, group: "extension", glyph: x.glyph || "◆", title: x.title, off: x.off, active: active === x.id })),
  ];
}

/** A tool asked by a script: a core tool's id, an extension tool's id, or its
 *  command (`geofisica.trace.point`). Null: no such tool. */
export function findTool(entries: Array<Pick<ToolbarEntry, "id">>, ref: string): string | null {
  const r = ref.trim();
  if (!r) return null;
  for (const e of entries) if (e.id === r) return e.id;
  for (const e of entries) if (e.id.startsWith("plugin:") && (e.id.endsWith(`/${r}`) || e.id.slice(7) === r)) return e.id;
  return null;
}

/** The sidebar over the 3D view instead of beside it: the window too narrow to
 *  give it its width and leave the view usable (a telephone, a narrow window). */
export const OVERLAY_UNDER = 640;
export function sidebarOverlays(rowWidth: number, sidebarWidth: number): boolean {
  return rowWidth > 0 && (rowWidth < OVERLAY_UNDER || rowWidth - sidebarWidth < 360);
}
