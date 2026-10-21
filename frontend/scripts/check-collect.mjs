// MICRO-WINDOWS-MODELLI p.5 · executable check of «Raccogli le risorse…»:
//   1. `src/collect.ts`: the study's folder, the files outside it (absolute,
//      onedrive://, smb://, a blend:// elsewhere; the web and the inside left),
//      the type folders and the destination per source folder, the new urls
//      relative to the em.json (Windows too);
//   2. a real bridge (`POST /fs/collect`): an OBJ brings its mtl and the
//      textures the mtl names, a folder leaves its .blend1/.blend2; the plan
//      weighs, the run copies (the sources stay), every copy's sha256 equals
//      its source's; a second run finds them «there»; a different file at the
//      destination is a conflict, never overwritten; a destination outside the
//      study is refused.
//
//   node scripts/check-collect.mjs
import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? "python3";
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./collect";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const C = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const eq = (a, b, what) => { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); };

// ── 1 · the rules ───────────────────────────────────────────────────────────
const EMJ = "C:/Users/Utente/OneDrive - CNR/T6.5/TM/EM/TempluMare_v4.em.json";
const files = [
  { id: "rb", name: "OB", url: "../RB/versions/OB.glb" },
  { id: "px", name: "SU002", url: "proxies/SU002.glb" },
  { id: "bl", name: "GT", url: "blend://../SB/GreatTemple.blend#Object/GT" },
  { id: "o1", name: "TM015 obj", url: "onedrive://Dottorato Bucarest/2_Rilievo/3DModels/TM015/TM015.obj", urlType: "3d_model", packaging: "file" },
  { id: "o2", name: "TM015 viste", url: "onedrive://Dottorato Bucarest/2_Rilievo/3DModels/TM015/", urlType: "image", packaging: "file_set" },
  { id: "o3", name: "TM035 obj", url: "onedrive://Dottorato Bucarest/2_Rilievo/3DModels/TM035/TM035.obj", urlType: "3d_model" },
  { id: "ab", name: "DJI", url: "C:/Users/Utente/Desktop/Segni/DJI_0238.JPG" },
  { id: "pdf", name: "Relazione", url: "D:/Archivio/relazione 2015.pdf" },
  { id: "be", name: "Old", url: "blend://C:/Users/Utente/Blender/old.blend#Object/X" },
  { id: "sm", name: "NAS", url: "smb://zal9/OWNCLOUD/Sarmizegetusa2015/" },
  { id: "web", name: "web", url: "https://example.org/x.glb" },
];
const root = C.studyRootOf(EMJ, files.map((f) => f.url));
eq(root, "C:/Users/Utente/OneDrive - CNR/T6.5/TM", "the study's folder: the one ../RB climbs to");
const none = C.outsideFiles(files, EMJ, root, null);
eq(none.map((x) => [x.id, x.kind, !!x.src, x.why ?? null]),
   [["o1", "onedrive", false, "onedrive"], ["o2", "onedrive", false, "onedrive"], ["o3", "onedrive", false, "onedrive"],
    ["ab", "absolute", true, null], ["pdf", "absolute", true, null], ["be", "blend", true, null], ["sm", "smb", false, "smb"]],
   "outside: onedrive:// (not reachable without the OneDrive folder), absolute, a .blend elsewhere, a share; the study's own and the web left");
const OD = "C:/Users/Utente/OneDrive - CNR";
const out = C.outsideFiles(files, EMJ, root, OD);
eq(out.find((x) => x.id === "o1").src, "C:/Users/Utente/OneDrive - CNR/Dottorato Bucarest/2_Rilievo/3DModels/TM015/TM015.obj", "onedrive:// under this computer's OneDrive folder");
eq(out.map((x) => [x.id, x.type, x.folder]).filter((x) => /^o/.test(x[0])), [["o1", "model", false], ["o2", "image", true], ["o3", "model", false]], "types: an OBJ is a model, the renders' folder a set of images");
const roots = C.defaultRoots(out, EMJ, root);
eq(roots, { models: "RB/3DModels", documents: "EM/DosCo" }, "the type folders proposed: RB/<the source's folder of folders>, the documents in DosCo beside the em.json");
const dest = C.proposeDest(out, roots);
eq([dest.get("o1"), dest.get("o2"), dest.get("o3"), dest.get("ab"), dest.get("pdf"), dest.get("be")],
   ["RB/3DModels/TM015", "RB/3DModels/TM015", "RB/3DModels/TM035", "EM/DosCo", "EM/DosCo", "RB/3DModels/Blender"],
   "a block's OBJ and its renders share one folder; the documents and images go to DosCo; a .blend to the models");
