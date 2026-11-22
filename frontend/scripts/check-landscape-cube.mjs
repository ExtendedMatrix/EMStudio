// MICRO-MF04 (E.D., 22 Nov 2026) · THE CUBE — the real footprints of the proxies
// stacked by horizon — under embargo (features.ts: landscape-cube), the lab
// build only.
//
//   node scripts/check-landscape-cube.mjs
//   (page part: own Vite + own bridge; PLAYWRIGHT_CORE / CHR as
//    check-landscape-matrix.mjs; skipped, and said, without them. The real
//    case — Templu Mare v11 and its proxies, E.D.'s foot.json — when they are
//    on the machine (TEMPLU=, TEMPLU_FU=, PROXIES=, FOOT=); SHOTS=<dir> keeps
//    pictures)
//
//   1 · the RULES of the embargo: every use in main.ts behind LC_ON (LAB
//       first), the type's metadata, icon and surface only in the lab profile,
//       the texts (EN + IT) only in the LAB_TEXTS blocks, the route only in
//       tools/em_py_lab.py;
//   2 · the PURE drawing (node): planes, footprints, hatching, verticals, the
//       rotation and the distance between the planes;
//   3 · the BRIDGE: POST /landscape-cube (s3Dgraphy functional_cube), the
//       building and the landscape, the sandbox;
//   4 · the PAGE (lab dev server, switch on): the area «Cube» on a synthetic
//       temple (planes, colours, instances, the vertical of F1, the selection
//       shared both ways, the two sliders), the landscape (presences and
//       symbols); switch off: none;
//   5 · the REAL case: SU004's footprint as foot.json, the planes of Templu
//       Mare, SU001–SU004 crossing them.
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
ok(/const LC_ON = LAB && featureOn\("landscape-cube"\);/.test(main), "main.ts: LC_ON = LAB && featureOn(\"landscape-cube\")");
{
  const imp = /import \{([^}]+)\} from "\.\/landscape-cube";/.exec(main);
  ok(!!imp, "main.ts imports the module once");
  const names = imp[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
  const lines = main.replace(imp[0], "").split("\n");
  const bad = [];
  for (const n of names) {
    lines.forEach((l, i) => {
      if (!new RegExp(`\\b${n}\\b`).test(l)) return;
      const ctx = lines.slice(Math.max(0, i - 60), i + 1).join("\n");
      if (!/LC_ON|\(LAB \?/.test(ctx)) bad.push(`${n} @${i + 1}`);
    });
  }
  eq(bad, [], "every use of the module in main.ts sits behind LC_ON (or LAB)");
  ok(/if \(LC_ON\) \{\n  setLandscapeCubeHost\(/.test(main), "the host is given only with LC_ON");
}
const i18n = read("frontend/src/i18n.ts");
const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]);
const openI18n = i18n.replace(/\.\.\.\(LAB_TEXTS \? \{[\s\S]*?\n  \} : \{\}\),/g, "");
const lcSrc = read("frontend/src/landscape-cube.ts");
const usedKeys = new Set([...lcSrc.matchAll(/"((?:lc|fm)\.[\w.]+)"/g), ...main.matchAll(/"(lc\.[\w.]+)"/g)].map((m) => m[1]));
for (const dyn of ["lc.scale.building", "lc.scale.landscape", "fm.ev.stratigraphic", "fm.ev.documentary", "fm.ev.reconstructive",
  "fm.ev.symbol"]) usedKeys.add(dyn);
ok(usedKeys.size > 25, `the module's texts read (${usedKeys.size})`);
eq(labBlocks.length, 2, "two LAB_TEXTS blocks (EN, IT)");
eq([...usedKeys].filter((k) => !labBlocks.every((b) => b.includes(`"${k}":`))), [], "every text of the Cube in both LAB_TEXTS blocks (EN + IT)");
eq([...usedKeys].filter((k) => k.startsWith("lc.") && openI18n.includes(`"${k}"`)), [], "…and none in the open dictionaries");
const lab = read("tools/em_py_lab.py");
const bridgePy = read("tools/em_bridge.py");
ok(/"\/landscape-cube": _landscape_cube_route/.test(lab) && /@lab_api\("landscape-cube", "landscape_cube"\)/.test(lab),
   "the route and em.app.landscape_cube live in em_py_lab (absent from the community sidecar)");
ok(!/"\/landscape-cube"/.test(bridgePy), "em_bridge.py names no such route");
ok(/id: "landscape-cube", state: "embargo"/.test(read("frontend/src/features.ts")), "the register: landscape-cube under embargo");

const paletteStub = { name: "palette-stub", setup(b) {
  b.onResolve({ filter: /\/palette$/ }, () => ({ path: "palette-stub", namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents:
    "export const nodeStyle = (t) => ({ border: t === 'US' ? '#9B3333' : t === 'USD' ? '#D86400' : t === 'USVs' ? '#2A5CAA' : '#8B5A2B', fill: '#fff', shape: 'rectangle', textColor: '#000' });",
    loader: "js" }));
} };
async function load(file, profile, plugins = []) {
  const glob = plugins.length ? { "import.meta.glob": "__noGlob" } : {};
  const b = await esbuild.build({ entryPoints: [path.join(SRC, file)], bundle: true, format: "esm", write: false, logLevel: "silent", plugins,
    ...(plugins.length ? { banner: { js: "const __noGlob = () => ({});" } } : {}),
    ...(profile === "none" ? {} : { define: { __EM_LAB__: profile === "lab" ? "true" : "false", ...glob } }) });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
}
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
for (const profile of ["community", "none", "lab"]) {
  const W = await load("workspace.ts", profile);
  const I = await load("window-icons.ts", profile);
  const has = Object.keys(W.WINDOW_TYPE_META).includes("landscape-cube");
  eq([has, !!I.WINDOW_ICON_PATHS["landscape-cube"]], [profile === "lab", profile === "lab"],
     `${profile}: the type «landscape-cube» (its name and icon) ${profile === "lab" ? "is" : "is not"} in the model`);
  if (has) eq(W.WINDOW_TYPE_META["landscape-cube"].labelKey, "feat.landscapeCube.title", "lab: the type's name is the register's title");
  const M = await load("shell/types.ts", profile);
  M.registerBuiltinSurfaces(new Proxy({}, { get: () => () => {} }));
  eq(M.convertedTypes().includes("landscape-cube"), profile === "lab", `${profile}: its surface registered only in the lab`);
}

// ── 2 · the pure drawing ────────────────────────────────────────────────────
const LC = await load("landscape-cube.ts", "lab", [paletteStub]);
const tt = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
const sq = (x, y, w) => [[x, y], [x + w, y], [x + w, y + w], [x, y + w]];
const answer = {
  scale: "building",
  lanes: [{ id: "E4", name: "Oggi", start: 1801, end: 2026 }, { id: "E2", name: "II", start: 100, end: 199 }],
  planes: [
    { lane: "E4", name: "Oggi", start: 1801, end: 2026, without: [],
      items: [{ id: "F1", reader: "RE", readers: ["RE"], evidence: "stratigraphic", instance: true, from_lane: "E2" }] },
    { lane: "E2", name: "II", start: 100, end: 199, without: ["X"],
      items: [{ id: "F1", reader: "A", readers: ["A"], evidence: "stratigraphic", instance: false, from_lane: null },
              { id: "D1", reader: null, readers: [], evidence: null, instance: false, from_lane: null }] }],
  units: { F1: { name: "F1", type: "US", rings: [sq(0, 0, 4)], centroid: [2, 2], lane: "E2", lanes: ["E4", "E2"], source: "proxy", stale: false },
           D1: { name: "D1", type: "US", rings: [sq(20, 0, 4)], centroid: [22, 2], lane: "E2", lanes: ["E2"], source: "proxy", stale: false } },
  verticals: [{ id: "F1", lanes: ["E4", "E2"] }], bbox: [0, 0, 24, 4], crs: [],
  functional_units: { A: { name: "aedes", scale: "room" }, RE: { name: "restauro", scale: "building" } },
};
{
  const o = { width: 800, rot: 45, gap: 200, sel: null, t: tt };
  const svg = LC.lcBuildingSvg(answer, o);
  eq([...svg.matchAll(/data-lc-plane="([^"]+)"/g)].map((m) => m[1]), ["E4", "E2"], "pure · a plane per lane, the newest on top");
  eq([...svg.matchAll(/class="lc-fp[^"]*" data-lc-unit="([^"]+)" data-lc-lane="([^"]+)"/g)].map((m) => `${m[1]}@${m[2]}`),
     ["F1@E4", "F1@E2", "D1@E2"], "…the footprints of what lives on each plane");
  ok(/data-lc-unit="F1" data-lc-lane="E4"[^>]*data-lc-instance="E2"[\s\S]*?stroke-dasharray="3 2"/.test(svg), "…the instance from II hatched");
  ok(/data-lc-unit="D1"[^>]*data-lc-evidence="none"[\s\S]*?stroke="#8c8c8c"/.test(svg), "…a unit no functional unit reads: grey");
  ok(/data-lc-unit="F1" data-lc-lane="E2"[^>]*data-lc-evidence="stratigraphic"[\s\S]*?stroke="#9B3333"/.test(svg), "…read: the colour of its degree (red)");
  ok(/data-lc-vertical="F1"/.test(svg), "…the vertical of F1");
  const h = (s) => Number(/height="(\d+)"/.exec(s)[1]);
  ok(h(LC.lcBuildingSvg(answer, { ...o, gap: 300 })) - h(svg) === 100, "the distance between the planes: +100 px → the drawing 100 px taller");
  const firstPts = (s) => /data-lc-unit="D1"[^>]*><polygon points="([^"]+)"/.exec(s)[1];
  ok(firstPts(LC.lcBuildingSvg(answer, { ...o, rot: 135 })) !== firstPts(svg), "the rotation moves the footprints");
  ok(/class="lc-fp lc-lit"/.test(LC.lcBuildingSvg(answer, { ...o, sel: "A" })), "a functional unit selected lights the footprints it reads");
  ok(/class="lc-fp lc-sel"/.test(LC.lcBuildingSvg(answer, { ...o, sel: "D1" })), "a unit selected is marked");
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
  console.log(`check-landscape-cube: ${checks} checks passed (${!pw ? "no playwright-core" : `no s3Dgraphy venv at ${py}`}: the bridge and the page skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "landscape-cube-")));
fs.cpSync(path.join(FE, "testdata/landscape-cube"), path.join(dir, "cube"), { recursive: true });
const BUILDING = path.join(dir, "cube/cube-building.em.json");
const LAND = path.join(dir, "cube/cube-landscape.em.json");
const TEMPLE = path.join(dir, "cube/cube-temple.em.json");
const OUTSIDE = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "landscape-cube-outside-")));
fs.cpSync(path.join(FE, "testdata/landscape-cube"), OUTSIDE, { recursive: true });
const DS = path.resolve(ROOT, "../_datasets");
const TEMPLU = process.env.TEMPLU ?? path.join(DS, "templumare-v11/TempluMare_v11.em.json");
const TEMPLU_FU = process.env.TEMPLU_FU ?? path.join(DS, "templumare-v11/TempluMare_v11_fu-prova.em.json");
const FOOT = process.env.FOOT ?? path.join(DS, "cc-runs/scrivania/foot.json");
const PROXIES = process.env.PROXIES ?? path.join(os.homedir(),
  "Library/CloudStorage/OneDrive-CNR/Dottorato Bucarest/14_EM_1.6_lavoro/TempluMare_v2_for_3DR_2026-10-06/EM/proxies");
let REAL = null;
if ([TEMPLU, TEMPLU_FU, FOOT].every((f) => fs.existsSync(f)) && fs.existsSync(PROXIES)) {
  // copies: the em.json beside a copy of its proxies (OneDrive only read)
  const T = path.join(dir, "templu");
  fs.mkdirSync(path.join(T, "proxies"), { recursive: true });
  for (const f of fs.readdirSync(PROXIES)) if (f.endsWith(".glb")) fs.copyFileSync(path.join(PROXIES, f), path.join(T, "proxies", f));
  fs.copyFileSync(TEMPLU, path.join(T, "TempluMare_v11.em.json"));
  fs.copyFileSync(TEMPLU_FU, path.join(T, "TempluMare_v11_fu-prova.em.json"));
  REAL = { v11: path.join(T, "TempluMare_v11.em.json"), fu: path.join(T, "TempluMare_v11_fu-prova.em.json"),
           foot: JSON.parse(fs.readFileSync(FOOT, "utf8")) };
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
  eq(res.status, 200, `POST /landscape-cube answers (${berr.split("\n").slice(-3).join(" | ")})`);
  let a = await res.json();
  eq([a.scale, a.planes.map((p) => p.name)], ["building", ["Oggi", "Post", "II"]], "building: a plane per epoch, the newest first");
  eq([a.proxies.read, Object.keys(a.units).sort()], [4, ["D1", "F1", "R1", "W1"]], "…the four proxies read beside the em.json");
  eq(a.verticals, [{ id: "F1", lanes: ["E4", "E3", "E2"] }], "…F1 crosses the three planes");
  const F1 = a.units.F1.rings[0];
  eq([Math.min(...F1.map((p) => p[0])), Math.max(...F1.map((p) => p[0])), Math.min(...F1.map((p) => p[1])), Math.max(...F1.map((p) => p[1]))],
     [0, 4, -4, 0], "…F1's footprint: the box's plan (x, −z)");
  // the sandbox: a file outside the served roots is not read
  res = await post({ doc: member(path.join(OUTSIDE, "cube-building.em.json"), "B"), base: path.join(OUTSIDE, "cube-building.em.json") });
  a = await res.json();
  eq([res.status, Object.keys(a.units).length], [200, 0], "the sandbox: proxies outside the served roots are not read");
  res = await post({ mode: "landscape", landscape: member(LAND, "LAND"), lanes: LANES, base: LAND, lang: "it" });
  a = await res.json();
  const h2 = Object.fromEntries(a.planes.find((p) => p.lane === "H2").items.map((i) => [i.id, i]));
  eq([h2.TEMPLE.kind, h2.TEMPLE.evidence, h2.OLDER.kind, h2.OLDER.why], ["footprint", "stratigraphic", "symbol", "no_outline"],
     "landscape: the temple's presence a footprint (its rooms' proxies), the earlier phase a symbol (its USD have no proxy)");
  const h1 = Object.fromEntries(a.planes.find((p) => p.lane === "H1").items.map((i) => [i.id, i]));
  eq([h1.COLONY.kind, h1.COLONY.why], ["symbol", "no_members"], "…an identity without members a symbol");
  eq((await post({})).status, 400, "no doc: 400");
}

// ── 4 · the page ─────────────────────────────────────────────────────────────
const browser = await pw.chromium.launch({ executablePath: fs.existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function open(files, { embargo = true, lang = "it" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
  await page.addInitScript(([on, l]) => {
    if (on) window.__EM_EMBARGO__ = true;
    if (!sessionStorage.getItem("lc-probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", l);
      sessionStorage.setItem("lc-probe", "1");
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
const consoleErrors = [];
async function area(page, type) {
  const made = await H(page, (ty) => {
    const D = window.__EM_DRAG__;
    const id = D.splitDoc(D.activeWinId());
    return id && D.retype(id, ty) ? id : null;
  }, type);
  ok(!!made, `an area turned into «${type}»`);
  return made;
}
const activate = (page, gid) => H(page, (g) => {
  const D = window.__EM_DRAG__;
  D.activateSlot(D.activeSlot().slots.find((s) => s.graphId === g).id);
}, gid);
const shot = async (page, name) => {
  if (!SHOTS) return;
  const el = await page.$(".tile-fmbody.lc-body");
  await (el ?? page).screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
const drawn = (page) => H(page, () => [...document.querySelectorAll(".lc-body .lc-fp[data-lc-unit]")].map((e) => ({
  id: e.getAttribute("data-lc-unit"), lane: e.getAttribute("data-lc-lane"), ev: e.getAttribute("data-lc-evidence"),
  reader: e.getAttribute("data-lc-reader"), inst: e.getAttribute("data-lc-instance"), cls: e.getAttribute("class") })));
const cubeOf = (page, w) => H(page, (x) => window.__EM_DRAG__.landscapeCube(x), w);
/** wait for a selector; on a timeout say what the Cube had (state, text) */
async function waitCube(page, sel, w, timeout = 60000) {
  try { await page.waitForSelector(sel, { timeout }); } catch (e) {
    const st = await cubeOf(page, w).catch(() => null);
    const tryDraw = await H(page, async (x) => {
      try {
        const M = await import("/em/studio/src/landscape-cube.ts");
        const a = window.__EM_DRAG__.landscapeCube(x).answer;
        return String(M.lcBuildingSvg(a, { width: 800, rot: 45, gap: 200, sel: null, t: (k) => k }).length);
      } catch (err) { return "THROWS " + String(err && err.stack || err).slice(0, 400); }
    }, w).catch((e2) => "eval " + e2.message);
    consoleErrors.push(`draw: ${tryDraw}`);
    const txt = await H(page, () => [...(document.querySelector(".lc-body, .tile-fmbody")?.children ?? [])].map((c) => `${c.tagName}.${c.className}[${c.innerHTML.length}]`).join(" ") + " :: " + (document.querySelector(".lc-body, .tile-fmbody")?.textContent?.slice(0, 200) ?? "(no body)"));
    throw new Error(`${sel}: ${e.message.split("\n")[0]} · state ${JSON.stringify(st && { ...st, answer: st.answer && { scale: st.answer.scale, planes: st.answer.planes?.length, units: Object.keys(st.answer.units ?? {}).length, proxies: st.answer.proxies } })} · «${txt}» · console: ${consoleErrors.slice(-4).join(" | ")} · bridge: ${berr.split("\n").slice(-4).join(" | ")}`);
  }
}

try {
  const { ctx, page, errors } = await open([BUILDING]);
  const w = await area(page, "landscape-cube");
  await waitCube(page, ".lc-body .lc-fp[data-lc-unit]", w);
  eq(await H(page, () => [...document.querySelectorAll(".lc-body [data-lc-plane]")].map((e) => e.getAttribute("data-lc-plane"))),
     ["E4", "E3", "E2"], "B · the planes, stacked: today on top, the II century at the bottom");
  let d = await drawn(page);
  const at = (id, lane) => d.find((x) => x.id === id && x.lane === lane);
  eq([at("F1", "E2").reader, at("F1", "E2").ev, at("W1", "E2").reader, at("D1", "E2").ev], ["A", "stratigraphic", "T", "none"],
     "…on II: F1 read by the room (the most specific), W1 by the temple, D1 by none (grey)");
  eq([at("F1", "E3")?.reader, at("F1", "E3")?.inst, at("F1", "E4")?.reader, at("F1", "E4")?.inst], ["RU", "E2", "RE", "E2"],
     "…F1 on the later planes: read by the ruin and the restoration, hatched (an instance from II)");
  eq(await H(page, () => [...document.querySelectorAll(".lc-body [data-lc-vertical]")].map((e) => e.getAttribute("data-lc-vertical"))), ["F1"],
     "…the vertical line of F1, crossing the planes");
  ok(await H(page, () => /F1/.test(document.querySelector(".lc-body .lc-foot")?.textContent ?? "")), "…named under the drawing");
  const st = await cubeOf(page, w);
  eq([st.scale, st.status, st.answer.proxies.read], ["building", "ok", 4], "the hook: the building's answer, four proxies read");
  await shot(page, "lc-1-building");
  // the selection, shared: a click on a footprint selects the unit (Matrix, Inspector)…
  await page.click('.lc-body .lc-fp[data-lc-unit="D1"][data-lc-lane="E2"] polygon', { force: true });
  await page.waitForFunction(() => window.__EM_DRAG__.selected()[0] === "D1", null, { timeout: 10000 });
  ok(true, "a click on D1's footprint selects D1");
  await page.waitForFunction(() => /lc-sel/.test(document.querySelector('.lc-body .lc-fp[data-lc-unit="D1"]')?.getAttribute("class") ?? ""), null, { timeout: 10000 });
  ok(true, "…and the Cube marks it");
  // …and a selection made elsewhere lights the Cube: the room «aedes» lights F1 on II
  await H(page, () => window.__EM_DRAG__.select("A"));
  await page.waitForFunction(() => /lc-lit/.test(document.querySelector('.lc-body .lc-fp[data-lc-unit="F1"][data-lc-lane="E2"]')?.getAttribute("class") ?? ""), null, { timeout: 10000 });
  d = await drawn(page);
  eq(d.filter((x) => /lc-lit/.test(x.cls)).map((x) => `${x.id}@${x.lane}`), ["F1@E2"], "selecting the room «aedes» lights what it reads (F1 on II)");
  // the sliders: the rotation and the distance between the planes
  const pts = () => H(page, () => document.querySelector('.lc-body .lc-fp[data-lc-unit="D1"] polygon').getAttribute("points"));
  const hgt = () => H(page, () => Number(document.querySelector(".lc-body svg.lc-svg").getAttribute("height")));
  const p0 = await pts(), h0 = await hgt();
  await page.fill(".lc-body [data-lc-rot]", "120");
  await page.waitForFunction((p) => document.querySelector('.lc-body .lc-fp[data-lc-unit="D1"] polygon')?.getAttribute("points") !== p, p0, { timeout: 10000 });
  ok(true, "the rotation slider turns the cube");
  await page.fill(".lc-body [data-lc-gap]", "300");
  await page.waitForFunction((h) => Number(document.querySelector(".lc-body svg.lc-svg")?.getAttribute("height")) > h, h0, { timeout: 10000 });
  eq([(await cubeOf(page, w)).view.rot, (await cubeOf(page, w)).view.gap, (await hgt()) - h0], [120, 300, 200],
     "…the planes part (gap 200 → 300: two gaps, 200 px taller), the view kept per window");
  await shot(page, "lc-2-turned");
  eq(errors, [], "no page error");
  await ctx.close();

  // C · the landscape: presences and symbols
  {
    const o = await open([TEMPLE, LAND]);
    const lw = await area(o.page, "landscape-cube");
    await waitCube(o.page, ".lc-body [data-lc-unit]", lw);
    eq((await cubeOf(o.page, lw)).scale, "landscape", "C · the landscape active: the Cube of the landscape");
    eq(await H(o.page, () => [...document.querySelectorAll(".lc-body [data-lc-plane]")].map((e) => e.getAttribute("data-lc-plane"))),
       ["H7", "H56", "H4", "H3", "H2", "H1", "H0"], "…a plane per horizon of the container");
    const kinds = await H(o.page, () => Object.fromEntries([...document.querySelectorAll('.lc-body [data-lc-lane="H2"][data-lc-unit]')]
      .map((e) => [e.getAttribute("data-lc-unit"), [e.getAttribute("data-lc-kind"), e.getAttribute("data-lc-why") ?? ""]])));
    eq([kinds.TEMPLE, kinds.OLDER, kinds.TOMBS], [["footprint", ""], ["symbol", "no_outline"], ["symbol", "no_members"]],
       "…on H2 the temple's presence (its rooms' proxies), the earlier phase and the cemetery as symbols");
    await shot(o.page, "lc-3-landscape");
    // the temple active: the scale chooser, the building
    await activate(o.page, "TEMPLE-GRAPH");
    await o.page.waitForSelector(".lc-body [data-lc-scale-select]", { timeout: 20000 });
    await o.page.selectOption(".lc-body [data-lc-scale-select]", "building");
    await o.page.waitForFunction(() => document.querySelector(".lc-body")?.getAttribute("data-lc-scale") === "building"
      && !!document.querySelector('.lc-body .lc-fp[data-lc-unit="SU1"]'), null, { timeout: 30000 });
    ok(true, "…the scale chooser: the temple's own cube (its proxies)");
    eq(o.errors, [], "the landscape: no page error");
    await o.ctx.close();
  }
  // the switch off: nothing of it
  {
    const o = await open([BUILDING], { embargo: false });
    eq(await H(o.page, () => typeof window.__EM_DRAG__.landscapeCube), "undefined", "switch off: no hook");
    await H(o.page, () => { const D = window.__EM_DRAG__; D.retype(D.splitDoc(D.activeWinId()), "landscape-cube"); });
    await o.page.waitForFunction(() => /funzione in embargo/.test(document.querySelector(".tile-fmbody")?.textContent ?? ""), null, { timeout: 20000 });
    ok(await H(o.page, () => !document.querySelector("[data-lc-unit]")), "switch off: an area of the type draws nothing and says why");
    await o.ctx.close();
  }

  // ── 5 · the real case ──
  if (REAL) {
    const hausdorff = (A, Bs) => {
      const seg = (p, q, r) => { const dx = r[0] - q[0], dy = r[1] - q[1]; const l = dx * dx + dy * dy;
        const t = l ? Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / l)) : 0;
        return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dy); };
      const far = (X, Y) => Math.max(...X.map((p) => Math.min(...Y.map((q, i) => seg(p, q, Y[(i + 1) % Y.length])))));
      return Math.max(far(A, Bs), far(Bs, A));
    };
    const r = await open([REAL.v11]);
    const rw = await area(r.page, "landscape-cube");
    await waitCube(r.page, ".lc-body .lc-fp[data-lc-unit]", rw, 120000);
    let a = (await cubeOf(r.page, rw)).answer;
    const byName = Object.fromEntries(Object.values(a.units).map((u) => [u.name, u]));
    eq([Object.keys(a.units).length, a.crs], [65, ["EPSG:3844"]], "Templu Mare v11: 65 footprints from its proxies, in EPSG:3844");
    eq(a.proxies.stale, [], "…no proxy changed since its stamp (the newer version of each resource declares its bytes)");
    const su4 = byName.SU004.rings[0].map((p) => [p[0] - 327372, p[1] - 448682]);
    const dist = hausdorff(su4, REAL.foot.SU004.hull);
    ok(dist < 0.02, `D · SU004's footprint (net of the shift) is foot.json's (Hausdorff ${dist.toFixed(4)} m)`);
    for (const n of ["SU001", "SU020", "T21"]) {
      const q = byName[n].rings[0].map((p) => [p[0] - 327372, p[1] - 448682]);
      ok(hausdorff(q, REAL.foot[n].hull) < 0.02, `…and ${n}'s`);
    }
    eq(a.planes.map((p) => p.name), ["XX sec", "Post antiquity", "II A.D."], "…the planes: its three epochs, the newest on top");
    eq(a.planes.find((p) => p.name === "II A.D.").items.length, 64, "…64 footprints on the II century");
    const su4id = Object.keys(a.units).find((k) => a.units[k].name === "SU004");
    ok(await H(r.page, (id) => !!document.querySelector(`.lc-body .lc-fp[data-lc-unit="${id}"]`), su4id), "…SU004 drawn");
    await shot(r.page, "lc-4-templu-v11");
    await r.ctx.close();
    const f = await open([REAL.fu]);
    const fw = await area(f.page, "landscape-cube");
    await waitCube(f.page, ".lc-body [data-lc-vertical]", fw, 120000);
    a = (await cubeOf(f.page, fw)).answer;
    eq(a.verticals.map((v) => a.units[v.id].name).sort(), ["SU001", "SU002", "SU003", "SU004"],
       "Templu Mare with its functional units: the foundations SU001–SU004 cross the planes (temple, ruin, restoration)");
    const ruin = a.planes.find((p) => p.name === "Post antiquity").items.filter((i) => i.reader);
    eq(ruin.map((i) => a.units[i.id].name).sort(), ["SU001", "SU002", "SU003", "SU004"], "…on Post antiquity the ruin reads them, hatched");
    ok(ruin.every((i) => i.instance), "…as instances from the II century");
    await shot(f.page, "lc-5-templu-fu");
    eq(f.errors, [], "the real case: no page error");
    await f.ctx.close();
  } else {
    console.log("  (the real case skipped: Templu Mare v11, its proxies or foot.json are not on this machine)");
  }
} finally {
  await browser.close();
  stop();
}
console.log(`✓ check-landscape-cube: ${checks} checks passed`);
