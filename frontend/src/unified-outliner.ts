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
import { floating } from "./floating";
import {
  DEFAULT_OPTS, DIMS, OUTLINER_VIEWS, flattenOutliner, isTemporalHierarchy, opensForNode, paradataShown,
  type Dim, type DocGroup, type Hierarchy, type OutlinerView, type OutlinerOpts, type OutlinerSourceIn, type Texts, type URow,
} from "./outliner-tree";

export const ROW_H = 22;
const OVERSCAN = 8;
/** the rows that carry a node's selection */
const SELECTS = (r: URow): boolean => r.kind === "node" || r.kind === "sub" || r.kind === "group" || r.kind === "gis";

export interface UnifiedDeps {
  sources: () => OutlinerSourceIn[];
  texts: () => Texts;
  opts: () => OutlinerOpts;
  toggled: () => Set<string>;
  setToggled: (s: Set<string>) => void;
  selectedId: () => string | null;
  /** MICRO-SEG10 p.2 · the epoch in front (the Space's): of the rows of one unit,
   *  the one under it is lit when the selection comes from elsewhere */
  contextEpoch?: () => string | null;
  /** MICRO-SEG10 p.3 · the tip of a row of the unit selected, listed elsewhere */
  sameWord?: () => string;
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
  /** MICRO-COR05 E12 · the words for a row carried onto a story's chapter
   *  (null: it cannot go there — a node of another source) */
  chapterDropLabel?: (r: URow, chapter: string) => string | null;
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
  /** MICRO-RITOCCHI-CHIARI p.5 · an epoch's colour (the Matrix's lane, its band), for its branch */
  epochColor?: (epochId: string) => string | null;
  /** MICRO-SEG21 · the words of the fixed columns: the heading's (Blender's
   *  Outliner: isolate, arrow, eye) and each icon's, on and off */
  columnWords?: ColumnWords;
  /** MICRO-SEG21 · H hides the selection, Shift+H the rest, Alt+H shows all —
   *  Blender's keys, from the Outliner too (the Space's own `spaceHide`) */
  hideKey?: (mode: "selected" | "unselected" | "reveal") => void;
  /** p.9 · «Completa il container…» on a container's row */
  card?: (row: URow) => void;
  /** p.4 · the Space's controls on a row that has something in the scene */
  space?: SpaceRowDeps;
  /** MICRO-PL00 · a node with a georeference of its own: the words of its mark */
  geoMark?: (id: string) => string | null;
  /** MICRO-PL02 · a property's «controlled vocabulary» mark (◆ ◆? ◇) and its
   *  words; null: none (the page's cache: `vocab-marks.ts`) */
  vocabMark?: (row: URow) => { state: string; glyph: string; tip: string } | null;
  /** MICRO-PL07 p.0 · a GIS layer's tools (opacity, a DEM's surface and contours) */
  gisMenu?: (row: URow, anchor: HTMLElement) => void;
  /** MICRO-SEG17 · the Sheets' filter, said at the head of the list: its words
   *  («Stratigraphic units — 116», or that everything is shown), the switch's
   *  word and tooltip, its state; null: no filter here (another workspace) */
  strata?: () => { label: string; button: string; title: string; on: boolean } | null;
  /** …the switch pressed («Show all» / back to the units alone) */
  toggleStrata?: () => void;
  /** MICRO-SEG28 · a file carried from Files (HTML5 drag, the Storage's MIME) onto
   *  a document of the documents' index: whether the drag is one (`accepts`), the
   *  words by the pointer, and the drop (stamp it, link it — the page confirms) */
  fileDrop?: {
    accepts: (types: readonly string[]) => boolean;
    label: (row: URow) => string;
    drop: (row: URow, dt: DataTransfer) => void;
  };
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
  /** MICRO-PL07 p.0 · the state of a model's (or a proxy's) FILE when it is not
   *  resident — «nessun file», «manca il file», «solo referenziato» — said by a
   *  sign on its row (the Space's summary said it over the scene); null: resident */
  fileState?: (row: URow) => { state: string; title: string } | null;
  isolated: () => string | null;
  isolate: (row: URow) => void;
  frame: (row: URow) => void;
  chooseVersion: (row: URow) => void;
  /** an extractor whose document is not lit, its eye forced on */
  forced: (key: string) => boolean;
  /** MICRO-RITOCCHI-CHIARI p.4 · the padlock: the object's position locked (no
   *  move, rotation, scale in the Space) — a local preference per person */
  pinned?: (key: string) => boolean;
  togglePin?: (key: string) => void;
  pinWords?: { on: string; off: string };
  words: { arrow: string; isolate: string; frame: string; ghost: string };
  /** MICRO-TESTATE-COERENTI p.2 · the category of a row's key when it is OFF in
   *  «Visibilità ▾» (its name, for the mark), null when on; and a click on the mark */
  categoryOff?: (key: string) => { key: string; label: string; title: string } | null;
  categoryOn?: (cat: string) => void;
  /** MICRO-SEG14 p.2 · what the retired scene panel still said alone: the
   *  object whose alternative is drawn in its place («replaced by …», the
   *  words whole), and a record's state against its .blend (the last «Check
   *  against the graph») */
  substitutedBy?: (key: string) => string | null;
  blendState?: (id: string) => { sign: string; state: string; title: string } | null;
}

