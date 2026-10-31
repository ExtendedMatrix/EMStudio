// MICRO-ARCHIVE-ASSET · Archive › Asset (bridge level 53): the page's
// functions (asset-list.ts — the groups switched on the fly, the selection of
// a group, the search and the filters, the proposal edited and applied in
// bulk, the one queue Run / Pausa, the bars after the queue) and the bridge's
// POST /assets/list (s3Dgraphy's asset_list: versions and textures nested,
// state and proposal per target, the study's textures once, the totals).
//
//   node scripts/check-asset-list.mjs
//   TEMPLU=/tmp/archive-asset/T0 node scripts/check-asset-list.mjs   # + Templu Mare v6 (98 assets)
import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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

// ── the page's functions ────────────────────────────────────────────────────
const bundle = await esbuild.build({ entryPoints: [`${SRC}asset-list.ts`], bundle: true, format: "esm", write: false });
const A = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const band = (o, t) => ({ profile: "", label_it: "", object_triangles: o, object_texture_side: t, scene_triangles: 1000, scene_download_mb: 1, scene_gpu_mb: 1 });
const BANDS = { mobile: band(10, 512), web: band(50, 2048), desk: band(500, 4096), arch: band(null, null) };
const tex = (sha, side) => ({ key: sha, name: `T_${sha}`, sha256: sha, width: side, height: side, format: "jpeg", bytes: 1000, gpu_bytes: side * side * 4 });
const ver = (id, o) => ({ id, name: id, master: false, level: "lod0", lod_level: "lod0", level_say: "lod0 · webXR", use: ["heriverse"], url: `../SB/${id}.glb`,
  checksum: `sha256:${id}`, stamped: true, size_bytes: 100, triangles: 10, gpu_bytes: 1000, measured: true, texture_side: 1024, ktx2: false, tileset: false,
  textures: [], texture_count: 0, state: "on_disk", made: { by: [], orcid: "", at: "2026-10-05", tool: "", how: "" }, made_say: "x", modified_after_stamp: false,
  sha256_now: "", loaded_by: [], ...o });
const cell = (state, loads, tool = "decimate_bake") => ({ state, loads, why: state, proposal: { tool: state === "ok" ? "keep" : tool, triangles: 10, texture: 512, ktx2: true, why: "p" } });
const asset = (id, o, versions, targets) => ({ id, name: id, kind: "rm", containers: [{ id: "c", name: o.container ?? "Reconstruction" }], branch: o.branch ?? "SB",
  epochs: [o.epoch ?? "II A.D."], family: o.family ?? id.replace(/\d+$/, ""), status: "ok", versions, findings: [], loaded_why: "", loaded_say: "",
  audit: { versions: versions.length, stamped: versions.length, files_missing: [], unchecked: 0, modified_after_stamp: [], master_declared: null },
  targets: { mobile: cell("missing", ""), web: cell("ok", versions[1]?.id ?? ""), desk: cell("ok", versions[1]?.id ?? ""), arch: cell("ok", versions[0].id), ...targets } });
const M = (id) => ver(id, { master: true, level: "", level_say: "master", url: `blend://../SB/G.blend#Mesh/${id}`, triangles: null, gpu_bytes: null, measured: false });
const col1 = asset("Column1", {}, [M("Column1.m"), ver("Column1.v0", { triangles: 80, textures: [tex("S", 4096), tex("a", 1024)], texture_side: 4096 })],
                   { web: cell("todo", "Column1.v0") });
const col2 = asset("Column2", {}, [M("Column2.m"), ver("Column2.v0", { triangles: 20, textures: [tex("S", 4096), tex("b", 1024)], texture_side: 4096 })]);
const tile = asset("Tile1", { container: "Survey2015", branch: "RB", epoch: "XX sec", family: "Tile" }, [M("Tile1.m"), ver("Tile1.v0", { triangles: 5, textures: [tex("c", 512)], texture_side: 512 })],
                   { mobile: cell("ok", "Tile1.v0") });
const list = [col1, col2, tile];

ok(A.shownVersion(col1, "web").id === "Column1.v0" && A.shownVersion(col1, "mobile").id === "Column1.v0", "a row shows what the target loads, else the heaviest version");
ok(A.overBand(A.shownVersion(col1, "web"), BANDS.web).tri && A.overBand(A.shownVersion(col1, "web"), BANDS.web).tex, "over the band: triangles and texture (red)");
const gC = A.groupAssets(list, "container", "web");
ok(gC.map((g) => `${g.key}:${g.assets.length}`).join() === "Reconstruction:2,Survey2015:1", "grouped by container (default)");
ok(A.groupAssets(list, "branch", "web").map((g) => g.key).join() === "RB,SB", "by branch SB / RB");
ok(A.groupAssets(list, "epoch", "web").map((g) => g.key).join() === "II A.D.,XX sec", "by epoch");
ok(A.groupAssets(list, "family", "web").map((g) => g.key).join() === "Column,Tile", "by family of name");
ok(A.groupAssets(list, "status", "web").map((g) => g.key).join() === "todo,ok" && A.groupAssets(list, "status", "mobile")[0].key === "missing",
   "by state, from what blocks — switched on the fly with the target");
