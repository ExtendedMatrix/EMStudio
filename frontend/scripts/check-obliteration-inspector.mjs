// MICRO-LG6 (E.D., 22 Nov 2026, 20:30) · THE SECTION «OBLITERAZIONE» OF THE
// INSPECTOR (was «Visibilità», MICRO-LG5) — normally ONE quiet line; the
// diary only when something is said; annotate, inherit, override, remove.
// EM core on the unit, NOT under embargo: the page runs as the COMMUNITY build.
//
//   node scripts/check-obliteration-inspector.mjs
//   (page part: own Vite (EM_PROFILE=community) + own bridge with the
//    s3Dgraphy of the sibling checkout; PLAYWRIGHT_CORE / CHR; skipped, and
//    said, without them. SHOTS=<dir> keeps pictures)
//
//   1 · the RULES: every text oblit.* the module uses is in EN and IT, none in
//       the LAB_TEXTS blocks, no visib.* left; the module is not in the
//       embargo's register; main.ts hands it the bridge outside any lab switch;
//   2 · the BRIDGE: level 95; POST /obliteration answers s3Dgraphy's diary —
//       EMPTY for SU001 though SU019 overlies it (no state from the
//       stratigraphy), the cover only a HINT; /visibility answers the same; 404;
//   3 · the PAGE: SU003 with nothing said → ONE line «+ Annota
//       un'obliterazione…», no section head; on «rudere» an obliteration is
//       ANNOTATED from that line (doubtful start inside «Post antiquity», end
//       1979 with scissor 1978–1979, a new document, who states it and the
//       doubts) — one property obliteration, one extractor, one document; the
//       member SU003 INHERITS it with the container's paradata in view (the
//       doubts quoted); SU019 (FILL), member of the ruin born when the
//       obliteration begins, is REACHED (MICRO-LG8: no exclusion by date) and,
//       since it overlies SU001 of the same ruin, gets the HINT «the layer that
//       obliterates is inside the unit it obliterates: remove it?» — nothing
//       corrected, the membership stays;
//       «Sovrascrivi qui…» (partly obliterated 1500–1600) wins on SU003 only;
//       «Togli» removes it; «Togli» on the container gives the empty line
//       back; the words in English; no page error.
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
const mod = read("frontend/src/obliteration-ui.ts");
const i18n = read("frontend/src/i18n.ts");
const used = new Set([...mod.matchAll(/t\(\s*"(oblit\.[\w.]+)"/g)].map((m) => m[1]));
for (const s of ["obliterated", "partially_obliterated"]) used.add(`oblit.state.${s}`);
for (const s of ["absolute", "epoch", "undated"]) used.add(`oblit.src.${s}`);
for (const s of ["functional_unit", "activity", "timebranch", "epoch"]) used.add(`oblit.kind.${s}`);
for (const s of ["outside_life", "declared_overlap", "inherited_overlap"]) used.add(`oblit.conflict.${s}`);
for (const s of ["declared_uncovered", "covered_undeclared", "obliterating_member"]) used.add(`oblit.hint.${s}`);
eq([...i18n.matchAll(/"oblit\.(notReached\.\w+|hint\.not_reached)":/g)].length, 0, "MICRO-LG8: no «not reached» text left (EN, IT)");
ok(!/\.not_reached\b|oblit\.notReached/.test(mod), "MICRO-LG8: the module no longer reads not_reached");
for (const s of ["year", "epoch", "open"]) used.add(`oblit.form.mode.${s}`);
for (const s of ["own", "inherited"]) used.add(`oblit.level.${s}`);
const en = i18n.slice(i18n.indexOf("const EN: Dict = {"), i18n.indexOf("const IT: Dict = {"));
const it = i18n.slice(i18n.indexOf("const IT: Dict = {"), i18n.indexOf("const EL: Dict = {"));
eq([...used].filter((k) => !en.includes(`"${k}":`)), [], `every text of the section (${used.size}) in EN`);
eq([...used].filter((k) => !it.includes(`"${k}":`)), [], "…and in IT");
eq((i18n.match(/"visib\./g) ?? []).length, 0, "no visib.* key left (renamed oblit.*)");
const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]).join("\n");
eq([...used].filter((k) => labBlocks.includes(`"${k}"`)), [], "…none in the LAB_TEXTS blocks (EM core, not embargoed)");
ok(!/oblit|visib/.test(read("frontend/src/features.ts")), "the section is not in the embargo's register (features.ts)");
ok(!fs.existsSync(path.join(FE, "src/visibility-ui.ts")), "visibility-ui.ts is gone");
{
  const main = read("frontend/src/main.ts");
  const at = main.indexOf("setObliterationBridgeResolver(bridgeUrl);");
  ok(at > 0 && !/LAB|FM_ON|FO_ON/.test(main.slice(main.lastIndexOf("\n", at - 2), at)), "main.ts hands the bridge to the section, outside any lab switch");
  ok(/renderObliteration\(root, store, nodeId, cb\.onJump\)/.test(read("frontend/src/inspector.ts")), "the Inspector draws the section");
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
  console.log(`check-obliteration-inspector: ${checks} checks passed (${!pw ? "no playwright-core" : `no s3Dgraphy venv at ${py}`}: the bridge and the page skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "obliteration-inspector-")));
const DOC = path.join(dir, "obliterazione.em.json");
fs.copyFileSync(path.join(FE, "testdata/obliterazione.em.json"), DOC);
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
const ask = (route, unit) => fetch(`${B}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://localhost:${PORT}` },
  body: JSON.stringify({ doc: { version: "1", graph, header: container.header }, unit }) });
{
  const h = await (await fetch(`${B}/health`)).json();
  eq(h.bridge_level, 96, "the bridge says level 96 (95 this MICRO; 96 MICRO-LG12, POST /proxy-status)");
  const res = await ask("/obliteration", "F1");
  eq(res.status, 200, `POST /obliteration answers (${berr.split("\n").slice(-3).join(" | ")})`);
  const a = await res.json();
  eq(a.diary.windows, [], "SU001, though SU019 overlies it: NO state derived from the stratigraphy (an empty diary: nothing said)");
  eq(a.hints.map((x) => [x.kind, x.by]), [["covered_undeclared", ["FILL"]]], "…the cover is only a HINT: covered by SU019, nothing annotated");
  const v = await (await ask("/visibility", "F1")).json();
  eq(v.diary.windows, [], "the old route /visibility answers the same (deprecated)");
  eq((await ask("/obliteration", "NOPE")).status, 404, "an unknown unit: 404");
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
    if (!sessionStorage.getItem("obl-probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", l);
      sessionStorage.setItem("obl-probe", "1");
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
const sect = (page, id) => page.locator(`[data-obl-sect="${id}"]`);
async function selectUnit(page, id) {
  await H(page, (x) => window.__EM_DRAG__.select(x), id);
  await sect(page, id).first().waitFor({ state: "attached", timeout: 30000 });
  await page.waitForFunction((x) => {
    const s = document.querySelector(`[data-obl-sect="${x}"]`);
    return s && (s.dataset.oblKind === "container" || (s.dataset.oblStatus === "ok" && !s.dataset.oblStale));
  }, id, { timeout: 60000 });
}
const rowsNow = (id) => [...document.querySelectorAll(`[data-obl-sect="${id}"] [data-obl-window]`)].map((r) => [
  r.dataset.state, r.dataset.from === "" ? null : Number(r.dataset.from), r.dataset.to === "" ? null : Number(r.dataset.to),
  r.dataset.level, r.dataset.origin ?? null]);
const waitRows = async (page, id, want, what) => {
  try {
    await page.waitForFunction(([x, w, f]) => JSON.stringify((new Function("id", `return (${f})(id)`))(x)) === JSON.stringify(w),
      [id, want, rowsNow.toString()], { timeout: 60000 });
  } catch { /* the eq below says what came */ }
  eq(await page.evaluate(([x, f]) => (new Function("id", `return (${f})(id)`))(x), [id, rowsNow.toString()]), want, what);
};
const isEmptyLine = (page, id) => page.evaluate((x) => {
  const s = document.querySelector(`[data-obl-sect="${x}"]`);
  return !!s && s.dataset.oblEmpty === "1" && !document.querySelector('h3[data-sect="obliteration"]');
}, id);

const r = await open("it");
const { page } = r;
// NOTHING SAID: one line, no head
await selectUnit(page, "F3");
ok(await isEmptyLine(page, "F3"), "SU003, nothing said: ONE line, no section head");
eq((await sect(page, "F3").textContent()).trim(), "+ Annota un'obliterazione…", "…«+ Annota un'obliterazione…»");
await selectUnit(page, "F1");
eq(await sect(page, "F1").getAttribute("data-obl-hints"), "1", "SU001: one hint (covered by SU019), in the title — it takes no space");
ok((await sect(page, "F1").getAttribute("title")).includes("coperta da SU019"), "…«coperta da SU019, e nessuno ha annotato un'obliterazione»");

// ANNOTATE on the container «rudere», from its empty line
await selectUnit(page, "RUIN");
ok(await isEmptyLine(page, "RUIN"), "the functional unit, nothing declared: the same one line");
await sect(page, "RUIN").locator("[data-obl-declare]").click();
const form = page.locator('[data-obl-form="RUIN"]');
await form.waitFor({ state: "attached", timeout: 10000 });
ok(await form.locator('[data-obl-f="doubtful"]').isChecked(), "…the form: the start doubtful by default (E.D.: «often doubtful»)");
await form.locator('[data-obl-f="state"]').selectOption("obliterated");
await form.locator('[data-obl-f="fromMode"]').selectOption("epoch");
await form.locator('[data-obl-f="fromEpoch"]').selectOption("EP_POST");
await form.locator('[data-obl-f="toMode"]').selectOption("year");
await form.locator('[data-obl-f="to"]').fill("1979");
await form.locator('[data-obl-f="toEarliest"]').fill("1978");
await form.locator('[data-obl-f="source"]').selectOption("__new__");
await form.locator('[data-obl-f="newSource"]').fill("Memoria E.D.");
await form.locator('[data-obl-f="note"]').fill("E.D., 22 nov 2026: inizio non noto; data del primo scavo da verificare");
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "obl-1-annota.png") });
await form.locator('[data-obl-f="ok"]').click();
await page.locator('[data-obl-sect="RUIN"] [data-obl-declared]').waitFor({ state: "attached", timeout: 20000 });
{
  const g = await docOf(page);
  const props = g.edges.filter((e) => e.edge_type === "has_property" && e.source === "RUIN").map((e) => g.nodes.find((n) => n.id === e.target));
  eq(props.map((p) => [p.name, p.data.value, p.data.valid_from_epoch, p.data.valid_from_doubtful, p.data.valid_to, p.data.valid_to_earliest]),
     [["obliteration", "obliterated", "EP_POST", true, 1979, 1978]], "ONE PropertyNode obliteration on the container: doubtful start inside the epoch, end 1979 (1978–1979)");
  const x = g.edges.find((e) => e.edge_type === "has_data_provenance" && e.source === props[0].id);
  const ex = g.nodes.find((n) => n.id === x?.target);
  ok(ex?.node_type === "extractor" && ex.description.includes("inizio non noto"), "…its extractor says who states it and the doubts");
  const src = g.edges.find((e) => e.edge_type === "extracted_from" && e.source === ex.id);
  eq(g.nodes.find((n) => n.id === src?.target)?.name, "Memoria E.D.", "…on the new document");
  ok((await page.locator('[data-obl-sect="RUIN"] [data-obl-declared]').textContent()).includes("a un certo punto di Post antiquity (dubbio)"),
     "the container lists «a un certo punto di Post antiquity (dubbio) – 1979 (fra 1978 e 1979)»");
}

// INHERITED by the members, with the paradata in view
await selectUnit(page, "F3");
await waitRows(page, "F3", [["obliterated", 200, 1979, "inherited", "RUIN"]], "SU003 inherits the obliteration of «rudere»");
{
  const row = page.locator('[data-obl-sect="F3"] [data-obl-window][data-level="inherited"]');
  const text = await row.textContent();
  ok(text.includes("ereditata da rudere") && text.includes("unità funzionale"), "…«ereditata da rudere (unità funzionale)»");
  ok(text.includes("a un certo punto di Post antiquity (dubbio)") && text.includes("fra 1978 e 1979"), "…the doubtful start, the scissor of the end");
  ok(text.includes("lo afferma") && text.includes("Memoria E.D.") && text.includes("inizio non noto"), "…the paradata in view: who, on which source, the doubts");
  eq(await row.getAttribute("data-doubtful"), "1", "…data-doubtful");
  ok(await row.evaluate((el) => el.classList.contains("insp-prov-inherited")), "…drawn as inherited (the author's orange)");
  ok((await page.locator('[data-obl-sect="F3"]').textContent()).includes("non si dice nulla"), "…«Fra una finestra e l'altra non si dice nulla.»");
  ok(await page.locator('h3[data-sect="obliteration"]').count() === 1, "…now the section has its head");
}
await selectUnit(page, "FILL");
await waitRows(page, "FILL", [["obliterated", 200, 1979, "inherited", "RUIN"]],
  "MICRO-LG8: SU019, born when the obliteration begins, is REACHED (no exclusion by date)");
eq(await page.locator('[data-obl-sect="FILL"] [data-obl-not-reached]').count(), 0, "…no «non raggiunta» line any more");
{
  const h = page.locator('[data-obl-sect="FILL"] [data-obl-hint="obliterating_member"]');
  eq(await h.count(), 1, "…the HINT: it covers a member of its own ruin while the ruin is obliterated");
  const w = await h.textContent();
  ok(w.includes("copre SU001") && w.includes("lo strato che oblitera è dentro l'unità che oblitera: toglierlo da rudere?"),
     "…«copre SU001, anch'essi membri di rudere… toglierlo da rudere?»");
  eq((await docOf(page)).edges.filter((e) => e.edge_type === "is_in_functional_unit" && e.source === "FILL").length, 1,
     "…a question, never a correction: SU019 is still a member of the ruin");
}

// OVERRIDE on SU003
await selectUnit(page, "F3");
await page.locator('[data-obl-sect="F3"] [data-obl-override]').click();
const of = page.locator('[data-obl-form="F3"]');
eq(await of.evaluate((f) => [f.dataset.oblOverriding, f.querySelector('[data-obl-f="state"]').value, f.querySelector('[data-obl-f="fromMode"]').value,
  f.querySelector('[data-obl-f="fromEpoch"]').value, f.querySelector('[data-obl-f="doubtful"]').checked, f.querySelector('[data-obl-f="to"]').value,
  f.querySelector('[data-obl-f="toEarliest"]').value]),
   ["RUIN", "obliterated", "epoch", "EP_POST", true, "1979", "1978"], "«Sovrascrivi qui…» opens the form with the inherited window");
await of.locator('[data-obl-f="state"]').selectOption("partially_obliterated");
await of.locator('[data-obl-f="fromMode"]').selectOption("year");
await of.locator('[data-obl-f="from"]').fill("1500");
await of.locator('[data-obl-f="doubtful"]').uncheck();
await of.locator('[data-obl-f="to"]').fill("1600");
await of.locator('[data-obl-f="toEarliest"]').fill("");
await of.locator('[data-obl-f="source"]').selectOption("D1");
await of.locator('[data-obl-f="note"]').fill("travel report");
await of.locator('[data-obl-f="ok"]').click();
await waitRows(page, "F3", [["obliterated", 200, 1500, "inherited", "RUIN"], ["partially_obliterated", 1500, 1600, "own", null], ["obliterated", 1600, 1979, "inherited", "RUIN"]],
  "SU003: its own window wins in 1500–1600, the inherited one around it");
if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "obl-2-sovrascrivi.png") });
await selectUnit(page, "F4");
await waitRows(page, "F4", [["obliterated", 200, 1979, "inherited", "RUIN"]], "SU004 keeps the inherited one: the override is local");

