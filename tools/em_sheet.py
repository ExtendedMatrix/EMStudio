"""MICRO-G-SCHEDE · the A4 of a recording sheet, printed by stratigraph-templates.

The page sends the COMPILED definition it vendors (SPEC §9) and the record it
read off the graph; this rebuilds the template from the compiled visual half
(`loader.template_from_compiled`) and renders it with the package's own
`render.sheet_html(mode="print")` — the same code StratiField and the
`stratigraph-templates print` command use. Nothing of the sheet is drawn here.

Where the package comes from, first hit wins: an importable
`stratigraph_templates` (installed — and in the desktop's frozen sidecar, where
build-bridge.sh puts the vendored copy), `STRATIGRAPH_TEMPLATES_SRC`, the copy
vendored beside this file (`tools/vendor/stratigraph_templates`, synced by
frontend/scripts/sync-schede.sh from the same commit as the definitions,
MICRO-I-STAMPA-NEL-DESKTOP). None: the answer says so (501), the page says it.
The PDF needs WeasyPrint: without it the HTML still comes back (the system's
print dialog makes the PDF), and `why` says what is missing. The desktop's
sidecar carries no WeasyPrint, on purpose (pango is heavy): it prints.
No s3dgraphy in here: a test can run this with the templates' own venv.
"""

from __future__ import annotations

import base64
import os
import pathlib
import sys
from typing import Any, Dict, Tuple


def _templates():
    try:
        import stratigraph_templates  # noqa: F401
    except ImportError:
        for cand in (os.environ.get("STRATIGRAPH_TEMPLATES_SRC"),
                     str(pathlib.Path(__file__).resolve().parent / "vendor")):
            if cand and (pathlib.Path(cand) / "stratigraph_templates").is_dir():
                sys.path.insert(0, cand)
                break
    from stratigraph_templates import loader, model, render
    if not hasattr(loader, "template_from_compiled"):
        raise ImportError("this stratigraph-templates has no template_from_compiled (older than 2026-11-17)")
    return loader, model, render


def render_sheet(body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """One sheet (`record`) or a batch (`records`, MICRO-PL002: the print window
    sends a few dozen at a time so it can say how far it is and stop between
    two). A batch answers `htmls` (one page per record, in order) and, with
    `pdf` and WeasyPrint here, `pdfs` (base64, one per record)."""
    try:
        loader, model, render = _templates()
    except ImportError as exc:
        return 501, {"ok": False, "error": f"stratigraph-templates is not reachable from this bridge: {exc}"}
    definition = body.get("definition")
    lang = body.get("lang") or None
    batch = isinstance(body.get("records"), list)
    recs = body.get("records") if batch else [body.get("record") or {}]
    try:
        t = loader.template_from_compiled(definition)
        htmls = []
        for rec in recs:
            rec = rec or {}
            record = model.Record(template=str(rec.get("template") or t.id),
                                  template_version=str(rec.get("template_version") or t.version),
                                  values=dict(rec.get("values") or {}))
            htmls.append(render.sheet_html(t, record, lang=lang, mode="print"))
    except Exception as exc:
        return 422, {"ok": False, "error": str(exc)}
    sides = len(t.sheet.sides) if t.sheet is not None else 1
    out: Dict[str, Any] = {"ok": True, "template": t.id, "version": t.version, "pdf": False, "sides": sides}
    if batch:
        out["htmls"] = htmls
    else:
        out["html"] = htmls[0]
    if body.get("pdf"):
        try:
            from weasyprint import HTML
        except Exception as exc:
            out["why"] = f"WeasyPrint is not installed here ({type(exc).__name__})"
        else:
            docs = [HTML(string=h).render() for h in htmls]
            out["pdf"] = True
            if batch:
                out["pdfs"] = [base64.b64encode(d.write_pdf()).decode("ascii") for d in docs]
                out["pages"] = [len(d.pages) for d in docs]
            else:
                out["pages"] = len(docs[0].pages)
                out["pdf_b64"] = base64.b64encode(docs[0].write_pdf()).decode("ascii")
    return 200, out
