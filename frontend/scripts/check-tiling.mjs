// WIN5 · executable check of the tiling model in src/workspace.ts.
//
//   node scripts/check-tiling.mjs
//
// The frontend has no test runner (see check-naming.mjs), so the module is
// bundled with the project's own esbuild and exercised in node. `workspace.ts`
// touches localStorage, which node 22+ provides only with a flag — so the check
// stubs it before importing. Everything else is pure state.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

// a localStorage that exists and forgets nothing, so persistence is exercised
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}workspace.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const W = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// ── a fresh workspace is a single leaf ──────────────────────────────────────
{
  const layout = W.layoutOf("canvas");
  eq(layout.kind, "leaf", "a workspace starts as one area");
  eq(W.paneIds(layout).length, 1, "holding exactly one window");
  ok(!W.isTiled("canvas"), "and is not tiled");
}

// ── split makes two areas, and the new one is active ────────────────────────
{
  const first = W.activeWin("canvas");
  const made = W.splitWindow(first.id, "row", "canvas");
  ok(made, "splitting an existing area yields a window");
  ok(W.isTiled("canvas"), "the workspace is now tiled");
  const ids = W.paneIds(W.layoutOf("canvas"));
  eq(ids.length, 2, "two areas");
  ok(ids.includes(first.id) && ids.includes(made.id), "both windows are placed");
  eq(W.activeWin("canvas").id, made.id, "the new area takes focus");
  eq(made.type, first.type, "a split inherits the type it was split from");
  eq(
    W.winMode(made),
    W.winMode(first),
    "and its mode — you split to compare what you were looking at",
  );
}

// ── every window the workspace has is placed exactly once ───────────────────
{
  const wins = W.windowsOf("canvas").map((w) => w.id).sort();
  const placed = [...W.paneIds(W.layoutOf("canvas"))].sort();
  eq(placed, wins, "the tree places every window, once");
  const seen = new Set(placed);
  eq(seen.size, placed.length, "no window is placed twice");
}

// ── addWindow (no split) still lands somewhere ──────────────────────────────
{
  const extra = W.addWindow("graph", { mode: "dtc" }, "canvas");
  ok(
    W.paneIds(W.layoutOf("canvas")).includes(extra.id),
    "a window added without an explicit split is still given an area",
  );
}

// ── the divider clamps: an area can never be collapsed to nothing ───────────
{
  const [firstId] = W.paneIds(W.layoutOf("canvas"));
  W.setSplitRatio(firstId, 0.99, "canvas");
  const findRatio = (p) =>
    p.kind === "leaf"
      ? null
      : W.paneIds(p.a).length === 1 && W.paneIds(p.a)[0] === firstId
        ? p.ratio
        : (findRatio(p.a) ?? findRatio(p.b));
  ok(findRatio(W.layoutOf("canvas")) <= 0.85, "a divider cannot swallow its sibling");
  W.setSplitRatio(firstId, -1, "canvas");
  ok(findRatio(W.layoutOf("canvas")) >= 0.15, "nor collapse its own area");
}

// ── closing an area JOINS the split ─────────────────────────────────────────
{
  const before = W.paneIds(W.layoutOf("canvas")).length;
  const victim = W.activeWin("canvas").id;
  ok(W.closeWindow(victim, "canvas"), "an area of a tiled workspace can close");
  const after = W.paneIds(W.layoutOf("canvas"));
  eq(after.length, before - 1, "the tree loses exactly that area");
  ok(!after.includes(victim), "and never mentions it again");
  eq(
    after.sort(),
    W.windowsOf("canvas").map((w) => w.id).sort(),
    "tree and window list stay in agreement",
  );
}

// ── the last area never closes: a workspace with nothing to show is a bug ───
{
  while (W.windowsOf("canvas").length > 1)
    W.closeWindow(W.activeWin("canvas").id, "canvas");
  ok(
    !W.closeWindow(W.activeWin("canvas").id, "canvas"),
    "the last area refuses to close",
  );
  eq(W.layoutOf("canvas").kind, "leaf", "and the workspace is a single leaf again");
}

