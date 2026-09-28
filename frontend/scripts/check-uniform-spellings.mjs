// SPELL1 · «Uniforma le grafie» — an explicit command, one tracked operation.
//
//   node scripts/check-uniform-spellings.mjs
//
// E.D., 27 Sep 2026: at load nothing is rewritten silently (a spelling is
// accepted when read). The document is brought to the canonical spelling by a
// COMMAND that shows its count first, is undone in one step, and leaves through
// the same door as every inspector edit — `delete_edge` / `add_edge` on the
// store's op channel, which a room turns into `remove_edge` / `add_edge`.
//
// The fixture is the one the prompt names: 5 edges — 2 exact duplicates of a
// canonical edge, 1 old spelling with no canonical, 2 canonical. After: 3.
// The spellings are read off the vendored datamodel; this file names them only
// to build the fixture, and asserts that they ARE the datamodel's.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const R = await load("rules.ts");
const M = await load("model.ts");
const H = await load("hub.ts");
const C = await load("crdt.ts");
const conn = JSON.parse(
  readFileSync(`${SRC}assets/s3Dgraphy_connections_datamodel.json`, "utf8"),
);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};
const clone = (x) => JSON.parse(JSON.stringify(x));

const PAIRS = Object.fromEntries(Object.entries(conn.edge_types)
  .filter(([, d]) => d.spelling_of).map(([old, d]) => [old, d.spelling_of]));
eq(PAIRS, { is_bonded_to: "bonded_to", is_physically_equal_to: "equals" },
   "the fixture's spellings are the datamodel's");

const E = (id, edge_type, source, target, extra = {}) =>
  ({ id, edge_type, source, target, ...extra });
const US = (id) => ({ id, node_type: "US", name: id });
const fixture = () => ({
  graph: {
    graph_id: "scavo",
    nodes: ["u1", "u2", "u3", "u4", "u5", "u6"].map(US),
    edges: [
      E("c1", "bonded_to", "u1", "u2"),                       // canonical
      E("d1", "is_bonded_to", "u1", "u2"),                    // exact duplicate
      E("c2", "equals", "u3", "u4"),                          // canonical
      E("d2", "is_physically_equal_to", "u3", "u4"),          // exact duplicate
      E("u5__is_bonded_to__u6", "is_bonded_to", "u5", "u6",   // no canonical
        { attributes: { derived: true, derived_from: "PD7" }, label: "legato" }),
    ],
  },
});
const triples = (edges) =>
  edges.map((e) => `${e.source}|${e.edge_type}|${e.target}`).sort();

// ── 1 · the plan (what the dialog counts) ────────────────────────────────────
{
  const plan = R.planUniformSpellings(fixture().graph.edges);
  eq(plan.steps.length, 3, "three edges carry an older spelling");
  eq(plan.bySpelling, { is_bonded_to: 2, is_physically_equal_to: 1 }, "by spelling");
  eq(plan.duplicates, 2, "two exact duplicates of a canonical edge");
  eq(plan.reversed, 0, "none written from the other end");
  eq(plan.respelled, 1, "one old edge with no canonical");
  eq(plan.steps.map((s) => [s.edge.id, s.kind, s.canonical]), [
    ["d1", "duplicate", "bonded_to"],
    ["d2", "duplicate", "equals"],
    ["u5__is_bonded_to__u6", "respell", "bonded_to"],
  ], "each step, in document order");
}
{
  // a symmetric bond written from the other end is the SAME bond
  const plan = R.planUniformSpellings([
    E("c", "bonded_to", "u1", "u2"), E("o", "is_bonded_to", "u2", "u1"),
  ]);
  eq(plan.steps.map((s) => s.kind), ["duplicate-reversed"], "B→A old vs A→B canonical");
  // two old edges of one bond with no canonical: one respell, then a duplicate
  const two = R.planUniformSpellings([
    E("a", "is_bonded_to", "u1", "u2"), E("b", "is_bonded_to", "u1", "u2"),
    E("c", "is_bonded_to", "u2", "u1"),
  ]);
  eq(two.steps.map((s) => s.kind), ["respell", "duplicate", "duplicate-reversed"],
     "the first old edge is respelled, the rest are its duplicates");
  // nothing else is touched: canonical, directed, generic
  const none = R.planUniformSpellings([
    E("a", "overlies", "u1", "u2"), E("b", "bonded_to", "u1", "u2"),
    E("c", "generic_connection", "u2", "u1"), E("d", "equals", "u3", "u4"),
  ]);
  eq(none.steps.length, 0, "a canonical document has nothing to do");
}

