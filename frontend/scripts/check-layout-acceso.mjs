// MICRO-V (E.D., 18 Nov 2026: «accendere le strategie di layout scelte») · the
// case of USV158 on the v10, in a real page (EM_V9 = a copy of the v10):
//
//   node scripts/check-layout-acceso.mjs     (PORT=<a Vite of this tree>, EM_V9=…,
//                                             ED_SEED=<a person's localStorage, JSON>)
//
//  · USV158 dropped by hand under USV145 (over VSF142's box) WITHOUT Shift: a
//    place only — it stays `is_in_activity VAct.04`, no box lit; the archive
//    gets the place relative to USV145 (F(2)); «Disponi» leaves it there;
//  · WITH Shift at the release: VSF142's box lit during the drag, then
//    `is_part_of VSF142` and a message that says what changed; one undo puts
//    `is_in_activity VAct.04` back;
//  · the preference «Disponi rispetta dove lascio i nodi» off: the drop's delta
//    in the archive, as before (both states);
//  · «Disponi» with a filter tighter than the default (E.D.'s preferences, or
//    the authors' ring hidden): the ARCHIVE is laid out (one undo step) and the
//    reopened file shows what «Disponi» showed;
//  · «Disponi riducendo gli incroci» from the Matrix's «⋯»: one undo step, and
//    the view it leaves crosses less than the plain «Disponi»'s (it says both);
//  · a node with no epoch reached from a lane (G): in that lane, marked
//    «senza epoca» (the scene's mark, the tooltip).
import { readFileSync } from "node:fs";
import { bench } from "./page-bench.mjs";

const B = await bench("check-layout-acceso");
if (!B) process.exit(0);
let checks = 0;
const fails = [];
const ok = (c, what) => { if (c) checks++; else fails.push(what); };

const { page, errors } = await B.open();
const H = (fn, arg) => page.evaluate(fn, arg);
await page.waitForTimeout(2500);
const ids = await H(() => { const o = {}; for (const id of window.__EM_SCENE__().nodes) { const n = window.__EM_DRAG__.nodeName(id); if (n && !o[n]) o[n] = id; } return o; });
const U158 = ids.USV158, U145 = ids.USV145, V142 = ids.VSF142;
ok(U158 && U145 && V142, "USV158, USV145, VSF142 in the v10");
const ACT = await H((id) => window.__EM_DRAG__.memberships(id).find((m) => m.edge === "is_in_activity")?.target ?? null, U158);
ok(!!ACT, "USV158 is_in_activity (VAct.04) at the opening");
const mem = () => H((id) => window.__EM_DRAG__.memberships(id).map((m) => `${m.edge}>${m.target}`).sort().join(","), U158);
const mem0 = await mem();

const frame = async (pg = page) => {
  const g = await pg.evaluate(() => window.__EM_DRAG__.groupBoxes().find((x) => x.title === "VAct.04 Temple"));
  await pg.evaluate(([x, y, w, h]) => window.__EM_DRAG__.frameWorld(x - 40, y - 40, w + 80, h + 80, 10), [g.x, g.y, g.w, g.h]);
  await pg.waitForTimeout(700);
};
const box = (id, pg = page) => pg.evaluate((id) => window.__EM_DRAG__.winScene(window.__EM_DRAG__.activeWinId()).boxes.find((b) => b.id === id), id);
const pos = (id, pg = page) => pg.evaluate((id) => window.__EM_DRAG__.viewPosition(id), id);
const toastText = () => H(() => document.getElementById("toast")?.textContent ?? "");
/** a drag of a node box to the page point (tx, ty); `shift`: held from midway to the release */
async function drag(id, tx, ty, { shift = false } = {}) {
  const b = await box(id);
  const sx = b.x + b.w / 2, sy = b.y + b.h / 3;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  let lit = null;
  for (let i = 1; i <= 12; i++) {
    if (shift && i === 6) await page.keyboard.down("Shift");
    await page.mouse.move(sx + (tx - sx) * i / 12, sy + (ty - sy) * i / 12);
  }
  lit = await H(() => window.__EM_DRAG__.litDropTarget());
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await page.waitForTimeout(900);
  await H(() => window.__EM_DRAG__.select(null));
  return lit;
}
const disponi = async () => { await H(() => window.__EM_DRAG__.reflowAll()); await page.waitForTimeout(3500); await frame(); };

