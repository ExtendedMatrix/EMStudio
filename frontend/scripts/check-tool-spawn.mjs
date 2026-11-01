// MICRO-BLENDER-SIDECAR · in the desktop app every Blender ended at once,
// «Blender exited -11»: the bridge's CHILD died inside fork(), in PROJ's
// pthread_atfork handler (pyproj, once proj.db is open) — before exec, so
// Blender never ran. The bridge now starts its tools without forking
// (posix_spawn: no atfork handler runs). Here a Python with an atfork child
// handler that aborts — what PROJ does, made certain — proves it: a fork dies
// (-6), run_tool, the Popen with popen_kw and Blender's open_gui do not. Plus
// what a tool gets: stdin closed, a session of its own, a cancel that ends its
// children, the environment without the frozen runtime's, the signal in words.
//
//   node scripts/check-tool-spawn.mjs
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const TOOLS = new URL("../../tools/", import.meta.url).pathname;
const S3D = process.env.S3DGRAPHY_DIR ?? new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = process.env.PYTHON ?? (existsSync(`${S3D}.venv/bin/python`) ? `${S3D}.venv/bin/python` : "python3");

let checks = 0;
const fails = [];
const ok = (cond, what) => { checks++; if (!cond) { fails.push(what); console.log(`  ✗ ${what}`); } else console.log(`  ✓ ${what}`); };

