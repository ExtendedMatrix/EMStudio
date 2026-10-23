// MICRO-GEOREF-GRAFO · the georeference as a node of the graph (`src/georef.ts`
// and the store's `geoPositionNode` / `putGeoInGraphParadata` / `setGeoreference`):
//
//   1. the GT16 (a copy, `GEOREF_V4`, else a synthetic graph): its GeoPositionNode
//      with 0 edges joins the graph's «Graph paradata» group with ONE
//      `is_in_paradata_nodegroup` (the id of the author's, the licence's), once,
//      in one undo step that takes it away; the node's values do not change;
//      the em.json round trip keeps node, edge and values;
//   2. a graph without a georeference: no node invented; «Georeference…»
//      (`setGeoreference`) makes `geo_<graph id>` (z 0, the grid north), the
//      group and the graph's own node when missing, in one step;
//   3. the SHIFT.txt: written as EM Tools and 3DSC write it, read as s3Dgraphy's
//      `api.read_shift` reads it (compared with s3Dgraphy when its venv is there);
//      a scene point → the CRS with the azimuth as s3Dgraphy's
//      `georeference_scene` turns it; the two conversions (the same grid: the
//      code only; another grid: the shift reprojected).
//
//   node scripts/check-georef.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = new URL("../src/", import.meta.url).pathname;
const globPlugin = {
  name: "glob",
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      let text = readFileSync(args.path, "utf8");
      text = text.replace(/import\.meta\.glob\(\s*"\.\/assets\/([^/]+)\/\*\.(\{[^}]+\}|\w+)"[\s\S]*?\}\)/g,
        (_m, dir, ext) => {
          const exts = ext.startsWith("{") ? ext.slice(1, -1).split(",") : [ext];
          const files = readdirSync(`${SRC}assets/${dir}`).filter((f) => exts.some((e) => f.endsWith(`.${e}`)));
          return JSON.stringify(Object.fromEntries(files.map((f) => [`./assets/${dir}/${f}`, `url:${f}`])));
        });
      return { contents: text, loader: "ts" };
    });
  },
};
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./georef"; export { DocumentStore } from "./model";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, plugins: [globPlugin],
  loader: { ".svg": "text", ".png": "text" }, logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, w) => { assert.ok(c, w); checks++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, `${w} — got ${JSON.stringify(a)}`); checks++; };

const PY = process.env.PYTHON ?? new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname;
const py = existsSync(PY) ? (code) => JSON.parse(execFileSync(PY, ["-c", code], { encoding: "utf8" })) : null;

const V4 = process.env.GEOREF_V4 ?? "/tmp/georef/pkg/EM/TempluMare_v4.em.json";
const strip = (d) => { const { field_clocks: _f, ...rest } = d ?? {}; return rest; };
const PDG = "g_graph_paradata";
const synthetic = () => ({ graph: { graph_id: "g", name: "g", data: {}, nodes: [
  { id: "g_graphroot", node_type: "graph", name: "Graph", description: "" },
  { id: PDG, node_type: "ParadataNodeGroup", name: "Graph paradata", description: "" },
  { id: "g_graph_license", node_type: "license", name: "CC-BY", description: "" },
  { id: "geo_g", node_type: "geo_position", name: "geo_position", description: "",
    data: { epsg: 3844, shift_x: 327372.56, shift_y: 448682.65, shift_z: 0, rotation: 0, rotation_reference: "grid" } },
  { id: "US1", node_type: "US", name: "US1", description: "" },
], edges: [
  { id: `g_graphroot__has_paradata_nodegroup__${PDG}`, source: "g_graphroot", target: PDG, edge_type: "has_paradata_nodegroup" },
  { id: `g_graph_license__is_in_paradata_nodegroup__${PDG}`, source: "g_graph_license", target: PDG, edge_type: "is_in_paradata_nodegroup" },
] } });

