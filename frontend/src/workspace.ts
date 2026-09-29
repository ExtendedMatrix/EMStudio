/**
 * WIN1 · the windowing model — workspaces + windows (Blender-like), the shell's
 * new switching layer that ABSORBS MODE1 (the old central-mode enum).
 *
 * A **window** is an area of a given `WindowType` with its own per-instance
 * state (so two Graph windows can hold different modes). A **workspace** is a
 * preset arrangement of windows, selected from the fixed leader bar. No free
 * tiling yet (DP-82 D4): presets + per-window transform only.
 *
 * This module is PURE UI STATE (never em.json): the session's arrangement, not
 * part of any document. `main.ts` reads it and mounts the existing editors
 * (canvas matrix/graph, narrative view, EM-Data table) — the windows reuse the
 * editors, they don't reimplement them.
 *
 * Checkpoint scope: the model + the active-workspace state + the preset list.
 * Each preset currently centres on ONE window (its `windowType`); the `Win`
 * shape is already per-instance so multi-window arrangements and the per-window
 * transform (WIN2) drop in without a model change.
 */

import type { ViewKind } from "./types";
import { windowIcon } from "./window-icons";

/** The kinds of editor a window can host. DTC is a MODE of the graph window
 *  (WIN2), not a type of its own. */
export type WindowType =
  | "graph"
  | "narrative"
  | "table"
  | "doc"
  // WIN6 · the side panels became window types of their own: everything in the
  // shell is a window now, so anything can be tiled, resized and focused.
  | "emtree"
  // SHIFT-A · the OUTLINER is a window of its own (1 ott 2026). It was the
  // `nodelist` tab of the EMtree, and the two answer different questions:
  // EMtree «which graphs are open, with which sources», Outliner «what is in the
  // active graph». Four windows, four questions (with the Inspector «what is the
  // selection» and the Log «what happened»).
  | "outliner"
  | "inspector"
  // VIEWER · a preview surface: the resource the current element points at,
  // shown as itself. It PLACES nothing (no provider in RESOURCE_PROVIDERS), so
  // it carries no palette and no chevron.
  | "viewer"
  // W1 · STORAGE · where the bytes live. Its Modes are the BACKENDS (filesystem
  // now, MinIO in phase 2, Samba/WebDAV conceivable) — the same shape as the
  // graph window's projections: one window, several ways of looking.
  | "storage"
  // A2 · ANNOTATOR · an image, and the regions traced on it. Its Modes are what
  // the pointer DOES (look / trace / mask), the way Blender's Image Editor has
  // View / Paint / Mask — not what it shows, which is always the same picture.
  | "annotator"
  // SHELF1 · THE WIDE LIST. The curated, savable list of resources a study
  // works from — a ShelfGraph, not a computed view of a folder's orphans.
  // (video editor: browser → SHELF → timeline.)
  | "shelf"
  // STUDY · what the canvas IS, as opposed to what a node is: the graph's name
  // and id, its propagative metadata (DP-65), the site position, the HDT-O
  // fields. It was the no-node branch of the INSPECTOR, which made a per-graph
  // panel live inside a per-node window — and ended it with "Select a node to
  // inspect it". A window of its own is the place that sentence was pointing at.
  | "study"
  // COLLEGARE · the INDEX of a story: its chapters, what still needs writing,
  // and the coverage — how much of the graph the story rests on. The left
  // column of the Narrative space; the page itself is the `narrative` window.
  | "narrative-index"
  // AUDIT N5 · THE CHRONOLOGY CHECK: the epochs and phases as bars on a time
  // axis, the overlaps with their delta and their remedies, the bounds table.
  // A window of its own and not a sheet of the Table: it draws an axis, it
  // offers remedies per overlap, and it is opened from four places (Tools, the
  // lane menu, the epoch's Inspector, the chronology warnings) next to the
  // Matrix it corrects.
  | "chronology";

/** A single window instance — its own id + type + type-specific state. */
export interface Win {
  id: string;
  type: WindowType;
  /** per-instance state (e.g. a graph window's matrix|graph|dtc mode). */
  state: Record<string, unknown>;
}

/** The mode of a graph window — WIN2's per-instance state. It IS a `ViewKind`:
 *  the window chooses which canvas projection it shows. */
export type GraphMode = ViewKind;

/** The modes a graph window offers, in header order. THE list: `main.ts` builds
 *  the menu from it and `winMode` validates against it, so a new projection is
 *  one entry here rather than two lists that can disagree (which is exactly how
 *  `multigraph` first shipped invisible to `winMode`). */
export const GRAPH_MODES: GraphMode[] = ["matrix", "graph", "dtc", "multigraph"];

/** The backends a Storage window can show. `minio` is present and NOT connected
 *  (phase 2) — it is listed because the window's shape is "one window, several
 *  backends", and a Mode that is coming is better declared than discovered. */
export const STORAGE_MODES = ["filesystem", "minio"] as const;

/** How a Viewer window shows its collection: one item at a time, or all of it.
 *  Same collection either way — the Mode is the reading, not the content. */
export const VIEWER_MODES = ["single", "gallery"] as const;

/** How a Shelf window shows the list. SHELF1 shipped the wide LIST (a row per
 *  resource, with its thumbnail); the TABLE is the same shelf read back from
 *  s3Dgraphy as rows — with the three columns only the library can answer
 *  (residence, role, mode). One window, two ways of looking, the same shape as
 *  the Storage window's backends: the table is not a second shelf. */
export const SHELF_MODES = ["list", "table"] as const;

/** What the pointer does in an Annotator window. `mask` is DECLARED and not
 *  implemented (phase 2, like the datamodel's `shape_kind: "mask"`): it is
 *  listed because the plan is decided, and it is disabled in the header rather
 *  than silently absent — a mode that will exist is better announced than
 *  discovered. */
export const ANNOTATOR_MODES = ["view", "annotate", "mask"] as const;

/** The modes that are listed but cannot be entered yet, with the reason shown
 *  to whoever tries. Data, not an `if` in the header code. */
export const DISABLED_MODES: Record<string, string> = {
  mask: "win.maskPhase2",
};

/**
 * U1 · THE mode registry: window type → the modes that type offers, in header
 * order. `main.ts` builds the Mode dropdown from this and `winModeOf` validates
 * against it, so adding a mode is ONE entry here — not a list plus a validator
 * plus a menu, three places free to disagree (which is exactly how `multigraph`
 * once shipped invisible to `winMode`).
 *
 * A type absent from this map simply has no Mode selector; nothing branches on
 * the type name to decide that.
 */
export const WINDOW_MODES: Partial<Record<WindowType, readonly string[]>> = {
  graph: GRAPH_MODES,
  storage: STORAGE_MODES,
  viewer: VIEWER_MODES,
  annotator: ANNOTATOR_MODES,
  shelf: SHELF_MODES,
};

/**
 * HDR1 · a workspace id is now just a string, because workspaces are no longer a
 * fixed set of three. They are TABS you pick from and can add to, the way
 * Blender's are: a few come with the app, the rest are yours.
 */
