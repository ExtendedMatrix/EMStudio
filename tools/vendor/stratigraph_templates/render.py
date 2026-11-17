"""One walk over the definition, two outputs.

``sheet_html(mode="print")`` gives the A4 recto/verso for WeasyPrint;
``sheet_html(mode="form")`` gives the fillable, liquid form.  They are the same
function on purpose: if printing needed something the form does not use, the
format would be incomplete, and we would rather find that out here than in two
diverging files.

There is nothing in this module about ICCD, about Italian, or about
stratigraphy.  Everything a standard says about itself is read from the
template, which is how a second standard can arrive without a line of code.
"""

from __future__ import annotations

import html
from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, List, Optional, Tuple

from .model import Cell, Field, Record, Row, Template, label_of
from .vocab import Vocabularies, VocabularyError

#: width of the strip that carries a rotated block label, in millimetres
ROTATED_STRIP_MM = 6.5
#: font size of a block label, in points — the validator needs it to tell whether
#: a rotated label fits the height of its block
STRIP_FONT_PT = 5.2

PROVENANCE_MARK = {
    "asserted": "",
    "ai_drafted": "AI",
    "human_validated": "AI✓",
}


class RenderError(ValueError):
    """The definition cannot produce a sheet — say why, do not improvise."""


@dataclass
class VocabTrace:
    """How every controlled term got its label. Printed by --explain-vocab."""
    rows: List[Tuple[str, str, str, str]] = dc_field(default_factory=list)  # field, concept, label, via

    def add(self, field_id: str, concept: str, label: str, via: str) -> None:
        self.rows.append((field_id, concept, label, via))

    def uncontrolled(self) -> List[Tuple[str, str, str, str]]:
        return [r for r in self.rows if r[3] == "uncontrolled_string"]


def _e(text: Any) -> str:
    return html.escape("" if text is None else str(text))


def _as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


# --------------------------------------------------------------------------- values
def _term_label(
    field: Field, item: Any, lang: str, vocab: Optional[Vocabularies], trace: Optional[VocabTrace]
) -> str:
    """A controlled term shows its CONCEPT resolved in ``lang`` — never a stored string."""
    if isinstance(item, dict) and item.get("concept"):
        concept = str(item["concept"])
        if vocab is None or field.vocabulary is None:
            label, via = str(item.get("label") or concept), "record_label"
        else:
            try:
                res = vocab.resolve(field.vocabulary.scheme, concept, lang, item.get("label"))
                label, via = res.label, res.via
            except VocabularyError as exc:
                raise RenderError(f"field '{field.id}': {exc}") from None
        if trace is not None:
            trace.add(field.id, concept, label, via)
        return label
    # a word with no concept (`{label}`: what the widget writes for a term outside
    # the list) or a bare string in a controlled box: allowed, recorded as what it is
    word = str(item.get("label") or "") if isinstance(item, dict) else str(item)
    if trace is not None:
        trace.add(field.id, "", word, "uncontrolled_string")
    return word


