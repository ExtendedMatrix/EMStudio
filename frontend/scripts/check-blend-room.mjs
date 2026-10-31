// MICRO-BLEND-OFFICINA-2 · the .blend in the room, EMStudio's half
// (blend-room.ts): the lease, the manual level, the selection gate, the ids of
// an object, the working .blend's name, the delta of a background Blender in
// one undo step, the recipes of a document. The same cases are asked of
// s3Dgraphy's `resources.blend_room` when its Python is here (S3D_PY or
// ../../s3Dgraphy/.venv/bin/python): both must answer alike.
//
//   node scripts/check-blend-room.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}blend-room.ts`], bundle: true, format: "esm", write: false });
const R = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { checks++; assert.ok(c, what); };
const eq = (a, b, what) => { checks++; assert.deepEqual(a, b, what); };

// the lease
const ls = { key: "SB/GreatTemple_2026_v2.blend", person: "orcid:ED", display: "Emanuel", host: "mac-ed", since: 1000, renewed: 1000 };
ok(R.leaseAlive(ls, 1000 + R.LEASE_TTL_S) && !R.leaseAlive(ls, 1001 + R.LEASE_TTL_S), "15 minutes without a sign");
eq(R.leaseLabel(ls, "it", () => "00:16"), "aperto da Emanuel su mac-ed dalle 00:16", "the label");
eq(R.mayWrite(ls, "orcid:ED", "mac-ed", 1100), "mine", "mine");
eq(R.mayWrite(ls, "orcid:ED", "pc-lab", 1100), "mine_elsewhere", "mine elsewhere");
eq(R.mayWrite(ls, "orcid:EL", "", 1100), "readonly", "someone else: read only");
eq(R.mayWrite(ls, "orcid:EL", "", 1000 + R.LEASE_TTL_S + 5), "free", "lapsed: free");
ok(R.mayRelease(ls, "orcid:ED") && !R.mayRelease(ls, "orcid:EL") && R.mayRelease(ls, "orcid:EL", "owner"), "who releases");
eq(R.leaseFor([ls], ls.key, 1100), ls, "the lease of a key");
eq(R.leaseFor([ls], ls.key, 99999), null, "a lapsed lease is none");
eq(R.fileKey("/p/T/SB/GreatTemple_2026_v2.blend", "/p/T"), "SB/GreatTemple_2026_v2.blend", "the key relative");
eq(R.fileKey("C:\\p\\T\\SB\\a.blend", "C:\\p\\T"), "SB/a.blend", "the key on Windows");

// D6
eq(R.manualLevel([], "2026-10-31"), "manual-2026-10-31", "first of the day");
eq(R.manualLevel(["lod1", "manual-2026-10-31"], "2026-10-31"), "manual-2026-10-31-2", "second");
eq(R.manualLevel(["manual-2026-10-31", "manual-2026-10-31-2", "manual-2026-10-30"], "2026-10-31"), "manual-2026-10-31-3", "third");
ok(R.isManual("manual-2026-10-31-2") && !R.isManual("lod0"), "is manual");

// selection
const objs = [{ name: "GT16.SU001", kind: "proxy", props: {} }, { name: "Architrave", kind: "model", props: { em_rm_node_id: "rm1" } },
              { name: "Walls", kind: "model", props: { em_asset_id: "walls" } }];
const names = new Map([["GT16.SU001", "us-001"]]);
eq(R.idsOfObjects(objs, ["GT16.SU001", "Architrave"], names), ["us-001", "rm1"], "ids of objects");
eq(R.objectsOfIds(objs, ["rm1", "walls"]), ["Architrave", "Walls"], "objects of ids");
const g = new R.SelectionGate();
ok(g.shouldSend(["a"], 0) && !g.shouldSend(["a"], 0.1), "the same set is not sent twice");
g.markApplied(["b"], 1.0);
ok(!g.shouldSend(["b"], 1.2), "the echo of what was applied is not sent");
ok(g.shouldSend(["c"], 1.3), "a new set is sent");
ok(!g.shouldApply(["c"]), "our own selection coming back is not applied");
g.enabled = false;
ok(!g.shouldSend(["d"]) && !g.shouldApply(["e"]), "the switch");

// the working .blend's name
const taken = new Set(["/p/SB/GT_webxr.blend"]);
eq(R.composeOut("/p/SB/GT.blend", "modelling", (p) => taken.has(p)), "/p/SB/GT_modelling.blend", "default name");
eq(R.composeOut("/p/SB/GT.blend", "webxr", (p) => taken.has(p)), "/p/SB/GT_webxr-2.blend", "never over a file");