// ── the arrangement is persisted ────────────────────────────────────────────
{
  const raw = mem.get("emstudio.windows");
  ok(raw, "the arrangement is written to storage");
  const parsed = JSON.parse(raw);
  ok(parsed.canvas?.layout, "including the layout tree, not just the window list");
}

// ── free tiling: nested splits ──────────────────────────────────────────────
{
  const a = W.activeWin("canvas");
  const b = W.splitWindow(a.id, "row", "canvas");   // two areas
  const c = W.splitWindow(b.id, "col", "canvas");   // split the SECOND one again
  eq(W.paneIds(W.layoutOf("canvas")).length, 3, "an area can be split again — nesting works");
  ok(
    W.paneIds(W.layoutOf("canvas")).every(
      (id, i, all) => all.indexOf(id) === i,
    ),
    "and every area is still placed exactly once",
  );
  // the nested split really is nested: one child of the root is a split itself
  const root = W.layoutOf("canvas");
  ok(root.kind === "split", "the root is a split");
  ok(
    root.a.kind === "split" || root.b.kind === "split",
    "with a split as one of its sides — a tree, not a flat row",
  );
  eq(W.activeWin("canvas").id, c.id, "the newest area has focus");
}

// ── join: an area absorbs its sibling ───────────────────────────────────────
{
  const before = W.paneIds(W.layoutOf("canvas")).length;
  const me = W.activeWin("canvas").id;
  ok(W.canJoin(me, "canvas"), "an area inside a split can join");
  ok(W.joinWindow(me, "canvas"), "the join succeeds");
  const after = W.paneIds(W.layoutOf("canvas"));
  eq(after.length, before - 1, "one area fewer");
  ok(after.includes(me), "the area that joined is the one that stayed");
  eq(W.activeWin("canvas").id, me, "and it keeps the focus");
  eq(
    after.sort(),
    W.windowsOf("canvas").map((w) => w.id).sort(),
    "the absorbed window is gone from the list too — no orphans",
  );
}

// ── a single area has nothing to join ───────────────────────────────────────
{
  while (W.windowsOf("canvas").length > 1)
    W.joinWindow(W.activeWin("canvas").id, "canvas");
  eq(W.layoutOf("canvas").kind, "leaf", "joining down to one area leaves a leaf");
  ok(
    !W.canJoin(W.activeWin("canvas").id, "canvas"),
    "and a lone area reports that there is nothing to join",
  );
  ok(!W.joinWindow(W.activeWin("canvas").id, "canvas"), "so the join refuses");
}

// ── who a corner drag could join with ───────────────────────────────────────
{
  const a = W.activeWin("canvas");
  const b = W.splitWindow(a.id, "row", "canvas");
  eq(W.siblingIdsOf(b.id, "canvas"), [a.id], "the neighbour of a split area is its sibling");
  eq(W.siblingIdsOf(a.id, "canvas"), [b.id], "and the relation is symmetric");
  // split the sibling: now A's neighbour is a SUB-TREE, and all of it is
  // absorbable — which is what the gesture must be told
  const c = W.splitWindow(b.id, "col", "canvas");
  eq(W.siblingIdsOf(a.id, "canvas").sort(), [b.id, c.id].sort(),
    "a neighbour that is itself split reports every window it holds");
  ok(!W.siblingIdsOf("nope", "canvas").length, "an unknown area has no neighbour");
  while (W.windowsOf("canvas").length > 1)
    W.joinWindow(W.activeWin("canvas").id, "canvas");
  eq(W.siblingIdsOf(W.activeWin("canvas").id, "canvas"), [],
    "a lone area has no neighbour to join");
}

