// MICRO-GLIFI-OVERLAY-CONTINUITA p.3 · the continuity node (BR): which unit and
// epoch it stands for, where the Matrix draws it (straight above its unit, in
// its epoch's lane), its straight line, the overlay that takes it out of the
// drawing, and what «End in…» / «Survives until…» write.
// MICRO-SERVSF-FINE-ISTANZE p.2 · the TYPE of the end (node datamodel 1.6.36):
// the five of the datamodel, the default not written, the CIDOC class each
// decides, and the end of a unit read as s3Dgraphy reads it (`end_of_unit`,
// compared on the same documents when the s3Dgraphy venv is there).
//
//   node scripts/check-continuity.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}continuity.ts`], bundle: true, format: "esm", write: false });
const C = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// the GT16's two, as the importer wrote them
const E = [
  { id: "a", source: "BR1", target: "SU002", edge_type: "is_after" },
  { id: "b", source: "BR2", target: "SU019", edge_type: "is_after" },
  { id: "c", source: "BR1", target: "XX", edge_type: "has_first_epoch" },
  { id: "d", source: "BR2", target: "XX", edge_type: "has_first_epoch" },
  { id: "e", source: "SU002", target: "XX", edge_type: "survive_in_epoch" },
  { id: "f", source: "SU002", target: "PA", edge_type: "survive_in_epoch" },
  { id: "g", source: "SU002", target: "II", edge_type: "has_first_epoch" },
  { id: "h", source: "SU020", target: "SU019", edge_type: "is_after" },
];
const isBr = (id) => id.startsWith("BR");

// ── which unit, which epoch ──────────────────────────────────────────────────
{
  const L = C.continuityLinks(E, isBr);
  eq([...L.keys()].sort(), ["BR1", "BR2"], "two continuity nodes");
  eq(L.get("BR1"), { unit: "SU002", epoch: "XX" }, "BR1: SU002, to XX sec");
  eq(L.get("BR2"), { unit: "SU019", epoch: "XX" }, "BR2: SU019, to XX sec");
  const L2 = C.continuityLinks([{ source: "U", target: "BR9", edge_type: "is_before" }], isBr);
  eq(L2.get("BR9"), { unit: "U", epoch: null }, "an is_before unit → BR reads the same; no epoch declared");
  eq(C.continuityKind(false), "end", "a real unit ends");
  eq(C.continuityKind(true), "survive", "a virtual unit survives");
}

// ── where it is drawn: straight above the unit, in its epoch's lane ──────────
{
  const unit = { x: 684, y: 1544, w: 90, h: 32 }, br = { w: 22.4, h: 22.4 };
  const xx = { y: 0, height: 326 };
  const at = C.continuityPlace(unit, br, xx);
  eq(at.x + br.w / 2, unit.x + unit.w / 2, "centred on the unit (one vertical line)");
  ok(at.y >= xx.y && at.y + br.h <= xx.y + xx.height, "inside the lane of its epoch");
  eq(at.y, 326 - C.CONTINUITY_GAP - 22.4, "at the lane's near edge (the bottom, the lane being above)");
  const same = C.continuityPlace({ x: 0, y: 200, w: 90, h: 32 }, br, xx);
  eq(same.y, 200 - C.CONTINUITY_GAP - 22.4, "the unit in the lane itself: just above it");
  const none = C.continuityPlace(unit, br, null);
  eq(none.y, 1544 - C.CONTINUITY_GAP - 22.4, "no lane drawn: just above the unit");
  const below = C.continuityPlace({ x: 0, y: 100, w: 90, h: 32 }, br, { y: 448, height: 1738 });
  ok(below.y >= 448 && below.y + br.h <= 448 + 1738, "a lane below the unit (the data says so): inside it");
  // the line
  const r = C.continuityRoute(unit, { x: at.x, y: at.y, w: br.w, h: br.h });
  eq(r.length, 2, "one segment");
  eq(r[0].x, r[1].x, "vertical");
  eq([r[0].y, r[1].y], [at.y + br.h, unit.y], "from the rhombus's bottom to the unit's top");
}

// ── the overlay off: out of the drawn scene, the data untouched ──────────────
{
  const nodes = [{ id: "BR1", node: { node_type: "BR" } }, { id: "SU002", node: { node_type: "US" } }];
  const scene = { nodes: [...nodes], byId: new Map(nodes.map((n) => [n.id, n])), edges: [{ source: "BR1", target: "SU002" }, { source: "SU020", target: "SU002" }] };
  eq(C.dropContinuity(scene, (t) => t === "BR"), 1, "one continuity node out");
  eq(scene.nodes.map((n) => n.id), ["SU002"], "the unit stays");
  ok(!scene.byId.has("BR1"), "…and out of the index (no click reaches it)");
  eq(scene.edges, [{ source: "SU020", target: "SU002" }], "its line goes, the others stay");
}