/** MICRO-SEG21 · the tooltips of the fixed columns */
export interface ColumnWords {
  arrow: string; eye: string; isolate: string;
  eyeOn: string; eyeOff: string; arrowOn: string; arrowOff: string; isolateOn: string; isolateOff: string;
  /** the quiet padlock beside the name of an object whose position is locked */
  pinned: string;
}

/** MICRO-SEG21 · the icons of the fixed columns, drawn as the design system's
 *  (viewBox 16, a 1.4 line, round ends): an eye open / shut (thinner than the
 *  viewport bar's), the mouse's arrow (full: selectable; an empty outline,
 *  attenuated: not), the isolate's target (the ◎ it was, the inner disc full
 *  when on). The same SVG in the heading and on every row. */
const SVG = (body: string): string =>
  `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const COL_ICONS = {
  eyeOn: SVG(`<path d="M1.6 8C3.2 5.2 5.4 3.8 8 3.8s4.8 1.4 6.4 4.2c-1.6 2.8-3.8 4.2-6.4 4.2S3.2 10.8 1.6 8Z"/><circle cx="8" cy="8" r="1.9"/>`),
  eyeOff: SVG(`<path d="M1.6 6.6C3.2 9 5.4 10.2 8 10.2s4.8-1.2 6.4-3.6"/><path d="M3.8 9.1 2.8 10.6M8 10.2v1.9M12.2 9.1l1 1.5"/>`),
  arrowOn: SVG(`<path d="M4 2.2v10.4l2.7-2.5 1.9 4.1 1.7-.8-1.9-4h3.6Z" fill="currentColor"/>`),
  arrowOff: SVG(`<path d="M4 2.2v10.4l2.7-2.5 1.9 4.1 1.7-.8-1.9-4h3.6Z"/>`),
  isolateOn: SVG(`<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/>`),
  isolateOff: SVG(`<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="2.2"/>`),
  pin: `<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7.2" width="9" height="6.6" rx="1.2"/><path d="M5.6 7.2V5.3a2.4 2.4 0 0 1 4.8 0v1.9"/></svg>`,
} as const;

export interface UnifiedApi {
  refresh: () => void;
  setSelected: (id: string | null, reveal?: boolean) => void;
  /** for the checks: the rows as built */
  rows: () => URow[];
  /** for the checks: paint the rows in sight now (what a scroll frame does) */
  paintNow: () => void;
  /** MICRO-PL07 p.0 · the Space's summary clicked: the epoch's branch opened,
   *  scrolled to the top and lit for a moment; false when no row is the epoch */
  revealEpoch: (epochId: string) => boolean;
  /** MICRO-SEG14 p.2 · the first row `match` finds, opened, scrolled to the top
   *  and flashed (the Space's «sketches» in its summary); false: none */
  revealRow: (match: (r: URow) => boolean) => boolean;
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

  // MICRO-RITOCCHI-CHIARI p.4 · the columns' heading, as Blender's Outliner: the
  // icons of the fixed columns at the right of every row. MICRO-SEG21 · from the
  // right as Blender's: the eye (visible), the arrow (selectable), the isolate —
  // in the Space; the eye alone elsewhere. The padlock is in the row's menu now.
  const colHead = document.createElement("div");
  colHead.className = "uo-colhead";
  colHead.dataset.uoColhead = "1";
  root.insertBefore(colHead, scroll);
  root.style.setProperty("--uo-cols-w", d.space ? "54px" : "18px");
  const drawColHead = (): void => {
    const W = d.columnWords;
    colHead.textContent = "";
    const fill = document.createElement("span");
    fill.className = "uo-colhead-fill";
    colHead.appendChild(fill);
    const cols = document.createElement("span");
    cols.className = "uo-cols";
    const cell = (svg: string, title: string, k: string) => {
      const c = document.createElement("span");
      c.className = `uo-col uo-col-${k}`;
      c.innerHTML = svg;
      c.title = title;
      c.setAttribute("aria-label", title);
      cols.appendChild(c);
    };
    if (d.space) cell(COL_ICONS.isolateOff, W?.isolate ?? "", "isolate");
    if (d.space) cell(COL_ICONS.arrowOn, W?.arrow ?? "", "arrow");
    cell(COL_ICONS.eyeOn, W?.eye ?? "", "eye");
    colHead.appendChild(cols);
  };
  drawColHead();

