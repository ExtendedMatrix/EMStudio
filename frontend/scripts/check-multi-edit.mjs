// MICRO-CRONO-MULTIPLA p.2 · one edit, every selected node that has the field.
//
//   node scripts/check-multi-edit.mjs
//
// On the fixture's five dated documents and an epoch: without the multi key the
// epoch of creation goes to the active document only; with it, to all five, in
// ONE undo step, one Log line, the room's ordinary operations; the undo brings
// all five back. A selection with nodes that cannot have the field skips and
// counts them. The key is ⌘ on macOS, Alt elsewhere.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage ??= { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({
  stdin: {
    contents: `export * as M from "./multi-edit"; export { DocumentStore } from "./model"; export { allowedEdgeTypes } from "./rules";
      export { t, setLocale } from "./i18n";`,
    resolveDir: SRC, loader: "ts",
  },
  bundle: true, format: "esm", write: false, logLevel: "error",
});
const X = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
const { M, DocumentStore, allowedEdgeTypes } = X;
globalThis.document ??= { documentElement: { setAttribute() {}, lang: "", dir: "" }, querySelectorAll: () => [], querySelector: () => null };
X.setLocale("en");

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const FIX = new URL("../testdata/TempluMare.em.json", import.meta.url);
const fresh = () => new DocumentStore(JSON.parse(readFileSync(FIX, "utf8")));
const st0 = fresh();
const docs = st0.doc.graph.nodes.filter((n) => n.node_type === "document").slice(0, 5).map((n) => n.id);
const epochs = st0.doc.graph.nodes.filter((n) => n.node_type === "EpochNode").map((n) => n.id);
const epochOf = (st, id) => st.doc.graph.edges.filter((e) => e.source === id && e.edge_type === "has_first_epoch").map((e) => e.target);
const before = Object.fromEntries(docs.map((d) => [d, epochOf(st0, d)]));
const target = epochs.find((e) => docs.some((d) => !before[d].includes(e)));
ok(docs.length === 5 && target, "the fixture: five documents and an epoch some of them are not in");

const hasCreation = (n) => allowedEdgeTypes(n.node_type, "EpochNode").includes("has_first_epoch");
const setEpoch = (st) => (id) => {
  for (const e of st.doc.graph.edges.filter((x) => x.source === id && x.edge_type === "has_first_epoch")) st.deleteEdge(e);
  st.addEdge(id, target, "has_first_epoch");
};
const FIELD = "Epoch of creation";

// ── the key: ⌘ on macOS, Alt elsewhere ────────────────────────────────────────
eq(M.multiKeyOf({ metaKey: true, altKey: false }), M.MULTI_IS_META, "⌘ is the key where the platform is a Mac");
eq(M.multiKeyOf({ metaKey: false, altKey: true }), !M.MULTI_IS_META, "…Alt elsewhere");

// ── without the key: the active node only ─────────────────────────────────────
{
  const st = fresh();
  const logs = [];
  const scope = { store: st, active: docs[0], selection: docs, log: (m, ids) => logs.push([m, ids]) };
  const got = M.commitField(scope, docs[0], FIELD, hasCreation, setEpoch(st), false);
  eq(got, [docs[0]], "without the key the edit goes to the active document");
  eq(epochOf(st, docs[0]), [target], "…which is in the epoch");
  eq(docs.slice(1).map((d) => epochOf(st, d)), docs.slice(1).map((d) => before[d]), "…and the other four are as they were");
  eq(logs, [], "…and no multi line in the Log");
}

// ── with the key: all five, one undo step, one Log line, ordinary operations ────
{
  const st = fresh();
  const logs = [], ops = [];
  st.onOp((op) => ops.push(op.op));
  const scope = { store: st, active: docs[0], selection: docs, log: (m, ids) => logs.push([m, ids]) };
  eq(M.multiPlan(scope, hasCreation), { targets: docs, skipped: 0 }, "the plan: five documents, none skipped");
  const got = M.commitField(scope, docs[0], FIELD, hasCreation, setEpoch(st), true);
  eq(got, docs, "with the key the edit goes to the five");
  eq(docs.map((d) => epochOf(st, d)), docs.map(() => [target]), "…all five are in the epoch");
  eq(logs.length, 1, "one Log line");
  eq(logs[0][0], "«Epoch of creation» applied to 5 selected nodes (0 skipped, without the field)", "…saying the field and how many");
  ok(ops.length >= 5 && ops.every((o) => o === "add_edge" || o === "delete_edge"), `the room sees the ordinary edge operations (${ops.length})`);
  st.undo();
  eq(docs.map((d) => epochOf(st, d)), docs.map((d) => before[d]), "ONE undo brings all five back");
  ok(!st.canUndo || st.doc.graph.edges.length === st0.doc.graph.edges.length, "…in one step");
  st.redo();
  eq(docs.map((d) => epochOf(st, d)), docs.map(() => [target]), "…and one redo does it again");
}

// ── a mixed selection: what has no such field is skipped and counted ───────────
{
  const st = fresh();
  const logs = [];
  const notDocs = [epochs[0]].concat(st.doc.graph.nodes.filter((n) => !hasCreation(n)).slice(0, 1).map((n) => n.id));
  const uniq = [...new Set(notDocs)];
  const scope = { store: st, active: docs[1], selection: [...docs, ...uniq], log: (m, ids) => logs.push([m, ids]) };
  const plan = M.multiPlan(scope, hasCreation);
  eq(plan.targets[0], docs[1], "the active node is the first target");
  eq([plan.targets.length, plan.skipped], [5, uniq.length], `five documents, ${uniq.length} skipped`);
  M.commitField(scope, docs[1], FIELD, hasCreation, setEpoch(st), true);
  eq(uniq.map((id) => epochOf(st, id)), uniq.map(() => []), "the skipped nodes are not touched");
  ok(logs[0][0].includes(`(${uniq.length} skipped`), "…and the Log says how many were skipped");
  eq(logs[0][1], plan.targets, "…and names the nodes edited");
}

// ── one node selected: nothing to propagate to, the key changes nothing ─────────
{
  const st = fresh();
  const scope = { store: st, active: docs[0], selection: [docs[0]] };
  ok(!M.multiOffered(scope), "one node selected: no propagation offered");
  eq(M.commitField(scope, docs[0], FIELD, hasCreation, setEpoch(st), true), [docs[0]], "…the key changes nothing");
  ok(!M.multiOffered(null), "no selection callback (the build has none): edits go to the active node");
}

console.log(`multi-edit: ${checks} checks passed`);