export type WorkspaceId = string;

export interface WorkspacePreset {
  id: WorkspaceId;
  /** i18n key for the tab label — built-ins only. */
  labelKey?: string;
  /** verbatim label — workspaces the user made carry their own name. */
  label?: string;
  /** a compact glyph for the tab. */
  icon: string;
  /** the window type this preset centres on. */
  windowType: WindowType;
  /** for a graph preset, the mode its FIRST window opens in. */
  graphMode?: GraphMode;
  /** built-ins cannot be deleted or renamed. */
  builtin?: boolean;
  /** i18n key of the one-line "what this arrangement is for" (tooltip). */
  hintKey?: string;
  /** The windows this tab opens with, and how they are arranged — applied the
   *  first time the tab is opened and never again (after that the arrangement is
   *  the user's). Absent = a single window of `windowType`. */
  arrangement?: Arrangement;
}

/**
 * ARRANGEMENTS · a tab IS a set of windows in a shape.
 *
 * Declared as data rather than written as a function per tab, because there are
 * six of them now and they differ only in which existing window types they place
 * and in what ratio. One builder reads this (`applyArrangement`), so a new tab is
 * an entry here — not a seventh layout function that can drift from the others.
 *
 * `win` names are LOCAL to the arrangement: the builder turns them into window
 * ids prefixed with the workspace, and reuses the workspace's first existing
 * window as the anchor so a tab that is re-seeded keeps its identity.
 */
export interface Arrangement {
  wins: Array<{
    name: string;
    type: WindowType;
    /** per-instance state, e.g. `{ mode: "dtc" }` for a graph window or
     *  `{ "mode.storage": "minio" }` for any other type — see `modeKey`, which
     *  is the one place that knows a graph's slot is the bare `mode`. */
    state?: Record<string, unknown>;
  }>;
  /** which window has the focus when the tab opens (default: the first) */
  active?: string;
  layout: ArrangementNode;
}

export type ArrangementNode =
  | { win: string }
  | { dir: "row" | "col"; ratio: number; a: ArrangementNode; b: ArrangementNode };

/**
 * THE TABS ARE ARRANGEMENTS. All six of them, one species.
 *
 * They used to be two species — four PHASES (`Documentation · Analysis ·
 * Comparisons · Output`) and two VIEWS (`IDE`, `Table`) with a hairline between
 * them — and the hairline was the tell: a bar that has to explain why two of its
 * items are different kinds of thing is answering two questions at once. E.D.'s
 * decision (2026-08-21): every tab is an arrangement of windows, the way a
 * Blender workspace is. So:
 *
 * * **IDE** stops being a tab of its own — it WAS the Graph arrangement, and it
 *   is now what the Graph tab opens: canvas, table underneath, panels beside;
 * * **Table** stops being a tab — a table is a WINDOW, and it lives in that
 *   arrangement (and in any other you put it in);
 * * **DTC** and **Annotator** become tabs, because both are places you work in
 *   for a while with a particular set of windows around you — which is exactly
 *   what a tab is now, and neither was reachable without rebuilding the layout
 *   by hand.
 *
 * The ids of the four that existed are UNCHANGED (`assets`, `canvas`,
 * `comparisons`, `narrative`): every saved arrangement, every persisted active
 * window and the tiling checks are keyed by them, and renaming an id to match a
 * label would reset the user's layouts for a word nobody sees. Labels are the
 * part that changed — and they are English by default now (see `i18n.ts`).
 */
const BUILTIN_WORKSPACES: WorkspacePreset[] = [
  // COLLEGARE · FOUR SPACES, ONE PER ACTIVITY (E.D., 29 set 2026). Each answers
  // one question, and its windows are the ones that answer it; the tooltip of
  // the tab IS the question (`hintKey`). The ids are the ones every saved
  // arrangement is keyed by — only labels and arrangements changed (and
  // `migrateSavedArrangements` below says, line by line, what happens to a
  // saved one). The first window of each `wins` is the ANCHOR `applyArrangement`
  // reuses, so it is the type the workspace has always seeded (`windowType`).
  //
  // STRATIGRAFIA · «Cosa c'è, in che ordine, e regge?» It starts COMPLETE: the
  // Matrix above the warnings table, because shrinking or closing the bottom
  // panel is a gesture, and mounting it by hand is a setup.
  {
    id: "canvas", labelKey: "ws.stratigraphy", hintKey: "ws.qStratigraphy",
    icon: "▦", windowType: "graph", graphMode: "matrix", builtin: true,
    arrangement: {
      wins: [
        { name: "canvas", type: "graph", state: { mode: "matrix" } },
        { name: "outliner", type: "outliner" },
        { name: "issues", type: "table", state: { "current.table.sheet": "Issues" } },
        { name: "inspector", type: "inspector" },
      ],
      active: "canvas",
      layout: { dir: "row", ratio: 0.16, a: { win: "outliner" },
                b: { dir: "row", ratio: 0.76,
                     a: { dir: "col", ratio: 0.64, a: { win: "canvas" }, b: { win: "issues" } },
                     b: { win: "inspector" } } },
    },
  },
  // FONTI · «Da dove viene questo dato?» The documents as cards, the one you are
  // reading above the graph it feeds, and the Inspector: the paradata chain
  // lives there.
  {
    id: "provenance", labelKey: "ws.sources", hintKey: "ws.qSources",
    icon: "⌖", windowType: "doc", builtin: true,
    arrangement: {
      wins: [
        { name: "doc", type: "doc" },
        { name: "docs", type: "table",
          state: { "current.table.sheet": "Documents", "current.table.view": "cards" } },
        { name: "graph", type: "graph", state: { mode: "graph" } },
        { name: "inspector", type: "inspector" },
      ],
      active: "doc",
      layout: { dir: "row", ratio: 0.2, a: { win: "docs" },
                b: { dir: "row", ratio: 0.72,
                     a: { dir: "col", ratio: 0.55, a: { win: "doc" }, b: { win: "graph" } },
                     b: { win: "inspector" } } },
    },
  },
  // CONTENUTI · «Quali file ho, e cosa è diventato documento?» NO Inspector: a
  // file is not a node yet. The Storage carries its own card instead — the
  // document picked in the DTC, its stamped files, how many readings it has.
  {
    id: "assets", labelKey: "ws.contents", hintKey: "ws.qContents",
    icon: "⌵", windowType: "storage", builtin: true,
    arrangement: {
      wins: [
        { name: "files", type: "storage", state: { "mode.storage": "filesystem" } },
        { name: "emtree", type: "emtree" },
        { name: "shelf", type: "shelf" },
        { name: "chain", type: "graph", state: { mode: "dtc" } },
      ],
      active: "files",
      layout: { dir: "row", ratio: 0.22,
                a: { dir: "col", ratio: 0.42, a: { win: "emtree" }, b: { win: "shelf" } },
                b: { dir: "row", ratio: 0.56, a: { win: "files" }, b: { win: "chain" } } },
    },
  },
  // NARRATIVA · «Come lo racconto, e su cosa poggia?» The Index, the page (which
  // is the reader: its tools are in the Inspector), and the Matrix that follows
  // the chapter above the Inspector.
  {
    id: "narrative", labelKey: "ws.narrative", hintKey: "ws.qNarrative",
    icon: "❧", windowType: "narrative", builtin: true,
    arrangement: {
      wins: [
        { name: "story", type: "narrative", state: { "current.reading": "write" } },
        { name: "index", type: "narrative-index" },
        { name: "canvas", type: "graph", state: { mode: "matrix" } },
        { name: "inspector", type: "inspector" },
      ],
      active: "story",
      layout: { dir: "row", ratio: 0.19, a: { win: "index" },
                b: { dir: "row", ratio: 0.6, a: { win: "story" },
                     b: { dir: "col", ratio: 0.5, a: { win: "canvas" }, b: { win: "inspector" } } } },
    },
  },
];

