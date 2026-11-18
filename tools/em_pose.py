"""MICRO-PL10-POSA-NELLO-SPAZIO (W7, E.D. 18 Nov 2026) · the bridge's /pose/*
routes: an extractor of a community package placed on a model, and the guided
sequence of a landmark set.

The page clicks; the library writes (SPEC-pacchetto §5): the extractor and its
region are ``s3dgraphy.annotation.extractors`` (W3: ``place_extractor``,
``start_landmark_pose``, ``place_landmark`` — one extractor per point, its
``data.landmark``, the act under one CombinerNode), the values the package
declares are ``s3dgraphy.annotation.combiners`` (W4: ``compute_available``,
the recomputing when a point moves). As /property-source, each route takes
the em.json the page holds and answers a DELTA the page applies as ONE undo
step: nothing here keeps a graph.

The overlay is the document's (``header.profiles`` + the packages installed
here: ``em_extensions.active_overlay``, the same the window «Estensioni» reads).

POST /pose/points    {declared, set, lang}
                     → {ok, set: {id, label, extractor_type, reference}, points: [...]}
                       each point with the label of its concept in the language
                       (the installed vocabulary; else the point's own label; else its id)
POST /pose/extractor {doc, declared, type, on, vertices, name?, author?}
                     → {ok, result: placed, delta}
POST /pose/landmark  {doc, declared, set, point, on, subject?, position, label?, lang?,
                      name?, pose_name?, author?, compute?}
                     → {ok, result: {placed, pose_id, computed?}, delta}
POST /pose/compute   {doc, declared, on, subject?, author?}
                     → {ok, result: {computed, missing, errors}, delta}
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Optional, Tuple

#: the routes this module answers (the bridge's level 79)
ROUTES = ("/pose/points", "/pose/extractor", "/pose/landmark", "/pose/compute")


def _overlay(body: Dict[str, Any]):
    import em_extensions
    overlay, _missing, _problems, _declared = em_extensions.active_overlay(body.get("declared") or [], True)
    return overlay


def _concept_label(uri: Optional[str], lang: str) -> Optional[Tuple[str, str]]:
    """The label of a vocabulary entry in ``lang`` (then English), from the
    vocabularies installed on this machine."""
    if not uri:
        return None
    try:
        from s3dgraphy.authorities import packages as P
        hit = P.concept_of(str(uri))
    except Exception:  # noqa: BLE001 — no manager, no label: the point's own words
        return None
    if not hit:
        return None
    return P.label_in(hit[1], lang) or P.label_in(hit[1], "en")


def points(body: Dict[str, Any]) -> Dict[str, Any]:
    from s3dgraphy.profiles.overlay import pick_label
    overlay = _overlay(body)
    sid = str(body.get("set") or "")
    ls = overlay.landmark_set(sid)
    if not ls:
        raise ValueError(f"{sid!r} is not a landmark set of the active packages")
    lang = str(body.get("lang") or "en")
    out = []
    for p in overlay.landmark_points(sid):
        found = _concept_label(p.get("concept"), lang)
        own = pick_label(p.get("label"), lang) if p.get("label") is not None else None
        label, label_lang = (found if found else ((own, lang) if own else (str(p["id"]), None)))
        out.append({"id": str(p["id"]), "concept": p.get("concept"), "label": label, "label_lang": label_lang,
                    "side": p.get("side"), "mirror": p.get("mirror"), "required": bool(p.get("required")),
                    "ref": p.get("ref")})
    body_set = ls.get("set") or {}
    return {"ok": True, "points": out,
            "set": {"id": sid, "label": pick_label(ls.get("label") or body_set.get("label"), lang) or sid,
                    "extractor_type": ls.get("extractor_type"), "order": body_set.get("order"),
                    "reference": body_set.get("reference"),
                    "geometry": overlay.extractor_geometry(str(ls.get("extractor_type") or ""))}}


def _graph(body: Dict[str, Any]):
    from s3dgraphy import api
    doc = body.get("doc")
    if not isinstance(doc, dict):
        raise ValueError("the em.json of the document is needed ({doc})")
    graph, _warnings = api.load_emjson(doc)
    return api, graph


def _with_delta(body: Dict[str, Any], fn: Callable[[Any, Any], Any], maps, changes) -> Dict[str, Any]:
    api, graph = _graph(body)
    overlay = _overlay(body)
    nodes0, edges0 = maps(api, graph)
    result = fn(graph, overlay)
    nodes1, edges1 = maps(api, graph)
    delta = {
        "add_nodes": [nodes1[i] for i in nodes1 if i not in nodes0],
        "remove_nodes": [i for i in nodes0 if i not in nodes1],
        "set_fields": [{"node": i, **c} for i in nodes1 if i in nodes0 for c in changes(nodes0[i], nodes1[i])],
        "add_edges": [edges1[i] for i in edges1 if i not in edges0],
        "remove_edges": [edges0[i] for i in edges0 if i not in edges1],
        "edge_attributes": [{"edge": edges1[i], "attributes": edges1[i].get("attributes") or {},
                             "before": edges0[i].get("attributes") or {}}
                            for i in edges1 if i in edges0
                            and (edges0[i].get("attributes") or {}) != (edges1[i].get("attributes") or {})],
    }
    return {"ok": True, "result": result, "delta": delta}


def _named(graph, overlay, computed: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    """A combiner the computation MADE takes the label of its type in the
    page's language (the library names it in English): the Matrix of an
    Italian study says «Larghezza biorbitale». A combiner already there keeps
    its name — a person may have renamed it."""
    lang = str(body.get("lang") or "")
    if not lang:
        return computed
    for c in computed.get("computed") or []:
        if not c.get("created"):
            continue
        node = graph.find_node_by_id(c.get("combiner_id"))
        label = overlay.label(c.get("combiner_type"), lang) if hasattr(overlay, "label") else None
        if node is not None and label:
            node.name = str(label)
    return computed


def post(route: str, body: Dict[str, Any], maps, changes) -> Tuple[int, Dict[str, Any]]:
    """``maps``/``changes``: the bridge's own em.json maps and field diff
    (``_emjson_maps``, ``_node_field_changes``), so a delta here is the one
    /property-source answers."""
    try:
        from s3dgraphy.annotation import combiners as C
        from s3dgraphy.annotation import extractors as X
    except ImportError as exc:
        return 501, {"ok": False, "error": f"s3dgraphy without the extractors of packages: {exc}"}
    try:
        if route == "/pose/points":
            return 200, points(body)
        on = body.get("on") or None
        subject = body.get("subject") or None
        author = body.get("author") or None
        if route == "/pose/extractor":
            def run(graph, overlay):
                return X.place_extractor(graph, overlay, str(body.get("type") or ""), on,
                                         body.get("vertices") or [], name=body.get("name") or None,
                                         author=author).as_dict()
            return 200, _with_delta(body, run, maps, changes)
        if route == "/pose/landmark":
            def run(graph, overlay):
                sid = str(body.get("set") or "")
                pose = X.start_landmark_pose(graph, overlay, sid, on, subject=subject,
                                             name=body.get("pose_name") or None, author=author)
                pid = str(body.get("point") or "")
                existed = graph.find_node_by_id(X.landmark_extractor_id(pose, pid)) is not None
                placed = X.place_landmark(graph, overlay, sid, pid, on,
                                          body.get("position"), pose_id=pose, subject=subject,
                                          label=body.get("label") or None, lang=body.get("lang") or None,
                                          author=author)
                # the name EMStudio gives a document's extractor (<document>.<NN>):
                # the library names a new one after its label, which two poses repeat
                name = body.get("name")
                node = graph.find_node_by_id(placed.extractor_id)
                if name and node is not None and not existed:
                    node.name = str(name)
                out: Dict[str, Any] = {"placed": placed.as_dict(), "pose_id": pose}
                status = X.landmark_pose_status(graph, overlay, sid, on, subject=subject)
                out["status"] = status
                if body.get("compute") and status["complete"]:
                    out["computed"] = _named(graph, overlay, C.compute_available(graph, overlay, on, subject=subject,
                                                                                 author=author), body)
                return out
            return 200, _with_delta(body, run, maps, changes)
        if route == "/pose/compute":
            def run(graph, overlay):
                return _named(graph, overlay, C.compute_available(graph, overlay, on, subject=subject, author=author), body)
            return 200, _with_delta(body, run, maps, changes)
    except X.ExtractorGeometryError as exc:
        return 400, {"ok": False, "error": str(exc), "code": "geometry"}
    except ValueError as exc:
        return 400, {"ok": False, "error": str(exc)}
    return 404, {"ok": False, "error": "unknown pose route"}