// REMOVE the own window, then the container's
await selectUnit(page, "F3");
await page.locator('[data-obl-sect="F3"] [data-obl-remove]').click();
await page.locator('[data-app-dialog="obliteration-remove"] [data-dialog-ok]').click();
await waitRows(page, "F3", [["obliterated", 200, 1979, "inherited", "RUIN"]], "«Togli»: the own window gone, the inherited one back");
await selectUnit(page, "RUIN");
await page.locator('[data-obl-sect="RUIN"] [data-obl-remove]').click();
await page.locator('[data-app-dialog="obliteration-remove"] [data-dialog-ok]').click();
await page.waitForFunction(() => document.querySelector('[data-obl-sect="RUIN"]')?.dataset.oblEmpty === "1", null, { timeout: 20000 });
await selectUnit(page, "F3");
try { await page.waitForFunction(() => document.querySelector('[data-obl-sect="F3"]')?.dataset.oblEmpty === "1", null, { timeout: 30000 }); } catch { /* said below */ }
ok(await isEmptyLine(page, "F3"), "«Togli» on the container: SU003 back to the one empty line");
eq(r.errors, [], "no page error");
await r.ctx.close();

// the words in English
{
  const e = await open("en");
  await selectUnit(e.page, "F3");
  eq((await sect(e.page, "F3").textContent()).trim(), "+ Annotate an obliteration…", "EN: «+ Annotate an obliteration…»");
  await sect(e.page, "F3").locator("[data-obl-declare]").click();
  eq((await e.page.locator('h3[data-sect="obliteration"]').first().textContent()).trim().replace(/^[▾▸]\s*/, "").replace(/\s*\?$/, ""), "Obliteration", "EN: the section's title, once the form opens");
  eq(e.errors, [], "EN: no page error");
  await e.ctx.close();
}
await browser.close();
stop();
console.log(`check-obliteration-inspector: ${checks} checks passed`);
process.exit(0);
