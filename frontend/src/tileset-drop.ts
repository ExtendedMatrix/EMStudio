/**
 * MICRO-TILESET-CARTELLA (E.D., 25 Oct 2026) · a tileset is handed over as it
 * is — a folder, a zip, a .3tz — dropped on the Viewer or on the Scene, seen at
 * once, attached to an epoch on the spot.
 *
 * The case that asked for it: the Basilica Iulia, out of RealityScan 2.2 as
 * `tileset_Basilica_TLS_ED.json` BESIDE the folder `tileset_Basilica_TLS_ED/`
 * (Geometry/*.b3dm and 272 `tileset_lod*.json`), the root's contents written
 * `tileset_Basilica_TLS_ED/Geometry/lod5_0.b3dm` — no `tileset.json` anywhere.
 * The forms recognised are EM Tools' (`rm_manager/tileset_shape.py`), said in
 * the same words:
 *
 *   · `package`     a .3tz / .zip with `tileset.json` (at its root or in one folder);
 *   · `folder`      a folder with `tileset.json` at its root;
 *   · `pair`        the RealityScan form: `X.json` (with a `root`) beside `X/`
 *                   — dropped together, or the folder that holds both;
 *   · `zip_pair`    a zip holding `X.json` and `X/`;
 *   · `zip_no_root` a zip holding `X/` alone, its `X.json` dropped with it;
 *   · `unknown`     the sentence says what is inside.
 *
 * Whatever the form, the tileset is served to the renderer as ONE tree with
 * `tileset.json` at its root (`servedSource`): the root's bytes for
 * `tileset.json`, the rest as the root names it. Nothing is copied: a dropped
 * file is a Blob read by slices, a zip by ranges (`tiles3tz.ts`), a folder on
 * disk through the bridge.
 *
 * WHERE IT FALLS · the root's `transform` read as ECEF → WGS84. The Basilica's
 * says lat 0.0001°, lon 10.51°, h 3.7 m: the Gulf of Guinea — the survey's
 * projected coordinates written as geocentric. Nothing is corrected; the
 * preview CENTRES it for the view only (the root's transform left out of what
 * is served when it puts the tileset on the Earth) and says so.
 *
 * Pure (no three, no DOM beyond Blob): `scripts/check-tileset-drop.mjs`.
 */
import { addResource, type ResourceGraph } from "./resources";
import { Archive3tz, ZipArchive, blobSource, gunzipIfGzip, type ByteSource } from "./tiles3tz";
import type { EmNode } from "./types";

export const ENTRY = "tileset.json";

export type TilesetForm = "package" | "folder" | "pair" | "zip_pair" | "zip_no_root" | "unknown";

/** A tree of files: what is directly under a folder (`""` the top; a folder
 *  ends with `/`), and a file's bytes. */
export interface TreeSource {
  kind: "files" | "zip" | "bridge" | "mixed";
  list(dir: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array | null>;
}

/** The reader the tiles engine is handed: a path of the SERVED tree (with
 *  `tileset.json` at its root) → bytes. `Tiles3tzPlugin` takes it as it takes
 *  an archive. */
export interface TilesetReader { readEntry(path: string): Promise<Uint8Array | null> }

const TILE_EXT = /\.(b3dm|glb|gltf|i3dm|pnts|cmpt|subtree)$/i;

// ── trees ────────────────────────────────────────────────────────────────────

function listFrom(paths: Iterable<string>): (dir: string) => Promise<string[]> {
  const byDir = new Map<string, Set<string>>();
  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const dir = parts.slice(0, i).map((x) => `${x}/`).join("");
      const name = i === parts.length - 1 ? parts[i] : `${parts[i]}/`;
      (byDir.get(dir) ?? byDir.set(dir, new Set()).get(dir)!).add(name);
    }
  }
  return async (dir) => [...(byDir.get(dir) ?? [])].sort();
}

/** Files dropped from the system (or picked): `path` relative to the drop,
 *  `/`-separated, the folder's name first (`F/tileset.json`). */
