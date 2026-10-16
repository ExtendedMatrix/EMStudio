// MICRO-SPAZIO-3D-2 · p.1 · the implicit paradata group, computed in the view
// (`src/implicit-pd.ts`), on a small temple written here and on the studies
// given:
//
//   node scripts/check-implicit-pd.mjs [study.em.json …]
//
// · a unit with loose properties and no group gets an implicit one, closed,
//   with its properties and their chain (combiner, extractor), never the
//   document; a property of two owners and a declared heir are left alone;
// · a unit with a real group and loose ones: one group, the loose ones marked
//   «outside»;
// · the data is never touched;
// · the proxy of a loose `geometry` property gets a place (threed_instances on
//   the view's document): on Templu Mare v2, 65 of 65;
// · «Compatta» on a unit makes the group true and the view does not change
//   (same members, same badge count);
// · the time of the view's document on the study (it runs at every build).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `
    export * as I from "./implicit-pd";
    export * as C from "./compact";
    export * as V from "./paradata-view";
    export { DocumentStore } from "./model";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
  plugins: [{ name: "stub-icons", setup(build) {
    build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
  } }],
});
const { I, C, V, DocumentStore } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const N = (id, node_type, name, data = {}) => ({ id, node_type, name, data });
const E = (id, source, target, edge_type, attributes) => ({ id, source, target, edge_type, ...(attributes ? { attributes } : {}) });
const temple = { header: {}, graph: { graph_id: "t", name: "t", nodes: [
  N("US1", "US", "US1"), N("P1", "property", "material", { property_type: "material" }),
  N("C1", "combiner", "C.01"), N("X1", "extractor", "D.01.01"), N("D1", "document", "D.01"),
  N("P1g", "property", "geometry", { property_type: "geometry" }), N("S1", "semantic_shape", "US1 geometry"),
  N("R1", "resource", "US1.glb", { url: "proxies/US1.glb", url_type: "proxy_model" }),
  N("US2", "US", "US2"), N("PD2", "ParadataNodeGroup", "PD_US2"), N("P2a", "property", "height"), N("P2b", "property", "width"),
  N("US3", "US", "US3"), N("P3", "property", "shared"),
  N("US4", "US", "US4"), N("P4", "property", "inherited one"),
], edges: [
  E("h1", "US1", "P1", "has_property"), E("p1", "P1", "C1", "has_data_provenance"), E("c1", "C1", "X1", "combines"),
  E("x1", "X1", "D1", "extracted_from"),
  E("h1g", "US1", "P1g", "has_property"), E("s1", "P1g", "S1", "has_semantic_shape"), E("l1", "S1", "R1", "has_linked_resource"),
  E("g2", "US2", "PD2", "has_paradata_nodegroup"), E("h2a", "US2", "P2a", "has_property"), E("m2a", "P2a", "PD2", "is_in_paradata_nodegroup"),
  E("h2b", "US2", "P2b", "has_property"),
  E("h3", "US3", "P3", "has_property"), E("h3b", "US1", "P3", "has_property"),
  E("h4", "US3", "P4", "has_property"), E("h4b", "US4", "P4", "has_property", { inherited: true }),
] }, layout: {} };
{
  const before = JSON.stringify(temple);
  const gs = Object.fromEntries(I.implicitGroups(temple).map((g) => [g.unit, g]));
  eq(Object.keys(gs).sort(), ["US2", "US3"].concat(["US1"]).sort(), "units with loose properties: US1, US2 (beside its group), US3");
  eq([gs.US1.implicit, gs.US1.group], [true, "implicit-pd:US1"], "US1 has no group: the view makes one");
  eq(gs.US1.properties, ["P1", "P1g"], "…its two properties (P3 has two owners: left alone)");
  eq(gs.US1.chain, ["C1", "X1"], "…the combiner and the extractor; the document is an instance, not a member");
  eq([gs.US2.implicit, gs.US2.group, gs.US2.properties], [false, "PD2", ["P2b"]], "US2: its real group, the loose P2b joins it");
  eq(gs.US3.properties, ["P4"], "US3: P4, whose second owner is a declared heir");
  const vd = I.withImplicitGroups(temple);
  eq(JSON.stringify(temple), before, "the data is not touched");
  ok(vd.graph.nodes.some((n) => n.id === "implicit-pd:US1" && n.node_type === "ParadataNodeGroup"), "the view's document has the group");
  ok(vd.layout.folded_groups.includes("implicit-pd:US1"), "…closed by default");
  ok(!I.withImplicitGroups(temple, new Set(["implicit-pd:US1"])).layout.folded_groups.includes("implicit-pd:US1"), "…open when the view opened it");
  eq([...I.outsideMembers(vd, "PD2")], ["P2b"], "«fuori dal gruppo»: P2b in PD2");
  const px = V.threedInstances(vd).find((r) => r.kind === "proxy");
  eq([px.group, px.beside], ["implicit-pd:US1", "P1g"], "the proxy beside its geometry property, in the implicit group");
  eq(V.threedInstances(temple).find((r) => r.kind === "proxy").group, null, "…where before it had no group");
  eq(I.withImplicitGroups({ ...temple, graph: { ...temple.graph, edges: temple.graph.edges.filter((e) => e.edge_type !== "has_property") } }).graph.nodes.length,
     temple.graph.nodes.length, "no loose property: the document as it is");
}

