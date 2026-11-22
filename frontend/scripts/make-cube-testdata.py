"""MICRO-MF04 · the synthetic testdata of check-landscape-cube.mjs, written in
testdata/landscape-cube/: a building (cube-building.em.json: a temple of the
II century with a room, a ruin and a restoration that read its foundation F1,
which crosses the three planes), a landscape of six sites (cube-landscape.em.json,
the horizons H0–H7) citing a temple (cube-temple.em.json) BOUND to S03, and the
proxies of both (proxies/<unit>.glb: boxes, so the footprints are known). The
graphs are s3Dgraphy's test fixtures (tests/test_functional_cube_mf04.py,
tests/test_functional_zoom_mf03.py). Run with s3Dgraphy's venv, from frontend/:

    ../../s3Dgraphy/.venv/bin/python scripts/make-cube-testdata.py
"""
import os
import pathlib
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "../../../s3Dgraphy"))
from tests.test_functional_cube_mf04 import _building, _with_proxy
from tests.test_functional_zoom_mf03 import _landscape, _temple
from s3dgraphy.container import Container, save_container_file
from s3dgraphy import periodization as P
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "../testdata/landscape-cube"))
out.mkdir(parents=True, exist_ok=True)
b = _building(out)
save_container_file(Container(graphs={"B": b}, active_graph_id="B", header={"title": "Tempio (sintetico, cubo)"}),
                    str(out / "cube-building.em.json"))
temple = _temple(True)
for uid, x in (("SU1", 0.0), ("SU2", 10.0), ("SU20", 20.0)):
    _with_proxy(temple, uid, out, x, 0.0, 3.0, 3.0)
save_container_file(Container(graphs={"TEMPLE-GRAPH": temple}, active_graph_id="TEMPLE-GRAPH",
                              header={"title": "Tempio (sintetico)"}), str(out / "cube-temple.em.json"))
land, sites = _landscape()
pg = P.new_periodizations()
P.add_periodization(pg, "Orizzonti (sintetici)", node_id="PER", active=True)
for i, (hid, name, a, z) in enumerate([("H0", "H0 · prima della colonia", -200, 105), ("H1", "H1 · Traiano", 106, 116),
        ("H2", "H2 · Adriano e Antonini", 117, 179), ("H3", "H3 · Severi e III sec.", 180, 299),
        ("H4", "H4 · post-romano", 300, 1199), ("H56", "H5–H6 · medievale e moderno", 1200, 1899),
        ("H7", "H7 · contemporaneo", 1900, 2026)]):
    P.add_horizon(pg, "PER", name, a, z, node_id=hid, order=i)
c = Container(graphs={"LAND": land}, active_graph_id="LAND",
              header={"title": "Città (sintetica, cubo)", "kind": "landscape",
                      "composition": [{"id": "TEMPLE-GRAPH", "path": "cube-temple.em.json", "title": "Tempio (sintetico)",
                                       "site": sites["S03"]}]})
c.periodizations = pg
save_container_file(c, str(out / "cube-landscape.em.json"))
print("ok", sorted(p.name for p in (out / "proxies").iterdir()))
