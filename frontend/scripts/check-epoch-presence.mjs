// MICRO-TESTATE-COERENTI p.7 · what is IN an epoch, one rule — the page's reading
// (`src/epoch-presence.ts`) against s3Dgraphy's (`epoch_scope.epoch_presence`):
//
//   node scripts/check-epoch-presence.mjs [path/to/TempluMare_v9.em.json]
//
// Born (has_first_epoch) ∪ survived (survive_in_epoch), a mother epoch the union of
// its phases (has_sub_epoch), the survivors with the epoch they were born in. On a
// small graph always; with the v9 (default /tmp/tc/T/EM/TempluMare_v9.em.json, or
// EM_V9) every epoch compared with s3Dgraphy run from ../s3Dgraphy/src (skipped
// when either is missing), and «2013» holds SU001–SU004 as survivors.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}epoch-presence.ts`], bundle: true, format: "esm", write: false });
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const N = (id, node_type, name = id) => ({ id, node_type, name, data: {} });
const E = (source, target, edge_type) => ({ id: `${source}__${edge_type}__${target}`, source, target, edge_type });
const doc = { graph: { nodes: [N("XX", "EpochNode"), N("E15", "EpochNode"), N("E13", "EpochNode"), N("II", "EpochNode"),
  N("SU1", "US"), N("SU2", "US"), N("M1", "representation_model"), N("GONE", "US")],
  edges: [E("XX", "E15", "has_sub_epoch"), E("XX", "E13", "has_sub_epoch"),
    E("SU1", "II", "has_first_epoch"), E("SU1", "E13", "survive_in_epoch"), E("SU2", "E15", "has_first_epoch"),
    E("XX", "M1", "has_representation_model"),
    { ...E("GONE", "E13", "survive_in_epoch"), attributes: { removed: true } }] } };
const P = M.presenceIndex(doc);
eq(P("E13").survive, [{ id: "SU1", first: "II" }], "2013: SU1 survives there, born in II");
eq(P("E13").born, [], "2013: nobody born");
eq(P("XX").epochs, ["XX", "E15", "E13"], "XX sec: its phases");
eq([P("XX").born, P("XX").survive.map((x) => x.id), P("XX").models], [["SU2"], ["SU1"], ["M1"]], "XX sec: the union of its phases");
eq(P("XX", false).born, [], "XX sec alone: nobody born");
eq(P.firstOf("SU1"), "II", "first epoch");

const V9 = process.argv[2] ?? process.env.EM_V9 ?? "/tmp/tc/T/EM/TempluMare_v9.em.json";
const S3D = new URL("../../../s3Dgraphy/src", import.meta.url).pathname;
const PY = existsSync(new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname)
  ? new URL("../../../s3Dgraphy/.venv/bin/python", import.meta.url).pathname : "python3";
if (!existsSync(V9) || !existsSync(`${S3D}/s3dgraphy/epoch_scope.py`)) {
  console.log(`epoch-presence: ${checks} checks passed (v9 or s3Dgraphy's epoch_scope not here: the comparison skipped)`);
} else {
  const em = JSON.parse(readFileSync(V9, "utf8"));
  const g = em.graphs?.[em.active_graph_id] ?? em.graph;
  const vdoc = { graph: g };
  const py = execFileSync(PY, ["-c", `
import json,sys
from s3dgraphy import api
from s3dgraphy import epoch_scope as ES
g,_=api.load_emjson_file(sys.argv[1])
out={}
for n in g.nodes:
    if n.node_type=="EpochNode":
        p=ES.epoch_presence(g,n.node_id); q=ES.epoch_presence(g,n.node_id,family=False)
        out[n.node_id]={"fam":p,"own":q}
print(json.dumps(out))`, V9], { env: { ...process.env, PYTHONPATH: S3D }, maxBuffer: 64 << 20 }).toString();
  const want = JSON.parse(py);
  const PV = M.presenceIndex(vdoc);
  const sortP = (p) => ({ epochs: [...p.epochs].sort(), born: [...p.born].sort(), survive: [...p.survive].sort((a, b) => a.id.localeCompare(b.id)), models: [...p.models].sort() });
  for (const [ep, w] of Object.entries(want)) {
    eq(sortP(PV(ep)), sortP(w.fam), `v9 ${ep} with its phases = s3Dgraphy`);
    eq(sortP(PV(ep, false)), sortP(w.own), `v9 ${ep} alone = s3Dgraphy`);
  }
  const byName = new Map(g.nodes.map((n) => [n.name, n.id]));
  const nm = (id) => g.nodes.find((n) => n.id === id)?.name;
  const s13 = PV(byName.get("2013")).survive.map((x) => nm(x.id));
  eq(["SU001", "SU002", "SU003", "SU004"].every((x) => s13.includes(x)), true, "v9 2013: SU001–SU004 survive there");
  eq(PV(byName.get("XX sec")).survive.map((x) => nm(x.id)).sort(), s13.sort(), "v9 XX sec gathers 2013's survivors");
  console.log(`epoch-presence: ${checks} checks passed (v9: ${Object.keys(want).length} epochs = s3Dgraphy)`);
}
