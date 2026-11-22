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


# ── MICRO-MF04 · the Cube: the real footprints stacked by horizon ───────────
#
# ``POST /landscape-cube`` → s3Dgraphy's ``functional_cube``. ``mode
# building`` (default): the ACTIVE graph (``doc``) and the path of its file
# (``base``: its proxies are read beside it, ``proxies/<unit>.glb``), the lanes
# the Matrix reads by → ``cube_view`` with the LOD0 footprints computed from
# the proxies (``gis.proxy_footprint``, cached by the file's signature in the
# bridge's process). ``mode landscape``: as ``/landscape-matrix`` (the
# landscape's graph with its header, the open sources, ``base``) →
# ``landscape_cube``: the presences of the handles, symbols for the others.
# Every path passes through the bridge's sandbox (``_geo_inside``: inside the
# served roots); only ``.glb`` files are read. Computed, never written.

def landscape_cube_answer(body: Dict[str, Any], inside: Any = None) -> Tuple[int, Dict[str, Any]]:
    """``{mode?, doc | landscape, base?, lanes?, sources?, lang?}`` →
    ``(status, answer)``."""
    import os  # noqa: PLC0415
    try:
        from s3dgraphy import api  # noqa: PLC0415
        from s3dgraphy import functional_cube as CU  # noqa: PLC0415
        from s3dgraphy.gis import proxy_footprint as PF  # noqa: PLC0415
    except ImportError as exc:
        return 501, {"ok": False, "error": f"this s3dgraphy has no functional_cube: {exc}"}
    lang = "it" if str(body.get("lang") or "en").lower().startswith("it") else "en"
    lanes = body.get("lanes") if isinstance(body.get("lanes"), list) and body.get("lanes") else None
    base = body.get("base")
    base_dir = os.path.dirname(base) if isinstance(base, str) and base else None
    if base_dir and inside is not None:
        base_dir = inside(base_dir)
    if body.get("mode") == "landscape":
        doc = body.get("landscape")
        if not isinstance(doc, dict):
            return 400, {"ok": False, "error": "landscape (an em.json) is required"}
        landscape, _w = api.load_emjson(doc)
        sources, dirs = [], {}
        for item in body.get("sources") or []:
            sdoc = item.get("doc") if isinstance(item, dict) else None
            if isinstance(sdoc, dict):
                g, _sw = api.load_emjson(sdoc)
                sources.append((str(item.get("origin") or "open"), g))
                p = item.get("path")
                if isinstance(p, str) and p:
                    d = os.path.dirname(p)
                    dirs[g.graph_id] = inside(d) if inside is not None else d
        out = CU.landscape_cube(landscape, header=doc.get("header") or {}, lanes=lanes or [],
                                sources=sources, base_dir=base_dir, read_missing=base_dir is not None,
                                proxy_dirs=dirs, lang=lang)
        out["ok"] = True
        return 200, out
    doc = body.get("doc")
    if not isinstance(doc, dict):
        return 400, {"ok": False, "error": "doc (an em.json) is required"}
    graph, _w = api.load_emjson(doc)
    fps = PF.proxy_footprints(graph, base_dir, inside=inside) if base_dir else {}
    # MICRO-MF07 · the layer «RM»: the models of each epoch in plan (.glb /
    # .gltf bounds, beside the em.json, through the same sandbox); an older
    # s3Dgraphy without rm_footprints still answers the other three layers
    rms, unread = ({}, [])
    if base_dir and hasattr(PF, "rm_footprints"):
        try:
            rms, unread = PF.rm_footprints(graph, base_dir, inside=inside)
        except Exception:  # noqa: BLE001 — the RM layer is said empty, the cube still answers
            rms, unread = ({}, [])
    try:
        out = CU.cube_view(graph, proxy_footprints=fps, lanes=lanes, lang=lang,
                           rm_footprints=rms, rm_unread=unread)
    except TypeError:  # s3Dgraphy before MF07
        out = CU.cube_view(graph, proxy_footprints=fps, lanes=lanes, lang=lang)
    out["ok"] = True
    out["proxies"] = {"folder": base_dir, "read": len(fps),
                      "stale": sorted(u for u, f in fps.items() if f.get("stale"))}
    out["models"] = {"read": len(rms), "unread": len(unread)}
    return 200, out


