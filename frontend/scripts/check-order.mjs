// G1 · the contradictions of the order, as the warnings report them
// (`issues.ts orderContradictions`, rule «cycle»).
//
//   node scripts/check-order.mjs
//
// «Every arrow points down» is impossible exactly when the data contradicts
// itself: a cycle of relations, or a contemporaneity whose two units a chain of
// relations orders. The engine breaks both (`crates/em-core/src/layered.rs`);
// the warnings say which, so a person can correct the data.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export { orderContradictions, issues } from "./issues";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
  loader: { ".json": "json" },
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const N = (id, t = "US") => ({ id, node_type: t, name: id });
const E = (s, t, ty = "is_after") => ({ source: s, target: t, edge_type: ty });

{
  const c = M.orderContradictions([N("A"), N("B"), N("C"), N("D")], [E("A", "B"), E("B", "C"), E("C", "A"), E("C", "D")]);
  ok(c.length === 1 && c[0].kind === "cycle", "a three-edge cycle is ONE contradiction");
  ok(JSON.stringify(c[0].nodes) === JSON.stringify(["A", "B", "C"]), `listed from its first node, in order (${c[0].nodes})`);
}
{
  const c = M.orderContradictions([N("A"), N("B"), N("C")], [E("A", "B"), E("B", "C"), E("A", "C", "has_same_time")]);
  ok(c.length === 1 && c[0].kind === "same_time" && c[0].nodes.join() === "A,C", "a contemporaneity ordered by a chain is reported");
}
{
  const ep = { id: "EP", node_type: "EpochNode", name: "EP" };
  const c = M.orderContradictions([N("A"), N("B"), ep, N("G", "ActivityNodeGroup")],
    [E("A", "B"), E("A", "EP", "has_first_epoch"), E("B", "EP", "has_first_epoch"), E("A", "G", "is_in_activity"), E("G", "A", "is_part_of"),
     E("A", "B", "has_same_time")].slice(0, 5));
  ok(c.length === 0, "epochs and memberships are not an order: no false cycle");
}
{
  const c = M.orderContradictions([N("A"), N("B")], [E("A", "B"), { ...E("B", "A"), attributes: { removed: true } }]);
  ok(c.length === 0, "a removed edge closes no cycle");
}
{
  const t = (k, v) => `${k}:${JSON.stringify(v ?? {})}`;
  const doc = { graph: { nodes: [N("A"), N("B")], edges: [E("A", "B"), E("B", "A")] } };
  const rows = M.issues({ doc, nodes: doc.graph.nodes, isUnit: () => false, t }).filter((i) => i.rule === "cycle");
  ok(rows.length === 1 && rows[0].sev === "warn" && rows[0].node === "A" && rows[0].txt.includes("A → B → A"),
     `the warnings carry the cycle, at its first node (${rows[0]?.txt})`);
}
console.log(`check-order: ${checks} checks ✓`);
