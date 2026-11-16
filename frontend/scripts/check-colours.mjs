// MICRO-E-PORTA-VERSIONI-COLORI p.6 · executable check of src/space-colours.ts:
// the scales (EM Tools' own, em_color_ramps.json), the .emc (EM Tools' format,
// linear floats), the plan of the three modes and the legend's gesture. With
// s3Dgraphy next door (../../s3Dgraphy) it asks s3dgraphy.color_schemes the
// same questions and checks the page answers the same (PARITY).
//
//   node scripts/check-colours.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const C = await load("space-colours.ts");
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

// ── 1 · colour
eq(C.hexToLinear("#FFFFFF"), [1, 1, 1], "white is white");
for (const h of ["#440154", "#E41A1C", "#7AD151", "#000000"]) eq(C.linearToHex(C.hexToLinear(h)), h, `${h} round trip`);
// ── 2 · the scales are EM Tools'
eq(Object.keys(C.RAMPS).sort(), ["diverging", "qualitative", "sequential"], "three kinds of scale");
eq(C.RAMPS.sequential.viridis.colors[0], "#440154", "viridis starts dark purple");
const seq = C.assignRamp(["10", "2", "x", "5"], "sequential", "viridis");
eq([...seq.keys()], ["x", "2", "5", "10"], "sorted as numbers, the rest first");
// ── 3 · the property scheme: numbers on the continuous scale, the sentinels grey
const vals = ["1", "3", "2", C.noValueKey("quota")];
const rs = C.rampScheme("quota", vals, "sequential", "blues");
eq(rs.get("1"), C.RAMPS.sequential.blues.colors[0], "the lowest, the scale's first");
eq(rs.get("3"), C.RAMPS.sequential.blues.colors.at(-1), "the highest, its last");
eq(rs.get(C.noValueKey("quota")), C.NO_VALUE_GREY, "without the property: grey");
// ── 4 · the .emc
const emc = C.emcDocument("material", new Map([["stone", "#E41A1C"]]), "x.em.json");
eq(Object.keys(emc), ["metadata", "color_mapping"], "EM Tools' two keys");
eq(emc.color_mapping.stone.length, 4, "four floats, alpha 1");
eq([...C.emcRead(emc).scheme], [["stone", "#E41A1C"]], "read back as seen");
assert.throws(() => C.emcRead({ color_mapping: {} })); checks++;
// ── 5 · the plan and the legend
const g = { nodes: [{ id: "u1" }, { id: "u2" }, { id: "u3" }, { id: "p1", node_type: "property", name: "material", description: "stone" },
  { id: "p2", node_type: "property", name: "material", description: "" }],
  edges: [{ source: "u1", target: "p1", edge_type: "has_property" }, { source: "u2", target: "p2", edge_type: "has_property" }] };
const units = ["u1", "u2", "u3"];
const pv = C.propertyValues(g, "material", units);
eq([...pv], [["u1", "stone"], ["u2", C.emptyValueKey("material")], ["u3", C.noValueKey("material")]], "values as EM Tools reads them");
eq(C.propertyNames(g, units), [{ name: "material", units: 2 }], "the properties the units have");
let st = { ...C.defaultColourState(), mode: "property", property: "material", scheme: { stone: "#E41A1C" } };
let plan = C.colourPlan(st, units, { epochs: [], firstOf: () => null, values: pv });
eq(plan.legend.map((l) => [l.label, l.count, !!l.none]), [["stone", 1, false], ["", 2, true]], "legend: the value, and «senza valore» (empty or absent)");
eq(plan.colour.get("u3"), C.NO_VALUE_GREY, "no value: grey");
const eps = [{ id: "E1", name: "I", color: "#FF0000" }, { id: "E2", name: "II", color: "#00FF00" }, { id: "E3", name: "III", color: "#0000FF" }];
const first = { u1: "E1", u2: "E2", u3: "E2" };
st = { ...C.defaultColourState(), mode: "epochs", variant: "new" };
plan = C.colourPlan(st, units, { epochs: eps, firstOf: (u) => first[u], bornHere: new Set(["u2", "u3"]) });
eq(plan.counts, { born: 2, survived: 1 }, "nuove 2 · sopravvissute 1");
ok(plan.faded.has("u1") && !plan.faded.has("u2"), "the survived one is faded");
eq(plan.colour.get("u1"), "#FF0000", "the colour of its birth");
eq(plan.legend.map((l) => [l.label, l.count]), [["I", 1], ["II", 2], ["III", 0]], "every epoch in the legend, with its number");
let s2 = C.legendClick(st, "E2");
ok(s2.isolated === "E2" && !C.legendShows(s2, plan, "u1") && C.legendShows(s2, plan, "u2"), "a click isolates");
s2 = C.legendClick(s2, "E2");
ok(!s2.isolated && !C.legendShows(s2, plan, "u2") && C.legendShows(s2, plan, "u1"), "another hides");
s2 = C.legendClick(s2, "E2");
ok(C.legendShows(s2, plan, "u2"), "a third gives back");

// ── 6 · PARITY with s3Dgraphy
const S3D = path.resolve(new URL("../../../s3Dgraphy", import.meta.url).pathname);
const PY = [path.join(S3D, ".venv/bin/python"), "python3"].find((p) => p === "python3" || fs.existsSync(p));
if (fs.existsSync(path.join(S3D, "src/s3dgraphy/color_schemes.py"))) {
  const code = `
import json,sys
sys.path.insert(0, ${JSON.stringify(path.join(S3D, "src"))})
from s3dgraphy import color_schemes as c
out = {
 "seq": c.assign_ramp(["10","2","x","5"], "sequential", "viridis"),
 "div": c.assign_ramp(["-3","-1","0","1","2"], "diverging", "brown_teal"),
 "qual": c.assign_ramp(["b","a","c"], "qualitative", "pastel"),
 "cont": [c.continuous_color(x, 0, 10, "sequential", "heat") for x in (0, 2.5, 7, 10)],
 "emc": c.emc_document("material", {"stone": "#E41A1C", "brick": "#7AD151"}, created="x"),
 "read": c.emc_read({"metadata": {"property_name": "f"}, "color_mapping": {"a": [0.267004, 0.004874, 0.329415, 1.0], "b": [1.0, 0.5, 0.0]}})[1],
}
print(json.dumps(out))`;
  const py = JSON.parse(execFileSync(PY, ["-c", code], { encoding: "utf8" }));
  eq(Object.fromEntries(C.assignRamp(["10", "2", "x", "5"], "sequential", "viridis")), py.seq, "parity: sequential");
  eq(Object.fromEntries(C.assignRamp(["-3", "-1", "0", "1", "2"], "diverging", "brown_teal")), py.div, "parity: diverging");
  eq(Object.fromEntries(C.assignRamp(["b", "a", "c"], "qualitative", "pastel")), py.qual, "parity: qualitative");
  eq([0, 2.5, 7, 10].map((x) => C.continuousColour(x, 0, 10, "sequential", "heat")), py.cont, "parity: continuous");
  eq(C.emcDocument("material", { stone: "#E41A1C", brick: "#7AD151" }, "x"), py.emc, "parity: the .emc written");
  eq(Object.fromEntries(C.emcRead({ metadata: { property_name: "f" }, color_mapping: { a: [0.267004, 0.004874, 0.329415, 1.0], b: [1.0, 0.5, 0.0] } }).scheme), py.read, "parity: an EM Tools file read");
} else console.log("check-colours: s3Dgraphy not next door, parity skipped");
console.log(`check-colours: ${checks} checks passed`);
