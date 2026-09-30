// SPELLINGS · one relation, two spellings, one line — and the definition.
//
//   node scripts/check-spellings.mjs
//
// Connections datamodel 1.6.20 (s3Dgraphy) declares `spelling_of` on the two
// older names of the physical relations: `is_bonded_to` → `bonded_to`,
// `is_physically_equal_to` → `equals`. A spelling is ACCEPTED WHEN READ, NEVER
// WRITTEN. For EMStudio that is three facts, all read off the vendored datamodel
// rather than a list written here:
//
//   1. the connect menu offers the canonical name only (before: both, and the
//      older one FIRST — measured 2026-09-27, 12 entries US→US);
//   2. a graph carrying both spellings for a pair DRAWS ONE edge (`filteredView`
//      runs `collapseSpellings` — the document keeps both);
//   3. the duplicate test at connect time sees the relation through the spelling
//      and, when symmetric, from either end (`relationKey`).
//
// And node datamodel 1.6.9: `definition` is an ELEMENT OF THE NODE on
// StratigraphicNode, inherited by every stratigraphic subtype; the inspector
// lists what `nodeElements` returns.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const bundle = await esbuild.build({
    entryPoints: [`${SRC}${entry}`],
    bundle: true,
    format: "esm",
    write: false,
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
};
const R = await load("rules.ts");
const conn = JSON.parse(
  readFileSync(`${SRC}assets/s3Dgraphy_connections_datamodel.json`, "utf8"),
);

let checks = 0;
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// the pairs, FROM the datamodel — this file names none of them
const PAIRS = Object.entries(conn.edge_types)
  .filter(([, d]) => d.spelling_of)
  .map(([old, d]) => [old, d.spelling_of]);

// ── the datamodel is the one we think it is ──────────────────────────────────
{
  ok(PAIRS.length >= 2, `the vendored datamodel declares spellings (${PAIRS.length})`);
  eq(
    Object.fromEntries(PAIRS),
    { is_bonded_to: "bonded_to", is_physically_equal_to: "equals" },
    "today's spellings (connections 1.6.20)",
  );
}

// ── the reader: canonical name, spellings, symmetry ──────────────────────────
for (const [old, canon] of PAIRS) {
  eq(R.canonicalEdgeType(old), canon, `${old} reads as ${canon}`);
  eq(R.canonicalEdgeType(canon), canon, `${canon} is its own canonical`);
  eq([...R.edgeSpellings(old)].sort(), [canon, old].sort(), `spellings(${old})`);
  eq([...R.edgeSpellings(canon)].sort(), [canon, old].sort(), `spellings(${canon})`);
  ok(R.isSymmetricEdgeType(old) && R.isSymmetricEdgeType(canon), `${canon} is symmetric (reverse: null)`);
}
eq([...R.edgeSpellings("overlies")], ["overlies"], "a reverse is not a spelling");
ok(!R.isSymmetricEdgeType("overlies"), "overlies is directed");
ok(!R.isSymmetricEdgeType("is_after"), "is_after is directed");

// ── 1 · the menu offers the canonical name only ──────────────────────────────
{
  const us = R.allowedEdgeTypes("US", "US");
  for (const [old, canon] of PAIRS) {
    ok(us.includes(canon), `US→US offers ${canon}`);
    ok(!us.includes(old), `US→US does NOT offer the spelling ${old}`);
  }
  eq(us.length, 10, "US→US: 12 before, minus the two spellings");
  ok(R.connectValidity("US", "US") === "valid", "validation still valid");
  // every subtype that could bond still can — through the canonical name
  for (const t of ["US", "USVs", "SF", "USM"]) {
    const a = R.allowedEdgeTypes(t, "US");
    if (!a.length) continue;
    ok(!a.some((n) => conn.edge_types[n]?.spelling_of), `${t}→US offers no spelling`);
  }
}

// ── 2 · one line per relation ────────────────────────────────────────────────
const E = (id, edge_type, source, target) => ({ id, edge_type, source, target });
for (const [old, canon] of PAIRS) {
  // both spellings, same direction
  let out = R.collapseSpellings([E("a", old, "u1", "u2"), E("b", canon, "u1", "u2")]);
  eq(out.map((e) => e.id), ["b"], `${old}+${canon} A→B → one edge, the canonical one`);
  // both spellings, opposite ends: symmetric → still one bond
  out = R.collapseSpellings([E("a", canon, "u1", "u2"), E("b", old, "u2", "u1")]);
  eq(out.map((e) => e.id), ["a"], `${canon} A→B + ${old} B→A → one edge`);
  // the old spelling alone still draws (accepted when read)
  out = R.collapseSpellings([E("a", old, "u1", "u2")]);
  eq(out.map((e) => e.id), ["a"], `${old} alone still draws`);
  // different pairs stay different
  out = R.collapseSpellings([E("a", old, "u1", "u2"), E("b", canon, "u1", "u3")]);
  eq(out.length, 2, `${canon} on two different pairs → two edges`);
}
{
  // directed relations keep direction; a relation is not merged with another
  const out = R.collapseSpellings([
    E("a", "overlies", "u1", "u2"),
    E("b", "overlies", "u2", "u1"),
    E("c", "cuts", "u1", "u2"),
    E("d", "bonded_to", "u1", "u2"),
    E("e", "equals", "u1", "u2"),
  ]);
  eq(out.map((e) => e.id), ["a", "b", "c", "d", "e"], "different relations / directed reverses untouched");
  // the author's generic_connection is left alone, even with no reverse
  const g = R.collapseSpellings([
    E("g1", "generic_connection", "u1", "u2"),
    E("g2", "generic_connection", "u2", "u1"),
  ]);
  eq(g.length, 2, "generic_connection not collapsed");
  // order of first appearance, and a mixed graph of four spellings = 2 lines
  const four = R.collapseSpellings([
    E("x", "is_after", "u9", "u1"),
    E("a", "is_bonded_to", "u1", "u2"),
    E("b", "bonded_to", "u2", "u1"),
    E("c", "is_physically_equal_to", "u3", "u4"),
    E("d", "equals", "u3", "u4"),
  ]);
  eq(four.map((e) => e.id), ["x", "b", "d"], "four spellings, two pairs → two lines (+ the unrelated one)");
}

