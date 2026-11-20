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

// 1b · the version for the HARDWARE (E.D., 2 Nov 2026; MICRO-GIS-BASE): s3Dgraphy's
//      `choose_for_hardware` table through `chooseForHardware`
{
  const HV = new URL("../src/assets/version_for_hardware_cases.json", import.meta.url).pathname;
  const HS = new URL("../../../s3Dgraphy/src/s3dgraphy/JSON_config/version_for_hardware_cases.json", import.meta.url).pathname;
  if (existsSync(HS)) eq(readFileSync(HV, "utf8"), readFileSync(HS, "utf8"), "the vendored hardware table is s3Dgraphy's");
  for (const c of JSON.parse(readFileSync(HV, "utf8")).cases) {
    const got = M.chooseForHardware(c.entries, c.hardware);
    if (c.expect.id === null) { eq(got, null, c.name); continue; }
    eq({ id: got.entry ? got.entry.id : null, reason: got.reason, note: Boolean(got.note) }, c.expect, c.name);
  }
  assert.throws(() => M.chooseForHardware([], "tablet")); n++;
}

// 1c · MICRO-TIL05 (row T4 of the tileset plan) · the flow of LOD on a profile
//      (`flowForHardware`): the bands (mobile 10k, web 50k triangles per object)
//      sit under every version EM Tools prepares — OB_PODIO of Templu Mare's
//      Survey2015: whole 448 723 (aton, heriverse), lod1 224 317 (realtime,
//      web), lod2 112 067 (mobile_ar). Before: no version in the band → ALL of
//      them, and the distance took the whole model on a phone.
{
  const podio = [
    { id: "m", master: true, use: [] },
    { id: "w0", use: ["aton", "heriverse"], primitives: { triangles: 448723 }, size_bytes: 16467782 },
    { id: "w1", use: ["realtime", "web"], primitives: { triangles: 224317 }, size_bytes: 2380884 },
    { id: "w2", use: ["mobile_ar"], primitives: { triangles: 112067 }, size_bytes: 894028 },
  ];
  const ids = (r) => [r.entries.map((e) => e.id).sort(), r.noLight];
  eq(ids(M.flowForHardware(podio, "mobile")), [["w2"], false], "mobile: up to the mobile_ar version, never the whole");
  eq(ids(M.flowForHardware(podio, "web")), [["w1", "w2"], false], "web: up to the lightest made for webXR (realtime-web), and the lighter ones");
  eq(ids(M.flowForHardware(podio, "desktop")), [["w0", "w1", "w2"], false], "desktop: every version, as before");
  // nothing made for the profile, nothing in the band: the lightest and the lighter, said
  const noMobile = podio.filter((e) => e.id !== "w2");
  eq(ids(M.flowForHardware(noMobile, "mobile")), [["w1"], true], "mobile, no mobile version: the lightest only, and «no light version»");
  // a version within the band: the band decides, as before
  const small = [...podio, { id: "w3", use: [], primitives: { triangles: 8000 }, size_bytes: 90000 }];
  eq(ids(M.flowForHardware(small, "mobile")), [["w3"], false], "mobile, a version within 10k: that one");
  eq(ids(M.flowForHardware(small, "web")), [["w3"], false], "web, a version within 50k: that one");
  // heavy ones never in the band; triangles unknown → the bytes decide the ceiling
  eq(ids(M.flowForHardware([{ id: "a", use: ["mobile_ar"], size_bytes: 500 }, { id: "b", use: [], size_bytes: 300 }], "mobile")),
     [["a", "b"], false], "triangles unknown: the band cannot judge them, they stay (as before)");
  eq(ids(M.flowForHardware([{ id: "a", use: ["mobile_ar"], size_bytes: 500 }, { id: "b", use: [], primitives: { triangles: 60000 }, size_bytes: 300 },
    { id: "c", use: [], primitives: { triangles: 90000 }, size_bytes: 900 }], "mobile", (e) => e.id === "a")),
     [["a", "b"], false], "the mobile version heavy and without triangles: its bytes are the ceiling");
  eq(ids(M.flowForHardware([{ id: "s", use: [], primitives: { triangles: 5000 }, size_bytes: 10 }, { id: "t", use: ["mobile_ar"], primitives: { triangles: 60000 } }], "mobile", (e) => e.id === "s")),
     [["s", "t"], false], "a heavy version is never «in the band»; it stays when lighter than the mobile version");
  eq(ids(M.flowForHardware([podio[0]], "mobile")), [[], false], "only the master: nothing in the flow");
  assert.throws(() => M.flowForHardware(podio, "tablet")); n++;
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
