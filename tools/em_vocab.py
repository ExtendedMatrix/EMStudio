"""MICRO-U-VOCABOLARI-COME-FONT (E.D., 18 Nov 2026) · the bridge's /vocab/* routes.

The vocabularies installed on THIS machine, read and changed through
``s3dgraphy.authorities.packages`` — the folder every EM tool shares (EMStudio,
EM Tools, the bridge itself), the index compiled here at installation. The page
never reads the folder: it asks.

GET  /vocab/installed                     → {ok, dir, installed: [summary]}
GET  /vocab/search?text=&lang=&serves=    → {ok, candidates: [...]}  (exact, then close)
GET  /vocab/concepts?uri=…&uri=…          → {ok, concepts: {uri: {concept, vocab}}}
GET  /vocab/catalog?url=                  → {ok, packages: [...]}    (the central one by default)
GET  /vocab/updates?url=                  → {ok, updates: [...]}
POST /vocab/install   {url} | {zip_b64}   → {ok, installed: summary}
POST /vocab/remove    {id}                → {ok, removed}
POST /vocab/fetch-local {id}              → {ok, installed: summary}   (tier C: the copy stays here)
"""
from __future__ import annotations

import base64
from typing import Any, Dict, List, Tuple


def _pk():
    from s3dgraphy.authorities import packages
    return packages


def get(route: str, q: Dict[str, List[str]]) -> Tuple[int, Dict[str, Any]]:
    P = _pk()
    one = lambda k, d="": (q.get(k) or [d])[0]  # noqa: E731
    try:
        if route == "/vocab/installed":
            return 200, {"ok": True, "dir": str(P.vocab_dir()), "installed": P.vocab_installed()}
        if route == "/vocab/search":
            serves = one("serves") or None
            got = P.search(one("text"), lang=one("lang") or None, serves=serves,
                           limit=int(one("limit", "12") or 12))
            if not got and serves:
                got = P.search(one("text"), lang=one("lang") or None,
                               limit=int(one("limit", "12") or 12))
            return 200, {"ok": True, "candidates": got}
        if route == "/vocab/concepts":
            out: Dict[str, Any] = {}
            for uri in q.get("uri") or []:
                hit = P.concept_of(uri)
                if hit:
                    out[uri] = {"concept": hit[1], "vocab": hit[0]}
            return 200, {"ok": True, "concepts": out}
        if route == "/vocab/catalog":
            return 200, {"ok": True, "packages": P.vocab_catalog(one("url") or P.CENTRAL_CATALOG_URL)}
        if route == "/vocab/updates":
            cat = P.vocab_catalog(one("url") or P.CENTRAL_CATALOG_URL)
            return 200, {"ok": True, "updates": P.vocab_updates(cat)}
    except P.PackageError as exc:
        return 422, {"ok": False, "error": str(exc)}
    except OSError as exc:
        return 502, {"ok": False, "error": f"not reachable: {exc}"}
    return 404, {"ok": False, "error": "unknown vocab route"}


def post(route: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    P = _pk()
    try:
        if route == "/vocab/install":
            if body.get("zip_b64"):
                src: Any = base64.b64decode(body["zip_b64"])
            elif str(body.get("url") or "").startswith(("http://", "https://")):
                src = body["url"]
            else:
                return 400, {"ok": False, "error": "install takes {url} or {zip_b64}"}
            return 200, {"ok": True, "installed": P.vocab_install(src)}
        if route == "/vocab/remove":
            return 200, {"ok": True, "removed": P.vocab_remove(str(body.get("id") or ""))}
        if route == "/vocab/fetch-local":
            return 200, {"ok": True, "installed": P.vocab_fetch_local(str(body.get("id") or ""))}
    except P.PackageError as exc:
        return 422, {"ok": False, "error": str(exc)}
    except OSError as exc:
        return 502, {"ok": False, "error": f"not reachable: {exc}"}
    return 404, {"ok": False, "error": "unknown vocab route"}
