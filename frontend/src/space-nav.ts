/**
 * MICRO-SPAZIO-3D · the navigation of the Space, as Blender does it — pure.
 *
 * The defect measured on 16 Oct 2026: the Space used three's `OrbitControls`
 * as it comes. Its dolly divides the distance from a FIXED target by 0.95 per
 * wheel event, toward the centre of the view and not the cursor, and once the
 * distance shrinks the steps shrink with it: from the first frame of Templu Mare
 * the camera never got nearer than the target, which sat in the middle of the
 * temple. Here the wheel and the pinch move the camera toward the POINT UNDER
 * THE CURSOR («Zoom to Mouse Position»), and the orbit centre is put at that
 * point's depth along the view («Auto Depth»): the pivot travels with the zoom,
 * so there is no wall to hit — the distance to the surface falls by the same
 * factor at every step, as close as one wants.
 *
 * Everything here is arithmetic on plain arrays, so `scripts/check-space-nav.mjs`
 * runs it in node: the camera, the gestures' table, the modal G/R/S of the
 * sketches. The scene (`scene3d.ts`) holds three.js and calls these.
 */

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** A camera as the controls see it: where it is and the orbit centre. */
export interface CamState { pos: V3; target: V3 }

/** The nearest the pivot may sit in front of the camera, in metres: under it the
 *  orbit centre is pushed ahead along the view (the dolly), never stopped. */
export const MIN_PIVOT = 0.002;

/**
 * One step of zoom toward `point` (the surface under the cursor, or the point
 * of the cursor's ray at the pivot's depth when nothing is under it).
 * `factor` < 1 comes nearer, > 1 goes away. The view direction does not turn:
 * the camera slides toward the point, and the pivot is put at the point's depth
 * along the view (Blender's Auto Depth) — or, when that depth is behind or too
 * near, pushed ahead by the old distance times the factor.
 */
export function zoomTowards(cam: CamState, point: V3, factor: number, minPivot = MIN_PIVOT): CamState {
  const dir = norm(sub(cam.target, cam.pos));
  const pos = add(point, mul(sub(cam.pos, point), factor));
  const depth = dot(sub(point, pos), dir);
  const old = len(sub(cam.target, cam.pos));
  const d = depth > minPivot ? depth : Math.max(minPivot, old * factor);
  return { pos, target: add(pos, mul(dir, d)) };
}

/** The factor of a wheel event: a pinch (ctrl, as Chrome and Firefox deliver it)
 *  is stronger per unit than a mouse's notch — the graph's numbers (G5). */
export function wheelFactor(deltaY: number, deltaMode: number, pinch: boolean, pageH = 800): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? pageH : 1;
  return Math.exp(deltaY * unit * (pinch ? 0.01 : 0.0016));
}

/** The distance from which a sphere of radius `r` fills a view of vertical
 *  field `fovDeg` and aspect `aspect`, with a margin. */
export function frameDistance(r: number, fovDeg: number, aspect: number, margin = 1.15): number {
  const v = (fovDeg * Math.PI) / 360;
  const h = Math.atan(Math.tan(v) * Math.min(1, aspect));
  return (Math.max(r, 1e-4) / Math.sin(h)) * margin;
}

/** Frame a sphere without turning the view. */
export function frameSphere(cam: CamState, centre: V3, r: number, fovDeg: number, aspect: number): CamState {
  const dir = norm(sub(cam.target, cam.pos));
  const d = frameDistance(r, fovDeg, aspect);
  return { pos: sub(centre, mul(dir, d)), target: centre };
}

/**
 * Shift+B · the zoom to a box: `rect` in normalised device coordinates
 * ([x0, y0, x1, y1], −1…1), `point` the surface under its centre (or the
 * centre's ray at the pivot's depth). The view does not turn: the camera slides
 * so the point is in the middle, at the distance where the box fills the view.
 */
export function boxZoom(cam: CamState, rect: [number, number, number, number], point: V3): CamState {
  const dir = norm(sub(cam.target, cam.pos));
  const depth = Math.max(MIN_PIVOT, dot(sub(point, cam.pos), dir));
  const w = Math.abs(rect[2] - rect[0]) / 2;
  const h = Math.abs(rect[3] - rect[1]) / 2;
  const k = Math.min(1, Math.max(w, h, 1e-3));
  const d = Math.max(MIN_PIVOT, depth * k);
  return { pos: sub(point, mul(dir, d)), target: point };
}

/** The double click: the width of the view at the detail, in metres. */
export const DETAIL_SPAN = 0.5;

/** Double click · frame tight the point under the cursor: the view does not
 *  turn, and a strip of `DETAIL_SPAN` metres fills its height — or the camera
 *  stays where it is when it is already nearer. */
