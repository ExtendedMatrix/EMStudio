// MICRO-CODA-VISTA p.1 · a version registered on the WRONG asset (E.D., 1 Nov
// 2026: «Porta2_BAKE_SM_Porta2_BAKE@lod0-mobile.glb registered in the graph as
// a version of Tempio_4_BAKE_SM_Tempio_4_BAKE»). version-misplaced.ts finds
// them in a graph; «Correggi» moves them (or removes them).
//
//   node scripts/check-version-misplaced.mjs
//   TEMPLU=/tmp/…/T0 node scripts/check-version-misplaced.mjs   # + the race replayed on Templu Mare v6 through a real bridge
import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
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
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

const bundle = await esbuild.build({ entryPoints: [`${SRC}version-misplaced.ts`], bundle: true, format: "esm", write: false });
const V = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

ok(JSON.stringify(V.blendBlock("blend://../SB/G.blend#Mesh/Porta2_BAKE_SM_Porta2_BAKE")) === JSON.stringify({ file: "../SB/G.blend", block: "Porta2_BAKE_SM_Porta2_BAKE" })
   && V.blendBlock("blend://../SB/G.blend/Obj")?.block === "Obj" && V.blendBlock("../x.glb") === null, "the object of a master inside a .blend");
ok(V.fileModel("../SB/versions/Porta2_BAKE_SM_Porta2_BAKE@lod0-mobile.glb") === "Porta2_BAKE_SM_Porta2_BAKE" && V.fileModel("a.glb") === "", "the object a file was made from");

// ── the race, as a graph: Porta2's file on Tempio_4 (and on Tempio_4.001 as
// a copy of its form), Tempio_4's own file a revision of it; a form done right
const nodes = [], edges = [];
const M = (id, block) => nodes.push({ id, name: `${block} (reconstruction)`, node_type: "resource", data: { url: `blend://../SB/G.blend#Mesh/${block}` } });
const Vn = (id, file, ck) => nodes.push({ id, name: id, node_type: "resource", data: { url: `../SB/versions/${file}`, checksum: ck } });
const P = (id, master, version, params) => {
  nodes.push({ id, name: id, node_type: "process", data: { dtc_kind: "lod_generation", parameters: params } });
  edges.push({ source: id, target: master, edge_type: "dtc_had_input" }, { source: id, target: version, edge_type: "dtc_had_output" });
};
M("porta2", "Porta2_BAKE_SM_Porta2_BAKE"); M("porta2b", "Porta2_BAKE.001_SM_Porta2_BAKE.001");
M("tempio4", "Tempio_4_BAKE_SM_Tempio_4_BAKE"); M("tempio4b", "Tempio_4_BAKE.001_SM_Tempio_4_BAKE.001");
M("col1", "Column_tempio1"); M("col2", "Column_tempio2");
Vn("t4.aton", "Tempio_4_BAKE_SM_Tempio_4_BAKE@lod0-aton-heriverse.glb", "sha256:A"); P("p.aton", "tempio4", "t4.aton", { level: "lod0" });
Vn("wrong", "Porta2_BAKE_SM_Porta2_BAKE@lod0-mobile.glb", "sha256:P2"); P("p.wrong", "tempio4", "wrong", { level: "lod0", model: "Porta2_BAKE_SM_Porta2_BAKE", profile: "mobile_webxr" });
edges.push({ source: "wrong", target: "t4.aton", edge_type: "was_revision_of" });
Vn("wrongCopy", "Porta2_BAKE_SM_Porta2_BAKE@lod0-mobile.glb", "sha256:P2"); P("p.wrongCopy", "tempio4b", "wrongCopy", { level: "lod0", model: "Porta2_BAKE_SM_Porta2_BAKE", shared_mesh: true, instances: 2 });
Vn("t4.own", "Tempio_4_BAKE_SM_Tempio_4_BAKE@lod0-mobile.glb", "sha256:T4"); P("p.own", "tempio4", "t4.own", { level: "lod0", model: "Tempio_4_BAKE_SM_Tempio_4_BAKE" });
edges.push({ source: "t4.own", target: "wrong", edge_type: "was_revision_of" });
Vn("c1", "Column_tempio1@lod1-mobile.glb", "sha256:C"); P("p.c1", "col1", "c1", { level: "lod1", model: "Column_tempio1" });
Vn("c2", "Column_tempio1@lod1-mobile.glb", "sha256:C"); P("p.c2", "col2", "c2", { level: "lod1", model: "Column_tempio1", shared_mesh: true });
Vn("gl", "Column_tempio2_lod1.glb", "sha256:G"); P("p.gl", "col2", "gl", { level: "lod2" });

