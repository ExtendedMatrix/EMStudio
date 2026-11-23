// MICRO-PL10-POSA-NELLO-SPAZIO (W7) · executable check of the register of the
// 3D tools and of the pose of a community package's extractors:
//   · the register (src/space-tools.ts): order, replace by id, unregister by
//     origin, the clicks a tool takes (done at max, Enter/double click at min
//     for an open one), the counter, the snap to the nearest vertex;
//   · the pure pose (src/space-pose.ts): a type's geometry with the SPEC's
//     defaults (the twin of ProfileOverlay.extractor_geometry), the tools of an
//     overlay (a volume is not placed from vertices), a pose read back from the
//     graph, the missing points, the next point (the symmetric one right after
//     its pair, then the set's order, «Salta» moving on), the ghost by
//     Procrustes (an exact similarity found from three points, none from
//     points on one line, none before three), «far from the expected»;
//   · MICRO-PX1c: «Dal prospetto» registered and wired like the wall; the
//     proxy's document (two modes) and the annotation at the click on both;
//     the bridge passes the document and declares the semantic shape;
//   · MICRO-PX1: a tool's editors (the Viewer's bar, the Space's toolbar), the
//     Space's core tools of the register, «Muro da pianta» wired (click, Enter,
//     Esc, Backspace, marks, the association's points, the bridge's paradata);
//   · the main.ts wiring: the six tools registered first with their ids, the
//     Viewer's click through the register, the bridge level 79;
//   · the bridge (python, tools/em_pose.py over s3dgraphy.annotation), on the
//     example package of em-profiles installed in /tmp folders: the points with
//     their concepts' labels, the six points placed one by one as deltas, the
//     three combiners at the set complete, a point moved recomputed, a surface,
//     a placement refused before anything is written.
//
//   node scripts/check-space-tools.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const near = (a, b, eps, what) => {
  const d = Array.isArray(a) ? Math.max(...a.map((x, i) => Math.abs(x - b[i]))) : Math.abs(a - b);
  assert.ok(d <= eps, `${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); checks++;
};

// ── the register ────────────────────────────────────────────────────────────
const T = await load("space-tools.ts");
const tool = (id, extra = {}) => ({ id, primitive: "point", clicks: { min: 1, max: 1 }, snap: "surface", glyph: "·", origin: "core", label: () => id, ...extra });
let changes = 0;
T.onSpaceToolsChange(() => changes++);
T.registerSpaceTool(tool("a"));
T.registerSpaceTool(tool("b"));
const offC = T.registerSpaceTool(tool("pkg:c", { origin: "esempio" }));
eq(T.spaceTools().map((t) => t.id), ["a", "b", "pkg:c"], "the register in the order of registration");
T.registerSpaceTool(tool("b", { glyph: "B" }));
eq(T.spaceTools().map((t) => [t.id, t.glyph]), [["a", "·"], ["b", "B"], ["pkg:c", "·"]], "registering an id again replaces it in its place");
offC();
eq(T.spaceTools().map((t) => t.id), ["a", "b"], "the answer of registerSpaceTool takes the tool away");
T.registerSpaceTool(tool("pkg:d", { origin: "esempio" }));
T.registerSpaceTool(tool("lms:e", { origin: "esempio" }));
T.unregisterOrigin((o) => o !== "core");
eq(T.spaceTools().map((t) => t.id), ["a", "b"], "a package's tools go together (the overlay changed)");
ok(changes >= 6, "every change is told");
eq(T.spaceTool("a")?.id, "a", "a tool by id");
eq(T.spaceTool("zz"), null, "an unknown id: none");
const two = { clicks: { min: 2, max: 2 } }, open = { clicks: { min: 2, max: null } }, range = { clicks: { min: 3, max: 5 } };
eq([T.clickVerdict(two, 1), T.clickVerdict(two, 2)], ["more", "done"], "a line: done at its second click");
eq([T.clickVerdict(open, 9), T.canClose(open, 1), T.canClose(open, 2), T.canClose(two, 2)], ["more", false, true, false],
   "an open tool closes with Enter / a double click once it has its least; a fixed one never by Enter");
eq([T.clickCount(two, 1, () => ""), T.clickCount(range, 2, () => ""), T.clickCount(open, 1, () => ""), T.clickCount(open, 4, (n) => `${n} vertici`)],
   ["1/2", "2/3–5", "1/2+", "4 vertici"], "the bar's counter");
eq(T.snapped({ snap: "vertex" }, { point: [1, 2, 3], vertex: [1, 2, 4] }), [1, 2, 4], "snap vertex: the mesh's nearest vertex");
eq(T.snapped({ snap: "vertex" }, { point: [1, 2, 3], vertex: null }), [1, 2, 3], "…the point hit when the scene has no vertex to give");
eq(T.snapped({ snap: "surface" }, { point: [1, 2, 3], vertex: [9, 9, 9] }), [1, 2, 3], "snap surface: the point hit");

// MICRO-PX1 · the editors of a tool: the Viewer's bar by default, the Space's toolbar when it says so
eq([T.inEditor(tool("v"), "viewer"), T.inEditor(tool("v"), "space")], [true, false], "a tool without editors: the Viewer's, as before");
T.registerSpaceTool(tool("wallx", { editors: ["space"] }));
T.registerSpaceTool(tool("pkg:z", { origin: "esempio", editors: ["space"] }));
eq([T.inEditor(T.spaceTool("wallx"), "viewer"), T.inEditor(T.spaceTool("wallx"), "space")], [false, true], "a tool of the Space only");
eq(T.spaceCoreTools().map((t) => t.id), ["wallx"], "the Space's core tools of the register: origin core and editor space (a package's are not core)");
T.unregisterSpaceTool("wallx"); T.unregisterSpaceTool("pkg:z");
eq(T.spaceCoreTools(), [], "…gone with the tool");

// ── the pure pose ───────────────────────────────────────────────────────────
const P = await load("space-pose.ts");
eq(P.geometryOf({ geometry: { primitive: "point", produces: "position" } }),
   { primitive: "point", produces: "position", unit: "m", snap: "surface", frame: "model", vertices: { min: 1, max: 1 } },
   "a point type with the SPEC's defaults");
eq(P.geometryOf({ geometry: { primitive: "line" } }).vertices, { min: 2, max: 2 }, "a line: exactly two");
eq(P.geometryOf({ geometry: { primitive: "polyline", vertices: { min: 4 } } }).vertices, { min: 4, max: null }, "a polyline: its min, open");
eq([P.geometryOf({ geometry: { primitive: "surface" } }).unit, P.geometryOf({ geometry: { primitive: "surface" } }).vertices.min], ["m2", 3],
   "a surface: m2, three vertices at least");
eq(P.geometryOf({ geometry: { primitive: "point", snap: "vertex", frame: "graph" } }).snap, "vertex", "a snap declared is kept");
eq(P.geometryOf({}), null, "a type without geometry (the core's): no tool");
const IRI = "https://w3id.org/extendedmatrix/profile/esempio-statuaria";
const ov = {
  profiles: [{ name: "esempio-statuaria", prefix: "stat", iri: IRI }],
  extractor_types: {
    "stat:punto_canonico": { id: "stat:punto_canonico", label: { it: "Punto canonico", en: "Canonical point" }, geometry: { primitive: "point", produces: "position" }, profile: IRI },
    "stat:superficie_integrata": { id: "stat:superficie_integrata", label: { it: "Superficie di integrazione" }, geometry: { primitive: "surface", produces: "area", unit: "m2" }, profile: IRI },
    "stat:massa": { id: "stat:massa", label: "Massa", geometry: { primitive: "volume" } },
    "stat:nulla": { id: "stat:nulla", label: "Nessuna geometria" },
  },
  landmark_sets: { "stat:volto": { id: "stat:volto", extractor_type: "stat:punto_canonico", label: { it: "Punti canonici del volto", en: "Canonical points of the face" }, profile: IRI } },
};
const pt = P.packageToolsOf(ov, "it");
eq(pt.map((x) => [x.id, x.kind, x.label, x.origin, x.unplaceable ?? null]), [
  ["pkg:stat:punto_canonico", "extractor", "Punto canonico", "esempio-statuaria", null],
  ["pkg:stat:superficie_integrata", "extractor", "Superficie di integrazione", "esempio-statuaria", null],
  ["pkg:stat:massa", "extractor", "Massa", "esempio-statuaria", "volume"],
  ["lms:stat:volto", "landmarks", "Punti canonici del volto", "esempio-statuaria", null],
], "the overlay's tools: each type with a geometry, the volume marked unplaceable, the landmark set");
eq(P.packageToolsOf(ov, "en").at(-1).label, "Canonical points of the face", "the set's label in English");
eq(P.packageToolsOf(null, "it"), [], "no overlay: no package tool");

const points = [
  { id: "glabella", label: "glabella", required: true, ref: [0, 0.12, 0.03] },
  { id: "nasion", label: "nasion", required: true, ref: [0, 0, 0] },
  { id: "exocanthion_r", label: "esocantion", side: "right", mirror: "exocanthion_l", required: true, ref: [-0.42, -0.08, -0.12] },
  { id: "exocanthion_l", label: "esocantion", side: "left", mirror: "exocanthion_r", required: true, ref: [0.42, -0.08, -0.12] },
  { id: "pronasale", label: "pronasale", required: false, ref: [0, -0.38, 0.22] },
  { id: "gnathion", label: "gnathion", required: true, ref: [0, -1, 0.02] },
];
eq(P.pointLabel(points[2], (s) => ({ right: "destro", left: "sinistro" })[s]), "esocantion (destro)", "the label with the side");
eq(P.pointLabel(points[1], () => "?"), "nasion", "…none without a side");
const M = (ids) => new Map(ids.map((i) => [i, {}]));
eq(P.nextPoint(points, M([])), "glabella", "the first point of the set");
eq(P.nextPoint(points, M(["glabella", "nasion", "exocanthion_l"]), "exocanthion_l"), "exocanthion_r", "after one of a pair: its symmetric one");
eq(P.nextPoint(points, M(["glabella", "nasion", "exocanthion_r", "exocanthion_l"]), "exocanthion_l"), "pronasale", "the pair complete: the set's order");
eq(P.nextPoint(points, M(["glabella", "nasion"]), null, "exocanthion_r"), "exocanthion_l", "«Salta»: the next one after the skipped");
eq(P.nextPoint(points, M(["glabella", "nasion", "exocanthion_r", "exocanthion_l", "gnathion"]), null, "pronasale"), "pronasale",
   "skipping the only one missing: it stays");
eq(P.nextPoint(points, M(points.map((p) => p.id))), null, "every point placed: none");
eq(P.missingOf(points, M(["glabella", "nasion"])), { required: ["exocanthion_r", "exocanthion_l", "gnathion"], optional: ["pronasale"] },
   "what is missing, required apart");

// a known similarity: the reference rotated 40° about y, scaled to a 10 cm face, moved
const ang = 0.7, sc = 0.1, tr = [0.3, 1.2, -0.4];
const R = [[Math.cos(ang), 0, Math.sin(ang)], [0, 1, 0], [-Math.sin(ang), 0, Math.cos(ang)]];
const onModel = (p) => R.map((r) => sc * (r[0] * p[0] + r[1] * p[1] + r[2] * p[2])).map((v, i) => v + tr[i]);
const f3 = P.similarityFit(points.slice(0, 3).map((p) => p.ref), points.slice(0, 3).map((p) => onModel(p.ref)));
near(f3.s, sc, 1e-9, "Procrustes from three points: the scale");
near(f3.rms, 0, 1e-9, "…an exact fit");
near(P.applySimilarity(f3, points[5].ref), onModel(points[5].ref), 1e-9, "…the gnathion carried where it is");
const tilt = 2.1, Rx = [[1, 0, 0], [0, Math.cos(tilt), -Math.sin(tilt)], [0, Math.sin(tilt), Math.cos(tilt)]];
const onModel2 = (p) => Rx.map((r) => 3 * (r[0] * p[0] + r[1] * p[1] + r[2] * p[2]) - 1);
const f6 = P.similarityFit(points.map((p) => p.ref), points.map((p) => onModel2(p.ref)));
near([f6.s, f6.rms], [3, 0], 1e-9, "a rotation past 90° about x and a scale of 3, from six points");
eq(P.similarityFit([[0, 0, 0], [1, 0, 0], [2, 0, 0]], [[0, 0, 0], [1, 0, 0], [2, 0, 0]]), null, "reference points on one line: no fit");
eq(P.similarityFit([[0, 0, 0], [1, 0, 0]], [[0, 0, 0], [1, 0, 0]]), null, "two points: no fit");
const noisy = points.map((p, i) => onModel(p.ref).map((v, k) => v + (((i * 3 + k) % 5) - 2) * 0.0004));
const fn = P.similarityFit(points.map((p) => p.ref), noisy);
ok(fn.rms > 0 && fn.rms < 0.001 && Math.abs(fn.s - sc) < 0.002, "with a hand's noise: a small residual, the scale near");

const placed = (ids, at = onModel) => new Map(ids.map((i) => [i, { extractorId: `x-${i}`, regionId: null, position: at(points.find((p) => p.id === i).ref) }]));
eq(P.ghostsOf(points, placed(["glabella", "nasion"])), [], "no ghost before three points");
const g3 = P.ghostsOf(points, placed(["glabella", "nasion", "exocanthion_r"]));
eq(g3.map((g) => g.id), ["exocanthion_l", "pronasale", "gnathion"], "after three: a ghost for each point not placed");
near(g3[2].position, onModel(points[5].ref), 1e-9, "…where it is expected");
const pl4 = placed(["glabella", "nasion", "exocanthion_r"]);
const atRight = onModel(points[3].ref);
const ff = P.farFromExpected(points, pl4, "exocanthion_l", atRight);
ok(ff && !ff.far && ff.distance < 1e-9, "a point placed where expected: not far");
const wrong = onModel([0.42, -0.6, -0.12]);
const fw = P.farFromExpected(points, pl4, "exocanthion_l", wrong);
ok(fw.far && Math.abs(fw.distance - 0.052) < 1e-6, "a point 5 cm off on a 10 cm face: far (said, never refused)");
eq(P.farFromExpected(points, placed(["glabella", "nasion"]), "gnathion", [0, 0, 0]), null, "fewer than three others: nothing to say");

// a pose read back from the graph
const graph = {
  nodes: [
    { id: "pose", node_type: "combiner", data: { landmark_pose: { set: "stat:volto", on: "d1", subject: "us1" } } },
    { id: "pose2", node_type: "combiner", data: { landmark_pose: { set: "stat:volto", on: "d1" } } },
    { id: "x1", node_type: "extractor", data: { landmark: { set: "stat:volto", point: "nasion" } } },
    { id: "r1", node_type: "annotation_region", data: { geometry_kind: "point", coords: [[0, 1, 0]] } },
    { id: "x2", node_type: "extractor", data: { landmark: { set: "stat:volto", point: "glabella" } } },
    { id: "x3", node_type: "extractor", data: { landmark: { set: "altro:insieme", point: "glabella" } } },
  ],
  edges: [
    { source: "pose", target: "x1", edge_type: "combines" }, { source: "x1", target: "r1", edge_type: "extracted_from" },
    { source: "pose", target: "x2", edge_type: "combines" }, { source: "pose", target: "x3", edge_type: "combines" },
  ],
};
const st = P.poseStateOf(graph, "stat:volto", "d1", "us1");
eq([st.poseId, [...st.placed.keys()], st.placed.get("nasion").position, st.placed.get("glabella").position],
   ["pose", ["nasion", "glabella"], [0, 1, 0], null], "a pose read back: its points, each one's position (none without a region)");
eq(P.poseStateOf(graph, "stat:volto", "d1", null).poseId, "pose2", "the pose of no unit is another act");
eq(P.poseStateOf(graph, "stat:volto", "d2", "us1"), { poseId: null, placed: new Map() }, "another model: no pose yet");
eq(P.posesOn(graph, "stat:volto", "d1"), ["us1", null], "the poses of a set on a model, by unit");

// ── the wiring in main.ts ───────────────────────────────────────────────────
const main = fs.readFileSync(path.join(SRC, "main.ts"), "utf8");
const read = (f) => fs.readFileSync(path.join(SRC, f), "utf8");
const scene = read("scene3d.ts");
ok(/for \(const tool of VIEWER_3D_TOOLS\)\s*\n?\s*registerSpaceTool\(/.test(main), "the six tools of the Viewer registered first, from VIEWER_3D_TOOLS");
ok(/spaceTools\(\)/.test(main) && !/for \(const tool of VIEWER_3D_TOOLS\) \{\s*const on = s\.trace\.tool === tool/.test(main), "the bar draws the register, not the constant");
ok(/const need = CLICKS\[tool\]/.test(main) === false, "the clicks come from the register");
ok(/BRIDGE_LEVEL_WANTED = (79|[89]\d)/.test(main), "the page wants the bridge of level 79 or later");
// MICRO-PX1 · «Muro da pianta»: a core tool of the Space's toolbar, not of the Viewer's bar
ok(/registerSpaceTool\(\{ id: "wall", primitive: "polyline", origin: "core", snap: "surface"[\s\S]{0,120}editors: \["space"\]/.test(main),
   "«Muro da pianta» registered: core, snap surface, the Space's only");
ok(/for \(const spec of spaceTools\(\)\) \{\s*if \(!inEditor\(spec, "viewer"\)\) continue;/.test(main), "the Viewer's bar skips the Space's tools");
ok(/registered: registeredSpaceCoreTools\(\)\.map/.test(main), "the Space's toolbar draws the register's core tools after Select and 3D cursor");
ok(/if \(spaceCoreTools\.get\(win\.id\) === WALL_TOOL\) return wallClick\(win, hit, dbl\);/.test(main), "a click with the wall armed is the wall's (a double click closes the phase)");
ok(/if \(a === "confirm"\) \{ wallClose\(win\); return true; \}/.test(main) && /a === "cancel" && wallCancel\(win\)/.test(main)
   && /a === "delete" && wallUndoPoint\(win\)/.test(main), "Enter closes the phase, Esc cancels it, Backspace takes the last point back");
ok(/\.\.\.wallMarks\(win\.id\), \.\.\.elevMarks\(win\.id\), \.\.\.boxMarks\(win\.id\), \.\.\.surfMarks\(win\.id\)\]/.test(main), "the trace drawn as the Space's marks (the wall's, the elevation's, the box's, the areal's)");
ok(/points: wallItem\.points, purpose: wallItem\.purpose/.test(main) && /const purpose = wall \? "wall_from_plan" : box7 \? "proxy_box_creator" : surf \? "3D drawing on surface" : "from_elevation";/.test(main),
   "the association sends the points (the extractors) with purpose wall_from_plan / from_elevation / proxy_box_creator (EM Tools')");
// MICRO-PX1c · «Dal prospetto», the proxy's document, the annotation at the click
ok(/registerSpaceTool\(\{ id: "fromElevation", primitive: "polyline", origin: "core", snap: "surface"[\s\S]{0,120}editors: \["space"\]/.test(main),
   "«Dal prospetto» registered: core, snap surface, the Space's only");
ok(/if \(spaceCoreTools\.get\(win\.id\) === ELEV_TOOL\) return elevClick\(win, hit, dbl\);/.test(main), "a click with «Dal prospetto» armed is its");
ok(/if \(a === "confirm"\) \{ elevClose\(win\); return true; \}/.test(main) && /a === "cancel" && elevCancel\(win\)/.test(main)
   && /a === "delete" && elevUndoPoint\(win\)/.test(main), "«Dal prospetto»: Enter closes the phase, Esc cancels it, Backspace takes the last point back");
ok(/toolRing: \(\) => \(spaceCoreTools\.get\(win\.id\) === ELEV_TOOL && pxPrefs\(\)\.edgeSnap \? 10 : 0\)/.test(main), "the ring of rays only for «Dal prospetto» with the edge snap on");
ok(/const wallItem = proxyParadataItem\(sk\);/.test(main), "ONE road to the chain for the wall and the elevation (proxyParadataItem)");
ok(/document_id: wallItem\.documentId/.test(main) && /semantic: true,/.test(main), "the association sends the proxy's document, or the semantic shape");
ok(/description: w\.note/.test(main), "a point's annotation travels as its extractor's description");
ok(/renderPxSourceRows\(box, \[\.\.\.tr\.plan, \.\.\.tr\.top\]/.test(main) && /renderPxSourceRows\(box, tr\.front/.test(main),
   "the two modes of the proxy's document in the Tool tab of BOTH tools");
// MICRO-PX2 · «Scatola a sette punti»: EM Tools' Proxy Box in the Space, the suite's pieces shared
ok(/registerSpaceTool\(\{ id: "box7", primitive: "point", origin: "core", snap: "surface"[\s\S]{0,80}clicks: \{ min: 7, max: 7 \}, editors: \["space"\]/.test(main),
   "«Scatola a sette punti» registered: core, snap surface, seven clicks, the Space's only");
ok(/\/\/ MICRO-PX1c · «Dal prospetto»[^\n]*\nregisterSpaceTool\(\{ id: "fromElevation"[\s\S]{0,300}\n\/\/ MICRO-PX2[^\n]*\nregisterSpaceTool\(\{ id: "box7"/.test(main), "…beside «Muro da pianta» and «Dal prospetto»");
ok(/if \(spaceCoreTools\.get\(win\.id\) === BOX_TOOL\) return boxClick\(win, hit, dbl\);/.test(main), "a click with the box armed records the point the bar names");
ok(/a === "cancel" && boxCancel\(win\)/.test(main) && /a === "delete" && boxUndoPoint\(win\)/.test(main) && /if \(!boxRedo\.has\(win\.id\)\) boxFinish\(win\)/.test(main),
   "the box: Enter makes it, Esc clears, Backspace takes the last point back");
ok(/type: BOX_POINT_TYPES\[BOX_ROLES\[k\]\]/.test(main), "the box's extractors: EM Tools' point_type («Alignment Start»…)");
ok(/renderPxSourceRows\(box, tr\.points\.filter/.test(main), "the two modes of the proxy's document and the switch in the box's Tool tab (the shared rows)");
ok((main.match(/bar\.appendChild\(pxBarWhere\(/g) ?? []).length === 4, "ONE line of the document in the bar for the four tools (pxBarWhere)");
ok(/pxAskNote\(hit\.screen, pxNoteLabel\(w, boxRoleName\(k\)\)/.test(main), "the annotation at the click, named by the point's role");
ok(/\.\.\.boxHandles\(win\.id\), \.\.\.surfHandles\(win\.id\)\]/.test(main) && /!boxOnHandle\(win, e\)/.test(main), "the box's seven points are handles");
// MICRO-PX3 · «Annota superficie»
ok(/registerSpaceTool\(\{ id: "surface", primitive: "surface", origin: "core", snap: "surface"[\s\S]{0,80}clicks: \{ min: 3, max: null \}, editors: \["space"\]/.test(main),
   "«Annota superficie» registered: core, snap surface, three clicks at least, the Space's only");
ok(/\/\/ MICRO-PX2[^\n]*\nregisterSpaceTool\(\{ id: "box7"[\s\S]{0,300}\n\/\/ MICRO-PX3[^\n]*\nregisterSpaceTool\(\{ id: "surface"/.test(main), "…after «Scatola a sette punti»");
ok(/if \(spaceCoreTools\.get\(win\.id\) === SURF_TOOL\) return surfClick\(win, hit, dbl\);/.test(main), "a click with the areal armed is a point of its contour (a double click closes it)");
ok(/a === "confirm"\) \{ void surfFinish\(win\); return true; \}/.test(main) && /a === "cancel" && surfCancel\(win\)/.test(main) && /a === "delete" && surfUndoPoint\(win\)/.test(main),
   "the areal: Enter closes and cuts, Esc clears, Backspace takes the last point back");
ok(/hoverPlane: \(\) => surfHoverPlane\(win\.id\)/.test(main) && /hoverPlane\?: \(\) => \{ o: V3; n: V3 \} \| null;/.test(scene), "the elastic side on the contour's plane (not the horizontal one)");
ok(/drapePath\(points, closed, c\.tris, surfaceFrame\(points, normals\)\)/.test(main), "the contour drawn DRAPED on the model while clicking");
ok(/const models = surfaceModels\(points\);[\s\S]{0,200}models\.length > 1\) return \{ why: t\("surf\.twoRms"/.test(main), "a contour on two models refused (refine in Blender)");
ok(/const first = h\.focusTiles\?\.\(rmKey, box\) \?\? null;/.test(main) && /focus\(box: any \| null\): void;/.test(read("tiles3d.ts")), "on a tileset the leaves under the contour forced and waited for before the cut");
ok(/renderPxSourceRows\(box, tr\.points, prefs\.annotate/.test(main), "the two modes of the proxy's document and the switch in the areal's Tool tab (the shared rows)");
ok(/out\.reading = \{ point_type: "surface",[\s\S]{0,700}geometry: \{ geometry_kind: "surface", vertices: surf\.contour/.test(main), "ONE extractor of the whole surface, its place the contour (EM Tools' chain, read by empkg.areale_from_graph)");
ok(/document_reading: wallItem\.reading/.test(main) && /kw\["document_reading"\] = item\["document_reading"\]/.test(read("../../tools/em_bridge.py")), "the reading travels to s3Dgraphy through /geometry-proxies");
ok(/export const DRAWN_SHAPES = \["wall", "elevation", "box", "surface"\] as const;/.test(read("shapes3d.ts")), "the areal is a drawn shape of the suite (one road to add, update, undo)");
ok(/if \(sk\.shape === "box"\) renderBoxInputs\(sect, sk, win\);/.test(main), "the Item tab lists the seven points");
ok(/addDrawnSketch\("box", input, r\.mesh\.origin/.test(main), "the box is a sketch that keeps its seven points (the shared road of the drawn shapes)");
const bridge = fs.readFileSync(path.join(SRC, "../../tools/em_bridge.py"), "utf8");
ok(/BRIDGE_LEVEL = (79|[89]\d)/.test(bridge) && /route\.startswith\("\/pose\/"\)/.test(bridge), "the bridge: level 79 or later, /pose/* routed");
ok(/api\.proxy_from_points\(graph, uid, list\(points or \[\]\)/.test(bridge) && /"paradata": paradata/.test(bridge)
   && /_ps\.declare\(graph, uid, "to_refine"/.test(bridge) && /"document_id": str\(doc_id\)/.test(bridge),
   "the bridge's /geometry-proxies writes the points' paradata with s3Dgraphy's proxy_from_points and says it");

// ── the bridge's /pose/* over s3dgraphy.annotation, on em-profiles' example ──
const S3D = process.env.S3D ?? path.resolve(SRC, "../../../s3Dgraphy");
const PROFILES = process.env.EM_PROFILES ?? path.resolve(SRC, "../../../em-profiles");
const py = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(py) && fs.existsSync(path.join(PROFILES, "examples/esempio-statuaria"))) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pose-"));
  const code = `
import json, sys, os
sys.path.insert(0, sys.argv[2])
import em_pose, em_bridge, em_extensions
EX = sys.argv[3]
M, C = em_bridge._emjson_maps, em_bridge._node_field_changes
out = {}
s, r = em_extensions.post("/extensions/install", {"path": os.path.join(EX, "esempio-statuaria"), "parts": "all"})
out["install"] = [s, r["ok"]]
s, r = em_pose.post("/pose/points", {"declared": [], "set": "stat:volto", "lang": "it"}, M, C)
out["points"] = [s, [(p["id"], p["label"], p["side"], p["mirror"], p["required"]) for p in r["points"]], r["set"]["label"], r["set"]["geometry"]["primitive"]]
s, r = em_pose.post("/pose/points", {"declared": [], "set": "stat:volto", "lang": "en"}, M, C)
out["points_en"] = [p["label"] for p in r["points"]][:3]
s, r = em_pose.post("/pose/points", {"declared": [], "set": "nessuno:insieme", "lang": "it"}, M, C)
out["points_bad"] = [s, r["ok"]]
doc = {"header": {"format": "em.json", "version": "1.1", "schema_version": 2},
       "graphs": {"g": {"graph_id": "g", "name": "g", "nodes": [
           {"id": "us1", "node_type": "US", "name": "US1"}, {"id": "d1", "node_type": "document", "name": "D.01"}], "edges": []}},
       "active_graph_id": "g"}
def apply(delta):
    g = doc["graphs"]["g"]
    g["nodes"] += delta["add_nodes"]
    for f in delta["set_fields"]:
        n = next(x for x in g["nodes"] if x["id"] == f["node"])
        if f["field"].startswith("data."): n.setdefault("data", {})[f["field"][5:]] = f["value"]
        else: n[f["field"]] = f["value"]
    rm = {e["id"] for e in delta["remove_edges"]}
    g["edges"] = [e for e in g["edges"] + delta["add_edges"] if e["id"] not in rm]
pos = {"glabella": [0, 1.12, 0.03], "nasion": [0, 1.0, 0], "exocanthion_r": [-0.042, 0.992, -0.012],
       "exocanthion_l": [0.042, 0.992, -0.012], "gnathion": [0, 0.9, 0.002]}
steps = []
for i, (pid, p) in enumerate(pos.items()):
    s, r = em_pose.post("/pose/landmark", {"doc": doc, "declared": [], "set": "stat:volto", "point": pid, "on": "d1", "subject": "us1",
        "position": p, "label": pid, "lang": "it", "name": "D.01.%02d" % (i + 1), "pose_name": "Punti canonici del volto", "compute": True}, M, C)
    apply(r["delta"])
    res = r["result"]
    steps.append([s, res["status"]["complete"], res["status"]["next"],
                  [(c["combiner_type"], round(c["value"], 4)) for c in (res.get("computed") or {}).get("computed", [])]])
out["steps"] = steps
g = doc["graphs"]["g"]
out["names"] = sorted(n["name"] for n in g["nodes"] if n["node_type"] == "extractor")
out["landmark"] = next(n["data"]["landmark"] for n in g["nodes"] if n.get("name") == "D.01.03")
out["combiner_names"] = sorted(n["name"] for n in g["nodes"] if n["node_type"] == "combiner")
out["pose"] = [n["data"]["landmark_pose"] for n in g["nodes"] if n["node_type"] == "combiner" and "landmark_pose" in (n.get("data") or {})]
# the gnathion moved: placed again, the same extractor, the values recomputed
s, r = em_pose.post("/pose/landmark", {"doc": doc, "declared": [], "set": "stat:volto", "point": "gnathion", "on": "d1", "subject": "us1",
    "position": [0, 0.88, 0.002], "label": "gnathion", "lang": "it", "name": "D.01.99", "compute": True}, M, C)
apply(r["delta"])
pl = r["result"]["placed"]
kind = {n["id"]: (n.get("data") or {}).get("em_kind") for n in g["nodes"]}
out["moved"] = [s, len(r["delta"]["add_nodes"]), [kind[c["combiner_id"]] for c in pl["recomputed"]],
                next(n["name"] for n in g["nodes"] if n["id"] == pl["extractor_id"]),
                round(next(n for n in g["nodes"] if n.get("name") == "stat:altezza_facciale")["data"]["measure"]["value_number"], 4)]
s, r = em_pose.post("/pose/extractor", {"doc": doc, "declared": [], "type": "stat:superficie_integrata", "on": "d1",
    "vertices": [[0, 0, 0], [1, 0, 0], [1, 0, -1]], "name": "D.01.07"}, M, C)
out["surface"] = [s, r["result"]["measure"]["value"], r["result"]["geometry_kind"], r["result"]["em_kind"],
                  [n["name"] for n in r["delta"]["add_nodes"] if n["node_type"] == "extractor"]]
s, r = em_pose.post("/pose/extractor", {"doc": doc, "declared": [], "type": "stat:superficie_integrata", "on": "d1",
    "vertices": [[0, 0, 0], [1, 0, 0]]}, M, C)
out["refused"] = [s, r["ok"], r.get("code"), r["error"]]
s, r = em_pose.post("/pose/compute", {"doc": doc, "declared": [], "on": "d1", "subject": "us1"}, M, C)
out["compute"] = [s, len(r["result"]["computed"]), len(r["delta"]["add_nodes"])]
print(json.dumps(out))`;
  const env = { ...process.env, PYTHONPATH: path.join(S3D, "src"),
    S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"), S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"),
    S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"), EM_VOCABULARIES_DIR: path.join(dir, "vocab") };
  const out = JSON.parse(execFileSync(py, ["-c", code, dir, path.resolve(SRC, "../../tools"), path.join(PROFILES, "examples")], { env }).toString());
  eq(out.install, [200, true], "the example package installed in a /tmp folder");
  eq(out.points[0], 200, "/pose/points");
  eq(out.points[1].map((p) => p[1]), ["glabella", "nasion", "esocantion", "esocantion", "pronasale", "gnathion"],
     "…each point with its concept's label in Italian (the vocabulary installed with the package)");
  eq(out.points[1][2], ["exocanthion_r", "esocantion", "right", "exocanthion_l", true], "…its side and its pair");
  eq([out.points[2], out.points[3]], ["Punti canonici del volto", "point"], "…the set's label, its type's primitive");
  eq(out.points_en, ["glabella", "nasion", "exocanthion"], "…in English");
  eq(out.points_bad, [400, false], "an unknown set: refused");
  eq(out.steps.map((x) => x[0]), [200, 200, 200, 200, 200], "five points placed, each a delta");
  eq(out.steps.map((x) => x[1]), [false, false, false, false, true], "complete at the gnathion (the pronasale is optional)");
  eq(out.steps[4][3], [["stat:c_larghezza_biorbitale", 0.084], ["stat:c_altezza_facciale", 0.1], ["stat:c_indice_facciale", 1.1907]],
     "at the set complete: the three combiners, the ratio after the distances");
  eq(out.steps.slice(0, 4).map((x) => x[3]), [[], [], [], []], "nothing computed before the set is complete");
  eq(out.names, ["D.01.01", "D.01.02", "D.01.03", "D.01.04", "D.01.05"], "the extractors named as EMStudio names a document's");
  eq(out.landmark, { set: "stat:volto", point: "exocanthion_r", concept: "https://w3id.org/extendedmatrix/profile/esempio-statuaria/vocab/punti-volto/exocanthion", label: "exocanthion_r", lang: "it", side: "right" },
     "data.landmark: set, point, concept, the label seen, its language, the side");
  eq(out.pose, [{ set: "stat:volto", on: "d1", subject: "us1" }], "one act of placing, for the unit");
  eq(out.combiner_names, ["Altezza del volto", "Indice facciale", "Larghezza biorbitale", "Punti canonici del volto"],
     "the combiners made named in the page's language (the library names them in English)");
  eq(out.moved, [200, 1, ["stat:c_altezza_facciale", "stat:c_indice_facciale"], "D.01.05", 0.12],
     "a point placed again: the same extractor (its name kept), a new region, the height and the index recomputed");
  eq(out.surface.slice(0, 5), [200, "0.500 m2", "surface", "stat:superficie_integrata", ["D.01.07"]], "a package's surface: its area");
  eq(out.refused.slice(0, 3), [400, false, "geometry"], "two vertices for a surface: refused, nothing written");
  eq(out.compute, [200, 3, 0], "/pose/compute again: the same three, nothing new written");
} else console.log("  (s3Dgraphy .venv or em-profiles not found: the bridge part skipped)");

console.log(`check-space-tools: ${checks} checks passed`);
