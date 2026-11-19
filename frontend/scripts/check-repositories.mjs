// MICRO-PL22-REPOSITORY-NELLA-FINESTRA (X2) · executable check of the
// repositories in «Estensioni»:
//   · the pure pieces (src/extensions-state.ts, extensions-window.ts): the
//     size of an archive in words, the list of what the repositories offer
//     (updates first, the filter), a source that is a repository's name;
//   · the window (linkedom): the section «Repository» with the switch «Consenti
//     l'accesso in rete» (disabled when the environment decides), a repository
//     with its URL, «token impostato» (never the token), its last read, its
//     problem, «Controlla gli aggiornamenti all'avvio»; what is offered with
//     «Installa» / «Aggiorna»; an installed id the index withdrew, said; an
//     update said beside the installed row; the form of «+ Aggiungi
//     repository…» (the official URL, a password field for the token); the plan
//     under the two panels (archive verified, the requirements first with their
//     code marked, an offer, tier C fetched or not); a bridge before 85 said;
//   · the wiring: level 85 in the page, the bridge and em_py; the routes; the
//     check at start-up; every new word in EN and IT;
//   · the bridge's module (tools/em_extensions.py over
//     s3dgraphy.extensions.remote) on a file:// repository built from
//     em-profiles' examples in /tmp: added, read with the switch off, an https
//     one refused while off; offered; previewed (archive_hash checked, the plan
//     with esempio-statuaria first); the plugin installed with its requirement;
//     the source = the repository; a tampered archive refused; the blocklist.
//
//   node scripts/check-repositories.mjs
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

// ── the pure pieces ─────────────────────────────────────────────────────────
eq([S.sizeText(512), S.sizeText(9 * 1024), S.sizeText(37 * 1024), S.sizeText(3 * 1024 * 1024), S.sizeText(undefined)],
   ["512 B", "9.0 kB", "37 kB", "3.0 MB", ""], "an archive's size in words");
const av = [
  { repo: "nas", id: "zeta", version: "1.0.0", versions: ["1.0.0"], sections: { data: {} }, installed: null, update: false, same_source: false },
  { repo: "nas", id: "facemesh_fit", version: "0.2.1", versions: ["0.2.1"], sections: { code: {} }, installed: "0.2.0", update: true, same_source: true },
  { repo: "nas", id: "alfa", version: "0.1.0", versions: ["0.1.0"], sections: { data: {}, code: {} }, installed: null, update: false, same_source: false },
];
eq(S.availableRows(av, "all").map((a) => a.id), ["facemesh_fit", "alfa", "zeta"], "the updates first, then by id");
eq(S.availableRows(av, "plugins").map((a) => a.id), ["facemesh_fit", "alfa"], "«Plugin»: code, and mixed");
eq(S.availableRows(av, "packages").map((a) => a.id), ["alfa", "zeta"], "«Pacchetti di comunità»: data, and mixed");
eq(["disk", "profiles", "node", "dev", "nas", undefined].map((x) => W.isRepoSource(x)), [false, false, false, false, true, false],
   "a source that is a repository's name");

// ── the window ──────────────────────────────────────────────────────────────
const host = { t: words, lang: () => "it", toast: () => {}, log: () => {}, dialog: async () => ({ ok: false }),
  pickArchive: async () => null, canPickFolder: () => false, fileName: () => null, openVocabularies: () => {}, afterChange: () => {} };
