"""The compiled form: a definition a program takes and uses without reading YAML.

`stratigraph-templates build` writes, for every definition that validates, ONE
self-sufficient JSON file.  It is the same pact as the theme (`sync-brand.sh`)
and the datamodels (`sync-datamodels.sh`): this repository PRODUCES, the app
VENDORS a copy and commits it.  Nothing reads a definition live.

The file has a header and two halves (SPEC §9):

* **header** — which definition, which version of it, which norm, which
  languages, a digest of the content, and the s3Dgraphy datamodel it was
  checked against (read from the snapshot, never typed);
* **visual** — what a form and a sheet need: paragraphs, fields with every
  label in every declared language, the human key and its designator, the
  sheet as it is;
* **recipe** — for every field, WHAT TO PRODUCE in the vocabulary of the five
  CRDT operations of s3Dgraphy (`add_node`, `update_field`, `remove_node`,
  `add_edge`, `remove_edge`), with no values in it.

**Why operations and not a graph.**  The orchestrator is StratiGraph Server:
whoever enters a room sends operations, the room applies them with
`em.apply_op` and relays them (EMStudio does exactly this; `POST
/v1/rooms/{id}/ops` carries the same vocabulary).  A compiled recipe that said
"make this graph" would need an applicator of its own beside the room — a dry
path out of the orchestration.  The recipe says which operations to send, and
StratiField, filling the sheet, sends them.

**The recipe invents no names.**  Node types, their em.json spelling, edge
types, their reverse and symmetry, and the RDF each one becomes are READ from
the registry snapshot (`registry.py`).  Where the definition leaves something
undecided, the recipe says so under `open` instead of deciding it.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from . import __version__
from .model import Field, Template
from .registry import Registry
from .validate import ValidationError, validate_template
from .vocab import Vocabularies

FORMAT = "stratigraph-templates/compiled-definition"
FORMAT_VERSION = "1"

#: The one node field besides `name` that `update_field` can address directly
#: (s3dgraphy crdt.apply_op_to_section: `name`, `description`, `data.*`). A
#: property with this `property_name` is the node's own field, not a
#: PropertyNode — it is the difference between `node.description` and a box
#: that lands in `data.<box id>` (audit B9). `name` is not offered: the unit's
#: name is spelled by the human key.
NATIVE_FIELDS = ("description",)

#: How a NODE ELEMENT's declared `value` kind is written by a field, and which
#: field types can write it. A node element (`registry.node_elements`, read from
#: the node datamodel: `StratigraphicNode.properties.definition`) is the node's
#: own field like `description`, but it lives in em.json at the place the
#: datamodel names (`data.definition`) and it holds the WHOLE value — a concept
#: element keeps `{concept, label}`, because the label is what the recorder saw
#: and the datamodel's shape carries it. Only the pairing is written here; the
#: element, its em.json place and its RDF are the datamodel's.
ELEMENT_VALUE_TYPES = {"concept": ("term",)}

#: What the unit is read as when the definition does not decide its node type
#: (no field with verdict `node_type`, the two demos): the class every unit
#: type of a recording sheet descends from. Used only to tell whether a
#: `property_name` names one of the UNIT's node elements (`_is_unit_element`).
UNIT_WHEN_UNDECIDED = "StratigraphicNode"

#: The em.json `node_type` of a PropertyNode and the edge that hangs it on its
#: subject. Not literals of this module's opinion: `em_node_type` resolves the
#: class and the edge is checked against the registry like any other.
PROPERTY_CLASS = "PropertyNode"
PROPERTY_EDGE = "has_property"

#: Field types whose value is a LIST: the recipe's steps repeat per item.
LIST_TYPES = ("term_list", "unit_ref_list", "record_ref_list", "resource_ref_list",
              "quantity_list")


class CompileError(ValueError):
    def __init__(self, template_id: str, problems: List[str]):
        self.template_id = template_id
        self.problems = problems
        body = "\n".join(f"  - {p}" for p in problems)
        super().__init__(f"{template_id}: does not compile, {len(problems)} problem(s)\n{body}")


# ── canonical JSON and the digest ────────────────────────────────────────────

def canonical(doc: Any) -> str:
    return json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


#: Header keys that say where and with what a file was produced, not what the
#: definition IS. They stay out of the digest, so that recompiling the same
#: definition against a later datamodel that changes nothing in its recipe
#: keeps its digest — and a datamodel change that DOES change the recipe
#: changes it, because the recipe is inside.
_OUTSIDE_DIGEST = ("digest", "datamodel", "compiled_by")


def digest_of(doc: Dict[str, Any]) -> str:
    body = dict(doc)
    body["header"] = {k: v for k, v in doc["header"].items() if k not in _OUTSIDE_DIGEST}
    return "sha256:" + hashlib.sha256(canonical(body).encode("utf-8")).hexdigest()


# ── the visual half ──────────────────────────────────────────────────────────

def _drop_empty(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if v not in (None, "", [], {})}


def _visual(t: Template) -> Dict[str, Any]:
    paragraph_of = {fid: p.id for p in t.paragraphs for fid in p.fields}
    fields = []
    for f in t.fields:
        fields.append(_drop_empty({
            "id": f.id,
            "paragraph": paragraph_of.get(f.id),
            "type": f.type,
            "required": f.required,
            "repeatable": f.repeatable,
            "recorded_in": f.recorded_in,
            "max_len": f.max_len,
            "labels": f.labels,
            "help": f.help,
            "options": [{"value": o.value, "labels": o.labels} for o in f.options],
            "vocabulary": _drop_empty(dataclasses.asdict(f.vocabulary)) if f.vocabulary else None,
            "provenance": dataclasses.asdict(f.provenance) if f.provenance else None,
            "note": f.note,
        }))
    ident = t.identity
    return {
        "identity": {
            "human_key": list(ident.human_key),
            "pattern": ident.pattern,
            "unit_field": ident.unit_field_of(),
            "uid": {"policy": ident.uid_policy, "opaque": ident.uid_opaque,
                    "display": ident.uid_display,
                    "derive_from_human_key": ident.uid_derive_from_human_key},
            "deduplication": ident.deduplication,
        },
        "provenance": dataclasses.asdict(t.provenance),
        "paragraphs": [{"id": p.id, "labels": p.labels, "fields": list(p.fields)}
                       for p in t.paragraphs],
        "fields": fields,
        # null when the definition declares no sheet (SPEC §4): never an empty one
        "sheet": dataclasses.asdict(t.sheet) if t.sheet is not None else None,
        "notes": t.notes,
    }


# ── the recipe ───────────────────────────────────────────────────────────────
#
# A recipe entry is a list of STEPS; a step `emit`s one operation, written with
# REFERENCES where the values will go. The grammar is SPEC §9.3:
#
#   $unit            the unit this record describes
#   $value           the field's value;   $value.<key> a key of it
#   $item            one element of a list value (the entry has `each: true`)
#   $item.<key>      a key of that element
#   $node            the node this step finds or creates (see `resolve`)
#   $prop            the PropertyNode this step mints
#   $field.<id>.prop the PropertyNode minted by ANOTHER field's entry
#   $anchor.<name>   something the definition names and does not define
#
# `when: created` on a step = emit it only if `resolve` created the node rather
# than finding it. Ids are minted by the creator (identity.uid.policy); the
# recipe never spells one.


def _value_ref(f: Field) -> str:
    """Where the value that lands in the graph is, for a field of this type."""
    each = f.type in LIST_TYPES
    base = "$item" if each else "$value"
    if f.type in ("term", "term_list"):
        return f"{base}.concept"            # SPEC §3: the CONCEPT, never the label
    if f.type == "quantity_list":
        return f"{base}.value"
    return base


class _Ctx:
    def __init__(self, t: Template, reg: Registry):
        self.t = t
        self.reg = reg
        self.problems: List[str] = []
        self.open: List[Dict[str, str]] = []
        self.anchors: Dict[str, List[str]] = {}
        #: property name -> id of the field whose entry mints it
        self.property_fields: Dict[str, str] = {}
        for f in t.fields:
            g = f.graph
            if g and g.verdict in ("property", "vocabulary"):
                name = g.property_name or g.qualia
                if name:
                    self.property_fields.setdefault(name, f.id)

    def node(self, name: str, where: str) -> Dict[str, str]:
        try:
            cls, code = self.reg.em_node_type(name)
        except KeyError:
            self.problems.append(f"{where}: node type '{name}' has no em.json spelling in "
                                 f"node_registry (nodes {self.reg.node_datamodel_version})")
            return {"class": name, "node_type": name}
        return {"class": cls, "node_type": code}

    def unit_classes(self) -> Optional[set]:
        """The classes the unit can be, as the definition decides them (the
        table of its `node_type` field), or None when it does not decide."""
        decider = next((d for d in self.t.fields
                        if d.graph and d.graph.verdict == "node_type"), None)
        if decider is None:
            return None
        return {self.node(nt, f"field '{decider.id}'")["class"]
                for nt in decider.graph.node_types.values()}

    def classes(self, ref: str, node_class: Optional[str] = None) -> Optional[set]:
        """The classes the node at a recipe reference can be, or None when the
        definition does not say: `$unit` is its node_type table, `$node` the
        node the field creates, `$field.<id>.prop` a PropertyNode; `$item` of
        an edge box and `$anchor.<name>` are found by the creator."""
        if ref == "$unit":
            return self.unit_classes()
        if ref == "$node" and node_class:
            return {node_class}
        if ref.startswith("$field.") and ref.endswith(".prop"):
            return {PROPERTY_CLASS}
        return None

    def edge(self, name: str, where: str, ends: Tuple[Optional[set], Optional[set]] = (None, None)
             ) -> Dict[str, Any]:
        """What the recipe says of an edge type. `ends` = the classes the em.json
        source and target can be (`classes`), which decide its extension's guard."""
        entry = self.reg.edges.get(name)
        if entry is None:
            self.problems.append(f"{where}: edge type '{name}' is not in the connections "
                                 f"datamodel {self.reg.connections_version}")
            return {}
        if entry.get("deprecated"):
            self.problems.append(f"{where}: edge type '{name}' is deprecated in the connections "
                                 f"datamodel {self.reg.connections_version}")
        if entry.get("spelling_of"):
            # the datamodel accepts it on READ and names the one to WRITE
            self.problems.append(f"{where}: edge type '{name}' is an older spelling of "
                                 f"'{entry['spelling_of']}' in the connections datamodel "
                                 f"{self.reg.connections_version}: a recipe writes the canonical")
        spellings = sorted(k for k, e in self.reg.edges.items() if e.get("spelling_of") == name)
        rdf = _guarded_inverse(_guarded(dict(entry.get("rdf") or {}), *ends), *ends)
        key = (rdf.get("predicate"), rdf.get("subproperty"))
        same = sorted(k for k, e in self.reg.edges.items()
                      if k != name and rdf.get("subproperty")
                      and ((e.get("rdf") or {}).get("predicate"),
                           (e.get("rdf") or {}).get("subproperty")) == key)
        for iri in (rdf.get("subproperty"), rdf.get("extension")):
            if iri and iri.startswith("https://w3id.org/em/ontology#") \
                    and iri not in self.reg.em_ttl_terms:
                self.problems.append(f"{where}: edge '{name}' becomes {iri} in RDF, which em.ttl "
                                     f"{self.reg.em_ttl_version} does not declare")
        return _drop_empty({
            "canonical": True,          # every key of the connections datamodel is
            "symmetric": entry.get("symmetric"),
            "reverse": entry.get("reverse"),
            "rdf": _drop_empty(rdf),
            "same_rdf_as": same,
            "spellings": spellings,
        })

    def anchor(self, f: Field) -> Tuple[str, List[str]]:
        """What a field's graph statement hangs on: `(ref, fields it must come after)`."""
        where = (f.graph.attaches_to or "self") if f.graph else "self"
        if where == "self":
            return "$unit", []
        if where.startswith("property:"):
            name = where.split(":", 1)[1]
            fid = self.property_fields.get(name)
            if fid is None:
                self.problems.append(
                    f"field '{f.id}': attaches_to '{where}' names a property no field of this "
                    f"definition produces (produced: {sorted(self.property_fields)})")
                return f"$anchor.{where}", []
            return f"$field.{fid}.prop", [fid]
        self.anchors.setdefault(where, []).append(f.id)
        return f"$anchor.{where}", []


