/**
 * MICRO-PROVA-DEV48 p.2 · the coverage of a tileset, on its LEAF tiles.
 *
 * Measured on Templu Mare (report 2026-10-17-emstudio-prova-dev48): the root of
 * `RB/cesium/TempluMare/tileset.json` declares a cube of 98.3 m (a `box` with
 * half-axes of 49.152) — the power-of-two grid of the exporter, not the outline
 * of the survey, whose models stand 7 m high. Measured against that cube the
 * tileset's IoU with the 11 survey models of XX sec was 0.02. The leaves are
 * the survey: their union is the models' to the decimetre (EM Tools measured
 * it this morning, 5,476 leaves, `container_alternative.py`).
 *
 * So: the `tileset.json` and the external ones it calls are read — no tile is
 * loaded — the `transform`s are composed down the tree, and each leaf gives its
 * `content.boundingVolume` (tight) or its own. A `box` and a `sphere` become an
 * axis-aligned box; a `region` (geographic) cannot, and is counted apart. An
 * external `tileset.json` that cannot be read leaves its tile's own volume (the
 * coarsest), and says which.
 *
 * Pure: the caller gives the reader of a JSON by URL (the renderer's own road,
 * so a `.3tz` and a room's store are read as the tiles are). The frame is the
 * tileset's (Z up); the caller turns it.
 */

export type Box = [[number, number, number], [number, number, number]];

export interface LeafResult {
  /** the leaves' boxes, in the tileset's frame (Z up) */
  boxes: Box[];
  /** how many tiles were read, how many leaves */
  tiles: number;
  leaves: number;
  /** the external tileset.json that could not be read (their tile's own volume stands) */
  unread: string[];
  /** leaves with a `region` volume (geographic): not measured */
  regions: number;
}

type M4 = number[];   // column-major, as 3D Tiles writes it
const ID: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a: M4, b: M4): M4 => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
const apply = (m: M4, p: number[]): [number, number, number] => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
const boxOfPoints = (pts: number[][]): Box => [
  [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]))) as Box[0],
  [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i]))) as Box[1],
];

/** A bounding volume as an axis-aligned box under `m`; null for a region (or nothing). */
export function volumeBox(bv: Record<string, unknown> | undefined, m: M4 = ID): Box | null {
  const b = bv?.box as number[] | undefined;
  if (Array.isArray(b) && b.length === 12) {
    const [cx, cy, cz, ax, ay, az, bx, by, bz, qx, qy, qz] = b;
    const pts: number[][] = [];
    for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1])
      pts.push(apply(m, [cx + i * ax + j * bx + k * qx, cy + i * ay + j * by + k * qy, cz + i * az + j * bz + k * qz]));
    return boxOfPoints(pts);
  }
  const s = bv?.sphere as number[] | undefined;
  if (Array.isArray(s) && s.length === 4) {
    const [x, y, z, r] = s;
    const pts: number[][] = [];
    for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) pts.push(apply(m, [x + i * r, y + j * r, z + k * r]));
    return boxOfPoints(pts);
  }
  return null;
}

/** The leaves of the tileset at `url`; `readJson` reads a tileset.json (null: unreadable). */
export async function readLeaves(url: string, readJson: (url: string) => Promise<Record<string, unknown> | null>): Promise<LeafResult | null> {
  const root = await readJson(url);
  if (!root?.root) return null;
  const out: LeafResult = { boxes: [], tiles: 0, leaves: 0, unread: [], regions: 0 };
  const isJson = (u: string) => /\.json(?:[?#]|$)/i.test(u);
  const visit = async (tile: Record<string, unknown>, parent: M4, base: string): Promise<void> => {
    out.tiles++;
    const tf = tile.transform as number[] | undefined;
    const m = Array.isArray(tf) && tf.length === 16 ? mul(parent, tf) : parent;
    const kids = (tile.children as Array<Record<string, unknown>> | undefined) ?? [];
    const content = (tile.content ?? (tile.contents as unknown[] | undefined)?.[0]) as Record<string, unknown> | undefined;
    const uri = String(content?.uri ?? content?.url ?? "");
    if (uri && isJson(uri)) {
      // an external tileset: its root under this tile
      const ext = new URL(uri, base).href;
      const j = await readJson(ext);
      const r = j?.root as Record<string, unknown> | undefined;
      if (r) { await visit(r, m, ext); return; }
      out.unread.push(uri);
    }
    if (kids.length && !(uri && isJson(uri))) { for (const c of kids) await visit(c, m, base); return; }
    out.leaves++;
    const box = volumeBox(content?.boundingVolume as Record<string, unknown> | undefined, m)
      ?? volumeBox(tile.boundingVolume as Record<string, unknown> | undefined, m);
    if (box) out.boxes.push(box); else out.regions++;
  };
  await visit(root.root as Record<string, unknown>, ID, url);
  return out;
}

/** The tileset's frame (Z up, Blender's) turned to three's (Y up): x, y, z → x, z, −y. */
export function zUpToYUp(b: Box): Box {
  return [[b[0][0], b[0][2], -b[1][1]], [b[1][0], b[1][2], -b[0][1]]];
}

/** The box around boxes. */
export function envelope(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  return [[0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]))) as Box[0],
          [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]))) as Box[1]];
}

