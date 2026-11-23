// MICRO-PX1c · executable check of the pure geometry of «Dal prospetto» /
// «From elevation» (src/from-elevation.ts):
//   · an outline on a flat face: the mean plane, the solid going BACKWARDS from
//     the face seen (both sides of the same points), volume exact, closed
//     manifold (every edge shared by two triangles in opposite directions), the
//     least polygons (2n vertices, 2(n − 2) + 2n triangles), normals outward;
//   · an IRREGULAR face: the front keeps the clicked points (not flattened),
//     the back is a plane at `depth` behind the mean plane, warned irregular;
//     a point behind the back plane held at the least thickness, warned;
//   · the depth from a click (distance along the normal; a point in front
//     refused), from a number, from the handle (the axis);
//   · a tilted face, a concave outline (L), a clockwise outline, a horizontal
//     face (seen from above), georeferenced coordinates (hundreds of km);
//   · a crossing outline refused with its sides, too few corners, no area;
//     coinciding and aligned clicks merged;
//   · the edits (move, insert, remove, the annotation, the depth), the inputs
//     read back (annotations kept), the signature, a pose baked;
//   · the edge of the mesh read from a ring of samples: two planes → the line
//     where they meet, three → the corner, one → the surface.
//
//   node scripts/check-from-elevation.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({ entryPoints: [`${SRC}from-elevation.ts`], bundle: true, format: "esm", write: false, logLevel: "silent" });
const E = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
const wb = await esbuild.build({ entryPoints: [`${SRC}wall-from-plan.ts`], bundle: true, format: "esm", write: false, logLevel: "silent" });
const W = await import("data:text/javascript;base64," + Buffer.from(wb.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const near = (a, b, eps, what) => {
  const d = Array.isArray(a) ? Math.max(...a.map((x, i) => Math.abs(x - b[i]))) : Math.abs(a - b);
  assert.ok(d <= eps, `${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); checks++;
};
const P = (x, y, z, extra = {}) => ({ p: [x, y, z], rm: "RM1", doc: "D1", ...extra });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** every mesh: closed manifold, the least polygons, positive volume, each face's normal leaving the solid */
function solid(r, what, n) {
  ok(r.ok, `${what}: built (${r.ok ? "" : JSON.stringify(r.error)})`);
  const m = r.mesh;
  ok(W.isClosedManifold(m.indices), `${what}: closed manifold`);
  eq(m.positions.length / 3, 2 * n, `${what}: 2n vertices`);
  eq(m.indices.length / 3, 2 * (n - 2) + 2 * n, `${what}: 2(n − 2) + 2n triangles`);
  ok(W.meshVolume(m.positions, m.indices) > 0, `${what}: volume positive (normals outward)`);
  return m;
}
const vol = (m) => W.meshVolume(m.positions, m.indices);

// 1 · a rectangle on a vertical face seen from +z
const rect = [P(0, 0, 0), P(4, 0, 0), P(4, 2, 0), P(0, 2, 0)];
let r = E.buildElevation({ front: rect, depth: 0.6, facing: [0, 0, 1] });
let m = solid(r, "rectangle", 4);
near(vol(m), 4 * 2 * 0.6, 1e-9, "rectangle: volume 4 × 2 × 0.6");
near(m.plane.n, [0, 0, 1], 1e-9, "rectangle: the normal towards the side seen");
ok(m.back.every((p) => Math.abs(p[2] + 0.6) < 1e-9), "rectangle: the back 0.6 behind (z = −0.6)");
ok(m.front.every((p) => Math.abs(p[2]) < 1e-9), "rectangle: the front where it was clicked");
near(m.origin, [2, 1, 0], 1e-9, "rectangle: the origin the centroid on the plane");
eq(m.warnings, [], "rectangle: no warning");
// each triangle's normal leaves the box (its centre minus the box's centre)
{
  const C = [2, 1, -0.3];
  let out = true;
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [0, 1, 2].map((k) => { const i = m.indices[t + k]; return [m.positions[3 * i] + m.origin[0], m.positions[3 * i + 1] + m.origin[1], m.positions[3 * i + 2] + m.origin[2]]; });
    const e1 = v[1].map((x, k) => x - v[0][k]), e2 = v[2].map((x, k) => x - v[0][k]);
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const c = [0, 1, 2].map((k) => (v[0][k] + v[1][k] + v[2][k]) / 3 - C[k]);
    if (dot(nn, c) <= 0) out = false;
  }
  ok(out, "rectangle: every triangle's normal points out of the box");
}

// 2 · seen from the other side: the solid goes the other way
r = E.buildElevation({ front: rect, depth: 0.6, facing: [0, 0, -1] });
m = solid(r, "seen from −z", 4);
ok(m.back.every((p) => Math.abs(p[2] - 0.6) < 1e-9), "seen from −z: the back at z = +0.6 (backwards from the face seen)");
near(vol(m), 4.8, 1e-9, "seen from −z: volume");

// 3 · clicked clockwise: turned, the same solid
r = E.buildElevation({ front: [...rect].reverse(), depth: 0.6, facing: [0, 0, 1] });
m = solid(r, "clockwise", 4);
near(vol(m), 4.8, 1e-9, "clockwise: volume");
eq([...m.order].sort(), [0, 1, 2, 3], "clockwise: every click a corner");

// 4 · an IRREGULAR face: the front keeps the points, the back is a plane
const irr = [P(0, 0, 0.06), P(2, 0, -0.04), P(4, 0, 0.05), P(4, 2, -0.05), P(2, 2.2, 0.04), P(0, 2, -0.06)];
r = E.buildElevation({ front: irr, depth: 0.5, facing: [0, 0, 1] });
m = solid(r, "irregular", 6);
for (let k = 0; k < m.front.length; k++) near(m.front[k], irr[m.order[k]].p, 1e-12, `irregular: front corner ${k} = its click`);
{
  const d = m.back.map((p) => dot(p.map((x, k) => x - m.plane.c[k]), m.plane.n));
  ok(d.every((x) => Math.abs(x + 0.5) < 1e-9), "irregular: the back is a plane 0.5 behind the mean plane");
  const th = m.thickness;
  ok(Math.max(...th) - Math.min(...th) > 0.05, "irregular: the thickness follows the face (thicker where it stands out)");
}
ok(m.warnings.some((w) => w.code === "irregular" && w.rms > 0.02), "irregular: warned (rms > 2 cm)");
// a point far behind the back plane: held at the least thickness
r = E.buildElevation({ front: [P(0, 0, 0), P(4, 0, 0), P(4, 2, 0), P(2, 3, -1.2), P(0, 2, 0)], depth: 0.3, facing: [0, 0, 1] });
m = solid(r, "clamped", 5);
ok(m.warnings.some((w) => w.code === "clamped" && w.n === 1), "clamped: one corner held at the least thickness, warned");
near(Math.min(...m.thickness), E.ELEV_TOL.minThick, 1e-12, "clamped: 1 cm");

// 5 · the depth from a click, from a number, from the handle
let dp = E.depthFromPoint(rect, [0, 0, 1], [3, 1.5, -0.83]);
ok(dp.ok && Math.abs(dp.depth - 0.83) < 1e-9, "depth from a click behind: 0.83");
dp = E.depthFromPoint(rect, [0, 0, 1], [9, -3, -0.4]);
ok(dp.ok && Math.abs(dp.depth - 0.4) < 1e-9, "depth from a click beside (off the outline): its distance along the normal");
dp = E.depthFromPoint(rect, [0, 0, 1], [1, 1, 0.3]);
ok(!dp.ok && dp.why === "in_front", "a click in front of the face is refused");
r = E.buildElevation({ front: rect, depth: 0.83, facing: [0, 0, 1] });
const h = E.depthHandle(r.mesh);
near(h.p, [2, 1, -0.83], 1e-9, "the depth handle: the centre of the back");
near(E.depthOnAxis(r.mesh, [2, 1, -1.1]), 1.1, 1e-9, "the handle dragged to −1.1: depth 1.1");

// 6 · a tilted face (rotated about y by 30°, then about x by 20°): area × depth
{
  const ry = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
  const rx = (p, a) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
  const tilt = (p) => rx(ry(p, Math.PI / 6), Math.PI / 9);
  const front = rect.map((w) => ({ ...w, p: tilt(w.p) }));
  const facing = tilt([0, 0, 1]);
  m = solid(E.buildElevation({ front, depth: 0.7, facing }), "tilted", 4);
  near(vol(m), 4 * 2 * 0.7, 1e-9, "tilted: volume");
  near(m.plane.n, facing, 1e-9, "tilted: the normal the face's");
}

// 7 · a concave outline (an L on the face)
const L = [P(0, 0, 0), P(3, 0, 0), P(3, 1, 0), P(1, 1, 0), P(1, 3, 0), P(0, 3, 0)];
m = solid(E.buildElevation({ front: L, depth: 0.4, facing: [0, 0, 1] }), "L", 6);
near(vol(m), (3 + 2) * 0.4, 1e-9, "L: volume (area 5)");

// 8 · a horizontal face seen from above (a floor, a threshold)
const floor = [P(0, 0, 0), P(0, 0, -2), P(3, 0, -2), P(3, 0, 0)];
m = solid(E.buildElevation({ front: floor, depth: 0.25, facing: [0, 1, 0] }), "floor", 4);
ok(m.back.every((p) => Math.abs(p[1] + 0.25) < 1e-9), "floor: the solid goes down");
near(vol(m), 6 * 0.25, 1e-9, "floor: volume");

// 9 · georeferenced: the same solid, translated
{
  const O = [512345.6, 210.4, -4612345.7];
  const far = rect.map((w) => ({ ...w, p: w.p.map((x, k) => x + O[k]) }));
  m = solid(E.buildElevation({ front: far, depth: 0.6, facing: [0, 0, 1] }), "UTM", 4);
  near(vol(m), 4.8, 1e-6, "UTM: volume");
  near(m.origin, [2 + O[0], 1 + O[1], O[2]], 1e-6, "UTM: the origin");
}

// 10 · refused
r = E.buildElevation({ front: [P(0, 0, 0), P(4, 2, 0), P(4, 0, 0), P(0, 2, 0)], depth: 0.5, facing: [0, 0, 1] });
ok(!r.ok && r.error.code === "self_intersect" && r.error.edges.length === 2, "a crossing outline refused, its two sides named");
r = E.buildElevation({ front: rect.slice(0, 2), depth: 0.5, facing: [0, 0, 1] });
ok(!r.ok && r.error.code === "too_few", "two clicks: too few");
r = E.buildElevation({ front: [P(0, 0, 0), P(1, 0, 0), P(2, 0, 0), P(3, 0, 0)], depth: 0.5, facing: [0, 0, 1] });
ok(!r.ok && (r.error.code === "no_area" || r.error.code === "too_few"), "clicks on a line: no area");
r = E.buildElevation({ front: rect, depth: 0, facing: [0, 0, 1] });
ok(!r.ok && r.error.code === "depth", "no depth: refused");

// 11 · merged: a double click, a click in the middle of a side
r = E.buildElevation({ front: [P(0, 0, 0), P(0.004, 0, 0), P(2, 0.003, 0), P(4, 0, 0), P(4, 2, 0), P(0, 2, 0)], depth: 0.6, facing: [0, 0, 1] });
m = solid(r, "merged", 4);
ok(m.warnings.some((w) => w.code === "merged" && w.n === 2), "merged: two clicks (a double, an aligned)");
near(vol(m), 4.8, 0.01, "merged: volume (the double click 4 mm off)");

// 12 · the edits
const inp = { front: rect, depth: 0.6, facing: [0, 0, 1] };
let ed = E.editElevation(inp, { op: "move", k: 2, to: P(5, 2, 0) });
ok(ed.ok && ed.input.front[2].p[0] === 5 && inp.front[2].p[0] === 4, "move: a new input, the old untouched");
ok(vol(E.buildElevation(ed.input).mesh) > 4.8, "move: the solid made again, larger");
ed = E.editElevation(inp, { op: "insert", after: 1, point: P(4.5, 1, 0) });
ok(ed.ok && ed.input.front.length === 5, "insert after the second corner");
ed = E.editElevation({ ...inp, front: rect.slice(0, 3) }, { op: "remove", k: 0 });
ok(!ed.ok && ed.why === "too_few", "remove under three: refused");
ed = E.editElevation(inp, { op: "note", k: 1, note: "  spigolo rifatto in restauro " });
ok(ed.ok && ed.input.front[1].note === "spigolo rifatto in restauro", "note: written, trimmed");
const moved = E.editElevation(ed.input, { op: "move", k: 1, to: P(4.1, 0, 0) });
ok(moved.ok && moved.input.front[1].note === "spigolo rifatto in restauro", "a point moved keeps its annotation");
ed = E.editElevation(ed.input, { op: "note", k: 1, note: "" });
ok(ed.ok && !("note" in ed.input.front[1]), "note emptied: gone");
ed = E.editElevation(inp, { op: "depth", depth: 0.9, from: "click", point: P(1, 1, -0.9, { note: "quota 492,13" }) });
ok(ed.ok && ed.input.depth === 0.9 && ed.input.depthFrom === "click" && ed.input.depthPoint.note === "quota 492,13", "depth from a click: the point kept with its note");
ed = E.editElevation(ed.input, { op: "depth", depth: 1.2, from: "number" });
ok(ed.ok && !ed.input.depthPoint && ed.input.depthFrom === "number", "depth written: the clicked point lets go");
ok(!E.editElevation(inp, { op: "depth", depth: -1, from: "number" }).ok, "a negative depth refused");

// 13 · read back (layout), the annotations kept
const stored = JSON.parse(JSON.stringify({ ...inp, front: [P(0, 0, 0, { note: "quota 492,13" }), ...rect.slice(1)], depthFrom: "click", depthPoint: P(1, 1, -0.6) }));
const back = E.readElevationInput(stored);
ok(back && back.front[0].note === "quota 492,13" && back.depthFrom === "click" && back.depthPoint.p[2] === -0.6, "read back: notes, depth, its point");
ok(E.readElevationInput({ front: rect.slice(0, 2), facing: [0, 0, 1], depth: 1 }) === null, "read back: two points is not one");
ok(E.readElevationInput({ front: rect, depth: 1 }) === null, "read back: no facing is not one");
ok(E.elevationSig(inp) !== E.elevationSig({ ...inp, depth: 0.61 }), "the signature changes with the depth");
eq(E.elevationSides(rect).length, 4, "four «+» on a rectangle");
eq(E.elevationDocuments({ front: [P(0, 0, 0), { p: [1, 0, 0], rm: "RM2", doc: "D2" }, P(1, 1, 0)], depthPoint: null }), ["D1", "D2"], "the documents of the clicks");

// 14 · a pose baked: turned 90° about y and moved
{
  r = E.buildElevation(inp);
  const baked = E.bakeElevationPose(inp, r.mesh.origin, { position: [10, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1] });
  near(baked.facing, [1, 0, 0], 1e-9, "baked: the facing turned (+z → +x)");
  m = solid(E.buildElevation(baked), "baked", 4);
  near(vol(m), 4.8, 1e-9, "baked: the same volume");
  near(m.origin, [10, 0, 0], 1e-9, "baked: its origin where the pose put it");
}

// 15 · the edge read from a ring of samples
{
  // a box's vertical edge at x = 0, z = 0: one face x = 0 (normal −x), the other z = 0 (normal +z)
  const ring = [];
  for (let k = 0; k < 6; k++) ring.push({ p: [0, 1 + 0.01 * k, 0.02 + 0.005 * k], n: [-1, 0, 0] });
  for (let k = 0; k < 6; k++) ring.push({ p: [0.02 + 0.005 * k, 1 - 0.01 * k, 0], n: [0, 0, 1] });
  const s = E.snapEdge({ p: [0.004, 1.02, 0], n: [0, 0, 1] }, ring);
  ok(s.kind === "edge", "edge: two planes found");
  near([s.p[0], s.p[2]], [0, 0], 1e-9, "edge: on the line where the two faces meet");
  near(s.p[1], 1.02, 1e-9, "edge: the nearest point of the line to the click");
  near(s.angle, 90, 1e-6, "edge: 90° between the faces");
  // a corner: x = 0, z = 0, y = 2 (the top)
  const ring3 = [...ring.map((q) => ({ ...q, p: [q.p[0], q.p[1] + 0.97, q.p[2]] }))];
  for (let k = 0; k < 4; k++) ring3.push({ p: [0.01 + 0.004 * k, 2, 0.01 + 0.003 * k], n: [0, 1, 0] });
  const c = E.snapEdge({ p: [0.01, 2, 0.01], n: [0, 1, 0] }, ring3);
  ok(c.kind === "corner", "corner: three planes found");
  near(c.p, [0, 2, 0], 1e-9, "corner: where the three faces meet");
  // a flat face: nothing to snap
  const flat = Array.from({ length: 8 }, (_, k) => ({ p: [k * 0.01, 1, 0.001 * k], n: [0, 0.02 * (k % 2), 1] }));
  const f = E.snapEdge({ p: [0.03, 1, 0], n: [0, 0, 1] }, flat);
  ok(f.kind === "surface" && f.p[0] === 0.03, "a flat face: the click stays");
  // a gentle bend (15°) under the threshold: the surface
  const bend = [...Array.from({ length: 5 }, (_, k) => ({ p: [k * 0.01, 1, 0], n: [0, 0, 1] })),
    ...Array.from({ length: 5 }, (_, k) => ({ p: [-k * 0.01, 1, 0], n: [Math.sin(Math.PI / 12), 0, Math.cos(Math.PI / 12)] }))];
  ok(E.snapEdge({ p: [0, 1, 0], n: [0, 0, 1] }, bend).kind === "surface", "a 15° bend is not an edge (threshold 30°)");
}

// 16 · the eigen-decomposition
{
  const e = E.eigenSym3([[2, 1, 0], [1, 2, 0], [0, 0, 5]]);
  near([...e.values].sort((a, b) => a - b), [1, 3, 5], 1e-9, "eigen values of a known matrix");
}

console.log(`check-from-elevation: ${checks} checks OK`);
