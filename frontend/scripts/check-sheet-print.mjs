// MICRO-PL002 · executable check of src/sheet-print.ts — «Stampa schede».
//
//   node scripts/check-sheet-print.mjs        (V10=<TempluMare_v10.em.json> for §2–§3)
//
//  1 · the pure pieces: numbers and ranges, the orders, the pages, the file
//      name, the sheets joined (recto only), the batches, a sheet's state;
//  2 · the v10 (when given): the units the window lists (every unit a sheet is
//      drawn for), the criteria one by one and combined, their counts, the
//      states read off the sheets, the three orders;
//  3 · the print of a batch: the records of the RSF sent to tools/em_sheet.py
//      (the bridge's route) with the renderer EMStudio VENDORS (tools/vendor),
//      one A4 per record, joined: 2 sides each, recto only 1, no «()» left in a
//      key, the sheet's slack on the right in the CSS.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64") + `#${entry}`);
};
const SP = await load("sheet-print.ts");
const S = await load("sheet.ts");
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

// ── 1 · the pure pieces
eq(SP.numberOf("USM012"), 12, "the number of USM012");
eq(SP.numberOf("US2-14"), 14, "the LAST number: US2-14 is 14");
eq(SP.numberOf("Muro"), null, "no number");
const m = SP.numberMatcher("1-20, 35; 40 – 45 USM12");
ok(m({ name: "US7" }) && m({ name: "SU020" }) && m({ name: "US35" }) && m({ name: "US42" }), "ranges and numbers");
ok(!m({ name: "US21" }) && !m({ name: "US46" }), "…and not outside them");
ok(m({ name: "usm 12" }), "a name, case and spaces aside");
eq(SP.numberMatcher(" , ; "), null, "nothing said: everything");
const U = (name, extra = {}) => ({ id: name, name, type: "US", epochs: [], epochStart: null, groups: [], text: name.toLowerCase(), at: null, ...extra });
eq(SP.orderUnits([U("US10"), U("US2"), U("USM1"), U("US1")], "number").map((u) => u.name), ["US1", "US2", "US10", "USM1"], "by number: US2 before US10, a prefix with its own");
eq(SP.orderUnits([U("A", { epochStart: 100 }), U("B"), U("C", { epochStart: -50 })], "epoch").map((u) => u.name), ["C", "A", "B"], "by epoch: the oldest first, none last");
eq(SP.orderUnits([U("A", { at: { x: 5, y: 10 } }), U("B", { at: { x: 1, y: 10 } }), U("C"), U("D", { at: { x: 9, y: 2 } })], "matrix").map((u) => u.name), ["D", "B", "A", "C"], "as in the Matrix: top to bottom, left to right, no place last");
eq(SP.pageCount(37, "both", 2), 74, "37 sheets, 74 pages");
eq(SP.pageCount(37, "recto", 2), 37, "recto only: 37");
const day = new Date(2026, 10, 18);
eq(SP.printFileName("ICCD US 2021", "Templu Mare", day), "ICCD US 2021 · Templu Mare · 2026-11-18.pdf", "the file: template · graph · date");
eq(SP.printFileName("ICCD US 2021", "a/b:c", day, "US 12"), "ICCD US 2021 · a-b-c · 2026-11-18 · US 12.pdf", "a sheet's own file, nothing a system refuses");
const page = (k) => `<!DOCTYPE html><html lang='it'><head><meta charset='utf-8'><title>t${k}</title><style>.x{}</style></head><body><section class="sheet" id="side-recto" data-side="recto">R${k}</section><section class="sheet" id="side-verso" data-side="verso">V${k}</section></body></html>`;
const both = SP.joinSheets([page(1), page(2)], "both", "A <b>");
eq((both.match(/<section/g) ?? []).length, 4, "joined: 2 sheets × 2 sides");
ok(both.includes("R1") && both.includes("V2") && both.indexOf("V1") < both.indexOf("R2"), "…in order, each sheet's verso before the next recto");
ok(both.includes("<title>A &lt;b></title>") && (both.match(/<style>/g) ?? []).length === 1, "one title (escaped), one style");
const recto = SP.joinSheets([page(1), page(2)], "recto", "x");
eq((recto.match(/<section/g) ?? []).length, 2, "recto only: one side per sheet");
ok(!recto.includes("V1"), "…and no verso");
eq(SP.batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], "batches");
const f1 = SP.freshCriteria(); f1.types.push("RSF");
eq(SP.freshCriteria().types, [], "a new window starts with nothing chosen (no list shared with the last one)");
const req = (f) => f === "us";
eq(SP.sheetStateOf([{ fid: "us", state: "filled" }, { fid: "x", state: "silent" }], req), "full", "nothing empty: full");
eq(SP.sheetStateOf([{ fid: "us", state: "filled" }, { fid: "x", state: "empty" }], req), "gaps", "an empty box: gaps");
eq(SP.sheetStateOf([{ fid: "us", state: "empty" }, { fid: "x", state: "filled" }], req), "todo", "a required box empty: to complete");