def _guarded(rdf: Dict[str, Any], source: Optional[set], target: Optional[set]
             ) -> Dict[str, Any]:
    """An edge's RDF with its extension's guard DECIDED where the definition can.

    The datamodel's guard (`extension_when`, read into the snapshot) names the
    classes the RDF subject and object must have for the extension to go out —
    the em.json target and source swapped when `subject` is `target`. Per
    guarded end:

    * every class the definition allows there passes → the guard holds;
    * none passes → the extension is not written in the recipe at all
      (has_documentation from a US is P70i alone, em:derivedFromDocument has
      domain the USD);
    * some pass, or the definition does not say (no `node_type` field, a node
      the creator finds) → the extension stays WITH `extension_when`, and
      whoever executes the recipe decides on the node it has.
    """
    when = rdf.pop("extension_when", None)
    if not when or not rdf.get("extension"):
        return rdf
    subject, obj = (target, source) if rdf.get("subject") == "target" else (source, target)
    undecided: Dict[str, List[str]] = {}
    for key, known in (("source_node_class", subject), ("target_node_class", obj)):
        allowed = set(when.get(key) or ())
        if not allowed:
            continue
        if known is not None and not known & allowed:
            del rdf["extension"]
            return rdf
        if known is None or not known <= allowed:
            undecided[key] = sorted(allowed)
    if undecided:
        rdf["extension_when"] = undecided
    return rdf


