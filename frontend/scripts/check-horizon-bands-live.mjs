// MICRO-LAB orizzonti come bande · the horizons IN PLACE of the epochs, in a
// real browser.
//
//   PORT=5180 BRIDGE=http://127.0.0.1:8780 PLAYWRIGHT_CORE=… \
//     node scripts/check-horizon-bands-live.mjs <em.json with two study graphs and periodizations> [SHOTS dir]
//
// The file: GT16 with two periodizations (MICRO-LAB orizzonti) + a second study
// («Saggio B», its own epochs) — see the referto. The bridge must run an
// s3Dgraphy with `api.chronology` and the epochs' intervals.
//
//   BD1 the switch Epochs ⇄ Horizons in the Matrix's bar: the lanes become the
//       horizons of the periodization chosen beside it (their own style), and
//       back; the choice is the WINDOW's (its state), not the file's
//   BD2 two graphs on, in the same bands: every node in the lane of its band,
//       one tint per graph; a graph switched off leaves, and comes back
//   BD3 a node of the second graph picked IN the picture: its graph comes in
//       front; renamed in the Inspector, the change is in THAT graph's store
//       (the other untouched) and in the picture; ⌘Z takes it back there
//   BD4 the picture moves nothing: a drag on a box writes no position
//   BD5 the Graph of a window in horizons is tinted by them
//   BD6 the Scena 3D: the same switch; its epochs ARE the horizons, the units
//       and the models of each
// MICRO-LAB bande-3:
//   BD9 «fare spazio» in the EPOCHS: 8 and all paradata groups open, nothing
//       on top of something else; a unit dropped by the hand stays, the others
//       make room, groups opened after do not move it; ⌘Z
//   BD10 the graphs as buttons (1–5 graphs; beyond 4, three and «more…»), the
//       bar never scrolls sideways at 1600 and 1280 px, the switch in sight
//   BD11 the Inspector's start/end (dev.74) beside the bands (one chronology
//       per document)
// MICRO-LAB bande-2:
//   BD7 nothing on top of something else (`sceneOverlaps`: boxes, groups,
//       bands, the bands' headers, the «from …» cards) with BOTH periodizations,
//       two graphs and one; the bar does not scroll sideways, the graphs are in
//       a menu
//   BD8 the Scena 3D by horizon with models on disk (MODELS_AT: the path the
//       em.json is opened at, so its files resolve — never written): every
//       model and proxy of an horizon DRAWN, a model in every horizon its epochs
//       overlap, «outside the visible horizons» when a periodization leaves a
//       gap, the empty scene says «horizon», the «Modelli e proxy» sheet by
//       horizon («Horizons with an RM n/N»)
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
// EXPERIMENTAL · the horizons are behind «Funzioni sperimentali»: this check turns
// the switch on in its own browser (experimental-env.mjs), whatever the shell says
import { withExperimental } from "./experimental-env.mjs";