// the delta, one undo step
const nodes = new Map([["m1", { id: "m1", data: { url: "blend://x" } }], ["rm1", { id: "rm1" }]]);
let batches = 0; const edges = [];
const store = {
  batch(fn) { batches++; return fn(); },
  node: (id) => nodes.get(id),
  addNode: (n) => nodes.set(n.id, n),
  updateNode: (id, p) => nodes.set(id, { ...nodes.get(id), ...p }),
  addEdge: (s, t, ty, a, id) => edges.push({ s, t, ty, id }),
  hasEdge: (id) => edges.some((e) => e.id === id),
};
const got = R.applyGraphDelta(store, {
  nodes_added: [{ id: "v1", node_type: "resource", name: "Architrave@manual-2026-10-31", data: { level: "manual-2026-10-31" } }],
  nodes_changed: [{ id: "m1", node_type: "resource", data: { url: "../SB/master/A.gltf", from_datablock: "blend://x" } }, { id: "gone", node_type: "x" }],
  edges_added: [{ id: "e1", edge_type: "has_linked_resource", source: "rm1", target: "v1" },
                { id: "e2", edge_type: "x", source: "nowhere", target: "v1" }] });
eq(got, { added: 1, changed: 1, edges: 1, skipped: ["gone", "e2"] }, "the delta's counts");
ok(batches === 1, "one batch = one undo step");
eq(nodes.get("m1").data, { url: "../SB/master/A.gltf", from_datablock: "blend://x" }, "data merged");

// recipes
const recipes = R.recipesOf({ detail_recipes: [{ key: "k1", kind: "tileset", document: "D.12", source: "RB/cesium/TempluMare.3tz",
  area: [1, 2, 0, 5, 6, 3], level: "densest", made_by: "E.D." }, { nokey: true }] });
eq(recipes.length, 1, "only recipes with a key");
eq(R.recipeLine(recipes[0]), "4.0 × 4.0 m · L densest · E.D.", "a recipe's line");

// the same answers from s3Dgraphy, when it is here
const py = process.env.S3D_PY || new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname;
if (fs.existsSync(py)) {
  const src = new URL("../../../s3Dgraphy/src", import.meta.url).pathname;
  const out = JSON.parse(execFileSync(py, ["-c", `
import json, sys
sys.path.insert(0, ${JSON.stringify(src)})
from s3dgraphy.resources import blend_room as R
ls = R.lease_record("SB/GreatTemple_2026_v2.blend", person="orcid:ED", display="Emanuel", host="mac-ed", now=1000.0)
print(json.dumps({
  "ttl": R.LEASE_TTL_S,
  "modes": [R.may_write(ls, person="orcid:ED", host="mac-ed", now=1100)["mode"], R.may_write(ls, person="orcid:ED", host="pc-lab", now=1100)["mode"],
            R.may_write(ls, person="orcid:EL", now=1100)["mode"], R.may_write(ls, person="orcid:EL", now=1000 + R.LEASE_TTL_S + 5)["mode"]],
  "levels": [R.manual_level([], "2026-10-31"), R.manual_level(["lod1", "manual-2026-10-31"], "2026-10-31"),
             R.manual_level(["manual-2026-10-31", "manual-2026-10-31-2", "manual-2026-10-30"], "2026-10-31")],
  "key": R.file_key("/p/T/SB/GreatTemple_2026_v2.blend", "/p/T"),
  "ids": R.ids_of_objects(${JSON.stringify(objs)}, ["GT16.SU001", "Architrave"], node_names={"GT16.SU001": "us-001"}),
  "objs": R.objects_of_ids(${JSON.stringify(objs)}, ["rm1", "walls"]),
  "release": [R.may_release(ls, person="orcid:ED"), R.may_release(ls, person="orcid:EL"), R.may_release(ls, person="orcid:EL", role="owner")],
}))`], { encoding: "utf8" }));
  eq(out.ttl, R.LEASE_TTL_S, "py: ttl");
  eq(out.modes, ["mine", "mine_elsewhere", "readonly", "free"], "py: modes");
  eq(out.levels, ["manual-2026-10-31", "manual-2026-10-31-2", "manual-2026-10-31-3"], "py: levels");
  eq(out.key, R.fileKey("/p/T/SB/GreatTemple_2026_v2.blend", "/p/T"), "py: key");
  eq(out.ids, R.idsOfObjects(objs, ["GT16.SU001", "Architrave"], names), "py: ids");
  eq(out.objs, R.objectsOfIds(objs, ["rm1", "walls"]), "py: objects");
  eq(out.release, [true, false, true], "py: release");
} else console.log("(s3Dgraphy's Python not here: the mirror is checked alone)");

console.log(`check-blend-room: ${checks} checks ✓`);
