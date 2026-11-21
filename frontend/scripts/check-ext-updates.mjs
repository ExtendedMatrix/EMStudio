// MICRO-PL23-AGGIORNAMENTI (X3) · executable check of the updates in «Estensioni»:
//   · the pure pieces (src/extensions-state.ts): the declaration rewritten
//     («aggiorna la dichiarazione», the rest kept in its order), the updates
//     that would ask the trust again;
//   · the window (linkedom): «Versioni…» on an installed row — the data versions
//     side by side, the code versions on disk with «Usa questa» / «Rimuovi questa
//     versione» (never on the one in use), «Rimuovi le versioni vecchie del
//     codice», the wheels left out for other platforms; «Aggiorna tutto (n)»;
//     what «Aggiorna tutto» will do, the ones that ask the trust again first;
//     «questo file usa stat 0.1.0, c'è la 0.2.0» with «Che cosa cambia…» for a
//     major and the CHANGELOG; what a repository has only for other machines;
//     «Pulisci…»; the removal's unticked box for the plugin's own state; a bridge
//     before 86: no «Versioni», no «Aggiorna tutto»;
//   · the wiring: level 86 in the page, the bridge and em_py; the routes; the
//     question at the opening of a file; every new word in EN and IT;
//   · the bridge's module (tools/em_extensions.py over s3dgraphy.extensions) on
//     a file:// repository built from em-profiles' examples in /tmp: «Controlla
//     aggiornamenti» with the trust said before, «Aggiorna tutto» (the one that
//     asks again waits, then goes with the person's yes), the data beside, the
//     overlay's `newer` and /profiles/redeclare, the versions side by side, an
//     older code used again (the trust asked again when its permissions differ),
//     one version removed, never the one in use, «Pulisci», the removal with the
//     plugin's own state.
//
//   node scripts/check-ext-updates.mjs
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
const S = await load("extensions-state.ts");
const W = await load("extensions-window.ts");
const words = (k, v) => (v ? `${k}(${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(",")})` : k);
const IRI = "https://w3id.org/extendedmatrix/profile/esempio-statuaria";

// ── the pure pieces ─────────────────────────────────────────────────────────
const other = { iri: "https://example.org/profile/altro", version: "1.0.0" };
eq(S.redeclareProfiles([other, { iri: IRI, version: "0.1.0" }], IRI, "0.2.0"), [other, { iri: IRI, version: "0.2.0" }],
   "«aggiorna la dichiarazione»: the package at the new version, the rest kept in its order");
eq(S.redeclareProfiles([{ iri: IRI, version: "0.1.0" }, { iri: IRI, version: "0.1.0" }], IRI, "0.2.0"), [{ iri: IRI, version: "0.2.0" }],
   "…a twin declared once");
eq(S.redeclareProfiles(null, IRI, "0.2.0"), [{ iri: IRI, version: "0.2.0" }], "…a file that declared nothing");
eq(S.updatesNeedingTrust([{ id: "a", trust_needed: false }, { id: "b", trust_needed: true }, { id: "c" }]).map((u) => u.id), ["b"],
   "the updates «Aggiorna tutto» leaves waiting: those that ask the trust again");

// ── the window ──────────────────────────────────────────────────────────────
const prob = (code, it) => ({ code, level: "warning", en: `${code} (en)`, it });
const host = { t: words, lang: () => "it", toast: () => {}, log: () => {}, dialog: async () => ({ ok: false }),
  pickArchive: async () => null, canPickFolder: () => false, fileName: () => "testa.em.json", openVocabularies: () => {}, afterChange: () => {},
  redeclare: async () => null };
