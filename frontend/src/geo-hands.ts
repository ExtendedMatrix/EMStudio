/**
 * MICRO-GLOBO-INTERAZIONE p.2 · the hands of the globe and of the plan, as
 * Google Earth's (E.D., 23 Oct 2026: «con il mouse fa orbita invece di pan»).
 *
 *   · left drag: GRAB the Earth — the point under the cursor stays under it;
 *   · right drag, or Shift/⌘ + left: tilt (up/down) and turn (left/right)
 *     around the point under the cursor; in the plan only the turn (it stays
 *     a view from above);
 *   · the wheel and the pinch: zoom toward the point under the cursor; a
 *     trackpad's two fingers pan, the pinch zooms, WebKit's two-finger
 *     rotation turns; on a touch screen one finger grabs, two pan, pinch and
 *     turn;
 *   · NORTH UP by default: a grab and a zoom never change the heading (the
 *     camera is kept as lon, lat, height, heading, pitch — the heading is a
 *     number the pan does not touch); a turn unhooks it, the COMPASS shows it
 *     and puts north back up with a click (a double click: the tilt too,
 *     straight down).
 *
 * Measured first (23 Oct, `3d-tiles-renderer` 0.5.3's `GlobeControls`, read in
 * its sources): its left drag already grabbed (an arcball about the Earth's
 * centre), right/Shift turned around the hit, the wheel zoomed to the cursor —
 * but the heading drifted with every grab (the arcball turns the camera about
 * the Earth's centre, and north follows only on a far zoom out), ⌘ and the
 * trackpad's two-finger pan and rotation were not there, no compass, and the
 * plan was not its: the plan kept the Space's orbit. Here the pose is ours, so
 * north stays where it is and the two modes have the same hands.
 *
 * The math is pure (ECEF, WGS84; checked in node, `scripts/check-geo-hands.mjs`);
 * `createGeoHands` binds it to a canvas, and `globe3d.ts` hands it the scene's
 * frame and camera.
 */
import { WGS84, ecefToGeodetic, enuAxes, geodeticToEcef, type V3 } from "./geoglobe";

const D2R = Math.PI / 180;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** Rodrigues: `v` turned by `ang` radians about the unit axis `k` */
const rot = (v: V3, k: V3, ang: number): V3 => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
};
const wrap = (deg: number): number => { const d = ((deg % 360) + 540) % 360 - 180; return d === -180 ? 180 : d; };

/** The camera: where (geodetic, height on the ellipsoid) and which way. */
export interface Pose {
  lon: number;
  lat: number;
  h: number;
  /** degrees clockwise from true north (0 = north up) */
  heading: number;
  /** degrees from the horizon, down negative (−90 = straight down) */
  pitch: number;
}

/** The screen: its size, the vertical field (perspective), or the orthographic's half height. */
export interface View {
  width: number;
  height: number;
  fov: number;
  ortho: boolean;
  /** the orthographic's scale is read at this height (the ground the scene puts its pivot on) */
  refH?: number;
}

export const PITCH_MIN = -90;
/** the tilt stops short of the horizon (a camera looking along the ground sees no ground to grab) */
export const PITCH_MAX = -6;
/** the closest a zoom goes to the point it zooms to, and the farthest out */
export const ZOOM_MIN_M = 3;
export const ZOOM_MAX_M = 4 * WGS84.a;

/** the camera's place and axes in ECEF */
export function poseBasis(p: Pose): { pos: V3; fwd: V3; right: V3; up: V3 } {
  const { e, n, u } = enuAxes(p.lon, p.lat);
  const hd = p.heading * D2R, pt = p.pitch * D2R;
  const horiz = add(mul(e, Math.sin(hd)), mul(n, Math.cos(hd)));
  const fwd = norm(add(mul(horiz, Math.cos(pt)), mul(u, Math.sin(pt))));
  const right = norm(add(mul(e, Math.cos(hd)), mul(n, -Math.sin(hd))));
  const up = norm(cross(right, fwd));
  return { pos: geodeticToEcef(p.lon, p.lat, p.h), fwd, right, up };
}

