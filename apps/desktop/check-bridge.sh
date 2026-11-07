#!/usr/bin/env bash
# Ask a FROZEN em-bridge the geo routes the app cannot do without, as the app
# asks them (HTTP, an Origin), and fail when one does not answer «ok».
#
# MICRO-ANTEPRIMA-AGGANCIATA (7 Nov 2026) · the sidecar of dev.111 answered 501
# «a dependency is missing in this bridge (numpy)» to every /geo/tileset-frame:
# PyInstaller excluded numpy and the fit imported it lazily, so a build that
# succeeded shipped an app that placed no tileset in true ECEF. A lazy import is
# found missing only by CALLING it — which is what this does, on the binary.
#
#   ./check-bridge.sh                                   # src-tauri/binaries/em-bridge-<triple>
#   ./check-bridge.sh /Applications/EMStudio.app/Contents/MacOS/em-bridge
#
# Called by build-bridge.sh (so by `./em.sh pack` and by release.yml) and by
# `./em.sh bridge-check [binary]`. It starts the binary on a free port of its
# own, never on 8765, and stops it afterwards.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${1:-}"
if [[ -z "$BIN" ]]; then
  TRIPLE="$(rustc -vV | sed -n 's/host: //p')"
  case "$TRIPLE" in *windows*) EXE=".exe" ;; *) EXE="" ;; esac
  BIN="$HERE/src-tauri/binaries/em-bridge-$TRIPLE$EXE"
fi
[[ -x "$BIN" ]] || { echo "✗ no bridge binary at $BIN"; exit 1; }

# a free port: any Python will do (the build's, else the machine's)
PY=""
for c in "${PYTHON:-}" python3 python; do
  [[ -n "$c" ]] && command -v "$c" >/dev/null 2>&1 && { PY="$c"; break; }
done
[[ -n "$PY" ]] || { echo "✗ no python to pick a free port with"; exit 1; }
PORT="$("$PY" -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
ROOT="$(mktemp -d)"
LOG="$ROOT/bridge.log"
"$BIN" --port "$PORT" --fs-root "$ROOT" >"$LOG" 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

B="http://127.0.0.1:$PORT"
O="Origin: http://localhost:5173"
for _ in $(seq 1 120); do
  curl -s -m 2 "$B/health" >/dev/null 2>&1 && break
  kill -0 "$PID" 2>/dev/null || { echo "✗ the bridge exited at start:"; tail -20 "$LOG"; exit 1; }
  sleep 0.5
done
curl -s -m 2 "$B/health" >/dev/null || { echo "✗ the bridge does not answer on :$PORT"; tail -20 "$LOG"; exit 1; }

FAILED=0
# ask METHOD ROUTE BODY|- WHAT: the answer must be HTTP 200 with "ok": true
ask() {
  local method="$1" route="$2" body="$3" what="$4" out code
  if [[ "$method" == POST ]]; then
    out="$(curl -s -m 90 -X POST -H "$O" -H 'Content-Type: application/json' --data "$body" "$B$route" -w '\n%{http_code}')" || true
  else
    out="$(curl -s -m 90 -H "$O" "$B$route" -w '\n%{http_code}')" || true
  fi
  code="${out##*$'\n'}"
  out="${out%$'\n'*}"
  if [[ "$code" == 200 && "$out" == *'"ok": true'* ]]; then
    echo "  ✓ $what"
  else
    echo "  ✗ $what — HTTP $code ${out:0:300}"
    FAILED=1
  fi
}

# A root in TRUE ECEF (an ENU frame at 45.516 N, 22.788 E, h 521.6 m, as
# Metashape's Cesium export writes it) into a study in Stereo70 minus its shift
ECEF='{"transform":[-0.387319,0.921946,0,0,-0.657758,-0.276331,0.70071,0,0.646017,0.271398,0.713446,0,4127760.914,1734113.553,4528084.887,1],"bounding_volume":{"box":[0,0,5,30,0,0,0,30,0,0,0,5]},"frame":{"crs":"EPSG:4978"},"target":{"crs":"EPSG:3844","shift":[327372.56,448682.65,0]}}'
# A file of shifted coordinates declared in a CRS (the frame's case: relocate_transform)
SHIFTED='{"transform":[1,0,0,0,0,1,0,0,0,0,1,0,6378137,0,0,1],"bounding_volume":{"box":[0,0,0,20,0,0,0,20,0,0,0,5]},"frame":{"crs":"EPSG:32633","shift":[400000,4600000,0]}}'

echo "Frozen bridge: $BIN (:$PORT)"
ask POST /geo/tileset-frame "$ECEF"    "/geo/tileset-frame · a true ECEF root into the study's CRS (em_gis)"
ask POST /geo/tileset-frame "$SHIFTED" "/geo/tileset-frame · shifted coordinates in a CRS (relocate_transform)"
ask POST /reproject '{"epsg_source":3844,"x":327377.59,"y":448655.25}' "/reproject · Stereo70 → WGS 84 (pyproj)"
ask GET  "/geo/crs-info?epsg=3844" - "/geo/crs-info (em_geotiles + PROJ's database)"
ask POST /geo/frame '{"epsg":3844,"x":327372.56,"y":448682.65}' "/geo/frame · the site's frame (em_geotiles)"
ask GET  /tiles/globe-min - "/tiles/globe-min (em_geotiles)"

if [[ "$FAILED" != 0 ]]; then
  echo "✗ the frozen bridge cannot do what the app asks of it (see above): an app that places no tileset is not released"
  exit 1
fi
echo "✓ the frozen bridge answers the geo routes"
