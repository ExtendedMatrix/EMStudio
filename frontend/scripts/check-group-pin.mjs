// MICRO-Q p.1 (E.D., 17 Nov 2026, on dev.128: «trascinando un gruppo, torna da
// solo al suo posto al ridisegno successivo») · a group dragged by the hand, in a
// real page on Templu Mare (EM_V9 = a copy of the v10, or the v9):
//
//   node scripts/check-group-pin.mjs        (PORT=<a Vite of this tree>, EM_V9=…)
//
// Matrix:
//  · the group moves with its members and STAYS at the release (the cause: the
//    drop wrote only the archive while the Matrix draws its view layout);
//  · it is FIXED (`layout.pinned`) in the same step: one undo puts it back and
//    frees it, one redo moves and fixes it again;
//  · it survives a redraw (a selection, an edit elsewhere) and a save + reopen
//    (em-core keeps a pinned group rigid), with nothing of its lane drawn over it;
//  · dropped outside its epoch's band: allowed, the border warns (outline +
//    tooltip);
//  · «Riordina il gruppo» (its context menu) frees it, «Riordina tutto» frees
//    every group fixed.
// Graph: a group's disc drags its members; undo / redo.
import { bench } from "./page-bench.mjs";

const B = await bench("check-group-pin");
if (!B) process.exit(0);
let checks = 0;
const fails = [];
const ok = (c, what) => { if (c) checks++; else fails.push(what); };

const { page, errors } = await B.open();
const H = (fn, arg) => page.evaluate(fn, arg);
await page.waitForTimeout(2000);
// the graph's canvas, read at each gesture (the windows settle after the opening)
const cvNow = () => H(() => { const c = [...document.querySelectorAll("canvas")].find((c) => c.getBoundingClientRect().width > 300); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
let cv = await cvNow();
const groups = () => H(() => window.__EM_DRAG__.groupBoxes());
const box = async (id) => (await groups()).find((g) => g.id === id);
const pinned = () => H(() => JSON.parse(window.__EM_DRAG__.docJson())).then((d) => Object.values(d.graphs ?? {})[0]?.layout?.pinned ?? []);
const frame = (g, k = 3) => H(([x, y, w, h, k]) => window.__EM_DRAG__.frameWorld(x - w * (k - 1) / 2, y - h * k, w * k, h * (2 * k + 1)), [g.x, g.y, g.w, g.h, k]);
// Alt held: a MOVE (no group under the release takes the dragged one as a member)
async function drag(g, dxs, dys, steps = 10) {
  cv = await cvNow();
  const px = cv.x + g.sx + Math.min(18, g.sw / 3), py = cv.y + g.sy + Math.max(3, Math.min(6, g.sh / 3));
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.keyboard.down("Alt");
  for (let i = 1; i <= steps; i++) await page.mouse.move(px + (dxs * i) / steps, py + (dys * i) / steps);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.waitForTimeout(500);
}
/** the drawn nodes over a group's box that are not its own */
const intruders = (id) => H((gid) => {
  const g = window.__EM_DRAG__.groupBoxes().find((x) => x.id === gid);
  const mine = new Set([gid]);
  const memberOf = (n) => window.__EM_DRAG__.memberOf(n);
  const scene = window.__EM_SCENE__();
  // its own: everything whose box lies inside the group's (members, nested groups)
  const out = [];
  const groupIds = new Set(window.__EM_DRAG__.groupBoxes().map((x) => x.id));
  for (const n of scene.nodes) {
    // a group around it is its parent, not an intruder: the leaves are what count
    // (a closed paradata group is a tablet on its unit, drawn as its chip)
    if (mine.has(n) || memberOf(n) === gid || groupIds.has(n) || window.__EM_DRAG__.node(n)?.node_type === "ParadataNodeGroup") continue;
    const b = window.__EM_DRAG__.sceneOf(n);
    if (!b || !(b.w > 0)) continue;
    const inside = b.x >= g.x - 1 && b.y >= g.y - 1 && b.x + b.w <= g.x + g.w + 1 && b.y + b.h <= g.y + g.h + 1;
    const meets = b.x < g.x + g.w && g.x < b.x + b.w && b.y < g.y + g.h && g.y < b.y + b.h;
    if (meets && !inside) out.push(n);
  }
  return out;
}, id);

// ── Matrix: drag, stay, pinned ────────────────────────────────────────────
const all = await groups();
const target = all.find((g) => g.title === "VSF155") ?? all.find((g) => g.w > 150 && g.h < 200);
ok(!!target, "a group to drag (VSF155 on Templu Mare)");
await frame(target);
await page.waitForTimeout(400);
const g0 = await box(target.id);
const memberIds = await H((gid) => window.__EM_SCENE__().nodes.filter((n) => {
  const b = window.__EM_DRAG__.sceneOf(n), g = window.__EM_DRAG__.groupBoxes().find((x) => x.id === gid);
  // (a closed paradata group is a tablet on its unit, not a member)
  return n !== gid && b && window.__EM_DRAG__.node(n)?.node_type !== "ParadataNodeGroup" && b.x >= g.x && b.y >= g.y && b.x + b.w <= g.x + g.w && b.y + b.h <= g.y + g.h;
}), target.id);
const m0 = memberIds[0] ? await H((id) => window.__EM_DRAG__.sceneOf(id), memberIds[0]) : null;
await drag(g0, 130, 46);
const g1 = await box(target.id);
const dx = g1.x - g0.x, dy = g1.y - g0.y;
ok(Math.abs(dx) > 20 && Math.abs(dy) > 5, `the group moved at the release (Δ ${dx.toFixed(1)}, ${dy.toFixed(1)})`);
if (m0) {
  const m1 = await H((id) => window.__EM_DRAG__.sceneOf(id), memberIds[0]);
  ok(Math.abs(m1.x - m0.x - dx) < 0.6 && Math.abs(m1.y - m0.y - dy) < 0.6, "…its members with it, by the same delta");
}
ok(g1.pinned, "…fixed (the scene says pinned)");
ok((await pinned()).includes(target.id), "…in the file's layout.pinned");
await H(() => window.__EM_DRAG__.select(null));
await page.waitForTimeout(300);
const other = await H(() => window.__EM_SCENE__().nodes.find((id) => /^US/.test(String(window.__EM_DRAG__.node(id)?.node_type ?? ""))));
await H((id) => window.__EM_DRAG__.renameNode?.(id, `${window.__EM_DRAG__.nodeName?.(id) ?? "US"}·`), other);
await page.waitForTimeout(600);
const g2 = await box(target.id);
ok(Math.abs(g2.x - g1.x) < 0.6 && Math.abs(g2.y - g1.y) < 0.6, `a redraw (selection, an edit elsewhere): it stays (${g2.x.toFixed(1)},${g2.y.toFixed(1)} vs ${g1.x.toFixed(1)},${g1.y.toFixed(1)})`);
await H(() => window.__EM_DRAG__.undo());   // the rename
await page.waitForTimeout(400);
// undo / redo of the drop
await H(() => window.__EM_DRAG__.undo());
await page.waitForTimeout(500);
const gu = await box(target.id);
ok(Math.abs(gu.x - g0.x) < 0.6 && Math.abs(gu.y - g0.y) < 0.6, "one undo: back where it was");
ok(!gu.pinned && !(await pinned()).includes(target.id), "…and not fixed");
await H(() => window.__EM_DRAG__.redo());
await page.waitForTimeout(500);
const gr = await box(target.id);
ok(Math.abs(gr.x - g1.x) < 0.6 && Math.abs(gr.y - g1.y) < 0.6 && gr.pinned, "one redo: moved and fixed again");

// ── save + reopen ─────────────────────────────────────────────────────────
const saved = await H(() => window.__EM_DRAG__.docJson());
await H(([d]) => window.__EM_DRAG__.openAt(JSON.parse(d), "/tmp/group-pin-reopen.em.json"), [saved]);
await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 90000 });
await page.waitForTimeout(2500);
const go = await box(target.id);
ok(!!go && Math.abs(go.x - g1.x) < 0.6 && Math.abs(go.y - g1.y) < 0.6, `saved and reopened: where it was left (${go?.x.toFixed(1)},${go?.y.toFixed(1)} vs ${g1.x.toFixed(1)},${g1.y.toFixed(1)})`);
ok(go?.pinned, "…still fixed");
const intr = await intruders(target.id);
ok(intr.length === 0, `…nothing of the rest drawn over it (the layout arranged around it): ${intr.slice(0, 5).join(", ")}`);

