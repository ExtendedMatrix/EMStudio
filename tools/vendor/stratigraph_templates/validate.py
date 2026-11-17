"""The validator: a malformed definition fails saying which field and why.

Two kinds of check live here, and the second is the important one:

* SHAPE — every field is placed, widths add up, labels exist in every declared
  language, a controlled term has a vocabulary;
* GRAPH — every node type, edge type and qualia named by a binding is one that
  s3Dgraphy declares today.  This is how "do not add node types to s3Dgraphy"
  enforces itself instead of being a sentence in a document.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Set

from .model import EDGE_DIRECTIONS, FIELD_TYPES, GRAPH_VERDICTS, SEMVER_PATTERN, Template
from .registry import Registry, registry
from .render import STRIP_FONT_PT

UID_POLICIES = ("minted_by_creator",)
DRAFT_VERDICT = "undecided"
SIDE_IDS = ("recto", "verso")

#: page geometry, millimetres — the A4 recto/verso invariant, checked not assumed
PAGE_MM = {"A4": (210.0, 297.0)}
#: room the running head takes at the top of every side
HEAD_ALLOWANCE_MM = 9.0

#: types whose value is a controlled concept and therefore need a vocabulary
TERM_TYPES = ("term", "term_list")


@dataclass
class Problem:
    where: str
    message: str

    def __str__(self) -> str:
        return f"{self.where}: {self.message}"


class ValidationError(ValueError):
    def __init__(self, problems: List[Problem], template_id: str):
        self.problems = problems
        self.template_id = template_id
        body = "\n".join(f"  - {p}" for p in problems)
        super().__init__(f"{template_id}: {len(problems)} problem(s)\n{body}")


def _placed_fields(t: Template) -> Dict[str, List[str]]:
    """field id -> list of 'side/row' positions where it appears."""
    seen: Dict[str, List[str]] = {}

    def walk(rows, where):
        for ri, row in enumerate(rows):
            for ci, cell in enumerate(row.cells):
                pos = f"{where}.row[{ri}].cell[{ci}]"
                if cell.field:
                    seen.setdefault(cell.field, []).append(pos)
                if cell.rows:
                    walk(cell.rows, pos)

    for side in t.sides:
        walk(side.rows, f"sheet[{side.id}]")
    return seen


def _check_widths(t: Template, problems: List[Problem]) -> None:
    def walk(rows, where):
        for ri, row in enumerate(rows):
            total = sum(c.w for c in row.cells)
            if row.cells and total > 100.5:
                problems.append(
                    Problem(
                        f"{where}.row[{ri}]",
                        f"cell widths add up to {total:g}% of the line, which does not fit on the page "
                        f"(cells: {[c.field or c.block or 'spacer' for c in row.cells]})",
                    )
                )
            if row.h <= 0:
                problems.append(Problem(f"{where}.row[{ri}]", f"row height must be > 0 mm, got {row.h}"))
            for ci, cell in enumerate(row.cells):
                if cell.rows:
                    walk(cell.rows, f"{where}.row[{ri}].cell[{ci}]")

    for side in t.sides:
        walk(side.rows, f"sheet[{side.id}]")


def _check_page_fit(t: Template, problems: List[Problem]) -> None:
    """A side whose declared rows are taller than the page is a definition error.

    This is the one place that knows what A4 is, and it is why "fronte-retro" is
    an invariant of the format rather than a hope about the data.
    """
    if t.sheet is None:
        return
    page = PAGE_MM.get(t.sheet.page)
    if page is None:
        problems.append(
            Problem("sheet.page", f"unknown page format '{t.sheet.page}'; known: {sorted(PAGE_MM)}")
        )
        return
    m = t.sheet.margins_mm or {}
    usable = page[1] - float(m.get("top", 12)) - float(m.get("bottom", 12)) - HEAD_ALLOWANCE_MM
    for side in t.sides:
        total = sum(r.h for r in side.rows)
        if total > usable:
            problems.append(
                Problem(
                    f"sheet[{side.id}]",
                    f"the declared rows are {total:g} mm tall but only {usable:g} mm fit on a "
                    f"{t.sheet.page} side (margins {m.get('top', 12)}/{m.get('bottom', 12)} mm plus "
                    f"{HEAD_ALLOWANCE_MM:g} mm of running head): move fields to another side",
                )
            )


#: rough width of a character as a fraction of the font size — enough to tell a
#: label that fits from one that will come out as "QUENZA FISI"
_CHAR_WIDTH_RATIO = 0.55
_PT_TO_MM = 25.4 / 72


def _check_rotated_labels(t: Template, problems: List[Problem]) -> None:
    """A vertical label is limited by the HEIGHT of its block, and a clipped
    label is exactly the failure this repository exists to avoid."""

    def walk(rows, where):
        for ri, row in enumerate(rows):
            for ci, cell in enumerate(row.cells):
                if cell.rows and cell.rotated and cell.label != "none":
                    for lang in t.languages:
                        text = (cell.block_labels or {}).get(lang, "")
                        needed = len(text) * STRIP_FONT_PT * _CHAR_WIDTH_RATIO * _PT_TO_MM
                        if needed > row.h + 0.5:
                            problems.append(
                                Problem(
                                    f"{where}.row[{ri}].cell[{ci}] block '{cell.block}'",
                                    f"the rotated label {text!r} ({lang}) needs about "
                                    f"{needed:.0f} mm of height and the block is {row.h:g} mm: it "
                                    f"would print clipped. Raise the row or drop 'rotated'",
                                )
                            )
                if cell.rows:
                    walk(cell.rows, f"{where}.row[{ri}].cell[{ci}]")

    for side in t.sides:
        walk(side.rows, f"sheet[{side.id}]")


def _check_labels(t: Template, problems: List[Problem]) -> None:
    langs = t.languages
    for f in t.fields:
        for lang in langs:
            if not str((f.labels or {}).get(lang, "")).strip():
                problems.append(
                    Problem(
                        f"field '{f.id}'",
                        f"no label for declared language '{lang}'. Labels live in the definition, "
                        f"never in a generic dictionary: add labels.{lang} or drop '{lang}' from "
                        f"template.languages",
                    )
                )
    for f in t.fields:
        for opt in f.options:
            for lang in langs:
                if not str((opt.labels or {}).get(lang, "")).strip():
                    problems.append(
                        Problem(
                            f"field '{f.id}' option '{opt.value}'",
                            f"no label for declared language '{lang}'",
                        )
                    )
    for p in t.paragraphs:
        for lang in langs:
            if not str((p.labels or {}).get(lang, "")).strip():
                problems.append(
                    Problem(f"paragraph '{p.id}'", f"no label for declared language '{lang}'")
                )
    for lang in langs:
        if not str((t.standard.title or {}).get(lang, "")).strip():
            problems.append(
                Problem("template.standard.title", f"no title for declared language '{lang}'")
            )

    def walk(rows, where):
        for ri, row in enumerate(rows):
            for ci, cell in enumerate(row.cells):
                if cell.block and cell.label != "none":
                    for lang in langs:
                        if not str((cell.block_labels or {}).get(lang, "")).strip():
                            problems.append(
                                Problem(
                                    f"{where}.row[{ri}].cell[{ci}] block '{cell.block}'",
                                    f"no block_labels.{lang}",
                                )
                            )
                if cell.rows:
                    walk(cell.rows, f"{where}.row[{ri}].cell[{ci}]")

    for side in t.sides:
        walk(side.rows, f"sheet[{side.id}]")


def _check_graph(t: Template, reg: Registry, problems: List[Problem], draft: bool = False) -> None:
    for f in t.fields:
        g = f.graph
        where = f"field '{f.id}'"
        if g is None:
            problems.append(
                Problem(
                    where,
                    "no graph binding. Every field must say what it means for the graph, "
                    f"even if the answer is 'none' (verdicts: {list(GRAPH_VERDICTS)})",
                )
            )
            continue
        if g.verdict == DRAFT_VERDICT:
            if draft:
                continue            # counted by draft_undecided(), not a problem of a draft
            problems.append(
                Problem(
                    where,
                    "graph.verdict is 'undecided' — the marker an extracted draft carries. "
                    "A person must decide this binding before the definition can be used",
                )
            )
            continue
        if g.verdict not in GRAPH_VERDICTS:
            problems.append(
                Problem(where, f"unknown graph.verdict '{g.verdict}'; allowed: {list(GRAPH_VERDICTS)}")
            )
            continue

        # per-verdict obligations
        if g.verdict == "property":
            if not (g.qualia or g.property_name):
                problems.append(
                    Problem(where, "graph.verdict 'property' needs graph.qualia or graph.property_name")
                )
        if g.verdict == "node" and not g.node_type:
            problems.append(Problem(where, "graph.verdict 'node' needs graph.node_type"))
        if g.verdict == "node" and not g.edge_type:
            problems.append(
                Problem(where, "graph.verdict 'node' needs graph.edge_type: a node is reached by an edge")
            )
        if g.verdict == "edge":
            if not g.edge_type:
                problems.append(Problem(where, "graph.verdict 'edge' needs graph.edge_type"))
            if g.direction not in EDGE_DIRECTIONS:
                problems.append(
                    Problem(
                        where,
                        f"graph.direction must be one of {list(EDGE_DIRECTIONS)} "
                        f"(got {g.direction!r}): the sheet has both directions, the graph has one",
                    )
                )
        if g.verdict == "node_type" and not g.node_types:
            problems.append(
                Problem(
                    where,
                    "graph.verdict 'node_type' needs graph.node_types: a mapping from the term "
                    "written on the sheet to the s3Dgraphy node type it decides",
                )
            )
        if g.verdict == "vocabulary" and not f.vocabulary:
            problems.append(
                Problem(where, "graph.verdict 'vocabulary' needs a vocabulary reference on the field")
            )
        if g.blocked_on and g.verdict != "none":
            problems.append(
                Problem(
                    where,
                    f"graph.blocked_on with verdict '{g.verdict}': a blocked field lands nowhere in the "
                    "graph yet, so its verdict must be 'none' until the decision is taken",
                )
            )
        if g.verdict == "identity" and f.id not in t.identity.human_key:
            problems.append(
                Problem(
                    where,
                    "graph.verdict 'identity' but the field is not part of identity.human_key.fields "
                    f"({t.identity.human_key})",
                )
            )

        # the hard gate: names must exist in s3Dgraphy
        for nt in [g.node_type] + list(g.node_types.values()):
            if nt and nt not in reg.node_types:
                near = sorted(n for n in reg.node_types if n.lower().startswith(str(nt)[:2].lower()))[:6]
                problems.append(
                    Problem(
                        where,
                        f"graph node type '{nt}' is not declared by s3Dgraphy "
                        f"(node datamodel {reg.node_datamodel_version}). "
                        f"Adding a node type is a decision, not a side effect. Near: {near}",
                    )
                )
        if g.edge_type and g.edge_type not in reg.edge_types:
            near = sorted(e for e in reg.edge_types if str(g.edge_type)[:3].lower() in e.lower())[:6]
            problems.append(
                Problem(
                    where,
                    f"graph edge type '{g.edge_type}' is not declared by s3Dgraphy "
                    f"(connections datamodel {reg.connections_version}). Near: {near}",
                )
            )
        if g.qualia and g.qualia not in reg.qualia:
            near = sorted(q for q in reg.qualia if str(g.qualia)[:4].lower() in q.lower())[:6]
            problems.append(
                Problem(
                    where,
                    f"graph qualia '{g.qualia}' is not declared by s3Dgraphy "
                    f"(qualia types {reg.qualia_version}). Near: {near}",
                )
            )


def _check_version(t: Template, problems: List[Problem]) -> None:
    """The definition has a version of its own, and it is semver.

    `standard.version` is the version of the NORM and says nothing about ours: a
    correction to how a box is read is a new definition of the same norm. A
    record cites the pair (id, version), and a compiled definition is filed
    under it — so a definition without one cannot be compiled, and cannot be
    cited.
    """
    if not t.version:
        problems.append(Problem(
            "template.version",
            "missing: the definition must declare its own version (semver, e.g. \"1.0.0\"). "
            f"standard.version ({t.standard.version!r}) is the version of the norm, not of this "
            "reading of it"))
    elif not re.match(SEMVER_PATTERN, t.version):
        problems.append(Problem(
            "template.version",
            f"{t.version!r} is not semver (MAJOR.MINOR.PATCH, optional -pre-release)"))


def _check_structure(t: Template, problems: List[Problem], known_schemes: Optional[Set[str]]) -> None:
    ids = [f.id for f in t.fields]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        problems.append(Problem("template.fields", f"duplicate field id(s): {dupes}"))

    if t.source_language not in t.languages:
        problems.append(
            Problem(
                "template.languages",
                f"source_language '{t.source_language}' must be among languages {t.languages}",
            )
        )

    for f in t.fields:
        if f.type not in FIELD_TYPES:
            problems.append(
                Problem(f"field '{f.id}'", f"unknown type '{f.type}'; allowed: {list(FIELD_TYPES)}")
            )
        if f.type in TERM_TYPES and not f.vocabulary:
            problems.append(
                Problem(
                    f"field '{f.id}'",
                    f"type '{f.type}' without a vocabulary reference: a controlled term needs the "
                    "vocabulary it is controlled by, otherwise it is a free string pretending",
                )
            )
        if f.type == "choice" and not f.options:
            problems.append(
                Problem(
                    f"field '{f.id}'",
                    "type 'choice' needs 'options': the boxes printed on the paper are part of the "
                    "definition, not of the renderer",
                )
            )
        if f.options and f.type != "choice":
            problems.append(
                Problem(f"field '{f.id}'", f"'options' only makes sense on type 'choice', not '{f.type}'")
            )
        if f.type == "unit_ref_list" and (not f.graph or f.graph.verdict not in ("edge", DRAFT_VERDICT)):
            problems.append(
                Problem(
                    f"field '{f.id}'",
                    "type 'unit_ref_list' points at other units, so its graph verdict must be 'edge'",
                )
            )
        if f.vocabulary:
            if f.vocabulary.scheme not in t.vocabularies:
                problems.append(
                    Problem(
                        f"field '{f.id}'",
                        f"vocabulary scheme '{f.vocabulary.scheme}' is not listed in "
                        f"template.vocabularies {t.vocabularies}",
                    )
                )
            elif known_schemes is not None and f.vocabulary.scheme not in known_schemes:
                problems.append(
                    Problem(
                        f"field '{f.id}'",
                        f"vocabulary scheme '{f.vocabulary.scheme}' has no declaration in "
                        f"vocabularies/schemes/ (known: {sorted(known_schemes)})",
                    )
                )

    # paragraphs partition the fields
    in_par: Dict[str, List[str]] = {}
    for p in t.paragraphs:
        for fid in p.fields:
            if not t.has_field(fid):
                problems.append(Problem(f"paragraph '{p.id}'", f"lists unknown field '{fid}'"))
            in_par.setdefault(fid, []).append(p.id)
    for fid, pars in in_par.items():
        if len(pars) > 1:
            problems.append(Problem(f"field '{fid}'", f"appears in several paragraphs: {pars}"))
    for f in t.fields:
        if f.id not in in_par:
            problems.append(Problem(f"field '{f.id}'", "belongs to no paragraph"))

    # the sheet places every field exactly once — when there is a sheet. A
    # definition that declares none (SPEC §4) has no boxes to count, and the
    # form shows every field by paragraph.
    placed = _placed_fields(t)
    for fid, positions in placed.items():
        if not t.has_field(fid):
            problems.append(Problem("sheet", f"places unknown field '{fid}' at {positions[0]}"))
        elif len(positions) > 1:
            problems.append(
                Problem(f"field '{fid}'", f"placed {len(positions)} times on the sheet: {positions}")
            )
    for f in t.fields:
        if t.sheet is not None and f.id not in placed:
            problems.append(
                Problem(
                    f"field '{f.id}'",
                    "has no box on the sheet: a field nobody can write into is not a field",
                )
            )

    side_ids = [s.id for s in t.sides]
    for sid in side_ids:
        if sid not in SIDE_IDS:
            problems.append(
                Problem("sheet.sides", f"side id '{sid}' is not one of {list(SIDE_IDS)} (A4 recto/verso)")
            )
    if len(set(side_ids)) != len(side_ids):
        problems.append(Problem("sheet.sides", f"duplicate side id(s) in {side_ids}"))
    if t.sheet is not None and not side_ids:
        problems.append(Problem("sheet.sides", "a sheet needs at least a recto"))

    # identity
    if not t.identity.human_key:
        problems.append(
            Problem(
                "template.identity",
                "identity.human_key.fields is empty: the definition must say which fields make the "
                "human identifier for this standard",
            )
        )
    # ── IL DESIGNATORE, e perché è obbligatorio su una chiave composta ──────
    #
    # La chiave umana dice quali campi COMPONGONO il nome («US 3014 — 1
    # (Castel Fontenova)»); non dice quale dei tre sia l'unità e quali siano il contesto
    # che la disambigua. Sono due informazioni diverse, e la seconda serve a
    # chiunque debba rispondere a «di che unità è questa scheda» — il modulo che
    # la disegna, l'adattatore che la consegna a `create_su`.
    #
    # Fino al 2026-09-23 un consumatore prendeva l'ULTIMO campo, ed era vero
    # sulle tre definizioni che esistevano. **Una regolarità osservata su tre
    # casi non è una regola**: sarebbe stata falsa alla quarta scheda, e falsa
    # IN SILENZIO — una chiave con il designatore sbagliato non solleva niente,
    # produce un'etichetta che sembra giusta e un confronto che manca bersaglio.
    #
    # Con UN campo solo non c'è niente da scegliere e dedurlo è lecito. Con due
    # o più, la scheda lo dichiara o non è servibile.
    #
    # (Il testo qui sopra evita di proposito la parola italiana per «scheda
    #  definita»: è anche l'id di un campo della US ICCD, e il cancello di
    #  `test_no_standard_is_named_in_the_implementation` la prende — e ha
    #  ragione a prenderla, perché non può sapere che era prosa.)
    if len(t.identity.human_key) > 1 and not t.identity.unit_field:
        problems.append(Problem(
            "template.identity",
            f"human_key has {len(t.identity.human_key)} fields "
            f"({t.identity.human_key}) and does not declare `unit_field`: with "
            f"a composite key the sheet must say WHICH field designates "
            f"the unit itself — the others are the context that disambiguates "
            f"it. Deducing it (the last one, the first one) is a guess that "
            f"fails silently on the sheet that does it differently."))
    if t.identity.unit_field and t.identity.unit_field not in t.identity.human_key:
        problems.append(Problem(
            "template.identity",
            f"unit_field '{t.identity.unit_field}' is not among "
            f"human_key.fields {t.identity.human_key}: the designator has to be "
            f"one of the fields that spell the name"))

    for fid in t.identity.human_key:
        if not t.has_field(fid):
            problems.append(Problem("template.identity", f"human_key names unknown field '{fid}'"))
    for ph in re.findall(r"\{([a-zA-Z0-9_]+)\}", t.identity.pattern or ""):
        if not t.has_field(ph):
            problems.append(
                Problem("template.identity", f"human_key.pattern uses unknown field '{{{ph}}}'")
            )
    if t.identity.uid_policy not in UID_POLICIES:
        problems.append(
            Problem(
                "template.identity",
                f"uid.policy '{t.identity.uid_policy}' unknown; allowed: {list(UID_POLICIES)}",
            )
        )
    if t.identity.uid_derive_from_human_key:
        problems.append(
            Problem(
                "template.identity",
                "uid.derive_from_human_key: true is refused here. The UID is minted by whoever "
                "creates the unit first; de-duplication between tools happens by spotting a human "
                "identifier already in the context, not by making two tools compute the same "
                "function. (A single tool may derive its own ids to find them again on return; "
                "that is its own business, not a rule of this format.)",
            )
        )


def validate_template(
    t: Template,
    reg: Optional[Registry] = None,
    known_schemes: Optional[Set[str]] = None,
    strict: bool = True,
    draft: bool = False,
) -> List[Problem]:
    """Return the problems; raise ValidationError when strict and there are any.

    ``draft=True`` is for an extracted DRAFT (SPEC §7): every check runs, and
    `verdict: undecided` — the marker a draft carries by construction — is
    counted (`draft_undecided`) instead of refused.  Nothing else is excused.
    """
    reg = reg or registry()
    problems: List[Problem] = []
    _check_version(t, problems)
    _check_structure(t, problems, known_schemes)
    _check_labels(t, problems)
    _check_widths(t, problems)
    _check_page_fit(t, problems)
    _check_rotated_labels(t, problems)
    _check_graph(t, reg, problems, draft=draft)
    if problems and strict:
        raise ValidationError(problems, t.id)
    return problems


def blocked_fields(t: Template) -> List[str]:
    """Fields the sheet carries but the graph cannot take yet — declared, not hidden."""
    return [f.id for f in t.fields if f.graph and f.graph.blocked_on]


def draft_undecided(t: Template) -> List[str]:
    """Fields whose binding a person has still to decide (`verdict: undecided`)."""
    return [f.id for f in t.fields if f.graph and f.graph.verdict == DRAFT_VERDICT]
