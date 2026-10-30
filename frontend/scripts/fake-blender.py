#!/usr/bin/env python3
# MICRO-OTTIMIZZA-3 · a FAKE Blender for the checks (check-blender-bridge, the
# suite's bench): `-b [file.blend] --python-exit-code 1 --python RUNNER -- JSON`.
# It checks that EMStudio's runner was written, then answers as the runner
# would. FAKE_PY says its Python (3.13 by default: EM Tools' cp311 wheels do
# not load, as in a Blender 5.2 on 27 Oct 2026); the source's NAME says how a
# job behaves: «slow» → 30 s of progress lines; «fail» → an error.
import json, os, sys, time
a = sys.argv[1:]
runner = a[a.index("--python") + 1]
assert os.path.isfile(runner) and "EMSTUDIO-RESULT" in open(runner).read(), "runner not written"
A = json.loads(a[a.index("--") + 1])
blend = next((x for x in a if x.endswith(".blend")), "")
op = A["op"]
log = os.environ.get("FAKE_LOG")
if log: open(log, "a").write(json.dumps({"op": op, "blend": blend, "args": A}) + "\n")
def say(k, o): print("EMSTUDIO-%s %s" % (k, json.dumps(o)), flush=True)
def glb(path, faces):
    js = json.dumps({"asset": {"version": "2.0"}, "accessors": [{"count": 4}, {"count": faces * 3}],
                     "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}]}).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    open(path, "wb").write(b"glTF" + (2).to_bytes(4, "little") + (20 + len(js)).to_bytes(4, "little")
                           + len(js).to_bytes(4, "little") + b"JSON" + js)
py = os.environ.get("FAKE_PY", "3.13.1")
print("Blender 5.2.0 LTS (fake)", flush=True)
src = os.path.basename(A.get("source") or A.get("object") or "")
if "fail" in src:
    say("RESULT", {"ok": False, "error": "RuntimeError: the fake was asked to fail"}); sys.exit(1)
if op == "probe":
    em = {"loaded": py.startswith("3.11"), "package": "bl_ext.x.em_tools" if py.startswith("3.11") else None,
          "prepare_for_use": py.startswith("3.11"), "version": "1.6.0-dev.33"}
    if not em["loaded"]:
        em["why"] = {"code": "wheels", "wheels": "3.11", "python": py[:4], "folder": "/x/EM-blender-tools", "version": "1.6.0-dev.32"}
    say("RESULT", {"ok": True, "op": op, "seconds": 0.1, "result": {"blender": "5.2.0 LTS", "version": [5, 2, 0],
        "python": py, "emtools": em, "dsc": {"loaded": True, "package": "bl_ext.x.dsc", "version": "1.7.0-dev.17",
        "headless": "bl_ext.x.dsc.headless", "rebake_atlas": True, "stamps": em["loaded"]}}})
elif op == "objects":
    say("RESULT", {"ok": True, "op": op, "result": {"blend": blend, "objects": [
        {"name": "ME_PODIO", "faces": 1200, "vertices": 700, "materials": 1, "collection": "RB"},
        {"name": "EMPTY_MESH", "faces": 0, "vertices": 0, "materials": 0, "collection": ""}]}})
elif op == "lod_set":
    n = int(A.get("levels") or 3)
    outs = []
    for i in range(1, n + 1):
        if "slow" in src:
            for k in range(300):
                print("3DSC-PROGRESS " + json.dumps({"stage": "bake", "done": k, "total": 300}), flush=True); time.sleep(0.1)
        print("3DSC-PROGRESS " + json.dumps({"stage": "LOD%d" % i, "done": i - 1, "total": n}), flush=True)
        p = os.path.join(A["out_dir"], "LOD%d.glb" % i)
        glb(p, 1000 // (2 ** i))
        outs.append({"path": p, "level": "LOD%d" % i, "triangles": 1000 // (2 ** i), "textures": 2 ** (n - i), "texture_px": 2048})
    print("3DSC-RESULT " + json.dumps({"outputs": outs}), flush=True)
    say("RESULT", {"ok": True, "op": op, "result": {"outputs": outs}})
elif op == "atlas":
    glb(A["out_path"], 500)
    say("RESULT", {"ok": True, "op": op, "result": {"path": A["out_path"], "level": "", "textures": 1, "texture_px": A.get("size")}})
elif op == "prepare":
    em = json.load(open(A["em_json"]))
    assert isinstance(em, dict) and em.get("graph"), "the copy of the open graph"
    out = os.path.join(os.path.dirname(blend), "em_cache", "ME_PODIO@lod3-realtime.glb")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    glb(out, 300)
    say("RESULT", {"ok": True, "op": op, "result": {"path": out, "level": "lod3", "use": A.get("use"), "version_id": "v1"}})

# MICRO-PREPARA-DIAGNOSI · EM Tools measures a .blend; EM Tools applies the ticks
elif op == "measure":
    objs = [{"name": "Col_%d" % i, "triangles": 53364, "vertices": 27000, "materials": 1,
             "mesh_id": "Col_%d" % i, "geometry_key": "b:col", "textures": ["T_col"]} for i in range(6)]
    objs.append({"name": "Wall", "triangles": 20000, "vertices": 11000, "materials": 2, "mesh_id": "Wall",
                 "geometry_key": "b:wall", "textures": ["T_wall"]})
    if A.get("container") == "Colonnato":
        objs = objs[:6]
    say("PROGRESS", {"stage": "measure", "done": 1, "total": 1})
    say("RESULT", {"ok": True, "op": op, "result": {"blend": blend, "objects": objs, "names": [o["name"] for o in objs],
        "textures": {"T_col": {"width": 4096, "height": 4096, "bytes": 6000000, "format": "jpeg"},
                     "T_wall": {"width": 2048, "height": 2048, "bytes": 9000000, "format": "png"}},
        "containers": [{"label": "Colonnato", "objects": ["Col_%d" % i for i in range(6)]}]}})
elif op == "apply_use":
    assert A.get("s3dgraphy_resources"), "the bridge says where its s3dgraphy.resources is"
    dest = {"web": "web", "heriverse": "aton-heriverse", "realtime": "realtime", "mobile_ar": "mobile", "archive": "archive",
            # MICRO-PREPARA-RITOCCHI · E.D.'s names
            "webxr": "aton-heriverse", "desktop_realtime": "realtime", "mobile_webxr": "mobile", "preview": "preview",
            "render_offline": "render"}[A["profile"]]
    folder = os.path.join(os.path.dirname(blend), "versions")
    os.makedirs(folder, exist_ok=True)
    out = os.path.join(folder, "%s@%s-%s.glb" % (A["model"], A["level"], dest))
    if os.path.exists(out) and not A.get("replace"):
        say("RESULT", {"ok": False, "error": "already there"}); sys.exit(1)
    glb(out, 120)
    say("RESULT", {"ok": True, "op": op, "result": {"entry": out, "bytes": os.path.getsize(out), "rows": A.get("checked"),
        "params": A.get("params") or {},
        "measured": {"triangles": 120, "triangles_stored": 120}, "instanced": 5, "decimated": 1, "resized": 1, "warnings": []}})
