// MICRO-ARCHIVIO-2 · the bridge's half of the File window «alla Blender»:
// `/project-tree` (V4: the standard tree with GIS/, folder by folder, there or
// to be made, from s3Dgraphy's `describe_tree`), «Reorder» asking where an
// unreadable .tif goes, and `/fs/optimize` (the Ottimizza tab: a variant by
// gltfpack in the `versions/` of its part, named as Templu Mare's — dry run,
// run, never over a file that exists, nothing outside the served folders).
//
//   node scripts/check-files-bridge.mjs
//   EM_GLTFPACK=/path/to/gltfpack node scripts/check-files-bridge.mjs   (the run itself)
//
// Without gltfpack the run is checked to refuse with the reason (501), and the
// dry run to say the tool is not here.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
if (!existsSync(PY)) {
  console.log("files bridge: no s3Dgraphy checkout with its venv — SKIPPED");
  process.exit(0);
}
const GLTFPACK = process.env.EM_GLTFPACK && existsSync(process.env.EM_GLTFPACK) ? process.env.EM_GLTFPACK : "";

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); else console.log(`  ✓ ${what}`); };
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
  const p = s.address().port; s.close(() => res(p)); }); });

const dir = realpathSync(mkdtempSync(`${tmpdir()}/files-bridge-`));
const fsroot = `${dir}/fs`;
mkdirSync(fsroot);
const port = await freePort();
const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`,
              EM_GLTFPACK: GLTFPACK, PATH: GLTFPACK ? process.env.PATH : "/usr/bin:/bin" };
const bridge = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", fsroot],
                     { env, stdio: ["ignore", "ignore", "inherit"] });
const B = `http://127.0.0.1:${port}`;
const post = async (route, body) => {
  const r = await fetch(`${B}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
                                          body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
try {
  for (let i = 0; i < 120; i++) { try { await fetch(`${B}/health`); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  const health = await (await fetch(`${B}/health`)).json();
  ok(health.bridge_level >= 42, `the bridge is at level 42 or more (${health.bridge_level})`);

  // a new project, then its tree
  const made = await post("/project-new", { parent: fsroot, name: "Ulpia" });
  ok(made.status === 200 && made.j.made.includes("GIS/"), "a new project has GIS/ (V4)");
  const root = made.j.root;
  const tree = await post("/project-tree", { root });
  const rels = (tree.j.dirs ?? []).map((d) => d.rel);
  ok(JSON.stringify(rels) === JSON.stringify(["EM", "EM/DosCo", "EM/proxies", "RB", "SB", "RM", "GIS"]), `the tree in its order: ${rels.join(", ")}`);
  ok(tree.j.dirs.every((d) => d.exists), "every folder of a new project is there");
  ok(tree.j.dirs.find((d) => d.rel === "EM/DosCo").depth === 1, "DosCo sits under EM");
  const old = `${fsroot}/vecchio`;
  mkdirSync(`${old}/EM`, { recursive: true });
  writeFileSync(`${old}/rotto.tif`, "not a tiff");
  const tree2 = await post("/project-tree", { root: old });
  ok(tree2.j.dirs.filter((d) => !d.exists).map((d) => d.rel).join(",") === "EM/DosCo,EM/proxies,RB,SB,RM,GIS",
     "an old project: the folders to be made are said");
  const plan = await post("/project-reorder", { root: old });
  ok(plan.j.plan.some((p) => p.action === "ask" && p.from === "rotto.tif" && p.choices.includes("GIS/rotto.tif")),
     "«Riordina»: a .tif it cannot read is asked, GIS or DosCo");
  const refused = await post("/project-tree", { root: `${fsroot}/nowhere` });
  ok(refused.status === 400, "a folder that is not there is refused");

  // a model in RB/LOD1, and its variant
  mkdirSync(`${root}/EM`, { recursive: true });
  writeFileSync(`${root}/EM/ulpia.em.json`, "{}");
  mkdirSync(`${root}/RB/LOD1`, { recursive: true });
  const src = `${root}/RB/LOD1/OB_CUBE_LOD1.obj`;
  const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const f = [[1, 2, 3], [1, 3, 4], [5, 7, 6], [5, 8, 7], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 8], [3, 8, 4], [4, 8, 5], [4, 5, 1]];
  writeFileSync(src, v.map((p) => `v ${p.join(" ")}`).join("\n") + "\n" + f.map((t) => `f ${t.join(" ")}`).join("\n") + "\n");
  const dry = await post("/fs/optimize", { sources: [src, `${dir}/outside.obj`], lod: "lod4", destination: "web", ratio: 0.5, dry_run: true });
  const out0 = dry.j.outputs?.[0] ?? {};
  ok(out0.path === `${root}/RB/versions/OB_CUBE_LOD1@lod4-web.glb` && out0.exists === false,
     `the dry run: RB/versions/OB_CUBE_LOD1@lod4-web.glb (${out0.path})`);
  ok(!!dry.j.outputs?.[1]?.error, "a source outside the served folders is refused, by name");
  ok(!existsSync(`${root}/RB/versions`), "a dry run writes nothing");
  if (!GLTFPACK) {
    ok(dry.j.tool === null, "without gltfpack the dry run says the tool is not here");
    const run = await post("/fs/optimize", { sources: [src], lod: "lod4", destination: "web" });
    ok(run.status === 501 && /gltfpack/.test(run.j.error ?? ""), "without gltfpack the run is refused with the reason");
    console.log("  · EM_GLTFPACK not set: the run itself is not checked here");
  } else {
    ok(/gltfpack/.test(dry.j.tool?.version ?? ""), `the tool and its version (${dry.j.tool?.version})`);
    const run = await post("/fs/optimize", { sources: [src], lod: "lod4", destination: "web", ratio: 0.5 });
    const w = run.j.outputs?.[0] ?? {};
    ok(w.state === "written" && existsSync(w.path) && w.bytes > 0 && /^sha256:[0-9a-f]{64}$/.test(w.sha256 ?? ""),
       `the variant written, with its weight and its sha256 (${w.bytes} bytes)`);
    ok(/-noq/.test(w.command ?? "") && !/ -c\b| -cc\b| -tc\b/.test(w.command ?? ""), "neither quantised nor compressed: the Viewer reads it");
    ok(run.j.parameters?.ratio === 0.5 && run.j.parameters?.quantization === false, "the parameters said, for the stamp");
    const again = await post("/fs/optimize", { sources: [src], lod: "lod4", destination: "web", ratio: 0.5 });
    ok(again.j.outputs?.[0]?.state === "exists", "a variant already there is never overwritten");
  }
} finally {
  bridge.kill();
}
if (fails.length) {
  console.error(`check-files-bridge: ${fails.length} of ${checks} FAILED:\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`check-files-bridge: ${checks} checks passed`);
