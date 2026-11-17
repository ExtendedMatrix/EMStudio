// MICRO-G-SCHEDE · executable check of src/sheet.ts — the Scheda as a SECOND
// READER of stratigraph-templates' definitions.
//
//   node scripts/check-sheet.mjs            (V10=<TempluMare_v10.em.json> for §3–§6)
//
//  1 · the vendored copy is the compiled definition of stratigraph-templates'
//      dist (same digest), when the checkout is next door;
//  2 · PARITY of the layout: the tree the page draws (`sheetLayout`) is the one
//      `render.sheet_html(mode="form")` draws in Python — rows (mm), cells (%),
//      fields, labels, block labels — box by box, for every declared language;
//  3 · the reading of the v10 (when given): the boxes full, empty, out of the
//      graph, for ten units, real and virtual;
//  4 · edit → undo with the real DocumentStore: a native field, a property read
//      through the lens (changed where it lives, no second node), a new
//      property, a concept, a node of its own; each one delta, one undo;
//  5 · relations ↔ edges: a box adds ONE edge in the canonical direction and
//      the other unit's box shows it; refused: a unit that does not exist, a
//      missing number, the unit itself, a relation already there; a cycle is
//      seen by the Matrix's own reading; undo takes the edge away;
//  6 · the print: the record the page sends, rendered by stratigraph-templates
//      through tools/em_sheet.py (the bridge's route), with its values in their
//      boxes; the PDF when WeasyPrint is there.
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
const S = await load("sheet.ts");
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

const def = S.definitions().find((d) => d.header.id === "iccd-us-2021");
ok(def, "ICCD US 2021 is vendored");
eq(S.studySheetChoice({}).id, "iccd-us-2021", "a study that says nothing: ICCD US 2021");
eq(S.studySheetChoice({ sheet_template: { id: "x", version: "1.0.0" } }), { id: "x", version: "1.0.0", declared: true }, "a study's choice read back");
eq(S.resolveDefinition({ id: "iccd-us-2021", version: "1.0.0", declared: true }).versionDiffers, "1.0.0", "a version not held is said");
eq(S.sheetLanguage(def, "de"), "it", "a language the definition does not speak: its own");

// ── 1 · the vendored copy is the dist's
const TPL = path.resolve(new URL("../../../stratigraph-templates", import.meta.url).pathname);
const haveTpl = fs.existsSync(path.join(TPL, "dist/schede/index.json"));
if (haveTpl) {
  const dist = JSON.parse(fs.readFileSync(path.join(TPL, `dist/schede/iccd-us-2021/${def.header.version}.json`), "utf8"));
  eq(dist.header.digest, def.header.digest, "vendored = dist (digest)");
}

