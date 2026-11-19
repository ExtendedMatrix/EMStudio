/**
 * MICRO-PL25-SLOT-DELLA-FASE-2 (X5, E.D. 18-19 Nov 2026) · WHAT A PLUGIN SHOWS,
 * drawn by the page.
 *
 * A declarative panel (`panel@1`) and an Inspector section
 * (`inspector.section@1`) are DATA the bridge describes (`/py/plugins`) and
 * values it computes (`/py/compute`): this module turns them into elements,
 * every word as TEXT (`textContent`, never `innerHTML`) — a plugin brings no
 * HTML nor JavaScript into the page (SPEC-plugin §14.8), so nothing a plugin
 * says can become markup here, not even its labels.
 *
 * The panel's fields are the person's: what they write stays in `fields`
 * (the caller keeps it per panel) and fills the slot of the same name when a
 * button invokes its command. A value field shows what a read-only command
 * returned (rows), «…» while it is computed, the reason when it could not be.
 *
 * No store, no bridge: callbacks (`scripts/check-plugin-slots.mjs`, linkedom).
 */
import type { PanelField, PluginCommand, PluginPanel } from "./plugin-commands";
import { fieldStart, fieldValue, labelOf, rowsOf } from "./plugin-commands";

export interface ValueState {
  /** undefined: not asked yet / being computed */
  ok?: boolean;
  value?: unknown;
  /** the reason, in the page's language */
  why?: string;
}

