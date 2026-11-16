// MICRO-E-PORTA-VERSIONI-COLORI p.2 · executable check of asset-list.ts's
// target composition: made on purpose / reused / missing, the rule of the
// masters, and the row's «Rimuovi questa versione» refused for the master and
// for an asset's last version.
//
//   node scripts/check-target-version.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({ entryPoints: [`${SRC}asset-list.ts`], bundle: true, format: "esm", write: false, logLevel: "silent" });
const AL = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const v = (id, o = {}) => ({ id, name: id, master: false, level: "lod1", lod_level: "lod1", level_say: "", use: [], url: `${id}.glb`, checksum: "", stamped: true,
  size_bytes: 100, triangles: 10, gpu_bytes: 0, measured: true, texture_side: null, ktx2: null, tileset: false, textures: [], texture_count: 0, state: "ok",
  made: { by: [], orcid: "", at: "", tool: "", how: "" }, made_say: "", modified_after_stamp: false, sha256_now: "", loaded_by: [], ...o });
const cell = (loads, state = "ok") => ({ state, loads, why: "", proposal: { tool: "keep", triangles: null, texture: null, ktx2: false, why: "" } });
const asset = (id, versions, cells) => ({ id, name: id, kind: "rm", containers: [], branch: "", epochs: [], family: "", status: "", versions,
  targets: { mobile: cell(""), web: cell(""), desk: cell(""), arch: cell(""), ...cells }, findings: [], loaded_why: "", loaded_say: "",
  audit: { versions: versions.length, stamped: 0, files_missing: [], unchecked: 0, modified_after_stamp: [], master_declared: null } });
const A = asset("A", [v("Am", { master: true }), v("A1", { loaded_by: ["web"], size_bytes: 300 }), v("A2", { loaded_by: ["web", "desk"] })],
  { web: cell("A1"), desk: cell("A2") });
const B = asset("B", [v("Bm", { master: true, state: "missing" }), v("B1", { loaded_by: ["web"] })], { web: cell("B1") });
const C = asset("C", [v("Cm", { master: true }), v("C1", { loaded_by: ["desk"] })], { web: cell("Cm", "missing"), desk: cell("C1") });
const D = asset("D", [v("Dm", { master: true }), v("D1", { loaded_by: ["web", "desk"] })], { web: cell("D1"), desk: cell("D1") });
const comp = AL.targetComposition([A, B, C, D], "web");
eq(comp.made.map((x) => x.version), ["A1", "B1"], "made for web: loaded by web alone");
eq(comp.shared.map((x) => x.version), ["D1"], "reused: shared with another target");
eq(comp.missing.map((x) => x.asset), ["C"], "missing: the master is never a fallback");
eq(comp.madeBytes, 400, "the weight of what was made");
eq(comp.noMaster, [{ asset: "B", name: "B", why: "file" }], "B: its master's file is not there — deleting waits");
eq(AL.targetComposition([A, B, C, D], "desk").made.map((x) => x.version), ["C1"], "desk: C1 alone (A2 is shared)");
eq(AL.versionRemovalRefusal(A, "Am"), "master", "the master: refused");
eq(AL.versionRemovalRefusal(B, "B1"), "last", "the last version: refused");
eq(AL.versionRemovalRefusal(A, "A1"), null, "a version among others: allowed");
eq(AL.usableMaster(C), { ok: true, why: null }, "a master there");
console.log(`check-target-version: ${checks} checks passed`);
