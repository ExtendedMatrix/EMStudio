// FUNNEL1 · executable check of src/funnel.ts — the Data Funnel resolver.
//
//   node scripts/check-funnel.mjs
//
// Pure resolver (no DOM), same as the other checks. Verifies the substitutive
// Node → Activity → Epoch → Canvas chain, first non-null wins, and the `explicit`
// flag — mirroring DP-32 / s3dgraphy's resolve_with_source.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}funnel.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const F = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// Builders: a scope node + its PDG + an ornament member declaring a value.
let seq = 0;
const uid = (p) => `${p}${seq++}`;
function doc(nodes, edges, graphExtra = {}) {
  return { header: {}, graph: { graph_id: "t", name: "T", nodes, edges, ...graphExtra } };
}
const N = (id, type, name) => ({ id, node_type: type, name });
const E = (edge_type, source, target) => ({ edge_type, source, target });
// attach an ornament of `type`/`name` into scope `scopeId`'s PDG
function withParadata(nodes, edges, scopeId, ornType, ornName) {
  const pdg = uid("pdg_");
  const orn = uid("orn_");
  nodes.push(N(pdg, "ParadataNodeGroup", `${scopeId}_PD`), N(orn, ornType, ornName));
  edges.push(
    E("has_paradata_nodegroup", scopeId, pdg),
    E("is_in_paradata_nodegroup", orn, pdg),
  );
  return orn;
}
// MIG1-A / DP-65: the CANVAS scope value lives as an ornament MEMBER of the
// graph-scope PDG owned by the graph-self node (node_type "graph"). Create that
// chain — mirrors what readScopeValue's canvas branch now reads.
function withGraphScope(nodes, edges, ornType, ornName) {
  let root = nodes.find((n) => n.node_type === "graph");
  if (!root) {
    root = N(uid("graph_"), "graph", "Graph");
    nodes.push(root);
  }
  return withParadata(nodes, edges, root.id, ornType, ornName);
}

// ── 1 · node own author + epoch author → NODE wins (explicit) ─────────────────
{
  const nodes = [N("u1", "US", "US_1"), N("ep", "EpochNode", "Epoca 1")];
  const edges = [E("has_first_epoch", "u1", "ep")];
  withParadata(nodes, edges, "u1", "author", "M. Rossi"); // node's own
  withParadata(nodes, edges, "ep", "author", "Epoch Author"); // epoch's
  const r = F.resolveEffective(doc(nodes, edges), "u1", "author");
  eq({ value: r.value, source: r.source, explicit: r.explicit },
    { value: "M. Rossi", source: "node", explicit: true },
    "node's own author overrides the epoch's (explicit)");
}

// ── 2 · node without author, epoch has one → INHERIT epoch ────────────────────
{
  const nodes = [N("u1", "US", "US_1"), N("ep", "EpochNode", "Epoca 1")];
  const edges = [E("has_first_epoch", "u1", "ep")];
  withParadata(nodes, edges, "ep", "author", "Epoch Author");
  const r = F.resolveEffective(doc(nodes, edges), "u1", "author");
  eq({ value: r.value, source: r.source, explicit: r.explicit },
    { value: "Epoch Author", source: "epoch", explicit: false },
    "a node with no author inherits the epoch's (source=epoch, not explicit)");
}

// ── 3 · nothing on node/activity/epoch, canvas has a license → INHERIT canvas ──
{
  const nodes = [N("u1", "US", "US_1"), N("ep", "EpochNode", "Epoca 1")];
  const edges = [E("has_first_epoch", "u1", "ep")];
  withGraphScope(nodes, edges, "license", "CC-BY"); // graph-scope PDG member (DP-65)
  const r = F.resolveEffective(doc(nodes, edges), "u1", "license");
  eq({ value: r.value, source: r.source, explicit: r.explicit },
    { value: "CC-BY", source: "canvas", explicit: false },
    "with nothing more specific, the graph-scope licence node is inherited");
}

// ── 4 · activity declares AND epoch declares → ACTIVITY wins (more specific) ───
{
  const nodes = [
    N("u1", "US", "US_1"),
    N("act", "ActivityNodeGroup", "VAct.01"),
    N("ep", "EpochNode", "Epoca 1"),
  ];
  const edges = [
    E("is_in_activity", "u1", "act"),
    E("has_first_epoch", "u1", "ep"),
  ];
  withParadata(nodes, edges, "act", "author", "Activity Author");
  withParadata(nodes, edges, "ep", "author", "Epoch Author");
  const r = F.resolveEffective(doc(nodes, edges), "u1", "author");
  eq({ value: r.value, source: r.source, explicit: r.explicit },
    { value: "Activity Author", source: "activity", explicit: false },
    "the activity is more specific than the epoch → activity wins");
}

// ── 5 · nothing anywhere → unresolved (null) ──────────────────────────────────
{
  const nodes = [N("u1", "US", "US_1")];
  const r = F.resolveEffective(doc(nodes, []), "u1", "embargo");
  eq({ value: r.value, source: r.source }, { value: null, source: null },
    "no declaration in the whole chain → null / no source");
}

// ── 6 · author_ai counts as an author declaration ─────────────────────────────
{
  const nodes = [N("u1", "US", "US_1")];
  const edges = [];
  withParadata(nodes, edges, "u1", "author_ai", "Claude");
  const r = F.resolveEffective(doc(nodes, edges), "u1", "author");
  eq({ value: r.value, source: r.source, explicit: r.explicit },
    { value: "Claude", source: "node", explicit: true },
    "an author_ai member satisfies the `author` rule");
}

// ── 7 · sourceLabel / readScopeValue canvas branch (graph-scope PDG) ──────────
{
  // the labels come from the dictionary; the default locale is English
  eq(F.sourceLabel("epoch"), "inherited from its epoch", "source label for epoch");
  eq(F.sourceLabel("canvas"), "inherited from the project", "I4 · the project, never «from Canvas»");
  eq(F.sourceLabel("node"), "its own", "source label for the node itself");
  const nodes = [N("u1", "US", "US_1")];
  const edges = [];
  withGraphScope(nodes, edges, "author", "Canvas Author");
  eq(F.readScopeValue(doc(nodes, edges), "canvas", null, "author"), "Canvas Author",
    "readScopeValue canvas branch reads the graph-scope AuthorNode member (DP-65)");
}
// ── 8 · MIG1-A clean cut: legacy graph.data / top-level is NO LONGER read ──────
{
  const d = doc([N("u1", "US", "US_1")], [], {
    author_name: "Legacy Top", data: { license: "Legacy Data" },
  });
  eq(F.readScopeValue(d, "canvas", null, "author"), null,
    "legacy top-level graph.author_name is ignored (clean cut)");
  eq(F.readScopeValue(d, "canvas", null, "license"), null,
    "legacy graph.data.license is ignored (clean cut)");
}

console.log(`funnel: ${checks} checks passed`);
