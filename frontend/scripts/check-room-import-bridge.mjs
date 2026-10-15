// MICRO-PORTA-IN-STANZA-DAL-MOTORE (16 Oct 2026) · `POST /room-import` of the
// bridge against the FAKE node of s3Dgraphy's own tests
// (`s3Dgraphy/tests/test_room_import.py::FakeNode`, a server on the loopback
// with the node's rules where they matter: content by sha256, a file at home in
// one room, idempotent operations) and its study on disk (`write_study`: a DosCo
// PDF with its stamp, the same bytes named twice, an OBJ file_set in ../RB, a
// tileset folder, a `blend://` datablock, three external references and a
// missing file).
//
//   node scripts/check-room-import-bridge.mjs
//
// What it holds: the plan comes back in the engine's groups and the engine's
// own lines; the person's choices reach it (a file left as a reference is not
// sent); «Pause» holds the run and «Resume» lets it end; the graph is seated
// LAST, `study-access` is restricted; a second run of the same room uploads 0
// bytes and sends 0 operations; the token is in no file the bridge wrote; and
// «Pack a tileset as .3tz» writes with dtcstamp now (the copy in tools/ is gone).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? `${S3D}.venv/bin/python`;
if (!existsSync(PY) || !existsSync(`${S3D}tests/test_room_import.py`)) {
  console.log("room-import bridge: no s3Dgraphy checkout with its venv and its fake node — SKIPPED");
  process.exit(0);
}

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) fails.push(what); else console.log(`  ✓ ${what}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => {
  const p = s.address().port; s.close(() => res(p)); }); });

const dir = realpathSync(mkdtempSync(`${tmpdir()}/room-import-bridge-`));
const env = { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state` };

// ── the fake node, and the study on disk ────────────────────────────────────
const fake = spawn(PY, ["-c", `
import json, sys
sys.path.insert(0, sys.argv[1] + "tests")
from test_room_import import FakeNode, write_study
node = FakeNode()
em = write_study(sys.argv[2])
print(json.dumps({"url": node.url, "em": em}), flush=True)
for line in sys.stdin:
    room = line.strip()
    print(json.dumps({"puts": node.puts, "rooms": sorted(node.rooms),
                      "ops": {g: len(o) for g, o in (node.rooms.get(room) or {}).get("ops", {}).items()},
                      "requests": node.ops_requests, "access": node.access.get(room)}), flush=True)
`, S3D, dir], { env, stdio: ["pipe", "pipe", "inherit"] });
const fakeLines = createInterface({ input: fake.stdout });
const nextLine = () => new Promise((res) => fakeLines.once("line", res));
const { url: NODE, em: EM } = JSON.parse(await nextLine());
const nodeSays = async (room) => { fake.stdin.write(`${room}\n`); return JSON.parse(await nextLine()); };

// ── the bridge ──────────────────────────────────────────────────────────────
const port = await freePort();
const bridge = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--s3dgraphy", `${S3D}src`,
  "--fs-root", dir], { env, stdio: ["ignore", "ignore", "pipe"] });
