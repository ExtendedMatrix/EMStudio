/**
 * MICRO-PL17-PLUGIN-DA-DISCO-E-SLOT (W14, E.D. 18 Nov 2026) · THE REGISTER OF
 * THE PLUGINS' COMMANDS, the page's side.
 *
 * The plugins are installed from disk (W21, the window «Estensioni», W6) and
 * LOADED by the bridge (s3Dgraphy's `em.plugins`, bridge level 83): this module
 * keeps what the bridge says of them (`/py/plugins`) and answers the page's
 * questions — which commands go in a slot (SPEC-plugin §13: `menu.tools@1`,
 * `menu.file.import@1`, `menu.file.export@1`, `export.narrative@1`,
 * `context.node@1`, `door.reader@1`, `check@1`), whether a context command is
 * offered for this selection (`when`, the same closed grammar as
 * `s3dgraphy.extensions.slots`), how its slots are filled from what the page
 * knows — never invented: a slot the page cannot fill stays missing and the
 * contract says «I am missing …».
 *
 * A command is drawn as a row `plugin:<id>/<command>`; what it DOES goes to
 * the bridge (`PySession.invoke`), and comes back as steps (one undo each).
 * Pure: no DOM, no store (`scripts/check-plugins.mjs`).
 *
 * MICRO-PL25 (row X5 of the plan) · THE SLOTS OF PHASE 2: an Inspector
 * section for a type of node (`inspector.section@1`), a computed column of a
 * sheet of the Tabular (`tabular.column@1`), a zone of text in the status bar
 * (`statusbar@1`) — the three only read, their values asked of the bridge at
 * once (`/py/compute`, level 88) —, a tool of the Space's bar (`space.tool@1`:
 * the primitive placed, then the command with the GEOMETRY), and the
 * declarative panels (`panel@1`, `[[code.panels]]`): fields the page draws,
 * values computed, buttons that invoke commands. A plugin brings no HTML nor
 * JavaScript (SPEC-plugin §14.8): everything here is data the page draws as
 * text (`scripts/check-plugin-slots.mjs`).
 *
 * MICRO-GEO09 (row G8 of the geophysics plan) · `door.reader@2`: a reader may
 * read a FOLDER (`folders`: a stack of slices), CLAIM extensions the page
 * already reads (`claims`: never taken, offered as «Leggi come: …» beside the
 * page's own reading) and name a PANEL of its plugin that the door opens with
 * the path instead of reading straight away (`panel`). `door.reader@1` is
 * unchanged: `accept` takes the files the page does not know.
 */

export type SlotName = "menu.tools" | "menu.file.import" | "menu.file.export" | "export.narrative"
  | "context.node" | "door.reader" | "check"
  // MICRO-PL25 (X5) · phase 2
  | "inspector.section" | "tabular.column" | "statusbar" | "space.tool"
  // MICRO-GEO12 · a layer of the Space a plugin describes
  | "space.layer";

export interface PluginCommand {
  plugin: string;
  id: string;
  /** `<plugin>/<command>` */
  name: string;
  label: Record<string, string>;
  writes: boolean;
  slots: Array<{ name: string; kind: string; required?: boolean }>;
  /** the slots it is drawn in (`context.node@1`…) */
  in: string[];
  /** the entries the host turned off, and why (`phase2`, `newer`, `unknown`) */
  off: Array<{ slot: string; why: string }>;
  when: string;
  accept: string[];
  /** MICRO-PL25 · a tool of the Space: what it lays, its glyph (text) */
  primitive?: string;
  icon?: string;
  /** an Inspector section's buttons: command ids of the same plugin */
  buttons?: string[];
  /** a column's sheet of the Tabular */
  view?: string;
  /** MICRO-GEO09 · door.reader@2: extensions offered as «Leggi come» (lower case, never taken) */
  claims?: string[];
  /** it reads a folder */
  folders?: boolean;
  /** `<plugin>/<panel>` the door opens with the path, instead of reading */
  panel?: string;
}