export function filesTree(files: Array<{ path: string; blob: Blob }>): TreeSource {
  const map = new Map(files.map((f) => [f.path.replace(/^\/+/, ""), f.blob]));
  return {
    kind: "files",
    list: listFrom(map.keys()),
    read: async (p) => {
      const b = map.get(p);
      return b ? new Uint8Array(await b.arrayBuffer()) : null;
    },
  };
}

/** A zip or a .3tz, read by ranges: a canonical 3tz by its index when it has
 *  one, any zip by its central directory. */
export async function zipTree(src: ByteSource): Promise<TreeSource & { archive: ZipArchive }> {
  const z = await ZipArchive.open(src);
  return { kind: "zip", archive: z, list: listFrom(z.names()), read: (p) => z.readEntry(p) };
}

/** Several trees as one (a zip and the root dropped beside it). */
export function unionTree(...trees: TreeSource[]): TreeSource {
  return {
    kind: "mixed",
    list: async (dir) => [...new Set((await Promise.all(trees.map((t) => t.list(dir)))).flat())].sort(),
    read: async (p) => {
      for (const t of trees) { const b = await t.read(p); if (b) return b; }
      return null;
    },
  };
}

/** A folder on disk through the bridge: `list` = `/fs/list`, `read` = `/fs/file`
 *  (both handed in, so this stays pure). */
export function bridgeTree(root: string, fns: {
  list: (abs: string) => Promise<Array<{ name: string; type: string }>>;
  read: (abs: string) => Promise<Uint8Array | null>;
}): TreeSource {
  const abs = (p: string) => `${root.replace(/\/+$/, "")}/${p}`.replace(/\/+$/, "");
  return {
    kind: "bridge",
    list: async (dir) => {
      try {
        return (await fns.list(abs(dir))).map((e) => (e.type === "dir" ? `${e.name}/` : e.name)).sort();
      } catch { return []; }
    },
    read: (p) => fns.read(abs(p)),
  };
}

// ── what it is ───────────────────────────────────────────────────────────────

export interface Recognised {
  form: TilesetForm;
  /** usable as it is: a package, or a folder with tileset.json */
  ready: boolean;
  /** a package can be written from it (a folder, the RealityScan forms) */
  preparable: boolean;
  /** the tileset's name (the root's, the folder's, the file's) */
  name: string;
  /** the sentence the bar shows (or the error), in English as EM Tools' */
  says: string;
  /** the path in the tree that is served as `tileset.json`, and the folder the
   *  root's contents are read under */
  entry: string;
  prefix: string;
  root: Record<string, unknown> | null;
}

const decode = (b: Uint8Array | null): Record<string, unknown> | null => {
  if (!b) return null;
  try {
    const d = JSON.parse(new TextDecoder().decode(b).replace(/^﻿/, ""));
    return d && typeof d === "object" && !Array.isArray(d) ? d as Record<string, unknown> : null;
  } catch { return null; }
};
/** a json of the tree, gzipped or not (RealityScan gzips its tiles) */
const readJson = async (tree: TreeSource, p: string) => decode(await gunzipIfGzip(await tree.read(p)));
const isRoot = (d: Record<string, unknown> | null): boolean =>
  !!d && !!d.root && typeof d.root === "object";

async function counts(tree: TreeSource, dir: string): Promise<{ json: number; tiles: number }> {
  let json = 0, tiles = 0;
  const walk = async (d: string, depth: number) => {
    for (const n of await tree.list(d)) {
      if (n.endsWith("/")) { if (depth < 4) await walk(d + n, depth + 1); }
      else if (/\.json$/i.test(n)) json++;
      else if (TILE_EXT.test(n)) tiles++;
    }
  };
  await walk(dir, 0);
  return { json, tiles };
}
async function summary(tree: TreeSource, dir: string): Promise<string> {
  const c = await counts(tree, dir);
  return `${c.json} json, ${c.tiles} tiles`;
}

/**
 * What a tree is. `label` names it in the sentences (the file or folder
 * dropped); `zipped` says the tree is the inside of an archive.
 */
