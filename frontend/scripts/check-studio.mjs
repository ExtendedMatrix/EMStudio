// STRUTTURA (30 set 2026) · executable check of the desk's structure.
//
//   node scripts/check-studio.mjs
//
// The pure modules of the night, bundled with esbuild and run in node like
// check-tiling does: one workspace in the bar and the parked ones kept, the
// outliner by epoch, the facets of the table, the issues model.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const SRC = new URL("../src/", import.meta.url).pathname;
async function load(entry) {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false, logLevel: "silent",
                                  loader: { ".json": "json" } });
  return import("data:text/javascript;base64," +
                Buffer.from(b.outputFiles[0].text).toString("base64") + `#${entry}`);
}

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++;
};

// ── 1 · one workspace; the others parked, their saved layouts kept ─────────
{
  // a session left on a parked tab, with an arrangement saved for it
  mem.set("emstudio.workspace", "dtc");
  const saved = { dtc: { wins: [{ id: "dtc:1", type: "graph", state: { mode: "dtc" } }],
                         activeId: "dtc:1", layout: { kind: "leaf", winId: "dtc:1" } } };
  mem.set("emstudio.windows", JSON.stringify(saved));
  const W = await load("workspace.ts");
  // COLLEGARE (29 set 2026, E.D.) · four spaces, one per activity
  // NIGHT-SPAZIO (30 set 2026) · and the fifth, «Spazio»
  eq(W.WORKSPACES.map((w) => w.id), ["canvas", "provenance", "assets", "narrative", "space"],
     "the bar holds the five spaces");
  eq(W.WORKSPACES[0].labelKey, "ws.stratigraphy", "…the first called Stratigrafia");
  eq(W.PARKED_WORKSPACES.map((w) => w.id), ["dtc", "comparisons", "annotator"],
     "the three others are parked with their ids unchanged");
  eq(W.activeWorkspace(), "canvas", "a persisted id pointing at a parked tab falls back to canvas");
  ok(W.applyArrangement("canvas"), "the Stratigrafia arrangement applies");
  const ids = W.paneIds(W.layoutOf("canvas"));
  // G7 (MICRO grafo reattivo) · the graphs of the workspace above the Outliner
  eq(W.windowsOf("canvas").map((w) => w.type), ["graph", "emtree", "outliner", "table", "inspector"],
     "five windows: graph (the anchor), the graphs, outliner, the warnings table, inspector");
  eq(ids.map((id) => W.windowsOf("canvas").find((w) => w.id === id).type),
     ["emtree", "outliner", "graph", "table", "inspector"], "graphs above the outliner | graph above the table | inspector");
  // SHIFT-A (1 ott 2026) · the outliner is a WINDOW TYPE of its own, not the
  // second tab of an EMtree window: nothing to open it «on»
  eq(W.windowsOf("canvas")[1].state["current.panel"], undefined,
     "the Outliner is its own window type, with no tab to open on");
  eq(W.winMode(W.windowsOf("canvas")[0]), "matrix", "the graph opens in Matrix");
  const after = JSON.parse(mem.get("emstudio.windows"));
  ok(after.dtc && after.dtc.activeId === "dtc:1",
     "the parked tab's saved arrangement survives the next save");
}

// ── 1a · SHIFT-A · a saved Studio from before the Outliner was a window ─────
//
// The arrangement is loaded as it was saved — and on the way in, the EMtree
// window on its Outliner tab becomes an Outliner window, and the Inspector that
// was showing the Log shows the Inspector. The tree (who is where) is untouched.
{
  mem.set("emstudio.workspace", "canvas");
  mem.set("emstudio.windows", JSON.stringify({
    canvas: {
      wins: [
        { id: "canvas:1", type: "graph", state: { mode: "matrix" } },
        { id: "canvas:2", type: "emtree", state: { "current.panel": "nodelist" } },
        { id: "canvas:3", type: "inspector", state: { "current.panel": "logpanel" } },
      ],
      activeId: "canvas:1",
      layout: { kind: "split", dir: "row", ratio: 0.2, a: { kind: "leaf", winId: "canvas:2" },
                b: { kind: "split", dir: "row", ratio: 0.8, a: { kind: "leaf", winId: "canvas:1" },
                     b: { kind: "leaf", winId: "canvas:3" } } },
    },
  }));
  const b = await esbuild.build({ entryPoints: [`${SRC}workspace.ts`], bundle: true,
                                  format: "esm", write: false, logLevel: "silent" });
  const W = await import("data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64") + "#migration");
  const wins = W.windowsOf("canvas");
  eq(wins.map((w) => w.type), ["graph", "outliner", "inspector"],
     "saved emtree/nodelist comes back as an Outliner window");
  eq([wins[1].state["current.panel"], wins[2].state["current.panel"]], [undefined, undefined],
     "…and neither it nor the Inspector keeps a tab that no longer exists");
  eq(W.paneIds(W.layoutOf("canvas")), ["canvas:2", "canvas:1", "canvas:3"],
     "the arrangement is the one that was saved: outliner | graph | inspector");
  await Promise.resolve();
  eq(JSON.parse(mem.get("emstudio.windows")).canvas.wins.map((w) => w.type),
     ["graph", "outliner", "inspector"], "…and the save is rewritten once, migrated");
  mem.delete("emstudio.windows");
}

