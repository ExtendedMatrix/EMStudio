// em.json CONFORMANCE · EMStudio's reader and writer (src/container.ts) against
// the suite of the specification (MICRO specifica em.json, part 4, 24 Oct 2026).
//
//   node scripts/check-emjson-conformance.mjs [SUITE_DIR]
//
// The suite lives with the specification, in s3Dgraphy `spec/em-json/conformance/`
// (default: the sibling checkout). For each sample:
//   · it validates against the schema of its form (../schemas, synced by
//     `./em.sh sync`) — by the small validator below, which reads the schema
//     itself: the subset of JSON Schema the em.json schemas use;
//   · parseContainer reads it to the EXPECTED reading (expected/<name>.json,
//     written by the suite's reference_reading.py, not by any implementation);
//   · buildContainer writes it back: the result validates against em.v1.1, and
//     read again gives the same reading with every node's type, name,
//     description and data and every edge's attributes unchanged.
//
// KNOWN_GAPS lists, by name, what EMStudio does not yet do as the specification
// says: reported, not failed — and reported as FIXED the day it passes, so the
// entry is removed and does not hide a regression later.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HERE = new URL("./", import.meta.url).pathname;
const SRC = join(HERE, "../src/");
const SCHEMAS = join(HERE, "../../schemas/");
const SUITE = process.argv[2] ?? join(HERE, "../../../s3Dgraphy/spec/em-json/conformance/");

if (!existsSync(SUITE)) {
  console.log(`emjson-conformance: no suite at ${SUITE} (needs the s3Dgraphy checkout) — skipped`);
  process.exit(0);
}

const KNOWN_GAPS = {
  // container.ts recognises the shelf and the DTC corpus by their marker, not
  // yet the Periodizations member (s3Dgraphy 1.6.47): it opens as a study graph.
  // Nothing is lost — the member is written back as it was, marker included —
  // but the reading rule 5 (§3) is not met.
  "04-horizons.em.json:periodizations": "the Periodizations member is read as a study graph",
};

const bundle = await esbuild.build({
  entryPoints: [`${SRC}container.ts`], bundle: true, format: "esm", write: false,
});
const C = await import("data:text/javascript;base64," +
  Buffer.from(bundle.outputFiles[0].text).toString("base64"));