const PORT = process.env.PORT ?? "5180";
const BRIDGE = process.env.BRIDGE ?? "http://127.0.0.1:8780";
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const FILE = process.argv[2];
const SHOTS = process.argv[3] ?? null;
if (!FILE) throw new Error("usage: check-horizon-bands-live.mjs <em.json with two graphs and periodizations> [shots dir]");
const pw = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const chromium = pw.chromium ?? pw.default?.chromium;

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; console.log(`  ✓ ${what}`); };
// (WebGL through SwiftShader: the 3D scene draws its models in a headless shell)
const browser = withExperimental(await chromium.launch({ executablePath: CHR,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }), true);
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(BRIDGE)}`);
await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 60000 });
const doc = JSON.parse(readFileSync(FILE, "utf8"));
const MODELS_AT = process.env.MODELS_AT ?? null;
await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, FILE]);
await page.waitForTimeout(2000);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const D = (f, ...a) => page.evaluate(([f, a]) => window.__EM_DRAG__[f](...a), [f, a]);
const lanesWhen = async (pred, what) => {
  for (let i = 0; i < 120; i++) {
    const b = await D("hzBands");
    if (pred(b)) return b;
    await page.waitForTimeout(500);
  }
  throw new Error(`timeout: ${what}`);
};

const slots = await D("activeSlot");
ok(slots.slots.length === 2, `two study graphs open: ${slots.slots.map((s) => s.label).join(" · ")}`);
const [temple, saggio] = slots.slots;
// (the file may come with another graph in front: E.D.'s rev. 21 opens on Saggio B)
if (slots.id !== temple.id) { await D("activateSlot", temple.id); await page.waitForTimeout(2000); }
const graphWin = (await D("wins")).find((w) => w.type === "graph").id;
const pers = await page.evaluate(() => window.__EM_DRAG__.horizonsStore().doc.graph.nodes
  .filter((n) => n.node_type === "periodization").map((n) => ({ id: n.id, name: n.name })));
const secoli = pers.find((p) => /secoli/i.test(p.name)) ?? pers[0];

// ── BD1 · the switch ────────────────────────────────────────────────────────
await page.waitForSelector(`[data-bands-set="horizons"]`, { timeout: 20000 });
const epochLanes = await page.evaluate(() => window.__EM_DRAG__.lanes().map((l) => l.id));
await shot("bd1-epochs");
await page.click(`.win-bands [data-bands-set="horizons"]`);
await page.waitForSelector("[data-bands-per]", { timeout: 10000 });
ok(await page.$eval(`[data-bands-set="horizons"]`, (b) => b.getAttribute("aria-pressed") === "true"),
   "BD1 «Horizons» pressed in the Matrix's bar, the periodization beside it");
await page.selectOption("[data-bands-per]", secoli.id);
let b = await lanesWhen((x) => x.lanes.some((l) => l.horizon === "horizon"), "horizon lanes");
const hzLanes = b.lanes.filter((l) => l.horizon === "horizon");
ok(hzLanes.length >= 4 && hzLanes.every((l) => l.id.startsWith("hz:")),
   `BD1 the lanes ARE the horizons of «${secoli.name}»: ${hzLanes.map((l) => l.label).join(" · ")}`);
ok(!b.lanes.some((l) => epochLanes.includes(l.id)), "BD1 no epoch lane left in the picture");
const order = hzLanes.map((l) => l.y);
ok(order.every((y, i) => i === 0 || y > order[i - 1]), "BD1 the bands newest on top, as the epochs");
const st = (await D("wins")).find((w) => w.id === graphWin).state;
ok(st["current.lens.bands"] === "horizons" && st["current.lens.bands.per"] === secoli.id,
   "BD1 the switch and the periodization are the WINDOW's state (never the file's)");
const saved = await page.evaluate(() => window.__EM_DRAG__.docJson());
ok(!saved.includes("lens.bands"), "BD1 nothing of it in the em.json");
await page.waitForTimeout(400);
await shot("bd1-horizons");

// ── BD2 · two graphs in the same bands ──────────────────────────────────────
const bySlot = (x, slot) => x.nodes.filter((n) => n.slot === slot);
ok(bySlot(b, temple.id).length > 0 && bySlot(b, saggio.id).length > 0,
   `BD2 both graphs in the picture: ${bySlot(b, temple.id).length} boxes of ${temple.label}, ${bySlot(b, saggio.id).length} of ${saggio.label}`);
const laneOf = (n) => b.lanes.find((l) => n.y + n.h / 2 >= l.y && n.y + n.h / 2 < l.y + l.height)?.id;
const placedRight = b.nodes.filter((n) => n.band).filter((n) => laneOf(n) === n.band).length;
const placed = b.nodes.filter((n) => n.band).length;
ok(placedRight / placed > 0.9, `BD2 the dated boxes stand in the lane of their band: ${placedRight}/${placed}`);
const sagB = bySlot(b, saggio.id).filter((n) => /^US/.test(n.name));
ok(new Set(sagB.map((n) => n.band)).size >= 3, `BD2 «${saggio.label}» spread over its horizons: ${[...new Set(sagB.map((n) => b.lanes.find((l) => l.id === n.band)?.label))].join(", ")}`);
const shared = b.lanes.filter((l) => bySlot(b, temple.id).some((n) => n.band === l.id) && bySlot(b, saggio.id).some((n) => n.band === l.id));
ok(shared.length >= 1, `BD2 the two graphs share bands: ${shared.map((l) => l.label).join(", ")}`);
ok(Object.keys(b.tints).length === 2 && new Set(Object.values(b.tints)).size === 2, "BD2 one tint per graph");
ok(await page.$$eval(`[data-win="${graphWin}"] .win-bands-graphs > .win-bands-graph`, (c) => c.length) === 2
   && !(await page.$(`[data-win="${graphWin}"] [data-bands-more]`)), "BD2 one button per graph in the bar (two graphs: two buttons, no «more…»)");
ok(sagB.some((n) => n.also.length > 0), "BD2 a unit alive in later horizons carries them (↑n)");
await shot("bd2-two-graphs");
const graphItem = async (gid) => { await page.click(`[data-win="${graphWin}"] .win-bands-graphs > .win-bands-graph[data-bands-graph="${gid}"]`); };
await graphItem(saggio.graphId);
b = await lanesWhen((x) => x.off.length === 1 && x.lanes.length > 0, "graph off");
ok(bySlot(b, saggio.id).length === 0 && bySlot(b, temple.id).length > 0, "BD2 a graph switched off leaves the bands");
await graphItem(saggio.graphId);
b = await lanesWhen((x) => x.off.length === 0 && x.nodes.some((n) => n.slot === saggio.id), "graph on");
ok(true, "BD2 …and comes back");

// ── BD3 · a pick in the picture writes to ITS graph ─────────────────────────
{ const a = await D("activeSlot"), sel = await D("selected");
  ok(a.id === temple.id && sel.length === 0, `BD3 before: the first graph in front, nothing selected${a.id === temple.id && !sel.length ? "" : ` (${a.id}, ${JSON.stringify(sel)})`}`); }
// a box of the second graph that is ON the canvas (not under the minimap)
const ws = await D("winScene", graphWin);
const sagIds = new Set(sagB.map((n) => n.id));
const free = await page.evaluate((boxes) => boxes.filter((x) => {
  const el = document.elementFromPoint(x.x + x.w / 2, x.y + x.h / 2);
  return el instanceof HTMLCanvasElement && !el.classList.contains("win-overview");
}).map((x) => x.id), ws.boxes.filter((x) => sagIds.has(x.id)));
const target = sagB.find((n) => free.includes(n.id));
ok(!!target, `BD3 a box of «${saggio.label}» on screen: ${target?.name}`);
const box = ws.boxes.find((x) => x.id === target.id);
await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
await page.waitForTimeout(800);
const after = await D("activeSlot");
ok(after.id === saggio.id, `BD3 a click on «${target.name}» in the picture brings «${saggio.label}» in front`);
ok(JSON.stringify(await D("selected")) === JSON.stringify([target.real]), "BD3 …and selects it there, by its own id");
ok(await page.evaluate(() => window.__EM_DRAG__.hzBands().drawing), "BD3 the window still draws the bands");
await shot("bd3-picked");
const input = page.locator(".insp-name-input:visible").first();
await input.waitFor({ timeout: 10000 });
ok((await input.inputValue()) === target.name, "BD3 the Inspector shows the node of that graph");
await input.fill(`${target.name} rinominata`);
await input.press("Enter");
await page.waitForTimeout(600);
const nameIn = (gid, raw) => page.evaluate(([gid, raw]) => {
  const d = JSON.parse(window.__EM_DRAG__.docJson());
  const g = d.graphs ? Object.values(d.graphs).find((x) => x.graph_id === gid) : d.graph;
  return g?.nodes.find((n) => n.id === raw)?.name ?? null;
}, [gid, raw]);
ok(await nameIn(saggio.graphId, target.real) === `${target.name} rinominata`, "BD3 the rename is in THAT graph (its graph_id)");
ok(!JSON.stringify(JSON.parse(await page.evaluate(() => window.__EM_DRAG__.docJson())).graphs?.[temple.graphId] ?? {}).includes("rinominata"),
   "BD3 the other graph untouched");
b = await lanesWhen((x) => x.nodes.some((n) => n.name === `${target.name} rinominata`), "renamed box");
ok(true, "BD3 the picture shows the new name");
await shot("bd3-edit");
await page.keyboard.press("Escape");
await page.evaluate(() => document.activeElement?.blur());
await page.evaluate(() => window.__EM_DRAG__.undoAny());
await page.waitForTimeout(600);
ok(await nameIn(saggio.graphId, target.real) === target.name, "BD3 ⌘Z takes it back, in that graph");

// ── BD4 · nothing is dragged ────────────────────────────────────────────────
const pos0 = await D("stored", target.real);
const ws2 = await D("winScene", graphWin);
const box2 = ws2.boxes.find((x) => x.id === target.id);
if (box2) {
  await page.mouse.move(box2.x + box2.w / 2, box2.y + box2.h / 2);
  await page.mouse.down();
  await page.mouse.move(box2.x + box2.w / 2 + 80, box2.y + box2.h / 2 + 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}
// (the drag is refused for the box and becomes a rubber band: it may select in
// the other graph, whose boxes it reaches — so the graph is brought back first)
await D("select", target.id);
const pos1 = await D("stored", target.real);
ok(JSON.stringify(pos1) === JSON.stringify(pos0), "BD4 a drag in the bands writes no position in the graph");

// ── BD5 · the Graph of a window in horizons ─────────────────────────────────
await page.click(`[data-win="${graphWin}"] .win-seg button:nth-child(2)`);   // the window's mode «Graph»
await page.waitForTimeout(2500);
const marks = await D("horizonMarks", graphWin);
ok(marks && Object.keys(marks.tint).length > 0, `BD5 the Graph reads by horizons: ${marks ? Object.keys(marks.tint).length : 0} nodes tinted`);
ok((await D("hzBands", graphWin)).lanes.length === 0, "BD5 (the Graph has no bands: only the Matrix lays out by horizons)");
await page.click(`[data-win="${graphWin}"] .win-seg button:nth-child(1)`);   // back to the Matrix
await page.waitForTimeout(800);

// ── BD7 · nothing on top of something else ──────────────────────────────────
const report = [];
for (const p of pers) {
  for (const two of [true, false]) {
    await D("setBandsPeriodization", p.id, graphWin);
    await D("setBandsGraph", saggio.graphId, two, graphWin);
    await lanesWhen((x) => x.periodization === p.id && x.lanes.length > 0 && x.off.length === (two ? 0 : 1), `${p.name} ${two ? 2 : 1}`);
    await page.waitForTimeout(600);
    const o = await D("sceneOverlaps", graphWin, 6);
    report.push(`${p.name} · ${two ? "two graphs" : "one graph"}: ${o.count}/${o.items}`);
    ok(o.count === 0, `BD7 «${p.name}», ${two ? "two graphs" : "one graph"}: ${o.items} boxes, groups, bands, headers and cards — ${o.count} overlaps${o.count ? ` ${JSON.stringify(o.sample)}` : ""}`);
    if (two) await shot(`bd7-${p.name.replace(/\W+/g, "_")}`);
  }
}
await D("setBandsGraph", saggio.graphId, true, graphWin);
await D("setBandsPeriodization", secoli.id, graphWin);
await lanesWhen((x) => x.periodization === secoli.id && x.off.length === 0 && x.lanes.length > 0, "back");
const bar = await page.evaluate((id) => {
  const h = document.querySelector(`[data-win="${id}"] .one-line`) ?? document.querySelector(`[data-win="${id}"]`);
  return h ? { sw: h.scrollWidth, cw: h.clientWidth, left: h.scrollLeft } : null;
}, graphWin);
ok(bar && bar.sw <= bar.cw + 1 && bar.left === 0, `BD7 the Matrix's bar in horizons does not scroll sideways (${bar?.sw} ≤ ${bar?.cw})`);

