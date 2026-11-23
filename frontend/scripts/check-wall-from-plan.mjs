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
//   · georeferenced coordinates (hundreds of km): the same mesh, translated;
//   · MICRO-PX1b: a point inside the outline (head "surface") becomes a point
//     of the head's surface, triangulated with the corners (Delaunay flips,
//     the outline never flipped), its volume exact; near the edge, or head
//     "face", it is projected; the hidden side's corners ESTIMATED (the visible
//     profile's height at the perpendicular's foot), marked; the edits of the
//     handles (move, insert, remove, add a head point) and the wall made again;
//     the pivot; the signature of the preview.
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
  const k = m.stats.inner ?? 0;
  eq([m.stats.quads, m.stats.capTriangles, m.stats.topTriangles, m.stats.triangles, m.positions.length / 3], [n, n - 2, n - 2 + 2 * k, 2 * n + 2 * (n - 2) + 2 * k, 2 * n + k],
     `${what}: the least polygons (n quads, n − 2 triangles on the bottom, n − 2 + 2m on the top with m points of its surface, 2n + m vertices)`);
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


// ── MICRO-PX1b · a point of the head's surface ─────────────────────────────
{
  const rect = [wp(0, 0), wp(4, 0), wp(4, 1), wp(0, 1)];
  const corners = [wp(0, 0, 2), wp(4, 0, 2), wp(4, 1, 2), wp(0, 1, 2)];
  const r = wall(rect, { top: [...corners, wp(2, 0.5, 3)], headMode: "surface" });
  const m = solid(r, "a point inside the head (surface)");
  eq([m.stats.inner, m.stats.topTriangles, m.topRole[4]], [1, 4, "inner"], "the point inside is a point of the head's surface: n − 2 + 2 top triangles");
  near(m.inner[0], S(2, 0.5, 3), 1e-12, "…at its own place and height");
  near(W.meshVolume(m.positions, m.indices), 4 * 1 * 2 + (4 * 1 * 1) / 3, 1e-9, "the volume: the box and the pyramid of the head (4 × 1 × 2 + 4 × 1 × 1 / 3)");
  ok(m.headKind.every((k) => k === "clicked"), "the four corners clicked");
  eq(m.estimate.vertices, [], "nothing estimated");
  // head "face": the same point is projected on the nearest side
  const f = solid(wall(rect, { top: [...corners, wp(2, 0.5, 3)], headMode: "face" }), "the same point, head face");
  eq([f.stats.inner, f.topRole[4]], [0, "edge"], "head «face»: the point is projected on a side (PX1's way)");
  // a point inside but within the tolerance of the edge: on the edge
  const e = solid(wall(rect, { top: [...corners, wp(2, 0.03, 2.4)], headMode: "surface" }), "a point 3 cm in from the edge");
  eq([e.stats.inner, e.topRole[4], e.stats.corners], [0, "edge", 5], "3 cm from the edge (under 5 cm): on the side, a new corner");
  // two points nearer than the merge: one, the later wins
  const d = solid(wall(rect, { top: [...corners, wp(2, 0.5, 3), wp(2.004, 0.5, 3.2)], headMode: "surface" }), "two inner points at 4 mm");
  eq(d.stats.inner, 1, "two points of the surface within 1 cm: one");
  near(d.inner[0][1], 3.2, 1e-12, "…the later one's height");
  // several points in an L: still closed and manifold (the flips keep the outline)
  const L = [wp(0, 0), wp(5, 0), wp(5, 0.6), wp(0.6, 0.6), wp(0.6, 4), wp(0, 4)];
  const ml = solid(wall(L, { top: [wp(0, 0, 2), wp(5, 0, 2), wp(2.5, 0.3, 2.4), wp(0.3, 2, 2.6), wp(4, 0.3, 2.2)], headMode: "surface" }), "an L with three points of the head's surface");
  eq(ml.stats.inner, 3, "three points of the surface");
  ok(W.triangulateWithPoints([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], [{ x: 0.5, y: 0.5 }]).length === 4, "a square with its centre: four triangles");
  // only points inside: the corners estimated from the nearest
  const o = solid(wall(rect, { top: [wp(1, 0.5, 2.2), wp(3, 0.5, 2.8)], headMode: "surface" }), "only points of the surface");
  eq([o.estimate.rule, o.estimate.vertices.length, o.estimate.from], ["nearest-inner", 4, 2], "only points inside: the four corners estimated from the nearest");
  near(o.head.map((p) => p[1]), [2.2, 2.8, 2.8, 2.2], 1e-12, "…each the nearest point's height");
}