// ── «Riordina il gruppo» from its context menu ────────────────────────────
await frame(go);
await page.waitForTimeout(400);
const gc = await box(target.id);
cv = await cvNow();
await page.mouse.click(cv.x + gc.sx + Math.min(18, gc.sw / 3), cv.y + gc.sy + 4, { button: "right" });
await page.waitForTimeout(400);
const item = await H(() => { const b = document.querySelector('[data-cmd="reflow-group"]'); return b ? b.textContent : null; });
ok(!!item && /Riordina il gruppo/.test(item), `the group's menu offers «Riordina il gruppo» (${item})`);
await H(() => document.querySelector('[data-cmd="reflow-group"]')?.click());
await page.waitForTimeout(2500);
const gf = await box(target.id);
ok(gf && !gf.pinned && !(await pinned()).includes(target.id), "«Riordina il gruppo»: no longer fixed");
ok(gf && (Math.abs(gf.x - go.x) > 1 || Math.abs(gf.y - go.y) > 1), `…and the layout placed it again (${gf?.x.toFixed(1)},${gf?.y.toFixed(1)})`);
await H(() => window.__EM_DRAG__.undo());
await page.waitForTimeout(800);
ok((await pinned()).includes(target.id), "undo of «Riordina»: fixed again");

// ── out of its epoch's band ───────────────────────────────────────────────
const lanes = await H(() => window.__EM_DRAG__.lanes());
const gb = await box(target.id);
const mine = lanes.find((l) => gb.y >= l.y - 1 && gb.y < l.y + l.h);
// the band below it, else the one above
const below = lanes.filter((l) => l.y > (mine?.y ?? 0)).sort((a, b) => a.y - b.y)[0]
  ?? lanes.filter((l) => l.y < (mine?.y ?? 0)).sort((a, b) => b.y - a.y)[0];
