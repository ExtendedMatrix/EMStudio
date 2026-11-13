// MICRO-TESTATE-COERENTI p.1–p.4 (E.D., 13 Nov 2026) · the heads of the windows, read
// in a real page on Templu Mare v9 (EM_V9), every workspace:
//
//   node scripts/check-headers.mjs        (PORT=<a Vite of this tree>, ENGINE=webkit,
//                                          SIZES=ed,narrow)
//
// · every head in ONE order: [type ▾] [+] [?] [context…] … [Visibility/Filters ▾]
//   [🔍] [⋯] [⛶] — read from the controls' roles (`data-hdr`), with the same glyphs;
// · every window that has a list to search has its 🔍, and «/» with the pointer
//   on it opens it;
// · no category of 3D objects can be switched from two places: the Overlays menu
//   of the 3D lists none, the old «Livelli della scena» is gone, the globe's chip
//   does not switch the territory (it opens «Visibilità ▾»);
// · proxies off → the button says it («Visibilità · 1 spenta») → one click on the
//   mark of the Outliner turns them back on.
import { bench } from "./page-bench.mjs";

const B = await bench("check-headers");
if (!B) process.exit(0);
const ORDER = ["type", "add", "help", "context", "spacer", "filters", "search", "more", "max"];
const GLYPH = { search: "🔍", more: "⋯", max: "⛶" };
const SEARCHABLE = new Set(["outliner", "inspector", "table", "storage", "shelf", "narrative-index", "graph", "scene"]);
const SIZES = (process.env.SIZES ?? "ed,narrow").split(",").map((k) => ({ ed: [1552, 914], narrow: [1180, 800] })[k]).filter(Boolean);
let checks = 0;
const fails = [];
const ok = (c, what) => { if (c) checks++; else fails.push(what); };

