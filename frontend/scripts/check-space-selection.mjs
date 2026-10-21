// MICRO-SPAZIO-3D-3 p.1 · the Space's one selection, as Blender's — pure
// (`src/space-selection.ts`), and the N panel's carry (`carryXf`):
//
//   node scripts/check-space-selection.mjs
//
// · E.D.'s case: a group of models open in the Outliner, one selected; a click
//   on it again keeps it, ⌘-click takes it away, a click on another leaves
//   only the other (the model does not stay selected); a sketch picked after a
//   model leaves only the sketch;
// · the scene's Shift+click: added and active; on the active, removed; on a
//   selected one, made active; a click on nothing deselects;
// · the Outliner's Shift range, from the active, in the rows' order;
// · A (everything visible), Alt+A, H / Alt+H / Shift+H, the box;
// · the median point of several objects; a value carried to the others.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as S from "./space-selection"; export * as X from "./transform3d";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { S, X } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const order = ["rm:A", "rm:B", "rm:C", "rm:D", "proxy:U1", "sketch:s1"];
const none = S.EMPTY_SEL;
const plain = { toggle: false, range: false }, cmd = { toggle: true, range: false }, shift = { toggle: false, range: true };

// E.D.'s case
let s = S.clickOutliner(none, "rm:A", plain, order);
eq(s, { keys: ["rm:A"], active: "rm:A" }, "Outliner: a click selects the model, active");
eq(S.clickOutliner(s, "rm:A", plain, order), { keys: ["rm:A"], active: "rm:A" }, "…a click on it again keeps it (Blender)");
eq(S.clickOutliner(s, "rm:A", cmd, order), { keys: [], active: null }, "…⌘/Ctrl+click takes it away");
eq(S.clickOutliner(s, "rm:B", plain, order), { keys: ["rm:B"], active: "rm:B" }, "…a click on another: only the other, the model does not stay");
eq(S.clickOutliner(s, "sketch:s1", plain, order), { keys: ["sketch:s1"], active: "sketch:s1" }, "…a sketch after a model: only the sketch (one selection)");
eq(S.clickScene(s, "sketch:s1", false), { keys: ["sketch:s1"], active: "sketch:s1" }, "…the same in the scene");
s = S.clickOutliner(s, "rm:C", cmd, order);
eq(s, { keys: ["rm:A", "rm:C"], active: "rm:C" }, "⌘-click adds, and the added is active");
eq(S.clickOutliner(s, "rm:C", cmd, order), { keys: ["rm:A"], active: "rm:A" }, "⌘-click on the active takes it away: the last one left is active");
eq(S.clickOutliner({ keys: ["rm:B"], active: "rm:B" }, "rm:D", shift, order), { keys: ["rm:B", "rm:C", "rm:D"], active: "rm:B" }, "Shift: the range from the active, in the rows' order");
eq(S.clickOutliner({ keys: ["rm:D"], active: "rm:D" }, "rm:B", shift, order), { keys: ["rm:B", "rm:C", "rm:D"], active: "rm:D" }, "…upward too");

// the scene, Blender's Shift+click
s = S.clickScene(none, "proxy:U1", false);
eq(s, { keys: ["proxy:U1"], active: "proxy:U1" }, "scene: click = only that one, active");
s = S.clickScene(s, "rm:A", true);
eq(s, { keys: ["proxy:U1", "rm:A"], active: "rm:A" }, "Shift+click on one not selected: added and active");
eq(S.clickScene(s, "proxy:U1", true), { keys: ["proxy:U1", "rm:A"], active: "proxy:U1" }, "Shift+click on a selected not active: made active");
eq(S.clickScene(s, "rm:A", true), { keys: ["proxy:U1"], active: null }, "Shift+click on the active: removed (no active, as Blender)");
eq(S.clickScene(s, null, false), { keys: [], active: null }, "a click on nothing: nothing selected");
eq(S.clickScene(s, null, true), s, "Shift+click on nothing: unchanged");

// keys
eq(S.selectAll({ keys: ["rm:B"], active: "rm:B" }, ["rm:A", "rm:B", "proxy:U1"]), { keys: ["rm:A", "rm:B", "proxy:U1"], active: "rm:B" }, "A: everything visible, the active kept");
eq(S.selectAll(none, ["rm:A", "rm:B"]).active, "rm:B", "A from nothing: the last is active");
eq(S.hideKeys(["rm:Z"], "selected", ["rm:A"], ["rm:A", "rm:B"]), ["rm:Z", "rm:A"], "H hides the selected");
eq(S.hideKeys(["rm:Z"], "unselected", ["rm:A"], ["rm:A", "rm:B"]), ["rm:Z", "rm:B"], "Shift+H hides the unselected");
eq(S.hideKeys(["rm:Z", "rm:A"], "reveal", [], []), [], "Alt+H shows everything");
eq(S.withoutKeys({ keys: ["rm:A", "rm:B"], active: "rm:A" }, (k) => k === "rm:A"), { keys: ["rm:B"], active: null }, "what is hidden leaves the selection");
eq(S.boxSelect({ keys: ["rm:A"], active: "rm:A" }, ["rm:B", "rm:C"], false), { keys: ["rm:B", "rm:C"], active: "rm:C" }, "a box replaces");
eq(S.boxSelect({ keys: ["rm:A"], active: "rm:A" }, ["rm:A", "rm:C"], true), { keys: ["rm:A", "rm:C"], active: "rm:A" }, "Shift + box adds");
eq(S.boxSelect({ keys: ["rm:A"], active: "rm:A" }, [], false), { keys: [], active: null }, "an empty box: nothing");
eq(S.othersCount({ keys: ["rm:A", "rm:B", "rm:C"], active: "rm:C" }), 2, "«+2 selezionati»");

