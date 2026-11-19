// MICRO-PL15-BRIDGE-PYTHON (W12) · executable check of the bridge's Python
// session and of the page's side of it:
//   · the SECRET: the desktop shell makes it (main.rs `new_token`, `bridge_token`,
//     EM_BRIDGE_TOKEN into the sidecar's environment); the bridge takes it out
//     of its environment, with the LLM key; /py/* refuse a request without it
//     (401) and are CLOSED on a bridge started without one (503); a foreign
//     Origin is refused before the secret is even read (403); the routes of
//     before answer as they did;
//   · the TABLE of routes (POST_ROUTES) consulted before the chains of `if`;
//   · the session on a real bridge (tools/em_py.py over s3Dgraphy's em), driven
//     by the page's own module (src/py-session.ts) on a real DocumentStore:
//     a write = ONE undo step with its DTC process and the code that ran, the
//     Log line, the revision acknowledged; an edit in the page → stale → the
//     em.json again; em.app's requests (notify, select, a command, the camera,
//     pick through /py/resume); a listener of selection-changed; a refusal of
//     the seam in EN and IT, nothing applied; a proof (dry run); code over 4 kB
//     kept by its sha256 and a pointer; completion; busy; the levels 81.
//
//   node scripts/check-py-bridge.mjs
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
  stdin: { contents: `export { DocumentStore } from "./model"; export { applyDelta } from "./property-source"; export * from "./py-session";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent", loader: { ".json": "json" } });
const M = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));

// ── pure pieces ─────────────────────────────────────────────────────────────
eq(M.wordsOf({ error: "e", messages: { en: "E", it: "I" } }, "it"), "I", "wordsOf: the page's language");
eq(M.wordsOf({ error: "e", messages: { en: "E" } }, "it"), "E", "…else English");
eq(M.wordsOf({ error: "e" }, "it"), "e", "…else the error");
eq(await M.pyToken(async () => "shell"), "shell", "pyToken: the shell's secret first");
globalThis.EM_BRIDGE_TOKEN = "dev";
eq(await M.pyToken(async () => null), "dev", "…else the dev stack's (window.EM_BRIDGE_TOKEN)");
delete globalThis.EM_BRIDGE_TOKEN;
eq(await M.pyToken(async () => { throw new Error("no shell"); }), null, "…else none: no Python here");
eq(M.PY_LEVEL, 81, "the page's level for /py/*");

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), bridge = read("tools/em_bridge.py"), emPy = read("tools/em_py.py");
const rs = read("apps/desktop/src-tauri/src/main.rs"), cargo = read("apps/desktop/src-tauri/Cargo.toml");
const tauri = read("frontend/src/tauri.ts"), i18n = read("frontend/src/i18n.ts"), llm = read("tools/llm_provider.py");
const wanted = Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(main)?.[1]);
const level = Number(/^BRIDGE_LEVEL = (\d+)/m.exec(bridge)?.[1]);
{ const lv = [wanted, level, Number(/^LEVEL = (\d+)/m.exec(emPy)?.[1])];
  ok(lv.every((x) => x === lv[0]) && lv[0] >= 82, `one level ≥ 82 in main.ts, the bridge and em_py (81: /py/*, 82: the console's history and proofs, MICRO-PL16; 83: the plugins, MICRO-PL17): ${lv}`); }
ok(/env\.insert\("EM_BRIDGE_TOKEN"\.to_string\(\), bridge_token_value\(\)/.test(rs), "main.rs: the secret into the sidecar's environment");
ok(/fn bridge_token\(\) -> String/.test(rs) && /\n\s+bridge_token,\n/.test(rs), "main.rs: the command bridge_token, registered");
ok(/getrandom::fill/.test(rs) && /^getrandom = "0\.3"/m.test(cargo), "main.rs: 32 bytes of the OS's randomness");
ok(/#\[cfg\(not\(debug_assertions\)\)\]\s*let given: Option<String> = None;/.test(rs), "a release build always makes its own secret");
ok(/invoke<string>\("bridge_token"\)/.test(tauri), "tauri.ts asks the shell for it");
ok(/entry = POST_ROUTES\.get\(route\)[\s\S]{0,200}if route == "\/graphml"/.test(bridge), "the table of routes before the chains of if");
ok(/If-Range, Authorization"/.test(bridge), "CORS lets the Authorization header through");
ok(/em_py\.take_token\(\)/.test(bridge) && /llm_provider\.take_env_key\(\)/.test(bridge), "the secrets taken out of the environment at start");
ok(/def take_env_key/.test(llm) && /return _SESSION_KEY or _env_key\(\)/.test(llm), "llm_provider keeps the key in memory");
for (const k of ["py.noToken", "py.stale", "py.busy", "py.step", "py.stepProposal", "py.partial", "py.noView", "py.noSpace", "py.noCommand", "py.pickNone"])
  eq((i18n.match(new RegExp(`"${k.replace(".", "\\.")}":`, "g")) ?? []).length, 2, `${k}: EN and IT`);
ok(/if \(EXPERIMENTAL\)\s*\(window as unknown as \{ __EM_PY__/.test(main), "the hook only behind «Funzioni sperimentali»");
ok(/pyNudge\("selection-changed"\)/.test(main) && /onLocaleChange\(\(\) => pyNudge\("locale-changed"\)\)/.test(main), "the page's events reach the listeners");

// ── a real bridge ───────────────────────────────────────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const py = path.join(S3D, ".venv/bin/python");
if (!fs.existsSync(py)) {
  console.log(`check-py-bridge: ${checks} checks passed (no s3Dgraphy venv at ${py}: the live part skipped)`);
  process.exit(0);
}
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "py-bridge-"));
const TOKEN = "check-py-bridge-secret-0123456789";
const machine = { S3DGRAPHY_CONSOLE_DIR: path.join(dir, "console"), S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"),
  S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"), S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"),
  EM_VOCABULARIES_DIR: path.join(dir, "vocab"), EM_BRIDGE_STATE_DIR: path.join(dir, "state"), EM_PY_ANSWER_S: "10" };
const start = async (env) => {
  const port = await freePort();
  const child = spawn(py, [path.join(ROOT, "tools/em_bridge.py"), "--port", String(port), "--s3dgraphy", path.join(S3D, "src")],
    { env: { ...process.env, ...machine, ...env }, stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  child.stderr.on("data", (d) => { err += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try { const r = await fetch(`${base}/health`); if (r.ok) return { child, base, err: () => err }; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error(`the bridge did not start: ${err}`);
};
const post = async (base, route, body, headers = {}) => {
  const r = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
const docOf = () => ({ header: { format: "em.json", schema_version: 2, version: "1.0" },
  graph: { graph_id: "pl15", nodes: [
    { id: "us1", node_type: "US", name: "US1", description: "" },
    { id: "us2", node_type: "US", name: "US2", description: "" },
    { id: "us3", node_type: "US", name: "US3", description: "" }], edges: [] } });

// a bridge with NO secret: the Python routes closed, the rest as before
const closed = await start({ EM_BRIDGE_TOKEN: "" });
try {
  const h = await (await fetch(`${closed.base}/health`)).json();
  eq([h.bridge_level >= 82, h.py], [true, { secret: false }], "no secret: /health says so");
  const r = await post(closed.base, "/py/session", { doc: docOf() }, { Authorization: "Bearer anything" });
  eq([r.status, r.j.code], [503, "no_secret"], "no secret: /py/* closed (503), whatever is sent");
  ok(/EM_BRIDGE_TOKEN/.test(r.j.messages.it) && /segreto/.test(r.j.messages.it), "…said in Italian too");
  ok(/CLOSED — no secret/.test(closed.err()), "…and at start, in the bridge's log");
} finally { closed.child.kill(); }

const live = await start({ EM_BRIDGE_TOKEN: TOKEN, ANTHROPIC_API_KEY: "sk-check-not-a-key" });
try {
  const B = live.base;
  const h = await (await fetch(`${B}/health`)).json();
  eq(h.py, { secret: true }, "with the secret: /health says the routes are open");
  eq((await post(B, "/py/session", { doc: docOf() })).status, 401, "no Authorization: 401");
  eq((await post(B, "/py/session", { doc: docOf() }, { Authorization: "Bearer wrong" })).status, 401, "a wrong secret: 401");
  eq((await post(B, "/py/session", { doc: docOf() }, { Authorization: `Bearer ${TOKEN}`, Origin: "https://evil.example" })).status, 403,
     "a foreign Origin: 403 before the secret is read");
  const pre = await fetch(`${B}/py/run`, { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Headers": "authorization, content-type" } });
  ok(/Authorization/.test(pre.headers.get("access-control-allow-headers") ?? ""), "the preflight allows Authorization");
  const old = await post(B, "/chronology", { doc: docOf() });
  ok(old.status !== 401 && old.status !== 503, "a route of before answers without the secret, as it did");

  // the page's module on a real DocumentStore
  const st = new M.DocumentStore(docOf());
  const logs = [];
  const asked = [];
  let selection = ["us3"];
  const page = {
    base: async () => B,
    token: async () => TOKEN,
    doc: () => JSON.parse(st.toJSON()),
    revision: () => st.rev,
    author: () => "0000-0002-1825-0097",
    lang: () => "it",
    declared: () => [],
    selection: () => selection,
    applyStep: (step) => { M.applyDelta(st, step.delta, { renameCopies: true }); return st.rev; },
    log: (level, message, ids) => logs.push({ level, message, ids }),
    t: (k, v) => `${k}${v ? JSON.stringify(v) : ""}`,
    host: {
      select: (ids) => { asked.push(["select", ids]); selection = ids; },
      view: (name) => { asked.push(["view", name]); return name === "graph"; },
      notify: (m, l) => asked.push(["notify", m, l]),
      command: (id) => { asked.push(["command", id]); return id === "file-save" ? true : false; },
      camera: () => ({ position: [1, 2, 3], target: [0, 0, 0] }),
      setCamera: (c) => asked.push(["set_camera", c]),
      frame: (ids) => asked.push(["frame", ids]),
      pick: async (prompt, prim) => { asked.push(["pick", prompt, prim]); return [0.5, 1.5, 2.5]; },
    },
  };
  const s = new M.PySession(page);
  const opened = await s.open();
  eq([opened.ok, opened.host, opened.em_api, opened.caller.name, opened.revision], [true, "emstudio", "1.2.0", "emstudio.console", st.rev],
     "a session on the page's document and revision");

  // the environment: the secrets gone from it
  let out = await s.run("import os\nsorted(k for k in ('EM_BRIDGE_TOKEN', 'ANTHROPIC_API_KEY') if k in os.environ)");
  eq([out.status, out.value], ["done", "[]"], "the script does not find the secret nor the LLM key in os.environ");
  out = await s.run("print('ciao')\nlen(list(g.nodes())), sel");
  eq(out.output, "ciao\n", "the script's output");
  ok(/^\(\d+, \['us3'\]\)$/.test(out.value ?? ""), "the last value; g and sel ready");

  // a write: one step, its DTC with the code, the Log line, the revision acknowledged
  const undoDepth = () => st.undoStack.length;
  const depth0 = undoDepth();
  const code = "with em.write('Collega US1 a US2') as tx:\n    tx.add_edge('us1', 'is_after', 'us2')\nem.app.notify('fatto')\nem.app.select(['us1'])";
  out = await s.run(code);
  eq([out.status, out.steps.length, undoDepth() - depth0], ["done", 1, 1], "one em.write → one step → ONE undo step in the store");
  ok(st.doc.graph.edges.some((e) => e.source === "us1" && e.target === "us2" && e.edge_type === "is_after"), "the edge is in the page's document");
  const dtc = st.doc.graph.nodes.find((n) => n.node_type === "dtc_process");
  eq([dtc?.name, dtc?.data?.parameters?.code, dtc?.data?.software?.[0]?.name, dtc?.data?.created_by],
     ["Collega US1 a US2", code, "emstudio.console", "0000-0002-1825-0097"], "the act's DTC process: label, the code that ran, the console, the author");
  eq(out.steps[0].process?.type, "crmdig:D7", "the process on the step (crmdig:D7)");
  eq(logs.at(-1), { level: "info", message: 'py.step{"label":"Collega US1 a US2"}', ids: ["us1", "us2"] }, "a Log line with the label and the nodes");
  eq(asked.splice(0), [["notify", "fatto", "info"], ["select", ["us1"]]], "em.app: notify and select done in order");
  st.undo();
  ok(!st.doc.graph.edges.some((e) => e.source === "us1" && e.target === "us2") && !st.doc.graph.nodes.some((n) => n.node_type === "dtc_process"),
     "ONE undo takes the edge and its DTC away together");

  // the page changed (the undo): stale → the em.json again, silently
  out = await s.run("g.node('us1').edges()");
  eq(out.status, "done", "after an undo in the page the session realigns (stale → the em.json again)");
  out = await s.run("[e.type for e in g.edges()]");
  eq(out.value, "[]", "…and sees the document as the page has it");

  // waiting requests: pick and the camera through /py/resume, a command
  out = await s.run("p = em.app.space.pick('Clicca il naso', 'point')\nc = em.app.space.camera()\nem.app.commands.run('file-save')\n(p, c['position'])");
  eq([out.status, out.value], ["done", "([0.5, 1.5, 2.5], [1, 2, 3])"], "pick and camera answered through /py/resume");
  eq(asked.splice(0), [["pick", "Clicca il naso", "point"], ["command", "file-save"]], "…a command run by the page");
  out = await s.run("em.app.commands.run('nessuno')");
  eq(out.status, "error", "a command the page does not know: the script is told");
  ok(/nessuno/.test(out.output), "…with its name");
  asked.splice(0);

  // a listener: the page forwards selection-changed only when one waits
  eq(await s.event("selection-changed", { ids: ["us2"] }), null, "no listener: nothing forwarded");
  out = await s.run("@em.on('selection-changed')\ndef f(e):\n    print('selezione', e.get('ids'))");
  eq(s.listeners["selection-changed"], 1, "the session says a listener waits");
  out = await s.event("selection-changed", { ids: ["us2"] });
  eq([out.status, out.output], ["done", "selezione ['us2']\n"], "the event delivered to the listener");

  // a refusal of the seam: EN + IT, nothing applied
  const before = st.toJSON();
  out = await s.run("with em.write('sbagliato') as tx:\n    tx.add_edge('us1', 'has_author', 'us2')");
  eq([out.status, out.steps.length], ["refused", 0], "a connection the EM language refuses: refused, no step");
  ok(/il grafo è intatto/.test(out.error), "…said in the page's language");
  eq(st.toJSON(), before, "…and the page's document untouched");

  // no author: refused (the author is the session's, never an argument)
  const anon = new M.PySession({ ...page, author: () => null });
  await anon.open();
  out = await anon.run("with em.write('anonimo') as tx:\n    tx.add_edge('us2', 'is_after', 'us3')");
  eq([out.status, out.steps.length], ["refused", 0], "no author in the session: the write refused");
  await anon.close();

  // a proof: nothing applied
  const revP = st.rev;
  out = await s.run("with em.write('prova') as tx:\n    tx.update('us1', 'description', 'x')\ntx.result.dry_run", { dryRun: true });
  eq([out.status, out.value, out.steps.length, st.rev], ["done", "True", 0, revP], "«prova»: the delta shown, nothing applied");

  // over 4 kB: the sha256 and a pointer, the copy on this machine
  const big = `# ${"a".repeat(5000)}\nwith em.write('lungo') as tx:\n    tx.update('us2', 'description', 'lunga')`;
  out = await s.run(big);
  const bigDtc = out.steps[0]?.delta.add_nodes.find((n) => n.node_type === "dtc_process")?.data?.parameters;
  ok(bigDtc && !bigDtc.code && bigDtc.code_bytes > 4096 && /^[0-9a-f]{64}$/.test(bigDtc.code_sha256), "over 4 kB: no code in the node, its sha256 and size");
  ok(fs.existsSync(path.join(dir, "console", "scripts", `${bigDtc.code_sha256}.py`)), "…the copy kept on this machine, where code_ref says");
  eq(st.node("us2")?.description, "lunga", "…and the write applied");

  // completion
  eq(await s.complete("em.wri"), ["em.write("], "completion of em's names");
  eq(await s.complete("g.node('US"), ["US1", "US2", "US3"], "…of the nodes' names inside a string");

  // busy: one script at a time
  const slow = s.run("import time\ntime.sleep(1.2)\n'fine'");
  await new Promise((r) => setTimeout(r, 300));
  const other = await post(B, "/py/run", { session: s.id, revision: st.rev, code: "1" }, { Authorization: `Bearer ${TOKEN}` });
  eq([other.status, other.j.code], [409, "busy"], "a second script while one runs: busy");
  eq((await slow).value, "'fine'", "…the first one ends");

  await s.close();
  eq((await post(B, "/py/run", { session: s.id ?? "x", code: "1" }, { Authorization: `Bearer ${TOKEN}` })).status, 404, "a closed session is gone");
} finally {
  live.child.kill();
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`check-py-bridge: ${checks} checks passed`);
