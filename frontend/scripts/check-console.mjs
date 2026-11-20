// MICRO-PL16-CONSOLE (W13) · executable check of the Python console:
//   · the pure pieces of console-window.ts: when Enter runs (Python's prompt),
//     brackets and strings still open, the tail a completion replaces, the
//     common start, ↑/↓ through the history, Ctrl+R backwards, the echo, a
//     proof line by line, a run's lines (written, proposed, proof, value, error);
//   · the wiring: the button made ONLY behind «Funzioni sperimentali» (no
//     word of it in index.html), the window like «Estensioni», the words in EN
//     and IT, the levels (82: /py/history and the proofs; /py/* still 81);
//   · the window in a DOM (linkedom) with a host of ours: Enter on a complete
//     line runs, on «if x:» goes on; «Prova» runs with dryRun; «Aiuto» runs
//     em.help() outside the history; ↑ brings the last entry back and ↓ the
//     draft; Tab completes the tail; Ctrl+R finds; a console without a bridge
//     says why and runs nothing;
//   · a real bridge (tools/em_py.py over s3Dgraphy's em) driven by the page's
//     module on a real DocumentStore: the history written to this machine's
//     file (S3DGRAPHY_CONSOLE_DIR/console_history), not twice the same, not
//     the help; a «try» of a write: its proof with the node and the edge,
//     NOTHING applied (same revision, no undo step); a real write after it:
//     one step; em.help() printed once, not again as a value; the history
//     trimmed past its size.
//
//   node scripts/check-console.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = path.resolve(SRC, "../..");
let checks = 0;
// CHECK_TRACE=1: each check said as it passes (where a live part stops)
const trace = process.env.CHECK_TRACE ? (what) => console.error(`· ${what}`) : () => {};
const ok = (c, what) => { assert.ok(c, what); checks++; trace(what); };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; trace(what); };

