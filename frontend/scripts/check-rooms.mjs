/**
 * THE TWO GESTURES · create a room, and put this file on it.
 *
 * `src/rooms.ts` is the pure half — an id from a name, and a container turned
 * into the operations that seat it on a table — so it is bundled with the
 * project's own esbuild and exercised in node, with real values.
 *
 * The one that matters most here is the PARITY VECTOR. The room id is derived
 * from the name in TWO places — this app's File menu and the node's front door
 * (`stratigraph-server/app/rooms_ui/rooms.js::createRoom`) — and two doors that
 * derive it differently turn one name into two rooms, which is precisely the
 * ambiguity «one room, one live graph» exists to prevent. The same vector is
 * asserted by `stratigraph-server/tests/test_room_id_parity.py`, so a change to
 * one side that is not made to the other turns a suite red in whichever repo the
 * author was not looking at.
 */

import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}rooms.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const R = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// ── 1 · THE PARITY VECTOR · the same names, the same ids, in two repos ───────
//
// KEEP IN STEP WITH `stratigraph-server/tests/test_room_id_parity.py`.
export const PARITY = [
  ["Sarmizegetusa 1978", "sarmizegetusa-1978"],
  ["  Templu Mare  ", "templu-mare"],
  // an em dash is not a letter, so it collapses like any other run
  ["Aiano — Torraccia di Chiusi", "aiano-torraccia-di-chiusi"],
  // the slash MUST go: the server refuses an id with one, because an id is one
  // path segment
  ["US 101 / US 102", "us-101-us-102"],
  ["Ercolano (2026)", "ercolano-2026"],
  ["Ostia Antica: Terme del Nuotatore", "ostia-antica-terme-del-nuotatore"],
  // a name of only punctuation derives NOTHING, and the two doors do different
  // things about that on purpose — see check 3
  ["???", ""],
  ["", ""],
  // and the SHARED QUIRK, pinned deliberately: the trim happens BEFORE the cut,
  // so a truncation at 60 can leave a trailing dash. Harmless (the server's only
  // rules are «one segment, no spaces») but it must not differ between the two
  // doors — a quirk both have is a quirk; a quirk one has is a bug.
  ["x".repeat(59) + " coda", "x".repeat(59) + "-"],
];

console.log("1 · the id a name produces, in both doors");
for (const [name, id] of PARITY) {
  eq(R.roomIdFromName(name), id, `«${name.slice(0, 34)}» → «${id.slice(0, 34)}»`);
}
ok(PARITY.every(([, id]) => !/[/\\ ]/.test(id)),
   "no derived id carries a slash, a backslash or a space — the server refuses "
   + "those, and an id is one path segment");
ok(PARITY.every(([, id]) => id.length <= 60), "…and none is longer than 60");

console.log("\n2 · deriving is idempotent, WITH ONE DECLARED EXCEPTION");
//
// Found by this check, which is why it exists: the trailing-dash quirk BREAKS
// idempotence. An id that came back from a door, fed in again, loses its dash
// and is a different id. Nothing re-derives an id today, so this costs nothing —
// but a check asserting idempotence everywhere would have been a check that
// lies, and the exception is pinned rather than the property deleted.
for (const [, id] of PARITY) {
  if (!id) continue;
  if (id.endsWith("-")) {
    eq(R.roomIdFromName(id), id.slice(0, -1),
       "the truncation artefact is NOT idempotent: re-deriving strips the dash "
       + "the cut left behind — declared, and harmless only because an id is "
       + "never derived twice");
    continue;
  }
  eq(R.roomIdFromName(id), id, `«${id.slice(0, 30)}» derives to itself`);
}

