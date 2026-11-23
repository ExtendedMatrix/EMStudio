// MICRO-PX2 · executable check of the pure geometry of «Scatola a sette punti» /
// «Seven-point box» (src/box-seven-points.ts), EM Tools' «Proxy Box Creator»:
//   · the SAME seven points given to EM Tools and to EMStudio: the eight
//     vertices equal within 1 mm (EMTOOLS_REF below: computed by EM Tools' own
//     `calculate_box_geometry`, read from its source and run without Blender by
//     scripts/emtools-box-reference.py), the dimensions, the three pivots;
//     cases: on the axes, rotated with a sloped alignment, the thickness on the
//     other side, UTM coordinates, and EM Tools' two rules kept and SAID (the
//     thickness measured in 3D, the length's start beyond its end), the quotas
//     inverted;
//   · the mesh: 8 vertices, 12 triangles, closed manifold, volume = L × W × H,
//     every face outward; the scene frame (Y up) ↔ Blender's (Z up);
//   · degenerate cases refused with their reason: a point missing (which),
//     the alignment vertical (no direction in plan), the thickness point on the
//     alignment (aligned points), no height, no length;
//   · the provisional box (five points), the edits (set, note kept on a move,
//     swap of the length, pivot), the inputs read back, the signature, a pose baked.
//
//   node scripts/check-box-seven-points.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (f) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${f}`], bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const B = await load("box-seven-points.ts");
const W = await load("wall-from-plan.ts");

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const near = (a, b, eps, what) => {
  const d = Array.isArray(a) ? Math.max(...a.map((x, i) => Math.abs(x - b[i]))) : Math.abs(a - b);
  assert.ok(d <= eps, `${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)} (Δ ${d})`); checks++;
};
const MM = 0.001;
/** Blender (x, y, z) → scene (x, z, −y): the clicks of the Space */
const scene = (b) => [b[0], b[2], -b[1]];
const pts = (list, doc = "D1") => list.map((b, k) => ({ p: scene(b), rm: "RM1", doc, ...(k === 2 ? { note: "spessore" } : {}) }));

