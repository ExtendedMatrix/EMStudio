// MICRO-B-DOCUMENTI-MEDIA · executable check of src/media.ts and of the
// implicit members of src/resources.ts: one node per set, the members listed
// inside it (data.members), materialized when used; sets inside sets
// (has_sub_resource); the catalogue open / closed, its entries cited
// «D.30 · 18383»; the media of a node, the frontispiece first; the roles.
// With s3Dgraphy next door (../../s3Dgraphy) it builds the same lapidary in
// Python and checks the page reads it as s3Dgraphy does (PARITY).
//
//   node scripts/check-media.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const M = await load("media.ts");
const R = await load("resources.ts");
const P = await load("provenance.ts");

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };
const sha = (s) => `sha256:${s.padEnd(64, "0").slice(0, 64)}`;

// ── 1 · a directory with its rows: no file node, the list is the index ──────
const node = (id, node_type, name, data = {}) => ({ id, node_type, name, data });
const edge = (source, edge_type, target, attributes) => ({ id: `${source}-${edge_type}-${target}`, source, target, edge_type, ...(attributes ? { attributes } : {}) });
const rows = [];
for (const c of ["Cat0", "Cat1"]) for (const p of ["18380", "18381"]) for (const i of [0, 1, 2])
  rows.push({ path: `${c}/${p}/IMG_00${i}.jpg`, digest: sha(`${c}${p}${i}`.replace(/[^0-9a-f]/gi, "a")), size_bytes: 100 + i });
const g = { nodes: [node("graph", "graph", "g"), node("LAP", "resource", "Lapidario", { url: "RB/lapidario", packaging: "directory", members: rows.map((r) => ({ ...r })) })], edges: [] };
const rg = R.plainGraph(g);
const files = R.resourceFiles(rg, "LAP");
eq(files.length, 12, "the rows are the files");
ok(files.every((f) => f.implicit && f.listed), "listed, implicit");
eq(g.nodes.filter((n) => n.node_type === "resource_file").length, 0, "no file node written by reading");
eq(files[0].node.data.url, `RB/lapidario/${files[0].path}`, "the locator is the set's url and the path");
eq(files[0].node.id, R.fileIdFor("LAP", files[0].path, files[0].member.digest), "the transient id IS the id it will get");

// materialized: one node, the row stays, a second call adds nothing
const m1 = R.materializeMember(rg, "LAP", "Cat1/18381/IMG_002.jpg", { name: "Architrave, fronte" });
ok(m1.created, "materialized");
const fn = g.nodes.find((n) => n.id === m1.file_id);
eq([fn.node_type, fn.name, fn.data.url], ["resource_file", "Architrave, fronte", "RB/lapidario/Cat1/18381/IMG_002.jpg"], "the node: a file, its name, its locator");
eq(R.resourceFiles(rg, "LAP").length, 12, "each path once");
eq(R.materializeMember(rg, "LAP", "Cat1/18381/IMG_002.jpg"), { file_id: m1.file_id, created: false }, "done once");
eq(R.memberRows(rg, "LAP").length, 12, "the row stays: the list is the index");

// a logical group drawing from the directory
const gr = { nodes: [node("graph", "graph", "g"), node("LAP", "resource", "Lapidario", { url: "RB/lapidario", packaging: "directory", members: rows.map((r) => ({ ...r })) }),
  node("US1", "US", "US1"), node("GRP", "resource", "US1 · fotogrammetria", { url: "", packaging: "file_set", members: [], members_from: "LAP", media_role: "photogrammetry" })],
  edges: [edge("US1", "has_linked_resource", "GRP")] };
const rg2 = R.plainGraph(gr);
R.addMembers(rg2, "GRP", rows.slice(0, 3).map((r) => ({ path: r.path, digest: r.digest, size_bytes: r.size_bytes })));
const grp = gr.nodes.find((n) => n.id === "GRP");
ok(/^sha256:/.test(grp.data.checksum) && grp.data.digest_covers === "members", "a group's identity: the digest of its list");
eq(R.resourceFiles(rg2, "GRP").map((f) => f.node.data.url), rows.slice(0, 3).map((r) => `RB/lapidario/${r.path}`), "the group's paths are the directory's");
const m2 = R.materializeMember(rg2, "GRP", rows[0].path);
eq(gr.edges.filter((e) => e.edge_type === "has_file" && e.target === m2.file_id).map((e) => e.source).sort(), ["GRP", "LAP"], "one node, held by the group and by its directory");
eq(R.removeMembers(rg2, "GRP", [rows[0].path]), { removed: 1, edges: 1 }, "out of the group: row and edge");
ok(gr.nodes.some((n) => n.id === m2.file_id), "the node stays: the directory holds it");

