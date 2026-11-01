// MICRO-TESTATA-CLOUD · a study in OneDrive / iCloud / Dropbox «online only»
// (bridge level 56). The page's functions (asset-list.ts: what «Scarica e
// misura» would download for a row, a group, a selection; an item of the
// queue whose source is in the cloud waits «da scaricare») and the bridge's
// side with a SIMULATED stat (`EM_BRIDGE_FAKE_CLOUD`, tests only): a file in
// the cloud is never read — not hashed (its stamp is not checked), not
// measured (the graph's numbers) — `POST /fs/hydrate {plan}` says how many
// files and bytes, `{paths}` downloads them by token with progress,
// `{cancel}` stops; then the list measures them. Also who-chip.ts (the chip
// «Chi sei» and the theme button's rules).
//
//   node scripts/check-cloud-files.mjs
import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) { fails.push(what); console.log(`  ✗ ${what}`); } else console.log(`  ✓ ${what}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
  const p = s.address().port; s.close(() => res(p)); }); });
const load = async (f) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${f}`], bundle: true, format: "esm", write: false });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};

// ── the page: asset-list.ts ─────────────────────────────────────────────────
const A = await load("asset-list.ts");
const ver = (id, o = {}) => ({ id, name: id, master: false, level: "lod0", lod_level: "lod0", level_say: "lod0", use: [], url: `../SB/${id}.glb`,
  checksum: "", stamped: true, size_bytes: 100, triangles: 10, gpu_bytes: 1, measured: false, texture_side: 512, ktx2: false, tileset: false,
  textures: [], texture_count: 0, state: "on_disk", made: { by: [], orcid: "", at: "", tool: "", how: "" }, made_say: "", modified_after_stamp: false,
  sha256_now: "", loaded_by: [], ...o });
const asset = (id, versions) => ({ id, name: id, kind: "rm", containers: [], branch: "SB", epochs: [], family: id, status: "ok", versions,
  findings: [], loaded_why: "", loaded_say: "", targets: {}, audit: { versions: versions.length, stamped: 0, files_missing: [], unchecked: 0,
  modified_after_stamp: [], master_declared: null } });
const cloudV = (id, path, bytes) => ver(id, { state: "in_cloud", in_cloud: true, cloud_paths: [path], cloud_bytes: bytes });
const M = (id, o = {}) => ver(id, { master: true, url: `blend://../SB/G.blend#Mesh/${id}`, ...o });
const a1 = asset("A1", [M("A1.m"), cloudV("A1.v0", "/c/A1.glb", 3 << 20)]);
const a2 = asset("A2", [M("A2.m", { state: "in_cloud", in_cloud: true, cloud_paths: ["/c/G.blend"], cloud_bytes: 50 << 20 }), cloudV("A2.v0", "/c/A2.glb", 1 << 20)]);
const a3 = asset("A3", [M("A3.m", { state: "in_cloud", in_cloud: true, cloud_paths: ["/c/G.blend"], cloud_bytes: 50 << 20 }), ver("A3.v0")]);
const c = A.cloudOf([a1, a2, a3]);
ok(c.paths.length === 3 && c.versions === 4 && c.bytes === (54 << 20), `cloudOf: 4 versions, 3 files (the .blend once), ${c.bytes >> 20} MB`);
ok(A.cloudOf([a1]).paths.join() === "/c/A1.glb" && A.cloudOf([a2], new Set(["A2.v0"])).paths.join() === "/c/A2.glb", "a row; only the versions asked");
ok(A.cloudOf([asset("X", [ver("X.v0")])]).paths.length === 0, "nothing in the cloud: nothing to download");
// the queue: the source the tool would take is in the cloud → «da scaricare»
const here = () => "";
const b1 = A.cloudBlock(a1, "ktx2", here);
ok(b1?.code === "cloud" && b1.paths.join() === "/c/A1.glb" && b1.bytes === 3 << 20, "an item whose glTF is in the cloud waits «da scaricare» (the file and its MB)");
const b3 = A.cloudBlock(a3, "decimate_bake", (id) => (id === "A3.v0" ? "/p/A3.v0.glb" : ""));
ok(b3?.code === "cloud" && b3.paths.join() === "/c/G.blend", "a bake wants the master's .blend: in the cloud → it waits for it, not a glTF instead");
const a4 = asset("A4", [M("A4.m"), cloudV("A4.v0", "/c/A4.glb", 1 << 20)]);
ok(A.cloudBlock(a4, "gltfpack", (id) => (id === "A4.m" ? "/p/G.blend" : ""))?.paths.join() === "/c/A4.glb",
   "gltfpack wants the glTF in the cloud: it waits, never quietly from the .blend instead");
