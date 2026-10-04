// I1 · every state of s3Dgraphy's list has its sign in EMStudio, and EMStudio
// draws no state that is not in the list; the room, the role and the sync are
// drawn with the list's states (I1 rimasto). R2 rimasto · a file's row says the
// file's name and its document's title, never «Link to D.32», and the Documents
// table's cell carries the file's sign.
//
//   node scripts/check-state-symbols.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({ stdin: { contents: 'export * from "./state-symbols.ts"; export * from "./file-states.ts"; ' +
    'export { docFilesHtml } from "./file-states-ui.ts"; export { roomStateId, roleStateId } from "./connection.ts";',
  resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent" });
const S = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
const list = JSON.parse(readFileSync(`${SRC}assets/em_state_symbols.json`, "utf8")).states;
let checks = 0;
assert.deepEqual(Object.keys(S.TONES).sort(), Object.keys(list).sort(),
  "EMStudio's signs are exactly the list's states");
checks++;
for (const id of Object.keys(list)) {
  const s = S.stateSign(id);
  assert.equal(s.glyph, list[id].glyph, `${id}: the glyph is the list's`);
  assert.ok(s.label && s.meaning, `${id}: label and meaning`);
  checks += 2;
}
const files = Object.keys(list).filter((k) => k.startsWith("file.")).map((k) => k.slice(5)).sort();
assert.deepEqual(files, ["both", "empty_copy", "missing", "on_disk", "on_node", "reference_only"],
  "the file states are the resolver's");
checks++;

// ── R2 rimasto · a file's row says its NAME and its document's TITLE ────────
const eq = (got, want, what) => { assert.deepEqual(got, want, what); checks++; };
eq(S.lastSegment("/DosCo/D.32.jpg"), "D.32.jpg", "a study path → its file");
eq(S.lastSegment("//DosCo/D.33.jpg"), "D.33.jpg", "two slashes → its file");
eq(S.lastSegment("C:\\scavo\\DosCo\\D.02.jpg"), "D.02.jpg", "a Windows path → its file");
eq(S.lastSegment("http://h/x/P01%5Bext%5D.jpeg?v=2"), "P01[ext].jpeg", "a URL → its file, decoded, no query");
// the case of the brief: San Pietro's links are all called «Link to D.nn»
const sp = {
  nodes: [
    { id: "d32", name: "D.32", node_type: "document", data: { url: "/DosCo/D.32.jpg" } },
    { id: "d02", name: "D.02", node_type: "document", description: "La chiesa di San Pietro in un'incisione di E. Dodwell (1834)" },
    { id: "d40", name: "D.40", node_type: "document", data: { title: "Rilievo 1931" } },
    { id: "l32", name: "Link to D.32", node_type: "resource", data: { url: "/DosCo/D.32.jpg" } },
    { id: "l02", name: "Link to D.02", node_type: "resource", data: { url: "/DosCo/D.02.jpg" } },
    { id: "set", name: "Link to D.40", node_type: "resource", data: {} },
    { id: "f1", name: "tav1", node_type: "resource_file", data: { path: "DosCo/D.40/tav1.tif" } },
    { id: "lost", name: "Link to D.99", node_type: "resource", data: {} },
  ],
  edges: [
    { source: "d32", target: "l32", edge_type: "has_linked_resource" },
    { source: "d02", target: "l02", edge_type: "has_linked_resource" },
    { source: "d40", target: "set", edge_type: "has_linked_resource" },
    { source: "set", target: "f1", edge_type: "has_file" },
  ],
};
eq(S.describeFile(sp, "l32"), { file: "D.32.jpg", doc: "D.32", docId: "d32" }, "D.32: the file and the document");
eq(S.describeFile(sp, "l02").doc, "D.02 · La chiesa di San Pietro in un'incisione di E. Dodwell (1834)", "D.02: name · title");
eq(S.describeFile(sp, "f1"), { file: "tav1.tif", doc: "D.40 · Rilievo 1931", docId: "d40" }, "one file of a set: its document through the set");
eq(S.describeFile(sp, "l32", { id: "l32", name: "Link to D.32", state: "on_disk", path: "/x/EM/DosCo/D.32.jpg", sha256: "", note: "", node_type: "resource" }).file,
   "D.32.jpg", "where the resolver found it names the file");
