/**
 * MICRO-S-COLORI-FINESTRA (E.D., 18 Nov 2026) · the window «Colori».
 *
 * «Colori ▾» in the Space's bar is a quick menu; working on a scheme in a
 * dropdown was awkward (E.D.: no list of the values, no colour per value, no
 * way to change it). This is the window to work in: the three modes of
 * `space-colours.ts`, and for a property
 *
 *  - every value found on the proxies of the epoch shown, with its number of
 *    units and a swatch that is a colour picker; a click on the value selects
 *    its units (the Space shows the selection);
 *  - the scale of its kind (text: qualitative; numbers: sequential/diverging
 *    between a min and a max). A numeric scale CAN go on text — it follows the
 *    alphabet — but the window says so before and after;
 *  - EM Tools' two special values, always at the bottom with their colour and
 *    number: «ha la proprietà, valore vuoto», «non ha la proprietà» (which may
 *    also leave the unit as it is);
 *  - the .emc, EM Tools' file, saved and opened with both of them;
 *  - MICRO-T (E.D., 18 Nov 2026) · «Nel file»: the schemes the em.json itself
 *    carries (presentation.ts), the one this graph uses marked; «Usa» makes
 *    one this graph's, «Tieni nel file…» keeps the scheme on screen there,
 *    «Espelli in una cartella…» writes one .emc per scheme (then asks whether
 *    to take them out), «Importa nel file…» takes .emc files in.
 *
 * WHERE IT LIVES. A panel floating in the page, dragged by its bar and resized
 * by its corner; where it was and how big, in this machine's preferences.
 * «⇱» takes it out into a system window of its own (the desktop's, or the
 * browser's popup) — the same `window.open` of an `about:blank` the detached
 * windows use (`shell/detach.ts`): ONE realm, the panel's DOM drawn there,
 * nothing copied. «⇲» (or closing that window) brings it back.
 *
 * Nothing here knows `main.ts`: the host (`ColoursHost`) says what the Space
 * shows and does what the window asks. `check-colours-window.mjs` drives it.
 */
import { DETACH_URL, detachSupport, mirrorLook, popupFeatures, wireRelay } from "./shell/detach";
import {
  RAMPS, emcOfState, emcRead, isNumericScale, propertyRows, startProperty, applyRamp, valueKind, valueRange,
  type ColourPlan, type ColourState, type Emc, type LegendEntry, type RampType,
} from "./space-colours";

export interface ColoursHost {
  t(key: string, vars?: Record<string, string>): string;
  fmtN(n: number): string;
  /** the Space window coloured, and what it shows (null: no Space open) */
  space(): { winId: string; epoch: string | null } | null;
  state(): ColourState | null;
  set(s: ColourState): void;
  /** the units drawn with a proxy in the epoch shown */
  units(): string[];
  propertyNames(): Array<{ name: string; units: number }>;
  values(prop: string): Map<string, string>;
  /** the plan the Space draws (the epochs' legend) */
  plan(): ColourPlan | null;
  setEpochColour(epochId: string, hex: string): void;
  select(units: string[]): void;
  saveEmc(doc: Emc, filename: string): void;
  /** a .emc chosen by the person, as JSON (null: none chosen) */
  pickEmc(doc: Document): Promise<unknown | null>;
  toast(msg: string): void;
  /** a field one writes in (its keys are never shortcuts, relayed or not) */
  isWriting(el: Element | null): boolean;
  /** a system window just opened: the host learns it (on the desktop the page
   *  cannot close it by itself) and says when the shell closed it */
  systemWindow?(pop: Window, onClosed: () => void): { close(): void };
  /** MICRO-T · the schemes of the file of the graph shown (null: the graph is
   *  in no file yet) */
  fileSchemes?(): { file: string; schemes: FileScheme[] } | null;
  /** this graph uses that scheme of its file (null: none) */
  useFileScheme?(name: string | null): void;
  /** the scheme on screen kept in the file (asks the name) */
  keepInFile?(): void;
  dropFromFile?(name: string): void;
  /** «Espelli in una cartella…» (all the file's schemes) */
  expelSchemes?(): void;
  /** «Importa nel file…»: .emc files chosen by the person */
  importSchemes?(doc: Document): void;
  /** what the content depends on besides the state (the document's revision,
   *  the resident files): the same → the window is not rebuilt */
  rev(): string;
}

