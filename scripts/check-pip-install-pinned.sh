#!/usr/bin/env bash
# T-W1 · the sidecar step retries while the runner's index has not seen the pin
# yet, and stops at once on any other pip failure. A fake "python" stands in for
# the venv: it fails with pip's own words for the first N calls.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cat >"$T/fakepy" <<'PY'
#!/usr/bin/env bash
c="$(cat "$FAKE_DIR/count" 2>/dev/null || echo 0)"; c=$((c+1)); echo "$c" >"$FAKE_DIR/count"
if [ "$c" -le "$FAKE_FAIL" ]; then
  if [ "$FAKE_KIND" = lag ]; then
    echo "ERROR: Could not find a version that satisfies the requirement s3dgraphy[geo,rdf]==9.9.9 (from versions: 1.6.0.dev32)" >&2
    echo "ERROR: No matching distribution found for s3dgraphy[geo,rdf]==9.9.9" >&2
  else
    echo "ERROR: Could not install packages due to an OSError: disk full" >&2
  fi
  exit 1
fi
echo "Successfully installed s3dgraphy-9.9.9"
PY
chmod +x "$T/fakepy"
fail=0
run() { # name kind fails attempts expect_rc expect_calls
  rm -f "$T/count"
  out="$(FAKE_DIR="$T" FAKE_KIND="$2" FAKE_FAIL="$3" PIN_ATTEMPTS="$4" PIN_DELAY=0 \
        "$HERE/pip-install-pinned.sh" "$T/fakepy" 9.9.9 pyinstaller 2>&1)"; rc=$?
  calls="$(cat "$T/count")"
  if [ "$rc" = "$5" ] && [ "$calls" = "$6" ]; then echo "✓ $1 (rc=$rc, attempts=$calls)"
  else echo "✗ $1: rc=$rc want $5, attempts=$calls want $6"; echo "$out"; fail=1; fi
  echo "$out" | grep -E "^attempt|installed at|::error::" | sed 's/^/    /'
}
run "index lags 3 times, then the pin is there"  lag 3 10 0 4
run "index never catches up: no after 10"        lag 99 10 1 10
run "a real pip failure is not retried"          other 1 10 1 1
run "published at once: one attempt"             lag 0 10 0 1
exit $fail
