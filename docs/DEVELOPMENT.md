# Development setup (from a clean clone)

EMStudio's batch-interop tools resolve **sibling repos**, so clone these
side by side under one parent directory:

```
<parent>/
  EMStudio/          # this repo
  s3Dgraphy/         # EM language reference impl (Python); dev.sh/tools use ../s3Dgraphy/src
  EM-blender-tools/  # EMtools Blender addon (sync server lives here)
  EMStudio-doc/      # the user manual (Sphinx). Optional — `./em.sh doc` builds it
```

## Prerequisites

- **Node.js 18+** (frontend / Vite).
- **Rust** via [rustup](https://rustup.rs) (`cargo` on PATH) — NOT Homebrew's
  `rust`. `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  then `source "$HOME/.cargo/env"`.
- **Python 3.10+** for the interop tools / GraphML bridge.
- macOS: Xcode Command Line Tools (for Tauri) — usually already present.
- Only for **packaging** the desktop app: PyInstaller in the s3Dgraphy venv, plus
  the platform's own Tauri prerequisites (Windows: MSVC build tools + WebView2;
  Linux: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`).
  See § *Packaging the desktop app*.

## One-time setup

```bash
# 1. s3Dgraphy venv (the GraphML bridge + em2graphml import it; pandas+lxml
#    are needed by the importer; [sync] is the room/database layer, which the
#    GraphML import no longer needs from s3dgraphy dev29)
cd s3Dgraphy
python3 -m venv .venv
.venv/bin/pip install -e '.[sync,docx]' pandas lxml
#   …and, for the narrative exports: python-docx comes with [docx] above;
#   `pip install cairosvg` adds the figures (needs libcairo — see § Packaging).
#   NB: do NOT `pip install -r ../EMStudio/tools/requirements.txt` in THIS venv:
#   it pins s3dgraphy from PyPI and would shadow the `-e .` checkout.

# 2. EMStudio frontend deps
cd ../EMStudio/frontend
npm install
#   If Vite/rollup fails with "Cannot find module @rollup/rollup-darwin-arm64"
#   (npm optional-deps bug), reinstall clean:
#   rm -rf node_modules package-lock.json && npm install

# 3. Rust core (optional here; built on demand)
cd ..
cargo build --release -p em-cli   # → target/release/emstudio (CLI)
cargo test -p em-core             # 9/9 layout+emjson contract tests

# 4. Tauri desktop (optional — native app)
cargo install tauri-cli --locked
```

## Everyday dev

```bash
# Browser + live GraphML bridge together (macOS/Linux):
cd EMStudio
./dev.sh                 # frontend :5173 + Python GraphML bridge :8765
                         # (bridge uses ../s3Dgraphy/.venv python)

# Native desktop app (live reload, native Open/Save):
cd apps/desktop && cargo tauri dev
```

- Edit `frontend/src/**` → the browser hot-reloads.
- Edit the s3Dgraphy exporter → restart the bridge (Ctrl-C, re-run `dev.sh`);
  it imports s3Dgraphy once at startup.

## Versioning the app

The APP version (the badge in the header, the crate, the bundle) lives in three
files. One command writes all three:

```bash
node scripts/set-version.mjs --bump-dev        # 1.6.0-dev.1 → 1.6.0-dev.2, the daily case
node scripts/set-version.mjs 1.6.1-dev.1       # set exactly
node scripts/set-version.mjs --print           # what is set now, per file
# from frontend/: npm run set-version -- <same args>
cd frontend && npm run build                   # the badge reads package.json at build time
```

`frontend/package.json` and `src-tauri/Cargo.toml` get the full version including
`-dev.N`; **`src-tauri/tauri.conf.json` gets the numeric core only** (`1.6.0`),
because the macOS and Windows bundle formats take `x.y.z` and either reject or
silently truncate a pre-release suffix — silently being the worse outcome, since the
.dmg would then claim a version nobody chose. So the dev counter is visible where a
tester reads it and absent where an installer cannot carry it; `--print` shows all
three side by side.

