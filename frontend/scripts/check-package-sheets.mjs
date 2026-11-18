// MICRO-PL11-SCHEDE-DEI-PACCHETTI (row W8 of the extensions plan, E.D. 18 Nov 2026)
// · the sheet of a community package in the «Schede» workspace.
//
// A package's sheet is stratigraph-templates' compiled form, compiled against
// the core + the package's overlay (`stratigraph-templates package-build`). The
// page offers it only when the bridge VERIFIED it (the file the manifest
// names, the content the compiler produced, its id and version), with its
// package's own vocabularies; the preview and the install refuse an archive
// whose sheet was edited after compiling. Pinned here:
//
//   · the pure pieces: formsOf (verified / refused / an old bridge),
//     formVocabulariesOf, sheet.setRuntimeVocabularies (never in place of a
//     vendored scheme), packageOf; the package's sheet read and written on
//     em-profiles' example (testa-esempio.em.json): the combiner's value in its
//     box, a concept of the package's scheme, a decimal;
//   · the window's lines (linkedom): «verificata (…)» / «non offerta — …»;
//   · the wiring: main.ts sets the runtime vocabularies, the choices name the
//     package, the bridge level 80 on both sides, the sidecar bundles the verifier;
//   · the bridge in Python (tools/em_extensions.py) on em-profiles' examples in
//     /tmp folders: overlay verified with concepts in it/en; the installed copy
//     edited → refused; an archive edited → preview «not installable», install
//     422 and nothing written; a placeholder that is not a compiled form → a
//     warning, the rest installs, the sheet not offered.
//
//   node scripts/check-package-sheets.mjs
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
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64") + `#${entry}`);
};
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const PROFILES = process.env.EM_PROFILES ?? path.resolve(SRC, "../../../em-profiles");
const EX = path.join(PROFILES, "examples", "esempio-statuaria");
if (!fs.existsSync(path.join(EX, "profile.json"))) {
  console.log("check-package-sheets: em-profiles is not beside EMStudio — skipped");
  process.exit(0);
}
const IRI = "https://w3id.org/extendedmatrix/profile/esempio-statuaria";
const compiled = JSON.parse(fs.readFileSync(path.join(EX, "forms/stat-scheda-superficie/0.1.0.json"), "utf8"));
const FASE = "https://w3id.org/extendedmatrix/profile/esempio-statuaria/vocab/fase-superficie/";
const vocabFase = { format: 1, scheme: "stat:fase-superficie", uri: FASE, status: "resolvable", languages: ["it", "en"], concepts: [
  { concept: `${FASE}integrazione`, labels: { it: "integrazione di restauro", en: "restoration infill" } },
  { concept: `${FASE}originale`, labels: { it: "lavorazione originale", en: "original working" } },
  { concept: `${FASE}rilavorazione`, labels: { it: "rilavorazione", en: "reworking" } }] };

// ── the pure pieces ─────────────────────────────────────────────────────────
const S = await load("extensions-state.ts");
const refusal = { code: "form_content_digest", level: "error", where: "forms x",
  en: "forms x: its content is not what it was compiled to", it: "forms x: il contenuto non è quello compilato" };
const ov = {
  profiles: [{ name: "esempio-statuaria", iri: IRI, prefix: "stat", version: "0.1.0" }],
  forms: {
    "stat-scheda-superficie": { id: "stat-scheda-superficie", profile: IRI, label: { it: "Scheda della superficie" },
      compiled_doc: compiled, verified: true, vocabularies: [vocabFase, { ...vocabFase }] },
    "stat-rotta": { id: "stat-rotta", profile: IRI, compiled_doc: compiled, verified: false, compiled_problems: [refusal] },
    "stat-vecchia": { id: "stat-vecchia", profile: IRI, compiled_doc: compiled },
    "stat-altra": { id: "stat-altra", profile: IRI, verified: false, vocabularies: [{ ...vocabFase, scheme: "stat:altro" }],
      compiled_problems: [{ ...refusal, code: "form_not_compiled" }] },
  },
};
const forms = S.formsOf(ov, "it");
eq(forms.map((f) => [f.id, !!f.def, f.problems.map((p) => p.code)]),
   [["stat-scheda-superficie", true, []], ["stat-rotta", false, ["form_content_digest"]],
    ["stat-vecchia", false, ["form_unverified"]], ["stat-altra", false, ["form_not_compiled"]]],
   "formsOf: offered only when verified; refused with the bridge's reason; an old bridge (no `verified`) not offered");
eq(forms.map((f) => f.name), ["Scheda della superficie", "stat-rotta", "stat-vecchia", "stat-altra"],
   "a sheet's name: the manifest's label, else the verified definition's title, else its id");
