#!/usr/bin/env bash
# Vendor the COMPILED recording-sheet definitions from stratigraph-templates
# (`dist/schede/`) — the single source — into src/assets/schede/. MICRO-G-SCHEDE
# (17 Nov 2026): the «Scheda» window is a SECOND READER of those definitions,
# like StratiField (`stratigraph-chatbot/sync-schede.sh`, the same pact as
# `sync-datamodels.sh`): the app does not read another repository at runtime,
# so the compiled form is COPIED in and committed. Never edit the copies.
#
#   ./scripts/sync-schede.sh                          # from the sibling checkout
#   ./scripts/sync-schede.sh ../../stratigraph-templates
#
# WHAT IS COPIED
#   · the LATEST version of every REAL definition in `dist/schede/index.json`
#     (`<id>.json`) — not an invented demo (`standard.invented`: its print says
#     FIXTURE, and a study must not pick it by mistake), not one under Apache-2.0
#     (the DAI's: its licence wants LICENSE + NOTICE beside the copy, as
#     StratiField's sync writes them; to do the day EMStudio offers it). Each one
#     left out is SAID by this script: EMStudio reads the graph, not records, so it draws a unit
#     with the version the study chose — and a study that names a version this
#     copy does not have is SAID, not silently read with another;
#   · `index.json`, reduced to what was copied (id → version, digest, title);
#   · the VOCABULARIES the copied definitions name, resolved once with
#     stratigraph-templates' own resolver (own scheme → provisional → alignment,
#     SPEC §3), one `vocabolari/<scheme>.json` each — the code StratiField's
#     sync runs, so the two readers offer the same concepts. A `declared` scheme
#     is vendored too, with no concepts: the box then SAYS it is declared.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$(cd "$SCRIPT_DIR/.." && pwd)"
DST="$FRONTEND/src/assets/schede"
GITHUB="$(cd "$FRONTEND/../.." && pwd)"

SRC=""
for cand in "${1:-}" "${1:-}/stratigraph-templates" "$GITHUB/stratigraph-templates"; do
  [ -n "$cand" ] && [ -f "$cand/dist/schede/index.json" ] && { SRC="$(cd "$cand" && pwd)"; break; }
done
[ -n "$SRC" ] || { echo "no stratigraph-templates with dist/schede/index.json (give its path)" >&2; exit 1; }

PY="$SRC/.venv/bin/python"
[ -x "$PY" ] || PY="python3"
mkdir -p "$DST/vocabolari"
PYTHONPATH="$SRC/src${PYTHONPATH:+:$PYTHONPATH}" "$PY" - "$SRC" "$DST" <<'EOF'
import json, pathlib, shutil, subprocess, sys
from stratigraph_templates.vocab import Vocabularies, VocabularyError

src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
dist = src / "dist" / "schede"
index = json.loads((dist / "index.json").read_text(encoding="utf-8"))
commit = subprocess.run(["git", "-C", str(src), "rev-parse", "--short", "HEAD"],
                        capture_output=True, text=True).stdout.strip()
out_index = {"format": "emstudio/schede-vendored", "format_version": "1",
             "from": {"repository": "stratigraph-templates", "commit": commit},
             "schede": {}}
for old in [*dst.glob("*.json"), *dst.glob("vendored.ts")]:
    old.unlink()
wanted, stands_in = {}, {}
for tid, entry in sorted(index["schede"].items()):
    latest = entry["latest"]
    doc = json.loads((dist / tid / f"{latest}.json").read_text(encoding="utf-8"))
    std = doc["header"].get("standard") or {}
    if std.get("invented"):
        print(f"  {tid:<28} {latest:<8} left out: an invented demo (FIXTURE)")
        continue
    if "apache" in str(std.get("license") or "").lower():
        print(f"  {tid:<28} {latest:<8} left out: Apache-2.0 wants LICENSE + NOTICE beside it")
        continue
    shutil.copyfile(dist / tid / f"{latest}.json", dst / f"{tid}.json")
    head = doc["header"]
    out_index["schede"][tid] = {"version": latest, "digest": head.get("digest"),
                                "standard": head.get("standard"),
                                "languages": head.get("languages"),
                                "sheet": doc["visual"].get("sheet") is not None}
    for v in head.get("vocabularies") or []:
        wanted.setdefault(v["id"], set()).update(head.get("languages") or [])
        if v.get("provisional_for"):
            stands_in[v["id"]] = v["provisional_for"]
    print(f"  {tid:<28} {latest:<8} {head.get('digest', '')[:19]}")
