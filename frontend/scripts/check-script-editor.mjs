// MICRO-TIL002 · executable check of the Script Editor and of the Python
// windows (E.D., 20 Nov 2026: «ne farei due come in Blender: un editor di
// script e una console»):
//   · the pure pieces of script-editor.ts: a typed name made a `.py` of the
//     folder, the listing's `.py` sorted, «modified» and the title's ●, the four
//     templates (each says where in the reference it comes from);
//   · the wiring: two window types («console», «script») with their icons, in
//     the head's selector, marked «beta»; surfaces of the shell; the console no
//     longer a floating panel; the Scripting MODEL offered by the «+», NOT among
//     the built-in tabs; «Run Script» on Alt+P (by the key's place: ⌥P is «π»
//     on the Mac), ⌘/Ctrl+S; the scripts in the project's `scripts/`; the words
//     in EN and IT;
//   · a real bridge (tools/em_py.py over s3Dgraphy's em) on Templu Mare: every
//     template runs — as a proof (dry_run) where it writes — and says what it
//     should; a script and the console share ONE session (a name defined by
//     the script is there for the console).
//
//   node scripts/check-script-editor.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = path.resolve(SRC, "../..");
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const b = await esbuild.build({
  stdin: { contents: `export { scriptFileName, pyNames, isModified, scriptTitle, newScriptBuffer, SCRIPT_TEMPLATES } from "./script-editor";
export { PySession } from "./py-session"; export { DocumentStore } from "./model"; export { applyDelta } from "./property-source";
export { WORKSPACE_TEMPLATES, arrangementProblems, WINDOW_TYPE_META } from "./workspace";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" }, platform: "browser" });
// workspace.ts reads localStorage at load
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const M = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));

// ── pure pieces ─────────────────────────────────────────────────────────────
eq([M.scriptFileName("units"), M.scriptFileName("units.py"), M.scriptFileName("  Unità di epoca .PY "), M.scriptFileName("../../etc/passwd")],
   ["units.py", "units.py", "Unità di epoca.py", "passwd.py"], "a typed name: one .py of the folder, no path");
eq([M.scriptFileName(".hidden"), M.scriptFileName("   "), M.scriptFileName("a/b\\c:d*e")], ["hidden.py", null, "c_d_e.py"],
   "…no hidden file, nothing from nothing, the unsafe signs replaced");
eq(M.pyNames(["b.py", "a10.py", "a2.py", "notes.txt", ".x.py", "b.py", "C.PY"]), ["a2.py", "a10.py", "b.py", "C.PY"],
   "the folder's .py, sorted as a person reads them");
const buf = M.newScriptBuffer();
eq([M.isModified(buf), M.scriptTitle(buf, "untitled.py")], [false, "untitled.py"], "a new buffer: not modified, «untitled.py»");
buf.text = "print(1)\n";
eq([M.isModified(buf), M.scriptTitle(buf, "untitled.py")], [true, "untitled.py ●"], "typed: modified, ● in the title");
buf.name = "uno.py"; buf.saved = buf.text;
eq(M.scriptTitle(buf, "untitled.py"), "uno.py", "saved: its name, no ●");
eq(M.SCRIPT_TEMPLATES.map((x) => x.id), ["epoch-units", "rename-series", "export-table", "selection-property"],
   "four templates: an epoch's units, rename in series, a table, a property on the selection");
for (const tp of M.SCRIPT_TEMPLATES) {
  ok(/^import em$/m.test(tp.code) && /# \(reference: [^)]+\)/.test(tp.code), `${tp.id}: imports em, says where in the reference it comes from`);
  ok(/^[a-z_]+\.py$/.test(tp.file), `${tp.id}: a file name to offer (${tp.file})`);
}
ok(M.SCRIPT_TEMPLATES.filter((x) => /em\.write\(/.test(x.code)).length === 2, "two of them write, each in ONE em.write block");

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), i18n = read("frontend/src/i18n.ts"), ws = read("frontend/src/workspace.ts");
const types = read("frontend/src/shell/types.ts"), sce = read("frontend/src/script-editor.ts"), css = read("frontend/src/style.css");
const icons = read("frontend/src/window-icons.ts"), pkg = JSON.parse(read("frontend/package.json"));
eq([M.WINDOW_TYPE_META.console?.labelKey, M.WINDOW_TYPE_META.script?.labelKey], ["win.console", "win.script"], "two window types, named");
ok(/^\s*console: '<rect/m.test(icons) && /^\s*script: '<path/m.test(icons), "…each with its line icon");
ok(/"console",\s*"script",\s*\];/.test(main), "…both in the head's type selector");
ok(/BETA_TYPES[^;]*\["console", "script"\]/.test(main) && /if \(BETA_TYPES\.has\(tt\)\) b\.append\(" ", betaMark\(\)\)/.test(main), "…marked «beta» in it (beta.ts)");
ok(/betaMark\(doc\)/.test(sce) && /note\.dataset\.beta = "1"/.test(read("frontend/src/console-window.ts")), "…and in their own heads");
ok(!/[Ee]xperimental|[Ss]perimental/.test((i18n.match(/"pyc\.helpText": "[^"]*"/g) ?? []).join("")), "no «experimental» left in the console's words (COR11 checked)");
ok(/\["script", "tile-scriptbody", deps\.mountScriptEditor\]/.test(types), "the editor: a surface of the shell, mounted once");
ok(/script: \(winId\?: string\)/.test(main), "the tests' hook on the editor");
ok(!/emstudio\.console\.window\.v1/.test(main), "the console is no floating panel any more");
// the Scripting model: the «+», not the tabs
const tp = M.WORKSPACE_TEMPLATES.find((w) => w.id === "scripting");
ok(tp, "a Scripting model");
eq(M.arrangementProblems(tp), [], "…its arrangement whole (every window placed once)");
eq(tp.arrangement.wins.map((w) => w.type), ["script", "console", "graph"], "…the editor, the console, the graph");
eq(tp.arrangement.layout.dir, "row", "…the editor and the console on the left…");
eq([tp.arrangement.layout.a.dir, tp.arrangement.layout.a.a.win, tp.arrangement.layout.a.b.win, tp.arrangement.layout.b.win],
   ["col", "editor", "console", "canvas"], "…the console UNDER the editor, the graph on the right");
const builtin = ws.slice(ws.indexOf("const BUILTIN_WORKSPACES"), ws.indexOf("export const PARKED_WORKSPACES"));
// MICRO-SEG02 p.0 · Scripting is ALSO the seventh built-in tab (last, after Schede)
ok(/\n  SCRIPTING,\n\];/.test(builtin) && (builtin.match(/^\s*id: "/gm) ?? []).length === 6, "…and the seventh built-in tab, last");
// MICRO-SEG02 p.4 · the editor's list: CodeMirror's autocomplete fed by the bridge's /py/complete (the console's Tab's answer)
ok(/autocompletion\(\{ override: \[completeFromSession\]/.test(sce) && /completionKeymap/.test(sce), "the editor completes from the session (autocomplete, Ctrl+Space)");
ok(/asAnswer\(await host\.complete!\(before\)/.test(sce) && /a\.signature/.test(sce), "…the same answer as the console: kinds, and the signature in the list");
ok(/complete: async \(text\) =>[\s\S]{0,160}completeRich\(text\)/.test(main), "…the page gives it the session's completeRich");
ok(/"@codemirror\/autocomplete"/.test(read("frontend/package.json")), "@codemirror/autocomplete is a declared dependency");
ok(/showWorkspaceAddMenu\(r\.left, r\.bottom \+ 2\)/.test(main) && /for \(const tp of WORKSPACE_TEMPLATES\)/.test(main), "the «+» offers the models");
// keys and places
ok(/ev\.altKey && !ev\.ctrlKey && !ev\.metaKey && ev\.code === "KeyP"/.test(sce), "Alt+P runs the script, by the key's place");
ok(/key: "Mod-s"/.test(sce), "⌘/Ctrl+S saves");
ok(/paths\.join\(paths\.dirname\(currentFilePath\), "scripts"\)/.test(main), "the scripts in the project's scripts/ folder");
ok(/"X-EM-Overwrite": "1"/.test(main) && /writeTextFile\(paths\.toNative\(full\), text\)/.test(main), "…written by the bridge on the web, by the desktop's own hands there");
ok(/history: false/.test(main.slice(main.indexOf("const scriptHost"), main.indexOf("function mountScriptEditorInto"))),
   "a script run stays out of the console's history (its code is in the file)");
ok(/@codemirror\/lang-python/.test(JSON.stringify(pkg.dependencies)) && /from "@codemirror\/view"/.test(sce), "CodeMirror 6 with Python");
ok(/^\.sce \{/m.test(css) && /\.sce \.tok-keyword/.test(css) && /\[data-theme="dark"\] \.sce/.test(css), "its style, Python's colours in both themes");
// words
const keys = [...new Set([...i18n.matchAll(/"((?:sce\.[A-Za-z.]+)|win\.console|win\.script|ws\.scripting|ws\.qScripting|ws\.addCopy|ws\.addModels)":/g)].map((m) => m[1]))];
ok(keys.length >= 40, `the editor's words (${keys.length})`);
// EN and IT always; DE too where its dictionary has the neighbours (the window and workspace names)
const DE_TOO = new Set(["win.console", "win.script", "ws.scripting", "ws.qScripting"]);
for (const k of keys) eq((i18n.match(new RegExp(`"${k.replace(/\./g, "\\.")}":`, "g")) ?? []).length, DE_TOO.has(k) ? 3 : 2, `${k}: EN and IT${DE_TOO.has(k) ? " (and DE)" : ""}`);
const used = new Set([...sce.matchAll(/t\(`?"?(sce\.[A-Za-z.]+)/g)].map((m) => m[1]).filter((k) => !k.endsWith(".")));
for (const k of used) ok(keys.includes(k), `${k} used and translated`);
for (const x of ["run", "try", "new", "open", "save", "saveAs", "templates"]) ok(keys.includes(`sce.${x}`) && keys.includes(`sce.${x}Title`), `sce.${x}: a word and its tooltip`);
for (const tpl of M.SCRIPT_TEMPLATES) ok(keys.includes(tpl.labelKey), `${tpl.labelKey}: its menu entry`);

// ── a real bridge, on Templu Mare ───────────────────────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
if (!fs.existsSync(py)) {
  console.log(`check-script-editor: ${checks} checks passed (no s3Dgraphy venv at ${py}: the live part skipped)`);
  process.exit(0);
}
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "py-script-"));
const TOKEN = "check-script-secret-0123456789abcd";
const machine = { S3DGRAPHY_CONSOLE_DIR: path.join(dir, "console"), S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"),
  S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"), S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"),
  EM_VOCABULARIES_DIR: path.join(dir, "vocab"), EM_BRIDGE_STATE_DIR: path.join(dir, "state"), EM_PY_ANSWER_S: "20" };
const port = await freePort();
const child = spawn(py, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(port), "--s3dgraphy", path.join(S3D, "src")],
  { env: { ...process.env, ...machine, EM_BRIDGE_TOKEN: TOKEN }, stdio: ["ignore", "ignore", "pipe"] });
let err = "";
child.stderr.on("data", (d) => { err += d; });
const B = `http://127.0.0.1:${port}`;
for (let i = 0; i < 200; i++) {
  try { const r = await fetch(`${B}/health`); if (r.ok) break; } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 100));
}
const code = (id) => M.SCRIPT_TEMPLATES.find((x) => x.id === id).code;
try {
  const st = new M.DocumentStore(JSON.parse(fs.readFileSync(path.join(ROOT, "frontend/testdata/TempluMare.em.json"), "utf8")));
  const doc0 = st.toJSON();
  let selection = [];
  const page = {
    base: async () => B, token: async () => TOKEN,
    doc: () => JSON.parse(st.toJSON()), revision: () => st.rev, author: () => "0000-0002-1825-0097",
    lang: () => "en", declared: () => [], selection: () => selection,
    applyStep: (step) => { M.applyDelta(st, step.delta, { renameCopies: true }); return st.rev; },
    log() {}, t: (k) => k,
    host: { select() {}, view: () => true, notify() {}, command: () => true, camera: () => null, setCamera() {}, frame() {}, pick: async () => null },
  };
  const s = new M.PySession(page);
  await s.open();
  const g = JSON.parse(doc0).graph;
  const epochs = g.nodes.filter((n) => n.node_type === "EpochNode");
  const usOf = (eid) => g.edges.filter((e) => e.edge_type === "has_first_epoch" && (e.target ?? e.edge_target) === eid).length;
  const epoch = epochs.slice().sort((a, b2) => usOf(b2.id) - usOf(a.id))[0];

  // 1 · an epoch's units: as written (an epoch the study does not have) it lists the epochs
  let out = await s.run(code("epoch-units"), { history: false });
  ok(out.ok && /No epoch 'Roman period' · the epochs are: /.test(out.output) && epochs.every((e) => out.output.includes(e.name)),
     "epoch-units as written: the study's epochs said, nothing broken");
  out = await s.run(code("epoch-units").replace('EPOCH = "Roman period"', `EPOCH = ${JSON.stringify(epoch.name)}`), { history: false });
  ok(out.ok && new RegExp(`^${usOf(epoch.id)} units in ${epoch.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(out.output),
     `epoch-units on «${epoch.name}»: its ${usOf(epoch.id)} units`);

  // 2 · rename in series, as a proof: what it would rename, nothing applied
  const rev0 = st.rev;
  const nUS = g.nodes.filter((n) => n.node_type === "US" && (n.name ?? "").startsWith("US")).length;
  out = await s.run(code("rename-series"), { dryRun: true, history: false });
  ok(out.ok && out.proofs.length === 1 && out.proofs[0].counts.ops === nUS && out.steps.length === 0,
     `rename-series tried: ${nUS} renames proposed, as ONE act`);
  ok(out.proofs[0].ops.every((o) => o.op === "update_field" && o.field === "name" && /^"?SU/.test(JSON.stringify(o.value).slice(1))), "…each a name from US… to SU…");
  eq([st.rev, st.toJSON() === doc0], [rev0, true], "…nothing applied");

  // 3 · a table, printed (OUT = None) and written (OUT = a path)
  out = await s.run(code("export-table"), { history: false });
  const lines = out.output.trim().split(/\r?\n/);
  eq([lines[0], lines.length - 1], ["id,name,type,epoch,description", g.nodes.filter((n) => n.node_type === "US").length], "export-table: a header and one row per US");
  const csvPath = path.join(dir, "units.csv");
  out = await s.run(code("export-table").replace("OUT = None", `OUT = ${JSON.stringify(csvPath)}`), { history: false });
  ok(out.ok && fs.existsSync(csvPath) && fs.readFileSync(csvPath, "utf8").startsWith("id,name,type,epoch,description"), "…and a file where OUT says");

  // 4 · a property on the selection: none selected → says so; two → one act, two properties (tried)
  out = await s.run(code("selection-property"), { dryRun: true, history: false });
  ok(out.ok && /Select one or more units first\./.test(out.output) && !out.proofs.length, "selection-property with nothing selected: it says so, writes nothing");
  selection = g.nodes.filter((n) => n.node_type === "US").slice(0, 2).map((n) => n.id);
  out = await s.run(code("selection-property"), { dryRun: true, history: false });
  const names2 = g.nodes.filter((n) => selection.includes(n.id)).map((n) => n.name);
  ok(out.ok && out.proofs.length === 1 && out.proofs[0].label === "material = limestone on 2 units"
     && out.proofs[0].counts.nodes + out.proofs[0].counts.ops >= 2 && names2.every((n) => out.output.includes(n)),
     "…on two units: ONE act (a proof) — a new property where a unit has none, its value where it has one");
  eq(st.toJSON() === doc0, true, "…nothing applied");

  // the script and the console: ONE session
  await s.run("FROM_SCRIPT = 41", { history: false });
  out = await s.run("FROM_SCRIPT + 1");
  eq(out.value, "42", "a name the script defined is there for the console (the same interpreter)");
  await s.close();
} finally {
  child.kill();
}
if (/Traceback/.test(err)) console.log(err.split("\n").filter((l) => /Error|Traceback/.test(l)).slice(0, 5).join("\n"));
console.log(`check-script-editor: ${checks} checks passed`);
