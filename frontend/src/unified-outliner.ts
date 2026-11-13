/**
 * MICRO-OUTLINER-UNICO · the one Outliner, drawn.
 *
 * `outliner-tree.ts` says which rows there are; this draws them as a VIRTUAL
 * list (only the rows in sight are in the DOM: Templu Mare v9 has 2531 nodes)
 * and turns the clicks into the caller's verbs. The header — the selector
 * (hierarchy, dimensions, sync) and the search — is in the window's own bar
 * (`outlinerHeader`), one row for both, as decided.
 *
 * The selection is the app's one selection (`deps.pick`): the view, the Matrix
 * and the Properties follow it, and a row follows them (`setSelected`).
 */
import {
  DEFAULT_OPTS, DIMS, flattenOutliner, opensForNode, paradataShown,
  type Dim, type Hierarchy, type OutlinerOpts, type OutlinerSourceIn, type Texts, type URow,
} from "./outliner-tree";

export const ROW_H = 22;
const OVERSCAN = 8;

export interface UnifiedDeps {
  sources: () => OutlinerSourceIn[];
  texts: () => Texts;
  opts: () => OutlinerOpts;
  toggled: () => Set<string>;
  setToggled: (s: Set<string>) => void;
  selectedId: () => string | null;
  /** a row picked (a node; ⌘/Ctrl adds it to the selection) */
  pick: (row: URow, e: MouseEvent) => void;
  /** a double click: the node framed where it is drawn (the Space) */
  frame?: (row: URow) => void;
  eyeOpen: (key: string) => boolean;
  toggleEye: (key: string) => void;
  gisOpen: (id: string) => boolean;
  toggleGis: (id: string) => void;
  /** the «⋯» of a source, a graph, an aux file */
  menu: (row: URow, anchor: HTMLElement) => void;
  /** the glyph of a row (the 2D glyphs of the datamodel) */
  mark: (row: URow) => HTMLElement;
  /** words of the rows' buttons */
  word: (k: "eye" | "menu" | "absent" | "active" | "activate") => string;
  /** MICRO-PIU-FONTI · the badge of a source not active: the explicit switch */
  activate?: (row: URow) => void;
}

export interface UnifiedApi {
  refresh: () => void;
  setSelected: (id: string | null, reveal?: boolean) => void;
  /** for the checks: the rows as built */
  rows: () => URow[];
  /** for the checks: paint the rows in sight now (what a scroll frame does) */
  paintNow: () => void;
  destroy: () => void;
}

