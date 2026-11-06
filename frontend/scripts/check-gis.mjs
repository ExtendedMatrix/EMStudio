// MICRO-GIS-BASE (6 Nov 2026) · the GIS layers of the graph in the Space.
//
//   node scripts/check-gis.mjs
//
// 1 · the pure part of `gis-scene.ts`: the layers and the surfaces read from
//     the graph, the frame, a point of the CRS in three's axes (shift and
//     rotation), the features turned into points, segments and labels (a
//     vertex without a height lies on the ground given);
// 2 · a bridge of this working tree (with the s3Dgraphy checkout beside), for
//     real, on files GENERATED here in EPSG:3844 (Templu Mare's CRS) and one in
//     WGS 84: /gis/inspect for the four formats (CRS from the file, bbox and
//     WGS 84), /graph/gis-ingest (a delta: the gis_layer resource),
//     /gis/features (same grid: the same numbers; another CRS: reprojected),
//     /graph/landscape-surface, /gis/surface (a grid of heights, uv of the
//     image), /graph/gis-contours (the GeoJSON beside the DEM, its stamp, the
//     DTC step, a name never taken).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? (existsSync(`${S3D}.venv/bin/python`) ? `${S3D}.venv/bin/python` : "python3");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, `${m} — got ${JSON.stringify(a)}`); checks++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} — got ${a}, want ${b} ±${tol}`); checks++; };

const bundle = await esbuild.build({ entryPoints: [`${SRC}gis-scene.ts`], bundle: true, format: "esm", write: false });
const G = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

// ── 1 · pure ────────────────────────────────────────────────────────────────
const X0 = 327372.56, Y0 = 448682.65;
const doc = { graph: { graph_id: "g", nodes: [
  { id: "geo", node_type: "geo_position", data: { epsg: 3844, shift_x: X0, shift_y: Y0, shift_z: 0, rotation: 0 } },
  { id: "L1", node_type: "resource", name: "pts", data: { url_type: "gis_layer", gis_format: "geojson", url: "gis/a.geojson", crs: "EPSG:3844", feature_key: "name" } },
  { id: "L2", node_type: "resource", name: "shp", data: { url_type: "gis_layer", gis_format: "shapefile", url: "", crs: "EPSG:31700" } },
  { id: "F1", node_type: "resource_file", data: { url: "gis/p.dbf", role: "member" } },
  { id: "F2", node_type: "resource_file", data: { url: "gis/p.shp", role: "entry_point" } },
  { id: "D", node_type: "resource", name: "dem", data: { url_type: "gis_layer", gis_format: "geotiff", url: "gis/dem.tif", raster: { kind: "dem" } } },
  { id: "I", node_type: "resource", name: "ortho", data: { url_type: "gis_layer", gis_format: "geotiff", url: "gis/o.tif", raster: { kind: "image" } } },
  { id: "S", node_type: "landscape_surface", name: "ground", data: { step_m: 2 } },
  { id: "C", node_type: "resource", name: "contours", data: { url_type: "gis_layer", gis_format: "geojson", url: "gis/c.geojson" } },
], edges: [
  { id: "e1", source: "L2", target: "F1", edge_type: "has_file" }, { id: "e2", source: "L2", target: "F2", edge_type: "has_file" },
  { id: "e3", source: "S", target: "I", edge_type: "has_linked_resource" }, { id: "e4", source: "S", target: "D", edge_type: "has_linked_resource" },
  { id: "e5", source: "C", target: "D", edge_type: "dtc_derived_from" },
] } };
const layers = G.gisLayersOf(doc);
eq(layers.map((l) => [l.id, l.format, l.url, l.derived]), [["L1", "geojson", "gis/a.geojson", false], ["L2", "shapefile", "gis/p.shp", false],
  ["D", "geotiff", "gis/dem.tif", false], ["I", "geotiff", "gis/o.tif", false], ["C", "geojson", "gis/c.geojson", true]], "the layers, a shapefile by its entry point, the contours derived");
