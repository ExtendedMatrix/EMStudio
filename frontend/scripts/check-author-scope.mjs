// MICRO-RITOCCHI-CHIARI p.2c (E.D., 14 Nov 2026) · «extractor without author»
// only when NO level answers. An extractor with no `has_author` of its own
// inherits one along s3Dgraphy's author rule (resolvers/builtin_rules.AUTHOR_RULE,
// `property_resolver.resolve_with_source`): node → its epochs (has_first_epoch /
// survive_in_epoch → has_author) → the graph (author members of the graph-scope
// paradata group of the GraphNode).
//
//   node scripts/check-author-scope.mjs [file.em.json]   (EM_V10 by default;
//        with ../../s3Dgraphy/.venv the count is compared with the library's)
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}issues.ts`], bundle: true, format: "esm", write: false });
const I = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; console.log(`  ✓ ${what}`); };
const t = (k, v) => `${k}${v ? ":" + Object.values(v).join(",") : ""}`;
const noAuthor = (doc) => I.issues({ doc, nodes: doc.graph.nodes, isUnit: () => false, t })
  .filter((i) => i.rule === "author").map((i) => i.node).sort();

const n = (id, node_type, extra = {}) => ({ id, node_type, name: id, ...extra });
const e = (source, target, edge_type) => ({ id: `${source}-${edge_type}-${target}`, source, target, edge_type });
const base = () => ({ graph: { nodes: [n("X1", "extractor"), n("X2", "extractor"), n("X3", "extractor"), n("A", "author"), n("E", "EpochNode")],
  edges: [e("X1", "A", "has_author"), e("X2", "E", "has_first_epoch")] } });

// no level: X2, X3 owe it
let d = base();
ok(JSON.stringify(noAuthor(d)) === JSON.stringify(["X2", "X3"]), `no graph author: the two without own author are hinted (${noAuthor(d)})`);
// the epoch declares one: X2 inherits it, X3 not
d = base(); d.graph.edges.push(e("E", "A", "has_author"));
ok(JSON.stringify(noAuthor(d)) === JSON.stringify(["X3"]), `the epoch's author reaches its extractor (${noAuthor(d)})`);
// the graph declares one: nobody owes it
d = base();
d.graph.nodes.push(n("G_graphroot", "graph"), n("G_graph_paradata", "ParadataNodeGroup"), n("G_graph_author", "author"));
d.graph.edges.push(e("G_graphroot", "G_graph_paradata", "has_paradata_nodegroup"), e("G_graph_author", "G_graph_paradata", "is_in_paradata_nodegroup"));
ok(noAuthor(d).length === 0, `a graph author: no extractor is hinted (${noAuthor(d)})`);
// an author in some other paradata group is not the graph's
d = base();
d.graph.nodes.push(n("PG", "ParadataNodeGroup"), n("B", "author"));
d.graph.edges.push(e("B", "PG", "is_in_paradata_nodegroup"));
ok(noAuthor(d).length === 2, "an author in a unit's paradata group is not the graph's");

// the real study: the same count as s3Dgraphy's resolver
const file = process.argv[2] ?? process.env.EM_V10 ?? "/tmp/rc/T/EM/TempluMare_v10.em.json";
if (existsSync(file)) {
  const c = JSON.parse(readFileSync(file, "utf8"));
  const g = c.graphs ? c.graphs[c.active_graph_id] : c.graph;
  const mine = noAuthor({ graph: g });
  const py = new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname;
  const lib = new URL("../../../s3Dgraphy/src", import.meta.url).pathname;
  if (existsSync(py)) {
    const out = execFileSync(py, ["-c", `
import sys, json
sys.path.insert(0, ${JSON.stringify(lib)})
from s3dgraphy.importer.emjson_importer import import_emjson
from s3dgraphy.resolvers.property_resolver import resolve_with_source
from s3dgraphy.resolvers.builtin_rules import AUTHOR_RULE
g, _ = import_emjson(sys.argv[1])
print(json.dumps(sorted(x.node_id for x in g.nodes if x.node_type == "extractor" and resolve_with_source(g, x, AUTHOR_RULE)[0] is None)))
`, file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const theirs = JSON.parse(out.trim().split("\n").pop());
    ok(JSON.stringify(mine) === JSON.stringify(theirs), `${file.split("/").pop()}: ${mine.length} extractors without any author, as s3Dgraphy says (${theirs.length})`);
  } else ok(true, `${file.split("/").pop()}: ${mine.length} extractors without any author (no s3Dgraphy to compare)`);
} else console.log(`  – no ${file}: the real study skipped`);
console.log(`check-author-scope: ${checks} checks ✓`);
