// MICRO-RIFINITURE p.8 (E.D., 6 Nov 2026) · the SUB-EPOCHS in the Space: XX sec.
// with two surveys (2013, 2015) as sub-epochs. `subEpochs(top)` lists them (the
// whole subtree, the oldest first); `summary(sub)` gives only the sub-epoch's
// models (and its own sub-epochs'), `summary(top)` all of them — as the Matrix
// shows them in sub-bands. And the bar: a «sub-epoch» menu beside the epoch.
//
//   node scripts/check-space-subepochs.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };
const bundle = await esbuild.build({ stdin: { contents: `export { buildSpace } from "./space"; export { isStratigraphicType } from "./rules";`,
  resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false, logLevel: "silent" });
const S = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const N = (id, node_type, name, data = {}) => ({ id, node_type, name, data });
const E = (source, target, edge_type) => ({ id: `${source}_${edge_type}_${target}`, source, target, edge_type });
const nodes = [
  N("XX", "EpochNode", "XX sec", { start_time: 1801, end_time: 2026 }),
  N("II", "EpochNode", "II A.D.", { start_time: 100, end_time: 199 }),
  N("E13", "EpochNode", "2013", { start_time: 2013, end_time: 2014 }),
  N("E15", "EpochNode", "2015", { start_time: 2015, end_time: 2026 }),
  N("E15a", "EpochNode", "2015 · campagna B", { start_time: 2016 }),
  N("S13", "representation_model", "Survey2013"), N("S15", "representation_model", "Survey2015"),
  N("S15b", "representation_model", "Survey2015 B"), N("OLD", "representation_model", "Rilievo senza sotto-epoca"),
  N("REC", "representation_model", "Reconstruction II"),
  N("U1", "US", "SU001"), N("U2", "US", "SU002"),
];
const edges = [
  E("XX", "E13", "has_sub_epoch"), E("XX", "E15", "has_sub_epoch"), E("E15", "E15a", "has_sub_epoch"),
  E("E13", "S13", "has_representation_model"), E("E15", "S15", "has_representation_model"), E("E15a", "S15b", "has_representation_model"),
  E("XX", "OLD", "has_representation_model"), E("II", "REC", "has_representation_model"),
  E("U1", "E13", "has_first_epoch"), E("U2", "XX", "has_first_epoch"),
];
const sp = S.buildSpace({ graph: { nodes, edges } }, { isUnit: S.isStratigraphicType });
eq(sp.epochs.map((e) => e.name), ["XX sec", "II A.D."], "the bar's epochs are the top ones, newest first");
eq(sp.subEpochs("XX").map((e) => `${e.name}@${e.depth}`), ["2013@1", "2015@1", "2015 · campagna B@2"], "XX sec's sub-epochs: the subtree, the oldest first, with the depth");
eq(sp.subEpochs("II"), [], "an epoch without sub-epochs: none");
const ids = (ep) => (sp.summary(ep)?.rms ?? []).map((r) => r.id).sort();
eq(ids("XX"), ["OLD", "S13", "S15", "S15b"], "the top epoch («all»): the models of every sub-epoch, and its own");
eq(ids("E13"), ["S13"], "2013: only its survey");
eq(ids("E15"), ["S15", "S15b"], "2015: its survey and its own sub-epoch's");
eq(ids("E15a"), ["S15b"], "a sub-sub-epoch: only its own");
eq(sp.summary("E13")?.epoch.name, "2013", "the summary of a sub-epoch says the sub-epoch");
eq(sp.summary("E13")?.units, ["U1"], "the units of a sub-epoch: those it holds");
eq([...(sp.summary("XX")?.units ?? [])].sort(), ["U1", "U2"], "…and the epoch all of them");
eq(sp.topOf("E15a"), "XX", "a sub-sub-epoch's top");
const main = readFileSync(`${SRC}main.ts`, "utf8");
ok(/sp\?\.subEpochs\(e\.id\)/.test(main) && /\[data-epoch-pick\]/.test(main) && !/data-sub-epoch-pick/.test(main), "the bar: ONE menu, the epochs and their phases as a tree (MICRO-SPAZIO-CONTAINER p.9)");
ok(/sp\.subEpochs\(top\)\.some\(\(e\) => e\.id === spaceEpochId\)\) return spaceEpochId/.test(main), "the scene's epoch may be a sub-epoch");
console.log(`check-space-subepochs: ${checks} checks passed`);
