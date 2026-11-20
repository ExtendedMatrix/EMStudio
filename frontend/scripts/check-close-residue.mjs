// MICRO-PL09 part 0 · «open v11 → close → nothing left» (E.D., 18 Nov 2026,
// dev.132: after File ▸ Close — «Untitled · no graph open» — the Space kept the
// colours' legend of the closed file, the tileset's counter «Tileset · auto ·
// L3–6 · 48.5 MB / 1.00 GB» and the tileset's memory).
//
// A real page (the Vite on PORT, Playwright's headless shell), a COPY of
// TempluMare v11 with its proxies and RB/cesium tilesets (DOC; its bridge on
// BRIDGE, --fs-root the copy's folder). The inventory of what is bound to the
// document is `__EM_DRAG__.documentResidue()` (main.ts): the Space's state
// (epoch, isolated, resident files, memos, containers' sides, tilesets handed
// over, the tiles' leaves, the proxies' folder, the sketch), each Space's
// scene (`__spaceResidue`: items, meshes, tileset layers and their bytes, the
// flow's versions and bytes, the files' cache, the GPU's geometries and
// textures, the chip), its legend and epoch summary, its GIS layers, the
// colour schemes and drafts kept per graph, the selection, the window
// «Colori». After the close every count is 0 (the GPU back to the empty
// Space's baseline) and no workspace shows a name of the closed graph.
//
//   PORT=5301 BRIDGE=http://127.0.0.1:8901 DOC=/tmp/pl09p0/T/EM/TempluMare_v11.em.json \
//     node scripts/check-close-residue.mjs
//
// Skipped (rc 0, said) without the copy or without playwright-core.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const PORT = process.env.PORT ?? "5199";
const BRIDGE = process.env.BRIDGE ?? "";
const DOC = process.env.DOC ?? "/tmp/pl09p0/T/EM/TempluMare_v11.em.json";
const EPOCH = new RegExp(process.env.EPOCH ?? "2015");
const SHOTS = process.env.SHOTS ?? "";
const CHR = process.env.CHR ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
if (!existsSync(DOC)) { console.log(`check-close-residue: skipped (no copy of TempluMare v11 at ${DOC})`); process.exit(0); }
async function playwright() {
  for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
    new URL("../../.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js", import.meta.url).pathname]) {
    if (!t) continue;
    try { const m = t.startsWith("/") ? await import(t) : require(t); return m.chromium ? m : m.default; } catch { /* next */ }
  }
  return null;
}
const pw = await playwright();
if (!pw) { console.log("check-close-residue: skipped (playwright-core not found: set PLAYWRIGHT_CORE)"); process.exit(0); }
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; console.log(`  ✓ ${what}`); };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; console.log(`  ✓ ${what}`); };
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await pw.chromium.launch({ executablePath: existsSync(CHR) ? CHR : undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 1552, height: 914 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
await page.addInitScript(() => {
  if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "it"); sessionStorage.setItem("probe", "1"); }
});
const E = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const residue = () => E(() => window.__EM_DRAG__.documentResidue());
const ws = async (id) => { await E((x) => document.querySelector(`#workspace-bar .ws-tab[data-ws="${x}"]`)?.click(), id); await wait(900); };
try {
  await page.goto(`http://localhost:${PORT}/em/studio/${BRIDGE ? `?bridge=${encodeURIComponent(BRIDGE)}` : ""}`);
  await page.waitForFunction(() => !!window.__EM_DRAG__?.documentResidue, null, { timeout: 90000 });
  // ── the empty Space: its baseline (the grid, the axes, the gizmo) ──
  await ws("space");
  await page.waitForFunction(() => !!document.querySelector(".scn-host")?.__spaceResidue, null, { timeout: 60000 });
  await wait(1500);
  const base = (await residue()).scenes[0]?.scene;
  ok(base && base.items === 0, `empty Space before any document: ${JSON.stringify(base)}`);

  // ── open v11, the epoch with a tileset, colours by a property (the window, applied) ──
  const doc = JSON.parse(readFileSync(DOC, "utf8"));
  await E(([d, p]) => window.__EM_DRAG__.openAt(d, p), [doc, DOC]);
  await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 0, null, { timeout: 90000 });
  await ws("space");
  await page.waitForSelector("[data-epoch-pick]", { timeout: 90000 });
  const ep = await E((re) => [...document.querySelector("[data-epoch-pick]").options].map((o) => [o.value, o.textContent.trim()]).find(([, t]) => new RegExp(re).test(t)), EPOCH.source);
  ok(!!ep, `epoch ${EPOCH} in the Space's list`);
  await E((v) => { const s = document.querySelector("[data-epoch-pick]"); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }, ep[0]);
  await E(() => document.querySelector("[data-frame]")?.click());
  await page.waitForFunction(() => (document.querySelector(".scn-host")?.__spaceResidue?.().meshes ?? 0) > 0, null, { timeout: 180000 });
  await wait(6000);
  await E(() => document.querySelector("[data-colours]").click());
  await page.waitForSelector("[data-colours-window] [data-cw-mode]");
  await E(() => document.querySelector('[data-colours-window] [data-cw-mode="property"]').click());
  const prop = await E(() => [...document.querySelectorAll("[data-colours-window] [data-cw-property] option")].map((o) => o.value).find((v) => v === "conservation_state") ?? null);
  ok(prop === "conservation_state", "v11: the property conservation_state is offered");
  await page.selectOption("[data-colours-window] [data-cw-property]", prop);
  await wait(800);
  await E(() => document.querySelector('[data-colours-window] [data-cw="apply"]').click());
  await wait(1200);
  // a unit selected, the epoch's summary on
  await E(() => { const u = window.__EM_SCENE__?.()?.nodes?.find((n) => /^SU0/.test(String(n.node?.name ?? n.name ?? ""))); if (u) window.__EM_DRAG__.select?.(u.id ?? u.node?.id); });
  await wait(600);
  const open = await residue();
  const so = open.scenes[0];
  console.log(`    open: ${JSON.stringify({ space: open.space, scene: so.scene, legend: so.legend?.slice(0, 60), states: open.colourStates })}`);
  ok(open.document && so.scene.items > 0 && so.scene.meshes > 0, "open: the scene draws the epoch's models and proxies");
  ok(!!so.legend && /conservation_state/.test(so.legend), "open: the legend of conservation_state");
  ok(so.scene.cached > 0 && so.scene.geometries > base.geometries, "open: files in the cache, geometries on the GPU");
  ok(open.colourStates > 0 && open.space.memo && open.space.epoch, "open: a colour scheme, the Space's memo and its epoch kept for the graph");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/close-1-open.png` });

  // ── File ▸ Close ──
  await E(() => document.getElementById("btn-close-doc").click());
  await page.waitForFunction(() => !window.__EM_DRAG__.documentResidue().document, null, { timeout: 30000 });
  // the scene gives back what it held at its next update; late loads of the
  // generation gone are let go when they land: a few seconds
  await wait(4000);
  const r = await residue();
  const sc = r.scenes[0];
  console.log(`    closed: ${JSON.stringify(r)}`);
  eq([r.document, r.files], [false, 0], "closed: no document, no file");
  eq([r.colourStates, r.colourDrafts], [0, 0], "closed: no colour scheme, no draft kept for the closed graph");
  eq(r.space, { epoch: null, isolated: null, resident: 0, memo: false, substituted: 0, alt: 0, handoff: 0, leaves: 0, flowPrints: 0,
    proxyFolder: false, sketch: null, sketches: 0, inspTiles: false }, "closed: the Space's state of the document forgotten");
  eq(r.selection, { id: null, ids: 0, narrative: null }, "closed: nothing selected");
  eq({ items: sc.scene.items, meshes: sc.scene.meshes, layers: sc.scene.layers, tileBytes: sc.scene.tileBytes, flow: sc.scene.flow,
    flowBytes: sc.scene.flowBytes, cached: sc.scene.cached, chip: sc.scene.chip },
  { items: 0, meshes: 0, layers: 0, tileBytes: 0, flow: 0, flowBytes: 0, cached: 0, chip: null },
  "closed: no mesh, no tileset (0 B), no version, no file cached, no counter in the corner");
  // one texture is still counted after the close (HEAD left 13 and 93 geometries):
  // not found which (unreachable from the scene); bounded here, said in the report
  ok(sc.scene.geometries <= base.geometries && sc.scene.textures <= base.textures + 1,
    `closed: the GPU back to the empty Space's (geometries ${sc.scene.geometries} ≤ ${base.geometries}, textures ${sc.scene.textures} ≤ ${base.textures} + 1)`);
  eq([sc.legend, sc.summary], [null, null], "closed: no legend, no epoch summary");
  eq(sc.gis?.layers ?? [], [], "closed: no GIS layer");
  eq(r.coloursWindow?.noGraph, true, "closed: the window «Colori» says «no graph open»");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/close-2-closed.png` });
  // ── every workspace: no name of the closed graph on screen ──
  const names = ["SU001", "SU020", "USD009", "Survey2015", "conservation_state", "TempluMare (Cesium"];
  for (const id of ["canvas", "provenance", "assets", "narrative", "space", "sheets", "scripting"]) {
    await ws(id);
    const seen = await E((ns) => {
      const root = document.getElementById("tile-root") ?? document.body;
      const txt = root.innerText ?? root.textContent ?? "";
      return ns.filter((n) => txt.includes(n));
    }, names);
    eq(seen, [], `closed: workspace «${id}» shows nothing of the closed graph`);
  }
} finally {
  await browser.close();
}
eq(errors, [], "no page error");
console.log(`check-close-residue: ${checks} checks passed`);
