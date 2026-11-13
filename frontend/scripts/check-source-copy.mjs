// MICRO-PIU-FONTI · «Copia in…» between two sources — the pure part
// (`src/source-copy.ts`), in node:
//
//   node scripts/check-source-copy.mjs [path/to/TempluMare_v9.em.json]
//
// What travels with a unit (its paradata, its group, its proxies, the
// documents, resources and files they point at, the DTC that made them, their
// rights); the ids kept; the epochs (same id, same name, copied, chosen); the
// collisions with their fields and, apart, the relations (in more, in less,
// turned round), the destination winning unless chosen; an asset under embargo
// held or let out signalled; the provenance; a copy that would close a cycle
// refused. With an em.json: a group of Templu Mare's units with proxies and
// documents, file → empty graph → back.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}source-copy.ts`], bundle: true, format: "esm", write: false,
  loader: { ".json": "json" } });
const C = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const N = (id, node_type, name = id, data = {}) => ({ id, node_type, name, data });
const E = (source, edge_type, target) => ({ id: `${source}_${edge_type}_${target}`, source, target, edge_type });
const AT = "2026-11-13T05:00:00Z", TODAY = "2026-11-13";
const origin = { kind: "file", name: "a.em.json", locator: "/tmp/a.em.json", graphId: "gA", version: "7" };

const src = { graph: { graph_id: "gA", nodes: [
  N("E1", "EpochNode", "Età romana"), N("E2", "EpochNode", "Età tarda"),
  N("US1", "US", "US1", { description: "strato" }), N("US2", "US", "US2"), N("US3", "US", "US3"), N("US9", "US", "US9"),
  N("PD1", "ParadataNodeGroup", "PD US1"), N("P1", "property", "altezza", { value: "2 m" }),
  N("X1", "extractor", "D.01.01"), N("D1", "document", "D.01"), N("A1", "author", "E.D."),
  N("S1", "semantic_shape", "Shape US1"), N("R1", "resource", "shape.glb", { url: "proxies/US1.glb" }),
  N("RF1", "resource_file", "US1.glb", { url: "proxies/US1.glb", checksum: "sha256:aa", size_bytes: 10 }),
  N("T1", "dtc_process", "fotogrammetria"), N("R0", "resource", "foto.jpg", { url: "foto/1.jpg" }),
  N("R2", "resource", "rilievo riservato", { url: "x/riservato.tif", checksum: "sha256:bb" }),
  N("EMB", "embargo", "EB", { embargo_end: "2027-06-30" }), N("ACT", "ActivityNodeGroup", "Scavo 2015"),
], edges: [
  E("US1", "is_after", "US2"), E("US2", "is_after", "US3"), E("US3", "is_after", "US9"),
  E("US1", "has_first_epoch", "E1"), E("US2", "has_first_epoch", "E1"), E("US3", "has_first_epoch", "E2"),
  E("US1", "has_paradata_nodegroup", "PD1"), E("P1", "is_in_paradata_nodegroup", "PD1"), E("X1", "is_in_paradata_nodegroup", "PD1"),
  E("D1", "is_in_paradata_nodegroup", "PD1"),
  E("US1", "has_property", "P1"), E("P1", "has_data_provenance", "X1"), E("X1", "extracted_from", "D1"), E("X1", "has_author", "A1"),
  E("P1", "has_semantic_shape", "S1"), E("S1", "has_linked_resource", "R1"), E("R1", "has_file", "RF1"),
  E("T1", "dtc_had_output", "R1"), E("T1", "dtc_had_input", "R0"),
  E("D1", "has_linked_resource", "R2"), E("R2", "has_embargo", "EMB"),
  E("US1", "is_in_activity", "ACT"),
] } };

// ── 1 · what travels with a unit ─────────────────────────────────────────────
const empty = { graph: { graph_id: "gB", nodes: [N("F1", "EpochNode", "età romana")], edges: [] } };
let p = C.planCopy({ src, dst: empty, ids: ["US1"], origin, at: AT, today: TODAY });
const ids = p.nodes.map((n) => n.id).sort();
eq(ids, ["A1", "D1", "P1", "PD1", "R0", "R1", "RF1", "S1", "T1", "US1", "X1"].sort(),
  "US1 brings its paradata, group, document, author, proxy, resource, file, the DTC that made it — not US2, not the activity");
