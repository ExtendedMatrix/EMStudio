/**
 * MICRO-SPAZIO-3D p.1 · the Outliner of the Space — the T region of Blender's
 * 3D viewport: what is in the scene, as a tree.
 *
 *   Epoch
 *     ├ Representation models — each with its versions (the one drawn
 *     │                         highlighted) — and the tilesets
 *     └ Proxies — grouped by the type of their unit (US, USV/s, USV/n, SF…),
 *                 each with its unit's name
 *   Sketched — the shapes of the session not yet associated (p.4)
 *
 * Every row: the eye (visible), the arrow (selectable), the glyph of its type
 * (the 2D glyphs of the datamodel, handed in), the name. A search by name,
 * «Isolate» (only this) and «Frame». The selection is the app's one selection
 * (`select()` in main.ts): the graph, the Inspector and the main Outliner follow
 * it, and a row follows them.
 *
 * What is open, what is hidden, what cannot be selected, the panel's width and
 * whether it is shown are LOCAL preferences per person (`emstudio.space3d`),
 * never in the em.json — like the overlays.
 *
 * `buildOutlinerTree` is pure (checked in node, `check-space-outliner.mjs`); the
 * rest draws it.
 */

export interface OutlinerVersion { id: string; name: string; drawn: boolean; chosen: boolean }

export interface OutlinerRow {
  /** `rm:<id>`, `proxy:<unit>`, `sketch:<id>`, `epoch:<id>`, `group:<epoch>:<type>`… */
  key: string;
  /** the node the row selects (a model, a unit), or the sketch */
  id: string;
  kind: "epoch" | "rms" | "proxies" | "type" | "rm" | "tileset" | "proxy" | "sketches" | "sketch" | "version";
  name: string;
  /** the glyph's node type (2d_glyphs), or a text */
  glyph?: string;
  glyphText?: string;
  children?: OutlinerRow[];
  /** a version drawn now */
  drawn?: boolean;
  /** a row the scene draws (the eye and the arrow apply) */
  object?: boolean;
  /** the epoch the scene shows */
  current?: boolean;
}

export interface OutlinerInput {
  epochs: Array<{ id: string; name: string; current: boolean }>;
  /** per epoch, its models (tileset: the model's first file is a tileset) */
  rms: (epochId: string) => Array<{ id: string; name: string; glyph: string; tileset: boolean; versions: OutlinerVersion[] }>;
  /** per epoch, its proxies: unit, its name, its type */
  proxies: (epochId: string) => Array<{ unitId: string; name: string; type: string }>;
  /** the type's label (US, USV/s…) */
  typeLabel: (type: string) => string;
  sketches: Array<{ id: string; name: string; shape: string }>;
  texts: { rms: string; proxies: string; sketches: string; tilesets?: string };
}

/** The tree, pure. Types in the order the datamodel's list gives them, the
 *  names in their natural order. */