def _guarded_inverse(rdf: Dict[str, Any], source: Optional[set], target: Optional[set]
                     ) -> Dict[str, Any]:
    """An edge's INVERSE extension (`inverse_extension`: the same fact read from
    the other side, `<target> pred <source>` — is_part_of → em:reconstructsFrom,
    a VSF reconstructed from the SF that is part of it) with its guard decided
    as `_guarded` decides the extension's: the guard names the classes of the
    LOGICAL source and target; per guarded end, all the definition allows pass →
    no guard, none passes → no inverse in the recipe, some or unknown → the
    inverse WITH `inverse_extension_when`. Subject and object of the written
    triple are the other way round from the core predicate's: whoever executes
    the recipe writes `<logical target> inverse <logical source>`."""
    when = rdf.pop("inverse_extension_when", None)
    if not rdf.get("inverse_extension"):
        rdf.pop("inverse_extension", None)
        return rdf
    if not when:
        return rdf
    subject, obj = (target, source) if rdf.get("subject") == "target" else (source, target)
    undecided: Dict[str, List[str]] = {}
    for key, known in (("source_node_class", subject), ("target_node_class", obj)):
        allowed = set(when.get(key) or ())
        if not allowed:
            continue
        if known is not None and not known & allowed:
            del rdf["inverse_extension"]
            return rdf
        if known is None or not known <= allowed:
            undecided[key] = sorted(allowed)
    if undecided:
        rdf["inverse_extension_when"] = undecided
    return rdf


