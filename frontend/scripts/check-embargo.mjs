// MICRO-SEG30 (E.D., 22 Nov 2026) · THE EMBARGO IN THE BUILD.
//
//   node scripts/check-embargo.mjs
//   (page part: CHR / PLAYWRIGHT_CORE as check-apertura.mjs; skipped, and said,
//    without them — EMBARGO_NO_PAGE=1 skips it on purpose)
//
//   1 · the REGISTER (src/features.ts): the EMBARGO block holds only `embargo`
//       entries, each with its sentinel `em-embargo:<id>`; no `embargo` entry
//       outside it; its texts (title, description, EN + IT) only inside
//       i18n.ts's LAB_TEXTS blocks; the experimental functions of before (the
//       site) pass through the register;
//   2 · the TWO PROFILES as modules (esbuild, with and without the define):
//       the community knows no embargo id, `featureOn` says off, the command
//       rows of an embargo function are neither drawn nor searched nor run;
//       the lab has them, off until its switch, on with it; the name
//       «EMStudio lab»;
//   3 · the GUARD (scripts/embargo-guard.mjs) on two REAL builds (vite build,
//       the project's config): the community passes, the lab is refused naming
//       every sentinel, `--expect --bundle` finds them all in the lab; one
//       sentinel slipped into a community copy is refused; a missing build is
//       refused (2);
//   4 · the WIRING: `./em.sh build --lab`, the guard in devrel / ghrelease and
//       in release.yml, the sidecar's exclusion, the Rust feature `lab`, the
//       lab's Tauri config (identifier, name, data, icon, dist-lab);
//   5 · em.app (tools/em_py.py + em_py_lab.py): `em.app.features()`; an
//       embargo API attaches only when the page lists its function as
//       `embargo` and on — never from a community page;
//   6 · the PAGE (Chromium, the two builds over file://): the community's
//       Preferences ▸ Advanced have no embargo section and say what the
//       experimental functions hold; the lab's have «Functions under
//       embargo» with the four, its switch writes the key, the title says lab.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(FE, "src");
const ROOT = path.resolve(FE, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, `${what} — got ${JSON.stringify(a)}`); checks++; };

const { embargoEntries, markers } = await import("./embargo-guard.mjs");

