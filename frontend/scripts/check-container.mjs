// MULTIGRAPH · executable check of src/container.ts — a project is one file.
//
//   node scripts/check-container.mjs
//
// Same harness as the other checks: bundled with the project's own esbuild and
// exercised in node. Pure mapping + merge logic, so all of it is checkable here.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}container.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const C = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const legacyDoc = (id = "studio_a", unit = "US101") => ({
  header: { format: "em.json", version: "1.0" },
  graph: { graph_id: id, name: id, nodes: [{ id: unit, node_type: "US", name: unit }], edges: [] },
  layout: { positions: { [unit]: { x: 0, y: 0, w: 10, h: 10 } } },
});

const shelfSection = (resourceId = "res0") => ({
  graph_id: "shelf",
  name: "Shelf di progetto",
  data: { em_collection: "ShelfGraph" },
  nodes: [{ id: resourceId, node_type: "resource", name: "foto", data: { url: "/a/foto.jpg" } }],
  edges: [],
});

// ── reading both shapes ─────────────────────────────────────────────────────
{
  const legacy = legacyDoc();
  ok(!C.isContainer(legacy), "a legacy document is not a container");
  const parsed = C.parseContainer(legacy);
  eq(parsed.members.map((m) => m.id), ["studio_a"], "…and opens as a container-of-one");
  eq(parsed.wasLegacy, true, "…flagged as legacy, so a caller can say so");
  eq(parsed.shelf, null, "no shelf in an old file");
  eq(parsed.activeGraphId, "studio_a", "its only graph is the active one");
  eq(parsed.warnings, [], "and nothing to warn about");

  const notADoc = C.parseContainer({ header: {} });
  eq(notADoc.members, [], "something that is not a document yields no members");
  ok(notADoc.warnings.length === 1, "…and says why");
}

// ── writing the container ───────────────────────────────────────────────────
{
  const built = C.buildContainer({
    graphs: [{ id: "studio_a", doc: legacyDoc("studio_a", "US101") },
             { id: "studio_b", doc: legacyDoc("studio_b", "US201") }],
    shelf: shelfSection(),
    activeGraphId: "studio_b",
  });
  ok(C.isContainer(built), "what we write IS a container");
  eq(Object.keys(built.graphs).sort(), ["shelf", "studio_a", "studio_b"],
     "every slot plus the shelf — Save no longer writes one graph out of three");
  eq(built.active_graph_id, "studio_b", "the graph in front is recorded");
  eq(built.graphs.shelf.data.em_collection, "ShelfGraph",
     "the shelf keeps its marker, which is how it is recognised on reopen");
  ok(Array.isArray(built.graphs.studio_a.nodes), "nodes live in the member");

  // and it round-trips
  const reread = C.parseContainer(built);
  eq(reread.members.map((m) => m.id), ["studio_a", "studio_b"], "both graphs come back");
  ok(reread.shelf !== null, "the shelf comes back as the shelf");
  eq(reread.activeGraphId, "studio_b", "…and so does the active id");
  const again = C.buildContainer({
    graphs: reread.members.map((m) => ({ id: m.id, doc: m.doc })),
    shelf: reread.shelf,
    activeGraphId: reread.activeGraphId,
  });
  eq(JSON.stringify(again.graphs), JSON.stringify(built.graphs),
     "write → read → write lands on the same members");
}

// ── one graph is a container-of-one ─────────────────────────────────────────
{
  const built = C.buildContainer({ graphs: [{ id: "solo", doc: legacyDoc("solo") }] });
  eq(Object.keys(built.graphs), ["solo"], "one member");
  ok(C.isContainer(built), "…still a container");
  eq(C.parseContainer(built).members.length, 1, "and it reopens as one slot");
}

// ── a broken member does not lose the project ───────────────────────────────
{
  const built = C.buildContainer({ graphs: [{ id: "buono", doc: legacyDoc("buono") }] });
  built.graphs.rotto = "questo non è un grafo";
  const parsed = C.parseContainer(built);
  eq(parsed.members.map((m) => m.id), ["buono"], "the good member survives");
  ok(parsed.warnings.some((w) => w.includes("rotto")), "…and the broken one is reported");
}

