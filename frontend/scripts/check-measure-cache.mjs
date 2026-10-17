// MICRO-PROVA-DEV48 p.5 · what EMStudio measures of a file is a cache, not a
// datum — pure parts (`src/measure-cache.ts`), in node:
//
//   node scripts/check-measure-cache.mjs
//
// The fingerprint (the declared checksum and size), a measure kept and read
// back, a count that differs replacing the old one (the file changed), no
// measure without a fingerprint, the store's one key (never a document), a
// broken store, and the oldest forgotten past the ceiling.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}measure-cache.ts`], bundle: true, format: "esm", write: false });
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// OB_PODIO_LOD0.obj of Templu Mare v3.2, as the graph declares it
const fp = M.fingerprint("sha256:a8aef61c543da50e9fa6ea5600903d3f4da4d0d587dd36aab703f4350d68b4d5", 94101468);
eq(fp, "sha256:a8aef61c543da50e9fa6ea5600903d3f4da4d0d587dd36aab703f4350d68b4d5|94101468", "the fingerprint: the declared checksum and size");
eq(M.fingerprint("sha256:abc"), "sha256:abc", "no size: the checksum");
eq(M.fingerprint("", 10), null, "no checksum: no fingerprint (measured, never kept)");
eq(M.fingerprint(undefined, 10), null, "…and none for nothing");
eq(M.getMeasure(fp), null, "nothing measured yet");
ok(M.putMeasure(fp, { tris: 1999800, verts: 1000000, by: "EMStudio test", at: "2026-10-17T18:00:00Z" }), "a measure kept");
eq(M.getMeasure(fp), { tris: 1999800, verts: 1000000, by: "EMStudio test", at: "2026-10-17T18:00:00Z" }, "…read back, with when and by what");
ok(!M.putMeasure(fp, { tris: 1999800, verts: 1000000, by: "EMStudio test" }), "the same count again: nothing written");
ok(M.putMeasure(fp, { tris: 2000000, verts: 1000100, by: "EMStudio test" }), "a count that differs (the file changed under the same name): it replaces the old");
eq(M.getMeasure(fp).tris, 2000000, "…the new count");
ok(!M.putMeasure(null, { tris: 5, by: "x" }), "no fingerprint: not kept");
ok(!M.putMeasure("sha256:z", { tris: 0, by: "x" }), "an empty count: not kept");
eq([...mem.keys()], ["emstudio.measures"], "one local key, emstudio.measures — never in a document");
// a new fingerprint (the tool wrote the file again): a new measure, the old one stays apart
const fp2 = M.fingerprint("sha256:ffff", 94101500);
eq(M.getMeasure(fp2), null, "a file with another checksum is not measured yet");
// the ceiling: the oldest go first
M.clearMeasures();
for (let i = 0; i < M.MEASURE_MAX + 5; i++) M.putMeasure(`sha256:${i}`, { tris: 1 + i, by: "x", at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() });
eq(Object.keys(JSON.parse(mem.get("emstudio.measures"))).length, M.MEASURE_MAX, `at most ${M.MEASURE_MAX} measures`);
eq(JSON.parse(mem.get("emstudio.measures"))["sha256:0"], undefined, "the oldest gone");
console.log(`check-measure-cache: ${checks} checks passed`);
