// MICRO-OVERLAY-PER-FINESTRA · a window's lens (src/shell/lens.ts): its own
// overlays per view, its Matrix filter, its monochrome — kept in the window's
// state, so copied with it, carried back, remembered with it; never the em.json.
//
//   node scripts/check-lens.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const bundle = await esbuild.build({
  stdin: { contents: `export * as L from "./shell/lens"; export * as O from "./overlays"; export * as D from "./shell/detach";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { L, O, D } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

// nothing of its own: the person's (null)
eq(L.ownOverlays({ mode: "matrix" }, "matrix"), null, "a window that never changed: no overlays of its own");
eq(L.ownLeaves({}, "matrix"), null, "…no filter of its own");
eq(L.ownMono({}), false, "…monochrome off");

// its own, read through the same door as the person's
const off = O.withOverlay(O.defaultOverlays("matrix"), "author", false);
const st = { mode: "matrix", [`current.${L.lensOverlayKey("matrix")}`]: L.storedOverlays(off, "matrix") };
eq(L.ownOverlays(st, "matrix").off.includes("author"), true, "its own overlays: «author» off");
eq(L.ownOverlays(st, "graph"), null, "per view: the Graph's are still the person's");
ok(L.ownOverlays(st, "matrix") === L.ownOverlays(st, "matrix"), "read once per stored object (the paint asks every frame)");
st[`current.${L.lensOverlayKey("matrix")}`] = { master: "yes", off: ["author", "nonsense"] };
eq(L.ownOverlays(st, "matrix"), { master: true, off: ["author"] }, "a broken value made sound, an unknown key dropped");
eq(L.storedOverlays(O.defaultOverlays("space"), "space").rev, O.SPACE_REV, "the Space's stored with the revision of its keys");
const sp = { [`current.${L.lensOverlayKey("space")}`]: L.storedOverlays(O.withOverlay(O.defaultOverlays("space"), "s3_stats", true), "space") };
eq(L.ownOverlays(sp, "space").off.includes("s3_stats"), false, "…so it is not migrated as a pre-revision memory");

// the Matrix's filter; the Graph's stays the view's (one force simulation)
const lv = { [`current.${L.lensLeavesKey("matrix")}`]: ["n:US", "e:is_after"], [`current.${L.lensLeavesKey("graph")}`]: ["n:US"] };
eq([...L.ownLeaves(lv, "matrix")], ["n:US", "e:is_after"], "a Matrix window's own filter");
eq(L.ownLeaves(lv, "graph"), null, "the Graph has none of its own");
eq(L.leavesKey(new Set(["b", "a"])), L.leavesKey(["a", "b"]), "equal sets, one key (one scene)");
eq(L.storedLeaves(new Set(["b", "a"])), ["a", "b"], "stored sorted");
eq(L.ownMono({ [`current.${L.LENS_MONO_KEY}`]: true }), true, "monochrome: the window's");

// copied with the window (Shift + corner, the menu), never shared by reference
const twin = D.cloneState(st);
ok(twin[`current.${L.lensOverlayKey("matrix")}`] !== st[`current.${L.lensOverlayKey("matrix")}`], "the twin's lens is a copy");
eq(L.ownOverlays(twin, "matrix").off, ["author"], "…of the same values");

// the first change pins the others
const wins = [
  { id: "a", type: "graph", state: {} },
  { id: "b", type: "graph", state: { [`current.${L.lensOverlayKey("matrix")}`]: { master: true, off: [] } } },
  { id: "c", type: "graph", state: {} },
  { id: "s", type: "scene", state: {} },
];
eq(L.pinned(wins, "a", L.lensOverlayKey("matrix"), (w) => w.type === "graph").map((w) => w.id), ["c"],
   "changing a: c (no lens of its own) is pinned; b has one; the Space does not draw the Matrix");
ok(!JSON.stringify(st).includes("graph\":{\"nodes"), "nothing of the document in a lens");
console.log(`check-lens: ${checks} checks OK`);
