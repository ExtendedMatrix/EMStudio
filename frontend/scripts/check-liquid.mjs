// G3 · the liquid Graph's rules (`views/liquid.ts`), in node.
//
//   node scripts/check-liquid.mjs
//
// The family and the rings of a disc come from the datamodel's classes; the
// radius grows with the degree inside its bounds; epochs and groups are halos,
// not discs; the local graph is the selection and N steps; the filter dims or
// hides; a registered query narrows. The worker and the drawing are measured in
// a browser (the night's report): this is what can be said without one.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./views/liquid";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" },
  define: { "import.meta.env": "{}" },
});
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const L = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const S = (t) => L.discStyle(t);
ok(S("US").family === "real" && S("US").ring === "none", "US: a full disc, no ring");
ok(S("SF").family === "real" && S("SF").ring === "octagon", "SF: a thin octagon");
ok(S("USVs").family === "virtual" && S("USVs").ring === "double", "USV/s: a dark disc, double ring");
ok(S("USVn").family === "virtual" && S("USVn").ring === "dashed", "USV/n: dashed ring");
ok(S("VSF").family === "virtual" && S("VSF").ring === "dashed_octagon", "VSF: dashed and the octagon");
ok(S("extractor").family === "paradata" && S("extractor").glyph?.key === "extractor" && S("extractor").scale < 1, "paradata: smaller, with its glyph");
ok(S("representation_model").family === "object" && S("representation_model").glyph?.key === "representation_model", "an RM: a disc with its glyph");
ok(L.discStyle("resource", { tier: "distribution", url_type: "3d_model", url: "a/b.glb" }).glyph?.key === "version:gltf", "a version: its version glyph");
ok(L.discRadius(0, 1) === L.R_MIN && L.discRadius(10000, 1) === L.R_MAX && L.discRadius(9, 1) > L.discRadius(1, 1), "the radius grows with the degree, between its bounds");

const doc = { graph: { nodes: [
  { id: "EP", node_type: "EpochNode", name: "Roman", data: { color: "#CC8800" } },
  { id: "ACT", node_type: "ActivityNodeGroup", name: "Act" },
  { id: "A", node_type: "US", name: "US1" }, { id: "B", node_type: "US", name: "US2" }, { id: "C", node_type: "USVs", name: "USV3" },
  { id: "D", node_type: "property", name: "material" },
], edges: [
  { source: "A", target: "EP", edge_type: "has_first_epoch" }, { source: "B", target: "EP", edge_type: "has_first_epoch" },
  { source: "A", target: "ACT", edge_type: "is_in_activity" }, { source: "C", target: "ACT", edge_type: "is_in_activity" },
  { source: "A", target: "B", edge_type: "is_after" }, { source: "B", target: "C", edge_type: "is_after" }, { source: "C", target: "D", edge_type: "has_property" },
] } };
const sc = L.buildLiquidScene(doc, undefined, new Map(), () => ({ x: 0, y: 0 }));
ok(sc.nodes.length === 4 && !sc.byId.has("EP") && !sc.byId.has("ACT"), "epochs and groups are not discs");
ok(sc.edges.length === 3, "membership and attribution are halos, not lines");
const ep = sc.liquid.halos.find((h) => h.id === "EP"), act = sc.liquid.halos.find((h) => h.id === "ACT");
ok(ep?.kind === "epoch" && ep.color === "#CC8800" && ep.members.sort().join() === "A,B", "the epoch's halo: its colour, its members");
ok(act?.kind === "group" && act.members.sort().join() === "A,C", "the group's halo");
ok(sc.byId.get("B").w > sc.byId.get("D").w, "a unit with two edges is larger than a property with one");
ok(L.localNeighbourhood(sc, ["A"], 0) === null, "local graph off: no restriction");
ok([...L.localNeighbourhood(sc, ["A"], 1)].sort().join() === "A,B", "one step from A: A and B");
ok([...L.localNeighbourhood(sc, ["A"], 2)].sort().join() === "A,B,C", "two steps: and C");
const f = { epochs: null, text: "", hide: false };
const n = (id) => sc.byId.get(id);
const epochOf = (id) => (id === "A" || id === "B" ? ["EP"] : []);
ok(L.discVisibility(n("C"), f, epochOf, null) === "show", "no filter: shown");
ok(L.discVisibility(n("C"), { ...f, text: "usv" }, epochOf, null) === "show" && L.discVisibility(n("A"), { ...f, text: "usv" }, epochOf, null) === "dim", "text: what does not match is dimmed");
ok(L.discVisibility(n("A"), { ...f, text: "usv", hide: true }, epochOf, null) === "hide", "…or hidden, by the switch");
ok(L.discVisibility(n("A"), { ...f, epochs: new Set(["OTHER"]) }, epochOf, null) === "dim", "epochs: a node of another epoch is dimmed");
ok(L.discVisibility(n("D"), f, epochOf, new Set(["A"])) === "hide", "outside the local graph: hidden");
L.registerGraphQuery((node) => node.node_type === "US");
ok(L.discVisibility(n("C"), f, epochOf, null) === "dim" && L.discVisibility(n("A"), f, epochOf, null) === "show", "a registered query narrows (the seam for the queries)");
L.registerGraphQuery(null);
ok(L.discVisibility(n("C"), f, epochOf, null) === "show", "…and is removed");
console.log(`check-liquid: ${checks} checks ✓`);
