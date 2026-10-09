// FONTE · the computed instances of MICRO-EMSTUDIO-PROPRIETA-COME-FONTE v2: the
// client's reading of `em_visual_rules.json` → `paradata_instances`
// (`src/paradata-view.ts`) gives, on the same documents, exactly what s3Dgraphy's
// `paradata_view.all_view_instances` gives — one rule, read twice, never a second
// implementation that drifts. And the Matrix draws them: inside every OPEN
// group, with the badge «from <owner>», the `extracted_from` re-attached.
//
//   node scripts/check-instances.mjs [room.em.json …]
//
// The fixture of the trusses (`testdata/capriate.em.json`) is read with a reading
// of US 12's «essenza» by USV 40 added here (the form «Prendi da un'altra
// proprietà…» writes); `testdata/proprieta.em.json` and every file given are
// compared as they are. Without the s3Dgraphy venv the oracle is skipped.
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
      export * as V from "./paradata-view";
      export * as C from "./compact";
      export { DocumentStore } from "./model";
      export { buildMatrixScene, newRestackMemo } from "./views/matrix";
      export { buildMembership, applyFolding } from "./folding";
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
const { V } = M;

const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
function oracle(doc) {
  if (!existsSync(PY)) return null;
  const script = `
import json,sys
from s3dgraphy import api
from s3dgraphy.paradata_view import all_view_instances
g, w = api.load_emjson(json.loads(sys.stdin.read()))
print(json.dumps(all_view_instances(g)))`;
  return JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify(doc), maxBuffer: 1 << 28,
    env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
}

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const FIELDS = ["id", "master", "kind", "node_type", "name", "owner", "owner_kind", "owner_name",
                "removed", "readers", "extractors", "through"];
const pick = (r) => Object.fromEntries(FIELDS.map((k) => [k, r[k]]));
function compare(doc, label) {
  const ts = Object.fromEntries([...V.allViewInstances(doc)].map(([g, rs]) => [g, rs.map(pick)]));
  const py = oracle(doc);
  const n = Object.values(ts).reduce((a, rs) => a + rs.length, 0);
  if (py) {
    const pyp = Object.fromEntries(Object.entries(py).map(([g, rs]) => [g, rs.map(pick)]));
    eq(ts, pyp, `${label}: paradata-view.ts = s3dgraphy all_view_instances`);
  }
  console.log(`  ${label}: ${Object.keys(ts).length} groups, ${n} instances${py ? " — same as s3Dgraphy" : " (no oracle)"}`);
  return ts;
}

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));

// ── the trusses, with USV 40 reading US 12's «essenza» ─────────────────────
const cap = load("../testdata/capriate.em.json");
const withReading = structuredClone(cap);
withReading.graph.nodes.push({ id: "E40", node_type: "extractor", name: "US 12.01", description: "",
                               data: { read_value: "quercia", read_at: "2026-10-09T20:00:00Z" } });
for (const [s, t, y] of [["P40", "E40", "has_data_provenance"], ["E40", "P12", "extracted_from"],
                         ["E40", "PD_USV_40", "is_in_paradata_nodegroup"]])
  withReading.graph.edges.push({ id: `${s}__${y}__${t}`, source: s, target: t, edge_type: y });
{ const p40 = withReading.layout.positions.P40;
  withReading.layout.positions.E40 = { x: p40.x, y: p40.y + 60, w: 30, h: 30 }; }

const c0 = compare(cap, "capriate");
eq(c0.PD_US_12.map((r) => r.master), ["D1"], "PD_US 12 draws the document D.1");
eq(c0.PD_USV_40.map((r) => r.master), ["D1"], "PD_USV 40 draws the document D.1 too (two groups, two instances)");
eq([c0.PD_US_12[0].owner, c0.PD_US_12[0].owner_kind], ["EP_MED", "epoch"], "the document's badge is its epoch");
const c1 = compare(withReading, "capriate + reading");
const inst = c1.PD_USV_40.find((r) => r.master === "P12");
ok(inst, "PD_USV 40 draws US 12's «essenza» as an instance");
eq([inst.id, inst.owner, inst.owner_name, inst.kind], ["P12##PD_USV_40", "US_12", "US 12", "property"],
   "id <master>##<group>, badge «from US 12»");
eq(inst.extractors, ["E40"], "the reading is re-attached to it");

