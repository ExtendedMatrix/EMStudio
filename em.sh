#!/usr/bin/env bash
# EMStudio dev/build/release helper — one entry point, the same ergonomics as
# EMtools' `em.sh`. Two halves:
#
#   the FRONTEND chain (sync/build/wasm/all/dev) — the EMStudio frontend is a
#   browser/TS app that bundles the EM datamodels at BUILD time (it cannot import
#   the Python s3dgraphy at runtime), so refreshing them is a build step;
#
#   the RELEASE chain (inc/pack/devrel/ghrelease/s3d/doc) — one command bumps the
#   app version, tags and pushes, and GitHub Actions builds the desktop app for
#   macOS (arm64 + Intel), Windows and Linux.
#
# THE ORDER THAT MATTERS, and the reason `s3d` is in here: the desktop app ships a
# FROZEN Python sidecar (`em-bridge`) built against the s3dgraphy version pinned in
# `tools/requirements.txt`. That build is reproducible only if the pin is published
# on PyPI, so `devrel` REFUSES to tag when it is not. Publish the s3dgraphy dev
# first (in the s3Dgraphy repo: `./bump_and_push.sh`), then release EMStudio.
#
# Usage:
#   ./em.sh sync   [s3Dgraphy]   Refresh the vendored EM datamodels (visual rules,
#                                node/edge models, qualia vocab, 2D icons) from a
#                                s3Dgraphy checkout OR the installed s3dgraphy.
#                                No arg = auto-detect.
#   ./em.sh build                Build the single-file frontend (dist/).
#   ./em.sh wasm                 Rebuild em-core → WASM (needs Rust/cargo).
#   ./em.sh all    [s3Dgraphy]   sync → wasm → build (sync/wasm best-effort).
#   ./em.sh dev    [args…]       Start the dev stack (bridge + Vite → ./dev.sh).
#
#   ./em.sh version              What version is set, per file.
#   ./em.sh inc                  Bump the dev counter (1.6.0-dev.2 → -dev.3).
#   ./em.sh s3d status [--check] The pinned s3dgraphy: is it published? is there
#                                a newer one? is the
#                                local checkout ahead of it? `--check` also
#                                EXITS non-zero on a bad verdict — that is what
#                                the CI workflow runs, so the gate is one
#                                function and not two.
#   ./em.sh s3d pin <version>    Move the pin (refuses one that is not on PyPI).
#   ./em.sh doc    [path]        Build the manual (EMStudio-doc) as a CHECK: -W,
#                                with the version aligned to this app.
#   ./em.sh pack                 Build the desktop app LOCALLY (sidecar + Tauri)
#                                for this machine only.
#   ./em.sh devrel [--dry-run] [--yes] [--if-changed]
#                                A dev release: gate → inc → commit → tag → push.
#                                GitHub Actions then builds the three installers.
#   ./em.sh ghrelease <x.y.z>    A stable release at an exact version.
#   ./em.sh help
#
# In a DISTRIBUTED build the datamodels are already inlined into dist/index.html
# (and the Tauri app), so the end user needs neither Python nor s3dgraphy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE="$ROOT/frontend"
REQ="$ROOT/tools/requirements.txt"
# ── DOVE STA QUESTO REPOSITORY: SI LEGGE, NON SI SCRIVE ──────────────────────
#
# Qui c'era l'URL battuto a mano, ed è sopravvissuto al trasferimento del
# 22 settembre 2026 — insieme ad altre otto occorrenze del vecchio
# proprietario. Una stringa non segue un trasloco; un `git remote` sì, perché è
# l'indirizzo a cui questo checkout PARLA davvero. Su un fork stampa il fork,
# che è la cosa giusta: i link che `devrel` mostra a fine corsa («guarda le
# Actions», «ecco la release») devono puntare dove il tag è appena andato.
#
# Il ripiego è `Cargo.toml`, che è il posto dove un URL di repository è un
# CAMPO e non un appunto (cargo lo pubblica). `frontend/scripts/check-owner.mjs`
# verifica che i due concordino, quindi il ripiego non può marcire in silenzio.
repo_url() {
  local u=""
  if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    u="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
  fi
  if [[ -z "$u" ]]; then
    #: niente git (un tarball, un container): il campo dichiarato
    u="$(sed -n 's/^repository *= *"\(.*\)".*/\1/p' "$ROOT/Cargo.toml" | head -1)"
  fi
  #: `git@github.com:owner/name.git` e `https://…/owner/name.git` alla stessa forma
  u="${u%.git}"
  u="${u/git@github.com:/https://github.com/}"
  printf '%s' "$u"
}
REPO_URL="$(repo_url)"
#: e il proprietario da solo, che è ciò che serve per nominare i repo FRATELLI
#: (il manuale) senza scriverne il proprietario una seconda volta
REPO_OWNER="$(printf '%s' "$REPO_URL" | sed -n 's#.*github\.com/\([^/]*\)/.*#\1#p')"
DOC_URL="https://github.com/${REPO_OWNER:-ExtendedMatrix}/EMStudio-doc"

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠  %s\033[0m\n' "$*" >&2; }
#: `fail <code> <sentence>` — the red line, with the exit code the caller means.
#: `die` is `fail 1`, which is what almost everything wants; the s3dgraphy gate is
#: the exception, because a CI step reading 1 (not published) or 2 (cannot verify)
#: can say two different things about a refusal that looks the same from outside.
fail() { local code="$1"; shift; printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit "$code"; }
die() { fail 1 "$*"; }

usage() {
  # From the header above, so the help cannot drift from the comment a reader
  # opens the file for. (It used to be a fixed line range, which went stale the
  # first time the header grew.)
  sed -n '/^# Usage:/,/^# In a DISTRIBUTED/p' "${BASH_SOURCE[0]}" \
    | sed 's/^# \{0,1\}//' | sed '$d'
}

# ── the frontend chain ───────────────────────────────────────────────────────

do_sync() { log "sync datamodels"; "$FE/scripts/sync-datamodels.sh" "$@"; }
do_wasm() { log "build WASM (em-core)"; "$FE/scripts/build-wasm.sh"; }
do_build() {
  log "build frontend (dist)"
  if [ ! -d "$FE/node_modules" ]; then
    log "installing frontend deps (first run)"
    (cd "$FE" && npm install)
  fi
  (cd "$FE" && npm run build)
}

# ── the app version ──────────────────────────────────────────────────────────
#
# ONE implementation of the bump, and it is `scripts/set-version.mjs` — the script
# that also knows the part a shell would get wrong: `-dev.N` belongs in
# package.json and Cargo.toml but NOT in tauri.conf.json, because the macOS and
# Windows bundle formats take `x.y.z` and silently truncate a pre-release suffix.
# So this file never computes a version; it asks for one.

app_version() { node -p "require('$FE/package.json').version"; }

next_dev_version() {
  # Asked of the one implementation, in dry-run, and PARSED — rather than
  # recomputed here, which would be a second bump rule to keep in step.
  local line
  line="$(node "$ROOT/scripts/set-version.mjs" --bump-dev --dry-run \
          | sed -n 's/^would set app version \([0-9][^ ]*\).*/\1/p' | tail -1)"
  [[ -n "$line" ]] || die "could not read the next version from set-version.mjs \
(its output changed: fix this parse rather than guessing a version to tag)"
  printf '%s' "$line"
}

do_inc() {
  log "bump the dev counter"
  node "$ROOT/scripts/set-version.mjs" --bump-dev "$@"
}

# ── the s3dgraphy gate ───────────────────────────────────────────────────────
#
# The desktop app is only as reproducible as its sidecar, and the sidecar is
# frozen against the PINNED s3dgraphy. E.D.'s rule, and it is a release order, not
# a preference: publish the s3dgraphy dev, THEN release EMStudio.

pinned_s3dgraphy() {
  # `s3dgraphy[geo,rdf]==1.6.0.dev12` → `1.6.0.dev12`
  sed -n 's/^s3dgraphy\(\[[^]]*\]\)\{0,1\}==\([^ #]*\).*/\2/p' "$REQ" | head -1
}

local_s3dgraphy_version() {
  local pyproject="$ROOT/../s3Dgraphy/pyproject.toml"
  [[ -f "$pyproject" ]] || return 0
  sed -n 's/^version = "\([^"]*\)".*/\1/p' "$pyproject" | head -1
}

#: Is this exact version on PyPI? Three outcomes, and the third is why this is a
#: function and not a one-liner: published / not published / COULD NOT CHECK. A
#: gate that cannot reach the index must not answer "yes" — that is how an
#: unpublishable release gets tagged on a train with no wifi.
#: 0 = published · 1 = not published · 2 = could not verify
#:
#: THE FALSE NEGATIVE THIS SURVIVES, measured on 23 Aug 2026 and the reason the
#: shape below is not the obvious one: `./em.sh s3d pin 1.6.0.dev15` accepted the
#: pin (it asks this same function) and, seconds later, `./em.sh devrel` refused
#: with "s3dgraphy==1.6.0.dev15 is NOT on PyPI" — while dev15 was published and
#: downloadable. Two consecutive calls to ONE function disagreed about a
#: published package, which means the answer was never about the package:
#:
#:   · a release pushed seconds ago is not yet consistent on every CDN edge
#:     (PyPI is behind Fastly), so one request can see the new file and the next,
#:     landing on another edge, cannot;
#:   · and `pip download` WITHOUT `--no-cache-dir` may serve a stale simple index
#:     out of pip's own HTTP cache — a cache of "this version does not exist",
#:     which is the worst possible thing to remember for ten minutes.
#:
#: This gate runs at exactly the moment a release was just pushed. So: never a
#: cache, and a hard negative is RETRIED a couple of times before it is believed.
#: A "cannot verify" is NOT retried into a yes — an unreachable index stays
#: fail-closed immediately, because retrying a network error until it looks like
#: an answer is how a fail-closed gate quietly becomes a fail-open one.
#:
#: AND THE THING THAT MAKES THE THREE OUTCOMES REAL, measured while fixing the
#: above: **pip cannot tell you which of them happened.** With the index pointed
#: at a dead port, and again at a hostname that does not resolve, `pip download`
#: says exactly what it says for a version that was never published —
#:
#:     ERROR: Could not find a version that satisfies the requirement … (from versions: none)
#:     ERROR: No matching distribution found for …
#:
#: — so classifying on those two lines (which is what this did before) reported a
#: laptop with no network as "publish it first". The verdict stayed a refusal, so
#: nothing opened up; the SENTENCE was wrong, and it sends somebody to publish a
#: package that is already published. The transport question therefore has to be
#: asked separately, of the index itself, and it is asked FIRST: a server that
#: answers means the "no" is about the version; a server that does not answer
#: means we do not know.

#: How hard the probe tries before believing a NO. Overridable so a measurement
#: (or a nightly in a hurry) can tighten it; the worst case is bounded on purpose
#: — `(attempts - 1) × wait` seconds of waiting, i.e. ~10 s by default, never a hang.
EM_PROBE_ATTEMPTS="${EM_PROBE_ATTEMPTS:-3}"
EM_PROBE_WAIT="${EM_PROBE_WAIT:-5}"
#: The wall-clock deadline for ONE probe. With the defaults the worst case is
#: `3 × 15 s` of asking plus `2 × 5 s` of waiting — **55 s**, and that is a
#: ceiling, not an estimate: a probe past its deadline is killed.
EM_PROBE_DEADLINE="${EM_PROBE_DEADLINE:-15}"
#: The bound on ONE http request (curl's `--max-time`, which is a total and not a
#: per-address attempt — see `index_says`). Two requests per probe, so the probe
#: itself is ~2× this at worst, inside the deadline above.
EM_PROBE_HTTP="${EM_PROBE_HTTP:-6}"

#: Run a command with a WALL-CLOCK deadline, portably (macOS ships no
#: `timeout(1)`). Returns the command's status, or 124 when the deadline killed it
#: — the number `timeout(1)` uses, so a reader recognises it.
#:
#: A belt over curl's own `--max-time`, and not a redundant one: a bound that
#: trusts one tool's idea of a timeout is not a bound, which is exactly how a
#: ten-second timeout turned into two minutes (see `index_says`).
bounded() {
  local limit="$1"; shift
  "$@" &
  local job=$!
  ( sleep "$limit"; kill -TERM "$job" 2>/dev/null ) >/dev/null 2>&1 &
  local dog=$!
  local rc=0
  wait "$job" || rc=$?
  # The watchdog is killed either way: left alive it would fire into a recycled
  # pid, a bug that only ever shows up on somebody else's machine.
  kill "$dog" 2>/dev/null || true
  wait "$dog" 2>/dev/null || true
  if [[ "$rc" -eq 143 ]]; then                 # SIGTERM: the deadline, not a crash
    return 124
  fi
  return "$rc"
}

#: Ask the index whether this exact version is THERE and its bytes are SERVED.
#:
#: Prints one word on stdout — `published` · `absent` · `unreachable` — and a
#: human sentence on stderr. Two bounded requests, both PEP 503:
#:
#:   1. the project page (`<index>/s3dgraphy/`) — does it list a file whose name
#:      carries this exact version?
#:   2. a one-byte range request for that file — do the bytes actually come? A
#:      listing is a promise; one byte is the proof.
#:
#: THREE WRONG ANSWERS CAME BEFORE THIS ONE, each measured, and the order matters
#: because each correction killed the previous diagnosis (23 Aug 2026):
#:
#:   · `pip download` — what this used to run — wedged with **no output at all**,
#:     for `s3dgraphy` and for `six` alike. Blamed pip;
#:   · a bare `urllib` GET of the same page took **40 s**, then over **120 s**,
#:     where `curl` took **0.5 s**. So not pip;
#:   · `getaddrinfo('pypi.org')` returned in **0.00 s** — with **16 addresses**.
#:     So not DNS either.
#:
#: What it is: `urlopen(timeout=N)` bounds ONE connection attempt, and urllib tries
#: those addresses **in order**. On a network where the IPv6 half is a black hole,
#: the total is `attempts × N` — minutes, through a timeout that looks like ten
#: seconds. `curl` does happy-eyeballs (dual-stack in parallel) and `--max-time` is
#: a TOTAL. Hence curl, and hence the outer wall-clock watchdog as well: a bound
#: that trusts one library's idea of a timeout is not a bound.
#:
#: And the question this asks, stated honestly: "the index lists this exact file
#: and its bytes are served" rather than "pip can resolve and download it". That is
#: the NECESSARY condition a packager needs, which is what a gate is for; the
#: sufficient one — `pip install` of the pin with its extras — is exercised for
#: real in CI, on all three runners, by the step that freezes the sidecar from that
#: very pin.
#:
#: `PIP_INDEX_URL` is honoured: a corporate mirror is exactly the case where "is
#: PyPI up" would be the wrong question.
index_says() {
  local version="$1" base page_url page errs status hrefs stem href file_url

  base="${PIP_INDEX_URL:-https://pypi.org/simple}"
  base="${base%/}"
  page_url="$base/s3dgraphy/"
  page="$(mktemp)"; errs="$(mktemp)"

  # 1 · the project page
  status="$(curl -sS -o "$page" -w '%{http_code}' \
            --max-time "$EM_PROBE_HTTP" "$page_url" 2>"$errs")" || status="000"
  case "$status" in
    200) : ;;
    404)
      # A 404 on the PROJECT is an answer, and the answer is "no": this index
      # knows nothing about the name.
      printf 'the index has no project s3dgraphy (%s)\n' "$page_url" >&2
      printf 'absent\n'; rm -f "$page" "$errs"; return 0 ;;
    000)
      printf 'curl could not reach %s — %s\n' "$page_url" \
        "$(tr '\n' ' ' < "$errs")" >&2
      printf 'unreachable\n'; rm -f "$page" "$errs"; return 0 ;;
    *)
      printf 'the index answered %s for %s\n' "$status" "$page_url" >&2
      printf 'unreachable\n'; rm -f "$page" "$errs"; return 0 ;;
  esac

  # 2 · a file whose NAME carries this version. The dots are escaped, and the
  # character after the version must be `-` or `.`, or `1.6.0.dev15` would happily
  # match `1.6.0.dev150` the day that exists.
  stem="s3dgraphy-$(printf '%s' "$version" | sed 's/\./\\./g')"
  hrefs="$(grep -o 'href="[^"]*"' "$page" | sed 's/^href="//; s/"$//; s/#.*$//')"
  href="$(printf '%s\n' "$hrefs" \
          | grep -iE "(^|/)${stem}(-|\.tar\.gz|\.zip)" | head -1)"
  if [[ -z "$href" ]]; then
    printf 'the index lists %s file(s) for s3dgraphy, none of them version %s\n' \
      "$(printf '%s\n' "$hrefs" | grep -c . || true)" "$version" >&2
    printf 'absent\n'; rm -f "$page" "$errs"; return 0
  fi
  case "$href" in
    http*) file_url="$href" ;;
    /*)    file_url="${base%/simple}$href" ;;
    *)     file_url="$page_url$href" ;;
  esac
  rm -f "$page"

  # 3 · …and the bytes
  status="$(curl -sS -o /dev/null -w '%{http_code}' -r 0-0 \
            --max-time "$EM_PROBE_HTTP" "$file_url" 2>"$errs")" || status="000"
  case "$status" in
    200 | 206)
      printf 'listed and served: %s\n' "${file_url##*/}" >&2
      printf 'published\n' ;;
    000)
      printf 'the file is listed but curl could not fetch it (%s) — %s\n' \
        "$file_url" "$(tr '\n' ' ' < "$errs")" >&2
      printf 'unreachable\n' ;;
    *)
      printf 'the file is listed but the store answered %s: %s\n' \
        "$status" "$file_url" >&2
      printf 'unreachable\n' ;;
  esac
  rm -f "$errs"
}

