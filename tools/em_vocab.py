"""MICRO-U-VOCABOLARI-COME-FONT (E.D., 18 Nov 2026) · the bridge's /vocab/* routes.
MICRO-PL02-GESTORE-DEI-VOCABOLARI (W20, 18 Nov 2026) · the manager behind them.

The vocabularies installed on THIS machine, read and changed through
``s3dgraphy.vocabularies`` (the manager over ``s3dgraphy.authorities.packages``)
— the folder every EM tool shares (EMStudio, EM Tools, the bridge itself), one
folder per version, the index compiled here at installation. The page never
reads the folder: it asks.

GET  /vocab/installed                     → {ok, dir, installed: [summary + versions, carriers, owner]}
GET  /vocab/search?text=&lang=&serves=    → {ok, candidates: [...]}  (exact, then close)
GET  /vocab/concepts?uri=…&uri=…          → {ok, concepts: {uri: {concept, vocab, aligned?}}}
GET  /vocab/catalog?url=                  → {ok, packages: [...]}    (the central one by default)
GET  /vocab/updates?url=                  → {ok, updates: [...]}
GET  /vocab/log?limit=                    → {ok, log: [...]}         (duplicates, replacements, releases)
GET  /vocab/alignments                    → {ok, alignments: [{name, rows, verified}]}
GET  /vocab/carried-only-by?carrier=      → {ok, vocabularies: [...]}
POST /vocab/install   {url} | {zip_b64} | {path}
                                          → {ok, installed: summary, warnings}  (an .emvocab.zip)
                                          → {ok, extension, installed: [summary], warnings}
                                             (a package with em-extension.toml: its [[data.vocabularies]])
POST /vocab/remove    {id, version?}      → {ok, removed}
POST /vocab/fetch-local {id, version?, file_b64? | path?}
                                          → {ok, installed: summary}   (tier C: the copy stays here;
                                             phase 1 = the file downloaded by hand, digest checked)
POST /vocab/release   {carrier, purge?}   → {ok, released, removed, orphaned}
POST /vocab/alignments/install {zip_b64|file_b64, name?} | {path} | {url}
                                          → {ok, alignments: {name, rows, verified}}
POST /vocab/alignments/remove {name}      → {ok, removed}
"""
from __future__ import annotations

import base64
import io
import urllib.request
import zipfile
from typing import Any, Dict, List, Tuple


def _pk():
    from s3dgraphy.authorities import packages
    return packages


def _vm():
    from s3dgraphy import vocabularies
    return vocabularies


def _is_extension(blob: bytes) -> bool:
    try:
        names = zipfile.ZipFile(io.BytesIO(blob)).namelist()
    except zipfile.BadZipFile:
        return False
    return any(n == "em-extension.toml" or (n.endswith("/em-extension.toml") and n.count("/") == 1)
               for n in names)


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
            from s3dgraphy.authorities import alignments as A
            out: Dict[str, Any] = {}
            for uri in q.get("uri") or []:
                hit = P.concept_of(uri)
                if hit:
                    out[uri] = {"concept": hit[1], "vocab": hit[0]}
                    aligned = A.aligned_concepts(uri)
                    if aligned:
                        out[uri]["aligned"] = aligned
            return 200, {"ok": True, "concepts": out}
        if route == "/vocab/catalog":
            return 200, {"ok": True, "packages": P.vocab_catalog(one("url") or P.CENTRAL_CATALOG_URL)}
        if route == "/vocab/updates":
            cat = P.vocab_catalog(one("url") or P.CENTRAL_CATALOG_URL)
            return 200, {"ok": True, "updates": P.vocab_updates(cat)}
        if route == "/vocab/log":
            return 200, {"ok": True, "log": P.vocab_log(int(one("limit", "50") or 50))}
        if route == "/vocab/alignments":
            return 200, {"ok": True, "alignments": _vm().installed_alignments()}
        if route == "/vocab/carried-only-by":
            return 200, {"ok": True, "vocabularies": P.vocab_carried_only_by(one("carrier"))}
    except P.PackageError as exc:
        return 422, {"ok": False, "error": str(exc)}
    except OSError as exc:
        return 502, {"ok": False, "error": f"not reachable: {exc}"}
    return 404, {"ok": False, "error": "unknown vocab route"}


def _bytes_of(body: Dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if body.get(k):
            return base64.b64decode(body[k])
    return None


def post(route: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    P = _pk()
    V = _vm()
    try:
        if route == "/vocab/install":
            blob = _bytes_of(body, "zip_b64")
            if blob is None and body.get("path"):
                with open(str(body["path"]), "rb") as fh:
                    blob = fh.read()
            if blob is not None:
                if _is_extension(blob):
                    r = V.install_extension_vocabularies(blob)
                    return 200, {"ok": True, "extension": r["id"], "installed": r["installed"],
                                 "warnings": r["warnings"]}
                s = P.vocab_install(blob)
                return 200, {"ok": True, "installed": s, "warnings": s.get("warnings") or []}
            if str(body.get("url") or "").startswith(("http://", "https://")):
                s = P.vocab_install(body["url"])
                return 200, {"ok": True, "installed": s, "warnings": s.get("warnings") or []}
            return 400, {"ok": False, "error": "install takes {url}, {zip_b64} or {path}"}
        if route == "/vocab/remove":
            return 200, {"ok": True, "removed": P.vocab_remove(str(body.get("id") or ""),
                                                               body.get("version") or None)}
        if route == "/vocab/fetch-local":
            data = _bytes_of(body, "file_b64") or (str(body["path"]) if body.get("path") else None)
            return 200, {"ok": True, "installed": P.vocab_fetch_local(
                str(body.get("id") or ""), data=data, version=body.get("version") or None)}
        if route == "/vocab/release":
            return 200, dict(ok=True, **P.vocab_release(str(body.get("carrier") or ""),
                                                        purge=bool(body.get("purge"))))
        if route == "/vocab/alignments/install":
            src: Any = _bytes_of(body, "file_b64", "zip_b64")
            if src is None and body.get("path"):
                src = str(body["path"])
            if src is None and str(body.get("url") or "").startswith(("http://", "https://")):
                with urllib.request.urlopen(body["url"], timeout=60) as r:  # noqa: S310 — asked for
                    src = r.read()
            if src is None:
                return 400, {"ok": False, "error": "takes {file_b64}, {path} or {url}"}
            return 200, {"ok": True, "alignments": V.install_alignments(src, name=body.get("name") or None)}
        if route == "/vocab/alignments/remove":
            return 200, {"ok": True, "removed": V.remove_alignments(str(body.get("name") or ""))}
    except P.PackageError as exc:
        return 422, {"ok": False, "error": str(exc)}
    except OSError as exc:
        return 502, {"ok": False, "error": f"not reachable: {exc}"}
    return 404, {"ok": False, "error": "unknown vocab route"}
