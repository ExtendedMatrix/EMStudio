// MICRO-AUTORI-LAYOUT · part 5: the Multigraph (`views/graphs.ts`). Every open
// graph is one node (`graph`), its own paradata hang from it (the members of
// its «Graph paradata» group), the rapporti between graphs are the links the
// datamodel has (s3dgraphy `graphs.<id>.links`), one line per pair and type
// with the count; two copies of one graph do not merge.
//
//   node scripts/check-graphs.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export { buildGraphsDoc } from "./views/graphs";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const graph = (gid, links = []) => ({ graph: { graph_id: gid, name: gid, links, nodes: [
  { id: `${gid}_graphroot`, node_type: "graph", name: "Graph" },
  { id: `${gid}_graph_paradata`, node_type: "ParadataNodeGroup", name: "Graph paradata" },
  { id: `${gid}_graph_author`, node_type: "author", name: "Emanuel Demetrescu" },
  { id: `${gid}_graph_license`, node_type: "license", name: "CC-BY-NC" },
  { id: "US1", node_type: "US", name: "US1" },
], edges: [
  { id: "e1", source: `${gid}_graphroot`, target: `${gid}_graph_paradata`, edge_type: "has_paradata_nodegroup" },
  { id: "e2", source: `${gid}_graph_author`, target: `${gid}_graph_paradata`, edge_type: "is_in_paradata_nodegroup" },
  { id: "e3", source: `${gid}_graph_license`, target: `${gid}_graph_paradata`, edge_type: "is_in_paradata_nodegroup" },
] } });
const link = (to, type) => ({ id: `l${Math.random()}`, edge_type: type, source: "US1", target: { graph_id: to, node_id: "US1" } });

{
  const g = M.buildGraphsDoc([{ slotId: "s1", graphId: "A", label: "Saggio A", doc: graph("A") }]);
  const types = g.doc.graph.nodes.map((n) => n.node_type).sort();
  eq(types, ["author", "graph", "license"], "one graph: its node and its own paradata, not the units");
  eq(g.doc.graph.nodes.find((n) => n.node_type === "graph").name, "Saggio A", "the graph's node says the workspace's name");
  eq(g.doc.graph.edges.map((e) => e.edge_type).sort(), ["has_author", "has_license"], "…hung by has_author / has_license");
}
{
  const g = M.buildGraphsDoc([
    { slotId: "s1", graphId: "A", label: "A", doc: graph("A", [link("B", "is_after"), link("B", "is_after"), link("B", "cuts")]) },
    { slotId: "s2", graphId: "B", label: "B", doc: graph("B") }]);
  const between = g.doc.graph.edges.filter((e) => e.id.startsWith("graphs:link:"))
    .map((e) => `${e.source}>${e.target}:${e.edge_type}×${e.attributes.links}`).sort();
  eq(between, ["A_graphroot>B_graphroot:cuts×1", "A_graphroot>B_graphroot:is_after×2"], "the rapporti: one line per pair and type, counted");
}
{
  const g = M.buildGraphsDoc([
    { slotId: "s1", graphId: "A", label: "v2", doc: graph("A") },
    { slotId: "s2", graphId: "A", label: "v3.2", doc: graph("A") }]);
  eq(g.doc.graph.nodes.filter((n) => n.node_type === "graph").length, 2, "two copies of one graph: two nodes");
  eq(g.realOf.get("s2::A_graphroot"), "A_graphroot", "…the second renamed in the view, its real id kept");
  eq(g.slotOf.get("s2::A_graph_author"), "s2", "…and its slot");
}
console.log(`check-graphs: ${checks} checks passed`);
