/**
 * MICRO-SPAZIO-3D-2 · p.5 · the transform of a 3D object, in the data — pure
 * (`scripts/check-transform3d.mjs`).
 *
 * THE FORM (s3Dgraphy node datamodel 1.6.31, `geometry.transform`, E.D. 16-17
 * Oct 2026): `data.transform = { position, rotation, rotation_order,
 * angle_unit: "deg", scale, up_axis, pivot?, quaternion }` — NUMBERS, the
 * rotation in DEGREES (Blender's Euler, XYZ by default: X first, then Y, then
 * Z about the fixed axes, R = Rz·Ry·Rx), Z up, the PIVOT the point rotations
 * and scales turn about, in the object's own frame (absent: the centre of the
 * object's box), the quaternion computed. The matrix, in the data's frame:
 * v' = position + pivot + R·S·(v − pivot) — the identity leaves the object
 * where its file puts it, whatever the pivot. The file is never changed.
 *
 * TOLERANT READING: the old form (numbers as text, radians, no `angle_unit`,
 * written by s3Dgraphy, EM Tools and EMStudio until 16 Oct) is read too, and
 * an old transform that turns or scales keeps the pivot it always had, the
 * origin; what EMStudio writes is always the new form. Inside, `Xf` keeps the
 * rotation in RADIANS (the three.js side works in them): the conversion is at
 * the two ends, `readTransform` and `transformData`.
 *
 * Blender's frame to three's (the glTF exporter's own rule, `export_yup`):
 * position (x, y, z) → (x, z, −y), quaternion (w, x, y, z) → (w, x, z, −y),
 * scale (x, y, z) → (x, z, y). Blender's Euler XYZ is extrinsic X, then Y, then
 * Z (R = Rz·Ry·Rx); three's Euler XYZ is R = Rx·Ry·Rz: the two are bridged by
 * the quaternion, never by copying angles.
 */
import type { Pose, V3 } from "./space-nav";

/** A transform in the data's frame: Blender's, Z-up, Euler XYZ — in RADIANS here. */
export interface Xf {
  position: V3;
  rotation: V3;
  scale: V3;
  /** the axis that is up in these numbers: "Z" (Blender, EM Tools) or "Y" (glTF) */
  up_axis: "Z" | "Y";
  /** the point rotations and scales turn about, in the object's own frame;
   *  null / absent: the centre of the object's box (the caller measures it) */
  pivot?: V3 | null;
}

/** [w, x, y, z] */
export type Quat = [number, number, number, number];

export const IDENTITY: Xf = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], up_axis: "Z" };

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const triple = (v: unknown): V3 | null => {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const t = v.map(num);
  return t.every((x) => x != null) ? (t as V3) : null;
};

/** The six orders of Blender's Euler angles; the first letter turns first. */
export const ROTATION_ORDERS = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"] as const;

/** The transform a node's data carries, or null when it carries none (or an
 *  unreadable one). Both forms: the new (degrees, `angle_unit: "deg"`) and the
 *  old (radians, numbers as text); `readTransformForm` says which. */
export function readTransform(data: Record<string, unknown> | undefined | null): Xf | null {
  return readTransformForm(data)?.xf ?? null;
}
export function readTransformForm(data: Record<string, unknown> | undefined | null): { xf: Xf; old: boolean } | null {
  const t = data?.transform as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return null;
  if (!triple(t.position) && !triple(t.rotation) && !triple(t.scale)) return null;
  const position = triple(t.position) ?? [0, 0, 0];
  let rotation = triple(t.rotation) ?? [0, 0, 0];
  const scale = triple(t.scale) ?? [1, 1, 1];
  const unit = t.angle_unit;
  const text = [t.position, t.rotation, t.scale].some((v) => Array.isArray(v) && v.some((x) => typeof x === "string"));
  const old = unit !== "deg" || text || "rotation_mode" in t;
  if (unit === "deg") rotation = rotation.map(rad) as V3;
  const order = String(t.rotation_order ?? t.rotation_mode ?? "XYZ").toUpperCase();
  if (order !== "XYZ" && (ROTATION_ORDERS as readonly string[]).includes(order))
    rotation = blenderEulerFromQuat(quatFromEulerOrder(rotation, order));
  const up = String(t.up_axis ?? "Z").toUpperCase() === "Y" ? "Y" : "Z";
  let pivot = triple(t.pivot);
  // the old semantics: Blender's object origin, the origin of the file
  if (!pivot && old && !(rotation.every((x) => Math.abs(x) < 1e-12) && scale.every((x) => Math.abs(x - 1) < 1e-12))) pivot = [0, 0, 0];
  return { xf: { position, rotation, scale, up_axis: up, ...(pivot ? { pivot } : {}) }, old };
}

