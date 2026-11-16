// MICRO-E-PORTA-VERSIONI-COLORI p.1 · executable check of src/door.ts: what a
// file is for «Porta dentro…», the same answer as s3Dgraphy's door.kind_of
// (PARITY, with s3Dgraphy next door), the roles asked, a Tropy export known.
//
//   node scripts/check-door.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({ entryPoints: [`${SRC}door.ts`], bundle: true, format: "esm", write: false, logLevel: "silent" });
const D = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const NAMES = ["../RB/cesium/Survey_2015_egm2008.3tz", "t/tileset.json", "x.OBJ", "a.glb", "c.dxf", "v.shp", "g.gpkg", "s.geojson",
  "f.jpg", "f.tif", "s.em.json", "s.graphml", "p.tpy", "p.jsonld", "n.pdf", "l.laz"];
eq(NAMES.map((n) => D.doorKindOf(n)), ["tileset", "tileset", "model", "model", "dxf", "vector", "vector", "vector",
  "image", "image", "graph", "graph", "tropy", "tropy", "other", "model"], "kinds");
eq(D.doorKindOf("f.jpg", true), "raster", "a picture with a frame is a raster");
eq(D.doorRoles("model", true), ["rm", "rmdoc", "source"], "a mesh with a tileset can be its source");
eq(D.doorRoles("model", false), ["rm", "rmdoc"], "a mesh alone: RM or RMDoc");
eq(D.doorRoles("dxf", false), [], "a GIS file: its role is not asked (RMDoc)");
eq(D.forTheDoor(["a.em.json"]), false, "an em.json opens as a graph");
eq(D.forTheDoor(["a.em.json", "b.obj"]), true, "a model is the door's");
eq(D.looksLikeTropy({ "@context": "https://tropy.org/v1/contexts/item.jsonld", "@graph": [] }), true, "Tropy by its context");
eq(D.looksLikeTropy({ "@graph": [{ photo: [] }] }), true, "Tropy by its items");
eq(D.looksLikeTropy({ graphs: {} }), false, "an em.json is not Tropy");
// MICRO-F p.2 · a dropped tileset at the door: what its preview read travels with it
const tl = (o) => ({ dropId: "x", form: "package", formSaid: "", pos: "", posWarn: false, recentred: false, packaging: "archive", nameOnly: false, ...o });
eq(D.doorTilesetOut({ name: "disco", tileset: tl({ nameOnly: true }), url: "disco.zip", size_bytes: 15540 }, null),
  { kind: "tileset", packaging: "archive", name_only: true, url: "disco.zip", size_bytes: 15540 }, "a drop with no path: its name, said so");
eq(D.doorTilesetOut({ name: "T", path: "/a/T/tileset.json", tileset: tl({ form: "folder", packaging: "directory" }) }, "sha256:ab"),
  { kind: "tileset", packaging: "directory", checksum: "sha256:ab" }, "a folder on disk: directory, its entry's digest");
eq(D.doorTilesetOut({ name: "x.obj", path: "/x.obj" }, null), {}, "any other file: nothing more");
const S3D = path.resolve(new URL("../../../s3Dgraphy", import.meta.url).pathname);
if (fs.existsSync(path.join(S3D, "src/s3dgraphy/door.py"))) {
  const PY = [path.join(S3D, ".venv/bin/python"), "python3"].find((p) => p === "python3" || fs.existsSync(p));
  const py = JSON.parse(execFileSync(PY, ["-c", `import json,sys
sys.path.insert(0, ${JSON.stringify(path.join(S3D, "src"))})
from s3dgraphy.door import kind_of
print(json.dumps([kind_of(n) for n in ${JSON.stringify(NAMES)}] + [kind_of("f.jpg", georeferenced=True)]))`], { encoding: "utf8" }));
  eq([...NAMES.map((n) => D.doorKindOf(n)), D.doorKindOf("f.jpg", true)], py, "parity with s3dgraphy.door.kind_of");
}
console.log(`check-door: ${checks} checks passed`);
