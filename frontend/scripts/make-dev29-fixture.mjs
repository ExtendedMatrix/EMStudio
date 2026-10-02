// VLONG-DEV29 · the fixture of part B: the SHAPE of what Cowork opened on the
// night of 1 Oct (San Pietro, Segni), at a size a test can hold, with none of
// E.D.'s data in it.
//
//   node scripts/make-dev29-fixture.mjs      → testdata/dev29-segni-lite.em.json
//
// What it carries, each piece for one promise of the parte B:
//   · B2 — a drone flight of 8 photographs, stamped AND declared: the stamps'
//     event («Acquisition», download, id = the stamps' process_id) and the
//     declared one («Volo drone», photo) produce the SAME 8 files; two
//     processes whose name is «derivation of …» and whose technique is
//     declared («allineamento», «export: OBJ decimato»);
//   · B3 — a file_set resource (obj + mtl + texture) with members_digest =
//     checksum, and a graph licence CC-BY-ND;
//   · B8 — the graph's GeoPositionNode at EPSG:4326 / 0,0 (not georeferenced),
//     D.32 on D.02's file, D.33 with `//`, a resource declared missing.
import { writeFileSync } from "node:fs";

const G = "dev29-segni-lite";
const nodes = [];
const edges = [];
const node = (id, node_type, name, data = {}, extra = {}) => { nodes.push({ id, node_type, name, data, ...extra }); return id; };
const edge = (source, edge_type, target, attributes) =>
  edges.push({ id: `${source}__${edge_type}__${target}`, edge_type, source, target, ...(attributes ? { attributes } : {}) });

// the graph, its paradata, its licence, its (missing) georeference
node(`${G}_graphroot`, "graph", "Graph", { em_id: "SSP" });
node(`${G}_graph_paradata`, "ParadataNodeGroup", "Graph paradata", {});
edge(`${G}_graphroot`, "has_paradata_nodegroup", `${G}_graph_paradata`);
node(`${G}_graph_license`, "license", "CC-BY-ND", { license_type: "CC-BY-ND-4.0", url: "" });
edge(`${G}_graph_license`, "is_in_paradata_nodegroup", `${G}_graph_paradata`);
node("geo_imported_graph", "geo_position", "geo_position", { epsg: 4326, shift_x: 0, shift_y: 0, shift_z: 0, rotation: 0 });

// a little stratigraphy, so it is a study and not only a DTC
node("ep1", "EpochNode", "Età romana", { start_time: -100, end_time: 300 });
node("us1", "US", "US1", {}, { description: "muro" });
node("us2", "US", "US2", {}, { description: "crollo" });
edge("us1", "has_first_epoch", "ep1");
edge("us2", "has_first_epoch", "ep1");
edge("us2", "is_after", "us1");

// the documents of the DosCo — D.32 on D.02's file, D.33 with a double slash
node("d02", "document", "D.02", { url: "/DosCo/D.02.jpg" }, { description: "incisione di Dodwell" });
node("d32", "document", "D.32", { url: "/DosCo/D.02.jpg" });
node("d33", "document", "D.33", { url: "//DosCo/D.33.jpg" });
node("d33_link", "resource", "Link to D.33", { url: "//DosCo/D.33.jpg", url_type: "External link" });

// the drone: 8 photographs, two events for the same lot
const PROC_STAMPS = "c1eef313-29e1-5361-ad19-ca01930832e7";
node(PROC_STAMPS, "dtc_acquisition", "Acquisition", { dtc_kind: "download", created_at: "2026-09-29T19:24:39Z" });
node("acq-drone", "dtc_acquisition", "Volo drone San Pietro (FC300X)", { dtc_kind: "photo", device: "DJI FC300X", date: "2018-02-17", member_count: 8 });
for (let i = 0; i < 8; i++) {
  const id = `res:dji${i}`;
  node(id, "resource", `DJI_01${66 + i}.JPG`, { packaging: "file", tier: "master", media_type: "image/jpeg",
    checksum: `sha256:${String(i).repeat(64)}` });
  edge(PROC_STAMPS, "dtc_had_output", id);
  edge("acq-drone", "dtc_had_output", id);
}
// the Canon set, one directory resource
node("acq-canon", "dtc_acquisition", "Canon 6D 24mm, 17 maggio 2021", { dtc_kind: "photo", member_count: 1 });
node("res:canon", "resource", "Canon 6D 24mm (204 foto)", { packaging: "directory" });
edge("acq-canon", "dtc_had_output", "res:canon");
// the panoramas: declared missing
node("acq-pano", "dtc_acquisition", "Panorami Insta360 Pro2", { dtc_kind: "photo" });
node("res:pano", "resource", "Segni_Acropoli_pano8k.rar (assente)", { packaging: "archive", missing: true });
edge("acq-pano", "dtc_had_output", "res:pano");

// the alignment, and an export
node("proc-align", "dtc_process", "derivation of Soluzione fotogrammetrica (Metashape xml)",
  { dtc_kind: "photogrammetry", technique: "allineamento", software: [{ name: "Agisoft Metashape", version: "1.8.1" }] });
edge("proc-align", "dtc_had_input", "acq-drone");
edge("proc-align", "dtc_had_input", "acq-canon");
node("res:xml", "resource", "Soluzione fotogrammetrica (Metashape xml)", { packaging: "file" });
edge("proc-align", "dtc_had_output", "res:xml");
node("proc-lod0", "dtc_process", "derivation of San Pietro LOD0 (Zenodo, 12 texture)",
  { dtc_kind: "transformation", technique: "export: OBJ 12 materiali", software: [{ name: "Blender", version: "3.4.0" }] });
edge("proc-lod0", "dtc_had_input", "res:xml");
const MD = "sha256:621651165913f4815be600cd3871d2c77618c0f1521c721b634ce73d8e220f02";
node("res:lod0", "resource", "San Pietro LOD0 (Zenodo, 12 texture)",
  { url_type: "3d_model", tier: "distribution", packaging: "file_set", members_digest: MD, checksum: MD });
edge("proc-lod0", "dtc_had_output", "res:lod0");
for (const [k, path, role] of [["obj", "OB_SPietro_Temp_LOD0.obj", "entry_point"], ["mtl", "OB_SPietro_Temp_LOD0.mtl", "member"],
                                ["tex", "textures/SPietro_Temp.jpg", "member"]]) {
  const id = `file:lod0-${k}`;
  node(id, "resource_file", path.split("/").pop(), { url: path, checksum: `sha256:${k.padEnd(64, "0")}`, size_bytes: 100 });
  edge("res:lod0", "has_file", id, { role, path });
}
node("proc-lod2", "dtc_process", "derivation of San Pietro LOD2",
  { dtc_kind: "transformation", technique: "export: OBJ decimato" });
edge("proc-lod2", "dtc_had_input", "res:xml");
node("res:lod2", "resource", "San Pietro LOD2", { packaging: "file" });
edge("proc-lod2", "dtc_had_output", "res:lod2");
edge("us1", "has_linked_resource", "res:lod0");

const doc = {
  header: { format: "em.json", version: "1.0", schema_version: 2, generator: { tool: "make-dev29-fixture.mjs" } },
  graph: { graph_id: G, name: "Segni lite (dev29)", nodes, edges },
};
const out = new URL("../testdata/dev29-segni-lite.em.json", import.meta.url).pathname;
writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
console.log(`${out}: ${nodes.length} nodes, ${edges.length} edges`);