// ── WIN7 · magnify: one area fills the workspace, and the tree comes back ───
{
  const a = W.activeWin("canvas");
  const b = W.splitWindow(a.id, "row", "canvas");
  const c = W.splitWindow(b.id, "col", "canvas"); // a nested arrangement to keep
  const before = JSON.stringify(W.layoutOf("canvas"));
  const wins = W.windowsOf("canvas").map((w) => w.id).sort();

  ok(W.maximizedWin("canvas") === null, "nothing is magnified to begin with");
  ok(W.toggleMaximize(b.id, "canvas"), "an area can be magnified");
  eq(W.maximizedWin("canvas"), b.id, "and the workspace says which one");
  eq(W.layoutOf("canvas").kind, "leaf", "the workspace shows a single area");
  eq(W.paneIds(W.layoutOf("canvas")), [b.id], "and it is the magnified one");
  eq(W.activeWin("canvas").id, b.id, "magnifying focuses it — not a picture");
  eq(
    W.windowsOf("canvas").map((w) => w.id).sort(),
    wins,
    "no window is lost while one fills the screen",
  );

  // magnifying another one swaps, keeping the arrangement to return to
  W.toggleMaximize(c.id, "canvas");
  eq(W.maximizedWin("canvas"), c.id, "magnifying a second area swaps");

  ok(!W.toggleMaximize(c.id, "canvas"), "toggling the magnified area comes back");
  eq(W.maximizedWin("canvas"), null, "nothing is magnified any more");
  eq(
    JSON.stringify(W.layoutOf("canvas")),
    before,
    "and the arrangement returns EXACTLY as it was — ratios and nesting included",
  );

  // a structural edit while magnified ends the magnification instead of
  // corrupting the tree (repairLayout would otherwise re-append the hidden ones)
  W.toggleMaximize(b.id, "canvas");
  W.splitWindow(b.id, "row", "canvas");
  eq(W.maximizedWin("canvas"), null, "splitting while magnified brings the arrangement back");
  eq(
    [...W.paneIds(W.layoutOf("canvas"))].sort(),
    W.windowsOf("canvas").map((w) => w.id).sort(),
    "and the tree still places every window exactly once",
  );

  ok(!W.toggleMaximize("nope", "canvas"), "an unknown area cannot be magnified");
  while (W.windowsOf("canvas").length > 1)
    W.joinWindow(W.activeWin("canvas").id, "canvas");
}

// ── U1 · the mode registry: one window type, several modes ──────────────────
// The point of the registry is that a mode exists in ONE place. These checks
// are what stops a mode from being offered by a menu and rejected by the
// validator (the `multigraph` bug), and what pins the per-type slot so a
// transform does not hand one type's mode to another.
{
  eq(W.winModes("graph"), W.GRAPH_MODES, "the graph window's modes ARE GRAPH_MODES");
  eq([...W.winModes("storage")], ["filesystem", "minio"], "storage offers its two backends");
  eq([...W.winModes("viewer")], ["single", "gallery"], "viewer offers single + gallery");
  eq([...W.winModes("table")], [], "a type with no modes has no mode list");

  // every mode any type offers must be settable ON that type — the exact
  // agreement between menu and validator that the registry exists to keep
  for (const [type, modes] of Object.entries(W.WINDOW_MODES)) {
    const w = { id: `probe-${type}`, type, state: {} };
    for (const mode of modes) {
      W.setWinModeOf(w, mode);
      eq(W.winModeOf(w), mode, `${type} accepts its own mode ${mode}`);
    }
  }

  const s = { id: "probe", type: "storage", state: {} };
  eq(W.winModeOf(s), "filesystem", "a fresh window opens in its first mode");
  ok(!W.setWinModeOf(s, "matrix"), "a storage window refuses a graph mode");
  eq(W.winModeOf(s), "filesystem", "and stays where it was");
  ok(!W.setWinModeOf(s, "filesystem"), "setting the mode it already has is not a change");

  // stale state must not strand a window with nothing to show
  const stale = { id: "stale", type: "viewer", state: { "mode.viewer": "gone" } };
  eq(W.winModeOf(stale), "single", "an unknown saved mode falls back to the first");

  // per-type slots: a transformed window finds its own mode again
  const t = { id: "t", type: "graph", state: {} };
  W.setWinModeOf(t, "dtc");
  t.type = "storage";
  W.setWinModeOf(t, "minio");
  eq(W.winModeOf(t), "minio", "as storage it is in the storage mode");
  t.type = "graph";
  eq(W.winModeOf(t), "dtc", "and transformed back it is still in dtc");
  eq(W.winMode(t), "dtc", "the typed graph reader agrees with the generic one");
}

