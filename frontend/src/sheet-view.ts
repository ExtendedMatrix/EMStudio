/**
 * MICRO-G-SCHEDE · the «Scheda» window drawn — the definition's sheet as a
 * form, its boxes filled from the graph (`sheet.ts` reads, this draws).
 *
 * The geometry is the DEFINITION's (`sheetLayout`: rows in mm, cells in % of
 * the row, nested blocks with their labels), one scale (`--mm`, px per mm,
 * from the window's width) as StratiField's Foglio does: no measure of a sheet
 * is written here. What a box shows is what `readUnit` said, and every box
 * says WHAT IT IS in the graph (its tooltip, and a class for the states that
 * are not «full»: empty, out of the graph, an anchor not defined, two boxes on
 * one address). The edits go back through the callbacks, one gesture each;
 * `main.ts` turns them into one delta of the store.
 */

import type { EmEdge } from "./types";
import type { CompiledDef, FieldReading, LayoutCell, LayoutRow, UnitReading } from "./sheet";
import { conceptsFor, fillCounts, sheetLayout, visualField, labelIn } from "./sheet";

export interface SheetViewCallbacks {
  t: (key: string, p?: Record<string, string | number>) => string;
  onEdit(fid: string, value: string): void;
  onRefAdd(fid: string, text: string): void;
  onRefRemove(fid: string, edge: EmEdge): void;
  onPick(unitId: string): void;
  onChoose(id: string): void;
  onPrint(): void;
  /** SPEC §5 (3.0.0): the record's status set on the unit ("" = not said) */
  onStatus?(key: string): void;
  /** SPEC §2.6 (ICCD 4.0.0): the term that classifies the definition ("" = none) */
  onConcept?(fid: string, value: string): void;
}

export interface SheetViewInput {
  def: CompiledDef;
  lang: string;
  unitName: string;
  unitType: string;
  reading: UnitReading;
  choices: Array<{ id: string; label: string }>;
  note?: string;
  /** the record status, said in the sheet's language: key → label */
  statusLabels?: Record<string, string>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The head of the window: which definition, which unit, the counts. */
function head(body: HTMLElement, inp: SheetViewInput | null, cb: SheetViewCallbacks, choices: SheetViewInput["choices"], current: string | null): void {
  const bar = el("div", "sk-head");
  const sel = el("select", "sk-choose");
  sel.dataset.skChoose = "1";
  sel.title = cb.t("sheet.chooseTitle");
  for (const c of choices) {
    const o = el("option", undefined, c.label);
    o.value = c.id;
    if (c.id === current) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => cb.onChoose(sel.value));
  bar.appendChild(sel);
  if (inp) {
    bar.appendChild(el("span", "sk-unit", `${inp.unitName} · ${inp.unitType}`));
    const c = fillCounts(inp.reading);
    const counts = el("span", "sk-counts", cb.t("sheet.counts", {
      filled: c.filled.length, empty: c.empty.length, silent: c.silent.length + c.open.length, ambiguous: c.ambiguous.length,
    }));
    counts.dataset.skCounts = JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.length])));
    bar.appendChild(counts);
    const st = inp.reading.status;
    if (st && cb.onStatus) {
      // SPEC §5 (3.0.0): «da campo» / «rielaborato» on the unit
      const ss = el("select", "sk-status");
      ss.dataset.skStatus = "1";
      ss.title = cb.t("sheet.statusTitle");
      const none = el("option", undefined, cb.t("sheet.statusNone"));
      none.value = "";
      ss.appendChild(none);
      for (const k of st.values) {
        const o = el("option", undefined, inp.statusLabels?.[k] ?? k);
        o.value = k;
        if (k === st.key) o.selected = true;
        ss.appendChild(o);
      }
      if (!st.key) none.selected = true;
      ss.addEventListener("change", () => cb.onStatus!(ss.value));
      bar.appendChild(ss);
    }
    const pr = el("button", "sk-print", cb.t("sheet.print"));
    pr.dataset.skPrint = "1";
    pr.title = cb.t("sheet.printTitle");
    pr.addEventListener("click", () => cb.onPrint());
    bar.appendChild(pr);
  }
  body.appendChild(bar);
}