export function detailZoom(cam: CamState, point: V3, fovDeg: number): CamState {
  const dir = norm(sub(cam.target, cam.pos));
  const want = DETAIL_SPAN / (2 * Math.tan((fovDeg * Math.PI) / 360));
  const depth = dot(sub(point, cam.pos), dir);
  const d = depth > 0 ? Math.min(depth, want) : want;
  return { pos: sub(point, mul(dir, d)), target: point };
}

/** The near and far planes for a camera whose pivot is `pivotDist` away: the
 *  near shrinks with the zoom (a millimetre detail is not clipped), the far
 *  keeps the whole scene. The renderer's depth buffer is logarithmic. */
export function clipPlanes(pivotDist: number, sceneSpan: number): { near: number; far: number } {
  const near = Math.min(0.5, Math.max(1e-4, pivotDist / 400));
  const far = Math.max(1000, sceneSpan * 50, pivotDist * 50);
  return { near, far };
}

// ── the gestures ─────────────────────────────────────────────────────────────

/** What a press means, as decided by E.D. on 11 Oct 2026. */
export type PointerIntent =
  | "pick-proxy" | "pick-rm"
  | "menu-proxy" | "menu-rm"
  | "cursor" | "none";

export interface PointerLike {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** macOS (and iOS), where Ctrl + click is the system's right click. */
export function isMacPlatform(nav: { platform?: string; userAgent?: string } | undefined = globalThis.navigator): boolean {
  const s = `${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`;
  return /Mac|iPhone|iPad|iPod/i.test(s);
}

/**
 * The table of the clicks. The MODEL key is ⌘ on a Mac, Ctrl elsewhere: on a
 * Mac Ctrl + click IS the right click (WebKit and Chrome deliver it as a
 * `contextmenu`, with `button` 0 and `ctrlKey`), so it opens the proxy's menu
 * like any right click.
 *
 * | press                         | Mac          | Windows / Linux |
 * |-------------------------------|--------------|-----------------|
 * | left                          | pick-proxy   | pick-proxy      |
 * | left + ⌘ (Mac) / Ctrl         | pick-rm      | pick-rm         |
 * | left + Ctrl (Mac)             | menu-proxy   | —               |
 * | right                         | menu-proxy   | menu-proxy      |
 * | right + ⌘ (Mac) / Ctrl        | menu-rm      | menu-rm         |
 * | right + Shift                 | cursor       | cursor          |
 */
export function pointerIntent(e: PointerLike, mac: boolean): PointerIntent {
  const model = mac ? e.metaKey : e.ctrlKey;
  if (e.button === 0) {
    if (mac && e.ctrlKey) return model ? "menu-rm" : "menu-proxy";
    return model ? "pick-rm" : "pick-proxy";
  }
  if (e.button === 2) {
    if (e.shiftKey) return "cursor";
    return model ? "menu-rm" : "menu-proxy";
  }
  return "none";
}

/** A press that moves more than this is a drag (an orbit, a pan), not a click —
 *  the graph's threshold. */
export const DRAG_PX = 4;

/** The keys of the Space, with the 3D in focus. The value is the action. */
export type SpaceKeyAction =
  | "frame-selection" | "frame-all" | "outliner" | "box-zoom" | "cursor-reset"
  | "add-menu" | "grab" | "rotate" | "scale" | "delete" | "cancel" | "back";

export function spaceKeyAction(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
                               mac: boolean): SpaceKeyAction | null {
  const k = e.key;
  const cmd = mac ? e.metaKey : e.ctrlKey;
  if (cmd && (k === "[")) return "back";
  if (e.altKey && k === "ArrowLeft") return "back";
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.shiftKey) {
    if (k === "B" || k === "b") return "box-zoom";
    if (k === "C" || k === "c") return "cursor-reset";
    if (k === "A" || k === "a") return "add-menu";
    return null;
  }
  switch (k) {
    case ".": case "f": case "F": return "frame-selection";
    case "Home": return "frame-all";
    case "t": case "T": return "outliner";
    case "g": case "G": return "grab";
    case "r": case "R": return "rotate";
    case "s": case "S": return "scale";
    case "x": case "X": case "Delete": case "Backspace": return "delete";
    case "Escape": return "cancel";
    default: return null;
  }
}

// ── the modal G / R / S of a sketched shape ──────────────────────────────────

export type ModalMode = "grab" | "rotate" | "scale";
export type Axis = "x" | "y" | "z";

export interface ModalState {
  mode: ModalMode;
  axis: Axis | null;
  /** the number typed so far ("" none) */
  typed: string;
  done: "" | "confirm" | "cancel";
}