ok(!ids.includes("US2") && !ids.includes("ACT") && !ids.includes("E1"), "no other unit, no container, no epoch pulled");
eq(p.embargo.map((a) => [a.id, a.until, a.out]), [["R2", "2027-06-30", false]], "the document's resource under embargo: held");
ok(!ids.includes("R2") && !ids.includes("EMB"), "…and neither it nor its embargo node leave");
ok(p.left.some((l) => l.why === "embargo" && l.edge.target === "R2"), "its relation left out, said");
ok(p.left.some((l) => l.why === "missing_end" && l.edge.target === "US2"), "US1 → US2 left out: US2 is in neither graph");
ok(p.left.some((l) => l.why === "missing_end" && l.edge.target === "ACT"), "the activity relation left out");
eq(p.epochs, [{ id: "E1", name: "Età romana", to: "F1", how: "same_name" }], "E1 found by its name in the destination");
ok(p.edges.some((e) => e.source === "US1" && e.edge_type === "has_first_epoch" && e.target === "F1"), "…and the first epoch points at it");
eq(p.counts.units, 1, "one unit");
eq(p.files.map((f) => f.id).sort(), ["R0", "R1", "RF1"], "the resources with a file and the file");
const us1 = p.nodes.find((n) => n.id === "US1");
eq(us1.data.derived_from, { kind: "file", source: "a.em.json", locator: "/tmp/a.em.json", graph_id: "gA",
  state: { version: "7", at: AT }, copied_at: AT }, "provenance: the source, its graph, its state, when");
ok(us1.data.description === "strato", "the data travel");
ok(src.graph.nodes.find((n) => n.id === "US1").data.derived_from === undefined, "the source is not touched");

// let the embargoed asset out: it leaves signalled, with its embargo
p = C.planCopy({ src, dst: empty, ids: ["US1"], origin, at: AT, today: TODAY, choices: { embargoed: ["R2"] } });
const r2 = p.nodes.find((n) => n.id === "R2");
ok(r2 && r2.data.embargo_signalled === "2027-06-30", "let out: R2 leaves signalled");
ok(p.nodes.some((n) => n.id === "EMB") && p.edges.some((e) => e.source === "R2" && e.target === "EMB"), "…with its embargo node and relation");
// an embargo over: free
p = C.planCopy({ src, dst: empty, ids: ["US1"], origin, at: AT, today: "2027-07-01" });
eq(p.embargo.length, 0, "an embargo that ended is no embargo");
ok(C.embargoActive("Until 2030-01-01", TODAY) && !C.embargoActive("EB.", TODAY) && !C.embargoActive(null, TODAY), "embargo_active as s3dgraphy reads it");

// the epoch: missing → copied; chosen → the chosen one
const noEpoch = { graph: { graph_id: "gB", nodes: [N("G1", "EpochNode", "Medioevo")], edges: [] } };
p = C.planCopy({ src, dst: noEpoch, ids: ["US1", "US3"], origin, at: AT, today: TODAY });
eq(p.epochs.map((e) => [e.id, e.how]).sort(), [["E1", "copied"], ["E2", "copied"]], "missing epochs are copied, their ids kept");
ok(p.nodes.some((n) => n.id === "E1") && p.nodes.some((n) => n.id === "E2"), "…as nodes");
p = C.planCopy({ src, dst: noEpoch, ids: ["US1", "US3"], origin, at: AT, today: TODAY, choices: { epoch: "G1" } });
ok(p.edges.filter((e) => e.edge_type === "has_first_epoch").every((e) => e.target === "G1"), "chosen: every first epoch is G1");
ok(!p.nodes.some((n) => n.node_type === "EpochNode"), "…and no epoch is copied");

// ── 2 · collisions and divergent relations ───────────────────────────────────
const dst = { graph: { graph_id: "gB", nodes: [
  N("E1", "EpochNode", "Età romana"), N("E2", "EpochNode", "Età tarda"),
  N("US1", "US", "US1", { description: "strato di crollo" }), N("US2", "US", "US2"), N("US3", "US", "US3"), N("US9", "US", "US9"),
  N("A1", "author", "E.D."),
], edges: [
  E("US2", "is_after", "US1"),          // turned round with respect to the source
  E("US3", "abuts", "US2"),             // the source has no such relation
  E("US1", "has_first_epoch", "E1"),
] } };
p = C.planCopy({ src, dst, ids: ["US1", "US2", "US3"], origin, at: AT, today: TODAY });
const col = Object.fromEntries(p.collisions.map((c) => [c.id, c.fields]));
eq(Object.keys(col).sort(), ["A1", "US1", "US2", "US3"], "the ids already there are collisions, never new nodes");
ok(!p.nodes.some((n) => ["US1", "US2", "US3", "A1"].includes(n.id)), "…kept ids: nothing doubled");
eq(col.US1, [{ field: "data.description", src: "strato", dst: "strato di crollo" }], "US1: the field that differs");
eq(col.A1, [], "A1: the same");
const rel = Object.fromEntries(p.relations.map((r) => [r.key, r.kind]));
eq(rel, {
  "reversed:is_after|US1|US2": "reversed",
  "added:is_after|US2|US3": "added",
  "added:is_after|US3|US9": "added",
  "added:has_first_epoch|US2|E1": "added",
  "added:has_first_epoch|US3|E2": "added",
  "removed:abuts|US3|US2": "removed",
}, "relations: turned round, in more (between two nodes the destination has — a first epoch too), in less");
ok(!p.edges.some((e) => e.edge_type === "is_after"), "no conflicting relation enters by itself");
let ops = C.applyCopy(p, src, {});
eq([ops.update.length, ops.removeEdges.length, ops.edges.filter((e) => e.edge_type === "is_after").length], [0, 0, 0],
  "default: the destination wins (fields and relations)");
