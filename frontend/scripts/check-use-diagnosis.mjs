// MICRO-PREPARA-DIAGNOSI (E.D., 30 Oct 2026) · a model prepared for a use, seen
// from EMStudio: the page's module (src/use-diagnosis.ts: how the numbers are
// said) and the bridge at level 46 — `GET /optimize/profiles` (s3Dgraphy's
// table), `POST /optimize/diagnose` (glTF files read without Blender, or a
// .blend measured by EM Tools; the estimate for the rows ticked), `GET
// /optimize/versions` and `POST /optimize/versions/remove` (a dry run that
// names the files and the nodes of the document, then the files deleted), and
// `POST /jobs {kind: blender, op: measure | apply_use}` with a FAKE Blender
// (scripts/fake-blender.py).
//
//   node scripts/check-use-diagnosis.mjs
import * as esbuild from "esbuild";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); else console.log(`  ✓ ${what}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
  const p = s.address().port; s.close(() => res(p)); }); });

// ── the page's module ────────────────────────────────────────────────────────
const bundle = await esbuild.build({ entryPoints: [`${SRC}use-diagnosis.ts`], bundle: true, format: "esm", write: false });
const U = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
ok(U.effectLine({ triangles: 0, triangles_stored: -586000, draw_calls: -11, download_bytes: -23 * 1048576, gpu_bytes: 0 })
   === "−586,000 tris stored · −23.0 MB download · −11 draw calls", "an effect said, signed");
ok(U.effectLine({}) === "—", "…nothing: a dash");
const D = { improvements: [
  { id: "instances:a", kind: "instances", checked: true, available: true },
  { id: "decimate:a", kind: "decimate", checked: true, available: true },
  { id: "textures:ktx2", kind: "texture_format", checked: false, available: false },
  { id: "packaging", kind: "packaging", checked: true, available: true }] };
ok(JSON.stringify(U.checkedIds(D, new Map())) === JSON.stringify(["instances:a", "decimate:a"]), "the rows' own ticks (the packaging is not a tick)");
const off = U.checkedIds(D, new Map([["decimate:a", false], ["textures:ktx2", true]]));
ok(JSON.stringify(off) === JSON.stringify(["instances:a"]), "the person's ticks win; a row that cannot be applied stays off");
ok(U.levelFor(D, off) === "lod0" && U.levelFor(D, ["decimate:a"]) === "lod1", "lod1 when decimated, else lod0");
ok(U.removalLines([{ name: "M@lod0-web.glb", files: ["a", "b"], bytes: 2 * 1048576, nodes: [{ id: "x", name: "M lod0 for Web" }] }])
   .join("|") === "M@lod0-web.glb: 2 file(s), 2.0 MB|   graph: M lod0 for Web", "the removal's warning: files and nodes");
ok(U.versionsOf([{ model: "Colonnato" }, { model: "Other" }, { model: "Colonnato+3" }], ["Colonnato"]).length === 2,
   "the versions of a model (and of a selection named after it)");

// MICRO-PREPARA-RITOCCHI · the grid by group, the parameters, E.D.'s names
const G = { improvements: [
  { id: "instances:a", kind: "instances", group: "instances", checked: true, available: true },
  { id: "instances:b", kind: "instances", group: "instances", checked: true, available: true },
  { id: "textures:a", kind: "textures", group: "textures", checked: true, available: true, params: { side: 512, format: "jpeg" } },
  { id: "decimate:a", kind: "decimate", group: "decimate", checked: false, available: true, params: { triangles_to: 10000 } },
  { id: "tileset", kind: "tileset", group: "tileset", checked: false, available: true, separate: true },
  { id: "packaging", kind: "packaging", group: "packaging", checked: true, available: true }],
  groups: [{ id: "instances", rows: ["instances:a", "instances:b"] }, { id: "textures", rows: ["textures:a"] },
           { id: "decimate", rows: ["decimate:a"] }, { id: "tileset", rows: ["tileset"] }] };
const gt = new Map();
ok(U.groupTicked(G, "instances", gt) && !U.groupTicked(G, "decimate", gt), "a group is ticked when all its rows are (decimation proposed unticked)");
gt.set("instances:b", false);
ok(!U.groupTicked(G, "instances", gt), "…one row off: the group is off");
U.tickGroup(G, "decimate", true, gt);
ok(gt.get("decimate:a") === true && U.groupTicked(G, "decimate", gt), "the group's tick moves its rows");
ok(!U.checkedIds(G, gt).includes("tileset") && !U.checkedIds(G, gt).includes("packaging"),
   "the tileset is an action of its own: never one of the version's ticks");
ok(JSON.stringify(U.paramsFor(G, new Map([["decimate:a", { triangles_to: 4000 }], ["instances:a", { side: 1 }]])))
   === JSON.stringify({ "decimate:a": { triangles_to: 4000 } }), "the parameters sent: the person's edits over the row's, only rows with parameters");
ok(U.rowsOf(G, "instances").length === 2 && U.groupsOf({ improvements: G.improvements }).map((g) => g.id).join() === "instances,textures,decimate,tileset",
   "the groups (derived from the rows for an older bridge)");
const P = { id: "webxr", label: "webXR", label_it: "webXR", hint: "ATON / Heriverse", purpose: "the browser", purpose_it: "il browser" };
ok(U.profileWords(P, "it").purpose === "il browser" && U.profileWords(P, "en").purpose === "the browser"
   && U.profileWords({ ...P, label_it: "anteprima/catalogo", label: "Preview / catalogue" }, "it").label === "anteprima/catalogo",
   "E.D.'s names in Italian, the table's English in any other language");

// p.4 · Settings › Add-ons: what each is for you, recommended or optional
const adv = await esbuild.build({ entryPoints: [`${SRC}addon-advice.ts`], bundle: true, format: "esm", write: false });
const A = await import("data:text/javascript;base64," + Buffer.from(adv.outputFiles[0].text).toString("base64"));
const L = [{ id: "gltfpack", name: "gltfpack", available: true, installed: null, serves: { actions: ["variants"], profiles: [] } },
           { id: "obj2tiles", name: "Obj2Tiles", available: true, installed: null, serves: { actions: ["tileset"], profiles: [] } },
           { id: "tiles-validator", name: "3d-tiles-validator", available: true, installed: null, serves: { actions: ["tileset"], profiles: [] } },
           { id: "node", name: "Node.js", available: true, installed: null, system_node: null, serves: { actions: ["tileset"], profiles: [], for: ["tiles-validator"] } }];
let ad = A.adviseAddons(L, { variants: true, tileset: false, blender: false });
ok(ad.map((x) => x.code).join() === "recommended,optional,optional,optional" && A.enoughFor(L, ad).join() === "gltfpack",
   "the tileset switch off: gltfpack is enough, the others optional");
ad = A.adviseAddons(L, { variants: true, tileset: true, blender: false });
ok(ad.map((x) => x.code).join() === "recommended,recommended,recommended,recommended", "the tileset on: Obj2Tiles, the validator and Node recommended");
ad = A.adviseAddons(L.map((x) => x.id === "node" ? { ...x, system_node: "v26.0.0" } : x), { variants: true, tileset: true, blender: false });
ok(ad.find((x) => x.id === "node")?.code === "not_needed" && ad.find((x) => x.id === "node")?.because === "v26.0.0",
   "…but a Node of this machine makes EMStudio's not needed");
ok(A.adviseAddons([{ ...L[1], fit: { ok: false } }], { variants: true, tileset: true, blender: false })[0].code === "not_here",
   "an add-on that does not run here says so");

// ── the bridge ──────────────────────────────────────────────────────────────
if (!existsSync(PY)) {
  console.log("use diagnosis: no s3Dgraphy checkout with its venv — bridge part SKIPPED");
} else {
  const dir = realpathSync(mkdtempSync(`${tmpdir()}/use-diag-`));
  const fsroot = `${dir}/fs`;
  mkdirSync(`${fsroot}/SB/versions`, { recursive: true });
  writeFileSync(`${fsroot}/SB/scene.blend`, "BLENDER-v502 fake");
  // two glb of three copies each (s3Dgraphy's test writer)
  const mk = spawnSync(PY, ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(S3D + "tests")}); import test_use_profiles as T
T.write_glb(sys.argv[1]); T.write_glb(sys.argv[2])
open(sys.argv[1] + ".stamp.json", "w").write("{}")`, `${fsroot}/SB/versions/A@lod0-web.glb`, `${fsroot}/SB/versions/B@lod1-aton-heriverse.glb`],
    { env: { ...process.env, PYTHONPATH: `${S3D}src` }, encoding: "utf8" });
  ok(mk.status === 0, `two glTF written for the check ${mk.stderr ?? ""}`);
  const fake = `${dir}/Blender`;
  copyFileSync(new URL("./fake-blender.py", import.meta.url).pathname, fake);
  chmodSync(fake, 0o755);
  const port = await freePort();
  const proc = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", fsroot],
    { env: { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`, PATH: "/usr/bin:/bin",
             EM_BLENDER: fake, HOME: dir }, stdio: ["ignore", "ignore", "inherit"] });
  const B = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { await fetch(`${B}/health`); break; } catch { await sleep(250); } }
  const H = { "Content-Type": "application/json", Origin: "http://localhost:5173" };
  const get = async (r) => { const x = await fetch(`${B}${r}`, { headers: { Origin: "http://localhost:5173" } });
    return { status: x.status, j: await x.json().catch(() => ({})) }; };
  const post = async (r, body) => { const x = await fetch(`${B}${r}`, { method: "POST", headers: H, body: JSON.stringify(body) });
    return { status: x.status, j: await x.json().catch(() => ({})) }; };
  const until = async (id, ms = 30000) => { const t0 = Date.now(); let v = {};
    while (Date.now() - t0 < ms) { v = (await get(`/jobs?id=${id}`)).j; if (!["queued", "running"].includes(v.state)) return v; await sleep(150); }
    return v; };
  try {
    const h = (await get("/health")).j;
    ok(h.bridge_level >= 47, `the bridge is at level 47 (${h.bridge_level})`);
    const pr = (await get("/optimize/profiles")).j;
    ok(pr.ok && pr.profiles.map((p) => p.id).join(",") === "desktop_realtime,webxr,mobile_webxr,archive,preview,render_offline,print_3d",
       "the seven profiles with E.D.'s names, s3Dgraphy's table");
    ok(pr.profiles.every((p) => p.purpose && p.purpose_it && p.label_it), "…each with the line of what it is for");
    const her = pr.profiles.find((p) => p.id === "webxr");
    ok(her.geometry_compression.length === 0 && her.packaging === "gltf_separate" && her.uses.join() === "heriverse,aton,web"
       && her.hint === "ATON / Heriverse",
       "webXR (ATON / Heriverse): no compressed geometry (Q5), a glTF with its textures beside it");
    ok(pr.engines.blender.geometry_compression.join() === "draco" && pr.engines.gltfpack.texture_formats.includes("ktx2"),
       "what each engine can write");

    const files = [`${fsroot}/SB/versions/A@lod0-web.glb`, `${fsroot}/SB/versions/B@lod1-aton-heriverse.glb`];
    let r = await post("/optimize/diagnose", { paths: files, profile: "heriverse" });   // a name of before: webXR
    ok(r.status === 200 && r.j.totals?.objects === 6 && r.j.duplicates?.[0]?.copies === 6, "two files diagnosed: six copies of one geometry");
    ok(!("_objects" in r.j) && r.j.source === "files", "…the raw input stays in the bridge");
    const inst = r.j.improvements.find((x) => x.kind === "instances");
    ok(inst?.checked && inst.effect.draw_calls === -5, "…the instances' row and its effect");
    const none = await post("/optimize/diagnose", { paths: files, profile: "heriverse", checked: [] });
    ok(none.j.after.download_bytes === none.j.before.download_bytes, "nothing ticked: after = before");
    r = await post("/optimize/diagnose", { paths: [`${dir}/outside.glb`], profile: "webxr" });
    ok(r.status === 403 || r.status === 404, `a file outside the bridge's folders is refused (${r.status})`);
    r = await post("/optimize/diagnose", { paths: files, profile: "cinema" });
    ok(r.status === 400 && /not a profile/.test(r.j.error), "an unknown profile is said");

    // a .blend: measured by (fake) EM Tools in Blender, then the same diagnosis
    r = await post("/jobs", { kind: "blender", op: "measure", blend: `${fsroot}/SB/scene.blend` });
    ok(r.status === 202 && r.j.plan?.heavy === false, "measuring a .blend is a light Blender job");
    let v = await until(r.j.job);
    const m = v.result?.result;
    ok(v.state === "done" && m?.objects?.length === 7 && m.containers?.[0]?.label === "Colonnato", "…its objects, textures and containers");
    r = await post("/optimize/diagnose", { measured: { objects: m.objects, textures: m.textures }, profile: "mobile_webxr" });
    ok(r.status === 200 && r.j.source === "blend" && r.j.peaks.length === 7, "…diagnosed for mobile webXR: the six columns and the wall over 10 k");
    const dec = r.j.improvements.find((x) => x.kind === "decimate");
    ok(dec && dec.targets.length === 6 && /normal map/.test(dec.action) && dec.group === "decimate" && !dec.checked
       && dec.params?.triangles_to === 10000, "…one decimation row for the six, with its normal map, proposed unticked, its target a parameter");
    ok(r.j.groups?.map((g) => g.id).join() === "instances,textures,decimate,compression" && r.j.groups.every((g) => g.rationale),
       "…the grid in groups, each with its rationale");
    const ids = [...r.j.improvements.filter((x) => x.checked && x.available).map((x) => x.id), dec.id];
    const params = { [dec.id]: { triangles_to: 4000 } };
    const est = await post("/optimize/diagnose", { measured: { objects: m.objects, textures: m.textures }, profile: "mobile_webxr",
                                                   checked: ids, params });
    ok(est.j.after?.triangles_stored === 4000 + 20000 && est.j.after.params?.[dec.id]?.triangles_to === 4000,
       "…the estimate follows the target the person changed");
    r = await post("/jobs", { kind: "blender", op: "apply_use", blend: `${fsroot}/SB/scene.blend`, container: "Colonnato",
                              profile: "mobile_webxr", checked: ids, params, model: "Colonnato", level: "lod1" });
    ok(r.status === 202 && r.j.plan?.heavy === true && r.j.plan.outputs[0].name === "Colonnato@lod1-mobile.glb",
       "applying is a HEAVY job, its file named before it starts");
    v = await until(r.j.job);
    ok(v.state === "done" && existsSync(`${fsroot}/SB/versions/Colonnato@lod1-mobile.glb`), "…the version is in versions/ beside the .blend");
    ok(v.result?.result?.rows?.join() === ids.join() && v.result.result.params?.[dec.id]?.triangles_to === 4000,
       "…with the ticks and the parameters the page sent");
    r = await post("/jobs", { kind: "blender", op: "apply_use", blend: `${fsroot}/SB/scene.blend`, profile: "mobile_webxr",
                              checked: ids, model: "Colonnato", level: "lod1" });
    ok(r.status === 400 && /already in versions/.test(r.j.error ?? ""), "never over a version already there…");
    r = await post("/jobs", { kind: "blender", op: "apply_use", blend: `${fsroot}/SB/scene.blend`, profile: "mobile_webxr",
                              checked: ids, model: "Colonnato", level: "lod1", replace: true, dry_run: true });
    ok(r.status === 200 && r.j.outputs[0].exists === true, "…unless the person says «replace»");

    // the versions on disk
    let l = (await get(`/optimize/versions?folder=${encodeURIComponent(`${fsroot}/SB`)}`)).j;
    ok(l.ok && l.folder === `${fsroot}/SB/versions` && l.versions.length === 3, "the versions in SB/versions (from the SB folder)");
    const a = l.versions.find((x) => x.name === "A@lod0-web.glb");
    ok(a.triangles === 6 && a.stamp && a.files.length === 2 && a.profile === "webxr", "…each with its triangles, stamp, files and profile (a web version of before: webXR)");
    const doc = { graph: { nodes: [{ id: "res-a", name: "A lod0 for Web", type: "resource", data: { url: "../SB/versions/A@lod0-web.glb" } },
                                   { id: "other", name: "Other", type: "resource", data: { url: "x.glb" } }] } };
    r = await post("/optimize/versions/remove", { folder: `${fsroot}/SB/versions`, names: ["A@lod0-web.glb"], doc, dry_run: true });
    ok(r.status === 200 && r.j.plan[0].files.length === 2 && r.j.plan[0].nodes.map((n) => n.id).join() === "res-a",
       "removal, dry run: its two files and the one node of the document that names it");
    ok(existsSync(files[0]), "…and nothing deleted yet");
    r = await post("/optimize/versions/remove", { folder: `${fsroot}/SB/versions`, names: ["A@lod0-web.glb"], doc });
    ok(r.status === 200 && r.j.deleted.length >= 2 && !existsSync(files[0]) && !existsSync(files[0] + ".stamp.json"),
       "…then the glb and its stamp are gone");
    l = (await get(`/optimize/versions?folder=${encodeURIComponent(`${fsroot}/SB/versions`)}`)).j;
    ok(l.versions.length === 2, "…the others stay");
  } finally {
    proc.kill();
  }
}
console.log(fails.length ? `use diagnosis: ${fails.length} of ${checks} FAILED:\n - ${fails.join("\n - ")}` : `use diagnosis: ${checks} checks ✓`);
process.exit(fails.length ? 1 : 0);
