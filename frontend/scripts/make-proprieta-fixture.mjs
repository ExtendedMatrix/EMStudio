// PROPRIETA · the small fixture of MICRO-PROPRIETA-COMPATTA, written on purpose:
//
//   · US1 with three direct properties (material, shape, height);
//   · US2 that already has its ParadataNodeGroup (PD_US2, holding «material»);
//   · a property with two owners and no `inherited` (P_MULTI: US1 and US3);
//   · a USVs with a declared inheritance (USV10 ──has_property{inherited}──▶ P1A);
//   · a combiner (C.1) and an extractor (D.01.02) shared between properties of
//     different units (P1A of US1 and P2B of US2; P1B of US1 and P2A of US2);
//   · a master document in an epoch (D.01 ──has_first_epoch──▶ EP_ROM).
//
//   node scripts/make-proprieta-fixture.mjs   → testdata/proprieta.em.json
//   (then `emstudio layout` writes its layout in place)
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = new URL("../testdata/proprieta.em.json", import.meta.url).pathname;
const CLI = new URL("../../target/release/emstudio", import.meta.url).pathname;

const nodes = [];
const edges = [];
const node = (id, node_type, name, description = "", data = {}) =>
  nodes.push({ id, node_type, name, description, data });
const edge = (source, edge_type, target, attributes) =>
  edges.push({ id: `${source}__${edge_type}__${target}`, edge_type, source, target,
               ...(attributes ? { attributes } : {}) });

node("EP_ROM", "EpochNode", "Età imperiale", "", { start_time: 1, end_time: 300 });
node("EP_MED", "EpochNode", "Medioevo", "", { start_time: 900, end_time: 1300 });

node("US1", "US", "US1", "Muro in opera quadrata");
node("US2", "US", "US2", "Pavimento in cocciopesto");
node("US3", "US", "US3", "Crollo del muro");
node("USV10", "USVs", "USV10", "Ricostruzione dell'alzato");
for (const u of ["US1", "US2", "USV10"]) edge(u, "has_first_epoch", "EP_ROM");
edge("US3", "has_first_epoch", "EP_MED");
edge("US3", "is_after", "US1");
edge("US1", "is_after", "US2");
edge("USV10", "is_after", "US1");

// documents: D.01 the master dated in its epoch, D.02 a plain one
node("D.01", "document", "D.01", "Rilievo 1987", { is_canonical: true });
node("D.02", "document", "D.02", "Fotografia del 1934");
edge("D.01", "has_first_epoch", "EP_ROM");

// US1 · three direct properties
node("P1A", "property", "material", "tufo", { property_type: "material" });
node("P1B", "property", "shape", "rettangolare", { property_type: "shape" });
node("P1C", "property", "height", "2.40", { property_type: "height" });
for (const p of ["P1A", "P1B", "P1C"]) edge("US1", "has_property", p);
// P1A ← C.1 (D.01.01 + D.02.01); P1B ← D.01.02
node("C1", "combiner", "C.1", "tufo dalle due fonti");
node("E1", "extractor", "D.01.01", "tufo (rilievo)");
node("E2", "extractor", "D.02.01", "tufo (foto)");
node("E3", "extractor", "D.01.02", "pianta rettangolare");
edge("P1A", "has_data_provenance", "C1");
edge("C1", "combines", "E1");
edge("C1", "combines", "E2");
edge("E1", "extracted_from", "D.01");
edge("E2", "extracted_from", "D.02");
edge("P1B", "has_data_provenance", "E3");
edge("E3", "extracted_from", "D.01");

// US2 · its group already there, «material» in it; a direct «colour»
node("PDG2", "ParadataNodeGroup", "PD_US2");
edge("US2", "has_paradata_nodegroup", "PDG2");
node("P2A", "property", "material", "cocciopesto", { property_type: "material" });
node("P2B", "property", "colour", "rosso", { property_type: "colour" });
edge("US2", "has_property", "P2A");
edge("US2", "has_property", "P2B");
edge("P2A", "is_in_paradata_nodegroup", "PDG2");
// the shared extractor (with P1B of US1) and the shared combiner (with P1A)
edge("P2A", "has_data_provenance", "E3");
edge("P2B", "has_data_provenance", "C1");

// a property with two owners, neither declared an heir
node("P_MULTI", "property", "conservation", "cattivo", { property_type: "conservation" });
edge("US1", "has_property", "P_MULTI");
edge("US3", "has_property", "P_MULTI");
node("E4", "extractor", "D.02.02", "stato di conservazione");
edge("P_MULTI", "has_data_provenance", "E4");
edge("E4", "extracted_from", "D.02");

// the declared heir
edge("USV10", "has_property", "P1A", { inherited: true });

const doc = {
  header: { format: "em.json", version: "1.0" },
  graph: { graph_id: "proprieta", name: "Proprietà · compatta nel gruppo dei paradati",
           description: null, nodes, edges },
};
// the layout is em-core's; the graph is written as it is here, because the
// CLI drops edge attributes on its way through (measured: `inherited` lost)
writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
execFileSync(CLI, ["layout", OUT, "-o", OUT]);
doc.layout = JSON.parse(readFileSync(OUT, "utf8")).layout;
writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
console.log(`${OUT}: ${nodes.length} nodes, ${edges.length} edges, laid out`);