s3dgraphy_published() {
  local version="$1" verdict why attempt errs answer rc
  for (( attempt = 1; attempt <= EM_PROBE_ATTEMPTS; attempt++ )); do
    # ONE call per attempt, with the two streams kept apart: stdout is the verdict
    # word, stderr the sentence a refusal quotes. Asking twice to read them
    # separately would be two round trips — and two chances to disagree, which is
    # the failure this whole function exists to remove.
    errs="$(mktemp)"; answer="$(mktemp)"
    # `|| rc=$?`, and NOT `set +e` / `set -e` around it. Measured, and it cost an
    # hour: `set -e` inside this function is GLOBAL, so it overrode the caller's
    # `set +e` and the `return 2` below then tripped errexit and killed the script
    # mid-probe — the status table never printed. A tested context asks for the
    # status without touching anybody else's shell options.
    rc=0
    bounded "$EM_PROBE_DEADLINE" index_says "$version" >"$answer" 2>"$errs" || rc=$?
    verdict="$(cat "$answer")"
    why="$(cat "$errs")"
    rm -f "$errs" "$answer"
    if [[ "$rc" -eq 124 ]]; then
      # Not an answer, and not a "no": we ran out of time. Fail closed.
      warn "cannot verify s3dgraphy==$version: the probe did not answer within \
${EM_PROBE_DEADLINE}s and was stopped — the index, the DNS or the CDN is not \
responding. (A release is not tagged on a maybe.)"
      return 2
    fi

    case "$verdict" in
      published)
        if [[ "$attempt" -gt 1 ]]; then
          log "…there on attempt $attempt: it was the CDN, not the package"
        fi
        return 0
        ;;
      unreachable)
        # NOT a "no": a "no idea". Fail closed now — retrying a network error
        # until it looks like an answer is how a fail-closed gate becomes a
        # fail-open one.
        warn "cannot verify s3dgraphy==$version: the package index did not answer"
        warn "  $why"
        return 2
        ;;
      absent) : ;;                             # a real "no" — retry below
      *)
        warn "cannot verify s3dgraphy==$version: the probe itself did not answer"
        warn "  ${why:-no output}"
        return 2
        ;;
    esac

    if (( attempt < EM_PROBE_ATTEMPTS )); then
      # SAID, not waited out in silence: ten quiet seconds look like a hang, and
      # the sentence is also the diagnosis if it ends up refusing anyway.
      warn "the index does not have s3dgraphy==$version yet (attempt $attempt of \
$EM_PROBE_ATTEMPTS) — a release pushed seconds ago is not consistent on every \
CDN edge. Waiting ${EM_PROBE_WAIT}s and asking again…"
      sleep "$EM_PROBE_WAIT"
    fi
  done
  return 1
}