// ── 2 · sets inside sets, the catalogue ─────────────────────────────────────
const cat = { nodes: [node("graph", "graph", "g"), node("D30", "document", "D.30"),
  node("ROOT", "resource", "Lapidario", { url: "RB/lap", packaging: "directory" }),
  node("C1", "resource", "Architravi", { url: "RB/lap/Cat1", packaging: "directory" }),
  node("P1", "resource", "18383", { url: "RB/lap/Cat1/18383", packaging: "directory", members: [{ path: "a.jpg", digest: sha("a1"), size_bytes: 10 }, { path: "b.jpg", digest: sha("b1"), size_bytes: 20, media_role: "frontispiece" }] }),
  node("P2", "resource", "18384", { url: "RB/lap/Cat1/18384", packaging: "directory", members: [{ path: "c.pdf", digest: sha("c1"), size_bytes: 5 }] }),
  node("PS", "property", "absolute_time_start", { value: "2024", property_type: "absolute_time_start" })],
  edges: [edge("D30", "has_linked_resource", "ROOT"), edge("ROOT", "has_sub_resource", "C1", { path: "Cat1" }),
          edge("C1", "has_sub_resource", "P1", { path: "18383" }), edge("C1", "has_sub_resource", "P2", { path: "18384" }),
          edge("D30", "has_property", "PS")] };
const ix = M.mediaIndex(cat);
ok(M.isCatalogue(ix, "D30"), "a document whose set has parts is a catalogue");
eq(M.cite(ix, "P1"), "D.30 · 18383", "an entry is cited as a page");
eq(M.cite(ix, "ROOT"), "D.30", "the root is the catalogue");
const cs = M.catalogueState(ix, "D30");
eq([cs.state, cs.start, cs.end, cs.live, cs.entries, cs.sections, cs.files, cs.bytes], ["open", 2024, null, true, 2, 1, 3, 35], "open: counted live");
eq(M.catalogueEntries(ix, "D30").map((e) => [e.path, e.citation]), [["Cat1/18383", "D.30 · 18383"], ["Cat1/18384", "D.30 · 18384"]], "the entries");
const items = M.mediaOf(ix, "D30");
eq(items.map((x) => [x.name, x.medium, x.doc, x.folder]), [["b.jpg", "image", "D30", "Cat1/18383"], ["a.jpg", "image", "D30", "Cat1/18383"], ["c.pdf", "pdf", "D30", "Cat1/18384"]],
   "the media of a catalogue: its whole tree, the frontispiece first, each «in the document»");
eq(M.mediaOf(ix, "P2").map((x) => x.doc), ["D30"], "an entry's file is in the catalogue");
cat.nodes.push(node("PE", "property", "absolute_time_end", { value: "2026", property_type: "absolute_time_end" }));
cat.edges.push(edge("D30", "has_property", "PE"));
eq(M.catalogueState(M.mediaIndex(cat), "D30").state, "ended_unstamped", "an end without a stamp is said");
cat.nodes.find((n) => n.id === "D30").data = { catalog_stamp: { entries: 2, sections: 1, files: 3, bytes: 35, members_digest: "sha256:x" } };
cat.nodes.find((n) => n.id === "P2").data.members.push({ path: "late.jpg", digest: sha("d1") });
const closed = M.catalogueState(M.mediaIndex(cat), "D30");
eq([closed.state, closed.live, closed.files], ["closed", false, 3], "closed: the stamp's counts, final");
eq(M.treeRows(M.mediaIndex(cat), "ROOT").map((r) => r.path), ["Cat1/18383/a.jpg", "Cat1/18383/b.jpg", "Cat1/18384/c.pdf", "Cat1/18384/late.jpg"], "the tree's rows, prefixed");

// a set nobody censused is «not censused»; the unit's own media
const loose = { nodes: [node("graph", "graph", "g"), node("US1", "US", "US1"),
  node("G1", "resource", "US1 · frontespizio", { packaging: "file_set", media_role: "frontispiece", members: [{ path: "x.jpg", digest: sha("e1") }] }),
  node("G2", "resource", "US1 · fotogrammetria", { packaging: "file_set", media_role: "photogrammetry", members: [{ path: "y1.jpg", digest: sha("f1") }, { path: "y2.jpg", digest: sha("f2") }] })],
  edges: [edge("US1", "has_linked_resource", "G2"), edge("US1", "has_linked_resource", "G1")] };
const li = M.mediaIndex(loose);
const um = M.mediaOf(li, "US1");
eq(um.map((x) => [x.name, x.role, x.doc]), [["x.jpg", "frontispiece", null], ["y1.jpg", "photogrammetry", null], ["y2.jpg", "photogrammetry", null]],
   "a unit's groups: the frontispiece first, «non censito»");
eq(M.groupItems(li, um, "role", { none: "—", role: (r) => r }).map(([k, l]) => [k, l.length]), [["frontispiece", 1], ["photogrammetry", 2]], "the tree by role");

// roles: base, the project's
eq(M.mediaRoles({ nodes: [], edges: [] }).map((r) => r.id).slice(0, 3), ["photogrammetry", "frontispiece", "detail"], "the base roles in their order");
eq(M.localRoleId("Frontespizio"), "frontispiece", "a base label is the base term");
eq(M.localRoleId("Calco in gesso"), "local:calco_in_gesso", "a term of the project");

