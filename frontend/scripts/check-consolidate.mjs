// MICRO-BLEND-OFFICINA-3 · «Consolida per…» and «Componi un .blend dal
// grafo», EMStudio's half (bridge level 51): the page's functions
// (consolidate.ts) and the bridge's routes — POST /consolidate (s3Dgraphy's
// consolidate: the floor mobile webXR, the best for the platform, opportune,
// sufficient, presence), /graph/compose-plan (compose_from_graph: working
// profiles only), POST /jobs {kind: blender, op: compose_graph} (Blender
// FAKED: scripts/fake-blender.py), /graph/before-after («Aggiorna»),
// /graph/tileset-whole (the tileset as the level «Intero», asked when two
// documents).
//
//   node scripts/check-consolidate.mjs
//   TEMPLU=/tmp/officina3/B2 node scripts/check-consolidate.mjs   # + the numbers of a Templu Mare copy
import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
const bundle = await esbuild.build({ entryPoints: [`${SRC}consolidate.ts`], bundle: true, format: "esm", write: false });
const C = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const SHA0 = "sha256:" + "a".repeat(64);
const row = (status, findings) => ({ id: "x", name: "x", kind: "rm", base: null, best: null, loaded: null, findings, presence: [], status });
const F = (level, code, action) => ({ level, code, say_it: code, action });
const rows = [row("ok", []), row("necessary", [F("necessary", "no_base", { kind: "prepare", profile: "mobile_webxr" }),
  F("recommended", "no_best", { kind: "prepare", profile: "webxr" }), F("opportune", "not_ktx2", { kind: "prepare", profile: "mobile_webxr" }),
  F("presence", "best_upload", { kind: "upload", resource_id: "r" })])];
ok(C.rowsShown(rows, true).length === 1 && C.rowsShown(rows, false).length === 2, "only what has something to do");
ok(C.rowsShown(rows, false, "presence").length === 1, "by level");
ok(JSON.stringify(C.rowActions(rows[1]).map((a) => a.kind + ":" + (a.finding.action.profile ?? ""))) ===
   JSON.stringify(["prepare:mobile_webxr", "prepare:webxr", "upload:"]), "one button per action, two «Prepara» for two profiles");
ok(C.presetForProfile("mobile_webxr") === "mobile" && C.presetForProfile("webxr") === "heriverse"
   && C.presetForProfile("webxr", "web") === "web", "«Prepara» opens Ottimizza with the profile's preset");
ok(C.prepareSource({ url: "blend://../SB/G.blend#Mesh/Arch", path: "/p/SB/G.blend" }, [{ url: "v.glb", path: "/p/v.glb" }]).from === "version",
   "a master in a .blend: Ottimizza starts from a version it reads");
ok(C.prepareSource({ url: "blend://../SB/G.blend#Mesh/Arch%201", path: "/p/SB/G.blend" }, []).block === "Arch 1", "else the .blend's block");
ok(C.versionLine({ level: "lod3", size_bytes: 3.7 * 1048576, triangles: 53364 }) === "lod3 · 3,7 MB · 53.364 tri", "a version in one line");
ok(JSON.stringify(C.statesOf([{ id: "a", state: "on_disk" }, { id: "", state: "x" }])) === '{"a":"on_disk"}', "the Archive's states");
const ups = C.updateRows([{ name: "Col", state: "newer", here: { made_say: "a" }, latest: { level: "manual-2026-10-31", made_say: "b" },
                            action: { kind: "update", resource_id: "v2" }, say_it: "s" },
                          { name: "Ok", state: "aligned", here: null, latest: null, action: {}, say_it: "" }], () => "/p/v2.glb");
ok(ups.length === 1 && ups[0].action === "update_version" && !ups[0].tick && ups[0].file === "/p/v2.glb", "«Aggiorna»: a row, not ticked");
const store = { nodes: new Map([["D01", {}], ["grp", {}], ["ts", {}], ["old", {}]]), edges: new Set(["old_has_linked_resource_ts"]), undo: 0,
  batch(fn) { this.undo++; fn(); }, node(id) { return this.nodes.get(id); }, addNode(n) { this.nodes.set(n.id, n); },
  deleteNode(id) { this.nodes.delete(id); }, hasEdge(id) { return this.edges.has(id); }, deleteEdge(id) { this.edges.delete(id); },
  addEdge(s, t, ty, a, id) { this.edges.add(id); } };