#: The verdict on the PIN, probed ONCE and remembered.
#:
#: Two callers need it (the status table and the gate) and one of them prints
#: before it decides. Probing twice would mean two network round trips and, worse,
#: the chance of a table that says "yes" above a refusal that says "no" — the very
#: disagreement the retry work above exists to remove. So: one probe per run.
S3D_PIN=""
S3D_RC=""

s3d_probe() {
  S3D_PIN="$(pinned_s3dgraphy)"
  [[ -n "$S3D_PIN" ]] || die "no exact s3dgraphy pin in tools/requirements.txt — \
the sidecar build has no version to freeze"
  S3D_RC=0
  s3dgraphy_published "$S3D_PIN" || S3D_RC=$?
}

#: ── the SECOND question: is there a newer one? ───────────────────────────────
#:
#: The gate has always asked "is this version published?". E.D.'s policy is that
#: we sit on the newest published dev — but a policy is not a mechanism, and this
#: is the line where the two must not blur: **the pin stays EXACT (`==`) and
#: moves because somebody decides.** A pin that moves by itself is `>=`, and `>=`
#: is exactly what produced the dev12/dev16 divergence closed on 2026-08-31: a
#: build that changes what it contains without anybody having decided.
#:
#: So being behind is INFORMATION, never a refusal (see `do_s3d_status`). A
#: warning that blocks becomes, in a fortnight, a warning that is ignored.
#:
#: THE TRAP HERE IS NOT `--pre`. That one bites `pip index`, which hides
#: pre-releases without it; this reads the SIMPLE INDEX, where every file is
#: listed, devs included. The trap is the SORT: `1.6.0.dev9` is lexically
#: greater than `1.6.0.dev16`, so a naive `sort | tail -1` would announce that we
#: are behind a version released months ago — worse than silence. Hence a key, in
#: python, over the two shapes this project actually publishes (`X.Y.Z` and
#: `X.Y.Z.devN`, checked against the index).
index_latest() {
  local base page_url page status

  base="${PIP_INDEX_URL:-https://pypi.org/simple}"
  base="${base%/}"
  page_url="$base/s3dgraphy/"
  page="$(mktemp)"
  status="$(curl -sS -o "$page" -w '%{http_code}' \
            --max-time "$EM_PROBE_HTTP" "$page_url" 2>/dev/null)" || status="000"
  if [[ "$status" != "200" ]]; then rm -f "$page"; return 1; fi
  python3 - "$page" <<'PY'
import re, sys

names = re.findall(r's3dgraphy-([0-9][^"#/]*?)(?:-py3|-any|\.tar\.gz|\.zip|-cp)',
                   open(sys.argv[1], encoding="utf-8", errors="replace").read())


def key(v):
    m = re.fullmatch(r"(\d+(?:\.\d+)*)(?:\.?dev(\d+))?", v)
    if not m:
        return ((-1,), 0, 0)
    release = tuple(int(p) for p in m.group(1).split("."))
    return (release, 0 if m.group(2) is not None else 1, int(m.group(2) or 0))


# Anything unexpected sorts LOWEST rather than winning by accident: announcing a
# version nobody can install would be worse than announcing nothing.
if names:
    print(max(set(names), key=key))
PY
  rm -f "$page"
}