/** What goes into `data.transform`: the new form — numbers, degrees, the order,
 *  the unit, the up axis, the pivot when there is one, the quaternion computed. */
export function transformData(xf: Xf): Record<string, unknown> {
  const c = (x: number) => { const r = Math.round(x * 1e10) / 1e10; return Math.abs(r) < 1e-15 ? 0 : r; };
  const s = (v: readonly number[]) => v.map(c);
  return { position: s(xf.position), rotation: s(xf.rotation.map(deg)), rotation_order: "XYZ", angle_unit: "deg",
           scale: s(xf.scale), up_axis: xf.up_axis, ...(xf.pivot ? { pivot: s(xf.pivot) } : {}),
           quaternion: s(xfQuaternion(xf)) };
}

export function isIdentity(xf: Xf | null, eps = 1e-12): boolean {
  if (!xf) return true;
  return xf.position.every((x) => Math.abs(x) < eps) && xf.rotation.every((x) => Math.abs(x) < eps)
    && xf.scale.every((x) => Math.abs(x - 1) < eps);
}

// ── quaternions ──────────────────────────────────────────────────────────────

export function qmul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a, [bw, bx, by, bz] = b;
  return [aw * bw - ax * bx - ay * by - az * bz,
          aw * bx + ax * bw + ay * bz - az * by,
          aw * by - ax * bz + ay * bw + az * bx,
          aw * bz + ax * by - ay * bx + az * bw];
}
const axisQ = (i: 0 | 1 | 2, a: number): Quat => {
  const q: Quat = [Math.cos(a / 2), 0, 0, 0];
  q[i + 1] = Math.sin(a / 2);
  return q;
};
/** Row-major 3×3 of a unit quaternion. */
export function qmatrix(q: Quat): number[] {
  const [w, x, y, z] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
          2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
          2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
}
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** Blender's Euler XYZ (extrinsic X, Y, Z) → quaternion. */
export function quatFromBlenderEuler(e: V3): Quat {
  return qmul(axisQ(2, e[2]), qmul(axisQ(1, e[1]), axisQ(0, e[0])));
}
/** Blender's Euler in any of its six orders (the first letter turns first) → quaternion. */
export function quatFromEulerOrder(e: V3, order: string): Quat {
  let q: Quat = [1, 0, 0, 0];
  for (const letter of order) { const i = "XYZ".indexOf(letter) as 0 | 1 | 2; q = qmul(axisQ(i, e[i]), q); }
  return q;
}
/** quaternion → Blender's Euler XYZ (R = Rz·Ry·Rx). */
export function blenderEulerFromQuat(q: Quat): V3 {
  const m = qmatrix(q);
  const y = Math.asin(clamp1(-m[6]));
  if (Math.abs(m[6]) < 0.9999999) return [Math.atan2(m[7], m[8]), y, Math.atan2(m[3], m[0])];
  return [Math.atan2(-m[5], m[4]), y, 0];
}
/** three's Euler XYZ (R = Rx·Ry·Rz) → quaternion. */
export function quatFromThreeEuler(e: V3): Quat {
  return qmul(axisQ(0, e[0]), qmul(axisQ(1, e[1]), axisQ(2, e[2])));
}
/** quaternion → three's Euler XYZ (three's `setFromRotationMatrix`, order XYZ). */
export function threeEulerFromQuat(q: Quat): V3 {
  const m = qmatrix(q);
  const y = Math.asin(clamp1(m[2]));
  if (Math.abs(m[2]) < 0.9999999) return [Math.atan2(-m[5], m[8]), y, Math.atan2(-m[1], m[0])];
  return [Math.atan2(m[7], m[4]), y, 0];
}

// ── Blender's frame ⇄ three's ────────────────────────────────────────────────

/** R·S·v in the data's frame (Blender's Euler XYZ, radians). */
function rsApply(xf: Xf, v: readonly number[]): V3 {
  const m = qmatrix(quatFromBlenderEuler(xf.rotation));
  const w = [v[0] * xf.scale[0], v[1] * xf.scale[1], v[2] * xf.scale[2]];
  return [m[0] * w[0] + m[1] * w[1] + m[2] * w[2], m[3] * w[0] + m[4] * w[1] + m[5] * w[2], m[6] * w[0] + m[7] * w[1] + m[8] * w[2]];
}
/** The translation the matrix applies to the file's origin:
 *  position + pivot − R·S·pivot (the position itself without a pivot). */
export function effectiveTranslation(xf: Xf, pivot: V3 | null = null): V3 {
  const p = xf.pivot ?? pivot;
  if (!p) return [...xf.position] as V3;
  const rs = rsApply(xf, p);
  return [0, 1, 2].map((i) => xf.position[i] + p[i] - rs[i]) as V3;
}
/** The same matrix about another pivot: the position absorbs the change,
 *  position' = position + (I − R·S)(p − p') — s3Dgraphy's `rebase_pivot`. */