This is **not** `EM_VERSION`, the version of the EM *language*, which is
data-driven from the vendored datamodels and must never be written by hand.

## Packaging the desktop app (macOS · Windows · Linux)

The distributable app is the Tauri bundle **plus** a frozen Python sidecar: the
`em-bridge` binary the shell spawns at launch, which is what answers GraphML
export, resource previews and coordinate reprojection. Build the sidecar FIRST —
`cargo tauri build` picks it up from `src-tauri/binaries/` by target triple.

```bash
# 1. build venv for the sidecar (once per machine)
cd s3Dgraphy
python3 -m venv .venv
.venv/bin/pip install -e '.[sync,minio,geo,docx]' pandas lxml pyinstaller
.venv/bin/pip install Pillow                     # image thumbnails (recommended)
.venv/bin/pip install cairosvg                   # figures in the exports (see below)

# 2. the sidecar, for THIS machine's target triple
cd ../EMStudio/apps/desktop
./build-bridge.sh                                # → src-tauri/binaries/em-bridge-<triple>

# 3. the app
cargo tauri build                                # → .dmg / .msi / .AppImage
```

`build-bridge.sh` is the single source of truth for the freeze flags — read it
rather than reproducing its command line here. It prints, per optional engine,
whether it went in and what is lost if it did not.

**The sidecar is per-platform and per-architecture.** PyInstaller does not
cross-compile: each target needs a build on that OS (and on macOS, on that arch —
`aarch64-apple-darwin` and `x86_64-apple-darwin` are separate files, both of which
Tauri will look for when building a universal app).

### The optional engines, and what they cost

Measured on an M-series Mac, same code, only the flags differing:

| bundle | size | note |
|---|---|---|
| none of the three | 18 MB | reprojection 501s, no image thumbnails, PDF icon |
| + pyproj + Pillow | 26 MB | what the earlier builds produced |
| **shipped: + python-docx** | **27.6 MB** | measured 20 Aug 2026 — Word export included |
| + PyMuPDF as well | 47 MB | **not shipped** — 21 MB for a PDF cover page |

- **pyproj** (`s3dgraphy[geo]`) — needed by `/reproject` and
  `/georeference-scene`, i.e. by the map for any projected CRS (UTM, national
  grids). Its wheels bundle PROJ, so **no system GDAL is required** on any of the
  three OSes. Without it those endpoints return 501 and the map refuses honestly
  instead of guessing.
- **Pillow** — server-side image thumbnails. Worth it in the other direction too:
  a 2.2 MB orthophoto travels as ~40 kB instead of 2.9 MB of base64 (54× less).
- **PyMuPDF** — first page of a PDF, **deliberately excluded**. Developers who
  want PDF covers install it beside the *dev* bridge (`pip install pymupdf`;
  `./dev.sh` runs from the venv, nothing is frozen) — the packaged app shows the
  typed document icon, which is the pre-existing behaviour.
- **minio** (`s3dgraphy[minio]`) — `/ingest-minio` + `/presign`; 501 without it.
- **python-docx** (`s3dgraphy[docx]`) — the **Word export**, i.e. the app's
  `Esporta ▸ Word`. Pure Python, nothing native, ~500 kB: there is no reason to
  ship without it, and `build-bridge.sh` says so when it is missing. It needs
  `--collect-data docx` because the package ships
  `docx/templates/default.docx` — the empty document every `Document()` starts
  from — which PyInstaller's analysis cannot infer; without that file the frozen
  sidecar raises on the first export. Measured 20 Aug 2026: the button answered
  *"docx export unavailable in this build"* because the interpreter running the
  bridge simply did not have the package.
