// MICRO-K-DEFINIZIONE-E-PASSI (17 Nov 2026) · the open steps of EMStudio:
//
//   node scripts/check-passi.mjs            (V10=<TempluMare_v10.em.json> for the measures)
//
//  1 · `data.acquired` / `data.valid_until` (node datamodel 1.6.48): typed by a
//      person (a year, an ISO date, an interval), read with its precedence
//      (own → DTC → document → container) and by the dating warning — the same
//      answers as s3Dgraphy's `attribution.acquired_of` on the v10;
//  2 · the PropertyNode `definition`: two texts on one node (the value, its
//      interpretation), the value-in-two-places rule bent as in s3Dgraphy;
//  3 · «never the master as a fallback» in the Space: a model with versions and
//      none the scene can load is UNCOVERED, its master not loaded;
//  4 · Tropy: a licence mapped on a term of the licence vocabulary, or kept as
//      declared text; its selections as extractors;
//  5 · a person's name composed without the surname twice.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64") + `#${entry}`);
};
const D = await load("door.ts");
const P = await load("provenance.ts");
const PV = await load("property-value.ts");
const SP = await load("space.ts");
const R = await load("rules.ts");
const T = await load("tropy.ts");
const PN = await load("person-name.ts");
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };
const N = (id, node_type, name = id, data = {}, extra = {}) => ({ id, node_type, name, data, ...extra });
const E = (source, target, edge_type) => ({ id: `${source}__${edge_type}__${target}`, source, target, edge_type });

// 1 · acquired
eq(D.parseAcquired("2015"), 2015, "a year");
eq(D.parseAcquired("2015-06-12"), "2015-06-12", "an ISO date");
eq(D.parseAcquired("2013–2015"), { start: 2013, end: 2015 }, "a campaign (en dash)");
eq(D.parseAcquired("2013-2015"), { start: 2013, end: 2015 }, "a campaign (hyphen)");
eq(D.parseAcquired("2013-06-01 / 2013-07-20"), { start: "2013-06-01", end: "2013-07-20" }, "a campaign of two dates");
eq(D.parseAcquired(""), null, "cleared");
eq(D.parseAcquired("primavera"), undefined, "not a date: refused");
eq(D.acquiredText({ start: 2013, end: 2015 }), "2013–2015", "read back");
ok(D.ACQUIRED_TYPES.has("representation_model") && D.ACQUIRED_TYPES.has("document") && D.ACQUIRED_TYPES.has("RepresentationModelNodeGroup"), "RM, document, container carry it");
{
  const doc = { graph: { nodes: [
    N("E13", "EpochNode", "2013", { start_time: 2013, end_time: 2014 }), N("D1", "document", "D.01"),
    N("M1", "representation_model", "m1", { acquired: 2015 }), N("M2", "representation_model", "m2", { acquired: "2013-07-01" }),
    N("M3", "representation_model", "m3"), N("G", "RepresentationModelNodeGroup", "S15", { acquired: { start: 2015, end: 2016 } })],
  edges: [E("D1", "E13", "has_first_epoch"), E("D1", "M1", "has_representation_model"), E("D1", "M2", "has_representation_model"),
    E("D1", "M3", "has_representation_model"), E("M3", "G", "is_in_representation_model_group")] } };
  const ix = P.provIndex(doc);
  eq([P.acquiredOf(ix, "M1").from, P.acquiredOf(ix, "M1").start], ["own", 2015], "own");
  eq([P.acquiredOf(ix, "M3", false).from, P.acquiredOf(ix, "M3", false).end, P.acquiredOf(ix, "M3", false).by], ["container", 2016, "G"], "the container's, without the publisher");
  const w = P.datingWarnings(ix).filter((x) => x.rule === "model_vs_document");
  eq(w.map((x) => x.id).sort(), ["M1", "M3"], "the warning reads acquired: M1 (2015) and M3 (its container 2015–16) against D.01 2013–14; M2 (2013) fits");
  eq(w.find((x) => x.id === "M1").acquired_from, "own", "…and says from where");
}