// ── BD6 · the Scena 3D ──────────────────────────────────────────────────────
// the first graph back in front, by a pick of one of its boxes (its models are the scene's)
const tb = (await D("hzBands")).nodes.find((n) => n.slot === temple.id && /^SU/.test(n.name));
await D("select", tb.id);
await D("select", null);
ok((await D("activeSlot")).id === temple.id, "BD6 a pick of a box of the first graph brings it back in front");
await page.getByRole("button", { name: /^(Space|Spazio)$/ }).first().click();
await page.waitForTimeout(2500);
const sceneWin = (await D("wins")).find((w) => w.type === "scene")?.id;
ok(!!sceneWin, "BD6 a Scena 3D window");
const sp0 = await D("spaceNow");
ok(!sp0.horizons && sp0.epochs.every((e) => !e.id.startsWith("hz:")), "BD6 the scene starts by epochs");
await page.click(`.scn-bar [data-bands-set="horizons"]`, { noWaitAfter: true });
await page.waitForSelector(".scn-bar [data-bands-per]", { timeout: 30000 });
await page.selectOption(".scn-bar [data-bands-per]", secoli.id);
await page.waitForTimeout(2500);
const sp1 = await D("spaceNow");
ok(sp1.horizons && sp1.epochs.length >= 4 && sp1.epochs.every((e) => e.id.startsWith("hz:")),
   `BD6 the scene's epochs ARE the horizons: ${sp1.epochs.map((e) => e.name).join(" · ")}`);