/**
 * PARKED · the arrangements that left the bar on 28 September 2026 and wait to
 * come back, one at a time, as each is rethought on the user's UX.
 *
 * Kept whole and with their ids, for two reasons. Their SAVED arrangements stay
 * in `localStorage` untouched (`loadRegistry` carries them through every save),
 * so the day one returns it returns as the user left it. And returning one costs
 * ONE LINE: move its entry into `BUILTIN_WORKSPACES` above. A persisted active id
 * that points here falls back to `canvas` in silence (`initial`).
 */
export const PARKED_WORKSPACES: WorkspacePreset[] = [
  // 3 · DTC — provenance: the corpus DAG (acquisitions → derivations →
  // attributions) is a MODE of a graph window, and this is the arrangement that
  // gives it the room a DAG needs, with the Inspector beside it.
  {
    id: "dtc", labelKey: "ws.dtc", hintKey: "ws.dtcHint",
    icon: "⌗", windowType: "graph", graphMode: "dtc", builtin: true,
    arrangement: {
      wins: [
        // same correction: this one HAPPENED to work because `dag` is the anchor
        // window, which `seedWindows` gives `{mode: preset.graphMode}` — so the
        // dead key was invisible until a graph window appeared somewhere other
        // than first in an arrangement. Reordering these two would have opened
        // the DTC tab in Matrix mode with nothing to explain it.
        { name: "dag", type: "graph", state: { mode: "dtc" } },
        { name: "inspector", type: "inspector" },
      ],
      layout: { dir: "row", ratio: 0.74, a: { win: "dag" },
                b: { win: "inspector" } },
    },
  },
  // 4 · COMPARISONS — what is NOT yours: the shelf's three fences (own-study /
  // own-HDT / other-HDT), what you are looking at, and what it is.
  {
    id: "comparisons", labelKey: "ws.comparisons", hintKey: "ws.comparisonsHint",
    icon: "⇄", windowType: "shelf", builtin: true,
    arrangement: {
      wins: [
        { name: "shelf", type: "shelf" },
        { name: "viewer", type: "viewer" },
        { name: "inspector", type: "inspector" },
      ],
      layout: { dir: "row", ratio: 0.46, a: { win: "shelf" },
                b: { dir: "col", ratio: 0.6, a: { win: "viewer" },
                     b: { win: "inspector" } } },
    },
  },
  // 6 · ANNOTATOR — annotating images: the picture with its regions, a preview
  // to pick the next one from, and the Inspector for what a region became.
  {
    id: "annotator", labelKey: "ws.annotator", hintKey: "ws.annotatorHint",
    icon: "✎", windowType: "doc", builtin: true,
    arrangement: {
      wins: [
        // AUDIT N4 · the Annotator is the Doc window (one tracer)
        { name: "annotator", type: "doc" },
        { name: "viewer", type: "viewer" },
        { name: "inspector", type: "inspector" },
      ],
      layout: { dir: "row", ratio: 0.62, a: { win: "annotator" },
                b: { dir: "col", ratio: 0.5, a: { win: "viewer" },
                     b: { win: "inspector" } } },
    },
  },
];

const CUSTOM_KEY = "emstudio.workspaces.custom";

function loadCustom(): WorkspacePreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkspacePreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w) =>
        w && typeof w.id === "string" &&
        ![...BUILTIN_WORKSPACES, ...PARKED_WORKSPACES].some((b) => b.id === w.id),
    ).map((w) => ({
      // AUDIT N4 · an Annotator in a user's arrangement is a Doc window now
      ...w,
      windowType: w.windowType === "annotator" ? "doc" : w.windowType,
      arrangement: w.arrangement && Array.isArray(w.arrangement.wins)
        ? { ...w.arrangement, wins: w.arrangement.wins.map((x) => x.type === "annotator" ? { ...x, type: "doc" as WindowType } : x) }
        : w.arrangement,
    }));
  } catch {
    return [];
  }
}

/** Every workspace tab, built-ins first. Mutated by add/remove below — the tab
 *  bar reads it, so a new workspace is one entry and no markup. */
export const WORKSPACES: WorkspacePreset[] = [
  ...BUILTIN_WORKSPACES,
  ...loadCustom(),
];

function persistCustom(): void {
  try {
    localStorage.setItem(
      CUSTOM_KEY,
      JSON.stringify(WORKSPACES.filter((w) => !w.builtin)),
    );
  } catch {
    /* storage disabled */
  }
}

/** The label to put on a tab: a built-in asks the dictionary, a user workspace
 *  carries its own name (a name someone typed is not a translation). */
export function workspaceLabel(
  w: WorkspacePreset,
  t: (k: string) => string,
): string {
  return w.label ?? (w.labelKey ? t(w.labelKey) : w.id);
}

/**
 * HDR1 · make a new workspace, seeded from the arrangement you are looking at.
 *
 * Duplicating the current one rather than starting from a blank window: you make
 * a workspace when the thing in front of you is nearly right, and starting from
 * empty would throw away the reason you pressed the button.
 */
export function addWorkspace(label: string): WorkspacePreset {
  let n = WORKSPACES.length + 1;
  while (WORKSPACES.some((w) => w.id === `ws${n}`)) n++;
  const src = registry[active];
  const ws: WorkspacePreset = {
    id: `ws${n}`,
    label: label.trim() || `Workspace ${n}`,
    icon: "◈",
    windowType: activeWin().type,
  };
  WORKSPACES.push(ws);
  // deep copy: the new workspace must not share window objects with the old one,
  // or renaming a mode in either would change both
  registry[ws.id] = JSON.parse(JSON.stringify(src)) as WorkspaceWindows;
  persistCustom();
  persistWindows();
  return ws;
}

/** Rename a workspace the user made. Built-ins keep their dictionary label. */
export function renameWorkspace(id: WorkspaceId, label: string): boolean {
  const ws = WORKSPACES.find((w) => w.id === id);
  if (!ws || ws.builtin || !label.trim()) return false;
  ws.label = label.trim();
  persistCustom();
  return true;
}

