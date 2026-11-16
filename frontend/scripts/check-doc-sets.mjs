// MICRO-E-PORTA-VERSIONI-COLORI p.4 · executable check of src/doc-sets.ts:
// Archive › Documenti follows document → model (and its container) → set, and
// a version under its master. With a graph at hand (EM_V10=…/TempluMare_v10.em.json)
// it measures how many sets stay «not censused» before and after.
//
//   node scripts/check-doc-sets.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const M = await load("media.ts");
const D = await load("doc-sets.ts");

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };
const node = (id, node_type, name, data = {}) => ({ id, node_type, name, data });
const edge = (source, edge_type, target) => ({ id: `${source}-${edge_type}-${target}`, source, target, edge_type });
// the page's rule (main.ts › isSetNode)
const isSetNode = (ix) => (id) => {
  const n = ix.byId.get(id);
  if (n?.node_type !== "resource") return false;
  const d = n.data ?? {};
  return d.packaging === "directory" || d.packaging === "file_set" || Array.isArray(d.members) || ix.out(id, "has_sub_resource").length > 0;
};
const fs_ = { packaging: "file_set" };

// ── 1 · D.01 publishes two models in a container with its tileset; one version
const g = {
  nodes: [
    node("D1", "document", "D.01"), node("D2", "document", "D.02"),
    node("M1", "representation_model", "SM_A"), node("M2", "representation_model", "SM_B"),
    node("G", "RepresentationModelNodeGroup", "Survey"),
    node("R1", "resource", "SM_A.gltf", fs_), node("R2", "resource", "SM_B.gltf", fs_),
    node("T", "resource", "tileset", { packaging: "directory" }),
    node("P", "dtc_process", "LOD generation"), node("V1", "resource", "SM_A lod0", fs_),
    node("P2", "dtc_process", "pack"), node("V2", "resource", "SM_A lod0 .3tz", fs_),
    node("L", "resource", "linked.pdf", fs_), node("X", "resource", "nobody", fs_),
    // a container whose members come from two documents: nobody's
    node("M3", "representation_model", "SM_C"), node("M4", "representation_model", "SM_D"),
    node("H", "RepresentationModelNodeGroup", "Mixed"), node("TH", "resource", "mixed tileset", { packaging: "directory" }),
    node("R3", "resource", "SM_C.gltf", fs_), node("R4", "resource", "SM_D.gltf", fs_),
  ],
  edges: [
    edge("D1", "has_representation_model", "M1"), edge("D1", "has_representation_model", "M2"),
    edge("M1", "is_in_representation_model_group", "G"), edge("M2", "is_in_representation_model_group", "G"),
    edge("M1", "has_linked_resource", "R1"), edge("M2", "has_linked_resource", "R2"), edge("G", "has_linked_resource", "T"),
    edge("P", "dtc_had_input", "R1"), edge("P", "dtc_had_output", "V1"),
    edge("P2", "dtc_had_input", "V1"), edge("P2", "dtc_had_output", "V2"),
    edge("D2", "has_linked_resource", "L"),
    edge("D1", "has_representation_model", "M3"), edge("D2", "has_representation_model", "M4"),
    edge("M3", "is_in_representation_model_group", "H"), edge("M4", "is_in_representation_model_group", "H"),
    edge("H", "has_linked_resource", "TH"), edge("M3", "has_linked_resource", "R3"), edge("M4", "has_linked_resource", "R4"),
  ],
};
const ix = M.mediaIndex(g);
const rows = D.documentSets(ix, "D1", isSetNode(ix));
eq(rows.map((r) => [r.set, r.via]), [["R1", "M1"], ["R2", "M2"], ["R3", "M3"], ["T", "G"]], "D.01: its models' sets, then its container's");
eq(rows[0].versions, ["V1", "V2"], "a version (and a version of it) under its master");
eq(D.documentSets(ix, "D2", isSetNode(ix)).map((r) => r.set), ["L", "R4"], "D.02: linked first, then its model's");
const cen = D.censusedSets(ix, ["D1", "D2"], isSetNode(ix));
ok(!cen.has("X") && !cen.has("TH"), "a set nobody reaches, and a container of two documents, stay out");
ok(["R1", "R2", "R3", "R4", "T", "V1", "V2", "L"].every((s) => cen.has(s)), "everything reached is censused");

// ── 2 · a document publishing the container itself brings its members
const g2 = { nodes: [node("D", "document", "D.09"), node("G", "RepresentationModelNodeGroup", "Rec"),
  node("M", "representation_model", "Col"), node("R", "resource", "Col.gltf", fs_)],
  edges: [edge("D", "has_representation_model", "G"), edge("M", "is_in_representation_model_group", "G"), edge("M", "has_linked_resource", "R")] };
const ix2 = M.mediaIndex(g2);
eq(D.documentSets(ix2, "D", isSetNode(ix2)).map((r) => [r.set, r.via]), [["R", "M"]], "the container published → its members' sets");

// ── 3 · the measure on a real graph
const V10 = process.env.EM_V10;
if (V10 && fs.existsSync(V10)) {
  const doc = JSON.parse(fs.readFileSync(V10, "utf8"));
  const gr = doc.graphs[doc.active_graph_id] ?? Object.values(doc.graphs)[0];
  const x = M.mediaIndex(gr);
  const isS = isSetNode(x);
  const sets = [...x.byId.values()].filter((n) => isS(n.id));
  const docs = [...x.byId.values()].filter((n) => n.node_type === "document").map((n) => n.id);
  const looseBy = (cen) => sets.filter((n) => !cen.has(n.id) && !x.inn(n.id, "has_sub_resource").length
    && !x.inn(n.id, "has_linked_resource").some((s) => x.byId.get(s)?.node_type === "document"));
  const before = new Set(docs.flatMap((d) => x.out(d, "has_linked_resource").filter(isS)));
  const after = D.censusedSets(x, docs, isS);
  const lb = looseBy(before), la = looseBy(after);
  const per = Object.fromEntries(docs.map((d) => [x.byId.get(d).name, D.documentSets(x, d, isS)])
    .filter(([, r]) => r.length).map(([k, r]) => [k, { sets: r.length, versions: r.reduce((s, y) => s + y.versions.length, 0) }]));
  console.log(JSON.stringify({ sets: sets.length, looseBefore: lb.length, looseAfter: la.length,
    stillLoose: la.map((n) => n.name), D01: per["D.01"], D09: per["D.09"] }, null, 1));
  ok(la.length < lb.length, "fewer sets not censused on the real graph");
}
console.log(`check-doc-sets: ${checks} checks passed`);
