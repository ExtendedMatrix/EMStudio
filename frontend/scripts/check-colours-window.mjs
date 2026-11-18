// MICRO-S-COLORI-FINESTRA · executable check of the window «Colori»
// (src/colours-window.ts) and of what it asks of src/space-colours.ts: the
// values with their number of units, the two special values of EM Tools
// («ha la proprietà, valore vuoto», «non ha la proprietà», which may also be
// left as it is), a colour changed → the units drawn in it, the scales by the
// kind of the values, the .emc saved and opened back identical and readable
// by EM Tools. The window is driven on a linkedom document.
//
// With a copy of TempluMare_v10 (V10=<em.json>, default /tmp/microS/T/EM/
// TempluMare_v10.em.json; its proxies/ folder beside it) it also measures the
// property `material` on the real graph.
//
//   node scripts/check-colours-window.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const C = await load("space-colours.ts");
const W = await load("colours-window.ts");
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

// ── 1 · values, counts, the two special values ──────────────────────────────
const P = "material";
const g = { nodes: [
  { id: "u1" }, { id: "u2" }, { id: "u3" }, { id: "u4" }, { id: "u5" },
  { id: "p1", node_type: "property", name: P, description: "stone" },
  { id: "p2", node_type: "property", name: P, description: "brick" },
  { id: "p3", node_type: "property", name: P, description: "stone" },
  { id: "p4", node_type: "property", name: P, description: "" },
], edges: [
  { source: "u1", target: "p1", edge_type: "has_property" }, { source: "u2", target: "p2", edge_type: "has_property" },
  { source: "u3", target: "p3", edge_type: "has_property" }, { source: "u4", target: "p4", edge_type: "has_property" },
] };
const units = ["u1", "u2", "u3", "u4", "u5"];
const vals = C.propertyValues(g, P, units);
eq(C.valueKind(P, vals.values()), "text", "text values");
let st = C.startProperty(C.defaultColourState(), P, vals.values());
eq(st.ramp, { type: "qualitative", name: "set1" }, "text starts on the first qualitative palette");
eq([st.scheme[C.emptyValueKey(P)], st.scheme[C.noValueKey(P)]], [C.SPECIAL_GREY, C.SPECIAL_GREY], "the two special values start with EM Tools' grey");
eq(C.SPECIAL_GREY, C.linearToHex([0.5, 0.5, 0.5]), "…which is EM Tools' DEFAULT_COLOR (0.5, 0.5, 0.5), linear");
ok(st.scheme.stone && st.scheme.brick && st.scheme.stone !== st.scheme.brick, "every value a colour, distinct");
let rows = C.propertyRows(st, units, vals);
eq(rows.map((r) => [r.label, r.count, r.special ?? null]), [["brick", 1, null], ["stone", 2, null], ["", 1, "empty"], ["", 1, "none"]],
  "the window's rows: the values with their counts, then the two specials");
rows = C.propertyRows(st, ["u1", "u2"], vals);
eq(rows.filter((r) => r.special).map((r) => [r.special, r.count]), [["empty", 0], ["none", 0]], "the two specials are always there (count 0 too)");
let plan = C.colourPlan(st, units, { epochs: [], firstOf: () => null, values: vals });
eq(plan.legend.filter((l) => l.special).map((l) => l.special), ["empty", "none"], "the legend: both specials when they have units");
eq(C.colourPlan(st, ["u1", "u2"], { epochs: [], firstOf: () => null, values: vals }).legend.length, 2, "…and none of them when they have none");
// a colour changed → the units of that value drawn in it
st = { ...st, scheme: { ...st.scheme, stone: "#123456", [C.emptyValueKey(P)]: "#FF00FF" } };
plan = C.colourPlan(st, units, { epochs: [], firstOf: () => null, values: vals });
eq([plan.colour.get("u1"), plan.colour.get("u3"), plan.colour.get("u4")], ["#123456", "#123456", "#FF00FF"], "a value's colour changed: its units recoloured");
// «non ha la proprietà» left as it is
st = { ...st, leaveNone: true };
plan = C.colourPlan(st, units, { epochs: [], firstOf: () => null, values: vals });
ok(!plan.colour.has("u5"), "left as it is: the unit keeps its type's colour (no colour in the plan)");
ok(plan.legend.find((l) => l.special === "none").untouched, "the legend says so");
ok(C.legendShows(C.legendClick(st, C.noValueKey(P)), plan, "u5"), "the legend still isolates it");
// a scale applied keeps the specials' colours
const st2 = C.applyRamp(st, vals.values(), "qualitative", "pastel");
eq(st2.scheme[C.emptyValueKey(P)], "#FF00FF", "a scale applied: the special value keeps the colour given by hand");
eq(st2.scheme.brick, C.assignRamp(["stone", "brick"], "qualitative", "pastel").get("brick"), "…and the values take the scale's (EM Tools' spread)");

