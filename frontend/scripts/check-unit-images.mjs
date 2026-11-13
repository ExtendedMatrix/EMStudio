// MICRO-FOTO-DOCUMENTI-BBOX B · executable check of src/unit-images.ts and of
// the unit in the Viewer (viewer-node.ts): the four roads to a unit's images,
// one image once (its checksum), the name matching of «Collega per nome…»
// (EM Tools' rule), a campaign's files in its document, the unit's own photo
// resource. With a copy of Templu Mare v9 (FDB_V9, default
// /tmp/fdb/T/EM/TempluMare_v9.em.json) it also measures the v9.
//
//   node scripts/check-unit-images.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const U = await load("unit-images.ts");
const V = await load("viewer-node.ts");

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

const node = (id, node_type, name, data = {}) => ({ id, node_type, name, data });
const edge = (source, edge_type, target, attributes) => ({ id: `${source}-${edge_type}-${target}`, source, target, edge_type, ...(attributes ? { attributes } : {}) });

// a unit reached by the four roads, one picture twice (same checksum)
const g = {
  nodes: [
    node("T15", "SF", "T15"),
    node("R1", "resource", "T15_a.jpg", { url: "foto/T15_a.jpg", checksum: "sha256:aa" }),
    node("DD", "document", "D.07", { url: "" }),
    node("RD", "resource", "pianta.png", { url: "DosCo/pianta.png", checksum: "sha256:bb" }),
    node("P", "property", "depth"), node("P2", "property", "width"),
    node("X", "extractor", "D.115.01"), node("D115", "document", "D.115"),
    node("RT", "resource", "TM015.pdf (tavola)", { url: "DosCo/TM015.pdf", checksum: "sha256:cc" }),
    node("AR", "annotation_region", "r"), node("RV", "resource", "dettaglio.jpg", { url: "foto/dettaglio.jpg", checksum: "sha256:dd" }),
    node("RDUP", "resource", "copy.jpg", { url: "x/T15_a_copy.jpg", checksum: "sha256:aa" }),
    node("M", "resource", "model.glb", { url: "m.glb" }),
  ],
  edges: [
    edge("T15", "has_linked_resource", "R1"), edge("T15", "has_linked_resource", "M"),
    edge("T15", "has_documentation", "DD"), edge("DD", "has_linked_resource", "RD"), edge("DD", "has_linked_resource", "RDUP"),
    edge("T15", "has_property", "P"), edge("P", "has_data_provenance", "X"), edge("X", "extracted_from", "D115"),
    edge("D115", "has_linked_resource", "RT"),
    edge("T15", "has_property", "P2"), edge("P2", "has_visual_reference", "AR"), edge("AR", "is_on_resource", "RV"),
  ],
};
const groups = U.unitImages(g, "T15");
eq(groups.map((x) => [x.route, x.via?.name ?? null, x.items.map((i) => i.id)]),
   [["direct", null, ["R1"]], ["document", "D.07", ["RD"]], ["reading", "D.115", ["RT"]], ["illustrates", "width", ["RV"]]],
   "the four roads, in order; the copy with the same checksum said once; the 3D model left to the Space");
eq(groups[2].items[0].medium, "pdf", "a PDF is a picture of the unit too (its first page, or its type)");

// a campaign: a document → a resource-folder whose files are the photographs
const camp = {
  nodes: [node("T11", "SF", "T11"), node("T12", "SF", "T12"), node("U1", "US", "1.US12"), node("D20", "document", "D.20"),
          node("C", "resource", "Campagna 2024", { url: "../RB/foto" }),
          ...Array.from({ length: 6 }, (_, i) => node(`F${i}`, "resource_file", `T1${i % 3}_${i}.jpg`,
            { url: `../RB/foto/T1${i % 3}_${i}.jpg`, checksum: `sha256:f${i}`, taken_at: "2024-05-0" + (1 + (i % 2)) }))],
  edges: [edge("D20", "has_linked_resource", "C"), ...Array.from({ length: 6 }, (_, i) => edge("C", "has_file", `F${i}`, { role: "member", path: `T1${i % 3}_${i}.jpg` }))],
};
const files = U.documentFiles(camp, "D20");
eq(files.length, 6, "a campaign's photographs are its document's files");
eq([...new Set(files.map((f) => f.date))], ["2024-05-01", "2024-05-02"], "…with the date the project read (taken_at)");
const docView = V.viewerTargetOf(camp, "D20");
eq(docView.parts.length, 6, "the Viewer opens the campaign with its six photographs");
const m = U.matchByName(files.map((f) => ({ id: f.id, name: f.name })),
                        [{ id: "T11", name: "T11" }, { id: "T12", name: "T12" }, { id: "U1", name: "1.US12" }, { id: "T12b", name: "T012" }]);
