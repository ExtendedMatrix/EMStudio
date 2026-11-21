/**
 * MICRO-TIL002 (E.D., 20 Nov 2026) · the SCRIPT EDITOR, a window type of the
 * shell (`script`) — Blender's Text Editor beside its Python Console.
 *
 * «Ne farei due come in Blender: un editor di script e una console». The
 * console (`console-window.ts`) is the prompt; this is the page a script is
 * written on: line numbers and Python's colours (CodeMirror 6 — the frontend
 * had no code editor), `.py` files opened and saved in the project's
 * `scripts/` folder (beside the em.json; with no folder, in this browser, for
 * the project), «Run Script» (Alt+P, as in Blender) in the SAME session as the
 * console, whose window shows what it printed, and a menu of templates taken
 * from the `import em` reference. A script changed and not saved says so in
 * the window's title (●).
 *
 * Pure of `main.ts`: the page gives a {@link ScriptHost}; the buffer lives in
 * the page (per window) so a rebuild of the area loses nothing.
 */
import { floating } from "./floating";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, indentOnInput, bracketMatching } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { autocompletion, completionKeymap, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { asAnswer, completionTail, type CompleteAnswer } from "./console-window";
import { classHighlighter } from "@lezer/highlight";
import { betaMark } from "./beta";

/** What the page gives the editor. */
export interface ScriptHost {
  t(key: string, vars?: Record<string, string>): string;
  /** where the scripts are: the project's `scripts/` folder (its path), this
   *  browser for the project (no folder: a room, a document never saved), or
   *  nowhere (no document) */
  where(): { kind: "folder" | "browser" | "none"; label: string };
  /** the `.py` names there, sorted */
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  write(name: string, text: string): Promise<void>;
  /** run in the console's session; its output goes to the console */
  run(code: string, name: string, opts: { dryRun?: boolean }): Promise<void>;
  /** the app's dialogs (no `prompt`: the desktop's WKWebView opens nothing) */
  ask(prompt: string, initial: string): Promise<string | null>;
  /** a yes/no of the app (app-dialog), `ok` the word of its button — never the
   *  native `confirm`, which the desktop's WKWebView does not show */
  askConfirm(message: string, ok: string): Promise<boolean>;
  /** the name or the «modified» mark changed: the window's title follows */
  changed(buf: ScriptBuffer): void;
  /** MICRO-SEG02 p.4 · what may follow the text before the cursor — the SAME
   *  answer the console's Tab gets (`/py/complete`: kinds, signature) */
  complete?(text: string): Promise<CompleteAnswer | string[]>;
  toast?(message: string): void;
}

/** One window's script: its file (null: not saved yet), the text, the text
 *  as last read or saved (modified = they differ). */
export interface ScriptBuffer {
  name: string | null;
  text: string;
  saved: string;
  /** a name to offer at the first save (a template's) */
  suggest?: string;
}

export function newScriptBuffer(): ScriptBuffer {
  return { name: null, text: "", saved: "" };
}

export function isModified(b: ScriptBuffer): boolean {
  return b.text !== b.saved;
}

/** The name shown: the file, else «untitled.py»; ● when modified. */
export function scriptTitle(b: ScriptBuffer, untitled: string): string {
  return `${b.name ?? untitled}${isModified(b) ? " ●" : ""}`;
}

/** A name typed by a person, made a safe `.py` file name of the folder (no
 *  path, no hidden file); null when nothing is left. */
export function scriptFileName(input: string): string | null {
  let s = input.trim().replace(/\\/g, "/");
  s = s.slice(s.lastIndexOf("/") + 1);
  s = s.replace(/\.py$/i, "");
  s = s.replace(/[^\p{L}\p{N}_.\- ]+/gu, "_").replace(/^[.\s]+/, "").trim();
  if (!s) return null;
  return `${s}.py`;
}

/** The `.py` names of a folder's listing, sorted the way a person reads them. */
export function pyNames(names: string[]): string[] {
  return [...new Set(names.filter((n) => /\.py$/i.test(n) && !n.startsWith(".")))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

// ── the templates · from the `import em` reference (docs-api) ───────────────

export interface ScriptTemplate {
  id: string;
  /** i18n key of the menu's label */
  labelKey: string;
  file: string;
  code: string;
}

/** Four examples of the reference, one per thing a study asks of a script:
 *  read (an epoch's units), write in series (rename), make a file (a table),
 *  write on the selection (a property). Code in English like the reference;
 *  only the menu is translated. */
export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: "epoch-units", labelKey: "sce.tpl.epochUnits", file: "epoch_units.py",
    code: `# The units of an epoch: the units whose first epoch is EPOCH.
# (reference: em.graph — nodes, edges)
import em

EPOCH = "Roman period"       # the epoch's name or id, as the Matrix shows it

epoch = em.graph.find(EPOCH)
if epoch is None:
    names = [e.name for e in em.graph.nodes(type="EpochNode")]
    print("No epoch", repr(EPOCH), "· the epochs are:", ", ".join(names))
else:
    units = [e.source for e in epoch.edges(type="has_first_epoch", direction="in")]
    for u in sorted(units, key=lambda n: n.name or n.id):
        print(u.name, "·", u.type, "·", u.description or "")
    print(len(units), "units in", epoch.name)
`,
  },
  {
    id: "rename-series", labelKey: "sce.tpl.renameSeries", file: "rename_series.py",
    code: `# Rename in series: every node of TYPE whose name starts with OLD
# starts with NEW instead. One em.write block = one step of Edit ▸ Undo,
# one line of the Log. Press «Try» first: a proof, nothing applied.
# (reference: em.write — update)
import em

OLD, NEW = "US", "SU"
TYPE = "US"                  # the node type (None: every type)

todo = [n for n in em.graph.nodes(type=TYPE) if (n.name or "").startswith(OLD)]
with em.write(f"Rename {OLD}… → {NEW}…") as tx:
    for n in todo:
        tx.update(n, "name", NEW + n.name[len(OLD):])
print(len(todo), "renamed")
`,
  },
  {
    id: "export-table", labelKey: "sce.tpl.exportTable", file: "export_table.py",
    code: `# Export a table: one row per unit — id, name, type, first epoch,
# description — as CSV. OUT = a path writes a file; None prints it here.
# (reference: em.graph — nodes, edges)
import csv
import io
import em

TYPE = "US"
OUT = None                   # e.g. "/Users/me/units.csv"

rows = []
for u in em.graph.nodes(type=TYPE):
    epochs = [e.target.name for e in u.edges(type="has_first_epoch")]
    rows.append([u.id, u.name, u.type, ", ".join(epochs), u.description or ""])

table = io.StringIO()
w = csv.writer(table)
w.writerow(["id", "name", "type", "epoch", "description"])
w.writerows(rows)
if OUT:
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        f.write(table.getvalue())
    print(len(rows), "rows written to", OUT)
else:
    print(table.getvalue())
`,
  },
  {
    id: "selection-property", labelKey: "sce.tpl.selectionProperty", file: "selection_property.py",
    code: `# Add a property to the selection: the same quale and value on every
# selected unit (a new property node where the unit has none).
# For a controlled value: tx.set_property(u, QUALE, concept=URI).
# (reference: em.app.selection, em.write — set_property)
import em

QUALE = "material"
VALUE = "limestone"

units = [em.graph.node(i) for i in em.app.selection()]
if not units:
    print("Select one or more units first.")
else:
    with em.write(f"{QUALE} = {VALUE} on {len(units)} units") as tx:
        for u in units:
            tx.set_property(u, QUALE, VALUE)
    print("written on", ", ".join(u.name or u.id for u in units))
`,
  },
];

// ── the window ──────────────────────────────────────────────────────────────

type El = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => HTMLElementTagNameMap[K];
function maker(doc: Document): El {
  return (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
}

export interface ScriptEditorMount {
  root: HTMLElement;
  /** the buffer replaced from outside (another window opened the file…) */
  reload(): void;
  /** the place changed (a document opened, saved somewhere): the head says it */
  refresh(): void;
  focus(): void;
  destroy(): void;
  /** the tests' handle */
  run(dryRun?: boolean): Promise<void>;
  save(as?: boolean): Promise<boolean>;
  open(name: string): Promise<boolean>;
  template(id: string): Promise<boolean>;
  setText(text: string): void;
}

/**
 * The editor in an area. `buf` is the window's (the page keeps it): what is
 * typed goes into it, and a rebuild of the area finds it as it was.
 */
export function mountScriptEditor(doc: Document, host: ScriptHost, buf: ScriptBuffer): ScriptEditorMount {
  const t = host.t;
  const el = maker(doc);
  const root = el("div", "sce");
  root.dataset.scriptEditor = "1";

  const head = el("div", "sce-head");
  const title = el("span", "sce-title");
  title.dataset.sce = "title";
  const btn = (key: string, act: string, fn: () => void, cls = ""): HTMLButtonElement => {
    const b = el("button", cls, t(`sce.${key}`));
    b.type = "button";
    b.title = t(`sce.${key}Title`);
    b.dataset.sce = act;
    b.addEventListener("click", fn);
    return b;
  };
  const runB = btn("run", "run", () => void run(false), "primary");
  const tryB = btn("try", "try", () => void run(true));
  const newB = btn("new", "new", () => void fresh());
  const openB = btn("open", "open", () => void showOpen());
  const saveB = btn("save", "save", () => void save(false));
  const saveAsB = btn("saveAs", "save-as", () => void save(true));
  const tplB = btn("templates", "templates", () => showTemplates());
  openB.textContent = `${t("sce.open")} ▾`;
  tplB.textContent = `${t("sce.templates")} ▾`;
  const beta = betaMark(doc);
  const where = el("span", "sce-where");
  where.dataset.sce = "where";
  head.append(title, beta, newB, openB, saveB, saveAsB, tplB, runB, tryB, where);

  const menu = el("div", "sce-menu");
  menu.hidden = true;
  menu.dataset.sce = "menu";
  const body = el("div", "sce-body");
  root.append(head, menu, body);

  let lastModified = isModified(buf);
  let lastName = buf.name;
  const paintTitle = (): void => {
    title.textContent = scriptTitle(buf, t("sce.untitled"));
    title.title = buf.name ? t("sce.fileTitle", { name: buf.name, where: host.where().label }) : t("sce.untitledTitle");
    title.classList.toggle("sce-modified", isModified(buf));
    root.dataset.modified = isModified(buf) ? "1" : "0";
    if (lastModified !== isModified(buf) || lastName !== buf.name) {
      lastModified = isModified(buf);
      lastName = buf.name;
      host.changed(buf);
    }
  };
  const paintWhere = (): void => {
    const w = host.where();
    where.textContent = w.kind === "none" ? t("sce.whereNone") : w.kind === "browser" ? t("sce.whereBrowser") : t("sce.whereFolder", { path: w.label });
    where.title = w.kind === "folder" ? w.label : "";
    for (const b of [openB, saveB, saveAsB]) b.disabled = w.kind === "none";
  };
  // MICRO-SEG02 p.4 · the editor's list: the bridge's answer as CodeMirror options
  const CM_TYPE: Record<string, string> = { module: "namespace", class: "class", function: "function", method: "method",
    property: "property", value: "variable", keyword: "keyword", string: "text", param: "variable" };
  async function completeFromSession(ctx: CompletionContext): Promise<CompletionResult | null> {
    const before = ctx.state.sliceDoc(0, ctx.pos);
    const line = before.slice(before.lastIndexOf("\n") + 1);
    // typing: only after a name, a dot, an open call or inside a string
    if (!ctx.explicit && !/[A-Za-z_.(]$|["'][^"']*$|,\s*$/.test(line)) return null;
    if (!line.trim()) return null;
    const a = asAnswer(await host.complete!(before).catch(() => [] as string[]));
    if (ctx.aborted) return null;
    const tail = a.tail ?? completionTail(before);
    const options: Completion[] = a.items.map((i) => ({
      label: i.text, displayLabel: i.label ?? i.text.split(".").pop() ?? i.text,
      type: CM_TYPE[i.kind] ?? "variable", ...(i.detail ? { detail: i.detail.length > 60 ? i.detail.slice(0, 59) + "…" : i.detail, info: i.detail } : {}) }));
    if (a.signature) options.unshift({ label: tail, displayLabel: a.signature.text, type: "function", apply: tail, boost: 99,
      ...(a.signature.doc ? { info: a.signature.doc } : {}) });
    if (!options.length) return null;
    return { from: ctx.pos - tail.length, options, filter: false };
  }


  const view = new EditorView({
    parent: body,
    state: EditorState.create({
      doc: buf.text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        python(),
        // MICRO-SEG02 p.4 · the list of the live session (as the console's Tab):
        // while typing after a name or a dot, and on Ctrl+Space
        ...(host.complete ? [autocompletion({ override: [completeFromSession], activateOnTyping: true, icons: true })] : []),
        syntaxHighlighting(classHighlighter),
        EditorState.tabSize.of(4),
        keymap.of([
          { key: "Mod-s", run: () => { void save(false); return true; } },
          { key: "Mod-Shift-s", run: () => { void save(true); return true; } },
          ...completionKeymap,
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          buf.text = u.state.doc.toString();
          paintTitle();
        }),
      ],
    }),
  });

  const setText = (text: string): void => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    buf.text = text;
    paintTitle();
  };

  const hideMenu = (): void => { menu.hidden = true; menu.replaceChildren(); };
  const showMenu = (anchor: HTMLElement, items: HTMLElement[]): void => {
    menu.replaceChildren(...items);
    menu.style.left = `${anchor.offsetLeft}px`;
    menu.style.top = `${anchor.offsetTop + anchor.offsetHeight + 2}px`;
    menu.hidden = false;
    floating(menu, { close: hideMenu, opener: anchor, name: "sce-menu" });   // MICRO-SEG13
  };
  const menuItem = (label: string, fn: () => void, data: Record<string, string> = {}): HTMLButtonElement => {
    const b = el("button", "sce-item", label);
    b.type = "button";
    Object.assign(b.dataset, data);
    b.addEventListener("click", () => { hideMenu(); fn(); });
    return b;
  };
  // (MICRO-SEG13 · a press outside, Esc: `floating`)

  /** Leave the buffer? (asked when it holds unsaved changes) */
  const mayLeave = async (): Promise<boolean> => !isModified(buf) || host.askConfirm(t("sce.discard", { name: buf.name ?? t("sce.untitled") }), t("sce.discardOk"));

  async function fresh(): Promise<void> {
    if (!(await mayLeave())) return;
    buf.name = null; buf.saved = ""; buf.suggest = undefined;
    setText("");
    view.focus();
  }

  async function open(name: string): Promise<boolean> {
    if (name !== buf.name && !(await mayLeave())) return false;
    let text: string;
    try { text = await host.read(name); } catch (e) { host.toast?.(t("sce.readFailed", { name, why: String((e as Error)?.message ?? e) })); return false; }
    buf.name = name; buf.saved = text; buf.suggest = undefined;
    setText(text);
    view.focus();
    return true;
  }

  async function showOpen(): Promise<void> {
    if (!menu.hidden) { hideMenu(); return; }
    let names: string[] = [];
    try { names = await host.list(); } catch { names = []; }
    const items: HTMLElement[] = names.map((n) => menuItem(n, () => void open(n), { sceFile: n }));
    if (!items.length) { const e = el("div", "sce-empty", t("sce.noScripts")); items.push(e); }
    showMenu(openB, items);
  }

  async function template(id: string): Promise<boolean> {
    const tp = SCRIPT_TEMPLATES.find((x) => x.id === id);
    if (!tp || !(await mayLeave())) return false;
    buf.name = null; buf.saved = ""; buf.suggest = tp.file;
    setText(tp.code);
    view.focus();
    return true;
  }
  function showTemplates(): void {
    if (!menu.hidden) { hideMenu(); return; }
    showMenu(tplB, SCRIPT_TEMPLATES.map((tp) => menuItem(t(tp.labelKey), () => void template(tp.id), { sceTemplate: tp.id })));
  }

  async function save(as: boolean): Promise<boolean> {
    if (host.where().kind === "none") { host.toast?.(t("sce.whereNone")); return false; }
    let name = buf.name;
    if (as || !name) {
      const typed = await host.ask(t("sce.saveAsPrompt"), name ?? buf.suggest ?? "script.py");
      if (typed == null) return false;
      name = scriptFileName(typed);
      if (!name) { host.toast?.(t("sce.badName")); return false; }
      if (name !== buf.name) {
        let taken: string[] = [];
        try { taken = await host.list(); } catch { taken = []; }
        if (taken.includes(name) && !(await host.askConfirm(t("sce.overwrite", { name }), t("sce.overwriteOk")))) return false;
      }
    }
    const text = buf.text;
    try { await host.write(name, text); } catch (e) { host.toast?.(t("sce.writeFailed", { name, why: String((e as Error)?.message ?? e) })); return false; }
    buf.name = name; buf.saved = text; buf.suggest = undefined;
    paintTitle();
    host.toast?.(t("sce.saved", { name }));
    return true;
  }

  let running = false;
  async function run(dryRun: boolean): Promise<void> {
    if (running || !buf.text.trim()) return;
    running = true;
    runB.disabled = tryB.disabled = true;
    try { await host.run(buf.text, buf.name ?? t("sce.untitled"), { dryRun }); }
    finally { running = false; runB.disabled = tryB.disabled = false; }
  }

  // the editor keeps its keys: none reaches the page's shortcuts (Delete, ⌘Z
  // of the graph…). Alt+P (Run Script, as in Blender) by the key's PLACE: on
  // the Mac ⌥P types «π»; Alt+Shift+P is «Try».
  root.addEventListener("keydown", (ev) => {
    if (ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.code === "KeyP") { ev.preventDefault(); void run(ev.shiftKey); }
    ev.stopPropagation();
  });

  paintWhere();
  paintTitle();
  return {
    root,
    reload() {
      if (view.state.doc.toString() !== buf.text) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: buf.text } });
      paintTitle();
    },
    refresh() { paintWhere(); paintTitle(); },
    focus() { view.focus(); },
    destroy() { hideMenu(); view.destroy(); root.remove(); },
    run, save, open, template, setText,
  };
}
