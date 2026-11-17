// MICRO-P-GEOREF-PER-GRAFO (E.D., 17 Nov 2026) · the card «Georeferenziazione»
// (`src/georef-card.ts`, `src/georef.ts`, `file-frame.ts`) and the bridge's
// PROJ answers (`tools/em_geotiles.py`):
//
//   1. pure: a model's state against its graph (in the graph's system / its own
//      shift / reprojected / local), the translation of a frame in the graph's
//      CRS, the graph's azimuth undone (the inverse of `localToCrs`), the data's
//      axes as three's; «EPSG:<code>» as s3Dgraphy's normalise_datum_operation
//      writes it, a frame's datum_operation read as s3Dgraphy's read_frame reads
//      it (compared with s3Dgraphy when its venv is there);
//   2. A FILE OF TWO GRAPHS in two systems (3844 and 32633): the card lists
//      both, each with its own; editing one (its fields, as a person does) never
//      touches the other; saved and reopened, both are kept; no write ever goes
//      to the file's header; a graph without one: «Not georeferenced», never 4326;
//   3. the models: «as the graph» / its own system (one undo step each), the
//      labels, the frame written on the RM; the GeoPositionNode's Inspector;
//   4. the bridge (when the s3Dgraphy venv is there): «Stereo 70» → 3844, the
//      datum of 3844 and 32633 differ, PROJ's operations with their accuracy,
//      the best at the site, EPSG:1645's area; a frame in the same CRS a pure
//      translation, another CRS fitted within a millimetre.
//
//   node scripts/check-georef-card.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseHTML } from "linkedom";

globalThis.localStorage = { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } };
const { window, document } = parseHTML(`<!doctype html><html><body></body></html>`);
globalThis.window = window;
globalThis.document = document;
globalThis.Event = window.Event;
globalThis.HTMLElement = window.HTMLElement;

