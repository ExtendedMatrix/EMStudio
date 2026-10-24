/**
 * MICRO-LAB orizzonti · the HORIZONS panel, at the head of the Chronology window.
 *
 * Which periodization the views read (the session's choice; the file proposes
 * one), how they read it (off · colour · colour and filter), and the horizons
 * of that periodization with their colour and visibility — then creating,
 * editing, reordering and deleting horizons and periodizations. Every edit
 * goes out through the hooks, and on the other side each is ONE undo step in
 * the horizons store (its ops go to the Log and, in a room, to the relay).
 *
 * DOM only; the numbers come in (`HorizonsPanelData`).
 */
import { t } from "./i18n";
import type { HorizonMode, Periodization } from "./horizons";

export interface HorizonsPanelData {
  list: Periodization[];
  /** the periodization the views read now */
  chosen: string | null;
  /** the one the file proposes */
  proposed: string | null;
  mode: HorizonMode;
  hidden: Set<string>;
  /** horizon id → how many nodes of the graph on screen overlap it */
  counts: Map<string, number>;
  /** a sentence when the intervals are not available (bridge off…) */
  note: string | null;
  /** false when this session may not write (a room that lets it read) */
  writable: boolean;
}

export interface HorizonsPanelHooks {
  onChoose(id: string): void;
  onMode(mode: HorizonMode): void;
  onToggle(horizonId: string, visible: boolean): void;
  onAddPeriodization(): void;
  onRenamePeriodization(id: string, name: string): void;
  onDeletePeriodization(id: string): void;
  onAddHorizon(periodizationId: string): void;
  onSetHorizon(id: string, field: "name" | "start_time" | "end_time" | "color", value: string): void;
  onMoveHorizon(periodizationId: string, id: string, dir: -1 | 1): void;
  onDeleteHorizon(id: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, title: string, on: () => void, disabled = false): HTMLButtonElement {
  const b = el("button", "hz-btn", text);
  b.type = "button";
  b.title = title;
  b.disabled = disabled;
  b.addEventListener("click", on);
  return b;
}

export function renderHorizonsPanel(host: HTMLElement, d: HorizonsPanelData, h: HorizonsPanelHooks): void {
  const box = el("section", "hz-panel");
  box.dataset.hzPanel = "1";
  const head = el("div", "hz-head");
  head.appendChild(el("strong", "hz-title", t("hz.title")));
  head.title = t("hz.tip");
  box.appendChild(head);

  // which periodization, and the gestures on it
  const row = el("div", "hz-row");
  row.appendChild(el("label", "hz-label", t("hz.periodization")));
  const sel = el("select", "hz-select");
  sel.dataset.hzChoose = "1";
  for (const p of d.list) {
    const o = el("option", undefined, p.id === d.proposed ? `${p.name} ★` : p.name);
    o.value = p.id;
    o.selected = p.id === d.chosen;
    sel.appendChild(o);
  }
  sel.disabled = !d.list.length;
  sel.title = t("hz.chooseTip");
  sel.addEventListener("change", () => h.onChoose(sel.value));
  row.appendChild(sel);
  const chosen = d.list.find((p) => p.id === d.chosen) ?? null;
  row.appendChild(button("+", t("hz.addPeriodization"), () => h.onAddPeriodization(), !d.writable));
  if (chosen) {
    row.appendChild(button("✎", t("hz.renamePeriodization"), () => {
      const name = window.prompt(t("hz.renamePeriodization"), chosen.name);
      if (name && name.trim() && name !== chosen.name) h.onRenamePeriodization(chosen.id, name.trim());
    }, !d.writable));
    row.appendChild(button("🗑", t("hz.deletePeriodization"), () => {
      if (window.confirm(t("hz.deletePeriodizationAsk", { name: chosen.name, n: String(chosen.horizons.length) })))
        h.onDeletePeriodization(chosen.id);
    }, !d.writable));
  }
  box.appendChild(row);

  // how the views read it
  const modes = el("div", "hz-row hz-modes");
  modes.appendChild(el("label", "hz-label", t("hz.views")));
  for (const m of ["off", "colour", "filter"] as HorizonMode[]) {
    const lab = el("label", "hz-mode");
    const r = el("input");
    r.type = "radio";
    r.name = "hz-mode";
    r.value = m;
    r.checked = d.mode === m;
    r.dataset.hzMode = m;
    r.disabled = !chosen && m !== "off";
    r.addEventListener("change", () => { if (r.checked) h.onMode(m); });
    lab.append(r, document.createTextNode(` ${t(`hz.mode.${m}`)}`));
    lab.title = t(`hz.mode.${m}.tip`);
    modes.appendChild(lab);
  }
  box.appendChild(modes);
  if (d.note) box.appendChild(el("div", "hz-note", d.note));

  if (!chosen) {
    box.appendChild(el("div", "hz-empty", t("hz.none")));
    host.appendChild(box);
    return;
  }
  const table = el("table", "hz-table");
  const thead = el("tr");
  for (const k of ["hz.col.show", "hz.col.colour", "hz.col.name", "hz.col.start", "hz.col.end", "hz.col.units", ""])
    thead.appendChild(el("th", undefined, k ? t(k) : ""));
  table.appendChild(thead);
  chosen.horizons.forEach((hz, i) => {
    const tr = el("tr");
    tr.dataset.hzRow = hz.id;
    const vis = el("input");
    vis.type = "checkbox";
    vis.checked = !d.hidden.has(hz.id);
    vis.title = t("hz.showTip");
    vis.dataset.hzShow = hz.id;
    vis.addEventListener("change", () => h.onToggle(hz.id, vis.checked));
    const col = el("input");
    col.type = "color";
    col.value = /^#[0-9a-f]{6}$/i.test(hz.color) ? hz.color : "#888888";
    col.disabled = !d.writable;
    col.dataset.hzColour = hz.id;
    col.addEventListener("change", () => h.onSetHorizon(hz.id, "color", col.value));
    const name = el("input", "hz-name");
    name.value = hz.name;
    name.disabled = !d.writable;
    name.dataset.hzName = hz.id;
    name.addEventListener("change", () => { if (name.value.trim()) h.onSetHorizon(hz.id, "name", name.value.trim()); });
    const num = (v: number | null, field: "start_time" | "end_time"): HTMLInputElement => {
      const x = el("input", "hz-num");
      x.type = "number";
      x.value = v === null ? "" : String(v);
      x.disabled = !d.writable;
      x.dataset.hzNum = `${hz.id}|${field}`;
      x.addEventListener("change", () => h.onSetHorizon(hz.id, field, x.value));
      return x;
    };
    const cells: Array<HTMLElement> = [vis, col, name, num(hz.start, "start_time"), num(hz.end, "end_time"),
      el("span", "hz-count", String(d.counts.get(hz.id) ?? 0))];
    for (const c of cells) { const td = el("td"); td.appendChild(c); tr.appendChild(td); }
    const acts = el("td", "hz-acts");
    acts.append(
      button("↑", t("hz.up"), () => h.onMoveHorizon(chosen.id, hz.id, -1), !d.writable || i === 0),
      button("↓", t("hz.down"), () => h.onMoveHorizon(chosen.id, hz.id, 1),
             !d.writable || i === chosen.horizons.length - 1),
      button("×", t("hz.delete"), () => h.onDeleteHorizon(hz.id), !d.writable),
    );
    tr.appendChild(acts);
    table.appendChild(tr);
  });
  box.appendChild(table);
  const add = button(t("hz.addHorizon"), t("hz.addHorizonTip"), () => h.onAddHorizon(chosen.id), !d.writable);
  add.dataset.hzAdd = "1";
  box.appendChild(add);
  host.appendChild(box);
}