// EM Tools' values (scripts/emtools-box-reference.py on EM-blender-tools EM-tools_v1.6.0_dev, 23 Nov 2026)
const EMTOOLS_REF = 
{"axis": {"points": [[0, 0, 0], [5, 0, 0], [2, 0.6, 0], [1, 0.3, -0.2], [1, 0.3, 1.8], [0.5, 0, 0.5], [4.5, 0.1, 0.7]], "vertices": [[0.5, 0.0, -0.2], [4.5, 0.0, -0.2], [0.5, 0.6, -0.2], [4.5, 0.6, -0.2], [0.5, 0.0, 1.8], [4.5, 0.0, 1.8], [0.5, 0.6, 1.8], [4.5, 0.6, 1.8]], "dimensions": [4.0, 0.6, 2.0], "pivot": {"bottom": [2.5, 0.3, -0.2], "center": [2.5, 0.3, 0.8], "top": [2.5, 0.3, 1.8]}}, "rotated_sloped": {"points": [[1, 2, 10.0], [4.464099166331756, 4.000004241450411, 10.3], [2.2, 1.1, 10.1], [2, 3, 9.4], [2.5, 3.1, 11.65], [0.7, 1.9, 10.2], [4.6, 3.9, 10.4]], "vertices": [[0.731698987, 1.8450959, 9.4], [4.522721479, 4.033849945, 9.4], [1.421973317, 0.649509069, 9.4], [5.21299581, 2.838263115, 9.4], [0.731698987, 1.8450959, 11.65], [4.522721479, 4.033849945, 11.65], [1.421973317, 0.649509069, 11.65], [5.21299581, 2.838263115, 11.65]], "dimensions": [4.377498808, 1.380545733, 2.25], "pivot": {"bottom": [2.972347398, 2.341679507, 9.4], "center": [2.972347398, 2.341679507, 10.525], "top": [2.972347398, 2.341679507, 11.65]}}, "thickness_other_side": {"points": [[0, 0, 0], [0, 6, 0], [-0.8, 3, 0], [0, 1, 0], [0, 1, 2.5], [0, 0.4, 0], [0, 5.2, 0]], "vertices": [[0.0, 0.4, 0.0], [0.0, 5.2, 0.0], [-0.8, 0.4, 0.0], [-0.8, 5.2, 0.0], [0.0, 0.4, 2.5], [0.0, 5.2, 2.5], [-0.8, 0.4, 2.5], [-0.8, 5.2, 2.5]], "dimensions": [4.8, 0.8, 2.5], "pivot": {"bottom": [-0.4, 2.8, 0.0], "center": [-0.4, 2.8, 1.25], "top": [-0.4, 2.8, 2.5]}}, "utm": {"points": [[291234.512, 4643110.204, 492.13], [291238.9, 4643112.817, 492.15], [291237.4, 4643111.4, 492.14], [291236.0, 4643111.0, 491.82], [291236.0, 4643111.0, 493.41], [291235.0, 4643110.6, 492.1], [291238.3, 4643112.5, 492.2]], "vertices": [[291235.046334961, 4643110.522189894, 491.82], [291238.317712726, 4643112.470255095, 491.82], [291235.276587304, 4643110.135528094, 491.82], [291238.547965069, 4643112.083593295, 491.82], [291235.046334961, 4643110.522189894, 493.41], [291238.317712726, 4643112.470255095, 493.41], [291235.276587304, 4643110.135528094, 493.41], [291238.547965069, 4643112.083593295, 493.41]], "dimensions": [3.807475608, 0.450026098, 1.59], "pivot": {"bottom": [291236.797150015, 4643111.302891594, 491.82], "center": [291236.797150015, 4643111.302891594, 492.615], "top": [291236.797150015, 4643111.302891594, 493.41]}}, "thickness_high": {"points": [[0, 0, 0], [4, 0, 0], [2, 0.6, 1.0], [1, 0.3, 0], [1, 0.3, 1.5], [0, 0, 0], [4, 0, 0]], "vertices": [[0.0, 0.0, 0.0], [4.0, 0.0, 0.0], [0.0, 1.166190379, 0.0], [4.0, 1.166190379, 0.0], [0.0, 0.0, 1.5], [4.0, 0.0, 1.5], [0.0, 1.166190379, 1.5], [4.0, 1.166190379, 1.5]], "dimensions": [4.0, 1.166190379, 1.5], "pivot": {"bottom": [2.0, 0.583095189, 0.0], "center": [2.0, 0.583095189, 0.75], "top": [2.0, 0.583095189, 1.5]}}, "length_reversed": {"points": [[0, 0, 0], [5, 0, 0], [2, 0.6, 0], [1, 0.3, 0], [1, 0.3, 1.5], [4.0, 0, 0], [1.0, 0, 0]], "vertices": [[4.0, 0.0, 0.0], [7.0, 0.0, 0.0], [4.0, 0.6, 0.0], [7.0, 0.6, 0.0], [4.0, 0.0, 1.5], [7.0, 0.0, 1.5], [4.0, 0.6, 1.5], [7.0, 0.6, 1.5]], "dimensions": [3.0, 0.6, 1.5], "pivot": {"bottom": [5.5, 0.3, 0.0], "center": [5.5, 0.3, 0.75], "top": [5.5, 0.3, 1.5]}}, "quota_inverted": {"points": [[0, 0, 0], [5, 0, 0], [2, 0.6, 0], [1, 0.3, 1.5], [1, 0.3, 0], [0.5, 0, 0], [4.5, 0, 0]], "vertices": [[0.5, 0.0, 1.5], [4.5, 0.0, 1.5], [0.5, 0.6, 1.5], [4.5, 0.6, 1.5], [0.5, 0.0, 0.0], [4.5, 0.0, 0.0], [0.5, 0.6, 0.0], [4.5, 0.6, 0.0]], "dimensions": [4.0, 0.6, -1.5], "pivot": {"bottom": [2.5, 0.3, 1.5], "center": [2.5, 0.3, 0.75], "top": [2.5, 0.3, 0.0]}}}
;

