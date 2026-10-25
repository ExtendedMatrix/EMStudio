/**
 * MICRO tileset, shift e epoche (E.D., 25 Oct 2026) · THE FRAME OF A FILE —
 * «the coordinates of this file are CRS X minus shift S» (s3Dgraphy nodes
 * datamodel 1.6.38, `data.frame` on a resource, an RM or an RM container;
 * `s3dgraphy.geometry.frame`).
 *
 * Many surveys export SHIFTED coordinates declared in the project's CRS: the
 * Basilica Iulia's RealityScan tileset (E−291407 N−4640813 written as
 * EPSG:6708) falls on the equator. The frame is a READING: the Space relocates
 * the tileset — the bridge reads the root's transform back to the shifted
 * coordinates by the inverse of the same projection, adds the shift and fits the
 * true transform (PROJ, `/geo/tileset-frame`, s3Dgraphy's `relocate_transform`)
 * — and the file is never rewritten.
 *
 * Pure but for `relocation` (one fetch per tileset and frame, kept): the
 * reading of the frame, where it is looked for (s3Dgraphy's `frame_of` order:
 * the resource, its asset, its hat), the frame of the study to land in.
 */

export interface FileFrame {
  crs: string | null;
  shift: [number, number, number];
  note?: string;
  source?: "manual" | "graph" | "file";
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** `6708`, `"epsg:6708"` → `"EPSG:6708"`; another authority as written; empty → null */
export function normaliseCrs(crs: unknown): string | null {
  if (crs === null || crs === undefined || crs === "") return null;
  if (typeof crs === "number") return `EPSG:${Math.trunc(crs)}`;
  const s = String(crs).trim();
  if (/^\d+$/.test(s)) return `EPSG:${Number(s)}`;
  const i = s.indexOf(":");
  return i > 0 ? `${s.slice(0, i).trim().toUpperCase()}:${s.slice(i + 1).trim()}` : s;
}

/** s3Dgraphy's `read_frame`: the frame in a node's data, tolerant; null when
 *  there is none or it says nothing (no CRS and no shift) */
export function readFrame(data: Record<string, unknown> | null | undefined): FileFrame | null {
  const f = (data ?? {}).frame as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return null;
  let sh: unknown[] = [];
  if (Array.isArray(f.shift)) sh = f.shift;
  else if (f.shift && typeof f.shift === "object") { const o = f.shift as Record<string, unknown>; sh = [o.x, o.y, o.z]; }
  else sh = [f.shift_x, f.shift_y, f.shift_z];
  const shift = [0, 1, 2].map((i) => num(sh[i]) ?? 0) as [number, number, number];
  const crs = normaliseCrs(f.crs ?? f.epsg);
  if (crs === null && !shift.some((v) => v !== 0)) return null;
  const out: FileFrame = { crs, shift };
  if (f.note) out.note = String(f.note);
  if (f.source === "manual" || f.source === "graph" || f.source === "file") out.source = f.source;
  return out;
}

/** the frame to write: numbers, never strings (`make_frame`); null = remove */
export function makeFrame(crs: unknown, shift: unknown[], note = "", source?: FileFrame["source"]): FileFrame {
  const out: FileFrame = { crs: normaliseCrs(crs), shift: [0, 1, 2].map((i) => num(shift[i]) ?? 0) as [number, number, number] };
  if (note) out.note = note;
  if (source) out.source = source;
  return out;
}

/** The first node, in s3Dgraphy's order (the resource, its asset, its hat),
 *  whose data says a frame */
export function frameAmong(ids: Array<string | null | undefined>,
                           dataOf: (id: string) => Record<string, unknown> | null | undefined): { frame: FileFrame; from: string } | null {
  for (const id of ids) {
    if (!id) continue;
    const f = readFrame(dataOf(id));
    if (f) return { frame: f, from: id };
  }
  return null;
}

/** The frame the Space lands in: the study's (its GeoPositionNode: a CRS and a
 *  shift) when it declares a CRS; otherwise the file's own shifted grid — the
 *  frame the models exported with the same shift are in (`own: true`). */
export function studyTarget(geo: Record<string, unknown> | null | undefined, frame: FileFrame):
    { crs: string; shift: [number, number, number]; own: boolean } | null {
  const crs = normaliseCrs(geo?.epsg);
  if (crs) return { crs, shift: [num(geo?.shift_x) ?? 0, num(geo?.shift_y) ?? 0, num(geo?.shift_z) ?? 0], own: false };
  if (!frame.crs) return null;
  return { crs: frame.crs, shift: frame.shift, own: true };
}

/** What a frame and its landing say, as one key (a layer relocated again only
 *  when it changes) */
export const frameKey = (f: FileFrame | null, target: { crs: string; shift: number[] } | null): string =>
  f && target ? `${f.crs}|${f.shift.join(",")}>${target.crs}|${target.shift.join(",")}` : "";

export interface Relocation {
  ok: boolean;
  /** column-major, the tileset's own frame → the study's (Z-up) */
  transform?: number[];
  residual_rms_m?: number;
  residual_max_m?: number;
  error?: string;
  /** who computed it: the bridge (PROJ) or the browser (`relocateInBrowser`) */
  via?: "bridge" | "browser";
  /** the bridge's refusal, when the browser answered in its place */
  bridgeError?: string;
}

const asked = new Map<string, Promise<Relocation>>();

/** the browser's relocation in place of the bridge's refusal, or the refusal */
function browserOr(refused: Relocation, root: { transform: number[] | null; boundingVolume: unknown },
                   frame: FileFrame, target: { crs: string; shift: number[] }): Relocation {
  const b = relocateInBrowser(root, frame, target);
  return b.ok ? { ...b, bridgeError: refused.error } : refused;
}

/** The bridge's relocation of a root (`/geo/tileset-frame`), asked once per
 *  root, frame and target. No bridge, or one that cannot (old, no pyproj):
 *  the browser's (`relocateInBrowser`) when the projection is one it knows,
 *  else the refusal — and the layer is centred, upright. */
export function relocation(base: string | null, root: { transform: number[] | null; boundingVolume: unknown },
                           frame: FileFrame, target: { crs: string; shift: number[] }): Promise<Relocation> {
  if (!base) return Promise.resolve(browserOr({ ok: false, error: "no-bridge" }, root, frame, target));
  if (!root.transform || root.transform.length !== 16) return Promise.resolve({ ok: false, error: "no-transform" });
  const k = `${base}|${root.transform.join(",")}|${frameKey(frame, target)}`;
  let p = asked.get(k);
  if (!p) {
    p = fetch(`${base}/geo/tileset-frame`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transform: root.transform, bounding_volume: root.boundingVolume, frame, target }) })
      .then(async (r): Promise<Relocation> => {
        if (r.status === 404) return { ok: false, error: "old-bridge" };
        const j = await r.json().catch(() => null) as Relocation | null;
        return j ? (j.ok ? { ...j, via: "bridge" } : j) : { ok: false, error: `HTTP ${r.status}` };
      })
      .catch((e): Relocation => ({ ok: false, error: String((e as Error)?.message ?? e) }))
      // MICRO tileset dritto e nitido · a bridge that cannot (the Lab's sidecar
      // without pyproj, an old one, none): the browser's reading, when it can
      .then((r) => r.ok ? r : browserOr(r, root, frame, target));
    p.then((r) => { if (!r.ok) asked.delete(k); });
    asked.set(k, p);
  }
  return p;
}

