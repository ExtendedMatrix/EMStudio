// MICRO-PL28-FIRMA (X8) · executable check of the signature of a repository
// in «Estensioni»:
//   · the pure piece (src/extensions-window.ts): the keys a person pastes
//     (lines starting with RW; a .pub file's comment skipped; other text sent
//     whole so the library says why it is not a key);
//   · the window (linkedom): a signed repository «firmato · chiave K» and its
//     «Chiavi di firma…» (absent with a bridge before 89); an offer of a
//     signed repository and an installed row «firmato dalla chiave K di R»;
//     the confirmation saying «firmato … — non una revisione del codice» once
//     (the library's sentence not repeated); the plan «Firmato dalla chiave K
//     di R, sopra questo archive_hash»; the dialog «+ Aggiungi repository…»
//     with the key field (absent with an old bridge);
//   · the wiring: level 89 in the page, the bridge and em_py; keys in the
//     bridge's add and update; every new word in EN and IT;
//   · the bridge's module (tools/em_extensions.py over s3dgraphy.extensions)
//     on a file:// repository built from em-profiles' examples in /tmp and
//     signed with a key made there: added with the key, read signed, the
//     preview and the install say the key, the installed row carries it; an
//     index changed without the key refused in Italian, the copy kept; a
//     key that is not one refused; the keys taken away.
//
//   node scripts/check-signing.mjs
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
const W = await load("extensions-window.ts");
const words = (k, v) => (v ? `${k}(${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(",")})` : k);
const prob = (code, it) => ({ code, level: "warning", en: `${code} (en)`, it });
const K = "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";

// ── the pure piece ──────────────────────────────────────────────────────────
eq(W.keysOf(`untrusted comment: minisign public key E7620F1842B4E81F\n${K}\n`), [K], "a .pub file pasted: its key line");
eq(W.keysOf(` ${K} \n\nRWQother`), [K, "RWQother"], "two keys, one per line");
eq(W.keysOf("not a key"), ["not a key"], "text with no RW line: sent whole (the library says why)");
eq(W.keysOf("  \n "), [], "empty: no keys");

// ── the window ──────────────────────────────────────────────────────────────
const host = { t: words, lang: () => "it", toast: () => {}, log: () => {}, dialog: async () => ({ ok: false }),
  pickArchive: async () => null, canPickFolder: () => false, fileName: () => null, openVocabularies: () => {}, afterChange: () => {} };
const st = {
  rows: [
    { id: "facemesh_fit", kind: "plugin", version: "0.3.0", source: "nas", registered: true, data: { status: "absent" },
      signed: { key_id: "E7620F1842B4E81F", repos: ["nas"] },
      code: { status: "installed", version: "0.3.0", versions: ["0.3.0"], active: true, permissions: {}, verified: false } },
    { id: "altro", kind: "plugin", version: "1.0.0", source: "disk", registered: true, data: { status: "absent" },
      code: { status: "installed", version: "1.0.0", versions: ["1.0.0"], active: true, permissions: {}, verified: false } }],
  unavailable: false, error: null, platform: "linux-x64", dirs: { extensions: "/x/e", profiles: "/x/p", plugins: "/x/pl" },
  overlay: null, missing: [], newer: [],
  repos: [
    { name: "nas", url: "file:///Volumes/NAS/estensioni/index.json", enabled: true, check_on_startup: false, has_token: false, local: true,
      synced_at: "2026-11-19T08:00:00Z", entries: 2, error: null, trust_reviews: false, official: false,
      keys: [{ key_id: "E7620F1842B4E81F", key: K }], signed: true, signed_by: "E7620F1842B4E81F" },
    { name: "plain", url: "file:///tmp/plain/index.json", enabled: true, check_on_startup: false, has_token: false, local: true,
      synced_at: null, entries: null, error: null, trust_reviews: false, official: false, keys: [], signed: false, signed_by: null }],
  online: { on: false, setting: false, env: null }, officialUrl: "https://extendedmatrix.github.io/em-extensions/index.json",
  available: [{ repo: "nas", id: "nuovo", version: "0.1.0", versions: ["0.1.0"], name: "Nuovo", sections: { code: {} }, installed: null,
                update: false, same_source: false, signed: true, signed_by: "E7620F1842B4E81F" },
              { repo: "plain", id: "grezzo", version: "0.1.0", versions: ["0.1.0"], name: "Grezzo", sections: { code: {} }, installed: null,
                update: false, same_source: false, signed: false, signed_by: null }],
  blocked: [], updates: [], otherPlatforms: [], syncProblems: {}, versions: {}, loadVersions: async () => {},
};
let box = W.extensionsContent(document, host, st, () => {});
const nas = box.querySelector('[data-ext-repo="nas"]');
ok(nas.querySelector("[data-ext-repo-signed]")?.textContent === "ext.repoSigned(k=E7620F1842B4E81F)", "a signed repository: «firmato · chiave K»");
ok(nas.querySelector("[data-ext-repo-signed]").dataset.extRepoSigned === "E7620F1842B4E81F", "…its index read signed by that key");
ok(nas.querySelector("[data-ext='repo-keys']")?.textContent === "ext.repoKeysChange", "…«Chiavi di firma…»");
const plain = box.querySelector('[data-ext-repo="plain"]');
ok(!plain.querySelector("[data-ext-repo-signed]") && plain.querySelector("[data-ext='repo-keys']")?.textContent === "ext.repoKeysSet",
   "an unsigned one: no mark, «Chiave di firma…»");
