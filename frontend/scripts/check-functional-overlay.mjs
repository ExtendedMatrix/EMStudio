// MICRO-MF02 (E.D., 22 Nov 2026) · THE FUNCTIONAL OVERLAY ON THE MATRIX —
// under embargo (features.ts: functional-overlay), the lab build only.
//
//   node scripts/check-functional-overlay.mjs
//   (page part: own Vite + own bridge, as check-functional-matrix.mjs;
//    PLAYWRIGHT_CORE / CHR; skipped, and said, without them. FU_PROVA=<the
//    Templu Mare test copy> adds the real case and prints the measure of §C;
//    SHOTS=<dir> keeps pictures)
//
//   1 · the RULES of the embargo: FO_ON = LAB && featureOn("functional-overlay"),
//       every use of functional-overlay.ts in main.ts behind it, the texts
//       fo.* (EN + IT) only in the LAB_TEXTS blocks, the renderer's pass with
//       no text of its own;
//   2 · the GEOMETRY (node, functional-overlay.ts on a synthetic scene and
//       plan): every unit in its own lane, the lanes untouched; the members of
//       one unit together; the shared unit on the border, the two braces
//       overlapping only there; an instance inside its braces, «↑epoch»; the
//       activities gone; the units of no functional unit after the braces;
//   3 · the BRIDGE: the answer carries s3Dgraphy's overlay_plan;
//   4 · the PAGE (lab dev server, the embargo's switch on): the switch in the
//       Matrix's header, the view by activity off and said, the braces drawn,
//       a press moves nothing, a click on a brace selects its unit, off again
//       = the Matrix by activity; with the embargo off no switch;
//   5 · the REAL case (FU_PROVA): Templu Mare, SU003/USV102 on the border
//       between portico and courtyard, the foundations as instances between
//       epochs in the ruin, the measure of §C.
//   6 · MICRO-MF06: the view by activity off AT ONCE (the page decides it,
//       not the plan): no activity box while the bridge thinks, with a bridge
//       that cannot compute it, with a graph with no functional unit; such a
//       graph says «Nessuna unità funzionale in questo grafo» in the area with
//       its three ways in (Read as…, the workspace, the proof file beside).
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
ok(/const FO_ON = LAB && featureOn\("functional-overlay"\);/.test(main), "main.ts: FO_ON = LAB && featureOn(\"functional-overlay\")");
{
  const imp = /import \{([^}]+)\} from "\.\/functional-overlay";/.exec(main);
  ok(!!imp, "main.ts imports functional-overlay.ts once");
  const names = imp[1].split(",").map((s) => s.trim().replace(/^type /, "")).filter(Boolean);
  const lines = main.replace(imp[0], "").split("\n");
  const bad = [];
  for (const n of names) lines.forEach((l, i) => {
    if (!new RegExp(`\\b${n}\\b`).test(l)) return;
    if (!/FO_ON/.test(lines.slice(Math.max(0, i - 16), i + 1).join("\n"))) bad.push(`${n} @${i + 1}`);
  });
  eq(bad, [], "every use of functional-overlay.ts in main.ts sits behind FO_ON");
}
const i18n = read("frontend/src/i18n.ts");
const labBlocks = [...i18n.matchAll(/\.\.\.\(LAB_TEXTS \? \{([\s\S]*?)\n  \} : \{\}\),/g)].map((m) => m[1]);
const openI18n = i18n.replace(/\.\.\.\(LAB_TEXTS \? \{[\s\S]*?\n  \} : \{\}\),/g, "");
const foKeys = new Set([...main.matchAll(/"(fo\.[\w.]+)"/g)].map((m) => m[1]));
for (const k of ["fo.btn", "fo.btnTitle", "fo.btnTitleOn", "fo.activitiesOff", "fo.activitiesOffTitle", "fo.activitiesOffShort", "fo.onToast", "fo.noBridge", "fo.border"]) foKeys.add(k);
eq(labBlocks.length, 2, "two LAB_TEXTS blocks (EN, IT)");
eq([...foKeys].filter((k) => !labBlocks.every((b) => b.includes(`"${k}":`))), [], `every text of the overlay (${foKeys.size}) in both LAB_TEXTS blocks (EN + IT)`);
eq([...foKeys].filter((k) => openI18n.includes(`"${k}"`)), [], "…and none in the open dictionaries");
ok(/"feat\.functionalOverlay\.title": "Sovrimpressione funzionale"/.test(labBlocks[1]), "IT: the register's title is «Sovrimpressione funzionale»");
{
  const r = read("frontend/src/renderer.ts");
  const pass = r.slice(r.indexOf("function drawFunctionalBraces"));
  ok(pass.length > 100 && !/\bt\(/.test(pass) && !/"[A-Za-zÀ-ÿ ]{12,}"/.test(pass), "the renderer's pass has no text of its own (the words come from the page)");
  ok(!/from "\.\/functional-(matrix|overlay)"/.test(r.replace(/import type[^;]+;/g, "")), "the renderer imports no module of the embargo (types only)");
}

// ── 2 · the geometry ─────────────────────────────────────────────────────────
async function load(file) {
  const b = await esbuild.build({ entryPoints: [path.join(SRC, file)], bundle: true, format: "esm", write: false, logLevel: "silent",
    define: { __EM_LAB__: "true" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
}
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const FO = await load("functional-overlay.ts");
const inside = (p, r, m = 0) => p.x >= r.x - m && p.x + p.w <= r.x + r.w + m && p.y >= r.y - m && p.y + p.h <= r.y + r.h + m;
const centreIn = (n, l) => n.y + n.h / 2 >= l.y && n.y + n.h / 2 <= l.y + l.height;
{
  const lanes = [{ id: "L2", label: "Medievale", y: 0, height: 160 }, { id: "L1", label: "Romana", y: 160, height: 160 }];
  const mk = (id, type, lane, x) => ({ id, x, y: lanes.find((l) => l.id === lane).y + 60, w: 90, h: 32, node: { id, node_type: type, name: id } });
  const nodes = [
    mk("a1", "US", "L2", 0), mk("a2", "US", "L2", 100), mk("s1", "US", "L2", 200), mk("b1", "USVs", "L2", 300),
    mk("r1", "US", "L2", 400), mk("old", "US", "L1", 0), mk("ACT", "ActivityNodeGroup", "L2", -20), mk("DOC", "document", "L2", 500),
  ];
  const base = { nodes, byId: new Map(nodes.map((n) => [n.id, n])), lanes,
    edges: [{ source: "a1", target: "a2", edge: { edge_type: "is_after" } }, { source: "a1", target: "ACT", edge: { edge_type: "is_in_activity" } }],
    groups: [{ id: "ACT", x: -30, y: 30, w: 600, h: 100 }], groupsById: new Map([["ACT", { id: "ACT" }]]) };
  const answer = {
    lanes: [{ id: "L2", name: "Medievale" }, { id: "L1", name: "Romana" }],
    units: [{ id: "A", name: "portico", scale: "room", evidence: "stratigraphic", members: [] },
            { id: "B", name: "cortile", scale: "room", evidence: "reconstructive", members: [] }],
    overlay: {
      lanes: [{ lane: "L2", slots: [{ kind: "own", unit: "A" }, { kind: "border", units: ["A", "B"] }, { kind: "own", unit: "B" }],
                braces: [{ unit: "A", slots: [0, 1], depth: 0 }, { unit: "B", slots: [1, 2], depth: 0 }] }],
      place: { a1: { lane: "L2", slot: 0, fu: "A" }, a2: { lane: "L2", slot: 0, fu: "A" }, s1: { lane: "L2", slot: 1, border: ["A", "B"] },
               b1: { lane: "L2", slot: 2, fu: "B" } },
      instances: [{ unit: "old", fu: "B", lane: "L2", slot: 2, reason: "other_lane", from_lane: "L1" }],
      stats: { units: 4, spatial: 4, border: 1, instanced: 0, by_reason: { other_lane: 1 }, memberships: 6, memberships_spatial: 5 },
    },
  };
  const sc = FO.overlayScene(base, answer, {
    keep: (n) => ["US", "USVs"].includes(n.node.node_type), continuity: () => false,
    keepEdge: (e) => e.edge.edge_type !== "is_in_activity", laneName: (id) => lanes.find((l) => l.id === id)?.label ?? null,
    colour: () => "#c00", scaleText: (s) => s ?? "",
  });
  const N = (id) => sc.byId.get(id);
  eq(sc.lanes, lanes, "the lanes are the Matrix's, untouched");
  eq(["a1", "a2", "s1", "b1", "r1"].filter((id) => !centreIn(N(id), lanes[0])).concat(centreIn(N("old"), lanes[1]) ? [] : ["old"]), [],
     "every unit in its own lane (the earlier one stays in the earlier lane)");
  ok(!sc.byId.has("ACT") && !sc.byId.has("DOC") && sc.groups.length === 0, "the activity (box and node) and the document are not drawn");
  eq(sc.edges.map((e) => e.edge.edge_type), ["is_after"], "the stratigraphic edge kept, the membership in the activity not");
  ok(base.nodes.find((n) => n.id === "a1").x === 0, "the base scene is not changed (a copy)");
  const br = Object.fromEntries(sc.functional.braces.map((b) => [b.unit, b]));
  ok(inside(N("a1"), br.A) && inside(N("a2"), br.A) && !inside(N("a1"), br.B), "the members of A inside A's braces only");
  ok(inside(N("s1"), br.A) && inside(N("s1"), br.B), "the shared unit inside both braces: on the border");
  const ix0 = Math.max(br.A.x, br.B.x), ix1 = Math.min(br.A.x + br.A.w, br.B.x + br.B.w);
  const inOverlap = sc.nodes.filter((n) => n.x + n.w / 2 >= ix0 && n.x + n.w / 2 <= ix1 && centreIn(n, lanes[0])).map((n) => n.id);
  eq(inOverlap, ["s1"], "the two braces overlap only on the border");
  ok(N("s1").x > N("a2").x && N("s1").x < N("b1").x, "the border between the two units, left to right");
  const inst = sc.nodes.find((n) => n.instanceOf === "old");
  ok(!!inst && inside(inst, br.B) && inst.functional.from === "Romana" && inst.functional.reason === "other_lane",
     "the unit of an earlier lane: an instance inside B's braces, «↑Romana»");
  ok(N("r1").x > br.B.x + br.B.w, "a unit of no functional unit after the braces");
  eq(sc.functional.borders.length, 1, "one border drawn");
  eq(FO.hitBrace(sc, br.B.x + br.B.w / 2 + 20, br.B.y + 5)?.unit, "B", "a click on a brace's label row finds its unit");
  eq(FO.overlayScene(base, { ...answer, overlay: undefined }, {}), null, "no plan (an older bridge): no overlay");
  // MICRO-MF06 · with no plan the page still turns the activities off
  const bare = FO.withoutActivities(base, (n) => n.node.node_type === "ActivityNodeGroup", (e) => e.edge.edge_type !== "is_in_activity");
  ok(!bare.byId.has("ACT") && bare.groups.length === 0 && !bare.groupsById.has("ACT"), "MF06 · no plan: the activity's box and node not drawn");
  eq(bare.edges.map((e) => e.edge.edge_type), ["is_after"], "MF06 · …its membership edge gone, the stratigraphic one kept");
  ok(["a1", "a2", "s1", "DOC"].every((id) => bare.byId.get(id)?.x === base.byId.get(id).x && bare.byId.get(id)?.y === base.byId.get(id).y),
     "MF06 · …every other node where the Matrix put it (the document too)");
  ok(base.byId.has("ACT") && base.groups.length === 1, "MF06 · …and the base scene is not changed (a copy)");
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
  console.log(`check-functional-overlay: ${checks} checks passed (${!pw ? "no playwright-core" : `no s3Dgraphy venv at ${py}`}: the bridge and the page skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "functional-overlay-")));
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
async function ask(file) {
  const container = JSON.parse(fs.readFileSync(file, "utf8"));
  const g = container.graphs ? container.graphs[container.active_graph_id] : container.graph;
  const res = await fetch(`${B}/functional-matrix`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://localhost:${PORT}` },
    body: JSON.stringify({ doc: { version: "1", graph: g, header: container.header ?? {} }, lang: "it" }) });
  eq(res.status, 200, `POST /functional-matrix answers (${berr.split("\n").slice(-3).join(" | ")})`);
  return res.json();
}
{
  const a = await ask(DOC);
  ok(!!a.overlay && Array.isArray(a.overlay.lanes) && a.overlay.stats.units > 0, "the answer carries the overlay's plan (s3Dgraphy overlay_plan)");
  ok(a.overlay.instances.some((i) => i.unit === "USM1" && i.reason === "other_lane"), "USM1 (Roman) in the castle: an instance between epochs");
}

// ── 4 · the page ─────────────────────────────────────────────────────────────
const browser = await pw.chromium.launch({ executablePath: fs.existsSync(CHR) ? CHR : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function open(file, { embargo = true, lang = "it", before = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1000 } });
  const page = await ctx.newPage();
  if (before) await before(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(([on, l]) => {
    if (on) window.__EM_EMBARGO__ = true;
    if (!sessionStorage.getItem("fo-probe")) {
      localStorage.clear();
      localStorage.setItem("emstudio.locale", l);
      sessionStorage.setItem("fo-probe", "1");
    }
  }, [embargo, lang]);
  await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(B)}`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 120000 });
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, file]);
  await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 5, null, { timeout: 120000 });
  // the Matrix settles (its slide, the answers that re-lay it out): the same
  // places twice in a row, half a second apart
  let last = "";
  for (let i = 0; i < 40; i++) {
    const now = JSON.stringify(await page.evaluate(() => window.__EM_SCENE__().nodes.map((n) => [n.id, Math.round(n.x), Math.round(n.y)])));
    if (now === last) break;
    last = now;
    await page.waitForTimeout(500);
  }
  return { ctx, page, errors };
}
const H = (page, fn, arg) => page.evaluate(fn, arg);
const fo = (page) => H(page, () => window.__EM_DRAG__.functionalOverlay());
const SW = '[data-act="functional-overlay"]:visible';

async function turnOn(page) {
  await page.locator(SW).first().click();
  await page.waitForFunction(() => !!window.__EM_DRAG__.functionalOverlay().drawing, null, { timeout: 120000 });
  return fo(page);
}

/** the checks every document passes: lanes, own lane, activities, note */
async function common(page, before, on, what) {
  eq(on.lanes, before.lanes, `${what}: the lanes of the Matrix are not touched (ids, bands, heights)`);
  const laneOf = (n, lanes) => lanes.find((l) => n.y + n.h / 2 >= l.y && n.y + n.h / 2 <= l.y + l.height)?.id ?? null;
  const was = new Map(before.nodes.filter((n) => !n.of).map((n) => [n.id, laneOf(n, before.lanes)]));
  const moved = on.nodes.filter((n) => !n.of && was.has(n.id) && laneOf(n, on.lanes) !== was.get(n.id)).map((n) => n.name);
  eq(moved, [], `${what}: every unit stays in its own lane`);
  eq(on.activityBoxes, 0, `${what}: the view by activity is off (no activity box)`);
  ok(on.nodes.every((n) => n.type !== "ActivityNodeGroup"), `${what}: no activity node drawn`);
  eq(await page.locator(SW).first().getAttribute("aria-pressed"), "true", `${what}: the switch is pressed`);
  const note = page.locator('[data-fo-note="activities-off"]').first();
  ok(await note.isVisible(), `${what}: the note is on the header (a tight head keeps its short form)`);
  eq([await note.locator(".hdr-long").textContent(), await note.locator(".hdr-short").textContent()], ["Vista per attività spenta", "attività spente"],
     `${what}: the header says the view by activity is off`);
}

{
  const r = await open(DOC);
  ok(await r.page.locator(SW).count() > 0, "the switch «Sovrimpressione funzionale» is in the Matrix's header");
  eq((await r.page.locator(`${SW} .hdr-long`).first().textContent()).trim(), "Sovrimpressione funzionale", "its name, in Italian");
  const before = await fo(r.page);
  eq(before.on, false, "off by default");
  const on = await turnOn(r.page);
  await common(r.page, before, on, "villa → castle");
  const names = new Map(on.nodes.map((n) => [n.id, n]));
  const br = Object.fromEntries(on.drawing.braces.map((b) => [b.unit, b]));
  ok(["CASTLE", "VILLA"].every((u) => br[u]), "the braces of the castle and of the villa drawn");
  const inst = on.nodes.filter((n) => n.of === "USM1");
  ok(inst.some((n) => n.functional?.reason === "other_lane" && n.functional.from && inside(n, br[n.functional.fu])),
     "USM1 in the castle: an instance inside the castle's braces, «↑epoch» (the lanes not crossed)");
  ok(on.nodes.filter((n) => !n.of && n.id === "USM1").length === 1, "…its master once, in its own lane");
  // a press and a move on a unit moves nothing and stores nothing
  const m = on.nodes.find((n) => !n.of && n.type === "US");
  const sx = on.canvas.left + (m.x + m.w / 2) * on.vp.scale + on.vp.x, sy = on.canvas.top + (m.y + m.h / 2) * on.vp.scale + on.vp.y;
  const stored = await H(r.page, (id) => window.__EM_DRAG__.stored(id), m.id);
  await r.page.mouse.move(sx, sy); await r.page.mouse.down(); await r.page.mouse.move(sx + 120, sy + 30, { steps: 6 }); await r.page.mouse.up();
  const after = (await fo(r.page)).nodes.find((n) => n.id === m.id);
  ok(after.x === m.x && after.y === m.y, "a drag in the overlay moves nothing");
  eq(await H(r.page, (id) => window.__EM_DRAG__.stored(id), m.id), stored, "…and stores nothing");
  // a click on the label row of a brace selects its functional unit
  const b = br.CASTLE;
  const now = await fo(r.page);
  const cx = now.canvas.left + (b.x + 40) * now.vp.scale + now.vp.x, cy = now.canvas.top + (b.y + 6) * now.vp.scale + now.vp.y;
  await r.page.mouse.click(cx, cy);
  eq(await H(r.page, () => window.__EM_DRAG__.selected()), ["CASTLE"], "a click on the castle's brace selects the castle");
  if (SHOTS) await r.page.screenshot({ path: path.join(SHOTS, "fo-1-villa-castello.png") });
  // off again: the Matrix by activity
  await r.page.locator(SW).first().click();
  const off = await fo(r.page);
  ok(!off.on && !off.drawing, "off again: no overlay");
  eq(await r.page.locator('[data-fo-note="activities-off"]').count(), 0, "…and no note");
  eq(r.errors, [], "no page error");
  await r.ctx.close();
}
{
  const r = await open(DOC, { embargo: false });
  eq(await r.page.locator('[data-act="functional-overlay"]').count(), 0, "embargo off: no switch");
  ok(await H(r.page, () => typeof window.__EM_DRAG__.functionalOverlay === "undefined"), "embargo off: no hook");
  await r.ctx.close();
}

// ── 5 · the real case ────────────────────────────────────────────────────────
let measure = null;
if (REAL) {
  const a = await ask(REAL);
  measure = a.overlay.stats;
  const r = await open(REAL);
  const before = await fo(r.page);
  ok(before.activityBoxes > 0, `Templu Mare: the Matrix by activity has its boxes (${before.activityBoxes})`);
  const on = await turnOn(r.page);
  await common(r.page, before, on, "Templu Mare");
  const units = new Map(a.units.map((u) => [u.name, u.id]));
  const br = Object.fromEntries(on.drawing.braces.map((b) => [b.name, b]));
  const portico = br["portico (colonnato e architrave)"], cortile = br["cortile"];
  ok(!!portico && !!cortile && !!br["tempio"], "the braces of the temple, the portico and the courtyard");
  const node = (name) => on.nodes.find((n) => !n.of && n.name === name);
  ok(["SU003", "USV102"].every((nm) => inside(node(nm), portico) && inside(node(nm), cortile)),
     "SU003 and USV102 inside both braces: on the border between portico and courtyard");
  const ix0 = Math.max(portico.x, cortile.x), ix1 = Math.min(portico.x + portico.w, cortile.x + cortile.w);
  const lane = on.lanes.find((l) => portico.y >= l.y && portico.y < l.y + l.height);
  const inOverlap = on.nodes.filter((n) => n.x + n.w / 2 >= ix0 && n.x + n.w / 2 <= ix1 && n.y + n.h / 2 >= lane.y && n.y + n.h / 2 <= lane.y + lane.height)
    .map((n) => n.name).sort();
  eq(inOverlap, ["SU003", "USV102"], "portico and courtyard overlap only on the border");
  eq(on.drawing.borders.length, 1, "one border on Templu Mare");
  ok(inside(br["portico (colonnato e architrave)"], br["tempio"], 1) && inside(br["piattaforma (sacrifici)"], br["cortile"], 1),
     "the rooms inside the temple, the platform inside the courtyard");
  const ruin = br["rudere"];
  const found = on.nodes.filter((n) => n.of && n.functional?.fu === units.get("rudere") && n.functional.reason === "other_lane");
  ok(["SU001", "SU002", "SU003", "SU004"].every((nm) => found.some((n) => n.name === nm && inside(n, ruin) && n.functional.from)),
     "SU001–SU004 in the ruin: instances between epochs inside its braces, «↑II A.D.»");
  eq(measure.instanced, 0, "§C: on Templu Mare the spatial layout holds alone (no instance for the geometry)");
  if (SHOTS) {
    const fd = on.drawing.braces.find((b) => b.name === "tempio");
    await H(r.page, ([x, y, w, h]) => window.__EM_DRAG__.frameWorld?.(x, y, w, h), [fd.x, fd.y, fd.w, fd.h]);
    await r.page.screenshot({ path: path.join(SHOTS, "fo-2-templu-mare.png") });
  }
  eq(r.errors, [], "no page error (Templu Mare)");
  await r.ctx.close();
}
// ── 6 · MICRO-MF06 · the activities off at once; a graph with no functional unit
let mf06 = 0;
if (REAL) {
  const c0 = checks;
  // the bridge THINKS (its answer held) and then a bridge that cannot compute it
  for (const how of ["waiting", "bridge"]) {
    // the route set before the page loads: no answer of the real bridge slips in
    const r = await open(REAL, { before: (page) => page.route("**/functional-matrix", (route) => (how === "bridge"
      ? route.fulfill({ status: 404, contentType: "application/json", body: '{"ok": false, "error": "unknown endpoint"}' })
      : undefined)) });   // never answered: the bridge is thinking
    const before = await fo(r.page);
    ok(before.activityBoxes > 0, `MF06 · ${how}: the Matrix by activity has its boxes (${before.activityBoxes})`);
    await r.page.locator(SW).first().click();
    if (how === "bridge") await r.page.waitForFunction(() => window.__EM_DRAG__.functionalOverlay().status === "missing", null, { timeout: 60000 });
    else await r.page.waitForTimeout(300);
    await r.page.waitForTimeout(200);
    const on = await fo(r.page);
    eq(on.activityBoxes, 0, `MF06 · ${how}: with the overlay on and no plan, no activity box`);
    ok(on.nodes.every((n) => n.type !== "ActivityNodeGroup") && !on.drawing, `MF06 · ${how}: …no activity node, no braces`);
    const note = r.page.locator('[data-fo-activities="off"]').first();
    eq(await note.getAttribute("data-fo-note"), how, `MF06 · ${how}: the header says why there are no braces`);
    ok(!(await note.getAttribute("title")).includes("resta com'è"), `MF06 · ${how}: …and no longer that the Matrix stays as it is`);
    await r.page.locator(SW).first().click();
    ok((await fo(r.page)).activityBoxes > 0, `MF06 · ${how}: off again, the boxes come back`);
    eq(r.errors, [], `MF06 · ${how}: no page error`);
    await r.ctx.close();
  }
  // a graph with NO functional unit (the real v11), its proof file beside it
  const V11 = process.env.V11 ?? path.join(path.dirname(FU_PROVA), "TempluMare_v11.em.json");
  if (fs.existsSync(V11)) {
    const doc = path.join(dir, "TempluMare_v11.em.json");
    fs.copyFileSync(V11, doc);
    const r = await open(doc);
    const before = await fo(r.page);
    ok(before.activityBoxes > 0, `MF06 · v11 (no FU): the Matrix by activity has its boxes (${before.activityBoxes})`);
    await r.page.locator(SW).first().click();
    const row = r.page.locator(".fo-empty-row:not(.hidden)").first();
    await row.waitFor({ state: "visible", timeout: 120000 });
    const on = await fo(r.page);
    eq(on.activityBoxes, 0, "MF06 · v11: no activity box with the overlay on");
    eq(await r.page.locator('[data-fo-activities="off"]').first().getAttribute("data-fo-note"), "empty", "MF06 · v11: the header says «no functional unit»");
    eq((await row.locator(".fo-empty-say").textContent()).trim(), "Nessuna unità funzionale in questo grafo", "MF06 · v11: the row says it, in the area");
    await r.page.locator('.fo-empty-row [data-fo-empty-act="proof"]').waitFor({ state: "visible", timeout: 20000 });
    const acts = await row.locator("[data-fo-empty-act]").evaluateAll((bs) => bs.map((b) => [b.dataset.foEmptyAct, b.textContent.trim()]));
    if (SHOTS) await r.page.screenshot({ path: path.join(SHOTS, "fo-3-v11-senza-unita.png") });
    eq(acts, [["read-as", "Leggi come…"], ["workspace", "Apri lo spazio di lavoro Funzionale"], ["proof", "Apri il file di prova"]],
       "MF06 · v11: its three ways in");
    // «Read as…» on the selection: the jar's dialog, for the selected unit
    const us = on.nodes.find((n) => n.type === "US" && !n.of);
    await H(r.page, (id) => window.__EM_DRAG__.select(id), us.id);
    await row.locator('[data-fo-empty-act="read-as"]').click();
    await r.page.locator('[data-app-dialog="jar-read-as"]').waitFor({ state: "visible", timeout: 20000 });
    ok(true, "MF06 · «Leggi come…» opens the jar's dialog on the selection");
    await r.page.keyboard.press("Escape");
    await r.page.locator('[data-app-dialog="jar-read-as"]').waitFor({ state: "detached", timeout: 20000 });
    // the workspace «Functional»
    await row.locator('[data-fo-empty-act="workspace"]').click();
    await r.page.waitForFunction(() => document.querySelector('button[data-ws="functional"]')?.classList.contains("active"), null, { timeout: 20000 });
    ok(true, "MF06 · «Apri lo spazio di lavoro Funzionale» opens it");
    await r.ctx.close();
    // the proof file: opened from the row, and the braces come
    const r2 = await open(doc);
    await r2.page.locator(SW).first().click();
    await r2.page.locator('.fo-empty-row:not(.hidden) [data-fo-empty-act="proof"]').waitFor({ state: "visible", timeout: 120000 });
    await r2.page.locator('.fo-empty-row [data-fo-empty-act="proof"]').click();
    await r2.page.waitForFunction(() => (window.__EM_DRAG__.functionalOverlay().drawing?.braces.length ?? 0) > 0, null, { timeout: 120000 });
    const p = await fo(r2.page);
    ok(p.drawing.braces.some((b) => b.name === "tempio"), "MF06 · «Apri il file di prova» opens TempluMare_v11_fu-prova: the braces drawn");
    eq(await r2.page.locator(".fo-empty-row:not(.hidden)").count(), 0, "MF06 · …and the row is gone");
    eq([...r.errors, ...r2.errors], [], "MF06 · v11: no page error");
    await r2.ctx.close();
    // a file with no proof beside it: two ways in, not three
    const lone = path.join(dir, "lone");
    fs.mkdirSync(lone, { recursive: true });
    fs.copyFileSync(V11, path.join(lone, "TempluMare_v11.em.json"));
    const r3 = await open(path.join(lone, "TempluMare_v11.em.json"));
    await r3.page.locator(SW).first().click();
    await r3.page.locator(".fo-empty-row:not(.hidden)").waitFor({ state: "visible", timeout: 120000 });
    await r3.page.waitForTimeout(1500);
    eq(await r3.page.locator(".fo-empty-row [data-fo-empty-act]").evaluateAll((bs) => bs.map((b) => b.dataset.foEmptyAct)), ["read-as", "workspace"],
       "MF06 · no proof file beside: no «Apri il file di prova»");
    await r3.ctx.close();
  } else console.log(`check-functional-overlay: MF06 · no ${V11}: the graph with no functional unit skipped`);
  mf06 = checks - c0;
}
await browser.close();
stop();
if (mf06) console.log(`check-functional-overlay: MF06 · ${mf06} checks`);
console.log(`check-functional-overlay: ${checks} checks passed${measure ? ` · §C Templu Mare fu-prova: ${JSON.stringify(measure)}` : " (no FU_PROVA: the real case skipped)"}`);
process.exit(0);