def _property_steps(ctx: _Ctx, f: Field, property_type: str, anchor: str,
                    registered: bool) -> Dict[str, Any]:
    prop = ctx.node(PROPERTY_CLASS, f"field '{f.id}'")
    ctx.edge(PROPERTY_EDGE, f"field '{f.id}'")
    each = f.type in LIST_TYPES
    ptype: Any = property_type
    defaults: Dict[str, str] = {}
    data: Dict[str, Any] = {}
    if f.type == "quantity_list":
        # each row declares its own qualia (SPEC §1.5); the field's qualia, when
        # there is one, is the default for a row that does not
        ptype = "$item.qualia"
        if registered:
            defaults["$item.qualia"] = property_type
        data["units"] = "$item.unit"
    data = {"property_type": ptype, **data}
    node = {"id": "$prop", "node_type": prop["node_type"], "name": ptype,
            "description": _value_ref(f), "data": data}
    entry: Dict[str, Any] = {
        "each": each,
        "resolve": {"$prop": {"mint": True}},
        "steps": [
            {"emit": {"op": "add_node", "node": node}},
            {"emit": {"op": "add_edge", "edge_type": PROPERTY_EDGE,
                      "source": anchor, "target": "$prop"}},
        ],
        "property": _drop_empty({
            "property_type": property_type if f.type != "quantity_list" else None,
            "per_item_from": "$item.qualia" if f.type == "quantity_list" else None,
            "registered_qualia": registered if f.type != "quantity_list" else None,
            "box": property_type if f.type == "quantity_list" else None,
        }),
    }
    if defaults:
        entry["defaults"] = defaults
    return entry


def _unit_classes(ctx: _Ctx, where: str) -> List[str]:
    """The classes the unit can be, as the definition's `node_type` field says
    (empty when the definition has no such field)."""
    return sorted({ctx.node(nt, where)["class"] for nt in
                   next((d.graph.node_types for d in ctx.t.fields
                         if d.graph and d.graph.verdict == "node_type"), {}).values()})


