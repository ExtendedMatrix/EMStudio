// MICRO-BADGE-PD · part 3: the paradata group opened IN PLACE in the Matrix is
// arranged by the function the soloing draws with (`views/pd-arrange.ts`):
// properties in a row on top, combiners and extractors under them, documents
// and instances at the bottom, no empty row; the same order as the soloing;
// no unit of another group inside its box; closed, every node is where it was.
//
//   node scripts/check-pd-arrange.mjs [room.em.json]
//
// The fixture of the trusses, and a room (templu-mare-v2) after «Compact
// (whole graph)» with USV132's group opened.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `
      export * as C from "./compact";
      export { DocumentStore } from "./model";
      export { buildMatrixScene, newRestackMemo } from "./views/matrix";
      export { buildGroupScene } from "./views/context";
      export { buildMembership, applyFolding } from "./folding";
    `, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
  plugins: [{ name: "stub-icons", setup(build) {
    build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
  } }],
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

function matrix(doc) {
  const folded = new Set(doc.layout?.folded_groups ?? []);
  const view = folded.size ? M.applyFolding(doc, M.buildMembership(doc), folded) : undefined;
  return M.buildMatrixScene(doc, view, undefined, new Set(), new Set(), M.newRestackMemo(), "k");
}
const cy = (n) => Math.round(n.y + n.h / 2);
/** the group's drawn content, row by row (centre y), left to right */
function rowsIn(sc, ids) {
  const ns = ids.map((id) => sc.byId.get(id)).filter(Boolean);
  const ys = [...new Set(ns.map(cy))].sort((a, b) => a - b);
  return ys.map((y) => ns.filter((n) => cy(n) === y).sort((a, b) => a.x - b.x));
}
const kind = (n) => (n.instanceOf ? "instance" : n.node.node_type);

function checkGroup(doc, group, label) {
  const open = structuredClone(doc);
  open.layout = { ...(open.layout ?? {}), folded_groups: (open.layout?.folded_groups ?? []).filter((g) => g !== group) };
  const closed = structuredClone(doc);
  closed.layout = { ...(closed.layout ?? {}), folded_groups: [...new Set([...(closed.layout?.folded_groups ?? []), group])] };
  const sc = matrix(open);
  const members = M.buildMembership(open).childrenOf.get(group) ?? [];
  const drawn = [...members.filter((m) => sc.byId.has(m)), ...sc.nodes.filter((n) => n.id.endsWith(`##${group}`)).map((n) => n.id)];
  const rows = rowsIn(sc, drawn);
  ok(rows.length >= 1, `${label}: the open group draws its content`);
  const props = drawn.map((id) => sc.byId.get(id)).filter((n) => n.node.node_type === "property" && !n.instanceOf);
  ok(props.every((p) => cy(p) === cy(rows[0][0])), `${label}: every property in the top row`);
  const last = rows[rows.length - 1];
  const sinks = drawn.map((id) => sc.byId.get(id)).filter((n) => n.instanceOf || n.node.node_type === "document");
  ok(sinks.every((n) => cy(n) === cy(last[0])), `${label}: documents and instances in the bottom row`);
  ok(rows.slice(1, -1).every((r) => r.every((n) => ["extractor", "combiner"].includes(kind(n)))) || rows.length < 3,
     `${label}: combiners and extractors in the rows between`);
  // no empty row: the gaps between rows are all the same
  const gaps = rows.slice(1).map((r, i) => cy(r[0]) - cy(rows[i][0]));
  ok(gaps.every((g) => Math.abs(g - gaps[0]) <= 1), `${label}: no empty row between the levels (${gaps.join(", ")})`);
  // the soloing: same rows, same order
  const solo = M.buildGroupScene(open, group);
  const soloRows = rowsIn(solo, solo.nodes.map((n) => n.id)).map((r) => r.map((n) => n.id).filter((id) => drawn.includes(id)));
  eq(rows.map((r) => r.map((n) => n.id)), soloRows.filter((r) => r.length), `${label}: the same arrangement as the soloing`);
  // the box: nothing of another group inside
  const g = sc.groupsById.get(group);
  ok(!!g, `${label}: the group box is drawn`);
  const inGroup = new Set([group, ...drawn]);
  const anc = new Set(); { const m = M.buildMembership(open); let c = m.primaryOf.get(group); while (c && !anc.has(c)) { anc.add(c); c = m.primaryOf.get(c); } }
  const foreign = sc.nodes.filter((n) => !inGroup.has(n.id) && !anc.has(n.id) && !sc.groupsById.has(n.id) && !n.collapsed
    && n.x < g.x + g.w && n.x + n.w > g.x && n.y < g.y + g.h && n.y + n.h > g.y).map((n) => n.node.name ?? n.id);
  eq(foreign, [], `${label}: no unit of another group inside the box`);
  // closed: every node is where it is with the group closed from the start
  const a = matrix(closed);
  const again = structuredClone(open); again.layout.folded_groups = closed.layout.folded_groups;
  const b = matrix(again);
  const moved = a.nodes.filter((n) => { const m = b.byId.get(n.id); return !m || m.x !== n.x || m.y !== n.y; });
  eq(moved.length, 0, `${label}: closed again, nothing moved`);
  console.log(`  ${label}: ${rows.length} rows (${rows.map((r) => r.length).join(" · ")}), box ${Math.round(g.w)} × ${Math.round(g.h)}`);
  return { rows: rows.map((r) => r.map((n) => n.node.name ?? n.id)), box: [Math.round(g.w), Math.round(g.h)] };
}

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const cap = load("../testdata/capriate.em.json");
checkGroup(cap, "PD_US_12", "capriate PD_US 12");

for (const f of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(f, "utf8"));
  const doc = raw.graph ? raw : { header: raw.header,
    graph: Array.isArray(raw.graphs) ? raw.graphs[0] : (raw.graphs[raw.active_graph_id] ?? Object.values(raw.graphs)[0]), layout: raw.layout };
  const st = new M.DocumentStore(structuredClone(doc));
  M.C.compactProperties(st);
  const usv = st.doc.graph.nodes.find((n) => n.name === "USV132");
  const pd = usv && st.doc.graph.edges.find((e) => e.source === usv.id && e.edge_type === "has_paradata_nodegroup")?.target;
  if (!pd) { console.log(`  ${f}: no USV132 group, skipped`); continue; }
  const r = checkGroup(st.doc, pd, `${f.split("/").pop()} USV132`);
  ok(r.box[0] < 2000, `USV132's open group is compact (${r.box[0]} wide; 7993 before)`);
}
console.log(`check-pd-arrange: ${checks} checks passed`);