export function startModal(mode: ModalMode): ModalState {
  return { mode, axis: null, typed: "", done: "" };
}

/** One key of the modal: an axis, a digit, a sign, a point, Backspace, Enter,
 *  Esc. G, R, S switch the mode as in Blender. Unknown keys change nothing. */
export function modalKey(st: ModalState, key: string): ModalState {
  if (st.done) return st;
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "x" || k === "y" || k === "z") return { ...st, axis: st.axis === k ? null : k };
  if (k === "g") return { ...st, mode: "grab" };
  if (k === "r") return { ...st, mode: "rotate" };
  if (k === "s") return { ...st, mode: "scale" };
  if (/^[0-9]$/.test(k)) return { ...st, typed: st.typed + k };
  if (k === "." && !st.typed.includes(".")) return { ...st, typed: st.typed + "." };
  if (k === "-") return { ...st, typed: st.typed.startsWith("-") ? st.typed.slice(1) : `-${st.typed}` };
  if (k === "Backspace") return { ...st, typed: st.typed.slice(0, -1) };
  if (k === "Enter") return { ...st, done: "confirm" };
  if (k === "Escape") return { ...st, done: "cancel" };
  return st;
}

/** The number typed, or null. */
export function modalValue(st: ModalState): number | null {
  if (!st.typed || st.typed === "-" || st.typed === "." || st.typed === "-.") return null;
  const v = Number(st.typed);
  return Number.isFinite(v) ? v : null;
}

/**
 * Blender's axes in the Space. Blender is Z-up, glTF and three.js are Y-up, and
 * the exporter turns (x, y, z) into (x, z, −y): so the X typed is three's x,
 * the Y typed (Blender's depth) is three's −z, the Z typed (up) is three's y.
 * A person who learned G Z 2 in Blender lifts the shape by two metres here too.
 */
export const AXIS_VECTOR: Record<Axis, V3> = { x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] };

export interface Pose { position: V3; rotation: V3; scale: V3 }

/**
 * A typed modal applied to the pose it started from. G n: n metres along the
 * axis (X when none). R n: n degrees around the axis (Z, the vertical, when
 * none). S n: the scale multiplied by n along the axis (all three when none).
 */
export function applyTyped(start: Pose, st: ModalState): Pose {
  const v = modalValue(st);
  if (v == null) return start;
  const ax = st.axis ?? (st.mode === "rotate" ? "z" : st.mode === "grab" ? "x" : null);
  if (st.mode === "grab") return { ...start, position: add(start.position, mul(AXIS_VECTOR[ax ?? "x"], v)) };
  if (st.mode === "rotate") {
    const r = (v * Math.PI) / 180;
    const a = AXIS_VECTOR[ax ?? "z"];
    // an Euler about three's own axis (x, y or z): Blender's Y is three's −z
    const i = a[0] ? 0 : a[1] ? 1 : 2;
    const sign = a[i] < 0 ? -1 : 1;
    const rot: V3 = [...start.rotation] as V3;
    rot[i] += r * sign;
    return { ...start, rotation: rot };
  }
  const s: V3 = [...start.scale] as V3;
  if (!ax) return { ...start, scale: mul(s, v) };
  const i = AXIS_VECTOR[ax][0] ? 0 : AXIS_VECTOR[ax][1] ? 1 : 2;
  s[i] *= v;
  return { ...start, scale: s };
}

/** What the modal says in the status line, as Blender's header does. */
export function modalLabel(st: ModalState): string {
  const m = st.mode === "grab" ? "G" : st.mode === "rotate" ? "R" : "S";
  return `${m}${st.axis ? ` ${st.axis.toUpperCase()}` : ""}${st.typed ? ` ${st.typed}` : ""}`;
}

/**
 * A shape laid on a surface: the rotation (Euler XYZ, three.js's order) that
 * turns its up (+Y) onto the surface's normal — Rodrigues' rotation about
 * up × n, read as XYZ angles.
 */
export function eulerFromUp(normal: V3): V3 {
  const n = norm(normal);
  const up: V3 = [0, 1, 0];
  const c = dot(up, n);
  if (c > 0.999999) return [0, 0, 0];
  if (c < -0.999999) return [Math.PI, 0, 0];
  const axis = norm([up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]]);
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  const t = 1 - c;
  const [x, y, z] = axis;
  const m11 = t * x * x + c, m12 = t * x * y - s * z, m13 = t * x * z + s * y;
  const m22 = t * y * y + c, m23 = t * y * z - s * x;
  const m32 = t * y * z + s * x, m33 = t * z * z + c;
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) return [Math.atan2(-m23, m33), ry, Math.atan2(-m12, m11)];
  return [Math.atan2(m32, m22), ry, 0];
}
