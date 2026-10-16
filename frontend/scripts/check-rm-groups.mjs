// MICRO-SPAZIO-3D-3 p.7 · the RM containers' writes — pure (`src/rm-groups.ts`):
//
//   node scripts/check-rm-groups.mjs [fixture.em.json]
//
// · the ids are EM Tools' (`rm_manager/group_nodes.py`): the group from the
//   document (or the label), the membership and the document's edge; read
//   against a fixture written by EM Tools' own functions when one is given;
// · a new container: the group, the document's edge, the members;
// · the 1:1 rule: a move takes the model out of the container it was in;
// · «Togli dal contenitore» takes the memberships only.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as G from "./rm-groups";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { G } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

eq(G.groupNodeIdFor("Survey 2015", "D01"), "D01_rmgroup", "the group's id from its document (EM Tools)");
eq(G.groupNodeIdFor("Survey 2015", null), "rmgroup_Survey_2015", "…from the label without a document");
eq(G.groupNodeIdFor("Città alta", ""), "rmgroup_Città_alta", "…a letter is a letter (Python's isalnum)");
eq(G.membershipEdgeId("RM1", "D01_rmgroup"), "RM1_is_in_representation_model_group_D01_rmgroup", "the membership edge's id");
eq(G.docEdgeId("D01", "D01_rmgroup"), "D01_has_representation_model_D01_rmgroup", "the document's edge id");

const doc = { graph: { nodes: [
  { id: "D01", node_type: "document", name: "D.01" }, { id: "RM1", node_type: "representation_model" },
  { id: "RM2", node_type: "representation_model" }, { id: "RM3", node_type: "representation_model" },
  { id: "G0", node_type: "RepresentationModelNodeGroup", name: "Old" },
], edges: [{ id: "m3", source: "RM3", target: "G0", edge_type: "is_in_representation_model_group" }] } };
const p1 = G.planNewGroup(doc, "Survey 2015", "D01", ["RM1", "RM3"]);
eq(p1.addNodes.map((n) => [n.id, n.node_type, n.name]), [["D01_rmgroup", "RepresentationModelNodeGroup", "Survey 2015"]], "a new container: its node");
eq(p1.addEdges.map((e) => e.id), ["D01_has_representation_model_D01_rmgroup", "RM1_is_in_representation_model_group_D01_rmgroup", "RM3_is_in_representation_model_group_D01_rmgroup"], "…the document's edge, the members'");
eq(p1.removeEdges, ["m3"], "1:1 — RM3 leaves the container it was in");
const p2 = G.planNewGroup(doc, "Senza", null, ["RM2"]);
ok(!p2.addEdges.some((e) => e.type === "has_representation_model"), "a container without a document has no document's edge");
const doc2 = { graph: { nodes: [...doc.graph.nodes, { id: "D01_rmgroup", node_type: "RepresentationModelNodeGroup", name: "S" }],
  edges: [...doc.graph.edges, { id: "RM1_is_in_representation_model_group_D01_rmgroup", source: "RM1", target: "D01_rmgroup", edge_type: "is_in_representation_model_group" }] } };
eq(G.planNewGroup(doc2, "Altro", "D01", ["RM2"]).taken, "S", "a second container of the same document: refused (one container per document, EM Tools' id)");
eq(G.planNewGroup({ graph: { nodes: [...doc.graph.nodes, { id: "rmgroup_S", node_type: "RepresentationModelNodeGroup", name: "S" }], edges: [] } }, "S", null, ["RM2"]).addNodes, [], "without a document the same label is the same container (ensure_group)");
eq(G.planMove(doc2, "D01_rmgroup", ["RM1"]).addEdges, [], "a move into the container it is in: nothing");
eq(G.groupOfModel(doc2, "RM1"), "D01_rmgroup", "the container a model is in");
eq(G.planRemove(doc2, ["RM1", "RM3"]).removeEdges, ["m3", "RM1_is_in_representation_model_group_D01_rmgroup"], "«Togli dal contenitore»: the memberships, nothing else");

// against a file written by EM Tools' own functions (the fixture of the report)
const FIX = process.argv[2] ?? "/tmp/spazio3/templu-mare/EM/TempluMare_v2_containers.em.json";
if (existsSync(FIX)) {
  const f = JSON.parse(readFileSync(FIX, "utf8"));
  const g = f.graph ?? Object.values(f.graphs)[0];
  const groups = g.nodes.filter((n) => n.node_type === "RepresentationModelNodeGroup");
  for (const gr of groups) {
    const de = g.edges.find((e) => e.edge_type === "has_representation_model" && e.target === gr.id);
    eq(gr.id, G.groupNodeIdFor(gr.name, de?.source ?? null), `EM Tools' group «${gr.name}»: the same id here`);
    if (de) eq(de.id, G.docEdgeId(de.source, gr.id), `…its document's edge, the same id`);
    const m = g.edges.find((e) => e.edge_type === "is_in_representation_model_group" && e.target === gr.id);
    eq(m.id, G.membershipEdgeId(m.source, gr.id), `…a membership edge, the same id`);
  }
  console.log(`  (read against ${groups.length} groups of ${FIX})`);
}
console.log(`check-rm-groups: ${checks} checks passed`);
