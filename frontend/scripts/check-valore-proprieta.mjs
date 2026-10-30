// MICRO valore-proprietà (E.D., 28 Oct 2026) · the value of a property in two
// places — `description` (EM's historical place) and `data.value`, which
// mirrors it — written together by every gesture; the geometry property and a
// uuid value (a pointer) excepted. And p.6: property → document is READ from
// the datamodel (connections 1.6.51, `read_only_sources`), not written here.
//
//   node scripts/check-valore-proprieta.mjs
//
// The data part runs on a COPY of Templu Mare v5 (TEMPLU_V5=<path>, default
// /tmp/vpd/data/TempluMare_v5.em.json, else the OneDrive original, only read).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const SRC = new URL("../src/", import.meta.url).pathname;
const CONN = `${SRC}assets/s3Dgraphy_connections_datamodel.json`;
async function load({ withoutReadOnly = false } = {}) {
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        export * as pv from "./property-value";
        export * as chain from "./paradata-chain";
        export { DocumentStore } from "./model";
        export { throughExtractor, linkedItems, handleEdgeTypes } from "./add-menu";
        export { readOnlyEdgeTypes, allowedEdgeTypes } from "./rules";
        export { addQualiaClaim } from "./em-data";
        export { readFromProperty } from "./property-source";
      `,
      resolveDir: SRC,
      loader: "ts",
    },
    bundle: true, format: "esm", write: false,
    plugins: [{
      name: "stub-icons-and-datamodel",
      setup(build) {
        build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
        if (withoutReadOnly) {
          // the same datamodel without the read-only declaration: the rule must go with it
          build.onLoad({ filter: /s3Dgraphy_connections_datamodel\.json$/ }, () => {
            const dm = JSON.parse(readFileSync(CONN, "utf8"));
            delete dm.edge_types.has_documentation.allowed_connections.read_only_sources;
            return { contents: JSON.stringify(dm), loader: "json" };
          });
        }
      },
    }],
  });
  return import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
}
const M = await load();
const { pv, chain, DocumentStore, throughExtractor, readOnlyEdgeTypes, allowedEdgeTypes, addQualiaClaim, readFromProperty } = M;

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const SHAPE = "0b9b6a3e-6e7b-4a52-9d1c-1f2c3d4e5f60";
const two = (n) => [n.description, n.data?.value];

// ── the rule, alone ───────────────────────────────────────────────────────────
{
  const a = { id: "a", node_type: "property", name: "material", description: "tufo", data: {} };
  ok(pv.alignPropertyAtBirth(a), "a description only is completed");
  eq(two(a), ["tufo", "tufo"], "description → data.value at birth");
  const b = { id: "b", node_type: "property", name: "material", description: "", data: { value: "tufo" } };
  pv.alignPropertyAtBirth(b);
  eq(two(b), ["tufo", "tufo"], "data.value → description at birth");
  const c = { id: "c", node_type: "property", name: "material", description: "a note", data: { value: "tufo" } };
  pv.alignPropertyAtBirth(c);
  eq(two(c), ["tufo", "tufo"], "two different at birth: data.value wins (as s3Dgraphy)");
  const g = { id: "g", node_type: "property", name: "geometry", description: "the proxy", data: { property_type: "geometry", value: SHAPE } };
  ok(!pv.alignPropertyAtBirth(g), "geometry is exempt");
  eq(two(g), ["the proxy", SHAPE], "geometry keeps its two places apart");
  const u = { id: "u", node_type: "property", name: "find_spot", description: "found in US12", data: { value: SHAPE } };
  ok(!pv.alignPropertyAtBirth(u), "a uuid value is a pointer, not mirrored");
  const n = { id: "n", node_type: "property", name: "height", description: "", data: { value: 3.2 } };
  pv.alignPropertyAtBirth(n);
  eq(two(n), ["3.2", 3.2], "a number mirrors as its text and stays a number");
  ok(!pv.alignPropertyAtBirth({ id: "x", node_type: "US", name: "US1", description: "a wall" }), "not a property: untouched");
}

// ── every gesture through the store ───────────────────────────────────────────
{
  const st = new DocumentStore({ graph: { graph_id: "G", nodes: [
    { id: "US1", node_type: "US", name: "US1", description: "a wall" },
    { id: "P0", node_type: "property", name: "colour", description: "red", data: { property_type: "colour" } },
    { id: "PG", node_type: "property", name: "geometry", description: "", data: { property_type: "geometry", value: SHAPE } },
  ], edges: [] }, layout: {} });
  eq(two(st.node("P0")), ["red", "red"], "opening a document completes the missing place, in memory");
  ok(!st.dirty, "…and does not mark it changed: the file changes when it is saved");
  const p = st.addNode({ id: "P1", node_type: "property", name: "material", description: "tufo", data: { property_type: "material" } });
  eq(two(p), ["tufo", "tufo"], "addNode (Shift+A, the menus, the importers in the client) writes both");
  st.updateNode("P1", { description: "peperino" });
  eq(two(st.node("P1")), ["peperino", "peperino"], "updateNode on the description rewrites data.value");
  st.updateNode("P1", { data: { property_type: "material", value: "marmo" } });
  eq(two(st.node("P1")), ["marmo", "marmo"], "updateNode on data.value rewrites the description");
  st.setPropertyValue("P1", "travertino");
  eq(two(st.node("P1")), ["travertino", "travertino"], "setPropertyValue (Inspector, «Usa come valore») writes both");
  st.setPropertyValue("P1", "");
  eq([st.node("P1").description, "value" in st.node("P1").data], ["", false], "emptying empties both");
  st.updateNode("PG", { description: "the proxy of US1" });
  eq(two(st.node("PG")), ["the proxy of US1", SHAPE], "the geometry's description does not touch its shape");
  st.undo();
  eq(two(st.node("PG")), ["", SHAPE], "undo restores both places");
  const pp = st.addNode({ id: "PP", node_type: "property", name: "find_spot", description: "found in US12", data: { value: SHAPE } });
  eq(two(pp), ["found in US12", SHAPE], "a uuid value (a pointer) is not mirrored at birth");
  st.updateNode("PP", { description: "found in US13" });
  eq(two(st.node("PP")), ["found in US13", SHAPE], "…nor when its description changes");
  st.updateNode("PP", { data: { value: "US12" } });
  eq(two(st.node("PP")), ["US12", "US12"], "…and mirrored again once the value is no longer a pointer");
  const q = addQualiaClaim(st, "US1", "height", "2.4");
  eq(two(st.node(q)), ["2.4", "2.4"], "addQualiaClaim (the em-data sheet) writes both, inside data");
  ok(!("value" in st.node(q)), "…and no stray top-level value");
  // «Take from another property»: the master gets its data.value, its description stays the same
  const m = st.addNode({ id: "PM", node_type: "property", name: "material", description: "", data: { property_type: "material" } });
  st.doc.graph.nodes.find((x) => x.id === "PM").description = "tufo giallo"; // an old file: description only
  delete st.doc.graph.nodes.find((x) => x.id === "PM").data.value;
  readFromProperty(st, "P1", "PM");
  eq(two(st.node("PM")), ["tufo giallo", "tufo giallo"], "readFromProperty aligns the master in both places");
  ok(pv.divergentProperties(st.doc).length === 0, "no property of the document diverges");
  void m;
}

// ── p.6 · property → document, read from the datamodel ────────────────────────
{
  eq(readOnlyEdgeTypes("property", "document"), ["has_documentation"], "the datamodel declares property → document read-only");
  eq(readOnlyEdgeTypes("US", "document"), [], "a unit documented in a document is authored as before");
  ok(allowedEdgeTypes("property", "document").includes("has_documentation"), "…and an old file's edge still validates");
  ok(throughExtractor("property", "document"), "throughExtractor: property → document goes through the extractor");
  ok(!throughExtractor("US", "document"), "throughExtractor: a unit → document does not");
  const W = await load({ withoutReadOnly: true });
  ok(!W.throughExtractor("property", "document"),
     "with the declaration taken out of the datamodel, the rule goes with it: it is read, not written by hand");
  eq(W.readOnlyEdgeTypes("property", "document"), [], "…and nothing else holds it");
}

// ── the data: a copy of Templu Mare v5 ────────────────────────────────────────
const ONEDRIVE = `${homedir()}/Library/CloudStorage/OneDrive-CNR/Dottorato Bucarest/14_EM_1.6_lavoro/TempluMare_v2_for_3DR_2026-10-06/EM/TempluMare_v5.em.json`;
const PATH = process.env.TEMPLU_V5 ?? (existsSync("/tmp/vpd/data/TempluMare_v5.em.json") ? "/tmp/vpd/data/TempluMare_v5.em.json" : ONEDRIVE);
if (!existsSync(PATH)) {
  console.log(`check-valore-proprieta: ${checks} checks OK (SKIP the data part: no Templu Mare v5 at ${PATH})`);
  process.exit(0);
}
{
  const f = JSON.parse(readFileSync(PATH, "utf8"));
  const gids = Object.keys(f.graphs);
  let props = 0, before = 0, after = 0;
  for (const gid of gids) {
    const g = f.graphs[gid];
    const raw = { graph: JSON.parse(JSON.stringify({ ...g, id: gid })), layout: {} };
    before += pv.divergentProperties(raw).length;
    const st = new DocumentStore({ graph: { ...JSON.parse(JSON.stringify(g)), id: gid }, layout: {} });
    props += st.doc.graph.nodes.filter((n) => n.node_type === "property").length;
    after += pv.divergentProperties(st.doc).length;
  }
  ok(props > 300, `Templu Mare v5 has its properties (${props})`);
  eq(before, 0, "Templu Mare v5 as it is on disk: zero divergent properties (it was migrated)");
  eq(after, 0, "…and zero after opening it");
  // change one value and compare what would be saved with what was opened
  const gid = f.active_graph_id ?? gids[0];
  const orig = JSON.parse(JSON.stringify(f.graphs[gid].nodes));
  const st = new DocumentStore({ graph: { ...JSON.parse(JSON.stringify(f.graphs[gid])), id: gid }, layout: {} });
  const target = st.doc.graph.nodes.find((n) => n.node_type === "property" && !pv.mirrorExempt(n)
    && !pv.isUuidPointer(n.data?.value) && String(n.description ?? "").trim());
  st.setPropertyValue(target.id, "valore cambiato");
  const changed = st.doc.graph.nodes.filter((n) => {
    const o = orig.find((x) => x.id === n.id);
    const strip = (x) => { const c = JSON.parse(JSON.stringify(x)); delete c._clock; delete c.data?._clock; delete c.data?._fields; delete c._fields; return c; };
    return !o || JSON.stringify(strip(o)) !== JSON.stringify(strip(n));
  }).map((n) => n.id);
  ok(changed.includes(target.id), `the changed property is in the diff (${target.name})`);
  eq(two(st.node(target.id)), ["valore cambiato", "valore cambiato"], "…with its two places equal");
  eq(pv.divergentProperties(st.doc).length, 0, "…and still no divergent property");
  console.log(`  Templu Mare v5 (${PATH}): ${props} properties, divergent on disk ${before}, after opening ${after}; nodes changed by one edit: ${changed.length} (${changed.join(", ")})`);
}

console.log(`check-valore-proprieta: ${checks} checks OK`);
