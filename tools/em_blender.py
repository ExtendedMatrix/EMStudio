"""MICRO-OTTIMIZZA-3 · Blender as the second way: FOUND, ASKED, then USED.

FOUND. The sidecar looks for Blender where each system puts it (macOS
``/Applications/Blender*.app``, Windows ``Program Files\\Blender Foundation``
and Steam, Linux the PATH, ``/snap``, ``/opt``, ``~/blender*``), plus
``EM_BLENDER`` and the one the person chose in Settings (remembered in the
bridge's state folder, ``blender.json``). Nothing is installed or changed in
Blender: it is the person's.

ASKED. A probe — ``blender -b --python <runner> -- {"op": "probe"}``, about
1.5 s once the add-ons' wheels are in place — says what is there: Blender's
version and Python, EM Tools and 3D Survey Collection loaded or not, their
operators, and for an add-on that does not load, WHY in data the page puts in
words (its wheels are for another Python, it is not enabled, its version range
excludes this Blender, it is not installed). A build that breaks an add-on
(27 Oct 2026: EM Tools dev.31 with cp311 wheels in a Blender 5.2) is said
before anything is asked of it, not discovered in a failed job.

USED. Every Blender operation is a JOB of ``em_optimize`` (its queue, its
progress, its cancel, its notice at the end), Blender in a process of its own,
the heavy ones one at a time with their memory said before: the experiences'
LOD set and an atlas re-baked by 3D Survey Collection, a LOD set from an object
of a .blend, EM Tools' «Prepare for a use» on the graph open in EMStudio. The
runner lives here as text and is written beside the add-ons, so the frozen
bridge carries it as well.
"""
from __future__ import annotations

import glob
import json
import os
import pathlib
import shutil
import subprocess
import sys
import threading
import time

import em_optimize as O

# ── found ────────────────────────────────────────────────────────────────────


def _known_paths() -> list:
    """Where Blender lives on this system, newest first."""
    pats: list = []
    if sys.platform == "darwin":
        for base in ("/Applications", os.path.expanduser("~/Applications")):
            pats.append(os.path.join(base, "Blender*.app", "Contents", "MacOS", "Blender"))
            pats.append(os.path.join(base, "Blender*", "Blender*.app", "Contents", "MacOS", "Blender"))
    elif sys.platform == "win32":
        for env in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            base = os.environ.get(env)
            if base:
                pats.append(os.path.join(base, "Blender Foundation", "Blender*", "blender.exe"))
                pats.append(os.path.join(base, "Steam", "steamapps", "common", "Blender", "blender.exe"))
                pats.append(os.path.join(base, "Programs", "Blender Foundation", "Blender*", "blender.exe"))
    else:
        pats += ["/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender",
                 "/opt/blender*/blender", os.path.expanduser("~/blender*/blender"),
                 os.path.expanduser("~/Applications/blender*/blender")]
    out: list = []
    for p in pats:
        out += sorted(glob.glob(p), reverse=True)
    which = shutil.which("blender")
    if which:
        out.append(which)
    seen, uniq = set(), []
    for p in out:
        r = os.path.realpath(p)
        if r not in seen and os.path.isfile(p) and os.access(p, os.X_OK):
            seen.add(r)
            uniq.append(p)
    return uniq


def _choice_file() -> pathlib.Path:
    return O.state_dir() / "blender.json"


def chosen() -> str:
    """The Blender the person chose in Settings, or ``EM_BLENDER``; "" = the
    newest one found."""
    env = os.environ.get("EM_BLENDER") or ""
    if env:
        return env
    try:
        return str(json.loads(_choice_file().read_text("utf-8")).get("path") or "")
    except (OSError, ValueError, AttributeError):
        return ""


