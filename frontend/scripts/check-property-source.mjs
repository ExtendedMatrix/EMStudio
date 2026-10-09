// FONTE · executable check of «la proprietà come fonte» in EMStudio
// (MICRO-EMSTUDIO-PROPRIETA-COME-FONTE v2): «Prendi da un'altra proprietà…»
// writes the library's form — the extractor `extracted_from` the MASTER with
// the value read, never an instance node — in ONE undo step; the view draws the
// instance; s3Dgraphy reads the result as its own (`source_changed` after a
// change of the master, quiet after «Riallinea»).
//
//   node scripts/check-property-source.mjs
//
// On the fixture of the trusses (`testdata/capriate.em.json`). s3Dgraphy's
// diagnostics come from its venv (`property_source.diagnose`); without it they
// are skipped.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * as PS from "./property-source";
      export * as V from "./paradata-view";
      export { DocumentStore } from "./model";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
    },
  }],
});
const M = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const { PS, V, DocumentStore } = M;

const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
/** s3Dgraphy's reading of a document: the diagnostics of property_source,
 *  validate's ok/issues, and the instances of the view */
export function library(doc) {
  if (!existsSync(PY)) return null;
  const script = `
import json,sys
from s3dgraphy import api
from s3dgraphy.property_source import diagnose
from s3dgraphy.paradata_view import all_view_instances
g, w = api.load_emjson(json.loads(sys.stdin.read()))
v = api.validate(g)
print(json.dumps({"diagnose": diagnose(g), "ok": v["ok"], "issues": v["issues"], "load_warnings": w,
                  "instances": all_view_instances(g)}, default=str))`;
  return JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify(doc), maxBuffer: 1 << 28,
    env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
}

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};
const FIXTURE = new URL("../testdata/capriate.em.json", import.meta.url);
const fresh = () => new DocumentStore(JSON.parse(readFileSync(FIXTURE, "utf8")));
const E = (st, type) => st.doc.graph.edges.filter((e) => e.edge_type === type);
const graphOf = (st) => JSON.stringify(st.doc.graph);
const codes = (lib) => lib ? lib.diagnose.map((r) => r.code).sort() : null;

// ── 1. «Prendi da un'altra proprietà…»: USV 40's «essenza» reads US 12's ───
const st = fresh();
const start = graphOf(st);
const nodes0 = st.doc.graph.nodes.length;
const depth0 = st.undoDepth;
const r = PS.readFromProperty(st, "P40", "P12");
eq(st.undoDepth - depth0, 1, "one undo step");
const x = st.node(r.extractorId);
eq(x.node_type, "extractor", "an extractor");
eq(x.name, "US 12.01", "named after the master's unit (NAME1)");
eq(x.data.read_value, "quercia", "it remembers the value read");
ok(/^\d{4}-\d\d-\d\dT/.test(x.data.read_at), "…and when");
ok(st.hasEdge(r.extractorId, "P12", "extracted_from"), "extracted_from the MASTER (P12, in US 12)");
ok(st.hasEdge("P40", r.extractorId, "has_data_provenance"), "has_data_provenance from the property that reads");
ok(st.hasEdge(r.extractorId, "PD_USV_40", "is_in_paradata_nodegroup"), "the extractor in the reader's group");
eq(st.doc.graph.nodes.length, nodes0 + 1, "one node written: the extractor (no instance)");
ok(!st.doc.graph.nodes.some((n) => n.data?.instance_of), "no data.instance_of anywhere");
const inst = V.viewInstances(st.doc, "PD_USV_40").find((i) => i.master === "P12");
eq([inst?.id, inst?.owner_name], ["P12##PD_USV_40", "US 12"], "the view draws the instance «da US 12»");
let lib = library(JSON.parse(st.toJSON()));
if (lib) {
  eq(codes(lib), ["undeclared_owners", "undeclared_owners"], "s3Dgraphy: no source_changed, only the fixture's two owners");
  eq(lib.load_warnings.filter((w) => /instance/.test(w)), [], "s3Dgraphy folds no stored instance (there is none)");
  eq(lib.instances.PD_USV_40.map((i) => i.id), V.viewInstances(st.doc, "PD_USV_40").map((i) => i.id),
     "s3Dgraphy's view_instances draws the same");
}

// ── 2. the master changes: source_changed; «Riallinea» reads again ────────
st.setPropertyValue("P12", "rovere");
eq(st.node("P12").data.value, "rovere", "a value is written in data.value too (where s3Dgraphy reads it)");
lib = library(JSON.parse(st.toJSON()));
if (lib) {
  const sc = lib.diagnose.filter((d) => d.code === "source_changed");
  eq(sc.map((d) => [d.node, d.master, d.read, d.current]), [[r.extractorId, "P12", "quercia", "rovere"]],
     "s3Dgraphy: «la fonte è cambiata», read quercia, now rovere");
}
const d1 = st.undoDepth;
eq(PS.rereadProperty(st, r.extractorId), "rovere", "«Riallinea il valore letto»: rovere");
eq(st.undoDepth - d1, 1, "…one undo step");
lib = library(JSON.parse(st.toJSON()));
if (lib) eq(lib.diagnose.filter((d) => d.code === "source_changed"), [], "s3Dgraphy: quiet again");

// ── 3. asked again: the same extractor reads again, no second one ─────────
const again = PS.readFromProperty(st, "P40", "P12");
ok(again.reread && again.extractorId === r.extractorId, "the same reading, read again");
eq(E(st, "extracted_from").filter((e) => e.target === "P12").length, 1, "one extracted_from towards P12");

// ── 4. a second source: the combiner, as «+ lettura» makes it ─────────────
const r2 = PS.readFromProperty(st, "P40", "P13");
ok(r2.combinerCreated, "a second source makes a combiner");
eq(st.node(r2.extractorId).name, "US 13.01", "the second extractor is named after US 13");
ok(st.hasEdge(r2.combinerCreated, r.extractorId, "combines") && st.hasEdge(r2.combinerCreated, r2.extractorId, "combines"),
   "the combiner combines both readings");
ok(st.hasEdge(r2.combinerCreated, "PD_USV_40", "is_in_paradata_nodegroup"), "the combiner in the group");
const insts = V.viewInstances(st.doc, "PD_USV_40").map((i) => i.master).sort();
eq(insts, ["D1", "P12", "P13"], "PD_USV 40 draws US 12's and US 13's essenza (through the combiner) and D.1");

// ── 5. a property in no group: its owner's group is made, one step ────────
const st2 = fresh();
const r3 = PS.readFromProperty(st2, "P13", "P12");
ok(r3.groupCreated, "US 13 had no group: made");
ok(st2.hasEdge("US_13", r3.group, "has_paradata_nodegroup") && st2.hasEdge("P13", r3.group, "is_in_paradata_nodegroup")
   && st2.hasEdge(r3.extractorId, r3.group, "is_in_paradata_nodegroup"), "PD_US 13 holds the property and its extractor");
st2.undo();
eq(graphOf(st2), graphOf(fresh()), "one undo gives the start back");

// ── 6. a property cannot read itself ───────────────────────────────────────
assert.throws(() => PS.readFromProperty(fresh(), "P12", "P12"));
checks++;

st.undo(); st.undo(); st.undo(); st.undo(); st.undo();
eq(graphOf(st), start, "every step undone: the start");

console.log(`property-source: ${checks} checks passed`);
