// MICRO-PL09-ESTENSIONI-IN-EMSTUDIO (W6) · executable check of the window
// «Estensioni» and of what a community package adds to the page:
//   · the pure pieces (src/extensions-state.ts): a package's qualia as the
//     page's catalogue lists them, its strings, the labels of its types; the
//     prefixes the content uses and `header.profiles` for a save (the twin of
//     s3dgraphy.profiles.declare: what was declared is never dropped); the
//     filter Tutte · Pacchetti di comunità · Plugin; a row's state in words;
//   · the window (src/extensions-window.ts, linkedom): the list, the filter, the
//     file's missing packages, the confirmation's two panels with the code's
//     permissions and their reason, the buttons «Installa tutto» / «Solo i dati»
//     of a mixed package and «Installa» of a data-only one, the removal's box of
//     the vocabularies — unticked;
//   · the bridge (python, tools/em_extensions.py over s3dgraphy.extensions, W21),
//     on the examples of em-profiles in /tmp folders: preview writes nothing,
//     «Solo i dati» leaves the code out with its reason, the code installed
//     later with the trust answer, disable / enable, the removal plan, remove
//     the code (the data stay), remove the package (the vocabularies stay), the
//     overlay of a document (its qualia, strings, declared / missing).
//
//   node scripts/check-extensions.mjs
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
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const S = await load("extensions-state.ts");
const IRI = "https://w3id.org/extendedmatrix/profile/esempio-statuaria";

// ── the pure pieces ─────────────────────────────────────────────────────────
const overlay = {
  profiles: [{ name: "esempio-statuaria", iri: IRI, prefix: "stat", version: "0.1.0", example: true,
    title: { it: "Lettura stratigrafica della statuaria (ESEMPIO)", en: "Stratigraphic reading of statuary (EXAMPLE)" }, declared: false }],
  qualia: { "stat:larghezza_biorbitale": { id: "stat:larghezza_biorbitale", label: { it: "Larghezza biorbitale", en: "Biorbital width" },
    data_type: "float", units: ["m", "cm"], mapping: { iri: "http://www.cidoc-crm.org/cidoc-crm/E54_Dimension" }, profile: IRI } },
  extractor_types: { "stat:punto_volto": { id: "stat:punto_volto", label: { it: "Punto del volto", en: "Face point" } } },
  document_types: {}, combiner_types: { "stat:indice": { id: "stat:indice", label: { en: "Facial index" } } },
  file_types: {}, landmark_sets: {}, forms: {}, color_schemes: {}, visual_rules: {}, qualia_vocabularies: [], problems: [],
  strings: { "stat.posa.prossimo": "Posa il punto: {point}" }, strings_en: { "stat.posa.prossimo": "Place the point: {point}" },
};
const q = S.qualiaOf(overlay, "it");
eq(q.map((x) => [x.id, x.name, x.dataType, x.units]), [["stat:larghezza_biorbitale", "Larghezza biorbitale", "float", ["m", "cm"]]],
   "a package's quale in the catalogue: the prefixed id, the label in the page's language");
eq([q[0].category, q[0].categoryLabel], ["package:esempio-statuaria", "Lettura stratigrafica della statuaria (ESEMPIO)"],
   "…in a category named after its package");
eq(S.qualiaOf(overlay, "en")[0].name, "Biorbital width", "English label in English");
eq(S.qualiaOf(overlay, "de")[0].name, "Biorbital width", "a language the package lacks: English");
eq(S.stringsOf(overlay, "it"), { it: { "stat.posa.prossimo": "Posa il punto: {point}" }, en: { "stat.posa.prossimo": "Place the point: {point}" } },
   "the package's strings, in the language and in English");
eq([S.typeLabel(overlay, "stat:punto_volto", "it"), S.typeLabel(overlay, "stat:indice", "it"), S.typeLabel(overlay, "height", "it")],
   ["Punto del volto", "Facial index", null], "labels of the package's types (English as fallback; the core's are not the package's)");
eq(S.qualiaOf(null, "it"), [], "no overlay: nothing added");

