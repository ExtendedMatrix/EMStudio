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
  annotator: '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M5 6h6v4.5H5z" stroke-dasharray="1.6 1.5"/>',
  "narrative-index": '<path d="M3 3.5h2M3 8h2M3 12.5h2M7 3.5h6M7 8h6M7 12.5h4"/>',
  study: '<path d="M8 13.8s4.5-3.9 4.5-7.3a4.5 4.5 0 0 0-9 0c0 3.4 4.5 7.3 4.5 7.3z"/><circle cx="8" cy="6.4" r="1.6"/>',
};

/** The 16 px SVG for a window type (empty box for an unknown one). */
export function windowIcon(type: string, size = 16): string {
  return `<svg class="wico" viewBox="0 0 16 16" width="${size}" height="${size}" ` +
    'aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    `stroke-linecap="round" stroke-linejoin="round">${WINDOW_ICON_PATHS[type] ?? ""}</svg>`;
}
