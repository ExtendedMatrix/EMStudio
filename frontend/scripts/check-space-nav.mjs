// MICRO-SPAZIO-3D p.2 · the Space's navigation, as Blender does it — pure
// (`src/space-nav.ts`, `src/wheel-kind.ts`), exercised in node with simulated
// events:
//
//   node scripts/check-space-nav.mjs
//
// · the zoom toward the cursor keeps the point under it and never stops: from
//   100 m to under 5 cm from a surface point in a known number of notches, the
//   orbit centre moving with it; the old OrbitControls dolly (×0.95 toward a
//   fixed target) is simulated beside it and stops at the target;
// · Shift+B, the double click, the frame of a sphere;
// · the table of the clicks, for a Mac and for Windows/Linux;
// · the keys with the 3D in focus;
// · the modal G / R / S with an axis and a number, Enter and Esc;
// · a shape laid on a surface: its up turned onto the normal;
// · the graph's trackpad rule (G5), the same for the Space.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as N from "./space-nav"; export * as W from "./wheel-kind";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { N, W } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const near = (a, b, eps, what) => { assert.ok(Math.abs(a - b) <= eps, `${what} — ${a} vs ${b}`); checks++; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ── the zoom toward the cursor ───────────────────────────────────────────────
{
  // Templu Mare's first frame (measured: camera and target of the Space), a
  // point of the podium under the cursor, off the view's axis
  let cam = { pos: [30.724, 532.918, 88.34], target: [-13.708, 498.36, 14.288] };
  const P = [-18.7836, 493.4562, 12.0254];
  const f = N.wheelFactor(-100, 0, false);
  near(f, Math.exp(-0.16), 1e-12, "a mouse notch (deltaY −100) is ×0.852, the graph's factor");
  ok(N.wheelFactor(100, 0, false) > 1, "the other way, away");
  ok(N.wheelFactor(-10, 0, true) < N.wheelFactor(-10, 0, false), "a pinch is stronger per unit than the wheel");
  const dir0 = N.norm(N.sub(cam.target, cam.pos));
  let steps = 0;
  const d0 = dist(cam.pos, P);
  while (dist(cam.pos, P) >= 0.05 && steps < 500) {
    cam = N.zoomTowards(cam, P, f);
    steps++;
    // the point stays on the line from the camera along… the same ray: the view does not turn
    const dir = N.norm(N.sub(cam.target, cam.pos));
    if (steps === 1) near(N.dot(dir, dir0), 1, 1e-9, "the view does not turn while zooming");
  }
  ok(steps < 80, `from ${d0.toFixed(1)} m to under 5 cm from the podium in ${steps} notches`);
  eq(steps, Math.ceil(Math.log(0.05 / d0) / Math.log(f)), "the distance falls by the factor at every notch (geometric: no wall)");
  // the pivot is at the point's depth, so the orbit turns around the detail
  const pivot = dist(cam.pos, cam.target);
  near(pivot, N.dot(N.sub(P, cam.pos), N.norm(N.sub(cam.target, cam.pos))), 1e-9, "the orbit centre at the depth of the point (Auto Depth)");
  // …and it keeps going
  const c2 = N.zoomTowards(cam, P, f);
  ok(dist(c2.pos, P) < dist(cam.pos, P), "a further notch goes nearer still");
  // the old dolly: OrbitControls divides the distance to a FIXED target by 0.95
  let old = { pos: [30.724, 532.918, 88.34], target: [-13.708, 498.36, 14.288] };
  for (let i = 0; i < 300; i++) {
    const off = N.sub(old.pos, old.target);
    old = { pos: N.add(old.target, N.mul(off, 0.95)), target: old.target };
  }
  ok(dist(old.pos, P) > 7, `the old dolly, 300 notches: still ${dist(old.pos, P).toFixed(2)} m from the podium (it stops at the target)`);
  // with nothing under the cursor (the point at the pivot's depth) the pivot is pushed ahead, never behind
  let c3 = { pos: [0, 0, 10], target: [0, 0, 0] };
  for (let i = 0; i < 200; i++) c3 = N.zoomTowards(c3, [0, 0, 0], 0.5);
  ok(N.dot(N.sub(c3.target, c3.pos), [0, 0, -1]) >= N.MIN_PIVOT - 1e-12, "the pivot stays in front of the camera");
  // zooming out from the same point goes back the same way
  const back = N.zoomTowards(N.zoomTowards({ pos: [0, 0, 10], target: [0, 0, 0] }, [1, 0, 0], 0.5), [1, 0, 0], 2);
  near(dist(back.pos, [0, 0, 10]), 0, 1e-9, "in and out at the same point: back where it was");
  // the clip planes follow the zoom
  ok(N.clipPlanes(0.002, 40).near < 0.0001 + 1e-12, "at 2 mm the near plane is a tenth of a millimetre");
  ok(N.clipPlanes(0.002, 40).far >= 1000, "…and the far keeps the whole temple");
}