/** MICRO-T · a scheme of the file, as the window lists it */
export interface FileScheme { name: string; property: string; values: number; active: boolean }

/** where the window was: the page's panel and the system window */
export interface ColoursWindowPref {
  x: number; y: number; w: number; h: number;
  detached?: boolean;
  sx?: number; sy?: number; sw?: number; sh?: number;
}
export const COLOURS_WIN_KEY = "emstudio.colours.window.v1";
const DEFAULT_PREF: ColoursWindowPref = { x: -1, y: 90, w: 360, h: 520 };
export function loadWindowPref(kv: Pick<Storage, "getItem"> | null = safeStorage(), key = COLOURS_WIN_KEY): ColoursWindowPref {
  try {
    const raw = kv?.getItem(key);
    if (raw) {
      const v = JSON.parse(raw) as Partial<ColoursWindowPref>;
      if ([v.x, v.y, v.w, v.h].every((n) => typeof n === "number" && Number.isFinite(n))) return { ...DEFAULT_PREF, ...v } as ColoursWindowPref;
    }
  } catch { /* none, or unreadable */ }
  return { ...DEFAULT_PREF };
}
export function saveWindowPref(p: ColoursWindowPref, kv: Pick<Storage, "setItem"> | null = safeStorage(), key = COLOURS_WIN_KEY): void {
  try { kv?.setItem(key, JSON.stringify(p)); } catch { /* storage refused */ }
}
function safeStorage(): Storage | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}
/** the panel kept inside the viewport (at least its bar) */
export function clampPanel(p: ColoursWindowPref, vw: number, vh: number): ColoursWindowPref {
  const w = Math.max(280, Math.min(p.w, vw - 16)), h = Math.max(200, Math.min(p.h, vh - 16));
  const x = p.x < 0 ? vw - w - 24 : Math.max(8, Math.min(p.x, vw - w - 8));
  const y = Math.max(8, Math.min(p.y, vh - 48));
  return { ...p, x, y, w, h };
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The window's content, built in `doc` (the page's, or the system window's).
 * Rebuilt whole on every change: it is a few dozen rows.
 */
export function coloursContent(doc: Document, host: ColoursHost): HTMLElement {
  const box = modeContent(doc, host);
  if (host.fileSchemes && host.state() && host.space()) box.appendChild(fileSection(doc, host));
  return box;
}

/** MICRO-T · «Nel file»: the schemes the em.json carries */
function fileSection(doc: Document, host: ColoursHost): HTMLElement {
  const t = host.t;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const btn = (label: string, key: string, fn: () => void, title?: string): HTMLButtonElement => {
    const b = el("button", "", label);
    b.type = "button";
    b.dataset[key] = "1";
    if (title) b.title = title;
    b.onclick = fn;
    return b;
  };
  const sec = el("div", "cw-file");
  sec.dataset.cwFile = "1";
  sec.appendChild(el("div", "cw-file-h", t("cw.file")));
  const fs = host.fileSchemes!();
  if (!fs) { sec.appendChild(el("p", "cw-hint", t("cw.fileNone"))); return sec; }
  if (!fs.schemes.length) sec.appendChild(el("p", "cw-hint", t("cw.fileEmpty", { f: fs.file })));
  for (const s of fs.schemes) {
    const r = el("div", "cw-fs" + (s.active ? " active" : ""));
    r.dataset.cwFileScheme = s.name;
    const lab = el("span", "cw-lab", s.name);
    lab.title = t("cw.fileSchemeHint", { p: s.property, n: host.fmtN(s.values) });
    r.appendChild(lab);
    r.appendChild(el("span", "cw-n", s.active ? t("cw.fileActive") : s.property));
    r.appendChild(s.active
      ? btn(t("cw.fileUnuse"), "cwUnuse", () => host.useFileScheme?.(null), t("cw.fileUnuseHint"))
      : btn(t("cw.fileUse"), "cwUse", () => host.useFileScheme?.(s.name), t("cw.fileUseHint")));
    r.appendChild(btn("×", "cwDrop", () => host.dropFromFile?.(s.name), t("cw.fileDrop", { s: s.name })));
    sec.appendChild(r);
  }
  const io = el("div", "cw-row cw-io");
  const cs = host.state();
  if (cs?.mode === "property" && cs.property) io.append(btn(t("cw.fileKeep"), "cwKeep", () => host.keepInFile?.(), t("cw.fileKeepHint")), " ");
  if (fs.schemes.length) io.append(btn(t("cw.fileExpel"), "cwExpel", () => host.expelSchemes?.(), t("cw.fileExpelHint")), " ");
  io.append(btn(t("cw.fileImport"), "cwImport", () => host.importSchemes?.(doc), t("cw.fileImportHint")));
  sec.appendChild(io);
  return sec;
}

function modeContent(doc: Document, host: ColoursHost): HTMLElement {
  const t = host.t;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const box = el("div", "cw-body");
  const cs = host.state();
  const sp = host.space();
  if (!cs || !sp) { box.appendChild(el("p", "cw-hint", t("cw.noSpace"))); return box; }
  box.appendChild(el("div", "cw-where", sp.epoch ? t("cw.where", { e: sp.epoch, n: host.fmtN(host.units().length) }) : t("cw.noEpoch")));
  const seg = el("div", "col-modes cw-modes");
  for (const m of ["em", "epochs", "property"] as const) {
    const b = el("button", "", t(`col.mode.${m}`));
    b.type = "button";
    b.dataset.cwMode = m;
    b.setAttribute("aria-pressed", String(cs.mode === m));
    b.onclick = () => host.set({ ...cs, mode: m, isolated: null, hidden: [] });
    seg.appendChild(b);
  }
  box.appendChild(seg);
  if (cs.mode === "em") { box.appendChild(el("p", "cw-hint", t("col.emHint"))); return box; }
  if (cs.mode === "epochs") {
    const vs = el("div", "col-variants cw-variants");
    for (const v of ["birth", "new"] as const) {
      const b = el("button", "", t(`col.variant.${v}`));
      b.type = "button";
      b.dataset.cwVariant = v;
      b.title = t(`col.variantHint.${v}`);
      b.setAttribute("aria-pressed", String(cs.variant === v));
      b.onclick = () => host.set({ ...cs, variant: v });
      vs.appendChild(b);
    }
    box.append(vs, el("p", "cw-hint", t(`col.variantHint.${cs.variant}`)));
    const plan = host.plan();
    const list = el("div", "cw-list");
    for (const e of plan?.legend ?? []) list.appendChild(row(e, e.none ? t("col.noEpoch") : e.label, e.epochId
      ? (hex) => host.setEpochColour(e.epochId!, hex) : null, null));
    box.appendChild(list);
    return box;
  }
  // ── Proprietà ──
  const names = host.propertyNames();
  const pr = el("label", "cw-row");
  pr.append(`${t("col.pickProperty")} `);
  const sel = el("select");
  sel.dataset.cwProperty = "1";
  const ph = el("option", "", t("col.pickPh"));
  ph.value = "";
  sel.appendChild(ph);
  for (const n of names) {
    const o = el("option", "", `${n.name} (${host.fmtN(n.units)})`);
    o.value = n.name;
    if (n.name === cs.property) o.setAttribute("selected", "");
    sel.appendChild(o);
  }
  if (cs.property && !names.some((n) => n.name === cs.property)) {
    const o = el("option", "", cs.property);
    o.value = cs.property; o.setAttribute("selected", "");
    sel.appendChild(o);
  }
  sel.onchange = () => {
    const p = sel.value;
    if (!p) { host.set({ ...cs, property: null, scheme: {}, ramp: null, range: null, isolated: null, hidden: [] }); return; }
    if (p === cs.property) return;
    host.set(startProperty(cs, p, host.values(p).values()));
  };
  pr.appendChild(sel);
  box.appendChild(pr);
  if (!names.length) box.appendChild(el("p", "cw-hint", t("col.noProperty")));
  if (!cs.property) return box;
  const prop = cs.property;
  const values = host.values(prop);
  const kind = valueKind(prop, values.values());
  // the scale: the ones of its kind first; a numeric scale on text, said
  const sr = el("div", "cw-row cw-scale");
  const rsel = el("select");
  rsel.dataset.cwRamp = "1";
  const order: RampType[] = kind === "numeric" ? ["sequential", "diverging", "qualitative"] : ["qualitative", "sequential", "diverging"];
  const cur = cs.ramp ? `${cs.ramp.type}/${cs.ramp.name}` : "";
  for (const type of order)
    for (const [k, r] of Object.entries(RAMPS[type])) {
      const o = el("option", "", `${r.name} · ${t(`col.scaleType.${type}`)}${kind === "text" && isNumericScale(type) ? ` (${t("cw.forNumbers")})` : ""}`);
      o.value = `${type}/${k}`;
      if (o.value === cur) o.setAttribute("selected", "");
      rsel.appendChild(o);
    }
  const ramp = el("span", "cw-ramp");
  const paintRamp = () => {
    ramp.textContent = "";
    const [type, name] = (rsel.value || rsel.querySelector("option")!.value).split("/") as [RampType, string];
    for (const c of RAMPS[type]?.[name]?.colors ?? []) { const s = el("i"); s.style.background = c; ramp.appendChild(s); }
    warn.classList.toggle("hidden", !(kind === "text" && isNumericScale(type)));
  };
  const warn = el("p", "cw-warn hidden", t("cw.numericOnText"));
  warn.dataset.cwWarn = "1";
  rsel.onchange = paintRamp;
  const ap = el("button", "", t("col.apply"));
  ap.type = "button";
  ap.dataset.cwApply = "1";
  sr.append(`${t("col.scale")} `, rsel, ramp, ap);
  box.append(sr, warn);
  // min / max of a numeric scale
  const own = valueRange(prop, values.values());
  let lo: HTMLInputElement | null = null, hi: HTMLInputElement | null = null;
  if (own) {
    const mm = el("div", "cw-row cw-range");
    lo = el("input"); hi = el("input");
    for (const [inp, v, key] of [[lo, cs.range?.lo ?? own.lo, "min"], [hi, cs.range?.hi ?? own.hi, "max"]] as const) {
      inp.type = "number"; inp.step = "any"; inp.value = String(v);
      inp.dataset.cwRange = key;
    }
    const reset = el("button", "cw-mini", t("cw.rangeOwn", { lo: String(own.lo), hi: String(own.hi) }));
    reset.type = "button";
    reset.dataset.cwRangeOwn = "1";
    reset.onclick = () => { lo!.value = String(own.lo); hi!.value = String(own.hi); };
    mm.append(`${t("cw.min")} `, lo, ` ${t("cw.max")} `, hi, " ", reset);
    box.appendChild(mm);
  }
  ap.onclick = () => {
    const [type, name] = (rsel.value || rsel.querySelector("option")!.value).split("/") as [RampType, string];
    const range = lo && hi && Number.isFinite(Number(lo.value)) && Number.isFinite(Number(hi.value)) && lo.value !== "" && hi.value !== ""
      ? { lo: Number(lo.value), hi: Number(hi.value) } : null;
    host.set(applyRamp(cs, values.values(), type, name, range));
    if (kind === "text" && isNumericScale(type)) host.toast(t("cw.numericOnTextDone"));
  };
  paintRamp();
  // the values, then the two special ones
  const rows = propertyRows(cs, host.units(), values);
  const list = el("div", "cw-list");
  list.dataset.cwValues = "1";
  const head = el("div", "cw-list-h");
  head.append(el("span", "", t("cw.value")), el("span", "", t("cw.units")));
  list.appendChild(head);
  const setKey = (key: string) => (hex: string) => {
    const now = host.state();
    if (now) host.set({ ...now, scheme: { ...now.scheme, [key]: hex } });
  };
  const real = rows.filter((r) => !r.special);
  if (!real.length) list.appendChild(el("p", "cw-hint", t("cw.noValues")));
  for (const r of real) list.appendChild(row(r, r.label, setKey(r.key), () => host.select(unitsWith(r.key))));
  const sp2 = el("div", "cw-sep");
  list.appendChild(sp2);
  const empty = rows.find((r) => r.special === "empty")!;
  list.appendChild(row(empty, t("cw.empty"), setKey(empty.key), () => host.select(unitsWith(empty.key))));
  const none = rows.find((r) => r.special === "none")!;
  const nr = row(none, t("cw.none"), setKey(none.key), () => host.select(unitsWith(none.key)));
  const keep = el("label", "cw-keep");
  const cb = el("input");
  cb.type = "checkbox";
  cb.checked = !!cs.leaveNone;
  cb.dataset.cwLeaveNone = "1";
  cb.onchange = () => { const now = host.state(); if (now) host.set({ ...now, leaveNone: cb.checked }); };
  keep.append(cb, ` ${t("cw.leaveNone")}`);
  keep.title = t("cw.leaveNoneHint");
  nr.appendChild(keep);
  list.appendChild(nr);
  box.appendChild(list);
  // .emc
  const io = el("div", "cw-row cw-io");
  const sv = el("button", "", t("col.save"));
  sv.type = "button";
  sv.dataset.cwSave = "1";
  sv.onclick = () => host.saveEmc(emcOfState(cs), `${prop.replace(/[^\w.-]+/g, "_")}.emc`);
  const op = el("button", "", t("col.open"));
  op.type = "button";
  op.dataset.cwOpen = "1";
  op.onclick = async () => {
    const raw = await host.pickEmc(doc);
    if (raw == null) return;
    try {
      const r = emcRead(raw);
      const now = host.state() ?? cs;
      host.set({ ...now, mode: "property", property: r.property, scheme: Object.fromEntries(r.scheme), leaveNone: r.leaveNone,
        ramp: null, range: null, isolated: null, hidden: [] });
      host.toast(t("col.opened", { p: r.property, n: String(r.scheme.size) }));
    } catch (err) { host.toast(t("col.badEmc", { why: (err as Error).message })); }
  };
  io.append(sv, " ", op);
  box.appendChild(io);
  return box;

  function unitsWith(key: string): string[] {
    const ek = rows.find((r) => r.special === "none")!.key;
    return host.units().filter((u) => (values.get(u) ?? ek) === key);
  }
  /** a value: the swatch (a colour picker), its name (a click selects its units), its number */
  function row(e: LegendEntry, label: string, onColour: ((hex: string) => void) | null, onPick: (() => void) | null): HTMLElement {
    const r = el("div", "cw-val");
    r.dataset.cwKey = e.key;
    if (e.special) r.dataset.cwSpecial = e.special;
    if (e.untouched) r.classList.add("untouched");
    const sw = el("input", "cw-sw");
    sw.type = "color";
    sw.value = HEX.test(e.colour) ? e.colour.toLowerCase() : "#9a9a9a";
    sw.disabled = !onColour || !!e.untouched;
    sw.title = e.epochId ? t("col.epochColour", { e: e.label }) : t("col.valueColour", { v: label });
    if (onColour) sw.addEventListener("change", () => onColour(sw.value.toUpperCase()));
    const lab = el(onPick ? "button" : "span", "cw-lab", label);
    if (onPick) {
      (lab as HTMLButtonElement).type = "button";
      lab.title = t("cw.selectHint");
      lab.addEventListener("click", onPick);
    }
    const n = el("span", "cw-n", host.fmtN(e.count));
    n.dataset.cwCount = String(e.count);
    r.append(sw, lab, n);
    return r;
  }
}

/**
 * The window: a panel in the page, or (detached) a system window of its own.
 */
/** MICRO-U · the same floating, detachable window for another content (the
 *  window «Vocabolari»): its preference key, title, popup name, content and
 *  repaint signature. Without it the window is «Colori», as before. */
export interface FloatingSpec {
  prefKey: string;
  titleKey: string;
  popupName: string;
  data: string;
  content(doc: Document): HTMLElement;
  sig(): string;
}

export class ColoursWindow {
  private panel: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private pop: Window | null = null;
  private sys: { close(): void } | null = null;
  private off: Array<() => void> = [];
  constructor(private host: ColoursHost, private page: Document = document, private spec: FloatingSpec | null = null) {}
  private pref(): ColoursWindowPref { return loadWindowPref(undefined, this.spec?.prefKey); }
  private keepPref(p: ColoursWindowPref): void { saveWindowPref(p, undefined, this.spec?.prefKey); }

  get isOpen(): boolean { return !!this.panel || !!this.pop; }
  get detached(): boolean { return !!this.pop; }
  /** the element the window is drawn in (tests) */
  get root(): HTMLElement | null { return this.panel; }

  open(): void {
    if (this.pop && !this.pop.closed) { this.pop.focus(); this.repaint(); return; }
    if (this.panel) { this.repaint(); return; }
    const pref = this.pref();
    if (pref.detached && this.detach(false)) return;
    this.mountPanel();
  }
  close(): void {
    this.unmount();
    if (this.pop) { const p = this.pop; this.pop = null; this.closeSys(p); }
  }
  toggle(): void { if (this.isOpen) this.close(); else this.open(); }
  private sig = "";
  /** the Space changed (epoch, scheme, document): the content again — only
   *  when what it shows changed (a rebuild closes an open list or picker) */
  repaint(force = false): void {
    if (!this.body) return;
    const sig = this.spec ? this.spec.sig() : JSON.stringify([this.host.state(), this.host.space(), this.host.rev()]);
    if (!force && sig === this.sig && this.body.childElementCount) return;
    this.sig = sig;
    const d = this.body.ownerDocument;
    const scroll = this.body.scrollTop;
    this.body.replaceChildren(this.spec ? this.spec.content(d) : coloursContent(d, this.host));
    this.body.scrollTop = scroll;
  }

  private chrome(d: Document, inPage: boolean): HTMLElement {
    const t = this.host.t;
    const frame = d.createElement("div");
    frame.className = inPage ? "cw-win" : "cw-win cw-sys";
    frame.dataset[this.spec?.data ?? "coloursWindow"] = inPage ? "panel" : "detached";
    frame.setAttribute("role", "dialog");
    frame.setAttribute("aria-label", t(this.spec?.titleKey ?? "cw.title"));
    const bar = d.createElement("div");
    bar.className = "cw-bar";
    const title = d.createElement("span");
    title.className = "cw-title";
    title.textContent = t(this.spec?.titleKey ?? "cw.title");
    const btn = (txt: string, tip: string, key: string, fn: () => void): HTMLButtonElement => {
      const b = d.createElement("button");
      b.type = "button"; b.textContent = txt; b.title = tip; b.dataset.cw = key;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      return b;
    };
    const help = d.createElement("div");
    help.className = "cw-help hidden";
    help.dataset.cwHelp = "1";
    help.textContent = t("cw.help");
    const can = detachSupport(this.page.defaultView ?? window);
    bar.append(title,
      btn("?", t("cw.helpTip"), "help", () => help.classList.toggle("hidden")),
      ...(inPage ? can.ok ? [btn("⇱", t("cw.detach"), "detach", () => this.detach(true))] : []
        : [btn("⇲", t("cw.attach"), "attach", () => this.attach())]),
      btn("×", t("cw.close"), "close", () => this.close()));
    const body = d.createElement("div");
    body.className = "cw-scroll";
    frame.append(bar, help, body);
    this.body = body;
    for (const ev of ["pointerdown", "dblclick", "contextmenu", "wheel", "keydown"]) frame.addEventListener(ev, (e) => e.stopPropagation());
    return frame;
  }

  private mountPanel(): void {
    const d = this.page;
    const vw = d.defaultView?.innerWidth ?? 1200, vh = d.defaultView?.innerHeight ?? 800;
    const p = clampPanel(this.pref(), vw, vh);
    const frame = this.chrome(d, true);
    Object.assign(frame.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` });
    d.body.appendChild(frame);
    this.panel = frame;
    const save = () => {
      const r = frame.getBoundingClientRect();
      if (r.width && r.height) this.keepPref({ ...this.pref(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), detached: false });
    };
    // drag by the bar
    const bar = frame.querySelector<HTMLElement>(".cw-bar")!;
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const r0 = frame.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
      const move = (ev: PointerEvent) => {
        const q = clampPanel({ x: r0.left + ev.clientX - x0, y: r0.top + ev.clientY - y0, w: r0.width, h: r0.height }, d.defaultView?.innerWidth ?? vw, d.defaultView?.innerHeight ?? vh);
        frame.style.left = `${q.x}px`; frame.style.top = `${q.y}px`;
      };
      const up = () => { d.removeEventListener("pointermove", move); d.removeEventListener("pointerup", up); save(); };
      d.addEventListener("pointermove", move);
      d.addEventListener("pointerup", up);
    });
    // resized by its corner (CSS `resize: both`): the size kept when it settles
    const RO = (d.defaultView as (Window & typeof globalThis) | null)?.ResizeObserver;
    if (RO) {
      let timer = 0;
      const ro = new RO(() => { clearTimeout(timer); timer = (d.defaultView ?? window).setTimeout(save, 250) as unknown as number; });
      ro.observe(frame);
      this.off.push(() => ro.disconnect());
    }
    this.repaint(true);
  }

  private unmount(): void {
    this.off.forEach((f) => f());
    this.off = [];
    this.panel?.remove();
    this.panel = null;
    this.body = null;
  }

  /** out into a system window; false: the page could not open one */
  detach(asked: boolean): boolean {
    const main = this.page.defaultView;
    if (!main || !detachSupport(main).ok) return false;
    const pref = this.pref();
    const from = this.panel?.getBoundingClientRect();
    const sx = main.screenX ?? 0, sy = main.screenY ?? 0;
    const r = pref.detached && !asked && pref.sw && pref.sh
      ? { x: pref.sx ?? sx + 80, y: pref.sy ?? sy + 80, w: pref.sw, h: pref.sh }
      : { x: Math.round(sx + (from?.left ?? 80)), y: Math.round(sy + (from?.top ?? 80) + 40), w: Math.round(from?.width ?? pref.w), h: Math.round(from?.height ?? pref.h) };
    const pop = main.open(DETACH_URL, this.spec?.popupName ?? "emstudio-colours", popupFeatures(r));
    if (!pop) { if (asked) this.host.toast(this.host.t("tile.detachBlocked")); return false; }
    this.unmount();
    const d = pop.document;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>EMStudio</title></head><body></body></html>');
    d.close();
    d.title = `${this.host.t(this.spec?.titleKey ?? "cw.title")} — EMStudio`;
    const off: Array<() => void> = [mirrorLook(this.page, d)];
    const frame = this.chrome(d, false);
    d.body.appendChild(frame);
    this.pop = pop;
    off.push(wireRelay(pop, this.page, { isWriting: (el) => this.host.isWriting(el), ported: () => true, onPress: () => {} }));
    const keep = () => this.keepPref({ ...this.pref(), detached: true, sx: pop.screenX, sy: pop.screenY, sw: pop.outerWidth || r.w, sh: pop.outerHeight || r.h });
    pop.addEventListener("resize", keep);
    const gone = () => {
      if (this.pop !== pop) return;
      try { keep(); } catch { /* a window already gone */ }
      off.forEach((f) => f());
      this.pop = null;
      this.sys = null;
      this.body = null;
    };
    pop.addEventListener("pagehide", gone);
    this.sys = this.host.systemWindow?.(pop, gone) ?? null;
    this.off = off;
    this.keepPref({ ...this.pref(), detached: true, sx: r.x, sy: r.y, sw: r.w, sh: r.h });
    this.repaint(true);
    return true;
  }

  /** back into the page */
  attach(): void {
    const p = this.pop;
    this.pop = null;
    this.off.forEach((f) => f());
    this.off = [];
    this.body = null;
    this.keepPref({ ...this.pref(), detached: false });
    if (p) this.closeSys(p);
    this.mountPanel();
  }
  private closeSys(p: Window): void {
    const sys = this.sys;
    this.sys = null;
    if (sys) sys.close();
    else try { p.close(); } catch { /* gone */ }
  }
}