const sel = new Set();
A.toggleGroup(sel, gC[0], true);
ok(sel.size === 2 && A.groupChecked(sel, gC[0]) === "all" && A.groupChecked(sel, gC[1]) === "none", "the group's checkbox selects the group");
sel.delete("Column2");
ok(A.groupChecked(sel, gC[0]) === "some", "… and says a group half selected");
ok(A.visibleAssets(list, { query: "survey", filter: "all", targets: ["web"], bands: BANDS }).map((a) => a.id).join() === "Tile1", "search by container");
ok(A.visibleAssets(list, { query: "", filter: "todo", targets: ["web"], bands: BANDS }).length === 1
   && A.visibleAssets(list, { query: "", filter: "todo", targets: ["mobile", "web"], bands: BANDS }).length === 2, "filter «da fare», per the targets on");
ok(A.visibleAssets(list, { query: "", filter: "over", targets: ["web"], bands: BANDS }).map((a) => a.id).join() === "Column1,Column2"
   && A.visibleAssets(list, { query: "", filter: "over", targets: ["desk"], bands: BANDS }).length === 0, "filter «fuori banda» (triangles or texture, per the target)");
ok(A.sortAssets(list, "tri", true, "web").map((a) => a.id).join() === "Column1,Column2,Tile1", "sorted by a column");
// the proposal: edited on the row, applied in bulk, set by hand
const plan = new Map();
A.editProposal(plan, col1, "web", "triangles", "40");
ok(A.proposalOf(col1, "web", plan).triangles === 40 && A.proposalOf(col1, "web", plan).edited, "the proposal is editable on the row");
const sel2 = new Set(["Column1", "Column2", "Tile1"]);
const n = A.applyProposal(plan, list, sel2, ["mobile", "web"]);
ok(n === 2 && A.proposalOf(col1, "web", plan).triangles === 40 && A.proposalOf(col2, "mobile", plan).tool === "decimate_bake"
   && !plan.get("Tile1"), "«Applica la proposta»: where something is to do, the edits kept");
A.setInBulk(plan, list, new Set(["Column2"]), ["mobile"], { tool: "gltfpack", triangles: 8, texture: 256, ktx2: false });
ok(JSON.stringify(plan.get("Column2").mobile) === JSON.stringify({ tool: "gltfpack", triangles: 8, texture: 256, ktx2: false, why: "p" }), "«Imposta» by hand");
// the queue
const q = [];
const items = A.itemsFor(list, sel2, ["mobile", "web"], plan);
ok(items.length === 3 && items.every((i) => i.state === "waiting" && i.from === "list"), `«Metti in coda»: one per row and target to do (${items.length})`);
A.enqueue(q, items);
A.enqueue(q, A.itemsFor(list, new Set(["Column1"]), ["web"], plan));
ok(q.length === 3, "the same asset and target again: replaced, not doubled");
ok(A.nextToRun(q, "pause") === null && A.nextToRun(q, "run") === q[0], "Pausa: they pile up; Run: the first waiting starts");
q[0].state = "running";
ok(A.nextToRun(q, "run") === null, "one at a time: the next when its turn comes");
const third = q[2].id;
A.moveItem(q, third, -1);
ok(q[1].id === third, "↑ reorders the waiting ones");
A.removeItem(q, q[0].id);
ok(q.length === 3, "a running one is not removed");
A.removeItem(q, third);
ok(q.length === 2 && !q.some((x) => x.id === third), "«togli» a waiting one");
q[0].state = "done";
ok(A.clearEnded(q).length === 1, "the ended ones cleared");
// the bars: today and after the queue
const after = A.totalsAfter(list, "web", new Map(), []);
ok(after.triangles === 105 && after.gpu_bytes === (4096 * 4096 + 1024 * 1024 * 2 + 512 * 512) * 4, "today: the textures each once (the shared 4096 of two files once)");
ok(after.gpu_bytes < 2 * 4096 * 4096 * 4, "… the shared 4096 not counted twice");
const q2 = [{ id: "x", label: "", state: "waiting", note: "", asset_id: "Column1", target: "web", tool: "decimate_bake", triangles: 40, texture: 512, ktx2: true }];
const aft = A.totalsAfter(list, "web", new Map(), q2);
ok(aft.triangles === 40 + 20 + 5 && aft.gpu_bytes < after.gpu_bytes, `after the queue the bar moves (${after.triangles} → ${aft.triangles} tri)`);
ok(!A.inBand({ triangles: 2000, download_bytes: 0, gpu_bytes: 0 }, BANDS.web).ok && A.inBand({ triangles: 1, download_bytes: 0, gpu_bytes: 0 }, BANDS.arch).ok,
   "inside / outside the band (the archive has none)");