/** MICRO-PL25 · a field of a declarative panel (`[[code.panels.fields]]`) */
export interface PanelField {
  kind: "number" | "text" | "choice" | "node" | "check" | "value" | "button";
  label: Record<string, string>;
  /** the slot an input fills */
  name?: string;
  /** the command a value shows or a button invokes */
  command?: string;
  default?: unknown;
  options?: Array<{ value: string; label: Record<string, string> }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  help?: Record<string, string>;
}

/** MICRO-PL25 · a declarative panel (`panel@1`) */
export interface PluginPanel {
  plugin: string;
  id: string;
  /** `<plugin>/<panel>` — what a `plugin-panel` window keeps */
  name: string;
  label: Record<string, string>;
  /** where it opens the first time; after, the person's.
   *  MICRO-SEG19 · read only when `region` is absent: «window» a window, the rest the sidebar */
  place: "right" | "left" | "below" | "window";
  /** MICRO-SEG19 · the editor it lives in (the Space), its region there, the sidebar's tab
   *  (absent from a bridge before SEG19: the sidebar, the extension's name) */
  space?: string;
  region?: "sidebar" | "window";
  tab?: Record<string, string> | null;
  when: string;
  fields: PanelField[];
}

export interface PluginInfo {
  id: string;
  version: string;
  name: string;
  source: string;
  state: "loaded" | "failed" | "refused" | "restart";
  problems: Array<{ code: string; en: string; it: string }>;
  verified: boolean;
  package: string | null;
  wired: string[];
  commands: PluginCommand[];
  /** MICRO-PL25 · the declarative panels (absent from a bridge before 88) */
  panels?: PluginPanel[];
  /** MICRO-PL18 (W15a) · loaded from the development folder, where it is (source `dev`) */
  dev?: boolean;
  dev_folder?: string | null;
  /** what does not refuse it but is said (a development copy hiding an installed one, the validator's warnings) */
  notes?: Array<{ code: string; en: string; it: string }>;
}

/** MICRO-PL18 (W15a) · the development folder, as the bridge sees it (only with «Funzioni sperimentali») */
export interface DevInfo {
  /** the folder as set (null: not set) */
  setting: string | null;
  /** set by the environment (S3DGRAPHY_PLUGINS_DEV_DIR): the window cannot change it */
  env: boolean;
  /** the folder is there */
  exists: boolean;
  plugins: Array<{ id: string; version: string; module: string; hosts: string[]; dev_folder: string;
    problems: Array<{ code: string; en: string; it: string }>; warnings: Array<{ code: string; en: string; it: string }> }>;
}

export interface PluginsAnswer {
  ok?: boolean;
  plugins?: PluginInfo[];
  listeners?: Record<string, number>;
  supported?: boolean;
  /** MICRO-PL18 · the bridge knows the development folder (s3Dgraphy with plugins_dev_dir) */
  dev_supported?: boolean;
  /** MICRO-PL18 · present when the page said `dev` (its «Funzioni sperimentali») */
  dev?: DevInfo;
}

/** what the page knows of the plugins (the bridge's last answer) */
export class PluginState {
  plugins: PluginInfo[] = [];
  listeners: Record<string, number> = {};
  /** null: never asked; a string: why there are none here (no bridge, an old one) */
  why: string | null = null;
  /** MICRO-PL18 · the development folder (null: the switch off, or a bridge that does not know it) */
  dev: DevInfo | null = null;
  devSupported = false;
  private subs = new Set<() => void>();

  set(a: PluginsAnswer | null, why: string | null = null): void {
    const before = signature(this.plugins);
    this.plugins = a?.plugins ?? [];
    this.listeners = a?.listeners ?? {};
    this.why = why;
    this.dev = a?.dev ?? null;
    this.devSupported = !!a?.dev_supported;
    if (signature(this.plugins) !== before) this.subs.forEach((f) => f());
  }

