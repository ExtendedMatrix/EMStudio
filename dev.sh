#!/usr/bin/env bash
# EMStudio dev launcher (macOS / Linux).
#
# Starts, together, the iterative dev stack:
#   1. the Python GraphML bridge (tools/em_bridge.py) — backs the in-app
#      "GraphML" export button; runs s3Dgraphy in-process.
#   2. the Vite frontend dev server (npm run dev) — live reload, no Tauri
#      rebuild needed.
#
# Both stop together on Ctrl-C. No desktop-app compile in the loop: edit
# frontend/src or the s3Dgraphy exporter, save, and just reload the browser
# (frontend HMR is instant; the bridge re-imports s3Dgraphy per request, so a
# Python edit only needs a bridge restart — Ctrl-C and re-run this script).
#
# Usage:
#   ./dev.sh                 # bridge :8765 + frontend :5173
#   ./dev.sh --port 8888     # override bridge port
#   S3DGRAPHY=/path/src ./dev.sh   # override s3Dgraphy src location
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_PORT="8765"
if [[ "${1:-}" == "--port" && -n "${2:-}" ]]; then BRIDGE_PORT="$2"; fi

# --- locate s3Dgraphy checkout + a Python that can import it ---------------
S3DGRAPHY_SRC="${S3DGRAPHY:-$ROOT/../s3Dgraphy/src}"
VENV_PY="$ROOT/../s3Dgraphy/.venv/bin/python"
if [[ -x "$VENV_PY" ]]; then
  PY="$VENV_PY"
else
  PY="$(command -v python3 || command -v python)"
  echo "⚠️  s3Dgraphy .venv not found at $VENV_PY — using $PY."
  echo "    If GraphML export fails on import, create the venv:"
  echo "    (cd $ROOT/../s3Dgraphy && python3 -m venv .venv && .venv/bin/pip install -e '.[sync]' pandas lxml)"
fi

if [[ ! -d "$S3DGRAPHY_SRC" ]]; then
  echo "⚠️  s3Dgraphy src not found at $S3DGRAPHY_SRC — set S3DGRAPHY=/path/to/s3Dgraphy/src"
fi

# --- frontend deps ---------------------------------------------------------
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "📦  Installing frontend deps (first run)…"
  (cd "$ROOT/frontend" && npm install)
fi

# --- launch, with a single trap that stops both children ------------------
#
# JOB CONTROL ON, and it is a bug fix rather than a flourish. `pids` used to
# collect the pid of `(cd frontend && npm run dev) &` — the SUBSHELL — while the
# process actually holding :5173 is the `node` that `npm` spawns two levels down.
# So Ctrl-C killed the bridge (whose pid was the real one) and Vite survived,
# kept the port, and the next `./dev.sh` slid onto 5174 — where Caddy's
# `/em/studio/` route, which points at 5173, finds nothing. Measured on E.D.'s
# machine as TWO Vite processes from this checkout, one of them orphaned.
#
# `set -m` gives every background job a process group of its own, so
# `kill -- -PID` reaches the whole tree instead of the shell that started it.
set -m

pids=()
cleanup() {
  echo ""
  echo "🛑  Stopping EMStudio dev stack…"
  for pid in "${pids[@]}"; do
    # the GROUP first (npm → node → vite), then the pid alone as a fallback for
    # a job that is not a group leader
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  done
  # …and then say whether it worked, because a stop that half-worked is what
  # started this: the next launch behaves differently and nothing said why.
  sleep 0.4
  for port in "$BRIDGE_PORT" 5173; do
    if [[ -n "$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)" ]]; then
      echo "⚠️  :$port is still held — run ./dev.sh again and it will say by whom."
    fi
  done
}
trap cleanup EXIT INT TERM

