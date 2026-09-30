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
const f = (path) => ({ path: path.replace(/^LOD1\//, ""), checksum: SUMS[path].checksum,
  size_bytes: SUMS[path].size_bytes });

R.addResource(g, { resourceId: "podio_blend", name: "OB_PODIO_LOD1 (TempluMare_2021.blend)",
  kind: "3d_model", packaging: "datablock", tier: "master",
  files: [{ blend_file: "RB/TempluMare_2021.blend", datablock: "OB_PODIO_LOD1" }] });
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
doc.graph.nodes.push(
  { id: "export_obj", name: "Export OBJ (3DSC)", node_type: "dtc_process", description: "",
    data: { dtc_kind: "format_conversion" } },
  { id: "RM_PODIO", name: "RM_PODIO", node_type: "representation_model", description: "" });
doc.graph.edges.push(
  { id: "export_obj__dtc_had_output__podio_lod1", source: "export_obj", target: "podio_lod1", edge_type: "dtc_had_output" },
  { id: "export_obj__dtc_had_input__podio_blend", source: "export_obj", target: "podio_blend", edge_type: "dtc_had_input" },
  { id: "RM_PODIO__has_linked_resource__podio_lod1", source: "RM_PODIO", target: "podio_lod1", edge_type: "has_linked_resource" },
  { id: "RM_PODIO__has_first_epoch__EP_MOD", source: "RM_PODIO", target: "EP_MOD", edge_type: "has_first_epoch" });
writeFileSync(`${TD}risorsa-file.em.json`, JSON.stringify(doc, null, 1) + "\n");
console.log(`risorsa-file.em.json: ${doc.graph.nodes.length} nodes, ${doc.graph.edges.length} edges`);
