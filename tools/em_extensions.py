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
MICRO-PL22 (X2) · the REPOSITORIES of this machine (s3dgraphy.extensions.remote):
GET  /extensions/repos                   → {ok, repositories (never a token), online {on, setting, env}, official_url}
GET  /extensions/available?repo=         → {ok, available, blocked, updates, online}
POST /extensions/online   {on}           → {ok, online}         («Consenti l'accesso in rete», one switch)
POST /extensions/repos/add {url, name?, token?, check_on_startup?}
                                          → {ok, repository}
POST /extensions/repos/update {name, url?, token?, enabled?, check_on_startup?}
POST /extensions/repos/remove {name}     → {ok, removed}        (what came from it stays installed)
POST /extensions/repos/sync {name?, startup?}
                                          → {ok, sync}           (http(s) only with online access)
POST /extensions/repos/preview {repo, id, version?}
                                          → {ok, preview}       (downloaded, checked against archive_hash, + plan)
POST /extensions/repos/install {repo, id, version?, parts, trust, with_requires, trust_requires}
                                          → {ok, result}
MICRO-PL23 (X3) · UPDATES, versions side by side, clean removal (s3dgraphy.extensions.lifecycle):
GET  /extensions/versions?id=            → {ok, versions}       (data and code versions on disk, the active one)
GET  /extensions/leftovers               → {ok, leftovers}      (what nothing in the register owns)
POST /extensions/updates  {read?}        → {ok, check}          («Controlla aggiornamenti»: http(s) only when online;
                                                                  each with trust_needed, said BEFORE «Aggiorna tutto»)
POST /extensions/update-all {trust: [ids], read?}
                                          → {ok, result}         (updated, needs_trust, failed)
POST /extensions/use      {id, version, source?, trust?}
                                          → {ok, used}           (an older code made active again, no download)
POST /extensions/prune    {id}           → {ok, removed}        (the old code versions; the active one stays)
POST /extensions/clean    {dry_run?}     → {ok, clean}
POST /extensions/remove   … part: code + version → that version only; purge_user_data
POST /profiles/redeclare  {declared, ref, version}
                                          → {ok, declared}       (the answer «aggiorna la dichiarazione»)
/profiles/overlay answers also ``newer``: the declared packages with a newer
version here («questo file usa stat 1.0.0, c'è la 1.1.0», a major with its CHANGELOG).
GET  /profiles/installed                 → {ok, profiles: [...]}  (every version, the index's rows)
POST /profiles/overlay {declared: header.profiles, lang, installed?: bool}
                                          → {ok, overlay, missing, problems, declared_active}
     the overlay of what the document declares; with ``installed`` (default
     true) also the newest version of every other package installed here — a
     package installed is usable in a new document, and the save declares it
     (``profiles.declare`` picks the newest installed by prefix the same way)

MICRO-PL11 (W8) · the SHEETS of a package are verified, never taken on trust:
a form's compiled definition goes to the page (``compiled_doc``, ``verified``)
only when stratigraph-templates' ``packages.verify_compiled`` finds nothing —
the file's digest is the manifest's ``forms[].digest``, it is a compiled
definition, its ``header.digest`` is its content's, its id and version are the
ones the manifest and the file's name say; otherwise ``compiled_problems``
(EN + IT) and nothing to draw. With it, ``vocabularies``: the package's own
schemes the definition names (``<prefix>:<slug>``), their concepts read from
the vocabulary manager of this machine. The PREVIEW and the INSTALL run the
same check on the archive: a compiled form edited after compiling (or with
another id or version) makes the data not installable and the install
refused; a placeholder that is not a compiled definition is a warning (the
sheet is not offered, the rest of the data goes in). The file's digest is
s3Dgraphy's validator's own error, not repeated here.
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
        if route == "/extensions/repos":
            return 200, {"ok": True, "repositories": _plain(E.repositories()),
                         "online": _plain(E.online_access_setting()), "official_url": E.OFFICIAL_URL}
        if route == "/extensions/available":
            got = E.available(one("repo") or None)
            return 200, {"ok": True, **_plain(got), "updates": _plain(E.updates())}
        if route == "/profiles/installed":
            return 200, {"ok": True, "profiles": _plain(_P().installed())}
        if route == "/extensions/versions":
            return 200, {"ok": True, "versions": _plain(E.versions(one("id")))}
        if route == "/extensions/leftovers":
            return 200, {"ok": True, "leftovers": _plain(E.leftovers())}
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
    # the files the page cannot read by itself: a colour scheme's .emc, a
    # form's compiled definition — inside the package's own folder only; a
    # form's only when verified (MICRO-PL11), with its package's vocabularies
    roots = [p.root for p in active]
    for entry in (out.get("color_schemes") or {}).values():
        doc = _package_json(entry.get("file"), roots)
        if doc is not None:
            entry["doc"] = doc
    for entry in (out.get("forms") or {}).values():
        path = entry.get("compiled_path")
        doc, said = _verify_form(entry, _read_bytes(path, roots), Path(str(path or "")).name)
        entry["verified"] = not said
        if said:
            entry["compiled_problems"] = said
        else:
            entry["compiled_doc"] = doc
            entry["vocabularies"] = _form_vocabularies(doc)
    # MICRO-PL23 (X3) · «questo file usa stat 1.0.0, c'è la 1.1.0»
    try:
        newer = _E().document_updates(body.get("declared") or [])
    except AttributeError:      # an s3dgraphy before X3
        newer = []
    return {"ok": True, "overlay": _plain(out), "missing": _plain(missing),
            "problems": [p.as_dict() for p in problems], "newer": _plain(newer)}


def _st_packages():
    """stratigraph-templates' ``packages`` (the verifier of a compiled form):
    installed, ``STRATIGRAPH_TEMPLATES_SRC``, or the copy vendored beside this
    file (``tools/vendor``, the same as em_sheet's)."""
    import sys
    try:
        from stratigraph_templates import packages  # noqa: F401
    except ImportError:
        for cand in (os.environ.get("STRATIGRAPH_TEMPLATES_SRC"), str(Path(__file__).resolve().parent / "vendor")):
            if cand and (Path(cand) / "stratigraph_templates").is_dir() and cand not in sys.path:
                sys.path.insert(0, cand)
                break
        from stratigraph_templates import packages  # noqa: F401
    if not hasattr(packages, "verify_compiled"):
        raise ImportError("this stratigraph-templates has no packages.verify_compiled (older than MICRO-PL11)")
    return packages


#: verify_compiled's codes that refuse an archive's data; ``not_compiled`` is a
#: warning (the sheet is not offered), ``file_digest`` s3Dgraphy's own error
_FORM_BLOCKS = ("content_digest", "id", "version", "format_version")


def _form_problem(code: str, level: str, form_id: str, en: str, it: str) -> Dict[str, Any]:
    return {"code": f"form_{code}", "level": level, "where": f"forms {form_id}",
            "en": f"forms {form_id}: {en}", "it": f"forms {form_id}: {it}"}


def _read_bytes(path: Any, roots: List[Any]) -> Any:
    """A file of an installed package (≤ 4 MB), only under one of its roots."""
    if not path:
        return None
    try:
        f = Path(str(path)).resolve()
        if not any(r is not None and Path(str(r)).resolve() in f.parents for r in roots):
            return None
        if not f.is_file() or f.stat().st_size > 4 * 1024 * 1024:
            return None
        return f.read_bytes()
    except OSError:
        return None


def _verify_form(entry: Dict[str, Any], raw: Any, file_name: str) -> Tuple[Any, List[Dict[str, Any]]]:
    """``(doc, problems)`` of one form's compiled file; problems as the page
    shows them (``{code, level, where, en, it}``)."""
    import json
    fid = str(entry.get("id") or "?")
    if raw is None:
        return None, [_form_problem("missing", "error", fid, "the compiled file cannot be read",
                                    "il file compilato non si legge")]
    try:
        doc = json.loads(raw.decode("utf-8"))
    except ValueError:
        doc = None
    try:
        S = _st_packages()
    except ImportError as exc:
        return None, [_form_problem("no_verifier", "error", fid, f"not verified: {exc}",
                                    f"non verificata: {exc}")]
    found = S.verify_compiled(doc, {"id": fid, "digest": entry.get("digest")}, raw, file_name)
    return doc, [_form_problem(x["code"], "error", fid, x["en"], x["it"]) for x in found]


def _form_vocabularies(doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The package's own schemes a verified compiled form names, in the shape
    the page's vendored vocabularies have (``vocabolari/<scheme>.json``), with
    their concepts from the vocabulary manager of this machine (the copy its
    owner put there, D-17). A central scheme (no prefix) is the page's own."""
    try:
        from s3dgraphy.authorities import packages as V
    except ImportError:
        return []
    head = doc.get("header") or {}
    langs = [str(x) for x in head.get("languages") or []]
    out = []
    for v in head.get("vocabularies") or []:
        sid, uri = str(v.get("id") or ""), v.get("uri")
        if ":" not in sid or not uri:
            continue
        hits = V.find_installed(str(uri), v.get("version")) or V.find_installed(str(uri))
        idx = V.vocab_index(str(hits[0][1].get("id")), hits[0][1].get("version")) if hits else None
        concepts = []
        for c_uri, c in sorted(((idx or {}).get("concepts") or {}).items()):
            if c_uri == uri:
                continue
            pref = c.get("pref") or {}
            concepts.append({"concept": c_uri, "labels": {k: pref[k] for k in sorted(pref)
                                                           if not langs or k in langs}})
        out.append({"format": 1, "scheme": sid, "authority": v.get("authority"), "status": v.get("status"),
                    "uri": uri, "license": v.get("license"), "languages": langs, "concepts": concepts,
                    "installed": bool(hits),
                    **({"unverified_languages": v["unverified_languages"]} if v.get("unverified_languages") else {})})
    return out


def _archive_form_checks(ref: Any) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """``(errors, warnings)`` of the compiled forms an ARCHIVE carries, before
    anything is written (preview and install)."""
    import json
    P = _P()
    try:
        pkg = P.open_package(ref)
    except Exception:  # noqa: BLE001 — the library's preview/install says why
        return [], []
    errors, warnings = [], []
    for f in ((pkg.profile or {}).get("forms") or []):
        if not isinstance(f, dict) or not f.get("compiled"):
            continue
        rel = pkg.data_file(str(f["compiled"]))
        if not pkg.source.exists(rel):
            continue                       # missing_file: the library's
        raw = pkg.source.read(rel)
        try:
            doc = json.loads(raw.decode("utf-8"))
        except ValueError:
            doc = None
        fid = str(f.get("id") or "?")
        try:
            found = _st_packages().verify_compiled(doc, {"id": fid}, None, Path(str(f["compiled"])).name)
        except ImportError as exc:
            warnings.append(_form_problem("no_verifier", "warning", fid, f"not verified: {exc}",
                                          f"non verificata: {exc}"))
            continue
        for x in found:
            block = x["code"] in _FORM_BLOCKS
            p = _form_problem(x["code"], "error" if block else "warning", fid, x["en"], x["it"])
            (errors if block else warnings).append(p)
    return errors, warnings


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


def _repos(E, route: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """MICRO-PL22 (X2) · the repositories: added, read, installed from. The
    archive of an entry is downloaded and checked against the index's
    ``archive_hash`` by the library before anything opens it; the compiled
    sheets are checked here as for an archive from disk (MICRO-PL11)."""
    def flag(k: str):
        return bool(body[k]) if k in body and body[k] is not None else None

    if route == "/extensions/online":
        E.set_online_access(bool(body.get("on")))
        return 200, {"ok": True, "online": _plain(E.online_access_setting())}
    if route == "/extensions/repos/add":
        return 200, {"ok": True, "repository": _plain(E.add_repository(
            str(body.get("url") or ""), name=body.get("name") or None, token=body.get("token") or None,
            check_on_startup=bool(body.get("check_on_startup"))))}
    if route == "/extensions/repos/update":
        changes = {k: body[k] for k in ("url", "token") if k in body}
        changes.update({k: flag(k) for k in ("enabled", "check_on_startup") if k in body})
        return 200, {"ok": True, "repository": _plain(E.update_repository(str(body.get("name") or ""), **changes))}
    if route == "/extensions/repos/remove":
        return 200, {"ok": True, "removed": bool(E.remove_repository(str(body.get("name") or "")))}
    if route == "/extensions/repos/sync":
        return 200, {"ok": True, "sync": _plain(E.sync(body.get("name") or None, startup=bool(body.get("startup"))))}
    repo, eid, version = str(body.get("repo") or ""), str(body.get("id") or ""), body.get("version") or None
    if route == "/extensions/repos/preview":
        pv = _plain(E.preview_from(repo, eid, version))
        got = E.download(repo, eid, pv.get("version") or version)
        errors, warnings = _archive_form_checks(got["path"])
        if errors and isinstance(pv.get("data"), dict):
            pv["data"]["errors"] = list(pv["data"].get("errors") or []) + errors
            pv["data"]["installable"] = False
        if warnings:
            pv["warnings"] = list(pv.get("warnings") or []) + warnings
        pv["forms_checked"] = True
        return 200, {"ok": True, "preview": pv}
    if route == "/extensions/repos/install":
        parts = str(body.get("parts") or "all")
        if parts not in ("all", "data"):
            return 400, {"ok": False, "error": "parts: all | data"}
        plan = E.plan_install(repo, eid, version)
        for st in plan["steps"]:
            if not st["requested"] and body.get("with_requires") is False:
                continue
            got = E.download(st["repo"], st["id"], st["version"])
            errors, _w = _archive_form_checks(got["path"])
            if errors:
                return 422, {"ok": False, "problems": errors,
                             "error": f"{st['id']}: a compiled sheet of the package is not what it was compiled to: "
                                      "nothing installed"}
        out = E.install_from(repo, eid, version, parts=parts, trust=bool(body.get("trust")),
                             with_requires=body.get("with_requires") is not False,
                             trust_requires=bool(body.get("trust_requires")))
        return 200, {"ok": True, "result": _plain(out)}
    return 404, {"ok": False, "error": "unknown extensions route"}


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
                pv = _plain(E.preview(src.ref))
                errors, warnings = _archive_form_checks(src.ref)
                if errors and isinstance(pv.get("data"), dict):
                    pv["data"]["errors"] = list(pv["data"].get("errors") or []) + errors
                    pv["data"]["installable"] = False
                if warnings:
                    pv["warnings"] = list(pv.get("warnings") or []) + warnings
                pv["forms_checked"] = True
                return 200, {"ok": True, "preview": pv}
            if route == "/extensions/install":
                if src.ref is None:
                    return 400, {"ok": False, "error": "install takes {path} or {zip_b64}"}
                parts = str(body.get("parts") or "all")
                if parts not in ("all", "data"):
                    return 400, {"ok": False, "error": "parts: all | data"}
                errors, _warnings = _archive_form_checks(src.ref)
                if errors:
                    src.close()
                    if src.tmp is None and body.get("zip_b64"):
                        try:
                            os.remove(src.ref)  # the archive kept for later: not installed, not kept
                        except OSError:
                            pass
                    return 422, {"ok": False, "problems": errors,
                                 "error": "a compiled sheet of the package is not what it was compiled to: "
                                          "nothing installed"}
                return 200, {"ok": True, "installed": _plain(E.install(src.ref, parts=parts,
                                                                      trust=bool(body.get("trust"))))}
            ref = src.ref if src.ref is not None else str(body.get("id") or "")
            return 200, {"ok": True, "installed": _plain(E.install_code(ref, trust=bool(body.get("trust"))))}
        if route.startswith("/extensions/repos/") or route == "/extensions/online":
            return _repos(E, route, body)
        # MICRO-PL23 (X3) · updates, versions side by side, clean removal
        if route == "/extensions/updates":
            return 200, {"ok": True, "check": _plain(E.check_updates(read=bool(body.get("read"))))}
        if route == "/extensions/update-all":
            trust = [str(x) for x in (body.get("trust") or []) if x]
            return 200, {"ok": True, "result": _plain(E.update_all(trust=trust, read=bool(body.get("read"))))}
        if route == "/extensions/use":
            return 200, {"ok": True, "used": _plain(E.use_code(str(body.get("id") or ""), str(body.get("version") or ""),
                                                                source=body.get("source") or None,
                                                                trust=bool(body.get("trust"))))}
        if route == "/extensions/prune":
            return 200, {"ok": True, "removed": _plain(E.prune_code(str(body.get("id") or "")))}
        if route == "/extensions/clean":
            return 200, {"ok": True, "clean": _plain(E.clean(dry_run=bool(body.get("dry_run"))))}
        if route == "/profiles/redeclare":
            return 200, {"ok": True, "declared": _plain(E.redeclare(body.get("declared") or [],
                                                                    str(body.get("ref") or ""),
                                                                    str(body.get("version") or "")))}
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
            purge_ud = bool(body.get("purge_user_data"))
            if part == "code" and body.get("version"):
                out = E.remove_version(eid, "code", str(body["version"]), source=body.get("source") or None)
            elif part == "code":
                out = E.remove_code(eid, purge_user_data=purge_ud)
            elif part == "data":
                out = E.remove_data(eid, version=body.get("version") or None, confirm=confirm,
                                    purge_vocabularies=purge, purge_user_data=purge_ud)
            elif part == "all":
                out = E.remove(eid, confirm=confirm, purge_vocabularies=purge, purge_user_data=purge_ud)
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