await frame();
const log = (...a) => { if (process.env.VERBOSE) console.log(...a); };
const where = async (tag) => log(tag, JSON.stringify(Object.fromEntries(await Promise.all([["USV145", U145], ["USV158", U158], ["VSF142", V142]].map(async ([n, id]) => { const p = await pos(id); return [n, p.view && [Math.round(p.view.x), Math.round(p.view.y), "arch", Math.round(p.arch?.x), Math.round(p.arch?.y)]]; })))));
await where("open");
/** F(2): the archive keeps the drop's offset from its anchor (the nearest node of the view) */
const anchoredOk = async (what) => {
  const anchor = await H(() => window.__EM_DRAG__.dropAnchor());
  const p = await pos(U158), q = anchor ? await pos(anchor.near) : null;
  ok(anchor?.id === U158 && q?.arch && Math.abs((p.arch.x - q.arch.x) - (p.view.x - q.view.x)) < 1.5
    && Math.abs((p.arch.y - q.arch.y) - (p.view.y - q.view.y)) < 1.5,
  `F(2) ${what}: the archive keeps the offset from the nearest node (${await H((id) => window.__EM_DRAG__.nodeName(id), anchor?.near ?? "")}, ${Math.round(anchor?.d ?? -1)} px)`);
  return anchor;
};

// 1 · USV158 moved right of VSF142 (where E.D. found it), then «Disponi»
let v = await box(V142), u = await box(U158);
await drag(U158, v.x + v.w + 40 + u.w / 2, u.y + u.h / 3);
ok((await mem()) === mem0, "a drop right of VSF142 changes no membership");
await anchoredOk("right of VSF142");
await where("moved right");

// 2 · E.D.'s gesture: by hand back under USV145, no Shift → «Disponi» → it stays
let a = await box(U145);
u = await box(U158);
// USV145's column, the row under it (76 world px lower, as the layout has it)
await drag(U158, a.x + a.w / 2, a.y + a.h / 3 + a.h * 76 / 32);
ok((await mem()) === mem0, `under USV145, no Shift: USV158 keeps is_in_activity VAct.04 (${await mem()})`);
const an2 = await anchoredOk("under USV145");
ok(an2?.near === U145, "…and that node is USV145");
await where("by hand under USV145");
await disponi();
await where("disponi 2");
{
  const p158 = (await pos(U158)).view, p145 = (await pos(U145)).view, pv = (await pos(V142)).view;
  const c158 = p158.x + p158.w / 2, c145 = p145.x + p145.w / 2;
  ok(Math.abs(c158 - c145) < 60 && p158.y > p145.y, `after «Disponi» USV158 stays under USV145 (Δx ${Math.round(c158 - c145)})`);
  ok(p158.x + p158.w <= pv.x + 1, "USV158 left of VSF142 (its edge does not cross the box)");
  ok((await mem()) === mem0, "after «Disponi»: still is_in_activity VAct.04");
}

// 2b · dropped right over VSF142's box, no Shift: a place, nothing lit, no edge changes
await frame();
v = await box(V142);
const d2b = await H(() => window.__EM_DRAG__.undoDepth());
const litNoShift = await drag(U158, v.x + v.w / 2, v.y + v.h * 0.7);
ok(!litNoShift || litNoShift.kind !== "group", `over VSF142 without Shift: no box lit (${JSON.stringify(litNoShift)})`);
ok((await mem()) === mem0, `over VSF142 without Shift: still is_in_activity VAct.04 (${await mem()})`);
ok((await H(() => window.__EM_DRAG__.undoDepth())) === d2b + 1, "the drop is one undo step");
await H(() => window.__EM_DRAG__.undo());
await page.waitForTimeout(600);

// 2c · moved right of VSF142 and «Disponi» straight away: C puts it back on
// its neighbour's side (USV145 is left of the box) — what C does, said
await frame();
v = await box(V142); u = await box(U158);
await drag(U158, v.x + v.w + 40 + u.w / 2, u.y + u.h / 3);
await disponi();
await where("right, then disponi");
{
  const p158 = (await pos(U158)).view, pv = (await pos(V142)).view;
  ok(p158.x + p158.w <= pv.x + 1, "C: a leaf whose neighbours are all left of a group goes left of it at «Disponi»");
}

// 3 · with Shift at the release: VSF142 joined, said, one undo back
await frame();
const undo0 = await H(() => window.__EM_DRAG__.undoDepth());
v = await box(V142);
const litShift = await drag(U158, v.x + v.w / 2, v.y + v.h * 0.7, { shift: true });
ok(litShift?.kind === "group" && litShift.id === V142, `Shift: VSF142's box lit during the drag (${JSON.stringify(litShift)})`);
const m2 = await mem();
ok(m2 === `is_part_of>${V142}`, `Shift: USV158 is_part_of VSF142 (${m2})`);
const said = await toastText();
ok(/is_in_activity/.test(said) && /is_part_of/.test(said) && /VSF142/.test(said), `the message says what changed («${said}»)`);
ok((await H(() => window.__EM_DRAG__.undoDepth())) === undo0 + 1, "the Shift drop is ONE undo step");
await H(() => window.__EM_DRAG__.undo());
await page.waitForTimeout(600);
ok((await mem()) === mem0, `one undo: is_in_activity VAct.04 again (${await mem()})`);

