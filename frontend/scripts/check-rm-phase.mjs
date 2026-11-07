// MICRO-SOTTOFASI-E-TILESET-TEMPLU (7 Nov 2026) · a representation model in a
// phase (sub-epoch), in the store. Templu Mare v7: 97 models bound the canonical
// way (`EpochNode --has_representation_model--> RM`), the 2013 tileset the other
// (`RM --has_first_epoch--> 2013`). The store reads both (`firstEpochOf`), moves
// a model by the canonical edge (`setFirstEpoch`: the old form rewritten), and a
// deleted phase takes its models to the epoch it hands its units to.
//
//   node scripts/check-rm-phase.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({ stdin: { contents: `export { DocumentStore } from "./model"; export { buildSpace } from "./space";
  export { isStratigraphicType } from "./rules";`, resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false, logLevel: "silent" });
const { DocumentStore, buildSpace, isStratigraphicType } = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

const N = (id, node_type, name = id) => ({ id, node_type, name, data: {} });
const E = (source, target, edge_type) => ({ id: `${source}_${edge_type}_${target}`, source, target, edge_type });
const doc = () => ({ header: {}, graph: { graph_id: "t", name: "t",
  nodes: [N("XX", "EpochNode", "XX sec"), N("E13", "EpochNode", "2013"), N("E15", "EpochNode", "2015"), N("II", "EpochNode", "II A.D."),
    N("T13", "representation_model", "TempluMare_2013_egm2008"), N("SM", "representation_model", "SM_OB_PODIO_LOD1"),
    N("REC", "representation_model", "Ricostruzione"), N("U1", "US", "SU001")],
  edges: [E("XX", "E13", "has_sub_epoch"), E("XX", "E15", "has_sub_epoch"),
    E("T13", "E13", "has_first_epoch"), E("XX", "SM", "has_representation_model"), E("II", "REC", "has_representation_model"),
    E("U1", "XX", "has_first_epoch")] } });
const rmEdges = (st, id) => st.doc.graph.edges.filter((e) => e.source === id || e.target === id)
  .filter((e) => e.edge_type === "has_first_epoch" || e.edge_type === "has_representation_model").map((e) => `${e.source}>${e.edge_type}>${e.target}`).sort();

{
  const st = new DocumentStore(doc());
  eq(st.firstEpochOf("T13"), "E13", "the old form: the RM's own has_first_epoch");
  eq(st.firstEpochOf("SM"), "XX", "the canonical form: the epoch that points at the RM");
  eq(st.firstEpochOf("U1"), "XX", "a unit: its has_first_epoch, as before");
  eq(st.firstEpochOf("E13"), null, "an epoch has none");

  st.setFirstEpoch(["SM"], "E15");
  eq(rmEdges(st, "SM"), ["E15>has_representation_model>SM"], "a canonical RM moved to the phase 2015: one edge, from the phase");
  st.setFirstEpoch(["T13"], "E13");
  eq(rmEdges(st, "T13"), ["E13>has_representation_model>T13"], "the old form rewritten in place (✓ in the Inspector): epoch → RM, no has_first_epoch");
  st.setFirstEpoch(["T13"], "E13");
  eq(rmEdges(st, "T13"), ["E13>has_representation_model>T13"], "…again: no double edge");
  st.setFirstEpoch(["REC"], "XX");
  eq(rmEdges(st, "REC"), ["XX>has_representation_model>REC"], "an RM moved across epochs leaves the old one");
  st.setFirstEpoch(["U1"], "E13");
  eq(rmEdges(st, "U1"), ["U1>has_first_epoch>E13"], "a unit is moved as before (has_first_epoch)");
  st.undo();
  eq(rmEdges(st, "U1"), ["U1>has_first_epoch>XX"], "one step of undo");

  const sp = buildSpace(st.doc, { isUnit: isStratigraphicType });
  eq(sp.summary("E13").rms.map((r) => r.id), ["T13"], "the Space: 2013 shows its model");
  eq(sp.summary("E15").rms.map((r) => r.id), ["SM"], "…2015 its own");
  eq(sp.summary("XX").rms.map((r) => r.id).sort(), ["REC", "SM", "T13"], "…and «all the sub-epochs» every one");

  eq(st.phaseOrphans("E15").units, ["SM"], "a phase's models count among what its deletion re-homes");
  st.deletePhase("E15", "XX");
  eq(rmEdges(st, "SM"), ["XX>has_representation_model>SM"], "the phase deleted: its model goes to the epoch, not left on a node that is gone");
}
// both forms at once (a hand-edited file): read by the own edge, rewritten into one
{
  const d = doc();
  d.graph.edges.push(E("E15", "T13", "has_representation_model"));
  const st = new DocumentStore(d);
  eq(st.firstEpochOf("T13"), "E13", "both forms: the RM's own has_first_epoch is the first epoch");
  st.setFirstEpoch(["T13"], "E15");
  eq(rmEdges(st, "T13"), ["E15>has_representation_model>T13"], "…a move leaves one canonical edge");
}
// the Inspector: the phase marked in words, not a dashed (disabled) button
const insp = readFileSync(`${SRC}inspector.ts`, "utf8");
ok(/insp-btn-current/.test(insp) && !/if \(id === cur\) \{\s*b\.disabled = true/.test(insp), "the current phase is pressed, not disabled (dashed)");
ok(/t\("insp\.phaseIn"/.test(insp) && /t\("insp\.phaseOldForm"\)/.test(insp), "…and said in words, the old form too");
ok(/\.insp-btn\.insp-btn-current \{/.test(readFileSync(`${SRC}style.css`, "utf8")), "…drawn solid");
console.log(`check-rm-phase: ${checks} checks passed`);
