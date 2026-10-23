// MICRO-GLIFI-OVERLAY-CONTINUITA p.3 · the continuity node (BR): which unit and
// epoch it stands for, where the Matrix draws it (straight above its unit, in
// its epoch's lane), its straight line, the overlay that takes it out of the
// drawing, and what «End in…» / «Survives until…» write.
//
//   node scripts/check-continuity.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

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
  eq(C.END_REASONS, ["removed", "destroyed", "relocated"], "the three reasons");
}

console.log(`check-continuity: ${checks} checks ✓`);
