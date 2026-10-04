"""The golden of ONE vocabulary of operations (V1), written BY s3Dgraphy.

    python tools/ops_golden.py [path/to/s3Dgraphy]   # → frontend/testdata/ops-golden.json

The cases are s3Dgraphy's (`tests/data/op_vocabulary_cases.json`); each gets
the library's answer — `crdt.ops_for_local_change`, or the sentence it raised —
and `crdt.validate_op`'s verdict on a few shapes. `frontend/scripts/check-ops.mjs`
asks `hub.ts` (`opsForLocalChange`, `validateOp`) the same and compares.
s3Dgraphy is the truth: when it changes, run this again.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
S3D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "s3Dgraphy")
sys.path.insert(0, os.path.join(S3D, "src"))

from s3dgraphy import crdt  # noqa: E402

cases = json.load(open(os.path.join(S3D, "tests", "data", "op_vocabulary_cases.json"),
                       encoding="utf-8"))["cases"]
out = {"_note": "written by tools/ops_golden.py from s3Dgraphy; do not edit",
       "cases": [], "validate": []}
for c in cases:
    row = {"name": c["name"], "local": c["local"], "study_language": c.get("study_language")}
    try:
        row["ops"] = crdt.ops_for_local_change(c["local"], study_language=c.get("study_language"))
    except ValueError as exc:
        row["error"] = str(exc)
    out["cases"].append(row)
for op in ({"op": "update_node", "node_id": "a", "patch": {}},
           {"op": "update_field", "node_id": "a", "field": "data.x"},
           {"op": "update_field", "node_id": "a", "field": "node_type", "value": 1},
           {"op": "remove_edge"},
           {"op": "remove_edge", "source": "a", "target": "b", "edge_type": "is_after"},
           {"op": "add_node", "node": {"id": "x"}},
           {"op": "add_edge", "source": "a"}):
    out["validate"].append({"op": op, "reason": crdt.validate_op(op)})
out["not_news"] = list(crdt.NOT_NEWS)
dst = os.path.join(HERE, "..", "frontend", "testdata", "ops-golden.json")
with open(dst, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {os.path.relpath(dst)}: {len(out['cases'])} cases, {len(out['validate'])} shapes")
