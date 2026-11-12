// NIGHT-TAGLI-E-NEUTRE (em_visual_rules 1.6.44) and MICRO-TAGLI-3D-DECISIONI
// (1.6.45, the four decisions of E.D., 11 Nov 2026) · the 3D style of a type, read
// by EMStudio (`palette.ts` nodeThreedStyle, `threed-edges.ts` cutEdges):
//
//   1. the same answer as s3Dgraphy's `get_threed_style`, type by type (the
//      oracle: the sibling checkout's venv; skipped without it);
//   2. AGAINST 1.6.44 (s3Dgraphy 850c7d1, read with git) ONLY THE EDGES CHANGE:
//      for every type the faces (colour, effective opacity type × global at
//      0.42 / 0.9) are the same; the other types' edges become the type's own,
//      solid at 1°, in the colour of the thin contour the scene drew for them
//      (THREE.Color(border_color) = the linear of the 2D frame, EdgesGeometry's
//      default 1°) — so EMStudio is seen as before; the USN's edges turn dark
//      grey (#8C8C8C); the USNt is unchanged;
//   3. USN and USNt are told apart: faces / no faces, solid / dashed, two greys;
//   4. the cut of the edges: solid whole, dashes starting at each corner,
//      corners as two ticks of 0.34 × the shortest side.
//
//   node scripts/check-threed-style.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as P from "./palette"; export * as E from "./threed-edges";
    export { default as rules } from "./assets/em_visual_rules.json";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, loader: { ".png": "dataurl", ".svg": "text" },
});
const { P, E, rules } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const near = (a, b, m) => { assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`); checks++; };

const styles = rules.node_styles;
const meshTypes = Object.keys(styles).filter((k) => styles[k]?.style?.material);
ok(meshTypes.length > 20, `mesh types: ${meshTypes.length}`);

// 1 · the oracle
const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
if (existsSync(PY)) {
  const py = JSON.parse(execFileSync(PY, ["-c", `
import json
from s3dgraphy.utils.utils import get_threed_style
rules = json.load(open(${JSON.stringify(SRC + "assets/em_visual_rules.json")}))
print(json.dumps({k: get_threed_style(k, ${JSON.stringify(SRC + "assets/em_visual_rules.json")}) for k in rules["node_styles"]}))`],
  { env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
  for (const k of Object.keys(styles)) {
    const ts = P.nodeThreedStyle(k);
    const p = py[k];
    if (!p) { eq(ts, null, `${k}: no mesh in both`); continue; }
    eq(ts.faces.show, p.faces.show, `${k} faces.show`);
    near(ts.faces.opacity, p.faces.opacity, `${k} faces.opacity`);
    eq(ts.faces.rgb, p.faces.rgba_color.slice(0, 3), `${k} faces colour`);
    eq([ts.edges.show, ts.edges.style, ts.edges.width], [p.edges.show, p.edges.style, p.edges.width], `${k} edges`);
    eq(ts.featureAngleDeg, p.edges.feature_angle_deg, `${k} edges angle`);
    eq(ts.edges.rgb, p.edges.rgba_color.slice(0, 3), `${k} edges colour`);
    eq(ts.geometry, p.geometry, `${k} geometry`);
    eq([ts.featureAngleDeg, ts.dashRatio, ts.gapRatio, ts.tickRatio],
      [p.feature_angle_deg, p.dashed.dash_ratio, p.dashed.gap_ratio, p.corners.tick_ratio], `${k} patterns`);
  }
} else console.log("  (s3Dgraphy venv not found: the oracle is skipped)");

// 2 · 1.6.44 → 1.6.45: only the edges change (s3Dgraphy 850c7d1)
const lin = (hex) => [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const close = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 0.002);
let before = null;
try {
  before = JSON.parse(execFileSync("git", ["-C", S3D, "show", "850c7d1:src/s3dgraphy/JSON_config/em_visual_rules.json"],
    { maxBuffer: 1 << 26 }).toString());
} catch { console.log("  (s3Dgraphy 850c7d1 not reachable: the before/after table is skipped)"); }
const table = [];
if (before) {
  ok(before.version === "1.6.44" && rules.version === "1.6.45", `1.6.44 → ${rules.version}`);
  // the 1.6.44 reading, as palette.ts read it then (edges show false = the contour)
  const was = (k) => {
    const st = before.node_styles[k]?.style; const m = st?.material?.rgba_color; if (!m) return null;
    const blk = before.threed_style; const own = st.threed ?? {};
    const f = { ...blk.defaults.faces, ...(own.faces ?? {}) }; const e = { ...blk.defaults.edges, ...(own.edges ?? {}) };
    const rgb = f.rgba_color ? [f.rgba_color.r, f.rgba_color.g, f.rgba_color.b] : [m.r, m.g, m.b];
    return { faces: { show: f.show !== false, rgb, opacity: f.opacity },
      edges: e.show ? { style: e.style, rgb: e.rgba_color ? [e.rgba_color.r, e.rgba_color.g, e.rgba_color.b] : rgb, angle: blk.feature_angle_deg }
        : { style: "contour", rgb: lin(styles[k].style.border_color ?? "#555555"), angle: 1 } };
  };
  for (const global of [0.42, 0.9]) {
    for (const k of meshTypes) {
      const w = was(k); const t = P.nodeThreedStyle(k);
      ok(w, `${k}: a mesh type in 1.6.44 too`);
      const facesNow = { show: t.faces.show, rgb: t.faces.rgb, opacity: t.faces.show ? global * t.faces.opacity : 0 };
      const facesWas = { show: w.faces.show, rgb: w.faces.rgb, opacity: w.faces.show ? global * w.faces.opacity : 0 };
      eq(facesNow, facesWas, `${k}: the faces as in 1.6.44 at the global opacity ${global}`);
      if (global !== 0.42) continue;
      const edgesNow = { style: t.edges.style, rgb: t.edges.rgb, angle: t.featureAngleDeg };
      table.push({ type: k, faces: `${facesNow.show ? facesNow.rgb.join("/") : "—"} · ${facesNow.opacity}`,
        before: `${w.edges.style} ${w.edges.rgb.map((x) => x.toFixed(3)).join("/")} ${w.edges.angle}°`,
        after: `${edgesNow.style} ${edgesNow.rgb.map((x) => x.toFixed(3)).join("/")} ${edgesNow.angle}°` });
      ok(t.edges.show, `${k}: has edges (decision 1)`);
      if (k === "USN") {
        eq([edgesNow.style, edgesNow.angle], [w.edges.style, w.edges.angle], "USN: solid at 20° as in 1.6.44");
        eq(edgesNow.rgb, [0.262, 0.262, 0.262], "USN: edges dark grey 0.262 = #8C8C8C (decision 2)");
        ok(!close(edgesNow.rgb, w.edges.rgb), "USN: the edge colour is what changed");
      } else if (k === "USNt") {
        eq(edgesNow, w.edges, "USNt: its edges unchanged");
      } else {
        // the contour the scene drew becomes the type's edges, the same lines
        eq([w.edges.style, w.edges.angle, edgesNow.style, edgesNow.angle], ["contour", 1, "solid", 1], `${k}: contour → solid at 1°`);
        ok(close(edgesNow.rgb, w.edges.rgb), `${k}: the edges in the contour's colour ${edgesNow.rgb} ≈ ${w.edges.rgb}`);
      }
    }
  }
}
// decision 4: three sorts the transparent meshes by their geometry's centre, not their origin
const THREE_SRC = new URL("../node_modules/three/build/three.module.js", import.meta.url).pathname;
if (existsSync(THREE_SRC)) {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(THREE_SRC, "utf8") + (existsSync(THREE_SRC.replace("three.module.js", "three.core.js"))
    ? readFileSync(THREE_SRC.replace("three.module.js", "three.core.js"), "utf8") : "");
  ok(/geometry\.boundingSphere\.center\s*\)[\s\S]{0,120}applyMatrix4\(\s*object\.matrixWorld\s*\)/.test(src),
    "three sorts the transparent meshes by the centre of their bounding sphere (not the origin)");
}

