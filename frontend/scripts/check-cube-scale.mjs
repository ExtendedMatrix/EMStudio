// MICRO-MF08 (E.D., 22 Nov 2026) · THE CUBE AT A FUNCTIONAL SCALE, AND SEVERAL
// CUBES IN SYNC — under embargo (features.ts: landscape-cube), the lab build only.
//
//   node scripts/check-cube-scale.mjs
//   (page part: own Vite + own bridge; PLAYWRIGHT_CORE / CHR as
//    check-landscape-cube.mjs; skipped, and said, without them. The real case —
//    Sarmizegetusa's landscape and Templu Mare fu-prova with its proxies — when
//    they are on the machine (LAND=, TEMPLU_FU=, PROXIES=); SHOTS=<dir> keeps
//    pictures)
//
//   1 · the RULES: the texts of the scale (EN + IT) only in the LAB_TEXTS
//       blocks; the hooks behind LC_ON;
//   2 · the PURE parts (node): the horizon of one window found among another's
//       lanes (id, name, widest overlap), the step of the scales, the units a
//       scale shows (entering a wider one), the volumes, the rooms, the
//       elements read at that scale, the symbols of the units with no outline,
//       the hull of a presence at the scale of the territory;
//   3 · the BRIDGE: by_scale, the lineage, the volume, absent; the landscape's
//       handles and hulls, the common coordinates;
//   4 · the PAGE (lab dev server, switch on): the scale chooser, a double click
//       ENTERS a volume (one scale down, the focus kept, the selection
//       untouched), ↑ ↓, two Cubes side by side in sync (a drag turns both on
//       the same frames with no redraw, the horizon and the focus shared), the
//       territory of the landscape beside the building of the temple bound to
//       its site; switch off: none;
//   5 · the REAL case: Sarmizegetusa at the scale of the territory beside the
//       temple of S15 at the scale of the building, its rooms, the same
//       coordinates (EPSG:3844).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import * as esbuild from "esbuild";

