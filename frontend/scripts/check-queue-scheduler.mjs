// MICRO-CODA-MULTICORE · the queue uses the machine (bridge level 54): the
// bridge's scheduler in place of the one heavy job at a time — each job (each
// file of a tileset batch) declares tool, cores, memory and the files it reads
// and writes, and starts when cores and memory are free under the ceiling, an
// instance of its tool is free and no other touches its files; «all / half /
// one at a time». The pure decision (`plan_start`, `budget`), the tickets with
// real threads, the page's room (`nextToRun`, `queueSlots`, `waitOf`), and a
// live bridge with a fake gltfpack that takes its time.
//
//   node scripts/check-queue-scheduler.mjs
import * as esbuild from "esbuild";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? (existsSync(`${S3D}.venv/bin/python`) ? `${S3D}.venv/bin/python` : "python3");

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) { fails.push(what); console.log(`  ✗ ${what}`); } else console.log(`  ✓ ${what}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
  const p = s.address().port; s.close(() => res(p)); }); });

// ── 1 · the pure decision and the tickets (Python) ──────────────────────────
const PYTEST = String.raw`
import json, sys, threading, time
sys.path.insert(0, sys.argv[1])
import em_optimize as O
out = {}
B = O.budget("all", 12, 39321)
out["budget_all"] = B
out["budget_half"] = O.budget("half", 12, 39321)
out["budget_one"] = O.budget("one", 12, 39321)
out["budget_small"] = O.budget("all", 4, 4800)
N = lambda tool, cores, mem, r=(), w=(), label="": {"tool": tool, "cores": cores, "memory_mb": mem,
    "reads": [O._norm(p) for p in r], "writes": [O._norm(p) for p in w], "label": label}
# 12 Blender versions from ONE .blend, each its own output: 3 start (the tool's maximum), the others wait Blender
twelve = [N("blender", 3, 2500, ["/t/templu.blend"], [f"/t/versions/m{i}.glb"], f"m{i}") for i in range(12)]
out["twelve"] = O.plan_start(twelve, [], B)
# memory: two of 20 GB under a 39 GB ceiling — the second waits memory, the small one after it keeps its turn
out["memory"] = O.plan_start([N("obj2tiles", 2, 20000, label="a"), N("obj2tiles", 2, 20000, label="b"),
                              N("gltfpack", 1, 200, label="c")], [], B)
# a tool's cap does not hold the others: Blender full, a gltfpack goes
out["tool_then_other"] = O.plan_start([N("blender", 3, 2000, label=f"b{i}") for i in range(4)] + [N("gltfpack", 1, 200, label="g")], [], B)
# cores: 11 at most — ktx2 4 + 4, the third ktx2 waits its tool (max 2); gltfpack ×3 then fit (11)
out["cores"] = O.plan_start([N("ktx2", 4, 900), N("ktx2", 4, 900), N("ktx2", 4, 900), N("gltfpack", 1, 100),
                             N("gltfpack", 1, 100), N("gltfpack", 1, 100), N("gltfpack", 1, 100)], [], B)
# the same file: the same destination, or one writes what the other reads; two readers go together
out["same_dest"] = O.plan_start([N("gltfpack", 1, 100, ["/a.glb"], ["/v/a@web.glb"], "first"),
                                 N("gltfpack", 1, 100, ["/b.glb"], ["/v/a@web.glb"], "second")], [], B)
out["writes_read"] = O.plan_start([N("blender", 3, 1000, [], ["/t/templu.blend"], "apply"),
                                   N("blender_read", 1, 600, ["/t/templu.blend"], [], "inventory")], [], B)
out["two_readers"] = O.plan_start([N("blender_read", 1, 600, ["/t/templu.blend"]), N("blender", 3, 2000, ["/t/templu.blend"], ["/t/v/x.glb"])], [], B)
out["folder_inside"] = O.plan_start([N("obj2tiles", 2, 500, ["/s/a.obj"], ["/v/s@tiles/a"], "part"),
                                     N("pack", 1, 100, ["/v/s@tiles"], ["/v/s@tiles.3tz"], "pack")], [], B)
# a running one on the same file holds the newcomer
out["running_file"] = O.plan_start([N("gltfpack", 1, 100, ["/v/a@web.glb"])], [N("gltfpack", 1, 100, [], ["/v/a@web.glb"], "maker")], B)
# alone: over the ceiling it waits for nothing to run, then runs alone, and holds the others
out["alone_wait"] = O.plan_start([N("obj2tiles", 2, 50000, label="big")], [N("gltfpack", 1, 100, label="g")], B)
out["alone_run"] = O.plan_start([N("obj2tiles", 2, 50000, label="big"), N("gltfpack", 1, 100)], [], B)
out["alone_holds"] = O.plan_start([N("gltfpack", 1, 100)], [{**N("obj2tiles", 2, 50000, label="big"), "alone": True}], B)
# one at a time
out["one"] = O.plan_start([N("gltfpack", 1, 100), N("gltfpack", 1, 100)], [], O.budget("one", 12, 39321))
out["half_twelve"] = O.plan_start(twelve, [], O.budget("half", 12, 39321))

# the tickets, with real threads: 6 Blender jobs of 0.4 s → 3 at a time, in order; the cancel of a waiting one
S = O.Scheduler("all", cores=12, memory_mb=39321)
started, peak, live = [], [0], [0]
lk = threading.Lock()
def work(i, cancel=lambda: False):
    t = S.enter(S.need("blender", memory_mb=2000, reads=["/t/templu.blend"], writes=[f"/t/v/{i}.glb"], label=str(i)))
    try:
        S.wait(t, cancel)
    except O._Cancelled:
        with lk: started.append(f"x{i}")
        return
    with lk:
        started.append(i); live[0] += 1; peak[0] = max(peak[0], live[0])
    time.sleep(0.4)
    with lk: live[0] -= 1
    S.release(t)
th = []
for i in range(6):
    c = (lambda: True) if i == 4 else (lambda: False)
    x = threading.Thread(target=work, args=(i, c)); x.start(); th.append(x); time.sleep(0.02)
view_mid = S.view()
for x in th: x.join()
out["tickets"] = {"started": started, "peak": peak[0], "view_mid": {"tools": view_mid["tools"]["blender"], "waiting": [w["why"] for w in view_mid["waiting"]],
                  "used": view_mid["used"], "budget": view_mid["budget"]}, "end": S.view()["used"], "peak_view": S.peak}
S.set_share("one")
out["share_view"] = S.view()["share"]
# the jobs: submit with a tool waits; its view says why
O.SCHED = O.Scheduler("one", cores=12, memory_mb=39321)
ev = threading.Event()
j1 = O.submit("variants", {}, lambda j: ev.wait(5), tool="gltfpack", estimate_mb=100, label="j1", writes=["/v/x.glb"])
j2 = O.submit("variants", {}, lambda j: 1, tool="gltfpack", estimate_mb=100, label="j2", writes=["/v/y.glb"])
time.sleep(0.3)
out["job_wait"] = {"j1": j1.view()["state"], "j2": j2.view()["state"], "j2_wait": j2.view()["wait"], "threads": j1.threads}
ev.set()
for _ in range(40):
    if j2.state == "done": break
    time.sleep(0.1)
out["job_done"] = [j1.state, j2.state]
# commands: Blender's --threads before the file, KTX2's -tj
import em_blender as BL
out["blender_cmd"] = BL.command("blender", {"op": "measure"}, "/t/templu.blend", threads=3)[:5]
out["ktx2_cmd"] = O.gltfpack_command("gltfpack", "a.glb", "b.glb", {"ktx2": True, "texture_px": 512, "threads": 4})
out["gltfpack_mem"] = [O.gltfpack_memory_mb(10 * 1024 * 1024), O.gltfpack_memory_mb(10 * 1024 * 1024, True)]
out["blend_mem"] = [BL.memory_mb("objects", 126 * 1024 * 1024), BL.memory_mb("objects", 514 * 1024 * 1024), BL.memory_mb("objects", 0),
                    BL.memory_mb("prepare_blend", 126 * 1024 * 1024), BL.memory_mb("prepare_blend", 514 * 1024 * 1024)]
out["perf"] = O.performance_cores()
print(json.dumps(out))
`;
const pr = spawnSync(PY, ["-c", PYTEST, TOOLS], { encoding: "utf8", env: { ...process.env, PYTHONPATH: `${S3D}src:${DTC}` } });
if (pr.status !== 0) { console.error(pr.stderr); fails.push("the Python part ran"); }
const P = pr.status === 0 ? JSON.parse(pr.stdout.trim().split("\n").pop()) : {};
if (pr.status === 0) {
  const codes = (xs) => xs.map((x) => x ? x.code : "start");
  const B = P.budget_all;
  ok(B.cores === 11 && B.memory_mb === 39321 && B.tools.blender.max === 3 && B.tools.blender.cores === 3
     && B.tools.obj2tiles.max === 3 && B.tools.ktx2.max === 2 && B.tools.ktx2.cores === 4 && B.tools.gltfpack.max === 8,
     "12 performance cores, 39 GB: 11 cores; Blender 3 × 3 threads, Obj2Tiles 3, KTX2 2 × 4, gltfpack 8");
  ok(P.budget_half.cores === 5 && P.budget_half.memory_mb === 19660 && P.budget_half.tools.blender.max === 1,
     "half: 5 cores, half the memory, one Blender");
  ok(P.budget_one.one && Object.values(P.budget_one.tools).every((x) => x.max === 1), "one at a time: every tool one");
  ok(P.budget_small.cores === 3 && P.budget_small.tools.blender.max === 1 && P.budget_small.tools.blender.cores === 3,
     "a 4-core machine: 3 cores, one Blender with 3 threads (the general rule)");
  ok(JSON.stringify(codes(P.twelve)) === JSON.stringify(["start", "start", "start", ...Array(9).fill("tool")]),
     "12 versions from one .blend: 3 Blender side by side (two readers of a .blend go together), 9 «aspetta Blender libero»");
  ok(JSON.stringify(codes(P.memory)) === JSON.stringify(["start", "memory", "turn"]) && P.memory[2].other === "b",
     "memory: the second waits memory, the one after keeps its turn behind it");
  ok(JSON.stringify(codes(P.tool_then_other)) === JSON.stringify(["start", "start", "start", "tool", "start"]),
     "Blender full does not hold a gltfpack");
  ok(JSON.stringify(codes(P.cores)) === JSON.stringify(["start", "start", "tool", "start", "start", "start", "cores"]),
     "cores: KTX2 4+4, a third KTX2 waits its tool, gltfpack fills the 11 cores and the next waits cores");
  ok(codes(P.same_dest)[1] === "file" && P.same_dest[1].other === "first", "the same destination: the second waits the first, and says which");
  ok(codes(P.writes_read)[1] === "file", "a .blend written: who reads it waits");
  ok(JSON.stringify(codes(P.two_readers)) === JSON.stringify(["start", "start"]), "two readers of the same .blend go together");
  ok(codes(P.folder_inside)[1] === "file", "a tileset's part and the pack of its folder: the same file (one inside the other)");
  ok(codes(P.running_file)[0] === "file" && P.running_file[0].other === "maker", "a running job on the file holds the newcomer");
  ok(codes(P.alone_wait)[0] === "alone", "over the ceiling: it waits for nothing to run");
  ok(JSON.stringify(codes(P.alone_run)) === JSON.stringify(["start", "alone"]), "…then runs alone, as before, and the others wait it");
  ok(codes(P.alone_holds)[0] === "alone" && P.alone_holds[0].other === "big", "one alone running holds the others");
  ok(JSON.stringify(codes(P.one)) === JSON.stringify(["start", "one"]), "«un lavoro alla volta»");
  ok(codes(P.half_twelve).filter((c) => c === "start").length === 1, "half: one Blender of the twelve");
  const st = P.tickets.started;
  ok(P.tickets.peak === 3, `the tickets: 3 Blender at most at once (peak ${P.tickets.peak})`);
  ok(JSON.stringify(st.filter((x) => typeof x === "number")) === JSON.stringify([0, 1, 2, 3, 5]) && st.includes("x4"),
     `in their order; the waiting one cancelled leaves the line (${JSON.stringify(st)})`);
  ok(P.tickets.view_mid.tools.running === 3 && P.tickets.view_mid.used.cores === 9 && P.tickets.view_mid.used.memory_mb === 6000
     && P.tickets.view_mid.waiting.every((w) => w.code === "tool"),
     "the view: Blender 3/3, 9 cores and 6.000 MB in use, the others «aspetta Blender libero»");
  ok(P.tickets.end.cores === 0 && P.tickets.end.memory_mb === 0 && P.tickets.peak_view.running === 3, "everything given back; the peak kept");
  ok(P.share_view === "one", "the share set");
  ok(P.job_wait.j1 === "running" && P.job_wait.j2 === "queued" && P.job_wait.j2_wait?.code === "one" && /one job at a time/.test(P.job_wait.j2_wait.say),
     "a job: queued with its reason in its view");
  ok(JSON.stringify(P.job_done) === JSON.stringify(["done", "done"]), "…then it starts when the other ends");
  ok(JSON.stringify(P.blender_cmd) === JSON.stringify(["blender", "--threads", "3", "-b", "/t/templu.blend"]), "Blender: --threads before the file");
  ok(P.ktx2_cmd.join(" ").endsWith("-tc -tl 512 -tj 4"), "KTX2: -tj with the threads given");
  ok(P.gltfpack_mem[0] === 210 && P.gltfpack_mem[1] === 810, "gltfpack's memory said before (10 MB: 210, with KTX2 810)");
  ok(JSON.stringify(P.blend_mem) === JSON.stringify([1415, 2385, 600, 4775, 9625]),
     `a .blend read 1.415 / 2.385 MB, prepared 4.775 / 9.625 MB (Templu Mare measured 1.374 / 2.201 and 4.4 / 9.1 GB) — ${JSON.stringify(P.blend_mem)}`);
  ok(P.perf >= 1, `this machine's performance cores: ${P.perf}`);
}