def _value_html(
    field: Field,
    value: Any,
    lang: str,
    mode: str,
    vocab: Optional[Vocabularies],
    trace: Optional[VocabTrace],
) -> str:
    t = field.type

    if t == "choice":
        boxes = []
        chosen = value if isinstance(value, str) else (value or {}).get("value") if isinstance(value, dict) else None
        for opt in field.options:
            ticked = "on" if chosen == opt.value else "off"
            if mode == "form":
                checked = " checked" if ticked == "on" else ""
                boxes.append(
                    f'<label class="opt"><input type="radio" name="{_e(field.id)}" '
                    f'value="{_e(opt.value)}"{checked}> {_e(opt.label(lang))}</label>'
                )
            else:
                boxes.append(
                    f'<span class="opt"><span class="tick {ticked}"></span>{_e(opt.label(lang))}</span>'
                )
        return f'<div class="opts">{"".join(boxes)}</div>'

    if t == "checkbox":
        ticked = "on" if value else "off"
        if mode == "form":
            checked = " checked" if value else ""
            return f'<input type="checkbox" name="{_e(field.id)}"{checked}>'
        return f'<span class="tick {ticked}"></span>'

    if t in ("term", "term_list"):
        items = _as_list(value)
        labels = [_term_label(field, i, lang, vocab, trace) for i in items]
        text = " · ".join(labels)
        if mode == "form":
            return (
                f'<input class="v" name="{_e(field.id)}" value="{_e(text)}" '
                f'data-controlled="1" autocomplete="off">'
            )
        return f'<span class="v">{_e(text)}</span>'

    if t in ("unit_ref_list", "record_ref_list", "resource_ref_list"):
        refs = []
        for item in _as_list(value):
            if isinstance(item, dict):
                refs.append(str(item.get("ref", "")))
            else:
                refs.append(str(item))
        text = ", ".join(r for r in refs if r)
        if mode == "form":
            return f'<input class="v refs" name="{_e(field.id)}" value="{_e(text)}" autocomplete="off">'
        return f'<span class="v refs">{_e(text)}</span>'

    if t == "quantity_list":
        rows = []
        for item in _as_list(value):
            if isinstance(item, dict):
                name = item.get("label") or item.get("qualia") or ""
                val = item.get("value", "")
                unit = item.get("unit", "")
                rows.append(f'<span class="q"><b>{_e(name)}</b> {_e(val)} {_e(unit)}</span>')
            else:
                rows.append(f'<span class="q">{_e(item)}</span>')
        inner = "".join(rows)
        if mode == "form":
            plain = "; ".join(
                f"{(i.get('label') or i.get('qualia') or '')}: {i.get('value','')} {i.get('unit','')}".strip()
                if isinstance(i, dict) else str(i)
                for i in _as_list(value)
            )
            return f'<textarea class="v qty" name="{_e(field.id)}" rows="2">{_e(plain)}</textarea>'
        return f'<div class="qty">{inner}</div>'

    if t in ("person_ref", "actor_ref", "epoch_ref", "activity_ref"):
        items = []
        for item in _as_list(value):
            if isinstance(item, dict):
                items.append(str(item.get("name") or item.get("ref") or ""))
            else:
                items.append(str(item))
        text = ", ".join(i for i in items if i)
        if mode == "form":
            return f'<input class="v" name="{_e(field.id)}" value="{_e(text)}" autocomplete="off">'
        return f'<span class="v">{_e(text)}</span>'

    if t == "longtext":
        if mode == "form":
            return f'<textarea class="v long" name="{_e(field.id)}" rows="3">{_e(value or "")}</textarea>'
        return f'<span class="v long">{_e(value or "")}</span>'

    # identifier, text, integer, decimal, date
    if mode == "form":
        input_type = {"integer": "number", "decimal": "number", "date": "date"}.get(t, "text")
        return (
            f'<input class="v" type="{input_type}" name="{_e(field.id)}" '
            f'value="{_e(value if value is not None else "")}" autocomplete="off">'
        )
    return f'<span class="v">{_e(value if value is not None else "")}</span>'


# --------------------------------------------------------------------------- layout
def _provenance_badge(record: Optional[Record], field: Field) -> str:
    if record is None:
        return ""
    state = (record.field_provenance.get(field.id) or {}).get("state")
    mark = PROVENANCE_MARK.get(state or "", "")
    if not mark:
        return ""
    who = (record.field_provenance.get(field.id) or {}).get("by", "")
    return f'<span class="prov" title="{_e(who)}">{_e(mark)}</span>'