export async function recognise(tree: TreeSource, label: string, zipped = false): Promise<Recognised> {
  const out = (o: Partial<Recognised>): Recognised => ({ form: "unknown", ready: false, preparable: false,
    name: label.replace(/\.(3tz|zip)$/i, ""), says: "", entry: "", prefix: "", root: null, ...o });
  const top = await tree.list("");
  const dirs = top.filter((n) => n.endsWith("/"));
  // 1 · tileset.json at the top
  if (top.includes(ENTRY)) {
    const root = await readJson(tree, ENTRY);
    return zipped
      ? out({ form: "package", ready: true, entry: ENTRY, root, says: `A tileset package (${ENTRY} at its root)` })
      : out({ form: "folder", ready: true, preparable: true, entry: ENTRY, root,
              says: `A tileset folder (${ENTRY} at its root, ${await summary(tree, "")})` });
  }
  // 2 · the RealityScan pair at the top: X.json beside X/
  const pairAt = async (dir: string): Promise<{ x: string; root: Record<string, unknown> } | null> => {
    const here = dir ? await tree.list(dir) : top;
    for (const n of here) {
      const m = /^(.+)\.json$/i.exec(n);
      if (!m || n.toLowerCase() === ENTRY || !here.includes(`${m[1]}/`)) continue;
      const root = await readJson(tree, dir + n);
      if (isRoot(root)) return { x: m[1], root: root! };
    }
    return null;
  };
  const p0 = await pairAt("");
  if (p0) {
    const outside = tree.kind === "mixed";
    const form: TilesetForm = zipped ? (outside ? "zip_no_root" : "zip_pair") : "pair";
    const says = form === "pair"
      ? `The RealityScan form: ${p0.x}.json beside the folder ${p0.x}/ (${await summary(tree, `${p0.x}/`)}), no ${ENTRY}`
      : form === "zip_pair" ? `The RealityScan form inside ${label}: ${p0.x}.json beside ${p0.x}/, no ${ENTRY}`
      : `${label} holds ${p0.x}/ without its root (${ENTRY} is missing); its root ${p0.x}.json came with it (the RealityScan form)`;
    return out({ form, preparable: true, name: p0.x, entry: `${p0.x}.json`, prefix: "", root: p0.root, says });
  }
  // 3 · one folder at the top: tileset.json in it, or the pair in it
  if (dirs.length === 1 && top.length === 1) {
    const d = dirs[0];
    const inner = await tree.list(d);
    if (inner.includes(ENTRY)) {
      const root = await readJson(tree, d + ENTRY);
      return zipped
        ? out({ form: "package", ready: true, entry: d + ENTRY, prefix: d, root, says: `A tileset package (${ENTRY} in ${d})` })
        : out({ form: "folder", ready: true, preparable: true, name: d.slice(0, -1), entry: d + ENTRY, prefix: d, root,
                says: `A tileset folder (${ENTRY} at its root, ${await summary(tree, d)})` });
    }
    const p1 = await pairAt(d);
    if (p1) {
      return out({ form: zipped ? "zip_pair" : "pair", preparable: true, name: p1.x, entry: `${d}${p1.x}.json`, prefix: d, root: p1.root,
        says: `The RealityScan form inside ${d}: ${p1.x}.json beside ${p1.x}/ (${await summary(tree, `${d}${p1.x}/`)}), no ${ENTRY}` });
    }
  }
  // 4 · nothing usable: what is inside, and what to do
  const parts: string[] = [];
  for (const n of top.slice(0, 6)) parts.push(n.endsWith("/") ? `${n} (${await summary(tree, n)})` : n);
  if (top.length > 6) parts.push(`… ${top.length - 6} more`);
  const tiled: string[] = [];
  for (const d of dirs) if ((await counts(tree, d)).tiles > 0) tiled.push(d.slice(0, -1));
  const hint = tiled.length
    ? `; it looks like a RealityScan export without its root: drop ${tiled[0]}.json together with ${zipped ? "the zip" : `${tiled[0]}/`}, or the folder that holds both`
    : `; a tileset package holds ${ENTRY} and the tiles it calls`;
  return out({ says: `No ${ENTRY} in ${label}: it holds ${parts.join(", ") || "nothing"}${hint}` });
}

