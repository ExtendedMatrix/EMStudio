/**
 * AUDIT N11 · THE KEY MAP — every key and gesture of the app, written ONCE, as
 * data. The Help ▸ Shortcuts window is generated from it (it listed 7 of about
 * 45), and it is searchable. Each row says where the key acts (`scope`): the
 * scopes are the ones `keyScopeOf` enforces in `main.ts` (a node shortcut acts
 * on the graph, never on a focused button or field).
 *
 * A new shortcut is a new row here. The i18n key of the row is `keys.<id>`.
 */
export type KeyScope = "app" | "graph" | "field" | "trace" | "window" | "menu";

export interface KeyRow {
  id: string;
  /** the keys as drawn (⌘ ⇧ ⌥ ⌃, words for gestures come from i18n `keyname.*`) */
  keys: string;
  scope: KeyScope;
}

export const KEYMAP: KeyRow[] = [
  // the app, wherever the focus is (a field keeps its letters)
  { id: "save", keys: "⌘S", scope: "app" },
  { id: "saveAs", keys: "⇧⌘S", scope: "app" },
  { id: "settings", keys: "⌘,", scope: "app" },
  { id: "undo", keys: "⌘Z", scope: "app" },
  { id: "redo", keys: "⇧⌘Z", scope: "app" },
  { id: "add", keys: "⇧A", scope: "app" },
  { id: "search", keys: "/", scope: "app" },
  { id: "magnify", keys: "⌃Space", scope: "app" },
  { id: "esc", keys: "Esc", scope: "app" },
  // the graph (canvas, Outliner rows, the page)
  { id: "delete", keys: "⌫ · Del", scope: "graph" },
  { id: "undoToast", keys: "@gesture.undoButton", scope: "graph" },
  { id: "nudge", keys: "← → ↑ ↓", scope: "graph" },
  { id: "nudge10", keys: "⇧ ← → ↑ ↓", scope: "graph" },
  { id: "fit", keys: "0", scope: "graph" },
  { id: "zoomIn", keys: "+ · =", scope: "graph" },
  { id: "zoomOut", keys: "−", scope: "graph" },
  { id: "pan", keys: "@gesture.spaceDrag", scope: "graph" },
  { id: "panMiddle", keys: "@gesture.middleDrag", scope: "graph" },
  { id: "wheel", keys: "@gesture.wheel", scope: "graph" },
  { id: "click", keys: "@gesture.click", scope: "graph" },
  { id: "multi", keys: "@gesture.multiClick", scope: "graph" },
  { id: "marquee", keys: "@gesture.dragEmpty", scope: "graph" },
  { id: "dblGroup", keys: "@gesture.dblclick", scope: "graph" },
  { id: "connect", keys: "@gesture.dragHandle", scope: "graph" },
  { id: "connectMenu", keys: "@gesture.shiftRelease", scope: "graph" },
  { id: "detach", keys: "@gesture.shiftDrag", scope: "graph" },
  { id: "laneOnly", keys: "@gesture.altDrop", scope: "graph" },
  { id: "dragEsc", keys: "@gesture.escDrag", scope: "graph" },
  { id: "rclick", keys: "@gesture.rclick", scope: "graph" },
  { id: "laneMenu", keys: "@gesture.rclickLane", scope: "graph" },
  { id: "longPress", keys: "@gesture.longPress", scope: "graph" },
  { id: "layoutFresh", keys: "@gesture.altLayout", scope: "graph" },
  // tracing in the Doc window
  { id: "toolEsc", keys: "Esc", scope: "trace" },
  { id: "polyClose", keys: "@gesture.enterDbl", scope: "trace" },
  { id: "polyFirst", keys: "@gesture.firstVertex", scope: "trace" },
  { id: "bubbleArrows", keys: "↑ ↓ · Enter", scope: "trace" },
  // windows and spaces
  { id: "corner", keys: "@gesture.dragCorner", scope: "window" },
  { id: "divider", keys: "@gesture.dragDivider", scope: "window" },
  { id: "headerDbl", keys: "@gesture.dblBar", scope: "window" },
  { id: "tabDbl", keys: "@gesture.dblTab", scope: "window" },
  { id: "tabMenu", keys: "@gesture.rclickTab", scope: "window" },
  { id: "storagePick", keys: "@gesture.cmdShiftClick", scope: "window" },
  { id: "folderClick", keys: "@gesture.clickFolder", scope: "window" },
  // in fields and menus
  { id: "fieldEnter", keys: "Enter", scope: "field" },
  { id: "fieldTab", keys: "Tab", scope: "field" },
  { id: "proseSlash", keys: "/", scope: "field" },
  { id: "proseLink", keys: "[[", scope: "field" },
  { id: "menuArrows", keys: "↑ ↓ → ← Enter", scope: "menu" },
  { id: "buttonSpace", keys: "Space · Enter", scope: "menu" },
];

/** The keys as a person reads them: `@gesture.*` is a word, in their language. */
export function keysText(r: KeyRow, t: (k: string) => string): string {
  return r.keys.startsWith("@") ? t(r.keys.slice(1)) : r.keys;
}

/** The rows whose keys or words contain every word of `q` (case-insensitive). */
export function filterKeymap(rows: KeyRow[], q: string, label: (r: KeyRow) => string): KeyRow[] {
  const toks = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return rows;
  return rows.filter((r) => {
    const text = `${r.keys} ${label(r)}`.toLowerCase();   // label = keys text + what
    return toks.every((t) => text.includes(t));
  });
}