def _cell_html(
    cell: Cell,
    t: Template,
    record: Optional[Record],
    lang: str,
    mode: str,
    vocab: Optional[Vocabularies],
    trace: Optional[VocabTrace],
) -> str:
    # `width` rather than a percentage flex-basis: both behave the same once the
    # labelled block stopped wrapping its rows in a flex item (see the CSS note
    # on .block.labelled), and `width` with border-box is the one whose meaning
    # does not depend on that.
    style = f"flex: 0 0 auto; width: {cell.w}%; max-width: {cell.w}%;"
    classes = ["cell"]
    if cell.style:
        classes.append(f"style-{cell.style}")

    if cell.field:
        field = t.field(cell.field)
        value = None if record is None else record.values.get(field.id)
        label = "" if cell.label == "none" else field.label(lang)
        req = ' <span class="req">*</span>' if field.required else ""
        head = (
            f'<div class="lbl">{_e(label)}{req}{_provenance_badge(record, field)}</div>'
            if label
            else ""
        )
        body = _value_html(field, value, lang, mode, vocab, trace)
        classes.append(f"t-{field.type}")
        return f'<div class="{" ".join(classes)}" style="{style}" data-field="{_e(field.id)}">{head}{body}</div>'

    if cell.rows:
        inner = "".join(_row_html(r, t, record, lang, mode, vocab, trace) for r in cell.rows)
        if cell.label == "none":
            classes.append("block")
            return f'<div class="{" ".join(classes)}" style="{style}">{inner}</div>'
        classes.append("block labelled")
        strip = (
            f'<div class="strip {"rot" if cell.rotated else ""}">'
            f'<span class="txt">{_e(cell.block_label(lang))}</span></div>'
        )
        return f'<div class="{" ".join(classes)}" style="{style}">{strip}{inner}</div>' 

    classes.append("spacer")
    return f'<div class="{" ".join(classes)}" style="{style}"></div>'


def _row_html(
    row: Row,
    t: Template,
    record: Optional[Record],
    lang: str,
    mode: str,
    vocab: Optional[Vocabularies],
    trace: Optional[VocabTrace],
) -> str:
    cells = "".join(_cell_html(c, t, record, lang, mode, vocab, trace) for c in row.cells)
    return f'<div class="row" style="--h: {row.h}mm">{cells}</div>'


def _layout(t: Template) -> List[Tuple[str, Dict[str, str], List[Row]]]:
    """(side id, side labels, rows) to draw.

    The sheet as declared; or — for a definition that declares NO sheet
    (SPEC §4) — one liquid page of its fields, a block per paragraph, which is
    what a form of a database looks like. It is never offered for printing: an
    A4 drawn from nothing would look like the standard's paper model."""
    if t.sheet is not None:
        return [(s.id, s.labels or {}, s.rows) for s in t.sheet.sides]
    rows = [Row(h=8.0, cells=[Cell(block=p.id, block_labels=p.labels, w=100.0,
                                   rows=[Row(h=8.0, cells=[Cell(field=fid, w=100.0)])
                                         for fid in p.fields])])
            for p in t.paragraphs]
    return [("fields", dict(t.standard.title), rows)]


def _head_html(t: Template, record: Optional[Record], lang: str, side_id: str,
               side_labels: Dict[str, str]) -> str:
    std = t.standard
    title = label_of(std.title, lang, f"template '{t.id}' title")
    side_label = label_of(side_labels or {}, lang, f"side '{side_id}'")
    key = human_key(t, record, lang) if record else ""
    demo = ' <span class="demo">FIXTURE</span>' if std.invented else ""
    return (
        f'<div class="head"><div class="code">{_e(std.authority)} {_e(std.code)} '
        f'{_e(std.version)}{demo}</div>'
        f'<div class="title">{_e(title)}</div>'
        f'<div class="side">{_e(side_label)} · {_e(key)}</div></div>'
    )


def human_key(t: Template, record: Optional[Record], lang: str) -> str:
    """The human identifier, built as THIS standard declares it."""
    if record is None:
        return ""
    pattern = t.identity.pattern
    if pattern:
        out = pattern
        for fid in t.identity.human_key:
            out = out.replace("{" + fid + "}", str(record.values.get(fid, "") or ""))
        return out.strip()
    return " ".join(str(record.values.get(f, "") or "") for f in t.identity.human_key).strip()