def choose(path: str) -> dict:
    """Remember the person's Blender ("" forgets it: the newest found again)."""
    path = os.path.abspath(os.path.expanduser(path)) if path else ""
    if path and sys.platform == "darwin" and path.endswith(".app"):
        path = os.path.join(path, "Contents", "MacOS", "Blender")
    if path and not (os.path.isfile(path) and os.access(path, os.X_OK)):
        return {"ok": False, "error": f"{path} is not a program that runs"}
    f = _choice_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps({"path": path, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}), "utf-8")
    _PROBES.pop(path, None)
    return {"ok": True, "path": path}


def candidates() -> list:
    """Every Blender found, the chosen one first (even if it is elsewhere)."""
    found = _known_paths()
    c = chosen()
    if c and os.path.isfile(c):
        found = [c] + [p for p in found if os.path.realpath(p) != os.path.realpath(c)]
    return found


def current() -> str:
    """The Blender the jobs use: the chosen one, else the newest found."""
    c = chosen()
    if c and os.path.isfile(c):
        return c
    found = _known_paths()
    return found[0] if found else ""


# ── the runner (text, written beside the add-ons) ───────────────────────────

RUNNER = r'''
# EMStudio's runner inside Blender (em_blender.RUNNER). One JSON argument after
# "--": {"op": ..., ...}. Lines: EMSTUDIO-PROGRESS {json}, EMSTUDIO-RESULT {json}.
import importlib, json, os, sys, time, traceback
import bpy

A = json.loads(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else {"op": "probe"}


def say(kind, obj):
    sys.stdout.write("EMSTUDIO-%s %s\n" % (kind, json.dumps(obj)))
    sys.stdout.flush()


def module_with(attr, suffix=""):
    for name, m in list(sys.modules.items()):
        if m is None or (suffix and not name.endswith(suffix)) or not name.startswith("bl_ext."):
            continue
        if attr is None or attr in (getattr(m, "__dict__", None) or {}):
            return name, m
    return None, None


def has_op(cat, name):
    try:
        getattr(getattr(bpy.ops, cat), name).get_rna_type()
        return True
    except Exception:
        return False


def read_toml(path):
    try:
        import tomllib
        with open(path, "rb") as f:
            return tomllib.load(f)
    except Exception:
        return None


def repos():
    out = []
    try:
        for r in bpy.context.preferences.extensions.repos:
            d = getattr(r, "directory", "") or ""
            if d and os.path.isdir(d):
                out.append((getattr(r, "module", "") or os.path.basename(d), d, bool(getattr(r, "enabled", True))))
    except Exception:
        pass
    return out


def find_extension(ext_id, folder_hint):
    """(repo module, folder, manifest) of an installed extension by its id, or
    of the development link whose folder is ``folder_hint``."""
    for mod, d, on in repos():
        for name in sorted(os.listdir(d)):
            if name.startswith("."):
                continue
            mf = os.path.join(d, name, "blender_manifest.toml")
            if not os.path.isfile(mf):
                continue
            m = read_toml(mf) or {}
            if m.get("id") == ext_id or name == folder_hint:
                return mod, os.path.join(d, name), m, on
    return None, None, None, False


def cp_tags(manifest):
    tags = set()
    for w in (manifest or {}).get("wheels") or []:
        parts = os.path.basename(w)[:-4].split("-")
        if len(parts) < 5 or parts[-2] == "abi3":   # an abi3 wheel runs on any later Python
            continue
        py = parts[-3]
        if py.startswith("cp3") and py[3:].isdigit():
            tags.add("3." + py[3:])
    return sorted(tags)


def vtuple(s):
    try:
        return tuple(int(x) for x in str(s).split(".")[:3])
    except Exception:
        return None


def why_not(ext_id, folder_hint):
    mod, folder, man, repo_on = find_extension(ext_id, folder_hint)
    if not folder:
        return {"code": "missing"}
    key = "bl_ext.%s.%s" % (mod, os.path.basename(folder))
    info = {"folder": folder, "repo": mod, "version": (man or {}).get("version")}
    py = "%d.%d" % sys.version_info[:2]
    tags = cp_tags(man)
    if tags and py not in tags:
        return dict(info, code="wheels", wheels=", ".join(tags), python=py)
    lo, hi = vtuple((man or {}).get("blender_version_min")), vtuple((man or {}).get("blender_version_max"))
    here = tuple(bpy.app.version)
    if (lo and here < lo) or (hi and here >= hi):
        return dict(info, code="range", min=(man or {}).get("blender_version_min"),
                    max=(man or {}).get("blender_version_max"))
    if key not in bpy.context.preferences.addons.keys():
        return dict(info, code="disabled")
    return dict(info, code="broken")


def version_of(pkg):
    m = sys.modules.get(pkg or "")
    f = getattr(m, "__file__", None) if m else None
    man = read_toml(os.path.join(os.path.dirname(f), "blender_manifest.toml")) if f else None
    return (man or {}).get("version")


def probe():
    em_name, _ = module_with(None, ".graph_origins")
    em_pkg = em_name.rsplit(".graph_origins", 1)[0] if em_name else None
    ds_name, ds = module_with("emtools_birth_stamp", ".stamp_bridge")
    ds_pkg = ds_name.rsplit(".stamp_bridge", 1)[0] if ds_name else None
    hl_name, hl = module_with("make_lod_set")
    out = {"blender": bpy.app.version_string, "version": list(bpy.app.version),
           "python": "%d.%d.%d" % sys.version_info[:3], "binary": bpy.app.binary_path,
           "emtools": {"loaded": bool(em_pkg), "package": em_pkg, "version": version_of(em_pkg),
                       "prepare_for_use": has_op("em", "asset_prepare_for_use")},
           "dsc": {"loaded": bool(ds_pkg), "package": ds_pkg, "version": version_of(ds_pkg),
                   "export_cesium_tiles": has_op("object", "export_cesium_tiles"),
                   "lod_creation": has_op("lod", "creation"),
                   "headless": hl_name, "rebake_atlas": bool(hl and hasattr(hl, "rebake_atlas")),
                   "stamps": bool(ds and ds.emtools_birth_stamp() is not None) if ds else False}}
    if not em_pkg:
        out["emtools"]["why"] = why_not("em_tools", "EM-blender-tools")
    if not ds_pkg:
        out["dsc"]["why"] = why_not("dsc_tools", "3D-survey-collection")
    try:
        import resource
        out["maxrss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1e6 if sys.platform == "darwin" else 1e3))
    except Exception:
        pass
    return out


def objects():
    return {"blend": bpy.data.filepath,
            "objects": [{"name": o.name, "faces": len(o.data.polygons), "vertices": len(o.data.vertices),
                         "materials": len(o.data.materials), "collection": o.users_collection[0].name if o.users_collection else ""}
                        for o in bpy.data.objects if o.type == "MESH" and o.data is not None]}


def headless():
    name, m = module_with("make_lod_set")
    if m is None:
        raise RuntimeError("3D Survey Collection's headless module (make_lod_set) is not loaded in this Blender")
    return m


def lod_set():
    m = headless()
    kw = dict(A.get("options") or {})
    return m.make_lod_set(A.get("object") or A["source"], A["out_dir"], levels=int(A.get("levels") or 3), **kw)


def atlas():
    m = headless()
    kw = dict(A.get("options") or {})
    return m.rebake_atlas(A.get("object") or A["source"], A["out_path"], size=int(A.get("size") or 4096), **kw)


def prepare():
    """EM Tools' «Prepare for a use…» on an object of the open .blend, with the
    graph open in EMStudio (a COPY of its em.json) as EM Tools' graph. The .blend
    is never saved; the copy is thrown away: the version is registered by
    EMStudio in its own document."""
    em_name, _ = module_with(None, ".graph_origins")
    if not em_name:
        raise RuntimeError("EM Tools is not loaded in this Blender")
    pkg = em_name.rsplit(".graph_origins", 1)[0]
    av = importlib.import_module(pkg + ".sync_manager.asset_versions")
    scene = bpy.context.scene
    em = scene.em_tools
    if A.get("em_json"):
        em.graphml_files.clear()
        row = em.graphml_files.add()
        row.name = os.path.splitext(os.path.basename(A["em_json"]))[0]
        row.graphml_path = A["em_json"]
        em.active_file_index = 0
        getattr(bpy.ops, "import").em_graphml(graphml_index=0)
    obj = bpy.data.objects.get(A["object"])
    if obj is None:
        raise RuntimeError("no object %r in this .blend" % A["object"])
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    say("PROGRESS", {"stage": "prepare", "done": 0, "total": 1})
    kw = {"use": set(A.get("use") or ["realtime"])}
    for k in ("ratio", "max_texture", "draco"):
        if k in A:
            kw[k] = A[k]
    r = bpy.ops.em.asset_prepare_for_use(**kw)
    if r != {"FINISHED"}:
        raise RuntimeError("Prepare for a use… answered %s" % sorted(r))
    out = dict(getattr(av, "PREPARED", {}) or {})
    say("PROGRESS", {"stage": "prepare", "done": 1, "total": 1})
    return {k: v for k, v in out.items() if isinstance(v, (str, int, float, bool, list, dict, type(None)))}


def emtools_pd():
    """EM Tools' «Prepare for a use: diagnosis» module (MICRO-PREPARA-DIAGNOSI).
    When this Blender's s3dgraphy predates the profiles of use, the bridge's
    ``s3dgraphy.resources`` folder joins that package's path: the same table
    and the same diagnosis as EMStudio's."""
    em_name, _ = module_with(None, ".graph_origins")
    if not em_name:
        raise RuntimeError("EM Tools is not loaded in this Blender")
    pkg = em_name.rsplit(".graph_origins", 1)[0]
    extra = A.get("s3dgraphy_resources") or ""
    mine = os.path.join(extra, "use_profiles.py") if extra else ""
    try:
        import s3dgraphy.resources.use_profiles as UP
        # MICRO-PREPARA-RITOCCHI: a bundled table OLDER than the bridge's (no
        # ALIASES: the profiles before E.D.'s names) is replaced by the
        # bridge's, so both speak of the same profiles
        if mine and os.path.isfile(mine) and not hasattr(UP, "ALIASES"):
            import importlib.util
            spec = importlib.util.spec_from_file_location("s3dgraphy.resources.use_profiles", mine)
            UP = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(UP)
            sys.modules["s3dgraphy.resources.use_profiles"] = UP
            import s3dgraphy.resources as R
            R.use_profiles = UP
    except ImportError:
        if mine and os.path.isfile(mine):
            import s3dgraphy.resources as R
            R.__path__.append(extra)
    return importlib.import_module(pkg + ".sync_manager.prepare_diagnosis")


def picked():
    """The objects to measure: ``objects`` by name, else the meshes of the RM
    container ``container`` (its label), else every mesh with faces."""
    names = A.get("objects") or []
    if not names and A.get("container"):
        for c in getattr(bpy.context.scene, "rm_containers", ()):
            if (c.label or c.doc_name) == A["container"]:
                names = [e.name for e in c.mesh_names]
    if names:
        objs = [bpy.data.objects.get(n) for n in names]
        return [o for o in objs if o is not None and o.type == "MESH"]
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.data is not None and len(o.data.polygons)]


def containers():
    return [{"label": c.label or c.doc_name, "objects": [e.name for e in c.mesh_names]}
            for c in getattr(bpy.context.scene, "rm_containers", ())]


def measure():
    pd = emtools_pd()
    objs = picked()
    say("PROGRESS", {"stage": "measure", "done": 0, "total": 1})
    t = time.time()
    m = pd.measure_objects(objs)
    say("PROGRESS", {"stage": "measure", "done": 1, "total": 1})
    return {"blend": bpy.data.filepath, "objects": m["objects"], "textures": m["textures"],
            "containers": containers(), "measure_seconds": round(time.time() - t, 2),
            "names": [o.name for o in objs]}


def apply_use():
    """EM Tools' «Apply the ticks» on the objects of this .blend (never saved):
    the version in versions/ beside it, stamped. The graph is EMStudio's: it is
    not loaded here."""
    pd = emtools_pd()
    objs = picked()
    if not objs:
        raise RuntimeError("no object to prepare")
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    say("PROGRESS", {"stage": "prepare", "done": 0, "total": 1})
    kw = dict(profile=A.get("profile") or "webxr", scope="SELECTED",
              model=A.get("model") or "", level=A.get("level") or "lod0",
              replace=bool(A.get("replace")),
              checked_ids=",".join(A.get("checked") or []) or "none")
    # MICRO-PREPARA-RITOCCHI: the parameters changed row by row (target
    # triangles, texture side, format), when this EM Tools takes them
    names = {p.identifier for p in bpy.ops.em.prepare_diagnose.get_rna_type().properties}
    if "params_json" in names and A.get("params"):
        kw["params_json"] = json.dumps(A["params"])
    r = bpy.ops.em.prepare_diagnose(**kw)
    if r != {"FINISHED"}:
        raise RuntimeError("Prepare for a use answered %s" % sorted(r))
    out = dict(pd.LAST.get("applied") or {})
    say("PROGRESS", {"stage": "prepare", "done": 1, "total": 1})
    return {k: v for k, v in out.items() if isinstance(v, (str, int, float, bool, list, dict, type(None)))}


try:
    t0 = time.time()
    op = A.get("op") or "probe"
    res = {"probe": probe, "objects": objects, "lod_set": lod_set, "atlas": atlas, "prepare": prepare,
           "measure": measure, "apply_use": apply_use}[op]()
    say("RESULT", {"ok": True, "op": op, "seconds": round(time.time() - t0, 2), "result": res})
except Exception as exc:
    traceback.print_exc()
    say("RESULT", {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)})
'''


