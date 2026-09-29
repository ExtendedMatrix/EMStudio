// SHIFT-A fase 6b · executable check of the glyphs drawn FROM THEIR PATHS.
//
//   node scripts/check-glyphs.mjs
//
// Three facts, each asked of the code that does it rather than of a comment:
//
//  1. every type of `2d_render_glyph_types` (and every DTC kind) resolves to a
//     glyph of `2d_glyphs` — `glyphs.ts::glyphFor` — with layers that parse;
//  2. the RENDERER draws those types from paths and never with `drawImage`:
//     `renderer.ts::render` is run on a recording 2D context over a matrix scene
//     holding one node of each glyph type (and the ornament badges), with the
//     icon loader stubbed to hand out a decoded image — so if any path asked for
//     a bitmap, `drawImage` would be recorded;
//  3. the HIT TEST of a glyph is its first ground layer: a point inside the
//     glyph's rect but outside its disc does not select, one on the disc does
//     (`scene.ts::hitTest`, with a real point-in-path over the M/L/C/Z data).
//
// And the dark theme: only the roles `_roles` declares recolourable change.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { window, document } = parseHTML(`<!doctype html><html><body></body></html>`);
globalThis.window = window;
globalThis.document = document;
window.devicePixelRatio = 1;

// ── a point-in-path for the M/L/C/Z data the glyph tool emits ────────────────
function flatten(d) {
  const polys = [];
  let cur = [];
  const t = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let i = 0;
  let x = 0, y = 0, sx = 0, sy = 0;
  const num = () => Number(t[i++]);
  while (i < t.length) {
    const c = t[i++];
    if (c === "M") {
      if (cur.length) polys.push(cur);
      x = num(); y = num(); sx = x; sy = y; cur = [[x, y]];
      while (i < t.length && !/[MLCZ]/i.test(t[i])) { x = num(); y = num(); cur.push([x, y]); }
    } else if (c === "L") {
      while (i < t.length && !/[MLCZ]/i.test(t[i])) { x = num(); y = num(); cur.push([x, y]); }
    } else if (c === "C") {
      while (i < t.length && !/[MLCZ]/i.test(t[i])) {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
        for (let k = 1; k <= 12; k++) {
          const u = k / 12, v = 1 - u;
          cur.push([v * v * v * x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3,
                    v * v * v * y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3]);
        }
        x = x3; y = y3;
      }
    } else if (c === "Z" || c === "z") {
      x = sx; y = sy;
    }
  }
  if (cur.length) polys.push(cur);
  return polys;
}
function inPath(d, px, py, rule = "nonzero") {
  let wind = 0, cross = 0;
  for (const p of flatten(d))
    for (let k = 0; k < p.length; k++) {
      const [x1, y1] = p[k], [x2, y2] = p[(k + 1) % p.length];
      if ((y1 <= py) !== (y2 <= py)) {
        const xi = x1 + ((py - y1) / (y2 - y1)) * (x2 - x1);
        if (xi > px) { cross++; wind += y2 > y1 ? 1 : -1; }
      }
    }
  return rule === "evenodd" ? cross % 2 === 1 : wind !== 0;
}
globalThis.Path2D = class { constructor(d) { this.d = d; } };