eq(G.surfacesOf(doc), [{ id: "S", name: "ground", dem: "D", image: "I", step: 2 }], "the surface: its DEM and its image by their raster kind");
const f = G.frameOf(doc);
eq(f, { epsg: 3844, x: X0, y: Y0, z: 0, rotation: 0 }, "the frame of the GeoPositionNode");
eq(G.toThree(f, X0 + 10, Y0 + 5, 491), [10, 491, -5], "east → x, north → −z, the height as it is");
const turned = G.toThree({ ...f, rotation: 90 }, X0 + 10, Y0, 0);
near(turned[0], 0, 1e-9, "turned 90°: x"); near(turned[2], -10, 1e-9, "turned 90°: z");
eq(G.fileOf("gis/a.geojson", "/data/EM/study.em.json"), "/data/EM/gis/a.geojson", "a url against the em.json's folder");
eq(G.fileOf("/abs/x.shp", "/data/EM/study.em.json"), "/abs/x.shp", "an absolute url as it is");
const geo = G.geometryOf(f, [
  { type: "Point", label: "R1", coords: [X0 + 1, Y0 + 1, null] },
  { type: "LineString", label: "L", coords: [[[X0, Y0, 490], [X0 + 2, Y0, 491], [X0 + 2, Y0 + 2, 492]]] },
  { type: "Polygon", label: null, coords: [[[X0, Y0, 1], [X0 + 1, Y0, 1], [X0, Y0, 1]]] },
], () => 487.5);
eq(geo.points, [1, 487.5, -1], "a point without a height lies on the ground given");
eq(geo.segments.length / 6, 4, "two segments of the line, two of the ring");
eq(geo.labels.map((l) => l.text), ["R1", "L"], "a label per feature with a key");

// ── 2 · a bridge, for real ──────────────────────────────────────────────────
const dir = realpathSync(mkdtempSync(`${tmpdir()}/gis-`));
const gen = spawnSync(PY, ["-c", `
import json, sys, os, math, sqlite3, struct
sys.path.insert(0, ${JSON.stringify(S3D + "src")})
from s3dgraphy.gis.geotiff import write_geotiff
from s3dgraphy.gis.wkb import gpkg_blob, write_wkb
d = ${JSON.stringify(dir)}
X0, Y0 = ${X0}, ${Y0}
os.makedirs(d + "/EM/gis", exist_ok=True)
n = 41; c = (n - 1) / 2
rows = [[500.0 - 10.0 * min(1.0, math.hypot(i - c, j - c) / c) for i in range(n)] for j in range(n)]
write_geotiff(d + "/EM/gis/dem.tif", rows, affine=(X0 - 20.5, 1.0, 0.0, Y0 + 20.5, 0.0, -1.0), epsg=3844, nodata=-9999.0)
write_geotiff(d + "/EM/gis/ortho.tif", [[(i * 6 % 256, j * 6 % 256, 90) for i in range(32)] for j in range(32)],
              affine=(X0 - 16, 1.0, 0.0, Y0 + 16, 0.0, -1.0), epsg=3844, rgb=True)
json.dump({"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::31700"}},
  "features": [{"type": "Feature", "properties": {"name": "GCP 101"}, "geometry": {"type": "Point", "coordinates": [X0 + 3, Y0 + 4, 493.5]}},
               {"type": "Feature", "properties": {"name": "wall"}, "geometry": {"type": "LineString", "coordinates": [[X0 - 5, Y0], [X0 + 5, Y0]]}}]},
  open(d + "/EM/gis/pts.geojson", "w"))
json.dump({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": "pin"},
  "geometry": {"type": "Point", "coordinates": [22.7892, 45.5139]}}]}, open(d + "/EM/gis/wgs.geojson", "w"))
con = sqlite3.connect(d + "/EM/gis/units.gpkg")
con.executescript("""CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT, srs_id INTEGER PRIMARY KEY, organization TEXT, organization_coordsys_id INTEGER, definition TEXT, description TEXT);
CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT, identifier TEXT, description TEXT, last_change TEXT, min_x REAL, min_y REAL, max_x REAL, max_y REAL, srs_id INTEGER);
CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT, srs_id INTEGER, z TINYINT, m TINYINT);
INSERT INTO gpkg_spatial_ref_sys VALUES ('Stereo70', 3844, 'EPSG', 3844, '', '');
CREATE TABLE units (fid INTEGER PRIMARY KEY, geom BLOB, us TEXT);""")
con.execute("INSERT INTO gpkg_contents VALUES ('units','features','units','','',NULL,NULL,NULL,NULL,3844)")
con.execute("INSERT INTO gpkg_geometry_columns VALUES ('units','geom','POLYGON',3844,1,0)")
ring = [[X0 - 4, Y0 - 4, 491], [X0 + 4, Y0 - 4, 491], [X0 + 4, Y0 + 4, 492], [X0 - 4, Y0 - 4, 491]]
con.execute("INSERT INTO units (geom, us) VALUES (?, 'SU001')", (gpkg_blob(3844, write_wkb("Polygon", [ring])),))
con.commit(); con.close()
# a shapefile of one point, by hand
content = struct.pack("<i2d", 1, X0 + 1, Y0 + 2)
rec = struct.pack(">2i", 1, len(content) // 2) + content
head = struct.pack(">7i", 9994, 0, 0, 0, 0, 0, (100 + len(rec)) // 2) + struct.pack("<2i", 1000, 1) + struct.pack("<4d", X0 + 1, Y0 + 2, X0 + 1, Y0 + 2) + struct.pack("<4d", 0, 0, 0, 0)
open(d + "/EM/gis/st.shp", "wb").write(head + rec)
open(d + "/EM/gis/st.prj", "w").write('PROJCS["Pulkovo_1942_58_Stereo_70",GEOGCS["GCS_Pulkovo_1942_58"]]')
from s3dgraphy import api
from s3dgraphy.graph import Graph
g = Graph("g")
gp = next(x for x in g.nodes if x.node_type == "geo_position")
gp.data.update({"epsg": 3844, "shift_x": X0, "shift_y": Y0, "shift_z": 0, "rotation": 0})
json.dump(api.graph_to_emjson(g), open(d + "/EM/study.em.json", "w"))
print("ok")`], { encoding: "utf8" });
ok(gen.stdout.trim() === "ok", `the files generated — ${gen.stderr}`);
const port = await new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const bridge = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", dir, "--s3dgraphy", `${S3D}src`],
  { env: { ...process.env, EM_BRIDGE_STATE_DIR: `${dir}/state` }, stdio: ["ignore", "ignore", "pipe"] });