function howText(r: FieldReading, cb: SheetViewCallbacks): string {
  const parts = [cb.t(r.how.key, r.how.p)];
  if (r.readonly) parts.push(cb.t(r.readonly.key, r.readonly.p));
  return parts.join("\n");
}

function valueBox(def: CompiledDef, lang: string, r: FieldReading, cb: SheetViewCallbacks): HTMLElement {
  const f = visualField(def, r.fid)!;
  const wrap = el("div", "sk-v");
  if (r.state === "silent" || r.state === "open") {
    wrap.appendChild(el("span", "sk-out", cb.t(r.state === "silent" ? "sheet.outOfGraph" : "sheet.anchorOpen")));
    return wrap;
  }
  if (r.state === "ambiguous") {
    wrap.appendChild(el("span", "sk-amb", (r.candidates ?? []).join(", ") || "?"));
    return wrap;
  }
  // a relation box: one chip per unit, a field to add one
  if (r.refs) {
    const seen = new Map<string, number>();
    for (const x of r.refs) seen.set(x.other, (seen.get(x.other) ?? 0) + 1);
    const drawn = new Set<string>();
    for (const x of r.refs) {
      if (drawn.has(x.other)) continue;
      drawn.add(x.other);
      const n = seen.get(x.other) ?? 1;
      const chip = el("span", `sk-chip${x.numbered ? "" : " sk-nonum"}`);
      chip.dataset.skRef = x.name;
      chip.title = x.numbered ? cb.t("sheet.chipTitle", { name: x.name }) : cb.t("sheet.noNumber", { id: x.other });
      const nm = el("span", "sk-chip-name", x.numbered ? x.name : cb.t("sheet.noNumberShort"));
      nm.addEventListener("dblclick", () => cb.onPick(x.other));
      chip.appendChild(nm);
      if (n > 1) chip.appendChild(el("span", "sk-dup", `×${n}`)).title = cb.t("sheet.dupEdges", { n });
      const x0 = el("button", "sk-chip-x", "×");
      x0.title = cb.t("sheet.removeRef", { name: x.name });
      x0.addEventListener("click", (ev) => { ev.stopPropagation(); cb.onRefRemove(r.fid, x.edge); });
      chip.appendChild(x0);
      wrap.appendChild(chip);
    }
    const add = el("input", "sk-ref-add");
    add.placeholder = "+";
    add.dataset.skAdd = r.fid;
    add.title = cb.t("sheet.addRefTitle");
    add.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      const v = add.value.trim();
      if (!v) return;
      // out of the field first: a window being written in is not repainted
      // (shell/hold.ts), and the chip must appear
      add.blur();
      cb.onRefAdd(r.fid, v);
    });
    wrap.appendChild(add);
    return wrap;
  }
  if (r.readonly || f.type === "quantity_list" || f.type === "resource_ref_list" || f.type === "record_ref_list") {
    const span = el("span", "sk-ro", r.text || "—");
    if (!r.text) span.classList.add("sk-none");
    wrap.appendChild(span);
    return wrap;
  }
  if (f.type === "choice") {
    const chosen = typeof r.value === "string" ? r.value : "";
    for (const o of f.options ?? []) {
      const lab = el("label", "sk-opt");
      const radio = el("input");
      radio.type = "radio";
      radio.name = `sk-${r.fid}`;
      radio.value = o.value;
      radio.checked = o.value === chosen;
      radio.addEventListener("change", () => cb.onEdit(r.fid, o.value));
      lab.append(radio, document.createTextNode(` ${labelIn(o.labels, lang)}`));
      wrap.appendChild(lab);
    }
    return wrap;
  }
  const long = f.type === "longtext";
  const input = long ? el("textarea", "sk-in sk-long") : el("input", "sk-in");
  input.value = r.text;
  input.dataset.skField = r.fid;
  if (!long && (f.type === "integer" || f.type === "decimal")) (input as HTMLInputElement).inputMode = "decimal";
  if (!long && f.type === "date") (input as HTMLInputElement).placeholder = "YYYY-MM-DD";
  if (f.type === "term") {
    const { concepts, answeredBy } = conceptsFor(def, r.fid, lang);
    if (concepts.length) {
      const dl = el("datalist");
      dl.id = `sk-dl-${r.fid}-${Math.random().toString(36).slice(2, 7)}`;
      for (const c of concepts) { const o = el("option"); o.value = c.label; dl.appendChild(o); }
      wrap.appendChild(dl);
      input.setAttribute("list", dl.id);
      input.title = cb.t("sheet.termFrom", { scheme: String(answeredBy) });
    }
  }
  let sent = r.text;
  const commit = (): void => {
    if (input.value === sent) return;
    sent = input.value;
    cb.onEdit(r.fid, input.value);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (ev) => {
    const ke = ev as KeyboardEvent;
    if (ke.key === "Enter" && (!long || ke.metaKey || ke.ctrlKey)) { ev.preventDefault(); commit(); (input as HTMLElement).blur(); }
  });
  wrap.appendChild(input);
  return wrap;
}

