/**
 * LUOGO · the `.glb` of a reading's point, line or polyline — the client twin of
 * s3Dgraphy's `geometry/reading_glb.py`, written to give the SAME BYTES.
 *
 *     point     → mode 0  POINTS
 *     line      → mode 1  LINES       (exactly two vertices: one segment)
 *     polyline  → mode 3  LINE_STRIP  (an open chain)
 *
 * One float32 VEC3 accessor with min/max, a JSON chunk padded with spaces, a BIN
 * chunk padded with zeros. Coordinates VERBATIM, in the frame of the model the
 * reading is on (glTF, Y-up, local, metres): nothing is converted here, as in
 * Python — a conversion on one side only is how a point ends up a metre off.
 *
 * Byte parity needs Python's number spelling in the JSON chunk (`json.dumps`
 * writes `1.0`, `1e-05`, where JavaScript writes `1`, `0.00001`): `pyFloat`.
 * `scripts/check-paradata-chain.mjs` compares these bytes with s3Dgraphy's.
 */

export type GlbKind = "point" | "line" | "polyline";
export type Vec3 = [number, number, number];

export const GLB_MODES: Record<GlbKind, number> = { point: 0, line: 1, polyline: 3 };
const KIND_OF_MODE: Record<number, GlbKind> = { 0: "point", 1: "line", 3: "polyline" };

const MAGIC = 0x46546c67;      // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const FLOAT = 5126;
const ARRAY_BUFFER = 34962;

export class ReadingGlbError extends Error {}

function check(kind: GlbKind, vertices: ReadonlyArray<ReadonlyArray<number>>): Vec3[] {
  if (!(kind in GLB_MODES)) throw new ReadingGlbError(`geometry_kind must be point, line or polyline, got ${kind}`);
  const pts = (vertices ?? []).map((p, i) => {
    if (!Array.isArray(p) || p.length !== 3 || p.some((v) => typeof v !== "number" || !Number.isFinite(v)))
      throw new ReadingGlbError(`vertex ${i}: expected [x, y, z]`);
    return [p[0], p[1], p[2]] as Vec3;
  });
  const least = kind === "point" ? 1 : 2;
  if (pts.length < least) throw new ReadingGlbError(`a ${kind} needs at least ${least} vertices, got ${pts.length}`);
  if (kind === "line" && pts.length !== 2) throw new ReadingGlbError(`a line has exactly 2 vertices, got ${pts.length}`);
  return pts;
}

/** Sum of the segments of an OPEN chain — s3Dgraphy `polyline_length`. */
export function polylineLength(vertices: ReadonlyArray<ReadonlyArray<number>>): number {
  let total = 0;
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1], b = vertices[i];
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

// ── Python's spelling of a float ─────────────────────────────────────────────

/** `repr(float)` — what `json.dumps` writes for a float. The digits are the
 *  shortest round-trip ones in both languages; only the layout differs. */
