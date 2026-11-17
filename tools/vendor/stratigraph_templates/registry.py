"""What s3Dgraphy actually declares — read, never guessed, and read ONCE.

A graph binding may only name a node type, an edge type or a qualia that
s3Dgraphy has.  This module is the single place that knows them, and it refuses
to answer when it cannot read them: a permissive fallback would turn "do not add
node types" from a rule into a wish.

**One source, not two.**  Until 2026-10-18 `validate` read the s3Dgraphy WORKING
TREE when it could and the snapshot when it could not, so the same definition
was checked against 1.6.19 on one machine and 1.6.13 on another, and nothing
said which (audit B8).  Now the SNAPSHOT is the source for every command that
checks or compiles — it is committed, so it is the same for everybody — and the
working tree, when it is on this machine, is consulted for one question only:
*is the snapshot still what s3Dgraphy says?*  If not, the command says so and
stops.  It does not pick one of the two by itself: regenerating the snapshot
(`registry-snapshot`) is a decision, and it leaves a diff somebody can read.

**Names come from s3Dgraphy, and so do their spellings.**  The snapshot keeps,
beyond the sets of names the validator needs, what a compiled definition needs
to say what to PRODUCE: the em.json spelling of each node class
(`DocumentNode` → `document`), each edge type's reverse and symmetry, the RDF
predicates the exporter emits for it (so two names that are one property in
`em.ttl` — `bonded_to` / `is_bonded_to` — can be seen to be one), and the closed
set of CRDT operations.  All of it is read from s3Dgraphy's own configuration
and code, none of it is written here by hand.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field as dc_field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_PATH = REPO_ROOT / "registry" / "s3dgraphy-snapshot.json"

#: Bumped when the SHAPE of the snapshot file changes. 1 = names only (≤ 2026-09);
#: 2 = names + spellings + edge semantics + RDF + operations;
#: 3 = + the NODE ELEMENTS (`properties.<x>` declared as an object, e.g.
#: `StratigraphicNode.properties.definition`) and each edge's `spelling_of`;
#: 4 = + `datamodel`, s3Dgraphy's datamodel FINGERPRINT (`api.datamodel_fingerprint`:
#: one digest over the six datamodel JSONs, a version and a digest per file);
#: 5 = + each edge's `rdf.extension_when`, the GUARD of its extension predicate
#: (`mapping.extension_when`: the classes the RDF subject and object must have
#: for the extension to go out beside the core predicate);
#: 6 = + each edge's `rdf.inverse_extension` and `rdf.inverse_extension_when`
#: (`mapping.inverse_extension`: a predicate that restates the edge FROM THE
#: OTHER SIDE, `<target> pred <source>`, and the classes the logical source and
#: target must have — is_part_of → em:reconstructsFrom, SF → VSF).
SNAPSHOT_FORMAT = 6
#: Formats `from_snapshot` reads. 3, 4 and 5 are read so that a stale snapshot is
#: compared and its divergence NAMED; `registry-snapshot` always writes
#: SNAPSHOT_FORMAT.
_READABLE_FORMATS = (3, 4, 5, SNAPSHOT_FORMAT)

#: Where to look for a source checkout of s3Dgraphy, in order.
_CANDIDATE_SRC = (
    os.environ.get("STRATIGRAPH_S3DGRAPHY_SRC"),
    str(REPO_ROOT.parent / "s3Dgraphy" / "src"),
)

#: The datamodel files this repository READS, under the fingerprint's names
#: (`from_s3dgraphy` opens exactly these, and em.ttl, which is compared term by
#: term). A snapshot is compared with the working tree on these alone, and never
#: on the one digest, which also covers the visual rules and the translations:
#: a change there is none of a sheet's business (D4 of the MICRO-DERIVA).
DATAMODEL_READS = ("nodes", "node_registry", "connections", "qualia")

#: Keys of the snapshot that say WHERE it came from, not WHAT s3Dgraphy declares.
#: Two snapshots that differ only here agree.
_PROVENANCE_KEYS = ("snapshot_format", "source", "taken_from", "taken_on")


class RegistryUnavailable(RuntimeError):
    """Neither s3Dgraphy nor a snapshot could be read."""


class RegistryDivergence(RuntimeError):
    """The committed snapshot and the s3Dgraphy on this machine disagree."""

    def __init__(self, differences: List[str], snapshot: "Registry", live: "Registry"):
        self.differences = differences
        self.snapshot = snapshot
        self.live = live
        body = "\n".join(f"    {d}" for d in differences)
        super().__init__(
            "the registry snapshot and the s3Dgraphy working tree disagree, and this command "
            "will not choose between them:\n"
            f"  snapshot: {snapshot.versions_line()}  [{snapshot.source}]\n"
            f"  working tree: {live.versions_line()}  [{live.source}]\n"
            f"{body}\n"
            "  Regenerate the snapshot (`stratigraph-templates registry-snapshot`) if the working "
            "tree is what you mean to compile against — the diff of registry/ is then the record "
            "of that decision — or run with --snapshot to check against the snapshot alone, "
            "declared."
        )


@dataclass
class Registry:
    node_types: Set[str] = dc_field(default_factory=set)
    edge_types: Set[str] = dc_field(default_factory=set)
    qualia: Set[str] = dc_field(default_factory=set)
    mapping_targets: Dict[str, str] = dc_field(default_factory=dict)  # em_type -> cidoc class
    #: Python class -> em.json `node_type` (from node_registry.generated.json)
    node_classes: Dict[str, str] = dc_field(default_factory=dict)
    #: edge type -> {reverse, symmetric, type_tag, rdf: {...}, deprecated}
    edges: Dict[str, Dict[str, Any]] = dc_field(default_factory=dict)
    #: the closed set of CRDT operations (s3dgraphy.crdt.OPS)
    operations: List[str] = dc_field(default_factory=list)
    #: em: IRIs declared as subjects in em.ttl
    em_ttl_terms: Set[str] = dc_field(default_factory=set)
    #: element -> {declared_on, applies_to, em_json, value, rdf}: the fields of
    #: a NODE (like name and description) that the node datamodel declares
    #: beyond them — not qualia, not PropertyNodes. Read, never listed here.
    node_elements: Dict[str, Dict[str, Any]] = dc_field(default_factory=dict)
    #: s3Dgraphy's datamodel fingerprint, WHOLE: {digest, versions, digests,
    #: files}. Recorded in the snapshot and in every sheet's header as it is;
    #: compared only on DATAMODEL_READS (`read_datamodel`).
    datamodel: Dict[str, Any] = dc_field(default_factory=dict)
    node_datamodel_version: str = ""
    connections_version: str = ""
    qualia_version: str = ""
    em_ttl_version: str = ""
    s3dgraphy_version: str = ""
    source: str = ""
    taken_from: Dict[str, Any] = dc_field(default_factory=dict)
    taken_on: str = ""
    #: Set by `registry()`: whether the working tree was compared, and the answer.
    live_check: str = ""

    # -- provenance line, printed by every command that validates -------------
    def versions_line(self) -> str:
        return (f"nodes {self.node_datamodel_version} · connections {self.connections_version} · "
                f"qualia {self.qualia_version} · em.ttl {self.em_ttl_version or '?'}")

    def provenance(self) -> str:
        line = (
            f"s3Dgraphy registry: {self.versions_line()} "
            f"({len(self.node_types)} node types, {len(self.edge_types)} edge types, "
            f"{len(self.qualia)} qualia, {len(self.mapping_targets)} mapping targets) "
            f"[source: {self.source}]"
        )
        if self.live_check:
            line += f"\n  working tree: {self.live_check}"
        return line

    # -- the em.json spelling of a node type named in a definition -------------
    def em_node_type(self, name: str) -> Tuple[str, str]:
        """`(class, em.json node_type)` for a name a definition uses.

        Definitions name node types two ways, because the datamodel does: by
        CLASS (`DocumentNode`, `LocationNodeGroup`) and by the stratigraphic
        CODE the class carries (`US`, `USN`).  An operation carries the code —
        `node_type` in an em.json payload is `document`, not `DocumentNode` —
        so the compiled form states both, resolved here from
        `node_registry.generated.json`, never from a table in this repository.
        """
        if name in self.node_classes:
            return name, self.node_classes[name]
        for cls, code in sorted(self.node_classes.items()):
            if code == name:
                return cls, code
        raise KeyError(name)

    def read_datamodel(self) -> Dict[str, Any]:
        """The part of the fingerprint this repository reads: `{versions,
        digests, files}` for DATAMODEL_READS, with no one digest. `files` is
        `{name: {digest, version}}`; a fingerprint written before s3Dgraphy
        dev25 (whose `files` named only the file) is read from its `versions`
        and `digests`, which are the same facts."""
        versions = dict(self.datamodel.get("versions") or {})
        digests = dict(self.datamodel.get("digests") or {})
        names = [n for n in DATAMODEL_READS if n in versions]
        return {
            "versions": {n: versions[n] for n in names},
            "digests": {n: digests[n] for n in names if n in digests},
            "files": {n: {"digest": digests.get(n), "version": versions[n]} for n in names},
        }

    def content(self) -> Dict[str, Any]:
        """Everything s3Dgraphy declares, without where it was read from.

        `datamodel` here is what this repository READS of it
        (`read_datamodel`): two registries that differ only in the visual
        rules or the translations agree."""
        return {
            "node_datamodel_version": self.node_datamodel_version,
            "connections_version": self.connections_version,
            "qualia_version": self.qualia_version,
            "em_ttl_version": self.em_ttl_version,
            "s3dgraphy_version": self.s3dgraphy_version,
            "operations": list(self.operations),
            "node_types": sorted(self.node_types),
            "node_classes": dict(sorted(self.node_classes.items())),
            "edge_types": sorted(self.edge_types),
            "edges": {k: self.edges[k] for k in sorted(self.edges)},
            "qualia": sorted(self.qualia),
            "mapping_targets": dict(sorted(self.mapping_targets.items())),
            "em_ttl_terms": sorted(self.em_ttl_terms),
            "node_elements": {k: self.node_elements[k] for k in sorted(self.node_elements)},
            "datamodel": self.read_datamodel(),
        }

    def to_json(self) -> Dict[str, Any]:
        return {
            "snapshot_format": SNAPSHOT_FORMAT,
            "source": self.source,
            "taken_from": self.taken_from,
            "taken_on": self.taken_on,
            **self.content(),
            # the WHOLE fingerprint is recorded; only DATAMODEL_READS is compared
            "datamodel": self.datamodel,
        }

    def header(self) -> Dict[str, Any]:
        """What a compiled definition says it was checked against.

        One version per datamodel, under the fingerprint's names (`nodes`,
        `node_registry`, `connections`, `visual_rules`, `qualia`,
        `translations`), and the fingerprint's `digest` beside them; and, since
        s3Dgraphy dev25, `files`: the digest and version of each file this
        repository READS (DATAMODEL_READS), which is what the sheet was built
        from. A reader compares its own s3Dgraphy on `files` and can name what
        moved; the one `digest` says «the same datamodel, all of it».
        """
        versions = dict(self.datamodel.get("versions") or {})
        read = self.read_datamodel()
        return {
            "nodes": self.node_datamodel_version,
            "node_registry": versions.get("node_registry"),
            "connections": self.connections_version,
            "visual_rules": versions.get("visual_rules"),
            "qualia": self.qualia_version,
            "translations": versions.get("translations"),
            "digest": self.datamodel.get("digest"),
            "files": read["files"],
            "em_ttl": self.em_ttl_version,
            "s3dgraphy": self.s3dgraphy_version,
            "taken_from": {k: self.taken_from.get(k) for k in ("git_commit", "git_dirty")},
            "snapshot": "registry/s3dgraphy-snapshot.json",
        }


# ── reading s3Dgraphy ────────────────────────────────────────────────────────

def _config_dir_from_import() -> Optional[Path]:
    """Import s3dgraphy (installed, or from a sibling checkout) and locate its JSON_config."""
    for cand in _CANDIDATE_SRC:
        if cand and Path(cand).is_dir() and str(cand) not in sys.path:
            sys.path.insert(0, str(cand))
    try:
        import s3dgraphy  # noqa: WPS433
    except Exception:
        return None
    cfg = Path(s3dgraphy.__file__).resolve().parent / "JSON_config"
    return cfg if cfg.is_dir() else None


def _collect_node_types(node_datamodel: Dict) -> Set[str]:
    out: Set[str] = set()
    for section, entries in node_datamodel.items():
        if not isinstance(entries, dict) or section == "referenced_ontology_versions":
            continue
        for name, body in entries.items():
            if name.startswith("_"):
                continue
            out.add(name)
            if isinstance(body, dict):
                subs = body.get("subtypes")
                if isinstance(subs, dict):
                    out.update(k for k in subs if not k.startswith("_"))
    return out


def _collect_qualia(qualia_doc: Dict) -> Set[str]:
    out: Set[str] = set()
    for cat in qualia_doc.get("qualia_categories", []):
        for sub in (cat.get("subcategories") or {}).values():
            for q in sub.get("qualia", []):
                if isinstance(q, dict) and q.get("id"):
                    out.add(q["id"])
    return out


def _node_elements(node_datamodel: Dict, classes: Dict) -> Dict[str, Dict[str, Any]]:
    """The node elements the datamodel declares, and the classes that carry each.

    A node element is a `properties.<name>` entry given as an object with
    `kind: node_element` (a plain string there — `"name": "P1_is_identified_by"`
    — is a mapping note). It is
    declared ONCE, on the class that introduces it, and inherited: `applies_to`
    is that class and every class whose `parent` chain in
    `node_registry.generated.json` reaches it — the same answer s3Dgraphy's
    `_Datamodel.get_node_element_rule` gives by walking the MRO.
    """
    parents = {cls: body.get("parent") for cls, body in (classes.get("node_types") or {}).items()
               if isinstance(body, dict)}

    def descends(cls: str, root: str) -> bool:
        seen = set()
        while cls and cls not in seen:
            if cls == root:
                return True
            seen.add(cls)
            cls = parents.get(cls)
        return False

    def entries():
        for section, block in node_datamodel.items():
            if not isinstance(block, dict) or section == "referenced_ontology_versions":
                continue
            for key, body in block.items():
                if key.startswith("_") or not isinstance(body, dict):
                    continue
                yield body.get("class") or key, body
                for skey, sub in (body.get("subtypes") or {}).items():
                    if not skey.startswith("_") and isinstance(sub, dict):
                        yield sub.get("class") or skey, sub

    out: Dict[str, Dict[str, Any]] = {}
    for cls, body in entries():
        for name, rule in (body.get("properties") or {}).items():
            # only what the datamodel itself calls a node element: other object
            # entries (FunctionalUnitNodeGroup.geometry_type_ref) are notes
            if not isinstance(rule, dict) or rule.get("kind") != "node_element" or name in out:
                continue
            out[name] = {
                "declared_on": cls,
                "applies_to": sorted(c for c in parents if descends(c, cls)),
                "kind": rule.get("kind"),
                "em_json": rule.get("em_json"),
                "value": rule.get("value"),
                "rdf": rule.get("rdf"),
            }
    return out


def _git(cfg: Path, *args: str) -> Optional[str]:
    try:
        out = subprocess.run(["git", "-C", str(cfg), *args], capture_output=True, text=True,
                             timeout=10, check=True)
    except Exception:
        return None
    return out.stdout.strip()


def _edges(conns: Dict, cfg: Path) -> Dict[str, Dict[str, Any]]:
    """Per edge type: what the datamodel says and what the RDF exporter emits.

    The RDF part is read by asking `s3dgraphy.exporter.rdf_exporter` — the code
    that actually writes the triples — rather than re-reading `mapping` here: the
    exporter resolves the AP11 family through its type tag, strips legacy
    parenthesised labels, and inverts subject and object where the datamodel
    says `rdf_subject: target`, and a second reading of the same JSON would be a
    second opinion about all three.

    The extension's GUARD is read the same way (`get_extension_condition`):
    `has_documentation` goes out as P70i always and as em:derivedFromDocument
    only from a USD, and an extension kept without its guard would tell the
    recipe to write a predicate outside its domain.
    """
    from s3dgraphy.exporter import rdf_exporter as rx  # needs rdflib

    dm = rx._Datamodel(cfg)
    out: Dict[str, Dict[str, Any]] = {}
    for name, entry in (conns.get("edge_types") or {}).items():
        if name.startswith("_") or not isinstance(entry, dict):
            continue
        reverse = (entry.get("reverse") or {}).get("name") if entry.get("reverse") else None
        predicate, extension, type_tag, deprecated = dm.get_edge_mapping(name)
        _canon, inverted = dm.resolve_edge_direction(name)
        sub = rx.AP11_SUBPROPS.get(type_tag) if type_tag else None
        when = _extension_condition(dm, name) if extension else None
        inverse, inverse_when = _inverse_extension(dm, name)
        out[name] = {
            "reverse": reverse,
            "symmetric": reverse is None,
            "type_tag": type_tag,
            "deprecated": bool(deprecated),
            "spelling_of": entry.get("spelling_of"),
            "rdf": {
                "predicate": str(predicate) if predicate else None,
                "subproperty": str(sub) if sub else None,
                "extension": str(extension) if extension else None,
                "extension_when": when,
                "inverse_extension": inverse,
                "inverse_extension_when": inverse_when,
                "subject": "target" if inverted else "source",
            },
        }
    return out


def _inverse_extension(dm: Any, name: str
                       ) -> Tuple[Optional[str], Optional[Dict[str, List[str]]]]:
    """`(predicate, {source_node_class, target_node_class})` of an edge's
    `inverse_extension` as the exporter writes it (`<target> pred <source>`,
    guarded on the LOGICAL ends), or `(None, None)`. Read from s3Dgraphy's
    exporter (`get_inverse_extension`, dev25 on), like the extension."""
    if not hasattr(dm, "get_inverse_extension"):
        return None, None
    found = dm.get_inverse_extension(name)
    if not found:
        return None, None
    predicate, when = found
    return str(predicate), ({k: sorted(v) for k, v in sorted(when.items())} if when else None)


def _extension_condition(dm: Any, name: str) -> Optional[Dict[str, List[str]]]:
    """`{source_node_class, target_node_class}` of an edge's extension, as the
    exporter honours it, or None when the extension is unconditional. The
    classes are of the LOGICAL ends — the RDF subject and object, which are the
    em.json target and source when `rdf.subject` is `target`."""
    if hasattr(dm, "get_extension_condition"):  # s3Dgraphy 1.6.0.dev26 on
        when = dm.get_extension_condition(name)
    else:  # the target guard alone, as dev25 had it
        targets = dm.get_extension_guard(name) if hasattr(dm, "get_extension_guard") else None
        when = {"target_node_class": targets} if targets else None
    return {k: sorted(v) for k, v in sorted(when.items())} if when else None


def _em_ttl(cfg: Path) -> Tuple[Set[str], str]:
    """The em: terms `em.ttl` declares, and its owl:versionInfo."""
    import rdflib

    g = rdflib.Graph()
    g.parse(str(cfg / "em.ttl"), format="turtle")
    em = "https://w3id.org/em/ontology#"
    terms = {str(s) for s in g.subjects() if str(s).startswith(em)}
    version = ""
    for v in g.objects(rdflib.URIRef("https://w3id.org/em/ontology"), rdflib.OWL.versionInfo):
        version = str(v)
    return terms, version


def _shown(path: Path) -> str:
    """A path as it reads on ANY machine: relative to this repository's parent when
    it is a sibling checkout, absolute otherwise. The snapshot is committed, and a
    home directory in it would be a statement about one laptop."""
    try:
        return str(Path("..") / path.resolve().relative_to(REPO_ROOT.parent.resolve()))
    except ValueError:
        return str(path)


def from_s3dgraphy() -> Registry:
    cfg = _config_dir_from_import()
    if cfg is None:
        raise RegistryUnavailable("s3dgraphy is not importable")
    try:
        import s3dgraphy
        from s3dgraphy.crdt import OPS

        nodes = json.loads((cfg / "s3Dgraphy_node_datamodel.json").read_text(encoding="utf-8"))
        conns = json.loads((cfg / "s3Dgraphy_connections_datamodel.json").read_text(encoding="utf-8"))
        qual = json.loads((cfg / "em_qualia_types.json").read_text(encoding="utf-8"))
        classes = json.loads((cfg / "node_registry.generated.json").read_text(encoding="utf-8"))
        edges = _edges(conns, cfg)
        ttl_terms, ttl_version = _em_ttl(cfg)
    except ImportError as exc:
        raise RegistryUnavailable(f"s3dgraphy is importable but cannot be read fully ({exc})") from exc
    try:
        # the fingerprint is s3Dgraphy's to compute: its canonical form is shared
        # with EMStudio and StratiField, and a second implementation here would
        # be the first to drift
        from s3dgraphy.datamodel import datamodel_fingerprint
    except ImportError as exc:
        raise RegistryUnavailable(
            f"this s3dgraphy has no datamodel fingerprint ({exc}); it needs "
            "s3dgraphy.datamodel (s3Dgraphy after 1.6.0.dev24)") from exc
    fingerprint = datamodel_fingerprint(str(cfg))

    targets: Dict[str, str] = {}
    try:
        from s3dgraphy.mappings.authoring import target_groups

        for group in target_groups():
            for t in group.get("targets", []):
                targets[t["em_type"]] = t.get("cidoc", "")
    except Exception:  # the curated catalogue is a bonus, not a precondition
        targets = {}

    commit = _git(cfg, "rev-parse", "HEAD")
    dirty = _git(cfg, "status", "--porcelain", "--", ".")
    return Registry(
        node_types=_collect_node_types(nodes),
        edge_types={k for k in conns.get("edge_types", {}) if not k.startswith("_")},
        qualia=_collect_qualia(qual),
        mapping_targets=targets,
        node_classes={cls: str(body.get("node_type"))
                      for cls, body in (classes.get("node_types") or {}).items()
                      if isinstance(body, dict) and body.get("node_type")},
        edges=edges,
        operations=list(OPS),
        em_ttl_terms=ttl_terms,
        node_elements=_node_elements(nodes, classes),
        datamodel=fingerprint,
        node_datamodel_version=str(nodes.get("s3Dgraphy_data_model_version", "?")),
        connections_version=str(conns.get("s3Dgraphy_connections_model_version", "?")),
        qualia_version=str((qual.get("metadata") or {}).get("version", "?")),
        em_ttl_version=ttl_version,
        s3dgraphy_version=str(getattr(s3dgraphy, "__version__", "?")),
        source=f"s3dgraphy working tree at {_shown(cfg)}",
        taken_from={
            "config_dir": _shown(cfg),
            "git_commit": commit,
            "git_dirty": bool(dirty) if dirty is not None else None,
        },
    )


def from_snapshot(path: Optional[Path] = None) -> Registry:
    # resolved at call time on purpose: a default argument would freeze the path
    # at import and make the "nothing readable" case silently succeed
    path = path or SNAPSHOT_PATH
    if not path.is_file():
        raise RegistryUnavailable(f"no registry snapshot at {path}")
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("snapshot_format") not in _READABLE_FORMATS:
        raise RegistryUnavailable(
            f"{path.name} is snapshot format {doc.get('snapshot_format', 1)}, this code reads "
            f"{SNAPSHOT_FORMAT}: regenerate it with `registry-snapshot`")
    taken = doc.get("taken_from") or {}
    return Registry(
        node_types=set(doc["node_types"]),
        edge_types=set(doc["edge_types"]),
        qualia=set(doc["qualia"]),
        mapping_targets=dict(doc.get("mapping_targets", {})),
        node_classes=dict(doc.get("node_classes", {})),
        edges=dict(doc.get("edges", {})),
        operations=list(doc.get("operations", [])),
        em_ttl_terms=set(doc.get("em_ttl_terms", [])),
        node_elements=dict(doc.get("node_elements", {})),
        # a format-3 snapshot predates the fingerprint: it is still READ, so that
        # the divergence names the datamodels that moved instead of only saying
        # "regenerate"; its three versions are all it can be compared on
        datamodel=dict(doc.get("datamodel") or {"versions": {
            "nodes": doc.get("node_datamodel_version"),
            "connections": doc.get("connections_version"),
            "qualia": doc.get("qualia_version")}}),
        node_datamodel_version=doc.get("node_datamodel_version", "?"),
        connections_version=doc.get("connections_version", "?"),
        qualia_version=doc.get("qualia_version", "?"),
        em_ttl_version=doc.get("em_ttl_version", ""),
        s3dgraphy_version=doc.get("s3dgraphy_version", ""),
        source=(f"snapshot {path.name} (taken {doc.get('taken_on', '?')} from s3Dgraphy "
                f"{str(taken.get('git_commit') or '?')[:10]}"
                f"{' +dirty' if taken.get('git_dirty') else ''})"),
        taken_from=taken,
        taken_on=doc.get("taken_on", ""),
    )


def differences(a: Registry, b: Registry) -> List[str]:
    """What `b` declares differently from `a`, one line per key, readable."""
    ca, cb = a.content(), b.content()
    out: List[str] = []
    for key in ca:
        va, vb = ca[key], cb.get(key)
        if va == vb:
            continue
        if key == "datamodel":  # said FIRST: it names which datamodel moved
            out[:0] = [f"datamodel: {line}" for line in datamodel_differences(vb or {}, va or {})]
            continue
        if isinstance(va, list) and isinstance(vb, list):
            plus = sorted(set(map(str, vb)) - set(map(str, va)))
            minus = sorted(set(map(str, va)) - set(map(str, vb)))
            bits = []
            if plus:
                bits.append(f"+{len(plus)} {plus[:6]}{' …' if len(plus) > 6 else ''}")
            if minus:
                bits.append(f"-{len(minus)} {minus[:6]}{' …' if len(minus) > 6 else ''}")
            out.append(f"{key}: {' '.join(bits) or 'order'}")
        elif isinstance(va, dict) and isinstance(vb, dict):
            changed = sorted(k for k in set(va) | set(vb) if va.get(k) != vb.get(k))
            out.append(f"{key}: {len(changed)} entr{'y' if len(changed) == 1 else 'ies'} differ "
                       f"{changed[:6]}{' …' if len(changed) > 6 else ''}")
        else:
            out.append(f"{key}: {va!r} → {vb!r}")
    return out


def datamodel_differences(expected: Dict[str, Any], found: Dict[str, Any]) -> List[str]:
    """Which datamodel `found` (the copy: the snapshot, a sheet's header) holds
    differently from `expected` (s3Dgraphy), one named line each — `nodes 1.6.12
    vs 1.6.17`, the copy's version first. The same wording as s3Dgraphy's
    `api.datamodel_differences`, restated because a sheet is read where
    s3Dgraphy may be absent."""
    lines: List[str] = []
    want_v, have_v = expected.get("versions") or {}, found.get("versions") or {}
    want_d, have_d = expected.get("digests") or {}, found.get("digests") or {}
    for name, want in want_v.items():
        if name not in have_v:
            lines.append(f"{name}: absent in the copy ({want} in the source)")
        elif have_v[name] != want:
            lines.append(f"{name} {have_v[name]} vs {want}")
        elif name in want_d and name in have_d and want_d[name] != have_d[name]:
            lines.append(f"{name} {want}: same version, different content")
    if not lines and expected.get("digest") and not found.get("digest"):
        lines.append("the copy carries no digest (taken before the fingerprint existed)")
    elif not lines and expected.get("digest") != found.get("digest"):
        lines.append(f"digest {found.get('digest')} vs {expected.get('digest')}")
    return lines


def registry(check_live: bool = True, prefer_snapshot: Optional[bool] = None) -> Registry:
    """THE registry: the committed snapshot, checked against the working tree.

    * the snapshot is the source — for `validate`, `build`, `print`, `form`;
    * if s3Dgraphy can be read on this machine and `check_live`, the two are
      compared on CONTENT (not on commit: a commit that changes nothing
      declared is not a divergence) and a difference raises RegistryDivergence;
    * with `check_live=False` (the `--snapshot` flag) the working tree is not
      consulted, and the provenance line says so.

    Raises RegistryUnavailable when there is no snapshot. There is no mode in
    which the working tree silently replaces it, and none in which every node
    type is accepted.
    """
    if prefer_snapshot is not None:  # the pre-2026-10-18 keyword, same meaning
        check_live = not prefer_snapshot
    try:
        snap = from_snapshot()
    except RegistryUnavailable as exc:
        raise RegistryUnavailable(
            f"cannot read what s3Dgraphy declares, so no graph binding can be checked: {exc}. "
            "The snapshot is the one source; `registry-snapshot` writes it from a checkout."
        ) from exc
    if not check_live:
        snap.live_check = "not consulted (--snapshot)"
        return snap
    try:
        live = from_s3dgraphy()
    except RegistryUnavailable as exc:
        snap.live_check = f"not readable here ({exc}); snapshot used as committed"
        return snap
    diff = differences(snap, live)
    if diff:
        raise RegistryDivergence(diff, snap, live)
    commit = str(live.taken_from.get("git_commit") or "?")[:10]
    snap.live_check = f"agrees with the snapshot (s3Dgraphy {commit}{' +dirty' if live.taken_from.get('git_dirty') else ''})"
    return snap


def write_snapshot(path: Optional[Path] = None) -> Registry:
    path = path or SNAPSHOT_PATH
    reg = from_s3dgraphy()
    reg.taken_on = _dt.date.today().isoformat()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(reg.to_json(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return reg