export interface PanelCtx {
  lang: string;
  t: (k: string, v?: Record<string, string>) => string;
  /** the person's values of this panel, by field name (kept by the caller) */
  fields: Record<string, unknown>;
  onField: (name: string, value: unknown) => void;
  /** the value of a `value` field (its command, computed) */
  valueOf: (f: PanelField) => ValueState;
  /** a button pressed: its command, with the fields' values */
  onButton: (f: PanelField) => void;
  /** a command of the panel's plugin, by id (the button's label is the command's) */
  command: (id: string) => PluginCommand | null;
  /** the first selected node, and its name (a `node` field takes it) */
  selection: () => { id: string; name: string } | null;
  nodeName: (id: string) => string;
  /** «da disco, non verificato» / «sviluppo» / "" */
  mark: string;
  provenance: string;
  /** false: no document, or the panel's `when` does not hold */
  enabled: boolean;
  /** why it is not enabled */
  disabledWhy?: string;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const words = (r: Record<string, string> | undefined, lang: string, fallback = ""): string =>
  r ? labelOf({ label: r, id: fallback }, lang) : fallback;

/** Rows of values: a small table of label → value (a label may be empty). */
export function rowsInto(host: HTMLElement, value: unknown): void {
  const rows = rowsOf(value);
  const dl = el("dl", "plg-rows");
  for (const r of rows) {
    const dt = el("dt", "plg-rows-k", r.label);
    const dd = el("dd", "plg-rows-v", r.value);
    if (!r.label) dt.classList.add("empty");
    dl.append(dt, dd);
  }
  host.appendChild(dl);
}

function valueInto(host: HTMLElement, v: ValueState, t: PanelCtx["t"]): void {
  if (v.ok === undefined) { host.appendChild(el("div", "plg-pending", t("plg.computing"))); return; }
  if (!v.ok) { host.appendChild(el("div", "plg-why", v.why ?? t("plg.noValue"))); return; }
  const rows = rowsOf(v.value);
  if (!rows.length) { host.appendChild(el("div", "plg-empty", t("plg.nothingToShow"))); return; }
  rowsInto(host, v.value);
}

/** One field of a panel. */
function fieldInto(host: HTMLElement, f: PanelField, ctx: PanelCtx, panel: PluginPanel): void {
  const box = el("div", `plg-field plg-field-${f.kind}`);
  box.dataset.kind = f.kind;
  if (f.name) box.dataset.field = f.name;
  if (f.command) box.dataset.command = f.command;
  const label = words(f.label, ctx.lang, f.name ?? f.command ?? f.kind);
  if (f.help) box.title = words(f.help, ctx.lang);
  if (f.kind === "button") {
    const c = f.command ? ctx.command(f.command) : null;
    const b = el("button", "plg-btn", label || (c ? labelOf(c, ctx.lang) : f.command ?? ""));
    b.type = "button";
    b.disabled = !ctx.enabled || !c;
    if (!ctx.enabled && ctx.disabledWhy) b.title = ctx.disabledWhy;
    b.addEventListener("click", () => ctx.onButton(f));
    box.appendChild(b);
    host.appendChild(box);
    return;
  }
  if (f.kind === "value") {
    box.appendChild(el("div", "plg-label", label));
    valueInto(box, ctx.valueOf(f), ctx.t);
    host.appendChild(box);
    return;
  }
  const name = f.name ?? "";
  const id = `plg-${panel.plugin}-${panel.id}-${name}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const lab = el("label", "plg-label", label);
  lab.htmlFor = id;
  box.appendChild(lab);
  const now = Object.prototype.hasOwnProperty.call(ctx.fields, name) ? ctx.fields[name] : fieldStart(f);
  if (f.kind === "choice") {
    const sel = el("select", "plg-input");
    sel.id = id;
    for (const o of f.options ?? []) {
      const opt = el("option", "", words(o.label, ctx.lang, o.value));
      opt.value = o.value;
      if (o.value === String(now ?? "")) opt.setAttribute("selected", "");
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => ctx.onField(name, sel.value));
    box.appendChild(sel);
  } else if (f.kind === "check") {
    const cb = el("input", "plg-input");
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = !!now;
    cb.addEventListener("change", () => ctx.onField(name, cb.checked));
    lab.prepend(cb);
    lab.htmlFor = "";
  } else if (f.kind === "node") {
    const row = el("div", "plg-node");
    const shown = el("span", "plg-node-name", typeof now === "string" && now ? ctx.nodeName(now) : ctx.t("plg.noNode"));
    const use = el("button", "plg-btn plg-use", ctx.t("plg.useSelection"));
    use.type = "button";
    const sel = ctx.selection();
    use.disabled = !sel;
    use.title = sel ? sel.name : ctx.t("plg.selectFirst");
    use.addEventListener("click", () => { const s = ctx.selection(); if (s) ctx.onField(name, s.id); });
    row.append(shown, use);
    box.appendChild(row);
  } else {
    const inp = el("input", "plg-input");
    inp.id = id;
    inp.type = f.kind === "number" ? "number" : "text";
    if (f.kind === "number") {
      if (f.min !== undefined) inp.min = String(f.min);
      if (f.max !== undefined) inp.max = String(f.max);
      inp.step = f.step !== undefined ? String(f.step) : "any";
    }
    inp.value = now == null ? "" : String(now);
    inp.addEventListener("change", () => ctx.onField(name, fieldValue(f, inp.value)));
    box.appendChild(inp);
    if (f.unit) box.appendChild(el("span", "plg-unit", f.unit));
  }
  host.appendChild(box);
}

/** A declarative panel, whole: its head (name, provenance, mark), its fields. */
export function renderPanelInto(host: HTMLElement, panel: PluginPanel | null, ctx: PanelCtx, missing?: string): void {
  host.textContent = "";
  const root = el("div", "plg-panel");
  if (!panel) {
    root.appendChild(el("div", "plg-why", ctx.t("plg.panelGone", { panel: missing ?? "—" })));
    host.appendChild(root);
    return;
  }
  root.dataset.panel = panel.name;
  const head = el("div", "plg-panel-head");
  head.appendChild(el("b", "", words(panel.label, ctx.lang, panel.id)));
  if (ctx.mark) head.appendChild(el("span", "dd-badge plg-badge", ctx.mark));
  head.title = ctx.provenance;
  root.appendChild(head);
  if (!ctx.enabled && ctx.disabledWhy) root.appendChild(el("div", "plg-why", ctx.disabledWhy));
  for (const f of panel.fields) fieldInto(root, f, ctx, panel);
  if (!panel.fields.length) root.appendChild(el("div", "plg-empty", ctx.t("plg.nothingToShow")));
  host.appendChild(root);
}

export interface SectionCtx {
  lang: string;
  t: (k: string, v?: Record<string, string>) => string;
  value: ValueState;
  /** the buttons' commands (of the same plugin), those that exist */
  buttons: PluginCommand[];
  onButton: (c: PluginCommand) => void;
  pluginName: string;
  mark: string;
  provenance: string;
  readOnly: boolean;
}

/** An Inspector section of a plugin: `h3.insp-sect` (the Inspector's one
 *  pass makes it a section that closes), then the rows, then the buttons. */
export function renderSectionInto(host: HTMLElement, c: PluginCommand, ctx: SectionCtx): void {
  const h = el("h3", "insp-sect plg-sect", labelOf(c, ctx.lang));
  h.dataset.plgSection = `${c.plugin}/${c.id}`;
  h.title = ctx.provenance;
  const by = el("span", "plg-by", ` · ${ctx.pluginName}`);
  h.appendChild(by);
  if (ctx.mark) h.appendChild(el("span", "dd-badge plg-badge", ctx.mark));
  host.appendChild(h);
  const body = el("div", "plg-sect-body");
  body.dataset.plgSection = `${c.plugin}/${c.id}`;
  valueInto(body, ctx.value, ctx.t);
  if (ctx.buttons.length) {
    const acts = el("div", "insp-actions plg-acts");
    for (const b of ctx.buttons) {
      const btn = el("button", "insp-btn plg-btn", labelOf(b, ctx.lang));
      btn.type = "button";
      btn.dataset.run = `plugin:${b.plugin}/${b.id}`;
      btn.disabled = ctx.readOnly && b.writes;
      btn.addEventListener("click", (e) => { e.stopPropagation(); ctx.onButton(b); });
      acts.appendChild(btn);
    }
    body.appendChild(acts);
  }
  host.appendChild(body);
}
