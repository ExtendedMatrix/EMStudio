// NIGHT-CAMPAGNA-1-OTT · the defects of the test campaign of 1 Oct 2026
// (`.claude/wip/reports/2026-10-01-campagna/REFERTO.md`), one case per promise.
//
//   node scripts/check-campagna.mjs
//
// Pure modules through esbuild, and a bridge of its own (`tools/em_bridge.py`
// on a free port, `--fs-root` a temporary folder) for what only dtcstamp can
// say. Parte 1: the stamp of several files from A to Z —
//   · a receipt of a FILE SET is judged by its members, never by the door's
//     sha256 (difetto 1: the false «the file changed» right after the stamp);
//   · `/stamp/verify` says it member by member, `/stamp/tree` says what a
//     tileset folder and its .3tz are (one content digest for the two);
//   · `/stamp/emit` stamps a folder as `directory` and a .3tz as `archive` with
//     its `content_digest`; a .3tz stamped as `file` is «to update».
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, appendFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};
const sha = (b) => "sha256:" + createHash("sha256").update(b).digest("hex");

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export * as receipts from "./receipt";
      export * as compose from "./stamp-compose";
      export * as tree from "./stamp-tree";
      export * as tropy from "./tropy";
      export * as naming from "./naming";
      export { DocumentStore } from "./model";
      export { CALLS_OTHERS } from "./storage";
      export * as seal from "./seal";
      export { issues } from "./issues";
      export { ancestorsOf, allowedEdgeTypes, isStratigraphicType } from "./rules";
      export { documentDiagnostics } from "./logpanel";
      export { firstViewBounds, sceneBounds } from "./scene";
    `,
    resolveDir: SRC, loader: "ts",
  },
  bundle: true, format: "esm", write: false,
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
    },
  }],
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const { receipts, compose, tree, tropy, naming, DocumentStore, CALLS_OTHERS, seal, issues, ancestorsOf,
        allowedEdgeTypes, isStratigraphicType, documentDiagnostics, firstViewBounds, sceneBounds } = M;

// ── 1 · the receipt of a file set, judged by its members ───────────────────
{
  const rec = { id: "res:57a693d553e8", checksum: "sha256:57a6", stamp: 1, parents: [] };
  const fileSet = { self: { resource_id: "res:57a693d553e8", digest: "sha256:57a6", digest_covers: "members", packaging: "file_set" } };
  const door = "sha256:7aec";   // the obj's own sha256: NEVER the stamp's digest
  eq(receipts.coversMoreThanTheFile(fileSet), true, "1 · a file_set stamp covers more than its door");
  eq(receipts.coversMoreThanTheFile({ self: { digest_covers: "artifact", packaging: "file" } }), false,
     "1 · a stamp of one file does not");
  eq(receipts.coversMoreThanTheFile({ self: { packaging: "directory" } }), true, "1 · a directory does");
  eq(receipts.checkReceipt(rec, fileSet, door, { kind: "members", result: { ok: true } }), "ok",
     "1 · difetto 1: the members hold → «matches», whatever the door's sha256 is");
  eq(receipts.checkReceipt(rec, fileSet, door, null), "unreachable",
     "1 · no verdict from dtcstamp → nothing claimed (not «changed»)");
  eq(receipts.checkReceipt(rec, fileSet, null, { kind: "members", result: { ok: false, changed: ["textures/T.jpg"] } }),
     "file-changed", "1 · a member changed → «the file changed»");
  eq(receipts.verdictChanged({ kind: "members", result: { ok: false, changed: ["a.mtl"], missing: ["t.jpg"] } }),
     ["a.mtl", "t.jpg ✕"], "1 · …and the words name which member");
  eq(receipts.checkReceipt({ ...rec, checksum: "sha256:other" }, fileSet, null, { kind: "members", result: { ok: true } }),
     "sidecar-differs", "1 · a receipt that is not the sidecar's is still said so");
  eq(receipts.checkReceipt({ id: "r", checksum: "sha256:aa", stamp: 1, parents: [] },
     { self: { resource_id: "r", digest: "sha256:aa" } }, "sha256:bb"), "file-changed",
     "1 · one file: the sha256 is still compared (unchanged rule)");
}

// ── 2 · from the receipt to the document, and the 3D that shows ────────────
{
  const TEMPLU = JSON.parse(readFileSync(new URL("../testdata/TempluMare.em.json", import.meta.url), "utf8"));
  const docs = (names) => ({ graph: { nodes: names.map((n, i) => ({ id: `d${i}`, node_type: "document", name: n })), edges: [] } });
  eq(naming.nextDocumentName(docs(["D.01", "D.02", "D.03", "D.04", "D.05", "D.06", "D.07", "D.08", "D.11", "D.20", "D.1000"])),
     "D.09", "4 · the graph's spelling: after D.01…D.08 comes D.09, not D.9 (TempluMare)");
  eq(naming.nextDocumentName(docs(["D.1", "D.3"])), "D.2", "4 · a graph without zero padding keeps D.2");
  eq(naming.nextDocumentName(docs(["D.001"])), "D.002", "4 · …and three digits stay three");
  const st = new DocumentStore(TEMPLU);
  const n0 = st.doc.graph.nodes.length, e0 = st.doc.graph.edges.length;
  const dir = "/data/RM/TempluMare_tiles/LOD1";
  const entry = { id: "e1", name: "OB_PODIO_LOD1.obj", locator: `${dir}/OB_PODIO_LOD1.obj`, checksum: "sha256:" + "5".repeat(64) };
  const r = tropy.promoteToDocument(st, entry, { packaging: "file_set", checksum: "sha256:" + "5".repeat(64), files: [
    { path: "OB_PODIO_LOD1.obj", url: `${dir}/OB_PODIO_LOD1.obj`, checksum: "sha256:" + "a".repeat(64), size_bytes: 10, role: "entry_point" },
    { path: "OB_PODIO_LOD1.mtl", url: `${dir}/OB_PODIO_LOD1.mtl`, checksum: "sha256:" + "b".repeat(64), size_bytes: 2, role: "member" },
    { path: "textures/T_OB_PODIO_LOD1.jpg", url: `${dir}/textures/T_OB_PODIO_LOD1.jpg`, checksum: "sha256:" + "c".repeat(64), size_bytes: 3, role: "member" }] });
  const doc = st.node(r.documentId);
  eq([doc.node_type, doc.data?.url, doc.data?.checksum], ["document", undefined, undefined],
     "4 · «Promote to document»: a DocumentNode with NO url and NO checksum");
  const links = st.doc.graph.edges.filter((e) => e.source === r.documentId);
  eq(links.map((e) => e.edge_type), ["has_linked_resource"], "4 · …linked to its resource by has_linked_resource");
  const res = st.node(links[0].target);
  eq([res.node_type, res.data.packaging, res.data.url, res.data.checksum], ["resource", "file_set", "", "sha256:" + "5".repeat(64)],
     "4 · …a ResourceNode, packaging file_set, the members digest as its checksum, no url of its own");
  const files = st.doc.graph.edges.filter((e) => e.source === res.id && e.edge_type === "has_file");
  eq(files.map((e) => [e.attributes?.role, e.attributes?.path, st.node(e.target)?.node_type]),
     [["entry_point", "OB_PODIO_LOD1.obj", "resource_file"], ["member", "OB_PODIO_LOD1.mtl", "resource_file"],
      ["member", "textures/T_OB_PODIO_LOD1.jpg", "resource_file"]], "4 · …and three ResourceFileNodes by has_file, the door first");
  eq([st.doc.graph.nodes.length - n0, st.doc.graph.edges.length - e0], [5, 4], "4 · 5 nodes and 4 edges (the campaign measured 0 edges)");
  st.undo();
  eq([st.doc.graph.nodes.length, st.doc.graph.edges.length], [n0, e0], "4 · one undo step takes it all back");
  for (const f of ["a/OB.obj", "a/OB.mtl", "m.gltf", "t/tileset.json"])
    ok(CALLS_OTHERS.test(f), `5 · ${f} calls other files: /fs/at/<path>`);
  for (const f of ["a.jpg", "b.pdf", "c.glb", "d.3tz", "tileset.json.bak"])
    ok(!CALLS_OTHERS.test(f), `5 · ${f} does not: /fs/file?path= stays`);
}

// ── 3 · the seal ─────────────────────────────────────────────────────────────
{
  const d1 = "sha256:57a693d553e8c28fcafd59fa17b1c88c6419efe73890a657d6f244366b688d91";
  const d2 = "sha256:8aa6fbd3e5847e9f8c2e219fb4305d9a3ad52e41135120e79bb8c3d18b67caed";
  eq(seal.hexOf(d1).slice(0, 6), "57a693", "3 · the seal says the first six hex of the digest");
  eq(seal.sealEdge(seal.hexOf(d1)), seal.sealEdge(seal.hexOf(d1)), "3 · the edge is deterministic: same digest, same wax");
  ok(seal.sealEdge(seal.hexOf(d1)) !== seal.sealEdge(seal.hexOf(d2)), "3 · …and another digest runs another way");
  ok(/^M[\d.,L]+Z$/.test(seal.sealEdge(seal.hexOf(d1))), "3 · the edge is a closed path of 28 points");
  eq(seal.canonicalMembers([{ role: "member", path: "textures/T.jpg", digest: "sha256:c" },
                            { role: "entry_point", path: "OB.obj", digest: "sha256:a" },
                            { role: "member", path: "OB.mtl", digest: "sha256:b" }]),
     "member ␀ OB.mtl ␀ sha256:b\nentry_point ␀ OB.obj ␀ sha256:a\nmember ␀ textures/T.jpg ␀ sha256:c",
     "3 · the canonical list in path order (role ␀ path ␀ digest)");
  eq(seal.canonicalMembers([{ path: "é.jpg", digest: "x" }, { path: "z.jpg", digest: "y" }, { path: "B.jpg", digest: "w" }])
       .split("\n").map((l) => l.split(" ␀ ")[1]),
     ["B.jpg", "z.jpg", "é.jpg"], "3 · …ordered by the UTF-8 BYTES of the path, as dtcstamp does");
  const w = seal.sealWords({ self: { digest: d1, packaging: "file_set", label: "OB_PODIO_LOD1.obj", members: [
    { role: "member", path: "OB_PODIO_LOD1.mtl" }, { role: "entry_point", path: "OB_PODIO_LOD1.obj" },
    { role: "member", path: "textures/T_OB_PODIO_LOD1.jpg" }] },
    from: [{ resource_id: "declared:x", label: "OB_PODIO" }], how: { dtc_kind: "format_conversion", software: [{ name: "Blender 5.2" }] },
    by: { at: "2026-10-01", operator: { label: "Emanuel Demetrescu", id: "https://orcid.org/0000-0002-5065-7970" } } });
  ok(/3/.test(w.what) && /OB_PODIO_LOD1\.obj/.test(w.what) && /T_OB_PODIO_LOD1\.jpg/.test(w.what), "3 · in words: one resource, 3 files, its door and what it calls");
  eq([w.who, w.when, w.withWhat], ["Emanuel Demetrescu · 0000-0002-5065-7970", "2026-10-01", "Blender 5.2"], "3 · who, when, with what");
  ok(/OB_PODIO/.test(w.from), "3 · where it comes from");
}

// ── 4 · the warnings that correct ───────────────────────────────────────────
{
  const TEMPLU = JSON.parse(readFileSync(new URL("../testdata/TempluMare.em.json", import.meta.url), "utf8"));
  const st = new DocumentStore(TEMPLU);
  const tt = (k, v) => `${k}${v ? JSON.stringify(v) : ""}`;
  const fixers = {
    assignEpoch: (u, e) => st.addEdge(u, e, "has_first_epoch"),
    itsMe: { label: "me", run: (x) => st.batch(() => { const a = "author:test"; if (!st.node(a)) st.addNode({ id: a, node_type: "author", name: "Prova" }); st.addEdge(x, a, "has_author"); }) },
    rename: { label: "Rename", run: (id, v) => st.updateNode(id, { name: v }) },
    retype: (edgeId, et, rev) => { const e = st.liveEdges().find((x) => x.id === edgeId); st.batch(() => { st.deleteEdge(e);
      st.addEdge(rev ? e.target : e.source, rev ? e.source : e.target, et); }); },
    addProperty: { label: "+", run: (u) => st.batch(() => { const p = st.newId(); st.addNode({ id: p, node_type: "property", name: "Material" }); st.addEdge(u, p, "has_property"); }) },
  };
  const run = () => issues({ doc: st.doc, nodes: st.liveNodes(), isUnit: isStratigraphicType, t: tt, fixers,
    diagnostics: documentDiagnostics(st.doc).flatMap((g) => g.records),
    namedByConstruction: (nt) => ancestorsOf(nt).includes("ContinuityNode") });
  const by = (rule) => run().filter((i) => i.rule === rule);
  const dups = by("dupname").map((i) => st.node(i.node).name).sort();
  ok(["T25", "T26", "T44"].every((n) => dups.filter((x) => x === n).length === 2),
     `12 · «nome doppio» finds T25, T26 and T44 twice each (${[...new Set(dups)].join(", ")})`);
  ok(!run().some((i) => i.rule === "dupname" && st.node(i.node).node_type === "property"), "12 · …never a property (same name by construction)");
  ok(!run().some((i) => i.rule === "dupname" && st.node(i.node).node_type === "BR"), "12 · …nor a continuity node (its name is the importer's)");
  const degraded = by("datamodel").filter((i) => i.fix);
  ok(degraded.length > 0 && degraded.every((i) => i.fix.kind === "pick" && i.fix.options.length > 0),
     "12 · every generic_connection offers the relations the datamodel admits");
  const one = degraded[0];
  const e0 = st.liveEdges().find((e) => e.edge_type === "generic_connection" && e.source === one.node);
  const want = [...allowedEdgeTypes(st.node(e0.source).node_type, st.node(e0.target).node_type).map((e) => `${e}|`),
                ...allowedEdgeTypes(st.node(e0.target).node_type, st.node(e0.source).node_type).map((e) => `${e}|rev`)];
  eq(one.fix.options.map((o) => o.value), want, "12 · …computed by allowedEdgeTypes, both ways round (never listed by hand)");
  // one correction per rule: the warning goes, the undo brings it back
  const cases = [
    ["datamodel", (i) => i.fix.run(i.fix.options[0].value)],
    ["dupname", (i) => i.fix.run(`${st.node(i.node).name}-b`)],
    ["author", (i) => i.fix.run()],
    ["paradata", (i) => i.fix.run()],
  ];
  for (const [rule, apply] of cases) {
    const before = by(rule).length;
    const i = by(rule).find((x) => x.fix);
    apply(i);
    const after = by(rule).length;
    ok(after < before && !by(rule).some((x) => x.node === i.node && x.txt === i.txt), `12 · ${rule}: the fix removes the warning (${before} → ${after})`);
    st.undo();
    eq(by(rule).length, before, `12 · ${rule}: one undo brings it back`);
  }
  // epoch: a unit without has_first_epoch
  const unit = st.liveNodes().find((n) => isStratigraphicType(n.node_type) && n.node_type !== "BR");
  const he = st.liveEdges().find((e) => e.source === unit.id && e.edge_type === "has_first_epoch");
  st.deleteEdge(he);
  const ep = by("epoch").find((i) => i.node === unit.id);
  ok(ep?.fix?.kind === "pick" && ep.fix.options.some((o) => o.value === he.target), "12 · epoch: the menu lists the epochs");
  ep.fix.run(he.target);
  ok(!by("epoch").some((i) => i.node === unit.id), "12 · epoch: assigning it removes the warning");
  st.undo();
  ok(by("epoch").some((i) => i.node === unit.id), "12 · epoch: one undo brings it back");
}

// ── 5 · the small ones: the first view of the Matrix ───────────────────────
{
  const n = (id, x, y) => ({ id, x, y, w: 60, h: 30 });
  const sc = { nodes: [n("a", 100, 220), n("b", 400, 240), n("c", 50, 900), n("d", 3000, 1500)],
               lanes: [{ id: "new", y: 0, height: 180 }, { id: "mid", y: 180, height: 200 }, { id: "old", y: 380, height: 1400 }] };
  const b = firstViewBounds(sc);
  eq([b.y, b.h], [180, 200], "13 · the Matrix opens on the first lane (top) that HAS nodes — the empty newest one is skipped");
  ok(b.x < 100 && b.x + b.w > 460 && b.w < 1000, "13 · …from the left of its nodes to their right, not the whole graph");
  eq(firstViewBounds({ nodes: sc.nodes, lanes: [] }), sceneBounds({ nodes: sc.nodes, lanes: [] }),
     "13 · a scene without lanes (Graph, DTC) opens on all of it");
}

// ── the bridge of this check ────────────────────────────────────────────────
const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const dir = realpathSync(mkdtempSync(`${tmpdir()}/campagna-`));
let proc = null;
let base = null;
if (!existsSync(PY)) console.log("  (s3Dgraphy venv not found: the bridge cases are skipped)");
else {
  const port = await new Promise((res) => { const srv = createServer(); srv.listen(0, () => {
    const pt = srv.address().port; srv.close(() => res(pt)); }); });
  proc = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--s3dgraphy", `${S3D}src`, "--fs-root", dir],
    { stdio: "ignore", env: { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state` } });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
}
const H = { Origin: "http://localhost:5173", "content-type": "application/json" };
const post = async (route, body) => (await fetch(`${base}${route}`, { method: "POST", headers: H, body: JSON.stringify(body) })).json();

