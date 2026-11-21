/**
 * MICRO-SEG08 (E.D. 21 Nov 2026: «non trovo dove è visibile quella sulla
 * geofisica») · WHERE AN EXTENSION SHOWS IN THE INTERFACE, and what it
 * contains, read from what its manifest declares — never from a list written
 * here. A command's slots (`in = ["door.reader@2"]`…) and the declarative
 * panels (`[[code.panels]]`) say the places; the data say the vocabularies.
 *
 * Each place says whether it is there NOW (the plugin loaded with that
 * command) or only once the code is installed: «● attivo ora», «○ arriva con
 * il codice». Pure: no DOM (`scripts/check-ext-page.mjs`).
 */

import { panelRegion, panelTabLabel } from "./space-sidebar";

/** a command as the preview, the register or the loaded plugin describe it */
export interface WhereCommand {
  id: string;
  label?: Record<string, string> | string;
  in?: string[];
  slots?: Array<{ name: string; kind?: string; required?: boolean }>;
  folders?: boolean;
  when?: string;
}
/** a declarative panel (`[[code.panels]]`); MICRO-SEG19: its region and its tab */
export interface WherePanel { id: string; label?: Record<string, string> | string; place?: string; region?: string;
  tab?: Record<string, string> | string | null }

/** the kinds of place, in the order the page lists them (the order of the approved draft) */
export const WHERE_ORDER = ["door", "import", "export", "panel", "layer", "tool", "section", "column", "statusbar",
  "menu", "context", "check", "narrative", "vocab", "python"] as const;
export type WhereKind = typeof WHERE_ORDER[number];

/** the slot → the kind of place (`door.reader@2` → door) */
const SLOT_KIND: Record<string, WhereKind> = {
  "door.reader": "door", "menu.file.import": "import", "menu.file.export": "export",
  "space.layer": "layer", "space.tool": "tool", "inspector.section": "section",
  "tabular.column": "column", "statusbar": "statusbar", "menu.tools": "menu",
  "context.node": "context", "check": "check", "export.narrative": "narrative",
};
export function slotKind(slot: string): WhereKind | null {
  return SLOT_KIND[slot.replace(/@\d+$/, "")] ?? null;
}

/** one place of the interface where the extension shows */
export interface WherePlace {
  kind: WhereKind;
  /** the labels of what is there (the commands, the panels, the vocabularies) */
  names: string[];
  /** a reader that reads folders */
  folders?: boolean;
  /** the command ids behind it (for «Mostrami»: the first) */
  commands: string[];
  /** panels: where it goes — the Space's sidebar or a window of its own (MICRO-SEG19) */
  place?: string;
  /** panels in the sidebar: the tab's words (the extension's name when it says none) */
  tab?: string;
  /** the Python line (kind python) */
  code?: string;
  /** more commands only reachable from Python */
  more?: number;
  /** there now: the plugin is loaded with it (the data: installed) */
  active: boolean;
}

export function labelOf(v: Record<string, string> | string | undefined | null, lang: string, fallback = ""): string {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  const base = lang.split("-")[0];
  return v[lang] ?? v[base] ?? v.en ?? Object.values(v)[0] ?? fallback;
}

/** the Python line of a command, as the console runs it today:
 *  `em.plugins.invoke("geofisica", "geofisica.ingest", {"folder": …})`.
 *  (The draft wrote `em.app.commands.run("geofisica.ingest", …)`: measured on
 *  21 Nov, EMStudio's `commands.run` does not reach a plugin's command — neither
 *  that id nor the documented `"<plugin>/<command>"` —, `em.plugins.invoke` does.) */
export function pythonLine(c: WhereCommand, pluginId: string): string {
  const req = (c.slots ?? []).filter((s) => s.required !== false).map((s) => `${JSON.stringify(s.name)}: …`);
  return `em.plugins.invoke(${JSON.stringify(pluginId)}, ${JSON.stringify(c.id)}${req.length ? `, {${req.join(", ")}}` : ""})`;
}

/** the places of an extension, in the page's order: what its code declares
 *  (`codeActive`: the plugin is loaded now) and its vocabularies (`dataActive`: installed) */
