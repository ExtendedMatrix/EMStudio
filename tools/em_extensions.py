"""MICRO-PL09-ESTENSIONI-IN-EMSTUDIO (W6, E.D. 18 Nov 2026) · the bridge's
/extensions/* and /profiles/* routes.

The extensions of THIS machine — community packages, plugins and mixed
packages — installed, updated and removed by parts through
``s3dgraphy.extensions`` (W21: the register ``~/.s3dgraphy/extensions/
installed.json``, the three deliveries, the trust as a parameter), and the
packages' overlay a document reads through ``s3dgraphy.profiles`` (W1). The
window «Estensioni» asks; the library does; nothing here installs on its own
(SPEC-pacchetto §16.3: «la finestra usa W21, non fa installazioni sue»).

Phase 1: from disk only (a folder or a zip, a path or the bytes of a file the
page chose). Every problem travels as the library writes it — ``{code, level,
where, en, it}`` — so the page shows the sentence in its language.

GET  /extensions/installed               → {ok, extensions: [...], platform, dirs}
GET  /extensions/removal-plan?id=        → {ok, plan}
POST /extensions/preview  {path}|{zip_b64, name?}
                                          → {ok, preview}       (the two panels, nothing written)
POST /extensions/install  {path}|{zip_b64, name?}, parts: all|data, trust
                                          → {ok, installed}     (the register's row + status per section)
POST /extensions/install-code {id, trust} | {path|zip_b64, trust}
                                          → {ok, installed}
POST /extensions/enable   {id, version?}  → {ok, enabled}
POST /extensions/disable  {id}            → {ok, disabled}
POST /extensions/remove   {id, part: all|code|data, version?, confirm?, purge_vocabularies?}
                                          → {ok, removed}
GET  /profiles/installed                 → {ok, profiles: [...]}  (every version, the index's rows)
POST /profiles/overlay {declared: header.profiles, lang, installed?: bool}
                                          → {ok, overlay, missing, problems, declared_active}
     the overlay of what the document declares; with ``installed`` (default
     true) also the newest version of every other package installed here — a
     package installed is usable in a new document, and the save declares it
     (``profiles.declare`` picks the newest installed by prefix the same way)
"""
from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Tuple


def _E():
    from s3dgraphy import extensions
    return extensions


def _P():
    from s3dgraphy import profiles
    return profiles


