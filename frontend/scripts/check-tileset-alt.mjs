// MICRO-SPAZIO-3D-3 p.12 · a tileset as the alternative of a container, computed from the DTC — pure
// (`src/tileset-alt.ts`):   node scripts/check-tileset-alt.mjs [em.json]
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ stdin: { contents: `export * as A from "./tileset-alt";`, resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false });
const { A } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const g = { nodes: [], edges: [
  { source: "T", target: "M1", edge_type: "dtc_derived_from" },
  { source: "P", target: "Tv", edge_type: "dtc_had_output" }, { source: "P", target: "M2", edge_type: "dtc_had_input" },
  { source: "T", target: "S", edge_type: "dtc_derived_from" }, { source: "M3", target: "S", edge_type: "dtc_derived_from" },
] };
eq(A.derivedFrom(g, ["T"], "M1"), true, "dtc_derived_from: derived");
eq(A.derivedFrom(g, ["T", "Tv"], "M2"), true, "a step with the input and the tileset's version as output: derived");
eq(A.derivedFrom(g, ["T"], "M3"), false, "two derived from one survey (siblings): NOT derived — no guess from the common ancestor");
const groups = [{ id: "G", members: [{ id: "r1", master: "M1" }, { id: "r2", master: "M2" }, { id: "r3", master: "M3" }] }];
eq(A.tilesetAlternatives(g, [{ id: "TS", outs: ["T", "Tv"] }], groups), [{ tileset: "TS", group: "G", covered: ["r1", "r2"], total: 3 }], "the alternative of a part: 2 of 3, said");
eq(A.tilesetAlternatives(g, [{ id: "TS", outs: ["X"] }], groups), [], "nothing derived: no alternative");
const F = process.argv[2] ?? "/tmp/spazio3/templu-mare/EM/TempluMare_v3.2.em.json.orig";
if (existsSync(F)) {
  const d = JSON.parse(readFileSync(F, "utf8")); const gr = d.graph ?? Object.values(d.graphs)[0];
  const master = "templu-mare.rb.tileset.master";
  const from = gr.edges.filter((e) => e.source === master && e.edge_type === "dtc_derived_from").map((e) => gr.nodes.find((n) => n.id === e.target)?.name);
  console.log(`  v3.2: XX_tileset's master derives from: ${JSON.stringify(from)}`);
  const est = gr.nodes.find((n) => n.name === "OB_EST_fr (surveyed mesh)");
  eq(A.derivedFrom(gr, [master], est.id), false, "v3.2: XX_tileset is not derived from the EST models' masters (both from the 2015 survey)");
}
console.log(`check-tileset-alt: ${checks} checks passed`);
