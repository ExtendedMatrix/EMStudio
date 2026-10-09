// FONTE · the fixture of MICRO-EMSTUDIO-PROPRIETA-COME-FONTE — the case of the
// trusses of s3Dgraphy's `tests/test_property_as_source.py`, BEFORE the reading
// (the reading is what the test makes in EMStudio):
//
//   · US 12 with «essenza: quercia», justified by D.1.01 on the document D.1,
//     both in PD_US 12 (the value in `description` and `data.value`, as EMStudio writes it);
//   · USV 40 (the trusses) with its own «essenza», no reading yet, in PD_USV 40;
//   · US 13 with «essenza: castagno» in no group (a source for a second reading);
//   · «conservazione», owned by US 12 AND US 13, neither declared an heir — the
//     warning of two undeclared owners, cured by «Declare the inheritance»;
//   · «finitura», owned by US 13 AND USV 40, neither declared an heir — cured by
//     «Duplicate for each owner», its extractor reading D.1;
//   · D.1 is the CANONICAL document, born in the Medioevo (`has_first_epoch`),
//     read by a member of PD_US 12 and by one of PD_USV 40 («datazione»,
//     D.1.03): the view draws it as an instance in both groups.
//
// No stored instance anywhere (the instance is a view, s3Dgraphy 1.6.37): the
// reading of US 12's «essenza» by USV 40 is `extractor —extracted_from→ P12`,
// made by «Prendi da un'altra proprietà…» in the test.
//
//   node scripts/make-capriate-fixture.mjs   → testdata/capriate.em.json
//   (then `emstudio layout` writes its layout in place)
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = new URL("../testdata/capriate.em.json", import.meta.url).pathname;
const CLI = new URL("../../target/release/emstudio", import.meta.url).pathname;

const nodes = [];
const edges = [];
// a property's value in `description` AND `data.value`, as EMStudio writes it
// (`setPropertyValue`) and where s3Dgraphy reads it (`PropertyNode.value`)
const node = (id, node_type, name, description = "", data = {}) =>
  nodes.push({ id, node_type, name, description,
               data: node_type === "property" && description ? { ...data, value: description } : data });
const edge = (source, edge_type, target, attributes) =>
  edges.push({ id: `${source}__${edge_type}__${target}`, edge_type, source, target,
               ...(attributes ? { attributes } : {}) });

node("EP_MED", "EpochNode", "Medioevo", "", { start_time: 1100, end_time: 1400 });
node("US_12", "US", "US 12", "Frammenti lignei delle capriate");
node("US_13", "US", "US 13", "Trave crollata");
node("USV_40", "USVs", "USV 40", "Le capriate del tetto");
for (const u of ["US_12", "US_13", "USV_40"]) edge(u, "has_first_epoch", "EP_MED");
edge("USV_40", "is_after", "US_12");
edge("US_13", "is_after", "US_12");

node("D1", "document", "D.1", "Analisi xilologica dei frammenti", { is_canonical: true });
edge("D1", "has_first_epoch", "EP_MED");

// US 12 · essenza quercia, from D.1, in its group
node("PD_US_12", "ParadataNodeGroup", "PD_US 12");
edge("US_12", "has_paradata_nodegroup", "PD_US_12");
node("P12", "property", "essenza", "quercia", { property_type: "essenza" });
node("E12", "extractor", "D.1.01", "i frammenti sono di quercia");
edge("US_12", "has_property", "P12");
edge("P12", "has_data_provenance", "E12");
edge("E12", "extracted_from", "D1");
for (const n of ["P12", "E12"]) edge(n, "is_in_paradata_nodegroup", "PD_US_12");

// USV 40 · its own essenza, not read yet
node("PD_USV_40", "ParadataNodeGroup", "PD_USV 40");
edge("USV_40", "has_paradata_nodegroup", "PD_USV_40");
node("P40", "property", "essenza", "", { property_type: "essenza" });
edge("USV_40", "has_property", "P40");
edge("P40", "is_in_paradata_nodegroup", "PD_USV_40");
// …and its «datazione», read from D.1 too, in its group
node("P40D", "property", "datazione", "XIII secolo", { property_type: "datazione" });
node("E40D", "extractor", "D.1.03", "la stessa analisi data le travi");
edge("USV_40", "has_property", "P40D");
edge("P40D", "has_data_provenance", "E40D");
edge("E40D", "extracted_from", "D1");
for (const n of ["P40D", "E40D"]) edge(n, "is_in_paradata_nodegroup", "PD_USV_40");

// US 13 · essenza castagno, direct (no group)
node("P13", "property", "essenza", "castagno", { property_type: "essenza" });
edge("US_13", "has_property", "P13");

// two owners nobody declared: conservazione (US 12, US 13)
node("PC", "property", "conservazione", "buona", { property_type: "conservazione" });
edge("US_12", "has_property", "PC");
edge("US_13", "has_property", "PC");

// two owners nobody declared: finitura (US 13, USV 40), with its reading
node("PF", "property", "finitura", "piallata", { property_type: "finitura" });
node("EF", "extractor", "D.1.02", "segni di pialla");
edge("US_13", "has_property", "PF");
edge("USV_40", "has_property", "PF");
edge("PF", "has_data_provenance", "EF");
edge("EF", "extracted_from", "D1");

const doc = {
  header: { format: "em.json", version: "1.0" },
  graph: { graph_id: "capriate", name: "Capriate · la proprietà come fonte",
           description: null, nodes, edges },
};
writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
execFileSync(CLI, ["layout", OUT, "-o", OUT]);
doc.layout = JSON.parse(readFileSync(OUT, "utf8")).layout;
writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
console.log(`${OUT}: ${nodes.length} nodes, ${edges.length} edges, laid out`);