const st = A.texturesShown([{ sha256: "S", name: "S", names: ["S"], count: 2, assets: 2, gpu_bytes: 9, width: 4096, height: 4096, format: "jpeg", bytes: 1, uses: [] },
  { sha256: "a", name: "a", names: ["a"], count: 1, assets: 1, gpu_bytes: 99, width: 1024, height: 1024, format: "jpeg", bytes: 1, uses: [] }], "", "uses");
ok(st[0].sha256 === "S" && A.sharedCounts(st).get("S") === 2, "the textures view: by uses, «condivisa ×N»");
ok(A.sourceFor(col1, "gltfpack", (id) => id === "Column1.v0" ? "/p/SB/versions/Column1.glb" : "").path === "/p/SB/versions/Column1.glb"
   && A.sourceFor(col1, "decimate_bake", (id) => id === "Column1.m" ? "/p/SB/G.blend" : "/p/v.glb").kind === "blend"
   && A.sourceFor(col1, "decimate_bake", () => "").kind === "none", "the source of a tool: a glTF for gltfpack, the master's .blend for Blender's bake, nothing said");

// ── the bridge ──────────────────────────────────────────────────────────────
if (!existsSync(PY)) {
  console.log(`asset-list: ${checks} page checks; no s3Dgraphy venv — bridge SKIPPED`);
  process.exit(fails.length ? 1 : 0);
}
const dir = realpathSync(mkdtempSync(`${tmpdir()}/asset-list-`));
const fsroot = `${dir}/fs`;
for (const d of ["EM", "SB/versions"]) mkdirSync(`${fsroot}/${d}`, { recursive: true });
const SHA = (c) => "sha256:" + c.repeat(64);
const res = (id, url, sha, extra = {}) => ({ id, name: id, node_type: "resource", data: { url, checksum: sha, url_type: "3d_model", ...extra } });
const proc = (id, out, input, params, at) => [{ id, name: id, node_type: "dtc_process", data: { dtc_kind: "lod_generation", parameters: params, created_at: at } },
  { id: `${id}_o`, source: id, target: out, edge_type: "dtc_had_output" }, { id: `${id}_i`, source: id, target: input, edge_type: "dtc_had_input" }];
const p1 = proc("p1", "podio.lod0", "podio", { level: "lod0", use: ["heriverse", "aton"] }, "2026-10-05T10:00:00Z");
const doc = { active_graph_id: "g", graphs: { g: {
  nodes: [
    { id: "rm_podio", name: "Podio", node_type: "representation_model" },
    { id: "grp", name: "Survey", node_type: "RepresentationModelNodeGroup" },
    res("podio", "../SB/podio.glb", SHA("0"), { tier: "master" }),
    res("podio.lod0", "../SB/versions/podio@lod0-aton-heriverse.glb", SHA("1"), { use: ["heriverse", "aton"], size_bytes: 10 }),
    p1[0]],
  edges: [
    { id: "a", source: "rm_podio", target: "podio", edge_type: "has_linked_resource" },
    { id: "c", source: "rm_podio", target: "grp", edge_type: "is_in_representation_model_group" },
    ...p1.slice(1)] } } };
const docPath = `${fsroot}/EM/T.em.json`;
writeFileSync(docPath, JSON.stringify(doc));
writeFileSync(`${fsroot}/SB/versions/podio@lod0-aton-heriverse.glb`, "glTF podio");

const port = await freePort();
const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`, PATH: "/usr/bin:/bin", HOME: dir };
const fsRoots = [fsroot, ...(process.env.TEMPLU ? [process.env.TEMPLU] : [])];
const bridge = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), ...fsRoots.flatMap((r) => ["--fs-root", r])],
                     { env, stdio: ["ignore", "ignore", "inherit"] });
const B = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120; i++) { try { await fetch(`${B}/health`); break; } catch { await sleep(250); } }
const H = { "Content-Type": "application/json", Origin: "http://localhost:5173" };
const post = async (route, body) => {
  const r = await fetch(`${B}${route}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