#: Empty when the question could not be answered — and that is a legitimate
#: answer, said by omission: the row simply does not appear. Nothing in here may
#: fail, because nothing in here is a gate.
S3D_LATEST=""

s3d_latest_probe() {
  S3D_LATEST="$(bounded "$EM_PROBE_DEADLINE" index_latest 2>/dev/null || true)"
  S3D_LATEST="$(printf '%s' "$S3D_LATEST" | tr -d ' \n')"
}

#: Is the pin behind the newest published version? The same key, through python,
#: because the shell has no version comparison that gets `dev9` vs `dev16` right.
s3d_is_behind() {
  local pin="$1" latest="$2"
  [[ -n "$pin" && -n "$latest" && "$pin" != "$latest" ]] || return 1
  python3 - "$pin" "$latest" <<'PY'
import re, sys


def key(v):
    m = re.fullmatch(r"(\d+(?:\.\d+)*)(?:\.?dev(\d+))?", v)
    if not m:
        return ((-1,), 0, 0)
    release = tuple(int(p) for p in m.group(1).split("."))
    return (release, 0 if m.group(2) is not None else 1, int(m.group(2) or 0))


sys.exit(0 if key(sys.argv[1]) < key(sys.argv[2]) else 1)
PY
}

#: The refusal, in words — for a verdict that is not 0. ONE wording, said by the
#: local gate and by the CI step, because a release refused on a laptop and the
#: same release refused in Actions must not read like two different problems.
s3d_refuse() {
  if [[ "$S3D_RC" -eq 1 ]]; then
    fail 1 "s3dgraphy==$S3D_PIN is NOT on PyPI, so nobody (including CI) can build \
the sidecar this release ships.
   Publish that dev FIRST, then release EMStudio:
       cd ../s3Dgraphy && ./bump_and_push.sh      # bumps + publishes
   …then, if the pin should move:  ./em.sh s3d pin <the published version>"
  fi
  fail 2 "cannot verify s3dgraphy==$S3D_PIN on PyPI, and this gate does not guess: \
an unverified pin is exactly how a release ships a sidecar nobody can rebuild.
   Check the network, or run again when the index answers."
}

