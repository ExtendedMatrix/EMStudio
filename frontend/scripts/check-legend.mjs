// LEGENDA · executable check of the connector legend beside the graph.
//
//   node scripts/check-legend.mjs
//
// What it pins:
//   1. «present in the view» is the SCENE the window paints — a filtered view
//      (what the circles of detail and the filters hand `buildScenes`) drops the
//      relations it hides, and the counts are the scene's edges;
//   2. a document drawn several times (Master/Instance) is ONE node, a folded
//      node is none;
//   3. the samples are stroked by the renderer's `strokeEdge`, the same function
//      the canvas loop calls — asserted on the sources, because a second
//      drawing of an edge is exactly how a legend drifts from its canvas;
//   4. the labels come from the datamodel, not from `i18n.ts`;
//   5. the panel: one entry per relation, a click reports its type, the pick
//      is marked, «Nodes» is folded unless asked;
//   6. the full legend (Help ▸ Legenda EM) covers every `edge_style` and every
//      edge type of the connections datamodel, and every styled node type.
//
// The panel and the modal on the real canvas (TempluMare, Matrix and Graph,
// light and dark, a relation picked) are in the report
// (`.claude/wip/reports/2026-10-02-legenda/`).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
// every sample is a canvas stroked by `strokeEdge`: record what it is told
const strokes = [];
window.HTMLCanvasElement.prototype.getContext = function () {
  const rec = { calls: [] };
  const log = (name) => (...a) => rec.calls.push([name, ...a]);
  const ctx = new Proxy({}, {
    get: (_t, k) => (k in rec ? rec[k] : typeof k === "string" && !["strokeStyle", "lineWidth", "globalAlpha", "fillStyle"].includes(k) ? log(k) : rec[k]),
    set: (_t, k, v) => { rec[k] = v; rec.calls.push(["set", k, v]); return true; },
  });
  strokes.push(rec);
  return ctx;
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * from "./legend";
      export { buildMatrixScene, newRestackMemo } from "./views/matrix";
      export { edgeLabel, edgeTypeLabel } from "./rules";
      export { styledEdgeTypes, styledNodeTypes } from "./palette";
      export { setLocale } from "./i18n";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  plugins: [
    {
      name: "stub-icons",
      setup(build) {
        build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: `
            export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);
            export const iconUrlFor = () => null;
            export const dtcGlyphUrl = () => null;
            export const imageFor = () => null;
            export const imageForUrl = () => null;
            export const crispImage = () => {};`,
          loader: "ts",
        }));
      },
    },
  ],
});
const M = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const doc = JSON.parse(readFileSync(new URL("../testdata/TempluMare.em.json", import.meta.url), "utf8"));
const scene = (view) =>
  M.buildMatrixScene(doc, view, undefined, new Set(), new Set(), M.newRestackMemo(), "k");

// ── 1 · present in the view = the scene's edges ───────────────────────────────
{
  const s = scene();
  const c = M.legendContent(s);
  const byType = new Map();
  for (const e of s.edges) byType.set(e.edge.edge_type, (byType.get(e.edge.edge_type) ?? 0) + 1);
  eq(new Map(c.edges.map((e) => [e.type, e.count])), byType,
     "one legend entry per edge type in the scene, with the scene's count");
  ok(c.edges.length > 1, `TempluMare Matrix shows several relations (${c.edges.map((e) => e.type).join(", ")})`);
  eq(c.edges.map((e) => M.edgeLabel(e.type)),
     [...c.edges.map((e) => M.edgeLabel(e.type))].sort((a, b) => a.localeCompare(b)),
     "entries are in label order");
  // the renderer's own predicate: an edge it skips is not in the legend
  const hide = c.edges[0].type;
  const c2 = M.legendContent(s, (t) => t !== hide);
  ok(!c2.edges.some((e) => e.type === hide), `an edge type the predicate hides (${hide}) has no entry`);

  // a filtered view (what the circles of detail hand buildScenes): no property
  // nodes, no edges touching them
  const props = new Set(doc.graph.nodes.filter((n) => n.node_type === "property").map((n) => n.id));
  ok(props.size > 0, "the fixture has properties to hide");
  const view = {
    nodes: doc.graph.nodes.filter((n) => !props.has(n.id)),
    edges: doc.graph.edges.filter((e) => !props.has(e.source) && !props.has(e.target)),
    badges: new Map(),
  };
  const cf = M.legendContent(scene(view));
  ok(c.edges.some((e) => e.type === "has_property"), "unfiltered: has_property is in the legend");
  ok(!cf.edges.some((e) => e.type === "has_property"), "filtered: has_property left with the properties");
  ok(!cf.nodes.some((e) => e.type === "property"), "filtered: no «property» in the node section");
  eq(M.legendContent(null), { edges: [], nodes: [] }, "no scene, no legend");
}

