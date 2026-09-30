/**
 * LUOGO · the `.glb` a reading's point, line or polyline was written to from 7 to
 * 11 ott — READ ONLY. Since node datamodel 1.6.15 the vertices are the region's
 * `data.coords` and nothing here writes a file (the writer, `glbBytes`, went with
 * the SPAZIO night); this parser is what the migration of an old file uses
 * (`reading-files.ts`), the client twin of s3Dgraphy's `reading_glb.read_glb`.
 *
 *     mode 0  POINTS → point · mode 1  LINES → line · mode 3  LINE_STRIP → polyline
 *
 * Also here, because the measure is compared with s3Dgraphy's strings: the
 * chain length and Python's `f"{x:.nf}"` (`pyFixed`).
 */

export type GlbKind = "point" | "line" | "polyline";
export type Vec3 = [number, number, number];

const KIND_OF_MODE: Record<number, GlbKind> = { 0: "point", 1: "line", 3: "polyline" };

const MAGIC = 0x46546c67;      // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const FLOAT = 5126;
export class ReadingGlbError extends Error {}

/** Sum of the segments of an OPEN chain — s3Dgraphy `chain_length`
 *  (`math.dist`). The two may differ in the LAST BIT of a double (`math.dist` is
 *  nearly correctly rounded, `Math.hypot` and a plain `sqrt` each differ from it
 *  on some inputs — measured in `check-paradata-chain`); the length is a cache of
 *  the coords, recomputed by whoever reads them, and its value (`.3f`) agrees. */
export function polylineLength(vertices: ReadonlyArray<ReadonlyArray<number>>): number {
  let total = 0;
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1], b = vertices[i];
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

// ── Python's spelling of a measure ───────────────────────────────────────────

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

/** GLB bytes → `{geometry_kind, vertices}` — what s3Dgraphy's writer (and this
 *  client until 11 ott) wrote: any GLB whose first primitive is POINTS, LINES or
 *  LINE_STRIP with a float VEC3 POSITION. */
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
