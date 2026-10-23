// BADGE1 · executable check of the ornament (adornment) collapse.
//
//   node scripts/check-badges.mjs
//
// Same idea as check-naming.mjs: the frontend has no test runner, so the pure
// modules are bundled with the project's own esbuild and exercised in node.
// `filters.ts` (the ornament set + edge derivation, from the datamodel) and
// `adornments.ts` (the collapse) are pure — no DOM, no store — which is what
// makes this possible. This is the "verso degli archi verificato" contract.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

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
const F = await load("filters.ts");
const A = await load("adornments.ts");

let checks = 0;
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

// ── the ornament EDGE set is derived from the datamodel, verso verified ───────
{
  const set = [...F.ADORNMENT_EDGE_TYPES].sort();
  eq(set, ["has_author", "has_embargo", "has_license"],
    "ornament edges derived from the datamodel are exactly has_author/license/embargo");
  ok(!F.ADORNMENT_EDGE_TYPES.has("validated_by"),
    "validated_by (narrative endorsement, source NarrativeNode) is NOT an ornament edge");
  ok(!F.ADORNMENT_EDGE_TYPES.has("is_after"), "a stratigraphic edge is not an ornament edge");
  ok(!F.ADORNMENT_EDGE_TYPES.has("has_first_epoch"), "a temporal edge is not an ornament edge");
}

// ── the ornament NODE set is anchored to the rights family ────────────────────
{
  for (const t of ["author", "author_ai", "license", "embargo"])
    ok(F.isAdornmentNodeType(t), `${t} is an ornament node type`);
  for (const t of ["US", "USVs", "document", "property", "extractor", "epoch", "EpochNode"])
    ok(!F.isAdornmentNodeType(t), `${t} is NOT an ornament node type`);
  eq(F.nodeFamilyOf("embargo"), "rights",
    "embargo maps to the rights family (authors, licences, embargo)");
}

// helpers to drive adornmentBadges(nodes, allEdges, visibleIds)
const node = (id, node_type, name) => ({ id, node_type, name });
const edge = (id, edge_type, source, target) => ({ id, edge_type, source, target });
const vis = (nodes) => new Set(nodes.map((n) => n.id));

// ── the ornament is the TARGET, the referent the SOURCE ───────────────────────
{
  const nodes = [
    node("u1", "US", "US_1"),
    node("au", "author", "M. Rossi"),
    node("li", "license", "CC-BY"),
  ];
  const edges = [
    edge("e1", "has_author", "u1", "au"), // referent → ornament
    edge("e2", "has_license", "u1", "li"),
  ];
  const m = A.adornmentBadges(nodes, edges, vis(nodes));
  ok(m.has("u1"), "badges land on the referent (edge SOURCE), not the ornament");
  ok(!m.has("au") && !m.has("li"), "an ornament is not itself a referent");
  eq(m.get("u1").map((b) => b.kind), ["author", "license"],
    "US_1 carries an author and a license badge, in that order");
  eq(m.get("u1").map((b) => b.ornamentId).sort(), ["au", "li"],
    "each badge points at the REAL ornament node id (the click target)");
}

// ── stable order: author, author_ai, license, embargo ─────────────────────────
{
  const nodes = [
    node("u1", "US", "US_1"),
    node("em", "embargo", "until 2027"),
    node("li", "license", "CC-BY"),
    node("ai", "author_ai", "Claude"),
    node("au", "author", "M. Rossi"),
  ];
  // deliberately shuffled edge order — the sort, not the input, decides
  const edges = [
    edge("e1", "has_embargo", "u1", "em"),
    edge("e2", "has_license", "u1", "li"),
    edge("e3", "has_author", "u1", "ai"),
    edge("e4", "has_author", "u1", "au"),
  ];
  const m = A.adornmentBadges(nodes, edges, vis(nodes));
  eq(m.get("u1").map((b) => b.kind), ["author", "author_ai", "license", "embargo"],
    "badges are ordered attribution → rights → embargo, regardless of edge order");
}

// ── embargo on a licence walks through to the licence's referent ──────────────
{
  const nodes = [
    node("u1", "US", "US_1"),
    node("li", "license", "CC-BY"),
    node("em", "embargo", "until 2027"),
  ];
  const edges = [
    edge("e1", "has_license", "u1", "li"), // licence on the US
    edge("e2", "has_embargo", "li", "em"), // embargo on the LICENCE
  ];
  const m = A.adornmentBadges(nodes, edges, vis(nodes));
  eq(m.get("u1").map((b) => b.kind), ["license", "embargo"],
    "an embargo on a licence lands on the licence's own referent (the US)");
  ok(!m.has("li"), "the licence (an ornament) never hosts a badge itself");
}

// ── PDMEM1 · the PDG membership is the source; badge previews the PDG member ──
{
  // ornament is a MEMBER of the referent's PDG (is_in_paradata_nodegroup), the
  // PDG is the referent's (has_paradata_nodegroup) — resolves WITHOUT a direct
  // has_author edge, proving the PDG chain is a first-class source.
  const nodes = [
    node("u1", "US", "US_1"),
    node("pdg", "ParadataNodeGroup", "US_1_PD"),
    node("au", "author", "M. Rossi"),
  ];
  const edges = [
    edge("hp", "has_paradata_nodegroup", "u1", "pdg"),
    edge("im", "is_in_paradata_nodegroup", "au", "pdg"),
  ];
  const m = A.adornmentBadges(nodes, edges, vis(nodes));
  eq(m.get("u1")?.map((b) => b.kind), ["author"],
    "an ornament that is a PDG member badges on the PDG's referent (no has_author needed)");
  ok(!m.has("pdg"), "the PDG itself hosts no badge");

  // with BOTH the semantic edge AND the membership (what attach creates), the
  // ornament is counted ONCE, on the same referent
  const edges2 = [...edges, edge("ha", "has_author", "u1", "au")];
  const m2 = A.adornmentBadges(nodes, edges2, vis(nodes));
  eq(m2.get("u1")?.map((b) => b.ornamentId), ["au"],
    "membership + semantic edge agree → the badge appears once");
}

// ── an orphan ornament, and one whose referent is hidden, produce no badge ────
{
  const nodes = [node("u1", "US", "US_1"), node("au", "author", "orphan")];
  const m = A.adornmentBadges(nodes, [], vis(nodes));
  eq([...m.keys()], [], "an ornament with no attachment edge yields no badge");

  const nodes2 = [node("au", "author", "M. Rossi")]; // referent u1 not in the set
  const edges2 = [edge("e1", "has_author", "u1", "au")];
  const m2 = A.adornmentBadges(nodes2, edges2, vis(nodes2));
  eq([...m2.keys()], [], "a badge whose referent is not visible is dropped");
}

console.log(`badges: ${checks} checks passed`);