// ── 2 · numbers: a scale between min and max ────────────────────────────────
const gn = { nodes: [...["a", "b", "c"].map((id) => ({ id })),
  { id: "q1", node_type: "property", name: "h", description: "10" }, { id: "q2", node_type: "property", name: "h", description: "20" },
  { id: "q3", node_type: "property", name: "h", description: "30" }],
  edges: [["a", "q1"], ["b", "q2"], ["c", "q3"]].map(([s, t]) => ({ source: s, target: t, edge_type: "has_property" })) };
const vn = C.propertyValues(gn, "h", ["a", "b", "c"]);
const sn = C.startProperty(C.defaultColourState(), "h", vn.values());
eq([C.valueKind("h", vn.values()), sn.ramp.type, sn.range], ["numeric", "sequential", { lo: 10, hi: 30 }], "numbers start on a sequential scale, min and max the values'");
const seqc = C.RAMPS.sequential.viridis.colors;
eq([sn.scheme["10"], sn.scheme["30"]], [seqc[0], seqc.at(-1)], "the lowest the scale's first, the highest its last");
const sr = C.applyRamp(sn, vn.values(), "sequential", "viridis", { lo: 0, hi: 20 });
eq([sr.scheme["20"], sr.scheme["30"]], [seqc.at(-1), seqc.at(-1)], "a max of 20: 20 and above at the top");
ok(C.isNumericScale("diverging") && !C.isNumericScale("qualitative"), "which scales are numeric");
// a qualitative palette with more values than colours goes round
const many = Array.from({ length: 9 }, (_, i) => `v${i}`);
const qm = C.rampScheme("x", many, "qualitative", "set1");
eq([qm.get("v0"), qm.get("v7")], [C.RAMPS.qualitative.set1.colors[0], C.RAMPS.qualitative.set1.colors[0]], "9 values on 7 colours: round");
ok(qm.get("v0") !== qm.get("v1"), "…neighbours differ");

// ── 3 · the .emc: both specials, «leave as it is», back identical ───────────
const emc = C.emcOfState(st, "TempluMare_v10");
ok(C.emptyValueKey(P) in emc.color_mapping && C.noValueKey(P) in emc.color_mapping, "the .emc carries the two special values");
eq(emc.metadata[C.EMC_LEAVE_NONE], true, "«leave as it is» in metadata (EM Tools reads only property_name there)");
const back = C.emcRead(JSON.parse(JSON.stringify(emc)));
const reopened = { ...C.defaultColourState(), mode: "property", property: back.property, scheme: Object.fromEntries(back.scheme), leaveNone: back.leaveNone };
eq(JSON.stringify(C.emcOfState(reopened, "TempluMare_v10"), null, 2), JSON.stringify(emc, null, 2), "saved, opened, saved again: identical to the byte");
const noLeave = C.emcOfState({ ...st, leaveNone: false });
ok(!(C.EMC_LEAVE_NONE in noLeave.metadata), "not left as it is: no extra key at all");
// EM Tools' own format and sentinels (its source, read: it cannot be imported without Blender)
const EMT = path.resolve(new URL("../../../EM-blender-tools/visual_manager", import.meta.url).pathname);
if (fs.existsSync(path.join(EMT, "utils.py"))) {
  const py = fs.readFileSync(path.join(EMT, "utils.py"), "utf8");
  ok(py.includes('f"empty property {property_name} node"') && py.includes('f"no property {property_name} node"'), "EM Tools' two sentinels are the keys written");
  ok(/return data\["metadata"\]\["property_name"\], data\["color_mapping"\]/.test(py), "EM Tools' load reads only property_name and color_mapping: an extra metadata key is ignored");
  ok(/DEFAULT_COLOR = \(0\.5, 0\.5, 0\.5, 1\.0\)/.test(py), "EM Tools' DEFAULT_COLOR is the grey taken");
  for (const [k, c] of Object.entries(emc.color_mapping)) ok(Array.isArray(c) && c.length === 4 && c.every((x) => typeof x === "number" && x >= 0 && x <= 1), `«${k}»: four floats 0–1, as item.color takes`);
} else console.log("check-colours-window: EM-blender-tools not next door, its format not read");

