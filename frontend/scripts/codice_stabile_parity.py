"""s3dgraphy's side of the parity of the giro dell'11 ottobre (2).

    python -I scripts/codice_stabile_parity.py > parity.json

Writes what ``check-codice-stabile.mjs`` compares with EMStudio:

* ``codes``: graph sections (em.json) and, for each, s3dgraphy's
  ``study_code`` and ``proposal_for`` (with the codes ``taken`` by the other
  graphs of a container) — EMStudio's ``studyCode`` and ``proposalFor``;
* ``container``: an em.json with two saggi and a rapporto between them
  (``api.add_link``), and s3dgraphy's ``links_of`` for every unit of both —
  EMStudio's ``linksOf``.

The s3dgraphy imported is whatever ``PYTHONPATH`` / ``sys.path`` points at:
the check points it at the local ``../s3Dgraphy/src``.
"""

import json
import sys

from s3dgraphy import api
from s3dgraphy.container import Container, build_container
from s3dgraphy.exporter.emjson_exporter import build_emjson
from s3dgraphy.graph import Graph
from s3dgraphy.hdto import proposal_for, study_code
from s3dgraphy.importer.emjson_importer import materialize_graph_scope
from s3dgraphy.nodes.stratigraphic_node import StratigraphicUnit


def _study(gid, site=None, date=None, name=None, code=None, graph_name=None):
    g = Graph(gid)
    if graph_name:
        g.name = {"default": graph_name}
    if name is not None or site or date or code:
        study = {"name": name or f"Scavo {gid}"}
        if date:
            study["date"] = date
        if code:
            study["code"] = code
        api.declare_hdto(g, study=study, place={"name": site} if site else None)
    return g


def main() -> None:
    cases = [
        (_study("a", site="Grotta di Tiberio", date="2016"), []),
        (_study("b", site="Volterra", date="2024-05-01"), []),
        (_study("c", site="Sant'Angelo in Vado"), []),
        (_study("d", name="Templu Mare"), []),
        (Graph("e"), []),
        (_study("f", graph_name="Untitled graph"), []),
        (_study("g", graph_name="Tempio di Giunone Moneta"), []),
        (_study("h", site="Grotta di Tiberio", date="2016"), ["GT16", "gt16-2"]),
        (_study("i", site="Grotta di Tiberio", date="2016", code="GT16"), []),
    ]
    em = Graph("j")
    materialize_graph_scope(em, em_id="TM")
    cases.append((em, []))
    codes = []
    for g, taken in cases:
        container = Container(graphs={g.graph_id: g})
        for n, code in enumerate(taken):
            other = Graph(f"taken{n}")
            api.declare_hdto(other, study={"name": "x", "code": code})
            container.graphs[other.graph_id] = other
        codes.append({"graph": build_emjson(g)["graph"], "taken": taken,
                      "study_code": study_code(g),
                      "proposal": proposal_for(g, container)})

    s1, s2 = Graph("Site|S1"), Graph("Site|S2")
    s1.name, s2.name = {"default": "S1"}, {"default": "S2"}
    for g, units in ((s1, ("u1", "u2", "u3")), (s2, ("u4", "u5"))):
        for u in units:
            g.add_node(StratigraphicUnit(u, name=f"US{u[1:]}"))
    s1.add_edge("u1__is_after__u2", "u1", "u2", "is_after")
    container = Container(graphs={"Site|S1": s1, "Site|S2": s2},
                          active_graph_id="Site|S1")
    api.add_link(container, ("Site|S1", "u3"), ("Site|S2", "u4"), "is_after",
                 link_id="rap_u3_u4_is_after")
    links = {f"{gid}|{n.node_id}": api.links_of(container, gid, n.node_id)
             for gid, g in container.graphs.items() for n in g.nodes
             if n.node_type == "US"}
    links.update({gid: api.links_of(container, gid) for gid in container.graphs})
    json.dump({"codes": codes, "container": build_container(container),
               "links": links,
               "linked": {gid: api.linked_graphs(container, gid)
                          for gid in container.graphs}}, sys.stdout)


if __name__ == "__main__":
    main()