export function buildOutlinerTree(input: OutlinerInput): OutlinerRow[] {
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const out: OutlinerRow[] = [];
  for (const ep of input.epochs) {
    const rms = input.rms(ep.id);
    const px = input.proxies(ep.id);
    const children: OutlinerRow[] = [];
    if (rms.length) {
      children.push({
        key: `rms:${ep.id}`, id: ep.id, kind: "rms", name: input.texts.rms, glyph: "representation_model",
        children: rms.slice().sort((a, b) => Number(a.tileset) - Number(b.tileset) || coll.compare(a.name, b.name)).map((r) => ({
          key: `rm:${r.id}`, id: r.id, kind: r.tileset ? "tileset" : "rm", name: r.name, glyph: r.tileset ? "tileset" : r.glyph,
          object: true,
          ...(r.versions.length > 1 ? { children: r.versions.map((v) => ({
            key: `version:${r.id}:${v.id}`, id: v.id, kind: "version" as const, name: v.name, drawn: v.drawn,
            glyphText: v.drawn ? "●" : v.chosen ? "○" : "·" })) } : {}),
        })),
      });
    }
    if (px.length) {
      const byType = new Map<string, typeof px>();
      for (const p of px) (byType.get(p.type) ?? byType.set(p.type, []).get(p.type)!).push(p);
      children.push({
        key: `proxies:${ep.id}`, id: ep.id, kind: "proxies", name: input.texts.proxies, glyph: "proxy",
        children: [...byType.entries()].sort((a, b) => coll.compare(input.typeLabel(a[0]), input.typeLabel(b[0]))).map(([type, list]) => ({
          key: `type:${ep.id}:${type}`, id: type, kind: "type", name: `${input.typeLabel(type)} (${list.length})`, glyph: type,
          children: list.slice().sort((a, b) => coll.compare(a.name, b.name)).map((p) => ({
            key: `proxy:${p.unitId}`, id: p.unitId, kind: "proxy", name: p.name, glyph: type, object: true })),
        })),
      });
    }
    out.push({ key: `epoch:${ep.id}`, id: ep.id, kind: "epoch", name: ep.name, glyph: "EpochNode", current: ep.current, children });
  }
  if (input.sketches.length)
    out.push({ key: "sketches", id: "", kind: "sketches", name: input.texts.sketches, glyphText: "◇",
      children: input.sketches.map((s) => ({ key: `sketch:${s.id}`, id: s.id, kind: "sketch", name: s.name, glyphText: "◇", object: true })) });
  return out;
}

/** The object keys under a row (the row itself when it is an object). */
export function objectKeys(row: OutlinerRow): string[] {
  const out: string[] = [];
  const walk = (r: OutlinerRow) => {
    if (r.object) out.push(r.key);
    for (const c of r.children ?? []) if (c.kind !== "version") walk(c);
  };
  walk(row);
  return out;
}

/** Rows whose name matches the search (and their ancestors), the rest out. */
export function filterTree(rows: OutlinerRow[], q: string): OutlinerRow[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  // a row that matches keeps all its children; one that does not, only the
  // children that match (or lead to a match)
  const keep = (r: OutlinerRow): OutlinerRow | null => {
    if (r.name.toLowerCase().includes(s)) return r;
    const kids = (r.children ?? []).map(keep).filter((x): x is OutlinerRow => !!x);
    return kids.length ? { ...r, children: kids } : null;
  };
  return rows.map(keep).filter((x): x is OutlinerRow => !!x);
}

// ── the preferences: per person, local ───────────────────────────────────────

export const SPACE3D_KEY = "emstudio.space3d";

export interface Space3dPrefs {
  /** the outliner panel is shown */
  shown: boolean;
  width: number;
  /** rows turned from their default: the epoch in the scene and the groups
   *  open, the other epochs and a model's versions closed */
  toggled: string[];
  /** objects hidden (the eye) */
  hidden: string[];
  /** objects not selectable (the arrow) */
  locked: string[];
  /** MICRO-SPAZIO-3D-2 · the N panel («Vista») on the right, and its width */
  nShown: boolean;
  nWidth: number;
}

export const DEFAULT_PREFS: Space3dPrefs = { shown: true, width: 260, toggled: [], hidden: [], locked: [], nShown: false, nWidth: 250 };

/** Is a row open: its default, unless the person turned it. */
export function rowOpen(r: Pick<OutlinerRow, "key" | "kind" | "current">, toggled: ReadonlySet<string>): boolean {
  const byDefault = r.kind === "epoch" ? !!r.current : r.kind === "rm" || r.kind === "tileset" ? false : true;
  return byDefault !== toggled.has(r.key);
}

export function loadSpacePrefs(person: string | null | undefined): Space3dPrefs {
  try {
    const all = JSON.parse(globalThis.localStorage?.getItem(SPACE3D_KEY) ?? "{}") as Record<string, Partial<Space3dPrefs>>;
    const p = all[person || "-"] ?? {};
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return {
      shown: typeof p.shown === "boolean" ? p.shown : DEFAULT_PREFS.shown,
      width: typeof p.width === "number" && p.width >= 160 && p.width <= 640 ? p.width : DEFAULT_PREFS.width,
      toggled: list(p.toggled), hidden: list(p.hidden), locked: list(p.locked),
      nShown: typeof p.nShown === "boolean" ? p.nShown : DEFAULT_PREFS.nShown,
      nWidth: typeof p.nWidth === "number" && p.nWidth >= 180 && p.nWidth <= 520 ? p.nWidth : DEFAULT_PREFS.nWidth,
    };
  } catch {
    return { ...DEFAULT_PREFS, toggled: [], hidden: [], locked: [] };
  }
}

