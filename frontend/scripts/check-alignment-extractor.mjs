// MICRO-PX6 · executable check of «Allineamento» / «Alignment», the extractor of
// its own (src/viewer-annot.ts `alignmentOf`, the Viewer's reading «alignment»,
// and its writing by src/paradata-chain.ts):
//   · two points: the line through them, its azimuth clockwise from the
//     frame's north (+Y, Z up) in the sense of the clicks, the axis 0–180, the
//     length in plan, the slope and the rise; the four quarters, the sense
//     reversed, a slope up and down;
//   · more points: the line fitted in plan by least squares (total: the
//     deviations square to the line), its ends the first and the last click
//     projected, the largest deviation, which point, the rms; the heights fitted
//     along the line; a polyline's sides; a straight polyline = its two ends;
//   · georeferenced coordinates (UTM, hundreds of km) give the same numbers;
//   · refused: one point, points one above the other (no extent in plan);
//   · the reading in the Viewer's form: glTF in (Y up), the values read in the
//     document's frame (Z up), the region's data (`reading_kind` alignment,
//     `value` the azimuth in degrees, `alignment` with its ends in the frame of
//     the coords), the words, `line` for two points and `polyline` for more;
//   · the writing: an extractor of the document, its place ON the model
//     clicked (`is_on_resource` the representation model), `purpose`
//     alignment, ONE undo step; placed again with new vertices (a handle
//     dragged): the old region gone, the reading moved, one step; fed to a
//     property by «Interpretazione».
//
//   node scripts/check-alignment-extractor.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * as va from "./viewer-annot";
      export * as chain from "./paradata-chain";
      export { DocumentStore } from "./model";
    `,
    resolveDir: SRC, loader: "ts",
  },
  bundle: true, format: "esm", write: false, logLevel: "silent",
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
    },
  }],
});
const { va, chain, DocumentStore } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, `${what} — got ${JSON.stringify(a)}`); checks++; };
const near = (a, b, what, eps = 1e-6) => {
  const d = Array.isArray(a) ? Math.max(...a.map((x, i) => Math.abs(x - b[i]))) : Math.abs(a - b);
  assert.ok(d <= eps, `${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); checks++;
};
const A = va.alignmentOf;
const deg = (r) => (r * 180) / Math.PI;

// 1 · two points: the four quarters, the sense, the axis
{
  const n = A([[0, 0, 0], [0, 10, 0]]);
  eq([n.azimuth_deg, n.axis_deg, n.length_m, n.slope_deg, n.rise_m, n.points, n.fit, n.max_dev_m, n.max_dev_at], [0, 0, 10, 0, 0, 2, "two_points", 0, null],
     "north: azimuth 0, length 10, level, two points");
  eq([A([[0, 0, 0], [5, 0, 0]]).azimuth_deg, A([[0, 0, 0], [0, -5, 0]]).azimuth_deg, A([[0, 0, 0], [-5, 0, 0]]).azimuth_deg], [90, 180, 270],
     "east 90, south 180, west 270 (clockwise from north)");
  const ne = A([[1, 1, 0], [4, 4, 0]]);
  near(ne.azimuth_deg, 45, "north-east: 45");
  near(ne.length_m, Math.hypot(3, 3), "…its length in plan", 1e-4);
  const back = A([[4, 4, 0], [1, 1, 0]]);
  near(back.azimuth_deg, 225, "the same line clicked the other way: 225 (the sense of the clicks)");
  near(back.axis_deg, 45, "…the same axis, 45 (an alignment of a wall has no sense)");
  eq(A([[0, 0, 0], [-5, 0, 0]]).axis_deg, 90, "west: axis 90");
  eq([n.start, n.end], [[0, 0, 0], [0, 10, 0]], "the ends: the two clicks");
  eq(n.sides, [{ azimuth_deg: 0, length_m: 10 }], "one side");
}