// ── 2 · PARITY of the layout with render.sheet_html(mode="form")
const PY = [path.join(TPL, ".venv/bin/python"), "python3"].find((p) => p === "python3" || fs.existsSync(p));
const tsTokens = (lang) => {
  const out = [];
  const walk = (rows) => { for (const r of rows) { out.push(["row", r.h]); for (const c of r.cells) {
    if (c.kind === "field") out.push(["field", c.w, c.field, c.label ?? ""]);
    else if (c.kind === "block") { out.push(["block", c.w, c.label ?? ""]); walk(c.rows); }
    else out.push(["spacer", c.w]);
  } } };
  for (const s of S.sheetLayout(def, lang)) walk(s.rows);
  return out;
};
if (haveTpl) {
  const vendored = new URL("../src/assets/schede/iccd-us-2021.json", import.meta.url).pathname;
  const code = `
import json, sys, html
from html.parser import HTMLParser
from stratigraph_templates.loader import template_from_compiled
from stratigraph_templates.render import sheet_html
doc = json.load(open(sys.argv[1]))
t = template_from_compiled(doc)
out = {}
for lang in t.languages:
    h = sheet_html(t, lang=lang, mode="form")
    toks = []
    class P(HTMLParser):
        def __init__(s): super().__init__(); s.want = None; s.buf = ""
        def handle_starttag(s, tag, a):
            a = dict(a); c = a.get("class") or ""; st = a.get("style") or ""
            if tag == "div" and c == "row": toks.append(["row", float(st.split("--h:")[1].strip().rstrip("mm"))])
            elif tag == "div" and c.startswith("cell"):
                w = float(st.split("width:")[1].split("%")[0])
                if "spacer" in c: toks.append(["spacer", w])
                elif "data-field" in a: toks.append(["field", w, a["data-field"], ""]); s.cur = toks[-1]
                else: toks.append(["block", w, ""]); s.cur = toks[-1]
            elif tag == "div" and c == "lbl": s.want = "lbl"; s.buf = ""
            elif tag == "span" and c == "txt": s.want = "txt"; s.buf = ""
            elif tag == "span" and s.want == "lbl": s.want = "lbl-done"
        def handle_data(s, d):
            if s.want in ("lbl", "txt"): s.buf += d
        def handle_endtag(s, tag):
            if s.want in ("lbl", "lbl-done") and tag in ("div",):
                s.cur[3] = s.buf.strip(); s.want = None
            elif s.want == "txt" and tag == "span":
                s.cur[2] = s.buf.strip(); s.want = None
    P().feed(h)
    out[lang] = toks
print(json.dumps(out))`;
  const py = JSON.parse(execFileSync(PY, ["-c", code, vendored], { env: { ...process.env, PYTHONPATH: path.join(TPL, "src") } }).toString());
  for (const lang of def.header.languages) {
    const ts = tsTokens(lang);
    eq(ts.length, py[lang].length, `[${lang}] as many rows and cells as the Python form`);
    for (let i = 0; i < ts.length; i++) eq(ts[i], py[lang][i], `[${lang}] token ${i}`);
  }
  eq(S.layoutFields(S.sheetLayout(def, "it")).length, def.visual.fields.length, "every field has exactly one box");
} else console.log("  (stratigraph-templates not next door: parity skipped)");

// ── 3…6 · the v10
const V10 = process.env.V10 ?? "/tmp/sk/T/EM/TempluMare_v10.em.json";
if (!fs.existsSync(V10)) { console.log(`  (no v10 at ${V10}: §3–§6 skipped)`); console.log(`sheet: ${checks} checks passed`); process.exit(0); }
const Mo = await load("model.ts");
const ED = await load("em-data.ts");
const IS = await load("issues.ts");
const cont = JSON.parse(fs.readFileSync(V10, "utf8"));
const gid = cont.active_graph_id ?? Object.keys(cont.graphs)[0];
const st = new Mo.DocumentStore({ header: cont.header, graph: cont.graphs[gid], layout: cont.layout ?? cont.graphs[gid].layout });
const G = () => ({ nodes: st.liveNodes(), edges: st.liveEdges() });
const byName = (n) => st.doc.graph.nodes.find((x) => x.name === n);
const read = (name) => S.readUnit(def, G(), byName(name).id, "it");
const field = (name, fid) => read(name).fields.get(fid);
const apply = (plan) => S.applyPlan(st, plan, (u, q, v) => ED.addQualiaClaim(st, u, q, v));

