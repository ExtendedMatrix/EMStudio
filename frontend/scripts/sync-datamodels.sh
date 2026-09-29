#!/usr/bin/env bash
# Sync the EM datamodel assets from s3Dgraphy — the single source of truth
# (ADR-001). The EMStudio frontend is a browser/TS app: it cannot import the
# Python s3dgraphy package at runtime, so the datamodel JSONs are VENDORED into
# src/assets and bundled at build time. Run this after any datamodel change in
# s3Dgraphy, review the diff, commit. Never edit the copies in src/assets by hand.
#
#   ./scripts/sync-datamodels.sh                 # from an installed s3dgraphy (pip) or the sibling checkout
#   ./scripts/sync-datamodels.sh ../../s3Dgraphy # from an explicit checkout
#
# Source resolution (first hit wins): an explicit path arg (a checkout root, a
# path ending in JSON_config, or a dir containing one) → the sibling
# ../../s3Dgraphy checkout → the INSTALLED s3dgraphy package (pip), located via
# the sibling .venv python or python3. So `pip install s3dgraphy` is enough — no
# source checkout required.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$(cd "$SCRIPT_DIR/.." && pwd)"
DST="$FRONTEND/src/assets"
GITHUB="$(cd "$FRONTEND/../.." && pwd)" # …/EMStudio/.. = repos root
SIBLING="$GITHUB/s3Dgraphy"

has_cfg() { [ -f "$1/em_visual_rules.json" ]; }

CFG=""
ARG="${1:-}"
if [ -n "$ARG" ]; then
  for cand in "$ARG/src/s3dgraphy/JSON_config" "$ARG/JSON_config" "$ARG"; do
    if has_cfg "$cand"; then CFG="$cand"; break; fi
  done
  [ -n "$CFG" ] || { echo "no JSON_config under '$ARG'" >&2; exit 1; }
fi
# sibling checkout
if [ -z "$CFG" ] && has_cfg "$SIBLING/src/s3dgraphy/JSON_config"; then
  CFG="$SIBLING/src/s3dgraphy/JSON_config"
fi
# installed package (pip): ask a python where s3dgraphy lives
if [ -z "$CFG" ]; then
  for PY in "$SIBLING/.venv/bin/python" python3 python; do
    ( [ -x "$PY" ] || command -v "$PY" >/dev/null 2>&1 ) || continue
    d="$("$PY" -c 'import s3dgraphy,os;print(os.path.join(os.path.dirname(s3dgraphy.__file__),"JSON_config"))' 2>/dev/null || true)"
    if [ -n "$d" ] && has_cfg "$d"; then CFG="$d"; break; fi
  done
fi
[ -n "$CFG" ] || {
  echo "s3Dgraphy JSON_config not found — pass a checkout path, or pip-install s3dgraphy." >&2
  exit 1
}

