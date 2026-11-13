// MICRO-OUTLINER-UNICO · the one Outliner — pure parts (`src/outliner-tree.ts`), in node:
//
//   node scripts/check-outliner-tree.mjs [path/to/a.em.json]
//
// Source → graph → dimensions; the units by epoch / alphabetical / by type; the
// RMDoc under its document and the RMSF under its find; the sync with the 3D
// (grey, filtered); paradata off by default when synced; the search; the keys
// to open to reveal a node. With an em.json (Templu Mare v9), the time to build
// the rows with every dimension open.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}outliner-tree.ts`], bundle: true, format: "esm", write: false,
  loader: { ".json": "json" } });
const O = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const N = (id, node_type, name = id, data = {}) => ({ id, node_type, name, data });
const E = (source, target, edge_type) => ({ source, target, edge_type });
const doc = { graph: { graph_id: "g", nodes: [
  N("E1", "EpochNode", "Età romana", { start_time: -100, end_time: 300 }),
  N("E0", "EpochNode", "Età arcaica", { start_time: -600, end_time: -100 }),
  N("US1", "US", "US1"), N("US2", "US", "US2"), N("USV10", "USVs", "USV10"), N("SF1", "SF", "SF1"), N("US9", "US", "US9"),
  N("D1", "document", "D.01"), N("D2", "document", "D.02"), N("RMD1", "representation_model_doc", "D.01 rilievo"),
  N("RMSF1", "representation_model_sf", "SF1 modello"), N("RM1", "representation_model", "Cella"),
  N("A1", "author", "E.D."), N("P1", "property", "altezza"), N("X1", "extractor", "D.01.1"),
  N("R1", "resource", "file.glb"), N("GONE", "US", "US0", { removed: true }),
], edges: [
  E("US1", "E1", "has_first_epoch"), E("US2", "E1", "has_first_epoch"), E("USV10", "E1", "has_first_epoch"),
  E("SF1", "E0", "has_first_epoch"), E("US2", "US1", "is_part_of"),
  E("D1", "RMD1", "has_representation_model_doc"), E("SF1", "RMSF1", "has_representation_model_sf"), E("E1", "RM1", "has_representation_model"),
] } };
const facts = () => ({ proxies: new Set(["US1"]), rmdocs: new Map([["D1", { rm: "RMD1", full: true }]]), rmsf: new Map([["SF1", ["RMSF1"]]]),
  tilesets: new Set(), rmEpochs: new Map([["RM1", ["E1"]]]), gis: [] });
const texts = { dim: { units: "Units", documents: "Documents", authors: "Authors", epochs: "Epochs", models: "Models", proxies: "Proxies",
  gis: "GIS", paradata: "Paradata", other: "Other", aux: "Aux" }, noEpoch: "No epoch", typeLabel: (t) => t, sourceNone: "Not on disk", empty: "—" };
const sources = [{ id: "f1", name: "TempluMare.em.json", kind: "file", graphs: [{ slot: "s1", name: "Templu", active: true, doc: () => doc, facts, aux: [] }] }];
const run = (opts = {}, toggled = new Set()) => O.flattenOutliner({ sources, opts: { ...O.DEFAULT_OPTS, ...opts }, texts, toggled });
const labels = (rows) => rows.map((r) => `${"  ".repeat(r.depth)}${r.label}${r.count ? ` (${r.count})` : ""}${r.absent ? " ·grey" : ""}`);