// ── 2 · the store: the effect, the data kept, ONE undo ───────────────────────
{
  const store = new M.DocumentStore(fixture());
  const before = clone(store.doc.graph);
  const ops = [];
  store.onOp((op) => ops.push(op));
  eq(store.spellingPlan().steps.length, 3, "the store plans on its live edges");
  ok(!store.canUndo, "fresh store: nothing to undo");

  const done = store.uniformSpellings();
  const edges = store.doc.graph.edges;
  eq(edges.length, 3, "5 edges → 3");
  eq(triples(edges), ["u1|bonded_to|u2", "u3|equals|u4", "u5|bonded_to|u6"],
     "one canonical edge per bond");
  eq(done.duplicates + done.respelled, 3, "the plan it returns is the one applied");
  const re = edges.find((e) => e.source === "u5");
  eq(re.attributes, { derived: true, derived_from: "PD7" }, "the edge's attributes kept");
  eq(re.label, "legato", "…and every other key it carried");
  eq(re.id, "u5__bonded_to__u6", "a NEW id, minted like addEdge's");
  eq(edges.map((e) => e.id), ["c1", "c2", "u5__bonded_to__u6"],
     "order kept: the respelled edge stays where the old one was");
  eq(R.planUniformSpellings(edges).steps.length, 0, "idempotent: nothing left to do");

  // the operations — the very door an inspector deletion uses
  eq(ops.map((o) => [o.op, o.edge.id, o.edge.edge_type]), [
    ["delete_edge", "d1", "is_bonded_to"],
    ["delete_edge", "d2", "is_physically_equal_to"],
    ["delete_edge", "u5__is_bonded_to__u6", "is_bonded_to"],
    ["add_edge", "u5__bonded_to__u6", "bonded_to"],
  ], "four operations: three removals, one addition");

  // ONE undo step
  ok(store.canUndo, "undoable");
  store.undo();
  eq(store.doc.graph.edges.length, 5, "undo → 5 edges");
  eq(store.doc.graph, before, "undo → the document exactly as it was");
  ok(!store.canUndo, "…in ONE step");
  store.redo();
  eq(store.doc.graph.edges.length, 3, "redo → 3");

  // a tombstoned edge (a removal from the room) is not the command's business
  const t = new M.DocumentStore(fixture());
  t.doc.graph.edges[1].attributes = { removed: { ts: "2026-09-27T10:00:00Z" } };
  eq(t.spellingPlan().steps.map((s) => s.edge.id), ["d2", "u5__is_bonded_to__u6"],
     "tombstoned edges are skipped");
}

// ── 3 · the room: the ops a second client applies ────────────────────────────
{
  const store = new M.DocumentStore(fixture());
  const peer = clone(fixture().graph);           // a second client, same snapshot
  const relay = clone(fixture().graph);          // the server's working copy
  const sent = [];
  store.onOp((op) => sent.push(...H.opsForLocalChange(op)));
  store.uniformSpellings();
  eq(sent.map((o) => o.op), ["remove_edge", "remove_edge", "remove_edge", "add_edge"],
     "the room vocabulary");
  // the relay stamps `ts` and `author` (stratigraph-server app/ws.py: setdefault)
  let i = 0;
  const stamped = sent.map((o) => ({ ...o, ts: `2026-09-27T12:00:0${i++}Z`,
                                     author: "0000-0002-1825-0097" }));
  for (const op of stamped) {
    ok(C.applyOp(relay, op).applied, `relay applies ${op.op} ${op.id}`);
    ok(C.applyOp(peer, op).applied, `peer applies ${op.op} ${op.id}`);
  }
  eq(triples(C.liveEdges(peer)), triples(store.doc.graph.edges),
     "the second client sees the same 3 edges");
  eq(triples(C.liveEdges(relay)), triples(store.doc.graph.edges),
     "…and so does the server's copy");
  eq(new Set(peer.edges.map((e) => e.id)).size, peer.edges.length,
     "no id is used twice in the room (tombstones included)");

  // WHY the id is new — measured, not assumed. Re-using the old id: the room
  // keeps the old edge as a tombstone under that id, and `remove_edge` matches
  // by id first, so the next removal of the canonical edge hits the tombstone.
  const bad = clone(fixture().graph);
  const X = "u5__is_bonded_to__u6";
  C.applyOp(bad, { op: "remove_edge", id: X, source: "u5", target: "u6",
                   edge_type: "is_bonded_to", ts: "2026-09-27T12:00:00Z" });
  C.applyOp(bad, { op: "add_edge", id: X, source: "u5", target: "u6",
                   edge_type: "bonded_to", ts: "2026-09-27T12:00:01Z" });
  eq(bad.edges.filter((e) => e.id === X).length, 2, "a kept id = two edges under one id");
  C.applyOp(bad, { op: "remove_edge", id: X, source: "u5", target: "u6",
                   edge_type: "bonded_to", ts: "2026-09-27T12:00:02Z" });
  ok(C.liveEdges(bad).some((e) => e.id === X && e.edge_type === "bonded_to"),
     "…and deleting the canonical edge later leaves it standing");
}

// ── 4 · the command is wired: menu → dialog → store ──────────────────────────
{
  const main = readFileSync(`${SRC}main.ts`, "utf8");
  ok(/label: "menu\.uniformSpellings",\s*run: \(\) => promptUniformSpellings\(\)/.test(main),
     "the graph window's menu runs the command");
  ok(/const plan = target\.spellingPlan\(\);/.test(main), "the dialog counts first");
  ok(/const done = target\.uniformSpellings\(\);/.test(main), "…then applies");
  const model = readFileSync(`${SRC}model.ts`, "utf8");
  ok(/uniformSpellings\(\): SpellingPlan<EmEdge> \{[\s\S]*?this\.batch\(/.test(model),
     "the store applies it inside one batch (one undo step)");
  ok(!/uniformSpellings\(\)/.test(model.slice(0, model.indexOf("export class DocumentStore")))
     && !/constructor\(doc: EmDocument\) \{[^}]*uniformSpellings/.test(model),
     "never at load");
}

console.log(`uniform-spellings: ${checks} checks passed`);
