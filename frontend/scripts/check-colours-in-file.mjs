// MICRO-T-COLORI-NEL-FILE · executable check of the colour schemes INSIDE the
// em.json (src/presentation.ts, the `presentation` section of src/container.ts)
// and of «Nel file» in the window «Colori» (src/colours-window.ts):
//   · a file without the section opens and saves as before;
//   · saved, opened, saved again: identical to the byte; the digest of the
//     work does not see the section;
//   · «Salva .emc» / «Espelli» / «Importa nel file» / «Espelli» again: the
//     same bytes;
//   · «Pulisci il file»: what it takes, and its undo back to the same bytes;
//   · a colour bound to the CODE of the value, else to its text;
//   · s3Dgraphy reads what EMStudio writes and the other way round (S3D=<repo>).
//
//   node scripts/check-colours-in-file.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const C = await load("space-colours.ts");
const P = await load("presentation.ts");
const K = await load("container.ts");
const W = await load("colours-window.ts");
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

// what Save writes (main.ts: JSON.stringify(doc, null, 1))
const save = (doc) => JSON.stringify(doc, null, 1);
const graph = (id) => ({ graph_id: id, nodes: [
  { id: `${id}-u1`, node_type: "US", name: "US1" },
  { id: `${id}-p1`, node_type: "property", name: "material", description: "white rock" },
], edges: [{ id: `${id}-e1`, source: `${id}-u1`, target: `${id}-p1`, edge_type: "has_property" }] });
const build = (presentation) => K.buildContainer({ graphs: [{ id: "g1", doc: { header: { format: "em.json", version: "1.1" }, graph: graph("g1") } }], activeGraphId: "g1", presentation });
const reopen = (text) => {
  const parsed = K.parseContainer(JSON.parse(text));
  return K.buildContainer({ graphs: parsed.members, activeGraphId: parsed.activeGraphId, presentation: parsed.presentation });
};

// a scheme as the window saves it
const P_ = "material";
let st = C.startProperty(C.defaultColourState(), P_, ["white rock", "brick"]);
st = { ...st, scheme: { ...st.scheme, "white rock": "#00AA00", [C.emptyValueKey(P_)]: "#FF00FF" }, leaveNone: true };
const emc = C.emcOfState(st, "TempluMare_v10");

// ── 1 · a file without the section ──────────────────────────────────────────
const plain = save(build(null));
ok(!("presentation" in JSON.parse(plain)), "no scheme: no section written");
eq(save(reopen(plain)), plain, "a file without the section: opened and saved, the same bytes");
eq(K.parseContainer(JSON.parse(plain)).warnings, [], "…and nothing said");

// ── 2 · saved, opened, saved again ──────────────────────────────────────────
const pres = P.emptyPresentation();
eq(P.addScheme(pres, "material", emc), "material", "a scheme kept under its name");
eq(P.addScheme(pres, "material", emc), "material (2)", "the same name again: a new one");
P.setActive(pres, "g1", "material");
const first = save(build(pres));
const doc1 = JSON.parse(first);
eq(Object.keys(doc1.presentation), ["active_colour_scheme", "colour_schemes"], "the section, keys sorted");
eq(Object.keys(doc1.presentation.colour_schemes.material.metadata), Object.keys(doc1.presentation.colour_schemes.material.metadata).sort(), "…inside too");
eq(save(reopen(first)), first, "saved, opened, saved again: identical to the byte");
eq(K.contentDigest(doc1), K.contentDigest(JSON.parse(plain)), "the digest of the work does not see the section");
eq(P.activeScheme(K.parseContainer(doc1).presentation, "g1").name, "material", "opened: the graph's scheme");
// what cannot be read is left out and said
const broken = { ...doc1, presentation: { colour_schemes: { ok: emc, bad: { metadata: {} } }, active_colour_scheme: { g1: "bad", g2: "ok" } } };
const pb = K.parseContainer(broken);
eq([P.schemeNames(pb.presentation), pb.presentation.active_colour_scheme, pb.warnings.length], [["ok"], { g2: "ok" }, 2], "a broken scheme and a dangling choice: left out, said");
// the legacy single-graph form carries it too
const legacy = { header: { format: "em.json", version: "1.0" }, graph: graph("g1"), presentation: doc1.presentation };
eq(P.schemeNames(K.parseContainer(legacy).presentation), ["material", "material (2)"], "the flat form: read the same");

// ── 3 · .emc out and in: the same bytes ─────────────────────────────────────
const saved = P.emcText(emc);                            // «Salva .emc»
const imported = P.emptyPresentation();
const name = P.addScheme(imported, P.schemeNameOfFile("/x/material.emc"), JSON.parse(saved));
eq(name, "material", "imported: named after its file");
const throughFile = reopen(save(build(imported)));        // kept in the file, saved, opened
const back = K.parseContainer(JSON.parse(save(throughFile))).presentation;
eq(P.emcText(back.colour_schemes.material), saved, "«Salva .emc» → «Importa nel file» → save/open → «Espelli»: identical to the byte");
eq(P.emcFileName("period/phase: 1"), "period_phase_ 1.emc", "an expelled file's name holds no separator");
eq(C.emcRead(JSON.parse(saved)).leaveNone, true, "…and it is still a .emc («lascia com'è» kept)");

// ── 4 · «Pulisci il file» and its undo ──────────────────────────────────────
eq(P.presentationSummary(pres), { schemes: 2, active: 1 }, "what «Pulisci» shows: 2 schemes, 1 in use");
const before = P.clonePresentation(pres);
for (const n of P.schemeNames(pres)) P.removeScheme(pres, n);
eq(P.presentationSection(pres), null, "cleaned: no section");
eq(save(build(pres)), plain, "…the file is the file without it, byte for byte");
eq(save(build(before)), first, "undo: the file as it was, byte for byte");