/** Remove a workspace the user made. Built-ins stay. */
export function removeWorkspace(id: WorkspaceId): boolean {
  const i = WORKSPACES.findIndex((w) => w.id === id);
  if (i < 0 || WORKSPACES[i].builtin) return false;
  WORKSPACES.splice(i, 1);
  delete registry[id];
  if (active === id) active = WORKSPACES[0].id;
  persistCustom();
  persistWindows();
  return true;
}

/** Per-window-TYPE display metadata for the window header + transform dropdown
 *  (WIN1 checkpoint 2). DTC is a MODE of the graph window, so it is not a
 *  transform target here — it is reached from the header's Mode dropdown. */
export const WINDOW_TYPE_META: Record<WindowType, { icon: string; labelKey: string }> = {
  // STRUTTURA · `icon` is the line glyph of `window-icons.ts` (SVG markup), no
  // longer an emoji: the header, the type menu and the workspace tabs all set
  // it as markup, so the one change of drawing reaches all three.
  graph: { icon: windowIcon("graph"), labelKey: "win.graph" },
  narrative: { icon: windowIcon("narrative"), labelKey: "win.narrative" },
  table: { icon: windowIcon("table"), labelKey: "win.tabular" },
  doc: { icon: windowIcon("doc"), labelKey: "win.doc" },
  emtree: { icon: windowIcon("emtree"), labelKey: "win.emtree" },
  outliner: { icon: windowIcon("outliner"), labelKey: "win.outliner" },
  inspector: { icon: windowIcon("inspector"), labelKey: "win.inspector" },
  viewer: { icon: windowIcon("viewer"), labelKey: "win.viewer" },
  storage: { icon: windowIcon("storage"), labelKey: "win.storage" },
  annotator: { icon: windowIcon("annotator"), labelKey: "win.annotator" },
  shelf: { icon: windowIcon("shelf"), labelKey: "win.shelf" },
  study: { icon: windowIcon("study"), labelKey: "win.study" },
  "narrative-index": { icon: windowIcon("narrative-index"), labelKey: "win.narrativeIndex" },
  chronology: { icon: windowIcon("chronology"), labelKey: "win.chronology" },
};

/** The window type the active workspace currently shows — the ACTIVE window's
 *  own type (see the registry below), not the preset's, so a transformed or
 *  added window reports itself. */
export function activeWindowType(): WindowType {
  return activeWindowTypeOf();
}

const STORAGE_KEY = "emstudio.workspace";

function initial(): WorkspaceId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && WORKSPACES.some((w) => w.id === saved)) return saved as WorkspaceId;
  } catch {
    /* storage disabled */
  }
  return "canvas";
}

let active: WorkspaceId = initial();
const listeners: Array<(id: WorkspaceId) => void> = [];

export function activeWorkspace(): WorkspaceId {
  return active;
}

export function workspacePreset(id: WorkspaceId = active): WorkspacePreset {
  return WORKSPACES.find((w) => w.id === id) ?? WORKSPACES[0];
}

/** Set the active workspace (persisted) and notify. Idempotent. */
export function setActiveWorkspace(id: WorkspaceId): void {
  if (id === active || !WORKSPACES.some((w) => w.id === id)) return;
  active = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage disabled */
  }
  for (const fn of listeners) fn(id);
}

/** Reflect the active workspace WITHOUT notifying — used when the underlying
 *  mode changed by another route (e.g. the Narrative toolbar button) and the
 *  leader bar just needs to catch up. */
export function syncActiveWorkspace(id: WorkspaceId): void {
  if (id === active) return;
  active = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage disabled */
  }
}

export function onWorkspaceChange(fn: (id: WorkspaceId) => void): void {
  listeners.push(fn);
}

// ─────────────────────────── WIN2 · the window registry ──────────────────────
// Each workspace holds a LIST of window instances (one by default) and knows
// which is active. This is what makes the mode per-instance: two graph windows
// in the SAME workspace can sit in different projections, and switching between
// them restores each one's own mode. Still no free tiling (DP-82 D4) — one
// window is shown at a time and the header switches between them.

const WINDOWS_KEY = "emstudio.windows";

/** Arrangements by workspace id. An index signature, not a fixed Record: HDR1
 *  made the set of workspaces open-ended. */
type Registry = Record<WorkspaceId, WorkspaceWindows>;

/**
 * WIN5 · the spatial arrangement of a workspace: a binary split TREE, the same
 * shape Blender (and every tiling editor) uses.
 *
 *   leaf  → one window fills the area
 *   split → two areas side by side (`row`) or stacked (`col`), `ratio` being the
 *           fraction the FIRST child takes
 *
 * A tree rather than a list of rectangles because splitting and joining are then
 * local edits — split a leaf into a split, join a split back into one of its
 * children — with no coordinate arithmetic to keep consistent, and the geometry
 * falls out of nested flex boxes at render time.
 */
export type Pane =
  | { kind: "leaf"; winId: string }
  | { kind: "split"; dir: "row" | "col"; ratio: number; a: Pane; b: Pane };

interface WorkspaceWindows {
  wins: Win[];
  activeId: string;
  /** the arrangement; absent in layouts saved before WIN5 → rebuilt as a leaf */
  layout?: Pane;
  /** WIN7 · the window currently filling the workspace, if one is magnified */
  maxOf?: string;
  /** WIN7 · the arrangement to come back to when it is un-magnified */
  saved?: Pane;
}

function seedWindows(preset: WorkspacePreset): WorkspaceWindows {
  const win: Win = {
    id: `${preset.id}:1`,
    type: preset.windowType,
    state:
      preset.windowType === "graph"
        ? { mode: preset.graphMode ?? "matrix" }
        : {},
  };
  return { wins: [win], activeId: win.id, layout: { kind: "leaf", winId: win.id } };
}

function seedRegistry(): Registry {
  const out: Registry = {};
  for (const preset of WORKSPACES) out[preset.id] = seedWindows(preset);
  return out;
}

/**
 * SHIFT-A · the migration of a SAVED window (1 ott 2026).
 *
 * An EMtree window left on its `nodelist` tab WAS the outliner — the header even
 * said so — so it comes back as an `outliner` window, without the tab. An
 * Inspector left on the `logpanel` tab forgets it: the Log is a drawer of the
 * status bar now, and the Inspector has one panel. Pure, and idempotent: a
 * window already migrated passes through unchanged.
 */
export function migrateWin(w: Win): Win {
  const state = { ...(w.state ?? {}) };
  // AUDIT N4 · ONE TRACER: the Annotator is the Doc window now. The type stays
  // as an ALIAS, so a saved arrangement with an Annotator opens a Doc in its
  // place (its View/Annotate mode had no meaning in the Doc and is dropped).
  if (w.type === "annotator") {
    delete state["mode.annotator"];
    return { ...w, type: "doc", state };
  }
  if (w.type === "emtree" && state["current.panel"] === "nodelist") {
    delete state["current.panel"];
    return { ...w, type: "outliner", state };
  }
  if (w.type === "inspector" && state["current.panel"] === "logpanel") {
    delete state["current.panel"];
    return { ...w, state };
  }
  return w.state ? w : { ...w, state };
}

/** Set when `loadRegistry` migrated a saved window: the save is rewritten once,
 *  so what is on disk says what is on screen. */