// ── the Matrix draws them, in open groups only ─────────────────────────────
const { buildMatrixScene, buildMembership, applyFolding, newRestackMemo } = M;
function matrix(doc) {
  const folded = new Set(doc.layout?.folded_groups ?? []);
  const view = folded.size ? applyFolding(doc, buildMembership(doc), folded) : undefined;
  return buildMatrixScene(doc, view, undefined, new Set(), new Set(), newRestackMemo(), "k");
}
{
  const sc = matrix(withReading);
  const p = sc.byId.get("P12##PD_USV_40");
  ok(p && p.instanceOf === "P12", "the Matrix has the instance of P12 in PD_USV 40");
  eq(p.instanceBadge?.owner, "US_12", "…with the badge of its unit");
  ok(sc.byId.get("D1##PD_US_12") && sc.byId.get("D1##PD_USV_40"), "…and D.1 in both groups");
  const ef = sc.edges.find((e) => e.edge.source === "E40" && e.edge.edge_type === "extracted_from");
  eq(ef?.target, "P12##PD_USV_40", "E40's extracted_from ends on the instance");
  const closed = structuredClone(withReading);
  closed.layout = { ...(closed.layout ?? {}), folded_groups: ["PD_USV_40"] };
  const sc2 = matrix(closed);
  ok(!sc2.byId.get("P12##PD_USV_40"), "a closed group draws no instance");
}

compare(load("../testdata/proprieta.em.json"), "proprieta");
/** a room's em.json may be a container of graphs: the one graph, with the layout */
export function single(raw) {
  return raw.graph ? raw : { header: raw.header,
    graph: Array.isArray(raw.graphs) ? raw.graphs[0] : (raw.graphs[raw.active_graph_id] ?? Object.values(raw.graphs)[0]),
    layout: raw.layout };
}
// ── a room (templu-mare-v2): as it is, and after «Compact (whole graph)» —
//    the documents enter the groups AS A VIEW, the data does not change ──────
const NUMBERS = process.env.NUMBERS;
const numbers = {};
for (const f of process.argv.slice(2)) {
  const label = f.split("/").pop();
  const doc = single(JSON.parse(readFileSync(f, "utf8")));
  const before = compare(doc, label);
  const st = new M.DocumentStore(structuredClone(doc));
  const docsBefore = st.doc.graph.nodes.filter((n) => n.node_type === "document").length;
  const r = M.C.compactProperties(st);
  const after = compare(st.doc, `${label} after Compact`);
  eq(st.doc.graph.nodes.filter((n) => n.node_type === "document").length, docsBefore,
     `${label}: Compact writes no document and no instance`);
  ok(!st.doc.graph.edges.some((e) => e.edge_type === "is_in_paradata_nodegroup"
       && st.doc.graph.nodes.find((n) => n.id === e.source)?.node_type === "document"
       && !doc.graph.edges.some((x) => x.id === e.id)), `${label}: no new membership of a document`);
  const count = (m, kind) => Object.values(m).flat().filter((x) => !kind || x.kind === kind).length;
  // the Matrix: closed (as Compact leaves it) and with every group open
  const closedScene = matrix(st.doc);
  const open = structuredClone(st.doc);
  open.layout = { ...(open.layout ?? {}), folded_groups: [] };
  const t0 = performance.now();
  const openScene = matrix(open);
  const ms = performance.now() - t0;
  const drawn = (sc) => sc.nodes.filter((n) => n.instanceBadge).length;
  numbers[label] = {
    units_compacted: r.units, groups_created: r.groupsCreated,
    before: { groups_with_instances: Object.keys(before).length, instances: count(before),
              documents: count(before, "document"), properties: count(before, "property") },
    after_compact: { groups_with_instances: Object.keys(after).length, instances: count(after),
                     documents: count(after, "document"), properties: count(after, "property"),
                     distinct_masters: new Set(Object.values(after).flat().map((x) => x.master)).size },
    matrix_drawn_closed: drawn(closedScene), matrix_drawn_all_open: drawn(openScene),
    matrix_scene_all_open_ms: Math.round(ms),
  };
  eq(drawn(closedScene), 0, `${label}: Compact leaves the groups closed, no instance drawn`);
  console.log(`  ${label}: ${JSON.stringify(numbers[label])}`);
}
if (NUMBERS) (await import("node:fs")).writeFileSync(NUMBERS, JSON.stringify(numbers, null, 1));

console.log(`check-instances: ${checks} checks passed`);