export function saveSpacePrefs(person: string | null | undefined, p: Space3dPrefs): void {
  try {
    const all = JSON.parse(globalThis.localStorage?.getItem(SPACE3D_KEY) ?? "{}") as Record<string, unknown>;
    all[person || "-"] = p;
    globalThis.localStorage?.setItem(SPACE3D_KEY, JSON.stringify(all));
  } catch { /* private mode: the session keeps it */ }
}

// ── drawing it ───────────────────────────────────────────────────────────────

export interface OutlinerView {
  rows: OutlinerRow[];
  prefs: Space3dPrefs;
  /** the selected keys (the app's selection, and the sketch) */
  selected: ReadonlySet<string>;
  /** the isolated object, if any */
  isolated: string | null;
  query: string;
  glyph: (kind: string) => HTMLElement;
  texts: { search: string; isolate: string; frame: string; eye: string; arrow: string; palette: string; close: string; empty: string };
  /** the palette of the shapes (p.4): id, name, family */
  palette: Array<{ id: string; name: string; family: string; familyName: string }>;
}

export interface OutlinerActions {
  pick(row: OutlinerRow): void;
  toggleOpen(key: string): void;
  toggleHidden(keys: string[], hide: boolean): void;
  toggleLocked(keys: string[], lock: boolean): void;
  isolate(): void;
  frame(): void;
  search(q: string): void;
  close(): void;
  /** a shape of the palette: clicked (at the cursor), or dragged and dropped at a page point */
  addShape(id: string, drop?: { x: number; y: number }): void;
}

