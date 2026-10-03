#!/usr/bin/env bash
# Install the pinned s3dgraphy into a venv, waiting for the index to catch up.
#
# Why this exists: dev.19 failed ONLY on macOS arm64, one minute after the
# release was published — "No matching distribution found for
# s3dgraphy==1.6.0.dev33" — while Linux and Windows, same minute, installed it.
# The gate had already proved the pin published (`./em.sh s3d status --check`
# on ubuntu); that runner's view of the index simply was not there yet. So a
# missing pin here is first a "not yet" and only after the retries a "no".
#
# Usage: pip-install-pinned.sh <python> <pin> [extra packages…]
# Env:   PIN_ATTEMPTS (default 10) · PIN_DELAY seconds (default 30)
set -euo pipefail
VPY="$1"; PIN="$2"; shift 2
ATTEMPTS="${PIN_ATTEMPTS:-10}"
DELAY="${PIN_DELAY:-30}"

n=1
while :; do
  log="$(mktemp)"
  if "$VPY" -m pip install --no-cache-dir "s3dgraphy[geo,rdf]==$PIN" "$@" >"$log" 2>&1; then
    cat "$log"; rm -f "$log"
    echo "pin s3dgraphy==$PIN installed at attempt $n/$ATTEMPTS"
    exit 0
  fi
  if ! grep -qE "No matching distribution found for s3dgraphy|Could not find a version that satisfies the requirement s3dgraphy" "$log"; then
    # Not the index lagging: a real failure, and retrying would hide it.
    cat "$log"; rm -f "$log"
    echo "::error::pip failed for a reason other than the pin not being visible yet"
    exit 1
  fi
  rm -f "$log"
  if [ "$n" -ge "$ATTEMPTS" ]; then
    echo "::error::s3dgraphy==$PIN still not on this runner's index after $ATTEMPTS attempts ($DELAY s apart)"
    exit 1
  fi
  echo "attempt $n/$ATTEMPTS: s3dgraphy==$PIN not visible on this runner's index yet — waiting ${DELAY}s"
  n=$((n + 1))
  sleep "$DELAY"
done
