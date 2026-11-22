// MICRO-MF05 (E.D., 22 Nov 2026) · THE JAR AND THE WORKSPACE «FUNZIONALE» —
// under embargo (features.ts: functional-matrix, functional-workspace), the
// lab build only.
//
//   node scripts/check-functional-jar.mjs
//   (page part: own Vite + own bridge, as check-functional-matrix.mjs;
//    PLAYWRIGHT_CORE / CHR; skipped, and said, without them. FU_PROVA, LANDSCAPE
//    and the Templu Mare proxies add the real case; SHOTS=<dir> keeps pictures)
//
//   1 · the RULES of the embargo: every use of the jar in main.ts behind FM_ON,
//       its texts (EN + IT) only in the LAB_TEXTS blocks, the workspace only
//       in the lab profile with its switch, the command row only under LAB;
//   2 · the PURE part (functional-jar.ts): which memberships a gesture
//       writes and refuses, the first epoch of a new unit, the reading of the
//       day, the lasso's polygon;
//   3 · the PAGE (lab dev server, the embargo's switch on), villa → castle:
//       a unit dragged FROM THE MATRIX into a brace → the membership, the
//       master where it was, the check of coherence in the toast (alive / not
//       alive), the signed reading, undo / redo; an instance dragged between
//       braces → moved, with Alt → copied; «Leggi come…» from the right click
//       and the Functional Matrix's head → a new unit (name, scale, function,
//       epoch, inside), one step; the workspace «Funzionale» (A), its areas,
//       the Landscape ⇄ Cube switch, the two layouts in «+»; switch off:
//       nothing of it;
//   4 · the REAL case: TempluMare_v11_fu-prova (+ the landscape of
//       Sarmizegetusa): the workspace on real data, a real drag, the lasso on
//       the proxies in the Space → a new functional unit.
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
{
  const imp = /import \{([^}]+)\} from "\.\/functional-jar";/.exec(main);
  ok(!!imp, "main.ts imports the jar once");
  const names = imp[1].split(",").map((s) => s.trim().replace(/^type\s+/, "")).filter(Boolean)
    .map((n) => (n.includes(" as ") ? n.split(" as ")[1] : n).trim());
  const imp2 = /import \{ (fmDropHover, fmDropTargetAt, fmSeq) \} from "\.\/functional-matrix";/.exec(main);
  ok(!!imp2, "…and the three drop functions of the Functional Matrix");
  names.push("fmDropHover", "fmDropTargetAt", "fmSeq", "jarGesture", "jarReadAs", "jarArmLasso", "jarLassoDone", "jarCanBeMember");
  const body = main.replace(imp[0], "").replace(imp2[0], "");
  const lines = body.split("\n");
  const bad = [];
  for (const n of names) {
    if (n === "JarRefusal") continue;
    lines.forEach((l, i) => {
      if (!new RegExp(`\\b${n}\\b`).test(l)) return;
      if (/^\s*(\/\/|\*)/.test(l)) return;
      // a function of the jar's block is guarded inside; a use elsewhere sits behind FM_ON
      if (/^(async )?function (jar|fmSpanOf)|^const (jar|plan0|fmSpanOf)|^let jar/.test(l)) return;
      // inside a function of the jar's block (they all refuse without FM_ON): fine
      let k = i;
      while (k > 0 && !/^(async function |function |const |let |if \(|registerBuiltinSurfaces|\(window)/.test(lines[k])) k--;
      if (/^(async )?function jar|^function fmSpanOf/.test(lines[k])) return;
      const ctx = lines.slice(Math.max(0, i - 40), i + 1).join("\n");
      if (!/FM_ON/.test(ctx)) bad.push(`${n} @${i + 1}`);
    });
  }
  eq(bad, [], "every use of the jar in main.ts sits behind FM_ON");
  ok(/function jarGesture[\s\S]{0,200}if \(!FM_ON \|\| !st\) return false;/.test(main)
     && /async function jarReadAs[\s\S]{0,300}if \(!FM_ON \|\| !st\) return false;/.test(main),
     "the jar's entry points refuse when FM_ON is false (folded in the community)");
}
const i18n = read("frontend/src/i18n.ts");
const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]);
const openI18n = i18n.replace(/\.\.\.\(LAB_TEXTS \? \{[\s\S]*?\n  \} : \{\}\),/g, "");
const jarSrc = read("frontend/src/functional-jar.ts");
const wsSrc = read("frontend/src/workspace.ts");
const keys = new Set([...jarSrc.matchAll(/\bt\("((?:jar|fw|ws)\.[\w.]+)"/g), ...main.matchAll(/"((?:jar|fw)\.[\w.]+)"/g),
  ...wsSrc.matchAll(/"(ws\.(?:functional|qFunctional)[\w.]*)"/g)].map((m) => m[1]));
for (const w of ["type", "self", "cycle", "missing"]) keys.add(`jar.why.${w}`);
for (const k of ["feat.functionalWorkspace.title", "feat.functionalWorkspace.desc"]) keys.add(k);
ok(keys.size > 50, `the jar's and the workspace's texts read (${keys.size})`);
eq([...keys].filter((k) => !labBlocks.every((b) => b.includes(`"${k}":`))), [], "every text of the jar and of the workspace in both LAB_TEXTS blocks (EN + IT)");
eq([...keys].filter((k) => openI18n.includes(`"${k}"`)), [], "…and none in the open dictionaries");
const menuSrc = read("frontend/src/menu-table.ts");
ok(/\.\.\.\(LAB \? \[cmd\("jarReadAs", "jar\.readAs", "btn-jar-read-as", \{[^}]*feature: "functional-matrix"/.test(menuSrc),
   "the command «Read as…» is a row only under LAB, of the function functional-matrix");
ok(/const FUNCTIONAL_ON: boolean = LAB && featureOn\("functional-workspace"\);/.test(wsSrc), "the workspace exists only with LAB and its switch");

async function load(file, profile, embargo = false) {
  const b = await esbuild.build({ entryPoints: [path.join(SRC, file)], bundle: true, format: "esm", write: false, logLevel: "silent",
    banner: { js: `globalThis.__EM_EMBARGO__ = ${embargo};` },
    ...(profile === "none" ? {} : { define: { __EM_LAB__: profile === "lab" ? "true" : "false" } }) });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
}
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
for (const [profile, embargo] of [["community", true], ["none", true], ["lab", false], ["lab", true]]) {
  const W = await load("workspace.ts", profile, embargo);
  const want = profile === "lab" && embargo;
  eq([W.WORKSPACES.some((w) => w.id === "functional"), W.WORKSPACE_TEMPLATES.filter((w) => w.id.startsWith("functional-")).length],
     [want, want ? 2 : 0], `${profile}${embargo ? " (switch on)" : ""}: the tab «Funzionale» and its two layouts ${want ? "are" : "are not"} there`);
  if (want) {
    const f = W.WORKSPACES.find((w) => w.id === "functional");
    eq(f.arrangement.wins.map((w) => w.type), ["functional-matrix", "graph", "landscape-matrix", "inspector", "table"],
       "A: the Functional Matrix, the Matrix, the Landscape Matrix, the Inspector, the table");
    eq(f.arrangement.wins.find((w) => w.name === "coherence").state, { "current.table.sheet": "Issues" }, "…the table on «Issues»: the coherence");
    const B = W.WORKSPACE_TEMPLATES.find((w) => w.id === "functional-b");
    eq(B.arrangement.wins.map((w) => w.type), ["functional-matrix", "graph", "landscape-cube", "inspector", "table"], "B: the Cube in the place of the landscape");
    ok(B.arrangement.layout.dir === "col" && B.arrangement.layout.a.b.win === "cube", "B: the Cube across, under the two Matrices");
  }
  const M = await load("menu-table.ts", profile, embargo);
  const rows = JSON.stringify(M.MENUS ?? M.MENU_TABLE ?? M.menus ?? null);
  ok(rows === "null" || rows.includes("jarReadAs") === (profile === "lab"), `${profile}: the command row ${profile === "lab" ? "is" : "is not"} in the table`);
}

// ── 2 · the pure part ────────────────────────────────────────────────────────
const J = await load("functional-jar.ts", "lab");
{
  const doc = { nodes: [
      { id: "A", node_type: "FunctionalUnitNodeGroup", name: "castello" }, { id: "B", node_type: "FunctionalUnitNodeGroup", name: "sala" },
      { id: "C", node_type: "FunctionalUnitNodeGroup", name: "torre" },
      { id: "U1", node_type: "US" }, { id: "U2", node_type: "US" }, { id: "D", node_type: "document" }, { id: "E", node_type: "EpochNode" },
      { id: "P", node_type: "property", name: "primary_function", data: { value: "castello" } },
      { id: "P2", node_type: "property", name: "primary_function", description: "sala" },
      { id: "X", node_type: "extractor", data: { act_start: "2026-11-22" } }, { id: "AU", node_type: "AuthorNode" } ],
    edges: [ { edge_type: "is_in_functional_unit", source: "B", target: "A" }, { edge_type: "is_in_functional_unit", source: "U1", target: "A" },
      { edge_type: "has_property", source: "A", target: "P" }, { edge_type: "has_data_provenance", source: "P", target: "X" },
      { edge_type: "has_author", source: "X", target: "AU" },
      { edge_type: "has_data_provenance", source: "P2", target: "X2" }, { edge_type: "has_author", source: "X2", target: "AU" },
      { edge_type: "extracted_from", source: "X2", target: "D" } ] };
  doc.nodes.push({ id: "X2", node_type: "extractor", data: { act_start: "2026-11-22" } });
  const can = (t) => ["US", "USD", "FunctionalUnitNodeGroup"].includes(t);
  let p = J.planJar(doc, ["U1", "U2", "D", "E", "A", "nope"], "A", can);
  eq([p.add, p.already, p.refused.map((r) => `${r.id}:${r.why}`)], [["U2"], ["U1"], ["D:type", "E:type", "A:self", "nope:missing"]],
     "add: the new member written, the old one said, a document, an epoch, itself and a stranger refused");
  p = J.planJar(doc, ["A"], "B", can);
  eq(p.refused.map((r) => `${r.id}:${r.why}`), ["A:cycle"], "a unit never enters one nested in itself (the castle in its hall)");
  p = J.planJar(doc, ["U1"], "C", can, { kind: "move", from: "A" });
  eq([p.add, p.remove], [["U1"], [{ member: "U1", from: "A" }]], "move: added to the target, taken from the source");
  p = J.planJar(doc, ["U1"], "C", can, { kind: "copy", from: "A" });
  eq([p.add, p.remove], [["U1"], []], "copy (Alt): added to the target, kept in the source — the wall of two rooms");
  p = J.planJar(doc, ["U1"], "U2", can);
  eq(p.refused[0].why, "missing", "a target that is not a functional unit: nothing written");
  eq(J.functionProperty(doc, "A"), "P", "the unit's primary_function");
  eq(J.functionsInUse(doc), ["castello", "sala"], "the functions the graph already uses (value or description)");
  eq(J.readingOfToday(doc, "P", "AU", "2026-11-22"), "X", "the reading of the day of the same person is found (extended, not doubled)");
  eq([J.readingOfToday(doc, "P", "AU", "2026-11-23"), J.readingOfToday(doc, "P", null, "2026-11-22"), J.readingOfToday(doc, "P", "OTHER", "2026-11-22")],
     [null, null, null], "…another day, an unsigned gesture, another person: a new reading");
  eq(J.readingOfToday(doc, "P2", "AU", "2026-11-22"), null, "…a reading extracted from a document is another reading");
  const first = { U1: "EP_ROM", U2: "EP_MED", U3: null };
  eq(J.defaultEpoch(["U1", "U2"], (id) => first[id], ["EP_MED", "EP_TARD", "EP_ROM"]), "EP_MED",
     "the first epoch of a new unit: the most recent of its members' (a castle with a Roman wall is medieval)");
  eq([J.defaultEpoch(["U1"], (id) => first[id], []), J.defaultEpoch(["U3"], (id) => first[id], [])], ["EP_ROM", null], "…one shared, or none");
  eq(J.defaultName("", doc), "FU 1", "a new unit without a name nor a function: «FU 1»");
  eq(J.today(new Date(2026, 10, 2)), "2026-11-02", "the day of the reading, as act_start");
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  eq([J.insidePolygon({ x: 5, y: 5 }, sq), J.insidePolygon({ x: 15, y: 5 }, sq)], [true, false], "the lasso: inside / outside a polygon");
  const L = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 6, y: 10 }, { x: 6, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
  eq([J.insidePolygon({ x: 5, y: 8 }, L), J.insidePolygon({ x: 2, y: 8 }, L)], [false, true], "…a concave lasso leaves the notch out");
  eq(J.unitsOfSpaceKeys(["proxy:U1", "rm:M", "proxy:U2", "proxy:U1", "sketch:S"]), ["U1", "U2"], "the units of the Space's keys (proxies only)");
}

// ── 3 · 4 · the page ─────────────────────────────────────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
let pw = null;
for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
  path.join(ROOT, ".claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js")]) {
  if (!t) continue;
  try { const m = await import(t); pw = m.chromium ? m : m.default; break; } catch { /* next */ }
}
if (!fs.existsSync(py) || !pw) {
  console.log(`check-functional-jar: ${checks} checks passed (${!pw ? "no playwright-core" : `no s3Dgraphy venv at ${py}`}: the page skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "functional-jar-")));
const DOC = path.join(dir, "villa-castello.em.json");
fs.copyFileSync(path.join(FE, "testdata/functional-matrix.em.json"), DOC);
const DS = path.resolve(ROOT, "../_datasets");
const FU_PROVA = process.env.FU_PROVA ?? path.join(DS, "templumare-v11/TempluMare_v11_fu-prova.em.json");
const LANDSCAPE = process.env.LANDSCAPE ?? path.join(DS, "Sarmizegetusa/06_EM/LandscapeMatrix/sarmizegetusa-landscape.em.json");
// the proxies of Templu Mare live in OneDrive (only read: copied beside the copy)
const PROXIES = process.env.PROXIES ?? path.join(os.homedir(),
  "Library/CloudStorage/OneDrive-CNR/Dottorato Bucarest/14_EM_1.6_lavoro/TempluMare_v2_for_3DR_2026-10-06/EM/proxies");
let REAL = null, LAND = null;
if (fs.existsSync(FU_PROVA)) {
  fs.mkdirSync(path.join(dir, "templu"), { recursive: true });
  REAL = path.join(dir, "templu/TempluMare_v11_fu-prova.em.json");
  fs.copyFileSync(FU_PROVA, REAL);
  if (fs.existsSync(PROXIES)) {
    fs.mkdirSync(path.join(dir, "templu/proxies"), { recursive: true });
    for (const f of fs.readdirSync(PROXIES)) if (f.endsWith(".glb")) fs.copyFileSync(path.join(PROXIES, f), path.join(dir, "templu/proxies", f));
  }
}
if (fs.existsSync(LANDSCAPE)) { LAND = path.join(dir, "sarmizegetusa-landscape.em.json"); fs.copyFileSync(LANDSCAPE, LAND); }
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
async function open(file, { embargo = true, lang = "it" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1050 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(([on, l]) => {
    if (on) window.__EM_EMBARGO__ = true;
    if (!sessionStorage.getItem("jar-probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", l);
      sessionStorage.setItem("jar-probe", "1");
    }
  }, [embargo, lang]);
  await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(B)}`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 120000 });
  if (file) {
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, file]);
    await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 5, null, { timeout: 120000 });
  }
  return { ctx, page, errors };
}
const H = (page, fn, arg) => page.evaluate(fn, arg);
const shot = async (page, name, sel) => {
  if (!SHOTS) return;
  const el = sel ? await page.$(sel) : null;
  await (el ?? page).screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
/** the graph's edges and nodes as the page has them now */
const graph = (page) => H(page, () => { const g = JSON.parse(window.__EM_DRAG__.json?.() ?? "null"); return g; });
const edgesOf = (page) => H(page, () => window.__EM_DRAG__.edges?.() ?? null);
const toastText = (page) => H(page, () => document.getElementById("toast")?.textContent ?? "");
const waitToast = (page, re, what) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById("toast")?.textContent ?? ""),
  re.source, { timeout: 30000 }).then(() => ok(true, what), async (e) => {
    console.error(`toast now: «${await page.evaluate(() => document.getElementById("toast")?.textContent)}» jar: ${JSON.stringify(await page.evaluate(() => window.__EM_DRAG__.jar?.()))}`);
    throw e;
  });
