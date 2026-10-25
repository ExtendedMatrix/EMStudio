// MICRO-GEOGLOBO · the bridge's side of the globe (`tools/em_geotiles.py`):
//   1. PMTiles v3 written in Python and read back — and read by the reference
//      reader (the `pmtiles` package the tiles renderer itself uses), leaf
//      directories included; the Hilbert ids of the spec;
//   2. the disk cache: LRU by access, under its ceiling;
//   3. a raster: a GeoTIFF made here in EPSG:31700 (the GT16's CRS) is
//      reprojected to Web Mercator and its tiles agree with the original pixel
//      for pixel (> 95 %: the rest are the edges of its lines); a DEM too; a
//      TIFF without georeference is refused, by name;
//   4. a bridge started for real on a temporary folder (no network asked): the
//      site frame; a tile from the project's package with the network off
//      (`X-EM-Tile: package`); OSM refused for «Estrai area» (403); a terrain
//      tile beyond the source cut from its parent; an empty raster tile is a PNG
//      a browser decodes; a raster imported as a job; the cache's ceiling set.
//
//   node scripts/check-geotiles.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { PMTiles } from "pmtiles";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? (existsSync(`${S3D}.venv/bin/python`) ? `${S3D}.venv/bin/python` : "python3");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, `${m} — got ${JSON.stringify(a)}`); checks++; };

const dir = realpathSync(mkdtempSync(`${tmpdir()}/geotiles-`));
const state = `${dir}/state`;
mkdirSync(`${dir}/study/geo`, { recursive: true });
const run = (code) => {
  const r = spawnSync(PY, ["-c", `import json, sys, os\nsys.path.insert(0, ${JSON.stringify(TOOLS)})\nos.environ["EM_BRIDGE_STATE_DIR"] = ${JSON.stringify(state)}\nimport em_geotiles as G\n${code}`], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout.trim().split("\n").pop());
};

// ── 1 · PMTiles ─────────────────────────────────────────────────────────────
{
  eq(run(`print(json.dumps([G.zxy_to_tileid(0,0,0), G.zxy_to_tileid(1,0,0), G.zxy_to_tileid(1,0,1), G.zxy_to_tileid(1,1,1), G.zxy_to_tileid(1,1,0), G.zxy_to_tileid(12,3423,1763)]))`),
    [0, 1, 2, 3, 4, 19078479], "the Hilbert tile ids of the PMTiles spec (z1 in curve order; z12 3423/1763 = 19078479)");
  const w = run(`
import random
random.seed(1)
tiles = []
for z in range(0, 9):
    for x in range(1 << z):
        for y in range(1 << z):
            if z >= 7 and random.random() < 0.5: continue
            tiles.append(((z, x, y), b"same" if (x + y) % 3 == 0 else f"t{z}/{x}/{y}".encode()))
info = G.write_pmtiles(${JSON.stringify(dir)} + "/t.pmtiles", tiles, tile_type="png", metadata={"source": "x", "name": "t"})
a = G.PMTiles(${JSON.stringify(dir)} + "/t.pmtiles")
bad = sum(1 for (k, v) in tiles if a.get(*k) != v)
have = set(k for k, _ in tiles)
ghost = sum(1 for x in range(256) for y in range(256) if (8, x, y) not in have and a.get(8, x, y) is not None)
print(json.dumps({**info, "bad": bad, "ghost": ghost, "n": len(tiles), "meta": a.metadata()}))`);
  eq([w.bad, w.ghost, w.tiles, w.leaves], [0, 0, w.n, true], `${w.n} tiles written and read back, none invented where none was written, the root split into leaves`);
  ok(w.contents < w.tiles, `identical tiles stored once (${w.contents} contents for ${w.tiles} tiles)`);
  eq(w.meta, { source: "x", name: "t" }, "the metadata");
  // the reference reader
  const buf = readFileSync(`${dir}/t.pmtiles`);
  const src = { getKey: () => "t", getBytes: async (o, l) => ({ data: buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + l) }) };
  const P = new PMTiles(src);
  const h = await P.getHeader();
  eq([h.minZoom, h.maxZoom, h.tileType, h.numAddressedTiles], [0, 8, 2, w.n], "the reference reader (pmtiles 4.5.0) reads the header");
  const t = await P.getZxy(5, 3, 7);
  eq(Buffer.from(t.data).toString(), "t5/3/7", "…and a tile, through a leaf directory");
  eq(Buffer.from((await P.getZxy(8, 0, 0)).data).toString(), "same", "…and a deduplicated one");
  eq(await P.getMetadata(), { source: "x", name: "t" }, "…and the metadata");
}

