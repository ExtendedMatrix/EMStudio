// MICRO-BLEND-OFFICINA-1 · the .blend as a folder, the bridge's side (level 48):
// `POST /jobs {kind: blender, op: inventory}` — EM Tools reads the .blend
// headless, the bridge answers s3Dgraphy's inventory, tree, the session rule
// and, with the document, «Check against the graph»; `GET /blend/session`
// — open in a Blender? unsaved changes? who may save (measured on Blender
// 5.2: a .blend open elsewhere is read as SAVED and a second save is never
// allowed); `POST /jobs {op: blend_apply}` — refused while a Blender has it
// open (409, route session), asked to be confirmed, then saved; `POST
// /blend/open` — a .blend already open is not opened twice.
//
//   node scripts/check-blend-folder-bridge.mjs
//
// Blender is FAKED (scripts/fake-blender.py answers `inventory` as EM Tools'
// collect answers on Templu Mare).
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { hostname, tmpdir } from "node:os";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
if (!existsSync(PY)) {
  console.log("blend folder bridge: no s3Dgraphy checkout with its venv — SKIPPED");
  process.exit(0);
}

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); else console.log(`  ✓ ${what}`); };
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
  const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = realpathSync(mkdtempSync(`${tmpdir()}/blend-folder-`));
const fsroot = `${dir}/fs`;
mkdirSync(`${fsroot}/SB`, { recursive: true });
mkdirSync(`${fsroot}/EM`, { recursive: true });
const fake = `${dir}/Blender`;
copyFileSync(new URL("./fake-blender.py", import.meta.url).pathname, fake);
chmodSync(fake, 0o755);
const blend = `${fsroot}/SB/GreatTemple.blend`;
writeFileSync(blend, "BLENDER-v502 fake");
const docPath = `${fsroot}/EM/T.em.json`;
const doc = { active_graph_id: "g", graphs: { g: {
  nodes: [
    { id: "Architrave_model", name: "Architrave", node_type: "representation_model" },
    { id: "arch.master", name: "arch", node_type: "resource",
      data: { url: "../SB/Reconstruction/master/Architrave.gltf", checksum: "sha256:abc", tier: "master", url_type: "3d_model" } },
    { id: "su001", name: "SU001", node_type: "US" }],
  edges: [{ id: "e1", source: "Architrave_model", target: "arch.master", edge_type: "has_linked_resource" }] } } };
writeFileSync(docPath, JSON.stringify(doc));

const port = await freePort();
const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`,
              PATH: "/usr/bin:/bin", HOME: dir, EM_BLENDER: fake };
const proc = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", fsroot],
                   { env, stdio: ["ignore", "ignore", "inherit"] });
const B = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120; i++) { try { await fetch(`${B}/health`); break; } catch { await sleep(250); } }
const H = { "Content-Type": "application/json", Origin: "http://localhost:5173" };
const post = async (route, body) => {
  const r = await fetch(`${B}${route}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
const get = async (route) => { const r = await fetch(`${B}${route}`, { headers: H });
  return { status: r.status, j: await r.json().catch(() => ({})) }; };
const until = async (id, ms = 60000) => {
  const t0 = Date.now();
  let v = {};
  while (Date.now() - t0 < ms) {
    v = (await get(`/jobs?id=${id}`)).j;
    if (!["queued", "running"].includes(v.state)) return v;
    await sleep(150);
  }
  return v;
};
// the presence a Blender with its interface writes (EM Tools' blend_officina)
const sessionFile = (p) => `${dir}/.stratigraph/blender-sessions/${createHash("sha1").update(realpathSync(p)).digest("hex").slice(0, 16)}.json`;
const present = (dirty, pid = process.pid) => {
  mkdirSync(`${dir}/.stratigraph/blender-sessions`, { recursive: true });
  writeFileSync(sessionFile(blend), JSON.stringify({ blend: realpathSync(blend), dirty, pid, host: hostname(),
                                                     at: Date.now() / 1000, blender: "5.2.0" }));
};

