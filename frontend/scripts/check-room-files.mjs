// MICRO-FILE-DELLA-STANZA (EMStudio#2, PR #3) · the files of a ROOM, uploaded by
// another tool (pyArchInit through s3dgraphy.room_import): their address
// `https://<node>/…/v1/rooms/<room>/asset/sha256:<hex>` has no extension, so
// what they are is read from the graph — media_type → name → addresses → url
// (file-type.ts), in unit-images, media, viewer-node, paradata-inspector,
// storage — and a GeoJSON plan reaches the bridge through its cache by sha256
// (gis-scene.ts `/gis/store`, tools/em_bridge.py). The bridge part runs a real
// bridge when the s3Dgraphy venv is there (PYTHON, default ../s3Dgraphy/.venv).
//
//   node scripts/check-room-files.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = new URL("../../", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const F = await load("file-type.ts");
const U = await load("unit-images.ts");
const V = await load("viewer-node.ts");
const M = await load("media.ts");
const G = await load("gis-scene.ts");
const S = await load("storage.ts");

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

const HEX = "e220f959" + "0".repeat(56);
const STORE = `https://em.localhost:8443/em/v1/rooms/demo/asset/sha256:${HEX}`;
const node = (id, node_type, name, data = {}) => ({ id, node_type, name, data });
const edge = (source, edge_type, target) => ({ id: `${source}-${edge_type}-${target}`, source, target, edge_type });

// ── 1 · the rule, in its order ──────────────────────────────────────────────
eq(F.typeKeyOf(node("a", "resource", "x", { url: STORE, media_type: "image/jpeg" })), "file.jpg", "1 · media_type first");
eq(F.typeKeyOf(node("a", "resource", "US_1_3.jpg", { url: STORE, media_type: "image/jpeg" })), "US_1_3.jpg", "1 · …the name kept when it says the same");
eq(F.typeKeyOf(node("a", "resource", "pianta", { url: STORE, media_type: "image/tiff; application=geotiff" })), "file.tif", "1 · a media type's parameters dropped");
eq(F.typeKeyOf(node("a", "resource", "US_1_3.png", { url: STORE })), "US_1_3.png", "2 · then the name");
eq(F.typeKeyOf(node("a", "resource", "D.08", { url: STORE, addresses: [{ locator: STORE }, { locator: "/home/enzo/plans/3dc36e3c.geojson" }] })),
   "3dc36e3c.geojson", "3 · then the leaf of an address («D.08» is a name, not a type)");
eq(F.typeKeyOf(node("a", "resource", "1.1.US1", { url: "foto/T15_a.jpg" })), "foto/T15_a.jpg", "4 · then the url (the rule of before)");
eq(F.typeKeyOf(node("a", "resource", "x", { url: "sha256:abc" })), "", "4 · a bare sha256 is no locator");
eq(F.typeKeyOf(node("a", "resource", "x", { url: STORE, media_type: "application/octet-stream" })), STORE, "an unknown media type says nothing");
eq(F.extOfMediaType("application/geo+json"), "geojson", "a GeoJSON's media type");

