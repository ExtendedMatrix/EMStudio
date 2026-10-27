// MICRO-OTTIMIZZA-1 · the bridge's engine room for the Ottimizza tab (level 43):
// the ADD-ONS (`GET /addons`, `POST /jobs {kind: addon}` — gltfpack pinned by
// version and sha256, installed into the app's data folder, a wrong digest
// refused, removed), the JOBS (`POST /jobs`, `GET /jobs?id=…&since=N`, cancel —
// the tool in a process of its own), the variants with meshopt and KTX2 for the
// web, the .3tz as a job, and `/graph/add-version` (a variant registered as a
// version of its asset: s3Dgraphy's `api.add_version`; the level taken → a
// revision).
//
//   node scripts/check-optimize-bridge.mjs
//   EM_GLTFPACK=/path/to/gltfpack node scripts/check-optimize-bridge.mjs   (the real variant)
//   GLTFPACK_ZIP=/path/to/gltfpack-macos.zip …                              (the real install, offline)
//
// The install is checked from a local folder (`EM_ADDONS_FROM`): the network is
// not asked here. A tampered zip is refused with nothing installed.
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
if (!existsSync(PY)) {
  console.log("optimize bridge: no s3Dgraphy checkout with its venv — SKIPPED");
  process.exit(0);
}
const GLTFPACK = process.env.EM_GLTFPACK && existsSync(process.env.EM_GLTFPACK) ? process.env.EM_GLTFPACK : "";
const ZIP = process.env.GLTFPACK_ZIP && existsSync(process.env.GLTFPACK_ZIP) ? process.env.GLTFPACK_ZIP : "";

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); else console.log(`  ✓ ${what}`); };
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
  const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = realpathSync(mkdtempSync(`${tmpdir()}/optimize-bridge-`));
const fsroot = `${dir}/fs`;
mkdirSync(fsroot);
const mirror = `${dir}/mirror`;
mkdirSync(mirror);

// a fake gltfpack that takes its time: the cancel has a process to end
const slow = `${dir}/slowpack`;
writeFileSync(slow, '#!/bin/sh\nif [ "$1" = "-h" ]; then echo "gltfpack 0.0-slow"; exit 0; fi\nsleep 30\n');
chmodSync(slow, 0o755);

const start = async (envExtra) => {
  const port = await freePort();
  const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`,
                EM_ADDONS_FROM: mirror, PATH: "/usr/bin:/bin", EM_GLTFPACK: "", ...envExtra };
  const proc = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", fsroot],
                     { env, stdio: ["ignore", "ignore", "inherit"] });
  const B = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { await fetch(`${B}/health`); break; } catch { await sleep(250); } }
  return { proc, B };
};
const call = (B) => ({
  post: async (route, body) => {
    const r = await fetch(`${B}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
                                            body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  },
  get: async (route) => { const r = await fetch(`${B}${route}`); return { status: r.status, j: await r.json().catch(() => ({})) }; },
});
const until = async (get, id, ms = 60000) => {
  const t0 = Date.now();
  let v = {};
  while (Date.now() - t0 < ms) {
    v = (await get(`/jobs?id=${id}`)).j;
    if (!["queued", "running"].includes(v.state)) return v;
    await sleep(200);
  }
  return v;
};