if (mine && below) {
  const top = Math.min(mine.y, below.y), bottom = Math.max(mine.y + mine.h, below.y + below.h);
  await H(([x, y, w, h]) => window.__EM_DRAG__.frameWorld(x, y, w, h), [gb.x - 200, top, gb.w + 400, bottom - top]);
  await page.waitForTimeout(400);
  const gs = await box(target.id);
  const vp = await H(() => window.__EM_SCENE__().vp);
  await drag(gs, 0, (below.y + below.h / 2 - gs.y) * vp.scale);
  const gx = await box(target.id);
  ok(gx.y + gx.h / 2 > below.y && gx.y + gx.h / 2 < below.y + below.h, "dragged into another epoch's band: allowed (it stays there)");
  ok(!!gx.outOfLane, `…the border warns: out of its epoch's band (${gx.outOfLane})`);
  await page.mouse.move(cv.x + gx.sx + Math.min(18, gx.sw / 3), cv.y + gx.sy + 4);
  await page.waitForTimeout(400);
  const tip = await H(() => document.getElementById("tooltip")?.textContent ?? "");
  ok(/Fuori dalla fascia/.test(tip) && /Fissato/.test(tip), `…and the tooltip says it («${tip.slice(0, 120)}»)`);
} else ok(false, "two lanes to test the band");

// ── «Riordina tutto» frees every group fixed ──────────────────────────────
const second = (await groups()).find((g) => g.id !== target.id && g.w > 80 && !g.folded);
await frame(second);
await page.waitForTimeout(400);
await drag(await box(second.id), 60, 0);
const both = await pinned();
ok(both.includes(target.id) && both.includes(second.id), "two groups fixed");
await H(() => window.__EM_DRAG__.reflowAll());
await page.waitForTimeout(3000);
const after = await pinned();
ok(!after.includes(target.id) && !after.includes(second.id), "«Riordina tutto»: no group fixed any more");
ok(!(await box(target.id))?.outOfLane, "…the one out of its band back in it");

// ── Graph: a group's disc carries its members ─────────────────────────────
await H(() => window.__EM_DRAG__.setGraphMode("graph"));
await page.waitForTimeout(3000);
const gv = await H((gid) => {
  const sc = window.__EM_SCENE__();
  const halo = sc.halos.find((h) => h.id === gid) ?? sc.halos.find((h) => h.kind === "group" && h.members.length >= 2 && sc.nodes.includes(h.id));
  return halo ? { id: halo.id, members: halo.members.filter((m) => sc.nodes.includes(m)) } : null;
}, target.id);
ok(!!gv, "Graph: a group with its disc and members");
if (gv) {
  await H((id) => { const b = window.__EM_DRAG__.sceneOf(id); window.__EM_DRAG__.frameWorld(b.x - 400, b.y - 300, 800, 600); }, gv.id);
  await page.waitForTimeout(1500);
  const at = (id) => H((i) => window.__EM_DRAG__.sceneOf(i), id);
  const d0 = await at(gv.id), mm0 = await at(gv.members[0]);
  const vp = await H(() => window.__EM_SCENE__().vp);
  const px = cv.x + (d0.x + d0.w / 2) * vp.scale + vp.x, py = cv.y + (d0.y + d0.h / 2) * vp.scale + vp.y;
  const hit = await H(([x, y]) => window.__EM_DRAG__.hitAt(x, y), [px - cv.x, py - cv.y]);
  ok(hit === gv.id, `Graph: the press is on the group's disc (${hit})`);
  await page.mouse.move(px, py);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(px + i * 12, py + i * 6);
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const d1 = await at(gv.id), mm1 = await at(gv.members[0]);
  const gdx = d1.x - d0.x, mdx = mm1.x - mm0.x;
  ok(Math.abs(gdx) > 30, `Graph: the disc moved (Δx ${gdx.toFixed(1)})`);
  ok(Math.abs(mdx - gdx) < 25, `…its member with it (Δx ${mdx.toFixed(1)})`);
  ok(!!(await H((id) => window.__EM_DRAG__.graphOverride(id), gv.members[0])), "…and stays (a hand position of the Graph)");
  await H(() => window.__EM_DRAG__.undo());
  await page.waitForTimeout(800);
  ok(!(await H((id) => window.__EM_DRAG__.graphOverride(id), gv.members[0])) && !(await H((id) => window.__EM_DRAG__.graphOverride(id), gv.id)),
    "Graph: one undo takes the move back (no hand position left)");
  await H(() => window.__EM_DRAG__.redo());
  await page.waitForTimeout(800);
  ok(!!(await H((id) => window.__EM_DRAG__.graphOverride(id), gv.members[0])), "Graph: one redo puts it back");
}

ok(errors.length === 0, `no page error: ${errors.join(" | ")}`);
await B.close();
if (fails.length) {
  console.error(`check-group-pin: ${fails.length} FAILED of ${checks + fails.length}`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-group-pin: ${checks} checks passed`);
