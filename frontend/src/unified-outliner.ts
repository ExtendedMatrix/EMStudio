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
  /** MICRO-SPAZIO-CONTAINER p.6 · the Space's selection (its keys): a row with a
   *  `skey` is lit by it, picked into it (⌘/Ctrl adds, ⇧ a range in the rows'
   *  order) and stays where it is; its right click is the selection's menu */
  selectedKeys?: () => ReadonlySet<string>;
  pickKey?: (row: URow, e: MouseEvent, order: string[]) => void;
  keyMenu?: (row: URow, anchor: HTMLElement, at: { x: number; y: number }) => void;
  /** MICRO-OUTLINER-EPOCHE-TOOLTIP p.2 · a row dropped on an epoch: MOVE (a plain
   *  drop) or EXTEND (with Alt); `dropLabel` says which, while dragging */
  epochDrop?: (row: URow, epoch: string, extend: boolean) => void;
  dropLabel?: (row: URow, epoch: string, extend: boolean) => string | null;
  /** p.1 · the ⚠ of a container out of step: its menu («allinea…») */
  warnMenu?: (row: URow, at: { x: number; y: number }) => void;
  /** MICRO-TESTATE-COERENTI p.11 · «Segui il container»: the member drops its own epoch */
  follow?: (row: URow) => void;
  /** p.11 · the word of that button */
  followWord?: string;
  /** p.10a · a model dropped on a container: it enters it (`put_in_container`) */
  containerDrop?: (row: URow, groupId: string, from: string | null, add: boolean) => void;
  /** …its words while dragging (null: nothing would happen there); groupId "" = out of `from` */
  containerDropLabel?: (row: URow, groupId: string, from: string | null, add: boolean) => string | null;
  /** p.9 · «Completa il container…» on a container's row */
  card?: (row: URow) => void;
  /** p.4 · the Space's controls on a row that has something in the scene */
  space?: SpaceRowDeps;
}

/** MICRO-OUTLINER-EPOCHE-TOOLTIP p.4 · what the old Outliner of the scene did on
 *  a row, now on the one Outliner's rows in the Space: the arrow (selectable),
 *  the level's chip and its menu, a container's alternative, the mark of a
 *  load that failed, Isolate, Frame; a version's dot draws it. Local
 *  preferences per person (`emstudio.space3d`), never in the em.json. */
export interface SpaceRowDeps {
  lockOpen: (key: string) => boolean;
  toggleLock: (key: string) => void;
  chip: (row: URow) => string | null;
  chipMenu: (row: URow, at: { x: number; y: number }) => void;
  alt: (row: URow) => string | null;
  altMenu: (row: URow, at: { x: number; y: number }) => void;
  failed: (row: URow) => string | null;
  failMenu: (row: URow, at: { x: number; y: number }) => void;
  isolated: () => string | null;
  isolate: (row: URow) => void;
  frame: (row: URow) => void;
  chooseVersion: (row: URow) => void;
  /** an extractor whose document is not lit, its eye forced on */
  forced: (key: string) => boolean;
  words: { arrow: string; isolate: string; frame: string; ghost: string };
  /** MICRO-TESTATE-COERENTI p.2 · the category of a row's key when it is OFF in
   *  «Visibilità ▾» (its name, for the mark), null when on; and a click on the mark */
  categoryOff?: (key: string) => { key: string; label: string; title: string } | null;
  categoryOn?: (cat: string) => void;
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