const counts = [];
for (const e of sp1.epochs) {
  await D("setSpaceEpoch", e.id);
  await page.waitForTimeout(200);
  const s = await D("spaceNow");
  counts.push(`${e.name} ${s.units.length}u/${s.rms.length}rm`);
}
ok(counts.some((c) => !/ 0u/.test(c)), `BD6 each horizon its units and models: ${counts.join(", ")}`);
ok((await D("spaceNow")).bar.some((t) => /Horizon|Orizzonte/.test(t)), "BD6 the bar says «Horizon»");
const rich = sp1.epochs.find((e) => /Impero/.test(e.name)) ?? sp1.epochs[0];
await D("setSpaceEpoch", rich.id);
await page.waitForTimeout(1500);
const st6 = (await D("wins")).find((w) => w.id === sceneWin).state;
ok(st6["current.lens.bands"] === "horizons", "BD6 the 3D window remembers its switch");
await shot("bd6-space");
await page.click(`.scn-bar [data-bands-set="epochs"]`, { noWaitAfter: true });
await page.waitForTimeout(800);
ok(!(await D("spaceNow")).horizons, "BD6 back to the epochs");
// ── BD8 · the Scena 3D by horizon, with models on disk ──────────────────────
if (MODELS_AT) {
  // a page of its own, the Space first (as a person opens it): the files of a
  // page that has asked for them from elsewhere stay «missing» for the session
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(BRIDGE)}`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 60000 });
  await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, MODELS_AT]);
  await page.waitForTimeout(3000);
  const D = (f, ...a) => page.evaluate(([f, a]) => window.__EM_DRAG__[f](...a), [f, a]);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  // the Temple in front (its models are the scene's), whatever the file opens on
  { const a = await D("activeSlot"); if (a.id !== a.slots[0].id) { await D("activateSlot", a.slots[0].id); await page.waitForTimeout(1500); } }
  await page.getByRole("button", { name: /^(Space|Spazio)$/ }).first().click();
  await page.waitForTimeout(8000);
  await page.click(`.scn-bar [data-bands-set="horizons"]`, { noWaitAfter: true });
  await page.waitForSelector(".scn-bar [data-bands-per]", { timeout: 30000 });
  for (const p of pers) {
    await page.selectOption(".scn-bar [data-bands-per]", p.id);
    await page.waitForTimeout(2500);
    const sp = await D("spaceNow");
    const rows = [];
    let drawnAll = true, any = 0;
    for (const e of sp.epochs) {
      await D("setSpaceEpoch", e.id);
      let x = await D("spaceNow");
      for (let i = 0; i < 40 && x.drawn.length < x.rms.length + x.withProxy.length; i++) { await page.waitForTimeout(500); x = await D("spaceNow"); }
      const rm = x.drawn.filter((k) => k.startsWith("rm:")).length, px = x.drawn.filter((k) => k.startsWith("proxy:")).length;
      any += rm;
      if (rm < x.rms.length || px < x.withProxy.length) drawnAll = false;
      if (!x.rms.length && !x.withProxy.length)
        ok(x.empty.some((t) => /horizon|orizzonte/i.test(t)) && !x.empty.some((t) => /this epoch|questa epoca/i.test(t)),
           `BD8 «${e.name}» has no body in space, and the scene says «horizon»`);
      rows.push(`${e.name} ${x.units.length}u ${rm}/${x.rms.length}rm ${px}/${x.withProxy.length}px`);
    }
    ok(drawnAll && any > 0, `BD8 «${p.name}»: every model and proxy of each horizon drawn — ${rows.join(" · ")}`);
    if (/CronoFilter/.test(p.name))
      ok(sp.epochs.some((e) => e.id === "hz:~outside"), "BD8 a periodization with a gap where the models live: «outside the visible horizons» in the scene");
    await shot(`bd8-${p.name.replace(/\W+/g, "_")}`);
  }
  const sheet = await page.evaluate(() => [...document.querySelectorAll(".mdl .sum .chip")].map((c) => c.textContent));
  ok(sheet.length === 0 || sheet.some((t) => /Horizons with an RM|Orizzonti con un RM/.test(t)),
     `BD8 the «Modelli e proxy» sheet reads by horizon: ${sheet.join(" · ") || "(sheet not open)"}`);
  await page.click(`.scn-bar [data-bands-set="epochs"]`, { noWaitAfter: true });
  await page.waitForTimeout(800);
}
// ── MICRO-LAB bande-3 ───────────────────────────────────────────────────────
// a page of its own for each: the state of the long page above stays out
const freshPage = async (d, at, vw = 1600) => {
  const pg = await browser.newPage({ viewport: { width: vw, height: 1000 } });
  pg.on("pageerror", (e) => errors.push(String(e)));
  await pg.goto(`http://localhost:${PORT}/em/studio/?bridge=${encodeURIComponent(BRIDGE)}`);
  await pg.waitForFunction(() => !!window.__EM_DRAG__?.openAt, null, { timeout: 60000 });
  await pg.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [d, at]);
  await pg.waitForTimeout(3000);
  return { pg, D: (f, ...a) => pg.evaluate(([f, a]) => window.__EM_DRAG__[f](...a), [f, a]) };
};

