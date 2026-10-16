// MICRO-SPAZIO-3D-3 p.13 · the DTC's short labels — pure (`src/dtc-labels.ts`), on the names of v3.2:
//   node scripts/check-dtc-labels.mjs [em.json]
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ stdin: { contents: `export * as D from "./dtc-labels";`, resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false });
const { D } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ten = [
  ["LOD generation lod0 of Architrave_1_BAKE_SM_Architrave_1_BAKE — reconstruction model, master (GreatTemple_2026_v2.blend)", "LOD0 · Architrave_1"],
  ["LOD generation lod1 of Architrave_1_BAKE_SM_Architrave_1_BAKE — reconstruction model, master (GreatTemple_2026_v2.blend) lod0", "LOD1 · Architrave_1"],
  ["LOD generation lod0 of OB_EST_L — surveyed mesh, master (TempluMare_2021.blend)", "LOD0 · EST_L"],
  ["LOD generation lod1 of OB_EST_L LOD0 (OBJ)", "LOD1 · EST_L"],
  ["LOD generation lod4 of OB_EST_L — surveyed mesh, master (TempluMare_2021.blend) lod3", "LOD4 · EST_L"],
  ["LOD generation lod0 of Porta2_BAKE_SM_Porta2_BAKE — reconstruction model, master (GreatTemple_2026_v2.blend)", "LOD0 · Porta2"],
  ["LOD generation lod0 of Tempio_4_BAKE.001_SM_Tempio_4_BAKE.001 — reconstruction model, master (GreatTemple_2026_v2.blend)", "LOD0 · Tempio_4.001"],
  ["LOD generation lod1 of Column_shadow16 — reconstruction model, master (GreatTemple_2026_v2.blend) lod0", "LOD1 · Column_shadow16"],
  ["LOD generation lod3 of OB_INT_bk LOD2 (OBJ)", "LOD3 · INT_bk"],
  ["LOD generation lod2 of OB_PODIO LOD1 (OBJ)", "LOD2 · PODIO"],
];
for (const [a, b] of ten) eq(D.shortStepLabel(a), b, `«${a.slice(0, 50)}…»`);
eq(D.shortStepLabel("Viste ortometriche di TM018 in Blender"), null, "a name a person gave: not the tools'");
eq(D.stepBoxLabel("Impaginazione della tavola TM018 in Inkscape"), "Impaginazione del…n Inkscape", "…cut in the middle when long");
eq(D.middleCut("Architrave_1_BAKE_SM_Architrave_1_lod0", 20), "Architrave_1…_1_lod0", "the middle cut keeps the end («…lod0»)");
const F = process.argv[2] ?? "/tmp/spazio3/templu-mare/EM/TempluMare_v3.2.em.json.orig";
if (existsSync(F)) {
  const d = JSON.parse(readFileSync(F, "utf8")); const g = d.graph ?? Object.values(d.graphs)[0];
  const procs = g.nodes.filter((n) => n.node_type === "dtc_process");
  const short = procs.map((n) => D.shortStepLabel(n.name)).filter(Boolean);
  const longest = Math.max(...procs.map((n) => D.stepBoxLabel(n.name).length));
  console.log(`  v3.2: ${procs.length} steps, ${short.length} with a short label; the longest box label ${longest} characters (before: ${Math.max(...procs.map((n) => n.name.length))})`);
  eq(short.length, 230, "v3.2: the 230 LOD steps have a short label");
}
console.log(`check-dtc-labels: ${checks} checks passed`);