// ── the studies ──────────────────────────────────────────────────────────────
for (const path of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const doc = raw.graphs ? { header: raw.header, graph: Object.values(raw.graphs)[0], layout: raw.layout ?? {} } : raw;
  const name = path.split("/").pop();
  const before = JSON.stringify(doc.graph);
  let t0 = performance.now();
  const gs = I.implicitGroups(doc);
  const vd = I.withImplicitGroups(doc);
  const ms = performance.now() - t0;
  const implicit = gs.filter((g) => g.implicit), real = gs.filter((g) => !g.implicit);
  const props = gs.reduce((a, g) => a + g.properties.length, 0), chain = gs.reduce((a, g) => a + g.chain.length, 0);
  const pxBefore = V.threedInstances(doc).filter((r) => r.kind === "proxy");
  const pxAfter = V.threedInstances(vd).filter((r) => r.kind === "proxy");
  console.log(`  ${name}: ${implicit.length} units get an implicit group, ${real.length} a real one with loose properties; `
    + `${props} loose properties, ${chain} of their chain; proxies with a group ${pxBefore.filter((r) => r.group).length} → `
    + `${pxAfter.filter((r) => r.group).length} of ${pxAfter.length}; the view's document in ${ms.toFixed(1)} ms`);
  eq(JSON.stringify(doc.graph), before, `${name}: the data is not touched`);
  eq(pxAfter.filter((r) => r.group).length, pxAfter.length, `${name}: every proxy has a place`);
  // «Compatta» on one unit with an implicit group: the group becomes true and
  // the view does not change (the same members, the same count on the badge)
  const g = implicit.find((x) => x.chain.length) ?? implicit[0];
  if (g) {
    const st = new DocumentStore(JSON.parse(JSON.stringify(doc)));
    const r = C.compactProperties(st, [g.unit]);
    ok(r.groupsCreated === 1, `${name}: «Compatta» on ${g.unit} made one group`);
    const real = st.doc.graph.edges.find((e) => e.source === g.unit && e.edge_type === "has_paradata_nodegroup")?.target;
    const members = new Set(st.doc.graph.edges.filter((e) => e.target === real && e.edge_type === "is_in_paradata_nodegroup").map((e) => e.source));
    eq([...members].sort(), [...g.properties, ...g.chain].sort(), `${name}: …the members the implicit group had`);
    eq(st.node(real)?.name, vd.graph.nodes.find((n) => n.id === g.group)?.name, `${name}: …the same name`);
    ok((st.doc.layout?.folded_groups ?? []).includes(real), `${name}: …closed, as the implicit one`);
    eq(I.implicitGroups(st.doc).some((x) => x.unit === g.unit), false, `${name}: …and the unit has no loose property left`);
    const badge = C.propertyBadges(st.doc).get(g.unit)?.count;
    eq(badge, C.propertyBadges(vd).get(g.unit)?.count, `${name}: …the badge counts the same`);
  }
}
console.log(`check-implicit-pd: ${checks} checks passed`);
