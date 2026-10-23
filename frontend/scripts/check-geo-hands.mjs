// MICRO-GLOBO-INTERAZIONE p.2 · the globe's hands as Google Earth's, pure
// (`src/geo-hands.ts`): the camera as a pose (lon, lat, height, heading, pitch)
// on WGS84, and the three gestures on it —
//   1. the pose's axes are orthonormal and read back; straight down keeps its heading;
//   2. GRAB: the point under the cursor stays under the cursor (to 1e-6 of the
//      screen), from the whole globe to the site, tilted or not, in perspective
//      and orthographic; the heading does not change (north stays up);
//   3. ZOOM: toward the point under the cursor, which stays there; the distance
//      scales; the heading and the pitch do not change;
//   4. TURN and TILT around the point: it stays where it was on the screen; the
//      heading moves by the turn; the pitch is kept between straight down and
//      short of the horizon; the compass's «north up» is a turn of −heading.
//
//   node scripts/check-geo-hands.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./geo-hands"; export { geodeticToEcef, ecefToGeodetic } from "./geoglobe";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} — got ${a}, want ${b} ± ${tol}`); checks++; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(...a);

const GT = { lon: 22.789207886221057, lat: 45.51388980543227 };
const persp = { width: 1600, height: 1000, fov: 40, ortho: false };
const ortho = { ...persp, ortho: true };
const poses = [
  { name: "the whole globe", lon: GT.lon, lat: GT.lat, h: 14_000_000, heading: 0, pitch: -90 },
  { name: "a region, tilted", lon: GT.lon - 0.3, lat: GT.lat - 0.4, h: 50_000, heading: 0, pitch: -55 },
  { name: "the site, from above", lon: GT.lon, lat: GT.lat, h: 2500, heading: 0, pitch: -90 },
  { name: "the site, tilted and turned", lon: GT.lon + 0.01, lat: GT.lat - 0.02, h: 1800, heading: 30, pitch: -35 },
];

// 1 · the pose
for (const p of poses) {
  const b = M.poseBasis(p);
  near(len(b.fwd), 1, 1e-12, `${p.name}: forward is a unit vector`);
  near(dot(b.fwd, b.right), 0, 1e-12, `${p.name}: forward ⟂ right`);
  near(dot(b.fwd, b.up), 0, 1e-12, `${p.name}: forward ⟂ up`);
  const q = M.poseFromCameraUp(b.pos, b.fwd, b.up);
  near(q.lon, p.lon, 1e-9, `${p.name}: lon read back`);
  near(q.lat, p.lat, 1e-9, `${p.name}: lat read back`);
  near(q.h, p.h, 1e-4, `${p.name}: height read back`);
  near(q.pitch, p.pitch, 1e-7, `${p.name}: pitch read back`);
  near(q.heading, p.heading, 1e-6, `${p.name}: heading read back (straight down: from the up vector)`);
}

const under = (p, v, sx, sy, h0, half) => { const r = M.rayAt(p, v, sx, sy, half); return M.hitEllipsoid(r.o, r.d, h0); };

// 2 · grab
for (const v of [persp, ortho]) for (const p of poses) {
  if (v.ortho && p.pitch !== -90) continue;
  const h0 = p.h > 100000 ? 0 : 495;
  const half = v.ortho ? M.orthoHalfOf(p, v, h0) : 0;
  const P0 = under(p, v, 0.3, 0.2, h0, half);
  ok(!!P0, `${p.name} (${v.ortho ? "ortho" : "persp"}): the cursor is on the Earth`);
  for (const [sx, sy] of [[-0.2, -0.1], [0.35, 0.25], [0.0, 0.6]]) {
    const q = M.grab(p, v, P0, h0, sx, sy, v.ortho ? half : undefined);
    ok(!!q, `${p.name}: grabbed to (${sx}, ${sy})`);
    const s = M.project(q, v, P0, half);
    near(s[0], sx, 1e-6, `${p.name} (${v.ortho ? "ortho" : "persp"}): the grabbed point stays under the cursor (x)`);
    near(s[1], sy, 1e-6, `${p.name} (${v.ortho ? "ortho" : "persp"}): the grabbed point stays under the cursor (y)`);
    near(q.heading, p.heading, 1e-12, `${p.name}: a grab does not turn (north stays up)`);
    near(q.pitch, p.pitch, 1e-12, `${p.name}: a grab does not tilt`);
    near(q.h, p.h, 1e-9, `${p.name}: a grab keeps the height`);
  }
}
{
  // a long drag at the globe: 1000 km east and north, north still up
  const p = poses[0];
  const P0 = under(p, persp, 0, 0, 0);
  const q = M.grab(p, persp, P0, 0, 0.25, -0.2);
  const g = M.ecefToGeodetic(M.poseBasis(q).pos);
  ok(Math.abs(g.lon - p.lon) > 5, "a drag across the globe moves the camera far (the Earth turned under it)");
  near(q.heading, 0, 1e-12, "…and north is still up");
  ok(M.grab(p, persp, P0, 0, 3, 3) === null, "a cursor off the Earth: no move (null), never a jump");
}

