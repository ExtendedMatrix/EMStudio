/**
 * EXPERIMENTAL · the site and its layers, the PURE part (born in the lab,
 * 30 Oct 2026): what the document says — the site, its footprint
 * read for drawing, its layers, the anchor, the grid → scene conversion, what
 * the door recognises by a name. No DOM: `scripts/check-site-door.mjs` loads it
 * in node. The DOM is `site-door.ts`.
 */
import type { EmDocument, EmEdge, EmNode } from "./types";
import { blenderToThree, type V3 } from "./space-nav";

const dataOf = (n: EmNode | undefined): Record<string, unknown> => (n?.data ?? {}) as Record<string, unknown>;
const num = (v: unknown): number => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

/** Is this node a site: a place of level `sito` (s3Dgraphy's `is_site`)? */
export function isSite(n: EmNode | undefined): boolean {
  return !!n && n.node_type === "LocationNodeGroup" && dataOf(n).level === "sito";
}

/** THE site of the graph: the one its study took place at, else the only one. */
export function siteOf(doc: EmDocument | null | undefined): EmNode | null {
  const nodes = doc?.graph?.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of doc?.graph?.edges ?? []) {
    if (e.edge_type === "study_took_place_at" && isSite(byId.get(e.target))) return byId.get(e.target)!;
  }
  const s = nodes.filter(isSite);
  return s.length === 1 ? s[0] : null;
}

export interface Footprint { propertyId: string; crs: string; shape: string; rings: number[][][] }

/** A WKT POLYGON / MULTIPOLYGON (2D or Z), with its CRS IRI, read FOR DRAWING:
 *  the outer ring of every polygon. Null when it is not one. */
export function parseFootprint(wkt: unknown): { crs: string; shape: string; rings: number[][][] } | null {
  const m = /^\s*(?:<([^>]*)>\s*)?(POLYGON|MULTIPOLYGON)\s*(Z)?\s*\((.*)\)\s*$/is.exec(String(wkt ?? ""));
  if (!m) return null;
  const iri = m[1] ?? "";
  const e = /\/EPSG\/0\/(\d+)$/.exec(iri);
  const crs = e ? `EPSG:${e[1]}` : /LocalSceneFrame$/.test(iri) || !iri ? "local" : iri;
  const rings: number[][][] = [];
  // every innermost «( … )» is a ring; the outer one is the first of its polygon
  const multi = m[2].toUpperCase() === "MULTIPOLYGON";
  const body = m[4];
  let depth = 0, start = -1, first = true;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "(") { depth++; start = i + 1; if (multi && depth === 1) first = true; }
    else if (c === ")") {
      if (start >= 0) {
        if (first) rings.push(body.slice(start, i).split(",").map((q) => q.trim().split(/\s+/).map(Number))
          .filter((q) => q.length >= 2 && q.every(Number.isFinite)));
        first = false;
      }
      start = -1;
      depth--;
    }
  }
  return rings.length ? { crs, shape: m[2].toUpperCase() + (m[3] ? " Z" : ""), rings } : null;
}

function outgoing(doc: EmDocument, id: string, type: string): EmNode[] {
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  return doc.graph.edges.filter((e: EmEdge) => e.source === id && e.edge_type === type)
    .map((e) => byId.get(e.target)).filter((n): n is EmNode => !!n);
}

export function footprintOf(doc: EmDocument | null | undefined, siteId: string): Footprint | null {
  if (!doc) return null;
  for (const p of outgoing(doc, siteId, "has_property")) {
    const d = dataOf(p);
    if ((d.property_type ?? p.name) !== "footprint") continue;
    const f = parseFootprint(d.value ?? p.value);
    if (f) return { propertyId: p.id, ...f };
  }
  return null;
}

export interface GisLayer { id: string; name: string; url: string; crs: string | null; frameCrs: string | null;
  shift: V3; zField: string | null; featureKey: string | null; count: number | null }

const isLayer = (n: EmNode): boolean => n.node_type === "resource" && dataOf(n).url_type === "gis_layer";

/** The GIS layers of the graph: the site's first (has_linked_resource), then the others. */
export function layersOf(doc: EmDocument | null | undefined, siteId?: string | null): GisLayer[] {
  if (!doc) return [];
  const own = siteId ? outgoing(doc, siteId, "has_linked_resource").filter(isLayer) : [];
  const all = [...own, ...doc.graph.nodes.filter((n) => isLayer(n) && !own.includes(n))];
  return all.map((n) => {
    const d = dataOf(n);
    const fr = (d.frame ?? null) as { crs?: string; shift?: number[] } | null;
    // the .shp: the entry point of its files, else the resource's own url
    const entry = outgoing(doc, n.id, "has_file").find((f) => /\.shp$/i.test(String(dataOf(f).url ?? f.url ?? f.name ?? "")));
    const url = String((entry && (dataOf(entry).url ?? entry.url)) || d.url || "");
    return { id: n.id, name: String(n.name ?? n.id), url, crs: (d.crs as string) ?? null,
      frameCrs: fr?.crs ?? null, shift: [num(fr?.shift?.[0]), num(fr?.shift?.[1]), num(fr?.shift?.[2])],
      zField: (d.z_field as string) ?? null, featureKey: (d.feature_key as string) ?? null,
      count: typeof d.feature_count === "number" ? d.feature_count : null };
  });
}

export interface Anchor { epsg: number | null; x: number; y: number; z: number; rotation: number }

export function anchorOf(doc: EmDocument | null | undefined): Anchor | null {
  const g = doc?.graph?.nodes.find((n) => n.node_type === "geo_position");
  if (!g) return null;
  const d = dataOf(g);
  const e = Number(String(d.epsg ?? "").replace(/^EPSG:+/i, ""));
  return { epsg: Number.isInteger(e) && e > 0 ? e : null, x: num(d.shift_x), y: num(d.shift_y), z: num(d.shift_z), rotation: num(d.rotation) };
}

/** A point of the graph's grid (E, N, Z) in the scene (three's axes): minus the
 *  shift, the rotation undone (the inverse of georef.ts `localToCrs`). */
export function gridToThree(a: Anchor, p: number[]): V3 {
  const dx = p[0] - a.x, dy = p[1] - a.y;
  const th = (a.rotation * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  // localToCrs: X = x c + y s, Y = −x s + y c  →  x = X c − Y s, y = X s + Y c
  const x = dx * c - dy * s, y = dx * s + dy * c;
  return blenderToThree([x, y, (p[2] ?? a.z) - a.z]);
}

/** What the door recognises by the name (the bridge confirms by reading). */
export type DoorKind = "gis_layer" | "tileset" | "model" | "unknown";
export function doorKindOf(name: string, isDir = false): DoorKind {
  const n = name.toLowerCase();
  if (isDir || n === "tileset.json" || /\.(3tz|3dtiles)$/.test(n)) return "tileset";
  // the four formats of the public GIS (MICRO-GIS-BASE): a shapefile by any
  // of its companions, a GeoPackage, a GeoJSON, a GeoTIFF
  if (/\.(shp|dbf|shx|prj|qpj|cpg|gpkg|geojson|tiff?)$/.test(n)) return "gis_layer";
  if (/\.(glb|gltf|obj|ply|fbx|stl|blend|e57|las|laz)$/.test(n)) return "model";
  return "unknown";
}

