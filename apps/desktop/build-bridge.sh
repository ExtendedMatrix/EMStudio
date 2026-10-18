#!/usr/bin/env bash
# Build the GraphML transformer sidecar (tools/em_bridge.py + s3Dgraphy)
# into a standalone binary that the Tauri desktop shell spawns at launch.
#
# Output: src-tauri/binaries/em-bridge-<target-triple>  (Tauri externalBin
# naming). The binary is gitignored — CI / packagers run this before
# `cargo tauri build`. On a dev machine it makes desktop GraphML
# import/export work with no external Python.
#
# Needs s3Dgraphy importable (its venv has pyinstaller + pandas + lxml):
#   (cd ../../s3Dgraphy && python3 -m venv .venv \
#      && .venv/bin/pip install -e '.[sync,s3,geo,docx]' pandas lxml pyinstaller)
# The [s3] extra (boto3) enables the /ingest-s3 + /presign endpoints in the
# sidecar; without it those endpoints 501 gracefully (like TTL without rdflib).
# The [geo] extra (pyproj) enables /reproject + /georeference-scene, i.e. the map
# for projected coordinates. The [docx] extra (python-docx) enables the Word
# export — pure Python, so there is nothing native to find and no reason to leave
# it out of a packaged app. For image previews and the narrative FIGURES add,
# optionally:
#   .venv/bin/pip install Pillow cairosvg
# cairosvg turns the client-rendered SVG of a matrix into the PNG a .docx needs
# and the PDF a .tex needs. It binds the NATIVE libcairo, which a wheel does not
# carry (macOS: `brew install cairo`; Debian/Ubuntu: `apt-get install
# libcairo2`), so it is bundled only when the build machine has it and the
# figures fall back to placeholders when it does not.
# pyproj and Pillow are bundled if present in the build venv; PyMuPDF is
# EXCLUDED on purpose (22 MB for a PDF cover — dev-only, see below). Each of them
# degrades to the previous behaviour when absent.
#
# Full packaging instructions for the three OSes, including how the PROJ data
# directory gets into the binary and how to VERIFY it afterwards, live in
# ../../docs/DEVELOPMENT.md § "Packaging the desktop app". Keep them there, not
# duplicated here.
#
# Usage:
#   ./build-bridge.sh                 # uses ../../s3Dgraphy
#   S3DGRAPHY=/path/to/s3Dgraphy ./build-bridge.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMSTUDIO="$(cd "$HERE/../.." && pwd)"
S3="${S3DGRAPHY:-$EMSTUDIO/../s3Dgraphy}"
SRC="$S3/src/s3dgraphy"
PY="${PYTHON:-$S3/.venv/bin/python}"
TRIPLE="$(rustc -vV | sed -n 's/host: //p')"
OUT="$HERE/src-tauri/binaries"

# WINDOWS, in two places and both of them silent failures if missed (added when
# the release workflow started building on windows-latest):
#   · PyInstaller writes `em-bridge.exe`, and Tauri looks for
#     `binaries/em-bridge-<triple>.exe` — the suffix is part of the name it
#     resolves, so a copy without it produces an app that starts and then cannot
#     find its sidecar;
#   · `--add-data SRC<sep>DEST` uses os.pathsep, i.e. `;` on Windows. With `:`
#     PyInstaller reads `C` as the source path and bundles nothing, which shows up
#     only at run time as a missing JSON_config.
case "$TRIPLE" in
  *windows*) EXE=".exe"; SEP=";" ;;
  *)         EXE="";     SEP=":" ;;
esac

[[ -x "$PY" ]] || { echo "python not found at $PY (set PYTHON=…)"; exit 1; }
[[ -d "$SRC" ]] || { echo "s3Dgraphy src not found at $SRC (set S3DGRAPHY=…)"; exit 1; }
"$PY" -c "import PyInstaller" 2>/dev/null || { echo "pyinstaller missing: $PY -m pip install pyinstaller"; exit 1; }

WORK="$(mktemp -d)"
echo "Building em-bridge sidecar for $TRIPLE …"

