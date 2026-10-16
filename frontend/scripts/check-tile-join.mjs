// MICRO-SPAZIO-3D-3 p.8 · windows joined without the pixel — pure (`src/shell/join.ts`):
//
//   node scripts/check-tile-join.mjs
//
// · E.D.'s case: two Matrix one under the other, beside the Space and the
//   Tabular ([Space | Matrix] over [Tabular | Matrix]): not siblings in the tree;
//   with the two rows' dividers apart by 0, 1, 5 and 11 px they join (aligned
//   first), at 13 px «Allinea e unisci» stretches the narrower, the Tabular gives
//   up the band;
// · the tree rebuilt from rectangles draws the same rectangles;
// · two windows that do not touch: refused, «apart»;
// · the divider's magnet.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as J from "./shell/join"; export * as L from "./shell/layout";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { J, L } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const root = { x: 6, y: 6, w: 1588, h: 900 };
const leaf = (id) => ({ kind: "leaf", winId: id });
// the ratio that puts the divider `px` pixels right of where 0.6 puts it
const usable = root.w - L.DIVIDER;
const r0 = 0.6, rAt = (px) => (Math.round(usable * r0) + px) / usable;
const ed = (px) => ({ kind: "split", dir: "col", ratio: 0.55,
  a: { kind: "split", dir: "row", ratio: r0, a: leaf("space"), b: leaf("m1") },
  b: { kind: "split", dir: "row", ratio: rAt(px), a: leaf("tab"), b: leaf("m2") } });

// the tree rebuilt from its own rectangles draws the same rectangles
{
  const t = ed(0);
  const before = L.layoutRects(t, root).areas;
  const back = J.treeFromRects(before, root);
  const after = L.layoutRects(back, root).areas;
  ok([...before].every(([k, r]) => L.sameRect(r, after.get(k))), "treeFromRects: the same rectangles, to the pixel");
}
for (const px of [0, 1, 5, 11]) {
  const plan = J.planJoin(ed(px), root, "m1", "m2");
  ok(plan.kind === "join", `E.D.'s case, the rows' dividers ${px} px apart: joined (${plan.kind})`);
  const areas = L.layoutRects(plan.tree, root).areas;
  ok(!areas.has("m2") && areas.has("m1") && areas.has("tab") && areas.has("space"), `…m2 gone, the other three there (${px} px)`);
  const m1 = areas.get("m1");
  eq([m1.y, m1.y + m1.h], [root.y, root.y + root.h], `…m1 the whole height (${px} px)`);
  ok(plan.aligned === (px !== 0), `…aligned first: ${plan.aligned} (${px} px)`);
  const tab = areas.get("tab"), sp = areas.get("space");
  ok(tab.x + tab.w === sp.x + sp.w, `…the Tabular's right edge follows the Space's (${px} px)`);
}
{
  const plan = J.planJoin(ed(13), root, "m1", "m2");
  ok(plan.kind === "extend", `13 px (past the 12 of the tolerance): «Allinea e unisci» (${plan.kind})`);
  const areas = L.layoutRects(plan.tree, root).areas;
  const m1 = areas.get("m1"), tab = areas.get("tab");
  ok(!areas.has("m2") && m1.h === root.h, "…the two are one, the whole height");
  ok(tab.x + tab.w + L.DIVIDER === m1.x, "…the Tabular gives up the band (its right edge at the joined window)");
}
// siblings, as before
{
  const t = { kind: "split", dir: "col", ratio: 0.5, a: leaf("a"), b: leaf("b") };
  const plan = J.planJoin(t, root, "a", "b");
  ok(plan.kind === "join" && !plan.aligned && L.layoutRects(plan.tree, root).areas.size === 1, "two siblings: joined as before");
}
// not adjacent: three in a row, the first and the last
{
  const t = { kind: "split", dir: "row", ratio: 0.33, a: leaf("a"), b: { kind: "split", dir: "row", ratio: 0.5, a: leaf("b"), b: leaf("c") } };
  eq(J.planJoin(t, root, "a", "c"), { kind: "no", why: "apart" }, "two windows that do not touch: refused, apart");
}
// the magnet
eq(J.snapDivider(503, [500, 700]), 500, "a divider 3 px from another: on it");
eq(J.snapDivider(488, [500]), 500, "…12 px: on it");
eq(J.snapDivider(487, [500]), 487, "…13 px: where the hand left it");
eq(J.SNAP_PX, 12, "the tolerance: 12 px");
console.log(`check-tile-join: ${checks} checks passed`);