const SRC = new URL("../src/", import.meta.url).pathname;
const globPlugin = {
  name: "glob",
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      let text = readFileSync(args.path, "utf8");
      text = text.replace(/import\.meta\.glob\(\s*"\.\/assets\/([^/]+)\/\*\.(\{[^}]+\}|\w+)"[\s\S]*?\}\)/g,
        (_m, dir, ext) => {
          const exts = ext.startsWith("{") ? ext.slice(1, -1).split(",") : [ext];
          const files = readdirSync(`${SRC}assets/${dir}`).filter((f) => exts.some((e) => f.endsWith(`.${e}`)));
          return JSON.stringify(Object.fromEntries(files.map((f) => [`./assets/${dir}/${f}`, `url:${f}`])));
        });
      return { contents: text, loader: "ts" };
    });
  },
};
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./georef"; export * from "./georef-card"; export { readFrame, makeFrame } from "./file-frame";
    export { DocumentStore } from "./model"; export { parseContainer, buildContainer } from "./container"; export { setLocale } from "./i18n";`,
    resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, plugins: [globPlugin],
  loader: { ".svg": "text", ".png": "text" }, logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, w) => { assert.ok(c, w); checks++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, `${w} — got ${JSON.stringify(a)}`); checks++; };
// linkedom's <select> has no value setter: the option is selected, as a person picks it
const pick = (sel, v) => { for (const o of sel.querySelectorAll("option")) { if (o.value === v) o.setAttribute("selected", ""); else o.removeAttribute("selected"); } };
const near = (a, b, tol, w) => { assert.ok(Math.abs(a - b) <= tol, `${w} — got ${a}, want ${b} ± ${tol}`); checks++; };

const PY = process.env.PYTHON ?? new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname;
const S3D = new URL("../../../s3Dgraphy/src", import.meta.url).pathname;
const TOOLS = new URL("../../tools", import.meta.url).pathname;
const py = existsSync(PY) ? (code) => JSON.parse(execFileSync(PY, ["-c", code], { encoding: "utf8", env: { ...process.env, PYTHONPATH: `${S3D}:${TOOLS}` } })) : null;

// ── 1 · pure ────────────────────────────────────────────────────────────────
{
  const g = { epsg: 3844, shift_x: 327372, shift_y: 448682, shift_z: 0, rotation: 0 };
  eq(M.modelGeoState(null, g), { kind: "graph", own: false }, "no frame: in the graph's system (it follows the graph)");
  eq(M.modelGeoState(null, {}), { kind: "local", own: false }, "no frame, graph not georeferenced: local");
  eq(M.modelGeoState({ crs: "EPSG:3844", shift: [327372, 448682, 0] }, g).kind, "graph", "its frame = the graph's: in the graph's system");
  eq(M.modelGeoState({ crs: "EPSG:3844", shift: [327400, 448700, 0] }, g).kind, "graph-shift", "the graph's CRS, another shift");
  eq(M.modelGeoState({ crs: null, shift: [327400, 448700, 0] }, g).kind, "graph-shift", "a shift only: the graph's CRS");
  eq(M.modelGeoState({ crs: "EPSG:32635", shift: [500000, 5000000, 0] }, g), { kind: "reprojected", from: "EPSG:32635", own: true }, "another CRS: reprojected from it");
  eq(M.modelGeoState({ crs: "EPSG:32635", shift: [1, 2, 0] }, {}).kind, "local", "a CRS but a graph without one: local");
  eq(M.frameOffset({ crs: "EPSG:3844", shift: [327400, 448700, 1] }, g), [28, 18, 1], "same CRS: the shift minus the graph's");
  eq(M.frameOffset({ crs: "EPSG:32635", shift: [0, 0, 0] }, g), null, "another CRS: PROJ's (the bridge)");
  // the azimuth undone: localToCrs ∘ gridToScene = the shift added
  const gr = { ...g, rotation: 30 };
  const R = M.gridToScene(gr);
  const apply = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
  const [x, y] = apply(R, [10, 5, 0]);
  const [X, Y] = M.localToCrs(gr, x, y);
  near(X, 327372 + 10, 1e-9, "the grid → the scene → the CRS: x back");
  near(Y, 448682 + 5, 1e-9, "…y back");
  // the data's axes as three's: (x east, y north, z up) → (x, z up, −y)
  const T3 = M.dataToThree(M.translation([28, 18, 1]));
  eq(apply(T3, [0, 0, 0]).map((v) => Math.round(v * 1e9) / 1e9), [28, 1, -18], "a translation east 28, north 18, up 1 in three's axes");
  ok(M.isIdentity4(M.dataToThree(M.translation([0, 0, 0]))), "nothing: identity");
  eq(M.crsQuery(" EPSG:3844 "), { code: 3844 }, "a code");
  eq(M.crsQuery("Stereo 70"), { words: "Stereo 70" }, "words");
  eq(M.crsQuery(""), null, "empty");
  eq(M.datumOpen({}, false), false, "no other datum, none declared: under «Advanced»");
  eq(M.datumOpen({ datum_operation: "EPSG:1645" }, false), true, "declared: open");
  eq(M.datumOpen({}, true), true, "a model on another datum: open");
  // datum_operation as s3Dgraphy writes it
  const forms = ["EPSG:1645", "epsg::1645", " 1645 ", 1645, "", null];
  const mine = forms.map((v) => M.normaliseDatumOperation(v));
  eq(mine, ["EPSG:1645", "EPSG:1645", "EPSG:1645", "EPSG:1645", null, null], "normalise_datum_operation's forms");
  for (const bad of ["Pulkovo", "EPSG:0", true]) assert.throws(() => M.normaliseDatumOperation(bad), `refused: ${bad}`), checks++;
  const frames = [{ crs: "3844", shift: [1, 2, 0], datum_operation: "1645" }, { crs: "EPSG:3844", shift: [1, 2, 0], datum_operation: "?" },
                  { crs: "EPSG:6708", shift: [291407, 4640813, 0], note: "n", source: "file" }];
  const readTs = frames.map((f) => M.readFrame({ frame: f }));
  eq(readTs[0].datum_operation, "EPSG:1645", "a frame's datum_operation read");
  eq("datum_operation" in readTs[1], false, "…malformed: dropped, never guessed");
  eq(M.makeFrame(32635, [1, 2, 0], "", "manual", "epsg:1645").datum_operation, "EPSG:1645", "written normalised");
  if (py) {
    const theirs = py(`import json