/** a camera given by its place and direction (ECEF) as a pose; the roll is dropped */
export function poseFromCamera(pos: V3, fwd: V3): Pose {
  const g = ecefToGeodetic(pos);
  const { e, n, u } = enuAxes(g.lon, g.lat);
  const f = norm(fwd);
  const pitch = Math.asin(Math.max(-1, Math.min(1, dot(f, u)))) / D2R;
  // straight down: the heading is the screen's up, which the caller keeps (0 here)
  const fe = dot(f, e), fn = dot(f, n);
  const heading = Math.hypot(fe, fn) < 1e-9 ? 0 : Math.atan2(fe, fn) / D2R;
  return { lon: g.lon, lat: g.lat, h: g.h, heading: wrap(heading), pitch };
}

/** the same, keeping the heading of a camera looking straight down from its up vector */
export function poseFromCameraUp(pos: V3, fwd: V3, up: V3): Pose {
  const p = poseFromCamera(pos, fwd);
  if (p.pitch > -89.5) return p;
  const { e, n } = enuAxes(p.lon, p.lat);
  return { ...p, heading: wrap(Math.atan2(dot(up, e), dot(up, n)) / D2R) };
}

/** the ray through a screen point (NDC, −1…1, y up) */
export function rayAt(p: Pose, v: View, sx: number, sy: number, orthoHalf = 0): { o: V3; d: V3 } {
  const b = poseBasis(p);
  const aspect = v.width / Math.max(1, v.height);
  if (v.ortho) {
    const hh = orthoHalf, hw = orthoHalf * aspect;
    return { o: add(add(b.pos, mul(b.right, sx * hw)), mul(b.up, sy * hh)), d: b.fwd };
  }
  const t = Math.tan((v.fov * D2R) / 2);
  return { o: b.pos, d: norm(add(add(b.fwd, mul(b.right, sx * t * aspect)), mul(b.up, sy * t))) };
}

/** where a ray first meets the ellipsoid raised by `h0` metres (null: it misses) */
export function hitEllipsoid(o: V3, d: V3, h0 = 0): V3 | null {
  const a = WGS84.a + h0, b = WGS84.a * (1 - WGS84.f) + h0;
  // scale z so the ellipsoid is a sphere of radius a
  const k = a / b;
  const O: V3 = [o[0], o[1], o[2] * k], D: V3 = [d[0], d[1], d[2] * k];
  const A = dot(D, D), B = 2 * dot(O, D), C = dot(O, O) - a * a;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-B - sq) / (2 * A);
  if (t < 0) t = (-B + sq) / (2 * A);
  if (t < 0) return null;
  return add(o, mul(d, t));
}

/** a point's place on the screen (NDC), or null behind the camera */
export function project(p: Pose, v: View, P: V3, orthoHalf = 0): [number, number] | null {
  const b = poseBasis(p);
  const w = sub(P, b.pos);
  const z = dot(w, b.fwd);
  const aspect = v.width / Math.max(1, v.height);
  if (v.ortho) return [dot(w, b.right) / (orthoHalf * aspect), dot(w, b.up) / orthoHalf];
  if (z <= 0) return null;
  const t = Math.tan((v.fov * D2R) / 2);
  return [dot(w, b.right) / z / t / aspect, dot(w, b.up) / z / t];
}

/** the orthographic's half height: the camera's distance to the ground at the centre × tan(fov/2) */
export function orthoHalfOf(p: Pose, v: View, h0 = 0): number {
  const b = poseBasis(p);
  const href = v.refH ?? h0;
  const hit = hitEllipsoid(b.pos, b.fwd, href);
  const d = hit ? len(sub(hit, b.pos)) : Math.max(1, p.h - href);
  return d * Math.tan((v.fov * D2R) / 2);
}

const lonLatOf = (P: V3): [number, number] => { const g = ecefToGeodetic(P); return [g.lon, g.lat]; };

/**
 * GRAB: the camera's lon/lat (height, heading, pitch kept) such that the ray
 * through the screen point (sx, sy) meets the grabbed point P0 (on the
 * ellipsoid raised by its height h0). Newton on the two unknowns, the
 * Jacobian by differences: three or four steps put P0 under the cursor to a
 * thousandth of a pixel. Null when the point cannot be reached (the ray off
 * the Earth).
 */