const b = await esbuild.build({
  stdin: { contents: `export * from "./console-window"; export { PySession } from "./py-session"; export { DocumentStore } from "./model"; export { applyDelta } from "./property-source";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
const M = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));

// ── pure pieces ─────────────────────────────────────────────────────────────
eq(M.CONSOLE_LEVEL, 82, "the console's bridge level");
eq([M.enterRuns("1 + 1"), M.enterRuns("g.node('US1')"), M.enterRuns("   ")], [true, true, false], "Enter runs a complete line, not an empty one");
eq([M.enterRuns("for n in g.nodes():"), M.enterRuns("x = (1,"), M.enterRuns("x = 1 + \\")], [false, false, false],
   "…a line ending in «:», an open bracket, a «\\» go on");
eq([M.enterRuns("for n in g.nodes():\n    print(n)"), M.enterRuns("for n in g.nodes():\n    print(n)\n")], [false, true],
   "…a block runs on an empty last line");
eq([M.enterRuns("s = 'a(b'"), M.enterRuns("x = 1  # (comment"), M.enterRuns('s = """a\nb"""')], [true, true, false],
   "brackets inside strings and comments do not count; a block of several lines waits");
eq([M.openBrackets("f(a, [1, {2"), M.openBrackets("f(')')"), M.openBrackets('x = """open')], [3, 0, 1], "openBrackets");
eq([M.completionTail("em.wri"), M.completionTail("x = g.node('US"), M.completionTail("print(1)"), M.completionTail("a = 'x' + b.c")],
   ["em.wri", "US", "", "b.c"], "the tail: a dotted name, or the text inside an open string");
eq(M.commonPrefix(["em.write(", "em.writable"]), "em.writ", "the common start");
eq(M.completeWith("em.wri", ["em.write("]), { replace: "em.write(", tail: "em.wri", list: [] }, "one match: it replaces the tail");
eq(M.completeWith("g.node('U", ["US1", "US2", "US3"]), { replace: "US", tail: "U", list: ["US1", "US2", "US3"] },
   "several: their common start, and the list");
eq(M.completeWith("em.x", []), { replace: null, tail: "em.x", list: [] }, "none: nothing replaced");
const H = ["g.node('US1')", "em.help()", "for n in g.nodes(type='US'):\n    print(n)"];
eq([M.searchBack(H, "node"), M.searchBack(H, "node", 2), M.searchBack(H, "node", 0), M.searchBack(H, "zzz")], [2, 0, -1, -1],
   "Ctrl+R: the newest match, then older ones");
eq(M.pushHistory(["a"], "a  \n"), ["a"], "the same code twice in a row is kept once");
eq(M.pushHistory(["a"], "b"), ["a", "b"], "a new one at the end");
eq(M.pushHistory(Array.from({ length: M.HISTORY_KEEP }, (_, i) => `x${i}`), "y").length, M.HISTORY_KEEP, "…and the page keeps 1000");
eq([M.historyStep(3, -1, -1), M.historyStep(3, 0, -1), M.historyStep(3, 2, 1), M.historyStep(3, 1, 1), M.historyStep(3, -1, 1), M.historyStep(0, -1, -1)],
   [2, null, -1, 2, null, null], "↑ from the draft to the newest, ↓ past the newest back to the draft");
eq(M.echo("for x in y:\n    f(x)\n"), ">>> for x in y:\n...     f(x)", "the echo as Python's prompt");
const proof = { label: "Collega", message: "", volatile: false, counts: { nodes: 1, edges: 1, ops: 2 },
  nodes: [{ id: "us9", type: "US", name: "US9" }], edges: [{ source: "us1", type: "is_after", target: "us2" }],
  ops: [{ op: "update_field", node_id: "us1", field: "description", value: "x" }] };
eq(M.proofLines(proof), ["+ us9 (US) US9", "+ us1 —is_after→ us2", "~ us1 description = \"x\"", "… +1"], "a proof line by line, and what is not shown counted");
const tt = (k, v) => `${k}${v ? JSON.stringify(v) : ""}`;
const lines = M.outcomeLines({ ok: true, status: "done", output: "ciao\n", value: "42",
  steps: [{ label: "L", ids: ["a", "b"], volatile: false, refused: [] }], proofs: [proof], requests: [] }, tt, false);
eq(lines.map((l) => l.kind), ["out", "step", "proof", "value"], "a run's lines: output, written, proof, value");
ok(/pyc\.step.*"n":"2"/.test(lines[1].text) && lines[2].detail.length === 4, "…the step names its nodes, the proof its details");
eq(M.outcomeLines({ ok: true, status: "done", output: "", steps: [], proofs: [], requests: [] }, tt, true).map((l) => l.text), ["pyc.proofNone"],
   "a try that wrote nothing says so");
eq(M.outcomeLines({ ok: false, status: "refused", output: "", error: "il grafo è intatto", steps: [], proofs: [], requests: [] }, tt, false)
  .map((l) => [l.kind, l.text]), [["error", "il grafo è intatto"]], "a refusal: its words");

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), html = read("frontend/index.html"), i18n = read("frontend/src/i18n.ts");
const bridge = read("tools/em_bridge.py"), emPy = read("tools/em_py.py"), css = read("frontend/src/style.css");
ok(!/btn-tool-console|Console Python|Python console/i.test(html), "index.html has no word of the console (off: nothing)");
// MICRO-COR11 · out of «Funzioni sperimentali»: the button for everyone, marked «beta»
ok(/\{\s*\/\/ Strumenti ▸ Console Python… · beta[\s\S]{0,300}b\.id = "btn-tool-console"/.test(main), "the button made for everyone (MICRO-COR11)");
ok(/function openConsoleWindow\(\): void \{\s*consoleWindow\.open\(\);/.test(main) && !/pyc\.off/.test(main), "…and the window opens with no switch");
ok(/"tools\.console": "Python console… · beta"/.test(i18n) && /"tools\.console": "Console Python… · beta"/.test(i18n), "the entry says «beta» (EN + IT)");
ok(/t\("ui\.beta"\)/.test(read("frontend/src/console-window.ts")), "the window's head says «beta»");
ok(/new ColoursWindow\(coloursWindowHostForVocab\(\), document, \{\s*prefKey: "emstudio\.console\.window\.v1"/.test(main), "a floating window like «Estensioni» (detachable)");
ok(/sig: \(\) => getLocale\(\)/.test(main), "…rebuilt only by the language");
ok(/console: \(\) => openConsoleWindow\(\)/.test(main), "the hook opens it");
const keys = [...new Set([...i18n.matchAll(/"(pyc\.[A-Za-z]+|tools\.console(?:Title)?)":/g)].map((m) => m[1]))];
ok(keys.length >= 26, `the console's words (${keys.length})`);   // MICRO-COR11: pyc.off, pyc.experimental gone (ui.beta)
for (const k of keys) eq((i18n.match(new RegExp(`"${k.replace(".", "\\.")}":`, "g")) ?? []).length, 2, `${k}: EN and IT`);
const used = [...read("frontend/src/console-window.ts").matchAll(/t\("(pyc\.[A-Za-z]+)"/g)].map((m) => m[1]);
for (const k of new Set(used)) ok(keys.includes(k), `${k} used and translated`);
ok(/"\/py\/history"/.test(bridge) && /^BRIDGE_LEVEL = (8[2-9]|9\d)/m.test(bridge) && /^LEVEL = (8[2-9]|9\d)/m.test(emPy), "the bridge: /py/history in the table, level 82 or later");
ok(/const BRIDGE_LEVEL_WANTED = (8[2-9]|9\d);/.test(main), "the page wants 82 or later");
ok(/^\.pyc \{/m.test(css), "its style");

// ── the window in a DOM ─────────────────────────────────────────────────────
const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
// linkedom has no caret: a minimal one, at the end unless set
const TA = Object.getPrototypeOf(document.createElement("textarea"));
Object.defineProperty(TA, "selectionStart", { get() { return this._ss ?? this.value.length; }, set(v) { this._ss = v; }, configurable: true });
Object.defineProperty(TA, "selectionEnd", { get() { return this._se ?? this.value.length; }, set(v) { this._se = v; }, configurable: true });
TA.setRangeText = function (text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this._ss = this._se = undefined; };
TA.focus = function () {};
const put = (el, v) => { el.value = v; el._ss = el._se = undefined; };
const IN = Object.getPrototypeOf(document.createElement("input"));
IN.focus = function () {};
const key = (el, k, more = {}) => {
  const ev = new window.Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(ev, { key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...more });
  el.dispatchEvent(ev);
  return ev;
};
const tick = () => new Promise((r) => setTimeout(r, 5));
const runs = [];
let why = null;
const host = {
  t: tt,
  unavailable: async () => why,
  run: async (code, opts) => { runs.push({ code, ...opts }); return code === "em.help()"
    ? { ok: true, status: "done", output: "em 1.0.0 · host: emstudio\n", steps: [], proofs: [], requests: [] }
    : { ok: true, status: "done", output: "", value: "2", steps: [], proofs: opts.dryRun ? [proof] : [], requests: [] }; },
  complete: async (text) => (text.endsWith("em.wri") ? ["em.write("] : text.endsWith("('U") ? ["US1", "US2"] : []),
  history: async () => [{ code: "g.node('US1')" }, { code: "len(g)" }],
  docName: () => "prova.em.json",
};
const state = M.newConsoleState();
let root = M.consoleContent(document, host, state);
document.body.append(root);
await tick();
const $ = (sel) => root.querySelector(sel);
eq(state.history, ["g.node('US1')", "len(g)"], "the machine's history read when the window opens");
ok(/pyc\.on.*prova\.em\.json/.test($(".pyc-where").textContent), "it says which document it works on");
const ta = $(".pyc-input");
put(ta, "for n in g.nodes():");
ok(!key(ta, "Enter").defaultPrevented && runs.length === 0, "Enter on «…:» goes on (a new line)");
put(ta, "1 + 1");
key(ta, "Enter"); await tick();
eq(runs.at(-1), { code: "1 + 1", dryRun: false, history: true }, "Enter on a complete line runs it");
eq(ta.value, "", "…the input emptied");
eq(state.lines.map((l) => l.kind), ["in", "value"], "…its echo and its value in the transcript");
eq(state.history.at(-1), "1 + 1", "…and it is in the history");
put(ta, "x = 3");
$('[data-pyc="try"]').click(); await tick();
eq(runs.at(-1), { code: "x = 3", dryRun: true, history: true }, "«Prova» runs with dryRun");
ok(state.lines.some((l) => l.kind === "in" && l.dry) && state.lines.some((l) => l.kind === "proof"), "…marked «prova», its proof shown");
$('[data-pyc="help"]').click(); await tick();
eq(runs.at(-1), { code: "em.help()", dryRun: false, history: false }, "«Aiuto» runs em.help(), outside the history");
ok(state.history.at(-1) === "x = 3", "…the history unchanged");
put(ta, "bozza");
ta.dispatchEvent(new window.Event("input"));
key(ta, "ArrowUp");
eq(ta.value, "x = 3", "↑ brings the newest entry back");
key(ta, "ArrowUp");
eq(ta.value, "1 + 1", "↑ again an older one");
key(ta, "ArrowDown"); key(ta, "ArrowDown");
eq(ta.value, "bozza", "↓ past the newest: the draft as it was");
put(ta, "em.wri");
key(ta, "Tab"); await tick();
eq(ta.value, "em.write(", "Tab completes the tail");
put(ta, "g.node('U");
key(ta, "Tab"); await tick();
eq([ta.value, [...root.querySelectorAll(".pyc-match")].map((x) => x.textContent)], ["g.node('US", ["US1", "US2"]],
   "several matches: their common start and the list");
put(ta, "");
key(ta, "Tab");
eq(ta.value, "    ", "Tab at the start of a line indents");
key(ta, "r", { ctrlKey: true });
ok(!$(".pyc-search").hidden, "Ctrl+R opens the search");
const si = $(".pyc-search-in");
si.value = "US1";
si.dispatchEvent(new window.Event("input"));
eq(ta.value, "g.node('US1')", "…the newest match shown");
key(si, "Enter");
ok($(".pyc-search").hidden && ta.value === "g.node('US1')" && state.draft === "g.node('US1')", "Enter takes it");
const ev = key(ta, "z");
ok(ev.defaultPrevented === false, "a plain key is the textarea's");
// a rebuild (detach, language) loses nothing
const before = state.lines.length;
root.remove();
root = M.consoleContent(document, host, state);
document.body.append(root);
await tick();
eq([root.querySelectorAll(".pyc-line").length, root.querySelector(".pyc-input").value], [before, "g.node('US1')"],
   "rebuilt: the lines and the draft are still there");
// no bridge: said, nothing runs
why = "py.noToken";
const n0 = runs.length;
const st2 = M.newConsoleState();
const r2 = M.consoleContent(document, host, st2);
document.body.append(r2);
await tick();
ok(r2.querySelector('[data-pyc="run"]').disabled && /py\.noToken/.test(r2.querySelector(".pyc-status").textContent), "without a bridge: why, the buttons off");
put(r2.querySelector(".pyc-input"), "1");
key(r2.querySelector(".pyc-input"), "Enter"); await tick();
eq(runs.length, n0, "…and nothing runs");
why = null;

// ── a real bridge ───────────────────────────────────────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
if (!fs.existsSync(py)) {
  console.log(`check-console: ${checks} checks passed (no s3Dgraphy venv at ${py}: the live part skipped)`);
  process.exit(0);
}
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "py-console-"));
const TOKEN = "check-console-secret-0123456789ab";
const machine = { S3DGRAPHY_CONSOLE_DIR: path.join(dir, "console"), S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"),
  S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"), S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"),
  EM_VOCABULARIES_DIR: path.join(dir, "vocab"), EM_BRIDGE_STATE_DIR: path.join(dir, "state"), EM_PY_ANSWER_S: "10" };
const port = await freePort();
const child = spawn(py, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(port), "--s3dgraphy", path.join(S3D, "src")],
  { env: { ...process.env, ...machine, EM_BRIDGE_TOKEN: TOKEN }, stdio: ["ignore", "ignore", "pipe"] });
let err = "";
child.stderr.on("data", (d) => { err += d; });
const B = `http://127.0.0.1:${port}`;
for (let i = 0; i < 150; i++) {
  try { const r = await fetch(`${B}/health`); if (r.ok) break; } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 100));
}
try {
  const h = await (await fetch(`${B}/health`)).json();
  ok(h.bridge_level >= 82, "the bridge at level 82 or later");
  const st = new M.DocumentStore({ header: { format: "em.json", schema_version: 2, version: "1.0" },
    graph: { graph_id: "pl16", nodes: [
      { id: "us1", node_type: "US", name: "US1", description: "" },
      { id: "us2", node_type: "US", name: "US2", description: "" }], edges: [] } });
  const logs = [];
  const page = {
    base: async () => B, token: async () => TOKEN,
    doc: () => JSON.parse(st.toJSON()), revision: () => st.rev, author: () => "0000-0002-1825-0097",
    lang: () => "it", declared: () => [], selection: () => [],
    applyStep: (step) => { M.applyDelta(st, step.delta, { renameCopies: true }); return st.rev; },
    log: (level, message, ids) => logs.push({ level, message, ids }), t: tt,
    host: { select() {}, view: () => true, notify() {}, command: () => true, camera: () => null, setCamera() {}, frame() {}, pick: async () => null },
  };
  const s = new M.PySession(page);
  await s.open();
  eq(await s.history(), [], "an empty history at first");
  let out = await s.run("len(list(g.nodes()))");
  out = await s.run("len(list(g.nodes()))");
  await s.run("em.help()", { history: false });
  let hist = await s.history();
  eq(hist.map((e) => e.code), ["len(list(g.nodes()))"], "the history: each run once, not twice the same, not the help");
  ok(fs.existsSync(path.join(machine.S3DGRAPHY_CONSOLE_DIR, "console_history")), "…in this machine's file (console_history)");

  const rev0 = st.rev;
  const code = "with em.write('Collega US1 a US2') as tx:\n    tx.add_edge('us1', 'is_after', 'us2')";
  out = await s.run(code, { dryRun: true });
  eq([out.status, out.steps.length, out.proofs.length], ["done", 0, 1], "«Prova»: no step, one proof");
  const p = out.proofs[0];
  eq([p.label, p.counts.edges, p.edges[0]], ["Collega US1 a US2", 1, { source: "us1", type: "is_after", target: "us2" }], "…the edge it would write");
  eq([st.rev, st.edges?.length ?? JSON.parse(st.toJSON()).graph.edges.length], [rev0, 0], "…NOTHING applied: same revision, no edge");
  hist = await s.history();
  eq([hist.at(-1).code, hist.at(-1).dry_run], [code, true], "the try is in the history, marked as a try");
  out = await s.run(code);
  eq([out.status, out.steps.length, out.proofs.length], ["done", 1, 0], "the same code run: one step, no proof");
  eq(JSON.parse(st.toJSON()).graph.edges.filter((e) => e.edge_type === "is_after").length, 1, "…the edge in the document");
  out = await s.run("with em.write('nuova', dry_run=True) as tx:\n    tx.add_node('US', name='US9')");
  eq([out.steps.length, out.proofs.length, out.proofs[0]?.counts.nodes >= 1], [0, 1, true], "an explicit em.write(dry_run=True) is a proof too");
  ok(out.proofs[0].nodes.some((n) => n.name === "US9"), "…naming the node it would add");
  out = await s.run("em.help()", { history: false });
  ok(/em\.graph/.test(out.output) && out.value === undefined, "em.help(): its text once, not again as a value");
  out = await s.run("x = 'abc'\nprint(x)\nx");
  eq([out.output, out.value], ["abc\n", "'abc'"], "…a printed string the script did not return as that text keeps its value");

  // the history trimmed past its size (the bridge's own function)
  const trim = spawnSync(py, ["-c", `
import os, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, "tools"))})
import em_py
em_py.HISTORY_MAX = 5
for i in range(8):
    em_py.add_history(f"x = {i}")
h = em_py.read_history()
print(len(h), h[0]["code"], h[-1]["code"])
`], { env: { ...process.env, S3DGRAPHY_CONSOLE_DIR: path.join(dir, "trim") }, encoding: "utf8" });
  eq(trim.stdout.trim(), "5 x = 3 x = 7", "past HISTORY_MAX the oldest go");
  await s.close();
} finally {
  child.kill();
}
if (/Traceback/.test(err)) console.log(err.split("\n").filter((l) => /Error|Traceback/.test(l)).slice(0, 5).join("\n"));
console.log(`check-console: ${checks} checks passed`);
