// MICRO-SPAZIO-3D p.4 · a sketched shape associated with a unit becomes its
// proxy with EM Tools' rule — checked in node against s3Dgraphy:
//
//   node scripts/check-space-associate.mjs [study.em.json]   (BRIDGE=http://localhost:8781 for /fs/write)
//
// · the file's place: `proxies/<unit name>.glb` (a name a file system takes);
// · the chain the library writes for that url (`create_geometry_proxy`, the
//   bridge's /geometry-proxies) and EMStudio's patch of its resource (digest,
//   resident, glb, size): read back by s3Dgraphy, the unit passes from
//   `units_without_3d` «without» to «with», `threed_instances` draws its proxy
//   with the file, and `resolve_files` finds the file beside the em.json;
// · the shape catalogue: every entry has a name in en and it, a known
//   primitive, positive dimensions in metres;
// · with a bridge (BRIDGE), `/fs/write` writes inside the roots and refuses to
//   overwrite.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * as A from "./proxy-association"; export { SHAPES, SHAPE_FAMILIES } from "./shapes3d";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const { A, SHAPES, SHAPE_FAMILIES } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// ── the place of the file ────────────────────────────────────────────────────
eq(A.proxyRelPath("US 12"), "proxies/US 12.glb", "proxies/<unit>.glb, the name as it is");
eq(A.proxyRelPath("USM5000/A"), "proxies/USM5000_A.glb", "a slash is not a folder");
eq(A.proxyRelPath("  "), "proxies/proxy.glb", "no name: «proxy»");

// ── MICRO-PROVA-DEV47 p.5 · a proxy taken away; a unit in brief ─────────────
{
  const N = (id, node_type, name, data = {}) => ({ id, node_type, name, data });
  const E = (source, edge_type, target) => ({ id: `${source}_${edge_type}_${target}`, source, target, edge_type });
  const g = {
    nodes: [N("U5", "US", "SU005", { description: "Strato di crollo.\nTegole e malta." }), N("U6", "US", "SU006"), N("D1", "document", "D.07"),
      N("P", "property", "geometry", { property_type: "geometry" }), N("S", "semantic_shape", "Shape for SU005"),
      N("R", "resource", "SU005.glb", { url: "proxies/SU005.glb", url_type: "proxy_model", checksum: "sha256:ab" }),
      N("P2", "property", "material", { property_type: "material" }), N("X", "extractor", "D.07.1"),
      N("R2", "resource", "SU006.glb", { url: "proxies/SU006.glb", url_type: "proxy_model", media_type: "model/gltf-binary", size_bytes: 10 }),
      N("P6", "property", "geometry", { property_type: "geometry" }), N("S6", "semantic_shape", "Shape for SU006")],
    edges: [E("U5", "has_property", "P"), E("P", "has_semantic_shape", "S"), E("S", "has_linked_resource", "R"),
      E("U5", "has_property", "P2"), E("P2", "has_data_provenance", "X"), E("X", "extracted_from", "D1"),
      E("U5", "is_after", "U6"), E("U6", "has_property", "P6"), E("P6", "has_semantic_shape", "S6"), E("S6", "has_linked_resource", "R2")],
  };
  const p5 = A.proxyPartsOf(g, "U5");
  eq([p5.propertyIds, p5.shapeIds, p5.resourceIds, p5.files], [["P"], ["S"], ["R"], ["proxies/SU005.glb"]],
    "the proxy of SU005: its geometry property, its shape, its resource — not the material property, not the unit");
  eq(p5.fromEmTools, true, "a resource without media_type and size_bytes: EM Tools wrote it");
  eq(A.proxyPartsOf(g, "U6").fromEmTools, false, "EMStudio's own (digest, glb, size): not EM Tools'");
  eq(A.proxyPartsOf(g, "D1").shapeIds, [], "a node without a proxy: nothing to take away");
  const b = A.unitBrief(g, "U5", (t) => t === "US");
  eq(b.documents, ["D.07"], "the document its properties come from (property → extractor → document)");
  eq(b.relations, [{ type: "is_after", out: true, other: "SU006" }], "its stratigraphic relations, not its properties");
  eq(b.description.split("\n")[0], "Strato di crollo.", "the description, as written");
}