  // MICRO-SEG17 · a discreet line above the columns: the Sheets' filter and its switch
  const strataBar = document.createElement("div");
  strataBar.className = "uo-strata";
  strataBar.dataset.uoStrata = "1";
  root.insertBefore(strataBar, colHead);
  const drawStrata = (): void => {
    const s = d.strata?.() ?? null;
    strataBar.hidden = !s;
    strataBar.textContent = "";
    if (!s) return;
    strataBar.classList.toggle("uo-strata-on", s.on);
    const lab = document.createElement("span");
    lab.className = "uo-strata-l";
    lab.textContent = s.label;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "uo-strata-b";
    b.dataset.uoStrataToggle = "1";
    b.textContent = s.button;
    b.title = s.title;
    b.setAttribute("aria-pressed", s.on ? "false" : "true");
    b.addEventListener("click", (e) => { e.stopPropagation(); d.toggleStrata?.(); });
    strataBar.append(lab, b);
  };

  let rows: URow[] = [];
  /** p.5 · per row, the epoch whose branch it is in (its colour behind the row) and the band's parity */
  let bands: Array<{ epoch: string; odd: boolean; first: boolean } | null> = [];
  let drawnFrom = -1, drawnTo = -1, drawnSel: string | null | undefined, drawnGen = -1;
  let gen = 0;
  /** MICRO-PL07 p.0 · the row lit for a moment (the epoch the Space's summary pointed at) */
  let flashKey: string | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let queued = false;
  /** MICRO-SEG10 · the ROW of the selection (its path: source/graph/epoch/group…/id),
   *  not only its node: a unit is listed under several epochs and containers */
  let pickedKey: string | null = null;
  /** true while the Outliner's own pick goes round the app and comes back to
   *  `setSelected` (synchronously): that row is where the pointer is, nothing moves */
  let selfPick = false;
  const pickSelf = (r: URow, go: () => void): void => {
    pickedKey = r.key;
    selfPick = true;
    try { go(); } finally { selfPick = false; }
  };

  const build = (): void => {
    drawStrata();
    const opts = d.opts();
    rows = flattenOutliner({ sources: d.sources(), opts, texts: d.texts(), toggled: d.toggled(), geoMark: d.geoMark });
    // MICRO-A-PROPRIO-EREDITATO · the epochs' colours only when the Outliner is
    // organised in time (by epoch; tomorrow by computed horizons)
    const temporal = isTemporalHierarchy(opts.hierarchy);
    // p.5 · the branch of an epoch (its row and everything under it, until a
    // row at its depth or above); a phase opens a band of its own inside it
    bands = [];
    const stack: Array<{ depth: number; id: string; odd: boolean }> = [];
    let n = 0;
    for (const r of rows) {
      while (stack.length && stack[stack.length - 1].depth >= r.depth) stack.pop();
      const isEp = temporal && r.glyph === "EpochNode" && !!r.id && !!d.epochColor;
      if (isEp) stack.push({ depth: r.depth, id: r.id!, odd: n++ % 2 === 1 });
      const top = stack[stack.length - 1];
      bands.push(top ? { epoch: top.id, odd: top.odd, first: isEp } : null);
    }
    gen++;
    spacer.style.height = `${rows.length * ROW_H}px`;
  };

