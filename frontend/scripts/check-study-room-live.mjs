// T-G1/G2 · a study brought into a room WHOLE, and each operation naming its
// graph — measured on a live node, with the real clients.
//
//   EM_HUB_BASE=http://localhost:8000 STUDY=<a copy of a study> \
//     node scripts/check-study-room-live.mjs
//
// MICRO-LO-STUDIO-IN-STANZA-NOMINA-IL-GRAFO (5 Oct 2026). Until then «Bring
// into a room…» seated the ACTIVE graph only, an operation never named its
// graph, and a room held one graph (D-A). Now the room writes the study (I-2):
//
//   G2 · it is born with every graph and the shelf (`studySections`), and the
//        seeding operations name their graph (`seedOpsForStudy`);
//   G1 · an edit of the second graph from EMStudio arrives in the second graph
//        in EM Tools, and the other way round (EM Tools' `RoomSession`, driven
//        by `EM-blender-tools/tests/live_study_room.py`);
//   B1 · a graph the study does not have is refused by name, nothing written;
//   B2 · a late client's replay names each operation's graph;
//   B3 · an edge towards a node of another graph is refused.
//
// The study is READ, never written: pass a copy (`STUDY`). The room it creates
// is left on the node, named `studio-claude-<time>`, as the proof.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import * as esbuild from "esbuild";

const BASE = process.env.EM_HUB_BASE ?? "http://localhost:8000";
const STUDY = process.env.STUDY
  ?? `${homedir()}/Documents/GitHub/_datasets/templu-mare-prove/A_sanpietro.em.json`;
const HERE = new URL(".", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;
const EMTOOLS = process.env.EMTOOLS ?? `${HERE}../../../EM-blender-tools`;

function token() {
  if (process.env.EM_TOKEN) return process.env.EM_TOKEN;
  const helper = `${HERE}../../../stratigraph-server/dev-stack/token.sh`;
  if (!existsSync(helper)) return null;
  try { return execFileSync(helper, { encoding: "utf-8" }).trim() || null; }
  catch { return null; }
}
const TOKEN = token();
if (!TOKEN) { console.log("study-room: no token — is the stack up? SKIPPED"); process.exit(0); }

globalThis.window = globalThis;
const load = async (entry) => import("data:text/javascript;base64," + Buffer.from(
  (await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm",
                         write: false })).outputFiles[0].text).toString("base64"));
const S = await load("sync.ts");
const R = await load("rooms.ts");
const W = await load("wire.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; console.log(`  ✓ ${what}`); };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++; console.log(`  ✓ ${what}`);
};
async function until(what, predicate, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const v = predicate();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString().replace(/\.\d+Z$/, "Z");

function join(room, since = null) {
  const heard = { snapshot: null, ops: [], results: [] };
  const client = new S.SyncClient();
  client.connectHub({ url: BASE, room, token: TOKEN, since }, {
    onSelect: () => {},
    onOp: (op, graphId) => heard.ops.push({ op, graphId }),
    onSnapshot: (doc) => { heard.snapshot = doc; },
    onOpResult: (r) => heard.results.push(r),
    onStatus: () => {},
  });
  return { client, heard };
}
/** As `sendHubOp` in main.ts: the graph in the envelope, out of the body. */
function send(client, op) {
  const { graph_id: graphId, ...body } = op;
  client.sendCommand(W.envelope("op", body, { graph_id: graphId }));
}

const study = JSON.parse(readFileSync(STUDY, "utf-8"));
const birth = R.studySections(study);
const ids = birth.graphs.map((g) => g.graph_id);
const units = (gid) => (study.graphs[gid]?.nodes ?? []).length;
const graphsOnly = ids.filter((g) => study.graphs[g]?.data?.em_collection !== "ShelfGraph");
const first = birth.active_graph_id;
const second = graphsOnly.find((g) => g !== first);
const firstNode = study.graphs[first].nodes[0].id;
const secondNode = study.graphs[second].nodes[0].id;
console.log(`study: ${STUDY}\n  sections ${ids.join(", ")} · active ${first} · second ${second}`);

// ── G2 · born with the study's sections, seeded whole ───────────────────────
console.log("G2 · the whole study goes into the room");
const roomId = `studio-claude-${Date.now().toString(36)}`;
const made = await fetch(`${BASE}/v1/rooms`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ room_id: roomId, title: `Studio in stanza ${roomId}`,
                         graphs: birth.graphs, active_graph_id: birth.active_graph_id }),
});
const created = await made.json();
eq(made.status, 201, `the room ${roomId} is created`);
eq(created.born_with, ids, "…born with every graph and the shelf");

const A = join(roomId);
await until("A's snapshot", () => A.heard.snapshot);
const seed = R.seedOpsForStudy(study);
for (const op of seed) send(A.client, op);
await until("every seeding op answered", () => A.heard.results.length >= seed.length, 30000);
const refusedSeed = A.heard.results.filter((r) => !r.applied);
eq(refusedSeed.map((r) => r.reason), [], "every seeding operation applied");
A.client.sendRequestSave();
// where a late client will say it stopped: the last seeding op, as the room
// stamped it (a cursor older than the log refuses the replay, rightly)
const seededUpTo = A.heard.results.map((r) => String(r.op?.ts ?? "")).sort().at(-1);