ops = C.applyCopy(p, src, { fields: ["US1"], relations: ["added:is_after|US3|US9"] });
eq(ops.update, [{ id: "US1", patch: { data: { description: "strato" } } }], "chosen: US1 takes the source's field");
ok(ops.edges.some((e) => e.source === "US3" && e.target === "US9" && e.edge_type === "is_after"), "chosen: the relation in more enters");
let after = C.wouldBe(dst, ops);
eq(C.newContradictions(dst, after), [], "…and the destination as it would be passes");
// US2 after US3, taken, beside the destination's «US3 abuts US2»: a cycle
const abut = C.newContradictions(dst, C.wouldBe(dst, C.applyCopy(p, src, { relations: ["added:is_after|US2|US3"] })));
eq(abut.map((x) => [x.kind, [...x.nodes].sort()]), [["cycle", ["US2", "US3"]]], "US2 after US3 against «US3 abuts US2»: a cycle, said");
ok(dst.graph.edges.length === 3 && dst.graph.nodes.find((n) => n.id === "US1").data.description === "strato di crollo",
  "wouldBe does not touch the destination");

// ── 3 · a copy that would close a cycle is refused ───────────────────────────
// the destination says US2 after US1; taking the source's US1 after US2 BESIDE it closes a cycle
ops = C.applyCopy(p, src, { relations: [] });
ops.edges.push({ ...p.relations.find((r) => r.kind === "reversed").edge });
after = C.wouldBe(dst, ops);
let probs = C.newContradictions(dst, after);
eq(probs.map((x) => [x.kind, [...x.nodes].sort()]), [["cycle", ["US1", "US2"]]], "US1 after US2 beside US2 after US1: a cycle, said");
// the same, chosen properly («turned round»: the destination's edge goes, the source's comes): no cycle
ops = C.applyCopy(p, src, { relations: ["reversed:is_after|US1|US2"] });
eq(ops.removeEdges.map((e) => e.id), ["US2_is_after_US1"], "turned round: the destination's edge goes…");
ok(ops.edges.some((e) => e.id === "US1_is_after_US2"), "…the source's comes");
eq(C.newContradictions(dst, C.wouldBe(dst, ops)), [], "…and no cycle");
// a cycle through the copy: US9 → US1 in the destination, the source brings US1 → US2 → US3 → US9
const dstC = { graph: { graph_id: "gB", nodes: [N("US9", "US", "US9"), N("E1", "EpochNode", "Età romana"), N("E2", "EpochNode", "Età tarda"),
  N("US1", "US", "US1")], edges: [E("US9", "is_after", "US1")] } };
p = C.planCopy({ src, dst: dstC, ids: ["US2", "US3"], origin, at: AT, today: TODAY });
ops = C.applyCopy(p, src, { relations: p.relations.map((r) => r.key) });
probs = C.newContradictions(dstC, C.wouldBe(dstC, ops));
ok(probs.some((x) => x.kind === "cycle" && ["US1", "US2", "US3", "US9"].every((id) => x.nodes.includes(id))), "a cycle through four units, said");
// a problem the destination already had is not the copy's
const dstOld = { graph: { graph_id: "gB", nodes: [N("Q1", "US"), N("Q2", "US")], edges: [E("Q1", "is_after", "Q2"), E("Q2", "is_after", "Q1")] } };
p = C.planCopy({ src, dst: dstOld, ids: ["US9"], origin, at: AT, today: TODAY });
eq(C.newContradictions(dstOld, C.wouldBe(dstOld, C.applyCopy(p, src))), [], "the destination's own cycle is not the copy's");
// extra checks handed in (the epochs, by the caller's store)
eq(C.newContradictions(dst, after, (d) => d.graph.edges.length > 3 ? [{ kind: "epoch", nodes: ["US3"], text: "x" }] : []).map((x) => x.kind),
  ["cycle", "epoch"], "the caller's checks are compared the same way");