// ── 1b · the arrangement verbs the gestures call ────────────────────────────
{
  const W = await load("workspace.ts");
  const L = await load("shell/layout.ts");
  const I = await load("window-icons.ts");
  W.applyArrangement("canvas");
  const g = W.windowsOf("canvas")[0];
  const made = W.splitWindow(g.id, "col", "canvas", 0.3, "a");
  const leafOf = (p, id) => p.kind === "leaf" ? null
    : (p.a.kind === "leaf" && p.a.winId === id) || (p.b.kind === "leaf" && p.b.winId === id)
      ? p : leafOf(p.a, id) ?? leafOf(p.b, id);
  const sp = leafOf(W.layoutOf("canvas"), made.id);
  eq([sp.dir, sp.ratio, sp.a.winId, sp.b.winId], ["col", 0.3, made.id, g.id],
     "splitWindow cuts at the pointer's ratio, the new window on the corner's side");
  const clamped = W.splitWindow(made.id, "row", "canvas", 0.99);
  eq(leafOf(W.layoutOf("canvas"), clamped.id).ratio, 0.88, "…the ratio is held within 0.12–0.88");
  const { dividers } = L.layoutRects(W.layoutOf("canvas"), { x: 0, y: 0, w: 1000, h: 800 });
  eq(new Set(dividers.map((d) => d.path)).size, dividers.length, "every divider has its own path");
  const root = dividers.find((d) => d.path === "");
  W.setSplitRatioAt("", 0.4, "canvas");
  eq(W.layoutOf("canvas").ratio, 0.4, "a divider moves by its path — the root too");
  ok(root, "…and the root divider is listed");
  const before = W.windowsOf("canvas").length;
  const gone = W.closeSplitSide("", "a", "canvas");
  // G7 · the left side is the graphs ABOVE the outliner: both go with it
  eq(gone.length, 2, "dragging the root divider over the left column closes it (the graphs and the outliner)");
  eq(W.windowsOf("canvas").length, before - 2, "…and only them");
  ok(W.paneIds(W.layoutOf("canvas")).includes(W.activeWin("canvas").id),
     "the focus lands in what stayed");
  for (const t of Object.keys(W.WINDOW_TYPE_META))
    ok(I.WINDOW_ICON_PATHS[t] && W.WINDOW_TYPE_META[t].icon.startsWith("<svg"),
       `the ${t} window has a line icon`);
}

// ── 2 · the outliner by epoch ───────────────────────────────────────────────
{
  const O = await load("outline.ts");
  const node = (id, node_type, data) => ({ id, name: id, node_type, data });
  const edge = (source, edge_type, target) => ({ source, edge_type, target });
  const nodes = [
    node("E1", "EpochNode", { start_time: 100, end_time: 300 }),
    node("E2", "EpochNode", { start_time: 1100, end_time: 1300 }),
    node("E2a", "EpochNode", { start_time: 1200, end_time: 1300 }),
    node("E2b", "EpochNode", { start_time: 1100, end_time: 1200 }),
    node("USM1", "US"), node("RSF1", "US"), node("RSF2", "US"),
    node("SF9", "US"), node("US7", "US"), node("X", "PropertyNode"),
  ];
  const edges = [
    edge("E2", "has_sub_epoch", "E2b"), edge("E2", "has_sub_epoch", "E2a"),
    edge("USM1", "has_first_epoch", "E2"), edge("RSF1", "has_first_epoch", "E2"),
    edge("RSF2", "has_first_epoch", "E2"), edge("SF9", "has_first_epoch", "E1"),
    edge("RSF1", "is_part_of", "USM1"), edge("RSF2", "is_part_of", "USM1"),
  ];
  const doc = { graph: { nodes, edges } };
  const isUnit = (t) => t === "US";
  const o = O.buildOutline(doc, nodes, isUnit);
  eq(o.epochs.map((e) => [e.node.id, e.depth]),
     [["E2", 0], ["E2a", 1], ["E2b", 1], ["E1", 0]],
     "newest epoch first; sub-epochs nested from has_sub_epoch, newest first");
  eq(o.epochs[0].units.map((u) => [u.node.id, u.depth]),
     [["USM1", 0], ["RSF1", 1], ["RSF2", 1]], "members indented under their container");
  eq(o.unplaced.map((u) => u.node.id), ["US7"], "a unit with no epoch is listed apart");
  eq(O.epochSpan(nodes[1]), "1100–1300", "the span reads start–end");
  const f = O.buildOutline(doc, nodes, isUnit, (n) => n.id === "RSF2");
  eq(f.epochs.map((e) => e.node.id), ["E2"], "filtering drops the epochs left empty");
  eq(f.epochs[0].units.map((u) => u.node.id), ["USM1", "RSF2"],
     "…and keeps a matching member in its container's context");
}