console.log("\n3 · a name that derives NOTHING is refused rather than invented");
{
  ok(!R.nameIsUsable("???"), "«???» cannot make a room");
  ok(!R.nameIsUsable("   "), "…nor can whitespace");
  ok(R.nameIsUsable("Sarmizegetusa 1978"), "a real name can");
  // WHY IT DIFFERS FROM THE FRONT DOOR, on purpose: the door falls back to
  // `room-<timestamp>` for somebody who can see the list they just added to.
  // Here the room becomes the LIVE COPY of the document on screen, and being
  // sent to work in `room-lz4f9k` is a worse outcome than one more keystroke.
  ok(R.roomIdFromName("???") === "" && !R.nameIsUsable("???"),
     "…and the refusal is derived from the same function, not a second rule");
}

console.log("\n4 · the upload that turns a file into a place, as OPERATIONS");
{
  const graph = {
    nodes: [
      { id: "n1", name: "US 1", data: { created_at: "2020-03-01T10:00:00Z" } },
      { id: "n2", name: "US 2",
        data: { created_at: "2020-03-01T10:00:00Z",
                modified_at: "2024-07-09T08:30:00Z" } },
      { id: "n3", name: "US 3" },
      { name: "no id at all" },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", edge_type: "is_before" },
      { source: "n2", target: "n3", edge_type: "is_before" },   // no id
    ],
  };
  const ops = R.seedOpsForContainer(graph);

  eq(ops.filter((o) => o.op === "add_node").length, 3,
     "one add_node per node THAT HAS AN ID — a node without one cannot be "
     + "addressed by any later operation, so seating it would put something in "
     + "the room nothing can ever refer to");
  eq(ops.filter((o) => o.op === "add_edge").length, 1,
     "…and the same for edges");

  const names = ops.map((o) => o.op);
  ok(names.lastIndexOf("add_node") < names.indexOf("add_edge"),
     "EVERY node before ANY edge: an edge naming a node the room has not seen "
     + "is an edge held in the air, and a reader looking at the room mid-seed "
     + "would see a graph with dangling arrows");

  // THE STAMPS ARE THE DOCUMENT'S OWN
  const byId = new Map(ops.filter((o) => o.op === "add_node").map((o) => [o.id, o]));
  eq(byId.get("n1").ts, "2020-03-01T10:00:00Z",
     "a node with only a creation stamp travels with THAT");
  eq(byId.get("n2").ts, "2024-07-09T08:30:00Z",
     "…and one edited later travels with the later hand — `modified_at` wins, "
     + "which is the rule the field-level merge arbitrates on");
  eq(byId.get("n3").ts, undefined,
     "…and a node with no stamp gets NONE invented: re-stamping on the way in "
     + "would make a ten-year-old excavation look like it happened the "
     + "afternoon somebody uploaded it");

  // nothing is dropped and nothing is added
  eq(byId.get("n1").node.name, "US 1", "the node itself travels whole");
  eq(R.seedOpsForContainer(null), [], "no graph, no operations");
  eq(R.seedOpsForContainer({}), [], "…and an empty one is not an error either");
}

console.log("\n5 · the LADDER gates the gesture, and it is the ladder we have");
{
  // Creating a room writes an ACL naming its owner, so the node has to know who
  // that is — `POST /v1/rooms` answers 401 for exactly this reason. The prompt's
  // rule: the gesture asks for the RUNG, not for a form.
  eq(R.whatBlocksTheGesture(false, false), "signature",
     "nobody declared: the missing rung is the SIGNATURE — and asking for a "
     + "login first would say that without this node you do not exist");
  eq(R.whatBlocksTheGesture(false, true), "signature",
     "…and a token without a declared signature is still the signature's turn: "
     + "the ladder is climbed, not skipped");
  eq(R.whatBlocksTheGesture(true, false), "confirmation",
     "declared but unconfirmed: NOW the node's confirmation is the next rung");
  eq(R.whatBlocksTheGesture(true, true), null, "confirmed: nothing blocks it");
}

