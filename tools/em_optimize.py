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


def addon_state(addon_id: str) -> dict:
    spec = ADDONS[addon_id]
    key = platform_key()
    build = spec["builds"].get(key)
    have = installed(addon_id)
    return {"id": addon_id, "name": spec["name"], "project": spec["project"], "author": spec["author"],
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
        data = z.read(build["member"])
    dest = dest_dir / build["member"]
    tmp = dest.with_name(dest.name + ".part")
    tmp.write_bytes(data)
    os.chmod(tmp, 0o755)
    os.replace(tmp, dest)
    manifest = {"version": build["version"], "path": str(dest), "asset": build["asset"],
                "sha256": build["sha256"], "url": build["url"], "licence": spec["licence"],
                "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    _manifest_path(addon_id).write_text(json.dumps(manifest, indent=1), "utf-8")
    for old in home.iterdir():
        if old.is_dir() and old.name != build["version"]:
            shutil.rmtree(old, ignore_errors=True)
    say(f"installed {spec['name']} {build['version']} in {dest_dir}")
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


def cancel(job_id: str) -> bool:
    job = _JOBS.get(job_id)
    if job is None:
        return False
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