// ── 2 · the cache ───────────────────────────────────────────────────────────
{
  const c = run(`
import time
c = G.TileCache(G.pathlib.Path(${JSON.stringify(dir)}) / "cache")
for i in range(40):
    c.put("s", 10, i, 0, "png", bytes(1024))
    p = c._file("s", 10, i, 0, "png")
    os.utime(p, (1000 + i, 1000 + i))
c.get("s", 10, 0, 0, "png")          # the oldest, read now: the LRU keeps it
c.root.mkdir(parents=True, exist_ok=True)
(c.root / "config.json").write_text(json.dumps({"limit_mb": 20 / 1024}))
gone = c.evict()
left = sorted(int(p.stem) if False else int(p.parent.name) for p in (c.root / "tiles" / "s" / "10").glob("*/0.png"))
print(json.dumps({"gone": gone, "left": left, "stats": c.stats()["tiles"]}))`);
  ok(c.gone > 0 && c.stats <= 18, `over its ceiling (20 kB), the cache goes back under 90 % of it (${c.gone} gone, ${c.stats} left)`);
  ok(c.left.includes(0) && !c.left.includes(1), "the least recently USED go first: tile 0 was read last and stays, tile 1 goes");
}

// ── 3 · rasters ─────────────────────────────────────────────────────────────
const rasters = run(`
from PIL import Image, ImageDraw, TiffImagePlugin
from pyproj import Transformer
import io, math, random
def geotiff(im, path, x0, y0, px, epsg):
    ifd = TiffImagePlugin.ImageFileDirectory_v2()
    ifd[33550] = (float(px), float(px), 0.0); ifd.tagtype[33550] = 12
    ifd[33922] = (0.0, 0.0, 0.0, float(x0), float(y0), 0.0); ifd.tagtype[33922] = 12
    ifd[34735] = (1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, epsg); ifd.tagtype[34735] = 3
    im.save(path, tiffinfo=ifd, compression="tiff_deflate")
D = ${JSON.stringify(dir)} + "/study"
im = Image.new("RGB", (1000, 1000), (196, 178, 140)); d = ImageDraw.Draw(im)
for i in range(0, 1001, 100):
    d.line([(i, 0), (i, 1000)], fill=(90, 70, 40), width=3); d.line([(0, i), (1000, i)], fill=(90, 70, 40), width=3)
d.ellipse([440, 440, 560, 560], outline=(200, 20, 20), width=12)
geotiff(im, D + "/ortho.tif", 327250, 448420, 0.1, 31700)
dem = Image.new("F", (200, 200)); px = dem.load()
for r in range(200):
    for c in range(200): px[c, r] = 480 + c * 0.1 + r * 0.05
geotiff(dem, D + "/dem.tif", 327200, 448470, 1.0, 31700)
Image.new("RGB", (10, 10)).save(D + "/plain.tif")
info = G.raster_info(D + "/ortho.tif", None, 31700)
res = G.import_raster(D + "/ortho.tif")
a = G.PMTiles(res["path"])
t = Transformer.from_crs(31700, 3857, always_xy=True)
Z = res["max_zoom"]; size = 2 * G.MERC_HALF / (1 << Z); cache = {}; agree = n = 0
random.seed(3)
for _ in range(2000):
    c, r = random.uniform(5, 995), random.uniform(5, 995)
    mx, my = t.transform(327250 + c * 0.1, 448420 - r * 0.1)
    fx, fy = (mx + G.MERC_HALF) / size, (G.MERC_HALF - my) / size
    k = (int(fx), int(fy))
    if k not in cache:
        b = a.get(Z, *k); cache[k] = Image.open(io.BytesIO(b)).convert("RGB") if b else None
    if cache[k] is None: continue
    p = cache[k].getpixel((int((fx - k[0]) * 256), int((fy - k[1]) * 256))); s = im.getpixel((int(c), int(r)))
    n += 1; agree += sum(abs(p[i] - s[i]) for i in range(3)) < 60
dres = G.import_raster(D + "/dem.tif")
try:
    G.import_raster(D + "/plain.tif"); plain = "accepted"
except ValueError as e:
    plain = str(e)
print(json.dumps({"info": info, "res": {k: res[k] for k in ("min_zoom", "max_zoom", "kind", "tiles")}, "agree": agree / max(1, n), "n": n,
                  "dem": {k: dres[k] for k in ("kind", "elevation", "max_zoom")}, "plain": plain, "orig_kept": os.path.getsize(D + "/ortho.tif") > 0}))`);
{
  const r = rasters;
  eq([r.info.epsg, r.info.width, r.info.kind, r.info.corners_target[0]], [31700, 1000, "image", [327250, 448320]], "the GeoTIFF's georeference read from its own tags (EPSG, size, its SW corner in the target CRS)");
  ok(r.info.corners_wgs84[0][1] > 45.5 && r.info.corners_wgs84[0][1] < 45.52, "…in lon/lat, where the GT16 is");
  eq([r.res.min_zoom, r.res.kind], [0, "image"], "imported: every level down to z0");
  ok(r.res.max_zoom >= 20 && r.res.max_zoom <= 21, `…the deepest at its own resolution (0.1 m → z${r.res.max_zoom})`);
  ok(r.agree > 0.95 && r.n > 1500, `reprojected to Web Mercator: ${(r.agree * 100).toFixed(1)} % of ${r.n} pixels agree with the original (the rest: the edges of its lines)`);
  eq([r.dem.kind, r.dem.elevation.map((v) => Math.round(v * 10) / 10)], ["dem", [480, 509.9]], "a DEM: its elevation range, drawn as an image");
  ok(/no georeference/.test(r.plain), "a TIFF without georeference is refused, by name");
  ok(r.orig_kept, "the original stays where it was (the document)");
}

