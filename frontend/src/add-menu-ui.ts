/**
 * SHIFT-A · the «Aggiungi» menu, as DOM. ONE component, four ways in (Shift+A,
 * right-click on empty canvas, the «+» in a graph window's header, the long
 * press on a tablet) plus the anchor drag, which opens it with the edge already
 * decided. It is the evolution of the anchor drag's `showCreateNodeMenu`.
 *
 * What it offers is decided elsewhere (`add-menu.ts`, from the datamodel) and
 * handed in as a model; what a pick does is the caller's `onPick`. This file
 * only draws, navigates (↑↓ → ← Enter Esc) and closes.
 */

export interface AddMenuEntry {
  /** stable key (recents, tests) */
  key: string;
  label: string;
  /** dim text on the right: the category in a flat search, the edge otherwise */
  detail?: string;
  /** the datamodel node_type, for the hover card */
  nodeType?: string;
  /** the datamodel description, for the hover card and the search */
  description?: string;
  /** another name it is found by (the datamodel's English label) */
  alias?: string;
  /** a 24×13 icon, or null for a blank slot */
  icon?: () => Element | null;
  /** refused, with the reason shown in place */
  disabledReason?: string;
  run: () => void;
}

export interface AddMenuCategory {
  label: string;
  /** a category that exists but is not for here stays visible, spent */
  offNote?: string;
  /** shown instead of the caret (Matrix paradata: «↑» when there is a selection) */
  hint?: string;
  entries: AddMenuEntry[];
}

export interface AddMenuModel {
  title: string;
  context: string;
  placeholder: string;
  linkedHeader?: string;
  linked: AddMenuEntry[];
  /** a second line of links folded into one submenu row (the ornaments) */
  linkedMore?: AddMenuCategory;
  recent: AddMenuEntry[];
  recentHeader?: string;
  categories: AddMenuCategory[];
  /** COLLEGARE · a header over the categories when they are the «Nuovo» half */
  newHeader?: string;
  /** COLLEGARE · «Collega a un nodo esistente»: inline groups, the first
   *  `perGroup` of each shown, the rest reached by the search (which runs over
   *  `searchable`, where the caller puts every existing entry too) */
  existing?: {
    header: string;
    groups: { label: string; entries: AddMenuEntry[] }[];
    perGroup: number;
    /** «+n altri: scrivi per cercare» */
    more: (n: number) => string;
    /** shown when there is nothing to link */
    none: string;
  };
  /** actions after the categories (Matrix «Nuova epoca…», «Riordina tutto») */
  extra: AddMenuEntry[];
  /** the flat list the search runs over — built by the caller, one per entry */
  searchable: AddMenuEntry[];
  matches: (e: AddMenuEntry, q: string) => boolean;
  footNote?: string;
  count: string;
  noResults: string;
  keysHint: string;
}

let openMenu: { el: HTMLElement; close: () => void } | null = null;

export function addMenuIsOpen(): boolean {
  return !!openMenu;
}

export function closeAddMenu(): void {
  openMenu?.close();
}

/**
 * The hover card of a type (POL3): the human label in bold, the technical
 * node_type dimmed, the datamodel description below. It reuses the app's own
 * `#tooltip` and its `.tt-type` / `.tt-desc` classes — the card the canvas shows
 * on node hover — so the two cannot drift.
 */
export function attachHoverCard(
  el: HTMLElement,
  label: string,
  nodeType: string,
  description: string,
): void {
  const tip = document.getElementById("tooltip");
  if (!tip) return;
  const place = (x: number, y: number): void => {
    tip.style.left = Math.min(x + 14, window.innerWidth - 380) + "px";
    tip.style.top = y + 14 + "px";
  };
  const show = (x: number, y: number): void => {
    tip.innerHTML = `<b></b> <span class="tt-type"></span><br><span class="tt-desc"></span>`;
    (tip.children[0] as HTMLElement).textContent = label;
    // only when it says something the label doesn't
    (tip.children[1] as HTMLElement).textContent = label === nodeType ? "" : nodeType;
    (tip.children[3] as HTMLElement).textContent = description;
    place(x, y);
    tip.classList.remove("hidden");
  };
  el.addEventListener("mouseenter", (e) => show(e.clientX, e.clientY));
  el.addEventListener("mousemove", (e) => place(e.clientX, e.clientY));
  el.addEventListener("mouseleave", () => tip.classList.add("hidden"));
  // the keyboard highlight follows the same card, next to the row
  el.addEventListener("em-hi", () => {
    const r = el.getBoundingClientRect();
    show(r.right + 6, r.top - 14);
  });
}

function hideTip(): void {
  document.getElementById("tooltip")?.classList.add("hidden");
}