from s3dgraphy.api import normalise_datum_operation as n
from s3dgraphy.geometry.frame import read_frame
print(json.dumps({"n": [n(v) for v in ${JSON.stringify(forms).replace(/null/g, "None")}],
  "f": [read_frame({"frame": f}) for f in ${JSON.stringify(frames)}]}))`);
    eq(mine, theirs.n, "= s3Dgraphy's normalise_datum_operation");
    eq(readTs, theirs.f, "= s3Dgraphy's read_frame (datum_operation kept, a malformed one dropped, an old frame as before)");
  } else console.log("  (no s3Dgraphy venv: parity with s3Dgraphy skipped)");
}

// ── 2 · a file of two graphs in two systems ─────────────────────────────────
const graphSection = (gid, epsg, sx, sy, extra = []) => ({ graph_id: gid, name: gid, data: {}, nodes: [
  { id: `${gid}_graphroot`, node_type: "graph", name: "Graph", description: "" },
  { id: `${gid}_graph_paradata`, node_type: "ParadataNodeGroup", name: "Graph paradata", description: "" },
  ...(epsg ? [{ id: `geo_${gid}`, node_type: "geo_position", name: "geo_position", description: "",
    data: { epsg, shift_x: sx, shift_y: sy, shift_z: 0, rotation: 0, rotation_reference: "grid" } }] : []),
  { id: `${gid}_US1`, node_type: "US", name: "US1", description: "" },
  ...extra,
], edges: [
  { id: `${gid}_graphroot__has_paradata_nodegroup__${gid}_graph_paradata`, source: `${gid}_graphroot`, target: `${gid}_graph_paradata`, edge_type: "has_paradata_nodegroup" },
  ...(epsg ? [{ id: `geo_${gid}__is_in_paradata_nodegroup__${gid}_graph_paradata`, source: `geo_${gid}`, target: `${gid}_graph_paradata`, edge_type: "is_in_paradata_nodegroup" }] : []),
] });
const twoGraphs = () => ({ header: { format: "em.json", version: "1.0" }, version: "1.0", active_graph_id: "romania",
  graphs: {
    romania: graphSection("romania", 3844, 327372, 448682, [{ id: "rm_a", node_type: "representation_model", name: "Templu", description: "", data: {} }]),
    paestum: graphSection("paestum", 32633, 500400, 4474400),
  } });
M.setLocale?.("it");
{
  const file = twoGraphs();
  const parsed = M.parseContainer(JSON.parse(JSON.stringify(file)));
  eq(parsed.members.map((m) => m.id), ["romania", "paestum"], "two members");
  const stores = parsed.members.map((m) => ({ id: m.id, label: m.id, store: new M.DocumentStore(m.doc) }));
  const [ro, pa] = stores;
  const logs = [];
  const deps = {
    graphs: () => stores, activeId: () => "romania",
    models: (st) => M.cardModelsOf(st.liveNodes().filter((n) => n.node_type === "representation_model").map((n) => ({ id: n.id, name: n.name, resource: null,
      frame: M.readFrame(n.data) ? { frame: M.readFrame(n.data), from: n.id } : null })), (id) => st.node(id)),
    bridge: async () => null, log: (m, ids) => logs.push([m, ids]), done: () => paint(), help: () => document.createElement("span"), close: () => {},
  };
  const card = document.createElement("div");
  document.body.appendChild(card);
  const paint = () => M.renderGeorefCard(card, deps, paint);
  M.chooseGraph("romania");
  paint();
  const rows = [...card.querySelectorAll("[data-gr-graph]")];
  eq(rows.map((r) => [r.dataset.grGraph, r.dataset.grEpsg]), [["romania", "3844"], ["paestum", "32633"]], "the card lists both graphs, each with its own system");
  ok(card.textContent.includes("La georeferenziazione è di ciascun grafo, non del file."), "the rule, said");
  const field = (k) => card.querySelector(`[data-gr-graph-sec] [data-gr-field="${k}"]`);
  eq(field("epsg").value, "EPSG:3844", "the chosen graph's system in its field");
  ok(field("shift_z").disabled && field("shift_z").value === "0", "shift Z: 0, not editable");
  // choose the other graph and change its shift as a person does
  rows[1].dispatchEvent(new Event("click"));
  eq(card.querySelector("[data-gr-graph-sec]").dataset.grGraphSec, "paestum", "the other graph chosen");
  const roBefore = JSON.stringify(ro.store.geoPositionNode().data);
  const sx = field("shift_x");
  sx.value = "500410";
  sx.dispatchEvent(new Event("change"));
  eq(pa.store.geoPositionNode().data.shift_x, 500410, "paestum: shift X written");
  eq(JSON.stringify(ro.store.geoPositionNode().data), roBefore, "romania: untouched");
  eq(logs.at(-1)[1], ["geo_paestum"], "the Log line is on paestum's GeoPositionNode (its history)");
  const ep = field("epsg");
  ep.value = "32634";
  ep.dispatchEvent(new Event("change"));
  eq(pa.store.geoPositionNode().data.epsg, 32634, "paestum: its system changed");
  eq(ro.store.geoPositionNode().data.epsg, 3844, "romania: still 3844");
  // undo: one step each
  pa.store.undo();
  eq(pa.store.geoPositionNode().data.epsg, 32633, "one undo: the system back");
  pa.store.undo();
  eq(pa.store.geoPositionNode().data.shift_x, 500400, "another: the shift back");
  // save and reopen: both kept, the header untouched
  pa.store.setGeoreference({ shift_y: 4474500 });
  const saved = M.buildContainer({ graphs: stores.map((s) => ({ id: s.id, doc: s.store.doc })), activeGraphId: "romania" });
  const again = M.parseContainer(JSON.parse(JSON.stringify(saved)));
  const geoOf = (id) => again.members.find((m) => m.id === id).doc.graph.nodes.find((n) => n.node_type === "geo_position").data;
  eq([geoOf("romania").epsg, geoOf("romania").shift_x, geoOf("romania").shift_y], [3844, 327372, 448682], "reopened: romania as it was");
  eq([geoOf("paestum").epsg, geoOf("paestum").shift_x, geoOf("paestum").shift_y], [32633, 500400, 4474500], "reopened: paestum with its change");
  ok(!JSON.stringify(saved.header ?? {}).includes("epsg") && !("epsg" in saved), "nothing written on the file: no system in the header");
  // a graph without one: «Not georeferenced», «Georeference this graph»: no CRS, never 4326
  const bare = { id: "bare", label: "bare", store: new M.DocumentStore({ graph: graphSection("bare", null) }) };
  stores.push(bare);
  M.chooseGraph("bare");
  paint();
  ok(card.querySelector("[data-gr-graph='bare']").textContent.includes("Non georiferito"), "bare: listed «Non georiferito»");
  card.querySelector("[data-gr-create]").dispatchEvent(new Event("click"));
  const bg = bare.store.geoPositionNode();
  ok(!!bg && !("epsg" in bg.data), "«Georeferenzia questo grafo»: the node, no system — never 4326");
  eq(field("epsg").value, "", "…its field empty");
  ok(card.querySelector("[data-gr-crs-name]").textContent.includes("mai 4326"), "…said: not georeferenced, never 4326");
  stores.pop();

  // ── 3 · the models ───────────────────────────────────────────────────────
  M.chooseGraph("romania");
  paint();
  const row = () => card.querySelector("[data-gr-model='rm_a']");
  eq(row().dataset.grState, "graph", "Templu: as the graph");
  eq(row().querySelector("[data-gr-state-label]").textContent, "nel sistema del grafo", "…said");
  const mode = row().querySelector("[data-gr-model-mode]");
  pick(mode, "own");
  eq(mode.value, "own", "(the option picked)");
  mode.dispatchEvent(new Event("change"));
  eq(ro.store.node("rm_a").data.frame, { crs: "EPSG:3844", shift: [327372, 448682, 0], source: "manual" }, "its own system: it starts from the graph's (nothing moves)");
  eq(row().dataset.grState, "graph", "…still in the graph's system");
  const mx = row().querySelector("[data-gr-field='m-shift_x-rm_a']");
  mx.value = "327400";
  mx.dispatchEvent(new Event("change"));
  eq(row().dataset.grState, "graph-shift", "another shift: «its own shift»");
  ok(row().querySelector("[data-gr-state-label]").textContent.includes("Δ 28, 0"), "…the delta said");
  const mc = row().querySelector("[data-gr-field='m-epsg-rm_a']");
  mc.value = "32635";
  mc.dispatchEvent(new Event("change"));
  eq(row().dataset.grState, "reprojected", "another CRS: reprojected");
  eq(row().querySelector("[data-gr-state-label]").textContent, "riproiettato da EPSG:32635", "…from it, said");
  eq(logs.at(-1)[1], ["rm_a"], "the Log line is on the model (its history)");
  const m2 = row().querySelector("[data-gr-model-mode]");
  pick(m2, "graph");
  m2.dispatchEvent(new Event("change"));
  eq("frame" in (ro.store.node("rm_a").data ?? {}), false, "«as the graph»: its frame removed (it follows the graph)");
  ro.store.undo();
  eq(ro.store.node("rm_a").data.frame.crs, "EPSG:32635", "one undo: the frame back");
  // the GeoPositionNode's Inspector
  const host = document.createElement("div");
  let opened = 0;
  M.renderGeorefInspector(host, ro, deps, () => {}, () => { opened++; });
  ok(!!host.querySelector("[data-gr-inspector='geo_romania'] [data-gr-field='shift_x']"), "the Inspector: the card's fields");
  const ix = host.querySelector("[data-gr-field='shift_x']");
  ix.value = "327373";
  ix.dispatchEvent(new Event("change"));
  eq(ro.store.geoPositionNode().data.shift_x, 327373, "…editable");
  host.querySelector("[data-gr-open-card]").dispatchEvent(new Event("click"));
  eq(opened, 1, "«Apri nella scheda Georeferenziazione»");
}

// ── 3b · the value back: the save identical to the byte (out of a room) ─────
{
  const sec = graphSection("v", 3844, 327372, 448682);
  const gnode = sec.nodes.find((n) => n.node_type === "geo_position");
  gnode.data.field_clocks = { "data.shift_x": { ts: "2026-10-23T17:36:46Z" } };
  gnode.data.datum_operation = "EPSG:1645";
  const st = new M.DocumentStore({ graph: sec });
  const before = st.toJSON();
  st.setGeoreference({ shift_x: 327382 });
  ok(st.toJSON() !== before, "shift changed: the document differs");
  ok(st.geoPositionNode().data.field_clocks["data.shift_x"].ts !== "2026-10-23T17:36:46Z", "…its clock stamped");
  st.setGeoreference({ shift_x: 327372 });
  eq(st.toJSON(), before, "back to the saved value: identical to the byte (clock and stamps as saved)");
  st.setGeoreference({ shift_x: 327382 });
  st.setGeoreference({ shift_y: 1 });
  st.setGeoreference({ shift_x: 327372 });
  ok(st.toJSON() !== before, "another field still changed: not restored");
  st.setGeoreference({ shift_y: 448682 });
  eq(st.toJSON(), before, "…until it is back too");
}

// ── 4 · the bridge: PROJ ────────────────────────────────────────────────────
if (py) {
  const b = py(`import json, em_geotiles as G
