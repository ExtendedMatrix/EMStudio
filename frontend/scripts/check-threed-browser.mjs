// NIGHT-TAGLI-E-NEUTRE · in a real browser: a scene with a US (a layer), a USN
// (a pit cut, the volume of the matter removed) with its fill inside, and a USNt
// (a room, a designed void), drawn by the Space from `em_visual_rules` threed:
//
//   · the US and the fill: faces at the global opacity, since 1.6.45 their type's
//     thin solid edges (the contour of before, the same lines and colour);
//   · the USN: faces at 0.3 × the global opacity, the type's SOLID edges;
//   · decision 4 (MICRO-TAGLI-3D-DECISIONI): the fill is read inside the cut with
//     the proxies' origins at 0,0,0 (the study's shapes are in world coordinates)
//     AND with the origins moved to the centres of the volumes — the same pixels;
//   · the USNt: no face drawn (its mesh kept for the pick), DASHED edges;
//   · the global slider multiplies: s3_opacity_proxy changed → each type keeps its ratio;
//   · the Space's Outliner shows USN and USNt with their graph glyphs.
//
//   PORT=5173 SHOTS=<dir> node scripts/check-threed-browser.mjs
//
// Needs a Vite of this tree on PORT. The study is built here, in memory.
import { mkdirSync, existsSync } from "node:fs";

const PORT = process.env.PORT ?? "5173";
const SHOTS = process.env.SHOTS ?? null;
const PW = process.env.PLAYWRIGHT_CORE
  ?? `${process.env.HOME}/Documents/GitHub/EMStudio/.claude/wip/reports/2026-10-08-audit-interazioni/node_modules/playwright-core/index.js`;
const CHR = process.env.CHR
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
if (!existsSync(PW)) { console.error(`no playwright-core at ${PW}`); process.exit(2); }
const { chromium } = (await import(PW)).default ?? await import(PW);

