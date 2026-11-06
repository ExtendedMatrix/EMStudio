// EXPERIMENTAL (born in the lab, 30 Oct 2026) · the site, its footprint, its
// layers, the door (`site-model.ts`), in node, on a SYNTHETIC document: the site found by the datamodel's own fields, the
// footprint's WKT read FOR DRAWING (POLYGON / MULTIPOLYGON, 2D / Z, its CRS),
// the layers of the site and their frame, the grid → scene conversion (the
// shift, the rotation undone, three's axes), what the door recognises by the
// name, and the site's glyph (the datamodel's `site` data glyph, vendored).
//
//   node scripts/check-site-door.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false,
                                  loader: { ".json": "json" }, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString("base64")}`);
};
const L = await load("site-model.ts");
const G = await load("glyphs.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const near = (a, b, tol, what) => { assert.ok(Math.abs(a - b) <= tol, `${what} — got ${a}, want ${b} ± ${tol}`); checks++; };

// ── the document: a site, its footprint, a layer, the anchor ────────────────
const WKT = "<http://www.opengis.net/def/crs/EPSG/0/3844> POLYGON Z ((499980 449980 100.5, 500020 449980 100.5, 500020 450020 101, 499980 450020 101.2, 499980 449980 100.5))";
const doc = { graph: {
  nodes: [
    { id: "geo", node_type: "geo_position", data: { epsg: 3844, shift_x: 500000, shift_y: 450000, shift_z: 0, rotation: 0 } },
    { id: "study", node_type: "study", name: "Study" },
    { id: "site", node_type: "LocationNodeGroup", name: "Site A", data: { kind: "toponym", level: "sito" } },
    { id: "pagus", node_type: "LocationNodeGroup", name: "Town", data: { kind: "toponym", level: "comune" } },
    { id: "fp", node_type: "property", name: "footprint", data: { property_type: "footprint", value: WKT } },
    { id: "lay", node_type: "resource", name: "points",
      data: { url_type: "gis_layer", gis_format: "shapefile", crs: "EPSG:31700", z_field: "field_4", feature_key: "field_1",
              feature_count: 12, frame: { crs: "EPSG:3844", shift: [0, 0, 0] } } },
    { id: "f1", node_type: "resource_file", name: "points.shp", data: { url: "../gis/points.shp" } },
    { id: "f2", node_type: "resource_file", name: "points.dbf", data: { url: "../gis/points.dbf" } },
  ],
  edges: [
    { id: "e1", source: "study", target: "site", edge_type: "study_took_place_at" },
    { id: "e2", source: "site", target: "fp", edge_type: "has_property" },
    { id: "e3", source: "site", target: "lay", edge_type: "has_linked_resource" },
    { id: "e4", source: "lay", target: "f2", edge_type: "has_file" },
    { id: "e5", source: "lay", target: "f1", edge_type: "has_file" },
    { id: "e6", source: "site", target: "pagus", edge_type: "is_in_location" },
  ] } };

// ── the site ────────────────────────────────────────────────────────────────
eq(L.siteOf(doc)?.id, "site", "the site: the place the study took place at");
ok(L.isSite(doc.graph.nodes[2]) && !L.isSite(doc.graph.nodes[3]), "a comune is a place, not the site");
const two = { graph: { nodes: [...doc.graph.nodes, { id: "s2", node_type: "LocationNodeGroup", name: "B", data: { level: "sito" } }],
  edges: doc.graph.edges.filter((e) => e.edge_type !== "study_took_place_at") } };
eq(L.siteOf(two), null, "two sites and no study saying which: no choice is made");

// ── the footprint, read for drawing ─────────────────────────────────────────
const fp = L.footprintOf(doc, "site");
eq([fp.crs, fp.shape, fp.rings.length, fp.rings[0].length], ["EPSG:3844", "POLYGON Z", 1, 5], "POLYGON Z in EPSG:3844");
eq(fp.rings[0][1], [500020, 449980, 100.5], "a vertex with its height");
const multi = L.parseFootprint("<https://w3id.org/em/ontology#LocalSceneFrame> MULTIPOLYGON (((0 0, 4 0, 4 4, 0 0), (1 1, 2 1, 2 2, 1 1)), ((10 10, 11 10, 11 11, 10 10)))");
eq([multi.crs, multi.shape, multi.rings.length, multi.rings[1][0]], ["local", "MULTIPOLYGON", 2, [10, 10]],
   "MULTIPOLYGON: the outer ring of each polygon, the hole left out of the drawing");
eq(L.parseFootprint("POINT Z (1 2 3)"), null, "a point is not a footprint");

// ── the layers ──────────────────────────────────────────────────────────────
const layers = L.layersOf(doc, "site");
eq(layers.map((l) => [l.id, l.url, l.frameCrs, l.zField, l.featureKey, l.count]),
   [["lay", "../gis/points.shp", "EPSG:3844", "field_4", "field_1", 12]],
   "the layer of the site, its .shp found among its files, its frame in the graph's grid");

// ── the grid → the scene ────────────────────────────────────────────────────
const a = L.anchorOf(doc);
eq(L.gridToThree(a, [500000, 450000, 491]), [0, 491, -0], "the anchor is the origin; the height is three's Y");
const p = L.gridToThree(a, [500010, 450010, 493]);
eq([p[0], p[1], p[2]], [10, 493, -10], "east is +X, north is −Z (Y up)");
const r = L.gridToThree({ ...a, rotation: 90 }, [500000 + 10, 450000, 0]);
near(r[0], 0, 1e-9, "rotation 90° clockwise from north: an eastern point");
near(r[2], -10, 1e-9, "…lies on the scene's local +Y (three −Z), as georef.localToCrs says");

// ── the door ────────────────────────────────────────────────────────────────
eq(["points.shp", "points.dbf", "tileset.json", "x.3tz", "SU001.glb", "a.gpkg", "dem.tif", "b.geojson", "note.pdf"].map((n) => L.doorKindOf(n)),
   ["gis_layer", "gis_layer", "tileset", "tileset", "model", "gis_layer", "gis_layer", "gis_layer", "unknown"],
   "what the door recognises: the four formats of the public GIS are layers");
eq(L.doorKindOf("RB", true), "tileset", "a folder is a tileset's door");

// ── the glyph comes from the datamodel ──────────────────────────────────────
eq(G.dataGlyphKey("LocationNodeGroup", { level: "sito" }), "site", "the site's data glyph (visual rules 1.6.41)");
eq(G.dataGlyphKey("LocationNodeGroup", { level: "comune" }), null, "another place: no glyph");
ok(G.glyphByKey("site")?.layers?.length > 0, "the glyph has its paths (draft)");

console.log(`site-door: ${checks} checks passed`);
