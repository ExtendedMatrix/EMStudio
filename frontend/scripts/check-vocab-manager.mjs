// MICRO-PL02-GESTORE-DEI-VOCABOLARI · executable check of the vocabulary
// manager as the page sees it (src/vocab-terms.ts, src/vocab-ui.ts) and of the
// bridge's /vocab/* routes over s3dgraphy.vocabularies (tools/em_vocab.py):
//   · a label through an alignment a person VERIFIED (AAT «limestone» → ICCD
//     «calcare»), before the language the value was written in — and the same
//     as s3dgraphy.terms.value_label;
//   · the window: versions side by side with who brought each, the owner, a
//     vocabulary «installed by X, removed», tier C by hand (terms page + file),
//     a «Remove <version>» per version, the alignments, the manager's log;
//   · the bridge (python): a community package's vocabularies installed, the
//     same version with another digest refused with its warning in EN and IT,
//     a tier C stub completed by the file downloaded by hand, the release that
//     keeps, the alignments and `aligned` in /vocab/concepts.
//
//   node scripts/check-vocab-manager.mjs
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
const V = await load("vocab-terms.ts");
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const AAT = "http://vocab.getty.edu/aat/";
const ICCD = "http://dati.beniculturali.it/vocabularies/materia_e_tecnica-ra/def/";
const prop = (id, name, value, concept) => ({ id, node_type: "property", name, description: value,
  data: { value, property_type: "string", ...(concept ? { concept } : {}) } });
const lime = { concept: AAT + "300011286", label: "Limestone", lang: "en", vocabulary: "getty-aat-materials", version: "2026-11-18" };
const node = prop("p", "Material", "Limestone", lime);
const aat = { id: "getty-aat-materials", attribution: "Getty", status: "ready" };
const iccd = { id: "iccd-ra-materia", attribution: "ICCD", status: "ready" };
const limeEntry = { pref: { en: "limestone" } };
const calcare = { uri: ICCD + "031", match: "closeMatch", concept: { pref: { it: "calcare" } }, vocab: iccd };

// ── a label through a verified alignment ────────────────────────────────────
eq(V.valueLabel(node, "it", () => ({ concept: limeEntry, vocab: aat })).text, "limestone",
   "no alignment: the label of the language written");
const via = V.valueLabel(node, "it", () => ({ concept: limeEntry, vocab: aat, aligned: [calcare] }));
eq([via.text, via.lang, via.from, via.via.vocabulary, via.via.match], ["calcare", "it", "alignment", "iccd-ra-materia", "closeMatch"],
   "a verified alignment gives «calcare»");
eq(V.valueLabel(node, "en", () => ({ concept: limeEntry, vocab: aat, aligned: [calcare] })).from, "vocabulary",
   "its own label first");
eq(V.valueLabel(node, "de", () => ({ concept: limeEntry, vocab: aat, aligned: [calcare] })).text, "limestone",
   "no aligned label in German either: the language written");

