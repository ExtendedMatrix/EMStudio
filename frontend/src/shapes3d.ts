/**
 * MICRO-SPAZIO-3D p.4 · the base shapes of a sketched proxy, and the sketches
 * of the session.
 *
 * The catalogue is DATA (`rules/shape_catalogue.json`: name, family, primitive,
 * starting dimensions in metres); this module reads it and builds each shape
 * with the three.js handed in (the lazy engine), its base centred on the origin
 * so it is born ON the 3D cursor.
 *
 * A SKETCH is a shape placed in the Space and not yet a proxy: this module's
 * list, shared by every Space window, which the Outliner shows as «sketched».
 * «Associate with a unit» turns it into a proxy (main.ts): its glb, then the
 * chain s3Dgraphy writes, as EM Tools does — and the sketch leaves the list.
 *
 * MICRO-SPAZIO-3D-3 p.6 · a sketch is the person's work: until 16 Oct 2026 it
 * lived in the page only and a reload lost it. Now main.ts keeps the list in
 * the graph's LAYOUT (`layout.sketches`, the view's part of the em.json, saved
 * with the file; `serializeSketches` / `loadSketches`). A sketch may also be a
 * FILE — the proxy a unit had before «Sostituisci»: then `file` says where its
 * glb is, and the shape is that glb, not a primitive.
 */
import catalogue from "./rules/shape_catalogue.json";

type V3 = [number, number, number];

export interface ShapeSpec {
  id: string;
  family: string;
  label: Record<string, string>;
  primitive: "box" | "cylinder" | "cone" | "sphere" | "hemisphere" | "plane" | "wedge" | "prism" | "torus" | "arch";
  size?: number[];
  radius?: number;
  height?: number;
  segments?: number;
  sides?: number;
  tube?: number;
  span?: number;
  ring?: number;
  depth?: number;
}

export interface ShapeFamily { id: string; label: Record<string, string> }

export const SHAPE_FAMILIES: ShapeFamily[] = (catalogue as { families: ShapeFamily[] }).families;
export const SHAPES: ShapeSpec[] = (catalogue as unknown as { shapes: ShapeSpec[] }).shapes;

export function shapeById(id: string): ShapeSpec | undefined {
  return SHAPES.find((s) => s.id === id);
}

/** The shape's name in a language, English when it has none there. */
export function shapeLabel(s: { label: Record<string, string> }, lang: string): string {
  return s.label[lang] ?? s.label.en ?? Object.values(s.label)[0] ?? "";
}

/**
 * The shape's geometry, base centred on the origin (y from 0 up), Y-up.
 * `THREE` is the engine's namespace.
 */
export function buildShapeGeometry(THREE: any, s: ShapeSpec): any {
  let g: any;
  const r = s.radius ?? 0.5;
  const h = s.height ?? 1;
  switch (s.primitive) {
    case "box": {
      const [x, y, z] = s.size ?? [1, 1, 1];
      g = new THREE.BoxGeometry(x, y, z);
      break;
    }
    case "cylinder":
      g = new THREE.CylinderGeometry(r, r, h, s.segments ?? 32);
      break;
    case "cone":
      g = new THREE.ConeGeometry(r, h, s.segments ?? 32);
      break;
    case "sphere":
      g = new THREE.SphereGeometry(r, 32, 16);
      break;
    case "hemisphere":
      g = new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      break;
    case "plane": {
      const [x, z] = s.size ?? [2, 2];
      g = new THREE.PlaneGeometry(x, z);
      g.rotateX(-Math.PI / 2);
      break;
    }
    case "wedge": {
      // a right-angled ramp: the triangle (0,0) (d,0) (0,h) in the z–y plane,
      // extruded along x
      const [x, y, z] = s.size ?? [1, 1, 1];
      const tri = new THREE.Shape();
      tri.moveTo(0, 0); tri.lineTo(z, 0); tri.lineTo(0, y); tri.lineTo(0, 0);
      g = new THREE.ExtrudeGeometry(tri, { depth: x, bevelEnabled: false });
      g.rotateY(-Math.PI / 2);
      g.center();
      break;
    }
    case "prism":
      g = new THREE.CylinderGeometry(r, r, h, s.sides ?? 3);
      break;
    case "torus":
      g = new THREE.TorusGeometry(r, s.tube ?? 0.15, 16, 48);
      g.rotateX(-Math.PI / 2);
      break;
    case "arch": {
      // a semicircular arch: the ring between the intrados (radius span/2)
      // and the extrados (+ ring), standing on y = 0, extruded `depth` along z
      const ri = (s.span ?? 2) / 2;
      const ro = ri + (s.ring ?? 0.4);
      const sh = new THREE.Shape();
      sh.moveTo(ro, 0);
      sh.absarc(0, 0, ro, 0, Math.PI, false);
      sh.lineTo(-ri, 0);
      sh.absarc(0, 0, ri, Math.PI, 0, true);
      sh.lineTo(ro, 0);
      g = new THREE.ExtrudeGeometry(sh, { depth: s.depth ?? 0.6, bevelEnabled: false, curveSegments: 24 });
      g.translate(0, 0, -(s.depth ?? 0.6) / 2);
      break;
    }
    default:
      g = new THREE.BoxGeometry(1, 1, 1);
  }
  // the base on y = 0, centred in x and z
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.computeVertexNormals();
  return g;
}