// ── BD9 · «fare spazio» in the EPOCHS, and the hand's place kept ────────────
{
  const { pg, D } = await freshPage(doc, FILE);
  const first = (await D("activeSlot")).slots[0];
  await D("activateSlot", first.id);
  await pg.waitForTimeout(2500);
  const folded = await D("folded");
  ok(folded.length > 20, `BD9 the epochs of «${temple.label}»: ${folded.length} paradata groups closed`);
  const o0 = await D("sceneOverlaps", undefined, 4);
  for (const id of folded.slice(0, 8)) await D("fold", id, false);
  await pg.waitForTimeout(2500);
  const o8 = await D("sceneOverlaps", undefined, 4);
  ok(o8.count === 0, `BD9 eight groups opened in the epochs: ${o8.items} items, ${o8.count} overlaps (closed: ${o0.count})${o8.count ? ` ${JSON.stringify(o8.sample)}` : ""}`);
  report.push(`epochs ${temple.label} closed ${o0.count}/${o0.items}, 8 open ${o8.count}/${o8.items}`);
  if (SHOTS) await pg.screenshot({ path: `${SHOTS}/bd9-epochs-8open.png` });
  for (const id of folded.slice(8)) await D("fold", id, false);
  await pg.waitForTimeout(3000);
  const oAll = await D("sceneOverlaps", undefined, 4);
  ok(oAll.count === 0, `BD9 all ${folded.length} open (nested in one another too): ${oAll.items} items, ${oAll.count} overlaps${oAll.count ? ` ${JSON.stringify(oAll.sample)}` : ""}`);
  report.push(`all open ${oAll.count}/${oAll.items}`);
  for (const id of folded) await D("fold", id, true);
  await pg.waitForTimeout(2500);
  // the hand: a unit dropped ONTO its right neighbour stays where it was dropped,
  // the neighbour makes room; ⌘Z takes both back
  const pair = await pg.evaluate(() => {
    const E = window.__EM_DRAG__;
    const units = E.idsOfType("US").concat(E.idsOfType("USVs"), E.idsOfType("USVn"), E.idsOfType("SF"));
    const at = units.filter((id) => !E.memberOf(id)).map((id) => ({ id, r: E.sceneOf(id), lane: E.laneAt(id) })).filter((x) => x.r && x.lane);
    let best = null;
    for (const a of at) for (const b of at) {
      if (a === b || a.lane !== b.lane || Math.abs(a.r.y - b.r.y) > 2 || b.r.x <= a.r.x + a.r.w) continue;
      const d = b.r.x - a.r.x;
      if (!best || d < best.d) best = { a: a.id, b: b.id, ra: a.r, rb: b.r, d };
    }
    return best;
  });
  ok(!!pair, `BD9 two units side by side in a lane: ${pair ? `${pair.a} → ${pair.b}` : "none"}`);
  if (pair) {
    await D("dropAt", pair.a, pair.rb.x, pair.rb.y);
    await pg.waitForTimeout(800);
    const ra = await D("sceneOf", pair.a), rb = await D("sceneOf", pair.b);
    ok(Math.abs(ra.x - pair.rb.x) <= 1 && Math.abs(ra.y - pair.rb.y) <= 1, `BD9 the unit dropped on its neighbour stays where the hand left it (${Math.round(ra.x)},${Math.round(ra.y)})`);
    ok(rb.x >= ra.x + ra.w - 0.5, `BD9 …the neighbour makes room (${Math.round(pair.rb.x)} → ${Math.round(rb.x)})`);
    ok((await D("handPlaced")).includes(pair.a), "BD9 …the drop is written as the hand's (layout.hand_placed)");
    const od = await D("sceneOverlaps", undefined, 4);
    ok(od.count === 0, `BD9 …and nothing on top of something else: ${od.count}`);
    // a group opened next to it: the hand's unit does not move, what is covered does
    for (const id of folded.slice(0, 8)) await D("fold", id, false);
    await pg.waitForTimeout(2500);
    const ra2 = await D("sceneOf", pair.a);
    ok(Math.abs(ra2.x - ra.x) <= 1 && Math.abs(ra2.y - ra.y) <= 1, "BD9 groups opened afterwards: the hand's unit has not moved by itself");
    ok((await D("sceneOverlaps", undefined, 4)).count === 0, "BD9 …and they made room around it");
    for (const id of folded.slice(0, 8)) await D("fold", id, true);
    await pg.waitForTimeout(1200);
    for (let i = 0; i < 17 && (await D("handPlaced")).includes(pair.a); i++) { await D("undo"); await pg.waitForTimeout(150); }
    ok(!(await D("handPlaced")).includes(pair.a), "BD9 ⌘Z takes the drop back, and its mark with it");
  }
  await pg.close();
}

