// MICRO-TIMBRA-MASTER (6 Nov 2026) · the sign «master non timbrato» in
// EMStudio — `src/master-mark.ts`: which files a row asks about (the same rule
// as s3Dgraphy's `resources.master_stamp.looks_like_master`, compared with it
// when the sibling checkout is here), the words of the sign with the
// datamodel's kind of master, the gesture of each state; the vendored
// datamodel carries `master_kind` and its names.
//
//   node scripts/check-master-mark.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}master-mark.ts`], bundle: true, format: "esm", write: false });
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepStrictEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const PATHS = ["/p/SB/Tempio/master/Tempio.obj", "/p/RB/_master/T/T.ply", "/p/RB/Templu_VHR.ply",
  "/p/RB/Templu_master.glb", "/p/RB/versions/Templu@lod1-web.glb", "/p/RB/LOD0/OB_PODIO_LOD0.obj",
  "/p/SB/master/notes.txt", "/p/x/scan_highres.e57", "C:\\p\\SB\\T\\master\\T.glb"];
const WANT = [true, true, true, true, false, false, false, true, true];
eq(PATHS.map((p) => M.looksLikeMaster(p)), WANT, "which files are masters");
eq(M.looksLikeMaster("/p/RB/LOD0/OB_PODIO_LOD0.obj", "master"), true, "the graph's tier master");
eq(M.looksLikeMaster("/p/SB/master/T.glb", "distribution"), false, "a distribution never");

// the same rule as s3Dgraphy's, when its checkout and venv are beside this one
const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
if (existsSync(PY)) {
  const out = execFileSync(PY, ["-c",
    "import json,sys;from s3dgraphy.resources.master_stamp import looks_like_master as l;"
    + "print(json.dumps([l(p) for p in json.loads(sys.argv[1])]))", JSON.stringify(PATHS.slice(0, 8))], { encoding: "utf8" });
  eq(JSON.parse(out), WANT.slice(0, 8), "the same answers as s3Dgraphy");
} else console.log("  (s3Dgraphy's venv not here: the comparison is skipped)");

const t = (k) => ({ "master.state.unstamped": "⚠ master non timbrato", "master.state.stamped": "master timbrato",
  "master.state.changed_after_stamp": "⚠ master cambiato dopo il timbro" })[k] ?? k;
const kn = (k) => ({ very_high_resolution: "Altissima risoluzione", complete: "Completo (con texture)" })[k] ?? k;
eq(M.markText("unstamped", "very_high_resolution", t, kn), "⚠ master non timbrato · altissima risoluzione", "the sign");
eq(M.markText("stamped", "complete", t, kn), "master timbrato · completo (con texture)", "a stamped complete master");
eq(M.markText("unstamped", null, t, kn), "⚠ master non timbrato", "no kind known: none said");
eq(["unstamped", "changed_after_stamp", "unverified", "stamped"].map(M.gestureOf), ["stamp", "restamp", "verify", null], "the gestures");
eq(["unstamped", "changed_after_stamp", "unverified", "stamped"].map(M.needsStamp), [true, true, false, false], "what asks for a hand");

// the vocabulary is the datamodel's (vendored), with its names
const dm = JSON.parse(readFileSync(`${SRC}assets/s3Dgraphy_node_datamodel.json`, "utf8"));
const mk = dm.reference_nodes.ResourceNode.properties.master_kind;
eq(Object.keys(mk.values), ["very_high_resolution", "complete"], "the datamodel's kinds");
const tr = JSON.parse(readFileSync(`${SRC}assets/datamodel_translations.json`, "utf8"));
eq(tr.master_kinds.very_high_resolution.label.it, "Altissima risoluzione", "the Italian name");
// the i18n has the words, in both languages
const i18n = readFileSync(`${SRC}i18n.ts`, "utf8");
for (const k of ["master.state.unstamped", "master.stamp", "master.chain", "master.chainStep.texturing"])
  eq((i18n.match(new RegExp(`"${k.replace(/\./g, "\\.")}"`, "g")) ?? []).length, 2, `${k} in en and it`);
// the Archive draws the sign and the gesture, the Asset its master's, the .psx its chain
const main = readFileSync(`${SRC}main.ts`, "utf8");
for (const s of ["paintMasterSign(row, name, entry, !!own)", "data-action\", \"master-stamp\"".slice(0, 0) + "b.dataset.action = \"master-stamp\"",
  "\"stamp-photogrammetry-chain\"", "tag.className = \"al-master\""])
  { assert.ok(main.includes(s), s); checks++; }
console.log(`check-master-mark: ${checks} checks ok`);