// ── 5 · the code of the value ───────────────────────────────────────────────
const AAT = "http://vocab.getty.edu/aat/300011176";
const coded = P.schemeOfState(emc, new Map([["white rock", AAT], ["brick", null]]));
eq(coded.metadata.value_codes, { "white rock": AAT }, "the codes the values have, written beside the labels");
const got = P.coloursForValues(coded, new Map([["pietra bianca", AAT], ["white rock", null], ["other", "http://x/1"]]));
eq([...got], [["pietra bianca", "#00AA00"], ["white rock", "#00AA00"]], "a label in another language finds the colour by its code; no code: by the text");
const sFrom = P.stateFromScheme(null, coded, new Map([["pietra bianca", AAT]]));
eq([sFrom.mode, sFrom.property, sFrom.scheme["pietra bianca"], sFrom.leaveNone], ["property", P_, "#00AA00", true], "the Space's state from the file's scheme");

// ── 6 · «Nel file» in the window ────────────────────────────────────────────
const { document } = parseHTML("<!doctype html><html><head></head><body></body></html>");
const calls = [];
let fileP = P.clonePresentation(before);
const host = {
  t: (k, v = {}) => k + (Object.keys(v).length ? JSON.stringify(v) : ""), fmtN: String,
  space: () => ({ winId: "w1", epoch: "E" }), state: () => st, set: () => {}, units: () => [], propertyNames: () => [],
  values: () => new Map(), plan: () => null, setEpochColour() {}, select() {}, saveEmc() {}, pickEmc: async () => null,
  toast() {}, isWriting: () => false, rev: () => "1",
  fileSchemes: () => ({ file: "a.em.json", schemes: P.schemeNames(fileP).map((n) => ({ name: n, property: fileP.colour_schemes[n].metadata.property_name, values: 3, active: fileP.active_colour_scheme.g1 === n })) }),
  useFileScheme: (n) => calls.push(["use", n]), keepInFile: () => calls.push(["keep"]), dropFromFile: (n) => calls.push(["drop", n]),
  expelSchemes: () => calls.push(["expel"]), importSchemes: () => calls.push(["import"]),
};
let box = W.coloursContent(document, host);
const rows = [...box.querySelectorAll("[data-cw-file-scheme]")];
eq(rows.map((r) => [r.dataset.cwFileScheme, r.classList.contains("active")]), [["material", true], ["material (2)", false]], "the file's schemes listed, the one in use marked");
rows[1].querySelector("[data-cw-use]").dispatchEvent(new document.defaultView.Event("click"));
rows[0].querySelector("[data-cw-unuse]").dispatchEvent(new document.defaultView.Event("click"));
rows[1].querySelector("[data-cw-drop]").dispatchEvent(new document.defaultView.Event("click"));
for (const k of ["keep", "expel", "import"]) box.querySelector(`[data-cw-${k}]`).dispatchEvent(new document.defaultView.Event("click"));
eq(calls, [["use", "material (2)"], ["use", null], ["drop", "material (2)"], ["keep"], ["expel"], ["import"]], "Usa · Non usare · × · Tieni nel file · Espelli · Importa: each asks its gesture");
fileP = P.emptyPresentation();
box = W.coloursContent(document, host);
ok(!box.querySelector("[data-cw-expel]") && box.querySelector("[data-cw-import]"), "a file without schemes: nothing to expel, something to import");
box = W.coloursContent(document, { ...host, fileSchemes: () => null });
ok(!box.querySelector("[data-cw-import]") && box.querySelector("[data-cw-file] .cw-hint"), "a graph in no file: said, no gesture");

// ── 7 · s3Dgraphy reads what EMStudio writes, and back ──────────────────────
const S3D = process.env.S3D ?? path.resolve(new URL("../../../s3Dgraphy", import.meta.url).pathname);
const PY = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(path.join(S3D, "src/s3dgraphy/presentation.py")) && fs.existsSync(PY)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "colours-in-file-"));
  const ours = path.join(dir, "ours.em.json"), theirs = path.join(dir, "theirs.em.json");
  fs.writeFileSync(ours, first);
  const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(S3D, "src"))})
from s3dgraphy.container import load_container_file, save_container_file
from s3dgraphy import presentation as P
c, w = load_container_file(${JSON.stringify(ours)})
print(json.dumps({"names": P.scheme_names(c.presentation), "active": c.presentation[P.ACTIVE_KEY], "warnings": w,
                  "emc": P.emc_text(c.presentation[P.SCHEMES_KEY]["material"])}))
save_container_file(c, ${JSON.stringify(theirs)}, bump=False)
`;
  const r = JSON.parse(execFileSync(PY, ["-c", py], { encoding: "utf8" }).trim().split("\n").pop());
  eq([r.names, r.active, r.warnings], [["material", "material (2)"], { g1: "material" }, []], "s3Dgraphy reads EMStudio's section");
  eq(JSON.parse(r.emc), JSON.parse(P.emcText(emc)), "…the same scheme");
  const t = K.parseContainer(JSON.parse(fs.readFileSync(theirs, "utf8")));
  eq([P.schemeNames(t.presentation), t.presentation.active_colour_scheme, t.warnings], [["material", "material (2)"], { g1: "material" }, []], "EMStudio reads s3Dgraphy's section");
  eq(t.presentation.colour_schemes.material, doc1.presentation.colour_schemes.material, "…the same scheme");
} else console.log("check-colours-in-file: s3Dgraphy (with presentation.py and .venv) not found, parity skipped");

console.log(`check-colours-in-file: ${checks} checks passed`);