(dst / "index.json").write_text(json.dumps(out_index, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                                encoding="utf-8")
vocab = Vocabularies.load()
voc = dst / "vocabolari"
for old in voc.glob("*.json"):
    old.unlink()
for sid, langs in sorted(wanted.items()):
    scheme = vocab.schemes.get(sid)
    if scheme is None:
        sys.exit(f"  a vendored definition names scheme '{sid}', which stratigraph-templates does not declare")
    concepts = []
    for uri, _labels in sorted(vocab.concepts(sid).items()):
        if scheme.uri and uri == scheme.uri:
            continue
        said = {}
        for lang in sorted(langs):
            try:
                said[lang] = vocab.resolve(sid, uri, lang).label
            except VocabularyError:
                pass
        concepts.append({"concept": uri, "labels": said})
    doc = {"format": 1, "scheme": sid, "authority": scheme.authority, "status": scheme.status,
           "uri": scheme.uri, "license": scheme.license, "attribution": scheme.attribution,
           "labels": scheme.labels, "languages": sorted(langs), "concepts": concepts}
    if sid in stands_in:
        doc["provisional_for"] = stands_in[sid]
    if scheme.provisional:
        doc["provisional"] = scheme.provisional
    if scheme.unverified_languages:
        doc["unverified_languages"] = sorted(scheme.unverified_languages)
    (voc / f"{sid}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                                     encoding="utf-8")
    print(f"  vocabulary {sid:<30} {scheme.status:<10} {len(concepts)} concepts")
# the one module the app imports: what was vendored, by name (no glob — a
# check run in node bundles it with esbuild, which has no import.meta.glob)
defs = sorted(p.stem for p in dst.glob("*.json") if p.name != "index.json")
vocs = sorted(p.stem for p in voc.glob("*.json"))
ident = lambda s: "".join(c if c.isalnum() else "_" for c in s)
lines = ["// GENERATED by scripts/sync-schede.sh — do not edit: run the sync.",
         'import index from "./index.json";']
lines += [f'import d_{ident(d)} from "./{d}.json";' for d in defs]
lines += [f'import v_{ident(v)} from "./vocabolari/{v}.json";' for v in vocs]
lines += ["export const VENDORED_INDEX: unknown = index;",
          "export const VENDORED_DEFINITIONS: unknown[] = [" + ", ".join(f"d_{ident(d)}" for d in defs) + "];",
          "export const VENDORED_VOCABULARIES: unknown[] = [" + ", ".join(f"v_{ident(v)}" for v in vocs) + "];", ""]
(dst / "vendored.ts").write_text("\n".join(lines), encoding="utf-8")
EOF
echo "vendored from $SRC → $DST"

# MICRO-I-STAMPA-NEL-DESKTOP (17 Nov 2026) · the PRINTER travels with what it
# prints. The bridge prints an A4 with stratigraph-templates' own
# `render.sheet_html`, and the desktop's sidecar is frozen where there is no
# checkout of stratigraph-templates (release.yml builds from the published
# s3dgraphy wheel; the package is on no index). So the package is copied here
# from the SAME commit as the definitions above, byte for byte, with its licence
# (EUPL-1.2, compatible with EMStudio's GPL-3.0): tools/em_sheet.py imports it,
# apps/desktop/build-bridge.sh freezes it. Never edit the copy: run the sync.
VENDOR="$FRONTEND/../tools/vendor"
rm -rf "$VENDOR/stratigraph_templates"
mkdir -p "$VENDOR/stratigraph_templates"
cp "$SRC"/src/stratigraph_templates/*.py "$VENDOR/stratigraph_templates/"
cp "$SRC/LICENSE" "$VENDOR/stratigraph_templates/LICENSE"
"$PY" - "$SRC" "$VENDOR" <<'EOF'
import hashlib, json, pathlib, subprocess, sys
src, vendor = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
pkg = vendor / "stratigraph_templates"
commit = subprocess.run(["git", "-C", str(src), "rev-parse", "--short", "HEAD"],
                        capture_output=True, text=True).stdout.strip()
stamp = {"format": "emstudio/vendored-python", "format_version": "1",
         "stratigraph_templates": {"repository": "stratigraph-templates", "commit": commit,
                                   "license": "EUPL-1.2",
                                   "files": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                             for p in sorted(pkg.iterdir())}}}
(vendor / "VENDORED.json").write_text(json.dumps(stamp, indent=1, sort_keys=True) + "\n", encoding="utf-8")
print(f"  renderer stratigraph_templates @ {commit}: {len(stamp['stratigraph_templates']['files'])} files → tools/vendor")
EOF
git -C "$FRONTEND" status --short -- src/assets/schede ../tools/vendor | head -40
