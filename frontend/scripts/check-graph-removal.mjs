// «Delete the graph…» · executable check of src/graph-removal.ts.
//
//   node scripts/check-graph-removal.mjs
//
// `testdata/graph-removal-parity.json` is a byte copy of s3Dgraphy's
// `tests/fixtures/graph-removal-parity.json` (written by its
// test_graph_removal.py): the same container, the same four removals, the same
// reports and the same documents after. One rule, two implementations.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}graph-removal.ts`], bundle: true, format: "esm", write: false });
const R = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const FIX = new URL("../testdata/graph-removal-parity.json", import.meta.url);
const text = readFileSync(FIX, "utf8");
const sibling = new URL("../../../s3Dgraphy/tests/fixtures/graph-removal-parity.json", import.meta.url);
if (existsSync(sibling)) eq(readFileSync(sibling, "utf8") === text, true, "testdata/graph-removal-parity.json is a byte copy of s3Dgraphy's");
const fx = JSON.parse(text);

const after = (doc) => {
  const graphs = Object.keys(doc.graphs).sort();
  const links = {};
  for (const [gid, s] of Object.entries(doc.graphs)) if (Array.isArray(s.links) && s.links.length) links[gid] = s.links;
  const shelf = Object.values(doc.graphs).find((s) => s.data?.em_collection === "ShelfGraph");
  return { graphs, active_graph_id: doc.active_graph_id ?? null, links,
    shelf: (shelf?.nodes ?? []).filter((n) => n.node_type === "resource").map((n) => n.id).sort() };
};

const before = JSON.stringify(fx.doc);
for (const c of fx.cases) {
  const what = `${c.graph_id} · links ${c.links} · shelf ${c.shelf}`;
  const dry = R.graphRemovalReport(fx.doc, c.graph_id, { links: c.links, shelf: c.shelf });
  eq(dry, { ...c.report, applied: false }, `report · ${what}`);
  const { doc, report } = R.removeGraph(fx.doc, c.graph_id, { links: c.links, shelf: c.shelf });
  eq(report, c.report, `report applied · ${what}`);
  eq(after(doc), c.after, `the document after · ${what}`);
}
eq(JSON.stringify(fx.doc), before, "the document given is never touched");

// refused: a special member, an unknown id, the last graph
for (const [id, code] of [["shelf", "special"], ["nessuno", "unknown"]]) {
  try { R.graphRemovalReport(fx.doc, id); ok(false, `${id} refused`); }
  catch (e) { eq(e.code, code, `${id} refused (${code})`); }
}
const one = { graphs: { a: fx.doc.graphs.a, shelf: fx.doc.graphs.shelf }, active_graph_id: "a" };
try { R.graphRemovalReport(one, "a"); ok(false, "the last graph refused"); }
catch (e) { eq(e.code, "last", "the last graph refused"); }

// a kept link is marked, a dropped one goes; nothing else in the section moves
{
  const s = { links: [{ id: "x", edge_type: "is_after", source: "U", target: { graph_id: "a", node_id: "V" } },
                      { id: "y", edge_type: "is_after", source: "U", target: { graph_id: "c", node_id: "W" } }] };
  eq(R.settleLinksTowards(s, "a", "keep"), 1, "one link towards a");
  eq(s.links[0].attributes, { [R.TARGET_REMOVED_KEY]: "a" }, "kept: marked");
  eq(s.links[1].attributes, undefined, "the other untouched");
  R.settleLinksTowards(s, "a", "drop");
  eq(s.links.map((l) => l.id), ["y"], "dropped: gone");
}
console.log(`check-graph-removal: ${checks} checks passed`);