ok(box.querySelector('[data-ext-avail="nas/nuovo"] [data-ext-signed]')?.textContent === "ext.signedBy(k=E7620F1842B4E81F,r=nas)",
   "an offer of a signed repository: «firmato dalla chiave K di nas»");
ok(!box.querySelector('[data-ext-avail="plain/grezzo"] [data-ext-signed]'), "…of an unsigned one: nothing");
ok(box.querySelector('.ext-list [data-ext-id="facemesh_fit"] [data-ext-signed]')?.textContent === "ext.signedBy(k=E7620F1842B4E81F,r=nas)",
   "an installed row that came signed: «firmato dalla chiave K di nas»");
ok(box.querySelector('.ext-list [data-ext-id="facemesh_fit"] [data-ext-signed]').title === "ext.signedHint", "…what a signature says, in its tooltip");
ok(!box.querySelector('.ext-list [data-ext-id="altro"] [data-ext-signed]'), "…one that did not: nothing");
box = W.extensionsContent(document, { ...host, signWhy: () => "old" }, st, () => {});
ok(!box.querySelector("[data-ext='repo-keys']"), "a bridge before 89: no «Chiavi di firma…»");

// the confirmation
const pvBase = { id: "facemesh_fit", ok: true, source: "nas", version: "0.3.0", kind: "plugin", data: { present: false },
  code: { present: true, version: "0.3.0", module: "facemesh_fit", permissions: {}, capabilities: [], trust_needed: true, verified: false } };
let cb = W.confirmBody(document, host, { ...pvBase, signature: { status: "signed", key_id: "E7620F1842B4E81F", repos: ["nas"] },
  warnings: [prob("sign_signed", "firmato dalla chiave … (frase della libreria)")] });
const line = cb.querySelector('[data-ext-signature="signed"]');
ok(line?.textContent === "ext.signedBy(k=E7620F1842B4E81F,r=nas) — ext.signedNotReview", "the confirmation: «firmato … — non una revisione del codice»");
ok(!cb.textContent.includes("frase della libreria"), "…the library's same sentence not said twice");
ok(cb.querySelector('[data-ext-panel="code"]').dataset.extTrust === "asked", "…and the trust question stays");
cb = W.confirmBody(document, host, { ...pvBase, signature: { status: "unknown_key", key_id: "AB", problem: prob("sign_key_unknown_here", "chiave che nessuno nomina") },
  warnings: [prob("sign_key_unknown_here", "chiave che nessuno nomina")] });
ok(!cb.querySelector("[data-ext-signature]") && cb.textContent.includes("chiave che nessuno nomina"), "an unknown key: the library's warning, no mark");
const plan = W.planBody(document, host, { repo: "nas", id: "facemesh_fit", version: "0.3.0", steps: [], unresolved: [], offers: [], cycle: null, tier_c: [], ok: true },
  { name: "nas", archive_hash: "sha256:0123456789abcdef", signed: { key_id: "E7620F1842B4E81F" } });