ok(A.cloudBlock(a3, "ktx2", (id) => (id === "A3.v0" ? "/p/A3.v0.glb" : "")) === null && A.cloudBlock(a1, "keep", here) === null
   && A.cloudBlock(asset("X", [ver("X.v0")]), "ktx2", here) === null, "a source here: no wait; «keep»: nothing to do; nothing in the cloud");
const q = [{ id: "q1", state: "waiting", label: "", note: "", block: b1 }, { id: "q2", state: "waiting", label: "", note: "" }];
ok(A.nextToRun(q, "run", { slots: 2, held: 0 }).id === "q2", "the item «da scaricare» stays; the next one starts");

// ── the page: who-chip.ts ───────────────────────────────────────────────────
const W = await load("who-chip.ts");
ok(W.initialsOf("Emanuel Demetrescu") === "ED" && W.initialsOf("Ada") === "AD" && W.initialsOf("", "0000-0002-1825-009X") === "9X" && W.initialsOf("") === "?",
   "initials: two words, one word, the ORCID, nobody");
const none = W.chipModel({ author: null, node: "", signedIn: false });
ok(none.labelKey === "who.whoSigns" && none.dot === "none", "no author: the chip asks «Chi firma?»");
const me = { name: "Emanuel Demetrescu", orcid: "0000-0003-4271-5815", state: "verified" };
ok(W.chipModel({ author: me, node: "https://n", signedIn: false }).dot === "author"
   && W.chipModel({ author: me, node: "https://n", signedIn: true }).dot === "node"
   && W.chipModel({ author: me, node: "https://n", signedIn: true, mismatch: true }).dot === "mismatch", "the dot: author only, signed in on the node, another person");
ok(W.SIGN_NEEDS.stamp === "author" && W.SIGN_NEEDS.derive === "author" && W.SIGN_NEEDS.publish === "node" && W.SIGN_NEEDS.roomCreate === "node",
   "what signs needs: a stamp / a version the author; publishing / a room the node");
ok(W.missingFor("author", { author: null, signedIn: true }) === "author" && W.missingFor("node", { author: me, signedIn: false }) === "node"
   && W.missingFor("node", { author: null, signedIn: false }) === "author" && W.missingFor("node", { author: me, signedIn: true }) === null,
   "what is missing, in order: the author first, then the node's login");
ok(W.mySpaceUrl({ node: "https://em.localhost:8443/em/", signedIn: true }) === "https://em.localhost:8443/em/admin/"
   && W.mySpaceUrl({ node: "https://n", signedIn: false }) === null && W.mySpaceUrl({ node: "", signedIn: true }) === null,
   "«Il mio spazio sul nodo» = the node's console, only when signed in");
const th = W.themeToggle("auto", "dark");
ok(th.glyph === "☾" && th.next === "light" && th.following && !W.themeToggle("light", "light").following && W.themeToggle("light", "light").next === "dark",
   "the theme button: ☾ / ☀ the theme in force, a click the other one (explicit), «auto» follows the system");

