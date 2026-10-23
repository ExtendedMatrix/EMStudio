// MICRO-SERVSF-FINE-ISTANZE p.3 · the instances of one object across the
// epochs (`src/epoch-instances.ts`): the chain read as s3Dgraphy reads it
// (`spatiotemporal.epoch_instances`, compared on the same documents when the
// s3Dgraphy venv is there — a synthetic chain and every special find of the
// GT16 when its copy is given), the geometry ONE and the position per instance,
// and what «a new instance in an epoch» writes.
//
//   node scripts/check-epoch-instances.mjs [GT16.em.json]
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = new URL("../src/", import.meta.url).pathname;
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./epoch-instances"; export { buildSpace } from "./space"; export { isStratigraphicType } from "./rules";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false });
const I = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
/** s3Dgraphy's epoch_instances for each id, on a whole em.json */
function oracle(em, ids) {
  if (!existsSync(PY)) return null;
  const script = `
import json,sys
from s3dgraphy import api
d = json.loads(sys.stdin.read())
g, w = api.load_emjson(d["doc"])
print(json.dumps({i: api.epoch_instances(g, i) for i in d["ids"]}))`;
  return JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify({ doc: em, ids }), maxBuffer: 1 << 28,
    env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
}
// s3Dgraphy's loader normalises a model's transform (the quaternion computed,
// the identity for a model that has none): the placements are compared by
// model, type and POSITION, «none» read as the identity on both sides
const pos = (t) => (t && Array.isArray(t.position) ? t.position.map(Number) : [0, 0, 0]);
const pick = (rs) => rs.map((r) => ({ id: r.id, name: r.name, node_type: r.node_type, first_epoch: r.first_epoch, epochs: r.epochs,
  conservation_state: r.conservation_state, placements: r.placements.map((p) => ({ model: p.model, node_type: p.node_type, position: pos(p.transform) })),
  geometry: r.geometry, geometry_from: r.geometry_from }));

// ── a capital: an SF today, the USD of its collapse, a VSF in its Roman place ─
const ep = (id, a, b) => ({ id, node_type: "EpochNode", name: id, data: { start_time: a, end_time: b } });
const n = (id, t, data = {}) => ({ id, node_type: t, name: id, description: "", data });
const e = (s, t, type) => ({ id: `${s}-${type}-${t}`, source: s, target: t, edge_type: type });
const XF = (x) => ({ position: [x, 2, 0], rotation: [0, 0, 0], rotation_order: "XYZ", angle_unit: "deg", scale: [1, 1, 1], up_axis: "Z" });
const graph = {
  graph_id: "g1", name: "g",
  nodes: [ep("II", 100, 199), ep("PA", 200, 1800), ep("XX", 1801, 2013),
    n("SF1", "SF"), n("USD1", "USD"), n("VSF1", "VSF"), n("US9", "US"),
    n("P_geo", "property", { property_type: "geometry" }), n("S1", "semantic_shape", { transform: XF(9) }),
    n("P_st1", "property", { property_type: "conservation_state", value: "fragmentary" }),
    n("P_st3", "property", { property_type: "conservation_state", value: "whole" }),
    n("RM1", "representation_model_sf", { transform: XF(5) }), n("RM3", "representation_model", { transform: XF(1) }),
    n("RM4", "representation_model", {})],
  edges: [
    e("SF1", "XX", "has_first_epoch"), e("USD1", "PA", "has_first_epoch"), e("VSF1", "II", "has_first_epoch"),
    e("SF1", "USD1", "changed_from"), e("USD1", "VSF1", "changed_from"),
    e("USD1", "P_geo", "has_property"), e("P_geo", "S1", "has_semantic_shape"),
    e("SF1", "P_st1", "has_property"), e("VSF1", "P_st3", "has_property"),
    e("SF1", "RM1", "has_representation_model_sf"), e("VSF1", "RM3", "has_representation_model"), e("VSF1", "RM4", "has_representation_model"),
    e("VSF1", "PA", "survive_in_epoch"),
  ],
};
const doc = { graph };
{
  const rs = I.epochInstances(doc, "SF1");
  eq(rs.map((r) => r.id), ["VSF1", "USD1", "SF1"], "the chain, oldest first: the VSF in II, the USD in PA, the SF today");
  eq(rs.map((r) => r.epochs), [["II", "PA"], ["PA"], ["XX"]], "each its epochs");
  eq(rs.map((r) => r.conservation_state), ["whole", null, "fragmentary"], "each its state");
  eq(rs.map((r) => r.geometry_from), ["USD1", "USD1", "USD1"], "ONE geometry: the USD's proxy draws the three");
  eq(rs.map((r) => r.shape), [null, "S1", null], "the shape is the geometry's instance's");
  eq(rs[0].placements.map((p) => p.model), ["RM3", "RM4"], "the VSF's two models");
  eq(rs.map((r) => I.instanceTransform(doc, r)?.node ?? null), ["RM3", "S1", "RM1"], "the position: the first placed model, else the own proxy");
  eq(I.epochInstances(doc, "USD1").map((r) => r.id), ["VSF1", "USD1", "SF1"], "the same chain from any instance");
  eq(I.epochInstances(doc, "US9").map((r) => [r.id, r.geometry_from]), [["US9", null]], "a unit outside any chain is a chain of one");
  eq(I.epochInstances(doc, "nope"), [], "an unknown id");
  // the walk order of s3Dgraphy (a stack): a unit without an epoch last
  const d2 = { graph: { ...graph, nodes: [...graph.nodes, n("X0", "SF")], edges: [...graph.edges, e("X0", "SF1", "changed_to")] } };
  eq(I.epochInstances(d2, "SF1").at(-1).id, "X0", "a unit without a first epoch, last; changed_to read as changed_from");
  const ora = oracle({ version: "1.0", graphs: { g1: graph }, active_graph_id: "g1" }, ["SF1", "USD1", "US9"]);
  if (ora) {
    for (const id of ["SF1", "USD1", "US9"]) eq(pick(I.epochInstances(doc, id)), pick(ora[id]), `${id}: EMStudio reads the chain as s3Dgraphy does`);
    const ora2 = oracle({ version: "1.0", graphs: { g1: d2.graph }, active_graph_id: "g1" }, ["SF1"]);
    eq(pick(I.epochInstances(d2, "SF1")), pick(ora2.SF1), "…the walk and the order too (changed_to, a unit without epoch)");
  } else console.log("  (s3Dgraphy venv not found: the oracle is skipped)");
}

