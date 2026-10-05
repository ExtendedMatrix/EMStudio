// DTC-NEIGH · executable check of two things that were written twice.
//
//   node scripts/check-dtc-neighbourhood.mjs
//
// **The classification.** Which edges are the DTC chain used to be written in
// three places: by name on the node (`s3dgraphy.dtc`), and by PREFIX here —
// `views/dtc.ts` and `views/context.ts` both carried `startsWith("dtc_")` with
// the comment «and whatever the datamodel adds next». That comment was the good
// intention holding the defect: it PRESUMED every future `dtc_*` edge would be
// chain, so a `dtc_annotated_by` that was context would have been a corridor on
// the client and not on the node — two rules with one name, and the client's the
// one nobody would think to check.
//
// The fix was not to align the prefix to the three names. It was to take the
// decision away from the client: the datamodel marks them (`dtc_role: "chain"`,
// connections 1.6.13), it travels through `sync-datamodels.sh` like everything
// else, and both sides read it.
//
// **The adapter.** The node's neighbourhood answer becomes a Scene, and a group
// stays a group: a flight of two hundred photographs is an acquisition whose
// members hang off it by `dtc_had_output` — a CHAIN edge, so the expansion
// legitimately returns all two hundred. Drawing two hundred boxes to say «a
// flight» is what makes a provenance picture unreadable, and the fold belongs in
// the adapter rather than as collapse logic inside the view.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SRC = new URL("../src/", import.meta.url).pathname;

const bundle = await esbuild.build({
  entryPoints: [`${SRC}views/neighbourhood.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const N = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

const rulesBundle = await esbuild.build({
  entryPoints: [`${SRC}rules.ts`],
  bundle: true,
  format: "esm",
  loader: { ".json": "json" },
  write: false,
});
const R = await import(
  "data:text/javascript;base64," +
    Buffer.from(rulesBundle.outputFiles[0].text).toString("base64")
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

// ── 1 · one classification, and it is the datamodel's ────────────────────────
{
  eq(R.dtcChainEdges(),
    ["dtc_derived_from", "dtc_had_input", "dtc_had_output"],
    "the chain edges are the three the datamodel marks");
  for (const edge of R.dtcChainEdges()) ok(R.isDtcChainEdge(edge), `${edge} is chain`);
  ok(!R.isDtcChainEdge("has_author"), "a `has_*` is never chain");
  ok(!R.isDtcChainEdge(undefined), "and neither is nothing");

  // THE ONE THAT MATTERS: a `dtc_*` edge the datamodel has not marked must not
  // be chain. This is what a prefix could not do.
  ok(!R.isDtcChainEdge("dtc_annotated_by"),
    "an UNMARKED `dtc_*` edge is not chain — which is the whole reason the " +
      "marker exists: a prefix would have walked it into another story");

  // …and the marker really is in the vendored datamodel, not only in this test
  const datamodel = JSON.parse(
    await readFile(`${SRC}assets/s3Dgraphy_connections_datamodel.json`, "utf8"));
  const marked = Object.entries(datamodel.edge_types)
    .filter(([, def]) => def?.dtc_role === "chain")
    .map(([name]) => name)
    .sort();
  eq(marked, R.dtcChainEdges(),
    "the client reads the vendored datamodel and not a list of its own");
  ok(datamodel._dtc_role_note,
    "…and the datamodel explains the field, for whoever adds the next edge");
}

// ── 2 · no source file decides it by name any more ───────────────────────────
{
  for (const file of ["views/dtc.ts", "views/context.ts", "rules.ts"]) {
    const text = await readFile(`${SRC}${file}`, "utf8");
    // comments EXPLAIN the prefix that was removed; matching those would be
    // matching the explanation (same caveat as check-pwa-under-a-prefix)
    const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    ok(!code.includes('startsWith("dtc_")'),
      `${file} still classifies a chain edge by prefix`);
  }
}

// ── 2b · the token is in the HEADER, never in a URL ──────────────────────────
//
// `handoff.ts` keeps a FORBIDDEN list that refuses `token`, `access_token`,
// `bearer` and their companions in a link — the property for which a handoff
// names a place and never a permission. Putting a token in a query string on the
// way to the same node would contradict that inside the same codebase, so this
// reads the source and holds the line.
{
  const main = await readFile(`${SRC}main.ts`, "utf8");
  const code = main.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

  const fnBody = (head) => {
    const at = code.indexOf(head);
    ok(at >= 0, `${head} is in main.ts`);
    const from = code.slice(at);
    return from.slice(0, from.indexOf("\n}\n"));
  };
  // MICRO accesso (5 Oct 2026) · `nodeFetch` takes THE ONE ROAD, `nodeAuthFetch`,
  // which every authenticated call to the node takes: the header and the renewal
  // are read there
  ok(fnBody("async function nodeFetch(").includes("nodeAuthFetch("),
    "nodeFetch goes by the one road to the node");
  const body = fnBody("async function nodeAuthFetch(");
  ok(/Authorization["']?\s*[,:]\s*`Bearer \$\{hubToken\}`/.test(body),
    "the node is called with the token in the Authorization header");
  // …and NO OTHER road: a bearer of the session written anywhere else is a call
  // that does not renew (the rooms list did not, and said «the token has expired»)
  const outside = code.replace(body, "");
  ok(!/Bearer \$\{hubToken\}/.test(outside),
    "the session's bearer is written only by nodeAuthFetch");
  ok(!/sha256=\$\{[^}]*[Tt]oken/.test(body) && !/[?&](access_)?token=/.test(body),
    "…and never in the URL");

  // the FORBIDDEN keys of the handoff contract, applied to every template
  // literal in this module that builds a node URL
  const handoff = await readFile(`${SRC}handoff.ts`, "utf8");
  const forbidden = [...handoff.matchAll(/"([a-z_]+)"/g)]
    .map((m) => m[1])
    .filter((k) => /token|secret|password|bearer|api_key|authorization/.test(k));
  ok(forbidden.length >= 5, "the handoff's FORBIDDEN list was found");
  for (const key of forbidden) {
    ok(!new RegExp(`[?&]${key}=`).test(code),
      `\`${key}=\` appears in a URL built by main.ts — the one thing the ` +
        "handoff contract exists to forbid");
  }

  // …and the refresh is tried before anybody is asked to sign in again
  ok(body.includes("renewHubToken(") && fnBody("function renewHubToken(").includes("refreshSession("),
    "a 401 asks the realm for a new token before giving up: an expired token is " +
      "the one failure the protocol has an answer for");
  ok(code.includes('status: "unauthorised"'),
    "and NOT SIGNED IN is its own state — «unreachable» to somebody who has " +
      "simply not signed in sends them to look at the network");
}