export function grab(p: Pose, v: View, P0: V3, h0: number, sx: number, sy: number, orthoHalf?: number): Pose | null {
  const target = lonLatOf(P0);
  const half = orthoHalf ?? (v.ortho ? orthoHalfOf(p, v, h0) : 0);
  const f = (q: Pose): [number, number] | null => {
    const r = rayAt(q, v, sx, sy, half);
    const hit = hitEllipsoid(r.o, r.d, h0);
    if (!hit) return null;
    const [lo, la] = lonLatOf(hit);
    return [wrap(lo - target[0]), la - target[1]];
  };
  let q = { ...p };
  for (let i = 0; i < 8; i++) {
    const r0 = f(q);
    if (!r0) return null;
    if (Math.abs(r0[0]) < 1e-11 && Math.abs(r0[1]) < 1e-11) break;
    const eps = Math.max(1e-9, Math.min(1e-3, (Math.abs(r0[0]) + Math.abs(r0[1])) * 1e-3));
    const rx = f({ ...q, lon: q.lon + eps }), ry = f({ ...q, lat: q.lat + eps });
    if (!rx || !ry) return null;
    const j11 = (rx[0] - r0[0]) / eps, j21 = (rx[1] - r0[1]) / eps, j12 = (ry[0] - r0[0]) / eps, j22 = (ry[1] - r0[1]) / eps;
    const det = j11 * j22 - j12 * j21;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return null;
    let dLon = -(j22 * r0[0] - j12 * r0[1]) / det, dLat = -(-j21 * r0[0] + j11 * r0[1]) / det;
    // no leap over a pole or round the world in one step
    const big = Math.max(Math.abs(dLon), Math.abs(dLat));
    if (big > 20) { dLon *= 20 / big; dLat *= 20 / big; }
    q = { ...q, lon: wrap(q.lon + dLon), lat: Math.max(-89.9, Math.min(89.9, q.lat + dLat)) };
  }
  const end = f(q);
  return end && Math.abs(end[0]) < 1e-7 && Math.abs(end[1]) < 1e-7 ? q : null;
}

/**
 * ZOOM toward the point P (under the cursor at sx, sy; height h0): `factor` < 1
 * closer. The perspective camera slides along the cursor's ray, the
 * orthographic's scale changes; then a grab keeps P under the cursor (when the
 * cursor is still on the Earth). Heading and pitch do not change.
 */
export function zoomAt(p: Pose, v: View, P: V3, h0: number, sx: number, sy: number, factor: number): Pose | null {
  const b = poseBasis(p);
  if (v.ortho) {
    const href = v.refH ?? h0;
    const hit = hitEllipsoid(b.pos, b.fwd, href);
    const d = hit ? len(sub(hit, b.pos)) : Math.max(1, p.h - href);
    const nd = Math.max(ZOOM_MIN_M, Math.min(ZOOM_MAX_M, d * factor));
    const q = { ...p, h: p.h + (nd - d) * (hit ? -dot(b.fwd, enuAxes(p.lon, p.lat).u) : 1) };
    return grab(q, v, P, h0, sx, sy, nd * Math.tan((v.fov * D2R) / 2)) ?? q;
  }
  const d = len(sub(P, b.pos));
  const nd = Math.max(ZOOM_MIN_M, Math.min(ZOOM_MAX_M, d * factor));
  const dir = norm(sub(P, b.pos));
  const pos = sub(P, mul(dir, nd));
  const g = ecefToGeodetic(pos);
  const moved = { ...p, lon: g.lon, lat: g.lat, h: g.h };
  // zooming out from far, the point may leave the Earth's disc under the cursor:
  // the zoom still happens, the point drifts
  return grab(moved, v, P, h0, sx, sy) ?? moved;
}

/**
 * TURN and TILT around the point P: the camera goes round P's vertical by
 * `dHeading` degrees and round its own right axis through P by `dPitch`, its
 * direction with it; the pitch is kept between straight down and short of the
 * horizon. P stays where it was on the screen.
 */
