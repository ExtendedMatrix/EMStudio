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
# say it with its source. Each zip holds the program and the libktx it loads
# beside itself for KTX2 output (``extra``; our preset writes JPEG).
#
# MICRO-PREPARA-RITOCCHI (E.D., 30 Oct 2026) · FROM E.D.'S FORK until upstream
# merges his two pull requests to OpenDroneMap/Obj2Tiles — #107 (a native
# osx-arm64 build) and #108 (``--progress``, JSON lines on stdout). The fork's
# release v1.8.0-em.3 (branch ``emstudio`` = upstream 1.8.0 + #107 + #108,
# commit b3d6338, built by the fork's Actions) publishes the six builds; their
# sizes and digests are the release page's own, checked against the bytes
# downloaded on 30 Oct 2026. Apple Silicon runs the NATIVE build (no Rosetta)
# and, since em.3 (MICRO-VERSIONE-CONTENITORE), its zip carries an arm64
# ``libktx.dylib`` (KTX-Software 4.4.2): ``--texture-format Ktx2`` works there
# too (em.2's had none). The licence is unchanged (AGPL-3.0, the source public in the fork),
# the credits stay OpenDroneMap's. The day the two PRs are merged and upstream
# publishes them, ONE field goes back: ``OBJ2TILES_FROM = "upstream"`` (and
# the upstream table gets that release's assets and digests).
_O2T_UPSTREAM = "https://github.com/OpenDroneMap/Obj2Tiles/releases/download/v1.8.0/"
_O2T_FORK = "https://github.com/zalmoxes-laran/Obj2Tiles/releases/download/v1.8.0-em.3/"
OBJ2TILES_FROM = "fork"
_O2T_BUILDS = {
    "upstream": {
        "darwin-x86_64": {
            "version": "1.8.0", "asset": "Obj2Tiles-Osx64.zip", "member": "Obj2Tiles", "extra": ["libktx.dylib"],
            "size": 11113512, "url": _O2T_UPSTREAM + "Obj2Tiles-Osx64.zip",
            "sha256": "2f843f40ba23f535953ccfc19103549a80fba953d6483a21fe8a9e48545548b3"},
        "windows-x86_64": {
            "version": "1.8.0", "asset": "Obj2Tiles-Win64.zip", "member": "Obj2Tiles.exe", "extra": ["ktx.dll"],
            "size": 22160647, "url": _O2T_UPSTREAM + "Obj2Tiles-Win64.zip",
            "sha256": "762cc3500af613dda8c601d70d503218298b0d6dc45a91a9133d04134e3005c6"},
        "windows-arm64": {
            "version": "1.8.0", "asset": "Obj2Tiles-WinArm64.zip", "member": "Obj2Tiles.exe", "extra": ["ktx.dll"],
            "size": 21034189, "url": _O2T_UPSTREAM + "Obj2Tiles-WinArm64.zip",
            "sha256": "089523f069cc61c76043a7b4f86e5102fcf07b11c2798ee07e456f286b695c87"},
        "linux-x86_64": {
            "version": "1.8.0", "asset": "Obj2Tiles-Linux64.zip", "member": "Obj2Tiles", "extra": ["libktx.so"],
            "size": 11391412, "url": _O2T_UPSTREAM + "Obj2Tiles-Linux64.zip",
            "sha256": "f50663075d6b4ebff46e0e52fd365d9b8f78d6b5b9f4c9f07d56866f5a6f7de9"},
        "linux-arm64": {
            "version": "1.8.0", "asset": "Obj2Tiles-LinuxArm64.zip", "member": "Obj2Tiles", "extra": ["libktx.so"],
            "size": 10962078, "url": _O2T_UPSTREAM + "Obj2Tiles-LinuxArm64.zip",
            "sha256": "1903851bb5da073b7e239b09094f694ceeb8fbffe0f1ce68fdb0b1575768da77"},
    },
    "fork": {
        "darwin-arm64": {
            "version": "1.8.0-em.3", "asset": "Obj2Tiles-OsxArm64.zip", "member": "Obj2Tiles", "extra": ["libktx.dylib"],
            "size": 10467153, "url": _O2T_FORK + "Obj2Tiles-OsxArm64.zip",
            "sha256": "e028a546cb35641e1e4b1d651f959a0bd91482841eaa639879d1c1c869e303e2"},
        "darwin-x86_64": {
            "version": "1.8.0-em.3", "asset": "Obj2Tiles-Osx64.zip", "member": "Obj2Tiles", "extra": ["libktx.dylib"],
            "size": 11138376, "url": _O2T_FORK + "Obj2Tiles-Osx64.zip",
            "sha256": "469cae019e58df12f7f7a065f2933052183bd1616f3a9e6a93df458a2ddf1a05"},
        "windows-x86_64": {
            "version": "1.8.0-em.3", "asset": "Obj2Tiles-Win64.zip", "member": "Obj2Tiles.exe", "extra": ["ktx.dll"],
            "size": 22220425, "url": _O2T_FORK + "Obj2Tiles-Win64.zip",
            "sha256": "461317f21e15fa8180cf193afe8b7b9d49ded8b17f94c94553649186a5701751"},
        "windows-arm64": {
            "version": "1.8.0-em.3", "asset": "Obj2Tiles-WinArm64.zip", "member": "Obj2Tiles.exe", "extra": ["ktx.dll"],
            "size": 21090251, "url": _O2T_FORK + "Obj2Tiles-WinArm64.zip",
            "sha256": "fa53f035ebba81cf1c14ebfed8ae258186425676e060a0b6e52e9f25e2135164"},
        "linux-x86_64": {
            "version": "1.8.0-em.3", "asset": "Obj2Tiles-Linux64.zip", "member": "Obj2Tiles", "extra": ["libktx.so"],
            "size": 11416122, "url": _O2T_FORK + "Obj2Tiles-Linux64.zip",
            "sha256": "afc8a769bd6d3bfc9633805123c0dcd83e07628be5421a328958b39157d724e6"},
        "linux-arm64": {
            "version": "1.8.0-em.3", "asset": "Obj2Tiles-LinuxArm64.zip", "member": "Obj2Tiles", "extra": ["libktx.so"],
            "size": 10985026, "url": _O2T_FORK + "Obj2Tiles-LinuxArm64.zip",
            "sha256": "9936ef5b0377ee11b8a15fb2857e351e8e5186fb082fe956bbd76ddd277faa82"},
    },
}
_O2T_FROM = {
    "upstream": {"source": "https://github.com/OpenDroneMap/Obj2Tiles/releases",
                 "licence_url": "https://github.com/OpenDroneMap/Obj2Tiles/blob/master/LICENSE.md",
                 "build": ""},
    "fork": {"source": "https://github.com/zalmoxes-laran/Obj2Tiles/tree/emstudio",
             "licence_url": "https://github.com/zalmoxes-laran/Obj2Tiles/blob/emstudio/LICENSE.md",
             "build": "CNR-ISPC build: 1.8.0 + Apple Silicon + progress",
             "pending": "back to OpenDroneMap's release when its pull requests #107 (osx-arm64) and "
                        "#108 (--progress) are merged: one field, OBJ2TILES_FROM"},
}
ADDONS["obj2tiles"] = {
    "name": "Obj2Tiles",
    "project": "OpenDroneMap",
    "author": "OpenDroneMap contributors (Luca Di Leo, Piero Toffanin)",
    "licence": "AGPL-3.0",
    "licence_url": _O2T_FROM[OBJ2TILES_FROM]["licence_url"],
    "source": _O2T_FROM[OBJ2TILES_FROM]["source"],
    "upstream": "https://github.com/OpenDroneMap/Obj2Tiles",
    "build_note": _O2T_FROM[OBJ2TILES_FROM]["build"],
    "pending": _O2T_FROM[OBJ2TILES_FROM].get("pending", ""),
    "does": "textured OBJ → Cesium 3D Tiles: decimation per level of detail, spatial splitting, tiling",
    "heavy": True,
    # below this a survey's mesh rarely fits (round 2: 1.1 GB of OBJ → 3.1 GB)
    "min_memory_mb": 8192,
    "builds": dict(_O2T_BUILDS[OBJ2TILES_FROM]),
}
if "darwin-arm64" not in ADDONS["obj2tiles"]["builds"]:
    # upstream 1.8.0 has no Apple Silicon build: the Intel one under Rosetta 2
    ADDONS["obj2tiles"]["builds"]["darwin-arm64"] = {**ADDONS["obj2tiles"]["builds"]["darwin-x86_64"],
                                                     "emulated": "Rosetta 2"}