const st = {
  rows: [{ id: "esempio-statuaria", kind: "mixed", version: "0.2.0", source: "disk", registered: true,
    data: { status: "installed", versions: ["0.1.0", "0.2.0"], name: "esempio-statuaria", iri: IRI },
    code: { status: "installed", version: "0.3.0", versions: ["0.1.0", "0.2.0", "0.3.0"], active: true, active_version: "0.3.0", permissions: {} } }],
  unavailable: false, error: null, platform: "linux-x64", dirs: { extensions: "/x/extensions", profiles: "/x/profiles", plugins: "/x/plugins" },
  overlay: null, missing: [],
  newer: [{ iri: IRI, name: "esempio-statuaria", declared: "0.1.0", newest: "0.2.0", change: "major", ask_content: true,
            problem: prob("document_newer_major", "questo file usa esempio-statuaria 0.1.0, c'è la 0.2.0 e cambia il contenuto"),
            changelog: { file: "CHANGELOG.md", sections: ["0.2.0"], text: "## 0.2.0\n\n- nuovi punti del volto", truncated: false } }],
  repos: [{ name: "nas", url: "file:///Volumes/NAS/estensioni/index.json", enabled: true, check_on_startup: false, has_token: false, local: true,
            synced_at: "2026-11-19T08:00:00Z", entries: 4, error: null }],
  online: { on: false, setting: false, env: null }, officialUrl: "", available: [], blocked: [],
  updates: [{ id: "esempio-statuaria", repo: "nas", installed: "0.2.0", version: "0.2.1" }, { id: "facemesh_fit", repo: "nas", installed: "0.3.0", version: "0.3.1" }],
  otherPlatforms: [{ repo: "nas", id: "rti-viewer", platforms: ["windows-x64"], platform: "linux-x64",
                     problem: prob("repo_other_platforms", "nas ha rti-viewer solo per windows-x64, non per questa macchina (linux-x64)") }],
  syncProblems: {},
  versions: { "esempio-statuaria": { id: "esempio-statuaria", code_version: "0.3.0", can_go_back: true,
    data: [{ version: "0.2.0", path: "profiles/esempio-statuaria/0.2.0", newest: true }, { version: "0.1.0", path: "profiles/esempio-statuaria/0.1.0", newest: false }],
    code: [{ version: "0.3.0", source: "disk", path: "plugins/disk/esempio-statuaria/0.3.0", active: true, registered: true, platform: "linux-x64",
             wheels_skipped: ["numpy-2.1.0-cp311-cp311-win_amd64.whl", "numpy-2.1.0-cp311-cp311-macosx_11_0_arm64.whl"] },
           { version: "0.2.0", source: "disk", path: "plugins/disk/esempio-statuaria/0.2.0", active: false, registered: false },
           { version: "0.1.0", source: "nas", path: "plugins/nas/esempio-statuaria/0.1.0", active: false, registered: false }] } },
  loadVersions: async () => {},
};
let repaints = 0;
let box = W.extensionsContent(document, host, st, () => { repaints++; });
const row = box.querySelector('.ext-list [data-ext-id="esempio-statuaria"]');
const vb = row.querySelector("[data-ext='versions']");
ok(vb && vb.textContent === "ext.versionsShow" && vb.getAttribute("aria-expanded") === "false", "«Versioni…» on an installed row, closed");
ok(!row.querySelector("[data-ext-versions]"), "…nothing shown until opened");
vb.onclick();
ok(W.versionsOpen("esempio-statuaria") && repaints > 0, "opened: the versions asked, the window repainted");
box = W.extensionsContent(document, host, st, () => {});
const vers = box.querySelector('[data-ext-versions="esempio-statuaria"]');
ok(vers, "the versions side by side");
eq([...vers.querySelectorAll("[data-ext-version]")].map((e) => e.dataset.extVersion),
   ["data/0.2.0", "data/0.1.0", "code/disk/0.3.0", "code/disk/0.2.0", "code/nas/0.1.0"], "data, then code under every source, newest first");
ok(vers.textContent.includes("ext.versionsDataHint"), "…each file keeps the data version it declares");
const inUse = vers.querySelector('[data-ext-version="code/disk/0.3.0"]');
ok(inUse.dataset.extVersionActive === "1" && inUse.textContent.includes("ext.versionInUse"), "the code in use, said");
ok(!inUse.querySelector("[data-ext='version-use']") && !inUse.querySelector("[data-ext='version-remove-code']"), "…neither «Usa questa» nor «Rimuovi» on it");
ok(inUse.textContent.includes("ext.wheelsOther(n=2,p=linux-x64)"), "…the wheels left out for other platforms, said");
const old = vers.querySelector('[data-ext-version="code/nas/0.1.0"]');
ok(old.querySelector("[data-ext='version-use']") && old.querySelector("[data-ext='version-remove-code']") && old.textContent.includes("ext.source.repo(r=nas)"),
   "an older code: «Usa questa», «Rimuovi questa versione», where it came from");