#: `./em.sh s3d status` — the table a human reads. With `--check` it also ENDS
#: with the verdict (exit 1 not published · 2 cannot verify), which is what makes
#: it usable as a CI step: the workflow runs this instead of carrying its own copy
#: of the question.
do_s3d_status() {
  local check=0 local_v
  if [[ "${1:-}" == "--check" ]]; then
    check=1
  elif [[ -n "${1:-}" ]]; then
    die "s3d status: unknown option '${1}' (only --check)"
  fi

  s3d_probe
  # The second question, asked only here: it is information for a human and for
  # the nightly's log, never a gate. Its failure is silence (see `s3d_latest_probe`).
  s3d_latest_probe
  echo "pinned (the sidecar freezes this)   s3dgraphy==$S3D_PIN"
  local_v="$(local_s3dgraphy_version || true)"
  if [[ -n "$local_v" ]]; then
    echo "local checkout (../s3Dgraphy)       $local_v"
  else
    echo "local checkout (../s3Dgraphy)       not found"
  fi
  case "$S3D_RC" in
    0) echo "on PyPI                             yes — a packager can build the sidecar" ;;
    1) echo "on PyPI                             NO — publish it before releasing" ;;
    *) echo "on PyPI                             unknown (no index reachable)" ;;
  esac
  if [[ -n "$S3D_LATEST" ]]; then
    echo "newest on PyPI                      $S3D_LATEST"
  fi
  # BEHIND IS NOT A FAILURE. E.D.'s policy is to sit on the newest published dev,
  # and this is how a policy is enforced: by telling somebody, so they decide. A
  # release is never blocked because a dev came out yesterday — the gate refuses
  # only what makes the binary irreproducible (an unpublished pin, an unreachable
  # index), and `--check` below is untouched by this.
  if s3d_is_behind "$S3D_PIN" "$S3D_LATEST"; then
    warn "the pin ($S3D_PIN) is behind the newest published s3dgraphy \
($S3D_LATEST). The policy is to sit on the newest dev — move it when the app is \
ready for it:  ./em.sh s3d pin $S3D_LATEST   (this is not a failure, and it does \
not block a release.)"
  fi
  if [[ -n "$local_v" && "$local_v" != "$S3D_PIN" ]]; then
    warn "the checkout ($local_v) is not the pin ($S3D_PIN): whatever you are \
developing against is NOT what the packaged sidecar will contain. Publish a dev \
and move the pin (./em.sh s3d pin <version>) when the app depends on it."
  fi
  if [[ "$check" -eq 1 && "$S3D_RC" -ne 0 ]]; then
    s3d_refuse
  fi
  return 0
}

