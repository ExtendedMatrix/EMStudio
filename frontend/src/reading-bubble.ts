/**
 * AUDIT N4 · «Cosa stai estraendo?» — the question a trace asks when it was
 * drawn BEFORE anybody said what it reads.
 *
 * It used to be a panel pinned to the bottom-right corner of the whole shell
 * (`#annotator-panel`, `style.css`), over whichever window happened to sit
 * there — measured: the Inspector. Now it is a bubble ANCHORED TO THE REGION,
 * inside the document's own window: it opens under what was just traced and
 * moves with nothing else.
 *
 * Two answers, and they are the two a reader gives:
 *   · an EXISTING property of a unit — searched as you type (unit name,
 *     property name, value), ↑ ↓ to move, Enter to take;
 *   · a NEW property of a unit — «nuova proprietà di [unità] [nome] · Crea».
 * Either one becomes, in ONE undo step, the extractor, the region and the chain
 * (`main.ts`); the bubble only asks.
 *
 * DOM only, no store: the candidates come in, a choice goes out.
 */
import { t } from "./i18n";

export interface BubbleUnit {
  id: string;
  name: string;
  props: Array<{ id: string; name: string; value: string }>;
}

export interface BubbleOpts {
  /** where it anchors, in the coordinates of `host` (a positioned element) */
  anchor: { x: number; y: number; w: number; h: number };
  /** what was traced, said in one line («la regione appena tracciata · D.3») */
  what: string;
  units: BubbleUnit[];
  /** the unit preselected for a new property (the selection, when it is one) */
  preferUnit?: string | null;
  /** names offered for a new property (the qualia vocabulary) */
  propertyNames?: string[];
  onPick: (propertyId: string) => void;
  onCreate: (unitId: string, name: string) => void;
  onClose: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Open the bubble in `host`; returns a closer. One bubble per host. */
export function openReadingBubble(host: HTMLElement, o: BubbleOpts): () => void {
  host.querySelector(":scope > .rd-bubble")?.remove();
  const pop = el("div", "rd-bubble");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", t("bubble.title"));
  const st = { q: "", i: 0 };
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    pop.remove();
    o.onClose();
  };

  const head = el("b", "rd-bubble-title", t("bubble.title"));
  const what = el("span", "rd-bubble-what", o.what);
  const q = el("input", "rd-bubble-q");
  q.type = "search";
  q.placeholder = t("bubble.search");
  q.setAttribute("aria-label", t("bubble.search"));
  q.autocomplete = "off";
  const list = el("div", "rd-bubble-list");
  list.setAttribute("role", "listbox");
  const nw = el("div", "rd-bubble-new");
  nw.appendChild(el("span", "rd-dim", t("bubble.newOf")));
  const unit = el("select", "rd-bubble-unit");
  unit.setAttribute("aria-label", t("bubble.unit"));
  for (const u of o.units) {
    const opt = el("option", "", u.name);
    opt.value = u.id;
    if (u.id === o.preferUnit) opt.selected = true;
    unit.appendChild(opt);
  }
  const name = el("input", "rd-bubble-name");
  name.placeholder = t("bubble.nameEg");
  name.setAttribute("aria-label", t("bubble.name"));
  if (o.propertyNames?.length) {
    const dl = el("datalist");
    dl.id = `rd-bubble-names-${Math.random().toString(36).slice(2, 8)}`;
    for (const n of o.propertyNames) dl.appendChild(Object.assign(el("option"), { value: n }));
    name.setAttribute("list", dl.id);
    nw.appendChild(dl);
  }
  const create = el("button", "tv-act", t("bubble.create"));
  create.type = "button";
  create.addEventListener("click", () => {
    const n = name.value.trim();
    if (!n || !unit.value) { name.focus(); return; }
    closed = true;
    pop.remove();
    o.onCreate(unit.value, n);
  });
  name.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); create.click(); }
    if (e.key === "Escape") close();
  });
  nw.append(unit, name, create);

  const flat = (): Array<{ id: string }> => {
    const needle = st.q.trim().toLowerCase();
    return o.units.flatMap((u) => u.props.filter((p) =>
      !needle || `${u.name} ${p.name} ${p.value}`.toLowerCase().includes(needle)));
  };
  const pick = (id: string): void => {
    closed = true;
    pop.remove();
    o.onPick(id);
  };
  const paint = (): void => {
    list.textContent = "";
    const needle = st.q.trim().toLowerCase();
    let k = -1;
    const all = flat();
    st.i = Math.max(0, Math.min(st.i, all.length - 1));
    for (const u of o.units) {
      const ps = u.props.filter((p) => !needle || `${u.name} ${p.name} ${p.value}`.toLowerCase().includes(needle));
      if (!ps.length) continue;
      list.appendChild(el("div", "rd-bubble-unitname", u.name));
      for (const p of ps) {
        k++;
        const b = el("button", "rd-bubble-opt" + (k === st.i ? " on" : ""));
        b.type = "button";
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", String(k === st.i));
        b.dataset.property = p.id;
        b.append(el("span", "", p.name), el("span", "rd-dim", p.value));
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => pick(p.id));
        list.appendChild(b);
      }
    }
    if (!all.length) list.appendChild(el("span", "rd-dim", t("bubble.none")));
  };
  q.addEventListener("input", () => { st.q = q.value; st.i = 0; paint(); });
  q.addEventListener("keydown", (e) => {
    e.stopPropagation();
    const all = flat();
    if (e.key === "ArrowDown") { e.preventDefault(); st.i = Math.min(st.i + 1, all.length - 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); st.i = Math.max(0, st.i - 1); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); if (all[st.i]) pick(all[st.i].id); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  const x = el("button", "rd-bubble-x", "×");
  x.type = "button";
  x.title = t("bubble.cancel");
  x.addEventListener("click", close);
  pop.append(x, head, what, q, list, nw);
  paint();
  host.appendChild(pop);
  // under the region, inside the host; above it when there is no room below;
  // BESIDE it when neither fits — never over what was just traced
  const hw = host.clientWidth || 600, hh = host.clientHeight || 400;
  const pw = pop.offsetWidth || 320, ph = pop.offsetHeight || 260;
  const a = o.anchor;
  let left = Math.max(4, Math.min(a.x, hw - pw - 4));
  let top: number;
  if (a.y + a.h + 8 + ph <= hh - 4) top = a.y + a.h + 8;
  else if (a.y - 8 - ph >= 4) top = a.y - 8 - ph;
  else {
    top = Math.max(4, Math.min(a.y, hh - ph - 4));
    left = a.x + a.w + 8 + pw <= hw - 4 ? a.x + a.w + 8 : Math.max(4, a.x - 8 - pw);
  }
  pop.dataset.side = top >= a.y + a.h ? "below" : top + ph <= a.y ? "above" : "beside";
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  q.focus();
  return close;
}