// ── 1 · the node joins the graph's paradata group ──────────────────────────
const one = (doc, label) => {
  const st = new M.DocumentStore(doc);
  const geo = st.geoPositionNode();
  ok(!!geo, `${label}: the GeoPositionNode is read`);
  const pdg = st.graphParadataGroup();
  const before = JSON.parse(JSON.stringify(geo.data));
  const edgesBefore = st.doc.graph.edges.length;
  ok(st.geoOutsideGraphParadata(), `${label}: outside the group before`);
  st.batch(() => st.putGeoInGraphParadata());
  const mine = st.doc.graph.edges.filter((e) => e.source === geo.id);
  eq(mine.map((e) => [e.edge_type, e.target, e.id]), [["is_in_paradata_nodegroup", pdg, `${geo.id}__is_in_paradata_nodegroup__${pdg}`]],
    `${label}: one is_in_paradata_nodegroup to «Graph paradata», the id as the author's and the licence's`);
  eq(st.doc.graph.edges.length, edgesBefore + 1, `${label}: one edge more, nothing else`);
  ok(!st.geoOutsideGraphParadata(), `${label}: inside after`);
  eq(st.putGeoInGraphParadata(), false, `${label}: idempotent (a second open writes nothing)`);
  eq(strip(st.geoPositionNode().data), strip(before), `${label}: the values do not change`);
  ok(st.dirty, `${label}: the file is modified`);
  // the round trip
  const back = new M.DocumentStore(JSON.parse(st.toJSON()));
  eq(back.doc.graph.edges.filter((e) => e.source === geo.id).length, 1, `${label}: round trip — the edge, once`);
  eq(strip(back.geoPositionNode().data), strip(before), `${label}: round trip — the values`);
  ok(!back.geoOutsideGraphParadata(), `${label}: round trip — reopened, nothing to correct`);
  // undo
  st.undo();
  ok(st.geoOutsideGraphParadata(), `${label}: one undo takes the correction away`);
  eq(st.doc.graph.edges.length, edgesBefore, `${label}: …and only it`);
};
one(synthetic(), "synthetic");
if (existsSync(V4)) {
  const f = JSON.parse(readFileSync(V4, "utf8"));
  const gid = Object.keys(f.graphs).find((k) => (f.graphs[k].nodes ?? []).length > 100);
  const doc = { graph: f.graphs[gid], layout: f.graphs[gid].layout };
  const g = doc.graph.nodes.find((n) => n.node_type === "geo_position");
  eq([g.id, g.data.epsg, g.data.shift_x, g.data.shift_y, g.data.shift_z], ["geo_TempluMare_v2", 3844, 327372.56, 448682.65, 0], "GT16: the anchor as corrected on 23 Oct (EPSG:3844, z 0)");
  eq(doc.graph.edges.filter((e) => e.source === g.id || e.target === g.id).length, 0, "GT16: 0 edges on disk");
  one(doc, "GT16");
} else console.log(`  (the GT16 copy is not at ${V4}: the synthetic graph only)`);

// ── 2 · a graph without one: nothing invented; «Georeference…» makes it ────
{
  const d = synthetic();
  d.graph.nodes = d.graph.nodes.filter((n) => n.node_type !== "geo_position");
  const st = new M.DocumentStore(d);
  eq(st.geoPositionNode(), undefined, "no georeference: no node");
  eq(st.geoOutsideGraphParadata(), false, "…and nothing to correct");
  const n = st.setGeoreference({ epsg: 3004 });
  eq([n.id, n.data.epsg, n.data.shift_x, n.data.shift_y, n.data.shift_z, n.data.rotation, n.data.rotation_reference],
    ["geo_g", 3004, 0, 0, 0, 0, "grid"], "«Georeference…»: geo_<graph id>, the CRS, z 0, the grid north");
  ok(!st.geoOutsideGraphParadata(), "…in the graph's paradata group");
  st.setGeoreference({ shift_x: 2355500, shift_y: 4617500 });
  eq(st.doc.graph.nodes.filter((x) => x.node_type === "geo_position").length, 1, "a second write: the same node");
  eq(st.doc.graph.edges.filter((e) => e.source === "geo_g").length, 1, "…the same edge");
  st.undo(); st.undo();
  eq(st.geoPositionNode(), undefined, "two undo: as it was");
  // no group, no graph node: both made
  const bare = new M.DocumentStore({ graph: { graph_id: "b", name: "b", data: {}, nodes: [{ id: "US1", node_type: "US", name: "US1", description: "" }], edges: [] } });
  const b = bare.setGeoreference({ epsg: 32633, shift_x: 1, shift_y: 2 });
  const grp = bare.graphParadataGroup();
  ok(!!grp && !!bare.graphRootNode(), "a bare graph: its own node and its paradata group are made");
  eq(bare.doc.graph.edges.filter((e) => e.source === b.id).map((e) => e.target), [grp], "…and the georeference is in it");
  bare.undo();
  eq(bare.doc.graph.nodes.length, 1, "one undo: the three nodes and two edges go together");
}