// 2 · the definition: two texts on one node
{
  const def = (value, description) => ({ id: "p", node_type: "property", name: "definition", description, data: { property_type: "definition", ...(value ? { value } : {}) } });
  const a = def("Muro", "Muro di terrazzamento, perché…");
  eq(PV.alignPropertyAtBirth(a), false, "two texts at birth: both kept");
  const b = def(undefined, "Muro");
  PV.alignPropertyAtBirth(b);
  eq(b.data.value, "Muro", "the EM writer (the value in the description): copied");
  eq(PV.alignPropertyPatch(def("A", "A"), { data: { property_type: "definition", value: "B" } }).description, "B", "one text: the description follows the value");
  eq(PV.alignPropertyPatch(def("A", "interp"), { data: { property_type: "definition", value: "B" } }).description, undefined, "two texts: the interpretation stays");
  eq(PV.alignPropertyPatch(def("A", "A"), { description: "interp" }).data, undefined, "writing the interpretation never moves the value");
  const other = { id: "q", node_type: "property", name: "material", description: "x", data: { property_type: "material", value: "marmo" } };
  PV.alignPropertyAtBirth(other);
  eq(other.description, "marmo", "any other property: the rule of 28 Oct");
  eq(PV.divergentProperties({ graph: { nodes: [a], edges: [] } }).length, 0, "a definition with its interpretation is not «divergent»");
}

// 3 · never the master as a fallback
{
  const doc = { graph: { nodes: [
    N("EP", "EpochNode", "Roman", { start_time: 0, end_time: 300 }),
    N("RM1", "representation_model", "cella"), N("R0", "resource", "cella master", { url: "cella.glb", url_type: "3d_model" }),
    N("P1", "dtc_process", "lod", { dtc_kind: "lod_generation" }), N("R1", "resource", "cella lod0", { url: "cella_lod0.fbx", url_type: "3d_model" }),
    N("RM2", "representation_model", "podio"), N("S0", "resource", "podio master", { url: "podio.glb", url_type: "3d_model" }),
    N("P2", "dtc_process", "lod", { dtc_kind: "lod_generation" }), N("S1", "resource", "podio lod0", { url: "podio_lod0.glb", url_type: "3d_model", size_bytes: 1000 }),
    N("RM3", "representation_model", "muro"), N("T0", "resource", "muro", { url: "muro.glb", url_type: "3d_model" })],
  edges: [E("EP", "RM1", "has_representation_model"), E("RM1", "R0", "has_linked_resource"), E("P1", "R0", "dtc_had_input"), E("P1", "R1", "dtc_had_output"),
    E("EP", "RM2", "has_representation_model"), E("RM2", "S0", "has_linked_resource"), E("P2", "S0", "dtc_had_input"), E("P2", "S1", "dtc_had_output"),
    E("EP", "RM3", "has_representation_model"), E("RM3", "T0", "has_linked_resource")] } };
  const sp = SP.buildSpace(doc, { isUnit: R.isStratigraphicType });
  const rm = (id) => sp.rms.find((r) => r.id === id);
  eq([rm("RM1").uncovered, rm("RM1").resource], [true, null], "cella: a version the scene cannot load (fbx), no web use — uncovered, the master not loaded");
  ok(/uncovered/.test(rm("RM1").choice.note), "…said in the choice");
  eq([rm("RM2").uncovered ?? false, rm("RM2").resource?.id], [false, "S1"], "podio: no version for the scene's uses — its lightest VERSION, never the master");
  eq([rm("RM3").uncovered ?? false, rm("RM3").resource?.id], [false, "T0"], "muro: no versions at all — its own file, as before (nothing it falls back from)");
}

