// MICRO-SPAZIO-3D · parte 0 · the 3D among the computed instances: the
// client's reading of `em_visual_rules.json` → `threed_instances`
// (`src/paradata-view.ts`, `threedInstances` and `unitsWithout3d`) gives, on the
// same documents, exactly what s3Dgraphy's `paradata_view.threed_instances` and
// `units_without_3d` give — one rule, read twice.
//
//   node scripts/check-threed.mjs [study.em.json …]
//
// A small temple written here (a proxy in a group, one without, an empty
// geometry, a model in three epochs bound directly, and one bound only through an
// epoch property — 1.6.36: that form gives no instance)
// and every file given are compared. Without the s3Dgraphy venv the oracle is
// skipped and only the temple's expected answers are checked.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as V from "./paradata-view";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { V } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
function oracle(doc) {
  if (!existsSync(PY)) return null;
  const script = `
import json,sys
from s3dgraphy import api
g, w = api.load_emjson(json.loads(sys.stdin.read()))
print(json.dumps({"inst": api.threed_instances(g), "units": api.units_without_3d(g)}))`;
  return JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify(doc), maxBuffer: 1 << 28,
    env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
}

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

const FIELDS = ["id", "kind", "master", "node_type", "name", "owner", "owner_kind", "owner_name", "group", "place",
                "removed", "beside", "files", "empty", "epochs", "count", "count_label"];
const pick = (r) => Object.fromEntries(FIELDS.filter((k) => k in r).map((k) => [k, r[k]]));
const key = (r) => `${r.kind}|${r.id}`;
const sorted = (xs) => xs.map(pick).sort((a, b) => key(a).localeCompare(key(b)));

function compare(doc, label) {
  const ts = V.threedInstances(doc);
  const tu = V.unitsWithout3d(doc);
  const py = oracle({ header: { format: "em.json", version: "1.6", ...(doc.header ?? {}) }, graph: doc.graph });
  if (!py) { console.log(`  ${label}: no s3Dgraphy venv, oracle skipped`); return { ts, tu }; }
  eq(sorted(ts), sorted(py.inst), `${label}: threed_instances, field for field`);
  for (const k of ["with", "empty", "none", "without"]) eq([...tu[k]].sort(), [...py.units[k]].sort(), `${label}: units ${k}`);
  console.log(`  ${label}: ${ts.filter((r) => r.kind === "proxy").length} proxies, ${ts.filter((r) => r.kind === "rm").length} RM instances, `
    + `units with ${tu.with.length} · empty ${tu.empty.length} · none ${tu.none.length} — same as s3Dgraphy`);
  return { ts, tu };
}

// ── the temple ───────────────────────────────────────────────────────────────
const N = (id, node_type, name, data = {}) => ({ id, node_type, name, data });
const E = (id, source, target, edge_type) => ({ id, source, target, edge_type });
const temple = { header: {}, graph: { graph_id: "temple", name: "temple", nodes: [
  N("E1", "EpochNode", "I a.C.", { start_time: -100, end_time: -1 }),
  N("E2", "EpochNode", "I d.C.", { start_time: 1, end_time: 100 }),
  N("E3", "EpochNode", "II d.C.", { start_time: 101, end_time: 200 }),
  N("PD_E1", "ParadataNodeGroup", "PD_I a.C."),
  N("US1", "US", "US 1"), N("PD_US1", "ParadataNodeGroup", "US1_PD"),
  N("P1", "property", "geometry", { property_type: "geometry", value: "S1" }),
  N("S1", "semantic_shape", "US 1 geometry"),
  N("R1", "resource", "US 1.glb", { url: "proxies/US 1.glb", url_type: "proxy_model", checksum: "sha256:00", residency: "resident" }),
  N("US2", "US", "US 2"),
  N("P2", "property", "geometry", { property_type: "geometry", value: "S2" }),
  N("S2", "semantic_shape", "US 2 geometry", { convexshapes: [[0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]], spheres: [] }),
  N("US3", "US", "US 3"),
  N("P3", "property", "geometry", { property_type: "geometry", value: "" }),
  N("US5", "USVs", "USV 5"),
  N("BR1", "BR", "BR 1"),
  N("RM_A", "representation_model", "cella"), N("RM_B", "representation_model", "pronao"),
  N("RM_C", "representation_model", "podio"),
  N("PE3", "property", "modello", { value: "RM_C" }),
], edges: [
  E("hg1", "E1", "PD_E1", "has_paradata_nodegroup"),
  E("hgu", "US1", "PD_US1", "has_paradata_nodegroup"),
  E("h1", "US1", "P1", "has_property"), E("s1", "P1", "S1", "has_semantic_shape"), E("l1", "S1", "R1", "has_linked_resource"),
  E("h2", "US2", "P2", "has_property"), E("s2", "P2", "S2", "has_semantic_shape"),
  E("h3", "US3", "P3", "has_property"),
  E("r1", "E1", "RM_A", "has_representation_model"), E("r2", "E2", "RM_A", "has_representation_model"),
  E("r3", "E3", "RM_A", "has_representation_model"),
  E("hp", "E3", "PE3", "has_property"), E("rc", "PE3", "RM_C", "has_representation_model"),
  E("r4", "E3", "RM_B", "has_representation_model"),
] }, layout: {} };
{
  const ts = V.threedInstances(temple);
  const px = Object.fromEntries(ts.filter((r) => r.kind === "proxy").map((r) => [r.owner, r]));
  eq(Object.keys(px).sort(), ["US1", "US2"], "the temple: two proxies (US 3's geometry has no shape)");
  eq([px.US1.group, px.US1.beside, px.US1.id, px.US1.files], ["PD_US1", "P1", "S1##PD_US1", ["R1"]], "US 1: in its group, beside its property");
  eq([px.US2.group, px.US2.place, px.US2.empty], [null, "US2", false], "US 2: no group, the place is the unit; hulls are a payload");
  const a = ts.filter((r) => r.master === "RM_A");
  eq(a.map((r) => r.owner).sort(), ["E1", "E2", "E3"], "RM A in three epochs");
  eq([...new Set(a.map((r) => r.count_label))], ["×3"], "…and each says ×3");
  eq(ts.filter((r) => r.master === "RM_C"), [], "RM C bound only through an epoch property: no instance (1.6.36)");
  eq(a.find((r) => r.owner === "E1").id, "RM_A##PD_E1", "…in the epoch's paradata group");
  eq(ts.find((r) => r.master === "RM_B").count_label, null, "RM B in one epoch: no ×");
  const u = V.unitsWithout3d(temple);
  eq([u.with, u.empty, u.none], [["US1", "US2"], ["US3"], ["US5"]], "units: with, empty, none (BR is not a unit to model)");
  compare(temple, "the temple");
}

// ── the studies given ────────────────────────────────────────────────────────
for (const path of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const sections = raw.graphs ? Object.values(raw.graphs) : [raw.graph];
  for (const sec of sections) {
    const { ts } = compare({ header: raw.header ?? {}, graph: sec, layout: {} }, `${path.split("/").pop()} · ${sec.name ?? sec.graph_id ?? ""}`);
    ok(ts.length >= 0, "read");
  }
}
console.log(`check-threed: ${checks} checks passed`);