/** the mesh's checks: 8 vertices, 12 triangles, closed, volume, outward */
function solid(r, what) {
  ok(r.ok, `${what}: built (${r.ok ? "" : JSON.stringify(r.error)})`);
  const m = r.mesh;
  eq(m.positions.length / 3, 8, `${what}: 8 vertices`);
  eq(m.indices.length / 3, 12, `${what}: 12 triangles`);
  ok(W.isClosedManifold(m.indices), `${what}: closed manifold`);
  near(W.meshVolume(m.positions, m.indices), m.dims.length * m.dims.thickness * m.dims.height, 1e-6 * Math.max(1, m.stats.volume), `${what}: volume L × W × H, outward`);
  return m;
}

// 1 · the same seven points: EM Tools' vertices within 1 mm, each case, each pivot
for (const [name, ref] of Object.entries(EMTOOLS_REF)) {
  const input = { points: pts(ref.points) };
  const m = solid(B.buildBox(input), name);
  ref.vertices.forEach((v, k) => near(m.vertices[k], v, MM, `${name}: vertex ${k} as EM Tools`));
  near([m.dims.length, m.dims.thickness, m.dims.height], [ref.dimensions[0], ref.dimensions[1], Math.abs(ref.dimensions[2])], MM, `${name}: dimensions as EM Tools`);
  for (const pv of ["bottom", "center", "top"]) {
    const mp = B.buildBox({ ...input, pivot: pv }).mesh;
    near(mp.origin, scene(ref.pivot[pv]), MM, `${name}: pivot ${pv} as EM Tools`);
    // the scene's mesh is EM Tools' vertices, local to the pivot, Y up
    for (let k = 0; k < 8; k++) {
      const s = [mp.positions[3 * k] + mp.origin[0], mp.positions[3 * k + 1] + mp.origin[1], mp.positions[3 * k + 2] + mp.origin[2]];
      near(s, scene(ref.vertices[k]), MM, `${name}: scene vertex ${k} (pivot ${pv})`);
    }
  }
}
// the cases where EM Tools' rules are said, never changed
const codes = (name) => B.buildBox({ points: pts(EMTOOLS_REF[name].points) }).mesh.warnings.map((w) => w.code);
eq(codes("axis"), [], "axis: no warning");
eq(codes("thickness_other_side"), [], "thickness on the other side: no warning");
ok(codes("thickness_high").includes("thickness_slant"), "thickness point 1 m above the alignment: said");
const slant = B.buildBox({ points: pts(EMTOOLS_REF.thickness_high.points) }).mesh;
near(slant.thicknessPlan, 0.6, 1e-9, "thickness_high: 0.60 in plan");
near(slant.dims.thickness, Math.hypot(0.6, 1), 1e-9, "thickness_high: EM Tools' 3D thickness kept (1.166)");
ok(codes("length_reversed").includes("length_reversed"), "length's start beyond its end: said");
ok(codes("quota_inverted").includes("quota_swapped"), "quota max under quota min: said");
{ const m = B.buildBox({ points: pts(EMTOOLS_REF.rotated_sloped.points) }).mesh;
  eq(m.warnings.some((w) => w.code === "thickness_slant"), Math.abs(m.dims.thickness - m.thicknessPlan) > 0.01, "rotated, sloped: the 3D thickness said exactly when it differs by more than 1 cm"); }
