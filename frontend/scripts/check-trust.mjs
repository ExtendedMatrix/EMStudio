// MICRO-PL18-FIDUCIA-DA-DISCO (W15a) · executable check of the trust from disk.
//
//   · the pure pieces: the mark SEEN in a plugin's menu entry (badgeOf:
//     «non verificato» from disk, «sviluppo» from the development folder,
//     nothing for a verified one), the provenance of a development plugin, the
//     development folder in the PluginState;
//   · the window (extensions-window.ts, linkedom): the code's question asked the
//     first time and when permissions/capabilities/source changed, NOT asked
//     for an update that keeps them («codice aggiornato … · nessuna nuova
//     domanda»); the section «Cartella di sviluppo» only when the host gives
//     one (the switch on), with the folder, its plugins, their state and
//     «Ricarica»;
//   · the wiring: the page asks the folder only with «Funzioni sperimentali»,
//     the mark in Tools ▸ Plugins, the run rows (page and system menu) and the
//     context menus; level 84 in the page, the bridge and em_py; EN + IT;
//   · a REAL bridge (84) with its secret and machine folders in /tmp: the folder
//     refused without the switch and when it is not a folder; set, its plugin
//     loaded where it is (source dev, not verified, never in the register);
//     the switch off → unloaded; a command = one step whose DTC says source
//     dev, verified false; the files changed + «Ricarica» → the new code runs;
//     an installed plugin is not «reloaded»; the library's real previews of an
//     update with the same permissions (no question) and with a new one
//     (asked, «permissions» said).
//
// Run: node frontend/scripts/check-trust.mjs (S3D=… for another s3Dgraphy).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = path.resolve(SRC, "../..");
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const load = async (contents) => {
  const b = await esbuild.build({ stdin: { contents, resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false,
    logLevel: "silent", loader: { ".json": "json" } });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const { document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = document;
const M = await load(`export { DocumentStore } from "./model"; export { applyDelta } from "./property-source"; export * from "./py-session";
  export * from "./plugin-commands"; export * as W from "./extensions-window";`);
const words = (k, v) => (v ? `${k}(${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(",")})` : k);

// ── pure pieces ─────────────────────────────────────────────────────────────
eq([M.badgeOf({ source: "disk", verified: false }, words), M.badgeOf({ source: "dev", verified: false }, words),
    M.badgeOf({ source: "disk", verified: true }, words), M.badgeOf(null, words)],
   ["plg.badgeDisk", "plg.badgeDev", "", ""], "the mark seen: from disk «non verificato», development «sviluppo», verified none");
eq(M.provenance({ id: "p", version: "0.1.0", source: "dev", verified: false }, words),
   "plg.unverified(id=p,version=0.1.0,source=plg.dev)", "the tooltip of a development plugin");
const ps = new M.PluginState();
ps.set({ plugins: [], dev_supported: true, dev: { setting: "/x", env: false, exists: true, plugins: [] } });
ok(ps.devSupported && ps.dev?.setting === "/x", "the development folder kept from the bridge's answer");
ps.set({ plugins: [] });
ok(!ps.devSupported && ps.dev === null, "…and dropped when the answer has none (the switch off)");

// ── the window ──────────────────────────────────────────────────────────────
const W = M.W;
const host = { t: words, lang: () => "it", toast: () => {}, log: () => {}, dialog: async () => ({ ok: false }),
  pickArchive: async () => null, canPickFolder: () => true, fileName: () => null, openVocabularies: () => {}, afterChange: () => {} };
const fakeState = { rows: [], unavailable: false, error: null, platform: "macos-arm64", dirs: {}, overlay: null, missing: [] };
const codePanel = (code) => W.confirmBody(document, host, { id: "p", ok: true, kind: "plugin", data: { present: false },
  code: { present: true, module: "p_mod", version: "0.2.0", permissions: { files: "Legge i file" }, capabilities: ["read-graph"], commands: [], ...code } })
  .querySelector('[data-ext-panel="code"]');
let panel = codePanel({ trust_needed: true, update: "new" });
eq([panel.dataset.extTrust, !!panel.querySelector(".ext-powers"), !!panel.querySelector("[data-ext-trust-kept]")], ["asked", true, false],
   "the first time: asked, with «un plugin Python ha i poteri del tuo utente»");
panel = codePanel({ trust_needed: false, update: "new_version", updated: { code: "code_updated", en: "code updated 0.1.0 → 0.2.0", it: "codice aggiornato 0.1.0 → 0.2.0" } });
eq([panel.dataset.extTrust, !!panel.querySelector(".ext-powers"), !!panel.querySelector("[data-ext-trust-kept]"), panel.querySelector("[data-ext-updated]")?.textContent],
   ["kept", false, true, "codice aggiornato 0.1.0 → 0.2.0"], "an update keeping permissions, capabilities and source: no new question, «codice aggiornato»");
panel = codePanel({ trust_needed: true, update: "new_version", trust_changes: ["permissions"],
  trust_question: { code: "trust_changed", en: "x", it: "il codice chiede di nuovo: dall'ultima fiducia sono cambiati permissions" } });
ok(panel.dataset.extTrust === "asked" && /chiede di nuovo/.test(panel.textContent) && panel.querySelector(".ext-powers"), "a permission more: asked again, and why");
ok(panel.textContent.includes("ext.unverifiedDisk"), "the code's panel says NOT VERIFIED, from disk, always");

let box = W.extensionsContent(document, host, fakeState, () => {});
ok(!box.querySelector("[data-ext-dev]"), "no development section without the switch (the host gives none)");
box = W.extensionsContent(document, { ...host, dev: () => null }, fakeState, () => {});
ok(!box.querySelector("[data-ext-dev]"), "…nor when it says null");
const calls = [];
const devHost = (info, loaded = []) => ({ info, why: null, loaded,
  setDir: async (p) => { calls.push(["set", p]); return null; }, reload: async (id) => { calls.push(["reload", id]); return null; } });
const devInfo = { setting: "/tmp/dev", env: false, exists: true, plugins: [
  { id: "mio", version: "0.1.0", module: "mio", hosts: ["emstudio"], dev_folder: "/tmp/dev/mio", problems: [], warnings: [] },
  { id: "rotto", version: "0.1.0", module: "rotto", hosts: [], dev_folder: "/tmp/dev/rotto", problems: [{ code: "x", en: "broken", it: "rotto davvero" }], warnings: [] }] };
box = W.extensionsContent(document, { ...host, dev: () => devHost(devInfo, [
  { id: "mio", version: "0.1.0", state: "loaded", problems: [], notes: [{ code: "dev_hides_installed", en: "hides", it: "nasconde la 0.0.9 installata" }] },
  { id: "rotto", version: "0.1.0", state: "refused", problems: [{ code: "x", en: "broken", it: "rotto davvero" }] }]) }, fakeState, () => {});
const sec = box.querySelector("[data-ext-dev]");
ok(sec && sec.textContent.includes("ext.devHead") && sec.textContent.includes("ext.devMark"), "the section: «Cartella di sviluppo», «sviluppo, non verificato»");
eq(sec.querySelector("[data-ext-dev-input]").value, "/tmp/dev", "…the folder as set");
eq([...sec.querySelectorAll("[data-ext-dev-id]")].map((r) => [r.dataset.extDevId, r.dataset.extDevState]), [["mio", "loaded"], ["rotto", "refused"]],
   "…its plugins with their state");
ok(sec.textContent.includes("rotto davvero") && sec.textContent.includes("nasconde la 0.0.9"), "…the problems and the notes in Italian");
sec.querySelector('[data-ext-dev-id="mio"] [data-ext="dev-reload"]').onclick();
sec.querySelector('[data-ext="dev-clear"]').onclick();
await new Promise((r) => setTimeout(r, 0));
eq(calls, [["reload", "mio"], ["set", null]], "«Ricarica» and «Togli» reach the host");
box = W.extensionsContent(document, { ...host, dev: () => devHost({ setting: "/nope", env: true, exists: false, plugins: [] }) }, fakeState, () => {});
const sec2 = box.querySelector("[data-ext-dev]");
ok(sec2.querySelector("[data-ext-dev-input]").disabled && !sec2.querySelector('[data-ext="dev-use"]') && sec2.querySelector("[data-ext-dev-missing]"),
   "set by the environment: not changed here; a folder that is not there said");
box = W.extensionsContent(document, { ...host, dev: () => ({ ...devHost(null), why: "bridge vecchio" }) }, fakeState, () => {});
ok(box.querySelector("[data-ext-dev-why]")?.textContent === "bridge vecchio", "why the folder cannot be used here, said");

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), bridge = read("tools/em_bridge.py"), emPy = read("tools/em_py.py");
const i18n = read("frontend/src/i18n.ts"), menuUi = read("frontend/src/menu-ui.ts");
{ // 84 or later, the same in the three (MICRO-PL22 raised it to 85 without touching what this checks)
  const lv = [Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(main)?.[1]), Number(/^BRIDGE_LEVEL = (\d+)/m.exec(bridge)?.[1]), Number(/^LEVEL = (\d+)/m.exec(emPy)?.[1])];
  ok(lv[0] >= 84 && lv.every((x) => x === lv[0]), "level 84 or later, the same in the page, the bridge, em_py");
}
ok(/"\/py\/plugins\/dev", "\/py\/plugins\/reload"/.test(bridge), "the two routes in the table of routes");
ok(/dev: \(\) => devHost\(\)/.test(main), "the section for everyone (MICRO-COR11: out of «Funzioni sperimentali»)");
ok(/\{ dev: true \}/.test(main), "/py/plugins: the development folder counts (MICRO-COR11)");
ok((main.match(/badgeOf\(/g) ?? []).length >= 3, "the mark in the run rows, Tools ▸ Plugins and the context menus");
ok(/row\.badge \? `\$\{row\.text\} \(\$\{row\.badge\}\)`/.test(menuUi) && /dd-badge plg-badge/.test(menuUi), "…in the page's menus and in the system's (words)");
const keys = [...new Set([...read("frontend/src/extensions-window.ts").matchAll(/t\(`?"?(ext\.dev[A-Za-z]*|ext\.trustKept)/g)].map((m) => m[1]))]
  .filter((k) => k !== "ext.devState").concat(["plg.badgeDisk", "plg.badgeDev", "plg.dev", "ext.devState.loaded", "ext.devState.refused", "ext.devOldBridge"]);
ok(keys.length >= 15, "the keys of this MICRO");
for (const k of keys) eq((i18n.match(new RegExp(`"${k.replace(/\./g, "\\.")}":`, "g")) ?? []).length, 2, `${k}: EN + IT`);

// ── a real bridge ───────────────────────────────────────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
if (!fs.existsSync(py)) {
  console.log(`check-trust: ${checks} checks passed (no s3Dgraphy venv at ${py}: the live part skipped)`);
  process.exit(0);
}
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "trust-check-")));
const TOKEN = "check-trust-secret-0123456789abcdef";
const machine = { S3DGRAPHY_CONSOLE_DIR: path.join(dir, "console"), S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"),
  S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"), S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"),
  S3DGRAPHY_PLUGINS_DATA_DIR: path.join(dir, "plugins-data"),
  EM_VOCABULARIES_DIR: path.join(dir, "vocab"), EM_BRIDGE_STATE_DIR: path.join(dir, "state"), EM_PY_ANSWER_S: "10" };
const env = { ...process.env, ...machine, EM_BRIDGE_TOKEN: TOKEN };
delete env.S3DGRAPHY_PLUGINS_DEV_DIR;

const plugin = (where, id, module, { version = "0.1.0", perms = 'files = "Legge il file che gli si dà"', word = "segnato" } = {}) => {
  const f = path.join(where, `${id}-${version}`);
  fs.mkdirSync(path.join(f, module), { recursive: true });
  fs.writeFileSync(path.join(f, "LICENSE"), "EUPL-1.2 (check)\n");
  fs.writeFileSync(path.join(f, module, "__init__.py"), `
from s3dgraphy import em

def mark(slots):
    with em.write("Segnato in sviluppo") as tx:
        tx.update(slots["unit"], "description", "${word}")

def setup(ctx):
    ctx.command("mark", mark)

plugin = type("Plugin", (), {"setup": staticmethod(setup)})
`);
  fs.writeFileSync(path.join(f, "em-extension.toml"), `schema_version = "1.0.0"
id = "${id}"
version = "${version}"
name = "Plugin del controllo (PROVA)"
tagline = "A plugin of check-trust"
maintainer = "check-trust"
license = ["SPDX:EUPL-1.2"]
em_api_min = "1.0"
type = "plugin"

[code]
entry = "${module}:plugin"
hosts = ["emstudio"]
  [code.permissions]
  ${perms}
  [code.descriptor]
  host = "emstudio-side"
  transport = ["direct"]
  capabilities = ["read-graph", "write-graph"]
  provenance = "derivation"
  [[code.commands]]
  id = "mark"
  label = { it = "Segna", en = "Mark" }
  slots = [{ name = "unit", kind = "id" }]
  in = ["menu.tools@1"]
`);
  return f;
};

const port = await freePort();
const child = spawn(py, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(port), "--s3dgraphy", path.join(S3D, "src")],
  { env, stdio: ["ignore", "ignore", "pipe"] });
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
  eq((await post("/py/plugins/dev", { dir: dir, dev: true }, false)).status, 401, "/py/plugins/dev is behind the secret");
  let r = await post("/py/plugins/dev", { dir: dir, lang: "it" });
  ok(r.status === 403 && /Funzioni sperimentali/.test(r.j.error), "without the switch: refused, said in Italian");
  r = await post("/py/plugins/dev", { dir: path.join(dir, "nowhere"), dev: true, lang: "it" });
  ok(r.status === 400 && /non è una cartella/.test(r.j.error) && r.j.code === "dev_dir_missing", "not a folder: refused, said");
  r = await post("/py/plugins", { lang: "it", dev: true });
  ok(r.j.dev_supported === true && r.j.dev && r.j.dev.setting === null && r.j.plugins.length === 0, "the switch on, no folder: nothing, said");

  const devRoot = path.join(dir, "sviluppo");
  fs.mkdirSync(devRoot);
  const mine = plugin(devRoot, "mio-plugin", "mio_plugin_mod");
  r = await post("/py/plugins/dev", { dir: devRoot, dev: true, lang: "it" });
  eq(r.status, 200, "the folder set");
  ok(fs.existsSync(path.join(machine.S3DGRAPHY_PLUGINS_DIR, "dev.json")), "…in this machine's setting (plugins/dev.json)");
  eq(r.j.dev.plugins.map((p) => [p.id, p.dev_folder]), [["mio-plugin", mine]], "…its plugin listed, where it is");
  const p0 = r.j.plugins.find((p) => p.id === "mio-plugin");
  eq([p0?.state, p0?.source, p0?.dev, p0?.verified], ["loaded", "dev", true, false], "loaded where it is: source dev, not verified");
  eq((await (await fetch(`${B}/extensions/installed`)).json()).extensions, [], "…never installed (the register is empty)");

  r = await post("/py/plugins", { dev: false });
  ok(!r.j.plugins.some((p) => p.id === "mio-plugin") && !r.j.dev, "the switch off: unloaded, no folder said");
  r = await post("/py/plugins", { dev: true, lang: "it" });
  ok(r.j.plugins.some((p) => p.id === "mio-plugin" && p.state === "loaded"), "on again: back");

  // a command of it: one step, the DTC says development, not verified
  const st = new M.DocumentStore({ header: { format: "em.json", schema_version: 2, version: "1.0" },
    graph: { graph_id: "pl18", nodes: [{ id: "us1", node_type: "US", name: "US1", description: "" }], edges: [] } });
  const page = {
    base: async () => B, token: async () => TOKEN, doc: () => JSON.parse(st.toJSON()), revision: () => st.rev,
    author: () => "0000-0002-1825-0097", lang: () => "it", declared: () => [], selection: () => ["us1"],
    applyStep: (step) => { M.applyDelta(st, step.delta, { renameCopies: true }); return st.rev; },
    log: () => {}, t: (k, v) => `${k}${v ? JSON.stringify(v) : ""}`,
    host: { select() {}, view: () => true, notify() {}, command: () => true, camera: () => null, setCamera() {}, frame() {}, pick: async () => null },
  };
  const s = new M.PySession(page);
  await s.open();
  let out = await s.invoke("mio-plugin", "mark", { unit: "us1" });
  eq([out.status, out.steps.length, st.node("us1")?.description], ["done", 1, "segnato"], "its command: one step, written");
  const pp = st.doc.graph.nodes.find((n) => n.node_type === "dtc_process")?.data?.parameters ?? {};
  eq([pp.plugin, pp.source, pp.verified], ["mio-plugin", "dev", false], "the act's DTC: from the development folder, not verified");

  // the files changed, «Ricarica»: the new code runs
  const init = path.join(mine, "mio_plugin_mod", "__init__.py");
  fs.writeFileSync(init, fs.readFileSync(init, "utf8").replace('"segnato"', '"ricaricato"'));
  r = await post("/py/plugins/reload", { plugin: "mio-plugin", dev: true, lang: "it" });
  eq([r.status, r.j.reloaded], [200, "mio-plugin"], "«Ricarica»");
  out = await s.invoke("mio-plugin", "mark", { unit: "us1" });
  eq([out.status, st.node("us1")?.description], ["done", "ricaricato"], "…the code read again runs");
  await s.close();

  // an installed plugin is not reloaded; the trust question of its updates
  const srcDir = path.join(dir, "src");
  fs.mkdirSync(srcDir);
  const v1 = plugin(srcDir, "inst-plugin", "inst_plugin_mod");
  eq((await post("/extensions/install", { path: v1, trust: true })).status, 200, "a plugin installed with the trust answer");
  await post("/py/plugins", { dev: true });
  r = await post("/py/plugins/reload", { plugin: "inst-plugin", dev: true, lang: "it" });
  ok(r.status === 404 && /cartella di sviluppo/.test(r.j.error), "an installed plugin is not «reloaded»: an update changes it");
  const v2 = plugin(srcDir, "inst-plugin", "inst_plugin_mod", { version: "0.2.0", perms: 'files = "Legge il file che gli si dà, e basta"' });
  const pv2 = (await post("/extensions/preview", { path: v2 })).j.preview;
  eq([pv2.code.trust_needed, pv2.code.update, pv2.code.updated?.code], [false, "new_version", "code_updated"], "an update, same permission names: no question");
  let cp = W.confirmBody(document, host, pv2).querySelector('[data-ext-panel="code"]');
  ok(cp.dataset.extTrust === "kept" && /0\.1\.0 → 0\.2\.0/.test(cp.textContent) && !cp.querySelector(".ext-powers"), "…the window says «codice aggiornato», no question");
  const v3 = plugin(srcDir, "inst-plugin", "inst_plugin_mod", { version: "0.3.0", perms: 'files = "Legge"\n  network = "Scarica i punti dal server del progetto"' });
  const pv3 = (await post("/extensions/preview", { path: v3 })).j.preview;
  eq([pv3.code.trust_needed, pv3.code.trust_changes], [true, ["permissions"]], "a permission more: asked again, «permissions»");
  cp = W.confirmBody(document, host, pv3).querySelector('[data-ext-panel="code"]');
  ok(cp.dataset.extTrust === "asked" && cp.querySelector('[data-ext-perm="network"]') && cp.querySelector(".ext-powers"), "…the window asks, the new permission with its reason");
  r = await post("/py/plugins/dev", { dir: null, dev: true });
  ok(r.status === 200 && !r.j.dev.setting && !fs.existsSync(path.join(machine.S3DGRAPHY_PLUGINS_DIR, "dev.json")), "the folder cleared");
} catch (e) {
  console.error(err.slice(-3000));
  throw e;
} finally {
  child.kill();
}
console.log(`check-trust: ${checks} checks passed`);
