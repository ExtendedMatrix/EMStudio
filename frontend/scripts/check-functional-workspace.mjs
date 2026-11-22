// MICRO-MF07 (E.D., 22 Nov 2026: «Accetto la scrivania in tutte le sue parti,
// sviluppala») · THE WORKSPACE FUNCTIONAL AS THE DESK — under embargo
// (`functional-workspace`, `functional-matrix`, `landscape-cube`), EMStudio lab.
//
//   1. the rules: the two new area types and their texts only in the lab
//      build (LAB_TEXTS, EN + IT), every use behind FW_ON, the route
//      `/functional-proposals` only in em_py_lab, the echo provider answers
//      the functional briefing;
//   2. the pure drawing: the frame of the footprints (the far outliers out),
//      the fit (planes close, short verticals), the four layers (symbolic with
//      containers and chains, plan, proxy extruded, models masked by the
//      buried), the plan by horizon (buried hatched, in view full);
//   3. the page on Templu Mare v11 (no functional unit → the proposals) and
//      fu-prova: the desk's areas and their places, the row «No functional
//      unit…» with its actions, the proposals (show, rename, discard, accept —
//      its container too —, the AI unconfigured says so, the AI (echo)
//      proposes and an accepted proposal carries its paradata: author_ai,
//      validated_by/at), a real drag from the Matrix into a brace, the lasso
//      on the plan, the horizon of the plan (buried, instances), the four
//      layers of the Cube, the turntable (only transforms, inertia, wheel),
//      the switch off.
//
// Run: node scripts/check-functional-workspace.mjs  (PORT=<vite> to reuse one;
// SHOTS=<dir> for pictures; PLAYWRIGHT_CORE / CHR as the other checks).
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
ok(/const FW_ON = LAB && featureOn\("functional-workspace"\);/.test(main), "main.ts: FW_ON = LAB && featureOn(\"functional-workspace\")");
{
  const imp = /import \{([^}]+)\} from "\.\/functional-proposals";/.exec(main);
  ok(!!imp, "main.ts imports the proposals once");
  const imp2 = /import \{ (lcPlanOf[^}]+)\} from "\.\/landscape-cube";/.exec(main);
  ok(!!imp2, "…and the plan from the cube's module");
  // a type folds away in the build: only the values are checked
  const names = [...imp[1].split(","), ...imp2[1].split(",")].map((s) => s.trim()).filter((s) => s && !/^type\s/.test(s)).map((s) => s.split(/\s+as\s+/).pop());
  const lines = main.replace(imp[0], "").replace(imp2[0], "").split("\n");
  const bad = [];
  for (const n of names) {
    lines.forEach((l, i) => {
      if (!new RegExp(`\\b${n}\\b`).test(l)) return;
      const ctx = lines.slice(Math.max(0, i - 40), i + 1).join("\n");
      if (!/FW_ON|\(LAB \?/.test(ctx)) bad.push(`${n} @${i + 1}`);
    });
  }
  eq(bad, [], "every use of the proposals and the plan in main.ts sits behind FW_ON (or LAB)");
  ok(/if \(FW_ON && FM_ON\) \{\n  setProposalsHost\(/.test(main), "the proposals' host is given only with FW_ON (and the Functional Matrix)");
  ok(/function fwAccept\(p: Proposal, parentId: string \| null\): string \| null \{\n  const st = store;\n  if \(!FW_ON \|\| !FM_ON \|\| !st\) return null;/.test(main),
     "an accepted proposal is written only with the switches on");
}
const i18n = read("frontend/src/i18n.ts");
const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]);
const openI18n = i18n.replace(/\.\.\.\(LAB_TEXTS \? \{[\s\S]*?\n  \} : \{\}\),/g, "");
const fpSrc = read("frontend/src/functional-proposals.ts");
const lcSrc = read("frontend/src/landscape-cube.ts");
const used = new Set([...fpSrc.matchAll(/"((?:fwp|fw|lc|fm)\.[\w.]+)"/g), ...lcSrc.matchAll(/"((?:fw|lc)\.[\w.]+)"/g),
                      ...main.matchAll(/"((?:fwp|fw)\.[\w.]+)"/g)].map((m) => m[1]));
for (const k of ["lc.seen.exposed", "lc.seen.buried", "lc.seen.partially_exposed", "lc.seen.undetermined", "lc.layer.symTitle", "lc.layer.planTitle",
  "lc.layer.prxTitle", "lc.layer.rmTitle", "fwp.src.ai", "fwp.src.activity", "ws.functionalDesk"]) used.add(k);
ok(used.size > 70, `the texts of the desk read (${used.size})`);
eq(labBlocks.length, 2, "two LAB_TEXTS blocks (EN, IT)");
eq([...used].filter((k) => !labBlocks.every((b) => b.includes(`"${k}":`))), [], "every text of the desk in both LAB_TEXTS blocks (EN + IT)");
eq([...used].filter((k) => /^(fwp|fw)\./.test(k) && openI18n.includes(`"${k}"`)), [], "…and none in the open dictionaries");
const labPy = read("tools/em_py_lab.py");
ok(/"\/functional-proposals": _functional_proposals_route/.test(labPy), "the route /functional-proposals lives in em_py_lab (absent from the community sidecar)");
ok(!/functional-proposals/.test(read("tools/em_bridge.py")), "em_bridge.py names no such route");
ok(/if context\.get\("functional"\):\n\s+return self\._echo_functional\(context\)/.test(read("tools/llm_provider.py")),
   "the echo provider answers the functional briefing (the whole path without a key)");
ok(/"functional-plan"[\s\S]{0,80}"functional-proposals"/.test(read("frontend/src/workspace.ts")), "workspace.ts: the two area types");

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
  const types = ["functional-plan", "functional-proposals"];
  eq(types.map((ty) => [Object.keys(W.WINDOW_TYPE_META).includes(ty), !!I.WINDOW_ICON_PATHS[ty]]),
     types.map(() => [profile === "lab", profile === "lab"]), `${profile}: the plan and the proposals (name, icon) ${profile === "lab" ? "are" : "are not"} in the model`);
  const M = await load("shell/types.ts", profile);
  M.registerBuiltinSurfaces(new Proxy({}, { get: () => () => {} }));
  eq(types.map((ty) => M.convertedTypes().includes(ty)), types.map(() => profile === "lab"), `${profile}: their surfaces registered only in the lab`);
}