function cellEl(c: LayoutCell, inp: SheetViewInput, cb: SheetViewCallbacks): HTMLElement {
  const box = el("div", "sk-cell");
  box.style.width = `${c.w}%`;
  if (c.kind === "spacer") { box.classList.add("sk-spacer"); return box; }
  if (c.kind === "block") {
    box.classList.add("sk-block");
    if (c.label) {
      box.classList.add("sk-labelled");
      if (c.rotated) box.classList.add("sk-rot");
      const strip = el("div", "sk-strip");
      strip.appendChild(el("span", undefined, c.label));
      box.appendChild(strip);
    }
    const inner = el("div", "sk-inner");
    for (const r of c.rows) inner.appendChild(rowEl(r, inp, cb));
    box.appendChild(inner);
    return box;
  }
  const r = inp.reading.fields.get(c.field);
  box.dataset.field = c.field;
  if (!r) return box;
  box.dataset.state = r.state;
  box.classList.add(`sk-${r.state}`);
  if (r.lens) box.classList.add("sk-lens");
  if (r.readonly) box.classList.add("sk-readonly");
  box.title = howText(r, cb);
  if (c.label) {
    const lab = el("div", "sk-lbl", c.label);
    if (c.required) lab.appendChild(el("span", "sk-req", " *"));
    if (r.lens) lab.appendChild(el("span", "sk-badge", cb.t("sheet.lens")));
    box.appendChild(lab);
  }
  box.appendChild(valueBox(inp.def, inp.lang, r, cb));
  extras(box, inp, r, cb);
  return box;
}

/** MICRO-K §A: what a box says beside its value — the TERM of the definition
 *  (a picker, on the same PropertyNode), the CHAIN of the interpretation (read
 *  only: extractors, combiners, documents), a REMARK that corrects nothing
 *  (a description that repeats the definition). */
function extras(box: HTMLElement, inp: SheetViewInput, r: FieldReading, cb: SheetViewCallbacks): void {
  const f = visualField(inp.def, r.fid);
  if (f?.concept_vocabulary && f.type !== "term" && cb.onConcept) {
    const line = el("div", "sk-concept");
    line.dataset.skConcept = r.fid;
    const { concepts, answeredBy } = conceptsFor(inp.def, r.fid, inp.lang);
    const sel = el("select", "sk-concept-pick");
    sel.title = cb.t("sheet.conceptTitle", { scheme: String(answeredBy ?? f.concept_vocabulary.scheme) });
    const none = el("option", undefined, cb.t("sheet.conceptNone"));
    none.value = "";
    sel.appendChild(none);
    const cur = r.concept?.concept ?? "";
    for (const c of concepts) {
      const o = el("option", undefined, c.label);
      o.value = c.concept;
      if (c.concept === cur) o.selected = true;
      sel.appendChild(o);
    }
    if (cur && !concepts.some((c) => c.concept === cur)) {
      const o = el("option", undefined, r.concept?.label || cur);
      o.value = cur;
      o.selected = true;
      sel.appendChild(o);
    }
    sel.disabled = !r.nodes.length || r.how.key === "sheet.how.deprecatedElement";
    sel.addEventListener("change", () => cb.onConcept!(r.fid, sel.value));
    line.append(el("span", "sk-concept-lbl", cb.t("sheet.concept")), sel);
    box.appendChild(line);
  }
  if (r.chain && r.chain.length) {
    const ch = el("div", "sk-chain");
    ch.dataset.skChain = String(r.chain.length);
    ch.title = cb.t("sheet.chainTitle");
    ch.appendChild(el("span", "sk-chain-lbl", cb.t("sheet.chain")));
    for (const n of r.chain) {
      const a = el("span", "sk-chain-node", n.name);
      a.title = n.node_type;
      a.addEventListener("dblclick", () => cb.onPick(n.id));
      ch.appendChild(a);
    }
    box.appendChild(ch);
  }
  if (r.remark) {
    const rm = el("div", "sk-remark", cb.t(r.remark.key, r.remark.p));
    rm.dataset.skRemark = r.remark.key;
    box.appendChild(rm);
  }
}

