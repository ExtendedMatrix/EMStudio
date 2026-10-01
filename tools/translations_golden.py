"""The golden of the translations, written BY s3Dgraphy (dev26).

    python tools/translations_golden.py [path/to/site-packages-or-s3Dgraphy]
        # → frontend/testdata/translations-golden.json

`frontend/scripts/check-translations.mjs` runs the SAME scenario with
`frontend/src/translation.ts` + `ai-validation.ts` and compares, step by step,
what the two write (ids, `data`, edges) and answer (`to_review`, `text`, the
refusals). s3Dgraphy is the truth: when it changes, run this again and the check
says what the mirror must follow. The scenario is Vitruvius, D.04 of TempluMare:
the Latin original, an Italian translation from a printed edition, an English
one made with AI, its verification, and the original changed afterwards.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) > 1:
    arg = sys.argv[1]
    sys.path.insert(0, os.path.join(arg, "src") if os.path.isdir(os.path.join(arg, "src")) else arg)

from s3dgraphy import api  # noqa: E402
from s3dgraphy.translation import TranslationError, text_digest, _NS  # noqa: E402

LATIN = ("Diastyli autem haec erit compositio, cum trium columnarum crassitudinem "
         "intercolumnio interponere possumus.")
ITALIAN = ("Questa sarà invece la composizione del diastilo: quando possiamo interporre "
           "nell'intercolumnio lo spessore di tre colonne.")
ENGLISH = ("The diastyle will be composed in this way: when we can put the thickness of "
           "three columns into the intercolumniation.")
ORCID = "0000-0002-1825-0097"
AT = "2026-10-01T22:00:00Z"

DOC = {"graphs": {"g1": {"graph_id": "g1", "name": "Vitruvio", "data": {}, "nodes": [
    {"id": "d04", "node_type": "document", "name": "D.04", "description": LATIN, "data": {"lang": "la"}},
    {"id": "x0401", "node_type": "extractor", "name": "D.04.01",
     "description": "Intercolumnium diastil or areostil can result in a wooden lintel", "data": {}},
    {"id": "ed", "node_type": "document", "name": "D.21",
     "description": "Vitruvio, De architectura, a cura di P. Gros (Einaudi 1997)", "data": {}},
    {"id": "ed_au", "node_type": "author", "name": "Emanuel Demetrescu", "description": "",
     "data": {"orcid": ORCID}},
    {"id": "ai1", "node_type": "author_ai", "name": "anthropic · claude", "description": "",
     "data": {"provider": "anthropic", "model": "claude"}},
], "edges": []}}}

out = {"ns": str(_NS), "steps": []}


def step(name, value):
    out["steps"].append({"step": name, "value": value})


def graph():
    container, _ = api.load_container(json.loads(json.dumps(DOC)))
    return container.graphs["g1"]


def tnode(g, tid):
    n = g.find_node_by_id(tid)
    data = {k: v for k, v in (n.data or {}).items() if k not in ("created_by", "created_at")}
    edges = sorted([e.edge_source, e.edge_target, e.edge_type] for e in g.edges
                   if tid in (e.edge_source, e.edge_target))
    return {"id": n.node_id, "node_type": n.node_type, "name": n.name, "data": data, "edges": edges}


def review(g):
    return sorted([{k: r.get(k) for k in ("node", "reasons", "of", "field", "lang", "method")}
                   for r in api.to_review(g)], key=lambda r: r["node"])


def text(g, node, lang):
    r = api.text(g, node, "description", lang)
    return {"text": r["text"], "lang": r["lang"], "original": r["original"],
            "translation": r["translation"], "reasons": r["reasons"]}


def refused(fn):
    try:
        fn()
    except TranslationError:
        return "refused"
    return "accepted"


step("digest of the same text composed two ways",
     [text_digest("café"), text_digest("café")])
step("digest of the Latin", text_digest(LATIN))

g = graph()
it = api.add_translation(g, "d04", "description", "it", ITALIAN, by="ed_au",
                         method="edition", edition="ed", at=AT)
step("italian from the edition", tnode(g, it.node_id))
again = api.add_translation(g, "d04", "description", "it", ITALIAN, by="ed_au",
                            method="edition", edition="ed", at=AT)
step("the same translation twice is one node", [again.node_id == it.node_id,
                                                  len([n for n in g.nodes if n.node_type == "translation"])])
en = api.add_translation(g, "d04", "description", "en", ENGLISH, by="ed_au",
                         method="ai", ai="ai1", model="claude", at=AT)
step("english with AI", tnode(g, en.node_id))
step("to review after the two", review(g))
step("text in en (AI, waiting)", text(g, "d04", "en"))
step("text in it", text(g, "d04", "it"))
step("text in la (the original)", text(g, "d04", "la"))
step("text in fr (none: the original)", text(g, "d04", "fr"))

api.verify(g, en.node_id, "ed_au", at=AT)
n = g.find_node_by_id(en.node_id)
step("english verified", {"validated_by": n.data.get("validated_by"), "validated_at": n.data.get("validated_at")})
step("to review after the verification", review(g))
try:
    api.verify(g, it.node_id, "ed_au", at=AT)
    step("verify what waits for nothing", "accepted")
except Exception:                                  # noqa: BLE001
    step("verify what waits for nothing", "refused")

rev = api.add_translation(g, "x0401", "description", "it",
                          "L'intercolumnio diastilo o areostilo può dare un architrave di legno",
                          by="ed_au", review=True, from_lang="en", at=AT)
step("a manual translation asking for a review", tnode(g, rev.node_id))
step("to review with the review asked", review(g))

d04 = g.find_node_by_id("d04")
d04.description = LATIN + " Eustyli autem est explicanda ratio."
step("to review after the original changed", review(g))
step("text in it after the change", text(g, "d04", "it"))

g2 = graph()
step("refusals", {
    "name": refused(lambda: api.add_translation(g2, "d04", "name", "it", "x", by="ed_au")),
    "same language": refused(lambda: api.add_translation(g2, "d04", "description", "la", "x", by="ed_au")),
    "no source language": refused(lambda: api.add_translation(g2, "x0401", "description", "it", "x", by="ed_au")),
    "empty": refused(lambda: api.add_translation(g2, "d04", "description", "it", "  ", by="ed_au")),
    "bad tag": refused(lambda: api.add_translation(g2, "d04", "description", "italiano", "x", by="ed_au")),
    "edition not a document": refused(lambda: api.add_translation(
        g2, "d04", "description", "it", "x", by="ed_au", method="edition", edition="ed_au")),
    "ai without its model": refused(lambda: api.add_translation(
        g2, "d04", "description", "en", "x", by="ed_au", method="ai")),
    "unknown author": refused(lambda: api.add_translation(g2, "d04", "description", "it", "x", by="nobody")),
})

dest = os.path.join(HERE, "..", "frontend", "testdata", "translations-golden.json")
with open(dest, "w", encoding="utf-8") as handle:
    json.dump(out, handle, ensure_ascii=False, indent=1)
    handle.write("\n")
import s3dgraphy  # noqa: E402
print(f"wrote {os.path.relpath(dest)}: {len(out['steps'])} steps (s3dgraphy {s3dgraphy.__version__})")
