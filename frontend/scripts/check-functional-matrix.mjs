// MICRO-MF01 (E.D., 22 Nov 2026) · THE FUNCTIONAL MATRIX — under embargo
// (features.ts: functional-matrix), the lab build only.
//
//   node scripts/check-functional-matrix.mjs
//   (page part: own Vite + own bridge; PLAYWRIGHT_CORE / CHR as
//    check-script-forms.mjs; skipped, and said, without them. FU_PROVA=<the
//    Templu Mare test copy> adds the real case; SHOTS=<dir> keeps pictures)
//
//   1 · the RULES of the embargo: every use in main.ts behind FM_ON (LAB
//       first), the type's metadata and surface only in the lab profile, the
//       texts (EN + IT) only in the LAB_TEXTS blocks, the bridge's route only
//       in tools/em_py_lab.py;
//   2 · the BRIDGE: POST /functional-matrix answers s3Dgraphy's
//       functional_matrix (lanes, braces, instances, readers, chain,
//       coherence, the cards);
//   3 · the PAGE (lab dev server, the embargo's switch on), on a synthetic
//       villa → castle + stable: an area turned into «Matrix funzionale»; the
//       lanes of the Matrix; the braces nested, their colour the evidence; a
//       shared member an instance in both braces; «↑epoch»; a unit closed with
//       its number, opened and closed by a click; the chain with its kind in
//       Italian; the cross selection (a unit lights its readers, a brace its
//       members — in the Matrix too); the Inspector «Come lo sappiamo» and
//       «Letta da»; the coherence in the one model of issues, «go to» from the
//       pill; with the switch off nothing of it;
//   4 · the REAL case (FU_PROVA): Templu Mare with the scrivania's units.
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
ok(/const FM_ON = LAB && featureOn\("functional-matrix"\);/.test(main), "main.ts: FM_ON = LAB && featureOn(\"functional-matrix\")");
ok(/const FO_ON = LAB && featureOn\("functional-overlay"\);/.test(main), "main.ts: FO_ON = LAB && featureOn(\"functional-overlay\") (MICRO-MF02)");
{
  // every name imported from functional-matrix.ts is used only behind FM_ON
  const imp = /import \{([^}]+)\} from "\.\/functional-matrix";/.exec(main);
  ok(!!imp, "main.ts imports the module once");
  const names = imp[1].split(",").map((s) => s.trim()).filter(Boolean);
  const body = main.replace(imp[0], "");
  const lines = body.split("\n");
  const bad = [];
  for (const n of names) {
    lines.forEach((l, i) => {
      if (!new RegExp(`\\b${n}\\b`).test(l)) return;
      // MICRO-MF02 · the functional overlay reads the same answer behind its own
      // guard FO_ON (= LAB && featureOn("functional-overlay"), checked above)
      const ctx = lines.slice(Math.max(0, i - 16), i + 1).join("\n");
      if (!/FM_ON|FO_ON|\(LAB \?/.test(ctx)) bad.push(`${n} @${i + 1}`);
    });
  }
  eq(bad, [], "every use of the module in main.ts sits behind FM_ON (or LAB)");
}
const i18n = read("frontend/src/i18n.ts");
const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]);
const openI18n = i18n.replace(/\.\.\.\(LAB_TEXTS \? \{[\s\S]*?\n  \} : \{\}\),/g, "");
const fmSrc = read("frontend/src/functional-matrix.ts");
const usedKeys = new Set([...fmSrc.matchAll(/\bt\("(fm\.[\w.]+)"/g), ...main.matchAll(/"(fm\.[\w.]+)"/g)].map((m) => m[1]));
for (const dyn of ["fm.ev.stratigraphic", "fm.ev.documentary", "fm.ev.reconstructive", "fm.ev.symbol",
  "fm.scale.territory", "fm.scale.complex", "fm.scale.building", "fm.scale.room", "fm.scale.component"]) usedKeys.add(dyn);
ok(usedKeys.size > 30, `the module's texts read (${usedKeys.size})`);
eq([...usedKeys].filter((k) => !labBlocks.every((b) => b.includes(`"${k}":`))), [], "every text of the Functional Matrix in both LAB_TEXTS blocks (EN + IT)");
eq([...usedKeys].filter((k) => openI18n.includes(`"${k}"`)), [], "…and none in the open dictionaries");
const lab = read("tools/em_py_lab.py");
const bridgePy = read("tools/em_bridge.py");
ok(/"\/functional-matrix": _functional_matrix_route/.test(lab) && /@lab_api\("functional-matrix", "functional_matrix"\)/.test(lab),
   "the route and em.app.functional_matrix live in em_py_lab (absent from the community sidecar)");
ok(!/"\/functional-matrix"/.test(bridgePy) && /POST_ROUTES\.update\(getattr\(_em_py_lab, "POST_ROUTES", \{\}\)\)/.test(bridgePy),
   "em_bridge.py names no such route: it merges em_py_lab's when the module is there");

async function load(file, profile) {
  const b = await esbuild.build({ entryPoints: [path.join(SRC, file)], bundle: true, format: "esm", write: false, logLevel: "silent",
    ...(profile === "none" ? {} : { define: { __EM_LAB__: profile === "lab" ? "true" : "false" } }) });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
}
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
for (const profile of ["community", "none", "lab"]) {
  const W = await load("workspace.ts", profile);
  const I = await load("window-icons.ts", profile);
  const has = Object.keys(W.WINDOW_TYPE_META).includes("functional-matrix");
  eq([has, !!I.WINDOW_ICON_PATHS["functional-matrix"]], [profile === "lab", profile === "lab"],
     `${profile}: the type «functional-matrix» (its name and icon) ${profile === "lab" ? "is" : "is not"} in the model`);
  if (has) eq(W.WINDOW_TYPE_META["functional-matrix"].labelKey, "feat.functionalMatrix.title", "lab: the type's name is the register's title");
  const M = await load("shell/types.ts", profile);
  M.registerBuiltinSurfaces(new Proxy({}, { get: () => () => {} }));
  eq(M.convertedTypes().includes("functional-matrix"), profile === "lab", `${profile}: its surface registered only in the lab`);
}

// ── 2 · 3 · 4 · the bridge and the page ─────────────────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
let pw = null;
for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
  path.join(ROOT, ".claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js")]) {
  if (!t) continue;
  try { const m = await import(t); pw = m.chromium ? m : m.default; break; } catch { /* next */ }
}
if (!fs.existsSync(py) || !pw) {
  console.log(`check-functional-matrix: ${checks} checks passed (${!pw ? "no playwright-core" : `no s3Dgraphy venv at ${py}`}: the bridge and the page skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "functional-matrix-")));
const DOC = path.join(dir, "villa-castello.em.json");
fs.copyFileSync(path.join(FE, "testdata/functional-matrix.em.json"), DOC);
const FU_PROVA = process.env.FU_PROVA ?? path.join(ROOT, "../_datasets/templumare-v11/TempluMare_v11_fu-prova.em.json");
const REAL = fs.existsSync(FU_PROVA) ? path.join(dir, "TempluMare_v11_fu-prova.em.json") : null;
if (REAL) fs.copyFileSync(FU_PROVA, REAL);
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
  // the dev server is the LAB profile unless told (MICRO-SEG30)
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

// ── 2 · the bridge ───────────────────────────────────────────────────────────
{
  const container = JSON.parse(fs.readFileSync(DOC, "utf8"));
  const g = container.graphs[container.active_graph_id];
  const res = await fetch(`${B}/functional-matrix`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://localhost:${PORT}` },
    body: JSON.stringify({ doc: { version: "1", graph: g, header: container.header ?? {} }, lang: "it" }) });
  eq(res.status, 200, `POST /functional-matrix answers (${berr.split("\n").slice(-3).join(" | ")})`);
  const a = await res.json();
  eq(a.lanes.map((l) => l.id), ["EP_MED", "EP_TARD", "EP_ROM"], "the lanes: the top epochs, newest first");
  eq(a.roots, ["CASTLE", "STABLE", "VILLA"], "the roots: the handles, in lane order");
  eq(a.readers.USM1, ["VILLA", "CASTLE"], "a shared member is read by both");
  eq(a.chain.map((c) => c.label), ["riuso", "riuso"], "the chain's kind, in Italian");
  ok(a.how.CASTLE.function.value === "castello" && a.how.CASTLE.function.sources[0].sources[0].name === "D.01 Catasto 1820",
     "the card: the function and its source");
  const bad = await fetch(`${B}/functional-matrix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  eq(bad.status, 400, "no doc: 400");
}

// ── 3 · the page ─────────────────────────────────────────────────────────────
const browser = await pw.chromium.launch({ executablePath: fs.existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function open(file, { embargo = true, lang = "it" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(([on, l]) => {
    if (on) window.__EM_EMBARGO__ = true;
    if (!sessionStorage.getItem("fm-probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", l);
      sessionStorage.setItem("fm-probe", "1");
    }
  }, [embargo, lang]);
  await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(B)}`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 120000 });
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, file]);
  await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 5, null, { timeout: 120000 });
  return { ctx, page, errors };
}
const H = (page, fn, arg) => page.evaluate(fn, arg);
async function makeArea(page) {
  // the Matrix's window split, the new half turned into «Matrix funzionale»
  const made = await H(page, () => {
    const D = window.__EM_DRAG__;
    const id = D.splitDoc(D.activeWinId());
    return id && D.retype(id, "functional-matrix") ? id : null;
  });
  ok(!!made, "an area turned into «Matrix funzionale» (the type menu's gesture)");
  await page.waitForSelector(".tile-fmbody [data-fm-unit]", { timeout: 60000 });
  return made;
}
const shot = async (page, name, sel = ".tile-fmbody") => {
  if (!SHOTS) return;
  const el = await page.$(sel);
  await (el ?? page).screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

try {
  const { ctx, page, errors } = await open(DOC);
  await makeArea(page);
  const fm = () => H(page, () => window.__EM_DRAG__.functionalMatrix());
  const st = await fm();
  eq([st.status, st.units], ["ok", 6], "the page asked the bridge: six functional units");
  // A · lanes, braces, instances
  eq(await H(page, () => [...document.querySelectorAll(".tile-fmbody [data-fm-lane]")].map((e) => e.getAttribute("data-fm-lane"))),
     ["EP_MED", "EP_TARD", "EP_ROM"], "the lanes of the Matrix, in its order");
  const ev = await H(page, () => Object.fromEntries([...document.querySelectorAll(".tile-fmbody [data-fm-unit]")]
    .map((e) => [e.getAttribute("data-fm-unit"), e.getAttribute("data-fm-evidence")])));
  eq([ev.CASTLE, ev.VILLA, ev.HALL, ev.STORES], ["stratigraphic", "stratigraphic", "symbol", "reconstructive"],
     "the colour of the braces is the evidence (US red, none grey, only USV blue)");
  const colour = await H(page, () => [...document.querySelectorAll('.tile-fmbody [data-fm-unit="HALL"] > path')].map((p) => p.getAttribute("stroke-dasharray")));
  ok(colour.length === 2 && colour.every((d) => d), "a symbol's braces are dotted");
  ok(await H(page, () => !!document.querySelector('.tile-fmbody [data-fm-unit="CASTLE"] [data-fm-unit="HALL"]')
                         && !!document.querySelector('.tile-fmbody [data-fm-unit="CASTLE"] [data-fm-unit="TOWER"]')),
     "the hall and the tower are braces nested in the castle's");
  const inst = await H(page, () => [...document.querySelectorAll(".tile-fmbody [data-fm-inst]")].map((e) => e.getAttribute("data-fm-inst")));
  ok(inst.includes("VILLA:USM1") && inst.includes("CASTLE:USM1"), "USM1, shared, is an instance in the villa AND in the castle");
  eq(await H(page, () => document.querySelector('.tile-fmbody [data-fm-inst="CASTLE:USM1"]')?.getAttribute("data-fm-from")), "EP_ROM",
     "the Roman wall in the castle comes from an earlier lane");
  ok(await H(page, () => document.querySelector('.tile-fmbody [data-fm-inst="CASTLE:USM1"] .fm-from')?.textContent === "↑Romana"),
     "…and says «↑Romana»");
  ok(await H(page, () => [...document.querySelectorAll('.tile-fmbody [data-fm-inst="CASTLE:USM1"] :is(rect,polygon,ellipse)')].some((e) => e.getAttribute("stroke-dasharray"))),
     "an instance is the master's glyph, dashed");
  ok(await H(page, () => document.querySelector('.tile-fmbody [data-fm-inst="CASTLE:USM2"]')?.classList.contains("fm-dead")),
     "a member not alive in the unit is marked");
  // a unit with many members: closed with its number, a click opens it
  ok(await H(page, () => document.querySelector('.tile-fmbody [data-fm-unit="STORES"]')?.getAttribute("data-fm-collapsed") === "1"
                         && document.querySelector('.tile-fmbody [data-fm-unit="STORES"] .fm-count')?.textContent === "{ 26 }"),
     "the stores (26 members) are drawn closed: «{ 26 }»");
  await shot(page, "fm-1-castello");
  await page.click('.tile-fmbody [data-fm-unit="STORES"] .fm-count');
  await page.waitForFunction(() => !document.querySelector('.tile-fmbody [data-fm-unit="STORES"]')?.hasAttribute("data-fm-collapsed"));
  eq(await H(page, () => document.querySelectorAll('.tile-fmbody [data-fm-inst^="STORES:"]').length), 26, "a click on the number opens them");
  await page.click('.tile-fmbody [data-fm-unit="STORES"] .fm-fold');
  await page.waitForFunction(() => document.querySelector('.tile-fmbody [data-fm-unit="STORES"]')?.getAttribute("data-fm-collapsed") === "1");
  ok(true, "…and «−» closes them again");
  // the chain
  eq(await H(page, () => [...document.querySelectorAll(".tile-fmbody [data-fm-chain]")].map((e) => [e.getAttribute("data-fm-kind"), e.querySelector("text")?.textContent])),
     [["reuse", "riuso"], ["reuse", "riuso"]], "the changed_from chain dotted, its kind in Italian");
  ok(await H(page, () => getComputedStyle(document.querySelector(".tile-fmbody .fm-chainline")).strokeDasharray.startsWith("0.1")),
     "…dotted");
  // B · the cross selection
  await page.click('.tile-fmbody [data-fm-inst="CASTLE:USM1"]');
  await page.waitForFunction(() => window.__EM_DRAG__.selected()[0] === "USM1");
  let s = await fm();
  eq(s.lit.fus.sort(), ["CASTLE", "VILLA"], "a click on a unit: the functional units that read it light up");
  eq(await H(page, () => Object.fromEntries([...document.querySelectorAll(".tile-fmbody [data-fm-unit]")].map((e) => [e.getAttribute("data-fm-unit"), e.getAttribute("data-fm-lit")]))),
     { VILLA: "1", CASTLE: "1", STABLE: "0", HALL: "0", TOWER: "0", STORES: "0" }, "…drawn lit, the others dimmed");
  await page.waitForSelector('.fm-insp-fm-readers [data-fm-go="CASTLE"]', { timeout: 20000 });
  eq(await H(page, () => [...document.querySelectorAll(".fm-insp-fm-readers [data-fm-go]")].map((b) => b.getAttribute("data-fm-go"))), ["VILLA", "CASTLE"],
     "the Inspector of the unit: «Letta da» the villa and the castle");
  await shot(page, "fm-2-usm1");
  await page.click('.fm-insp-fm-readers [data-fm-go="CASTLE"]');
  await page.waitForFunction(() => window.__EM_DRAG__.selected()[0] === "CASTLE");
  s = await fm();
  ok(["USM1", "USM2", "USM10", "USD5", "USV6", "USV200", "USV225"].every((u) => s.lit.units.includes(u)) && !s.lit.units.includes("US3"),
     "a click on a brace: all its members light up, the nested ones' too, from earlier lanes too");
  ok(["USM1", "USM10", "USV200"].every((u) => s.matrixLit.includes(u)), "…and the Matrix rings them");
  ok(s.lit.fus.includes("VILLA") && s.lit.fus.includes("HALL"), "…its nested units and its chain light up");
  await page.waitForSelector('[data-fm-how="CASTLE"]', { timeout: 20000 });
  const card = await H(page, () => Object.fromEntries([...document.querySelectorAll('[data-fm-how="CASTLE"] [data-fm-row]')]
    .map((r) => [r.getAttribute("data-fm-row"), r.querySelector(".fm-v")?.textContent ?? ""])));
  ok(card.function === "castello" && card.scale === "edificio" && card.life.startsWith("1100–1400") && /D\.01\.01/.test(card.source) && /Catasto 1820/.test(card.source),
     `«Come lo sappiamo»: function, scale, declared life, source and extractor (${JSON.stringify(card)})`);
  ok(/USM1/.test(card.members) && /stratigrafico/.test(card.evidence), "…the members and the evidence");
  ok(await H(page, () => document.querySelector('h3.insp-sect[data-sect="fm-how"]')?.textContent?.includes("Come lo sappiamo")), "…under its own heading");
  await shot(page, "fm-3-castello-inspector", ".tile-panel-body:has([data-fm-how])");
  // C · coherence: rows of the one model, with «go to»
  const iss = (await H(page, () => window.__EM_DRAG__.issues())).filter((i) => i.rule === "functional");
  ok(iss.some((i) => i.node === "USM2" && i.sev === "warn" && /non è viva nella sua vita/.test(i.txt)), "a member not alive: a warning on it");
  ok(iss.some((i) => i.node === "TOWER" && i.sev === "warn" && /vive fuori dalla vita/.test(i.txt)), "a child outside its parent: a warning on it");
  ok(iss.some((i) => i.node === "EP_MED" && i.sev === "info" && /US7/.test(i.txt)), "«non lette» per epoch: a hint on the epoch");
  await H(page, () => window.__EM_DRAG__.select(null));
  // the pill opens the table of the warnings (the one model, «go to» on each row)
  await page.click("#footer-warnings");
  const row = 'tr.tv-issue[data-rule="functional"][data-id="USM2"]';
  await page.waitForSelector(row, { timeout: 30000 });
  ok(await H(page, (r) => /unità funzionali/.test(document.querySelector(r)?.querySelector(".tv-rule")?.textContent ?? ""), row),
     "the table of the warnings: the row of the functional units, named");
  await page.click(`${row} .tv-msg`);
  await page.waitForFunction(() => window.__EM_DRAG__.selected()[0] === "USM2", null, { timeout: 10000 });
  ok(true, "…and a click on it goes to the member");
  eq(errors, [], "no page error");
  await ctx.close();

  // the switch off: nothing of it
  {
    const o = await open(DOC, { embargo: false });
    eq(await H(o.page, () => typeof window.__EM_DRAG__.functionalMatrix), "undefined", "switch off: no hook");
    eq((await H(o.page, () => window.__EM_DRAG__.issues())).filter((i) => i.rule === "functional").length, 0, "switch off: no functional issue");
    await o.ctx.close();
  }

  // ── 4 · the real case ──
  if (REAL) {
    const r = await open(REAL);
    await makeArea(r.page);
    const a = (await H(r.page, () => window.__EM_DRAG__.functionalMatrix())).answer;
    const id = Object.fromEntries(a.units.map((u) => [u.name, u.id]));
    eq(a.units.length, 9, "Templu Mare: the nine units of the scrivania");
    const real = JSON.parse(fs.readFileSync(REAL, "utf8"));
    const su003 = Object.values(real.graphs)[0].nodes.find((n) => n.name === "SU003")?.id;
    const inst = await H(r.page, () => [...document.querySelectorAll(".tile-fmbody [data-fm-inst]")].map((e) => e.getAttribute("data-fm-inst")));
    ok(inst.includes(`${id["portico (colonnato e architrave)"]}:${su003}`) && inst.includes(`${id.cortile}:${su003}`),
       `the enclosure SU003: an instance in the portico and one in the courtyard (${su003}; ${inst.filter((x) => x.endsWith(su003 ?? "?")).join(" ")})`);
    eq(await H(r.page, () => [...document.querySelectorAll(".tile-fmbody [data-fm-chain] text")].map((t) => t.textContent).sort()),
       ["ricostruzione", "rovina"], "the chain temple → ruin → restored temple, in Italian");
    await shot(r.page, "fm-4-templu-mare");
    await H(r.page, (x) => window.__EM_DRAG__.select(x), id.tempio);
    await r.page.waitForSelector(`[data-fm-how="${id.tempio}"]`);
    await shot(r.page, "fm-5-templu-tempio", ".tile-panel-body:has([data-fm-how])");
    eq(r.errors, [], "Templu Mare: no page error");
    await r.ctx.close();
  } else {
    console.log(`  (the real case skipped: no ${FU_PROVA})`);
  }
} finally {
  await browser.close();
  stop();
}
console.log(`✓ check-functional-matrix: ${checks} checks passed`);