  onChange(f: () => void): () => void {
    this.subs.add(f);
    return () => this.subs.delete(f);
  }

  /** the loaded plugins' commands drawn in `slot` (any version this page knows: 1) */
  commandsIn(slot: SlotName): PluginCommand[] {
    const out: PluginCommand[] = [];
    for (const p of this.plugins) {
      if (p.state !== "loaded") continue;
      for (const c of p.commands) if (c.in.some((w) => w.split("@")[0] === slot)) out.push(c);
    }
    return out;
  }

  plugin(id: string): PluginInfo | null {
    return this.plugins.find((p) => p.id === id) ?? null;
  }

  /** the readers (`door.reader`) that take this file, by its name — or, for a
   *  FOLDER (MICRO-GEO09, `door.reader@2`), those that read folders */
  readersFor(path: string, isDir = false): PluginCommand[] {
    if (isDir) return this.commandsIn("door.reader").filter((c) => !!c.folders);
    const name = leafOf(path);
    return this.commandsIn("door.reader").filter((c) => c.accept.some((a) => name.endsWith(a.toLowerCase())));
  }

  /** MICRO-GEO09 · the readers that only CLAIM this file (the page reads it
   *  too): offered as «Leggi come: …», the page's own reading the default */
  claimsFor(path: string): PluginCommand[] {
    const name = leafOf(path);
    const has = (xs: string[] | undefined) => (xs ?? []).some((a) => name.endsWith(a.toLowerCase()));
    return this.commandsIn("door.reader").filter((c) => has(c.claims) && !has(c.accept));
  }
}

const leafOf = (path: string): string => (path.split(/[\\/]/).pop() ?? "").toLowerCase();

/** MICRO-GEO09 · the slot a reader's file or folder fills (its first `path`) */
export function pathSlotOf(c: Pick<PluginCommand, "slots">): string {
  return c.slots.find((s) => s.kind === "path")?.name ?? "path";
}

const signature = (ps: PluginInfo[]): string =>
  JSON.stringify(ps.map((p) => [p.id, p.version, p.state, p.source, p.wired,
    p.commands.map((c) => [c.id, c.in, c.when, c.label, c.primitive ?? "", c.icon ?? "", c.buttons ?? [], c.view ?? "",
      c.claims ?? [], !!c.folders, c.panel ?? ""]),
    (p.panels ?? []).map((x) => [x.id, x.label, x.place, x.when, x.fields])]));

/** `plugin:<id>/<command>` — the row id of a command, the native item's id */
export const runId = (c: Pick<PluginCommand, "plugin" | "id">): string => `plugin:${c.plugin}/${c.id}`;
export function parseRunId(id: string): { plugin: string; command: string } | null {
  const m = /^plugin:([^/]+)\/(.+)$/.exec(id);
  return m ? { plugin: m[1], command: m[2] } : null;
}

export function labelOf(c: Pick<PluginCommand, "label" | "id">, lang: string): string {
  const l = lang.startsWith("it") ? "it" : lang.startsWith("de") ? "de" : "en";
  return c.label[l] ?? c.label.en ?? Object.values(c.label)[0] ?? c.id;
}

// ── when (the twin of s3dgraphy.extensions.slots.parse_when / when_holds) ──

type Clause = ["document", null] | ["selection", "none" | "any" | "one" | "many"] | ["types", string[]];

export function parseWhen(text: string | null | undefined): Clause[] | null {
  const s = String(text ?? "").trim();
  if (!s) return [];
  const out: Clause[] = [];
  for (const raw of s.split(/\s+and\s+/)) {
    const c = raw.trim();
    if (c === "document") { out.push(["document", null]); continue; }
    if (!c.startsWith("selection:")) return null;
    const spec = c.slice("selection:".length).trim();
    if (spec === "none" || spec === "any" || spec === "one" || spec === "many") { out.push(["selection", spec]); continue; }
    const types = spec.split("|").map((x) => x.trim());
    if (!types.length || !types.every((x) => /^[A-Za-z][A-Za-z0-9_:\-]*$/.test(x))) return null;
    out.push(["types", types]);
  }
  return out;
}