// ── 2 · nodes: instances are one, folded are none ─────────────────────────────
{
  const mk = (id, type, extra = {}) => ({ id, x: 0, y: 0, w: 10, h: 10, node: { id, node_type: type, name: id }, ...extra });
  const s = {
    nodes: [
      mk("d1", "document"),
      mk("d1#2", "document", { instanceOf: "d1" }),
      mk("u1", "US"),
      mk("u2", "US", { collapsed: true }),
      { ...mk("x", "link"), node: { id: "x", node_type: "link", data: { dtc_kind: "photo" } } },
    ],
    byId: new Map(),
    edges: [],
    lanes: [],
  };
  const c = M.legendContent(s);
  const count = (t, k) => c.nodes.find((e) => e.type === t && e.kind === k)?.count;
  eq(count("document"), 1, "a document drawn twice is one node");
  eq(count("US"), 1, "a folded node is not counted");
  eq(count("link", "photo"), 1, "a DTC item is its kind");
}

// ── 3 · ONE stroke: the sample and the canvas call the same function ─────────
{
  const renderer = readFileSync(new URL("../src/renderer.ts", import.meta.url), "utf8");
  const legend = readFileSync(new URL("../src/legend.ts", import.meta.url), "utf8");
  const body = renderer.slice(renderer.indexOf("export function render("));
  const edgesPart = body.slice(0, body.indexOf("// picked connector"));
  ok(/strokeEdge\(ctx, routes\[i\]/.test(edgesPart), "the canvas loop strokes its edges with strokeEdge");
  // the one other trace in there is the picked relation's HALO — an ochre wash
  // under the edge, not a second drawing of it
  const traces = edgesPart.split("traceRoute(").length - 1;
  ok(traces === 1 && /strokeStyle = accentColor\(\);[\s\S]{0,160}traceRoute\(/.test(edgesPart),
     "…and traces no edge of its own beside it (only the pick's accent halo)");
  ok(/import \{ strokeEdge \} from "\.\/renderer"/.test(legend), "legend.ts takes strokeEdge from the renderer");
  ok(!/borderBottomStyle|legend-swatch/.test(legend), "no CSS swatch left in the legend");
  strokes.length = 0;
  const cv = M.edgeSample("is_after");
  ok(cv.tagName === "CANVAS", "a sample is a canvas");
  const calls = strokes[0].calls.map((c) => c[0]);
  ok(calls.includes("stroke") && calls.includes("fill"), "is_after sample: a stroke and an arrowhead");
  strokes.length = 0;
  M.edgeSample("has_same_time");
  ok(!strokes[0].calls.some((c) => c[0] === "fill"), "a symmetric relation's sample has no arrowhead");
  strokes.length = 0;
  M.edgeSample("has_property");
  const dash = strokes[0].calls.find((c) => c[0] === "setLineDash");
  ok(Array.isArray(dash?.[1]), "the sample sets the edge_style dash");
}

// ── 4 · labels from the datamodel ─────────────────────────────────────────────
{
  const conn = JSON.parse(readFileSync(new URL("../src/assets/s3Dgraphy_connections_datamodel.json", import.meta.url), "utf8"));
  for (const t of ["is_after", "has_property", "extracted_from"])
    eq(M.edgeLabel(t), conn.edge_types[t].label ?? t, `${t}: the label is the datamodel's`);
  const i18n = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");
  ok(!/"legend\.edge\./.test(i18n) && !/"edge\.is_after"/.test(i18n), "i18n.ts carries no edge labels");
  M.setLocale("it");
  ok(typeof M.edgeLabel("is_after") === "string" && M.edgeLabel("is_after").length > 0,
     "it: a label (the sidecar's when it has one, the datamodel's until then)");
  M.setLocale("en");
}

// ── 5 · the panel ─────────────────────────────────────────────────────────────
{
  const c = M.legendContent(scene());
  const picked = [];
  let closed = 0;
  const el = M.buildLegendPanel(c, {
    highlight: c.edges[1].type,
    onPick: (t) => picked.push(t),
    nodesOpen: false,
    onNodesToggle: () => {},
    onClose: () => closed++,
  });
  const items = [...el.querySelectorAll(".gl-item")];
  eq(items.map((b) => b.dataset.edgeType), c.edges.map((e) => e.type), "one entry per relation, in order");
  eq(items.map((b) => b.querySelector(".gl-count").textContent), c.edges.map((e) => String(e.count)),
     "each entry shows its count");
  eq(items.filter((b) => b.classList.contains("on")).map((b) => b.dataset.edgeType), [c.edges[1].type],
     "the picked relation is marked, and only it");
  items[0].dispatchEvent(new window.Event("click"));
  eq(picked, [c.edges[0].type], "a click reports its relation");
  el.querySelector(".gl-close").dispatchEvent(new window.Event("click"));
  eq(closed, 1, "× closes");
  const det = el.querySelector("details.gl-nodes");
  ok(det && !det.open, "«Nodes» is there, folded");
  ok(det.querySelectorAll(".gl-node").length === c.nodes.length, "one row per node type present");
  const empty = M.buildLegendPanel({ edges: [], nodes: [] }, {
    highlight: null, onPick() {}, nodesOpen: false, onNodesToggle() {}, onClose() {},
  });
  ok(!!empty.querySelector(".gl-empty"), "no relations: the box says so");
}

// ── 6 · the whole language ────────────────────────────────────────────────────
{
  const all = M.allEdgeTypes();
  for (const t of M.styledEdgeTypes()) ok(all.includes(t), `full legend has edge_style ${t}`);
  const conn = JSON.parse(readFileSync(new URL("../src/assets/s3Dgraphy_connections_datamodel.json", import.meta.url), "utf8"));
  ok(Object.keys(conn.edge_types).every((t) => all.includes(t)), "…and every edge type of the connections datamodel");
  const nodes = M.allNodeEntries();
  ok(M.styledNodeTypes().every((t) => nodes.some((n) => n.type === t && !n.kind)), "every styled node type");
  ok(nodes.some((n) => n.kind === "photo"), "and the DTC kinds drawn from paths");
  M.showLegendModal();
  const modal = document.querySelector(".modal.em-legend");
  ok(!!modal, "Help ▸ Legenda EM opens a modal");
  const rows = modal.querySelectorAll(".gl-item, .gl-node");
  eq(rows.length, all.length + nodes.length, "one row per relation and per node type");
  const search = modal.querySelector(".gl-search");
  search.value = "is_after";
  search.dispatchEvent(new window.Event("input"));
  const shown = [...rows].filter((r) => !r.classList.contains("hidden"));
  ok(shown.length >= 1 && shown.every((r) => r.textContent.toLowerCase().includes("after")),
     `the search narrows (${shown.length} rows for «is_after»)`);
}

console.log(`check-legend: ${checks} checks ✓`);