// ── an active id that is not there falls back, and says so ──────────────────
{
  const built = C.buildContainer({ graphs: [{ id: "a", doc: legacyDoc("a") }] });
  built.active_graph_id = "non_esiste";
  const parsed = C.parseContainer(built);
  eq(parsed.activeGraphId, "a", "falls back to the first graph");
  ok(parsed.warnings.some((w) => w.includes("active_graph_id")), "…out loud");
}

// ── the shelf is recognised by its MARKER, not by its id ────────────────────
{
  const odd = shelfSection();
  odd.graph_id = "la_mia_libreria";           // any id
  const built = C.buildContainer({ graphs: [{ id: "a", doc: legacyDoc("a") }], shelf: odd });
  eq(Object.keys(built.graphs).sort(), ["a", "la_mia_libreria"], "written under its own id");
  const parsed = C.parseContainer(built);
  eq(parsed.members.map((m) => m.id), ["a"],
     "…and read back as the SHELF, not as a second study graph");
  ok(parsed.shelf !== null, "the shelf is where it belongs");
}

// ── integrating later: add + merge by UUID ──────────────────────────────────
{
  // mine: Porta Marina with a shared unit and one of my own
  const mine = C.parseContainer(C.buildContainer({
    graphs: [{ id: "porta_marina", doc: legacyDoc("porta_marina", "shared-uuid") }],
    shelf: shelfSection("res-condivisa"),
  }));
  mine.members[0].doc.graph.nodes.push({ id: "mine-only", node_type: "US", name: "US102" });

  // theirs: the same graph (with their own unit) plus a sector of their own
  const theirsPm = legacyDoc("porta_marina", "shared-uuid");
  theirsPm.graph.nodes.push({ id: "theirs-only", node_type: "US", name: "US103" });
  theirsPm.graph.nodes[0].description = "descrizione del collega";
  const theirs = C.parseContainer(C.buildContainer({
    graphs: [{ id: "porta_marina", doc: theirsPm },
             { id: "settore_nord", doc: legacyDoc("settore_nord", "US301") }],
    shelf: shelfSection("res-condivisa"),   // the same photograph
  }));

  const report = C.mergeContainers(mine, theirs);

  eq(mine.members.map((m) => m.id).sort(), ["porta_marina", "settore_nord"],
     "their sector arrived whole");
  eq(report.addedGraphs, ["settore_nord"], "…reported as added");
  eq(report.mergedGraphs, ["porta_marina"], "…and the shared graph as merged");
  const ids = mine.members.find((m) => m.id === "porta_marina").doc.graph.nodes.map((n) => n.id);
  eq(ids.filter((i) => i === "shared-uuid").length, 1,
     "the shared unit is ONE node — this is what the UUID ids were for");
  ok(ids.includes("mine-only") && ids.includes("theirs-only"), "both authors' work is there");
  ok(report.mergedNodes >= 1,
     "mergedNodes is reported: exactly where a divergent edit could have been overwritten");

  const shelfIds = mine.shelf.nodes.map((n) => n.id);
  eq(shelfIds.filter((i) => i === "res-condivisa").length, 1,
     "two people who collected the same photograph have ONE shelf entry");
}

// ── merging does not duplicate a relation ───────────────────────────────────
{
  const a = { nodes: [{ id: "U1" }, { id: "U2" }],
              edges: [{ id: "mio", source: "U1", target: "U2", edge_type: "is_before" }] };
  const b = { nodes: [{ id: "U1" }, { id: "U2" }],
              edges: [{ id: "loro", source: "U1", target: "U2", edge_type: "is_before" }] };
  const report = { addedGraphs: [], mergedGraphs: [], mergedNodes: 0, addedNodes: 0,
                   addedEdges: 0, conflicts: [], warnings: [] };
  C.mergeGraphSections(a, b, report);
  eq(a.edges.length, 1, "the same relation authored twice is one relation");
  eq(report.addedEdges, 0, "…and nothing was added");

  // a DIFFERENT relation between the same nodes IS added, with a free id
  const c = { nodes: [], edges: [{ id: "mio", source: "U1", target: "U2", edge_type: "cuts" }] };
  C.mergeGraphSections(a, c, report);
  eq(a.edges.length, 2, "a different edge type is a different relation");
  eq(new Set(a.edges.map((e) => e.id)).size, 2, "…and the id collision was resolved");
}