// 3 · the two voids
const usn = P.nodeThreedStyle("USN"), usnt = P.nodeThreedStyle("USNt");
ok(usn.faces.show && usn.faces.opacity > 0 && usn.faces.opacity < 1, "USN: transparent faces");
eq([usn.edges.show, usn.edges.style], [true, "solid"], "USN: continuous edges");
ok(!usnt.faces.show, "USNt: no faces");
eq([usnt.edges.show, usnt.edges.style], [true, "dashed"], "USNt: dashed edges");
ok(usn.faces.rgb.join() !== usnt.faces.rgb.join(), "USN and USNt: two greys of faces");
eq(usn.edges.rgb, usnt.edges.rgb, "USN and USNt: one grey of edges (#8C8C8C), told apart by faces and solid/dashed");

// 4 · the cut
const seg = [0, 0, 0, 10, 0, 0];
eq(E.cutEdges(seg, { style: "solid", size: [10, 4, 2], dashRatio: 0.04, gapRatio: 0.025, tickRatio: 0.34 }), seg, "solid: whole");
const diag = Math.hypot(10, 4, 2);
const dashed = E.cutEdges(seg, { style: "dashed", size: [10, 4, 2], dashRatio: 0.04, gapRatio: 0.025, tickRatio: 0.34 });
near(dashed[0], 0, "dashed: the first dash starts at the corner");
near(dashed[3], 0.04 * diag, "dashed: dash = 0.04 × diagonal");
near(dashed[6], 0.065 * diag, "dashed: then a gap of 0.025 × diagonal");
ok(dashed.length / 6 === Math.ceil(10 / (0.065 * diag)), `dashed: ${dashed.length / 6} dashes on 10 m`);
const corners = E.cutEdges(seg, { style: "corners", size: [10, 4, 2], dashRatio: 0.04, gapRatio: 0.025, tickRatio: 0.34 });
eq(corners.length, 12, "corners: two ticks");
near(corners[3], 0.68, "corners: tick = 0.34 × the shortest side (2 m)");
near(corners[6], 10 - 0.68, "corners: …at the other end too");
const short = E.cutEdges([0, 0, 0, 1, 0, 0], { style: "corners", size: [10, 4, 2], dashRatio: 0.04, gapRatio: 0.025, tickRatio: 0.34 });
near(short[3], 0.5, "corners: never more than half the edge");

if (process.argv.includes("--table")) console.log(JSON.stringify(table, null, 1));
console.log(`check-threed-style: ${checks} checks passed`);