// thickness on the other side: the box goes towards the thickness point
const other = B.buildBox({ points: pts(EMTOOLS_REF.thickness_other_side.points) }).mesh;
near(other.axes.across, [-1, 0, 0], 1e-9, "the thickness point decides the side (−x)");
// 2 · axis case in detail: the box from x 0.5 to 4.5, y 0 to 0.6, z −0.2 to 1.8
const ax = B.buildBox({ points: pts(EMTOOLS_REF.axis.points) }).mesh;
near(ax.stats.volume, 4 * 0.6 * 2, 1e-9, "axis: volume 4 × 0.6 × 2");
near(ax.origin, scene([2.5, 0.3, -0.2]), 1e-9, "axis: pivot bottom (EM Tools' default) at the centre in plan, quota min");
// every triangle's normal leaves the box (axis case, centre known)
{
  const P = (i) => [ax.positions[3 * i] + ax.origin[0], ax.positions[3 * i + 1] + ax.origin[1], ax.positions[3 * i + 2] + ax.origin[2]];
  const c = scene([2.5, 0.3, 0.8]);
  let out = 0;
  for (let t = 0; t < 12; t++) {
    const [a, b, d] = [P(ax.indices[3 * t]), P(ax.indices[3 * t + 1]), P(ax.indices[3 * t + 2])];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const mid = [(a[0] + b[0] + d[0]) / 3 - c[0], (a[1] + b[1] + d[1]) / 3 - c[1], (a[2] + b[2] + d[2]) / 3 - c[2]];
    if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] > 0) out++;
  }
  eq(out, 12, "axis: each triangle's normal outward");
}

// 3 · degenerate cases, refused with their reason
const base = EMTOOLS_REF.axis.points;
const withPt = (k, b) => pts(base.map((p, i) => (i === k ? b : p)));
let r = B.buildBox({ points: [...pts(base).slice(0, 4), null, null, null] });
ok(!r.ok && r.error.code === "missing", "points missing: refused");
eq(r.error.missing, [4, 5, 6], "…naming them");
r = B.buildBox({ points: withPt(1, [0, 0, 3]) });
ok(!r.ok && r.error.code === "alignment", "alignment end above its start (vertical): refused");
r = B.buildBox({ points: withPt(2, [3, 0, 0.5]) });
ok(!r.ok && r.error.code === "thickness", "thickness point on the alignment's line (aligned points): refused");
r = B.buildBox({ points: withPt(2, [3, 0.004, 0]) });
ok(!r.ok && r.error.code === "thickness", "thickness under 1 cm: refused");
r = B.buildBox({ points: withPt(4, [1, 0.3, -0.2]) });
ok(!r.ok && r.error.code === "height", "quota max = quota min (no height): refused");
r = B.buildBox({ points: withPt(6, [0.5, 0.4, 2]) });
ok(!r.ok && r.error.code === "length", "length end = start along the axis: refused");
r = B.buildBox({ points: pts(Array(7).fill([1, 1, 1])) });
ok(!r.ok && r.error.code === "alignment", "all points the same: refused (alignment first)");

// 4 · the provisional box: five points, the length from the alignment
r = B.buildBox({ points: [...pts(base).slice(0, 5), null, null] }, { provisional: true });
ok(r.ok && r.mesh.warnings.some((w) => w.code === "provisional"), "five points: a provisional box");
near(r.mesh.dims.length, 5, 1e-9, "…as long as the alignment");
ok(!B.buildBox({ points: [...pts(base).slice(0, 5), null, null] }).ok, "not provisional: refused");
eq(B.boxNextRole({ points: [...pts(base).slice(0, 5), null, null] }), 5, "next role: the length's start");
eq(B.boxNextRole({ points: [null, ...pts(base).slice(1)] }), 0, "a slot emptied: it is the next");
eq(B.boxNextRole({ points: pts(base) }), 7, "all seven: none next");
eq(B.BOX_POINT_TYPES.alignment_start, "Alignment Start", "point_type: EM Tools' label");
eq(B.BOX_ROLES.map((k) => B.BOX_POINT_TYPES[k]), ["Alignment Start", "Alignment End", "Thickness", "Quota Min", "Quota Max", "Length Start", "Length End"], "the seven labels in EM Tools' order");