const prob = (code, it) => ({ code, level: "warning", en: `${code} (en)`, it });
const st = {
  rows: [{ id: "facemesh_fit", kind: "plugin", version: "0.2.0", source: "nas", registered: true, data: { status: "absent" },
    code: { status: "installed", version: "0.2.0", versions: ["0.2.0"], active: true } },
    { id: "esempio-statuaria", kind: "community-package", version: "0.1.0", source: "nas", registered: true,
      data: { status: "installed", versions: ["0.1.0"] }, code: { status: "absent" } }],
  unavailable: false, error: null, platform: "macos-arm64", dirs: {}, overlay: null, missing: [],
  repos: [{ name: "nas", url: "file:///Volumes/NAS/estensioni/index.json", enabled: true, check_on_startup: true, has_token: false, local: true,
            synced_at: "2026-11-19T08:00:00Z", entries: 3, error: null },
          { name: "lab", url: "https://repo.example.org/em/index.json", enabled: true, check_on_startup: false, has_token: true, local: false,
            synced_at: null, entries: null, error: prob("repo_offline", "https://repo.example.org/em/index.json: l'accesso in rete è spento («Consenti l'accesso in rete»)") }],
  online: { on: false, setting: false, env: null }, officialUrl: "https://extendedmatrix.github.io/em-extensions/index.json",
  available: av, blocked: [{ repo: "nas", id: "esempio-statuaria", reason: "replaced", problem: prob("repo_blocked_installed", "esempio-statuaria è installato qui, e nas lo ha ritirato: replaced") }],
  updates: [{ id: "facemesh_fit", repo: "nas", installed: "0.2.0", version: "0.2.1" }], syncProblems: {},
};
let box = W.extensionsContent(document, host, st, () => {});
const sec = box.querySelector("[data-ext-repos]");
ok(sec && sec.dataset.extRepos === "2", "the section «Repository», after the installed list");
const sw = sec.querySelector("[data-ext-online]");
ok(sw && sw.checked === false && !sw.disabled, "«Consenti l'accesso in rete»: off by default, one switch");
ok(sec.textContent.includes("ext.online") && sec.textContent.includes("ext.onlineHint"), "…its words, and that a folder works without it");
const nas = sec.querySelector('[data-ext-repo="nas"]'), lab = sec.querySelector('[data-ext-repo="lab"]');
ok(nas.textContent.includes("ext.repoLocal") && nas.textContent.includes("file:///Volumes/NAS/estensioni/index.json"), "a folder repository: «cartella», its address");
ok(nas.textContent.includes("ext.repoSynced(n=3,at=2026-11-19 08:00:00 UTC)"), "…when it was read, how many entries");
eq([nas.querySelector("[data-ext-repo-startup]").checked, lab.querySelector("[data-ext-repo-startup]").checked], [true, false], "«Controlla gli aggiornamenti all'avvio» per repository");
ok(lab.textContent.includes("ext.repoToken") && !lab.textContent.includes("Bearer "), "«token impostato», never the token");
eq(lab.querySelector("[data-ext-repo-problem]")?.textContent, "https://repo.example.org/em/index.json: l'accesso in rete è spento («Consenti l'accesso in rete»)",
   "the last read's problem, in the page's language");
ok(lab.querySelector("[data-ext='repo-sync']") && lab.querySelector("[data-ext='repo-token']") && lab.querySelector("[data-ext='repo-remove']"),
   "«Aggiorna l'elenco», the token, «Rimuovi il repository»");
eq([...sec.querySelectorAll("[data-ext-avail]")].map((r) => r.dataset.extAvail), ["nas/facemesh_fit", "nas/alfa", "nas/zeta"], "what is offered, updates first");
const fm = sec.querySelector('[data-ext-avail="nas/facemesh_fit"]');
ok(fm.querySelector("[data-ext='repo-update']") && fm.querySelector('[data-ext-avail-state="update"]').textContent === "ext.availUpdate(old=0.2.0,v=0.2.1)",
   "an update: «Aggiorna», 0.2.0 → 0.2.1");
ok(sec.querySelector('[data-ext-avail="nas/zeta"] [data-ext="repo-install"]'), "a new one: «Installa»");
const instRow = box.querySelector('.ext-list [data-ext-id="facemesh_fit"]');
ok(instRow.querySelector("[data-ext-update]")?.textContent === "ext.repoUpdate(old=0.2.0,v=0.2.1,r=nas)", "the installed row says the update");
ok(instRow.textContent.includes("ext.source.repo(r=nas)") && instRow.textContent.includes("ext.unverifiedFrom(r=nas)"), "…and where it came from, not verified");
ok(box.querySelector('.ext-list [data-ext-id="esempio-statuaria"] [data-ext-blocked="nas"]')?.textContent.includes("lo ha ritirato"),
   "an installed id the index withdrew: said beside it");