// ── 1 · the register ─────────────────────────────────────────────────────────
const featSrc = read("frontend/src/features.ts");
const { block, start, end, entries } = embargoEntries(featSrc);
const EMBARGO_IDS = ["functional-matrix", "functional-overlay", "landscape-matrix", "landscape-cube"];
eq(entries.map((e) => e.id), EMBARGO_IDS, "the four functions under embargo are in the register's EMBARGO block");
ok(entries.every((e) => e.state === "embargo"), "the EMBARGO block holds only `embargo` entries");
eq(entries.map((e) => e.sentinel), EMBARGO_IDS.map((id) => `em-embargo:${id}`), "each has its sentinel em-embargo:<id>");
eq((block.match(/\{\s*id:/g) ?? []).length, entries.length, "every entry of the block is read by the guard (id · state · title · sentinel)");
const outside = featSrc.slice(0, start) + featSrc.slice(end);
ok(!/state:\s*"embargo"/.test(outside.replace(/^\s*(\/\/|\*).*$/gm, "")), "no `embargo` entry outside the EMBARGO block");
ok(/id:\s*"site",\s*state:\s*"experimental"/.test(outside), "the experimental function of before (the site) passes through the register");
ok(/const EMBARGO: readonly Feature\[\] = LAB \? \[/.test(featSrc) && /export const LAB: boolean = typeof __EM_LAB__ !== "undefined" && __EM_LAB__ === true;/.test(featSrc),
  "the block is `LAB ? [ … ] : []`, LAB from the define (typeof-safe)");

// the texts: inside LAB_TEXTS only, EN and IT
const i18n = read("frontend/src/i18n.ts");
const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]);
eq(labBlocks.length, 2, "i18n.ts: two LAB_TEXTS blocks (EN, IT)");
const openI18n = i18n.replace(/\.\.\.\(LAB_TEXTS \? \{[\s\S]*?\n  \} : \{\}\),/g, "");
for (const e of entries) {
  const desc = e.title.replace(/\.title$/, ".desc");
  ok(labBlocks.every((b) => b.includes(`"${e.title}":`) && b.includes(`"${desc}":`)), `«${e.id}»: title and description in both LAB_TEXTS blocks (EN + IT)`);
  ok(!openI18n.includes(`"${e.title}"`) && !openI18n.includes(`"${desc}"`), `«${e.id}»: no text of it in the open dictionaries`);
}
ok(labBlocks.every((b) => /"settings\.embargo":/.test(b) && /"settings\.embargoOn":/.test(b)), "the embargo's section words: lab only");
ok(!/"settings\.embargo/.test(openI18n), "…and nowhere in the open dictionaries");
ok(!/under embargo until|sotto embargo fino/.test(openI18n) && !/under embargo until/.test(read("frontend/index.html")),
  "the community's words of «Experimental functions» no longer name an embargo");

// ── 2 · the two profiles as modules ─────────────────────────────────────────
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.navigator ??= { language: "en", platform: "MacIntel", userAgent: "node" };
let nth = 0;
async function load(profile, { embargo = false, experimental = false } = {}) {
  globalThis.__EM_EMBARGO__ = embargo;
  globalThis.__EM_EXPERIMENTAL__ = experimental;
  const b = await esbuild.build({
    stdin: { contents: `export * from "./features"; export * from "./command-search"; export * from "./menu-table"; export { dictionaryOf } from "./i18n";
                        export const __probe = ${JSON.stringify(`${profile} ${embargo} ${experimental} ${nth++}`)};`, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, logLevel: "silent",
    ...(profile === "none" ? {} : { define: { __EM_LAB__: profile === "lab" ? "true" : "false" } }),
  });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
}
const fill = (d) => (k, v = {}) => (d[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? `{${n}}`);
function probe(M) {
  // a command of an embargo function and one of the site, in File
  const file = M.MENUS.find((m) => m.id === "file");
  file.rows.push({ kind: "cmd", id: "seg30Embargo", label: "feat.functionalMatrix.title", button: "btn-seg30-embargo", feature: "functional-matrix" },
                 { kind: "cmd", id: "seg30Site", label: "feat.site.title", button: "btn-seg30-site", feature: "site" });
  const EN = M.dictionaryOf("en");
  const drawn = M.menuRows(file, "web", "internal").map((r) => r.id);
  const searched = M.commandEntries({ platform: "web", t: fill(EN), dicts: [(k) => EN[k]] }).map((e) => e.id);
  return {
    ids: M.FEATURES.map((f) => f.id), lab: M.LAB, name: M.APP_NAME,
    on: Object.fromEntries(["site", ...EMBARGO_IDS].map((id) => [id, M.featureOn(id)])),
    wire: M.featuresWire().map((f) => `${f.id}:${f.state}:${f.on}`),
    drawn: { embargo: drawn.includes("seg30Embargo"), site: drawn.includes("seg30Site") },
    searched: { embargo: searched.includes("seg30Embargo"), site: searched.includes("seg30Site") },
    words: { en: EN["feat.functionalMatrix.title"] ?? null, it: M.dictionaryOf("it")["feat.functionalMatrix.title"] ?? null, section: EN["settings.embargo"] ?? null },
  };
}
for (const profile of ["community", "none"]) {
  const c = probe(await load(profile, { embargo: true, experimental: true }));
  const what = profile === "none" ? "a bundle without the define (node checks, an old dev server)" : "the community";
  eq([c.ids, c.lab, c.name], [["site"], false, "EMStudio"], `${what}: the register has no embargo entry, not lab, «EMStudio»`);
  eq(Object.values(c.on).slice(1), [false, false, false, false], `${what}: every embargo function off, even with window.__EM_EMBARGO__ set`);
  ok(c.wire.every((w) => !w.includes("embargo")), `${what}: em.app.features() carries no embargo entry`);
  eq([c.drawn.embargo, c.searched.embargo], [false, false], `${what}: a command of an embargo function is neither drawn nor searched`);
  eq([c.drawn.site, c.searched.site], [true, true], `${what}: an experimental function's command with «Experimental functions» on is`);
  eq(c.words, { en: null, it: null, section: null }, `${what}: none of the embargo's words in the dictionaries`);
}
{
  const off = probe(await load("community"));
  eq([off.on.site, off.drawn.site, off.searched.site], [false, false, false], "community, «Experimental functions» off: the site off, its command absent");
  const lab = probe(await load("lab"));
  eq([lab.ids, lab.lab, lab.name], [["site", ...EMBARGO_IDS], true, "EMStudio lab"], "the lab: the four in the register, «EMStudio lab»");
  eq([Object.values(lab.on).slice(1), lab.drawn.embargo, lab.searched.embargo], [[false, false, false, false], false, false],
    "the lab with its switch off: the embargo functions off, their commands absent");
  eq(lab.words, { en: "Functional Matrix", it: "Matrix funzionale", section: "Functions under embargo" }, "the lab: their words EN + IT");
  const labOn = probe(await load("lab", { embargo: true }));
  eq([Object.values(labOn.on).slice(1), labOn.drawn.embargo, labOn.searched.embargo], [[true, true, true, true], true, true],
    "the lab with «Functions under embargo» on: on, drawn, searched");
  ok(labOn.wire.includes("functional-matrix:embargo:true"), "…and em.app.features() lists them as embargo, on");
}
{
  const ui = read("frontend/src/menu-ui.ts");
  ok(/if \(row\.feature && !featureOn\(row\.feature\)\) return false;/.test(ui), "runCommand refuses a command whose function is off (em.app.run_command, keys)");
}

// ── 3 · the guard on two real builds ────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "emstudio-embargo-"));
const require = createRequire(import.meta.url);
const { build } = await import(pathToFileURL(require.resolve("vite", { paths: [FE] })).href);
async function viteBuild(profile, outDir) {
  const before = process.env.EM_PROFILE;
  process.env.EM_PROFILE = profile;
  try {
    await build({ root: FE, configFile: path.join(FE, "vite.config.ts"), logLevel: "warn", build: { outDir, emptyOutDir: false } });
  } finally {
    if (before === undefined) delete process.env.EM_PROFILE; else process.env.EM_PROFILE = before;
  }
  return path.join(outDir, "index.html");
}
const GUARD = path.join(FE, "scripts/embargo-guard.mjs");
const guard = (...args) => spawnSync(process.execPath, [GUARD, ...args], { encoding: "utf8" });
const comm = await viteBuild("community", path.join(tmp, "community"));
const lab = await viteBuild("lab", path.join(tmp, "lab"));
let g = guard(comm);
eq(g.status, 0, `the guard passes the community build (${g.stdout.trim()})`);
g = guard(lab);
eq(g.status, 1, "the guard refuses the lab build");
for (const id of EMBARGO_IDS) ok(g.stderr.includes(`em-embargo:${id}`), `…naming the sentinel of «${id}»`);
ok(/the release stops here/.test(g.stderr) && /change its state in the register/.test(g.stderr), "…with a clear message (why, where to look, how to publish)");
g = guard("--expect", "--bundle", lab);
eq(g.status, 0, "--expect --bundle: every bundle marker is in the lab build");
g = guard("--expect", comm);
eq(g.status, 1, "--expect on the community: the markers are missing");
{
  const html = fs.readFileSync(comm, "utf8");
  for (const [i, m] of [[0, "em-embargo:landscape-cube"], [1, "feat.functionalOverlay.title"], [2, "emstudio.embargo"]]) {
    const leak = path.join(tmp, `leak-${i}`);
    fs.mkdirSync(leak);
    fs.writeFileSync(path.join(leak, "index.html"), html.replace("</body>", `<script>var x=${JSON.stringify(m)}</script></body>`));
    g = guard(leak);
    eq([g.status, g.stderr.includes(m)], [1, true], `one marker slipped into a community copy (${m}) is refused`);
  }
  // a binary: the bytes are searched as bytes (a .app is a folder)
  const app = path.join(tmp, "Fake.app/Contents/MacOS");
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, "em-bridge"), Buffer.concat([Buffer.from([0, 1, 2, 255]), Buffer.from("PYZ\0em_py_lab\0"), Buffer.from([0, 9])]));
  g = guard(path.join(tmp, "Fake.app"));
  eq([g.status, g.stderr.includes("em_py_lab")], [1, true], "a sidecar that carries em_py_lab, inside an .app folder, is refused");
  fs.writeFileSync(path.join(app, "em-bridge"), Buffer.from("\0em_net\0em_py\0"));
  eq(guard(path.join(tmp, "Fake.app")).status, 0, "…and one without it passes");
}
eq(guard(path.join(tmp, "nothing-here")).status, 2, "a build that is not there: 2 (an unchecked build is not released)");
const ms = markers();
eq(ms.length, EMBARGO_IDS.length * 2 + 4, "markers: a sentinel and a title per function, the switch's key, the section, the desktop's and the sidecar's");

// ── 4 · the wiring ───────────────────────────────────────────────────────────
const emsh = read("em.sh");
ok(/build\)\s*do_build "\$@"/.test(emsh) && /--lab\)/.test(emsh) && /do_build_lab/.test(emsh), "./em.sh build --lab");
ok(/cargo tauri build --features lab --config tauri\.lab\.conf\.json/.test(emsh), "…builds the desktop with the Rust feature lab and the lab's config");
ok(/EM_LAB=1/.test(emsh) && /embargo-guard\.mjs" --expect/.test(emsh), "…a lab sidecar, and checks the lab app has the markers");
const devrel = emsh.slice(emsh.indexOf("do_devrel() {"), emsh.indexOf("do_ghrelease() {"));
const ghrel = emsh.slice(emsh.indexOf("do_ghrelease() {"), emsh.indexOf("# ── dispatch"));
ok(/do_embargo_guard/.test(devrel) && devrel.indexOf("do_embargo_guard") < devrel.indexOf("require_clean_tree"), "devrel runs the guard among its gates, before anything is written");
ok(/do_embargo_guard/.test(ghrel) && ghrel.indexOf("do_embargo_guard") < ghrel.indexOf("set-version.mjs"), "ghrelease runs it before the version is set");
ok(/embargo-guard\)/.test(emsh), "./em.sh embargo-guard [path…] on its own");
const rel = read(".github/workflows/release.yml");
ok(/embargo-guard\.mjs/.test(rel) && /EM_PROFILE: community/.test(rel), "release.yml: the guard on the bundle (built community)");
ok(/embargo-guard\.mjs" .*bundle\/macos|embargo-guard\.mjs .*release\/bundle/.test(rel), "release.yml: the guard on the built app and the sidecar");
const bb = read("apps/desktop/build-bridge.sh");
ok(/--exclude-module em_py_lab/.test(bb) && /EM_LAB:-0/.test(bb), "build-bridge.sh: em_py_lab excluded from the community sidecar, in only with EM_LAB=1");
const cargo = read("apps/desktop/src-tauri/Cargo.toml");
ok(/\[features\]\s*\nlab = \[\]/.test(cargo), "Cargo.toml: the feature lab");
const rs = read("apps/desktop/src-tauri/src/main.rs");
ok(/#\[cfg\(feature = "lab"\)\]\s*\nconst BRIDGE_PORT_DEFAULT: u16 = 8785;/.test(rs), "main.rs: the lab's bridge port 8785 (never the community's 8765)");
ok(/#\[cfg\(feature = "lab"\)\]\s*\nconst KEYRING_SERVICE: &str = "org\.extendedmatrix\.emstudio\.lab";/.test(rs), "…its own keychain service");
ok(/emstudio-lab/.test(rs) && /EM_BRIDGE_STATE_DIR/.test(rs), "…its bridge's state in ~/.config/emstudio-lab");
ok(/#\[cfg\(feature = "lab"\)\]\s*\nconst EMBARGO_SENTINEL: &str = "em-embargo:desktop";/.test(rs) && /build_profile,/.test(rs), "…the desktop's sentinel, only with the feature");
ok(/does not update itself from the releases/.test(rs), "…and the lab refuses an update (a release is the community)");
const labConf = JSON.parse(read("apps/desktop/src-tauri/tauri.lab.conf.json"));
const conf = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));
eq([labConf.identifier, labConf.productName, labConf.app.windows[0].title, labConf.build.frontendDist],
  ["org.extendedmatrix.emstudio.lab", "EMStudio_lab", "EMStudio lab", "../../../frontend/dist-lab"], "tauri.lab.conf.json: identifier, name, title, the lab's page");
ok(labConf.identifier !== conf.identifier && !labConf.plugins["deep-link"].desktop.schemes.includes("stratigraph"), "…not the community's identifier, not the ecosystem's scheme");
ok(labConf.bundle.icon.every((p) => p.startsWith("icons-lab/") && fs.existsSync(path.join(ROOT, "apps/desktop/src-tauri", p))), "…its icons with «lab», there");
ok(/"build:lab": "tsc --noEmit && EM_PROFILE=lab vite build"/.test(read("frontend/package.json")) && /dist-lab/.test(read("frontend/vite.config.ts")), "npm run build:lab → dist-lab/");

// ── 4b · the words: the public manual and the developer guide do not name them ─
{
  const names = [];
  for (const b of labBlocks) for (const e of entries) {
    const m = b.match(new RegExp(`"${e.title.replace(/\./g, "\\.")}":\\s*"([^"]+)"`));
    if (m) names.push(m[1]);
  }
  const words = [...new Set([...names, ...EMBARGO_IDS, ...EMBARGO_IDS.map((id) => id.replace("-", " "))])];
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  ok(names.length === entries.length * 2, `the names of the four, EN + IT, read from i18n.ts (${names.length})`);
  ok(!re.test(read("docs/DEVELOPMENT.md")), "the developer guide explains the mechanism without naming them");
  const DOC = path.resolve(ROOT, "../EMStudio-doc/docs");
  if (fs.existsSync(DOC)) {
    const hits = [];
    const walk = (d) => { for (const n of fs.readdirSync(d)) { if (n === "_build") continue; const p = path.join(d, n);
      const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.(rst|po|md|txt|py)$/.test(n) && re.test(fs.readFileSync(p, "utf8"))) hits.push(p); } };
    walk(DOC);
    eq(hits, [], "the public manual (EMStudio-doc) does not name a function under embargo");
  }
}

// ── 5 · em.app ───────────────────────────────────────────────────────────────
{
  const PY = process.env.PYTHON ?? (fs.existsSync(path.join(ROOT, "../s3Dgraphy/.venv/bin/python")) ? path.join(ROOT, "../s3Dgraphy/.venv/bin/python") : "python3");
  const code = `
import sys, json, types
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, "tools"))})
import em_py, em_py_lab
@em_py_lab.lab_api("functional-matrix", "seg30_probe")
class Probe:
    def __init__(self, app): self.app = app
def app_with(features):
    run = types.SimpleNamespace(session=types.SimpleNamespace(features=features, commands=[], selection=[], lang="en"))
    return em_py.EMStudioApp(run)
out = {}
comm = app_with([{"id": "site", "state": "experimental", "on": True}])
out["features"] = comm.features()
out["site_on"] = comm.feature_on("site")
try:
    comm.seg30_probe; out["community"] = "attached"
except AttributeError:
    out["community"] = "absent"
labOff = app_with([{"id": "functional-matrix", "state": "embargo", "on": False}])
out["lab_off"] = "attached" if hasattr(labOff, "seg30_probe") else "absent"
labOn = app_with([{"id": "functional-matrix", "state": "embargo", "on": True}])
out["lab_on"] = type(getattr(labOn, "seg30_probe", None)).__name__
fake = app_with([{"id": "functional-matrix", "state": "experimental", "on": True}])
out["not_embargo"] = "attached" if hasattr(fake, "seg30_probe") else "absent"
sys.modules["em_py_lab"] = None   # the community sidecar: the module is not there
out["no_module"] = "attached" if hasattr(labOn, "seg30_probe") else "absent"
out["names"] = [n for n in ("features", "feature_on") if n in em_py._AppView(object(), labOn).names()]
print(json.dumps(out))
`;
  const r = spawnSync(PY, ["-c", code], { encoding: "utf8" });
  ok(r.status === 0, `em_py + em_py_lab load (${(r.stderr || "").trim().split("\n").pop()})`);
  const o = JSON.parse(r.stdout.trim().split("\n").pop());
  eq([o.features, o.site_on], [[{ id: "site", state: "experimental", on: true }], true], "em.app.features() / feature_on: the register as the page's build sent it");
  eq(o.community, "absent", "em.app: an embargo API never attaches for a community page (no embargo entry)");
  eq(o.lab_off, "absent", "…nor in the lab with its switch off");
  eq(o.lab_on, "Probe", "…it attaches in the lab, switch on");
  eq(o.not_embargo, "absent", "…only for a function the page lists as embargo");
  eq(o.no_module, "absent", "…and without em_py_lab (the community sidecar) nothing attaches");
  eq(o.names, ["features", "feature_on"], "the console completes em.app.features / feature_on");
  ok(/features: \(\) => featuresWire\(\)/.test(read("frontend/src/main.ts")) && /features: this\.page\.features\(\)/.test(read("frontend/src/py-session.ts")),
    "the page sends its register to the Python session");
}

// ── 6 · the page ─────────────────────────────────────────────────────────────
let pageNote = "";
if (process.env.EMBARGO_NO_PAGE === "1") pageNote = " (page part skipped: EMBARGO_NO_PAGE=1)";
else {
  let pw = null;
  for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core", path.join(ROOT, ".claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js")]) {
    if (!t) continue;
    try { const m = t.startsWith("/") ? await import(t) : require(t); pw = m.chromium ? m : m.default; break; } catch { /* next */ }
  }
  // CHR, else the newest headless shell in Playwright's cache (1243 → 1248…)
  const cache = `${process.env.HOME}/Library/Caches/ms-playwright`;
  const shells = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse() : [];
  const CHR = process.env.CHR ?? shells.map((d) => `${cache}/${d}/chrome-headless-shell-mac-arm64/chrome-headless-shell`).find((p) => fs.existsSync(p)) ?? "";
  if (!pw || !fs.existsSync(CHR)) pageNote = " (page part skipped: no playwright-core / Chromium — set PLAYWRIGHT_CORE, CHR)";
  else {
    const browser = await pw.chromium.launch({ executablePath: CHR, headless: true });
    try {
      const open = async (html, init = "") => {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e.message)));
        if (init) await page.addInitScript(init);
        await page.goto(pathToFileURL(html).href);
        await page.waitForFunction(() => !!document.getElementById("settings-modal"), null, { timeout: 30000 });
        await page.waitForTimeout(500);
        return { page, errors };
      };
      const prefs = async (page) => {
        await page.evaluate(() => document.getElementById("btn-settings")?.click());
        await page.waitForTimeout(300);
        await page.evaluate(() => document.querySelector('#settings-tabs [data-tab-target="advanced"]')?.click());
        return page.evaluate(() => ({
          shown: !document.getElementById("settings-modal").classList.contains("hidden"),
          section: !!document.getElementById("settings-sect-embargo"),
          box: !!document.getElementById("set-embargo"),
          items: [...document.querySelectorAll("#settings-sect-embargo [data-feature]")].map((li) => li.dataset.feature),
          has: document.getElementById("set-experimental-has")?.textContent ?? "",
          title: document.title,
          stored: localStorage.getItem("emstudio.embargo"),
          text: document.getElementById("settings-sect-embargo")?.textContent ?? "",
        }));
      };
      const c = await open(comm);
      const cp = await prefs(c.page);
      eq([cp.shown, cp.section, cp.box, cp.items], [true, false, false, []], "community: Preferences ▸ Advanced has no embargo section, no switch");
      ok(/The site and its footprint/.test(cp.has), `community: «Experimental functions» says what it holds, from the register («${cp.has}»)`);
      eq(cp.title, "EMStudio", "community: the title «EMStudio»");
      ok(!(await c.page.content()).includes("em-embargo:"), "community: no sentinel in the page");
      eq(c.errors, [], "community: no page error");
      await c.page.close();
      const l = await open(lab);
      const lp = await prefs(l.page);
      eq([lp.section, lp.box, lp.items], [true, true, EMBARGO_IDS], "lab: Preferences ▸ Advanced ▸ «Functions under embargo», the four listed");
      ok(/Functions under embargo/.test(lp.text) && /Functional Matrix/.test(lp.text), "lab: in words (EN)");
      eq(lp.title, "EMStudio lab", "lab: the title says lab");
      await l.page.evaluate(() => { document.getElementById("set-embargo").checked = true; document.getElementById("settings-save").click(); });
      await l.page.waitForTimeout(300);
      eq(await l.page.evaluate(() => localStorage.getItem("emstudio.embargo")), "1", "lab: the switch, saved, writes its key (read at the next start)");
      eq(l.errors, [], "lab: no page error");
      await l.page.close();
      const it = await open(lab, "localStorage.setItem('emstudio.locale','it')");
      const ip = await prefs(it.page);
      ok(/Funzioni in embargo/.test(ip.text) && /Matrix funzionale/.test(ip.text), "lab: in words (IT)");
      await it.page.close();
    } finally {
      await browser.close();
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`✓ check-embargo: ${checks} checks passed${pageNote}`);