// ── P3 · the merge is DATED and the conflicts are VISIBLE ───────────────────
const ANNA = "0000-0002-1825-0097";
const BRUNO = "0000-0001-5109-3700";
const unit = (id, description, by, at) => ({
  id, node_type: "US", name: id, description,
  data: { created_by: by, created_at: at, modified_by: by, modified_at: at },
});
const section = (...nodes) => ({ graph_id: "scavo", nodes, edges: [] });
const freshReport = () => ({ addedGraphs: [], mergedGraphs: [], mergedNodes: 0,
                             addedNodes: 0, addedEdges: 0, conflicts: [],
                             removedNodes: 0, resurrectedNodes: 0, warnings: [] });

{
  // the more recent version wins
  const mine = section(unit("US1", "muro in opus", ANNA, "2026-08-13T10:00:00Z"));
  const theirs = section(unit("US1", "muro in opus reticulatum", BRUNO, "2026-08-13T11:30:00Z"));
  const r = freshReport();
  C.mergeGraphSections(mine, theirs, r);
  eq(mine.nodes[0].description, "muro in opus reticulatum", "the more recent edit wins");
  eq(r.conflicts.length, 1, "…and the contested node is listed");
  eq(r.conflicts[0].reason, "newer", "…with the reason");
  eq(r.conflicts[0].winner.by, BRUNO, "…naming who overwrote");
  eq(r.conflicts[0].loser.by, ANNA, "…and who was overwritten");
  eq(r.conflicts[0].fieldHint, ["description"], "…and where to look");
  eq(r.conflicts[0].field, "description", "…as the FIELD that was decided (P4.1)");
  eq(r.conflicts[0].loserPayload.description, "muro in opus",
     "the losing version travels with the conflict, so 'keep mine' needs no second file");
}

{
  // an OLDER incoming version does not overwrite — the case that used to be lost
  const mine = section(unit("US1", "lettura aggiornata", ANNA, "2026-08-13T12:00:00Z"));
  const theirs = section(unit("US1", "lettura di ieri", BRUNO, "2026-08-12T09:00:00Z"));
  const r = freshReport();
  C.mergeGraphSections(mine, theirs, r);
  eq(mine.nodes[0].description, "lettura aggiornata", "an older incoming edit does NOT overwrite");
  eq(r.conflicts.length, 1, "…and 'I did not overwrite you' is listed too");
  eq(r.conflicts[0].winner.side, "mine", "…saying which side won");
}

{
  // the outcome does not depend on the merge order
  const a = () => section(unit("US1", "A", ANNA, "2026-08-13T10:00:00Z"));
  const b = () => section(unit("US1", "B", BRUNO, "2026-08-13T11:30:00Z"));
  const aIntoB = b();
  C.mergeGraphSections(aIntoB, a(), freshReport());
  const bIntoA = a();
  C.mergeGraphSections(bIntoA, b(), freshReport());
  eq(aIntoB.nodes[0].description, bIntoA.nodes[0].description,
     "A into B and B into A land on the same project");
  eq(aIntoB.nodes[0].description, "B", "…the more recent one");
}

{
  // the winner keeps ITS OWN stamps — never re-stamped by whoever merged
  const mine = section(unit("US1", "mio", ANNA, "2026-08-13T10:00:00Z"));
  const theirs = section(unit("US1", "suo", BRUNO, "2026-08-13T11:30:00Z"));
  C.mergeGraphSections(mine, theirs, freshReport());
  eq(mine.nodes[0].data.modified_by, BRUNO, "the winner keeps its own hand");
  eq(mine.nodes[0].data.modified_at, "2026-08-13T11:30:00Z", "…and its own instant");
}

{
  // identical content is not a conflict, whatever the stamps say
  const mine = section(unit("US1", "uguale", ANNA, "2026-08-13T10:00:00Z"));
  const theirs = section(unit("US1", "uguale", BRUNO, "2026-08-13T11:30:00Z"));
  const r = freshReport();
  C.mergeGraphSections(mine, theirs, r);
  eq(r.mergedNodes, 1, "the node was seen twice");
  eq(r.conflicts, [], "…but nobody's work was at stake, so nothing is reported");
}

