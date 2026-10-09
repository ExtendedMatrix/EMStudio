// MICRO-SOVRAPPOSIZIONI · the overlays (badges and decorators drawn over a
// node): the inventory, the state per view and per person, its memory.
//
//   node scripts/check-overlays.mjs
//
// `overlays.ts` is pure (no DOM, no store): bundled with the project's esbuild
// and exercised in node, against a localStorage of the check's own. A «reload»
// is a second copy of the module reading the same storage.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const SRC = new URL("../src/", import.meta.url).pathname;
const load = async () => {
  const bundle = await esbuild.build({ entryPoints: [`${SRC}overlays.ts`], bundle: true, format: "esm", write: false });
  // a query string makes every load a NEW module: a reload of the page
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}#${Math.random()}`);
};
let O = await load();

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// ── the inventory ────────────────────────────────────────────────────────────
{
  eq(O.OVERLAY_GROUPS.map((g) => g.key), ["rights", "paradata", "time", "checks", "threed", "drawing"],
    "the groups, in the menu's order (the MICRO's five and «Drawing»)");
  eq(O.OVERLAY_GROUPS.find((g) => g.key === "rights").items.map((i) => i.key),
    ["author", "author_ai", "license", "embargo", "inherited"], "authorship and rights: the four ornaments and the inherited");
  eq(new Set(O.OVERLAY_KEYS).size, O.OVERLAY_KEYS.length, "every overlay once");
  eq(O.OVERLAY_KEYS.length, 20, "twenty overlays");
  // every overlay is drawn somewhere: the renderers name it (a key nobody draws
  // would be a box that switches nothing)
  const drawn = readFileSync(`${SRC}renderer.ts`, "utf8") + readFileSync(`${SRC}liquid-render.ts`, "utf8");
  for (const k of O.OVERLAY_KEYS) {
    const named = drawn.includes(`"${k}"`) || (["author", "author_ai", "license", "embargo", "inherited"].includes(k) && drawn.includes("adornmentShown"));
    ok(named, `the renderer gates «${k}»`);
  }
  // the liquid Graph draws two of them, the box views all
  eq(O.overlayItemsFor("graph").map((i) => i.key), ["pd_chip", "genre"], "the liquid Graph: the paradata chip and the genre letter");
  for (const v of ["matrix", "dtc", "multigraph", "soloing"])
    eq(O.overlayItemsFor(v).length, 20, `${v}: every overlay`);
  // every label in en, it, de
  const i18n = readFileSync(`${SRC}i18n.ts`, "utf8");
  for (const k of [...O.OVERLAY_KEYS.map((x) => `ov.item.${x}`), ...O.OVERLAY_GROUPS.map((g) => `ov.group.${g.key}`), "ov.master", "ov.all", "ov.none"])
    eq(i18n.split(`"${k}":`).length - 1, 3, `«${k}» in en, it, de`);
}

// ── the defaults: everything on, in every view (nothing changes at opening) ──
for (const v of O.OVERLAY_VIEWS) {
  const d = O.defaultOverlays(v);
  eq(d, { master: true, off: [] }, `${v}: default all on`);
  ok(!O.overlaysHideSomething(d, v), `${v}: the default hides nothing (no dot)`);
  for (const k of O.OVERLAY_KEYS) ok(O.overlayShown(d, k), `${v}: ${k} shown by default`);
}
ok(O.overlayShown(null, "warning"), "no state → drawn (a renderer without overlays)");

// ── one by one: switch each off and on again ─────────────────────────────────
{
  let st = O.defaultOverlays("matrix");
  for (const k of O.OVERLAY_KEYS) {
    st = O.withOverlay(st, k, false);
    ok(!O.overlayShown(st, k), `${k} off`);
    for (const j of O.OVERLAY_KEYS) if (j !== k) ok(O.overlayShown(st, j), `${k} off leaves ${j} on`);
    ok(O.overlaysHideSomething(st, "matrix"), `${k} off → the dot`);
    st = O.withOverlay(st, k, true);
    ok(O.overlayShown(st, k), `${k} on again`);
    ok(!O.overlaysHideSomething(st, "matrix"), `${k} on again → no dot`);
  }
  // the master hides every one and keeps the single choices
  st = O.withOverlay(O.defaultOverlays("matrix"), "lock", false);
  const m = { ...st, master: false };
  for (const k of O.OVERLAY_KEYS) ok(!O.overlayShown(m, k), `master off: ${k} hidden`);
  eq({ ...m, master: true }.off, ["lock"], "master on again: the single choice is still there");
  ok(O.overlaysHideSomething(m, "graph"), "master off → the dot");
  // the dot counts what the view can draw: «lock» off is nothing in the liquid Graph
  ok(!O.overlaysHideSomething(st, "graph"), "lock off: no dot in the Graph, which draws no lock");
  ok(O.overlaysHideSomething(O.withOverlay(st, "genre", false), "graph"), "genre off: the dot in the Graph");
}