// ── SHIFT-A · a SAVED arrangement is migrated: EMtree/nodelist → Outliner ────
//
// An EMtree window left on its `nodelist` tab WAS the outliner; it comes back as
// an `outliner` window. An Inspector left on `logpanel` forgets the tab (the Log
// is a drawer now). The rest passes through untouched — and a second pass
// changes nothing (idempotent), so a migrated save stays migrated.
{
  const out = W.migrateWin({ id: "a", type: "emtree", state: { "current.panel": "nodelist", keep: 1 } });
  eq([out.type, out.state["current.panel"], out.state.keep], ["outliner", undefined, 1],
     "emtree on its nodelist tab → an outliner window, other state kept");
  const tree = W.migrateWin({ id: "b", type: "emtree", state: { "current.panel": "emtree" } });
  eq([tree.type, tree.state["current.panel"]], ["emtree", "emtree"],
     "an EMtree on the multigraph stays an EMtree");
  const insp = W.migrateWin({ id: "c", type: "inspector", state: { "current.panel": "logpanel" } });
  eq([insp.type, insp.state["current.panel"]], ["inspector", undefined],
     "an Inspector left on the Log forgets the tab");
  eq(W.migrateWin(out), out, "a migrated window passes through unchanged");
  const g = { id: "d", type: "graph", state: { mode: "dtc" } };
  eq(W.migrateWin(g), g, "every other window is untouched");
  // MICRO-3DTILES-LOD · the «US view» is the Units now (it held one more column,
  // the first epoch, which the Units have); another sheet stays as it was
  const usv = W.migrateWin({ id: "e", type: "table", state: { "current.table.sheet": "US", "current.table.q": "x" } });
  eq([usv.state["current.table.sheet"], usv.state["current.table.q"]], ["Units", "x"],
     "a Table on the «US view» → on the Units, its filter kept");
  eq(W.migrateWin(usv), usv, "…and a second pass changes nothing");
  const docs = { id: "f", type: "table", state: { "current.table.sheet": "Documents" } };
  eq(W.migrateWin(docs), docs, "a Table on another sheet is untouched");
  ok(W.WINDOW_TYPE_META.outliner?.labelKey === "win.outliner",
     "the outliner has its own type entry (icon + label)");
}