# Bundle the S3 SDK (boto3) only if it is installed in the build venv, so the
# shared object-store endpoints (/ingest-s3, /presign) work offline in the desktop
# sidecar. If [s3] wasn't installed, skip it — those endpoints then 501
# gracefully (like TTL without rdflib), and the build still succeeds. botocore's
# service models are DATA files (JSON), hence `--collect-data botocore`.
S3_ARGS=()
if "$PY" -c "import boto3" 2>/dev/null; then
  S3_ARGS=(--collect-submodules boto3 --collect-submodules botocore
           --collect-data botocore --copy-metadata boto3 --copy-metadata botocore)
  echo "  · bundling the 'boto3' SDK (shared S3 endpoints enabled)"
else
  echo "  · 'boto3' SDK not in build venv — /ingest-s3 + /presign will 501"
fi

# The optional engines added by the geo + preview work.
#
# WHAT THESE FLAGS ACTUALLY DO — measured, because the obvious reading is wrong.
# PyInstaller's analysis follows imports inside FUNCTION BODIES, so a library that
# the bridge imports lazily (pyproj inside api.reproject_many, PIL inside
# _thumbnail) is bundled whenever it is installed in the build venv, flags or no
# flags: builds with and without these `--collect-submodules` came out the same
# size to the megabyte. What the flags add is the part the analysis CANNOT infer —
# the PROJ data directory and the package metadata. And the only way to keep a
# library OUT is `--exclude-module` (see PyMuPDF below, verified: 47 MB → 26 MB).
#
#   pyproj   (G1/G3) — EPSG → WGS84. Wheels BUNDLE PROJ, so no system GDAL is
#                      needed; the PROJ data directory must travel or the frozen
#                      binary finds no datum grids.
#   Pillow   (G2)    — server-side image thumbnails. Pays for itself: a 2 MB
#                      orthophoto travels as ~40 kB instead of 2.9 MB of base64.
# Together they measure +8 MB (18 MB → 26 MB) on this machine.
GEO_ARGS=()
# `${ARR[@]+"${ARR[@]}"}` below, not `"${ARR[@]}"`: macOS ships bash 3.2, where
# expanding an EMPTY array under `set -u` aborts with "unbound variable". That bit
# for real — the build failed on any machine without the S3 SDK.
if "$PY" -c "import pyproj" 2>/dev/null; then
  PROJ_DATA_DIR="$("$PY" -c 'import pyproj, os; print(os.path.join(os.path.dirname(pyproj.__file__), "proj_dir", "share", "proj"))')"
  GEO_ARGS=(--collect-submodules pyproj --copy-metadata pyproj)
  if [[ -d "$PROJ_DATA_DIR" ]]; then
    GEO_ARGS+=(--add-data "$PROJ_DATA_DIR${SEP}pyproj/proj_dir/share/proj")
  fi
  echo "  · bundling 'pyproj' (/reproject + /georeference-scene enabled)"
else
  echo "  · 'pyproj' not in build venv — /reproject will 501, the map refuses"
fi

PREVIEW_ARGS=()
if "$PY" -c "import PIL" 2>/dev/null; then
  PREVIEW_ARGS+=(--collect-submodules PIL)
  echo "  · bundling 'Pillow' (server-side thumbnails: less bandwidth, not more)"
else
  echo "  · 'Pillow' not in build venv — big images get no thumbnail"
fi
# Word export. python-docx is PURE PYTHON, so PyInstaller's analysis finds it
# wherever it is installed — but not its DATA: the package ships
# `docx/templates/default.docx`, the empty document every `Document()` starts
# from, and without it the frozen sidecar raises `PackageNotFoundError` on the
# first export. That file is exactly the kind of thing the analysis cannot infer,
# which is what `--collect-data` is for.
DOCX_ARGS=()
if "$PY" -c "import docx" 2>/dev/null; then
  DOCX_ARGS=(--collect-data docx --copy-metadata python-docx)
  echo "  · bundling 'python-docx' (Esporta ▸ Word works in the packaged app)"
else
  echo "  · 'python-docx' not in build venv — Word export will 501 (install the"
  echo "    [docx] extra: it is pure Python, there is no reason to ship without it)"
fi