const found = V.findMisplaced(nodes, edges);
console.log(found.map((m) => `  · ${m.action} ${m.name} on ${m.on_id} (model ${m.model}${m.right_id ? ` → ${m.right_id}` : ""})`).join("\n"));
ok(found.length === 2, `two versions on the wrong asset (${found.map((m) => m.version_id).join(", ")})`);
const w = found.find((m) => m.version_id === "wrong");
ok(w?.action === "move" && w.right_id === "porta2" && w.on_id === "tempio4" && w.process_id === "p.wrong", "Porta2's file on Tempio_4: moved to Porta2");
const wc = found.find((m) => m.version_id === "wrongCopy");
ok(wc?.action === "remove" && wc.shared, "the same file on Tempio_4.001 as a copy of a wrong form: removed");
ok(!found.some((m) => ["t4.own", "t4.aton", "c1", "c2", "gl"].includes(m.version_id)),
   "right ones untouched: Tempio_4's own file, its aton version, a form's copies (shared), a gltfpack version (no object)");
const orphan = V.findMisplaced([...nodes, { id: "x", node_type: "resource", data: { url: "../SB/versions/Ghost@lod0-web.glb", checksum: "sha256:X" } },
  { id: "p.x", node_type: "process", data: { dtc_kind: "lod_generation", parameters: { level: "lod0", model: "Ghost" } } }],
  [...edges, { source: "p.x", target: "col1", edge_type: "dtc_had_input" }, { source: "p.x", target: "x", edge_type: "dtc_had_output" }]);
ok(orphan.find((m) => m.version_id === "x")?.action === "remove", "made from a datablock not in this graph: removed");
// EM Tools' own pipeline names a file after the OBJECT, says no model: never judged
const oldOnes = V.findMisplaced([{ id: "m", node_type: "resource", data: { url: "blend://../SB/G.blend#Mesh/ME_Column_temple.001" } },
  { id: "v", node_type: "resource", data: { url: "../SB/versions/Column_tempio1@lod0-aton-heriverse.glb" } },
  { id: "p", node_type: "process", data: { dtc_kind: "lod_generation", parameters: { level: "lod0", tool: "EM Tools · Prepare for a use" } } }],
  [{ source: "p", target: "m", edge_type: "dtc_had_input" }, { source: "p", target: "v", edge_type: "dtc_had_output" }]);
ok(oldOnes.length === 0, "a version without a model (named after the object, the url says the mesh): not judged");