// ── 2 · the pure drawing ────────────────────────────────────────────────────
const LC = await load("landscape-cube.ts", "lab", [paletteStub]);
const tt = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
const sq = (x, y, w) => [[x, y], [x + w, y], [x + w, y + w], [x, y + w]];
{
  // the frame: a footprint 300 km away (another frame) is left out
  const fr = LC.lcFrame([{ id: "a", rings: [sq(0, 0, 4)] }, { id: "b", rings: [sq(10, 0, 4)] }, { id: "c", rings: [sq(5, 8, 2)] },
                         { id: "far", rings: [sq(327000, 448000, 2)] }]);
  eq([fr.outliers, fr.centre, fr.half], [["far"], [7, 5], [7, 5]], "the frame: centred on the envelope of the footprints, the far outlier left out");
  // the fit: three planes in a short area: the planes close, the stack fits
  const f = LC.lcFit({ radius: 30, planes: [{}, {}, {}] }, 800, 400, { tilt: 0.34, gap: null });
  ok(f.gap < f.planeH && f.height <= 400 + 1, `the fit: the planes closer than a plane's height (short verticals: gap ${f.gap.toFixed(0)} < ${f.planeH.toFixed(0)}), the stack in the area`);
  const m = LC.lcMatrix(f, 0, 0.34, 1);
  eq([Math.round(m[0] * 1000) / 1000, Math.round(m[5] - f.oy)], [Math.round(f.k * 1000) / 1000, Math.round(f.gap)], "…a plane's transform: the scale, and one gap lower per plane");
}
const answer = {
  scale: "building",
  lanes: [{ id: "E4", name: "Oggi", start: 1801, end: 2026 }, { id: "E3", name: "Post", start: 200, end: 1800 }, { id: "E2", name: "II", start: 100, end: 199 }],
  planes: [
    { lane: "E4", name: "Oggi", start: 1801, end: 2026, without: [], rm: [], rm_unread: [{ id: "S", name: "Survey", url: "x.3tz", why: "tileset" }],
      items: [{ id: "F1", reader: "RE", readers: ["RE"], evidence: "stratigraphic", instance: true, from_lane: "E2", visibility: "exposed" }],
      symbols: [{ fu: "RE", name: "restauro", ring: sq(0, 0, 4), evidence: "stratigraphic", container: false, parent: null, members: ["F1"] }] },
    { lane: "E3", name: "Post", start: 200, end: 1800, without: [], rm: [],
      items: [{ id: "F1", reader: "RU", readers: ["RU"], evidence: "stratigraphic", instance: true, from_lane: "E2", visibility: "buried" }],
      symbols: [{ fu: "RU", name: "rudere", ring: sq(0, 0, 4), evidence: "stratigraphic", container: false, parent: null, members: ["F1"] }] },
    { lane: "E2", name: "II", start: 100, end: 199, without: ["X"],
      rm: [{ id: "RM1", name: "ricostruzione", epoch: "E2", rings: [sq(-1, -1, 26)], z_range: [0, 6], url: "m.gltf" }],
      items: [{ id: "F1", reader: "A", readers: ["A"], evidence: "stratigraphic", instance: false, from_lane: null, visibility: "exposed" },
              { id: "D1", reader: null, readers: [], evidence: null, instance: false, from_lane: null, visibility: "buried" }],
      symbols: [{ fu: "T", name: "tempio", ring: [[0, 0], [24, 0], [24, 4], [0, 4]], evidence: "stratigraphic", container: true, parent: null, members: ["F1", "D1"] },
                { fu: "A", name: "aedes (podio)", ring: sq(0, 0, 4), evidence: "stratigraphic", container: false, parent: "T", members: ["F1"] }] }],
  units: { F1: { name: "F1", type: "US", rings: [sq(0, 0, 4)], centroid: [2, 2], lane: "E2", lanes: ["E4", "E3", "E2"], source: "proxy", stale: false, z_range: [10, 12.5] },
           D1: { name: "D1", type: "US", rings: [sq(20, 0, 4)], centroid: [22, 2], lane: "E2", lanes: ["E2"], source: "proxy", stale: false, z_range: [10, 11] } },
  verticals: [{ id: "F1", lanes: ["E4", "E3", "E2"] }], bbox: [0, 0, 24, 4], crs: [],
  functional_units: { A: { name: "aedes", scale: "room", parent: "T" }, T: { name: "tempio", scale: "building" }, RU: { name: "rudere", scale: "building" },
                      RE: { name: "restauro", scale: "building" } },
  chains: [{ latter: "RU", former: "T", change_type: "rovina" }, { latter: "RE", former: "RU", change_type: "ricostruzione" }],
};
{
  const all = { sym: true, plan: true, prx: true, rm: true };
  const o = { width: 900, height: 700, rot: 30, gap: null, tilt: 0.34, sel: null, t: tt, win: "w" };
  const svg = LC.lcBuildingSvg(answer, { ...o, layers: all });
  eq(svg.match(/class="lc-sym-hull"/g)?.length, 4, "SYMBOLIC · a hull per functional unit per plane");
  ok(/data-lc-fu="T"[^>]*data-lc-container=""[^>]*stroke-dasharray="6 3"/.test(svg), "…a container dashed");
  ok(/>\{ aedes \}</.test(svg) && />\{ tempio \}</.test(svg), "…the name between braces");
  eq([...svg.matchAll(/data-lc-chain="([^"]+)"/g)].map((x) => x[1]).sort(), ["RE>RU", "RU>T"], "…the chains of transformation between the planes");
  eq(svg.match(/class="lc-fp"/g)?.length, 4, "PLAN · the footprints in line, one per unit per plane");
  ok(/class="lc-fp" data-lc-unit="D1"[^>]*data-lc-seen="buried"[^>]*fill="url\(#lc-hatch-m\)" stroke-width="0.5"/.test(svg), "…a buried one thin and hatched");
  eq(svg.match(/class="lc-top"/g)?.length, 4, "PROXY · each footprint extruded");
  const hs = [...svg.matchAll(/class="lc-top" data-lc-plane-index="2" data-lc-h="([\d.]+)"/g)].map((x) => Number(x[1])).sort();
  eq(hs, [1, 2.5], "…by the true height of its glb (z_range)");
  ok(/class="lc-layer-rm" mask="url\(#lc-mask-w-2\)"><polygon[^>]*class="lc-rm" data-lc-rm="RM1"/.test(svg), "MODELS · the model of the epoch on its plane…");
  ok(/<mask id="lc-mask-w-2"[^]*?<polygon points="[^"]+" fill="#000"\/><\/mask>/.test(svg), "…masked by the buried units (cut to what was visible)");
  const only = (L) => LC.lcBuildingSvg(answer, { ...o, layers: { sym: false, plan: false, prx: false, rm: false, ...L } });
  eq([/lc-sym-hull/.test(only({ sym: true })), /class="lc-fp"/.test(only({ sym: true })), /class="lc-top"/.test(only({ plan: true })), /lc-rm"/.test(only({ prx: true }))],
     [true, false, false, false], "the four layers: independent switches");
  ok(/data-lc-vertical="F1"/.test(svg), "the vertical of F1, crossing the planes");
  ok(/class="lc-sym-hull lc-lit"|class="lc-fp lc-lit"/.test(LC.lcBuildingSvg(answer, { ...o, layers: all, lit: new Set(["F1"]) })), "what is lit elsewhere lights here");
  // the plan by horizon
  const plane = answer.planes[2];
  const d = LC.lcPlanSvg(answer, plane, { width: 600, height: 300, sel: null, t: tt });
  eq([d.items, d.buried, d.lane], [2, 1, "E2"], "the PLAN of a horizon: its footprints, one buried");
  ok(/data-lc-unit="D1" data-lc-seen="buried"[^>]*><polygon[^>]*fill="url\(#lc-hatch-px\)"[^>]*stroke-width="0.6"/.test(d.svg), "…buried: thin outline, hatched");
  ok(/data-lc-unit="F1" data-lc-seen="exposed"[^>]*><polygon[^>]*fill="#9B3333" fill-opacity="0.3"/.test(d.svg), "…in view: full, the colour of its reader");
  const p3 = LC.lcPlanSvg(answer, answer.planes[1], { width: 600, height: 300, sel: null, t: tt });
  ok(/data-lc-instance="E2"[^>]*><polygon[^>]*stroke-dasharray="3 2"/.test(p3.svg), "…an instance from before dashed");
  ok(/10 m/.test(d.svg), "…with its scale");
}

// ── 3 · the page ─────────────────────────────────────────────────────────────
const S3D = path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
let pw = null;
for (const t of [process.env.PLAYWRIGHT_CORE, path.join(ROOT, ".claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js"), "playwright-core"].filter(Boolean)) {
  try { const m = await import(t); pw = m.chromium ? m : m.default; break; } catch { /* next */ }
}
const DS = path.resolve(ROOT, "../_datasets");
const V11 = process.env.TEMPLU ?? path.join(DS, "templumare-v11/TempluMare_v11.em.json");
const FU_PROVA = process.env.TEMPLU_FU ?? path.join(DS, "templumare-v11/TempluMare_v11_fu-prova.em.json");
const TEMPLU_EM = process.env.TEMPLU_EM ?? path.join(os.homedir(),
  "Library/CloudStorage/OneDrive-CNR/Dottorato Bucarest/14_EM_1.6_lavoro/TempluMare_v2_for_3DR_2026-10-06/EM");
if (!fs.existsSync(py) || !pw || !fs.existsSync(V11) || !fs.existsSync(FU_PROVA) || !fs.existsSync(path.join(TEMPLU_EM, "proxies"))) {
  console.log(`check-functional-workspace: ${checks} checks passed (${!pw ? "no playwright-core" : !fs.existsSync(py) ? "no s3Dgraphy venv" : "Templu Mare v11, fu-prova or its proxies not on this machine"}: the page skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
// copies: the em.json beside its proxies and the .gltf of its models (OneDrive only read)
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "functional-workspace-")));
fs.mkdirSync(path.join(dir, "proxies"), { recursive: true });
for (const f of fs.readdirSync(path.join(TEMPLU_EM, "proxies"))) if (f.endsWith(".glb")) fs.copyFileSync(path.join(TEMPLU_EM, "proxies", f), path.join(dir, "proxies", f));
const RMDIR = path.join(TEMPLU_EM, "_master/Reconstruction II AC");
if (fs.existsSync(RMDIR)) {
  fs.mkdirSync(path.join(dir, "_master/Reconstruction II AC"), { recursive: true });
  for (const f of fs.readdirSync(RMDIR)) if (f.endsWith(".gltf")) fs.copyFileSync(path.join(RMDIR, f), path.join(dir, "_master/Reconstruction II AC", f));
}
const DOC = path.join(dir, "TempluMare_v11.em.json");
const FU = path.join(dir, "TempluMare_v11_fu-prova.em.json");
fs.copyFileSync(V11, DOC);
fs.copyFileSync(FU_PROVA, FU);
const SHOTS = process.env.SHOTS ?? null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const machine = { S3DGRAPHY_CONSOLE_DIR: path.join(dir, "m/console"), S3DGRAPHY_PROFILES_DIR: path.join(dir, "m/profiles"),
  S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "m/extensions"), S3DGRAPHY_PLUGINS_DIR: path.join(dir, "m/plugins"),
  EM_VOCABULARIES_DIR: path.join(dir, "m/vocab"), EM_BRIDGE_STATE_DIR: path.join(dir, "m/state") };
const bport = await freePort();
// no key in the bench's bridge: the AI «claude» is unconfigured; «echo» answers without one
const env = { ...process.env, ...machine };
delete env.ANTHROPIC_API_KEY;
const bridge = spawn(py, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(bport), "--fs-root", dir, "--s3dgraphy", path.join(S3D, "src")],
  { env, stdio: ["ignore", "ignore", "pipe"] });
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
// the bridge's route answers (the bench's own bridge; the dev stack's is not touched)
{
  const doc = JSON.parse(fs.readFileSync(DOC, "utf8"));
  const a = await (await fetch(`${B}/functional-proposals`, { method: "POST", body: JSON.stringify({ doc, lang: "it" }) })).json();
  eq([a.ok, a.mode, a.proposals.length], [true, "activities", 6], "bridge · /functional-proposals: one proposal per activity of v11 (six)");
  const c = await fetch(`${B}/functional-proposals`, { method: "POST", body: JSON.stringify({ doc, mode: "ai", provider: "claude", lang: "it" }) });
  eq(c.status, 501, "bridge · the AI without a key: 501 (not configured)");
  const e = await (await fetch(`${B}/functional-proposals`, { method: "POST", body: JSON.stringify({ doc, mode: "ai", provider: "echo", base: DOC, lang: "it", date: "2026-11-22" }) })).json();
  eq([e.ok, e.model, e.proposals.length, e.sent.units, e.sent.footprints > 60, e.sent.narrative_chars > 0], [true, "echo-1", 7, 116, true, true],
     "bridge · the AI (echo): seven proposals; the briefing read 116 units, the footprints' nearness and the Narrative");
}

const browser = await pw.chromium.launch({ executablePath: fs.existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function open(file, { embargo = true, lang = "it", provider = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1800, height: 1150 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(([on, l, prov]) => {
    if (on) window.__EM_EMBARGO__ = true;
    if (!sessionStorage.getItem("fw-probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", l);
      if (prov) localStorage.setItem("emstudio.settings", JSON.stringify({ ai: { provider: prov, model: "" } }));
      sessionStorage.setItem("fw-probe", "1");
    }
  }, [embargo, lang, provider]);
  await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(B)}`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 120000 });
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, file]);
  await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 5, null, { timeout: 120000 });
  return { ctx, page, errors };
}
const H = (page, fn, arg) => page.evaluate(fn, arg);
const shot = async (page, name, sel) => {
  if (!SHOTS) return;
  const el = sel ? await page.$(sel) : null;
  await (el ?? page).screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
const fp = (page) => H(page, () => window.__EM_DRAG__.proposals());
const byName = (page, n) => H(page, (x) => window.__EM_DRAG__.allNodes().find((nd) => nd.name === x)?.id ?? null, n);
/** the words of a gesture: the toast (when no other toast covers it) or the Log, which keeps them */
const waitSaid = (page, re, what) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById("toast")?.textContent ?? "")
  || window.__EM_DRAG__.logTail(30).some((l) => new RegExp(src).test(l)), re.source, { timeout: 30000 }).then(() => ok(true, what), async (e) => {
    console.error(`toast now: «${await page.evaluate(() => document.getElementById("toast")?.textContent)}» log: ${JSON.stringify(await page.evaluate(() => window.__EM_DRAG__.logTail(8)))}`);
    throw e;
  });