const edited = C.proposeDest(out, { models: "RB/blocchi", documents: "EM/DosCo" });
eq(edited.get("o1"), "RB/blocchi/TM015", "the type folder edited: RB/blocchi/TM015 (the MICRO's example)");
const at = (id, d) => C.collectedUrl(out.find((x) => x.id === id), `${root}/${d}`, EMJ);
eq([at("o1", "RB/blocchi/TM015"), at("o2", "RB/blocchi/TM015"), at("pdf", "EM/DosCo"), at("be", "RB/3DModels/Blender")],
   ["../RB/blocchi/TM015/TM015.obj", "../RB/blocchi/TM015/", "DosCo/relazione 2015.pdf", "blend://../RB/3DModels/Blender/old.blend#Object/X"],
   "the new urls, relative to the em.json: a file, a folder with its /, a document beside it, a blend:// with its datablock");
const twins = C.proposeDest([{ id: "a", src: "/x/a/M", folder: true, type: "model" }, { id: "b", src: "/y/b/M", folder: true, type: "model" }], { models: "RB/m", documents: "D" });
eq([twins.get("a"), twins.get("b")], ["RB/m/M", "RB/m/M-2"], "two source folders of one name: -2");

// ── 2 · a real bridge ──────────────────────────────────────────────────────
const dir = realpathSync(mkdtempSync(`${tmpdir()}/collect-`));
const study = `${dir}/Studio`, away = `${dir}/OneDrive - Prova/Dottorato Bucarest/2_Rilievo/3DModels/TM015`;
mkdirSync(`${study}/EM`, { recursive: true });
mkdirSync(`${study}/RB`, { recursive: true });
mkdirSync(`${away}/tex`, { recursive: true });
writeFileSync(`${study}/EM/s.em.json`, JSON.stringify({ header: { format: "em.json" }, graphs: {} }));
writeFileSync(`${away}/TM015.obj`, "mtllib TM015.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
writeFileSync(`${away}/TM015.mtl`, "newmtl a\nmap_Kd -s 1 1 1 tex/TM015 colore.jpg\nmap_Bump TM015_n.png\nmap_Ks manca.jpg\n");
writeFileSync(`${away}/tex/TM015 colore.jpg`, "JPEG-colore");
writeFileSync(`${away}/TM015_n.png`, "PNG-normale");
writeFileSync(`${away}/TM015.blend`, "BLENDER-v");
writeFileSync(`${away}/TM015.blend1`, "BLENDER-backup1");
writeFileSync(`${away}/TM015.blend2`, "BLENDER-backup2");
writeFileSync(`${away}/TM015 front.jpg`, "JPEG-front");
writeFileSync(`${away}/.DS_Store`, "x");
mkdirSync(`${away}/old`, { recursive: true });
writeFileSync(`${away}/old/TM015_tobe_corrected.obj`, "v 0 0 0\n");
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort();
const br = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", `${dir}/OneDrive - Prova`, "--s3dgraphy", `${S3D}src`],
  { env: { ...process.env, EM_BRIDGE_STATE_DIR: `${dir}/.state` }, stdio: ["ignore", "pipe", "pipe"] });
