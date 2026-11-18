// MICRO-U-VOCABOLARI-COME-FONT · executable check of the double value of a
// controlled field (src/vocab-terms.ts), its warnings (src/issues.ts), the
// declaration of the vocabularies in the em.json (src/container.ts) and the
// window «Vocabolari» / the sign beside a value (src/vocab-ui.ts):
//   · a file without terms writes no `vocabularies` section, byte for byte;
//   · «non controllato» on a controlled field only, «vocabolario mancante» only
//     when the machine is known not to have it, never when the file carries it;
//   · «tutti i nodi con lo stesso testo»: the same text, same quale, no term;
//   · the declaration is s3Dgraphy's, field for field (S3D=<repo>, python);
//   · the window lists the installed, the file's, the copy switch.
//
//   node scripts/check-vocab-terms.mjs
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
const K = await load("container.ts");
const I = await load("issues.ts");
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const AAT = "http://vocab.getty.edu/aat/";
const prop = (id, name, value, concept) => ({ id, node_type: "property", name, description: value,
  data: { value, property_type: "string", ...(concept ? { concept } : {}) } });
const term = (uri, label, lang, vocabulary, version) => ({ concept: uri, label, lang, vocabulary, version });

// ── the controlled fields ───────────────────────────────────────────────────
eq(V.qualeOf("Material"), "material_type", "Material stands for material_type (property_names)");
ok(V.controlledQuale("material") && V.controlledQuale("construction_technique"), "material and technique are controlled");
ok(!V.controlledQuale("height") && !V.controlledQuale("origin_type"), "a number and a closed custom list are not");

// ── the term ────────────────────────────────────────────────────────────────
const t1 = term(AAT + "300011286", "calcare", "it", "getty-aat-materials", "2026-11-18");
const linked = prop("p1", "Material", "calcare", t1);
eq(V.termOf(linked), t1, "the term is read from data.concept");
eq(V.termOf(prop("x", "Material", "x")), null, "a text value has no term");
assert.throws(() => V.makeTerm("calcare", "calcare", "it"), /URI/); checks++;
const patched = V.termPatch(prop("p2", "material", "Lead"), t1);
eq(patched.value, "Lead", "the patch leaves the word as written");
eq(patched.concept, t1, "…and adds the code");

// ── value label: installed → stored → missing ───────────────────────────────
const concept = { pref: { en: "limestone", it: "calcare", de: "Kalkstein" } };
const vocab = { id: "getty-aat-materials", attribution: "Getty", status: "ready" };
const have = (uri) => (uri === t1.concept ? { concept, vocab } : null);
eq(V.valueLabel(linked, "en", have).text, "limestone", "the label in the language asked");
eq(V.valueLabel(linked, "fr", have).text, "calcare", "no French: the label in the language written");
const miss = V.valueLabel(linked, "en", () => null);
ok(miss.missingVocabulary && miss.text === "calcare", "not installed: the saved label, the sign missing");
const emb = { used: { "getty-aat-materials": { terms: { [t1.concept]: concept }, attribution: "Getty" } }, embed: true };
const fromFile = V.valueLabel(linked, "de", () => null, emb);
ok(!fromFile.missingVocabulary && fromFile.text === "Kalkstein", "the copy in the file speaks when nothing is installed");

// ── warnings ────────────────────────────────────────────────────────────────
const nodes = [prop("a", "Material", "Limestone"), prop("b", "height", "2.3"), prop("c", "material", ""),
  linked, prop("e", "material", "x", term("http://example.org/x", "x", "en", "not-here", "1")),
  prop("f", "material", "limestone"), prop("g", "Material", "Limestone")];
const rows = V.vocabularyRows(nodes, new Set(["getty-aat-materials"]));
eq(rows.map((r) => [r.rule, r.node]), [["uncontrolled", "a"], ["vocabmissing", "e"], ["uncontrolled", "f"], ["uncontrolled", "g"]],
   "uncontrolled on controlled text, missing for a vocabulary not here");
