/**
 * AUDIT N5 · LA VERIFICA DELLA CRONOLOGIA — the window that checks the deltas
 * and then corrects (E.D.: «epoche e periodi non si sovrappongono»: an overlap
 * is an error to correct — first the deltas are checked, then a bound is fixed
 * or the epoch becomes a PHASE of the one that contains it).
 *
 * Three things, top to bottom, as in the scrivania v10:
 *   1. the epochs and their phases as BARS on a time axis readable with very
 *      different spans — a broken axis, each stretch between two bounds weighted
 *      by the square root of its duration, so 20 years next to 2000 still show;
 *      the overlaps in red, with their delta;
 *   2. one CARD per overlap, with its remedies: «X inizia nel …» / «Y finisce
 *      nel …» (cut at the other's bound) and «Rendi fase di Y» when X lies all
 *      inside Y — present but disabled, with its reason, when it does not;
 *   3. the TABLE of the bounds: start, end, Δ, «Dentro» (an epoch = makes it a
 *      phase of that one; «— epoca —» = back to an epoch).
 *
 * DOM only. The numbers come in (`ChronologyData`), every change goes out
 * through the callbacks, and each one is ONE undo step on the other side.
 */
import { t } from "./i18n";
import type { EpochOverlap } from "./model";

export interface ChronoEpoch {
  id: string;
  name: string;
  start: number | null;
  end: number | null;
  /** the epoch this one is a phase of, or null */
  parent: string | null;
}

export interface ChronologyData {
  epochs: ChronoEpoch[];
  overlaps: EpochOverlap[];
  /** the other chronology problems, already said (phase outside its epoch…);
   *  `spill` names the epoch a phase comes out of (SPAZIO: its second remedy) */
  others: Array<{ epoch: string; text: string; spill?: { phase: string; epoch: string } }>;
  selected: string | null;
  /** SPAZIO · what each epoch holds, for «Elimina…» */
  contents?: Record<string, { units: number; phases: number; rms: number }>;
  /** SPAZIO · where each epoch's content may go (not itself, not its phases) */
  targets?: Record<string, string[]>;
  /** SPAZIO · the epoch whose «Elimina…» row is open, and its preset target */
  deleting?: { id: string; to: string | null } | null;
}

