// MICRO-OUTLINER-EPOCHE-TOOLTIP p.2 · move / extend / take back an epoch — the pure
// rule (`src/epoch-moves.ts`), in node:
//
//   node scripts/check-epoch-moves.mjs [path/to/a.em.json]
//
// A unit: has_first_epoch moved, survive_in_epoch added and taken back (never the
// first). A model: the epoch's has_representation_model swapped / added / taken
// back (never the only one); the old form read. A container: every member with an
// epoch, the container's own edge, the members without one left (they follow it),
// the document said, the alternative split said. With an em.json (Templu Mare v9),
// Survey2015 moved and extended from XX sec to 2015.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}epoch-moves.ts`], bundle: true, format: "esm", write: false });
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const N = (id, node_type, name = id) => ({ id, node_type, name, data: {} });
const E = (source, target, edge_type) => ({ id: `${source}__${edge_type}__${target}`, source, target, edge_type });
/** apply a plan to a copy of the document, as the store does */
const apply = (doc, p) => {
  const gone = new Set(p.remove.map((e) => e.id));
  return { graph: { ...doc.graph, edges: [...doc.graph.edges.filter((e) => !gone.has(e.id)), ...p.add] } };
};
const doc = { graph: { nodes: [
  N("XX", "EpochNode", "XX sec"), N("Y15", "EpochNode", "2015"), N("Y13", "EpochNode", "2013"),
  N("US1", "US"), N("M1", "representation_model"), N("M2", "representation_model"), N("M3", "representation_model"),
  N("OLD", "representation_model"), N("G", "RepresentationModelNodeGroup", "Survey2015"), N("SF", "representation_model_sf"),
  N("TS", "resource"), N("D1", "document"),
], edges: [
  E("US1", "XX", "has_first_epoch"),
  E("XX", "M1", "has_representation_model"), E("XX", "M2", "has_representation_model"), E("XX", "M3", "has_representation_model"),
  E("OLD", "XX", "has_first_epoch"),
  E("M1", "G", "is_in_representation_model_group"), E("M2", "G", "is_in_representation_model_group"), E("SF", "G", "is_in_representation_model_group"),
  E("G", "TS", "has_linked_resource"), E("D1", "G", "has_representation_model"),
] } };

