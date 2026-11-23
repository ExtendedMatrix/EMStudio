// MICRO-PX3 · executable check of the pure geometry of «Annota superficie» /
// «Annotate surface» (src/surface-annotation.ts), the areal cut out of the RM:
//   · a contour on a PLANE: the area exact (the contour's own, wherever its
//     corners fall on the mesh), the border on the plane, the triangles inside
//     kept whole, the crossing ones clipped, the offset along the normal;
//   · a contour on a CURVED surface (a half cylinder): the area of the patch
//     (r · 2θ · L), the border DRAPED (every point on the cylinder, the sides
//     split at the mesh's step, never a chord over the relief);
//   · a contour that LEAVES the model refused (a click off the mesh; a contour
//     around a hole of the mesh: the coverage said), a crossing contour, too
//     few points; two layers under the contour: only the clicks' one; a seam
//     of two meshes (tiles) welded;
//   · EM Tools' classifier (A / B / C), the offset stacked (× overlaps + 1, at
//     most × 5), the draped preview path, the edits, the inputs read back, the
//     mesh packed for the layout and read back.
//
//   node scripts/check-surface-annotation.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (f) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${f}`], bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const S = await load("surface-annotation.ts");

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const near = (a, b, eps, msg) => { assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b} (±${eps})`); n++; };

// ── meshes (scene frame, Y up), triangle soups ──────────────────────────────
/** a grid on y = h, x ∈ [x0, x1], z ∈ [z0, z1], step s, normal +Y; `hole`: cells skipped */
function plane({ x0 = -2, x1 = 2, z0 = -2, z1 = 2, s = 0.1, h = 0, hole = null, down = false } = {}) {
  const out = [];
  const nx = Math.round((x1 - x0) / s), nz = Math.round((z1 - z0) / s);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const xa = x0 + i * s, xb = xa + s, za = z0 + j * s, zb = za + s;
    if (hole && xa >= hole[0] - 1e-9 && xb <= hole[1] + 1e-9 && za >= hole[2] - 1e-9 && zb <= hole[3] + 1e-9) continue;
    // counter-clockwise seen from +Y: (x, z) → normal +Y needs (a, c, b) order in x–z
    const A = [xa, h, za], B = [xb, h, za], C = [xb, h, zb], D = [xa, h, zb];
    const tri = down ? [[A, B, C], [A, C, D]] : [[A, C, B], [A, D, C]];
    for (const t of tri) out.push(...t.flat());
  }
  return { positions: out };
}
/** the upper half of a cylinder of radius r along x (y up), from x0 to x1, `seg` sides over 180° */
function halfCylinder({ r = 2, x0 = -1, x1 = 2, seg = 180, sx = 0.1 } = {}) {
  const out = [];
  const nx = Math.round((x1 - x0) / sx);
  const pt = (x, k) => { const a = (Math.PI * k) / seg; return [x, r * Math.sin(a), r * Math.cos(a)]; };
  for (let i = 0; i < nx; i++) for (let k = 0; k < seg; k++) {
    const xa = x0 + i * sx, xb = xa + sx;
    const A = pt(xa, k), B = pt(xb, k), C = pt(xb, k + 1), D = pt(xa, k + 1);
    // outward normal: from (xa,k) → (xb,k) → (xb,k+1)
    const tris = [[A, B, C], [A, C, D]];
    for (const t of tris) {
      const e1 = t[1].map((c, q) => c - t[0][q]), e2 = t[2].map((c, q) => c - t[0][q]);
      const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const mid = t.reduce((s, p) => s.map((c, q) => c + p[q] / 3), [0, 0, 0]);
      const outward = nn[1] * mid[1] + nn[2] * mid[2] > 0;
      out.push(...(outward ? t : [t[0], t[2], t[1]]).flat());
    }
  }
  return { positions: out };
}
const merge = (...ms) => ({ positions: ms.flatMap((m) => m.positions) });
const P = (x, y, z, extra = {}) => ({ p: [x, y, z], rm: "rm1", doc: "d1", ...extra });
const UP = [0, 1, 0];
const ups = (k) => Array(k).fill(UP);

function meshChecks(m, label) {
  const nv = m.positions.length / 3;
  ok(m.indices.every((i) => Number.isInteger(i) && i >= 0 && i < nv), `${label}: indices in range`);
  const use = new Map();
  for (let i = 0; i < m.indices.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = m.indices[i + k], b = m.indices[i + (k + 1) % 3];
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    use.set(key, (use.get(key) ?? 0) + 1);
  }
  ok([...use.values()].every((u) => u <= 2), `${label}: every edge in at most two triangles (a surface, no fold)`);
  ok(m.boundary.length >= 1 && m.boundary[0].length >= 3, `${label}: a closed border`);
}

// ── 1 · a square on a plane ─────────────────────────────────────────────────
{
  const sq = [P(-0.43, 0, -0.37), P(0.57, 0, -0.37), P(0.57, 0, 0.63), P(-0.43, 0, 0.63)];
  const r = S.cutSurface({ contour: sq, normals: ups(4) }, plane());
  ok(r.ok, `square on the plane is cut (${r.ok ? "" : JSON.stringify(r.error)})`);
  const m = r.mesh;
  near(m.area, 1, 1e-9, "square: area 1 m²");
  near(m.polygonArea, 1, 1e-9, "square: the contour's area");
  near(m.coverage, 1, 1e-9, "square: coverage 1");
  near(m.perimeter, 4, 1e-9, "square: the border 4 m");
  ok(m.stats.loops === 1 && m.stats.turned === 0, "square: one border, nothing turned away");
  ok(m.stats.whole > 0 && m.stats.clipped > 0, "square: triangles kept whole inside, clipped across");
  // 10 × 10 cells inside, the border cells clipped: 9 × 9 whole cells = 162 triangles
  ok(m.stats.whole === 162, `square: 162 triangles of the mesh kept whole (${m.stats.whole})`);
  ok(m.boundary[0].every((p) => Math.abs(p[1]) < 1e-12), "square: the border on the RM (no offset)");
  // the border split at the mesh's step: 10 crossings per side at least
  ok(m.boundary[0].length >= 40, `square: the border split at the mesh's edges (${m.boundary[0].length} points)`);
  const ys = [];
  for (let i = 1; i < m.positions.length; i += 3) ys.push(m.positions[i] + m.origin[1]);
  ok(ys.every((y) => Math.abs(y - S.SURF_TOL.offset) < 1e-9), "square: every vertex 2 mm above the plane (the offset)");
  near(m.offset, 0.002, 1e-12, "square: offset 2 mm");
  ok(m.classification.scenario === "A" && m.classification.strategy === "PROJECTIVE", "square: EM Tools' scenario A (projective)");
  meshChecks(m, "square");
  // the RM's orientation kept: the normals up
  const p = (i) => [0, 1, 2].map((k) => m.positions[i * 3 + k]);
  let up = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = p(m.indices[i]), b = p(m.indices[i + 1]), c = p(m.indices[i + 2]);
    const e1 = b.map((x, k) => x - a[k]), e2 = c.map((x, k) => x - a[k]);
    if (e1[2] * e2[0] - e1[0] * e2[2] > 0) up++;
  }
  ok(up === m.indices.length / 3, "square: every triangle faces up, as the RM's");
}

