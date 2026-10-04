// I1 · every state of s3Dgraphy's list has its sign in EMStudio, and EMStudio
// draws no state that is not in the list.
//
//   node scripts/check-state-symbols.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({ stdin: { contents: 'export * from "./state-symbols.ts";', resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent" });
const S = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
const list = JSON.parse(readFileSync(`${SRC}assets/em_state_symbols.json`, "utf8")).states;
let checks = 0;
assert.deepEqual(Object.keys(S.TONES).sort(), Object.keys(list).sort(),
  "EMStudio's signs are exactly the list's states");
checks++;
for (const id of Object.keys(list)) {
  const s = S.stateSign(id);
  assert.equal(s.glyph, list[id].glyph, `${id}: the glyph is the list's`);
  assert.ok(s.label && s.meaning, `${id}: label and meaning`);
  checks += 2;
}
const files = Object.keys(list).filter((k) => k.startsWith("file.")).map((k) => k.slice(5)).sort();
assert.deepEqual(files, ["both", "empty_copy", "missing", "on_disk", "on_node", "reference_only"],
  "the file states are the resolver's");
checks++;
console.log(`state-symbols: ${checks} checks passed`);
