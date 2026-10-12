// FIRMA DELLA NASCITA · in a room, the hand that signs a birth is the node's.
//
//   node scripts/check-birth-signature.mjs
//
// Measured at the desktop on 12 Oct 2026 (room `tavolo-2026-10-12`): entered
// as `editor` (Editor Uno, node password), a new node was born `created_by`
// Dev User — this computer's identity, left over from another session — while
// its name, a moment later, was signed Editor Uno. One hand now, from one
// place (`model.editorHand`): with local identity A and node session B, an
// `add_node` in a room leaves with `created_by` = B and B's access; outside
// the room, A with A's.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

// the identity module reads localStorage: a plain one, with A declared here
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
const A = "0000-0002-1825-0097";   // Dev User — this computer's identity
const B = "0000-0003-1111-1112";   // Editor Uno — the node's session
localStorage.setItem("emstudio.identities", JSON.stringify({
  current: A, known: [{ orcid: A, name: "Dev", surname: "User", verified: true, authMode: "orcid" }],
}));

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
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const store = new M.DocumentStore({
  header: { format: "em.json", version: "1.0" },
  graph: { graph_id: "tavolo", name: "Tavolo", nodes: [], edges: [] },
});
const sent = [];
store.onOp((op) => sent.push(...H.opsForLocalChange(op)));
const NODE_AUTH = { mode: "node_password", attested_by: "em.localhost:8443" };

// ── in the room: the node's person and the node's access ─────────────────────
M.setRoomAuthor(B, NODE_AUTH);
eq(M.editorHand(), { orcid: B, auth: NODE_AUTH }, "room · the hand is the node session's");
const born = store.addNode({ id: "a888c9b7", node_type: "US", name: "US_676767" });
eq([born.data.created_by, born.data.created_auth], [B, NODE_AUTH],
   "room · a birth is signed by the node's person, with its access");
const add = sent.find((op) => op.op === "add_node");
eq([add?.node?.data?.created_by, add?.node?.data?.created_auth], [B, NODE_AUTH],
   "room · the add_node that leaves carries the same signature");
store.updateNode("a888c9b7", { name: "US_676768" });
const d = store.node("a888c9b7").data;
eq([d.modified_by, d.modified_auth, d.field_clocks?.name?.by], [B, NODE_AUTH, B],
   "room · the edit and its field clock are the same hand");

// a room token the node said nothing about: the iD, and no access invented
M.setRoomAuthor(B);
eq(M.editorHand(), { orcid: B, auth: null }, "room · a token's iD without the node's word on how");

// ── out of the room: this computer's identity again ──────────────────────────
M.setRoomAuthor(null);
eq(M.editorHand(), { orcid: A, auth: { mode: "orcid" } }, "outside · the hand is this computer's");
const local = store.addNode({ id: "b999", node_type: "US", name: "US_1" });
eq([local.data.created_by, local.data.created_auth], [A, { mode: "orcid" }],
   "outside · a birth is signed by the local identity");

console.log(`check-birth-signature: ${checks} checks ok`);