# --------------------------------------------------------------------------- CSS
_BASE_CSS = """
:root { --ink: #111; --rule: #444; --soft: #7a7a7a; --fill: #1a3f7a; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: var(--ink); }
.sheet { background: #fff; }
.head { display: flex; align-items: baseline; gap: 4mm; border-bottom: 0.6mm solid var(--ink);
        padding-bottom: 1mm; margin-bottom: 1.5mm; }
.head .code { font-weight: 700; font-size: 8pt; letter-spacing: .04em; }
.head .title { font-size: 8pt; flex: 1; }
.head .side { font-size: 7pt; color: var(--soft); text-transform: uppercase;
              overflow-wrap: anywhere; }
.head .demo { background: #b00; color: #fff; padding: 0 1mm; font-size: 6pt; }
.row { display: flex; width: 100%; min-height: var(--h); align-items: stretch; }
/* the declared height is a minimum, never a guillotine: a box that would clip what
   somebody wrote grows instead, and the renderer reports the page it cost. */
.cell { border: 0.25mm solid var(--rule); padding: 0.6mm 1mm;
        display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
.cell.spacer { border: none; }
.lbl { font-size: 5.4pt; letter-spacing: .02em; line-height: 1.05; text-transform: uppercase;
       color: var(--ink); }
.req { color: #b00; }
.prov { font-size: 4.6pt; background: #eee; border: 0.2mm solid var(--soft); padding: 0 0.6mm;
        margin-left: 0.8mm; vertical-align: super; }
.v { font-size: 8pt; color: var(--fill); line-height: 1.2; word-wrap: break-word; }
.v.long { font-size: 7.6pt; }
.v.refs { font-weight: 700; letter-spacing: .02em; word-break: break-all; }
.qty .q { display: block; font-size: 7pt; color: var(--fill); }
.qty .q b { font-weight: 600; color: var(--ink); font-size: 6pt; text-transform: uppercase; }
.opts { display: flex; gap: 2mm; flex-wrap: wrap; }
.opt { font-size: 5pt; text-transform: uppercase; display: inline-flex; align-items: center;
        gap: 0.8mm; white-space: nowrap; }
.tick { display: inline-block; width: 2.6mm; height: 2.6mm; border: 0.25mm solid var(--rule); }
.tick.on { background: var(--fill); box-shadow: inset 0 0 0 0.5mm #fff; }
/* A labelled block reserves the strip with its own PADDING and paints the label
   in an absolutely positioned box.  The strip used to be a flex sibling, and the
   nested percentages then resolved against the block instead of the space left
   over — every inner row came out a strip too wide. */
.block { display: block; border: none; padding: 0; }
.block.labelled { position: relative; border: 0.25mm solid var(--rule);
                  padding: 0 0 0 STRIPmm; }
.block .row { width: 100%; }
.strip { position: absolute; left: 0; top: 0; height: 100%; width: STRIPmm;
         border-right: 0.25mm solid var(--rule); background: #f2f2f2; font-size: 5.2pt;
         text-transform: uppercase; overflow: hidden; }
.strip .txt { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
         white-space: nowrap; letter-spacing: .04em; }
.strip.rot .txt { transform: translate(-50%, -50%) rotate(-90deg); }
""".replace("STRIP", str(ROTATED_STRIP_MM))

_PRINT_CSS = """
@page { size: A4; margin: MARGIN; }
.sheet { page-break-after: always; }
.sheet:last-of-type { page-break-after: auto; }
"""

