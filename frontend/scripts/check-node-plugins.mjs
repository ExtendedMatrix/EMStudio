// MICRO-PL27-PLUGIN-SUL-NODO (X7) · executable check of the plugins of the
// node in the web page's «Estensioni»:
//   · the pure pieces (src/node-plugins.ts): what the page can fill (nothing,
//     or the selection as id/ids), the slots from the selection, a value as
//     one line of text, who may turn a plugin on (owner, admin);
//   · the state over a fake node: the routes it asks (GET …/rooms/<room>/plugins,
//     POST …/plugins/<id> {on}, POST …/plugins/<id>/commands/<cmd> {slots, lang}
//     — never an author), «this node offers no plugins» on a 404, no room, no node;
//   · the section (linkedom): the cage proved or not and why, the quota, a
//     plugin's switch (disabled with why for a viewer, for a cage that is not
//     serious, for a plugin that cannot run there), the commands only when on,
//     a writing one disabled in a room that only reads, an answer drawn as TEXT
//     (an <img onerror> stays text), a refusal in Italian;
//   · the wiring: the window draws the host's section on the web only; main.ts
//     gives it the role, the room, the selection and the signed fetch; every
//     new word in EN and IT;
//   · the library's real shape: s3dgraphy extensions.node (the node's half) on
//     a plugin installed in /tmp, its describe() drawn by the section and a
//     command run in the cage of this machine.
//
//   node scripts/check-node-plugins.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = path.resolve(SRC, "../..");
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const { document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = document;
const N = await load("node-plugins.ts");
const W = await load("extensions-window.ts");
const words = (k, v) => (v ? `${k}(${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(",")})` : k);

// ── the pure pieces ─────────────────────────────────────────────────────────
const cmd = (id, slots = [], writes = false) => ({ id, name: `p/${id}`, label: { en: id, it: `${id} (it)` }, writes, slots });
ok(N.fillable(cmd("a")), "no slot: the page can run it");
ok(N.fillable(cmd("b", [{ name: "unit", kind: "id" }])) && N.fillable(cmd("c", [{ name: "ids", kind: "ids" }])), "id / ids: from the selection");
ok(!N.fillable(cmd("d", [{ name: "tol", kind: "number" }])) && N.fillable(cmd("e", [{ name: "tol", kind: "number", required: false }])),
   "a required number: not yet; an optional one: yes");
eq(N.slotsFor(cmd("b", [{ name: "unit", kind: "id" }]), ["US1", "US2"]), { unit: "US1" }, "id = the first selected");
eq(N.slotsFor(cmd("c", [{ name: "ids", kind: "ids" }]), ["US1", "US2"]), { ids: ["US1", "US2"] }, "ids = all");
eq(N.slotsFor(cmd("b", [{ name: "unit", kind: "id" }]), []), null, "a required id with nothing selected: not sent");
eq(N.valueText({ en: "3 units", it: "3 unità" }, "it"), "3 unità", "a value in two languages: the page's");
eq(N.valueText(2, "it"), "2", "a number");
ok(N.valueText("x".repeat(10), "en") === "xxxxxxxxxx" && N.valueText({ a: "y".repeat(500) }, "en").endsWith("…"), "a long value cut, one line");
ok(N.canTurnOn("owner") && N.canTurnOn("admin") && !N.canTurnOn("editor") && !N.canTurnOn("viewer") && !N.canTurnOn(null),
   "owner and admin turn a plugin on, nobody else");

// ── the state over a fake node ──────────────────────────────────────────────
const prob = (code, it, level = "error") => ({ code, level, en: `${code} (en)`, it });
const DOC = {
  host: "server", room: "scavo-1",
  isolation: { backend: "bwrap", serious: true, problems: [] },
  quota: { calls_last_minute: 1, cpu_s_last_hour: 0.4, running: 0, limits: { calls_per_minute: 30, cpu_s_per_hour: 120, wall_s: 10 } },
  plugins: [
    { id: "conta-us", version: "0.1.0", name: "Conta le US", verified: true, reviewed: { by: "@ed", on: "2026-11-19" }, eligible: true, problems: [],
      capabilities: ["read-graph", "write-graph"], on: true,
      commands: [cmd("count"), cmd("mark", [{ name: "unit", kind: "id" }], true), cmd("tune", [{ name: "tol", kind: "number" }])] },
    { id: "spento", version: "1.0.0", name: { en: "Off one", it: "Uno spento" }, verified: false, eligible: true, problems: [], capabilities: [], on: false,
      commands: [cmd("x")] },
    { id: "rete", version: "1.0.0", name: "Web", verified: false, eligible: false, capabilities: [], on: false,
      problems: [prob("node_permission", "rete: chiede il permesso network, che il nodo non dà mai")], commands: [] }],
};
const calls = [];
let answer404 = false;
const fakeFetch = async (url, init = {}) => {
  calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null });
  if (answer404) return new Response("{}", { status: 404 });
  if (url.includes("/commands/")) {
    const c = url.split("/commands/")[1];
    const body = c === "count" ? { ok: true, value: '<img src=x onerror="globalThis.PWNED=1">', messages: { en: "Count", it: "Conta" } }
      : { ok: false, reason: "node_timeout", messages: { en: "stopped after 10 s", it: "fermato dopo 10 s" } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if ((init.method ?? "GET") === "POST") return new Response(JSON.stringify({ ok: true }), { status: 200 });
  return new Response(JSON.stringify(DOC), { status: 200 });
};
let changed = 0;
let room = "scavo-1", base = "https://node.example.org/";
const st = new N.NodePluginsState({ nodeBase: () => base, room: () => room, fetch: fakeFetch, lang: () => "it", changed: () => { changed++; } });
await st.refresh();
eq(calls[0], { url: "https://node.example.org/v1/rooms/scavo-1/plugins?lang=it", method: "GET", body: null }, "GET <hub>/v1/rooms/<room>/plugins?lang=");
ok(st.doc?.plugins.length === 3 && st.why === null && changed === 1, "…read, said to the page");
eq(await st.setOn("spento", true), null, "turned on: no refusal");
eq(calls[1], { url: "https://node.example.org/v1/rooms/scavo-1/plugins/spento", method: "POST", body: { on: true } }, "POST …/plugins/<id> {on}");
const a = await st.run("conta-us", "mark", { unit: "US1" });
eq(calls.at(-1), { url: "https://node.example.org/v1/rooms/scavo-1/plugins/conta-us/commands/mark", method: "POST", body: { slots: { unit: "US1" }, lang: "it" } },
   "POST …/commands/<cmd> {slots, lang}: never an author");
ok(!a.ok && a.reason === "node_timeout" && st.answers["conta-us/mark"] === a && !st.running.size, "the answer kept by command; nothing running");
answer404 = true;
await st.refresh();
eq([st.doc, st.why], [null, "notOffered"], "404: «this node offers no plugins»");
answer404 = false;
room = null;
await st.refresh();
eq(st.why, "noRoom", "no room: said");
base = null;
await st.refresh();
eq(st.why, "noNode", "no node: said");
base = "https://node.example.org"; room = "scavo-1";
await st.refresh();

// ── the section ─────────────────────────────────────────────────────────────
const logs = [];
const sh = (role, write = true, sel = ["US1"]) => ({ t: words, lang: () => "it", role: () => role, canWrite: () => write, selection: () => sel, log: (m) => logs.push(m) });
let sec = N.nodePluginsSection(document, sh("owner"), st, () => {});
ok(sec.dataset.extNodePlugins === "1" && sec.querySelector("h3").textContent === "npl.head", "the section, headed");
eq(sec.querySelector("[data-npl-serious]").dataset.nplSerious, "true", "the cage proved");
ok(sec.querySelector(".npl-iso").textContent === "npl.isoOn(b=bwrap)", "…with its sandbox's name");
ok(sec.querySelector("[data-npl-quota]").textContent.includes("c=1,cm=30"), "the room's quota");
const rowOf = (s, id) => s.querySelector(`[data-npl-id="${id}"]`);
ok(!rowOf(sec, "conta-us").querySelector("[data-npl-on]").disabled && rowOf(sec, "conta-us").querySelector("[data-npl-on]").checked, "on, the owner's switch");
ok(rowOf(sec, "conta-us").querySelector(".ext-facts").textContent.includes("npl.reviewed(by=@ed,on=2026-11-19)"), "reviewed by, said");
eq(rowOf(sec, "spento").querySelector("[data-npl-cmd]"), null, "a plugin off: no command drawn");
ok(rowOf(sec, "spento").querySelector(".ext-name").textContent === "Uno spento", "a name in two languages: the page's");
const rete = rowOf(sec, "rete");
ok(rete.querySelector("[data-npl-on]").disabled && rete.querySelector(".npl-switch").title === "npl.offEligible", "a plugin that cannot run there: disabled, with why");
ok(rete.querySelector('[data-npl-problem="node_permission"]').textContent.includes("che il nodo non dà mai"), "…the library's sentence in Italian");
const bCount = rowOf(sec, "conta-us").querySelector('[data-npl-cmd="conta-us/count"]');
const bTune = rowOf(sec, "conta-us").querySelector('[data-npl-cmd="conta-us/tune"]');
ok(!bCount.disabled && bCount.textContent === "count (it)" && bCount.title === "npl.cmdReads", "a reading command: its Italian label, «legge soltanto»");
ok(bTune.disabled && bTune.title === "npl.cmdSlots", "a command needing a number: disabled, why");
const markAns = rowOf(sec, "conta-us").querySelector('[data-npl-answer="conta-us/mark"]');
ok(markAns.textContent === "fermato dopo 10 s" && markAns.classList.contains("npl-refused"), "the last refusal, in Italian");
// a viewer
sec = N.nodePluginsSection(document, sh("viewer", false), st, () => {});
ok(rowOf(sec, "conta-us").querySelector("[data-npl-on]").disabled && rowOf(sec, "conta-us").querySelector(".npl-switch").title === "npl.offOwner",
   "a viewer sees the switch, disabled, with why");
const bMark = rowOf(sec, "conta-us").querySelector('[data-npl-cmd="conta-us/mark"]');
ok(bMark.disabled && bMark.title === "npl.cmdReadOnly", "a writing command in a room that only reads: disabled, why");
// running: the value is TEXT
sec = N.nodePluginsSection(document, sh("owner"), st, () => {});
await rowOf(sec, "conta-us").querySelector('[data-npl-cmd="conta-us/count"]').onclick();
sec = N.nodePluginsSection(document, sh("owner"), st, () => {});
const val = rowOf(sec, "conta-us").querySelector('[data-npl-answer="conta-us/count"]');
ok(val.textContent.startsWith("<img") && !sec.querySelector("img") && globalThis.PWNED === undefined, "a plugin's value stays text (no <img> in the page)");
ok(logs.at(-1).startsWith("npl.ran(c=count (it),v=<img"), "…and in the Log");
// a cage that is not serious
st.doc = { ...DOC, isolation: { backend: "none", serious: false, problems: [prob("node_sandbox_none", "nessuna gabbia su questa macchina")] } };
sec = N.nodePluginsSection(document, sh("owner"), st, () => {});
ok(sec.querySelector(".npl-iso").classList.contains("cw-warn") && sec.querySelector(".npl-iso").textContent === "npl.isoOff(b=none)", "not serious: off, said");
ok(sec.querySelector('[data-npl-iso-problem="node_sandbox_none"]').textContent === "nessuna gabbia su questa macchina", "…and why, in Italian");
ok(rowOf(sec, "conta-us").querySelector("[data-npl-on]").disabled && !rowOf(sec, "conta-us").querySelector("[data-npl-cmd]"), "…no switch, no command");
st.doc = DOC;
// the reasons
for (const why of ["noNode", "noRoom", "notOffered", "error"]) {
  st.why = why; st.doc = null;
  const s = N.nodePluginsSection(document, sh("owner"), st, () => {});
  eq(s.querySelector("[data-npl-why]").dataset.nplWhy, why, `why: ${why}`);
}

// ── the window draws the host's section on the web only ─────────────────────
const host = { t: words, lang: () => "it", toast: () => {}, log: () => {}, dialog: async () => ({ ok: false }),
  pickArchive: async () => null, canPickFolder: () => false, fileName: () => null, openVocabularies: () => {}, afterChange: () => {},
  nodePlugins: (d) => { const e = d.createElement("div"); e.dataset.fromHost = "1"; return e; } };
const ext = (from, unavailable) => ({ rows: [], unavailable, from, error: null, platform: "", dirs: {}, overlay: null, missing: [], newer: [],
  repos: null, online: null, officialUrl: "", available: [], blocked: [], updates: [], otherPlatforms: [], syncProblems: {}, versions: {} });
ok(W.extensionsContent(document, host, ext("node", false), () => {}).querySelector("[data-from-host]"), "the node answered: the section is drawn");
ok(W.extensionsContent(document, host, ext("bridge", true), () => {}).querySelector("[data-from-host]"), "nothing answered (the web with an old node): drawn too");
ok(!W.extensionsContent(document, host, ext("bridge", false), () => {}).querySelector("[data-from-host]"), "the desktop's bridge: not drawn");

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), np = read("frontend/src/node-plugins.ts");
ok(/import \{ NodePluginsState, nodePluginsSection \} from "\.\/node-plugins";/.test(main), "main.ts imports the module");
ok(/nodePlugins: \(d\) => nodePluginsSection\(d, \{/.test(main) && /role: \(\) => hostInfo\.role \?\? null/.test(main) &&
   /canWrite: \(\) => !hubReadOnly\(\)/.test(main) && /selection: \(\) => \[\.\.\.selectedIds\]/.test(main), "…the role, the write, the selection");
ok(/fetch: \(url, init\) => nodeAuthFetch\(url, init\)/.test(main), "…the node's signed fetch (the session's token)");
ok(/if \(extState\.from === "node" \|\| extState\.unavailable\) void nodePlugState\.refresh\(\);/.test(main), "…asked on the web only");
ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/.test(np), "node-plugins.ts: no innerHTML");
const i18n = read("frontend/src/i18n.ts");
const itStart = i18n.indexOf("const IT: Dict = {");
const keys = [...new Set([...np.matchAll(/t\(`?"?(npl\.[A-Za-z.]+)/g)].map((m) => m[1]))]
  .concat(["npl.why.noNode", "npl.why.noRoom", "npl.why.notOffered", "npl.why.error"]).filter((k) => !k.endsWith("."));
ok(keys.length >= 24, `the section's words (${keys.length})`);
for (const k of keys) {
  const re = new RegExp(`^  "${k.replace(/\./g, "\\.")}": "`, "m");
  ok(re.test(i18n.slice(0, itStart)) && re.test(i18n.slice(itStart)), `${k} in EN and IT`);
}

// ── the library's real shape (s3dgraphy extensions.node) ────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
if (!fs.existsSync(py)) {
  console.log("  (s3Dgraphy's .venv not found: the library's part skipped)");
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npl-"));
  const env = { ...process.env, PYTHONPATH: path.join(S3D, "src") };
  for (const k of ["S3DGRAPHY_EXTENSIONS_DIR", "S3DGRAPHY_PLUGINS_DIR", "S3DGRAPHY_PROFILES_DIR", "EM_VOCABULARIES_DIR", "S3DGRAPHY_NODE_DIR", "S3DGRAPHY_PLUGINS_DATA_DIR"]) {
    env[k] = path.join(dir, k.toLowerCase());
    fs.mkdirSync(env[k], { recursive: true });
  }
  const code = String.raw`
import json, sys, pathlib, textwrap
from s3dgraphy import extensions as X
from s3dgraphy.extensions import node as N
from s3dgraphy.graph import Graph
from s3dgraphy.nodes.stratigraphic_node import StratigraphicUnit
from s3dgraphy.exporter.emjson_exporter import build_emjson
d = pathlib.Path(sys.argv[1]) / "conta-us-0.1.0"
(d / "conta_us").mkdir(parents=True)
(d / "conta_us" / "__init__.py").write_text(textwrap.dedent('''
from s3dgraphy import em
def count(s):
    n = len(list(em.graph.nodes(type="US")))
    return {"en": f"{n} units", "it": f"{n} unità"}
def mark(s):
    with em.write("Segnata dal nodo") as tx:
        tx.update(s["unit"], "description", "segnata")
    return s["unit"]
def setup(ctx):
    ctx.command("count", count)
    ctx.command("mark", mark)
plugin = type("P", (), {"setup": staticmethod(setup)})
'''))
(d / "LICENSE").write_text("EUPL-1.2\n")
(d / "em-extension.toml").write_text('''schema_version = "1.0.0"
id = "conta-us"
version = "0.1.0"
name = "Conta le US (ESEMPIO)"
tagline = "Conta le US di una stanza"
maintainer = "Esempio"
license = ["SPDX:EUPL-1.2"]
em_api_min = "1.0"
type = "plugin"
[code]
entry = "conta_us:plugin"
hosts = ["server"]
  [code.descriptor]
  host = "app-side"
  transport = ["cloud"]
  capabilities = ["read-graph", "write-graph"]
  provenance = "derivation"
  [[code.commands]]
  id = "count"
  label = { it = "Conta le US", en = "Count the units" }
  in = ["menu.tools@1"]
  [[code.commands]]
  id = "mark"
  label = { it = "Segna", en = "Mark" }
  writes = true
  slots = [{ name = "unit", kind = "id" }]
  in = ["menu.tools@1"]
''')
X.install(d, trust=True)
N.set_room("scavo-1", "conta-us", True, by="0000-0002-1825-0097")
g = Graph(graph_id="g"); g.add_node(StratigraphicUnit("US1", "US1")); g.add_node(StratigraphicUnit("US2", "US2"))
doc = build_emjson(g)
desc = N.describe("scavo-1", lang="it")
r1 = N.run("scavo-1", "conta-us", "count", document=doc, author="0000-0002-1825-0097", lang="it")
r2 = N.run("scavo-1", "conta-us", "mark", {"unit": "US2"}, document=doc, author="0000-0002-1825-0097", lang="it")
applied = [x.ok for x in N.apply_to_section(doc["graph"], r2, author="0000-0002-1825-0097")]
us2 = [n.get("description") for n in doc["graph"]["nodes"] if n["id"] == "US2"]
r3 = N.run("scavo-1", "conta-us", "mark", {"unit": "US2"}, document=doc, author="x", can_write=False, lang="it")
print(json.dumps({"describe": desc, "r1": r1, "r2": {k: r2.get(k) for k in ("ok", "value")}, "deltas": len(r2.get("deltas") or []),
                  "applied": applied, "us2": us2, "r3": [r3.get("reason"), r3.get("message")]}, default=str))
`;
  const out = JSON.parse(execFileSync(py, ["-c", code, dir], { env }).toString());
  const D = out.describe;
  ok(D.host === "server" && D.room === "scavo-1" && Array.isArray(D.plugins) && D.quota, "describe(): the shape the page reads");
  ok(!JSON.stringify(D).includes(dir), "…no path of the node's disk");
  const serious = D.isolation.serious;
  console.log(`  (this machine's cage: ${D.isolation.backend}, ${serious ? "serious" : "not serious"})`);
  const real = new N.NodePluginsState({ nodeBase: () => "https://n", room: () => "scavo-1", fetch: async () => new Response(JSON.stringify(D)), lang: () => "it", changed: () => {} });
  await real.refresh();
  const s = N.nodePluginsSection(document, sh("owner"), real, () => {});
  ok(rowOf(s, "conta-us") && rowOf(s, "conta-us").querySelector("[data-npl-on]").checked === serious, "the library's describe drawn: the plugin, on in the room when the cage holds");
  if (serious) {
    ok(rowOf(s, "conta-us").querySelector('[data-npl-cmd="conta-us/count"]').textContent === "Conta le US", "…its command, in Italian");
    eq(out.r1.ok && out.r1.value, { en: "2 units", it: "2 unità" }, "a command run in the cage: its value");
    eq(N.valueText(out.r1.value, "it"), "2 unità", "…said in the page's language");
    eq([out.r2, out.deltas, out.applied, out.us2], [{ ok: true, value: "US2" }, 1, [true], ["segnata"]],
       "a writing command: one delta, applied by the node through the seam");
    eq(out.r3[0], "node_role_read_only", "a viewer's write: refused before it runs");
    ok(/legge soltanto/.test(out.r3[1]), "…in Italian");
  } else {
    ok(D.isolation.problems.length > 0, "not serious: the reason is there for the page");
  }
}

console.log(`check-node-plugins: ${checks} checks passed`);