// ── 2 · a rotated, concave contour (corners anywhere) ────────────────────────
{
  const L = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];       // area 3
  const a = 0.4, c = Math.cos(a), s = Math.sin(a);
  const pts = L.map(([x, z]) => P(-1.03 + x * c - z * s, 0, -0.71 + x * s + z * c));
  // clockwise in plan from above: the contour may be either way
  const r = S.cutSurface({ contour: pts, normals: ups(6) }, plane({ s: 0.13 }));
  ok(r.ok, "L shape rotated: cut");
  near(r.mesh.area, 3, 1e-9, "L shape: area 3 m² (its own, not the mesh's cells)");
  near(r.mesh.perimeter, 8, 1e-9, "L shape: border 8 m");
  meshChecks(r.mesh, "L");
  const rr = S.cutSurface({ contour: [...pts].reverse(), normals: ups(6) }, plane({ s: 0.13 }));
  near(rr.mesh.area, 3, 1e-9, "L shape the other way round: the same area");
}

// ── 3 · a curved surface: the half cylinder ─────────────────────────────────
{
  const r0 = 2, th = 0.6, Lx = 1;
  const cyl = halfCylinder({ r: r0 });
  // four clicks on the surface: x ∈ [0, 1], angle ± θ from the top
  const on = (x, a) => [x, r0 * Math.cos(a), r0 * Math.sin(a)];
  const nrm = (a) => [0, Math.cos(a), Math.sin(a)];
  const contour = [P(...on(0, -th)), P(...on(Lx, -th)), P(...on(Lx, th)), P(...on(0, th))];
  const r = S.cutSurface({ contour, normals: [nrm(-th), nrm(-th), nrm(th), nrm(th)] }, cyl);
  ok(r.ok, `cylinder: cut (${r.ok ? "" : JSON.stringify(r.error)})`);
  const exact = r0 * 2 * th * Lx;
  // the polyhedral mesh (180 sides) is a little under the true surface: the chords
  const poly = exact * Math.sin(Math.PI / 360) / (Math.PI / 360);
  near(r.mesh.area, poly, 2e-3, `cylinder: area of the patch r·2θ·L = ${exact.toFixed(4)} m² (on the mesh's facets ${poly.toFixed(4)})`);
  ok(r.mesh.area > 2.39 * Lx, "cylinder: the area of the surface, not of its projection (2·r·sinθ·L = 2.258)");
  // the border draped: every point ON the mesh (within the facets' sagitta), none on a chord
  const sag = r0 * (1 - Math.cos(Math.PI / 360));
  const dev = Math.max(...r.mesh.boundary[0].map((p) => Math.abs(Math.hypot(p[1], p[2]) - r0)));
  ok(dev <= sag + 1e-9, `cylinder: the border lies on the surface (max ${dev.toExponential(2)} m ≤ facet sagitta ${sag.toExponential(2)})`);
  const chordSag = r0 * (1 - Math.cos(th));
  ok(chordSag > 100 * dev, `cylinder: a stretched chord would stand ${chordSag.toFixed(3)} m off the surface`);
  ok(r.mesh.boundary[0].length > 60, `cylinder: the curved sides split at the mesh's step (${r.mesh.boundary[0].length} points)`);
  // offset along the normal: every vertex 2 mm outside the cylinder (± facet)
  let mx = 0;
  for (let i = 0; i < r.mesh.positions.length; i += 3) {
    const y = r.mesh.positions[i + 1] + r.mesh.origin[1], z = r.mesh.positions[i + 2] + r.mesh.origin[2];
    mx = Math.max(mx, Math.abs(Math.hypot(y, z) - r0 - 0.002));
  }
  ok(mx < sag + 1e-6, `cylinder: the offset along the surface's normal (${mx.toExponential(2)})`);
  ok(["A", "B"].includes(r.mesh.classification.scenario), `cylinder: EM Tools' scenario ${r.mesh.classification.scenario} (normals ${r.mesh.classification.normalVariation.toFixed(1)}°)`);
  meshChecks(r.mesh, "cylinder");
  // the draped preview path of a side across the curve: split and on the surface
  const path = S.drapePath([on(0.5, -th), on(0.5, th)], false, cyl, S.surfaceFrame(contour.map((w) => w.p), [nrm(-th), nrm(th)]));
  ok(path.length > 30, `drape: a side across the curve split at the mesh's step (${path.length} points)`);
  const pdev = Math.max(...path.map((p) => Math.abs(Math.hypot(p[1], p[2]) - r0)));
  ok(pdev <= sag + 1e-9, "drape: the preview path on the surface");
}

