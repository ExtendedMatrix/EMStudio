// MICRO-GLIFI-OVERLAY-CONTINUITA p.1 · the decorative glyphs of a unit (the
// paradata chip and tablet, «has 3D», the 3D format, the warning, the AI chip,
// the genre letter, the lock, the count of a closed group…) never outgrow the
// unit they hang on.
//
// Measured on dev.59 (the GT16's Matrix): some of them keep a constant size on
// screen (the PD chip has a 14 px floor, the warning is 14 px across, the lock
// 12 px, the AI chip shrinks as √zoom), so zooming out the units shrink and the
// glyphs do not — the Matrix becomes a field of orange chips. At the zoom E.D.
// approves (scale 0.6: USV132 and T41 legible, a unit 19 px high) the PD chip
// is 14 px, 0.73 of the unit. That proportion is the ceiling:
//
//     on screen = min(today's size, GLYPH_MAX_RATIO × the unit on screen)
//
// and below GLYPH_HIDE_UNIT_PX (a unit a few pixels high, where a name is not
// drawn either) the glyphs are not drawn at all — unless the person keeps them
// («Hide glyphs from afar», on by default: the overlays' `keepFar`).
//
// Pure: no DOM (scripts/check-glyph-scale.mjs).

/** a glyph is at most this fraction of its unit's height on screen */
export const GLYPH_MAX_RATIO = 0.75;
/** below this height on screen (px) a unit's glyphs are hidden: the names stop
 *  at scale 0.35 (11 px for a 32-unit box), the glyphs a little after */
export const GLYPH_HIDE_UNIT_PX = 10;
/** the measure of a unit, in world units: its drawn box's smaller side, and
 *  never more than a unit's height (a group's container counts as its header) */
export const UNIT_REF_WORLD = 32;

/** the unit's measure on screen (px): the smaller side of what is drawn */
export function unitScreenPx(w: number, h: number, scale: number): number {
  return Math.max(0, Math.min(w, h, UNIT_REF_WORLD) * scale);
}

/** the size a glyph is drawn at (px): today's, or the ceiling if smaller */
export function cappedGlyphPx(todayPx: number, unitPx: number): number {
  return Math.max(0, Math.min(todayPx, GLYPH_MAX_RATIO * unitPx));
}

/** the factor that turns today's size into the capped one (1 = untouched) */
export function glyphFactor(todayPx: number, unitPx: number): number {
  return todayPx > 0 ? cappedGlyphPx(todayPx, unitPx) / todayPx : 1;
}

/** are this unit's glyphs hidden? (`hideFar` false: they are kept, capped) */
export function glyphsHidden(unitPx: number, hideFar: boolean): boolean {
  return hideFar && unitPx < GLYPH_HIDE_UNIT_PX;
}