def _landscape_cube_route(handler: Any, route: str, raw: bytes) -> None:
    import json  # noqa: PLC0415
    try:
        body = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception as exc:  # noqa: BLE001
        handler._fail(400, f"bad JSON: {exc}")
        return
    try:
        status, out = landscape_cube_answer(body if isinstance(body, dict) else {},
                                            inside=getattr(handler, "_geo_inside", None))
    except Exception as exc:  # pragma: no cover — surface to the UI
        import traceback  # noqa: PLC0415
        traceback.print_exc()
        status, out = 500, {"ok": False, "error": f"cube failed: {exc}"}
    handler._json(out, status)


# ── MICRO-MF07 · the proposals of functional units ──────────────────────────
#
# ``POST /functional-proposals`` → s3Dgraphy's ``functional_proposals``.
# ``mode activities`` (default): one brace per activity, deterministic.
# ``mode ai``: the briefing (``ai_context``: the units — the selection when
# ``units`` is given —, their descriptions, activities, first epochs, the
# nearness of their footprints read from the proxies beside ``base``, the
# Narrative's prose, the identities of the Landscape Matrix the page sends)
# goes to the model the AI drafts of the Narrative use (``llm_provider``:
# ``provider`` / ``model`` of the request, the key in the bridge's memory); the
# reply is read by ``parse_ai_reply`` (only what the graph can hold). Nothing
# is written: the page writes an ACCEPTED proposal, with its paradata. 501 =
# the AI is not configured (no key): the page says it and keeps «from the
# activities».

def functional_proposals_answer(body: Dict[str, Any], inside: Any = None) -> Tuple[int, Dict[str, Any]]:
    """``{mode?, doc, base?, lanes?, units?, identities?, provider?, model?,
    instruction?, date?, lang?}`` → ``(status, answer)``."""
    import os  # noqa: PLC0415
    try:
        from s3dgraphy import api  # noqa: PLC0415
        from s3dgraphy import functional_proposals as FP  # noqa: PLC0415
    except ImportError as exc:
        return 501, {"ok": False, "error": f"this s3dgraphy has no functional_proposals: {exc}"}
    doc = body.get("doc")
    if not isinstance(doc, dict):
        return 400, {"ok": False, "error": "doc (an em.json) is required"}
    lang = "it" if str(body.get("lang") or "en").lower().startswith("it") else "en"
    lanes = body.get("lanes") if isinstance(body.get("lanes"), list) and body.get("lanes") else None
    graph, _w = api.load_emjson(doc)
    if body.get("mode", "activities") != "ai":
        return 200, {"ok": True, "mode": "activities",
                     "proposals": FP.from_activities(graph, lanes=lanes, lang=lang)}
    try:
        import pathlib  # noqa: PLC0415
        import sys  # noqa: PLC0415
        here = str(pathlib.Path(__file__).resolve().parent)
        if here not in sys.path:
            sys.path.insert(0, here)
        from llm_provider import LLMError, get_provider  # noqa: PLC0415
    except ImportError as exc:
        return 501, {"ok": False, "error": f"LLM seam unavailable: {exc}"}
    fps: Dict[str, Any] = {}
    base = body.get("base")
    base_dir = os.path.dirname(base) if isinstance(base, str) and base else None
    if base_dir and inside is not None:
        base_dir = inside(base_dir)
    if base_dir:
        try:
            from s3dgraphy import functional_cube as CU  # noqa: PLC0415
            from s3dgraphy.gis import proxy_footprint as PF  # noqa: PLC0415
            fps = CU.unit_footprints(graph, PF.proxy_footprints(graph, base_dir, inside=inside))
        except Exception:  # noqa: BLE001 — without footprints the briefing says no nearness
            fps = {}
    units = body.get("units") if isinstance(body.get("units"), list) and body.get("units") else None
    idents = body.get("identities") if isinstance(body.get("identities"), list) else None
    context = FP.ai_context(graph, units=units, footprints=fps, identities=idents, lanes=lanes, lang=lang)
    prompt = FP.build_ai_prompt(context, str(body.get("instruction") or ""))
    try:
        opts = {"max_tokens": 4000}
        if str(body.get("model") or "").strip():
            opts["model"] = str(body["model"]).strip()
        provider = get_provider(body.get("provider"), **opts)
        text = provider.generate(FP.AI_SYSTEM_PROMPT, prompt, context)
    except LLMError as exc:
        return exc.status, {"ok": False, "error": str(exc)}
    except TypeError:
        provider = get_provider(body.get("provider"))
        text = provider.generate(FP.AI_SYSTEM_PROMPT, prompt, context)
    except Exception as exc:  # noqa: BLE001
        return 502, {"ok": False, "error": f"the model failed: {exc}"}
    model = getattr(provider, "model", "") or provider.name
    try:
        read = FP.parse_ai_reply(graph, text, lanes=lanes, model=model,
                                 date=str(body.get("date") or "") or None, lang=lang)
    except ValueError as exc:
        return 502, {"ok": False, "error": f"the model's reply could not be read: {exc}"}
    return 200, {"ok": True, "mode": "ai", "provider": provider.name, "model": model,
                 "scope": context["scope"], "sent": {"units": len(context["units"]),
                                                     "activities": len(context["activities"]),
                                                     "narrative_chars": len(context["narrative"]),
                                                     "identities": len(context["identities"]),
                                                     "footprints": sum(1 for u in context["units"] if u.get("footprint"))},
                 **read}