eq(m.pairs.map((p) => `${p.file}>${p.unit}`), ["F1>T11", "F4>T11"], "T11_*.jpg → T11 (the code that opens the name)");
eq(m.ambiguous.map((a) => [a.file, a.units]), [["F2", ["T12", "T12b"]], ["F5", ["T12", "T12b"]]],
   "T12 and T012 normalise alike: ambiguous, listed, never chosen");
eq(m.unmatched, ["F0", "F3"], "T10_* names no unit");
eq(U.unitKeys("1.US012"), ["1.us012", "us12"], "pyArchInit's area.code: the code alone too (EM Tools' unit_keys)");

// the unit's own resource shares the campaign's files (B2.3), and the Viewer shows them
camp.nodes.push(node("T11__photos", "resource", "T11 · foto", { unit_photos: "T11" }));
camp.edges.push(edge("T11", "has_linked_resource", "T11__photos"), edge("T11__photos", "has_file", "F1"), edge("T11__photos", "has_file", "F4"));
eq(U.unitPhotoResourceOf(camp, "T11"), "T11__photos", "the unit's photo resource is found again");
eq([...U.unitPhotoFiles(camp, "T11")].sort(), ["F1", "F4"], "…with the campaign's own file nodes");
eq(U.unitImages(camp, "T11").map((x) => [x.route, x.items.map((i) => i.id)]), [["direct", ["F1", "F4"]]], "…seen as the unit's own images");
const unitView = V.viewerTargetOf(camp, "T11");
eq([unitView.kind, unitView.parts.map((p) => [p.id, p.via, p.route])], ["unit", [["F1", "unit", "direct"], ["F4", "unit", "direct"]]],
   "a unit in the Viewer: its images, by road (one view with the Inspector's)");
eq(V.viewerTargetOf(camp, "T12").kind, "none", "a unit without images: nothing to see, as before");

// a region read on ONE photo of the campaign feeds the unit (B2.2)
camp.nodes.push(node("AR2", "annotation_region", "r2"), node("X2", "extractor", "D.20.01"), node("P3", "property", "height"));
camp.edges.push(edge("T12", "has_property", "P3"), edge("P3", "has_data_provenance", "X2"), edge("X2", "extracted_from", "AR2"),
                edge("AR2", "is_on_resource", "F2"), edge("X2", "extracted_from", "D20"));
eq([...U.filesReadForUnit(camp, "T12")], ["F2"], "the photo a reading of the unit looked at");
eq(U.unitImages(camp, "T12").map((x) => [x.route, x.via?.name, x.items.map((i) => i.id)]), [["reading", "D.20", ["F2"]]],
   "a reading that cites the CAMPAIGN brings the one photo it looked at, never the whole set");

// the v9 copy: what it has today
const V9 = process.env.FDB_V9 || "/tmp/fdb/T/EM/TempluMare_v9.em.json";
if (fs.existsSync(V9)) {
  const d = JSON.parse(fs.readFileSync(V9, "utf8"));
  const gr = d.graphs[d.active_graph_id] ?? Object.values(d.graphs)[0];
  const UT = new Set(["US", "USVs", "USVn", "SF", "VSF", "USD", "serUSVn", "RSF", "USN", "USNt", "BR", "USM"]);
  const units = gr.nodes.filter((n) => UT.has(n.node_type));
  const by = { direct: 0, document: 0, reading: 0, illustrates: 0 };
  let withAny = 0, t0 = performance.now();
  for (const u of units) {
    const gs = U.unitImages(gr, u.id);
    if (gs.length) withAny++;
    for (const x of gs) by[x.route] += 1;
  }
  const ms = performance.now() - t0;
  console.log(`v9: ${units.length} units · ${withAny} with images · units by road ${JSON.stringify(by)} · ${ms.toFixed(0)} ms for all`);
  eq(by.direct, 0, "v9: no unit has a picture linked directly (measured)");
  const t15 = units.find((u) => u.name === "T15");
  const g15 = U.unitImages(gr, t15.id);
  eq(g15.map((x) => [x.route, x.via?.name, x.items.map((i) => i.name)]), [["reading", "TM015", ["TM015.pdf (tavola)"]]],
     "v9: SF T15 → its readings → TM015 → «TM015.pdf (tavola)»");
} else console.log(`(no v9 at ${V9}: its measures skipped)`);

console.log(`unit-images: ${checks} checks passed`);
