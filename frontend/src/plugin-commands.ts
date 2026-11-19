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
 */

export type SlotName = "menu.tools" | "menu.file.import" | "menu.file.export" | "export.narrative"
  | "context.node" | "door.reader" | "check";

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
}

export interface PluginsAnswer {
  ok?: boolean;
  plugins?: PluginInfo[];
  listeners?: Record<string, number>;
  supported?: boolean;
}

/** what the page knows of the plugins (the bridge's last answer) */
export class PluginState {
  plugins: PluginInfo[] = [];
  listeners: Record<string, number> = {};
  /** null: never asked; a string: why there are none here (no bridge, an old one) */
  why: string | null = null;
  private subs = new Set<() => void>();

  set(a: PluginsAnswer | null, why: string | null = null): void {
    const before = signature(this.plugins);
    this.plugins = a?.plugins ?? [];
    this.listeners = a?.listeners ?? {};
    this.why = why;
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

  /** the readers (`door.reader@1`) that accept this file, by its name */
  readersFor(path: string): PluginCommand[] {
    const name = (path.split(/[\\/]/).pop() ?? "").toLowerCase();
    return this.commandsIn("door.reader").filter((c) => c.accept.some((a) => name.endsWith(a.toLowerCase())));
  }
}

const signature = (ps: PluginInfo[]): string =>
  JSON.stringify(ps.map((p) => [p.id, p.version, p.state, p.wired, p.commands.map((c) => [c.id, c.in, c.when, c.label])]));

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
export function fillSlots(c: Pick<PluginCommand, "slots">, ctx: { selection: string[]; path?: string | null }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let next = 0;
  for (const s of c.slots) {
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
  return t(p.verified ? "plg.verified" : "plg.unverified", { id: p.id, version: p.version, source: p.source === "disk" ? t("plg.disk") : p.source });
}