// ── where it falls ───────────────────────────────────────────────────────────

export const GEOCENTRIC_WARNING = "the coordinates look written as geocentric: re-export from RealityScan with the project's coordinate system";   // ALLOW-IT: English («coordinate system»), the sentence EM Tools says

export interface Position {
  kind: "earth" | "local";
  lat?: number; lon?: number; h?: number;
  translation: [number, number, number] | null;
  warn: boolean;
  line: string;
}

const A = 6378137.0, F = 1 / 298.257223563, E2 = F * (2 - F);

/** WGS84 (lat°, lon°, h m) of an ECEF point (iterative, < 1 mm). */
export function ecefToGeodetic(x: number, y: number, z: number): [number, number, number] {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  if (p < 1e-9) return [z >= 0 ? 90 : -90, 0, Math.abs(z) - A * Math.sqrt(1 - E2)];
  let lat = Math.atan2(z, p * (1 - E2)), h = 0;
  for (let i = 0; i < 10; i++) {
    const n = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
    h = p / Math.cos(lat) - n;
    lat = Math.atan2(z, p * (1 - E2 * n / (n + h)));
  }
  return [lat * 180 / Math.PI, lon * 180 / Math.PI, h];
}

/** Where the root's `transform` puts the tileset — EM Tools' rule: a
 *  translation under 1 km is a local frame; on the Earth, a place within ~1 km
 *  of the equator (the height written as Z), at «null island», or far under or
 *  over the ellipsoid is said to look geocentric. */
export function position(doc: Record<string, unknown> | null): Position {
  const root = doc?.root as Record<string, unknown> | undefined;
  const m = root?.transform;
  if (!Array.isArray(m) || m.length !== 16)
    return { kind: "local", translation: null, warn: false, line: "Position: no transform at the root — a local frame, not placed on the Earth" };
  const t: [number, number, number] = [Number(m[12]), Number(m[13]), Number(m[14])];
  const r = Math.hypot(...t);
  if (r < 1000)
    return { kind: "local", translation: t, warn: false, line: `Position: a local frame (translation ${r.toFixed(1)} m), not placed on the Earth` };
  const [lat, lon, h] = ecefToGeodetic(...t);
  const warn = Math.abs(lat) < 0.01 || (Math.abs(lat) < 0.05 && Math.abs(lon) < 0.05) || h < -500 || h > 10000;
  let line = `Position: lat ${lat.toFixed(4)}°, lon ${lon.toFixed(4)}°, h ${h.toFixed(1)} m (from the root's transform)`;
  if (warn) line += ` — ${GEOCENTRIC_WARNING}`;
  return { kind: "earth", lat, lon, h, translation: t, warn, line };
}

// ── served ───────────────────────────────────────────────────────────────────

/**
 * The tree as the renderer reads it: `tileset.json` = the root's bytes, every
 * other path under the root's folder. `recentre` (the preview's choice, for
 * the VIEW only): a root whose transform puts it on the Earth is served
 * without it — its own frame, centred where its volume says.
 */
export function servedSource(tree: TreeSource, rec: Recognised, recentre: boolean):
    TilesetReader & { served: string[]; firstTileAt: number | null } {
  const served: string[] = [];
  const out = {
    served,
    /** when the first TILE (not a json) was handed to the renderer */
    firstTileAt: null as number | null,
    readEntry: async (path: string): Promise<Uint8Array | null> => {
      const p = path.replace(/^\/+/, "");
      if (p === ENTRY) {
        const raw = await gunzipIfGzip(await tree.read(rec.entry));
        if (!raw) return null;
        served.push(p);
        if (!recentre || position(rec.root).kind !== "earth") return raw;
        const doc = decode(raw);
        if (!doc) return raw;
        const root = { ...(doc.root as Record<string, unknown>) };
        delete root.transform;
        return new TextEncoder().encode(JSON.stringify({ ...doc, root }));
      }
      const b = await tree.read(rec.prefix + p);
      if (b) {
        served.push(p);
        if (out.firstTileAt === null && TILE_EXT.test(p) && typeof performance !== "undefined") out.firstTileAt = performance.now();
      }
      return b;
    },
  };
  return out;
}