export function mountUnifiedOutliner(host: HTMLElement, d: UnifiedDeps): UnifiedApi {
  host.textContent = "";
  const root = document.createElement("div");
  root.className = "uo";
  root.tabIndex = -1;
  const scroll = document.createElement("div");
  scroll.className = "uo-scroll";
  const spacer = document.createElement("div");
  spacer.className = "uo-spacer";
  const layer = document.createElement("div");
  layer.className = "uo-rows";
  spacer.appendChild(layer);
  scroll.appendChild(spacer);
  root.appendChild(scroll);
  host.appendChild(root);

  let rows: URow[] = [];
  let drawnFrom = -1, drawnTo = -1, drawnSel: string | null | undefined, drawnGen = -1;
  let gen = 0;
  let queued = false;

  const build = (): void => {
    rows = flattenOutliner({ sources: d.sources(), opts: d.opts(), texts: d.texts(), toggled: d.toggled() });
    gen++;
    spacer.style.height = `${rows.length * ROW_H}px`;
  };

  const rowEl = (r: URow, i: number, sel: string | null): HTMLElement => {
    const el = document.createElement("div");
    el.className = `uo-row uo-${r.kind}`;
    if (r.absent) el.classList.add("uo-absent");
    if (r.active) el.classList.add("uo-active");
    if (r.id && r.id === sel && (r.kind === "node" || r.kind === "sub" || r.kind === "group" || r.kind === "gis")) el.classList.add("uo-sel");
    el.style.top = `${i * ROW_H}px`;
    el.style.paddingLeft = `${4 + r.depth * 12}px`;
    el.dataset.key = r.key;
    if (r.id) el.dataset.id = r.id;
    el.dataset.i = String(i);
    const tw = document.createElement("span");
    tw.className = "uo-tw";
    if (r.parent) { tw.textContent = r.open ? "▾" : "▸"; tw.dataset.tw = "1"; }
    el.appendChild(tw);
    if (r.kind !== "dim" && r.kind !== "empty") el.appendChild(d.mark(r));
    const lab = document.createElement("span");
    lab.className = "uo-label";
    lab.textContent = r.label;
    if (r.desc) {
      const ds = document.createElement("span");
      ds.className = "uo-desc";
      ds.textContent = r.desc;
      lab.append(" ", ds);
    }
    el.appendChild(lab);
    const tip = r.desc ? `${r.label} — ${r.desc}` : r.label;
    el.title = r.absent ? `${tip} — ${d.word("absent")}` : r.title ? `${tip} — ${r.title}` : tip;
    if (r.color) el.style.setProperty("--src-color", r.color);
    if (r.badge) {
      // MICRO-PIU-FONTI · ONE active source, changed explicitly: the badge says
      // «active» on it, and on the others it is the switch
      const b = document.createElement("button");
      b.type = "button";
      b.className = `uo-badge uo-badge-${r.badge}`;
      b.dataset.badge = r.badge;
      b.textContent = d.word(r.badge);
      b.title = d.word(r.badge);
      if (r.badge === "active") b.setAttribute("aria-pressed", "true");
      el.appendChild(b);
    }
    if (r.count) {
      const c = document.createElement("span");
      c.className = "uo-count";
      c.textContent = r.count;
      el.appendChild(c);
    }
    if (r.eye || r.gis) {
      const on = r.eye ? d.eyeOpen(r.eye) : d.gisOpen(r.gis!);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "uo-eye" + (on ? "" : " uo-eye-off");
      b.dataset.eye = r.eye ?? `gis:${r.gis}`;
      b.textContent = on ? "◉" : "○";
      b.title = d.word("eye");
      el.appendChild(b);
    }
    if (r.kind === "source" || r.kind === "graph" || r.kind === "aux") {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "uo-menu";
      b.dataset.menu = "1";
      b.textContent = "⋯";
      b.title = d.word("menu");
      el.appendChild(b);
    }
    return el;
  };

  const paint = (force = false): void => {
    const h = scroll.clientHeight || 600;
    const from = Math.max(0, Math.floor(scroll.scrollTop / ROW_H) - OVERSCAN);
    const to = Math.min(rows.length, Math.ceil((scroll.scrollTop + h) / ROW_H) + OVERSCAN);
    const sel = d.selectedId();
    if (!force && from === drawnFrom && to === drawnTo && sel === drawnSel && gen === drawnGen) return;
    drawnFrom = from; drawnTo = to; drawnSel = sel; drawnGen = gen;
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) frag.appendChild(rowEl(rows[i], i, sel));
    layer.replaceChildren(frag);
  };

  scroll.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; paint(); });
  });

  const rowOf = (t: EventTarget | null): URow | null => {
    const el = (t as HTMLElement | null)?.closest<HTMLElement>(".uo-row");
    const i = Number(el?.dataset.i ?? -1);
    return i >= 0 ? rows[i] ?? null : null;
  };
  const toggleOpen = (r: URow): void => {
    const s = new Set(d.toggled());
    if (s.has(r.key)) s.delete(r.key); else s.add(r.key);
    d.setToggled(s);
    build();
    paint(true);
  };
  layer.addEventListener("click", (e) => {
    const r = rowOf(e.target);
    if (!r) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-tw]")) { toggleOpen(r); return; }
    const eye = t.closest<HTMLElement>("[data-eye]");
    if (eye) {
      e.stopPropagation();
      if (r.gis && eye.dataset.eye === `gis:${r.gis}`) d.toggleGis(r.gis); else if (r.eye) d.toggleEye(r.eye);
      paint(true);
      return;
    }
    const m = t.closest<HTMLElement>("[data-menu]");
    if (m) { e.stopPropagation(); d.menu(r, m); return; }
    const badge = t.closest<HTMLElement>("[data-badge]");
    if (badge) { e.stopPropagation(); if (r.badge === "activate") d.activate?.(r); return; }
    if (r.id || r.kind === "graph" || r.kind === "source") { d.pick(r, e); paint(true); return; }
    if (r.parent) toggleOpen(r);
  });
  layer.addEventListener("dblclick", (e) => {
    const r = rowOf(e.target);
    if (!r || (e.target as HTMLElement).closest("[data-tw],[data-eye],[data-menu]")) return;
    if (r.id && d.frame) d.frame(r);
    else if (r.parent && !r.id) toggleOpen(r);
  });
  layer.addEventListener("contextmenu", (e) => {
    const r = rowOf(e.target);
    if (!r || !(r.kind === "source" || r.kind === "graph" || r.kind === "aux")) return;
    e.preventDefault();
    d.menu(r, (e.target as HTMLElement).closest<HTMLElement>(".uo-row") ?? root);
  });
  // ↑ ↓ move the selection over the rows that select, ← → close and open
  root.addEventListener("keydown", (e) => {
    const sel = d.selectedId();
    const at = rows.findIndex((r) => r.id === sel && (r.kind === "node" || r.kind === "sub"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const step = e.key === "ArrowDown" ? 1 : -1;
      for (let i = at + step; i >= 0 && i < rows.length; i += step) {
        const r = rows[i];
        if (r.id && (r.kind === "node" || r.kind === "sub")) {
          e.preventDefault();
          d.pick(r, new MouseEvent("click"));
          reveal(i);
          paint(true);
          return;
        }
      }
    } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && at >= 0) {
      const r = rows[at];
      if (r.parent && r.open === (e.key === "ArrowLeft")) { e.preventDefault(); toggleOpen(r); }
    }
  });

  const reveal = (i: number): void => {
    const top = i * ROW_H;
    if (top < scroll.scrollTop) scroll.scrollTop = top;
    else if (top + ROW_H > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = top + ROW_H - scroll.clientHeight;
  };

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => paint()) : null;
  ro?.observe(scroll);

  build();
  paint(true);

  return {
    refresh() { build(); paint(true); },
    setSelected(id, rev = true) {
      if (id && rev) {
        const b = { sources: d.sources(), opts: d.opts(), texts: d.texts(), toggled: d.toggled() };
        const open = opensForNode(b, id);
        if (open.length) {
          const s = new Set(d.toggled());
          for (const k of open) if (s.has(k)) s.delete(k); else s.add(k);
          d.setToggled(s);
          build();
        }
        const i = rows.findIndex((r) => r.id === id && (r.kind === "node" || r.kind === "sub"));
        if (i >= 0) reveal(i);
      }
      paint(true);
    },
    rows: () => rows,
    paintNow: () => paint(),
    destroy() { ro?.disconnect(); root.remove(); },
  };
}

