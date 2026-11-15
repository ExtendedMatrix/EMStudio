// MICRO-A-PROPRIO-EREDITATO (14 Nov 2026) · own or inherited, and from WHICH
// node — the page's reading (`src/provenance.ts`) against s3Dgraphy's
// (`resolvers.provenance`, `unit_life`, `attribution`):
//
//   node scripts/check-provenance.mjs [path/to/TempluMare_v10.em.json]
//
// On a small graph always (the levels: node, swimlane, master, members,
// publisher, container, life; the life of a unit; the redundant edges). With the
// v10 (default /tmp/pe/TempluMare_v10.em.json, or EM_V10) EVERY node, five rules
// (value, level, origin node), the life of every unit, the epochs every node is
// attributed to, the redundant / contradicting edges and the dating warnings,
// compared with s3Dgraphy run from ../s3Dgraphy/src (skipped when either is
// missing). With --sample it prints one node per type (the Inspector's check).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}provenance.ts`], bundle: true, format: "esm", write: false,
  loader: { ".json": "json" }, logLevel: "silent" });
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); checks++; };
const N = (id, node_type, name = id, data = {}) => ({ id, node_type, name, data });
const E = (source, target, edge_type) => ({ id: `${source}__${edge_type}__${target}`, source, target, edge_type });

// ── a small graph ───────────────────────────────────────────────────────────
{
  const doc = { graph: { nodes: [
    N("II", "EpochNode", "II A.D.", { start_time: 100, end_time: 199 }), N("PA", "EpochNode", "Post", { start_time: 200, end_time: 1800 }),
    N("XX", "EpochNode", "XX sec", { start_time: 1801, end_time: 2026 }), N("E13", "EpochNode", "2013", { start_time: 2013, end_time: 2014 }),
    N("SU1", "US", "SU001"), N("PD1", "ParadataNodeGroup", "SU001_PD"), N("P1", "property", "Material"),
    N("C1", "combiner", "C.01"), N("X1", "extractor", "D.01.01"), N("D1", "document", "D.01"),
    N("A1", "author", "A.01"), N("ACT", "ActivityNodeGroup", "VAct"), N("V1", "USVn", "USV1"),
    N("M1", "representation_model", "m1"), N("M2", "representation_model", "m2"), N("G", "RepresentationModelNodeGroup", "S13"),
    N("BR", "BR", "continuity_node")],
  edges: [E("XX", "E13", "has_sub_epoch"), E("SU1", "II", "has_first_epoch"), E("SU1", "PA", "survive_in_epoch"),
    E("SU1", "PD1", "has_paradata_nodegroup"), E("PD1", "II", "has_first_epoch"), E("SU1", "P1", "has_property"),
    E("P1", "C1", "has_data_provenance"), E("C1", "X1", "combines"), E("D1", "E13", "has_first_epoch"),
    E("II", "A1", "has_author"), E("V1", "PA", "has_first_epoch"), E("SU1", "ACT", "is_in_activity"), E("V1", "ACT", "is_in_activity"),
    E("D1", "M1", "has_representation_model"), E("M2", "G", "is_in_representation_model_group"), E("D1", "G", "has_representation_model")] } };
  doc.graph.nodes.find((n) => n.id === "A1").description = "Giulia Rossi";
  const ix = M.provIndex(doc);
  const R = (id, r) => { const p = M.resolveProvenance(ix, id, r); return [p.value, p.level, p.origin]; };
  eq(R("SU1", "absolute_time_start"), [100, "swimlane", "II"], "a unit from its epoch");
  eq(M.resolveProvenance(ix, "X1", "absolute_time_start").chain, ["X1", "C1", "P1", "SU1", "II"], "an extractor through its chain to its unit");
  eq(R("X1", "author"), ["Giulia Rossi", "master", "II"], "the author by the master");
  eq(R("ACT", "absolute_time_start"), [100, "members", "II"], "an activity from its earliest member");
  eq(R("M1", "absolute_time_start"), [2013, "publisher", "E13"], "a model from its Document");
  // MICRO-D-GIS-DOCUMENTI p.6 · the Document's date never passes to the container
  eq(R("G", "absolute_time_start")[1] === "publisher", false, "a container takes no date from its Document");
  eq(R("M2", "absolute_time_start"), [null, null, null], "…nor its member through it");
  doc.graph.edges.push(E("E13", "G", "has_representation_model"));
  {
    const ixG = M.provIndex(doc);
    const p = M.resolveProvenance(ixG, "M2", "absolute_time_start");
    eq([p.value, p.level, p.origin], [2013, "container", "E13"], "a member from its container (an epoch reaching it)");
  }
  eq([M.unitLife(ix, "SU1").status, M.unitLife(ix, "SU1").epochs], ["still_existing", ["II", "PA", "XX", "E13"]], "still existing");
  eq(R("SU1", "absolute_time_end"), [2026, "life", "XX"], "the end from the life");
  doc.graph.edges.push(E("BR", "SU1", "is_after"), E("BR", "E13", "has_first_epoch"));
  const ix2 = M.provIndex(doc);
  eq(M.unitLife(ix2, "SU1").status, "ended_undated", "a continuity closes it");
  const rep = M.redundancyReport(ix2);
  eq([rep.servile.map((r) => r.id), rep.survive.map((r) => r.id)], [["PD1"], ["SU1"]], "the redundant edges");
  // MICRO-C-CORREZIONI-ED · the limit of an epoch is not an end
  const e2 = M.resolveProvenance(ix2, "SU1", "absolute_time_end");
  eq([e2.value, e2.bound, e2.limit_of], [2014, "epoch_limit", "E13"], "an undated continuity: the limit of its epoch");
  eq([M.unitLife(ix2, "V1").end_kind, M.unitLife(ix2, "V1").end_limit_of], ["epoch_limit", "PA"], "a virtual unit: the limit of its epoch");
}

