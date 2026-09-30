"""The golden of the resource and its files, written BY s3Dgraphy.

    python tools/resources_golden.py [path/to/s3Dgraphy]   # → frontend/testdata/resources-golden.json

`frontend/scripts/check-resources.mjs` runs the SAME scenario with
`frontend/src/resources.ts` and compares, step by step, what the two write
(nodes, edges, ids, key order of `data`) and answer. s3Dgraphy is the truth:
when it changes, run this again and the check says what the mirror must follow.
The scenario lives in two places on purpose — here and in the check — and each
step is named, so a diff points at the step.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
S3D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "s3Dgraphy")
sys.path.insert(0, os.path.join(S3D, "src"))

from s3dgraphy import api  # noqa: E402
from s3dgraphy.graph import Graph  # noqa: E402

WEB = {"file_set", "file", "directory", "archive"}


def snap(g):
    em = api.graph_to_emjson(g)["graph"]
    return {"nodes": [n for n in em["nodes"] if n["node_type"] != "geo_position"],
            "edges": em["edges"]}


def files(g, rid):
    return [{"role": f["role"], "path": f["path"], "implicit": f["implicit"],
             "id": f["node"].node_id, "data": dict(f["node"].data)}
            for f in api.resource_files(g, rid)]


out = {"steps": []}


def step(name, value):
    out["steps"].append({"step": name, "value": value})


g = Graph("g1")
api.add_resource(g, resource_id="r1", name="foto", kind="image",
                 files=[{"path": "foto.jpg", "checksum": "sha256:aa", "size_bytes": 10,
                         "media_type": "image/jpeg"}])
step("one file is implicit", files(g, "r1"))
api.add_resource(g, resource_id="r3", name="OB_PODIO_LOD1", kind="3d_model",
                 packaging="file_set", tier="distribution",
                 files=[{"path": "OB_PODIO_LOD1.obj", "checksum": "sha256:o1", "size_bytes": 100,
                         "media_type": "model/obj"},
                        {"path": "OB_PODIO_LOD1.mtl", "checksum": "sha256:m1", "size_bytes": 5},
                        {"path": "textures/T_OB_PODIO_LOD1.jpg", "checksum": "sha256:t1",
                         "size_bytes": 50, "media_type": "image/jpeg"}])
step("three files", files(g, "r3"))
api.add_resource(g, resource_id="rb", name="OB_PODIO_LOD1 (blend)", kind="3d_model",
                 packaging="datablock", tier="master",
                 files=[{"blend_file": "RB/TempluMare 2021.blend", "datablock": "OB_PODIO_LOD1 è"}])
step("datablock", files(g, "rb"))
api.add_resource(g, resource_id="r4", name="shared", kind="3d_model",
                 files=[{"path": "a.obj", "checksum": "sha256:a"},
                        {"path": "LOD1/textures/T_OB_PODIO_LOD1.jpg", "checksum": "sha256:t1"}],
                 derived_from=["rb"])
step("a shared file is one node", files(g, "r4"))
api.add_resource(g, resource_id="r5", name="nuda", kind="", files=[{"path": "x/nuda.obj"}],
                 primitives={"faces": 3}, preferred=True, scope="own-study", residency="resident",
                 data={"author": "E.D."})
step("kind read from the url", snap(g)["nodes"][-1])
step("add_file materializes", api.add_file(g, "r1", path="foto_b.jpg", checksum="sha256:ab"))
step("after add_file", files(g, "r1"))
f_ab = [f for f in api.resource_files(g, "r1") if f["path"] == "foto_b.jpg"][0]["node"].node_id
step("remove_file", api.remove_file(g, "r1", f_ab))
from s3dgraphy.nodes.representation_node import RepresentationModelNode  # noqa: E402
g.add_node(RepresentationModelNode("rm1", name="RM PODIO"))
g.add_edge("rm1__has_linked_resource__r3", "rm1", "r3", "has_linked_resource")
tex = [f for f in api.resource_files(g, "r3") if f["path"].endswith(".jpg")][0]["node"].node_id
step("replace_file", api.replace_file(g, "r3", tex, checksum="sha256:t2", size_bytes=51))
step("replace twice is the same", api.replace_file(g, "r3", tex, checksum="sha256:t2",
                                                   size_bytes=51)["new_resource_id"])
api.add_resource(g, resource_id="r6", name="padre")
step("a placeholder keeps the constructor's kind", snap(g)["nodes"][-1])
api.add_resource(g, resource_id="r7", name="timbrata", kind="3d_model",
                 files=[{"path": "t.glb", "checksum": "sha256:g1", "stamp": {"digest": "sha256:g1"}}],
                 data={"stamp_receipt": {"id": "s1"}, "created_by": "E.D."})
step("a stamped file has an identity", files(g, "r7"))
t7 = api.resource_files(g, "r7")[0]["node"].node_id
r7b = api.replace_file(g, "r7", t7, checksum="sha256:g2")["new_resource_id"]
step("a revision inherits no stamp", [n for n in snap(g)["nodes"] if n["id"] == r7b][0])
step("revisions", api.revisions_of(g, "r3"))
step("current", api.current_revision(g, "r3"))
step("pick web from r4", api.pick_representation(g, "r4", WEB))
step("pick blender from r4", api.pick_representation(g, "r4", {"datablock"}))
step("nothing opens", api.pick_representation(g, "rb", {"archive"}))
step("representations of rb", api.representations_of(g, "rb"))
step("graph", snap(g))

target = os.path.join(HERE, "..", "frontend", "testdata", "resources-golden.json")
with open(target, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(out, indent=1, ensure_ascii=False, default=str) + "\n")
print(f"{len(out['steps'])} steps → {os.path.relpath(target)}")
