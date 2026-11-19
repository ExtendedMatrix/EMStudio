/**
 * MICRO-E-PORTA-VERSIONI-COLORI p.1 (E.D., 15–16 Nov 2026) · «Porta dentro…»,
 * the one door. Four ways in — File ▸ Porta dentro…, the «+» in the Space's
 * bar, a file dropped on the Space, a selection in Archive ▸ Files or in a
 * bucket — and one window behind them (main.ts › openDoor). Here what the
 * window needs to know of a file before asking anything: what it is (the same
 * answer as s3Dgraphy's `door.kind_of`, check-door.mjs), what it asks.
 *
 * - a GIS file (raster, vector, DXF) is always an RMDoc: its role is not asked;
 *   a file without a CRS (a DXF) asks CRS + shift;
 * - a 3D model or a tileset: RM (in the epoch it represents) or RMDoc; a mesh
 *   that comes with a tileset can be its SOURCE (the tileset's master);
 * - a picture without a frame: a file of the document;
 * - a Tropy session: the other form of the same window (a table of items);
 * - an em.json / GraphML is not the door's: it opens as a graph.
 */
export type DoorKind = "tileset" | "model" | "dxf" | "vector" | "raster" | "image" | "tropy" | "graph" | "other";
export type DoorRole = "rm" | "rmdoc" | "source";

const ext = (p: string): string => { const b = p.toLowerCase().replace(/\/+$/, "").split(/[\\/]/).pop() ?? ""; const i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; };
const base = (p: string): string => p.toLowerCase().replace(/\/+$/, "").split(/[\\/]/).pop() ?? "";
const MODEL = new Set([".obj", ".glb", ".gltf", ".ply", ".fbx", ".stl", ".las", ".laz", ".e57", ".blend"]);
const IMAGE = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".heic"]);

/** what a file is, by its name (`georeferenced`: a picture the bridge read with a frame) */
export function doorKindOf(path: string, georeferenced = false): DoorKind {
  const b = base(path), e = ext(path);
  if (b.endsWith(".em.json") || e === ".graphml") return "graph";
  if (e === ".3tz" || b === "tileset.json") return "tileset";
  if (e === ".tpy" || e === ".jsonld") return "tropy";
  if (MODEL.has(e)) return "model";
  if (e === ".dxf") return "dxf";
  if (e === ".shp" || e === ".gpkg" || e === ".geojson") return "vector";
  if (IMAGE.has(e)) return georeferenced ? "raster" : "image";
  return "other";
}

export const isGisKind = (k: DoorKind): boolean => k === "raster" || k === "vector" || k === "dxf";
export const isModelKind = (k: DoorKind): boolean => k === "model" || k === "tileset";
/** a JSON that is a Tropy export (its @context names Tropy, or items with photos) */
export function looksLikeTropy(json: unknown): boolean {
  const j = json as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return false;
  const ctx = JSON.stringify(j["@context"] ?? "");
  if (/tropy/i.test(ctx)) return true;
  const g = Array.isArray(j["@graph"]) ? (j["@graph"] as Record<string, unknown>[]) : [];
  return g.some((x) => x && typeof x === "object" && ("photo" in x || "photos" in x));
}

/** the roles a file can take; the first is the default */
export function doorRoles(k: DoorKind, withTileset: boolean): DoorRole[] {
  if (k === "tileset") return ["rm", "rmdoc"];
  if (k === "model") return withTileset ? ["rm", "rmdoc", "source"] : ["rm", "rmdoc"];
  return [];
}

/** MICRO-F p.2 · a tileset dropped on the Viewer or the Space passes by the
 *  door: its preview becomes a ROW of the door — what was recognised (the
 *  form: a .3tz, a folder with tileset.json, the RealityScan pair), where its
 *  root's transform puts it, «centred for the view only» — and what the
 *  preview read travels with the file (packaging, size, a name only). */
export interface DoorTileset {
  /** the dropped preview's id (main.ts `droppedTilesets`) */
  dropId: string;
  form: string;
  /** «A tileset packed in a .3tz» … (the recogniser's words) */
  formSaid: string;
  /** the position line: «on the Earth at lat, lon, h» or «local» */
  pos: string;
  posWarn: boolean;
  recentred: boolean;
  /** null: the form cannot be cited as it is (the pair: «Prepara il pacchetto» first) */
  packaging: "archive" | "directory" | null;
  nameOnly: boolean;
}
export interface DoorFile {
  path?: string; address?: string; name: string;
  /** MICRO-GEO09 · a FOLDER (a stack of slices): read by a plugin's reader of folders (door.reader@2) */
  dir?: boolean;
  /** the kind when the name does not say it (a tileset's .zip) */
  kind?: DoorKind;
  /** the locator written (a dropped tileset with no path: its name) */
  url?: string;
  size_bytes?: number | null;
  /** the file whose sha256 is taken when the door is passed (a tileset's archive / entry) */
  digestPath?: string | null;
  tileset?: DoorTileset;
}

/** what a dropped tileset sends to the bridge (`/graph/door`, s3Dgraphy door.bring_in) */
export function doorTilesetOut(f: DoorFile, checksum: string | null): Record<string, unknown> {
  const t = f.tileset;
  if (!t) return {};
  return { kind: "tileset", ...(t.packaging ? { packaging: t.packaging } : {}), ...(t.nameOnly ? { name_only: true, url: f.url ?? f.name } : {}),
    ...(f.size_bytes ? { size_bytes: f.size_bytes } : {}), ...(checksum ? { checksum } : {}) };
}
/** does a drop belong to the door? (a graph opens as a graph, as today) */
export const forTheDoor = (paths: string[]): boolean => paths.some((p) => doorKindOf(p) !== "graph");

/** MICRO-K §B1 (node datamodel 1.6.48) · the nodes that say WHEN they were
 *  acquired and until when they hold: RM, RMDoc, RMSF, the container, the
 *  document. */
export const ACQUIRED_TYPES: ReadonlySet<string> = new Set(["representation_model", "representation_model_doc",
  "representation_model_sf", "RepresentationModelNodeGroup", "document"]);

/** A `data.acquired` / `data.valid_until` typed by a person: a year («2015»,
 *  «-27»), an ISO date («2015-06-12»), an interval («2013–2015», «2013-2015»,
 *  «2013/2015») → `{start, end}`. `null` = cleared; `undefined` = not a date. */
export function parseAcquired(text: string): string | number | { start: string | number; end: string | number } | null | undefined {
  const v = text.trim();
  if (!v) return null;
  const one = (x: string): string | number | undefined => {
    const y = x.trim();
    if (/^-?\d{1,4}$/.test(y)) return Number(y);
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(y)) return y;
    return undefined;
  };
  const m = /^(-?\d{1,4}(?:-\d{2}(?:-\d{2})?)?)\s*(?:–|—|\/|\s-\s|-(?=\d{4}$))\s*(-?\d{1,4}(?:-\d{2}(?:-\d{2})?)?)$/.exec(v);
  if (m) {
    const a = one(m[1]), b = one(m[2]);
    return a === undefined || b === undefined ? undefined : { start: a, end: b };
  }
  return one(v);
}

/** the text a `data.acquired` reads as */
export function acquiredText(v: unknown): string {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return `${o.start ?? "?"}–${o.end ?? "?"}`;
  }
  return v == null ? "" : String(v);
}
