"""The sheets of a community package: compiled against the core AND the package.

MICRO-PL11-SCHEDE-DEI-PACCHETTI, row W8 of the extensions plan (E.D., 18 Nov
2026). A community package (an EM Profile 0.2, SPEC-pacchetto §8) does not
invent a sheet format: it carries a definition of THIS repository
(``forms/<id>/template.yaml``) and its compiled form (``forms/<id>/<ver>.json``)
with the digest of the file in its manifest (``forms[].digest``, W-3).

A package's definition binds its boxes to the package's own qualia
(``<prefix>:<quale>``) and to the vocabularies it carries. The registry
snapshot knows the core alone, so a package's sheet could not be checked nor
compiled. Here the registry is the **snapshot of the core + the overlay of the
packages named** (SPEC-pacchetto §8: «snapshot del nucleo + sovrapposizione dei
pacchetti dichiarati»):

* the snapshot stays what it is — the core, committed, compared with the
  s3Dgraphy working tree — and is never written with a package in it: a
  package is versioned on its own, and the overlay is read from the package
  every time it is compiled (`Registry.with_packages`);
* the package is read and checked by **s3Dgraphy** (`s3dgraphy.profiles`), the
  one reader every EM tool uses — a second reading here would be a second
  opinion. Its errors refuse the compilation, except the two the compilation is
  about to repair: the compiled file missing, its digest no longer the
  manifest's;
* the package's carried vocabularies (``[[data.vocabularies]]``, or 0.1's
  ``qualia_vocabularies[].path``) become **scheme declarations** for this run,
  ``<prefix>:<slug>`` (the last segment of the scheme's IRI): originated, resolvable from
  the ``.ttl`` inside the package, never copied into ``vocabularies/``. The
  prefix keeps them apart from the central schemes, which carry none.

The compiled header says which packages it was compiled with
(``header.packages``: name, iri, prefix, version). Like ``header.datamodel`` it
is outside the definition's digest: it says what the sheet was checked against,
not what the sheet is.

**The manifest's digest.** This module writes the compiled file and stamps
``forms[].digest`` (the sha256 of the file's bytes, what s3Dgraphy's validator
checks) in the FOLDER's ``profile.json`` — that key and nothing else, the rest
of the file byte for byte. ``python -m s3dgraphy.extensions build`` (W19)
stamps the same digest in the ZIP it builds and never writes the folder, so
without this the source of a package (em-profiles, a curator's folder) would
not validate after its sheet is compiled.

**Verifying a compiled form** (`verify_compiled`) is what a reader does at
installation and at reading (EMStudio's bridge, PIANO W8): the file is a
compiled definition of this repository, its ``header.digest`` is the digest of
its content, its id and version are the ones the manifest names.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from dataclasses import dataclass, field as dc_field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .registry import _CANDIDATE_SRC, Registry
from .vocab import Scheme, Vocabularies

#: the errors of s3Dgraphy's validator that compiling a package REPAIRS
_REPAIRED_BY_COMPILING = ("form_digest",)


class PackageError(RuntimeError):
    """The package cannot be read, or does not validate."""


def _profiles():
    """`s3dgraphy.profiles`, from the installed s3Dgraphy or a sibling checkout."""
    for cand in _CANDIDATE_SRC:
        if cand and Path(cand).is_dir() and str(cand) not in sys.path:
            sys.path.insert(0, str(cand))
    try:
        from s3dgraphy import profiles  # noqa: WPS433
    except ImportError as exc:
        raise PackageError(
            f"a community package is read by s3Dgraphy (s3dgraphy.profiles, 1.6.0.dev110 on), "
            f"which is not importable here ({exc}): install it, or set STRATIGRAPH_S3DGRAPHY_SRC "
            f"to a checkout's src/") from None
    return profiles


def _slug(iri: str) -> str:
    """The last segment of a scheme IRI: «…/vocab/<slug>/» → <slug>."""
    tail = [p for p in re.split(r"[/#]", str(iri or "")) if p]
    return re.sub(r"[^a-z0-9-]+", "-", (tail[-1] if tail else "").lower()).strip("-") or "scheme"


@dataclass
class CommunityPackage:
    """A package as this repository needs it: its identity, the folder of its
    data, its forms, the schemes it carries, its overlay."""

    name: str
    iri: str
    prefix: str
    version: str
    data_dir: Path
    manifest: Dict[str, Any]
    profile: Any                      # s3dgraphy.profiles.Profile
    schemes: Dict[str, Scheme] = dc_field(default_factory=dict)
    #: the warnings of s3Dgraphy's validator, and the errors compiling repairs
    notes: List[str] = dc_field(default_factory=list)

    def header_entry(self) -> Dict[str, str]:
        return {"name": self.name, "iri": self.iri, "prefix": self.prefix, "version": self.version}

    def forms(self) -> List[Dict[str, Any]]:
        return [dict(f) for f in (self.manifest.get("forms") or []) if isinstance(f, dict)]

    def label(self) -> str:
        return f"{self.name} {self.version}"


def _carried(pkg: Any, manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The vocabularies the archive carries: the envelope's ``[[data.vocabularies]]``,
    else 0.1's ``qualia_vocabularies[].path`` (W19 moves them; a package not yet
    built still says them there)."""
    out = [dict(v) for v in pkg.carried_vocabularies() if v.get("path") and v.get("scheme")]
    if out:
        return out
    return [{"path": q["path"], "scheme": q.get("scheme"), "version": q.get("version"),
             "license": manifest.get("license")}
            for q in (manifest.get("qualia_vocabularies") or [])
            if isinstance(q, dict) and q.get("path") and q.get("scheme")]