  const rowEl = (r: URow, i: number, sel: string | null, keys: ReadonlySet<string> | null, selKey: string | null): HTMLElement => {
    const el = document.createElement("div");
    el.className = `uo-row uo-${r.kind}`;
    if (r.absent) el.classList.add("uo-absent");
    if (r.active) el.classList.add("uo-active");
    if (r.skey && keys) { if (keys.has(r.skey)) el.classList.add("uo-sel"); }
    else if (r.key === selKey) el.classList.add("uo-sel");
    // MICRO-SEG10 p.3 · the same unit in another place of the tree: a light sign
    else if (r.id && r.id === sel && selKey && SELECTS(r)) {
      el.classList.add("uo-same");
      el.dataset.same = "1";
    }
    if (r.skey) el.dataset.skey = r.skey;
    if (flashKey && r.key === flashKey) el.classList.add("uo-flash");
    el.style.top = `${i * ROW_H}px`;
    el.style.paddingLeft = `${4 + r.depth * 12}px`;
    el.dataset.key = r.key;
    if (r.id) el.dataset.id = r.id;
    el.dataset.i = String(i);
    // MICRO-SEG28 · a document of the documents' index, a file's sign
    if (r.docDrop) el.dataset.docRow = "1";
    if (r.sign) el.dataset.sign = r.sign;
    const tw = document.createElement("span");
    tw.className = "uo-tw";
    if (r.parent) { tw.textContent = r.open ? "▾" : "▸"; tw.dataset.tw = "1"; }
    el.appendChild(tw);
    if (r.kind !== "dim" && r.kind !== "empty") el.appendChild(d.mark(r));
    if (r.geo) {
      // MICRO-PL00 · a discreet sign after the glyph (the marks' column is the
      // first to be cut in a narrow Outliner): a georeference of its own
      const g = document.createElement("span");
      g.className = "uo-geo";
      g.dataset.geo = "own";
      g.textContent = "⌖";
      g.title = r.geo;
      el.appendChild(g);
    }
    if (d.vocabMark && r.id && (r.kind === "node" || r.kind === "sub")) {
      // MICRO-PL02 · beside a property: the Inspector's sign, the same reading
      const vm = d.vocabMark(r);
      if (vm) {
        const g = document.createElement("span");
        g.className = "uo-vmark";
        g.dataset.vmark = vm.state;
        g.textContent = vm.glyph;
        g.title = vm.tip;
        g.setAttribute("aria-label", vm.tip);
        el.appendChild(g);
      }
    }
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
    if (r.note) {
      // MICRO-OUTLINER-EPOCHE-TOOLTIP p.1 · a member living in another epoch: where.
      // MICRO-SEG21 · an informative sign (⟲ survives from an earlier epoch, ⟂ its
      // epochs, «solo studio»…) sits quietly beside the name, only where it applies
      const n = document.createElement("span");
      n.className = "uo-note";
      n.dataset.note = "1";
      n.textContent = r.note;
      if (r.noteTitle) { n.title = r.noteTitle; n.setAttribute("aria-label", r.noteTitle); }
      el.appendChild(n);
    }
    // MICRO-SEG21 · the padlock left the columns: on a locked object, a quiet sign
    // beside the name (unlocked from the row's menu, as the lock)
    if (d.space && r.skey && !r.ghost && d.space.pinned?.(r.skey)) {
      const k = document.createElement("span");
      k.className = "uo-pinmark";
      k.dataset.pinned = "1";
      k.innerHTML = COL_ICONS.pin;
      const w = d.columnWords?.pinned ?? "";
      k.title = w;
      k.setAttribute("aria-label", w);
      el.appendChild(k);
    }
    // p.5 · the epoch's colour behind its branch (the Matrix's band)
    const band = bands[i];
    const bc = band && d.epochColor ? d.epochColor(band.epoch) : null;
    if (band && bc) {
      el.classList.add("uo-band");
      if (band.odd) el.classList.add("uo-band-odd");
      if (band.first) el.classList.add("uo-band-first");
      el.style.setProperty("--ep-color", bc);
      el.dataset.band = band.epoch;
    }
    // p.4 · the marks (LOD, alt, ⊥ epoch, warnings…) in one column before the fixed ones
    const tail = document.createElement("span");
    tail.className = "uo-marks";
    if (r.version) {
      el.classList.add("uo-version-row");
      if (r.version.drawn) el.classList.add("uo-drawn");
      const u = [r.version.level, ...(r.version.uses ?? [])].filter(Boolean).join(" · ");
      if (u) { const x = document.createElement("span"); x.className = "uo-uses"; x.textContent = u; tail.appendChild(x); }
      if (r.version.auto) { const a = document.createElement("span"); a.className = "uo-auto"; a.textContent = "A"; tail.appendChild(a); }
    }
    if (r.alt) el.classList.add("uo-alt");
    if (r.ghost) el.classList.add("uo-ghost");
    if (r.followGroup && d.follow) {
      const f = document.createElement("button");
      f.type = "button";
      f.className = "uo-follow";
      f.dataset.follow = r.followGroup;
      f.textContent = d.followWord ?? "↩";
      tail.appendChild(f);
    }
    if (r.warn) {
      const w = document.createElement("button");
      w.type = "button";
      w.className = "uo-warn";
      w.dataset.warn = "1";
      w.textContent = "⚠";
      w.title = r.warn;
      tail.appendChild(w);
    }
    const S = d.space;
    if (S && (r.skey || r.kind === "node")) {
      const sub = r.skey && S.substitutedBy ? S.substitutedBy(r.skey) : null;
      if (sub) {
        el.classList.add("uo-subst");
        const x = document.createElement("span");
        x.className = "uo-subst-mark";
        x.dataset.subst = "1";
        x.textContent = "⇄";
        x.title = sub;
        x.setAttribute("aria-label", sub);
        tail.appendChild(x);
      }
      const bs = r.id && !r.version && S.blendState ? S.blendState(r.id) : null;
      if (bs) {
        const b = document.createElement("span");
        b.className = `sol-blend sol-blend-${bs.state}`;
        b.dataset.blend = bs.state;
        b.textContent = bs.sign;
        b.title = bs.title;
        tail.appendChild(b);
      }
      const fst = r.skey && !r.ghost ? S.fileState?.(r) ?? null : null;
      if (fst) {
        const f = document.createElement("span");
        f.className = `uo-fstate uo-fstate-${fst.state}`;
        f.dataset.fstate = fst.state;
        f.textContent = fst.state === "reference" ? "↗" : "⚠";
        f.title = fst.title;
        f.setAttribute("aria-label", fst.title);
        tail.appendChild(f);
      }
      const failed = r.skey ? S.failed(r) : null;
      if (failed) {
        const f = document.createElement("button");
        f.type = "button";
        f.className = "uo-fail";
        f.dataset.sp = "fail";
        f.textContent = "⚠";
        f.title = failed;
        tail.appendChild(f);
      }
      const chip = S.chip(r);
      if (chip) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "uo-chip";
        c.dataset.sp = "lod";
        c.textContent = `${chip} ▾`;
        tail.appendChild(c);
      }
      const alt = S.alt(r);
      if (alt) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "uo-chip uo-altchip";
        c.dataset.sp = "alt";
        c.textContent = `${alt} ▾`;
        tail.appendChild(c);
      }
      // MICRO-SEG21 · the isolate is a fixed column now (below); «Frame» is the
      // row's double click and its menu, never an icon that comes with the hover
    }
    el.appendChild(tail);
    const tip = r.desc ? `${r.label} — ${r.desc}` : r.label;
    el.title = r.absent ? `${tip} — ${d.word("absent")}` : r.title ? `${tip} — ${r.title}` : tip;
    if (r.ghost && S) el.title = `${tip} — ${S.words.ghost}`;
    if (el.dataset.same && d.sameWord) el.title = `${el.title} — ${d.sameWord()}`;
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
      tail.appendChild(b);
    }
    if (r.count) {
      const c = document.createElement("span");
      c.className = "uo-count";
      c.textContent = r.count;
      tail.appendChild(c);
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
      tail.appendChild(m);
    }
    // p.4 · the fixed columns, right-aligned, ALWAYS there (off, or empty when the
    // row has nothing of the kind) so they stack in vertical lines. MICRO-SEG21 ·
    // the same three on every row, selected, under the mouse or neither — from the
    // left: the isolate, the arrow (selectable), the eye (visible), in the Space;
    // the eye alone elsewhere. Selection and hover change the row's background
    // (and the icons' intensity), never how many there are nor where.
    const cols = document.createElement("span");
    cols.className = "uo-cols";
    const W = d.columnWords;
    const blank = (k: string) => { const x = document.createElement("span"); x.className = `uo-col uo-col-${k} uo-col-none`; cols.appendChild(x); };
    const col = (k: string, on: boolean, svg: string, title: string, data: [string, string]): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `uo-col uo-col-${k} uo-${k}` + (on ? " uo-col-on" : ` uo-${k}-off`);
      b.dataset[data[0]] = data[1];
      b.innerHTML = svg;
      b.title = title;
      b.setAttribute("aria-label", title);
      b.setAttribute("aria-pressed", String(on));
      cols.appendChild(b);
      return b;
    };
    if (S) {
      if (r.skey && !r.ghost && !r.skey.startsWith("x3d:")) {
        const on = S.isolated() === r.skey;
        col("isolate", on, on ? COL_ICONS.isolateOn : COL_ICONS.isolateOff,
          (on ? W?.isolateOn : W?.isolateOff) ?? S.words.isolate, ["sp", "isolate"]);
      } else blank("isolate");
      if (r.skey && !r.ghost) {
        const lk = S.lockOpen(r.skey);
        col("arrow", lk, lk ? COL_ICONS.arrowOn : COL_ICONS.arrowOff, (lk ? W?.arrowOn : W?.arrowOff) ?? S.words.arrow, ["sp", "arrow"]);
      } else blank("arrow");
    }
    if (r.eye || r.gis) {
      const on = r.ghost && S ? S.forced(r.eye!) : r.eye ? d.eyeOpen(r.eye) : d.gisOpen(r.gis!);
      const title = r.ghost && S ? S.words.ghost : (on ? W?.eyeOn : W?.eyeOff) ?? d.word("eye");
      col("eye", on, on ? COL_ICONS.eyeOn : COL_ICONS.eyeOff, title, ["eye", r.eye ?? `gis:${r.gis}`]);
    } else blank("eye");
    // MICRO-PL07 p.0 · a GIS layer's «⋯»: its opacity, a DEM's surface and contours
    // (they were in the Space's «Visibilità ▾», which keeps only what is seen)
    if (r.kind === "source" || r.kind === "graph" || r.kind === "aux" || (r.kind === "gis" && !!r.gis && !!d.gisMenu)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "uo-menu";
      b.dataset.menu = "1";
      b.textContent = "⋯";
      b.title = d.word("menu");
      tail.appendChild(b);
    }
    el.appendChild(cols);
    return el;
  };

  /** MICRO-SEG10 · which row is THE selection's: the one remembered when it is
   *  of the node selected, else the first row in sight of the node under the
   *  epoch in front, else the first; -1 when no row in sight is of the node */
  const selIndex = (sel: string | null): number => {
    if (!sel) return -1;
    if (pickedKey) {
      const i = rows.findIndex((r) => r.key === pickedKey && r.id === sel && SELECTS(r));
      if (i >= 0) return i;
    }
    const ctx = d.contextEpoch?.() ?? null;
    let first = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.id !== sel || !SELECTS(r)) continue;
      if (first < 0) first = i;
      if (!ctx) break;
      if (r.epochAt === ctx || bands[i]?.epoch === ctx) return i;
    }
    return first;
  };

  const paint = (force = false): void => {
    const h = scroll.clientHeight || 600;
    const from = Math.max(0, Math.floor(scroll.scrollTop / ROW_H) - OVERSCAN);
    const to = Math.min(rows.length, Math.ceil((scroll.scrollTop + h) / ROW_H) + OVERSCAN);
    const keys = d.selectedKeys?.() ?? null;
    const sel = d.selectedId();
    const selKey = rows[selIndex(sel)]?.key ?? null;
    const selSig = `${sel}|${selKey}|${keys ? [...keys].join(",") : ""}`;
    if (!force && from === drawnFrom && to === drawnTo && selSig === drawnSel && gen === drawnGen) return;
    drawnFrom = from; drawnTo = to; drawnSel = selSig; drawnGen = gen;
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) frag.appendChild(rowEl(rows[i], i, sel, keys, selKey));
    layer.replaceChildren(frag);
    // the heading's columns over the rows' (a scrollbar that takes room shifts the rows)
    colHead.style.paddingRight = `${Math.max(0, scroll.offsetWidth - scroll.clientWidth)}px`;
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
    if (m) { e.stopPropagation(); if (r.kind === "gis" && r.gis && d.gisMenu) d.gisMenu(r, m); else d.menu(r, m); return; }
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
      paint(true);
      return;
    }
    if (r.version && d.space) { d.space.chooseVersion(r); paint(true); return; }
    const badge = t.closest<HTMLElement>("[data-badge]");
    if (badge) { e.stopPropagation(); if (r.badge === "activate") d.activate?.(r); return; }
    if (r.skey && d.pickKey) { const all = rows.filter((x) => x.skey).map((x) => x.skey!); pickSelf(r, () => d.pickKey!(r, e, all)); paint(true); return; }
    if (r.id || r.kind === "graph" || r.kind === "source") { pickSelf(r, () => d.pick(r, e)); paint(true); return; }
    if (r.parent) toggleOpen(r);
  });
  // MICRO-OUTLINER-EPOCHE-TOOLTIP p.2 · a row dragged onto an epoch: a plain
  // drop MOVES it, with Alt it EXTENDS it there. With the pointer, not HTML5
  // drag and drop (the desktop shell keeps that for the Finder's files — the
  // lesson of the Assets, MICRO-SPAZIO-CONTAINER A1). A line under the epoch
  // and a label by the pointer say which of the two will happen; Esc cancels.
  let dragEnded = 0;
  layer.addEventListener("pointerdown", (e0) => {
    if (e0.button !== 0) return;
    const r = rowOf(e0.target);
    if (!r || !r.id || r.version || (e0.target as HTMLElement).closest("button,[data-tw]")) return;
    // MICRO-COR05 E12 · any node's row may also go onto a chapter of a story
    // open beside (`[data-nv-drop]`, narrative.ts): it becomes a block there
    const epochable = !!d.epochDrop && r.epochAt !== undefined;
    const x0 = e0.clientX, y0 = e0.clientY;
    let on = false;
    let target: { el: HTMLElement; epoch: string; group?: string } | null = null;
    let chapter: HTMLElement | null = null;
    // MICRO-TESTATE-COERENTI p.10a · the container the row is listed in (a member's key)
    const fromGroup = /\/grp\/([^/]+)\/m\/[^/]+$/.exec(r.key)?.[1] ?? null;
    const isModel = /^representation_model|^RepresentationModelNodeGroup$/.test(String(r.glyph ?? ""));
    let alt = e0.altKey;
    let tag: HTMLElement | null = null;
    let lx = x0, ly = y0;
    let auto = 0;
    const clear = () => {
      target?.el.classList.remove("uo-drop", "uo-drop-extend"); target = null;
      chapter?.classList.remove("nv-drop-over"); chapter = null;
    };
    const say = () => {
      if (!tag) return;
      const txt = chapter ? d.chapterDropLabel?.(r, chapter.dataset.nvDrop ?? "") ?? null
        : target ? (target.group !== undefined ? d.containerDropLabel?.(r, target.group, fromGroup, alt) ?? null : d.dropLabel?.(r, target.epoch, alt) ?? null) : null;
      tag.textContent = txt ?? r.label;
      tag.classList.toggle("uo-dragtag-none", !txt);
      tag.classList.toggle("uo-dragtag-extend", !!txt && alt);
      tag.style.left = `${lx + 14}px`;
      tag.style.top = `${ly + 10}px`;
      if (target) { target.el.classList.add("uo-drop"); target.el.classList.toggle("uo-drop-extend", alt); }
      chapter?.classList.add("nv-drop-over");
    };
    const find = () => {
      const onCh = document.elementFromPoint(lx, ly)?.closest<HTMLElement>("[data-nv-drop]") ?? null;
      const ch = onCh && d.chapterDropLabel?.(r, onCh.dataset.nvDrop ?? "") ? onCh : null;
      if (ch !== chapter) clear();
      if (ch) { chapter = ch; say(); return; }
      if (!epochable) { say(); return; }
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
      // (only over the list: a row carried to a chapter in another window
      // must not scroll it on the way)
      const edge = lx < b.left || lx > b.right ? 0 : ly < b.top + 24 ? -1 : ly > b.bottom - 24 ? 1 : 0;
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
      const ch = chapter;
      clear();
      if (on) dragEnded = Date.now();
      if (drop && on && ch) { ch.dispatchEvent(new CustomEvent("em-node-drop", { detail: { id: r.id } })); return; }
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
  // MICRO-SEG28 · a file of Files dropped on a document: stamped and linked to it
  // (HTML5 drag and drop: the Storage's rows carry their path that way)
  let fileOver: HTMLElement | null = null;
  const fileClear = () => { fileOver?.classList.remove("uo-drop"); fileOver?.removeAttribute("title"); fileOver = null; };
  const fileTarget = (e: DragEvent): { el: HTMLElement; r: URow } | null => {
    const F = d.fileDrop;
    if (!F || !e.dataTransfer || !F.accepts([...e.dataTransfer.types])) return null;
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".uo-row") ?? null;
    const r = el && layer.contains(el) ? rows[Number(el.dataset.i ?? -1)] : null;
    return el && r?.docDrop && r.id ? { el, r } : null;
  };
  layer.addEventListener("dragover", (e) => {
    const t = fileTarget(e);
    if (!t) { fileClear(); return; }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "link";
    if (fileOver !== t.el) { fileClear(); fileOver = t.el; t.el.classList.add("uo-drop"); t.el.dataset.uoFileDrop = "1"; t.el.title = d.fileDrop!.label(t.r); }
  });
  layer.addEventListener("dragleave", (e) => { if (fileOver && !fileOver.contains(e.relatedTarget as Node | null)) fileClear(); });
  layer.addEventListener("drop", (e) => {
    const t = fileTarget(e);
    fileClear();
    if (!t || !e.dataTransfer) return;
    e.preventDefault();
    e.stopPropagation();
    d.fileDrop!.drop(t.r, e.dataTransfer);
  });
  layer.addEventListener("dblclick", (e) => {
    const r = rowOf(e.target);
    if (!r || (e.target as HTMLElement).closest("[data-tw],[data-eye],[data-menu]")) return;
    if (r.id && d.frame) d.frame(r);
    else if (r.skey && d.space) d.space.frame(r);   // MICRO-SEG21 · a sketch: framed too
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
    if (!r || !(r.kind === "source" || r.kind === "graph" || r.kind === "aux" || ((r.kind === "node" || r.kind === "sub") && r.id)
      || (r.kind === "gis" && !!r.gis && !!d.gisMenu))) return;
    e.preventDefault();
    const at = (e.target as HTMLElement).closest<HTMLElement>(".uo-row") ?? root;
    if (r.kind === "gis" && r.gis && d.gisMenu) d.gisMenu(r, at); else d.menu(r, at);
  });
  // ↑ ↓ move the selection over the rows that select, ← → close and open
  root.addEventListener("keydown", (e) => {
    // MICRO-SEG21 · H hides, Shift+H hides the rest, Alt+H shows all (Blender's):
    // by the key's place — on a Mac Alt+H types «˙»
    if ((e.code === "KeyH" || e.key === "h" || e.key === "H") && !e.metaKey && !e.ctrlKey
        && !(e.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) {
      const mode = e.altKey ? (e.shiftKey ? null : "reveal") : e.shiftKey ? "unselected" : "selected";
      if (mode && hideByKey(mode)) { e.preventDefault(); e.stopPropagation(); paint(true); }
      return;
    }
    // MICRO-SEG10 p.4 · from the row lit (the one clicked), not from the node's first row
    const sel = d.selectedId();
    const si = selIndex(sel);
    const at = si >= 0 && (rows[si].kind === "node" || rows[si].kind === "sub") ? si : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const step = e.key === "ArrowDown" ? 1 : -1;
      for (let i = at + step; i >= 0 && i < rows.length; i += step) {
        const r = rows[i];
        if (r.id && (r.kind === "node" || r.kind === "sub")) {
          e.preventDefault();
          pickSelf(r, () => { if (r.skey && d.pickKey) d.pickKey(r, new MouseEvent("click"), []); else d.pick(r, new MouseEvent("click")); });
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

  /** MICRO-SEG21 · H / Shift+H / Alt+H here: the Space's verbs in the Space; elsewhere
   *  H shuts the eye of the row lit and Alt+H opens them all (no «the rest»: the
   *  eye-only Outliners have no selection of objects) */
  const hideByKey = (mode: "selected" | "unselected" | "reveal"): boolean => {
    if (d.space || mode === "reveal") { if (!d.hideKey) return false; d.hideKey(mode); return true; }
    if (mode !== "selected") return false;
    const r = rows[selIndex(d.selectedId())];
    if (!r?.eye || !d.eyeOpen(r.eye)) return false;
    d.toggleEye(r.eye);
    return true;
  };

  const reveal = (i: number): void => {
    const top = i * ROW_H;
    if (top < scroll.scrollTop) scroll.scrollTop = top;
    else if (top + ROW_H > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = top + ROW_H - scroll.clientHeight;
  };

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => paint()) : null;
  ro?.observe(scroll);

  const revealRow = (match: (r: URow) => boolean): boolean => {
    let i = rows.findIndex(match);
    if (i < 0) return false;
    if (rows[i].parent && !rows[i].open) { toggleOpen(rows[i]); i = rows.findIndex(match); }
    if (i < 0) return false;
    scroll.scrollTop = i * ROW_H;
    flashKey = rows[i].key;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashKey = null; paint(true); }, 1600);
    paint(true);
    return true;
  };

  build();
  paint(true);

  return {
    refresh() { build(); paint(true); },
    setSelected(id, rev = true) {
      // MICRO-SEG10 · the row clicked here stays the row, and the list does not
      // move a pixel (the old way opened and scrolled to the node's FIRST row)
      const self = selfPick;
      selfPick = false;
      if (id) {
        let i = selIndex(id);
        if (!(self && i >= 0 && rows[i].key === pickedKey)) {
          // from elsewhere: a row in sight is enough; only when none is, the
          // branches around the node's first row open
          if (i < 0 && rev) {
            const b = { sources: d.sources(), opts: d.opts(), texts: d.texts(), toggled: d.toggled() };
            const open = opensForNode(b, id);
            if (open.length) {
              const s = new Set(d.toggled());
              for (const k of open) if (s.has(k)) s.delete(k); else s.add(k);
              d.setToggled(s);
              build();
            }
            i = selIndex(id);
          }
          if (i >= 0) {
            pickedKey = rows[i].key;
            if (rev) reveal(i);
          }
        }
      }
      paint(true);
    },
    rows: () => rows,
    paintNow: () => paint(),
    revealEpoch: (epochId) => revealRow((r) => r.id === epochId && r.kind === "group" && r.glyph === "EpochNode"),
    revealRow,
    destroy() { clearTimeout(flashTimer); ro?.disconnect(); root.remove(); },
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
  /** MICRO-PL00 · «only the objects with their own georeference» */
  geoOwn?: string;
  /** MICRO-SEG28 · the kind of Outliner (the graph, the documents and their
   *  files), how the documents are grouped, the DTC branch */
  view?: string;
  views?: Record<OutlinerView, string>;
  viewHints?: Record<OutlinerView, string>;
  docGroup?: string;
  docGroups?: Record<DocGroup, string>;
  dtc?: string;
  dtcHint?: string;
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
  // MICRO-SEG15 · in a tight head «3D» goes first (level 1): the button stays lit
  btn.innerHTML = o0.view === "documents" && w.views ? `☰<span class="hdr-long"> ${w.views.documents.replace(/[<>&]/g, "")}</span>`
    : o0.sync3d ? `☰<span class="hdr-long"> 3D</span>` : "☰";
  if (o0.view === "documents") btn.dataset.uoView = "documents";
  btn.dataset.hdrCompact = "1";
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
      // MICRO-SEG28 · first, WHAT the Outliner indexes: the graph, or the documents
      // and their files (the Archive's, offered everywhere)
      if (w.views && !o.strata) {
        head(w.view ?? "");
        for (const v of OUTLINER_VIEWS)
          item(w.views[v], (o.view ?? "graph") === v, "radio", () => set({ ...opts(), view: v }), `view:${v}`, w.viewHints?.[v]);
        if (o.view === "documents") {
          head(w.docGroup ?? "");
          for (const gq of ["state", "type"] as DocGroup[])
            item(w.docGroups?.[gq] ?? gq, (o.docGroup ?? "state") === gq, "radio", () => set({ ...opts(), docGroup: gq }), `docgroup:${gq}`);
          item(w.dtc ?? "DTC", !!o.dtc, "check", () => set({ ...opts(), dtc: !opts().dtc }), "dtc", w.dtcHint);
          return;
        }
      }
      head(w.hierarchy);
      for (const h of ["epoch", "alpha", "type"] as Hierarchy[])
        item(w.hier[h], o.hierarchy === h, "radio", () => set({ ...opts(), hierarchy: h }), `hier:${h}`);
      head(w.sync);
      item(w.sync, o.sync3d, "check", () => set({ ...opts(), sync3d: !opts().sync3d }), "sync", w.syncHint);
      item(w.grey, o.absent === "grey", "radio", () => set({ ...opts(), absent: "grey" }), "absent:grey");
      item(w.filter, o.absent === "filter", "radio", () => set({ ...opts(), absent: "filter" }), "absent:filter");
      if (w.geoOwn) item(w.geoOwn, !!o.geoOwn, "check", () => set({ ...opts(), geoOwn: !opts().geoOwn }), "geo-own");
      // MICRO-SEG17 · the Sheets' units alone: no dimension to choose (its line says «Show all»)
      if (o.strata) return;
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
    // MICRO-SEG13 · a press outside, Esc, «☰» again: `floating`
    floating(pop, { close: () => pop.remove(), opener: btn, name: "uo-selector" });
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
    ...(o.geoOwn ? { geoOwn: true } : {}),
    // MICRO-SEG28 · the kind of Outliner, when the person chose one (absent: the place decides)
    ...(o.view === "documents" || o.view === "graph" ? { view: o.view } : {}),
    ...(o.docGroup === "type" || o.docGroup === "state" ? { docGroup: o.docGroup } : {}),
    ...(o.dtc ? { dtc: true } : {}),
    query: "",
  };
}
