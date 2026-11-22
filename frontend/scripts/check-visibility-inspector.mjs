// MICRO-LG5 (E.D., 22 Nov 2026) · THE SECTION «VISIBILITÀ» OF THE INSPECTOR —
// the diary of a unit, own · inherited · derived; declare, inherit, override.
// EM core, NOT under embargo: the page runs as the COMMUNITY build.
//
//   node scripts/check-visibility-inspector.mjs
//   (page part: own Vite (EM_PROFILE=community) + own bridge with the
//    s3Dgraphy of the sibling checkout; PLAYWRIGHT_CORE / CHR; skipped, and
//    said, without them. SHOTS=<dir> keeps pictures)
//
//   1 · the RULES: every text visib.* the module uses is in EN and IT, none in
//       the LAB_TEXTS blocks; the module is not in the embargo's register;
//       main.ts hands it the bridge outside any lab switch;
//   2 · the BRIDGE: POST /visibility answers s3Dgraphy's diary (derived from
//       overlies, never from is_after);
//   3 · the PAGE: on the functional unit «rudere» a window is DECLARED (buried
//       from the start of «Post antiquity» to 1979, scissor 1978–1979, a new
//       document as source, the note as extractor) — one property, one
//       extractor, one document written; its member SU003 shows it INHERITED
//       «ereditata da rudere» with the container's paradata; «Sovrascrivi
//       qui…» declares a window of SU003's own (partly in view 1500–1600)
//       that wins on SU003 only (SU004 keeps the inherited one); «Togli»
//       removes it; the derived window of SU001 says «coperta da SU019»; the
//       words in English too; no page error.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const FE = new URL("..", import.meta.url).pathname;
const ROOT = path.resolve(FE, "..");
let checks = 0;
const trace = process.env.CHECK_TRACE ? (w) => console.error(`· ${w}`) : () => {};
const ok = (c, what) => { assert.ok(c, what); checks++; trace(what); };
const eq = (a, b, what) => { assert.deepEqual(a, b, `${what} — got ${JSON.stringify(a)}`); checks++; trace(what); };
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── 1 · the rules ────────────────────────────────────────────────────────────
const mod = read("frontend/src/visibility-ui.ts");
const i18n = read("frontend/src/i18n.ts");
const used = new Set([...mod.matchAll(/t\(\s*"(visib\.[\w.]+)"/g)].map((m) => m[1]));
for (const s of ["exposed", "buried", "partially_exposed"]) used.add(`visib.state.${s}`);
for (const s of ["absolute", "epoch", "undated", "derived"]) used.add(`visib.src.${s}`);
for (const s of ["functional_unit", "activity", "timebranch", "epoch"]) used.add(`visib.kind.${s}`);
for (const s of ["stratigraphy", "outside_life", "declared_overlap", "inherited_overlap"]) used.add(`visib.conflict.${s}`);
for (const s of ["no_relations", "undated"]) used.add(`visib.status.${s}`);
for (const s of ["year", "epoch", "open"]) used.add(`visib.form.mode.${s}`);
for (const s of ["own", "inherited", "derived"]) used.add(`visib.level.${s}`);
const en = i18n.slice(i18n.indexOf("const EN: Dict = {"), i18n.indexOf("const IT: Dict = {"));
const it = i18n.slice(i18n.indexOf("const IT: Dict = {"), i18n.indexOf("const EL: Dict = {"));
eq([...used].filter((k) => !en.includes(`"${k}":`)), [], `every text of the section (${used.size}) in EN`);
eq([...used].filter((k) => !it.includes(`"${k}":`)), [], "…and in IT");
const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]).join("\n");
eq([...used].filter((k) => labBlocks.includes(`"${k}"`)), [], "…none in the LAB_TEXTS blocks (EM core, not embargoed)");
ok(!/visib/.test(read("frontend/src/features.ts")), "the section is not in the embargo's register (features.ts)");
{
  const main = read("frontend/src/main.ts");
  const at = main.indexOf("setVisibilityBridgeResolver(bridgeUrl);");
  ok(at > 0 && !/LAB|FM_ON|FO_ON/.test(main.slice(main.lastIndexOf("\n", at - 2), at)), "main.ts hands the bridge to the section, outside any lab switch");
  ok(/renderVisibility\(root, store, nodeId, cb\.onJump\)/.test(read("frontend/src/inspector.ts")), "the Inspector draws the section");
}

