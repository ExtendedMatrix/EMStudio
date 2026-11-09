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
if not OFFLINE:
    import em_geotiles
    out.update({"declared": em_gis.relocate_true_ecef(T, bv, target, datum_operation="EPSG:1645"),
                "proj_own": em_gis.relocate_true_ecef(T, bv, target, datum_operation="epsg:15995"),
                "unknown": em_gis.relocate_true_ecef(T, bv, target, datum_operation="EPSG:99999"),
                "conversion": em_gis.relocate_true_ecef(T, bv, target, datum_operation="EPSG:19926"),
                "other_datum": em_gis.relocate_true_ecef(T, bv, target, datum_operation="EPSG:1311"),
                "frame": em_geotiles.site_frame(3844, 327372.56, 448682.65),
                "frame_declared": em_geotiles.site_frame(3844, 327372.56, 448682.65, datum_operation="EPSG:1645"),
                "frame_unknown": em_geotiles.site_frame(3844, 327372.56, 448682.65, datum_operation="EPSG:99999"),
                "frame_ballpark": em_geotiles.site_frame(31700, 327300, 448370)})
print(json.dumps(out))
`;
const run = (offline, env) => JSON.parse(execFileSync(PY, ["-W", "ignore", "-c", `OFFLINE = ${offline ? "True" : "False"}\n${py}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, ...env } }).trim().split("\n").pop());
const out = run(false, {});
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

// MICRO-DATUM-DICHIARATO (9 Nov 2026) · the GeoPositionNode's declared operation
const D = out.declared;
ok(D.ok && D.datum.declared === true && D.datum.code === "EPSG:1645" && /Pulkovo 1942\(58\) to WGS 84 \(1\)/.test(D.datum.operation),
  `EPSG:1645 declared: used and said (${D.datum.operation})`);
ok(r.datum.declared === false && /\(19\)/.test(r.datum.operation), `nothing declared: PROJ's best, EPSG:15995, as before (${r.datum.operation})`);
const de = D.transform[12] - r.transform[12], dn = D.transform[13] - r.transform[13];
ok(Math.abs(de + 0.152) < 0.01 && Math.abs(dn + 0.794) < 0.01 && Math.abs(D.transform[14] - r.transform[14]) < 0.001,
  `EPSG:1645 moves the root by (${de.toFixed(3)}, ${dn.toFixed(3)}) m from EPSG:15995: (−0.152, −0.794) ± 1 cm, the height the same`);
ok(out.proj_own.ok && out.proj_own.datum.declared && out.proj_own.transform.every((v, i) => Math.abs(v - r.transform[i]) < 1e-9),
  "EPSG:15995 declared: PROJ's own operation, the same numbers as undeclared");
ok(!out.unknown.ok && /unknown to PROJ/.test(out.unknown.error) && out.unknown.datum.declared, `an unknown operation refused by name (${out.unknown.error})`);
ok(!out.conversion.ok && /conversion/.test(out.conversion.error), `a conversion declared as a datum operation refused (${out.conversion.error})`);
ok(!out.other_datum.ok && /ED50/.test(out.other_datum.error), `an operation of another datum refused (${out.other_datum.error})`);
const F = out.frame, FD = out.frame_declared;
ok(F.ok && F.datum.declared === false && /\(19\)/.test(F.datum.operation), "/geo/frame: nothing declared, PROJ's best (EPSG:15995)");
ok(FD.ok && FD.datum.code === "EPSG:1645" && Math.abs(FD.lon - F.lon) > 1e-6, `/geo/frame: the declared operation anchors the globe too (Δlon ${((FD.lon - F.lon) * 1e6).toFixed(2)} µ°)`);
ok(!out.frame_unknown.ok && /unknown to PROJ/.test(out.frame_unknown.error), "/geo/frame: an unknown operation refused");
ok(out.frame_ballpark.ok && out.frame_ballpark.datum.declared === false && Math.abs(out.frame_ballpark.lat - 45.51389) < 1e-5,
  "/geo/frame: a CRS with only a ballpark operation (EPSG:31700) answers as before, the operation said");

// p.3 · no EGM2008 grid: an empty PROJ user directory, PROJ's network unreachable —
// the grid's transform answers ±Infinity; refused in words, never NaN at the centre
const { mkdtempSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const off = run(true, { PROJ_USER_WRITABLE_DIRECTORY: mkdtempSync(`${tmpdir()}/emproj-`), PROJ_NETWORK_ENDPOINT: "http://127.0.0.1:9", PROJ_NETWORK: "OFF" });
ok(!off.true.ok && /no EGM2008 geoid/.test(off.true.error) && !JSON.stringify(off.true).includes("NaN"),
  `no grid on the disk nor through the network: refused (${off.true.error})`);
console.log(`check-tileset-ecef: ${checks} checks passed (geoid: ${r.geoid.how})`);
