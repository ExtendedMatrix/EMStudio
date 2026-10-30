// MICRO-SUITE-VERDE (24 Oct 2026) · the browser suite with a bench it makes
// for itself — no file expected in /tmp, no room that must already exist.
//
//   node scripts/suite-bench.mjs                 # every case
//   node scripts/suite-bench.mjs VS1 T1.root     # some cases
//   node scripts/suite-bench.mjs --json out.json # as check-interactions
//
// Until 24 Oct `check-interactions.mjs` read its studies from copies a past
// session had left in /tmp (`/tmp/dev33-banco/tempio.em.json`,
// `/tmp/viewer/EM/TempluMare_v3.3.em.json`, …): where a copy had gone, its
// cases were red for a reason that was not the code's. This script makes the
// bench each time, in a new folder of the system's temp, and gives the suite
// its paths in the same variables it always read:
//
// * the fs-root of the bridge: a clone of FS_SEED (the `fs/` of the
//   RISORSA-FILE report: vuota/, modelli/, base/, tabelle/, …), and in it
//   `dev33/tempio/` (the Tempio study, `_datasets/SegniSanPietro/caso-di-
//   studio-EM`) and one clone of the GT16 study per group of cases that opens
//   it (`gt16-<group>/`: a case that saves writes into its own copy only);
// * the Tempio em.json (TEMPIO_FILE), San Pietro as it was before the clean-up
//   (G3_FILE), the San Pietro of dev.17 (A_SANPIETRO);
// * the GeoTIFF of the GEOGLOBO case (GEO_ORTHO): the synthetic orthophoto of
//   that report's `make_rasters.py` (200 m at 0.1 m, EPSG:31700, the anchor
//   ringed), made here;
// * a Vite of this tree and two bridges of it (the bench's fs-root; an empty
//   one for WP1, which needs a bridge that serves none of the study's folders),
//   each on a free port, stopped at the end.
//
// The sources are READ, never written: every copy is an APFS clone (`cp -c`,
// instant and free of space until a case writes) or a plain copy elsewhere.
// Where a source is missing the script says which and stops — it does not run
// half a bench. The bench folder is removed at the end (KEEP_BENCH=1 keeps it).
//
// Sources (environment, with the defaults of E.D.'s machine):
//   FS_SEED     EMStudio/.claude/wip/reports/2026-10-22-risorsa-file/fs
//   DATASETS    ~/Documents/GitHub/_datasets
//   GT16_STUDY  …/OneDrive-CNR/…/T6.5/TempluMare_v2_for_3DR_2026-10-06
//   S3DGRAPHY_DIR (its .venv runs the bridges)  ../../s3Dgraphy
import { spawn, execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir, platform } from "node:os";

const HERE = new URL(".", import.meta.url).pathname;
const FE = new URL("..", import.meta.url).pathname;
const REPO = new URL("../..", import.meta.url).pathname;
const HOME = homedir();
const S3D = process.env.S3DGRAPHY_DIR ?? `${REPO}../s3Dgraphy/`;
const FS_SEED = process.env.FS_SEED ?? `${REPO}.claude/wip/reports/2026-10-22-risorsa-file/fs`;
const DATASETS = process.env.DATASETS ?? `${HOME}/Documents/GitHub/_datasets`;
const GT16_STUDY = process.env.GT16_STUDY ?? `${HOME}/Library/CloudStorage/OneDrive-CNR/0_RACCOLTA_CNR/`
  + "StratiGraph-grp - Documenti/WP 06 - Web Environment Development/T6.5/TempluMare_v2_for_3DR_2026-10-06";
const TEMPIO_STUDY = `${DATASETS}/SegniSanPietro/caso-di-studio-EM`;
const SANPIETRO_BEFORE = `${DATASETS}/SegniSanPietro/_lavoro-claude/Tempio_Giunone_Moneta.em.json.prima-della-pulizia-2026-10-02`;
const A_SANPIETRO = `${DATASETS}/templu-mare-prove/A_sanpietro.em.json`;
const PY = `${S3D}.venv/bin/python`;

