"""Vocabularies are referenced, never incorporated — and they are aligned.

Two decisions live here.

1. A definition *refers* to a thesaurus (a SKOS scheme with its own life cycle
   and its own licence), so this repository holds scheme DECLARATIONS, not
   terms.  A scheme may be ``declared`` (the standard prescribes a controlled
   vocabulary, but no machine-readable scheme is published) or ``resolvable``
   (a SKOS file can be read, in the repo or on the machine).

   ``status`` answers *can I resolve it?*; ``origin`` answers *whose is it?*,
   and the two are independent.  An ``external`` scheme is somebody else's: we
   declare it, we resolve it where it lives, and an update arrives from outside.
   An ``originated`` scheme is ours to maintain — it carries its own namespace,
   its own ``version``, and a duty of citation towards whatever scientific
   source it restates.  Originated schemes are the reason ``skos_file`` is no
   longer reserved to fixtures: a module we author lives in the repository and
   is not a fixture.
   A ``declared`` scheme may name a ``provisional`` one: the norm prescribes a
   vocabulary nobody has published, and until it is published an ORIGINATED
   module of ours answers for it.  The field keeps citing the norm's scheme; a
   reader resolves with the provisional one, and the day the authority
   publishes, an alignment is added and the bridge is removed.
2. What lands in the graph is the CONCEPT, and the label is resolved at reading
   time in the requested language.  When the concept has no label in that
   language, an ALIGNMENT (``skos:exactMatch`` / ``closeMatch``) to another
   national vocabulary can supply one — which is the only reason an Italian and
   a Spanish excavator can end up looking at the same thing.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field as dc_field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMES_DIR = REPO_ROOT / "vocabularies" / "schemes"
ALIGNMENTS_DIR = REPO_ROOT / "vocabularies" / "alignments"

#: where the ICCD standards checkout lives on this machine (not in this repo)
ICCD_STANDARDS_ENV = "STRATIGRAPH_ICCD_STANDARDS"
ICCD_STANDARDS_DEFAULT = Path.home() / "Documents" / "GitHub" / "Standard-catalografici"

MATCH_KINDS = ("exactMatch", "closeMatch", "broadMatch", "narrowMatch")


class VocabularyError(ValueError):
    pass


@dataclass
class Scheme:
    id: str
    authority: str
    labels: Dict[str, str]
    status: str                       # declared | resolvable  -- can I resolve it?
    origin: str = "external"          # external | originated   -- whose is it?
    version: Optional[str] = None     # originated schemes carry their own
    uri: Optional[str] = None
    license: Optional[str] = None
    attribution: Optional[str] = None
    binding_thes_id: Optional[str] = None
    fixture: bool = False
    resolve: Dict[str, str] = dc_field(default_factory=dict)
    note: Optional[str] = None
    path: Optional[str] = None
    #: declared schemes only: the originated module that answers for it until
    #: the authority publishes (SPEC §3.2)
    provisional: Optional[str] = None
    #: originated schemes only: languages whose labels nobody has verified yet
    #: (operational now, corrected after review — SPEC §3.3)
    unverified_languages: List[str] = dc_field(default_factory=list)
    #: originated schemes only: who may add terms beside ours — ``project``:
    #: a project keeps its own terms (``local:<slug>``, with who and when),
    #: never in our namespace (em-media-role, 14 Nov 2026). None: nobody.
    extensible: Optional[str] = None

    def skos_file(self) -> Optional[Path]:
        kind = self.resolve.get("kind")
        if kind == "skos_file":
            return REPO_ROOT / self.resolve["path"]
        if kind == "external_skos_file":
            root = Path(os.environ.get(ICCD_STANDARDS_ENV, str(ICCD_STANDARDS_DEFAULT)))
            return root / self.resolve["path"]
        return None


@dataclass
class Alignment:
    source_scheme: str
    source_concept: str
    match: str
    target_scheme: str
    target_concept: str
    status: str = "proposed"          # proposed | verified
    by: Optional[str] = None
    note: Optional[str] = None


@dataclass
class Resolution:
    label: str
    lang: str
    via: str                          # scheme | alignment:<match> | record_label

    def __str__(self) -> str:
        return f"{self.label} [{self.lang} via {self.via}]"


def _read_skos(path: Path) -> Dict[str, Dict[str, str]]:
    """concept URI -> {lang: prefLabel}.  Uses rdflib when available."""
    try:
        from rdflib import Graph
        from rdflib.namespace import SKOS
    except Exception as exc:  # pragma: no cover - rdflib is an optional extra
        raise VocabularyError(f"cannot read {path.name}: rdflib is not installed ({exc})") from exc
    g = Graph()
    fmt = "turtle" if path.suffix in (".ttl", ".turtle") else "xml"
    g.parse(str(path), format=fmt)
    out: Dict[str, Dict[str, str]] = {}
    for s, _, o in g.triples((None, SKOS.prefLabel, None)):
        out.setdefault(str(s), {})[str(o.language or "")] = str(o)
    return out


def _read_idai_valuelist(scheme: "Scheme") -> Dict[str, Dict[str, str]]:
    """concept locator -> {lang: label} for ONE valuelist of iDAI.field, read at
    the commit the scheme names from a local checkout (`git show`, never the
    working tree): the labels are the DAI's, resolved where they live and not
    copied into this repository — as an ICCD SKOS file is read from
    Standard-catalografici."""
    from . import idai_extract as idai

    commit = scheme.resolve.get("commit")
    valuelist = scheme.resolve.get("valuelist")
    if not commit or not valuelist:
        raise VocabularyError(f"scheme '{scheme.id}': resolve.kind idai_field_valuelist needs "
                              f"'commit' and 'valuelist'")
    try:
        src = idai.Source.open(commit=commit)
        values = (src.json(idai.VALUELISTS).get(valuelist) or {}).get("values")
        if values is None:
            raise VocabularyError(f"scheme '{scheme.id}': no valuelist '{valuelist}' at {commit[:7]}")
        out: Dict[str, Dict[str, str]] = {
            idai.value_locator(src.commit, valuelist, v): {} for v in values}
        listing = idai._git(src.repo, "ls-tree", "--name-only", src.commit,
                            f"{idai.CONFIG}/Library/Valuelists/").splitlines()
        langs = sorted(m.group(1) for m in
                       (re.search(r"/Language\.default\.(\w+)\.json$", p) for p in listing) if m)
        for lang in langs:
            for value, label in idai.valuelist_labels(src, valuelist, lang).items():
                out[idai.value_locator(src.commit, valuelist, value)][lang] = label
    except idai.IdaiFieldError as exc:
        raise VocabularyError(
            f"scheme '{scheme.id}' is resolved from an iDAI.field checkout, which is not usable: "
            f"{exc}. Set ${idai.IDAI_FIELD_ENV} if the checkout lives elsewhere") from None
    return out


def _check_provisional(schemes: Dict[str, Scheme]) -> None:
    """SPEC §3.2: only a DECLARED scheme has a provisional one, and it must be a
    module we maintain that can actually be resolved.  A resolvable scheme with
    a stand-in would have two answers; a stand-in that is somebody else's, or
    that cannot be read, is not a stand-in."""
    for s in schemes.values():
        if not s.provisional:
            continue
        where = f"{Path(s.path).name if s.path else s.id}: scheme '{s.id}'"
        if s.status != "declared":
            raise VocabularyError(
                f"{where} is {s.status} and names provisional '{s.provisional}': only a DECLARED "
                f"scheme has a stand-in — a resolvable one already answers for itself"
            )
        target = schemes.get(s.provisional)
        if target is None:
            raise VocabularyError(
                f"{where} names provisional '{s.provisional}', which has no declaration in "
                f"vocabularies/schemes/"
            )
        if target.origin != "originated":
            raise VocabularyError(
                f"{where} names provisional '{s.provisional}', which is {target.origin}: the stand-in "
                f"for a norm nobody published must be a module we maintain (origin: originated)"
            )
        if target.status != "resolvable":
            raise VocabularyError(
                f"{where} names provisional '{s.provisional}', which is {target.status}: a stand-in "
                f"that cannot be resolved answers nothing"
            )
        if target.provisional:
            raise VocabularyError(f"{where}: provisional '{s.provisional}' has a provisional of its own")


class Vocabularies:
    def __init__(self, schemes: Dict[str, Scheme], alignments: List[Alignment]):
        self.schemes = schemes
        self.alignments = alignments
        self._concepts: Dict[str, Dict[str, Dict[str, str]]] = {}

    # -- loading -------------------------------------------------------------
    @classmethod
    def load(cls, schemes_dir: Path = SCHEMES_DIR, alignments_dir: Path = ALIGNMENTS_DIR) -> "Vocabularies":
        schemes: Dict[str, Scheme] = {}
        for p in sorted(schemes_dir.glob("*.yaml")):
            doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
            s = doc.get("scheme")
            if not isinstance(s, dict) or "id" not in s:
                raise VocabularyError(f"{p.name}: a scheme file needs a 'scheme:' mapping with an id")
            if s.get("status") not in ("declared", "resolvable"):
                raise VocabularyError(
                    f"{p.name}: scheme '{s['id']}' status must be 'declared' or 'resolvable', "
                    f"got {s.get('status')!r}"
                )
            origin = s.get("origin", "external")
            if origin not in ("external", "originated"):
                raise VocabularyError(
                    f"{p.name}: scheme '{s['id']}' origin must be 'external' or 'originated', "
                    f"got {origin!r}"
                )
            # A module we maintain must say WHICH version somebody is citing, and
            # under what terms. An external scheme is excused both: they are the
            # other side's to declare.
            if origin == "originated":
                for required in ("version", "license", "uri"):
                    if not s.get(required):
                        raise VocabularyError(
                            f"{p.name}: scheme '{s['id']}' is originated, so it must declare "
                            f"'{required}' — a module we maintain without one is unciteable"
                        )
            unverified = s.get("unverified_languages") or []
            if not isinstance(unverified, list) or not all(isinstance(x, str) and x for x in unverified):
                raise VocabularyError(
                    f"{p.name}: scheme '{s['id']}' unverified_languages must be a list of language codes"
                )
            if unverified and origin != "originated":
                raise VocabularyError(
                    f"{p.name}: scheme '{s['id']}' is {origin}: only a module we maintain says which of "
                    f"its languages nobody has verified — an external scheme answers for its own labels"
                )
            extensible = s.get("extensible")
            if extensible not in (None, "project"):
                raise VocabularyError(
                    f"{p.name}: scheme '{s['id']}' extensible must be 'project' or absent, "
                    f"got {extensible!r}"
                )
            if extensible and origin != "originated":
                raise VocabularyError(
                    f"{p.name}: scheme '{s['id']}' is {origin}: only a module we maintain says "
                    f"who may extend it"
                )
            schemes[s["id"]] = Scheme(
                id=s["id"],
                authority=s.get("authority", "?"),
                labels=s.get("labels") or {},
                status=s["status"],
                origin=origin,
                version=s.get("version"),
                uri=s.get("uri"),
                license=s.get("license"),
                attribution=s.get("attribution"),
                binding_thes_id=s.get("binding_thes_id"),
                fixture=bool(s.get("fixture", False)),
                resolve=s.get("resolve") or {},
                note=s.get("note"),
                path=str(p),
                provisional=s.get("provisional"),
                unverified_languages=list(unverified),
                extensible=extensible,
            )
        _check_provisional(schemes)
        alignments: List[Alignment] = []
        for p in sorted(alignments_dir.glob("*.yaml")):
            doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
            for i, a in enumerate(doc.get("alignments") or []):
                where = f"{p.name}.alignments[{i}]"
                match = a.get("match")
                if match not in MATCH_KINDS:
                    raise VocabularyError(f"{where}: match must be one of {list(MATCH_KINDS)}, got {match!r}")
                for side in ("source", "target"):
                    if not isinstance(a.get(side), dict) or "scheme" not in a[side] or "concept" not in a[side]:
                        raise VocabularyError(f"{where}: '{side}' needs 'scheme' and 'concept'")
                    if a[side]["scheme"] not in schemes:
                        raise VocabularyError(
                            f"{where}: {side} scheme '{a[side]['scheme']}' has no declaration in "
                            f"{schemes_dir.name}/ (known: {sorted(schemes)})"
                        )
                alignments.append(
                    Alignment(
                        source_scheme=a["source"]["scheme"],
                        source_concept=a["source"]["concept"],
                        match=match,
                        target_scheme=a["target"]["scheme"],
                        target_concept=a["target"]["concept"],
                        status=a.get("status", "proposed"),
                        by=a.get("by"),
                        note=a.get("note"),
                    )
                )
        return cls(schemes, alignments)

    # -- resolution ----------------------------------------------------------
    def concepts(self, scheme_id: str) -> Dict[str, Dict[str, str]]:
        if scheme_id in self._concepts:
            return self._concepts[scheme_id]
        scheme = self.schemes.get(scheme_id)
        if scheme is None:
            raise VocabularyError(f"unknown vocabulary scheme '{scheme_id}'")
        if scheme.status == "resolvable" and scheme.resolve.get("kind") == "idai_field_valuelist":
            self._concepts[scheme_id] = _read_idai_valuelist(scheme)
            return self._concepts[scheme_id]
        path = scheme.skos_file()
        if scheme.status != "resolvable" or path is None:
            self._concepts[scheme_id] = {}
            return {}
        if not path.is_file():
            raise VocabularyError(
                f"scheme '{scheme_id}' is declared resolvable but its SKOS file is missing: {path}. "
                f"Set ${ICCD_STANDARDS_ENV} if the standards checkout lives elsewhere"
            )
        self._concepts[scheme_id] = _read_skos(path)
        return self._concepts[scheme_id]

    def effective(self, scheme_id: str) -> str:
        """The scheme whose concepts answer for ``scheme_id``: itself, or its
        provisional stand-in while the norm's scheme is only declared."""
        scheme = self.schemes.get(scheme_id)
        if scheme is None:
            raise VocabularyError(f"unknown vocabulary scheme '{scheme_id}'")
        return scheme.provisional or scheme_id

    def _aligned(self, scheme_id: str, concept: str) -> List[Tuple[str, str, str]]:
        """(match, other_scheme, other_concept) for both directions."""
        out = []
        for a in self.alignments:
            if a.source_scheme == scheme_id and a.source_concept == concept:
                out.append((a.match, a.target_scheme, a.target_concept))
            elif a.target_scheme == scheme_id and a.target_concept == concept:
                out.append((a.match, a.source_scheme, a.source_concept))
        # exactMatch first: it is the only one that means "the same concept"
        return sorted(out, key=lambda x: MATCH_KINDS.index(x[0]))

    def resolve(
        self,
        scheme_id: str,
        concept: str,
        lang: str,
        record_label: Optional[str] = None,
    ) -> Resolution:
        """Label for a concept in ``lang``: own scheme, then its provisional
        stand-in, then alignments, then the label the record carried (declared
        as such)."""
        own = self.concepts(scheme_id).get(concept, {})
        if own.get(lang):
            return Resolution(own[lang], lang, "scheme")
        stand_in = self.effective(scheme_id)
        if stand_in != scheme_id:
            said = self.concepts(stand_in).get(concept, {})
            if said.get(lang):
                return Resolution(said[lang], lang, f"provisional:{stand_in}")
            scheme_id = stand_in          # its alignments are the ones that apply
        for match, other_scheme, other_concept in self._aligned(scheme_id, concept):
            other = self.concepts(other_scheme).get(other_concept, {})
            if other.get(lang):
                return Resolution(other[lang], lang, f"alignment:{match}:{other_scheme}")
        if record_label:
            return Resolution(record_label, lang, "record_label")
        raise VocabularyError(
            f"no label in '{lang}' for concept {concept} of scheme '{scheme_id}', and no alignment "
            f"supplies one. Declare an alignment in vocabularies/alignments/ or carry a label in the record"
        )

    def scheme_ids(self) -> set:
        return set(self.schemes)

    def missing_checkouts(self) -> List[str]:
        """One plain sentence per external checkout that the resolvable schemes
        read and this machine does not have (README, «Le due dipendenze fuori dal
        repository»). `validate` and `build` do not need them — the compiled
        form names schemes, it does not copy their labels — so this is a notice,
        not a failure; `vocab`, `form`/`print` with labels and some tests do."""
        from . import idai_extract as idai

        out: List[str] = []
        iccd = [s for s in self.schemes.values()
                if s.status == "resolvable" and s.resolve.get("kind") == "external_skos_file"]
        if iccd:
            root = Path(os.environ.get(ICCD_STANDARDS_ENV, str(ICCD_STANDARDS_DEFAULT)))
            if not root.is_dir():
                out.append(
                    f"no ICCD standards checkout at {root}: {len(iccd)} scheme(s) "
                    f"({', '.join(sorted(s.id for s in iccd)[:3])}…) will not resolve their labels. "
                    f"Clone it there (README) or set ${ICCD_STANDARDS_ENV}.")
        commits = sorted({s.resolve.get("commit") for s in self.schemes.values()
                          if s.status == "resolvable"
                          and s.resolve.get("kind") == "idai_field_valuelist"} - {None})
        if commits:
            repo = idai.default_repo()
            n = sum(1 for s in self.schemes.values()
                    if s.resolve.get("kind") == "idai_field_valuelist")
            if not (repo / ".git").exists():
                out.append(
                    f"no iDAI.field checkout at {repo}: {n} idai-field-* scheme(s) will not "
                    f"resolve their labels. Clone {idai.IDAI_FIELD_GITHUB} there (it must hold "
                    f"commit {', '.join(c[:7] for c in commits)}; README) or set "
                    f"${idai.IDAI_FIELD_ENV}.")
            else:
                for c in commits:
                    try:
                        idai._git(repo, "cat-file", "-e", f"{c}^{{commit}}")
                    except idai.IdaiFieldError:
                        out.append(
                            f"the iDAI.field checkout at {repo} does not hold commit {c[:7]}, "
                            f"which the idai-field-* schemes are read at: `git -C {repo} fetch "
                            f"origin {c}`.")
        return out