try {
  if (base) {
    compose.setComposeBridgeResolver(async () => base);
    tree.setTreeBridgeResolver(async () => base);
    const nodeFetch = globalThis.fetch;
    globalThis.fetch = (u, init = {}) => nodeFetch(u, { ...init, headers: { ...(init.headers ?? {}), Origin: H.Origin } });

    // a tile: obj → mtl → texture
    mkdirSync(`${dir}/tile/textures`, { recursive: true });
    writeFileSync(`${dir}/tile/T.obj`, "mtllib T.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl m\nf 1 2 3\n");
    writeFileSync(`${dir}/tile/T.mtl`, "newmtl m\nmap_Kd textures/T.jpg\n");
    writeFileSync(`${dir}/tile/textures/T.jpg`, "not really a jpeg");
    const sets = await compose.fetchSets([`${dir}/tile/T.obj`]);
    const set = sets[`${dir}/tile/T.obj`];
    eq(set?.members?.length, 3, "1 · the door calls 2 files: a set of 3");

    // stamp it as a file set, through the composer and the bridge
    const draft = compose.newDraft([{ path: `${dir}/tile/T.obj`, name: "T.obj", size: 10, mtime: 0 }]);
    draft.sets = sets;
    compose.applyHandle(draft);
    Object.assign(draft, { origin: true, originDeclared: true, campaign: "prova", kind: "photo", at: "2026-10-01",
      operator: { id: "", label: "Prova" } });
    const res = await compose.emitDraft(draft, { graph_id: "campagna" });
    eq(res.written.length, 1, "1 · one sidecar, beside the door");
    const v1 = await tree.verifyStamp(`${dir}/tile/T.obj`);
    eq([v1?.kind, v1?.result?.ok], ["members", true], "1 · /stamp/verify: the members hold");
    const side = JSON.parse(readFileSync(`${dir}/tile/T.obj.stamp.json`, "utf8"));
    const rec = res.stamps[0].receipt;
    ok(rec.checksum === side.self.digest && rec.checksum !== sha(readFileSync(`${dir}/tile/T.obj`)),
       "1 · the receipt's checksum is the members digest, not the obj's sha256");
    eq(receipts.checkReceipt(rec, side, sha(readFileSync(`${dir}/tile/T.obj`)), v1), "ok",
       "1 · difetto 1 end to end: the shelf says «matches» right after the stamp");
    appendFileSync(`${dir}/tile/textures/T.jpg`, " retouched");
    const v2 = await tree.verifyStamp(`${dir}/tile/T.obj`);
    eq(v2?.result?.changed, ["textures/T.jpg"], "1 · a retouched texture is named by /stamp/verify");
    eq(receipts.checkReceipt(rec, side, null, v2), "file-changed", "1 · …and the receipt says the file changed");

    // a tileset, and its .3tz
    mkdirSync(`${dir}/ts/Data`, { recursive: true });
    writeFileSync(`${dir}/ts/tileset.json`, JSON.stringify({ asset: { version: "1.0" }, geometricError: 1,
      root: { boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }, geometricError: 0, content: { uri: "Data/a.b3dm" } } }));
    writeFileSync(`${dir}/ts/Data/a.b3dm`, "b3dm bytes");
    execFileSync("python3", ["-c", "import sys; sys.path.insert(0, sys.argv[1]); import archive_3tz; archive_3tz.write_3tz(sys.argv[2], sys.argv[3])",
      TOOLS, `${dir}/ts`, `${dir}/ts.3tz`]);
    const tf = await post("/stamp/tree", { path: `${dir}/ts` });
    const ta = await post("/stamp/tree", { path: `${dir}/ts.3tz` });
    eq([tf.packaging, tf.digest_covers, ta.packaging, ta.digest_covers], ["directory", "members", "archive", "artifact"],
       "8 · /stamp/tree: a tileset folder is a directory, a .3tz an archive");
    eq(tf.content_digest.digest, ta.content_digest.digest, "8 · …the two forms of one tileset share the content digest");
    eq(tf.digest, tf.content_digest.digest, "8 · a folder's digest IS its content digest");
    eq(ta.digest, sha(readFileSync(`${dir}/ts.3tz`)), "8 · an archive's digest is its file's sha256");
    eq((await post("/stamp/tree", { path: `${dir}/tile` })).ok, false, "8 · a folder without tileset.json is not a tree");

    // emit the folder and the archive
    for (const [path, packaging] of [[`${dir}/ts`, "directory"], [`${dir}/ts.3tz`, "archive"]]) {
      const tr = await tree.treeOf(path);
      const d = compose.newDraft([{ path: packaging === "directory" ? `${path}/tileset.json` : path,
        name: packaging === "directory" ? "tileset.json" : "ts.3tz", size: 1, mtime: 0 }]);
      d.tree = tr;
      compose.applyHandle(d);
      eq([d.outputs.length, d.outputs[0].path, d.outputs[0].tree?.packaging], [1, path, packaging],
         `8 · the handle makes ONE output of the ${packaging}, its path the ${packaging === "directory" ? "folder" : "file"}`);
      Object.assign(d, { origin: true, originDeclared: true, campaign: "prova", kind: "photo", at: "2026-10-01",
        operator: { id: "", label: "Prova" } });
      const r = await compose.emitDraft(d, { graph_id: "campagna" });
      const st = existsSync(`${path}.stamp.json`) ? JSON.parse(readFileSync(`${path}.stamp.json`, "utf8")) : null;
      eq([st?.self?.packaging, st?.self?.content_digest?.digest], [packaging, tf.content_digest.digest],
         `8 · /stamp/emit writes a ${packaging} stamp with the content digest (${r.refused.map((x) => x.why).join("; ")})`);
      const v = await tree.verifyStamp(path);
      eq([v?.kind, v?.result?.ok], ["tree", true], `8 · /stamp/verify checks the ${packaging} by its content`);
    }
    // E.D.'s case: a .3tz stamped as one file, before the profile
    execFileSync("cp", [`${dir}/ts.3tz`, `${dir}/old.3tz`]);
    writeFileSync(`${dir}/old.3tz.stamp.json`, JSON.stringify({ stamp: 1, self: { resource_id: "res:x",
      digest: sha(readFileSync(`${dir}/old.3tz`)), digest_covers: "artifact", packaging: "file" },
      how: { dtc_kind: "transformation" }, from: [{ resource_id: "declared:x" }] }));
    const old = await post("/stamp/tree", { path: `${dir}/old.3tz`, stamp: true });
    eq([old.stamp?.stale, old.stamp?.why?.map((w) => w.code)], [true, ["packaging", "no-content-digest"]],
       "8 · a .3tz stamped as `file` is «to update»: the packaging, and no content digest");
    eq([old.proposed_self.packaging, old.proposed_self.content_digest.digest], ["archive", tf.content_digest.digest],
       "8 · …with the proposal (archive + the content digest)");
    ok(JSON.parse(readFileSync(`${dir}/old.3tz.stamp.json`, "utf8")).self.packaging === "file",
       "8 · …and the stamp is NOT rewritten");
    // ── 5 · the header row of a sheet, and the whole disk ────────────────────
    execFileSync(PY, ["-c", `import pandas as pd
pd.DataFrame([["San Pietro", None, None], ["Nome", "Descrizione", "Url"], ["D.01", "Rilievo", None], ["D.02", "Incisione", "x"]]).to_excel(${JSON.stringify(`${dir}/sources.xlsx`)}, header=False, index=False)`]);
    const f1 = await post("/mapping-fields", { path: `${dir}/sources.xlsx` });
    eq([f1.header_proposal, f1.fields.map((x) => x.name)[0]], [2, "San Pietro"],
       "15 · /mapping-fields proposes row 2 (the first with every column filled); row 1 is still what s3Dgraphy reads by itself");
    const f2 = await post("/mapping-fields", { path: `${dir}/sources.xlsx`, header_row: 2 });
    eq([f2.header_row, f2.fields.map((x) => x.name)], [2, ["Nome", "Descrizione", "Url"]], "15 · …and from row 2 the fields are the real ones");
    eq(f2.fields.find((x) => x.name === "Url").samples, ["", "x"], "15 · …an empty cell is empty, not «nan»");
    const r0 = await fetch(`${base}/fs/roots`, { method: "POST", headers: H, body: JSON.stringify({ action: "add", path: "/" }) });
    eq([r0.status, (await r0.json()).code], [409, "whole-disk"], "10 · the whole disk is not served on one click: 409 whole-disk");
    const rr = await (await fetch(`${base}/fs/roots`, { headers: H })).json();
    ok(!rr.roots.includes("/"), "10 · …and «/» is not among the served folders");

  }
} finally {
  proc?.kill();
}

if (fails.length) {
  console.error(`campagna: ${fails.length} of ${checks} checks FAILED:\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`campagna: ${checks} checks passed`);