export function orbitAround(p: Pose, P: V3, dHeading: number, dPitch: number): Pose {
  // the pitch is the camera's own (its vertical, not P's): far from P the tilt
  // about P is not the pitch's change, so the remainder is tilted again
  const want = Math.max(PITCH_MIN, Math.min(PITCH_MAX, p.pitch + dPitch));
  let q = orbitOnce(p, P, dHeading, dPitch);
  for (let i = 0; i < 6 && Math.abs(want - q.pitch) > 1e-9; i++) q = orbitOnce(q, P, 0, want - q.pitch);
  return q;
}
function orbitOnce(p: Pose, P: V3, dHeading: number, dPitch: number): Pose {
  const b = poseBasis(p);
  const gP = ecefToGeodetic(P);
  const uP = enuAxes(gP.lon, gP.lat).u;
  const pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, p.pitch + dPitch));
  const dp = (pitch - p.pitch) * D2R;
  // the tilt first, about the camera's right axis through P (looking up is a positive pitch)
  let rel = sub(b.pos, P);
  let fwd = b.fwd, up = b.up;
  if (dp) { rel = rot(rel, b.right, dp); fwd = rot(fwd, b.right, dp); up = rot(up, b.right, dp); }
  // then the turn, about P's vertical (a positive heading turns the view clockwise: the camera goes the other way round)
  const dh = -dHeading * D2R;
  if (dh) { rel = rot(rel, uP, dh); fwd = rot(fwd, uP, dh); up = rot(up, uP, dh); }
  const pos = add(P, rel);
  const q = poseFromCameraUp(pos, fwd, up);
  // straight down, the heading is the turn's (no direction to read it from)
  return q.pitch <= -89.5 ? { ...q, heading: wrap(p.heading + dHeading) } : q;
}

// ── the controller ───────────────────────────────────────────────────────────

export interface HandsDeps {
  /** the canvas (its size, the pointer's capture) */
  dom: HTMLElement;
  /** where the gestures are heard: the scene's host, so a drag that starts on a
   *  model's label still grabs; `accepts` says which targets are the scene's
   *  (not a button, a panel, the compass) */
  area?: HTMLElement;
  accepts?(target: EventTarget | null): boolean;
  /** the camera as a pose, and the screen */
  pose(): Pose;
  view(): View;
  /** the pose put on the scene's camera */
  apply(p: Pose): void;
  /** the ground under a screen point (the terrain drawn, ECEF), or null */
  pick(clientX: number, clientY: number): V3 | null;
  /** the height to grab on when nothing is drawn under the cursor */
  fallbackHeight(): number;
  /** the plan: straight down, the tilt locked */
  plan(): boolean;
  /** a trackpad's two-finger scroll, and where the fingers went (`wheel-kind.ts`) */
  isTrackpad(e: WheelEvent): boolean;
  fingers(e: WheelEvent): [number, number];
  /** something moved: the scene draws */
  changed?(): void;
}

export interface GeoHands {
  enabled: boolean;
  /** a gesture is under way (a button held, a wheel or a pinch in the last 300 ms) */
  busy(): boolean;
  /** north up (and, `level`, straight down), turned in ~300 ms around the centre */
  northUp(level?: boolean): void;
  /** one frame of a running animation (the compass's) */
  update(): void;
  dispose(): void;
  /** the probes' seam: what the last gesture did */
  last(): Record<string, unknown> | null;
}