let migratedOnLoad = false;

// ── COLLEGARE · what an arrangement IS, as one string ────────────────────────
//
// The shape (splits and their direction) and the windows at the leaves (type,
// and a graph window's projection). NOT the ratios: dragging a seam is using the
// arrangement, not changing it (the tab does not go italic because an area was
// made smaller). NOT a table's sheet either: that is what the window shows, and
// the header's own selectors change it.

function winSig(w: { type: WindowType; state?: Record<string, unknown> } | undefined): string {
  if (!w) return "?";
  return w.type === "graph" ? `graph:${String(w.state?.["mode"] ?? "matrix")}` : w.type;
}

/** The signature of a live arrangement (a tree of window ids + the windows). */
export function paneSignature(p: Pane, wins: readonly Win[]): string {
  if (p.kind === "leaf") return winSig(wins.find((w) => w.id === p.winId));
  return `${p.dir}(${paneSignature(p.a, wins)},${paneSignature(p.b, wins)})`;
}

/** …and of a declared one. */
export function arrangementSignature(a: Arrangement): string {
  const byName = new Map(a.wins.map((w) => [w.name, w]));
  const walk = (n: ArrangementNode): string =>
    "win" in n ? winSig(byName.get(n.win)) : `${n.dir}(${walk(n.a)},${walk(n.b)})`;
  return walk(a.layout);
}

/**
 * Has the user reshaped this built-in? Its tab then shows in italics with ↺.
 * A magnified window is a view of the arrangement, not a change to it: the
 * arrangement it will return to is what is compared.
 */
export function workspaceModified(ws: WorkspaceId = active): boolean {
  const preset = workspacePreset(ws);
  if (!preset.builtin || !preset.arrangement) return false;
  const entry = registry[ws];
  if (!entry) return false;
  const tree = entry.maxOf ? entry.saved : entry.layout;
  if (!tree || tree.kind === "leaf") return false; // not applied yet
  return paneSignature(tree, entry.wins) !== arrangementSignature(preset.arrangement);
}

/**
 * COLLEGARE · THE MIGRATION of the saved arrangements (3 ott 2026), line by line.
 *
 * | id | before | saved as the old preset left it | saved reshaped by the user |
 * |---|---|---|---|
 * | `canvas` | «Studio»: outliner · matrix · inspector | reseeded → Stratigrafia (with the warnings table) | kept, tab shows «modified» (↺ gives Stratigrafia) |
 * | `provenance` | parked: disk · DTC · inspector | reseeded → Fonti | kept, «modified» |
 * | `assets` | parked «Acquisizione»: disk · store · DTC · inspector | reseeded → Contenuti | kept, «modified» |
 * | `narrative` | parked: story · viewer | reseeded → Narrativa | kept, «modified» |
 * | `dtc`, `comparisons`, `annotator` | parked | still parked, carried through untouched | idem |
 * | a workspace the user made | its own | untouched | untouched |
 *
 * «Reseeded» = the saved entry is dropped, so the tab applies its new
 * arrangement the first time it is opened (`applyArrangement`, as for a fresh
 * install). An entry that is a single leaf was never arranged and is dropped too.
 * Runs once (`emstudio.workspaces.rev` < 2), and is pure so the check can run it.
 */
export const LEGACY_SIGNATURES: Record<string, string[]> = {
  canvas: ["row(outliner,row(graph:matrix,inspector))", "row(emtree,row(graph:matrix,inspector))"],
  provenance: ["row(storage,row(graph:dtc,inspector))"],
  assets: ["row(storage,row(storage,col(graph:dtc,inspector)))"],
  narrative: ["row(narrative,viewer)"],
};
export const WORKSPACES_REV = 2;
const REV_KEY = "emstudio.workspaces.rev";

export function migrateSavedArrangements(
  parsed: Record<string, unknown>,
): { parsed: Record<string, unknown>; reseeded: string[] } {
  const out = { ...parsed };
  const reseeded: string[] = [];
  for (const [ws, legacy] of Object.entries(LEGACY_SIGNATURES)) {
    const entry = out[ws] as Partial<WorkspaceWindows> | undefined;
    if (!entry || !Array.isArray(entry.wins)) continue;
    const tree = (entry.maxOf ? entry.saved : entry.layout) as Pane | undefined;
    const sig = tree ? paneSignature(tree, entry.wins as Win[]) : "";
    if (!tree || tree.kind === "leaf" || legacy.includes(sig)) {
      delete out[ws];
      reseeded.push(ws);
    }
  }
  return { parsed: out, reseeded };
}

/** Restore the registry, falling back to the seed for anything malformed — a
 *  corrupted arrangement must never keep the app from opening. */
function loadRegistry(): Registry {
  const seeded = seedRegistry();
  try {
    const raw = localStorage.getItem(WINDOWS_KEY);
    if (!raw) return seeded;
    let parsed = JSON.parse(raw) as Partial<Registry>;
    if (Number(localStorage.getItem(REV_KEY) ?? 0) < WORKSPACES_REV) {
      const m = migrateSavedArrangements(parsed as Record<string, unknown>);
      parsed = m.parsed as Partial<Registry>;
      if (m.reseeded.length) migratedOnLoad = true;
      localStorage.setItem(REV_KEY, String(WORKSPACES_REV));
    }
    for (const preset of WORKSPACES) {
      const entry = parsed[preset.id];
      if (!entry || !Array.isArray(entry.wins) || entry.wins.length === 0)
        continue;
      const wins = entry.wins.filter(
        (w) => w && typeof w.id === "string" && typeof w.type === "string",
      );
      if (!wins.length) continue;
      const migrated = wins.map((w) => migrateWin({ ...w, state: w.state ?? {} }));
      if (migrated.some((w, i) => w.type !== wins[i].type ||
          w.state["current.panel"] !== (wins[i].state ?? {})["current.panel"]))
        migratedOnLoad = true;
      const restored: WorkspaceWindows = {
        wins: migrated,
        activeId: wins.some((w) => w.id === entry.activeId)
          ? entry.activeId
          : wins[0].id,
      };
      // The tree is the authority on WHERE, the window list on WHAT: a restored
      // tree is pruned of ids that no longer exist and completed with windows it
      // never mentioned, so the two can never disagree after a bad save.
      //
      // WIN7 · a MAGNIFIED workspace is the one case where the tree deliberately
      // does not place every window: repairing the single leaf would re-append
      // the hidden ones and the magnification would be lost on reload. So the
      // repair is applied to the SAVED arrangement, and the leaf is rebuilt.
      const maxOf =
        typeof entry.maxOf === "string" && wins.some((w) => w.id === entry.maxOf)
          ? entry.maxOf
          : undefined;
      if (maxOf) {
        restored.saved = repairLayout(entry.saved, restored.wins);
        restored.maxOf = maxOf;
        restored.layout = { kind: "leaf", winId: maxOf };
      } else {
        restored.layout = repairLayout(entry.layout, restored.wins);
      }
      seeded[preset.id] = restored;
    }
  } catch {
    /* storage disabled or corrupted → seeded arrangement */
  }
  return seeded;
}