do_s3d_pin() {
  local version="${1:-}" rc
  [[ -n "$version" ]] || die "usage: ./em.sh s3d pin <version>   e.g. 1.6.0.dev15"
  rc=0
  s3dgraphy_published "$version" || rc=$?
  [[ "$rc" -eq 0 ]] || die "s3dgraphy==$version is not installable from PyPI \
(rc=$rc) — pinning it would produce a sidecar nobody else can build. Publish it \
first: cd ../s3Dgraphy && ./bump_and_push.sh"
  python3 - "$REQ" "$version" <<'PY'
import re, sys
path, version = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8").read()
new, n = re.subn(r'(?m)^(s3dgraphy(?:\[[^\]]*\])?==)([^\s#]+)',
                 lambda m: m.group(1) + version, text, count=1)
if n != 1:
    sys.exit("no s3dgraphy== line to move in tools/requirements.txt")
open(path, "w", encoding="utf-8").write(new)
print(f"  tools/requirements.txt -> s3dgraphy=={version}")
PY
  log "pin moved — the next sidecar freezes s3dgraphy==$version"
}

#: The gate itself, shared by `devrel`, `ghrelease` and — through
#: `s3d status --check` — by the CI workflow. Fails CLOSED.
s3d_gate() {
  local pin
  pin="$(pinned_s3dgraphy)"
  [[ -n "$pin" ]] || die "no exact s3dgraphy pin in tools/requirements.txt — the \
sidecar build has no version to freeze"
  log "gate: is s3dgraphy==$pin published?"
  s3d_probe
  [[ "$S3D_RC" -eq 0 ]] || s3d_refuse
  log "gate: s3dgraphy==$S3D_PIN is on PyPI — the sidecar is reproducible"
}