eq(S.describeFile(sp, "lost").file, "Link to D.99", "with no locator at all the node's name stays (nothing to invent)");
eq(S.filesOfDocument(sp, "d40"), ["set", "f1"], "a document's files: the set and its files");
// the real fixture: no row of a link says «Link to …» when the link has a URL
const tm = JSON.parse(readFileSync(new URL("../testdata/TempluMare.em.json", import.meta.url), "utf8"));
const tg = tm.graph ?? Object.values(tm.graphs)[0];
const links = tg.nodes.filter((n) => ["link", "resource", "resource_file"].includes(n.node_type) && n.data?.url);
assert.ok(links.length > 0, "the fixture has links");
for (const n of links) {
  const d = S.describeFile(tg, n.id);
  assert.ok(!/^Link to /.test(d.file) && d.file, `${n.id}: a file name, not «${n.name}»`);
  assert.ok(d.doc, `${n.id}: the node that links it is named`);
  checks += 2;
}
// the Documents table's cell: the sign of the state and the name of the file
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, project_root: "/p", summary: { on_disk: 1 },
  results: [{ id: "l32", name: "Link to D.32", state: "on_disk", path: "/p/EM/DosCo/D.32.jpg", sha256: "", note: "", node_type: "resource" }] }) });
assert.ok((await S.refreshFileStates("http://bridge", {})).ok);
const cell = S.docFilesHtml(S.filesOfDocument(sp, "d32"), (id) => S.describeFile(sp, id));
assert.ok(cell.includes(`data-state="file.on_disk"`) && cell.includes(`>${list["file.on_disk"].glyph}<`) && cell.includes(">D.32.jpg<")
  && !cell.includes("Link to"), "the cell: ● and D.32.jpg");
const unasked = S.docFilesHtml(S.filesOfDocument(sp, "d02"), (id) => S.describeFile(sp, id));
assert.ok(!unasked.includes("state-badge") && unasked.includes(">D.02.jpg<"), "a file not asked about: its name, no sign");
checks += 3;

// ── I1 rimasto · room, role and sync draw the list's states, and only those ──
eq(S.roomStateId({ mode: "hub", room: "r", readOnly: false }), "room.inside", "in a room");
eq(S.roomStateId({ mode: "hub", room: "r", readOnly: true }), "room.read_only", "in a room, read-only");
eq(S.roomStateId({ mode: "standalone", room: null }), "room.outside", "on this computer");
eq(S.roomStateId({ mode: "sidecar", room: null }), "room.outside", "with Blender");
for (const r of ["owner", "editor", "viewer"]) eq(S.roleStateId(r), `role.${r}`, `role ${r} has its sign`);
for (const r of ["admin", "none", null, undefined]) eq(S.roleStateId(r), null, `role ${r}: not in the list, no sign invented`);
for (const s of ["aligned", "pending", "conflict"]) { assert.ok(list[`sync.${s}`], `sync.${s} in the list`); checks++; }
// the old signs are gone from the badges' words: the conflict flag, the bare role
const i18n = readFileSync(`${SRC}i18n.ts`, "utf8");
assert.ok(!/"conflict\.chip": "⚑/.test(i18n), "the conflict chip has no flag of its own");
const main = readFileSync(`${SRC}main.ts`, "utf8");
for (const id of ["sync.conflict", "room.read_only"])
  assert.ok(main.includes(`stateSign("${id}")`), `main.ts draws ${id} from the list`);
assert.ok(/roleStateId\(said\)/.test(main), "the identity chip draws the role from the list");
checks += 4;
// «Find here…» on a missing file: the desktop asks with the native file dialog
// (the same @tauri-apps/plugin-dialog `open` as the other pickers), the browser
// keeps the typed prompt — it has no path to give.
const tauri = readFileSync(`${SRC}tauri.ts`, "utf8");
const pick = tauri.slice(tauri.indexOf("export async function pickFile("));
assert.ok(/if \(!isTauri\(\)\) return null;\s*const picked = await open\(\{ multiple: false, directory: false/.test(pick),
  "pickFile opens the native dialog for one file, and only in the desktop");
const relink = main.slice(main.indexOf("async function relinkFile("), main.indexOf("async function uploadFiles("));
assert.ok(/if \(isTauri\(\)\)[\s\S]*await pickFile\(ask,[\s\S]*\} else \{\s*path = window\.prompt\(ask/.test(relink),
  "«Find here…»: native dialog in the desktop, the prompt in the browser");
assert.ok(/onRelink: \(f\) => \{ void relinkFile\(f\); \}/.test(main), "the gesture calls relinkFile");
checks += 3;
console.log(`state-symbols: ${checks} checks passed`);