// 4 · the preference off: the delta, as before
async function setDropAsOrder(on) {
  await H(() => document.getElementById("btn-settings")?.click());
  await page.waitForTimeout(500);
  await H((on) => { const el = document.getElementById("set-drop-as-order"); el.checked = on; document.getElementById("settings-save").click(); }, on);
  await page.waitForTimeout(500);
}
const prefShown = await H(() => !!document.getElementById("set-drop-as-order"));
ok(prefShown, "the Preferences have «Disponi rispetta dove lascio i nodi»");
await setDropAsOrder(false);
ok((await H(() => JSON.parse(localStorage.getItem("emstudio.settings") ?? "{}")?.interaction?.dropAsOrder)) === false, "the preference saved off");
await frame();
{
  const before = await pos(U158);
  u = await box(U158);
  await drag(U158, u.x + u.w / 2 + 60, u.y + u.h / 3);
  const after = await pos(U158);
  const dv = after.view.x - before.view.x, da = after.arch.x - before.arch.x;
  ok(Math.abs(dv - da) < 1.5 && Math.abs(dv) > 20, `off: the archive moved by the view's delta (${Math.round(dv)} / ${Math.round(da)})`);
  await H(() => window.__EM_DRAG__.undo());
  await page.waitForTimeout(500);
}
await setDropAsOrder(true);
ok((await H(() => JSON.parse(localStorage.getItem("emstudio.settings") ?? "{}")?.interaction?.dropAsOrder)) === true, "the preference saved on again");

// 5 · «Disponi riducendo gli incroci» from the Matrix's «⋯»: one undo step
{
  const archBefore = await H(() => JSON.stringify(Object.values(JSON.parse(window.__EM_DRAG__.docJson()).graphs)[0].layout?.positions ?? {}));
  const d0 = await H(() => window.__EM_DRAG__.undoDepth());
  const opened = await H(() => {
    const t = [...document.querySelectorAll(".win-more")].find((b) => b.getBoundingClientRect().width > 0);
    t?.click();
    return !!t;
  });
  await page.waitForTimeout(300);
  const item = await H(() => { const b = [...document.querySelectorAll(".dd-menu button")].find((x) => x.textContent?.trim() === "Disponi riducendo gli incroci" && x.getBoundingClientRect().width > 0); b?.click(); return !!b; });
  ok(opened && item, "«Disponi riducendo gli incroci» in the Matrix's «⋯», beside «Disponi»");
  const both = await H(() => [...document.querySelectorAll(".dd-menu button")].map((x) => x.textContent?.trim()));
  ok(both.includes("Disponi"), "«Disponi» in the same menu");
  let tst = "";
  for (let i = 0; i < 40 && !/incroci/.test(tst); i++) { tst = await toastText(); if (!/incroci/.test(tst)) await page.waitForTimeout(150); }
  ok(/incroci/.test(tst), `it says so («${tst}»)`);
  // kept only when the view it leaves crosses less: «146 → 86» on the v10
  const m = /(\d+) → (\d+)/.exec(tst);
  ok(m && Number(m[2]) < Number(m[1]), `the view it leaves crosses less (${m?.[1]} → ${m?.[2]})`);
  await page.waitForTimeout(2500);
  ok((await H(() => window.__EM_DRAG__.undoDepth())) === d0 + 1, "«Disponi riducendo gli incroci» is one undo step");
  await H(() => window.__EM_DRAG__.undo());
  await page.waitForTimeout(1500);
  const archAfter = await H(() => JSON.stringify(Object.values(JSON.parse(window.__EM_DRAG__.docJson()).graphs)[0].layout?.positions ?? {}));
  ok(archAfter === archBefore, "one undo gives the archive back");
}
ok(!errors.length, `no page errors (${errors.join(" | ")})`);
await page.close();

