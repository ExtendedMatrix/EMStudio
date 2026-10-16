/**
 * THE TWO GESTURES · create a room, and put this file on it.
 *
 * `src/rooms.ts` is the pure half — an id from a name, and what blocks the
 * gesture — so it is bundled with the project's own esbuild and exercised in
 * node, with real values. Putting a file on a room is the ENGINE's since 16 Oct
 * 2026 (`s3dgraphy.room_import`, through the bridge's `/room-import`): sections
 * 4 and 7 hold that, on the source and on the engine itself.
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

console.log("\n4 · the file goes onto the table through the ENGINE, and the graph LAST");
{
  // MICRO-PORTA-IN-STANZA-DAL-MOTORE (16 Oct 2026). Until then this section
  // checked `seedOpsForContainer`: the graph turned into operations here and
  // sent FIRST through the socket, then a second wave of updates per file. The
  // operations are the engine's now (`inventory.seed_ops`: every node before
  // any edge, the document's own stamps, the language in the op), sent LAST,
  // after the files are hosted — asserted in s3Dgraphy's tests/test_room_import.py.
  eq([R.seedOpsForContainer, R.seedOpsForStudy, R.studySections], [undefined, undefined, undefined],
     "rooms.ts seats nothing any more: no second implementation of the engine's gesture");
  const { readFileSync } = await import("node:fs");
  const main = readFileSync(new URL("../src/main.ts", import.meta.url).pathname, "utf8");
  const paint = main.slice(main.indexOf("function paintInventory("), main.indexOf("let lastInventoryReport"));
  const execute = paint.indexOf('step: "execute"');
  const done = paint.indexOf('v.state !== "done"');
  const enter = paint.indexOf("connectToHub(");
  ok(execute > 0 && done > execute && enter > done,
     "the dialog's choices go to the engine (`execute`), and EMStudio enters the room only after the run is done");
  ok(!/sendHubOp\(|seedOps/.test(paint) && !/sendHubOp\(|seedOps/.test(
       main.slice(main.indexOf("async function bringIntoRoom"), main.indexOf("function inventorySources"))),
     "…nothing of the graph goes through the socket on the way in");
  ok(!/\/asset\?media_type=|\/uploads`/.test(main), "…and no byte goes up from this page: the engine sends them");
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
  const at = main.indexOf("async function bringIntoRoom");
  ok(at > 0, "`bringIntoRoom` exists");
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
// G2 (MICRO-LO-STUDIO-IN-STANZA-NOMINA-IL-GRAFO, 5 Oct 2026): a room writes one
// study (I-2), born with the study's sections, empty, and the seeding ops name
// their graph. Since 16 Oct 2026 the ENGINE does it (`engine.birth_sections`,
// `inventory.seed_ops`): asked here, on the same study, when s3Dgraphy is beside.
console.log("7 · THE WHOLE STUDY (the engine's)");
{
  const { existsSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
  const PY = `${S3D}.venv/bin/python`;
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
  if (!existsSync(PY)) console.log("  (skipped: no s3Dgraphy venv beside this checkout)");
  else {
    const out = JSON.parse(execFileSync(PY, ["-c", `
import json, sys
from s3dgraphy.container import parse_container
from s3dgraphy.room_import import engine, inventory
c, _w = parse_container(json.loads(sys.stdin.read()))
members = engine._members(c)
ops = [dict(op, graph_id=gid) for gid, g in members for op in inventory.seed_ops(g, engine._section(g))]
print(json.dumps({"born": engine.birth_sections(members), "active": c.active_graph_id,
                  "ops": [f"{o['graph_id']}:{o['op']}:{o['id']}" for o in ops]}))`],
      { input: JSON.stringify(study), env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString());
    eq(out.born.map((g) => g.graph_id), ["tempio", "saggio", "shelf"],
       "every graph and the shelf, and not the DTC corpus (the node's own)");
    eq(out.active, "saggio", "the graph in front stays in front");
    ok(out.born.every((g) => !("nodes" in g) && !("edges" in g)), "a section is born EMPTY: no content at birth");
    eq(out.born[0].name, "Tempio Giunone Moneta", "…with its name");
    // s3Dgraphy's reading adds what a graph is born with (its `geo_<graph>`
    // position node): the study's own units are in, in their graph, in order
    eq(out.ops.filter((o) => /:(US\d|e1)$/.test(o)),
       ["tempio:add_node:US1", "tempio:add_node:US2", "tempio:add_edge:e1", "saggio:add_node:US9"],
       "each op names its graph, nodes before the edges of the same graph");
    ok(["tempio", "saggio"].every((g) => {
      const mine = out.ops.filter((o) => o.startsWith(`${g}:`)).map((o) => o.split(":")[1]);
      return mine.lastIndexOf("add_node") < (mine.indexOf("add_edge") === -1 ? Infinity : mine.indexOf("add_edge"));
    }), "…EVERY node of a graph before ANY of its edges");
    ok(!out.ops.some((o) => o.startsWith("dtc:")), "the corpus is not seeded");
  }
}

console.log(`\nrooms: ${checks} checks passed`);