// ── 4 · a bridge, for real, without network ─────────────────────────────────
const port = await new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
// a package of the project: two tiles of Sentinel-2 at the GT16, written here
run(`
G.write_pmtiles(${JSON.stringify(dir)} + "/study/geo/s2.pmtiles", [((14, 9229, 5860), b"JPEGBYTES"), ((13, 4614, 2930), b"JPEGPARENT")],
                tile_type="jpg", metadata={"source": "s2cloudless-2016"}, bounds=(22.7, 45.4, 22.9, 45.6))
print(json.dumps(1))`);
let bridge2 = null;
const bridge = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", dir, "--s3dgraphy", `${S3D}src`],
  { env: { ...process.env, EM_BRIDGE_STATE_DIR: state }, stdio: ["ignore", "ignore", "pipe"] });
let log = "";
bridge.stderr.on("data", (d) => { log += d; });
const B = `http://127.0.0.1:${port}`;
const O = { origin: "http://localhost:5173" };
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${B}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 150)); }
  const health = await (await fetch(`${B}/health`)).json();
  eq(health.bridge_level, 40, "the bridge's level: 40 (/tiles, /geo, /tiles/failures, /geo/crs-info; 39 /fs/pack-3tz with root; 40 /geo/tileset-frame)");
  // MICRO tileset, shift e epoche · the Basilica Iulia's root (RealityScan,
  // E−291407 N−4640813 declared as EPSG:6708: on the equator) back in Rome
  {
    const root = { transform: [-0.18243234, 0.98321841, 0, 0, -1.97e-06, -3.6e-07, 1, 0, 0.98321841, 0.18243234, 2e-06, 0, 6271099.97842686, 1163587.23952703, 12.30475555, 1],
      bounding_volume: { box: [-4.6006813, -2.48278046, 6.83278513, 94.20596313, 0, 0, 0, 49.0687027, 0, 0, 0, 12.45930481] },
      frame: { crs: "EPSG:6708", shift: [291407, 4640813, 0] } };
    const post = (b) => fetch(`${B}/geo/tileset-frame`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify(b) });
    const ecef = await (await post(root)).json();
    ok(ecef.ok && Math.abs(ecef.true.lat - 41.8918) < 1e-3 && Math.abs(ecef.true.lon - 12.4860) < 1e-3 && ecef.residual_max_m < 0.001,
      `/geo/tileset-frame: the Basilica back in Rome (lat ${ecef.true?.lat?.toFixed(4)}, lon ${ecef.true?.lon?.toFixed(4)}), fit residual ${(ecef.residual_max_m * 1000).toFixed(3)} mm`);
    const study = await (await post({ ...root, target: { crs: "EPSG:6708", shift: [291407, 4640813, 0] } })).json();
    ok(study.ok && Math.abs(study.true.x - 28.11) < 0.05 && Math.abs(study.true.y - 9.85) < 0.05 && study.transform.length === 16,
      "/geo/tileset-frame: into the study's frame (its shift = the file's): the file's own grid");
    eq((await post({ ...root, frame: { shift: [1, 2, 3] } })).status, 422, "/geo/tileset-frame: a frame without a CRS is refused by name");
  }
  // MICRO-GEOREF-GRAFO · the GT16's CRS, as PROJ's database knows it
  const c31700 = await (await fetch(`${B}/geo/crs-info?epsg=31700&x=327372.56&y=448682.65`, { headers: O })).json();
  eq([c31700.deprecated, c31700.replacements.map((r) => [r.epsg, r.same_grid]), c31700.to_wgs84?.ballpark, c31700.to_wgs84?.accuracy],
    [true, [[3844, true]], true, null], "/geo/crs-info: EPSG:31700 is deprecated, PROJ's database gives 3844 (the same grid), its operation a ballpark of unknown accuracy");
  eq([c31700.replacements[0].to_wgs84?.name, c31700.replacements[0].to_wgs84?.accuracy], ["Pulkovo 1942(58) to WGS 84 (19)", 3], "…3844's operation at the shift: Pulkovo 1942(58) to WGS 84 (19), 3 m");
  const c3844 = await (await fetch(`${B}/geo/crs-info?epsg=3844&x=327372.56&y=448682.65`, { headers: O })).json();
  eq([c3844.name, c3844.deprecated, c3844.to_wgs84?.ballpark], ["Pulkovo 1942(58) / Stereo70", false, false], "/geo/crs-info: 3844, nothing to say");
  eq((await fetch(`${B}/geo/crs-info?epsg=999999`, { headers: O })).status, 422, "/geo/crs-info: a code PROJ does not know, refused by name");
  const same = await (await fetch(`${B}/geo/convert-shift`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify({ from: 31700, to: 3844, x: 327372.56, y: 448682.65 }) })).json();
  eq([same.same_grid, same.x, same.y, same.op], [true, 327372.56, 448682.65, null], "/geo/convert-shift: the same grid, the same numbers");
  const utm = await (await fetch(`${B}/geo/convert-shift`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify({ from: 3844, to: 32634, x: 327372.56, y: 448682.65 }) })).json();
  ok(!utm.same_grid && Math.abs(utm.x - 639685.86) < 0.05 && Math.abs(utm.y - 5041873.94) < 0.05 && utm.op?.accuracy === 3, "/geo/convert-shift: another grid, reprojected with its operation's accuracy (UTM 34N, 3 m)");
  const f = await (await fetch(`${B}/geo/frame`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify({ epsg: 31700, x: 327300, y: 448370, z: 500, rotation: 0 }) })).json();
  ok(Math.abs(f.lat - 45.51389) < 1e-5 && Math.abs(f.lon - 22.78921) < 1e-5 && Math.abs(f.azimuth + 1.584) < 0.01, "/geo/frame: the GT16's anchor by PROJ, and the grid's north");
  const rot = await (await fetch(`${B}/geo/frame`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify({ epsg: 31700, x: 327300, y: 448370, z: 500, rotation: 10 }) })).json();
  ok(Math.abs(rot.azimuth - f.azimuth - 10) < 1e-9, "…a rotation of the GeoPositionNode turns the scene's north with it");
  const pkg = encodeURIComponent(`${dir}/study/geo`);
  const t = await fetch(`${B}/tiles/xyz/s2cloudless-2016/14/9229/5860.jpg?pkg=${pkg}&offline=1`, { headers: O });
  eq([t.status, t.headers.get("x-em-tile"), Buffer.from(await t.arrayBuffer()).toString()], [200, "package:s2.pmtiles", "JPEGBYTES"], "a tile from the project's package, the network off");
  const miss = await fetch(`${B}/tiles/xyz/s2cloudless-2016/14/1/1.jpg?pkg=${pkg}&offline=1`, { headers: O });
  const png = Buffer.from(await miss.arrayBuffer());
  eq([miss.status, miss.headers.get("x-em-tile"), png.subarray(1, 4).toString()], [200, "offline", "PNG"], "a tile nobody has, offline: an empty PNG (drawn as nothing)");
  const dec = spawnSync(PY, ["-c", "import sys, io; from PIL import Image; Image.open(io.BytesIO(sys.stdin.buffer.read())).load(); print('ok')"], { input: png, encoding: "utf8" });
  eq(dec.stdout.trim(), "ok", "…a PNG that decodes (a broken one made the overlay throw «could not be decoded», measured)");
  const terr = await fetch(`${B}/tiles/xyz/mapterhorn/9/1/1.webp?offline=1`, { headers: O });
  eq(terr.status, 404, "a terrain tile nobody has: 404, never an image (an empty one would decode to −32768 m)");
  const osm = await fetch(`${B}/tiles/extract`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify({ source: "osm", bbox: [22.78, 45.51, 22.8, 45.52], zmax: 15, dest: `${dir}/study/geo` }) });
  eq([osm.status, (await osm.json()).code], [403, "offline-forbidden"], "«Estrai area» of OpenStreetMap: refused by the bridge (its terms)");
  const big = await fetch(`${B}/tiles/extract`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify({ source: "s2cloudless-2016", bbox: [20, 44, 25, 47], zmax: 15, dest: `${dir}/study/geo` }) });
  eq([big.status, (await big.json()).code], [413, "too-many-tiles"], "…a box too large for one extract: said, with the count");
  const out = await fetch(`${B}/tiles/extract`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify({ source: "s2cloudless-2016", bbox: [22.78, 45.51, 22.8, 45.52], zmax: 15, dest: "/etc" }) });
  eq(out.status, 403, "…into a folder this bridge does not serve: refused");
  const noOrigin = await fetch(`${B}/tiles/xyz/s2cloudless-2016/14/9229/5860.jpg?pkg=${pkg}&offline=1`);
  eq(noOrigin.status, 403, "the tile routes read the disk: the /fs gate (no Origin, no same-origin: refused)");
  // a raster as a job, its tiles by /tiles/pm
  const j = await (await fetch(`${B}/geo/raster-import`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify({ path: `${dir}/study/dem.tif` }) })).json();
  let job = j;
  for (let i = 0; i < 100 && job.state === "running"; i++) { await new Promise((r) => setTimeout(r, 150)); job = await (await fetch(`${B}/tiles/job?id=${j.job}`, { headers: O })).json(); }
  eq([job.state, job.result?.kind], ["done", "dem"], "/geo/raster-import: a job, done");
  const z = job.result.max_zoom;
  const [x0, y0] = [Math.floor(((22.789 + 180) / 360) * 2 ** z), Math.floor(((1 - Math.asinh(Math.tan((45.5135 * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z)];
  const pm = await fetch(`${B}/tiles/pm/${z}/${x0}/${y0}.png?path=${encodeURIComponent(job.result.path)}`, { headers: O });
  eq([pm.status, pm.headers.get("content-type")], [200, "image/png"], "/tiles/pm: a tile of the raster's package");
  const prev = await fetch(`${B}/geo/raster-preview?path=${encodeURIComponent(`${dir}/study/ortho.tif`)}&max=256`, { headers: O });
  eq([prev.status, prev.headers.get("content-type")], [200, "image/png"], "/geo/raster-preview: the GeoTIFF as a PNG (the Viewer's)");
  const plain = await fetch(`${B}/geo/raster-info?path=${encodeURIComponent(`${dir}/study/plain.tif`)}`, { headers: O });
  eq([plain.status, (await plain.json()).code], [422, "no-georef"], "/geo/raster-info of a TIFF without georeference: said");
  const c = await (await fetch(`${B}/tiles/cache`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify({ limit_mb: 64 }) })).json();
  eq([c.limit_bytes, c.dir], [64 * 1048576, `${state}/geo/cache`], "/tiles/cache: the ceiling set, kept in the app's folder");
  const gm = await (await fetch(`${B}/tiles/globe-min`, { headers: O })).json();
  eq([gm.plan.imagery, gm.packages], [{ source: "s2cloudless-2016", zmax: 6 }, []], "/tiles/globe-min: the plan (Sentinel-2 z0–z6), nothing downloaded yet");
  eq([gm.status.imagery.state, gm.last_job], ["absent", null], "…its status read from the folder: absent, no job yet");
  // MICRO-GLOBO-INTERAZIONE p.3 · the globe minimum stays: a package on disk (z0–z6, every tile
  // the same few bytes) is present for this bridge, for a NEW one (a restart, a reinstall),
  // and after a job that failed (no network): the file untouched, the failure said beside it
  run(`
os.makedirs(${JSON.stringify(state)} + "/geo/globe", exist_ok=True)
tiles = [((z, x, y), b"JPEG") for z in range(7) for x in range(1 << z) for y in range(1 << z)]
G.write_pmtiles(${JSON.stringify(state)} + "/geo/globe/s2cloudless-2016-z0-6.pmtiles", tiles, tile_type="jpg",
                metadata={"source": "s2cloudless-2016", "name": "globe minimum s2cloudless-2016"})
print(json.dumps(1))`);
  const pkgFile = `${state}/geo/globe/s2cloudless-2016-z0-6.pmtiles`;
  const st0 = statSync(pkgFile);
  const gm1 = await (await fetch(`${B}/tiles/globe-min`, { headers: O })).json();
  eq([gm1.status.imagery.state, gm1.status.imagery.max_zoom], ["present", 6], "a package down to z6 in the app's folder: present");
  bridge.kill();
  await new Promise((r) => setTimeout(r, 300));
  const port2 = await new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
  bridge2 = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port2), "--fs-root", dir, "--s3dgraphy", `${S3D}src`],
    { env: { ...process.env, EM_BRIDGE_STATE_DIR: state, HTTPS_PROXY: "http://127.0.0.1:9", https_proxy: "http://127.0.0.1:9" }, stdio: ["ignore", "ignore", "pipe"] });
  const B2 = `http://127.0.0.1:${port2}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${B2}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 150)); }
  const gm2 = await (await fetch(`${B2}/tiles/globe-min`, { headers: O })).json();
  eq([gm2.status.imagery.state, gm2.last_job], ["present", null], "a NEW bridge on the same folder (a restart, a reinstall): present, read from the file");
  const jj = await (await fetch(`${B2}/tiles/globe-min`, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: JSON.stringify({ what: "imagery" }) })).json();
  let jb = jj;
  for (let i = 0; i < 200 && jb.state === "running"; i++) { await new Promise((r) => setTimeout(r, 150)); jb = await (await fetch(`${B2}/tiles/job?id=${jj.job}`, { headers: O })).json(); }
  eq(jb.state, "failed", "a download with no network: the job fails (its first block of failures)");
  const gm3 = await (await fetch(`${B2}/tiles/globe-min`, { headers: O })).json();
  eq([gm3.status.imagery.state, gm3.last_job?.state], ["present", "failed"], "…and the package is still present; the failure is said beside it, not instead of it");
  const st1 = statSync(pkgFile);
  eq([st1.size, st1.mtimeMs], [st0.size, st0.mtimeMs], "…the file untouched by the failed job");
} finally {
  bridge.kill();
  bridge2?.kill();
}

console.log(`geotiles: ${checks} checks passed`);
