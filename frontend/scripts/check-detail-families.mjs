// MICRO-FILTRI-DETTAGLIATI · the families of the «Detail level» panel.
//
//   node scripts/check-detail-families.mjs            (GT16=path/to/TempluMare_v4.em.json for its table)
//
// The grouping is a table (detail-families.ts); everything else is the
// datamodel's. This fails when the datamodel has a node class or an edge type
// the table does not place, when the table names one the datamodel does not
// have, when a structural type would become switchable, when the Matrix's
// defaults or one of the four old templates hide something else than the eleven
// rings did (frozen in testdata/detail-rings-70c8699.json, measured on the
// commit before the families), and when a document's counts do not add up.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({
  stdin: {
    contents: `export * from "./filters"; export * as R from "./rules"; export * as D from "./detail-families";
      export { MEMBERSHIP_EDGES } from "./folding"; export { t, setLocale } from "./i18n";`,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true, format: "esm", write: false, logLevel: "error",
});
const F = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
const { R, D } = F;
// setLocale writes `lang`/`dir` on <html> and re-translates the static markup
globalThis.document ??= { documentElement: { setAttribute() {}, lang: "", dir: "" }, querySelectorAll: () => [], querySelector: () => null };

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const nodeTypes = R.typesOfClass("Node");
const edgeTypes = [...R.edgeTypeNames(), R.GENERIC_EDGE];

// ── 1 · every type of the datamodel is placed, and only types it has ──────────
{
  const orphanNodes = nodeTypes.filter((t) => t !== "Node" && F.nodeFamilyOf(t) === "other");
  eq(orphanNodes, [], "every node type of the datamodel has a family (none falls in «Other»)");
  const classes = new Set(nodeTypes.map((t) => R.classOf(t)));
  for (const f of D.NODE_FAMILY_TABLE)
    for (const c of f.classes)
      ok(classes.has(c) || R.typesOfClass(c).length > 0 || R.classAncestorsOf(c).length > 1,
        `the table's class ${c} exists in the datamodel`);
  const named = D.EDGE_FAMILY_TABLE.flatMap((f) => f.edges);
  eq(named.filter((e, i) => named.indexOf(e) !== i), [], "no edge type is named twice in the table");
  eq(named.filter((e) => !edgeTypes.includes(e)), [], "the table names no edge type the datamodel does not have");
  eq(edgeTypes.filter((e) => !named.includes(e)), [], "every edge type of the datamodel is named in the table");
  eq(F.EDGE_FAMILIES.find((f) => f.key === "other").types, [], "«Other edges» holds no datamodel type");
  // the families as listed hold every type exactly once
  const listedN = F.NODE_FAMILIES.flatMap((f) => f.types);
  eq([...listedN].sort(), [...nodeTypes].sort(), "the node families list every node type once");
  const listedE = F.EDGE_FAMILIES.flatMap((f) => f.types);
  eq([...listedE].sort(), [...edgeTypes].sort(), "the edge families list every edge type once");
}

// ── 2 · what is structure stays structure ────────────────────────────────────
{
  const structuralE = edgeTypes.filter((e) => F.edgeLeaf(e) === null).sort();
  eq(structuralE, [...F.MEMBERSHIP_EDGES].sort(), "the structural edges are exactly the containers' membership edges");
  const structuralN = nodeTypes.filter((t) => F.nodeLeaf(t) === null).sort();
  const want = nodeTypes.filter((t) => (R.isGroupType(t) && R.classOf(t) !== "ParadataNodeGroup") || R.classOf(t) === "EpochNode").sort();
  eq(structuralN, want, "the structural nodes are the group boxes (a paradata group excepted) and the epochs");
}

// ── 3 · stratigraphic and temporal are two families ──────────────────────────
{
  const strat = F.EDGE_FAMILIES.find((f) => f.key === "stratigraphic").types;
  const temp = F.EDGE_FAMILIES.find((f) => f.key === "temporal").types;
  eq(strat.filter((e) => temp.includes(e)), [], "no edge is both stratigraphic and temporal");
  for (const e of ["is_after", "cuts", "fills", "overlies", "abuts", "bonded_to", "is_bonded_to", "equals", "is_physically_equal_to"])
    eq(F.edgeFamilyOf(e), "stratigraphic", `${e} is stratigraphic`);
  for (const e of ["has_first_epoch", "survive_in_epoch", "has_sub_epoch", "has_same_time", "changed_from"])
    eq(F.edgeFamilyOf(e), "temporal", `${e} is temporal`);
  // a spelling reads as what it spells; an unknown name is «Other», with the wildcard leaf
  eq(F.edgeFamilyOf("not_an_edge"), "other", "an edge type the datamodel does not know is «Other»");
  eq(F.edgeLeaf("not_an_edge"), F.UNKNOWN_EDGE_LEAF, "…switched by the wildcard leaf");
  eq(F.nodeFamilyOf("not_a_type"), "other", "a node type the datamodel does not know is «Other»");
  eq(F.nodeLeaf("not_a_type"), F.UNKNOWN_NODE_LEAF, "…switched by the wildcard leaf");
  for (const [t, f] of [["US", "units_real"], ["USVs", "units_virtual"], ["USD", "units_virtual"], ["SF", "special_finds"],
    ["VSF", "special_finds"], ["serVSF", "special_finds"], ["RSF", "special_finds"], ["BR", "continuity"], ["EpochNode", "epochs"],
    ["document", "documents"], ["extractor", "extractors"], ["combiner", "combiners"], ["property", "properties"],
    ["ParadataNodeGroup", "groups"], ["representation_model", "models"], ["semantic_shape", "models"], ["resource", "resources"],
    ["geo_position", "georef"], ["author", "rights"], ["dtc_process", "dtc"], ["narrative", "narrative"], ["study", "hdto"]])
    eq(F.nodeFamilyOf(t), f, `${t} is in ${f}`);
}

