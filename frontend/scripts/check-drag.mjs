// TOCCARE · executable check of the drag: when it starts, where it lands, what
// it hits, and that what you drop stays where you dropped it.
//
//   node scripts/check-drag.mjs
//
// The pure pieces are exercised in node, bundled with the project's esbuild:
// `drag.ts` (the start gate, the group-or-lane rule), `scene.ts` (the hit test
// on the DRAWING), `views/matrix.ts` (the remembered re-stack) and `model.ts`
// (one gesture = one undo step). `./icons` is stubbed as in check-shape-geom:
// it uses `import.meta.glob`, which only Vite has.
//
// The same cases, on the real canvas and with a real mouse, are in the night's
// report (`.claude/wip/reports/2026-09-30-il-grafo-si-lascia-toccare/misura.mjs`,
// Playwright on `npm run dev`) — that is where the times come from; this file
// is the part that has to stay green without a browser.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * from "./drag";
      export { buildMatrixScene, newRestackMemo } from "./views/matrix";
      export { hitTest, visibleBoxOf } from "./scene";
      export { DOC_SHEET_ASPECT, HIT_TOL_PX } from "./shape-geom";
      export { DocumentStore } from "./model";
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
          contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`,
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
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};
const near = (a, b, what, eps = 1e-6) => ok(Math.abs(a - b) <= eps, `${what} — got ${a}, want ${b}`);

// ── 1 · the start gate: slow drags start, 1:1 after that ─────────────────────
{
  // 1 px per event for 8 px: the node moves 8 px, not 0 and not 5
  const g = new M.DragGate(100, 100);
  let x = 0;
  for (let i = 1; i <= 8; i++) {
    const d = g.move(100 + i, 100);
    if (d) x += d.dx;
  }
  near(x, 8, "slow drag (1 px/event × 8) moves the node by the whole 8 px");
  const g2 = new M.DragGate(0, 0);
  ok(g2.move(5, 0) === null, "5 px is still a click (I5: a trackpad click travels a few px)");
  const d3 = g2.move(6, 0);
  ok(d3 && d3.dx === 6, "at 6 px the drag starts and catches up the whole 6 px");
  ok(M.DRAG_START_PX === 6, "the threshold is the declared 6 px");
}

// ── a two-lane matrix: epoch A on top (with two phases), epoch B below ─────────
const N = (id, node_type = "US", extra = {}) => ({ id, name: id, node_type, ...extra });
const E = (source, edge_type, target) => ({ id: `${source}__${edge_type}__${target}`, source, target, edge_type });
const R = (x, y, w = 90, h = 32) => ({ x, y, w, h });
function twoLaneDoc() {
  return {
    graph: {
      nodes: [
        N("A", "EpochNode", { data: { start_time: 100, end_time: 200 } }),
        N("P1", "EpochNode", { data: { start_time: 150, end_time: 200 } }),
        N("P2", "EpochNode", { data: { start_time: 100, end_time: 150 } }),
        N("B", "EpochNode", { data: { start_time: 0, end_time: 100 } }),
        N("u1"), N("u2"), N("u3"), N("v1"),
        N("x1", "extractor"), N("d1", "document"),
      ],
      edges: [
        E("A", "has_sub_epoch", "P1"), E("A", "has_sub_epoch", "P2"),
        E("u1", "has_first_epoch", "P1"), E("u2", "has_first_epoch", "P1"),
        E("u3", "has_first_epoch", "P2"), E("v1", "has_first_epoch", "B"),
      ],
    },
    layout: {
      swimlanes: [
        { epoch_id: "A", y: 0, height: 200 },
        { epoch_id: "P1", y: 40, height: 60 },
        { epoch_id: "P2", y: 110, height: 60 },
        { epoch_id: "B", y: 200, height: 200 },
      ],
      positions: {
        u1: R(100, 50), u2: R(250, 60), u3: R(100, 120), v1: R(100, 260),
        // a glyph and a sheet that arrive with the OLD 90 × 32 box
        x1: R(400, 260), d1: R(550, 260),
      },
    },
  };
}
const build = (doc, memo, key) =>
  M.buildMatrixScene(doc, undefined, undefined, new Set(["A"]), new Set(), memo, key);

// ── 2 · a nudge survives the rebuild (the remembered re-stack) ───────────────
{
  const doc = twoLaneDoc();
  const memo = M.newRestackMemo();
  const s0 = build(doc, memo, "k");
  ok(s0.subBands?.length >= 2, "the phased lane shows its bands");
  const u1 = s0.byId.get("u1"), u2 = s0.byId.get("u2");
  // u1 is the TOPMOST node of its band: exactly the node that was nailed
  doc.layout.positions.u1.y += 3;
  const s1 = build(doc, memo, "k");
  near(s1.byId.get("u1").y - u1.y, 3, "nudge 3 px down, rebuild: the node is 3 px lower");
  near(s1.byId.get("u2").y - u2.y, 0, "…and its band neighbour has not moved");
  // the old behaviour, for the record: re-flowing anchors the band to its top
  const fresh = build(doc, M.newRestackMemo(), "other");
  near(fresh.byId.get("u1").y - u1.y, 0, "a fresh re-flow (Riordina) re-anchors the band — the old «inchiodato»");
  // upward: a nudge above the lane top pokes out, it does not drag the lane down
  const s2 = build(doc, memo, "k");
  doc.layout.positions.v1.y = 200 - 5; // above lane B's top + 8
  const s3 = build(doc, memo, "k");
  near(s3.byId.get("v1").y - s2.byId.get("v1").y, -65, "a node moved above its lane top lands where it was put");
}

// ── 3 · group or lane: the rule, with and without Alt ─────────────────────────
{
  const scene = {
    nodes: [], byId: new Map(), edges: [],
    lanes: [
      { id: "A", label: "Età romana", y: 0, height: 200 },
      { id: "B", label: "Medioevo", y: 200, height: 200 },
    ],
    groups: [
      { id: "G", x: 300, y: 220, w: 200, h: 150, headerH: 20, title: "VAct.01", folded: false },
      { id: "H", x: 320, y: 260, w: 80, h: 60, headerH: 20, title: "VSF1", folded: false },
    ],
  };
  const opt = { alt: false, forbidden: new Set(), own: new Set(), accepts: () => true };
  const inBody = M.dropTargetAt(scene, 450, 300, opt);
  ok(inBody?.kind === "group" && inBody.group.id === "G", "in a container's body the group wins");
  const innermost = M.dropTargetAt(scene, 350, 300, opt);
  ok(innermost?.kind === "group" && innermost.group.id === "H", "the innermost body wins (matryoshka)");
  const withAlt = M.dropTargetAt(scene, 450, 300, { ...opt, alt: true });
  ok(withAlt?.kind === "lane" && withAlt.epochId === "B", "Alt: only the lane, never the group");
  const onHeader = M.dropTargetAt(scene, 450, 230, opt);
  ok(onHeader?.kind === "lane" && onHeader.epochId === "B", "on the title bar the lane wins");
  const own = M.dropTargetAt(scene, 450, 300, { ...opt, own: new Set(["G"]) });
  ok(own?.kind === "lane", "inside your OWN container: a move, not a join");
  const refuses = M.dropTargetAt(scene, 350, 300, { ...opt, accepts: (g) => g !== "H" });
  ok(refuses?.kind === "group" && refuses.group.id === "G", "a group that refuses the node is skipped for its parent");
  ok(M.sameTarget(M.laneTargetAt(scene, 10), M.laneTargetAt(scene, 190)), "two points of one lane are the same target");
  ok(!M.sameTarget(M.laneTargetAt(scene, 10), M.laneTargetAt(scene, 210)), "…and two lanes are not");
}

// ── 4 · phase bands: the band under the point is the epoch assigned ──────────
{
  const doc = twoLaneDoc();
  const s = build(doc, M.newRestackMemo(), "k");
  const bands = s.subBands.filter((b) => b.laneId === "A").sort((a, b) => a.y - b.y);
  const t = M.laneTargetAt(s, bands[1].y + 5);
  ok(t?.epochId === bands[1].phaseId, "a drop in the second band attributes to its phase");
}

// ── 5 · the drawing is what you click ─────────────────────────────────────────
{
  const doc = twoLaneDoc();
  const s = build(doc, M.newRestackMemo(), "k");
  const x1 = s.byId.get("x1");
  const vb = M.visibleBoxOf(x1);
  ok(vb.w === 30 && vb.h === 30, "an extractor in an old 90 × 32 box DRAWS 30 × 30 (declared aspect 1)");
  const cy = x1.y + x1.h / 2;
  ok(M.hitTest(s, vb.x - 8, cy, 0) === null, "a click 8 px left of the glyph, inside the old box: nothing");
  ok(M.hitTest(s, vb.x + vb.w + 8, cy, 0) === null, "…8 px right: nothing");
  ok(M.hitTest(s, vb.x + 2, cy, 0)?.id === "x1", "on the glyph: the node");
  ok(M.hitTest(s, vb.x - 2, cy, M.HIT_TOL_PX)?.id === "x1", "2 px off with the 3 px tolerance: the node");
  const d1 = s.byId.get("d1");
  const dv = M.visibleBoxOf(d1);
  // the DECLARED aspect (em_visual_rules 1.6.21: 0.636, from document.svg), not a copy of it
  ok(Math.abs(dv.w - 30 * M.DOC_SHEET_ASPECT) < 1e-9, `the document sheet is ${30 * M.DOC_SHEET_ASPECT} wide in its 90 box`);
  ok(M.DOC_SHEET_ASPECT === 0.636, "the aspect is the datamodel's, not the 0.78 fallback");
  ok(M.hitTest(s, dv.x - 8, d1.y + 16, 0) === null, "8 px beside the sheet: the document is NOT selected");
}

// ── 6 · epoch + position in ONE undo step ─────────────────────────────────────
{
  const st = new M.DocumentStore(twoLaneDoc());
  const epochOf = (id) => st.doc.graph.edges.find((e) => e.source === id && e.edge_type === "has_first_epoch")?.target;
  const y0 = st.doc.layout.positions.v1.y;
  st.batch(() => {
    st.setFirstEpoch(["v1"], "P2");
    st.moveNodesBy(["v1"], 0, -140, false);
  });
  ok(epochOf("v1") === "P2" && st.doc.layout.positions.v1.y === y0 - 140, "the drop wrote epoch and position");
  st.undo();
  ok(epochOf("v1") === "B" && st.doc.layout.positions.v1.y === y0, "ONE undo takes back epoch AND position");
  ok(!st.canUndo, "…and it was one step, not two");
}

console.log(`drag: ${checks} checks passed`);
