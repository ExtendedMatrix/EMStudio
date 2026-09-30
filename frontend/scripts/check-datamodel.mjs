// DATAMODEL · the vendored copies are still what s3Dgraphy declares.
//
//   node scripts/check-datamodel.mjs        (npm run check:datamodel)
//
// EMStudio holds the EM datamodel as COPIES: `scripts/sync-datamodels.sh`
// vendors six JSONs from s3Dgraphy into `src/assets` (ADR-001: the browser
// cannot import the Python package). Until 2026-10-01 EMStudio had no check of
// its own on them: the only comparison lived in s3Dgraphy (`consumer_drift`) and
// looked at ONE version, the connections'. A copy edited by hand keeps its
// version and changes its content, and nothing said so.
//
// Now the sync writes, beside the copies, `datamodel.fingerprint.json`: the
// fingerprint of what it copied (s3Dgraphy's `api.datamodel_fingerprint()`, the
// same digest recomputed here by `datamodel-fingerprint.mjs`). This check:
//
//   1. recomputes the fingerprint of the copies and compares it with that file
//      — a difference means somebody touched a copy: NAMED, and red;
//   2. compares the copies with the REFERENCE s3Dgraphy — the sibling working
//      tree when it is there (`../../s3Dgraphy`), else the value fixed at sync
//      (1. already) — a difference means EMStudio is behind: run the sync;
//   3. when a python with s3dgraphy is on this machine, checks that the digest
//      computed here is the one s3Dgraphy's Python computes (the canonical form
//      is RFC 8785 on both sides; this is where a drift of the two would show);
//   4. proves on a scratch copy that an altered copy DOES fail, and a reformatted
//      one does not — a guard that never bites looks exactly like one that works.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DATAMODEL_FILES, canonical, differences, fingerprint } from "./datamodel-fingerprint.mjs";

const FRONTEND = new URL("..", import.meta.url).pathname;
const ASSETS = join(FRONTEND, "src/assets");
const RECORD = join(ASSETS, "datamodel.fingerprint.json");
const SIBLING = join(FRONTEND, "../../s3Dgraphy");
const SIBLING_CFG = join(SIBLING, "src/s3dgraphy/JSON_config");

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// ── 1 · the copies are what the sync wrote ────────────────────────────────────
ok(existsSync(RECORD), `${RECORD} is missing — run scripts/sync-datamodels.sh`);
const recorded = JSON.parse(readFileSync(RECORD, "utf8"));
const copies = fingerprint(ASSETS);
eq(differences(recorded, copies), [],
  "the vendored copies are not what sync-datamodels.sh wrote (edited by hand?) — " +
  "re-run the sync, never edit src/assets");
eq(copies.digest, recorded.digest, "the copies' digest is the recorded one");

// ── 2 · the copies are what the reference s3Dgraphy declares ─────────────────
let reference = "the value fixed at sync (no sibling s3Dgraphy checkout)";
if (existsSync(join(SIBLING_CFG, "em_visual_rules.json"))) {
  const source = fingerprint(SIBLING_CFG);
  eq(differences(source, copies), [],
    `EMStudio's copies are behind the sibling s3Dgraphy (${SIBLING_CFG}) — ` +
    "run scripts/sync-datamodels.sh, review the diff, commit");
  reference = `the sibling s3Dgraphy working tree (${source.digest})`;

  // ── 3 · the digest here is s3Dgraphy's own ──────────────────────────────────
  const py = [join(SIBLING, ".venv/bin/python"), "python3"].find((p) =>
    p === "python3" || existsSync(p));
  const said = spawnSync(py, ["-c",
    "import json,sys; sys.path.insert(0, sys.argv[1]); " +
    "from s3dgraphy.datamodel import datamodel_fingerprint as f; " +
    "print(json.dumps(f()))", join(SIBLING, "src")], { encoding: "utf8" });
  if (said.status === 0) {
    const pyfp = JSON.parse(said.stdout);
    eq(pyfp.digest, source.digest, "the JavaScript fingerprint is s3Dgraphy's Python one");
    eq(pyfp.digests, source.digests, "…file by file");
    eq(pyfp.versions, source.versions, "…and the versions read the same");
  } else {
    console.log("  (no python with s3dgraphy.datamodel here: parity with the Python not checked)");
  }
}

// ── 4 · an altered copy fails, a reformatted one does not ────────────────────
const scratch = mkdtempSync(join(tmpdir(), "em-datamodel-"));
try {
  for (const [file] of Object.values(DATAMODEL_FILES)) cpSync(join(ASSETS, file), join(scratch, file));
  eq(differences(recorded, fingerprint(scratch)), [], "an untouched scratch copy agrees");

  const rulesPath = join(scratch, DATAMODEL_FILES.visual_rules[0]);
  const rules = JSON.parse(readFileSync(rulesPath, "utf8"));
  // reordered keys and another indentation: the same datamodel
  writeFileSync(rulesPath, JSON.stringify(Object.fromEntries(Object.entries(rules).reverse()), null, 4));
  eq(differences(recorded, fingerprint(scratch)), [], "reformatting a copy is not a difference");

  // one value touched by hand, version untouched: caught, and named
  writeFileSync(rulesPath, JSON.stringify({ ...rules, _touched_by_hand: true }));
  eq(differences(recorded, fingerprint(scratch)),
    [`visual_rules ${recorded.versions.visual_rules}: same version, different content`],
    "an edited copy is named even when its version stayed");

  // a version moved back: named copy-first, like s3Dgraphy says it
  const nodesPath = join(scratch, DATAMODEL_FILES.nodes[0]);
  const nodes = JSON.parse(readFileSync(nodesPath, "utf8"));
  writeFileSync(nodesPath, JSON.stringify({ ...nodes, s3Dgraphy_data_model_version: "1.6.12" }));
  const said = differences(recorded, fingerprint(scratch));
  ok(said.includes(`nodes 1.6.12 vs ${recorded.versions.nodes}`), `a stale copy is named: ${said}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// the canonical form, number for number (RFC 8785 §3.2.2.3)
eq([1.0, 1e-5, 1e-7, 1e21, 1e20, -0, 5e-324].map(canonical),
  ["1", "0.00001", "1e-7", "1e+21", "100000000000000000000", "0", "5e-324"],
  "numbers are written as ECMAScript writes them");
eq(canonical({ "ﬁ": 1, "\u{1f600}": 2, b: [1.5, {}] }),
  '{"b":[1.5,{}],"\u{1f600}":2,"ﬁ":1}', "keys sort by UTF-16 code unit");

console.log(`  reference: ${reference}`);
console.log(`datamodel: ${checks} checks passed`);