// ── 4 · refused: off the model, a hole, crossing, too few ───────────────────
{
  const off = S.cutSurface({ contour: [P(1.5, 0, 1.5), P(2.6, 0, 1.5), P(2.6, 0, 1.9), P(1.5, 0, 1.9)], normals: ups(4) }, plane());
  ok(!off.ok && off.error.code === "off_model", "a contour leaving the model: refused (off_model)");
  ok(!off.ok && JSON.stringify(off.error.at) === "[1,2]", "…the clicks off the mesh named (2nd, 3rd)");
  const holed = plane({ hole: [-0.2, 0.2, -0.2, 0.2] });
  const h = S.cutSurface({ contour: [P(-0.5, 0, -0.5), P(0.5, 0, -0.5), P(0.5, 0, 0.5), P(-0.5, 0, 0.5)], normals: ups(4) }, holed);
  ok(!h.ok && h.error.code === "off_model", "a contour around a hole of the mesh: refused");
  near(h.ok ? 0 : h.error.coverage, 0.84, 1e-9, "…its coverage said (84 %)");
  const x = S.cutSurface({ contour: [P(0, 0, 0), P(1, 0, 1), P(1, 0, 0), P(0, 0, 1)], normals: ups(4) }, plane());
  ok(!x.ok && x.error.code === "self_intersect", "a crossing contour: refused with its sides");
  const two = S.cutSurface({ contour: [P(0, 0, 0), P(1, 0, 0)], normals: ups(2) }, plane());
  ok(!two.ok && two.error.code === "too_few", "two points: too few");
  const same = S.cutSurface({ contour: [P(0, 0, 0), P(0.001, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 0.0005)], normals: ups(5) }, plane());
  ok(same.ok && same.mesh.warnings.some((w) => w.code === "merged" && w.n === 2), "coinciding clicks merged and said");
  const empty = S.cutSurface({ contour: [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1)], normals: ups(3) }, { positions: [] });
  ok(!empty.ok && empty.error.code === "no_mesh", "no triangle: no_mesh");
}