# --- free a stale listener — BY IDENTITY, never by port alone --------------
#
# A previous run killed with SIGKILL, or a job whose group was not stopped, can
# outlive its shell and keep a port. The bridge then dies on EADDRINUSE and the
# app just says "transformer not reachable"; Vite slides to 5174 and the node's
# `/em/studio/` route finds nothing. So both ports are cleared here.
#
# AND THIS IS WHERE THE 4 SEPTEMBER LESSON LIVES. `lsof -ti:5173 | xargs kill -9`
# killed the **Colima port forwarder** that afternoon, and with it the VM and
# every container on this machine — because on a port there may be a FORWARD
# rather than the process you are picturing. So: look at `ps -o args=` first, kill
# only what is recognisably ours (this checkout's path in the command line), and
# whatever is not recognised is NAMED and left alive. A name is more use than a
# shot.
#
# `PROTECTED` is belt and braces: those never get killed even if a path match
# somehow said otherwise.
PROTECTED='ssh|limactl|colima|qemu|docker|com\.docker|vpnkit|lima-guestagent'

#: the pids of THIS checkout's dev processes, recognised by their command line
ours() {
  ps -Ao pid=,args= | awk -v root="$ROOT" '
    $0 ~ /em_bridge\.py/ && index($0, root) { print $1; next }
    $0 ~ /(vite|npm.* run dev|node .*vite)/ && index($0, root) { print $1 }
  '
}

free_port() {
  local port="$1"
  command -v lsof >/dev/null 2>&1 || return 0
  local holders mine
  holders="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -z "$holders" ]] && return 0
  mine=" $(ours | tr '\n' ' ') "
  local pid args stopped=""
  for pid in $holders; do
    args="$(ps -o args= -p "$pid" 2>/dev/null | cut -c1-90)"
    if [[ "$args" =~ $PROTECTED ]]; then
      echo "🛡   :$port is held by pid $pid, which I will NOT touch — it looks like"
      echo "     a port forward or a VM: $args"
      continue
    fi
    if [[ " $mine " != *" $pid "* ]]; then
      echo "🛡   :$port is held by pid $pid, which is not from this checkout:"
      echo "     $args"
      echo "     Left running. Stop it yourself if it really should go: kill $pid"
      continue
    fi
    echo "⚠️  freeing our own stale listener on :$port (pid $pid)"
    kill "$pid" 2>/dev/null || true
    stopped="$stopped $pid"
  done
  [[ -z "$stopped" ]] && return 0
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.2
    [[ -z "$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)" ]] && return 0
  done
  # insist ONCE, and still only on what we recognised as ours
  kill -9 $stopped 2>/dev/null || true
  sleep 0.3
}
free_port "$BRIDGE_PORT"
free_port 5173

# MICRO-PL15 · the secret of the bridge's Python routes (/py/*): one per run,
# to the bridge in its environment and to the page through Vite
# (VITE_EM_BRIDGE_TOKEN, read by src/py-session.ts). Kept when already set, so
# a desktop debug build can share it. Without it /py/* stay closed.
export EM_BRIDGE_TOKEN="${EM_BRIDGE_TOKEN:-$("$PY" -c 'import secrets; print(secrets.token_hex(32))')}"
export VITE_EM_BRIDGE_TOKEN="$EM_BRIDGE_TOKEN"

echo "🐍  Bridge:   http://localhost:$BRIDGE_PORT  (GraphML export)"
"$PY" "$ROOT/tools/em_bridge.py" --port "$BRIDGE_PORT" --s3dgraphy "$S3DGRAPHY_SRC" &
pids+=("$!")

echo "⚡  Frontend: http://localhost:5173/em/studio/  (Vite dev, live reload)"
# `npm --prefix` rather than a subshell: one layer fewer between this shell and
# the node that holds the port, and with `set -m` the group kill in `cleanup`
# reaches it. The base is `/em/studio/` (frontend/vite.config.ts) because the
# editor is reached through the node's own origin — `/` redirects there.
npm --prefix "$ROOT/frontend" run dev &
pids+=("$!")

echo ""
echo "✅  EMStudio dev stack up. Open http://localhost:5173/em/studio/ (or, through"
echo "    the node, https://em.localhost:8443/em/studio/), load an .em.json,"
echo "    click GraphML to export via the bridge. Ctrl-C to stop both."
wait