def _is_unit_element(ctx: _Ctx, f: Field, name: str) -> bool:
    """Whether `property_name` names a node element OF THE UNIT. The registry's
    elements are keyed by name across all classes: `crs` is an element of a
    ResourceNode (a GIS layer's CRS, node datamodel 1.6.39) and says nothing
    about a unit whose sheet has a field called `crs`. An element none of the
    unit's classes carries is not the unit's: the field stays a property. If
    some of them carry it, it is the element, and `_element_steps` refuses the
    classes that do not. When the definition does not say the unit's classes
    (no `node_type` field), the unit is read as a `UNIT_WHEN_UNDECIDED`."""
    rule = ctx.reg.node_elements.get(name)
    if rule is None:
        return False
    classes = _unit_classes(ctx, f"field '{f.id}'") or [UNIT_WHEN_UNDECIDED]
    return bool(set(classes) & set(rule.get("applies_to", [])))


def _element_steps(ctx: _Ctx, f: Field, name: str, anchor: str) -> Dict[str, Any]:
    """A field that writes a NODE ELEMENT of the unit: one `update_field` on the
    em.json place the datamodel declares, with the whole value."""
    rule = ctx.reg.node_elements[name]
    where = f"field '{f.id}'"
    field = rule.get("em_json")
    if not field or not (field in NATIVE_FIELDS or field.startswith("data.")):
        ctx.problems.append(f"{where}: node element '{name}' is declared with em_json {field!r}, "
                            f"which update_field cannot address (name, description, data.*)")
    if anchor != "$unit":
        ctx.problems.append(f"{where}: node element '{name}' is an element of the UNIT; the field "
                            f"attaches to {anchor}")
    fits = ELEMENT_VALUE_TYPES.get(rule.get("value"))
    if fits is None or f.type not in fits:
        ctx.problems.append(f"{where}: node element '{name}' holds a {rule.get('value')!r} "
                            f"value, which a field of type '{f.type}' does not write "
                            f"(writes it: {list(fits or ())})")
    unit_classes = _unit_classes(ctx, where)
    outside = [c for c in unit_classes if c not in rule.get("applies_to", [])]
    if outside:
        ctx.problems.append(f"{where}: node element '{name}' is declared on "
                            f"{rule.get('declared_on')} and the unit can be {outside}, which do "
                            f"not inherit it (node datamodel {ctx.reg.node_datamodel_version})")
    return {
        "each": False,
        "element": _drop_empty({"name": name, "declared_on": rule.get("declared_on"),
                                "value": rule.get("value"), "rdf": rule.get("rdf")}),
        "steps": [{"emit": {"op": "update_field", "node_id": anchor, "field": field,
                            "value": "$value"}}],
    }


def _node_key(f: Field) -> Dict[str, Any]:
    """How the node a `node` field points at is FOUND before it is created."""
    if f.type in ("person_ref", "actor_ref"):
        return {"id": "$value.ref", "name": "$value.name"}
    if f.type in ("epoch_ref", "activity_ref"):
        return {"id": "$value.ref", "name": "$value"}
    if f.type in LIST_TYPES:
        return {"name": "$item"}
    return {"name": "$value"}