// ── 2 · 3 · the bridge and the page ─────────────────────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
let pw = null;
for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
  path.join(ROOT, ".claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js")]) {
  if (!t) continue;
  try { const m = await import(t); pw = m.chromium ? m : m.default; break; } catch { /* next */ }
}
if (!fs.existsSync(py) || !pw) {
  console.log(`check-visibility-inspector: ${checks} checks passed (${!pw ? "no playwright-core" : `no s3Dgraphy venv at ${py}`}: the bridge and the page skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "visibility-inspector-")));
const DOC = path.join(dir, "visibilita.em.json");
fs.copyFileSync(path.join(FE, "testdata/visibilita.em.json"), DOC);
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
    { cwd: FE, stdio: "ignore", env: { ...process.env, EM_PROFILE: "community" } });
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
const container = JSON.parse(fs.readFileSync(DOC, "utf8"));
const graph = container.graphs[container.active_graph_id];
{
  const h = await (await fetch(`${B}/health`)).json();
  eq(h.bridge_level, 94, "the bridge says level 94");
  const res = await fetch(`${B}/visibility`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://localhost:${PORT}` },
    body: JSON.stringify({ doc: { version: "1", graph, header: container.header }, unit: "F1" }) });
  eq(res.status, 200, `POST /visibility answers (${berr.split("\n").slice(-3).join(" | ")})`);
  const a = await res.json();
  eq(a.diary.windows.map((w) => [w.state, w.start, w.end, w.level, w.by]),
     [["exposed", 100, 200, "derived", []], ["buried", 200, null, "derived", ["FILL"]]], "SU001: in view, then buried by SU019 (overlies)");
  const b = await (await fetch(`${B}/visibility`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc: { version: "1", graph, header: container.header }, unit: "F3" }) })).json();
  eq([b.diary.status, b.diary.windows.length], ["no_relations", 0], "SU003, only is_after its elevation: no stratigraphic relation, nothing derived");
  const c = await fetch(`${B}/visibility`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc: { version: "1", graph, header: container.header }, unit: "NOPE" }) });
  eq(c.status, 404, "an unknown unit: 404");
}

