// MICRO-ASSETS-3TZ · Archive › Assets on a DEFLATED .3tz (Metashape's): the
// bridge reads a tileset's tree and heads through one ZipFile, a member
// inflated only up to its head and once (a synthetic 3tz of 5000 tiles in
// < 5 s, the same numbers as the whole read), one measure per tileset at a
// time, a sample over the ceiling said «stimato», kept on disk, stopped when
// no page waits for it (assets_3tz_check.py).
//
//   node scripts/check-assets-3tz.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
const work = mkdtempSync(`${tmpdir()}/em-assets-3tz-`);
const r = spawnSync(PY, [new URL("./assets_3tz_check.py", import.meta.url).pathname, TOOLS, `${S3D}src`, work],
                    { stdio: "inherit", env: { ...process.env, EM_BRIDGE_STATE_DIR: `${work}/state` } });
process.exit(r.status ?? 1);