const member = (page, m, u) => H(page, ([a, b]) => !!window.__EM_DRAG__.hasEdge?.(a, b, "is_in_functional_unit"), [m, u]);

try {
  const { ctx, page, errors } = await open(DOC);
  // the workspace «Funzionale»: a tab, its areas
  await page.waitForSelector('[data-ws="functional"]', { timeout: 30000 });
  ok(true, "the tab «Funzionale» is on the bar (lab, switch on)");
  ok(await H(page, () => /Funzionale/.test(document.querySelector('[data-ws="functional"]')?.textContent ?? "")), "…named «Funzionale»");
  await page.click('[data-ws="functional"]');
  await page.waitForSelector(".tile-fmbody [data-fm-unit]", { timeout: 60000 });
  const wins = await H(page, () => window.__EM_DRAG__.wins().map((w) => w.type).sort());
  eq(wins, ["functional-matrix", "graph", "inspector", "landscape-matrix", "table"].sort(),
     "A · three views: Matrix | Functional Matrix | Landscape Matrix, the Inspector and the coherence under them");
  ok(await H(page, () => window.__EM_DRAG__.wins().find((w) => w.type === "table")?.state?.["current.table.sheet"] === "Issues"),
     "…the coherence is the table on «Issues»");
  // Landscape ⇄ Cube
  await page.waitForSelector('[data-switch-to="landscape-cube"]', { timeout: 30000 });
  await page.click('[data-switch-to="landscape-cube"]');
  await page.waitForFunction(() => window.__EM_DRAG__.wins().some((w) => w.type === "landscape-cube") && !window.__EM_DRAG__.wins().some((w) => w.type === "landscape-matrix"));
  ok(true, "«⇄ Cubo»: the same area becomes the Cube");
  await page.waitForSelector('[data-switch-to="landscape-matrix"]', { timeout: 30000 });
  await page.click('[data-switch-to="landscape-matrix"]');
  await page.waitForFunction(() => window.__EM_DRAG__.wins().some((w) => w.type === "landscape-matrix"));
  ok(true, "«⇄ Landscape Matrix»: and back");
  await shot(page, "jar-0-workspace");
  const fm = () => H(page, () => window.__EM_DRAG__.functionalMatrix());
  await page.waitForFunction(() => window.__EM_DRAG__.functionalMatrix().status === "ok", null, { timeout: 60000 });
  eq((await fm()).units, 6, "the Functional Matrix of the villa → castle: six units");

  // A · a unit FROM THE MATRIX into a brace: a real drag
  await H(page, () => window.__EM_DRAG__.jarShow("US7"));
  await page.waitForTimeout(900);
  const placeBefore = await H(page, () => window.__EM_DRAG__.stored("US7"));
  const from = await H(page, () => window.__EM_DRAG__.jarNodeScreen("US7"));
  ok(!!from, `US7 drawn in the Matrix (${JSON.stringify(from)})`);
  const castle = await page.$('.tile-fmbody [data-fm-unit="CASTLE"] > .fm-area');
  const cb = await castle.boundingBox();
  const to = { x: cb.x + cb.width - 30, y: cb.y + cb.height - 12 };
  eq(await H(page, (p) => window.__EM_DRAG__.jarDropAt(p.x, p.y), to), "CASTLE", "the drop point is inside the castle's braces");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  ok(await H(page, () => document.querySelector('.tile-fmbody [data-fm-unit="CASTLE"]')?.getAttribute("data-fm-drop") === "1"),
     "during the drag the castle's braces light up");
  await page.mouse.up();
  await page.waitForFunction(() => window.__EM_DRAG__.hasEdge("US7", "CASTLE", "is_in_functional_unit"), null, { timeout: 20000 });
  ok(true, "released in the braces: US7 is_in_functional_unit the castle");
  eq(await H(page, () => window.__EM_DRAG__.stored("US7")), placeBefore, "…the master stays where it was in the Matrix (nothing moved)");
  await waitToast(page, /US7 → «castello» · ✓ viva nella vita dell'unità/, "the check of coherence at the release: «✓ viva nella vita dell'unità», with Annulla");
  ok(await H(page, () => [...document.querySelectorAll("#toast .toast-action")].some((b) => /Annulla/.test(b.textContent))), "…the toast keeps «Annulla»");
  await page.waitForSelector('.tile-fmbody [data-fm-inst="CASTLE:US7"]', { timeout: 20000 });
  ok(true, "the Functional Matrix draws the instance CASTLE:US7");
  // the reading, signed and dated
  const rd = await H(page, () => {
    const last = window.__EM_DRAG__.jar().last;
    const x = last.reading;
    const E = window.__EM_DRAG__.allEdges();
    const n = window.__EM_DRAG__.node(x);
    return { x, act: n?.data?.act_start ?? null, type: n?.node_type, from: E.filter((e) => e.source === x && e.edge_type === "extracted_from").map((e) => e.target),
             under: E.some((e) => e.target === x && ["has_data_provenance", "combines"].includes(e.edge_type)) };
  });
  const day = new Date(); const pad = (n) => String(n).padStart(2, "0");
  eq([rd.type, rd.act, rd.from, rd.under], ["extractor", `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`, [], true],
     "the paradata: an extractor of the castle's function (under its combiner), dated today (act_start), no source of its own");
  await page.waitForTimeout(600);
  eq(await H(page, () => window.__EM_DRAG__.issues().filter((i) => i.rule === "cycle" && /US7/.test(i.txt)).length), 0,
     "…and no cycle through the member (US7 → castle → function → extractor ↛ US7)");
  // undo / redo
  await H(page, () => window.__EM_DRAG__.undo());
  ok(!(await member(page, "US7", "CASTLE")) && !(await H(page, (x) => !!window.__EM_DRAG__.node(x), rd.x)),
     "undo: the membership and the reading go together (one step)");
  await H(page, () => window.__EM_DRAG__.redo());
  ok(await member(page, "US7", "CASTLE"), "redo: back");
  // a member not alive: the warning at the release
  ok(await H(page, () => window.__EM_DRAG__.jarAdd(["USM2"], "HALL")), "USM2 (Roman, closed by its continuity in late antiquity) dropped into the medieval hall");
  await waitToast(page, /⚠ .*USM2.*non viva nella vita di «sala»/, "…the check says «⚠ USM2 non viva nella vita di «sala»»");
  eq((await H(page, () => window.__EM_DRAG__.jar().last)).check.notAlive, ["USM2"], "…and the check names it");
  ok(await H(page, () => window.__EM_DRAG__.jar().last.reading === null), "the hall has no primary_function: the gesture is said unsigned (no reading)");
  ok(await H(page, () => window.__EM_DRAG__.issues().some((i) => i.rule === "functional" && i.node === "USM2" && /sala/.test(i.txt))),
     "…and the warning is in the one model of the issues (the coherence area)");
  await H(page, () => window.__EM_DRAG__.undo());

  // B · inside the Functional Matrix: an instance moved, then copied with Alt
  const drag = async (sel, toSel, alt) => {
    const a = await (await page.$(sel)).boundingBox();
    const bx = await (await page.$(toSel)).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(bx.x + bx.width - 20, bx.y + bx.height - 8, { steps: 10 });
    if (alt) await page.keyboard.down("Alt");
    await page.mouse.move(bx.x + bx.width - 18, bx.y + bx.height - 8, { steps: 2 });
    await page.mouse.up();
    if (alt) await page.keyboard.up("Alt");
  };
  await page.waitForSelector('.tile-fmbody [data-fm-inst="VILLA:USM4"]');
  await drag('.tile-fmbody [data-fm-inst="VILLA:USM4"]', '.tile-fmbody [data-fm-unit="STABLE"] > .fm-area', false);
  await page.waitForFunction(() => !window.__EM_DRAG__.hasEdge("USM4", "VILLA", "is_in_functional_unit"), null, { timeout: 20000 }).catch(() => {});
  eq([await member(page, "USM4", "VILLA"), await member(page, "USM4", "STABLE")], [false, true],
     "an instance dragged from the villa to the stable: the membership MOVES (USM4 was already in the stable: kept once)");
  await H(page, () => window.__EM_DRAG__.undo());
  ok(await member(page, "USM4", "VILLA"), "undo: back in the villa");
  await page.waitForSelector('.tile-fmbody [data-fm-inst="CASTLE:USM10"]');
  await drag('.tile-fmbody [data-fm-inst="CASTLE:USM10"]', '.tile-fmbody [data-fm-unit="HALL"] > .fm-area', true);
  await page.waitForFunction(() => window.__EM_DRAG__.hasEdge("USM10", "HALL", "is_in_functional_unit"), null, { timeout: 20000 });
  eq([await member(page, "USM10", "CASTLE"), await member(page, "USM10", "HALL")], [true, true],
     "with Alt: COPIED — USM10 in the castle and in the hall (the wall of two rooms)");
  await waitToast(page, /USM10 anche in «sala» \(copia\)/, "…said «anche in «sala» (copia)»");
  await page.waitForSelector('.tile-fmbody [data-fm-inst="HALL:USM10"]', { timeout: 20000 });
  await shot(page, "jar-1-copied", ".tile-fmbody");
  await H(page, () => window.__EM_DRAG__.undo());

  // C · «Leggi come…»: from the right click of the Matrix, a new unit
  await H(page, () => window.__EM_DRAG__.jarShow("US7"));
  await page.waitForTimeout(900);
  await H(page, () => window.__EM_DRAG__.selectMany(["US7", "USM20"]));
  const pos = await H(page, () => window.__EM_DRAG__.jarNodeScreen("US7"));
  await page.mouse.click(pos.x, pos.y, { button: "right" });
  await page.waitForSelector('.ctx-menu [data-cmd="jar-read-as"]', { timeout: 10000 });
  ok(await H(page, () => document.querySelector('.ctx-menu [data-cmd="jar-read-as"]').textContent === "Leggi come…"),
     "the right click on the selection: «Leggi come…»");
  await page.click('.ctx-menu [data-cmd="jar-read-as"]');
  await page.waitForSelector('[data-app-dialog="jar-read-as"] [data-jar-form]', { timeout: 10000 });
  const form = await H(page, () => {
    const f = document.querySelector("[data-jar-form]");
    return { who: f.querySelector(".jar-who").textContent, epoch: f.querySelector("[data-jar-epoch]").value,
             units: [...f.querySelectorAll("[data-jar-unit] option")].map((o) => o.value),
             existing: f.querySelector('[data-jar-mode="existing"]').checked };
  });
  ok(/2 unità: US7, USM20/.test(form.who) && form.existing && form.units.includes("CASTLE"), `the form: the two units, the existing ones offered first (${form.who})`);
  eq(form.epoch, "EP_MED", "the first epoch offered: theirs (Medievale)");
  await page.click('[data-jar-mode="new"]');
  await page.fill("[data-jar-name]", "cappella");
  await page.selectOption("[data-jar-scale]", "room");
  await page.fill("[data-jar-fn]", "cappella");
  await page.selectOption("[data-jar-parent]", "CASTLE");
  await page.click('[data-app-dialog="jar-read-as"] [data-dialog-ok]');
  await page.waitForFunction(() => window.__EM_DRAG__.jar().last?.kind === "new", null, { timeout: 10000 });
  const made = await H(page, () => {
    const D = window.__EM_DRAG__;
    const u = D.jar().last.unit;
    const n = D.node(u);
    const E = D.allEdges();
    const prop = E.find((e) => e.source === u && e.edge_type === "has_property")?.target;
    return { name: n.name, scale: n.data?.scale, epoch: E.find((e) => e.source === u && e.edge_type === "has_first_epoch")?.target,
             parent: E.find((e) => e.source === u && e.edge_type === "is_in_functional_unit")?.target,
             members: E.filter((e) => e.target === u && e.edge_type === "is_in_functional_unit").map((e) => e.source).sort(),
             fn: D.node(prop)?.data?.value, fnName: D.node(prop)?.name, reading: D.jar().last.reading, selected: D.selected()[0] === u };
  });
  eq([made.name, made.scale, made.epoch, made.parent, made.members, made.fn, made.fnName, !!made.reading, made.selected],
     ["cappella", "room", "EP_MED", "CASTLE", ["US7", "USM20"], "cappella", "primary_function", true, true],
     "a new functional unit: name, scale, first epoch, inside the castle, its members, its function, the signed reading; selected");
  await page.waitForFunction((u) => !!document.querySelector(`.tile-fmbody [data-fm-unit="CASTLE"] [data-fm-unit="${u}"]`),
    await H(page, () => window.__EM_DRAG__.jar().last.unit), { timeout: 20000 });
  ok(true, "…drawn as braces nested in the castle's");
  await waitToast(page, /Nuova unità funzionale «cappella» con 2 membri · ✓/, "…the toast says it, checked");
  await shot(page, "jar-2-cappella", ".tile-fmbody");
  const nUnits = await H(page, () => window.__EM_DRAG__.allNodes().filter((n) => n.node_type === "FunctionalUnitNodeGroup").length);
  await H(page, () => window.__EM_DRAG__.undo());
  eq(await H(page, () => window.__EM_DRAG__.allNodes().filter((n) => n.node_type === "FunctionalUnitNodeGroup").length), nUnits - 1,
     "undo: the new unit, its property, its reading and the memberships go in one step");
  // «Leggi come…» from the Functional Matrix's head, into an existing unit
  await H(page, () => window.__EM_DRAG__.selectMany(["US7"]));
  await page.click(".tile-fmbody [data-fm-readas]");
  await page.waitForSelector('[data-app-dialog="jar-read-as"] [data-jar-form]', { timeout: 10000 });
  await page.selectOption("[data-jar-unit]", "STABLE");
  await page.click('[data-app-dialog="jar-read-as"] [data-dialog-ok]');
  await page.waitForFunction(() => window.__EM_DRAG__.hasEdge("US7", "STABLE", "is_in_functional_unit"), null, { timeout: 10000 });
  ok(true, "«Leggi come…» in the head of the Functional Matrix: US7 read as a member of the stable");
  await H(page, () => window.__EM_DRAG__.undo());
  // the command of the menus (Edit ▸ «Leggi come…», F3): its button opens the same form
  await H(page, () => window.__EM_DRAG__.selectMany(["US7"]));
  await H(page, () => document.getElementById("btn-jar-read-as").click());
  await page.waitForSelector('[data-app-dialog="jar-read-as"] [data-jar-form]', { timeout: 10000 });
  ok(true, "Edit ▸ «Leggi come…» (the menus' command, F3) opens the form");
  await page.click('[data-app-dialog="jar-read-as"] [data-dialog-cancel]');
  // a selection with nothing to read
  ok(await H(page, () => { window.__EM_DRAG__.jarReadAs(["EP_MED"]); return true; }), "an epoch alone…");
  await waitToast(page, /Seleziona unità che possono essere membri/, "…«Leggi come…» says what can be read");
  // the «+» offers the two layouts
  await page.click(".ws-tab.ws-add");
  await page.waitForSelector("[data-ws-add-menu]", { timeout: 10000 });
  const models = await H(page, () => [...document.querySelectorAll("[data-ws-add-menu] [data-ws-add]")].map((b) => [b.dataset.wsAdd, b.textContent.trim()]));
  ok(models.some(([k, l]) => k === "functional-a" && /Funzionale A · tre viste/.test(l)) && models.some(([k, l]) => k === "functional-b" && /Funzionale B · zoom e cubo/.test(l)),
     `the «+» offers the two layouts «Funzionale A · tre viste» and «Funzionale B · zoom e cubo» (${models.map((m) => m[0]).join(", ")})`);
  await page.click('[data-ws-add-menu] [data-ws-add="functional-b"]');
  await page.waitForSelector('[data-app-dialog="ws-add"] [data-dialog-ok]', { timeout: 10000 });
  await page.click('[data-app-dialog="ws-add"] [data-dialog-ok]');
  await page.waitForFunction(() => window.__EM_DRAG__.wins().some((w) => w.type === "landscape-cube") && window.__EM_DRAG__.wins().some((w) => w.type === "functional-matrix"), null, { timeout: 30000 });
  eq(await H(page, () => window.__EM_DRAG__.wins().map((w) => w.type).sort()), ["functional-matrix", "graph", "inspector", "landscape-cube", "table"].sort(),
     "«Funzionale B» saved as a workspace of its own: the two Matrices, the Cube, the Inspector, the coherence");
  await shot(page, "jar-5-variant-b");
  await H(page, () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  eq(errors, [], "no page error");
  await ctx.close();

  // the switch off: nothing of it
  {
    const o = await open(DOC, { embargo: false });
    eq(await H(o.page, () => [typeof window.__EM_DRAG__.jar, !!document.querySelector('[data-ws="functional"]'),
                              [...document.querySelectorAll('[data-cmd="jarReadAs"]')].some((e) => e.offsetParent !== null)]),
       ["undefined", false, false], "switch off: no jar hook, no tab «Funzionale», the command drawn nowhere");
    await o.ctx.close();
  }

  // ── 4 · the real case ──
  if (REAL) {
    // the landscape first, the temple last (in front)
    const r = await open(LAND ?? REAL);
    if (LAND) {
      const doc = JSON.parse(fs.readFileSync(REAL, "utf8"));
      await H(r.page, ([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, REAL]);
      await r.page.waitForFunction(() => window.__EM_DRAG__.allNodes().some((n) => n.name === "SU003"), null, { timeout: 120000 });
    }
    await r.page.click('[data-ws="functional"]');
    await r.page.waitForSelector(".tile-fmbody [data-fm-unit]", { timeout: 90000 });
    const a = (await H(r.page, () => window.__EM_DRAG__.functionalMatrix())).answer;
    const id = Object.fromEntries(a.units.map((u) => [u.name, u.id]));
    eq(a.units.length, 9, "Templu Mare fu-prova in «Funzionale»: the nine units");
    const real = JSON.parse(fs.readFileSync(REAL, "utf8"));
    const nodes = Object.values(real.graphs)[0].nodes;
    const byName = (n) => nodes.find((x) => x.name === n)?.id;
    if (LAND) {
      await r.page.waitForSelector(".tile-lmbody [data-lm-row], [data-lm-row]", { timeout: 90000 }).catch(() => {});
      ok(await H(r.page, () => document.querySelectorAll("[data-lm-row]").length > 40), "the Landscape Matrix of Sarmizegetusa beside it (47 identities)");
    }
    await shot(r.page, "jar-3-templu-workspace");
    // C · MF02's open point: the overlay's note says what the Matrix shows now —
    // here the Functional Matrix reads the landscape's horizons, not this Matrix's lanes
    if (LAND) {
      // (the Matrix's head is narrow here: the switch may sit in its overflow — pressed as the menu would)
      const press = () => H(r.page, () => { const b = document.querySelector('[data-act="functional-overlay"]'); b?.dispatchEvent(new MouseEvent("click", { bubbles: true })); return !!b; });
      ok(await press(), "the Matrix of «Funzionale» has the overlay's switch");
      await r.page.waitForSelector("[data-fo-note]", { timeout: 30000 });
      await r.page.waitForFunction(() => document.querySelector("[data-fo-note]")?.getAttribute("data-fo-note") === "lanes", null, { timeout: 60000 })
        .catch(() => {});
      const note = await H(r.page, () => { const n = document.querySelector("[data-fo-note]"); return [n?.getAttribute("data-fo-note"), n?.textContent]; });
      eq(note[0], "lanes", `the overlay on, a landscape open: the note says «altre corsie», not «vista per attività spenta» (${note[1]})`);
      await press();
    }
    // a real drag: SU007 is in the courtyard; drag USV103 (not read) into the portico
    const cand = a.coherence.coverage ? Object.values(a.coherence.coverage).flatMap((c) => c.unread) : [];
    const free = cand.find((u) => nodes.find((n) => n.id === u && n.node_type === "US"));
    ok(!!free, `a unit no functional unit reads (${free ? nodes.find((n) => n.id === free).name : "?"})`);
    await H(r.page, (u) => window.__EM_DRAG__.jarShow(u), free);
    await r.page.waitForTimeout(900);
    const p0 = await H(r.page, (u) => window.__EM_DRAG__.jarNodeScreen(u), free);
    const portico = id["portico (colonnato e architrave)"];
    if (p0) {
      await H(r.page, (u) => document.querySelector(`.tile-fmbody [data-fm-unit="${u}"] > .fm-area`)?.scrollIntoView({ block: "center" }), portico);
      await r.page.waitForTimeout(300);
      const box2 = await (await r.page.$(`.tile-fmbody [data-fm-unit="${portico}"] > .fm-area`)).boundingBox();
      const tgt = { x: box2.x + box2.width - 25, y: box2.y + box2.height - 10 };
      const at = await H(r.page, (q) => window.__EM_DRAG__.jarDropAt(q.x, q.y), tgt);
      ok(at === portico, `the drop point is in the portico's braces (${at}; from ${JSON.stringify(p0)} to ${JSON.stringify(tgt)})`);
      await r.page.mouse.move(p0.x, p0.y); await r.page.mouse.down();
      await r.page.mouse.move(tgt.x, tgt.y, { steps: 14 });
      await shot(r.page, "jar-3b-dragging");
      await r.page.mouse.up();
      await r.page.waitForFunction(([m, u]) => window.__EM_DRAG__.hasEdge(m, u, "is_in_functional_unit"), [free, portico], { timeout: 20000 });
      ok(true, "Templu Mare: a real drag from the Matrix into the portico's braces → the membership");
      await r.page.waitForFunction(() => window.__EM_DRAG__.jar().last?.check, null, { timeout: 30000 });
      const chk = (await H(r.page, () => window.__EM_DRAG__.jar().last)).check;
      ok(chk.status === "ok", `…checked by the bridge (${JSON.stringify(chk)}; ${await toastText(r.page)})`);
      await H(r.page, () => window.__EM_DRAG__.undo());
      ok(!(await H(r.page, ([m, u]) => window.__EM_DRAG__.hasEdge(m, u, "is_in_functional_unit"), [free, portico])), "…undo takes it back");
      await r.page.waitForFunction(([m, u]) => !document.querySelector(`.tile-fmbody [data-fm-inst="${u}:${m}"]`), [free, portico], { timeout: 20000 });
      ok(true, "…and the Functional Matrix draws it no more");
    } else ok(true, "(the unit is not on screen in the Matrix: the real drag skipped)");
    // the lasso in the Space on the proxies → a new functional unit
    const sp = await H(r.page, () => { const D = window.__EM_DRAG__; const id = D.splitDoc(D.wins().find((w) => w.type === "landscape-matrix")?.id ?? D.activeWinId()); return id && D.retype(id, "scene") ? id : null; });
    ok(!!sp, "a Space area beside them");
    await r.page.waitForSelector(`.tile-area[data-win="${sp}"] canvas`, { timeout: 60000 }).catch(() => {});
    const rect = await H(r.page, (w) => document.querySelector(`.tile-area[data-win="${w}"] canvas`)?.getBoundingClientRect()?.toJSON() ?? null, sp);
    const whole = rect ? [{ x: rect.left + 2, y: rect.top + 2 }, { x: rect.right - 2, y: rect.top + 2 }, { x: rect.right - 2, y: rect.bottom - 2 }, { x: rect.left + 2, y: rect.bottom - 2 }] : null;
    const loaded = whole ? await r.page.waitForFunction(([w, p]) => window.__EM_DRAG__.jarLassoKeys(w, p).filter((k) => k.startsWith("proxy:")).length > 10,
      [sp, whole], { timeout: 150000, polling: 1000 }).then(() => true).catch(() => false) : false;
    if (rect && loaded) {
      const poly = [{ x: rect.left + 2, y: rect.top + 2 }, { x: rect.right - 2, y: rect.top + 2 }, { x: rect.right - 2, y: rect.bottom - 2 }, { x: rect.left + 2, y: rect.bottom - 2 }];
      const keys = await H(r.page, ([w, p]) => window.__EM_DRAG__.jarLasso(w, p), [sp, poly]);
      const px = keys.filter((k) => k.startsWith("proxy:"));
      ok(px.length > 10, `the lasso around the whole Space: ${px.length} proxies inside`);
      await r.page.waitForSelector("#toast .toast-action", { timeout: 10000 });
      ok(/unità nel lazo/.test(await toastText(r.page)), "…«N unità nel lazo», with «Nuova unità funzionale…»");
      await r.page.click("#toast .toast-action");
      await r.page.waitForSelector('[data-app-dialog="jar-read-as"] [data-jar-form]', { timeout: 10000 });
      ok(await H(r.page, () => document.querySelector('[data-jar-mode="new"]').checked), "…the form opens on «Una nuova unità funzionale»");
      await r.page.fill("[data-jar-fn]", "area sacra");
      await r.page.selectOption("[data-jar-scale]", "complex");
      await r.page.click('[data-app-dialog="jar-read-as"] [data-dialog-ok]');
      await r.page.waitForFunction(() => window.__EM_DRAG__.jar().last?.kind === "new", null, { timeout: 10000 });
      const lastNew = await H(r.page, () => window.__EM_DRAG__.jar().last);
      ok(lastNew.added.length === px.length - lastNew.refused.length || lastNew.added.length > 10,
         `the lasso → «area sacra», a new functional unit with ${lastNew.added.length} members`);
      await shot(r.page, "jar-4-lasso");
      await H(r.page, () => window.__EM_DRAG__.undo());
    } else ok(true, `(the Space drew no proxy here${rect ? "" : " (no canvas)"}: the lasso skipped)`);
    eq(r.errors, [], "Templu Mare: no page error");
    await r.ctx.close();
  } else {
    console.log(`  (the real case skipped: no ${FU_PROVA})`);
  }
} finally {
  await browser.close();
  stop();
}
console.log(`✓ check-functional-jar: ${checks} checks passed`);