// ── MICRO-C-CORREZIONI-ED · real = the datamodel's family; when a model was made ──
{
  const doc = { graph: { nodes: [
    N("II", "EpochNode", "II A.D.", { start_time: 100, end_time: 199 }), N("XX", "EpochNode", "XX sec", { start_time: 1801, end_time: 2026 }),
    N("E13", "EpochNode", "2013", { start_time: 2013, end_time: 2014 }),
    N("T1", "SF", "T01"), N("V1", "USVn", "USV1"), N("D1", "document", "D.01"),
    N("M1", "representation_model", "m1"), N("M2", "representation_model", "m2"), N("M3", "representation_model", "m3"),
    N("R1", "resource", "mesh1"), N("S1", "resource", "photos1"), N("P1", "dtc_process", "photogrammetry", { dtc_kind: "transformation" }),
    N("A1", "dtc_acquisition", "campaign 2015", { dtc_kind: "photo", date: "2015-06-03" }),
    N("R2", "resource", "mesh2"), N("A2", "dtc_acquisition", "campaign 2013", { dtc_kind: "laserscanner", date: "2013" }),
    N("R3", "resource", "mesh3"), N("A3", "dtc_acquisition", "download", { dtc_kind: "download", date: "2020" })],
  edges: [E("T1", "II", "has_first_epoch"), E("V1", "II", "has_first_epoch"), E("XX", "E13", "has_sub_epoch"),
    E("D1", "E13", "has_first_epoch"),
    E("XX", "M1", "has_representation_model"), E("II", "M2", "has_representation_model"), E("XX", "M3", "has_representation_model"),
    E("D1", "M1", "has_representation_model"), E("D1", "M2", "has_representation_model"), E("D1", "M3", "has_representation_model"),
    E("M1", "R1", "has_linked_resource"), E("P1", "R1", "dtc_had_output"), E("P1", "S1", "dtc_had_input"), E("A1", "S1", "dtc_had_output"),
    E("M2", "R2", "has_linked_resource"), E("A2", "R2", "dtc_had_output"),
    E("M3", "R3", "has_linked_resource"), E("A3", "R3", "dtc_had_output")] } };
  const ix = M.provIndex(doc);
  eq([M.unitLife(ix, "T1").real, M.unitLife(ix, "T1").status], [true, "still_existing"], "an SF is real (the datamodel's family)");
  eq([M.unitLife(ix, "V1").real, M.unitLife(ix, "V1").status], [false, "birth_only"], "a USVn is virtual");
  eq(M.acquisitionDates(ix, "M1").start, 2015, "the date of a capture up the DTC chain");
  eq(M.acquisitionDates(ix, "M3").start, null, "a retrieval is not when a model was made");
  const w = M.datingWarnings(ix).filter((x) => x.rule === "model_vs_document");
  eq([w.map((x) => x.id), w[0]?.fix ?? null], [["M1"], null], "only the model made outside its document's dates, no cure");
}

// ── the v10 against s3Dgraphy ───────────────────────────────────────────────
const V10 = process.argv.filter((a) => !a.startsWith("--"))[2] ?? process.env.EM_V10 ?? "/tmp/pe/TempluMare_v10.em.json";
const S3D = new URL("../../../s3Dgraphy/src", import.meta.url).pathname;
const PY = existsSync(new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname)
  ? new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname : "python3";