const registry = loadRegistry();

/**
 * The saved arrangements of the PARKED workspaces, carried through untouched.
 *
 * `loadRegistry` only rebuilds the workspaces in the bar, and `persistWindows`
 * writes the registry whole — so without this, the first save after the bar lost
 * six tabs would have erased six arrangements somebody shaped. Parking a tab is
 * a decision about the bar, not about the user's layouts.
 */
const parkedSaved: Record<string, unknown> = (() => {
  try {
    const raw = localStorage.getItem(WINDOWS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const p of PARKED_WORKSPACES) if (parsed[p.id]) out[p.id] = parsed[p.id];
    return out;
  } catch {
    return {};
  }
})();

// SHIFT-A · a migrated arrangement is written back once, at load
if (migratedOnLoad) queueMicrotask(() => persistWindows());

function persistWindows(): void {
  try {
    localStorage.setItem(WINDOWS_KEY, JSON.stringify({ ...parkedSaved, ...registry }));
  } catch {
    /* storage disabled */
  }
}

// ── WIN5 · tree helpers (pure: they answer questions / return new trees) ─────

/** Every window id the tree places, in left-to-right / top-to-bottom order. */
export function paneIds(p: Pane | undefined): string[] {
  if (!p) return [];
  return p.kind === "leaf" ? [p.winId] : [...paneIds(p.a), ...paneIds(p.b)];
}

/**
 * Make a tree that is guaranteed to place EXACTLY the given windows once each.
 *
 * Called on restore and after any window is added or closed. Windows the tree
 * forgot are appended as a split of the last leaf; ids it mentions that no
 * longer exist are pruned (a split with one dead child collapses into the
 * other). A corrupted arrangement therefore degrades to a usable one instead of
 * a blank screen.
 */
function repairLayout(p: Pane | undefined, wins: Win[]): Pane {
  const live = new Set(wins.map((w) => w.id));
  const prune = (n: Pane | undefined): Pane | null => {
    if (!n) return null;
    if (n.kind === "leaf") return live.has(n.winId) ? n : null;
    const a = prune(n.a);
    const b = prune(n.b);
    if (a && b) return { ...n, a, b };
    return a ?? b;
  };
  let tree = prune(p);
  const placed = new Set(paneIds(tree ?? undefined));
  for (const w of wins) {
    if (placed.has(w.id)) continue;
    const leaf: Pane = { kind: "leaf", winId: w.id };
    tree = tree ? { kind: "split", dir: "row", ratio: 0.5, a: tree, b: leaf } : leaf;
    placed.add(w.id);
  }
  return tree ?? { kind: "leaf", winId: wins[0].id };
}

/** Replace the leaf holding `winId` with `make(leaf)`. Returns a NEW tree. */
function mapLeaf(p: Pane, winId: string, make: (leaf: Pane) => Pane): Pane {
  if (p.kind === "leaf") return p.winId === winId ? make(p) : p;
  return { ...p, a: mapLeaf(p.a, winId, make), b: mapLeaf(p.b, winId, make) };
}

/** The arrangement of a workspace. */
export function layoutOf(ws: WorkspaceId = active): Pane {
  const entry = registry[ws];
  if (!entry.layout) entry.layout = repairLayout(undefined, entry.wins);
  return entry.layout;
}

/** True when the workspace shows more than one area. */
export function isTiled(ws: WorkspaceId = active): boolean {
  return layoutOf(ws).kind === "split";
}

/**
 * Split the area holding `winId` in two, putting a NEW window beside it, and
 * make the new one active. `dir: "row"` puts it to the right, `"col"` below.
 * The new window copies the type/state of the one it was split from — splitting
 * a DTC view to compare it with the matrix starts from what you were looking at.
 */
export function splitWindow(
  winId: string,
  dir: "row" | "col",
  ws: WorkspaceId = active,
  // STRUTTURA · the corner gesture cuts WHERE the pointer is, on the side of
  // the corner it started from. Defaults are the chips' behaviour (half, new
  // window after), so every existing caller and check-tiling read the same.
  ratio = 0.5,
  side: "a" | "b" = "b",
): Win | null {
  const entry = registry[ws];
  const src = entry.wins.find((w) => w.id === winId);
  if (!src) return null;
  endMagnification(ws); // shaping the arrangement brings the arrangement back
  const clone = addWindow(src.type, { ...src.state }, ws); // appends + activates
  // `addWindow` gave the clone a home of its own (any window must have one);
  // here we want it in a SPECIFIC place, so prune that provisional leaf first —
  // otherwise the clone would be placed twice and the tree would out-count the
  // window list.
  const base = repairLayout(
    entry.layout,
    entry.wins.filter((w) => w.id !== clone.id),
  );
  const fresh: Pane = { kind: "leaf", winId: clone.id };
  const r = Math.min(0.88, Math.max(0.12, ratio));
  entry.layout = mapLeaf(base, winId, (leaf) => ({
    kind: "split",
    dir,
    ratio: r,
    a: side === "a" ? fresh : leaf,
    b: side === "a" ? leaf : fresh,
  }));
  persistWindows();
  return clone;
}

/** True when this area sits inside a split — i.e. there is something to join. */
export function canJoin(winId: string, ws: WorkspaceId = active): boolean {
  const find = (p: Pane): boolean => {
    if (p.kind === "leaf") return false;
    if (paneIds(p.a).includes(winId) || paneIds(p.b).includes(winId)) {
      // only the split that DIRECTLY holds it as one of its two sides counts
      const direct =
        (p.a.kind === "leaf" && p.a.winId === winId) ||
        (p.b.kind === "leaf" && p.b.winId === winId);
      return direct || find(p.a) || find(p.b);
    }
    return false;
  };
  return find(layoutOf(ws));
}

/**
 * JOIN · this area absorbs its sibling — the split collapses and the space comes
 * back, the way dragging an area over its neighbour does in Blender.
 *
 * The sibling may be a whole sub-tree (an area that was itself split): every
 * window in it is closed, because after the join there is nowhere for them to
 * be. The area doing the joining always survives, so a workspace can never end
 * up with no window.
 */
export function joinWindow(winId: string, ws: WorkspaceId = active): boolean {
  const entry = registry[ws];
  endMagnification(ws);
  if (!canJoin(winId, ws)) return false;
  let absorbed: string[] = [];
  const walk = (p: Pane): Pane => {
    if (p.kind === "leaf") return p;
    if (p.a.kind === "leaf" && p.a.winId === winId) {
      absorbed = paneIds(p.b);
      return p.a;
    }
    if (p.b.kind === "leaf" && p.b.winId === winId) {
      absorbed = paneIds(p.a);
      return p.b;
    }
    return { ...p, a: walk(p.a), b: walk(p.b) };
  };
  entry.layout = walk(layoutOf(ws));
  if (absorbed.length) {
    const gone = new Set(absorbed);
    entry.wins = entry.wins.filter((w) => !gone.has(w.id));
  }
  entry.activeId = winId; // you are working in the area that stayed
  entry.layout = repairLayout(entry.layout, entry.wins);
  persistWindows();
  return true;
}