// the filter applies to what is offered too
W.setExtensionsFilter("packages");
box = W.extensionsContent(document, host, st, () => {});
eq([...box.querySelectorAll("[data-ext-avail]")].map((r) => r.dataset.extAvail), ["nas/alfa", "nas/zeta"], "the filter, on the offered list too");
W.setExtensionsFilter("all");
// the environment decides the switch
box = W.extensionsContent(document, host, { ...st, online: { on: true, setting: false, env: "1" } }, () => {});
ok(box.querySelector("[data-ext-online]").disabled && box.textContent.includes("ext.onlineEnv(v=1)"), "S3DGRAPHY_ONLINE_ACCESS set: the switch shown, not changed");
// an old bridge, and none yet
box = W.extensionsContent(document, { ...host, reposWhy: () => "bridge 84" }, st, () => {});
ok(box.querySelector("[data-ext-repos-why]")?.textContent === "bridge 84" && !box.querySelector("[data-ext-online]"), "a bridge before 85: said, nothing else");
box = W.extensionsContent(document, host, { ...st, repos: null }, () => {});
ok(box.querySelector("[data-ext-repos-why]")?.textContent === "ext.reposLoading", "not asked yet: «Leggo i repository…»");
box = W.extensionsContent(document, host, { ...st, repos: [], available: [] }, () => {});
ok(box.textContent.includes("ext.reposNone") && box.querySelector("[data-ext='repo-add']") && !box.querySelector("[data-ext='repo-sync-all']"),
   "no repository: said, «+ Aggiungi repository…»");
// the form
const form = W.addRepoBody(document, { t: words, pickRepoFolder: async () => "/Volumes/NAS/estensioni" }, st.officialUrl);
ok(form.body.querySelector("[data-ext-repo-token]").type === "password", "the token in a password field");
form.body.querySelector("[data-ext='repo-official']").onclick();
// MICRO-PL24: the official address ticks «Fidati delle revisioni…» (check-reviews.mjs)
eq(form.values(), { url: st.officialUrl, name: "extendedmatrix", token: "", check_on_startup: false, trust_reviews: true, keys: [] }, "«ExtendedMatrix (ufficiale)» fills the address; at start-up off");
form.body.querySelector("[data-ext='repo-folder']").onclick();
await new Promise((r) => setTimeout(r, 0));
eq(form.values().url, "/Volumes/NAS/estensioni", "«Scegli una cartella…» on the desktop");
ok(!W.addRepoBody(document, { t: words }, "").body.querySelector("[data-ext='repo-folder']"), "…not on the web");
// the plan under the two panels
const plan = { repo: "nas", id: "facemesh_fit", version: "0.2.0", ok: true, online_access: false, cycle: null,
  steps: [{ repo: "nas", id: "esempio-statuaria", version: "0.1.0", requested: false, sections: ["data"] },
          { repo: "other", id: "helper", version: "1.0.0", requested: false, sections: ["code"] },
          { repo: "nas", id: "facemesh_fit", version: "0.2.0", requested: true, sections: ["code"] }],
  unresolved: [{ id: "x", range: "^1", part: "data", for: "facemesh_fit", problem: prob("repo_requires_unresolved", "facemesh_fit richiede x ^1, che nessun repository offre: si installa incompleto") }],
  offers: [{ id: "rti", range: "^0.3", part: "code", repo: "nas", version: "0.3.0" }],
  tier_c: [{ id: "facemesh_fit", scheme: "https://e.org/aat/", version: "2026-10", url: "https://e.org/aat.ttl", will_fetch: false }] };
