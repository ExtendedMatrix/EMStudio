/**
 * MICRO-SEG23 · «Narrates»: the picker of the Inspector, a TREE IN ORDER OF
 * TIME with ticks (the data and the order: `narrative-lanes.ts`).
 *
 *   · Epochs / Horizons — a switch, only when the container has horizons;
 *   · an epoch (a horizon), its activities indented under it, each line once
 *     with its interval of dates; the activities in no epoch close the list;
 *   · a tick adds the line to what the part narrates, untick removes it — one
 *     undo step each;
 *   · ticking an epoch that has activities the part does not narrate yet, on a
 *     part that can have titles under it (a chapter, a section), ASKS first, in
 *     place: «Only the epoch» · «The epoch with its N activities as sections»
 *     (subsections, under a section) — the names listed — · «Cancel». Nothing
 *     is created before the choice;
 *   · a lane the part narrates that this graph does not have stays, ticked,
 *     at the end, «not in this graph», so it can be removed.
 */
import { t } from "./i18n";
import { intervalLabel, type LaneItem, type LaneMode } from "./narrative-lanes";

export interface LanePickerHooks {
  /** the tree for a mode (epochs, or the horizons of the chosen periodization) */
  tree(mode: LaneMode): LaneItem[];
  /** the container has horizons: the switch is shown */
  hasHorizons: boolean;
  mode: LaneMode;
  onMode(mode: LaneMode): void;
  /** the ids the part narrates now, in order */
  selected: string[];
  onSet(ids: string[]): void;
  /** «the epoch with its activities»: null when the part cannot have titles
   *  under it (a subsection) — then only the epoch is ticked */
  subKind: "section" | "subsection" | null;
  /** the activities of an epoch the part does not narrate yet (in its run) */
  missingUnder(item: LaneItem): LaneItem[];
  onWithActivities(epoch: LaneItem, activities: LaneItem[]): void;
  /** the name of an id the tree does not have (null: not in this graph) */
  nameOf(id: string): string | null;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(label: string, run: () => void, cls = "insp-btn"): HTMLButtonElement {
  const b = el("button", cls, label) as HTMLButtonElement;
  b.type = "button";
  b.addEventListener("click", run);
  return b;
}

export function renderLanePicker(host: HTMLElement, h: LanePickerHooks): HTMLElement {
  const box = el("div", "nlp");
  box.dataset.nvset = "anchor";
  host.appendChild(box);
  const head = el("div", "nlp-head");
  head.appendChild(el("span", "ninsp-k", t("ninsp.narrates")));
  if (h.hasHorizons) {
    const seg = el("div", "nlp-seg");
    seg.setAttribute("role", "group");
    for (const m of ["epochs", "horizons"] as LaneMode[]) {
      const b = btn(t(`nlp.mode.${m}`), () => { if (m !== h.mode) h.onMode(m); }, "nlp-mode");
      b.dataset.nlpMode = m;
      b.setAttribute("aria-pressed", String(m === h.mode));
      if (m === h.mode) b.classList.add("on");
      seg.appendChild(b);
    }
    head.appendChild(seg);
  }
  box.appendChild(head);

  const mode = h.hasHorizons ? h.mode : "epochs";
  const tree = h.tree(mode);
  const sel = new Set(h.selected);
  const list = el("div", "nlp-list");
  list.setAttribute("role", "tree");
  box.appendChild(list);
  const known = new Set<string>();

  const toggle = (item: LaneItem, on: boolean, row: HTMLElement, cb: HTMLInputElement) => {
    if (!on) { h.onSet(h.selected.filter((x) => x !== item.id)); return; }
    const missing = item.kind === "epoch" || item.kind === "horizon" ? h.missingUnder(item) : [];
    if (!missing.length || !h.subKind) { h.onSet([...h.selected, item.id]); return; }
    // ask, in place, before anything is created
    list.querySelectorAll(".nlp-ask").forEach((x) => x.remove());
    cb.checked = false;
    const ask = el("div", "nlp-ask");
    ask.dataset.nlpAsk = item.id;
    ask.setAttribute("role", "group");
    const only = btn(t(item.kind === "horizon" ? "nlp.onlyHorizon" : "nlp.onlyEpoch"),
      () => h.onSet([...h.selected, item.id]), "insp-btn nlp-only");
    only.dataset.nlpChoice = "only";
    const kinds = t(h.subKind === "section" ? "nlp.asSections" : "nlp.asSubsections", { n: String(missing.length) });
    const withActs = btn(t(item.kind === "horizon" ? "nlp.withActsHorizon" : "nlp.withActs", { what: kinds }),
      () => h.onWithActivities(item, missing), "insp-btn nlp-with");
    withActs.dataset.nlpChoice = "with";
    withActs.title = missing.map((a) => a.name).join(" · ");
    const cancel = btn(t("nlp.cancel"), () => ask.remove(), "insp-btn nlp-cancel");
    cancel.dataset.nlpChoice = "cancel";
    ask.append(only, withActs);
    const names = el("div", "nlp-ask-names", missing.map((a) => a.name).join(" · "));
    ask.append(names, cancel);
    row.after(ask);
    withActs.focus?.();
  };

  const rowOf = (item: LaneItem, depth: number): void => {
    if (item.kind === "none") {
      if (!item.children.length) return;
      list.appendChild(el("div", "nlp-group", t(mode === "horizons" ? "nlp.noHorizon" : "ninsp.laneNoEpoch")));
      item.children.forEach((c) => rowOf(c, 1));
      return;
    }
    known.add(item.id);
    const row = el("label", `nlp-row nlp-${item.kind}`);
    row.setAttribute("role", "treeitem");
    row.style.paddingLeft = `${4 + depth * 16}px`;
    row.dataset.nlpId = item.id;
    row.dataset.nlpKind = item.kind;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = sel.has(item.id);
    cb.addEventListener("change", () => toggle(item, cb.checked, row, cb));
    row.appendChild(cb);
    row.appendChild(el("span", "nlp-name", item.name));
    const iv = intervalLabel(item.start, item.end);
    if (iv) row.appendChild(el("span", "nlp-dates", iv));
    list.appendChild(row);
    // the functional units (the third level) are in the shape, not shown yet
    item.children.filter((c) => c.kind !== "functional_unit").forEach((c) => rowOf(c, depth + 1));
  };
  tree.forEach((it) => rowOf(it, 0));
  if (!tree.some((x) => x.kind !== "none" || x.children.length))
    list.appendChild(el("p", "ninsp-note", t("nlp.empty")));

  // what the part narrates and the tree does not show (another mode, another graph)
  const others = h.selected.filter((id) => !known.has(id));
  if (others.length) {
    list.appendChild(el("div", "nlp-group", t("nlp.elsewhere")));
    for (const id of others) {
      const row = el("label", "nlp-row nlp-other");
      row.dataset.nlpId = id;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.addEventListener("change", () => { if (!cb.checked) h.onSet(h.selected.filter((x) => x !== id)); });
      row.appendChild(cb);
      const name = h.nameOf(id);
      row.appendChild(el("span", "nlp-name", name ?? t("nv.laneMissing")));
      if (!name) row.title = t("nv.laneNotHere", { id });
      list.appendChild(row);
    }
  }
  return box;
}
