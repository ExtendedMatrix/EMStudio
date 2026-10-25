/**
 * MICRO tileset dritto e nitido (E.D., 25 Oct 2026) · the numbers a tiles layer
 * decides by, pure (no three, no DOM): `scripts/check-tiles-budget.mjs`.
 * Where they are used, and why: `tiles3d.ts`'s header.
 */

export interface GeErrors {
  root: number;
  diagonal: number;
  /** the root's error is under 1/600 of its diagonal */
  small: boolean;
  /** the multiplier the automatic mode applies */
  scale: number;
  /** …estimated (true) or chosen */
  auto: boolean;
}

/** MICRO tileset dritto e nitido · the multiplier of a root's errors: 1 when
 *  the error is in proportion to the extent (over 1/600 of the diagonal),
 *  else the power of two that brings it to about 1/60 (the error at which the
 *  root refines when it fills the view, at the renderer's 16 pixels). */
export function estimateErrorScale(rootError: number, diagonal: number): { small: boolean; scale: number } {
  if (!(diagonal > 0) || !(rootError >= 0)) return { small: false, scale: 1 };
  const small = rootError < diagonal / 600;
  if (!small) return { small, scale: 1 };
  const want = diagonal / 60 / Math.max(rootError, diagonal / 1e5);
  return { small, scale: Math.min(1024, 2 ** Math.round(Math.log2(want))) };
}

/** The diagonal of a bounding volume (box or sphere), metres; 0 when unknown */
export function volumeDiagonal(bv: unknown): number {
  const v = (bv ?? {}) as Record<string, unknown>;
  if (Array.isArray(v.box) && v.box.length === 12) {
    const b = v.box.map(Number);
    const h = [3, 6, 9].map((i) => Math.hypot(b[i], b[i + 1], b[i + 2]));
    return 2 * Math.hypot(h[0], h[1], h[2]);
  }
  if (Array.isArray(v.sphere) && v.sphere.length === 4) return 2 * Math.abs(Number(v.sphere[3]));
  return 0;
}

/** The side of the SQUARE a tile's texture is reduced to, in texels: a texture
 *  keeps at most side² of them, its aspect kept (RealityScan's atlases are
 *  strips, 8192 × 1024: their longest side alone would cut them eight times).
 *  The canvas's longest side to the next power of two (a tile filling the view
 *  cannot show more), and no texture over a sixteenth of the memory ceiling
 *  (RGBA and its mipmaps, 4 × 4/3 bytes a texel); 512 at least. */
export function textureSideFor(canvasPx: number, ceilingBytes: number, gpuMax = 16384): number {
  const pow2 = (x: number) => 2 ** Math.ceil(Math.log2(Math.max(1, x)));
  const byScreen = pow2(Math.max(512, canvasPx));
  const byMemory = 2 ** Math.floor(Math.log2(Math.sqrt(ceilingBytes / 16 / (4 * 4 / 3))));
  return Math.max(512, Math.min(byScreen, byMemory, gpuMax));
}

/** A root transform that puts the tileset on the Earth: a translation over 1 km */
export const onEarth = (m: number[] | null | undefined): boolean =>
  !!m && m.length === 16 && Math.hypot(Number(m[12]), Number(m[13]), Number(m[14])) >= 1000;
