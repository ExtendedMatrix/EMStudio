// NIGHT-RISORSA-FILE · parte 2 · executable check of the handle and the
// declared parent (`src/declared.ts`).
//
//   node scripts/check-declared.mjs
//
// The members of a file set are asked of the REAL dtcstamp
// (`follow_references`, the function the bridge's /stamp/members calls), on a
// copy of the TempluMare base (`TEMPLU_TILES`, by default the night's report
// copy); those cases are skipped, and say so, when the copy is not there.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./declared";
    export { plainGraph, storeGraph, resourceFiles, addResource } from "./resources";
    export { DocumentStore } from "./model";
    export { buildDtcScene } from "./views/dtc";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const D = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

// ── {name} / {base} ─────────────────────────────────────────────────────────
eq([D.stemOf("OB_PODIO_LOD1.obj"), D.baseOf("OB_PODIO_LOD1"), D.baseOf("muro")], ["OB_PODIO_LOD1", "OB_PODIO", "muro"],
  "{name} is the stem, {base} the stem without _LOD<n> (the LOD-set convention)");
const CHAIN = [
  { parents: [{ kind: "datablock", label: "", blend_file: "RB/TempluMare_2021.blend", datablock: "{name}" }] },
  { technique: "LODgenerator 3DSC", dtc_kind: "decimation",
    parents: [{ kind: "datablock", label: "", blend_file: "RB/TempluMare_2021.blend", datablock: "{base}_LOD0" }] },
  { technique: "3DSC4Metashape", dtc_kind: "photogrammetry",
    parents: [{ kind: "datablock", label: "tile segmentata {base}", blend_file: "RB/TempluMare_2021.blend", datablock: "{base}" },
              { kind: "sources", label: "foto TempluMare (Metashape)" }] },
];
const one = D.instantiateChain(CHAIN, "OB_PODIO_LOD1");
eq(one[0].parents[0].datablock, "OB_PODIO_LOD1", "the chain for OB_PODIO_LOD1: its object in the .blend");
eq(one[1].parents[0].datablock, "OB_PODIO_LOD0", "…made from OB_PODIO_LOD0 by the LODgenerator");
eq(one[2].parents.map(D.parentLabel), ["tile segmentata OB_PODIO", "foto TempluMare (Metashape)"],
  "…and the parents of LOD0: the segmented tile and the photographs");
ok(D.chainIsTemplate(CHAIN) && !D.chainIsTemplate(one), "a chain says whether it has a {name}/{base} to fill");
eq(D.declaredId(D.instantiateChain(CHAIN, "OB_PODIO_LOD1")[2].parents[1]),
   D.declaredId(D.instantiateChain(CHAIN, "OB_PRATO_LOD1")[2].parents[1]),
   "the photographs are ONE node for every tile (no placeholder in them)");
ok(D.declaredId(one[0].parents[0]) !== D.declaredId(D.instantiateChain(CHAIN, "OB_PRATO_LOD1")[0].parents[0]),
   "…and each tile's object in the .blend is its own");

// ── the handle, on the real files ───────────────────────────────────────────
const TILES_DIR = process.env.TEMPLU_TILES ?? new URL(
  "../../.claude/wip/reports/2026-10-22-risorsa-file/fs/base/RM/TempluMare_tiles", import.meta.url).pathname;
const DTCSTAMP = process.env.DTCSTAMP ?? new URL("../../../dtcstamp", import.meta.url).pathname;
function follow(paths) {
  const out = execFileSync("python3", ["-c", `
import json, sys, dtcstamp
res = {}
for p in json.loads(sys.argv[1]):
    f = dtcstamp.follow_references(p)
    res[p] = {"members": f["members"], "digest": dtcstamp.members_digest(f["members"]),
              "warnings": f["warnings"], "missing": f["missing"], "outside": f["outside"]}
print(json.dumps(res))`, JSON.stringify(paths)], { env: { ...process.env, PYTHONPATH: DTCSTAMP } });
  return new Map(Object.entries(JSON.parse(out.toString())));
}
if (existsSync(`${TILES_DIR}/LOD0/OB_PODIO_LOD0.obj`)) {
  const lod0 = `${TILES_DIR}/LOD0/OB_PODIO_LOD0.obj`;
  const s0 = follow([lod0]).get(lod0);
  eq(s0.members.length, 6, "the obj of LOD0 is ONE resource of 6 files (obj, mtl, 4 Metashape textures)");
  eq(s0.members.filter((m) => m.role === "entry_point").map((m) => m.path), ["OB_PODIO_LOD0.obj"], "…its door is the obj");
  // the folder LOD1: every file at its top level, as «Timbra la cartella» picks them
  const lod1 = `${TILES_DIR}/LOD1`;
  const top = readdirSync(lod1).filter((n) => /\.(obj|mtl)$/.test(n)).sort()
    .map((n) => ({ path: `${lod1}/${n}`, name: n, size: 0 }));
  const sets = follow(top.filter((f) => f.name.endsWith(".obj")).map((f) => f.path));
  const { resources, absorbed } = D.bundleOutputs(top, sets);
  eq([top.length, resources.length, absorbed.length], [22, 11, 11],
    "the folder LOD1/: 22 files picked, 11 resources, the 11 mtl absorbed by their obj");
  ok(resources.every((r) => r.set?.members.length === 3), "…each of 3 files (obj, mtl, texture)");
  const unclaimed = readdirSync(`${lod1}/textures`).filter((n) =>
    ![...sets.values()].some((s) => s.members.some((m) => m.path === `textures/${n}`)));
  eq(unclaimed.sort(), ["cc_T_OB_INT_R_LOD1.png", "cc_T_OB_PODIO_LOD1.png"],
    "…and the two textures nobody calls stay out (the base's README says so)");
  // «N uscite» stays possible: without the sets, 22 outputs
  eq(D.bundleOutputs(top, new Map()).resources.length, 22, "«N uscite»: without the handle, 22 outputs");
} else {
  console.log(`  (skipped: the TempluMare copy is not at ${TILES_DIR})`);
}

