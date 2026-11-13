// MICRO-MEMORIA-SESSIONE p.1 · the guard of memory (E.D., 30 Oct 2026, (c): «EMStudio
// che esaurisce la memoria caricando un modello pesante si ricarica e perde il
// grafo»). Before a model or a tileset is loaded, its weight in the page is
// ESTIMATED from what the graph knows (the file's size, its triangles, its
// texture, a cloud's points) and set against two numbers: the ceiling of the
// Preferences (the scene's memory) and what the machine has free (the bridge
// says it, when there is one). What does not fit is not loaded: the scene
// proposes the version that fits, or asks — instead of letting the WebView fall.
// Pure (no three, no DOM): `scripts/check-memory-guard.mjs`.

export const MB = 1024 * 1024;

/** what is known of a file to draw */
export interface Weight {
  bytes?: number | null;
  tris?: number | null;
  points?: number | null;
  /** the side of its textures (px) and how many */
  textureSide?: number | null;
  textures?: number | null;
}

/** MICRO-3DTILES's measure (`settings.ts`, `misura-soglia.txt`): a whole glb
 *  costs THREE TIMES its size in the page. Its geometry, unpacked, ~64 B a
 *  triangle (positions, normals, uv and the index, in the page AND on the GPU:
 *  a Draco file is small and its triangles are not). A texture, 4 B a pixel with
 *  its mipmaps (×4/3), decoded once in the page and once on the GPU. A cloud,
 *  ~46 B a point (10 M → 458 MB, measured). The largest of the three readings. */
export const PER_FILE = 3;
export const PER_TRI = 64;
export const PER_POINT = 46;

export function estimateMb(w: Weight): number | null {
  const bytes = num(w.bytes), tris = num(w.tris), pts = num(w.points);
  const side = num(w.textureSide), nTex = num(w.textures) ?? (side ? 1 : 0);
  const byFile = bytes != null ? bytes * PER_FILE : null;
  const tex = side ? side * side * 4 * (4 / 3) * 2 * Math.max(1, nTex ?? 1) : 0;
  const byGeom = tris != null ? tris * PER_TRI + tex : null;
  const byPts = pts != null ? pts * PER_POINT : null;
  const all = [byFile, byGeom, byPts].filter((x): x is number => x != null);
  if (!all.length) return null;
  return Math.ceil(Math.max(...all) / MB);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** The ceiling's default: a QUARTER of the machine's memory, between 1 and 4 GB
 *  (8 GB → 2 GB). A WebView is one process among the system's, the editor's and
 *  the browser's: the tiles' ceiling is an eighth (`machineTilesMemoryMB`), the
 *  whole scene twice that. Unknown memory: 8 GB, as for the tiles. */
export function sceneMemoryDefaultMB(totalMb?: number | null): number {
  const t = num(totalMb) ?? 8192;
  return Math.max(1024, Math.min(4096, Math.round(t / 4)));
}

/** what the machine keeps for itself: never counted as free for the page */
export const MACHINE_MARGIN_MB = 512;

export interface Room {
  ok: boolean;
  /** MB still free for the scene, by the tighter of the two */
  room: number;
  /** which one decided: the Preferences' ceiling, or the machine */
  by: "ceiling" | "machine";
}

/** Does `needMb` fit, with `residentMb` already drawn? The ceiling counts what
 *  the scene holds; the machine's free memory already has it taken away (it is
 *  in the page), so only its margin is kept. Unknown free memory: the ceiling. */
export function roomFor(residentMb: number, needMb: number, ceilingMb: number, availableMb: number | null): Room {
  const byCeil = ceilingMb - residentMb;
  const byMach = availableMb == null ? Infinity : availableMb - MACHINE_MARGIN_MB;
  const room = Math.floor(Math.min(byCeil, byMach));
  return { ok: needMb <= room, room: Math.max(0, room), by: byMach < byCeil ? "machine" : "ceiling" };
}

/** the heaviest candidate that fits in `room` (the version to propose), or null */
export function lighterThatFits<T extends { est: number | null }>(cands: T[], room: number): T | null {
  const fit = cands.filter((c) => c.est != null && c.est <= room).sort((a, b) => (b.est ?? 0) - (a.est ?? 0));
  return fit[0] ?? null;
}

/** «1,2 GB», «340 MB» */
export function mbSay(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

// MICRO-PIU-FONTI · the guard counts EVERY source open (E.D., 7 Nov 2026): a
// room and two files open together are three documents in the page, each with
// its undo, and the scene's room is what is left of the ceiling after them.
/** one open graph: its document's JSON, and how many undo snapshots it holds */
export interface SourceWeight { bytes: number; undo: number }
/** A document in the page costs ~4× its JSON (objects, strings, the indexes
 *  the views build on it); an undo step is one JSON snapshot of the graph
 *  (`model.ts::take`), kept as a string (2 B a character, at worst). */
export const PER_DOC = 4;
export const PER_SNAPSHOT = 2;
export function sourcesMb(list: SourceWeight[]): number {
  let b = 0;
  for (const s of list) {
    const bytes = num(s.bytes) ?? 0;
    b += bytes * PER_DOC + bytes * PER_SNAPSHOT * Math.max(0, Math.floor(s.undo || 0));
  }
  return Math.ceil(b / MB);
}