- **cairosvg** — the **figures** in the narrative exports. The client renders a
  matrix as SVG (the layout engine lives there); this turns it into the PNG a
  `.docx` embeds and the PDF a `.tex` includes. It binds the **native libcairo**,
  which the wheel does NOT carry: `brew install cairo` (macOS),
  `apt-get install libcairo2` (Debian/Ubuntu), and on Windows the GTK runtime.
  Bundled only when the build machine can actually load it, and the export never
  depends on it:

  1. cairosvg → the figure;
  2. else `rsvg-convert` / `inkscape` on the **user's** machine, if present;
  3. else the figure stays the placeholder it always was, per figure, and the
     bridge logs which package would fix it.

  A trap worth knowing, measured on a dev Mac: `pip install cairosvg` succeeds
  and `import cairosvg` then raises `OSError: no library called "cairo-2" was
  found`, because Homebrew's cairo is in `/opt/homebrew/lib` and a
  non-Homebrew python does not look there. The package is installed and unusable
  — `build-bridge.sh` distinguishes the two cases in its log rather than telling
  you to install what you already have. Fixes: run the bridge from a Homebrew
  python, or `export DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib`. Or do
  nothing: step 2 above covers a machine with inkscape, which is how the .docx in
  that measurement got its images anyway.

A caveat that is easy to get wrong: **these `--collect-submodules` flags do not
control whether a library is bundled.** PyInstaller's analysis follows imports
inside function bodies, so a lazily imported library present in the build venv is
included regardless. The flags add the data files and metadata the analysis cannot
infer; keeping something OUT requires `--exclude-module`, which is how PyMuPDF is
excluded.

### How the PROJ data directory gets into the binary

PROJ needs its datum database (`proj.db` and friends) at runtime. Three layers,
in the order they apply:

1. **pyinstaller-hooks-contrib** ships `hook-pyproj.py`, which collects
   `pyproj/proj_dir/share/proj` from a pip wheel automatically, and handles
   repackaged (Conda/Debian) layouts plus the Windows `delvewheel` DLLs. On a
   normal `pip install pyproj` this alone is enough on all three OSes.
2. `build-bridge.sh` **also** passes `--add-data <pyproj>/proj_dir/share/proj:
   pyproj/proj_dir/share/proj` — belt for an old hooks-contrib or a de-vendored
   pyproj. Harmless when redundant.
3. At runtime, `tools/em_bridge.py` → `_ensure_proj_data()` runs only when frozen:
   if `PROJ_DATA`/`PROJ_LIB` is unset and pyproj's own lookup would fail, it points
   `PROJ_DATA` at whichever bundled candidate actually contains `proj.db`. It does
   **not** import pyproj (that import stays lazy) and never overrides a variable
   the operator set.

If reprojection ever fails only in the packaged app — PROJ errors about missing
grids — this is the layer to look at. `PROJ_DATA=/path/to/share/proj` in the
environment is the escape hatch.

### Verify the build (the step that catches a missing PROJ)

Reprojection working in dev proves nothing about the bundle: the data files are a
packaging concern. Run the frozen sidecar directly and reproject a point whose
answer is a definition, not a lookup — easting 500 000 in UTM zone 33 **is** the
zone's central meridian, so it must come back as longitude exactly 15:

```bash
./src-tauri/binaries/em-bridge-<triple> --port 8799 &
sleep 8                                    # onefile unpack + cold start
curl -s -X POST http://localhost:8799/reproject \
  -H 'Content-Type: application/json' \
  -d '{"x":500000,"y":4649776.22,"epsg_source":32633}'
# → {"ok": true, …, "lon": 14.999999999999982, "lat": 41.99999995659526}
```

`lon: 15.000…` means PROJ found its data. A 501 means pyproj is not in the bundle;
a PROJ error about `proj.db` means the data files are not (see the three layers
above). Two more checks worth the ten seconds:

```bash
# Pillow IS bundled → a big image answers with a resized thumbnail
curl -s -X POST http://localhost:8799/resource-preview -H 'Content-Type: application/json' \
  -d '{"resource_id":"<id>","folder":"/path/to/a/scanned/folder"}'   # "thumbnail": true
# PyMuPDF is NOT → a PDF answers with its type, and the UI draws the document icon
#   → "media_type": "application/pdf", "no_inline": true
```

Then kill it (`lsof -ti tcp:8799 | xargs kill`) before launching the app, or the
app's own sidecar finds the port taken.