/** whether a command is offered: a document open or not, the TYPE of each selected node */
export function whenHolds(text: string | null | undefined, ctx: { document: boolean; types: string[] }): boolean {
  const clauses = parseWhen(text);
  if (!clauses) return false;
  const n = ctx.types.length;
  for (const [kind, arg] of clauses) {
    if (kind === "document" && !ctx.document) return false;
    if (kind === "selection") {
      if ((arg === "none" && n) || (arg === "any" && !n) || (arg === "one" && n !== 1) || (arg === "many" && n < 2)) return false;
    }
    if (kind === "types" && (!n || ctx.types.some((t) => !(arg as string[]).includes(t)))) return false;
  }
  return true;
}

/**
 * The slots of a command filled from what the page knows: `id` ← the selected
 * nodes in order (one per `id` slot), `ids` ← all of them, `path` ← the file
 * (a reader, an import). `string`/`number` are never guessed: the contract
 * refuses a required one missing, with its name.
 */
export function fillSlots(c: Pick<PluginCommand, "slots">, ctx: { selection: string[]; path?: string | null;
  /** MICRO-PL25 · what a tool of the Space placed */
  geometry?: SpaceGeometry | null;
  /** MICRO-PL25 · a panel's fields, by name: what the person wrote fills the slot of that name */
  fields?: Record<string, unknown> }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let next = 0;
  for (const s of c.slots) {
    const typed = ctx.fields && Object.prototype.hasOwnProperty.call(ctx.fields, s.name) ? ctx.fields[s.name] : undefined;
    if (typed !== undefined && typed !== null && typed !== "") { out[s.name] = typed; continue; }
    if (s.kind === "geometry") { if (ctx.geometry) out[s.name] = ctx.geometry; continue; }
    if (s.kind === "id" && next < ctx.selection.length) out[s.name] = ctx.selection[next++];
    else if (s.kind === "ids" && ctx.selection.length) out[s.name] = [...ctx.selection];
    else if (s.kind === "path" && ctx.path) out[s.name] = ctx.path;
  }
  return out;
}

/** the commands of a slot grouped by plugin, in the plugins' order (Tools ▸ Plugin ▸ …) */
export function byPlugin(state: PluginState, slot: SlotName): Array<{ plugin: PluginInfo; commands: PluginCommand[] }> {
  const out: Array<{ plugin: PluginInfo; commands: PluginCommand[] }> = [];
  for (const p of state.plugins) {
    if (p.state !== "loaded") continue;
    const cs = p.commands.filter((c) => c.in.some((w) => w.split("@")[0] === slot));
    if (cs.length) out.push({ plugin: p, commands: cs });
  }
  return out;
}

/** «da disco, non verificato» — what the menus say of a command, as a tooltip */
export function provenance(p: Pick<PluginInfo, "source" | "verified" | "version" | "id">, t: (k: string, v?: Record<string, string>) => string): string {
  const source = p.source === "disk" ? t("plg.disk") : p.source === "dev" ? t("plg.dev") : p.source;
  return t(p.verified ? "plg.verified" : "plg.unverified", { id: p.id, version: p.version, source });
}

/** MICRO-PL18 (W15a) · the mark SEEN in a menu entry, not only in its tooltip:
 *  «non verificato» for a plugin from disk, «sviluppo» for one of the
 *  development folder (never installed, never asked); "" for a verified one
 *  (phase 2: the reviewed list). */
export function badgeOf(p: Pick<PluginInfo, "source" | "verified"> | null | undefined, t: (k: string) => string): string {
  if (!p || p.verified) return "";
  return t(p.source === "dev" ? "plg.badgeDev" : "plg.badgeDisk");
}

