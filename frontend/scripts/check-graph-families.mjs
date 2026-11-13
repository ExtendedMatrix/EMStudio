// MICRO-TESTATE-COERENTI p.13 (E.D., dev.121: «la famiglia Epochs 6/6 si accende e
// si spegne ma il disegno non cambia») · the Graph view draws EVERY node of a lit
// family: for each node family, the «Detail level» panel's count (shown / total,
// the structure counted as shown) against the nodes the Graph view draws — with
// the family ON (default) and OFF. On a small graph and on Templu Mare v9 (EM_V9).
//
//   node scripts/check-graph-families.mjs        (PORT=<a Vite of this tree>)
//
// Two declared folds, counted as drawn when what holds them is: the files of a
// CLOSED resource are inside its disc (RISORSA-FILE: opened, they are drawn), and
// one content in two forms (a folder and its .3tz) is the first form's disc.
import assert from "node:assert/strict";
import { bench } from "./page-bench.mjs";

const B = await bench("check-graph-families");
if (!B) process.exit(0);
let checks = 0;
const fails = [];
const eq = (got, want, what) => { try { assert.deepEqual(got, want); checks++; } catch { fails.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

const small = { graphs: { g: { graph_id: "g", name: "small", nodes: [
  { id: "XX", node_type: "EpochNode", name: "XX sec", data: { start_time: 1801, end_time: 2026 } },
  { id: "E15", node_type: "EpochNode", name: "2015", data: { start_time: 2015, end_time: 2026 } },
  ...Array.from({ length: 60 }, (_, i) => ({ id: `U${i}`, node_type: "US", name: `US${i}` })),
  { id: "D1", node_type: "document", name: "D.01" }, { id: "G", node_type: "RepresentationModelNodeGroup", name: "Survey" },
  { id: "M1", node_type: "representation_model", name: "mesh" }],
  edges: [{ id: "s", source: "XX", target: "E15", edge_type: "has_sub_epoch" },
    ...Array.from({ length: 60 }, (_, i) => ({ id: `f${i}`, source: `U${i}`, target: i % 2 ? "XX" : "E15", edge_type: "has_first_epoch" })),
    { id: "r", source: "XX", target: "M1", edge_type: "has_representation_model" },
    { id: "m", source: "M1", target: "G", edge_type: "is_in_representation_model_group" }] } }, active_graph_id: "g" };

async function measure(page, label) {
  await page.evaluate(() => window.__EM_DRAG__.setGraphMode("graph"));
  await page.waitForTimeout(1500);
  const fams = await page.evaluate(() => window.__EM_DRAG__.graphFamilies());
  const filesIn = await page.evaluate(() => {
    // the files folded into a drawn resource (RISORSA-FILE)
    const d = JSON.parse(window.__EM_DRAG__.docJson()); const g = d.graphs[d.active_graph_id];
    const drawn = new Set(window.__EM_DRAG__.viewNodeIds("graph"));
    const inside = new Set(g.edges.filter((e) => e.edge_type === "has_file" && drawn.has(e.source) && !drawn.has(e.target)).map((e) => e.target));
    // …and the other FORMS of one content (a folder and its .3tz), folded into the first
    const cd = (n) => JSON.stringify(n.data?.content_digest ?? null);
    const shownCd = new Set(g.nodes.filter((n) => n.node_type === "resource" && drawn.has(n.id) && n.data?.content_digest).map(cd));
    for (const n of g.nodes) if (n.node_type === "resource" && !drawn.has(n.id) && n.data?.content_digest && shownCd.has(cd(n))) inside.add(n.id);
    return inside.size;
  });
  for (const f of fams) {
    const drawn = f.key === "resources" ? f.drawn + filesIn : f.drawn;
    eq(drawn, f.shown, `${label} · family ${f.key} ON: drawn = the panel's shown (${f.shown}/${f.total})`);
  }
  const winId = await page.evaluate(() => window.__EM_DRAG__.activeWinId());
  for (const f of fams.filter((x) => x.total && x.key !== "other")) {
    const all = fams.flatMap((x) => x.leaves);
    await page.evaluate(([w, leaves]) => window.__EM_DRAG__.setLeavesOf(w, leaves), [winId, all.filter((l) => !f.leaves.includes(l))]);
    await page.waitForTimeout(400);
    const off = (await page.evaluate(() => window.__EM_DRAG__.graphFamilies())).find((x) => x.key === f.key);
    const filesOff = f.key === "resources" ? await page.evaluate(() => {
      const d = JSON.parse(window.__EM_DRAG__.docJson()); const g = d.graphs[d.active_graph_id];
      const drawn = new Set(window.__EM_DRAG__.viewNodeIds("graph"));
      return new Set(g.edges.filter((e) => e.edge_type === "has_file" && drawn.has(e.source) && !drawn.has(e.target)).map((e) => e.target)).size;
    }) : 0;
    eq(off.drawn + filesOff, off.shown, `${label} · family ${f.key} OFF: drawn = the panel's shown (${off.shown}/${off.total}, the structure stays)`);
    await page.evaluate(([w, leaves]) => window.__EM_DRAG__.setLeavesOf(w, leaves), [winId, all]);
  }
  const ep = fams.find((x) => x.key === "epochs");
  return ep;
}

const { page, errors } = await B.open();
await page.evaluate((d) => window.__EM_DRAG__.openAt(d, "/tmp/small.em.json"), small);
await page.waitForTimeout(1500);
const eSmall = await measure(page, "small graph");
eq(eSmall.drawn, 2, "small graph: its 2 epochs are discs");
await page.evaluate(([d, p]) => window.__EM_DRAG__.openAt(d, p), [B.doc, "/tmp/v9.em.json"]);
await page.waitForFunction(() => (window.__EM_SCENE__?.()?.nodes?.length ?? 0) > 50, null, { timeout: 90000 });
const eV9 = await measure(page, "v9");
eq(eV9.drawn, 6, "v9: its 6 epochs are discs");
eq(errors, [], "no page error");
await B.close();
if (fails.length) { console.error(fails.map((f) => `✗ ${f}`).join("\n")); console.error(`check-graph-families: ${fails.length} ✗, ${checks} ✓`); process.exit(1); }
console.log(`check-graph-families: ${checks} checks ✓`);
