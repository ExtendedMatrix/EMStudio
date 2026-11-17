"""Command line: definitions in, sheets out. No server, no session, no database."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional

from .loader import find_template, load_record, templates_dir
from .model import MissingLabel
from .compile import CompileError, build, summary
from .registry import RegistryDivergence, RegistryUnavailable, registry, write_snapshot
from .render import RenderError, VocabTrace, sheet_html, write_pdf
from .validate import ValidationError, blocked_fields, draft_undecided, validate_template
from .vocab import Vocabularies, VocabularyError
from .xsd_extract import extract_xsd
from . import idai_extract


def _all_template_ids() -> List[str]:
    return sorted(d.name for d in templates_dir().iterdir() if (d / "template.yaml").is_file())


def _vocab(notice: bool = False) -> Vocabularies:
    vocab = Vocabularies.load()
    if notice:
        for line in vocab.missing_checkouts():
            print(f"  · {line}")
    return vocab


def _validate_one(name: str, reg, vocab: Vocabularies, quiet: bool = False,
                  draft: bool = False) -> int:
    t = find_template(name)
    try:
        validate_template(t, reg, known_schemes=vocab.scheme_ids(), draft=draft)
    except ValidationError as exc:
        print(f"✗ {t.id}", file=sys.stderr)
        for p in exc.problems:
            print(f"    {p}", file=sys.stderr)
        return 1
    blocked = blocked_fields(t)
    if draft and not quiet:
        undecided = draft_undecided(t)
        decided = len(t.fields) - len(undecided)
        print(f"✓ {t.id} (DRAFT): every check passes except the bindings a person has to "
              f"decide — {decided}/{len(t.fields)} decided, {len(undecided)} undecided")
        for fid in undecided:
            print(f"      undecided: {fid}")
    if not quiet:
        print(
            f"✓ {t.id}: {len(t.fields)} fields, {len(t.paragraphs)} paragraphs, "
            f"{len(t.edges())} relation slots, "
            f"{str(len(t.sides)) + ' sides' if t.sheet is not None else 'no sheet'}, "
            f"languages {t.languages}"
        )
        if blocked:
            print(f"  · {len(blocked)} field(s) declared BLOCKED on a decision (of the datamodel, or of the standard's owner): {blocked}")
            for fid in blocked:
                print(f"      {fid} needs: {t.field(fid).graph.blocked_on.needs}")
    return 0


def _registry(args):
    """The ONE registry every checking command uses (registry.registry)."""
    return registry(check_live=not args.snapshot)


def cmd_validate(args) -> int:
    reg = _registry(args)
    print(reg.provenance())
    vocab = _vocab(notice=True)
    names = args.templates or _all_template_ids()
    return max(_validate_one(n, reg, vocab, draft=args.draft) for n in names)


def cmd_info(args) -> int:
    t = find_template(args.template)
    voc = [f for f in t.fields if f.vocabulary]
    verdicts = {}
    for f in t.fields:
        v = f.graph.verdict if f.graph else "MISSING"
        verdicts[v] = verdicts.get(v, 0) + 1
    payload = {
        "template": t.id,
        "standard": f"{t.standard.authority} {t.standard.code} {t.standard.version}",
        "kind": t.standard.kind,
        "invented": t.standard.invented,
        "languages": t.languages,
        "fields": len(t.fields),
        "paragraphs": len(t.paragraphs),
        "required": sum(1 for f in t.fields if f.required),
        "repeatable": sum(1 for f in t.fields if f.repeatable),
        "with_vocabulary": len(voc),
        "relation_slots": len(t.edges()),
        "verdicts": dict(sorted(verdicts.items())),
        "blocked_on_decision": blocked_fields(t),
        "sides": {s.id: len(s.rows) for s in t.sides} if t.sheet is not None else None,
        "human_key": t.identity.human_key,
        "human_key_pattern": t.identity.pattern,
    }
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


def _record(args, t=None):
    rec = load_record(args.record) if args.record else None
    if rec is not None and t is not None:
        # the record says which definition and which version it followed (SPEC §5):
        # a different id is an error, a different version is said out loud
        if rec.template != t.id:
            raise FileNotFoundError(f"{args.record} follows '{rec.template}', not '{t.id}'")
        if rec.template_version != t.version:
            print(f"  ! {args.record} was filled with {t.id} {rec.template_version}; "
                  f"printing it with {t.version}", file=sys.stderr)
    return rec


def _explain(trace: VocabTrace) -> None:
    if not trace.rows:
        return
    print("controlled terms — how each label was resolved:", file=sys.stderr)
    for field_id, concept, label, via in trace.rows:
        print(f"    {field_id}: {label!r}  ← {via}  {concept}", file=sys.stderr)
    bad = trace.uncontrolled()
    if bad:
        print(
            f"    ! {len(bad)} value(s) written as a bare string in a controlled box: "
            f"{[b[0] for b in bad]}",
            file=sys.stderr,
        )


def cmd_print(args) -> int:
    reg = _registry(args)
    vocab = _vocab()
    t = find_template(args.template)
    validate_template(t, reg, known_schemes=vocab.scheme_ids())
    trace = VocabTrace()
    out = args.out or f"out/{t.id}.pdf"
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    pages = write_pdf(t, _record(args, t), out, lang=args.lang, vocab=vocab, trace=trace)
    sides = len(t.sides)
    print(f"{out} — {t.standard.authority} {t.standard.code} {t.standard.version}, "
          f"{sides} side(s) → {pages} page(s), language '{args.lang or t.source_language}'")
    if pages > sides:
        print(
            f"  ! {pages - sides} page(s) more than sides: some box had to grow to keep what was "
            f"written. Nothing was clipped; the geometry of this definition is too tight for these "
            f"data",
            file=sys.stderr,
        )
    if args.explain_vocab:
        _explain(trace)
    return 0


def cmd_form(args) -> int:
    reg = _registry(args)
    vocab = _vocab()
    t = find_template(args.template)
    validate_template(t, reg, known_schemes=vocab.scheme_ids())
    trace = VocabTrace()
    out = args.out or f"out/{t.id}-form.html"
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    doc = sheet_html(t, _record(args, t), lang=args.lang, mode="form", vocab=vocab, trace=trace)
    Path(out).write_text(doc, encoding="utf-8")
    print(f"{out} — form, language '{args.lang or t.source_language}'")
    if args.explain_vocab:
        _explain(trace)
    return 0


def cmd_build(args) -> int:
    reg = _registry(args)
    print(reg.provenance())
    vocab = _vocab(notice=True)
    names = args.templates or _all_template_ids()
    out = Path(args.out)
    written, refused = build([find_template(n) for n in names], reg, vocab, out)
    for tid, path, what in written:
        doc = json.loads(path.read_text(encoding="utf-8"))
        s = summary(doc)
        print(f"✓ {tid} {doc['header']['version']} → {path} ({what})")
        print(f"    {doc['header']['digest']}")
        print(f"    verdicts {s['verdicts']} · steps {s['steps']} · open {s['open']}")
        for item in doc["recipe"]["open"]:
            print(f"      open: {item['field'] or '(unit)'} — {item['what']}")
    for tid, why in refused:
        print(f"✗ {tid} does not compile", file=sys.stderr)
        for line in why.splitlines()[1:] or [why]:
            print(f"  {line}", file=sys.stderr)
    if written:
        print(f"{out / 'index.json'} — {len(written)} definition(s) compiled")
    return 1 if refused else 0


def cmd_extract_xsd(args) -> int:
    draft, stats = extract_xsd(Path(args.xsd), authority=args.authority, code=args.code,
                               version=args.version)
    out = Path(args.out) if args.out else Path(f"out/draft-{args.code.lower()}.yaml")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(draft, encoding="utf-8")
    print(f"{out} — proposal, not truth")
    for k, v in stats.items():
        print(f"    {k}: {v}")
    return 0


def cmd_extract_idai_field(args) -> int:
    src = idai_extract.Source.open(Path(args.repo) if args.repo else None, args.commit)
    draft, stats, form = idai_extract.extract_idai_field(src, args.category_name, args.project)
    slug = f"{args.category_name}{'-' + args.project if args.project else ''}".lower()
    out = Path(args.out) if args.out else Path(f"out/draft-idai-field-{slug}.yaml")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(draft, encoding="utf-8")
    print(f"{out} — proposal, not truth (iDAI.field @ {src.commit[:7]}, {src.date})")
    for k, v in stats.items():
        print(f"    {k}: {v}")
    if args.schemes_out:
        schemes = Path(args.schemes_out)
        wanted = sorted({f.valuelist for f in form.fields if f.valuelist
                         and f.input_type in ("dropdown", "radio", "dropdownRange", "checkboxes")})
        for vl in wanted:
            path = schemes / f"{idai_extract.scheme_id_for(vl)}.yaml"
            if path.exists():
                print(f"    scheme {path.name}: already declared, left as it is")
                continue
            path.write_text(idai_extract.scheme_yaml(src, vl), encoding="utf-8")
            print(f"    scheme {path.name}: written")
    return 0


def cmd_registry_snapshot(args) -> int:
    reg = write_snapshot()
    print(reg.provenance())
    return 0


def cmd_vocab(args) -> int:
    vocab = _vocab()
    if args.concept is None:
        for sid, s in sorted(vocab.schemes.items()):
            marks = []
            if s.fixture:
                marks.append("FIXTURE")
            marks.append(s.status)
            if s.provisional:
                marks.append(f"provisional → {s.provisional}")
            print(f"{sid:28s} [{', '.join(marks)}] {s.authority} — {s.license or 'licence not stated'}")
        print(f"{len(vocab.alignments)} alignment(s) declared")
        return 0
    res = vocab.resolve(args.scheme, args.concept, args.lang)
    print(f"{res.label}  ← {res.via}")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="stratigraph-templates", description=__doc__)
    ap.add_argument("--snapshot", action="store_true",
                    help="use the registry snapshot WITHOUT comparing it to the s3Dgraphy working "
                         "tree (the snapshot is the source either way; this skips the check, "
                         "declared)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("validate", help="check definitions (shape + graph bindings)")
    p.add_argument("templates", nargs="*")
    p.add_argument("--draft", action="store_true",
                   help="an extracted DRAFT: count `verdict: undecided` instead of refusing it "
                        "(every other check still runs)")
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("info", help="the numbers of one definition")
    p.add_argument("template")
    p.set_defaults(func=cmd_info)

    p = sub.add_parser("print", help="A4 recto/verso PDF from definition + data")
    p.add_argument("template")
    p.add_argument("--record")
    p.add_argument("--lang")
    p.add_argument("-o", "--out")
    p.add_argument("--explain-vocab", action="store_true")
    p.set_defaults(func=cmd_print)

    p = sub.add_parser("form", help="fillable HTML form from the same definition")
    p.add_argument("template")
    p.add_argument("--record")
    p.add_argument("--lang")
    p.add_argument("-o", "--out")
    p.add_argument("--explain-vocab", action="store_true")
    p.set_defaults(func=cmd_form)

    p = sub.add_parser("build", help="compile definitions to self-sufficient JSON (dist/schede/)")
    p.add_argument("templates", nargs="*")
    p.add_argument("-o", "--out", default=str(Path(__file__).resolve().parents[2] / "dist" / "schede"))
    p.set_defaults(func=cmd_build)

    p = sub.add_parser("extract-xsd", help="propose a draft definition from an ICCD catalogue XSD")
    p.add_argument("xsd")
    p.add_argument("--authority", default="ICCD")
    p.add_argument("--code", required=True)
    p.add_argument("--version", required=True)
    p.add_argument("-o", "--out")
    p.set_defaults(func=cmd_extract_xsd)

    p = sub.add_parser("extract-idai-field",
                       help="propose a draft definition from the iDAI.field configuration")
    p.add_argument("category_name", metavar="CATEGORY", help="an iDAI.field category, e.g. Layer")
    p.add_argument("--project", help="a project configuration on top (Config-<project>.json)")
    p.add_argument("--repo", help=f"the iDAI.field checkout (default ${idai_extract.IDAI_FIELD_ENV} "
                                  f"or {idai_extract.IDAI_FIELD_DEFAULT})")
    p.add_argument("--commit", default="HEAD", help="the commit to read (git show), default HEAD")
    p.add_argument("--schemes-out", help="write the valuelist scheme declarations that are "
                                         "missing into this folder (e.g. vocabularies/schemes)")
    p.add_argument("-o", "--out")
    p.set_defaults(func=cmd_extract_idai_field)

    p = sub.add_parser("registry-snapshot", help="record what s3Dgraphy declares today")
    p.set_defaults(func=cmd_registry_snapshot)

    p = sub.add_parser("vocab", help="list schemes, or resolve a concept label")
    p.add_argument("--scheme")
    p.add_argument("--concept")
    p.add_argument("--lang", default="it")
    p.set_defaults(func=cmd_vocab)

    args = ap.parse_args(argv)
    try:
        return args.func(args)
    except (ValidationError, RenderError, VocabularyError, MissingLabel, RegistryUnavailable,
            RegistryDivergence, CompileError, FileNotFoundError,
            idai_extract.IdaiFieldError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