const pb = W.planBody(document, host, plan, { name: "nas", archive_hash: "sha256:0123456789abcdef0123" });
ok(pb.querySelector("[data-ext-archive-verified]")?.textContent === "ext.repoVerified(r=nas,h=0123456789ab)", "the archive checked against the index, said");
eq([...pb.querySelectorAll("[data-ext-dep]")].map((l) => l.dataset.extDep), ["esempio-statuaria", "helper"], "the requirements, installed first");
ok(pb.querySelector('[data-ext-dep="helper"] .ext-unverified') && !pb.querySelector('[data-ext-dep="esempio-statuaria"] .ext-unverified'),
   "…a requirement with code marked «con codice, non verificato»");
ok(pb.querySelector('[data-ext-unresolved="x"]')?.textContent.includes("si installa incompleto"), "what no repository has: «incompleto»");
ok(pb.querySelector('[data-ext-offer="rti"]')?.textContent === "ext.planOffer(id=rti,v=0.3.0,r=nas)", "an offer: said, not installed");
ok(pb.querySelector('[data-ext-tier-c="stub"]'), "tier C with the switch off: not downloaded, said");
const pv = { id: "facemesh_fit", ok: true, kind: "plugin", version: "0.2.0", source: "nas", data: { present: false },
  code: { present: true, version: "0.2.0", module: "facemesh_fit", trust_needed: true, permissions: {}, capabilities: [], commands: [] } };
const cb = W.confirmBody(document, host, pv);
ok(cb.textContent.includes("ext.fromRepo(r=nas)") && cb.textContent.includes("ext.unverifiedRepo(r=nas)"), "the two panels say the repository, not «da disco»");

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), bridge = read("tools/em_bridge.py"), emPy = read("tools/em_py.py"), emExt = read("tools/em_extensions.py");
const lv = [Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(main)?.[1]), Number(/^BRIDGE_LEVEL = (\d+)/m.exec(bridge)?.[1]), Number(/^LEVEL = (\d+)/m.exec(emPy)?.[1])];
ok(lv[0] >= 85 && lv.every((x) => x === lv[0]), "level 85 or later, the same in the page, the bridge, em_py");
for (const r of ["/extensions/repos", "/extensions/available", "/extensions/online", "/extensions/repos/add", "/extensions/repos/update",
                 "/extensions/repos/remove", "/extensions/repos/sync", "/extensions/repos/preview", "/extensions/repos/install"])
  ok(emExt.includes(`"${r}"`), `the bridge answers ${r}`);