// ── the window ──────────────────────────────────────────────────────────────
const { document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = document;
const U = await load("vocab-ui.ts");
const opened = [];
const host = {
  t: (k, v) => k + (v ? JSON.stringify(v) : ""), lang: () => "it", bridge: async () => "http://x", toast: () => {},
  file: () => ({ name: "v10", vocabularies: null }), setEmbed: () => {}, nodes: () => [node], link: () => {}, changed: () => {},
  pickZip: async () => null, pickFile: async () => null, openExternal: (u) => opened.push(u), log: () => {},
  dialog: async () => false, catalogUrl: () => "c", nodeCatalogUrl: () => null,
};
eq(U.whoName("extension:esempio-statuaria", host.t), "esempio-statuaria", "a package by its id");
eq(U.whoName("node:em.localhost:8443", host.t), 'vw.who.node{"host":"em.localhost:8443"}', "a node by its host");
const st = new U.VocabState(host);
st.installed = [
  { id: "esempio-statuaria.punti-volto", version: "0.2.0", tier: "A", status: "ready", license: "CC-BY-4.0", attribution: "Curatori",
    owner: "extension:esempio-statuaria", carriers: ["extension:ritratti"],
    versions: [{ version: "0.2.0", carriers: ["extension:ritratti"] }, { version: "0.1.0", carriers: ["extension:esempio-statuaria"] }] },
  { id: "orphan", version: "1", tier: "A", status: "ready", license: "CC0-1.0", attribution: "x", owner: "vocabularies",
    carriers: [], removed_carriers: ["extension:statuaria"], orphan: true, versions: [{ version: "1", carriers: [] }] },
  { id: "iaa.periods", version: "2026-10", tier: "C", status: "stub", license: "LicenseRef-IAA", attribution: "IAA", owner: "local",
    carriers: ["extension:levante"], fetch: { url: "https://example.org/p.nt", terms: "https://example.org/terms" } },
];
st.alignments = [{ name: "materials-aat-iccd", rows: 29, verified: 29 }];
st.log = [{ kind: "duplicate_kept", message: "en", message_it: "ritratti porta punti-volto 0.1.0 diverso…" }];
eq(U.versionsLine(st.installed[0], host.t), "0.2.0 (ritratti) · 0.1.0 (esempio-statuaria)", "«0.2.0 (ritratti) · 0.1.0 (statuaria)»");
const w = U.vocabContent(document, host, st);
const card = (id) => w.querySelector(`[data-vocab="${id}"]`);
eq(card("esempio-statuaria.punti-volto").querySelector("[data-vw-versions]").dataset.vwVersions, "2", "two versions side by side");
eq(card("esempio-statuaria.punti-volto").querySelector("[data-vw-owner]").dataset.vwOwner, "extension:esempio-statuaria", "the owner said");
eq(card("esempio-statuaria.punti-volto").querySelectorAll('[data-vw="remove-version"]').length, 2, "a «Remove <version>» per version");
eq(card("orphan").dataset.orphan, "1", "installed by a package now removed: it stays, said");
ok(card("iaa.periods").querySelector('[data-vw="fetch-by-hand"]'), "tier C: «Scarica in locale: scegli il file…»");
card("iaa.periods").querySelector('[data-vw="open-terms"]').dispatchEvent(new document.defaultView.Event("click"));
eq(opened, ["https://example.org/terms"], "…and the source's terms page opens outside the page");
ok(w.querySelector('[data-alignment="materials-aat-iccd"]'), "the alignments installed");
ok(w.querySelector('[data-vw="alignments-file"]'), "…and «Installa allineamenti da un file…»");
eq(w.querySelector('[data-vw-log="duplicate_kept"]').textContent, "ritratti porta punti-volto 0.1.0 diverso…", "the manager's decision, in Italian");
const sign = U.valueTermEl(document, host, Object.assign(new U.VocabState(host), {
  label: () => V.valueLabel(node, "it", () => ({ concept: limeEntry, vocab: aat, aligned: [calcare] })) }), node, true, () => {});
eq(sign.dataset.via, "iccd-ra-materia", "the Inspector's sign says the label came through the ICCD");

// ── no bridge: the reads go to the node (<hub>/v1/vocab/*) ──────────────────
{
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    if (String(url).startsWith("http://x")) throw new TypeError("Failed to fetch");
    const body = String(url).includes("/vocab/installed") ? { ok: true, dir: "vocabularies/", installed: [{ id: "getty-aat-materials", status: "ready" }] }
      : String(url).includes("/vocab/concepts") ? { ok: true, concepts: {} }
      : { ok: false, error: "not on the node" };   // alignments, log: the node does not serve them
    return { ok: true, status: 200, json: async () => body };
  };
  const nodeHost = { ...host, changed: () => {}, nodeBase: () => "https://node.example/em/" };
  const s2 = new U.VocabState(nodeHost);
  await s2.refresh();
  globalThis.fetch = realFetch;
  eq(s2.installed.map((s) => s.id), ["getty-aat-materials"], "the bridge silent: the node's vocabularies");
  eq(s2.from, "node", "…and the state says where they came from");
  ok(asked.includes("https://node.example/em/v1/vocab/installed"), "asked at <hub>/v1/vocab/installed");
}