// ── 5 · two layers under the contour; a seam of two tiles ───────────────────
{
  const two = merge(plane({ h: 0 }), plane({ h: -1 }));
  const r = S.cutSurface({ contour: [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], normals: ups(4) }, two);
  ok(r.ok, "two layers: cut");
  near(r.mesh.area, 1, 1e-9, "two layers: only the layer the clicks are on (1 m², not 2)");
  const r2 = S.cutSurface({ contour: [P(0, -1, 0), P(1, -1, 0), P(1, -1, 1), P(0, -1, 1)], normals: ups(4) }, two);
  ok(r2.ok && r2.mesh.boundary[0].every((p) => Math.abs(p[1] + 1) < 1e-9), "two layers: clicks on the lower one cut the lower one");
  const back = merge(plane({ h: 0 }), plane({ h: 0.5, down: true }));
  const r3 = S.cutSurface({ contour: [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], normals: ups(4) }, back);
  near(r3.ok ? r3.mesh.area : 0, 1, 1e-9, "a surface turned away above the clicks is not cut");
  // two «tiles» with their own copies of the seam's vertices
  const tiles = merge(plane({ x0: -2, x1: 0.5 }), plane({ x0: 0.5, x1: 2 }));
  const r4 = S.cutSurface({ contour: [P(0, 0, 0), P(1.2, 0, 0), P(1.2, 0, 1), P(0, 0, 1)], normals: ups(4) }, tiles);
  near(r4.ok ? r4.mesh.area : 0, 1.2, 1e-9, "two tiles: the seam welded, the whole contour cut (1.2 m²)");
  ok(r4.ok && r4.mesh.boundary.length === 1, "two tiles: one border");
}

// ── 5b · slits: triangles turned away inside the contour (a stone's underside) joined; a wall's back never ──
{
  // a plane whose cells in [0.3, 0.5]² are wound the other way (turned away, on the same surface)
  const pl = plane();
  const P2 = pl.positions;
  for (let t = 0; t < P2.length / 9; t++) {
    const cx = (P2[t * 9] + P2[t * 9 + 3] + P2[t * 9 + 6]) / 3, cz = (P2[t * 9 + 2] + P2[t * 9 + 5] + P2[t * 9 + 8]) / 3;
    if (cx > 0.3 && cx < 0.5 && cz > 0.3 && cz < 0.5) for (let k = 0; k < 3; k++) { const a = P2[t * 9 + 3 + k]; P2[t * 9 + 3 + k] = P2[t * 9 + 6 + k]; P2[t * 9 + 6 + k] = a; }
  }
  const sq = [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)];
  const r = S.cutSurface({ contour: sq, normals: ups(4) }, pl);
  ok(r.ok && r.mesh.stats.turned === 8, `slits: the 8 triangles turned away joined (${r.ok && r.mesh.stats.turned})`);
  near(r.ok ? r.mesh.area : 0, 1, 1e-9, "slits: the areal whole (1 m²)");
  ok(r.ok && r.mesh.stats.loops === 1, "slits: one border, no hole");
  near(r.ok ? r.mesh.perimeter : 0, 4, 1e-9, "slits: the border is the contour's (4 m)");
  const r0 = S.cutSurface({ contour: sq, normals: ups(4) }, pl, { slits: false });
  ok(!r0.ok && r0.error.code === "off_model" && Math.abs(r0.error.coverage - 0.96) < 1e-9, "…without joining them: a hole (96 % covered), refused");
  // a smaller turned patch (0.1 m², 2 triangles of 0.005): kept as a hole without joining, the perimeter the OUTER border
  const pl2 = plane();
  const Q = pl2.positions;
  for (let t = 0; t < Q.length / 9; t++) {
    const cx = (Q[t * 9] + Q[t * 9 + 3] + Q[t * 9 + 6]) / 3, cz = (Q[t * 9 + 2] + Q[t * 9 + 5] + Q[t * 9 + 8]) / 3;
    if (cx > 0.4 && cx < 0.5 && cz > 0.4 && cz < 0.5) for (let k = 0; k < 3; k++) { const a = Q[t * 9 + 3 + k]; Q[t * 9 + 3 + k] = Q[t * 9 + 6 + k]; Q[t * 9 + 6 + k] = a; }
  }
  const r1 = S.cutSurface({ contour: sq, normals: ups(4) }, pl2, { slits: false });
  ok(r1.ok && r1.mesh.stats.loops === 2 && Math.abs(r1.mesh.area - 0.99) < 1e-9, "…a small one not joined: a hole of 0.01 m², two borders");
  near(r1.ok ? r1.mesh.perimeter : 0, 4, 1e-9, "…the perimeter is the OUTER border's");
  // a slab 60 cm thick: top up, sides, bottom down — the contour on the top covers the bottom in plan
  const slab = merge(plane({ x0: -1, x1: 1, z0: -1, z1: 1, h: 0 }), plane({ x0: -1, x1: 1, z0: -1, z1: 1, h: -0.6, down: true }));
  const side = [];
  for (let i = 0; i < 20; i++) { const za = -1 + i * 0.1, zb = za + 0.1;   // the side x = 1, facing +x, joining the two faces
    side.push(1, 0, za, 1, -0.6, za, 1, -0.6, zb, 1, 0, za, 1, -0.6, zb, 1, 0, zb); }
  const r2 = S.cutSurface({ contour: [P(-0.9, 0, -0.9), P(0.999, 0, -0.9), P(0.999, 0, 0.9), P(-0.9, 0, 0.9)], normals: ups(4) }, merge(slab, { positions: side }));
  near(r2.ok ? r2.mesh.area : 0, 1.899 * 1.8, 1e-9, "a slab: only its top (its side and its back face, 60 cm behind, never joined)");
}