// ── the bridge, with a simulated stat ───────────────────────────────────────
if (!existsSync(PY)) {
  console.log(`cloud-files: ${checks} page checks; no s3Dgraphy venv — bridge SKIPPED`);
  process.exit(fails.length ? 1 : 0);
}
const dir = realpathSync(mkdtempSync(`${tmpdir()}/cloud-files-`));
const fsroot = `${dir}/fs`;
for (const d of ["EM", "SB/versions"]) mkdirSync(`${fsroot}/${d}`, { recursive: true });
const SHA = (ch) => "sha256:" + ch.repeat(64);
const res = (id, url, sha, extra = {}) => ({ id, name: id, node_type: "resource", data: { url, checksum: sha, url_type: "3d_model", ...extra } });
const proc = (id, out, input, params) => [{ id, name: id, node_type: "dtc_process", data: { dtc_kind: "lod_generation", parameters: params, created_at: "2026-10-05T10:00:00Z" } },
  { id: `${id}_o`, source: id, target: out, edge_type: "dtc_had_output" }, { id: `${id}_i`, source: id, target: input, edge_type: "dtc_had_input" }];
const nodes = [], edges = [];
for (const n of ["podio", "ara"]) {
  const p = proc(`p_${n}`, `${n}.lod0`, n, { level: "lod0", use: ["heriverse", "aton"] });
  nodes.push({ id: `rm_${n}`, name: n, node_type: "representation_model" }, res(n, `../SB/${n}.glb`, SHA("0"), { tier: "master" }),
             res(`${n}.lod0`, `../SB/versions/${n}@lod0-aton-heriverse.glb`, SHA("1"), { use: ["heriverse", "aton"], size_bytes: 10,
               primitives: { triangles: 4321 } }), p[0]);
  edges.push({ id: `l_${n}`, source: `rm_${n}`, target: n, edge_type: "has_linked_resource" }, ...p.slice(1));
}
const doc = { active_graph_id: "g", graphs: { g: { nodes, edges } } };
const docOne = { header: { format: "em.json", version: "1.0" }, graph: { graph_id: "g", nodes, edges } };
const docPath = `${fsroot}/EM/T.em.json`;
writeFileSync(docPath, JSON.stringify(doc));
// the bytes are NOT the stamped ones: a file read would be «modified after its stamp»
writeFileSync(`${fsroot}/SB/versions/podio@lod0-aton-heriverse.glb`, "glTF podio — not the stamped bytes");
writeFileSync(`${fsroot}/SB/versions/ara@lod0-aton-heriverse.glb`, "glTF ara — not the stamped bytes either");

const port = await freePort();
const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`, PATH: "/usr/bin:/bin", HOME: dir,
              EM_BRIDGE_FAKE_CLOUD: "@lod0-aton-heriverse\\.glb$", EM_BRIDGE_FAKE_CLOUD_DELAY: "0.6" };
const bridge = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", fsroot], { env, stdio: ["ignore", "ignore", "inherit"] });
const B = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120; i++) { try { await fetch(`${B}/health`); break; } catch { await sleep(250); } }
const H = { "Content-Type": "application/json", Origin: "http://localhost:5173" };
const post = async (route, body) => {
  const r = await fetch(`${B}${route}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
