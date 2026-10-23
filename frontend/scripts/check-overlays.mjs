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
  eq(O.OVERLAY_GROUPS.map((g) => g.key), ["rights", "paradata", "time", "checks", "threed", "drawing",
    "s3_guides", "s3_text", "s3_objects", "space3d_decor", "s3_geometry"],
    "the groups, in the menu's order (the MICRO's five, «Drawing»; the Space's as Blender's Viewport Overlays: Guides, Text, Objects, Decorators, Geometry)");
  eq(O.OVERLAY_GROUPS.find((g) => g.key === "rights").items.map((i) => i.key),
    ["author", "author_ai", "license", "embargo", "inherited"], "authorship and rights: the four ornaments and the inherited");
  eq(new Set(O.OVERLAY_KEYS).size, O.OVERLAY_KEYS.length, "every overlay once");
  eq(O.OVERLAY_KEYS.length, 44, "forty-four overlays: twenty-two of the graph, twenty-two of the Space (MICRO-GIZMO-ASSI: three labels, three axes, the navigation gizmo; MICRO-VIEWER-SPAZIO-EMTREE p.4: the statistics; MICRO-GLIFI-OVERLAY-CONTINUITA p.3: the continuity, in Time)");
  eq(O.OVERLAY_GROUPS.find((g) => g.key === "time").items.map((i) => i.key), ["lane_pd_tag", "date_invite", "continuity"], "Time: the epoch's tag, the invitation, the continuity");
  // every overlay is drawn somewhere: the renderers name it (a key nobody draws
  // would be a box that switches nothing)
  // MICRO-SPAZIO-3D · the Space's are gated by the scene (scene3d.ts) and by
  // what the Space hands it (main.ts)
  const drawn = readFileSync(`${SRC}renderer.ts`, "utf8") + readFileSync(`${SRC}liquid-render.ts`, "utf8")
    + readFileSync(`${SRC}scene3d.ts`, "utf8") + readFileSync(`${SRC}main.ts`, "utf8");
  for (const k of O.OVERLAY_KEYS) {
    const named = drawn.includes(`"${k}"`) || (["author", "author_ai", "license", "embargo", "inherited"].includes(k) && drawn.includes("adornmentShown"));
    ok(named, `the renderer gates «${k}»`);
  }
  // the liquid Graph draws two of them, the box views all
  eq(O.overlayItemsFor("graph").map((i) => i.key), ["pd_chip", "genre"], "the liquid Graph: the paradata chip and the genre letter");
  for (const v of ["matrix", "dtc", "multigraph", "soloing"])
    eq(O.overlayItemsFor(v).length, 22, `${v}: every overlay of the graph`);
  eq(O.overlayItemsFor("space").map((i) => i.key), ["s3_grid", "s3_axis_x", "s3_axis_y", "s3_axis_z", "s3_cursor", "s3_navgizmo", "s3_epoch_box", "s3_stats",
    "s3_labels_rm", "s3_labels_proxy", "s3_labels_sketch",
    "s3_proxies", "s3_proxy_wire", "s3_rm", "s3_tiles", "s3_sketches", "s3_sel_outline", "s3_gizmo",
    "s3_dec_rights", "s3_dec_pd", "s3_dec_warning", "s3_dec_epoch"], "the Space: its twenty-two, in their groups, and only them");
  eq(O.OVERLAY_VALUES.map((v) => [v.key, v.def]), [["s3_opacity_proxy", 0.42], ["s3_opacity_wire", 0.9]], "Geometry: two sliders, at the opacities the scene used");
  // every label in en, it, de
  const i18n = readFileSync(`${SRC}i18n.ts`, "utf8");
  for (const k of [...O.OVERLAY_KEYS.map((x) => `ov.item.${x}`), ...O.OVERLAY_GROUPS.map((g) => `ov.group.${g.key}`),
    ...O.OVERLAY_VALUES.map((v) => `ov.value.${v.key}`), "ov.master", "ov.all", "ov.none"])
    eq(i18n.split(`"${k}":`).length - 1, 3, `«${k}» in en, it, de`);
}