{
  // an exact tie is broken stably and DECLARED
  const mine = section(unit("US1", "A", ANNA, "2026-08-13T10:00:00Z"));
  const theirs = section(unit("US1", "B", BRUNO, "2026-08-13T10:00:00Z"));
  const r = freshReport();
  C.mergeGraphSections(mine, theirs, r);
  eq(r.conflicts[0].reason, "tie-author",
     "an exact tie says so — and names what broke it");
  eq(r.conflicts[0].winner.by, BRUNO, "…and the tie-break is the smaller iD, stably");
}

{
  // no stamps → the date did NOT decide, and that is said
  const mine = section({ id: "US1", node_type: "US", name: "US1", description: "legacy" });
  const theirs = section(unit("US1", "con timbri", BRUNO, "2026-08-13T11:30:00Z"));
  const r = freshReport();
  C.mergeGraphSections(mine, theirs, r);
  eq(r.conflicts[0].reason, "unstamped", "an absent stamp is unknown, not older");
  eq(mine.nodes[0].description, "con timbri", "…the incoming version is kept, as before");
  eq(r.conflicts[0].loser.at, null, "…and the report does not invent a date");
}

{
  // P4.1 · a field only ONE side has is KEPT — absence is not deletion.
  // The same lesson as node tombstones, one level down: "they do not have it"
  // and "they removed it" look identical, and a merge that guessed would delete
  // work nobody asked to delete. Removing a field is an ACT (a null value with
  // a clock), and the check below is that act.
  const mine = section({ id: "US1", node_type: "US", name: "US1", description: "vecchia",
                         data: { created_at: "2026-08-13T10:00:00Z", note: "una nota" } });
  const theirs = section({ id: "US1", node_type: "US", name: "US1", description: "nuova",
                           data: { created_at: "2026-08-13T11:00:00Z" } });
  C.mergeGraphSections(mine, theirs, freshReport());
  eq(mine.nodes[0].data.note, "una nota",
     "a field the other side never had is kept: absence is not a deletion");

  // …and an explicit removal, with a clock, does remove it
  const removal = { op: "update_field", node_id: "US1", field: "data.note",
                    value: null, ts: "2026-08-13T12:00:00Z", author: BRUNO };
  C.applyOp(mine, removal);
  eq(mine.nodes[0].data.note, undefined,
     "removing a field is an ACT, and then it is gone");
}

// ── P3 · light-weight versioning ────────────────────────────────────────────
{
  const doc = C.buildContainer({ graphs: [{ id: "scavo", doc: legacyDoc("scavo") }] });
  const first = C.bumpVersion(doc, null, "2026-08-13T10:00:00Z");
  eq(first.number, 1, "a project that was never versioned starts at v1");
  ok(first.id.startsWith("sha256:"), "…identified by a content digest");
  eq(first.was_revision_of, null, "…and grew out of nothing");

  // saving again with no change is NOT a revision
  const again = C.bumpVersion(doc, first, "2026-08-13T10:05:00Z");
  eq(again.number, 1, "an unchanged save does not invent a revision");
  eq(again.id, first.id, "…and keeps its digest");

  // a change bumps and records what it came from
  const changed = C.buildContainer({
    graphs: [{ id: "scavo", doc: legacyDoc("scavo", "US202") }],
  });
  const second = C.bumpVersion(changed, first, "2026-08-13T11:00:00Z");
  eq(second.number, 2, "changed content is a new version");
  eq(second.was_revision_of, first.id, "…pointing at the one it grew out of");
  eq(C.versionLabel(second), `v2 (da ${first.id})`, "…and it reads as a sentence");

  // the layout is NOT content: moving a box is not a new version of a study
  const moved = C.buildContainer({ graphs: [{ id: "scavo", doc: legacyDoc("scavo") }] });
  moved.layout = { positions: { US101: { x: 999, y: 999, w: 10, h: 10 } } };
  eq(C.contentDigest(moved), first.id, "the layout does not change the version");

  // and the version survives the file
  const roundTrip = C.parseContainer({ ...doc, version: second });
  eq(roundTrip.version.number, 2, "the version comes back from the file");
  eq(roundTrip.version.id, second.id, "…with its digest");
}

