"""From an ICCD catalogue XSD to a DRAFT definition — a proposal, not truth.

The ICCD catalogue normatives are not validation schemas: they are form
definitions.  Every element carries ``alias`` (the human label), ``len``,
``node_linkMandatory``, ``maxOccurs`` and ``binding_thesId`` (the link to a
controlled vocabulary) as *fixed* attributes.  All of that can be lifted
mechanically.

What cannot be lifted:

* the GRAPH BINDING — every field comes out marked ``verdict: undecided``, and
  the validator refuses a definition that still carries the marker, so a draft
  can never be mistaken for a decided definition;
* the SHEET — an XSD says nothing about where a box sits on paper.  The draft
  emits one row per field so that nothing is lost, and says so.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Tuple

XS = "{http://www.w3.org/2001/XMLSchema}"

_KIND_RE = re.compile(r"^(paragrafo|campostrutturato|camposemplice|tag)_(.+)$")


def _fixed(el: ET.Element, name: str) -> Optional[str]:
    """The value of a fixed attribute declaration, e.g. alias="Tipo scheda"."""
    for attr in el.iter(f"{XS}attribute"):
        if attr.get("name") == name and attr.get("fixed") is not None:
            return attr.get("fixed")
    return None


def _own_fixed(el: ET.Element, name: str) -> Optional[str]:
    """Same, but ignoring attributes that belong to nested elements."""
    for child in el.iter(f"{XS}attribute"):
        # only attributes whose closest element ancestor is `el`
        pass
    # walk manually: stop at nested xs:element
    def walk(node: ET.Element) -> Optional[str]:
        for c in list(node):
            if c.tag == f"{XS}element":
                continue
            if c.tag == f"{XS}attribute" and c.get("name") == name and c.get("fixed") is not None:
                return c.get("fixed")
            found = walk(c)
            if found is not None:
                return found
        return None

    return walk(el)


def _slug(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip().lower()).strip("_")
    return s or "campo"


def _yaml_str(text: str) -> str:
    return '"' + str(text).replace("\\", "\\\\").replace('"', '\\"') + '"'


def extract_xsd(
    path: Path, authority: str = "ICCD", code: str = "SAS", version: str = "3.00"
) -> Tuple[str, Dict[str, int]]:
    tree = ET.parse(str(path))
    root = tree.getroot()

    paragraphs: List[Dict] = []
    fields: List[Dict] = []
    # Counted separately on purpose: in an ICCD XSD a PARAGRAPH can itself be
    # mandatory or repeatable, and lumping paragraphs together with fields is
    # how two honest counts of the same file come out different.
    stats = {
        "records": 0,
        "paragraphs": 0,
        "structured_fields": 0,
        "simple_fields": 0,
        "records_with_alias": 0,
        "fields_with_vocabulary": 0,
        "mandatory_fields": 0,
        "mandatory_paragraphs": 0,
        "repeatable_fields": 0,
        "repeatable_paragraphs": 0,
        "undecided_bindings": 0,
    }

    def visit(el: ET.Element, current_par: Optional[str]) -> None:
        eid = el.get("id") or ""
        m = _KIND_RE.match(eid)
        kind = m.group(1) if m else None
        if kind in ("paragrafo", "campostrutturato", "camposemplice"):
            stats["records"] += 1
        alias = _own_fixed(el, "alias")
        if alias and kind in ("paragrafo", "campostrutturato", "camposemplice"):
            stats["records_with_alias"] += 1

        if kind == "paragrafo":
            pid = _slug(m.group(2))
            stats["paragraphs"] += 1
            if _own_fixed(el, "node_linkMandatory") == "true":
                stats["mandatory_paragraphs"] += 1
            if el.get("maxOccurs") == "unbounded":
                stats["repeatable_paragraphs"] += 1
            paragraphs.append({"id": pid, "label": alias or m.group(2), "fields": []})
            current_par = pid
        elif kind in ("campostrutturato", "camposemplice"):
            if kind == "campostrutturato":
                stats["structured_fields"] += 1
            else:
                stats["simple_fields"] += 1
            fid = _slug(m.group(2))
            thes = _own_fixed(el, "binding_thesId")
            mandatory = _own_fixed(el, "node_linkMandatory") == "true"
            repeatable = el.get("maxOccurs") == "unbounded"
            if thes:
                stats["fields_with_vocabulary"] += 1
            if mandatory:
                stats["mandatory_fields"] += 1
            if repeatable:
                stats["repeatable_fields"] += 1
            stats["undecided_bindings"] += 1
            fields.append(
                {
                    "id": fid,
                    "label": alias or m.group(2),
                    "xsd_name": el.get("name"),
                    "xsd_id": eid,
                    "structured": kind == "campostrutturato",
                    "mandatory": mandatory,
                    "repeatable": repeatable,
                    "thes": thes,
                    "len": _own_fixed(el, "len"),
                    "help": _own_fixed(el, "node_help"),
                }
            )
            if current_par and paragraphs:
                for p in paragraphs:
                    if p["id"] == current_par:
                        p["fields"].append(fid)
                        break

        for child in list(el):
            visit(child, current_par)

    for child in list(root):
        visit(child, None)

    # a paragraph with no fields would break the round trip; keep it visible instead
    lines: List[str] = []
    a = lines.append
    a(f"# DRAFT — proposta estratta da {path.name}")
    a("#")
    a("# Struttura, etichette (alias), obbligatorietà, ripetibilità e legami ai vocabolari")
    a("# vengono dall'XSD e sono AFFIDABILI. Due cose non ci sono e non possono esserci:")
    a("#")
    a("#  1. il LEGAME AL GRAFO: ogni campo esce con `verdict: undecided`, e il validatore")
    a("#     rifiuta una definizione che porti ancora quel marcatore. Lo decide una persona.")
    a("#  2. il FOGLIO: un XSD non dice dove sta una casella sulla carta. Qui c'è una riga per")
    a("#     campo perché non si perda nulla, non perché sia un impaginato.")
    a("#")
    a(f"# Estratto da: {path}")
    a("")
    a("template:")
    a(f"  id: draft-{code.lower()}-{version.replace('.', '')}")
    a("  standard:")
    a(f"    authority: {authority}")
    a(f"    code: {code}")
    a(f"    version: {_yaml_str(version)}")
    a("    kind: catalogue_record")
    a("    title:")
    a(f"      it: {_yaml_str(f'Bozza estratta dalla normativa {code} {version}')}")
    a(f"    source: {_yaml_str(path.name)}")
    a('    license: "CC BY-SA"')
    a(f"    attribution: {_yaml_str('MiC — ICCD')}")
    a("  source_language: it")
    a("  languages: [it]")
    a("  identity:")
    a("    human_key:")
    a("      fields: []          # DA DECIDERE: quali campi compongono l'identificativo umano")
    a('      pattern: ""')
    a("    uid:")
    a("      policy: minted_by_creator")
    a("      derive_from_human_key: false")
    a("  provenance:")
    a("    per_field: true")
    if any(f["thes"] for f in fields):
        a("  vocabularies:")
        for thes in sorted({f["thes"] for f in fields if f["thes"]}):
            a(f"    - {authority.lower()}-{code.lower()}-{_slug(thes)}")
    a("  paragraphs:")
    for p in paragraphs:
        a(f"    - id: {p['id']}")
        a(f"      labels: {{it: {_yaml_str(p['label'])}}}")
        if p["fields"]:
            a("      fields:")
            for fid in p["fields"]:
                a(f"        - {fid}")
        else:
            a("      fields: []      # paragrafo senza campi propri nell'XSD")
    a("  fields:")
    for f in fields:
        a(f"    - id: {f['id']}")
        a(f"      labels: {{it: {_yaml_str(f['label'])}}}")
        a("      type: text          # DA DECIDERE: l'XSD dà la lunghezza, non il tipo di dato")
        if f["mandatory"]:
            a("      required: true")
        if f["repeatable"]:
            a("      repeatable: true")
        if f["len"]:
            a(f"      max_len: {_yaml_str(f['len'])}")
        if f["help"]:
            a(f"      help: {{it: {_yaml_str(f['help'][:200])}}}")
        if f["thes"]:
            a("      vocabulary:")
            a(f"        scheme: {authority.lower()}-{code.lower()}-{_slug(f['thes'])}")
            a(f"        binding: {_yaml_str(f['thes'])}")
        a("      graph:")
        a("        verdict: undecided   # DA DECIDERE da una persona")
        a(f"        note: {_yaml_str('xsd: ' + str(f['xsd_id']))}")
    a("  sheet:")
    a("    page: A4")
    a("    margins_mm: {top: 12, right: 12, bottom: 12, left: 12}")
    a("    sides:")
    a("      - id: recto")
    a("        labels: {it: fronte}")
    a("        rows:   # NON è un impaginato: una riga per campo, da rifare a mano")
    for f in fields:
        a("          - h: 8")
        a(f"            cells: [{{field: {f['id']}, w: 100}}]")
    a("")
    return "\n".join(lines), stats