def _schemes(manifest: Dict[str, Any], carried: List[Dict[str, Any]], data_dir: Path) -> Dict[str, Scheme]:
    prefix = str(manifest.get("prefix") or "")
    labels_of = {str(q.get("scheme")): q.get("label") for q in (manifest.get("qualia_vocabularies") or [])
                 if isinstance(q, dict)}
    title = manifest.get("title")
    authority = (title.get("en") or next(iter(title.values()), "")) if isinstance(title, dict) else str(title or "")
    out: Dict[str, Scheme] = {}
    for v in carried:
        sid = f"{prefix}:{_slug(v['scheme'])}"
        labels = labels_of.get(str(v["scheme"]))
        out[sid] = Scheme(
            id=sid, authority=authority or str(manifest.get("name") or ""),
            labels=dict(labels) if isinstance(labels, dict) else {},
            status="resolvable", origin="originated", version=v.get("version"),
            uri=str(v["scheme"]), license=str(v.get("license") or manifest.get("license") or "") or None,
            resolve={"kind": "skos_file", "path": str(v["path"])},
            path=str(data_dir / "profile.json"), base=data_dir,
            unverified_languages=[str(x) for x in (manifest.get("unverified_languages") or [])],
        )
    return out


def open_community_package(path: Any) -> CommunityPackage:
    """Read and check a package FOLDER (``em-extension.toml`` or ``profile.json``).

    s3Dgraphy validates it; an error refuses it — except a compiled form whose
    digest is no longer the manifest's, which is what compiling repairs (said
    in ``notes``). A zip is refused: compiling writes inside the package.
    """
    P = _profiles()
    folder = Path(path)
    if not folder.is_dir():
        raise PackageError(f"{path}: a package to compile is a FOLDER (compiling writes its forms); "
                           f"unpack a zip first")
    try:
        pkg = P.open_package(folder)
    except P.ProfileError as exc:
        raise PackageError(str(exc)) from None
    if not pkg.has_data or pkg.profile is None:
        raise PackageError(f"{folder}: no [data] section and no profile.json: a package without data "
                           f"has no sheet to compile")
    report = P.validate(pkg)
    notes = [f"warning: {p}" for p in report.warnings]
    # a compiled file the manifest names and the package does not have yet is
    # what compiling writes; s3Dgraphy says it «missing_file»
    compiled = {pkg.data_file(str(f["compiled"])) for f in (pkg.profile.get("forms") or [])
                if isinstance(f, dict) and f.get("compiled")}
    still = []
    for p in report.errors:
        if p.code in _REPAIRED_BY_COMPILING:
            notes.append(f"repaired by compiling: {p}")
        elif p.code == "missing_file" and str(p.params.get("path")) in compiled:
            notes.append(f"written by compiling: {p}")
        else:
            still.append(str(p))
    if still:
        raise PackageError(f"{folder.name}: the package does not validate (s3dgraphy.profiles), "
                           f"so its sheets are not compiled:\n" + "\n".join(f"    {s}" for s in still))
    data_dir = (folder / pkg.data_root) if pkg.data_root else folder
    manifest = dict(pkg.profile)
    profile = P.Profile.from_folder(data_dir)
    return CommunityPackage(
        name=str(manifest.get("name") or ""), iri=str(manifest.get("iri") or ""),
        prefix=str(manifest.get("prefix") or ""), version=str(manifest.get("version") or ""),
        data_dir=data_dir, manifest=manifest, profile=profile,
        schemes=_schemes(manifest, _carried(pkg, manifest), data_dir), notes=notes)