// ── the bridge's routes over s3dgraphy.vocabularies ─────────────────────────
const S3D = process.env.S3D ?? path.resolve(SRC, "../../../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(py)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-manager-"));
  const code = `
import base64, hashlib, io, json, sys, zipfile
sys.path.insert(0, sys.argv[2])
import em_vocab as E
NS = "https://w3id.org/extendedmatrix/profile/esempio-statuaria/vocab/punti-volto/"
def ttl(extra=""):
    return ("@prefix skos: <http://www.w3.org/2004/02/skos/core#> . @prefix owl: <http://www.w3.org/2002/07/owl#> .\\n"
            f"<{NS}> a skos:ConceptScheme ; owl:versionInfo \\"0.1.0\\" .\\n"
            f"<{NS}naso> a skos:Concept ; skos:prefLabel \\"naso\\"@it .\\n" + extra).encode()
def pkg(pid, data, vocabs_extra=""):
    env = (f'schema_version = "1.0.0"\\nid = "{pid}"\\nversion = "1.0.0"\\nname = "{pid}"\\n[data]\\n'
           f'  [[data.vocabularies]]\\n  path = "vocab/pv.ttl"\\n  scheme = "{NS}"\\n  version = "0.1.0"\\n'
           f'  license = "SPDX:CC-BY-4.0"\\n  fascia = "A"\\n  digest = "sha256:{hashlib.sha256(data).hexdigest()}"\\n' + vocabs_extra)
    buf = io.BytesIO(); z = zipfile.ZipFile(buf, "w"); z.writestr("em-extension.toml", env); z.writestr("vocab/pv.ttl", data); z.close()
    return base64.b64encode(buf.getvalue()).decode()
out = {}
s, r = E.post("/vocab/install", {"zip_b64": pkg("ritratti-romani", ttl(f"<{NS}mento> a skos:Concept ; skos:prefLabel \\"mento\\"@it .\\n"))})
out["first"] = [s, r.get("extension"), r["installed"][0]["carriers"], r["warnings"]]
s, r = E.post("/vocab/install", {"zip_b64": pkg("esempio-statuaria", ttl())})
out["owner"] = [s, r["warnings"][0]["kind"], "padrone" in r["warnings"][0]["message_it"], r["installed"][0]["copy_of"]]
s, r = E.get("/vocab/installed", {})
out["installed"] = [(x["id"], x["owner"], x["carriers"]) for x in r["installed"]]
s, r = E.get("/vocab/log", {})
out["log"] = [x["kind"] for x in r["log"]]
s, r = E.post("/vocab/release", {"carrier": "extension:ritratti-romani"})
out["release"] = [s, r["orphaned"], r["removed"]]
s, r = E.get("/vocab/carried-only-by", {"carrier": ["extension:esempio-statuaria"]})
out["only"] = [x["id"] for x in r["vocabularies"]]
# tier C by hand
src = ("<https://example.org/iaa/> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2004/02/skos/core#ConceptScheme> .\\n"
       "<https://example.org/iaa/p1> <http://www.w3.org/2004/02/skos/core#prefLabel> \\"Iron Age II\\"@en .\\n").encode()
stub = {"format": "em-vocabulary-package/1", "id": "iaa-periods", "version": "2026-10", "snapshot_date": "2026-10-01", "languages": [],
        "license": "LicenseRef-IAA", "tier": "C", "attribution": "IAA", "scheme": "https://example.org/iaa/",
        "fetch": {"url": "https://example.org/iaa/p.nt", "digest": "sha256:" + hashlib.sha256(src).hexdigest(), "terms": "https://example.org/terms"}}
buf = io.BytesIO(); z = zipfile.ZipFile(buf, "w"); z.writestr("manifest.json", json.dumps(stub)); z.close()
s, r = E.post("/vocab/install", {"zip_b64": base64.b64encode(buf.getvalue()).decode()})
out["stub"] = [s, r["installed"]["status"], r["installed"]["fetch"]["terms"]]
s, r = E.post("/vocab/fetch-local", {"id": "iaa-periods", "file_b64": base64.b64encode(b"other").decode()})
out["wrong"] = [s, "refused" in r["error"]]
s, r = E.post("/vocab/fetch-local", {"id": "iaa-periods", "file_b64": base64.b64encode(src).decode()})
out["hand"] = [s, r["installed"]["status"], r["installed"]["local_copy"]]
# alignments and the aligned concepts
aat = "http://vocab.getty.edu/aat/"
al = {"alignments": [{"source": {"concept": NS + "naso"}, "match": "closeMatch", "target": {"concept": "https://example.org/iaa/p1"}, "status": "verified"}]}
s, r = E.post("/vocab/alignments/install", {"file_b64": base64.b64encode(json.dumps(al).encode()).decode(), "name": "prova"})
out["al"] = [s, r["alignments"]]
s, r = E.get("/vocab/concepts", {"uri": [NS + "naso"]})
out["aligned"] = [a["uri"] for a in r["concepts"][NS + "naso"].get("aligned", [])]
print(json.dumps(out))`;
  const out = JSON.parse(execFileSync(py, ["-c", code, dir, path.resolve(SRC, "../../tools")], {
    env: { ...process.env, EM_VOCABULARIES_DIR: path.join(dir, "v"), PYTHONPATH: path.join(S3D, "src") } }).toString());
  eq(out.first, [200, "ritratti-romani", ["extension:ritratti-romani"], []], "a community package's vocabulary installed through the bridge");
  eq(out.owner, [200, "replaced_by_owner", true, "extension:esempio-statuaria"], "the owner's copy replaces the copy, said in Italian too");
  eq(out.installed, [["esempio-statuaria.punti-volto", "extension:esempio-statuaria", ["extension:ritratti-romani", "extension:esempio-statuaria"]]],
     "one copy, two carriers, its owner");
  eq(out.log, ["replaced_by_owner"], "…and the manager's log says it");
  eq(out.release, [200, [], []], "a package gone: the vocabulary stays (another brings it)");
  eq(out.only, ["esempio-statuaria.punti-volto"], "what the box «remove also…» would list");
  eq(out.stub, [200, "stub", "https://example.org/terms"], "tier C: a stub with its terms page");
  eq(out.wrong, [422, true], "a file that is not the one named: refused");
  eq(out.hand, [200, "ready", true], "the file downloaded by hand: ready, a local copy");
  eq(out.al, [200, { name: "prova", rows: 1, verified: 1 }], "alignments installed");
  eq(out.aligned, ["https://example.org/iaa/p1"], "/vocab/concepts answers the verified aligned concepts");
} else console.log("  (s3Dgraphy .venv not found: the bridge part skipped)");

console.log(`check-vocab-manager: ${checks} checks passed`);
