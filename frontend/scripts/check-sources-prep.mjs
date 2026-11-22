// MICRO-SEG25 · Sources ▸ Viewer & card: the first look at a survey.
//
//   node scripts/check-sources-prep.mjs
//
// E.D., 22 Nov 2026: «la prima volta che seleziono D.01 ci vogliono molti
// secondi, e all'inizio il pannello dice che non c'è nulla da far vedere».
// What is checked:
//   1 · the PLAN of the read-ahead (`sources-prefetch.ts`, in node): a file with
//       no tileset plans nothing; a document's container tileset and its own
//       tileset model are planned once each; a missing one is not;
//   2 · in a real page (a Vite of this tree, Chromium headless), on
//       `testdata/tiles.em.json` (D.1 = a folder tileset):
//       P1 the tileset's root held 2.5 s: the Viewer NEVER shows its empty
//          state (`.viewer-empty`) while loading, it shows «Preparing the
//          survey…» (`[data-vw-prep]`) with its phases, and that goes when the
//          first tile is drawn;
//       P2 the root refused twice (the bridge not answering yet): asked again
//          by itself, the tiles come, no empty state;
//       P3 the read-ahead after the file opened reads the root (tileset.json)
//          before any click, and no tile;
//       P4 a file with NO tileset (`testdata/spazio.em.json`): the read-ahead
//          does not start, no tileset.json is asked.
// Needs playwright-core (PLAYWRIGHT_CORE, or the audit's copy) and a Chromium
// (CHR, else the headless shell 1248, else Playwright's own).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FE = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(FE, "src");
const TD = join(FE, "testdata");
let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// ── 1 · the plan ────────────────────────────────────────────────────────────
{
  const out = await esbuild.build({ stdin: { contents: `export * from "./sources-prefetch";`, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false });
  const { prefetchPlan } = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  eq(prefetchPlan([], [], []), [], "no document, nothing");
  eq(prefetchPlan([{ id: "D1", models: ["RM1"], groups: [] }], [], [{ id: "RM1", tiles: false, url: "a.glb", state: "resident" }]), [],
     "a document of models only: no tileset, nothing planned");
  const rms = [
    { id: "TS", tiles: true, url: "http://b/fs/at/RB/s.3tz", state: "resident" },
    { id: "RM1", tiles: false, url: "m.glb", state: "resident" },
    { id: "OWN", tiles: true, url: "http://b/fs/at/RB/own/tileset.json", state: "resident" },
    { id: "GONE", tiles: true, url: "http://b/fs/at/RB/gone.3tz", state: "missing" },
    { id: "NOURL", tiles: true, url: null, state: "resident" },
  ];
  const plan = prefetchPlan([
    { id: "D1", models: ["RM1"], groups: ["G"] },
    { id: "D2", models: ["OWN", "GONE", "NOURL"], groups: ["G"] },
  ], [{ group: "G", tileset: "TS" }], rms);
  eq(plan.map((x) => x.rmId), ["TS", "OWN"], "the container's tileset, then a document's own; the missing one and the one with no address left out");
  eq(plan[0].docs, ["D1", "D2"], "a tileset shown by two documents is planned once");
}

// ── 2 · the page ────────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const pwMod = await (async () => {
  for (const t of [process.env.PLAYWRIGHT_CORE, "playwright-core",
    new URL("../../.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js", import.meta.url).pathname]) {
    if (!t) continue;
    try { const m = t.startsWith("/") ? await import(t) : require(t); return m.chromium ? m : m.default; } catch { /* next */ }
  }
  return null;
})();
if (!pwMod) { console.log(`sources-prep: ${checks} checks passed (page part SKIPPED: playwright-core not found)`); process.exit(0); }
const CHR = process.env.CHR ?? [1248, 1243].map((v) => `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-${v}/chrome-headless-shell-mac-arm64/chrome-headless-shell`).find((p) => existsSync(p));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const PORT = process.env.PORT ?? String(await freePort());
let vite = null;
if (!process.env.PORT) {
  vite = spawn(process.execPath, [join(FE, "node_modules/vite/bin/vite.js"), "--port", PORT, "--strictPort"], { cwd: FE, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("vite did not start")), 60000);
    const on = (d) => { if (/Local:|ready in/i.test(String(d))) { clearTimeout(t); res(); } };
    vite.stdout.on("data", on); vite.stderr.on("data", on);
  });
}
const browser = await pwMod.chromium.launch({ executablePath: CHR, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const done = async (code) => { await browser.close().catch(() => {}); vite?.kill("SIGTERM"); process.exit(code); };
process.on("unhandledRejection", (e) => { console.error(e); void done(1); });
const fixture = (n) => JSON.parse(readFileSync(join(TD, `${n}.em.json`), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** a fresh page on a fixture; `route(url)` → "hold" ms | "refuse" | null for each tileset.json asked */
async function page(doc, route) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const asked = [];
  await ctx.route(/testdata\/.*(tileset\.json|\.glb)(\?|$)/, async (r) => {
    const u = r.request().url();
    asked.push({ t: Date.now(), u: u.replace(/^.*testdata\//, "") });
    const what = /tileset\.json/.test(u) && route ? route(u) : null;
    if (what === "refuse") return r.abort("connectionrefused");
    if (typeof what === "number") await sleep(what);
    return r.continue();
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await p.addInitScript(([d]) => {
    window.__EM_TEST_DATA__ = d;
    if (!sessionStorage.getItem("probe")) { localStorage.clear(); localStorage.setItem("emstudio.locale", "en"); sessionStorage.setItem("probe", "1"); }
  }, [fixture(doc)]);
  await p.goto(`http://localhost:${PORT}/em/studio/?bridge=http://127.0.0.1:9`);
  await p.waitForFunction(() => window.__EM_SCENE__?.()?.nodes?.length > 0, null, { timeout: 60000 });
  return { ctx, p, asked, errors };
}
/** Sources, D.1 selected; the Viewer sampled every 50 ms until a tile is drawn (or `ms`) */
async function look(p, id, ms) {
  return p.evaluate(async ([id, ms]) => {
    document.querySelector('#workspace-bar .ws-tab[data-ws="provenance"]')?.click();
    await new Promise((r) => setTimeout(r, 700));
    const D = window.__EM_DRAG__;
    D.select(id);
    const t0 = performance.now();
    const seen = { empty: [], prep: [], phases: new Set(), firstTile: null, prepAfterTile: false };
    while (performance.now() - t0 < ms) {
      const a = document.querySelector('.tile-area[data-surface-type="viewer"]');
      const empty = a?.querySelector(".viewer-empty p")?.textContent;
      if (empty) seen.empty.push(empty);
      const box = a?.querySelector("[data-vw-prep]");
      if (box) { seen.prep.push(Math.round(performance.now() - t0)); for (const li of box.querySelectorAll("li")) seen.phases.add(`${li.dataset.vwPrepPhase}:${li.dataset.state}`); }
      const files = (a?.querySelector(".vw-scene")?.__spaceTiles?.() ?? []).reduce((n, l) => n + (l.files?.length ?? 0), 0);
      if (files > 0 && seen.firstTile === null) seen.firstTile = Math.round(performance.now() - t0);
      if (seen.firstTile !== null && performance.now() - t0 > seen.firstTile + 700) { seen.prepAfterTile = !!box; break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    return { ...seen, phases: [...seen.phases], prep: seen.prep.length ? [seen.prep[0], seen.prep[seen.prep.length - 1]] : [] };
  }, [id, ms]);
}

// P1 · the root held: preparing, never empty
{
  const { ctx, p, errors } = await page("tiles", () => 2500);
  const s = await look(p, "D1", 15000);
  eq(s.empty, [], "P1 · no empty state while the tileset's root is on its way");
  ok(s.prep.length && s.prep[0] < 600, `P1 · «Preparing the survey…» at once (${JSON.stringify(s.prep)})`);
  ok(s.phases.includes("root:doing"), `P1 · the phase of the root said (${s.phases.join(" ")})`);
  ok(s.phases.some((x) => x.startsWith("engine:")) && s.phases.some((x) => x.startsWith("files:")), "P1 · the phases files and engine said");
  ok(s.firstTile !== null && s.firstTile >= 2000, `P1 · the first tile after the held root (${s.firstTile} ms)`);
  ok(!s.prepAfterTile, "P1 · «Preparing» gone once a tile is drawn");
  eq(errors, [], "P1 · no page error");
  await ctx.close();
}
// P2 · the root refused twice: asked again by itself
{
  let n = 0;
  const { ctx, p, errors } = await page("tiles", (u) => (/tiles-prova\/tileset\.json/.test(u) && n++ < 2 ? "refuse" : null));
  // (the read-ahead may take a refusal before the click: the scene's own tries are the point)
  const s = await look(p, "D1", 20000);
  eq(s.empty, [], "P2 · no empty state while the root does not answer");
  ok(s.firstTile !== null, `P2 · the root asked again, the tiles came (${s.firstTile} ms, ${n} asks)`);
  ok(n >= 3, `P2 · tileset.json asked again after the refusals (${n})`);
  eq(errors, [], "P2 · no page error");
  await ctx.close();
}
// P3 · the read-ahead reads the root before any click, and no tile
{
  const { ctx, p, asked, errors } = await page("tiles", null);
  await p.waitForFunction(() => window.__EM_DRAG__.sourcesPrefetch().reason === "done", null, { timeout: 30000 });
  const run = await p.evaluate(() => window.__EM_DRAG__.sourcesPrefetch());
  ok(run.started, "P3 · the read-ahead started (the file has tilesets)");
  ok(run.items.some((x) => /tiles-prova\/tileset\.json$/.test(x.url) && x.ok), `P3 · the root of D.1's tileset read (${JSON.stringify(run.items.map((x) => [x.url.replace(/^.*testdata\//, ""), x.ok]))})`);
  ok(asked.some((x) => /tiles-prova\/tileset\.json/.test(x.u)), "P3 · tileset.json asked before any click");
  eq(asked.filter((x) => /\.glb/.test(x.u)), [], "P3 · no tile asked by the read-ahead");
  eq(errors, [], "P3 · no page error");
  await ctx.close();
}
// P4 · no tileset: nothing starts
{
  const { ctx, p, asked, errors } = await page("spazio", null);
  await sleep(4500);
  const run = await p.evaluate(() => window.__EM_DRAG__.sourcesPrefetch());
  ok(!run.started && run.reason === "no-tileset", `P4 · the read-ahead does not start on a file with no tileset (${run.reason})`);
  eq(asked.filter((x) => /tileset\.json/.test(x.u)), [], "P4 · no tileset.json asked");
  eq(errors, [], "P4 · no page error");
  await ctx.close();
}
console.log(`sources-prep: ${checks} checks passed`);
await done(0);
