// MICRO-PL24-ELENCO-RIVISTI (X4) · executable check of the list of the
// reviewed in «Estensioni»:
//   · the pure pieces (src/extensions-state.ts): what a change of the reviews
//     says (arrived first, then withdrawn);
//   · the window (linkedom): an installed code «rivisto da X il Y (repo)» in
//     place of «non verificato»; the code's panel of a reviewed code — the
//     mark in its head, «Rivisto da … si installa senza la domanda di fiducia»
//     in place of the powers' sentence, data-ext-trust="reviewed"; an
//     unreviewed one as before; a repository's «Fidati delle revisioni di
//     questo repository» (ticked for the official one, absent with a bridge
//     before 87), «ufficiale»; an offer «rivisto da»; «Aggiorna tutto» saying
//     who read a quiet update; the dialog «+ Aggiungi repository…» with the
//     box (untouched: the library's default; the official address ticks it);
//   · the wiring: level 87 in the page, the bridge and em_py; trust_reviews in
//     the bridge's add and update; no trust answer sent for a reviewed code;
//     every new word in EN and IT;
//   · the bridge's module (tools/em_extensions.py over s3dgraphy.extensions) on
//     a file:// repository built from em-profiles' examples in /tmp, with a
//     reviewed.json: the review not counted until the person says so, then the
//     plugin installed without the trust answer, verified, «rivisto da»; the
//     review withdrawn at the next read, said in Italian, the plugin still
//     installed; the switch off again.
//
//   node scripts/check-reviews.mjs
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
const prob = (code, it) => ({ code, level: "warning", en: `${code} (en)`, it });
const RV = { by: "@zalmoxes-laran", on: "2026-11-19", as: "editor", digest: "sha256:ab", repo: "nas" };

// ── the pure pieces ─────────────────────────────────────────────────────────
eq(S.reviewsChangeProblems({ verified: [{ id: "a", problem: prob("review_arrived", "a") }], withdrawn: [{ id: "b", problem: prob("review_withdrawn", "b") }] })
  .map((p) => p.code), ["review_arrived", "review_withdrawn"], "a change of the reviews: arrived first, then withdrawn");
eq(S.reviewsChangeProblems(undefined), [], "…none: nothing to say");

// ── the window ──────────────────────────────────────────────────────────────
const host = { t: words, lang: () => "it", toast: () => {}, log: () => {}, dialog: async () => ({ ok: false }),
  pickArchive: async () => null, canPickFolder: () => false, fileName: () => null, openVocabularies: () => {}, afterChange: () => {} };
const st = {
  rows: [
    { id: "facemesh_fit", kind: "plugin", version: "0.3.0", source: "nas", registered: true, data: { status: "absent" },
      code: { status: "installed", version: "0.3.0", versions: ["0.3.0"], active: true, permissions: {}, verified: true, reviewed: RV, trusted_by: "review" } },
    { id: "altro", kind: "plugin", version: "1.0.0", source: "nas", registered: true, data: { status: "absent" },
      code: { status: "installed", version: "1.0.0", versions: ["1.0.0"], active: true, permissions: {}, verified: false } }],
  unavailable: false, error: null, platform: "linux-x64", dirs: { extensions: "/x/e", profiles: "/x/p", plugins: "/x/pl" },
  overlay: null, missing: [], newer: [],
  repos: [
    { name: "nas", url: "file:///Volumes/NAS/estensioni/index.json", enabled: true, check_on_startup: false, has_token: false, local: true,
      synced_at: "2026-11-19T08:00:00Z", entries: 2, error: null, trust_reviews: false, official: false },
    { name: "extendedmatrix", url: "https://extendedmatrix.github.io/em-extensions/index.json", enabled: true, check_on_startup: false,
      has_token: false, local: false, synced_at: null, entries: null, error: null, trust_reviews: true, official: true }],
  online: { on: false, setting: false, env: null }, officialUrl: "https://extendedmatrix.github.io/em-extensions/index.json",
  available: [{ repo: "nas", id: "nuovo", version: "0.1.0", versions: ["0.1.0"], name: "Nuovo", sections: { code: {} }, installed: null,
                update: false, same_source: false, reviewed: { by: "@curatrice", on: "2026-11-18", as: "curator:esempio-statuaria" }, verified: true },
              { repo: "nas", id: "grezzo", version: "0.1.0", versions: ["0.1.0"], name: "Grezzo", sections: { code: {} }, installed: null,
                update: false, same_source: false, reviewed: { by: "@x", on: "2026-11-18" }, verified: false }],
  blocked: [], updates: [], otherPlatforms: [], syncProblems: {}, versions: {}, loadVersions: async () => {},
};
let box = W.extensionsContent(document, host, st, () => {});
const fm = box.querySelector('.ext-list [data-ext-id="facemesh_fit"] [data-ext-part="code"]');
ok(fm.querySelector("[data-ext-reviewed]")?.textContent === "ext.reviewedFrom(by=@zalmoxes-laran,on=2026-11-19,r=nas)",
   "an installed reviewed code: «rivisto da @zalmoxes-laran il 2026-11-19 (nas)»");