// ── the relocation in the browser (MICRO tileset dritto e nitido) ───────────
//
// The Lab's bridge (its sidecar, without pyproj) answered «a dependency is
// missing», the layer was drawn as written — on the equator, its up along the
// Earth's radius there: the Forum's floor stood vertical (88°, measured). The
// same reading for the projections a survey uses most — a Transverse Mercator
// on GRS80/WGS84 (UTM, RDN2008, ETRS89) — is done here, with the bridge's
// points and fit: the root's volume through the written transform to ECEF,
// to latitude and longitude, through the SAME projection to the shifted grid,
// plus the shift, minus the study's (the convergence and the scale of the grid
// are in the projection). Measured against the bridge on the Basilica's root:
// 2 nm apart. Another projection, or another projection for the study, needs
// the bridge (PROJ).

/** A Transverse Mercator the browser can compute: lon0 (°), k0, false easting, false northing */
export interface TmParams { lon0: number; k0: number; fe: number; fn: number }

/** The TM of an EPSG code the browser knows (GRS80 or WGS84: 1 mm apart), or null */
export function tmParams(crs: string | null | undefined): TmParams | null {
  const m = /^EPSG:(\d+)$/.exec(normaliseCrs(crs) ?? "");
  if (!m) return null;
  const c = Number(m[1]);
  const utm = (zone: number, south = false): TmParams => ({ lon0: -183 + 6 * zone, k0: 0.9996, fe: 500000, fn: south ? 10000000 : 0 });
  if (c >= 32601 && c <= 32660) return utm(c - 32600);          // WGS 84 / UTM nN
  if (c >= 32701 && c <= 32760) return utm(c - 32700, true);    // WGS 84 / UTM nS
  if (c >= 25828 && c <= 25838) return utm(c - 25800);          // ETRS89 / UTM nN
  if (c >= 3040 && c <= 3049) return utm(c - 3012);             // ETRS89 / UTM 28–37N (N-E)
  if (c >= 6707 && c <= 6709) return utm(c - 6675);             // RDN2008 / UTM 32–34N (N-E)
  if (c >= 7791 && c <= 7793) return utm(c - 7759);             // RDN2008 / UTM 32–34N
  if (c === 6875) return { lon0: 12, k0: 0.9985, fe: 7000000, fn: 0 };   // RDN2008 / Italy zone (N-E)
  return null;
}

