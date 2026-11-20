// NON-REGRESSION · the Periodizations member out of «Funzioni sperimentali»
// (MICRO-COR11, 20 Nov 2026).
//
//   node scripts/check-periodizations-off.mjs [FILE.em.json …]
//
// Until MICRO-COR11 container.ts read the Periodizations member apart (by its
// marker, like the shelf and the DTC corpus) only with the switch on; off, it
// was a study graph like the others. The switch goes, the reading apart
// becomes everyone's. This check proves that a file WITHOUT periodizations
// does not notice: read and written back with the reading apart, it gives the
// same bytes as with the old reading (parseContainer → buildContainer, the
// same text of JSON), on the test data, the fixtures of s3Dgraphy, the
// specification's suite and — when the OneDrive is there, read only — every
// Templu Mare em.json of 14_EM_1.6_lavoro. A file WITH a Periodizations member
// is checked too: read apart it is written back with the member's content
// unchanged (canonical: keys sorted), and its study graphs the same.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HERE = new URL("./", import.meta.url).pathname;
const SRC = join(HERE, "../src/");

const bundle = await esbuild.build({
  entryPoints: [`${SRC}container.ts`], bundle: true, format: "esm", write: false,
});
const C = await import("data:text/javascript;base64," +
  Buffer.from(bundle.outputFiles[0].text).toString("base64"));

function emjsonIn(dir, deep = true) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (deep && n !== "node_modules" && !n.startsWith(".")) out.push(...emjsonIn(p, deep)); }
    else if (n.endsWith(".em.json")) out.push(p);
  }
  return out;
}

const GH = join(HERE, "../../../");
const TEMPLU = join(homedir(), "Library/CloudStorage/OneDrive-CNR/Dottorato Bucarest/14_EM_1.6_lavoro/TempluMare_v2_for_3DR_2026-10-06/EM");
const files = process.argv.length > 2 ? process.argv.slice(2) : [
  ...emjsonIn(join(HERE, "../testdata")),
  ...emjsonIn(join(GH, "s3Dgraphy/tests/fixtures")),
  ...emjsonIn(join(GH, "s3Dgraphy/spec/em-json/conformance"), false),
  ...emjsonIn(TEMPLU, false),
];

const write = (parsed) => JSON.stringify(C.buildContainer({
  graphs: parsed.members.map((m) => ({ id: m.id, doc: m.doc })),
  shelf: parsed.shelf, corpus: parsed.corpus, periodizations: parsed.periodizations,
  activeGraphId: parsed.activeGraphId,
  presentation: parsed.presentation ?? null,
  vocabularies: parsed.vocabularies ?? null,
}), null, 2);
const canon = (v) => Array.isArray(v) ? v.map(canon)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;

let without = 0, withMember = 0, templu = 0;
for (const f of files) {
  // a fresh object for each reading: the reader must not lean on a shared one
  const text = readFileSync(f, "utf8");
  C.setPeriodizationsApart(false);
  const before = C.parseContainer(JSON.parse(text));
  const a = write(before);
  C.setPeriodizationsApart(true);
  const now = C.parseContainer(JSON.parse(text));
  const b = write(now);
  if (f.startsWith(TEMPLU)) templu++;
  if (!now.periodizations) {
    assert.equal(b, a, `${f}: without periodizations, written differently with the reading apart`);
    assert.deepEqual(now.members.map((m) => m.id), before.members.map((m) => m.id), `${f}: other members`);
    without++;
  } else {
    // the member read apart, written back with the same content; the study graphs the same
    const id = String(now.periodizations.graph_id ?? "periodizations");
    const doc = JSON.parse(b);
    assert.deepEqual(canon(doc.graphs[id]), canon(JSON.parse(text).graphs[id]), `${f}: the Periodizations member changed`);
    assert.deepEqual(now.members.map((m) => m.id), before.members.map((m) => m.id).filter((x) => x !== id), `${f}: the study graphs`);
    withMember++;
  }
}
assert.ok(without > 0, "no file read");
console.log(`periodizations-off: ${without} em.json without periodizations written byte for byte as before`
  + ` (${templu} of Templu Mare), ${withMember} with the member written back unchanged — ok`);