const get = async (route) => (await fetch(`${B}${route}`, { headers: H })).json();
const until = async (token) => { for (let i = 0; i < 100; i++) { const j = await get(`/fs/hydrate?token=${token}`); if (j.state !== "running") return j; await sleep(150); } return null; };
const pod = (l) => l.assets.find((x) => x.id === "rm_podio").versions.find((v) => v.level === "lod0");
try {
  const h = await get("/health");
  ok(h.bridge_level >= 56, `the bridge is at level 56 (${h.bridge_level})`);
  const l1a = await post("/assets/list", { doc, doc_path: docPath });
  const l1 = l1a.j;
  if (!l1.ok) console.log("  · /assets/list:", l1a.status, JSON.stringify(l1).slice(0, 300));
  const v1 = pod(l1);
  ok(l1.ok && v1.in_cloud && v1.state === "in_cloud" && v1.cloud_paths?.[0]?.endsWith("podio@lod0-aton-heriverse.glb") && v1.cloud_bytes > 0,
     `a version in the cloud is said «in_cloud», with its place and bytes (${v1.cloud_bytes} B)`);
  ok(!v1.measured && v1.triangles === 4321 && !v1.modified_after_stamp,
     "never read: not measured (the graph's 4321 triangles), not hashed (its other bytes are not «modified after the stamp»)");
  ok(l1.counts.in_cloud === 2 && /nel cloud/.test(l1.say_it), `counted and said (${l1.say_it})`);
  const fsAns = await post("/files-state", { doc: docOne, folders: [`${fsroot}/EM`] });
  const fsState = fsAns.j;
  if (fsAns.status !== 200) console.log("  · /files-state:", fsAns.status, JSON.stringify(fsAns.j).slice(0, 300));
  const fr = (fsState.results ?? []).find((r) => r.id === "podio.lod0");
  ok(fr?.state === "in_cloud" && !fr.path && fsState.summary?.in_cloud === 2, `the Archive's resolver says it too (${fr?.state}, ${fsState.summary?.in_cloud} in the cloud)`);
  const vers = await get(`/optimize/versions?folder=${encodeURIComponent(`${fsroot}/SB/versions`)}`);
  ok(vers.ok && vers.versions.length === 2 && vers.versions.every((r) => r.in_cloud && r.triangles == null), "«Versioni su disco»: listed, not measured");
  // the plan: how many files and MB, nothing read
  const all = l1.assets.flatMap((a) => a.versions.flatMap((v) => v.cloud_paths ?? []));
  const plan = (await post("/fs/hydrate", { paths: [...all, "/etc/hosts"], plan: true })).j;
  ok(plan.ok && plan.n === 2 && plan.bytes > 50 && plan.outside === 1, `the plan: ${plan.n} files, ${plan.bytes} B, 1 outside the served folders refused`);
  // cancel: two files at 0.6 s each, cancelled after the first
  const go = (await post("/fs/hydrate", { paths: all })).j;
  ok(go.ok && go.token && go.n === 2, "«Scarica e misura» starts, by token");
  await sleep(250);
  const mid = await get(`/fs/hydrate?token=${go.token}`);
  ok(mid.state === "running" && mid.total === 2 && mid.bytes_total === plan.bytes, `its progress (${mid.n}/${mid.total}, ${mid.bytes}/${mid.bytes_total} B, ${mid.current})`);
  await post("/fs/hydrate", { cancel: go.token });
  const end = await until(go.token);
  ok(end?.state === "cancelled" && end.n < 2, `cancelled: ${end?.n} of 2 downloaded`);
  // the rest, to the end
  const go2 = (await post("/fs/hydrate", { paths: all })).j;
  const end2 = await until(go2.token);
  ok(go2.n === 2 - (end?.n ?? 0) && end2?.state === "done" && end2.n === go2.n, `the rest downloaded (${go2.n})`);
  const l2 = (await post("/assets/list", { doc, doc_path: docPath })).j;
  const v2 = pod(l2);
  ok(!v2.in_cloud && v2.state !== "in_cloud" && v2.modified_after_stamp && (l2.counts.in_cloud ?? 0) === 0,
     "downloaded: read now — hashed (modified after its stamp, said), no longer in the cloud");
  const again = (await post("/fs/hydrate", { paths: all, plan: true })).j;
  ok(again.n === 0, "nothing left to download");
  ok((await fetch(`${B}/fs/hydrate?token=nope`, { headers: H })).status === 404, "an unknown token: 404");
  ok((await fetch(`${B}/fs/hydrate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status === 403,
     "without an Origin: refused, as every /fs route");
} finally {
  bridge.kill();
}
console.log(`cloud-files: ${checks} checks${fails.length ? `, ${fails.length} FAILED` : " ✓"}`);
process.exit(fails.length ? 1 : 0);