// ── the Space: one geometry, a position per instance ─────────────────────────
{
  const sp = I.buildSpace(doc, { isUnit: I.isStratigraphicType });
  const px = (u) => sp.proxies.get(u);
  eq([px("USD1")?.instanceOf, px("USD1")?.shapeId], [undefined, "S1"], "the USD owns the geometry (its proxy, its shape)");
  eq([px("SF1")?.instanceOf, px("SF1")?.shapeId, px("SF1")?.xfNode], ["USD1", "S1", "RM1"], "the SF today: the USD's geometry, placed by ITS model");
  eq([px("VSF1")?.instanceOf, px("VSF1")?.xfNode], ["USD1", "RM3"], "the VSF: its model with a transform (RM3, not RM4)");
  eq(sp.summary("XX").withProxy.includes("SF1"), true, "drawn in its epoch");
  eq(sp.summary("II").withProxy.includes("VSF1"), true, "…and the VSF in II A.D.");
  // an instance without a model has no position of its own: listed, not drawn
  const d3 = { graph: { ...graph, edges: graph.edges.filter((x) => x.target !== "RM1") } };
  eq(I.buildSpace(d3, { isUnit: I.isStratigraphicType }).proxies.has("SF1"), false, "an instance without a model is not drawn (no place nobody gave)");
}

// ── «a new instance in an epoch» ─────────────────────────────────────────────
{
  const chrono = ["II", "PA", "XX"];
  const p = I.planInstance({ from: "VSF1", fromEpoch: "II", epoch: "XX", chrono, node_type: "SF", name: "SF2", state: " found broken ", transform: XF(3), resource: "R1" });
  eq(p.nodes.map((x) => [x.key, x.node.node_type]), [["$unit", "SF"], ["$state", "property"], ["$model", "representation_model_sf"]], "the unit, its state, a model for its position");
  eq(p.edges, [
    { source: "$unit", target: "XX", edge_type: "has_first_epoch" },
    { source: "$unit", target: "VSF1", edge_type: "changed_from" },
    { source: "$unit", target: "$state", edge_type: "has_property" },
    { source: "$unit", target: "$model", edge_type: "has_representation_model_sf" },
    { source: "$model", target: "R1", edge_type: "has_linked_resource" },
  ], "a newer epoch: the new one changed from the old; the model hatted to the same asset");
  eq(p.nodes[1].node.data, { property_type: "conservation_state", value: "found broken" }, "the state, trimmed, in data.value");
  eq(p.nodes[2].node.data, { transform: XF(3) }, "the model holds only the transform (no geometry copied)");
  const q = I.planInstance({ from: "SF1", fromEpoch: "XX", epoch: "II", chrono, node_type: "VSF", name: "VSF9", state: "", transform: null, resource: null });
  eq(q.edges, [{ source: "$unit", target: "II", edge_type: "has_first_epoch" }, { source: "SF1", target: "$unit", edge_type: "changed_from" }],
    "an older epoch: the old one is what the SF changed from; no state, no position: nothing else");
  const r = I.planInstance({ from: "SF1", fromEpoch: "XX", epoch: "PA", chrono, node_type: "USD", name: "USD7", state: "", transform: XF(0), resource: null });
  eq(r.edges.find((x) => x.target === "$model").edge_type, "has_representation_model", "a non-SF unit's position: an RM");
  eq(I.instanceTypes("RSF"), ["RSF", "SF", "VSF"], "the types offered: its own first, then the special finds");
}

// ── the GT16: every special find read as s3Dgraphy reads it ──────────────────
{
  const path = process.argv[2] ?? "/tmp/servsf/EM/TempluMare_v4.em.json";
  if (existsSync(path)) {
    const em = JSON.parse(readFileSync(path, "utf8"));
    const g = em.graphs[em.active_graph_id];
    const ids = g.nodes.filter((x) => ["SF", "RSF", "VSF", "serVSF"].includes(x.node_type)).map((x) => x.id);
    const ora = oracle(em, ids);
    const mine = Object.fromEntries(ids.map((id) => [id, pick(I.epochInstances({ graph: g }, id))]));
    if (ora) for (const id of ids) eq(mine[id], pick(ora[id]), `GT16 ${g.nodes.find((x) => x.id === id).name}: the same chain`);
    ok(ids.length > 40, `the GT16's special finds (${ids.length})`);
  } else console.log(`  (${path} not found: the GT16 is skipped)`);
}

console.log(`check-epoch-instances: ${checks} checks ✓`);