def _entry(ctx: _Ctx, f: Field) -> Dict[str, Any]:
    g = f.graph
    v = g.verdict
    where = f"field '{f.id}'"
    base: Dict[str, Any] = {"verdict": v}

    if v == "none":
        out = {**base, "steps": []}
        if g.blocked_on:
            out["blocked_on"] = _drop_empty(dataclasses.asdict(g.blocked_on))
        else:
            out["reason"] = "presentation: the sheet says it, the graph does not"
        return out

    if v == "identity":
        return {**base, "steps": [], "names": "$unit",
                "designator": f.id == ctx.t.identity.unit_field_of()}

    if v == "node_type":
        return {**base, "steps": [], "decides": "unit.node_type",
                "table": {term: ctx.node(nt, where) for term, nt in g.node_types.items()}}

    anchor, after = ctx.anchor(f)

    if v == "property":
        name = g.property_name or g.qualia
        if g.property_name and _is_unit_element(ctx, f, g.property_name):
            out = {**base, **_element_steps(ctx, f, g.property_name, anchor)}
            out["scheme"] = f.vocabulary.scheme if f.vocabulary else None
        elif name in NATIVE_FIELDS and f.type not in LIST_TYPES:
            out = {**base, "each": False, "steps": [
                {"emit": {"op": "update_field", "node_id": anchor, "field": name,
                          "value": _value_ref(f)}}]}
        else:
            out = {**base, **_property_steps(ctx, f, name, anchor,
                                             registered=bool(g.qualia) or name in ctx.reg.qualia)}

    elif v == "vocabulary":
        name = g.qualia or g.property_name
        if not name:
            ctx.open.append({"field": f.id, "what": (
                "verdict 'vocabulary' without qualia or property_name: the definition does not "
                "say which property the concept is the value of, so nothing is produced")})
            out = {**base, "each": f.type in LIST_TYPES, "steps": [],
                   "open": "which property the concept is the value of"}
        else:
            out = {**base, **_property_steps(ctx, f, name, anchor,
                                             registered=name in ctx.reg.qualia)}
        out["scheme"] = f.vocabulary.scheme if f.vocabulary else None

    elif v == "node":
        target = ctx.node(g.node_type, where)
        content = f.type == "longtext"
        if content:
            # a longtext is a CONTENT, not a name: the node is minted for it and
            # carries it as description — it is never looked up by it
            resolve = {"$node": {"mint": True}}
            node = {"id": "$node", "node_type": target["node_type"],
                    "description": _value_ref(f)}
            steps = [{"emit": {"op": "add_node", "node": node}}]
        elif f.type == "resource_ref_list":
            # a FILE REFERENCE: found by its path, which is also its url — the
            # shape s3Dgraphy's own importer gives one (pyarchinit_importer
            # `_add_path_document`: DocumentNode deduped by path, url = path).
            # That importer shows the basename as name; a recipe has no
            # functions, so the name is the reference as written.
            resolve = {"$node": {"find": {"node_type": target["node_type"], "url": "$item"},
                                 "create": True}}
            node = {"id": "$node", "node_type": target["node_type"], "name": "$item",
                    "data": {"url": "$item"}}
            steps = [{"emit": {"op": "add_node", "node": node}, "when": "created"}]
        else:
            key = _node_key(f)
            resolve = {"$node": {"find": {"node_type": target["node_type"], **key},
                                 "create": True}}
            node = {"id": "$node", "node_type": target["node_type"], "name": key["name"]}
            steps = [{"emit": {"op": "add_node", "node": node}, "when": "created"}]
        src, dst = (anchor, "$node") if g.direction != "incoming" else ("$node", anchor)
        about = ctx.edge(g.edge_type, where, (ctx.classes(src, target["class"]),
                                              ctx.classes(dst, target["class"])))
        steps.append({"emit": {"op": "add_edge", "edge_type": g.edge_type,
                               "source": src, "target": dst}})
        out = {**base, "each": f.type in LIST_TYPES, "resolve": resolve, "steps": steps,
               "node": target, "edge": about}

    elif v == "edge":
        src, dst = (anchor, "$item") if g.direction == "outgoing" else ("$item", anchor)
        about = ctx.edge(g.edge_type, where, (ctx.classes(src), ctx.classes(dst)))
        out = {**base, "each": True,
               "resolve": {"$item": {"find": {"human_key": "$item", "kind": g.target},
                                     "when_missing": "not decided by the definition"}},
               "steps": [{"emit": {"op": "add_edge", "edge_type": g.edge_type,
                                   "source": src, "target": dst}}],
               "edge": about}
    else:  # pragma: no cover - validate_template refuses any other verdict first
        raise CompileError(ctx.t.id, [f"{where}: verdict '{v}'"])

    if after:
        out["after"] = after
    return out


def _unit(ctx: _Ctx) -> Dict[str, Any]:
    t = ctx.t
    deciders = [f for f in t.fields if f.graph and f.graph.verdict == "node_type"]
    if len(deciders) > 1:
        ctx.problems.append(f"{len(deciders)} fields decide the unit's node type "
                            f"({[f.id for f in deciders]}): one sheet, one type")
    decider = deciders[0] if deciders else None
    if decider is None:
        ctx.open.append({"field": "", "what": (
            "no field has verdict 'node_type': the definition does not say which node type the "
            "unit is, so the creator has to")})
    node_type: Dict[str, Any] = {
        "decided_by": decider.id if decider else None,
        "table": ({term: ctx.node(nt, f"field '{decider.id}'")
                   for term, nt in decider.graph.node_types.items()} if decider else {}),
        "when_empty": "not decided by the definition",
        "note": ("decided when the unit is CREATED: update_field addresses name, description "
                 "and data.* only, so an existing unit's node_type cannot be changed by an "
                 "operation of this vocabulary"),
    }
    return {
        "resolve": {"$unit": {"find": {"human_key": list(t.identity.human_key),
                                       "rule": t.identity.deduplication},
                              "create": True}},
        "steps": [{"emit": {"op": "add_node", "node": {
            "id": "$unit", "node_type": "$unit.node_type", "name": "$unit.name"}},
            "when": "created"}],
        "name": {"pattern": t.identity.pattern, "unit_field": t.identity.unit_field_of()},
        "node_type": node_type,
    }