if (!existsSync(V10) || !existsSync(`${S3D}/s3dgraphy/resolvers/provenance.py`)) {
  console.log(`provenance: ${checks} checks passed (v10 or s3Dgraphy's provenance not here: the comparison skipped)`);
  process.exit(0);
}
const em = JSON.parse(readFileSync(V10, "utf8"));
const g = em.graphs?.[em.active_graph_id] ?? em.graph;
const vdoc = { graph: g };
const py = execFileSync(PY, ["-c", `
import json,sys
from s3dgraphy import api
from s3dgraphy.resolvers.provenance import provenance_table
from s3dgraphy.unit_life import life_table
from s3dgraphy.attribution import attribution_table, redundancy_report, dating_warnings
g,_=api.load_emjson_file(sys.argv[1])
t=provenance_table(g)
out={"prov":{k:{r:[v["value"],v["level"],v["origin"],v.get("bound"),v.get("limit_of")] for r,v in rs.items()} for k,rs in t.items()},
     "life":{k:[v["status"],v["epochs"],v["redundant"],v["contradicting"],v["real"],v["end_kind"],v["end_limit_of"]] for k,v in life_table(g).items()},
     "attr":{k:[sorted(v["epochs"]),v["level"],v["origin"]] for k,v in attribution_table(g).items()},
     "red":{k:sorted(r["id"] for r in v) for k,v in redundancy_report(g).items()},
     "warn":sorted([w["rule"],w["id"],w.get("other")] for w in dating_warnings(g))}
print(json.dumps(out))`, V10], { env: { ...process.env, PYTHONPATH: S3D }, maxBuffer: 256 << 20 }).toString();
const want = JSON.parse(py);
const ix = M.provIndex(vdoc);
const byId = new Map(g.nodes.map((n) => [n.id, n]));
const num = (v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
let nodes = 0;
const bad = [];
for (const [id, rules] of Object.entries(want.prov)) {
  if (!byId.has(id)) continue;
  nodes++;
  for (const [r, w] of Object.entries(rules)) {
    const p = M.resolveProvenance(ix, id, r);
    const got = [num(p.value), p.level, p.origin, p.bound ?? null, p.limit_of ?? null];
    const exp = [num(w[0]), w[1], w[2], w[3] ?? null, w[4] ?? null];
    if (JSON.stringify(got) !== JSON.stringify(exp)) bad.push(`${byId.get(id).node_type} ${byId.get(id).name} ${r}: page ${JSON.stringify(got)} s3Dgraphy ${JSON.stringify(exp)}`);
    else checks++;
  }
}
for (const [id, w] of Object.entries(want.life)) {
  const l = M.unitLife(ix, id);
  const got = [l.status, l.epochs, l.redundant, l.contradicting, l.real, l.end_kind, l.end_limit_of];
  if (JSON.stringify(got) !== JSON.stringify(w)) bad.push(`life ${byId.get(id)?.name}: page ${JSON.stringify(got)} s3Dgraphy ${JSON.stringify(w)}`);
  else checks++;
}
for (const [id, w] of Object.entries(want.attr)) {
  const a = M.epochAttribution(ix, id);
  const got = [[...a.epochs].sort(), a.level, a.origin];
  if (JSON.stringify(got) !== JSON.stringify(w)) bad.push(`attribution ${byId.get(id)?.node_type} ${byId.get(id)?.name}: page ${JSON.stringify(got)} s3Dgraphy ${JSON.stringify(w)}`);
  else checks++;
}
const red = M.redundancyReport(ix);
for (const k of Object.keys(want.red)) eq(red[k].map((r) => r.id).sort(), want.red[k], `v10 redundancy ${k} = s3Dgraphy`);
eq(M.datingWarnings(ix).map((w) => [w.rule, w.id, w.other]).sort(), want.warn, "v10 dating warnings = s3Dgraphy");
if (bad.length) {
  console.error(bad.slice(0, 30).join("\n"));
  console.error(`provenance: ${bad.length} differences`);
  process.exit(1);
}
if (process.argv.includes("--sample")) {
  const seen = new Set();
  for (const n of g.nodes) if (!seen.has(n.node_type) && want.prov[n.id]) { seen.add(n.node_type); console.log(JSON.stringify({ id: n.id, type: n.node_type, name: n.name, prov: want.prov[n.id] })); }
}
console.log(`provenance: ${checks} checks passed (v10: ${nodes} nodes × 5 rules, ${Object.keys(want.life).length} lives, ${Object.keys(want.attr).length} attributions = s3Dgraphy)`);