// 6 · «Disponi» with a filter tighter than the default: the archive is laid out
{
  const seed = process.env.ED_SEED ? JSON.parse(readFileSync(process.env.ED_SEED, "utf8"))
    : { "emstudio.detailLeaves": JSON.stringify({ matrix: [] }) };
  const { page: p2, errors: e2 } = await B.open({ seed });
  await p2.waitForTimeout(2500);
  const tighter = await p2.evaluate(() => window.__EM_DRAG__.winScene(window.__EM_DRAG__.activeWinId()).boxes.length);
  const rev0 = await p2.evaluate(() => JSON.stringify(Object.values(JSON.parse(window.__EM_DRAG__.docJson()).graphs)[0].layout?.positions ?? {}));
  const d0 = await p2.evaluate(() => window.__EM_DRAG__.undoDepth());
  await p2.evaluate(() => window.__EM_DRAG__.reflowAll());
  await p2.waitForTimeout(4000);
  const d1 = await p2.evaluate(() => window.__EM_DRAG__.undoDepth());
  ok(d1 === d0 + 1, `filtered: «Disponi» is one undo step on the archive (${d0} → ${d1}, ${tighter} boxes)`);
  const doc = await p2.evaluate(() => window.__EM_DRAG__.docJson());
  const rev1 = JSON.stringify(Object.values(JSON.parse(doc).graphs)[0].layout?.positions ?? {});
  ok(typeof rev1 === "string" && rev1.length > 10, "the archive is written");
  void rev0;
  const shown = await p2.evaluate(() => Object.fromEntries(window.__EM_SCENE__().nodes.map((id) => [id, window.__EM_DRAG__.viewPosition(id).view])));
  await p2.close();
  // the reopened file: the same view
  const { page: p3, errors: e3 } = await B.open({ seed, with: JSON.parse(doc) });
  await p3.waitForTimeout(3000);
  const again = await p3.evaluate(() => Object.fromEntries(window.__EM_SCENE__().nodes.map((id) => [id, window.__EM_DRAG__.viewPosition(id).view])));
  let same = 0, diff = 0;
  for (const [id, r] of Object.entries(shown)) {
    const q = again[id];
    if (!r || !q) continue;
    if (Math.abs(r.x - q.x) < 0.5 && Math.abs(r.y - q.y) < 0.5) same++; else diff++;
  }
  ok(same > 50 && diff === 0, `reopened: the view «Disponi» showed (${same} same, ${diff} moved)`);
  ok(!e2.length && !e3.length, `no page errors (filtered) (${[...e2, ...e3].join(" | ")})`);
  await p3.close();
}

// 7 · G: a node with no epoch reached from a lane, marked «senza epoca»
{
  const doc = structuredClone(B.doc);
  const g = Object.values(doc.graphs)[0];
  const u145 = g.nodes.find((n) => n.name === "USV145"), u158 = g.nodes.find((n) => n.name === "USV158");
  g.nodes.push({ id: "microv-noepoch", name: "G senza epoca", node_type: "Group", description: "MICRO-V", data: {} });
  for (const s of [u145, u158])
    g.edges.push({ id: `microv-${s.id}`, edge_type: "generic_connection", source: s.id, target: "microv-noepoch" });
  const { page: p4, errors: e4 } = await B.open({ with: doc });
  await p4.waitForTimeout(2500);
  // a node the file places nowhere is drawn after a «Disponi» (as the Basilica's)
  await p4.evaluate(() => window.__EM_DRAG__.reflowAll());
  await p4.waitForTimeout(4000);
  const noEpoch = await p4.evaluate(() => window.__EM_DRAG__.noEpochNodes());
  ok(noEpoch.includes("microv-noepoch"), `G: the node placed by its sources (${noEpoch.length})`);
  const marked = await p4.evaluate(() => window.__EM_DRAG__.noEpochMarked());
  ok(marked.includes("microv-noepoch"), "G: marked «senza epoca» in the Matrix");
  const lane145 = await p4.evaluate(([a, b]) => {
    const sw = JSON.parse(window.__EM_DRAG__.viewLayoutIO()).output.swimlanes;
    const at = (id) => { const r = window.__EM_DRAG__.viewPosition(id).view; if (!r) return `${id}: no view place`; const cy = r.y + r.h / 2; return sw.find((l) => cy >= l.y && cy < l.y + l.height)?.epoch_id; };
    return [at(a), at(b)];
  }, [u145.id, "microv-noepoch"]);
  ok(lane145[0] && lane145[0] === lane145[1], `G: in the lane of USV145 (${lane145.join(" / ")})`);
  // the tooltip says it
  const gb = await p4.evaluate(() => window.__EM_DRAG__.sceneOf("microv-noepoch"));
  await p4.evaluate(([x, y, w, h]) => window.__EM_DRAG__.frameWorld(x - 200, y - 200, w + 400, h + 400, 10), [gb.x, gb.y, gb.w, gb.h]);
  await p4.waitForTimeout(700);
  const bb = await box("microv-noepoch", p4);
  await p4.mouse.move(bb.x + bb.w / 2, bb.y + bb.h / 2);
  await p4.waitForTimeout(400);
  await p4.mouse.move(bb.x + bb.w / 2 + 1, bb.y + bb.h / 2);
  await p4.waitForTimeout(400);
  const tip = await p4.evaluate(() => document.querySelector("[data-no-epoch]")?.textContent ?? "");
  ok(/senza epoca/i.test(tip), `G: the tooltip says «senza epoca» («${tip.slice(0, 60)}»)`);
  ok(!e4.length, `no page errors (G) (${e4.join(" | ")})`);
  await p4.close();
}

await B.close();
if (fails.length) {
  console.error(`✗ check-layout-acceso: ${fails.length} failed, ${checks} passed`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ check-layout-acceso: ${checks} checks passed`);