cp "$CFG/em_visual_rules.json" "$DST/"
# em-core bakes the visual rules into its binary (`geometry.rs`, include_str!),
# and the layout reads only the box shapes and the glyph aspects. Since 1.6.18
# the rules also carry `2d_glyphs` — every pictogram as vector paths, ~62 KB of
# the file — which the layout never touches. So em-core gets its OWN copy with
# that block removed, written HERE from the same source in the same run: the two
# copies differ by that one block and nothing else, and
# `crates/em-core/tests/visual_rules_core.rs` asserts it.
CORE_RULES="$FRONTEND/../crates/em-core/assets/em_visual_rules.core.json"
mkdir -p "$(dirname "$CORE_RULES")"
python3 - "$DST/em_visual_rules.json" "$CORE_RULES" <<'PYEOF'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
rules = json.loads(open(src, encoding="utf-8").read())
rules.pop("2d_glyphs", None)
with open(dst, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(rules, indent=2, ensure_ascii=False) + "\n")
PYEOF
cp "$CFG/s3Dgraphy_connections_datamodel.json" "$DST/"
cp "$CFG/s3Dgraphy_node_datamodel.json" "$DST/"
# the class hierarchy now lives in a separate GENERATED file (s3Dgraphy P1-A);
# vendor both: the datamodel (hand-authored semantics/CIDOC) and the registry
# (generated parent/node_type hierarchy that rules.ts reads).
cp "$CFG/node_registry.generated.json" "$DST/"
cp "$CFG/em_qualia_types.json" "$DST/"
# TRAD1 · multilingual datamodel descriptions/labels (sidecar keyed by class;
# en = source, other langs + validated_<lang> flags). rules.ts reads the active
# locale from it with an English fallback. Optional (older s3Dgraphy has none).
[ -f "$CFG/datamodel_translations.json" ] && cp "$CFG/datamodel_translations.json" "$DST/"
mkdir -p "$DST/icons2d"
# BOTH raster and vector. Only `*.png` was copied here, which is why EMStudio drew
# no SVG icons even after 28 of them shipped in s3Dgraphy: the renderer prefers
# vector (`icons.ts::asset` tries .svg before .png) and there was simply nothing to
# prefer. `nullglob` because a checkout may legitimately have one kind and not the
# other, and an unmatched glob must not copy a literal `*.svg`.
# Vendor the 2D icons — but only the ones the renderer can actually REACH.
#
# Every vendored byte is inlined as a data URL by the single-file build, so an
# unreachable asset is pure bundle weight. Two conditions, both facts rather than
# guesses (a size threshold would guess):
#
#  1. **The pair is resolved the way `icons.ts::asset` resolves it.** By default
#     that is vector-before-raster, so a PNG beside its own SVG can never be
#     reached: 16 of them, 2.5 MB. POL5 added the exception, and it is the
#     datamodel's own: a type carrying `2d_icon_prefer: "raster"` (NARR, SE — two
#     stipple ILLUSTRATIONS of 617 and 284 KB) is resolved the other way round, so
#     for those the SVG is the unreachable one. The flag is read here and in
#     `icons.ts`; if only one of the two honoured it, the build would inline a file
#     the renderer never asks for — which is exactly what happened before this rule
#     existed and cost 604 KB.
#  2. **A basename that neither names a node type nor is declared by one is
#     skipped.** Those are exactly `icons.ts`'s two lookup paths (name first, then
#     the `em_visual_rules` declaration), plus its spelled-out aliases. Anything
#     else is unreferenced artwork: today `EMNarrative.*` alone, 2.2 MB.
#
# Both rules are computed FROM the rules file, so adding an icon and declaring it
# is enough — this script needs no edit.
python3 - "$CFG" "$DST" <<'PYEOF'
import json, pathlib, shutil, sys

cfg, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
styles = json.loads((cfg / "em_visual_rules.json").read_text())["node_styles"]

reachable = set(styles)                       # named after a node type
raster_only = set()                           # stems where the SVG is unreachable
for style in styles.values():                 # or declared by one
    if not isinstance(style, dict):
        continue
    for key in ("2d_file_vect", "2d_file_rast", "file_2d"):
        path = style.get(key)
        if isinstance(path, str):
            reachable.add(pathlib.PurePath(path).stem)
    # POL5: the datamodel says which of the pair is the icon. `icons.ts` reads the
    # same field, so the copied file and the drawn file are one decision.
    if style.get("2d_icon_prefer") == "raster":
        for key in ("2d_file_rast", "file_2d", "2d_file_vect"):
            path = style.get(key)
            if isinstance(path, str):
                raster_only.add(pathlib.PurePath(path).stem)
# Sharing that icons.ts spells out in FILE_ALIAS (BR → continuity, serUSVn/s →
# serUSV): declared nowhere, deliberate all the same.
reachable |= {"continuity", "serUSV"}

# SHIFT-A (1 ott 2026) · a declaration that icons.ts NEVER READS makes nothing
# reachable. `declaredBasenames` tries the style's `2d_file_vect` first; when that
# file exists, the style's raster declaration is never consulted. NARR is the
# case: since em_visual_rules 1.6.20 its vector is the glyph `narrative.svg`, and
# its raster half still names `EMNarrative.png` — whose stem would otherwise pull
# the 617 KB illustration `EMNarrative.svg` into the bundle (SVG shadows PNG),
# for a renderer that asks for `narrative.svg` and nothing else.
declared_elsewhere = set(styles)
for style in styles.values():
    if isinstance(style, dict) and isinstance(style.get("2d_file_vect"), str):
        declared_elsewhere.add(pathlib.PurePath(style["2d_file_vect"]).stem)