const FE = new URL("..", import.meta.url).pathname;
const ROOT = path.resolve(FE, "..");
const SRC = path.join(FE, "src");
let checks = 0;
const trace = process.env.CHECK_TRACE ? (w) => console.error(`· ${w}`) : () => {};
const ok = (c, what) => { assert.ok(c, what); checks++; trace(what); };
const eq = (a, b, what) => { assert.deepEqual(a, b, `${what} — got ${JSON.stringify(a)}`); checks++; trace(what); };
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── 1 · the rules ────────────────────────────────────────────────────────────
const main = read("frontend/src/main.ts");
const i18n = read("frontend/src/i18n.ts");
const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]);
const openI18n = i18n.replace(/\.\.\.\(LAB_TEXTS \? \{[\s\S]*?\n  \} : \{\}\),/g, "");
const lcSrc = read("frontend/src/landscape-cube.ts");
const keys = new Set([...lcSrc.matchAll(/"(lc\.(?:fs|sync|besides|legend\.volume)[\w.]*)"/g)].map((m) => m[1]));
for (const k of ["lc.fs.label", "lc.fs.all", "lc.fs.count", "lc.fs.none", "lc.fs.noneIn", "lc.sync", "lc.syncTitle", "lc.besidesTitle", "lc.legend.volume"]) keys.add(k);
eq(labBlocks.length, 2, "two LAB_TEXTS blocks (EN, IT)");
eq([...keys].filter((k) => !labBlocks.every((b) => b.includes(`"${k}":`))), [], `the texts of the scale (${keys.size}) in both LAB_TEXTS blocks`);
eq([...keys].filter((k) => openI18n.includes(`"${k}"`)), [], "…and none in the open dictionaries");
eq(["territory", "complex", "building", "room", "component"].filter((s) => !labBlocks.every((b) => b.includes(`"fm.scale.${s}":`))), [],
   "the names of the five scales (fm.scale.*) in both");
{
  const at = main.indexOf("cubeEnter:");
  ok(at > 0 && /\.\.\.\(LC_ON \? \{ landscapeCube:/.test(main.slice(Math.max(0, at - 3000), at)), "the hooks of the scale sit in the LC_ON block");
  const bes = main.indexOf("besides: (winId: string) =>");
  ok(bes > 0 && /if \(LC_ON\) \{\n  setLandscapeCubeHost\(/.test(main.slice(Math.max(0, bes - 3500), bes)), "…the host's «beside» only with LC_ON");
}

// ── 2 · the pure parts ──────────────────────────────────────────────────────
const paletteStub = { name: "palette-stub", setup(b) {
  b.onResolve({ filter: /\/palette$/ }, () => ({ path: "palette-stub", namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents:
    "export const nodeStyle = (t) => ({ border: '#000', fill: '#fff', shape: 'rectangle', textColor: '#000' });", loader: "js" }));
} };
async function load(file) {
  const b = await esbuild.build({ entryPoints: [path.join(SRC, file)], bundle: true, format: "esm", write: false, logLevel: "silent",
    plugins: [paletteStub], banner: { js: "const __noGlob = () => ({});" },
    define: { __EM_LAB__: "true", "import.meta.glob": "__noGlob" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
}
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const LC = await load("landscape-cube.ts");
const tt = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
{
  const graphLanes = [{ id: "E4", name: "Oggi", start: 1801, end: 2026 }, { id: "E3", name: "Post", start: 200, end: 1800 },
                      { id: "E2", name: "II", start: 100, end: 199 }];
  eq(LC.lcMatchLane({ id: "E3", name: "x", start: null, end: null }, graphLanes), "E3", "pure · the horizon by its id");
  eq(LC.lcMatchLane({ id: "zz", name: "II", start: null, end: null }, graphLanes), "E2", "…by its name");
  eq(LC.lcMatchLane({ id: "H2", name: "H2 · Adriano e Antonini", start: 117, end: 179 }, graphLanes), "E2", "…by the widest overlap (H2 117–179 → II)");
  eq(LC.lcMatchLane({ id: "H4", name: "H4", start: 300, end: 1199 }, graphLanes), "E3", "…(H4 300–1199 → Post)");
  eq(LC.lcMatchLane({ id: "H0", name: "H0", start: -200, end: 50 }, graphLanes), null, "…no overlap: none");
  eq([LC.lcStep("all", 1), LC.lcStep("territory", 1), LC.lcStep("room", 1), LC.lcStep("component", 1), LC.lcStep("territory", -1), LC.lcStep("room", -1)],
     ["territory", "complex", "component", null, null, "building"], "the step of the scales (city → site → building → room → component)");
}
const sq = (x, y, w) => [[x, y], [x + w, y], [x + w, y + w], [x, y + w]];
const building = {
  scale: "building",
  lanes: [{ id: "E4", name: "Oggi", start: 1801, end: 2026 }, { id: "E2", name: "II", start: 100, end: 199 }],
  planes: [
    { lane: "E4", name: "Oggi", start: 1801, end: 2026, without: [], absent: [],
      items: [{ id: "F1", reader: "RE", readers: ["RE"], evidence: "stratigraphic", instance: true, from_lane: "E2", by_scale: { building: "RE" } }],
      symbols: [{ fu: "RE", name: "restauro", ring: sq(0, 0, 4), evidence: "stratigraphic", container: false, parent: null, members: ["F1"],
                  scale: "building", ancestors: [], children: [], z_range: [0, 2] }] },
    { lane: "E2", name: "II", start: 100, end: 199, without: [],
      absent: [{ fu: "PO", name: "portico", scale: "room", evidence: "symbol", why: "no_members", ancestors: ["T"] }],
      items: [{ id: "F1", reader: "A", readers: ["A"], evidence: "stratigraphic", instance: false, from_lane: null, by_scale: { building: "T", room: "A" } },
              { id: "W1", reader: "T", readers: ["T"], evidence: "stratigraphic", instance: false, from_lane: null, by_scale: { building: "T" } },
              { id: "D1", reader: null, readers: [], evidence: null, instance: false, from_lane: null, by_scale: {} }],
      symbols: [{ fu: "T", name: "tempio", ring: [[0, 0], [9, 0], [9, 4], [0, 4]], evidence: "stratigraphic", container: true, parent: null,
                  members: ["F1", "W1"], scale: "building", ancestors: [], children: ["A", "PO"], z_range: [0, 6] },
                { fu: "A", name: "aedes", ring: sq(0, 0, 4), evidence: "stratigraphic", container: false, parent: "T", members: ["F1"],
                  scale: "room", ancestors: ["T"], children: [], z_range: [0, 2] }] }],
  units: { F1: { name: "F1", type: "US", rings: [sq(0, 0, 4)], centroid: [2, 2], lane: "E2", lanes: ["E4", "E2"], source: "proxy", stale: false, z_range: [0, 2] },
           W1: { name: "W1", type: "US", rings: [sq(5, 0, 4)], centroid: [7, 2], lane: "E2", lanes: ["E2"], source: "proxy", stale: false, z_range: [0, 6] },
           D1: { name: "D1", type: "US", rings: [sq(20, 0, 4)], centroid: [22, 2], lane: "E2", lanes: ["E2"], source: "proxy", stale: false } },
  verticals: [{ id: "F1", lanes: ["E4", "E2"] }], bbox: [0, 0, 24, 4], crs: [],
  functional_units: { T: { name: "tempio", scale: "building", parent: null, ancestors: [], children: ["A", "PO"] },
                      A: { name: "aedes", scale: "room", parent: "T", ancestors: ["T"], children: [] },
                      PO: { name: "portico", scale: "room", parent: "T", ancestors: ["T"], children: [] },
                      RE: { name: "restauro", scale: "building", parent: null, ancestors: [], children: [] },
                      Z: { name: "altro", scale: "room", parent: "Q", ancestors: ["Q"], children: [] },
                      Q: { name: "altro edificio", scale: "building", parent: null, ancestors: [], children: ["Z"] } },
  scales: { territory: 0, complex: 0, building: 3, room: 3, component: 0 },
};
{
  const scope = (fs, ...focus) => ({ fs, focus: new Set(focus) });
  eq([...LC.lcScopeUnits(building, scope("building"))].sort(), ["Q", "RE", "T"], "pure · at the scale of the building: its units");
  eq([...LC.lcScopeUnits(building, scope("room"))].sort(), ["A", "PO", "Z"], "…of the room: every room");
  eq([...LC.lcScopeUnits(building, scope("room", "T"))].sort(), ["A", "PO"], "…ENTERED into the temple: its rooms only");
  eq([...LC.lcScopeUnits(building, scope("building", "A"))].sort(), ["Q", "RE", "T"], "…a focus of a narrower scale filters nothing (going up)");
  const g = LC.lcBuildingGeometry(building, tt, scope("building"));
  eq([g.shown.fs, g.shown.fus.sort(), g.shown.units, g.shown.absent], ["building", ["RE", "T"], 2, 0],
     "the geometry at the scale of the building: two volumes drawn, two elements F1 W1 (D1 read by none: not shown)");
  const ii = g.planes[1];
  const vol = ii.polys.filter((p) => /lc-vol/.test(p.attrs)).map((p) => /data-lc-fu="([^"]+)"/.exec(p.attrs)[1]);
  eq(vol, ["T"], "…on II the temple a VOLUME");
  eq(ii.polys.findIndex((p) => /lc-vol/.test(p.attrs)), 1, "…drawn under the footprints (right after the plane's face)");
  eq(ii.polys.filter((p) => /lc-sub/.test(p.attrs)).map((p) => /data-lc-fu="([^"]+)"/.exec(p.attrs)[1]), ["A"], "…its room aedes a thin outline inside it");
  eq(ii.tops.filter((tp) => tp.layer === "sym").map((tp) => tp.h), [6], "…raised by its members' heights (6 m)");
  const fp = ii.polys.filter((p) => p.layer === "plan").map((p) => [/data-lc-unit="([^"]+)"/.exec(p.attrs)[1], /data-lc-reader="([^"]*)"/.exec(p.attrs)[1]]);
  eq(fp, [["F1", "T"], ["W1", "T"]], "…the elements: F1 and W1 read by the temple at this scale (not by the room)");
  const svg = LC.lcSvg(g, { width: 800, rot: 30, gap: null, sel: null, t: tt, layers: { sym: true, plan: true, prx: false, rm: false } }).svg;
  ok(/class="lc-vol-top" data-lc-fu="T"/.test(svg), "…the volume's top drawn with the symbolic layer (proxy layer off)");
  const r = LC.lcBuildingGeometry(building, tt, scope("room", "T"));
  eq([r.shown.fus.sort(), r.shown.absent], [["A", "PO"], 1], "the room, inside the temple: aedes drawn, portico a symbol (no members)");
  ok(r.planes[1].symbols.some((s) => /data-lc-fu="PO"[^]*data-lc-why="no_members"/.test(s.attrs)), "…the portico's symbol says why");
  eq(r.planes[1].polys.filter((p) => p.layer === "plan").map((p) => /data-lc-unit="([^"]+)"/.exec(p.attrs)[1]), ["F1"], "…F1 the only element of the rooms");
  eq(r.links.filter((l) => l.cls === "lc-vertical").length, 0, "…F1's vertical left out (no room reads it today)");
  const all = LC.lcBuildingGeometry(building, tt, null);
  eq(all.shown, null, "«all» (no scope): the cube of MF07, unchanged");
  const hz = LC.lcSvg(g, { width: 800, rot: 30, gap: null, sel: null, t: tt, hz: "E2", focus: new Set(["T"]) }).svg;
  ok(/class="lc-plane lc-plane-cur" data-lc-plane="E2"/.test(hz) && /class="lc-plane lc-plane-dim" data-lc-plane="E4"/.test(hz), "the horizon: its plane marked, the others dimmed");
  ok(/class="lc-sym-hull lc-vol lc-focus" data-lc-fu="T"/.test(hz), "the unit entered marked");
  const land = { scale: "landscape", lanes: [{ id: "H2", name: "H2", start: 117, end: 179 }],
    planes: [{ lane: "H2", name: "H2", start: 117, end: 179, items: [{ kind: "footprint", id: "TEMPLE", evidence: "stratigraphic", parts: [] },
                                                                      { kind: "symbol", id: "COLONY", evidence: "symbol", why: "no_members" }] }],
    rows: { TEMPLE: { name: "tempio", kind: "identity", site: "S03", evidence: "stratigraphic", lanes: ["H2"], scale: "building", handles: [{ graph_id: "G", handle: "T" }] },
            COLONY: { name: "colonia", kind: "identity", site: "S01", evidence: "symbol", lanes: ["H2"], scale: "territory", handles: [] } },
    shapes: { TEMPLE: { rings_by_lane: { H2: [sq(0, 0, 4), sq(5, 0, 4)] }, hull_by_lane: { H2: [[0, 0], [9, 0], [9, 4], [0, 4]] } } },
    verticals: [], bbox: [0, 0, 9, 4], crs: [], sites: [] };
  const lg = LC.lcLandscapeGeometry(land, tt, { fs: "territory", focus: new Set() });
  eq(lg.planes[0].polys.filter((p) => /data-lc-kind="presence"/.test(p.attrs)).length, 1, "the territory: the hull of the temple's presence (symbolic layer)");
  eq(lg.planes[0].polys.filter((p) => p.layer === "plan").length, 2, "…its two outlines (the plan layer)");
  eq(lg.planes[0].symbols.length, 1, "…the colony a symbol (no members)");
  eq(LC.lcLandscapeGeometry(land, tt).planes[0].polys.filter((p) => p.layer === "land").length, 2, "the landscape in «all»: as in MF04");
}

// ── 3 · 4 · 5 · the bridge and the page ─────────────────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
let pw = null;
for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
  path.join(ROOT, ".claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js")]) {
  if (!t) continue;
  try { const m = await import(t); pw = m.chromium ? m : m.default; break; } catch { /* next */ }
}
if (!fs.existsSync(py) || !pw) {
  console.log(`check-cube-scale: ${checks} checks passed (${!pw ? "no playwright-core" : `no s3Dgraphy venv at ${py}`}: the bridge and the page skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cube-scale-")));
fs.cpSync(path.join(FE, "testdata/landscape-cube"), path.join(dir, "cube"), { recursive: true });
const BUILDING = path.join(dir, "cube/cube-building.em.json");
const LAND = path.join(dir, "cube/cube-landscape.em.json");
const TEMPLE = path.join(dir, "cube/cube-temple.em.json");
const DS = path.resolve(ROOT, "../_datasets");
const RLAND = process.env.LAND ?? path.join(DS, "Sarmizegetusa/06_EM/LandscapeMatrix/sarmizegetusa-landscape.em.json");
const TEMPLU_FU = process.env.TEMPLU_FU ?? path.join(DS, "templumare-v11/TempluMare_v11_fu-prova.em.json");
const PROXIES = process.env.PROXIES ?? path.join(os.homedir(),
  "Library/CloudStorage/OneDrive-CNR/Dottorato Bucarest/14_EM_1.6_lavoro/TempluMare_v2_for_3DR_2026-10-06/EM/proxies");
let REAL = null;
if ([RLAND, TEMPLU_FU].every((f) => fs.existsSync(f)) && fs.existsSync(PROXIES)) {
  // copies only (OneDrive and _datasets read): the temple beside its proxies, the landscape beside it
  const T = path.join(dir, "real");
  fs.mkdirSync(path.join(T, "proxies"), { recursive: true });
  for (const f of fs.readdirSync(PROXIES)) if (f.endsWith(".glb")) fs.copyFileSync(path.join(PROXIES, f), path.join(T, "proxies", f));
  fs.copyFileSync(TEMPLU_FU, path.join(T, "TempluMare_v11_fu-prova.em.json"));
  fs.copyFileSync(RLAND, path.join(T, "sarmizegetusa-landscape.em.json"));
  REAL = { fu: path.join(T, "TempluMare_v11_fu-prova.em.json"), land: path.join(T, "sarmizegetusa-landscape.em.json") };
}
const SHOTS = process.env.SHOTS ?? null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const machine = { S3DGRAPHY_CONSOLE_DIR: path.join(dir, "m/console"), S3DGRAPHY_PROFILES_DIR: path.join(dir, "m/profiles"),
  S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "m/extensions"), S3DGRAPHY_PLUGINS_DIR: path.join(dir, "m/plugins"),
  EM_VOCABULARIES_DIR: path.join(dir, "m/vocab"), EM_BRIDGE_STATE_DIR: path.join(dir, "m/state") };
const bport = await freePort();
const bridge = spawn(py, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(bport), "--fs-root", dir, "--s3dgraphy", path.join(S3D, "src")],
  { env: { ...process.env, ...machine }, stdio: ["ignore", "ignore", "pipe"] });
let berr = "";
bridge.stderr.on("data", (d) => { berr += d; });
const B = `http://127.0.0.1:${bport}`;
let vite = null;
let PORT = process.env.PORT;
if (!PORT) {
  PORT = String(await freePort());
  vite = spawn(process.execPath, [path.join(FE, "node_modules/vite/bin/vite.js"), "--port", PORT, "--strictPort"],
    { cwd: FE, stdio: "ignore", env: { ...process.env, EM_PROFILE: "lab" } });
}
const stop = () => { try { bridge.kill(); } catch { /* gone */ } try { vite?.kill(); } catch { /* gone */ } };
process.on("exit", stop);
for (let i = 0; i < 240; i++) {
  let up = 0;
  try { if ((await fetch(`${B}/health`)).ok) up++; } catch { /* not yet */ }
  try { if ((await fetch(`http://localhost:${PORT}/em/studio/`)).ok) up++; } catch { /* not yet */ }
  if (up === 2) break;
  await new Promise((r) => setTimeout(r, 500));
}

// ── 3 · the bridge ───────────────────────────────────────────────────────────
const post = (body) => fetch(`${B}/landscape-cube`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const member = (file, gid) => { const d = JSON.parse(fs.readFileSync(file, "utf8")); return { header: d.header, graph: d.graphs[gid] }; };
const LANES = [["H7", 1900, 2026], ["H56", 1200, 1899], ["H4", 300, 1199], ["H3", 180, 299], ["H2", 117, 179], ["H1", 106, 116], ["H0", -200, 105]]
  .map(([id, a, b]) => ({ id, name: id, start: a, end: b }));
{
  let res = await post({ doc: member(BUILDING, "B"), base: BUILDING, lang: "it" });
  eq(res.status, 200, `B · POST /landscape-cube answers (${berr.split("\n").slice(-3).join(" | ")})`);
  let a = await res.json();
  const ii = a.planes.find((p) => p.name === "II");
  const f1 = ii.items.find((i) => i.id === "F1");
  eq(f1.by_scale, { building: "T", room: "A" }, "building: F1 read at each scale (the temple, the room)");
  const T = ii.symbols.find((s) => s.fu === "T");
  eq([T.scale, T.children, ii.symbols.find((s) => s.fu === "A").ancestors], ["building", ["A"], ["T"]], "…the symbols' scale and lineage");
  ok(Array.isArray(T.z_range) && T.z_range[1] > T.z_range[0], "…the volume's heights");
  eq(a.scales.building, 3, "…the units per scale");
  ok(Array.isArray(ii.absent), "…the absent of each plane");
  res = await post({ mode: "landscape", landscape: member(LAND, "LAND"), lanes: LANES, base: LAND, lang: "it" });
  a = await res.json();
  eq(a.rows.TEMPLE.handles, [{ graph_id: "TEMPLE-GRAPH", handle: "T" }], "landscape: the temple's bound handle in the cited graph");
  ok((a.shapes.TEMPLE.hull_by_lane.H2 ?? []).length >= 4, "…the hull of its presence on H2");
}

// ── 4 · the page ─────────────────────────────────────────────────────────────
const browser = await pw.chromium.launch({ executablePath: fs.existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const consoleErrors = [];
async function open(files, { embargo = true, lang = "it" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
  await page.addInitScript(([on, l]) => {
    if (on) window.__EM_EMBARGO__ = true;
    if (!sessionStorage.getItem("cs-probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", l);
      sessionStorage.setItem("cs-probe", "1");
    }
  }, [embargo, lang]);
  await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(B)}`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 120000 });
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(f, "utf8"));
    const before = await page.evaluate(() => window.__EM_DRAG__.activeSlot().slots.length);
    await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, f]);
    await page.waitForFunction((n) => window.__EM_DRAG__.activeSlot().slots.length > n, before, { timeout: 120000 });
  }
  return { ctx, page, errors };
}
const H = (page, fn, arg) => page.evaluate(fn, arg);
async function area(page, type) {
  const made = await H(page, (ty) => {
    const D = window.__EM_DRAG__;
    const id = D.splitDoc(D.activeWinId());
    return id && D.retype(id, ty) ? id : null;
  }, type);
  ok(!!made, `an area turned into «${type}»`);
  return made;
}
const cubeOf = (page, w) => H(page, (x) => window.__EM_DRAG__.landscapeCube(x), w);
const body = (w) => `.lc-body[data-lc-win="${w}"]`;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const vols = (page, w) => H(page, (sel) => [...new Set([...document.querySelectorAll(`${sel} polygon.lc-vol`)].map((e) => e.getAttribute("data-lc-fu") ?? e.getAttribute("data-lc-unit")))].sort(), body(w));
async function waitFor(page, fn, arg, what, timeout = 60000) {
  try { await page.waitForFunction(fn, arg, { timeout }); } catch (e) {
    const views = await H(page, () => window.__EM_DRAG__.cubes().map((x) => ({ x, ...window.__EM_DRAG__.landscapeCube(x).view, sel: window.__EM_DRAG__.selected() }))).catch(() => null);
    throw new Error(`${what}: ${e.message.split("\n")[0]} · views ${JSON.stringify(views)} · console: ${consoleErrors.slice(-4).join(" | ")} · bridge: ${berr.split("\n").slice(-4).join(" | ")}`);
  }
}
/** a drag on a cube's svg: n moves of dx */
async function drag(page, w, n = 12, dx = 10) {
  const bx = await page.locator(`${body(w)} svg.lc-svg`).boundingBox();
  await page.mouse.move(bx.x + bx.width / 2, bx.y + 24);
  await page.mouse.down();
  for (let i = 1; i <= n; i++) await page.mouse.move(bx.x + bx.width / 2 + i * dx, bx.y + 24 + i);
  await page.mouse.up();
}
const tr = (page, w, lane) => H(page, ([sel, l]) => document.querySelector(`${sel} [data-lc-plane="${l}"]`)?.getAttribute("transform") ?? null, [body(w), lane]);
/** a screen point where the volume of `fu` is the element under the pointer
 *  (its footprints above it are left out): a click or a double click there */
const labelAt = (page, w, fu) => H(page, ([sel, id]) => {
  const vol = document.querySelector(`${sel} polygon.lc-vol[data-lc-fu="${id}"], ${sel} polygon.lc-vol[data-lc-unit="${id}"]`);
  if (!vol) return null;
  const r = vol.getBoundingClientRect();
  for (let j = 1; j < 12; j++) for (let i = 1; i < 12; i++) {
    const x = r.left + (r.width * i) / 12, y = r.top + (r.height * j) / 12;
    const e = document.elementFromPoint(x, y);
    if (e && (e.getAttribute("data-lc-fu") === id || e.getAttribute("data-lc-unit") === id) && e.classList.contains("lc-vol")) return { x, y };
  }
  return null;
}, [body(w), fu]);

try {
  // ── the building: the scale, entering, up and down ──
  {
    const { ctx, page, errors } = await open([BUILDING]);
    const w = await area(page, "landscape-cube");
    await waitFor(page, (sel) => !!document.querySelector(`${sel} .lc-fp[data-lc-unit]`), body(w), "the cube drawn");
    eq(await H(page, (sel) => [...document.querySelectorAll(`${sel} [data-lc-fs-select] option`)].map((b) => b.value), body(w)),
       ["all", "territory", "complex", "building", "room", "component"], "A · the scale chooser: all and the five scales");
    eq(await H(page, (sel) => document.querySelector(`${sel} [data-lc-fs-select]`).value, body(w)), "all", "…«all» first (the cube of MF07)");
    await page.selectOption(`${body(w)} [data-lc-fs-select]`, "building");
    await waitFor(page, (sel) => document.querySelector(sel)?.getAttribute("data-lc-fs") === "building" && !!document.querySelector(`${sel} polygon.lc-vol`), body(w), "building scale");
    eq(await vols(page, w), ["RE", "RU", "T"], "…«building»: the temple, the ruin, the restoration as volumes");
    const readers = await H(page, (sel) => [...document.querySelectorAll(`${sel} polygon.lc-fp[data-lc-lane="E2"]`)].map((e) => [e.getAttribute("data-lc-unit"), e.getAttribute("data-lc-reader")]).sort(), body(w));
    eq(readers, [["F1", "T"], ["W1", "T"]], "…on II the elements the temple reads (F1 through its room), D1 (read by none) not shown");
    eq(await H(page, (sel) => [...document.querySelectorAll(`${sel} polygon.lc-sub`)].map((e) => e.getAttribute("data-lc-fu")), body(w)), ["A"], "…the room aedes inside the temple");
    let st = await cubeOf(page, w);
    eq([st.live.shown.fs, st.live.shown.fus.length], ["building", 3], "the hook: what the scale shows");
    await shot(page, "cs-1-building");
    // a double click on the temple ENTERS it: one scale down, its rooms; the selection kept
    const p = await labelAt(page, w, "T");
    ok(!!p, "the temple's name on its volume");
    await page.mouse.dblclick(p.x, p.y);
    await waitFor(page, (sel) => document.querySelector(sel)?.getAttribute("data-lc-fs") === "room", body(w), "entered");
    st = await cubeOf(page, w);
    eq([st.view.fs, st.view.focus], ["room", "T"], "a double click on the temple enters it: the room scale, the focus the temple");
    eq(await vols(page, w), ["A"], "…only its rooms (aedes)");
    eq(await H(page, () => window.__EM_DRAG__.selected()[0]), "T", "…the selection (the temple, its first click) is kept across the scale");
    ok(await H(page, (sel) => /tempio/.test(document.querySelector(`${sel} [data-lc-focus]`)?.textContent ?? ""), body(w)), "…the chip «in tempio»");
    // up: the buildings again, the temple marked as the focus
    await page.click(`${body(w)} [data-lc-fs-step="up"]`);
    await waitFor(page, (sel) => document.querySelector(sel)?.getAttribute("data-lc-fs") === "building", body(w), "up");
    eq(await vols(page, w), ["RE", "RU", "T"], "↑ · the buildings again");
    ok(await H(page, (sel) => /lc-focus/.test(document.querySelector(`${sel} polygon.lc-vol[data-lc-fu="T"]`)?.getAttribute("class") ?? ""), body(w)), "…the temple marked as the unit entered");
    eq(await H(page, () => window.__EM_DRAG__.selected()[0]), "T", "…the selection still the temple");
    await page.click(`${body(w)} [data-lc-focus-clear]`);
    await waitFor(page, (sel) => !document.querySelector(`${sel} [data-lc-focus]`), body(w), "leave");
    ok(true, "✕ leaves the unit");
    await page.selectOption(`${body(w)} [data-lc-fs-select]`, "component");
    await waitFor(page, (sel) => document.querySelector(`${sel} [data-lc-state="empty-scale"]`), body(w), "empty scale");
    ok(true, "a scale with no unit says so");
    await page.selectOption(`${body(w)} [data-lc-fs-select]`, "building");
    await waitFor(page, (sel) => !!document.querySelector(`${sel} polygon.lc-vol`), body(w), "back");

    // ── B · two cubes side by side, in sync ──
    const w2 = await H(page, (x) => window.__EM_DRAG__.cubeBesides(x), w);
    ok(!!w2 && w2 !== w, "⧉ · a second Cube beside the first");
    await waitFor(page, (sel) => !!document.querySelector(`${sel} polygon.lc-vol`), body(w2), "second cube");
    let s1 = await cubeOf(page, w), s2 = await cubeOf(page, w2);
    eq([s1.view.fs, s2.view.fs, s1.view.sync, s2.view.sync], ["building", "room", true, true], "…one scale down, both locked");
    eq(await H(page, () => window.__EM_DRAG__.cubes().length), 2, "…two Cube areas");
    eq(await H(page, (sel) => document.querySelector(`${sel} [data-lc-sync]`).getAttribute("aria-pressed"), body(w2)), "true", "…its lock pressed");
    await page.waitForTimeout(800);
    const a0 = await tr(page, w2, "E2");
    const r1 = s1.live.renders, r2 = s2.live.renders;
    await drag(page, w);
    await page.waitForTimeout(200);
    s1 = await cubeOf(page, w); s2 = await cubeOf(page, w2);
    ok((await tr(page, w2, "E2")) !== a0, "a drag on the first turns the second");
    eq([s2.view.rot, s2.view.tilt], [s1.view.rot, s1.view.tilt], "…to the same turn and tilt");
    eq([s1.live.renders, s2.live.renders], [r1, r2], "…with no redraw of either (transforms only)");
    ok(s2.live.frames > 3 && s2.live.maxMs < 16, `…on the same frames, each under 16 ms (${s2.live.maxMs.toFixed(2)} ms)`);
    // the wheel: the distance between the planes, shared
    const bx = await page.locator(`${body(w)} svg.lc-svg`).boundingBox();
    await page.mouse.move(bx.x + bx.width / 2, bx.y + 30);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(300);
    s1 = await cubeOf(page, w); s2 = await cubeOf(page, w2);
    ok(s1.view.gap != null && s2.view.gap === s1.view.gap, "the wheel parts the planes of both");
    // the horizon: a click on a plane's name, both windows
    await page.click(`${body(w)} text[data-lc-plane-name="E3"]`, { force: true });
    await waitFor(page, (sel) => /lc-plane-cur/.test(document.querySelector(`${sel} [data-lc-plane="E3"]`)?.getAttribute("class") ?? ""), body(w2), "horizon shared");
    s2 = await cubeOf(page, w2);
    eq([s2.view.hz?.id, s2.live.hz], ["E3", "E3"], "the horizon chosen in one is the other's (Post)");
    // the focus: a click on the temple's volume in the first is the second's
    await H(page, ([a, b]) => window.__EM_DRAG__.setCube(a, { focus: "T" }), [w, w2]);
    await waitFor(page, (sel) => /tempio/.test(document.querySelector(`${sel} [data-lc-focus]`)?.textContent ?? ""), body(w2), "focus shared");
    eq(await vols(page, w2), ["A"], "the unit entered in one: the other shows its rooms");
    // the lock off: the second no longer follows
    await page.click(`${body(w2)} [data-lc-sync]`);
    await waitFor(page, (sel) => document.querySelector(`${sel} [data-lc-sync]`)?.getAttribute("aria-pressed") === "false", body(w2), "unlock");
    const b0 = await tr(page, w2, "E2");
    await drag(page, w, 8, -12);
    await page.waitForTimeout(200);
    eq(await tr(page, w2, "E2"), b0, "the lock off: the second stays where it was");
    await shot(page, "cs-2-two-cubes");
    eq(errors, [], "the building: no page error");
    await ctx.close();
  }

  // ── C · the territory of the landscape beside the building of the temple bound to its site ──
  {
    const { ctx, page, errors } = await open([TEMPLE, LAND]);
    const w = await area(page, "landscape-cube");
    await waitFor(page, (sel) => !!document.querySelector(`${sel} [data-lc-unit]`), body(w), "landscape cube");
    await H(page, (x) => window.__EM_DRAG__.setCube(x, { fs: "territory" }), w);
    await waitFor(page, (sel) => !!document.querySelector(`${sel} polygon.lc-vol[data-lc-kind="presence"]`), body(w), "territory");
    let st = await cubeOf(page, w);
    eq([st.scale, st.view.fs], ["landscape", "territory"], "C · the territory is the landscape (the Landscape Matrix's identities)");
    eq(await vols(page, w), ["REST", "RUIN", "TEMPLE"], "…the presences with an outline as volumes (temple, ruin, restoration of S03)");
    ok(await H(page, (sel) => document.querySelectorAll(`${sel} .lc-sym[data-lc-kind="symbol"]`).length >= 3, body(w)), "…the others symbols");
    const w2 = await H(page, (x) => window.__EM_DRAG__.cubeBesides(x), w);
    await waitFor(page, (sel) => !!document.querySelector(`${sel} polygon.lc-vol`), body(w2), "the building beside");
    const s2 = await cubeOf(page, w2);
    eq([s2.scale, s2.view.fs], ["building", "building"], "⧉ · beside it the building (no «complex» in the temple's graph)");
    eq(await vols(page, w2), ["T"], "…the temple of the graph bound to S03 as a volume");
    eq(await H(page, (sel) => [...document.querySelectorAll(`${sel} polygon.lc-sub`)].map((e) => e.getAttribute("data-lc-fu")).sort(), body(w2)), ["A", "P"],
       "…with its rooms (aedes, portico)");
    // the same identity across the scales: entering the temple of the landscape focuses the temple of the graph
    await H(page, (x) => window.__EM_DRAG__.setCube(x, { focus: "TEMPLE" }), w);
    await waitFor(page, (sel) => /lc-focus/.test(document.querySelector(`${sel} polygon.lc-vol[data-lc-fu="T"]`)?.getAttribute("class") ?? ""), body(w2), "same identity");
    eq((await cubeOf(page, w2)).live.focus.sort(), ["T", "TEMPLE"], "the temple of the landscape IS the temple of its graph (the bound handle)");
    // the horizon across different lanes: H2 of the landscape → II d.C. of the graph
    await page.click(`${body(w)} text[data-lc-plane-name="H2"]`, { force: true });
    await waitFor(page, (sel) => !!document.querySelector(`${sel} .lc-plane-cur`), body(w2), "horizon across");
    eq((await cubeOf(page, w2)).live.hz, "E2", "H2 of the landscape is the II century of the temple's graph (by overlap)");
    const a0 = await tr(page, w2, "E2");
    await drag(page, w);
    ok((await tr(page, w2, "E2")) !== a0, "…and a turn of the territory turns the building");
    await shot(page, "cs-3-territory-building");
    eq(errors, [], "the landscape: no page error");
    await ctx.close();
  }

  // the switch off: none of it
  {
    const o = await open([BUILDING], { embargo: false });
    eq(await H(o.page, () => [typeof window.__EM_DRAG__.cubeBesides, typeof window.__EM_DRAG__.cubeEnter]), ["undefined", "undefined"], "switch off: no hook of the scale");
    await o.ctx.close();
  }

  // ── 5 · the real case ──
  if (REAL) {
    const { ctx, page, errors } = await open([REAL.fu, REAL.land]);
    const w = await area(page, "landscape-cube");
    await H(page, (x) => window.__EM_DRAG__.setCube(x, { fs: "territory" }), w);
    await waitFor(page, (sel) => !!document.querySelector(`${sel} polygon.lc-vol[data-lc-kind="presence"]`), body(w), "Sarmizegetusa territory", 180000);
    const st = await cubeOf(page, w);
    const rows = Object.entries(st.answer.rows).filter(([, r]) => r.kind === "identity");
    const temple = rows.find(([, r]) => r[1] !== null && r.name === "tempio" && (r.handles ?? []).length);
    ok(!!temple, "D · Sarmizegetusa at the scale of the territory: the temple of S15 bound to its graph");
    eq(rows.length, 47, "…the 47 identities of the Landscape Matrix");
    const syms = new Set(st.answer.planes.flatMap((p) => p.items.filter((i) => i.kind === "symbol").map((i) => i.id)));
    ok(syms.size >= 40, `…the identities with no members as symbols (${syms.size})`);
    const w2 = await H(page, (x) => window.__EM_DRAG__.cubeBesides(x), w);
    await waitFor(page, (sel) => !!document.querySelector(`${sel} polygon.lc-vol`), body(w2), "the temple beside", 180000);
    const b = await cubeOf(page, w2);
    const handle = temple[1].handles[0].handle;
    eq([b.scale, b.view.fs], ["building", "building"], "…beside it the building scale of Templu Mare (fu-prova)");
    ok((await vols(page, w2)).includes(handle), "…the temple as a volume");
    // the building reads by the horizons of the container when it has them (H0–H7), else by its epochs
    const ii = b.answer.planes.find((p) => (p.symbols ?? []).some((x) => x.fu === handle && (x.children ?? []).length));
    ok(!!ii, `…the temple with its rooms on a plane (${b.answer.planes.map((p) => p.name).join(", ")})`);
    const T = ii.symbols.find((x) => x.fu === handle);
    const landLane = st.answer.shapes[temple[0]].hull_by_lane[ii.lane] ? ii.lane : "sarmi-horizons-H2";
    const rooms = T.children.map((c) => b.answer.functional_units[c]?.name.split(" (")[0]);
    ok(["aedes", "portico", "cortile"].every((r) => rooms.includes(r)), `…with its rooms (${rooms.join(", ")})`);
    const bbox = (ring) => [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))].map((x) => Math.round(x * 100) / 100);
    eq(bbox(st.answer.shapes[temple[0]].hull_by_lane[landLane]), bbox(T.ring),
       "…the temple of the territory and the temple of the building in the SAME coordinates");
    eq([st.answer.crs, b.answer.crs], [["EPSG:3844"], ["EPSG:3844"]], "…EPSG:3844, the georeferencing of the cited graph");
    await H(page, ([x, id]) => window.__EM_DRAG__.setCube(x, { focus: id }), [w, temple[0]]);
    await waitFor(page, ([sel, id]) => /lc-focus/.test(document.querySelector(`${sel} polygon.lc-vol[data-lc-fu="${id}"]`)?.getAttribute("class") ?? ""), [body(w2), handle], "focus real");
    ok(true, "…the temple entered in the territory is the temple marked in the building");
    await H(page, (x) => window.__EM_DRAG__.cubeStep(x, 1), w2);
    await waitFor(page, (sel) => document.querySelector(sel)?.getAttribute("data-lc-fs") === "room", body(w2), "rooms of the temple", 60000);
    const rv = await vols(page, w2);
    const names = rv.map((id) => b.answer.functional_units[id]?.name.split(" (")[0]).sort();
    eq(names, ["aedes", "cortile", "portico"], "↓ · inside the temple of S15: its three rooms");
    const r1 = (await cubeOf(page, w)).live.renders;
    await drag(page, w2);
    const c1 = await cubeOf(page, w), c2 = await cubeOf(page, w2);
    eq([c1.view.rot, c1.live.renders], [c2.view.rot, r1], "…a turn of the rooms turns the city, with no redraw");
    await shot(page, "cs-4-sarmizegetusa");
    eq(errors, [], "the real case: no page error");
    await ctx.close();
  } else {
    console.log("  (the real case skipped: Sarmizegetusa, fu-prova or the proxies are not on this machine)");
  }
} finally {
  await browser.close();
  stop();
}
console.log(`✓ check-cube-scale: ${checks} checks passed`);