// ── the catalogue ────────────────────────────────────────────────────────────
{
  const prims = new Set(["box", "cylinder", "cone", "sphere", "hemisphere", "plane", "wedge", "prism", "torus", "arch"]);
  eq(SHAPES.map((s) => s.id), ["cube", "cuboid", "cylinder", "cone", "sphere", "hemisphere", "plane", "wedge", "prism", "torus",
    "wall", "column_drum", "slab", "step", "round_arch"], "the fifteen shapes of the MICRO, in its order");
  eq(SHAPE_FAMILIES.map((f) => f.id), ["geometric", "site"], "two families");
  for (const s of SHAPES) {
    ok(s.label.en && s.label.it, `${s.id}: a name in en and it`);
    ok(prims.has(s.primitive), `${s.id}: a known primitive`);
    const dims = [...(s.size ?? []), s.radius, s.height, s.tube, s.span, s.ring, s.depth].filter((x) => x != null);
    ok(dims.length && dims.every((x) => x > 0), `${s.id}: dimensions in metres, positive`);
  }
}

// ── the chain, by s3Dgraphy, and the patch ───────────────────────────────────
const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
if (!existsSync(PY)) {
  console.log("  no s3Dgraphy venv: the chain is not checked");
} else {
  const py = (script, input) => JSON.parse(execFileSync(PY, ["-c", script], { input: JSON.stringify(input), maxBuffer: 1 << 28,
    env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString().trim().split("\n").pop());
  const dir = mkdtempSync(`${tmpdir()}/em-assoc-`);
  const study = process.argv[2];
  let doc, unit;
  if (study) {
    const raw = JSON.parse(readFileSync(study, "utf8"));
    const sec = Object.values(raw.graphs ?? {})[0] ?? raw.graph;
    doc = { header: { format: "em.json", version: "1.6", ...(raw.header ?? {}) }, graph: sec };
  } else {
    doc = { header: { format: "em.json", version: "1.6" }, graph: { graph_id: "t", name: "t", nodes: [
      { id: "E1", node_type: "EpochNode", name: "II d.C.", data: { start_time: 101, end_time: 200 } },
      { id: "U1", node_type: "US", name: "US 12", data: {} }], edges: [
      { id: "fe", source: "U1", target: "E1", edge_type: "has_first_epoch" }] } };
  }
  const before = py(`
import json,sys
from s3dgraphy import api
g,_ = api.load_emjson(json.loads(sys.stdin.read()))
print(json.dumps(api.units_without_3d(g)))`, doc);
  unit = before.without.find((u) => doc.graph.nodes.find((n) => n.id === u)?.node_type === "US") ?? before.without[0];
  ok(!!unit, "a unit without 3D to give a proxy to");
  const name = doc.graph.nodes.find((n) => n.id === unit).name;
  const rel = A.proxyRelPath(name);
  // the bytes: any glb-sized content stands for the sketch's (its digest is what counts)
  const bytes = Buffer.from(`glTF-sketch-of-${name}`);
  mkdirSync(`${dir}/proxies`, { recursive: true });
  writeFileSync(`${dir}/${rel}`, bytes);
  const sha = createHash("sha256").update(bytes).digest("hex");
  // what the bridge's /geometry-proxies answers: the DELTA create_geometry_proxy adds
  const delta = py(`
import json,sys
from s3dgraphy import api
body = json.loads(sys.stdin.read())
g,_ = api.load_emjson(body["doc"])
bn = {n.node_id for n in g.nodes}; be = {e.edge_id for e in g.edges}
api.create_geometry_proxy(g, body["unit"], {"url": body["url"]})
em = api.graph_to_emjson(g)["graph"]
print(json.dumps({"nodes": [n for n in em["nodes"] if n["id"] not in bn], "edges": [e for e in em["edges"] if e["id"] not in be]}))`,
    { doc, unit, url: rel });
  eq(delta.nodes.map((n) => n.node_type).sort(), ["property", "resource", "semantic_shape"], "the chain: a property, its shape, a proxy_model resource");
  const patched = A.patchProxyNodes(delta.nodes, rel, sha, bytes.length);
  const res = patched.find((n) => n.node_type === "resource");
  eq([res.data.url, res.data.url_type, res.data.checksum, res.data.residency], [rel, "proxy_model", `sha256:${sha}`, "resident"],
    "the resource: the path, proxy_model, the digest, resident");
  const prop = patched.find((n) => n.node_type === "property");
  eq(prop.data?.property_type ?? prop.property_type, "geometry", "the property is a geometry");
  const edgeTypes = delta.edges.map((e) => e.edge_type).sort();
  eq(edgeTypes, ["has_linked_resource", "has_property", "has_semantic_shape"], "has_property → has_semantic_shape → has_linked_resource");
  const after = { ...doc, graph: { ...doc.graph, nodes: [...doc.graph.nodes, ...patched], edges: [...doc.graph.edges, ...delta.edges] } };
  const read = py(`
import json,sys
from s3dgraphy import api
body = json.loads(sys.stdin.read())
g,_ = api.load_emjson(body["doc"])
u = api.units_without_3d(g)
inst = [r for r in api.threed_instances(g) if r["kind"] == "proxy" and r["owner"] == body["unit"]]
files = api.resolve_files(g, project_root=body["dir"], base_dirs=[body["dir"]])
mine = [f for f in files if f.get("id") in {x for r in inst for x in r["files"]}]
print(json.dumps({"with": body["unit"] in u["with"], "inst": inst, "files": mine}))`, { doc: after, unit, dir });
  ok(read.with, "s3Dgraphy reads it back: the unit has 3D now");
  eq(read.inst.length, 1, "threed_instances draws its proxy");
  ok(read.inst[0].files.length === 1 && !read.inst[0].empty, "…with its file");
  eq(read.files.map((f) => [f.state, f.path.endsWith(rel)]), [["on_disk", true]], "resolve_files finds it beside the em.json, with its digest");
  rmSync(dir, { recursive: true, force: true });
}

// ── /fs/write on a live bridge ───────────────────────────────────────────────
if (process.env.BRIDGE && process.env.FS_ROOT) {
  const target = `${process.env.FS_ROOT}/check-associate/proxies/US 99.glb`;
  rmSync(`${process.env.FS_ROOT}/check-associate`, { recursive: true, force: true });
  const put = (overwrite) => fetch(`${process.env.BRIDGE}/fs/write`, { method: "POST", body: Buffer.from("glb"),
    headers: { Origin: "http://localhost:5173", "X-EM-Path": encodeURIComponent(target), ...(overwrite ? { "X-EM-Overwrite": "1" } : {}) } });
  const r1 = await put(false);
  eq(r1.status, 200, "/fs/write: written inside the roots");
  ok(existsSync(target), "…the folder made, the file there");
  eq((await put(false)).status, 409, "a second time: refused, not overwritten");
  eq((await put(true)).status, 200, "…unless asked");
  const out = await fetch(`${process.env.BRIDGE}/fs/write`, { method: "POST", body: Buffer.from("x"),
    headers: { Origin: "http://localhost:5173", "X-EM-Path": encodeURIComponent("/etc/em-check.glb") } });
  eq(out.status, 403, "outside the roots: refused");
  rmSync(`${process.env.FS_ROOT}/check-associate`, { recursive: true, force: true });
} else console.log("  BRIDGE/FS_ROOT not set: /fs/write is not checked");

console.log(`check-space-associate: ${checks} checks passed`);
