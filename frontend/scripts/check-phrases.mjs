// FRASI · executable check of the reading of `ui_phrase` (phrases.ts).
//
//   node scripts/check-phrases.mjs
//
// The book here is a FIXTURE written by hand for three edges —
// `is_after`, `has_property`, `extracted_from` — in the two shapes the sidecar
// may take. What is pinned is the chain: interface language → English → the
// preposition of before, and that a phrase missing a placeholder does not count.
// Then the direction: a «Linked to X» entry of the real menu (`linkedItems`)
// asks for the direction its link has.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * from "./phrases";
      export { linkedItems } from "./add-menu";
    `,
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);
          export const iconUrlFor = () => null; export const dtcGlyphUrl = () => null;`,
        loader: "ts",
      }));
    },
  }],
});
const M = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// ── the fixture: canonical English in the connections datamodel ──────────────
const connections = {
  edge_types: {
    is_after: { ui_phrase: { as_source: "{node} later than {x}", as_target: "{node} earlier than {x}" } },
    has_property: { ui_phrase: { as_target: "{node} of {x}" } },
    extracted_from: { ui_phrase: { as_target: "{node} for {x}" } },
    combines: {},
  },
};
// …and the sidecar, one entry in each of the two shapes, plus a broken phrase
const translations = {
  entries: {
    is_after: {
      ui_phrase: {
        as_source: { en: "{node} later than {x}", it: "{node} posteriore a {x}", validated_it: true },
        as_target: { en: "{node} earlier than {x}", it: "{node} anteriore a {x}", validated_it: true },
      },
    },
    has_property: { ui_phrase_as_target: { it: "{node} di {x}", el: "{node} του" } },
  },
};
const book = M.datamodelPhraseBook(connections, translations);
const v = { node: "US", x: "US12" };
const P = (e, dir, lang, fb = "FALLBACK") => M.linkedPhrase(book, e, dir, lang, v, fb);

eq(P("is_after", "as_source", "it"), { text: "US posteriore a US12", from: "locale" }, "is_after · it · posteriore a");
eq(P("is_after", "as_target", "it"), { text: "US anteriore a US12", from: "locale" }, "is_after · it · anteriore a");
eq(P("is_after", "as_source", "en"), { text: "US later than US12", from: "locale" }, "is_after · en");
eq(P("has_property", "as_target", "it"), { text: "US di US12", from: "locale" }, "has_property · it, the flat shape");
eq(P("has_property", "as_target", "el"), { text: "US of US12", from: "en" },
   "has_property · el: the translation lost {x}, so English answers");
eq(P("extracted_from", "as_target", "it"), { text: "US for US12", from: "en" },
   "extracted_from · it: no translation → English");
eq(P("extracted_from", "as_target", "de"), { text: "US for US12", from: "en" }, "extracted_from · de → English");
eq(P("has_property", "as_source", "it"), { text: "FALLBACK", from: "fallback" },
   "no phrase for that direction → the preposition of before");
eq(P("combines", "as_target", "it"), { text: "FALLBACK", from: "fallback" }, "an edge with no ui_phrase → fallback");
eq(P("nonexistent", "as_target", "en"), { text: "FALLBACK", from: "fallback" }, "an unknown edge → fallback");
eq(M.linkedPhrase(M.datamodelPhraseBook({}, {}), "is_after", "as_source", "it", v, "US posteriore a US12"),
   { text: "US posteriore a US12", from: "fallback" }, "an empty datamodel (today's vendored one) → fallback");

// ── direction: the menu's link → the phrase's ─────────────────────────────────
eq(M.phraseDirFor("in"), "as_source", "new → X: the new node is the source");
eq(M.phraseDirFor("out"), "as_target", "X → new: the new node is the target");
{
  // on a real US, the menu's «above» (the drawing: the new node is placed above)
  // is the incoming is_after, and the book says «later than» (MICRO-LG7: time)
  const links = M.linkedItems("matrix", "US").filter((i) => i.nodeType === "US" && i.edgeType === "is_after");
  const byRel = Object.fromEntries(links.map((i) => [i.relation, P(i.edgeType, M.phraseDirFor(i.dir), "it").text]));
  eq(byRel, { above: "US posteriore a US12", below: "US anteriore a US12" },
     "US on a US: the menu's above/below and the phrase agree on direction");
  const prop = M.linkedItems("graph", "US").find((i) => i.nodeType === "property");
  if (prop) eq(M.phraseDirFor(prop.dir), prop.dir === "out" ? "as_target" : "as_source", "property on a US: direction carried");
}

// ── the vendored datamodel today ──────────────────────────────────────────────
{
  const { readFileSync } = await import("node:fs");
  const read = (f) => JSON.parse(readFileSync(new URL(`../src/assets/${f}`, import.meta.url), "utf8"));
  const real = M.datamodelPhraseBook(read("s3Dgraphy_connections_datamodel.json"), read("datamodel_translations.json"));
  const n = ["is_after", "has_property", "extracted_from"]
    .filter((e) => real.canonical(e, "as_source") || real.canonical(e, "as_target")).length;
  console.log(`  vendored datamodel: ${n}/3 of the fixture's edges carry ui_phrase${n ? "" : " (fallback everywhere until the sync)"}`);
  // MICRO-LG7 (E.D., 22 Nov 2026): is_after says TIME, never a position — in
  // the vendored datamodel and in the interface's own fallback (add.above/below)
  const realP = (dir, lang) => M.linkedPhrase(real, "is_after", dir, lang, v, "FALLBACK").text;
  eq([realP("as_source", "it"), realP("as_target", "it")], ["US posteriore a US12", "US anteriore a US12"],
     "vendored is_after · it · posteriore a / anteriore a");
  eq([realP("as_source", "en"), realP("as_target", "en")], ["US later than US12", "US earlier than US12"],
     "vendored is_after · en · later than / earlier than");
  const i18nSrc = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");
  const pos = /"add\.(above|below)": "[^"]*\b(above|below|sopra|sotto|über|unter)\b/.exec(i18nSrc);
  eq(pos, null, "no fallback of the is_after phrase renders time as a position");
}

console.log(`check-phrases: ${checks} checks ✓`);