const waitToast = (page, re, what) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById("toast")?.textContent ?? ""),
  re.source, { timeout: 30000 }).then(() => ok(true, what), async (e) => {
    console.error(`toast now: «${await page.evaluate(() => document.getElementById("toast")?.textContent)}»`);
    throw e;
  });
const today = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();

try {
  // ── A · the desk, on v11 (no functional unit) ──
  const { ctx, page, errors } = await open(DOC);
  await page.waitForSelector('[data-ws="functional"]', { timeout: 30000 });
  await page.click('[data-ws="functional"]');
  await page.waitForSelector(".fp-card", { timeout: 120000 });
  const wins = await H(page, () => window.__EM_DRAG__.wins().map((w) => w.type).sort());
  eq(wins, ["functional-matrix", "functional-plan", "functional-proposals", "graph", "inspector", "landscape-cube", "table"].sort(),
     "A · the desk: Matrix, Functional Matrix, Space (plan), Cube, Proposals, Inspector, coherence");
  const box = await H(page, () => Object.fromEntries(window.__EM_DRAG__.wins().map((w) => {
    const el = [...document.querySelectorAll(".tile-area")].find((x) => x.dataset.win === w.id);
    const r = el?.getBoundingClientRect();
    return [w.type, r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null];
  })));
  if (Object.values(box).every(Boolean)) {
    ok(box.graph.x < box["functional-matrix"].x && box["functional-matrix"].x < box["functional-plan"].x && box.graph.w < box["functional-matrix"].w,
       "…the Matrix narrow on the left, the Functional Matrix in the centre, the Space on the right");
    ok(box["functional-plan"].y < box["landscape-cube"].y && Math.abs(box["functional-plan"].x - box["landscape-cube"].x) < 4, "…the Space above, the Cube below");
    ok(box["functional-proposals"].y > box["functional-matrix"].y + 100 && box["functional-proposals"].x < box.inspector.x && box.inspector.x < box.table.x,
       "…at the bottom the Proposals · the Inspector · the coherence");
  } else ok(false, `the areas' boxes: ${JSON.stringify(box)}`);
  ok(await H(page, () => window.__EM_DRAG__.wins().find((w) => w.type === "table")?.state?.["current.table.sheet"] === "Issues"), "…the coherence is the table on «Issues»");
  // the Functional Matrix of a graph with no unit: the row and its actions
  await page.waitForSelector(".fw-empty-row", { timeout: 60000 });
  await page.waitForSelector('.fw-empty-row [data-fw-empty-act="proof"]', { timeout: 30000 }).catch(() => {});
  eq(await H(page, () => [...document.querySelectorAll(".fw-empty-row [data-fw-empty-act]")].map((b) => b.dataset.fwEmptyAct)), ["proposals", "read-as", "proof"],
     "the Functional Matrix: «Nessuna unità funzionale…» with Proposals, Read as…, the proof file");
  ok(await H(page, () => /Nessuna unità funzionale/.test(document.querySelector(".fw-empty-row")?.textContent ?? "")), "…in its words");
  // B · the proposals from the activities
  await page.waitForFunction(() => window.__EM_DRAG__.proposals()?.activities === "ok", null, { timeout: 60000 });
  let s = await fp(page);
  eq(s.proposals.filter((p) => p.source === "activity").length, 6, "B · from the activities: one brace per activity (six)");
  eq(await H(page, () => document.querySelectorAll('.fp-card[data-fp-source="activity"]').length), 6, "…six cards");
  const first = s.proposals[0];
  ok(/Proposta meccanica/.test(first.why) && first.scale === "room", "…each with its why (mechanical, no interpretation), a room");
  // Show: the members lit everywhere
  await page.click(`.fp-card[data-fp-key="${first.key}"] [data-fp-show]`);
  await page.waitForFunction((n) => window.__EM_DRAG__.selectedIds().length === n, first.members.length, { timeout: 10000 });
  eq((await H(page, () => window.__EM_DRAG__.selectedIds())).sort(), [...first.members].sort(), "Mostra: its members are the selection (lit in the Matrix, the Space, the Cube)");
  await page.waitForFunction(() => document.querySelectorAll(".lc-plan-svg .lc-plan-fp.lc-lit").length > 0, null, { timeout: 60000 }).catch(() => {});
  ok(await H(page, () => document.querySelectorAll(".lc-plan-svg .lc-plan-fp.lc-lit, .lc-plan-svg .lc-plan-fp.lc-sel").length > 0), "…and in the plan of the Space");
  ok(await H(page, (k) => document.querySelector(`.fp-card[data-fp-key="${k}"]`)?.classList.contains("fp-shown"), first.key), "…the card marked");
  // Rename (in place), Discard
  await page.click(`.fp-card[data-fp-key="${first.key}"] [data-fp-rename]`);
  await page.keyboard.press("Meta+A").catch(() => {});
  await page.keyboard.type("fondazioni del tempio");
  await page.keyboard.press("Enter");
  await page.waitForFunction((k) => window.__EM_DRAG__.proposals().proposals.find((p) => p.key === k)?.name === "fondazioni del tempio", first.key, { timeout: 10000 });
  ok(true, "Rinomina: the proposal renamed in place");
  const second = s.proposals[1];
  await page.click(`.fp-card[data-fp-key="${second.key}"] [data-fp-discard]`);
  await page.waitForFunction((k) => !window.__EM_DRAG__.proposals().proposals.some((p) => p.key === k), second.key, { timeout: 10000 });
  eq((await fp(page)).proposals.length, 5, "Scarta: gone from the list (five left)");
  ok((await H(page, () => window.__EM_DRAG__.allNodes().filter((n) => n.node_type === "FunctionalUnitNodeGroup").length)) === 0,
     "…nothing entered the graph: only the accepted does");
  // Accept
  await page.click(`.fp-card[data-fp-key="${first.key}"] [data-fp-accept]`);
  await waitSaid(page, /«fondazioni del tempio» accettata · 3 membri/, "Accetta: said (the toast with Annulla, the Log)");
  s = await fp(page);
  const acc = s.proposals.find((p) => p.key === first.key);
  eq([acc.status, !!acc.fu], ["accepted", true], "…the proposal accepted");
  const fu1 = await H(page, (id) => {
    const n = window.__EM_DRAG__.node(id); const E = window.__EM_DRAG__.allEdges();
    return { type: n?.node_type, name: n?.name, scale: n?.data?.scale, members: E.filter((e) => e.target === id && e.edge_type === "is_in_functional_unit").length,
             epoch: E.find((e) => e.source === id && e.edge_type === "has_first_epoch")?.target ?? null };
  }, acc.fu);
  eq([fu1.type, fu1.name, fu1.scale, fu1.members, fu1.epoch], ["FunctionalUnitNodeGroup", "fondazioni del tempio", "room", 3, first.epoch],
     "…in the graph: the functional unit (its name, scale), its first epoch, its three members");
  await page.waitForFunction(() => (window.__EM_DRAG__.functionalMatrix().units ?? 0) >= 1, null, { timeout: 60000 });
  ok(true, "…the Functional Matrix draws it");
  await page.waitForSelector(`.fp-card[data-fp-key="${first.key}"][data-fp-status="accepted"]`, { timeout: 10000 });
  ok(true, "…the card says «accettata»");
  // the AI without a configuration: it says so, the activities stay
  await page.click('[data-fp-ai="graph"]');
  await page.waitForFunction(() => window.__EM_DRAG__.proposals().ai === "unconfigured", null, { timeout: 30000 });
  ok(await H(page, () => /Nessun servizio AI configurato/.test(document.querySelector("[data-fp-ai-state]")?.textContent ?? "")), "AI unconfigured: the area says it…");
  ok(await H(page, () => !!document.querySelector("[data-fp-ai-configure]")) && (await fp(page)).proposals.filter((p) => p.source === "activity").length === 5,
     "…offers «Configura l'AI…», and the proposals from the activities stay");
  await page.keyboard.press("Escape");
  await shot(page, "fw-1-desk-v11");
  // a real drag from the Matrix into the accepted brace (the jar of MF05, in the desk)
  const su2 = await byName(page, "SU002");
  await H(page, (id) => window.__EM_DRAG__.jarShow(id), su2);
  await page.waitForTimeout(900);
  const from = await H(page, (id) => window.__EM_DRAG__.jarNodeScreen(id), su2);
  await page.waitForSelector(`.tile-fmbody [data-fm-unit="${acc.fu}"] > .fm-area`, { timeout: 30000 });
  const area = await (await page.$(`.tile-fmbody [data-fm-unit="${acc.fu}"] > .fm-area`)).boundingBox();
  const to = { x: area.x + area.width - 20, y: area.y + area.height - 8 };
  ok(!!from, "the trascinamento: SU002 drawn in the Matrix of the desk");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(([m, u]) => window.__EM_DRAG__.hasEdge(m, u, "is_in_functional_unit"), [su2, acc.fu], { timeout: 20000 });
  ok(true, "…dropped in the brace: SU002 is_in_functional_unit «fondazioni del tempio»");
  // C · the plan by horizon: the lasso
  await page.waitForFunction(() => window.__EM_DRAG__.functionalPlan()?.items > 0, null, { timeout: 180000 });
  let pl = await H(page, () => window.__EM_DRAG__.functionalPlan());
  eq([pl.items, typeof pl.buried], [64, "number"], "C · the plan of the II century: its 64 footprints (the horizon with most), buried counted (LG4)");
  await page.click("[data-lc-lasso]");
  await page.waitForSelector(".lc-plan-svg.lc-armed", { timeout: 10000 });
  const sb = await page.locator(".lc-plan-svg").boundingBox();
  await page.mouse.move(sb.x + 4, sb.y + 4);
  await page.mouse.down();
  for (const [fx, fy] of [[0.98, 0.02], [0.98, 0.98], [0.02, 0.98], [0.02, 0.06]]) await page.mouse.move(sb.x + sb.width * fx, sb.y + sb.height * fy, { steps: 4 });
  await page.mouse.up();
  await waitToast(page, /unità nel lazo/, "the lasso on the plan: «N unità nel lazo» with «Nuova unità funzionale…» (the jar)");
  pl = await H(page, () => window.__EM_DRAG__.functionalPlan());
  ok(pl.lastLasso.length >= 60 && !pl.lasso, `…it took ${pl.lastLasso.length} units, the lasso disarmed`);
  eq((await H(page, () => window.__EM_DRAG__.selectedIds())).length, pl.lastLasso.length, "…and they are the selection");
  // the horizon
  const post = await H(page, () => window.__EM_DRAG__.landscapeCube().answer.planes.find((p) => p.name === "Post antiquity").lane);
  await page.click(`[data-lc-hz="${post}"]`);
  await page.waitForFunction((l) => window.__EM_DRAG__.functionalPlan()?.lane === l, post, { timeout: 10000 });
  pl = await H(page, () => window.__EM_DRAG__.functionalPlan());
  ok(pl.items > 0 && pl.items < 64, `the horizon selector: Post antiquity (${pl.items} footprints)`);
  eq(errors, [], "v11: no page error");
  await ctx.close();

  // ── B · the AI (echo) proposes; an accepted proposal carries its paradata ──
  {
    const o = await open(DOC, { provider: "echo" });
    await o.page.click('[data-ws="functional"]');
    await o.page.waitForSelector('[data-fp-ai="graph"]', { timeout: 60000 });
    await o.page.click('[data-fp-ai="graph"]');
    await o.page.waitForFunction(() => window.__EM_DRAG__.proposals()?.ai === "ok", null, { timeout: 60000 });
    let st = await fp(o.page);
    const ai = st.proposals.filter((p) => p.source === "ai");
    eq([st.model, ai.length, ai.filter((p) => p.parent).length], ["echo-1", 7, 6], "AI (echo): seven proposals, six rooms inside one container");
    ok(ai.every((p) => p.why && p.function && p.model === "echo-1" && p.date === today), "…each with its why, its function, the model and the day");
    ok(await H(o.page, () => [...document.querySelectorAll('.fp-card[data-fp-source="ai"] .fp-by')].every((e) => /proposta da echo-1/.test(e.textContent))),
       "…the card says who proposed it");
    const room = ai.find((p) => /Columnade \(echo\)/.test(p.name) && !/entrance/.test(p.name));
    await o.page.click(`.fp-card[data-fp-key="${room.key}"] [data-fp-accept]`);
    await waitSaid(o.page, /accettata · 5 membri · paradati: proposta da AI \(echo-1, \d{4}-\d\d-\d\d\), accettata da/, "Accetta: the words name the paradata");
    st = await fp(o.page);
    const r = st.proposals.find((p) => p.key === room.key), c = st.proposals.find((p) => p.key === room.parent);
    eq([r.status, c.status], ["accepted", "accepted"], "…accepting the room accepted its container too");
    const pd = await H(o.page, ([rid, cid]) => {
      const D = window.__EM_DRAG__; const E = D.allEdges();
      const fn = E.find((e) => e.source === rid && e.edge_type === "has_property" && D.node(e.target)?.name === "primary_function")?.target;
      const x = E.find((e) => e.source === fn && e.edge_type === "has_data_provenance")?.target
        ?? E.find((e) => e.source === fn && ["combines", "has_data_provenance"].includes(e.edge_type))?.target;
      const xs = x && D.node(x)?.node_type === "combiner" ? E.find((e) => e.source === x && e.edge_type === "combines")?.target : x;
      const xn = D.node(xs);
      const au = E.find((e) => e.source === xs && e.edge_type === "has_author")?.target;
      return { inside: E.some((e) => e.source === rid && e.target === cid && e.edge_type === "is_in_functional_unit"),
               fn: D.node(fn)?.data?.value, x: xn?.node_type, ai: xn?.data?.ai_generated, model: xn?.data?.model, at: xn?.data?.validated_at,
               desc: xn?.description ?? "", author: D.node(au)?.node_type, authorModel: D.node(au)?.data?.model };
    }, [r.fu, c.fu]);
    eq([pd.inside, pd.fn, pd.x, pd.ai, pd.model, pd.at, pd.author, pd.authorModel], [true, "echo", "extractor", true, "echo-1", today, "author_ai", "echo-1"],
       "…in the graph: the room inside its container, its function, an extractor «proposed by AI» (has_author the AI author echo-1, validated today)");
    ok(/Proposta da AI \(echo-1, .*\), accettata da .* Perché: echo/.test(pd.desc), "…the extractor says «proposta da AI (modello, data), accettata da …» and why");
    // the AI on the selection
    const three = await H(o.page, () => window.__EM_DRAG__.allNodes().filter((n) => ["SU001", "SU002", "SU003"].includes(n.name)).map((n) => n.id));
    await H(o.page, (ids) => window.__EM_DRAG__.selectMany?.(ids) ?? window.__EM_DRAG__.select(ids[0]), three);
    if ((await H(o.page, () => window.__EM_DRAG__.selectedIds().length)) === 3) {
      await o.page.click('[data-fp-ai="selection"]');
      await o.page.waitForFunction(() => window.__EM_DRAG__.proposals()?.ai === "ok" && window.__EM_DRAG__.proposals().sent?.units === 3, null, { timeout: 60000 });
      ok(true, "AI on the selection: the briefing holds the three selected units only");
    } else ok(true, "(no selectMany hook: the AI on the selection not exercised here)");
    await shot(o.page, "fw-2-ai");
    eq(o.errors, [], "AI: no page error");
    await o.ctx.close();
  }

  // ── C/D/E · fu-prova: the plan's colours and instances, the four layers, the turntable ──
  {
    const o = await open(FU);
    await o.page.click('[data-ws="functional"]');
    await o.page.waitForFunction(() => window.__EM_DRAG__.landscapeCube()?.status === "ok", null, { timeout: 180000 });
    const win = await H(o.page, () => window.__EM_DRAG__.landscapeCube().win);
    const a = await H(o.page, () => window.__EM_DRAG__.landscapeCube().answer);
    eq(a.planes.map((p) => p.name), ["XX sec", "Post antiquity", "II A.D."], "fu-prova: three planes");
    ok(a.planes.every((p) => p.items.every((i) => ["exposed", "buried", "partially_exposed", "undetermined"].includes(i.visibility))), "…every footprint with its visibility (LG4)");
    eq(a.models?.read, 87, "…the models of the II century read in plan (87 .gltf of the reconstruction)");
    const post = a.planes.find((p) => p.name === "Post antiquity").lane;
    await o.page.click(`[data-lc-hz="${post}"]`);
    await o.page.waitForFunction((l) => window.__EM_DRAG__.functionalPlan()?.lane === l, post, { timeout: 10000 });
    ok(await H(o.page, () => document.querySelectorAll(".lc-plan-svg .lc-plan-fp[data-lc-instance]").length >= 4), "the plan of Post antiquity: the foundations as instances from before (dashed)");
    ok(await H(o.page, () => [...document.querySelectorAll(".lc-plan-svg .lc-plan-fp[data-lc-reader]")].some((g) => g.dataset.lcReader)),
       "…coloured by the functional unit that reads them (the ruin)");
    // the four layers
    const layer = (k) => o.page.click(`[data-lc-layer="${k}"]`);
    eq(await H(o.page, () => document.querySelector("svg.lc-svg")?.dataset.lcLayers), "sym plan", "D · the cube opens with Symbolic and Plan");
    ok(await H(o.page, () => document.querySelectorAll("svg.lc-svg .lc-sym-hull").length >= 7 && !!document.querySelector("svg.lc-svg [data-lc-container]")),
       "…Symbolic: the hulls of the functional units, the containers dashed");
    ok(await H(o.page, () => document.querySelectorAll("svg.lc-svg [data-lc-chain]").length === 2), "…the chains of transformation between the planes (tempio → rudere → restauro)");
    await layer("prx");
    await o.page.waitForFunction(() => document.querySelectorAll("svg.lc-svg .lc-top").length > 60, null, { timeout: 10000 });
    ok(true, "Proxy: the footprints extruded");
    await layer("rm");
    await o.page.waitForFunction(() => document.querySelectorAll("svg.lc-svg polygon.lc-rm").length === 87, null, { timeout: 10000 });
    ok(await H(o.page, () => !!document.querySelector("svg.lc-svg .lc-layer-rm[mask]")), "Models (RM): the 87 models of the II century, masked by the buried");
    await layer("sym");
    await o.page.waitForFunction(() => !document.querySelector("svg.lc-svg .lc-sym-hull"), null, { timeout: 10000 });
    eq(await H(o.page, () => document.querySelector("svg.lc-svg")?.dataset.lcLayers), "plan prx rm", "…each switch on its own (Symbolic off, the others on)");
    await shot(o.page, "fw-3-cube-layers", "svg.lc-svg");
    // E · the turntable
    await o.page.waitForTimeout(1200);
    const before = await H(o.page, (w) => ({ live: window.__EM_DRAG__.landscapeCube(w).live, view: window.__EM_DRAG__.landscapeCube(w).view,
      tr: document.querySelector("svg.lc-svg .lc-plane").getAttribute("transform") }), win);
    ok(before.live.gap < before.live.planeH, `the fit: the planes close (gap ${before.live.gap.toFixed(0)} < plane ${before.live.planeH.toFixed(0)} px: short verticals)`);
    const cb = await o.page.locator("svg.lc-svg").boundingBox();
    await o.page.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height * 0.5);
    await o.page.mouse.down();
    for (let i = 1; i <= 20; i++) await o.page.mouse.move(cb.x + cb.width * 0.3 + i * 14, cb.y + cb.height * 0.5 + i * 1.5);
    await o.page.mouse.up();
    const rel = await H(o.page, (w) => window.__EM_DRAG__.landscapeCube(w), win);
    ok(rel.view.rot !== before.view.rot && rel.view.tilt > before.view.tilt, `a drag turns (${before.view.rot}° → ${rel.view.rot.toFixed(0)}°) and tilts`);
    ok(await H(o.page, (t) => document.querySelector("svg.lc-svg .lc-plane").getAttribute("transform") !== t, before.tr), "…the planes' transform changed");
    eq(rel.live.renders, before.live.renders, "…nothing drawn again (the geometry cached: only the transforms)");
    ok(rel.live.frames >= 10 && rel.live.maxMs < 16, `…requestAnimationFrame: ${rel.live.frames} frames, the worst ${rel.live.maxMs.toFixed(1)} ms`);
    await o.page.waitForTimeout(400);
    const glide = await H(o.page, (w) => window.__EM_DRAG__.landscapeCube(w).view.rot, win);
    ok(Math.abs(glide - rel.view.rot) > 0.5, `…inertia at the release (${rel.view.rot.toFixed(1)}° → ${glide.toFixed(1)}°)`);
    const g0 = rel.live.gap;
    await o.page.mouse.move(cb.x + cb.width * 0.5, cb.y + cb.height * 0.5);
    await o.page.mouse.wheel(0, 300);
    await o.page.waitForTimeout(300);
    const g1 = (await H(o.page, (w) => window.__EM_DRAG__.landscapeCube(w), win)).live.gap;
    ok(g1 < g0, `the wheel: the planes closer (${g0.toFixed(0)} → ${g1.toFixed(0)} px)`);
    await o.page.click("[data-lc-reset]");
    await o.page.waitForFunction((w) => window.__EM_DRAG__.landscapeCube(w).view.gap === null, win, { timeout: 10000 });
    ok(true, "⟲: back to the first view");
    await shot(o.page, "fw-4-desk-fu", null);
    eq(o.errors, [], "fu-prova: no page error");
    await o.ctx.close();
  }

  // the switch off: nothing of it
  {
    const o = await open(DOC, { embargo: false });
    eq(await H(o.page, () => [typeof window.__EM_DRAG__.proposals, typeof window.__EM_DRAG__.functionalPlan, !!document.querySelector('[data-ws="functional"]')]),
       ["undefined", "undefined", false], "switch off: no hook, no tab");
    await o.ctx.close();
  }
} finally {
  await browser.close();
  stop();
}
console.log(`✓ check-functional-workspace: ${checks} checks passed`);