export function whereOf(o: {
  commands: WhereCommand[]; panels: WherePanel[]; vocabularies: string[];
  codeActive: boolean; dataActive: boolean; lang: string; pluginId?: string;
  /** MICRO-SEG19 · the extension's name: the tab of a panel that names none */
  extensionName?: string;
}): WherePlace[] {
  const by = new Map<WhereKind, WherePlace>();
  const add = (kind: WhereKind, name: string, cmd: string | null, extra: Partial<WherePlace> = {}, active = o.codeActive) => {
    let p = by.get(kind);
    if (!p) { p = { kind, names: [], commands: [], active }; by.set(kind, p); }
    if (name && !p.names.includes(name)) p.names.push(name);
    if (cmd) p.commands.push(cmd);
    Object.assign(p, extra);
  };
  for (const c of o.commands) {
    const name = labelOf(c.label, o.lang, c.id);
    for (const slot of c.in ?? []) {
      const k = slotKind(slot);
      if (k) add(k, name, c.id, k === "door" && c.folders ? { folders: true } : {});
    }
  }
  // MICRO-SEG19 · a panel goes in the Space's sidebar, on its tab, or (region window) in a window of its own
  for (const p of o.panels) {
    const region = panelRegion(p);
    add("panel", labelOf(p.label, o.lang, p.id), null, region === "window" ? { place: "window" }
      : { place: "sidebar", tab: panelTabLabel({ tab: p.tab, plugin: o.pluginId ?? "" }, o.lang, o.extensionName ?? o.pluginId ?? "") });
  }
  if (o.vocabularies.length) add("vocab", "", null, { names: [...o.vocabularies] }, o.dataActive);
  // Python: every command can be run from a script; the line shown is the first
  // one no menu carries (else the first), the others counted
  if (o.commands.length) {
    const first = o.commands.find((c) => !(c.in ?? []).length) ?? o.commands[0];
    add("python", labelOf(first.label, o.lang, first.id), first.id, { code: pythonLine(first, o.pluginId ?? first.id.split(".")[0]), more: o.commands.length - 1 });
  }
  return WHERE_ORDER.filter((k) => by.has(k)).map((k) => by.get(k)!);
}

/** what the code contains, counted by kind of place: "8 commands, 1 reader, 1 Space layer…" */
export function codeCounts(commands: WhereCommand[], panels: WherePanel[]): Array<{ kind: WhereKind | "commands"; n: number }> {
  const n = new Map<WhereKind, number>();
  for (const c of commands) for (const s of new Set((c.in ?? []).map(slotKind).filter(Boolean) as WhereKind[])) n.set(s, (n.get(s) ?? 0) + 1);
  if (panels.length) n.set("panel", panels.length);
  const out: Array<{ kind: WhereKind | "commands"; n: number }> = [];
  if (commands.length) out.push({ kind: "commands", n: commands.length });
  for (const k of WHERE_ORDER) if (n.get(k)) out.push({ kind: k, n: n.get(k)! });
  return out;
}

/** the host of a repository's address, as the selector shows it */
export function repoHost(url: string): string {
  const u = url.trim();
  const m = /^[a-z]+:\/\/([^/]+)/i.exec(u);
  if (m && !/^file:/i.test(u)) return m[1];
  // a folder or a file:// URL: the folder's name (the index.json dropped)
  const parts = u.replace(/^file:\/\//i, "").replace(/[\\/]index\.json$/i, "").split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? u;
}

/** MICRO-SEG20 · how long the em-accent ring of «Show me» stays on what it found */
export const SHOWME_MS = 1500;

/** MICRO-SEG20 · «Show me»: where a place of «Where you will find it» is reached —
 *  the workspace to go to (null: the one in front), and what is opened and lit there.
 *  The Preferences close first (a modal over the place it shows: see the report). */
export type ShowTarget = "file-menu" | "sidebar-panel" | "panel-window" | "layer" | "toolbar"
  | "inspector-section" | "vocab-picker" | "console" | "said";
export interface ShowPlan { workspace: string | null; target: ShowTarget }
export function showPlan(p: Pick<WherePlace, "kind" | "place">, here: { inspectorHere: boolean }): ShowPlan {
  const insp = here.inspectorHere ? null : "canvas";
  switch (p.kind) {
    case "door": case "import": case "export": return { workspace: null, target: "file-menu" };
    case "panel": return p.place === "window" ? { workspace: null, target: "panel-window" } : { workspace: "space", target: "sidebar-panel" };
    case "layer": return { workspace: "space", target: "layer" };
    case "tool": return { workspace: "space", target: "toolbar" };
    case "section": return { workspace: insp, target: "inspector-section" };
    case "vocab": return { workspace: insp, target: "vocab-picker" };
    case "python": return { workspace: "scripting", target: "console" };
    default: return { workspace: null, target: "said" };
  }
}

/** MICRO-SEG20 · the node «Show me» selects for an Inspector section: the selected one
 *  when the section reads it, else one the extension made (its id in the node), else the
 *  first the section reads; null: none in the document (the page says why). */
export function nodeForSection<N extends { id: string }>(nodes: N[], reads: (n: N) => boolean,
                                                          selected: string | null, madeBy: (n: N) => boolean): N | null {
  const ok = nodes.filter(reads);
  return ok.find((n) => n.id === selected) ?? ok.find(madeBy) ?? ok[0] ?? null;
}