function rowEl(r: LayoutRow, inp: SheetViewInput, cb: SheetViewCallbacks): HTMLElement {
  const row = el("div", "sk-row");
  row.style.minHeight = `calc(var(--mm) * ${r.h})`;
  for (const c of r.cells) row.appendChild(cellEl(c, inp, cb));
  return row;
}

/** Draw the whole window. `inp` null = no unit to show (the head still lets
 *  the study choose its definition), `empty` says why. */
export function renderSheet(body: HTMLElement, inp: SheetViewInput | null, cb: SheetViewCallbacks,
                            choices: SheetViewInput["choices"], current: string | null, empty?: string): void {
  const scroll = body.querySelector<HTMLElement>(".sk-pages")?.scrollTop ?? 0;
  body.textContent = "";
  body.classList.add("sk-body");
  head(body, inp, cb, choices, current);
  if (!inp) {
    body.appendChild(el("div", "sk-empty-note", empty ?? ""));
    return;
  }
  if (inp.note) body.appendChild(el("div", "sk-note", inp.note));
  const pages = el("div", "sk-pages");
  const width = Math.max(320, body.clientWidth || 800);
  pages.style.setProperty("--mm", `${Math.min(5, Math.max(2.4, (width - 40) / 210))}px`);
  for (const side of sheetLayout(inp.def, inp.lang)) {
    const page = el("section", "sk-side");
    page.dataset.side = side.id;
    const h = el("div", "sk-side-head");
    h.append(el("b", undefined, `${inp.def.header.standard.authority} ${inp.def.header.standard.code} ${inp.def.header.standard.version}`),
             el("span", undefined, labelIn(inp.def.header.standard.title, inp.lang)),
             el("span", "sk-side-name", `${side.label} · ${inp.unitName}`));
    page.appendChild(h);
    for (const r of side.rows) page.appendChild(rowEl(r, inp, cb));
    pages.appendChild(page);
  }
  // what the unit has that no box reads: never lost in silence
  const unread = el("section", "sk-unread");
  unread.dataset.skUnread = String(inp.reading.unread.length);
  unread.appendChild(el("h4", undefined, cb.t("sheet.unreadTitle", { n: inp.reading.unread.length })));
  if (!inp.reading.unread.length) unread.appendChild(el("div", "sk-none", cb.t("sheet.unreadNone")));
  for (const u of inp.reading.unread) {
    const line = el("div", "sk-unread-row");
    line.append(el("b", undefined, u.qualia), el("span", undefined, u.value || "—"));
    unread.appendChild(line);
  }
  pages.appendChild(unread);
  // MICRO-PL11: a community package's sheet is not vendored — it came with its package, verified
  const pkg = inp.def.header.packages?.[0];
  const foot = el("div", "sk-foot", pkg
    ? cb.t("sheet.footPackage", { id: inp.def.header.id, v: inp.def.header.version, p: `${pkg.name} ${pkg.version ?? ""}`.trim() })
    : cb.t("sheet.foot", { id: inp.def.header.id, v: inp.def.header.version }));
  pages.appendChild(foot);
  body.appendChild(pages);
  pages.scrollTop = scroll;
}
