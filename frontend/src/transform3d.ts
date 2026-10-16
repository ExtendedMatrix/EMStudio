/**
 * MICRO-SPAZIO-3D-2 · p.5 · the transform of a 3D object, in the data — pure
 * (`scripts/check-transform3d.mjs`).
 *
 * Measured on 16 Oct 2026 (the report, «dove vive la trasformazione»): the one
 * field EM Tools, Heriverse and s3Dgraphy's class already share is the node's
 * `data.transform = { position, rotation, scale }` — three values each, written
 * by EM Tools as strings (`obj.location`, Euler XYZ in RADIANS, `obj.scale`) in
 * Blender's Z-up frame; on Templu Mare v2 the 99 models carry it, all identity.
 * The datamodel does not declare it (only the Python class does), and a
 * SemanticShape has no place at all: the proposal for s3Dgraphy is in the
 * report. Until it is decided EMStudio uses the same field, on the model and on
 * the proxy's shape alike, with the same shape, and adds `up_axis: "Z"` — the
 * axis declared, as the MICRO asks; a reader that does not know the key ignores
 * it. The file (glb) is never changed: the transform is applied over it.
 *
 * Blender's frame to three's (the glTF exporter's own rule, `export_yup`):
 * position (x, y, z) → (x, z, −y), quaternion (w, x, y, z) → (w, x, z, −y),
 * scale (x, y, z) → (x, z, y). Blender's Euler XYZ is extrinsic X, then Y, then
 * Z (R = Rz·Ry·Rx); three's Euler XYZ is R = Rx·Ry·Rz: the two are bridged by
 * the quaternion, never by copying angles.
 */
import type { Pose, V3 } from "./space-nav";

/** A transform in the data's frame: Blender's, Z-up, Euler XYZ in radians. */
export interface Xf {
  position: V3;
  rotation: V3;
  scale: V3;
  /** the axis that is up in these numbers: "Z" (Blender, EM Tools) or "Y" (glTF) */
  up_axis: "Z" | "Y";
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

/** The transform a node's data carries, or null when it carries none (or an unreadable one). */
export function readTransform(data: Record<string, unknown> | undefined | null): Xf | null {
  const t = data?.transform as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return null;
  const position = triple(t.position) ?? [0, 0, 0];
  const rotation = triple(t.rotation) ?? [0, 0, 0];
  const scale = triple(t.scale) ?? [1, 1, 1];
  if (!triple(t.position) && !triple(t.rotation) && !triple(t.scale)) return null;
  const up = String(t.up_axis ?? "Z").toUpperCase() === "Y" ? "Y" : "Z";
  return { position, rotation, scale, up_axis: up };
}

/** What goes into `data.transform`: EM Tools' shape (strings), the axis declared. */
export function transformData(xf: Xf): Record<string, unknown> {
  const s = (v: V3) => v.map((x) => String(Math.abs(x) < 1e-15 ? 0 : x));
  return { position: s(xf.position), rotation: s(xf.rotation), scale: s(xf.scale), up_axis: xf.up_axis };
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

/** The data's transform as the scene applies it (three's axes, Euler XYZ). */
export function xfToPose(xf: Xf): Pose {
  // numbers already Y-up: no turn of the axes, the Euler still extrinsic XYZ
  if (xf.up_axis === "Y") return { position: [...xf.position] as V3, rotation: threeEulerFromQuat(quatFromBlenderEuler(xf.rotation)), scale: [...xf.scale] as V3 };
  const [w, x, y, z] = quatFromBlenderEuler(xf.rotation);
  return {
    position: [xf.position[0], xf.position[2], -xf.position[1]],
    rotation: threeEulerFromQuat([w, x, z, -y]),
    scale: [xf.scale[0], xf.scale[2], xf.scale[1]],
  };
}
/** A pose of the scene (three's axes) as the data writes it (Blender's, Z-up). */
export function poseToXf(p: Pose): Xf {
  const [w, x, y, z] = quatFromThreeEuler(p.rotation);
  const qb: Quat = [w, x, -z, y];
  return {
    position: [p.position[0], -p.position[2], p.position[1]],
    rotation: blenderEulerFromQuat(qb),
    scale: [p.scale[0], p.scale[2], p.scale[1]],
    up_axis: "Z",
  };
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
  };
}
