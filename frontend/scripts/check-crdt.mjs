// P4.1 · executable check of src/crdt.ts — the algebra, and its PARITY with Python.
//
//   node scripts/check-crdt.mjs
//
// Two implementations that never meet must be comparable on something. That
// something is `testdata/crdt-parity.json` — the SAME file as
// `s3Dgraphy/tests/fixtures/crdt-parity.json` — and the canonical digest it
// carries. If either side changes its mind about a tie-break, a fallback or a
// field clock, the digests part company and this fails instead of two projects
// quietly diverging on somebody's disk.
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
const C = await load("crdt.ts");
const K = await load("container.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const ANNA = "0000-0002-1825-0097";
const BRUNO = "0000-0001-5109-3700";
const T1 = "2026-08-13T10:00:00Z";
const T2 = "2026-08-13T11:00:00Z";
const T3 = "2026-08-13T12:00:00Z";

const node = (id = "US1", data) => ({ id, node_type: "US", name: id,
                                      ...(data ? { data } : {}) });
const section = (...nodes) => ({ graph_id: "scavo", name: "Scavo",
                                 nodes: nodes.map((n) => structuredClone(n)), edges: [] });
const digest = (s) => K.contentDigest({ graphs: { [s.graph_id]: s },
                                        active_graph_id: s.graph_id });

// ── 1 · commutatività ───────────────────────────────────────────────────────
{
  const base = node("US1", { created_at: T1, created_by: ANNA });
  const l1 = [
    { op: "update_field", node_id: "US1", field: "description", value: "muro in opus",
      ts: T2, author: ANNA },
    { op: "update_field", node_id: "US1", field: "data.value", value: "1.20",
      ts: T2, author: ANNA },
  ];
  const l2 = [
    { op: "update_field", node_id: "US1", field: "description",
      value: "muro di fondazione", ts: T3, author: BRUNO },
    { op: "add_node", node: node("US2"), ts: T2, author: BRUNO },
  ];
  const a = section(base); C.applyOps(a, [...l1, ...l2]);
  const b = section(base); C.applyOps(b, [...l2, ...l1]);
  eq(digest(a), digest(b), "L1∘L2 and L2∘L1 converge");
  const us1 = a.nodes.find((n) => n.id === "US1");
  eq(us1.description, "muro di fondazione", "…on the more recent value");
  eq(us1.data.value, "1.20", "…keeping the field nobody contested");
}

// ── 2 · idempotenza ─────────────────────────────────────────────────────────
{
  const s = section(node("US1", { created_at: T1, created_by: ANNA }));
  const op = { op: "update_field", node_id: "US1", field: "description",
               value: "muro", ts: T2, author: ANNA };
  const first = C.applyOp(s, op);
  const after = digest(s);
  const second = C.applyOp(s, op);
  ok(first.applied && !second.applied, "the second application does nothing");
  eq(second.reason, "idempotent", "…and says why");
  eq(digest(s), after, "…the state is byte-identical");

  const late = C.applyOp(s, { op: "update_field", node_id: "US1",
                              field: "description", value: "vecchio",
                              ts: T1, author: BRUNO });
  eq(late.reason, "stale", "a late op is refused as stale, not applied");
  eq(s.nodes[0].description, "muro", "…and the newer value stands");
}

// ── 3 · delete vs edit ──────────────────────────────────────────────────────
{
  const s = section(node("US1", { created_at: T1, created_by: ANNA }));
  C.applyOp(s, { op: "update_field", node_id: "US1", field: "description",
                 value: "edit", ts: T1, author: ANNA });
  C.applyOp(s, { op: "remove_node", id: "US1", ts: T2, author: BRUNO });
  ok(C.isRemoved(s.nodes[0]), "a deletion later than the edit wins");
  eq(s.nodes.length, 1, "…the node stays in the RECORD (it is a tombstone)");
  eq(C.liveNodes(s).length, 0, "…and the VIEW hides it");

  C.applyOp(s, { op: "update_field", node_id: "US1", field: "description",
                 value: "ci ripenso", ts: T3, author: ANNA });
  ok(!C.isRemoved(s.nodes[0]), "an edit later than the deletion resurrects it");
  eq(C.liveNodes(s).length, 1, "…deliberately, and visibly");
}

// ── 4 · field-level ─────────────────────────────────────────────────────────
{
  const mine = node("US1", { created_at: T1, created_by: ANNA, modified_at: T2,
                             modified_by: ANNA,
                             field_clocks: { description: { ts: T2, by: ANNA } } });
  mine.description = "muro in opus";
  const theirs = node("US1", { created_at: T1, created_by: ANNA, modified_at: T3,
                               modified_by: BRUNO, dating: "II sec. d.C.",
                               field_clocks: { "data.dating": { ts: T3, by: BRUNO } } });
  theirs.description = "base";
  const out = C.mergePayloads(mine, theirs);
  eq(out.payload.description, "muro in opus", "the field A stamped is kept");
  eq(out.payload.data.dating, "II sec. d.C.", "…and the field B stamped too");
  eq(out.fields.length, 0, "nothing was lost, so nothing is reported");
}

// ── 5 · stesso campo, concorrenti ───────────────────────────────────────────
{
  const s = section(node("US1", { created_at: T1 }));
  C.applyOp(s, { op: "update_field", node_id: "US1", field: "description",
                 value: "di Anna", ts: T2, author: ANNA });
  C.applyOp(s, { op: "update_field", node_id: "US1", field: "description",
                 value: "di Bruno", ts: T2, author: BRUNO });
  eq(s.nodes[0].description, "di Bruno",
     "same instant → the smaller iD decides, stably and declared");
  eq(s.nodes[0].data.field_clocks.description.by, BRUNO, "…and the clock records it");

  const a = node("US1", { created_at: T1, modified_at: T2, modified_by: ANNA });
  a.description = "di Anna";
  const b = node("US1", { created_at: T1, modified_at: T3, modified_by: BRUNO });
  b.description = "di Bruno";
  eq(C.canonicalValue(C.mergePayloads(a, b).payload),
     C.canonicalValue(C.mergePayloads(b, a).payload),
     "merging is symmetric: A∪B and B∪A are the same payload");
  const lost = C.mergePayloads(a, b).fields[0];
  eq(lost.field, "description", "the contested field is named");
  eq(lost.loserValue, "di Anna", "…and the value that lost travels with it");
  eq(lost.winner.by, BRUNO, "…with who won");
}

// ── 6 · PARITÀ con Python ───────────────────────────────────────────────────
{
  const fixture = JSON.parse(
    readFileSync(new URL("../testdata/crdt-parity.json", import.meta.url), "utf8"));
  const s = structuredClone(fixture.section);
  C.applyOps(s, fixture.ops);
  eq(digest(s), fixture.expected_digest,
     "the TS algebra lands on the digest s3Dgraphy computes for the same op-log");
  const reversed = structuredClone(fixture.section);
  C.applyOps(reversed, [...fixture.ops].reverse());
  eq(digest(reversed), fixture.expected_digest,
     "…and so does the reverse order (convergence, measured across languages)");
}

// ── P4.1b · la timbratura è l'atto, e svuotare ha il suo tombstone ──────────
{
  // D1 · writing a field always stamps it — both doors into the algebra
  const s = section(node("US1", { created_at: T1, created_by: ANNA }));
  C.applyOp(s, { op: "update_field", node_id: "US1", field: "description",
                 value: "muro", ts: T2, author: ANNA });
  eq(s.nodes[0].data.field_clocks.description, { ts: T2, by: ANNA },
     "an update_field op writes the value AND its clock, in one act");
  ok(!C.unstampedFields(s.nodes[0]).includes("description"),
     "…so the guard has nothing to say about it");

  const sneaky = structuredClone(s.nodes[0]);
  sneaky.data.dating = "scritto di nascosto";       // the bug: no clock
  ok(C.unstampedFields(sneaky).includes("data.dating"),
     "a field written outside the act IS seen by the guard");
}

{
  // D2 · field tombstone, symmetric to the node's
  const a = node("US1", { created_at: T1 });
  C.writeField(a, "description", "muro", { ts: T1, by: ANNA });
  const b = structuredClone(a);
  C.clearField(b, "description", { ts: T2, by: BRUNO });

  const out = C.mergePayloads(a, b);
  eq(out.payload.description, undefined, "a removal later than the edit wins");
  ok(C.fieldTombstone(out.payload, "description") !== null,
     "…and the mark travels, so a third merge still knows");
  eq(out.fields[0].winner.removed, true, "…the report says what won was an emptying");

  const c = structuredClone(b);
  C.writeField(c, "description", "ci ripenso", { ts: T3, by: ANNA });
  const back = C.mergePayloads(b, c);
  eq(back.payload.description, "ci ripenso", "an edit later than the removal resurrects it");
  eq(back.fields[0].reason, "resurrected", "…deliberately, and it is reported");
}

{
  // D3 · emptying ≠ never having had — the two P4.1/P4.1b rules coexist
  const emptied = node("US1", { created_at: T1 });
  C.writeField(emptied, "description", "c'era", { ts: T1, by: ANNA });
  C.clearField(emptied, "description", { ts: T2, by: ANNA });
  const neverHad = node("US1", { created_at: T1 });
  const out = C.mergePayloads(emptied, neverHad);
  eq(out.payload.description, undefined, "a deliberate emptying stays empty");
  ok(C.fieldTombstone(out.payload, "description") !== null, "…because it left a mark");

  const hasIt = node("US1", { created_at: T1 });
  C.writeField(hasIt, "data.nota", "una nota", { ts: T1, by: ANNA });
  const plain = node("US1", { created_at: T2 });
  eq(C.mergePayloads(hasIt, plain).payload.data.nota, "una nota",
     "…while a field the other never had is still KEPT (absence is not deletion)");
}

{
  // D5 · parity on the NEW fixture: field clocks + field tombstones
  const fixture = JSON.parse(readFileSync(
    new URL("../testdata/crdt-parity-fields.json", import.meta.url), "utf8"));
  const s = structuredClone(fixture.section);
  C.applyOps(s, fixture.ops);
  eq(digest(s), fixture.expected_digest,
     "field clocks and field tombstones land on the digest s3Dgraphy computes");
  const reversed = structuredClone(fixture.section);
  C.applyOps(reversed, [...fixture.ops].reverse());
  eq(digest(reversed), fixture.expected_digest,
     "…and the reverse order lands there too");
}

{
  // CATENA · the declared attributes of an add_edge (an heir's `inherited`):
  // the SAME fixture as s3Dgraphy/tests/fixtures/crdt-parity-edge-attrs.json
  const fixture = JSON.parse(readFileSync(
    new URL("../testdata/crdt-parity-edge-attrs.json", import.meta.url), "utf8"));
  const s = structuredClone(fixture.section);
  C.applyOps(s, fixture.ops);
  const byId = Object.fromEntries(s.edges.map((e) => [e.id, e]));
  eq(byId["USV7__has_property__P1"].attributes.inherited, true,
     "an add_edge carries `inherited` to the other side");
  eq(byId["US5__has_property__P1"].attributes,
     { created_at: "2026-08-13T10:00:00Z", created_by: "0000-0002-1825-0097" },
     "…and the clock keys an op sends (created_at, removed) are not the op's to set");
  eq(digest(s), fixture.expected_digest,
     "declared edge attributes land on the digest s3Dgraphy computes");
  const reversed = structuredClone(fixture.section);
  C.applyOps(reversed, [...fixture.ops].reverse());
  eq(digest(reversed), fixture.expected_digest, "…in either order");
}

// ── the WHOLE `data` map travels, not half of it ─────────────────────────────
//
// The bug this guards against, measured live: a rights edit changed a node's
// NAME through `updateNode` (which emits an operation) and then wrote the
// node's `data` with a bare `Object.assign` — silent. The room received the new
// name and kept the old `data.license_type`, and the server (which reads the
// data first) went on serving the licence nobody had chosen any more.
//
// The cure had to be at the ROOT, not on the licence: every content field —
// `name`, `description`, and every `data.*` key — is stamped and emitted, so a
// change to two of them at once arrives as two operations and neither sibling
// is left stale. That is what this checks, on an ordinary node, with no rights
// in sight.
{
  const M = await load("model.ts");
  const H = await load("hub.ts");

  const document = () => ({
    header: { format: "em.json", version: "1.0" },
    graph: { graph_id: "g", name: "g", nodes: [
      { id: "R1", node_type: "resource", name: "foto",
        data: { checksum: "sha256:aa", media_type: "image/png", size: 10 } },
    ], edges: [] },
  });
  const store = new M.DocumentStore(document());

  const sent = [];
  store.onOp((op) => sent.push(...H.opsForLocalChange(op)));

  // TWO data fields at once, plus the name — one act
  store.updateNode("R1", {
    name: "prospetto",
    data: { checksum: "sha256:aa", media_type: "image/tiff", size: 42 },
  });

  const byField = new Map(sent.filter((o) => o.op === "update_field")
                              .map((o) => [o.field, o.value]));
  eq(byField.get("name"), "prospetto", "data · the name travels");
  eq(byField.get("data.media_type"), "image/tiff",
     "data · …and so does the first data field");
  eq(byField.get("data.size"), 42,
     "data · …and the SECOND one, which is the half that used to be lost");
  ok(!byField.has("data.checksum"),
     "data · an untouched sibling is not re-sent: only what changed is news");

  // …and the receiving side lands on the same document. Applying the operations
  // to a fresh copy must reproduce every field, not just the one somebody
  // happened to test with.
  const far = new M.DocumentStore(document());
  // …through `applyCrdtOp`, which is the path a ROOM takes: the relay speaks
  // per-field CRDT operations and the store applies them as such.
  for (const op of sent) far.applyCrdtOp(op);
  const landed = far.node("R1");
  eq(landed.name, "prospetto", "data · the far side has the name");
  eq(landed.data.media_type, "image/tiff", "data · …and the first field");
  eq(landed.data.size, 42, "data · …and the second: no stale sibling");
  eq(landed.data.checksum, "sha256:aa",
     "data · …and what nobody touched is still there");
}

console.log(`crdt: ${checks} checks passed`);