// a unit
{
  let p = M.planEpochs(doc, "US1", "move", "Y15");
  eq(p.remove.map((e) => e.id), ["US1__has_first_epoch__XX"], "unit move: the first epoch leaves");
  eq(p.add.map((e) => [e.source, e.edge_type, e.target]), [["US1", "has_first_epoch", "Y15"]], "…and the new first epoch comes");
  p = M.planEpochs(doc, "US1", "extend", "Y15");
  eq(p.add.map((e) => [e.source, e.edge_type, e.target]), [["US1", "survive_in_epoch", "Y15"]], "unit extend: survive_in_epoch");
  eq(p.remove, [], "…nothing removed");
  const d2 = apply(doc, p);
  eq(M.epochsOf(d2, "US1"), ["XX", "Y15"], "…it lives in both, the first first");
  p = M.planEpochs(d2, "US1", "remove", "Y15");
  eq(p.remove.map((e) => e.edge_type), ["survive_in_epoch"], "unit remove: the extension goes");
  p = M.planEpochs(d2, "US1", "remove", "XX");
  eq(p.refused.map((r) => r.why), ["first-epoch"], "…never the first");
  p = M.planEpochs(d2, "US1", "move", "Y15");
  eq(p.add.map((e) => e.edge_type), ["has_first_epoch"], "move onto an epoch it survives in: one first edge…");
  ok(p.remove.some((e) => e.edge_type === "survive_in_epoch") && p.remove.some((e) => e.edge_type === "has_first_epoch"), "…the survival and the old first gone");
  eq(M.planEpochs(doc, "US1", "move", "XX").refused.map((r) => r.why), ["already"], "a move where it is: refused (already)");
}
// a model
{
  let p = M.planEpochs(doc, "M3", "move", "Y15");
  eq([p.remove.map((e) => e.id), p.add.map((e) => [e.source, e.edge_type, e.target])], [["XX__has_representation_model__M3"], [["Y15", "has_representation_model", "M3"]]],
    "RM move: the epoch's has_representation_model swapped");
  p = M.planEpochs(doc, "M3", "extend", "Y15");
  eq(p.add.map((e) => [e.source, e.target]), [["Y15", "M3"]], "RM extend: one more epoch edge");
  const d2 = apply(doc, p);
  eq(M.planEpochs(d2, "M3", "remove", "Y15").remove.map((e) => e.source), ["Y15"], "RM remove: that edge");
  eq(M.planEpochs(doc, "M3", "remove", "XX").refused.map((r) => r.why), ["only-epoch"], "…never its only epoch");
  p = M.planEpochs(d2, "M3", "move", "Y13", "Y15");
  eq([p.remove.map((e) => e.source), p.add.map((e) => e.source)], [["Y15"], ["Y13"]], "a move from the epoch it was dragged from");
  p = M.planEpochs(doc, "OLD", "move", "Y15");
  eq([p.remove.map((e) => e.edge_type), p.add.map((e) => e.edge_type)], [["has_first_epoch"], ["has_representation_model"]], "the RM Manager's old form, moved, is written canonically");
}
// a container
{
  let p = M.planEpochs(doc, "G", "move", "Y15");
  ok(p.container, "a container");
  eq(p.items.map((x) => x.id).sort(), ["M1", "M2"], "every member with an epoch moves (the container has no epoch edge of its own)");
  eq(p.following, ["SF"], "a member without an epoch follows the container: left alone");
  eq(p.documents, ["D1"], "the document that publishes it: said (its date stays)");
  eq(p.warnings, [], "all members still in one epoch: no split");
  const d2 = apply(doc, p);
  eq([M.epochsOf(d2, "M1"), M.epochsOf(d2, "M2"), M.epochsOf(d2, "M3")], [["Y15"], ["Y15"], ["XX"]], "after: the members in 2015, the model outside untouched");
  p = M.planEpochs(doc, "G", "extend", "Y15");
  eq(p.add.length, 2, "extend: one edge per member");
  p = M.planEpochs(doc, "M1", "move", "Y15");
  eq(p.warnings, [{ code: "alternative-split", group: "G" }], "one member moved alone: the container's alternative no longer stands for them — said");
  // the container's own epoch edge moves with it
  const d3 = { graph: { ...doc.graph, edges: [...doc.graph.edges, E("XX", "G", "has_representation_model")] } };
  p = M.planEpochs(d3, "G", "move", "Y15");
  ok(p.remove.some((e) => e.id === "XX__has_representation_model__G") && p.add.some((e) => e.source === "Y15" && e.target === "G"), "the container's own epoch moves too");
}
// Templu Mare v9 (the file of E.D.'s tries): Survey2015 from XX sec to 2015
const path = process.argv[2];
if (path) {
  const j = JSON.parse(readFileSync(path, "utf8"));
  const g = j.graphs[j.active_graph_id] ?? Object.values(j.graphs)[0];
  const d = { graph: g };
  const byName = (n, t) => g.nodes.find((x) => x.name === n && (!t || x.node_type === t))?.id;
  const S = byName("Survey2015", "RepresentationModelNodeGroup"), XX = byName("XX sec", "EpochNode"), Y15 = byName("2015", "EpochNode");
  const t0 = performance.now();
  const mv = M.planEpochs(d, S, "move", Y15, XX);
  const ms = performance.now() - t0;
  eq(mv.items.length, 9, "Survey2015 move: its 9 meshes");
  ok(mv.items.every((x) => x.before.join() === XX && x.after.join() === Y15), "…each from XX sec to 2015");
  eq(mv.following.length, 1, "…the RMSF without an epoch follows");
  const ex = M.planEpochs(d, S, "extend", Y15, XX);
  ok(ex.items.every((x) => x.after.length === 2) && ex.remove.length === 0, "extend: each in XX sec and 2015");
  console.log(`v9: plan of Survey2015 in ${ms.toFixed(1)} ms`);
}
console.log(`check-epoch-moves: ${checks} checks OK`);
