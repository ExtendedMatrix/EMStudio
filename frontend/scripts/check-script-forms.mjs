// MICRO-SEG02 p.1–3 (E.D., 20 Nov 2026) · executable check of what a script
// reaches through `em.app` — IN THE PAGE, through Python:
//
//   · the table (`script-commands.json`): every menu command of `menu-table.ts`
//     is declared (form, params, docs EN), every action has a handler, every
//     key/gesture of `keymap.ts` says its action or why it has none, no
//     shortcut changed;
//   · a real bridge (tools/em_bridge.py with its secret, a folder of its own)
//     and a Vite of this tree, a headless page on `testdata/spazio.em.json`
//     copied there: for EVERY command with a script form, a call
//     `em.app.commands.run(id, **params)` from the Python console with the
//     params that make it run WITHOUT its window — and no window stays open
//     (no `.modal`, no app dialog, nothing in `__EM_DIALOGS__` but the
//     dialogs the script itself armed and answered); what it did measured
//     (the file written, the document opened, the node added, the epoch…);
//   · the named actions (add a unit above / below, connect, move to an epoch,
//     fold / unfold / enter / leave a group, frame, fit, zoom, back, delete,
//     nudge, reflow, compact, magnify) the same way;
//   · params refused in the page's words (an unknown name, a wrong type, a
//     choice not among the choices), never dropped in silence;
//   · `em.app.space` (layers, epoch read and set, profile read and set),
//     `em.app.workspaces` (list, active set), `em.app.windows` (list, open a
//     console in an area, types).
//
//   node scripts/check-script-forms.mjs        (PORT=<a running Vite of this tree>)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const FE = new URL("..", import.meta.url).pathname;
const ROOT = path.resolve(FE, "..");
const SRC = path.join(FE, "src");
let checks = 0;
const trace = process.env.CHECK_TRACE ? (w) => console.error(`· ${w}`) : () => {};
const ok = (c, what) => { assert.ok(c, what); checks++; trace(what); };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; trace(what); };

