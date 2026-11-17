"""YAML in, model out — with the shape errors named as they are met.

A malformed definition must fail saying WHICH field and WHY (SPEC §7).  The
loader therefore refuses structurally impossible input (a field that is not a
mapping, an unknown key) and hands everything else to :mod:`validate`, which
knows about s3Dgraphy and about the sheet.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from .model import (
    RECORDED_IN_UNKNOWN,
    RECORDED_IN_VALUES,
    BlockedOn,
    Cell,
    Field,
    FieldProvenance,
    GraphBinding,
    Identity,
    Option,
    Paragraph,
    Provenance,
    Record,
    Row,
    Sheet,
    Side,
    Standard,
    Template,
    VocabularyRef,
    Anchor,
)


class TemplateSyntaxError(ValueError):
    """The YAML is readable but is not a template."""


_FIELD_KEYS = {
    "id", "labels", "type", "required", "repeatable", "max_len", "help",
    "vocabulary", "graph", "provenance", "note", "options", "recorded_in",
}
_GRAPH_KEYS = {
    "verdict", "node_type", "node_types", "edge_type", "direction", "qualia",
    "property_name", "attaches_to", "target", "note", "blocked_on",
    "accepts", "where", "sub_epoch_of", "find",
}
_ANCHOR_KEYS = {"node_type", "edge_type", "direction", "where", "scope", "match", "note"}
_CELL_KEYS = {"field", "block", "block_labels", "rows", "w", "label", "rotated", "style"}


def _need(doc: Dict[str, Any], key: str, where: str) -> Any:
    if key not in doc:
        raise TemplateSyntaxError(f"{where}: missing required key '{key}'")
    return doc[key]


def _unknown(doc: Dict[str, Any], allowed: set, where: str) -> None:
    extra = sorted(set(doc) - allowed)
    if extra:
        raise TemplateSyntaxError(
            f"{where}: unknown key(s) {extra}; allowed here: {sorted(allowed)}"
        )


def _graph(doc: Any, where: str) -> GraphBinding:
    if not isinstance(doc, dict):
        raise TemplateSyntaxError(f"{where}: 'graph' must be a mapping, got {type(doc).__name__}")
    _unknown(doc, _GRAPH_KEYS, f"{where}.graph")
    blocked = doc.get("blocked_on")
    if blocked is not None and (not isinstance(blocked, dict) or "needs" not in blocked):
        raise TemplateSyntaxError(
            f"{where}.graph.blocked_on: must be a mapping with 'needs' saying what the graph would "
            f"need for this field to land"
        )
    return GraphBinding(
        verdict=str(_need(doc, "verdict", f"{where}.graph")),
        node_type=doc.get("node_type"),
        node_types=doc.get("node_types") or {},
        edge_type=doc.get("edge_type"),
        direction=doc.get("direction"),
        qualia=doc.get("qualia"),
        property_name=doc.get("property_name"),
        attaches_to=doc.get("attaches_to", "self"),
        target=doc.get("target"),
        blocked_on=BlockedOn(needs=str(blocked["needs"]), reported=blocked.get("reported"))
        if isinstance(blocked, dict)
        else None,
        note=doc.get("note"),
        accepts=[str(q) for q in (doc.get("accepts") or [])],
        where={str(k): str(v) for k, v in (doc.get("where") or {}).items()},
        sub_epoch_of=doc.get("sub_epoch_of"),
        find=[str(x) for x in (doc.get("find") or [])],
    )


def _anchors(doc: Any) -> Dict[str, Anchor]:
    if doc is None:
        return {}
    if not isinstance(doc, dict):
        raise TemplateSyntaxError("template.anchors: must be a mapping name → anchor")
    out: Dict[str, Anchor] = {}
    for name, a in doc.items():
        where = f"template.anchors.{name}"
        if not isinstance(a, dict):
            raise TemplateSyntaxError(f"{where}: must be a mapping")
        _unknown(a, _ANCHOR_KEYS, where)
        out[str(name)] = Anchor(
            name=str(name),
            node_type=str(_need(a, "node_type", where)),
            edge_type=str(_need(a, "edge_type", where)),
            direction=str(a.get("direction", "incoming")),
            where={str(k): str(v) for k, v in (a.get("where") or {}).items()},
            scope=str(a.get("scope", "unit")),
            match=a.get("match"),
            note=a.get("note"),
        )
    return out


def _recorded_in(doc: Dict[str, Any], where: str) -> str:
    """Where the field is filled in — absent means `unknown`.

    A VALUE THAT IS NOT ONE OF THE THREE IS AN ERROR, not a silent fall back to
    `unknown`. The two readings are not equivalent: a definition that meant
    `trench` and wrote `Trench` would, under a silent fallback, disappear from
    the phone form with nothing anywhere to say why — and the author would have
    no way to tell that from a field they deliberately left undeclared.
    """
    if "recorded_in" not in doc:
        return RECORDED_IN_UNKNOWN
    value = doc["recorded_in"]
    if value not in RECORDED_IN_VALUES:
        raise TemplateSyntaxError(
            f"{where}: recorded_in={value!r} is not one of "
            f"{list(RECORDED_IN_VALUES)}. Absent means "
            f"{RECORDED_IN_UNKNOWN!r}, which is the value that promises "
            f"nothing; it is not spelled by getting one of the others wrong.")
    return str(value)


def _field(doc: Any, index: int) -> Field:
    where = f"fields[{index}]"
    if not isinstance(doc, dict):
        raise TemplateSyntaxError(f"{where}: a field must be a mapping, got {type(doc).__name__}")
    fid = _need(doc, "id", where)
    where = f"field '{fid}'"
    _unknown(doc, _FIELD_KEYS, where)
    voc = doc.get("vocabulary")
    prov = doc.get("provenance")
    return Field(
        id=str(fid),
        labels=_need(doc, "labels", where) or {},
        type=str(_need(doc, "type", where)),
        required=bool(doc.get("required", False)),
        repeatable=bool(doc.get("repeatable", False)),
        max_len=doc.get("max_len"),
        help=doc.get("help") or {},
        vocabulary=(
            VocabularyRef(
                scheme=str(_need(voc, "scheme", f"{where}.vocabulary")),
                binding=voc.get("binding"),
                level_expr=voc.get("level_expr"),
            )
            if isinstance(voc, dict)
            else None
        ),
        options=[
            Option(value=str(_need(o, "value", f"{where}.options[{i}]")), labels=o.get("labels") or {})
            for i, o in enumerate(doc.get("options") or [])
        ],
        graph=_graph(doc["graph"], where) if "graph" in doc else None,
        provenance=(
            FieldProvenance(enabled=bool(prov.get("enabled", True)), authors=prov.get("authors") or [])
            if isinstance(prov, dict)
            else None
        ),
        recorded_in=_recorded_in(doc, where),
        note=doc.get("note"),
    )


def _cells(docs: Any, where: str) -> List[Cell]:
    out: List[Cell] = []
    if not isinstance(docs, list):
        raise TemplateSyntaxError(f"{where}: 'cells' must be a list")
    for i, c in enumerate(docs):
        cw = f"{where}.cells[{i}]"
        if not isinstance(c, dict):
            raise TemplateSyntaxError(f"{cw}: a cell must be a mapping")
        _unknown(c, _CELL_KEYS, cw)
        out.append(
            Cell(
                field=c.get("field"),
                block=c.get("block"),
                block_labels=c.get("block_labels") or {},
                rows=_rows(c.get("rows") or [], cw),
                w=float(c.get("w", 100.0)),
                label=str(c.get("label", "auto")),
                rotated=bool(c.get("rotated", False)),
                style=c.get("style"),
            )
        )
    return out


def _rows(docs: Any, where: str) -> List[Row]:
    out: List[Row] = []
    if not isinstance(docs, list):
        raise TemplateSyntaxError(f"{where}: 'rows' must be a list")
    for i, r in enumerate(docs):
        rw = f"{where}.rows[{i}]"
        if not isinstance(r, dict):
            raise TemplateSyntaxError(f"{rw}: a row must be a mapping")
        extra = sorted(set(r) - {"h", "cells"})
        if extra:
            raise TemplateSyntaxError(f"{rw}: unknown key(s) {extra}; allowed: ['cells', 'h']")
        out.append(Row(h=float(r.get("h", 8.0)), cells=_cells(r.get("cells") or [], rw)))
    return out


def _sheet(doc: Any) -> Sheet:
    if not isinstance(doc, dict):
        raise TemplateSyntaxError("sheet: must be a mapping (the sheet is the third face)")
    sides_doc = _need(doc, "sides", "sheet")
    sides: List[Side] = []
    for i, s in enumerate(sides_doc):
        sw = f"sheet.sides[{i}]"
        if not isinstance(s, dict):
            raise TemplateSyntaxError(f"{sw}: a side must be a mapping")
        sid = _need(s, "id", sw)
        sides.append(
            Side(id=str(sid), labels=s.get("labels") or {}, rows=_rows(s.get("rows") or [], f"side '{sid}'"))
        )
    return Sheet(page=str(doc.get("page", "A4")), margins_mm=doc.get("margins_mm") or {}, sides=sides)


def parse_template(doc: Dict[str, Any], path: Optional[str] = None) -> Template:
    if not isinstance(doc, dict) or "template" not in doc:
        raise TemplateSyntaxError("a definition file must have a top-level 'template:' mapping")
    t = doc["template"]
    tid = _need(t, "id", "template")
    std = _need(t, "standard", "template")
    ident = t.get("identity") or {}
    prov = t.get("provenance") or {}
    version = t.get("version")
    return Template(
        id=str(tid),
        version="" if version is None else str(version),
        standard=Standard(
            authority=str(_need(std, "authority", "template.standard")),
            code=str(_need(std, "code", "template.standard")),
            version=str(_need(std, "version", "template.standard")),
            kind=str(_need(std, "kind", "template.standard")),
            title=std.get("title") or {},
            source=std.get("source"),
            license=std.get("license"),
            attribution=std.get("attribution"),
            invented=bool(std.get("invented", False)),
        ),
        source_language=str(_need(t, "source_language", "template")),
        languages=list(_need(t, "languages", "template")),
        identity=Identity(
            human_key=list((ident.get("human_key") or {}).get("fields") or []),
            pattern=str((ident.get("human_key") or {}).get("pattern", "")),
            unit_field=str((ident.get("human_key") or {}).get("unit_field", "")),
            uid_policy=str((ident.get("uid") or {}).get("policy", "minted_by_creator")),
            uid_opaque=bool((ident.get("uid") or {}).get("opaque", True)),
            uid_display=str((ident.get("uid") or {}).get("display", "on_request")),
            uid_derive_from_human_key=bool(
                (ident.get("uid") or {}).get("derive_from_human_key", False)
            ),
            deduplication=str(ident.get("deduplication", "by_human_key_in_context")),
        ),
        provenance=Provenance(
            per_field=bool(prov.get("per_field", True)),
            authors=list(prov.get("authors") or ["human", "ai"]),
            states=list(prov.get("states") or ["asserted", "ai_drafted", "human_validated"]),
            clock=str(prov.get("clock", "s3dgraphy_crdt_field_clock")),
        ),
        paragraphs=[
            Paragraph(
                id=str(_need(p, "id", f"paragraphs[{i}]")),
                labels=p.get("labels") or {},
                fields=list(p.get("fields") or []),
            )
            for i, p in enumerate(_need(t, "paragraphs", "template"))
        ],
        fields=[_field(f, i) for i, f in enumerate(_need(t, "fields", "template"))],
        # no `sheet:` = no paper model (SPEC §4): None, never an empty sheet
        sheet=_sheet(t["sheet"]) if "sheet" in t else None,
        vocabularies=list(t.get("vocabularies") or []),
        graph_defaults=t.get("graph") or {},
        notes=t.get("notes") or {},
        anchors=_anchors(t.get("anchors")),
        record_status=t.get("record_status"),
        path=path,
    )


#: the keys of a compiled field (SPEC §9.2) that are not keys of a definition's
#: field: `paragraph` is said by the paragraphs, `provisional` by the schemes
_COMPILED_ONLY_FIELD_KEYS = {"paragraph"}
_VOCABULARY_REF_KEYS = {"scheme", "binding", "level_expr"}


def template_from_compiled(doc: Dict[str, Any]) -> Template:
    """The VISUAL half of a compiled definition (SPEC §9), back into a `Template`.

    For a reader that vendors the compiled form and prints with this package's
    renderer — EMStudio's bridge since 2026-11-17 (MICRO-G-SCHEDE): the A4 it
    prints is the one of the VERSION it vendored, not of whatever YAML a
    checkout holds tonight. The graph binding is not read back (the compiled
    form has the recipe instead): a template built here draws a form and a
    sheet, and is not for `validate` or `build`. Same parser as the YAML, so
    the shape errors are the same."""
    if not isinstance(doc, dict) or not isinstance(doc.get("header"), dict) \
            or not isinstance(doc.get("visual"), dict):
        raise TemplateSyntaxError("a compiled definition has a 'header' and a 'visual' (SPEC §9)")
    head, vis = doc["header"], doc["visual"]
    ident = vis.get("identity") or {}
    fields = []
    for f in vis.get("fields") or []:
        f = {k: v for k, v in f.items() if k not in _COMPILED_ONLY_FIELD_KEYS}
        if isinstance(f.get("vocabulary"), dict):
            f["vocabulary"] = {k: v for k, v in f["vocabulary"].items() if k in _VOCABULARY_REF_KEYS}
        fields.append(f)
    t: Dict[str, Any] = {
        "id": head.get("id"),
        "version": head.get("version"),
        "standard": head.get("standard"),
        "source_language": head.get("source_language"),
        "languages": head.get("languages"),
        "identity": {
            "human_key": {"fields": ident.get("human_key") or [],
                          "pattern": ident.get("pattern", ""),
                          "unit_field": ident.get("unit_field", "")},
            "uid": ident.get("uid") or {},
            "deduplication": ident.get("deduplication", "by_human_key_in_context"),
        },
        "provenance": vis.get("provenance") or {},
        "vocabularies": [v.get("id") for v in head.get("vocabularies") or []
                         if isinstance(v, dict) and not v.get("provisional_for")],
        "paragraphs": vis.get("paragraphs") or [],
        "fields": fields,
        "notes": vis.get("notes") or {},
    }
    if vis.get("sheet") is not None:
        t["sheet"] = vis["sheet"]
    return parse_template({"template": t})


def load_template(path: str | Path) -> Template:
    p = Path(path)
    if p.is_dir():
        p = p / "template.yaml"
    with p.open(encoding="utf-8") as fh:
        doc = yaml.safe_load(fh)
    return parse_template(doc, str(p))


def load_record(path: str | Path) -> Record:
    p = Path(path)
    with p.open(encoding="utf-8") as fh:
        doc = yaml.safe_load(fh)
    if not isinstance(doc, dict) or "record" not in doc:
        raise TemplateSyntaxError(f"{p}: a data file must have a top-level 'record:' mapping")
    r = doc["record"]
    return Record(
        template=str(_need(r, "template", "record")),
        # a record says WHICH VERSION of the definition it followed (SPEC §5):
        # without it, reading it back means guessing the recipe
        template_version=str(_need(r, "template_version", "record")),
        values=r.get("values") or {},
        field_provenance=r.get("field_provenance") or {},
        uid=r.get("uid"),
        status=r.get("status"),
        path=str(p),
    )


def templates_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "templates"


def find_template(name: str) -> Template:
    """Load by template id (a folder under templates/) or by explicit path."""
    p = Path(name)
    if p.exists():
        return load_template(p)
    cand = templates_dir() / name / "template.yaml"
    if cand.is_file():
        return load_template(cand)
    known = sorted(d.name for d in templates_dir().iterdir() if (d / "template.yaml").is_file())
    raise FileNotFoundError(f"no template '{name}'; known templates: {known}")