def _functional_proposals_route(handler: Any, route: str, raw: bytes) -> None:
    import json  # noqa: PLC0415
    try:
        body = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception as exc:  # noqa: BLE001
        handler._fail(400, f"bad JSON: {exc}")
        return
    try:
        status, out = functional_proposals_answer(body if isinstance(body, dict) else {},
                                                  inside=getattr(handler, "_geo_inside", None))
    except Exception as exc:  # pragma: no cover — surface to the UI
        import traceback  # noqa: PLC0415
        traceback.print_exc()
        status, out = 500, {"ok": False, "error": f"proposals failed: {exc}"}
    handler._json(out, status)


#: the bridge's POST routes this module adds (em_bridge.py merges them into
#: POST_ROUTES when this module is importable: the dev stack and the lab sidecar)
POST_ROUTES: Dict[str, Callable[[Any, str, bytes], None]] = {
    "/functional-matrix": _functional_matrix_route,
    "/landscape-matrix": _landscape_matrix_route,
    "/landscape-cube": _landscape_cube_route,
    "/functional-proposals": _functional_proposals_route,
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


@lab_api("landscape-cube", "landscape_cube")
class LandscapeCube:
    """``em.app.landscape_cube`` — the Cube from a script:
    ``em.app.landscape_cube.compute(graph, folder)`` answers what the page
    draws at the scale of the building (s3Dgraphy ``functional_cube.cube_view``
    with the footprints of the proxies beside ``folder``);
    ``footprints(graph, folder)`` the LOD0 footprints alone
    (``gis.proxy_footprint.proxy_footprints``)."""

    def __init__(self, app: Any) -> None:
        self._app = app

    def footprints(self, graph: Any, folder: str) -> Dict[str, Any]:
        from s3dgraphy.gis import proxy_footprint as PF  # noqa: PLC0415
        return PF.proxy_footprints(graph, folder)

    def compute(self, graph: Any, folder: Any = None, lanes: Any = None, lang: str = "en") -> Dict[str, Any]:
        from s3dgraphy import functional_cube as CU  # noqa: PLC0415
        return CU.cube_view(graph, proxy_footprints=self.footprints(graph, folder) if folder else {},
                            lanes=lanes, lang=lang)


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
