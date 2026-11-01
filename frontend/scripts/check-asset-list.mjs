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

// ── MICRO-ARCHIVE-ASSET-2 ──────────────────────────────────────────────────
// 1 · the coverage: «dentro la fascia» with bases missing is false
const covM = A.coverage(list, "mobile");
ok(covM.covered === 1 && covM.total === 3 && covM.missing.join() === "Column1,Column2", `mobile: ${covM.covered} / ${covM.total} covered`);
const nowM = A.sceneCount(list, "mobile");
ok(nowM.estimated === 2 && nowM.triangles === 80 + 20 + 5 && nowM.covered === 1,
   "the ones missing count their lightest version, as an estimate (said)");
ok(A.budgetWord(nowM, A.inBand(nowM, BANDS.mobile), BANDS.mobile) === "incomplete"
   && A.budgetWord(A.sceneCount(list, "web"), { ok: true }, BANDS.web) === "in"
   && A.budgetWord({ covered: 1, total: 1 }, { ok: true }, { ...BANDS.arch, scene_triangles: null, scene_download_mb: null, scene_gpu_mb: null }) === "none", "«incompleto» while one misses, else inside / outside / no band");
const qM = [{ id: "m1", label: "", state: "waiting", note: "", asset_id: "Column1", target: "mobile", tool: "decimate_bake", triangles: 10, texture: 512, ktx2: true }];
const aftM = A.sceneCount(list, "mobile", { queue: qM, after: true });
ok(aftM.covered === 2 && aftM.triangles === 10 + 20 + 5, `after the queue: the item counts its proposal (${aftM.covered} / ${aftM.total})`);
// 2 · the forms repeated: one mesh + N instances
const colG = (id, keys, comp = "") => asset(id, { family: "Col" }, [M(`${id}.m`), ver(`${id}.v0`, { triangles: 60, geometry_keys: keys, compression: comp,
  textures: [tex("AO", 1024), tex("N", 1024)], texture_side: 1024, checksum: `sha256:${id}` })], { web: cell("todo", `${id}.v0`) });
const shapesL = [colG("ColA1", ["g:1"]), colG("ColA2", ["g:1"]), colG("ColA3", ["g:1"]), colG("ColB1", ["g:2"]), colG("ColC1", ["g:9"], "draco"), colG("ColC2", ["g:8"], "draco")];
const shp = A.repeatedShapes(shapesL);
ok(shp.length === 2 && shp[0].assets.map((a) => a.id).join() === "ColA1,ColA2,ColA3" && shp[0].via === "geometry",
   `the same geometry keys and textures: one form ×3 (${shp.map((s) => `${s.via}×${s.assets.length}`).join(", ")})`);
ok(shp[1].via === "triangles" && shp[1].assets.length === 2, "compressed files: the same triangles and textures (said)");
const sp = A.shapeProposal(shp[0], "web", BANDS.web);
ok(sp.tool === "instance" && sp.triangles === 50 && sp.ktx2 && /3 istanze/.test(sp.why), `ONE proposal: ${sp.why}`);
ok(A.shapeProposal(shp[0], "arch", BANDS.arch).tool === "keep", "the archive keeps its masters");
const qS = [{ id: "s0", label: "", state: "waiting", note: "", asset_id: "ColA2", target: "web", tool: "decimate_bake", triangles: 50, texture: 512, ktx2: true, from: "list" }];
const si = A.shapeItemsFor(shp, new Set(["ColA1", "ColA2", "ColA3", "ColB1"]), ["web"], new Map(), BANDS);
ok(si.items.length === 1 && si.items[0].asset_ids.length === 3 && si.covered.get("web").size === 3, "«Metti in coda» with the copies all selected: ONE item for the form");
A.enqueue(qS, si.items);
ok(qS.length === 1 && qS[0].shape, "the form's item replaces its copies' items waiting");
const beforeS = A.sceneCount(shapesL, "web");
const aftS = A.sceneCount(shapesL, "web", { queue: qS, after: true });
ok(aftS.instances === 3 && aftS.triangles === 50 + 60 + 60 + 60 && beforeS.triangles === 60 * 6,
   `after: the mesh once + its instances (${beforeS.triangles} → ${aftS.triangles} tri, ${aftS.instances} instances)`);
