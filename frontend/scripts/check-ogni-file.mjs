// MICRO-OGNI-FILE-I-SUOI-GRAFI · the pure half of F1–F5 (2 Oct 2026).
//
//   node scripts/check-ogni-file.mjs
//   OF_TEMPIO=/tmp/dev31-banco/segni/caso-di-studio-EM/EM/Tempio_Giunone_Moneta.em.json \
//   OF_OUT=/tmp/dev31-banco/tempio-dopo.em.json node scripts/check-ogni-file.mjs
//
// F2 · the EMTree's model: files are a list BESIDE the slots, each slot names its
// file, and «which graphs does this file hold» is asked of that, never of a path.
// F5 · an epoch's date is born when it is written: no empty placeholder is made,
// the ones of old files go (counted), every date is its epoch's has_property.
// With OF_TEMPIO the same on E.D.'s file (a COPY): OF_OUT gets the document as
// Save would write its graphs, for `s3dgraphy.api.validate` to measure.
// The canvas half (two files, three graphs, one Save, reopen) is the `F*` cases
// of `check-interactions.mjs`.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { readFileSync, writeFileSync } from "node:fs";

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

const { window, document } = parseHTML(`<!doctype html><html><body></body></html>`);
globalThis.window = window;
globalThis.document = document;
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const SRC = new URL("../src/", import.meta.url).pathname;
const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export { EMTree, pathTail, renderEMTree } from "./emtree";
      export { DocumentStore } from "./model";
      export { parseContainer, buildContainer } from "./container";
    `,
    resolveDir: SRC, loader: "ts",
  },
  bundle: true, format: "esm", write: false,
  define: { __EMSTUDIO_VERSION__: JSON.stringify(PKG.version) },
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
    },
  }],
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const { EMTree, pathTail, renderEMTree, DocumentStore, parseContainer, buildContainer } = M;

const graphDoc = (id, units = ["US1"]) => ({
  header: { format: "em.json", version: "1.0" },
  graph: { graph_id: id, name: id, nodes: units.map((u) => ({ id: u, node_type: "US", name: u })), edges: [] },
  layout: { positions: Object.fromEntries(units.map((u, i) => [u, { x: i * 100, y: 0, w: 90, h: 30 }])) },
});

// ── F2 · files beside the slots ─────────────────────────────────────────────
{
  const tree = new EMTree();
  const a = tree.addFile("/scavo/A.em.json", "A.em.json");
  const b = tree.addFile("/scavo/B.em.json", "B.em.json");
  const s1 = tree.add(new DocumentStore(graphDoc("g1")), "g1", null, a.id);
  const s2 = tree.add(new DocumentStore(graphDoc("g2")), "g2", null, a.id);
  const s3 = tree.add(new DocumentStore(graphDoc("g3")), "g3", null, b.id);
  const loose = tree.add(new DocumentStore(graphDoc("imp")), "imp");
  eq(tree.slotsOf(a.id).map((s) => s.id), [s1.id, s2.id], "F2 · file A holds g1 and g2, from fileId");
  eq(tree.slotsOf(b.id).map((s) => s.id), [s3.id], "F2 · file B holds g3");
  eq(tree.slotsOf(null).map((s) => s.id), [loose.id], "F2 · an import sits in «Senza file»");
  eq([s1.path, s3.path, loose.path], ["/scavo/A.em.json", "/scavo/B.em.json", null], "F2 · the slot's path mirrors its file's");
  tree.setActive(s3.id);
  eq(tree.activeFile()?.id, b.id, "F2 · the file ⌘S writes is the active graph's");
  tree.setActive(loose.id);
  eq(tree.activeFile(), null, "F2 · a loose active graph has no file: ⌘S is Save As");
  ok(!tree.fileDirty(a.id) && !tree.fileDirty(b.id), "F2 · nothing dirty at open");
  tree.assign(s2.id, b.id);
  ok(tree.fileDirty(a.id) && tree.fileDirty(b.id), "F2 · «Sposta in…» dirties BOTH files");
  eq(tree.slotsOf(b.id).map((s) => s.id), [s2.id, s3.id], "F2 · …and the graph is B's now");
  eq(s2.path, "/scavo/B.em.json", "F2 · …its path follows");
  tree.setFilePath(a.id, "/altrove/A2.em.json", "A2.em.json");
  eq([a.name, s1.path], ["A2.em.json", "/altrove/A2.em.json"], "F2 · Save As moves the file, its graphs follow");
  tree.removeFile(b.id);
  eq([tree.files.length, tree.slots.length], [1, 2], "F2 · closing a file closes its graphs, not the others");
  eq(pathTail("/Users/x/Documents/SanPietro/EM/Tempio.em.json"), "…/SanPietro/EM/Tempio.em.json", "F1 · the tail of a path");

  // F1 · the panel: two levels, the target marked
  const t2 = new EMTree();
  const fa = t2.addFile("/s/A.em.json", "A.em.json");
  t2.add(new DocumentStore(graphDoc("g1")), "g1", null, fa.id);
  const act = t2.add(new DocumentStore(graphDoc("g2")), "g2", null, fa.id);
  t2.add(new DocumentStore(graphDoc("imp")), "imp");
  t2.setActive(act.id);
  const host = document.createElement("div");
  renderEMTree(host, t2, { onActivate() {}, onRemove() {}, onOpen() {}, onNew() {}, onRename() {} }, (k) => k);
  const files = [...host.querySelectorAll(".et-file")];
  eq(files.length, 2, "F1 · one group per file + «Senza file»");
  eq(files[0].querySelectorAll(".et-slot").length, 2, "F1 · the file's two graphs are under it");
  ok(files[0].classList.contains("et-file-active"), "F1 · the active graph's file is marked");
  ok(files[1].classList.contains("et-nofile") && files[1].querySelectorAll(".et-slot").length === 1,
     "F1 · the import is under «Senza file»");
  ok(files[0].querySelector(".et-file-tail")?.textContent.includes("A.em.json"), "F1 · the path tail is visible");
}

// ── F5 · an epoch's date is born when it is written ─────────────────────────
const epochPdgIncoherent = (st) => {
  // the s3Dgraphy rule (diagnostics.paradata_group_incoherences), for epochs
  const g = st.doc.graph;
  const out = [];
  for (const e of g.edges.filter((x) => x.edge_type === "has_paradata_nodegroup")) {
    const owner = g.nodes.find((n) => n.id === e.source);
    if (owner?.node_type !== "EpochNode") continue;
    for (const m of g.edges.filter((x) => x.edge_type === "is_in_paradata_nodegroup" && x.target === e.target)) {
      const p = g.nodes.find((n) => n.id === m.source);
      if (p?.node_type === "property"
          && !g.edges.some((x) => x.edge_type === "has_property" && x.source === owner.id && x.target === p.id)) out.push(p.id);
    }
  }
  return out;
};
{
  const doc = (nodes, edges = []) => ({ header: {}, graph: { graph_id: "g", nodes, edges }, layout: {} });
  // an undated epoch: nothing is made
  const st = new DocumentStore(doc([{ id: "ep", node_type: "EpochNode", name: "Età" }]));
  const r = st.ensureAllEpochParadata();
  eq([st.doc.graph.nodes.length, r.placeholdersRemoved], [1, 0], "F5 · an undated epoch gets no group, no property");
  // a dated epoch: its dates, each the epoch's has_property
  const sd = new DocumentStore(doc([{ id: "ep", node_type: "EpochNode", name: "Età", data: { start_time: -200 } }]));
  sd.ensureAllEpochParadata();
  const props = sd.doc.graph.nodes.filter((n) => n.node_type === "property");
  eq(props.map((p) => [p.name, p.description]), [["absolute_time_start", "-200"]], "F5 · only the written bound gets a property");
  eq(epochPdgIncoherent(sd), [], "F5 · …and it is the epoch's has_property");
  // writing a bound by hand makes it, with has_property, in one undo step
  const sw = new DocumentStore(doc([{ id: "ep", node_type: "EpochNode", name: "Età" }]));
  sw.setEpochBound("ep", "end", "50");
  eq(sw.doc.graph.nodes.filter((n) => n.node_type === "property").map((p) => p.description), ["50"], "F5 · setEpochBound gives the date its property");
  eq(epochPdgIncoherent(sw), [], "F5 · …with has_property");
  sw.undo();
  eq(sw.doc.graph.nodes.length, 1, "F5 · …and one undo takes all of it back");
  // a new epoch from the UI: no placeholder
  const sn = new DocumentStore(doc([]));
  sn.addEpoch?.("Nuova");
  eq(sn.doc.graph.nodes.filter((n) => n.node_type === "property").length, 0, "F5 · a new epoch is born with no empty dates");
  // an OLD file: two empty placeholders, no has_property → removed, counted
  const old = doc([
    { id: "ep", node_type: "EpochNode", name: "Età" },
    { id: "pd", node_type: "ParadataNodeGroup", name: "PD_Età" },
    { id: "s", node_type: "property", name: "absolute_time_start", description: "", data: { property_type: "absolute_time_start" } },
    { id: "e", node_type: "property", name: "absolute_time_end", description: "", data: { property_type: "absolute_time_end" } },
    { id: "kept", node_type: "property", name: "absolute_time_end", description: "", data: { property_type: "absolute_time_end" } },
    { id: "ex", node_type: "extractor", name: "D.01.01" },
  ], [
    { id: "a", source: "ep", target: "pd", edge_type: "has_paradata_nodegroup" },
    { id: "b", source: "s", target: "pd", edge_type: "is_in_paradata_nodegroup" },
    { id: "c", source: "e", target: "pd", edge_type: "is_in_paradata_nodegroup" },
  ]);
  const chain = JSON.parse(JSON.stringify(old));   // before the store cleans `old` in place
  const so = new DocumentStore(old);
  const ro = so.ensureAllEpochParadata();
  eq(ro.placeholdersRemoved, 2, "F5 · an old file's two empty placeholders go, counted");
  ok(!so.node("pd"), "F5 · …and the group that held only them");
  ok(so.node("kept"), "F5 · a property outside the epoch's group is not touched");
  // an empty one that carries a provenance chain is a person's: it stays
  chain.graph.edges.push({ id: "d", source: "ex", target: "s", edge_type: "has_data_provenance" });
  const sc = new DocumentStore(chain);
  eq(sc.ensureAllEpochParadata().placeholdersRemoved, 1, "F5 · an empty date with a chain is kept (only the other goes)");
  eq(epochPdgIncoherent(sc), [], "F5 · …and gets its has_property");
}

// ── F5 on E.D.'s San Pietro file (a COPY) ───────────────────────────────────
const TEMPIO = process.env.OF_TEMPIO;
if (TEMPIO) {
  const parsed = parseContainer(JSON.parse(readFileSync(TEMPIO, "utf8")));
  let removed = 0;
  const graphs = parsed.members.map((m) => {
    const st = new DocumentStore(m.doc);
    removed += st.ensureAllEpochParadata().placeholdersRemoved;
    eq(epochPdgIncoherent(st), [], `F5 · San Pietro «${m.id}»: every epoch date is the epoch's has_property`);
    return { id: m.id, doc: JSON.parse(st.toJSON()) };
  });
  console.log(`  San Pietro: ${parsed.members.length} graph(s), ${removed} empty date placeholder(s) removed`);
  ok(removed === 16, `F5 · San Pietro: the 16 placeholders of the 2 Oct save go (got ${removed})`);
  if (process.env.OF_OUT) {
    const out = buildContainer({ graphs, shelf: parsed.shelf, corpus: parsed.corpus, activeGraphId: parsed.activeGraphId });
    writeFileSync(process.env.OF_OUT, JSON.stringify(out, null, 1));
    console.log(`  written ${process.env.OF_OUT}`);
  }
}

if (fails.length) {
  console.error(`ogni-file: ${fails.length} of ${checks} checks FAILED:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`ogni-file: ${checks} checks passed`);