/** Open the menu at a client point. Returns nothing: `closeAddMenu` closes it. */
export function showAddMenu(model: AddMenuModel, clientX: number, clientY: number): void {
  closeAddMenu();
  const menu = document.createElement("div");
  menu.className = "addm";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", model.title);

  const head = document.createElement("div");
  head.className = "addm-head";
  const b = document.createElement("b");
  b.textContent = model.title;
  const ctx = document.createElement("span");
  ctx.className = "addm-ctx";
  ctx.textContent = model.context;
  head.append(b, ctx);
  menu.appendChild(head);

  const input = document.createElement("input");
  input.className = "addm-q";
  input.type = "search";
  input.placeholder = model.placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  menu.appendChild(input);

  const body = document.createElement("div");
  body.className = "addm-body";
  menu.appendChild(body);

  const foot = document.createElement("div");
  foot.className = "addm-foot";
  const count = document.createElement("span");
  count.textContent = model.count;
  const keys = document.createElement("span");
  keys.className = "addm-keys";
  keys.textContent = model.keysHint;
  foot.append(count, keys);
  menu.appendChild(foot);

  // ── navigation state: the rows ↑↓ walks, and an open submenu ──────────────
  let rows: { el: HTMLElement; run?: () => void; sub?: () => void }[] = [];
  let hi = 0;
  let subOpen: { row: HTMLElement; rows: { el: HTMLElement; run?: () => void }[]; hi: number } | null = null;

  // `card`: show the hover card beside the highlighted row — only for a
  // keyboard move, when the menu is on screen (the first paint runs before the
  // menu is attached, and a card placed from a detached row lands at 0,0)
  const paintHi = (card = false): void => {
    const list = subOpen ? subOpen.rows : rows;
    const idx = subOpen ? subOpen.hi : hi;
    for (const r of rows) r.el.classList.remove("hi");
    for (const r of subOpen?.rows ?? []) r.el.classList.remove("hi");
    const cur = list[idx];
    if (cur) {
      cur.el.classList.add("hi");
      cur.el.scrollIntoView({ block: "nearest" });
      if (card) cur.el.dispatchEvent(new Event("em-hi"));
      else hideTip();
    } else hideTip();
  };

  const entryButton = (e: AddMenuEntry): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "addm-item";
    btn.dataset.key = e.key;
    const ic = document.createElement("span");
    ic.className = "addm-ic";
    const icon = e.icon?.();
    if (icon) ic.appendChild(icon);
    const l = document.createElement("span");
    l.className = "addm-l";
    l.textContent = e.label;
    btn.append(ic, l);
    if (e.detail || e.disabledReason) {
      const d = document.createElement("span");
      d.className = "addm-d";
      d.textContent = e.disabledReason ?? e.detail ?? "";
      btn.appendChild(d);
    }
    if (e.nodeType) attachHoverCard(btn, e.label, e.nodeType, e.description ?? "");
    if (e.disabledReason) {
      btn.classList.add("off");
      btn.setAttribute("aria-disabled", "true");
    }
    btn.addEventListener("click", () => {
      if (e.disabledReason) return;
      close();
      e.run();
    });
    return btn;
  };

  const group = (label: string): void => {
    const g = document.createElement("div");
    g.className = "addm-grp";
    g.textContent = label;
    body.appendChild(g);
  };
  const sep = (): void => {
    const s = document.createElement("div");
    s.className = "addm-sep";
    body.appendChild(s);
  };
  const note = (text: string): void => {
    const p = document.createElement("p");
    p.className = "addm-note";
    p.textContent = text;
    body.appendChild(p);
  };

  const closeSub = (): void => {
    if (!subOpen) return;
    subOpen.row.classList.remove("open");
    subOpen = null;
  };

  const categoryRow = (c: AddMenuCategory): void => {
    const row = document.createElement("div");
    row.className = "addm-cat";
    row.dataset.cat = c.label;
    const l = document.createElement("span");
    l.className = "addm-l";
    l.textContent = c.label;
    row.appendChild(l);
    const spent = !!c.offNote || !c.entries.length;
    const d = document.createElement("span");
    d.className = spent ? "addm-d" : "addm-car";
    d.textContent = c.offNote ?? (c.entries.length ? "▸" : (c.hint ?? ""));
    row.appendChild(d);
    if (spent) {
      row.classList.add("off");
      body.appendChild(row);
      return;
    }
    const sub = document.createElement("div");
    sub.className = "addm-sub";
    const subRows = c.entries.map((e) => {
      const btn = entryButton(e);
      sub.appendChild(btn);
      return { el: btn as HTMLElement, run: e.disabledReason ? undefined : () => { close(); e.run(); } };
    });
    row.appendChild(sub);
    const open = (): void => {
      if (subOpen?.row === row) return;
      closeSub();
      for (const r of body.querySelectorAll(".addm-cat.open")) r.classList.remove("open");
      row.classList.add("open");
      // `position: fixed`, placed here: the body scrolls, and an absolute child
      // of a scroller is clipped by it. Beside the menu, flipped to the left
      // when the right has no room, and kept above the bottom edge.
      const m = menu.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      const left = m.right + 214 > window.innerWidth ? m.left - 214 : m.right + 4;
      sub.style.left = Math.max(4, left) + "px";
      sub.style.top = Math.max(4, Math.min(rr.top - 6, window.innerHeight - 8 - Math.min(360, c.entries.length * 27 + 12))) + "px";
      subOpen = { row, rows: subRows, hi: -1 };
    };
    row.addEventListener("mouseenter", open);
    const idx = rows.length;
    rows.push({ el: row, sub: () => { open(); subOpen!.hi = 0; paintHi(true); } });
    row.addEventListener("mousemove", () => {
      if (!subOpen || subOpen.row !== row || subOpen.hi < 0) { hi = idx; }
    });
    body.appendChild(row);
  };

  const push = (e: AddMenuEntry): void => {
    const btn = entryButton(e);
    body.appendChild(btn);
    if (!e.disabledReason) rows.push({ el: btn, run: () => { close(); e.run(); } });
  };

  const render = (): void => {
    body.textContent = "";
    rows = [];
    closeSub();
    hi = 0;
    const q = input.value.trim();
    if (q) {
      const hits = model.searchable.filter((e) => model.matches(e, q));
      if (!hits.length) {
        const p = document.createElement("p");
        p.className = "addm-note";
        p.textContent = model.noResults;
        body.appendChild(p);
      }
      for (const e of hits) push(e);
    } else {
      if (model.linked.length || model.linkedMore) {
        if (model.linkedHeader) group(model.linkedHeader);
        for (const e of model.linked) push(e);
        if (model.linkedMore) categoryRow(model.linkedMore);
        sep();
      }
      if (model.recent.length) {
        if (model.recentHeader) group(model.recentHeader);
        for (const e of model.recent) push(e);
        sep();
      }
      if (model.newHeader && model.categories.length) group(model.newHeader);
      for (const c of model.categories) categoryRow(c);
      if (model.existing) {
        const ex = model.existing;
        if (model.categories.length || model.linked.length) sep();
        group(ex.header);
        const live = ex.groups.filter((g) => g.entries.length);
        if (!live.length) note(ex.none);
        for (const g of live) {
          const h = document.createElement("div");
          h.className = "addm-lmg";
          h.textContent = `${g.label} · ${g.entries.length}`;
          body.appendChild(h);
          for (const e of g.entries.slice(0, ex.perGroup)) push(e);
          if (g.entries.length > ex.perGroup) note(ex.more(g.entries.length - ex.perGroup));
        }
      }
      if (model.extra.length) {
        sep();
        for (const e of model.extra) push(e);
      }
      if (model.footNote) {
        const p = document.createElement("p");
        p.className = "addm-note";
        p.textContent = model.footNote;
        body.appendChild(p);
      }
    }
    paintHi();
  };

  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    const list = subOpen ? subOpen.rows : rows;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      if (subOpen) subOpen.hi = Math.max(0, Math.min(list.length - 1, subOpen.hi + step));
      else hi = Math.max(0, Math.min(list.length - 1, hi + step));
      paintHi(true);
    } else if (e.key === "ArrowRight") {
      const cur = !subOpen ? rows[hi] : null;
      if (cur?.sub) {
        e.preventDefault();
        cur.sub();
      }
    } else if (e.key === "ArrowLeft") {
      if (subOpen) {
        e.preventDefault();
        closeSub();
        paintHi();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cur: { run?: () => void; sub?: () => void } | undefined =
        subOpen ? subOpen.rows[subOpen.hi] : rows[hi];
      if (cur?.run) cur.run();
      else cur?.sub?.();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (subOpen) {
        closeSub();
        paintHi();
      } else close();
    }
  });

  const onOutside = (e: PointerEvent): void => {
    if (!menu.contains(e.target as Node)) close();
  };
  // Esc when the focus has left the box (a click on a row's padding, say)
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && document.activeElement !== input) {
      e.stopPropagation();
      close();
    }
  };
  function close(): void {
    if (openMenu?.el !== menu) return;
    openMenu = null;
    hideTip();
    menu.remove();
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }

  render();
  document.body.appendChild(menu);
  // on screen, whatever the point
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(clientX, window.innerWidth - r.width - 8)) + "px";
  menu.style.top = Math.max(8, Math.min(clientY, window.innerHeight - r.height - 8)) + "px";
  openMenu = { el: menu, close };
  document.addEventListener("pointerdown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  input.focus();
}
