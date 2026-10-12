// TAVOLO 2 · the history of a ROOM's document: an undo is an operation.
//
//   node scripts/check-room-history.mjs
//
// Measured on the table of 12 Oct 2026 (prova 2): `undo()` put US6 back on A's
// screen only — no frame left, B and the room kept the value A had abandoned —
// and entering a room left `dirty: true` with one undo step that undid nothing.
// This holds the store's half of the cure, with no socket: the operations an
// undo emits are what `hubSendLocal` sends, through the app's own translation
// (`hub.opsForLocalChange`).
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

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const ME = "0000-0003-1111-1112";
const OTHER = "0000-0003-2222-2221";
const document = () => ({
  header: { format: "em.json", version: "1.0" },
  graph: { graph_id: "tavolo", name: "Tavolo", nodes: [
    { id: "US6", node_type: "US", name: "US 6", description: "prima",
      data: { created_at: "2026-10-12T07:00:00Z", created_by: OTHER } },
    { id: "US7", node_type: "US", name: "US 7",
      data: { created_at: "2026-10-12T07:00:00Z", created_by: OTHER } },
  ], edges: [] },
});

const room = new M.DocumentStore(document());
M.DocumentStore.liveHistory = (st) => st === room;
M.setRoomAuthor(ME);
const sent = [];
const notes = [];
room.onOp((op) => sent.push(...H.opsForLocalChange(op)));
room.onHistory((n) => notes.push(n));

// ── entering: the layout computed for a document that came without one ──────
room.setLayout({ positions: { US6: { x: 0, y: 0, w: 10, h: 10 } } }, { initial: true });
eq([room.undoDepth, room.dirty], [0, false],
   "entry · the computed layout is not a step and does not dirty the document");

// ── an edit, then its undo: an OPERATION, with the old value and a new clock ─
room.updateNode("US6", { name: "US 6 · prima dell'undo" });
const edit = sent.at(-1);
eq([edit.op, edit.field, edit.value], ["update_field", "name", "US 6 · prima dell'undo"],
   "undo · the edit leaves as an update_field");
ok(/\.\d{3}Z$/.test(edit.ts), "undo · …with the clock of an operation (milliseconds)");
eq(room.node("US6").data.field_clocks.name.by, ME,
   "undo · …and the local clock carries the room's identity for this session");
await new Promise((r) => setTimeout(r, 3));
room.undo();
const back = sent.at(-1);
eq([back.op, back.field, back.value], ["update_field", "name", "US 6"],
   "undo · the undo LEAVES: the previous value, as an update_field");
ok(back.ts > edit.ts, "undo · …under a NEW clock, later than the edit it takes back");
eq(room.node("US6").name, "US 6", "undo · …and this screen shows the previous value");
eq(notes.at(-1), { kind: "undo", fields: 1, acts: 0, skipped: [] },
   "undo · the Log is told what left");

room.redo();
eq([sent.at(-1).field, sent.at(-1).value], ["name", "US 6 · prima dell'undo"],
   "redo · the redo leaves too, with the value the undo took back");
eq(room.node("US6").name, "US 6 · prima dell'undo", "redo · …and shows it");

// ── somebody else's operation is not a step of my history ───────────────────
const depth = room.undoDepth;
room.applyRemoteOp({ op: "update_node", node_id: "US7", patch: { name: "US 7 · di B" } });
eq(room.undoDepth, depth, "remote · an operation from somebody else pushes no step");

// ── a field somebody wrote after me is theirs: the undo leaves it alone ─────
room.updateNode("US6", { description: "mia" });
const n = sent.length;
const theirs = { ts: new Date(Date.now() + 1000).toISOString(), by: OTHER };
room.adoptRoomField("US6", "description", "di B, dopo", theirs, false);
room.undo();
eq(sent.length, n, "skip · nothing leaves for a field somebody wrote after me");
eq(room.node("US6").description, "di B, dopo", "skip · …their value stays");
eq(notes.at(-1).skipped, [{ nodeId: "US6", field: "description" }],
   "skip · …and the Log is told which field was not undone");

// ── structure: a node made by the step is removed, an edge put back ─────────
room.addNode({ id: "US8", node_type: "US", name: "US 8" });
room.undo();
eq(sent.at(-1).op, "remove_node", "structure · undoing a creation sends remove_node");
ok(!room.node("US8"), "structure · …and the node is gone here");
room.addEdge("US6", "US7", "is_after");
room.deleteEdge(room.doc.graph.edges.find((e) => e.source === "US6"));
room.undo();
eq(sent.at(-1).op, "add_edge", "structure · undoing an edge's removal sends add_edge");
ok(room.doc.graph.edges.some((e) => e.source === "US6" && e.target === "US7"),
   "structure · …and the relation is back here");

// ── a deletion cannot come back as an operation yet: said, nothing changed ──
room.deleteNode("US7");
const before = sent.length;
room.undo();
eq(sent.length, before, "delete · undoing a node's deletion sends nothing");
eq(notes.at(-1).refused, "delete_node", "delete · …and says why");
ok(!room.node("US7"), "delete · …the node stays deleted, on screen as in the room");

// ── outside a room nothing changed: a snapshot, and no operation ────────────
const file = new M.DocumentStore(document());
const fileSent = [];
file.onOp((op) => fileSent.push(op));
file.updateNode("US6", { name: "x" });
file.undo();
eq([file.node("US6").name, fileSent.length], ["US 6", 1],
   "file · outside a room an undo restores the snapshot and sends nothing");
M.setRoomAuthor(null);
M.DocumentStore.liveHistory = null;

console.log(`room-history: ${checks} checks passed`);