// 2 · the slope: rising, falling, the 3D path
{
  const up = A([[0, 0, 100], [10, 0, 101]]);
  near(up.slope_deg, deg(Math.atan(0.1)), "rising 1 in 10: 5.71°", 1e-3);
  near(up.rise_m, 1, "…the rise 1 m");
  near(up.length_m, 10, "…the length IN PLAN 10 m");
  near(up.path_3d_m, Math.hypot(10, 1), "…the path in space √101", 1e-4);
  const down = A([[10, 0, 101], [0, 0, 100]]);
  near(down.slope_deg, -deg(Math.atan(0.1)), "the other way: falling, −5.71°", 1e-3);
  near(down.azimuth_deg, 270, "…toward the west");
}

// 3 · more points: the line fitted in plan, the deviations
{
  const pts = [[0, 0.02, 0], [2, -0.02, 0], [4, -0.02, 0], [6, 0.02, 0]];
  const f = A(pts);
  near(f.azimuth_deg, 90, "four points about the x axis: the fitted line runs east");
  near(f.length_m, 6, "…between the first and the last click projected: 6 m");
  near(f.max_dev_m, 0.02, "…the largest deviation 2 cm");
  near(f.rms_m, 0.02, "…the rms 2 cm");
  eq(f.fit, "least_squares_plan", "…fitted by least squares in plan");
  near(f.start, [0, 0, 0], "…its start: the first click on the line");
  near(f.end, [6, 0, 0], "…its end: the last click on the line");
  near(f.path_plan_m, 2 * Math.hypot(2, 0.04) + 2, "…the path as clicked, longer than the line", 1e-4);
  eq(f.sides.length, 3, "…three sides");
  const one = A([[0, 0, 0], [2, 0.1, 0], [4, 0, 0], [6, 0, 0], [8, 0, 0]]);
  eq(one.max_dev_at, 1, "one point off the line: the largest deviation is its (point 2)");
  ok(one.max_dev_m > 0.06 && one.max_dev_m < 0.1, `…about 7 cm (the fitted line pulled 2 cm toward it) (${one.max_dev_m})`);
  // total least squares: a steep line is fitted as well as a flat one (an ordinary y-on-x regression would not)
  const steep = A([[0, 0, 0], [0.01, 3, 0], [-0.01, 6, 0], [0, 9, 0]]);
  near(Math.min(steep.azimuth_deg, 360 - steep.azimuth_deg), 0, `a line running north fitted as such (total least squares): ${steep.azimuth_deg}°`, 0.2);
  // a straight polyline is its two ends
  const str = A([[0, 0, 0], [1, 1, 0], [2, 2, 0], [3, 3, 0]]);
  near([str.azimuth_deg, str.length_m, str.max_dev_m], [45, Math.hypot(3, 3), 0], "points on one line: the line, no deviation", 1e-4);
  // the heights fitted along the line
  const sl = A([[0, 0, 10], [5, 0, 10.6], [10, 0, 11]]);
  near(sl.slope_deg, deg(Math.atan(0.1)), "heights 10, 10.6, 11 over 10 m: the fitted slope 1 in 10", 1e-3);
  near([sl.start[2], sl.end[2]], [10.0333333, 11.0333333], "…the ends at their fitted heights", 1e-4);
  // an L: the fitted line is a compromise, the sides say each leg
  const L = A([[0, 0, 0], [0, 4, 0], [3, 4, 0]]);
  eq(L.sides.map((s) => s.azimuth_deg), [0, 90], "an L: its sides north then east");
  ok(L.max_dev_m > 0.5, "…and the fitted line deviates a lot (the largest deviation says it is no straight alignment)");
}