// 1 · source → graph → dimensions, the units open by epoch (newest on top), the container's member indented
{
  const rows = run();
  eq(rows.slice(0, 3).map((r) => r.kind), ["source", "graph", "dim"], "source, graph, dimension");
  const L = labels(rows); if (process.env.DUMP) console.log(L.join("\n"));
  ok(L.includes("      Età romana") && L.indexOf("      Età romana") < L.indexOf("      Età arcaica"), "epochs newest first");
  ok(L.includes("        US1") && L.includes("          US2"), "US2 under its container US1");
  ok(!rows.some((r) => r.label === "US0"), "a removed node is not listed");
  ok(L.includes("      No epoch (1)") && L.includes("        US9"), "units with no epoch apart");
  eq(rows.filter((r) => r.kind === "dim").map((r) => r.label), ["Units", "Documents", "Authors", "Epochs", "Models", "Proxies", "Paradata"],
    "default dimensions (paradata on when not synced, other off, no GIS / aux when empty)");
  ok(rows.find((r) => r.label === "Units").count === "5", "the count of the units");
}
// 2 · alphabetical and by type
{
  const a = run({ hierarchy: "alpha" }).filter((r) => r.kind === "node" && r.key.includes("|units/")).map((r) => r.label);
  eq(a, ["SF1", "US1", "US2", "US9", "USV10"], "alphabetical, numbers in order");
  const t = run({ hierarchy: "type" });
  eq(t.filter((r) => r.kind === "group" && r.key.includes("|units/type:")).map((r) => r.label), ["SF", "US", "USVs"], "by type: one group per type");
}
// 3 · RMDoc under its document, RMSF under its find (opened)
{
  const tg = new Set(["s1|dim:documents", "s1|documents/D1", "s1|units/ep:E0/SF1"]);
  const rows = run({}, tg);
  const d1 = rows.findIndex((r) => r.id === "D1");
  eq([rows[d1 + 1].id, rows[d1 + 1].kind, rows[d1 + 1].glyph], ["RMD1", "sub", "representation_model_doc"], "RMDoc under D.01");
  const sf = rows.findIndex((r) => r.id === "SF1");
  eq([rows[sf + 1].id, rows[sf + 1].glyph, rows[sf + 1].eye], ["RMSF1", "representation_model_sf", "rm:RMSF1"], "RMSF under SF1, with the eye");
  ok(!rows.some((r) => r.kind === "node" && r.id === "RMD1"), "the RMDoc is not a model of its own list");
}
// 4 · sync with the 3D: grey / filtered; paradata off by default when synced
{
  const tg = new Set(["s1|dim:documents"]);
  const grey = run({ sync3d: true }, tg);
  ok(grey.find((r) => r.id === "US9").absent && !grey.find((r) => r.id === "US1").absent, "US9 (no proxy) grey, US1 not");
  ok(!grey.find((r) => r.id === "SF1").absent, "SF1 has an RMSF: present");
  ok(grey.find((r) => r.id === "D2").absent && !grey.find((r) => r.id === "D1").absent, "D.02 (no RMDoc) grey, D.01 not");
  ok(!grey.some((r) => r.label === "Paradata"), "paradata off by default when synced");
  eq(grey.find((r) => r.label === "Units").count, "2 / 5", "the count says present / all");
  const filt = run({ sync3d: true, absent: "filter" }, tg);
  ok(!filt.some((r) => r.id === "US9") && !filt.some((r) => r.id === "D2"), "filtered: the absent ones go");
  ok(!filt.some((r) => r.label === "No epoch"), "…and a group left empty with them");
  ok(filt.some((r) => r.id === "US1") && filt.some((r) => r.id === "SF1"), "…the present ones stay");
  ok(run({ sync3d: true, paradata: true }).some((r) => r.label === "Paradata"), "paradata back by choice");
}
// 5 · the search opens what it finds, closes the rest
{
  const rows = run({ query: "d.01" });
  ok(rows.some((r) => r.id === "D1") && rows.some((r) => r.id === "X1"), "the document and the extractor found (closed dimensions opened)");
  ok(!rows.some((r) => r.id === "US1"), "the rest hidden");
  ok(rows[0].kind === "source" && rows[1].kind === "graph", "the place stays");
}
// 6 · reveal: the keys to open for a node in a closed dimension
{
  const b = { sources, opts: O.DEFAULT_OPTS, texts, toggled: new Set() };
  eq(O.opensForNode(b, "A1"), ["s1|dim:authors"], "an author: its dimension");
  eq(O.opensForNode(b, "US2"), [], "an open unit: nothing to open");
}
// 7 · the classes come from the datamodel
{
  const g = new Set();
  eq([O.dimOf(N("a", "USVn"), g), O.dimOf(N("b", "BR"), g), O.dimOf(N("c", "author_ai"), g), O.dimOf(N("d", "combiner"), g),
      O.dimOf(N("e", "RepresentationModelNodeGroup"), g), O.dimOf(N("f", "representation_model_doc"), g), O.dimOf(N("h", "dtc_process"), g)],
     ["units", "other", "authors", "paradata", "models", null, "other"], "dimension by class");
}
// 7b · an epoch with no unit of its own stays as the heading of a sub-epoch that has some
{
  const d2 = { graph: { graph_id: "g2", nodes: [N("M", "EpochNode", "Medioevo", { start_time: 600 }), N("Ma", "EpochNode", "Alto Medioevo", { start_time: 600 }),
    N("Z", "EpochNode", "Vuota", { start_time: 1900 }), N("U", "US", "US20")],
    edges: [E("M", "Ma", "has_sub_epoch"), E("U", "Ma", "has_first_epoch")] } };
  const src = [{ id: "f", name: "x", kind: "file", graphs: [{ slot: "s", name: "g", active: true, doc: () => d2, facts, aux: [] }] }];
  const rows = O.flattenOutliner({ sources: src, opts: O.DEFAULT_OPTS, texts, toggled: new Set() });
  const groups = rows.filter((r) => r.kind === "group").map((r) => `${r.depth}:${r.label}`);
  eq(groups, ["3:Medioevo", "4:Alto Medioevo"], "the mother epoch kept, indented over its phase; an empty epoch left out");
}
// 7c · nothing open: one line
eq(O.flattenOutliner({ sources: [], opts: O.DEFAULT_OPTS, texts: { ...texts, noSources: "No graph open" }, toggled: new Set() }).map((r) => [r.kind, r.label]),
   [["empty", "No graph open"]], "an empty state is one line");