eq(V.vocabularyRows(nodes, null).filter((r) => r.rule === "vocabmissing").length, 0, "installed unknown: no «missing»");
eq(V.sameText(nodes, nodes[0]).map((n) => n.id), ["a", "f", "g"], "same text, same quale, no term");
const iss = I.issues({ doc: { graph: { nodes, edges: [] } }, nodes, isUnit: () => false, t: (k) => k,
  vocabulary: { installed: new Set(["getty-aat-materials"]), link: { label: "link", run: () => {} }, install: { label: "inst", run: () => {} } } });
const vi = iss.filter((i) => i.rule === "uncontrolled" || i.rule === "vocabmissing");
eq(vi.map((i) => [i.rule, i.node, i.sev]), [["uncontrolled", "a", "info"], ["vocabmissing", "e", "warn"], ["uncontrolled", "f", "info"], ["uncontrolled", "g", "info"]],
   "issues: two rules, filterable; uncontrolled is a hint, missing a warning");
ok(vi.every((i) => i.fix && i.fix.kind === "button"), "each with its cure");

// ── the declaration in the em.json ──────────────────────────────────────────
const graph = (id, ns) => ({ id, doc: { header: { format: "em.json", version: "1.0" }, graph: { graph_id: id, nodes: ns, edges: [] } } });
const plain = K.buildContainer({ graphs: [graph("g1", [prop("q", "Material", "calcare")])], activeGraphId: "g1" });
ok(!("vocabularies" in plain), "no term: no section");
const installed = new Map([["getty-aat-materials", { id: "getty-aat-materials", version: "2026-11-18", snapshot_date: "2026-11-18",
  license: "ODC-By 1.0", tier: "A", attribution: "Getty", status: "ready" }]]);
const concepts = new Map([[t1.concept, concept]]);
const graphs = [{ nodes: [linked, prop("q", "Material", "Lead")] }];
const decl = V.declareVocabularies(graphs, null, installed, concepts);
eq(decl, { used: { "getty-aat-materials": { attribution: "Getty", concepts_used: 1, license: "ODC-By 1.0",
  snapshot_date: "2026-11-18", tier: "A", version: "2026-11-18", versions_used: ["2026-11-18"] } } }, "declared like a font");
const withCopy = V.declareVocabularies(graphs, { ...decl, embed: true }, installed, concepts);
eq(withCopy.used["getty-aat-materials"].terms[t1.concept].pref.de, "Kalkstein", "the copy carries every language");
const away = V.declareVocabularies(graphs, withCopy, new Map(), new Map());
eq(away, withCopy, "opened where it is not installed, saved: the copy and the declaration survive");
const c = K.buildContainer({ graphs: [graph("g1", [linked])], activeGraphId: "g1", vocabularies: withCopy });
eq(K.parseContainer(JSON.parse(JSON.stringify(c))).vocabularies, withCopy, "written and read back");