// ── 6 · the offset stacked (EM Tools: × overlaps + 1, at most × 5) ──────────
{
  const sq = [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)];
  const r2 = S.cutSurface({ contour: sq, normals: ups(4), stack: 2 }, plane());
  near(r2.mesh.offset, 0.006, 1e-12, "two areals already there: 3 × 2 mm");
  const r9 = S.cutSurface({ contour: sq, normals: ups(4), stack: 9 }, plane());
  near(r9.mesh.offset, 0.01, 1e-12, "nine already there: at most × 5");
  const r0 = S.cutSurface({ contour: sq, normals: ups(4), offset: 0 }, plane());
  near(r0.mesh.offset, 0, 0, "offset 0: on the RM");
  const big = S.cutSurface({ contour: sq, normals: ups(4), offset: 0.5 }, plane());
  near(big.mesh.offset, S.SURF_TOL.offsetMax, 0, "offset capped at 1 cm");
}

// ── 7 · EM Tools' classifier ────────────────────────────────────────────────
{
  const a = S.classifySurface([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], ups(4));
  ok(a.scenario === "A" && a.planarity < 1e-12, "classifier: a flat square is A");
  const b = S.classifySurface([[0, 0, 0], [1, 0, 0], [1, 0.2, 1], [0, 0.2, 1]], [[0, 1, 0], [0, 1, 0], [0, 0.6, 0.8], [0, 0.6, 0.8]]);
  ok(b.scenario === "B" && b.strategy === "SHRINKWRAP", `classifier: a bent strip is B (${b.normalVariation.toFixed(1)}°)`);
  const c = S.classifySurface([[0, 0, 0], [1, 0, 0], [1, 1, 1], [0, 1, 1], [0.5, 2, 0]], [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]]);
  ok(c.scenario === "C" && c.strategy === "BOOLEAN", "classifier: normals opposed is C");
}

