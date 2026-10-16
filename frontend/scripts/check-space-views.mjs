// MICRO-SPAZIO-3D-2 · p.2, p.3, p.4, p.5 · the Space's second pass, pure
// (`src/space-nav.ts`, `src/transform3d.ts`), held to three.js itself where
// three decides (the screen of a lookAt, the quaternion of an Euler):
//
//   node scripts/check-space-views.mjs
//
// · Shift+C: the median of the boxes, the 5–95 percentile frame, the origin
//   never in it, a far object not widening it, an empty scene → null;
// · the six views of the keypad: on the screen of three's lookAt (Y-up), the
//   axes Blender shows — Front: X right, Z up; Right: −Y right… Top: X right,
//   Y up; Ctrl the opposite; 5, 0, «.»; the emulation of the top row;
// · the orthographic zoom: the point under the cursor stays, the scale
//   changes and the camera's depth does not; the pivot goes to the point;
// · the drags as Blender's (middle orbit, Shift pan, Ctrl zoom, Alt with the
//   emulation, the left that orbits until it selects);
// · the transform: Blender's frame → three's as the glTF exporter does
//   (position, quaternion, scale), Euler XYZ extrinsic, to three's Matrix4 and
//   back; EM Tools' strings read; identity; the decimals at 500 m.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import * as THREE from "three";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as N from "./space-nav"; export * as X from "./transform3d";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { N, X } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const near = (a, b, eps, what) => { assert.ok(Math.abs(a - b) <= eps, `${what} — ${a} vs ${b}`); checks++; };
const nearV = (a, b, eps, what) => { for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= eps, `${what} [${i}] — ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); checks++; };

// ── Shift+C ──────────────────────────────────────────────────────────────────
{
  // a georeferenced temple: twenty boxes around (−18, 493, 12) in three's axes
  // (Templu Mare's podium; the origin is 494 m below), and one far away
  const boxes = [];
  for (let i = 0; i < 20; i++) {
    const cx = -25 + i * 0.7, cz = 5 + (i % 5) * 3;
    boxes.push([cx - 1, 491, cz - 1, cx + 1, 495 + (i % 3), cz + 1]);
  }
  const far = [480, 491, 900, 482, 493, 902];
  const c = N.sceneCentre([...boxes, far]);
  ok(c, "a scene: a centre");
  near(c.cursor[1], 493.5, 1, "the cursor at the median height of the temple (493 m), not at the origin (0)");
  ok(Math.hypot(...c.cursor) > 400, "the world's origin never enters");
  ok(c.frame[3] < 100 && c.frame[5] < 100, "the far object does not widen the frame (5–95 percentile)");
  ok(c.frame[0] <= c.cursor[0] && c.cursor[0] <= c.frame[3], "the cursor is inside the frame");
  const alone = N.sceneCentre([[1, 2, 3, 3, 4, 5]]);
  eq(alone.cursor, [2, 3, 4], "one object: its centre");
  eq(alone.frame, [1, 2, 3, 3, 4, 5], "…and its box");
  eq(N.sceneCentre([]), null, "an empty scene: null (the cursor stays, a notice says why)");
  eq(N.sceneCentre([[NaN, 0, 0, 1, 1, 1]]), null, "an unreadable box is not a geometry");
}

// ── the six views, on three's screen ─────────────────────────────────────────
{
  const target = [-18, 493, 12];
  const cam0 = { pos: [10, 520, 60], target };
  // the screen axes of a camera after three's lookAt (Y-up), as world vectors
  const screen = (c) => {
    const cam = new THREE.PerspectiveCamera(40, 1.5, 0.01, 2000);
    cam.position.set(...c.pos);
    cam.lookAt(new THREE.Vector3(...c.target));
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).toArray();
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).toArray();
    return { right: N.threeToBlender(right), up: N.threeToBlender(up) };
  };
  // Blender's screens: [right, up] in Blender's axes
  const want = {
    front: [[1, 0, 0], [0, 0, 1]], back: [[-1, 0, 0], [0, 0, 1]],
    right: [[0, 1, 0], [0, 0, 1]], left: [[0, -1, 0], [0, 0, 1]],
    top: [[1, 0, 0], [0, 1, 0]], bottom: [[1, 0, 0], [0, -1, 0]],
  };
  for (const v of Object.keys(want)) {
    const c = N.alignedView(cam0, v);
    near(Math.hypot(...c.pos.map((p, i) => p - target[i])), Math.hypot(...cam0.pos.map((p, i) => p - target[i])), 1e-9, `${v}: the same distance from the pivot`);
    eq(c.target, target, `${v}: the same pivot`);
    const s = screen(c);
    nearV(s.right, want[v][0], 1e-3, `${v}: Blender's right on the screen`);
    nearV(s.up, want[v][1], 1e-3, `${v}: Blender's up on the screen`);
    eq(N.viewOf(c), v, `${v}: recognised`);
  }
  eq(N.viewOf(cam0), null, "a free camera is in no aligned view");
  // the keypad
  const k = (code, o = {}) => N.keypadAction({ code, key: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o }, o.emulate ?? false);
  eq(k("Numpad1"), { view: "front" }, "1 front");
  eq(k("Numpad3"), { view: "right" }, "3 right");
  eq(k("Numpad7"), { view: "top" }, "7 top");
  eq(k("Numpad1", { ctrlKey: true }), { view: "back" }, "Ctrl 1 back");
  eq(k("Numpad3", { ctrlKey: true }), { view: "left" }, "Ctrl 3 left");
  eq(k("Numpad7", { ctrlKey: true }), { view: "bottom" }, "Ctrl 7 bottom");
  eq(k("Numpad5"), "toggle-ortho", "5 perspective ⇄ orthographic");
  eq(k("Numpad0"), "camera", "0 the camera");
  eq(k("NumpadDecimal"), "frame-selection", "«.» frames the selection (the Italian keypad's «,» too: by code)");
  eq(k("Digit1"), null, "the top row is not the keypad…");
  eq(k("Digit1", { emulate: true }), { view: "front" }, "…unless emulated");
  eq(k("Digit7", { emulate: true, ctrlKey: true }), { view: "bottom" }, "…Ctrl too");
  eq(k("Numpad1", { metaKey: true }), null, "⌘ + keypad is not a view (the system's)");
  eq(k("Numpad2"), null, "2 4 6 8 (Blender's turns) are not taken");
  // the modal takes its digits first: G 1 is «one metre», not the front view
  let st = N.startModal("grab");
  for (const key of ["z", "1"]) st = N.modalKey(st, key);
  eq(N.modalLabel(st), "G Z 1", "a modal G / R / S types its numbers (the scene asks the modal before the keypad)");
}

