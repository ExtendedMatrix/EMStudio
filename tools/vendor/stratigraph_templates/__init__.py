"""stratigraph-templates — a recording sheet is a datum, not a schema.

This package is the *reference implementation*: it reads sheet definitions
(``templates/<id>/template.yaml``) and does three things with them — validate,
render a fillable form, print an A4 recto/verso sheet.  Everything that is
specific to a standard lives in the definition, never here.
"""

from .model import Template, Field, Paragraph, Sheet  # noqa: F401
from .loader import load_template, load_record, find_template  # noqa: F401
from .validate import validate_template, ValidationError, Problem  # noqa: F401

__version__ = "0.1.0"