// ── opened from a drop ───────────────────────────────────────────────────────

/** A file of the drop that is an archive. */
export const isArchiveName = (n: string): boolean => /\.(3tz|zip)$/i.test(n);

/**
 * The tree a drop makes. Files and folders together: an archive alone is its
 * inside; an archive with loose files (its X.json) is the two as one; anything
 * else is the files as dropped.
 */
export async function treeOfDrop(files: Array<{ path: string; blob: Blob }>): Promise<{ tree: TreeSource; label: string; zipped: boolean }> {
  const archives = files.filter((f) => !f.path.includes("/") && isArchiveName(f.path));
  const label = files.length === 1 ? files[0].path : (files.map((f) => f.path.split("/")[0])[0] ?? "");
  if (archives.length === 1) {
    const a = archives[0];
    const inner = await openArchive(blobSource(a.blob));
    const rest = files.filter((f) => f !== a);
    return rest.length
      ? { tree: unionTree(inner, filesTree(rest)), label: a.path, zipped: true }
      : { tree: inner, label: a.path, zipped: true };
  }
  return { tree: filesTree(files), label: label.split("/")[0], zipped: false };
}

/** A .3tz by its index when it is canonical (its tiles one read each), any
 *  other zip by its directory. */
export async function openArchive(src: ByteSource): Promise<TreeSource> {
  try {
    const a = await Archive3tz.open(src);
    // the canonical index finds by path, it does not list: the directory does
    const z = await ZipArchive.open(src);
    return { kind: "zip", list: listFrom(z.names()), read: (p) => a.readEntry(p) };
  } catch {
    return zipTree(src);
  }
}

// ── «Attacca all'epoca…» ─────────────────────────────────────────────────────

export interface AttachSpec {
  name: string;
  epochId: string;
  /** the locator of the entry: a .3tz / .zip, or a folder's `tileset.json` */
  locator: string;
  packaging: "archive" | "directory";
  sizeBytes?: number | null;
  /** the locator is the file's name only (a drop from the system: no path) */
  nameOnly?: boolean;
}

/**
 * What EM Tools' «Add Cesium Tileset» writes, in EMStudio's graph and in ONE
 * step of undo: a representation model in the epoch (`has_first_epoch`), with
 * `url` and EM Tools' `is_tileset` / `tileset_path`, and the resource of its
 * file (`has_linked_resource`). → the two ids.
 */
export function attachTileset(g: ResourceGraph, spec: AttachSpec, newId: () => string): { rmId: string; resourceId: string } {
  return g.batch(() => {
    const media = /\.3tz$/i.test(spec.locator) ? "application/vnd.maxar.archive.3tz+zip"
      : /\.zip$/i.test(spec.locator) ? "application/zip" : "application/json";
    const res = addResource(g, {
      name: spec.name, kind: "3d_model", packaging: spec.packaging,
      files: [{ path: spec.locator, media_type: media, ...(spec.sizeBytes ? { size_bytes: spec.sizeBytes } : {}) }],
      ...(spec.nameOnly ? { data: { locator_note: "name only: the file was dropped, its path is not known" } } : {}),
    });
    const rmId = newId();
    g.addNode({ id: rmId, node_type: "representation_model", name: spec.name, description: "",
      data: { url: spec.locator, is_tileset: true, tileset_path: spec.locator, is_publishable: true } } as EmNode);
    g.addEdge({ id: `${rmId}_has_first_epoch_${spec.epochId}`, edge_type: "has_first_epoch", source: rmId, target: spec.epochId });
    g.addEdge({ id: `${rmId}_has_linked_resource_${res.id}`, edge_type: "has_linked_resource", source: rmId, target: res.id });
    return { rmId, resourceId: res.id };
  });
}
