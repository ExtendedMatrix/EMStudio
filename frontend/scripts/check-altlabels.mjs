// A1 · the alternative labels of a unit, read the way EMStudio reads them.
//
// `testdata/alternative_labels.em.json` is s3Dgraphy's golden
// (`tests/fixtures/alternative_labels.em.json`, written by `labels.py`): 1.US10
// is «US 1004» in the 2013 report (scheme «scavo 2013»), «A.12» in the thesis,
// «Muro del podio» in two documents. Here: the labels with their sources, and
// the search that finds the UNIT first by any of them.
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
let checks = 0;
const failures = [];
const ok = (c, what, detail = "") => { checks += 1; if (!c) failures.push(what + (detail ? ` — ${detail}` : "")); };
const load = async (entry) => {
  const built = await esbuild.build({ entryPoints: [join(SRC, entry)], bundle: true, format: "esm", write: false });
  return import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
};
const A = await load("altlabels.ts");
const S = await load("search.ts");
const doc = JSON.parse(readFileSync(join(HERE, "..", "testdata", "alternative_labels.em.json"), "utf8"));

const labels = A.altLabelsOf(doc.graph, "us10");
ok(labels.length === 3, "three alternative labels", JSON.stringify(labels.map((l) => l.label)));
const by = Object.fromEntries(labels.map((l) => [l.label, l]));
ok(by["US 1004"]?.scheme === "scavo 2013" && by["US 1004"].sources.map((s) => s.name).join() === "D.2013 Relazione di scavo",
   "«US 1004»: its scheme and its document", JSON.stringify(by["US 1004"]));
ok(by["Muro del podio"]?.sources.length === 2, "«Muro del podio»: two documents, through the combiner",
   JSON.stringify(by["Muro del podio"]?.sources));
ok(A.altLabelsOf(doc.graph, "us11").length === 0, "a unit with none has none");
for (const q of ["US 1004", "1004", "a.12", "podio"]) {
  const hits = S.searchGraph(doc, q);
  ok(hits[0]?.node.id === "us10", `searching «${q}» finds 1.US10 first`,
     JSON.stringify(hits.slice(0, 3).map((h) => [h.node.name, h.excerpt])));
}
ok(A.altLabelIndex(doc).get("us10")?.length === 3, "the outliner's index holds the three");

console.log(`altlabels: ${checks - failures.length}/${checks} checks passed`);
if (failures.length) { for (const f of failures) console.error("  ✗ " + f); process.exit(1); }