// ── BD10 · the graphs as buttons: 1 to 5 graphs, the bar at 1600 and 1280 ───
{
  const ids = Object.keys(doc.graphs);
  const sag = doc.graphs[ids[1]];
  const withN = (n) => {
    const d = structuredClone(doc);
    const keep = ids.slice(0, Math.min(n, 2));
    d.graphs = Object.fromEntries(Object.entries(d.graphs).filter(([k, g]) => !(k === ids[0] || k === ids[1]) || keep.includes(k)));
    for (let k = 3; k <= n; k++) {
      const g = structuredClone(sag);
      g.graph_id = `${sag.graph_id}-copia-${k}`;
      g.name = `Saggio ${String.fromCharCode(64 + k)} — copia per la prova dei pulsanti`;
      d.graphs[g.graph_id] = g;
    }
    d.active_graph_id = ids[0];
    return d;
  };
  for (const vw of [1600, 1280]) {
    for (const n of [1, 2, 3, 4, 5]) {
      const { pg, D } = await freshPage(withN(n), FILE, vw);
      const slotsN = (await D("activeSlot")).slots.length;
      const win = (await D("wins")).find((w) => w.type === "graph").id;
      await D("setBands", "horizons", win);
      await D("setBandsPeriodization", secoli.id, win);
      await pg.waitForTimeout(1500);
      const bar = await pg.evaluate((id) => {
        const w = document.querySelector(`[data-win="${id}"]`);
        const h = w?.querySelector(".one-line") ?? w;
        const btns = [...(w?.querySelectorAll(".win-bands-graphs > .win-bands-graph") ?? [])].map((b) => b.textContent.trim());
        const more = w?.querySelector("[data-bands-more]")?.textContent.trim() ?? null;
        const sw = [...(w?.querySelectorAll(".win-bands-seg button") ?? [])].map((b) => {
          const r = b.getBoundingClientRect(), hr = h.getBoundingClientRect();
          return r.width > 0 && r.left >= hr.left - 1 && r.right <= hr.right + 1 && r.right <= innerWidth;
        });
        return { sw: h.scrollWidth, cw: h.clientWidth, left: h.scrollLeft, btns, more, switchSeen: sw.length === 2 && sw.every(Boolean) };
      }, win);
      const want = slotsN < 2 ? 0 : slotsN <= 4 ? slotsN : 3;
      ok(slotsN === n && bar.btns.length === want && (slotsN > 4 ? /\(2\)|\(\d\)/.test(bar.more ?? "") : bar.more === null),
         `BD10 ${vw}px, ${n} graph${n > 1 ? "s" : ""}: ${bar.btns.length} button${bar.btns.length === 1 ? "" : "s"}${bar.more ? ` + «${bar.more}»` : ""}`);
      ok(bar.sw <= bar.cw + 1 && bar.left === 0, `BD10 ${vw}px, ${n} graphs: the bar does not scroll sideways (${bar.sw} ≤ ${bar.cw})`);
      ok(bar.switchSeen, `BD10 ${vw}px, ${n} graphs: Epochs ⇄ Horizons in plain sight`);
      if (n === 5) {
        await pg.click(`[data-win="${win}"] [data-bands-more]`);
        const items = await pg.$$eval(".win-bands-graphs-menu:not(.hidden) .win-bands-graph", (c) => c.length);
        ok(items === 2, `BD10 «more…» holds the other ${items}`);
        const gid = await pg.$eval(".win-bands-graphs-menu:not(.hidden) .win-bands-graph", (b) => b.dataset.bandsGraph);
        await pg.click(`.win-bands-graphs-menu:not(.hidden) .win-bands-graph[data-bands-graph="${gid}"]`);
        await pg.waitForTimeout(800);
        ok((await D("hzBands", win)).off.length === 1, "BD10 …and a click there switches that graph off");
        if (SHOTS) await pg.screenshot({ path: `${SHOTS}/bd10-${vw}-5graphs.png` });
      }
      if (SHOTS && n === 4) await pg.screenshot({ path: `${SHOTS}/bd10-${vw}-4graphs.png` });
      await pg.close();
    }
  }
}

