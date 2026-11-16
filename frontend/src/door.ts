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

export interface DoorFile { path?: string; address?: string; name: string }
/** does a drop belong to the door? (a graph opens as a graph, as today) */
export const forTheDoor = (paths: string[]): boolean => paths.some((p) => doorKindOf(p) !== "graph");