// ── Shift+B, the double click, the frame ─────────────────────────────────────
{
  const cam = { pos: [0, 0, 100], target: [0, 0, 0] };
  const z = N.boxZoom(cam, [-0.1, -0.1, 0.1, 0.1], [5, 0, 0]);
  near(dist(z.pos, [5, 0, 0]), 10, 1e-9, "a box a tenth of the view: ten times nearer, the point in the middle");
  eq(z.target, [5, 0, 0], "…and the point is the new centre");
  near(N.dot(N.norm(N.sub(z.target, z.pos)), [0, 0, -1]), 1, 1e-12, "…the view does not turn");
  const d = N.detailZoom(cam, [2, 0, 0], 40);
  near(dist(d.pos, [2, 0, 0]), N.DETAIL_SPAN / (2 * Math.tan(Math.PI / 9)), 1e-9, "the double click: half a metre fills the view");
  const s = N.frameSphere(cam, [3, 4, 0], 2, 40, 1.6);
  eq(s.target, [3, 4, 0], "the frame of a sphere: its centre");
  near(dist(s.pos, [3, 4, 0]), N.frameDistance(2, 40, 1.6), 1e-9, "…at the distance where it fills the view");
}

// ── the table of the clicks ──────────────────────────────────────────────────
{
  const ev = (button, k = {}) => ({ button, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...k });
  const MAC = true, WIN = false;
  const table = [
    ["left", ev(0), "pick-proxy", "pick-proxy"],
    ["⌘ + left", ev(0, { metaKey: true }), "pick-rm", "pick-proxy"],
    ["Ctrl + left", ev(0, { ctrlKey: true }), "menu-proxy", "pick-rm"],
    ["right", ev(2), "menu-proxy", "menu-proxy"],
    ["⌘ + right", ev(2, { metaKey: true }), "menu-rm", "menu-proxy"],
    ["Ctrl + right", ev(2, { ctrlKey: true }), "menu-proxy", "menu-rm"],
    ["Shift + right", ev(2, { shiftKey: true }), "cursor", "cursor"],
    ["middle", ev(1), "none", "none"],
  ];
  for (const [name, e, mac, win] of table) {
    eq(N.pointerIntent(e, MAC), mac, `Mac · ${name}`);
    eq(N.pointerIntent(e, WIN), win, `Windows/Linux · ${name}`);
  }
  ok(N.isMacPlatform({ platform: "MacIntel" }) && !N.isMacPlatform({ platform: "Win32", userAgent: "Windows NT" }), "the platform");
}

// ── the keys with the 3D in focus ────────────────────────────────────────────
{
  const k = (key, m = {}) => N.spaceKeyAction({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...m }, true);
  eq([k("."), k("f"), k("F"), k("Home"), k("t"), k("B", { shiftKey: true }), k("C", { shiftKey: true }), k("A", { shiftKey: true })],
    ["frame-selection", "frame-selection", "frame-selection", "frame-all", "outliner", "box-zoom", "cursor-reset", "add-menu"], "the keys");
  eq([k("g"), k("r"), k("s"), k("x"), k("Escape"), k("[", { metaKey: true }), k("ArrowLeft", { altKey: true })],
    ["grab", "rotate", "scale", "delete", "cancel", "back", "back"], "G R S X Esc, and «Indietro»");
  eq([k("s", { metaKey: true }), k("z", { metaKey: true }), k("a")], [null, null, null], "⌘S, ⌘Z and a plain A are not the Space's");
}

