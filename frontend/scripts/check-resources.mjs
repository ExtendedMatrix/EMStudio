// NIGHT-RISORSA-FILE · executable check of the resource and its files.
//
//   node scripts/check-resources.mjs
//
// The resource is the SET, the file is each FILE (s3Dgraphy 1.6.17/1.6.31,
// decision of E.D. 30 Sep 2026). EMStudio mirrors `api.add_resource` in
// `resources.ts`; this file asks that mirror the same questions s3Dgraphy's
// tests ask, and compares its output with a golden made BY s3Dgraphy
// (`testdata/resources-golden.json`, written by `tools/resources_golden.py`).
//
// Sections:
//   0. the style keys: `resource` → LINK, `resource_file` → FILE (icons + palette)
//   1. the mirror: the scenario of `tools/resources_golden.py`, step by step
//   2. one constructor: no source writes a resource node by hand
//      (`node scripts/check-resources.mjs --scan <root>` scans another tree)
//   3. on the real store: one gesture one undo step, save and reopen, the
//      TempluMare graphs unchanged in their resources, a revision, the drawing
//   4. the minimap: its red is the `unknown` fallback, and a known type (a DTC
//      process, a resource) must not wear it
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const SRC = new URL("../src/", import.meta.url).pathname;
const TD = new URL("../testdata/", import.meta.url).pathname;

/** `import.meta.glob` is Vite's: here each call becomes the object Vite would
 *  hand out, one `url:<file>` per file of the directory that matches. */
const globPlugin = {
  name: "glob",
  setup(build) {
    build.onLoad({ filter: /\/src\/icons\.ts$/ }, (args) => {
      const text = readFileSync(args.path, "utf8").replace(
        /import\.meta\.glob\(\s*"\.\/assets\/([^/]+)\/\*\.(\{[^}]+\}|\w+)"[\s\S]*?\}\)/g,
        (_m, dir, ext) => {
          const exts = ext.startsWith("{") ? ext.slice(1, -1).split(",") : [ext];
          const files = readdirSync(`${SRC}assets/${dir}`)
            .filter((f) => exts.some((e) => f.endsWith(`.${e}`)));
          return JSON.stringify(Object.fromEntries(
            files.map((f) => [`./assets/${dir}/${f}`, `url:${f}`])));
        });
      return { contents: text, loader: "ts" };
    });
  },
};