ok(vers.querySelector('[data-ext-version="data/0.1.0"] [data-ext="version-remove-data"]'), "a data version: removable one at a time");
ok(vers.querySelector("[data-ext='prune']"), "«Rimuovi le versioni vecchie del codice»");
// MICRO-SEG08 · «Aggiorna tutto (2)» on the page's status line; what is only for other machines under the list
ok(box.querySelector(".ext-status [data-ext='update-all']")?.textContent === "ext.updateAllN(n=2)", "«Aggiorna tutto (2)»");
ok(box.querySelector('.ext-list [data-ext-other-platform="nas/rti-viewer"]')?.textContent.includes("non per questa macchina"),
   "what a repository has only for other machines: said, not offered");
const nw = box.querySelector("[data-ext-newer]");
ok(nw && nw.querySelector(`[data-ext-newer-iri="${IRI}"]`)?.dataset.extNewerChange === "major", "«questo file usa … c'è la 0.2.0» in the window");
ok(nw.querySelector("[data-ext='newer-what']") && nw.querySelector("[data-ext='redeclare']")?.textContent === "ext.newerRedeclare(v=0.2.0)",
   "…a major: «Che cosa cambia…» and «Aggiorna la dichiarazione alla 0.2.0»");
ok(box.querySelector(".ext-dirs [data-ext='clean']"), "«Pulisci…»");
// no file open: no question about a file
box = W.extensionsContent(document, { ...host, fileName: () => null }, st, () => {});
ok(!box.querySelector("[data-ext-newer]"), "no file open: no declaration to update");
// a bridge before 86: no «Versioni», no «Aggiorna tutto», no «Pulisci»
box = W.extensionsContent(document, { ...host, updatesWhy: () => "old" }, st, () => {});
ok(!box.querySelector("[data-ext='versions']") && !box.querySelector("[data-ext='update-all']") && !box.querySelector("[data-ext='clean']"),
   "a bridge before 86: the updates' buttons absent");
// what «Aggiorna tutto» will do
const ub = W.updateAllBody(document, host, [
  { id: "facemesh_fit", repo: "nas", installed: "0.3.0", version: "0.3.1", trust_needed: true, trust_changes: ["permissions"] },
  { id: "esempio-statuaria", repo: "nas", installed: "0.2.0", version: "0.2.1", trust_needed: false },
  { id: "solo-dati", repo: "nas", installed: "1.0.0", version: "1.1.0", trust_needed: false, code_left_out: true }]);
ok(ub.querySelector('[data-ext-update-trust="facemesh_fit"]')?.textContent === "ext.updateTrustLine(id=facemesh_fit,old=0.3.0,v=0.3.1,r=nas,c=ext.trustChange.permissions)",
   "the one that asks the trust again, first, with what changed");
eq([...ub.querySelectorAll("[data-ext-update-quiet]")].map((e) => e.dataset.extUpdateQuiet), ["esempio-statuaria", "solo-dati"], "…then the others");
ok(ub.textContent.includes("ext.updateLineData(") && ub.textContent.includes("ext.updateAllBeside"), "a code left out stays out; the data install beside");
// the CHANGELOG of a major
const cl = W.changelogBody(document, host, st.newer[0]);
ok(cl.dataset.extChangelog === "0.2.0" && cl.querySelector("pre")?.textContent.includes("nuovi punti del volto"), "«Che cosa cambia…»: the CHANGELOG's new sections");
ok(cl.textContent.includes("ext.newerKeep(v=0.1.0)"), "…and that keeping the old one changes nothing");
const cl2 = W.changelogBody(document, host, { ...st.newer[0], changelog: null });
ok(cl2.dataset.extChangelog === "none" && cl2.textContent.includes("ext.changelogNone"), "…none: said");
// the removal's second box
const plan = { id: "facemesh_fit", code: { versions: ["0.3.0"] }, data: null, vocabularies_only_here: [] };
const rb = W.removalBody(document, host, plan, "all");
ok(rb.body.querySelector("[data-ext-purge-user-data]")?.checked === false && rb.purgeUserData() === false,
   "removing a plugin: the box for its own saved state, unticked");
const rb2 = W.removalBody(document, host, { id: "esempio-statuaria", code: { versions: ["0.3.0"] }, data: { versions: ["0.2.0"], required_by: [], removes_code: true }, vocabularies_only_here: [] }, "code");
ok(!rb2.body.querySelector("[data-ext-purge-user-data]"), "«Rimuovi il codice» of a mixed package: its state stays with its data, no box");

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), bridge = read("tools/em_bridge.py"), emPy = read("tools/em_py.py"), emExt = read("tools/em_extensions.py");
const lv = [Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(main)?.[1]), Number(/^BRIDGE_LEVEL = (\d+)/m.exec(bridge)?.[1]), Number(/^LEVEL = (\d+)/m.exec(emPy)?.[1])];
ok(lv[0] >= 86 && lv.every((x) => x === lv[0]), "level 86 or later, the same in the page, the bridge, em_py");
for (const r of ["/extensions/versions", "/extensions/leftovers", "/extensions/updates", "/extensions/update-all", "/extensions/use",
                 "/extensions/prune", "/extensions/clean", "/profiles/redeclare"])
  ok(emExt.includes(`"${r}"`), `the bridge answers ${r}`);
