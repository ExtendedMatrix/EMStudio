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
}

const asked = new Map<string, Promise<Relocation>>();

/** The bridge's relocation of a root (`/geo/tileset-frame`), asked once per
 *  root, frame and target. `base` null → no bridge: said, nothing moved. */
export function relocation(base: string | null, root: { transform: number[] | null; boundingVolume: unknown },
                           frame: FileFrame, target: { crs: string; shift: number[] }): Promise<Relocation> {
  if (!base) return Promise.resolve({ ok: false, error: "no-bridge" });
  if (!root.transform || root.transform.length !== 16) return Promise.resolve({ ok: false, error: "no-transform" });
  const k = `${base}|${root.transform.join(",")}|${frameKey(frame, target)}`;
  let p = asked.get(k);
  if (!p) {
    p = fetch(`${base}/geo/tileset-frame`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transform: root.transform, bounding_volume: root.boundingVolume, frame, target }) })
      .then(async (r) => {
        if (r.status === 404) return { ok: false, error: "old-bridge" };
        const j = await r.json().catch(() => null) as Relocation | null;
        return j ?? { ok: false, error: `HTTP ${r.status}` };
      })
      .catch((e) => ({ ok: false, error: String((e as Error)?.message ?? e) }));
    p.then((r) => { if (!r.ok) asked.delete(k); });
    asked.set(k, p);
  }
  return p;
}
