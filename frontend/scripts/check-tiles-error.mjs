// MICRO-ERRORE-GEOMETRICO (E.D., 8 Nov 2026) · the tilesets' error set by the
// viewer itself.
//
//   node scripts/check-tiles-error.mjs
//
// `tiles-error.ts` (pure): the profiles, the person's choice, and the governor
// — it grows the error over the calls' goal or the memory's, shrinks it back
// only well under them, never under the profile's start, without oscillating
// (a frame sequence where the tiles' calls follow the error as on the 3tz of
// Templu Mare: calls ∝ 1/error², measured in the MICRO's report).
// `tile-merge.ts` (the pages of one tile stacked): three's own objects, no GPU.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import * as THREE from "three";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (what) => {
  const b = await esbuild.build({ stdin: { contents: what, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, logLevel: "silent", external: ["three"] });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const E = await load(`export * from "./tiles-error";`);
const M = await load(`export * from "./tile-merge";`);
let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, `${m} — got ${JSON.stringify(a)}`); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── the profiles and the choice ───────────────────────────────────────────
eq(Object.fromEntries(Object.entries(E.ERROR_PROFILES).map(([k, p]) => [k, p.start])), { desktop: 16, web: 24, mobile: 32 },
  "the starts: desktop 16, web 24, mobile 32 (the MICRO's starting point)");
ok(E.ERROR_PROFILES.desktop.calls > E.ERROR_PROFILES.web.calls && E.ERROR_PROFILES.web.calls > E.ERROR_PROFILES.mobile.calls,
  "the calls' goal falls with the machine");
eq([E.normaliseErrorChoice("auto"), E.normaliseErrorChoice(undefined), E.normaliseErrorChoice(0), E.normaliseErrorChoice("x"),
    E.normaliseErrorChoice(20.4), E.normaliseErrorChoice(1), E.normaliseErrorChoice(9999)], ["auto", "auto", "auto", "auto", 20, 2, 256],
  "the choice: auto unless a positive number, within the cursor's bounds");

// ── the governor on a scene whose tile calls follow the error ─────────────
// calls(e) = K·(16/e)² for the tiles, plus `rest` the governor does not move
const run = (profile, K, rest, frames, opt = {}) => {
  const g = E.createErrorGovernor(profile);
  const seen = [];
  let t = 0, target = profile.start;
  for (let i = 0; i < frames; i++) {
    const k = typeof K === "function" ? K(i) : K;
    const tileCalls = Math.round(k * (16 / target) ** 2);
    target = g.sample({ calls: tileCalls + rest, tileCalls, bytes: opt.bytes?.(i, target) ?? 0, maxBytes: 100, busy: !!opt.busy?.(i), now: t });
    seen.push(target);
    t += 100; // a sample every 100 ms
  }
  return { g, seen, last: target };
};
const D = E.ERROR_PROFILES.desktop;
{
  const r = run(D, 400, 50, 100);
  eq([r.last, r.g.state().reason], [16, "start"], "under the goal: the error stays the profile's start");
}
{
  // Metashape's level ~4–5 at 16 px: 2 600 calls (181 tiles × 2.2 at level 4 — and the level under it)
  const r = run(D, 2600, 50, 200);
  const st = r.g.state();
  ok(st.tileCalls <= st.tileGoal, `over the goal: the error grows until the tiles' calls fit (${st.tileCalls} ≤ ${st.tileGoal.toFixed(0)})`);
  ok(st.tileCalls >= st.tileGoal * 0.6, "…and no further than one step past it (the band holds)");
  eq(st.reason, "calls", "…said: the calls");
  const changes = r.seen.slice(50).filter((x, i, a) => i && x !== a[i - 1]).length;
  eq(changes, 0, "no oscillation once it fits (the last 15 s of a still camera)");
}
{
  // the rest of the scene (proxies, the globe) takes its share first
  const r = run(D, 600, 700, 200);
  const st = r.g.state();
  ok(r.last > 16 && st.tileCalls <= st.tileGoal, `the rest's 700 calls leave the tiles ${st.tileGoal.toFixed(0)}: the error grows to ${r.last.toFixed(1)}`);
  const r2 = run(D, 600, 5000, 300);
  eq(Math.round(r2.g.state().tileGoal), D.calls / 4, "…but the tiles keep a quarter of the goal, whatever the rest costs");
}
{
  // the camera comes close, then goes away: up, then back to the start, never under
  const r = run(D, (i) => (i < 100 ? 3000 : 300), 0, 400);
  const peak = Math.max(...r.seen);
  ok(peak > 16, `closer: up to ${peak.toFixed(1)}`);
  eq(r.last, 16, "farther: back to the start…");
  ok(Math.min(...r.seen) >= 16, "…never under it");
}
{
  // relaxing waits for the tiles: nothing goes down while one is loading
  const r = run(D, (i) => (i < 60 ? 3000 : 300), 0, 200, { busy: (i) => i >= 60 });
  ok(r.last > 16, "busy: the error is not shrunk while tiles load");
}
{
  // the memory: over 90 % of the ceiling the error grows even with few calls
  const r = run(D, 100, 0, 30, { bytes: () => 95 });
  eq(r.g.state().reason, "memory", "the memory over 90 %: said");
  ok(r.last > 16, "…and the error grows");
  const capped = run(D, 100, 0, 400, { bytes: () => 99 });
  eq(capped.last, D.max, "…up to the profile's max, not beyond");
}
{
  // hysteresis: an error found over budget is not tried again for 10 s
  // tile calls at 16: 1 100 (over 1 000); at 20: 704 — inside the band, holds
  const r = run(D, 1100, 0, 300);
  eq(r.last, 20, "just over the goal: one step (16 → 20) and it holds there");
}
{
  const g = E.createErrorGovernor(D);
  for (let i = 0; i < 20; i++) g.sample({ calls: 5000, tileCalls: 5000, bytes: 0, maxBytes: 1, busy: false, now: i * 500 });
  g.setProfile(E.ERROR_PROFILES.mobile);
  eq(g.state().target, 32, "a new profile: its start");
}