const missing = [[FS_SEED, "FS_SEED"], [TEMPIO_STUDY, "DATASETS (the Tempio study)"], [SANPIETRO_BEFORE, "DATASETS (San Pietro before the clean-up)"],
  [A_SANPIETRO, "DATASETS (A_sanpietro)"], [`${GT16_STUDY}/EM/TempluMare_v4.em.json`, "GT16_STUDY"], [PY, "S3DGRAPHY_DIR (.venv)"]]
  .filter(([p]) => !existsSync(p));
if (missing.length) {
  for (const [p, what] of missing) console.error(`suite-bench: missing ${what}: ${p}`);
  process.exit(2);
}

// ── the bench folder, and its clones ────────────────────────────────────────
const BENCH = realpathSync(mkdtempSync(`${tmpdir()}/em-suite-`));
const clone = (from, to) => {
  mkdirSync(to.replace(/\/[^/]+$/, ""), { recursive: true });
  execFileSync("cp", platform() === "darwin" ? ["-cR", from, to] : ["-R", "--reflink=auto", from, to]);
};
const FS = `${BENCH}/fs`;
clone(FS_SEED, FS);
clone(TEMPIO_STUDY, `${FS}/dev33/tempio`);
// each group of cases opens the GT16 as it was the day they were written: the
// study folder keeps those states as E.D.'s backups of the em.json (measured
// 24 Oct: the copies the old benches had in /tmp are these files byte for
// byte). The current em.json has been reprojected and moved since (EPSG:3844,
// shift z, anchor 2015), and the cases of the globe and of the Windows paths
// measure places and counts of the older one.
const SNAPSHOT = {
  winpaths: "TempluMare_v4.em.json.bak-20261022-143029",
  pannelli: "TempluMare_v4.em.json.prima-shiftz-2026-10-23",
  glifi: "TempluMare_v4.em.json.prima-shiftz-2026-10-23",
  geo: "TempluMare_v4.em.json.prima-shiftz-2026-10-23",
  servsf: "TempluMare_v4.em.json.prima-ancora2015-2026-10-23",
};
const gt16 = (group) => {
  const at = `${FS}/gt16-${group}`;
  clone(GT16_STUDY, at);
  const snap = SNAPSHOT[group];
  if (snap) {
    if (!existsSync(`${GT16_STUDY}/EM/${snap}`)) throw new Error(`the GT16 of the ${group} cases is not there: ${GT16_STUDY}/EM/${snap}`);
    execFileSync("cp", [`${GT16_STUDY}/EM/${snap}`, `${at}/EM/TempluMare_v4.em.json`]);
  }
  return `${at}/EM`;
};
const EMPTY = `${BENCH}/empty`;
mkdirSync(EMPTY);
mkdirSync(`${BENCH}/files`);
clone(SANPIETRO_BEFORE, `${BENCH}/files/G3-sanpietro.em.json`);
clone(A_SANPIETRO, `${BENCH}/files/A_sanpietro.em.json`);
clone(`${TEMPIO_STUDY}/EM/Tempio_Giunone_Moneta.em.json`, `${BENCH}/files/tempio.em.json`);
const geo = gt16("geo");
mkdirSync(`${geo}/geo-raster`, { recursive: true });
const ORTHO = `${geo}/geo-raster/ortho_gt16_31700.tif`;
execFileSync(PY, ["-c", `
from PIL import Image, ImageDraw, TiffImagePlugin
X0, Y0, N, PX = 327300.0, 448370.0, 2000, 0.1
im = Image.new("RGB", (N, N), (196, 178, 140)); d = ImageDraw.Draw(im)
for i in range(0, N + 1, 100):
    d.line([(i, 0), (i, N)], fill=(90, 70, 40), width=3); d.line([(0, i), (N, i)], fill=(90, 70, 40), width=3)
c = N // 2
d.ellipse([c - 60, c - 60, c + 60, c + 60], outline=(200, 20, 20), width=12)
d.line([(c, 0), (c, 300)], fill=(20, 20, 200), width=16); d.polygon([(c - 60, 300), (c + 60, 300), (c, 120)], fill=(20, 20, 200))
ifd = TiffImagePlugin.ImageFileDirectory_v2()
ifd[33550] = (PX, PX, 0.0); ifd.tagtype[33550] = 12
ifd[33922] = (0.0, 0.0, 0.0, X0 - 100, Y0 + 100, 0.0); ifd.tagtype[33922] = 12
ifd[34735] = (1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 31700); ifd.tagtype[34735] = 3
im.save(${JSON.stringify(ORTHO)}, tiffinfo=ifd, compression="tiff_deflate")
`]);