// ── 4 · the window, on a document ───────────────────────────────────────────
const { document } = parseHTML("<!doctype html><html><head></head><body></body></html>");
const EN = { "cw.where": "Epoch shown: {e} · {n} proxies", "cw.empty": "has the property, empty value", "cw.none": "does not have the property" };
let state = { ...C.defaultColourState(), mode: "property" };
const log = { set: 0, selected: null, saved: null, toasts: [] };
const host = {
  t: (k, v = {}) => (EN[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ""),
  fmtN: (n) => String(n),
  space: () => ({ winId: "w1", epoch: "Severan" }),
  state: () => state,
  set: (s) => { state = s; log.set++; },
  units: () => units,
  propertyNames: () => C.propertyNames(g, units),
  values: (p) => C.propertyValues(g, p, units),
  plan: () => null,
  setEpochColour: () => {},
  select: (u) => { log.selected = u; },
  saveEmc: (doc, name) => { log.saved = { doc, name }; },
  pickEmc: async () => JSON.parse(JSON.stringify(log.saved.doc)),
  toast: (m) => log.toasts.push(m),
  isWriting: () => false,
  rev: () => "1",
};
const draw = () => W.coloursContent(document, host);
// linkedom's <select>.value is read-only: choose by the options' «selected»
const choose = (sel, v) => { for (const o of sel.querySelectorAll("option")) o.toggleAttribute("selected", o.value === v); assert.equal(sel.value, v); };
let box = draw();
const prop = box.querySelector("[data-cw-property]");
ok(prop && [...prop.querySelectorAll("option")].some((o) => o.value === P && o.textContent === `${P} (4)`), "the property listed with its number of units");
choose(prop, P);
prop.dispatchEvent(new document.defaultView.Event("change"));
eq([state.property, state.ramp.type], [P, "qualitative"], "chosen: it starts on the qualitative palette");
box = draw();
const rowsEl = [...box.querySelectorAll(".cw-val")];
eq(rowsEl.map((r) => [r.querySelector(".cw-lab").textContent, r.querySelector(".cw-n").dataset.cwCount]),
  [["brick", "1"], ["stone", "2"], [EN["cw.empty"], "1"], [EN["cw.none"], "1"]], "the window lists the values, counts, and the two special rows");
eq(rowsEl.map((r) => r.dataset.cwSpecial ?? null), [null, null, "empty", "none"], "the specials at the bottom");
// a colour changed in the swatch
const sw = box.querySelector('[data-cw-key="stone"] input[type="color"]');
sw.value = "#00aa00";
sw.dispatchEvent(new document.defaultView.Event("change"));
eq(state.scheme.stone, "#00AA00", "the swatch writes the value's colour");
plan = C.colourPlan(state, units, { epochs: [], firstOf: () => null, values: vals });
eq([plan.colour.get("u1"), plan.colour.get("u3")], ["#00AA00", "#00AA00"], "…and its proxies are drawn in it");
const swE = box.querySelector(`[data-cw-special="none"] input[type="color"]`);
swE.value = "#202020";
swE.dispatchEvent(new document.defaultView.Event("change"));
eq(state.scheme[C.noValueKey(P)], "#202020", "the «non ha la proprietà» swatch writes its own colour");
// a click on a value selects its units
box = draw();
box.querySelector('[data-cw-key="stone"] .cw-lab').dispatchEvent(new document.defaultView.Event("click"));
eq(log.selected, ["u1", "u3"], "a click on a value selects its units");
box.querySelector('[data-cw-special="none"] .cw-lab').dispatchEvent(new document.defaultView.Event("click"));
eq(log.selected, ["u5"], "…on «non ha la proprietà», the units without it");
// «leave as it is»
const cb = box.querySelector("[data-cw-leave-none]");
cb.checked = true;
cb.dispatchEvent(new document.defaultView.Event("change"));
ok(state.leaveNone, "«lascia com'è» set");
box = draw();
ok(box.querySelector('[data-cw-special="none"]').classList.contains("untouched") && box.querySelector('[data-cw-special="none"] input[type="color"]').disabled,
  "…its swatch off");
// a numeric scale on text: said before and after
const rs = box.querySelector("[data-cw-ramp]");
const warn = box.querySelector("[data-cw-warn]");
ok(warn.classList.contains("hidden"), "a qualitative palette on text: nothing to say");
choose(rs, "sequential/viridis");
rs.dispatchEvent(new document.defaultView.Event("change"));
ok(!warn.classList.contains("hidden"), "a sequential scale chosen on text: the window says it follows the alphabet");
box.querySelector("[data-cw-apply]").dispatchEvent(new document.defaultView.Event("click"));
ok(state.ramp.type === "sequential" && log.toasts.length === 1, "applied, and said again");
eq(state.scheme[C.noValueKey(P)], "#202020", "the special value kept its own colour");
// .emc saved and opened back: identical
box = draw();
box.querySelector("[data-cw-save]").dispatchEvent(new document.defaultView.Event("click"));
eq(log.saved.name, "material.emc", "saved as <property>.emc");
const before = JSON.stringify(log.saved.doc);
state = { ...C.defaultColourState(), mode: "property", property: "other" };
box = draw();
box.querySelector("[data-cw-open]").dispatchEvent(new document.defaultView.Event("click"));
await new Promise((r) => setTimeout(r, 0));
eq([state.property, state.leaveNone], [P, true], "opened: the property and «lascia com'è» back");
eq(JSON.stringify(C.emcOfState(state)), before, "…and saved again, the same file");
// numbers in the window: min / max
state = { ...C.defaultColourState(), mode: "property" };
const hostN = { ...host, units: () => ["a", "b", "c"], propertyNames: () => C.propertyNames(gn, ["a", "b", "c"]), values: (p) => C.propertyValues(gn, p, ["a", "b", "c"]) };
state = C.startProperty(state, "h", vn.values());
box = W.coloursContent(document, hostN);
eq([box.querySelector('[data-cw-range="min"]').value, box.querySelector('[data-cw-range="max"]').value], ["10", "30"], "numbers: min and max shown");
box.querySelector('[data-cw-range="max"]').value = "20";
box.querySelector("[data-cw-apply]").dispatchEvent(new document.defaultView.Event("click"));
eq(state.range, { lo: 10, hi: 20 }, "a max typed: the scale goes between them");
// no Space
eq(W.coloursContent(document, { ...host, space: () => null }).textContent, "cw.noSpace", "no Space open: said");
// the panel's place, kept and kept on screen
const kv = new Map();
const store = { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => kv.set(k, String(v)) };
W.saveWindowPref({ x: 50, y: 60, w: 400, h: 500 }, store);
eq(W.loadWindowPref(store), { x: 50, y: 60, w: 400, h: 500 }, "the panel's place and size, kept");
eq(W.loadWindowPref({ getItem: () => { throw new Error("denied"); } }).w, 360, "storage refused: the default");
eq(W.clampPanel({ x: 5000, y: 5000, w: 400, h: 500 }, 1200, 800), { x: 792, y: 752, w: 400, h: 500 }, "kept inside the page");

// ── 5 · TempluMare v10 (a copy) ─────────────────────────────────────────────
const V10 = process.env.V10 || "/tmp/microS/T/EM/TempluMare_v10.em.json";
if (fs.existsSync(V10)) {
  const doc = JSON.parse(fs.readFileSync(V10, "utf8"));
  const gr = Object.values(doc.graphs)[0];
  const pxDir = path.join(path.dirname(V10), "proxies");
  const px = fs.existsSync(pxDir) ? new Set(fs.readdirSync(pxDir).filter((f) => f.endsWith(".glb")).map((f) => f.slice(0, -4))) : new Set();
  // EM Tools' US_PROPER_TYPES: every unit type of a family, BR and SE out (us_types.py)
  const STRAT = new Set(["US", "USVs", "USVn", "USVt", "SF", "VSF", "RSF", "USD", "serSU", "serUSVn", "serUSVs", "USN", "USNt", "TSU", "UL"]);
  const strat = gr.nodes.filter((n) => STRAT.has(n.node_type));
  const withPx = strat.filter((n) => px.has(n.name)).map((n) => n.id);
  const v = C.propertyValues(gr, P, withPx);
  const r = C.propertyRows({ ...C.defaultColourState(), mode: "property", property: P }, withPx, v);
  const all = C.propertyValues(gr, P, strat.map((n) => n.id));
  const rAll = C.propertyRows({ ...C.defaultColourState(), mode: "property", property: P }, strat.map((n) => n.id), all);
  const say = (rs) => rs.map((x) => `${x.special ?? x.label}=${x.count}`).join(", ");
  console.log(`v10 · ${P} · units with a proxy (${withPx.length}): ${say(r)}`);
  console.log(`v10 · ${P} · every stratigraphic unit (${strat.length}, as EM Tools maps): ${say(rAll)}`);
  eq(r.filter((x) => !x.special).map((x) => [x.label, x.count]), [["white rock", 1]], "v10: one proxy says «white rock» (USV132)");
  eq(r.find((x) => x.special === "empty").count, 1, "v10: one proxy has `material` with no value (SU003)");
  ok(r.find((x) => x.special === "none").count === withPx.length - 2, "v10: the others do not have it");
  const st10 = C.startProperty(C.defaultColourState(), P, v.values());
  const emc10 = C.emcOfState(st10, path.basename(V10));
  const back10 = C.emcRead(JSON.parse(JSON.stringify(emc10)));
  eq(JSON.stringify(C.emcOfState({ ...st10, scheme: Object.fromEntries(back10.scheme) }, path.basename(V10))), JSON.stringify(emc10), "v10: the .emc of `material`, saved and opened, identical");
} else console.log(`check-colours-window: ${V10} absent, the v10 part skipped`);

console.log(`check-colours-window: ${checks} checks passed`);