_FORM_CSS = """
body { background: #eef0f3; }
.wrap { display: flex; gap: 8px; padding: 8px; align-items: flex-start; }
.sheet { flex: 1 1 0; max-width: 210mm; padding: 6mm; border-radius: 6px;
         box-shadow: 0 1px 4px rgba(0,0,0,.18); }
.row { min-height: var(--h); }
.cell { padding: 2px 4px; }
.lbl { font-size: 8px; color: #444; }
input.v, textarea.v { width: 100%; border: 0; border-bottom: 1px dotted #99a; background: transparent;
        font: inherit; font-size: 11px; color: var(--fill); padding: 1px 0; min-height: 16px; }
textarea.v { resize: vertical; }
input.v:focus, textarea.v:focus { outline: 2px solid #2b6cb0; outline-offset: 1px; background: #fffbe8; }
.sidebar { position: sticky; top: 8px; flex: 0 0 200px; background: #fff; border-radius: 6px;
           padding: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.12); font-size: 12px; }
.sidebar h2 { font-size: 12px; margin: 4px 0; }
/* On paper a group label is a vertical strip because the paper has no room; in a
   form there is room, so the same block_label becomes a header. Same datum,
   different medium — which is the whole point of keeping the sheet declarative. */
.block.labelled { padding: 18px 0 0 0; }
.strip { position: absolute; top: 0; left: 0; width: 100%; height: 16px;
         border-right: 0; border-bottom: 1px solid #d8dde5; background: #f6f7f9; }
.strip .txt { position: static; transform: none !important; display: block;
              padding: 2px 6px; font-size: 9px; font-weight: 700; letter-spacing: .04em; }
.sidebar a { display: block; color: #2b6cb0; text-decoration: none; padding: 2px 0; }
.side-tabs { display: none; }

/* desktop 16:9 — two pages side by side */
@media (min-width: 1100px) { .wrap { flex-wrap: nowrap; } }

/* tablet — one sheet at a time */
@media (max-width: 1099px) {
  .wrap { flex-wrap: wrap; }
  .sidebar { flex: 1 1 100%; position: static; }
  .side-tabs { display: flex; gap: 6px; flex: 1 1 100%; }
  .side-tabs button { flex: 1; padding: 10px; font-size: 14px; border-radius: 6px;
                      border: 1px solid #b8c0cc; background: #fff; }
  .side-tabs button[aria-pressed="true"] { background: #2b6cb0; color: #fff; border-color: #2b6cb0; }
  .sheet { flex: 1 1 100%; max-width: none; }
  .sheet[hidden] { display: none; }
}

/* phone — one column, one thumb: rows stop being rows */
@media (max-width: 640px) {
  body { background: #fff; }
  .wrap { padding: 0; }
  .sheet { padding: 8px 10px 96px; box-shadow: none; border-radius: 0; }
  .head { position: sticky; top: 0; background: #fff; z-index: 5; padding-top: 6px; flex-wrap: wrap; }
  .row { display: block; height: auto !important; min-height: 0; }
  .cell { flex: none !important; max-width: none !important; width: 100% !important;
          border: 0; border-bottom: 1px solid #e2e6ec; padding: 10px 2px; }
  .block.labelled { flex-direction: column; border: 0; }
  .strip { flex: none; writing-mode: horizontal-tb !important; transform: none !important;
           justify-content: flex-start; border-right: 0; border-bottom: 1px solid #d8dde5;
           font-size: 11px; padding: 8px 2px; background: #fff; font-weight: 700; }
  .lbl { font-size: 12px; text-transform: none; font-weight: 600; }
  input.v, textarea.v { font-size: 16px; min-height: 40px; border: 1px solid #c8cfd8;
           border-radius: 8px; padding: 8px; background: #fff; }
  .opts { gap: 10px; }
  .opt { font-size: 14px; text-transform: none; }
  .opt input { width: 22px; height: 22px; }
}
"""


def _margin_css(t: Template) -> str:
    m = (t.sheet.margins_mm if t.sheet is not None else None) or {}
    return (
        f"{m.get('top', 12)}mm {m.get('right', 12)}mm "
        f"{m.get('bottom', 12)}mm {m.get('left', 12)}mm"
    )


