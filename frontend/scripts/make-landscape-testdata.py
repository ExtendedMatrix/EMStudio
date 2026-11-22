"""MICRO-MF03 · the synthetic testdata of check-landscape-matrix.mjs: a
landscape of six sites (S01–S05, S10) with its horizons H0–H7, citing a temple
graph that is NOT bound yet (the check binds it from the page). The graphs are
s3Dgraphy's test fixtures (tests/test_functional_zoom_mf03.py). Run with
s3Dgraphy's venv, from frontend/:

    ../../s3Dgraphy/.venv/bin/python scripts/make-landscape-testdata.py
"""
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "../../../s3Dgraphy/tests"))
from test_functional_zoom_mf03 import _landscape, _temple
from s3dgraphy.container import Container, save_container_file
from s3dgraphy import periodization as P
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "../testdata")
land, sites = _landscape()
pg = P.new_periodizations()
per = P.add_periodization(pg, "Orizzonti (sintetici)", node_id="PER", active=True)
for i, (hid, name, a, b) in enumerate([("H0", "H0 · prima della colonia", -200, 105), ("H1", "H1 · Traiano", 106, 116),
        ("H2", "H2 · Adriano e Antonini", 117, 179), ("H3", "H3 · Severi e III sec.", 180, 299),
        ("H4", "H4 · post-romano", 300, 1199), ("H56", "H5–H6 · medievale e moderno", 1200, 1899),
        ("H7", "H7 · contemporaneo", 1900, 2026)]):
    P.add_horizon(pg, "PER", name, a, b, node_id=hid, order=i)
c = Container(graphs={"LAND": land}, active_graph_id="LAND",
              header={"title": "Città (sintetica)", "kind": "landscape",
                      "composition": [{"id": "TEMPLE-GRAPH", "path": "landscape-temple.em.json", "title": "Tempio (sintetico)"}]})
c.periodizations = pg
save_container_file(c, out + "/landscape-matrix.em.json")
t = Container(graphs={"TEMPLE-GRAPH": _temple(True)}, active_graph_id="TEMPLE-GRAPH", header={"title": "Tempio (sintetico)"})
save_container_file(t, out + "/landscape-temple.em.json")
print("ok")