try {
  const h = await (await fetch(`${B}/health`, { headers: H })).json();
  ok(h.bridge_level >= 53, `the bridge is at level 53 (${h.bridge_level})`);
  const a = (await post("/assets/list", { doc, doc_path: docPath })).j;
  const pod = a.assets?.find((x) => x.id === "rm_podio");
  ok(a.ok && a.counts.assets === 1 && pod.containers[0].name === "Survey" && pod.branch === "SB", `one asset, its container and branch (${a.say_it})`);
  ok(pod.versions.length === 2 && pod.versions[0].master && pod.versions[1].loaded_by.includes("web"), "versions nested, the one the web loads said");
  ok(pod.targets.mobile.state === "missing" && pod.targets.mobile.proposal.tool !== "keep", "mobile webXR: the base missing, a proposal");
  ok(pod.versions[1].modified_after_stamp && pod.audit.modified_after_stamp.length === 1, "the audit: a file modified after its stamp");
  ok(["mobile", "web", "desk", "arch"].every((k) => a.totals[k] && a.targets[k].bands), "the totals and the bands of the four targets");

  if (process.env.TEMPLU) {
    const tp = `${process.env.TEMPLU}/EM/TempluMare_v6_optimized.em.json`;
    const tdoc = JSON.parse(readFileSync(tp, "utf8"));
    let t0 = Date.now();
    const tl = (await post("/assets/list", { doc: tdoc, doc_path: tp })).j;
    const ms1 = Date.now() - t0;
    t0 = Date.now();
    await post("/assets/list", { doc: tdoc, doc_path: tp });
    const ms2 = Date.now() - t0;
    console.log(`  · Templu Mare (${ms1} ms, again ${ms2} ms): ${tl.say_it}`);
    for (const k of ["mobile", "web", "desk", "arch"]) {
      const x = tl.totals?.[k] ?? {};
      console.log(`  · ${k}: ${x.triangles} tri, ${Math.round(x.download_bytes / 1048576)} MB, ${Math.round(x.gpu_bytes / 1048576)} MB GPU, ${x.ok ? "inside" : "outside: " + x.over}`);
    }
    ok(tl.counts?.assets === 98 && tl.counts.rms === 97 && tl.counts.containers === 1, "Templu Mare: 98 assets (97 models, the Survey2015 tileset)");
    const groups = A.groupAssets(tl.assets, "container", "web");
    ok(groups.map((g) => `${g.key}:${g.assets.length}`).join() === "Reconstruction II AC:87,Survey2015:11", `grouped by container: ${groups.map((g) => `${g.key} ${g.assets.length}`).join(", ")}`);
    ok(A.groupAssets(tl.assets, "branch", "web").map((g) => g.key).join() === "RB,SB" && A.groupAssets(tl.assets, "family", "web").length > 10,
       "by branch and by family");
    const sh = tl.textures.filter((x) => x.count > 1);
    ok(tl.counts.shared_textures > 0 && sh[0].count >= 50, `shared textures: ${tl.counts.shared_textures}, the most used «${sh[0]?.name}» ×${sh[0]?.count}`);
    ok(tl.counts.measured > 150 && tl.totals.web.gpu_bytes < 1024 ** 3, `measured from the files (${tl.counts.measured}), the web's GPU with the shared ones once`);
    const tsel = new Set();
    A.toggleGroup(tsel, groups[1], true);
    ok(tsel.size === 11, "the group Survey2015 selected by its checkbox");
    const tplan = new Map();
    const napp = A.applyProposal(tplan, tl.assets, new Set(groups[0].assets.map((x) => x.id)), ["mobile"]);
    ok(napp === 87 && [...tplan.values()].every((r) => r.mobile && r.mobile.triangles === null || r.mobile.triangles <= 10000),
       `the proposal for mobile webXR on Reconstruction II AC: ${napp} rows, ≤ 10.000 triangles`);
    const tq = A.enqueue([], A.itemsFor(tl.assets, new Set(groups[0].assets.map((x) => x.id)), ["mobile"], tplan));
    const before = A.totalsAfter(tl.assets, "mobile", new Map(), []);
    const aft2 = A.totalsAfter(tl.assets, "mobile", new Map(), tq);
    ok(tq.length === 87 && A.nextToRun(tq, "pause") === null && A.nextToRun(tq, "run") === tq[0],
       `87 in the queue; Pausa holds them, Run starts the first (mobile ${before.triangles} → ${aft2.triangles} tri after)`);
    ok(tl.assets.find((x) => x.kind === "container").targets.arch.state === "todo", "the audit: the tileset's master to declare");
  }
} finally {
  bridge.kill();
}
console.log(`asset-list: ${checks} checks${fails.length ? `, ${fails.length} FAILED` : " ✓"}`);
process.exit(fails.length ? 1 : 0);