ok(plan.querySelector("[data-ext-archive-signed]")?.textContent === "ext.repoSignedVerified(r=nas,k=E7620F1842B4E81F)", "the plan: «Firmato dalla chiave K di nas, sopra questo archive_hash»");

// the dialog «+ Aggiungi repository…»
let d = W.addRepoBody(document, host, st.officialUrl);
const kf = d.body.querySelector("[data-ext-repo-key-new]");
ok(kf && d.body.textContent.includes("ext.repoKeyLabel"), "the dialog: the public key field");
eq(d.values().keys, [], "…empty: no keys");
kf.value = `untrusted comment: minisign public key E7620F1842B4E81F\n${K}`;
eq(d.values().keys, [K], "…a .pub pasted: its key");
d = W.addRepoBody(document, { ...host, signWhy: () => "old" }, st.officialUrl);
ok(!d.body.textContent.includes("ext.repoKeyLabel"), "…a bridge before 89: no field");

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), bridge = read("tools/em_bridge.py"), emPy = read("tools/em_py.py"), emExt = read("tools/em_extensions.py");
const lv = [Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(main)?.[1]), Number(/^BRIDGE_LEVEL = (\d+)/m.exec(bridge)?.[1]), Number(/^LEVEL = (\d+)/m.exec(emPy)?.[1])];
ok(lv[0] >= 89 && lv.every((x) => x === lv[0]), "level 89 or later, the same in the page, the bridge, em_py");
ok(/keys=_keys\(body\.get\("keys"\)\)/.test(emExt) && /changes\["keys"\] = _keys\(body\.get\("keys"\)\) or \[\]/.test(emExt), "the bridge's add and update take keys");
ok(/EXT_SIGN_LEVEL = 89/.test(main) && /signWhy: \(\) =>/.test(main), "the page: the keys from level 89");
const i18n = read("frontend/src/i18n.ts");
const itStart = i18n.indexOf("const IT: Dict = {");
const keys = ["ext.signOld", "ext.signedBy", "ext.signedKey", "ext.signedHint", "ext.signedNotReview", "ext.repoSigned", "ext.repoSignedHint",
  "ext.repoSignedVerified", "ext.repoKeysSet", "ext.repoKeysChange", "ext.repoKeysHint", "ext.repoKeyLabel", "ext.repoKeyHint", "ext.repoKeysAsk",
  "ext.repoKeysEmpty", "ext.repoKeysTitle", "ext.repoKeysOk", "ext.repoKeysSaved", "ext.repoKeysCleared"];
for (const k of keys) {
  const re = new RegExp(`^  "${k.replace(/\./g, "\\.")}": "`, "m");
  ok(re.test(i18n.slice(0, itStart)) && re.test(i18n.slice(itStart)), `${k} in EN and IT`);
}