for (const [W, H] of SIZES) {
  const { page, errors } = await B.open({ width: W, height: H });
  const tag = `${W}×${H}`;
  const wss = await page.evaluate(() => [...document.querySelectorAll("#workspace-bar .ws-tab")].map((b) => b.dataset.ws).filter(Boolean));
  for (const ws of wss) {
    await page.evaluate((w) => document.querySelector(`#workspace-bar .ws-tab[data-ws="${w}"]`)?.click(), ws);
    await page.waitForTimeout(2000);
    const heads = await page.evaluate(() => [...document.querySelectorAll(".tile-area")].filter((a) => a.offsetParent).map((a) => {
      const bar = a.querySelector(":scope > .tile-bar");
      const els = [...(bar?.querySelectorAll("[data-hdr]") ?? [])].filter((x) => !x.parentElement?.closest("[data-hdr]") || x.closest(".scn-bar, .win-strip, .scn-bar-tail"));
      const type = window.__EM_DRAG__.winType?.(a.dataset.win) ?? null;
      return { win: a.dataset.win, type, roles: els.map((x) => x.dataset.hdr),
        glyphs: Object.fromEntries(els.map((x) => [x.dataset.hdr, (x.querySelector("button") ?? x).textContent.trim()])) };
    }));
    for (const h of heads) {
      const rk = h.roles.map((r) => ORDER.indexOf(r));
      ok(rk.every((r) => r >= 0) && rk.every((r, i) => i === 0 || r >= rk[i - 1]), `${tag} ${h.win}: the head in the one order — ${h.roles.join(" ")}`);
      ok(h.roles[0] === "type", `${tag} ${h.win}: the type of view first`);
      ok(h.roles.includes("help"), `${tag} ${h.win}: a «?»`);
      for (const [role, g] of Object.entries(GLYPH)) if (h.roles.includes(role)) ok(h.glyphs[role]?.startsWith(g), `${tag} ${h.win}: ${role} is ${g} (got «${h.glyphs[role]}»)`);
      if (h.type && SEARCHABLE.has(h.type)) ok(h.roles.includes("search"), `${tag} ${h.win} (${h.type}): its 🔍 in the head`);
    }
  }
  // «/» on the Outliner and on the Inspector of the Space: their own search opens
  await page.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="space"]')?.click());
  await page.waitForTimeout(2500);
  for (const w of ["space:outliner", "space:inspector"]) {
    const box = await page.evaluate((id) => { const a = document.querySelector(`.tile-area[data-win="${id}"]`); if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, w);
    if (!box) { ok(false, `${tag} ${w} on screen`); continue; }
    await page.mouse.move(box.x, box.y);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press("/");
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => document.activeElement?.dataset?.hdrSearchQ ?? null);
    ok(focused === w, `${tag} «/» with the pointer on ${w} opens its search (focus: ${focused})`);
    await page.keyboard.press("Escape");
  }
  // the categories: ONE place
  const ov = await page.evaluate(async () => {
    const D = window.__EM_DRAG__;
    const cats = ["s3_rm", "s3_tiles", "s3_rmdoc", "s3_rmsf", "s3_proxies", "s3_sketches", "s3_x3d"];
    const inOverlays = D.overlayMenuKeys ? D.overlayMenuKeys("space") : null;
    return { inOverlays, both: inOverlays ? cats.filter((c) => inOverlays.includes(c)) : null,
      oldLayers: document.querySelectorAll("[data-sol-layers], [data-lay-row]").length };
  });
  ok(Array.isArray(ov.inOverlays) && ov.both.length === 0, `${tag} the Overlays of the 3D list no category (${JSON.stringify(ov.both)})`);
  ok(ov.oldLayers === 0, `${tag} the old «Livelli della scena» are gone (${ov.oldLayers})`);
  const globe = await page.evaluate(async () => {
    const b = document.querySelector("[data-geo='toggle']");
    if (!b) return { none: true };
    const before = b.getAttribute("aria-pressed");
    b.click();
    await new Promise((r) => setTimeout(r, 300));
    const menu = !!document.querySelector("[data-vis-menu]");
    const after = document.querySelector("[data-geo='toggle']")?.getAttribute("aria-pressed");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return { before, after, menu };
  });
  ok(globe.none || (globe.menu && globe.before === globe.after), `${tag} the globe's chip opens «Visibilità ▾» and does not switch the territory (${JSON.stringify(globe)})`);
  // proxies off → said → back on in one click
  await page.evaluate(() => { const b = document.querySelector("[data-vis]"); b?.click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const c = document.querySelector('[data-vis-cb="s3_proxies"]'); if (c) { c.checked = false; c.dispatchEvent(new Event("change")); } });
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  const ep = await page.evaluate(() => { const d = JSON.parse(window.__EM_DRAG__.docJson()); const g = d.graphs[d.active_graph_id]; return g.nodes.find((n) => n.name === "II A.D.")?.id; });
  await page.evaluate((id) => window.__EM_DRAG__.setSpaceEpoch(id), ep);
  await page.waitForTimeout(1500);
  const said = await page.evaluate(() => ({ btn: document.querySelector("[data-vis]")?.textContent ?? "", off: document.querySelector("[data-vis]")?.dataset.visOffHere,
    marks: document.querySelectorAll("[data-cat-on='s3_proxies']").length }));
  ok(said.off === "1" && /·/.test(said.btn), `${tag} proxies off: the button says it («${said.btn}»)`);
  ok(said.marks > 0, `${tag} proxies off: the Outliner's rows and the scene's line carry the mark (${said.marks})`);
  await page.evaluate(() => document.querySelector("[data-cat-on='s3_proxies']")?.click());
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => document.querySelector("[data-vis]")?.dataset.vis);
  ok(back === "0", `${tag} one click on the mark turns them back on (off now: ${back})`);
  ok(errors.length === 0, `${tag} no page error (${errors.slice(0, 2).join(" | ")})`);
  await page.context().close();
}
await B.close();
if (fails.length) { console.error(fails.map((f) => `✗ ${f}`).join("\n")); console.error(`check-headers: ${fails.length} ✗, ${checks} ✓`); process.exit(1); }
console.log(`check-headers: ${checks} checks ✓`);
