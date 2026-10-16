// MICRO-SPAZIO-3D p.1 · the Outliner of the Space — pure parts
// (`src/space-outliner.ts`), in node:
//
//   node scripts/check-space-outliner.mjs
//
// The tree (epoch → models with their versions and tilesets; epoch → proxies by
// the type of their unit; the sketches last), the keys under a row (what the eye
// and the arrow switch), the search, what is open by default, and the local
// preferences per person (never in a document).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}space-outliner.ts`], bundle: true, format: "esm", write: false });
const O = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const input = {
  epochs: [{ id: "E2", name: "II d.C.", current: true }, { id: "E1", name: "I a.C.", current: false }],
  rms: (ep) => ep === "E2" ? [
    { id: "RM_tiles", name: "Rilievo", glyph: "representation_model", tileset: true, versions: [] },
    { id: "RM_cella", name: "Cella", glyph: "representation_model", tileset: false, versions: [
      { id: "v0", name: "cella LOD0", drawn: false, chosen: false }, { id: "v1", name: "cella LOD1", drawn: true, chosen: true }] },
  ] : [],
  proxies: (ep) => ep === "E2" ? [
    { unitId: "US10", name: "US10", type: "US" }, { unitId: "US2", name: "US2", type: "US" },
    { unitId: "USV101", name: "USV101", type: "USVs" }, { unitId: "SF1", name: "SF1", type: "SF" },
  ] : [{ unitId: "US1", name: "US1", type: "US" }],
  typeLabel: (t) => t.replace(/^USV([sn])$/, "USV/$1"),
  sketches: [{ id: "sketch-1", name: "Parallelepipedo.001", shape: "cuboid" }],
  texts: { rms: "Representation models", proxies: "Proxies", sketches: "Sketched" },
};
const tree = O.buildOutlinerTree(input);
eq(tree.map((r) => r.key), ["epoch:E2", "epoch:E1", "sketches"], "the epochs, then the sketches");
const e2 = tree[0];
eq(e2.children.map((r) => r.kind), ["rms", "proxies"], "an epoch: its models, its proxies");
eq(e2.children[0].children.map((r) => [r.key, r.kind]), [["rm:RM_cella", "rm"], ["rm:RM_tiles", "tileset"]], "the models, the tileset after them");
eq(e2.children[0].children[0].children.map((v) => [v.name, v.drawn]), [["cella LOD0", false], ["cella LOD1", true]], "the versions, the drawn one marked");
eq(e2.children[1].children.map((r) => r.name), ["SF (1)", "US (2)", "USV/s (1)"], "the proxies by type of unit, with how many");
eq(e2.children[1].children[1].children.map((r) => r.name), ["US2", "US10"], "the names in their natural order");
eq(O.objectKeys(e2).sort(), ["proxy:SF1", "proxy:US10", "proxy:US2", "proxy:USV101", "rm:RM_cella", "rm:RM_tiles"], "the eye of an epoch: everything in it");
eq(O.objectKeys(e2.children[0].children[0]), ["rm:RM_cella"], "a model's eye: the model (not its versions)");
eq(O.objectKeys(tree[2]), ["sketch:sketch-1"], "the sketches' eye");
// search
const f = O.filterTree(tree, "us1");
eq(f.map((r) => r.key), ["epoch:E2", "epoch:E1"], "a search keeps the epochs that hold a match");
eq(f[0].children.map((r) => r.key), ["proxies:E2"], "…and only the groups that lead to it");
eq(f[0].children[0].children[0].children.map((r) => r.name), ["US10"], "US10 matches «us1»");
eq(O.filterTree(tree, "cella")[0].children[0].children[0].children.length, 2, "a matching row keeps its children");
eq(O.filterTree(tree, "").length, 3, "no search: everything");
// open by default
const tg = new Set();
ok(O.rowOpen({ key: "epoch:E2", kind: "epoch", current: true }, tg), "the epoch in the scene: open");
ok(!O.rowOpen({ key: "epoch:E1", kind: "epoch", current: false }, tg), "another epoch: closed");
ok(!O.rowOpen({ key: "rm:RM_cella", kind: "rm" }, tg), "a model's versions: closed");
ok(O.rowOpen({ key: "proxies:E2", kind: "proxies" }, tg), "a group: open");
ok(O.rowOpen({ key: "epoch:E1", kind: "epoch", current: false }, new Set(["epoch:E1"])), "turned by the person: open");
// the preferences
const ED = "0000-0002-1825-0097";
eq(O.loadSpacePrefs(ED), O.DEFAULT_PREFS, "nobody wrote anything: the default");
O.saveSpacePrefs(ED, { ...O.DEFAULT_PREFS, hidden: ["proxy:US10"], locked: ["rm:RM_tiles"], width: 320, shown: false, toggled: ["epoch:E1"] });
eq(O.loadSpacePrefs(ED), { shown: false, width: 320, toggled: ["epoch:E1"], hidden: ["proxy:US10"], locked: ["rm:RM_tiles"] }, "E.D.'s, read back");
eq(O.loadSpacePrefs("0000-0001-5109-3700"), O.DEFAULT_PREFS, "another person: the default");
eq([...mem.keys()], ["emstudio.space3d"], "one local preference, emstudio.space3d — never in a document");
mem.set("emstudio.space3d", "{broken");
eq(O.loadSpacePrefs(ED), O.DEFAULT_PREFS, "a broken store reads as the default");
console.log(`check-space-outliner: ${checks} checks passed`);
