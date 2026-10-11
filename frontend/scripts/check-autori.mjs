// MICRO-AUTORI-LAYOUT · part 1: the author is an entity in time (E.D., 11 Oct
// 2026). Its MASTER stands in the epoch of its date — `absolute_time_start`,
// else `absolute_time_end`, else `has_first_epoch`, a date out of every epoch
// in the nearest (`doc-dating.entityEpoch`, the rule of em-core's lanes and of
// s3Dgraphy's `spatiotemporal.entity_epoch`); where it is cited it is a
// computed INSTANCE (`paradata-view`, the `authorship` block), badge its epoch,
// drawn right under the extractor it wrote.
//
//   node scripts/check-autori.mjs [file.em.json …]   (a file: its authors counted)
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as DD from "./doc-dating"; export * as PV from "./paradata-view";
                      export { paradataGroupScene } from "./views/pd-arrange";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
  plugins: [{ name: "stub-icons", setup(build) {
    build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
  } }],
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const { DD, PV } = M;
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const ep = (id, name, a, b) => ({ id, node_type: "EpochNode", name, data: { start_time: a, end_time: b } });
const prop = (id, q, v) => ({ id, node_type: "property", name: q, data: { property_type: q, value: v } });
function templu({ start, end = "2021-09-28", declared } = {}) {
  const nodes = [ep("XX", "XX sec", 1801, 2013), ep("POST", "Post antiquity", 200, 1800), ep("II", "II A.D.", 100, 199),
    { id: "AD", node_type: "author", name: "Alexandru Diaconescu" },
    { id: "PD", node_type: "ParadataNodeGroup", name: "PD_USV104" }, { id: "U", node_type: "USVn", name: "USV104" },
    { id: "P", node_type: "property", name: "Width", data: {} },
    { id: "X", node_type: "extractor", name: "D.05.05" }, { id: "D05", node_type: "document", name: "D.05" }];
  const edges = [{ id: "g1", source: "U", target: "PD", edge_type: "has_paradata_nodegroup" },
    { id: "m1", source: "P", target: "PD", edge_type: "is_in_paradata_nodegroup" },
    { id: "m2", source: "X", target: "PD", edge_type: "is_in_paradata_nodegroup" },
    { id: "h1", source: "U", target: "P", edge_type: "has_property" },
    { id: "p1", source: "P", target: "X", edge_type: "has_data_provenance" },
    { id: "r1", source: "X", target: "D05", edge_type: "extracted_from" },
    { id: "a1", source: "X", target: "AD", edge_type: "has_author" }];
  for (const [id, q, v] of [["PS", "absolute_time_start", start], ["PE", "absolute_time_end", end]]) {
    if (v == null) continue;
    nodes.push(prop(id, q, v));
    edges.push({ id: `hp${id}`, source: "AD", target: id, edge_type: "has_property" });
  }
  if (declared) edges.push({ id: "fe", source: "AD", target: declared, edge_type: "has_first_epoch" });
  return { graph: { nodes, edges } };
}
const epoch = (d) => { const r = DD.entityEpoch(d, "AD"); return [r.epoch, r.rule]; };
eq(epoch(templu({ start: "1950" })), ["XX", "date"], "the start decides");
eq(epoch(templu({ end: "1700" })), ["POST", "date"], "without a start, the end");
eq(epoch(templu({ start: "150", declared: "XX" })), ["II", "date"], "a date beats the declared epoch");
eq(epoch(templu({ declared: "POST" })), ["POST", "declared"], "a date out of every epoch keeps the declared one");
eq(epoch(templu()), ["XX", "nearest"], "Diaconescu, 2021: the nearest epoch, XX sec");
eq(epoch(templu({ end: null })), [null, null], "no date, no epoch: nowhere");

// the instance: in the group of the extractor he wrote, badge his epoch
const d = templu();
const recs = PV.viewInstances(d, "PD");
const a = recs.find((r) => r.kind === "author");
eq([a?.id, a?.owner, a?.owner_kind, a?.owner_name, a?.readers], ["AD##PD", "XX", "epoch", "XX sec", ["X"]], "the author's instance");
eq(recs.map((r) => r.kind).sort(), ["author", "document"], "…beside the document the extractor reads");
// arranged: the property, under it the extractor, under it the document and the author
const sc = M.paradataGroupScene(d, "PD", ["P", "X"], undefined, recs);
const row = (id) => Math.round(sc.byId.get(id).y);
eq([row("P") < row("X"), row("X") < row("AD##PD"), row("AD##PD") === row("D05##PD")], [true, true, true],
   "property, extractor, then its document and its author on the row right under it");
// an author member of the group is not drawn twice
const m = templu(); m.graph.edges.push({ id: "m3", source: "AD", target: "PD", edge_type: "is_in_paradata_nodegroup" });
eq(PV.viewInstances(m, "PD").map((r) => r.kind), ["document"], "a member author is not an instance too");

// a file: every author, where it stood (has_first_epoch, else the trailing
// lane the Matrix drew inside the last epoch) and where it stands now
for (const f of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(f, "utf8"));
  const g = raw.graph ?? (Array.isArray(raw.graphs) ? raw.graphs[0] : (raw.graphs[raw.active_graph_id] ?? Object.values(raw.graphs)[0]));
  const doc = { graph: g };
  const name = (id) => g.nodes.find((n) => n.id === id)?.name ?? id;
  const bounds = DD.epochBounds(doc);
  const last = [...bounds].sort((x, y) => x.lo - y.lo)[0];
  const all = PV.allViewInstances(doc);
  console.log(`  ${f.split("/").pop()}:`);
  for (const n of g.nodes.filter((x) => x.node_type === "author" || x.node_type === "author_ai")) {
    const fe = g.edges.find((e) => e.source === n.id && e.edge_type === "has_first_epoch")?.target;
    const now = DD.entityEpoch(doc, n.id, bounds);
    const inst = [...all.values()].flat().filter((r) => r.master === n.id).length;
    const member = g.edges.filter((e) => e.source === n.id && e.edge_type === "is_in_paradata_nodegroup").map((e) => name(e.target));
    console.log(`    ${n.node_type} ${n.name}: before ${fe ? name(fe) : `no lane (the trailing lane, drawn inside ${last ? name(last.id) : "—"})`}` +
      ` → now ${now.epoch ? `${name(now.epoch)} (${now.rule}${now.year != null ? ` ${now.year}` : ""})`
        : member.length ? "no epoch of its own (drawn in its group)" : "no epoch (a badge; its node in the Full graph)"}` +
      `; ${inst} instances${member.length ? `; member of ${member.join(", ")}` : ""}`);
  }
}
console.log(`check-autori: ${checks} checks passed`);