const B = join(roomId);
const doc = await until("B's snapshot", () => B.heard.snapshot);
eq(Object.keys(doc.graphs).sort(), [...ids].sort(), "a second client finds every section");
for (const gid of ids) {
  eq((doc.graphs[gid].nodes ?? []).length, units(gid), `…«${doc.graphs[gid].name}» with its ${units(gid)} node(s)`);
}
eq(doc.active_graph_id, first, "…and the graph in front is the study's");

// ── G1 · EMStudio → EM Tools, and back, in the SECOND graph ─────────────────
console.log("G1 · the second graph, both ways");
const py = `${EMTOOLS}/.venv/bin/python`;
const tokFile = process.env.TOKEN_FILE ?? "/tmp/studio-in-stanza/.tok";
const emtools = spawn(py, [`${EMTOOLS}/tests/live_study_room.py`, BASE, roomId, tokFile,
                           second, secondNode], { cwd: EMTOOLS });
const lines = [];
emtools.stdout.on("data", (d) => lines.push(...String(d).split("\n").filter(Boolean)));
emtools.stderr.on("data", (d) => process.stderr.write(`[emtools] ${d}`));
const ready = await until("EM Tools in the room", () => lines.find((l) => l.startsWith("READY")), 30000);
eq(ready.split(" ")[1].split(",").sort(), [...graphsOnly].sort(), "EM Tools adopts the room's graphs");

const tA = iso(1500);
send(A.client, { op: "update_field", node_id: secondNode, field: "description",
                 value: "scritto da EMStudio nel secondo grafo", ts: tA, graph_id: second });
const toB = await until("B hears A's edit", () => B.heard.ops.find((o) => o.op.ts === tA));
eq(toB.graphId, second, "EMStudio → EMStudio: the op arrives naming the second graph");
const got = await until("EM Tools hears it", () => lines.find((l) => l.startsWith("GOT")), 30000);
eq(got, `GOT ${second} ${secondNode} applied=True`,
   "EMStudio → EM Tools: it lands in the second graph, not in the active one");

const sent = await until("EM Tools writes", () => lines.find((l) => l.startsWith("SENT")), 30000);
eq(sent, `SENT applied=True graph=${second}`, "EM Tools → room: its edit names the second graph");
const fromEmtools = await until("B hears EM Tools", () => B.heard.ops.find(
  (o) => o.op.node_id === secondNode && String(o.op.value).includes("EM Tools")));
eq(fromEmtools.graphId, second, "EM Tools → EMStudio: it arrives naming the second graph");

// one more edit, in the FIRST graph, for the replay below
const tA2 = iso(4500);
send(A.client, { op: "update_field", node_id: firstNode, field: "description",
                 value: "nel primo grafo", ts: tA2, graph_id: first });
await until("A's second edit answered", () => A.heard.results.find((r) => r.op?.ts === tA2));

// ── B1 · a graph the study does not have ────────────────────────────────────
console.log("B1 · an invented graph");
const tB1 = iso(5000);
send(A.client, { op: "update_field", node_id: firstNode, field: "description",
                 value: "nel grafo sbagliato", ts: tB1, graph_id: "inventato" });
const b1 = await until("the refusal", () => A.heard.results.find((r) => r.op?.ts === tB1));
eq([b1.applied, b1.code, b1.reason], [false, "unknown_graph", "the graph 'inventato' is not in this study"],
   "refused by name");

// ── B3 · an edge towards another graph ──────────────────────────────────────
console.log("B3 · an edge across graphs");
const tB3 = iso(6000);
send(A.client, { op: "add_edge", id: `b3-${tB3}`, source: firstNode, target: secondNode,
                 edge_type: "is_after", ts: tB3, graph_id: first });
const b3 = await until("the refusal", () => A.heard.results.find((r) => r.op?.ts === tB3));
ok(!b3.applied && /is in the graph '.+', not in this one/.test(String(b3.reason)),
   `refused: ${b3.reason}`);

// ── B2 · a late client's replay names each graph ────────────────────────────
console.log("B2 · the replay");
const C = join(roomId, seededUpTo);
await until("C's snapshot", () => C.heard.snapshot);
const replay = await until("the replay", () => {
  const mine = C.heard.ops.filter((o) => [tA, tA2].includes(String(o.op.ts)));
  return mine.length === 2 ? mine : null;
});
eq(replay.map((o) => [o.op.ts, o.graphId]).sort(), [[tA, second], [tA2, first]].sort(),
   "each replayed operation names the graph it went to");

for (const x of [A, B, C]) x.client.disconnect();
emtools.kill();
console.log(`\nstudy-room: ${checks} checks passed · room ${roomId} left on ${BASE}`);
process.exit(0);