const GA = 6378137.0, GF = 1 / 298.257222101, GE2 = GF * (2 - GF);

function geodetic(x: number, y: number, z: number): [number, number, number] {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - GE2)), h = 0;
  for (let i = 0; i < 10; i++) {
    const n = GA / Math.sqrt(1 - GE2 * Math.sin(lat) ** 2);
    h = p / Math.cos(lat) - n;
    lat = Math.atan2(z, p * (1 - GE2 * n / (n + h)));
  }
  return [lat, lon, h];
}

/** Krüger's series to n⁴ (Karney 2011): sub-millimetre within a zone */
export function tmForward(latRad: number, lonRad: number, q: TmParams): [number, number] {
  const n = GF / (2 - GF), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
  const big = GA / (1 + n) * (1 + n2 / 4 + n4 / 64);
  const al = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180, 13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440,
    61 * n3 / 240 - 103 * n4 / 140, 49561 * n4 / 161280];
  const e = Math.sqrt(GE2);
  const dl = lonRad - q.lon0 * Math.PI / 180;
  const t = Math.sinh(Math.atanh(Math.sin(latRad)) - e * Math.atanh(e * Math.sin(latRad)));
  const xi = Math.atan2(t, Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  for (let j = 1; j <= 4; j++) {
    E += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    N += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  return [q.fe + q.k0 * big * E, q.fn + q.k0 * big * N];
}

const apply = (m: number[], p: number[]): [number, number, number] =>
  [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]) as [number, number, number];

/** k³ points of the root's volume (a box, or a sphere's cube), in the tileset's own frame */
function volumePoints(bv: unknown, k: number): number[][] | null {
  const v = (bv ?? {}) as Record<string, unknown>;
  let c: number[], ax: number[][];
  if (Array.isArray(v.box) && v.box.length === 12) {
    const b = v.box.map(Number);
    c = b.slice(0, 3); ax = [b.slice(3, 6), b.slice(6, 9), b.slice(9, 12)];
  } else if (Array.isArray(v.sphere) && v.sphere.length === 4) {
    const s = v.sphere.map(Number);
    c = s.slice(0, 3); ax = [[s[3], 0, 0], [0, s[3], 0], [0, 0, s[3]]];
  } else return null;
  const out: number[][] = [];
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) {
    const s = [i, j, l].map((x) => -1 + 2 * x / (k - 1));
    out.push([0, 1, 2].map((d) => c[d] + s[0] * ax[0][d] + s[1] * ax[1][d] + s[2] * ax[2][d]));
  }
  return out;
}

