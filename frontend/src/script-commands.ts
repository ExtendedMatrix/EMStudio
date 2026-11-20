/**
 * MICRO-SEG02 p.1–2 (E.D., 20 Nov 2026: «molte funzionalità possono essere
 * esposte in Python») · WHAT A SCRIPT MAY GIVE A COMMAND, read from the one
 * table `script-commands.json`.
 *
 * Like Blender's operators: `em.app.commands.run("door", paths=[…], confirm=True)`
 * reaches the command with its parameters (before this file the host hook
 * called `runCommand(id)` and the parameters were lost). A command whose values
 * are all there runs without its window (EXEC); with values missing it opens
 * its window, filled with what was given (INVOKE). The named ACTIONS are the
 * keys and gestures that make sense in a script (add a unit above, connect two
 * nodes, move to an epoch, fold a group, frame a node…): ids of their own, run
 * by the same door. The keys themselves do not change.
 *
 * Pure: no DOM. `main.ts` registers what each form and action does
 * (`registerScriptForm`, `registerScriptAction`); the console's completion and
 * the reference of docs-api read the same table.
 */
import TABLE from "./script-commands.json";

export type ParamType = "str" | "int" | "float" | "bool" | "list[str]" | "enum";

export interface ParamDecl {
  name: string;
  type: ParamType;
  default?: unknown;
  choices?: string[];
  required?: boolean;
  /** English, as a docstring */
  doc: string;
}

export type FormKind = "exec" | "invoke" | "window" | "none";

export interface CommandDecl {
  form: FormKind;
  doc: string;
  params: ParamDecl[];
  /** invoke: the params that, given, make it run without its window */
  exec_when?: string[];
  /** window / none: what a script lacks to reach it */
  why?: string;
  returns?: string;
}

export interface ActionDecl {
  scope: "graph" | "space" | "window" | "app";
  doc: string;
  params: ParamDecl[];
  returns?: string;
}

export interface KeymapLink { command?: string; action?: string; why?: string }

export const SCRIPT_COMMANDS = TABLE.commands as unknown as Record<string, CommandDecl>;
export const SCRIPT_ACTIONS = TABLE.actions as unknown as Record<string, ActionDecl>;
export const KEYMAP_LINKS = TABLE.keymap as unknown as Record<string, KeymapLink>;

/** The declaration of a command or an action (null: neither). */
export function declOf(id: string): { kind: "command"; decl: CommandDecl } | { kind: "action"; decl: ActionDecl } | null {
  if (Object.prototype.hasOwnProperty.call(SCRIPT_COMMANDS, id)) return { kind: "command", decl: SCRIPT_COMMANDS[id] };
  if (Object.prototype.hasOwnProperty.call(SCRIPT_ACTIONS, id)) return { kind: "action", decl: SCRIPT_ACTIONS[id] };
  return null;
}

/** Why a set of values is refused: an i18n key and its words (the page says it). */
export interface ParamProblem { key: string; vars: Record<string, string> }

/** The values a command receives: the declared ones, typed, with their defaults. */
export interface Bound { values: Record<string, unknown>; given: Set<string>; problems: ParamProblem[] }

function typed(p: ParamDecl, v: unknown): { ok: true; v: unknown } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, v: null };
  switch (p.type) {
    case "str": return typeof v === "string" ? { ok: true, v } : typeof v === "number" ? { ok: true, v: String(v) } : { ok: false };
    case "int": return typeof v === "number" && Number.isInteger(v) ? { ok: true, v } : { ok: false };
    case "float": return typeof v === "number" && Number.isFinite(v) ? { ok: true, v } : { ok: false };
    case "bool": return typeof v === "boolean" ? { ok: true, v } : { ok: false };
    case "list[str]":
      if (typeof v === "string") return { ok: true, v: [v] };   // one path is a list of one
      return Array.isArray(v) && v.every((x) => typeof x === "string") ? { ok: true, v: [...v] } : { ok: false };
    case "enum": return typeof v === "string" && (p.choices ?? []).includes(v) ? { ok: true, v } : { ok: false };
  }
  return { ok: false };
}

/** The values a script gave, checked against the declaration: unknown names,
 *  wrong types, a required one missing are PROBLEMS (never dropped in silence). */