// ── MICRO-PX1b · a wall under another: the back hidden, estimated ───────────
{
  // the front face (y = 0) seen: three points on the line of passage; the back (y = 0.6) hidden
  const rect = [wp(0, 0), wp(6, 0), wp(6, 0.6), wp(0, 0.6)];
  const top = [wp(0, 0, 2), wp(3, 0, 2.6), wp(6, 0, 2.2)];
  const m = solid(wall(rect, { top, headMode: "face" }), "the back hidden");
  const at = (x, y) => m.head.findIndex((p) => Math.abs(p[0] - x) < 1e-9 && Math.abs(-p[2] - y) < 1e-9);
  const back = [at(6, 0.6), at(0, 0.6)];
  eq(back.map((i) => m.headKind[i]), ["estimated", "estimated"], "the two corners of the back: estimated");
  eq([m.estimate.rule, m.estimate.from, [...m.estimate.vertices].sort()], ["perpendicular", 3, [...back].sort()], "the estimate: by the perpendicular, from the three visible points");
  near(back.map((i) => m.head[i][1]), [2.2, 2], 1e-12, "each the height of the visible face in front of it");
  eq([at(0, 0), at(3, 0), at(6, 0)].map((i) => m.headKind[i]), ["clicked", "clicked", "clicked"], "the visible points: clicked");
  // a trapezoid: the perpendicular, not the nearest corner
  const trap = [wp(0, 0), wp(6, 0), wp(5, 1), wp(1, 1)];
  const t2 = solid(wall(trap, { top, headMode: "face" }), "a trapezoid, back hidden");
  const at2 = (x, y) => t2.head.findIndex((p) => Math.abs(p[0] - x) < 1e-9 && Math.abs(-p[2] - y) < 1e-9);
  near(t2.head[at2(5, 1)][1], 2.6 + (2.2 - 2.6) * (2 / 3), 1e-9, "the corner (5, 1): the profile's height at x = 5, between the points at 3 and 6 (not the nearest corner's 2.2)");
  near(t2.head[at2(1, 1)][1], 2 + (2.6 - 2) * (1 / 3), 1e-9, "the corner (1, 1): the profile's height at x = 1");
  // the sketch's paradata: estimated corners never come from a top click
  ok(t2.estimate.vertices.every((i) => t2.headKind[i] === "estimated"), "the estimated corners are marked so");
  // one point only: all the others estimated from it
  const one = solid(wall(rect, { top: [wp(3, 0, 2.5)], headMode: "face" }), "one head point");
  eq([one.estimate.rule, one.estimate.vertices.length], ["single", 4], "one point: the four corners estimated from it (it is a fifth corner)");
}