export function createGeoHands(d: HandsDeps): GeoHands {
  let enabled = false;
  let drag: { kind: "grab" | "orbit"; id: number; P: V3; h0: number; x0: number; y0: number; lastX: number; lastY: number; base: Pose } | null = null;
  let quietUntil = 0;
  let anim: { t0: number; ms: number; from: Pose; P: V3; dHeading: number; dPitch: number; done: number } | null = null;
  let last: Record<string, unknown> | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; ang: number; mx: number; my: number } | null = null;
  const dom = d.dom;
  const area = d.area ?? dom;
  const mine = (e: Event): boolean => (d.accepts ? d.accepts(e.target) : e.target === dom);

  const ndc = (cx: number, cy: number): [number, number] => {
    const r = dom.getBoundingClientRect();
    return [((cx - r.left) / Math.max(1, r.width)) * 2 - 1, -(((cy - r.top) / Math.max(1, r.height)) * 2 - 1)];
  };
  const heightOf = (P: V3): number => ecefToGeodetic(P).h;
  /** the point under a screen point: the terrain drawn, else the ellipsoid at the fallback height */
  const under = (cx: number, cy: number): { P: V3; h0: number } | null => {
    const hit = d.pick(cx, cy);
    if (hit) return { P: hit, h0: heightOf(hit) };
    const h0 = d.fallbackHeight();
    const p = d.pose(), v = d.view();
    const [sx, sy] = ndc(cx, cy);
    const r = rayAt(p, v, sx, sy, v.ortho ? orthoHalfOf(p, v, h0) : 0);
    const P = hitEllipsoid(r.o, r.d, h0);
    return P ? { P, h0 } : null;
  };
  const put = (q: Pose | null, what: string) => {
    if (!q) return false;
    if (d.plan()) q = { ...q, pitch: PITCH_MIN };
    d.apply(q);
    d.changed?.();
    last = { what, pose: q, at: performance.now() };
    return true;
  };
  const stopAnim = () => { anim = null; };

  /** the grabbed point to the cursor; a cursor off the Earth (past its limb)
   *  takes the point as far along the way as the Earth goes (bisected): the
   *  drag goes on to the edge, never jumps */
  const grabTo = (P: V3, h0: number, cx: number, cy: number, base?: Pose, from?: [number, number]) => {
    const b = base ?? d.pose(), v = d.view();
    const [sx, sy] = ndc(cx, cy);
    const q = grab(b, v, P, h0, sx, sy);
    if (q || !from) return put(q, "grab");
    const [fx, fy] = ndc(from[0], from[1]);
    let lo = 0, hi = 1, best: Pose | null = null;
    for (let i = 0; i < 8; i++) {
      const t = (lo + hi) / 2;
      const r = grab(b, v, P, h0, fx + (sx - fx) * t, fy + (sy - fy) * t);
      if (r) { best = r; lo = t; } else hi = t;
    }
    return put(best, "grab-edge");
  };
  const zoomTo = (cx: number, cy: number, factor: number) => {
    const u = under(cx, cy);
    if (!u) return false;
    const [sx, sy] = ndc(cx, cy);
    return put(zoomAt(d.pose(), d.view(), u.P, u.h0, sx, sy, factor), "zoom");
  };
  const turn = (P: V3, dHeading: number, dPitch: number, base?: Pose) =>
    put(orbitAround(base ?? d.pose(), P, dHeading, d.plan() ? 0 : dPitch), "orbit");

  const onDown = (e: PointerEvent) => {
    if (!enabled || !mine(e)) return;
    stopAnim();
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { dom.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      e.preventDefault();
      if (touches.size === 2) { drag = null; pinch = pinchOf(); }
      else if (touches.size === 1) startDrag("grab", e);
      return;
    }
    const orbit = e.button === 2 || e.button === 1 || (e.button === 0 && (e.shiftKey || e.metaKey));
    if (e.button !== 0 && !orbit) return;
    e.preventDefault();
    startDrag(orbit ? "orbit" : "grab", e);
  };
  const startDrag = (kind: "grab" | "orbit", e: PointerEvent) => {
    const u = under(e.clientX, e.clientY);
    if (!u) return;
    drag = { kind, id: e.pointerId, P: u.P, h0: u.h0, x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastY: e.clientY, base: d.pose() };
    try { dom.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
  };
  const pinchOf = () => {
    const [a, b] = [...touches.values()];
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const onMove = (e: PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType === "touch" && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && pinch) {
        const now = pinchOf();
        const u = under(pinch.mx, pinch.my);
        if (u) {
          // the fingers' middle drags the Earth, their spread zooms, their turn turns
          grabTo(u.P, u.h0, now.mx, now.my);
          if (now.dist > 0 && pinch.dist > 0) zoomTo(now.mx, now.my, pinch.dist / now.dist);
          const da = (now.ang - pinch.ang) / D2R;
          if (Math.abs(da) > 0.05) { const c = under(now.mx, now.my); if (c) turn(c.P, -da, 0); }
        }
        pinch = now;
        return;
      }
    }
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    if (drag.kind === "grab") grabTo(drag.P, drag.h0, e.clientX, e.clientY, drag.base, [drag.x0, drag.y0]);
    else {
      // degrees per pixel: a quarter (a 360° turn across a wide screen and a bit)
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      turn(drag.P, dx * 0.25, -dy * 0.25, drag.base);
    }
    drag.lastX = e.clientX; drag.lastY = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      touches.delete(e.pointerId);
      pinch = touches.size === 2 ? pinchOf() : null;
      if (touches.size === 1) {
        const [id, t] = [...touches.entries()][0];
        const u = under(t.x, t.y);
        drag = u ? { kind: "grab", id, P: u.P, h0: u.h0, x0: t.x, y0: t.y, lastX: t.x, lastY: t.y, base: d.pose() } : null;
        return;
      }
    }
    if (drag && e.pointerId === drag.id) {
      try { dom.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      drag = null;
      quietUntil = performance.now() + 150;
    }
  };
  const onWheel = (e: WheelEvent) => {
    if (!enabled || !mine(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    stopAnim();
    quietUntil = performance.now() + 300;
    if (e.ctrlKey) {
      // a pinch (Chrome, Firefox): ctrl + wheel, small deltas
      zoomTo(e.clientX, e.clientY, Math.exp(e.deltaY * 0.01));
      return;
    }
    if (d.isTrackpad(e)) {
      // two fingers: the content follows the fingers
      const [fx, fy] = d.fingers(e);
      const u = under(e.clientX - fx, e.clientY - fy);
      if (u) grabTo(u.P, u.h0, e.clientX, e.clientY);
      return;
    }
    const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY;
    zoomTo(e.clientX, e.clientY, Math.pow(1.0015, px));
  };
  // WebKit (Safari, the desktop's WKWebView): the pinch and the two-finger turn as gestures
  let gScale = 1, gRot = 0;
  const onGestureStart = (e: Event) => { if (!enabled || !mine(e)) return; e.preventDefault(); e.stopImmediatePropagation(); gScale = 1; gRot = 0; stopAnim(); };
  const onGestureChange = (e: Event) => {
    if (!enabled || !mine(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    quietUntil = performance.now() + 300;
    const g = e as Event & { scale?: number; rotation?: number; clientX?: number; clientY?: number };
    const r = dom.getBoundingClientRect();
    const cx = g.clientX ?? r.left + r.width / 2, cy = g.clientY ?? r.top + r.height / 2;
    const sc = typeof g.scale === "number" && g.scale > 0 ? g.scale : 1;
    zoomTo(cx, cy, gScale / sc);
    gScale = sc;
    const ro = typeof g.rotation === "number" ? g.rotation : 0;
    if (Math.abs(ro - gRot) > 0.05) { const u = under(cx, cy); if (u) turn(u.P, -(ro - gRot), 0); }
    gRot = ro;
  };
  const onContext = (e: Event) => { if (enabled && mine(e)) { e.preventDefault(); e.stopImmediatePropagation(); } };
  const onDbl = (e: MouseEvent) => {
    if (!enabled || !mine(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    zoomTo(e.clientX, e.clientY, 0.5);
  };
  // the capture phase: the Space's own hands (Blender's) stand aside while these are on
  area.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
  area.addEventListener("wheel", onWheel, { capture: true, passive: false });
  area.addEventListener("gesturestart", onGestureStart, true);
  area.addEventListener("gesturechange", onGestureChange, true);
  area.addEventListener("contextmenu", onContext, true);
  area.addEventListener("dblclick", onDbl, true);

  return {
    get enabled() { return enabled; },
    set enabled(v: boolean) { enabled = v; if (!v) { drag = null; touches.clear(); pinch = null; anim = null; } },
    busy: () => !!drag || touches.size > 0 || performance.now() < quietUntil || !!anim,
    northUp(level = false) {
      const p = d.pose();
      const r = dom.getBoundingClientRect();
      const u = under(r.left + r.width / 2, r.top + r.height / 2);
      if (!u) { put({ ...p, heading: 0, ...(level ? { pitch: PITCH_MIN } : {}) }, "north"); return; }
      const reduce = (() => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
      const dHeading = -p.heading, dPitch = level ? PITCH_MIN - p.pitch : 0;
      if (reduce) { put(orbitAround(p, u.P, dHeading, dPitch), "north"); return; }
      anim = { t0: performance.now(), ms: 300, from: p, P: u.P, dHeading, dPitch, done: 0 };
    },
    update() {
      if (!anim) return;
      const t = Math.min(1, (performance.now() - anim.t0) / anim.ms);
      const k = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
      const q = orbitAround(anim.from, anim.P, anim.dHeading * k, anim.dPitch * k);
      put(t >= 1 ? { ...q, heading: wrap(anim.from.heading + anim.dHeading) } : q, "north");
      if (t >= 1) anim = null;
    },
    dispose() {
      area.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      area.removeEventListener("wheel", onWheel, true);
      area.removeEventListener("gesturestart", onGestureStart, true);
      area.removeEventListener("gesturechange", onGestureChange, true);
      area.removeEventListener("contextmenu", onContext, true);
      area.removeEventListener("dblclick", onDbl, true);
    },
    last: () => last,
  };
}