async function load(contents) {
  const bundle = await esbuild.build({
    stdin: { contents, resolveDir: SRC, loader: "ts" },
    bundle: true, format: "esm", write: false, plugins: [globPlugin],
    loader: { ".svg": "text", ".png": "text" },
    logLevel: "silent",
  });
  return import("data:text/javascript;base64,"
    + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
}

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

// ── 2 · one constructor ─────────────────────────────────────────────────────
// A resource node written as a literal anywhere but resources.ts (TS) or
// `api.add_resource` (the bridge) is a second rule of the implicit file. What
// is allowed, and why, is spelled out: a descriptor that is not a node, and the
// scene of the stamp viewer, which is drawn and never saved.
const ALLOWED = [
  { file: "src/resources.ts", why: "the constructor" },
  { file: "src/views/stamps.ts", why: "a scene of the stamp viewer: drawn, never saved" },
  { file: "src/main.ts", text: 'iiifThumbnailUrl({ id: entry.id, node_type: "resource"',
    why: "a descriptor handed to the IIIF helper, not a node" },
];
const LITERAL = [
  /node_type:\s*["']resource["']\s*[,}]/g,        // TS object literal
  /["']node_type["']\s*:\s*["']resource["']/g,     // Python / JSON dict
  /\bResourceNode\(/g,                             // the Python constructor
];
function scan(root) {
  const hits = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = `${dir}/${f}`;
      if (f === "node_modules" || f === "assets" || f === "wasm" || f.startsWith(".")) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|py)$/.test(f)) {
        const rel = p.slice(root.length + 1);
        const text = readFileSync(p, "utf8");
        const lines = text.split("\n");
        lines.forEach((line, i) => {
          if (/^\s*(\/\/|#|\*)/.test(line)) return;
          for (const re of LITERAL) {
            re.lastIndex = 0;
            if (!re.test(line)) continue;
            const allowed = ALLOWED.some((a) => rel.endsWith(a.file) && (!a.text || line.includes(a.text)));
            if (!allowed) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
          }
        });
      }
    }
  };
  for (const sub of ["frontend/src", "tools"]) {
    try { walk(`${root}/${sub}`); } catch { /* a tree without it */ }
  }
  return hits;
}
if (process.argv.includes("--scan")) {
  const root = process.argv[process.argv.indexOf("--scan") + 1];
  const hits = scan(root);
  console.log(hits.join("\n"));
  console.log(`${hits.length} resource node(s) written by hand in ${root}`);
  process.exit(0);
}
{
  const hits = scan(new URL("../..", import.meta.url).pathname.replace(/\/$/, ""));
  eq(hits, [], "no resource node is written by hand: every one comes from addResource / api.add_resource");
}

// ── 0 · the style keys ──────────────────────────────────────────────────────
{
  const I = await load(`export { iconUrlFor, styleKeyFor } from "./icons";
                        export { nodeStyle } from "./palette";`);
  ok(typeof I.styleKeyFor === "function", "icons.ts says which style key a node_type reads");
  eq(I.styleKeyFor?.("resource"), "LINK", "a resource (the node_type since MIG1) reads LINK");
  eq(I.styleKeyFor?.("link"), "LINK", "…and `link`, the name before MIG1, still reads LINK (old files)");
  eq(I.styleKeyFor?.("resource_file"), "FILE", "a file reads FILE, by declaration");
  eq(I.iconUrlFor("resource"), "url:link.svg", "a resource is drawn with link.svg");
  eq(I.iconUrlFor("resource_file"), "url:resource_file.svg", "a file is drawn with its own glyph");
  const res = I.nodeStyle("resource"), link = I.nodeStyle("link"), file = I.nodeStyle("resource_file");
  eq([res.border, res.borderStyle, res.shape], [link.border, link.borderStyle, link.shape],
    "palette: a resource has LINK's frame");
  eq(res.border, "#FF6600", "…the LINK orange, not the `unknown` fallback");
  eq([file.border, file.borderStyle], ["#FF6600", "dashed"], "palette: a file has FILE's dashed frame");
}

// ── 1 · the mirror, against s3Dgraphy's golden ──────────────────────────────
const R = await load(`export * from "./resources";`);
{
  const golden = JSON.parse(readFileSync(`${TD}resources-golden.json`, "utf8")).steps;
  const G = { nodes: [], edges: [] };
  const g = R.plainGraph(G);
  const WEB = ["file_set", "file", "directory", "archive"];
  const files = (rid) => R.resourceFiles(g, rid).map((f) => ({ role: f.role, path: f.path,
    implicit: f.implicit, id: f.node.id, data: f.node.data }));
  // the em.json shape s3Dgraphy writes: {id, node_type, name, data}, in that order
  const shape = (n) => ({ id: n.id, node_type: n.node_type, name: n.name, data: n.data });
  const snap = () => ({ nodes: G.nodes.filter((n) => n.node_type !== "representation_model").map(shape),
    edges: G.edges.map((e) => ({ id: e.id, edge_type: e.edge_type, source: e.source, target: e.target,
      ...(e.attributes ? { attributes: e.attributes } : {}) })) });
  const mine = [];
  const step = (name, value) => mine.push({ step: name, value });

  R.addResource(g, { resourceId: "r1", name: "foto", kind: "image",
    files: [{ path: "foto.jpg", checksum: "sha256:aa", size_bytes: 10, media_type: "image/jpeg" }] });
  step("one file is implicit", files("r1"));
  R.addResource(g, { resourceId: "r3", name: "OB_PODIO_LOD1", kind: "3d_model",
    packaging: "file_set", tier: "distribution",
    files: [{ path: "OB_PODIO_LOD1.obj", checksum: "sha256:o1", size_bytes: 100, media_type: "model/obj" },
            { path: "OB_PODIO_LOD1.mtl", checksum: "sha256:m1", size_bytes: 5 },
            { path: "textures/T_OB_PODIO_LOD1.jpg", checksum: "sha256:t1", size_bytes: 50,
              media_type: "image/jpeg" }] });
  step("three files", files("r3"));
  R.addResource(g, { resourceId: "rb", name: "OB_PODIO_LOD1 (blend)", kind: "3d_model",
    packaging: "datablock", tier: "master",
    files: [{ blend_file: "RB/TempluMare 2021.blend", datablock: "OB_PODIO_LOD1 è" }] });
  step("datablock", files("rb"));
  R.addResource(g, { resourceId: "r4", name: "shared", kind: "3d_model",
    files: [{ path: "a.obj", checksum: "sha256:a" },
            { path: "LOD1/textures/T_OB_PODIO_LOD1.jpg", checksum: "sha256:t1" }],
    derivedFrom: ["rb"] });
  step("a shared file is one node", files("r4"));
  R.addResource(g, { resourceId: "r5", name: "nuda", kind: "", files: [{ path: "x/nuda.obj" }],
    primitives: { faces: 3 }, preferred: true, scope: "own-study", residency: "resident",
    data: { author: "E.D." } });
  step("kind read from the url", shape(G.nodes.at(-1)));
  step("add_file materializes", R.addFile(g, "r1", { path: "foto_b.jpg", checksum: "sha256:ab" }));
  step("after add_file", files("r1"));
  const fAb = R.resourceFiles(g, "r1").find((f) => f.path === "foto_b.jpg").node.id;
  step("remove_file", R.removeFile(g, "r1", fAb));
  G.nodes.push({ id: "rm1", node_type: "representation_model", name: "RM PODIO" });
  G.edges.push({ id: "rm1__has_linked_resource__r3", edge_type: "has_linked_resource",
    source: "rm1", target: "r3" });
  const tex = R.resourceFiles(g, "r3").find((f) => f.path.endsWith(".jpg")).node.id;
  step("replace_file", R.replaceFile(g, "r3", tex, { checksum: "sha256:t2", size_bytes: 51 }));
  step("replace twice is the same",
    R.replaceFile(g, "r3", tex, { checksum: "sha256:t2", size_bytes: 51 }).new_resource_id);
  R.addResource(g, { resourceId: "r6", name: "padre" });
  step("a placeholder keeps the constructor's kind", shape(G.nodes.at(-1)));
  R.addResource(g, { resourceId: "r7", name: "timbrata", kind: "3d_model",
    files: [{ path: "t.glb", checksum: "sha256:g1", stamp: { digest: "sha256:g1" } }],
    data: { stamp_receipt: { id: "s1" }, created_by: "E.D." } });
  step("a stamped file has an identity", files("r7"));
  const t7 = R.resourceFiles(g, "r7")[0].node.id;
  const r7b = R.replaceFile(g, "r7", t7, { checksum: "sha256:g2" }).new_resource_id;
  step("a revision inherits no stamp", shape(G.nodes.find((n) => n.id === r7b)));
  step("revisions", R.revisionsOf(g, "r3"));
  step("current", R.currentRevision(g, "r3"));
  step("pick web from r4", R.pickRepresentation(g, "r4", WEB));
  step("pick blender from r4", R.pickRepresentation(g, "r4", ["datablock"]));
  step("nothing opens", R.pickRepresentation(g, "rb", ["archive"]));
  step("representations of rb", R.representationsOf(g, "rb"));
  step("graph", snap());

  eq(mine.map((s) => s.step), golden.map((s) => s.step), "the same scenario, step for step");
  for (const [i, gs] of golden.entries()) {
    const ms = mine[i]?.value;
    let want = gs.value;
    if (gs.step === "graph") {
      want = { nodes: want.nodes.filter((n) => n.node_type !== "representation_model"), edges: want.edges };
      // the key ORDER of data too: what a diff of two em.json would show
      eq(JSON.stringify(ms?.nodes.map((n) => n.data)), JSON.stringify(want.nodes.map((n) => n.data)),
        "graph · data written in s3Dgraphy's key order");
    }
    eq(ms, want, `mirror · ${gs.step}`);
  }
}

// ── 3 · on the real store ───────────────────────────────────────────────────
{
  const M = await load(`export { DocumentStore } from "./model";
    export * from "./resources";
    export { resourceSummary } from "./resource-panel";
    export { ingestResourceOptions } from "./ingest";
    export { buildDtcScene } from "./views/dtc";`);
  const empty = () => new M.DocumentStore({ header: { format: "em.json", version: "1.0" },
    graph: { graph_id: "t", nodes: [], edges: [] } });
  const OB = (tile = "OB_PODIO", lod = "LOD1") => [
    { path: `${tile}_${lod}.obj`, checksum: `sha256:${tile}obj`, size_bytes: 100, media_type: "model/obj" },
    { path: `${tile}_${lod}.mtl`, checksum: `sha256:${tile}mtl`, size_bytes: 5 },
    { path: `textures/T_${tile}_${lod}.jpg`, checksum: `sha256:${tile}tex`, size_bytes: 50 }];

  // one gesture, one undo step, and the ops a peer would receive
  const st = empty();
  const ops = [];
  st.onOp((o) => ops.push(o.op));
  const before = st.undoDepth;
  const r = M.addResource(M.storeGraph(st), { resourceId: "podio", name: "OB_PODIO_LOD1",
    kind: "3d_model", packaging: "file_set", files: OB() });
  eq(st.undoDepth - before, 1, "a resource of three files is ONE undo step");
  eq(ops, ["add_node", "add_node", "add_edge", "add_node", "add_edge", "add_node", "add_edge"],
    "…and seven ops for a peer: the resource, then each file with its has_file");
  eq(M.resourceFiles(M.storeGraph(st), r.id).map((f) => [f.role, f.path]),
    [["entry_point", "OB_PODIO_LOD1.obj"], ["member", "OB_PODIO_LOD1.mtl"],
     ["member", "textures/T_OB_PODIO_LOD1.jpg"]], "three files, the obj is the entry point");
  st.undo();
  eq(st.doc.graph.nodes.length, 0, "one undo takes the whole resource away, files included");
  st.redo();

  // saved, reopened, the same
  const saved = st.toJSON();
  const again = new M.DocumentStore(JSON.parse(saved));
  eq(again.toJSON(), saved, "a resource of three files saves and reopens byte for byte");
  eq(M.resourceFiles(M.storeGraph(again), "podio").length, 3, "…with its three files");

  // replaceFile on the texture: two revisions, the RM stays until moved
  again.addNode({ id: "rm", node_type: "representation_model", name: "RM PODIO" });
  again.addEdge("rm", "podio", "has_linked_resource");
  const g = M.storeGraph(again);
  const tex = M.resourceFiles(g, "podio").find((f) => f.path.endsWith(".jpg")).node.id;
  const out = M.replaceFile(g, "podio", tex, { checksum: "sha256:tex2", size_bytes: 51 });
  eq(M.revisionsOf(g, "podio"), ["podio", out.new_resource_id], "replaceFile on a texture: two revisions");
  eq(M.revisionsOf(g, out.new_resource_id), ["podio", out.new_resource_id], "…the same chain from the new one");
  eq(out.pointing_at_old.map((p) => p.source), ["rm"], "…and the RM is who points at the old one");
  eq(M.resourceFiles(g, "podio").find((f) => f.path.endsWith(".jpg")).node.data.checksum,
    "sha256:OB_PODIOtex", "the old revision keeps its old texture");
  eq(M.movePointers(g, "podio", out.new_resource_id, out.pointing_at_old.map((p) => p.edge_id)), 1,
    "«tutti»: the one pointer moves");
  ok(again.doc.graph.edges.some((e) => e.source === "rm" && e.target === out.new_resource_id
    && e.edge_type === "has_linked_resource"), "…and the RM now points at the new revision");
  const sum = M.resourceSummary(g, "podio");
  eq([sum.revisions.chain.length, sum.revisions.at], [2, 0], "the inspector: the chain, oldest first, this is the first");
  // a fork is a warning, not a pick
  const out2 = M.replaceFile(g, "podio", tex, { checksum: "sha256:tex3" });
  ok(out2.new_resource_id !== out.new_resource_id, "a second, different replacement of the old one…");
  ok(/→/.test(M.resourceSummary(g, "podio").revisions.fork ?? ""), "…is a fork, shown as a warning (old → both branches)");

  // a shared file is seen in every resource that uses it
  const s2 = empty();
  const g2 = M.storeGraph(s2);
  M.addResource(g2, { resourceId: "a", name: "A", files: [{ path: "a.obj", checksum: "sha256:a" },
    { path: "textures/shared.jpg", checksum: "sha256:shared" }] });
  M.addResource(g2, { resourceId: "b", name: "B", files: [{ path: "b.obj", checksum: "sha256:b" },
    { path: "../A/textures/shared.jpg", checksum: "sha256:shared" }] });
  eq(s2.doc.graph.nodes.filter((n) => n.node_type === "resource_file").length, 3,
    "the same bytes in two resources are ONE file node");
  eq(M.resourceSummary(g2, "a").files.find((f) => f.path.endsWith("shared.jpg")).sharedWith.map((x) => x.name),
    ["B"], "the inspector of A says the texture is also in B");
  const shared = M.resourceFiles(g2, "a")[1].node.id;
  eq(M.resourceSummary(g2, shared).fileOf.map((x) => [x.name, x.path]),
    [["A", "textures/shared.jpg"], ["B", "../A/textures/shared.jpg"]], "…and the file says whose it is, with its path in each");

  // the drawing: closed by default, opened on its files, a shared file in both
  const N = s2.doc.graph.nodes, E = s2.doc.graph.edges;
  eq(M.foldFiles(N, E, new Set()).nodes.map((n) => n.id).sort(), ["a", "b"], "closed: only the two resources are drawn");
  eq(M.foldFiles(N, E, new Set(["b"])).nodes.length, 4, "B open: its two files join (one of them A's too)");
  eq(M.resourceLabel("OB_PODIO_LOD1", 3, false, "file"), "▸ OB_PODIO_LOD1 · 3 file", "the closed label");
  for (const n of N) if (n.node_type === "resource") n.data.dtc_kind = "mesh";
  const sc = M.buildDtcScene(N, E, undefined, { openResources: new Set(["a", "b"]) });
  const inst = sc.nodes.filter((x) => x.instanceOf === shared).map((x) => x.id).sort();
  eq(inst, [`a::file::${shared}`, `b::file::${shared}`], "DTC, both open: the shared texture hangs under both");
  const ra = sc.byId.get("a"), fa = sc.byId.get(`a::file::${shared}`);
  ok(fa.y > ra.y + ra.h && fa.x >= ra.x, "…UNDER its resource");
  ok(sc.lanes[0].height > 34 + 52, "…and the lane grew to hold the files");
  eq(M.buildDtcScene(N, E).nodes.length, 2, "DTC, closed: two boxes");

  // the ingestion writes the weight where the gate reads it
  const opts = M.ingestResourceOptions({ name: "foto.jpg", size: 1234, mediaType: "image/jpeg",
    kind: "image", use: "evidence" }, "sha256:ff", "foto.jpg", { residency: "resident", scope: "own-study" }, "i1");
  const ing = M.addResource(null, opts);
  eq([ing.data.size_bytes, ing.data.size], [1234, undefined],
    "an ingested file's weight is in size_bytes (the gate's field), not in `size` (read by nobody)");
  eq([ing.data.url, ing.data.checksum, ing.data.media_type, ing.data.resource_use],
    ["foto.jpg", "sha256:ff", "image/jpeg", "evidence"], "…and the rest where it was");

  // TempluMare: the fixture and E.D.'s graph of 30 Sep open and save with the
  // resources unchanged — the study graph through the DocumentStore, the shelf
  // of the container through the shelf's own reader and writer (the writer is
  // a ported creation point)
  const C = await load(`export { parseContainer } from "./container";
    export { loadShelfDocument, shelfToDocument } from "./shelf";`);
  const bases = [`${TD}TempluMare.em.json`,
    process.env.TEMPLU_BASE ?? new URL("../../.claude/wip/reports/2026-10-22-risorsa-file/fs/base/EM/Temple_20260930.em.json", import.meta.url).pathname];
  const resOf = (nodes) => JSON.stringify((nodes ?? [])
    .filter((n) => ["resource", "link", "resource_file"].includes(n.node_type))
    .map((n) => ({ ...n, node_type: n.node_type === "link" ? "resource" : n.node_type })));
  for (const path of bases) {
    let text;
    try { text = readFileSync(path, "utf8"); } catch { console.log(`  (skipped: ${path} not here)`); continue; }
    const file = path.split("/").pop();
    const parsed = C.parseContainer(JSON.parse(text));
    for (const m of parsed.members) {
      const n0 = JSON.parse(resOf(m.doc.graph.nodes)).length;
      const stT = new M.DocumentStore(JSON.parse(JSON.stringify(m.doc)));
      const back = JSON.parse(stT.toJSON());
      eq(resOf(back.graph.nodes), resOf(m.doc.graph.nodes),
        `${file}: the graph opened and saved, its ${n0} resources unchanged`);
      const gT = M.storeGraph(stT);
      ok(JSON.parse(resOf(m.doc.graph.nodes)).every((n) => M.resourceFiles(gT, n.id).length <= 1),
        `${file}: each of them one file (or none), implicit`);
    }
    if (parsed.shelf) {
      const shelfNodes = parsed.shelf.nodes;
      const lr = C.loadShelfDocument({ header: { format: "em.json", version: "1.0" }, graph: parsed.shelf });
      ok(lr.ok, `${file}: the shelf opens`);
      const out = C.shelfToDocument().graph.nodes;
      const strip = (ns) => JSON.parse(resOf(ns)).map((n) => ({ id: n.id, name: n.name, data: n.data }));
      eq(strip(out), strip(shelfNodes), `${file}: the shelf opened and saved, its ${shelfNodes.length} resources unchanged in data`);
    }
  }
}

// ── 4 · the minimap does not call a known type «unknown» ────────────────────
{
  const O = await load(`export { minimapInk } from "./overview"; export { nodeStyle } from "./palette";`);
  const red = O.nodeStyle("__no_such_type__").border;
  ok(typeof O.minimapInk === "function", "overview.ts says which ink a node has on the minimap");
  const ink = (t, data) => O.minimapInk?.({ node_type: t, data });
  for (const [t, data] of [["dtc_process", { dtc_kind: "photogrammetry" }], ["dtc_acquisition", { dtc_kind: "photo" }],
                           ["dtc_device", { dtc_kind: "camera" }], ["resource", {}], ["resource_file", {}]])
    ok(ink(t, data) && ink(t, data) !== red, `the minimap: a ${t} is not painted with the «unknown» red (${ink(t, data)})`);
  eq(ink("US", {}), O.nodeStyle("US").border, "…a type with a style keeps its style's border colour");
  eq(ink("__no_such_type__", {}), red, "…and a type nobody declared keeps the red that says so");
}

if (fails.length) {
  console.error(fails.map((f) => `  ✗ ${f}`).join("\n"));
  console.error(`resources: ${fails.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`resources: ${checks} checks passed`);