console.log("\n6 · THE CHEAP REFUSAL COMES FIRST");
{
  // Measured in the browser, and it changed the code: with a declared-but-
  // unconfirmed signature and no document open, «bring this into a new room»
  // sent the person through a whole OIDC round trip against the realm — and
  // would have greeted them on the way back with «there is no graph open to put
  // on a table». A journey to learn something that was true before it started.
  //
  // Asserted on the SOURCE, because the order is the whole property and it is
  // invisible in any single return value.
  const { readFileSync } = await import("node:fs");
  const main = readFileSync(new URL("../src/main.ts", import.meta.url).pathname, "utf8");
  const at = main.indexOf("async function createRoomHere");
  ok(at > 0, "`createRoomHere` exists");
  const body = main.slice(at, main.indexOf("\n}\n", at));
  const document_ = body.indexOf('t("room.bringNeedsDocument")');
  const ladder = body.indexOf("whatBlocksTheGesture(");
  ok(document_ > 0 && ladder > 0, "both guards are there");
  ok(document_ < ladder,
     "the local certainty («no graph is open») is answered BEFORE the rung, "
     + "because the rung can cost a redirect to an identity provider and the "
     + "other cannot cost anything");
  ok(body.indexOf("askRoomName(") > ladder,
     "…and the NAME is asked after both, so nobody types one into a gesture "
     + "that was already going to refuse");
}

// ── 7 · THE WHOLE STUDY · every graph and the shelf, each op naming its graph ─
//
// G2 (MICRO-LO-STUDIO-IN-STANZA-NOMINA-IL-GRAFO, 5 Oct 2026): «Bring into a
// room…» seated the active graph only. A room writes one study (I-2): it is
// born with the study's sections, empty, and the seeding ops name their graph.
console.log("7 · THE WHOLE STUDY");
{
  const unit = (id) => ({ id, node_type: "US", name: id, data: { created_at: "2026-10-05T10:00:00Z" } });
  const study = {
    header: { format: "em.json", version: "1.0" },
    graphs: {
      tempio: { graph_id: "tempio", name: "Tempio Giunone Moneta", data: { language: "it" },
                nodes: [unit("US1"), unit("US2")],
                edges: [{ id: "e1", source: "US1", target: "US2", edge_type: "is_after" }] },
      saggio: { graph_id: "saggio", name: "Saggio", nodes: [unit("US9")], edges: [] },
      shelf: { graph_id: "shelf", name: "Shelf", data: { em_collection: "ShelfGraph" },
               nodes: [{ id: "r1", node_type: "link", name: "podio.glb", data: {} }], edges: [] },
      dtc: { graph_id: "dtc", name: "DTC", data: { em_collection: "DTCCorpus" },
             nodes: [unit("D1")], edges: [] },
    },
    active_graph_id: "saggio",
  };
  const born = R.studySections(study);
  eq(born.graphs.map((g) => g.graph_id), ["tempio", "saggio", "shelf"],
     "every graph and the shelf, and not the DTC corpus (the node's own)");
  eq(born.active_graph_id, "saggio", "the graph in front stays in front");
  ok(born.corpus === true, "…and the corpus that stayed out is said");
  eq(born.graphs[0], { graph_id: "tempio", name: "Tempio Giunone Moneta", data: { language: "it" } },
     "a section is born EMPTY: id, name and header, no nodes and no edges");
  ok(born.graphs.every((g) => !("nodes" in g) && !("edges" in g)), "no content at birth");

  const ops = R.seedOpsForStudy(study);
  eq(ops.map((o) => `${o.graph_id}:${o.op}:${o.id}`),
     ["tempio:add_node:US1", "tempio:add_node:US2", "tempio:add_edge:e1",
      "saggio:add_node:US9", "shelf:add_node:r1"],
     "each op names its graph, nodes before the edges of the same graph");
  ok(!ops.some((o) => o.graph_id === "dtc"), "the corpus is not seeded");
}

console.log(`\nrooms: ${checks} checks passed`);
