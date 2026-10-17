// MICRO-PANNELLI-LATERALI p.2 · «Associa a un'unità» in the Inspector — the
// pure part (`src/sketch-associate.ts`), in node:
//
//   node scripts/check-sketch-associate.mjs
//
// The three groups (the scene's epoch without a proxy, the other epochs without,
// those with one), the search and the type filter over all three, the types a
// unit is born with from a shape (the datamodel's, US first).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}sketch-associate.ts`], bundle: true, format: "esm", write: false });
const A = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const R = await import("data:text/javascript;base64," + Buffer.from((await esbuild.build({ entryPoints: [`${SRC}rules.ts`], bundle: true, format: "esm", write: false })).outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const units = [
  { id: "US10", name: "US10", type: "US", epochs: ["E2"], hasProxy: false },
  { id: "US2", name: "US2", type: "US", epochs: ["E2"], hasProxy: false },
  { id: "USV101", name: "USV101", type: "USVs", epochs: ["E2"], hasProxy: false, empty: true },
  { id: "US1", name: "US1", type: "US", epochs: ["E1"], hasProxy: false },
  { id: "SF3", name: "SF3", type: "SF", epochs: [], hasProxy: false },
  { id: "US5", name: "US5", type: "US", epochs: ["E1"], hasProxy: true },
  { id: "US4", name: "US4", type: "US", epochs: ["E2"], hasProxy: true },
];
const ids = (g) => g.map((u) => u.id);
let g = A.assocGroups(units, "E2", "", "", A.NEW_UNIT_ORDER);
eq(ids(g.here), ["US2", "US10", "USV101"], "1 · the orphans of the scene's epoch, in the natural order (an empty geometry is one)");
eq(ids(g.elsewhere), ["SF3", "US1"], "2 · without a proxy, the other epochs (and none)");
eq(ids(g.withProxy), ["US4", "US5"], "3 · with a proxy: the scene's epoch first");
eq(g.types, ["US", "USVs", "SF"], "the types present, in the datamodel's order for a new unit");
g = A.assocGroups(units, "E2", "us1", "", A.NEW_UNIT_ORDER);
eq([ids(g.here), ids(g.elsewhere), ids(g.withProxy)], [["US10"], ["US1"], []], "the search over the three groups, any case");
g = A.assocGroups(units, "E2", "", "SF", A.NEW_UNIT_ORDER);
eq([ids(g.here), ids(g.elsewhere), ids(g.withProxy)], [[], ["SF3"], []], "the type filter");
eq(A.assocGroups(units, "E2", "", "SF", A.NEW_UNIT_ORDER).types, ["US", "USVs", "SF"], "…the filter's list does not shrink with it");
g = A.assocGroups(units, null);
eq([ids(g.here).length, ids(g.elsewhere).length], [0, 5], "no epoch in the scene: every orphan is «elsewhere»");
// the types of a new unit, from the datamodel
const strat = R.typesOfClass("StratigraphicNode");
const nu = A.newUnitTypes(strat);
eq(nu[0], "US", "a new unit: US first");
eq(nu.filter((t) => /^ser|^SE$|^BR$|StratigraphicNode|unknown/.test(t)), [], "no series, events, continuity, abstract");
eq(["USVs", "USVn", "USD", "SF"].every((t) => nu.includes(t)), true, "USV/s, USV/n, USD, SF among them");
eq(nu.every((t) => R.isStratigraphicType(t)), true, "every one stratigraphic in the datamodel");
console.log(`check-sketch-associate: ${checks} checks passed (${nu.join(" ")})`);