// ── the header: the selector and the search, in the window's bar ───────────

export interface HeaderWords {
  selector: string;
  search: string;
  hierarchy: string;
  hier: Record<Hierarchy, string>;
  dims: string;
  dim: Record<Dim, string>;
  sync: string;
  syncHint: string;
  grey: string;
  filter: string;
  paradata: string;
  help: string;
}

/** The selector «☰» and its popover: hierarchy, dimensions, sync, the absent
 *  rows (grey / filtered), paradata. `set` writes the window's options. */
export function outlinerSelector(opts: () => OutlinerOpts, set: (o: OutlinerOpts) => void, w: HeaderWords): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "uo-head";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "win-act uo-sel-btn";
  btn.dataset.uoSelector = "1";
  const o0 = opts();
  btn.textContent = o0.sync3d ? "☰ 3D" : "☰";
  btn.classList.toggle("win-act-on", o0.sync3d);
  btn.title = w.selector;
  btn.setAttribute("aria-label", w.selector);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const was = document.querySelector(".uo-pop");
    if (was) { was.remove(); return; }
    const pop = document.createElement("div");
    pop.className = "uo-pop";
    pop.dataset.uoPop = "1";
    const draw = (): void => {
      const o = opts();
      pop.textContent = "";
      const head = (s: string) => { const h = document.createElement("div"); h.className = "uo-pop-h"; h.textContent = s; pop.appendChild(h); };
      const item = (label: string, on: boolean, kind: "radio" | "check", run: () => void, data: string, title?: string) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "uo-pop-i" + (on ? " on" : "");
        b.dataset.uoOpt = data;
        b.textContent = `${kind === "radio" ? (on ? "●" : "○") : (on ? "☑" : "☐")} ${label}`;
        if (title) b.title = title;
        b.addEventListener("click", (ev) => { ev.stopPropagation(); run(); draw(); });
        pop.appendChild(b);
      };
      head(w.hierarchy);
      for (const h of ["epoch", "alpha", "type"] as Hierarchy[])
        item(w.hier[h], o.hierarchy === h, "radio", () => set({ ...opts(), hierarchy: h }), `hier:${h}`);
      head(w.sync);
      item(w.sync, o.sync3d, "check", () => set({ ...opts(), sync3d: !opts().sync3d }), "sync", w.syncHint);
      item(w.grey, o.absent === "grey", "radio", () => set({ ...opts(), absent: "grey" }), "absent:grey");
      item(w.filter, o.absent === "filter", "radio", () => set({ ...opts(), absent: "filter" }), "absent:filter");
      head(w.dims);
      for (const dm of DIMS) {
        if (dm === "paradata") {
          item(w.paradata, paradataShown(o), "check", () => set({ ...opts(), paradata: !paradataShown(opts()) }), "dim:paradata");
          continue;
        }
        const on = o.dims.includes(dm);
        item(w.dim[dm], on, "check", () => {
          const cur = opts();
          set({ ...cur, dims: on ? cur.dims.filter((x) => x !== dm) : DIMS.filter((x) => x === dm || cur.dims.includes(x)) });
        }, `dim:${dm}`);
      }
    };
    draw();
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.max(4, Math.min(r.left, innerWidth - 240))}px`;
    pop.style.top = `${r.bottom + 4}px`;
    const close = (ev: Event) => {
      if (pop.contains(ev.target as Node) || ev.target === btn) return;
      pop.remove();
      document.removeEventListener("pointerdown", close, true);
    };
    setTimeout(() => document.addEventListener("pointerdown", close, true), 0);
  });
  wrap.appendChild(btn);
  return wrap;
}

/** Read a window's options, completing what an older save lacks. */
export function readOpts(v: unknown): OutlinerOpts {
  const o = (v && typeof v === "object" ? v : {}) as Partial<OutlinerOpts>;
  const dims = Array.isArray(o.dims) ? o.dims.filter((x): x is Dim => (DIMS as readonly string[]).includes(x)) : DEFAULT_OPTS.dims;
  return {
    hierarchy: o.hierarchy === "alpha" || o.hierarchy === "type" ? o.hierarchy : "epoch",
    dims,
    sync3d: !!o.sync3d,
    absent: o.absent === "filter" ? "filter" : "grey",
    ...(typeof o.paradata === "boolean" ? { paradata: o.paradata } : {}),
    query: "",
  };
}