// ── «End in…» / «Survives until…» ────────────────────────────────────────────
{
  const chrono = ["II", "PA", "XX"]; // oldest first
  // a new one on a US of II A.D., ending in Post antiquity, destroyed, after D.02
  const p = C.planContinuity(E, { unit: "SU003", epoch: "PA", chrono, firstEpoch: "II", br: null, reason: "destroyed", source: "D02" });
  ok(p.createBr, "a BR is born");
  eq(p.add, [
    { source: "$br", target: "SU003", edge_type: "is_after" },
    { source: "$br", target: "PA", edge_type: "has_first_epoch" },
    { source: "SU003", target: "PA", edge_type: "survive_in_epoch" },
    { source: "$br", target: "D02", edge_type: "has_documentation" },
  ], "is_after BR → unit, its epoch, the unit lives up to it, the source");
  eq(p.remove, [], "nothing to take away");
  eq(p.reason, "destroyed", "the reason");
  eq(p.survives, ["PA"], "survives in Post antiquity (the epoch it ends in included)");
  // SU002 moved back to Post antiquity: XX sec is taken away from the BR and the unit
  const q = C.planContinuity(E, { unit: "SU002", epoch: "PA", chrono, firstEpoch: "II", br: "BR1" });
  ok(!q.createBr, "its BR is updated, not doubled");
  eq(q.remove.sort(), ["c", "e"], "the BR's XX sec and the unit's survival in XX sec go");
  eq(q.add, [{ source: "BR1", target: "PA", edge_type: "has_first_epoch" }], "the BR's new epoch");
  ok(!("reason" in q), "the reason untouched when not asked");
  // a virtual unit up to XX sec: survives in PA and XX
  const v = C.planContinuity([], { unit: "USV132", epoch: "XX", chrono, firstEpoch: "II", br: null });
  eq(v.survives, ["PA", "XX"], "a USV of II A.D. survives in Post antiquity and XX sec");
  // nothing to do when it is already so
  const same = C.planContinuity(E, { unit: "SU002", epoch: "XX", chrono, firstEpoch: "II", br: "BR1" });
  eq([same.add, same.remove], [[], []], "the same epoch again: nothing written");
  // the source changed, then taken away
  const s1 = C.planContinuity([...E, { id: "z", source: "BR1", target: "D01", edge_type: "has_documentation" }],
    { unit: "SU002", epoch: "XX", chrono, firstEpoch: "II", br: "BR1", source: "D02" });
  eq([s1.add, s1.remove], [[{ source: "BR1", target: "D02", edge_type: "has_documentation" }], ["z"]], "another source replaces the old one");
  const s2 = C.planContinuity([...E, { id: "z", source: "BR1", target: "D01", edge_type: "has_documentation" }],
    { unit: "SU002", epoch: "XX", chrono, firstEpoch: "II", br: "BR1", source: null });
  eq([s2.add, s2.remove], [[], ["z"]], "no source: taken away");
  // MICRO-SERVSF-FINE-ISTANZE p.2 · the five types, read from the datamodel
  eq(C.END_REASONS, ["destroyed", "transformed", "removed", "relocated", "unknown"], "the five types of node datamodel 1.6.36");
  eq(C.END_REASON_DEFAULT, "unknown", "the default");
  eq(C.END_REASONS.map(C.endReasonClass), ["crm:E6_Destruction", "crm:E81_Transformation", "crm:E80_Part_Removal", "crm:E9_Move", "crm:E64_End_of_Existence"],
    "the class each type decides (rdf.class_when)");
  eq(C.END_REASONS.map(C.endReasonPredicate), ["crm:P13_destroyed", "crm:P124_transformed", "crm:P113_removed", "crm:P25_moved", "crm:P93_took_out_of_existence"],
    "the property the BR reaches its unit by");
  const tr = C.planContinuity(E, { unit: "SU003", epoch: "PA", chrono, firstEpoch: "II", br: null, reason: "transformed" });
  eq(tr.reason, "transformed", "a type chosen is written");
  const un = C.planContinuity(E, { unit: "SU003", epoch: "PA", chrono, firstEpoch: "II", br: "BR1", reason: "unknown" });
  ok("reason" in un && un.reason === null, "«unknown», the default, is NOT written (taken away when there was one)");
  const bad = C.planContinuity(E, { unit: "SU003", epoch: "PA", chrono, firstEpoch: "II", br: "BR1", reason: "exploded" });
  eq(bad.reason, null, "a value the datamodel does not know is not written");
  const vt = C.planContinuity([], { unit: "USV132", epoch: "XX", chrono, firstEpoch: "II", br: null, reason: "relocated" });
  eq(vt.reason, "relocated", "a virtual unit's BR takes a type too («Survives until…» asks it)");
  eq([C.endReasonOf({}), C.endReasonOf({ end_reason: "removed" }), C.endReasonOf({ end_reason: "x" })], ["unknown", "removed", "unknown"], "a BR's type: written, else the default");
  eq([C.endReasonWritten({}), C.endReasonWritten({ end_reason: "unknown" }), C.endReasonWritten({ end_reason: "destroyed" })], [false, false, true], "…and whether one is chosen");
}

