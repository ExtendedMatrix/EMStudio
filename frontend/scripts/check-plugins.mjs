// MICRO-PL17-PLUGIN-DA-DISCO-E-SLOT (W14) · executable check of the plugins
// loaded from disk and of the slots of phase 1.
//
//   · the pure pieces (plugin-commands.ts): `when` — the SAME grammar as
//     s3Dgraphy's extensions.slots (a table computed by both and compared),
//     the slots filled from the selection (never invented), the commands of a
//     slot, grouped by plugin; the run rows of the menu table (menu-table.ts:
//     File ▸ Import / Export carry a slot, the plugins' rows follow);
//   · the wiring: onOp a list (G18), document-opened / document-saved (G19),
//     the slots in main.ts (Tools ▸ Plugins, File, context menus of the Matrix
//     and the Space, Narrative ▸ Export, the warnings, «Porta dentro…»), the
//     levels (83), EN + IT;
//   · a REAL bridge (level 83) with its secret and machine folders in /tmp: a
//     plugin of this check installed from disk with the trust answer
//     (/extensions/install), loaded (/py/plugins), its command run by the
//     page's PySession on a real DocumentStore — one step, one undo, the DTC
//     naming the plugin unverified; the four refusals in Italian; a plugin that
//     declares no write-graph refused by the seam; a read-only command that
//     writes refused; the checks; an exporter's file; a reader; a plugin's
//     listener; disable → gone; a plugin for another em refused, said.
//
// Run: node frontend/scripts/check-plugins.mjs (S3D=… for another s3Dgraphy).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
  stdin: { contents: `export { DocumentStore } from "./model"; export { applyDelta } from "./property-source"; export * from "./py-session";
    export * from "./plugin-commands"; export { MENUS, menuRows, outline, setSlotRuns, slotRuns, findRun } from "./menu-table";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
const M = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));

// ── pure pieces ─────────────────────────────────────────────────────────────
const holds = (w, types, document = true) => M.whenHolds(w, { document, types });
ok(holds("selection:US", ["US", "US"]) && !holds("selection:US", ["US", "RM"]) && !holds("selection:US", []), "when: every selected of the types");
ok(holds("selection:none", []) && holds("selection:one", ["RM"]) && !holds("selection:many", ["RM"]), "when: none, one, many");
ok(!holds("document", [], false) && holds("", [], false), "when: document; empty = always");
ok(!holds("selection:US or RM", ["US"]) && M.parseWhen("eval(1)") === null, "when: what does not read is never offered");
eq(M.parseWhen("document and selection:US|USV"), [["document", null], ["types", ["US", "USV"]]], "when: the clauses");

const cmd = (over = {}) => { const c = { plugin: "p", id: "c", label: { en: "Do", it: "Fai" }, writes: true, slots: [], in: [], off: [], when: "", accept: [], ...over }; return { ...c, name: `${c.plugin}/${c.id}` }; };
eq(M.fillSlots(cmd({ slots: [{ name: "a", kind: "id" }, { name: "b", kind: "id" }, { name: "all", kind: "ids" }, { name: "f", kind: "path" }, { name: "n", kind: "number" }] }),
  { selection: ["x", "y", "z"], path: "/tmp/f.units" }), { a: "x", b: "y", all: ["x", "y", "z"], f: "/tmp/f.units" },
  "the slots from the selection in order, the file; a number is never guessed");
eq(M.fillSlots(cmd({ slots: [{ name: "unit", kind: "id" }] }), { selection: [] }), {}, "no selection: the slot stays missing (the contract asks)");
eq([M.labelOf(cmd(), "it-IT"), M.labelOf(cmd(), "en"), M.labelOf(cmd({ label: { en: "Only" } }), "it")], ["Fai", "Do", "Only"], "the label in the page's language, else English");
eq([M.runId(cmd()), M.parseRunId("plugin:esempio-statuaria/facemesh.propose")], ["plugin:p/c", { plugin: "esempio-statuaria", command: "facemesh.propose" }], "the run ids");

const state = new M.PluginState();
let changed = 0;
state.onChange(() => changed++);
const P = (id, state_, commands) => ({ id, version: "0.1.0", name: id.toUpperCase(), source: "disk", state: state_, problems: [], verified: false, package: null, wired: [], commands });
state.set({ plugins: [
  P("a", "loaded", [cmd({ plugin: "a", id: "t", in: ["menu.tools@1", "context.node@1"] }), cmd({ plugin: "a", id: "r", in: ["door.reader@1"], accept: [".units"] })]),
  P("b", "refused", [cmd({ plugin: "b", id: "t", in: ["menu.tools@1"] })]),
] });
eq(changed, 1, "a new answer is said once");
state.set({ plugins: state.plugins });
eq(changed, 1, "…the same answer again is not");
eq(state.commandsIn("menu.tools").map((c) => c.name), ["a/t"], "a refused plugin's commands are not drawn");
eq(state.readersFor("/x/List.UNITS").map((c) => c.id), ["r"], "a reader by the file's extension");
eq(M.byPlugin(state, "menu.tools").map((g) => [g.plugin.id, g.commands.map((c) => c.id)]), [["a", ["t"]]], "Tools ▸ Plugins: by plugin");
eq(M.provenance(state.plugins[0], (k, v) => `${k}${v ? JSON.stringify(v) : ""}`), 'plg.unverified{"id":"a","version":"0.1.0","source":"plg.disk"}', "«da disco, non verificato»");

// the menu table: the slot of a sub-menu carries the plugins' rows
const file = M.MENUS.find((m) => m.id === "file");
eq(["import", "export"].map((id) => file.rows.find((r) => r.id === id)?.slot), ["menu.file.import@1", "menu.file.export@1"], "File ▸ Import / Export are slots");
const before = M.outline(M.menuRows(file, "web", "internal"));
M.setSlotRuns("menu.file.export@1", [{ kind: "run", id: "plugin:a/x", text: "Units as text" }]);
const after = M.outline(M.menuRows(file, "web", "internal"));
ok(after.includes("export/plugin:a/x") && after.length === before.length + 2, "a run row after the export's rows, behind a separator");
eq(M.findRun("plugin:a/x")?.text, "Units as text", "findRun");
M.setSlotRuns("menu.file.export@1", []);
eq(M.outline(M.menuRows(file, "mac", "native")).filter((x) => x.includes("plugin:")), [], "[] takes them away (the system's menu too)");

// the same grammar as s3Dgraphy's: a table computed by both
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
const CASES = [["", []], ["selection:US", ["US"]], ["selection:US", ["US", "RM"]], ["selection:US|RM", ["US", "RM"]], ["selection:none", []],
  ["selection:one", ["RM", "US"]], ["selection:many", ["RM", "US"]], ["document and selection:any", ["X"]], ["selection:US or RM", ["US"]], ["selection:", ["US"]],
  ["document", []], ["selection:any and selection:RM", []]];
if (fs.existsSync(py)) {
  const r = spawnSync(py, ["-c", `import json,sys; sys.path.insert(0, ${JSON.stringify(path.join(S3D, "src"))})
from s3dgraphy.extensions.slots import when_holds
print(json.dumps([when_holds(w, document=True, selected_types=t) for w, t in json.loads(sys.argv[1])]))`, JSON.stringify(CASES)], { encoding: "utf8" });
  eq(JSON.parse(r.stdout), CASES.map(([w, t]) => holds(w, t)), "`when`: the page and s3Dgraphy agree on every case");
}

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), model = read("frontend/src/model.ts"), bridge = read("tools/em_bridge.py"), emPy = read("tools/em_py.py");
const i18n = read("frontend/src/i18n.ts"), menuUi = read("frontend/src/menu-ui.ts");
ok(/private opFns: Array/.test(model) && /onOp\(fn: \(op: GraphOp\) => void\): \(\) => void/.test(model) && /for \(const fn of this\.opFns\) fn\(op\)/.test(model), "G18: onOp is a list, with its way out");
ok(/pyNudge\("document-saved"/.test(main) && /pyNudge\("document-opened"/.test(main), "G19: document-saved after a save, document-opened after an open");
{ // MICRO-PL18 · 83 or later, the same in the three (a later MICRO raises it without touching this)
  const lv = [Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(main)?.[1]), Number(/^BRIDGE_LEVEL = (\d+)/m.exec(bridge)?.[1]), Number(/^LEVEL = (\d+)/m.exec(emPy)?.[1])];
  ok(lv[0] >= 83 && lv.every((x) => x === lv[0]), "level 83 or later, the same in the page, the bridge, em_py");
}
ok(/"\/py\/plugins", "\/py\/invoke", "\/py\/checks"/.test(bridge), "the three routes in the table of routes");
ok(/invoke: \(id\) => invokePluginRow\(id\)/.test(main) && /hooks\.invoke\?\.\(id\)/.test(menuUi), "a run row invokes (page and system menu, runCommand)");
ok(/plugins\(\)\.commandsIn\("export\.narrative"\)/.test(main), "export.narrative@1 in Narrative ▸ Export");
ok((main.match(/pluginContextEntries\(/g) ?? []).length >= 4, "context.node@1: the Matrix and the Space (proxy, model)");
ok(/pluginIssuesFor\(s\)/.test(main) && /schedulePluginChecks\(s\)/.test(main), "check@1 into the warnings");
ok(/readersFor\(f\.path\)/.test(main), "door.reader@1 in «Porta dentro…»");
ok(/renderToolsPlugins/.test(main) && /dd-sub-plugins/.test(main), "menu.tools@1: Tools ▸ Plugins");
ok(!/if \(EXPERIMENTAL\)[^\n]*refreshPlugins/.test(main), "the plugins are not behind «Funzioni sperimentali» (D-7: the console is)");
const keys = [...new Set([...main.matchAll(/t\("(plg\.[A-Za-z]+)"/g)].map((m) => m[1]))];
ok(keys.length >= 10, "the plg.* keys used");
for (const k of keys) ok((i18n.match(new RegExp(`"${k.replace(".", "\\.")}":`, "g")) ?? []).length >= 2, `${k}: EN + IT`);

// ── a real bridge ───────────────────────────────────────────────────────────
if (!fs.existsSync(py)) {
  console.log(`check-plugins: ${checks} checks passed (no s3Dgraphy venv at ${py}: the live part skipped)`);
  process.exit(0);
}
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugins-check-"));
const TOKEN = "check-plugins-secret-0123456789abcdef";
const machine = { S3DGRAPHY_CONSOLE_DIR: path.join(dir, "console"), S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"),
  S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"), S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"),
  S3DGRAPHY_PLUGINS_DATA_DIR: path.join(dir, "plugins-data"),
  EM_VOCABULARIES_DIR: path.join(dir, "vocab"), EM_BRIDGE_STATE_DIR: path.join(dir, "state"), EM_PY_ANSWER_S: "10" };

// the plugin of this check (a pure plugin, from disk)
const plugin = (id, module, { caps = '["read-graph", "write-graph", "ingest-batch"]', api = "1.0" } = {}) => {
  const f = path.join(dir, "src", id);
  fs.mkdirSync(path.join(f, module), { recursive: true });
  fs.writeFileSync(path.join(f, "LICENSE"), "EUPL-1.2 (check)\n");
  fs.writeFileSync(path.join(f, module, "__init__.py"), `
from s3dgraphy import em
HEARD = []

def mark(slots):
    with em.write("Segnato dal plugin") as tx:
        tx.update(slots["unit"], "description", "segnato")
    return slots["unit"]

def sneak(slots):
    with em.write("Di nascosto") as tx:
        tx.update("us1", "description", "x")

def nodesc(slots):
    return [{"rule": "nodesc", "sev": "warning", "node": n.id, "txt": {"en": "no description", "it": "senza descrizione"}}
            for n in em.graph.nodes(type="US") if not n.description]

def read(slots):
    names = open(slots["path"], encoding="utf-8").read().split()
    with em.write("Unità lette", volatile=True) as tx:
        for name in names:
            tx.add_node("US", name)
    return len(names)

def setup(ctx):
    ctx.command("mark", mark)
    ctx.command("sneak", sneak)
    ctx.command("nodesc", nodesc)
    ctx.command("read", read)
    ctx.command("export", lambda s: ctx.file("unita.txt", "\\n".join(sorted(n.name for n in em.graph.nodes(type="US"))), "text/plain"))
    ctx.on("selection-changed", lambda p: HEARD.append(p.get("ids")))
    ctx.expose("heard", lambda: list(HEARD))

def teardown(ctx):
    HEARD.clear()

plugin = type("Plugin", (), {"setup": staticmethod(setup), "teardown": staticmethod(teardown)})
`);
  fs.writeFileSync(path.join(f, "em-extension.toml"), `schema_version = "1.0.0"
id = "${id}"
version = "0.1.0"
name = "Plugin del controllo (PROVA)"
tagline = "A plugin of check-plugins"
maintainer = "check-plugins"
license = ["SPDX:EUPL-1.2"]
em_api_min = "${api}"
type = "plugin"

[code]
entry = "${module}:plugin"
hosts = ["emstudio"]
  [code.permissions]
  files = "Legge il file che gli si dà"
  [code.descriptor]
  host = "emstudio-side"
  transport = ["direct"]
  capabilities = ${caps}
  provenance = "derivation"
  [[code.commands]]
  id = "mark"
  label = { it = "Segna", en = "Mark" }
  slots = [{ name = "unit", kind = "id" }]
  in = ["context.node@1", "menu.tools@1"]
  when = "selection:US"
  [[code.commands]]
  id = "sneak"
  label = "Sneak"
  writes = false
  in = ["menu.tools@1"]
  [[code.commands]]
  id = "lonely"
  label = { it = "Solo dichiarato", en = "Only declared" }
  writes = false
  in = ["menu.tools@1", "panel@1"]
  [[code.commands]]
  id = "nodesc"
  label = "Units without a description"
  in = ["check@1"]
  [[code.commands]]
  id = "export"
  label = { it = "Unità come testo", en = "Units as text" }
  writes = false
  in = ["menu.file.export@1", "export.narrative@1"]
  [[code.commands]]
  id = "read"
  label = "Read a list of units"
  slots = [{ name = "path", kind = "path" }]
  in = ["door.reader@1"]
  accept = [".units"]
`);
  return f;
};

const port = await freePort();
const child = spawn(py, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(port), "--s3dgraphy", path.join(S3D, "src")],
  { env: { ...process.env, ...machine, EM_BRIDGE_TOKEN: TOKEN }, stdio: ["ignore", "ignore", "pipe"] });
let err = "";
child.stderr.on("data", (d) => { err += d; });
const B = `http://127.0.0.1:${port}`;
const post = async (route, body, auth = true) => {
  const r = await fetch(`${B}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
try {
  for (let i = 0; i < 150; i++) {
    try { const r = await fetch(`${B}/health`); if (r.ok) break; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  eq((await post("/py/plugins", {}, false)).status, 401, "/py/plugins is behind the secret");
  eq((await post("/py/plugins", { lang: "it" })).j.plugins, [], "no plugin installed: none loaded");

  const src = plugin("plug-check", "plug_check_mod");
  const inst = await post("/extensions/install", { path: src, trust: true });
  eq([inst.status, inst.j.ok !== false], [200, true], "installed from disk with the trust answer (/extensions/install)");
  const bad = plugin("plug-future", "plug_future_mod", { api: "9.0" });
  await post("/extensions/install", { path: bad, trust: true });
  const weak = plugin("plug-weak", "plug_weak_mod", { caps: '["read-graph", "ingest-batch"]' });
  await post("/extensions/install", { path: weak, trust: true });

  const pl = (await post("/py/plugins", { lang: "it" })).j;
  const byId = Object.fromEntries(pl.plugins.map((p) => [p.id, p]));
  eq(byId["plug-check"].state, "loaded", "the plugin loaded in the bridge");
  eq(byId["plug-check"].verified, false, "…from disk, not verified");
  eq(byId["plug-future"].state, "refused", "a plugin for another em: refused");
  ok(/chiede em/.test(byId["plug-future"].problems[0].it), "…said in Italian");
  eq(byId["plug-check"].commands.find((c) => c.id === "lonely").off, [{ slot: "panel@1", why: "phase2" }], "a phase-2 entry turned off, the command kept");
  eq(pl.listeners["selection-changed"], 2, "the plugins' listeners counted (two plugins listen)");

  const state2 = new M.PluginState();
  state2.set(pl);
  eq(state2.commandsIn("context.node").map((c) => c.name).sort(), ["plug-check/mark", "plug-weak/mark"], "context.node@1 from the bridge's answer");

  // the page's module on a real DocumentStore
  const st = new M.DocumentStore({ header: { format: "em.json", schema_version: 2, version: "1.0" },
    graph: { graph_id: "pl17", nodes: [{ id: "us1", node_type: "US", name: "US1", description: "una" }, { id: "us2", node_type: "US", name: "US2", description: "" }], edges: [] } });
  const logs = [];
  const page = {
    base: async () => B, token: async () => TOKEN, doc: () => JSON.parse(st.toJSON()), revision: () => st.rev,
    author: () => "0000-0002-1825-0097", lang: () => "it", declared: () => [], selection: () => ["us2"],
    applyStep: (step) => { M.applyDelta(st, step.delta, { renameCopies: true }); return st.rev; },
    log: (level, message, ids) => logs.push({ level, message, ids }), t: (k, v) => `${k}${v ? JSON.stringify(v) : ""}`,
    host: { select() {}, view: () => true, notify() {}, command: () => true, camera: () => null, setCamera() {}, frame() {}, pick: async () => null },
  };
  const s = new M.PySession(page);
  await s.open();
  const depth0 = st.undoStack.length;
  let out = await s.invoke("plug-check", "mark", M.fillSlots(state2.plugin("plug-check").commands.find((c) => c.id === "mark"), { selection: ["us2"] }));
  eq([out.status, out.steps.length, st.undoStack.length - depth0, out.result?.value], ["done", 1, 1, "us2"], "a command: one step, ONE undo step, its value");
  eq(st.node("us2")?.description, "segnato", "…written in the page's document");
  const dtc = st.doc.graph.nodes.find((n) => n.node_type === "dtc_process");
  const pp = dtc?.data?.parameters ?? {};
  eq([dtc?.name, pp.plugin, pp.command, pp.verified, pp.source, dtc?.data?.software?.[0]?.name, dtc?.data?.created_by],
     ["Segnato dal plugin", "plug-check", "mark", false, "disk", "plug-check/plug_check_mod", "0000-0002-1825-0097"],
     "the act's DTC names the plugin, its command, unverified, from disk; the author is the page's");
  eq(logs.at(-1)?.message, 'py.step{"label":"Segnato dal plugin"}', "the Log line with the label");
  st.undo();
  ok(st.node("us2")?.description === "" && !st.doc.graph.nodes.some((n) => n.node_type === "dtc_process"), "ONE undo takes the write and its DTC away");

  // the four refusals, in Italian, nothing applied
  const rev0 = st.rev;
  out = await s.invoke("plug-check", "mark", {});
  ok(out.status === "refused" && /Mi manca unit/.test(out.error), "a slot missing: «Mi manca unit» (the contract does not invent)");
  out = await s.invoke("plug-check", "lonely", {});
  ok(out.status === "refused" && /non ancora collegato/.test(out.error), "declared and not wired: refusal 2");
  out = await s.invoke("plug-check", "nope", {});
  ok(out.status === "refused" && /Non so farlo/.test(out.error), "unknown: refusal 1, with what it can do");
  out = await s.invoke("plug-check", "sneak", {});
  ok(out.status === "error" && /sola lettura|read-only/.test(out.error + out.output), "a read-only command that writes: refused");
  out = await s.invoke("plug-weak", "mark", { unit: "us2" });
  ok(out.status !== "done" && /write-graph/.test(out.error + out.output), "a plugin without write-graph: the seam refuses its write");
  eq(st.rev, rev0, "…and nothing reached the page");

  // check@1, the exporter, the reader
  const issues = await s.checks();
  eq(issues.map((i) => [i.plugin, i.node, i.txt]).filter(([p]) => p === "plug-check"), [["plug-check", "us2", "senza descrizione"]], "check@1: a warning with its plugin, in Italian");
  out = await s.invoke("plug-check", "export", {});
  eq([out.result?.file?.name, out.result?.file?.text], ["unita.txt", "US1\nUS2"], "an exporter returns its file");
  const units = path.join(dir, "lista.units");
  fs.writeFileSync(units, "US10 US11");
  out = await s.invoke("plug-check", "read", { path: units });
  eq([out.status, out.steps.length, out.steps[0]?.volatile, out.result?.value], ["done", 1, true, 2], "a reader: a proposal, one step");
  ok(["US10", "US11"].every((n) => st.doc.graph.nodes.some((x) => x.name === n)), "…its units in the document");

  // event@1: the plugin hears the page's selection; console@1: em.ext
  s.listeners = { ...s.listeners, ...pl.listeners };
  await s.event("selection-changed", { ids: ["us1"] });
  out = await s.run("em.ext.plug_check.heard()");
  eq(out.value, "[['us1']]", "a plugin's listener heard the selection; em.ext reaches what it exposes");
  out = await s.run("em.help()");
  ok(/plug-check\/mark — Segna/.test(out.output), "em.help() lists the plugins' commands");

  // disabled in «Estensioni»: gone at the next ask
  await post("/extensions/disable", { id: "plug-check" });
  const after2 = (await post("/py/plugins", {})).j;
  ok(!after2.plugins.some((p) => p.id === "plug-check"), "disabled: unloaded (teardown), its commands gone");
  out = await s.invoke("plug-check", "mark", { unit: "us2" });
  ok(out.status === "refused" && /nessun plugin/.test(out.error), "…and invoking it says there is none");
  await s.close();
} finally {
  child.kill();
}
console.log(`check-plugins: ${checks} checks passed`);