// the chronology against the epochs: «US3 after US1» while US3's epoch ends before US1's begins
const dstE = { graph: { graph_id: "gB", nodes: [N("E1", "EpochNode", "Età romana", { start_time: -27, end_time: 250 }),
  N("E2", "EpochNode", "Età tarda", { start_time: 300, end_time: 600 }), N("US1", "US", "US1")],
  edges: [E("US1", "has_first_epoch", "E2")] } };
const srcE = { graph: { graph_id: "gA", nodes: [...dstE.graph.nodes, N("US3", "US", "US3")],
  edges: [E("US1", "has_first_epoch", "E2"), E("US3", "has_first_epoch", "E1"), E("US3", "is_after", "US1")] } };
p = C.planCopy({ src: srcE, dst: dstE, ids: ["US3"], origin, at: AT, today: TODAY });
probs = C.newContradictions(dstE, C.wouldBe(dstE, C.applyCopy(p, srcE)));
eq(probs.map((x) => [x.kind, x.nodes]), [["epoch_order", ["US3", "US1"]]], "US3 after US1 with US3 in an older epoch: against the epochs, said");
// a paradata ring is not a cycle of the sequence
const ring = { graph: { graph_id: "gB", nodes: [N("U", "US"), N("P", "property"), N("X", "extractor")],
  edges: [E("U", "has_property", "P"), E("P", "has_data_provenance", "X"), E("X", "extracted_from", "U")] } };
eq(C.newContradictions({ graph: { nodes: [], edges: [] } }, ring), [], "an extractor reading its own unit is not a cycle of the sequence");

// ── 4 · Templu Mare v9: a group of units with proxies and documents, file → graph → back
const path = process.argv[2];
if (path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const g = raw.graphs ? Object.values(raw.graphs)[0] : raw.graph;
  const tm = { graph: g };
  const proxied = new Set();
  for (const e of g.edges) if (e.edge_type === "has_semantic_shape") {
    const prop = e.source;
    for (const f of g.edges) if (f.edge_type === "has_property" && f.target === prop) proxied.add(f.source);
  }
  const units = [...proxied].filter((id) => /^(US|USVs|USVn|SF|VSF)$/.test(g.nodes.find((n) => n.id === id)?.node_type)).slice(0, 8);
  const name = (id) => g.nodes.find((n) => n.id === id)?.name;
  const t0 = performance.now();
  const blank = { graph: { graph_id: "room", nodes: [], edges: [] } };
  const p1 = C.planCopy({ src: tm, dst: blank, ids: units, origin: { ...origin, graphId: g.graph_id }, at: AT, today: TODAY });
  const t1 = performance.now();
  const o1 = C.applyCopy(p1, tm);
  const room = C.wouldBe(blank, o1);
  const probs1 = C.newContradictions(blank, room);
  console.log(`Templu Mare v9 · ${units.length} units with proxies (${units.map(name).join(", ")}): ` +
    `${p1.nodes.length} nodes, ${p1.edges.length} relations, ${p1.files.length} files, ${p1.left.length} left out, ` +
    `epochs ${p1.epochs.map((e) => `${e.name}:${e.how}`).join(" ")} · counts ${JSON.stringify(p1.counts)} · ${(t1 - t0).toFixed(1)} ms`);
  ok(p1.counts.units === units.length && p1.counts.documents > 0 && p1.counts.resources > 0, "Templu: units, documents, proxies travel");
  ok(p1.nodes.every((n) => g.nodes.some((m) => m.id === n.id)), "Templu: every id kept");
  eq(probs1, [], "Templu: the copy passes the checks");
  // …and back: the same units into Templu itself — all collisions, nothing new, nothing to ask
  const p2 = C.planCopy({ src: room, dst: tm, ids: units, origin: { kind: "room", name: "prova", locator: "node/prova", graphId: "room", cursor: "c1" }, at: AT, today: TODAY });
  eq(p2.nodes.filter((n) => n.node_type !== "EpochNode").length, 0, "Templu back: nothing new");
  ok(p2.collisions.every((c) => c.fields.length === 0), "Templu back: no field differs (provenance is bookkeeping)");
  console.log(`Templu Mare v9 · back: ${p2.collisions.length} collisions, ${p2.relations.length} relations in conflict ` +
    `(${[...new Set(p2.relations.map((r) => r.kind))].join(", ") || "none"})`);
  ok(p2.relations.every((r) => r.kind === "removed"), "Templu back: only relations the copy did not bring (left out) — none added or turned");
}

console.log(`check-source-copy: ${checks} checks OK`);
