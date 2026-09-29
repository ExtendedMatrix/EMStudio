// NAME1 · executable check of src/naming.ts — the paradata naming convention.
//
//   node scripts/check-naming.mjs
//
// The frontend has no test runner (see check-shape-geom.mjs), so the module is
// bundled with the project's own esbuild and exercised in node. `naming.ts` is
// pure by design — no DOM, no store, the strict-naming flag passed in — which is
// exactly what makes this possible.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}naming.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const N = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
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

// A tiny document builder: nodes as `[id, type, name]`, edges as `[type, s, t]`.
const doc = (nodes, edges = []) => ({
  graph: {
    nodes: nodes.map(([id, node_type, name]) => ({ id, node_type, name })),
    edges: edges.map(([edge_type, source, target]) => ({ edge_type, source, target })),
  },
});
const STRICT = { strictDocumentNames: true };
const LOOSE = { strictDocumentNames: false };

// ── the ordinal fills holes ──────────────────────────────────────────────────
{
  const d = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "D.10.01"], ["e3", "extractor", "D.10.03"]],
    [["extracted_from", "e1", "d1"], ["extracted_from", "e3", "d1"]],
  );
  eq(N.nextExtractorOrdinal(d, "D.10"), 2,
    "D.10.01 and D.10.03 exist → the next ordinal is the HOLE, 2");
  eq(N.nextExtractorOrdinal(d, "D.11"), 1, "a document with no extractors starts at 1");
  // ordinals are per DOCUMENT, not global
  const d2 = doc(
    [["d1", "document", "D.1"], ["d2", "document", "D.2"], ["e1", "extractor", "D.1.01"]],
    [["extracted_from", "e1", "d1"]],
  );
  eq(N.nextExtractorOrdinal(d2, "D.2"), 1, "D.2's first extractor is D.2.01, not D.2.02");
}

// ── derive: attached, unattached, already-correct ────────────────────────────
{
  const d = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "Temp1"]],
    [["extracted_from", "e1", "d1"]],
  );
  eq(N.deriveExtractorName(d, "e1"), "D.10.01", "an attached Temp gets the document's number");
  const un = doc([["e1", "extractor", "Temp1"]]);
  eq(N.deriveExtractorName(un, "e1"), null, "unattached → nothing to derive");
  // `initialName` names a node that is not in the graph YET (that is when it is
  // called), so the free name is computed against what IS there: in an empty
  // document Temp1, and beside an existing Temp1, Temp2.
  eq(N.initialName(doc([]), "extractor"), "Temp1",
    "the first extractor of an empty document is Temp1");
  eq(N.initialName(un, "extractor"), "Temp2",
    "…and Temp2 when Temp1 is already taken");
  const already = doc(
    [["d1", "document", "D.4"], ["e1", "extractor", "D.4.07"]],
    [["extracted_from", "e1", "d1"]],
  );
  eq(N.deriveExtractorName(already, "e1"), "D.4.07",
    "a valid ordinal is KEPT — checking a graph must not renumber it");
}

// ── the edge type is the one the datamodel declares ──────────────────────────
{
  eq(N.EXTRACTED_FROM, "extracted_from", "extractor → document is `extracted_from`");
  eq(N.COMBINES, "combines", "combiner → extractor is `combines`");
  // a VISUAL REFERENCE to a document must not name the extractor
  const d = doc(
    [["d1", "document", "D.9"], ["e1", "extractor", "Temp1"]],
    [["has_visual_reference", "e1", "d1"]],
  );
  eq(N.deriveExtractorName(d, "e1"), null,
    "has_visual_reference is an illustration, not a provenance: no rename");
  eq(N.computeNameStatus(d, "e1", STRICT).status, "warn",
    "…so the extractor is still an unresolved Temp");
}

// ── temp / combiner / document sequences ────────────────────────────────────
{
  const d = doc([["a", "extractor", "Temp1"], ["b", "extractor", "Temp3"]]);
  eq(N.nextTempName(d), "Temp2", "Temp fills holes too");
  const c = doc([["a", "combiner", "C.1"], ["b", "combiner", "C.2"]]);
  eq(N.deriveCombinerName(c), "C.3", "combiners are progressive");
  eq(N.nextDocumentName(doc([["a", "document", "D.1"], ["b", "document", "D.3"]])), "D.2",
    "the next free document number");
  eq(N.initialName(doc([]), "combiner"), "C.1", "a first combiner is C.1");
  eq(N.initialName(doc([]), "document"), "D.1", "a first document is D.1");
  eq(N.initialName(doc([]), "US"), null, "other types are none of this module's business");
}