{
  // the digest agrees with s3Dgraphy's: same canonical JSON, same sha256.
  // Pinned against a value computed by the Python side (see
  // tests/test_merge_conflicts.py) so a drift in either canonicaliser shows up.
  const doc = { graphs: { a: { graph_id: "a", nodes: [], edges: [] } },
                active_graph_id: "a" };
  eq(C.contentDigest(doc), "sha256:1bce3bc3bbf4",
     "the TS digest is the one s3Dgraphy computes for the same project");
}

{
  // the arbitration is ONE function, shared with the live op-log: a conflict
  // that arrives one operation at a time must not be judged by a second rule
  const mine = unit("US1", "mia", ANNA, "2026-08-13T12:00:00Z");
  const theirs = unit("US1", "loro", BRUNO, "2026-08-13T11:00:00Z");
  const r = C.resolveNodePair("US1", mine, theirs);
  eq(r.side, "mine", "a remote edit older than mine does not land");
  eq(r.conflict.reason, "newer", "…and it is recorded, not swallowed");
  eq(r.conflict.loser.by, BRUNO, "…naming whose edge was refused");
  eq(r.merged.description, "mia", "…and the merged payload keeps my value");

  const same = C.resolveNodePair("US1", unit("US1", "x", ANNA, "2026-08-13T10:00:00Z"),
                                 unit("US1", "x", BRUNO, "2026-08-13T11:00:00Z"));
  eq(same.conflict, null, "the same content is never a conflict, wherever it arrives from");
}

// ── THE DOCUMENTATION MEMBER · a corpus is not a matrix ─────────────────────
//
// The separation, measured on the FILE: a container with a study graph, a shelf
// and a corpus must come back as three distinct things, and the corpus must not
// be in `members` — a caller iterating the study's graphs meeting a provenance
// forest is the bug this exists to prevent.
{
  const corpus = C.newCorpusSection();
  corpus.nodes = [
    { id: "acq1", node_type: "dtc_acquisition", name: "Volo 2026-03",
      data: { dtc_kind: "local_import", member_count: 1 } },
    { id: "img1", node_type: "resource", name: "IMG_1.jpg",
      data: { checksum: "sha256:" + "ab".repeat(32), residency: "resident" } },
  ];
  corpus.edges = [{ id: "e1", source: "acq1", target: "img1",
                    edge_type: "dtc_had_output" }];
  const shelf = { graph_id: "shelf", data: { em_collection: "ShelfGraph" },
                  nodes: [], edges: [] };
  const built = C.buildContainer({
    graphs: [{ id: "study", doc: { header: {}, graph: { graph_id: "study", nodes: [], edges: [] } } }],
    shelf, corpus, activeGraphId: "study",
  });
  eq(Object.keys(built.graphs).sort(), ["dtc", "shelf", "study"],
     "three members in the file, each under its own id");
  eq(built.graphs.dtc.data.em_collection, "DTCCorpus",
     "…and the corpus carries the marker that identifies it");

  const parsed = C.parseContainer(built);
  eq(parsed.members.map((m) => m.id), ["study"],
     "the corpus is NOT one of the study's graphs");
  ok(parsed.shelf !== null, "the shelf is still the shelf");
  ok(parsed.corpus !== null, "and the corpus came back as itself");
  eq(parsed.corpus.nodes.length, 2, "…with what was in it");
  eq(parsed.warnings, [], "nothing to warn about: this is a normal project");

  ok(C.isCorpusSection(built.graphs.dtc), "recognised by its marker");
  ok(!C.isCorpusSection(shelf), "…and a shelf is not a corpus");
  ok(!C.isShelfSection(built.graphs.dtc), "…nor the other way round");
  // a member id that LOOKS like one, without the marker, is a study graph
  const decoy = C.parseContainer({
    graphs: { dtc: { graph_id: "dtc", nodes: [], edges: [] } }, active_graph_id: "dtc" });
  eq(decoy.corpus, null, "the id `dtc` alone does not make a corpus");
  eq(decoy.members.map((m) => m.id), ["dtc"], "…it is just a graph called dtc");
}

