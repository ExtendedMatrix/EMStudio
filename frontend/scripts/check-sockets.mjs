// SOCKETS · the datamodel check of an edge follows the CLASS HIERARCHY.
//
//   node scripts/check-sockets.mjs
//
// Enzo Cocca (s3Dgraphy#25, 7 Oct 2026) saw «Extractor402 → US29: extracted_from
// is not allowed towards a US» in 1.6.0-dev.26. The connections datamodel
// (1.6.24 and later) declares `extracted_from` from an ExtractorNode (or a
// TranslationNode) to a DocumentNode, an AnnotationRegionNode or ANY
// StratigraphicNode, so a US, a USVs, a USVn are all legal targets. Measured on
// 9 Oct 2026: `allowedEdgeTypes` resolves both ends through `ancestorsOf`
// (runtime node_type → class → parent chain), and on the demo em.json Enzo
// attached to #25 (two extractors, four `extracted_from`: towards a US, a USVs,
// two documents) neither dev.26 nor this tree raises the warning. What is pinned
// here, so it stays true: the edges of that file are allowed — by the rule and
// by the Warnings check fed exactly as main.ts feeds it — and an edge the
// datamodel does not allow is still refused. The cases are read off the
// vendored datamodel, not listed by hand: each target named is checked to sit
// under a class `extracted_from` declares.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const bundle = await esbuild.build({
    entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false,
  });
  return import("data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64"));
};
const R = await load("rules.ts");
const I = await load("issues.ts");
const conn = JSON.parse(readFileSync(`${SRC}assets/s3Dgraphy_connections_datamodel.json`, "utf8"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; console.log(`  ✓ ${what}`); };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; console.log(`  ✓ ${what}`); };

// main.ts's `edgeAllowed`, verbatim
const edgeAllowed = (et, st, dt) =>
  R.allowedEdgeTypes(st, dt).map(R.canonicalEdgeType).includes(R.canonicalEdgeType(et));

// ── the datamodel says what we think ────────────────────────────────────────
const ac = conn.edge_types.extracted_from.allowed_connections;
ok(ac.source.includes("ExtractorNode"), "extracted_from: an ExtractorNode is a source");
ok(ac.target.includes("StratigraphicNode") && ac.target.includes("DocumentNode"),
   "extracted_from: StratigraphicNode and DocumentNode are targets");

// ── the hierarchy is followed at both ends ──────────────────────────────────
for (const dt of ["US", "USVs", "USVn", "document"]) {
  const anc = R.ancestorsOf(dt);
  ok(anc.some((c) => ac.target.includes(c)), `${dt} sits under a declared target (${anc.join(" > ")})`);
  ok(edgeAllowed("extracted_from", "extractor", dt), `extractor → ${dt}: extracted_from allowed`);
}
// …and what the datamodel does not allow stays refused
ok(!edgeAllowed("extracted_from", "US", "document"), "US → document: extracted_from refused (a unit is not an extractor)");
ok(!edgeAllowed("extracted_from", "extractor", "EpochNode"), "extractor → epoch: extracted_from refused");
ok(!edgeAllowed("extracted_from", "Extractor", "US"), "an unknown node_type («Extractor») has no class: refused");

// ── the Warnings check, on the shape of Enzo's demo file ────────────────────
const issuesOf = (g) => I.issues({ doc: { graph: g }, nodes: g.nodes, isUnit: R.isStratigraphicType,
  edgeAllowed, t: (k, v) => `${k}${v ? JSON.stringify(v) : ""}` }).filter((i) => i.rule === "datamodel");
const demo = {
  nodes: [
    { id: "x402", node_type: "extractor", name: "1.Extractor402" },
    { id: "x400", node_type: "extractor", name: "1.Extractor400" },
    { id: "us29", node_type: "US", name: "1.US29" },
    { id: "usva106", node_type: "USVs", name: "1.USVA106" },
    { id: "doc4001", node_type: "document", name: "1.DOC4001" },
    { id: "doc4002", node_type: "document", name: "1.DOC4002" },
  ],
  edges: [
    { id: "e1", source: "x402", target: "us29", edge_type: "extracted_from" },
    { id: "e2", source: "x400", target: "usva106", edge_type: "extracted_from" },
    { id: "e3", source: "x400", target: "doc4001", edge_type: "extracted_from" },
    { id: "e4", source: "x400", target: "doc4002", edge_type: "extracted_from" },
  ],
};
eq(issuesOf(demo).length, 0, "Enzo's four extracted_from: no datamodel warning");
const wrong = { nodes: [...demo.nodes, { id: "ep", node_type: "EpochNode", name: "Epoch" }],
  edges: [...demo.edges, { id: "e5", source: "x402", target: "ep", edge_type: "extracted_from" }] };
const w = issuesOf(wrong);
eq(w.map((i) => i.node), ["x402"], "an extracted_from towards an epoch: one datamodel warning, on the extractor");

// ── the real file, when it is at hand (s3Dgraphy#25, gist of 9 Oct 2026) ───
const file = process.env.ENZO_DEMO;
if (file) {
  const d = JSON.parse(readFileSync(file, "utf8"));
  const g = d.graphs ? d.graphs[d.active_graph_id] : d.graph;
  const sock = issuesOf(g).filter((i) => i.txt.includes("extracted_from"));
  eq(sock.length, 0, `${file.split("/").pop()}: no extracted_from warning`);
}
console.log(`check-sockets: ${checks} checks passed`);