def runner_path() -> str:
    """The runner written beside the add-ons (rewritten when it changed)."""
    p = O.addons_dir() / "blender" / "emstudio_runner.py"
    try:
        if p.read_text("utf-8") == RUNNER:
            return str(p)
    except OSError:
        pass
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(RUNNER, "utf-8")
    return str(p)


def command(blender: str, args: dict, blend: str = "") -> list:
    cmd = [blender, "-b"]
    if blend:
        cmd.append(blend)
    return cmd + ["--python-exit-code", "1", "--python", runner_path(), "--", json.dumps(args)]


def parse_line(ln: str):
    """``EMSTUDIO-RESULT {…}`` / ``EMSTUDIO-PROGRESS {…}`` / ``3DSC-PROGRESS {…}``
    → (kind, dict), else None."""
    for tag in ("EMSTUDIO-RESULT ", "EMSTUDIO-PROGRESS ", "3DSC-PROGRESS ", "3DSC-RESULT "):
        if ln.startswith(tag):
            try:
                return tag.strip(), json.loads(ln[len(tag):])
            except ValueError:
                return None
    return None


# ── asked ────────────────────────────────────────────────────────────────────

_PROBES: dict = {}
_PLOCK = threading.Lock()


def _stamp_of(path: str) -> float:
    try:
        return os.path.getmtime(os.path.realpath(path))
    except OSError:
        return 0.0