// ── 5 · the full-text search of the name strip ──────────────────────────────
{
  globalThis.window ??= globalThis;
  const Srch = await load("search.ts");
  const doc = { graph: {
    nodes: [
      { id: "u1", name: "USM101", node_type: "US", description: "Muro in blocchetti" },
      { id: "p1", name: "material_type", node_type: "property", data: { value: "tufo giallo" } },
      { id: "e1", name: "Medioevo", node_type: "EpochNode" },
      { id: "u2", name: "US102", node_type: "US", description: "Strato" },
    ],
    edges: [
      { source: "u1", target: "p1", edge_type: "has_property" },
      { source: "u1", target: "e1", edge_type: "has_first_epoch" },
    ] } };
  const ids = (q) => Srch.searchGraph(doc, q).map((h) => h.node.id);
  ok(ids("tufo").includes("u1"), "a property VALUE finds the unit that has it");
  ok(ids("medioevo").includes("u1"), "…and so does its epoch's name");
  eq(ids("muro medioevo"), ["u1"], "every word must match (AND)");
  eq(ids("medioevo"), ["e1", "u1"], "a hit on the NAME ranks before a hit through the epoch");
  ok(Srch.highlight("Muro <b>", "muro").startsWith("<mark>Muro</mark> &lt;b&gt;"),
     "the excerpt is escaped and the words marked");
}