// a textured obj (an mtl, a 64×64 PNG), to see KTX2 made
const crc = (buf) => { let c, crcT = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  let x = 0xffffffff; for (const b of buf) x = crcT[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const png = (w, h) => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = x * 4; raw[o + 1] = y * 4; raw[o + 2] = 128; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); };
const project = `${fsroot}/Ulpia`;
for (const d of ["EM", "RB/LOD1", "SB", "RM", "GIS"]) mkdirSync(`${project}/${d}`, { recursive: true });
writeFileSync(`${project}/EM/ulpia.em.json`, "{}");
const src = `${project}/RB/LOD1/OB_CUBE_LOD1.obj`;
{
  const N = 24, v = [], vt = [], f = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { v.push([i / N, j / N, Math.sin(i / 3) * Math.cos(j / 3) * 0.1]); vt.push([i / N, j / N]); }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j + 1, b = a + 1, c = a + N + 1, d = c + 1; f.push([a, c, b], [b, c, d]); }
  writeFileSync(src, "mtllib OB_CUBE_LOD1.mtl\nusemtl M\n" + v.map((p) => `v ${p.join(" ")}`).join("\n") + "\n" + vt.map((p) => `vt ${p.join(" ")}`).join("\n") + "\n"
    + f.map((t) => `f ${t.map((k) => `${k}/${k}`).join(" ")}`).join("\n") + "\n");
  writeFileSync(`${project}/RB/LOD1/OB_CUBE_LOD1.mtl`, "newmtl M\nmap_Kd T_CUBE.png\n");
  writeFileSync(`${project}/RB/LOD1/T_CUBE.png`, png(64, 64));
}

