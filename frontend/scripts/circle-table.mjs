// The circle of every edge type of the datamodel, as JSON on stdout — the table
// of the MICRO-PROPRIETA-COMPATTA report (before/after a change of `edgeCircle`).
//
//   node scripts/circle-table.mjs [path/to/src/]
import * as esbuild from "esbuild";

const SRC = process.argv[2] ?? new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({
  stdin: { contents: `export * from "./filters"; export * as R from "./rules";`, resolveDir: SRC, loader: "ts" },
  bundle: true,
  format: "esm",
  write: false,
});
const F = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
const out = {};
for (const t of F.R.edgeTypeNames()) out[t] = F.edgeCircle(t);
console.log(JSON.stringify(out, null, 1));