// ── 3 · the page ─────────────────────────────────────────────────────────────
const browser = await pw.chromium.launch({ executablePath: fs.existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function open(lang) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript((l) => {
    if (!sessionStorage.getItem("vis-probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", l);
      sessionStorage.setItem("vis-probe", "1");
    }
  }, lang);
  await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(B)}`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 120000 });
  await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [container, DOC]);
  await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 5, null, { timeout: 120000 });
  return { ctx, page, errors };
}
const H = (page, fn, arg) => page.evaluate(fn, arg);
const docOf = async (page) => {
  const d = JSON.parse(await H(page, () => window.__EM_DRAG__.docJson()));
  return d.graph ?? d.graphs[d.active_graph_id];
};
const sect = (page, id) => page.locator(`.insp-visibility[data-vis-sect="${id}"]`);
async function selectUnit(page, id) {
  await H(page, (x) => window.__EM_DRAG__.select(x), id);
  await sect(page, id).waitFor({ state: "attached", timeout: 30000 });
  await page.waitForFunction((x) => {
    const s = document.querySelector(`.insp-visibility[data-vis-sect="${x}"]`);
    return s && (s.dataset.visKind === "container" || (s.dataset.visStatus === "ok" && !s.dataset.visStale));
  }, id, { timeout: 60000 });
}
const rows = (page, id) => sect(page, id).locator("[data-vis-window]").evaluateAll((rs) => rs.map((r) => [
  r.dataset.state, r.dataset.from === "" ? null : Number(r.dataset.from), r.dataset.to === "" ? null : Number(r.dataset.to),
  r.dataset.level, r.dataset.origin ?? null]));
const waitRows = async (page, id, want, what) => {
  try {
    await page.waitForFunction(([x, w]) => {
      const rs = [...document.querySelectorAll(`.insp-visibility[data-vis-sect="${x}"] [data-vis-window]`)].map((r) => [
        r.dataset.state, r.dataset.from === "" ? null : Number(r.dataset.from), r.dataset.to === "" ? null : Number(r.dataset.to),
        r.dataset.level, r.dataset.origin ?? null]);
      return JSON.stringify(rs) === JSON.stringify(w);
    }, [id, want], { timeout: 60000 });
  } catch { /* the eq below says what came */ }
  eq(await rows(page, id), want, what);
};

const r = await open("it");
const { page } = r;
// the derived window, with the unit that covers
await selectUnit(page, "F1");
await waitRows(page, "F1", [["exposed", 100, 200, "derived", null], ["buried", 200, null, "derived", null]],
  "SU001: the diary derived from the stratigraphy");
ok((await sect(page, "F1").locator('[data-vis-window][data-state="buried"]').textContent()).includes("coperta da SU019"),
   "…the buried window says «coperta da SU019»");
eq((await page.locator('h3[data-sect="visibility"]').first().textContent()).trim().replace(/^[▾▸]\s*/, "").replace(/\s*\?$/, ""), "Visibilità", "the section's title, in Italian");
await selectUnit(page, "F3");
ok((await sect(page, "F3").textContent()).includes("is_after non conta"), "SU003: «Nessun rapporto stratigrafico (is_after non conta)»");
eq(await rows(page, "F3"), [], "…and no window");

// DECLARE on the container «rudere»
await selectUnit(page, "RUIN");
ok((await sect(page, "RUIN").textContent()).includes("arriva ai membri (3)"), "the functional unit: a window declared here reaches its 3 members");
await sect(page, "RUIN").locator("[data-vis-declare]").click();
const form = sect(page, "RUIN").locator("[data-vis-form]");
await form.locator('[data-vis-f="state"]').selectOption("buried");
await form.locator('[data-vis-f="fromMode"]').selectOption("epoch");
await form.locator('[data-vis-f="fromEpoch"]').selectOption("EP_POST");
await form.locator('[data-vis-f="toMode"]').selectOption("year");
await form.locator('[data-vis-f="to"]').fill("1979");
await form.locator('[data-vis-f="toEarliest"]').fill("1978");
await form.locator('[data-vis-f="source"]').selectOption("__new__");
await form.locator('[data-vis-f="newSource"]').fill("Memoria E.D.");
await form.locator('[data-vis-f="note"]').fill("E.D., 22 nov 2026: da verificare la data del primo scavo");
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "vis-1-dichiara.png") });
await form.locator('[data-vis-f="ok"]').click();
await sect(page, "RUIN").locator("[data-vis-declared]").waitFor({ state: "attached", timeout: 20000 });
{
  const g = await docOf(page);
  const props = g.edges.filter((e) => e.edge_type === "has_property" && e.source === "RUIN").map((e) => g.nodes.find((n) => n.id === e.target));
  eq(props.map((p) => [p.name, p.data.value, p.data.valid_from_epoch, p.data.valid_to, p.data.valid_to_earliest]),
     [["visibility", "buried", "EP_POST", 1979, 1978]], "ONE PropertyNode visibility on the container, the start anchored to the epoch, the end 1979 (1978–1979)");
  const x = g.edges.find((e) => e.edge_type === "has_data_provenance" && e.source === props[0].id);
  const ex = g.nodes.find((n) => n.id === x?.target);
  ok(ex?.node_type === "extractor" && ex.description.startsWith("E.D., 22 nov 2026"), "…its extractor says who states it");
  const src = g.edges.find((e) => e.edge_type === "extracted_from" && e.source === ex.id);
  eq(g.nodes.find((n) => n.id === src?.target)?.name, "Memoria E.D.", "…on the new document");
  ok((await sect(page, "RUIN").locator("[data-vis-declared]").textContent()).includes("inizio di Post antiquity"), "the container lists its window «inizio di Post antiquity – 1979 (fra 1978 e 1979)»");
}

// INHERITED by the members
await selectUnit(page, "F3");
await waitRows(page, "F3", [["buried", 200, 1979, "inherited", "RUIN"]], "SU003 inherits the window of «rudere»");
{
  const row = sect(page, "F3").locator('[data-vis-window][data-level="inherited"]');
  const text = await row.textContent();
  ok(text.includes("ereditata da rudere") && text.includes("unità funzionale"), "…«ereditata da rudere (unità funzionale)»");
  ok(text.includes("fra 1978 e 1979"), "…the scissor of its end");
  ok(text.includes("lo afferma") && text.includes("Memoria E.D."), "…and the container's paradata: who states it, on which source");
  ok(await row.evaluate((el) => el.classList.contains("insp-prov-inherited")), "…drawn as inherited (the author's orange)");
}
await selectUnit(page, "F1");
await waitRows(page, "F1", [["exposed", 100, 200, "derived", null], ["buried", 200, null, "inherited", "RUIN"]],
  "SU001: the inherited window over the derived one, the same state: merged (nearest container > stratigraphy)");
{
  const row = sect(page, "F1").locator('[data-vis-window][data-state="buried"]');
  eq(await row.getAttribute("data-levels"), "inherited derived", "…its pieces: inherited and derived");
  ok((await row.textContent()).includes("fusa con: derivata dalla stratigrafia"), "…«fusa con: derivata dalla stratigrafia»");
}

// OVERRIDE on SU003
await selectUnit(page, "F3");
await sect(page, "F3").locator("[data-vis-override]").click();
const of = sect(page, "F3").locator("[data-vis-form]");
eq(await of.evaluate((f) => [f.dataset.visOverriding, f.querySelector('[data-vis-f="state"]').value, f.querySelector('[data-vis-f="fromMode"]').value,
  f.querySelector('[data-vis-f="fromEpoch"]').value, f.querySelector('[data-vis-f="to"]').value, f.querySelector('[data-vis-f="toEarliest"]').value]),
   ["RUIN", "buried", "epoch", "EP_POST", "1979", "1978"], "«Sovrascrivi qui…» opens the form with the inherited window");
await of.locator('[data-vis-f="state"]').selectOption("partially_exposed");
await of.locator('[data-vis-f="fromMode"]').selectOption("year");
await of.locator('[data-vis-f="from"]').fill("1500");
await of.locator('[data-vis-f="to"]').fill("1600");
await of.locator('[data-vis-f="toEarliest"]').fill("");
await of.locator('[data-vis-f="source"]').selectOption("D1");
await of.locator('[data-vis-f="note"]').fill("travel report");
await of.locator('[data-vis-f="ok"]').click();
await waitRows(page, "F3", [["buried", 200, 1500, "inherited", "RUIN"], ["partially_exposed", 1500, 1600, "own", null], ["buried", 1600, 1979, "inherited", "RUIN"]],
  "SU003: its own window wins in 1500–1600, the inherited one around it");
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "vis-2-sovrascrivi.png") });
await selectUnit(page, "F4");
await waitRows(page, "F4", [["buried", 200, 1979, "inherited", "RUIN"]], "SU004 keeps the inherited one: the override is local");

// REMOVE the own window
await selectUnit(page, "F3");
await sect(page, "F3").locator("[data-vis-remove]").click();
await page.locator('[data-app-dialog="visibility-remove"] [data-dialog-ok]').click();
await waitRows(page, "F3", [["buried", 200, 1979, "inherited", "RUIN"]], "«Togli»: the own window gone, the inherited one back");
eq(r.errors, [], "no page error");
await r.ctx.close();

// the words in English
{
  const e = await open("en");
  await selectUnit(e.page, "F1");
  eq((await e.page.locator('h3[data-sect="visibility"]').first().textContent()).trim().replace(/^[▾▸]\s*/, "").replace(/\s*\?$/, ""), "Visibility", "EN: the section's title");
  ok((await sect(e.page, "F1").locator('[data-vis-window][data-state="buried"]').textContent()).includes("covered by SU019"), "EN: «covered by SU019»");
  eq(e.errors, [], "EN: no page error");
  await e.ctx.close();
}
await browser.close();
stop();
console.log(`check-visibility-inspector: ${checks} checks passed`);
process.exit(0);