# --------------------------------------------------------------------------- entry
def sheet_html(
    t: Template,
    record: Optional[Record] = None,
    lang: Optional[str] = None,
    mode: str = "print",
    vocab: Optional[Vocabularies] = None,
    trace: Optional[VocabTrace] = None,
) -> str:
    if mode not in ("print", "form"):
        raise RenderError(f"unknown render mode '{mode}'")
    lang = lang or t.source_language
    if lang not in t.languages:
        raise RenderError(
            f"template '{t.id}' does not declare language '{lang}' (declared: {t.languages}). "
            f"A sheet is rendered in a language its definition speaks, not in a language guessed "
            f"from a generic dictionary"
        )
    if record is not None and record.template != t.id:
        raise RenderError(
            f"record says template '{record.template}' but the template given is '{t.id}'"
        )

    if t.sheet is None and mode == "print":
        raise RenderError(
            f"template '{t.id}' declares no sheet: there is no paper model to print. Its fields "
            f"are shown by the form (`form`); drawing an A4 for it would invent one"
        )
    layout = _layout(t)
    sides = []
    for side_id, side_labels, side_rows in layout:
        rows = "".join(_row_html(r, t, record, lang, mode, vocab, trace) for r in side_rows)
        sides.append(
            f'<section class="sheet" id="side-{_e(side_id)}" data-side="{_e(side_id)}">'
            f"{_head_html(t, record, lang, side_id, side_labels)}{rows}</section>"
        )

    css = _BASE_CSS + (
        _PRINT_CSS.replace("MARGIN", _margin_css(t)) if mode == "print" else _FORM_CSS
    )
    title = f"{t.standard.authority} {t.standard.code} {t.standard.version} — {human_key(t, record, lang) or t.id}"

    if mode == "print":
        body = "".join(sides)
        return (
            f"<!DOCTYPE html><html lang='{_e(lang)}'><head><meta charset='utf-8'>"
            f"<title>{_e(title)}</title><style>{css}</style></head><body>{body}</body></html>"
        )

    tabs = "".join(
        f'<button type="button" data-target="side-{_e(sid)}" '
        f'aria-pressed="{"true" if i == 0 else "false"}">'
        f'{_e(label_of(labels, lang, f"side {sid}"))}</button>'
        for i, (sid, labels, _) in enumerate(layout)
    )
    nav = "".join(
        f'<a href="#p-{_e(p.id)}">{_e(p.label(lang))}</a>' for p in t.paragraphs
    )
    script = """
<script>
/* One sheet at a time below the desktop threshold — and that has to be true on
   LOAD, not only after somebody taps a tab: a tablet that opens showing both
   sides has quietly stopped being "one sheet at a time". */
(function () {
  var narrow = window.matchMedia('(max-width: 1099px)');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.side-tabs button'));
  function apply() {
    var active = tabs.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0]
                 || tabs[0];
    document.querySelectorAll('.sheet').forEach(function (s) {
      s.hidden = narrow.matches && active && s.id !== active.dataset.target;
    });
  }
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      apply();
    });
  });
  narrow.addEventListener ? narrow.addEventListener('change', apply)
                          : narrow.addListener(apply);
  apply();
})();
</script>
"""
    return (
        f"<!DOCTYPE html><html lang='{_e(lang)}'><head><meta charset='utf-8'>"
        f"<meta name='viewport' content='width=device-width, initial-scale=1'>"
        f"<title>{_e(title)}</title><style>{css}</style></head><body>"
        f'<div class="wrap"><div class="side-tabs">{tabs}</div>{"".join(sides)}'
        f'<aside class="sidebar"><h2>{_e(t.title(lang))}</h2>{nav}</aside></div>{script}'
        f"</body></html>"
    )


def write_pdf(t: Template, record: Optional[Record], out_path: str, lang: Optional[str] = None,
              vocab: Optional[Vocabularies] = None, trace: Optional[VocabTrace] = None) -> int:
    """Write the PDF and return how many pages it took.

    The count is the honest measure of the fit: one page per declared side means
    the data fell inside the boxes the definition drew; more means a box had to
    grow, and the caller says so out loud instead of clipping the content away.
    """
    try:
        from weasyprint import HTML
    except Exception as exc:  # pragma: no cover
        raise RenderError(
            f"printing needs WeasyPrint (pip install 'stratigraph-templates[print]'): {exc}"
        ) from None
    doc = sheet_html(t, record, lang=lang, mode="print", vocab=vocab, trace=trace)
    rendered = HTML(string=doc).render()
    rendered.write_pdf(out_path)
    return len(rendered.pages)