// ── the defaults: MICRO-GLIFI-OVERLAY-CONTINUITA p.2 · E.D.'s Matrix panel —
//    everything on but the inherited badges, in every graph view ──────────────
for (const v of O.OVERLAY_VIEWS) {
  const d = O.defaultOverlays(v);
  if (v === "space") {
    // MICRO-SPAZIO-3D · the Space opens as it did: proxies FILLED, the wire a choice
    // MICRO-GIZMO-ASSI · as it was: the axis Z never drawn (Blender: X and Y), the sketches without a label
    eq(d, { master: true, off: ["s3_axis_z", "s3_labels_sketch", "s3_proxy_wire", "s3_stats"] }, "space: default all on but the sketches' labels, the axis Z, the wire and the statistics");
    ok(!O.overlaysHideSomething(d, v), "space: what is off by default hides nothing, no dot");
    ok(O.overlaysHideSomething(O.withOverlay(d, "s3_grid", false), v), "space: the grid off → the dot");
    ok(O.overlaysHideSomething(O.withOverlay(d, "s3_labels_proxy", false), v), "space: the proxies' labels off → the dot");
    ok(O.overlayShown(d, "s3_navgizmo") && O.overlayShown(d, "s3_labels_rm") && O.overlayShown(d, "s3_labels_proxy"), "space: the navigation gizmo and the labels of models and proxies on");
    continue;
  }
  eq(d, { master: true, off: ["inherited"] }, `${v}: default all on but the inherited`);
  ok(!O.overlaysHideSomething(d, v), `${v}: the default hides nothing (no dot)`);
  for (const k of O.OVERLAY_KEYS) ok(O.overlayShown(d, k) === (k !== "inherited"), `${v}: ${k} ${k === "inherited" ? "off" : "shown"} by default`);
}
ok(O.overlayShown(null, "warning"), "no state → drawn (a renderer without overlays)");

// ── one by one: switch each off and on again ─────────────────────────────────
{
  let st = { master: true, off: [] };
  for (const k of O.overlayItemsFor("matrix").map((i) => i.key)) {
    st = O.withOverlay(st, k, false);
    ok(!O.overlayShown(st, k), `${k} off`);
    for (const j of O.OVERLAY_KEYS) if (j !== k) ok(O.overlayShown(st, j), `${k} off leaves ${j} on`);
    // what is off by default is no dot (the inherited, p.2)
    ok(O.overlaysHideSomething(st, "matrix") === (k !== "inherited"), `${k} off → ${k === "inherited" ? "no dot (its default)" : "the dot"}`);
    st = O.withOverlay(st, k, true);
    ok(O.overlayShown(st, k), `${k} on again`);
    ok(!O.overlaysHideSomething(st, "matrix"), `${k} on again → no dot`);
  }
  // the master hides every one and keeps the single choices
  st = O.withOverlay(O.defaultOverlays("matrix"), "lock", false);
  const m = { ...st, master: false };
  for (const k of O.OVERLAY_KEYS) ok(!O.overlayShown(m, k), `master off: ${k} hidden`);
  eq({ ...m, master: true }.off, ["inherited", "lock"], "master on again: the single choice is still there");
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
  eq(st.off, [], "All of the rights (the inherited too)");
  // in the Graph, «None» of the paradata switches only what it draws
  st = O.withGroup(O.defaultOverlays("graph"), "paradata", false, "graph");
  eq(st.off, ["inherited", "pd_chip"], "None of the paradata in the Graph: the chip (the inherited stays off, its default)");
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
  eq(O.loadOverlays(ED, "graph"), { master: true, off: ["inherited"] }, "reload: E.D.'s Graph untouched → default");
  eq(O.loadOverlays(ED, "dtc"), { master: true, off: ["inherited"] }, "reload: E.D.'s DTC untouched → default");
  eq(O.loadOverlays(null, "graph"), { master: true, off: ["genre"] }, "reload: nobody's Graph");
  eq(O.loadOverlays(null, "matrix"), { master: true, off: ["inherited"] }, "another person does not see E.D.'s Matrix");
  eq(O.loadOverlays("0000-0001-5109-3700", "matrix"), { master: true, off: ["inherited"] }, "a third person: the default");
  // p.2 · a choice remembered before the new default stays the person's: all on, inherited included
  O.saveOverlays("0000-0003-0000-0001", "matrix", { master: true, off: ["lock"] });
  eq(O.loadOverlays("0000-0003-0000-0001", "matrix"), { master: true, off: ["lock"] }, "a remembered choice is kept (the inherited stay on for whoever chose so)");
  // only these keys: one entry, never in a document
  eq([...mem.keys()], ["emstudio.overlays"], "one local preference, emstudio.overlays");
  // the default is forgotten, so a later default reaches whoever never touched it
  O.saveOverlays(ED, "matrix", O.defaultOverlays("matrix"));
  ok(!("matrix" in JSON.parse(mem.get("emstudio.overlays"))[ED]), "back to default → the entry goes");
  // a stored key that no longer exists is dropped, a broken store reads as default
  mem.set("emstudio.overlays", JSON.stringify({ "-": { matrix: { master: true, off: ["warning", "gone"] } } }));
  eq(O.loadOverlays(null, "matrix").off, ["warning"], "an unknown key is dropped");
  mem.set("emstudio.overlays", "{not json");
  eq(O.loadOverlays(null, "matrix"), { master: true, off: ["inherited"] }, "a broken store → default");
}