// ── the bridge's module over s3dgraphy.extensions ──────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const PROFILES = process.env.EM_PROFILES ?? path.resolve(ROOT, "../em-profiles");
const py = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(py) && fs.existsSync(path.join(PROFILES, "examples/facemesh_fit"))) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pl28-signing-"));
  const code = `
import json, sys, os
sys.path.insert(0, sys.argv[2])
import em_extensions as X
from s3dgraphy import extensions as E
EX, D = sys.argv[3], sys.argv[1]
repo = os.path.join(D, "nas"); os.makedirs(repo)
for n in ("esempio-statuaria", "facemesh_fit"):
    assert E.build(os.path.join(EX, n), output_dir=repo)["ok"]
k = E.keygen(os.path.join(D, "keys", "nas.key"))
assert E.server_generate(repo, sign_key=os.path.join(D, "keys", "nas.key"))["ok"]
out = {"key_id": k["key_id"]}
s, r = X.post("/extensions/repos/add", {"url": repo, "name": "nas", "keys": [k["public_key"]]})
out["added"] = [s, r["repository"]["signed"], [x["key_id"] for x in r["repository"]["keys"]]]
s, r = X.post("/extensions/repos/sync", {})
out["sync"] = [s, [(x["name"], x["ok"], x["signed_by"]) for x in r["sync"]["repositories"]]]
s, r = X.get("/extensions/repos", {})
out["repos"] = [s, r["repositories"][0]["signed_by"]]
s, r = X.get("/extensions/available", {})
out["avail"] = sorted((a["id"], a["signed"], a["signed_by"]) for a in r["available"])
s, r = X.post("/extensions/repos/preview", {"repo": "nas", "id": "facemesh_fit", "lang": "it"})
pv = r["preview"]
out["pv"] = [s, pv["signature"]["status"], pv["signature"]["repos"], pv["repository"]["signed"]["key_id"], pv["code"]["trust_needed"]]
s, r = X.post("/extensions/repos/install", {"repo": "nas", "id": "facemesh_fit", "trust": True})
out["install"] = [s, r["result"]["installed"]["code"]["status"], r["result"]["installed"]["signed"]]
s, r = X.get("/extensions/installed", {})
out["installed"] = {x["id"]: x.get("signed") for x in r["extensions"]}
# a mirror: the index written again without the key
open(os.path.join(repo, "blocklist.json"), "w").write('{"blocklist": [{"id": "facemesh_fit", "reason": "forged"}]}\\n')
assert E.server_generate(repo)["ok"]
s, r = X.post("/extensions/repos/sync", {})
x = r["sync"]["repositories"][0]
out["forged"] = [s, x["ok"], x["problems"][0]["code"], x["problems"][0]["it"]]
s, r = X.get("/extensions/available", {})
out["kept"] = sorted(a["id"] for a in r["available"])
s, r = X.post("/extensions/repos/update", {"name": "nas", "keys": ["not a key"]})
out["bad_key"] = [s, [p["code"] for p in r["problems"]]]
s, r = X.post("/extensions/repos/update", {"name": "nas", "keys": []})
out["cleared"] = [s, r["repository"]["signed"], r["repository"]["keys"]]
print(json.dumps(out))`;
  const env = { ...process.env, PYTHONPATH: path.join(S3D, "src"),
    S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"), S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"),
    S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"), S3DGRAPHY_PLUGINS_DATA_DIR: path.join(dir, "plugins-data"),
    EM_VOCABULARIES_DIR: path.join(dir, "vocab") };
  delete env.S3DGRAPHY_ONLINE_ACCESS;
  const out = JSON.parse(execFileSync(py, ["-c", code, dir, path.join(ROOT, "tools"), path.join(PROFILES, "examples")], { env }).toString());
  const kid = out.key_id;
  eq(out.added, [200, true, [kid]], "a folder added with its public key: signed");
  eq(out.sync, [200, [["nas", true, kid]]], "…read: the index's signature verified with that key");
  eq(out.repos, [200, kid], "…the list of repositories says by which key");
  eq(out.avail, [["esempio-statuaria", true, kid], ["facemesh_fit", true, kid]], "the offers: signed");
  eq(out.pv, [200, "signed", ["nas"], kid, true], "the preview: the archive signed by nas's key; the trust question stays");
  eq(out.install, [200, "installed", { key_id: kid, repos: ["nas"] }], "installed: its row carries the key");
  eq(out.installed.facemesh_fit, { key_id: kid, repos: ["nas"] }, "…and the installed list");
  eq(out.forged.slice(0, 3), [200, false, "sign_mismatch"], "an index written again without the key: refused");
  ok(/cambiati dopo la firma/.test(out.forged[3]), "…said in Italian");
  eq(out.kept, ["esempio-statuaria", "facemesh_fit"], "…the copy of before kept (facemesh_fit not withdrawn by a forged index)");
  eq(out.bad_key, [422, ["sign_key_bad"]], "a key that is not one: refused");
  eq(out.cleared, [200, false, []], "the keys taken away: no longer signed");
  fs.rmSync(dir, { recursive: true, force: true });
} else console.log("  (s3Dgraphy .venv or em-profiles not found: the bridge part skipped)");

console.log(`check-signing: ${checks} checks passed`);
