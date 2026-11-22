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
