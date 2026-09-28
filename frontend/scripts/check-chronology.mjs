// MICRO-cronologia (29 set 2026) · the propagated chronology is ASKED, not stored.
//
//   node scripts/check-chronology.mjs
//
// Three facts, each with a way to break:
//   1. the Chronology view asks the bridge (`POST /chronology`) and keeps the
//      answer in memory: when the part of the document the chronology reads has
//      changed, and not when a name is retyped;
//   2. with the bridge off it SAYS so — `off`, not an empty column that looks
//      like "no dates";
//   3. the TS preview of the `contained` rule (`fromFinds`, shown only with the
//      bridge off, marked «anteprima») gives on pancia A the answer s3Dgraphy
//      gives — pinned on both sides (s3Dgraphy tests/test_chronology_on_request.py
//      asserts the same triple), so a drift fails a check instead of becoming
//      two rules.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SRC = new URL("../src/", import.meta.url).pathname;

async function load(entry) {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                                  format: "esm", write: false, logLevel: "silent",
                                  loader: { ".json": "json" } });
  return import("data:text/javascript;base64," +
                Buffer.from(b.outputFiles[0].text).toString("base64") + `#${entry}`);
}

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, what); checks++; };
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

const C = await load("chron-bridge.ts");
const V = await load("table-views.ts");
const R = await load("rules.ts");

const fx = JSON.parse(await readFile(new URL(
  "../../.claude/wip/design/paradata-in-pancia/pancia_A_estrattore_su_RSF.em.json",
  import.meta.url), "utf8"));
const doc = { graph: structuredClone(fx.graph) };

// ── 1 · what makes it ask again ─────────────────────────────────────────────
{
  const sig = C.chronologySignature(doc);
  const renamed = structuredClone(doc);
  renamed.graph.nodes.find((n) => n.id === "USM101").name = "USM 101 (muro)";
  renamed.graph.nodes.find((n) => n.id === "USM101").description = "altro";
  eq(C.chronologySignature(renamed), sig, "a rename or a description does not re-ask");
  const moved = structuredClone(doc);
  moved.graph.edges = moved.graph.edges.filter((e) => e.id !== "RSF1_is_part_of_USM101");
  ok(C.chronologySignature(moved) !== sig, "a find moved out of the wall does");
  const redated = structuredClone(doc);
  redated.graph.nodes.find((n) => n.id === "P_USM_START").data.value = "200";
  ok(C.chronologySignature(redated) !== sig, "a date written again does");
  const epoch = structuredClone(doc);
  epoch.graph.nodes.find((n) => n.id === "EP_ROM").data.start_time = 50;
  ok(C.chronologySignature(epoch) !== sig, "an epoch's bound corrected does");
}

// ── 2 · the three answers of the bridge ─────────────────────────────────────
{
  const answer = { chronology: { USM101: { start: 180, end: 1300, start_source: "P_USM_START",
    end_source: "EP_MED", start_relation: "has_property", end_relation: "has_first_epoch",
    rule: "written", start_rule: "written", end_rule: "epoch",
    contained: { start: 100, source: "RSF1", original: "SF100",
                 via: ["is_part_of", "changed_from"] } } }, warnings: [] };
  let calls = 0;
  let bodies = [];
  let mode = "off";
  globalThis.fetch = async (url, init) => {
    calls++;
    bodies.push(init.body);
    ok(String(url).endsWith("/chronology") && init.method === "POST", "POST /chronology");
    if (mode === "off") throw new TypeError("Failed to fetch");
    if (mode === "old") return { ok: false, status: 501, json: async () => ({ error: "too old" }) };
    return { ok: true, status: 200, json: async () => answer };
  };
  let redraws = 0;
  C.onChronologyUpdate(() => { redraws++; });
  C.setChronologyBridgeResolver(async () => "http://bridge.test");

  C.resetChronology();
  eq(C.chronologyFor(doc, () => JSON.stringify(doc)).status, "idle", "first draw: asked, not answered");
  await tick(20);
  eq(calls, 1, "the view opening asks at once");
  const off = C.chronologyFor(doc, () => JSON.stringify(doc));
  eq(off.status, "off", "bridge off is SAID: status off, not an empty map");
  eq(redraws, 1, "…and the answer redraws the view");
  C.chronologyFor(doc, () => JSON.stringify(doc));
  await tick(20);
  eq(calls, 1, "an unreachable bridge is not hammered on every redraw");

  C.resetChronology();
  mode = "ok";
  C.chronologyFor(doc, () => JSON.stringify(doc));
  await tick(20);
  const st = C.chronologyFor(doc, () => JSON.stringify(doc));
  eq([st.status, st.map.USM101.contained.original], ["ok", "SF100"], "the map arrives");
  eq(JSON.parse(bodies.at(-1)).graph.graph_id, "pancia_A_estrattore_su_RSF",
     "what is sent is the open document");
  eq(doc.graph.nodes.some((n) => "CALCUL_START_T" in (n.data ?? {})), false,
     "…and the document receives nothing");
  C.chronologyFor(doc, () => JSON.stringify(doc));
  await tick(20);
  eq(calls, 2, "the same document is not asked twice");

  // a burst of edits is ONE request, after the debounce
  const edited = structuredClone(doc);
  for (const v of ["190", "195", "200"]) {
    edited.graph.nodes.find((n) => n.id === "P_USM_START").data.value = v;
    const s = C.chronologyFor(edited, () => JSON.stringify(edited));
    ok(s.stale, "while the new answer is on its way the old map is marked stale");
    await tick(50);
  }
  eq(calls, 2, "…nothing leaves during the burst");
  await tick(600);
  eq(calls, 3, "…and one request leaves after it");
  eq(JSON.parse(bodies.at(-1)).graph.nodes.find((n) => n.id === "P_USM_START").data.value, "200",
     "…carrying the document as it is when it leaves");

  C.resetChronology();
  mode = "old";
  C.chronologyFor(doc, () => JSON.stringify(doc));
  await tick(20);
  const old = C.chronologyFor(doc, () => JSON.stringify(doc));
  eq([old.status, old.error], ["error", "too old"], "an s3Dgraphy without /chronology is an error, named");
}

// ── 3 · the preview and s3Dgraphy agree on pancia A ─────────────────────────
{
  const ctx = { doc, nodes: doc.graph.nodes, isUnit: R.isStratigraphicType, issues: [],
                unitOfIssue: () => null, t: (k) => k };
  const ix = V.indexOf(ctx);
  const ff = V.fromFinds(ix, "USM101");
  // s3Dgraphy: chronology()["USM101"]["contained"] (tests/test_chronology_on_request.py)
  const S3D = { start: 100, source: "RSF1", original: "SF100" };
  eq({ start: ff.v, source: ff.via, original: ff.origin }, S3D,
     "the TS preview says what s3Dgraphy's `contained` says");
  const rows = V.chronRows(ctx, ix, { USM101: { start: 180, end: 1300 } });
  eq(rows.find((r) => r.node.id === "USM101").chron.start, 180, "the bridge's map reaches the row");
  eq(rows.find((r) => r.node.id === "US102").chron, null, "…and a node it does not date gets null");
  ok(rows.some((r) => r.node.id === "RSF1"), "RSF100b is a row of the chronology");
}

console.log(`chronology: ${checks} checks passed`);