// ── 2 · the page's room (asset-list.ts) ─────────────────────────────────────
const bundle = await esbuild.build({ entryPoints: [`${SRC}asset-list.ts`], bundle: true, format: "esm", write: false });
const A = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const item = (id, state = "waiting") => ({ id, label: id, state, note: "" });
const q = [item("a", "running"), item("b"), item("c")];
ok(A.nextToRun(q, "run") === null, "one slot (the default): as before, the next when none runs");
ok(A.nextToRun(q, "run", { slots: 11, held: 0 })?.id === "b", "eleven slots, none held: the next goes");
ok(A.nextToRun(q, "run", { slots: 11, held: 1 }) === null, "one sent waits at the bridge: the next stays here (↑ ↓ keep their meaning)");
ok(A.nextToRun(q, "pause", { slots: 11, held: 0 }) === null, "Pausa: none");
ok(A.queueSlots("one", 11) === 1 && A.queueSlots("all", 11) === 11 && A.queueSlots("half", 5) === 5 && A.queueSlots("all") === 4,
   "slots: one → 1, else the scheduler's cores (4 before it says)");
const jobs = [{ state: "queued", wait: { code: "tool", other: "blender" } }];
ok(A.waitOf(item("x", "running"), jobs, false)?.code === "tool", "an item's reason: its job's");
ok(A.waitOf(item("x", "running"), [{ state: "running", items: [{ state: "queued", wait: { code: "memory" } }, { state: "done" }] }], false)?.code === "memory",
   "…or the waiting file of its batch when none of them runs");