// ── 6 · the facets engine and the table's views ─────────────────────────────
{
  const F = await load("facets.ts");
  const rows = [
    { text: "usm101 muro", fx: { type: ["US"], epoch: ["E2a", "E2"], state: ["pd"] } },
    { text: "sf100 capitello", fx: { type: ["SF"], epoch: ["E1"], state: [] } },
    { text: "us102 strato", fx: { type: ["US"], epoch: ["E2"], state: ["warn"] } },
  ];
  const label = (k, v) => ({ E1: "Età imperiale", E2: "Medioevo", E2a: "Medioevo · fase I" })[v] ?? v;
  const pass = (sel) => rows.filter((r) => F.passRow(r, sel, label)).map((r) => r.text.split(" ")[0]);
  eq(pass({ q: "", f: { type: ["US"] } }), ["usm101", "us102"], "a ticked value filters");
  eq(pass({ q: "", f: { type: ["US"], state: ["pd"] } }), ["usm101"], "facets combine (AND across facets)");
  eq(pass({ q: "", f: { epoch: ["E2"] } }), ["usm101", "us102"], "a mother epoch finds the units of its sub-epochs");
  eq(pass({ q: "epoca:med", f: {} }), ["usm101", "us102"], "`epoca:med` matches the LABEL (Italian key)");
  eq(pass({ q: "epoch:imperiale", f: {} }), ["sf100"], "`epoch:` is the English key");
  eq(pass({ q: "tipo:sf capitello", f: {} }), ["sf100"], "a token and a word together");
  const c = F.facetCounts(rows, { q: "", f: { type: ["SF"] } }, "type");
  eq([c.get("US"), c.get("SF")], [2, 1], "counts ignore the facet's own selection");
  const mother = { v: "E2", label: "Medioevo", children: ["E2a", "E2b"] };
  eq(F.toggleValue({ q: "", f: {} }, "epoch", mother, true).f.epoch, ["E2", "E2a", "E2b"],
     "ticking a mother ticks her sub-epochs");
  const defs = [{ key: "epoch", labelKey: "table.fx.epoch",
                  values: () => [mother, { v: "E2a", label: "a" }, { v: "E2b", label: "b" }] },
                { key: "type", labelKey: "table.fx.type",
                  values: () => ["A", "B", "C", "D"].map((v) => ({ v, label: v })) }];
  eq(F.selectionTokens({ q: "", f: { epoch: ["E2", "E2a", "E2b"] } }, defs).map((x) => x.label),
     ["Medioevo"], "a mother ticked with her children shows as ONE token");
  eq(F.selectionTokens({ q: "", f: { type: ["A", "B", "C", "D"] } }, defs)[0].count, 4,
     "more than three in one facet collapse into «Tipo: 4 ×»");
}
{
  const V = await load("table-views.ts");
  const I = await load("issues.ts");
  const R = await load("rules.ts");
  // RIFINITURE · an extractor named before the rule <source>.<NN> is INFORMATION,
  // with «Rinomina secondo la regola» as its action and as a bulk (one call)
  {
    const Nm = await load("naming.ts");
    const g = { nodes: [{ id: "d", node_type: "document", name: "D.3" },
      { id: "a", node_type: "extractor", name: "D.3.1" }, { id: "b", node_type: "extractor", name: "D.3.2" }],
      edges: [{ source: "a", target: "d", edge_type: "extracted_from" }, { source: "b", target: "d", edge_type: "extracted_from" }] };
    const calls = [];
    const iss = I.issues({ doc: { graph: g }, nodes: g.nodes, isUnit: () => false, names: Nm.nameStatusMap({ graph: g }),
      renameRule: { label: "rename", bulkLabel: (n) => `all ${n}`, run: (ids) => calls.push(ids) },
      t: (k, v) => `${k}${v ? JSON.stringify(v) : ""}` }).filter((i) => i.rule === "naming");
    eq(iss.map((i) => [i.node, i.sev, i.bulk?.key]), [["a", "info", "name-rule"], ["b", "info", "name-rule"]],
       "two out-of-rule extractors: two INFO rows, one bulk key");
    ok(iss[0].txt.includes("D.3.01"), "…the row says the rule's name");
    iss[0].action.run(); iss[0].bulk.run(["a", "b"]);
    eq(calls, [["a"], ["a", "b"]], "…the action renames one, the bulk all of them in one call");
  }
  const fx = JSON.parse(await (await import("node:fs/promises")).readFile(
    new URL("../../.claude/wip/design/paradata-in-pancia/pancia_A_estrattore_su_RSF.em.json",
            import.meta.url), "utf8").catch(() => "null"));
  if (fx) {
    const g = fx.graphs ? Object.values(fx.graphs)[0] : fx.graph;
    const doc = { graph: g };
    const iss = I.issues({ doc, nodes: g.nodes, isUnit: R.isStratigraphicType,
      edgeAllowed: (et, st, dt) => R.allowedEdgeTypes(st, dt).map(R.canonicalEdgeType)
        .includes(R.canonicalEdgeType(et)),
      t: (k, v) => `${k}${v ? JSON.stringify(v) : ""}` });
    const socket = iss.filter((i) => i.rule === "datamodel");
    // connections 1.6.24: an extractor may read FROM A UNIT (extracted_from.target += StratigraphicNode),
    // so the extractor reading the RSF — pancia A's one datamodel warning until 1.6.23 — is now legal.
    eq(socket.length, 0, "pancia A: NO datamodel warning — since 1.6.24 an extractor may read from an RSF");
    const xId = g.nodes.find((n) => n.name === "X.01")?.id;
    let sorted = 0;
    const lane = I.issues({ doc, nodes: g.nodes, isUnit: R.isStratigraphicType, lanesInOrder: false,
      sortLanes: { label: "sort", run: () => { sorted++; } }, t: (k) => k })
      .find((i) => i.rule === "chronology");
    ok(lane && lane.sev === "warn" && lane.node === "", "the lane order is a document-level warning");
    lane.action.run();
    eq(sorted, 1, "…whose ACTION is «Ordina lane per data» (the banner's button, now the row's)");
    ok(!!xId, "the extractor X.01 is in the fixture");
    const unitOf = I.unitOfIssue(doc, R.isStratigraphicType, g.nodes);
    eq(unitOf(xId), "USM101", "…and its unit (its paradata group's) is USM101");
    const ctx = { doc, nodes: g.nodes, isUnit: R.isStratigraphicType, issues: iss,
                  unitOfIssue: unitOf, t: (k) => k };
    const ix = V.indexOf(ctx);
    eq(V.writtenStart(ix, "USM101"), 180, "the written date is the unit's absolute_time_start");
    const ff = V.fromFinds(ix, "USM101");
    eq([ff.v, ff.via, ff.origin, ff.fromEpoch], [100, "RSF1", "SF100", true],
       "from the finds: RSF100b ← SF100 (changed_from), dated by the original's epoch");
    eq(V.chronRows(ctx, ix).find((r) => r.node.id === "USM101").chron, null,
       "the propagated column is s3Dgraphy's (asked of the bridge): no answer → nothing invented");
    const facts = V.factsFor("Units", ctx, ix);
    ok(!facts.get("USM101").fx.state.includes("warn"), "USM101 no longer carries «with warnings» (1.6.24)");
    ok(facts.get("USM101").fx.state.includes("pd"), "…and «with paradata»");
    eq(V.epochTree(ctx, ix).map((e) => e.node.id), ["EP_MED", "EP_ROM"], "epochs newest first");
    const cards = V.docCards(ctx, ix, new Set(["RSF1"]));
    eq(cards.length, 0, "a document card is for documents only");
  }
}

console.log(`studio: ${checks} checks passed`);