// ── the end of a unit, read: the rule of s3Dgraphy's end_of_unit ─────────────
{
  const ep = (id, a, b) => ({ id, node_type: "EpochNode", name: id, data: { start_time: a, end_time: b } });
  const u = (id, t = "US") => ({ id, node_type: t, name: id, data: {} });
  const prop = (id, q, v) => ({ id, node_type: "property", name: q, description: String(v), data: { property_type: q, value: String(v) } });
  const e = (s, t, type) => ({ id: `${s}-${type}-${t}`, source: s, target: t, edge_type: type });
  const doc = { graph: { nodes: [ep("II", 100, 199), ep("PA", 500, 1899), ep("XX", 1900, 2013),
    u("SU1"), u("SU2"), u("SU3"), u("SU4"),
    { id: "B1", node_type: "BR", name: "continuity_node", data: { end_reason: "destroyed" } },
    { id: "B2", node_type: "BR", name: "continuity_node", data: {} },
    { id: "B3", node_type: "BR", name: "continuity_node", data: { end_reason: "relocated" } },
    { id: "B4", node_type: "BR", name: "continuity_node", data: { end_reason: "transformed" } },
    prop("P3", "absolute_time_start", 1960)],
  edges: [
    // B1: inherited — the last epoch SU1 lives in (XX), though the BR says PA
    e("B1", "SU1", "is_after"), e("B1", "PA", "has_first_epoch"), e("SU1", "II", "has_first_epoch"), e("SU1", "PA", "survive_in_epoch"), e("SU1", "XX", "survive_in_epoch"),
    // B2: the unit has no epoch: the BR's own has_first_epoch (declared)
    e("B2", "SU2", "is_after"), e("B2", "PA", "has_first_epoch"),
    // B3: a date of its own, 1960 → XX sec (own_date)
    e("B3", "SU3", "is_after"), e("B3", "PA", "has_first_epoch"), e("SU3", "II", "has_first_epoch"), e("B3", "P3", "has_property"),
    // B4: drawn the other way, is_before unit → BR
    e("SU4", "B4", "is_before"), e("SU4", "II", "has_first_epoch"),
  ] } };
  const got = Object.fromEntries(["B1", "B2", "B3", "B4"].map((id) => [id, C.endOfUnit(doc, id)]));
  eq([got.B1.unit, got.B1.end_reason, got.B1.cidoc_class, got.B1.epoch, got.B1.epoch_rule], ["SU1", "destroyed", "crm:E6_Destruction", "XX", "inherited"], "B1: inherited, the last epoch the unit lives in");
  eq([got.B2.end_reason, got.B2.cidoc_class, got.B2.epoch, got.B2.epoch_rule], ["unknown", "crm:E64_End_of_Existence", "PA", "declared"], "B2: no type → unknown; the unit without epochs → declared");
  eq([got.B3.start, got.B3.epoch, got.B3.epoch_rule], [1960, "XX", "own_date"], "B3: its own date puts it in XX sec");
  eq([got.B4.unit, got.B4.epoch, got.B4.epoch_rule], ["SU4", "II", "inherited"], "B4: is_before unit → BR reads the same");
  eq(C.endOfUnit(doc, "SU1"), null, "a unit is not a BR");
  // the same documents, read by s3Dgraphy
  const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
  const PY = `${S3D}.venv/bin/python`;
  if (existsSync(PY)) {
    const script = `
import json,sys
from s3dgraphy import api
from s3dgraphy.spatiotemporal import end_of_unit
d = json.loads(sys.stdin.read())
g, w = api.load_emjson(d)
print(json.dumps({b: end_of_unit(g, b) for b in ["B1", "B2", "B3", "B4"]}))`;
    const em = { version: "1.0", graphs: { g1: { graph_id: "g1", name: "g", ...doc.graph } }, active_graph_id: "g1" };
    let py = null;
    try {
      py = JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify(em), maxBuffer: 1 << 26,
        env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
    } catch (err) { py = { error: String(err.message ?? err).slice(0, 300) }; }
    ok(!py.error, `s3Dgraphy read the documents (${py.error ?? "ok"})`);
    for (const b of ["B1", "B2", "B3", "B4"]) {
      const pick = (x) => x && { unit: x.unit, units: x.units, end_reason: x.end_reason, cidoc_class: x.cidoc_class, epoch: x.epoch, epoch_rule: x.epoch_rule, start: x.start, end: x.end };
      eq(pick(got[b]), pick(py[b]), `${b}: EMStudio reads the end as s3Dgraphy does`);
    }
  } else console.log("  (s3Dgraphy venv not found: the oracle is skipped)");
}

console.log(`check-continuity: ${checks} checks ✓`);