// ── the sketches of the session ──────────────────────────────────────────────

export interface Sketch {
  id: string;
  /** the catalogue's shape, or "file" when the sketch is a glb (`file`) */
  shape: string;
  /** MICRO-SPAZIO-3D-3 · a glb: the proxy a unit had, kept when replaced */
  file?: { url: string; checksum?: string; from?: string };
  name: string;
  position: V3;
  /** Euler XYZ, radians */
  rotation: V3;
  scale: V3;
}

const sketches: Sketch[] = [];
const listeners = new Set<() => void>();
let seq = 0;

export function listSketches(): readonly Sketch[] {
  return sketches;
}

export function sketchById(id: string): Sketch | undefined {
  return sketches.find((s) => s.id === id);
}

export function onSketches(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed(): void {
  for (const fn of listeners) fn();
}

/** A new sketch of `shape` at `at` (the 3D cursor), upright, scale 1. */
export function addSketch(shape: string, at: V3, name: string, rotation: V3 = [0, 0, 0]): Sketch {
  seq += 1;
  const s: Sketch = { id: `sketch-${seq}`, shape, name: `${name}.${String(seq).padStart(3, "0")}`,
    position: [...at] as V3, rotation: [...rotation] as V3, scale: [1, 1, 1] };
  sketches.push(s);
  changed();
  return s;
}

export function updateSketch(id: string, pose: Partial<Pick<Sketch, "position" | "rotation" | "scale">>, quiet = false): void {
  const s = sketchById(id);
  if (!s) return;
  if (pose.position) s.position = [...pose.position] as V3;
  if (pose.rotation) s.rotation = [...pose.rotation] as V3;
  if (pose.scale) s.scale = [...pose.scale] as V3;
  if (!quiet) changed();
}

export function removeSketch(id: string): void {
  const i = sketches.findIndex((s) => s.id === id);
  if (i < 0) return;
  sketches.splice(i, 1);
  changed();
}

/** The list as the layout keeps it: plain data, the pose rounded to the float. */
export function serializeSketches(): Sketch[] {
  return sketches.map((s) => ({ id: s.id, shape: s.shape, name: s.name, position: [...s.position] as V3,
    rotation: [...s.rotation] as V3, scale: [...s.scale] as V3, ...(s.file ? { file: { ...s.file } } : {}) }));
}

/** A list read back (the layout of a file opened): what is not a sketch is
 *  left out; the next id follows the highest. */
export function loadSketches(list: unknown): void {
  const tri = (v: unknown, d: V3): V3 => (Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(Number(x))) ? v.map(Number) as V3 : d);
  sketches.length = 0;
  seq = 0;
  for (const x of Array.isArray(list) ? list : []) {
    const o = x as Record<string, unknown>;
    if (!o || typeof o.id !== "string" || typeof o.shape !== "string") continue;
    const f = o.file as Record<string, unknown> | undefined;
    if (o.shape !== "file" && !shapeById(o.shape)) continue;
    if (o.shape === "file" && !(f && typeof f.url === "string")) continue;
    sketches.push({ id: o.id, shape: o.shape, name: String(o.name ?? o.id),
      position: tri(o.position, [0, 0, 0]), rotation: tri(o.rotation, [0, 0, 0]), scale: tri(o.scale, [1, 1, 1]),
      ...(f ? { file: { url: String(f.url), ...(typeof f.checksum === "string" ? { checksum: f.checksum } : {}), ...(typeof f.from === "string" ? { from: f.from } : {}) } } : {}) });
    const m = /(\d+)$/.exec(o.id);
    if (m) seq = Math.max(seq, Number(m[1]));
  }
  changed();
}

/** A sketch of a glb (the proxy a unit had), at its own place. */
export function addFileSketch(file: { url: string; checksum?: string; from?: string }, name: string, pose?: { position: V3; rotation: V3; scale: V3 }): Sketch {
  seq += 1;
  const s: Sketch = { id: `sketch-${seq}`, shape: "file", file: { ...file }, name,
    position: [...(pose?.position ?? [0, 0, 0])] as V3, rotation: [...(pose?.rotation ?? [0, 0, 0])] as V3, scale: [...(pose?.scale ?? [1, 1, 1])] as V3 };
  sketches.push(s);
  changed();
  return s;
}

/** For the checks: forget everything. */
export function clearSketches(): void {
  sketches.length = 0;
  seq = 0;
  changed();
}