// parity with s3Dgraphy: the same graph, the same declaration
const S3D = process.env.S3D ?? path.resolve(SRC, "../../../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(py)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-terms-"));
  const nt = `<${t1.concept}> <http://www.w3.org/2004/02/skos/core#prefLabel> "limestone"@en .\n` +
             `<${t1.concept}> <http://www.w3.org/2004/02/skos/core#prefLabel> "calcare"@it .\n` +
             `<${t1.concept}> <http://www.w3.org/2004/02/skos/core#prefLabel> "Kalkstein"@de .\n`;
  fs.writeFileSync(path.join(dir, "aat.nt"), nt);
  const code = `
import json, sys, hashlib, io, zipfile
from s3dgraphy.authorities import packages as P
from s3dgraphy import terms as T
data = open(sys.argv[1] + "/aat.nt", "rb").read()
m = {"format": P.PACKAGE_FORMAT, "id": "getty-aat-materials", "version": "2026-11-18", "snapshot_date": "2026-11-18",
     "languages": [], "license": "ODC-By 1.0", "tier": "A", "attribution": "Getty", "serves": ["material_type"],
     "source": {"file": "source/aat.nt", "sha256": hashlib.sha256(data).hexdigest()}}
buf = io.BytesIO(); z = zipfile.ZipFile(buf, "w"); z.writestr("manifest.json", json.dumps(m)); z.writestr("source/aat.nt", data); z.close()
P.vocab_install(buf.getvalue())
g = json.loads(sys.stdin.read())
print(json.dumps({"plain": T.declare(g), "embed": T.declare(g, embed=True)}, sort_keys=True))`;
  const out = JSON.parse(execFileSync(py, ["-c", code, dir], {
    input: JSON.stringify(graphs), env: { ...process.env, EM_VOCABULARIES_DIR: path.join(dir, "v"), PYTHONPATH: path.join(S3D, "src") } }).toString());
  const inst = new Map([["getty-aat-materials", { id: "getty-aat-materials", version: "2026-11-18", snapshot_date: "2026-11-18",
    license: "ODC-By 1.0", tier: "A", attribution: "Getty", status: "ready", title: {}, languages: ["de", "en", "it"] }]]);
  eq(V.declareVocabularies(graphs, null, inst, concepts), out.plain, "s3Dgraphy declares the same, field for field");
  eq(V.declareVocabularies(graphs, null, inst, concepts, true), out.embed, "…and copies the same terms");
} else console.log("  (s3Dgraphy .venv not found: parity skipped)");

// ── the window «Vocabolari» and the sign beside a value ─────────────────────
const { document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = document;
const U = await load("vocab-ui.ts");
const host = {
  t: (k, v) => k + (v ? JSON.stringify(v) : ""), lang: () => "en", bridge: async () => "http://x", toast: () => {},
  file: () => ({ name: "v10", vocabularies: decl }), setEmbed: () => {}, nodes: () => nodes, link: () => {}, changed: () => {},
  pickZip: async () => null, dialog: async () => false, catalogUrl: () => "c", nodeCatalogUrl: () => null,
};
const st = new U.VocabState(host);
st.installed = [{ id: "getty-aat-materials", version: "2026-11-18", snapshot_date: "2026-11-18", tier: "A", status: "ready",
  license: "ODC-By 1.0", attribution: "Getty", languages: ["de", "en", "it"], title: { en: "AAT materials" } },
  { id: "iccd-x", version: "1", tier: "C", status: "stub", license: "x", attribution: "ICCD", languages: [] }];
const w = U.vocabContent(document, host, st);
eq([...w.querySelectorAll("[data-vocab]")].map((e) => e.dataset.vocab), ["getty-aat-materials", "iccd-x"], "the installed, listed");
ok(w.querySelector('[data-vocab="iccd-x"] [data-vw="fetch-local"]'), "a tier C stub offers «Scarica in locale»");
eq([...w.querySelectorAll("[data-used]")].map((e) => [e.dataset.used, e.dataset.state]),
   [["getty-aat-materials", "installed"], ["not-here", "missing"]], "the file's vocabularies, the missing one said");
ok(w.querySelector('[data-vw="install-missing"]'), "…with «Installa»");
ok(w.querySelector('input[data-vw="embed"]') && !w.querySelector('input[data-vw="embed"]').checked, "the copy in the file: off by default");
const signU = U.valueTermEl(document, host, st, nodes[0], true, () => {});
eq(signU.dataset.state, "uncontrolled", "a text in a controlled field: ◇");
ok(signU.querySelector("[data-vt-link]"), "…with «Collega a vocabolario…»");
eq(U.valueTermEl(document, host, st, nodes[1], false, () => {}), null, "no sign on a free field");
const signM = U.valueTermEl(document, host, st, nodes[4], true, () => {});
eq(signM.dataset.state, "missing", "a term whose vocabulary is not here: missing");

console.log(`check-vocab-terms: ${checks} checks passed`);
