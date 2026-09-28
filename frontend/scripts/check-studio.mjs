// STRUTTURA (30 set 2026) · executable check of the desk's structure.
//
//   node scripts/check-studio.mjs
//
// The pure modules of the night, bundled with esbuild and run in node like
// check-tiling does: one workspace in the bar and the parked ones kept, the
// outliner by epoch, the facets of the table, the issues model.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const SRC = new URL("../src/", import.meta.url).pathname;
async function load(entry) {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false, logLevel: "silent",
                                  loader: { ".json": "json" } });
  return import("data:text/javascript;base64," +
                Buffer.from(b.outputFiles[0].text).toString("base64") + `#${entry}`);
}

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++;
};

// ── 1 · one workspace; the others parked, their saved layouts kept ─────────
{
  // a session left on a parked tab, with an arrangement saved for it
  mem.set("emstudio.workspace", "dtc");
  const saved = { dtc: { wins: [{ id: "dtc:1", type: "graph", state: { mode: "dtc" } }],
                         activeId: "dtc:1", layout: { kind: "leaf", winId: "dtc:1" } } };
  mem.set("emstudio.windows", JSON.stringify(saved));
  const W = await load("workspace.ts");
  eq(W.WORKSPACES.map((w) => w.id), ["canvas"], "the bar holds ONE workspace");
  eq(W.WORKSPACES[0].labelKey, "ws.studio", "…called Studio");
  eq(W.PARKED_WORKSPACES.map((w) => w.id),
     ["assets", "dtc", "provenance", "comparisons", "narrative", "annotator"],
     "the six others are parked with their ids unchanged");
  eq(W.activeWorkspace(), "canvas", "a persisted id pointing at a parked tab falls back to canvas");
  ok(W.applyArrangement("canvas"), "the Studio arrangement applies");
  const ids = W.paneIds(W.layoutOf("canvas"));
  eq(W.windowsOf("canvas").map((w) => w.type), ["graph", "emtree", "inspector"],
     "three windows: graph (the anchor), outliner, inspector");
  eq(ids.map((id) => W.windowsOf("canvas").find((w) => w.id === id).type),
     ["emtree", "graph", "inspector"], "left to right: outliner | graph | inspector");
  eq(W.windowsOf("canvas")[1].state["current.panel"], "nodelist",
     "the EMtree window opens on its Outliner tab");
  eq(W.winMode(W.windowsOf("canvas")[0]), "matrix", "the graph opens in Matrix");
  const after = JSON.parse(mem.get("emstudio.windows"));
  ok(after.dtc && after.dtc.activeId === "dtc:1",
     "the parked tab's saved arrangement survives the next save");
}

// ── 2 · the outliner by epoch ───────────────────────────────────────────────
{
  const O = await load("outline.ts");
  const node = (id, node_type, data) => ({ id, name: id, node_type, data });
  const edge = (source, edge_type, target) => ({ source, edge_type, target });
  const nodes = [
    node("E1", "EpochNode", { start_time: 100, end_time: 300 }),
    node("E2", "EpochNode", { start_time: 1100, end_time: 1300 }),
    node("E2a", "EpochNode", { start_time: 1200, end_time: 1300 }),
    node("E2b", "EpochNode", { start_time: 1100, end_time: 1200 }),
    node("USM1", "US"), node("RSF1", "US"), node("RSF2", "US"),
    node("SF9", "US"), node("US7", "US"), node("X", "PropertyNode"),
  ];
  const edges = [
    edge("E2", "has_sub_epoch", "E2b"), edge("E2", "has_sub_epoch", "E2a"),
    edge("USM1", "has_first_epoch", "E2"), edge("RSF1", "has_first_epoch", "E2"),
    edge("RSF2", "has_first_epoch", "E2"), edge("SF9", "has_first_epoch", "E1"),
    edge("RSF1", "is_part_of", "USM1"), edge("RSF2", "is_part_of", "USM1"),
  ];
  const doc = { graph: { nodes, edges } };
  const isUnit = (t) => t === "US";
  const o = O.buildOutline(doc, nodes, isUnit);
  eq(o.epochs.map((e) => [e.node.id, e.depth]),
     [["E2", 0], ["E2a", 1], ["E2b", 1], ["E1", 0]],
     "newest epoch first; sub-epochs nested from has_sub_epoch, newest first");
  eq(o.epochs[0].units.map((u) => [u.node.id, u.depth]),
     [["USM1", 0], ["RSF1", 1], ["RSF2", 1]], "members indented under their container");
  eq(o.unplaced.map((u) => u.node.id), ["US7"], "a unit with no epoch is listed apart");
  eq(O.epochSpan(nodes[1]), "1100–1300", "the span reads start–end");
  const f = O.buildOutline(doc, nodes, isUnit, (n) => n.id === "RSF2");
  eq(f.epochs.map((e) => e.node.id), ["E2"], "filtering drops the epochs left empty");
  eq(f.epochs[0].units.map((u) => u.node.id), ["USM1", "RSF2"],
     "…and keeps a matching member in its container's context");
}

console.log(`studio: ${checks} checks passed`);