// ── the orthographic ─────────────────────────────────────────────────────────
{
  const cam = { pos: [0, 0, 100], target: [0, 0, 0] };            // looking down −z (front)
  const half = N.orthoHalf(cam, 40);
  near(half, 100 * Math.tan((20 * Math.PI) / 180), 1e-12, "the orthographic's half-height is the perspective's at the pivot");
  const P = [10, 5, -3];                                          // a point off the axis, behind the pivot
  const scr = (c) => {                                             // P on an orthographic screen of c
    const dir = N.norm(N.sub(c.target, c.pos));
    const h = N.orthoHalf(c, 40);
    const rel = N.sub(P, c.target);
    const lat = N.sub(rel, N.mul(dir, N.dot(rel, dir)));
    return [lat[0] / h, lat[1] / h];
  };
  const before = scr(cam);
  const z = N.orthoZoom(cam, P, 0.5);
  nearV(scr(z), before, 1e-12, "the point under the cursor stays under it");
  near(N.orthoHalf(z, 40), half * 0.5, 1e-9, "the scale is halved");
  near(N.dot(N.sub(z.target, P), [0, 0, -1]), 0, 1e-12, "the pivot at the point's depth (Auto Depth)");
  let c = cam;
  for (let i = 0; i < 60; i++) c = N.orthoZoom(c, P, 0.85);
  ok(N.orthoHalf(c, 40) < 0.01, "sixty notches: under a centimetre of half-height, no wall");
  nearV(scr(c), before, 1e-9, "…and still the same point under the cursor");
  const b = N.orthoBoxZoom(cam, [-0.5, -0.5, 0.5, 0.5], [1, 1, 0]);
  near(N.orthoHalf(b, 40), half * 0.5, 1e-9, "Shift+B in orthographic: half the view → half the scale");
}

// ── the drags ────────────────────────────────────────────────────────────────
{
  const p = (button, o = {}) => ({ button, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });
  const plain = { emulate3: false, leftSelects: false };
  const blender = { emulate3: false, leftSelects: true };
  const emu = { emulate3: true, leftSelects: true };
  eq(N.dragIntent(p(1), plain), "orbit", "middle: orbit");
  eq(N.dragIntent(p(1, { shiftKey: true }), plain), "pan", "Shift + middle: pan");
  eq(N.dragIntent(p(1, { ctrlKey: true }), plain), "zoom", "Ctrl + middle: zoom (Mac too)");
  eq(N.dragIntent(p(0), plain), "orbit", "left, while it does not select: orbit, as before");
  eq(N.dragIntent(p(0, { shiftKey: true }), plain), "pan", "…Shift + left: pan");
  eq(N.dragIntent(p(0), blender), "box-select", "left, once it selects: the box, as Blender");
  eq(N.dragIntent(p(0, { altKey: true }), emu), "orbit", "Alt + left with the emulation: the middle's orbit");
  eq(N.dragIntent(p(0, { altKey: true, shiftKey: true }), emu), "pan", "…Shift: the middle's pan");
  eq(N.dragIntent(p(0, { altKey: true, ctrlKey: true }), emu), "zoom", "…Ctrl: the middle's zoom");
  eq(N.dragIntent(p(2), blender), null, "the right button is the menu's, never a drag");
  eq(N.leftSelects("auto", false, false), false, "automatic: the left orbits on a device with no middle button seen");
  eq(N.leftSelects("auto", false, true), true, "…selects once a middle button was seen");
  eq(N.leftSelects("auto", true, false), true, "…or with the emulation");
  eq(N.leftSelects("orbit", true, true), false, "«Orbita» chosen: always orbits");
  eq(N.leftSelects("select", false, false), true, "«Selezione» chosen: always selects");
  ok(N.dragZoomFactor(-50) < 1 && N.dragZoomFactor(50) > 1, "Ctrl + middle up comes nearer, down goes away");
}