# ── the manual (EMStudio-doc), built as a check ──────────────────────────────
#
# The manual lives in its OWN repository ($DOC_URL — the owner comes from this
# checkout's remote, see `repo_url` at the top),
# and this touches it as little as a thing can be touched: it is checked out and
# BUILT, with the version passed as a Sphinx override (`-D version=… -D release=…`).
# So a release verifies that the documentation still compiles and that it carries
# the app's version — with no commit, no dispatch and no token in the doc repo.

do_doc() {
  local doc="${1:-$ROOT/../EMStudio-doc}"
  local version
  version="$(app_version)"
  [[ -d "$doc/docs" ]] || die "no manual at $doc (pass the path: ./em.sh doc \
/path/to/EMStudio-doc, or clone $DOC_URL)"
  local py="python3"
  [[ -x "$doc/.venv/bin/python" ]] && py="$doc/.venv/bin/python"
  log "build the manual as a check (-W) at version $version"
  "$py" -m sphinx -b html -W \
    -D "version=$version" -D "release=$version" \
    "$doc/docs" "$doc/docs/_build/check"
  log "manual OK — it compiles with no warnings, and says $version"
}

# ── a LOCAL desktop build (this machine only) ────────────────────────────────
#
# Called `pack`, not `dev`: in this repo `dev` already means the dev server, and
# renaming it to match EMtools' `dev` (a local build) would break the command
# everybody's muscle memory types twenty times a day. Same ergonomics, one
# deliberate difference in the word.

do_pack() {
  log "sidecar (PyInstaller) for this machine's target triple"
  (cd "$ROOT/apps/desktop" && ./build-bridge.sh)
  log "desktop bundle (cargo tauri build)"
  (cd "$ROOT/apps/desktop" && cargo tauri build)
}

# ── the release ──────────────────────────────────────────────────────────────

require_clean_tree() {
  [[ -z "$(git -C "$ROOT" status --porcelain)" ]] || die "the working tree is not \
clean. A release tags what is COMMITTED; anything else would produce a build that \
does not exist in any commit."
}

