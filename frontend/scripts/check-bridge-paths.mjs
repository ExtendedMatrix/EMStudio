// MICRO-PERCORSI-WINDOWS · the bridge's side of the paths (tools/em_bridge.py):
//   1. its pure helpers, asked with Windows' own path module (`ntpath`) — the
//      `\\?\` prefix past MAX_PATH, a share through /fs/at/, the folders an
//      open em.json may always read, a OneDrive placeholder told from a file;
//   2. a bridge started for real on a temporary study whose em.json is in NO
//      served root (a fresh install): its model is refused, then served once
//      the page names the em.json (`POST /fs/doc`); `/fs/probe` says ok,
//      missing, outside; a listing gives `/`-shaped paths.
//
//   node scripts/check-bridge-paths.mjs
//
// What it cannot prove here: a real Windows (the `\\?\` path opened by the OS,
// LongPathsEnabled off, a real Files On-Demand placeholder). Left to E.D.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? "python3";

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); };
const eq = (a, b, what) => { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); };

// ── 1 · the pure helpers ────────────────────────────────────────────────────
const pure = spawnSync(PY, ["-c", String.raw`
import json, ntpath, posixpath, sys
sys.argv = ["x"]
sys.path.insert(0, sys.argv[0] if False else ${JSON.stringify(TOOLS)})
import em_bridge as b
long_win = "C:\\Users\\Emanuel Demetrescu\\OneDrive - CNR\\" + "\\".join(["cartella_%02d_TempluMare" % i for i in range(12)]) + "\\x.glb"
share = "\\\\nas\\scavi\\" + "\\".join(["d%02d_xxxxxxxxxxxxxxxxxxxx" % i for i in range(12)]) + "\\x.glb"
def od_candidates():
    import tempfile, os
    home = tempfile.mkdtemp()
    for d in ("Library/CloudStorage/OneDrive-CNR/Dottorato Bucarest", "Library/CloudStorage/OneDrive-Altro", "OneDrive - Vecchio"):
        os.makedirs(os.path.join(home, d))
    win = tempfile.mkdtemp()                      # what Windows names in %OneDriveCommercial%
    os.makedirs(os.path.join(win, "Dottorato Bucarest"))
    a = [(os.path.relpath(c["path"], home), c["has"]) for c in b._onedrive_candidates(["Dottorato Bucarest"], home=home, env={})]
    w = [c["has"] for c in b._onedrive_candidates(["Dottorato Bucarest"], home=home, env={"OneDriveCommercial": win})]
    return {"mac": a, "win_first_has": w[0], "win_n": len(w)}
class St:
    def __init__(self, attrs=0, flags=0): self.st_file_attributes = attrs; self.st_flags = flags
out = {
  "long_len": len(long_win),
  "long": b._long_path(long_win, nt=True)[:7],
  "long_unc": b._long_path(share, nt=True)[:11],
  "short_kept": b._long_path("C:\\a\\b.glb", nt=True),
  "walked": b._long_path("C:\\Scavi", nt=True, always=True),
  "posix_untouched": b._long_path("/" + "a" * 300, nt=False)[:3],
  "short_back": b._short_path(b._long_path(long_win, nt=True)) == long_win,
  "short_unc_back": b._short_path("\\\\?\\UNC\\nas\\s\\x"),
  "out_win": b._out_path("C:\\Users\\ed\\x.glb", nt=True),
  "out_posix": b._out_path("/Users/ed/x.glb", nt=False),
  "at_drive": b._fs_at_path("/fs/at/C%3A/Users/ed/OneDrive%20-%20CNR/a%40b.glb"),
  "at_unc": b._fs_at_path("/fs/at/%5C%5Cnas/scavi/x.glb"),
  "at_posix": b._fs_at_path("/fs/at/tmp/x%20y.glb"),
  "unc_norm": ntpath.normpath(b._fs_at_path("/fs/at/%5C%5Cnas/scavi/x.glb")),
  "doc_win": b._doc_roots("C:\\Users\\ed\\T6.5\\TM\\EM\\TempluMare_v4.em.json",
                          ["../RB/versions/x.glb", "proxies/SU002.glb", "DosCo/D.05.pdf",
                           "onedrive://Dottorato Bucarest/x.obj", "blend://../RB/a.blend#Mesh/x", "D:/x.glb", ""],
                          pathmod=ntpath, home="C:\\Users\\ed"),
  "doc_far": b._doc_roots("C:\\Users\\ed\\T\\EM\\x.em.json", ["../../../../../Windows/x", "../RB/y.glb"],
                          pathmod=ntpath, home="C:\\Users\\ed"),
  "doc_home": b._doc_roots("/Users/ed/EM/x.em.json", ["../RB/y.glb"], pathmod=posixpath, home="/Users/ed"),
  "doc_disk": b._doc_roots("C:\\EM\\x.em.json", ["../RB/y.glb"], pathmod=ntpath, home="C:\\Users\\ed"),
  "cloud_win": [b._cloud_only(St(attrs=a)) for a in (0x20, 0x400000 | 0x20, 0x40000, 0x1000)],
  "cloud_mac": [b._cloud_only(St(flags=f)) for f in (0x60, 0x40000060)],
  "level": b.BRIDGE_LEVEL,
  "onedrive": od_candidates(),
  "with_onedrive": b._with_onedrive({"graphs": {"g": {"nodes": [{"data": {"url": "onedrive://Dottorato Bucarest/2_Rilievo/TM015.obj"}},
                                                                {"data": {"url": "../RB/a.glb"}}]}}}, "/OD")["graphs"]["g"]["nodes"],
}
print(json.dumps(out))
`], { encoding: "utf8" });
if (pure.status !== 0) {
  console.log(`check-bridge-paths: the helpers could not be asked\n${pure.stderr}`);
  process.exit(1);
}
const H = JSON.parse(pure.stdout.trim().split("\n").pop());
ok(H.long_len > 260, `the Windows fixture is past MAX_PATH (${H.long_len} characters)`);
eq(H.long, "\\\\?\\C:\\", "a Windows path past MAX_PATH gets the \\\\?\\ prefix");
eq(H.long_unc, "\\\\?\\UNC\\nas", "…a share gets \\\\?\\UNC\\");
eq(H.short_kept, "C:\\a\\b.glb", "a short Windows path is handed as it is");
eq(H.walked, "\\\\?\\C:\\Scavi", "a folder to WALK gets the prefix whatever its length (what is under it may be long)");
eq(H.posix_untouched, "/aa", "not on Windows: nothing added");
ok(H.short_back, "the prefix comes off again (what realpath may hand back)");
eq(H.short_unc_back, "\\\\nas\\s\\x", "…for a share too");
eq(H.out_win, "C:/Users/ed/x.glb", "a listing's path is /-shaped on Windows");
eq(H.out_posix, "/Users/ed/x.glb", "…and as it is elsewhere");
eq(H.at_drive, "C:/Users/ed/OneDrive - CNR/a@b.glb", "/fs/at/ with a drive");
eq(H.at_unc, "\\\\nas/scavi/x.glb", "/fs/at/ with a share (its two backslashes)");
eq(H.at_posix, "/tmp/x y.glb", "/fs/at/ with a POSIX path");
eq(H.unc_norm, "\\\\nas\\scavi\\x.glb", "…a share Windows reads as one");
eq(H.doc_win, ["C:\\Users\\ed\\T6.5\\TM\\EM", "C:\\Users\\ed\\T6.5\\TM"],
   "an open em.json: its folder and the study's folder its ../RB climbs to (schemes, other drives ignored)");
