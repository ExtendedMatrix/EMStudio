// SHIFT-A · executable check of the «Aggiungi» menu: what it offers where, what
// «Collegato a X» means, what the search finds, where a node is born, that a
// node + its edge + its epoch are one undo step, and that Esc closes.
//
//   node scripts/check-add-menu.mjs
//
// The pure pieces are exercised in node, bundled with the project's esbuild:
// `add-menu.ts` (catalogue, links, search, `planAdd`), `views/matrix.ts` (the
// scene `planAdd` aims at), `model.ts` (the batch = one undo step) and
// `add-menu-ui.ts` on a linkedom document (keys). `./icons` is stubbed as in
// check-drag: it uses `import.meta.glob`, which only Vite has.
//
// The same cases on the real canvas, with a real mouse and keyboard (Shift+A in a
// lane, right-click in a group body with and without Alt, «US sopra X», Esc,
// the search), are in the night's report
// (`.claude/wip/reports/2026-10-01-shift-a-e-le-quattro-domande/probe-add2.mjs`,
// Playwright on `npm run dev`).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

// a DOM for the pieces that touch one (i18n sets `dir` on <html>; the menu is DOM)
const { window, document } = parseHTML(`<!doctype html><html><body><div id="tooltip" class="hidden"></div></body></html>`);
globalThis.window = window;
globalThis.document = document;
globalThis.Event = window.Event;
window.innerWidth = 1600;
window.innerHeight = 1000;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: 290, bottom: 400, width: 290, height: 400, x: 0, y: 0 };
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * from "./add-menu";
      export { showAddMenu, addMenuIsOpen, closeAddMenu } from "./add-menu-ui";
      export { buildMatrixScene, newRestackMemo } from "./views/matrix";
      export { DocumentStore } from "./model";
      export { setLocale } from "./i18n";
      export { classOf, nodeTypeForClass, typeLabel } from "./rules";
      export { nextFreeName } from "./naming";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  plugins: [
    {
      name: "stub-icons",
      setup(build) {
        build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`,
          loader: "ts",
        }));
      },
    },
  ],
});
const M = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
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

// ── 1 · the context × type table IS what the menu shows ───────────────────────
{
  const table = M.contextTable();
  ok(table.length > 40, `the table covers the authoring surface (${table.length} rows)`);
  for (const ctx of ["matrix", "graph", "dtc", "multigraph"]) {
    const cats = M.addCategories(ctx);
    const shown = cats.flatMap((c) => c.items.map((i) => ({ k: i.kind ? `${i.nodeType}:${i.kind}` : i.nodeType, s: c.state })));
    eq(shown.map((x) => `${x.k}=${x.s}`),
       table.map((r) => `${r.type}=${r.cells[ctx]}`),
       `${ctx} · the menu's categories are exactly the context × type table`);
    // a plain add offers the `on` rows only
    eq(M.addableItems(ctx).map((i) => (i.kind ? `${i.nodeType}:${i.kind}` : i.nodeType)),
       table.filter((r) => r.cells[ctx] === "on").map((r) => r.type),
       `${ctx} · a plain add offers the rows the table marks «on»`);
  }
  for (const r of table)
    ok(M.classOf(r.type.split(":")[0]) !== "" && M.classOf(r.type.split(":")[0]) !== "UnknownNode",
       `every menu type is a datamodel node_type (${r.type}) — no second list of the EM language`);
  const cell = (type, ctx) => table.find((r) => r.type === type).cells[ctx];
  eq([cell("property", "matrix"), cell("property", "graph")], ["linked", "on"],
     "Matrix paradata only LINKED, Graph paradata free");
  const hdto = table.find((r) => r.category === "HDT-O");
  if (hdto)
    eq([hdto.cells.matrix, hdto.cells.graph, hdto.cells.multigraph], ["off", "off", "on"],
       "HDT-O only where it is drawn (multigraph)");
  const dtc = table.find((r) => r.category === "DTC");
  eq([dtc.cells.matrix, dtc.cells.dtc, cell("US", "dtc")], ["off", "on", "off"],
     "DTC chunks only in the DTC projection, and it offers nothing else");
  // the categories that are not for here are still LISTED
  ok(M.addCategories("matrix").some((c) => c.state === "off"),
     "Matrix lists the categories it does not allow (spent, «non in questo contesto»)");
}

// ── 2 · «Collegato a X» comes from allowedEdgeTypes ───────────────────────────
{
  const L = (ctx, t) => M.linkedItems(ctx, t).map((i) => `${i.relation}:${i.nodeType}:${i.dir}:${i.edgeType}`);
  const us = L("matrix", "US");
  ok(us[0] === "above:US:in:is_after", `on a US the first entry is «US sopra X» (new is_after → X) — ${us[0]}`);
  ok(us[1] === "below:US:out:is_after", `…then «US sotto X» (X is_after → new) — ${us[1]}`);
  ok(us.includes("for:property:out:has_property"), "…and «Proprietà di X» (has_property)");
  ok(!us.some((s) => s.includes("NodeGroup")), "no group «for» X: grouping is its own verb");
  ok(!us.some((s) => s.startsWith("above:USVs") || s.startsWith("below:SF")),
     "a unit links to a unit of its own type only");
  ok(L("graph", "extractor").includes("for:document:out:extracted_from"),
     "on an extractor: «Documento per X» (extracted_from)");
  ok(L("graph", "property").includes("for:extractor:out:has_data_provenance"),
     "on a property: «Estrattore per X» (has_data_provenance)");
  eq(L("dtc", "US"), [], "DTC links nothing from a study unit");
  // the anchor drag: every addable target the datamodel allows from the source
  const c = M.connectItems("graph", "extractor");
  ok(c.every((i) => i.dir === "out") && c.some((i) => i.nodeType === "document" && i.edgeType === "extracted_from"),
     "anchor drag from an extractor offers the document at the other end");
}

// ── 3 · the search: label, node_type, description — and the locale's label ───
{
  const all = M.addableItems("graph");
  const find = (q) => all.filter((i) => M.matchesAdd(i, q)).map((i) => i.nodeType);
  ok(find("rsf").includes("RSF"), "«rsf» finds RSF (node_type)");
  ok(find("extractor").includes("extractor"), "«extractor» finds the extractor (English label)");
  M.setLocale("it");
  const allIt = M.addableItems("graph");
  const findIt = (q) => allIt.filter((i) => M.matchesAdd(i, q)).map((i) => i.nodeType);
  ok(findIt("estrattore").includes("extractor"),
     "«estrattore» finds the extractor in Italian — the datamodel's own label (TRAD1), not a UI string");
  ok(findIt("extractor").includes("extractor"), "…and the English label still finds it");
  eq(M.typeLabel("extractor"), "Estrattore", "the Italian label comes from the translations sidecar");
  M.setLocale("en");
}

// ── 4 · where a node is born (planAdd on a real matrix scene) ─────────────────
const N = (id, node_type = "US", extra = {}) => ({ id, name: id, node_type, ...extra });
const E = (source, edge_type, target) => ({ id: `${source}__${edge_type}__${target}`, source, target, edge_type });
const R = (x, y, w = 90, h = 32) => ({ x, y, w, h });
function doc() {
  return {
    graph: {
      nodes: [
        N("A", "EpochNode", { data: { start_time: 100, end_time: 200 } }),
        N("B", "EpochNode", { data: { start_time: 0, end_time: 100 } }),
        N("u1", "US"), N("u2", "US"), N("v1", "US"),
        N("act", "ActivityNodeGroup"),
      ],
      edges: [
        E("u1", "has_first_epoch", "A"), E("u2", "has_first_epoch", "A"),
        E("v1", "has_first_epoch", "B"),
        E("u1", "is_in_activity", "act"), E("u2", "is_in_activity", "act"),
      ],
    },
    layout: {
      swimlanes: [
        { epoch_id: "A", y: 0, height: 240 },
        { epoch_id: "B", y: 240, height: 200 },
      ],
      positions: { u1: R(100, 60), u2: R(260, 60), v1: R(100, 300), act: R(76, 16, 310, 110) },
    },
  };
}
{
  const d = doc();
  const s = M.buildMatrixScene(d, undefined, undefined, new Set(), new Set(), M.newRestackMemo(), "k");
  const g = s.groupsById.get("act");
  ok(g, "the activity is drawn as a group");
  const laneB = s.lanes.find((l) => l.id === "B");
  // a free point in lane B
  const p1 = M.planAdd(s, d, "US", 600, laneB.y + laneB.height / 2, { alt: false, matrix: true });
  eq([p1.target?.kind, p1.epochId], ["lane", "B"], "Shift+A in a lane: the node takes that lane's epoch");
  // the body of the activity
  const bx = g.x + g.w - 20, by = g.y + g.headerH + (g.h - g.headerH) / 2;
  const p2 = M.planAdd(s, d, "US", bx, by, { alt: false, matrix: true });
  eq([p2.target?.kind, p2.target?.group?.id, p2.epochId], ["group", "act", "A"],
     "right-click in a group body: into the group, and the lane still gives the epoch");
  const p3 = M.planAdd(s, d, "US", bx, by, { alt: true, matrix: true });
  eq([p3.target?.kind, p3.epochId], ["lane", "A"], "…with Alt: the lane only, no membership");
  const p4 = M.planAdd(s, d, "US", g.x + 30, g.y + g.headerH / 2, { alt: false, matrix: true });
  eq(p4.target?.kind, "lane", "the title bar is not a body: lane, not group");
  const p5 = M.planAdd(s, d, "US", 600, laneB.y + 20, { alt: false, matrix: true, otherId: "u1" });
  eq(p5.epochId, "A", "«US sopra u1» is born in u1's epoch, wherever the cursor is");
  const p6 = M.planAdd(s, d, "property", 600, laneB.y + 20, { alt: false, matrix: true, otherId: "u1" });
  eq(p6.epochId, null, "a paradata node takes no epoch of its own");
}

// ── 5 · node + edge + epoch = ONE undo step ───────────────────────────────────
{
  const st = new M.DocumentStore(doc());
  const before = st.doc.graph.nodes.length;
  st.batch(() => {
    st.addNode({ id: "n", name: "SU", node_type: "US", description: "" }, R(600, 300));
    st.setFirstEpoch(["n"], "B");
    st.addEdge("n", "u1", "is_after");
  });
  ok(st.doc.graph.edges.some((e) => e.source === "n" && e.edge_type === "is_after"), "the batch wrote the edge");
  st.undo();
  eq([st.doc.graph.nodes.length, st.doc.graph.edges.some((e) => e.source === "n")], [before, false],
     "one undo takes node, edge and epoch away together");
  ok(!st.canUndo, "…and it was the only step");
}

// ── 6 · the next free name of the type ─────────────────────────────────────────
{
  const d = { graph: { nodes: [N("a", "US", { name: "SU001" }), N("b", "US", { name: "SU050" }), N("c", "US", { name: "USM5000-A" }), N("r", "RSF", { name: "RSF101" })], edges: [] } };
  eq(M.nextFreeName(d, "US"), "SU051", "the prefix and width most used by the type, first after the highest");
  eq(M.nextFreeName(d, "RSF"), "RSF102", "RSF101 → RSF102");
  eq(M.nextFreeName(d, "SF"), null, "a type with no numbered names: the caller keeps its generic label");
}

// ── 7 · the menu's keys: ↑↓ Enter, Esc closes ─────────────────────────────────
{
  const picked = [];
  const entry = (key) => ({ key, label: key, run: () => picked.push(key) });
  const model = {
    title: "Add", context: "Context: Matrix", placeholder: "…",
    linked: [entry("above")], recent: [], categories: [{ label: "Stratigraphy", entries: [entry("US"), entry("USVs")] }],
    extra: [entry("epoch")], searchable: [entry("above"), entry("US"), entry("USVs")],
    matches: (e, q) => e.label.toLowerCase().includes(q.toLowerCase()),
    count: "3", noResults: "none", keysHint: "↑↓",
  };
  // linkedom has no KeyboardEvent: an Event carrying `key` is what the handler reads
  const key = (k) => {
    const ev = new window.Event("keydown", { bubbles: true });
    ev.key = k;
    document.querySelector(".addm-q").dispatchEvent(ev);
  };
  M.showAddMenu(model, 100, 100);
  // (the FOCUS of the box is asserted live, in the report's probe: linkedom has
  // no focus model)
  ok(M.addMenuIsOpen() && document.querySelector(".addm-q"), "the menu opens, with its search box");
  key("Enter");
  eq(picked, ["above"], "Enter on the first row runs it (the linked entry comes first)");
  ok(!M.addMenuIsOpen(), "a pick closes the menu");
  M.showAddMenu(model, 100, 100);
  key("ArrowDown"); key("ArrowRight"); key("ArrowDown"); key("Enter");
  eq(picked, ["above", "USVs"], "↓ to the category, → into its submenu, ↓, Enter");
  M.showAddMenu(model, 100, 100);
  key("Escape");
  ok(!M.addMenuIsOpen() && !document.querySelector(".addm"), "Esc closes");
  M.showAddMenu(model, 100, 100);
  const q = document.querySelector(".addm-q");
  q.value = "usv";
  q.dispatchEvent(new window.Event("input"));
  eq([...document.querySelectorAll(".addm-body .addm-item")].map((b) => b.dataset.key), ["USVs"],
     "with text, a flat list of what matches");
  M.closeAddMenu();
}

// ── 8 · COLLEGARE · linking to what already exists ────────────────────────────
{
  const d = {
    graph: {
      nodes: [
        N("D3", "document", { name: "D.03", description: "Scheda dei capitelli" }),
        N("D4", "document", { name: "D.04", description: "Rilievo 2026" }),
        N("X1", "extractor", { name: "D.03.1" }),
        N("X2", "extractor", { name: "D.XX" }),
        N("u1", "US", { name: "US101" }), N("u2", "USM", { name: "USM102" }), N("u3", "US", { name: "US103" }),
        N("p1", "property", { name: "height" }),
        N("ep", "EpochNode"), N("au", "author"),
      ],
      edges: [E("X1", "extracted_from", "D3"), E("u1", "is_after", "u2"), E("u1", "has_property", "p1")],
    },
  };
  const keys = (ls) => ls.map((l) => `${l.group}:${l.name}:${l.dir}:${l.edgeType}`);
  const ex = M.existingLinks(d, "X2");
  ok(keys(ex).includes("document:D.03:out:extracted_from") && keys(ex).includes("document:D.04:out:extracted_from"),
     "an extractor with no document is offered the existing documents (extracted_from)");
  ok(!ex.some((l) => l.nodeId === "X2"), "the node itself is not offered");
  ok(!ex.some((l) => ["ep", "au"].includes(l.nodeId)), "an epoch (a lane) and an ornament are not link targets");
  eq(M.LINK_GROUP_ORDER, ["document", "strat", "property", "extractor", "combiner"],
     "the groups: Documenti, Unità, Proprietà, Estrattori, Combiner");
  const st = new M.DocumentStore(JSON.parse(JSON.stringify(d)));
  const link = ex.find((l) => l.nodeId === "D3");
  const res = M.applyExistingLink(st, "X2", link);
  eq([res.source, res.target], ["X2", "D3"], "the edge runs extractor → document");
  eq(st.node("X2").name, "D.03.2", "…and the extractor takes its name from D.03 (NAME1): D.03.2");
  ok(st.doc.graph.edges.some((e) => e.source === "X2" && e.target === "D3" && e.edge_type === "extracted_from"),
     "the edge is in the graph");
  st.undo();
  eq([st.node("X2").name, st.doc.graph.edges.some((e) => e.source === "X2")], ["D.XX", false],
     "edge and name are ONE undo step");
  // already linked: not offered again, is_after also the other way round
  const onU1 = M.existingLinks(d, "u1");
  ok(!onU1.some((l) => l.nodeId === "u2" && l.edgeType === "is_after"),
     "a unit already is_after USM102 is not offered USM102 again — in either verso");
  ok(onU1.some((l) => l.nodeId === "u3" && l.relation === "above") && onU1.some((l) => l.nodeId === "u3" && l.relation === "below"),
     "another unit of any type is offered above and below (the own-type rule is for creating)");
  ok(!onU1.some((l) => l.nodeId === "p1" && l.edgeType === "has_property"), "a property it already has is not offered");
  const onU3 = M.existingLinks(d, "u3");
  const prop = onU3.find((l) => l.nodeId === "p1" && l.edgeType === "has_property");
  ok(prop && prop.dir === "out", "an existing property is offered to a second unit (has_property)");
  const st2 = new M.DocumentStore(JSON.parse(JSON.stringify(d)));
  const r2 = M.applyExistingLink(st2, "u3", prop);
  eq(r2.sharedWith?.slice().sort(), ["u1", "u3"], "…and linking it makes it SHARED: both units own it");
  // the anchor drag: the source is decided, X → existing only
  const anc = M.existingLinks(d, "X2", { anchor: true });
  ok(anc.length && anc.every((l) => l.dir === "out"), "the anchor drag offers X → existing only");
  // the search
  const find = (q) => ex.filter((l) => M.matchesExisting(l, q)).map((l) => l.name);
  eq(find("capitelli"), ["D.03"], "the search finds a document by its description");
  eq(find("d.04"), ["D.04"], "…and by its name");
  // the same component shows them grouped, 6 per group, the rest behind the search
  const many = Array.from({ length: 9 }, (_, i) => ({ key: `e${i}`, label: `D.${i}`, run: () => {} }));
  M.showAddMenu({
    title: "Link", context: "X", placeholder: "…", linked: [], recent: [], categories: [],
    existing: { header: "Existing", groups: [{ label: "Documents", entries: many }], perGroup: 6,
                more: (n) => `+${n} more`, none: "none" },
    extra: [], searchable: many, matches: (e, q) => e.label.includes(q),
    count: "9", noResults: "none", keysHint: "",
  }, 10, 10);
  eq(document.querySelectorAll(".addm-body .addm-item").length, 6, "six existing rows per group");
  ok([...document.querySelectorAll(".addm-note")].some((p) => p.textContent === "+3 more"), "…and «+3 altri: scrivi per cercare»");
  const q = document.querySelector(".addm-q");
  q.value = "D.8";
  q.dispatchEvent(new window.Event("input"));
  eq([...document.querySelectorAll(".addm-body .addm-item")].map((b) => b.dataset.key), ["e8"],
     "the search reaches the ones beyond the first six");
  M.closeAddMenu();
}

// `ADD_TABLE=1 node scripts/check-add-menu.mjs` prints the context × type table
// as Markdown, for the night's report (generated, never written by hand)
if (process.env.ADD_TABLE) {
  const mark = { on: "✓", off: "—", linked: "collegato" };
  const rows = M.contextTable();
  const out = ["| tipo | categoria | matrix | graph | dtc | multigraph |", "|---|---|---|---|---|---|"];
  for (const r of rows)
    out.push(`| \`${r.type}\` | ${r.category} | ${["matrix", "graph", "dtc", "multigraph"].map((c) => mark[r.cells[c]]).join(" | ")} |`);
  console.log(out.join("\n"));
}

console.log(`check-add-menu: ${checks} checks ✓`);