ok(/checkExtUpdatesAtStartup\(\)/.test(main) && /syncRepos\(\{ startup: true \}\)/.test(main), "the check at start-up: only the repositories that ask for it");
ok(/refreshExtRepos\(\)/.test(main) && /EXT_REPOS_LEVEL = 85/.test(main), "the window asks the repositories when it opens, from level 85");
const i18n = read("frontend/src/i18n.ts");
const itStart = i18n.indexOf("const IT: Dict = {");
const used = new Set([...read("frontend/src/extensions-window.ts").matchAll(/t\("(ext\.(?:repo|repos|online|avail|plan|fromRepo|unverified(?:Repo|From)|source\.repo|confirmTitleRepo|installedRepo|installedDep|tierC|updates)[\w.]*)"/g)].map((m) => m[1]));
for (const k of ["ext.updatesToast", "ext.updatesOpen", "ext.reposOld"]) used.add(k);
ok(used.size >= 60, `the new words used (${used.size})`);
for (const k of used) {
  const re = new RegExp(`^  "${k.replace(/\./g, "\\.")}": "`, "m");
  ok(re.test(i18n.slice(0, itStart)) && re.test(i18n.slice(itStart)), `${k} in EN and IT`);
}

// ── the bridge's module over s3dgraphy.extensions.remote ───────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const PROFILES = process.env.EM_PROFILES ?? path.resolve(ROOT, "../em-profiles");
const py = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(py) && fs.existsSync(path.join(PROFILES, "examples/facemesh_fit"))) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pl22-repos-"));
  const code = `
import json, sys, os, shutil
sys.path.insert(0, sys.argv[2])
import em_extensions as X
from s3dgraphy import extensions as E
EX, D = sys.argv[3], sys.argv[1]
repo = os.path.join(D, "nas", "estensioni"); os.makedirs(repo)
for n in ("esempio-statuaria", "facemesh_fit"):
    assert E.build(os.path.join(EX, n), output_dir=repo)["ok"]
E.server_generate(repo)
out = {"zips": sorted(f for f in os.listdir(repo) if f.endswith(".zip"))}
s, r = X.get("/extensions/repos", {})
out["empty"] = [s, r["repositories"], r["online"]["on"], r["official_url"]]
s, r = X.post("/extensions/repos/add", {"url": repo})
out["add"] = [s, r["repository"]["name"], r["repository"]["local"], r["repository"]["url"].startswith("file://")]
s, r = X.post("/extensions/repos/add", {"url": "https://repo.example.org/em/", "name": "lab", "token": "s3cret"})
out["add_web"] = [s, r["repository"]["has_token"], "token" in r["repository"]]
s, r = X.post("/extensions/repos/sync", {})
out["sync"] = [s, [(x["name"], x["ok"], x["entries"], [p["code"] for p in x["problems"]]) for x in r["sync"]["repositories"]]]
s, r = X.get("/extensions/repos", {})
out["listed_no_token"] = [all("token" not in x for x in r["repositories"]), "s3cret" in json.dumps(r)]
s, r = X.get("/extensions/available", {})
out["available"] = [s, [(a["repo"], a["id"], a["version"], a["installed"]) for a in r["available"]]]
s, r = X.post("/extensions/repos/preview", {"repo": "estensioni", "id": "facemesh_fit"})
p = r["preview"]
out["preview"] = [s, p["source"], p["code"]["trust_needed"], p["repository"]["archive_hash"][:7],
                  [(x["id"], x["requested"]) for x in p["plan"]["steps"]], p["forms_checked"], p["requires"]["missing"]]
out["preview_wrote"] = sorted(os.listdir(os.path.join(D, "extensions", "archives", "estensioni")))
s, r = X.post("/extensions/repos/install", {"repo": "estensioni", "id": "facemesh_fit", "parts": "all", "trust": True, "trust_requires": True})
res = r["result"]
out["install"] = [s, res["installed"]["source"], res["installed"]["code"]["status"], [(d["id"], d["status"]) for d in res["requires"]],
                  res["installed"]["incomplete"]]
s, r = X.get("/extensions/installed", {})
out["installed"] = sorted((x["id"], x["source"]) for x in r["extensions"])
# a tampered archive is refused before it is opened
X.post("/extensions/remove", {"id": "facemesh_fit", "part": "all"})
shutil.rmtree(os.path.join(D, "extensions", "archives"))
z = os.path.join(repo, [f for f in out["zips"] if f.startswith("facemesh_fit-")][0])
b = bytearray(open(z, "rb").read()); b[-1] ^= 0xFF; open(z, "wb").write(bytes(b))
s, r = X.post("/extensions/repos/install", {"repo": "estensioni", "id": "facemesh_fit", "trust": True})
out["tampered"] = [s, [p["code"] for p in r["problems"]], bool(r["problems"][0]["it"])]
# the blocklist
json.dump([{"id": "esempio-statuaria", "reason": "replaced", "reason_it": "sostituito"}], open(os.path.join(repo, "blocklist.json"), "w"))
E.server_generate(repo)
X.post("/extensions/repos/sync", {"name": "estensioni"})
s, r = X.get("/extensions/available", {})
out["blocked"] = [[a["id"] for a in r["available"]], [b["id"] for b in r["blocked"]]]
s, r = X.post("/extensions/repos/install", {"repo": "estensioni", "id": "esempio-statuaria"})
out["blocked_install"] = [s, r["problems"][0]["code"]]
# the switch on, the environment wins
s, r = X.post("/extensions/online", {"on": True})
out["online"] = [s, r["online"]["on"], r["online"]["setting"]]
s, r = X.post("/extensions/repos/update", {"name": "lab", "token": "", "check_on_startup": True})
out["update"] = [s, r["repository"]["has_token"], r["repository"]["check_on_startup"]]
s, r = X.post("/extensions/repos/remove", {"name": "lab"})
out["removed"] = [s, r["removed"]]
s, r = X.post("/extensions/repos/add", {"url": "ftp://x/index.json"})
out["bad"] = [s, r["problems"][0]["code"], r["problems"][0]["it"]]
print(json.dumps(out))`;
  const env = { ...process.env, PYTHONPATH: path.join(S3D, "src"),
    S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"), S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"),
    S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"), EM_VOCABULARIES_DIR: path.join(dir, "vocab") };
  delete env.S3DGRAPHY_ONLINE_ACCESS;
  const out = JSON.parse(execFileSync(py, ["-c", code, dir, path.join(ROOT, "tools"), path.join(PROFILES, "examples")], { env }).toString());
  eq(out.empty, [200, [], false, "https://extendedmatrix.github.io/em-extensions/index.json"], "none at first; the switch off; the official address offered, not added");
  eq(out.add, [200, "estensioni", true, true], "a folder (the NAS) added as a file:// repository, named after it");
  eq(out.add_web, [200, true, false], "an https one with a token: «token impostato», the token never given back");
  eq(out.sync, [200, [["estensioni", true, 2, []], ["lab", false, null, ["repo_offline"]]]], "read: the folder with the switch off; the https one refused while off");
  eq(out.listed_no_token, [true, false], "the token appears in no answer");
  const ver = (id) => out.zips.find((z) => z.startsWith(`${id}-`)).slice(id.length + 1, -4);
  eq(out.available, [200, [["estensioni", "esempio-statuaria", ver("esempio-statuaria"), null], ["estensioni", "facemesh_fit", ver("facemesh_fit"), null]]],
     "what the repository offers");
  eq(out.preview, [200, "estensioni", true, "sha256:", [["esempio-statuaria", false], ["facemesh_fit", true]], true, []],
     "the preview: from the repository, the trust question, the archive's hash, the data it requires first (not «missing»), the sheets checked");
  eq(out.preview_wrote, out.zips.filter((z) => z.startsWith("facemesh_fit-")), "…only the archive asked about downloaded, kept checked (the register's origin)");
  eq(out.install, [200, "estensioni", "installed", [["esempio-statuaria", "installed"]], false], "installed: its requirement first, complete, the source = the repository");
  eq(out.installed, [["esempio-statuaria", "estensioni"], ["facemesh_fit", "estensioni"]], "the register says where each came from");
  eq(out.tampered.slice(0, 2), [422, ["index_hash_mismatch"]], "a byte changed in the archive: refused before it is opened");
  ok(out.tampered[2], "…in Italian too");
  eq(out.blocked, [["facemesh_fit"], ["esempio-statuaria"]], "a withdrawn id: not offered; installed here, said");
  eq(out.blocked_install, [422, "repo_blocked"], "…and not installable");
  eq(out.online, [200, true, true], "«Consenti l'accesso in rete» on");
  eq(out.update, [200, false, true], "a token cleared, «all'avvio» on");
  eq(out.removed, [200, true], "a repository removed");
  eq(out.bad.slice(0, 2), [422, "repo_url_bad"], "an address that is not a repository's: refused");
  ok(/non è l'indirizzo di un repository/.test(out.bad[2]), "…in Italian");
  fs.rmSync(dir, { recursive: true, force: true });
} else console.log("  (s3Dgraphy .venv or em-profiles not found: the bridge part skipped)");

console.log(`check-repositories: ${checks} checks passed`);