/** Draw the panel into `el` (emptied first). The search keeps its focus. */
export function renderOutliner(el: HTMLElement, v: OutlinerView, act: OutlinerActions): void {
  const hadFocus = document.activeElement instanceof HTMLInputElement && el.contains(document.activeElement);
  el.textContent = "";
  el.style.width = `${v.prefs.width}px`;
  const head = document.createElement("div");
  head.className = "sol-head";
  const q = document.createElement("input");
  q.type = "search";
  q.className = "sol-search";
  q.placeholder = v.texts.search;
  q.value = v.query;
  q.addEventListener("input", () => act.search(q.value));
  const iso = document.createElement("button");
  iso.type = "button";
  iso.className = "sol-btn";
  iso.dataset.sol = "isolate";
  iso.textContent = v.texts.isolate;
  iso.setAttribute("aria-pressed", String(!!v.isolated));
  iso.addEventListener("click", () => act.isolate());
  const fr = document.createElement("button");
  fr.type = "button";
  fr.className = "sol-btn";
  fr.dataset.sol = "frame";
  fr.textContent = v.texts.frame;
  fr.addEventListener("click", () => act.frame());
  const x = document.createElement("button");
  x.type = "button";
  x.className = "sol-x";
  x.textContent = "×";
  x.title = v.texts.close;
  x.addEventListener("click", () => act.close());
  head.append(q, iso, fr, x);
  el.appendChild(head);
  const tree = document.createElement("div");
  tree.className = "sol-tree";
  tree.setAttribute("role", "tree");
  const hidden = new Set(v.prefs.hidden);
  const locked = new Set(v.prefs.locked);
  const toggled = new Set(v.prefs.toggled);
  const searching = !!v.query.trim();
  const rows = filterTree(v.rows, v.query);
  const draw = (r: OutlinerRow, depth: number) => {
    const line = document.createElement("div");
    line.className = `sol-row sol-${r.kind}${v.selected.has(r.key) ? " sel" : ""}${r.current ? " cur" : ""}${r.drawn ? " drawn" : ""}`;
    line.dataset.key = r.key;
    line.setAttribute("role", "treeitem");
    line.style.paddingLeft = `${4 + depth * 14}px`;
    const kids = r.children ?? [];
    const open = searching || rowOpen(r, toggled);
    const tw = document.createElement("button");
    tw.type = "button";
    tw.className = "sol-tw";
    tw.textContent = kids.length ? (open ? "▾" : "▸") : "";
    tw.tabIndex = -1;
    if (kids.length) tw.addEventListener("click", (e) => { e.stopPropagation(); act.toggleOpen(r.key); });
    const g = document.createElement("span");
    g.className = "sol-glyph";
    if (r.glyph) { try { g.appendChild(v.glyph(r.glyph)); } catch { g.textContent = r.glyphText ?? ""; } }
    else g.textContent = r.glyphText ?? "";
    const name = document.createElement("span");
    name.className = "sol-name";
    name.textContent = r.name;
    name.title = r.name;
    line.append(tw, g, name);
    if (r.kind !== "version") {
      const keys = objectKeys(r);
      if (keys.length) {
        const allHidden = keys.every((k) => hidden.has(k));
        const allLocked = keys.every((k) => locked.has(k));
        const eye = document.createElement("button");
        eye.type = "button";
        eye.className = `sol-eye${allHidden ? " off" : ""}`;
        eye.dataset.sol = "eye";
        eye.title = v.texts.eye;
        eye.textContent = allHidden ? "◌" : "👁";
        eye.addEventListener("click", (e) => { e.stopPropagation(); act.toggleHidden(keys, !allHidden); });
        const arrow = document.createElement("button");
        arrow.type = "button";
        arrow.className = `sol-arrow${allLocked ? " off" : ""}`;
        arrow.dataset.sol = "arrow";
        arrow.title = v.texts.arrow;
        arrow.textContent = "↖";
        arrow.addEventListener("click", (e) => { e.stopPropagation(); act.toggleLocked(keys, !allLocked); });
        line.append(arrow, eye);
      }
    }
    line.addEventListener("click", () => act.pick(r));
    tree.appendChild(line);
    if (open) for (const c of kids) draw(c, depth + 1);
  };
  for (const r of rows) draw(r, 0);
  if (!rows.length) {
    const p = document.createElement("div");
    p.className = "sol-empty";
    p.textContent = v.texts.empty;
    tree.appendChild(p);
  }
  el.appendChild(tree);
  // the palette of the base shapes (p.4): a click makes one at the 3D cursor,
  // a drag lays it on the surface under the pointer
  const pal = document.createElement("details");
  pal.className = "sol-palette";
  pal.open = !toggled.has("palette");
  pal.addEventListener("toggle", () => { if (pal.open === toggled.has("palette")) act.toggleOpen("palette"); });
  const sum = document.createElement("summary");
  sum.textContent = v.texts.palette;
  pal.appendChild(sum);
  let fam = "";
  const grid = document.createElement("div");
  grid.className = "sol-shapes";
  for (const s of v.palette) {
    if (s.family !== fam) {
      fam = s.family;
      const h = document.createElement("div");
      h.className = "sol-fam";
      h.textContent = s.familyName;
      grid.appendChild(h);
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sol-shape";
    b.dataset.shape = s.id;
    b.textContent = s.name;
    let drag: { x: number; y: number; moved: boolean } | null = null;
    b.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: false };
      b.setPointerCapture(e.pointerId);
    });
    b.addEventListener("pointermove", (e) => {
      if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { drag.moved = true; b.classList.add("dragging"); }
    });
    b.addEventListener("pointerup", (e) => {
      const d = drag;
      drag = null;
      b.classList.remove("dragging");
      if (!d) return;
      act.addShape(s.id, d.moved ? { x: e.clientX, y: e.clientY } : undefined);
    });
    grid.appendChild(b);
  }
  pal.appendChild(grid);
  el.appendChild(pal);
  if (hadFocus) {
    const nq = el.querySelector<HTMLInputElement>(".sol-search");
    nq?.focus();
    nq?.setSelectionRange(nq.value.length, nq.value.length);
  }
}
