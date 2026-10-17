// THE ALTERNATIVES OF A 3D OBJECT — the common hat (E.D. 17 Oct 2026): the same
// rule as s3Dgraphy's `resources.alternatives` and Heriverse's copy.
//
//   node scripts/check-alternatives.mjs [em.json]
//
// 1 · s3Dgraphy's cases (`alternative_cases.json`, vendored in src/assets/; the
//     vendored copy must be the library's when the checkout is beside) through
//     `alternatives.ts`, with the rule of the vendored `em_visual_rules.json`;
// 2 · the writes (`planDeclareAlternative`, `planSubcontainer`) give
//     s3Dgraphy's ids;
// 3 · Templu Mare v3.2 (a copy, read only): 99 sets, fidelity 99, lod 98,
//     packaging 0, no container, no warning — the numbers of s3Dgraphy.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ stdin: { contents: `export * as A from "./alternatives";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false });
const { A } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let n = 0;
const eq = (g, e, w) => { assert.deepEqual(g, e, `${w} — got ${JSON.stringify(g)}`); n++; };

const rules = JSON.parse(readFileSync(new URL("../src/assets/em_visual_rules.json", import.meta.url), "utf8"));
const rule = rules.alternatives;
assert.ok(rule, "em_visual_rules.json has the alternatives block (s3Dgraphy 1.6.37)");
const VENDOR = new URL("../src/assets/alternative_cases.json", import.meta.url).pathname;
const S3D = new URL("../../../s3Dgraphy/src/s3dgraphy/JSON_config/alternative_cases.json", import.meta.url).pathname;
if (existsSync(S3D)) eq(readFileSync(VENDOR, "utf8"), readFileSync(S3D, "utf8"), "the vendored cases are s3Dgraphy's");
const table = JSON.parse(readFileSync(VENDOR, "utf8"));
const asEm = (g) => ({ nodes: g.nodes, edges: g.edges.map((e) => ({ ...e })) });
for (const c of table.cases) {
  const g = asEm(c.graph);
  const res = A.alternativeSets(g, rule);
  const sets = [...A.iterSets(res.sets)].map((s) => ({ hat: s.hat, hat_kind: s.hat_kind, parent: s.parent,
    alternatives: s.alternatives.map((x) => [x.id, x.reason]), reasons: s.reasons, covers: s.covers, coverage: s.coverage }));
  eq(sets, c.expect.sets, `${c.name}: the sets`);
  eq(res.warnings.map((w) => w.code).sort(), c.expect.warnings, `${c.name}: the warnings`);
  eq(res.counts, c.expect.counts, `${c.name}: the counts`);
  for (const ch of c.choices) {
    const got = A.chooseAlternative(A.findSet(res, ch.hat), ch.use, null, ch.force ?? null);
    const want = { level: got.level, id: got.entry ? got.entry.id : null, use: got.use };
    if (got.members) want.members = Object.fromEntries(Object.entries(got.members).map(([h, m]) => [h, m && m.entry ? m.entry.id : null]));
    eq(want, ch.expect, `${c.name}: ${ch.hat} ${JSON.stringify(ch.use)}${ch.force ? ` (${ch.force})` : ""}`);
  }
}

// 2 · the writes
{
  const c = table.cases.find((x) => x.name.startsWith("a tileset member"));
  const g = asEm(c.graph);
  const plan = A.planDeclareAlternative(g, "XX_tileset_model", "survey_rmgroup", rule);
  eq(plan.addEdges, [{ id: "survey_rmgroup_has_linked_resource_tiles.master", source: "survey_rmgroup", target: "tiles.master", type: "has_linked_resource" }], "declare: the container hats the asset, s3Dgraphy's id");
  eq(plan.removedHats, ["XX_tileset_model"], "declare: the RM loses its hat");
  eq(plan.removeNodes, ["XX_tileset_model"], "declare: the RM left without resources goes");
  // applied: the container's set has the tileset, its reason packaging
  const after = { nodes: g.nodes.filter((x) => !plan.removeNodes.includes(x.id)),
    edges: g.edges.filter((e) => !plan.removeEdges.includes(e.id) && !plan.removeNodes.includes(e.source) && !plan.removeNodes.includes(e.target))
      .concat(plan.addEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, edge_type: e.type }))) };
  const s = A.findSet(A.alternativeSets(after, rule), "survey_rmgroup");
  eq(s.alternatives.map((x) => [x.id, x.reason]), [["tiles.master", "packaging"], ["tiles.lod0", "packaging"]], "declared: the container's own alternative");
  const sub = A.planSubcontainer(after, "survey_rmgroup", ["EST_0_model", "EST_1_model", "nobody"], "Survey · west", rule);
  eq(sub.groupId, "rmgroup_Survey___west", "sub-container: EM Tools' id from the label");
  eq(sub.addEdges.map((e) => e.id), ["rmgroup_Survey___west_is_in_representation_model_group_survey_rmgroup",
    "EST_0_model_is_in_representation_model_group_rmgroup_Survey___west", "EST_1_model_is_in_representation_model_group_rmgroup_Survey___west"], "sub-container: in the parent, the covered moved");
  eq(sub.warnings.length, 1, "sub-container: a member not in the container is said");
  // the coverage on the boxes of the scene
  const boxes = new Map([0, 1, 2, 3].map((i) => [`EST_${i}_model`, [[i * 10, 0, 0], [i * 10 + 10, 10, 10]]]));
  boxes.set("tiles.lod0", [[0, 0, 0], [20, 10, 10]]);
  const part = A.alternativeSets(after, rule, boxes);
  eq(A.findSet(part, "survey_rmgroup").coverage, "partial", "coverage: 2 of 4 boxes, partial");
  eq(part.warnings.map((w) => [w.code, w.ids]), [["partial_coverage", ["EST_0_model", "EST_1_model"]]], "coverage: the covered models named");
  // larger than the container: every model inside, the box much bigger — MORE, not a part
  boxes.set("tiles.lod0", [[-20, -10, -5], [60, 30, 20]]);
  const more = A.alternativeSets(after, rule, boxes);
  eq(A.findSet(more, "survey_rmgroup").coverage, "more", "coverage: a tileset larger than its container covers more");
  eq(A.measureCoverage([[0, 0, 0], [40, 10, 10]], new Map([0, 1, 2, 3].map((i) => [`m${i}`, [[i * 10, 0, 0], [i * 10 + 10, 10, 10]]]))).coverage, "whole", "coverage: the same box, whole");
}

// 3 · Templu Mare
const F = process.argv[2] ?? "/tmp/alt17/v32.em.json";
if (existsSync(F)) {
  const d = JSON.parse(readFileSync(F, "utf8"));
  const gr = d.graph ?? Object.values(d.graphs).find((x) => x.nodes.length > 100);
  const t0 = performance.now();
  const res = A.alternativeSets(gr, rule);
  const ms = performance.now() - t0;
  eq(res.counts, { sets: 99, with_alternatives: 99, containers: 0, by_reason: { lod: 98, fidelity: 99, packaging: 0 }, entries: 329 }, "Templu Mare v3.2: the numbers of s3Dgraphy");
  eq(res.warnings, [], "Templu Mare v3.2: no warning");
  console.log(`  Templu Mare v3.2: alternativeSets in ${ms.toFixed(0)} ms`);
}
console.log(`check-alternatives: ${n} checks passed`);
