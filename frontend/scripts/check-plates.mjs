// MICRO-GLIFI-OVERLAY-CONTINUITA p.5 · the PLATE of every type drawn as a glyph
// (selection wash and ring, hover, peers, volatile ring, click) has the glyph's
// shape: for each glyph — the types the datamodel draws, the DTC kinds, the
// glyphs taken from the data (proxy, versions, tileset, RM container), the
// HDT-O types, the document's sheet — in the boxes the Matrix (90 × 32 and the
// em-core glyph box), the DTC and the Graphs paradata (120 × 34) give it, the
// plate (`plateOf` → `visibleBoxOf`) is the rect the renderer draws the glyph
// in (`drawnGlyphRect`). In the liquid Graph the plate is the disc.
//
//   node scripts/check-plates.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { window, document } = parseHTML(`<!doctype html><html><body></body></html>`);
globalThis.window = window;
globalThis.document = document;
window.devicePixelRatio = 1;

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `
      export { drawnGlyphRect, plateOf } from "./plate";
      export { glyphFor, dataGlyphKey } from "./glyphs";
      export { drawsAsGlyph } from "./shape-geom";
      export { HDTO_GLYPH_TYPES } from "./hdto-glyphs";
    `, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, loader: { ".woff2": "empty", ".ttf": "empty" },
  // icons.ts reads its bitmaps through Vite's import.meta.glob: the types it
  // draws as icons are the datamodel's own list (as check-glyphs does)
  plugins: [{ name: "stub-icons", setup(build) {
    build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `
      import rules from "${SRC}assets/em_visual_rules.json";
      export const ICON_NODE_TYPES = new Set(rules["2d_render_glyph_types"].types);
      const img = { complete: true, naturalWidth: 32, naturalHeight: 32, src: "stub.png" };
      export const imageFor = () => img; export const imageForUrl = () => img; export const iconUrlFor = () => "stub.png";
      export const dtcGlyphUrl = (b) => (b ? "stub.svg" : null); export const crispImage = (i) => i; export const setIconRedraw = () => {};
    `, loader: "ts", resolveDir: SRC }));
  } }],
});
const M = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`).catch((e) => { console.error("bundle:", String(e.message ?? e).slice(0, 300)); process.exit(1); });
const rules = JSON.parse(readFileSync(`${SRC}assets/em_visual_rules.json`, "utf8"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

// every glyph a node can be drawn with, and a node that takes it
const R = rules["2d_render_glyph_types"];
const cases = [];
for (const t of R.types) cases.push({ key: t, type: t, data: {} });
for (const k of Object.keys(rules["2d_glyphs"]).filter((k) => k.startsWith("dtc:")))
  cases.push({ key: k, type: "link", data: { dtc_kind: k.slice(4) } });
for (const [k, spec] of Object.entries(R.data_glyphs).filter(([k]) => !k.startsWith("_")))
  for (const alt of spec.when) {
    const data = {};
    let type = "resource";
    for (const [f, vals] of Object.entries(alt)) {
      if (f === "node_type") type = vals[0];
      else if (f === "url_ext") data.url = `/x/model${vals[0]}`;
      else if (f === "url_name") data.url = `/x/${vals[0]}`;
      else data[f.slice(5)] = vals[0];
    }
    cases.push({ key: k, type, data });
  }
for (const t of M.HDTO_GLYPH_TYPES) cases.push({ key: t, type: t, data: {} });
cases.push({ key: "document", type: "document", data: {} });

const boxes = { "Matrix 90×32": [90, 32], "Matrix glyph box 32×32": [32, 32], "DTC / Graphs paradata 120×34": [120, 34], "Matrix document 20.35×32": [20.352, 32] };
const seen = new Set();
for (const c of cases) {
  const g = c.type === "document" ? true : M.glyphFor(c.type, c.data);
  ok(!!g, `${c.key}: drawn as a glyph`);
  // the data glyph a case stands for is the one the datamodel picks
  if (R.data_glyphs[c.key]) ok(M.dataGlyphKey(c.type, c.data) === c.key || M.glyphFor(c.type, c.data)?.key === c.key, `${c.key}: its data picks it`);
  ok(M.drawsAsGlyph(c.type, c.data), `${c.key} (${c.type}): the hit test and the plate know it is a glyph`);
  for (const [label, [w, h]] of Object.entries(boxes)) {
    const sn = { id: "n", x: 10, y: 20, w, h, node: { id: "n", node_type: c.type, data: c.data } };
    const gr = M.drawnGlyphRect(sn);
    const pl = M.plateOf(null, sn);
    ok(!!gr, `${c.key} in ${label}: a drawn rect`);
    const same = Math.abs(gr.x - pl.x) < 0.01 && Math.abs(gr.y - pl.y) < 0.01 && Math.abs(gr.w - pl.w) < 0.01 && Math.abs(gr.h - pl.h) < 0.01;
    ok(same, `${c.key} (${c.type}) in ${label}: glyph ${gr.w.toFixed(1)}×${gr.h.toFixed(1)}, plate ${pl.w.toFixed(1)}×${pl.h.toFixed(1)} — the plate must be the glyph`);
  }
  seen.add(c.key);
}
// the liquid Graph: a disc's plate is the disc
{
  const sn = { id: "n", x: 0, y: 0, w: 37, h: 37, node: { id: "n", node_type: "author", data: {} } };
  const pl = M.plateOf({ liquid: {} }, sn);
  ok(pl.round && pl.w === 37 && pl.h === 37, "the liquid Graph: the plate is the disc (it was a square capped at 30)");
}
// the census, as the report's table counts it
ok(seen.has("proxy") && seen.has("version:gltf") && seen.has("tileset") && seen.has("container"), "the data glyphs are in the census");
console.log(`check-plates: ${checks} checks ✓ (${seen.size} glyphs × ${Object.keys(boxes).length} boxes)`);
