"""EMBARGO (MICRO-SEG30, E.D. 22 Nov 2026) · the ``em.app`` APIs of the functions
under embargo — EMStudio LAB only.

The embargo is of the BUILD, not of the code: this file is in the public
repository, and the community sidecar does not contain it
(``apps/desktop/build-bridge.sh`` passes ``--exclude-module em_py_lab`` unless
``EM_LAB=1``; the release guard ``frontend/scripts/embargo-guard.mjs`` looks
for this module's name in the binary). In the bridge of the dev stack it is
importable, and still nothing attaches unless the PAGE — whose build decides —
lists the function as ``embargo`` and on (``Session.features``, sent by
``features.ts featuresWire``): a community page never does.

An API is registered with its function's id and the attribute it takes on
``em.app``::

    @lab_api("functional-matrix", "functional_matrix")
    class FunctionalMatrix:
        def __init__(self, app): ...

PUBLISHING a function moves its API out of here, into ``em_py.EMStudioApp``.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Tuple

#: what the release guard looks for in a binary, besides the module's name
SENTINEL = "em-embargo:em.app"

#: attribute on em.app → (the function's id in features.ts, factory(app) → object)
APIS: Dict[str, Tuple[str, Callable[[Any], Any]]] = {}


def lab_api(feature_id: str, name: str) -> Callable[[Callable[[Any], Any]], Callable[[Any], Any]]:
    """Register ``factory`` as ``em.app.<name>`` for the function ``feature_id``."""
    def deco(factory: Callable[[Any], Any]) -> Callable[[Any], Any]:
        APIS[name] = (feature_id, factory)
        return factory
    return deco


def attach(app: Any, name: str) -> Any:
    """``em.app.<name>`` if it is an embargo API whose function the page lists
    as ``embargo`` and on; else None."""
    entry = APIS.get(name)
    if entry is None:
        return None
    feature_id, factory = entry
    for f in app.features():
        if f.get("id") == feature_id and f.get("state") == "embargo" and f.get("on"):
            return factory(app)
    return None


# ── MICRO-MF01 · the Functional Matrix ───────────────────────────────────────
#
# The page's «Matrix funzionale» (frontend/src/functional-matrix.ts) asks the
# bridge what to draw: ``POST /functional-matrix`` with ``{doc, lanes?, lang?}``
# → s3Dgraphy's ``functional_matrix.functional_matrix`` (lanes, braces,
# instances, readers, the changed_from chain, coherence, the cards «how we
# know it»). Computed, never written. The route lives HERE, so the community
# sidecar — which does not contain this module — has no such route (404), and
# the page of the community build never asks it (featureOn is off there).

def functional_matrix_answer(body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """``{doc, lanes?, lang?}`` → ``(status, answer)``."""
    try:
        from s3dgraphy import api  # noqa: PLC0415 — the bridge's s3Dgraphy
        from s3dgraphy import functional_matrix as FM  # noqa: PLC0415
    except ImportError as exc:
        return 501, {"ok": False, "error": f"this s3dgraphy has no functional_matrix: {exc}"}
    doc = body.get("doc")
    if not isinstance(doc, dict):
        return 400, {"ok": False, "error": "doc (an em.json) is required"}
    lanes = body.get("lanes")
    lang = "it" if str(body.get("lang") or "en").lower().startswith("it") else "en"
    graph, warnings = api.load_emjson(doc)
    out = FM.functional_matrix(graph, lanes=lanes if isinstance(lanes, list) and lanes else None, lang=lang)
    out["ok"] = True
    out["warnings"] = [w for w in warnings if "functional" in str(w).lower()]
    return 200, out


def _functional_matrix_route(handler: Any, route: str, raw: bytes) -> None:
    import json  # noqa: PLC0415
    try:
        body = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception as exc:  # noqa: BLE001
        handler._fail(400, f"bad JSON: {exc}")
        return
    try:
        status, out = functional_matrix_answer(body if isinstance(body, dict) else {})
    except Exception as exc:  # pragma: no cover — surface to the UI
        import traceback  # noqa: PLC0415
        traceback.print_exc()
        status, out = 500, {"ok": False, "error": f"functional matrix failed: {exc}"}
    handler._json(out, status)


# ── MICRO-MF03 · the Landscape Matrix and the semantic zoom ─────────────────
#
# ``POST /landscape-matrix`` → s3Dgraphy's ``functional_zoom``: the page sends
# the LANDSCAPE's graph (its em.json with the header: the composition and the
# bonds graph ↔ site are there), the lanes (the container's horizons, newest
# first), the graphs it has open (fresher than their files) and the path of
# the landscape file on disk (a cited graph not open is read from its
# composition path, relative to it). ``mode: identities`` answers step 2 of
# the zoom for ONE graph no landscape binds. Computed, never written.

def landscape_matrix_answer(body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """``{mode?, landscape | graph, lanes?, sources?, base?, sites?, focus?,
    lang?}`` → ``(status, answer)``."""
    import os  # noqa: PLC0415
    try:
        from s3dgraphy import api  # noqa: PLC0415
        from s3dgraphy import functional_zoom as Z  # noqa: PLC0415
    except ImportError as exc:
        return 501, {"ok": False, "error": f"this s3dgraphy has no functional_zoom: {exc}"}
    lang = "it" if str(body.get("lang") or "en").lower().startswith("it") else "en"
    lanes = body.get("lanes") if isinstance(body.get("lanes"), list) else None
    if body.get("mode") == "identities":
        doc = body.get("graph")
        if not isinstance(doc, dict):
            return 400, {"ok": False, "error": "graph (an em.json) is required"}
        graph, _w = api.load_emjson(doc)
        out = Z.identities_view(graph, lanes=lanes or None, lang=lang)
        out["ok"] = True
        return 200, out
    doc = body.get("landscape")
    if not isinstance(doc, dict):
        return 400, {"ok": False, "error": "landscape (an em.json) is required"}
    landscape, _w = api.load_emjson(doc)
    sources = []
    for item in body.get("sources") or []:
        sdoc = item.get("doc") if isinstance(item, dict) else None
        if isinstance(sdoc, dict):
            g, _sw = api.load_emjson(sdoc)
            sources.append((str(item.get("origin") or "open"), g))
    base = body.get("base")
    base_dir = os.path.dirname(base) if isinstance(base, str) and base else None
    sites = body.get("sites") if isinstance(body.get("sites"), list) else None
    out = Z.landscape_view(landscape, header=doc.get("header") or {}, lanes=lanes or [],
                           sources=sources, sites=sites, focus=body.get("focus"),
                           base_dir=base_dir, read_missing=base_dir is not None, lang=lang)
    out["ok"] = True
    return 200, out


def _landscape_matrix_route(handler: Any, route: str, raw: bytes) -> None:
    import json  # noqa: PLC0415
    try:
        body = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception as exc:  # noqa: BLE001
        handler._fail(400, f"bad JSON: {exc}")
        return
    try:
        status, out = landscape_matrix_answer(body if isinstance(body, dict) else {})
    except Exception as exc:  # pragma: no cover — surface to the UI
        import traceback  # noqa: PLC0415
        traceback.print_exc()
        status, out = 500, {"ok": False, "error": f"landscape matrix failed: {exc}"}
    handler._json(out, status)


#: the bridge's POST routes this module adds (em_bridge.py merges them into
#: POST_ROUTES when this module is importable: the dev stack and the lab sidecar)
POST_ROUTES: Dict[str, Callable[[Any, str, bytes], None]] = {
    "/functional-matrix": _functional_matrix_route,
    "/landscape-matrix": _landscape_matrix_route,
}


@lab_api("landscape-matrix", "landscape_matrix")
class LandscapeMatrix:
    """``em.app.landscape_matrix`` — the Landscape Matrix from a script:
    ``em.app.landscape_matrix.compute(landscape_graph, header=…, lanes=…,
    sources=[…])`` answers what the page draws (s3Dgraphy
    ``functional_zoom.landscape_view``); ``bind(header, graph_id, site_id)``
    the header with the bond graph ↔ site (``functional_zoom.bind_site``)."""

    def __init__(self, app: Any) -> None:
        self._app = app

    def compute(self, landscape: Any, **kw: Any) -> Dict[str, Any]:
        from s3dgraphy import functional_zoom as Z  # noqa: PLC0415
        return Z.landscape_view(landscape, **kw)

    def bind(self, header: Any, graph_id: str, site_id: Any) -> Dict[str, Any]:
        from s3dgraphy import functional_zoom as Z  # noqa: PLC0415
        return Z.bind_site(header, graph_id, site_id)


@lab_api("functional-matrix", "functional_matrix")
class FunctionalMatrix:
    """``em.app.functional_matrix`` — the Functional Matrix from a script:
    ``em.app.functional_matrix.compute(graph, lang="it")`` answers what the
    page draws (s3Dgraphy ``functional_matrix.functional_matrix``)."""

    def __init__(self, app: Any) -> None:
        self._app = app

    def compute(self, graph: Any, lanes: Any = None, lang: str = "en") -> Dict[str, Any]:
        from s3dgraphy import functional_matrix as FM  # noqa: PLC0415
        return FM.functional_matrix(graph, lanes=lanes, lang=lang)