eq(H.doc_far, ["C:\\Users\\ed\\T\\EM", "C:\\Users\\ed\\T"], "a locator climbing past two levels opens nothing, the others still count");
eq(H.doc_home, ["/Users/ed/EM"], "the home folder itself is never opened by a document");
eq(H.doc_disk, ["C:\\EM"], "a whole disk is never opened by a document");
eq(H.cloud_win, [false, true, true, true], "Windows: RECALL_ON_DATA_ACCESS, RECALL_ON_OPEN, OFFLINE = online only");
eq(H.cloud_mac, [false, true], "macOS: SF_DATALESS = online only");
eq(H.level, 34, "the bridge says level 34 (/fs/doc, /fs/probe)");
eq(H.onedrive.mac[0], ["Library/CloudStorage/OneDrive-CNR", 1], "OneDrive found under ~/Library/CloudStorage, the one holding the study's folder first");
eq(H.onedrive.mac.length, 3, "…the others listed too (another account, ~/OneDrive*)");
eq([H.onedrive.win_first_has, H.onedrive.win_n], [1, 4], "Windows' %OneDriveCommercial% is asked as well");
eq(H.with_onedrive.map((n) => n.data.url), ["/OD/Dottorato Bucarest/2_Rilievo/TM015.obj", "../RB/a.glb"],
   "the library is asked with onedrive:// under this computer's folder; the rest untouched");

