// TEMPLU MARE v2 · the version for a use, the same rule as s3Dgraphy and
// Heriverse (`choose_version`), and the Space that loads it.
//
//   node scripts/check-version-for.mjs
//
// 1 · s3Dgraphy's table of cases (`version_for_cases.json`, vendored in
//     src/assets/) passes through `asset-versions.ts`; when the s3Dgraphy
//     checkout is beside, the vendored copy must be the library's, byte for byte.
// 2 · the versions read from the DTC chain (`versionsOf`, `assetOf`): a master
//     `.blend` datablock, lod0 for Heriverse/ATON, lod1 web — the shape the
//     tools write for the reconstruction of Templu Mare v2.
// 3 · the Space (`buildSpace`): that model shows its lod1 web glb, not the
//     master; a model without versions shows its first resource, as before.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./asset-versions"; export { buildSpace } from "./space";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let n = 0;
const eq = (g, e, w) => { assert.deepEqual(g, e, `${w} — got ${JSON.stringify(g)}`); n++; };

// 1 · the shared table
const VENDOR = new URL("../src/assets/version_for_cases.json", import.meta.url).pathname;
const S3D = new URL("../../../s3Dgraphy/src/s3dgraphy/JSON_config/version_for_cases.json", import.meta.url).pathname;
if (existsSync(S3D)) eq(readFileSync(VENDOR, "utf8"), readFileSync(S3D, "utf8"), "the vendored table is s3Dgraphy's");
const table = JSON.parse(readFileSync(VENDOR, "utf8"));
for (const c of table.cases) {
  const got = M.chooseVersion(c.entries, c.use, c.prefer_level ?? null);
  if (c.expect === null) { eq(got, null, c.name); continue; }
  eq({ id: got.entry ? got.entry.id : null, reason: got.reason, use: got.use, note: Boolean(got.note) }, c.expect, c.name);
}

// 2 · the chain
const sum = (c) => "sha256:" + c.repeat(64);
const nodes = [
  { id: "ep", node_type: "EpochNode", name: "II A.D.", data: {} },
  { id: "rm", node_type: "representation_model", name: "Podio_2", data: {} },
  { id: "master", node_type: "resource", name: "Podio_2 (reconstruction)",
    data: { url: "../SB/GreatTemple_2026_v2.blend", url_type: "3d_model", tier: "master", packaging: "datablock",
            checksum: sum("a"), residency: "resident" } },
  { id: "v0", node_type: "resource", name: "Podio_2 (reconstruction) lod0",
    data: { url: "../SB/versions/Podio_2@lod0-aton-heriverse.glb", url_type: "3d_model", use: ["aton", "heriverse"],
            checksum: sum("b"), residency: "resident", size_bytes: 900, lod_level: "lod0" } },
  { id: "v1", node_type: "resource", name: "Podio_2 (reconstruction) lod1",
    data: { url: "../SB/versions/Podio_2@lod1-realtime-web.glb", url_type: "3d_model", use: ["realtime", "web"],
            checksum: sum("c"), residency: "resident", size_bytes: 300, lod_level: "lod1" } },
  { id: "p0", node_type: "dtc_process", name: "p0", data: { dtc_kind: "lod_generation", parameters: { level: "lod0" } } },
  { id: "p1", node_type: "dtc_process", name: "p1", data: { dtc_kind: "lod_generation", parameters: { level: "lod1" } } },
  { id: "rm2", node_type: "representation_model", name: "Wall", data: {} },
  { id: "plain", node_type: "resource", name: "wall.glb",
    data: { url: "wall.glb", url_type: "3d_model", checksum: sum("d"), residency: "resident" } },
];
const E = (id, s, t, type) => ({ id, source: s, target: t, edge_type: type });
const edges = [
  E("e1", "ep", "rm", "has_representation_model"), E("e2", "rm", "master", "has_linked_resource"),
  E("e3", "p0", "master", "dtc_had_input"), E("e4", "p0", "v0", "dtc_had_output"),
  E("e5", "p1", "v0", "dtc_had_input"), E("e6", "p1", "v1", "dtc_had_output"),
  E("e7", "ep", "rm2", "has_representation_model"), E("e8", "rm2", "plain", "has_linked_resource"),
];
const byId = new Map(nodes.map((x) => [x.id, x]));
const vg = { node: (id) => byId.get(id),
             out: (id, t) => edges.filter((e) => e.source === id && e.edge_type === t).map((e) => e.target),
             into: (id, t) => edges.filter((e) => e.target === id && e.edge_type === t).map((e) => e.source) };
eq(M.assetOf(vg, "v1"), "master", "the asset of lod1 is the master");
eq(M.versionsOf(vg, "master").map((e) => [e.id, e.master, e.lod_level, e.use]),
   [["master", true, null, []], ["v0", false, "lod0", ["aton", "heriverse"]], ["v1", false, "lod1", ["realtime", "web"]]],
   "the master and its two versions, levels computed from the chain");
eq(M.chooseVersion(M.versionsOf(vg, "master"), M.SCENE_USES).entry.id, "v1", "a scene asks web first: lod1");
eq(M.chooseVersion(M.versionsOf(vg, "master"), ["heriverse", "aton", "web", "realtime"]).entry.id, "v0",
   "Heriverse asks heriverse first: lod0");

// 3 · the Space
const sp = M.buildSpace({ graph: { nodes, edges } }, { isUnit: () => false });
const rm = sp.rms.find((r) => r.id === "rm");
eq([rm.resource.id, rm.resource.url, rm.resource.state, rm.choice.use, rm.choice.reason],
   ["v1", "../SB/versions/Podio_2@lod1-realtime-web.glb", "resident", "web", "use"],
   "the Space loads the web version, not the .blend master");
const rm2 = sp.rms.find((r) => r.id === "rm2");
eq([rm2.resource.id, rm2.choice], ["plain", null], "a model without versions keeps its first resource");

console.log(`check-version-for: ${n} checks ok (${table.cases.length} shared cases)`);