export function rebasePivot(xf: Xf, pivot: V3, oldPivot: V3 | null = null): Xf {
  const p = xf.pivot ?? oldPivot ?? [0, 0, 0];
  const d: V3 = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
  const rs = rsApply(xf, d);
  return { ...xf, position: [0, 1, 2].map((i) => xf.position[i] + d[i] - rs[i]) as V3, pivot: [...pivot] as V3 };
}
/** A transform edited from `before` to `after` (a form, a panel), turned and
 *  scaled about `centre` (the object's box centre, in its own frame): `before`
 *  is first moved onto that pivot, matrix unchanged, then the edit applies —
 *  so an old transform about the survey's origin is turned about the piece. */
export function withPivot(before: Xf, after: Xf, centre: V3 | null): Xf {
  if (!centre) return { ...after, pivot: after.pivot ?? before.pivot ?? null };
  const b = rebasePivot(before, centre, before.pivot ?? null);
  return { ...after, position: [0, 1, 2].map((i) => b.position[i] + after.position[i] - before.position[i]) as V3, pivot: [...centre] as V3 };
}

/** The data's transform as the scene applies it (three's axes, Euler XYZ),
 *  the pivot folded into the translation of the file's root. */
export function xfToPose(xf: Xf, pivot: V3 | null = null): Pose {
  const t = effectiveTranslation(xf, pivot);
  // numbers already Y-up: no turn of the axes, the Euler still extrinsic XYZ
  if (xf.up_axis === "Y") return { position: t, rotation: threeEulerFromQuat(quatFromBlenderEuler(xf.rotation)), scale: [...xf.scale] as V3 };
  const [w, x, y, z] = quatFromBlenderEuler(xf.rotation);
  return {
    position: [t[0], t[2], -t[1]],
    rotation: threeEulerFromQuat([w, x, z, -y]),
    scale: [xf.scale[0], xf.scale[2], xf.scale[1]],
  };
}
/** A pose of the scene (three's axes) as the data writes it (Blender's, Z-up);
 *  with `pivot` (the object's box centre in its own frame) the transform is
 *  written about it. */
export function poseToXf(p: Pose, pivot: V3 | null = null): Xf {
  const [w, x, y, z] = quatFromThreeEuler(p.rotation);
  const qb: Quat = [w, x, -z, y];
  const xf: Xf = {
    position: [p.position[0], -p.position[2], p.position[1]],
    rotation: blenderEulerFromQuat(qb),
    scale: [p.scale[0], p.scale[2], p.scale[1]],
    up_axis: "Z",
  };
  return pivot ? rebasePivot(xf, pivot, [0, 0, 0]) : xf;
}

/** The quaternion of a transform, in its own frame ([w, x, y, z], Blender's order). */
export function xfQuaternion(xf: Xf): Quat {
  const q = quatFromBlenderEuler(xf.rotation);
  return q[0] < 0 ? (q.map((v) => -v) as Quat) : q;
}

export const deg = (r: number): number => (r * 180) / Math.PI;
export const rad = (d: number): number => (d * Math.PI) / 180;

/**
 * The decimals a coordinate needs at its magnitude: a glb stores its vertices
 * as float32, whose step at |x| is |x|·2⁻²³ — at 500 m, 0.06 mm. Shown to the
 * tenth of a millimetre (4) up to 10 km, to the millimetre (3) beyond: more
 * would show digits the file does not hold.
 */
export function coordDecimals(magnitude: number): number {
  return Math.abs(magnitude) < 1e4 ? 4 : 3;
}

/**
 * MICRO-SPAZIO-3D-3 · a value changed on the ACTIVE object, carried to the
 * other selected ones by the same amount: the difference of position and of
 * rotation added, the ratio of scale multiplied (a zero scale changes nothing).
 * Blender's N panel changes only the active unless Alt is held; E.D. asked
 * that the panel act on all of them.
 */
export function carryXf(before: Xf, after: Xf, other: Xf): Xf {
  const r = (i: number) => (Math.abs(before.scale[i]) > 1e-12 ? after.scale[i] / before.scale[i] : 1);
  return {
    position: [0, 1, 2].map((i) => other.position[i] + after.position[i] - before.position[i]) as V3,
    rotation: [0, 1, 2].map((i) => other.rotation[i] + after.rotation[i] - before.rotation[i]) as V3,
    scale: [0, 1, 2].map((i) => other.scale[i] * r(i)) as V3,
    up_axis: other.up_axis,
    pivot: other.pivot ?? null,
  };
}