// ── a recording 2D context ────────────────────────────────────────────────────
function recordingContext() {
  const calls = [];
  const props = { lineWidth: 1, globalAlpha: 1, font: "10px sans-serif" };
  const ctx = new Proxy({}, {
    get(_, k) {
      if (k === "calls") return calls;
      if (k === "measureText") return (s) => ({ width: String(s).length * 6 });
      if (k === "isPointInPath") return (p, x, y, rule) => inPath(p.d, x, y, rule);
      if (k === "isPointInStroke") return () => false;
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern")
        return () => ({ addColorStop() {} });
      if (k === "getLineDash") return () => [];
      if (k in props) return props[k];
      return (...a) => { calls.push([k, a]); };
    },
    set(_, k, v) { props[k] = v; return true; },
  });
  return ctx;
}
// the hit test builds its own context through the DOM
const realCreate = document.createElement.bind(document);
document.createElement = (tag) => {
  const el = realCreate(tag);
  if (String(tag).toLowerCase() === "canvas") el.getContext = () => recordingContext();
  return el;
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * from "./glyphs";
      export { render } from "./renderer";
      export { buildMatrixScene, newRestackMemo } from "./views/matrix";
      export { hitTest, visibleBoxOf } from "./scene";
      export { glyphRectOf } from "./shape-geom";
      export { setCanvasTheme } from "./theme";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  loader: { ".woff2": "empty", ".ttf": "empty" },
  plugins: [
    {
      name: "stub-icons",
      setup(build) {
        build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          // a loader that ALWAYS has a decoded image: if the renderer asked for
          // one for a glyph type, drawImage would be called and recorded
          contents: `
            import rules from "${SRC}assets/em_visual_rules.json";
            export const ICON_NODE_TYPES = new Set(rules["2d_render_glyph_types"].types);
            const img = { complete: true, naturalWidth: 32, naturalHeight: 32, src: "stub.png" };
            export const imageFor = () => img;
            export const imageForUrl = () => img;
            export const iconUrlFor = () => "stub.png";
            export const dtcGlyphUrl = (b) => (b ? "stub.svg" : null);
            export const crispImage = (i) => i;
            export const setIconRedraw = () => {};
          `,
          loader: "ts",
          resolveDir: SRC,
        }));
      },
    },
  ],
});
const M = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

import rules from "../src/assets/em_visual_rules.json" with { type: "json" };
const GLYPH_TYPES = rules["2d_render_glyph_types"].types;

// ── 1 · every glyph type is drawn from paths ─────────────────────────────────
{
  for (const t of GLYPH_TYPES) {
    const g = M.glyphFor(t);
    ok(g && g.layers.length > 0, `${t} has a 2d_glyphs entry with layers`);
    ok(g.layers.every((l) => /^[MLCZ0-9.\s,\-e]+$/i.test(l.d)), `${t}: layers are absolute M/L/C/Z only`);
    ok(Math.abs(g.aspect - (rules["2d_render_glyph_types"].aspect[t] ?? 1)) < 1e-9,
       `${t}: the glyph's aspect is the one the layout reads`);
  }
  const kinds = M.glyphKeys().filter((k) => k.startsWith("dtc:"));
  ok(kinds.length > 10, `the DTC kinds are there too (${kinds.length})`);
  for (const k of kinds)
    ok(M.glyphFor("link", { dtc_kind: k.slice(4) })?.key === k, `a node with dtc_kind ${k.slice(4)} draws ${k}`);
  eq(M.glyphFor("US"), null, "a shape type is not a glyph");
  ok(!Object.values(rules["2d_glyphs"]).some((e) => e && typeof e === "object" && e.draft),
     "no glyph is a draft (em_visual_rules 1.6.20)");
}