// 6 · 8 · what a tool needs: an item that cannot start stays, with why
const have = { addons: new Set(["obj2tiles"]), blender: true, stamped: () => true };
ok(A.blockOf("ktx2", { kind: "files", path: "/p/a.glb" }, have)?.addon === "gltfpack"
   && A.blockOf("ktx2", { kind: "files", path: "/p/a.glb" }, { ...have, addons: new Set(["gltfpack"]), stamped: () => false })?.code === "unstamped"
   && A.blockOf("decimate_bake", { kind: "blend", path: "/p/a.blend" }, { ...have, blender: false })?.code === "blender"
   && A.blockOf("instance", { kind: "files", path: "/p/a.glb" }, have)?.code === "no_blend"
   && A.blockOf("decimate_bake", { kind: "blend", path: "/p/a.blend" }, have) === null, "blocked: gltfpack missing, the source not stamped, no Blender, no .blend");
const qB = [{ id: "b1", state: "waiting", label: "", note: "", block: { code: "addon", addon: "gltfpack" } }, { id: "b2", state: "waiting", label: "", note: "" }];
ok(A.nextToRun(qB, "run", { slots: 2, held: 0 }).id === "b2" && qB.length === 2, "a blocked item stays in the queue; the next one starts");
// 9 · the versions on disk of ONE asset
const dv = A.diskVersionsOf([{ name: "Column1.glb", entry: "/p/SB/versions/Column1.glb" }, { name: "Other@lod1.glb", entry: "/p/SB/versions/Other@lod1.glb" }],
  col1, (id) => id === "Column1.v0" ? "/p/SB/versions/Column1.glb" : "");
ok(dv.length === 1 && dv[0].version.id === "Column1.v0", "the versions on disk of this asset only, each with its version in the graph");