export function pyFloat(x: number): string {
  if (Number.isNaN(x)) return "NaN";
  if (!Number.isFinite(x)) return x > 0 ? "Infinity" : "-Infinity";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const [mant, expS] = x.toExponential().split("e");
  const exp = Number(expS);
  const neg = mant.startsWith("-");
  const digits = mant.replace("-", "").replace(".", "");
  let body: string;
  if (exp < -4 || exp >= 16) {
    const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    body = `${m}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  } else if (exp < 0) {
    body = `0.${"0".repeat(-exp - 1)}${digits}`;
  } else if (digits.length <= exp + 1) {
    body = `${digits}${"0".repeat(exp + 1 - digits.length)}.0`;
  } else {
    body = `${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}`;
  }
  return neg ? `-${body}` : body;
}

/** `f"{x:.{n}f}"` — the EXACT value of the double rounded half-to-even, as
 *  Python does (JavaScript's `toFixed` rounds an exact tie up: 0.0078125 →
 *  "0.007813" where Python writes "0.007812"). Used for the region's key and the
 *  measure's value, both compared with s3Dgraphy's strings. */
export function pyFixed(x: number, n: number): string {
  if (!Number.isFinite(x)) return String(x);
  const neg = x < 0 || Object.is(x, -0);
  // x = m · 2^e exactly
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, Math.abs(x));
  const hi = buf.getUint32(0), lo = buf.getUint32(4);
  const bexp = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e: number;
  if (bexp === 0) e = -1074;
  else { m |= 1n << 52n; e = bexp - 1075; }
  // scaled = x · 10^n = m · 10^n · 2^e ; q, r = divmod
  let num = m * 10n ** BigInt(n);
  let den = 1n;
  if (e >= 0) num <<= BigInt(e);
  else den <<= BigInt(-e);
  let q = num / den;
  const r2 = (num % den) * 2n;
  if (r2 > den || (r2 === den && (q & 1n) === 1n)) q += 1n;
  let s = q.toString().padStart(n + 1, "0");
  if (n > 0) s = `${s.slice(0, s.length - n)}.${s.slice(s.length - n)}`;
  return neg ? `-${s}` : s;
}

/** `json.dumps(doc, separators=(",", ":"))` for the glb's JSON: numbers that
 *  are floats in Python are marked by the caller (`F`), the rest are ints. */
class F { constructor(readonly v: number) {} }
function pyJson(v: unknown): string {
  if (v instanceof F) return pyFloat(v.v);
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return pyString(v);
  if (Array.isArray(v)) return `[${v.map(pyJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${pyString(k)}:${pyJson(x)}`).join(",")}}`;
  if (v === null) return "null";
  return String(v);
}
/** ensure_ascii=True: every non-ASCII code unit as \uXXXX, like Python. */
function pyString(s: string): string {
  let out = '"';
  for (const ch of s) {
    for (let i = 0; i < ch.length; i++) {
      const c = ch.charCodeAt(i);
      if (c === 0x22) out += '\\"';
      else if (c === 0x5c) out += "\\\\";
      else if (c === 0x0a) out += "\\n";
      else if (c === 0x0d) out += "\\r";
      else if (c === 0x09) out += "\\t";
      else if (c === 0x08) out += "\\b";
      else if (c === 0x0c) out += "\\f";
      else if (c < 0x20 || c > 0x7e) out += `\\u${c.toString(16).padStart(4, "0")}`;
      else out += ch[i];
    }
  }
  return `${out}"`;
}

/** Python's `min`/`max`: the FIRST of equal items wins (so `min(0.0, -0.0)` is
 *  `0.0`, where `Math.min` gives `-0`). */
const pyMin = (xs: number[]) => xs.reduce((a, b) => (b < a ? b : a));
const pyMax = (xs: number[]) => xs.reduce((a, b) => (b > a ? b : a));

const pad4 = (n: number) => (4 - (n % 4)) % 4;

/** The GLB for one reading: one node, one mesh, one primitive — the bytes
 *  s3Dgraphy's `glb_bytes(kind, vertices, name=)` writes. */
export function glbBytes(kind: GlbKind, vertices: ReadonlyArray<ReadonlyArray<number>>, name = "reading"): Uint8Array {
  const pts = check(kind, vertices);
  const stored = new Float32Array(pts.flat());
  const cols = [0, 1, 2].map((c) => pts.map((_, i) => stored[i * 3 + c]));
  const byteLength = stored.byteLength;
  const doc = {
    asset: { version: "2.0", generator: "s3dgraphy reading_glb" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0 }, mode: GLB_MODES[kind] }] }],
    accessors: [{ bufferView: 0, componentType: FLOAT, count: pts.length, type: "VEC3",
                  min: cols.map((c) => new F(pyMin(c))), max: cols.map((c) => new F(pyMax(c))) }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength, target: ARRAY_BUFFER }],
    buffers: [{ byteLength }],
    extras: { s3dgraphy: { geometry_kind: kind } },
  };
  const json = new TextEncoder().encode(pyJson(doc));
  const jsonLen = json.length + pad4(json.length);
  const binLen = byteLength + pad4(byteLength);
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(json, 20);
  out.fill(0x20, 20 + json.length, 20 + jsonLen);
  const b = 20 + jsonLen;
  dv.setUint32(b, binLen, true);
  dv.setUint32(b + 4, CHUNK_BIN, true);
  out.set(new Uint8Array(stored.buffer), b + 8);
  return out;
}

/** GLB bytes → `{geometry_kind, vertices}` — the inverse of `glbBytes`, and
 *  of s3Dgraphy's writer (any GLB whose first primitive is POINTS, LINES or
 *  LINE_STRIP with a float VEC3 POSITION). */
export function parseGlb(bytes: Uint8Array): { geometry_kind: GlbKind; vertices: Vec3[] } {
  if (bytes.length < 20) throw new ReadingGlbError("not a GLB: too short");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC || dv.getUint32(4, true) !== 2)
    throw new ReadingGlbError("not a glTF 2.0 binary");
  const total = Math.min(dv.getUint32(8, true), bytes.length);
  let off = 12;
  let doc: any = null;
  let bin: Uint8Array | null = null;
  while (off + 8 <= total) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const chunk = bytes.subarray(off + 8, off + 8 + len);
    if (type === CHUNK_JSON) doc = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === CHUNK_BIN && !bin) bin = chunk;
    off += 8 + len;
  }
  if (!doc) throw new ReadingGlbError("GLB without a JSON chunk");
  const prim = doc.meshes?.[0]?.primitives?.[0];
  const acc = doc.accessors?.[prim?.attributes?.POSITION];
  const view = doc.bufferViews?.[acc?.bufferView];
  if (!prim || !acc || !view) throw new ReadingGlbError("GLB without a readable POSITION primitive");
  const kind = KIND_OF_MODE[prim.mode ?? 4];
  if (!kind) throw new ReadingGlbError(`primitive mode ${prim.mode} is not a reading's`);
  if (acc.componentType !== FLOAT || acc.type !== "VEC3") throw new ReadingGlbError("POSITION is not a float VEC3");
  if (!bin) throw new ReadingGlbError("GLB without a BIN chunk");
  const bdv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const start = Number(view.byteOffset ?? 0) + Number(acc.byteOffset ?? 0);
  const stride = Number(view.byteStride || 12);
  const vertices: Vec3[] = [];
  for (let i = 0; i < Number(acc.count); i++) {
    const o = start + i * stride;
    vertices.push([bdv.getFloat32(o, true), bdv.getFloat32(o + 4, true), bdv.getFloat32(o + 8, true)]);
  }
  return { geometry_kind: kind, vertices };
}