const graph = { nodes: [
  { node_type: "US", name: "US1" },
  { node_type: "property", name: "Larghezza biorbitale", data: { property_type: "stat:larghezza_biorbitale" } },
  { node_type: "extractor", name: "D.1", data: { em_kind: "stat:punto_volto", landmark: { set: "stat:volto/12", point: "nasion" } } },
  { node_type: "property", name: "height", data: { property_type: "float" } },
], edges: [{ edge_type: "has_property" }] };
eq(S.prefixesUsed([graph]), ["stat"], "the prefixes the content uses (a property's type, an extractor's kind, a landmark set)");
eq(S.prefixesUsed([{ nodes: [{ node_type: "property", name: "http://x.org:8080" }] }]), [], "an address is not a prefix");
eq(S.declareProfiles(undefined, [graph], overlay.profiles), [{ iri: IRI, version: "0.1.0" }],
   "header.profiles: the package of a prefix used, from the overlay");
eq(S.declareProfiles([{ iri: "https://other.example/profile/x", version: "1.0.0" }], [{ nodes: [] }], overlay.profiles),
   [{ iri: "https://other.example/profile/x", version: "1.0.0" }], "a declared package not installed here is never dropped");
eq(S.declareProfiles([{ iri: IRI, version: "0.0.9" }], [graph], overlay.profiles), [{ iri: IRI, version: "0.0.9" }],
   "a declaration that covers the prefix stays as it was (the file's version)");
eq(S.declareProfiles([], [{ nodes: [{ node_type: "US" }] }], overlay.profiles), [], "no package used: nothing to write");
eq(S.declaredOf([{ iri: IRI, version: "0.1.0" }, { iri: IRI, version: "0.1.0" }, { version: "1" }, null]), [{ iri: IRI, version: "0.1.0" }],
   "the declaration normalised, twins out");
eq(S.nameOfIri(IRI + "/"), "esempio-statuaria", "a package's short name from its IRI");

// header.profiles written by the page's own container (container.ts)
const C = await load("container.ts");
const member = (header) => ({ id: "g1", doc: { header, graph: { graph_id: "g1", nodes: [], edges: [] } } });
eq(C.buildContainer({ graphs: [member({ format: "em.json", profiles: [{ iri: "x", version: "1" }] })], profiles: [{ iri: IRI, version: "0.1.0" }] }).header.profiles,
   [{ iri: IRI, version: "0.1.0" }], "the save writes header.profiles");
ok(!("profiles" in C.buildContainer({ graphs: [member({ format: "em.json", profiles: [{ iri: "x", version: "1" }] })], profiles: [] }).header),
   "…and no key when the file uses no package (as the library)");
eq(C.buildContainer({ graphs: [member({ format: "em.json", profiles: [{ iri: "x", version: "1" }] })] }).header.profiles, [{ iri: "x", version: "1" }],
   "…undefined: the member's header as it was");

const rowMixed = { id: "esempio-statuaria", kind: "mixed", data: { status: "installed", versions: ["0.1.0"] },
  code: { status: "not_installed", reason: { code: "code_user_choice", level: "warning", en: "code not installed: the user's choice (data only)", it: "codice non installato: scelta dell'utente (solo i dati)" } } };
const rowPlugin = { id: "facemesh_fit", kind: "plugin", code: { status: "installed", active: true }, data: { status: "absent" } };
const rowData = { id: "example-toolmarks", kind: "community-package", data: { status: "installed" }, code: { status: "absent" } };
eq(["all", "packages", "plugins"].map((f) => [rowMixed, rowPlugin, rowData].filter((r) => S.passesFilter(r, f)).map((r) => r.id)),
   [["esempio-statuaria", "facemesh_fit", "example-toolmarks"], ["esempio-statuaria", "example-toolmarks"], ["esempio-statuaria", "facemesh_fit"]],
   "the filter: a mixed package is both a package and a plugin");