// ── a validator for the subset of JSON Schema the em.json schemas use ─────────
function validator(schema) {
  const errors = [];
  const resolve = (s) => {
    while (s && s.$ref) s = s.$ref.split("/").slice(1).reduce((o, k) => o[k], schema);
    return s;
  };
  const typeOk = (v, t) => (Array.isArray(t) ? t : [t]).some((x) =>
    x === "null" ? v === null
    : x === "array" ? Array.isArray(v)
    : x === "object" ? v !== null && typeof v === "object" && !Array.isArray(v)
    : x === "integer" ? Number.isInteger(v)
    : x === "number" ? typeof v === "number"
    : typeof v === x);
  const walk = (s, v, path) => {
    s = resolve(s);
    if (!s || typeof s !== "object") return;
    const fail = (m) => errors.push(`${path || "/"}: ${m}`);
    if (s.type && !typeOk(v, s.type)) return fail(`not ${JSON.stringify(s.type)}`);
    if ("const" in s && v !== s.const) fail(`not ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.includes(v)) fail(`not one of ${s.enum.join(", ")}`);
    if (s.pattern && typeof v === "string" && !new RegExp(s.pattern).test(v)) fail(`does not match ${s.pattern}`);
    if (s.minimum !== undefined && typeof v === "number" && v < s.minimum) fail(`below ${s.minimum}`);
    if (s.anyOf) {
      const before = errors.length;
      const ok = s.anyOf.some((sub) => { const n = errors.length; walk(sub, v, path); const good = errors.length === n; errors.length = n; return good; });
      errors.length = before;
      if (!ok) fail("matches none of anyOf");
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const r of s.required ?? []) if (!(r in v)) fail(`missing ${r}`);
      if (s.minProperties && Object.keys(v).length < s.minProperties) fail("too few properties");
      for (const [k, x] of Object.entries(v)) {
        if (s.properties?.[k]) walk(s.properties[k], x, `${path}/${k}`);
        else if (s.additionalProperties && typeof s.additionalProperties === "object")
          walk(s.additionalProperties, x, `${path}/${k}`);
      }
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (s.prefixItems?.[i]) walk(s.prefixItems[i], x, `${path}/${i}`);
        else if (s.items) walk(s.items, x, `${path}/${i}`);
      });
    }
  };
  return (doc) => { errors.length = 0; walk(schema, doc, ""); return [...errors]; };
}
const validate = {
  "em.v1.1.schema.json": validator(JSON.parse(readFileSync(join(SCHEMAS, "em.v1.1.schema.json"), "utf8"))),
  "em.v1.schema.json": validator(JSON.parse(readFileSync(join(SCHEMAS, "em.v1.schema.json"), "utf8"))),
};

// ── EMStudio's reading, in the shape of the reference reading ───────────────
function sectionReading(section, role) {
  return {
    role,
    nodes: Object.fromEntries((section.nodes ?? []).map((n) => [String(n.id), String(n.node_type)])),
    edges: Object.fromEntries((section.edges ?? []).map((e) => [String(e.id), [e.edge_type, e.source, e.target]])),
    links: Object.fromEntries((section.links ?? []).filter((l) => l?.target && typeof l.target === "object")
      .map((l) => [String(l.id), [l.edge_type, l.source, l.target.graph_id, l.target.node_id]])),
  };
}
function reading(parsed) {
  const graphs = {};
  for (const m of parsed.members) graphs[m.id] = sectionReading(m.doc.graph, "study");
  if (parsed.shelf) graphs[String(parsed.shelf.graph_id ?? "shelf")] = sectionReading(parsed.shelf, "shelf");
  if (parsed.corpus) graphs[String(parsed.corpus.graph_id ?? "dtc")] = sectionReading(parsed.corpus, "dtc");
  return { active_graph_id: parsed.activeGraphId, graphs };
}
const rewrite = (parsed) => C.buildContainer({
  graphs: parsed.members.map((m) => ({ id: m.id, doc: m.doc })),
  shelf: parsed.shelf, corpus: parsed.corpus, activeGraphId: parsed.activeGraphId,
});
const sections = (doc) => doc.graphs
  ? Object.fromEntries(Object.entries(doc.graphs).map(([k, s]) => [String(s.graph_id ?? k), s]))
  : { [String(doc.graph.graph_id)]: doc.graph };

let checks = 0;
const gaps = { seen: [], fixed: [] };
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// the validator says no when it must (otherwise every «validates» below is empty)
{
  const v = validate["em.v1.1.schema.json"];
  ok(v({ header: { format: "em.json", version: "1.1" } }).some((e) => e.includes("missing graphs")),
     "the validator refuses a container without graphs");
  ok(v({ header: { format: "em.json", version: "2.0" }, graphs: { g: { nodes: [], edges: [] } } }).length > 0,
     "…and a major it does not describe");
  ok(v({ header: { format: "em.json", version: "1.1" },
         graphs: { g: { nodes: [{ id: "a" }], edges: [{ id: "e", edge_type: "abuts", source: "a" }] } } })
       .length === 2, "…and a node without type, an edge without target");
}

function compare(got, want, sample, name = sample) {
  eq(got.active_graph_id, want.active_graph_id, `${sample}: the active graph`);
  eq(Object.keys(got.graphs).sort(), Object.keys(want.graphs).sort(), `${sample}: the graphs`);
  for (const [gid, w] of Object.entries(want.graphs)) {
    const g = got.graphs[gid];
    const gap = `${name}:${gid}`;
    if (g.role !== w.role) {
      if (KNOWN_GAPS[gap]) { if (name === sample) gaps.seen.push(`${gap} — ${KNOWN_GAPS[gap]}`); }
      else eq(g.role, w.role, `${sample}: the role of ${gid}`);
    } else if (KNOWN_GAPS[gap] && name === sample) gaps.fixed.push(gap);
    eq(g.nodes, w.nodes, `${sample}: the nodes of ${gid}`);
    eq(g.edges, w.edges, `${sample}: the edges of ${gid}`);
    eq(g.links, w.links, `${sample}: the links of ${gid}`);
  }
}

const samples = readdirSync(SUITE).filter((f) => f.endsWith(".em.json")).sort();
ok(samples.length === 6, "the suite holds the six cases");
for (const sample of samples) {
  const source = JSON.parse(readFileSync(join(SUITE, sample), "utf8"));
  const expected = JSON.parse(readFileSync(join(SUITE, "expected", sample.replace(/\.em\.json$/, ".json")), "utf8"));
  eq(validate[expected.schema](source), [], `${sample} validates against ${expected.schema}`);

  const parsed = C.parseContainer(source);
  compare(reading(parsed), expected, sample);

  const written = JSON.parse(JSON.stringify(rewrite(parsed)));
  eq(validate["em.v1.1.schema.json"](written), [], `${sample}: what EMStudio writes validates against em.v1.1`);
  compare(reading(C.parseContainer(written)), expected, `${sample} (written back)`, sample);

  const out = sections(written);
  for (const [gid, section] of Object.entries(sections(source))) {
    const nodes = new Map(out[gid].nodes.map((n) => [n.id, n]));
    for (const n of section.nodes ?? []) {
      const m = nodes.get(n.id);
      for (const key of ["node_type", "name", "description"]) if (n[key]) eq(m[key], n[key], `${sample}: ${gid}/${n.id}.${key}`);
      for (const [k, v] of Object.entries(n.data ?? {})) eq(m.data?.[k], v, `${sample}: ${gid}/${n.id}.data.${k}`);
    }
    const edges = new Map(out[gid].edges.map((e) => [e.id, e]));
    for (const e of section.edges ?? []) {
      for (const [k, v] of Object.entries(e.attributes ?? {})) eq(edges.get(e.id).attributes?.[k], v, `${sample}: ${gid}/${e.id}.attributes.${k}`);
    }
  }
  for (const path of expected.must_survive_round_trip) {
    const dig = (doc) => path.reduce((o, step, i) =>
      i === 1 && path[0] === "graphs" ? sections(doc)[step]
      : i === 2 && (step === "nodes" || step === "edges") ? Object.fromEntries(o[step].map((x) => [x.id, x]))
      : o?.[step], doc);
    eq(dig(written), dig(source), `${sample}: ${path.join(".")} survives`);
  }
}

for (const g of gaps.seen) console.log(`  known gap   ${g}`);
for (const g of gaps.fixed) console.log(`  FIXED       ${g} — remove it from KNOWN_GAPS`);
console.log(`emjson-conformance: ${checks} checks passed (${samples.length} samples, ${gaps.seen.length} known gap(s))`);
if (gaps.fixed.length) process.exit(1);