const got = C.applyWholeDelta(store, { nodes_added: [], nodes_removed: ["old"], edges_removed: ["old_has_linked_resource_ts"],
  edges_added: [{ id: "grp_h_ts", source: "grp", target: "ts", edge_type: "has_linked_resource" },
                { id: "D01_h_ts", source: "D01", target: "ts", edge_type: "has_linked_resource" },
                { id: "x", source: "nope", target: "ts", edge_type: "has_linked_resource" }] });
ok(store.undo === 1 && got.added === 2 && got.removed === 2 && got.skipped[0] === "x", "the tileset's delta in one undo step");
// MICRO-CONSOLIDA-2 · the radar, the other levels, why the web loads it, the new gestures
const baM = [{ name: "Col", state: "modified", here: { level: "lod0" }, latest: null, others: [],
               action: { kind: "register_new_version", resource_id: "v0", checksum_now: SHA0 }, say_it: "modificata dopo il timbro" },
             { name: "Ok", state: "aligned", here: { level: "lod0" }, latest: null,
               others: [{ level: "lod1", level_say: "lod1 · mobile webXR" }], action: {}, say_it: "" }];
const mod = C.modifiedRows(baM);
ok(mod.length === 1 && mod[0].resource_id === "v0" && mod[0].checksum_now === SHA0, "«Registra come nuova versione» for a file modified after its stamp");
ok(C.othersLine(baM[1]) === "lod1 · mobile webXR" && C.othersLine(baM[0]) === "", "another level: said, not an update");
ok(C.updateRows(baM).length === 0, "neither is an «Aggiorna»");
ok(C.whyKey({ loaded_why: "lightest" }) === "cons.why.lightest" && C.whyKey({}) === "", "why the web loads it");
const rr = row("opportune", [F("opportune", "modified_after_stamp", { kind: "register_new_version", resource_id: "a" }),
  F("opportune", "modified_after_stamp", { kind: "register_new_version", resource_id: "b" }),
  F("opportune", "tileset_master", { kind: "declare_master", tileset_id: "t", container_id: "g" })]);
ok(JSON.stringify(C.rowActions(rr).map((a) => a.kind)) === JSON.stringify(["register_new_version", "register_new_version", "declare_master"]),
   "one «Registra» per version, «Dichiara il master…»");

// ── the bridge ──────────────────────────────────────────────────────────────
if (!existsSync(PY)) {
  console.log(`consolidate: ${checks} page checks; no s3Dgraphy venv — bridge SKIPPED`);
  process.exit(fails.length ? 1 : 0);
}
const dir = realpathSync(mkdtempSync(`${tmpdir()}/consolidate-`));
const fsroot = `${dir}/fs`;
for (const d of ["EM", "SB/versions", "RB/cesium/T"]) mkdirSync(`${fsroot}/${d}`, { recursive: true });
const fake = `${dir}/Blender`;
copyFileSync(new URL("./fake-blender.py", import.meta.url).pathname, fake);
chmodSync(fake, 0o755);
writeFileSync(`${fsroot}/SB/versions/podio@lod0-aton-heriverse.glb`, "glTF podio");
const SHA = (c) => "sha256:" + c.repeat(64);
const res = (id, url, sha, extra = {}) => ({ id, name: id, node_type: "resource", data: { url, checksum: sha, url_type: "3d_model", ...extra } });
const proc = (id, out, input, params, at) => [{ id, name: id, node_type: "dtc_process", data: { dtc_kind: "lod_generation", parameters: params, created_at: at } },
  { id: `${id}_o`, source: id, target: out, edge_type: "dtc_had_output" }, { id: `${id}_i`, source: id, target: input, edge_type: "dtc_had_input" }];