let bridge;
try {
  // ── 1 · the add-ons, offline from the mirror ────────────────────────────
  bridge = await start({});
  let { post, get } = call(bridge.B);
  const health = (await get("/health")).j;
  ok(health.bridge_level >= 43, `the bridge is at level 43 or more (${health.bridge_level})`);
  const ad = (await get("/addons")).j;
  const gp = (ad.addons ?? []).find((a) => a.id === "gltfpack");
  ok(gp && gp.licence === "MIT" && /github\.com\/zeux\/meshoptimizer\/releases/.test(gp.source), "gltfpack: MIT, its official release page");
  ok(gp && /^[0-9a-f]{64}$/.test(gp.sha256 ?? "") && gp.version, `a pinned version and sha256 for ${ad.platform} (${gp?.version})`);
  ok(gp && gp.installed === null && gp.folder.startsWith(`${dir}/.state/addons`), "nothing installed yet, the folder in the app's data");
  if (gp?.available) {
    // a tampered zip: refused, nothing installed
    writeFileSync(`${mirror}/${gp.url.split("/").pop()}`, "not the release");
    const bad = await post("/jobs", { kind: "addon", id: "gltfpack" });
    ok(bad.status === 202 && bad.j.job, "the install is a job");
    const bv = await until(get, bad.j.job);
    ok(bv.state === "failed" && /sha256/.test(bv.error ?? ""), `a wrong digest is refused (${(bv.error ?? "").slice(0, 60)}…)`);
    ok((await get("/addons")).j.addons[0].installed === null, "…and nothing is installed");
    if (ZIP) {
      copyFileSync(ZIP, `${mirror}/${gp.url.split("/").pop()}`);
      const good = await post("/jobs", { kind: "addon", id: "gltfpack" });
      const gv = await until(get, good.j.job);
      ok(gv.state === "done" && gv.lines.some((l) => /= pinned/.test(l)), "the official zip: its sha256 is the pinned one, installed");
      const now = (await get("/addons")).j.addons[0];
      ok(now.installed && existsSync(now.installed.path) && now.installed.version === gp.version, `installed: ${now.installed?.path}`);
      const dry = await post("/fs/optimize", { sources: [src], preset: "web", dry_run: true });
      ok(dry.j.tool?.addon === true, "the dry run finds gltfpack in the add-ons folder");
      const rm = await post("/jobs", { kind: "addon", id: "gltfpack", step: "remove" });
      ok(rm.j.addon?.installed === null && !existsSync(now.installed.path), "removed: the folder is gone");
    } else console.log("  · GLTFPACK_ZIP not given: the real install is not checked");
  }
  bridge.proc.kill();

  // ── 2 · the cancel: a tool that takes its time ───────────────────────────
  bridge = await start({ EM_GLTFPACK: slow });
  ({ post, get } = call(bridge.B));
  const sj = await post("/jobs", { kind: "variants", sources: [src], preset: "web" });
  ok(sj.status === 202 && sj.j.job, "a variant is a job: 202 at once");
  await sleep(800);
  const running = (await get(`/jobs?id=${sj.j.job}`)).j;
  ok(running.state === "running" && running.stage === "OB_CUBE_LOD1@lod4-web.glb", `running, its stage said (${running.state}, ${running.stage})`);
  const list = (await get("/jobs")).j.jobs ?? [];
  ok(list.some((j) => j.id === sj.j.job && !("lines" in j)), "GET /jobs lists the jobs, without their lines");
  const c0 = Date.now();
  const cx = await post("/jobs", { step: "cancel", id: sj.j.job });
  ok(cx.j.ok === true, "cancel is accepted");
  const cv = await until(get, sj.j.job, 15000);
  ok(cv.state === "cancelled" && Date.now() - c0 < 8000, `cancelled in ${Date.now() - c0} ms: the process is ended`);
  ok(!existsSync(`${project}/RB/versions/OB_CUBE_LOD1@lod4-web.glb`), "a cancelled variant leaves no file");
  const since = (await get(`/jobs?id=${sj.j.job}&since=${cv.next}`)).j;
  ok(Array.isArray(since.lines) && since.lines.length === 0, "since=N gives only the new lines");
  ok((await post("/jobs", { step: "cancel", id: "nope" })).status === 404, "an unknown job is a 404");
  ok((await post("/jobs", { kind: "nonsense" })).status === 400, "an unknown kind is a 400");
  bridge.proc.kill();

  // ── 3 · the real variant, meshopt and KTX2 ───────────────────────────────
  if (GLTFPACK) {
    bridge = await start({ EM_GLTFPACK: GLTFPACK });
    ({ post, get } = call(bridge.B));
    const dry = await post("/fs/optimize", { sources: [src], preset: "web", dry_run: true });
    ok(/-si 0\.1 -cc -tc -tl 1024/.test(dry.j.command ?? ""), `the web's command: ${dry.j.command}`);
    const her = await post("/fs/optimize", { sources: [src], preset: "heriverse", dry_run: true });
    ok(/-noq/.test(her.j.command) && !/-cc|-tc/.test(her.j.command) && /@lod3-aton-heriverse\.glb$/.test(her.j.outputs[0].path),
       `Heriverse/ATON: whole, nothing compressed (${her.j.command})`);
    const vj = await post("/jobs", { kind: "variants", sources: [src], preset: "web" });
    const vv = await until(get, vj.j.job);
    const out = vv.result?.outputs?.[0] ?? {};
    ok(vv.state === "done" && out.state === "written" && existsSync(out.path), `the web variant written (${out.bytes} bytes)`);
    const ex = out.facts?.extensions ?? [];
    ok(ex.includes("EXT_meshopt_compression") && ex.includes("KHR_texture_basisu"), `meshopt and KTX2 in it (${ex.join(", ")})`);
    ok(out.facts?.faces > 0 && out.facts.faces < 1152 && out.facts.texture_count === 1, `its facts: ${out.facts?.faces} faces, ${out.facts?.texture_count} texture`);
    ok(/^sha256:[0-9a-f]{64}$/.test(out.sha256 ?? ""), "its sha256, for the stamp");
    ok(vv.result.parameters.compression === "meshopt" && vv.result.parameters.textures === "ktx2" && vv.result.parameters.max_texture_px === 1024,
       "the parameters said, for the stamp and the step");

    // ── 4 · registered as a version of its asset ───────────────────────────
    const header = { format: "em.json", version: "1.0" };
    const doc = { header, graph: { graph_id: "g1", nodes: [
      { id: "res-lod1", node_type: "resource", name: "OB_CUBE LOD1", data: { url: "../RB/LOD1/OB_CUBE_LOD1.obj", url_type: "3d_model", tier: "master" } },
    ], edges: [] } };
    const body = { doc, source: src, em_json: `${project}/EM/ulpia.em.json`, locator: "../RB/versions/OB_CUBE_LOD1@lod4-web.glb",
      sha256: out.sha256, bytes: out.bytes, level: "lod4", destination: "web", use: ["web"],
      measures: { texture_count: 1, texture_side_px: out.facts.texture_side_px }, primitives: { faces: out.facts.faces, vertices: out.facts.vertices },
      parameters: vv.result.parameters, software: [{ name: "gltfpack", version: "1.3" }], at: "2026-10-27" };
    const av = await post("/graph/add-version", body);
    if (!av.j.registered) console.log("  add-version said:", JSON.stringify(av.j).slice(0, 400));
    ok(av.j.registered === true && av.j.master_id === "res-lod1", "the master found by its url beside the em.json");
    const ver = (av.j.nodes ?? []).find((n) => n.id === av.j.version_id);
    const step = (av.j.nodes ?? []).find((n) => n.node_type === "dtc_process");
    ok(ver && ver.data.url === body.locator && (ver.data.use ?? []).includes("web") && /^lod\d+$/.test(ver.data.lod_level ?? ""),
       `the version: its file, its use, its computed level (${ver?.data.lod_level}: one step from the master)`);
    ok(step?.data.parameters?.level === "lod4" && step.data.parameters.purpose === "web", "the step names the level and the purpose (lod4, web)");
    ok(step && step.data.dtc_kind === "lod_generation" && step.data.technique === "decimation"
       && (step.data.software ?? []).some((s) => s.name === "gltfpack"), "its step: lod_generation, decimation, gltfpack");
    ok((av.j.edges ?? []).some((e) => e.edge_type === "dtc_derived_from" && e.source === av.j.version_id && e.target === "res-lod1"), "derived from the master");
    // the same level with other bytes: a revision (E.D., 6 Oct 2026)
    const doc2 = { header, graph: { ...doc.graph, nodes: [...doc.graph.nodes, ...av.j.nodes], edges: av.j.edges } };
    const again = await post("/graph/add-version", { ...body, doc: doc2, sha256: "sha256:" + "0".repeat(64), locator: "../RB/versions/other.glb" });
    ok(again.j.registered === true && again.j.revises === av.j.version_id, "the level taken with other bytes → a revision of it");
    const none = await post("/graph/add-version", { ...body, doc: { header, graph: { graph_id: "g1", nodes: [], edges: [] } } });
    ok(none.j.registered === false && /not a resource of this graph/.test(none.j.reason), "a source the graph does not hold: not registered, and why");

    // ── 5 · the .3tz as a job ──────────────────────────────────────────────
    const ts = `${project}/RB/cesium`;
    mkdirSync(ts, { recursive: true });
    copyFileSync(out.path, `${ts}/0.glb`);
    writeFileSync(`${ts}/tileset.json`, JSON.stringify({ asset: { version: "1.1" }, geometricError: 10,
      root: { boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }, geometricError: 0, refine: "REPLACE", content: { uri: "0.glb" } } }));
    const pj = await post("/jobs", { kind: "pack3tz", folder: ts });
    const pv = await until(get, pj.j.job);
    ok(pv.state === "done" && pv.result?.path === `${ts}.3tz` && existsSync(`${ts}.3tz`), "the .3tz written by a job beside its folder");
    ok(/^sha256:/.test(pv.result.content_digest?.digest ?? "") || pv.result.content_digest?.digest, "with its content digest");
    bridge.proc.kill();
  } else console.log("  · EM_GLTFPACK not given: the real variant, the version and the .3tz job are not checked");
} finally {
  try { bridge?.proc.kill(); } catch { /* gone */ }
}
if (fails.length) {
  console.error(`check-optimize-bridge: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-optimize-bridge: ${checks} checks passed`);