// 5 · edits
const inp = { points: pts(base), pivot: "bottom" };
let ed = B.editBox(inp, { op: "set", k: 2, to: { p: scene([2, 0.8, 0]), rm: "RM2", doc: "D2" } });
ok(ed.ok && ed.input.points[2].note === "spessore", "a moved point keeps its annotation");
eq(ed.input.points[2].doc, "D2", "…and takes its new document");
near(B.buildBox(ed.input).mesh.dims.thickness, 0.8, 1e-9, "…the box made again (0.8)");
ok(inp.points[2].doc === "D1", "the input is never changed");
ed = B.editBox(inp, { op: "note", k: 0, note: "  angolo NE " });
eq(ed.input.points[0].note, "angolo NE", "a note written (trimmed)");
ed = B.editBox(ed.input, { op: "note", k: 0, note: "" });
ok(!("note" in ed.input.points[0]), "a note emptied: gone");
const rev = { points: pts(EMTOOLS_REF.length_reversed.points) };
ed = B.editBox(rev, { op: "swapLength" });
const sw = B.buildBox(ed.input).mesh;
ok(!sw.warnings.some((w) => w.code === "length_reversed"), "swap of the length: no more reversed");
near([sw.vertices[0][0], sw.vertices[1][0]], [1, 4], 1e-9, "…the box from 1 to 4 (the points measured)");
ed = B.editBox(inp, { op: "pivot", pivot: "top" });
near(B.buildBox(ed.input).mesh.origin, scene([2.5, 0.3, 1.8]), 1e-9, "pivot top");
ok(!B.editBox(inp, { op: "set", k: 7, to: null }).ok, "a slot out of range: refused");
ed = B.editBox(inp, { op: "set", k: 3, to: null });
eq(B.boxMissing(ed.input), [3], "a point cleared: missing");

// 6 · read back, signature, documents, pose
const back = B.readBoxInput(JSON.parse(JSON.stringify({ points: pts(base), pivot: "center" })));
ok(back && back.points.length === 7 && back.pivot === "center", "read back: seven points, the pivot");
eq(back.points[2].note, "spessore", "…annotations kept");
eq(B.readBoxInput({ points: pts(base).slice(0, 6) }), null, "six points: not a box");
eq(B.readBoxInput({ points: "x" }), null, "garbage: null");
ok(B.boxSig(inp) !== B.boxSig(B.editBox(inp, { op: "pivot", pivot: "top" }).input), "signature: the pivot changes it");
ok(B.boxSig(inp) === B.boxSig(JSON.parse(JSON.stringify(inp))), "signature: stable");
eq(B.boxDocuments({ points: [...pts(base).slice(0, 3), ...pts(base, "D2").slice(3)] }), ["D1", "D2"], "documents in order (the hybrid case)");
{
  const m0 = B.buildBox(inp).mesh;
  const baked = B.bakeBoxPose(inp, m0.origin, { position: [m0.origin[0] + 10, m0.origin[1] + 2, m0.origin[2]], rotation: [0, 0, 0], scale: [1, 1, 1] });
  const m1 = B.buildBox(baked).mesh;
  near(m1.origin, [m0.origin[0] + 10, m0.origin[1] + 2, m0.origin[2]], 1e-9, "pose baked: moved 10 m and 2 m up");
  near([m1.dims.length, m1.dims.thickness, m1.dims.height], [m0.dims.length, m0.dims.thickness, m0.dims.height], 1e-9, "…the same box");
  const rot = B.bakeBoxPose(inp, m0.origin, { position: m0.origin, rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1] });
  const m2 = B.buildBox(rot).mesh;
  near([m2.dims.length, m2.dims.thickness, m2.dims.height], [m0.dims.length, m0.dims.thickness, m0.dims.height], 1e-9, "turned 90° about the vertical: the same dimensions");
  near(Math.abs(m2.axes.along[0]), 0, 1e-9, "…its axis turned");
}

console.log(`check-box-seven-points: ${checks} checks OK`);