// ── the table ───────────────────────────────────────────────────────────────
const table = JSON.parse(fs.readFileSync(path.join(SRC, "script-commands.json"), "utf8"));
const menuTable = fs.readFileSync(path.join(SRC, "menu-table.ts"), "utf8");
const keymap = fs.readFileSync(path.join(SRC, "keymap.ts"), "utf8");
const main = fs.readFileSync(path.join(SRC, "main.ts"), "utf8");
// MICRO-MF05 · a command of a function under EMBARGO is a row only under LAB
// (`...(LAB ? [cmd(…)] : [])`): absent from the community build, it is not
// declared in script-commands.json either (a public table, in every build)
const menuIds = [...menuTable.replace(/\.\.\.\(LAB \? \[[^\n]*\] : \[\]\)/g, "").matchAll(/cmd\("([A-Za-z]+)"/g)].map((m) => m[1]);
ok(menuIds.length >= 40, `the menu table's commands read (${menuIds.length})`);
eq(menuIds.filter((id) => !table.commands[id]), [], "every menu command is declared in script-commands.json");
eq(Object.keys(table.commands).filter((id) => !menuIds.includes(id)), [], "…and nothing else is declared as a menu command");
const FORMS = ["exec", "invoke", "window", "none"];
eq(Object.entries(table.commands).filter(([, d]) => !FORMS.includes(d.form) || typeof d.doc !== "string" || !Array.isArray(d.params)).map(([id]) => id), [],
   "each command: a form, a doc, its params");
eq(Object.entries(table.commands).filter(([, d]) => (d.form === "window" || d.form === "none") && !d.why).map(([id]) => id), [],
   "a command with no script form says why");
eq(Object.entries(table.commands).filter(([, d]) => d.form === "invoke" && !(d.exec_when ?? []).every((n) => d.params.some((p) => p.name === n))).map(([id]) => id), [],
   "an invoke command's exec_when are params of its own");
const TYPES = ["str", "int", "float", "bool", "list[str]", "enum"];
const allParams = [...Object.values(table.commands), ...Object.values(table.actions)].flatMap((d) => d.params);
eq(allParams.filter((p) => !TYPES.includes(p.type) || !p.doc || (p.type === "enum" && !(p.choices ?? []).length)), [], "each param: a type, a doc (EN), an enum its choices");
const formsRegistered = [...main.matchAll(/registerScriptForm\("([A-Za-z]+)"/g)].map((m) => m[1]);
eq(Object.entries(table.commands).filter(([, d]) => d.form === "invoke" && !formsRegistered.includes(d.id ?? "") && !formsRegistered.includes(Object.keys(table.commands).find((k) => table.commands[k] === d))).map(([id]) => id), [],
   "every invoke command has its script form registered");
const actionsRegistered = [...main.matchAll(/registerScriptAction\("([A-Za-z]+)"/g)].map((m) => m[1]);
eq(Object.keys(table.actions).filter((id) => !actionsRegistered.includes(id)), [], "every action has its handler");
eq(actionsRegistered.filter((id) => !table.actions[id]), [], "…and no handler without its declaration");
const keyIds = [...keymap.matchAll(/\{ id: "([A-Za-z0-9]+)", keys:/g)].map((m) => m[1]);
eq(keyIds.filter((id) => !table.keymap[id]), [], "every key and gesture of the keymap says its command, its action, or why it has none");
eq(Object.entries(table.keymap).filter(([, l]) => !(l.command ? table.commands[l.command] : l.action ? table.actions[l.action] : l.why)).map(([id]) => id), [],
   "…and what it names exists");
ok(/\{ id: "save", keys: "⌘S", scope: "app" \}/.test(keymap) && /\{ id: "fit", keys: "0 · ⇧C", scope: "graph" \}/.test(keymap), "no shortcut changed (⌘S, 0 · ⇧C as before)");
ok(/command: \(id, slots\) => runScriptCommand\(id, slots\)/.test(main), "the host hook passes the params on (they were lost in runCommand(id))");

// ── the page ────────────────────────────────────────────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
let pw = null;
for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
  path.join(ROOT, ".claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js")]) {
  if (!t) continue;
  try { const m = await import(t); pw = m.chromium ? m : m.default; break; } catch { /* next */ }
}
if (!fs.existsSync(py) || !pw) {
  console.log(`check-script-forms: ${checks} checks passed (${!pw ? "no playwright-core" : `no s3Dgraphy venv at ${py}`}: the page part skipped)`);
  process.exit(0);
}
const CHR = process.env.CHR ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "script-forms-")));
const study = path.join(dir, "study");
fs.mkdirSync(study, { recursive: true });
const DOC = path.join(study, "spazio.em.json");
fs.copyFileSync(path.join(FE, "testdata/spazio.em.json"), DOC);
fs.copyFileSync(path.join(FE, "testdata/chronology-overlaps.em.json"), path.join(study, "other.em.json"));
const GRAPHML = path.join(S3D, "tests/fixtures/epochs_partial_dates.graphml");
if (fs.existsSync(GRAPHML)) fs.copyFileSync(GRAPHML, path.join(study, "imported.graphml"));
// a 1×1 PNG, two of them: the door's files
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
fs.writeFileSync(path.join(study, "foto1.png"), PNG);
fs.writeFileSync(path.join(study, "foto2.png"), PNG);
const TOKEN = "check-script-forms-secret-0123456789";
const machine = { S3DGRAPHY_CONSOLE_DIR: path.join(dir, "m/console"), S3DGRAPHY_PROFILES_DIR: path.join(dir, "m/profiles"),
  S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "m/extensions"), S3DGRAPHY_PLUGINS_DIR: path.join(dir, "m/plugins"),
  EM_VOCABULARIES_DIR: path.join(dir, "m/vocab"), EM_BRIDGE_STATE_DIR: path.join(dir, "m/state"), EM_PY_ANSWER_S: "10" };