// ── the declared chain, landed in the corpus, saved and reopened ────────────
{
  const corpus = new D.DocumentStore({ header: { format: "em.json", version: "1.0" },
    graph: { graph_id: "dtc", nodes: [], edges: [], data: { em_collection: "DTCCorpus" } } });
  const g = D.storeGraph(corpus);
  const members = [
    { role: "entry_point", path: "OB_PODIO_LOD1.obj", digest: "sha256:" + "1".repeat(64), size_bytes: 10 },
    { role: "member", path: "OB_PODIO_LOD1.mtl", digest: "sha256:" + "2".repeat(64), size_bytes: 2 },
    { role: "member", path: "textures/T_OB_PODIO_LOD1.jpg", digest: "sha256:" + "3".repeat(64), size_bytes: 5 }];
  const depth = corpus.undoDepth;
  const touched = D.landStep(g, { processId: "p-export", dtcKind: "format_conversion",
    technique: "Export OBJ (3DSC)", levels: one,
    outputs: [{ resourceId: "res:podio1", name: "OB_PODIO_LOD1", members, digest: "sha256:" + "9".repeat(64) }] });
  eq(corpus.undoDepth - depth, 1, "landing a step is ONE undo step");
  ok(touched.length >= 6, "…it touches the output, the act and the declared parents");
  const again = new D.DocumentStore(JSON.parse(corpus.toJSON()));
  const g2 = D.storeGraph(again);
  eq(D.resourceFiles(g2, "res:podio1").length, 3, "saved and reopened: the tile is still one resource of 3 files");
  const blend = again.doc.graph.nodes.find((n) => n.name === "OB_PODIO_LOD1" && D.isDeclaredOnly(n));
  eq(blend?.data?.url, "blend://RB/TempluMare_2021.blend#Object/OB_PODIO_LOD1",
    "the parent: the datablock, with its blend:// locator");
  eq([blend?.data?.packaging, blend?.data?.tier], ["datablock", "master"], "…packaging datablock, tier master");
  const sc = D.buildDtcScene(again.liveNodes(), again.liveEdges());
  const names = sc.nodes.map((n) => n.node.name);
  for (const want of ["OB_PODIO_LOD1", "Export OBJ (3DSC)", "LODgenerator 3DSC", "OB_PODIO_LOD0",
    "3DSC4Metashape", "tile segmentata OB_PODIO", "foto TempluMare (Metashape)"])
    ok(names.includes(want), `the DTC shows the chain up to the photographs: ${want}`);
  const rank = (name) => sc.nodes.find((n) => n.node.name === name && (name !== "OB_PODIO_LOD1" || !D.isDeclaredOnly(n.node)))?.y;
  ok(rank("foto TempluMare (Metashape)") < rank("OB_PODIO_LOD0") && rank("OB_PODIO_LOD0") < rank("Export OBJ (3DSC)"),
    "…and it reads DOWN: the photographs above LOD0, LOD0 above the export (invariant 3)");
  // a second tile shares the photographs
  D.landStep(D.storeGraph(again), { processId: "p-export-prato", dtcKind: "format_conversion",
    technique: "Export OBJ (3DSC)", levels: D.instantiateChain(CHAIN, "OB_PRATO_LOD1"),
    outputs: [{ resourceId: "res:prato1", name: "OB_PRATO_LOD1", members }] });
  eq(again.doc.graph.nodes.filter((n) => n.name === "foto TempluMare (Metashape)").length, 1,
    "a second tile declares the same photographs: one node, two consumers");
}

if (fails.length) {
  console.error(fails.map((f) => `  ✗ ${f}`).join("\n"));
  console.error(`declared: ${fails.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`declared: ${checks} checks passed`);