eq(S.rowState(rowMixed).key, "ext.state.codeOut", "«codice non installato: <motivo>»");
eq(S.problemText(S.rowState(rowMixed).problem, "it"), "codice non installato: scelta dell'utente (solo i dati)", "…the reason in Italian");
eq(S.rowState({ ...rowPlugin, code: { status: "installed", active: false } }).key, "ext.state.codeOff", "a code disabled");
eq(S.rowState({ ...rowData, incomplete: true, requires_missing: [{ code: "requires_missing_data", en: "x", it: "y" }] }).key, "ext.state.incomplete", "incomplete");
eq(S.licenceText(["SPDX:CC-BY-4.0", "SPDX:EUPL-1.2"]), "CC-BY-4.0, EUPL-1.2", "licences without the SPDX: prefix");

// ── the window ──────────────────────────────────────────────────────────────
const { document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = document;
const W = await load("extensions-window.ts");
const words = (k, v) => (v ? `${k}(${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(",")})` : k);
const host = { t: words, lang: () => "it", toast: () => {}, log: () => {}, dialog: async () => ({ ok: false }),
  pickArchive: async () => null, canPickFolder: () => true, fileName: () => "Templu.em.json", openVocabularies: () => {}, afterChange: () => {} };
const fakeState = { rows: [rowMixed, rowPlugin, rowData], unavailable: false, error: null, platform: "macos-arm64",
  dirs: { extensions: "/x/ext", profiles: "/x/profiles", plugins: "/x/plugins" },
  overlay: { ...overlay, profiles: [{ ...overlay.profiles[0], declared: true }] },
  missing: [{ iri: "https://w3id.org/extendedmatrix/profile/ritratti-romani", version: "0.2.0" }] };
let box = W.extensionsContent(document, host, fakeState, () => {});
eq([...box.querySelectorAll("[data-ext-id]")].map((r) => [r.dataset.extId, r.dataset.extKind]),
   [["esempio-statuaria", "mixed"], ["facemesh_fit", "plugin"], ["example-toolmarks", "community-package"]], "the list: every kind");
ok(box.querySelector("[data-ext='install-zip']") && box.querySelector("[data-ext='install-folder']"), "install from disk: a zip, a folder (desktop)");
eq(box.querySelector("[data-ext-missing]")?.dataset.extMissing, "1", "the file's missing package said in the window");
eq(box.querySelector("[data-ext-missing-iri]")?.textContent.trim(), "ritratti-romani 0.2.0", "…by its name and version");
const mixed = box.querySelector("[data-ext-id='esempio-statuaria']");
eq(mixed.querySelector("[data-ext-state]").dataset.extState, "codeOut", "the mixed row: code not installed");
ok(mixed.querySelector("[data-ext-state]").textContent.includes("scelta dell'utente"), "…with its reason");
ok(mixed.querySelector("[data-ext-used]"), "«usato da questo file» (declared by the open document)");
ok(mixed.querySelector("[data-ext='install-code']"), "«Installa il codice…» for the code left out");
ok(!mixed.querySelector("[data-ext='remove-code']"), "no «Rimuovi il codice» when the code is not installed");
const plug = box.querySelector("[data-ext-id='facemesh_fit']");
ok(plug.querySelector("[data-ext='disable']") && plug.querySelector(".ext-unverified"), "a plugin: «Disattiva», «da disco, non verificato»");
W.setExtensionsFilter("plugins");
box = W.extensionsContent(document, host, fakeState, () => {});
eq([...box.querySelectorAll("[data-ext-id]")].map((r) => r.dataset.extId), ["esempio-statuaria", "facemesh_fit"], "filter «Plugin»");
eq(box.querySelector("[data-ext-filter='plugins']").getAttribute("aria-pressed"), "true", "…pressed");
W.setExtensionsFilter("all");
box = W.extensionsContent(document, host, { ...fakeState, unavailable: true }, () => {});
ok(box.querySelector("[data-ext-no-bridge]") && !box.querySelector("[data-ext-list]"), "no bridge (the web): said, no list");

// ── the web page: no bridge, the node's list read only ──────────────────────
{
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    if (String(url).startsWith("http://bridge")) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ ok: true, extensions: [rowData], platform: "linux-x64", dirs: {} }), { status: 200 });
  };
  const st = new S.ExtensionsState({ bridge: async () => "http://bridge", nodeBase: () => "https://node.example/em/", lang: () => "it",
    overlayChanged: () => {}, changed: () => {} });
  await st.refresh();
  eq([st.from, st.rows.map((r) => r.id), st.unavailable], ["node", ["example-toolmarks"], false], "the bridge silent: the node's packages");
  ok(asked.includes("https://node.example/em/v1/extensions/installed"), "…asked at <hub>/v1/extensions/installed");
  const inst = await st.install({ path: "/x.zip", name: "x.zip" }, "all", false);
  eq([inst.ok, asked.filter((u) => u.startsWith("https://node") && /\/extensions\/install$/.test(u)).length], [false, 0], "…an installation is never asked of the node");
  const nb = W.extensionsContent(document, host, st, () => {});
  ok(nb.querySelector("[data-ext-from-node]") && !nb.querySelector("[data-ext='install-zip']") && !nb.querySelector(".ext-acts"),
     "the node's list: said read only, no install, no actions");
  globalThis.fetch = realFetch;
}

