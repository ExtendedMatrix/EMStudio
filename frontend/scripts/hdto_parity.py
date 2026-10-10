"""s3dgraphy's side of the HDT-O parity (MICRO studio-luogo, part A).

    python -I scripts/hdto_parity.py < cases.json > graphs.json

Reads a list of cases ``[{graph_id, name, pre_place?, declare: {...}}]`` and,
for each, makes a fresh ``Graph``, optionally gives it the site place the
pyArchInit projector would have made (``pre_place``: ``make_site_place``),
calls ``api.declare_hdto(graph, **declare)`` and writes the em.json graph
(``build_emjson``) — what ``check-studio-luogo.mjs`` compares with what
``DocumentStore.applyHdto`` writes for the same input. The s3dgraphy it
imports is whatever ``PYTHONPATH`` points at: the check points it at the local
``../s3Dgraphy/src`` tree, the one the vendored datamodel was synced from.
"""

import json
import sys

from s3dgraphy import api
from s3dgraphy.exporter.emjson_exporter import build_emjson
from s3dgraphy.graph import Graph
from s3dgraphy.hdto import make_site_place, site_place_id


def main() -> None:
    cases = json.load(sys.stdin)
    out = []
    for case in cases:
        g = Graph(graph_id=case["graph_id"], name=case.get("name") or case["graph_id"])
        if case.get("pre_place"):
            g.add_node(make_site_place(case["pre_place"]))
        api.declare_hdto(g, **case["declare"])
        out.append({
            "graph": build_emjson(g)["graph"],
            "site_place_ids": {n: site_place_id(n) for n in case.get("ask_ids", [])},
        })
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
