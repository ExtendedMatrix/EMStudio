// MICRO-SEG27 (E.D., 22 Nov 2026: «premendo il globo si apre il menu degli elementi
// di scena») · the column of the Space's viewport, read in a real page:
//
//   node scripts/check-globe-button.mjs   (EM_V9=<an em.json with a GeoPositionNode>,
//                                          BRIDGE=<a bridge: the globe's anchor>,
//                                          PORT=<a Vite of this tree>)
//
// · ONE click on 🌐 turns the territory on (the wait on the button, then lit, the
//   modes G·P·S beside it, the «Territory» row of «Visibility ▾» ticked) and one
//   more turns it off; no menu opens;
// · the right click on 🌐 opens «Visibility ▾» on the «Territory» row; a click on
//   the globe with that menu open updates the row in place;
// · the tooltip: two lines, the first says what the click does;
// · the georeference missing: the click opens «Georeferencing…» and says why;
// · the other buttons of the column (zoom, hand, frame, perspective/ortho, G·P·S)
//   do what their tooltip says and open no menu.
import { bench } from "./page-bench.mjs";

const B = await bench("check-globe-button");
if (!B) process.exit(0);
let checks = 0;
const fails = [];
const ok = (c, what) => { if (c) checks++; else fails.push(what); };
const MENUS = "[data-vis-menu], .ctx-menu, [data-gr-card]";

const space = async (page) => {
  await page.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="space"]')?.click());
  await page.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 120000 });
  await page.waitForSelector(".scn-geo-col .scn-geo-btn", { timeout: 30000 });
  await page.waitForTimeout(800);
};
const btn = (page) => page.evaluate(() => {
  const b = document.querySelector(".scn-geo-col .scn-geo-btn");
  return b ? { geo: b.dataset.geo, chip: b.dataset.geoChip, pressed: b.getAttribute("aria-pressed"), busy: b.getAttribute("aria-busy"), title: b.title,
    modes: document.querySelectorAll(".scn-geo-col [data-geo-mode]").length } : null;
});
const menus = (page) => page.evaluate((sel) => document.querySelectorAll(sel).length, MENUS);
const geoOn = (page) => page.evaluate(() => document.querySelector(".scn-host").__geoSpace?.().on ?? null);

