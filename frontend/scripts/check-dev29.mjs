// VLONG-DEV29 · part B (EMStudio): what Cowork saw on the Segni records on the
// night of 1 Oct 2026 (`_datasets/SegniSanPietro/_lavoro-claude/UX_EMSTUDIO.md`),
// one case per promise of the pure modules. The same promises on the real
// canvas are the `V*` cases of `check-interactions.mjs`.
//
//   node scripts/check-dev29.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export { issues } from "./issues";
      export { ancestorsOf, isStratigraphicType } from "./rules";
      export { DocumentStore } from "./model";
      export { setLocale, t } from "./i18n";
    `,
    resolveDir: SRC, loader: "ts",
  },
  bundle: true, format: "esm", write: false,
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
    },
  }],
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const { issues, ancestorsOf, isStratigraphicType } = M;
const tt = (k, v) => `${k}${v ? JSON.stringify(v) : ""}`;
const doc = (nodes, edges = []) => ({ header: {}, graph: { id: "g", nodes, edges } });

// ── A9b · a continuity node has no property to document ─────────────────────
{
  const d = doc([
    { id: "u1", node_type: "US", name: "US1" },
    { id: "br1", node_type: "BR", name: "continuity_node" },
    { id: "br2", node_type: "BR", name: "continuity_node" },
  ]);
  const iss = issues({ doc: d, nodes: d.graph.nodes, isUnit: isStratigraphicType, t: tt,
    namedByConstruction: (nt) => ancestorsOf(nt).includes("ContinuityNode") });
  const para = iss.filter((i) => i.rule === "paradata").map((i) => i.node);
  eq(para, ["u1"], "A9b · «no documented property» for the US, never for a continuity node");
}

if (fails.length) {
  console.error(`dev29: ${fails.length} of ${checks} checks FAILED:\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`dev29: ${checks} checks passed`);
