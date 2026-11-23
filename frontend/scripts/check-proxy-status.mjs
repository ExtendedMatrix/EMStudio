// MICRO-LG12 (E.D., 23 Nov 2026) · THE PROXY NOT DRAWN YET — the quiet line of
// the Inspector for a unit without a proxy, its form, the two scoutings, the
// Tabular's «Da disegnare». EM core, NOT under embargo: the page runs as the
// COMMUNITY build.
//
//   node scripts/check-proxy-status.mjs
//   (page part: own Vite (EM_PROFILE=community) + own bridge with the
//    s3Dgraphy of the sibling checkout, EM_LLM_PROVIDER=echo; PLAYWRIGHT_CORE /
//    CHR; skipped, and said, without them. SHOTS=<dir> keeps pictures)
//
//   1 · the RULES: every pxs.* text the module uses in EN and IT, none in the
//       LAB_TEXTS blocks; the module not in the embargo's register; main.ts
//       hands it the bridge outside any lab switch; the Inspector draws it;
//       «Da disegnare» (ToDraw) a computed view of the Tabular, named in EN,
//       IT, DE; the datamodel copies carry proxy_status;
//   2 · the BRIDGE: level 96; POST /proxy-status list (the units to draw,
//       SU001 drawn not among them), unit, scout (USD003 ← D.02, from its
//       extractor), ai with the echo provider (a valid reply, author_ai),
//       404, an unknown mode 400;
//   3 · the PAGE: SU001 (drawn) → nothing; SU005 → ONE line «Proxy non ancora
//       disegnato»; USD003: «Dichiara…» → not yet drawn + placeholder + who →
//       one property proxy_status, one extractor; «Cerca fonti» → D.02
//       proposed «dal grafo», accepted → an extractor with source_strength
//       to_verify, origin derived, the person its author; «Cerca con l'AI»
//       (echo) → proposals with the model, one discarded, the placeholder
//       accepted; a source by hand (D.01, model Survey 2015, certain); the
//       Tabular «Da disegnare» lists the units with their sources; the words
//       in English; no page error.
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
const mod = read("frontend/src/proxy-status-ui.ts");
const i18n = read("frontend/src/i18n.ts");
const used = new Set([...mod.matchAll(/t\(\s*"(pxs\.[\w.]+)"/g)].map((m) => m[1]));
for (const s of ["not_yet_drawn", "drawable", "not_drawn_by_choice", "drawn"]) used.add(`pxs.state.${s}`);
for (const s of ["certain", "probable", "to_verify"]) used.add(`pxs.strength.${s}`);
for (const s of ["loading", "off", "missing", "error"]) used.add(`pxs.list.${s}`);
for (const s of ["extractor", "footprint", "unread_footprint"]) used.add(`pxs.why.${s}`);
used.add("table.sheet.ToDraw");
used.add("table.note.ToDraw");
const en = i18n.slice(i18n.indexOf("const EN: Dict = {"), i18n.indexOf("const IT: Dict = {"));
const it = i18n.slice(i18n.indexOf("const IT: Dict = {"), i18n.indexOf("const EL: Dict = {"));
const de = i18n.slice(i18n.indexOf("const DE: Dict = {"), i18n.indexOf("const DICTS"));
ok(used.size > 50, `the module's texts found (${used.size})`);
eq([...used].filter((k) => !en.includes(`"${k}":`)), [], `every text (${used.size}) in EN`);
eq([...used].filter((k) => !it.includes(`"${k}":`)), [], "…and in IT");
ok(de.includes('"table.sheet.ToDraw":') && de.includes('"table.note.ToDraw":'), "the sheet's name also in DE (the dictionary has the sheets)");
const labBlocks = [...i18n.matchAll(/\n  \.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]).join("\n");
eq([...used].filter((k) => labBlocks.includes(`"${k}"`)), [], "…none in the LAB_TEXTS blocks (EM core, not embargoed)");
ok(!/proxy-status|pxs|ToDraw/.test(read("frontend/src/features.ts")), "not in the embargo's register (features.ts)");
ok(!/functional|landscape|FM_ON|LAB/.test(mod.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "the module reads no functional unit and no landscape");
{
  const main = read("frontend/src/main.ts");
  const at = main.indexOf("setProxyStatusBridgeResolver(bridgeUrl);");
  ok(at > 0 && !/LAB|FM_ON|FO_ON|FW_ON/.test(main.slice(main.lastIndexOf("\n", at - 2), at)), "main.ts hands the bridge to the module, outside any lab switch");
  ok(/BRIDGE_LEVEL_WANTED = 96;/.test(main), "the page wants bridge level 96");
  ok(/renderProxyStatus\(root, store, nodeId, cb\.onJump\)/.test(read("frontend/src/inspector.ts")), "the Inspector draws the section");
  ok(/COMPUTED_VIEWS: ComputedView\[\] = \[[^\]]*"ToDraw"/.test(read("frontend/src/table-views.ts")), "«Da disegnare» is a computed view of the Tabular");
  ok(/toDrawTableHtml\(store/.test(read("frontend/src/emdata.ts")), "…drawn by emdata from s3Dgraphy's answer");
}
for (const f of ["s3Dgraphy_node_datamodel.json", "em_qualia_types.json", "datamodel_translations.json"]) {
  const p = ["frontend/src/assets", "frontend/src/data", "frontend/public/data"].map((d) => path.join(d, f)).find((x) => fs.existsSync(path.join(ROOT, x)));
  if (!p) continue;
  ok(read(p).includes("proxy_status") || read(p).includes("source_strength"), `the datamodel copy ${f} carries proxy_status`);
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
  console.log(`check-proxy-status: ${checks} checks passed (${!pw ? "no playwright-core" : `no s3Dgraphy venv at ${py}`}: the bridge and the page skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "proxy-status-")));
const DOC = path.join(dir, "proxy.em.json");
fs.copyFileSync(path.join(FE, "testdata/proxy.em.json"), DOC);
const SHOTS = process.env.SHOTS ?? null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const machine = { S3DGRAPHY_CONSOLE_DIR: path.join(dir, "m/console"), S3DGRAPHY_PROFILES_DIR: path.join(dir, "m/profiles"),
  S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "m/extensions"), S3DGRAPHY_PLUGINS_DIR: path.join(dir, "m/plugins"),
  EM_VOCABULARIES_DIR: path.join(dir, "m/vocab"), EM_BRIDGE_STATE_DIR: path.join(dir, "m/state"), EM_LLM_PROVIDER: "echo" };
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
const ask = (body) => fetch(`${B}/proxy-status`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://localhost:${PORT}` },
  body: JSON.stringify({ doc: { version: "1", graph, header: container.header }, base: DOC, ...body }) });
{
  const h = await (await fetch(`${B}/health`)).json();
  eq(h.bridge_level, 96, "the bridge says level 96");
  const res = await ask({ mode: "list" });
  eq(res.status, 200, `POST /proxy-status list answers (${berr.split("\n").slice(-3).join(" | ")})`);
  const a = await res.json();
  eq(a.to_draw.units.map((u) => u.name).sort(), ["SU005", "USD003"], "the units to draw: SU005 and USD003 (SU001 is drawn: read from the graph)");
  const u = await (await ask({ mode: "unit", unit: "W1" })).json();
  eq([u.status.drawn, u.status.state], [true, "drawn"], "SU001: drawn, read from its geometry property");
  const s = await (await ask({ mode: "scout", units: ["D3"] })).json();
  ok(s.proposals.some((p) => p.unit === "D3" && p.document === "R75" && p.kind === "extractor" && p.strength === "to_verify"),
    "the deterministic scouting: USD003 ← D.02, cited by its own extractor, to verify");
  const ai = await (await ask({ mode: "ai", provider: "echo", units: ["D3"], date: "2026-11-23" })).json();
  eq([ai.ok, ai.provider], [true, "echo"], "the AI scouting through the seam (echo, no key)");
  ok(ai.proposals.length >= 1 && ai.proposals.every((p) => p.origin === "ai" && p.author_ai?.model === "echo-1"), "…its proposals carry author_ai (model, date)");
  ok(ai.placeholders.length === 1 && ai.placeholders[0].placeholder.startsWith("(echo)"), "…and a placeholder, marked echo");
  eq((await ask({ mode: "unit", unit: "NOPE" })).status, 404, "an unknown unit: 404");
  eq((await ask({ mode: "paint" })).status, 400, "an unknown mode: 400");
}

// ── 3 · the page ─────────────────────────────────────────────────────────────
const browser = await pw.chromium.launch({ executablePath: fs.existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function open(lang) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(([l]) => {
    if (!sessionStorage.getItem("pxs-probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", l);
      localStorage.setItem("emstudio.settings", JSON.stringify({ ai: { provider: "echo", model: "" } }));
      localStorage.setItem("emstudio.identities", JSON.stringify({ current: "0000-0002-1825-0097",
        known: [{ orcid: "0000-0002-1825-0097", name: "Test", surname: "Author", verified: true }] }));
      sessionStorage.setItem("pxs-probe", "1");
    }
  }, [lang]);
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
const sect = (page, id) => page.locator(`[data-pxs-sect="${id}"]`);
async function selectUnit(page, id, present = true) {
  await H(page, (x) => window.__EM_DRAG__.select(x), id);
  await page.waitForFunction((x) => [...document.querySelectorAll(".insp-provenance")].some((b) => b.dataset.provenance === x), id, { timeout: 30000 }).catch(() => {});
  if (present) await sect(page, id).first().waitFor({ state: "attached", timeout: 30000 });
}
const propsOf = (g, unit) => g.edges.filter((e) => e.source === unit && e.edge_type === "has_property")
  .map((e) => g.nodes.find((n) => n.id === e.target)).filter((p) => p && (p.data?.property_type === "proxy_status" || p.name === "proxy_status"));
// the extractors of a property, directly or through its combiner
const extractorsOf = (g, pid) => g.edges.filter((e) => e.source === pid && e.edge_type === "has_data_provenance")
  .map((e) => g.nodes.find((n) => n.id === e.target)).filter(Boolean)
  .flatMap((n) => (n.node_type === "combiner" ? g.edges.filter((e) => e.source === n.id && e.edge_type === "combines")
    .map((e) => g.nodes.find((x) => x.id === e.target)).filter(Boolean) : [n]));

const r = await open("it");
const { page } = r;
// a drawn unit: nothing
await selectUnit(page, "W1", false);
await page.waitForTimeout(300);
eq(await sect(page, "W1").count(), 0, "SU001 has its proxy: no line at all");
// a unit without a proxy, nothing said: ONE line
await selectUnit(page, "S5");
eq((await sect(page, "S5").locator(".insp-pxs-label").textContent()).trim(), "Proxy non ancora disegnato", "SU005 (a real US) without a proxy: ONE line «Proxy non ancora disegnato»");
eq(await sect(page, "S5").locator("[data-pxs-form], [data-pxs-scout]").count(), 0, "…no form, no scouting box until asked");

// DECLARE on USD003
await selectUnit(page, "D3");
await sect(page, "D3").locator("[data-pxs-declare]").click();
const form = page.locator('[data-pxs-form="D3"]');
await form.waitFor({ state: "attached", timeout: 10000 });
await form.locator('[data-pxs-f="state"]').selectOption("not_yet_drawn");
await form.locator('[data-pxs-f="placeholder"]').fill("rete di canali larghi circa 40 cm, con pezzi architettonici murati");
await form.locator('[data-pxs-f="note"]').fill("E.D., 23 nov 2026: la documentazione non basta");
await form.locator('[data-pxs-f="ok"]').click();
{
  const g = await docOf(page);
  const ps = propsOf(g, "D3");
  eq(ps.length, 1, "«Salva»: ONE property proxy_status on USD003");
  eq([ps[0].data.value, ps[0].data.placeholder], ["not_yet_drawn", "rete di canali larghi circa 40 cm, con pezzi architettonici murati"], "…its state and its placeholder");
  const xs = extractorsOf(g, ps[0].id);
  eq(xs.map((x) => x.description), ["E.D., 23 nov 2026: la documentazione non basta"], "…one extractor: who states it");
  ok(g.edges.some((e) => e.source === xs[0].id && e.edge_type === "has_author" && e.target === "ED"), "…its author the current identity");
}
await page.waitForFunction(() => document.querySelector('[data-pxs-sect="D3"]')?.dataset.pxsState === "not_yet_drawn", null, { timeout: 10000 });
eq((await sect(page, "D3").locator("[data-pxs-placeholder]").textContent()).trim(), "rete di canali larghi circa 40 cm, con pezzi architettonici murati", "the placeholder in view");

// the DETERMINISTIC scouting (its buttons inside the opened form: the line stays quiet)
ok(await page.locator('[data-pxs-form="D3"]').count() === 0, "«Salva» closes the form");
await sect(page, "D3").locator("[data-pxs-declare]").click();
await sect(page, "D3").locator('[data-pxs-scout="scout"]').click();
try {
  await page.waitForFunction(() => !!document.querySelector('[data-pxs-sect="D3"] [data-pxs-proposal][data-pxs-origin="derived"]'), null, { timeout: 30000 });
} catch (e) {
  console.error("scout box:", await page.evaluate(() => { const b = document.querySelector('[data-pxs-sect="D3"] .insp-pxs-scout'); return b ? `${b.dataset.pxsScout} | ${b.textContent}` : "none"; }));
  throw e;
}
const det = page.locator('[data-pxs-sect="D3"] [data-pxs-proposal][data-pxs-kind="extractor"]').first();
ok((await det.textContent()).includes("D.02"), "«Cerca fonti»: D.02 proposed, from the graph");
ok((await det.textContent()).includes("chi l'ha descritta può averla disegnata"), "…its reason in the interface's words (IT)");
{ const g0 = await docOf(page); eq(propsOf(g0, "D3").flatMap((p) => extractorsOf(g0, p.id)).filter((x) => x.data?.source_strength).length, 0, "…nothing written before accepting"); }
await det.locator("[data-pxs-accept]").click();
{
  const g = await docOf(page);
  const src = extractorsOf(g, propsOf(g, "D3")[0].id).filter((x) => x.data?.source_strength);
  eq(src.map((x) => [x.data.source_strength, x.data.origin]), [["to_verify", "derived"]], "accepted: one candidate source, to verify, origin derived");
  ok(g.edges.some((e) => e.source === src[0].id && e.edge_type === "extracted_from" && e.target === "R75"), "…extracted_from D.02");
  ok(g.edges.some((e) => e.source === src[0].id && e.edge_type === "has_author" && e.target === "ED"), "…the person who accepted it its author");
}
// the AI scouting (echo)
await sect(page, "D3").locator('[data-pxs-scout="ai"]').click();
try {
  await page.waitForFunction(() => !!document.querySelector('[data-pxs-sect="D3"] [data-pxs-proposal][data-pxs-kind="placeholder"]'), null, { timeout: 30000 });
} catch (e) {
  console.error("ai box:", await page.evaluate(() => { const b = document.querySelector('[data-pxs-sect="D3"] .insp-pxs-scout'); return b ? `${b.dataset.pxsScout} | ${b.textContent}` : "none"; }));
  throw e;
}
const aiRows = page.locator('[data-pxs-sect="D3"] [data-pxs-proposal][data-pxs-origin="ai"]');
ok((await aiRows.count()) >= 1, "«Cerca con l'AI»: proposals of the AI (echo)");
ok((await aiRows.first().textContent()).includes("echo-1"), "…with the model in view");
// discard the AI source proposals (D.02 is already a source: not proposed again), accept its placeholder
for (const k of await page.locator('[data-pxs-sect="D3"] [data-pxs-proposal][data-pxs-origin="ai"]:not([data-pxs-kind="placeholder"]) [data-pxs-discard]').all()) await k.click();
await page.locator('[data-pxs-sect="D3"] [data-pxs-proposal][data-pxs-kind="placeholder"] [data-pxs-accept]').click();
{
  const g = await docOf(page);
  const p = propsOf(g, "D3")[0];
  ok(String(p.data.placeholder).startsWith("(echo)"), "the AI placeholder accepted: it replaces the text");
  eq(p.data.value, "not_yet_drawn", "…the state stays the declared one");
  ok(extractorsOf(g, p.id).some((x) => /AI \(echo-1\)|AI.*echo-1|dall'AI \(echo-1\)/.test(String(x.description))), "…an extractor says it came from the AI and who accepted it");
}
// a source by hand
if (!(await page.locator('[data-pxs-form="D3"]').count())) await sect(page, "D3").locator("[data-pxs-declare]").click();
await page.locator('[data-pxs-form="D3"]').waitFor({ state: "attached", timeout: 10000 });
await page.locator('[data-pxs-form="D3"] [data-pxs-f="srcDocument"]').selectOption("D01");
await page.locator('[data-pxs-form="D3"] [data-pxs-f="srcModel"]').selectOption("RM15");
await page.locator('[data-pxs-form="D3"] [data-pxs-f="srcStrength"]').selectOption("certain");
await page.locator('[data-pxs-form="D3"] [data-pxs-f="srcNote"]').fill("i canali affiorano nel settore est");
await page.locator('[data-pxs-form="D3"] [data-pxs-f="addSource"]').click();
{
  const g = await docOf(page);
  const src = extractorsOf(g, propsOf(g, "D3")[0].id).filter((x) => x.data?.source_strength);
  ok(src.some((x) => x.data.source_strength === "certain" && x.data.source_model === "RM15" && x.description === "i canali affiorano nel settore est"),
    "a source by hand: D.01, the model Survey 2015, certain, its note");
}
await page.waitForFunction(() => document.querySelector('[data-pxs-sect="D3"]')?.dataset.pxsSources === "2", null, { timeout: 10000 });
eq(await page.locator('[data-pxs-sect="D3"] [data-pxs-source]').count(), 2, "two candidate sources in view");
if (SHOTS) { await page.waitForTimeout(800); await sect(page, "D3").screenshot({ path: path.join(SHOTS, "pxs-1-inspector.png") }).catch(() => {}); }

// the Tabular «Da disegnare»: a table window (one made beside the graph when the layout has none)
const tableWin = await H(page, () => {
  const D = window.__EM_DRAG__;
  let w = D.wins().find((x) => x.type === "table");
  if (!w) {
    const g = D.wins().find((x) => x.type === "graph") ?? D.wins()[0];
    const id = D.splitDoc(g.id);
    if (!id) return null;
    D.retype(id, "table");
    w = { id };
  }
  D.setSheet(w.id, "ToDraw");
  return w.id;
});
ok(!!tableWin, "a Tabular window on «Da disegnare»");
try {
  await page.waitForFunction(() => document.querySelector('[data-pxs-list="ok"]'), null, { timeout: 30000 });
  const rows = await page.evaluate(() => [...document.querySelectorAll("[data-pxs-row]")].map((r) => [r.dataset.pxsRow, r.dataset.pxsState, Number(r.dataset.pxsWeight)]));
  eq(rows, [["USD003", "not_yet_drawn", 4], ["SU005", "", 0]], "«Da disegnare»: USD003 first (its sources weigh 3+1), SU005 after");
  ok((await page.locator('[data-pxs-row="USD003"]').textContent()).includes("D.01"), "…with its sources in the row");
  if (SHOTS) { await page.waitForTimeout(800); await page.locator('[data-pxs-list="ok"]').screenshot({ path: path.join(SHOTS, "pxs-2-da-disegnare.png") }).catch(() => {}); }
} catch (e) { ok(false, `the Tabular «Da disegnare»: ${String(e).slice(0, 300)}`); }
eq(r.errors, [], "no page error");
await r.ctx.close();

// the words in English
{
  const e = await open("en");
  await selectUnit(e.page, "S5");
  eq((await sect(e.page, "S5").locator(".insp-pxs-label").textContent()).trim(), "Proxy not drawn yet", "EN: «Proxy not drawn yet»");
  eq(e.errors, [], "EN: no page error");
  await e.ctx.close();
}
await browser.close();
stop();
console.log(`check-proxy-status: ${checks} checks passed`);
process.exit(0);