// 4 · georeferenced coordinates: the same numbers
{
  const E0 = 312345.678, N0 = 4634567.891, a = (30 * Math.PI) / 180;
  const at = (s, off = 0) => [E0 + s * Math.sin(a) + off * Math.cos(a), N0 + s * Math.cos(a) - off * Math.sin(a), 492.5];
  const g = A([at(0, 0.015), at(2, -0.015), at(4, -0.015), at(6, 0.015)]);
  near(g.azimuth_deg, 30, "UTM: a wall running 30° east of north", 1e-3);
  near(g.length_m, 6, "…6 m long", 1e-4);
  near(g.max_dev_m, 0.015, "…the largest deviation 1.5 cm", 2e-4);
}

// 5 · refused
{
  eq(A([[0, 0, 0]]), null, "one point: no alignment");
  eq(A([[0, 0, 0], [0, 0, 2]]), null, "two points one above the other: no extent in plan");
  eq(A([[0, 0, 0], [0.004, 0, 0]]), null, "two points 4 mm apart: no alignment (1 cm at least)");
  eq(A([[1, 1, 0], [1, 1, 1], [1, 1, 2]]), null, "a vertical line of points: none");
}

// 6 · the Viewer's reading: glTF in, values in the document's frame, the region's data
{
  const T = { spot: () => "", impost: () => "", plane: () => "", length: (m) => `lung ${m}`,
    alignment: (az, m, s, dev, n) => `az ${az} · ${m} m${s ? ` · p ${s}` : ""}${dev ? ` · dev ${dev} cm (${n})` : ""}` };
  eq(va.VIEWER_3D_TOOLS.includes("alignment"), true, "a tool of the Viewer");
  eq(va.CLICKS.alignment, 0, "…until Enter or a double click");
  eq(va.READING_KIND.alignment, "alignment", "…its reading_kind");
  // north in the document's frame (+Y, Z up) is −Z in glTF
  const r = va.readingOf("alignment", [[0, 492, 0], [0, 492, -10]], null, T);
  eq([r.trace.kind, r.value, r.regionData.reading_kind, r.regionData.value_unit, r.regionData.value], ["line", 0, "alignment", "deg", 0],
     "two clicks northward: a line, azimuth 0°, the value in degrees");
  eq(r.result, "az 0.0 · 10.000 m", "…its words");
  const e = va.readingOf("alignment", [[0, 0, 0], [10, 1, 0]], null, T);
  near(e.value, 90, "eastward (glTF +X): 90°");
  eq(e.result, "az 90.0 · 10.000 m · p 5.7", "…rising (glTF +Y is up): the slope said");
  const pl = va.readingOf("alignment", [[0, 0, -0.02], [2, 0, 0.02], [4, 0, 0.02], [6, 0, -0.02]], null, T);
  eq(pl.trace.kind, "polyline", "more points: a polyline, the clicks kept");
  eq(pl.trace.vertices.length, 4, "…all four");
  near(pl.regionData.alignment.start, [0, 0, 0], "…the fitted ends stored in the frame of the coords (glTF)", 1e-6);
  near(pl.regionData.alignment.end, [6, 0, 0], "…both", 1e-6);
  ok(/dev 2\.0 cm \(4\)$/.test(pl.result), `…the words say the largest deviation (${pl.result})`);
  eq(va.alignmentOfRegion(pl.regionData).points, 4, "alignmentOfRegion reads it back");
  eq(va.alignmentOfRegion({ reading_kind: "length", value: 3 }), null, "…not a length");
  eq(va.readingOf("alignment", [[0, 0, 0]], null, T), null, "one click: no reading");
  // without the words of an alignment (an old caller): a default
  const T0 = { spot: () => "", impost: () => "", plane: () => "", length: () => "" };
  ok(/° · 10\.000 m$/.test(va.readingOf("alignment", [[0, 0, 0], [0, 0, -10]], null, T0).result), "a caller without the words still gets a value");
}

