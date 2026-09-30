// NIGHT-SPAZIO · executable check of what the Spazio reads from the graph
// (`space.ts`) and of the Table's view «Modelli e proxy» (`models-sheet.ts`).
//
//   node scripts/check-space.mjs
//
// On `testdata/spazio.em.json`: two RMs in Età moderna (a survey, resident; a
// reconstruction, reference only), the proxies of Medioevo (a glb, convex hulls,
// a reference, a declared file that is not there, a unit without one), spheres
// for US102 in Età moderna, and Età imperiale with one unit and no 3D. The
// resident set is compared with s3Dgraphy's `geometry_summary` when its venv is
// there — the rule the client applies offline must be the library's.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./space"; export * from "./models-sheet";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, `${m} — got ${JSON.stringify(a)}`); checks++; };

const doc = JSON.parse(readFileSync(new URL("../testdata/spazio.em.json", import.meta.url), "utf8"));
const UNITS = new Set(["US", "USVs", "USVn", "SF", "RSF", "VSF", "USD", "USM"]);
const isUnit = (t) => UNITS.has(t);

// ── offline: the resources' own recorded state ─────────────────────────────
{
  const sp = M.buildSpace(doc, { isUnit });
  eq(sp.epochs.map((e) => e.id), ["EP_MOD", "EP_MED", "EP_ROM"], "the top epochs, newest first");
  const rm = (id) => sp.rms.find((r) => r.id === id);
  eq([rm("RM01").epochs, rm("RM01").documentId, rm("RM01").genre, rm("RM01").resource?.state],
     [["EP_MOD"], "D2", "reality_based", "resident"], "RM01: the survey of Età moderna, recorded by D.2, resident");
  eq([rm("RM02").epochs, rm("RM02").documentId, rm("RM02").genre, rm("RM02").resource?.state],
     [["EP_MOD"], "D4", "em_based", "reference"], "RM02: a source-based reconstruction, reference only");
  const px = (u) => sp.proxies.get(u);
  eq([px("USM101").geometry, px("USM101").resource?.state], ["glb", "resident"], "USM101: a glb proxy, resident");
  eq([px("USV106").geometry, px("USV106").convexshapes.length, px("USV106").resource], ["convex", 1, null],
     "USV106: convex hulls in the JSON, no resource");
  eq([px("US102").geometry, px("US102").spheres.length], ["spheres", 2], "US102: two spheres in the JSON");
  eq(px("RSF100b").resource?.state, "reference", "RSF100b: its glb only referenced");
  eq(px("US103").resource?.state, "resident", "US103: declared resident (it is the scene that finds it absent)");
  eq([px("US104"), px("SF100")], [undefined, undefined], "US104 and SF100 have no proxy");

  const mod = sp.summary("EP_MOD"), med = sp.summary("EP_MED"), rom = sp.summary("EP_ROM");
  eq([mod.rms.map((r) => r.id), mod.units, mod.withProxy, mod.rmReference],
     [["RM01", "RM02"], ["US102"], ["US102"], ["RM02"]], "Età moderna: two RMs, one unit with its proxy");
  eq([med.rms.length, med.units.sort(), med.without, med.reference, med.missing],
     [0, ["RSF100b", "US103", "US104", "USM101", "USV106"], ["US104"], ["RSF100b"], []],
     "Medioevo: no RM, five units, one without a proxy, one referenced");
  eq([rom.rms.length, rom.units, rom.withProxy], [0, ["SF100"], []], "Età imperiale: nothing in 3D");

  // what the scene found missing is missing
  const sp2 = M.buildSpace(doc, { isUnit, notFound: new Set(["RP_US103"]) });
  eq(sp2.summary("EP_MED").missing, ["US103"], "a resident file the scene did not find is «missing»");
}

// ── the rule is s3Dgraphy's: geometry_summary through the same fixture ─────
{
  const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
  const PY = `${S3D}.venv/bin/python`;
  if (existsSync(PY)) {
    const out = execFileSync(PY, ["-c", `
import json,sys
from s3dgraphy import api
g, w = api.load_emjson(json.loads(sys.stdin.read()))
s = api.geometry_summary(g)
print(json.dumps({"resident": sorted(r["resource_id"] for r in s["resident"]), "elsewhere": sorted(r["resource_id"] for r in s["elsewhere"])}))`],
      { input: JSON.stringify(doc), env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop();
    const py = JSON.parse(out);
    const sp = M.buildSpace(doc, { isUnit });
    const all = [...sp.rms.map((r) => r.resource), ...[...sp.proxies.values()].map((p) => p.resource)].filter(Boolean);
    eq(all.filter((r) => r.state === "resident").map((r) => r.id).sort(), py.resident,
       "offline, the client's resident set is geometry_summary's");
    eq(all.filter((r) => r.state === "reference").map((r) => r.id).sort(), py.elsewhere,
       "…and its references are geometry_summary's «elsewhere»");
    const online = M.buildSpace(doc, { isUnit, resident: new Set(py.resident) });
    eq(online.proxies.get("USM101").resource.state, "resident", "online: the bridge's answer decides");
  } else console.log("  (s3Dgraphy venv not found: the comparison with geometry_summary is skipped)");
}

// ── «Modelli e proxy»: the count is the rows on screen ─────────────────────
{
  const sp = M.buildSpace(doc, { isUnit });
  const units = doc.graph.nodes.filter((n) => isUnit(n.node_type)).map((n) => n.id);
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const ctx = { node: (id) => byId.get(id), t: (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k), genre: (g) => g ?? "—" };
  const r = M.modelsTableHtml(sp, units, ctx, () => true);
  const rows = (r.html.match(/<tr data-row=/g) ?? []).length;
  eq([r.count, rows], [11, 11], "the count (4 epoch/RM rows + 7 units) is the rows drawn");
  ok(/data-count="epochs"[^<]*<b>1\/3<\/b>/.test(r.html), "the head: epochs with an RM 1/3");
  ok(/data-count="units"[^<]*<b>5\/7<\/b>/.test(r.html), "…units with a proxy 5/7");
  ok(/data-open-doc="D2"/.test(r.html) && /data-open-doc="D4"/.test(r.html), "each recorded RM opens its document");
  const f = M.modelsTableHtml(sp, units, ctx, (id) => id === "USM101");
  eq(f.count, 1, "a filter counts what it leaves");
}

console.log(`space: ${checks} checks passed`);