for style in styles.values():
    if not isinstance(style, dict):
        continue
    vect = style.get("2d_file_vect")
    if not (isinstance(vect, str) and (cfg / vect).is_file()):
        continue
    for key in ("2d_file_rast", "file_2d"):
        path = style.get(key)
        if not isinstance(path, str):
            continue
        stem = pathlib.PurePath(path).stem
        if stem != pathlib.PurePath(vect).stem and stem not in declared_elsewhere:
            # still reachable if ANOTHER style declares it
            others = [st for st in styles.values() if isinstance(st, dict) and st is not style
                      and any(isinstance(st.get(k), str) and pathlib.PurePath(st[k]).stem == stem
                              for k in ("2d_file_vect", "2d_file_rast", "file_2d"))]
            if not others:
                reachable.discard(stem)

src = cfg / "src/2D"
out = dst / "icons2d"
out.mkdir(parents=True, exist_ok=True)
copied = skipped = 0
kept = set()
for f in sorted(src.iterdir()):
    if f.suffix.lower() not in (".svg", ".png"):
        continue
    ext = f.suffix.lower()
    if f.stem in raster_only:
        # the pair is resolved raster-first for this type → the vector is the
        # unreachable half (and it is the heavy one, which is the whole point)
        shadowed = ext == ".svg" and (src / f"{f.stem}.png").is_file()
    else:
        shadowed = ext == ".png" and (src / f"{f.stem}.svg").is_file()
    if f.stem not in reachable or shadowed:
        skipped += 1
        continue
    shutil.copy2(f, out / f.name)
    kept.add(f.name)
    copied += 1
# SHIFT-A (1 ott 2026) · a file this script vendored LAST time and would not
# vendor now is pruned: a PNG shadowed by the SVG that just arrived (author_ai,
# license, embargo, narrative since em_visual_rules 1.6.20) is inlined by the
# single-file build all the same, and nothing can ever reach it.
pruned = 0
for g in sorted(out.iterdir()):
    if g.suffix.lower() in (".svg", ".png") and g.name not in kept:
        g.unlink()
        pruned += 1
print(f"  icons2d          {copied} vendored, {skipped} unreachable/shadowed, {pruned} pruned")
PYEOF

# DECLARED BUT ABSENT — the assets the datamodel promises and does not have.
#
# `icons.ts::asset` returns null for a missing file and the canvas quietly draws
# the node's shape instead: a stale declaration therefore fails SILENTLY, and
# four of them had accumulated by 2026-08-29 before anybody looked. So they are
# counted where the assets are copied.
#
# 2D is an ERROR in s3Dgraphy's own suite (`tests/test_visual_assets.py`) because
# 2D is what renders. Here it is only reported, so vendoring never fails on it.
# 3D is reported on both sides: sixteen styles declare a `.glb` that has not been
# modelled, which is a known state of the visual language and not a bug to fix
# from a script.
python3 - "$CFG" <<'PYEOF'
import json, pathlib, sys

cfg = pathlib.Path(sys.argv[1])
styles = json.loads((cfg / "em_visual_rules.json").read_text()).get("node_styles") or {}
gaps = {"2D": [], "3D": []}
for key, style in sorted(styles.items()):
    if not isinstance(style, dict):
        continue
    for field in ("2d_file_vect", "2d_file_rast", "file_2d", "file_3d"):
        path = style.get(field)
        if isinstance(path, str) and not (cfg / path).is_file():
            gaps["3D" if field == "file_3d" else "2D"].append(f"{key}.{field}")
for kind, names in gaps.items():
    if not names:
        print(f"  {kind} assets        all declared files present")
        continue
    shown = ", ".join(names[:6]) + ("…" if len(names) > 6 else "")
    mark = "WARNING: " if kind == "2D" else ""
    print(f"  {kind} assets        {mark}{len(names)} declared and MISSING: {shown}")
PYEOF

# EM3 · the declared glyph ASPECTS must still match the files.
#
# `em_visual_rules.2d_render_glyph_types.aspect` is a STATIC number (the layout may
# not depend on a decoded image — see that block's comment). The cost of static is
# staleness: redraw an icon at a new aspect and the box stays the old shape, with
# the connect handle drifting off the glyph by exactly the error. So the numbers are
# re-measured HERE, where the assets are copied, and a drift is reported. A WARNING
# and not an error: a 3% aspect is a cosmetic problem, and refusing to vendor a
# datamodel over it would be worse than saying so.
python3 - "$CFG" <<'PYEOF'
import json, pathlib, re, struct, sys