ok(!fm.querySelector(".ext-unverified") && fm.querySelector("[data-ext-reviewed]").title === "ext.reviewAsEditor", "…not «non verificato»; the role in its tooltip");
const al = box.querySelector('.ext-list [data-ext-id="altro"] [data-ext-part="code"]');
ok(al.querySelector(".ext-unverified") && !al.querySelector("[data-ext-reviewed]"), "an unreviewed one: «non verificato», as before");
const nas = box.querySelector('[data-ext-repo="nas"]');
const cbNas = nas.querySelector('[data-ext-repo-reviews="nas"]');
ok(cbNas && cbNas.checked === false && nas.textContent.includes("ext.repoTrustReviews"), "a laboratory's repository: «Fidati delle revisioni…», unticked");
ok(!nas.querySelector("[data-ext-repo-official]"), "…not «ufficiale»");
const off = box.querySelector('[data-ext-repo="extendedmatrix"]');
ok(off.querySelector('[data-ext-repo-reviews="extendedmatrix"]')?.checked === true && off.querySelector("[data-ext-repo-official]")?.textContent === "ext.repoOfficialMark",
   "the official index: «ufficiale», its reviews ticked");
ok(box.querySelector('[data-ext-avail="nas/nuovo"] [data-ext-avail-reviewed="@curatrice"]')?.textContent.includes("ext.reviewedFrom(by=@curatrice,on=2026-11-18,r=nas)"),
   "an offer reviewed in a repository whose reviews count: «rivisto da»");
ok(!box.querySelector('[data-ext-avail="nas/grezzo"] [data-ext-avail-reviewed]'), "…a review that does not count here: not said as one");
box = W.extensionsContent(document, { ...host, reviewsWhy: () => "old" }, st, () => {});
ok(!box.querySelector("[data-ext-repo-reviews]"), "a bridge before 87: no box");

// the code's panel
const pvBase = { id: "facemesh_fit", ok: true, source: "nas", version: "0.3.0", kind: "plugin", data: { present: false },
  code: { present: true, version: "0.3.0", module: "facemesh_fit", permissions: { files: "Legge il file 3D del modello scelto" }, capabilities: [] } };
let cb = W.confirmBody(document, host, { ...pvBase, code: { ...pvBase.code, trust_needed: false, verified: true, reviewed: RV } });
let panel = cb.querySelector('[data-ext-panel="code"]');
ok(panel.dataset.extTrust === "reviewed", "a reviewed code: data-ext-trust=reviewed");
ok(panel.querySelector(".ext-panel-h [data-ext-reviewed]") && !panel.querySelector(".ext-unverified"), "…the mark in the panel's head, no «NON VERIFICATO»");
ok(panel.querySelector("[data-ext-trust-reviewed]")?.textContent === "ext.trustReviewed(by=@zalmoxes-laran,on=2026-11-19,r=nas)" && !panel.querySelector(".ext-powers"),
   "…«Rivisto da … si installa senza la domanda di fiducia» in place of the powers' sentence");
ok(panel.textContent.includes("files — «Legge il file 3D del modello scelto»"), "…its permissions shown all the same");
cb = W.confirmBody(document, host, { ...pvBase, code: { ...pvBase.code, trust_needed: true, verified: false } });
panel = cb.querySelector('[data-ext-panel="code"]');
ok(panel.dataset.extTrust === "asked" && panel.querySelector(".ext-powers") && panel.querySelector(".ext-unverified"), "an unreviewed code: the question, as before");

// «Aggiorna tutto»
const ub = W.updateAllBody(document, host, [{ id: "facemesh_fit", repo: "nas", installed: "0.3.0", version: "0.3.1", trust_needed: false, verified: true, reviewed: RV }]);
ok(ub.querySelector('[data-ext-update-quiet="facemesh_fit"] [data-ext-reviewed]'), "«Aggiorna tutto»: a quiet update says who read its code");

