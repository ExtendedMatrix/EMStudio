// MICRO-BLEND-OFFICINA-1 · a .blend in the Archive opens as a folder: what the
// view DRAWS of s3Dgraphy's answer (blend-folder.ts) — the label on the row,
// the tree flattened with collections shut, the filters, the worst state of
// a collection. The answer itself (inventory, «Check against the graph») is
// s3Dgraphy's: tests/test_blend_folder.py there.
//
//   node scripts/check-blend-folder.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}blend-folder.ts`], bundle: true, format: "esm", write: false });
const F = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { checks++; assert.ok(c, what); };
const o = (name, kind, cols, extra = {}) => ({ name, type: "MESH", kind, collections: cols, props: {}, triangles: 10,
  mesh: name, library: null, linked: false, source: "/p/SB/a.blend", source_rel: "", chain: [], missing: false,
  epochs: [], units: [], content: true, ...extra });
const folder = {
  inventory: { blend: "/p/SB/a.blend", folder: "/p/SB", libraries: [], images: [],
    objects: [o("Architrave", "model", ["Architettura"], { epochs: ["II A.D."], props: { em_rm_node_id: "Architrave_model" } }),
              o("Walls", "model", ["Architettura"]),
              o("GT16.SU001", "proxy", ["Proxy"]),
              o("ME_PODIO", "other", ["RB"], { linked: true, source: "/p/RB/TM.blend", source_rel: "../RB/TM.blend" }),
              o("Camera", "other", [], { type: "CAMERA", content: false })],
    counts: { objects: 5, content: 4, linked: 1, graph: 1, kinds: {}, textures: {}, libraries: 1, libraries_missing: 0 } },
  tree: [{ kind: "collection", name: "RM", objects: [], children: [{ kind: "collection", name: "Architettura", objects: ["Architrave", "Walls"], children: [] }] },
         { kind: "collection", name: "Proxy", objects: ["GT16.SU001"], children: [] },
         { kind: "collection", name: "RB", objects: ["ME_PODIO"], children: [] },
         { kind: "loose", name: "", objects: ["Camera"], children: [] },
         { kind: "library", name: "TM.blend", path: "/p/RB/TM.blend", rel: "../RB/TM.blend", exists: true, objects: ["ME_PODIO"], children: [] }],
  check: { rows: [], sentence: "✔ 2 · ↑ 1 · ○ 1", source: "disk", offline: false, as_of: "",
           counts: { aligned: 2, changed_here: 1, newer_outside: 0, missing: 0, only_here: 1 },
           objects: { Architrave: "aligned", Walls: "changed_here", "GT16.SU001": "aligned", ME_PODIO: "only_here" } },
};

// the label of the row: the objects, then the signs that are not zero
ok(F.blendLabel(folder) === "5 ✔2 ↑1 ○1", `label ${F.blendLabel(folder)}`);
ok(F.blendLabel({ inventory: folder.inventory }) === "5", "no check yet: the objects alone");
ok(F.blendLabel(null) === "", "not read: no label");

// the tree, all open
let rows = F.flatten(folder, {}, new Set());
ok(rows.map((r) => r.name).join(",") === "RM,Architettura,Architrave,Walls,Proxy,GT16.SU001,RB,ME_PODIO,,Camera,TM.blend,ME_PODIO",
   `flattened ${rows.map((r) => r.name).join(",")}`);
const arch = rows.find((r) => r.name === "Architettura");
ok(arch.depth === 1 && arch.count === 2 && arch.state === "changed_here", "a collection: its depth, its objects, its worst state");
ok(rows.find((r) => r.name === "RM").count === 2, "a parent counts its children's objects");
// a collection shut
rows = F.flatten(folder, {}, new Set([arch.key]));
ok(!rows.some((r) => r.name === "Architrave") && rows.some((r) => r.name === "Architettura"), "shut: its head stays, its objects go");
// the filters: a kind, a state, an epoch, a name (accent-blind), a unit
const names = (f) => F.flatten(folder, f, new Set()).filter((r) => r.kind === "object").map((r) => r.name).join(",");
ok(names({ kind: "proxy" }) === "GT16.SU001", "kind: proxy");
ok(names({ state: "changed_here" }) === "Walls", "state: ↑");
ok(names({ epoch: "ii a.d." }) === "Architrave", "epoch, case-blind");
ok(names({ q: "PODÍO" }) === "ME_PODIO,ME_PODIO", "name, accent-blind (in its collection and under its library)");
ok(names({ unit: "SU001" }) === "GT16.SU001", "unit: the proxy's name without the graph's code");
ok(names({ model: "architrave" }) === "Architrave", "model: its RM");
ok(!F.flatten(folder, { kind: "proxy" }, new Set()).some((r) => r.name === "RM"), "while filtering, an empty collection is left out");
ok(F.unitName("GT16.USV105") === "USV105" && F.unitName("Column.001") === "Column.001", "unitName as s3Dgraphy's");
const ch = F.filterChoices(folder.inventory);
ok(ch.kinds.join() === "model,other,proxy" && ch.epochs.join() === "II A.D." && ch.collections.includes("RB"), "the selects offer what is there");
ok(F.worstState(["aligned", "only_here", undefined]) === "only_here" && F.worstState([]) === null, "the worst state");
console.log(`blend folder: ${checks} checks ✓`);