// 4 · Tropy
eq(T.licenseTermOf("https://creativecommons.org/licenses/by-sa/4.0/"), "CC-BY-SA-4.0", "a CC URL");
eq(T.licenseTermOf("CC BY-NC 4.0"), "CC-BY-NC-4.0", "CC in words");
eq(T.licenseTermOf("cc-by-4.0"), "CC-BY-4.0", "a code");
eq(T.licenseTermOf("https://creativecommons.org/publicdomain/zero/1.0/"), "CC0-1.0", "CC0");
eq(T.licenseTermOf("Tutti i diritti riservati, Museo di Deva"), null, "not recognised: kept as declared text");
eq(T.licenseTermOf("https://creativecommons.org/licenses/by-nd/4.0/"), null, "BY-ND is not in the vocabulary: text");
{
  const items = T.parseTropy({ "@context": "https://tropy.org/v1/contexts/item.jsonld", "@graph": [{
    "@id": "i1", title: "Capitello", date: "2013-07-02", rights: "CC BY 4.0",
    photo: [{ "@id": "p1", path: "/x/cap.jpg", width: 1000, height: 500, selection: [{ "@id": "s1", x: 100, y: 50, width: 200, height: 100, note: { html: "<p>voluta</p>" } }] }] }] });
  eq([items[0].photos[0].selections.length, T.licenseTermOf(items[0].license)], [1, "CC-BY-4.0"], "a Tropy item: one selection, its licence a term");
  const Mo = await load("model.ts");
  const st = new Mo.DocumentStore({ graph: { graph_id: "g", nodes: [N("D1", "document", "D.01")], edges: [] } });
  const xs = st.batch(() => T.addSelectionExtractors(st, "D1", items[0].photos[0].selections, "p1"));
  eq(xs.length, 1, "the selection → one extractor");
  const x = st.node(xs[0]);
  eq([x.node_type, x.data.tropy_selection, x.data.tropy_photo], ["extractor", "s1", "p1"], "…with its selection and photo");
  ok(st.doc.graph.edges.some((e) => e.source === xs[0] && e.edge_type === "extracted_from"), "…extracted from the document (its region)");
}

// 5 · a name
eq(PN.composeName("Emanuel Demetrescu", "Demetrescu"), "Emanuel Demetrescu", "the surname not twice");
eq(PN.composeName("Emanuel", "Demetrescu"), "Emanuel Demetrescu", "name + surname");
eq(PN.composeName("Dev User", "nosurname"), "Dev User", "a sentinel is no surname");
eq(PN.composeName("Ana", "Anastasiu"), "Ana Anastasiu", "a surname that only begins like the name is still added");

// the v10: the measures, and the parity with s3Dgraphy
const V10 = process.env.V10 ?? "/tmp/mk/TempluMare_v10.em.json";
const S3D = path.resolve(new URL("../../../s3Dgraphy", import.meta.url).pathname);
if (fs.existsSync(V10)) {
  const cont = JSON.parse(fs.readFileSync(V10, "utf8"));
  const gid = cont.active_graph_id ?? Object.keys(cont.graphs)[0];
  const doc = { header: cont.header, graph: cont.graphs[gid] };
  const ix = P.provIndex(doc);
  const models = doc.graph.nodes.filter((n) => ["representation_model", "representation_model_doc", "representation_model_sf"].includes(n.node_type));
  const ts = Object.fromEntries(models.map((m) => [m.id, P.acquiredOf(ix, m.id).from]));
  const tally = (o) => Object.values(o).reduce((a, v) => ({ ...a, [v ?? "none"]: (a[v ?? "none"] ?? 0) + 1 }), {});
  console.log(`  v10: ${models.length} representations, acquired from ${JSON.stringify(tally(ts))}`);
  const author = doc.graph.nodes.find((n) => n.node_type === "author" && n.data?.orcid === "0000-0002-5065-7970");
  if (author) eq(PN.composeName(author.data.name, author.data.surname), "Emanuel Demetrescu", "v10: the author's name, the surname once (the data untouched)");
  const PY = [path.join(S3D, ".venv/bin/python"), "python3"].find((p) => p === "python3" || fs.existsSync(p));
  if (fs.existsSync(path.join(S3D, "src/s3dgraphy/attribution.py"))) {
    const code = `import json,sys
from s3dgraphy.api import load_emjson_file
from s3dgraphy import attribution as A
g,_=load_emjson_file(sys.argv[1])
ids=[n.node_id for n in g.nodes if getattr(n,'node_type','') in ('representation_model','representation_model_doc','representation_model_sf')]
print(json.dumps({i: A.acquired_of(g,i)['from'] for i in ids}))`;
    const py = JSON.parse(execFileSync(PY, ["-c", code, V10], { env: { ...process.env, PYTHONPATH: path.join(S3D, "src") } }).toString());
    eq(Object.keys(py).length, models.length, "v10: as many representations in s3Dgraphy");
    for (const m of models) eq(ts[m.id], py[m.id] ?? null, `v10 ${m.name}: acquired from ${ts[m.id]}, as s3Dgraphy`);
  }
}
console.log(`check-passi: ${checks} checks passed`);