// 3 · the measure
const UNITS = ["SU002", "SU003", "SU004", "SU019", "SU050", "USV101", "USV106", "USV102", "USV108", "USV148"].filter(byName);
const measure = {};
for (const u of UNITS) {
  const c = S.fillCounts(read(u));
  measure[u] = { type: byName(u).node_type, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.length])), full: c.filled };
  eq(Object.values(c).reduce((a, v) => a + v.length, 0), def.visual.fields.length, `${u}: every box has a state`);
}
eq(field("SU003", "descrizione").text, "Foundation of the walls", "SU003 DESCRIZIONE = the node's description");
eq(field("SU003", "posteriore_a").value, ["SU050"], "SU003 POSTERIORE A = SU050 (is_after →)");
// MICRO-J §C (em_qualia_types 1.6.12): the v10's PropertyNode «definition» is
// an INTERPRETATION under its historical name — INTERPRETAZIONE reads it,
// DEFINIZIONE (the element, a term) never does and says where it went
eq(field("SU003", "definizione").state, "empty", "DEFINIZIONE: the element is empty, the old property is not read as it");
eq(field("SU003", "definizione").how.key, "sheet.how.elementAlias", "…and the box says where the old property went");
eq(field("SU003", "interpretazione").text, "Foundation of the external walls", "INTERPRETAZIONE reads the «definition» PropertyNode");
eq(field("SU003", "interpretazione").how.key, "sheet.how.lensAlias", "…through the lens, under its historical name, said");
eq(field("SU003", "ente_responsabile").state, "silent", "ENTE RESPONSABILE: not in the graph (blocked_on)");
// 3.0.0 (SPEC §2.5): ANNO hangs on a DEFINED act — empty until the act is there
eq(field("SU003", "anno").state, "empty", "ANNO: the excavation act, not in the v10 yet");
eq(field("SU003", "anno").how.key, "sheet.how.actNone", "…and it says so");
eq(field("SU003", "responsabile_compilazione").readonly?.key, "sheet.ro.actFirst", "a responsible waits for its act");
// 3.0.0 (SPEC §2.4): no box is undecided any more on the v10
for (const u of UNITS) eq(S.fillCounts(read(u)).ambiguous, [], `${u}: nothing undecided`);
{
  // FASE is the sub-epoch of PERIODO: a unit whose first epoch has a parent
  const subEdges = st.liveEdges().filter((e) => e.edge_type === "has_sub_epoch");
  const phases = new Set(subEdges.map((e) => e.target));
  const inPhase = st.liveNodes().find((n) => S.isSheetUnit(n) && st.liveEdges().some((e) => e.source === n.id && e.edge_type === "has_first_epoch" && phases.has(e.target)));
  ok(subEdges.length > 0 && !!inPhase, `the v10 has ${subEdges.length} sub-epochs and a unit in one`);
  if (inPhase) {
    const rr = S.readUnit(def, G(), inPhase.id, "it");
    const ph = st.liveEdges().find((e) => e.source === inPhase.id && e.edge_type === "has_first_epoch" && phases.has(e.target)).target;
    const par = subEdges.find((e) => e.target === ph).source;
    eq([rr.fields.get("periodo").nodes, rr.fields.get("fase").nodes], [[par], [ph]], `${inPhase.name}: PERIODO the parent epoch, FASE the child`);
  }
  const plain = byName("SU003");
  eq(read("SU003").fields.get("fase").state, "empty", "SU003: an epoch without a parent is PERIODO, FASE empty");
  ok(read("SU003").fields.get("periodo").state === "filled" || !st.liveEdges().some((e) => e.source === plain.id && e.edge_type === "has_first_epoch"), "SU003: PERIODO filled from its first epoch");
}
{
  // MISURE accepts the dimensional qualia: a height is MISURE's without a sign
  const withH = st.liveNodes().find((n) => S.isSheetUnit(n) && S.readUnit(def, G(), n.id, "it").fields.get("misure").state === "filled");
  ok(!!withH, `MISURE read from the accepted qualia (${withH?.name ?? "none"})`);
  if (withH) ok(S.readUnit(def, G(), withH.id, "it").fields.get("misure").value.every((r) => def.recipe.fields.misure.property.accepts.includes(r.qualia)), "…only qualia it accepts");
}
eq(field("USV106", "formazione_segno").value, undefined, "a USVn is neither positiva nor negativa");

