// NIGHT-RISORSA-FILE · the fixture of the resource and its files.
//
//   node scripts/make-resources-fixture.mjs      # → testdata/risorsa-file.em.json
//
// The catena fixture, plus what TempluMare's base holds for one tile, written by
// `resources.ts` (the one constructor) and never by hand:
//
//   OB_PODIO_LOD1 (blend)   the master: a datablock of TempluMare_2021.blend
//        ▲ dtc_derived_from
//   Export OBJ (3DSC) ──dtc_had_output──▶ OB_PODIO_LOD1   file_set: obj + mtl + texture
//   OB_PRATO_LOD1                            file_set, sharing no file
//   OB_EST_L_LOD1 / OB_EST_R_LOD1            two tiles sharing ONE texture
//   RM_PODIO ──has_linked_resource──▶ OB_PODIO_LOD1
//
// The checksums are the REAL ones of the base (measured with shasum on the
// copy in the night's report), so the fixture and the files on disk agree.
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const TD = new URL("../testdata/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./resources";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const R = await import("data:text/javascript;base64,"
  + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const doc = JSON.parse(readFileSync(`${TD}catena.em.json`, "utf8"));
doc.graph.graph_id = "risorsa-file";
const g = R.plainGraph(doc.graph);
const SUMS = JSON.parse(readFileSync(`${TD}risorsa-file.sums.json`, "utf8"));
// the entry point (the obj) carries its locator beside the em.json of the base
// (`fs/base/`), the other files only their path relative to it — which is what
// has_file declares, and what the viewer resolves
const f = (path) => ({ path: path.replace(/^LOD1\//, ""), checksum: SUMS[path].checksum,
  size_bytes: SUMS[path].size_bytes,
  ...(path.endsWith(".obj") ? { url: `RM/TempluMare_tiles/${path}` } : {}) });

R.addResource(g, { resourceId: "podio_blend", name: "OB_PODIO_LOD1 (TempluMare_2021.blend)",
  kind: "3d_model", packaging: "datablock", tier: "master",
  files: [{ blend_file: "RB/TempluMare_2021.blend", datablock: "OB_PODIO_LOD1" }] });
// parte 3: an object of the .blend that nothing was exported from — the web
// viewer has no representation of it to open
R.addResource(g, { resourceId: "prato_blend", name: "OB_PRATO_LOD1 (TempluMare_2021.blend)",
  kind: "3d_model", packaging: "datablock", tier: "master",
  files: [{ blend_file: "RB/TempluMare_2021.blend", datablock: "OB_PRATO_LOD1" }] });
R.addResource(g, { resourceId: "podio_lod1", name: "OB_PODIO_LOD1", kind: "3d_model",
  packaging: "file_set", tier: "distribution", derivedFrom: ["podio_blend"],
  data: { dtc_kind: "mesh" },
  files: [f("LOD1/OB_PODIO_LOD1.obj"), f("LOD1/OB_PODIO_LOD1.mtl"), f("LOD1/textures/T_OB_PODIO_LOD1.jpg")] });
R.addResource(g, { resourceId: "prato_lod1", name: "OB_PRATO_LOD1", kind: "3d_model",
  packaging: "file_set", data: { dtc_kind: "mesh" },
  files: [f("LOD1/OB_PRATO_LOD1.obj"), f("LOD1/OB_PRATO_LOD1.mtl"), f("LOD1/textures/T_OB_PRATO_LOD1.jpg")] });
// two tiles and ONE texture (the same bytes, so one file node)
const shared = { path: "textures/T_shared.jpg", checksum: "sha256:" + "5".repeat(64), size_bytes: 1000 };
R.addResource(g, { resourceId: "estl_lod1", name: "OB_EST_L_LOD1", kind: "3d_model",
  packaging: "file_set", data: { dtc_kind: "mesh" },
  files: [f("LOD1/OB_EST_L_LOD1.obj"), f("LOD1/OB_EST_L_LOD1.mtl"), shared] });
R.addResource(g, { resourceId: "estr_lod1", name: "OB_EST_R_LOD1", kind: "3d_model",
  packaging: "file_set", data: { dtc_kind: "mesh" },
  files: [f("LOD1/OB_EST_R_LOD1.obj"), f("LOD1/OB_EST_R_LOD1.mtl"), shared] });
// D.2 «Rilievo 3D» has no file of its own here: its model is its RM's
delete doc.graph.nodes.find((n) => n.id === "D2").data.url;
doc.graph.nodes.push(
  { id: "export_obj", name: "Export OBJ (3DSC)", node_type: "dtc_process", description: "",
    data: { dtc_kind: "format_conversion" } },
  { id: "RM_PODIO", name: "RM_PODIO", node_type: "representation_model", description: "" },
  // parte 3: an RM whose only resource is the object in the .blend
  { id: "RM_BLEND", name: "RM_BLEND", node_type: "representation_model", description: "" },
  { id: "D4", name: "D.4", node_type: "document", description: "Solo nel .blend", data: {} });
doc.graph.edges.push(
  { id: "export_obj__dtc_had_output__podio_lod1", source: "export_obj", target: "podio_lod1", edge_type: "dtc_had_output" },
  { id: "export_obj__dtc_had_input__podio_blend", source: "export_obj", target: "podio_blend", edge_type: "dtc_had_input" },
  { id: "RM_PODIO__has_linked_resource__podio_lod1", source: "RM_PODIO", target: "podio_lod1", edge_type: "has_linked_resource" },
  { id: "RM_PODIO__has_first_epoch__EP_MOD", source: "RM_PODIO", target: "EP_MOD", edge_type: "has_first_epoch" },
  // parte 3: D.2 «Rilievo 3D» has the RM of PODIO; D.4 the RM of the .blend only
  { id: "D2__has_representation_model__RM_PODIO", source: "D2", target: "RM_PODIO", edge_type: "has_representation_model" },
  { id: "RM_BLEND__has_linked_resource__prato_blend", source: "RM_BLEND", target: "prato_blend", edge_type: "has_linked_resource" },
  { id: "D4__has_representation_model__RM_BLEND", source: "D4", target: "RM_BLEND", edge_type: "has_representation_model" });
writeFileSync(`${TD}risorsa-file.em.json`, JSON.stringify(doc, null, 1) + "\n");
console.log(`risorsa-file.em.json: ${doc.graph.nodes.length} nodes, ${doc.graph.edges.length} edges`);
