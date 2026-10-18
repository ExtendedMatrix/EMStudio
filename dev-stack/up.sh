#!/usr/bin/env bash
# One-command local stack for the EM Resource layer.
#
#   ./up.sh ensure       # install/verify the engine (Homebrew, docker, compose, Colima) + start it
#   ./up.sh dev          # just RustFS/S3 (+ bucket with versioning) — dev & local real-work
#   ./up.sh dev auth     # RustFS + Keycloak + Postgres (compose profile `auth`)
#   ./up.sh full         # the COMPLETE WP6 stack (delegates to Heriverse-Docker)
#   ./up.sh down [full]  # stop the dev stack (or `down full` for the WP6 stack)
#
# macOS uses Colima (a Lima VM) as the Docker engine — no Docker Desktop needed;
# the docker CLI + Compose target it exactly the same. The remote deploy is the
# same stack via heriverse-ansible (StratiGraph/WP6). FS mode needs NOTHING here.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_COMPOSE="$HERE/docker-compose.dev.yml"
FULL_COMPOSE="$HERE/../../Heriverse-Docker/docker-compose.yml"
ENV_FILE="$HERE/.env"

# Load .env (if present) for the endpoint echo; docker compose reads it too.
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
S3_PORT="${S3_PORT:-9000}"
S3_CONSOLE_PORT="${S3_CONSOLE_PORT:-9001}"
S3_BUCKET="${S3_BUCKET:-heriverse}"
S3_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-admin}"
KEYCLOAK_PORT="${KEYCLOAK_PORT:-8080}"

usage() { sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

have() { command -v "$1" >/dev/null 2>&1; }

# Pick the Compose command lazily (only when we actually run compose), so
# `ensure` still works on a machine that hasn't installed it yet. Prefers the
# v2 plugin (`docker compose`); falls back to the legacy `docker-compose`.
compose() {
  if docker compose version >/dev/null 2>&1; then docker compose "$@";
  elif have docker-compose; then docker-compose "$@";
  else echo "error: Docker Compose missing — run: ./up.sh ensure" >&2; exit 1; fi
}

# `ensure`: install every component via Homebrew and start the Colima engine.
ensure_all() {
  if ! have brew; then
    echo "Homebrew not found. Install it first, then re-run ./up.sh ensure:"
    echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
  fi
  # idempotent: brew skips already-installed formulae. `docker-compose` also
  # wires up the `docker compose` plugin subcommand.
  for pkg in docker docker-compose colima; do
    if brew list "$pkg" >/dev/null 2>&1; then echo "✓ $pkg already installed";
    else echo "installing $pkg …"; brew install "$pkg"; fi
  done
  if ! docker info >/dev/null 2>&1; then
    echo "starting Colima (Docker engine) …"; colima start
  fi
  if docker info >/dev/null 2>&1; then echo "✓ Docker engine reachable (Colima)";
  else echo "✗ engine still unreachable — try: colima start"; exit 1; fi
}

# Light preflight before a compose run: engine must be reachable; auto-start
# Colima if it's installed but the daemon is down.
preflight() {
  if docker info >/dev/null 2>&1; then return 0; fi
  if have colima; then echo "Docker engine down — starting Colima…"; colima start; fi
  docker info >/dev/null 2>&1 || { echo "Docker engine not reachable. Run: ./up.sh ensure" >&2; exit 1; }
}

cmd="${1:-}"; shift || true
case "$cmd" in
  ensure)
    ensure_all
    ;;
  dev)
    preflight
    [ -f "$ENV_FILE" ] || echo "note: no .env — using dev defaults (copy .env.example → .env to customise)"
    profile_args=()
    if [ "${1:-}" = "auth" ]; then profile_args=(--profile auth); fi
    compose -f "$DEV_COMPOSE" "${profile_args[@]}" up -d
    echo ""
    echo "  RustFS S3 API  → http://localhost:${S3_PORT}"
    echo "  RustFS console → http://localhost:${S3_CONSOLE_PORT}/rustfs/console/   (user: ${S3_ACCESS_KEY_ID})"
    echo "  shared bucket  → ${S3_BUCKET}   (versioning ON)"
    if [ "${1:-}" = "auth" ]; then
      echo "  Keycloak       → http://localhost:${KEYCLOAK_PORT}/   (dev mode)"
    fi
    echo ""
    echo "  point em-bridge / EMStudio at it:  set -a; . \"$ENV_FILE\"; set +a"
    echo "  (S3_ENDPOINT=http://localhost:${S3_PORT}) — bucket init runs in the 'rustfs-init' service"
    ;;
  full)
    preflight
    [ -f "$FULL_COMPOSE" ] || { echo "error: Heriverse-Docker compose not found at $FULL_COMPOSE"; exit 1; }
    echo "delegating to the full WP6 stack: $FULL_COMPOSE"
    compose -f "$FULL_COMPOSE" up -d
    echo "full stack up — see Heriverse-Docker/.env for ports."
    ;;
  down)
    if [ "${1:-}" = "full" ]; then
      compose -f "$FULL_COMPOSE" down
    else
      compose -f "$DEV_COMPOSE" --profile auth down
    fi
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "unknown command: $cmd"; echo; usage; exit 1
    ;;
esac