// ── 3 · the connect-time duplicate sees the relation ─────────────────────────
{
  const k = R.relationKey;
  for (const [old, canon] of PAIRS) {
    eq(k(E("", old, "u1", "u2")), k(E("", canon, "u1", "u2")), `${old} ≡ ${canon}`);
    eq(k(E("", old, "u2", "u1")), k(E("", canon, "u1", "u2")), `${old} B→A ≡ ${canon} A→B`);
  }
  ok(k(E("", "overlies", "u1", "u2")) !== k(E("", "overlies", "u2", "u1")), "a directed relation keeps its verso");
  ok(k(E("", "generic_connection", "u1", "u2")) !== k(E("", "generic_connection", "u2", "u1")),
    "generic_connection keeps the author's verso (no reverse, but not a bond)");
  // main.ts really uses it (a shape test: the gesture needs a DOM)
  const main = readFileSync(`${SRC}main.ts`, "utf8");
  ok(/vEdges = collapseSpellings\(vEdges\)/.test(main), "filteredView collapses the spellings");
  eq((main.match(/hasRelation\((store|corpus)\.doc\.graph\.edges/g) ?? []).length, 2,
    "both connect paths (canvas + corpus) test the RELATION, not the literal type");
}

// ── definition: an element of the node, inherited ────────────────────────────
{
  const fields = (t) => R.nodeElements(t).map((r) => r.field);
  for (const t of ["US", "USVs", "USVn", "SF", "VSF", "USM", "USN", "USD", "SE", "BR"]) {
    const els = R.nodeElements(t);
    if (R.classOf(t) === "Node") continue; // not a registered type in this build
    // node datamodel 1.6.12: the US also carries its genre (`stratigraphic_kind`);
    // 1.6.13: and the code it came in with (`source_code`, USS for a coating…)
    const def = els.filter((r) => r.field !== "stratigraphic_kind" && r.field !== "source_code");
    eq(def.map((r) => r.field), ["definition"], `${t} carries definition`);
    eq(def[0].value, "concept", `${t}.definition is a concept`);
    eq(def[0].em_json, "data.definition", `${t}.definition lives in data.definition`);
  }
  {
    const kind = R.nodeElements("US").find((r) => r.field === "stratigraphic_kind");
    ok(!!kind, "a US carries stratigraphic_kind (1.6.12)");
    eq(kind?.value, "enum", "stratigraphic_kind is an enum");
    eq(kind?.em_json, "data.stratigraphic_kind", "it lives in data.stratigraphic_kind");
    const code = R.nodeElements("US").find((r) => r.field === "source_code");
    eq([code?.value, code?.em_json], ["string", "data.source_code"], "a US carries source_code in data.source_code (1.6.13)");
  }
  eq(fields("EpochNode"), [], "an epoch has no definition");
  eq(fields("property"), [], "a PropertyNode has no definition");
  eq(fields("document"), [], "a document has no definition");

  const cp = R.conceptParts;
  eq(cp({ concept: "https://x.invalid/c", label: "strato di crollo" }),
    { concept: "https://x.invalid/c", label: "strato di crollo" }, "the full shape");
  eq(cp("https://x.invalid/c"), { concept: "https://x.invalid/c", label: "" }, "a bare IRI is a concept");
  eq(cp("urn:x:1"), { concept: "urn:x:1", label: "" }, "a urn is a concept");
  eq(cp("strato di crollo"), { concept: "", label: "strato di crollo" },
    "a bare word is a label — nothing invented");
  eq(cp("ftp://x"), { concept: "", label: "ftp://x" }, "Python's prefixes, exactly");
  eq(cp(undefined), { concept: "", label: "" }, "absent");
  const insp = readFileSync(`${SRC}inspector.ts`, "utf8");
  ok(/for \(const rule of nodeElements\(node\.node_type\)\)/.test(insp),
    "the inspector lists the node elements from the datamodel");
}

console.log(`spellings: ${checks} checks passed`);