def last_probe(path: str):
    """The last probe of this Blender, while the program has not changed."""
    with _PLOCK:
        p = _PROBES.get(path)
    if p and p.get("mtime") == _stamp_of(path):
        return p
    return None


def probe(blender: str, job=None, timeout: float = 180) -> dict:
    """Ask Blender what it has. → ``{ok, path, seconds, peak_mb, …probe}``."""
    cmd = command(blender, {"op": "probe"})
    result: dict = {}

    def on_line(ln):
        got = parse_line(ln)
        if got and got[0] == "EMSTUDIO-RESULT":
            result.update(got[1])
        elif job is not None and ln.strip() and not ln.startswith("EMSTUDIO"):
            job.say(ln[:300], echo=False)
    run = O.run_tool(cmd, on_line, (lambda: job is not None and job.cancel.is_set()), stall_s=timeout, timeout=timeout)
    out = {"path": blender, "mtime": _stamp_of(blender), "seconds": run["seconds"], "peak_mb": run["peak_mb"],
           "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    if result.get("ok"):
        out.update({"ok": True, **result["result"]})
    else:
        out.update({"ok": False, "error": result.get("error") or "\n".join(run["tail"][-6:]) or f"exit {run['returncode']}"})
    with _PLOCK:
        _PROBES[blender] = out
    return out


def state() -> dict:
    """What GET /blender answers: the Blenders found, the one used, its last probe."""
    cur = current()
    return {"ok": True, "found": candidates(), "chosen": chosen(), "current": cur,
            "env": bool(os.environ.get("EM_BLENDER")), "probe": last_probe(cur) if cur else None}


# ── used ─────────────────────────────────────────────────────────────────────

def memory_mb(op: str, bytes_in: int, texture_bytes: int = 0) -> int:
    """The memory a Blender job asks, said before it starts. Measured on Templu
    Mare's PODIO (47 MB obj + 2048 texture): EM Tools' «Prepare» 2.2 GB, 3DSC's
    re-bake per tile 2.4–2.5 GB; Blender itself about 400 MB. Generous: it errs
    above, never below."""
    mb_in = max(0, bytes_in) / (1024 * 1024)
    tex = max(0, texture_bytes) / (1024 * 1024)
    if op == "objects":
        return 600
    base = 700 + 40 * mb_in + 6 * tex
    return int(base * (1.2 if op == "lod_set" else 1.0))


def run_op(job, blender: str, args: dict, blend: str = "", timeout: float = 4 * 3600) -> dict:
    """One Blender operation as the job's process: progress from the runner's and
    3DSC's lines, cancel ends Blender, a Blender silent for 20 minutes is killed.
    → the runner's result (raises on failure)."""
    cmd = command(blender, args, blend)
    job.say(" ".join([os.path.basename(cmd[0])] + [c if len(c) < 200 else c[:200] + "…" for c in cmd[1:]]))
    result: dict = {}

    def on_line(ln):
        got = parse_line(ln)
        if not got:
            if ln.strip():
                job.say(ln[:300], echo=False)
            return
        kind, obj = got
        if kind == "EMSTUDIO-RESULT":
            result.update(obj)
        elif kind == "3DSC-RESULT":
            result.setdefault("dsc", obj)
        else:
            total = obj.get("total") or 0
            if total:
                job.progress = max(job.progress, min(0.99, float(obj.get("done") or 0) / float(total)))
            elif obj.get("percent") is not None:
                job.progress = max(job.progress, min(0.99, float(obj["percent"]) / 100))
            if obj.get("stage"):
                job.stage = str(obj["stage"])
    run = O.run_tool(cmd, on_line, job.cancel.is_set, stall_s=float(os.environ.get("EM_BLENDER_STALL_S") or 1200),
                     timeout=timeout)
    job.say(f"Blender: {run['seconds']} s, peak {run['peak_mb']} MB")
    if run["stalled"]:
        raise RuntimeError("Blender wrote nothing for too long and was stopped")
    if not result.get("ok"):
        raise RuntimeError(result.get("error") or "\n".join(run["tail"][-6:]) or f"Blender exited {run['returncode']}")
    res = result.get("result")
    return {"result": res, "seconds": run["seconds"], "peak_mb": run["peak_mb"]}


def _sha256(path: str) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def outputs_of(res) -> list:
    """The glb files a 3DSC result names (``outputs`` or ``levels``), each with
    the facts EMStudio reads itself (faces, textures, sha256, bytes)."""
    items = []
    if isinstance(res, dict):
        items = res.get("outputs") or res.get("levels") or ([res] if res.get("path") else [])
    elif isinstance(res, list):
        items = res
    out = []
    for it in items:
        p = str((it or {}).get("path") or "")
        if not p or not os.path.isfile(p):
            continue
        out.append({**it, "path": p, "bytes": os.path.getsize(p), "sha256": "sha256:" + _sha256(p),
                    "facts": O.glb_facts(p)})
    return out