// the dialog «+ Aggiungi repository…»
let d = W.addRepoBody(document, host, st.officialUrl);
ok(d.body.querySelector("[data-ext-repo-reviews-new]")?.checked === false, "the dialog: «Fidati delle revisioni…», unticked");
eq(d.values().trust_reviews, undefined, "…untouched: the library decides (the official index only)");
d.body.querySelector("[data-ext='repo-official']").onclick({});
ok(d.body.querySelector("[data-ext-repo-reviews-new]").checked && d.values().trust_reviews === true, "…«ExtendedMatrix (ufficiale)» ticks it");
d = W.addRepoBody(document, host, st.officialUrl);
const nb = d.body.querySelector("[data-ext-repo-reviews-new]");
nb.checked = true; nb.onchange(); nb.checked = false; nb.onchange();
eq(d.values().trust_reviews, false, "…unticked by hand: no");

// ── the wiring ──────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const main = read("frontend/src/main.ts"), bridge = read("tools/em_bridge.py"), emPy = read("tools/em_py.py"), emExt = read("tools/em_extensions.py");
const win = read("frontend/src/extensions-window.ts");
const lv = [Number(/const BRIDGE_LEVEL_WANTED = (\d+)/.exec(main)?.[1]), Number(/^BRIDGE_LEVEL = (\d+)/m.exec(bridge)?.[1]), Number(/^LEVEL = (\d+)/m.exec(emPy)?.[1])];
ok(lv[0] >= 87 && lv.every((x) => x === lv[0]), "level 87 or later, the same in the page, the bridge, em_py");
ok(/trust_reviews=flag\("trust_reviews"\)/.test(emExt) && /\("enabled", "check_on_startup", "trust_reviews"\)/.test(emExt), "the bridge's add and update take trust_reviews");
ok(/EXT_REVIEWS_LEVEL = 87/.test(main) && /reviewsWhy: \(\) =>/.test(main), "the page: the box from level 87");
eq((win.match(/const trust = parts === "all" && !!p\.code\?\.present && !p\.code\.verified;/g) ?? []).length, 2,
   "no trust answer sent for a reviewed code (from disk and from a repository)");
const i18n = read("frontend/src/i18n.ts");
const itStart = i18n.indexOf("const IT: Dict = {");
const keys = ["ext.reviewedBy", "ext.reviewedFrom", "ext.reviewAsEditor", "ext.reviewAsCurator", "ext.trustReviewed", "ext.repoTrustReviews",
  "ext.repoTrustReviewsHint", "ext.repoTrustReviewsOn", "ext.repoTrustReviewsOff", "ext.repoOfficialMark", "ext.trustChange.review", "ext.reviewsOld"];
for (const k of keys) {
  const re = new RegExp(`^  "${k.replace(/\./g, "\\.")}": "`, "m");
  ok(re.test(i18n.slice(0, itStart)) && re.test(i18n.slice(itStart)), `${k} in EN and IT`);
}

