// The small picture of a node type, for the lists that NAME types (the
// «Aggiungi» menu first). Icons are the official s3Dgraphy 2D assets
// (JSON_config/src/2D), inlined at build time; types without an official icon
// fall back to a drawn swatch in the type's own colours, groups to the canonical
// container box. Everything is read from the visual rules — never hardcoded.
//
// This file was `palette-ui.ts`, the node palette. The palette left with SHIFT-A
// (1 ott 2026): a node is added at the cursor from the «Aggiungi» menu. Its
// authoring surface (`SECTIONS`) and its hover card moved to `add-menu.ts` and
// `add-menu-ui.ts`; what stays here is the part every type list needs.
import { nodeStyle } from "./palette";
import { dtcGlyphName, isGroupType } from "./rules";
import { glyphByKey, glyphSvg, type Glyph, type GlyphInk } from "./glyphs";
import { activeTheme, canvasTheme } from "./theme";

import { dtcGlyphUrl, iconUrlFor } from "./icons";

/**
 * The picture of a type: a group is its container box, a type with an official
 * 2D icon is that icon, a DTC item its kind's glyph, anything else a swatch.
 */
export function typeIconElement(nodeType: string, kind?: string): HTMLElement {
  if (isGroupType(nodeType)) return groupSwatch(nodeType);
  // SHIFT-A fase 6b · a type the datamodel draws from paths is the SAME paths
  // here, inline — sharp, themed, and the file it used to load is not needed
  const g = glyphByKey(kind ? `dtc:${kind}` : nodeType);
  if (g) return glyphElement(g);
  const url = kind ? dtcGlyphUrl(dtcGlyphName(kind)) : iconUrlFor(nodeType);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    return img;
  }
  return swatch(nodeType);
}

/** The theme's colours for the recolourable roles of a glyph drawn in the DOM —
 *  the same rule as the canvas (`renderer.ts::glyphInk`). */
export function domGlyphInk(): GlyphInk {
  const th = canvasTheme();
  return { ink: th.labelInk, paper: th.canvasBg, dark: activeTheme() === "dark" };
}

/** A glyph as an inline `<svg>` in a span the lists size with CSS. */
export function glyphElement(g: Glyph): HTMLElement {
  const span = document.createElement("span");
  span.className = "glyph-inline";
  span.innerHTML = glyphSvg(g, domGlyphInk());
  return span;
}

/** The markup of a type's glyph, for the lists that write HTML (the search):
 *  inline paths when the datamodel has them, else null. */
export function glyphMarkupFor(nodeType: string): string | null {
  const g = glyphByKey(nodeType);
  return g ? glyphSvg(g, domGlyphInk()) : null;
}

function swatch(nodeType: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = 26 * dpr;
  c.height = 16 * dpr;
  c.style.width = "26px";
  c.style.height = "16px";
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const st = nodeStyle(nodeType);
  // tiny generic swatch: rounded rect is fine at this size except for the
  // strongly-shaped types where the real silhouette reads better
  ctx.beginPath();
  switch (st.shape) {
    case "hexagon":
      ctx.moveTo(5, 1);
      ctx.lineTo(21, 1);
      ctx.lineTo(25, 8);
      ctx.lineTo(21, 15);
      ctx.lineTo(5, 15);
      ctx.lineTo(1, 8);
      ctx.closePath();
      break;
    case "octagon":
      ctx.moveTo(5, 1);
      ctx.lineTo(21, 1);
      ctx.lineTo(25, 5);
      ctx.lineTo(25, 11);
      ctx.lineTo(21, 15);
      ctx.lineTo(5, 15);
      ctx.lineTo(1, 11);
      ctx.lineTo(1, 5);
      ctx.closePath();
      break;
    case "ellipse":
    case "circle":
      ctx.ellipse(13, 8, 12, 7, 0, 0, Math.PI * 2);
      break;
    case "diamond":
      ctx.moveTo(13, 1);
      ctx.lineTo(25, 8);
      ctx.lineTo(13, 15);
      ctx.lineTo(1, 8);
      ctx.closePath();
      break;
    case "parallelogram":
      ctx.moveTo(5, 1);
      ctx.lineTo(25, 1);
      ctx.lineTo(21, 15);
      ctx.lineTo(1, 15);
      ctx.closePath();
      break;
    case "triangle":
      ctx.moveTo(13, 1);
      ctx.lineTo(25, 15);
      ctx.lineTo(1, 15);
      ctx.closePath();
      break;
    case "corner_brackets": {
      // POL4 · four L ticks, no continuous edge; unclosed on purpose so the fill
      // below paints nothing (a filled corner would invent the surface a
      // negative unit does not have)
      const t = 4.5;
      ctx.moveTo(1, 1 + t); ctx.lineTo(1, 1); ctx.lineTo(1 + t, 1);
      ctx.moveTo(25 - t, 1); ctx.lineTo(25, 1); ctx.lineTo(25, 1 + t);
      ctx.moveTo(25, 15 - t); ctx.lineTo(25, 15); ctx.lineTo(25 - t, 15);
      ctx.moveTo(1 + t, 15); ctx.lineTo(1, 15); ctx.lineTo(1, 15 - t);
      break;
    }
    default:
      ctx.roundRect(1, 1, 24, 14, 3);
  }
  ctx.fillStyle = st.fill;
  ctx.fill();
  ctx.strokeStyle = st.border;
  // border weight tracks the visual-rules border_width (data-driven) so the
  // thick EM frame reads in the swatch too, clamped to this tiny 26×16 canvas.
  ctx.lineWidth = Math.min(2.4, Math.max(1.4, st.borderWidth * 0.6));
  if (st.borderStyle === "dashed") ctx.setLineDash([3, 2]);
  else if (st.borderStyle === "dotted") ctx.setLineDash([1.5, 1.5]);
  ctx.stroke();
  return c;
}

// NodeGroups (Activity/Paradata/TimeBranch/Location) are CONTAINERS, not
// node shapes — the generic swatch drew them as anonymous rectangles. Draw
// them as the canonical EM/yEd group box: a dashed coloured container with a
// title tab in the top-left corner. Colours come straight from the visual
// rules (never hardcoded): Activity=purple, Paradata/TimeBranch=grey,
// Location=black/light.
function groupSwatch(nodeType: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = 26 * dpr;
  c.height = 16 * dpr;
  c.style.width = "26px";
  c.style.height = "16px";
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const st = nodeStyle(nodeType);
  const x = 1.5,
    y = 2.5,
    w = 23,
    h = 12,
    r = 2.5;
  // container body
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = st.fill;
  ctx.fill();
  ctx.strokeStyle = st.border;
  ctx.lineWidth = 1.4;
  ctx.setLineDash(st.borderStyle === "dotted" ? [1.5, 1.5] : [3, 2]);
  ctx.stroke();
  // title tab → the canonical group colour (em_visual_rules label_background:
  // Activity cyan, Paradata peach, TimeBranch green, Location light-grey);
  // falls back to the border colour if a group has no tab colour.
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.roundRect(x, y, 13, 4.5, [r, r, 0, 0]);
  ctx.fillStyle = st.labelBackground ?? st.border;
  ctx.fill();
  // thin outline on the tab so pale tabs stay visible on the white body
  ctx.lineWidth = 0.8;
  ctx.setLineDash([]);
  ctx.strokeStyle = st.border;
  ctx.stroke();
  return c;
}