// ── 2 · the renderer never drawImage's a glyph type ──────────────────────────
const N = (id, node_type, extra = {}) => ({ id, name: id, node_type, description: "", ...extra });
{
  const nodes = [N("A", "EpochNode", { data: { start_time: 0, end_time: 100 } }), N("u1", "US")];
  const positions = { u1: { x: 100, y: 40, w: 90, h: 32 } };
  const edges = [{ id: "e0", source: "u1", target: "A", edge_type: "has_first_epoch" }];
  let x = 240;
  for (const t of [...GLYPH_TYPES, "link"]) {
    const extra = t === "link" ? { data: { dtc_kind: "photo" } } : {};
    nodes.push(N(`g_${t}`, t, extra));
    positions[`g_${t}`] = { x, y: 40, w: 32, h: 32 };
    edges.push({ id: `e_${t}`, source: `g_${t}`, target: "A", edge_type: "has_first_epoch" });
    x += 60;
  }
  const doc = { graph: { nodes, edges }, layout: { swimlanes: [{ epoch_id: "A", y: 0, height: 200 }], positions } };
  const scene = M.buildMatrixScene(doc, undefined, undefined, new Set(), new Set(), M.newRestackMemo(), "k");
  // the ornament BADGES too: the referent u1 carries author, license, embargo
  scene.byId.get("u1").adornments = [
    { kind: "author", ornamentId: "g_author" },
    { kind: "license", ornamentId: "g_license" },
    { kind: "embargo", ornamentId: "g_embargo" },
  ];
  for (const theme of ["light", "dark"]) {
    M.setCanvasTheme(theme);
    const ctx = recordingContext();
    M.render(ctx, scene, { x: 0, y: 0, scale: 2, toWorld: (a, b) => ({ x: a / 2, y: b / 2 }) },
             { selectedId: null, hoverId: null, selectedIds: new Set(), drawLabels: true }, 1400, 900);
    const names = ctx.calls.map((c) => c[0]);
    eq(names.filter((n) => n === "drawImage").length, 0,
       `${theme} · no drawImage anywhere: every glyph type, the DTC kind and the badges come from paths`);
    ok(ctx.calls.some((c) => c[0] === "fill" && c[1][0] instanceof Path2D),
       `${theme} · the glyphs are filled from Path2D layers`);
  }
}

// ── 3 · the hit test is the glyph's ground layer ─────────────────────────────
{
  const nodes = [N("A", "EpochNode"), N("x", "extractor")];
  const doc = { graph: { nodes, edges: [{ id: "e", source: "x", target: "A", edge_type: "has_first_epoch" }] },
                layout: { swimlanes: [{ epoch_id: "A", y: 0, height: 200 }], positions: { x: { x: 100, y: 50, w: 32, h: 32 } } } };
  const scene = M.buildMatrixScene(doc, undefined, undefined, new Set(), new Set(), M.newRestackMemo(), "k");
  const n = scene.byId.get("x");
  const r = M.visibleBoxOf(n);
  const g = M.glyphFor("extractor");
  ok(M.groundLayer(g), "the extractor has a ground layer (its disc)");
  // the corner of the rect is outside the disc
  const corner = { x: r.x + 0.6, y: r.y + 0.6 };
  const centre = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  eq(M.hitTest(scene, corner.x, corner.y, 0)?.id ?? null, null,
     "a point in the glyph's rect but OFF its ground layer does not select");
  eq(M.hitTest(scene, centre.x, centre.y, 0)?.id, "x", "a point on the ground layer selects");
  // a glyph with no filled first layer keeps its rect
  const strokeFirst = M.glyphKeys().find((k) => k.startsWith("dtc:") && !M.groundLayer(M.glyphByKey(k)));
  if (strokeFirst) ok(M.groundLayer(M.glyphByKey(strokeFirst)) === null,
                      `${strokeFirst} starts with a stroke: no ground layer, the rect is the target`);
}

// ── 4 · dark theme: only the recolourable roles move ─────────────────────────
{
  const dark = { ink: "#e3e8ef", paper: "#121821", dark: true };
  const light = { ink: "#e3e8ef", paper: "#121821", dark: false };
  for (const t of GLYPH_TYPES)
    for (const l of M.glyphFor(t).layers) {
      const hex = l.fill ?? l.stroke;
      eq(M.layerColor(l, light), hex, `${t}/${l.role}: light keeps the EM hex`);
      if (!M.roleRecolors(l.role)) eq(M.layerColor(l, dark), hex, `${t}/${l.role}: a fixed role keeps its hex in dark`);
    }
  ok(M.roleRecolors("ink") && M.roleRecolors("paper") && M.roleRecolors("halo"), "ink, paper, halo recolour");
  ok(!M.roleRecolors("ground") && !M.roleRecolors("accent"), "ground and accent never do");
  const svg = M.glyphSvg(M.glyphFor("combiner"));
  ok(svg.startsWith("<svg") && svg.includes("<path") && !svg.includes("<image"),
     "the SVG of a glyph is paths, never an embedded image");
}

console.log(`check-glyphs: ${checks} checks ✓`);