// ── 2 · the v10
const V10 = process.env.V10 ?? "/tmp/pl002/T/TempluMare_v10.em.json";
if (!fs.existsSync(V10)) { console.log(`  (no v10 at ${V10}: §2–§3 skipped)`); console.log(`sheet-print: ${checks} checks passed`); process.exit(0); }
const cont = JSON.parse(fs.readFileSync(V10, "utf8"));
const gid = cont.active_graph_id ?? Object.keys(cont.graphs)[0];
const G = cont.graphs[gid].graph ?? cont.graphs[gid];
const nodes = G.nodes, edges = G.edges;
const byName = new Map(nodes.map((n) => [n.name, n]));
const pos = cont.layout?.positions ?? G.layout?.positions ?? {};
const units = SP.printUnits(nodes, edges, (n) => S.isSheetUnit(n), (id) => pos[id] ? { x: pos[id].x, y: pos[id].y } : null);
eq(units.length, nodes.filter((n) => S.isSheetUnit(n)).length, "every unit with a sheet is listed");
const types = [...new Set(units.map((u) => u.type))].sort();
console.log(`  v10: ${units.length} units, types ${types.join(" ")}`);
const C = (more) => ({ ...SP.freshCriteria(), ...more });
const none = new Set();
const pick = (more, sel = none) => SP.selectUnits(units, C(more), sel);
eq(pick({}).length, units.length, "no criterion: all");
const rsf = pick({ types: ["RSF"] });
eq(rsf.length, nodes.filter((n) => n.node_type === "RSF").length, "type RSF");
eq(rsf.map((u) => u.name), [...rsf.map((u) => u.name)].sort(), "RSF by number");
eq(pick({ types: ["RSF"], numbers: "8" }).map((u) => u.name), ["RSF008"], "RSF + number 8: RSF008");
eq(pick({ types: ["RSF"], numbers: "2-4" }).map((u) => u.name), ["RSF002", "RSF003", "RSF004"], "RSF + range 2-4");
const iuno = pick({ text: "iuno regina" }).map((u) => u.name);
ok(iuno.includes("RSF008"), `the words «iuno regina» find RSF008 (${iuno.join(", ")})`);
const sel = new Set([byName.get("RSF008").id, byName.get("RSF001").id]);
eq(pick({ scope: "selection" }, sel).map((u) => u.name), ["RSF001", "RSF008"], "the selection");
const epochIds = [...new Set(units.flatMap((u) => u.epochs))];
ok(epochIds.length >= 2, `epochs to choose from: ${epochIds.length}`);
const e0 = epochIds[0];
const inE0 = pick({ epochs: [e0] });
ok(inE0.length > 0 && inE0.every((u) => u.epochs.includes(e0)), `epoch ${nodes.find((n) => n.id === e0)?.name}: ${inE0.length} units`);
const both2 = pick({ epochs: [e0], types: ["US"] });
ok(both2.every((u) => u.type === "US" && u.epochs.includes(e0)), "epoch AND type");
const groupIds = [...new Set(units.flatMap((u) => u.groups))];
const act = groupIds.find((g) => nodes.find((n) => n.id === g)?.node_type === "ActivityNodeGroup");
if (act) {
  const inAct = pick({ groups: [act] });
  ok(inAct.length > 0, `activity ${nodes.find((n) => n.id === act)?.name}: ${inAct.length} units`);
}
// the states, read as the window reads them
const def = S.definitions().find((d) => d.header.id === "iccd-us-2021");
const required = (fid) => !!S.visualField(def, fid)?.required;
const t0 = Date.now();
for (const u of units) {
  const r = S.readUnit(def, { nodes, edges }, u.id, "it");
  u.state = SP.sheetStateOf(r.fields.values(), required);
  u.status = r.status ? r.status.key : null;
}
const ms = Date.now() - t0;
const tally = Object.fromEntries(["full", "gaps", "todo"].map((k) => [k, units.filter((u) => u.state === k).length]));
console.log(`  states read in ${ms} ms (${(ms / units.length).toFixed(1)} ms/unit): ${JSON.stringify(tally)}`);
eq(tally.full + tally.gaps + tally.todo, units.length, "every sheet has a state");
eq(pick({ states: ["todo"] }).length, tally.todo, "state «to complete»");
eq(pick({ states: ["full", "gaps"] }).length, tally.full + tally.gaps, "two states: either");
const byEpoch = pick({ order: "epoch" });
const starts = byEpoch.map((u) => u.epochStart ?? Infinity);
ok(starts.every((s, i) => i === 0 || starts[i - 1] <= s), "by epoch: the starts never go back");
const byMatrix = pick({ order: "matrix" }).filter((u) => u.at);
ok(byMatrix.every((u, i) => i === 0 || byMatrix[i - 1].at.y <= u.at.y), "as in the Matrix: y never goes back");

