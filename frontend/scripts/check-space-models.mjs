// PARTE 0 · I MODELLI SPARITI (E.D. 17 Oct 2026) · the Space must have its
// models, and a file nobody answered for is not a missing file.
//
//   node scripts/check-space-models.mjs [TempluMare_v3.2.em.json]
//
// 1 · `UnansweredFiles`: a fetch without an answer (the desktop's sidecar still
//     starting) waits and is asked again; it is missing only when it stays
//     silent after the bridge answered, or after the patience is over. On
//     dev.45 and dev.46 such a file was marked missing for the session and the
//     Space stayed empty (11 of the 12 models of XX sec).
// 2 · Templu Mare v3.2 (a copy, read only; skipped when absent): 99 RMs in the
//     Space, 12 in XX sec, 87 in II A.D., every one with a resident resource
//     and a finite pose near the survey (the scene's box of 16 Oct:
//     x −38.7…12.9, y 490…504.4, z −16.9…47.3 in three's axes).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./space"; export * from "./transform3d";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, `${m} — got ${JSON.stringify(a)}`); n++; };

// 1 · the rule of the unanswered files
{
  const u = new M.UnansweredFiles(10_000);
  eq(u.heard("a", 0), "wait", "the first file without an answer: wait (the caller starts asking again)");
  eq(u.heard("b", 100), "waiting", "a second one: waiting, no second timer");
  eq(u.heard("a", 200), "waiting", "the same one again: waiting");
  eq(u.size, 2, "two files waiting");
  ok(u.patient(5_000), "5 s of silence: still patient");
  u.retry(false);
  eq(u.size, 0, "asked again: nobody waits until they fail again");
  eq(u.heard("a", 3_000), "wait", "asked again with the bridge still silent, no answer again: it waits, not missing");
  ok(!u.patient(10_001), "silent for longer than the patience: no more waiting for the bridge");
  u.retry(false);
  eq(u.heard("a", 10_500), "missing", "…and asked once more without an answer: missing, the verdict");
  // the bridge answers /health and the file does not (a refusal without CORS): missing at once
  const v = new M.UnansweredFiles(10_000);
  v.heard("c", 0);
  v.retry(true);
  eq(v.heard("c", 1_600), "missing", "the bridge answered, the file did not: missing, no endless asking");
  // a file that came on the second asking leaves nothing behind
  const w = new M.UnansweredFiles(10_000);
  w.heard("d", 0); w.retry(true);
  eq(w.size, 0, "a file that came: nothing waits");
  eq(w.heard("e", 2_000), "wait", "another file later: a new wait");
}

// 2 · Templu Mare v3.2
const F = process.argv[2] ?? process.env.EM_TEMPLU_V32 ?? "/tmp/gizmo/templu-mare/EM/TempluMare_v3.2.em.json";
if (existsSync(F)) {
  const raw = JSON.parse(readFileSync(F, "utf8"));
  const doc = { ...raw, graph: raw.graph ?? Object.values(raw.graphs).find((g) => g.nodes.length > 100) };
  const UNITS = new Set(["US", "USVs", "USVn", "SF", "RSF", "VSF", "USD", "USM"]);
  const t0 = performance.now();
  const sp = M.buildSpace(doc, { isUnit: (t) => UNITS.has(t) });
  const ms = performance.now() - t0;
  eq(sp.rms.length, 99, "Templu Mare v3.2: 99 RMs in the Space");
  const per = Object.fromEntries(sp.epochs.map((e) => [e.name, sp.summary(e.id).rms.length]));
  eq(per["XX sec"], 12, "…12 in XX sec");
  eq(per["II A.D."], 87, "…87 in II A.D.");
  const notResident = sp.rms.filter((r) => r.resource?.state !== "resident").map((r) => r.name);
  eq(notResident, [], "…every one with a resident resource (offline, the recorded state)");
  const byId = new Map(doc.graph.nodes.map((x) => [x.id, x]));
  const lo = [-38.7, 490.0, -17.0], hi = [13.0, 504.4, 47.4], margin = 1;
  for (const r of sp.rms) {
    const xf = M.readTransform(byId.get(r.id)?.data);
    if (!xf || M.isIdentity(xf)) continue;   // the identity: the glb where the survey put it
    const pose = M.xfToPose(xf);
    ok(pose.position.every(Number.isFinite) && pose.rotation.every(Number.isFinite) && pose.scale.every(Number.isFinite), `${r.name}: a finite pose`);
    ok(pose.position.every((v, i) => Math.abs(v) < 1e-9 || (v >= lo[i] - margin && v <= hi[i] + margin)), `${r.name}: a translation inside the scene's box`);
  }
  const identities = sp.rms.filter((r) => { const xf = M.readTransform(byId.get(r.id)?.data); return !xf || M.isIdentity(xf); }).length;
  console.log(`  Templu Mare v3.2: buildSpace in ${ms.toFixed(0)} ms, ${identities}/99 with the identity`);
} else console.log(`  (Templu Mare v3.2 not at ${F}: skipped)`);
// 3 · MICRO tileset, shift e epoche (E.D. 25 Oct 2026) · E.D.'s case: the
//     container tls with NO mesh, its Document D.1 in Epoch 1, its alternative a
//     tileset with a frame (EPSG:6708 minus SHIFT6708) — before, its alternative
//     took the epochs of the meshes it covers (none) and was nowhere
{
  const raw = JSON.parse(readFileSync(new URL("../testdata/tiles-frame.em.json", import.meta.url), "utf8"));
  const sp = M.buildSpace(raw, { isUnit: (t) => t === "US" });
  const tls = sp.rms.find((r) => r.id === "rmgroup_tls");
  eq(tls?.epochs, ["EP1"], "the container without meshes: its alternative lies in its own epoch (its Document's), Epoch 1");
  eq(tls?.altOf, "rmgroup_tls", "…drawn as the container's alternative");
  ok(tls?.resource?.tiles === "directory", "…a tileset");
  eq(sp.summary("EP1")?.rms.map((r) => r.id), ["rmgroup_tls"], "…Epoch 1's models (the table «Modelli e proxy» and the scene read them)");
  eq(tls?.frame, { frame: { crs: "EPSG:6708", shift: [291407, 4640813, 0], note: "SHIFT6708.txt of the study", source: "file" }, from: "RES_TF" },
    "…its frame, said by its resource");
  eq(tls?.frameHome, "RES_TF", "…and a new frame is written on the tileset's asset");
}
console.log(`check-space-models: ${n} checks passed`);
