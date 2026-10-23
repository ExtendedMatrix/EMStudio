// MICRO-GLIFI-OVERLAY-CONTINUITA p.1 · a unit's decorative glyphs never
// outgrow it: the ceiling (GLYPH_MAX_RATIO of the unit on screen), the hiding
// from afar (GLYPH_HIDE_UNIT_PX), and «Hide glyphs from afar» remembered with
// the overlays of a view.
//
//   node scripts/check-glyph-scale.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (f) => {
  const bundle = await esbuild.build({ entryPoints: [`${SRC}${f}`], bundle: true, format: "esm", write: false });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}#${Math.random()}`);
};
const G = await load("glyph-scale.ts");
const O = await load("overlays.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const near = (got, want, what) => { assert.ok(Math.abs(got - want) < 1e-6, `${what} — got ${got}, want ${want}`); checks++; };

// ── the constants, named ─────────────────────────────────────────────────────
eq(G.GLYPH_MAX_RATIO, 0.75, "k = 0.75: at scale 0.6 (E.D.'s zoom) the PD chip is 14 px on a 19.2 px unit, 0.73");
eq(G.GLYPH_HIDE_UNIT_PX, 10, "glyphs hidden under a 10 px unit (names stop at 11.2 px)");
eq(G.UNIT_REF_WORLD, 32, "a unit's measure: its smaller side, at most a unit's height");

// ── the unit on screen ───────────────────────────────────────────────────────
near(G.unitScreenPx(90, 32, 0.6), 19.2, "a 90×32 unit at 0.6: 19.2 px");
near(G.unitScreenPx(20.352, 32, 1), 20.352, "a document's sheet: its width");
near(G.unitScreenPx(860, 1172, 0.5), 16, "a group's container counts as a unit's header");

// ── the ceiling ──────────────────────────────────────────────────────────────
near(G.cappedGlyphPx(14, 19.2), 14, "at the approved zoom the PD chip is untouched");
near(G.cappedGlyphPx(14, 41.6), 14, "near: untouched");
near(G.cappedGlyphPx(14, 12.8), 9.6, "at 0.4 the 14 px floor becomes 9.6 px (0.75 × 12.8)");
near(G.cappedGlyphPx(14, 6.4), 4.8, "at 0.2 (kept from afar): 4.8 px");
near(G.glyphFactor(14, 12.8), 9.6 / 14, "the factor of the warning disc at 0.4");
near(G.glyphFactor(8, 40), 1, "a glyph smaller than the ceiling: factor 1");
for (const u of [1, 5, 10, 12.8, 19.2, 30, 100]) for (const g of [3, 7, 12, 14, 18]) {
  const c = G.cappedGlyphPx(g, u);
  ok(c <= g + 1e-9 && c <= 0.75 * u + 1e-9, `never larger than today (${g}) nor than 0.75 × ${u}`);
}

// ── hidden from afar ─────────────────────────────────────────────────────────
ok(G.glyphsHidden(6.4, true), "at 0.2 a unit is 6.4 px: hidden");
ok(!G.glyphsHidden(12.8, true), "at 0.4 (12.8 px): drawn");
ok(!G.glyphsHidden(6.4, false), "«Hide glyphs from afar» off: kept");

// ── the switch, in the overlays of a view ────────────────────────────────────
{
  const d = O.defaultOverlays("matrix");
  ok(O.farGlyphsHidden(d), "by default the glyphs from afar are hidden");
  ok(O.farGlyphsHidden(null), "no state: hidden");
  const kept = O.withHideFar(d, false);
  ok(!O.farGlyphsHidden(kept), "switched off: kept");
  ok(O.farGlyphsHidden(O.withHideFar(kept, true)), "switched on again: hidden");
  O.saveOverlays("0000-0001", "matrix", kept);
  ok(!O.farGlyphsHidden(O.loadOverlays("0000-0001", "matrix")), "remembered for the person and the view");
  ok(O.farGlyphsHidden(O.loadOverlays("0000-0001", "graph")), "another view keeps its default");
  ok(!O.farGlyphsHidden(O.withOverlay(O.loadOverlays("0000-0001", "matrix"), "lock", false)), "switching an overlay keeps the choice");
  ok(!O.farGlyphsHidden(O.withValue(kept, "s3_opacity_proxy", 0.42)), "a slider back to its default keeps the choice");
  O.saveOverlays("0000-0001", "matrix", O.withHideFar(kept, true));
  eq(JSON.parse(mem.get(O.OVERLAYS_KEY))["0000-0001"]?.matrix, undefined, "back to the default: forgotten");
}

console.log(`check-glyph-scale: ${checks} checks ✓`);
