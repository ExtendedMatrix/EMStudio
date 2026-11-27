// MICRO-FL1 · a deletion says on the wire everything it does here.
//
//   node scripts/check-delete-wire.mjs
//
// Measured on 27 Nov 2026 (Templum Mare, a room with one graph): a partner
// deleted an epoch node in EMStudio; Heriverse, reading the room, kept drawing
// it. `deleteNode` / `deleteNodes` took the node AND its edges away here, but
// sent only `delete_node`: the CRDT's `remove_node` marks the node and leaves
// its edges alive (on purpose — it is what «remove leaving the trace» needs),
// so every other copy kept them.
//
// THE INVARIANT — the wire says as much as the store did. For every deletion
// path: start from one document, run the local command, take the operations it
// emits through the app's own translation (`hub.opsForLocalChange`, the clock
// `hubSendLocal` puts on them), apply them with the CRDT to a clean copy of the
// starting document, and the two must agree on LIVE nodes and LIVE edges (a
// node with `data.removed` is not live; an edge with its tombstone is not live).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const M = await load("model.ts");
const H = await load("hub.ts");
const C = await load("crdt.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const T0 = "2026-11-27T08:00:00Z";
const born = { created_at: T0, created_by: "0000-0003-1111-1112" };
const n = (id, node_type, extra = {}) => ({ id, node_type, name: id, data: { ...born }, ...extra });
const e = (source, edge_type, target) => ({ id: `${source}__${edge_type}__${target}`, source, edge_type, target });

// Templum Mare in small: two epochs, a phase with a sub-phase, its temporal
// PDG and a property, units attributed, a representation model, a stratigraphy.
const document = () => ({
  header: { format: "em.json", version: "1.0" },
  graph: { graph_id: "templum", name: "Templum", nodes: [
    n("E1", "EpochNode"), n("E2", "EpochNode"),
    n("P1", "EpochNode"), n("P1a", "EpochNode"),
    n("PDG1", "ParadataNodeGroup"), n("PR1", "property"),
    n("RM1", "representation_model"),
    n("US1", "US"), n("US2", "US"), n("US3", "US"), n("US4", "US"),
  ], edges: [
    e("E1", "has_sub_epoch", "P1"),
    e("P1", "has_sub_epoch", "P1a"),
    e("P1", "has_paradata_nodegroup", "PDG1"),
    e("PR1", "is_in_paradata_nodegroup", "PDG1"),
    e("P1", "has_representation_model", "RM1"),
    e("US1", "has_first_epoch", "P1"),
    e("US2", "has_first_epoch", "P1a"),
    e("US3", "has_first_epoch", "E1"),
    e("US4", "has_first_epoch", "E2"),
    e("US3", "survive_in_epoch", "E2"),
    e("US1", "is_after", "US2"),
    e("US2", "is_after", "US3"),
    e("US3", "is_after", "US4"),
  ] },
});

const edgeKey = (x) => `${x.source}|${x.edge_type}|${x.target}`;
const liveHere = (st) => ({
  nodes: st.doc.graph.nodes.filter((x) => !C.isRemoved(x)).map((x) => x.id).sort(),
  edges: st.doc.graph.edges.filter((x) => !C.isStamped(x.attributes?.removed ?? {})).map(edgeKey).sort(),
});
const liveThere = (section) => ({
  nodes: C.liveNodes(section).map((x) => x.id).sort(),
  edges: C.liveEdges(section).map(edgeKey).sort(),
});

/** Run `act` on a store over the starting document; return what this screen
 *  shows, what the wire carried, and what a clean copy shows once it applied it. */
const run = (act) => {
  const store = new M.DocumentStore(document());
  const wire = [];
  store.onOp((op) => {
    for (const hubOp of H.opsForLocalChange(op)) {
      if (!hubOp.ts) hubOp.ts = C.nowOpIso();   // as hubSendLocal does
      wire.push(hubOp);
    }
  });
  act(store);
  const copy = structuredClone(document().graph);
  const results = C.applyOps(copy, wire);
  return { store, wire, results, here: liveHere(store), there: liveThere(copy) };
};

const PATHS = {
  "singola · deleteNode(P1a)": (st) => st.deleteNode("P1a"),
  "singola · deleteNode(US2)": (st) => st.deleteNode("US2"),
  "massiva · deleteNodes([US1, US2, P1a])": (st) => st.deleteNodes(["US1", "US2", "P1a"]),
  "massiva di uno · deleteNodes([E2])": (st) => st.deleteNodes(["E2"]),
  "fase · deletePhase(P1 → E1)": (st) => st.deletePhase("P1", "E1"),
  "epoca · deleteEpoch(E1)": (st) => st.deleteEpoch("E1"),
  "dissolvi · dissolveEpoch(E1 → E2)": (st) => ok(st.dissolveEpoch("E1", "E2") !== null, "dissolve · accepted"),
};

for (const [what, act] of Object.entries(PATHS)) {
  const { wire, results, here, there } = run(act);
  eq(there.nodes, here.nodes, `${what} · the live NODES of the copy are this screen's`);
  eq(there.edges, here.edges, `${what} · the live EDGES of the copy are this screen's`);
  eq(results.filter((r) => !r.applied).map((r) => r.reason), [],
     `${what} · every operation the wire carried applies (a refused one would be told to nobody)`);
  // the shape: edges first, then the nodes
  const firstNode = wire.findIndex((o) => o.op === "remove_node");
  ok(firstNode < 0 || !wire.slice(firstNode).some((o) => o.op === "remove_edge" || o.op === "add_edge"),
     `${what} · the edges leave before the nodes`);
}

// an edge between two deleted nodes is one edge: one remove_edge
{
  const { wire } = run((st) => st.deleteNodes(["US1", "US2"]));
  const keys = wire.filter((o) => o.op === "remove_edge").map(edgeKey);
  eq(keys.length, new Set(keys).size, "massiva · no edge is removed twice");
  ok(keys.includes("US1|is_after|US2"), "massiva · …and the edge between them is removed once");
}

// removeKeepingTrace is NOT a deletion of the edges: the trace keeps them, here
// and there (untouched by FL1)
{
  const { wire, here, there } = run((st) => st.removeKeepingTrace("US2"));
  eq(wire.map((o) => o.op), ["remove_node"], "traccia · only the tombstone leaves");
  ok(here.edges.includes("US1|is_after|US2"), "traccia · the edges stay here…");
  eq(there, here, "traccia · …and there");
}

// ── D · undo / redo on the two corrected paths ──────────────────────────────
for (const [what, act] of [["deleteNode", (st) => st.deleteNode("P1a")],
                           ["deleteNodes", (st) => st.deleteNodes(["US1", "US2", "P1a"])]]) {
  // a file: the snapshot comes back, whole
  const file = new M.DocumentStore(document());
  const start = JSON.stringify(file.doc.graph);
  act(file);
  ok(JSON.stringify(file.doc.graph) !== start, `${what} · file · the deletion happened`);
  const after = JSON.stringify(file.doc.graph);
  file.undo();
  eq(JSON.stringify(file.doc.graph), start, `${what} · file · undo puts nodes AND edges back`);
  file.redo();
  eq(JSON.stringify(file.doc.graph), after, `${what} · file · redo takes them away again`);

  // a room: a deletion cannot come back as an operation yet — the whole step
  // stays, so no add_edge goes out towards a node that remains removed
  const room = new M.DocumentStore(document());
  M.DocumentStore.liveHistory = (st) => st === room;
  const sent = [];
  const notes = [];
  room.onOp((op) => sent.push(...H.opsForLocalChange(op)));
  room.onHistory((x) => notes.push(x));
  act(room);
  const n0 = sent.length;
  const shown = JSON.stringify(room.doc.graph);
  room.undo();
  eq(sent.length, n0, `${what} · room · the undo sends nothing (no add_edge half-way)`);
  eq(notes.at(-1).refused, "delete_node", `${what} · room · …and says why`);
  eq(JSON.stringify(room.doc.graph), shown, `${what} · room · …this screen unchanged`);
  M.DocumentStore.liveHistory = null;
}

// in a room, undoing a CREATION deletes the node: its edges leave too now
{
  const room = new M.DocumentStore(document());
  M.DocumentStore.liveHistory = (st) => st === room;
  const sent = [];
  room.onOp((op) => sent.push(...H.opsForLocalChange(op)));
  room.addNode({ id: "US9", node_type: "US", name: "US 9" });
  const n0 = sent.length;
  room.undo();
  eq(sent.slice(n0).map((o) => o.op), ["remove_node"], "creation · undo removes the new node");
  ok(!room.node("US9"), "creation · …gone here");
  M.DocumentStore.liveHistory = null;
}

console.log(`delete-wire: ${checks} checks passed`);