def _check_operations(ctx: _Ctx, recipe: Dict[str, Any]) -> None:
    allowed = set(ctx.reg.operations)
    for fid, entry in [("unit", recipe["unit"])] + list(recipe["fields"].items()):
        for step in entry.get("steps", []):
            op = step["emit"]["op"]
            if op not in allowed:
                ctx.problems.append(f"{fid}: operation '{op}' is not one of s3Dgraphy's "
                                    f"{sorted(allowed)}")


def _recipe(ctx: _Ctx) -> Dict[str, Any]:
    recipe: Dict[str, Any] = {
        "operations": list(ctx.reg.operations),
        "unit": _unit(ctx),
        "fields": {f.id: _entry(ctx, f) for f in ctx.t.fields},
    }
    recipe["anchors"] = {name: {"declared_by": fids, "defined": False}
                         for name, fids in sorted(ctx.anchors.items())}
    for name, fids in sorted(ctx.anchors.items()):
        ctx.open.append({"field": ", ".join(fids), "what": (
            f"attaches_to '{name}': the definition names it and does not define it — the "
            f"statement hangs on $anchor.{name}, which the creator has to resolve")})
    recipe["open"] = ctx.open
    _check_operations(ctx, recipe)
    return recipe


# ── the whole document ───────────────────────────────────────────────────────

def _header_vocabularies(t: Template, vocab: Vocabularies) -> List[Dict[str, Any]]:
    """The schemes the definition names, and — right after each declared one
    that has it — its provisional stand-in (SPEC §3.2), so a consumer that
    vendors the header's schemes vendors the one that actually answers."""
    def entry(s, **extra):
        return _drop_empty({
            "id": s.id, "authority": s.authority, "status": s.status, "origin": s.origin,
            "version": s.version, "uri": s.uri, "license": s.license,
            "binding_thes_id": s.binding_thes_id, "fixture": s.fixture or None,
            "provisional": s.provisional, "unverified_languages": s.unverified_languages,
            **extra})
    out, seen = [], set()
    for sid in t.vocabularies:
        s = vocab.schemes.get(sid)
        if s is None or sid in seen:
            continue
        out.append(entry(s)); seen.add(sid)
        if s.provisional and s.provisional not in seen:
            out.append(entry(vocab.schemes[s.provisional], provisional_for=sid))
            seen.add(s.provisional)
    return out


def _mark_provisional(visual: Dict[str, Any], recipe: Dict[str, Any], vocab: Vocabularies) -> None:
    """A field keeps citing the NORM's scheme; where that scheme is declared and
    has a stand-in, the field says which scheme to resolve with."""
    for f in visual.get("fields") or []:
        v = f.get("vocabulary")
        if v and v.get("scheme") in vocab.schemes and vocab.schemes[v["scheme"]].provisional:
            v["provisional"] = vocab.schemes[v["scheme"]].provisional
    for entry in (recipe.get("fields") or {}).values():
        sid = entry.get("scheme")
        if sid in vocab.schemes and vocab.schemes[sid].provisional:
            entry["provisional"] = vocab.schemes[sid].provisional


def compile_template(t: Template, reg: Registry, vocab: Vocabularies) -> Dict[str, Any]:
    """The compiled form of one definition, or CompileError / ValidationError.

    A definition that does not validate does not compile: that is where "no
    version" and "verdict: undecided" are refused.
    """
    validate_template(t, reg, known_schemes=vocab.scheme_ids())
    ctx = _Ctx(t, reg)
    recipe = _recipe(ctx)
    if ctx.problems:
        raise CompileError(t.id, ctx.problems)
    std = t.standard
    header = {
        "id": t.id,
        "version": t.version,
        "standard": _drop_empty({
            "authority": std.authority, "code": std.code, "version": std.version,
            "kind": std.kind, "title": std.title, "license": std.license,
            "attribution": std.attribution, "source": std.source,
            "invented": std.invented,
        }),
        "source_language": t.source_language,
        "languages": list(t.languages),
        "vocabularies": _header_vocabularies(t, vocab),
        "digest": "",
        "datamodel": reg.header(),
        "compiled_by": {"name": "stratigraph-templates", "version": __version__},
    }
    visual = _visual(t)
    _mark_provisional(visual, recipe, vocab)
    doc = {"format": FORMAT, "format_version": FORMAT_VERSION, "header": header,
           "visual": visual, "recipe": recipe}
    header["digest"] = digest_of(doc)
    return doc