## Releasing (the dev channel, and the three installers)

One command, the same ergonomics as EMtools:

```bash
./em.sh devrel --dry-run      # what would happen: version, tag, files, gate
./em.sh devrel                # gate → bump → commit → tag → push
```

The push of the tag is the whole trigger: `.github/workflows/release.yml` then
builds the desktop app on **three** runners — macOS arm64 (`macos-14`), Windows
and Linux (`ubuntu-22.04`) — and attaches the installers (`.dmg` ·
`.msi`/NSIS · `.deb`/`.AppImage`) to the Release of that tag. macOS Intel was
retired on 2026-09-16 (see the matrix in `release.yml`).
Public binaries are an **autumn 2026** target; the dev channel runs now.

### s3dgraphy first. Always.

The app ships a **frozen Python sidecar** built from the s3dgraphy version pinned
in `tools/requirements.txt`, so that build is reproducible **only if the pin is
published on PyPI**. `devrel` therefore refuses to tag when it is not, and the
first CI job asks the same question before any 40-minute matrix starts:

```
✗ s3dgraphy==1.6.0.dev99 is NOT on PyPI, so nobody (including CI) can build
  the sidecar this release ships.
     cd ../s3Dgraphy && ./bump_and_push.sh
```

The order is: **publish the s3dgraphy dev → move the pin if needed → release
EMStudio.** Never the other way round.

```bash
./em.sh s3d status            # the pin · is it on PyPI · is the checkout ahead?
./em.sh s3d pin 1.6.0.dev15   # move it (refuses a version PyPI does not have)
```

`s3d status` also says the thing that is easy to forget: when the local
`../s3Dgraphy` checkout is **ahead** of the pin, what you are developing against
is *not* what the packaged sidecar will contain. That is a warning and not a
refusal — releasing on an older published pin is legitimate — but it is how a
feature ends up working in `./dev.sh` and missing in the installer.

**One gate, two callers.** `./em.sh s3d status --check` is what the CI workflow
runs (`release.yml`, the `gate` job) — the same function `devrel` runs on a laptop,
so a release refused in Actions and the same release refused here read the same
way. Its exit code carries the verdict: **0** published · **1** not published
(after the retries) · **2** cannot verify. Anything that could tell those three
apart differently would be a second gate.

What it asks, and what it survives — all of it measured on 23 Aug 2026, because
each of these bit for real:

- the question is **the index's**: does `<index>/s3dgraphy/` list a file carrying
  this exact version, and does a one-byte range request for that file come back?
  A listing is a promise; one byte is the proof. `PIP_INDEX_URL` is honoured, so a
  mirror is asked instead of pypi.org;
- a release **pushed seconds ago** is not consistent on every CDN edge, so a hard
  "no" is **retried** (3 attempts, 5 s apart, said out loud) before it is believed.
  That is the false negative that made `s3d pin` accept a version and `devrel`
  refuse it moments later;
- an index that **will not answer** is *unverified*, never *fine* — fail-closed,
  and never retried into a yes;
- and the whole probe runs under a **wall-clock deadline** (`EM_PROBE_DEADLINE`,
  15 s), because a timeout that only covers the wait you thought of is not a
  bound: `urlopen(timeout=10)` bounds one connection ATTEMPT, and urllib walks
  pypi.org's 16 addresses in order — on a network whose IPv6 half is a black hole
  that took **over two minutes**. The probe therefore speaks `curl` (happy
  eyeballs, `--max-time` is a total): **1.6 s** on the same machine, same moment.

`pip` is deliberately NOT in that path any more — measured, it wedged with no
output at all, for `s3dgraphy` and for `six` alike, while `curl` answered the same
index in 0.5 s. What the gate now proves is the NECESSARY condition (the file is
there and its bytes are served); the sufficient one — `pip install` of the pin,
with its extras — is exercised for real by the sidecar step, on all three runners.

### CI builds the sidecar from the published wheel

