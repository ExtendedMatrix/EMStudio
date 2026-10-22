// MICRO-PANNELLI-OVERLAY-TABULAR p.4 · executable check of `src/list-keys.ts`:
// the one rule of the arrows in a list that picks a node (the Outliner's list,
// the Tabular's rows, the Space's side panel), and when a field keeps its keys.
//
//   node scripts/check-list-keys.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({ stdin: { contents: `export * from "./list-keys";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent" });
const L = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (a, want, what) => { checks++; assert.deepStrictEqual(a, want, what); };

// the steps
eq(L.listStep("ArrowDown", 1, 5), 2, "↓ from the second row: the third");
eq(L.listStep("ArrowUp", 1, 5), 0, "↑ from the second row: the first");
eq(L.listStep("ArrowUp", 0, 5), 0, "↑ on the first row stays there");
eq(L.listStep("ArrowDown", 4, 5), 4, "↓ on the last row stays there");
eq(L.listStep("ArrowDown", -1, 5), 0, "↓ with no current row: the first");
eq(L.listStep("ArrowUp", -1, 5), 0, "↑ with no current row: the first");
eq(L.listStep("Home", 3, 5), 0, "Home: the first");
eq(L.listStep("End", 1, 5), 4, "End: the last");
eq(L.listStep("ArrowDown", 0, 0), null, "no rows: nothing");
eq(L.listStep("ArrowLeft", 1, 5), null, "← is not a step");
eq(L.listStep("Home", 3, 5, L.ROW_KEYS), null, "a table's rows: Home stays the cell's");
eq(L.listStep("ArrowDown", 3, 5, L.ROW_KEYS), 4, "…and ↓ moves");

// the fields that keep their keys
eq(L.listMayMove(null), true, "no target: the list moves");
eq(L.listMayMove({ tagName: "DIV" }), true, "the list itself");
eq(L.listMayMove({ tagName: "SELECT" }), false, "a select keeps ↑ ↓");
eq(L.listMayMove({ tagName: "TEXTAREA", value: "", defaultValue: "" }), false, "a text area keeps them");
eq(L.listMayMove({ tagName: "INPUT", type: "number", value: "3", defaultValue: "3" }), false, "a number keeps them (it counts with them)");
eq(L.listMayMove({ tagName: "INPUT", type: "text", value: "D.02", defaultValue: "D.02" }), true, "an untouched text cell lets the row move");
eq(L.listMayMove({ tagName: "INPUT", type: "text", value: "D.02x", defaultValue: "D.02" }), false, "a cell being written keeps them");
eq(L.listMayMove({ tagName: "SPAN", isContentEditable: true }), false, "an editable text keeps them");

console.log(`list-keys: ${checks} checks passed`);