ok(S.formsOf({ forms: { x: { id: "x", compiled_doc: compiled, verified: true } } }, "en")[0].name === "Surface form (EXAMPLE)",
   "…the definition's title in the page's language");
eq(S.formVocabulariesOf(ov).map((v) => v.scheme), ["stat:fase-superficie"],
   "formVocabulariesOf: the verified sheets' schemes only, one file per scheme");
eq(S.formsOf(null, "it"), [], "no overlay: no sheets");

const SH = await load("sheet.ts");
const before = SH.definitions().length;
SH.setRuntimeDefinitions([compiled]);
SH.setRuntimeVocabularies([vocabFase, { scheme: "em-us-colore", concepts: [] }]);
eq(SH.definitions().length, before + 1, "the package's sheet among the definitions");
eq(SH.definitions().at(-1).header.id, "stat-scheda-superficie", "…after the vendored ones");
eq(SH.resolveDefinition({ id: "stat-scheda-superficie", version: null, declared: true }).def?.header.id, "stat-scheda-superficie",
   "the study can choose it");
eq(SH.packageOf(compiled), { name: "esempio-statuaria", iri: IRI, prefix: "stat", version: "0.1.0" }, "packageOf: the package it was compiled with");
eq(SH.packageOf(SH.definitions()[0]), null, "…none for a sheet of the core");
const c = SH.conceptsFor(compiled, "fase", "it");
eq([c.scheme, c.concepts.map((x) => x.label)], ["stat:fase-superficie", ["integrazione di restauro", "lavorazione originale", "rilavorazione"]],
   "a term box of the package: the concepts of the package's scheme, in Italian");
eq(SH.conceptsFor(compiled, "fase", "en").concepts[0].label, "restoration infill", "…in English");
const iccd = SH.definitions().find((d) => d.header.id === "iccd-us-2021");
ok(SH.conceptsFor(iccd, "colore", "it").concepts.length > 0, "a vendored scheme is never replaced by a runtime one (em-us-colore)");

const doc = JSON.parse(fs.readFileSync(path.join(EX, "examples/testa-esempio.em.json"), "utf8"));
const g = Object.values(doc.graphs)[0];
const r = SH.readUnit(compiled, { nodes: g.nodes, edges: g.edges }, "us1", "it");
const larg = r.fields.get("larghezza");
eq([larg.state === "empty", larg.text], [false, "0.0912"], "the combiner's value in its box (read by its quale)");
eq(r.fields.get("descrizione").text, "Superficie del volto (ESEMPIO)", "the unit's description");
const pt = SH.planEdit(compiled, { nodes: g.nodes, edges: g.edges }, "us1", "fase", "integrazione di restauro", "it");
const add = pt.acts.find((a) => a.op === "addProp");
eq([!!pt.refused, add?.qualia, add?.value, pt.notes.length], [false, "stat:fase_di_superficie", `${FASE}integrazione`, 0],
   "a term box: the label typed becomes the package's concept, on the package's quale");
const pe = SH.planEdit(compiled, { nodes: g.nodes, edges: g.edges }, "us1", "area", "0.0042", "it");
ok(!pe.refused && JSON.stringify(pe.acts).includes("stat:area_integrazione"), "a decimal box writes the package's quale");

ok(/sheet\.footPackage/.test(fs.readFileSync(path.join(SRC, "sheet-view.ts"), "utf8")),
   "the sheet's foot says a package's sheet came with its package (not «vendored from dist/schede»)");

