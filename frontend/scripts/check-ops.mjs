// V1 · one vocabulary of operations on every wire (Sidecar and room).
//
//   node scripts/check-ops.mjs
//
// `hub.ts` `opsForLocalChange` / `validateOp` are the twins of s3Dgraphy
// `crdt.ops_for_local_change` / `crdt.validate_op`. The golden
// (`testdata/ops-golden.json`, written by `tools/ops_golden.py`) holds the
// library's answer to each case; this asks the twin the same.
//
//   1. each case: the same operations, or the same sentence refused
//   2. the validator's verdicts on loose shapes
//   3. what is "not news" (stale, idempotent…) is the library's list
//   4. main.ts: the Sidecar and the room leave from ONE translation (no
//      `sendOp(op)` of a store's change), and an arriving op goes through it
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const TD = new URL("../testdata/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: 'export * from "./hub.ts";', resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const H = await import("data:text/javascript;base64," +
  Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const golden = JSON.parse(readFileSync(`${TD}ops-golden.json`, "utf8"));
let checks = 0;
const plain = (x) => JSON.parse(JSON.stringify(x));

for (const c of golden.cases) {
  const before = JSON.stringify(c.local);
  if (c.error !== undefined) {
    assert.throws(() => H.opsForLocalChange(structuredClone(c.local), c.study_language),
                  (e) => e.message === c.error, `${c.name}: refused with the library's sentence`);
  } else {
    assert.deepEqual(plain(H.opsForLocalChange(structuredClone(c.local), c.study_language)),
                     c.ops, `${c.name}: the library's operations`);
  }
  assert.equal(JSON.stringify(c.local), before, `${c.name}: the change is not touched`);
  checks++;
}
for (const v of golden.validate) {
  assert.equal(H.validateOp(v.op), v.reason, `validate ${JSON.stringify(v.op)}`);
  checks++;
}
assert.deepEqual(H.NOT_NEWS, golden.not_news, "not news: the library's list");
checks++;

const main = readFileSync(`${SRC}main.ts`, "utf8");
const onOp = main.slice(main.indexOf("s.onOp((op) =>"), main.indexOf("s.onOp((op) =>") + 1800);
assert.match(onOp, /opsForLocalChange\(/, "the store's change is translated once, at the door");
assert.doesNotMatch(onOp, /sync\.sendOp\(op\)/, "…and the store's own verb never reaches the Sidecar");
checks += 2;
assert.match(main, /function applyWireOp\(/, "one apply path for what arrives");
const sidecarIn = main.slice(main.indexOf("onOp: (op) => {"), main.indexOf("onOp: (op) => {") + 600);
assert.match(sidecarIn, /applyWireOp\(/, "the Sidecar's arrivals go through it");
checks += 2;

console.log(`ops: ${checks} checks passed`);
