/**
 * STRUTTURA · the window icons: ONE line glyph per window type, in the stroke of
 * the text (scrivania v5 `ICO` / `wico`).
 *
 * They replace the emoji and box glyphs `WINDOW_TYPE_META` carried (🗄, ▤▤, ◉…),
 * which rendered in a different font on every platform and read as three
 * different visual languages in one bar. 16 px, `stroke: currentColor`,
 * `stroke-width 1.5`, round ends: the icon takes the colour of the label beside
 * it, in both themes, with no rule of its own.
 *
 * The nine drawn on the desk are copied as they are. `emtree`, `annotator` and
 * `study` had no drawing there; they are drawn here in the same stroke:
 *  · emtree    — a tree of slots: the graphs of the workspace, one active;
 *  · annotator — a picture with a dashed region traced on it;
 *  · study     — a pin: what the canvas IS, down to where the site is.
 *
 * Pure data + one string builder: no DOM, so `workspace.ts` can hold them.
 */
import { LAB } from "./features";

export const WINDOW_ICON_PATHS: Record<string, string> = {
  outliner: '<path d="M3 4h10M6 8h7M6 12h7M3 8h0M3 12h0"/>',
  graph: '<circle cx="4" cy="4" r="1.8"/><circle cx="12" cy="6" r="1.8"/><circle cx="6" cy="12.5" r="1.8"/><path d="M5.6 4.6 10.3 5.6M11 7.6 7.2 11.2M4.4 5.8 5.5 10.7"/>',
  table: '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M2.5 9.8h11M6.5 3v10"/>',
  inspector: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M8 7.2v4M8 4.9v.1"/>',
  viewer: '<path d="M8 2.5 13.5 5.5v5L8 13.5 2.5 10.5v-5z"/><path d="M2.5 5.5 8 8.5l5.5-3M8 8.5v5"/>',
  doc: '<path d="M4 2.5h5.5L12.5 5.5v8h-8.5z"/><path d="M9.5 2.5v3h3M6 8.5h4.5M6 11h4.5"/>',
  shelf: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  storage: '<ellipse cx="8" cy="4" rx="5" ry="1.8"/><path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4M3 8c0 1 2.2 1.8 5 1.8S13 9 13 8"/>',
  narrative: '<path d="M2.5 3.5c2-.8 3.8-.6 5.5.6 1.7-1.2 3.5-1.4 5.5-.6v9c-2-.8-3.8-.6-5.5.6-1.7-1.2-3.5-1.4-5.5-.6zM8 4.1v9"/>',
  // drawn tonight, same stroke
  emtree: '<rect x="2.5" y="2.5" width="5" height="3" rx="1"/><path d="M5 5.5v7M5 8.5h3.5M5 12.5h3.5"/><rect x="8.5" y="7" width="5" height="3" rx="1"/><rect x="8.5" y="11" width="5" height="3" rx="1"/>',
  "narrative-index": '<path d="M3 3.5h2M3 8h2M3 12.5h2M7 3.5h6M7 8h6M7 12.5h4"/>',
  // AUDIT N5 · the chronology: bars on a time axis, one of them nested
  chronology: '<path d="M2.5 13.5h11M3.5 4h6M5.5 7h7M7 10h3.5"/>',
  // SPAZIO · the Scena 3D: a block in space
  scene: '<path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z"/><path d="M2.5 5 8 8.2 13.5 5M8 8.2v6"/>',
  // MICRO-G-SCHEDE · the scheda: a sheet with its boxes
  sheet: '<rect x="3" y="2.5" width="10" height="11" rx="1"/><path d="M3 6h10M3 9.5h10M7.5 6v7.5"/>',
  // MICRO-PL25 · a plugin's declarative panel: a card with fields and a button
  "plugin-panel": '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5 5.5h6M5 8h6"/><rect x="5" y="10" width="3.5" height="1.6" rx=".6"/>',
  // MICRO-TIL002 · the Python console: a prompt and its cursor
  console: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M4.5 6.5 6.5 8l-2 1.5M8 10.5h3"/>',
  // MICRO-TIL002 · the Script Editor: a page with its lines numbered
  script: '<path d="M4 2.5h8.5v11H4z"/><path d="M6 5.5h4.5M6 8h4.5M6 10.5h3M2.5 5.5h0M2.5 8h0M2.5 10.5h0"/>',
  study: '<path d="M8 13.8s4.5-3.9 4.5-7.3a4.5 4.5 0 0 0-9 0c0 3.4 4.5 7.3 4.5 7.3z"/><circle cx="8" cy="6.4" r="1.6"/>',
  // RIFINITURE · not a window: the ✦ of «ask the AI», in the same stroke, so
  // the glyph is the same on every platform (the text ✦ is not)
  ai: '<path d="M8 2.5 9.2 6.8 13.5 8 9.2 9.2 8 13.5 6.8 9.2 2.5 8 6.8 6.8z"/>',
  // MICRO-MF01 · EMBARGO (lab only) · the Functional Matrix: two braces, the
  // glyph of a functional unit (U6-bis)
  ...(LAB ? { "functional-matrix": '<path d="M6 2.5c-1.4 0-2 .6-2 2v2c0 .9-.5 1.5-1.5 1.5 1 0 1.5.6 1.5 1.5v2c0 1.4.6 2 2 2M10 2.5c1.4 0 2 .6 2 2v2c0 .9.5 1.5 1.5 1.5-1 0-1.5.6-1.5 1.5v2c0 1.4-.6 2-2 2"/>',
              // MICRO-MF03 · the Landscape Matrix: three columns of braces, a hexagon
              "landscape-matrix": '<path d="M2.5 3h3M2.5 7h3M10.5 3h3M10.5 9h3M6.5 3v10M9.5 3v10"/><path d="M3 12l1-1.5h1.5l1 1.5-1 1.5H4z"/>' } : {}),
};

/** The 16 px SVG for a window type (empty box for an unknown one). */
export function windowIcon(type: string, size = 16): string {
  return `<svg class="wico" viewBox="0 0 16 16" width="${size}" height="${size}" ` +
    'aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    `stroke-linecap="round" stroke-linejoin="round">${WINDOW_ICON_PATHS[type] ?? ""}</svg>`;
}