const vol = (b: Box) => Math.max(0, b[1][0] - b[0][0]) * Math.max(0, b[1][1] - b[0][1]) * Math.max(0, b[1][2] - b[0][2]);
/** Intersection over union of two boxes. */
export function iou(a: Box, b: Box): number {
  const i: Box = [[0, 1, 2].map((k) => Math.max(a[0][k], b[0][k])) as Box[0], [0, 1, 2].map((k) => Math.min(a[1][k], b[1][k])) as Box[1]];
  const iv = vol(i);
  return iv / Math.max(1e-12, vol(a) + vol(b) - iv);
}

/**
 * How much of a model's FOOTPRINT the leaves cover — EM Tools' rule
 * (`container_alternative.py`, 17 Oct 2026), in three's frame (Y up, the plan
 * is x–z): the model's box sampled on a 10 × 10 grid in plan; a sample is
 * covered when a leaf contains it in plan (± 0.25 m) and meets the model's
 * height. Not a share of volume: a survey is a skin, its box mostly air (EM
 * Tools measured 0.20 for the lawn, which the tileset certainly holds).
 */
export const FOOT_GRID = 10;
export const FOOT_TOL = 0.25;
export const FOOT_IN = 0.5;
export function footprintShare(model: Box, leaves: readonly Box[]): number {
  const [lo, hi] = model;
  const near = leaves.filter((l) => l[0][0] - FOOT_TOL <= hi[0] && l[1][0] + FOOT_TOL >= lo[0]
    && l[0][2] - FOOT_TOL <= hi[2] && l[1][2] + FOOT_TOL >= lo[2] && l[0][1] <= hi[1] && l[1][1] >= lo[1]);
  if (!near.length) return 0;
  let hit = 0;
  for (let i = 0; i < FOOT_GRID; i++) for (let j = 0; j < FOOT_GRID; j++) {
    const x = lo[0] + (hi[0] - lo[0]) * (i + 0.5) / FOOT_GRID;
    const z = lo[2] + (hi[2] - lo[2]) * (j + 0.5) / FOOT_GRID;
    if (near.some((l) => l[0][0] - FOOT_TOL <= x && x <= l[1][0] + FOOT_TOL && l[0][2] - FOOT_TOL <= z && z <= l[1][2] + FOOT_TOL)) hit++;
  }
  return hit / (FOOT_GRID * FOOT_GRID);
}

/**
 * The coverage of a tileset against models, measured on its leaves: the IoU of
 * the leaves' envelope with the models' envelope, and which models stand in
 * it (footprint ≥ FOOT_IN). «whole» from `sameIou` (s3Dgraphy's
 * SAME_COVERAGE_IOU), «more» when every model is in and the leaves reach
 * farther, else «partial».
 */
export function leafCoverage(leaves: readonly Box[], models: ReadonlyMap<string, Box>, sameIou: number):
  { coverage: "whole" | "partial" | "more"; iou: number; inside: string[]; envelope: Box } | null {
  const env = envelope(leaves);
  const menv = envelope([...models.values()]);
  if (!env || !menv) return null;
  const v = iou(env, menv);
  const inside = [...models].filter(([, b]) => footprintShare(b, leaves) >= FOOT_IN).map(([id]) => id).sort();
  return { coverage: v >= sameIou ? "whole" : inside.length === models.size ? "more" : "partial", iou: v, inside, envelope: env };
}