def dumps(doc: Dict[str, Any]) -> str:
    """The file as written: stable key order (the order of the definition), so a
    change of the compiler is a readable diff."""
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"


# ── dist/ ────────────────────────────────────────────────────────────────────

class PublishedVersionChanged(RuntimeError):
    """A version already in dist/ would be overwritten by different content."""


def _semver_key(v: str) -> Tuple:
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$", v)
    if not m:
        return (0, 0, 0, 0, v)
    major, minor, patch, pre = m.groups()
    # a pre-release sorts BEFORE its release
    return (int(major), int(minor), int(patch), 0 if pre else 1, pre or "")


def write_compiled(doc: Dict[str, Any], out_dir: Path) -> Tuple[Path, str]:
    """Write `<out>/<id>/<version>.json`; returns (path, what happened).

    A version is a promise: once a file with that version exists, a DIFFERENT
    digest under the same version is refused — bump `template.version`. The same
    digest rewrites the file (the datamodel line may have moved on) and says so.
    """
    head = doc["header"]
    path = out_dir / head["id"] / f"{head['version']}.json"
    what = "written"
    if path.is_file():
        old = json.loads(path.read_text(encoding="utf-8"))
        old_digest = old.get("header", {}).get("digest")
        if old_digest != head["digest"]:
            raise PublishedVersionChanged(
                f"{head['id']} {head['version']} is already in {path} with digest {old_digest}, "
                f"and the definition now compiles to {head['digest']}. A published version does "
                f"not change: raise template.version")
        what = "unchanged" if path.read_text(encoding="utf-8") == dumps(doc) else "rewritten (same digest)"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(doc), encoding="utf-8")
    return path, what


def write_index(out_dir: Path) -> Path:
    """`<out>/index.json`: every compiled file present, by definition and version."""
    schede: Dict[str, Any] = {}
    for f in sorted(out_dir.glob("*/*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        head = doc.get("header", {})
        entry = schede.setdefault(head["id"], {"versions": {}})
        entry["versions"][head["version"]] = {
            "path": f.relative_to(out_dir).as_posix(),
            "digest": head["digest"],
            "standard": {k: head["standard"].get(k) for k in ("authority", "code", "version",
                                                             "invented")},
            # `digest` here is the DATAMODEL's fingerprint (s3Dgraphy
            # api.datamodel_fingerprint), not the sheet's: the sheet's is above
            "datamodel": {k: head["datamodel"].get(k) for k in ("nodes", "connections",
                                                               "qualia", "em_ttl", "digest")},
        }
    for entry in schede.values():
        ordered = sorted(entry["versions"], key=_semver_key)
        entry["versions"] = {v: entry["versions"][v] for v in ordered}
        entry["latest"] = ordered[-1]
    index = {"format": FORMAT + "/index", "format_version": FORMAT_VERSION,
             "schede": dict(sorted(schede.items()))}
    path = out_dir / "index.json"
    path.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def build(templates: List[Template], reg: Registry, vocab: Vocabularies,
          out_dir: Path) -> Tuple[List[Tuple[str, Path, str]], List[Tuple[str, str]]]:
    """Compile each definition; `(written, refused)`. One refusal does not stop
    the others — but it is reported, and the command exits non-zero."""
    written: List[Tuple[str, Path, str]] = []
    refused: List[Tuple[str, str]] = []
    for t in templates:
        try:
            doc = compile_template(t, reg, vocab)
            path, what = write_compiled(doc, out_dir)
            written.append((t.id, path, what))
        except (ValidationError, CompileError, PublishedVersionChanged) as exc:
            refused.append((t.id, str(exc)))
    if out_dir.is_dir():
        write_index(out_dir)
    return written, refused


def summary(doc: Dict[str, Any]) -> Dict[str, Any]:
    """The numbers of a compiled recipe — what `build` prints, and what a test pins."""
    fields = doc["recipe"]["fields"]
    by_verdict: Dict[str, int] = {}
    ops: Dict[str, int] = {}
    for entry in fields.values():
        by_verdict[entry["verdict"]] = by_verdict.get(entry["verdict"], 0) + 1
        for step in entry["steps"]:
            op = step["emit"]["op"]
            ops[op] = ops.get(op, 0) + 1
    return {"fields": len(fields), "verdicts": dict(sorted(by_verdict.items())),
            "steps": dict(sorted(ops.items())), "open": len(doc["recipe"]["open"])}