export function bindParams(id: string, slots: Record<string, unknown>): Bound {
  const d = declOf(id);
  const params = d?.decl.params ?? [];
  const values: Record<string, unknown> = {};
  const given = new Set<string>();
  const problems: ParamProblem[] = [];
  const names = params.map((p) => p.name);
  for (const k of Object.keys(slots ?? {})) {
    if (!names.includes(k))
      problems.push(names.length
        ? { key: "py.paramUnknown", vars: { id, name: k, known: names.join(", ") } }
        : { key: "py.paramNone", vars: { id, name: k } });
  }
  for (const p of params) {
    const has = slots && Object.prototype.hasOwnProperty.call(slots, p.name) && slots[p.name] !== null && slots[p.name] !== undefined;
    if (has) {
      const r = typed(p, slots[p.name]);
      if (!r.ok) {
        problems.push({ key: p.type === "enum" ? "py.paramChoice" : "py.paramType",
          vars: { id, name: p.name, type: p.type, choices: (p.choices ?? []).join(", ") } });
        continue;
      }
      values[p.name] = r.v;
      given.add(p.name);
    } else {
      values[p.name] = p.default ?? null;
      if (p.required) problems.push({ key: "py.paramMissing", vars: { id, name: p.name } });
    }
  }
  return { values, given, problems };
}

/** EXEC or INVOKE: an invoke command runs without its window when every value
 *  of its `exec_when` was given (true / a value). */
export function runsWithoutWindow(decl: CommandDecl, b: Bound): boolean {
  if (decl.form === "exec") return true;
  if (decl.form !== "invoke") return false;
  return (decl.exec_when ?? []).every((n) => b.given.has(n) && b.values[n] !== false);
}

/** A parameter as Python writes it: `path: str = None`. */
export function paramText(p: ParamDecl): string {
  const py = (v: unknown): string => v === null || v === undefined ? "None" : v === true ? "True" : v === false ? "False"
    : typeof v === "string" ? JSON.stringify(v) : String(v);
  const type = p.type === "enum" ? `Literal[${(p.choices ?? []).map((c) => JSON.stringify(c)).join(", ")}]` : p.type;
  return p.required ? `${p.name}: ${type}` : `${p.name}: ${type} = ${py(p.default)}`;
}

/** `run("open", path: str = None, replace: bool = False)` */
export function signatureOf(id: string): string | null {
  const d = declOf(id);
  if (!d) return null;
  return `run(${[JSON.stringify(id), ...d.decl.params.map(paramText)].join(", ")})`;
}

/** What the bridge is told at the session's opening (`/py/session` `commands`):
 *  the console completes from it, `em.app.commands.list()` answers from it. */
export interface CatalogEntry {
  id: string;
  kind: "command" | "action";
  form: FormKind | "action";
  doc: string;
  params: ParamDecl[];
  label?: string;
  why?: string;
  returns?: string;
  scope?: string;
}

export function scriptCatalog(label: (id: string) => string | null = () => null): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const [id, d] of Object.entries(SCRIPT_COMMANDS)) {
    if (d.form === "none") continue;
    const l = label(id);
    out.push({ id, kind: "command", form: d.form, doc: d.doc, params: d.params,
      ...(l ? { label: l } : {}), ...(d.why ? { why: d.why } : {}), ...(d.returns ? { returns: d.returns } : {}) });
  }
  for (const [id, d] of Object.entries(SCRIPT_ACTIONS))
    out.push({ id, kind: "action", form: "action", doc: d.doc, params: d.params, scope: d.scope, ...(d.returns ? { returns: d.returns } : {}) });
  return out;
}

// ── what each form and action does (registered by main.ts) ──────────────────

export type ScriptImpl = (values: Record<string, unknown>, b: Bound) => unknown | Promise<unknown>;
const forms = new Map<string, ScriptImpl>();
const actions = new Map<string, ScriptImpl>();
/** The script form of a menu command (it runs instead of pressing its button). */
export function registerScriptForm(id: string, fn: ScriptImpl): void { forms.set(id, fn); }
export function registerScriptAction(id: string, fn: ScriptImpl): void { actions.set(id, fn); }
export function scriptFormOf(id: string): ScriptImpl | null { return forms.get(id) ?? null; }
export function scriptActionOf(id: string): ScriptImpl | null { return actions.get(id) ?? null; }
/** The ids declared in the table that nothing registered (a check reads it). */
export function unregistered(): string[] {
  return [
    ...Object.keys(SCRIPT_ACTIONS).filter((id) => !actions.has(id)),
  ];
}

/** An error a script reads in its language (the page's `t` gives the words). */
export class ScriptRefusal extends Error {
  constructor(readonly problems: ParamProblem[], message: string) { super(message); }
}