// the pivot and the carry
eq(S.medianPoint([[0, 0, 0], [2, 4, 6], [4, 2, 0]]), [2, 2, 2], "the median point: the mean of the centres (Blender's «median»)");
eq(S.medianPoint([]), null, "no object, no pivot");
const before = { position: [1, 1, 1], rotation: [0, 0, 0.1], scale: [1, 1, 1], up_axis: "Z" };
const after = { position: [3, 1, 0], rotation: [0, 0, 0.3], scale: [2, 1, 1], up_axis: "Z" };
const other = { position: [10, 0, 5], rotation: [0.5, 0, 0], scale: [3, 3, 3], up_axis: "Z" };
const c = X.carryXf(before, after, other);
eq(c.position, [12, 0, 4], "N panel: the other moves by the same amount");
eq(c.rotation.map((v) => Math.round(v * 1e9) / 1e9), [0.5, 0, 0.2], "…turns by the same angle");
eq(c.scale, [6, 3, 3], "…scales by the same ratio");


// MICRO-PROVA-DEV47 p.2 · the click picks the nearest, whatever it is; ⌘ the
// models only; a tie goes sketch, proxy, model; again on the spot, the next
const H = [{ kind: "rm", id: "Tetto", distance: 240.1 }, { kind: "proxy", id: "USV149", distance: 251.6 }, { kind: "rm", id: "Tetto", distance: 240.9 }, { kind: "rm", id: "Col", distance: 260 }];
eq(S.pickUnder(H, { x: 10, y: 10 }, null, false), "rm:Tetto", "a click on the roof: the roof (the model in front), not the proxy behind it");
eq(S.pickUnder(H, { x: 10, y: 10 }, null, true), "rm:Tetto", "⌘: the nearest model");
eq(S.pickUnder([{ kind: "proxy", id: "U1", distance: 5 }], { x: 0, y: 0 }, null, true), null, "⌘ on a proxy alone: nothing");
eq(S.pickUnder(H, { x: 11, y: 12 }, { x: 10, y: 10, key: "rm:Tetto" }, false), "proxy:USV149", "again on the spot: the next one behind");
eq(S.pickUnder(H, { x: 11, y: 12 }, { x: 10, y: 10, key: "proxy:USV149" }, false), "rm:Col", "…and the next");
eq(S.pickUnder(H, { x: 11, y: 12 }, { x: 10, y: 10, key: "rm:Col" }, false), "rm:Tetto", "…and round");
eq(S.pickUnder(H, { x: 40, y: 12 }, { x: 10, y: 10, key: "rm:Tetto" }, false), "rm:Tetto", "elsewhere: the nearest again");
eq(S.pickUnder([{ kind: "rm", id: "M", distance: 10 }, { kind: "proxy", id: "U", distance: 10.004 }, { kind: "sketch", id: "s", distance: 10.008 }], { x: 0, y: 0 }, null, false),
  "sketch:s", "surfaces within 1 cm: sketch, then proxy, then model");
eq(S.pickUnder([], { x: 0, y: 0 }, null, false), null, "nothing under the pointer: nothing");
// MICRO-VIEWER-SPAZIO-EMTREE p.1 · the plain click: the proxy under the pointer, even behind the roof
eq(S.pickUnder(H, { x: 10, y: 10 }, null, "proxy"), "proxy:USV149", "a click: the proxy, not the model in front of it");
eq(S.pickUnder([{ kind: "rm", id: "M", distance: 10 }], { x: 0, y: 0 }, null, "proxy"), null, "a click on a model alone: nothing (Alt + click is the model's)");
eq(S.pickUnder([{ kind: "rm", id: "M", distance: 9 }, { kind: "sketch", id: "s", distance: 10 }], { x: 0, y: 0 }, null, "proxy"), "sketch:s", "…a sketch is a proxy to be");
eq(S.pickUnder([{ kind: "proxy", id: "A", distance: 5 }, { kind: "proxy", id: "B", distance: 6 }], { x: 1, y: 1 }, { x: 0, y: 0, key: "proxy:A" }, "proxy"), "proxy:B", "again on the spot: the next proxy behind");

console.log(`check-space-selection: ${checks} checks, all green`);