do_devrel() {
  local dry=0 assume_yes=0 if_changed=0
  for arg in "$@"; do
    case "$arg" in
      --dry-run) dry=1 ;;
      --yes | -y) assume_yes=1 ;;
      --if-changed) if_changed=1 ;;
      *) die "unknown option for devrel: $arg" ;;
    esac
  done

  local branch current next tag
  branch="$(git -C "$ROOT" branch --show-current)"
  current="$(app_version)"
  next="$(next_dev_version)"
  tag="v$next"

  echo "════════════════════════════════════════════"
  echo "  EMStudio dev release"
  echo "════════════════════════════════════════════"
  echo "  branch        $branch"
  echo "  version       $current → $next"
  echo "  tag           $tag"
  echo "  s3dgraphy pin $(pinned_s3dgraphy)"
  echo "  files touched frontend/package.json"
  echo "                apps/desktop/src-tauri/Cargo.toml"
  echo "                apps/desktop/src-tauri/tauri.conf.json (numeric core)"
  echo "  then          commit · tag $tag · push → GitHub Actions builds"
  echo "                macOS arm64 · macOS Intel · Windows · Linux"
  echo "════════════════════════════════════════════"

  # `--if-changed` is what the nightly uses: a night with no commits should not
  # produce a release that differs from the last one only by its number.
  if [[ "$if_changed" -eq 1 ]]; then
    local last
    last="$(git -C "$ROOT" describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"
    if [[ -n "$last" ]]; then
      local since
      since="$(git -C "$ROOT" rev-list --count "$last..HEAD")"
      if [[ "$since" -eq 0 ]]; then
        log "nothing to build: no commits since $last — skipping (not an error)"
        return 0
      fi
      log "$since commit(s) since $last"
    else
      log "no previous v* tag — this is the first release from this checkout"
    fi
  fi

  # THE GATE, before anything is written: refusing after the version was bumped
  # would leave the tree dirty for a reason that has nothing to do with the tree.
  s3d_gate

  if [[ "$dry" -eq 1 ]]; then
    log "dry run: nothing was written, nothing was tagged, nothing was pushed"
    node "$ROOT/scripts/set-version.mjs" --bump-dev --dry-run
    return 0
  fi

  require_clean_tree

  if [[ "$assume_yes" -eq 0 ]]; then
    printf 'Push %s and start the three builds? (y/N): ' "$tag"
    read -r reply
    [[ "$reply" =~ ^[Yy]$ ]] || { log "cancelled"; return 0; }
  fi

  do_inc
  git -C "$ROOT" add frontend/package.json \
      apps/desktop/src-tauri/Cargo.toml \
      apps/desktop/src-tauri/tauri.conf.json
  git -C "$ROOT" commit -m "build: dev release $next"
  git -C "$ROOT" tag "$tag"
  git -C "$ROOT" push origin "$branch"
  git -C "$ROOT" push origin "$tag"

  echo
  log "pushed $tag — the installers are being built"
  echo "   $REPO_URL/actions"
  echo "   $REPO_URL/releases/tag/$tag"
}

do_ghrelease() {
  local version="${1:-}"
  [[ -n "$version" ]] || die "usage: ./em.sh ghrelease <x.y.z>   (an exact, \
stable version — a dev release is ./em.sh devrel)"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "'$version' is not a stable \
x.y.z — a dev build is what ./em.sh devrel is for"
  require_clean_tree
  s3d_gate
  log "set the app version to $version"
  node "$ROOT/scripts/set-version.mjs" "$version"
  local branch
  branch="$(git -C "$ROOT" branch --show-current)"
  git -C "$ROOT" add frontend/package.json \
      apps/desktop/src-tauri/Cargo.toml \
      apps/desktop/src-tauri/tauri.conf.json
  git -C "$ROOT" commit -m "release: $version"
  git -C "$ROOT" tag "v$version"
  git -C "$ROOT" push origin "$branch"
  git -C "$ROOT" push origin "v$version"
  log "pushed v$version — $REPO_URL/releases/tag/v$version"
}

# ── dispatch ─────────────────────────────────────────────────────────────────

cmd="${1:-help}"
shift || true
case "$cmd" in
  sync) do_sync "$@" ;;
  wasm) do_wasm ;;
  build) do_build ;;
  dev) "$ROOT/dev.sh" "$@" ;;
  all)
    do_sync "$@" || warn "sync skipped (no s3Dgraphy source found) — using the vendored copies"
    do_wasm || warn "WASM skipped (needs Rust/cargo) — reusing the vendored .wasm"
    do_build
    ;;
  version) node "$ROOT/scripts/set-version.mjs" --print ;;
  inc) do_inc "$@" ;;
  s3d)
    sub="${1:-status}"
    shift || true
    case "$sub" in
      status) do_s3d_status "$@" ;;
      pin) do_s3d_pin "$@" ;;
      *) die "s3d: expected 'status' or 'pin <version>', got '$sub'" ;;
    esac
    ;;
  doc) do_doc "$@" ;;
  pack) do_pack ;;
  devrel) do_devrel "$@" ;;
  ghrelease) do_ghrelease "$@" ;;
  help | -h | --help) usage ;;
  *)
    warn "unknown command: $cmd"
    usage
    exit 1
    ;;
esac