# ── the registry and the vocabularies, with the packages ─────────────────────

def overlay_qualia(packages: Sequence[CommunityPackage]) -> Dict[str, str]:
    """``{quale id: package}`` for what the packages add to the core's qualia —
    their own and those their vocabularies control — read through
    s3Dgraphy's overlay (`ProfileOverlay.qualia_types`), as every tool reads them."""
    P = _profiles()
    ov = P.ProfileOverlay([p.profile for p in packages])
    for prob in ov.problems:  # two packages, one prefix
        raise PackageError(f"the packages cannot be compiled together: {prob}")
    by_prefix = {p.prefix: p for p in packages}
    out: Dict[str, str] = {}
    for qid, entry in ov.qualia_types().items():
        if entry.get("origin") == P.ORIGIN_CORE:
            continue
        owner = by_prefix.get(str(qid).split(":", 1)[0])
        out[str(qid)] = owner.label() if owner else str(entry.get("origin") or "")
    return out


def registry_with(reg: Registry, packages: Sequence[CommunityPackage]) -> Registry:
    """The registry + the packages' qualia (a copy: the snapshot is not touched)."""
    return reg.with_packages(overlay_qualia(packages), [p.header_entry() for p in packages])


def vocabularies_with(vocab: Vocabularies, packages: Sequence[CommunityPackage]) -> Vocabularies:
    """The central schemes + the schemes the packages carry (`<prefix>:<slug>`)."""
    schemes = dict(vocab.schemes)
    for p in packages:
        for sid, s in p.schemes.items():
            if sid in schemes:
                raise PackageError(f"scheme '{sid}' is carried by two packages compiled together")
            schemes[sid] = s
    return Vocabularies(schemes, list(vocab.alignments))


# ── compiling a package's forms ─────────────────────────────────────────────

def _version_named(file_name: str) -> str:
    """«0.1.0.json» → «0.1.0»: a compiled form is named after its version."""
    return file_name[:-len(".json")] if file_name.endswith(".json") else file_name


def sha256_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(Path(path).read_bytes()).hexdigest()


@dataclass
class FormResult:
    id: str
    path: Optional[Path] = None
    what: str = ""                    # written | unchanged | rewritten (same digest) | replaced …
    digest: str = ""                  # the definition's (header.digest)
    file_digest: str = ""             # the file's bytes: what forms[].digest must say
    manifest_digest: str = ""         # what forms[].digest says now
    error: str = ""

    @property
    def stamped(self) -> bool:
        return bool(self.file_digest) and self.file_digest == self.manifest_digest