// ── 2 · a bridge for real ───────────────────────────────────────────────────
const dir = realpathSync(mkdtempSync(`${tmpdir()}/bridge-paths-`));
const study = `${dir}/Studio con spazi è #1`;
for (const d of ["EM/proxies", "RB/versions", "served"]) mkdirSync(`${study}/${d}`, { recursive: true });
mkdirSync(`${dir}/served`, { recursive: true });
writeFileSync(`${study}/EM/TempluMare_v4.em.json`, JSON.stringify({ header: { format: "em.json" }, graphs: {} }));
writeFileSync(`${study}/RB/versions/Architrave@lod0.glb`, "glTF-fake");
writeFileSync(`${study}/EM/proxies/SU002.glb`, "glTF-proxy");
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort();
const env = { ...process.env, EM_BRIDGE_STATE_DIR: `${dir}/.state` };
const br = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", `${dir}/served`, "--s3dgraphy", `${S3D}src`],
                 { env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
br.stdout.on("data", (b) => { log += b; });
br.stderr.on("data", (b) => { log += b; });
const B = `http://127.0.0.1:${port}`;
const H0 = { Origin: "http://localhost:5173" };
let up = false;
for (let i = 0; i < 100 && !up; i++) {
  await new Promise((r) => setTimeout(r, 150));
  up = await fetch(`${B}/health`).then((r) => r.ok, () => false);
}
ok(up, "the bridge starts");
if (up) {
  const at = (abs) => `${B}/fs/at/${abs.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/")}`;
  const model = `${study}/RB/versions/Architrave@lod0.glb`;
  eq((await fetch(at(model), { headers: H0 })).status, 403, "before: the study is in no served root (a fresh install) — the model is refused");
  const doc = await fetch(`${B}/fs/doc`, { method: "POST", headers: { ...H0, "Content-Type": "application/json" },
    body: JSON.stringify({ em_json: `${study}/EM/TempluMare_v4.em.json`, locators: ["../RB/versions/Architrave@lod0.glb", "proxies/SU002.glb"] }) })
    .then((r) => r.json());
  eq(doc.folders, [`${study}/EM`, study], "POST /fs/doc: the em.json's folder and the study's");
  const r = await fetch(at(model), { headers: H0 });
  eq([r.status, await r.text()], [200, "glTF-fake"], "after: the model beside the em.json is served (a name with spaces, an accent, # and @)");
  eq((await fetch(at(`${study}/EM/proxies/SU002.glb`), { headers: H0 })).status, 200, "…and its proxy");
  eq((await fetch(at(`${dir}/elsewhere.glb`), { headers: H0 })).status, 403, "a file outside the study is still refused");
  const notDoc = await fetch(`${B}/fs/doc`, { method: "POST", headers: { ...H0, "Content-Type": "application/json" },
    body: JSON.stringify({ em_json: `${dir}/nothing.em.json` }) });
  eq(notDoc.status, 404, "POST /fs/doc for an em.json that is not there opens nothing");
  const probe = await fetch(`${B}/fs/probe`, { method: "POST", headers: { ...H0, "Content-Type": "application/json" },
    body: JSON.stringify({ paths: [model, `${study}/RB/versions/gone.glb`, `${study}/RB`, "/etc/hosts"] }) }).then((x) => x.json());
  eq(probe.files.map((f) => f.state), ["ok", "missing", "folder", "outside"], "POST /fs/probe: ok, missing, folder, outside");
  ok(/OneDrive/.test(probe.cloud_only_message), "…with the words for a file online only");
  const list = await fetch(`${B}/fs/list?path=${encodeURIComponent(`${study}/EM/proxies`)}`, { headers: H0 }).then((x) => x.json());
  eq(list.entries?.map((e) => e.path), [`${study}/EM/proxies/SU002.glb`], "a listing gives the paths the page keeps");
  const head = await fetch(at(model), { method: "HEAD", headers: H0 });
  eq([head.status, head.headers.get("x-em-file")], [200, null], "a HEAD of a file on the disk says nothing of the cloud");
}
br.kill();

if (fails.length) {
  console.log(`check-bridge-paths: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  if (!up) console.log(log.slice(-1500));
  process.exit(1);
}
console.log(`check-bridge-paths: ${checks} checks OK`);
