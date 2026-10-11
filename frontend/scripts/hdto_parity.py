"""s3dgraphy's side of the HDT-O parity (MICRO studio-luogo, part A).

    python -I scripts/hdto_parity.py < cases.json > graphs.json

Reads a list of cases ``[{graph_id, name, pre_place?, declare: {...}}]`` and,
for each, makes a fresh ``Graph``, optionally gives it the site place the
pyArchInit projector would have made (``pre_place``: ``make_site_place``),
and a saggio in it (``pre_saggio``: a LocationNodeGroup kind ``study``,
``is_in_location`` the site — the projector of 11 Oct 2026; the graph before
the declaration is returned as ``pre_graph``, for EMStudio to start from),
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
from s3dgraphy.nodes.group_node import LocationNodeGroup


def main() -> None:
    cases = json.load(sys.stdin)
    out = []
    for case in cases:
        g = Graph(graph_id=case["graph_id"], name=case.get("name") or case["graph_id"])
        if case.get("pre_place"):
            g.add_node(make_site_place(case["pre_place"]))
        pre = None
        if case.get("pre_saggio"):
            sid, name = case["pre_saggio"]["id"], case["pre_saggio"]["name"]
            saggio = LocationNodeGroup(sid, name, kind="study")
            saggio.attributes.update({"group_kind": "saggio", "name": name,
                                      "sito": case["pre_place"]})
            g.add_node(saggio)
            site = site_place_id(case["pre_place"])
            g.add_edge(f"{sid}__is_in_location__{site}", sid, site, "is_in_location")
            pre = build_emjson(g)["graph"]
        api.declare_hdto(g, **case["declare"])
        out.append({
            "pre_graph": pre,
            "graph": build_emjson(g)["graph"],
            "site_place_ids": {n: site_place_id(n) for n in case.get("ask_ids", [])},
        })
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