# MICRO-OTTIMIZZA-2 · Cesium's 3d-tiles-validator (Apache-2.0): the judge of
# every tileset before it enters the graph. It is a Node program, installed by
# npm from the npm registry at a FIXED version whose tarball integrity (sha512,
# the registry's own) is checked in the lockfile npm writes; ``sharp`` is then
# rebuilt (its prebuilt image library), the other install scripts never run.
# Without the validator a tileset is judged by EMStudio's own structural
# check, said as such.
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

# MICRO-PREPARA-RITOCCHI p.5 (E.D., 30 Oct 2026) · Node.js ITSELF as a managed
# add-on, so the validator never asks «install Node» of whoever has none:
# downloaded on request from nodejs.org's official release at a FIXED LTS
# (v26.13.0 «Lithium», the Active LTS since 28 Oct 2026), its sha256 the one
# of the release's SHASUMS256.txt, unpacked whole (node and its npm) into
# ``<addons>/node/<version>/`` and used by EMStudio only (never put on the
# system's PATH). A Node of 18 or newer already on this machine is used
# instead (:func:`node_tool`). Licence MIT (Node.js contributors; the bundled
# third-party licences travel in its LICENSE file).
_NODE = "https://nodejs.org/dist/v26.13.0/"
ADDONS["node"] = {
    "name": "Node.js",
    "project": "OpenJS Foundation",
    "author": "Node.js contributors",
    "licence": "MIT",
    "licence_url": "https://github.com/nodejs/node/blob/v26.13.0/LICENSE",
    "source": "https://nodejs.org/en/download",
    "does": "the JavaScript runtime the 3d-tiles-validator runs on, with its npm",
    "runtime": True,
    "builds": {
        "darwin-arm64": {
            "version": "26.13.0", "asset": "node-v26.13.0-darwin-arm64.tar.gz",
            "member": "node-v26.13.0-darwin-arm64/bin/node",
            "npm": "node-v26.13.0-darwin-arm64/lib/node_modules/npm/bin/npm-cli.js",
            "size": 58334661, "url": _NODE + "node-v26.13.0-darwin-arm64.tar.gz",
            "sha256": "d38bd5e5a2ddce6bbb5ce45e46e208337da4d51fffe611e567fd32073d6439f6"},
        "darwin-x86_64": {
            "version": "26.13.0", "asset": "node-v26.13.0-darwin-x64.tar.gz",
            "member": "node-v26.13.0-darwin-x64/bin/node",
            "npm": "node-v26.13.0-darwin-x64/lib/node_modules/npm/bin/npm-cli.js",
            "size": 59802926, "url": _NODE + "node-v26.13.0-darwin-x64.tar.gz",
            "sha256": "525c9b29bb0263d687de60a4cec0e2a6db876a8eb032369e5795eca71e7c358e"},
        "linux-x86_64": {
            "version": "26.13.0", "asset": "node-v26.13.0-linux-x64.tar.gz",
            "member": "node-v26.13.0-linux-x64/bin/node",
            "npm": "node-v26.13.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js",
            "size": 62893692, "url": _NODE + "node-v26.13.0-linux-x64.tar.gz",
            "sha256": "5848553868b402d3fabb5b09270649977780a390f832155721025a08b5104455"},
        "linux-arm64": {
            "version": "26.13.0", "asset": "node-v26.13.0-linux-arm64.tar.gz",
            "member": "node-v26.13.0-linux-arm64/bin/node",
            "npm": "node-v26.13.0-linux-arm64/lib/node_modules/npm/bin/npm-cli.js",
            "size": 62611009, "url": _NODE + "node-v26.13.0-linux-arm64.tar.gz",
            "sha256": "439e9c438acdf6a6ffe47418da709153d66c4bed812e30a473faacb107dd2791"},
        "windows-x86_64": {
            "version": "26.13.0", "asset": "node-v26.13.0-win-x64.zip",
            "member": "node-v26.13.0-win-x64/node.exe",
            "npm": "node-v26.13.0-win-x64/node_modules/npm/bin/npm-cli.js",
            "size": 41157375, "url": _NODE + "node-v26.13.0-win-x64.zip",
            "sha256": "dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a"},
        "windows-arm64": {
            "version": "26.13.0", "asset": "node-v26.13.0-win-arm64.zip",
            "member": "node-v26.13.0-win-arm64/node.exe",
            "npm": "node-v26.13.0-win-arm64/node_modules/npm/bin/npm-cli.js",
            "size": 37005985, "url": _NODE + "node-v26.13.0-win-arm64.zip",
            "sha256": "a9427139595156ef484e1fb08957676e09d4232368dd1743a2a9f93f3d241b14"},
    },
}
#: The oldest Node the validator runs on (its package.json: ``engines``).
NODE_MIN_MAJOR = 18

# MICRO-PREPARA-RITOCCHI p.4 · what each add-on is FOR YOU: the actions of
# Ottimizza that use it, and the profiles of use those actions serve.
# Settings › Add-ons says it first, in plain words, and whether it is
# recommended for what you do or optional (EMStudio decides from the switches
# and choices you made: ``addon-advice.ts``).
ADDONS["gltfpack"]["serves"] = {"actions": ["variants"], "profiles": ["preview", "mobile_webxr"]}
ADDONS["obj2tiles"]["serves"] = {"actions": ["tileset"], "profiles": ["desktop_realtime", "webxr"]}
ADDONS["tiles-validator"]["serves"] = {"actions": ["tileset"], "profiles": ["desktop_realtime", "webxr"]}
ADDONS["node"]["serves"] = {"actions": ["tileset"], "profiles": [], "for": ["tiles-validator"]}


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


def _node_version(node: str):
    """``(major, "v26.13.0")`` of a Node binary, or None."""
    try:
        v = subprocess.run(child_argv([node, "--version"]), capture_output=True, text=True, timeout=10,
                           **popen_kw()).stdout.strip()
        return int(v.lstrip("v").split(".")[0]), v
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None