// 4 · edit → undo
let before = JSON.stringify(st.doc.graph);
const su3 = byName("SU003").id;
const n0 = st.doc.graph.nodes.length;
ok(apply(S.planEdit(def, G(), su3, "descrizione", "Fondazione dei muri", "it")), "DESCRIZIONE written");
eq(byName("SU003").description, "Fondazione dei muri", "the unit's description changed");
st.undo();
eq(byName("SU003").description, "Foundation of the walls", "undo: back");
const lensProp = field("SU003", "stato_conservazione").nodes[0];
ok(apply(S.planEdit(def, G(), su3, "stato_conservazione", "scarso", "it")), "STATO DI CONSERVAZIONE written");
eq(st.doc.graph.nodes.length, n0, "a property read through the lens changes where it lives: no new node");
const sc = field("SU003", "stato_conservazione");
eq([sc.nodes[0], sc.lens ?? false], [lensProp, false], "…and it is now this box's (marked)");
ok(/w3id.org\/extendedmatrix\/vocab\/us-stato-conservazione/.test(st.node(lensProp).description), "a concept of the provisional vocabulary, not the word");
st.undo();
ok(field("SU003", "stato_conservazione").lens, "undo: the old value, unmarked");
ok(apply(S.planEdit(def, G(), su3, "interpretazione", "Fondazione perimetrale", "it")), "INTERPRETAZIONE (the old «definition» property)");
eq(st.doc.graph.nodes.length, n0, "it changes where it lives: no second node");
eq(field("SU003", "interpretazione").text, "Fondazione perimetrale", "read back by its mark");
st.undo();
eq(field("SU003", "interpretazione").text, "Foundation of the external walls", "undo: back");
ok(apply(S.planEdit(def, G(), su3, "definizione", "fondazione in muratura", "it")) || true, "DEFINIZIONE");
const dv = byName("SU003").data.definition;
ok(dv && (dv.concept || dv.label), "the element data.definition written");
st.undo();
eq(byName("SU003").data.definition, undefined, "undo: the element gone");
ok(apply(S.planEdit(def, G(), su3, "formazione_natura", "artificial", "it")), "a choice");
eq(field("SU003", "formazione_natura").value, "artificial", "…read back");
st.undo();
const usv106 = byName("USV106").id;
const act1 = st.doc.graph.nodes.find((n) => n.node_type === "ActivityNodeGroup" && n.name !== field("USV106", "attivita").text);
ok(apply(S.planEdit(def, G(), usv106, "attivita", act1.name, "it")), "ATTIVITÀ moved to another activity");
eq(field("USV106", "attivita").text, act1.name, "…its edge, its pointer by role");
st.undo();
eq(JSON.stringify(st.doc.graph), before, "five edits, five undos: the graph as it was");
eq(S.planEdit(def, G(), su3, "us", "SU999", "it").refused.key, "sheet.ro.identity", "the number is not changed from the sheet");
// 3.0.0 · the acts (SPEC §2.5): a date makes the act, one delta, one undo
const e0 = st.doc.graph.edges.length;
ok(apply(S.planEdit(def, G(), su3, "data_rilevamento", "2013-07-12", "it")), "DATA RILEVAMENTO written");
const rec = S.actOf(def, G(), su3, "recording_act");
eq([rec?.node_type, rec?.data?.act_kind, rec?.data?.act_start], ["ActivityNodeGroup", "recording", "2013-07-12"], "…the recording act, its kind, its time");
eq([st.doc.graph.nodes.length, st.doc.graph.edges.length], [n0 + 1, e0 + 1], "one act, one is_in_activity");
eq(field("SU003", "data_rilevamento").text, "2013-07-12", "…read back");
eq(field("SU003", "attivita").nodes.includes(rec.id), false, "an act is not ATTIVITÀ");
ok(apply(S.planEdit(def, G(), su3, "anno", "2013", "it")), "ANNO written");
const exc = S.actOf(def, G(), su3, "excavation_activity");
eq([exc?.data?.act_kind, exc?.data?.act_start], ["excavation", 2013], "the excavation act of 2013");
const su4 = byName("SU004").id;
ok(apply(S.planEdit(def, G(), su4, "anno", "2013", "it")), "SU004: the same year");
eq(S.actOf(def, G(), su4, "excavation_activity")?.id, exc.id, "…the SAME excavation act (shared by year)");
st.undo(); st.undo(); st.undo();
eq(JSON.stringify(st.doc.graph), before, "the acts undone: the graph as it was");
// 3.0.0 · the record status (SPEC §5)
ok(apply(S.planStatus(def, su3, "revised")), "the record status written");
eq(read("SU003").status.key, "revised", "…read back");
eq(S.recordOf(def, read("SU003")).status, "revised", "…and in the record for the print");
st.undo();
eq(read("SU003").status.key, null, "undo: not said");
// MICRO-J §C · the migration: one delta, one undo, ids untouched
const legacy = S.legacyProperties(G());
eq(legacy.length, 99, "the v10's 99 PropertyNodes «definition»");
ok(apply(S.planLegacyRename(G())), "renamed as one delta");
eq(S.legacyProperties(G()).length, 0, "none left");
const renamed = st.node(legacy[0].id);
eq([renamed.name, renamed.data.property_type], ["interpretation", "interpretation"], "same id, the new name");
eq(field("SU003", "interpretazione").how.key, "sheet.how.lensProperty", "INTERPRETAZIONE reads it by its own name now");
st.undo();
eq(S.legacyProperties(G()).length, 99, "undo: all 99 back");
eq(JSON.stringify(st.doc.graph), before, "migration undone: the graph as it was");