// ── the window's lines ──────────────────────────────────────────────────────
const { document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = document;
const W = await load("extensions-window.ts");
const words = (k, v) => (v ? `${k}(${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(",")})` : k);
const host = { t: words, lang: () => "it", toast: () => {}, log: () => {}, dialog: async () => ({ ok: false }),
  pickArchive: async () => null, canPickFolder: () => true, fileName: () => "testa.em.json", openVocabularies: () => {},
  afterChange: () => {}, formsAdded: () => new Set(["stat-scheda-superficie"]) };
const row = { id: "esempio-statuaria", kind: "community-package", data: { status: "installed", iri: IRI, versions: ["0.1.0"] },
  code: { status: "absent" } };
const state = { rows: [row], unavailable: false, error: null, platform: "macos-arm64", dirs: {},
  overlay: { ...ov, qualia: {}, extractor_types: {}, document_types: {}, combiner_types: {}, file_types: {}, landmark_sets: {},
    color_schemes: {}, visual_rules: {}, qualia_vocabularies: [], problems: [] }, missing: [] };
const box = W.extensionsContent(document, host, state, () => {});
const lines = [...box.querySelectorAll("[data-ext-form]")];
eq(lines.map((l) => l.dataset.extForm), ["added", "form_content_digest", "form_unverified", "form_not_compiled"],
   "the window: one line per sheet, verified or refused with its code");
ok(lines[0].textContent.includes("ext.formAdded") && lines[0].textContent.includes(`ext.formVerified(d=${compiled.header.digest.slice(7, 19)})`),
   "…a verified sheet: «tra le schede · verificata (<digest>)»");
ok(lines[1].textContent.includes("ext.formRefused") && lines[1].textContent.includes("il contenuto non è quello compilato"),
   "…a refused one: «non offerta — <the reason in the page's language>»");
ok(lines[2].textContent.includes("ext.formUnverified"), "…an old bridge's: «non verificata da questo bridge (serve il livello 80)»");

// ── the wiring ──────────────────────────────────────────────────────────────
const main = fs.readFileSync(path.join(SRC, "main.ts"), "utf8");
const bridge = fs.readFileSync(path.join(SRC, "../../tools/em_bridge.py"), "utf8");
const i18n = fs.readFileSync(path.join(SRC, "i18n.ts"), "utf8");
ok(/setRuntimeVocabularies\(formVocabulariesOf\(ov\)/.test(main), "main.ts: the verified sheets' vocabularies to the sheets");
ok(/sheetPackageOf\(d\)/.test(main) && /sheet\.fromPackage/.test(main), "the choices of the «Scheda» name the package a sheet comes from");
ok(/sheet\.notVendoredMissing/.test(main), "a study's sheet not here, with packages missing: said, with Estensioni…");
const wanted = Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(main)?.[1]);
const level = Number(/^BRIDGE_LEVEL = (\d+)/m.exec(bridge)?.[1]);
ok(wanted >= 80 && level >= 80 && wanted === level, "the bridge level 80 (or later) on both sides");
for (const k of ["ext.formVerified", "ext.formUnverified", "ext.formRefused", "sheet.footPackage", "sheet.fromPackage", "sheet.notVendoredMissing"])
  eq((i18n.match(new RegExp(`"${k.replace(".", "\\.")}":`, "g")) ?? []).length, 2, `${k}: EN and IT`);
ok(!/ext\.formNotCompiled/.test(i18n + main), "the old «not stratigraph-templates' form» line is gone");
const bb = fs.readFileSync(path.join(SRC, "../../apps/desktop/build-bridge.sh"), "utf8");
ok(/--hidden-import stratigraph_templates\.packages/.test(bb), "the desktop sidecar bundles the verifier");
const vend = JSON.parse(fs.readFileSync(path.join(SRC, "../../tools/vendor/VENDORED.json"), "utf8"));
ok(vend.stratigraph_templates.files["packages.py"], "the vendored stratigraph_templates has packages.py");

// ── the bridge, in Python, on em-profiles' examples ─────────────────────────
const S3D = process.env.S3D ?? path.resolve(SRC, "../../../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(py)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "package-sheets-"));
  const code = `
import json, sys, os, shutil, hashlib, pathlib
sys.path.insert(0, sys.argv[2])
import em_extensions as X
EX = pathlib.Path(sys.argv[3]); T = pathlib.Path(sys.argv[1])
out = {}
def copy(name):
    d = T / name; shutil.copytree(EX / "esempio-statuaria-misto", d); return d
def restamp(d, form):
    m = d / "data" / "profile.json"; t = m.read_text()
    old = json.loads(t)["forms"][0]["digest"]; new = "sha256:" + hashlib.sha256(form.read_bytes()).hexdigest()
    m.write_text(t.replace(old, new))
# a good archive
s, r = X.post("/extensions/preview", {"path": str(EX / "esempio-statuaria-misto")})
pv = r["preview"]
out["good_preview"] = [s, pv["data"].get("installable"), [w["code"] for w in pv.get("warnings") or [] if w["code"].startswith("form_")]]
# an archive whose sheet was edited after compiling (and its file digest stamped again: only the content digest says it)
bad = copy("edited"); f = bad / "data/forms/stat-scheda-superficie/0.1.0.json"
d = json.loads(f.read_text()); d["visual"]["fields"][0]["labels"]["it"] = "US (MANOMESSA)"; f.write_text(json.dumps(d, indent=2, ensure_ascii=False))
restamp(bad, f)
s, r = X.post("/extensions/preview", {"path": str(bad)})
pv = r["preview"]
out["bad_preview"] = [s, pv["data"].get("installable"), [e["code"] for e in pv["data"].get("errors") or []], bool([e for e in pv["data"]["errors"] if e["it"]])]
s, r = X.post("/extensions/install", {"path": str(bad), "parts": "data"})
out["bad_install"] = [s, r["ok"], [p["code"] for p in r["problems"]]]
s, r = X.get("/extensions/installed", {})
out["after_bad"] = [x["id"] for x in r["extensions"]]
# the good one installed: the overlay gives the sheet verified, with its vocabularies
s, r = X.post("/extensions/install", {"path": str(EX / "esempio-statuaria-misto"), "parts": "data"})
out["good_install"] = s
s, r = X.post("/profiles/overlay", {"declared": [], "lang": "it"})
fo = r["overlay"]["forms"]["stat-scheda-superficie"]
out["overlay"] = [s, fo["verified"], fo["compiled_doc"]["header"]["id"], fo.get("compiled_problems"),
                  [(v["scheme"], len(v["concepts"]), v["installed"]) for v in fo["vocabularies"]],
                  [c["labels"] for c in fo["vocabularies"][0]["concepts"] if c["concept"].endswith("/integrazione")]]
# the installed copy edited by hand: not offered any more
inst = pathlib.Path(fo["compiled_path"]); d = json.loads(inst.read_text()); d["header"]["version"] = "0.9.9"; inst.write_text(json.dumps(d))
s, r = X.post("/profiles/overlay", {"declared": [], "lang": "it"})
fo = r["overlay"]["forms"]["stat-scheda-superficie"]
out["edited_installed"] = [s, fo["verified"], "compiled_doc" in fo, [p["code"] for p in fo["compiled_problems"]]]
X.post("/extensions/remove", {"id": "esempio-statuaria", "part": "all"})
# a placeholder that is not a compiled definition (0.2's first example): a warning, the data go in, the sheet not offered
ph = copy("placeholder"); f = ph / "data/forms/stat-scheda-superficie/0.1.0.json"
f.write_text(json.dumps({"id": "stat-scheda-superficie", "version": "0.1.0", "fields": []}))
restamp(ph, f)
s, r = X.post("/extensions/preview", {"path": str(ph)})
pv = r["preview"]
out["ph_preview"] = [s, pv["data"].get("installable"), [w["code"] for w in pv.get("warnings") or [] if w["code"].startswith("form_")]]
s, r = X.post("/extensions/install", {"path": str(ph), "parts": "data"})
s2, r2 = X.post("/profiles/overlay", {"declared": [], "lang": "en"})
fo = r2["overlay"]["forms"]["stat-scheda-superficie"]
out["ph_install"] = [s, fo["verified"], [p["code"] for p in fo["compiled_problems"]], fo["compiled_problems"][0]["en"]]
print(json.dumps(out))`;
  const env = { ...process.env, PYTHONPATH: path.join(S3D, "src"),
    S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"), S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"),
    S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"), EM_VOCABULARIES_DIR: path.join(dir, "vocab") };
  const out = JSON.parse(execFileSync(py, ["-c", code, dir, path.resolve(SRC, "../../tools"), path.join(PROFILES, "examples")], { env }).toString());
  eq(out.good_preview, [200, true, []], "bridge · a good archive: data installable, no sheet warning");
  eq(out.bad_preview.slice(0, 3), [200, false, ["form_content_digest"]], "bridge · a sheet edited after compiling: the data not installable, said");
  ok(out.bad_preview[3], "…in Italian too");
  eq(out.bad_install, [422, false, ["form_content_digest"]], "bridge · its install refused");
  eq(out.after_bad, [], "…nothing installed");
  eq(out.good_install, 200, "bridge · the good archive installed");
  eq(out.overlay.slice(0, 4), [200, true, "stat-scheda-superficie", null], "bridge · the overlay: the sheet verified and given");
  eq(out.overlay[4], [["stat:fase-superficie", 3, true], ["stat:lavorazione", 3, true]],
     "…with its package's two schemes, their concepts from the vocabulary manager");
  eq(out.overlay[5], [{ en: "restoration infill", it: "integrazione di restauro" }], "…labels in the sheet's languages");
  eq(out.edited_installed, [200, false, false, ["form_file_digest", "form_content_digest", "form_version"]],
     "bridge · the installed copy edited by hand: not offered, the three reasons");
  eq(out.ph_preview, [200, true, ["form_not_compiled"]], "bridge · a placeholder: a warning, the data installable");
  eq(out.ph_install.slice(0, 3), [200, false, ["form_not_compiled"]], "…installed, the sheet not offered");
  ok(/not a definition compiled by stratigraph-templates|not a compiled/.test(out.ph_install[3]), "…said in English");
  fs.rmSync(dir, { recursive: true, force: true });
} else {
  console.log("  (s3Dgraphy's .venv not found: the bridge part skipped)");
}

console.log(`check-package-sheets: ${checks} checks green`);
