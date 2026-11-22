// MICRO-MF09 (E.D., 22 Nov 2026, 21:00) · A UNIT IN EVERY HORIZON ITS LIFE
// TOUCHES — under embargo (the Functional Matrix, the overlay, the Landscape
// Matrix, the Cube: the lab build only).
//
//   node scripts/check-all-horizons.mjs
//   (page part: own Vite + own bridge, as check-functional-matrix.mjs;
//    PLAYWRIGHT_CORE / CHR; skipped, and said, without them. The real case
//    needs ../_datasets (Sarmizegetusa + Templu Mare fu-prova); skipped, and
//    said, without them. SHOTS=<dir> keeps pictures)
//
//   1 · the RULES: ONE rule in s3Dgraphy (functional_units.span_horizons),
//       used by the Functional Matrix, the overlay plan, the Landscape
//       Matrix, the Cube, the proposals, the presence; no «the lane the
//       members fill most»; the widest overlap only in lcMatchLane (it picks a
//       PLANE) and said so; the texts (EN + IT) only in the LAB_TEXTS blocks;
//   2 · the PURE parts (node): the Functional Matrix draws a unit on THREE
//       lanes — the master in its home lane, two instances (dashed braces,
//       only the members alive there); an older answer (no `present`) once;
//       the Landscape Matrix the same, no dotted life line; the overlay's
//       instance braces and the same membership instanced in two lanes with
//       two ids; the desk's proposal on all its lanes;
//   3 · s3Dgraphy on the REAL data (python of the tree): fu-prova read by
//       H0–H7 — the temple (170–199) in H2 AND H3, the ruin (200–1800) in
//       H3, H4, H5–H6; the border touched is not entered; Sarmizegetusa's
//       Landscape Matrix: the rows drawn per horizon, the 2nd century and the
//       post-antiquity rows on all their horizons;
//   4 · the PAGE (lab dev server, embargo on): a synthetic graph (the villa →
//       castle of MF01 + a ruin whose declared life runs from the Roman epoch
//       to the Medieval one): the ruin drawn THREE times in the Functional
//       Matrix (Romana the master, Tardoantica and Medievale dashed
//       instances); the villa (0–400) not in Tardoantica (400–600: touching
//       is not entering); a click on an instance selects the unit.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const FE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(FE, "..");
const SRC = path.join(FE, "src");
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const DS = process.env.DATASETS ?? path.resolve(ROOT, "../_datasets");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── 1 · the rules ────────────────────────────────────────────────────────────
{
  const s3 = (p) => fs.readFileSync(path.join(S3D, "src/s3dgraphy", p), "utf8");
  const fu = s3("functional_units.py");
  ok(/def span_horizons\(/.test(fu) && /def horizons_of_life\(/.test(fu), "s3Dgraphy: ONE rule, functional_units.span_horizons / horizons_of_life");
  for (const f of ["functional_matrix.py", "functional_cube.py", "functional_zoom.py", "functional_proposals.py", "landscape.py"])
    ok(/span_horizons|horizons_of_life/.test(s3(f)), `…${f} uses it`);
  ok(/span_horizons\(fu_life, \[h\]\)/.test(fu) && /span_horizons\(lf, \[ep_iv\]\)/.test(fu), "…the presence and the coverage too");
  ok(!/max\(set\(homes\), key=homes\.count\)/.test(s3("functional_proposals.py")), "no proposal stands in «the lane its members fill most»");
  const lc = read("frontend/src/landscape-cube.ts");
  ok(/MICRO-MF09 · the ONE place where the widest overlap stays: it chooses the\s+\*\s+PLANE/.test(lc), "the widest overlap only in lcMatchLane, which picks a plane (said in its comment)");
  const i18n = read("frontend/src/i18n.ts");
  const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]);
  const openI18n = i18n.replace(/\.\.\.\(LAB_TEXTS \? \{[\s\S]*?\n  \} : \{\}\),/g, "");
  const keys = ["fm.appearance", "fm.share", "fm.legend.appearance"];
  eq(labBlocks.length, 2, "two LAB_TEXTS blocks (EN, IT)");
  eq(keys.filter((k) => !labBlocks.every((b) => b.includes(`"${k}":`))), [], "the texts of MF09 in both LAB_TEXTS blocks (EN + IT)");
  eq(keys.filter((k) => openI18n.includes(`"${k}"`)), [], "…and in no open dictionary");
}