// ── MICRO-ARCHIVE-ASSET-3 ──────────────────────────────────────────────────
// 2 · a form and its copies never add up
{
  const shapes3 = A.repeatedShapes(shapesL);
  const cp = new Map();
  // an old plan of a copy (its own decimation) and «seleziona tutto»
  cp.set("ColA2", { web: { tool: "decimate_bake", triangles: 50, texture: 512, ktx2: true, why: "old" } });
  const all3 = new Set(shapesL.map((a) => a.id));
  A.applyProposal(cp, shapesL, all3, ["web"], { shapes: shapes3, bands: BANDS });
  ok(cp.get(`shape:${shapes3[0].key}`)?.web?.tool === "instance" && !cp.get("ColA2")?.web && !cp.get("ColA1")?.web,
     "«Applica»: the form's proposal once, its copies none (an old copy plan dropped)");
  const cov3 = A.shapeCover(shapes3, ["web"], cp, BANDS);
  ok(cov3.get("web").size === 5, `the copies covered by their forms (${cov3.get("web").size})`);
  const itAll = A.selectionItems(shapesL, shapes3, all3, ["web"], cp, BANDS);
  ok(itAll.length === 3 && itAll.filter((x) => x.shape).length === 2 && !itAll.some((x) => !x.shape && /^Col[AC]/.test(x.asset_id)),
     `select all → one item per form + the rows alone (${itAll.map((x) => x.shape ? `form×${x.asset_ids.length}` : x.asset_id).join(", ")})`);
  const itOne = A.selectionItems(shapesL, shapes3, new Set(["ColA2"]), ["web"], new Map(), BANDS);
  ok(itOne.length === 1 && itOne[0].shape === shapes3[0].key && itOne[0].asset_ids.length === 3, "ONE copy selected → the form's item (the instances), not the copy");
  const itGrp = A.selectionItems(shapesL, shapes3, new Set(shapes3[0].assets.map((a) => a.id)), ["web"], new Map(), BANDS);
  ok(itGrp.length === 1 && itGrp[0].shape, "the group selected → one item");
  // «una per una»: the copies go alone again
  const each = new Map([[`shape:${shapes3[0].key}`, { web: { tool: "keep", triangles: null, texture: null, ktx2: false, why: "una per una" } }]]);
  ok(A.selectionItems(shapesL, shapes3, new Set(["ColA1", "ColA2"]), ["web"], each, BANDS).filter((x) => !x.shape).length === 2, "«una per una»: then the copies go one by one");
  // the queue's safety net
  const q3 = [];
  A.enqueue(q3, itOne);
  A.enqueue(q3, A.itemsFor(shapesL, new Set(["ColA3"]), ["web"], new Map()));
  ok(q3.length === 1, "a copy queued alone behind its form waiting: kept out");
  q3[0].state = "running";
  A.enqueue(q3, A.selectionItems(shapesL, shapes3, new Set(["ColA1"]), ["web"], new Map(), BANDS));
  ok(q3.length === 1, "the same form again while it runs: not doubled");
  const src = (id, s) => ({ id, label: id, state: "waiting", note: "", asset_id: id, target: "web", tool: "gltfpack", from: "list", source: s });
  A.enqueue(q3, [src("X1", "files:/p/x.glb#"), src("X2", "files:/p/x.glb#")]);
  ok(q3.filter((x) => x.source === "files:/p/x.glb#").length === 1, "two items of the same source, target and tool: one");
  // the plan waiting for the queue: «Metti in coda (N)»
  const pp = new Map();
  A.setInBulk(pp, shapesL, new Set(["ColA1", "ColB1"]), ["web"], { triangles: 30 }, { shapes: shapes3, bands: BANDS });
  const pend = A.planItems(shapesL, shapes3, ["web"], pp, BANDS, []);
  ok(pend.length === 2 && pend.some((x) => x.shape && x.triangles === 30) && pend.some((x) => x.asset_id === "ColB1"),
     `«Imposta» then «Metti in coda (${pend.length})»: the form once, the row alone`);
  const aftP = A.sceneCount(shapesL, "web", { plan: pp, after: true, shapes: shapes3 });
  ok(aftP.instances === 3 && aftP.triangles === 30 + 30 + 60 + 60, `the budget counts the form's mesh once from the plan (${aftP.triangles} tri)`);
  // a form ALREADY one file for its copies (the instances made): the copies
  // stay covered — never their own decimation of a file that draws N instances
  const made = (id) => { const x = colG(id, ["g:1"]); x.versions.push(ver(`${id}.inst`, { triangles: 180, checksum: "sha256:INST",
    textures: [tex("AO", 1024), tex("N", 1024)], texture_side: 1024 })); x.targets.web = cell("todo", `${id}.inst`); return x; };
  const doneL = [made("ColA1"), made("ColA2"), made("ColA3")];
  const doneS = A.repeatedShapes(doneL);
  ok(A.shapeShared(doneS[0], "web") && A.shapeCovers(doneS[0], "web", BANDS.web, new Map())
     && A.selectionItems(doneL, doneS, new Set(["ColA1", "ColA2", "ColA3"]), ["web"], new Map(), BANDS).length === 0
     && A.applyProposal(new Map(), doneL, new Set(["ColA2"]), ["web"], { shapes: doneS, bands: BANDS }) === 0,
     "a form already instanced: its copies covered, no item, no proposal");
  A.unplan(pp, pend);
  ok(A.planItems(shapesL, shapes3, ["web"], pp, BANDS, []).length === 0, "queued: the plan empties, the button goes dark");
}
// 3 · 4 · a tileset covers its meshes; its row says it streams
{
  const tsV = ver("TS.t", { level: "lod0", level_say: "tileset · in streaming", tileset: true, triangles: null, measured: false,
                            tiles: { tiles: 10, read: 10, max_triangles: 9000, max_texture_side: 512 } });
  ok(A.levelSay(tsV) === "tileset · in streaming" && A.levelSay({ ...tsV, level_say: "lod0 · webXR" }) === "tileset · in streaming"
     && A.levelSay(ver("x", {})) === "lod0 · webXR", "a tileset's level: «tileset · in streaming», not «lod0»");
  const covered = asset("Tile9", { container: "Survey2015" }, [M("Tile9.m"), ver("Tile9.v0", { triangles: 60000 })],
    { web: { state: "na", loads: "Tile9.v0", why: "coperta dal tileset di Survey2015", covered_by: { id: "c", name: "Survey2015", version: "TS.t" },
             proposal: { tool: "keep", triangles: null, texture: null, ktx2: false, why: "coperta" } } });
  const listT = [col1, covered];
  ok(A.coverage(listT, "web").total === 1 && A.sceneCount(listT, "web").triangles === 80
     && A.itemsFor(listT, new Set(["Tile9"]), ["web"], new Map()).length === 0
     && A.applyProposal(new Map(), listT, new Set(["Tile9"]), ["web"]) === 0, "a mesh covered by the tileset: no proposal, out of the count");
  // MICRO-BLENDER-SIDECAR p.4a · Survey2015 → mobile: its tiles out of the
  // band, its master not here — no Obj2Tiles that can only fail in the queue
  const fit = { ok: false, known: true, tiles: 7295, read: 7295, over_triangles: 0, over_texture: 1877, max_triangles: 10145, max_texture_side: 768 };
  const retile = { state: "todo", loads: "S15.t", why: "le tile non rispettano la fascia: 1877 tile oltre 512 px", tiles: fit,
                   proposal: { tool: "tileset", triangles: 60000, texture: 512, ktx2: true, why: "rifai le tile nella fascia" } };
  const survey = (master) => ({ ...asset("Survey2015", {}, [M("S15.m"), { ...tsV, id: "S15.t" }], { mobile: structuredClone(retile) }),
    kind: "container", tileset_master: master });
  const SAY = (k, names) => k === "declare" ? "manca il master — dichiara il master" : `manca il master — ${names}`;
  const s1 = survey(null);
  const n1 = A.retileWithoutMaster({ assets: [s1] }, () => "", SAY);
  const c1 = s1.targets.mobile;
  ok(n1 === 1 && c1.proposal.tool === "keep" && c1.retile === "no_master" && c1.state === "todo"
     && /le tile non rispettano la fascia/.test(c1.why) && /manca il master/.test(c1.why) && /dichiara il master/.test(c1.proposal.why),
     "a tileset out of the band, no master here: the reason kept, «manca il master», no new tileset proposed");
  ok(A.itemsFor([s1], new Set(["Survey2015"]), ["mobile"], new Map()).length === 0
     && A.selectionItems([s1], [], new Set(["Survey2015"]), ["mobile"], new Map(), BANDS).length === 0,
     "…and «Applica e metti in coda» queues nothing for it");
  const s2 = survey({ declared: true, sources: [{ id: "x", name: "Survey2015_full.obj" }], unavailable: "", say_it: "" });
  A.retileWithoutMaster({ assets: [s2] }, () => "", SAY);
  ok(/Survey2015_full\.obj/.test(s2.targets.mobile.proposal.why), "a master declared but not here: named");
  const s3 = survey(null);
  s3.versions[0] = { ...s3.versions[0], url: "../SB/Survey2015_full.obj" };
  ok(A.retileWithoutMaster({ assets: [s3] }, (id) => id === "S15.m" ? "/p/SB/Survey2015_full.obj" : "", SAY) === 0
     && s3.targets.mobile.proposal.tool === "tileset", "its master here: re-tiling stays proposed");
  ok(A.blockOf("tileset", { kind: "none", path: "" }, have)?.code === "no_master"
     && A.blockOf("gltfpack", { kind: "none", path: "" }, have)?.code === "no_source",
     "a tileset asked by hand with nothing to start from: «manca il master», not «no file»");
}

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
  ok(h.bridge_level >= 57, `the bridge is at level 57 (${h.bridge_level})`);
  // MICRO-ARCHIVE-ASSET-2 · the progress of a list asked, by its token
  const prog = await (await fetch(`${B}/assets/progress?token=none`, { headers: H })).json();
  ok(prog.ok && prog.phase === "", "GET /assets/progress answers (nothing for an unknown token)");
  const a = (await post("/assets/list", { doc, doc_path: docPath, progress: "tk1" })).j;
  const prog2 = await (await fetch(`${B}/assets/progress?token=tk1`, { headers: H })).json();
  ok(prog2.phase === "done" && prog2.total === 1, `the progress said to the end (${prog2.phase} ${prog2.n}/${prog2.total})`);
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
    // MICRO-ARCHIVE-ASSET-2 on Templu Mare
    const tcov = A.coverage(tl.assets, "mobile");
    const tnow = A.sceneCount(tl.assets, "mobile");
    console.log(`  · mobile: ${tcov.covered} / ${tcov.total} covered, today ≈ ${tnow.triangles} tri (${tnow.estimated} estimated by their lightest)`);
    ok(tcov.covered < tcov.total && A.budgetWord(tnow, A.inBand(tnow, tl.targets.mobile.bands), tl.targets.mobile.bands) === "incomplete",
       `mobile is «incompleto» (${tcov.covered} / ${tcov.total}), not «dentro»`);
    const tsh = A.repeatedShapes(tl.assets);
    for (const s of tsh) console.log(`  · form ×${s.assets.length} (${s.via}, ${s.triangles} tri): ${s.assets.map((a) => a.name).join(" ")}`);
    const temp = tsh.find((s) => s.assets.some((a) => a.name === "Column_tempio1"));
    ok(tsh.length >= 3 && temp && temp.assets.filter((a) => /^Column_tempio\d$/.test(a.name)).length === 6 && temp.via === "geometry",
       `Templu Mare: ${tsh.length} forms repeated; Column_tempio1–6 one form`);
    ok(tsh.some((s) => s.assets.filter((a) => /^Column_shadow/.test(a.name)).length >= 10), "Column_shadow… gathered");
    const all = new Set(tsh.flatMap((s) => s.assets.map((a) => a.id)));
    for (const k of ["web", "mobile"]) {
      const it = A.shapeItemsFor(tsh, all, [k], new Map(), { [k]: tl.targets[k].bands });
      const b4 = A.sceneCount(tl.assets, k), af = A.sceneCount(tl.assets, k, { queue: A.enqueue([], it.items), after: true });
      console.log(`  · ${k}: instancing the ${tsh.length} forms (${all.size} assets, ${it.items.length} items): ${b4.triangles} → ${af.triangles} tri, ${(b4.download_bytes / 1048576).toFixed(1)} → ${(af.download_bytes / 1048576).toFixed(1)} MB, GPU ${(b4.gpu_bytes / 1048576).toFixed(1)} → ${(af.gpu_bytes / 1048576).toFixed(1)} MB, covered ${b4.covered} → ${af.covered} / ${af.total}`);
      ok(it.items.length === tsh.length && af.triangles < b4.triangles, `${k}: one item a form, the triangles fall`);
    }
    // MICRO-ARCHIVE-ASSET-3 on Templu Mare: the tileset read by its tiles,
    // its meshes covered; «seleziona tutto» → the queue fills in one gesture
    const cont = tl.assets.find((x) => x.kind === "container");
    const tv = cont.versions.find((v) => v.tileset);
    ok(tv.level_say === "tileset · in streaming" && tv.tiles?.tiles > 1000 && tv.tiles.read === tv.tiles.tiles,
       `the tileset says «${tv.level_say}», its ${tv.tiles?.tiles} tiles read by their heads (≤ ${tv.tiles?.max_triangles} tri, ≤ ${tv.tiles?.max_texture_side} px a tile)`);
    ok(cont.targets.web.state === "ok" && cont.targets.web.tiles?.known && cont.targets.mobile.state === "todo" && cont.targets.mobile.tiles?.over_texture > 0,
       `web «ok» (the tiles fit), mobile «da fare»: ${cont.targets.mobile.why}`);
    const sv = tl.assets.filter((x) => x.kind === "rm" && x.containers.some((c) => c.name === "Survey2015"));
    ok(sv.length === 10 && sv.every((x) => x.targets.web.covered_by?.name === "Survey2015" && x.targets.web.state === "na" && x.targets.web.proposal.tool === "keep")
       && sv.every((x) => !x.targets.mobile.covered_by && /il tileset di Survey2015 non la copre/.test(x.targets.mobile.why)),
       "the 10 meshes of Survey2015: covered by the tileset for the web, not for mobile (said why)");
    const wcov = A.coverage(tl.assets, "web");
    ok(wcov.total === 88 && tl.counts.covered_by_tileset?.web === 10, `web: ${wcov.covered} / ${wcov.total} (the 10 covered out of the count)`);
    const allT = new Set(tl.assets.map((x) => x.id));
    for (const k of ["mobile", "web"]) {
      const bk = { [k]: tl.targets[k].bands };
      const pl = new Map();
      const nowK = A.sceneCount(tl.assets, k);
      const applied = A.applyProposal(pl, tl.assets, allT, [k], { shapes: tsh, bands: bk });
      const planned = A.sceneCount(tl.assets, k, { plan: pl, after: true, shapes: tsh });
      const its = A.selectionItems(tl.assets, tsh, allT, [k], pl, bk);
      const qT = A.enqueue([], its);
      const copiesAlone = qT.filter((x) => !x.shape && tsh.some((s) => s.assets.some((a) => a.id === x.asset_id)));
      const shapeItems = qT.filter((x) => x.shape);
      const afterK = A.sceneCount(tl.assets, k, { queue: qT, after: true, shapes: tsh });
      console.log(`  · ${k} · seleziona tutto → «Applica e metti in coda»: ${applied} proposals, ${qT.length} items (${shapeItems.length} forms, ${qT.length - shapeItems.length} rows); `
        + `today ${nowK.triangles} tri ${(nowK.download_bytes / 1048576).toFixed(1)} MB GPU ${(nowK.gpu_bytes / 1048576).toFixed(1)} MB ${nowK.covered}/${nowK.total} → `
        + `after ${afterK.triangles} tri ${(afterK.download_bytes / 1048576).toFixed(1)} MB GPU ${(afterK.gpu_bytes / 1048576).toFixed(1)} MB ${afterK.covered}/${afterK.total} `
        + `(${A.budgetWord(afterK, A.inBand(afterK, tl.targets[k].bands), tl.targets[k].bands)})`);
      ok(shapeItems.length === tsh.length && copiesAlone.length === 0 && afterK.triangles === planned.triangles,
         `${k}: one item per form (${shapeItems.length}), no copy alone, the plan and the queue count the same`);
      ok(!qT.some((x) => sv.some((m) => m.id === x.asset_id)) || k === "mobile", `${k}: no item for a mesh the tileset covers`);
    }
    const sample = tl.assets.find((x) => x.name === "Column_tempio1").versions.find((v) => v.level === "lod0");
    ok(Array.isArray(sample.geometry_keys) && sample.geometry_keys.length === 1, `a version says its geometry keys (${sample.geometry_keys})`);
  }
} finally {
  bridge.kill();
}
console.log(`asset-list: ${checks} checks${fails.length ? `, ${fails.length} FAILED` : " ✓"}`);
process.exit(fails.length ? 1 : 0);