// ── MICRO-PL25 (X5) · the slots of phase 2 ────────────────────────────────

/** What a tool of the Space hands its command: the primitive, its vertices in
 *  the model's frame (the scene's, Y up), the document it was placed on. */
export interface SpaceGeometry {
  primitive: string;
  vertices: Array<[number, number, number]>;
  on: string | null;
  /** «model»: the Viewer's scene; «layer» (MICRO-GEO13): the planes of a
   *  plugin's layer, each vertex with its plane's item and place (`at`) */
  frame: "model" | "layer";
  at?: Array<{ on: string; uv: [number, number] }>;
  /** the slices shown «down to» the cursor of the stack (frame «layer») */
  through?: string[];
}

/** the clicks of a primitive (the library's TOOL_PRIMITIVES) */
export function clicksOf(primitive: string): { min: number; max: number | null } | null {
  switch (primitive) {
    case "point": return { min: 1, max: 1 };
    case "line": return { min: 2, max: 2 };
    case "polyline": return { min: 2, max: null };
    case "surface": return { min: 3, max: null };
    default: return null;
  }
}

/** The Inspector sections for a node of this type (`when` read on the inspected node alone). */
export function sectionsFor(state: PluginState, type: string): PluginCommand[] {
  return state.commandsIn("inspector.section").filter((c) => whenHolds(c.when, { document: true, types: type ? [type] : [] }));
}

/** The computed columns of a sheet of the Tabular. */
export function columnsFor(state: PluginState, view: string): PluginCommand[] {
  return state.commandsIn("tabular.column").filter((c) => (c.view || "Units") === view);
}

/** The tools of the Space (those whose primitive the page can lay). */
export function toolsOf(state: PluginState): PluginCommand[] {
  return state.commandsIn("space.tool").filter((c) => !!clicksOf(c.primitive ?? ""));
}

/** The declarative panels of the loaded plugins. */
export function panelsOf(state: PluginState): PluginPanel[] {
  const out: PluginPanel[] = [];
  for (const p of state.plugins) if (p.state === "loaded") out.push(...(p.panels ?? []));
  return out;
}
export function panelNamed(state: PluginState, name: string | null | undefined): PluginPanel | null {
  return name ? panelsOf(state).find((x) => x.name === name) ?? null : null;
}

/** `tool:<plugin>/<command>` — the id of a plugin's tool in the Space's register */
export const toolId = (c: Pick<PluginCommand, "plugin" | "id">): string => `plugin:${c.plugin}/${c.id}`;

/** The key of one value asked of the bridge: the slot, the command, what it is OF. */
export function computeKey(slot: string, c: Pick<PluginCommand, "plugin" | "id">, of = ""): string {
  return `${slot}|${c.plugin}/${c.id}|${of}`;
}

/** A field's starting value: its default, else nothing (a number is never guessed). */
export function fieldStart(f: PanelField): unknown {
  if (f.default !== undefined) return f.default;
  if (f.kind === "choice") return f.options?.[0]?.value ?? "";
  if (f.kind === "check") return false;
  return "";
}

/** What the person wrote in a field, as the slot gets it (a number a number; empty: nothing). */
export function fieldValue(f: PanelField, raw: unknown): unknown {
  if (f.kind === "number") {
    const s = String(raw ?? "").trim().replace(",", ".");
    if (!s) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  if (f.kind === "check") return !!raw;
  const s = String(raw ?? "");
  return s === "" ? undefined : s;
}

/** Rows as the page draws them — the bridge shaped them; a stranger value is said as text. */
export function rowsOf(value: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return value == null ? [] : [{ label: "", value: String(value) }];
  return value.map((r) => (r && typeof r === "object")
    ? { label: String((r as { label?: unknown }).label ?? ""), value: String((r as { value?: unknown }).value ?? "") }
    : { label: "", value: String(r) });
}

/** One line of the status bar, never markup (the bridge already cut it). */
export function statusLine(value: unknown, max = 80): string {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