// ── the bridge's module over s3dgraphy.extensions ──────────────────────────
const S3D = process.env.S3D ?? path.resolve(ROOT, "../s3Dgraphy");
const PROFILES = process.env.EM_PROFILES ?? path.resolve(ROOT, "../em-profiles");
const py = path.join(S3D, ".venv/bin/python");
if (fs.existsSync(py) && fs.existsSync(path.join(PROFILES, "examples/facemesh_fit"))) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pl24-reviews-"));
  const code = `
import json, sys, os
sys.path.insert(0, sys.argv[2])
import em_extensions as X
from s3dgraphy import extensions as E
EX, D = sys.argv[3], sys.argv[1]
repo = os.path.join(D, "nas"); os.makedirs(repo)
for n in ("esempio-statuaria", "facemesh_fit"):
    assert E.build(os.path.join(EX, n), output_dir=repo)["ok"]
fm = [f for f in os.listdir(repo) if f.startswith("facemesh_fit-")][0]
E.add_review(repo, os.path.join(repo, fm), by="@zalmoxes-laran", on="2026-11-19", as_="editor", note="ESEMPIO")
assert E.server_generate(repo)["ok"]
out = {}
s, r = X.post("/extensions/repos/add", {"url": repo, "name": "nas"})
out["added"] = [s, r["repository"]["trust_reviews"], r["repository"]["official"]]
X.post("/extensions/repos/sync", {})
s, r = X.post("/extensions/repos/preview", {"repo": "nas", "id": "facemesh_fit"})
c = r["preview"]["code"]
out["pv_off"] = [s, c["trust_needed"], c["verified"], r["preview"]["repository"]["reviewed"]["by"], r["preview"]["repository"]["trust_reviews"]]
s, r = X.post("/extensions/repos/update", {"name": "nas", "trust_reviews": True})
out["on"] = [s, r["repository"]["trust_reviews"], r["repository"]["reviews"]]
s, r = X.get("/extensions/available", {})
out["avail"] = sorted((a["id"], a["verified"]) for a in r["available"])
s, r = X.post("/extensions/repos/preview", {"repo": "nas", "id": "facemesh_fit", "lang": "it"})
c = r["preview"]["code"]
out["pv_on"] = [s, c["trust_needed"], c["verified"], c["reviewed"]["by"], c["reviewed"]["repo"], c["review_note"]["it"]]
s, r = X.post("/extensions/repos/install", {"repo": "nas", "id": "facemesh_fit", "trust": False, "trust_requires": False})
top = r["result"]["installed"]
out["install"] = [s, top["code"]["status"], top["code"]["verified"], top["code"]["trusted_by"]]
s, r = X.get("/extensions/installed", {})
row = {x["id"]: x for x in r["extensions"]}["facemesh_fit"]["code"]
out["installed"] = [s, row["verified"], row["reviewed"]["by"], row["reviewed"]["as"]]
# the review taken out of the list
open(os.path.join(repo, "reviewed.json"), "w").write('{"reviewed": []}\\n')
assert E.server_generate(repo)["ok"]
s, r = X.post("/extensions/repos/sync", {})
w = r["sync"]["reviews"]["withdrawn"]
out["withdrawn"] = [s, [x["id"] for x in w], w[0]["problem"]["it"]]
s, r = X.get("/extensions/installed", {})
row = {x["id"]: x for x in r["extensions"]}["facemesh_fit"]["code"]
out["after"] = [row["status"], row["verified"], row.get("active")]
s, r = X.post("/extensions/repos/update", {"name": "nas", "trust_reviews": False})
out["off"] = [s, r["repository"]["trust_reviews"]]
print(json.dumps(out))`;
  const env = { ...process.env, PYTHONPATH: path.join(S3D, "src"),
    S3DGRAPHY_PROFILES_DIR: path.join(dir, "profiles"), S3DGRAPHY_EXTENSIONS_DIR: path.join(dir, "extensions"),
    S3DGRAPHY_PLUGINS_DIR: path.join(dir, "plugins"), S3DGRAPHY_PLUGINS_DATA_DIR: path.join(dir, "plugins-data"),
    EM_VOCABULARIES_DIR: path.join(dir, "vocab") };
  delete env.S3DGRAPHY_ONLINE_ACCESS;
  const out = JSON.parse(execFileSync(py, ["-c", code, dir, path.join(ROOT, "tools"), path.join(PROFILES, "examples")], { env }).toString());
  eq(out.added, [200, false, false], "a folder added: its reviews do not count yet, not the official index");
  eq(out.pv_off, [200, true, false, "@zalmoxes-laran", false], "…the review is in its index, but the trust question stays");
  eq(out.on, [200, true, { verified: [], withdrawn: [] }], "«Fidati delle revisioni di questo repository»: on (nothing installed to look at again)");
  eq(out.avail, [["esempio-statuaria", false], ["facemesh_fit", true]], "the offers: facemesh_fit reviewed, the data package not");
  eq(out.pv_on.slice(0, 5), [200, false, true, "@zalmoxes-laran", "nas"], "the preview: no trust question, verified, who and where");
  ok(/rivisto da @zalmoxes-laran il 2026-11-19 \(nas\)/.test(out.pv_on[5]), "…said in Italian");
  eq(out.install, [200, "installed", true, "review"], "installed with no trust answer: verified, its trust the review's");
  eq(out.installed, [200, true, "@zalmoxes-laran", "editor"], "the installed list: verified, by the editor");
  eq(out.withdrawn.slice(0, 2), [200, ["facemesh_fit"]], "the review taken out of the list: said at the next read");
  ok(/resta installato, non verificato/.test(out.withdrawn[2]), "…in Italian");
  eq(out.after, ["installed", false, true], "…the plugin still installed and active, not verified");
  eq(out.off, [200, false], "the switch off again");
  fs.rmSync(dir, { recursive: true, force: true });
} else console.log("  (s3Dgraphy .venv or em-profiles not found: the bridge part skipped)");

console.log(`check-reviews: ${checks} checks passed`);