def build_package(path: Any, reg: Registry, vocab: Vocabularies, with_packages: Sequence[Any] = (),
                  write: bool = True) -> Tuple[CommunityPackage, List[FormResult], Registry]:
    """Compile every ``forms[]`` of a package into the file its manifest names.

    The registry is ``reg`` (the snapshot) + the overlay of this package and of
    ``with_packages`` (folders of the packages it requires: phase 1 resolves
    nothing by itself, SPEC-pacchetto §16.4). ``write=False`` checks and
    compiles without writing (``--check``). One form refused does not stop
    the others. Returns the package, one result per form, and the registry
    used (the snapshot + the overlay).
    """
    from .compile import CompileError, PublishedVersionChanged, compile_template, dumps
    from .loader import load_template
    from .model import MissingLabel
    from .validate import ValidationError

    pkg = open_community_package(path)
    others = [open_community_package(p) for p in with_packages]
    allp = [pkg, *others]
    oreg = registry_with(reg, allp)
    ovoc = vocabularies_with(vocab, allp)
    results: List[FormResult] = []
    for f in pkg.forms():
        res = FormResult(id=str(f.get("id") or "?"), manifest_digest=str(f.get("digest") or ""))
        results.append(res)
        if not f.get("source") or not f.get("compiled"):
            res.error = "forms[] needs both 'source' and 'compiled' (W-3: the package ships both)"
            continue
        src = pkg.data_dir / str(f["source"])
        out = pkg.data_dir / str(f["compiled"])
        try:
            t = load_template(src)
            if t.id != res.id:
                raise PackageError(f"the definition's id is '{t.id}', the manifest's forms[] says '{res.id}'")
            if _version_named(out.name) != t.version:
                raise PackageError(f"forms[].compiled is {f['compiled']}, the definition is version "
                                   f"{t.version}: name the compiled file {t.version}.json in the manifest")
            doc = compile_template(t, oreg, ovoc)
            res.digest = doc["header"]["digest"]
            res.what = _place(doc, out, write, PublishedVersionChanged, dumps)
            res.path = out
            res.file_digest = ("sha256:" + hashlib.sha256(dumps(doc).encode("utf-8")).hexdigest())
            if write and not res.stamped:
                _stamp(pkg, res.id, res.manifest_digest, res.file_digest)
                res.what += f"; forms[].digest stamped in {pkg.data_dir.name}/profile.json"
                res.manifest_digest = res.file_digest
        except (ValidationError, CompileError, PublishedVersionChanged, PackageError, MissingLabel,
                FileNotFoundError) as exc:
            res.error = str(exc)
        except Exception as exc:  # noqa: BLE001 — a YAML error says where; the others go on
            res.error = f"{type(exc).__name__}: {exc}"
    return pkg, results, oreg


def _stamp(pkg: CommunityPackage, form_id: str, old: str, new: str) -> None:
    """``forms[<form_id>].digest = new`` in the folder's profile.json. The old
    value is replaced where it stands (the file keeps its layout); a form with
    no digest yet makes the file rewritten as JSON (indent 2, as em-profiles)."""
    path = pkg.data_dir / "profile.json"
    text = path.read_text(encoding="utf-8")
    if old and text.count(f'"{old}"') == 1:
        text = text.replace(f'"{old}"', f'"{new}"')
    else:
        doc = json.loads(text)
        for f in doc.get("forms") or []:
            if isinstance(f, dict) and str(f.get("id")) == form_id:
                f["digest"] = new
        text = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    path.write_text(text, encoding="utf-8")
    for f in pkg.manifest.get("forms") or []:
        if isinstance(f, dict) and str(f.get("id")) == form_id:
            f["digest"] = new


def _place(doc: Dict[str, Any], out: Path, write: bool, changed_exc, dumps) -> str:
    """`write_compiled`'s rule, at the path the manifest names: a published
    version does not change. A file there that is NOT a compiled definition
    (a placeholder of 0.2's first examples) is replaced, and said."""
    text = dumps(doc)
    what = "written"
    if out.is_file():
        try:
            old = json.loads(out.read_text(encoding="utf-8"))
        except ValueError:
            old = None
        head = old.get("header") if isinstance(old, dict) else None
        if not isinstance(head, dict) or old.get("format") != doc["format"]:
            what = "replaced (the file there was not a compiled definition)"
        elif head.get("digest") != doc["header"]["digest"]:
            raise changed_exc(
                f"{doc['header']['id']} {doc['header']['version']} is already in {out} with digest "
                f"{head.get('digest')}, and the definition now compiles to {doc['header']['digest']}. "
                f"A published version does not change: raise template.version (and forms[].compiled)")
        else:
            what = "unchanged" if out.read_text(encoding="utf-8") == text else "rewritten (same digest)"
    if write:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
    elif what == "written":
        what = "would be written"
    return what


# ── verifying a compiled form (a reader: at installation, at reading) ────────