let blog = "";
br.stdout.on("data", (b) => { blog += b; });
br.stderr.on("data", (b) => { blog += b; });
const B = `http://127.0.0.1:${port}`;
const H = { Origin: "http://localhost:5173", "Content-Type": "application/json" };
let up = false;
for (let i = 0; i < 100 && !up; i++) { await new Promise((r) => setTimeout(r, 150)); up = await fetch(`${B}/health`).then((r) => r.ok, () => false); }
eq(up, true, "the bridge starts");
const post = (route, body) => fetch(`${B}${route}`, { method: "POST", headers: H, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
if (up) {
  const items = [{ id: "obj", src: `${away}/TM015.obj`, dest: `${study}/RB/blocchi/TM015` },
                 { id: "set", src: `${away}/`, dest: `${study}/RB/blocchi/TM015`, packaging: "file_set", url_type: "" },
                 { id: "renders", src: `${away}/`, dest: `${study}/RB/blocchi/TM015`, packaging: "file_set", url_type: "image" },
                 { id: "tree", src: `${away}/`, dest: `${study}/RB/albero/TM015`, packaging: "directory", url_type: "" }];
  eq((await post("/fs/collect", { root: study, items })).status, 403, "the study not served yet: refused");
  await post("/fs/doc", { em_json: `${study}/EM/s.em.json`, locators: ["../RB/x.glb"] });
  const plan = (await post("/fs/collect", { root: study, items })).j;
  const names = (id) => plan.items.find((x) => x.id === id).files.map((f) => f.dest.slice(`${study}/RB/blocchi/TM015/`.length)).sort();
  eq(names("obj"), ["TM015.mtl", "TM015.obj", "TM015_n.png", "tex/TM015 colore.jpg"], "an OBJ brings its mtl and the textures the mtl names (an option skipped, a name with a space)");
  eq(plan.items.find((x) => x.id === "obj").notes.length, 1, "…and says which texture the mtl names and is not there");
  eq(names("set"), ["TM015 front.jpg", "TM015.blend", "TM015.mtl", "TM015.obj", "TM015_n.png"], "a file set brings its own files — not its subfolders (old/, tex/), not the .blend1/.blend2 nor the system's litter");
  eq(names("renders"), ["TM015 front.jpg", "TM015_n.png"], "a file set of images brings its images only");
  eq(plan.items.find((x) => x.id === "tree").files.map((f) => f.dest.slice(`${study}/RB/albero/TM015/`.length)).sort(),
     ["TM015 front.jpg", "TM015.blend", "TM015.mtl", "TM015.obj", "TM015_n.png", "old/TM015_tobe_corrected.obj", "tex/TM015 colore.jpg"], "a directory (a tileset, a whole folder) comes whole, the backups left");
  eq([plan.bytes > 0, plan.copied, existsSync(`${study}/RB/blocchi`)], [true, 0, false], "the plan weighs and writes nothing");
  eq([plan.items.find((x) => x.id === "set").files.filter((f) => f.state === "shared").length, C.totals(plan.items.filter((x) => x.id !== "tree")).files], [3, 6],
     "a file two items share (the OBJ and its folder) is weighed once: «shared» in the second");
  const run = (await post("/fs/collect", { root: study, items, run: true })).j;
  const all = run.items.flatMap((x) => x.files);
  eq([run.items.every((x) => x.ok), all.filter((f) => f.state === "copied").length, all.filter((f) => f.state === "there").length], [true, 13, 5],
     "the run copies each file once (the OBJ's four; the set's two more, three already there; the renders' two already there; the directory's seven elsewhere)");
  eq(all.filter((f) => f.sha256).every((f) => f.sha256 === sha(f.src) && sha(f.dest) === f.sha256), true, "every copy's sha256 is its source's, read back from the disk");
  eq([existsSync(`${away}/TM015.obj`), existsSync(`${study}/RB/blocchi/TM015/TM015.blend1`), existsSync(`${study}/RB/blocchi/TM015/TM015.obj.em-part`)], [true, false, false], "copied, never moved; no backup, no half-copy left");
  const again = (await post("/fs/collect", { root: study, items, run: true })).j;
  eq(again.items.flatMap((x) => x.files).every((f) => f.state === "there") && again.copied === 0, true, "a second run finds everything there and copies nothing");
  writeFileSync(`${study}/RB/blocchi/TM015/TM015_n.png`, "ANOTHER");
  const clash = (await post("/fs/collect", { root: study, items: [items[0]], run: true })).j;
  eq([clash.items[0].ok, clash.items[0].files.find((f) => f.dest.endsWith("TM015_n.png")).state, readFileSync(`${study}/RB/blocchi/TM015/TM015_n.png`, "utf8")], [false, "conflict", "ANOTHER"],
     "another file with the same name at the destination: a conflict, never overwritten");
  // the study named through a link (`/tmp` → `/private/tmp` on the Mac): the same folder
  const { symlinkSync } = await import("node:fs");
  symlinkSync(study, `${dir}/link-to-study`);
  const viaLink = (await post("/fs/collect", { root: study, items: [{ id: "l", src: `${away}/TM015 front.jpg`, dest: `${dir}/link-to-study/RB/blocchi/TM015` }] })).j;
  eq([viaLink.items[0].error ?? null, viaLink.items[0].files[0]?.state], [null, "there"], "a destination named through a link to the study is inside it");
  const outside = (await post("/fs/collect", { root: study, items: [{ id: "x", src: `${away}/TM015.obj`, dest: `${dir}/fuori` }] })).j;
  eq(outside.items[0].error, "the destination is not inside the study's folder", "a destination outside the study is refused");
  const notServed = (await post("/fs/collect", { root: study, items: [{ id: "x", src: "/etc/hosts", dest: `${study}/RB` }] })).j;
  eq(notServed.items[0].error, "outside the served folders", "a source the bridge does not serve is refused");
}
br.kill();

if (fails.length) {
  console.log(`check-collect: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  if (!up) console.log(blog.slice(-1500));
  process.exit(1);
}
console.log(`check-collect: ${checks} checks OK`);