/** the affine P → Q of least squares (column-major 4×4) */
function fitAffine(P: number[][], Q: number[][]): number[] {
  const M = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const B = [0, 1, 2].map(() => [0, 0, 0, 0]);
  // centred, for the conditioning (the grid's numbers can be large)
  const pc = [0, 1, 2].map((d) => P.reduce((s, p) => s + p[d], 0) / P.length);
  for (let i = 0; i < P.length; i++) {
    const x = [P[i][0] - pc[0], P[i][1] - pc[1], P[i][2] - pc[2], 1];
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) M[a][b] += x[a] * x[b];
      for (let r = 0; r < 3; r++) B[r][a] += x[a] * Q[i][r];
    }
  }
  const solve = (rhs: number[]): number[] => {
    const a = M.map((r, i) => [...r, rhs[i]]);
    for (let i = 0; i < 4; i++) {
      let p = i;
      for (let r = i + 1; r < 4; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
      [a[i], a[p]] = [a[p], a[i]];
      for (let r = 0; r < 4; r++) if (r !== i) { const f = a[r][i] / a[i][i]; for (let c = i; c <= 4; c++) a[r][c] -= f * a[i][c]; }
    }
    return a.map((r, i) => r[4] / r[i]);
  };
  const rows = [0, 1, 2].map((r) => solve(B[r]));
  // x' = L (x − pc) + t  →  L x + (t − L pc)
  const t = rows.map((r) => r[3] - (r[0] * pc[0] + r[1] * pc[1] + r[2] * pc[2]));
  return [rows[0][0], rows[1][0], rows[2][0], 0, rows[0][1], rows[1][1], rows[2][1], 0,
          rows[0][2], rows[1][2], rows[2][2], 0, t[0], t[1], t[2], 1];
}

/** The relocation the bridge would answer, computed here when both frames are
 *  a Transverse Mercator the browser knows, with the same parameters; `ok:
 *  false` (and why) otherwise. */
export function relocateInBrowser(root: { transform: number[] | null; boundingVolume: unknown },
                                  frame: FileFrame, target: { crs: string; shift: number[] }): Relocation {
  if (!root.transform || root.transform.length !== 16) return { ok: false, error: "no-transform" };
  const q = tmParams(frame.crs), qt = tmParams(target.crs);
  if (!q || !qt) return { ok: false, error: "crs-needs-bridge" };
  if (q.lon0 !== qt.lon0 || q.k0 !== qt.k0 || q.fe !== qt.fe || q.fn !== qt.fn) return { ok: false, error: "crs-needs-bridge" };
  const W = root.transform.map(Number);
  const P = volumePoints(root.boundingVolume, 3), V = volumePoints(root.boundingVolume, 5);
  if (!P || !V) return { ok: false, error: "no-volume" };
  const ts = [0, 1, 2].map((i) => Number(target.shift[i] ?? 0) || 0);
  const to = (p: number[]): number[] => {
    const [lat, lon, h] = geodetic(...apply(W, p));
    const [E, N] = tmForward(lat, lon, q);
    return [E + frame.shift[0] - ts[0], N + frame.shift[1] - ts[1], h + frame.shift[2] - ts[2]];
  };
  const T = fitAffine(P, P.map(to));
  let max = 0, sq = 0;
  for (const p of V) {
    const a = apply(T, p), b = to(p);
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    max = Math.max(max, d); sq += d * d;
  }
  // a fit worse than 5 cm is not a frame this reading explains
  if (!(max < 0.05)) return { ok: false, error: "fit", residual_max_m: max };
  return { ok: true, transform: T, residual_max_m: max, residual_rms_m: Math.sqrt(sq / V.length), via: "browser" };
}