cfg = pathlib.Path(sys.argv[1])
rules = json.loads((cfg / "em_visual_rules.json").read_text())
block = rules.get("2d_render_glyph_types") or {}
declared = block.get("aspect") or {}
styles = rules.get("node_styles") or {}
# node_type -> visual-rules key, for the seven glyph types (mirrors icons.ts)
ALIAS = {"extractor": "EXT", "combiner": "COMB", "author": "AUTH",
         "author_ai": "AUTH_AI", "license": "LIC", "embargo": "EMB",
         "narrative": "NARR"}

def intrinsic(path: pathlib.Path):
    """(w, h) of a drawing, from the SVG viewBox or the PNG header. No decoding."""
    if not path.is_file():
        return None
    if path.suffix.lower() == ".svg":
        m = re.search(r'viewBox="([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([\d.eE]+)[ ,]+([\d.eE]+)"',
                      path.read_text(errors="ignore"))
        return (float(m.group(3)), float(m.group(4))) if m else None
    head = path.read_bytes()[:24]
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", head[16:24])
    return (float(w), float(h))

def icon_file(node_type: str):
    """The file that type actually renders — same rule as icons.ts: the declared
    vector first, the raster when `2d_icon_prefer` says so."""
    st = styles.get(ALIAS.get(node_type, node_type)) or {}
    keys = (("2d_file_rast", "file_2d", "2d_file_vect")
            if st.get("2d_icon_prefer") == "raster"
            else ("2d_file_vect", "2d_file_rast", "file_2d"))
    for k in keys:
        v = st.get(k)
        if isinstance(v, str):
            f = cfg / v
            if f.is_file():
                return f
    return None

drift = []
for node_type in block.get("types") or []:
    f = icon_file(node_type)
    dim = intrinsic(f) if f else None
    if not dim or not dim[1]:
        continue
    measured = dim[0] / dim[1]
    have = float(declared.get(node_type, 1.0))
    if abs(measured - have) / max(measured, 1e-9) > 0.02:
        drift.append(f"{node_type}: declared {have:.3f}, {f.name} is "
                     f"{measured:.3f} ({dim[0]:.0f}x{dim[1]:.0f})")
if drift:
    print("  glyph aspects   WARNING — declaration does not match the asset:")
    for d in drift:
        print(f"    {d}")
    print("    fix em_visual_rules.2d_render_glyph_types.aspect in s3Dgraphy")
else:
    n = len(block.get("types") or [])
    print(f"  glyph aspects   {n} checked against their files, all within 2%")
PYEOF

# The 2017 DTC glyphs. They live in s3Dgraphy — the single source — under
# `src/2D/dtc/`, and `em_visual_rules.dtc_kinds[*].glyph` names them WITHOUT an
# extension, so the vendored basenames must match the glyph names exactly.
# Before POL2 these files existed only inside EMStudio, copied in by hand: a second
# source of truth that nothing kept in step with the rules that reference it.
mkdir -p "$DST/dtc-glyphs"
cp "$CFG"/src/2D/dtc/*.svg "$DST/dtc-glyphs/" 2>/dev/null || true
shopt -u nullglob

echo "synced from $CFG:"
python3 - "$CFG" <<'EOF'
import json, sys, pathlib
cfg = pathlib.Path(sys.argv[1])
n = json.loads((cfg / "s3Dgraphy_node_datamodel.json").read_text())
r = json.loads((cfg / "node_registry.generated.json").read_text())
c = json.loads((cfg / "s3Dgraphy_connections_datamodel.json").read_text())
v = json.loads((cfg / "em_visual_rules.json").read_text())
q = json.loads((cfg / "em_qualia_types.json").read_text())
total = sum(len(s.get("qualia", []))
            for cat in q.get("qualia_categories", [])
            for s in cat.get("subcategories", {}).values())
print(f"  node datamodel   {n.get('s3Dgraphy_data_model_version')} (hand-authored semantics)")
print(f"  node registry    {r.get('s3Dgraphy_data_model_version')} ({len(r.get('node_types', {}))} classes)")
print(f"  connections      {c.get('s3Dgraphy_connections_model_version')} ({len(c.get('edge_types', {}))} edge types)")
print(f"  visual rules     {v.get('version')} ({len(v.get('node_styles', {}))} styles)")
print(f"  qualia vocab     {q.get('metadata', {}).get('version')} ({total} terms)")
EOF