// ── 3 · a batch printed by the renderer EMStudio vendors
const tools = path.resolve(new URL("../../tools", import.meta.url).pathname);
const records = rsf.map((u) => S.recordOf(def, S.readUnit(def, { nodes, edges }, u.id, "it")));
// the bridge's Python (EMStudio has no venv: s3Dgraphy's, as the bridges run)
const PY = process.env.BRIDGE_PY ?? [path.resolve(tools, "../../s3Dgraphy/.venv/bin/python")].find((p) => fs.existsSync(p)) ?? "python3";
const code = `import json,sys; sys.path.insert(0, ${JSON.stringify(tools)}); import em_sheet
body=json.load(sys.stdin); s,o=em_sheet.render_sheet(body); o.pop("pdfs", None)
import stratigraph_templates; o["from"]=stratigraph_templates.__file__; print(json.dumps({"s":s,"o":o}))`;
const r = JSON.parse(execFileSync(PY, ["-I", "-c", code], { input: JSON.stringify({ definition: def, records, lang: "it" }), maxBuffer: 1 << 28 }).toString());
eq(r.s, 200, "the batch answers");
ok(r.o.from.includes(path.join("tools", "vendor")), `the vendored renderer (${r.o.from})`);
eq(r.o.htmls.length, rsf.length, "one A4 per record");
eq(r.o.sides, 2, "two sides per sheet");
const all = SP.joinSheets(r.o.htmls, "both", "x");
eq((all.match(/<section class="sheet"/g) ?? []).length, 2 * rsf.length, `${rsf.length} sheets joined: ${2 * rsf.length} sides`);
eq((SP.joinSheets(r.o.htmls, "recto", "x").match(/<section class="sheet"/g) ?? []).length, rsf.length, "recto only");
ok(!/\(\s*\)/.test(all.replace(/<style>[\s\S]*?<\/style>/, "")), "no «()» left by a missing field");
ok(/\.sheet \{ padding-right: 1\.5mm;/.test(all), "the sheet's slack on the right (WebKit's print)");
ok(all.includes("RSF008"), "RSF008 among them");
fs.mkdirSync("/tmp/pl002/out", { recursive: true });
fs.writeFileSync("/tmp/pl002/out/rsf-batch.html", all);
const allUnits = SP.orderUnits(units, "number");
const big = SP.batches(allUnits.map((u) => S.recordOf(def, S.readUnit(def, { nodes, edges }, u.id, "it"))), 20);
const htmls = [];
const t1 = Date.now();
for (const b of big) {
  const rr = JSON.parse(execFileSync(PY, ["-I", "-c", code], { input: JSON.stringify({ definition: def, records: b, lang: "en" }), maxBuffer: 1 << 28 }).toString());
  eq(rr.s, 200, `batch of ${b.length}`);
  htmls.push(...rr.o.htmls);
}
eq(htmls.length, units.length, `all ${units.length} units drawn in ${big.length} batches (${Date.now() - t1} ms)`);
fs.writeFileSync("/tmp/pl002/out/v10-all.html", SP.joinSheets(htmls, "both", "ICCD US 2021 · v10 · all"));
console.log(`sheet-print: ${checks} checks passed`);
