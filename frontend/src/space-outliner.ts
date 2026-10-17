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

export interface OutlinerVersion { id: string; name: string; drawn: boolean; chosen: boolean;
  /** MICRO-SPAZIO-3D-3 p.10 · its uses (web, realtime…) and its level, computed from the chain */
  uses?: string[]; level?: string;
  /** the version is chosen by the distance (the «A» of the row) */
  auto?: boolean }

export interface OutlinerRow {
  /** `rm:<id>`, `proxy:<unit>`, `sketch:<id>`, `epoch:<id>`, `group:<epoch>:<type>`… */
  key: string;
  /** the node the row selects (a model, a unit), or the sketch */
  id: string;
  kind: "epoch" | "rms" | "proxies" | "type" | "rm" | "tileset" | "proxy" | "sketches" | "sketch" | "version"
    /** MICRO-SPAZIO-3D-3 p.7 · an RM container (EM Tools'), with its models */
    | "rmgroup";
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
  /** the row's tooltip (a technical name), when it is not the name */
  title?: string;
  /** p.11 · a small chip after the name (a model's level drawn: «LOD1») */
  chip?: string;
  /** a version's uses and level (p.10), shown small */
  uses?: string[];
  level?: string;
  auto?: boolean;
}

export interface OutlinerInput {
  epochs: Array<{ id: string; name: string; current: boolean }>;
  /** per epoch, its models (tileset: the model's first file is a tileset) */
  rms: (epochId: string) => Array<{ id: string; name: string; glyph: string; tileset: boolean; versions: OutlinerVersion[];
    /** p.7 · the container it is in: its id, its name, its document's name */
    group?: { id: string; name: string; doc?: string } | null;
    /** p.11 · the technical name, when the name shown is shortened (a tooltip) */
    technical?: string;
    /** …and the level of the version drawn, a chip */
    chip?: string }>;
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
      const rmRow = (r: (typeof rms)[number]): OutlinerRow => ({
        key: `rm:${r.id}`, id: r.id, kind: r.tileset ? "tileset" : "rm", name: r.name, glyph: r.tileset ? "tileset" : r.glyph,
        object: true, ...(r.technical ? { title: r.technical } : {}), ...(r.chip ? { chip: r.chip } : {}),
        ...(r.versions.length > 1 ? { children: r.versions.map((v) => ({
          key: `version:${r.id}:${v.id}`, id: v.id, kind: "version" as const, name: v.name, drawn: v.drawn,
          glyphText: v.drawn ? "●" : v.chosen ? "○" : "·", ...(v.uses ? { uses: v.uses } : {}), ...(v.level ? { level: v.level } : {}),
          ...(v.auto ? { auto: true } : {}) })) } : {}),
      });
      const sorted = rms.slice().sort((a, b) => Number(a.tileset) - Number(b.tileset) || coll.compare(a.name, b.name));
      // MICRO-SPAZIO-3D-3 p.7 · Epoch › Representation models › CONTAINER › RM;
      // a model without a container stays where it was
      const groups = new Map<string, { name: string; doc?: string; rows: OutlinerRow[] }>();
      const loose: OutlinerRow[] = [];
      for (const r of sorted) {
        if (r.group) (groups.get(r.group.id) ?? groups.set(r.group.id, { name: r.group.name, doc: r.group.doc, rows: [] }).get(r.group.id)!).rows.push(rmRow(r));
        else loose.push(rmRow(r));
      }
      const groupRows: OutlinerRow[] = [...groups.entries()].sort((a, b) => coll.compare(a[1].name, b[1].name)).map(([gid, g]) => ({
        key: `rmgroup:${ep.id}:${gid}`, id: gid, kind: "rmgroup" as const, name: g.doc ? `${g.name} · ${g.doc}` : g.name,
        glyph: "RepresentationModelNodeGroup", children: g.rows }));
      children.push({
        key: `rms:${ep.id}`, id: ep.id, kind: "rms", name: input.texts.rms, glyph: "representation_model",
        children: [...groupRows, ...loose],
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
    // the name shown and the technical one (p.11: a name without its suffix)
    if (r.name.toLowerCase().includes(s) || (r.title ?? "").toLowerCase().includes(s)) return r;
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
  /** MICRO-SPAZIO-3D-3 p.5 · «Allinea alla normale»: G with Ctrl turns the object's up onto the face */
  snapAlign?: boolean;
  /** p.9 · the floating panels reduced to their title line: `summary`, `strip:<item>`, `np:<section>` */
  collapsed?: string[];
  /** p.10 · how each model chooses its version: manual (the one picked), the
   *  device's use, or the distance; absent = by use */
  versionModes?: Record<string, { mode: "manual" | "use" | "auto"; versionId?: string }>;
  /** p.10 · the use «Per uso» asks (web in a browser, realtime in the desktop, unless changed) */
  deviceUse?: string;
  /** p.12 · a container with its tileset's alternative: models, the tileset, or the distance (absent = auto) */
  altModes?: Record<string, "models" | "tileset" | "auto">;
}

export const DEFAULT_PREFS: Space3dPrefs = { shown: true, width: 260, toggled: [], hidden: [], locked: [], nShown: false, nWidth: 250, snapAlign: false, collapsed: [], versionModes: {} };

/** MICRO-PANNELLI-LATERALI · the two side panels' sizes: the narrowest a panel
 *  is drawn, the widest, and the width under which a drag of its edge closes it
 *  (Blender: a region squeezed past its size hides, its triangle left) */
export const SIDE_PANELS = {
  outliner: { min: 160, max: 640 },
  npanel: { min: 180, max: 520 },
  closeUnder: 80,
} as const;
/** What a drag of a panel's edge to `raw` px makes of it: closed under
 *  `closeUnder` (its width the one it had, to open again with), else held
 *  between its least and its most. */
export function squeezeSide(raw: number, side: "outliner" | "npanel", before: number): { open: boolean; width: number } {
  const s = SIDE_PANELS[side];
  if (raw < SIDE_PANELS.closeUnder) return { open: false, width: before };
  return { open: true, width: Math.round(Math.max(s.min, Math.min(s.max, raw))) };
}

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
      snapAlign: p.snapAlign === true,
      collapsed: list(p.collapsed),
      versionModes: p.versionModes && typeof p.versionModes === "object" ? Object.fromEntries(Object.entries(p.versionModes as Record<string, unknown>)
        .filter(([, v]) => v && typeof v === "object" && ["manual", "use", "auto"].includes(String((v as { mode?: unknown }).mode)))
        .map(([k, v]) => [k, { mode: (v as { mode: "manual" | "use" | "auto" }).mode, ...(typeof (v as { versionId?: unknown }).versionId === "string" ? { versionId: (v as { versionId: string }).versionId } : {}) }])) : {},
      ...(typeof p.deviceUse === "string" ? { deviceUse: p.deviceUse } : {}),
      ...(p.altModes && typeof p.altModes === "object" ? { altModes: Object.fromEntries(Object.entries(p.altModes as Record<string, unknown>)
        .filter(([, v]) => v === "models" || v === "tileset" || v === "auto")) as Record<string, "models" | "tileset" | "auto"> } : {}),
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
  /** the selected keys (the app's selection, and the sketches) */
  selected: ReadonlySet<string>;
  /** MICRO-SPAZIO-3D-3 · the active key: its row full, the other selected tenuous */
  active?: string | null;
  /** p.12 · the objects whose alternative is drawn instead: key → by what («sostituito da») */
  substituted?: ReadonlyMap<string, string>;
  /** the isolated object, if any */
  isolated: string | null;
  query: string;
  glyph: (kind: string) => HTMLElement;
  texts: { search: string; isolate: string; frame: string; eye: string; arrow: string; palette: string; close: string; empty: string; substitutedBy?: string };
  /** the palette of the shapes (p.4): id, name, family */
  palette: Array<{ id: string; name: string; family: string; familyName: string }>;
}

/** MICRO-SPAZIO-3D-3 · the keys of a click on a row, as Blender's Outliner */
export interface RowClick { toggle: boolean; range: boolean }

export interface OutlinerActions {
  /** a row clicked: ⌘/Ctrl toggles, Shift the range; `order` is the object
   *  rows as drawn, top to bottom */
  pick(row: OutlinerRow, mods: RowClick, order: string[]): void;
  toggleOpen(key: string): void;
  toggleHidden(keys: string[], hide: boolean): void;
  toggleLocked(keys: string[], lock: boolean): void;
  isolate(): void;
  frame(): void;
  search(q: string): void;
  close(): void;
  /** MICRO-SPAZIO-3D-3 · a click on the tree's empty part: nothing selected */
  clearSelection?(): void;
  /** p.10 · the dot of a version's row: that version, drawn in place of the current */
  chooseVersion?(rmId: string, versionId: string): void;
  /** p.12 · (the space-outliner draws «sostituito da» from the view's `substituted`) */
  /** p.7 · a right click on a row (a model, a container) */
  rowMenu?(row: OutlinerRow, x: number, y: number): void;
  /** p.6 · a press on a sketch's row: the caller follows the pointer (a drag onto a unit) */
  dragSketch?(sketchId: string, e: PointerEvent): void;
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
  const order: string[] = [];
  /**
   * MICRO-SPAZIO-3D-3 p.2 · the eyes dragged, as Blender's: a press on an eye
   * (or an arrow) and a drag down or up the rows gives every row crossed the
   * SAME state as the first — on or off — a group with its children. The
   * rows change under the pointer; the preferences are written once, at the
   * release (one change of the person's view: the visibility is a local
   * preference, not the data's, and ⌘Z does not reach it).
   */
  const dragSwitch = (e: PointerEvent, first: HTMLElement, col: "eye" | "arrow", wasOn: boolean) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const turnOn = !wasOn;
    const touched = new Set<string>();
    const crossed = new Set<HTMLElement>();
    const mark = (btn: HTMLElement) => {
      if (crossed.has(btn)) return;
      crossed.add(btn);
      for (const k of JSON.parse(btn.dataset.keys ?? "[]") as string[]) touched.add(k);
      btn.classList.toggle("off", !turnOn);
      if (col === "eye") btn.textContent = turnOn ? "👁" : "◌";
      btn.classList.add("swept");
    };
    mark(first);
    const move = (ev: PointerEvent) => {
      // near the tree's edge it scrolls, as a list does under a drag
      const tr = tree.getBoundingClientRect();
      if (ev.clientY > tr.bottom - 10) tree.scrollTop += 14;
      else if (ev.clientY < tr.top + 10) tree.scrollTop -= 14;
      const under = document.elementFromPoint(first.getBoundingClientRect().left + 4, Math.max(tr.top + 1, Math.min(tr.bottom - 1, ev.clientY)));
      const line = under?.closest<HTMLElement>(".sol-row");
      const btn = line?.querySelector<HTMLElement>(`[data-sol="${col}"]`);
      if (btn && tree.contains(btn)) mark(btn);
    };
    const up = () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      const keys = [...touched];
      // the eye: on = shown; the arrow: on = selectable
      if (col === "eye") act.toggleHidden(keys, !turnOn); else act.toggleLocked(keys, !turnOn);
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
  };
  const draw = (r: OutlinerRow, depth: number) => {
    const line = document.createElement("div");
    const isSel = v.selected.has(r.key);
    line.className = `sol-row sol-${r.kind}${isSel ? " sel" : ""}${isSel && v.active === r.key ? " active" : ""}${r.current ? " cur" : ""}${r.drawn ? " drawn" : ""}`;
    if (r.object) order.push(r.key);
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
    if (r.kind === "version" && act.chooseVersion) {
      g.classList.add("sol-dot");
      const rest = r.key.slice("version:".length);
      const cut = rest.lastIndexOf(`:${r.id}`);
      const rmId = cut >= 0 ? rest.slice(0, cut) : rest;
      g.addEventListener("click", (e) => { e.stopPropagation(); act.chooseVersion!(rmId, r.id); });
    }
    if (r.glyph) { try { g.appendChild(v.glyph(r.glyph)); } catch { g.textContent = r.glyphText ?? ""; } }
    else g.textContent = r.glyphText ?? "";
    const name = document.createElement("span");
    name.className = "sol-name";
    name.textContent = r.name;
    name.title = r.title ?? r.name;
    line.append(tw, g, name);
    if (r.chip) { const c = document.createElement("span"); c.className = "sol-chip"; c.textContent = r.chip; line.appendChild(c); }
    if (r.uses?.length || r.level) {
      // p.10 · a version's level (from the chain) and its uses, small
      const u = document.createElement("span");
      u.className = "sol-uses";
      u.textContent = [r.level, ...(r.uses ?? [])].filter(Boolean).join(" · ");
      line.appendChild(u);
    }
    if (r.auto) { const a = document.createElement("span"); a.className = "sol-auto"; a.textContent = "A"; a.title = "auto"; line.appendChild(a); }
    if (r.kind !== "version") {
      const keys = objectKeys(r);
      if (keys.length) {
        const allHidden = keys.every((k) => hidden.has(k));
        const allLocked = keys.every((k) => locked.has(k));
        const eye = document.createElement("button");
        eye.type = "button";
        const sub = r.object ? v.substituted?.get(r.key) : undefined;
        eye.className = `sol-eye${allHidden || sub ? " off" : ""}${sub ? " subst" : ""}`;
        eye.dataset.sol = "eye";
        eye.title = sub ? `${v.texts.substitutedBy ?? "replaced by"} ${sub}` : v.texts.eye;
        eye.textContent = allHidden || sub ? "◌" : "👁";
        if (sub) line.classList.add("subst");
        eye.dataset.keys = JSON.stringify(keys);
        eye.dataset.on = String(!allHidden);
        eye.addEventListener("pointerdown", (e) => dragSwitch(e, eye, "eye", !allHidden));
        eye.addEventListener("click", (e) => e.stopPropagation());
        const arrow = document.createElement("button");
        arrow.type = "button";
        arrow.className = `sol-arrow${allLocked ? " off" : ""}`;
        arrow.dataset.sol = "arrow";
        arrow.title = v.texts.arrow;
        arrow.textContent = "↖";
        arrow.dataset.keys = JSON.stringify(keys);
        arrow.dataset.on = String(!allLocked);
        arrow.addEventListener("pointerdown", (e) => dragSwitch(e, arrow, "arrow", !allLocked));
        arrow.addEventListener("click", (e) => e.stopPropagation());
        line.append(arrow, eye);
      }
    }
    line.addEventListener("click", (e) => act.pick(r, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey }, order));
    if (act.rowMenu && (r.kind === "rm" || r.kind === "rmgroup"))
      line.addEventListener("contextmenu", (e) => { e.preventDefault(); act.rowMenu!(r, e.clientX, e.clientY); });
    if (r.kind === "sketch" && act.dragSketch) {
      line.draggable = false;
      line.addEventListener("pointerdown", (e) => { if (!(e.target as HTMLElement).closest("[data-sol]")) act.dragSketch!(r.id, e); });
    }
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
  tree.addEventListener("click", (e) => { if (e.target === tree) act.clearSelection?.(); });
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
