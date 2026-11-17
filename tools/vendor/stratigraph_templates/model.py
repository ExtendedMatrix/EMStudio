"""The in-memory shape of a sheet definition.

Three faces, one object: ``fields``/``paragraphs`` are the SUBSTANCE, every
field's ``graph`` is the BINDING, ``sheet`` is the SHEET.  Nothing here knows
about ICCD, Italian, or archaeology: that knowledge is in the YAML.
"""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, List, Optional


class MissingLabel(KeyError):
    """A label was asked for in a language the definition does not declare.

    Raised — never silently substituted.  A sheet whose labels come from a
    generic dictionary prints 'Notifica' where the norm says 'FLOTTAZIONE';
    this exception is the reason that cannot happen here.
    """


FIELD_TYPES = (
    "identifier",
    "text",
    "longtext",
    "integer",
    "decimal",
    "date",
    "term",
    "term_list",
    "choice",
    "checkbox",
    "unit_ref_list",
    "record_ref_list",
    "resource_ref_list",
    "person_ref",
    "actor_ref",
    "epoch_ref",
    "activity_ref",
    "quantity_list",
)

#: The verdicts of the sieve: what a field MEANS for the graph.
GRAPH_VERDICTS = (
    "identity",   # part of the human identifier of the unit
    "property",   # a property (qualia) of a node that already exists
    "node_type",  # the discriminant that decides the node type
    "node",       # a node of its own, reached by an edge
    "edge",       # a relation towards another unit
    "vocabulary", # a controlled term (the CONCEPT lands in the graph)
    "none",       # presentation only: the sheet says it, the graph does not
)

EDGE_DIRECTIONS = ("outgoing", "incoming")


def label_of(labels: Dict[str, str], lang: str, what: str) -> str:
    """Resolve a label in ``lang`` or refuse.

    There is deliberately NO fallback to another language: rendering a sheet in
    a language its definition does not declare is an error, not a degraded mode.
    """
    if not isinstance(labels, dict) or lang not in labels or not str(labels.get(lang, "")).strip():
        raise MissingLabel(
            f"{what}: no label declared for language '{lang}' "
            f"(declared: {sorted(labels) if isinstance(labels, dict) else 'none'})"
        )
    return labels[lang]


@dataclass
class Standard:
    authority: str
    code: str
    version: str
    kind: str                    # field_model | catalogue_record
    title: Dict[str, str] = dc_field(default_factory=dict)
    source: Optional[str] = None
    license: Optional[str] = None
    attribution: Optional[str] = None
    invented: bool = False       # True = demo definition, not a real normative


@dataclass
class VocabularyRef:
    scheme: str
    binding: Optional[str] = None       # e.g. the ICCD binding_thesId
    level_expr: Optional[str] = None


@dataclass
class BlockedOn:
    """The sheet says it and the graph, today, cannot.

    Declared on purpose: a field whose honest binding would need a node type
    s3Dgraphy does not have is NOT quietly demoted to presentation — it carries
    what it would need and who was told.
    """
    needs: str
    reported: Optional[str] = None


@dataclass
class Option:
    value: str
    labels: Dict[str, str]

    def label(self, lang: str) -> str:
        return label_of(self.labels, lang, f"option '{self.value}'")


@dataclass
class GraphBinding:
    verdict: str
    node_type: Optional[str] = None
    node_types: Dict[str, str] = dc_field(default_factory=dict)  # term -> node_type
    edge_type: Optional[str] = None
    direction: Optional[str] = None
    qualia: Optional[str] = None
    property_name: Optional[str] = None
    attaches_to: str = "self"           # 'self' = the unit the sheet describes
    target: Optional[str] = None        # what the other end of an edge is
    blocked_on: Optional[BlockedOn] = None
    note: Optional[str] = None


@dataclass
class FieldProvenance:
    enabled: bool = True
    authors: List[str] = dc_field(default_factory=list)


#: WHERE A FIELD IS RECORDED — the three admissible values, and no fourth.
#:
#: `TRENCH` is filled during the act of excavating, by somebody whose hands are
#: dirty. `LAB` is filled after that act — the laboratory, the office, the
#: archive; the word is the discipline's shorthand for «not while digging», not
#: a claim about a room. `UNKNOWN` means the definition has not said.
#:
#: THE NAMES ARE A PLACE AND A MOMENT, NEVER A RANK. `priority` or `level` would
#: have implied that a lab field matters less; it does not — it is written at
#: another time, often by another person. Nothing here sorts.
RECORDED_IN_TRENCH = "trench"
RECORDED_IN_LAB = "lab"
RECORDED_IN_UNKNOWN = "unknown"

