// Synchronous SHA-1, shared. It lived inside `em-data.ts` (uuid5 for the rows
// it mints); the place of a site needs it too — `sitePlaceId` in `hdto.ts`
// computes s3dgraphy's `hdto.site_place_id` inline, during an edit, where
// `crypto.subtle` (asynchronous) cannot be awaited.

/** Synchronous SHA-1 (RFC 3174) — needed because uuid5 is name-based (SHA-1) and
 *  we mint ids inline during an edit. Standard algorithm; not s3Dgraphy logic. */
export function sha1(bytes: Uint8Array): Uint8Array {
  const ml = bytes.length * 8;
  // pad
  const withOne = new Uint8Array(((bytes.length + 8) >> 6) * 64 + 64);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  const dv = new DataView(withOne.buffer);
  dv.setUint32(withOne.length - 4, ml >>> 0, false);
  dv.setUint32(withOne.length - 8, Math.floor(ml / 0x100000000), false);

  let h0 = 0x67452301,
    h1 = 0xefcdab89,
    h2 = 0x98badcfe,
    h3 = 0x10325476,
    h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rotl = (n: number, s: number) => (n << s) | (n >>> (32 - s));

  for (let i = 0; i < withOne.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
    for (let j = 16; j < 80; j++)
      w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (rotl(a, 5) + f + e + k + w[j]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const od = new DataView(out.buffer);
  od.setUint32(0, h0, false);
  od.setUint32(4, h1, false);
  od.setUint32(8, h2, false);
  od.setUint32(12, h3, false);
  od.setUint32(16, h4, false);
  return out;
}

/** The hex digest of a UTF-8 string. */
export function sha1Hex(text: string): string {
  return Array.from(sha1(new TextEncoder().encode(text)),
                    (x) => x.toString(16).padStart(2, "0")).join("");
}
