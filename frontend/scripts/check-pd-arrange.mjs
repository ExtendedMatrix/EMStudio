// MICRO-BADGE-PD · part 3: the paradata group opened IN PLACE in the Matrix is
// arranged by the function the soloing draws with (`views/pd-arrange.ts`):
// properties in a row on top, combiners and extractors under them, each source
// right under the extractor that reads it (MICRO-AUTORI-LAYOUT p.2), no empty
// row; the same order as the soloing; opening it moves nothing outside it
// (MICRO-AUTORI-LAYOUT p.2: the lane no longer makes room by itself); closed,
// every node is where it was. And a hand move inside the box stays put.
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
  // MICRO-AUTORI-LAYOUT p.2 · each source right under the extractor that
  // reads it (one row down), not on a shared last row
  const rowOf = new Map(); rows.forEach((r, i) => r.forEach((n) => rowOf.set(n.id, i)));
  const sinks = drawn.map((id) => sc.byId.get(id)).filter((n) => n.instanceOf || n.node.node_type === "document");
  const readers = (id) => sc.edges.filter((e) => e.target === id && rowOf.has(e.source)
    && ["extractor", "combiner"].includes(sc.byId.get(e.source)?.node.node_type)).map((e) => e.source);
  const under = sinks.filter((n) => readers(n.id).length);
  ok(under.every((n) => rowOf.get(n.id) === Math.max(...readers(n.id).map((r) => rowOf.get(r))) + 1),
     `${label}: every source one row under the extractor that reads it (${under.length})`);
  ok(rows.slice(1).every((r) => r.every((n) => kind(n) !== "property" || n.instanceOf)),
     `${label}: no property below the top row`);
  // no empty row: the gaps between rows are all the same
  const gaps = rows.slice(1).map((r, i) => cy(r[0]) - cy(rows[i][0]));
  ok(gaps.every((g) => Math.abs(g - gaps[0]) <= 1), `${label}: no empty row between the levels (${gaps.join(", ")})`);
  // the soloing: same rows, same order
  const solo = M.buildGroupScene(open, group);
  const soloRows = rowsIn(solo, solo.nodes.map((n) => n.id)).map((r) => r.map((n) => n.id).filter((id) => drawn.includes(id)));
  eq(rows.map((r) => r.map((n) => n.id)), soloRows.filter((r) => r.length), `${label}: the same arrangement as the soloing`);
  const g = sc.groupsById.get(group);
  ok(!!g, `${label}: the group box is drawn`);
  // MICRO-AUTORI-LAYOUT p.2 · opening it moves nothing outside it (the lane
  // no longer makes room by itself: E.D., 11 Oct 2026, no automatic arrangement)
  const inGroup = new Set([group, ...drawn]);
  const a = matrix(closed);
  const pushed = sc.nodes.filter((n) => { const c = a.byId.get(n.id); return c && !inGroup.has(n.id) && !sc.groupsById.has(n.id)
    && (c.x !== n.x || c.y !== n.y); }).map((n) => n.node.name ?? n.id);
  eq(pushed, [], `${label}: opened, nothing outside the group moved`);
  // a hand move inside the box: stored in the group's space, drawn exactly
  // where it was left — above the top row too (the anchor used to follow the
  // extent and put it back on the top line)
  {
    const mover = drawn.map((id) => sc.byId.get(id)).find((n) => !n.instanceOf);
    const at = sc.arrangedAt?.get(mover.id);
    ok(!!at, `${label}: the arranged member knows its place in the group's space`);
    const moved = structuredClone(open);
    moved.layout.group_spaces = { ...(moved.layout.group_spaces ?? {}), [group]: { ...(moved.layout.group_spaces?.[group] ?? {}),
      [mover.id]: { ...at, x: at.x + 37, y: at.y - 140 } } };
    const m = matrix(moved).byId.get(mover.id);
    eq([Math.round(m.x - mover.x), Math.round(m.y - mover.y)], [37, -140], `${label}: a member moved by hand is drawn where it was left`);
  }
  // closed: every node is where it is with the group closed from the start
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