/**
 * The windows on the OTHER side of the split that directly holds `winId` — the
 * ones a join would absorb. Empty when the area is not inside a split.
 *
 * Used by the corner gesture: dragging an area's corner onto a neighbour joins
 * them, and "is that neighbour actually my sibling?" is the question that
 * decides whether the gesture means anything.
 */
export function siblingIdsOf(winId: string, ws: WorkspaceId = active): string[] {
  const walk = (p: Pane): string[] | null => {
    if (p.kind === "leaf") return null;
    if (p.a.kind === "leaf" && p.a.winId === winId) return paneIds(p.b);
    if (p.b.kind === "leaf" && p.b.winId === winId) return paneIds(p.a);
    return walk(p.a) ?? walk(p.b);
  };
  return walk(layoutOf(ws)) ?? [];
}

/** Move the divider of the split that contains `winId` as its FIRST child. */
export function setSplitRatio(
  winId: string,
  ratio: number,
  ws: WorkspaceId = active,
): void {
  const clamp = Math.min(0.85, Math.max(0.15, ratio)); // never collapse an area
  const walk = (p: Pane): Pane => {
    if (p.kind === "leaf") return p;
    const firstIds = paneIds(p.a);
    if (firstIds.includes(winId) && paneIds(p.b).length >= 1 && firstIds.length === 1)
      return { ...p, ratio: clamp };
    return { ...p, a: walk(p.a), b: walk(p.b) };
  };
  registry[ws].layout = walk(layoutOf(ws));
  persistWindows();
}

/** The pane at a PATH from the root ("" = root, "a"/"b" per level), or null. */
export function paneAt(path: string, ws: WorkspaceId = active): Pane | null {
  let p: Pane = layoutOf(ws);
  for (const c of path) {
    if (p.kind !== "split") return null;
    p = c === "a" ? p.a : p.b;
  }
  return p;
}

/** Replace the pane at a path. Returns a NEW tree. */
function replaceAt(p: Pane, path: string, make: (old: Pane) => Pane): Pane {
  if (!path) return make(p);
  if (p.kind !== "split") return p;
  return path[0] === "a"
    ? { ...p, a: replaceAt(p.a, path.slice(1), make) }
    : { ...p, b: replaceAt(p.b, path.slice(1), make) };
}

/**
 * STRUTTURA · move a divider by the PATH of its split — the name that is never
 * ambiguous (`setSplitRatio` keys on the first leaf, which two nested splits
 * can share, and which a split whose first side is itself split does not have
 * as a direct child: those dividers could not be dragged at all).
 */
export function setSplitRatioAt(path: string, ratio: number,
                                ws: WorkspaceId = active): void {
  const clamp = Math.min(0.9, Math.max(0.1, ratio));
  const at = paneAt(path, ws);
  if (!at || at.kind !== "split") return;
  registry[ws].layout = replaceAt(layoutOf(ws), path, (p) => ({ ...p, ratio: clamp }) as Pane);
  persistWindows();
}

/**
 * STRUTTURA · close one SIDE of a split: the divider dragged all the way over it
 * (the desk's `.seam` + `.closing`). Every window on that side goes, the other
 * side takes the space, and the focus lands in what stayed. Refused on the root
 * of a single window — there is no split to collapse.
 */
export function closeSplitSide(path: string, side: "a" | "b",
                               ws: WorkspaceId = active): string[] {
  const entry = registry[ws];
  endMagnification(ws);
  const at = paneAt(path, ws);
  if (!at || at.kind !== "split") return [];
  const gone = paneIds(side === "a" ? at.a : at.b);
  const keep = side === "a" ? at.b : at.a;
  entry.layout = replaceAt(layoutOf(ws), path, () => keep);
  const dead = new Set(gone);
  entry.wins = entry.wins.filter((w) => !dead.has(w.id));
  if (dead.has(entry.activeId)) entry.activeId = paneIds(keep)[0];
  entry.layout = repairLayout(entry.layout, entry.wins);
  persistWindows();
  return gone;
}

// ───────────────────────── WIN7 · magnify (full-screen area) ─────────────────
//
// One area fills the workspace and the others step aside — Blender's Ctrl+Space,
// and the gesture every tiling editor has, because an arrangement good for
// keeping four things in view is rarely the one you want while working on one.
//
// It is a STATE, not a rearrangement: the tree you had is kept whole in `saved`
// and put back untouched on the way out. That is why nothing is renegotiated —
// ratios, nesting and which window was where all survive, so magnifying is never
// a decision you have to undo by hand afterwards.
//
// The one place this cuts across the rest of the model is `repairLayout`, whose
// job is to place EVERY window: run on a magnified leaf it would re-append the
// hidden ones. So a structural edit (split, join, close, add, preset) ends the
// magnification first and operates on the real arrangement — you are shaping the
// arrangement, so the arrangement comes back.

/** The window filling the workspace, or null when the arrangement is showing. */
export function maximizedWin(ws: WorkspaceId = active): string | null {
  return registry[ws].maxOf ?? null;
}

/** Put the saved arrangement back. Returns false when nothing was magnified. */
function unmaximize(ws: WorkspaceId): boolean {
  const entry = registry[ws];
  if (!entry.maxOf) return false;
  entry.layout = repairLayout(entry.saved, entry.wins);
  entry.maxOf = undefined;
  entry.saved = undefined;
  return true;
}

/**
 * Magnify `winId` — or, if it is already magnified, come back.
 *
 * Magnifying also FOCUSES the window: an area alone on screen that does not take
 * the edits would be a picture of a window.
 */
export function toggleMaximize(winId: string, ws: WorkspaceId = active): boolean {
  const entry = registry[ws];
  if (!entry.wins.some((w) => w.id === winId)) return false;
  if (entry.maxOf === winId) {
    unmaximize(ws);
    persistWindows();
    return false;
  }
  // magnifying a second window while one is already magnified: swap, keeping the
  // arrangement that was saved the first time (it is still the one to return to)
  if (!entry.maxOf) entry.saved = entry.layout;
  entry.maxOf = winId;
  entry.activeId = winId;
  entry.layout = { kind: "leaf", winId };
  persistWindows();
  return true;
}

/** End any magnification before a structural edit. Internal to this module. */
function endMagnification(ws: WorkspaceId): void {
  if (unmaximize(ws)) persistWindows();
}

/**
 * Apply a tab's ARRANGEMENT — the one builder, reading the one declaration.
 *
 * There were two of these functions (an "IDE" one and an "assets" one) and the
 * six tabs would have needed six; they differ only in which existing window
 * types they place and in what ratio, so the difference is DATA
 * (`WorkspacePreset.arrangement`) and this is the code.
 *
 * A preset, not a cage: every area stays splittable, joinable and resizable, and
 * the arrangement persists as the user leaves it. Applied only when the tab has
 * no arrangement of its own yet — never on top of one somebody shaped.
 *
 * The workspace's existing first window is REUSED as the anchor (its id and its
 * remembered state survive), which is what makes re-seeding a tab keep its
 * identity instead of orphaning the window the rest of the shell is pointing at.
 */