// ── 8 · edits, inputs read back, signature, models, the mesh packed ─────────
{
  const inp = { contour: [P(0, 0, 0, { note: "angolo" }), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], normals: ups(4), offset: 0.002 };
  const e1 = S.editSurface(inp, { op: "set", k: 0, to: P(-0.1, 0, 0) });
  ok(e1.ok && e1.input.contour[0].p[0] === -0.1 && e1.input.contour[0].note === "angolo", "edit: a point moved keeps its note");
  const e2 = S.editSurface(inp, { op: "insert", after: 1, at: P(1.2, 0, 0.5), normal: UP });
  ok(e2.ok && e2.input.contour.length === 5 && e2.input.contour[2].p[0] === 1.2 && e2.input.normals.length === 5, "edit: a point inserted after the 2nd");
  const e3 = S.editSurface(e2.input, { op: "remove", k: 2 });
  ok(e3.ok && e3.input.contour.length === 4, "edit: a point taken away");
  const e4 = S.editSurface(inp, { op: "remove", k: 0 });
  const e5 = S.editSurface(e4.input, { op: "remove", k: 0 });
  ok(e4.ok && !e5.ok && e5.why === "too_few", "edit: three points stay");
  ok(!S.editSurface(inp, { op: "set", k: 9, to: P(0, 0, 0) }).ok, "edit: out of range refused");
  // a point inserted on a side across the cylinder's curve: lifted onto the surface
  {
    const cyl = halfCylinder({ r: 2 });
    const fr = S.surfaceFrame([[0, 2 * Math.cos(-0.6), 2 * Math.sin(-0.6)], [1, 2 * Math.cos(-0.6), 2 * Math.sin(-0.6)], [1, 2 * Math.cos(0.6), 2 * Math.sin(0.6)], [0, 2 * Math.cos(0.6), 2 * Math.sin(0.6)]], [[0, 0.8, -0.6], [0, 0.8, 0.6]]);
    const mid = [0.5, 2 * Math.cos(0.6), 0];            // the chord's midpoint, 0.35 m inside the curve
    const up2 = S.surfaceLift(mid, cyl, fr);
    ok(up2 && Math.abs(Math.hypot(up2[1], up2[2]) - 2) < 1e-3 && Math.abs(up2[0] - 0.5) < 1e-9, "a point inserted on a side: lifted onto the surface under it");
    ok(S.surfaceLift([9, 0, 0], cyl, fr) === null, "…none under it: null");
  }
  ok(S.surfaceSides(inp.contour).length === 4 && S.surfaceSides(inp.contour)[3].p[2] === 0.5, "the sides' midpoints (the «+» handles)");
  const back = S.readSurfaceInput(JSON.parse(JSON.stringify(inp)));
  ok(back && back.contour.length === 4 && back.contour[0].note === "angolo" && back.offset === 0.002 && back.normals.length === 4, "inputs read back");
  ok(S.readSurfaceInput({ contour: [{ p: [0, 0] }] }) === null && S.readSurfaceInput(null) === null, "not an areal: null");
  ok(S.surfaceSig(inp) !== S.surfaceSig(e1.input) && S.surfaceSig(inp) === S.surfaceSig(JSON.parse(JSON.stringify(inp))), "signature");
  ok(JSON.stringify(S.surfaceModels([P(0, 0, 0), P(1, 0, 0, { rm: "rm2" }), P(1, 0, 1)])) === '["rm1","rm2"]', "the models under the contour (two: refused by the tool)");
  const r = S.cutSurface(inp, plane());
  const pk = S.packMesh(r.mesh.positions, r.mesh.indices);
  const up = S.unpackMesh(JSON.parse(JSON.stringify(pk)));
  ok(up && up.indices.length === r.mesh.indices.length && up.indices.every((v, i) => v === r.mesh.indices[i]), "the mesh packed and read back: triangles");
  ok(up && up.positions.every((v, i) => Math.abs(v - r.mesh.positions[i]) < 1e-6), "…vertices (float32, local)");
  ok(pk.nt === r.mesh.stats.triangles && pk.nv === r.mesh.stats.vertices, "…its counts");
  ok(S.unpackMesh({ p: "AAAA", i: "AAAA" }) === null, "a broken packed mesh: null");
}

// ── 9 · a heavy RM: time ────────────────────────────────────────────────────
{
  const big = plane({ s: 0.01 });                   // 400 × 400 × 2 = 320 000 triangles
  const t0 = performance.now();
  const r = S.cutSurface({ contour: [P(-0.5, 0, -0.5), P(0.5, 0, -0.5), P(0.7, 0, 0.3), P(0, 0, 0.6), P(-0.6, 0, 0.2)], normals: ups(5) }, big);
  const ms = performance.now() - t0;
  ok(r.ok, "320 000 triangles: cut");
  ok(ms < 4000, `320 000 triangles: ${ms.toFixed(0)} ms, ${r.mesh.stats.triangles} triangles in the areal`);
  console.log(`  · heavy RM: ${r.mesh.stats.source} triangles given, ${r.mesh.stats.candidates} under the contour, areal ${r.mesh.stats.triangles} triangles (${r.mesh.stats.whole} whole, ${r.mesh.stats.clipped} clipped), ${ms.toFixed(0)} ms`);
}

console.log(`check-surface-annotation: ${n} checks passed`);