#: `unknown` is FIRST because it is the default, and the default is the value
#: that promises nothing: a definition that stays silent must not let a consumer
#: conclude «then it is a trench field». Silence is «not declared», and a
#: consumer that shows a phone form has to treat it as such.
RECORDED_IN_VALUES = (RECORDED_IN_UNKNOWN, RECORDED_IN_TRENCH, RECORDED_IN_LAB)


@dataclass
class Field:
    id: str
    labels: Dict[str, str]
    type: str
    required: bool = False
    repeatable: bool = False
    max_len: Optional[str] = None
    help: Dict[str, str] = dc_field(default_factory=dict)
    vocabulary: Optional[VocabularyRef] = None
    options: List[Option] = dc_field(default_factory=list)
    graph: Optional[GraphBinding] = None
    provenance: Optional[FieldProvenance] = None
    #: Where this box is filled in. Defaults to `unknown` — see
    #: `RECORDED_IN_VALUES` for why the default is the one that claims nothing,
    #: and SPEC §1.6 for how a definition's author decides.
    #:
    #: ORTHOGONAL TO `required`, deliberately: the two together are what lets a
    #: validator tell «incomplete because we are still on the dig» from
    #: «incomplete because something is missing». Neither implies the other.
    recorded_in: str = RECORDED_IN_UNKNOWN
    note: Optional[str] = None          # divergence from a local tool, in the datum itself

    def label(self, lang: str) -> str:
        return label_of(self.labels, lang, f"field '{self.id}'")

    @property
    def recorded_in_trench(self) -> bool:
        """The one question a phone form asks. `unknown` answers False.

        A property rather than a comparison at every call site, so that no
        consumer has to remember which value is the default — and so that
        `unknown` cannot be mistaken for a yes by somebody writing
        `!= "lab"`, which is the shape this would most plausibly rot into.
        """
        return self.recorded_in == RECORDED_IN_TRENCH


@dataclass
class Paragraph:
    id: str
    labels: Dict[str, str]
    fields: List[str]

    def label(self, lang: str) -> str:
        return label_of(self.labels, lang, f"paragraph '{self.id}'")


@dataclass
class Cell:
    """One box on the paper. Either a field, a nested grid, or empty space."""
    field: Optional[str] = None
    block: Optional[str] = None            # id of a nested grid (for the label)
    block_labels: Dict[str, str] = dc_field(default_factory=dict)
    rows: List["Row"] = dc_field(default_factory=list)
    w: float = 100.0                       # percent of the content width
    label: str = "auto"                    # auto | none
    rotated: bool = False                  # vertical label, as on the ICCD sheet
    style: Optional[str] = None

    def block_label(self, lang: str) -> str:
        return label_of(self.block_labels, lang, f"block '{self.block}'")


@dataclass
class Row:
    h: float = 8.0                         # millimetres
    cells: List[Cell] = dc_field(default_factory=list)


@dataclass
class Side:
    id: str                                # recto | verso
    labels: Dict[str, str] = dc_field(default_factory=dict)
    rows: List[Row] = dc_field(default_factory=list)


@dataclass
class Sheet:
    page: str = "A4"
    margins_mm: Dict[str, float] = dc_field(default_factory=dict)
    sides: List[Side] = dc_field(default_factory=list)


@dataclass
class Identity:
    human_key: List[str] = dc_field(default_factory=list)
    pattern: str = ""
    #: WHICH of the human key's fields designates the unit itself.
    #:
    #: The rest of the key is the CONTEXT that disambiguates it — a place, a
    #: trench — and the difference matters to every consumer that has to say
    #: «which unit is this record about»: `create_su` takes the designator as
    #: the unit number and the context as ordinary data.
    #:
    #: DECLARED, not deduced. Until 2026-09-23 a consumer took the LAST field of
    #: the key, which was true of all three definitions that existed — and that
    #: is a regularity observed on three cases, not a rule. It would have been
    #: false on the fourth sheet, and false IN SILENCE: a human key with the
    #: wrong designator raises nothing. It produces a label that looks right and
    #: a comparison that misses.
    #:
    #: Empty is legal only for a key of ONE field, where there is nothing to
    #: choose. `unit_field_of()` is the one place that resolves it.
    unit_field: str = ""
    uid_policy: str = "minted_by_creator"
    uid_opaque: bool = True
    uid_display: str = "on_request"
    uid_derive_from_human_key: bool = False
    deduplication: str = "by_human_key_in_context"


    def unit_field_of(self) -> str:
        """The designator — declared, or the only field there is.

        The single-field case is not an exception to «declared»: with one field
        there is no choice to make, so nothing is being guessed. With two or
        more, `validate_template` refuses a definition that does not say.
        """
        if self.unit_field:
            return self.unit_field
        return self.human_key[0] if len(self.human_key) == 1 else ""