// ── the bridge's routes over s3dgraphy.extensions, on em-profiles' examples ──
const S3D = process.env.S3D ?? path.resolve(SRC, "../../../s3Dgraphy");
const PROFILES = process.env.EM_PROFILES ?? path.resolve(SRC, "../../../em-profiles");
const py = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(py) && fs.existsSync(path.join(PROFILES, "examples/esempio-statuaria-misto"))) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extensions-"));
  const code = `
import json, sys, os
sys.path.insert(0, sys.argv[2])
import em_extensions as X
EX = sys.argv[3]
M = os.path.join(EX, "esempio-statuaria-misto")
out = {}
s, r = X.post("/extensions/preview", {"path": M})
p = r["preview"]
out["preview"] = [s, p["kind"], p["data"]["present"], p["code"]["present"], p["code"]["trust_needed"], p["code"]["permissions"], p["installed"]]
out["preview_wrote"] = sorted(os.listdir(sys.argv[1]))
out["preview_full"] = p
s, r = X.post("/extensions/install", {"path": M, "parts": "data"})
row = r["installed"]
out["data_only"] = [s, row["data"]["status"], row["code"]["status"], row["code"]["reason"]["it"]]
s, r = X.get("/extensions/installed", {})
out["installed"] = [(x["id"], x["kind"], x["data"]["status"], x["code"]["status"]) for x in r["extensions"]]
out["platform"] = r["platform"]
s, r = X.post("/profiles/overlay", {"declared": [{"iri": "${IRI}", "version": "0.1.0"}, {"iri": "https://w3id.org/extendedmatrix/profile/assente", "version": "1.0.0"}], "lang": "it"})
ov = r["overlay"]
out["overlay"] = [s, sorted(ov["qualia"]), [p["declared"] for p in ov["profiles"]], r["missing"], sorted(ov["strings"]), sorted(ov["strings_en"])]
out["overlay_full"] = ov
s, r = X.post("/extensions/install-code", {"id": "esempio-statuaria", "trust": False})
out["code_no_trust"] = [s, r["installed"]["code"]["status"]]
s, r = X.post("/extensions/install-code", {"id": "esempio-statuaria", "trust": True})
out["code_trust"] = [s, r["installed"]["code"]["status"], r["installed"]["code"].get("active")]
s, r = X.post("/extensions/disable", {"id": "esempio-statuaria"})
s2, r2 = X.get("/extensions/installed", {})
out["disabled"] = [s, r["disabled"], r2["extensions"][0]["code"].get("active")]
s, r = X.post("/extensions/enable", {"id": "esempio-statuaria"})
s2, r2 = X.get("/extensions/installed", {})
out["enabled"] = [s, r2["extensions"][0]["code"].get("active")]
s, r = X.get("/extensions/removal-plan", {"id": ["esempio-statuaria"]})
plan = r["plan"]
out["plan"] = [s, plan["code"], plan["data"]["removes_code"], len(plan["vocabularies_only_here"])]
out["plan_full"] = plan
s, r = X.post("/extensions/remove", {"id": "esempio-statuaria", "part": "code"})
s2, r2 = X.get("/extensions/installed", {})
out["remove_code"] = [s, r2["extensions"][0]["data"]["status"], r2["extensions"][0]["code"]["status"], r2["extensions"][0]["code"]["reason"]["code"]]
s, r = X.post("/extensions/remove", {"id": "esempio-statuaria", "part": "all"})
s2, r2 = X.get("/extensions/installed", {})
from s3dgraphy.authorities import packages as P
out["remove_all"] = [s, [x["id"] for x in r2["extensions"]], sorted(v["id"] for v in P.vocab_installed())]
# an archive sent as bytes (the web page): kept, so «Installa il codice…» needs no second upload
import base64, io, zipfile
buf = io.BytesIO(); z = zipfile.ZipFile(buf, "w")
for root, _, files in os.walk(M):
    for f in files:
        full = os.path.join(root, f); z.write(full, os.path.relpath(full, M))
z.close()
b64 = base64.b64encode(buf.getvalue()).decode()
s, r = X.post("/extensions/preview", {"zip_b64": b64, "name": "statuaria.zip"})
out["bytes_preview"] = [s, os.path.isdir(os.path.join(sys.argv[1], "extensions", "archives"))]
s, r = X.post("/extensions/install", {"zip_b64": b64, "name": "statuaria.zip", "parts": "data"})
s2, r2 = X.post("/extensions/install-code", {"id": "esempio-statuaria", "trust": True})
out["bytes_later"] = [s, s2, r2["installed"]["code"]["status"], os.path.basename(r["installed"]["origin"])]
X.post("/extensions/remove", {"id": "esempio-statuaria", "part": "all"})
s, r = X.post("/extensions/install", {"path": os.path.join(EX, "nessuno")})
out["bad"] = [s, r["ok"]]
s, r = X.get("/extensions/removal-plan", {"id": ["nessuno"]})
out["bad_plan"] = [s, r["problems"][0]["code"], bool(r["problems"][0]["it"])]
print(json.dumps(out))`;
  const env = { ...process.env, PYTHONPATH: path.join(S3D, "src"),
    S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"), S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"),
    S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"), EM_VOCABULARIES_DIR: path.join(dir, "vocab") };
  const out = JSON.parse(execFileSync(py, ["-c", code, dir, process.env.EM_TOOLS ?? path.resolve(SRC, "../../tools"), path.join(PROFILES, "examples")], { env }).toString());
  eq(out.preview.slice(0, 5), [200, "mixed", true, true, true], "preview of the mixed example: data and code, the trust question needed");
  eq(out.preview[5], { files: "Legge il file 3D del modello scelto per proporre i punti" }, "…a permission with its reason (D-14)");
  eq(out.preview_wrote, [], "the preview wrote nothing");
  eq(out.data_only, [200, "installed", "not_installed", "codice non installato: scelta dell'utente (solo i dati)"], "«Solo i dati»: the code out, its reason");
  eq(out.installed, [["esempio-statuaria", "mixed", "installed", "not_installed"]], "the register's row");
  ok(/^(macos|windows|linux)-/.test(out.platform), "the machine's platform");
  eq(out.overlay[0], 200, "the overlay of a document");
  eq(out.overlay[1], ["stat:altezza_facciale", "stat:area_integrazione", "stat:fase_di_superficie", "stat:indice_facciale", "stat:larghezza_biorbitale", "stat:lavorazione"], "…its qualia");
  eq(out.overlay[2], [true], "…the declared package marked");
  eq(out.overlay[3], [{ iri: "https://w3id.org/extendedmatrix/profile/assente", version: "1.0.0" }], "…the declared package not here: missing");
  ok(out.overlay[4].length && out.overlay[4].every((k) => k.startsWith("stat.")) && out.overlay[5].length, "…its strings in Italian and English");
  eq(out.code_no_trust, [200, "not_installed"], "the code without the trust answer: still out");
  eq(out.code_trust, [200, "installed", true], "the code with the trust answer: installed and enabled");
  eq(out.disabled, [200, true, false], "Disattiva");
  eq(out.enabled, [200, true], "Attiva");
  eq(out.plan, [200, { versions: ["0.2.0"] }, true, 3], "the removal plan: the code goes with the data; three vocabularies only here");
  eq(out.remove_code, [200, "installed", "not_installed", "code_removed"], "Rimuovi il codice: the data stay, the code out with its reason");
  eq(out.remove_all[1], [], "Rimuovi il pacchetto: out of the register");
  eq(out.remove_all[2].length, 3, "…its vocabularies stay on the machine (D-19)");
  eq(out.bytes_preview, [200, false], "bytes previewed: nothing kept");
  eq(out.bytes_later, [200, 200, "installed", "statuaria.zip"], "bytes installed: the archive kept, the code installed later from it");
  eq(out.bad, [422, false], "an archive that is not there: refused, said");
  eq(out.bad_plan.slice(0, 2), [422, "ext_not_installed"], "a plan for nothing installed: the library's problem…");
  ok(out.bad_plan[2], "…in Italian too");

  // the confirmation, with the library's real preview
  const pv = out.preview_full;
  const b = W.confirmButtons(pv, words);
  eq([b.ok, b.choices.map((c) => c.key)], ["ext.installAll", ["data"]], "a mixed package: «Installa tutto», «Solo i dati» (and Annulla)");
  const cb = W.confirmBody(document, host, pv);
  eq([...cb.querySelectorAll("[data-ext-panel]")].map((p) => p.dataset.extPanel), ["data", "code"], "two panels, data over code");
  eq([...cb.querySelectorAll("[data-ext-tier]")].map((l) => l.dataset.extTier), ["A", "A", "A"], "each vocabulary with its tier");
  ok(cb.querySelector("[data-ext-panel='data']").textContent.includes("ext.noCode"), "«Nessun codice: si legge in ogni strumento»");
  const codePanel = cb.querySelector("[data-ext-panel='code']");
  ok(codePanel.textContent.includes("ext.unverifiedDisk") && codePanel.textContent.includes("ext.powers"), "the code: NOT VERIFIED, from disk; the powers sentence");
  eq(codePanel.querySelector("[data-ext-perm]")?.textContent, "files — «Legge il file 3D del modello scelto per proporre i punti»", "…the permission and why");
  ok(codePanel.textContent.includes("ext.can(c=read-graph, ingest-batch)") && codePanel.textContent.includes("ext.appears(w=context.node, menu.tools)"),
   "…what it can do, where it appears (an untranslated capability or slot: its own name)");
  const dataOnly = { ...pv, kind: "community-package", code: { present: false } };
  eq([W.confirmButtons(dataOnly, words).ok, W.confirmButtons(dataOnly, words).choices], ["ext.install", []], "data only: «Installa», no trust question");
  eq(W.confirmBody(document, host, dataOnly).querySelectorAll("[data-ext-panel]").length, 1, "…one panel");
  eq(W.confirmButtons({ ok: false, errors: [{ code: "x" }], data: { present: true, installable: false }, code: { present: false } }, words).ok, null,
     "an archive that cannot install: only «Chiudi»");
  const rb = W.removalBody(document, host, out.plan_full, "all");
  const purge = rb.body.querySelector("[data-ext-purge]");
  ok(purge && purge.checked === false && rb.purge() === false, "removal: the box of the vocabularies, unticked (D-19)");
  ok(rb.body.textContent.includes("ext.vocabStay"), "…«i vocabolari restano»");
  ok(rb.body.textContent.includes("rimuovere i dati di esempio-statuaria rimuove anche il suo codice"), "…the code that goes with the data");
  eq(W.removalBody(document, host, out.plan_full, "code").body.querySelector("[data-ext-purge]"), null, "removing the code: no box");
  // the overlay the bridge answered, through the page's pieces
  const realQ = S.qualiaOf(out.overlay_full, "it");
  eq(realQ.length, 6, "the real overlay: its six qualia in the catalogue");
  ok(realQ.every((x) => x.categoryLabel === "Lettura stratigrafica della statuaria (ESEMPIO)"), "…under the package's title");
} else console.log("  (s3Dgraphy .venv or em-profiles not found: the bridge part skipped)");

console.log(`check-extensions: ${checks} checks passed`);