// ── the servers: a Vite and two bridges of this tree, on free ports ─────────
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const children = [];
const start = (cmd, args, opts) => {
  const c = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], detached: true, ...opts });
  let tail = "";
  const keep = (d) => { tail = (tail + d).slice(-2000); };
  c.stdout.on("data", keep); c.stderr.on("data", keep);
  children.push({ c, tail: () => tail });
  return c;
};
const until = async (what, url, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${what} did not answer at ${url}`);
};
let code = 1;
const stop = () => {
  for (const { c } of children) { try { process.kill(-c.pid, "SIGTERM"); } catch { /* gone */ } }
  if (!process.env.KEEP_BENCH) { try { rmSync(BENCH, { recursive: true, force: true }); } catch { /* */ } }
  else console.log(`suite-bench: bench kept at ${BENCH}`);
};
process.on("SIGINT", () => { stop(); process.exit(130); });
try {
  const [vite, bridge, empty] = [await freePort(), await freePort(), await freePort()];
  start("npx", ["vite", "--port", String(vite), "--strictPort"], { cwd: FE });
  // MICRO-OTTIMIZZA-3 · the bench's Blender is the FAKE of the checks (this
  // machine's real Blender answers differently tomorrow), the runner and the
  // add-ons in the bench, never in the app's data folder
  const fakeBlender = `${BENCH}/Blender`;
  execFileSync("cp", [`${HERE}fake-blender.py`, fakeBlender]);
  chmodSync(fakeBlender, 0o755);
  start(PY, [`${REPO}tools/em_bridge.py`, "--port", String(bridge), "--fs-root", FS], { cwd: REPO,
    env: { ...process.env, EM_BLENDER: fakeBlender, EM_ADDONS_DIR: `${BENCH}/addons` } });
  start(PY, [`${REPO}tools/em_bridge.py`, "--port", String(empty), "--fs-root", EMPTY], { cwd: REPO });
  await until("Vite", `http://localhost:${vite}/em/studio/`);
  await until("the bridge", `http://localhost:${bridge}/health`);
  await until("the empty bridge", `http://127.0.0.1:${empty}/health`);
  const B = `http://localhost:${bridge}`;
  const env = {
    ...process.env, PORT: String(vite), BRIDGE: B, FS_ROOT: FS,
    VIEWER_V33: `${gt16("viewer")}/TempluMare_v3.3.em.json`, VIEWER_BRIDGE: B,
    WINPATHS_V4: `${gt16("winpaths")}/TempluMare_v4.em.json`, WINPATHS_BRIDGE: `http://127.0.0.1:${empty}`,
    PANNELLI_V4: `${gt16("pannelli")}/TempluMare_v4.em.json`,
    GLIFI_V4: `${gt16("glifi")}/TempluMare_v4.em.json`,
    GEO_V4: `${geo}/TempluMare_v4.em.json`, GEO_BRIDGE: B, GEO_ORTHO: ORTHO,
    SERVSF_V4: `${gt16("servsf")}/TempluMare_v4.em.json`,
    GEOREF_V4: `${gt16("georef")}/TempluMare_v4.em.json`, GEOREF_BRIDGE: B,
    TEMPIO_FILE: `${BENCH}/files/tempio.em.json`, G3_FILE: `${BENCH}/files/G3-sanpietro.em.json`,
    A_SANPIETRO: `${BENCH}/files/A_sanpietro.em.json`, SUITE_BENCH: BENCH,
  };
  if (!env.SHOTS) { env.SHOTS = `${BENCH}/shots`; mkdirSync(env.SHOTS); }
  console.log(`suite-bench: ${BENCH} · Vite ${vite} · bridge ${bridge} (fs-root) · bridge ${empty} (empty)`);
  const run = spawn(process.execPath, [`${HERE}check-interactions.mjs`, ...process.argv.slice(2)], { stdio: "inherit", env, cwd: FE });
  code = await new Promise((res) => run.on("exit", (c) => res(c ?? 1)));
} catch (err) {
  console.error(`suite-bench: ${err.message}`);
  for (const { tail } of children) if (tail()) console.error(tail().slice(-600));
} finally {
  stop();
}
process.exit(code);