// ── the transform ────────────────────────────────────────────────────────────
{
  const C = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);  // Blender → three (x, z, −y)
  const blenderMatrix = (xf) => {
    // Blender's Euler XYZ: R = Rz·Ry·Rx
    const R = new THREE.Matrix4().makeRotationZ(xf.rotation[2])
      .multiply(new THREE.Matrix4().makeRotationY(xf.rotation[1]))
      .multiply(new THREE.Matrix4().makeRotationX(xf.rotation[0]));
    const S = new THREE.Matrix4().makeScale(...xf.scale);
    const T = new THREE.Matrix4().makeTranslation(...xf.position);
    return T.multiply(R).multiply(S);
  };
  const threeMatrix = (pose) => {
    const o = new THREE.Object3D();
    o.position.set(...pose.position);
    o.rotation.set(...pose.rotation);                               // three's Euler XYZ
    o.scale.set(...pose.scale);
    o.updateMatrix();
    return o.matrix;
  };
  const samples = [
    { position: [-13.684, -14.123, 495.227], rotation: [0, 0, (12.14 * Math.PI) / 180], scale: [1, 1, 1], up_axis: "Z" },
    { position: [1, 2, 3], rotation: [0.3, -0.7, 1.1], scale: [1, 1, 1], up_axis: "Z" },
    { position: [0, 0, 0], rotation: [Math.PI / 2, 0, 0], scale: [2, 2, 2], up_axis: "Z" },
  ];
  for (const xf of samples) {
    const pose = X.xfToPose(xf);
    // the object's world matrix in three = C · M_blender · C⁻¹ (uniform scale; the
    // exporter's own rule for the local frame of a converted node)
    const want = C.clone().multiply(blenderMatrix(xf)).multiply(C.clone().invert());
    const got = threeMatrix(pose);
    nearV(got.elements, want.elements, 1e-9, `the pose of ${JSON.stringify(xf.rotation)} is Blender's matrix in three's axes`);
    const back = X.poseToXf(pose);
    nearV(back.position, xf.position, 1e-9, "…and back: the position");
    nearV(X.xfQuaternion(back), X.xfQuaternion(xf), 1e-9, "…the rotation (as a quaternion)");
    nearV(back.scale, xf.scale, 1e-12, "…the scale");
  }
  // the 12.14° about Blender's Z of EM Tools' SU001 is the glb's quaternion about Y
  const q = X.xfQuaternion(samples[0]);
  nearV([q[0], q[3]], [0.99439, 0.10574], 2e-5, "12.14° about Blender's Z: the quaternion EM Tools' glb carries about glTF's Y");
  const nonUniform = X.xfToPose({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 2, 3], up_axis: "Z" });
  eq(nonUniform.scale, [1, 3, 2], "the scale (x, y, z) → (x, z, y), as the exporter");
  // EM Tools' strings
  const em = X.readTransform({ transform: { position: ["0.0", "0.0", "0.0"], rotation: ["0.0", "0.0", "0.0"], scale: ["1.0", "1.0", "1.0"] } });
  eq(em, { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], up_axis: "Z" }, "EM Tools' transform (strings, no axis): read, Z up");
  ok(X.isIdentity(em), "…the identity of the 99 models of Templu Mare");
  eq(X.readTransform({}), null, "no transform: null (identity for the scene)");
  eq(X.readTransform({ transform: { position: ["a", "b", "c"] } }), null, "an unreadable one: null");
  const written = X.transformData({ position: [1.5, 0, -2], rotation: [0, 0, 0.25], scale: [1, 1, 1], up_axis: "Z" });
  eq(written, { position: ["1.5", "0", "-2"], rotation: ["0", "0", "0.25"], scale: ["1", "1", "1"], up_axis: "Z" }, "written in EM Tools' shape (strings, radians), the axis declared");
  eq(X.readTransform({ transform: written }).position, [1.5, 0, -2], "…and read back");
  // the decimals: float32 at 500 m
  const step = 500 * 2 ** -23;
  ok(step < 1e-4 && step > 1e-5, `a float32 at 500 m steps ${step.toExponential(2)} m: four decimals (0.1 mm) mean something, five do not`);
  eq(X.coordDecimals(495.227), 4, "…so a coordinate of the temple is shown with four");
  eq(X.coordDecimals(327300), 3, "…and a georeferenced easting with three (float32 there steps 4 cm: the file holds less)");
}

console.log(`check-space-views: ${checks} checks passed`);