let log = "";
bridge.stderr.on("data", (d) => { log += d; });
const B = `http://127.0.0.1:${port}`;
const O = { origin: "http://localhost:5173" };
const get = async (r) => (await fetch(`${B}${r}`, { headers: O })).json();
const post = async (r, b) => { const x = await fetch(`${B}${r}`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { ...(await x.json()), status: x.status }; };
const apply = (d, delta) => {
  d.graph.nodes.push(...delta.nodes_added);
  d.graph.edges.push(...delta.edges_added);
  for (const c of delta.nodes_changed) { const n = d.graph.nodes.find((x) => x.id === c.id); if (n) n.data = c.data; }
};
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${B}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 150)); }
  const health = await (await fetch(`${B}/health`)).json();
  ok(health.bridge_level >= 61, `the bridge's level ≥ 61 (/gis/*) — got ${health.bridge_level}`);
  const E = `${dir}/EM/gis`;
  // the four formats: the CRS from the file, the bbox in it and in WGS 84
  const ins = {};
  for (const [k, f] of [["geojson", "pts.geojson"], ["geopackage", "units.gpkg"], ["shapefile", "st.shp"], ["geotiff", "dem.tif"], ["image", "ortho.tif"]])
    ins[k] = await get(`/gis/inspect?path=${encodeURIComponent(`${E}/${f}`)}`);
  eq([ins.geojson.gis_format, ins.geojson.crs, ins.geojson.crs_source], ["geojson", "EPSG:31700", "member"], "GeoJSON: the 2008 member read");
  eq([ins.geopackage.gis_format, ins.geopackage.crs, ins.geopackage.layer], ["geopackage", "EPSG:3844", "units"], "GeoPackage: srs of its layer");
  eq([ins.shapefile.gis_format, ins.shapefile.crs], ["shapefile", "EPSG:3844"], "shapefile: the .prj's name");
  eq([ins.geotiff.gis_format, ins.geotiff.crs, ins.geotiff.raster.kind], ["geotiff", "EPSG:3844", "dem"], "GeoTIFF: the GeoKeys, a DEM");
  eq(ins.image.raster.kind, "image", "an RGB GeoTIFF is an image");
  for (const k of Object.keys(ins)) {
    const w = ins[k].bbox_wgs84;
    ok(w && w[0] > 22.78 && w[2] < 22.80 && w[1] > 45.51 && w[3] < 45.52, `${k}: its bbox in WGS 84 at Sarmizegetusa — got ${JSON.stringify(w)}`);
  }
  // into the graph, as deltas
  const d = JSON.parse(readFileSync(`${dir}/EM/study.em.json`, "utf8"));
  const docPath = `${dir}/EM/study.em.json`;
  const ids = {};
  for (const [k, f] of [["pts", "pts.geojson"], ["units", "units.gpkg"], ["st", "st.shp"], ["dem", "dem.tif"], ["ortho", "ortho.tif"], ["wgs", "wgs.geojson"]]) {
    const r = await post("/graph/gis-ingest", { doc: d, doc_path: docPath, path: `${E}/${f}` });
    ok(r.ok && r.delta, `ingest ${f} — ${JSON.stringify(r).slice(0, 300)}`);
    apply(d, r.delta);
    ids[k] = r.resource_id;
  }
  const res = (id) => d.graph.nodes.find((n) => n.id === id);
  eq(res(ids.pts).data.url, "gis/pts.geojson", "the locator relative to the em.json's folder");
  eq([res(ids.pts).data.url_type, res(ids.pts).data.gis_format, res(ids.pts).data.frame?.crs], ["gis_layer", "geojson", "EPSG:3844"], "31700 → the graph's grid, a frame");
  ok(res(ids.st).data.packaging === "file_set", "a shapefile is a file set");
  ok(String(res(ids.dem).data.checksum).startsWith("sha256:"), "a checksum");
  // drawn: same grid → the same numbers; WGS 84 → reprojected
  const fp = await post("/gis/features", { path: `${E}/pts.geojson`, scene_crs: "EPSG:3844", feature_key: "name" });
  eq([fp.how, fp.count, fp.features[0].label], ["same grid", 2, "GCP 101"], "31700 in a 3844 scene: the same grid");
  eq(fp.features[0].coords, [X0 + 3, Y0 + 4, 493.5], "…the same numbers, the true height");
  eq(fp.features[1].coords[0][0][2], null, "a 2D line has no height (the scene puts it on the ground)");
  const fw = await post("/gis/features", { path: `${E}/wgs.geojson`, scene_crs: "EPSG:3844", feature_key: "name" });
  eq(fw.how, "reprojected", "WGS 84 in a 3844 scene: reprojected");
  near(fw.features[0].coords[0], X0, 600, "…to Stereo 70 east"); near(fw.features[0].coords[1], Y0, 600, "…north");
  const fg = await post("/gis/features", { path: `${E}/units.gpkg`, scene_crs: "EPSG:3844", feature_key: "us" });
  eq([fg.features[0].type, fg.features[0].label, fg.features[0].coords[0].length], ["Polygon", "SU001", 4], "the GeoPackage's polygon, its ring");
  // the ground
  const sf = await post("/graph/landscape-surface", { doc: d, dem_id: ids.dem, image_id: ids.ortho, step_m: 1 });
  ok(sf.ok && sf.delta.nodes_added.some((n) => n.node_type === "landscape_surface"), `a landscape_surface node — ${JSON.stringify(sf).slice(0, 200)}`);
  apply(d, sf.delta);
  const sg = await post("/gis/surface", { dem: `${E}/dem.tif`, image: `${E}/ortho.tif`, scene_crs: "EPSG:3844", step: 1 });
  ok(sg.ok && sg.nx >= 40 && sg.ny >= 40, `the ground, a grid — ${JSON.stringify(sg).slice(0, 200)}`);
  const mid = sg.heights[Math.floor(sg.ny / 2) * sg.nx + Math.floor(sg.nx / 2)];
  near(mid, 500, 0.6, "the top of the hill at its centre");
  near(sg.z_range[0], 490, 0.5, "its foot at 490");
  eq(sg.uv.length, sg.nx * sg.ny * 2, "a texture coordinate per node");
  // the contours: a derived layer, stamped, a name never taken
  const ct = await post("/graph/gis-contours", { doc: d, doc_path: docPath, dem_id: ids.dem, interval: 2.5 });
  ok(ct.ok && ct.lines >= 3, `contours — ${JSON.stringify(ct).slice(0, 300)}`);
  ok(ct.path.endsWith("dem_contours_2_5m.geojson") && existsSync(ct.path), "the GeoJSON beside the DEM");
  ok(ct.stamp && existsSync(ct.stamp), "its stamp beside it");
  const stamp = JSON.parse(readFileSync(ct.stamp, "utf8"));
  ok(JSON.stringify(stamp).includes("vectorization"), "the stamp names the step (vectorization)");
  apply(d, ct.delta);
  ok(d.graph.edges.some((e) => e.edge_type === "dtc_derived_from" && e.source === ct.resource_id && e.target === ids.dem), "derived from the DEM");
  const ct2 = await post("/graph/gis-contours", { doc: d, doc_path: docPath, dem_id: ids.dem, interval: 2.5 });
  ok(ct2.path.endsWith("dem_contours_2_5m-2.geojson"), "again: beside, never over the first");
  const fc = await post("/gis/features", { path: ct.path, scene_crs: "EPSG:3844", feature_key: "elev" });
  ok(fc.features.every((x) => x.coords[0].every((p) => p[2] === Number(x.label))), "a contour's vertices at its level");
  // a file outside the served roots is refused
  const out = await get(`/gis/inspect?path=${encodeURIComponent("/etc/hosts")}`).catch(() => ({}));
  ok(!out.ok, "outside the served roots: refused");
} catch (e) {
  console.error(log.slice(-3000));
  throw e;
} finally {
  bridge.kill();
}
console.log(`check-gis: ${checks} checks ok`);