// the resolver: an entry inherits the catalogue (level «set»)
{
  const doc = { graphs: { g: { nodes: cat.nodes, edges: cat.edges } }, active_graph_id: "g", graph: { nodes: cat.nodes, edges: cat.edges } };
  const pix = P.provIndex(doc);
  const r = P.resolveProvenance(pix, "P1", "absolute_time_start");
  eq([r.value, r.level, r.origin], [2024, "set", "D30"], "an entry's start: from the catalogue, through its sets");
}

// ── 3 · PARITY with s3Dgraphy (the same lapidary built in Python) ───────────
const S3D = path.resolve(new URL("../../../s3Dgraphy", import.meta.url).pathname);
const PY = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(PY) && fs.existsSync(path.join(S3D, "src/s3dgraphy/resources/catalog.py"))) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-media-"));
  const script = `
import json, os, sys
from s3dgraphy import api
from s3dgraphy.graph import Graph
from s3dgraphy.nodes.graph_node import GraphNode
from s3dgraphy.nodes.document_node import DocumentNode
from s3dgraphy.resources import files as F, sets as S, catalog as C
from s3dgraphy.resolvers import get_rule, resolve_provenance
import dtcstamp
root = sys.argv[1]
lap = os.path.join(root, "lapidario")
for c in range(2):
    for p in range(2):
        d = os.path.join(lap, f"Cat{c}", f"{18380 + c * 10 + p}")
        os.makedirs(d, exist_ok=True)
        for i in range(3):
            open(os.path.join(d, f"IMG_{i:03d}.jpg"), "wb").write(b"\\xff\\xd8" + f"{c}{p}{i}".encode())
g = Graph("g"); g.add_node(GraphNode("graph-g", name="g"))
rows = F.directory_rows(lap)
F.add_resource(g, name="Lapidario", resource_id="LAP", packaging="directory", data={"url": "RB/lapidario", "members": [],
               "content_digest": {"digest": dtcstamp.content_digest(lap, entry_point=None), "files": len(rows)}})
F.add_members(g, "LAP", rows)
S.split_by_folder(g, "LAP", depth=2)
g.add_node(DocumentNode("D30", name="D.30"))
g.add_edge("D30__l__LAP", "D30", "LAP", "has_linked_resource")
C.open_catalogue(g, "D30", start=2024)
piece = C.catalogue_entries(g, "D30")[1]["id"]
fid = F.materialize_member(g, piece, "IMG_001.jpg", name="la buona")["file_id"]
st = C.catalogue_state(g, "D30")
out = {"doc": api.graph_to_emjson(g),
       "state": {k: st[k] for k in ("state", "start", "entries", "sections", "files", "bytes")},
       "entries": [[e["path"], e["citation"]] for e in C.catalogue_entries(g, "D30")],
       "piece": piece, "files": [[f["path"], f["node"].node_id, f["implicit"]] for f in F.resource_files(g, piece)],
       "tree_digest": F.rows_digest(S.tree_rows(g, "LAP")), "root_digest": g.find_node_by_id("LAP").data["content_digest"]["digest"],
       "prov": [resolve_provenance(g, fid, get_rule("absolute_time_start"))[k] for k in ("value", "level", "origin")],
       "fid": fid}
json.dump(out, open(os.path.join(root, "out.json"), "w"))
`;
  fs.writeFileSync(path.join(tmp, "make.py"), script);
  execFileSync(PY, [path.join(tmp, "make.py"), tmp], { env: { ...process.env, PYTHONPATH: path.join(S3D, "src") }, stdio: ["ignore", "ignore", "inherit"] });
  const py = JSON.parse(fs.readFileSync(path.join(tmp, "out.json"), "utf8"));
  const gr0 = py.doc.graph ?? Object.values(py.doc.graphs)[0];
  const pg = { nodes: gr0.nodes, edges: gr0.edges };
  const pix = M.mediaIndex(pg);
  const st = M.catalogueState(pix, "D30");
  eq({ state: st.state, start: st.start, entries: st.entries, sections: st.sections, files: st.files, bytes: st.bytes }, py.state, "PARITY · the catalogue's state and counts");
  eq(M.catalogueEntries(pix, "D30").map((e) => [e.path, e.citation]), py.entries, "PARITY · the entries and their citations");
  eq(R.resourceFiles(R.plainGraph(pg), py.piece).map((f) => [f.path, f.node.id, f.implicit]), py.files, "PARITY · a piece's files: listed and written, the same ids");
  eq(R.rowsDigest(M.treeRows(pix, "LAP")), py.tree_digest, "PARITY · the digest of the tree's rows");
  eq(py.tree_digest, py.root_digest, "…which is the lapidary's content digest (dtcstamp)");
  const doc = { graphs: { g: pg }, active_graph_id: "g", graph: pg };
  const pr = P.resolveProvenance(P.provIndex(doc), py.fid, "absolute_time_start");
  eq([pr.value, pr.level, pr.origin], py.prov, "PARITY · a file of an entry inherits the catalogue's start (level set)");
} else console.log("– parity with s3Dgraphy: no ../../s3Dgraphy with resources/catalog.py: skipped");

console.log(`media: ${checks} checks passed`);
