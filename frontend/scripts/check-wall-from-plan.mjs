// MICRO-PX1 · executable check of the pure geometry of «Muro da pianta» /
// «Wall from plan» (src/wall-from-plan.ts):
//   · a rectangle, an L, a T, a U with its inner corners: closed manifold
//     (every edge shared by two triangles, in opposite directions), the least
//     polygons (n quads, 2(n − 2) cap triangles), normals outward (positive
//     volume; each side's normal leaves the outline, the top's up, the bottom's
//     down), the volume of a box exact;
//   · the base following each click's height, the head with no top points at
//     the Tool panel's height above each base corner;
//   · a sloping head: top points projected on the nearest edge become corners
//     (base and top), the corners between interpolated along the perimeter, the
//     corners beyond the last taking the nearest one's (across the thickness);
//   · a crossing outline refused (which edges), aligned corners merged (a step
//     of the terrain kept), a clockwise outline turned, a head below the base
//     lifted (warned), a far top point warned;
//   · mode axis + thickness: square ends, mitre joints at 90° and 120°, the
//     outline's corners where they must be, too sharp a joint refused;
//   · georeferenced coordinates (hundreds of km): the same mesh, translated.
//
//   node scripts/check-wall-from-plan.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({ entryPoints: [`${SRC}wall-from-plan.ts`], bundle: true, format: "esm", write: false, logLevel: "silent" });
const W = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const near = (a, b, eps, what) => {
  const d = Array.isArray(a) ? Math.max(...a.map((x, i) => Math.abs(x - b[i]))) : Math.abs(a - b);
  assert.ok(d <= eps, `${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); checks++;
};

// plan points (x, y) with base height z → the scene's Y-up point [x, z, −y]
const S = (x, y, z = 0) => [x, z, -y];
const wp = (x, y, z = 0, doc = "D1") => ({ p: S(x, y, z), rm: "RM1", doc });
const wall = (plan, opts = {}) => W.buildWall({ mode: "outline", plan, top: [], height: 1, thickness: 0.6, ...opts });

/** the geometry's invariants: closed manifold, least polygons, outward */
function solid(res, what) {
  ok(res.ok, `${what}: built (${res.ok ? "" : JSON.stringify(res.error)})`);
  const m = res.mesh;
  const n = m.stats.corners;
  ok(W.isClosedManifold(m.indices), `${what}: closed and manifold`);
  eq([m.stats.quads, m.stats.capTriangles, m.stats.triangles, m.positions.length / 3], [n, n - 2, 2 * n + 2 * (n - 2), 2 * n],
     `${what}: the least polygons (n quads, n − 2 triangles per cap, 2n vertices)`);
  ok(W.meshVolume(m.positions, m.indices) > 0, `${what}: the volume is positive (normals out)`);
  // each face's normal: the top's up, the bottom's down, a side's out of the outline
  const P = (i) => [m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]];
  const plan = m.base.map((p) => ({ x: p[0] - m.origin[0], y: -(p[2] - m.origin[2]) }));
  const inPlan = (x, y) => { let c = false; for (let i = 0, j = plan.length - 1; i < plan.length; j = i++) {
    const a = plan[i], bb = plan[j]; if ((a.y > y) !== (bb.y > y) && x < ((bb.x - a.x) * (y - a.y)) / (bb.y - a.y) + a.x) c = !c; } return c; };
  let bad = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, bq, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map(P);
    const u = [bq[0] - a[0], bq[1] - a[1], bq[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const top = m.indices[t] >= n && m.indices[t + 1] >= n && m.indices[t + 2] >= n;
    const bottom = m.indices[t] < n && m.indices[t + 1] < n && m.indices[t + 2] < n;
    if (top) { if (!(nn[1] > 0)) bad++; continue; }
    if (bottom) { if (!(nn[1] < 0)) bad++; continue; }
    const cx = (a[0] + bq[0] + c[0]) / 3, cz = (a[2] + bq[2] + c[2]) / 3;
    const l = Math.hypot(nn[0], nn[2]);
    const px = cx + (nn[0] / l) * 1e-3, pz = cz + (nn[2] / l) * 1e-3;
    if (inPlan(px, -pz)) bad++;
  }
  eq(bad, 0, `${what}: every face's normal outward`);
  return m;
}

// ── a rectangle: the box, its volume exact ───────────────────────────────────
{
  const m = solid(wall([wp(0, 0), wp(4, 0), wp(4, 0.6), wp(0, 0.6)], { height: 2.5 }), "rectangle");
  near(W.meshVolume(m.positions, m.indices), 4 * 0.6 * 2.5, 1e-9, "rectangle: the volume of the box, exact (4 × 0.6 × 2.5)");
  near(m.origin, S(2, 0.3, 0), 1e-12, "rectangle: the local frame at the centroid in plan, the lowest base point");
  eq(m.warnings, [], "rectangle: nothing to say");
  const tops = m.head.map((p) => p[1]);
  eq(tops, [2.5, 2.5, 2.5, 2.5], "no top points: the Tool panel's height above each base corner");
}
// a box on sloping ground: the base follows each click, the head 1 m above it
{
  const m = solid(wall([wp(0, 0, 10), wp(4, 0, 10.4), wp(4, 0.6, 10.4), wp(0, 0.6, 10)], { height: 1 }), "rectangle on a slope");
  eq(m.base.map((p) => p[1]), [10, 10.4, 10.4, 10], "the base keeps each click's height");
  near(m.head.map((p) => p[1]), [11, 11.4, 11.4, 11], 1e-12, "the head at the height above each base corner");
  near(W.meshVolume(m.positions, m.indices), 4 * 0.6 * 1, 1e-9, "a sheared box: the same volume");
}
// clockwise clicks are turned
{
  const m = solid(wall([wp(0, 0), wp(0, 0.6), wp(4, 0.6), wp(4, 0)]), "rectangle clicked clockwise");
  ok(W.signedArea2(m.base.map((p) => ({ x: p[0], y: -p[2] }))) > 0, "clockwise clicks: the outline turned counter-clockwise");
}

// ── an L, a T, a U: the inner corners ────────────────────────────────────────
{
  const L = [wp(0, 0), wp(5, 0), wp(5, 0.6), wp(0.6, 0.6), wp(0.6, 4), wp(0, 4)];
  const m = solid(wall(L, { height: 2 }), "L");
  near(W.meshVolume(m.positions, m.indices), (5 * 0.6 + 0.6 * 3.4) * 2, 1e-9, "L: its volume");
  const T = [wp(0, 3.4), wp(2.2, 3.4), wp(2.2, 0), wp(2.8, 0), wp(2.8, 3.4), wp(5, 3.4), wp(5, 4), wp(0, 4)];
  const mt = solid(wall(T, { height: 1.5 }), "T");
  near(W.meshVolume(mt.positions, mt.indices), (5 * 0.6 + 0.6 * 3.4) * 1.5, 1e-9, "T: its volume");
  const U = [wp(0, 0), wp(6, 0), wp(6, 5), wp(5.4, 5), wp(5.4, 0.6), wp(0.6, 0.6), wp(0.6, 5), wp(0, 5)];
  const mu = solid(wall(U, { height: 1 }), "U with two inner corners");
  near(W.meshVolume(mu.positions, mu.indices), 6 * 0.6 + 2 * 0.6 * 4.4, 1e-9, "U: its volume");
  eq(mu.stats.corners, 8, "U: its eight corners, the two inner ones kept");
}

// ── a sloping head: top points inserted and interpolated ────────────────────
{
  // a wall 6 m long, 0.6 thick; the head clicked at x = 0 (h 2), x = 3 (h 3), x = 6 (h 2.5) on the outer face (y = 0)
  const top = [wp(0, -0.02, 2), wp(3, 0.01, 3), wp(6, 0, 2.5)];
  const m = solid(wall([wp(0, 0), wp(6, 0), wp(6, 0.6), wp(0, 0.6)], { top }), "sloping head");
  eq(m.stats.corners, 5, "the top point in the middle of an edge became a corner (base and top), the two at the ends gave their corners the height");
  const at = (x, y) => m.head.find((p) => Math.abs(p[0] - x) < 1e-9 && Math.abs(-p[2] - y) < 1e-9)?.[1];
  near([at(0, 0), at(3, 0), at(6, 0)], [2, 3, 2.5], 1e-9, "the head at the three points' heights");
  near([at(6, 0.6), at(0, 0.6)], [2.5, 2], 1e-9, "the far face's corners (beyond the last point): the nearest corner's height, across the thickness");
  const mid = m.base.find((p) => Math.abs(p[0] - 3) < 1e-9);
  near(mid[1], 0, 1e-12, "the new corner's base on the edge's base line");
  // interpolation along the perimeter between two points
  const top2 = [wp(0, 0, 2), wp(6, 0, 3)];
  const m2 = solid(wall([wp(0, 0), wp(2, 0), wp(4, 0), wp(6, 0), wp(6, 0.6), wp(0, 0.6)], { top: top2 }), "head interpolated");
  ok(m2.warnings.some((w) => w.code === "merged"), "aligned corners on a flat base: merged (and said)");
  const m3 = solid(wall([wp(0, 0), wp(2, 0, 0.3), wp(4, 0, 0.3), wp(6, 0, 0.6), wp(6, 0.6, 0.6), wp(0, 0.6)], { top: top2 }), "head over a stepped base");
  const at3 = (x, y) => m3.head.find((p) => Math.abs(p[0] - x) < 1e-9 && Math.abs(-p[2] - y) < 1e-9)?.[1];
  ok(at3(2, 0) !== undefined && at3(4, 0) !== undefined, "aligned corners with the base OFF the line (a step of the terrain) are kept");
  near([at3(2, 0), at3(4, 0)], [2 + 1 / 3, 2 + 2 / 3], 1e-9, "the head interpolated along the perimeter between the two points");
}
// a far top point and a head below the base are said
{
  const r = wall([wp(0, 0, 5), wp(4, 0, 5), wp(4, 0.6, 5), wp(0, 0.6, 5)], { top: [wp(2, -3, 4.5)] });
  const m = solid(r, "head below the base");
  ok(m.warnings.some((w) => w.code === "far" && w.at === 0 && Math.abs(w.distance - 3) < 1e-9), "a top point 3 m off the outline: warned, with its distance");
  ok(m.warnings.some((w) => w.code === "clamped"), "a head below the base: lifted, and said");
  ok(m.head.every((p, i) => p[1] >= m.base[i][1] + W.WALL_TOL.minHeight - 1e-12), "the head at least the least height above the base");
}

// ── refused ──────────────────────────────────────────────────────────────────
{
  const bow = wall([wp(0, 0), wp(4, 0), wp(0, 2), wp(4, 2)]);
  ok(!bow.ok && bow.error.code === "self_intersect", "a crossing outline is refused");
  ok(!bow.ok && Array.isArray(bow.error.edges) && bow.error.edges.length === 2, "…and the two edges that cross are named");
  const touch = wall([wp(0, 0), wp(4, 0), wp(4, 2), wp(2, 0), wp(0, 2)]);
  ok(!touch.ok && touch.error.code === "self_intersect", "an outline touching itself is refused too");
  const two = wall([wp(0, 0), wp(4, 0)]);
  ok(!two.ok && two.error.code === "too_few", "two corners: too few");
  const dup = wall([wp(0, 0), wp(4, 0), wp(4.005, 0), wp(4, 0.002)]);
  ok(!dup.ok && ["too_few", "degenerate"].includes(dup.error.code), "corners within the merge tolerance: one, and too few");
  const line = wall([wp(0, 0), wp(2, 0), wp(4, 0), wp(1, 0.001)]);
  ok(!line.ok, "an outline with no area is refused");
}
// aligned corners merged
{
  const m = solid(wall([wp(0, 0), wp(1, 0.004), wp(2, 0), wp(4, 0), wp(4, 0.6), wp(2, 0.6), wp(0, 0.6)]), "aligned corners");
  eq(m.stats.corners, 4, "corners within 1 cm of their neighbours' line, the base on it: merged");
  ok(m.warnings.some((w) => w.code === "merged" && w.n === 3), "…and how many is said");
}

// ── mode axis + thickness ────────────────────────────────────────────────────
{
  // 90°: along x 4 m, then along y 3 m; thickness 0.6
  const r = W.buildWall({ mode: "axis", plan: [wp(0, 0), wp(4, 0), wp(4, 3)], top: [], height: 2, thickness: 0.6 });
  const m = solid(r, "axis with a 90° corner");
  eq(m.stats.corners, 6, "an L from its axis: six corners");
  const has = (x, y) => m.base.some((p) => Math.abs(p[0] - x) < 1e-9 && Math.abs(-p[2] - y) < 1e-9);
  ok(has(0, 0.3) && has(0, -0.3) && has(3.7, 0.3) && has(4.3, -0.3) && has(3.7, 3) && has(4.3, 3),
     "square ends at ±t/2, the mitre's inner corner at (3.7, 0.3) and outer at (4.3, −0.3)");
  near(W.meshVolume(m.positions, m.indices), 0.6 * (4 + 3) * 2, 1e-9, "its volume: thickness × axis length × height (the mitre adds and takes the same)");
  // 120° between the segments (a turn of 60°)
  const ang = Math.PI / 3;
  const r2 = W.buildWall({ mode: "axis", plan: [wp(0, 0), wp(4, 0), wp(4 + 3 * Math.cos(ang), 3 * Math.sin(ang))], top: [], height: 1, thickness: 0.6 });
  const m2 = solid(r2, "axis with a 120° corner");
  const half = 0.3 / Math.cos(ang / 2);
  const mx = -Math.sin(ang / 2), my = Math.cos(ang / 2);   // the mitre's direction (the bisector of the two left normals)
  const has2 = (x, y) => m2.base.some((p) => Math.abs(p[0] - x) < 1e-9 && Math.abs(-p[2] - y) < 1e-9);
  ok(has2(4 + mx * half, my * half) && has2(4 - mx * half, -my * half), "a 120° joint: the mitre corners at t/2 / cos(30°) along the bisector");
  near(W.meshVolume(m2.positions, m2.indices), 0.6 * 7 * 1, 1e-9, "its volume: thickness × axis length × height");
  const sharp = W.buildWall({ mode: "axis", plan: [wp(0, 0), wp(4, 0), wp(0, 0.3)], top: [], height: 1, thickness: 0.6 });
  ok(!sharp.ok && sharp.error.code === "miter" && sharp.error.at === 1, "a joint sharper than the mitre limit is refused, at its vertex");
  const noT = W.buildWall({ mode: "axis", plan: [wp(0, 0), wp(4, 0)], top: [], height: 1, thickness: 0 });
  ok(!noT.ok && noT.error.code === "bad_thickness", "no thickness: refused");
  const one = W.buildWall({ mode: "axis", plan: [wp(0, 0)], top: [], height: 1, thickness: 0.6 });
  ok(!one.ok && one.error.code === "too_few", "an axis of one point: too few");
  // the axis's heights pass to both faces; a top point on it is projected on the nearest face
  const m3 = solid(W.buildWall({ mode: "axis", plan: [wp(0, 0, 1), wp(6, 0, 1.6)], top: [wp(3, 0.3, 4)], height: 1, thickness: 0.6 }), "axis with a top point");
  ok(m3.base.filter((p) => Math.abs(p[0]) < 1e-9).every((p) => Math.abs(p[1] - 1) < 1e-9), "the axis's heights on both faces");
  ok(m3.head.every((p) => Math.abs(p[1] - 4) < 1e-9), "one top point: the whole head at its height");
}

// ── georeferenced coordinates: the same wall, translated ────────────────────
{
  const X = 412345.678, Y = 5049876.543;
  const a = solid(wall([wp(0, 0), wp(5, 0), wp(5, 0.6), wp(0.6, 0.6), wp(0.6, 4), wp(0, 4)], { top: [wp(2.5, 0, 2)] }), "L near the origin");
  const g = solid(wall([wp(X, Y), wp(X + 5, Y), wp(X + 5, Y + 0.6), wp(X + 0.6, Y + 0.6), wp(X + 0.6, Y + 4), wp(X, Y + 4)], { top: [wp(X + 2.5, Y, 2)] }), "L in UTM");
  near(g.positions, a.positions, 1e-6, "in UTM coordinates the local mesh is the same (computed around the clicks' centroid)");
  near([g.origin[0] - X, g.origin[2] + Y], [a.origin[0], a.origin[2]], 1e-6, "…placed at the same point, translated");
}

// ── the inputs as the layout keeps them ──────────────────────────────────────
{
  const inp = { mode: "axis", plan: [wp(0, 0), wp(4, 0)], top: [wp(2, 0, 3, "D2")], height: 1.2, thickness: 0.5 };
  eq(W.readWallInput(JSON.parse(JSON.stringify(inp))), JSON.parse(JSON.stringify(inp)), "a wall's inputs read back from the layout as written");
  eq(W.readWallInput({ plan: [] }), null, "no plan points: not a wall");
  eq(W.readWallInput({ plan: [{ p: [0, 0, 0] }], height: -1 }).height, W.WALL_TOL.height, "a height that is not positive: the default");
  eq(W.wallDocuments(inp), ["D1", "D2"], "the documents the clicks fell on, in order");
  eq(W.wallDocuments({ plan: [{ p: [0, 0, 0], doc: null }, wp(1, 0)], top: [] }), [null, "D1"], "a click on no model counts as none");
  eq(W.blenderXYZ([1, 2, 3]), [1, -3, 2], "Blender's frame of a scene point (Z up)");
}

// ── a pose moved after the build (G / R / S): carried into the inputs ───────
{
  const inp = { mode: "outline", plan: [wp(0, 0), wp(4, 0), wp(4, 0.6), wp(0, 0.6)], top: [], height: 2, thickness: 0.6 };
  const m = W.buildWall(inp).mesh;
  ok(W.poseIsBuilt(m.origin, { position: m.origin, rotation: [0, 0, 0], scale: [1, 1, 1] }), "the pose at build time is recognised");
  const moved = W.bakePose(inp, m.origin, { position: [m.origin[0] + 10, m.origin[1] + 1, m.origin[2]], rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1] });
  const m2 = W.buildWall(moved).mesh;
  near(W.meshVolume(m2.positions, m2.indices), 4 * 0.6 * 2, 1e-9, "a wall moved and turned 90° about the vertical: the same volume");
  near(m2.origin, [m.origin[0] + 10, m.origin[1] + 1, m.origin[2]], 1e-9, "…its origin where the pose put it");
  const ext = (k) => Math.max(...m2.base.map((p) => p[k])) - Math.min(...m2.base.map((p) => p[k]));
  near([ext(0), ext(2)], [0.6, 4], 1e-9, "…its long side now along the scene's Z");
  const scaled = W.bakePose(inp, m.origin, { position: m.origin, rotation: [0, 0, 0], scale: [2, 1.5, 2] });
  eq([scaled.height, scaled.thickness], [3, 1.2], "a scale carries the height (Y) and the thickness (plan)");
}

console.log(`check-wall-from-plan: ${checks} checks passed`);