  const rowEl = (r: URow, i: number, sel: string | null, keys: ReadonlySet<string> | null): HTMLElement => {
    const el = document.createElement("div");
    el.className = `uo-row uo-${r.kind}`;
    if (r.absent) el.classList.add("uo-absent");
    if (r.active) el.classList.add("uo-active");
    if (r.skey && keys) { if (keys.has(r.skey)) el.classList.add("uo-sel"); }
    else if (r.id && r.id === sel && (r.kind === "node" || r.kind === "sub" || r.kind === "group" || r.kind === "gis")) el.classList.add("uo-sel");
    if (r.skey) el.dataset.skey = r.skey;
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
    if (r.version) {
      el.classList.add("uo-version-row");
      if (r.version.drawn) el.classList.add("uo-drawn");
      const u = [r.version.level, ...(r.version.uses ?? [])].filter(Boolean).join(" · ");
      if (u) { const x = document.createElement("span"); x.className = "uo-uses"; x.textContent = u; el.appendChild(x); }
      if (r.version.auto) { const a = document.createElement("span"); a.className = "uo-auto"; a.textContent = "A"; el.appendChild(a); }
    }
    if (r.alt) el.classList.add("uo-alt");
    if (r.ghost) el.classList.add("uo-ghost");
    if (r.note) {
      // MICRO-OUTLINER-EPOCHE-TOOLTIP p.1 · a member living in another epoch: where
      const n = document.createElement("span");
      n.className = "uo-note";
      n.dataset.note = "1";
      n.textContent = r.note;
      if (r.noteTitle) n.title = r.noteTitle;
      el.appendChild(n);
    }
    if (r.followGroup && d.follow) {
      const f = document.createElement("button");
      f.type = "button";
      f.className = "uo-follow";
      f.dataset.follow = r.followGroup;
      f.textContent = d.followWord ?? "↩";
      el.appendChild(f);
    }
    if (r.warn) {
      const w = document.createElement("button");
      w.type = "button";
      w.className = "uo-warn";
      w.dataset.warn = "1";
      w.textContent = "⚠";
      w.title = r.warn;
      el.appendChild(w);
    }
    const S = d.space;
    if (S && (r.skey || r.kind === "node")) {
      const failed = r.skey ? S.failed(r) : null;
      if (failed) {
        const f = document.createElement("button");
        f.type = "button";
        f.className = "uo-fail";
        f.dataset.sp = "fail";
        f.textContent = "⚠";
        f.title = failed;
        el.appendChild(f);
      }
      const chip = S.chip(r);
      if (chip) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "uo-chip";
        c.dataset.sp = "lod";
        c.textContent = `${chip} ▾`;
        el.appendChild(c);
      }
      const alt = S.alt(r);
      if (alt) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "uo-chip uo-altchip";
        c.dataset.sp = "alt";
        c.textContent = `${alt} ▾`;
        el.appendChild(c);
      }
      if (r.skey && !r.skey.startsWith("x3d:")) {
        const iso = document.createElement("button");
        iso.type = "button";
        iso.className = "uo-mini" + (S.isolated() === r.skey ? " on" : "");
        iso.dataset.sp = "isolate";
        iso.textContent = "◎";
        iso.title = S.words.isolate;
        const fr = document.createElement("button");
        fr.type = "button";
        fr.className = "uo-mini";
        fr.dataset.sp = "frame";
        fr.textContent = "⤢";
        fr.title = S.words.frame;
        el.append(iso, fr);
      }
    }
    const tip = r.desc ? `${r.label} — ${r.desc}` : r.label;
    el.title = r.absent ? `${tip} — ${d.word("absent")}` : r.title ? `${tip} — ${r.title}` : tip;
    if (r.ghost && S) el.title = `${tip} — ${S.words.ghost}`;
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
    // MICRO-TESTATE-COERENTI p.2 · the row of a category switched off: attenuated,
    // with a mark that says it and turns it back on
    const cOff = S && r.skey ? S.categoryOff?.(r.skey) ?? null : null;
    if (cOff) {
      el.classList.add("uo-cat-off");
      const m = document.createElement("button");
      m.type = "button";
      m.className = "uo-cat-off-mark";
      m.dataset.catOn = cOff.key;
      m.textContent = "⊘";
      m.title = cOff.title;
      m.setAttribute("aria-label", cOff.title);
      el.appendChild(m);
    }
    if (S && r.skey && !r.ghost) {
      const lk = S.lockOpen(r.skey);
      const a = document.createElement("button");
      a.type = "button";
      a.className = "uo-arrow" + (lk ? "" : " uo-arrow-off");
      a.dataset.sp = "arrow";
      a.textContent = "↖";
      a.title = S.words.arrow;
      el.appendChild(a);
    }
    if (r.eye || r.gis) {
      const on = r.ghost && S ? S.forced(r.eye!) : r.eye ? d.eyeOpen(r.eye) : d.gisOpen(r.gis!);
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
    const keys = d.selectedKeys?.() ?? null;
    const sel = d.selectedId();
    const selSig = `${sel}|${keys ? [...keys].join(",") : ""}`;
    if (!force && from === drawnFrom && to === drawnTo && selSig === drawnSel && gen === drawnGen) return;
    drawnFrom = from; drawnTo = to; drawnSel = selSig; drawnGen = gen;
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) frag.appendChild(rowEl(rows[i], i, sel, keys));
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
    const box = (x: HTMLElement) => { const b = x.getBoundingClientRect(); return { x: b.left, y: b.bottom + 2 }; };
    const w = t.closest<HTMLElement>("[data-warn]");
    if (w) { e.stopPropagation(); d.warnMenu?.(r, box(w)); return; }
    if (t.closest("[data-follow]") && d.follow) { e.stopPropagation(); d.follow(r); return; }
    const co = t.closest<HTMLElement>("[data-cat-on]");
    if (co && d.space?.categoryOn) { e.stopPropagation(); d.space.categoryOn(co.dataset.catOn!); paint(true); return; }
    const sp = t.closest<HTMLElement>("[data-sp]");
    if (sp && d.space) {
      e.stopPropagation();
      const S = d.space;
      const what = sp.dataset.sp;
      if (what === "arrow" && r.skey) S.toggleLock(r.skey);
      else if (what === "lod") S.chipMenu(r, box(sp));
      else if (what === "alt") S.altMenu(r, box(sp));
      else if (what === "fail") S.failMenu(r, box(sp));
      else if (what === "isolate") S.isolate(r);
      else if (what === "frame") S.frame(r);
      paint(true);
      return;
    }
    if (r.version && d.space) { d.space.chooseVersion(r); paint(true); return; }
    const badge = t.closest<HTMLElement>("[data-badge]");
    if (badge) { e.stopPropagation(); if (r.badge === "activate") d.activate?.(r); return; }
    if (r.skey && d.pickKey) { d.pickKey(r, e, rows.filter((x) => x.skey).map((x) => x.skey!)); paint(true); return; }
    if (r.id || r.kind === "graph" || r.kind === "source") { d.pick(r, e); paint(true); return; }
    if (r.parent) toggleOpen(r);
  });
  // MICRO-OUTLINER-EPOCHE-TOOLTIP p.2 · a row dragged onto an epoch: a plain
  // drop MOVES it, with Alt it EXTENDS it there. With the pointer, not HTML5
  // drag and drop (the desktop shell keeps that for the Finder's files — the
  // lesson of the Assets, MICRO-SPAZIO-CONTAINER A1). A line under the epoch
  // and a label by the pointer say which of the two will happen; Esc cancels.
  let dragEnded = 0;
  layer.addEventListener("pointerdown", (e0) => {
    if (e0.button !== 0 || !d.epochDrop) return;
    const r = rowOf(e0.target);
    if (!r || r.epochAt === undefined || !r.id || r.version || (e0.target as HTMLElement).closest("button,[data-tw]")) return;
    const x0 = e0.clientX, y0 = e0.clientY;
    let on = false;
    let target: { el: HTMLElement; epoch: string; group?: string } | null = null;
    // MICRO-TESTATE-COERENTI p.10a · the container the row is listed in (a member's key)
    const fromGroup = /\/grp\/([^/]+)\/m\/[^/]+$/.exec(r.key)?.[1] ?? null;
    const isModel = /^representation_model|^RepresentationModelNodeGroup$/.test(String(r.glyph ?? ""));
    let alt = e0.altKey;
    let tag: HTMLElement | null = null;
    let lx = x0, ly = y0;
    let auto = 0;
    const clear = () => { target?.el.classList.remove("uo-drop", "uo-drop-extend"); target = null; };
    const say = () => {
      if (!tag) return;
      const txt = target ? (target.group !== undefined ? d.containerDropLabel?.(r, target.group, fromGroup, alt) ?? null : d.dropLabel?.(r, target.epoch, alt) ?? null) : null;
      tag.textContent = txt ?? r.label;
      tag.classList.toggle("uo-dragtag-none", !txt);
      tag.classList.toggle("uo-dragtag-extend", !!txt && alt);
      tag.style.left = `${lx + 14}px`;
      tag.style.top = `${ly + 10}px`;
      if (target) { target.el.classList.add("uo-drop"); target.el.classList.toggle("uo-drop-extend", alt); }
    };
    const find = () => {
      const under = document.elementFromPoint(lx, ly)?.closest<HTMLElement>(".uo-row");
      const tr = under && layer.contains(under) ? rows[Number(under.dataset.i ?? -1)] : null;
      const ep = tr && tr.id && tr.glyph === "EpochNode" ? tr.id : null;
      // p.10a · a model onto a container: it enters it (Assets' rule, put_in_container);
      // a member onto the «Models» heading: it leaves its container
      const grp = isModel && tr && tr.id && tr.glyph === "RepresentationModelNodeGroup" && tr.id !== r.id && tr.id !== fromGroup ? tr.id
        : isModel && fromGroup && tr && ((tr.kind === "group" && tr.glyph === "representation_model") || (tr.kind === "dim" && /models/.test(tr.key))) ? "" : null;
      if (target && (!under || target.el !== under || target.epoch !== ep || (target.group ?? null) !== grp)) clear();
      if (grp !== null && under && !target && d.containerDropLabel?.(r, grp, fromGroup, alt)) target = { el: under, epoch: "", group: grp };
      else if (ep && under && !target && (alt || ep !== r.epochAt) && d.dropLabel?.(r, ep, alt)) target = { el: under, epoch: ep };
      say();
    };
    const move = (e: PointerEvent) => {
      lx = e.clientX; ly = e.clientY; alt = e.altKey;
      if (!on) {
        if (Math.hypot(lx - x0, ly - y0) < 6) return;
        on = true;
        tag = document.createElement("div");
        tag.className = "uo-dragtag";
        tag.dataset.uoDrag = "1";
        document.body.appendChild(tag);
        root.classList.add("uo-dragging");
        window.getSelection()?.removeAllRanges();
      }
      e.preventDefault();
      const b = scroll.getBoundingClientRect();
      cancelAnimationFrame(auto);
      const edge = ly < b.top + 24 ? -1 : ly > b.bottom - 24 ? 1 : 0;
      if (edge) {
        const step = () => { scroll.scrollTop += edge * 12; paint(); find(); auto = requestAnimationFrame(step); };
        auto = requestAnimationFrame(step);
      }
      find();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(false); return; }
      if (e.key === "Alt" && on) { alt = e.type === "keydown"; clear(); find(); }
    };
    const end = (drop: boolean) => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("keyup", key, true);
      cancelAnimationFrame(auto);
      root.classList.remove("uo-dragging");
      tag?.remove();
      const t2 = target;
      clear();
      if (on) dragEnded = Date.now();
      if (drop && on && t2) {
        if (t2.group !== undefined) d.containerDrop?.(r, t2.group, fromGroup, alt);
        else d.epochDrop!(r, t2.epoch, alt);
      }
    };
    const up = (e: PointerEvent) => { alt = e.altKey; end(true); };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("keyup", key, true);
  });
  layer.addEventListener("click", (e) => { if (Date.now() - dragEnded < 300) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  layer.addEventListener("dblclick", (e) => {
    const r = rowOf(e.target);
    if (!r || (e.target as HTMLElement).closest("[data-tw],[data-eye],[data-menu]")) return;
    if (r.id && d.frame) d.frame(r);
    else if (r.parent && !r.id) toggleOpen(r);
  });
  layer.addEventListener("contextmenu", (e) => {
    const r = rowOf(e.target);
    if (r?.skey && d.keyMenu) {
      e.preventDefault();
      // a right click on a row not selected selects it first (as Blender's Outliner)
      if (d.selectedKeys && !d.selectedKeys().has(r.skey)) d.pickKey?.(r, new MouseEvent("click"), []);
      d.keyMenu(r, (e.target as HTMLElement).closest<HTMLElement>(".uo-row") ?? root, { x: e.clientX, y: e.clientY });
      paint(true);
      return;
    }
    // MICRO-TESTATE-COERENTI p.12 · a node's row: the menu of the selection
    // («Sposta in epoca…», «Estendi a epoca…»)
    if (!r || !(r.kind === "source" || r.kind === "graph" || r.kind === "aux" || ((r.kind === "node" || r.kind === "sub") && r.id))) return;
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
          if (r.skey && d.pickKey) d.pickKey(r, new MouseEvent("click"), []); else d.pick(r, new MouseEvent("click"));
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
