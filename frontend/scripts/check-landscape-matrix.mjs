// MICRO-MF03 (E.D., 22 Nov 2026) · THE LANDSCAPE MATRIX AND THE SEMANTIC ZOOM —
// under embargo (features.ts: landscape-matrix), the lab build only.
//
//   node scripts/check-landscape-matrix.mjs
//   (page part: own Vite + own bridge; PLAYWRIGHT_CORE / CHR as
//    check-functional-matrix.mjs; skipped, and said, without them. The real
//    case — Sarmizegetusa LG2 + Templu Mare v11 — when the datasets are on the
//    machine (SARMI=, TEMPLU=); SHOTS=<dir> keeps pictures)
//
//   1 · the RULES of the embargo: every use in main.ts behind LM_ON (LAB
//       first), the type's metadata, icon and surface only in the lab profile,
//       the texts (EN + IT) only in the LAB_TEXTS blocks, the route only in
//       tools/em_py_lab.py;
//   2 · the PURE parts (node): the bond written in a header as s3Dgraphy's
//       bind_site, the relative path, the drawing of an answer;
//   3 · the BRIDGE: POST /landscape-matrix (s3Dgraphy functional_zoom);
//   4 · the PAGE (lab dev server, switch on), on a synthetic city of six sites
//       citing a temple: the area «Landscape Matrix» (columns, lanes, braces,
//       UT, chains, alternative reading), the bond declared FROM THE PAGE (the
//       site's identities turn red, the others stay symbols; the bond in the
//       landscape's header, the file dirty, «Annulla»), the zoom of the
//       Functional Matrix in four steps with the same lanes; switch off: none;
//   5 · the REAL case: Sarmizegetusa with Templu Mare bound to S15.
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
ok(/const LM_ON = LAB && featureOn\("landscape-matrix"\);/.test(main), "main.ts: LM_ON = LAB && featureOn(\"landscape-matrix\")");
{
  const imp = /import \{([^}]+)\} from "\.\/landscape-matrix";/.exec(main);
  ok(!!imp, "main.ts imports the module once");
  const names = imp[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
  names.push("setFmZoom");
  const body = main.replace(imp[0], "").replace('import { setFmZoom } from "./functional-matrix";', "");
  const lines = body.split("\n");
  const bad = [];
  for (const n of names) {
    lines.forEach((l, i) => {
      if (!new RegExp(`\\b${n}\\b`).test(l)) return;
      const ctx = lines.slice(Math.max(0, i - 40), i + 1).join("\n");
      if (!/LM_ON|\(LAB \?/.test(ctx)) bad.push(`${n} @${i + 1}`);
    });
  }
  eq(bad, [], "every use of the module in main.ts sits behind LM_ON (or LAB)");
  ok(/if \(LM_ON\) \{\n  setLandscapeMatrixHost\(/.test(main) && /if \(FM_ON\) setFmZoom\(/.test(main),
     "the host and the zoom are given only with LM_ON (the zoom with the Functional Matrix on too)");
}
const i18n = read("frontend/src/i18n.ts");
const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]);
const openI18n = i18n.replace(/\.\.\.\(LAB_TEXTS \? \{[\s\S]*?\n  \} : \{\}\),/g, "");
const lmSrc = read("frontend/src/landscape-matrix.ts");
const usedKeys = new Set([...lmSrc.matchAll(/"(lm\.[\w.]+)"/g), ...main.matchAll(/"(lm\.[\w.]+)"/g)].map((m) => m[1]));
for (const dyn of ["lm.rule.dated", "lm.rule.dated_declared", "lm.rule.declared_horizon", "lm.zoom.1", "lm.zoom.2", "lm.zoom.3",
  "lm.zoom.4", "lm.zoom.hint2", "lm.zoom.hint3", "lm.zoom.hint4"]) usedKeys.add(dyn);
ok(usedKeys.size > 40, `the module's texts read (${usedKeys.size})`);
eq(labBlocks.length, 2, "two LAB_TEXTS blocks (EN, IT)");
eq([...usedKeys].filter((k) => !labBlocks.every((b) => b.includes(`"${k}":`))), [], "every text of the Landscape Matrix in both LAB_TEXTS blocks (EN + IT)");
eq([...usedKeys].filter((k) => openI18n.includes(`"${k}"`)), [], "…and none in the open dictionaries");
const lab = read("tools/em_py_lab.py");
const bridgePy = read("tools/em_bridge.py");
ok(/"\/landscape-matrix": _landscape_matrix_route/.test(lab) && /@lab_api\("landscape-matrix", "landscape_matrix"\)/.test(lab),
   "the route and em.app.landscape_matrix live in em_py_lab (absent from the community sidecar)");
ok(!/"\/landscape-matrix"/.test(bridgePy), "em_bridge.py names no such route");

// palette.ts reads em_visual_rules through Vite's import.meta.glob: in node a stub
// (the colours are the page's business; here only the shapes of the answer)
const paletteStub = { name: "palette-stub", setup(b) {
  b.onResolve({ filter: /\/palette$/ }, () => ({ path: "palette-stub", namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents:
    "export const nodeStyle = (t) => ({ border: t === 'US' ? '#9B3333' : t === 'USD' ? '#D86400' : t === 'USVs' ? '#2A5CAA' : '#8B5A2B', fill: '#fff', shape: 'rectangle', textColor: '#000' });",
    loader: "js" }));
} };
async function load(file, profile, plugins = []) {
  // the pure load (plugins): Vite's import.meta.glob (the 2D icons) answers nothing
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
  const has = Object.keys(W.WINDOW_TYPE_META).includes("landscape-matrix");
  eq([has, !!I.WINDOW_ICON_PATHS["landscape-matrix"]], [profile === "lab", profile === "lab"],
     `${profile}: the type «landscape-matrix» (its name and icon) ${profile === "lab" ? "is" : "is not"} in the model`);
  if (has) eq(W.WINDOW_TYPE_META["landscape-matrix"].labelKey, "feat.landscapeMatrix.title", "lab: the type's name is the register's title");
  const M = await load("shell/types.ts", profile);
  M.registerBuiltinSurfaces(new Proxy({}, { get: () => () => {} }));
  eq(M.convertedTypes().includes("landscape-matrix"), profile === "lab", `${profile}: its surface registered only in the lab`);
}

// ── 2 · the pure parts ──────────────────────────────────────────────────────
const LM = await load("landscape-matrix.ts", "lab", [paletteStub]);
{
  const h0 = { title: "x", composition: [{ id: "G1", path: "a.em.json", title: "A" }] };
  const h1 = LM.bindSite(h0, "G1", "SITE");
  eq(h0.composition[0].site, undefined, "bindSite: the header given is untouched");
  eq(h1.composition, [{ id: "G1", path: "a.em.json", title: "A", site: "SITE" }], "bindSite: the entry carries its site");
  const h2 = LM.bindSite(h1, "G2", "OTHER", { path: "b.em.json", title: "B" });
  eq(h2.composition.map((e) => [e.id, e.site, e.path]), [["G1", "SITE", "a.em.json"], ["G2", "OTHER", "b.em.json"]],
     "bindSite: a graph not cited yet is cited, with its path and title");
  const h3 = LM.bindSite(h2, "G1", null);
  ok(!("site" in h3.composition[0]) && h3.composition[0].id === "G1", "bindSite(null): the bond removed, the citation kept");
  eq(LM.composition({ composition: "G9" }), [{ id: "G9" }], "a bare string is a citation");
  eq(LM.relPath("/a/b/c", "/a/d/e.em.json"), "../../d/e.em.json", "relPath: up and down");
  eq(LM.relPath("/a/b", "/a/b/e.em.json"), "e.em.json", "relPath: the same folder");
  eq(LM.relPath("C:/x", "D:/y/e.em.json"), "D:/y/e.em.json", "relPath: another root, the path itself");
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
  console.log(`check-landscape-matrix: ${checks} checks passed (${!pw ? "no playwright-core" : `no s3Dgraphy venv at ${py}`}: the bridge and the page skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "landscape-matrix-")));
const LAND = path.join(dir, "landscape-matrix.em.json");
const TEMPLE = path.join(dir, "landscape-temple.em.json");
fs.copyFileSync(path.join(FE, "testdata/landscape-matrix.em.json"), LAND);
fs.copyFileSync(path.join(FE, "testdata/landscape-temple.em.json"), TEMPLE);
const DS = path.resolve(ROOT, "../_datasets");
const SARMI = process.env.SARMI ?? path.join(DS, "Sarmizegetusa/06_EM/LandscapeMatrix/sarmizegetusa-landscape.em.json");
const TEMPLU = process.env.TEMPLU ?? path.join(DS, "templumare-v11/TempluMare_v11.em.json");
let REAL = null;
if (fs.existsSync(SARMI) && fs.existsSync(TEMPLU)) {
  // copies, the composition's relative path kept: <dir>/a/b/c/sarmi… → <dir>/templumare-v11/…
  const land = path.join(dir, "Sarmizegetusa/06_EM/LandscapeMatrix/sarmizegetusa-landscape.em.json");
  fs.mkdirSync(path.dirname(land), { recursive: true });
  fs.mkdirSync(path.join(dir, "templumare-v11"), { recursive: true });
  fs.copyFileSync(SARMI, land);
  fs.copyFileSync(TEMPLU, path.join(dir, "templumare-v11/TempluMare_v11.em.json"));
  REAL = { land, temple: path.join(dir, "templumare-v11/TempluMare_v11.em.json") };
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
const post = (body) => fetch(`${B}/landscape-matrix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const LANES = [["H7", 1900, 2026], ["H56", 1200, 1899], ["H4", 300, 1199], ["H3", 180, 299], ["H2", 117, 179], ["H1", 106, 116], ["H0", -200, 105]];
const landDoc = JSON.parse(fs.readFileSync(LAND, "utf8"));
const horizons = landDoc.graphs.periodizations.nodes.filter((n) => n.node_type === "horizon");
const lanes = LANES.map(([id, a, b]) => ({ id, name: horizons.find((h) => h.id === id).name, start: a, end: b }));
const landMember = { header: landDoc.header, graph: landDoc.graphs.LAND };
{
  let res = await post({ landscape: landMember, lanes, base: LAND, lang: "it" });
  eq(res.status, 200, `POST /landscape-matrix answers (${berr.split("\n").slice(-3).join(" | ")})`);
  let a = await res.json();
  eq(a.columns.map((c) => c.code), ["S01", "S02", "S03", "S04", "S05", "S10"], "the columns: the sites in the order of their codes");
  eq(a.lanes.map((l) => l.id), ["H7", "H56", "H4", "H3", "H2", "H1", "H0"], "the lanes: the horizons, newest first");
  ok(a.rows.filter((r) => r.kind === "identity").every((r) => r.evidence === "symbol"), "not bound: every identity a symbol");
  eq(a.bindings.map((b) => [b.graph_id, b.loaded, b.site]), [["TEMPLE-GRAPH", true, null]], "the cited temple read from its composition path, not bound");
  const bound = { ...landMember, header: { ...landMember.header, composition: [{ ...landMember.header.composition[0], site: "site_S03" }] } };
  res = await post({ landscape: bound, lanes, base: LAND, lang: "it" });
  a = await res.json();
  const r = Object.fromEntries(a.rows.map((x) => [x.id, x]));
  eq([r.TEMPLE.evidence, r.TEMPLE.members_rule, r.TEMPLE.rooms], ["stratigraphic", "identity", ["aedes", "portico"]],
     "bound: the temple takes the temple graph's «tempio», its members and rooms");
  eq([r.OLDER.evidence, r.RUIN.members_rule, r.COLONY.evidence], ["documentary", "alive", "symbol"],
     "…the earlier phase its USD (orange), the ruin the units alive in its life, the colony stays a symbol");
  eq(a.neighbours.site_S03, ["site_S01", "site_S02", "site_S03", "site_S04", "site_S05"], "the neighbours of S03");
  const t = JSON.parse(fs.readFileSync(TEMPLE, "utf8"));
  res = await post({ mode: "identities", graph: { header: t.header, graph: t.graphs["TEMPLE-GRAPH"] }, lanes, lang: "it" });
  a = await res.json();
  eq(a.rows.map((x) => [x.name, x.members, x.lane]).sort(), [["fase precedente: drenaggio e forno", 2, "H2"], ["tempio", 2, "H2"]],
     "mode identities: one graph's handles with their members, on the same lanes");
  eq((await post({})).status, 400, "no landscape: 400");
}

// ── 4 · the page ─────────────────────────────────────────────────────────────
const browser = await pw.chromium.launch({ executablePath: fs.existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function open(files, { embargo = true, lang = "it" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(([on, l]) => {
    if (on) window.__EM_EMBARGO__ = true;
    if (!sessionStorage.getItem("lm-probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", l);
      sessionStorage.setItem("lm-probe", "1");
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
const lmOf = (page, w) => H(page, (x) => window.__EM_DRAG__.landscapeMatrix(x), w);
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
const shot = async (page, name, sel = ".tile-fmbody") => {
  if (!SHOTS) return;
  const el = await page.$(sel);
  await (el ?? page).screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
const rowsDrawn = (page) => H(page, () => Object.fromEntries([...document.querySelectorAll(".tile-fmbody [data-lm-row]")]
  .map((e) => [e.getAttribute("data-lm-row"), { ev: e.getAttribute("data-lm-evidence"), lane: e.getAttribute("data-lm-lane"),
    kind: e.getAttribute("data-lm-kind"), members: Number(e.getAttribute("data-lm-members")), rule: e.getAttribute("data-lm-rule"),
    unc: e.hasAttribute("data-lm-uncertain"), alt: e.hasAttribute("data-lm-alt") }])));

try {
  const { ctx, page, errors } = await open([TEMPLE, LAND]);
  const lmWin = await area(page, "landscape-matrix");
  await page.waitForSelector(".tile-fmbody [data-lm-row]", { timeout: 60000 });
  let st = await lmOf(page);
  eq([st.status, st.answer.rows.length], ["ok", 8], "the page asked the bridge: seven identities and a UT");
  eq(await H(page, () => [...document.querySelectorAll(".tile-fmbody [data-lm-col]")].map((e) => e.getAttribute("data-lm-code"))),
     ["S01", "S02", "S03", "S04", "S05", "S10"], "A · a column per site, in the order of the codes");
  eq(await H(page, () => [...document.querySelectorAll(".tile-fmbody [data-lm-lane]:not([data-lm-row])")].map((e) => e.getAttribute("data-lm-lane"))),
     ["H7", "H56", "H4", "H3", "H2", "H1", "H0", ""], "…the lanes of the container's horizons, «no horizon» last");
  let rows = await rowsDrawn(page);
  eq([rows.TEMPLE.lane, rows.RUIN.lane, rows.REST.lane, rows.OLDER.lane], ["H2", "H4", "H7", "H1"],
     "…each identity in the lane where its declared horizon begins");
  ok(Object.values(rows).filter((r) => r.kind === "identity").every((r) => r.ev === "symbol"), "…all symbols (grey, dotted) while nothing is bound");
  eq([rows.UT20.kind, rows.UT20.lane], ["ut", "H7"], "…the UT a hexagon, in the lane of its observation (2015)");
  ok(rows.TOMBS.unc && rows.ALT.alt && rows.ALT.lane === "", "…«H2–H3?» uncertain, the alternative reading marked, in «no horizon»");
  ok(await H(page, () => !!document.querySelector('.tile-fmbody [data-lm-chain="RUIN_cf_TEMPLE"]') && !!document.querySelector('.tile-fmbody [data-lm-after="TOMBS_after_COLONY"]')),
     "…the changed_from chain (dotted) and is_after (thin)");
  ok(await H(page, () => { const s = document.querySelector(".tile-fmbody .lm-scroll"); return getComputedStyle(s).overflowX === "auto"; }), "…it scrolls sideways");
  // MICRO-MF09 · a row in EVERY horizon its life touches: the master in its
  // home lane, the others instances (dashed braces); no dotted line any more
  const apps = await H(page, () => Object.fromEntries(["TOMBS", "RUIN", "TEMPLE"].map((id) => [id,
    [...document.querySelectorAll(`.tile-fmbody [data-lm-row="${id}"]`)].map((e) => ({
      in: e.getAttribute("data-lm-in"), app: e.getAttribute("data-lm-appearance"),
      dashed: [...e.querySelectorAll("path")].every((p) => (p.getAttribute("stroke-dasharray") ?? "").startsWith("3.5 2")) }))])));
  eq(apps.TOMBS.map((a) => [a.in, a.app]), [["H2", null], ["H3", "H2"]],
     "MF09 · «H2–H3?»: drawn in H2 (the master) AND in H3 (an instance of the H2 row)");
  eq(apps.RUIN.map((a) => [a.in, a.app]), [["H4", null], ["H7", "H4"], ["H56", "H4"]],
     "MF09 · the ruin on THREE horizons: master in H4, instances in H5–H6 and H7");
  ok(apps.RUIN.slice(1).every((a) => a.dashed) && !apps.RUIN[0].dashed, "…the instances drawn dashed (a symbol's dashed and dotted), the master not");
  eq(apps.TEMPLE.length, 1, "…a row whose life touches one horizon only once");
  eq(await H(page, () => document.querySelectorAll(".tile-fmbody .lm-span").length), 0, "…no dotted life line: the instances say it");
  // C · the bond declared from the page
  eq(await H(page, () => document.querySelector('[data-lm-bind="TEMPLE-GRAPH"]')?.value), "", "C · the bar «Grafi citati»: the temple, no site");
  await page.selectOption('[data-lm-bind="TEMPLE-GRAPH"]', "site_S03");
  await page.waitForFunction(() => document.querySelector('.tile-fmbody [data-lm-row="TEMPLE"]')?.getAttribute("data-lm-evidence") === "stratigraphic", null, { timeout: 30000 });
  rows = await rowsDrawn(page);
  eq([rows.TEMPLE.ev, rows.RUIN.ev, rows.REST.ev, rows.OLDER.ev], ["stratigraphic", "stratigraphic", "stratigraphic", "documentary"],
     "bound to S03: its identities take their members from the temple graph (red; the earlier phase, only USD, orange)");
  ok(["COLONY", "TOMBS", "ALT"].every((k) => rows[k].ev === "symbol"), "…the others stay symbols");
  st = await lmOf(page);
  eq([st.answer.bindings[0].site, st.answer.bindings[0].by], ["site_S03", "declared"], "…the bond is the landscape's (declared in its composition)");
  eq(st.landscape.composition.map((e) => [e.id, e.site]), [["TEMPLE-GRAPH", "site_S03"]], "…written in the LANDSCAPE's header (what the save writes)");
  ok(st.landscape.dirty, "…its file dirty");
  ok(st.landscape.others.every((o) => o.composition.length === 0 && !o.dirty), "…the temple's file untouched");
  await shot(page, "lm-2-bound");
  // «Annulla» takes it back
  await page.click(".toast-action");
  await page.waitForFunction(() => document.querySelector('.tile-fmbody [data-lm-row="TEMPLE"]')?.getAttribute("data-lm-evidence") === "symbol", null, { timeout: 30000 });
  ok(true, "«Annulla»: the bond goes, the temple a symbol again");
  await page.selectOption('[data-lm-bind="TEMPLE-GRAPH"]', "site_S03");
  await page.waitForFunction(() => document.querySelector('.tile-fmbody [data-lm-row="TEMPLE"]')?.getAttribute("data-lm-evidence") === "stratigraphic", null, { timeout: 30000 });
  // the card of a row
  await page.click('.tile-fmbody [data-lm-row="TEMPLE"] .fm-hit');
  await page.waitForSelector('[data-lm-card="TEMPLE"]', { timeout: 10000 });
  const card = await H(page, () => Object.fromEntries([...document.querySelectorAll('[data-lm-card="TEMPLE"] [data-lm-row-key]')]
    .map((r) => [r.getAttribute("data-lm-row-key"), r.querySelector(".fm-v")?.textContent ?? ""])));
  ok(/S03/.test(card.site) && /stratigrafico/.test(card.evidence) && /«tempio» \(2\)/.test(card.members) && /aedes · portico/.test(card.rooms),
     `the card of an identity: site, evidence, where its members come from, its rooms (${JSON.stringify(card)})`);

  // B · the zoom of the Functional Matrix, the temple active
  await activate(page, "TEMPLE-GRAPH");
  await H(page, (w) => window.__EM_DRAG__.retype(w, "functional-matrix"), lmWin);
  await page.waitForSelector(".tile-fmbody [data-fm-zoom]", { timeout: 60000 });
  await page.waitForSelector(".tile-fmbody [data-fm-unit]", { timeout: 60000 });
  eq(await H(page, () => [...document.querySelectorAll(".tile-fmbody [data-fm-lane]")].map((e) => e.getAttribute("data-fm-lane"))),
     ["H7", "H56", "H4", "H3", "H2", "H1", "H0"], "B · step 1, inside the building: the same lanes, the container's horizons");
  ok(await H(page, () => !!document.querySelector('.tile-fmbody [data-fm-unit="T"] [data-fm-unit="A"]')), "…the temple with its rooms");
  const zoomTo = async (n) => {
    await page.fill(".tile-fmbody [data-fm-zoom]", String(n));
    await page.waitForFunction((x) => document.querySelector(".tile-fmbody [data-fm-zoom-label]")?.getAttribute("data-fm-zoom-label") === String(x), n, { timeout: 20000 });
  };
  await zoomTo(2);
  await page.waitForSelector(".tile-fmbody [data-lm-row]", { timeout: 30000 });
  eq(await H(page, () => [...document.querySelectorAll(".tile-fmbody [data-lm-col]")].map((e) => e.getAttribute("data-lm-code"))), ["S03"],
     "step 2, the building in time: the column of its site");
  eq(await H(page, () => document.querySelector(".tile-fmbody .lm-zoom-label")?.textContent), "l'edificio nel tempo", "…named in Italian");
  ok(await H(page, () => /tempio · 2/.test(document.querySelector('.tile-fmbody [data-lm-row="TEMPLE"] .lm-label')?.textContent ?? "")
                         && document.querySelector('.tile-fmbody [data-lm-rooms="TEMPLE"]')?.textContent === "aedes · portico"),
     "…the identity with the number of its members and the names of its rooms");
  eq(await H(page, () => [...document.querySelectorAll(".tile-fmbody [data-lm-lane]:not([data-lm-row])")].map((e) => e.getAttribute("data-lm-lane")).filter(Boolean)),
     ["H7", "H56", "H4", "H3", "H2", "H1", "H0"], "…the same lanes");
  await shot(page, "lm-3-zoom2");
  // a click on the identity selects the temple graph's own unit
  await page.click('.tile-fmbody [data-lm-row="TEMPLE"] .fm-hit');
  await page.waitForFunction(() => window.__EM_DRAG__.selected()[0] === "T", null, { timeout: 10000 });
  ok(true, "…a click on «tempio» selects the temple graph's «tempio» (the Inspector follows)");
  await zoomTo(3);
  await page.waitForFunction(() => document.querySelectorAll(".tile-fmbody [data-lm-col]").length === 5, null, { timeout: 20000 });
  eq(await H(page, () => [...document.querySelectorAll(".tile-fmbody [data-lm-col]")].map((e) => e.getAttribute("data-lm-code"))),
     ["S01", "S02", "S03", "S04", "S05"], "step 3, the site with its neighbours");
  await shot(page, "lm-4-zoom3");
  await zoomTo(4);
  await page.waitForFunction(() => document.querySelectorAll(".tile-fmbody [data-lm-col]").length === 6, null, { timeout: 20000 });
  ok(true, "step 4, the city: every column (the Landscape Matrix)");
  await zoomTo(1);
  await page.waitForSelector(".tile-fmbody [data-fm-unit]", { timeout: 20000 });
  ok(true, "back to step 1: the Functional Matrix of the building");
  eq(errors, [], "no page error");
  await ctx.close();

  // a graph read alone (no landscape open): step 2 is its own identities
  {
    const o = await open([TEMPLE]);
    const w = await area(o.page, "functional-matrix");
    await o.page.waitForSelector(".tile-fmbody [data-fm-zoom]", { timeout: 60000 });
    await H(o.page, (x) => window.__EM_DRAG__.setZoom(x, 2), w);
    await o.page.waitForSelector(".tile-fmbody [data-lm-row]", { timeout: 30000 });
    eq(await H(o.page, () => [...document.querySelectorAll(".tile-fmbody [data-lm-row]")].map((e) => e.getAttribute("data-lm-row")).sort()), ["F", "T"],
       "no landscape: step 2 draws the graph's own identities");
    await H(o.page, (x) => window.__EM_DRAG__.setZoom(x, 3), w);
    await o.page.waitForSelector('.tile-fmbody [data-lm-state="nolandscape"]', { timeout: 20000 });
    ok(true, "…and step 3 says a landscape is needed");
    eq(o.errors, [], "no page error");
    await o.ctx.close();
  }
  // the switch off: nothing of it
  {
    const o = await open([LAND], { embargo: false });
    eq(await H(o.page, () => typeof window.__EM_DRAG__.landscapeMatrix), "undefined", "switch off: no hook");
    // a saved area of the type (the lab knows the type) says why it is empty
    await H(o.page, () => { const D = window.__EM_DRAG__; D.retype(D.splitDoc(D.activeWinId()), "landscape-matrix"); });
    await o.page.waitForFunction(() => /funzione in embargo/.test(document.querySelector(".tile-fmbody")?.textContent ?? ""), null, { timeout: 20000 });
    ok(await H(o.page, () => !document.querySelector("[data-lm-row]")), "switch off: an area of the type draws nothing and says why");
    await o.ctx.close();
  }

  // ── 5 · the real case ──
  if (REAL) {
    const r = await open([REAL.temple, REAL.land]);
    await area(r.page, "landscape-matrix");
    await r.page.waitForSelector(".tile-fmbody [data-lm-row]", { timeout: 120000 });
    const a = (await lmOf(r.page)).answer;
    const ids = a.rows.filter((x) => x.kind === "identity");
    eq([ids.length, a.columns.filter((c) => c.id).length, a.lanes.length], [47, 25, 7],
       "Sarmizegetusa: 47 identities, 25 sites, the lanes H0–H7");
    const s15 = a.sites.find((s) => s.code === "S15").id;
    const bound = a.bindings.find((b) => b.site === s15);
    ok(!!bound && bound.by === "declared" && bound.loaded, "Templu Mare bound to S15 by the landscape's file");
    eq(ids.filter((x) => x.site === s15).map((x) => x.evidence), ["stratigraphic", "stratigraphic", "stratigraphic", "stratigraphic"],
       "the four identities of S15 red");
    eq(ids.filter((x) => x.site !== s15 && x.evidence !== "symbol").length, 0, "the other 43 symbols");
    await shot(r.page, "lm-5-sarmizegetusa");
    await activate(r.page, "6af9866e-96a9-5c99-a6b1-78524ae2e2c2");
    const fw = await area(r.page, "functional-matrix");
    await r.page.waitForSelector(".tile-fmbody [data-fm-zoom]", { timeout: 60000 });
    await H(r.page, (x) => window.__EM_DRAG__.setZoom(x, 3), fw);
    // two areas now: the Landscape Matrix and the Functional Matrix (the one with the zoom)
    await r.page.waitForFunction(() => document.querySelectorAll(".tile-fmbody:has([data-fm-zoom]) [data-lm-col]").length === 5, null, { timeout: 60000 });
    eq(await H(r.page, () => [...document.querySelectorAll(".tile-fmbody:has([data-fm-zoom]) [data-lm-col]")].map((e) => e.getAttribute("data-lm-code"))),
       ["S13", "S14", "S15", "S16", "S17"], "the temple's zoom 3: S15 among S13–S17");
    await shot(r.page, "lm-6-templu-zoom3", ".tile-fmbody:has([data-fm-zoom])");
    eq(r.errors, [], "the real case: no page error");
    await r.ctx.close();
  } else {
    console.log("  (the real case skipped: the datasets are not on this machine)");
  }
} finally {
  await browser.close();
  stop();
}
console.log(`✓ check-landscape-matrix: ${checks} checks passed`);