// ── the study: three's axes (y up), metres ──────────────────────────────────
const box = (x0, y0, z0, x1, y1, z1) => [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
// a frustum: the mouth (top, half side a) at y1, the bottom (half side b) at y0
const frustum = (cx, cz, a, b, y0, y1) => [cx - b, y0, cz - b, cx + b, y0, cz - b, cx + b, y0, cz + b, cx - b, y0, cz + b,
  cx - a, y1, cz - a, cx + a, y1, cz - a, cx + a, y1, cz + a, cx - a, y1, cz + a];
const units = [
  { id: "US1", type: "US", name: "US 1", desc: "Strato di vita tagliato dalla fossa", shape: box(-3.6, -1.4, -1.2, -1.3, 0, 1.2) },
  { id: "USN2", type: "USN", name: "US -2", desc: "Taglio della fossa (volume della materia tolta)", shape: frustum(0, 0, 1.1, 0.55, -1.4, 0) },
  { id: "US3", type: "US", name: "US 3", desc: "Riempimento della fossa", shape: frustum(0, 0, 0.82, 0.5, -1.35, -0.55) },
  { id: "USNt4", type: "USNt", name: "USNt 4", desc: "Vano progettato (risparmio)", shape: box(1.8, -1.4, -1, 3.8, 0.6, 1) },
];
const nodes = [{ id: "EP1", node_type: "EpochNode", name: "Fase 1", description: "", data: { start_time: 100, end_time: 200 } }];
const edges = [];
for (const u of units) {
  nodes.push({ id: u.id, node_type: u.type, name: u.name, description: u.desc, data: {} },
    { id: `PX_${u.id}`, node_type: "property", name: "proxy", description: "", data: { property_type: "geometry" } },
    { id: `SH_${u.id}`, node_type: "semantic_shape", name: `${u.id}_shape`, description: "", data: { convexshapes: [u.shape], type: "proxy" } });
  edges.push({ id: `${u.id}__has_first_epoch__EP1`, edge_type: "has_first_epoch", source: u.id, target: "EP1" },
    { id: `${u.id}__has_property__PX_${u.id}`, edge_type: "has_property", source: u.id, target: `PX_${u.id}` },
    { id: `PX_${u.id}__has_semantic_shape__SH_${u.id}`, edge_type: "has_semantic_shape", source: `PX_${u.id}`, target: `SH_${u.id}` });
}
edges.push({ id: "US3__is_after__USN2", edge_type: "is_after", source: "US3", target: "USN2" },
  { id: "USN2__is_after__US1", edge_type: "is_after", source: "USN2", target: "US1" });
const doc = { header: { format: "em.json", version: "1.0" },
  graph: { graph_id: "tagli", name: "Tagli e neutre", description: "", nodes, edges, data: {} } };

let checks = 0;
const fails = [];
const ok = (c, what, got) => { checks++; if (!c) fails.push(`${what}${got !== undefined ? ` — got ${JSON.stringify(got)}` : ""}`); else console.log(`  ✓ ${what}`); };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch({ headless: true, executablePath: CHR, args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal"] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(() => { if (!localStorage.getItem("emstudio.locale")) localStorage.setItem("emstudio.locale", "it"); });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await p.goto(`http://localhost:${PORT}/em/studio/`);
  await p.waitForSelector("#workspace-bar .ws-tab", { timeout: 60000 });
  await p.evaluate(([d]) => window.__EM_DRAG__.openAt(d, "/tmp/tagli-e-neutre.em.json"), [doc]);
  await p.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) >= 4, null, { timeout: 60000 });
  await shot(p, "0-grafo");
  await p.click(`#workspace-bar .ws-tab[data-ws="space"]`);
  await p.waitForFunction(() => document.querySelector(".scn-host")?.dataset.ready === "1", null, { timeout: 60000 });
  await p.waitForTimeout(2500);
  // what the scene drew, per unit: the faces' material and the type's edges
  const look = () => p.evaluate(() => {
    const h = document.querySelector(".scn-host");
    const out = h?.__spaceProxyLook?.() ?? {};
    return { space: (h?.__space?.() ?? []).map((x) => `${x.kind}:${x.id}:${x.as}`), units: out };
  });
  let got = await look();
  ok(["proxy:US1:mesh", "proxy:USN2:mesh", "proxy:US3:mesh", "proxy:USNt4:mesh"].every((k) => got.space.includes(k)), "the four proxies are drawn", got.space);
  await shot(p, "1-spazio");
  if (SHOTS) {
    await p.locator(".scn-host").first().screenshot({ path: `${SHOTS}/2-scena.png` });
    await p.evaluate(() => {
      const fase = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim() === "Fase 1" && e.closest("[class*=outl], [class*=tree]"));
      let el = fase; while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
    await p.waitForTimeout(400);
    const tree = p.locator("text=Proxy").first();
    const panel = await tree.evaluateHandle((e) => e.closest("[class*=outliner]") ?? e.parentElement?.parentElement);
    await panel.asElement()?.screenshot({ path: `${SHOTS}/3-outliner.png` }).catch(() => undefined);
  }
  // decision 4: the fill inside the cut, origins at 0,0,0 then at the centres
  const pixel = async (x, y) => {
    const buf = await p.screenshot({ clip: { x: Math.round(x) - 3, y: Math.round(y) - 3, width: 7, height: 7 } });
    return p.evaluate(async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data; const s = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
      return s.map((v) => Math.round(v / (d.length / 4)));
    }, buf.toString("base64"));
  };
  // 0.6 of the half height below the centre: the label and the cursor sit on the centre
  const screenOf = (id) => p.evaluate((i) => document.querySelector(".scn-host")?.__spaceUnitScreen?.(i, 0.6) ?? null, id);
  const fill0 = await screenOf("US3"), cut0 = await screenOf("USN2");
  if (fill0 && cut0) {
    ok(fill0.origin.every((v) => v === 0) && cut0.origin.every((v) => v === 0), "the fill and the cut: origins at 0,0,0", [fill0.origin, cut0.origin]);
    const a = await pixel(fill0.x, fill0.y);
    ok(a[0] - a[1] > 12, "origin 0,0,0: the fill reads red inside the cut", a);
    if (SHOTS) await p.locator(".scn-host").first().screenshot({ path: `${SHOTS}/5-origine-zero.png` });
    const moved = await p.evaluate(() => document.querySelector(".scn-host")?.__spaceProxyOrigins?.("centre") ?? 0);
    ok(moved >= 3, "the origins moved to the centres of the volumes (in memory)", moved);
    await p.waitForTimeout(600);
    const fill1 = await screenOf("US3");
    ok(fill1 && fill1.origin.some((v) => Math.abs(v) > 0.1) && Math.abs(fill1.x - fill0.x) < 1 && Math.abs(fill1.y - fill0.y) < 1,
      "origin at the centre: the fill in the same place on the screen", fill1);
    const b = await pixel(fill1.x, fill1.y);
    ok(b[0] - b[1] > 12, "origin at the centre: the fill reads red inside the cut", b);
    ok(a.every((v, i) => Math.abs(v - b[i]) <= 3), "the same pixels with both origins (three sorts by the volume's centre)", [a, b]);
    console.log(`  fill pixel: origin 0 ${a}, origin at the centre ${b}`);
    if (SHOTS) await p.locator(".scn-host").first().screenshot({ path: `${SHOTS}/6-origine-centro.png` });
  } else ok(false, "the fill and the cut on the screen (probe __spaceUnitScreen)", [fill0, cut0]);
  // the global slider multiplies: the proxies' opacity at 0.8 → US 0.8, USN 0.24
  const moved = await p.evaluate(() => {
    const r = [...document.querySelectorAll("input[type=range]")].find((x) => /Proxy/.test(x.closest("label, div, li")?.textContent ?? "")
      && Math.abs(Number(x.value) - 0.42) < 0.011);
    if (!r) return false;
    r.value = "0.8"; r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  await p.waitForTimeout(800);
  if (moved) {
    const u = (await look()).units;
    ok(Math.abs(u.US1.opacity - 0.8) < 1e-3 && Math.abs(u.USN2.opacity - 0.24) < 1e-3,
      "the global slider at 0.8: the US at 0.8, the USN at 0.3 × 0.8 = 0.24 (it multiplies)", [u.US1.opacity, u.USN2.opacity]);
    await shot(p, "4-cursore-0.8");
  } else console.log("  (the proxies' slider was not found: the multiplication is checked by check-threed-style only)");
  if (Object.keys(got.units).length) {
    const u = got.units;
    ok(u.US1.visible && u.US1.edges[0] === "solid" && u.US1.segments[0] === 12, "US: faces, and its thin solid edges (the 12 of the box)", u.US1);
    ok(Math.abs(u.USN2.opacity - 0.3 * u.US1.opacity) < 1e-3 && u.USN2.edges[0] === "solid", "USN: faces at 0.3 × the US's, solid edges", u.USN2);
    ok(!u.USNt4.visible && u.USNt4.edges[0] === "dashed" && u.USNt4.segments[0] > 12, "USNt: no face, dashed edges", u.USNt4);
    ok(u.US3.visible && u.US3.edges[0] === "solid", "the fill: as a US", u.US3);
    ok(u.USN2.rgb.join() !== u.USNt4.rgb.join(), "USN and USNt: two greys", [u.USN2.rgb, u.USNt4.rgb]);
  }
  console.log(JSON.stringify(got.units));
  if (errors.length) fails.push(`page errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
console.log(`check-threed-browser: ${checks - fails.length}/${checks}`);
if (fails.length) { console.error(fails.join("\n")); process.exit(1); }