out = {"s": G.crs_search("Stereo 70")["hits"][0], "c": G.crs_search("EPSG:32633")["hits"][0]["epsg"],
  "d": G.datum_info(3844, 32633, 327372, 448682), "w": G.datum_info(32633, 3844),
  "k": [G.check_datum_operation("epsg::1645"), G.check_datum_operation("x")["ok"], G.check_datum_operation("15498")["ok"]],
  "same": G.frame_fit({"crs": "EPSG:3844", "shift": [327400, 448700, 1]}, {"crs": "EPSG:3844", "shift": [327372, 448682, 0]}),
  "other": G.frame_fit({"crs": "EPSG:32635", "shift": [500000, 5000000, 0]}, {"crs": "EPSG:3844", "shift": [327372, 448682, 0]})}
print(json.dumps(out))`);
  eq([b.s.epsg, b.s.name], [3844, "Pulkovo 1942(58) / Stereo70"], "«Stereo 70» → 3844 (spaces aside)");
  eq(b.c, 32633, "a code");
  eq([b.d.datum, b.d.wgs84, b.d.other.same_datum], ["Pulkovo 1942(58)", false, false], "3844 and 32633: two models of the Earth");
  ok(b.d.ops.length >= 3 && b.d.ops.every((o) => /^EPSG:\d+$/.test(o.code)), "PROJ's operations to WGS 84, each with its code");
  const best = b.d.ops.find((o) => o.code === b.d.best);
  ok(best && best.here === true && !best.ballpark, `the best holds the site (${b.d.best}, ±${best?.accuracy} m)`);
  const p1645 = b.d.ops.find((o) => o.code === "EPSG:1645");
  eq([p1645?.here, p1645?.area], [false, "Poland - onshore."], "EPSG:1645 (declared on the v10): its area is not the site's — said, never changed");
  eq([b.w.wgs84, b.w.ops.length], [true, 0], "32633 is on WGS 84: no operation");
  eq(b.k, [{ ok: true, code: "EPSG:1645" }, false, false], "the check: s3Dgraphy's form, PROJ's knowledge (an axis order change is no recipe)");
  eq(b.same.transform.map((v) => Math.round(v * 1e6) / 1e6), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 28, 18, 1, 1], "same CRS: the translation");
  eq(b.same.how, "same", "…said");
  ok(b.other.residual_max_m < 0.001, `another CRS fitted within 1 mm (${(b.other.residual_max_m * 1000).toFixed(3)} mm)`);
  eq(b.other.said, "convertito da EPSG:32635 a EPSG:3844", "«convertito da … a …» (the GIS words)");
} else console.log("  (no s3Dgraphy venv: the bridge's PROJ checks skipped)");

console.log(`check-georef-card: ${checks} checks passed`);