{
  // a project that holds only a corpus is readable, and says what it is missing
  const parsed = C.parseContainer({
    graphs: { dtc: C.newCorpusSection() }, active_graph_id: null });
  ok(parsed.corpus !== null, "the corpus opens");
  eq(parsed.members, [], "…with no study graph");
  ok(parsed.warnings.some((w) => w.includes("no matrix to draw")),
     "…and the absence of a matrix is stated, not crashed on");
}

{
  // AUTHORING · what the corpus takes from the CANVAS.
  //
  // The gate lives here rather than in main.ts so it can be exercised without a
  // DOM: main.ts holds the gesture, this holds the RULE. It is given the class
  // predicates (never a list of literal type names) exactly as the app gives
  // them, so what is checked is the rule the app runs.
  const ctx = {
    isDtc: (t) => t.startsWith("dtc_"),
    resource: "resource",
    rights: ["author", "license", "embargo"],
  };
  const takes = (t) => C.corpusAcceptsNodeType(t, ctx);

  ok(takes("dtc_acquisition"), "an acquisition belongs in the documentation");
  ok(takes("dtc_process"), "…so does a transformation");
  ok(takes("resource"), "…and the file it produced");
  ok(takes("license") && takes("author") && takes("embargo"),
     "the rights a lot carries live there too (that is where attribution writes)");

  ok(!takes("US"), "a stratigraphic unit does NOT: no epochs, no lanes, no matrix");
  ok(!takes("USVs") && !takes("SF") && !takes("USD"),
     "…nor any of its siblings");
  ok(!takes("EpochNode"), "an epoch is a swimlane of the study, not of a corpus");
  ok(!takes("property") && !takes("document") && !takes("extractor"),
     "nor the paradata chain of the interpretation");

  // the predicate is the AUTHORITY: a datamodel that adds a DTC class needs no
  // change here (this is the ADR-001 rule, checked rather than asserted)
  ok(C.corpusAcceptsNodeType("dtc_whatever_comes_next", ctx),
     "a DTC class the datamodel adds tomorrow is accepted with no code change");
  ok(!C.corpusAcceptsNodeType("resource", { ...ctx, resource: undefined }),
     "…and with no Resource type resolved, nothing is silently assumed");
}

// ── every door a person opens a file by is the CONTAINER reader ─────────────
// Reported 28 Sep 2026 (dev.10–dev.12): the desktop File › Open and the recents
// called `loadDocument` straight on the JSON, which knows one graph and nothing
// else, so every `{graphs:{…}}` file — what s3Dgraphy writes since 13 Aug —
// failed with «missing graph.nodes» while the browser opened it. The fence is on
// the functions, read by the parser; the internal loaders (new graph, a mapping's
// result, a bridge conversion, the test data) keep `loadDocument` on purpose.
{
  const { readFileSync, existsSync } = await import("node:fs");
  const Sorg = await import("./sorgenti.mjs");
  const main = readFileSync(new URL("../src/main.ts", import.meta.url).pathname, "utf8");
  for (const door of ["openDocument", "openRecentFile"]) {
    const body = Sorg.dentro(main, door);
    ok(body, `the parser finds ${door}: a rename must fail here, not pass on ""`);
    ok(Sorg.chiama(body, "loadContainerDocument"),
       `${door} opens through the container reader`);
    ok(!Sorg.chiama(body, "loadDocument"),
       `…and never through the single-graph door, which refuses a container`);
  }

  // The two files of the report, when this machine has them (the benchmark
  // lives on the project share, not in the repo): the container and its
  // single-graph twin both yield exactly one member with nodes.
  const dir = process.env.EM_BM01_DIR;
  if (dir) {
    for (const f of ["BM01_base_fable-5.1_v6.2.em.json",
                     "BM01_base_fable-5.1_v6.2.single.em.json"]) {
      const path = `${dir}/${f}`;
      ok(existsSync(path), `${f} is where EM_BM01_DIR says`);
      const parsed = C.parseContainer(JSON.parse(readFileSync(path, "utf8")));
      eq(parsed.members.length, 1, `${f} opens as one graph`);
      ok(parsed.members[0].doc.graph.nodes.length > 0,
         `…whose graph has its nodes (${parsed.members[0].doc.graph.nodes.length})`);
    }
  }
}

console.log(`container: ${checks} checks passed`);