@dataclass
class Provenance:
    per_field: bool = True
    authors: List[str] = dc_field(default_factory=lambda: ["human", "ai"])
    states: List[str] = dc_field(default_factory=lambda: ["asserted", "ai_drafted", "human_validated"])
    clock: str = "s3dgraphy_crdt_field_clock"


#: The version of a DEFINITION — semver, MAJOR.MINOR.PATCH with an optional
#: pre-release. Not the version of the norm (`standard.version`): a correction
#: to our reading of ICCD 2021 is a new definition of the same norm.
SEMVER_PATTERN = r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$"


@dataclass
class Template:
    id: str
    standard: Standard
    source_language: str
    languages: List[str]
    identity: Identity
    provenance: Provenance
    paragraphs: List[Paragraph]
    fields: List[Field]
    #: the THIRD FACE — or None: a definition read from a database that has a
    #: form and no paper model (iDAI.field) declares no sheet, and a sheet
    #: invented for it would look like a standard (SPEC §4)
    sheet: Optional[Sheet]
    vocabularies: List[str] = dc_field(default_factory=list)
    graph_defaults: Dict[str, Any] = dc_field(default_factory=dict)
    notes: Dict[str, Any] = dc_field(default_factory=dict)
    #: The version of THIS DEFINITION (SPEC §1.1). Empty = not declared, which the
    #: validator refuses: an unversioned definition cannot be cited by a record.
    version: str = ""
    path: Optional[str] = None

    def __post_init__(self) -> None:
        self._by_id = {f.id: f for f in self.fields}

    def field(self, fid: str) -> Field:
        try:
            return self._by_id[fid]
        except KeyError:
            raise KeyError(f"{self.id}: no field '{fid}' in this template") from None

    def has_field(self, fid: str) -> bool:
        return fid in self._by_id

    @property
    def sides(self) -> List[Side]:
        """The sides of the sheet, or none when the definition declares no sheet."""
        return self.sheet.sides if self.sheet is not None else []

    def title(self, lang: str) -> str:
        return label_of(self.standard.title, lang, f"template '{self.id}' title")

    def edges(self) -> List[Field]:
        return [f for f in self.fields if f.graph and f.graph.verdict == "edge"]

    def recorded_in(self, where: str) -> List[Field]:
        """The fields this definition says are filled in `where`, in sheet order.

        This is the answer to «what do I show on the phone»: ask for
        `RECORDED_IN_TRENCH` and mount a form on what comes back. Kept HERE
        rather than in the consumer, because a consumer that filters by itself
        is a second reading of the same declaration — which is the class of
        second-source-of-truth this repository exists to avoid.
        """
        if where not in RECORDED_IN_VALUES:
            raise ValueError(
                f"{self.id}: '{where}' is not a place a field is recorded in; "
                f"the admissible values are {list(RECORDED_IN_VALUES)}")
        return [f for f in self.fields if f.recorded_in == where]

    def recorded_in_counts(self) -> Dict[str, int]:
        """How many fields in each, including the undeclared ones.

        Reported rather than computed by every caller, because the interesting
        number is usually the third one: a definition whose fields are mostly
        `unknown` has not been decided yet, and that should be visible.
        """
        return {value: len(self.recorded_in(value))
                for value in RECORDED_IN_VALUES}


@dataclass
class Record:
    """Filled data for one unit — the other half of what a renderer needs."""
    template: str
    #: which version of the definition the record followed (SPEC §5)
    template_version: str = ""
    values: Dict[str, Any] = dc_field(default_factory=dict)
    field_provenance: Dict[str, Any] = dc_field(default_factory=dict)
    uid: Optional[str] = None
    path: Optional[str] = None