ok(A.waitOf(item("x", "running"), [{ state: "running", items: [{ state: "running" }, { state: "queued", wait: { code: "memory" } }] }], false) === null,
   "a batch with a file running is not «waiting»");
ok(A.waitOf(item("x"), [], true)?.code === "page" && A.waitOf(item("x"), [], false) === null, "the first in line held by the page says it");
ok(A.waitOf(item("x", "running"), [{ state: "queued", wait: { code: "nonsense" } }], false) === null, "an unknown code is not said");

// ── 3 · a live bridge: level 54, the scheduler, the share, jobs side by side ─
if (!existsSync(`${S3D}.venv/bin/python`)) console.log("  · no s3Dgraphy venv: the live bridge is not checked");
else {
  const dir = realpathSync(mkdtempSync(`${tmpdir()}/queue-scheduler-`));
  const fsroot = `${dir}/fs`;
  const project = `${fsroot}/Ulpia`;
  for (const d of ["EM", "RB/LOD1"]) mkdirSync(`${project}/${d}`, { recursive: true });
  writeFileSync(`${project}/EM/ulpia.em.json`, "{}");
  for (const n of ["A", "B", "C"]) writeFileSync(`${project}/RB/LOD1/OB_${n}.glb`, Buffer.alloc(2048));
  const slow = `${dir}/slowpack`;
  writeFileSync(slow, '#!/bin/sh\nif [ "$1" = "-h" ]; then echo "gltfpack 0.0-slow"; exit 0; fi\nOUT=""\nwhile [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then OUT="$2"; fi; shift; done\nsleep 2\nprintf x > "$OUT"\n');
  chmodSync(slow, 0o755);
  const port = await freePort();
  const proc = spawn(`${S3D}.venv/bin/python`, [`${TOOLS}em_bridge.py`, "--port", String(port), "--fs-root", fsroot],
    { env: { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state`, EM_GLTFPACK: slow, PATH: "/usr/bin:/bin" },
      stdio: ["ignore", "ignore", "ignore"] });
  const Bu = `http://127.0.0.1:${port}`;
  const post = async (route, body) => { const r = await fetch(`${Bu}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const get = async (route) => { const r = await fetch(`${Bu}${route}`); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    for (let i = 0; i < 120; i++) { try { await fetch(`${Bu}/health`); break; } catch { await sleep(250); } }
    const h = (await get("/health")).j;
    ok(h.bridge_level === 54, `the bridge is at level 54 (${h.bridge_level})`);
    const sv = (await get("/jobs/scheduler")).j;
    ok(sv.ok && sv.share === "all" && sv.budget.cores >= 1 && sv.tools.blender && sv.tools.obj2tiles, "GET /jobs/scheduler: the share, the budget, the tools");
    ok((await post("/jobs", { step: "share", share: "plenty" })).status === 400, "an unknown share refused");
    const variants = async (preset) => {
      const ids = [];
      for (const n of ["A", "B", "C"]) {
        const r = await post("/jobs", { kind: "variants", sources: [`${project}/RB/LOD1/OB_${n}.glb`], preset, replace: true });
        ids.push(r.j.job);
      }
      return ids;
    };
    // all: three gltfpack side by side
    let r = await post("/jobs", { step: "share", share: "all" });
    let ids = await variants("heriverse");
    await sleep(700);
    let v = (await get("/jobs/scheduler")).j;
    ok(ids.every(Boolean) && v.running.length === 3 && v.running.every((x) => x.tool === "gltfpack") && v.tools.gltfpack.running === 3,
       `«all»: the three gltfpack variants run side by side (${v.running.length} running)`);
    for (let i = 0; i < 40; i++) { const st = await Promise.all(ids.map((id) => get(`/jobs?id=${id}`))); if (st.every((x) => !["queued", "running"].includes(x.j.state))) break; await sleep(250); }
    // KTX2: two at most (4 threads each, -tj 4)
    ids = await variants("web");
    await sleep(700);
    v = (await get("/jobs/scheduler")).j;
    const third = v.waiting.find((w) => w.tool === "ktx2");
    ok(v.tools.ktx2.running === 2 && third?.why?.code === "tool", `KTX2: two side by side, the third «aspetta KTX2 libero» (${v.tools.ktx2.running}, ${third?.why?.code})`);
    const lines = (await get(`/jobs?id=${ids[0]}`)).j.lines ?? [];
    ok(lines.some((l) => / -tj 4/.test(l)), "KTX2's gltfpack called with -tj 4");
    for (let i = 0; i < 40; i++) { const st = await Promise.all(ids.map((id) => get(`/jobs?id=${id}`))); if (st.every((x) => !["queued", "running"].includes(x.j.state))) break; await sleep(250); }
    // the same destination: a second variant of A waits the first
    ids = [(await post("/jobs", { kind: "variants", sources: [`${project}/RB/LOD1/OB_A.glb`], preset: "mobile", replace: true })).j.job,
           (await post("/jobs", { kind: "variants", sources: [`${project}/RB/LOD1/OB_A.glb`], preset: "mobile", replace: true })).j.job];
    await sleep(500);
    const second = (await get(`/jobs?id=${ids[1]}`)).j;
    ok(ids[1] && second.state === "queued" && second.wait?.code === "file", `the same file: the second waits it (${second.state} · ${second.wait?.code})`);
    for (let i = 0; i < 40; i++) { const st = await Promise.all(ids.map((id) => get(`/jobs?id=${id}`))); if (st.every((x) => !["queued", "running"].includes(x.j.state))) break; await sleep(250); }
    // one at a time
    r = await post("/jobs", { step: "share", share: "one" });
    ok(r.status === 200 && r.j.share === "one" && r.j.budget.one, "POST /jobs {step: share, share: one}");
    ids = await variants("print");
    await sleep(700);
    v = (await get("/jobs/scheduler")).j;
    ok(v.running.length === 1 && v.waiting.length === 2 && v.waiting.every((w) => w.why?.code === "one" || w.why?.code === "file"),
       `«one at a time»: 1 running, 2 waiting (${v.running.length}/${v.waiting.length})`);
    const listing = (await get("/jobs")).j;
    ok(listing.scheduler?.share === "one", "GET /jobs carries the scheduler too");
    for (const id of ids) await post("/jobs", { step: "cancel", id });
  } finally {
    proc.kill();
  }
}

if (fails.length) {
  console.error(`check-queue-scheduler: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-queue-scheduler: ${checks} checks passed`);