try {
  const h = (await get("/health")).j;
  ok(h.bridge_level >= 48, `the bridge is at level 48 (${h.bridge_level})`);

  // ── the .blend as a folder, checked against the document
  let r = await post("/jobs", { kind: "blender", op: "inventory", blend, doc, doc_path: docPath });
  ok(r.status === 202 && r.j.session?.route === "background", "inventory: a job, nobody has the .blend open");
  let v = await until(r.j.job);
  ok(v.state === "done" && !v.heavy, "…a LIGHT job, done");
  const inv = v.result?.inventory ?? {};
  ok(inv.counts?.objects === 5 && inv.counts?.libraries_missing === 1, "the inventory: 5 objects, the RB library missing");
  ok(inv.objects?.find((o) => o.name === "ME_PODIO")?.source_rel === "../RB/TM.blend", "an RB mesh: its file, relative");
  ok(!("graswald" in (inv.objects?.find((o) => o.name === "Architrave")?.props ?? {})), "old add-ons' properties ignored");
  ok(v.result?.tree?.some((n) => n.kind === "library" && n.name === "TM.blend"), "the tree carries the libraries");
  const chk = v.result?.check ?? {};
  const row = (k) => chk.rows?.find((x) => x.key === k);
  ok(row("object:Architrave")?.state === "missing", "the master on disk is not there → ✗ (the disk is the source)");
  ok(row("object:ME_PODIO")?.state === "only_here" || row("object:ME_PODIO")?.state === "missing", "a linked mesh is checked too");
  ok(row("object:Deco")?.sign === "○", "an object only in the .blend: ○");
  ok(row("library:TM.blend")?.state === "missing", "the missing library: ✗");
  ok(chk.nodes?.Architrave_model === "missing", "the dot of the Outliner by node id");

  // ── who may save: a Blender with its interface has it open, unsaved
  present(true);
  let s = (await get(`/blend/session?path=${encodeURIComponent(blend)}`)).j;
  ok(s.ok && s.route === "session" && s.dirty && !s.save, "/blend/session: open in Blender, unsaved, no second save");
  r = await post("/jobs", { kind: "blender", op: "blend_apply", blend, confirm: true,
                            rows: [{ name: "t.jpg", action: "unpack_texture" }] });
  ok(r.status === 409 && r.j.route === "session", "apply while it is open: refused (409), sent to that Blender");
  // its Blender ended (a pid that does not live)
  present(false, 999999);
  s = (await get(`/blend/session?path=${encodeURIComponent(blend)}`)).j;
  ok(s.route === "background" && s.save, "its Blender ended: a background Blender may save");
  r = await post("/jobs", { kind: "blender", op: "blend_apply", blend, rows: [{ name: "t.jpg", action: "unpack_texture" }] });
  ok(r.status === 409 && r.j.route === "confirm", "…after a confirmation");
  const before = readFileSync(blend, "utf8");
  r = await post("/jobs", { kind: "blender", op: "blend_apply", blend, confirm: true, doc, doc_path: docPath,
                            rows: [{ name: "t.jpg", action: "unpack_texture" }, { name: "Architrave", action: "export_master" }] });
  ok(r.status === 202, "confirmed: the background job starts");
  v = await until(r.j.job);
  const res = v.result?.result ?? {};
  ok(v.state === "done" && v.heavy && res.saved && readFileSync(blend, "utf8") !== before, "…heavy, applied and saved");
  // MICRO-BLEND-OFFICINA-2 (point 4) · the graph's actions are done in the
  // background too, on a COPY of the graph beside the em.json, and the delta
  // comes back for EMStudio to apply in one undo step
  ok(!res.refused?.length && res.done?.includes("Architrave: export_master"), "export as master: done in the background now");
  ok(res.em_folder === `${fsroot}/EM`, "the graph's relative urls start from the em.json's folder");
  ok(res.em_json?.startsWith(`${fsroot}/EM/.emstudio-officina-`), `the copy of the graph sits beside the em.json (${res.em_json})`);
  ok(!existsSync(res.em_json ?? "/nope"), "…and is gone after the job");
  ok(JSON.parse(readFileSync(docPath, "utf8")).graphs.g.nodes.length === 3, "the em.json open in EMStudio is never written");
  ok(res.delta?.nodes_added?.[0]?.id === "res.Architrave" && res.delta?.edges_added?.length === 1, "the delta: the master's node and its edge");

  // ── level 50: a working .blend for a profile
  ok(h.bridge_level >= 50, `the bridge is at level 50 (${h.bridge_level})`);
  r = await post("/blend/compose-plan", { blend, inventory: inv, profile: "webxr", how: "link" });
  ok(r.status === 200 && r.j.ok, "/blend/compose-plan answers");
  const plan = r.j.plan ?? {};
  ok(r.j.out === `${fsroot}/SB/GreatTemple_webxr.blend`, `the default path, beside the .blend (${r.j.out})`);
  ok(plan.skipped?.some((x) => x.name === "GT16.SU001"), "a proxy is not needed by webXR");
  ok(plan.sources?.length === 1 && plan.sources[0].file === blend && plan.sources[0].objects.includes("Architrave"), "the objects from the file that holds them");
  ok((r.j.profiles ?? []).includes("modelling"), "the profiles, «modelling» among them");
  writeFileSync(`${fsroot}/SB/GreatTemple_modelling.blend`, "taken");
  r = await post("/blend/compose-plan", { blend, inventory: inv, profile: "modelling", how: "append", only_needed: false });
  ok(r.j.out === `${fsroot}/SB/GreatTemple_modelling-2.blend` && r.j.plan?.how === "append", "never over a file: -2");
  ok(r.j.plan?.missing?.some((x) => x.name === "ME_PODIO"), "everything: the RB mesh whose library is missing is said");
  r = await post("/blend/compose-plan", { blend, profile: "webxr" });
  ok(r.status === 400, "no inventory: refused with why");
  r = await post("/jobs", { kind: "blender", op: "compose", blend, plan, out: `${fsroot}/SB/GreatTemple.blend` });
  ok(r.status === 400, "compose over an existing file: refused");
  r = await post("/jobs", { kind: "blender", op: "compose", blend, plan, out: `${fsroot}/SB/GreatTemple_webxr.blend` });
  ok(r.status === 202, "compose: a job");
  v = await until(r.j.job);
  ok(v.state === "done" && v.heavy && v.result?.result?.out === `${fsroot}/SB/GreatTemple_webxr.blend`
     && existsSync(`${fsroot}/SB/GreatTemple_webxr.blend`), "…composed in an empty Blender, written where asked");

  // ── D5: where a master goes
  mkdirSync(`${fsroot}/SB/Podio`, { recursive: true });
  r = await post("/blend/master-place", { doc_path: docPath, container: "podio", blend });
  ok(r.j.ok && r.j.rule === "container" && r.j.folder === `${fsroot}/SB/Podio/master`, `a container with a folder: its master/ (${r.j.folder})`);
  r = await post("/blend/master-place", { doc_path: docPath, container: "Reconstruction II AC", blend });
  ok(r.j.rule === "fallback" && r.j.folder === `${fsroot}/EM/_master/Reconstruction II AC`, `no folder: _master/ beside the em.json (${r.j.folder})`);
  r = await post("/blend/master-place", { doc_path: docPath, container: "SB", registered: `${fsroot}/else` });
  ok(r.j.rule === "registered" && r.j.folder === `${fsroot}/else`, "a registered master is respected");

  // ── open in Blender: not twice
  present(false);
  r = await post("/blend/open", { blend, doc_path: docPath });
  ok(r.status === 200 && r.j.already === true, "/blend/open: a .blend already open is not opened twice");
} finally {
  proc.kill();
}
console.log(`\nblend folder bridge: ${checks - fails.length}/${checks}`);
if (fails.length) {
  console.log("FAILED:\n  " + fails.join("\n  "));
  process.exit(1);
}