// ── BD11 · the Inspector's start and end after the merge with main ──────────
{
  const { pg, D } = await freshPage(doc, FILE);
  await D("activateSlot", (await D("activeSlot")).slots[0].id);
  await pg.waitForTimeout(1500);
  const su020 = await pg.evaluate(() => window.__EM_DRAG__.idsOfType("US").find((id) => window.__EM_DRAG__.nodeName(id) === "SU020"));
  const timeRows = async () => {
    await pg.waitForFunction(() => document.querySelector('.insp-time [data-time="end"]') && !/computing|calcol/i.test(document.querySelector(".insp-time").textContent), null, { timeout: 90000 }).catch(() => {});
    return pg.evaluate(() => [...document.querySelectorAll(".insp-time .insp-prop-row")].map((x) => ({ side: x.dataset.time, rule: x.dataset.rule,
      value: x.querySelector(".insp-prop-value")?.textContent, from: x.querySelector(".insp-prop-source")?.textContent })));
  };
  await D("select", su020);
  const t1 = await timeRows();
  const st = t1.find((x) => x.side === "start"), en = t1.find((x) => x.side === "end");
  // (the GT16's chronology takes the bridge ~18 s; XX sec ends in 2013 in E.D.'s rev. 21)
  ok(st?.value === "1978" && st?.rule === "written" && /^\d{4}$/.test(en?.value ?? "") && en?.rule === "epoch" && /XX/.test(en?.from ?? ""),
     `BD11 SU020: start ${st?.value} (${st?.rule}), end ${en?.value} (${en?.rule}, ${en?.from})`);
  // the Matrix in horizons asks too, for BOTH graphs: the Inspector keeps its answer
  const win = (await D("wins")).find((w) => w.type === "graph").id;
  await D("setBands", "horizons", win);
  await D("setBandsPeriodization", secoli.id, win);
  await pg.waitForTimeout(3000);
  await D("select", null);
  await D("select", su020);
  const t2 = await timeRows();
  ok(JSON.stringify(t2) === JSON.stringify(t1), "BD11 …the same with the Matrix in horizons asking for both graphs (one answer per document)");
  if (SHOTS) await pg.screenshot({ path: `${SHOTS}/bd11-inspector.png` });
  await pg.close();
}

console.log(`  overlaps: ${report.join(" | ")}`);

ok(errors.length === 0, `no page error${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
console.log(`check-horizon-bands-live: ${checks} checks green`);