ok(/"newer": _plain\(newer\)/.test(emExt), "/profiles/overlay answers `newer`");
ok(/EXT_UPDATES_LEVEL = 86/.test(main) && /redeclare: \(n\) => redeclareNow\(n\)/.test(main), "the page: the updates from level 86, the declaration rewritten by the page");
ok(/extNewerSaid/.test(main) && /toastAsk\(msg, answers\)/.test(main), "the question at the opening of a file, once per file and version");
ok(/toastUndoWith\(msg/.test(main.slice(main.indexOf("async function redeclareNow"))), "«aggiorna la dichiarazione» is one step, with «Annulla»");
const i18n = read("frontend/src/i18n.ts");
const itStart = i18n.indexOf("const IT: Dict = {");
const blockStart = i18n.indexOf("// MICRO-PL23 (X3) · updates");
const used = new Set([...i18n.slice(blockStart, i18n.indexOf("\n\n", blockStart) > 0 ? i18n.indexOf("ext.updatesOld", blockStart) + 2000 : blockStart + 6000)
  .matchAll(/^  "(ext\.[\w.]+)": "/gm)].map((m) => m[1]).filter((k) => !k.startsWith("ext.repo")));
for (const m of read("frontend/src/extensions-window.ts").matchAll(/t\("(ext\.(?:version|versions|prune|pruned|wheels|update|updat|newer|changelog|redeclare|clean|userData|activeOther|trustChange)[\w.]*)"/g)) used.add(m[1]);
for (const k of ["ext.redeclared", "ext.redeclareUndone", "ext.updatesOld", "ext.trustChange.permissions", "ext.trustChange.capabilities", "ext.trustChange.source"]) used.add(k);
ok(used.size >= 60, `the new words used (${used.size})`);
for (const k of used) {
  const re = new RegExp(`^  "${k.replace(/\./g, "\\.")}": "`, "m");
  ok(re.test(i18n.slice(0, itStart)) && re.test(i18n.slice(itStart)), `${k} in EN and IT`);
}

// ── the bridge's module over s3dgraphy.extensions ──────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const PROFILES = process.env.EM_PROFILES ?? path.resolve(ROOT, "../em-profiles");
const py = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(py) && fs.existsSync(path.join(PROFILES, "examples/facemesh_fit"))) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pl23-updates-"));
  const code = `
import json, sys, os, re, shutil
sys.path.insert(0, sys.argv[2])
import em_extensions as X
from s3dgraphy import extensions as E
EX, D = sys.argv[3], sys.argv[1]
IRI = "${IRI}"
repo = os.path.join(D, "nas"); os.makedirs(repo)
def sub(path, pat, rep):
    t = open(path, encoding="utf-8").read(); t2 = re.sub(pat, rep, t, count=1, flags=re.M); assert t2 != t, (path, pat)
    open(path, "w", encoding="utf-8").write(t2)
for n in ("esempio-statuaria", "facemesh_fit"):
    assert E.build(os.path.join(EX, n), output_dir=repo)["ok"]
E.server_generate(repo)
X.post("/extensions/repos/add", {"url": repo, "name": "nas"}); X.post("/extensions/repos/sync", {})
s, r = X.post("/extensions/repos/install", {"repo": "nas", "id": "facemesh_fit", "trust": True, "trust_requires": True})
out = {"installed": [s, r["result"]["installed"]["code"]["version"]]}
fm_v = r["result"]["installed"]["code"]["version"]
s, r = X.post("/extensions/updates", {})
out["none"] = [s, r["check"]["updates"]]
# newer ones: the data of esempio-statuaria (a patch), facemesh_fit with one permission more
sep = os.path.join(D, "src", "esempio-statuaria"); shutil.copytree(os.path.join(EX, "esempio-statuaria"), sep)
sub(os.path.join(sep, "em-extension.toml"), r'^version = "0\\.1\\.0"', 'version = "0.1.1"')
sub(os.path.join(sep, "profile.json"), r'"version": "0\\.1\\.0"', '"version": "0.1.1"')
for f in os.listdir(os.path.join(sep, "examples")):
    p = os.path.join(sep, "examples", f); doc = json.load(open(p, encoding="utf-8"))
    for e in doc.get("header", {}).get("profiles") or []:
        if e.get("iri") == IRI: e["version"] = "0.1.1"
    json.dump(doc, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
fm = os.path.join(D, "src", "facemesh_fit"); shutil.copytree(os.path.join(EX, "facemesh_fit"), fm)
sub(os.path.join(fm, "em-extension.toml"), r'^version = "[^"]+"', 'version = "0.9.1"')
sub(os.path.join(fm, "em-extension.toml"), r'^(  files = .*)$', r'\\1\\n  network = "Scarica il modello di riferimento dal suo archivio"')
for src in (sep, fm):
    res = E.build(src, output_dir=repo); assert res["ok"], res["errors"]
E.server_generate(repo)
s, r = X.post("/extensions/updates", {"read": True})
out["check"] = [s, sorted((u["id"], u["installed"], u["version"], u["trust_needed"], u.get("trust_changes")) for u in r["check"]["updates"])]
s, r = X.post("/extensions/update-all", {"trust": []})
res = r["result"]
out["all1"] = [s, [(u["id"], u["from"], u["to"]) for u in res["updated"]], [n["id"] for n in res["needs_trust"]],
               res["needs_trust"][0]["problem"]["it"], res["failed"]]
s, r = X.get("/extensions/installed", {})
by = {x["id"]: x for x in r["extensions"]}
out["after1"] = [by["esempio-statuaria"]["data"]["versions"], by["facemesh_fit"]["code"]["version"]]
# the file's question, and its answer
s, r = X.post("/profiles/overlay", {"declared": [{"iri": IRI, "version": "0.1.0"}], "lang": "it"})
out["newer"] = [s, [(n["name"], n["declared"], n["newest"], n["change"], n["ask_content"]) for n in r["newer"]], r["newer"][0]["problem"]["it"]]
s, r = X.post("/profiles/redeclare", {"declared": [{"iri": IRI, "version": "0.1.0"}], "ref": IRI, "version": "0.1.1"})
out["redeclare"] = [s, r["declared"]]
s, r = X.post("/profiles/redeclare", {"declared": [], "ref": IRI, "version": "7.0.0"})
out["redeclare_absent"] = [s, r["problems"][0]["code"]]
s, r = X.post("/profiles/overlay", {"declared": [{"iri": IRI, "version": "0.1.1"}], "lang": "it"})
out["newer_after"] = r["newer"]
# «Aggiorna tutto» with the person's yes
s, r = X.post("/extensions/update-all", {"trust": ["facemesh_fit"]})
out["all2"] = [s, [u["id"] for u in r["result"]["updated"]], r["result"]["needs_trust"]]
# the versions side by side, going back
s, r = X.get("/extensions/versions", {"id": ["facemesh_fit"]})
out["versions"] = [s, [(c["version"], c["source"], c["active"]) for c in r["versions"]["code"]], r["versions"]["can_go_back"]]
s, r = X.post("/extensions/use", {"id": "facemesh_fit", "version": fm_v})
out["use_refused"] = [s, [p["code"] for p in r["problems"]]]
s, r = X.post("/extensions/use", {"id": "facemesh_fit", "version": fm_v, "trust": True})
out["use"] = [s, r["used"]["version"], r["used"]["previous"], r["used"]["restart"], r["used"]["warnings"][0]["it"]]
s, r = X.post("/extensions/remove", {"id": "facemesh_fit", "part": "code", "version": fm_v})
out["remove_active"] = [s, r["problems"][0]["code"]]
s, r = X.post("/extensions/remove", {"id": "facemesh_fit", "part": "code", "version": "0.9.1"})
out["remove_old"] = [s, r["removed"]["code_removed"]]
# what nothing owns
os.makedirs(os.path.join(D, "plugins", "disk", "ghost", "1.0.0"))
open(os.path.join(D, "plugins", "disk", "ghost", "1.0.0", ".install.json"), "w").write("{}")
s, r = X.get("/extensions/leftovers", {})
out["leftovers"] = [s, r["leftovers"]["count"], [x["path"] for x in r["leftovers"]["code"]]]
s, r = X.post("/extensions/clean", {"dry_run": True})
out["clean_dry"] = [s, r["clean"]["removed"], os.path.isdir(os.path.join(D, "plugins", "disk", "ghost"))]
s, r = X.post("/extensions/clean", {})
out["clean"] = [s, r["clean"]["removed"], os.path.isdir(os.path.join(D, "plugins", "disk", "ghost"))]
# the removal: the plugin's own state stays unless asked
st = os.path.join(D, "plugins-data", "facemesh_fit"); os.makedirs(st)
s, r = X.post("/extensions/remove", {"id": "facemesh_fit", "part": "all"})
out["removed"] = [s, r["removed"]["user_data"]["removed"], os.path.isdir(st), sorted(os.listdir(os.path.join(D, "plugins")))]
print(json.dumps(out))`;
  const env = { ...process.env, PYTHONPATH: path.join(S3D, "src"),
    S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"), S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"),
    S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"), S3DGRAPHY_PLUGINS_DATA_DIR: path.join(dir, "plugins-data"),
    EM_VOCABULARIES_DIR: path.join(dir, "vocab") };
  delete env.S3DGRAPHY_ONLINE_ACCESS;
  const out = JSON.parse(execFileSync(py, ["-c", code, dir, path.join(ROOT, "tools"), path.join(PROFILES, "examples")], { env }).toString());
  const fmv = out.installed[1];
  eq(out.installed[0], 200, "facemesh_fit installed from the folder repository, its data first");
  eq(out.none, [200, []], "«Controlla aggiornamenti»: nothing newer");
  eq(out.check, [200, [["esempio-statuaria", "0.1.0", "0.1.1", false, []], ["facemesh_fit", fmv, "0.9.1", true, ["permissions"]]]],
     "…then two: the data without a question, the plugin asking the trust again (a permission more) — said BEFORE «Aggiorna tutto»");
  eq(out.all1.slice(0, 3), [200, [["esempio-statuaria", "0.1.0", "0.1.1"]], ["facemesh_fit"]], "«Aggiorna tutto»: the data updated, the plugin waits");
  ok(/chiede di nuovo la fiducia/.test(out.all1[3]) && out.all1[4].length === 0, "…said in Italian, nothing failed");
  eq(out.after1, [["0.1.0", "0.1.1"], fmv], "the data 0.1.1 beside 0.1.0 (W-4); nothing of the plugin written");
  eq(out.newer.slice(0, 2), [200, [["esempio-statuaria", "0.1.0", "0.1.1", "patch", false]]], "the overlay: «questo file usa 0.1.0, c'è la 0.1.1» — a patch, no CHANGELOG asked");
  eq(out.newer[2], "questo file usa esempio-statuaria 0.1.0, c'è la 0.1.1: aggiornare la dichiarazione?", "…the question, in Italian");
  eq(out.redeclare, [200, [{ iri: IRI, version: "0.1.1" }]], "/profiles/redeclare: the answer «sì»");
  eq(out.redeclare_absent, [422, "ext_not_installed"], "…to a version not here: refused");
  eq(out.newer_after, [], "declared 0.1.1: no question");
  eq(out.all2, [200, ["facemesh_fit"], []], "«Aggiorna tutto, fidandoti anche di queste»: the plugin updated");
  eq(out.versions, [200, [["0.9.1", "nas", true], [fmv, "nas", false]], true], "the code versions side by side, the old one kept: the way back");
  eq(out.use_refused, [422, ["code_trust_required_for"]], "going back to a version trusted with other permissions: the trust asked again");
  eq(out.use.slice(0, 4), [200, fmv, "0.9.1", true], "…with the yes: the old code active again, no download, at the next start");
  ok(/prossimo avvio/.test(out.use[4]), "…said");
  eq(out.remove_active, [422, "code_version_active"], "the version in use is never removed alone");
  eq(out.remove_old, [200, ["nas/0.9.1"]], "an old version removed");
  eq(out.leftovers, [200, 1, ["disk/ghost/1.0.0"]], "what nothing in the register owns");
  eq(out.clean_dry, [200, false, true], "«Pulisci»: said first, nothing removed");
  eq(out.clean, [200, true, false], "…then removed");
  eq(out.removed, [200, false, true, ["enabled.json"]], "the package removed: nothing of it left in the plugins' folder (only the machine's enabled.json), the plugin's own state kept (unticked)");
  fs.rmSync(dir, { recursive: true, force: true });
} else console.log("  (s3Dgraphy .venv or em-profiles not found: the bridge part skipped)");

console.log(`check-ext-updates: ${checks} checks passed`);