// ── All / None per group ─────────────────────────────────────────────────────
{
  let st = O.withGroup(O.defaultOverlays("matrix"), "rights", false);
  eq(st.off, ["author", "author_ai", "license", "embargo", "inherited"], "None of the rights");
  ok(O.overlayShown(st, "pd_chip"), "None of the rights leaves the paradata");
  st = O.withGroup(st, "rights", true);
  eq(st.off, [], "All of the rights");
  // in the Graph, «None» of the paradata switches only what it draws
  st = O.withGroup(O.defaultOverlays("graph"), "paradata", false, "graph");
  eq(st.off, ["pd_chip"], "None of the paradata in the Graph: the chip");
}

// ── the ornament row: kind, and inherited ────────────────────────────────────
{
  const off = (keys) => ({ master: true, off: keys });
  ok(O.adornmentShown(off([]), { kind: "license" }), "a licence badge, all on");
  ok(!O.adornmentShown(off(["license"]), { kind: "license" }), "a licence badge, licence off");
  ok(O.adornmentShown(off(["license"]), { kind: "author" }), "an author badge, licence off");
  ok(!O.adornmentShown(off(["inherited"]), { kind: "author", inherited: true }), "an inherited author, inherited off");
  ok(O.adornmentShown(off(["inherited"]), { kind: "author" }), "an own author, inherited off");
  ok(!O.adornmentShown(off(["author"]), { kind: "author", inherited: true }), "an inherited author, author off");
}

// ── memory: per person, per view; a reload reads it; the default is not written ─
{
  mem.clear();
  const ED = "0000-0002-1825-0097";
  O.saveOverlays(ED, "matrix", { master: true, off: ["author", "license"] });
  O.saveOverlays(ED, "soloing", { master: false, off: [] });
  O.saveOverlays(null, "graph", { master: true, off: ["genre"] });
  O = await load();   // the page reloaded
  eq(O.loadOverlays(ED, "matrix"), { master: true, off: ["author", "license"] }, "reload: E.D.'s Matrix");
  eq(O.loadOverlays(ED, "soloing"), { master: false, off: [] }, "reload: E.D.'s soloing");
  eq(O.loadOverlays(ED, "graph"), { master: true, off: [] }, "reload: E.D.'s Graph untouched → default");
  eq(O.loadOverlays(ED, "dtc"), { master: true, off: [] }, "reload: E.D.'s DTC untouched → default");
  eq(O.loadOverlays(null, "graph"), { master: true, off: ["genre"] }, "reload: nobody's Graph");
  eq(O.loadOverlays(null, "matrix"), { master: true, off: [] }, "another person does not see E.D.'s Matrix");
  eq(O.loadOverlays("0000-0001-5109-3700", "matrix"), { master: true, off: [] }, "a third person: the default");
  // only these keys: one entry, never in a document
  eq([...mem.keys()], ["emstudio.overlays"], "one local preference, emstudio.overlays");
  // the default is forgotten, so a later default reaches whoever never touched it
  O.saveOverlays(ED, "matrix", O.defaultOverlays("matrix"));
  ok(!("matrix" in JSON.parse(mem.get("emstudio.overlays"))[ED]), "back to default → the entry goes");
  // a stored key that no longer exists is dropped, a broken store reads as default
  mem.set("emstudio.overlays", JSON.stringify({ "-": { matrix: { master: true, off: ["warning", "gone"] } } }));
  eq(O.loadOverlays(null, "matrix").off, ["warning"], "an unknown key is dropped");
  mem.set("emstudio.overlays", "{not json");
  eq(O.loadOverlays(null, "matrix"), { master: true, off: [] }, "a broken store → default");
}

// ── the counters the page exposes ────────────────────────────────────────────
{
  O.beginOverlayFrame();
  O.markOverlay("warning"); O.markOverlay("warning"); O.markOverlay("lock");
  eq(O.drawnOverlayCounts(), { warning: 2, lock: 1 }, "what a paint drew");
  O.beginOverlayFrame();
  eq(O.drawnOverlayCounts(), {}, "a new paint starts from zero");
}

console.log(`check-overlays: ${checks} checks OK`);