// ── the modal G / R / S ──────────────────────────────────────────────────────
{
  const start = { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] };
  let st = N.startModal("grab");
  for (const key of ["z", "2", ".", "5"]) st = N.modalKey(st, key);
  eq(N.modalLabel(st), "G Z 2.5", "G Z 2.5");
  eq(N.applyTyped(start, st).position, [1, 4.5, 3], "G Z 2.5: up by 2.5 m (Blender's Z is three's Y)");
  st = N.modalKey(st, "Enter");
  eq(st.done, "confirm", "Enter confirms");
  st = N.modalKey(N.modalKey(N.startModal("grab"), "y"), "1");
  eq(N.applyTyped(start, st).position, [1, 2, 2], "G Y 1: Blender's Y is three's −Z");
  st = N.modalKey(N.modalKey(N.modalKey(N.startModal("rotate"), "9"), "0"), "Escape");
  eq(st.done, "cancel", "Esc cancels");
  near(N.applyTyped(start, N.modalKey(N.modalKey(N.startModal("rotate"), "9"), "0")).rotation[1], Math.PI / 2, 1e-12, "R 90: about the vertical by default");
  eq(N.applyTyped(start, N.modalKey(N.modalKey(N.startModal("scale"), "x"), "2")).scale, [2, 1, 1], "S X 2");
  eq(N.applyTyped(start, N.modalKey(N.startModal("scale"), "3")).scale, [3, 3, 3], "S 3: all three");
  eq(N.modalValue(N.modalKey(N.modalKey(N.startModal("grab"), "-"), "4")), -4, "a minus");
  eq(N.modalKey(N.modalKey(N.startModal("grab"), "x"), "x").axis, null, "the same axis twice: none (Blender: local, not here)");
  eq(N.modalKey(N.startModal("grab"), "r").mode, "rotate", "R inside G switches to rotate");
}

// ── a shape laid on a surface ────────────────────────────────────────────────
{
  const rot = (e, v) => {
    // XYZ Euler applied as Rz·Ry·Rx (three's order 'XYZ': the matrix is Rx·Ry·Rz applied to a column vector)
    const [a, b, c] = e;
    const Rx = (p) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
    const Ry = (p) => [p[0] * Math.cos(b) + p[2] * Math.sin(b), p[1], -p[0] * Math.sin(b) + p[2] * Math.cos(b)];
    const Rz = (p) => [p[0] * Math.cos(c) - p[1] * Math.sin(c), p[0] * Math.sin(c) + p[1] * Math.cos(c), p[2]];
    return Rx(Ry(Rz(v)));
  };
  for (const n of [[0, 1, 0], [1, 0, 0], [0, 0, -1], [0.3, 0.8, 0.2], [0, -1, 0]]) {
    const up = rot(N.eulerFromUp(n), [0, 1, 0]);
    const nn = N.norm(n);
    near(dist(up, nn), 0, 1e-9, `the shape's up onto the normal ${JSON.stringify(n)}`);
  }
}

// ── the trackpad and the wheel (G5, shared) ──────────────────────────────────
{
  let t = 0;
  const kind = W.trackpadClassifier(() => t);
  ok(!kind({ deltaMode: 0, deltaX: 0, deltaY: 100 }), "a mouse notch (100 px, integer) is a wheel");
  ok(!kind({ deltaMode: 1, deltaX: 0, deltaY: 3 }), "a wheel in lines is a wheel");
  ok(kind({ deltaMode: 0, deltaX: 2, deltaY: 0 }), "a horizontal component: a trackpad");
  t = 100;
  ok(kind({ deltaMode: 0, deltaX: 0, deltaY: 120 }), "…and the gesture keeps its kind for 400 ms");
  t = 600;
  ok(!kind({ deltaMode: 0, deltaX: 0, deltaY: 120 }), "after a pause, a big integer delta is a wheel again");
  ok(kind({ deltaMode: 0, deltaX: 0, deltaY: 4.5 }), "a fractional delta: a trackpad");
  ok(kind({ deltaMode: 0, deltaX: 0, deltaY: 120, wheelDeltaY: -360 }), "Chrome's legacy wheelDeltaY at −3×: a trackpad");
}

console.log(`check-space-nav: ${checks} checks passed`);