// ── COLLEGARE · four spaces, one per activity; what a saved one becomes ─────
{
  const ids = W.WORKSPACES.filter((w) => w.builtin).map((w) => w.id);
  // NIGHT-SPAZIO (30 set 2026) · the fifth space, «Spazio» (scrivania v11b)
  eq(ids, ["canvas", "provenance", "assets", "narrative", "space"],
     "the five spaces, with the ids every saved arrangement is keyed by");
  eq(W.PARKED_WORKSPACES.map((w) => w.id), ["dtc", "comparisons", "annotator"], "the rest stay parked");
  const sig = (id) => W.arrangementSignature(W.WORKSPACES.find((w) => w.id === id).arrangement);
  // G7 (MICRO grafo reattivo) · the graphs of the workspace above the Outliner
  eq(sig("canvas"), "row(col(emtree,outliner),row(col(graph:matrix,table),inspector))",
     "Stratigrafia: EMTree above the Outliner · Matrix above the table · Inspector — complete from the start");
  // …a saved Stratigrafia of the rev-3 seed (untouched) is re-seeded at rev 4
  {
    const before = W.LEGACY_SIGNATURES.canvas;
    ok(before.includes("row(outliner,row(col(graph:matrix,table),inspector))") && W.WORKSPACES_REV >= 4,
       "the rev-3 Stratigrafia seed is a legacy signature: an untouched one opens with the graphs panel");
  }
  // …and the panel compresses to its header and comes back
  {
    W.applyArrangement("canvas");
    const ids = W.paneIds(W.layoutOf("canvas"));
    const graphs = ids[0];
    const r0 = W.stackedRatio(graphs, "canvas");
    ok(typeof r0 === "number" && Math.abs(r0 - 0.32) < 1e-9, "the graphs panel is the upper third of the left column");
    eq(W.toggleCompressed(graphs, 0.04, "canvas"), true, "▾ compresses it");
    eq(W.stackedRatio(graphs, "canvas"), 0.04, "…to its header's share");
    ok(W.isCompressed(graphs, "canvas"), "…and the window knows it");
    eq(W.toggleCompressed(graphs, 0.04, "canvas"), false, "▸ brings it back");
    eq(W.stackedRatio(graphs, "canvas"), r0, "…to the ratio it had");
    eq(W.toggleCompressed(ids[1], 0.04, "canvas"), null,
       "the Outliner, the lower side of the stack, is left alone (null)");
  }
  // DEV30 U6 · the graph window of Fonti opens on the Matrix, the standard view
  eq(sig("provenance"), "row(table,row(col(doc,graph:matrix),inspector))",
     "Fonti: Documents · Document above the graph · Inspector");
  eq(sig("assets"), "row(col(emtree,shelf),row(storage,graph:dtc))",
     "Contenuti: EMTree above the Shelf · Storage · DTC — and no Inspector");
  eq(sig("space"), "row(col(scene,table),row(graph:matrix,inspector))",
     "Spazio: the Scena 3D above the Table (Modelli e proxy) · Matrix · Inspector");
  eq(W.WORKSPACES.find((w) => w.id === "space").arrangement.wins.find((w) => w.type === "table").state["current.table.sheet"],
     "Models", "…and the Table opens on «Modelli e proxy»");
  eq(sig("narrative"), "row(narrative-index,row(narrative,col(graph:matrix,inspector)))",
     "Narrativa: Index · the page · Matrix above the Inspector");
  const canvas = W.WORKSPACES.find((w) => w.id === "canvas").arrangement;
  eq(canvas.wins.find((w) => w.type === "table").state["current.table.sheet"], "Issues",
     "the Stratigrafia table opens on the warnings");
  ok(W.WINDOW_TYPE_META["narrative-index"]?.labelKey === "win.narrativeIndex", "the Index is a window type");
  // «modified»: the shape and the windows, not the ratios
  W.applyArrangement("narrative");
  ok(!W.workspaceModified("narrative"), "a space as it comes is not «modified»");
  const first = W.paneIds(W.layoutOf("narrative"))[0];
  W.setSplitRatio(first, 0.3, "narrative");
  ok(!W.workspaceModified("narrative"), "dragging a seam is using the space, not reshaping it");
  const extra = W.splitWindow(first, "col", "narrative");
  ok(W.workspaceModified("narrative"), "an added area makes it «modified» (italic, ↺)");
  W.closeWindow(extra.id, "narrative");
  ok(!W.workspaceModified("narrative"), "…and closing it again gives the space back");
  W.applyArrangement("narrative");
  // the migration, line by line
  const leaf = (id, type, state = {}) => ({ id, type, state });
  const L = (winId) => ({ kind: "leaf", winId });
  const S = (dir, a, b) => ({ kind: "split", dir, ratio: 0.5, a, b });
  const saved = {
    canvas: { wins: [leaf("c1", "graph", { mode: "matrix" }), leaf("c2", "outliner"), leaf("c3", "inspector")],
              activeId: "c1", layout: S("row", L("c2"), S("row", L("c1"), L("c3"))) },
    provenance: { wins: [leaf("p1", "storage"), leaf("p2", "graph", { mode: "dtc" }), leaf("p3", "inspector")],
                  activeId: "p1", layout: S("row", L("p1"), S("row", L("p2"), L("p3"))) },
    assets: { wins: [leaf("a1", "storage"), leaf("a2", "viewer")], activeId: "a1", layout: S("col", L("a1"), L("a2")) },
    narrative: { wins: [leaf("n1", "narrative")], activeId: "n1", layout: L("n1") },
    dtc: { wins: [leaf("d1", "graph", { mode: "dtc" })], activeId: "d1", layout: L("d1") },
    ws7: { wins: [leaf("w1", "table")], activeId: "w1", layout: L("w1") },
  };
  const m = W.migrateSavedArrangements(saved);
  eq(m.reseeded.sort(), ["canvas", "narrative", "provenance"],
     "the old presets (and a never-arranged leaf) are reseeded with the new arrangement");
  ok(m.parsed.assets === saved.assets, "an arrangement the user reshaped is kept as it is");
  ok(m.parsed.dtc === saved.dtc && m.parsed.ws7 === saved.ws7, "parked and user workspaces are untouched");
  eq(W.migrateSavedArrangements(m.parsed).reseeded, [], "a second pass reseeds nothing");
}

console.log(`tiling: ${checks} checks passed`);