const bport = await freePort();
const bridge = spawn(py, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(bport), "--fs-root", dir, "--s3dgraphy", path.join(S3D, "src")],
  { env: { ...process.env, ...machine, EM_BRIDGE_TOKEN: TOKEN }, stdio: ["ignore", "ignore", "pipe"] });
let berr = "";
bridge.stderr.on("data", (d) => { berr += d; });
const B = `http://127.0.0.1:${bport}`;
let vite = null;
let PORT = process.env.PORT;
if (!PORT) {
  PORT = String(await freePort());
  vite = spawn(process.execPath, [path.join(FE, "node_modules/vite/bin/vite.js"), "--port", PORT, "--strictPort"], { cwd: FE, stdio: "ignore" });
}
for (let i = 0; i < 240; i++) {
  let up = 0;
  try { if ((await fetch(`${B}/health`)).ok) up++; } catch { /* not yet */ }
  try { if ((await fetch(`http://localhost:${PORT}/em/studio/`)).ok) up++; } catch { /* not yet */ }
  if (up === 2) break;
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await pw.chromium.launch({ executablePath: fs.existsSync(CHR) ? CHR : undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1552, height: 914 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript((tok) => {
    window.EM_BRIDGE_TOKEN = tok;
    if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "en"); sessionStorage.setItem("probe", "1"); }
  }, TOKEN);
  await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(B)}`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt && !!window.__EM_PY__, null, { timeout: 120000 });
  const doc = JSON.parse(fs.readFileSync(DOC, "utf8"));
  await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, DOC]);
  await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 3, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__EM_PY__.ready(), null, { timeout: 30000 });

  /** run Python in the page's session (the console's road) */
  const run = (code) => page.evaluate((c) => window.__EM_PY__.run(c).then((o) => ({ ok: o.ok, status: o.status, value: o.value ?? null, error: o.error ?? null, output: o.output })), code);
  /** no window left open: no modal, no app dialog (the dialogs a script armed closed themselves) */
  const windows = () => page.evaluate(() => ({
    modals: [...document.querySelectorAll(".modal")].filter((m) => (m.offsetParent || getComputedStyle(m).display !== "none") && !m.classList.contains("hidden")).map((m) => m.dataset.appDialog || m.className),
    asked: (window.__EM_DIALOGS__ ?? []).length }));
  const nodes = () => page.evaluate(() => JSON.parse(window.__EM_DRAG__.docJson()));
  const graphOf = (c) => c.graph ?? Object.values(c.graphs ?? {})[0];
  const call = async (what, code, expect) => {
    const before = await windows();
    const o = await run(code);
    await page.waitForTimeout(150);
    const after = await windows();
    ok(o.ok, `${what}: ran (${o.error ?? o.status})`);
    eq(after.modals, [], `${what}: no window open`);
    if (expect) await expect(o, before, after);
    return o;
  };

  // ── the File forms, with their params: no picker, no window ──────────────
  const OUT = path.join(study, "out.em.json");
  await call("saveAs(path)", `em.app.commands.run("saveAs", path=${JSON.stringify(OUT)})`, async (o) => {
    eq(o.value, `'${OUT}'`, "saveAs(path): the path written is returned");
    ok(fs.existsSync(OUT) && /"graph/.test(fs.readFileSync(OUT, "utf8")), "…the em.json is on disk");
  });
  await call("save()", `em.app.commands.run("save")`, async (o) => eq(o.value, "True", "save(): saved where it is now"));
  await call("saveAll()", `em.app.commands.run("saveAll")`);
  const SVG = path.join(study, "matrix.svg");
  await call("exportSvg(path)", `em.app.commands.run("exportSvg", path=${JSON.stringify(SVG)})`, async () =>
    ok(fs.existsSync(SVG) && /<svg/.test(fs.readFileSync(SVG, "utf8")), "exportSvg(path): the SVG written there"));
  const TTL = path.join(study, "graph.ttl");
  await call("exportTtl(path)", `em.app.commands.run("exportTtl", path=${JSON.stringify(TTL)})`, async () =>
    ok(fs.existsSync(TTL) && fs.statSync(TTL).size > 100, "exportTtl(path): the Turtle written there"));
  // the door: files given, its date filled, its OK pressed by the script
  const docsBefore = graphOf(await nodes()).nodes.filter((n) => n.node_type === "document").length;
  await call("door(paths, date, confirm)", `em.app.commands.run("door", paths=[${JSON.stringify(path.join(study, "foto1.png"))}], date="2024", confirm=True)`, async (o, b, a) => {
    eq(o.value, "1", "door(): one file given");
    const docs = graphOf(await nodes()).nodes.filter((n) => n.node_type === "document").length;
    eq(docs, docsBefore + 1, "…a document born from it (the door's OK pressed, one undo step)");
    ok(a.asked > b.asked, "…the door's dialog asked and answered by the script (traced in __EM_DIALOGS__)");
  });
  await call("bringIn(paths, mode, date, confirm)", `em.app.commands.run("bringIn", paths=${JSON.stringify(path.join(study, "foto2.png"))}, mode="files", date="2023", confirm=True)`, async () => {
    eq(graphOf(await nodes()).nodes.filter((n) => n.node_type === "document").length, docsBefore + 2, "bringIn(): the same door, without its window of three choices");
  });
  await call("undo(steps=2)", `em.app.commands.run("undo", steps=2)`, async (o) => eq(o.value, "2", "undo(steps=2): two steps"));
  await call("redo(steps=2)", `em.app.commands.run("redo", steps=2)`, async (o) => eq(o.value, "2", "redo(steps=2): two steps"));
  await call("pin()", `em.app.commands.run("pin")`);
  await call("relocate(folder)", `em.app.commands.run("relocate", folder=${JSON.stringify(study)})`);
  await call("save() again", `em.app.commands.run("save")`);
  if (fs.existsSync(path.join(study, "imported.graphml"))) {
    await call("importGraphml(path)", `em.app.commands.run("importGraphml", path=${JSON.stringify(path.join(study, "imported.graphml"))})`, async (o) =>
      ok(/imported\.graphml/.test(o.value ?? ""), "importGraphml(path): imported without the picker nor the em.json's name asked"));
    // the imported graph has no file yet: saveAs(path) gives it one (else the next open asks about its unsaved work)
    await call("saveAs(path) of the import", `em.app.commands.run("saveAs", path=${JSON.stringify(path.join(study, "imported.em.json"))})`, async () =>
      ok(fs.existsSync(path.join(study, "imported.em.json")), "…saveAs(path) writes the imported graph's em.json"));
  }
  const OTHER = path.join(study, "other.em.json");
  await call("open(path)", `em.app.commands.run("open", path=${JSON.stringify(OTHER)})`, async (o) => {
    eq(o.value, `'${OTHER}'`, "open(path): opened without the picker");
    ok(await page.evaluate(() => /other/.test(document.title + " " + (document.querySelector(".name-strip, #name-strip")?.textContent ?? ""))) ||
       graphOf(await nodes()).nodes.some((n) => n.node_type === "EpochNode"), "…its graph is the active one");
  });
  await call("open(path, replace=True)", `em.app.commands.run("open", path=${JSON.stringify(OUT)}, replace=True)`, async (o) => eq(o.value, `'${OUT}'`, "open(path, replace=True): the open files closed first"));
  await call("new()", `em.app.commands.run("new")`, async (o) => eq(o.value, "True", "new(): a new document"));
  await call("close()", `em.app.commands.run("close")`);
  await call("open(path) back", `em.app.commands.run("open", path=${JSON.stringify(DOC)}, replace=True)`);
  await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 3, null, { timeout: 30000 });

  // ── refusals said, never dropped ──────────────────────────────────────────
  let o = await run(`em.app.commands.run("save", path="/x")`);
  ok(!o.ok && /takes no parameters/.test(o.error ?? ""), `a param a command does not take: said (${o.error})`);
  o = await run(`em.app.commands.run("open", pth="/x")`);
  ok(!o.ok && /no parameter «pth» \(it takes: path, replace\)/.test(o.error ?? ""), "an unknown name: said, with the names it takes");
  o = await run(`em.app.commands.run("undo", steps="two")`);
  ok(!o.ok && /must be int/.test(o.error ?? ""), "a wrong type: said");
  o = await run(`em.app.commands.run("spaceView", side="up")`);
  ok(!o.ok && /one of front, back/.test(o.error ?? ""), "a choice not among the choices: said");
  o = await run(`em.app.commands.run("quitFile")`);
  ok(!o.ok && /not run from a script/.test(o.error ?? ""), "a command not for scripts (Quit): said why");
  o = await run(`em.app.commands.run("addUnitAbove")`);
  ok(!o.ok && /needs «of»/.test(o.error ?? ""), "a required param missing: said");

  // ── the named actions ─────────────────────────────────────────────────────
  const g0 = graphOf(await nodes());
  const above = await call("addUnitAbove(of)", `em.app.commands.run("addUnitAbove", of="US102", name="US900")`);
  const newId = JSON.parse(above.value.replace(/'/g, '"'));
  let g1 = graphOf(await nodes());
  ok(g1.nodes.some((n) => n.id === newId && n.name === "US900" && n.node_type === "US"), "addUnitAbove: a US named US900");
  ok(g1.edges.some((e) => e.source === newId && e.edge_type === "is_after" && e.target === "US102"), "…ABOVE US102: US900 is_after US102");
  const below = await call("addUnitBelow(of)", `em.app.commands.run("addUnitBelow", of="US900", name="US901")`);
  const belowId = JSON.parse(below.value.replace(/'/g, '"'));
  g1 = graphOf(await nodes());
  ok(g1.edges.some((e) => e.source === newId && e.edge_type === "is_after" && e.target === belowId), "addUnitBelow: US900 is_after US901");
  await call("connect(source, target)", `em.app.commands.run("connect", source="US103", target="US104")`, async (r) => {
    eq(r.value, "'is_after'", "connect: the datamodel's relation for two units");
    ok(graphOf(await nodes()).edges.some((e) => e.source === "US103" && e.edge_type === "is_after" && e.target === "US104"), "…the edge in the graph");
  });
  await call("moveToEpoch(ids, epoch)", `em.app.commands.run("moveToEpoch", ids=["US103"], epoch="Età moderna")`, async (r) => {
    eq(r.value, "1", "moveToEpoch: one unit moved (the epoch given by its name)");
    ok(graphOf(await nodes()).edges.some((e) => e.source === "US103" && e.edge_type === "has_first_epoch" && e.target === "EP_MOD"), "…now in Età moderna");
  });
  await call("fold(id)", `em.app.commands.run("fold", id="PD_USM101")`, async () =>
    ok((await page.evaluate(() => window.__EM_DRAG__.folded())).includes("PD_USM101"), "fold: the group folded"));
  await call("unfold(id)", `em.app.commands.run("unfold", id="PD_USM101")`, async () =>
    ok(!(await page.evaluate(() => window.__EM_DRAG__.folded())).includes("PD_USM101"), "unfold: open again"));
  await call("frameNode(id)", `em.app.commands.run("frameNode", id="USM101")`, async () =>
    ok((await page.evaluate(() => window.__EM_DRAG__.selected())).includes("USM101"), "frameNode: the node selected and framed"));
  await call("back()", `em.app.commands.run("back")`);
  await call("fit()", `em.app.commands.run("fit")`);
  const z0 = await page.evaluate(() => window.__EM_DRAG__.viewNow?.()?.scale ?? null);
  await call("zoomIn(factor)", `em.app.commands.run("zoomIn", factor=2.0)`, async () => {
    const z1 = await page.evaluate(() => window.__EM_DRAG__.viewNow?.()?.scale ?? null);
    ok(z0 == null || z1 > z0 * 1.9, `zoomIn(2): the scale doubled (${z0} → ${z1})`);
  });
  await call("zoomOut()", `em.app.commands.run("zoomOut", factor=2.0)`);
  await call("enterGroup(id)", `em.app.commands.run("enterGroup", id="PD_USM101")`);
  await call("leaveGroup()", `em.app.commands.run("leaveGroup")`, async (r) => eq(r.value, "True", "leaveGroup: out of the group"));
  await call("nudge(dx, dy)", `em.app.commands.run("nudge", dx=10, dy=0)`);
  await call("compact()", `em.app.commands.run("compact")`);
  await call("reflow()", `em.app.commands.run("reflow")`);
  await call("deleteNodes(ids)", `em.app.commands.run("deleteNodes", ids=["US900", "US901"])`, async (r) => {
    eq(r.value, "2", "deleteNodes: two deleted");
    const g2 = graphOf(await nodes());
    ok(!g2.nodes.some((n) => (n.name === "US900" || n.name === "US901") && !n.data?.removed), "…gone from the graph");
  });
  await call("magnify()", `em.app.commands.run("magnify")`);
  await call("magnify() back", `em.app.commands.run("magnify")`);

  // ── the workspaces, the windows, the Space as objects ─────────────────────
  o = await run(`[w["id"] for w in em.app.workspaces.list()]`);
  eq(o.value, "['canvas', 'provenance', 'assets', 'narrative', 'space', 'sheets', 'scripting']", "em.app.workspaces.list(): the seven tabs");
  o = await run(`em.app.workspaces.active = "space"\nem.app.workspaces.active`);
  eq(o.value, "'space'", "em.app.workspaces.active = 'space': the Space in front");
  await page.waitForTimeout(1500);
  o = await run(`sorted({w["type"] for w in em.app.windows.list()})`);
  ok(o.ok && /'scene'/.test(o.value) && /'graph'/.test(o.value), `em.app.windows.list(): the Space's windows (${o.value})`);
  o = await run(`ls = em.app.space.layers\n[(x.name, x.kind, x.visible) for x in ls]`);
  ok(o.ok && /Rilievo 2026/.test(o.value) && /'model'/.test(o.value), `em.app.space.layers: the models, their kind, visible (${o.value})`);
  o = await run(`l = em.app.space.layer("RM01")\nl.visible = False\n(l.visible, em.app.space.layer("RM01").visible)`);
  eq(o.value, "(False, False)", "a layer hidden by script: hidden in the Space");
  o = await run(`em.app.space.layer("RM01").visible = True\nem.app.space.layer("RM01").visible`);
  eq(o.value, "True", "…and shown again");
  o = await run(`em.app.space.epoch = "Medioevo"\nem.app.space.epoch["name"]`);
  eq(o.value, "'Medioevo'", "em.app.space.epoch: set by name, read back");
  o = await run(`[e["name"] for e in em.app.space.epochs]`);
  ok(o.ok && /Medioevo/.test(o.value), "em.app.space.epochs: the epochs it can show");
  o = await run(`em.app.space.profile = "mobile"\np = em.app.space.profile\nem.app.space.profile = None\n(p["profile"], p["chosen"], em.app.space.profile["chosen"])`);
  eq(o.value, "('mobile', True, False)", "em.app.space.profile: set, read, given back to the machine");
  for (const [id, code] of [["spaceView", `em.app.commands.run("spaceView", side="top")`], ["spaceToggleOrtho", `em.app.commands.run("spaceToggleOrtho")`],
    ["spaceFrameAll", `em.app.commands.run("spaceFrameAll")`], ["spaceFrameSelected", `em.app.commands.run("spaceFrameSelected")`],
    ["spaceCursorReset", `em.app.commands.run("spaceCursorReset")`]]) {
    const r = await run(code);
    ok(r.ok, `${id}: ran in the Space (${r.error ?? "ok"})`);
  }
  o = await run(`w = em.app.windows.open("console")\nw in [x["id"] for x in em.app.windows.list()]`);
  eq(o.value, "True", "em.app.windows.open('console'): a console in an area of this workspace");
  o = await run(`"script" in em.app.windows.types and "console" in em.app.windows.types`);
  eq(o.value, "True", "em.app.windows.types: the Console and the Script Editor among them");
  o = await run(`em.app.view("console")`);
  ok(o.ok, "em.app.view('console'): a view the bridge accepts now");
  // ── the Python console and the Script Editor detached and back ───────────
  // (MICRO-SEG02: as every window, into a system window — another screen — and
  // back; the Python session, the history, the script open and the editor →
  // console link, Alt+P writing in the detached console, stay the same)
  {
    await page.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="scripting"]')?.click());
    await page.waitForTimeout(1500);
    const winOf = (type) => page.evaluate((ty) => window.__EM_DRAG__.wins().find((w) => w.type === ty && !w.id.startsWith("pop:"))?.id ?? null, type);
    const conW = await winOf("console"), scrW = await winOf("script");
    ok(conW && scrW, `the Scripting workspace: a console (${conW}) and a Script Editor (${scrW})`);
    const conSel = `.tile-area[data-win="${conW}"] .pyc-input`;
    await page.fill(conSel, "x = 41");
    await page.press(conSel, "Enter");
    await page.waitForFunction(() => window.__EM_PY__.consoleLines().some((l) => l.text.includes("x = 41")), null, { timeout: 20000 });
    await page.click(`.tile-area[data-win="${scrW}"] .cm-content`);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("print(x + 1)");
    const detach = async (id) => {
      const popP = ctx.waitForEvent("page");
      const nid = await page.evaluate((w) => window.__EM_DRAG__.detach(w, 300, 200), id);
      const pop = await popP;
      await pop.waitForLoadState();
      await page.waitForTimeout(800);
      return { nid, pop };
    };
    const c = await detach(conW);
    ok(c.nid, `the console detached into a system window (${c.nid})`);
    ok(/x = 41/.test(await c.pop.locator(".pyc-out").innerText()), "…its lines there (the same console state)");
    await c.pop.click(".pyc-input");
    await c.pop.keyboard.press("ArrowUp");
    eq(await c.pop.inputValue(".pyc-input"), "x = 41", "…↑ brings back the history of before");
    await c.pop.fill(".pyc-input", "x");
    await c.pop.press(".pyc-input", "Enter");
    await c.pop.waitForFunction(() => /\b41\b/.test([...document.querySelectorAll(".pyc-k-value")].map((e) => e.textContent).join(" ")), null, { timeout: 20000 });
    ok(true, "…and the Python session is the same: x is still 41");
    const e = await detach(scrW);
    ok(e.nid && /print\(x \+ 1\)/.test(await e.pop.locator(".cm-content").innerText()), "the Script Editor detached: the script open is the same");
    await e.pop.click(".cm-content");
    await e.pop.keyboard.press("Alt+KeyP");
    await c.pop.waitForFunction(() => [...document.querySelectorAll(".pyc-k-out")].some((l) => /\b42\b/.test(l.textContent)), null, { timeout: 20000 });
    ok(true, "Alt+P in the detached editor: the script runs in the session and prints 42 in the DETACHED console");
    await page.evaluate((ids) => { for (const id of ids) window.__EM_DRAG__.returnDetached(id); }, [e.nid, c.nid]);
    await page.waitForTimeout(1200);
    const backCon = await winOf("console"), backScr = await winOf("script");
    ok(backCon && backScr, "both back in the workspace");
    ok(/\b42\b/.test(await page.locator(`.tile-area[data-win="${backCon}"] .pyc-out`).innerText()), "…the console with its lines (42 included)");
    ok(/print\(x \+ 1\)/.test(await page.locator(`.tile-area[data-win="${backScr}"] .cm-content`).innerText()), "…the editor with its script");
  }
  eq((await windows()).modals, [], "at the end, no window open");
  eq(errors, [], "no error in the page");
} finally {
  await browser.close();
  bridge.kill();
  vite?.kill();
}
if (/Traceback/.test(berr)) console.log(berr.split("\n").filter((l) => /Error|Traceback/.test(l)).slice(0, 8).join("\n"));
console.log(`check-script-forms: ${checks} checks passed`);