// ── status: ok / warn / dup ──────────────────────────────────────────────────
{
  const good = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "D.10.01"], ["c1", "combiner", "C.1"]],
    [["extracted_from", "e1", "d1"]],
  );
  for (const id of ["d1", "e1", "c1"]) {
    eq(N.computeNameStatus(good, id, STRICT).status, "ok", `${id} is well named`);
  }
  eq(N.nameStatusMap(good, STRICT).size, 0, "a clean document reports nothing");

  // DUPLICATE wins over every other complaint
  const dup = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "D.10.01"], ["e2", "extractor", "D.10.01"]],
    [["extracted_from", "e1", "d1"], ["extracted_from", "e2", "d1"]],
  );
  const dupCheck = N.computeNameStatus(dup, "e2", STRICT);
  eq(dupCheck.status, "dup", "two nodes with one name → dup");
  eq(dupCheck.suggestion, "D.10.02", "and the suggestion is the next free ordinal");

  // an extractor whose name claims the wrong document
  const wrong = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "D.7.01"]],
    [["extracted_from", "e1", "d1"]],
  );
  const w = N.computeNameStatus(wrong, "e1", STRICT);
  eq(w.status, "warn", "a name that names another document is a warning");
  eq(w.suggestion, "D.10.01", "with the right name as the suggestion");
  ok(/D\.10/.test(w.reason), "and a reason that says which document it extracts from");

  // an unattached extractor NOT called Temp: it claims a provenance it lacks
  const claims = doc([["e1", "extractor", "D.3.01"]]);
  const cw = N.computeNameStatus(claims, "e1", STRICT);
  eq(cw.status, "warn", "an unattached extractor with a document-shaped name warns");
  eq(cw.suggestion, "Temp1", "and is offered a temporary name");

  // empty names
  eq(N.computeNameStatus(doc([["d1", "document", ""]]), "d1", STRICT).status, "warn",
    "an empty document name is a problem");
  eq(N.computeNameStatus(doc([["d1", "document", "   "]]), "d1", LOOSE).status, "warn",
    "…even with strict naming OFF, and even if it is only spaces");
}

// ── the strict-document flag ────────────────────────────────────────────────
{
  const free = doc([["d1", "document", "Rilievo Porta Marina"]]);
  eq(N.computeNameStatus(free, "d1", STRICT).status, "warn",
    "strict ON: a free-form document name warns");
  eq(N.computeNameStatus(free, "d1", STRICT).suggestion, "D.1",
    "…and suggests the next D.<n>");
  eq(N.computeNameStatus(free, "d1", LOOSE).status, "ok",
    "strict OFF: a free-form name is allowed");
  // the extractor rule derives from the document's name WHATEVER it is
  const d = doc(
    [["d1", "document", "Rilievo 2019"], ["e1", "extractor", "Temp1"]],
    [["extracted_from", "e1", "d1"]],
  );
  eq(N.deriveExtractorName(d, "e1"), "Rilievo 2019.01",
    "with a free-form document the extractor still derives from it");
  eq(N.computeNameStatus(d, "e1", LOOSE).suggestion, "Rilievo 2019.01",
    "…and that is what the extractor is offered");
}

// ── renaming a document makes its extractors inconsistent ───────────────────
{
  const before = doc(
    [["d1", "document", "D.10"], ["e1", "extractor", "D.10.01"], ["e2", "extractor", "D.10.02"]],
    [["extracted_from", "e1", "d1"], ["extracted_from", "e2", "d1"]],
  );
  eq(N.nameStatusMap(before, STRICT).size, 0, "consistent before the rename");
  // D.10 → D.11 (the id is untouched — renaming is a display-name change)
  const after = JSON.parse(JSON.stringify(before));
  after.graph.nodes.find((n) => n.id === "d1").name = "D.11";
  const map = N.nameStatusMap(after, STRICT);
  eq(map.size, 2, "renaming the document leaves BOTH extractors inconsistent");
  eq(map.get("e1").suggestion, "D.11.01", "e1 is offered D.11.01");
  eq(map.get("e2").suggestion, "D.11.01",
    "e2 is offered D.11.01 too — the suggestions are computed one at a time, " +
      "so accepting e1's first then re-checking gives e2 D.11.2");
  // prove that: accept e1's suggestion, then ask again
  after.graph.nodes.find((n) => n.id === "e1").name = "D.11.01";
  eq(N.computeNameStatus(after, "e2", STRICT).suggestion, "D.11.02",
    "after e1 takes D.11.01, e2 is offered D.11.02");
}

// ── attach is the trigger ───────────────────────────────────────────────────
{
  const d = doc([["d1", "document", "D.5"], ["e1", "extractor", "Temp1"]]);
  eq(N.renameOnAttach(d, "e1"), null, "no edge yet → nothing to rename");
  d.graph.edges.push({ edge_type: "extracted_from", source: "e1", target: "d1" });
  eq(N.renameOnAttach(d, "e1"), "D.5.01", "the edge is what names it");
  d.graph.nodes.find((n) => n.id === "e1").name = "D.5.01";
  eq(N.renameOnAttach(d, "e1"), null, "and re-attaching an already-correct name is a no-op");
  eq(N.renameOnAttach(d, "d1"), null, "a document is never renamed by this path");
}

// ── several documents on one extractor: deterministic, not arbitrary ────────
{
  const d = doc(
    [["d1", "document", "D.1"], ["d2", "document", "D.2"], ["e1", "extractor", "Temp1"]],
    [["extracted_from", "e1", "d2"], ["extracted_from", "e1", "d1"]],
  );
  eq(N.documentOfExtractor(d, "e1").name, "D.2",
    "the FIRST extracted_from edge wins, in document order — same answer every time");
}