let bridgeErr = "";
bridge.stderr.on("data", (d) => { bridgeErr += String(d); });
const BASE = `http://127.0.0.1:${port}`;
for (let i = 0; i < 150; i++) {
  try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* not yet */ }
  await sleep(150);
}
const H = { Origin: "http://localhost:5173", "content-type": "application/json" };
const post = async (body, route = "/room-import") => {
  const r = await fetch(`${BASE}${route}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};
const view = async (job, since = 0) => (await fetch(`${BASE}/room-import?job=${job}&since=${since}`, { headers: H })).json();
const until = async (job, states, ms = 60000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await view(job);
    if (states.includes(v.state) || Date.now() > end) return v;
    await sleep(120);
  }
};
const TOKEN = "tok-secret-never-on-disk";
const doc = JSON.parse(readFileSync(EM, "utf8"));
const emDir = EM.replace(/\/[^/]*$/, "");
const planOf = (room, extra = {}) => post({ step: "plan", node: NODE, room, title: "Study in a room", token: TOKEN,
  doc, em_json: EM, base_dirs: [emDir], ...extra });

try {
  const health = await (await fetch(`${BASE}/health`)).json();
  ok(health.bridge_level >= 32, `the bridge says level ${health.bridge_level} (32 = /room-import)`);

  console.log("1 · a route that reads the disk wants an origin");
  const bare = await fetch(`${BASE}/room-import`, { method: "POST", body: "{}" });
  ok(bare.status === 403, `no Origin → ${bare.status}`);

  console.log("2 · the plan, in the engine's groups and lines");
  const p1 = await planOf("r1");
  ok(p1.status === 202 && !!p1.job, `plan accepted (${p1.status})`);
  const busy = await planOf("r-other");
  const planned = await until(p1.job, ["planned", "failed"]);
  ok(planned.state === "planned", `the plan is made (${planned.state}${planned.error ? `: ${planned.error}` : ""})`);
  ok(busy.status === 409 || busy.status === 202, `one run at a time (${busy.status})`);
  if (busy.status === 202) await until(busy.job, ["planned", "failed"]);
  const rows = planned.plan.rows;
  const g = (id) => rows.find((r) => r.id === id)?.group;
  ok(g("r-d01") === "found" && g("f-obj") === "found" && g("f-mtl") === "found", "the DosCo PDF and the file_set's files are found here");
  ok(!rows.some((r) => r.id === "r-set"), "…a resource with has_file is the set, not a file");
  ok(g("r-tiles") === "found" && rows.find((r) => r.id === "r-tiles").tree, "the tileset folder is a tree");
  ok(["r-od", "r-smb", "r-web", "r-blend"].every((id) => g(id) === "external"), "OneDrive, the NAS, the web and blend:// are references");
  ok(g("r-gone") === "missing", "the missing file is missing");
  ok(planned.plan.where.created === true && planned.plan.where.seedable === true, "the room was created first, empty");
  ok(planned.lines.some((l) => /^the plan: /.test(l)), `the bridge's line: ${planned.lines.find((l) => /^the plan/.test(l))}`);
  ok(planned.lines.some((l) => /^inventory|tree files|^the study/.test(l)), "…and the engine's own lines");

  console.log("3 · the person's choices, «Pause», and the run");
  const mtl = rows.find((r) => r.id === "f-mtl").sha256.replace(/^sha256:/, "");
  await post({ step: "pause", job: p1.job });
  const ex = await post({ step: "execute", job: p1.job, token: TOKEN, per_item: { "f-mtl": "reference" } });
  ok(ex.status === 202, `execute accepted (${ex.status})`);
  await sleep(1500);
  const held = await view(p1.job);
  const midway = await nodeSays("r1");
  ok(held.state === "running" && held.paused && Object.keys(midway.puts).length === 0,
     `paused: nothing sent while it waits (${held.state}, ${Object.keys(midway.puts).length} PUT)`);
  await post({ step: "resume", job: p1.job });
  const done = await until(p1.job, ["done", "failed"]);
  ok(done.state === "done", `the run ends (${done.state}${done.error ? `: ${done.error}` : ""})`);
  const rep = done.report;
  const after = await nodeSays("r1");
  ok(rep.uploaded.files > 0 && rep.uploaded.bytes > 0, `uploaded ${rep.uploaded.files} file(s), ${rep.uploaded.bytes} B`);
  ok(done.sent > 0 && done.sent <= done.total, `the bar: ${done.sent} of ${done.total} B read out`);
  ok(!(mtl in after.puts), "the file left as a reference was not sent");
  ok(Object.values(after.puts).every((n) => n === 1), "every digest went up once");
  ok(rep.seeded.applied > 0 && rep.seeded.refused === 0, `the graph seated last: ${rep.seeded.applied} operation(s) applied`);
  ok((after.ops.g1 ?? 0) > 0, `…the node holds them (${after.ops.g1} in g1)`);
  ok(after.access?.visibility === "restricted", "study-access: restricted");
  ok(/^uploaded \d+/.test(rep.sentence) && /room r1/.test(rep.sentence), `the sentence: ${rep.sentence}`);
  ok(done.lines.some((l) => l === "paused") && done.lines.some((l) => l === "resumed"), "the lines say paused and resumed");

  console.log("4 · a second run of the same room: 0 bytes, 0 operations");
  const p2 = await planOf("r1");
  const planned2 = await until(p2.job, ["planned", "failed"]);
  ok(planned2.state === "planned" && planned2.plan.where.resumed === true, `taken up again (${planned2.plan?.where?.note ?? planned2.error})`);
  await post({ step: "execute", job: p2.job, token: TOKEN, per_item: { "f-mtl": "reference" } });
  const done2 = await until(p2.job, ["done", "failed"]);
  ok(done2.state === "done" && done2.report.uploaded.bytes === 0 && done2.report.seeded.sent === 0,
     `second run: ${done2.report?.uploaded.bytes} B, ${done2.report?.seeded.sent} operation(s)`);

  console.log("5 · the token is in no file the bridge wrote");
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const f = `${d}/${n}`;
    if (statSync(f).isDirectory()) walk(f); else files.push(f); } };
  walk(`${dir}/.state`);
  ok(files.some((f) => f.endsWith(".em_room_import.json")) && files.some((f) => f.endsWith(".room-import.md")),
     `journal and report in the bridge's state folder (${files.length} file(s))`);
  ok(!files.some((f) => readFileSync(f).includes(TOKEN)), "…and none of them holds the token");
  ok(!readdirSync(emDir).some((n) => n.startsWith(".em_room_import")), "nothing written beside the em.json");

  console.log("6 · forget, and an unknown job");
  ok((await post({ step: "forget", job: p2.job })).ok, "forget");
  ok((await view(p2.job)).ok === false, "…then it is no more");

  console.log("7 · «Pack a tileset as .3tz» writes with dtcstamp");
  const tiles = `${dir}/RB/tiles`;
  const pk = await post({ folder: tiles }, "/fs/pack-3tz");
  ok(pk.ok && pk.writer?.module === "dtcstamp.write_canonical_3tz" && pk.canonical?.canonical === true,
     `${pk.state}: ${pk.sha256?.slice(0, 19)}… canonical ${pk.canonical?.canonical} (${pk.writer?.module} ${pk.writer?.version})`);
  const again = await post({ folder: tiles }, "/fs/pack-3tz");
  ok(again.ok && again.state === "same" && again.sha256 === pk.sha256, "packed again: the same bytes, said so");
  ok(!existsSync(`${TOOLS}archive_3tz.py`), "tools/archive_3tz.py is gone (dtcstamp's is the one writer)");
} catch (exc) {
  fails.push(`threw: ${exc.stack ?? exc}`);
} finally {
  bridge.kill();
  fake.stdin.end();
  fake.kill();
}
if (fails.length) {
  console.log(`\nroom-import bridge: ${fails.length} FAILED of ${checks}\n  - ${fails.join("\n  - ")}`);
  if (process.env.VERBOSE) console.log(bridgeErr.slice(-4000));
  process.exit(1);
}
console.log(`\nroom-import bridge: ${checks} checks passed`);
process.exit(0);