def _plain(v: Any) -> Any:
    """JSON-able: a Problem as the library writes it, a path as text."""
    from s3dgraphy.profiles import Problem
    if isinstance(v, Problem):
        return v.as_dict()
    if isinstance(v, Path):
        return str(v)
    if isinstance(v, dict):
        return {str(k): _plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [_plain(x) for x in v]
    return v


def _failed(exc: Exception) -> Tuple[int, Dict[str, Any]]:
    report = getattr(exc, "report", None)
    problems = [p.as_dict() for p in report.problems] if report is not None and report.problems else []
    return 422, {"ok": False, "error": str(exc), "problems": problems}


class _Source:
    """The archive asked about: a path on this machine, or the bytes of a file
    the page chose. Bytes to PREVIEW go to a temporary file, gone after the
    answer; bytes to INSTALL are kept in ``<extensions>/archives/<name>`` — the
    register's ``origin``, from which «Installa il codice…» installs later what
    «Solo i dati» left out without asking for the file again (a path is kept
    where it is)."""

    def __init__(self, body: Dict[str, Any], keep: bool = False):
        self.tmp: str | None = None
        if body.get("path"):
            self.ref: Any = os.path.expanduser(str(body["path"]))
        elif body.get("zip_b64"):
            name = os.path.basename(str(body.get("name") or "extension.zip")) or "extension.zip"
            name = name if name.endswith(".zip") else name + ".zip"
            if keep:
                d = _E().extensions_dir() / "archives"
                d.mkdir(parents=True, exist_ok=True)
                target = str(d / name)
            else:
                target = os.path.join(tempfile.mkdtemp(prefix="em-ext-"), name)
                self.tmp = target
            with open(target, "wb") as fh:
                fh.write(base64.b64decode(body["zip_b64"]))
            self.ref = target
        else:
            self.ref = None

    def close(self) -> None:
        if self.tmp:
            try:
                os.remove(self.tmp)
                os.rmdir(os.path.dirname(self.tmp))
            except OSError:
                pass


def _with_active(E) -> List[Dict[str, Any]]:
    """The register's rows, each code's ``active`` read where activation lives
    (``enabled.json``: «Disattiva» writes there, not in the register)."""
    on = {str(e.get("id")): e for e in (E.read_enabled().get("plugins") or {}).values()}
    rows = _plain(E.installed())
    for r in rows:
        code = r.get("code")
        if isinstance(code, dict) and code.get("status") == "installed":
            e = on.get(str(r.get("id")))
            code["active"] = e is not None
            code["active_version"] = e.get("version") if e else None
    return rows


def get(route: str, q: Dict[str, List[str]]) -> Tuple[int, Dict[str, Any]]:
    one = lambda k, d="": (q.get(k) or [d])[0]  # noqa: E731
    try:
        E = _E()
        if route == "/extensions/installed":
            P = _P()
            return 200, {"ok": True, "extensions": _with_active(E), "platform": E.this_platform(),
                         "dirs": {"extensions": str(E.extensions_dir()), "plugins": str(E.plugins_dir()),
                                  "profiles": str(P.profiles_dir())}}
        if route == "/extensions/removal-plan":
            return 200, {"ok": True, "plan": _plain(E.removal_plan(one("id")))}
        if route == "/profiles/installed":
            return 200, {"ok": True, "profiles": _plain(_P().installed())}
    except ImportError as exc:
        return 501, {"ok": False, "error": f"s3dgraphy without extensions: {exc}"}
    except ValueError as exc:
        return _failed(exc)
    except OSError as exc:
        return 502, {"ok": False, "error": str(exc)}
    return 404, {"ok": False, "error": "unknown extensions route"}


def active_overlay(declared: Any, installed: bool = True):
    """``(overlay, missing, problems, declared_names)`` of a document: what its
    ``header.profiles`` declares, and with ``installed`` the newest version of
    every other package installed here. The same overlay for the window (W6)
    and for the Space's placing tools (W7, ``em_pose``)."""
    P = _P()
    overlay, missing, problems = P.activate(declared or [])
    active = list(overlay)
    declared_names = {p.name for p in active}
    if installed:
        seen = set(declared_names)
        for row in P.installed(all_versions=False):
            name = str(row.get("name") or "")
            if not name or name in seen:
                continue
            p = P.find(name, row.get("version"), exact=True) or P.find(name)
            if p is not None:
                active.append(p)
                seen.add(name)
        overlay = P.ProfileOverlay(active)
    return overlay, missing, problems, declared_names


def _overlay(body: Dict[str, Any]) -> Dict[str, Any]:
    overlay, missing, problems, declared_names = active_overlay(body.get("declared") or [],
                                                                bool(body.get("installed", True)))
    active = list(overlay)
    out = overlay.as_dict(lang=str(body.get("lang") or "en"))
    # the strings in English too: a key the language lacks falls back to it
    if str(body.get("lang") or "en") != "en":
        out["strings_en"] = overlay.strings("en")
    for prof in out["profiles"]:
        prof["declared"] = prof["name"] in declared_names
    # the files the page cannot read by itself: a form's compiled definition,
    # a colour scheme's .emc — inside the package's own folder only
    for key, field, doc_key in (("forms", "compiled_path", "compiled_doc"), ("color_schemes", "file", "doc")):
        for entry in (out.get(key) or {}).values():
            doc = _package_json(entry.get(field), [p.root for p in active])
            if doc is not None:
                entry[doc_key] = doc
    return {"ok": True, "overlay": _plain(out), "missing": _plain(missing),
            "problems": [p.as_dict() for p in problems]}


def _package_json(path: Any, roots: List[Any]) -> Any:
    """A JSON file of an installed package (≤ 4 MB), only under one of its roots."""
    import json
    if not path:
        return None
    try:
        f = Path(str(path)).resolve()
        if not any(r is not None and Path(str(r)).resolve() in f.parents for r in roots):
            return None
        if not f.is_file() or f.stat().st_size > 4 * 1024 * 1024:
            return None
        return json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def post(route: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    src = None
    try:
        E = _E()
        if route == "/profiles/overlay":
            return 200, _overlay(body)
        if route in ("/extensions/preview", "/extensions/install", "/extensions/install-code"):
            src = _Source(body, keep=route != "/extensions/preview")
            if route == "/extensions/preview":
                if src.ref is None:
                    return 400, {"ok": False, "error": "preview takes {path} or {zip_b64}"}
                return 200, {"ok": True, "preview": _plain(E.preview(src.ref))}
            if route == "/extensions/install":
                if src.ref is None:
                    return 400, {"ok": False, "error": "install takes {path} or {zip_b64}"}
                parts = str(body.get("parts") or "all")
                if parts not in ("all", "data"):
                    return 400, {"ok": False, "error": "parts: all | data"}
                return 200, {"ok": True, "installed": _plain(E.install(src.ref, parts=parts,
                                                                      trust=bool(body.get("trust"))))}
            ref = src.ref if src.ref is not None else str(body.get("id") or "")
            return 200, {"ok": True, "installed": _plain(E.install_code(ref, trust=bool(body.get("trust"))))}
        if route == "/extensions/enable":
            return 200, {"ok": True, "enabled": _plain(E.enable(str(body.get("id") or ""),
                                                               body.get("version") or None))}
        if route == "/extensions/disable":
            return 200, {"ok": True, "disabled": bool(E.disable(str(body.get("id") or "")))}
        if route == "/extensions/remove":
            eid = str(body.get("id") or "")
            part = str(body.get("part") or "all")
            confirm = bool(body.get("confirm"))
            purge = bool(body.get("purge_vocabularies"))
            if part == "code":
                out = E.remove_code(eid)
            elif part == "data":
                out = E.remove_data(eid, version=body.get("version") or None, confirm=confirm,
                                    purge_vocabularies=purge)
            elif part == "all":
                out = E.remove(eid, confirm=confirm, purge_vocabularies=purge)
            else:
                return 400, {"ok": False, "error": "part: all | code | data"}
            return 200, {"ok": True, "removed": _plain(out)}
    except ImportError as exc:
        return 501, {"ok": False, "error": f"s3dgraphy without extensions: {exc}"}
    except ValueError as exc:
        return _failed(exc)
    except OSError as exc:
        return 502, {"ok": False, "error": str(exc)}
    finally:
        if src is not None:
            src.close()
    return 404, {"ok": False, "error": "unknown extensions route"}
