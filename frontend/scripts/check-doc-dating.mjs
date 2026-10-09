// MICRO-BADGE-PD-CRONOLOGIA · part 4: a document stands in the epoch of its date
// (`doc-dating.ts`, the reading em-core makes in `layout.rs`: the property
// `absolute_time_start`, else the node's own field, else `has_first_epoch`), and
// three disagreements are warnings with their cure: the group of another epoch,
// the property and the field that say two years, the year out of the epoch it
// declares. On E.D.'s file: D.70, 1870, «XX sec», in VAct.04 of «II A.D.».
//
//   node scripts/check-doc-dating.mjs [TempluMare_v2.em.json]
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as DD from "./doc-dating"; export { issues } from "./issues"; export { t } from "./i18n";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const { DD } = M;
let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// a small graph of its own
const ep = (id, name, a, b) => ({ id, node_type: "EpochNode", name, data: { start_time: a, end_time: b } });
const base = () => ({ graph: { nodes: [
  ep("XX", "XX sec", 1801, 2013), ep("II", "II A.D.", 100, 199),
  { id: "ACT", node_type: "ActivityNodeGroup", name: "VAct.04" },
  { id: "D70", node_type: "document", name: "D.70", data: { absolute_time_start: "1870" } },
  { id: "P70", node_type: "property", name: "absolute_time_start", description: "1870", data: {} },
], edges: [
  { id: "e1", source: "ACT", target: "II", edge_type: "has_first_epoch" },
  { id: "e2", source: "D70", target: "XX", edge_type: "has_first_epoch" },
  { id: "e3", source: "D70", target: "ACT", edge_type: "is_in_activity" },
  { id: "e4", source: "D70", target: "P70", edge_type: "has_property" },
] } });
const run = (doc, extra = {}) => M.issues({ doc, nodes: doc.graph.nodes, isUnit: () => false, t: M.t,
  fixers: { leaveGroup: { label: "leave", run: () => {} }, alignDocDate: { label: "align", run: () => {} }, redate: () => {} }, ...extra })
  .filter((i) => i.node === "D70");

{
  const d = base();
  const dd = DD.documentDating(d, "D70");
  eq([dd.year, dd.yearEpoch, dd.declaredEpoch, dd.epoch, dd.property], [1870, "XX", "XX", "XX", "P70"], "D.70: 1870 → XX sec");
  const is = run(d);
  eq(is.length, 1, "one warning: the group of another epoch");
  ok(/D\.70 is of XX sec but it is in the group VAct\.04 of II A\.D\./.test(is[0].txt), `said: ${is[0].txt}`);
  eq(is[0].fix?.label, "leave", "…its cure: out of the group");
  const st = run(d, { drawnLane: () => "II", relayout: { label: "Layout", run: () => {} } });
  ok(/saved drawing/.test(st[0].txt) && st[0].fix?.label === "Layout", "drawn still in the group's lane: the cure is the Layout");
  const fresh = run(d, { drawnLane: () => "XX", relayout: { label: "Layout", run: () => {} } });
  eq(fresh[0].fix?.label, "leave", "drawn in its epoch: the cure is out of the group");
}
{
  const d = base(); d.graph.nodes.find((n) => n.id === "D70").data.absolute_time_start = "1871";
  const is = run(d);
  ok(is.some((i) => /1870 in its property and 1871/.test(i.txt) && i.fix?.label === "align"), "property 1870, data 1871: a warning, «align»");
  eq(DD.documentDating(d, "D70").year, 1870, "the property wins");
}
{
  const d = base(); d.graph.edges.find((e) => e.id === "e2").target = "II";
  const is = run(d);
  const w = is.find((i) => /outside II A\.D\. \(100–199\)/.test(i.txt));
  ok(w && w.fix?.kind === "pick" && w.fix.options.map((o) => o.value).join() === "XX", "1870 declared in II A.D.: a warning, «date it in XX sec»");
  eq(DD.documentDating(d, "D70").epoch, "XX", "the year decides the epoch, not has_first_epoch");
  eq(is.filter((i) => /in the group/.test(i.txt)).length, 1, "…and the group of another epoch is still said (XX vs II)");
}
{
  const d = base(); d.graph.nodes = d.graph.nodes.filter((n) => n.id !== "P70"); d.graph.edges = d.graph.edges.filter((e) => e.id !== "e4");
  eq(DD.documentDating(d, "D70").year, 1870, "no property: the node's own field");
  delete d.graph.nodes.find((n) => n.id === "D70").data.absolute_time_start;
  eq([DD.documentDating(d, "D70").year, DD.documentDating(d, "D70").epoch], [null, "XX"], "no date: has_first_epoch");
}

// a room: every document with a date, its epoch by the rule
for (const f of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(f, "utf8"));
  const g = raw.graph ?? (Array.isArray(raw.graphs) ? raw.graphs[0] : Object.values(raw.graphs)[0]);
  const doc = { graph: g };
  const name = (id) => g.nodes.find((n) => n.id === id)?.name ?? id;
  const docs = g.nodes.filter((n) => n.node_type === "document");
  const rows = docs.map((n) => ({ n: n.name, ...DD.documentDating(doc, n.id) })).filter((r) => r.epoch);
  const d70 = rows.find((r) => r.n === "D.70");
  if (d70) eq([d70.year, name(d70.epoch)], [1870, "XX sec"], `${f.split("/").pop()}: D.70 → 1870, XX sec`);
  const is = M.issues({ doc, nodes: g.nodes, isUnit: () => false, t: M.t }).filter((i) => i.rule === "chronology" && docs.some((d) => d.id === i.node));
  console.log(`  ${f.split("/").pop()}: ${docs.length} documents, ${rows.length} dated; warnings: ${is.map((i) => i.txt).join(" | ") || "none"}`);
}
console.log(`check-doc-dating: ${checks} checks passed`);
