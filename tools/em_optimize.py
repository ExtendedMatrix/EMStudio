"""MICRO-OTTIMIZZA-1 · the Ottimizza tab's engine room: ADD-ONS and JOBS.

ADD-ONS. The external tools are not inside the installer (E.D., 27 Oct 2026,
precisazione 2): each is downloaded ON REQUEST from its official release page,
at a FIXED version whose sha256 is written here, into the app's data folder
(``<state>/addons/<id>/<version>/``). Their licences stay their own — gltfpack
is MIT (meshoptimizer, Arseny Kapoulkine) — and the page says licence, source
and version before the download and in Settings, where they are updated and
removed.

JOBS. Every optimisation is a job of the bridge in a process of its own (the
tool is a subprocess; the bridge only waits for it, in a thread): a queue, the
progress the page polls (``GET /jobs?id=…&since=N``, as ``/room-import``),
a cancel that ends the process. ONE heavy job at a time, its memory said
before it starts; light jobs (pack .3tz, gltfpack, an add-on's download) run
side by side. EMStudio stays usable throughout: the page never waits on a
request that lasts.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import threading
import time
import uuid
import zipfile

# ── add-ons ──────────────────────────────────────────────────────────────────

#: The add-ons, by id. ``builds`` by platform key (:func:`platform_key`): the
#: official asset, its sha256 (the release page's own digest, checked here
#: against the bytes downloaded on 27 Oct 2026) and the file inside the zip.
#: gltfpack 1.3 (25 Sep 2026) has no build for Intel Macs: there the add-on is
#: 1.2 (30 Jun 2026), the last release that published one. Windows on ARM runs
#: the x64 build (emulated); Linux on ARM has no official build.
ADDONS = {
    "gltfpack": {
        "name": "gltfpack",
        "project": "meshoptimizer",
        "author": "Arseny Kapoulkine",
        "licence": "MIT",
        "licence_url": "https://github.com/zeux/meshoptimizer/blob/master/LICENSE.md",
        "source": "https://github.com/zeux/meshoptimizer/releases",
        "does": "glTF/OBJ → glb: simplification, quantisation, meshopt compression, KTX2 textures",
        "builds": {
            "darwin-arm64": {
                "version": "1.3", "asset": "gltfpack-macos.zip", "member": "gltfpack", "size": 1663661,
                "url": "https://github.com/zeux/meshoptimizer/releases/download/v1.3/gltfpack-macos.zip",
                "sha256": "1002fe6a437aa005eca541502c27b8d2b184f91f4ad0c6d282e3614a1e35e75a"},
            "darwin-x86_64": {
                "version": "1.2", "asset": "gltfpack-macos-intel.zip", "member": "gltfpack", "size": 1826692,
                "url": "https://github.com/zeux/meshoptimizer/releases/download/v1.2/gltfpack-macos-intel.zip",
                "sha256": "bcbd379f212552a84ca19fc986750ce8a4c3fd6c13344df6dbcff7bbf6bc121c"},
            "windows-x86_64": {
                "version": "1.3", "asset": "gltfpack-windows.zip", "member": "gltfpack.exe", "size": 1482895,
                "url": "https://github.com/zeux/meshoptimizer/releases/download/v1.3/gltfpack-windows.zip",
                "sha256": "f6e9c09d66af23da3da71b86f0652d2413e81c734e0aecd1cd3d0e6e6e8645c0"},
            "linux-x86_64": {
                "version": "1.3", "asset": "gltfpack-ubuntu.zip", "member": "gltfpack", "size": 1977681,
                "url": "https://github.com/zeux/meshoptimizer/releases/download/v1.3/gltfpack-ubuntu.zip",
                "sha256": "0666d9dc40d60fe5b9a45f3fc24f8e6ca87112974bd5de9ca57152aa13d06017"},
        },
    },
}
ADDONS["gltfpack"]["builds"]["windows-arm64"] = ADDONS["gltfpack"]["builds"]["windows-x86_64"]

# MICRO-OTTIMIZZA-2 · Obj2Tiles (OpenDroneMap, AGPL-3.0): a textured OBJ → a 3D
# Tiles tileset with its levels of detail. CALLED as a program of its own by
# the bridge, never linked: its licence stays its own, and the tab and Settings
# say it with its source. v1.8.0 (14 Oct 2026) publishes Osx64, Win64,
# WinArm64, Linux64, LinuxArm64; each zip holds the program and the libktx it
# loads beside itself (``extra``). On a Mac with Apple Silicon the Osx64 build
# runs under Rosetta 2 (``emulated``) until upstream publishes
# ``Obj2Tiles-OsxArm64.zip`` (E.D.'s OpenDroneMap/Obj2Tiles PR #107): that day
# the ``darwin-arm64`` entry is that asset and its digest, nothing else.
_O2T = "https://github.com/OpenDroneMap/Obj2Tiles/releases/download/v1.8.0/"
ADDONS["obj2tiles"] = {
    "name": "Obj2Tiles",
    "project": "OpenDroneMap",
    "author": "OpenDroneMap contributors (Luca Di Leo, Piero Toffanin)",
    "licence": "AGPL-3.0",
    "licence_url": "https://github.com/OpenDroneMap/Obj2Tiles/blob/master/LICENSE.md",
    "source": "https://github.com/OpenDroneMap/Obj2Tiles/releases",
    "does": "textured OBJ → Cesium 3D Tiles: decimation per level of detail, spatial splitting, tiling",
    "heavy": True,
    # below this a survey's mesh rarely fits (round 2: 1.1 GB of OBJ → 3.1 GB)
    "min_memory_mb": 8192,
    "builds": {
        "darwin-x86_64": {
            "version": "1.8.0", "asset": "Obj2Tiles-Osx64.zip", "member": "Obj2Tiles", "extra": ["libktx.dylib"],
            "size": 11113512, "url": _O2T + "Obj2Tiles-Osx64.zip",
            "sha256": "2f843f40ba23f535953ccfc19103549a80fba953d6483a21fe8a9e48545548b3"},
        "windows-x86_64": {
            "version": "1.8.0", "asset": "Obj2Tiles-Win64.zip", "member": "Obj2Tiles.exe", "extra": ["ktx.dll"],
            "size": 22160647, "url": _O2T + "Obj2Tiles-Win64.zip",
            "sha256": "762cc3500af613dda8c601d70d503218298b0d6dc45a91a9133d04134e3005c6"},
        "windows-arm64": {
            "version": "1.8.0", "asset": "Obj2Tiles-WinArm64.zip", "member": "Obj2Tiles.exe", "extra": ["ktx.dll"],
            "size": 21034189, "url": _O2T + "Obj2Tiles-WinArm64.zip",
            "sha256": "089523f069cc61c76043a7b4f86e5102fcf07b11c2798ee07e456f286b695c87"},
        "linux-x86_64": {
            "version": "1.8.0", "asset": "Obj2Tiles-Linux64.zip", "member": "Obj2Tiles", "extra": ["libktx.so"],
            "size": 11391412, "url": _O2T + "Obj2Tiles-Linux64.zip",
            "sha256": "f50663075d6b4ebff46e0e52fd365d9b8f78d6b5b9f4c9f07d56866f5a6f7de9"},
        "linux-arm64": {
            "version": "1.8.0", "asset": "Obj2Tiles-LinuxArm64.zip", "member": "Obj2Tiles", "extra": ["libktx.so"],
            "size": 10962078, "url": _O2T + "Obj2Tiles-LinuxArm64.zip",
            "sha256": "1903851bb5da073b7e239b09094f694ceeb8fbffe0f1ce68fdb0b1575768da77"},
    },
}
ADDONS["obj2tiles"]["builds"]["darwin-arm64"] = {**ADDONS["obj2tiles"]["builds"]["darwin-x86_64"],
                                                 "emulated": "Rosetta 2"}

# MICRO-OTTIMIZZA-2 · Cesium's 3d-tiles-validator (Apache-2.0): the judge of
# every tileset before it enters the graph. It is a Node program: installed by
# the npm of this machine from the npm registry at a FIXED version whose
# tarball integrity (sha512, the registry's own) is checked in the lockfile
# npm writes; ``sharp`` is then rebuilt (its prebuilt image library), the
# other install scripts never run. Without Node the add-on says so, and a
# tileset is judged by EMStudio's own structural check, said as such.
ADDONS["tiles-validator"] = {
    "name": "3d-tiles-validator",
    "project": "Cesium",
    "author": "Cesium GS, Inc. and contributors",
    "licence": "Apache-2.0",
    "licence_url": "https://github.com/CesiumGS/3d-tiles-validator/blob/main/LICENSE.md",
    "source": "https://www.npmjs.com/package/3d-tiles-validator",
    "does": "validates a 3D Tiles tileset (tileset.json, its contents, glTF) against the specification",
    "npm": {"package": "3d-tiles-validator", "version": "0.6.1",
            "integrity": "sha512-6cf4ut8uaej8TFNcHpSm7B3WwYnDBCoPeJPzFKo4kcXw/yXeqIMYKfRDj04VmqC1Zp9H8zBZ84w+GlWEQUgUag==",
            "main": "node_modules/3d-tiles-validator/build/main.js", "rebuild": ["sharp"],
            "size": 220_000_000},
    "builds": {},
}


def platform_key() -> str:
    """``darwin-arm64`` · ``darwin-x86_64`` · ``windows-x86_64`` · ``linux-x86_64`` …"""
    system = {"darwin": "darwin", "win32": "windows", "cygwin": "windows"}.get(sys.platform, "linux")
    machine = platform.machine().lower()
    machine = {"amd64": "x86_64", "x64": "x86_64", "aarch64": "arm64"}.get(machine, machine)
    return f"{system}-{machine}"


def state_dir() -> pathlib.Path:
    """The app's data folder (the bridge's state folder, as the room import's)."""
    return pathlib.Path(os.environ.get("EM_BRIDGE_STATE_DIR")
                        or (pathlib.Path.home() / ".config" / "emstudio"))


