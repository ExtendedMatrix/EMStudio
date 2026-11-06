// MICRO-RIFINITURE p.7 (E.D., 6 Nov 2026: the 2013 survey of Templu Mare on the
// axes' origin) · a tileset whose root.transform is a TRUE ECEF frame
// (Metashape's Cesium export, RealityScan) lands in the study's CRS minus its
// shift through the bridge (`em_gis.relocate_true_ecef`): the datum shift by
// PROJ's best operation that is NOT a ballpark (Stereo70 is Pulkovo 1942(58)),
// the heights orthometric on EGM2008 (said when the grid cannot be had), the
// fit's residual under a centimetre; a local root is «local» (drawn as
// written), a root far from the study «far» (a file of shifted coordinates is
// the frame's case). Synthetic root: an ENU frame at Sarmizegetusa.
//
//   node scripts/check-tileset-ecef.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = [`${S3D}.venv/bin/python`, "python3"].find((p) => p === "python3" || existsSync(p));
const py = `
import json, math, sys
sys.path[:0] = [${JSON.stringify(TOOLS)}, ${JSON.stringify(S3D + "src")}]
import em_gis
from pyproj import Transformer
lon, lat, h = 22.787762, 45.515966, 521.557
x, y, z = Transformer.from_crs("EPSG:4979", "EPSG:4978", always_xy=True).transform(lon, lat, h)
L, P = math.radians(lon), math.radians(lat)
e = [-math.sin(L), math.cos(L), 0.0]
n = [-math.sin(P) * math.cos(L), -math.sin(P) * math.sin(L), math.cos(P)]
u = [math.cos(P) * math.cos(L), math.cos(P) * math.sin(L), math.sin(P)]
T = [*e, 0, *n, 0, *u, 0, x, y, z, 1]
bv = {"box": [0, 0, 5, 30, 0, 0, 0, 30, 0, 0, 0, 5]}
target = {"crs": 3844, "shift": [327372.56, 448682.65, 0]}
out = {"true": em_gis.relocate_true_ecef(T, bv, target),
       "local": em_gis.relocate_true_ecef([1,0,0,0, 0,1,0,0, 0,0,1,0, -29.4,-53.8,489.25,1], bv, target),
       "far": em_gis.relocate_true_ecef(T, bv, {"crs": 3844, "shift": [500000, 500000, 0]})}
print(json.dumps(out))
`;
const out = JSON.parse(execFileSync(PY, ["-c", py], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").pop());
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const r = out.true;
ok(r.ok && r.transform.length === 16, "a true ECEF root near the study: relocated");
ok(r.residual_max_m < 0.01, `the fit within a centimetre (${r.residual_max_m})`);
ok(!/ballpark/i.test(r.datum.operation) && /Pulkovo 1942\(58\)/.test(r.datum.operation), `the datum shift is a real one (${r.datum.operation})`);
const dx = r.transform[12], dy = r.transform[13];
ok(Math.abs(dx + 55.96) < 0.5 && Math.abs(dy + 46.50) < 0.5, `the root's origin 56 m west and 46 m south of the study's (${dx.toFixed(2)}, ${dy.toFixed(2)})`);
if (r.geoid.undulation_m !== null) ok(Math.abs(r.geoid.undulation_m - 44.4) < 0.5 && Math.abs(r.transform[14] - 477.15) < 0.5,
  `EGM2008: undulation ${r.geoid.undulation_m.toFixed(2)} m, the root at ${r.transform[14].toFixed(2)} m orthometric`);
else ok(/offline|network/i.test(r.geoid.how), `no geoid grid: said (${r.geoid.how})`);
ok(r.from_study_m < 100, "the distance to the study's origin said");
ok(!out.local.ok && out.local.error === "local", "a local root: «local», drawn as written");
ok(!out.far.ok && out.far.error === "far", "a root far from the study: «far», not taken for a true ECEF frame");
console.log(`check-tileset-ecef: ${checks} checks passed (geoid: ${r.geoid.how})`);