// ── 3 · the adapter: the context stays context ───────────────────────────────
{
  const answer = {
    start: "img0",
    nodes: [
      { id: "img0", type: "resource", name: "IMG_0000.jpg", hop: 0,
        context: [{ id: "author-bruno", name: "Bruno", edge_type: "has_author",
                    role: "rights" }] },
      { id: "proc", type: "dtc_process", name: "Alignment",
        dtc_kind: "transformation", hop: 1 },
      { id: "mesh0", type: "resource", name: "mesh0.ply", hop: 1 },
    ],
    edges: [
      { edge_type: "dtc_had_input", source: "proc", target: "img0" },
      { edge_type: "dtc_had_output", source: "proc", target: "mesh0" },
    ],
  };
  const adapted = N.adaptNeighbourhood(answer);
  eq(adapted.nodes.map((n) => n.id).sort(), ["img0", "mesh0", "proc"],
    "every card becomes a node");
  ok(!adapted.nodes.some((n) => n.id === "author-bruno"),
    "the author is NOT a node: it arrived as an attribute and it stays one — " +
      "turning it into a box here would undo the expansion's rule on the last metre");
  const img = adapted.nodes.find((n) => n.id === "img0");
  eq(img.data.context.length, 1, "…and it is carried on the card, for an inspector");
  eq(adapted.nodes.find((n) => n.id === "proc").data.dtc_kind, "transformation",
    "the kind comes through — it is what names the lane");
  eq(adapted.edges.length, 2, "the chain edges come through");
}

// ── 4 · a group stays a group ────────────────────────────────────────────────
{
  const members = Array.from({ length: 200 }, (_, i) => ({
    id: `m${i}`, type: "resource", name: `IMG_${i}.jpg`, hop: 2,
  }));
  const answer = {
    start: "m0",
    nodes: [
      { id: "lot", type: "dtc_acquisition", name: "Volo 2026-03", hop: 1 },
      ...members,
      { id: "proc", type: "dtc_process", name: "Alignment", hop: 3 },
      { id: "mesh", type: "resource", name: "mesh.ply", hop: 4 },
    ],
    edges: [
      ...members.map((m) => ({ edge_type: "dtc_had_output", source: "lot",
                               target: m.id })),
      { edge_type: "dtc_had_input", source: "proc", target: "m7" },
      { edge_type: "dtc_had_output", source: "proc", target: "mesh" },
    ],
  };
  const adapted = N.adaptNeighbourhood(answer);
  const ids = adapted.nodes.map((n) => n.id);
  ok(ids.includes("lot"), "the lot is drawn");
  ok(!ids.includes("m3"),
    "a member that is only a member is FOLDED — two hundred boxes to say «a " +
      "flight» is what makes the picture unreadable");
  ok(ids.includes("m0"),
    "…except the asset we asked about: hiding the thing somebody selected would " +
      "be the one unforgivable fold");
  ok(ids.includes("m7"),
    "…and except a member that went on to make something: it is the reason the " +
      "picture was opened");
  eq(adapted.folded.get("lot"), 198, "the rest became a count on the lot");
  ok(adapted.nodes.find((n) => n.id === "lot").name.includes("198"),
    "and the count is IN the name, so the view says it without a new field");
  ok(adapted.nodes.length < 20,
    `a 203-node answer draws ${adapted.nodes.length} boxes`);
  // no dangling edge: an edge to a folded member would draw into nothing
  const present = new Set(ids);
  for (const e of adapted.edges) {
    ok(present.has(e.source) && present.has(e.target),
      `an edge survived its endpoint: ${e.source} → ${e.target}`);
  }
}

// ── 5 · an answer about nothing is not an error ───────────────────────────────
{
  const adapted = N.adaptNeighbourhood({ start: null, nodes: [], edges: [] });
  eq(adapted.nodes, [], "an unknown asset adapts to an empty scene");
  eq(adapted.edges, [], "…and no edges");
  const partial = N.adaptNeighbourhood({});
  eq(partial.nodes, [], "…and a missing field is not a crash");
}

console.log(`dtc-neighbourhood: ${checks} checks passed`);