def addons_dir() -> pathlib.Path:
    return pathlib.Path(os.environ.get("EM_ADDONS_DIR") or (state_dir() / "addons"))


def _manifest_path(addon_id: str) -> pathlib.Path:
    return addons_dir() / addon_id / "installed.json"


def installed(addon_id: str):
    """What is installed of this add-on: ``{version, path, sha256, at, asset}``
    or None (also when its file is gone)."""
    try:
        m = json.loads(_manifest_path(addon_id).read_text("utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(m, dict) or not os.path.isfile(str(m.get("path") or "")):
        return None
    return m


def node_tool():
    """Node and npm of this machine (``EM_NODE``, the PATH): ``{node, npm,
    version}`` or None. The validator add-on needs them."""
    node = os.environ.get("EM_NODE") or shutil.which("node") or ""
    npm = shutil.which("npm", path=os.path.dirname(node) + os.pathsep + os.environ.get("PATH", "")) if node else None
    if not node or not os.path.isfile(node):
        return None
    try:
        v = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return None
    return {"node": node, "npm": npm or "", "version": v}


def rosetta_ready() -> bool:
    """Can this Mac run an x86_64 program (Rosetta 2 installed)?"""
    if platform_key() != "darwin-arm64":
        return True
    try:
        return subprocess.run(["/usr/bin/arch", "-x86_64", "/usr/bin/true"], capture_output=True, timeout=10).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _build_of(addon_id: str):
    spec = ADDONS[addon_id]
    if spec.get("npm"):
        n = spec["npm"]
        return {"version": n["version"], "url": f"npm:{n['package']}@{n['version']}", "sha256": n["integrity"],
                "size": n["size"], "asset": f"{n['package']}-{n['version']}.tgz", "member": n["main"]}
    return spec["builds"].get(platform_key())


def addon_state(addon_id: str) -> dict:
    spec = ADDONS[addon_id]
    key = platform_key()
    build = _build_of(addon_id)
    have = installed(addon_id)
    out = {"id": addon_id, "name": spec["name"], "project": spec["project"], "author": spec["author"],
           "licence": spec["licence"], "licence_url": spec["licence_url"], "source": spec["source"],
           "does": spec["does"], "platform": key,
           "available": build is not None,
           "version": build["version"] if build else None,
           "url": build["url"] if build else None,
           "sha256": build["sha256"] if build else None,
           "size": build["size"] if build else None,
           "installed": have,
           "upgradable": bool(have and build and have.get("version") != build["version"]),
           "folder": str(addons_dir() / addon_id)}
    if build and build.get("emulated"):
        # the x86_64 build on Apple Silicon: said, and whether Rosetta is here
        out["emulated"] = build["emulated"]
        out["emulator_ready"] = rosetta_ready()
    if spec.get("npm"):
        node = node_tool()
        out["needs"] = "node"
        out["node"] = node["version"] if node else None
        out["available"] = bool(node and node.get("npm"))
    out["fit"] = addon_fit(spec, out, memory_total_mb())
    return out


def addon_fit(spec: dict, state: dict, memory_mb: int) -> dict:
    """Whether the add-on suits THIS machine, and why not (MICRO-OTTIMIZZA-3,
    E.D. 28 Oct: Settings › Add-ons lists them filtered for the hardware and
    the system): ``code`` is ``ok``, ``emulated`` (it runs, translated),
    ``memory`` (it runs, but the machine has less than it wants), or — not
    suitable — ``no_build`` (nothing published for this platform),
    ``no_emulator`` (the x86_64 build without Rosetta) or ``needs_node``."""
    if spec.get("npm") and not state.get("available"):
        return {"ok": False, "code": "needs_node"}
    if not state.get("available"):
        return {"ok": False, "code": "no_build", "platform": state.get("platform")}
    if state.get("emulated") and not state.get("emulator_ready"):
        return {"ok": False, "code": "no_emulator", "emulator": state["emulated"]}
    want = int(spec.get("min_memory_mb") or 0)
    if want and memory_mb and memory_mb < want:
        return {"ok": True, "code": "memory", "want_mb": want, "have_mb": memory_mb}
    if state.get("emulated"):
        return {"ok": True, "code": "emulated", "emulator": state["emulated"]}
    return {"ok": True, "code": "ok"}


def machine() -> dict:
    """This machine as the add-ons care about it: the system, the processor
    (Apple Silicon, Intel, AMD, ARM), the memory and the graphics — Metal on a
    Mac, CUDA where ``nvidia-smi`` answers. Asked once, remembered."""
    global _MACHINE
    if _MACHINE is not None:
        return _MACHINE
    key = platform_key()
    system, arch = key.split("-", 1)
    cpu = platform.processor() or ""
    if system == "darwin":
        try:
            cpu = subprocess.run(["/usr/sbin/sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True,
                                 text=True, timeout=3).stdout.strip() or cpu
        except (OSError, subprocess.TimeoutExpired):
            pass
    chip = ("apple_silicon" if system == "darwin" and arch == "arm64"
            else "intel" if "intel" in cpu.lower() or (system == "darwin" and arch == "x86_64")
            else "amd" if "amd" in cpu.lower() else "arm" if arch == "arm64" else arch)
    gpus = []
    if system == "darwin":
        gpus.append({"api": "Metal", "name": cpu if chip == "apple_silicon" else ""})
    smi = shutil.which("nvidia-smi")
    if smi:
        try:
            names = subprocess.run([smi, "--query-gpu=name", "--format=csv,noheader"], capture_output=True,
                                   text=True, timeout=5).stdout
            gpus += [{"api": "CUDA", "name": n.strip()} for n in names.splitlines() if n.strip()]
        except (OSError, subprocess.TimeoutExpired):
            pass
    _MACHINE = {"platform": key, "system": system, "arch": arch, "chip": chip, "cpu": cpu,
                "memory_mb": memory_total_mb(), "gpus": gpus}
    return _MACHINE


_MACHINE = None


def all_addons() -> list:
    return [addon_state(a) for a in ADDONS]


def tool_path(addon_id: str):
    have = installed(addon_id)
    return have["path"] if have else None


def install(addon_id: str, job=None, *, fetch=None) -> dict:
    """Download the pinned build, check its sha256, put its one file in
    ``<addons>/<id>/<version>/``; an older version there is removed after the
    new one is in place. ``fetch(url) → file-like`` is the network (tests
    give their own). Raises on a wrong digest: nothing is installed."""
    spec = ADDONS.get(addon_id)
    if spec is None:
        raise ValueError(f"unknown add-on {addon_id!r}")
    if spec.get("npm"):
        return _install_npm(addon_id, job)
    build = spec["builds"].get(platform_key())
    if build is None:
        raise RuntimeError(f"{spec['name']} publishes no build for {platform_key()}")
    mirror = os.environ.get("EM_ADDONS_FROM")
    if fetch is None and mirror:
        # a folder holding the official assets by name (an institution's
        # mirror, a machine offline, the checks): the digest is checked the same
        fetch = lambda u: open(os.path.join(mirror, u.rsplit("/", 1)[-1]), "rb")
    if fetch is None:
        # every HTTPS request through em_net (certifi's CAs: check-bridge-tls)
        import urllib.request
        import em_net
        fetch = lambda u: em_net.urlopen(urllib.request.Request(u, headers={"User-Agent": "EMStudio"}), timeout=60)
    say = (job.say if job else (lambda *_a, **_k: None))
    say(f"download {build['url']}")
    h = hashlib.sha256()
    buf = io.BytesIO()
    with fetch(build["url"]) as r:
        headers = getattr(r, "headers", None) or {}
        total = int(headers.get("Content-Length") or build["size"] or 0)
        while True:
            if job and job.cancel.is_set():
                raise _Cancelled()
            chunk = r.read(1 << 16)
            if not chunk:
                break
            h.update(chunk)
            buf.write(chunk)
            if job and total:
                job.progress = min(0.95, buf.tell() / total)
    got = h.hexdigest()
    if got != build["sha256"]:
        raise RuntimeError(f"sha256 {got} is not the pinned {build['sha256']}: nothing installed")
    say(f"sha256 {got} = pinned")
    home = addons_dir() / addon_id
    dest_dir = home / build["version"]
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(buf) as z:
        # the program, and what it loads beside itself (Obj2Tiles' libktx)
        for member in [build["member"], *build.get("extra", [])]:
            data = z.read(member)
            out = dest_dir / os.path.basename(member)
            tmp = out.with_name(out.name + ".part")
            tmp.write_bytes(data)
            os.chmod(tmp, 0o755)
            os.replace(tmp, out)
    dest = dest_dir / build["member"]
    manifest = {"version": build["version"], "path": str(dest), "asset": build["asset"],
                "sha256": build["sha256"], "url": build["url"], "licence": spec["licence"],
                "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    _manifest_path(addon_id).write_text(json.dumps(manifest, indent=1), "utf-8")
    for old in home.iterdir():
        if old.is_dir() and old.name != build["version"]:
            shutil.rmtree(old, ignore_errors=True)
    say(f"installed {spec['name']} {build['version']} in {dest_dir}")
    return addon_state(addon_id)


def _install_npm(addon_id: str, job=None) -> dict:
    """The validator: ``npm install`` of the pinned version into
    ``<addons>/<id>/<version>/`` with every install script off, ``sharp``
    rebuilt alone, and the package's tarball integrity read back from the
    lockfile npm wrote against the pinned one (another → nothing installed)."""
    spec = ADDONS[addon_id]
    n = spec["npm"]
    node = node_tool()
    if not node or not node.get("npm"):
        raise RuntimeError(f"{spec['name']} is a Node.js program: install Node.js 18 or newer (nodejs.org), then try again")
    say = (job.say if job else (lambda *_a, **_k: None))
    home = addons_dir() / addon_id
    dest_dir = home / n["version"]
    part = home / (n["version"] + ".part")
    shutil.rmtree(part, ignore_errors=True)
    part.mkdir(parents=True, exist_ok=True)
    (part / "package.json").write_text(json.dumps({"name": "emstudio-addon", "private": True}), "utf-8")
    steps = [[node["npm"], "install", "--prefix", str(part), f"{n['package']}@{n['version']}",
              "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact"]]
    steps += [[node["npm"], "rebuild", r, "--prefix", str(part)] for r in n.get("rebuild", [])]
    for i, cmd in enumerate(steps):
        say(" ".join(["npm"] + cmd[1:]))
        if job:
            job.progress = 0.1 + 0.8 * i / len(steps)
            run = job.run_process(cmd, timeout=900)
        else:
            run = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        if run.returncode != 0:
            raise RuntimeError(f"npm: {(run.stderr or run.stdout or '').strip()[-400:]}")
    try:
        lock = json.loads((part / "package-lock.json").read_text("utf-8"))
        # the key is ``node_modules/<pkg>``, or a path to it when the prefix
        # passes through a link (/tmp → /private/tmp on a Mac): the shortest
        keys = [k for k in lock["packages"] if k == f"node_modules/{n['package']}"
                or k.endswith(f"/node_modules/{n['package']}") and k.count("node_modules/") == 1]
        got = lock["packages"][min(keys, key=len)]["integrity"]
    except (OSError, ValueError, KeyError) as exc:  # min() of nothing is a ValueError
        raise RuntimeError(f"npm wrote no integrity for {n['package']}: {exc}")
    if got != n["integrity"]:
        raise RuntimeError(f"integrity {got} is not the pinned {n['integrity']}: nothing installed")
    say(f"integrity {got[:24]}… = pinned")
    main = part / n["main"]
    if not main.is_file():
        raise RuntimeError(f"{n['main']} is not in the package")
    shutil.rmtree(dest_dir, ignore_errors=True)
    os.replace(part, dest_dir)
    manifest = {"version": n["version"], "path": str(dest_dir / n["main"]), "asset": f"{n['package']}@{n['version']}",
                "sha256": n["integrity"], "url": f"https://registry.npmjs.org/{n['package']}", "licence": spec["licence"],
                "node": node["version"], "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    _manifest_path(addon_id).write_text(json.dumps(manifest, indent=1), "utf-8")
    for old in home.iterdir():
        if old.is_dir() and old.name != n["version"]:
            shutil.rmtree(old, ignore_errors=True)
    say(f"installed {spec['name']} {n['version']} in {dest_dir}")
    return addon_state(addon_id)


def remove(addon_id: str) -> dict:
    if addon_id not in ADDONS:
        raise ValueError(f"unknown add-on {addon_id!r}")
    home = addons_dir() / addon_id
    if home.is_dir():
        shutil.rmtree(home, ignore_errors=True)
    return addon_state(addon_id)


# ── the jobs ─────────────────────────────────────────────────────────────────

class _Cancelled(Exception):
    pass


_LOCK = threading.RLock()
_JOBS: dict = {}
#: one heavy job at a time (a tileset of the next round); light ones in parallel
_HEAVY = threading.Semaphore(1)
_KEEP_DONE = 20


class Job:
    def __init__(self, kind: str, params: dict, *, heavy: bool = False, estimate_mb=None, label: str = ""):
        self.id = uuid.uuid4().hex[:12]
        self.kind = kind
        self.label = label or kind
        self.params = params
        self.heavy = heavy
        self.estimate_mb = estimate_mb
        self.state = "queued"
        self.progress = 0.0
        self.stage = ""
        self.lines: list = []
        self.result = None
        self.error = None
        self.created = time.time()
        self.started = None
        self.ended = None
        self.cancel = threading.Event()
        self.proc = None
        #: a batch's rows (MICRO-OTTIMIZZA-2): one per file, its own state,
        #: progress and cancel
        self.items: list = []

    def say(self, line: str, echo: bool = True):
        with _LOCK:
            self.lines.append(f"{time.strftime('%H:%M:%S')} {line}")
            del self.lines[:-500]
        if echo:
            sys.stderr.write(f"  [job {self.id} {self.kind}] {line}\n")

    def run_process(self, cmd: list, timeout: float = 3600):
        """The tool in a process of its own; cancel ends it. → CompletedProcess."""
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        t0 = time.time()
        try:
            while True:
                try:
                    out, err = self.proc.communicate(timeout=0.25)
                    return subprocess.CompletedProcess(cmd, self.proc.returncode, out, err)
                except subprocess.TimeoutExpired:
                    if self.cancel.is_set():
                        self.proc.terminate()
                        try:
                            self.proc.wait(5)
                        except subprocess.TimeoutExpired:
                            self.proc.kill()
                        raise _Cancelled()
                    if time.time() - t0 > timeout:
                        self.proc.kill()
                        raise TimeoutError(f"{os.path.basename(cmd[0])} ran over {int(timeout)} s")
        finally:
            self.proc = None

    def view(self, since: int = 0) -> dict:
        with _LOCK:
            return {"ok": True, "id": self.id, "kind": self.kind, "label": self.label, "state": self.state,
                    "progress": round(self.progress, 3), "stage": self.stage, "heavy": self.heavy,
                    "estimate_mb": self.estimate_mb, "params": self.params,
                    "lines": self.lines[since:], "next": len(self.lines),
                    "result": self.result, "error": self.error,
                    "items": [{k: v for k, v in it.items()} for it in self.items],
                    "created": self.created, "started": self.started, "ended": self.ended}


def _run(job: Job, target):
    gate = _HEAVY if job.heavy else None
    if gate:
        if not gate.acquire(blocking=False):
            job.stage = "waiting"
            job.say("waiting for the heavy job before it")
            gate.acquire()
    try:
        if job.cancel.is_set():
            raise _Cancelled()
        job.state = "running"
        job.started = time.time()
        job.result = target(job)
        job.progress = 1.0
        job.state = "done"
        job.say("done")
    except _Cancelled:
        job.state = "cancelled"
        job.say("cancelled")
    except Exception as exc:  # noqa: BLE001 — every failure is the job's answer
        import traceback
        traceback.print_exc()
        job.state = "failed"
        job.error = str(exc)
        job.say(f"failed: {exc}")
    finally:
        job.ended = time.time()
        if gate:
            gate.release()


def submit(kind: str, params: dict, target, *, heavy: bool = False, estimate_mb=None, label: str = "") -> Job:
    job = Job(kind, params, heavy=heavy, estimate_mb=estimate_mb, label=label)
    with _LOCK:
        finished = [j for j in _JOBS.values() if j.state in ("done", "failed", "cancelled")]
        for old in sorted(finished, key=lambda j: j.created)[:-_KEEP_DONE]:
            _JOBS.pop(old.id, None)
        _JOBS[job.id] = job
    if estimate_mb:
        job.say(f"asks about {estimate_mb} MB of memory")
    threading.Thread(target=_run, args=(job, target), daemon=True, name=f"job-{kind}-{job.id}").start()
    return job


def get(job_id: str):
    return _JOBS.get(job_id)


def cancel(job_id: str, item=None) -> bool:
    """Cancel a job, or ONE file of a batch (``item``: its index)."""
    job = _JOBS.get(job_id)
    if job is None:
        return False
    if item is not None:
        try:
            job.items[int(item)]["cancel"] = True
        except (IndexError, ValueError, TypeError):
            return False
        return True
    job.cancel.set()
    return True


def listing() -> list:
    with _LOCK:
        return [{k: v for k, v in j.view(len(j.lines)).items() if k not in ("lines",)}
                for j in sorted(_JOBS.values(), key=lambda j: j.created)]


# ── the variants' destinations (the round-0 verdict, now with compression) ──

#: Per destination: the share of triangles kept, the texture limit, whether the
#: textures become KTX2 and the geometry meshopt-compressed (both read by the
#: Viewer since this round), the uses of the version (s3Dgraphy's USES).
#: Heriverse/ATON and print stay whole and uncompressed: nobody has yet proved
#: that Heriverse reads meshopt/KTX2, and a print wants the geometry as it is.
PRESETS = {
    "web": {"lod": "lod4", "destination": "web", "ratio": 0.1, "texture_px": 1024,
            "ktx2": True, "meshopt": True, "quantize": True, "use": ["web"]},
    "mobile": {"lod": "lod4", "destination": "mobile", "ratio": 0.05, "texture_px": 512,
               "ktx2": True, "meshopt": True, "quantize": True, "use": ["mobile_ar"]},
    "heriverse": {"lod": "lod3", "destination": "aton-heriverse", "ratio": 1.0, "texture_px": 0,
                  "ktx2": False, "meshopt": False, "quantize": False, "use": ["heriverse", "aton"]},
    "print": {"lod": "lod1", "destination": "print", "ratio": 1.0, "texture_px": 0,
              "ktx2": False, "meshopt": False, "quantize": False, "use": ["print"]},
    # the «experiences» (Blender, Unreal): their engine is Blender + 3DSC
    # (round 3); by gltfpack meanwhile, uncompressed — Unreal's glTF importer
    # reads neither meshopt nor KTX2
    "experience": {"lod": "lod3", "destination": "realtime", "ratio": 0.25, "texture_px": 0,
                   "ktx2": False, "meshopt": False, "quantize": False, "use": ["realtime"]},
}


def gltfpack_command(tool: str, source: str, out: str, p: dict) -> list:
    """The command line of a preset. ``-noq`` when not quantised; ``-cc`` the
    meshopt compression (``EXT_meshopt_compression``); ``-tc`` the KTX2
    textures (``KHR_texture_basisu``) with ``-tl`` their limit — gltfpack
    resizes textures only together with KTX2."""
    cmd = [tool, "-i", source, "-o", out]
    ratio = float(p.get("ratio") or 1.0)
    if ratio < 1.0:
        cmd += ["-si", f"{ratio:g}"]
    if not p.get("quantize"):
        cmd.append("-noq")
    if p.get("meshopt"):
        cmd.append("-cc")
    if p.get("ktx2"):
        cmd.append("-tc")
        if p.get("texture_px"):
            cmd += ["-tl", str(int(p["texture_px"]))]
    return cmd


def glb_facts(path: str) -> dict:
    """What a glb holds, read from its JSON chunk: faces and vertices (the
    accessors' counts, which meshopt leaves declared), the images and their
    largest side when the header says it (PNG, JPEG, KTX2), the extensions."""
    out = {"faces": 0, "vertices": 0, "texture_count": 0, "texture_side_px": None, "extensions": []}
    try:
        with open(path, "rb") as f:
            data = f.read()
        if data[:4] != b"glTF":
            return out
        n = int.from_bytes(data[12:16], "little")
        gltf = json.loads(data[20:20 + n].decode("utf-8"))
        binstart = 20 + n + 8
    except (OSError, ValueError):
        return out
    acc = gltf.get("accessors") or []
    for mesh in gltf.get("meshes") or []:
        for prim in mesh.get("primitives") or []:
            if prim.get("mode", 4) != 4:
                continue
            pos = (prim.get("attributes") or {}).get("POSITION")
            if isinstance(pos, int) and pos < len(acc):
                out["vertices"] += int(acc[pos].get("count") or 0)
            idx = prim.get("indices")
            if isinstance(idx, int) and idx < len(acc):
                out["faces"] += int(acc[idx].get("count") or 0) // 3
            elif isinstance(pos, int) and pos < len(acc):
                out["faces"] += int(acc[pos].get("count") or 0) // 3
    out["extensions"] = sorted(gltf.get("extensionsUsed") or [])
    images = gltf.get("images") or []
    out["texture_count"] = len(images)
    views = gltf.get("bufferViews") or []
    side = 0
    for im in images:
        bv = im.get("bufferView")
        if not isinstance(bv, int) or bv >= len(views):
            continue
        off = binstart + int(views[bv].get("byteOffset") or 0)
        head = data[off:off + 64 * 1024]
        side = max(side, _image_side(head) or 0)
    out["texture_side_px"] = side or None
    return out


def _image_side(b: bytes):
    if b[:8] == b"\x89PNG\r\n\x1a\n" and len(b) >= 24:
        return max(int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big"))
    if b[:12] == b"\xabKTX 20\xbb\r\n\x1a\n" and len(b) >= 28:
        return max(int.from_bytes(b[20:24], "little"), int.from_bytes(b[24:28], "little"))
    if b[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(b):
            if b[i] != 0xFF:
                i += 1
                continue
            marker = b[i + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                return max(int.from_bytes(b[i + 5:i + 7], "big"), int.from_bytes(b[i + 7:i + 9], "big"))
            i += 2 + int.from_bytes(b[i + 2:i + 4], "big")
    return None


# ── MICRO-OTTIMIZZA-2 · a tileset from a textured mesh (Obj2Tiles) ───────────

#: The measures that fix our preset (27 Oct 2026, Osx64 build under Rosetta on
#: an M-series Mac): the medium model of Templu Mare (OB_PODIO_LOD1, 448.734
#: triangles, 47 MB of OBJ, one 2048 px texture) with Obj2Tiles' own default
#: depth (-d 2, octree, z-split) wrote 3.769 files in 59 s; -d 3 27.350 files in
#: 215 s; with the z-split off and -d 0, 22 files, 16 leaves of 10–42 thousand
#: triangles, 23 MB, in 18.7 s and 1.0 GB. A leaf of some 30 thousand
#: triangles is the aim; the root carries no content (the round-0 root of the
#: whole temple was a 76 MB glb).
TILE_TRIANGLES = 30_000
#: an OBJ line of a triangle with its vertex, uv and normal share (measured:
#: 47 MB / 448.734 triangles, 949 MB / 8.403.502)
OBJ_BYTES_PER_TRIANGLE = 108


def tileset_depth(triangles: int, lods: int = 3) -> dict:
    """``{lods, divisions, leaves}`` for Obj2Tiles with ``--octree
    --no-zsplit`` (a quadtree: the finest level sits ``divisions + lods - 1``
    splits down, 4 leaves per split): the fewest splits that bring a leaf near
    :data:`TILE_TRIANGLES`; a small model gets fewer levels of detail instead
    of a negative depth."""
    tri = max(1, int(triangles))
    k = 0
    while tri / (4 ** k) > TILE_TRIANGLES * 1.5 and k < 8:
        k += 1
    lods = max(1, min(int(lods), k + 1))
    return {"lods": lods, "divisions": max(0, k - (lods - 1)), "leaves": 4 ** k}


def tileset_memory_mb(obj_bytes: int, texture_bytes: int) -> int:
    """The memory Obj2Tiles asks, said before it starts — on the CAUTIOUS
    side: 400 MB, plus 24 × (the OBJ in MB)^0.95, plus 5 × its textures.
    Measured on 27 Oct 2026 (Osx64 under Rosetta, our preset): OB_PODIO_LOD2
    (9 MB) 279 MB, OB_PODIO_LOD1 (45 MB) 951 MB, OB_PODIO_LOD0 (90 MB) 2.051
    MB, the whole temple OB_PRATO_LOD0 (905 MB + 153 MB of textures) 13.218
    MB; this says 589, 1.294, 2.182 and 16.580."""
    mb = 1024 * 1024
    return int(400 + 24 * (max(0, obj_bytes) / mb) ** 0.95 + 5 * max(0, texture_bytes) / mb)


def memory_total_mb() -> int:
    try:
        if sys.platform == "win32":
            import ctypes

            class _MS(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
            st = _MS()
            st.dwLength = ctypes.sizeof(_MS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))
            return int(st.ullTotalPhys // (1024 * 1024))
        return int(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") // (1024 * 1024))
    except (OSError, ValueError, AttributeError):
        return 8192


def memory_ceiling_mb() -> int:
    """The ceiling the tileset jobs never pass together: 60% of this machine's
    memory (the rest is the system's, EMStudio's and the browser's), or
    ``EM_TILES_MEMORY_MB``."""
    try:
        return int(os.environ["EM_TILES_MEMORY_MB"])
    except (KeyError, ValueError):
        return int(memory_total_mb() * 0.6)


def _set_bytes(source: str) -> tuple:
    """(obj bytes, bytes of what it calls: mtl and textures)."""
    obj = os.path.getsize(source)
    rest = 0
    try:
        import dtcstamp
        for m in dtcstamp.follow_references(source)["members"]:
            p = m.get("path") if isinstance(m, dict) else m
            full = p if os.path.isabs(str(p)) else os.path.join(os.path.dirname(source), str(p))
            if os.path.realpath(full) != os.path.realpath(source) and os.path.isfile(full):
                rest += os.path.getsize(full)
    except Exception:  # noqa: BLE001 — without dtcstamp: the obj alone
        pass
    return obj, rest


def tileset_plan_one(source: str, out_dir: str) -> dict:
    """What one OBJ will be: its folder, the levels and depth, the triangles
    (estimated from the bytes), the memory it asks."""
    obj, rest = _set_bytes(source)
    tri = int(obj / OBJ_BYTES_PER_TRIANGLE)
    depth = tileset_depth(tri)
    exists = os.path.exists(out_dir + ".3tz")
    leftover = not exists and os.path.exists(out_dir)
    return {"source": source, "folder": out_dir, "path": out_dir + ".3tz", "name": os.path.basename(out_dir),
            "exists": exists,
            # a folder without its archive: a tileset that did not pass the
            # validator (kept to see why), or someone's — never written over
            **({"error": f"{os.path.basename(out_dir)}/ is there without its .3tz (a tileset that did not pass "
                         f"the validator?): move it away to make it again"} if leftover else {}),
            "bytes_in": obj, "bytes_calls": rest, "triangles_est": tri, **depth,
            "estimate_mb": tileset_memory_mb(obj, rest)}


def obj2tiles_tool():
    """``EM_OBJ2TILES`` (explicit, for whoever develops — E.D.'s native
    osx-arm64 build, a fake in the checks), then the add-on, then the PATH.
    → ``{path, version, addon, progress, emulated}`` or None. ``progress``:
    the program writes JSON progress lines (``--progress``, proposed upstream
    from E.D.'s fork); else the progress is estimated from its phase lines."""
    addon = tool_path("obj2tiles") or ""
    for c in (os.environ.get("EM_OBJ2TILES") or "", addon, shutil.which("Obj2Tiles") or ""):
        if not c or not os.path.isfile(c):
            continue
        version, progress = "", False
        try:
            run = subprocess.run([c, "--help"], capture_output=True, text=True, timeout=60)
            text = (run.stdout or "") + (run.stderr or "")
            head = text.strip().splitlines()
            version = head[0].strip() if head else ""
            progress = "--progress" in text
        except (OSError, subprocess.TimeoutExpired):
            pass
        build = ADDONS["obj2tiles"]["builds"].get(platform_key()) or {}
        return {"path": c, "version": version, "addon": bool(addon) and c == addon, "progress": progress,
                "emulated": build.get("emulated") if (bool(addon) and c == addon) else None}
    return None


def obj2tiles_command(tool: str, source: str, out_dir: str, plan: dict, *, progress: bool = False) -> list:
    """Our preset: Obj2Tiles' ``standard`` (octree, local, JPEG 80/90, glb
    contents, Quality decimation) with the z-split OFF (a survey is wider than
    tall: a quadtree), the depth from the model's size, no root content, the
    geometric errors from the coarsest level's bounding box."""
    cmd = [tool, "--preset", "standard", "--no-zsplit", "--lods", str(plan["lods"]),
           "-d", str(plan["divisions"]), "--no-root-content",
           # the errors from the coarsest level's diagonal, halved per level
           # (leaves 0): with the default (the average edge) the root of the
           # medium model said 0.27 m on 15 m, and no viewer ever refined it —
           # without root content nothing was drawn (27 Oct 2026, measured)
           "--error-estimation-mode", "ToplevelBoundingBoxDiagonal"]
    if progress:
        cmd.append("--progress")
    return cmd + [source, out_dir]


class O2TProgress:
    """The share done of one Obj2Tiles run. Its JSON lines when it writes them
    (``{"stage", "done", "total", "percent"}``); else an ESTIMATE BY PHASES
    from the lines it prints today (v1.8.0): decimation (one ``Output:`` per
    level after the first, 30%), splitting (``[LOD-i-Mesh-k/T] Done``, 55%),
    tiling (``Converting to glb``, 15%)."""

    WEIGHTS = {"decimation": (0.0, 0.30), "splitting": (0.30, 0.55), "tiling": (0.85, 0.15)}

    def __init__(self, lods: int, leaves: int):
        self.lods = max(1, lods)
        self.stage = "decimation"
        self.share = 0.0
        self.estimated = True
        self.decimated = 0
        # the tiles of the splitting stage: level i (0 the finest) sits
        # log4(leaves) - i splits down, 4 tiles per split; a level not split
        # prints none. Learnt again from the «k/T» of the lines as they come.
        k = max(0, round(math.log(max(1, leaves), 4)))
        self.expected = {str(i): 4 ** (k - i) for i in range(self.lods) if k - i > 0}
        self.tiles_total = max(1, sum(self.expected.values()))
        self.tiles_done = 0
        self.converted = 0

    def _at(self, stage: str, frac: float) -> float:
        a, w = self.WEIGHTS[stage]
        self.stage = stage
        self.share = max(self.share, min(0.999, a + w * max(0.0, min(1.0, frac))))
        return self.share

    def feed(self, line: str):
        s = line.strip()
        if s.startswith("{"):
            try:
                ev = json.loads(s)
            except ValueError:
                ev = None
            if isinstance(ev, dict) and "stage" in ev:
                self.estimated = False
                st = str(ev.get("stage"))
                if st in self.WEIGHTS:
                    pct = ev.get("percent")
                    frac = (float(pct) / 100.0) if pct is not None else (
                        float(ev.get("done") or 0) / max(1.0, float(ev.get("total") or 1)))
                    return self._at(st, frac)
                if st == "done":
                    self.stage, self.share = "done", 1.0
                return self.share
        if not self.estimated:
            return None
        if "=> Decimation stage" in s:
            return self._at("decimation", 0.02)
        if s.startswith("?> Output:") and self.stage == "decimation":
            self.decimated += 1
            return self._at("decimation", self.decimated / max(1, self.lods - 1))
        if "=> Splitting stage" in s:
            return self._at("splitting", 0.0)
        if "] Done in" in s and "[LOD-" in s:
            try:
                tag = s.split("[LOD-", 1)[1].split("]", 1)[0]          # 0-Mesh-5/16
                lod, _, frac = tag.partition("-Mesh-")
                self.expected[lod] = int(frac.split("/")[1])
                self.tiles_total = max(1, sum(self.expected.values()))
            except (IndexError, ValueError):
                pass
            self.tiles_done += 1
            return self._at("splitting", self.tiles_done / max(1, self.tiles_total))
        if "=> Tiling stage" in s:
            return self._at("tiling", 0.0)
        if "Converting to glb" in s:
            self.converted += 1
            return self._at("tiling", self.converted / max(1, self.tiles_done + 1))
        if "Generating tileset.json" in s:
            return self._at("tiling", 0.95)
        if "=> Pipeline completed" in s:
            # the clean-up comes after (29 s of 118 on 27 thousand files)
            return self._at("tiling", 1.0)
        if "?> Cleaning up ok" in s:
            self.stage = "done"
            self.share = 1.0
            return self.share
        return None


def run_tool(cmd: list, on_line, cancelled, *, stall_s: float = 900, timeout: float = 6 * 3600) -> dict:
    """A tool in a process of its own, its output read line by line (stdout and
    stderr together) while it runs. Ended by ``cancelled()``; KILLED when it
    writes nothing for ``stall_s`` seconds (the round-0 stall of Obj2Tiles
    under Rosetta: log frozen, CPU at 1000%). → ``{returncode, peak_mb,
    seconds, stalled, tail}`` — the peak resident memory of the process itself
    (``wait4``) where the system says it."""
    import queue
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                            encoding="utf-8", errors="replace", bufsize=1)
    lines: "queue.Queue" = queue.Queue()

    def pump():
        for ln in proc.stdout:
            lines.put(ln.rstrip("\r\n"))
        lines.put(None)
    threading.Thread(target=pump, daemon=True).start()
    t0 = last = time.time()
    tail: list = []
    peak = None
    stalled = False
    eof = False
    rc = None
    try:
        while True:
            try:
                ln = lines.get(timeout=0.25)
                if ln is None:
                    eof = True
                else:
                    last = time.time()
                    tail.append(ln)
                    del tail[:-40]
                    on_line(ln)
            except queue.Empty:
                pass
            if rc is None:
                if hasattr(os, "wait4"):
                    try:
                        pid, status, ru = os.wait4(proc.pid, os.WNOHANG)
                    except ChildProcessError:
                        pid, status, ru = proc.pid, 0, None
                    if pid:
                        rc = os.waitstatus_to_exitcode(status) if ru is not None else (proc.returncode or 0)
                        proc.returncode = rc
                        if ru is not None:
                            peak = ru.ru_maxrss / (1024 * 1024 if sys.platform == "darwin" else 1024)
                else:
                    rc = proc.poll()
            if rc is not None and (eof or lines.empty() and time.time() - last > 2):
                break
            if rc is None and cancelled():
                proc.terminate()
                try:
                    proc.wait(5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                raise _Cancelled()
            if rc is None and time.time() - last > stall_s:
                stalled = True
                proc.kill()
                try:
                    proc.wait(5)
                except subprocess.TimeoutExpired:
                    pass
                rc = -9
                break
            if rc is None and time.time() - t0 > timeout:
                proc.kill()
                raise TimeoutError(f"{os.path.basename(cmd[0])} ran over {int(timeout)} s")
    finally:
        if proc.poll() is None and rc is None:
            proc.kill()
    return {"returncode": rc, "peak_mb": round(peak) if peak else None, "seconds": round(time.time() - t0, 1),
            "stalled": stalled, "tail": tail}


def validator_tool():
    """Cesium's validator: ``EM_TILES_VALIDATOR`` (its ``main.js``), then the
    add-on; with Node. → ``{node, main, version}`` or None."""
    node = node_tool()
    if not node:
        return None
    main = os.environ.get("EM_TILES_VALIDATOR") or tool_path("tiles-validator") or ""
    if not main or not os.path.isfile(main):
        return None
    have = installed("tiles-validator") or {}
    return {"node": node["node"], "main": main,
            "version": "3d-tiles-validator " + (have.get("version") or ADDONS["tiles-validator"]["npm"]["version"])}


def validate_tileset(folder: str, tool=None) -> dict:
    """The judge before the graph. Cesium's 3d-tiles-validator when it is
    here (its report beside the tileset as ``<folder>.validation.json``);
    otherwise EMStudio's STRUCTURAL check, said as such: the tileset.json
    reads, has an asset version, a root with a bounding volume and a
    geometric error, every content it names is there and is a glb/b3dm with
    a sound header. → ``{validator, ok, errors, warnings, infos, messages}``."""
    tool = tool if tool is not None else validator_tool()
    ts = os.path.join(folder, "tileset.json")
    if tool:
        report = folder.rstrip("/\\") + ".validation.json"
        try:
            run = subprocess.run([tool["node"], tool["main"], "--tilesetFile", ts, "--reportFile", report],
                                 capture_output=True, text=True, timeout=1800)
            data = json.loads(open(report, encoding="utf-8").read())
        except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
            return {"validator": tool["version"], "ok": False, "errors": 1, "warnings": 0, "infos": 0,
                    "messages": [f"the validator did not answer: {exc}"]}
        msgs = []

        def walk(issues):
            for it in issues or []:
                if it.get("severity") == "ERROR" and len(msgs) < 12:
                    msgs.append(f"{it.get('path', '')}: {it.get('message', '')}")
                walk(it.get("causes"))
        walk(data.get("issues"))
        n_err = int(data.get("numErrors") or 0)
        return {"validator": tool["version"], "ok": n_err == 0, "errors": n_err,
                "warnings": int(data.get("numWarnings") or 0), "infos": int(data.get("numInfos") or 0),
                "messages": msgs, "report": report, "returncode": run.returncode}
    errs: list = []
    count = 0
    try:
        doc = json.loads(open(ts, encoding="utf-8").read())
    except (OSError, ValueError) as exc:
        return {"validator": "EMStudio structural check", "ok": False, "errors": 1, "warnings": 0, "infos": 0,
                "messages": [f"tileset.json: {exc}"]}
    if not (doc.get("asset") or {}).get("version"):
        errs.append("tileset.json: no asset.version")
    root = doc.get("root") or {}
    if not root:
        errs.append("tileset.json: no root")

    def tile(t, where):
        nonlocal count
        if not isinstance(t.get("boundingVolume"), dict):
            errs.append(f"{where}: no boundingVolume")
        if not isinstance(t.get("geometricError"), (int, float)):
            errs.append(f"{where}: no geometricError")
        for c in ([t["content"]] if t.get("content") else []) + list(t.get("contents") or []):
            uri = str(c.get("uri") or c.get("url") or "")
            p = os.path.join(folder, *uri.split("/"))
            count += 1
            try:
                with open(p, "rb") as f:
                    head = f.read(4)
                if uri.lower().endswith((".glb", ".b3dm")) and head not in (b"glTF", b"b3dm"):
                    errs.append(f"{uri}: not a glb/b3dm")
            except OSError:
                errs.append(f"{uri}: missing")
        for i, ch in enumerate(t.get("children") or []):
            tile(ch, f"{where}/children/{i}")
    tile(root, "root")
    return {"validator": "EMStudio structural check", "ok": not errs, "errors": len(errs), "warnings": 0,
            "infos": 0, "messages": errs[:12], "contents": count}


def tileset_facts(folder: str) -> dict:
    """Contents, bytes, the root geometric error (the measure s3Dgraphy keeps
    for a tileset: ``geometric_error_m``)."""
    n = size = 0
    for dirpath, _d, files in os.walk(folder):
        for f in files:
            n += 1
            size += os.path.getsize(os.path.join(dirpath, f))
    ge = None
    try:
        ge = float(json.loads(open(os.path.join(folder, "tileset.json"), encoding="utf-8").read()).get("geometricError"))
    except (OSError, ValueError, TypeError):
        pass
    return {"files": n, "bytes": size, "geometric_error_m": ge}


def run_tileset_batch(job: Job, items: list, tool: dict, pack, *, ceiling_mb: int, workers: int) -> dict:
    """The batch: each OBJ → its tileset folder → the validator → the .3tz
    (``pack(folder) → result``), MORE PROCESSES SIDE BY SIDE as long as their
    estimates stay under ``ceiling_mb`` together (never past it; one that alone
    passes it is refused before it starts), at most ``workers``. Each item has
    its own state, progress and cancel (``job.items``); the job's progress is
    their mean. A process that stalls is tried once more."""
    job.items = [{"source": it["source"], "name": it.get("name"), "state": "queued", "progress": 0.0,
                  "stage": "", "estimate_mb": it.get("estimate_mb"), "cancel": False} for it in items]
    results: list = [None] * len(items)
    running: dict = {}
    lock = threading.Lock()

    def refresh():
        with _LOCK:
            job.progress = sum(x["progress"] for x in job.items) / max(1, len(job.items))
            live = [x for x in job.items if x["state"] == "running"]
            done = sum(1 for x in job.items if x["state"] in ("done", "failed", "invalid", "cancelled", "refused"))
            job.stage = f"{done}/{len(job.items)}" + (f" · {live[0]['name']}" if len(live) == 1 else
                                                     f" · {len(live)} in parallel" if live else "")

    def one(i: int):
        it, row = items[i], job.items[i]
        try:
            res = _tileset_one(job, it, row, tool, pack, refresh)
        except _Cancelled:
            res = {**it, "state": "cancelled"}
            row["state"] = "cancelled"
        except Exception as exc:  # noqa: BLE001 — one file's failure is its row
            res = {**it, "state": "failed", "error": str(exc)}
            row["state"] = "failed"
            job.say(f"{it.get('name')}: {exc}")
        results[i] = res
        row["progress"] = 1.0
        refresh()
        with lock:
            running.pop(i, None)
        job.result = {"tool": tool, "outputs": [r for r in results if r], "ceiling_mb": ceiling_mb}

    pending = list(range(len(items)))
    for i in list(pending):
        it = items[i]
        if it.get("error") or it.get("exists"):
            results[i] = {**it, "state": "error" if it.get("error") else "exists"}
            job.items[i].update(state="refused" if it.get("error") else "exists", progress=1.0,
                                stage=it.get("error") or "exists")
            pending.remove(i)
        elif (it.get("estimate_mb") or 0) > ceiling_mb:
            msg = f"asks about {it['estimate_mb']} MB, over the ceiling of {ceiling_mb} MB"
            results[i] = {**it, "state": "refused", "error": msg}
            job.items[i].update(state="refused", progress=1.0, stage=msg)
            job.say(f"{it.get('name')}: {msg}")
            pending.remove(i)
    refresh()
    threads = []
    while pending or running:
        if job.cancel.is_set():
            for row in job.items:
                row["cancel"] = True
        with lock:
            used = sum(items[k].get("estimate_mb") or 0 for k in running)
            nxt = pending[0] if pending else None
            fits = nxt is not None and len(running) < workers and (
                not running or used + (items[nxt].get("estimate_mb") or 0) <= ceiling_mb)
            if fits and job.items[nxt]["cancel"]:
                pending.pop(0)
                results[nxt] = {**items[nxt], "state": "cancelled"}
                job.items[nxt].update(state="cancelled", progress=1.0)
                refresh()
                continue
            if fits:
                pending.pop(0)
                running[nxt] = True
                th = threading.Thread(target=one, args=(nxt,), daemon=True)
                threads.append(th)
                th.start()
                job.say(f"{items[nxt].get('name')}: started ({items[nxt].get('estimate_mb')} MB asked, "
                        f"{used + (items[nxt].get('estimate_mb') or 0)} of {ceiling_mb} MB in use)")
                continue
        time.sleep(0.2)
    for th in threads:
        th.join()
    out = [r for r in results if r]
    if job.cancel.is_set() and not any(r.get("state") == "done" for r in out):
        raise _Cancelled()
    return {"tool": tool, "outputs": out, "ceiling_mb": ceiling_mb}


def _tileset_one(job: Job, it: dict, row: dict, tool: dict, pack, refresh) -> dict:
    folder = it["folder"]
    row["state"] = "running"
    row["stage"] = "decimation"
    prog = O2TProgress(it["lods"], it["leaves"])
    cmd = obj2tiles_command(tool["path"], it["source"], folder, it, progress=bool(tool.get("progress")))
    job.say(f"{it['name']}: " + " ".join([os.path.basename(cmd[0])] + cmd[1:]))

    def on_line(ln):
        if prog.feed(ln) is not None:
            row["progress"] = prog.share * 0.9
            row["stage"] = prog.stage
            refresh()
    run = None
    for attempt in (1, 2):
        try:
            run = run_tool(cmd, on_line, lambda: row["cancel"] or job.cancel.is_set(),
                           stall_s=float(os.environ.get("EM_TILES_STALL_S") or 900))
        except (_Cancelled, TimeoutError):
            # the folder is this run's: nothing half-made is left behind
            shutil.rmtree(folder, ignore_errors=True)
            raise
        if not run["stalled"]:
            break
        job.say(f"{it['name']}: Obj2Tiles wrote nothing for {int(float(os.environ.get('EM_TILES_STALL_S') or 900))} s "
                f"and was stopped (the stall seen under Rosetta)" + ("; tried once more" if attempt == 1 else ""))
        shutil.rmtree(folder, ignore_errors=True)
        prog = O2TProgress(it["lods"], it["leaves"])
    if run["stalled"]:
        row["state"] = "failed"
        return {**it, "state": "failed", "error": "Obj2Tiles stalled twice", "run": {k: run[k] for k in ("seconds", "peak_mb")}}
    if run["returncode"] != 0 or not os.path.isfile(os.path.join(folder, "tileset.json")):
        shutil.rmtree(folder, ignore_errors=True)
        row["state"] = "failed"
        return {**it, "state": "failed", "error": "\n".join(run["tail"][-6:])[-600:] or f"exit {run['returncode']}",
                "run": {k: run[k] for k in ("seconds", "peak_mb")}}
    job.say(f"{it['name']}: tileset in {run['seconds']} s" + (f", {run['peak_mb']} MB at most" if run["peak_mb"] else ""))
    row["stage"] = "validation"
    row["progress"] = 0.92
    refresh()
    verdict = validate_tileset(folder)
    job.say(f"{it['name']}: {verdict['validator']}: {verdict['errors']} errors, {verdict['warnings']} warnings")
    facts = tileset_facts(folder)
    base = {**it, "run": {k: run[k] for k in ("seconds", "peak_mb")}, "validation": verdict, "facts": facts,
            "progress_estimated": prog.estimated,
            "command": " ".join(os.path.basename(c) if i == 0 else c for i, c in enumerate(cmd))}
    if not verdict["ok"]:
        # a tileset that does not pass never enters the graph: the folder stays
        # for whoever wants to see why; no archive, no stamp
        row["state"] = "invalid"
        return {**base, "state": "invalid", "error": "; ".join(verdict["messages"][:3])}
    if row["cancel"] or job.cancel.is_set():
        raise _Cancelled()
    row["stage"] = "packing"
    row["progress"] = 0.96
    refresh()
    packed = pack(folder)
    row["state"] = "done"
    row["stage"] = ""
    return {**base, "state": "done", "pack": packed, "sha256": packed.get("sha256"), "bytes": packed.get("bytes")}


# ── what the photogrammetry software already made (precisazione 3) ──────────

def recognize(path: str):
    """A tileset or a set of blocks that a photogrammetry program already
    made, recognised so that it is packed and stamped as ITS product, not made
    again. → ``{engine, software, …}`` or None.

    * RealityScan (RealityCapture): a folder with ``tileset.json`` whose
      ``asset.generator`` names it, or the RealityScan pair ``X.json`` beside
      ``X/``;
    * Metashape + 3DSC for Metashape (``ms_blocks.py``, STEP2): blocks named
      ``block_xNNN_yNNN`` with a ``metadata.xml`` holding ``SRSOrigin`` — a
      set to pack;
    * any other tileset folder: its generator said, whoever it is."""
    import re
    p = os.path.abspath(path)
    if os.path.isdir(p):
        ts = os.path.join(p, "tileset.json")
        pair = p.rstrip("/\\") + ".json"
        doc_path = ts if os.path.isfile(ts) else (pair if os.path.isfile(pair) else "")
        if doc_path:
            try:
                asset = (json.loads(open(doc_path, encoding="utf-8").read()).get("asset") or {})
            except (OSError, ValueError):
                asset = {}
            gen = str(asset.get("generator") or "")
            low = gen.lower()
            software = ("RealityScan" if "realityscan" in low else "RealityCapture" if "realitycapture" in low
                        else "Obj2Tiles" if "obj2tiles" in low else "Metashape" if "metashape" in low
                        else "3D Survey Collection" if "3dsc" in low or "survey collection" in low else "")
            if doc_path == pair and not software:
                software = "RealityScan"
            if software or gen:
                return {"engine": "tileset", "software": software or gen, "generator": gen,
                        "version": str(asset.get("version") or ""), "root": doc_path if doc_path == pair else None,
                        "form": "pair" if doc_path == pair else "folder"}
        blocks = sorted(n for n in os.listdir(p) if re.match(r"block_x\d{3}_y\d{3}", n, re.IGNORECASE))
        meta = os.path.join(p, "metadata.xml")
        if blocks:
            origin = None
            if os.path.isfile(meta):
                m = re.search(r"<SRSOrigin>\s*([^<]+)</SRSOrigin>", open(meta, encoding="utf-8", errors="replace").read())
                origin = m.group(1).strip() if m else None
            return {"engine": "blocks", "software": "Metashape + 3DSC for Metashape", "blocks": len(blocks),
                    "names": blocks[:6], "srs_origin": origin, "metadata": meta if os.path.isfile(meta) else None}
    return None