#: code → (English, Italian): what `verify_compiled` says, in the two languages
#: of the window that shows it (EMStudio's «Estensioni»)
VERIFY_MESSAGES: Dict[str, Tuple[str, str]] = {
    "not_compiled": ("the compiled file is not a definition compiled by stratigraph-templates",
                     "il file non è un compilato di stratigraph-templates"),
    "format_version": ("compiled format {got}, this reader reads {want}",
                       "formato della compilata {got}, questo lettore legge il {want}"),
    "content_digest": ("its content is not what it was compiled to (header.digest {want}, the content {got}): "
                       "it was edited after compiling",
                       "il contenuto non è quello compilato (header.digest {want}, il contenuto {got}): "
                       "è stato modificato dopo la compilazione"),
    "file_digest": ("the file's digest is {got}, the manifest says {want}",
                    "il digest del file è {got}, il manifesto dice {want}"),
    "id": ("its id is {got}, the manifest's forms[] says {want}",
           "il suo id è {got}, il forms[] del manifesto dice {want}"),
    "version": ("its version is {got}, the file is named {want}",
                "la sua versione è {got}, il file si chiama {want}"),
}


def verify_compiled(doc: Any, form: Optional[Dict[str, Any]] = None, raw: Optional[bytes] = None,
                    file_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """The problems of a compiled form a package carries; ``[]`` = verified.

    ``doc`` is the parsed file; ``form`` the manifest's ``forms[]`` entry
    (id, digest); ``raw`` the file's bytes (to check ``forms[].digest``);
    ``file_name`` its name (``<version>.json``). Each problem is
    ``{code, en, it, params}``.
    """
    from .compile import FORMAT, FORMAT_VERSION, digest_of

    out: List[Dict[str, Any]] = []

    def say(code: str, **params: Any) -> None:
        en, it = VERIFY_MESSAGES[code]
        out.append({"code": code, "en": en.format(**params), "it": it.format(**params), "params": params})

    if form and form.get("digest") and raw is not None:
        got = "sha256:" + hashlib.sha256(raw).hexdigest()
        if got != form["digest"]:
            say("file_digest", got=got[:19] + "…", want=str(form["digest"])[:19] + "…")
    head = doc.get("header") if isinstance(doc, dict) else None
    if not isinstance(head, dict) or doc.get("format") != FORMAT or not head.get("id"):
        say("not_compiled")
        return out
    if str(doc.get("format_version")) != FORMAT_VERSION:
        say("format_version", got=doc.get("format_version"), want=FORMAT_VERSION)
        return out
    try:
        got = digest_of(doc)
    except Exception:  # noqa: BLE001 — a header that is not a mapping
        got = "?"
    if got != head.get("digest"):
        say("content_digest", got=got[:19] + "…", want=str(head.get("digest"))[:19] + "…")
    if form and form.get("id") and head.get("id") != form["id"]:
        say("id", got=head.get("id"), want=form["id"])
    if file_name and _version_named(Path(file_name).name) != str(head.get("version")):
        say("version", got=head.get("version"), want=file_name)
    return out


def scheme_file(vocab: Vocabularies, scheme_id: str, langs: Sequence[str]) -> Dict[str, Any]:
    """One scheme in the shape EMStudio's and StratiField's syncs vendor
    (`vocabolari/<scheme>.json`): its concepts with their labels in ``langs``,
    resolved by this repository's resolver (own scheme, alignments)."""
    from .vocab import VocabularyError

    scheme = vocab.schemes[scheme_id]
    concepts = []
    for uri in sorted(vocab.concepts(scheme_id)):
        if scheme.uri and uri == scheme.uri:
            continue
        said = {}
        for lang in sorted(langs):
            try:
                said[lang] = vocab.resolve(scheme_id, uri, lang).label
            except VocabularyError:
                pass
        concepts.append({"concept": uri, "labels": said})
    doc = {"format": 1, "scheme": scheme_id, "authority": scheme.authority, "status": scheme.status,
           "uri": scheme.uri, "license": scheme.license, "attribution": scheme.attribution,
           "labels": scheme.labels, "languages": sorted(langs), "concepts": concepts}
    if scheme.unverified_languages:
        doc["unverified_languages"] = sorted(scheme.unverified_languages)
    return doc


__all__ = ["PackageError", "CommunityPackage", "open_community_package", "overlay_qualia", "registry_with",
           "vocabularies_with", "build_package", "FormResult", "verify_compiled", "VERIFY_MESSAGES",
           "scheme_file", "sha256_file"]