// 3 · zoom
for (const v of [persp, ortho]) for (const p of poses) {
  if (v.ortho && p.pitch !== -90) continue;
  const h0 = p.h > 100000 ? 0 : 495;
  const half = v.ortho ? M.orthoHalfOf(p, v, h0) : 0;
  const P = under(p, v, -0.4, 0.3, h0, half);
  const before = len(M.poseBasis(p).pos.map((x, i) => x - P[i]));
  for (const f of [0.5, 0.8, 1.6]) {
    const q = M.zoomAt(p, v, P, h0, -0.4, 0.3, f);
    ok(!!q, `${p.name}: zoom ×${f}`);
    const qh = v.ortho ? M.orthoHalfOf(q, v, h0) : 0;
    const s = M.project(q, v, P, qh);
    // zooming out from the whole globe the point may leave the disc: it drifts, the zoom happens
    if (p.h > 100000 && f > 1) { near(q.heading, p.heading, 1e-12, `${p.name} ×${f}: north stays up`); ok(q.h > p.h, `${p.name} ×${f}: out`); continue; }
    near(s[0], -0.4, 1e-6, `${p.name} (${v.ortho ? "ortho" : "persp"}) ×${f}: the point under the cursor stays (x)`);
    near(s[1], 0.3, 1e-6, `${p.name} (${v.ortho ? "ortho" : "persp"}) ×${f}: …(y)`);
    near(q.heading, p.heading, 1e-12, `${p.name} ×${f}: a zoom does not turn (north stays up)`);
    near(q.pitch, p.pitch, 1e-12, `${p.name} ×${f}: a zoom does not tilt`);
    if (v.ortho) near(qh / half, f, 1e-3, `${p.name} ×${f}: the orthographic's scale changes by the factor`);
    else if (p.h < 100000) near(len(M.poseBasis(q).pos.map((x, i) => x - P[i])) / before, f, 0.01, `${p.name} ×${f}: the distance to the point scales by the factor (to 1 %: the grab after it follows the Earth's curve)`);
    // from the whole globe the grab that keeps the point under the cursor moves the camera round the Earth too
    else ok((len(M.poseBasis(q).pos.map((x, i) => x - P[i])) / before - 1) * (f - 1) > 0, `${p.name} ×${f}: the camera goes the zoom's way`);
  }
}

// 4 · turn and tilt around the point
for (const p of poses.slice(1)) {
  const h0 = 495;
  const P = under(p, persp, 0.2, -0.15, h0);
  const s0 = M.project(p, persp, P);
  const q = M.orbitAround(p, P, 25, 10);
  const s = M.project(q, persp, P);
  // to 1e-5 of the screen (0.01 px): the roll the turn makes on a curved Earth is dropped
  near(s[0], s0[0], 1e-5, `${p.name}: the point turned around stays on the screen (x)`);
  near(s[1], s0[1], 1e-5, `${p.name}: …(y)`);
  near(((q.heading - p.heading - 25 + 540) % 360) - 180, 0, 0.2, `${p.name}: the heading moves by the turn (25°; the meridians converge a little)`);
  ok(q.pitch <= M.PITCH_MAX + 1e-9 && q.pitch >= M.PITCH_MIN - 1e-9, `${p.name}: the pitch stays between straight down and short of the horizon`);
  const north = M.orbitAround(q, P, -q.heading, 0);
  near(north.heading, 0, 0.2, `${p.name}: the compass (a turn of −heading) puts north back up`);
  const level = M.orbitAround(q, P, -q.heading, M.PITCH_MIN - q.pitch);
  near(level.pitch, -90, 1e-6, `${p.name}: the compass's double click: straight down`);
}
near(M.orbitAround(poses[1], under(poses[1], persp, 0, 0, 495), 0, 80).pitch, M.PITCH_MAX, 1e-9, "a tilt past the horizon stops short of it");

console.log(`geo-hands: ${checks} checks passed`);