// ── 2 · a unit's photos from the room (EMStudio#2: «SU 1: no images») ───────
const g = {
  nodes: [
    node("US1", "US", "1.1.US1"),
    node("D1", "document", "D.01"),
    node("R1", "resource", "US_1_1.png", { url: STORE, media_type: "image/png", checksum: `sha256:${HEX}` }),
    node("R2", "resource", "foto", { url: STORE.replace("e220", "e221"), media_type: "image/jpeg" }),
    node("R3", "resource", "3dc36e3c.geojson", { url: STORE.replace("e220", "e222"), media_type: "application/geo+json", url_type: "gis_layer",
                                                  gis_format: "geojson", crs: "EPSG:3004", checksum: `sha256:${"e222f959" + "0".repeat(56)}` }),
  ],
  edges: [edge("US1", "has_linked_resource", "R1"), edge("US1", "has_linked_resource", "R2"), edge("D1", "has_linked_resource", "R1")],
};
const before = (loc) => /\.(jpe?g|png|tiff?|webp|bmp|gif|heic)$/i.test(loc.split(/[?#]/)[0]) ? "image" : null;
eq(before(STORE), null, "HEAD's rule: a store address says nothing (the bug, measured)");
eq(U.mediumOfLocator(F.typeKeyOf(g.nodes[1 + 1])), "image", "unit-images: the store photo is an image");
const unitDocs = U.unitImages(g, "D1").flatMap((x) => x.items);
ok(unitDocs.some((i) => i.id === "R1" && i.medium === "image" && i.locator === STORE), "unit-images: a document's store photo listed, its locator the store address");
const vt = V.viewerTargetOf(g, "D1");
eq(vt.parts.map((p) => [p.id, p.medium]), [["R1", "image"]], "viewer-node: the document shows its store photo as an image");
eq(V.viewerTargetOf(g, "R2").parts.map((p) => p.medium), ["image"], "viewer-node: a store resource by media_type");
eq(M.mediaKindOf(F.typeKeyOf(g.nodes[3]) || STORE, null), "image", "media: kind from the type key (no media_type passed)");
eq(S.collectionFromUrl("R1", "US_1_1.png", "blob:http://x/1", F.typeKeyOf(g.nodes[2])).items[0].kind, "image", "storage: a blob of a store photo is an image");
eq(S.collectionFromUrl("R1", "x", STORE).items[0].kind, "other", "storage: without the type key, a store address is not (the rule of before)");

// ── 3 · a GeoJSON plan of the room: what the bridge's cache is asked by ─────
const layers = G.gisLayersOf({ graph: g });
const plan = layers.find((l) => l.id === "R3");
ok(plan && plan.format === "geojson" && plan.crs === "EPSG:3004", "gis: the plan is a layer, its format and CRS");
eq(G.storeExtOf(plan), "geojson", "gis: the cache's extension from the type");
eq(G.storeExtOf({ typeKey: STORE, format: "geotiff" }), "tif", "gis: …else from gis_format");
eq(G.storeExtOf({ typeKey: "x.shp", format: "shapefile" }), "", "gis: a shapefile is not taken (several files)");
eq(G.storeHexOf(plan), "e222f959" + "0".repeat(56), "gis: the sha256 from the checksum");
eq(G.storeHexOf({ checksum: null, url: STORE }), HEX, "gis: …else from the store address");
eq(G.fileOf("plans/a.geojson", "/w/site.em.json"), "/w/plans/a.geojson", "gis: a file on disk stays the path of before");

// ── 4 · the bridge: /gis/store, by sha256, checked; the pipeline reads from it ─
const py = process.env.PYTHON || path.join(ROOT, "../s3Dgraphy/.venv/bin/python");
if (!fs.existsSync(py)) {
  console.log(`(no python at ${py}: the bridge's part skipped)`);
} else {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "em-gis-store-"));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const br = spawn(py, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(port)],
    { env: { ...process.env, EM_GIS_STORE_DIR: cache }, stdio: ["ignore", "ignore", "pipe"] });
  let err = ""; br.stderr.on("data", (d) => { err += d; });
  const base = `http://127.0.0.1:${port}`;
  const H = { Origin: "http://localhost:5173" };
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not yet */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    const h = await (await fetch(`${base}/health`)).json();
    eq(h.bridge_level, 97, "bridge: level 97 (POST /gis/store)");
    const gj = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { us: "1" },
      geometry: { type: "Polygon", coordinates: [[[2313000, 4640000], [2313010, 4640000], [2313010, 4640010], [2313000, 4640000]]] } }] });
    const bytes = Buffer.from(gj);
    const hex = crypto.createHash("sha256").update(bytes).digest("hex");
    const at = `${base}/gis/store?sha256=${hex}&ext=geojson`;
    let r = await fetch(at, { method: "POST", headers: H });
    let j = await r.json();
    ok(r.status === 404 && j.missing, "bridge: asked before it has it → 404 missing");
    r = await fetch(`${base}/gis/store?sha256=${"0".repeat(64)}&ext=geojson`, { method: "POST", headers: { ...H, "Content-Type": "application/octet-stream" }, body: bytes });
    j = await r.json();
    ok(r.status === 422 && !j.ok, "bridge: bytes that are not the sha256 named → 422, not kept");
    r = await fetch(`${base}/gis/store?sha256=${hex}&ext=shp`, { method: "POST", headers: H });
    eq(r.status, 400, "bridge: an extension it does not read from a room → 400");
    r = await fetch(at, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: bytes });
    eq(r.status, 403, "bridge: no Origin → 403 (the /fs gate)");
    r = await fetch(at, { method: "POST", headers: { ...H, "Content-Type": "application/octet-stream" }, body: bytes });
    j = await r.json();
    ok(r.ok && j.ok && !j.cached && j.bytes === bytes.length, "bridge: the bytes kept");
    eq(j.path, path.join(fs.realpathSync(cache), hex.slice(0, 2), `${hex}.geojson`), "bridge: kept as <root>/ab/abcdef….geojson");
    const kept = j.path;
    r = await fetch(at, { method: "POST", headers: H });
    j = await r.json();
    ok(r.ok && j.cached && j.path === kept, "bridge: the second opening finds it (no bytes sent)");
    eq(fs.readdirSync(path.dirname(kept)).length, 1, "bridge: one file, no temporary left");
    r = await fetch(`${base}/gis/features`, { method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ path: kept, scene_crs: "EPSG:3004", crs: "EPSG:3004" }) });
    j = await r.json();
    ok(r.ok && j.ok && j.count === 1, `bridge: /gis/features reads the cached plan (${j.count ?? j.error})`);
    r = await fetch(`${base}/gis/features`, { method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ path: kept, scene_crs: "EPSG:32633", crs: "EPSG:3004" }) });
    j = await r.json();
    ok(r.ok && j.ok && j.layer_crs === "EPSG:3004" && Math.abs(j.features[0].coords[0][0][0] - 2313000) > 1000,
       `bridge: …reprojected EPSG:3004 → EPSG:32633 (${j.said ?? j.error})`);
    r = await fetch(`${base}/gis/features`, { method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ path: path.join(fs.realpathSync(cache), "..", "elsewhere.geojson"), scene_crs: "EPSG:3004" }) });
    eq(r.status, 404, "bridge: a path beside the cache is still outside");
  } finally {
    br.kill();
    fs.rmSync(cache, { recursive: true, force: true });
  }
  if (process.env.VERBOSE) console.error(err);
}

console.log(`room-files: ${checks} checks passed`);