export interface ChronologyHooks {
  onSelect(id: string): void;
  onSetBound(id: string, which: "start" | "end", value: string): void;
  onMakePhase(inner: string, outer: string): void;
  onMakeEpoch(id: string): void;
  /** a disabled remedy was pressed: say why */
  onRefused(why: string): void;
  /** SPAZIO · open (or close, with null) the «Elimina…» row of an epoch */
  onAskDelete?(id: string | null, to?: string | null): void;
  /** SPAZIO · «Elimina e travasa»: the epoch goes, its content into `to` */
  onDissolve?(id: string, to: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const SVG = "http://www.w3.org/2000/svg";
function svgEl(tag: string, attrs: Record<string, string | number>, cls?: string): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (cls) e.setAttribute("class", cls);
  return e;
}

/** The rows, as the Matrix orders its lanes (newest on top), phases under
 *  their epoch (oldest first, as they are read inside a lane). */
export function chronologyRows(epochs: ChronoEpoch[]): Array<[ChronoEpoch, number]> {
  const byParent = new Map<string | null, ChronoEpoch[]>();
  for (const e of epochs) {
    const k = e.parent && epochs.some((x) => x.id === e.parent) ? e.parent : null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(e);
  }
  const start = (e: ChronoEpoch) => e.start ?? Number.POSITIVE_INFINITY;
  const out: Array<[ChronoEpoch, number]> = [];
  const walk = (parent: string | null, depth: number) => {
    const kids = (byParent.get(parent) ?? []).slice()
      .sort((a, b) => depth === 0 ? start(b) - start(a) : start(a) - start(b));
    for (const k of kids) {
      out.push([k, depth]);
      if (depth < 3) walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** A broken axis: every bound is a breakpoint, every stretch between two is
 *  as wide as the square root of its length (with a floor), so a short epoch
 *  beside a very long one stays readable. Returns year → x. */
export function brokenAxis(bounds: number[], x0: number, x1: number): { X: (y: number) => number; breaks: number[] } {
  const breaks = [...new Set(bounds.filter((b) => Number.isFinite(b)))].sort((a, b) => a - b);
  if (breaks.length < 2) return { X: () => (x0 + x1) / 2, breaks };
  const w = breaks.slice(1).map((b, i) => Math.max(1, Math.sqrt(b - breaks[i])));
  const total = w.reduce((a, b) => a + b, 0);
  const xs = [x0];
  for (const wi of w) xs.push(xs[xs.length - 1] + (wi / total) * (x1 - x0));
  const X = (y: number): number => {
    if (y <= breaks[0]) return xs[0];
    if (y >= breaks[breaks.length - 1]) return xs[xs.length - 1];
    const i = breaks.findIndex((b) => b >= y);
    const a = breaks[i - 1], b = breaks[i];
    return xs[i - 1] + ((y - a) / (b - a)) * (xs[i] - xs[i - 1]);
  };
  return { X, breaks };
}

export function renderChronology(host: HTMLElement, data: ChronologyData, h: ChronologyHooks): void {
  host.textContent = "";
  const root = el("div", "chr");
  host.appendChild(root);
  const N = new Map(data.epochs.map((e) => [e.id, e]));
  const nameOf = (id: string) => N.get(id)?.name ?? id;
  if (!data.epochs.length) {
    root.appendChild(el("p", "chr-empty", t("chr.noEpochs")));
    return;
  }
  root.appendChild(el("p", "chr-lead", t("chr.lead")));

  // ── 1 · the bars ─────────────────────────────────────────────────────────
  const rows = chronologyRows(data.epochs);
  const bounds = data.epochs.flatMap((e) => [e.start, e.end]).filter((v): v is number => v != null);
  const W = 760, left = 190, right = W - 16, rowH = 24, top = 10;
  const H = top + rows.length * rowH + 26;
  const { X, breaks } = brokenAxis(bounds, left, right);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t("chr.title") }, "chr-axis");
  let lastX = -99;
  for (const b of breaks) {
    const x = X(b);
    svg.appendChild(svgEl("line", { x1: x, y1: top - 4, x2: x, y2: H - 20 }, "chr-grid"));
    if (x - lastX >= 30) {
      const tx = svgEl("text", { x, y: H - 6, "text-anchor": "middle" }, "chr-tick");
      tx.textContent = String(b);
      svg.appendChild(tx);
      lastX = x;
    }
  }
  const bad = new Set(data.overlaps.flatMap((o) => [o.later, o.earlier]));
  rows.forEach(([e, depth], i) => {
    const y = top + i * rowH;
    const g = svgEl("g", { "data-chsel": e.id }, "chr-row" + (data.selected === e.id ? " sel" : ""));
    const label = svgEl("text", { x: 8 + depth * 14, y: y + 16 }, "chr-name" + (depth ? " sub" : ""));
    label.textContent = e.name;
    g.appendChild(label);
    if (e.start != null && e.end != null) {
      g.appendChild(svgEl("rect", {
        x: X(e.start), y: y + 4, width: Math.max(3, X(e.end) - X(e.start)), height: rowH - 9, rx: 3,
      }, "chr-bar" + (depth ? " sub" : "") + (bad.has(e.id) ? " bad" : "")));
    }
    g.addEventListener("click", () => h.onSelect(e.id));
    svg.appendChild(g);
  });
  for (const o of data.overlaps) {
    const ra = rows.findIndex(([e]) => e.id === o.later), rb = rows.findIndex(([e]) => e.id === o.earlier);
    if (ra < 0 || rb < 0) continue;
    const ya = top + Math.min(ra, rb) * rowH + 3, yb = top + Math.max(ra, rb) * rowH + rowH - 5;
    const r = svgEl("rect", { x: X(o.from), y: ya, width: Math.max(3, X(o.to) - X(o.from)), height: yb - ya }, "chr-ov");
    const tt = svgEl("title", {});
    tt.textContent = t("chr.common", { n: String(o.delta) });
    r.appendChild(tt);
    svg.appendChild(r);
  }
  const scroll = el("div", "chr-svg");
  scroll.appendChild(svg);
  root.appendChild(scroll);

  // ── 2 · the cards and their remedies ─────────────────────────────────────
  const cards = el("div", "chr-issues");
  const btn = (label: string, run: () => void, why?: string): HTMLButtonElement => {
    const b = el("button", "insp-btn chr-fix", label);
    b.type = "button";
    if (why) {
      b.setAttribute("aria-disabled", "true");
      b.title = why;
      b.addEventListener("click", () => h.onRefused(why));
    } else b.addEventListener("click", run);
    return b;
  };
  for (const o of data.overlaps) {
    const L = N.get(o.later)!, E = N.get(o.earlier)!;
    const card = el("div", "chr-card");
    card.dataset.overlap = `${o.later}|${o.earlier}`;
    card.dataset.delta = String(o.delta);
    card.appendChild(el("b", "", t("chr.overlap", { a: L.name, b: E.name, n: String(o.delta), from: String(o.from), to: String(o.to) })));
    card.appendChild(el("span", "chr-why", o.inner
      ? t("chr.inside", { a: nameOf(o.inner), b: nameOf(o.outer!) })
      : t("chr.checkBounds")));
    const acts = el("div", "chr-acts");
    const phase = o.inner
      ? btn(t("chr.makePhase", { b: nameOf(o.outer!) }), () => h.onMakePhase(o.inner!, o.outer!))
      : btn(t("chr.makePhaseOf"), () => {}, t("chr.notInside", { n: String(o.overhang) }));
    phase.dataset.remedy = "phase";
    const cutL = btn(t("chr.startsIn", { a: L.name, y: String(E.end) }), () => h.onSetBound(L.id, "start", String(E.end)));
    cutL.dataset.remedy = "start";
    const cutE = btn(t("chr.endsIn", { b: E.name, y: String(L.start) }), () => h.onSetBound(E.id, "end", String(L.start)));
    cutE.dataset.remedy = "end";
    if (o.inner) acts.append(phase, cutL, cutE); else acts.append(cutL, cutE, phase);
    card.appendChild(acts);
    cards.appendChild(card);
  }
  for (const x of data.others) {
    const card = el("div", "chr-card other");
    card.appendChild(el("b", "", x.text));
    const acts = el("div", "chr-acts");
    acts.appendChild(btn(t("chr.fixInTable"), () => {
      host.querySelector<HTMLInputElement>(`input[data-chnum="${x.epoch}|start"]`)?.focus();
    }));
    // SPAZIO · a phase that comes out of its epoch can also be dissolved INTO it
    if (x.spill && h.onAskDelete) {
      const sp = x.spill;
      const d = btn(t("chr.dissolveInto", { b: nameOf(sp.epoch) }), () => h.onAskDelete!(sp.phase, sp.epoch));
      d.dataset.remedy = "dissolve";
      d.dataset.chdel = sp.phase;
      acts.appendChild(d);
    }
    card.appendChild(acts);
    cards.appendChild(card);
  }
  const dated = data.epochs.filter((e) => e.start !== null || e.end !== null).length;
  if (!dated) {
    // T1 · nothing to compare is not «no overlap»: with no dates the check has
    // not happened, and the sentence says so, with the gesture that makes it
    // possible (dev.17 said «No overlap» on a graph with no dates at all)
    const none = el("div", "chr-card none");
    none.dataset.state = "undated";
    none.append(el("b", "", t("chr.noDates")), el("span", "chr-why", t("chr.noDatesWhy")));
    const acts = el("div", "chr-acts");
    acts.appendChild(btn(t("chain.writeEpochDates"), () => {
      host.querySelector<HTMLInputElement>('input[data-chnum$="|start"]')?.focus();
    }));
    none.appendChild(acts);
    cards.appendChild(none);
  } else if (!data.overlaps.length && !data.others.length) {
    const ok = el("div", "chr-card ok");
    ok.append(el("b", "", t("chr.noOverlap")), el("span", "chr-why",
      dated < data.epochs.length ? t("chr.noOverlapSome", { n: String(dated), of: String(data.epochs.length) })
        : t("chr.noOverlapWhy")));
    cards.appendChild(ok);
  }
  root.appendChild(cards);

  /** «Elimina X · contiene … · e travasa in [ ] · Elimina e travasa · Annulla» */
  const deleteRow = (e: ChronoEpoch): HTMLElement => {
    const tr = el("tr", "chr-del-row");
    const td = el("td");
    td.colSpan = 7;
    const box = el("div", "chr-del");
    box.dataset.chdelRow = e.id;
    const c = data.contents?.[e.id] ?? { units: 0, phases: 0, rms: 0 };
    box.appendChild(el("b", "", t("chr.deleteWhat", { a: e.name })));
    const count = (n: number, one: string, many: string) => t(n === 1 ? one : many, { n: String(n) });
    const holds = el("span", "chr-del-holds", t("chr.holds", {
      what: [count(c.units, "chr.oneUnit", "chr.nUnits"), count(c.phases, "chr.onePhase", "chr.nPhases"), `${c.rms} RM`].join(" · ") }));
    holds.dataset.units = String(c.units);
    holds.dataset.phases = String(c.phases);
    holds.dataset.rms = String(c.rms);
    box.appendChild(holds);
    box.appendChild(el("span", "", t("chr.moveInto")));
    const to = el("select", "chr-del-to");
    to.dataset.chdelto = e.id;
    to.setAttribute("aria-label", t("chr.moveInto"));
    const allowed = new Set(data.targets?.[e.id] ?? []);
    for (const [x, depth] of rows) {
      if (!allowed.has(x.id)) continue;
      const o = el("option", "", `${depth ? "— " : ""}${x.name}`);
      o.value = x.id;
      to.appendChild(o);
    }
    const preset = data.deleting?.to ?? e.parent ?? null;
    if (preset && allowed.has(preset)) to.value = preset;
    const go = el("button", "insp-btn chr-del-go", t("chr.deleteGo"));
    go.type = "button";
    go.dataset.chdelgo = e.id;
    go.disabled = !to.options.length;
    go.addEventListener("click", () => { if (to.value) h.onDissolve!(e.id, to.value); });
    const no = el("button", "insp-btn", t("common.cancel"));
    no.type = "button";
    no.addEventListener("click", () => h.onAskDelete!(null));
    box.append(to, go, no);
    td.appendChild(box);
    tr.appendChild(td);
    return tr;
  };

  // ── 3 · the bounds ───────────────────────────────────────────────────────
  const table = el("table", "chr-table");
  const head = el("tr");
  for (const k of ["chr.colEpoch", "chr.colStart", "chr.colEnd", "Δ", "chr.colInside", ""])
    head.appendChild(el("th", "", k.startsWith("chr.") ? t(k) : k));
  table.appendChild(el("thead")).appendChild(head);
  const body = el("tbody");
  const tops = data.epochs.filter((e) => !e.parent);
  for (const [e, depth] of rows) {
    const tr = el("tr", (depth ? "sub" : "") + (data.selected === e.id ? " on" : ""));
    tr.dataset.epoch = e.id;
    tr.appendChild(el("td", "", e.name));
    for (const which of ["start", "end"] as const) {
      const td = el("td");
      const inp = el("input", "chr-num");
      inp.value = e[which] == null ? "" : String(e[which]);
      inp.inputMode = "numeric";
      inp.dataset.chnum = `${e.id}|${which}`;
      inp.setAttribute("aria-label", `${e.name} · ${t(which === "start" ? "chr.colStart" : "chr.colEnd")}`);
      const commit = () => {
        const v = inp.value.trim();
        const now = e[which] == null ? "" : String(e[which]);
        if (v !== now) h.onSetBound(e.id, which, v);
      };
      inp.addEventListener("change", commit);
      inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); commit(); } });
      td.appendChild(inp);
      tr.appendChild(td);
    }
    tr.appendChild(el("td", "chr-delta" + (bad.has(e.id) ? " bad" : ""),
      e.start != null && e.end != null ? String(e.end - e.start) : ""));
    const td = el("td");
    const sel = el("select", "chr-parent");
    sel.dataset.chpar = e.id;
    sel.setAttribute("aria-label", `${e.name} · ${t("chr.colInside")}`);
    const none = el("option", "", t("chr.asEpoch"));
    none.value = "";
    sel.appendChild(none);
    for (const p of tops) {
      if (p.id === e.id) continue;
      const o = el("option", "", p.name);
      o.value = p.id;
      if (p.id === e.parent) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => {
      if (sel.value) h.onMakePhase(e.id, sel.value);
      else h.onMakeEpoch(e.id);
    });
    td.appendChild(sel);
    tr.appendChild(td);
    // SPAZIO · «Elimina…»: a row of confirmation below, that says what moves where
    const tdx = el("td", "chr-x");
    if (h.onAskDelete) {
      const del = el("button", "insp-btn chr-del-ask", t("chr.deleteAsk"));
      del.type = "button";
      del.dataset.chdel = e.id;
      del.title = t("chr.deleteAskTitle");
      del.addEventListener("click", () => h.onAskDelete!(data.deleting?.id === e.id ? null : e.id));
      tdx.appendChild(del);
    }
    tr.appendChild(tdx);
    body.appendChild(tr);
    if (data.deleting?.id === e.id && h.onDissolve) body.appendChild(deleteRow(e));
  }
  table.appendChild(body);
  root.appendChild(table);
}