// ── the pages of one tile, stacked ─────────────────────────────────────────
const stats = { tiles: 0, before: 0, after: 0, ms: 0 };
// three 4×8 "BC7" pages (16 bytes a 4×4 block): one level, two rows of blocks
const page = (fill, w = 4, h = 8) => {
  const t = new THREE.CompressedTexture([{ data: new Uint8Array((w / 4) * (h / 4) * 16).fill(fill), width: w, height: h }], w, h, 36492 /* BPTC */);
  t.flipY = false;
  return t;
};
const quad = (uvs) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex([0, 1, 2]);
  return g;
};
const tile = (pages) => {
  const scene = new THREE.Group();
  const grp = new THREE.Group();
  scene.add(grp);
  pages.forEach(([fill, uvs, extra], i) => {
    const m = new THREE.Mesh(quad(uvs), new THREE.MeshBasicMaterial({ map: extra?.map ?? page(fill), ...(extra?.mat ?? {}) }));
    m.name = `p${i}`;
    grp.add(m);
  });
  return { scene, grp };
};
{
  const { scene, grp } = tile([[1, [0, 0, 1, 0, 1, 1]], [2, [0, 0.5, 0.5, 0.5, 1, 1]], [3, [0, 0, 0, 1, 1, 1]]]);
  M.mergeTilePages(THREE, scene, stats);
  eq(grp.children.length, 1, "three pages of one tile: one mesh");
  const m = grp.children[0];
  const tex = m.material.map;
  eq([tex.image.width, tex.image.height, tex.mipmaps[0].height, tex.format], [4, 24, 24, 36492], "…its texture the three pages one under the other");
  eq([...tex.mipmaps[0].data.slice(0, 32)].every((x) => x === 1) && [...tex.mipmaps[0].data.slice(32, 64)].every((x) => x === 2)
     && [...tex.mipmaps[0].data.slice(64)].every((x) => x === 3), true, "…the data end to end, in the pages' order");
  const v = [...m.geometry.attributes.uv.array].filter((_, i) => i % 2).map((x) => +x.toFixed(4));
  eq(v, [0, 0, 0.3333, 0.5 / 3 + 1 / 3, 0.5 / 3 + 1 / 3, 2 / 3, 2 / 3, 1, 1].map((x) => +x.toFixed(4)), "…v moved into each page's band, (k + v) / N");
  eq([...m.geometry.index.array], [0, 1, 2, 3, 4, 5, 6, 7, 8], "…the indices shifted");
  eq([stats.tiles, stats.before, stats.after], [1, 3, 1], "…counted");
}
{
  const s = { tiles: 0, before: 0, after: 0, ms: 0 };
  // a page that repeats (u up to 2): not stacked; a different colour: not with the others
  const a = tile([[1, [0, 0, 2, 0, 1, 1]], [2, [0, 0, 1, 0, 1, 1]]]);
  M.mergeTilePages(THREE, a.scene, s);
  eq(a.grp.children.length, 2, "a uv outside [0, 1]: left as it came");
  const b = tile([[1, [0, 0, 1, 0, 1, 1]], [2, [0, 0, 1, 0, 1, 1], { mat: { color: 0xff0000 } }]]);
  M.mergeTilePages(THREE, b.scene, s);
  eq(b.grp.children.length, 2, "materials that differ beyond their map: left as they came");
  const c = tile([[1, [0, 0, 1, 0, 1, 1]], [2, [0, 0, 1, 0, 1, 1], { map: page(2, 8, 8) }]]);
  M.mergeTilePages(THREE, c.scene, s);
  eq(c.grp.children.length, 2, "pages of different sizes: left as they came");
  const tx = new THREE.Texture({ width: 4, height: 4 });
  const d = tile([[1, [0, 0, 1, 0, 1, 1], { map: tx }], [2, [0, 0, 1, 0, 1, 1], { map: tx }]]);
  M.mergeTilePages(THREE, d.scene, s);
  eq(d.grp.children.length, 2, "an image (not a compressed texture): left as it came");
  eq(s.tiles, 0, "…none counted");
}

console.log(`✓ check-tiles-error: ${n} checks`);