Not from a checkout. `build-bridge.sh` expects a s3Dgraphy checkout layout
(`$S3DGRAPHY/src/s3dgraphy`), so the workflow installs the pinned wheel into a
venv and **copies** the installed package into that shape (a copy rather than a
symlink: Windows runners need developer mode for symlinks). The freeze flags stay
where they belong — in `build-bridge.sh`, which no workflow reproduces.

Rehearsed locally on 23 Aug 2026 with the exact CI recipe (venv →
`s3dgraphy[geo,rdf]==1.6.0.dev12` from PyPI → shim → `build-bridge.sh`): a
33.8 MB sidecar that answers `/health` and reprojects easting 500 000 in zone 33
to `lon: 14.999999999999982` — i.e. PROJ found its data (see § *Verify the
build*).

`build-bridge.sh` is now Windows-aware in the two places that would have failed
silently: PyInstaller writes `em-bridge.exe` and Tauri resolves
`binaries/em-bridge-<triple>.exe` (a copy without the suffix builds an app that
cannot find its sidecar), and `--add-data SRC<sep>DEST` uses `;` on Windows (with
`:` PyInstaller reads `C` as a path and bundles no `JSON_config`).

### The nightly

`.github/workflows/nightly.yml` runs `./em.sh devrel --yes --if-changed` at 03:17
UTC — the same script, with two guards: nothing is released on a night with **no
commits since the last tag**, and the s3dgraphy gate must pass. It then **calls**
the release workflow (which is `workflow_call`-able) rather than relying on its
own tag push to trigger it: a tag pushed with the default `GITHUB_TOKEN` does not
start another workflow, and the alternative — a personal access token in the
repository's secrets — is a long-lived credential for a job that needs none.

`workflow_dispatch` with `force: true` releases even on a quiet night.

### Signing, and what an unsigned build costs a user

macOS signing + notarization happen **when the Apple secrets are present**
(`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`) and are skipped with a line in the
log when they are not — the build stays green either way. No certificate or
password is in the repository, and none should be.

An **unsigned** alpha is usable, with one extra step the release notes state:

- macOS — right-click ▸ **Open** the first time, or
  `xattr -dr com.apple.quarantine /Applications/EMStudio.app`;
- Windows — SmartScreen ▸ **More info** ▸ **Run anyway**.

**Windows signing is not wired**, deliberately: Tauri v2 takes a certificate
thumbprint or a `signCommand` in `tauri.conf.json`, which is a repo change *plus*
a certificate installed on the machine — not something a workflow can carry.

### The manual travels with the release

`EMStudio-doc` is a separate repository (`ExtendedMatrix/EMStudio-doc`, Sphinx +
Read the Docs). The release checks it out and builds it with `-W`, so a broken
reference fails the release, and passes the app's version as a Sphinx override
(`-D version=… -D release=…`) so the built manual carries the version of the build
it documents. **Nothing is committed or dispatched in the doc repo** — the
smallest touch that still verifies it. Locally:

```bash
./em.sh doc                       # ../EMStudio-doc by default
./em.sh doc /path/to/EMStudio-doc
```

### A stable release

```bash
./em.sh ghrelease 1.6.0           # exact version, same gate, tag v1.6.0
```

## Live sync with Blender (ADR-002, phase 1 — WIP)

The WebSocket transport lives in `EM-blender-tools/sync_bridge/ws_server.py`
(stdlib only, no `websockets` package needed). EMStudio connects as a client
via the **Sync** toolbar button (`ws://localhost:8788`). The Blender-side
`sync_manager` operator/panel that runs the server is not committed yet.

## What is NOT in the repo (regenerated / local)

`frontend/node_modules/`, `frontend/dist/`, `target/`,
`apps/desktop/src-tauri/target/`, `apps/desktop/src-tauri/gen/` (Tauri
regenerates the capability schemas on build), any `.venv/`, and `.claude/`
(local Claude Code tooling). All are `.gitignore`d — a clean build recreates
them. `apps/desktop/src-tauri/Cargo.lock` **is** committed (reproducible app
builds).