def _npm_beside(node: str):
    """The npm that goes with ``node``: ``[npm]`` on its folder or the PATH,
    or ``[node, npm-cli.js]`` from its own lib — a list to prefix a command."""
    folder = os.path.dirname(node)
    for js in (os.path.join(folder, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
               os.path.join(folder, "node_modules", "npm", "bin", "npm-cli.js")):
        if os.path.isfile(js):
            return [node, os.path.normpath(js)]
    npm = shutil.which("npm", path=folder + os.pathsep + os.environ.get("PATH", ""))
    return [npm] if npm else []


#: Where a Node of this machine may live when EMStudio (an app started from
#: the Dock) does not inherit the shell's PATH: Homebrew, the official
#: installer, Volta, the system.
_NODE_PLACES = ("/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node",
                os.path.expanduser("~/.volta/bin/node"), r"C:\Program Files\nodejs\node.exe")


def node_tool(system_only: bool = False):
    """The Node the validator runs on: ``EM_NODE``; a Node of
    :data:`NODE_MIN_MAJOR` or newer already on this machine (the PATH, then
    the usual places) — with ``EM_NODE`` set, only that one —; else
    EMStudio's own (the ``node`` add-on). →
    ``{node, npm, npm_cmd, version, from}`` (``from``: ``env``, ``system`` or
    ``addon``) or None. ``npm`` is kept for who reads it; ``npm_cmd`` is the
    list a command starts with."""
    cands = []
    if os.environ.get("EM_NODE"):
        # explicit: that one (or none), never a search of the machine
        cands.append(("env", os.environ["EM_NODE"]))
    else:
        on_path = shutil.which("node")
        if on_path:
            cands.append(("system", on_path))
        cands += [("system", p) for p in _NODE_PLACES]
    if not system_only:
        mine = tool_path("node")
        if mine:
            cands.append(("addon", mine))
    seen = set()
    for origin, node in cands:
        if not node or node in seen or not os.path.isfile(node):
            continue
        seen.add(node)
        got = _node_version(node)
        if got is None or (origin != "env" and got[0] < NODE_MIN_MAJOR):
            continue
        npm = _npm_beside(node)
        if not npm:
            continue
        return {"node": node, "npm": npm[-1], "npm_cmd": npm, "version": got[1], "from": origin}
    return None


def rosetta_ready() -> bool:
    """Can this Mac run an x86_64 program (Rosetta 2 installed)?"""
    if platform_key() != "darwin-arm64":
        return True
    try:
        return subprocess.run(["/usr/bin/arch", "-x86_64", "/usr/bin/true"], capture_output=True, timeout=10,
                              **popen_kw()).returncode == 0
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
        # p.5 · with a Node of this machine, or with EMStudio's own: ONE
        # gesture, «Install (with Node.js)», when Node has to come too
        node = node_tool()
        out["needs"] = "node"
        out["node"] = node["version"] if node else None
        out["node_from"] = node["from"] if node else None
        node_build = ADDONS["node"]["builds"].get(key)
        out["with_node"] = node is None and node_build is not None
        if out["with_node"]:
            out["node_version"] = node_build["version"]
            out["node_size"] = node_build["size"]
        out["available"] = bool(node) or node_build is not None
    if addon_id == "node":
        sysnode = node_tool(system_only=True)
        out["system_node"] = sysnode["version"] if sysnode else None
    for k in ("serves", "build_note", "pending", "upstream", "runtime"):
        if spec.get(k):
            out[k] = spec[k]
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
    # platform.processor() runs ``uname -p`` with a fork: not on a Mac, where
    # sysctl below says more (MICRO-BLENDER-SIDECAR)
    cpu = "" if system == "darwin" else (platform.processor() or "")
    if system == "darwin":
        try:
            cpu = subprocess.run(["/usr/sbin/sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True,
                                 text=True, timeout=3, **popen_kw()).stdout.strip() or cpu
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
            names = subprocess.run(child_argv([smi, "--query-gpu=name", "--format=csv,noheader"]), capture_output=True,
                                   text=True, timeout=5, **popen_kw()).stdout
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
    if spec.get("runtime"):
        # p.5 · a runtime (Node.js) is unpacked WHOLE (node and its npm),
        # into a folder of its own made complete before it takes its place
        part = home / (build["version"] + ".part")
        shutil.rmtree(part, ignore_errors=True)
        part.mkdir(parents=True, exist_ok=True)
        buf.seek(0)
        if build["asset"].endswith(".zip"):
            with zipfile.ZipFile(buf) as z:
                for info in z.infolist():
                    target = (part / info.filename).resolve()
                    if not str(target).startswith(str(part.resolve())):
                        raise RuntimeError(f"{info.filename} would land outside the add-on's folder")
                z.extractall(part)
        else:
            import tarfile
            with tarfile.open(fileobj=buf, mode="r:*") as tz:
                try:
                    tz.extractall(part, filter="tar")
                except TypeError:  # Python before 3.12: the members checked here
                    for m in tz.getmembers():
                        target = (part / m.name).resolve()
                        if not str(target).startswith(str(part.resolve())):
                            raise RuntimeError(f"{m.name} would land outside the add-on's folder")
                    tz.extractall(part)
        if not (part / build["member"]).is_file():
            raise RuntimeError(f"{build['member']} is not in {build['asset']}")
        os.chmod(part / build["member"], 0o755)
        shutil.rmtree(dest_dir, ignore_errors=True)
        os.replace(part, dest_dir)
    else:
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
    dest = dest_dir / (build["member"] if spec.get("runtime") else os.path.basename(build["member"]))
    manifest = {"version": build["version"], "path": str(dest), "asset": build["asset"],
                "sha256": build["sha256"], "url": build["url"], "licence": spec["licence"],
                "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    if build.get("npm"):
        manifest["npm"] = str(dest_dir / build["npm"])
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
    say = (job.say if job else (lambda *_a, **_k: None))
    node = node_tool()
    if not node:
        # p.5 · no Node of 18 or newer here: EMStudio's own comes first
        if ADDONS["node"]["builds"].get(platform_key()) is None:
            raise RuntimeError(f"{spec['name']} is a Node.js program and Node.js publishes no build for "
                               f"{platform_key()}: install Node.js {NODE_MIN_MAJOR} or newer, then try again")
        say(f"Node.js {ADDONS['node']['builds'][platform_key()]['version']} first (nodejs.org, MIT): "
            f"EMStudio's own, used by EMStudio only")
        install("node", job)
        node = node_tool()
        if not node:
            raise RuntimeError("Node.js was installed but does not answer")
    say(f"Node.js {node['version']} ({node['from']}: {node['node']})")
    home = addons_dir() / addon_id
    dest_dir = home / n["version"]
    part = home / (n["version"] + ".part")
    shutil.rmtree(part, ignore_errors=True)
    part.mkdir(parents=True, exist_ok=True)
    (part / "package.json").write_text(json.dumps({"name": "emstudio-addon", "private": True}), "utf-8")
    npm = list(node["npm_cmd"])
    steps = [npm + ["install", "--prefix", str(part), f"{n['package']}@{n['version']}",
                    "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact"]]
    steps += [npm + ["rebuild", r, "--prefix", str(part)] for r in n.get("rebuild", [])]
    # the scripts npm runs (sharp's rebuild) find THIS node first
    env = dict(os.environ, PATH=os.path.dirname(node["node"]) + os.pathsep + os.environ.get("PATH", ""))
    for i, cmd in enumerate(steps):
        say(" ".join(["npm"] + cmd[len(npm):]))
        if job:
            job.progress = 0.1 + 0.8 * i / len(steps)
            run = job.run_process(cmd, timeout=900, env=env)
        else:
            run = subprocess.run(child_argv(cmd), capture_output=True, text=True, timeout=900, **popen_kw(env))
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
                "node": node["version"], "node_from": node["from"], "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
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
_KEEP_DONE = 20


# ── the scheduler (MICRO-CODA-MULTICORE, E.D. 31 Oct 2026) ──────────────────
# In place of the one heavy semaphore: each process a job starts declares its
# tool, its cores, its memory and the files it reads and writes (a NEED); it
# starts when there are cores and memory free under the machine's ceiling, an
# instance of its tool free, and no other running process touches its files.
# The decision is the pure :func:`plan_start`; :class:`Scheduler` holds the
# tickets and wakes them.

#: per tool: how many instances side by side and the cores each takes, as a
#: function of the cores the queue may use (``C``). On E.D.'s Mac (12
#: performance cores + 4, 64 GB): C = 11 → Blender 3 × 3 threads, Obj2Tiles
#: 3 × 2, KTX2 2 × 4 threads, gltfpack 8 × 1.
TOOLS = {
    "blender": {"max": lambda c: max(1, min(4, c // 3)), "cores": lambda c: max(2, c // max(1, min(4, c // 3)))},
    "blender_read": {"max": lambda c: 2, "cores": lambda c: 1},
    "obj2tiles": {"max": lambda c: max(1, min(4, c // 3)), "cores": lambda c: 2},
    "ktx2": {"max": lambda c: max(1, min(3, c // 4)), "cores": lambda c: min(4, max(1, c))},
    "gltfpack": {"max": lambda c: max(1, min(8, c)), "cores": lambda c: 1},
    "pack": {"max": lambda c: 2, "cores": lambda c: 1},
    "addon": {"max": lambda c: 2, "cores": lambda c: 0},
}
#: «quanto della macchina usare»: all of it, half, one process at a time
SHARES = ("all", "half", "one")


def performance_cores() -> int:
    """The cores a heavy tool should count on: on a Mac with two kinds, the
    performance ones (``hw.perflevel0.physicalcpu``); elsewhere the processors
    this process may run on."""
    if sys.platform == "darwin":
        try:
            n = int(subprocess.run(["/usr/sbin/sysctl", "-n", "hw.perflevel0.physicalcpu"], capture_output=True,
                                   text=True, timeout=3, **popen_kw()).stdout.strip() or 0)
            if n > 0:
                return n
        except (OSError, ValueError, subprocess.TimeoutExpired):
            pass
    try:
        return max(1, len(os.sched_getaffinity(0)))
    except (AttributeError, OSError):
        return max(1, os.cpu_count() or 1)


def budget(share: str, cores: int, memory_mb: int) -> dict:
    """What the queue may use (pure): ``cores`` the performance cores less one
    for the interface, ``memory_mb`` the ceiling (60 % of the memory); «half»
    halves both, «one» lets one process run at a time. → ``{share, cores,
    memory_mb, one, tools: {tool: {max, cores}}}``."""
    share = share if share in SHARES else "all"
    c = max(1, cores - 1)
    mem = int(memory_mb)
    if share == "half":
        c, mem = max(1, c // 2), mem // 2
    tools = {k: {"max": 1 if share == "one" else int(v["max"](c)), "cores": int(v["cores"](c))} for k, v in TOOLS.items()}
    return {"share": share, "cores": c, "memory_mb": mem, "one": share == "one", "tools": tools}


def _norm(path: str) -> str:
    try:
        return os.path.normcase(os.path.realpath(os.path.abspath(str(path)))).rstrip("/\\")
    except (OSError, ValueError):
        return str(path)


def _touch(a: str, b: str) -> bool:
    """The same file, or one inside the other (a tileset's folder and its part)."""
    return a == b or a.startswith(b + os.sep) or b.startswith(a + os.sep)


def _clash(n: dict, m: dict) -> bool:
    """Two needs touch the same file: one writes what the other reads or
    writes. Two readers of one .blend go together (a background Blender never
    saves it unless it says it writes it)."""
    nw, nr, mw, mr = n.get("writes") or (), n.get("reads") or (), m.get("writes") or (), m.get("reads") or ()
    return any(_touch(a, b) for a in nw for b in (*mw, *mr)) or any(_touch(a, b) for a in nr for b in mw)


def plan_start(waiting: list, running: list, bud: dict) -> list:
    """Who starts now (pure). ``waiting`` in the queue's order and ``running``:
    needs ``{tool, cores, memory_mb, reads, writes, label}``. → one entry per
    waiting need: ``None`` (it starts: counted at once for the ones after it)
    or why not ``{code, other?}``:

    - ``file`` — a process running, or one before it in the queue, touches
      its file (it waits that one: two jobs on the same file never together);
    - ``alone`` — it alone passes the ceiling and starts when nothing runs,
      or one such runs now;
    - ``one`` — «un lavoro alla volta»;
    - ``tool`` — every instance of its tool is busy;
    - ``turn`` — one before it waits for cores or memory: it keeps its turn;
    - ``memory`` / ``cores`` — not enough free under the ceiling."""
    run = list(running)
    out = []
    blocked_res = None
    ahead: list = []
    for n in waiting:
        why = None
        lim = (bud.get("tools") or {}).get(n.get("tool")) or {"max": 1 << 30}
        cores, mem = int(n.get("cores") or 0), int(n.get("memory_mb") or 0)
        alone = cores > bud["cores"] or mem > bud["memory_mb"]
        other = next((r for r in run if _clash(n, r)), None) or next((a for a in ahead if _clash(n, a)), None)
        if other is not None:
            why = {"code": "file", "other": other.get("label") or ""}
        elif any(r.get("alone") for r in run):
            why = {"code": "alone", "other": next(r for r in run if r.get("alone")).get("label") or ""}
        elif alone and run:
            why = {"code": "alone"}
        elif bud.get("one") and run:
            why = {"code": "one", "other": run[0].get("label") or ""}
        elif sum(1 for r in run if r.get("tool") == n.get("tool")) >= lim["max"]:
            why = {"code": "tool", "other": n.get("tool")}
        elif blocked_res is not None and (cores or mem):
            why = {"code": "turn", "other": blocked_res.get("label") or ""}
        elif not alone and mem and sum(int(r.get("memory_mb") or 0) for r in run) + mem > bud["memory_mb"]:
            why = {"code": "memory"}
        elif not alone and cores and sum(int(r.get("cores") or 0) for r in run) + cores > bud["cores"]:
            why = {"code": "cores"}
        if why is None:
            run.append({**n, "alone": alone})
        else:
            ahead.append(n)
            if why["code"] in ("memory", "cores", "alone") and blocked_res is None:
                blocked_res = n
        out.append(why)
    return out


#: the reasons in words (the page says them in its language from ``code``)
WAIT_SAY = {"file": "waits for the same file", "alone": "waits to run alone (over the ceiling)",
            "one": "waits: one job at a time", "tool": "waits for a free instance of its tool",
            "turn": "waits its turn", "memory": "waits for memory", "cores": "waits for free cores"}


class Scheduler:
    """The tickets: :meth:`enter` (in order, at once), :meth:`wait` (blocks
    until :func:`plan_start` lets it start, or the cancel), :meth:`release`."""

    def __init__(self, share: str = "all", cores=None, memory_mb=None):
        self.cond = threading.Condition(threading.RLock())
        self.share = share if share in SHARES else "all"
        self._cores = cores
        self._memory = memory_mb
        self.waiting: list = []      # [ticket]
        self.running: dict = {}      # id → ticket
        self.seq = 0
        self.peak = {"cores": 0, "memory_mb": 0, "running": 0}

    def budget(self) -> dict:
        return budget(self.share, self._cores if self._cores else performance_cores(),
                      self._memory if self._memory else memory_ceiling_mb())

    def need(self, tool: str, *, cores=None, memory_mb=0, reads=(), writes=(), label: str = "", job=None) -> dict:
        bud = self.budget()
        lim = bud["tools"].get(tool) or {"cores": 1}
        return {"tool": tool, "cores": int(lim["cores"] if cores is None else cores), "memory_mb": int(memory_mb or 0),
                "reads": [_norm(p) for p in reads if p], "writes": [_norm(p) for p in writes if p],
                "label": label, "job": job}

    def enter(self, need: dict) -> dict:
        with self.cond:
            self.seq += 1
            t = {**need, "id": self.seq, "state": "waiting", "why": None, "since": time.time()}
            self.waiting.append(t)
            self._pump()
            return t

    def wait(self, t: dict, cancelled=lambda: False) -> dict:
        with self.cond:
            while t["state"] == "waiting":
                if cancelled():
                    self.waiting.remove(t)
                    t["state"] = "cancelled"
                    self._pump()
                    raise _Cancelled()
                self.cond.wait(0.25)
            return t

    def release(self, t: dict):
        with self.cond:
            if t["state"] == "waiting":
                self.waiting.remove(t)
            self.running.pop(t["id"], None)
            t["state"] = "ended"
            self._pump()

    def set_share(self, share: str):
        with self.cond:
            self.share = share if share in SHARES else "all"
            self._pump()

    def _pump(self):
        bud = self.budget()
        whys = plan_start(self.waiting, list(self.running.values()), bud)
        for t, why in list(zip(self.waiting, whys)):
            t["why"] = why
            if why is None:
                self.waiting.remove(t)
                t["state"] = "running"
                t["alone"] = t["cores"] > bud["cores"] or t["memory_mb"] > bud["memory_mb"]
                t["started"] = time.time()
                self.running[t["id"]] = t
        used_c = sum(x["cores"] for x in self.running.values())
        used_m = sum(x["memory_mb"] for x in self.running.values())
        self.peak = {"cores": max(self.peak["cores"], used_c), "memory_mb": max(self.peak["memory_mb"], used_m),
                     "running": max(self.peak["running"], len(self.running))}
        for t in self.waiting:
            job, row = t.get("job"), t.get("row")
            if t["why"]:
                said = {**t["why"], "say": WAIT_SAY.get(t["why"]["code"], "")}
                if row is not None:
                    row["wait"] = said
                elif job is not None:
                    job.wait = said
        self.cond.notify_all()

    def view(self) -> dict:
        """What the queue's panel shows: per tool how many run against its
        maximum, the cores and memory in use against the ceiling, who waits
        and why."""
        with self.cond:
            bud = self.budget()
            run = list(self.running.values())
            tools = {k: {"running": sum(1 for r in run if r["tool"] == k), "max": v["max"], "cores": v["cores"]}
                     for k, v in bud["tools"].items()}
            show = lambda t: {"tool": t["tool"], "label": t["label"], "cores": t["cores"], "memory_mb": t["memory_mb"],
                              "job": t["job"].id if t.get("job") is not None else None,
                              **({"why": t["why"], "say": WAIT_SAY.get((t["why"] or {}).get("code"), "")}
                                 if t["state"] == "waiting" else {"since": t.get("started")})}
            return {"ok": True, "share": bud["share"], "shares": list(SHARES),
                    "budget": {"cores": bud["cores"], "memory_mb": bud["memory_mb"], "one": bud["one"]},
                    "machine": {"performance_cores": self._cores or performance_cores(), "memory_mb": memory_total_mb()},
                    "used": {"cores": sum(r["cores"] for r in run), "memory_mb": sum(r["memory_mb"] for r in run)},
                    "peak": dict(self.peak), "tools": tools,
                    "running": [show(t) for t in run], "waiting": [show(t) for t in self.waiting]}


SCHED = Scheduler(os.environ.get("EM_QUEUE_SHARE") or "all")


class lease:
    """``with lease(need, cancelled, on_wait):`` a process under the
    scheduler: waits its turn, runs, gives its place back."""

    def __init__(self, need: dict, cancelled=lambda: False, sched=None):
        self.sched = sched or SCHED
        self.ticket = self.sched.enter(need)
        self.cancelled = cancelled

    def __enter__(self):
        self.sched.wait(self.ticket, self.cancelled)
        return self.ticket

    def __exit__(self, *exc):
        self.sched.release(self.ticket)
        return False


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
        #: MICRO-CODA-VISTA p.4 · who asked the cancel (the page says it: the
        #: queue, the status bar's chip, Ottimizza's bar…) — another window
        #: following the same job then says by whom, not a bare «cancelled»
        self.cancel_by = ""
        self.proc = None
        #: a batch's rows (MICRO-OTTIMIZZA-2): one per file, its own state,
        #: progress and cancel
        self.items: list = []
        #: MICRO-CODA-MULTICORE · what it asks the scheduler (None: it asks
        #: nothing, or its files ask one by one), why it waits, the threads
        #: its tool may use
        self.need = None
        self.ticket = None
        self.wait = None
        self.threads = 0

    def say(self, line: str, echo: bool = True):
        with _LOCK:
            self.lines.append(f"{time.strftime('%H:%M:%S')} {line}")
            del self.lines[:-500]
        if echo:
            sys.stderr.write(f"  [job {self.id} {self.kind}] {line}\n")

    def run_process(self, cmd: list, timeout: float = 3600, env=None):
        """The tool in a process of its own; cancel ends it. → CompletedProcess."""
        self.proc = subprocess.Popen(child_argv(cmd), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                     **popen_kw(env))
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
                    "wait": self.wait if self.state == "queued" else None,
                    "tool": (self.need or {}).get("tool"), "cores": (self.need or {}).get("cores"),
                    "created": self.created, "started": self.started, "ended": self.ended,
                    "cancel_by": self.cancel_by}


def _run(job: Job, target):
    ticket = job.ticket
    try:
        if ticket is not None:
            if ticket["state"] == "waiting":
                job.say(f"waiting: {WAIT_SAY.get((ticket['why'] or {}).get('code'), '')}")
            SCHED.wait(ticket, job.cancel.is_set)
            job.wait = None
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
        if ticket is not None:
            SCHED.release(ticket)


def submit(kind: str, params: dict, target, *, heavy: bool = False, estimate_mb=None, label: str = "",
           tool=None, cores=None, reads=(), writes=()) -> Job:
    """A job in the background. ``tool`` (MICRO-CODA-MULTICORE): the tool its
    process is an instance of — it then waits the scheduler (cores, memory
    ``estimate_mb``, an instance free, ``reads`` / ``writes`` not touched by
    another); None: it asks nothing (a probe, a batch whose files ask one by
    one)."""
    job = Job(kind, params, heavy=heavy, estimate_mb=estimate_mb, label=label)
    if tool:
        job.need = SCHED.need(tool, cores=cores, memory_mb=estimate_mb or 0, reads=reads, writes=writes,
                              label=job.label)
        job.need.pop("job", None)
        job.threads = job.need["cores"]
        # entered here, not in the thread: the queue keeps the order of the calls
        job.ticket = SCHED.enter({**job.need, "job": job})
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


def cancel(job_id: str, item=None, by: str = "") -> bool:
    """Cancel a job, or ONE file of a batch (``item``: its index). ``by``
    (MICRO-CODA-VISTA): who asked it, kept on the job and in its view."""
    job = _JOBS.get(job_id)
    if job is None:
        return False
    if by and not job.cancel_by:
        job.cancel_by = str(by)[:80]
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
        # MICRO-CODA-MULTICORE · the threads the scheduler gave the KTX2 job
        if int(p.get("threads") or 0) > 1:
            cmd += ["-tj", str(int(p["threads"]))]
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


def gltfpack_memory_mb(bytes_in: int, ktx2: bool = False) -> int:
    """The memory a gltfpack variant asks, said before it starts (MICRO-CODA-
    MULTICORE), on the cautious side: 150 MB, plus 6 × the glb in MB (its
    geometry unpacked, simplified and written), plus 600 MB when the textures
    become KTX2 (images decoded and BasisU's encoders, one per thread)."""
    return int(150 + 6 * max(0, bytes_in) / (1024 * 1024) + (600 if ktx2 else 0))


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
            run = subprocess.run(child_argv([c, "--help"]), capture_output=True, text=True, timeout=60, **popen_kw())
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
    (``--progress`` of E.D.'s build, ``Obj2Tiles/Stages/ProgressReporter.cs``:
    ``{"stage", "done", "total", "percent"}`` for decimation, splitting —
    with its ``lod``, ``percent`` the whole stage's —, tiling and packing;
    ``{"stage": "done", "elapsed"}``; ``{"stage": "error", "message"}``); else
    an ESTIMATE BY PHASES from the lines upstream v1.8.0 prints: decimation
    (one ``Output:`` per level after the first, 30%), splitting
    (``[LOD-i-Mesh-k/T] Done``, 55%), tiling (``Converting to glb``, 15%).
    Measured on the native build (30 Oct 2026, 45 k triangles): 4 decimation,
    88 splitting, 85 tiling lines and «done», the share never going back."""

    WEIGHTS = {"decimation": (0.0, 0.30), "splitting": (0.30, 0.55), "tiling": (0.85, 0.13),
               "packing": (0.98, 0.02)}
    error = ""

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
                elif st == "error":
                    self.error = str(ev.get("message") or "")
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


# ── the processes the bridge starts (MICRO-BLENDER-SIDECAR) ─────────────────
#
# In the desktop app every Blender died at once, «Blender exited -11», and the
# same em-bridge started from a terminal worked. The crash reports were the
# bridge's own, not Blender's: the CHILD segfaulted inside ``fork()``, before
# ``exec``, in PROJ's ``pthread_atfork`` handler (pyproj, once the globe or a
# CRS has opened proj.db: ``SQLiteHandleCache`` closes its SQLite handles in
# the child → ``sqlite3_log`` → ``os_log``, not safe after a fork in a process
# launched by the GUI). So the bridge never forks to start a tool:
# ``posix_spawn`` runs no atfork handler. Python takes it by itself for a
# ``Popen`` with ``close_fds=False`` (our descriptors are not inheritable
# anyway, PEP 446), no ``cwd``, no ``start_new_session`` and a program with
# its path (``popen_kw`` / ``child_argv``); ``run_tool`` spawns by hand to
# have its own session too (``setsid``: a cancel ends the tool's children).
# The environment is the person's, not the frozen runtime's (``child_env``).


def child_env(env=None) -> dict:
    """The environment for a tool: ``env`` (or ours) without what a frozen
    bridge put there for ITSELF — PyInstaller's ``_PYI_*``/``_MEI*``, any
    variable pointing into its unpacked folder (PROJ_DATA, SSL_CERT_FILE,
    TCL_LIBRARY…; from a PATH-like list only those entries), and the
    ``LD_LIBRARY_PATH`` / ``DYLD_*`` it changed given back as they were
    (``*_ORIG``)."""
    out = dict(os.environ if env is None else env)
    mei = getattr(sys, "_MEIPASS", "") if getattr(sys, "frozen", False) else ""
    if not mei:
        return out
    mei = os.path.realpath(mei)
    roots = {mei, getattr(sys, "_MEIPASS", mei)}

    def inside(v: str) -> bool:
        return any(r and (v == r or v.startswith(r + os.sep)
                          or os.path.realpath(v).startswith(r + os.sep)) for r in roots if v)
    for k in list(out):
        if k.startswith(("_PYI_", "_MEI")):
            del out[k]
    for k in ("LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "DYLD_FRAMEWORK_PATH", "LIBPATH"):
        if k + "_ORIG" in out:
            out[k] = out.pop(k + "_ORIG")
    for k, v in list(out.items()):
        parts = v.split(os.pathsep) if os.pathsep in v else [v]
        keep = [p for p in parts if not inside(p)]
        if len(keep) == len(parts):
            continue
        if keep and any(keep):
            out[k] = os.pathsep.join(keep)
        else:
            del out[k]
    return out


def child_argv(cmd: list) -> list:
    """The program with its path (``posix_spawn`` is taken only for one with a
    path; PATH as the tool will see it)."""
    cmd = list(cmd)
    if cmd and not os.path.dirname(cmd[0]):
        found = shutil.which(cmd[0], path=child_env().get("PATH"))
        if found:
            cmd[0] = found
    return cmd


def popen_kw(env=None) -> dict:
    """What a ``subprocess.Popen``/``run`` of a tool adds so that Python
    spawns it without forking (see above): no descriptor of ours open in it,
    stdin closed, the person's environment."""
    kw: dict = {"stdin": subprocess.DEVNULL, "env": child_env(env)}
    if os.name == "posix":
        kw["close_fds"] = False
    return kw


def exit_say(name: str, rc, tail=()) -> str:
    """A tool that failed said in words: the signal that ended it (by name,
    what it means) and its last lines — not «-11»."""
    import signal as _sig
    words = {"SIGSEGV": "segmentation fault", "SIGBUS": "bus error", "SIGILL": "illegal instruction",
             "SIGABRT": "aborted", "SIGKILL": "killed (out of memory, or stopped from outside)",
             "SIGTERM": "terminated", "SIGINT": "interrupted", "SIGHUP": "hang-up", "SIGFPE": "arithmetic error",
             "SIGPIPE": "broken pipe", "SIGTRAP": "trap"}
    if isinstance(rc, int) and rc < 0:
        try:
            sn = _sig.Signals(-rc).name
        except ValueError:
            sn = f"signal {-rc}"
        head = f"{name} was ended by {sn} ({words.get(sn, 'signal')}, exit {rc})"
    else:
        head = f"{name} exited {rc}"
    last = [ln for ln in tail if str(ln).strip()][-6:]
    return head + (": " + " | ".join(last) if last else " before writing anything")


class _Spawned:
    """A tool started with ``os.posix_spawn`` (no fork), in a session of its
    own: what ``run_tool`` uses of a ``Popen``. ``quiet``: its output goes
    nowhere (a program left to run on its own: Blender with its interface)."""

    def __init__(self, cmd: list, env: dict, quiet: bool = False):
        import signal as _sig
        r, w = (os.open(os.devnull, os.O_WRONLY), None) if quiet else os.pipe()
        out = r if quiet else w
        null = os.open(os.devnull, os.O_RDONLY)
        try:
            self.pid = os.posix_spawn(cmd[0], cmd, env, file_actions=[
                (os.POSIX_SPAWN_DUP2, null, 0), (os.POSIX_SPAWN_DUP2, out, 1), (os.POSIX_SPAWN_DUP2, out, 2)],
                setsid=True, setsigdef=(_sig.SIGPIPE, _sig.SIGXFSZ))
        except BaseException:
            if not quiet:
                os.close(r)
            raise
        finally:
            os.close(out)
            os.close(null)
        self.stdout = None if quiet else open(r, "r", encoding="utf-8", errors="replace", buffering=1)
        self.returncode = None

    def poll(self):
        if self.returncode is None:
            try:
                pid, status = os.waitpid(self.pid, os.WNOHANG)
            except ChildProcessError:
                pid, status = self.pid, 0
            if pid:
                self.returncode = os.waitstatus_to_exitcode(status)
        return self.returncode

    def wait(self, timeout=None):
        if timeout is None and self.returncode is None:
            try:
                self.returncode = os.waitstatus_to_exitcode(os.waitpid(self.pid, 0)[1])
            except ChildProcessError:
                self.returncode = 0
        end = None if timeout is None else time.time() + timeout
        while self.poll() is None:
            if end is not None and time.time() > end:
                raise subprocess.TimeoutExpired([str(self.pid)], timeout)
            time.sleep(0.05)
        return self.returncode

    def _signal(self, sig):
        if self.returncode is not None:
            return
        try:
            os.killpg(self.pid, sig)
        except (ProcessLookupError, PermissionError):
            try:
                os.kill(self.pid, sig)
            except ProcessLookupError:
                pass

    def terminate(self):
        import signal as _sig
        self._signal(_sig.SIGTERM)

    def kill(self):
        import signal as _sig
        self._signal(_sig.SIGKILL)


def spawn_tool(cmd: list, env=None):
    """``cmd`` started without forking, stdout and stderr together in
    ``.stdout``, stdin closed, a session of its own (POSIX); elsewhere a
    ``Popen`` in a new process group."""
    cmd = child_argv(cmd)
    if hasattr(os, "posix_spawn") and os.path.isabs(cmd[0]):
        try:
            return _Spawned(cmd, child_env(env))
        except NotImplementedError:
            pass   # a libc without POSIX_SPAWN_SETSID: the Popen below
    kw = popen_kw(env)
    if sys.platform == "win32":
        kw["creationflags"] = 0x00000200   # CREATE_NEW_PROCESS_GROUP
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                            encoding="utf-8", errors="replace", bufsize=1, **kw)


def run_tool(cmd: list, on_line, cancelled, *, stall_s: float = 900, timeout: float = 6 * 3600, env=None) -> dict:
    """A tool in a process of its own, its output read line by line (stdout and
    stderr together) while it runs. Ended by ``cancelled()``; KILLED when it
    writes nothing for ``stall_s`` seconds (the round-0 stall of Obj2Tiles
    under Rosetta: log frozen, CPU at 1000%). → ``{returncode, peak_mb,
    seconds, stalled, tail}`` — the peak resident memory of the process itself
    (``wait4``) where the system says it. Started by ``spawn_tool``: never a
    fork (MICRO-BLENDER-SIDECAR)."""
    import queue
    proc = spawn_tool(cmd, env)
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
            run = subprocess.run(child_argv([tool["node"], tool["main"], "--tilesetFile", ts, "--reportFile", report]),
                                 capture_output=True, text=True, timeout=1800, **popen_kw())
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


# ── MICRO-OTTIMIZZA-3 p.3 · many meshes, ONE tileset ───────────────────────
#
# E.D. (28 Oct): the 11 parts of OB_*_LOD0 of Templu Mare are one survey, and
# a survey is best looked at as one tileset. Each part is tiled on its own (side
# by side under the memory ceiling, as a batch), into a sub-folder of ONE folder;
# then a PARENT tileset.json composes them — each part an external tileset,
# its tile's box the part's root box in the parent's frame — and the whole
# folder is judged and packed into ONE .3tz. The way of 3D Survey Collection's
# ``cesium_exporter/tileset_stitcher.py`` (``_build_parent_tileset``), with the
# children's root transforms carried into the boxes.

def _mat_mul_point(m, p):
    """A column-major 4×4 (3D Tiles' ``transform``) applied to a point."""
    x, y, z = p
    return (m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14])


def _box_aabb(box, m=None):
    """A 3D Tiles ``box`` (centre + three half-axes) → its axis-aligned bounds,
    after the transform ``m`` when there is one."""
    c, axes = box[0:3], (box[3:6], box[6:9], box[9:12])
    if m:
        c = _mat_mul_point(m, c)
        axes = tuple(tuple(m[r] * a[0] + m[4 + r] * a[1] + m[8 + r] * a[2] for r in range(3)) for a in axes)
    ext = [sum(abs(a[i]) for a in axes) for i in range(3)]
    return [c[i] - ext[i] for i in range(3)], [c[i] + ext[i] for i in range(3)]


def _aabb_box(lo, hi):
    c = [(lo[i] + hi[i]) / 2 for i in range(3)]
    h = [max((hi[i] - lo[i]) / 2, 1e-6) for i in range(3)]
    return [c[0], c[1], c[2], h[0], 0.0, 0.0, 0.0, h[1], 0.0, 0.0, 0.0, h[2]]


def compose_tileset(folder: str, parts: list) -> dict:
    """The parent ``tileset.json`` of ``folder`` over the tilesets of its
    sub-folders ``parts`` (names): one child tile per part, ``content.uri``
    ``<part>/tileset.json`` (an external tileset), its box the part root's box
    in the parent's frame (the part's ``transform`` applied, so it stays the
    part's), its geometric error the part's box diagonal (never below the
    part's own); the root without content, ``ADD``, its box the union and its
    error that union's diagonal — the viewer always descends into the parts.
    → ``{parts, geometric_error_m, box}``; raises when a part is unreadable."""
    import math
    children, lows, highs = [], [], []
    for name in parts:
        doc = json.loads(open(os.path.join(folder, name, "tileset.json"), encoding="utf-8").read())
        root = doc.get("root") or {}
        box = (root.get("boundingVolume") or {}).get("box")
        if not isinstance(box, list) or len(box) != 12:
            raise ValueError(f"{name}: its root has no boundingVolume.box")
        lo, hi = _box_aabb([float(v) for v in box], root.get("transform"))
        diag = math.dist(lo, hi)
        own = float(doc.get("geometricError") or root.get("geometricError") or 0.0)
        children.append({"boundingVolume": {"box": _aabb_box(lo, hi)}, "geometricError": max(diag, own),
                         "content": {"uri": f"{name}/tileset.json"}})
        lows.append(lo)
        highs.append(hi)
    lo = [min(v[i] for v in lows) for i in range(3)]
    hi = [max(v[i] for v in highs) for i in range(3)]
    ge = max([math.dist(lo, hi), 1.0] + [c["geometricError"] for c in children])
    box = _aabb_box(lo, hi)
    parent = {"asset": {"version": "1.1", "generator": "EMStudio (MICRO-OTTIMIZZA-3): one tileset of a survey's parts"},
              "geometricError": ge,
              "root": {"boundingVolume": {"box": box}, "geometricError": ge, "refine": "ADD", "children": children}}
    with open(os.path.join(folder, "tileset.json"), "w", encoding="utf-8") as fh:
        json.dump(parent, fh, indent=1)
    return {"parts": len(children), "geometric_error_m": ge, "box": box}


def run_tileset_batch(job: Job, items: list, tool: dict, pack, *, ceiling_mb: int, workers: int,
                      combine: dict = None) -> dict:
    """The batch: each OBJ → its tileset folder → the validator → the .3tz
    (``pack(folder) → result``), MORE PROCESSES SIDE BY SIDE under the
    scheduler (MICRO-CODA-MULTICORE: cores, memory and Obj2Tiles' instances
    shared with every other job; one that alone passes ``ceiling_mb`` is
    refused before it starts; ``workers`` is kept for the callers). Each item has
    its own state, progress and cancel (``job.items``); the job's progress is
    their mean. A process that stalls is tried once more.

    ``combine`` (MICRO-OTTIMIZZA-3 p.3) ``{folder, name, path}``: the parts are
    not packed one by one; when ALL of them pass, :func:`compose_tileset`
    writes the parent in ``folder``, the validator judges the whole, and ONE
    .3tz is packed (``result.combined``). One part that fails, or does not
    pass, and there is no combined tileset: the parts' folders stay."""
    job.items = [{"source": it["source"], "name": it.get("name"), "state": "queued", "progress": 0.0,
                  "stage": "", "estimate_mb": it.get("estimate_mb"), "cancel": False} for it in items]
    results: list = [None] * len(items)

    def refresh():
        with _LOCK:
            job.progress = sum(x["progress"] for x in job.items) / max(1, len(job.items))
            live = [x for x in job.items if x["state"] == "running"]
            done = sum(1 for x in job.items if x["state"] in ("done", "failed", "invalid", "cancelled", "refused"))
            job.stage = f"{done}/{len(job.items)}" + (f" · {live[0]['name']}" if len(live) == 1 else
                                                     f" · {len(live)} in parallel" if live else "")

    tickets: dict = {}

    def one(i: int):
        it, row = items[i], job.items[i]
        t = tickets[i]
        try:
            try:
                SCHED.wait(t, lambda: row["cancel"] or job.cancel.is_set())
            except _Cancelled:
                results[i] = {**it, "state": "cancelled"}
                row.update(state="cancelled", progress=1.0)
                row.pop("wait", None)
                refresh()
                return
            row.pop("wait", None)
            used = SCHED.view()["used"]
            job.say(f"{it.get('name')}: started ({it.get('estimate_mb')} MB asked, "
                    f"{used['memory_mb']} of {SCHED.budget()['memory_mb']} MB in use)")
            res = _tileset_one(job, it, row, tool, None if combine else pack, refresh)
        except _Cancelled:
            res = {**it, "state": "cancelled"}
            row["state"] = "cancelled"
        except Exception as exc:  # noqa: BLE001 — one file's failure is its row
            res = {**it, "state": "failed", "error": str(exc)}
            row["state"] = "failed"
            job.say(f"{it.get('name')}: {exc}")
        finally:
            SCHED.release(t)
        results[i] = res
        row["progress"] = 1.0
        refresh()
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
    # MICRO-CODA-MULTICORE · each file an Obj2Tiles of its own under the
    # scheduler: entered in order at once, with the files of other batches and
    # the other tools (``workers`` is no longer a cap of its own: Obj2Tiles'
    # maximum is the scheduler's)
    for i in pending:
        it = items[i]
        need = SCHED.need("obj2tiles", memory_mb=it.get("estimate_mb") or 0, reads=[it["source"]],
                          writes=[it.get("folder") or ""], label=f"Obj2Tiles · {it.get('name')}")
        tickets[i] = SCHED.enter({**need, "job": job, "row": job.items[i]})
    refresh()
    threads = [threading.Thread(target=one, args=(i,), daemon=True) for i in pending]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    out = [r for r in results if r]
    if job.cancel.is_set() and not any(r.get("state") == "done" for r in out):
        raise _Cancelled()
    if combine:
        return {"tool": tool, "outputs": out, "ceiling_mb": ceiling_mb,
                "combined": _combine_parts(job, combine, items, out, pack)}
    return {"tool": tool, "outputs": out, "ceiling_mb": ceiling_mb}


def _combine_parts(job: Job, combine: dict, items: list, out: list, pack) -> dict:
    """The parts done → the parent, judged, packed: ``{state, folder, path,
    sha256, bytes, facts, validation, pack, sources, parts}``."""
    folder = combine["folder"]
    head = {"name": combine.get("name"), "folder": folder, "path": combine.get("path"),
            "sources": [it["source"] for it in items]}
    bad = [r for r in out if r.get("state") != "done"]
    if bad or job.cancel.is_set():
        why = "; ".join(f"{r.get('name')}: {r.get('error') or r.get('state')}" for r in bad) or "cancelled"
        job.say(f"one tileset of the survey: not made — {why}")
        return {**head, "state": "failed", "error": why}
    job.stage = "composing"
    parts = [os.path.basename(r["folder"].rstrip("/\\")) for r in out]
    composed = compose_tileset(folder, parts)
    job.say(f"one tileset of the survey: {composed['parts']} parts composed in {os.path.basename(folder)}/tileset.json")
    job.stage = "validation"
    verdict = validate_tileset(folder)
    job.say(f"one tileset of the survey: {verdict['validator']}: {verdict['errors']} errors, {verdict['warnings']} warnings")
    facts = tileset_facts(folder)
    if not verdict["ok"]:
        return {**head, "state": "invalid", "validation": verdict, "facts": facts,
                "error": "; ".join(verdict["messages"][:3])}
    job.stage = "packing"
    packed = pack(folder)
    return {**head, "state": "done", "parts": parts, "composed": composed, "validation": verdict, "facts": facts,
            "pack": packed, "sha256": packed.get("sha256"), "bytes": packed.get("bytes"),
            "path": packed.get("path") or combine.get("path")}


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
        return {**it, "state": "failed", "error": prog.error or exit_say("Obj2Tiles", run["returncode"], run["tail"])[-600:],
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
    if pack is None:
        # a part of ONE tileset: packed with the others, after the parent
        row["state"] = "done"
        row["stage"] = ""
        return {**base, "state": "done"}
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