// ── MICRO-PX1b · the corrections: pure edits, the wall made again ───────────
{
  const inp = { mode: "outline", plan: [wp(0, 0), wp(4, 0), wp(4, 0.6), wp(0, 0.6)], top: [wp(0, 0, 2), wp(4, 0, 2)], height: 1, thickness: 0.6, headMode: "face" };
  const v0 = W.meshVolume(W.buildWall(inp).mesh.positions, W.buildWall(inp).mesh.indices);
  // a drag: the corner (4, 0.6) carried to (5, 0.6) — the wall made again, larger
  const mv = W.editWall(inp, { op: "move", which: "plan", k: 2, to: wp(5, 0.6) });
  ok(mv.ok && inp.plan[2].p[0] === 4, "a move gives a new input, the old one untouched");
  const m1 = solid(W.buildWall(mv.input), "a corner dragged");
  ok(W.meshVolume(m1.positions, m1.indices) > v0 + 0.1, "the wall made again from the moved corner (larger)");
  ok(W.wallSig(mv.input) !== W.wallSig(inp) && W.wallSig(inp) === W.wallSig(JSON.parse(JSON.stringify(inp))), "the preview's signature: changed by the move, the same for the same input");
  // a head point dragged higher: the head follows
  const mt = W.editWall(inp, { op: "move", which: "top", k: 1, to: wp(4, 0, 2.5) });
  const m2 = solid(W.buildWall(mt.input), "a head point dragged");
  ok(m2.head.some((p) => Math.abs(p[1] - 2.5) < 1e-12), "the head at the dragged point's height");
  // a corner inserted on a side («+»): the side's midpoint
  const sides = W.wallSides(inp);
  eq(sides.map((x) => x.after), [0, 1, 2, 3], "an outline: a «+» on each of its four sides (closed)");
  near(sides[1].p, S(4, 0.3, 0), 1e-12, "…at the side's midpoint");
  const ins = W.editWall(inp, { op: "insert", after: 0, point: wp(2, -0.3) });
  ok(ins.ok && ins.input.plan.length === 5 && ins.input.plan[1].p[0] === 2, "a corner inserted after the first");
  eq(solid(W.buildWall(ins.input), "a corner inserted").stats.corners, 5, "…the wall with five corners");
  eq(W.wallSides({ mode: "axis", plan: [wp(0, 0), wp(4, 0), wp(4, 3)] }).length, 2, "an axis: a «+» on its two segments (open)");
  // a point taken away
  const rm = W.editWall(ins.input, { op: "remove", which: "plan", k: 1 });
  eq(rm.ok && W.wallSig(rm.input), W.wallSig(inp), "the inserted corner taken away: the wall as before");
  const rmTop = W.editWall(inp, { op: "remove", which: "top", k: 0 });
  ok(rmTop.ok && rmTop.input.top.length === 1, "a head point taken away");
  const tri = W.editWall(inp, { op: "remove", which: "plan", k: 3 });
  ok(tri.ok && tri.input.plan.length === 3, "a corner taken away: three left, a triangle");
  const tooFew = W.editWall(tri.input, { op: "remove", which: "plan", k: 0 });
  ok(!tooFew.ok && tooFew.why === "too_few", "the outline cannot go under three corners: refused");
  ok(!W.editWall(inp, { op: "remove", which: "top", k: 9 }).ok, "no such point: refused");
  // a head point added later («Aggiungi punti alti»)
  const add = W.editWall({ ...inp, headMode: "surface" }, { op: "add-top", point: wp(2, 0.3, 2.6) });
  const m3 = solid(W.buildWall(add.input), "a head point added later");
  eq(m3.stats.inner, 1, "added inside a seen head: a point of its surface");
}

// ── MICRO-PX1b · the pivot, and the new fields read back ────────────────────
{
  const base = { mode: "outline", plan: [wp(0, 0, 1), wp(4, 0, 1), wp(4, 0.6, 1), wp(0, 0.6, 1)], top: [], height: 2, thickness: 0.6 };
  const b = W.buildWall(base).mesh, c = W.buildWall({ ...base, pivot: "center" }).mesh, t = W.buildWall({ ...base, pivot: "top" }).mesh;
  near([b.origin[1], c.origin[1], t.origin[1]], [1, 2, 3], 1e-12, "the origin at the bottom (PX1's), the centre, the top");
  near(W.meshVolume(t.positions, t.indices), 4 * 0.6 * 2, 1e-9, "the pivot moves the frame, not the wall");
  near(t.base[0], b.base[0], 1e-12, "…the corners where they were");
  const back = W.readWallInput(JSON.parse(JSON.stringify({ ...base, headMode: "surface", pivot: "top", estimated: { rule: "x" } })));
  eq([back.headMode, back.pivot, "estimated" in back], ["surface", "top", false], "head mode and pivot read back; the estimate written in the layout is not read (computed again)");
  const old = W.readWallInput(JSON.parse(JSON.stringify(base)));
  eq(["headMode" in old, "pivot" in old], [false, false], "a wall of PX1: no head mode, no pivot — the mesh it had");
}

console.log(`check-wall-from-plan: ${checks} checks passed`);