// ── MICRO-GIZMO-ASSI · the Space's labels, three; the memory of before; the sliders ─
{
  mem.clear();
  // a Space remembered before the groups, with the one switch of the labels off
  mem.set("emstudio.overlays", JSON.stringify({ "-": { space: { master: true, off: ["s3_labels", "s3_grid"] } } }));
  eq(O.loadOverlays(null, "space").off, ["s3_grid", "s3_axis_z", "s3_stats", "s3_labels_rm", "s3_labels_proxy", "s3_labels_sketch"],
    "the old «s3_labels» off: the three labels off; the axis Z born off; the grid kept off");
  mem.set("emstudio.overlays", JSON.stringify({ "-": { space: { master: true, off: ["s3_proxy_wire", "s3_grid"] } } }));
  eq(O.loadOverlays(null, "space").off, ["s3_grid", "s3_axis_z", "s3_stats", "s3_labels_sketch", "s3_proxy_wire"],
    "an old state with the labels on: models' and proxies' on, the new ones at their default (off)");
  // the three, one by one
  let st = O.defaultOverlays("space");
  st = O.withOverlay(st, "s3_labels_rm", false);
  ok(!O.overlayShown(st, "s3_labels_rm") && O.overlayShown(st, "s3_labels_proxy"), "the models' labels off, the proxies' on");
  st = O.withOverlay(O.withOverlay(st, "s3_labels_rm", true), "s3_labels_sketch", true);
  ok(O.overlayShown(st, "s3_labels_sketch"), "the sketches' labels on");
  // a state written now is read back as it is (the axis Z on stays on)
  O.saveOverlays(null, "space", O.withOverlay(st, "s3_axis_z", true));
  O = await load();
  eq(O.loadOverlays(null, "space").off, ["s3_stats", "s3_proxy_wire"], "reload: the Z axis and the sketches' labels switched on stay on");
  // MICRO-VIEWER-SPAZIO-EMTREE p.4 · a Space remembered at rev 2: the statistics born off, nothing else touched
  mem.set("emstudio.overlays", JSON.stringify({ "-": { space: { master: true, off: ["s3_grid"], rev: 2 } } }));
  eq(O.loadOverlays(null, "space").off, ["s3_grid", "s3_stats"], "rev 2: the statistics born off; the axis Z and the sketches' labels switched on stay on");
  O.saveOverlays(null, "space", O.withOverlay(O.loadOverlays(null, "space"), "s3_stats", true));
  O = await load();
  eq(O.loadOverlays(null, "space").off, ["s3_grid"], "the statistics switched on stay on (rev 3)");
  // the sliders
  eq(O.overlayValue(O.defaultOverlays("space"), "s3_opacity_proxy"), 0.42, "the proxies' opacity: 0.42 by default");
  const moved = O.withValue(O.defaultOverlays("space"), "s3_opacity_proxy", 0.7);
  eq(O.overlayValue(moved, "s3_opacity_proxy"), 0.7, "moved to 0.7");
  eq(O.overlayValue(O.withValue(moved, "s3_opacity_proxy", 5), "s3_opacity_proxy"), 1, "never past its maximum");
  O.saveOverlays(null, "space", moved);
  O = await load();
  eq(O.overlayValue(O.loadOverlays(null, "space"), "s3_opacity_proxy"), 0.7, "reload: the opacity remembered");
  eq(O.withValue(moved, "s3_opacity_proxy", 0.42), O.defaultOverlays("space"), "back at its default: no value kept");
  ok(!O.overlaysHideSomething(moved, "space"), "an opacity moved hides nothing");
  mem.clear();
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