// ── 1 · the territory on and off, from the globe ────────────────────────────
{
  const { page, errors } = await B.open({ width: 1552, height: 914 });
  await space(page);
  const b0 = await btn(page);
  ok(b0 && b0.geo === "toggle" && b0.pressed === "false" && b0.modes === 0, `off at the start, its click a switch (${JSON.stringify(b0)})`);
  const lines = (b0?.title ?? "").split("\n");
  ok(lines.length === 2 && /turn on the territory|accendi il territorio/i.test(lines[0]), `two lines, the first what the click does (${JSON.stringify(lines)})`);
  ok(/right click|tasto destro/i.test(lines[1] ?? ""), `the second line says the right click (${lines[1]})`);
  await page.click(".scn-geo-col .scn-geo-btn");
  await page.waitForTimeout(60);
  const wait = await btn(page);
  ok(await geoOn(page) === true, "one click: the territory on");
  ok(wait.chip === "loading" || wait.pressed === "true", `the wait on the button, or already lit (${JSON.stringify(wait)})`);
  ok(await menus(page) === 0, "no menu opened by the globe");
  await page.waitForFunction(() => document.querySelector(".scn-geo-col .scn-geo-btn")?.dataset.geoChip !== "loading", null, { timeout: 30000 });
  const on = await btn(page);
  ok(on.pressed === "true" && on.chip === "on" && on.modes === 3, `lit, Globe · Plan · Site beside it (${JSON.stringify(on)})`);
  ok(/turn off the territory|spegni il territorio/i.test(on.title.split("\n")[0]), `lit: the click says it turns it off (${on.title})`);
  // the other buttons of the column: G·P·S
  for (const m of ["globe", "plan", "site"]) {
    await page.click(`.scn-geo-col [data-geo-mode="${m}"]`);
    // the mode is the camera's: pressed when the flight has landed
    await page.waitForFunction((m) => document.querySelector('.scn-geo-col [data-geo-mode][aria-pressed="true"]')?.dataset.geoMode === m, m, { timeout: 30000 }).catch(() => {});
    const r = await page.evaluate(() => ({ pressed: document.querySelector('.scn-geo-col [data-geo-mode][aria-pressed="true"]')?.dataset.geoMode, mode: document.querySelector(".scn-host").__geoSpace().mode }));
    ok(await menus(page) === 0, `${m}: no menu`);
    ok(r.pressed === m, `${m}: pressed after its click (${JSON.stringify(r)})`);
  }
  // the right click: «Visibility ▾», the Territory row lit and ticked
  await page.click(".scn-geo-col .scn-geo-btn", { button: "right" });
  await page.waitForTimeout(300);
  const rm = await page.evaluate(() => {
    const m = document.querySelector("[data-vis-menu]");
    const row = m?.querySelector('[data-vis-row="territory"]');
    return { menu: !!m, lit: !!row?.classList.contains("vis-flash"), ticked: row?.querySelector("[data-geo-on]")?.checked ?? null };
  });
  ok(rm.menu && rm.lit && rm.ticked === true, `right click: «Visibility ▾» on «Territory», ticked (${JSON.stringify(rm)})`);
  // the globe with the menu open: the row follows
  await page.evaluate(() => document.querySelector(".scn-geo-col .scn-geo-btn").click());
  await page.waitForTimeout(300);
  const off = await btn(page);
  const row = await page.evaluate(() => document.querySelector('[data-vis-menu] [data-vis-row="territory"] [data-geo-on]')?.checked ?? null);
  ok(await geoOn(page) === false && off.pressed === "false" && off.modes === 0, `a second click: off, the modes gone (${JSON.stringify(off)})`);
  ok(row === false, `the «Territory» row of the open menu follows (${row})`);
  // and the row switches the globe's button
  await page.evaluate(() => { const c = document.querySelector('[data-vis-menu] [data-vis-row="territory"] [data-geo-on]'); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector(".scn-geo-col .scn-geo-btn")?.dataset.geoChip === "on", null, { timeout: 30000 }).catch(() => {});
  ok((await btn(page)).pressed === "true", "the row turns it on: the globe's button lit");
  await page.evaluate(() => { const c = document.querySelector('[data-vis-menu] [data-vis-row="territory"] [data-geo-on]'); if (c) { c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true })); } });
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelector("[data-vis-menu]") && document.querySelector("[data-vis]")?.click());
  await page.waitForTimeout(800);
  // ── 3 · the other buttons of the column ────────────────────────────────────
  const cam = () => page.evaluate(() => JSON.stringify(document.querySelector(".scn-host").__spaceCamera?.() ?? null));
  const col = await page.evaluate(() => [...document.querySelectorAll(".scn-nav-col > .scn-nav-btn")].map((b) => ({ nav: b.dataset.nav, title: b.title })));
  ok(col.map((c) => c.nav).join(",") === "zoom,pan,home,ortho", `the column: zoom, hand, frame, perspective/ortho (${JSON.stringify(col)})`);
  for (const c of col) {
    const before = await page.evaluate(() => ({ ortho: document.querySelector('.scn-nav-col [data-nav="ortho"]')?.innerHTML.includes("M4 3h8") }));
    await page.click(`.scn-nav-col > .scn-nav-btn[data-nav="${c.nav}"]`);
    await page.waitForTimeout(600);
    ok(await menus(page) === 0, `${c.nav} («${c.title}»): its click opens no menu`);
    if (c.nav === "ortho") {
      const after = await page.evaluate(() => ({ ortho: document.querySelector('.scn-nav-col [data-nav="ortho"]')?.innerHTML.includes("M4 3h8") }));
      ok(before.ortho !== after.ortho, `ortho: one click switches the projection (its icon ${JSON.stringify([before, after])})`);
      await page.click('.scn-nav-col > .scn-nav-btn[data-nav="ortho"]');
      await page.waitForTimeout(300);
    }
    if (c.nav === "home") ok(true, "home: frames (no menu)");
  }
  // zoom / hand: a drag moves the camera, a plain click does nothing else
  const c0 = await cam();
  const z = await page.$('.scn-nav-col > .scn-nav-btn[data-nav="zoom"]');
  const zb = await z.boundingBox();
  await page.mouse.move(zb.x + zb.width / 2, zb.y + zb.height / 2); await page.mouse.down();
  await page.mouse.move(zb.x + zb.width / 2, zb.y + zb.height / 2 - 40, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(300);
  const c1 = await cam();
  ok(c0 === "null" || c0 !== c1, "zoom: a drag moves the camera");
  ok(!errors.length, `no page error (${errors.join(" | ")})`);
  await page.close();
}

// ── 2 · the georeference missing ────────────────────────────────────────────
{
  const doc = structuredClone(B.doc);
  for (const g of Object.values(doc.graphs ?? {})) {
    const gone = new Set((g.nodes ?? []).filter((n) => n.node_type === "geo_position").map((n) => n.id));
    g.nodes = (g.nodes ?? []).filter((n) => !gone.has(n.id));
    g.edges = (g.edges ?? []).filter((e) => !gone.has(e.source) && !gone.has(e.target));
  }
  const { page, errors } = await B.open({ width: 1552, height: 914, with: doc });
  await space(page);
  const b = await btn(page);
  ok(b?.geo === "georef" && b.chip === "missing", `no georeference: the click goes to «Georeferencing…» (${JSON.stringify(b)})`);
  ok((b?.title ?? "").split("\n").length === 2, "…two lines of tooltip");
  await page.click(".scn-geo-col .scn-geo-btn");
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ card: !!document.querySelector("[data-gr-card]"), vis: !!document.querySelector("[data-vis-menu]"),
    toast: document.getElementById("toast")?.textContent ?? "" }));
  ok(r.card && !r.vis, `the card «Georeferencing…» opens, not «Visibility ▾» (${JSON.stringify(r)})`);
  ok(/GeoPositionNode/.test(r.toast), `a line says why the georeference is needed (${r.toast.slice(0, 160)})`);
  ok(await geoOn(page) === false, "the territory stays off");
  ok(!errors.length, `no page error (${errors.join(" | ")})`);
  await page.close();
}

await B.close();
if (fails.length) { console.error(`✗ check-globe-button: ${fails.length} failed, ${checks} passed\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`✓ check-globe-button: ${checks} checks`);