// ── 2 · the pure parts ───────────────────────────────────────────────────────
const paletteStub = { name: "palette-stub", setup(b) {
  b.onResolve({ filter: /\/palette$/ }, () => ({ path: "palette-stub", namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents:
    "export const nodeStyle = (t) => ({ border: t === 'US' ? '#9B3333' : '#8B5A2B', fill: '#fff', shape: 'rectangle', textColor: '#000' });",
    loader: "js" }));
} };
async function load(file) {
  const b = await esbuild.build({ entryPoints: [path.join(SRC, file)], bundle: true, format: "esm", write: false, logLevel: "silent",
    plugins: [paletteStub], banner: { js: "const __noGlob = () => ({});" },
    define: { __EM_LAB__: "true", "import.meta.glob": "__noGlob" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
}
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const t = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);
const FM = await load("functional-matrix.ts");
const LM = await load("landscape-matrix.ts");
const FO = await load("functional-overlay.ts");
const FP = await load("functional-proposals.ts");
const LANES3 = [{ id: "L3", name: "Medievale", start: 1100, end: 1400 }, { id: "L2", name: "Tarda", start: 400, end: 600 },
                { id: "L1", name: "Romana", start: 0, end: 400 }];
const member = (id, lane, lanes) => ({ id, name: id, type: "US", lane, lanes, from_lane: null, from_name: null, life: [0, null], alive: true, evidence: "stratigraphic" });
const unit = (id, extra) => ({ id, name: id.toLowerCase(), scale: "building", life: [0, 1400], lane: "L1", lanes: ["L3", "L2", "L1"],
  present: [{ id: "L3", share: 1 }, { id: "L2", share: 1 }, { id: "L1", share: 1 }], parents: [], children: [], members: [],
  count: 0, count_all: 0, evidence: "stratigraphic", evidence_own: "stratigraphic", collapsed: false, ...extra });
const fmAnswer = (units) => ({ lanes: LANES3, units, roots: units.filter((u) => !u.parents.length).map((u) => u.id), readers: {}, chain: [],
  coherence: { members_not_alive: [], children_outside: [], undated: [], coverage: {} }, how: {} });
const tagsOf = (svg, attr, id) => [...svg.matchAll(new RegExp(`<g [^>]*${attr}="${id}"[^>]*>`, "g"))].map((m) => m[0]);
const attrOf = (tag, a) => (new RegExp(`${a}="([^"]*)"`).exec(tag) ?? [])[1] ?? null;
{
  const ruin = unit("RUIN", { members: [member("W", "L1", ["L3", "L2", "L1"]), member("OLD", "L1", ["L1"])], count: 2, count_all: 2 });
  const svg = FM.fmSvg(fmAnswer([ruin]), 800, null, t);
  const g = tagsOf(svg, "data-fm-unit", "RUIN");
  eq(g.map((x) => attrOf(x, "data-fm-in")), ["L3", "L2", "L1"], "FM · a unit on THREE lanes is drawn in all three (newest lane first, as the Matrix)");
  eq(g.map((x) => attrOf(x, "data-fm-appearance")), ["L1", "L1", null], "…the master in its home lane, the others instances of it");
  const pieces = svg.split('data-fm-unit="RUIN"');
  const dashOf = (chunk) => (/stroke-dasharray="([^"]+)"/.exec(chunk.split("<text")[0]) ?? [])[1] ?? null;
  eq([dashOf(pieces[1]), dashOf(pieces[2]), dashOf(pieces[3])], ["3.5 2", "3.5 2", null], "…the instances' braces dashed, the master's whole");
  eq([...svg.matchAll(/data-fm-inst="RUIN:([^"]+)"/g)].map((m) => m[1]), ["W", "W", "W", "OLD"],
     "…an instance holds only the members alive in its lane (the old one only in the master)");
  eq(g.map((x) => attrOf(x, "data-fm-share")), ["1", "1", "1"], "…each with the share of the overlap");
  const old = { ...ruin }; delete old.present;
  eq(tagsOf(FM.fmSvg(fmAnswer([old]), 800, null, t), "data-fm-unit", "RUIN").length, 1, "…an older answer (no `present`): once, as before");
  eq(FM.fmLanesOf(ruin), ["L1", "L3", "L2"], "fmLanesOf: the home lane first, then the others");
  // a child inside an instance only when it is present there
  const room = unit("ROOM", { parents: ["RUIN"], lanes: ["L1"], present: [{ id: "L1", share: 1 }] });
  const svg2 = FM.fmSvg(fmAnswer([{ ...ruin, children: ["ROOM"] }, room]), 800, null, t);
  eq(tagsOf(svg2, "data-fm-unit", "ROOM").length, 1, "…a room alive only in the home lane is not in the instances");
}
{
  const row = (id, lane, lanes, extra = {}) => ({ id, kind: "identity", name: id, site: "S", lanes, lane, lane_rule: "dated", uncertain: false,
    scale: "building", evidence: "symbol", members: 0, members_rule: null, members_from: [], rooms: [], alternative: null, life: [null, null],
    declared_horizon: null, present: lanes.map((l) => ({ id: l, share: 0.5 })), ...extra });
  const a = { lanes: LANES3.map((l) => ({ ...l, codes: [] })), columns: [{ id: "S", name: "S", code: "S01", rows: ["R", "T"] }],
    rows: [row("R", "L1", ["L3", "L2", "L1"]), row("T", "L2", ["L2"])], chain: [], after: [], bindings: [], focus: null, periodization: null, sites: [], neighbours: {} };
  const svg = LM.lmSvg(a, { t });
  const g = tagsOf(svg, "data-lm-row", "R");
  eq(g.map((x) => [attrOf(x, "data-lm-in"), attrOf(x, "data-lm-appearance")]), [["L1", null], ["L3", "L1"], ["L2", "L1"]],
     "LM · a row on three horizons: the master in its home lane, two instances");
  eq(tagsOf(svg, "data-lm-row", "T").length, 1, "…a row on one horizon once");
  eq((svg.match(/class="lm-span"/g) ?? []).length, 0, "…no dotted life line: the instances say it");
  const legacy = { ...a, rows: a.rows.map((r) => { const c = { ...r }; delete c.present; return c; }) };
  const svgOld = LM.lmSvg(legacy, { t });
  ok(tagsOf(svgOld, "data-lm-row", "R").length === 1 && /class="lm-span"/.test(svgOld), "…an older answer: once, with its dotted line, as before");
}
{
  // the overlay: a unit on two lanes, its member instanced in both
  const lane = (id, y) => ({ id, name: id, y, height: 200, x: 0, width: 2000 });
  const node = (id, y) => ({ id, x: 100, y, w: 90, h: 32, node: { id, node_type: "US", name: id } });
  const base = { nodes: [node("W", 520), node("X", 120)], byId: new Map(), edges: [], lanes: [lane("L3", 0), lane("L2", 200), lane("L1", 400)],
    groups: [], groupsById: new Map(), memberOf: new Map(), outlineOf: new Map() };
  const ans = fmAnswer([unit("RUIN", { members: [member("W", "L1", ["L3", "L2", "L1"])] })]);
  ans.overlay = {
    lanes: [{ lane: "L3", slots: [{ kind: "own", unit: "RUIN" }], braces: [{ unit: "RUIN", slots: [0], depth: 0, instance: true }] },
            { lane: "L2", slots: [{ kind: "own", unit: "RUIN" }], braces: [{ unit: "RUIN", slots: [0], depth: 0, instance: true }] },
            { lane: "L1", slots: [{ kind: "own", unit: "RUIN" }], braces: [{ unit: "RUIN", slots: [0], depth: 0, instance: false }] }],
    place: { W: { lane: "L1", slot: 0, fu: "RUIN" } },
    instances: [{ unit: "W", fu: "RUIN", lane: "L3", slot: 0, reason: "other_lane", from_lane: "L1" },
                { unit: "W", fu: "RUIN", lane: "L2", slot: 0, reason: "other_lane", from_lane: "L1" }],
    stats: {} };
  const opt = { keep: () => true, continuity: () => false, keepEdge: () => true, laneName: (x) => x, colour: () => "#000", scaleText: () => "" };
  const sc = FO.overlayScene(base, ans, opt);
  eq(sc.functional.braces.map((b) => [b.lane, b.instance]).sort(), [["L1", false], ["L2", true], ["L3", true]],
     "overlay · the unit's braces in its three lanes, the two later ones instances");
  const ids = sc.nodes.filter((n) => n.instanceOf === "W").map((n) => n.id);
  eq([ids.length, new Set(ids).size], [2, 2], "…the same membership instanced in two lanes: two nodes, two ids");
}
{
  eq(FP.proposalLanes({ lane: "H2", lanes: ["H3", "H2"] }), ["H2", "H3"], "desk · a proposal on every lane its epoch touches, the oldest first");
  eq(FP.proposalLanes({ lane: "H2" }), ["H2"], "…an older answer: its one lane");
}

// ── 3 · s3Dgraphy on the real data ───────────────────────────────────────────
const py = path.join(S3D, ".venv/bin/python");
const LAND = path.join(DS, "Sarmizegetusa/06_EM/LandscapeMatrix/sarmizegetusa-landscape.em.json");
const FUP = path.join(DS, "templumare-v11/TempluMare_v11_fu-prova.em.json");
let real = "skipped (no datasets or no venv)";
if (fs.existsSync(py) && fs.existsSync(LAND) && fs.existsSync(FUP)) {
  const code = `
import json, sys
from s3dgraphy import api, functional_matrix as M, functional_zoom as Z
from s3dgraphy.container import load_container_file
g, _ = api.load_emjson(json.loads(open(sys.argv[1], encoding="utf-8").read()))
c, _ = load_container_file(sys.argv[2])
H = [{k: l[k] for k in ("id", "name", "start", "end")} for l in Z.landscape_lanes(c)]
fm = M.functional_matrix(g, lanes=H)
lv = Z.landscape_view(c.graphs["LANDSCAPE"], header=c.header, container=c, sources=[("open", g)], base_dir=sys.argv[3])
print(json.dumps({"fm": fm, "lm": lv}, default=str))`;
  const r = spawnSync(py, ["-c", code, FUP, LAND, path.dirname(LAND)], { env: { ...process.env, PYTHONPATH: path.join(S3D, "src") },
    maxBuffer: 1 << 28, encoding: "utf8" });
  ok(r.status === 0, `s3Dgraphy answers on the real data (${(r.stderr ?? "").split("\n").slice(-3).join(" | ")})`);
  const { fm, lm } = JSON.parse(r.stdout);
  const byName = Object.fromEntries(fm.units.map((u) => [u.name, u]));
  const hn = Object.fromEntries(fm.lanes.map((l) => [l.id, l.name.split(" ")[0]]));
  eq(byName.tempio.lanes.map((l) => hn[l]), ["H3", "H2"], "fu-prova · the temple (170–199) in H2 AND H3, not only where it overlaps most");
  eq(byName.rudere.lanes.map((l) => hn[l]), ["H5–H6", "H4", "H3"], "…the ruin (200–1800, post-antiquity) on three horizons");
  ok(!byName.rudere.lanes.some((l) => hn[l] === "H2"), "…and not in H2 (117–179): touching nothing is not entering");
  const svg = FM.fmSvg(fm, 900, null, t);
  const temple = fm.units.find((u) => u.name === "tempio").id;
  eq(tagsOf(svg, "data-fm-unit", temple).map((x) => [hn[attrOf(x, "data-fm-in")], attrOf(x, "data-fm-appearance") ? "instance" : "master"]),
     [["H3", "instance"], ["H2", "master"]], "…drawn: the temple's master in H2, its instance in H3");
  const perLane = {};
  for (const m of svg.matchAll(/<g class="fm-unit[^"]*" data-fm-unit="[^"]*"[^>]*data-fm-in="([^"]*)"/g)) perLane[hn[m[1]]] = (perLane[hn[m[1]]] ?? 0) + 1;
  const lmSvg = LM.lmSvg(lm, { t, colW: 150 });
  const ln = Object.fromEntries(lm.lanes.map((l) => [l.id, l.name.split(" ")[0]]));
  const lmLane = {};
  for (const m of lmSvg.matchAll(/data-lm-row="[^"]*"[^>]*data-lm-in="([^"]*)"/g)) lmLane[ln[m[1]] ?? "—"] = (lmLane[ln[m[1]] ?? "—"] ?? 0) + 1;
  const colonia = lm.rows.find((x) => /^colonia deducta/.test(x.name));
  eq(tagsOf(lmSvg, "data-lm-row", colonia.id).map((x) => ln[attrOf(x, "data-lm-in")]), ["H1", "H3", "H2"],
     "Sarmizegetusa · the colony (106–271) in H1 (master), H2 and H3 (instances)");
  const road = lm.rows.find((x) => /^strada imperiale/.test(x.name));
  eq(tagsOf(lmSvg, "data-lm-row", road.id).length, 6, "…the imperial road (H1–H7 declared) on its six horizons");
  real = `drawn per horizon — Functional Matrix of fu-prova ${JSON.stringify(perLane)}; Landscape Matrix of Sarmizegetusa ${JSON.stringify(lmLane)}`;
}

// ── 4 · the page ─────────────────────────────────────────────────────────────
let pw = null;
for (const tr of [process.env.PLAYWRIGHT_CORE, "playwright-core",
  path.join(ROOT, ".claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js")]) {
  if (!tr) continue;
  try { const m = await import(tr); pw = m.chromium ? m : m.default; break; } catch { /* next */ }
}
if (!fs.existsSync(py) || !pw) {
  console.log(`check-all-horizons: ${checks} checks passed (${!pw ? "no playwright-core" : "no s3Dgraphy venv"}: the page skipped) · ${real}`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "all-horizons-")));
// the synthetic graph: MF01's villa → castle + a RUIN from the Roman epoch to the Medieval one
const DOC = path.join(dir, "all-horizons.em.json");
{
  const d = JSON.parse(fs.readFileSync(path.join(FE, "testdata/functional-matrix.em.json"), "utf8"));
  const g = d.graphs[d.active_graph_id];
  g.nodes.push({ id: "RUIN", node_type: "FunctionalUnitNodeGroup", name: "rovina", data: { scale: "building" } });
  g.edges.push({ id: "RUIN_fe_EP_ROM", edge_type: "has_first_epoch", source: "RUIN", target: "EP_ROM" },
               { id: "RUIN_se_EP_TARD", edge_type: "survive_in_epoch", source: "RUIN", target: "EP_TARD" },
               { id: "RUIN_se_EP_MED", edge_type: "survive_in_epoch", source: "RUIN", target: "EP_MED" },
               { id: "USM1_in_RUIN", edge_type: "is_in_functional_unit", source: "USM1", target: "RUIN" });
  fs.writeFileSync(DOC, JSON.stringify(d));
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
const browser = await pw.chromium.launch({ executablePath: fs.existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const H = (page, fn, arg) => page.evaluate(fn, arg);
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(() => {
    window.__EM_EMBARGO__ = true;
    if (!sessionStorage.getItem("mf09")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "it"); sessionStorage.setItem("mf09", "1"); }
  });
  await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(B)}`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 120000 });
  const doc = JSON.parse(fs.readFileSync(DOC, "utf8"));
  await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, DOC]);
  await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 5, null, { timeout: 120000 });
  const made = await H(page, () => { const D = window.__EM_DRAG__; const id = D.splitDoc(D.activeWinId()); return id && D.retype(id, "functional-matrix") ? id : null; });
  ok(!!made, "page · an area turned into «Matrix funzionale»");
  await page.waitForSelector('.tile-fmbody [data-fm-unit="RUIN"]', { timeout: 60000 });
  const ruin = await H(page, () => [...document.querySelectorAll('.tile-fmbody [data-fm-unit="RUIN"]')].map((e) => ({
    in: e.getAttribute("data-fm-in"), app: e.getAttribute("data-fm-appearance"),
    dash: e.querySelector(":scope > path")?.getAttribute("stroke-dasharray") ?? null,
    members: [...e.querySelectorAll(":scope > [data-fm-member]")].map((m) => m.getAttribute("data-fm-member")) })));
  eq(ruin.map((r) => [r.in, r.app]), [["EP_MED", "EP_ROM"], ["EP_TARD", "EP_ROM"], ["EP_ROM", null]],
     "page · the ruin (Romana → Medievale) drawn THREE times: master in Romana, instances in Tardoantica and Medievale");
  eq(ruin.map((r) => r.dash), ["3.5 2", "3.5 2", null], "…the instances' braces dashed, the master's whole");
  ok(ruin.every((r) => r.members.includes("USM1")), "…the Roman wall, still standing, inside each of them");
  eq(await H(page, () => [...document.querySelectorAll('.tile-fmbody [data-fm-unit="VILLA"]')].map((e) => e.getAttribute("data-fm-in"))), ["EP_ROM"],
     "…the villa (0–400) only in Romana: touching Tardoantica (400–600) at its border is not entering it");
  ok(await H(page, () => !!document.querySelector('.tile-fmbody [data-fm-legend="appearance"]')), "…the legend says what dashed braces are");
  await H(page, () => document.querySelector('.tile-fmbody [data-fm-unit="RUIN"][data-fm-in="EP_MED"] .fm-hit')
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForFunction(() => window.__EM_DRAG__.functionalMatrix()?.selected === "RUIN" || document.querySelector('.tile-fmbody [data-fm-unit="RUIN"][data-fm-selected="1"]'), null, { timeout: 15000 });
  eq(await H(page, () => document.querySelectorAll('.tile-fmbody [data-fm-unit="RUIN"][data-fm-selected="1"]').length), 3,
     "…a click on an instance selects the unit: its three appearances marked");
  if (SHOTS) await (await page.$(".tile-fmbody"))?.screenshot({ path: path.join(SHOTS, "mf09-fm-ruin.png") });
  eq(errors, [], "no page error");
  await ctx.close();
} finally {
  await browser.close();
  stop();
}
console.log(`✓ check-all-horizons: ${checks} checks passed · ${real}`);
process.exit(0);