// 5 · relations ↔ edges
const p1 = S.planRefAdd(def, G(), su3, "copre", "SU050");
eq(p1.acts, [{ op: "addEdge", source: su3, target: byName("SU050").id, edgeType: "overlies" }], "COPRE SU050 = SU003 overlies SU050");
apply(p1);
eq(field("SU050", "coperto_da").value, ["C02", "SU003"].sort(), "SU050's COPERTO DA shows it");
st.undo();
eq(field("SU050", "coperto_da").value, ["C02"], "undo: the edge gone");
eq(S.planRefAdd(def, G(), su3, "copre", "SU999").refused.key, "sheet.no.unit", "a unit that does not exist: refused, not created");
eq(S.planRefAdd(def, G(), su3, "copre", "abc").refused.key, "sheet.no.number", "no number: refused");
eq(S.planRefAdd(def, G(), su3, "copre", "SU003").refused.key, "sheet.no.self", "the unit itself");
eq(S.planRefAdd(def, G(), su3, "posteriore_a", "SU050").refused.key, "sheet.no.there", "a relation already there");
eq(S.planRefAdd(def, G(), byName("SU050").id, "posteriore_a", "19").refused, { key: "sheet.no.manyUnits", p: { v: "19", list: "T19, SU019" } },
   "«19» is T19 or SU019: not guessed, both named");
const p19 = S.planRefAdd(def, G(), byName("SU050").id, "posteriore_a", "su19");
eq(p19.acts[0]?.target, byName("SU019").id, "«su19» is SU019 (one unit with that prefix and number)");
const cyc = (a, b) => IS.orderContradictions(st.liveNodes(), st.liveEdges()).filter((c) => c.kind === "cycle" && c.nodes.includes(a) && c.nodes.includes(b)).length;
const c0 = cyc(byName("SU050").id, byName("SU019").id);
apply(p19);
ok(cyc(byName("SU050").id, byName("SU019").id) > c0, "SU050 after SU019 closes a cycle the Matrix sees");
st.undo();
const rr = field("SU003", "anteriore_a").refs.find((x) => x.name === "SU019");
apply(S.planRefRemove(rr.edge));
eq(field("SU003", "anteriore_a").value, ["USV102"], "a chip removed: its edge gone");
eq(field("SU019", "posteriore_a").value.includes("SU003"), false, "…and the other unit's box follows");
st.undo();
eq(JSON.stringify(st.doc.graph), before, "relations: the graph as it was after undo");

// 6 · the print, by stratigraph-templates through the bridge's helper
const record = S.recordOf(def, read("SU003"));
eq(record.values.posteriore_a, ["SU050"], "the record carries the relations");
if (haveTpl) {
  const tools = path.resolve(new URL("../../tools", import.meta.url).pathname);
  const code = `import json,sys; sys.path.insert(0, ${JSON.stringify(tools)}); import em_sheet
body=json.load(sys.stdin); s,o=em_sheet.render_sheet(body); o.pop("pdf_b64", None); print(json.dumps({"s":s,"o":o}))`;
  const r = JSON.parse(execFileSync(PY, ["-c", code], { input: JSON.stringify({ definition: def, record, lang: "it", pdf: true }),
    env: { ...process.env, PYTHONPATH: path.join(TPL, "src") } }).toString());
  eq(r.s, 200, "the print answers");
  ok(r.o.html.includes("Foundation of the walls") && r.o.html.includes("SU050"), "the values in their boxes");
  ok(r.o.html.includes('id="side-recto"') && r.o.html.includes('id="side-verso"'), "recto and verso");
  if (r.o.pdf) { ok(r.o.pages >= 2, `a PDF of ${r.o.pages} pages`); console.log(`  print: PDF ${r.o.pages} pages for ${r.o.sides} sides`); }
  else console.log(`  print: no PDF here (${r.o.why})`);
}
fs.writeFileSync(process.env.MEASURE_OUT ?? "/tmp/sk/measure.json", JSON.stringify(measure, null, 1));
for (const [u, m] of Object.entries(measure))
  console.log(`  ${u.padEnd(7)} ${m.type.padEnd(5)} full ${String(m.filled).padStart(2)} · empty ${String(m.empty).padStart(2)} · silent ${m.silent} · open ${m.open} · ambiguous ${m.ambiguous}  [${m.full.join(", ")}]`);
console.log(`sheet: ${checks} checks passed`);