const PYTEST = String.raw`
import ctypes, json, os, subprocess, sys, tempfile, threading, time
sys.path.insert(0, sys.argv[1])
import em_optimize as O
import em_blender as BL
out = {}
tmp = tempfile.mkdtemp()

# the environment of a frozen bridge, cleaned for its tools
mei = os.path.join(tmp, "_MEI123")
os.makedirs(mei)
env = {"HOME": "/h", "PATH": mei + os.pathsep + "/usr/bin" + os.pathsep + "/bin", "_PYI_ARCHIVE_FILE": "/x",
       "_PYI_APPLICATION_HOME_DIR": mei, "PROJ_DATA": os.path.join(mei, "pyproj", "share"),
       "SSL_CERT_FILE": os.path.join(mei, "certifi", "cacert.pem"), "DYLD_LIBRARY_PATH": mei,
       "DYLD_LIBRARY_PATH_ORIG": "/opt/lib", "LD_LIBRARY_PATH": mei, "PYTHONPATH": mei, "KEEP": "yes"}
sys.frozen, sys._MEIPASS = True, mei
out["env"] = O.child_env(env)
del sys.frozen, sys._MEIPASS
out["env_plain"] = O.child_env({"PROJ_DATA": os.path.join(mei, "x")})

# words for a signal
out["say_segv"] = O.exit_say("Blender", -11, ["Read prefs", "", "Warning: something"])
out["say_silent"] = O.exit_say("Blender", -11, [])
out["say_rc"] = O.exit_say("Obj2Tiles", 3, ["boom"])

# PROJ's handler, made certain: any fork now aborts in the child, before exec
libc = ctypes.CDLL(None)
libc.pthread_atfork.argtypes = [ctypes.c_void_p] * 3
libc.pthread_atfork(None, None, ctypes.cast(libc.abort, ctypes.c_void_p))
out["fork"] = subprocess.run(["/usr/bin/true"]).returncode
out["popen_kw"] = subprocess.run(O.child_argv(["true"]), **O.popen_kw()).returncode
out["popen_kw_out"] = subprocess.run(O.child_argv(["echo", "hi"]), capture_output=True, text=True, **O.popen_kw()).stdout.strip()
lines = []
r = O.run_tool(["/bin/echo", "spawned"], lines.append, lambda: False)
out["run_tool"] = [r["returncode"], lines]
# stdin closed: cat ends at once instead of waiting for the bridge's stdin
r = O.run_tool(["cat"], lambda ln: None, lambda: False, timeout=20)
out["stdin"] = [r["returncode"], r["seconds"] < 5]
# a session of its own
lines = []
O.run_tool([sys.executable, "-c", "import os; print(os.getsid(0) == os.getpid())"], lines.append, lambda: False)
out["setsid"] = lines
# a signal that ends the tool, read back as words
r = O.run_tool(["/bin/sh", "-c", "echo last words; kill -SEGV $$"], lambda ln: None, lambda: False)
out["segv"] = [r["returncode"], O.exit_say("Blender", r["returncode"], r["tail"])]
# a cancel ends the tool's children too (its process group)
pidf = os.path.join(tmp, "child.pid")
stop = {"v": False}
def later():
    time.sleep(1.0)
    stop["v"] = True
threading.Thread(target=later, daemon=True).start()
try:
    O.run_tool(["/bin/sh", "-c", f"sleep 60 & echo $! > {pidf}; echo started; wait"], lambda ln: None, lambda: stop["v"])
    out["cancel"] = "not cancelled"
except O._Cancelled:
    time.sleep(0.5)
    cpid = int(open(pidf).read().strip())
    try:
        os.kill(cpid, 0)
        out["cancel"] = "child alive"
    except ProcessLookupError:
        out["cancel"] = "child gone"
# Blender with its interface, detached: a fake Blender that writes a file
fake = os.path.join(tmp, "Blender")
mark = os.path.join(tmp, "opened")
with open(fake, "w") as fh:
    fh.write("#!/bin/sh\necho \"$1\" > " + mark + "\n")
os.chmod(fake, 0o755)
g = BL.open_gui(fake, "/t/scene.blend")
for _ in range(50):
    if os.path.exists(mark):
        break
    time.sleep(0.1)
out["open_gui"] = [bool(g.get("pid")), open(mark).read().strip() if os.path.exists(mark) else None]
print(json.dumps(out))
`;
const pr = spawnSync(PY, ["-c", PYTEST, TOOLS], { encoding: "utf8", env: { ...process.env, PYTHONPATH: `${S3D}src` } });
if (pr.status !== 0) { console.error(pr.stderr); fails.push("the Python part ran"); }
const P = pr.status === 0 ? JSON.parse(pr.stdout.trim().split("\n").pop()) : {};
if (pr.status === 0) {
  const E = P.env;
  ok(!("_PYI_ARCHIVE_FILE" in E) && !("_PYI_APPLICATION_HOME_DIR" in E), "frozen: PyInstaller's _PYI_* are not the tool's");
  ok(!("PROJ_DATA" in E) && !("SSL_CERT_FILE" in E) && !("PYTHONPATH" in E) && !("LD_LIBRARY_PATH" in E),
     "frozen: variables pointing into the unpacked folder are dropped (PROJ_DATA, SSL_CERT_FILE, PYTHONPATH…)");
  ok(E.DYLD_LIBRARY_PATH === "/opt/lib" && !("DYLD_LIBRARY_PATH_ORIG" in E), "frozen: DYLD_LIBRARY_PATH given back as it was (_ORIG)");
  ok(E.PATH === "/usr/bin:/bin" && E.HOME === "/h" && E.KEEP === "yes", "frozen: PATH loses only the unpacked folder; the rest stays");
  ok("PROJ_DATA" in P.env_plain, "not frozen: the environment is left as it is");
  ok(/SIGSEGV \(segmentation fault, exit -11\): Read prefs \| Warning: something$/.test(P.say_segv),
     "a signal said in words with the last lines");
  ok(/SIGSEGV.*before writing anything$/.test(P.say_silent), "…and when it wrote nothing, that too");
  ok(P.say_rc === "Obj2Tiles exited 3: boom", "an exit code stays an exit code");
  ok(P.fork === -6, `with PROJ's kind of atfork handler a fork dies in the child (${P.fork})`);
  ok(P.popen_kw === 0 && P.popen_kw_out === "hi", "…a Popen with popen_kw does not fork: it runs (posix_spawn)");
  ok(P.run_tool[0] === 0 && P.run_tool[1].join() === "spawned", "…run_tool does not fork: the tool runs and is read");
  ok(P.open_gui[0] && P.open_gui[1] === "/t/scene.blend", "…Blender opened with its interface runs too (open_gui)");
  ok(P.stdin[0] === 0 && P.stdin[1], "the tool's stdin is closed (cat ends at once)");
  ok(P.setsid.join() === "True", "the tool leads a session of its own");
  ok(P.segv[0] === -11 && /SIGSEGV/.test(P.segv[1]) && /last words/.test(P.segv[1]), "a tool killed by SIGSEGV: the signal and its last line");
  ok(P.cancel === "child gone", `a cancel ends the tool's children too (${P.cancel})`);
}

console.log(`\n${checks - fails.length}/${checks} checks`);
if (fails.length) { console.log(`FAILED:\n  - ${fails.join("\n  - ")}`); process.exit(1); }
