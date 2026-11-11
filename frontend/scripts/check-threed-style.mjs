// NIGHT-TAGLI-E-NEUTRE (em_visual_rules 1.6.44) · the 3D style of a type, read
// by EMStudio (`palette.ts` nodeThreedStyle, `threed-edges.ts` cutEdges):
//
//   1. the same answer as s3Dgraphy's `get_threed_style`, type by type (the
//      oracle: the sibling checkout's venv; skipped without it);
//   2. EVERY OTHER TYPE IS SEEN AS BEFORE: against the visual rules of 1.6.43
//      (s3Dgraphy c9b970c, read with git), for each type the colour and the
//      effective opacity (type × global, at the global defaults 0.42 / 0.9)
//      are the ones the scene drew, and no edge of its own replaces the contour;
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
    eq(ts.edges.rgb, p.edges.rgba_color.slice(0, 3), `${k} edges colour`);
    eq(ts.geometry, p.geometry, `${k} geometry`);
    eq([ts.featureAngleDeg, ts.dashRatio, ts.gapRatio, ts.tickRatio],
      [p.feature_angle_deg, p.dashed.dash_ratio, p.dashed.gap_ratio, p.corners.tick_ratio], `${k} patterns`);
  }
} else console.log("  (s3Dgraphy venv not found: the oracle is skipped)");

// 2 · every other type as before (1.6.43 = s3Dgraphy c9b970c)
let before = null;
try {
  before = JSON.parse(execFileSync("git", ["-C", S3D, "show", "c9b970c:src/s3dgraphy/JSON_config/em_visual_rules.json"],
    { maxBuffer: 1 << 26 }).toString()).node_styles;
} catch { console.log("  (s3Dgraphy c9b970c not reachable: the before/after table is skipped)"); }
const table = [];
if (before) {
  for (const global of [0.42, 0.9]) {
    for (const k of meshTypes) {
      const m0 = before[k]?.style?.material?.rgba_color;
      const t = P.nodeThreedStyle(k);
      const was = m0 ? { rgb: [m0.r, m0.g, m0.b], opacity: global, edges: "contour" } : null;
      const now = { rgb: t.faces.show ? t.faces.rgb : null, opacity: t.faces.show ? global * t.faces.opacity : 0,
        edges: t.edges.show ? t.edges.style : "contour" };
      if (global === 0.42) table.push({ type: k, before: was, after: now });
      if (k === "USN" || k === "USNt") continue;
      eq(now, was, `${k}: seen as before at the global opacity ${global}`);
    }
  }
}

// 3 · the two voids
const usn = P.nodeThreedStyle("USN"), usnt = P.nodeThreedStyle("USNt");
ok(usn.faces.show && usn.faces.opacity > 0 && usn.faces.opacity < 1, "USN: transparent faces");
eq([usn.edges.show, usn.edges.style], [true, "solid"], "USN: continuous edges");
ok(!usnt.faces.show, "USNt: no faces");
eq([usnt.edges.show, usnt.edges.style], [true, "dashed"], "USNt: dashed edges");
ok(usn.faces.rgb.join() !== usnt.faces.rgb.join(), "USN and USNt: two greys");

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
