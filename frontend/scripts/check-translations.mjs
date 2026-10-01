// TRADUZIONI · executable check of the translations, the review and the language.
//
//   node scripts/check-translations.mjs
//
// The translation is a NODE (s3Dgraphy dev26, decision of E.D. 1 Oct 2026):
// `TranslationNode` + `has_translation`, signed by `has_author`, from an edition
// by `extracted_from`, closed by `validated_by`/`validated_at`. EMStudio mirrors
// `api.add_translation` / `api.text` / `api.to_review` / `api.verify` in
// `translation.ts` + `ai-validation.ts`; this file runs the scenario of
// `tools/translations_golden.py` (Vitruvius, D.04) with the mirror and compares,
// step by step, with the golden s3Dgraphy wrote (`testdata/translations-golden.json`).
//
// Sections:
//   1. the mirror against the golden (ids, data, edges, to_review, text, refusals)
//   2. the marker: which fields are natural language, read from the datamodel
//   3. the language cascade (node → study), and declaring it, with undo
//   4. on the real store: one gesture one undo step; the review vocabulary is one
//   5. the «Verificati» rows: what, by whom (ORCID), when
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const SRC = new URL("../src/", import.meta.url).pathname;
const TD = new URL("../testdata/", import.meta.url).pathname;
const globPlugin = {
  name: "glob",
  setup(build) {
    build.onLoad({ filter: /\/src\/icons\.ts$/ }, (args) => {
      const text = readFileSync(args.path, "utf8").replace(
        /import\.meta\.glob\(\s*"\.\/assets\/([^/]+)\/\*\.(\{[^}]+\}|\w+)"[\s\S]*?\}\)/g,
        (_m, dir, ext) => {
          const exts = ext.startsWith("{") ? ext.slice(1, -1).split(",") : [ext];
          const files = readdirSync(`${SRC}assets/${dir}`).filter((f) => exts.some((e) => f.endsWith(`.${e}`)));
          return JSON.stringify(Object.fromEntries(files.map((f) => [`./assets/${dir}/${f}`, `url:${f}`])));
        });
      return { contents: text, loader: "ts" };
    });
  },
};
async function load(contents) {
  const bundle = await esbuild.build({
    stdin: { contents, resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false,
    plugins: [globPlugin], loader: { ".svg": "text", ".png": "text" }, logLevel: "silent",
  });
  return import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
}

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

const M = await load(`
  export * from "./translation";
  export { needsReview, toReview, verifyNodesAs, verifiedRows, markAiAssisted, unvalidatedAi } from "./ai-validation";
  export { DocumentStore } from "./model";
`);
const golden = JSON.parse(readFileSync(`${TD}translations-golden.json`, "utf8"));
const G = Object.fromEntries(golden.steps.map((s) => [s.step, s.value]));

const LATIN = "Diastyli autem haec erit compositio, cum trium columnarum crassitudinem intercolumnio interponere possumus.";
const ITALIAN = "Questa sarà invece la composizione del diastilo: quando possiamo interporre nell'intercolumnio lo spessore di tre colonne.";
const ENGLISH = "The diastyle will be composed in this way: when we can put the thickness of three columns into the intercolumniation.";
const ORCID = "0000-0002-1825-0097";
const AT = "2026-10-01T22:00:00Z";
const scenario = () => ({ graph: { graph_id: "g1", name: "Vitruvio", data: {}, nodes: [
  { id: "d04", node_type: "document", name: "D.04", description: LATIN, data: { lang: "la" } },
  { id: "x0401", node_type: "extractor", name: "D.04.01", description: "Intercolumnium diastil or areostil can result in a wooden lintel", data: {} },
  { id: "ed", node_type: "document", name: "D.21", description: "Vitruvio, De architectura, a cura di P. Gros (Einaudi 1997)", data: {} },
  { id: "ed_au", node_type: "author", name: "Emanuel Demetrescu", description: "", data: { orcid: ORCID } },
  { id: "ai1", node_type: "author_ai", name: "anthropic · claude", description: "", data: { provider: "anthropic", model: "claude" } },
], edges: [] } });

const STAMPS = new Set(["created_by", "created_at", "modified_by", "modified_at", "field_clocks"]);
const tnode = (store, tid) => {
  const n = store.node(tid);
  const data = Object.fromEntries(Object.entries(n.data).filter(([k]) => !STAMPS.has(k)));
  const edges = store.doc.graph.edges.filter((e) => e.source === tid || e.target === tid)
    .map((e) => [e.source, e.target, e.edge_type]).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
  return { id: n.id, node_type: n.node_type, name: n.name, data, edges };
};
const review = (doc) => M.toReview(doc).map((r) => ({ node: r.node, reasons: r.reasons, of: r.of ?? null,
  field: r.field ?? null, lang: r.lang ?? null, method: r.method ?? null })).sort((a, b) => a.node < b.node ? -1 : 1);
const refused = (fn) => { try { fn(); return "accepted"; } catch (e) { return e instanceof M.TranslationError ? "refused" : `threw ${e}`; } };

/** `api.text(graph, node, field, lang)` — the mirror, in this check: the
 *  interface's `textIn` is the same function (section 1 holds it). */
const text = (doc, node, lang) => { const r = M.textIn(doc, node, "description", lang); return { text: r.text, lang: r.lang, original: r.original, translation: r.translation, reasons: r.reasons }; };

// ── 1 · the mirror ───────────────────────────────────────────────────────────
eq(M.TRANSLATION_NS, golden.ns, "1 · the uuid5 namespace is the library's");
eq([M.textDigest("café"), M.textDigest("café")], G["digest of the same text composed two ways"], "1 · NFC: one digest for é in one code point or two");
eq(M.textDigest(LATIN), G["digest of the Latin"], "1 · the digest of the Latin");
{
  const store = new M.DocumentStore(scenario());
  const it = M.addTranslation(store, "d04", "description", "it", ITALIAN, { by: "ed_au", method: "edition", edition: "ed" }, M.markAiAssisted);
  eq(tnode(store, it), G["italian from the edition"], "1 · italian from the edition: id, data, edges");
  const again = M.addTranslation(store, "d04", "description", "it", ITALIAN, { by: "ed_au", method: "edition", edition: "ed" }, M.markAiAssisted);
  eq([again === it, store.doc.graph.nodes.filter((n) => n.node_type === "translation").length], G["the same translation twice is one node"], "1 · twice is one node");
  const en = M.addTranslation(store, "d04", "description", "en", ENGLISH, { by: "ed_au", method: "ai", ai: "ai1", model: "claude" }, M.markAiAssisted);
  eq(tnode(store, en), G["english with AI"], "1 · english with AI: the marker, no edge to the model");
  eq(review(store.doc), G["to review after the two"], "1 · to_review after the two");
  eq(text(store.doc, "d04", "en"), G["text in en (AI, waiting)"], "1 · text en");
  eq(text(store.doc, "d04", "it"), G["text in it"], "1 · text it");
  eq(text(store.doc, "d04", "la"), G["text in la (the original)"], "1 · text la");
  eq(text(store.doc, "d04", "fr"), G["text in fr (none: the original)"], "1 · text fr");
  const me = { orcid: ORCID, label: "Emanuel Demetrescu", verified: true };
  const v = M.verifyNodesAs(store, [en], me, AT);
  eq(v, { verified: [en] }, "1 · verify signs the AI translation");
  const n = store.node(en);
  eq({ validated_by: n.data.validated_by, validated_at: n.data.validated_at }, G["english verified"], "1 · validated_by is the AuthorNode of the ORCID (found, not duplicated)");
  eq(review(store.doc), G["to review after the verification"], "1 · nothing left after the verification");
  eq(M.verifyNodesAs(store, [it], me, AT).verified.length ? "accepted" : "refused", G["verify what waits for nothing"], "1 · verifying what waits for nothing writes nothing");
  const rev = M.addTranslation(store, "x0401", "description", "it", "L'intercolumnio diastilo o areostilo può dare un architrave di legno", { by: "ed_au", review: true, fromLang: "en" }, M.markAiAssisted);
  eq(tnode(store, rev), G["a manual translation asking for a review"], "1 · a manual translation asking for a review");
  eq(review(store.doc), G["to review with the review asked"], "1 · to_review with the review asked");
  store.updateNode("d04", { description: LATIN + " Eustyli autem est explicanda ratio." });
  eq(review(store.doc), G["to review after the original changed"], "1 · the original changed: both translations of D.04 are «da riallineare»");
  eq(text(store.doc, "d04", "it"), G["text in it after the change"], "1 · text it after the change says stale");
  // «da riallineare» is NOT closed by a signature…
  M.verifyNodesAs(store, [it], me, AT);
  ok(M.needsReview(store.doc, it).includes("stale"), "1 · a signature does not close «da riallineare»");
  // …only by bringing the translation in line with the new text
  M.updateTranslation(store, it, ITALIAN + " Ora si spieghi la regola dell'eustilo.", { by: "ed_au" });
  eq(M.needsReview(store.doc, it), [], "1 · updating the translation closes «da riallineare»");
  eq(store.node(it).data.source_digest, M.textDigest(store.node("d04").description), "1 · the digest is the original's of today");
  M.updateTranslation(store, en, ENGLISH + " Now the rule of the eustyle.", {});
  eq(M.needsReview(store.doc, en), ["ai"], "1 · an edited AI translation waits again: the signature was on another text");
}
{
  const store = new M.DocumentStore(scenario());
  const refusals = {
    "name": refused(() => M.addTranslation(store, "d04", "name", "it", "x", { by: "ed_au" })),
    "same language": refused(() => M.addTranslation(store, "d04", "description", "la", "x", { by: "ed_au" })),
    "no source language": refused(() => M.addTranslation(store, "x0401", "description", "it", "x", { by: "ed_au" })),
    "empty": refused(() => M.addTranslation(store, "d04", "description", "it", "  ", { by: "ed_au" })),
    "bad tag": refused(() => M.addTranslation(store, "d04", "description", "italiano", "x", { by: "ed_au" })),
    "edition not a document": refused(() => M.addTranslation(store, "d04", "description", "it", "x", { by: "ed_au", method: "edition", edition: "ed_au" })),
    "ai without its model": refused(() => M.addTranslation(store, "d04", "description", "en", "x", { by: "ed_au", method: "ai" })),
    "unknown author": refused(() => M.addTranslation(store, "d04", "description", "it", "x", { by: "nobody" })),
  };
  eq(refusals, G["refusals"], "1 · the refusals are the library's");
  eq(store.doc.graph.nodes.length, 5, "1 · a refusal writes nothing");
  eq(store.undoDepth, 0, "1 · …not even an undo step");
}

// ── 2 · the marker ───────────────────────────────────────────────────────────
{
  const tm = JSON.parse(readFileSync(`${TD}TempluMare.em.json`, "utf8"));
  const types = [...new Set(tm.graph.nodes.map((n) => n.node_type))];
  const marked = types.filter((t) => M.isNaturalLanguage({ id: "x", node_type: t }, "description"));
  eq(marked.sort(), types.filter((t) => t !== "translation").sort(), "2 · description is natural language on every node type of TempluMare (Node.properties.description, inherited)");
  ok(!M.isNaturalLanguage({ id: "x", node_type: "document" }, "name"), "2 · the name never");
  ok(!M.isNaturalLanguage({ id: "x", node_type: "translation" }, "description"), "2 · a translation is not translated");
  ok(M.isNaturalLanguage({ id: "x", node_type: "property", name: "intervention_history", data: { property_type: "intervention_history" } }, "value"), "2 · the value of intervention_history is (qualia 1.6.5)");
  ok(!M.isNaturalLanguage({ id: "x", node_type: "property", name: "inventory_number", data: { property_type: "inventory_number" } }, "value"), "2 · inventory_number is a code");
  ok(M.unreconciledVocabulary({ id: "p", node_type: "property", name: "material_type", data: { property_type: "material_type" } }), "2 · a material_type label without an exact authority is unreconciled");
  ok(!M.unreconciledVocabulary({ id: "p", node_type: "property", name: "material_type", data: { property_type: "material_type", authority_refs: [{ uri: "http://vocab.getty.edu/aat/300011176", match: "exact" }] } }), "2 · …and reconciled with skos:exactMatch");
  ok(!M.unreconciledVocabulary({ id: "p", node_type: "property", name: "Dimension.height", data: { property_type: "string" } }), "2 · a measure is not a vocabulary");
}

// ── 3 · the cascade, and declaring it ────────────────────────────────────────
{
  const store = new M.DocumentStore(scenario());
  eq(M.originalLanguage(store.doc, store.node("d04")), { lang: "la", from: "node" }, "3 · D.04 declares Latin");
  eq(M.originalLanguage(store.doc, store.node("x0401")), { lang: null, from: null }, "3 · an extractor with no lang and no study: none, never guessed");
  M.declareStudyLanguage(store, "en");
  eq(M.workingLanguage(store.doc), "en", "3 · the study's working language is on the graph-self node");
  eq(M.originalLanguage(store.doc, store.node("x0401")), { lang: "en", from: "study" }, "3 · …and the extractor takes it from the study");
  const depth = store.undoDepth;
  M.declareNodeLanguage(store, "x0401", "it");
  eq([M.nodeLanguage(store.node("x0401")), store.undoDepth], ["it", depth + 1], "3 · declaring a node's language is one undo step");
  store.undo();
  eq(M.nodeLanguage(store.node("x0401")), null, "3 · …and undo takes it back");
  ok(refused(() => M.declareNodeLanguage(store, "x0401", "latino")) === "refused", "3 · a value that is not a tag is refused");
}

// ── 4 · one gesture, one undo step; one vocabulary ───────────────────────────
{
  const store = new M.DocumentStore(scenario());
  const d0 = store.undoDepth, n0 = store.doc.graph.nodes.length, e0 = store.doc.graph.edges.length;
  M.addTranslation(store, "d04", "description", "it", ITALIAN, { by: "ed_au", method: "edition", edition: "ed" }, M.markAiAssisted);
  eq([store.undoDepth - d0, store.doc.graph.nodes.length - n0, store.doc.graph.edges.length - e0], [1, 1, 3], "4 · a translation from an edition: one undo step, one node, three edges");
  store.undo();
  eq([store.doc.graph.nodes.length, store.doc.graph.edges.length], [n0, e0], "4 · undo takes the node and its three edges");
  // an AI-made node that is not a translation reads through the same vocabulary
  store.updateNode("x0401", { data: { ai_assisted: { by: "ai1", model: "claude" } } });
  eq(M.needsReview(store.doc, "x0401"), ["ai"], "4 · unvalidated_ai and to_review are one view: an AI extractor waits with reason «ai»");
  eq(M.unvalidatedAi(store.doc).map((r) => r.node), ["x0401"], "4 · …and unvalidated_ai still says it");
}

// ── 5 · «Verificati» ─────────────────────────────────────────────────────────
{
  const store = new M.DocumentStore(scenario());
  const en = M.addTranslation(store, "d04", "description", "en", ENGLISH, { by: "ed_au", method: "ai", ai: "ai1", model: "claude" }, M.markAiAssisted);
  eq(M.verifiedRows(store.doc), [], "5 · nothing verified yet");
  M.verifyNodesAs(store, [en], { orcid: ORCID, label: "Emanuel Demetrescu" }, AT);
  eq(M.verifiedRows(store.doc).map((r) => ({ node: r.node, what: r.what, orcid: r.orcid, at: r.at })),
     [{ node: en, what: ["ai"], orcid: ORCID, at: AT }], "5 · what, by whom (ORCID), when");
}

// ── dev27 · E5 · data.lang at birth (s3Dgraphy rule A1) ─────────────────────
//
// A node with free text born in EMStudio — the store, an import's volatile
// nodes, a peer's CRDT add_node — carries data.lang: the study's at that
// moment (or the one it already declares), also when equal to the study's.
// Unknown → nothing. Resources (their data.lang is their content's),
// translations, the graph-self node and places are not stamped.
{
  const C = await load(`export * from "./crdt";`);
  const doc = () => ({ graph: { graph_id: "g5", name: "Nascita", data: {}, nodes: [
    { id: "root", node_type: "graph", name: "Graph", description: "", data: { language: "it" } }], edges: [] } });
  const store = new M.DocumentStore(doc());
  const us = store.addNode({ id: "us1", node_type: "US", name: "US 1", description: "strato", data: {} });
  eq(store.node(us.id).data.lang, "it", "E5 · a node born in an it study is born it");
  const res = store.addNode({ id: "r1", node_type: "resource", name: "scan.pdf", description: "", data: { url: "scan.pdf" } });
  ok(!("lang" in store.node(res.id).data), "E5 · a resource is not born in the study's language (its data.lang is its content's)");
  const own = store.addNode({ id: "us2", node_type: "US", name: "US 2", description: "layer", data: { lang: "en" } });
  eq(store.node(own.id).data.lang, "en", "E5 · a node that declares its language keeps it");
  store.updateNode("root", { data: { language: "en" } });
  const us3 = store.addNode({ id: "us3", node_type: "US", name: "US 3", description: "collapse", data: {} });
  eq([store.node("us1").data.lang, store.node(us3.id).data.lang], ["it", "en"],
     "E5 · the study becomes en: what was born it stays it, the new one is born en");
  const bare = new M.DocumentStore({ graph: { graph_id: "g6", name: "x", data: {}, nodes: [], edges: [] } });
  const u = bare.addNode({ id: "u", node_type: "US", name: "U", description: "", data: {} });
  ok(!("lang" in bare.node(u.id).data), "E5 · no study language, none declared: nothing is invented");
  // an import's volatile nodes
  store.mapVolatile("aux1", [{ id: "v1", node_type: "document", name: "D.01", description: "pianta", data: {} },
                             { id: "v2", node_type: "document", name: "D.02", description: "planta", data: { lang: "es" } }], []);
  eq([store.node("v1").data.lang, store.node("v2").data.lang], ["en", "es"],
     "E5 · an import's nodes are born in the study's language, or keep the source's");
  // a peer's add_node (crdt.ts = crdt.py)
  const section = { nodes: [{ id: "root", node_type: "graph", name: "Graph", data: { language: "la" } }], edges: [] };
  C.applyOp(section, C.makeOp("add_node", { ts: AT, author: ORCID, node: { id: "p1", node_type: "US", name: "P 1" } }));
  eq(section.nodes.find((n) => n.id === "p1").data.lang, "la", "E5 · the CRDT: a new node is born in the section's study language");
  C.applyOp(section, C.makeOp("add_node", { ts: AT, node: { id: "p2", node_type: "translation", name: "t" } }));
  ok(!("lang" in (section.nodes.find((n) => n.id === "p2").data ?? {})), "E5 · …a translation is not");
  section.nodes.push({ id: "p3", node_type: "US", name: "P 3", data: { created_at: AT } });
  C.applyOp(section, C.makeOp("add_node", { ts: "2026-10-02T00:00:00Z", node: { id: "p3", node_type: "US", name: "P 3" } }));
  ok(!("lang" in section.nodes.find((n) => n.id === "p3").data), "E5 · …and a merge never writes it");
  // the access mode of an op (crdt.py parity)
  C.applyOp(section, C.makeOp("add_node", { ts: AT, author: ORCID, auth: { mode: "node_password", attested_by: "fcn" },
    node: { id: "p4", node_type: "US", name: "P 4" } }));
  eq(section.nodes.find((n) => n.id === "p4").data.created_auth, { mode: "node_password", attested_by: "fcn" },
     "E1 · an op's access mode is written beside its hand");
  const bad = C.applyOp(section, C.makeOp("update_field", { ts: "2026-10-03T00:00:00Z", author: ORCID, auth: "password",
    node_id: "p4", field: "description", value: "x" }));
  ok(!bad.applied && !section.nodes.find((n) => n.id === "p4").description, "E1 · an invalid access mode refuses the op");
}

if (fails.length) {
  console.error(`translations: ${fails.length} of ${checks} checks FAILED`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`translations: ${checks} checks passed`);