// ── 4 · the defaults and the old templates hide what the rings hid ────────────
{
  const frozen = JSON.parse(readFileSync(new URL("../testdata/detail-rings-70c8699.json", import.meta.url), "utf8"));
  // the frozen lists know the datamodel of their day: compare on its types
  const dmN = new Set([...frozen.matrix.n, ...nodeTypes]);
  const hidden = (vis) => ({
    n: nodeTypes.filter((t) => { const l = F.nodeLeaf(t); return l && !vis.has(l); }).sort(),
    e: edgeTypes.filter((t) => { const l = F.edgeLeaf(t); return l && !vis.has(l); }).sort(),
  });
  ok(dmN.size >= nodeTypes.length, "frozen snapshot read");
  eq(hidden(F.defaultVisibleLeaves("matrix")), frozen.matrix, "the Matrix's defaults hide what its rings hid");
  for (const v of ["graph", "dtc", "multigraph", "graphs"])
    eq(hidden(F.defaultVisibleLeaves(v)), { n: [], e: [] }, `the ${v} view shows every type by default`);
  for (const k of ["full", "harris", "em-compact", "em-complete"])
    eq(hidden(F.TEMPLATES.find((x) => x.key === k).leaves), frozen[k], `the template «${k}» hides what it hid`);
  const so = F.TEMPLATES.find((x) => x.key === "strat-only").leaves;
  const co = F.TEMPLATES.find((x) => x.key === "chrono-only").leaves;
  ok(so.has("e:is_after") && so.has("n:US") && so.has("n:SF") && so.has("n:BR"), "«Stratigraphy only»: units and the sequence");
  ok(![...so].some((l) => l.startsWith("e:") && F.edgeFamilyOf(l.slice(2)) !== "stratigraphic"), "…and no other edge");
  ok(co.has("e:has_first_epoch") && co.has("e:has_same_time") && co.has("n:US"), "«Chronology only»: units and the time's edges");
  ok(![...co].some((l) => l.startsWith("e:") && F.edgeFamilyOf(l.slice(2)) !== "temporal"), "…and no other edge");
}

// ── 5 · labels in the interface's language ───────────────────────────────────
{
  for (const loc of ["en", "it"]) {
    F.setLocale(loc);
    for (const f of [...F.NODE_FAMILIES, ...F.EDGE_FAMILIES]) ok(F.t(f.label) !== f.label, `${loc}: ${f.label} has a label`);
    for (const tp of F.TEMPLATES) ok(F.t(tp.label) !== tp.label, `${loc}: ${tp.label} has a label`);
  }
  F.setLocale("it");
  eq(R.edgeLabel("is_after"), "È posteriore a", "an edge type's label is the datamodel's, in the interface's language");
  F.setLocale("en");
}

// ── 6 · a document's counts add up: family → types, nothing orphan ───────────
const table = (path, strict) => {
  const d = JSON.parse(readFileSync(path, "utf8"));
  const g = d.graphs ? d.graphs[d.active_graph_id] : d.graph;
  const sum = (items, typeOf, fams, famOf) => {
    let s = 0;
    for (const f of fams) s += items.filter((x) => famOf(typeOf(x)) === f.key).length;
    return s;
  };
  const n = sum(g.nodes, (x) => x.node_type, F.NODE_FAMILIES, F.nodeFamilyOf);
  const e = sum(g.edges, (x) => x.edge_type ?? "", F.EDGE_FAMILIES, F.edgeFamilyOf);
  eq([n, e], [g.nodes.length, g.edges.length], `${path.split("/").pop()}: the families' counts add up to the totals`);
  const orphanN = [...new Set(g.nodes.map((x) => x.node_type))].filter((t) => F.nodeFamilyOf(t) === "other");
  const orphanE = [...new Set(g.edges.map((x) => x.edge_type ?? ""))].filter((t) => F.edgeFamilyOf(t) === "other");
  if (strict) eq([orphanN, orphanE], [[], []], `${path.split("/").pop()}: no type falls in «Other»`);
  // a type the datamodel does not know (the fixture's legacy «link») is «Other», by the wildcard
  for (const t of orphanN) eq(F.nodeLeaf(t), R.typesOfClass("Node").includes(t) ? `n:${t}` : F.UNKNOWN_NODE_LEAF, `${t} is switched in «Other»`);
  return { nodes: g.nodes.length, edges: g.edges.length, orphanN };
};
const fx = table(new URL("../testdata/TempluMare.em.json", import.meta.url).pathname, false);
eq(fx.orphanN, ["link"], "the fixture's only type outside the datamodel is its legacy «link»");
const GT16 = process.env.GT16;
let gt = null;
if (GT16 && existsSync(GT16)) {
  gt = table(GT16, true);
  eq([gt.nodes, gt.edges], [2059, 4048], "the GT16: 2059 nodes, 4048 edges");
}
console.log(`detail-families: ${checks} checks passed (fixture ${fx.nodes}/${fx.edges}${gt ? `, GT16 ${gt.nodes}/${gt.edges}` : ", GT16 not given"})`);