const p1 = proc("p1", "podio.lod0", "podio", { level: "lod0", use: ["heriverse", "aton"] }, "2026-10-05T10:00:00Z");
const p2 = proc("p2", "muro.lod0", "muro", { level: "lod0", use: ["heriverse"] }, "2026-10-01T10:00:00Z");
const p3 = proc("p3", "muro.manual", "muro", { level: "manual-2026-10-31", use: ["realtime"] }, "2026-10-31T09:00:00Z");
const doc = { active_graph_id: "g", graphs: { g: {
  nodes: [
    { id: "rm_podio", name: "Podio", node_type: "representation_model" },
    { id: "rm_muro", name: "Muro", node_type: "representation_model" },
    { id: "grp", name: "Survey", node_type: "RepresentationModelNodeGroup" },
    { id: "D01", name: "D.01", node_type: "document" }, { id: "D02", name: "D.02", node_type: "document" },
    res("podio", "../SB/podio.glb", SHA("0"), { tier: "master" }),
    res("podio.lod0", "../SB/versions/podio@lod0-aton-heriverse.glb", SHA("1"), { use: ["heriverse", "aton"], size_bytes: 10 }),
    res("muro", "../SB/muro.glb", SHA("3"), { tier: "master" }),
    res("muro.lod0", "../SB/versions/muro@lod0.glb", SHA("4"), { use: ["heriverse"] }),
    res("muro.manual", "../SB/versions/muro@manual-2026-10-31.glb", SHA("5"), { use: ["realtime"] }),
    res("tiles", "../RB/cesium/T/tileset.json", SHA("6"), { tier: "master" }),
    p1[0], p2[0], p3[0]],
  edges: [
    { id: "a", source: "rm_podio", target: "podio", edge_type: "has_linked_resource" },
    { id: "b", source: "rm_muro", target: "muro", edge_type: "has_linked_resource" },
    { id: "c", source: "rm_podio", target: "grp", edge_type: "is_in_representation_model_group" },
    { id: "d", source: "rm_muro", target: "grp", edge_type: "is_in_representation_model_group" },
    { id: "e", source: "D01", target: "rm_podio", edge_type: "has_representation_model" },
    { id: "f", source: "D01", target: "rm_muro", edge_type: "has_representation_model" },
    ...p1.slice(1), ...p2.slice(1), ...p3.slice(1)] } } };
const docPath = `${fsroot}/EM/T.em.json`;
writeFileSync(docPath, JSON.stringify(doc));