// ── the race replayed on Templu Mare v6 through a real bridge ───────────────
const TEMPLU = process.env.TEMPLU;
if (TEMPLU && existsSync(`${TEMPLU}/EM/TempluMare_v6_optimized.em.json`) && existsSync(PY)) {
  const port = await freePort();
  const dir = realpathSync(mkdtempSync(`${tmpdir()}/misplaced-`));
  const bridge = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", TEMPLU],
    { env: { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state` }, stdio: ["ignore", "ignore", "ignore"] });
  const B = `http://127.0.0.1:${port}`;
  const post = async (route, body) => { const r = await fetch(`${B}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    for (let i = 0; i < 160; i++) { try { await fetch(`${B}/health`); break; } catch { await sleep(250); } }
    const raw = JSON.parse(readFileSync(`${TEMPLU}/EM/TempluMare_v6_optimized.em.json`, "utf8"));
    const doc = raw;
    const g0 = Object.values(raw.graphs)[0];
    const G = (d) => Object.values(d.graphs)[0];
    const id = (block) => g0.nodes.find((n) => String(n.data?.url ?? "").endsWith(`#Mesh/${block}`))?.id;
    const P2 = "Porta2_BAKE_SM_Porta2_BAKE", P2b = "Porta2_BAKE.001_SM_Porta2_BAKE.001", T4 = "Tempio_4_BAKE_SM_Tempio_4_BAKE", T4b = "Tempio_4_BAKE.001_SM_Tempio_4_BAKE.001";
    const em = `${TEMPLU}/EM/TempluMare_v6_optimized.em.json`;
    const add = async (master, file, sha, params) => {
      const r = await post("/graph/add-version", { doc, source: "", em_json: em, master_id: master, locator: `../SB/versions/${file}`, sha256: sha, bytes: 1000,
        level: "lod0", destination: "mobile_webxr", use: ["mobile_ar"], parameters: params, technique: "prepare_for_use", tool: "EM Tools · Prepare for a use" });
      for (const n of r.j.nodes ?? []) g0.nodes.push(n);
      for (const e of r.j.edges ?? []) g0.edges.push(e);
      return r.j;
    };
    // what the page did on 1 Nov: Porta2's form ended while Tempio_4's context held the .blend
    const a1 = await add(id(T4), `${P2}@lod0-mobile.glb`, "sha256:e9f8476518dfe06004e415de7bc88f2dcd54307fa111f6ab0667518880e25ab6", { profile: "mobile_webxr", model: P2, level: "lod0" });
    const a2 = await add(id(T4b), `${P2}@lod0-mobile.glb`, "sha256:e9f8476518dfe06004e415de7bc88f2dcd54307fa111f6ab0667518880e25ab6", { profile: "mobile_webxr", model: P2, level: "lod0", shared_mesh: true, instances: 2 });
    const a3 = await add(id(T4), `${T4}@lod0-mobile.glb`, "sha256:4444", { profile: "mobile_webxr", model: T4, level: "lod0" });
    if (!(a1.registered && a2.registered && a3.registered)) console.log(JSON.stringify([a1, a2, a3].map((x) => ({ r: x.registered, why: x.reason ?? x.error, rev: x.revises }))));
    ok(a1.registered && a2.registered && a3.registered && a3.revises, `the race replayed: Porta2's file on Tempio_4 (a revision of its lod0), on Tempio_4.001, Tempio_4's own a revision of it`);
    const fm = V.findMisplaced(g0.nodes, g0.edges);
    console.log(fm.map((m) => `  · ${m.action}: ${m.file.split("/").pop()} on ${m.on_name}${m.right_name ? ` → ${m.right_name}` : ""}`).join("\n"));
    ok(fm.length === 2 && fm.some((m) => m.action === "move" && m.right_id === id(P2) && m.on_id === id(T4)) && fm.some((m) => m.action === "remove" && m.on_id === id(T4b)),
       "found in the Templu graph: move Porta2's file to Porta2, remove it from Tempio_4.001");
    // «Correggi» as the page does it: the graph without them, then the move (and the form's copy)
    const drop = new Set(fm.flatMap((m) => [m.version_id, m.process_id]));
    const clone = JSON.parse(JSON.stringify(doc));
    G(clone).nodes = G(clone).nodes.filter((n) => !drop.has(n.id));
    G(clone).edges = G(clone).edges.filter((e) => !drop.has(e.source) && !drop.has(e.target));
    const mv = fm.find((m) => m.action === "move");
    const r1 = await post("/graph/add-version", { doc: clone, source: "", em_json: em, master_id: mv.right_id, locator: mv.file, sha256: mv.checksum, bytes: 1000,
      level: "lod0", destination: "mobile_webxr", use: ["mobile_ar"], parameters: { profile: "mobile_webxr", model: P2 }, technique: "prepare_for_use", tool: "EM Tools · Prepare for a use" });
    for (const n of r1.j.nodes ?? []) G(clone).nodes.push(n);
    for (const e of r1.j.edges ?? []) G(clone).edges.push(e);
    const r2 = await post("/graph/add-version", { doc: clone, source: "", em_json: em, master_id: id(P2b), locator: mv.file, sha256: mv.checksum, bytes: 1000,
      level: "lod0", destination: "mobile_webxr", use: ["mobile_ar"], parameters: { profile: "mobile_webxr", model: P2, shared_mesh: true, instances: 2 }, technique: "prepare_for_use", tool: "EM Tools · Prepare for a use" });
    for (const n of r2.j.nodes ?? []) G(clone).nodes.push(n);
    for (const e of r2.j.edges ?? []) G(clone).edges.push(e);
    ok(r1.j.registered && r2.j.registered, "moved: on Porta2, and on Porta2.001 as the copy of its form");
    const after = V.findMisplaced(G(clone).nodes, G(clone).edges);
    ok(after.length === 0, `after «Correggi» nothing is on the wrong asset (${after.length})`);
    const ownStill = G(clone).nodes.find((n) => String(n.data?.url ?? "").endsWith(`${T4}@lod0-mobile.glb`));
    const revEdge = G(clone).edges.some((e) => e.source === ownStill?.id && e.edge_type === "was_revision_of");
    ok(!!ownStill && !revEdge, "Tempio_4 keeps its own file, no longer a revision of Porta2's");
  } finally { bridge.kill(); }
} else console.log("  · TEMPLU not set (or no s3Dgraphy venv): the race on Templu Mare is not replayed");

console.log(`version-misplaced: ${checks} checks${fails.length ? `, ${fails.length} FAILED` : " ✓"}`);
process.exit(fails.length ? 1 : 0);
