"""From the open configuration of iDAI.field to a DRAFT definition — a proposal.

iDAI.field (Field Desktop, DAI, Apache-2.0) keeps its categories, fields and
valuelists in plain JSON (``core/config/``) and its built-in fields and
relations in the application core (``core/src/configuration/
built-in-configuration.ts``, relation names in ``core/src/model/configuration/
relation.ts``).  Everything is read from ONE commit of a local checkout,
through ``git show <commit>:<path>`` — never from the working tree — so the
draft says exactly which configuration it read, and reading it again gives the
same bytes.

What can be lifted mechanically, and is:

* the FORM of a category — its groups and fields, with the parent category's
  form merged in the way iDAI.field merges it (``mergeGroupsConfigurations``,
  ported below line by line), and a project's configuration on top when asked;
* the LABELS in every language the configuration has (``Language.<lang>.json``
  of Core, Library and project), and the field type (``inputType``);
* the VALUELISTS a field is bound to — declared as ``external`` schemes with
  the DAI as authority, the licence of the source and the commit read;
* the verdicts that the names alone make evident: the identifier, the
  relations that have ONE canonical edge in s3Dgraphy (a table, cited), the
  relations iDAI.field derives by itself, and the geometry.

What cannot, and comes out ``verdict: undecided``: everything else.  The
validator refuses a definition that still carries the marker (``validate
--draft`` counts them instead).

There is no SHEET: iDAI.field is a database with a form, not a paper model,
and a draft that drew one would be inventing it.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass, field as dc_field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

IDAI_FIELD_ENV = "STRATIGRAPH_IDAI_FIELD"
IDAI_FIELD_DEFAULT = Path.home() / "Documents" / "GitHub" / "idai-field"
IDAI_FIELD_GITHUB = "https://github.com/dainst/idai-field"

CONFIG = "core/config"
BUILT_IN = "core/src/configuration/built-in-configuration.ts"
FIELD_TS = "core/src/model/configuration/field.ts"
RELATION_TS = "core/src/model/configuration/relation.ts"
VALUELISTS = f"{CONFIG}/Library/Valuelists/Valuelists.json"

#: the languages a draft asks for; iDAI.field's own language is German
DRAFT_LANGUAGES = ("de", "en")

# ── the type table ────────────────────────────────────────────────────────────
#
# iDAI.field `inputType` → our field type (SPEC §1.5).  Mechanical; the note
# says what the type loses.  A valuelist makes `dropdown`/`radio` a term and
# `checkboxes` a list of terms.
_TYPES: Dict[str, Tuple[str, Optional[str]]] = {
    "identifier": ("identifier", None),
    "input": ("text", None),
    "simpleInput": ("text", None),
    "text": ("longtext", None),
    "int": ("integer", None),
    "unsignedInt": ("integer", "unsigned"),
    "float": ("decimal", None),
    "unsignedFloat": ("decimal", "unsigned"),
    "boolean": ("checkbox", "iDAI.field shows Ja/Nein: true, false or not set"),
    "date": ("date", None),
    "url": ("text", "a URL"),
    "dimension": ("quantity_list", "iDAI.field dimension: value or range, unit, measurement "
                  "position (valuelist), comment, imprecise flag"),
    "weight": ("quantity_list", "iDAI.field weight"),
    "volume": ("quantity_list", "iDAI.field volume"),
    "dating": ("text", "iDAI.field dating is STRUCTURED (range, before, after, exact, scientific "
               "with margin, source): a text box keeps it readable and loses the structure"),
    "literature": ("longtext", "iDAI.field literature: quotation + Zenon id + page"),
    "geometry": ("text", "iDAI.field geometry (GeoJSON), drawn on a map"),
    "multiInput": ("text", "multiple values"),
    "simpleMultiInput": ("text", "multiple values"),
    "valuelistMultiInput": ("text", "multiple values"),
    "category": ("choice", None),
    "derivedRelation": ("record_ref_list", "DERIVED by iDAI.field from other records' relations: "
                        "shown, never entered"),
}

# ── the relation table ────────────────────────────────────────────────────────
#
# An iDAI.field relation of a stratigraphic unit (domain Feature) → the ONE
# canonical edge of s3Dgraphy's connections datamodel and its direction from
# this record (SPEC §2.3).  Only the relations whose meaning the two names
# settle between them are here; `borders` and `isPresentIn` are not, and come
# out undecided.  Source of the iDAI.field side: `builtInRelations` in
# built-in-configuration.ts (name, inverse, domain, range) and relation.ts:25-60
# («Time relations are interpretations of users, based on position relations»;
# isAbove/isBelow «read off by a user by sight»).
_EDGES: Dict[str, Tuple[str, str]] = {
    "isAbove": ("overlies", "outgoing"),
    "isBelow": ("overlies", "incoming"),
    "cuts": ("cuts", "outgoing"),
    "isCutBy": ("cuts", "incoming"),
    "fills": ("fills", "outgoing"),
    "isFilledBy": ("fills", "incoming"),
    "abuts": ("abuts", "outgoing"),
    "isAbuttedBy": ("abuts", "incoming"),
    "bondsWith": ("bonded_to", "outgoing"),
    "isSameAs": ("equals", "outgoing"),
    "isAfter": ("is_after", "outgoing"),
    "isBefore": ("is_after", "incoming"),
    "isContemporaryWith": ("has_same_time", "outgoing"),
}


class IdaiFieldError(ValueError):
    pass


def default_repo() -> Path:
    return Path(os.environ.get(IDAI_FIELD_ENV, str(IDAI_FIELD_DEFAULT)))


@dataclass
class Source:
    """One commit of an iDAI.field checkout, read through `git show`."""
    repo: Path
    commit: str
    date: str = ""
    _cache: Dict[str, str] = dc_field(default_factory=dict)

    @classmethod
    def open(cls, repo: Optional[Path] = None, commit: str = "HEAD") -> "Source":
        repo = Path(repo or default_repo())
        if not (repo / ".git").exists():
            raise IdaiFieldError(
                f"no iDAI.field checkout at {repo}: clone {IDAI_FIELD_GITHUB} there or set "
                f"${IDAI_FIELD_ENV}")
        try:
            full = _git(repo, "rev-parse", f"{commit}^{{commit}}").strip()
            date = _git(repo, "log", "-1", "--format=%cs", full).strip()
        except IdaiFieldError as exc:
            raise IdaiFieldError(f"{repo}: commit {commit!r} not found ({exc})") from None
        return cls(repo=repo, commit=full, date=date)

    def text(self, path: str) -> str:
        if path not in self._cache:
            self._cache[path] = _git(self.repo, "show", f"{self.commit}:{path}")
        return self._cache[path]

    def json(self, path: str) -> Any:
        return json.loads(self.text(path))

    def has(self, path: str) -> bool:
        try:
            self.text(path)
            return True
        except IdaiFieldError:
            return False

    def url(self, path: str) -> str:
        return f"{IDAI_FIELD_GITHUB}/blob/{self.commit}/{path}"

    @property
    def short(self) -> str:
        return self.commit[:7]


def _git(repo: Path, *args: str) -> str:
    done = subprocess.run(["git", "-C", str(repo), *args], capture_output=True)
    if done.returncode != 0:
        raise IdaiFieldError(done.stderr.decode("utf-8", "replace").strip() or "git failed")
    return done.stdout.decode("utf-8")


# ── valuelist locators ────────────────────────────────────────────────────────
#
# iDAI.field does not mint URIs for values: a value is a KEY inside a valuelist
# (`Layer-consistency-default` → `locker`).  The identifier used here is a
# LOCATOR built by us — the file at the commit, `#<valuelistId>/<value>` with
# the value percent-encoded — and not a DAI URI.  It says WHICH value, at WHICH
# commit; the day the DAI mints URIs the alignments are rewritten.

def valuelist_uri(commit: str) -> str:
    return f"{IDAI_FIELD_GITHUB}/blob/{commit}/{VALUELISTS}#"


def value_locator(commit: str, valuelist_id: str, value: str) -> str:
    return f"{valuelist_uri(commit)}{valuelist_id}/{quote(value, safe='')}"


def scheme_id_for(valuelist_id: str) -> str:
    return "idai-field-" + re.sub(r"[^a-z0-9]+", "-", valuelist_id.lower()).strip("-")


def valuelist_labels(src: Source, valuelist_id: str, lang: str) -> Dict[str, str]:
    """value -> label in `lang`, from Language.default / Language.projects.

    A value with no label in the language is LEFT OUT: iDAI.field's interface
    then shows the value id (German), which is a display rule of that
    interface, not a translation — for German the id is the word, and it is
    what `de` gets when the file says nothing else."""
    values = (src.json(VALUELISTS).get(valuelist_id) or {}).get("values") or {}
    out: Dict[str, str] = {}
    for kind in ("default", "projects"):
        path = f"{CONFIG}/Library/Valuelists/Language.{kind}.{lang}.json"
        if not src.has(path):
            continue
        said = (src.json(path).get(valuelist_id) or {}).get("values") or {}
        for value in values:
            label = (said.get(value) or {}).get("label")
            if label and value not in out:
                out[value] = label
    if lang == "de":
        for value in values:
            out.setdefault(value, value)
    return out


# ── the core, read from TypeScript ───────────────────────────────────────────
#
# The built-in fields and relations are TypeScript object literals.  They are
# read with a small tolerant scanner rather than hard-coded, so that a new
# commit is read and not remembered.  It understands only what those literals
# use: `name: { … }` entries, `Field.InputType.X`, quoted strings, lists of
# quoted strings, and `Relation.X` / `Relation.Module.X` constants.

def _block(text: str, anchor: str, opener: str) -> str:
    start = text.find(anchor)
    if start < 0:
        raise IdaiFieldError(f"{BUILT_IN}: '{anchor}' not found — the core moved")
    i = text.index(opener, start)
    closer = "}" if opener == "{" else "]"
    depth = 0
    for j in range(i, len(text)):
        if text[j] == opener:
            depth += 1
        elif text[j] == closer:
            depth -= 1
            if depth == 0:
                return text[i + 1:j]
    raise IdaiFieldError(f"{BUILT_IN}: unbalanced '{anchor}'")


def _top_level(body: str) -> List[Tuple[str, str]]:
    """(key, inner) for `key: { inner }` entries at depth 0 of an object body,
    or ('', inner) for `{ inner }` elements of an array body."""
    out = []
    depth = 0
    key_start = 0
    i = 0
    while i < len(body):
        ch = body[i]
        if ch == "{":
            if depth == 0:
                head = body[key_start:i]
                m = re.search(r"['\"]?([A-Za-z_:][\w:]*)['\"]?\s*:\s*$", head)
                key = m.group(1) if m else ""
                open_at = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                out.append((key, body[open_at + 1:i]))
                key_start = i + 1
        i += 1
    return out


def _input_types(src: Source) -> Dict[str, str]:
    body = _block(src.text(FIELD_TS), "export module InputType", "{")
    return dict(re.findall(r"export const (\w+) = '([^']+)'", body))


def _relation_constants(src: Source) -> Dict[str, str]:
    text = src.text(RELATION_TS)
    consts: Dict[str, str] = {}
    module = ""
    for line in text.splitlines():
        m = re.match(r"\s*export module (\w+)", line)
        if m:
            module = m.group(1)
        m = re.match(r"\s*export const (\w+) = '([^']+)'", line)
        if m:
            consts[f"{module}.{m.group(1)}" if module and module != "Relation" else m.group(1)] = m.group(2)
            consts.setdefault(m.group(1), m.group(2))
    return consts


def _field_defs(src: Source, anchor: str) -> Dict[str, Dict[str, Any]]:
    types = _input_types(src)
    out = {}
    for name, inner in _top_level(_block(src.text(BUILT_IN), anchor, "{")):
        d: Dict[str, Any] = {}
        m = re.search(r"inputType:\s*Field\.InputType\.(\w+)", inner)
        if m:
            d["inputType"] = types.get(m.group(1), m.group(1).lower())
        for key in ("valuelistId", "valuelistFromProjectField"):
            m = re.search(rf"{key}:\s*'([^']+)'", inner)
            if m:
                d[key] = m.group(1)
        out[name] = d
    return out


def _relations(src: Source) -> List[Dict[str, Any]]:
    consts = _relation_constants(src)

    def name_of(expr: str) -> str:
        expr = expr.strip()
        if expr.startswith("'"):
            return expr.strip("'")
        return consts.get(expr.replace("Relation.", ""), expr)

    out = []
    for _, inner in _top_level(_block(src.text(BUILT_IN), "public builtInRelations", "[")):
        m = re.search(r"name:\s*([^,\n]+)", inner)
        if not m:
            continue
        rel = {"name": name_of(m.group(1))}
        m = re.search(r"inverse:\s*([^,\n]+)", inner)
        if m:
            rel["inverse"] = name_of(m.group(1))
        for key in ("domain", "range"):
            m = re.search(rf"{key}:\s*\[([^\]]*)\]", inner, re.S)
            rel[key] = re.findall(r"'([^']+)'", m.group(1)) if m else []
        m = re.search(r"visible:\s*(true|false)", inner)
        rel["visible"] = (m.group(1) == "true") if m else True
        out.append(rel)
    return out


# ── the form ──────────────────────────────────────────────────────────────────

def merge_groups(parent: List[Dict[str, Any]], child: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """iDAI.field `mergeGroupsConfigurations` (core/src/configuration/boot/
    merge-groups-configurations.ts), ported: a child group with the name of a
    parent group either REPLACES its order (when it names every parent field)
    or APPENDS the fields the parent lacks; a new group is appended."""
    result = [{"name": g["name"], "fields": list(g["fields"])} for g in parent]
    for cg in child:
        pg = next((g for g in result if g["name"] == cg["name"]), None)
        if pg is None:
            result.append({"name": cg["name"], "fields": list(cg["fields"])})
        elif all(f in cg["fields"] for f in pg["fields"]):
            pg["fields"] = [f for f in pg["fields"] if f not in cg["fields"]] + list(cg["fields"])
        else:
            pg["fields"] = pg["fields"] + [f for f in cg["fields"] if f not in pg["fields"]]
    return result


@dataclass
class ReadField:
    name: str
    group: str
    input_type: str
    valuelist: Optional[str] = None
    from_project_field: Optional[str] = None
    relation: Optional[Dict[str, Any]] = None
    labels: Dict[str, str] = dc_field(default_factory=dict)
    descriptions: Dict[str, str] = dc_field(default_factory=dict)
    source: str = ""                 # builtIn | common | library | relation | project


@dataclass
class ReadForm:
    category: str
    parent: Optional[str]
    forms: List[str]
    project: Optional[str]
    groups: List[Dict[str, Any]]
    fields: List[ReadField]
    category_labels: Dict[str, str]
    group_labels: Dict[str, Dict[str, str]]
    hidden: List[str]
    valuelists: List[str]


def _form_named(forms: Dict[str, Any], category: str, project_forms: Dict[str, Any]) -> Tuple[str, Dict]:
    for name in (f"{category}:default", category):
        if name in project_forms:
            return name, project_forms[name]
    for name in (f"{category}:default", category):
        if name in forms:
            return name, forms[name]
    raise IdaiFieldError(f"no form for category '{category}' in {CONFIG}/Library/Forms.json")


def read_form(src: Source, category: str, project: Optional[str] = None,
              languages: Tuple[str, ...] = DRAFT_LANGUAGES) -> ReadForm:
    cats = src.json(f"{CONFIG}/Library/Categories.json")
    forms = src.json(f"{CONFIG}/Library/Forms.json")
    if category not in cats:
        raise IdaiFieldError(f"no category '{category}' in {CONFIG}/Library/Categories.json "
                             f"(known: {sorted(cats)})")
    parent = cats[category].get("parent")
    proj: Dict[str, Any] = {}
    if project:
        path = f"{CONFIG}/Config-{project}.json"
        if not src.has(path):
            raise IdaiFieldError(f"no project configuration {path}")
        proj = src.json(path).get("forms") or {}

    names: List[str] = []
    groups: List[Dict[str, Any]] = []
    project_fields: Dict[str, Dict[str, Any]] = {}
    overrides: Dict[str, str] = {}
    hidden: List[str] = []
    for cat in ([parent] if parent else []) + [category]:
        name, form = _form_named(forms, cat, proj)
        names.append(name)
        lib = forms.get(name) or forms.get(f"{cat}:default") or {}
        own = form.get("groups") or lib.get("groups") or []
        groups = merge_groups(groups, own) if groups else [dict(g) for g in own]
        project_fields.update(form.get("fields") or {})
        overrides.update(form.get("valuelists") or {})
        hidden += list(form.get("hidden") or [])

    common = _field_defs(src, "public commonFields")
    built_in = _field_defs(src, "public builtInFields")
    stratigraphic = {r["name"]: r for r in _relations(src)
                     if (category in r["domain"] or (parent and parent in r["domain"]))}

    core = {lang: src.json(f"{CONFIG}/Core/Language.{lang}.json") for lang in languages}
    lib_lang = {lang: src.json(f"{CONFIG}/Library/Language.{lang}.json") for lang in languages}
    proj_lang = {}
    for lang in languages:
        path = f"{CONFIG}/Language-{project}.{lang}.json" if project else ""
        proj_lang[lang] = src.json(path) if project and src.has(path) else {}

    def said(lang: str, fname: str, key: str, is_relation: bool) -> Optional[str]:
        places = []
        pj = proj_lang[lang].get("categories") or {}
        for cat in (category, parent):
            if cat:
                places.append(((pj.get(cat) or {}).get("fields") or {}).get(fname))
        for fname_form in names[::-1]:
            places.append((((lib_lang[lang].get("forms") or {}).get(fname_form) or {})
                           .get("fields") or {}).get(fname))
        for cat in (category, parent):
            if cat:
                places.append(((((lib_lang[lang].get("categories") or {}).get(cat) or {})
                                .get("fields") or {}).get(fname)))
        places.append((lib_lang[lang].get("commons") or {}).get(fname))
        places.append(((core[lang].get("relations") if is_relation else core[lang].get("fields"))
                       or {}).get(fname))
        for p in places:
            if isinstance(p, dict) and p.get(key):
                return str(p[key])
        return None

    fields: List[ReadField] = []
    seen = set()
    for g in groups:
        for fname in g["fields"]:
            if fname in hidden or fname in seen:
                continue
            seen.add(fname)
            lib_def = ((cats.get(category) or {}).get("fields") or {}).get(fname)
            if lib_def is None and parent:
                lib_def = ((cats.get(parent) or {}).get("fields") or {}).get(fname)
            rel = stratigraphic.get(fname)
            if fname in project_fields:
                d, source = project_fields[fname], "project"
            elif rel is not None:
                d, source = {"inputType": "relation"}, "relation"
            elif fname in built_in:
                d, source = built_in[fname], "builtIn"
            elif lib_def:
                d, source = lib_def, "library"
            elif fname in common:
                d, source = common[fname], "common"
            else:
                raise IdaiFieldError(f"field '{fname}' of form {names} has no definition in the "
                                     f"core, the library or the project")
            vl = overrides.get(fname) or d.get("valuelistId")
            if source == "project" and not vl and lib_def:
                vl = lib_def.get("valuelistId")
            rf = ReadField(name=fname, group=g["name"], input_type=d.get("inputType", "input"),
                           valuelist=vl, from_project_field=d.get("valuelistFromProjectField"),
                           relation=rel, source=source)
            for lang in languages:
                label = said(lang, fname, "label", rel is not None)
                if label:
                    rf.labels[lang] = label
                desc = said(lang, fname, "description", rel is not None)
                if desc:
                    rf.descriptions[lang] = desc
            fields.append(rf)

    cat_labels = {}
    for lang in languages:
        c = ((proj_lang[lang].get("categories") or {}).get(category)
             or (lib_lang[lang].get("categories") or {}).get(category) or {})
        if c.get("label"):
            cat_labels[lang] = c["label"]
    group_labels = {g["name"]: {lang: (lib_lang[lang].get("groups") or {}).get(g["name"], g["name"])
                                for lang in languages} for g in groups}
    return ReadForm(category=category, parent=parent, forms=names, project=project,
                    groups=[g for g in groups if any(f.group == g["name"] for f in fields)],
                    fields=fields, category_labels=cat_labels, group_labels=group_labels,
                    hidden=hidden,
                    valuelists=sorted({f.valuelist for f in fields if f.valuelist}))


# ── the draft ─────────────────────────────────────────────────────────────────

def _yaml_str(text: Any) -> str:
    return json.dumps(str(text), ensure_ascii=False)


def _labels(d: Dict[str, str]) -> str:
    return "{" + ", ".join(f"{k}: {_yaml_str(v)}" for k, v in d.items()) + "}"


def _proposal(rf: ReadField) -> Tuple[str, Dict[str, Any]]:
    """(our type, graph proposal) — only what the names settle."""
    if rf.input_type == "relation":
        rng = (rf.relation or {}).get("range") or []
        our = "unit_ref_list" if any(r in ("Feature", "FeatureSegment") for r in rng) else "record_ref_list"
        if rf.name in _EDGES and our == "unit_ref_list":
            edge, direction = _EDGES[rf.name]
            return our, {"verdict": "edge", "edge_type": edge, "direction": direction,
                         "note": f"iDAI.field relation '{rf.name}' (inverse "
                                 f"'{(rf.relation or {}).get('inverse', '—')}'): one canonical "
                                 f"edge, read from the relation table of idai_extract.py"}
        return our, {"verdict": "undecided",
                     "note": f"iDAI.field relation '{rf.name}' (range {rng}): no evident "
                             f"canonical edge"}
    our, _ = _TYPES.get(rf.input_type, ("text", None))
    if rf.valuelist and rf.input_type in ("dropdown", "radio", "dropdownRange"):
        our = "term"
    elif rf.valuelist and rf.input_type == "checkboxes":
        our = "term_list"
    elif rf.input_type == "checkboxes":
        our = "text"
    if rf.input_type == "identifier":
        return our, {"verdict": "identity", "note": "iDAI.field identifier: unique in the project"}
    if rf.input_type == "derivedRelation":
        return our, {"verdict": "none",
                     "note": "derived by iDAI.field from other records' relations; not entered, "
                             "so nothing to write"}
    if rf.input_type == "geometry":
        return our, {"verdict": "none",
                     "note": "GIS geometry: out of scope for this format (SPEC §6, GIS is "
                             "pyarchinit's)"}
    return our, {"verdict": "undecided", "note": f"iDAI.field inputType '{rf.input_type}'"
                 + (f", valuelist {rf.valuelist}" if rf.valuelist else "")}


def extract_idai_field(src: Source, category: str, project: Optional[str] = None,
                       languages: Tuple[str, ...] = DRAFT_LANGUAGES) -> Tuple[str, Dict[str, Any], ReadForm]:
    form = read_form(src, category, project, languages)
    stats: Dict[str, Any] = {
        "commit": src.commit, "category": category, "parent": form.parent,
        "forms": form.forms, "project": project, "groups": len(form.groups),
        "fields": len(form.fields), "relations": 0, "with_valuelist": 0,
        "valuelists": len(form.valuelists), "hidden": len(form.hidden),
        "labels": {lang: sum(1 for f in form.fields if lang in f.labels) for lang in languages},
        "verdicts": {}, "by_input_type": {},
    }
    rows = []
    for rf in form.fields:
        our, graph = _proposal(rf)
        stats["verdicts"][graph["verdict"]] = stats["verdicts"].get(graph["verdict"], 0) + 1
        stats["by_input_type"][rf.input_type] = stats["by_input_type"].get(rf.input_type, 0) + 1
        if rf.input_type == "relation":
            stats["relations"] += 1
        if rf.valuelist:
            stats["with_valuelist"] += 1
        rows.append((rf, our, graph))

    ident = next((rf.name for rf in form.fields if rf.input_type == "identifier"), "identifier")
    slug = re.sub(r"[^a-z0-9]+", "-", f"{category}{'-' + project if project else ''}".lower())
    lines: List[str] = []
    a = lines.append
    a(f"# DRAFT — proposta estratta dalla configurazione di iDAI.field")
    a(f"#   {IDAI_FIELD_GITHUB} @ {src.commit} ({src.date})")
    a(f"#   categoria {category}" + (f" (padre {form.parent})" if form.parent else "")
      + f", form {' + '.join(form.forms)}" + (f", progetto {project}" if project else ""))
    a("#")
    a("# Campi, gruppi, etichette, tipo (inputType) e valuelist vengono dalla configurazione")
    a("# e sono AFFIDABILI. Il legame al grafo e' proposto solo dove i nomi lo decidono da")
    a("# soli (l'identificatore, le relazioni con UN arco canonico, le relazioni derivate, la")
    a("# geometria); tutto il resto e' `verdict: undecided`, e il validatore rifiuta una")
    a("# definizione che porti ancora quel marcatore (`validate --draft` li conta).")
    a("#")
    a("# NESSUN FOGLIO: iDAI.field e' una banca dati con un modulo, non un modello di carta.")
    a("")
    a("template:")
    a(f"  id: draft-idai-field-{slug}")
    a('  version: "0.0.0"')
    a("  standard:")
    a("    authority: DAI")
    a(f"    code: {_yaml_str('iDAI.field ' + category)}")
    a(f"    version: {_yaml_str('config ' + src.short + ' (' + src.date + ')')}")
    a("    kind: field_model")
    title = {lang: f"iDAI.field — {form.category_labels.get(lang, category)} ({category})"
             for lang in languages}
    a(f"    title: {_labels(title)}")
    a(f"    source: {_yaml_str(src.url(CONFIG))}")
    a('    license: "Apache-2.0"')
    a(f"    attribution: {_yaml_str('Deutsches Archäologisches Institut (DAI) — iDAI.field / Field Desktop, ' + IDAI_FIELD_GITHUB + ' @ ' + src.short)}")
    a("  source_language: de")
    a(f"  languages: [{', '.join(languages)}]")
    a("  identity:")
    a("    human_key:")
    a(f"      fields: [{ident}]")
    a(f'      pattern: "{{{ident}}}"')
    a("    uid:")
    a("      policy: minted_by_creator")
    a("      derive_from_human_key: false")
    a("  provenance:")
    a("    per_field: true")
    term_lists = sorted({rf.valuelist for rf, our, _ in rows if our in ("term", "term_list")})
    stats["term_valuelists"] = len(term_lists)
    if term_lists:
        a("  vocabularies:")
        for vl in term_lists:
            a(f"    - {scheme_id_for(vl)}")
    a("  paragraphs:")
    for g in form.groups:
        a(f"    - id: {g['name']}")
        a(f"      labels: {_labels(form.group_labels[g['name']])}")
        a("      fields: [" + ", ".join(f.name for f in form.fields if f.group == g["name"]) + "]")
    a("  fields:")
    for rf, our, graph in rows:
        a(f"    - id: {rf.name}")
        labels = {lang: rf.labels.get(lang) or f"«{rf.name}» (nessuna etichetta {lang} nella fonte)"
                  for lang in languages}
        a(f"      labels: {_labels(labels)}")
        a(f"      type: {our}")
        if our in ("unit_ref_list", "record_ref_list", "term_list", "quantity_list"):
            a("      repeatable: true")
        if rf.input_type == "identifier":
            a("      required: true")
        if rf.descriptions:
            a(f"      help: {_labels({k: v[:300] for k, v in rf.descriptions.items()})}")
        if our == "choice" and rf.input_type == "category":
            a("      options:")
            a(f"        - {{value: {category}, labels: "
              f"{_labels({lang: form.category_labels.get(lang, category) for lang in languages})}}}")
        if rf.valuelist and our in ("term", "term_list"):
            a("      vocabulary:")
            a(f"        scheme: {scheme_id_for(rf.valuelist)}")
            a(f"        binding: {_yaml_str(rf.valuelist)}")
        note = f"iDAI.field: inputType {rf.input_type}, source {rf.source}, group {rf.group}"
        if rf.from_project_field:
            note += f", values from the project field '{rf.from_project_field}'"
        lost = _TYPES.get(rf.input_type, (None, None))[1]
        if lost:
            note += f" — {lost}"
        a(f"      note: {_yaml_str(note)}")
        a("      graph:")
        for k in ("verdict", "edge_type", "direction"):
            if k in graph:
                a(f"        {k}: {graph[k]}")
        a(f"        note: {_yaml_str(graph['note'])}")
    a("")
    return "\n".join(lines), stats, form


def scheme_yaml(src: Source, valuelist_id: str, languages: Tuple[str, ...] = ("de", "en", "it")) -> str:
    """The declaration of ONE valuelist as an external, resolvable scheme."""
    vl = src.json(VALUELISTS).get(valuelist_id)
    if vl is None:
        raise IdaiFieldError(f"no valuelist '{valuelist_id}' in {VALUELISTS}")
    n = len(vl.get("values") or {})
    counted = {lang: len(valuelist_labels(src, valuelist_id, lang)) for lang in languages}
    sid = scheme_id_for(valuelist_id)
    created = vl.get("createdBy") or ""
    return "\n".join([
        f"# Il valuelist `{valuelist_id}` di iDAI.field (DAI), letto al commit {src.short}",
        f"# ({src.date}): {n} valori; etichette " + ", ".join(f"{k} {v}/{n}" for k, v in counted.items())
        + ".",
        "# Scritto da `stratigraph-templates extract-idai-field`.",
        "#",
        "# NON e' copiato qui: si risolve dal checkout di iDAI.field (resolve.kind",
        "# idai_field_valuelist, `git show <commit>:<file>`), come gli SKOS dell'ICCD si",
        "# risolvono da Standard-catalografici. iDAI.field non conia URI per i valori: i",
        "# concetti sono LOCALIZZATORI costruiti da noi (`<uri><valuelistId>/<valore>`),",
        "# non URI del DAI.",
        "scheme:",
        f"  id: {sid}",
        '  authority: "Deutsches Archäologisches Institut (DAI)"',
        "  origin: external",
        "  labels:",
        f"    de: {_yaml_str('iDAI.field Werteliste ' + valuelist_id)}",
        f"    en: {_yaml_str('iDAI.field valuelist ' + valuelist_id)}",
        f"    it: {_yaml_str('Valuelist di iDAI.field ' + valuelist_id)}",
        "  status: resolvable",
        f"  uri: {_yaml_str(valuelist_uri(src.commit) + valuelist_id)}",
        '  license: "Apache-2.0"',
        f"  attribution: {_yaml_str('Deutsches Archäologisches Institut — iDAI.field (github.com/dainst/idai-field), core/config/Library/Valuelists, commit ' + src.short + ' (' + src.date + ')' + ('; ' + created if created else ''))}",
        f"  binding_thes_id: {_yaml_str(valuelist_id)}",
        "  resolve:",
        "    kind: idai_field_valuelist",
        f"    commit: {src.commit}",
        f"    valuelist: {_yaml_str(valuelist_id)}",
        "",
    ])