// ── 3 · SHIFT.txt, the scene → the CRS, the conversions ────────────────────
{
  const g = { epsg: 3844, shift_x: 327372.56, shift_y: 448682.65, shift_z: 0 };
  eq(M.formatShiftTxt(g), "EPSG::3844 327372.56 448682.65 0\n", "SHIFT.txt as EM Tools writes it");
  eq(M.formatShiftTxt({ epsg: "EPSG:31700", shift_x: 327300, shift_y: 448370, shift_z: 500 }), "EPSG::31700 327300 448370 500\n", "…the epsg written «EPSG:31700»");
  eq(M.formatShiftTxt({}), null, "no CRS: nothing to write");
  eq(M.georefSummary(g), "EPSG:3844 · 327372.56, 448682.65, 0", "the tooltip");
  eq(M.georefSummary({ ...g, rotation: 12.5 }), "EPSG:3844 · 327372.56, 448682.65, 0 · 12.5°", "…with the azimuth when there is one");
  const texts = ["EPSG::3844 327372.56 448682.65 0", "EPSG:3004 2355500 4617500", "# the lab\n\nEPSG::31700 327300 448370 500\n",
    "epsg::32633, 500000.5; 4649776.25", "EPSG::2056 2600000 1200000 -3.5e1", "nothing here"];
  const mine = texts.map((t) => { const r = M.parseShiftTxt(t); return r ? [r.epsg, r.shift_x, r.shift_y, r.shift_z] : null; });
  eq(mine, [[3844, 327372.56, 448682.65, 0], [3004, 2355500, 4617500, 0], [31700, 327300, 448370, 500], [32633, 500000.5, 4649776.25, 0], [2056, 2600000, 1200000, -35], null],
    "SHIFT.txt read: z 0 when the file has none");
  eq(M.parseShiftTxt("EPSG:3004 2355500 4617500").zGiven, false, "…and it says the z was not there");
  for (const t of texts) eq(M.parseShiftTxt(M.formatShiftTxt(M.parseShiftTxt(t) ?? {}) ?? "") ?? null, M.parseShiftTxt(t) ? { ...M.parseShiftTxt(t), zGiven: true } : null, `written and read again: ${JSON.stringify(t).slice(0, 30)}`);
  if (py) {
    const s3 = py(`import json, sys; sys.path.insert(0, ${JSON.stringify(new URL("../../../s3Dgraphy/src", import.meta.url).pathname)})
from s3dgraphy import api
out = []
for t in ${JSON.stringify(texts)}:
    try:
        r = api.read_shift(t); out.append([r["epsg"], r["shift_x"], r["shift_y"], r["shift_z"]])
    except ValueError:
        out.append(None)
print(json.dumps(out))`);
    eq(mine, s3, "SHIFT.txt read as s3Dgraphy's api.read_shift reads it");
    // the azimuth, as georeference_scene turns a scene point
    const pts = [[10, 0], [0, 10], [-25.5, 40]];
    const want = py(`import json, sys, math; sys.path.insert(0, ${JSON.stringify(new URL("../../../s3Dgraphy/src", import.meta.url).pathname)})
from s3dgraphy.graph import Graph
from s3dgraphy import api
g = Graph("g"); api.declare_georeference(g, 3844, 327372.56, 448682.65, 0, rotation=30)
a = api._geo_anchor(g); th = math.radians(a["rotation"])
print(json.dumps([[x*math.cos(th)+y*math.sin(th)+a["shift_x"], -x*math.sin(th)+y*math.cos(th)+a["shift_y"]] for x, y in ${JSON.stringify(pts)}]))`);
    pts.forEach((p, i) => { const got = M.localToCrs({ ...g, rotation: 30 }, p[0], p[1]); ok(Math.hypot(got[0] - want[i][0], got[1] - want[i][1]) < 1e-6, `a scene point → the CRS as s3Dgraphy turns it (${p})`); });
  } else console.log("  (no s3Dgraphy venv: the comparison with read_shift and georeference_scene is skipped)");
  eq(M.localToCrs(g, 0, 0), [327372.56, 448682.65], "the scene's origin is the shift");
  eq(M.boxCentreData([[-50, 489, -63], [66, 587, 53]]), [8, 5], "a box of the Space (three's z = −y) → the data's x, y");
  eq(Math.round(M.distanceFromShift(g, 327372.56 + 300, 448682.65 + 400)), 500, "the distance from the shift");
  eq(M.conversionPatch(true, 3844), { epsg: 3844 }, "the same grid: the code only, the shift as it is");
  eq(M.conversionPatch(false, 32634, { x: 712345.6789, y: 5043210.12345 }), { epsg: 32634, shift_x: 712345.679, shift_y: 5043210.123 }, "another grid: the shift reprojected (mm)");
  eq(M.conversionPatch(false, 32634, null), null, "another grid without a reprojection: nothing");
  eq(M.crsWarning({ ok: true, epsg: 31700, deprecated: true, replacements: [{ epsg: 3844, name: "x", same_grid: true, source: "EPSG" }] })?.why, "deprecated", "a deprecated code is said");
  eq(M.crsWarning({ ok: true, epsg: 9999, deprecated: false, to_wgs84: { name: "Ballpark…", accuracy: null, ballpark: true } })?.why, "ballpark", "a ballpark transformation is said");
  eq(M.crsWarning({ ok: true, epsg: 3844, deprecated: false, to_wgs84: { name: "Pulkovo 1942(58) to WGS 84 (19)", accuracy: 3, ballpark: false } }), null, "3844: nothing to say");
  eq(M.verticalOf({}), "orthometric", "the vertical reference: orthometric unless said");
  eq(M.epsgOf({ epsg: "EPSG::3844" }), 3844, "an epsg written with its prefix");
}

console.log(`georef: ${checks} checks passed`);