// 7 · the writing: an extractor of the document, its place on the model, one step; placed again; fed
{
  const n = (id, node_type, name, data = {}) => ({ id, node_type, name, description: "", data });
  const e = (source, target, edge_type) => ({ id: `${source}>${edge_type}>${target}`, source, target, edge_type });
  const G = { nodes: [n("D1", "document", "D.01"), n("RM1", "representation_model", "SM_OB_EST_L"), n("U1", "US", "USM 1")],
              edges: [e("D1", "RM1", "has_representation_model")] };
  const st = new DocumentStore({ version: "1", graph: G, layout: {} });
  const T = { spot: () => "", impost: () => "", plane: () => "", length: () => "", alignment: (az, m) => `azimuth ${az}° · ${m} m` };
  const r = va.readingOf("alignment", [[0, 0, 0], [5, 0, 0]], null, T);
  const before = st.undoDepth ?? 0;
  const made = chain.addFreeExtraction(st, "D1", r.trace, { regionData: r.regionData, result: r.result, on: "RM1", data: { purpose: "alignment" } });
  ok(made, "written");
  const x = st.node(made.extractorId);
  eq([x.node_type, x.data.purpose, x.data.result], ["extractor", "alignment", "azimuth 90.0° · 5.000 m"], "an extractor, purpose alignment, its value as result");
  eq(chain.sourceOf(st.doc, made.extractorId)?.id, "D1", "…extracted from the document");
  const reg = st.node(made.regionId);
  eq([reg.data.geometry_kind, reg.data.reading_kind, reg.data.value, reg.data.value_unit, reg.data.resource_id, reg.data.alignment.length_m],
     ["line", "alignment", 90, "deg", "RM1", 5], "its place: a line, what it read (the azimuth in degrees)");
  eq([reg.data.length, reg.data.unit], [5, "m"], "…the region's own measure: its length in metres (the datamodel's `length`, `unit`)");
  ok(st.doc.graph.edges.some((ed) => ed.source === made.regionId && ed.target === "RM1" && ed.edge_type === "is_on_resource"), "…ON the model clicked");
  eq((st.undoDepth ?? 0) - before, 1, "one undo step");
  // without `on`: on the document, as the Viewer writes
  const v = chain.addFreeExtraction(st, "D1", r.trace, { regionData: r.regionData, result: r.result });
  ok(st.doc.graph.edges.some((ed) => ed.source === v.regionId && ed.target === "D1" && ed.edge_type === "is_on_resource"), "without `on`: on the document (the Viewer)");
  // a handle dragged: placed again, the old region gone, one step
  const r2 = va.readingOf("alignment", [[0, 0, 0], [5, 0, 0], [10, 0, -1]], null, T);
  const d0 = st.undoDepth ?? 0;
  st.batch(() => {
    chain.setReadingGeometry(st, made.extractorId, "RM1", r2.trace, r2.regionData);
    st.updateNode(made.extractorId, { data: { ...st.node(made.extractorId).data, result: r2.result } });
  });
  const reg2 = chain.regionOfExtractor(st.doc, made.extractorId);
  ok(reg2 && reg2.id !== made.regionId, "placed again: a new region");
  eq(st.node(made.regionId), undefined, "…the old one gone (nobody reads it)");
  eq([reg2.data.geometry_kind, reg2.data.vertex_count, reg2.data.alignment.points], ["polyline", 3, 3], "…a polyline of three points");
  eq(chain.resultOf(st.doc, made.extractorId), r2.result, "…the value read again");
  eq((st.undoDepth ?? 0) - d0, 1, "…one undo step");
  // «Interpretazione»: it feeds a property of a unit
  st.batch(() => { st.addNode(n("P1", "property", "alignment")); st.addEdge("U1", "P1", "has_property"); });
  ok(chain.linkExtraction(st, "P1", made.extractorId), "«Interpretazione»: it feeds the unit's «alignment»");
  eq(chain.propertyOfExtractor(st.doc, made.extractorId), "P1", "…that property");
}

console.log(`check-alignment-extractor: ${checks} checks ok`);