// 8 · a big graph (an em.json given): every dimension open, timed
const path = process.argv[2];
if (path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const gs = raw.graphs ? Object.values(raw.graphs) : [raw.graph];
  const big = { graph: gs[0] };
  const src = [{ id: "f", name: path.split("/").pop(), kind: "file", graphs: [{ slot: "s", name: "g", active: true, doc: () => big,
    facts: () => ({ proxies: new Set(), rmdocs: new Map(), rmsf: new Map(), tilesets: new Set(), rmEpochs: new Map(), gis: [] }), aux: [] }] }];
  const all = new Set(O.DIMS.map((d) => `s|dim:${d}`));
  const opts = { ...O.DEFAULT_OPTS, dims: [...O.DIMS], paradata: true };
  // open every row that has children, until nothing is left closed
  for (let pass = 0; pass < 8; pass++) {
    const closed = O.flattenOutliner({ sources: src, opts, texts, toggled: all }).filter((r) => r.parent && !r.open);
    if (!closed.length) break;
    for (const r of closed) all.has(r.key) ? all.delete(r.key) : all.add(r.key);
  }
  const t0 = performance.now();
  let rows;
  for (let i = 0; i < 10; i++) rows = O.flattenOutliner({ sources: src, opts, texts, toggled: all });
  const ms = (performance.now() - t0) / 10;
  console.log(`${gs[0].nodes.length} nodes → ${rows.length} rows, every dimension open: ${ms.toFixed(1)} ms a build`);
  ok(rows.length > gs[0].nodes.length * 0.5, "most nodes listed");
}
// MICRO-SPAZIO-CONTAINER p.8 · the Outliner of the Space: the epoch ABOVE the 3D's dimensions
// (Proxies, Models with their container, RMDoc, RMSF; the GIS under «no epoch»), rows with their
// Space key; «by type» stays the graph's dimensions
{
  doc.graph.nodes.push(N("G1", "RepresentationModelNodeGroup", "Survey"), N("RM2", "representation_model", "Mesh 2"));
  doc.graph.edges.push(E("E1", "RM2", "has_representation_model"), E("RM2", "G1", "is_in_representation_model_group"));
  const f2 = () => ({ ...facts(), rmEpochs: new Map([["RM1", ["E1"]], ["RM2", ["E1"]], ["RMD1", ["E1"]], ["RMSF1", ["E0"]]]),
    rmGroup: new Map([["RM2", "G1"]]), gis: [{ id: "L1", name: "Catasto", kind: "layer" }] });
  const src2 = [{ ...sources[0], graphs: [{ ...sources[0].graphs[0], facts: f2 }] }];
  const t2 = { ...texts, space: { proxies: "Proxy", models: "Modelli", rmdoc: "RMDoc", rmsf: "RMSF", gis: "GIS" } };
  const rows = O.flattenOutliner({ sources: src2, opts: { ...O.DEFAULT_OPTS, space: true }, texts: t2, toggled: new Set(["s1|sp/E1/grp/G1"]) });
  const L = labels(rows); if (process.env.DUMP) console.log(L.join("\n"));
  eq(rows.filter((r) => r.kind === "group" && r.glyph === "EpochNode").map((r) => r.label), ["Età romana", "Età arcaica"], "the epochs at the top of the graph");
  const e1 = L.indexOf("    Età romana");
  ok(e1 >= 0 && L[e1 + 1] === "      Proxy (1)" && L[e1 + 2] === "        US1", "under an epoch, its proxies");
  ok(L.includes("        Survey") && L.includes("          Mesh 2") && L.includes("        Cella"), "Models: a container with its member, a model alone");
  ok(L.includes("      RMDoc (1)") && L.includes("      RMSF (1)"), "RMDoc and RMSF under their epochs");
  ok(L.filter((x) => x.trim() === "Survey").length === 1, "a container without an alternative of its own is listed where its members are, nowhere else");
  eq(rows.find((r) => r.label === "US1" && r.skey)?.skey, "proxy:US1", "a proxy row carries its Space key");
  eq(rows.find((r) => r.label === "Mesh 2")?.skey, "rm:RM2", "a model row too");
  ok(L.includes("    No epoch (1)") && L.includes("        Catasto"), "the GIS layers under «no epoch»");
  ok(!rows.some((r) => r.kind === "dim"), "no graph dimension in the Space's tree by epoch");
  ok(O.flattenOutliner({ sources: src2, opts: { ...O.DEFAULT_OPTS, space: true, hierarchy: "type" }, texts: t2, toggled: new Set() }).some((r) => r.kind === "dim"),
    "«by type» is the graph's dimensions");
}
// MICRO-OUTLINER-EPOCHE-TOOLTIP p.1 · the container is a BRANCH: epoch → container →
// its members (and its alternative, marked); a model in a container is not listed again
// under the epoch; a member in another epoch is listed under its container with that
// epoch said; a container out of step with its reference says it (s3Dgraphy's rule)
{
  const N2 = (id, t, name = id, data = {}) => ({ id, node_type: t, name, data });
  const E2 = (source, target, edge_type) => ({ source, target, edge_type });
  const d2 = { graph: { graph_id: "g2", nodes: [
    N2("XX", "EpochNode", "XX sec", { start_time: 1900, end_time: 2000 }), N2("Y15", "EpochNode", "2015", { start_time: 2015, end_time: 2015 }),
    N2("S15", "RepresentationModelNodeGroup", "Survey2015"), N2("M1", "representation_model", "SM_OB_EST"), N2("M2", "representation_model", "SM_OB_INT"),
    N2("M3", "representation_model", "SM_OB_PODIO"), N2("TS", "resource", "TempluMare tileset"), N2("RMSF", "representation_model_sf", "RMSF prato"),
    N2("LO", "representation_model", "Loose"), N2("T15", "representation_model", "Survey_2015_egm2008"),
    N2("D1", "document", "D.01"), N2("X1", "extractor", "D.01.61"), N2("AR", "annotation_region", "D.01.61 · point"),
  ], edges: [
    E2("XX", "M1", "has_representation_model"), E2("XX", "M2", "has_representation_model"), E2("Y15", "M3", "has_representation_model"),
    E2("XX", "LO", "has_representation_model"), E2("Y15", "T15", "has_representation_model"),
    E2("M1", "S15", "is_in_representation_model_group"), E2("M2", "S15", "is_in_representation_model_group"),
    E2("M3", "S15", "is_in_representation_model_group"), E2("RMSF", "S15", "is_in_representation_model_group"),
    E2("S15", "TS", "has_linked_resource"), E2("D1", "M1", "has_representation_model"), E2("XX", "Y15", "has_sub_epoch"),
  ] } };
  const f3 = () => ({ ...O.emptyFacts(), tilesets: new Set(["T15"]), rmEpochs: new Map([["M1", ["XX"]], ["M2", ["XX"]], ["M3", ["Y15"]], ["LO", ["XX"]], ["T15", ["Y15"]]]),
    versions: (id) => id === "M1" ? [{ id: "V0", name: "master", drawn: false, chosen: false }, { id: "V1", name: "LOD1", drawn: true, chosen: true, level: "LOD1" }] : [],
    x3d: new Map([["D1", [{ id: "X1", name: "D.01.61" }]]]), docLit: () => false, sketches: [{ id: "k1", name: "Cubo" }] });
  const src3 = [{ id: "f2", name: "v9.em.json", kind: "file", graphs: [{ slot: "s2", name: "Temple", active: true, doc: () => d2, facts: f3, aux: [] }] }];
  const t3 = { ...texts, space: { proxies: "Proxy", models: "Modelli", rmdoc: "RMDoc", rmsf: "RMSF", gis: "GIS", x3d: "Estrattori 3D", sketches: "Abbozzi", x3dOff: "spento" },
    container: { alternative: "alt", livesIn: (e) => `vive in ${e}`, outOfStep: (n, a, b) => `${n} fuori passo: ${a} / ${b}`, follows: "segue" } };
  const open = new Set(["s2|models/ep:XX/grp/S15", "s2|models/ep:Y15/grp/S15"]);
  const rows = O.flattenOutliner({ sources: src3, opts: { ...O.DEFAULT_OPTS, dims: ["models"], firstOpen: "models" }, texts: t3, toggled: open });
  const L = labels(rows); if (process.env.DUMP) console.log(L.join("\n"));
  const xx = L.indexOf("      XX sec");
  ok(xx >= 0 && L[xx + 1] === "        Survey2015", "Models by epoch: the container is a branch under XX sec");
  ok(L[xx + 2] === "          TempluMare tileset" && rows[xx + 2].alt === true, "…its alternative first, marked as such");
  ok(L.slice(xx, xx + 8).includes("          SM_OB_EST") && L.slice(xx, xx + 8).includes("          SM_OB_INT"), "…its members under it");
  const podio = rows.find((r) => r.label === "SM_OB_PODIO" && r.key.includes("ep:XX"));
  ok(!!podio && podio.note === "⟂ 2015" && podio.noteTitle === "vive in 2015", "a member in another epoch: listed under its container, its epoch said");
  ok(rows.find((r) => r.label === "RMSF prato" && r.key.includes("ep:XX"))?.noteTitle === "segue", "a member without an epoch follows its container");
  ok(L.includes("        Loose") && !rows.some((r) => r.label === "SM_OB_EST" && !r.key.includes("/grp/")), "a model in a container is not listed again under the epoch; a loose one is");
  ok(L.includes("        Survey_2015_egm2008"), "the 2015 tileset (not a member) stays under 2015");
  eq(rows.find((r) => r.label === "SM_OB_EST" && r.key.includes("ep:XX"))?.epochAt, "XX", "a row says the epoch it is listed under (the drag moves from it)");
  ok(!rows.find((r) => r.label === "Survey2015")?.warn, "no reference (no own epoch, no tileset member): nothing out of step (s3Dgraphy)");
  // the container with an epoch of its own (2015): the meshes in XX sec are out of step
  d2.graph.edges.push(E2("Y15", "S15", "has_representation_model"));
  const rows2 = O.flattenOutliner({ sources: src3, opts: { ...O.DEFAULT_OPTS, dims: ["models"], firstOpen: "models" }, texts: t3, toggled: open });
  const c2 = rows2.filter((r) => r.label === "Survey2015");
  eq(c2.length, 1, "with an epoch of its own the container is placed there only");
  eq(c2[0].warn, "2 fuori passo: XX sec / 2015", "…and says its members out of step");
  ok(rows2.some((r) => r.label === "SM_OB_EST" && r.note === "⟂ XX sec"), "…the members in XX sec under it, their epoch said");
  // the Space's tree: versions under a model, the 3D extractors under their document, the sketches at the bottom
  d2.graph.edges.pop();
  const rows3 = O.flattenOutliner({ sources: src3, opts: { ...O.DEFAULT_OPTS, space: true }, texts: t3,
    toggled: new Set(["s2|sp/XX/grp/S15", "s2|sp/XX/grp/S15/m/M1"]) });
  const L3 = labels(rows3); if (process.env.DUMP) console.log(L3.join("\n"));
  ok(rows3.some((r) => r.kind === "version" && r.label === "LOD1" && r.version?.drawn && r.version.rm === "M1"), "a model's versions under it (the one drawn said)");
  const xr = rows3.find((r) => r.label === "D.01.61");
  ok(!!xr && xr.skey === "x3d:X1" && xr.ghost === true, "a 3D extractor under its document where the document publishes, a ghost when not lit");
  ok(L3.includes("      Estrattori 3D (1)") && L3.includes("        D.01"), "…in «Estrattori 3D», nested under the document");
  ok(L3.at(-2)?.trim().startsWith("Abbozzi") && rows3.at(-1).skey === "sketch:k1", "the sketches out of the epochs, at the bottom");
  ok(!rows3.some((r) => r.label === "D.01.61" && r.key.includes("sp/Y15")), "no extractor where its document publishes nothing");
}
console.log(`check-outliner-tree: ${checks} checks OK`);