export function applyArrangement(ws: WorkspaceId = active): boolean {
  const preset = workspacePreset(ws);
  const spec = preset.arrangement;
  if (!spec || !spec.wins.length) return false;
  const entry = registry[ws];
  entry.maxOf = undefined;   // the arrangement IS the shape: nothing to return to
  entry.saved = undefined;

  const anchor = entry.wins[0] ?? seedWindows(preset).wins[0];
  const byName = new Map<string, Win>();
  const wins: Win[] = [];
  spec.wins.forEach((w, i) => {
    const win: Win = i === 0
      ? anchor
      : { id: `${ws}:${w.name}`, type: w.type, state: {} };
    win.type = w.type;
    if (w.state) win.state = { ...win.state, ...w.state };
    byName.set(w.name, win);
    wins.push(win);
  });
  entry.wins = wins;
  entry.activeId = (spec.active && byName.get(spec.active)?.id) ?? wins[0].id;

  const build = (node: ArrangementNode): Pane => {
    if ("win" in node) {
      const win = byName.get(node.win);
      if (!win) throw new Error(`arrangement names a window it does not declare: ${node.win}`);
      return { kind: "leaf", winId: win.id };
    }
    return { kind: "split", dir: node.dir, ratio: node.ratio,
             a: build(node.a), b: build(node.b) };
  };
  entry.layout = build(spec.layout);
  persistWindows();
  return true;
}

/** Every window of a workspace, in creation order. */
export function windowsOf(ws: WorkspaceId = active): Win[] {
  return registry[ws].wins;
}

/** The window the workspace is currently showing. */
export function activeWin(ws: WorkspaceId = active): Win {
  const entry = registry[ws];
  return entry.wins.find((w) => w.id === entry.activeId) ?? entry.wins[0];
}

/** Show another window of the workspace. Returns it (unchanged if unknown). */
export function setActiveWin(winId: string, ws: WorkspaceId = active): Win {
  const entry = registry[ws];
  if (entry.wins.some((w) => w.id === winId)) {
    entry.activeId = winId;
    persistWindows();
  }
  return activeWin(ws);
}

/** Add a window to a workspace and make it active. Its id is stable across
 *  sessions (the workspace + a running number), so the persisted arrangement
 *  survives a reload. */
export function addWindow(
  type: WindowType,
  state: Record<string, unknown> = {},
  ws: WorkspaceId = active,
): Win {
  const entry = registry[ws];
  endMagnification(ws);
  let n = entry.wins.length + 1;
  while (entry.wins.some((w) => w.id === `${ws}:${n}`)) n++;
  const win: Win = { id: `${ws}:${n}`, type, state };
  entry.wins.push(win);
  entry.activeId = win.id;
  // WIN5 · a window that exists must have somewhere to be: repair places it.
  entry.layout = repairLayout(entry.layout, entry.wins);
  persistWindows();
  return win;
}

/** Close a window. The last one of a workspace is never closed — a workspace
 *  with no window would have nothing to show and no way back. */
export function closeWindow(winId: string, ws: WorkspaceId = active): boolean {
  const entry = registry[ws];
  if (entry.wins.length < 2) return false;
  endMagnification(ws);
  const i = entry.wins.findIndex((w) => w.id === winId);
  if (i < 0) return false;
  entry.wins.splice(i, 1);
  if (entry.activeId === winId)
    entry.activeId = entry.wins[Math.min(i, entry.wins.length - 1)].id;
  // WIN5 · closing an area JOINS its split: the sibling takes the space back.
  entry.layout = repairLayout(entry.layout, entry.wins);
  persistWindows();
  return true;
}

/** Transform a window IN PLACE: the same slot of the same workspace, a different
 *  editor. The workspace does NOT change — a Canvas workspace whose window was
 *  turned into a table is a legitimate arrangement, and jumping to another
 *  workspace instead would be a different gesture (that is the leader bar's). */
export function setWinType(win: Win, type: WindowType): void {
  if (win.type === type) return;
  win.type = type;
  // a graph window must always have a mode for the header to show
  if (type === "graph" && !win.state["mode"]) win.state["mode"] = "matrix";
  persistWindows();
}

/**
 * CURRENT-ELEMENT · the element a window is currently working ON — the chapter
 * in a Narrative window, the row in a Table window. (A Graph window already has
 * one: the canvas selection.)
 *
 * It lives on the WINDOW, next to the mode, because it is the same kind of fact:
 * two Narrative windows can sit on different chapters, and a menu item that acts
 * on "the current chapter" must mean the one in the window it was opened from.
 * UI state only — never em.json.
 */
export function winCurrent(win: Win, key: string): unknown {
  return win.state[`current.${key}`] ?? null;
}

export function setWinCurrent(win: Win, key: string, value: unknown): void {
  if (value == null) delete win.state[`current.${key}`];
  else win.state[`current.${key}`] = value;
  persistWindows();
}

/** The modes a window type offers (empty = no Mode selector for that type). */
export function winModes(type: WindowType): readonly string[] {
  return WINDOW_MODES[type] ?? [];
}

/** Where a window keeps its mode. The graph window's slot stays the bare
 *  `"mode"` it has always been — renaming it would silently reset every saved
 *  arrangement — and every other type gets its own, so transforming a window
 *  away and back finds the mode it was left in instead of the other type's. */
function modeKey(type: WindowType): string {
  return type === "graph" ? "mode" : `mode.${type}`;
}

/** A window's current mode, validated against its own type's list. An unknown
 *  or stale value falls back to the first mode rather than throwing: a window
 *  must always be showing something. */
export function winModeOf(win: Win): string {
  const modes = winModes(win.type);
  if (!modes.length) return "";
  const m = win.state[modeKey(win.type)];
  return modes.includes(m as string) ? (m as string) : modes[0];
}

/** Record a window's mode. Pure state — `main.ts` owns the mounting. Refuses a
 *  mode the type does not offer, so a caller cannot put a window in a mode its
 *  header could never show. */
export function setWinModeOf(win: Win, mode: string): boolean {
  if (!winModes(win.type).includes(mode) || winModeOf(win) === mode) return false;
  win.state[modeKey(win.type)] = mode;
  persistWindows();
  return true;
}

/** The mode of a graph window (its canvas projection) — the typed view of
 *  `winModeOf` the canvas code reads. */
export function winMode(win: Win): GraphMode {
  const m = win.state["mode"];
  return GRAPH_MODES.includes(m as GraphMode) ? (m as GraphMode) : "matrix";
}

/** Record a graph window's mode. */
export function setWinMode(win: Win, mode: GraphMode): void {
  if (win.type !== "graph") return;
  setWinModeOf(win, mode);
}

/** The window type the active workspace centres on — now the ACTIVE window's
 *  type, so a transformed window reports itself and not its preset. */
export function activeWindowTypeOf(ws: WorkspaceId = active): WindowType {
  return activeWin(ws).type;
}