const port = await freePort();
const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`,
              PATH: "/usr/bin:/bin", HOME: dir, EM_BLENDER: fake };
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
const until = async (id, ms = 60000) => {
  const t0 = Date.now();
  let v = {};
  while (Date.now() - t0 < ms) {
    v = await (await fetch(`${B}/jobs?id=${id}`, { headers: H })).json();
    if (!["queued", "running"].includes(v.state)) return v;
    await sleep(150);
  }
  return v;
};
try {
  const h = await (await fetch(`${B}/health`, { headers: H })).json();
  ok(h.bridge_level >= 52, `the bridge is at level 52 (${h.bridge_level})`);
  const c = (await post("/consolidate", { doc, doc_path: docPath, platform: "heriverse" })).j;
  const by = Object.fromEntries((c.rows ?? []).map((r) => [r.id, r]));
  ok(c.ok && c.counts?.rms === 2 && c.counts?.without_base === 2, `two RMs, none with the base (${c.say_it})`);
  ok(by.rm_podio?.best?.id === "podio.lod0" && by.rm_podio.findings[0].action.profile === "mobile_webxr",
     "podio: the version for Heriverse, «Prepara» the base with mobile webXR");
  ok(c.resolved_here === true && by.rm_podio.presence[0].action === "disk", "out of a room: the disk's road (states asked here)");
  const cr = (await post("/consolidate", { doc, doc_path: docPath, platform: "aton", in_room: true,
                                           states: { "podio.lod0": "on_disk", "muro.lod0": "both" } })).j;
  ok(cr.counts?.to_upload === 1 && cr.rows.find((r) => r.id === "rm_podio").presence[0].action === "upload", "in a room: what is only here → «Carica nella stanza»");
  const refused = (await post("/graph/compose-plan", { doc, doc_path: docPath, profile: "webxr" })).j;
  ok(refused.ok && refused.plan.ok === false && refused.plan.go === "consolidate", "a publication profile goes to «Consolida per…»");
  const plan = (await post("/graph/compose-plan", { doc, doc_path: docPath, profile: "modelling" })).j;
  ok(plan.ok && plan.plan.items.length === 1 && plan.plan.items[0].source.how === "import" && plan.out.endsWith("T_modelling.blend"),
     `modelling from the disk: ${plan.plan?.say_it} → ${plan.out?.split("/").pop()}`);
  ok(plan.plan.items[0].tags.em_rm_node_id === "rm_podio" && plan.plan.items[0].tags.em_asset_sha256 === SHA("1"), "the graph's tags");
  const job = (await post("/jobs", { kind: "blender", op: "compose_graph", plan: plan.plan, out: plan.out })).j;
  const done = await until(job.job);
  ok(done.state === "done" && existsSync(plan.out) && readFileSync(plan.out, "utf8").includes("rm_podio"),
     `composed in an empty Blender (${done.state}: ${JSON.stringify(done.result?.result ?? done.error ?? "")})`);
  const again = (await post("/jobs", { kind: "blender", op: "compose_graph", plan: plan.plan, out: plan.out }));
  ok(again.status === 400, "never over a file");
  const roomPlan = (await post("/graph/compose-plan", { doc, doc_path: docPath, profile: "modelling", in_room: true,
                                                        resolved: [{ id: "muro.manual", state: "on_node", path: "" },
                                                                   { id: "podio.lod0", state: "on_disk", path: `${fsroot}/SB/versions/podio@lod0-aton-heriverse.glb` }] })).j;
  ok(roomPlan.plan.fetch.length === 1 && roomPlan.plan.fetch[0].to.includes("/em_cache/files/"), "from the room: fetched by sha256 into em_cache/files");
  const noRoom = await post("/jobs", { kind: "blender", op: "compose_graph", plan: roomPlan.plan, out: `${fsroot}/EM/R.blend` });
  ok(noRoom.status === 400, "a plan that fetches wants the room");
  const ba = (await post("/graph/before-after", { doc, doc_path: docPath, objects: [
    { name: "Muro", props: { em_rm_node_id: "rm_muro", em_version_id: "muro.lod0", em_asset_id: "muro" } },
    { name: "Podio", props: { em_rm_node_id: "rm_podio", em_version_id: "podio.lod0" } }, { name: "Lamp", props: {} }] })).j;
  const m = ba.rows?.find((r) => r.name === "Muro");
  // MICRO-CONSOLIDA-2 · the version by hand for desktop realtime is ANOTHER level of the lod0 for Heriverse
  ok(ba.rows?.length === 2 && m.state === "aligned" && m.others?.[0]?.id === "muro.manual" && m.others[0].made_say.includes("2026-10-31 09:00"),
     `before/after: another level is another version, not an update (${m?.say_it})`);
  // podio's file on disk is not the bytes stamped (SHA("1")): modified after its stamp
  const pm = ba.rows?.find((r) => r.name === "Podio");
  ok(pm?.state === "modified" && pm.action.kind === "register_new_version" && ba.counts.modified === 1,
     `before/after: a file modified after its stamp (${pm?.say_it})`);
  const cm = (await post("/consolidate", { doc, doc_path: docPath, platform: "heriverse" })).j;
  const cpod = cm.rows.find((r) => r.id === "rm_podio");
  ok(cpod.findings.some((f) => f.code === "modified_after_stamp" && f.action.checksum_now?.startsWith("sha256:")),
     "Consolida says it too, with today's sha256");
  ok(typeof cpod.loaded_why === "string" && cpod.loaded_why !== "", `why the web loads it (${cpod.loaded_why})`);
  const rn = (await post("/graph/register-new-version", { doc, doc_path: docPath, resource_id: "podio.lod0" })).j;
  ok(rn.ok && rn.level === "lod0" && rn.revises === "podio.lod0" && rn.delta.nodes_added.some((n) => n.id === rn.version_id)
     && rn.delta.edges_added.some((e) => e.edge_type === "was_revision_of" || e.target === "podio.lod0"),
     `«Registra come nuova versione»: a revision at lod0, as a delta (${rn.version_id})`);
  const doc3 = JSON.parse(JSON.stringify(doc));
  doc3.graphs.g.edges.push({ id: "grp_t", source: "grp", target: "tiles", edge_type: "has_linked_resource" });
  const tq = (await post("/graph/tileset-master", { doc: doc3, tileset_id: "tiles", container_id: "grp" })).j;
  ok(tq.ok && tq.master.declared === false && tq.candidates.map((c) => c.id).sort().join() === "muro,podio",
     "«Dichiara il master…»: the container's meshes offered");
  const td = (await post("/graph/tileset-master", { doc: doc3, tileset_id: "tiles", container_id: "grp", sources: ["podio", "muro"] })).j;
  ok(td.ok && td.declared && td.master.sources.length === 2 && td.delta.nodes_added.some((n) => n.data?.dtc_kind === "tiling"),
     `the master declared as a tiling step (${td.said})`);
  const tu = (await post("/graph/tileset-master", { doc: doc3, tileset_id: "tiles", unavailable: "perdute" })).j;
  ok(tu.ok && !tu.declared && tu.delta.nodes_changed.some((n) => n.id === "tiles" && n.data.master_unavailable === "perdute"),
     "«non disponibile»: the note in the graph, as a delta");
  const ct = (await post("/consolidate", { doc: doc3, doc_path: docPath, platform: "heriverse", models: ["grp"] })).j;
  ok(ct.rows?.[0]?.findings.some((f) => f.code === "tileset_master" && f.action.kind === "declare_master"),
     "a container of a tileset alone: «opportuno: dichiara il master»");
  const w = (await post("/graph/tileset-whole", { doc, tileset_id: "tiles", container_id: "grp" })).j;
  ok(w.ok && w.document === "D01" && w.delta.edges_added.length === 2, `the tileset under D.01 (${w.said})`);
  const doc2 = JSON.parse(JSON.stringify(doc));
  doc2.graphs.g.edges.push({ id: "g2", source: "D02", target: "rm_podio", edge_type: "has_representation_model" });
  const asked = (await post("/graph/tileset-whole", { doc: doc2, tileset_id: "tiles", container_id: "grp" })).j;
  ok(asked.document === null && asked.ask.map((d) => d.id).join() === "D01,D02", "two documents: asked");
  const chosen = (await post("/graph/tileset-whole", { doc: doc2, tileset_id: "tiles", container_id: "grp", document_id: "D02" })).j;
  ok(chosen.document === "D02", "then the one chosen");

  if (process.env.TEMPLU) {
    const tp = `${process.env.TEMPLU}/EM/TempluMare_v6_optimized.em.json`;
    const tdoc = JSON.parse(readFileSync(tp, "utf8"));
    const t0 = Date.now();
    const tc = (await post("/consolidate", { doc: tdoc, doc_path: tp, platform: "heriverse" })).j;
    console.log(`  · Templu Mare (${Date.now() - t0} ms): ${tc.say_it}`);
    console.log(`  · ${tc.totals?.platform?.say_it}`);
    console.log(`  · ${tc.totals?.floor?.say_it}`);
    ok(tc.counts?.rms === 97 && tc.counts?.with_base === 1 && tc.counts?.without_base === 96, "Templu Mare: 97 RMs, 1 with the base, 96 without");
    const tp0 = tc.totals?.platform ?? {};
    console.log(`  · best everywhere: ${tc.totals?.best_everywhere?.say_it}`);
    ok(tp0.measured >= 90 && tp0.shared_textures > 0 && tp0.gpu_bytes < 1024 ** 3,
       `Templu Mare: measured, shared textures once, ${Math.round(tp0.gpu_bytes / 1048576)} MB of GPU`);
    ok(tc.counts?.loaded?.lightest > 0 && tc.counts?.tileset_master === 1, "Templu Mare: light by default, the tileset's master asked");
    const tpl = (await post("/graph/compose-plan", { doc: tdoc, doc_path: tp, profile: "modelling" })).j;
    console.log(`  · compose from the graph: ${tpl.plan?.say_it} → ${tpl.out}`);
    ok(tpl.plan?.items.length === 98, "Templu Mare: 97 models + the Survey2015 tileset");
    const tw = (await post("/graph/tileset-whole", { doc: tdoc, tileset_id: "templu-mare.rb.tileset.master",
                                                    container_id: tdoc.graphs[tdoc.active_graph_id].nodes.find((n) => n.name === "Survey2015").id })).j;
    ok(tw.document && tdoc.graphs[tdoc.active_graph_id].nodes.find((n) => n.id === tw.document).name === "D.01", `Templu Mare: ${tw.said}`);
  }
} finally {
  bridge.kill();
}
console.log(`consolidate: ${checks} checks${fails.length ? `, ${fails.length} FAILED` : " ✓"}`);
process.exit(fails.length ? 1 : 0);