// ── RIFINITURE · the rule is s3Dgraphy's: <source>.<NN> ───────────────────────
// The cases live in a FIXTURE (testdata/naming-extractor-rule.json), written from
// s3Dgraphy's xlsx importer (`f"{doc_short}.{counter:02d}"`,
// unified_xlsx_importer.py `_create_extractor`) — the one place s3Dgraphy names
// an extractor. Each case: a source name, how many extractors it has already,
// and the name the next one takes.
{
  const { readFileSync } = await import("node:fs");
  const fx = JSON.parse(readFileSync(new URL("../testdata/naming-extractor-rule.json", import.meta.url), "utf8"));
  for (const c of fx.cases) {
    const nodes = [["s", c.source_type, c.source]];
    const edges = [];
    for (let i = 1; i <= c.existing; i++) {
      nodes.push([`x${i}`, "extractor", `${c.source}.${N.ordinalTag(i)}`]);
      edges.push(["extracted_from", `x${i}`, "s"]);
    }
    nodes.push(["new", "extractor", "Temp1"]);
    edges.push(["extracted_from", "new", "s"]);
    eq(N.renameOnAttach(doc(nodes, edges), "new"), c.next, `fixture · ${c.why}`);
  }
  eq(N.ordinalTag(1), "01", "one digit is written with two");
  eq(N.ordinalTag(101), "101", "three when they are needed");

  // an extractor from BEFORE the rule: information, never renamed on its own
  const old = doc(
    [["d", "document", "D.3"], ["u", "USM", "USM101"],
     ["a", "extractor", "D.3.1"], ["b", "extractor", "USM101.1"], ["c", "extractor", "D.3.02"]],
    [["extracted_from", "a", "d"], ["extracted_from", "b", "u"], ["extracted_from", "c", "d"]],
  );
  const sa = N.computeNameStatus(old, "a", STRICT);
  eq([sa.status, sa.outOfRule, sa.suggestion], ["warn", true, "D.3.01"],
    "D.3.1 is out of the rule: its ORDINAL stays, only the writing changes");
  eq(N.computeNameStatus(old, "b", STRICT).suggestion, "USM101.01", "the same rule for a unit");
  eq(N.computeNameStatus(old, "c", STRICT).status, "ok", "D.3.02 is the rule");
  eq(N.nextExtractorOrdinal(old, "D.3"), 3,
    "an out-of-rule ordinal is still TAKEN: a new extractor of D.3 is D.3.03, never a second first");
  eq(N.renameOnAttach(old, "a"), "D.3.01",
    "renameOnAttach would say so — but only the attach gesture calls it, and the old node is not re-attached");
  eq(N.ruleRenames(old), [
    { id: "a", from: "D.3.1", to: "D.3.01" },
    { id: "b", from: "USM101.1", to: "USM101.01" },
  ], "«Rinomina secondo la regola» for all: the out-of-rule ones, and only those");
  eq(N.ruleRenames(old, ["b"]), [{ id: "b", from: "USM101.1", to: "USM101.01" }],
    "…or for a selection");
  // two old names on one ordinal: the renames are computed one after the other
  const twin = doc(
    [["d", "document", "D.3"], ["a", "extractor", "D.3.1"], ["b", "extractor", "D.3.001"]],
    [["extracted_from", "a", "d"], ["extracted_from", "b", "d"]],
  );
  eq(N.ruleRenames(twin).map((r) => r.to), ["D.3.02", "D.3.01"],
    "two writings of one ordinal never become one name");
}

// ── BUGS-UI · paradata group naming: PD_<referent> ──────────────────────────
{
  eq(N.paradataGroupName("US_100"), "PD_US_100", "a group is named after its referent");
  eq(N.paradataGroupName("  US_100  "), "PD_US_100", "surrounding space never reaches the label");
  eq(N.paradataGroupName(undefined), "PD", "no referent name → the bare prefix, never 'PD_undefined'");
  eq(N.paradataGroupName(""), "PD", "an empty name is not a name");

  const d = doc([["u1", "US", "US_100"], ["g1", "ParadataNodeGroup", "ParadataNodeGroup 1"]]);
  eq(N.paradataGroupRenameOnAttach(d, "g1"), null, "unattached → nothing to derive it from");
  d.graph.edges.push({
    edge_type: N.HAS_PARADATA_NODEGROUP, source: "u1", target: "g1",
  });
  eq(N.paradataGroupRenameOnAttach(d, "g1"), "PD_US_100", "the edge is what names it");
  d.graph.nodes.find((n) => n.id === "g1").name = "PD_US_100";
  eq(N.paradataGroupRenameOnAttach(d, "g1"), null, "already correct → a no-op, no toast churn");
  eq(N.paradataGroupRenameOnAttach(d, "u1"), null, "the referent itself is never renamed by this path");
}

console.log(`naming: ${checks} checks passed`);