# The narrative FIGURES (a matrix drawn by the client, arriving as SVG). cairosvg
# converts it to the PNG a .docx embeds and the PDF a .tex includes. It binds the
# native libcairo through cffi, and a wheel does NOT carry that library — so this
# is a bundle-if-present, degrade-if-absent dependency, exactly like pyproj's PROJ
# data and Pillow:
#
#   present  → figures land in the exports as images
#   absent   → the bridge tries `rsvg-convert`/`inkscape` on the user's machine,
#              and failing that leaves the placeholder it always had. The export
#              still happens; only the picture is missing, per figure.
#
# `--collect-binaries cairocffi` is the part that matters and the part that can
# quietly not work: it copies the dylib/so cffi resolved AT BUILD TIME. If the
# packaged app is run on a machine without libcairo and the copy did not happen,
# the import fails and the fallback above takes over — which is why nothing here
# is fatal.
FIGURE_ARGS=()
if "$PY" -c "import cairosvg" 2>/dev/null; then
  FIGURE_ARGS=(--collect-submodules cairosvg --copy-metadata cairosvg
               --collect-submodules cairocffi --copy-metadata cairocffi
               --collect-binaries cairocffi)
  echo "  · bundling 'cairosvg' (+ libcairo, if cffi resolved it) — figures in exports"
elif "$PY" -c "import importlib.util as u, sys; sys.exit(0 if u.find_spec('cairosvg') else 1)" 2>/dev/null; then
  # INSTALLED BUT NOT USABLE, and the difference matters to whoever reads this
  # log: `import cairosvg` raises OSError when the wheel is there and the native
  # libcairo is not on the loader's path. Measured on this machine — Homebrew's
  # cairo installed, a non-Homebrew python looking elsewhere. Saying "not in the
  # venv" would send somebody to re-install a package they already have.
  echo "  · 'cairosvg' IS installed but cannot load libcairo — not bundled."
  echo "    Exports fall back to rsvg-convert/inkscape on the user's machine, or"
  echo "    to figure placeholders. Fix: install libcairo where this python looks"
  echo "    (macOS: brew install cairo, then run the bridge from a Homebrew python"
  echo "    or set DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib)."
else
  echo "  · 'cairosvg' not in build venv — the exports keep their figure"
  echo "    placeholders (needs libcairo: brew install cairo / apt install libcairo2)"
fi

# PyMuPDF is deliberately NOT bundled (C2): 22 MB for a PDF cover page, on a
# binary that is otherwise ~15 MB. `/resource-preview` then falls back to the
# typed document icon, which is what it did before G2.
#
# The exclusion has to be EXPLICIT. PyInstaller's analysis follows imports inside
# function bodies too, so `import fitz` in `_pdf_first_page` would pull the whole
# library in on any machine whose build venv happens to have it — silently, and
# only visible as a suddenly-doubled binary. Same reason pandas/numpy are excluded
# below. Developers who want PDF covers install PyMuPDF next to the DEV bridge
# (./dev.sh reads the venv directly, no freezing involved).

"$PY" -m PyInstaller --onefile --name em-bridge \
  --paths "$S3/src" --collect-submodules s3dgraphy \
  --add-data "$SRC/JSON_config${SEP}s3dgraphy/JSON_config" \
  --add-data "$SRC/templates${SEP}s3dgraphy/templates" \
  --add-data "$SRC/mappings${SEP}s3dgraphy/mappings" \
  --hidden-import lxml --hidden-import lxml.etree --hidden-import lxml._elementpath \
  --collect-submodules rdflib --copy-metadata rdflib \
  ${S3_ARGS[@]+"${S3_ARGS[@]}"} \
  ${GEO_ARGS[@]+"${GEO_ARGS[@]}"} \
  ${PREVIEW_ARGS[@]+"${PREVIEW_ARGS[@]}"} \
  ${DOCX_ARGS[@]+"${DOCX_ARGS[@]}"} \
  ${FIGURE_ARGS[@]+"${FIGURE_ARGS[@]}"} \
  --exclude-module pandas --exclude-module numpy --exclude-module openpyxl \
  --exclude-module fitz --exclude-module pymupdf --exclude-module pymupdf.mupdf \
  --distpath "$WORK/dist" --workpath "$WORK/build" --specpath "$WORK" \
  --noconfirm --log-level WARN \
  "$EMSTUDIO/tools/em_bridge.py"

mkdir -p "$OUT"
cp "$WORK/dist/em-bridge$EXE" "$OUT/em-bridge-$TRIPLE$EXE"
# ad-hoc sign so macOS lets the sidecar's child process run (real releases
# get Developer ID + notarization at the .app level). A no-op elsewhere.
codesign -s - --force "$OUT/em-bridge-$TRIPLE$EXE" 2>/dev/null || true
rm -rf "$WORK"
echo "✓ $OUT/em-bridge-$TRIPLE$EXE"
