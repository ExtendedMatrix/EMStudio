// MICRO-PL02 (residue of MICRO-U) · executable check of the «controlled
// vocabulary» mark beside a property in the Outliner and the Matrix
// (src/vocab-marks.ts, drawn by src/unified-outliner.ts and src/renderer.ts):
//   · ◆ a term whose vocabulary is installed (tooltip: the label in the
//     interface language · the vocabulary, the attribution, the code);
//   · ◆? a term whose vocabulary is known NOT to be installed (never when the
//     machine is not known, never when the file carries the concept);
//   · ◇ a controlled field without a concept; nothing on a free field, nothing
//     on a node that is not a property;
//   · the same reading as the Inspector's sign (`valueTermEl`), state for state;
//   · the cache answers again only when its key moves;
//   · the Outliner row draws the mark beside the property, with its words.
//
//   node scripts/check-vocab-marks.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent",
    loader: { ".json": "json", ".svg": "text", ".png": "dataurl" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = document;
globalThis.window = window;
const M = await load("vocab-marks.ts");
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const AAT = "http://vocab.getty.edu/aat/";
const prop = (id, name, value, concept) => ({ id, node_type: "property", name, description: value,
  data: { value, property_type: "string", ...(concept ? { concept } : {}) } });
const term = (uri, label, lang, vocabulary, version) => ({ concept: uri, label, lang, vocabulary, version });
const t1 = term(AAT + "300011286", "Limestone", "en", "getty-aat-materials", "2026-11-18");
const concept = { pref: { en: "limestone", it: "calcare" } };
const vocab = { id: "getty-aat-materials", attribution: "Getty AAT, ODC-By 1.0", status: "ready" };
const lookup = (uri) => (uri === t1.concept ? { concept, vocab } : null);
const words = (k, v) => k + (v ? JSON.stringify(v) : "");
const ctx = (over = {}) => ({ lang: "it", lookup, installed: new Set(["getty-aat-materials"]), embedded: null, t: words, ...over });

const linked = prop("p1", "Material", "Limestone", t1);
const missing = prop("p2", "material", "x", term("http://example.org/x", "x", "en", "not-here", "1"));
const text = prop("p3", "Material", "Limestone");
const free = prop("p4", "height", "2.3");
const unit = { id: "us1", node_type: "US", name: "US 1", data: {} };

// ── the three states, and none ──────────────────────────────────────────────
eq(M.vocabMarkState(linked, ctx()), "linked", "a term whose vocabulary is here: ◆");
eq(M.vocabMarkState(missing, ctx()), "missing", "a term whose vocabulary is not here: ◆?");
eq(M.vocabMarkState(text, ctx()), "uncontrolled", "a controlled field with text only: ◇");
eq(M.vocabMarkState(free, ctx()), null, "a free field: no mark");
eq(M.vocabMarkState(unit, ctx()), null, "not a property: no mark");
eq(M.vocabMarkState(missing, ctx({ installed: null })), "linked", "the machine not known (no bridge): never «missing»");
const emb = { used: { "not-here": { terms: { "http://example.org/x": { pref: { en: "x-thing" } } } } }, embed: true };
eq(M.vocabMarkState(missing, ctx({ embedded: emb })), "linked", "the file carries the concept: not missing");
eq(M.vocabMarkState(linked, ctx({ lookup: () => null })), "linked", "installed, its concept not asked yet: still ◆");
const bare = prop("p5", "Material", "Limestone", AAT + "300011286");
eq(M.vocabMarkState(bare, ctx()), "linked", "a bare URI with a known concept: ◆");
eq(M.vocabMarkState(bare, ctx({ lookup: () => null })), "missing", "a bare URI nobody knows: ◆?");
const linkedFree = prop("p6", "height", "2.3", t1);
eq(M.vocabMarkState(linkedFree, ctx()), "linked", "a term on any field is said (as the Inspector does)");

// ── the words ───────────────────────────────────────────────────────────────
const ml = M.vocabMarkOf(linked, ctx());
eq(ml.glyph, "◆", "◆");
ok(ml.tip.startsWith('vocabMark.linked{"label":"calcare","lang":"it","v":"getty-aat-materials"}'),
   "the label in the interface language · the vocabulary");
ok(ml.tip.includes("Getty AAT, ODC-By 1.0") && ml.tip.includes(t1.concept), "…the attribution and the code");
const mm = M.vocabMarkOf(missing, ctx());
eq([mm.glyph, mm.state], ["◆?", "missing"], "◆? missing");
ok(mm.tip.startsWith('vocabMark.missing{"label":"x","v":"not-here"}'), "…the saved label and the vocabulary missing");
const mu = M.vocabMarkOf(text, ctx());
eq([mu.glyph, mu.tip], ["◇", "vocabMark.uncontrolled"], "◇ not controlled");
eq(M.vocabMarkOf(free, ctx()), null, "a free field: nothing");
ok(M.vocabMarkOf(bare, ctx()).tip.startsWith("vocabMark.linked"), "a bare URI: the label of its concept");
const noLang = M.vocabMarkOf(prop("p7", "Material", "Limestone", { concept: t1.concept, label: "Limestone", vocabulary: "getty-aat-materials" }),
                             ctx({ lookup: () => null }));
ok(noLang.tip.startsWith("vocabMark.linkedNoLang"), "no language known: no empty «()»");

// ── the Inspector's sign, the same reading ──────────────────────────────────
const U = await load("vocab-ui.ts");
const V = await load("vocab-terms.ts");
const host = { t: words, lang: () => "it", bridge: async () => "http://x", toast: () => {}, file: () => null, setEmbed: () => {},
  nodes: () => [], link: () => {}, changed: () => {}, pickZip: async () => null, dialog: async () => false,
  catalogUrl: () => "c", nodeCatalogUrl: () => null };
const st = new U.VocabState(host);
st.installed = [{ id: "getty-aat-materials", status: "ready", attribution: vocab.attribution }];
st.lookup = lookup;
for (const n of [linked, missing, text, free]) {
  const el = U.valueTermEl(document, host, st, n, V.isControlled(n), () => {});
  const mine = M.vocabMarkState(n, ctx({ lookup: st.lookup, installed: st.installedIds() }));
  eq(mine, el ? el.dataset.state : null, `the Inspector and the mark agree on ${n.id}`);
}

// ── the cache ───────────────────────────────────────────────────────────────
const cache = new M.VocabMarkCache();
let computed = 0;
const get = (key) => cache.mark("g1", "p1", key, () => { computed++; return M.vocabMarkOf(linked, ctx()); });
get("1|0|it"); get("1|0|it"); get("1|0|it");
eq(computed, 1, "the same key: computed once");
get("2|0|it");
eq(computed, 2, "the graph changed: computed again");
get("2|1|it");
eq(computed, 3, "the vocabularies changed: computed again");
let walked = 0;
const nodes = () => { walked++; return [linked, missing, text, free, unit]; };
const m1 = cache.statesOf("g1", "k", nodes, ctx());
cache.statesOf("g1", "k", nodes, ctx());
eq(walked, 1, "the Matrix's map: one walk per key");
eq([...m1.entries()], [["p1", "linked"], ["p2", "missing"], ["p3", "uncontrolled"]], "…only the marked properties");
cache.statesOf("g1", "k2", nodes, ctx());
eq(walked, 2, "…walked again when the key moves");

// ── the Outliner row ────────────────────────────────────────────────────────
const UO = await load("unified-outliner.ts");
const O = await load("outliner-tree.ts");
const gdoc = { graph: { graph_id: "g", nodes: [linked, missing, text, free], edges: [] } };
const facts = () => ({ ...O.emptyFacts() });
const texts = { dim: { units: "Units", documents: "Documents", authors: "Authors", epochs: "Epochs", models: "Models", proxies: "Proxies",
  gis: "GIS", paradata: "Paradata", other: "Other", aux: "Aux" }, noEpoch: "No epoch", typeLabel: (t) => t, sourceNone: "Not on disk", empty: "—" };
const sources = [{ id: "f1", name: "v10.em.json", kind: "file", graphs: [{ slot: "s1", name: "v10", active: true, doc: () => gdoc, facts, aux: [] }] }];
const byId = new Map(gdoc.graph.nodes.map((n) => [n.id, n]));
const hostEl = document.createElement("div");
document.body.appendChild(hostEl);
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 0);
const span = () => document.createElement("span");
const uoOpts = { ...O.DEFAULT_OPTS, hierarchy: "alpha", dims: ["paradata"], paradata: true };
const dimKey = O.flattenOutliner({ sources, opts: uoOpts, texts, toggled: new Set() }).find((r) => r.kind === "dim").key;
const api = UO.mountUnifiedOutliner(hostEl, {
  sources: () => sources, texts: () => texts, opts: () => uoOpts,
  toggled: () => new Set([dimKey]), setToggled: () => {}, selectedId: () => null, pick: () => {}, eyeOpen: () => true, toggleEye: () => {},
  gisOpen: () => true, toggleGis: () => {}, menu: () => {}, mark: span, word: (k) => k,
  vocabMark: (r) => M.vocabMarkOf(byId.get(r.id), ctx()),
});
// linkedom has no layout: the scroll box at its top, 600 px high
Object.assign(hostEl.querySelector(".uo-scroll"), { scrollTop: 0, clientHeight: 600, offsetWidth: 0, clientWidth: 0 });
api.refresh();
const marks = Object.fromEntries([...hostEl.querySelectorAll("[data-id]")].map((row) => {
  const m = row.querySelector(".uo-vmark");
  return [row.dataset.id, m ? [m.textContent, m.dataset.vmark] : null];
}));
eq(marks, { p1: ["◆", "linked"], p2: ["◆?", "missing"], p3: ["◇", "uncontrolled"], p4: null },
   "the Outliner draws ◆ ◆? ◇ beside the controlled properties, nothing beside a free one");
const m1row = hostEl.querySelector('[data-id="p1"] .uo-vmark');
ok(m1row.title.includes("calcare") && m1row.title.includes("Getty"), "…its tooltip: the label in the interface language, the attribution");
ok(m1row.nextElementSibling?.classList.contains("uo-label"), "…beside the property's name");
api.destroy();
const srcR = (await import("node:fs")).readFileSync(`${SRC}renderer.ts`, "utf8");
ok(/state\.vocabMarks\?\.get\(/.test(srcR), "the Matrix reads the map given (no computation per frame)");

console.log(`check-vocab-marks: ${checks} checks passed`);
