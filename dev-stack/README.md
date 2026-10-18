# EM dev-stack — local object storage for the Resource layer

The Extended Matrix Resource layer has two storage tiers behind one **stable-ID**
space (a resource keeps the same id whether it lives on the file system or in
the S3 object store). This folder gives you the S3 tier locally — served by
**RustFS** (Apache-2.0, S3-compatible), the same pinned image as
stratigraph-server's dev-stack — in **one command**, reusing
Heriverse's S3 conventions and the shared `heriverse` bucket — for dev **and** for
local real-work without a remote server.

## Three run modes

| Mode | What you run | When |
|------|--------------|------|
| **FS** (zero infra) | nothing — em-bridge + local files already work | quick dev, offline, no storage server |
| **S3 local (RustFS)** | `./up.sh dev` (+ copy `.env`) | dev + local real-work with object storage (Upload to the object store) |
| **Full stack** | `./up.sh full` | the complete WP6 stack locally (S3 store + Keycloak + CouchDB + Heriverse + server + Caddy) — delegates to `Heriverse-Docker/` |
| **Remote** | (not here) | the same stack via `heriverse-ansible`, deployed by StratiGraph / WP6 |

Nothing in here modifies Heriverse-Docker's production compose — `up.sh full`
simply delegates to it. The dev profile uses public images only (no registry auth).

## Engine: Colima (macOS) — no Docker Desktop

On macOS the Docker engine is **Colima** (a lightweight Lima VM); the `docker`
CLI and Compose target it exactly like Docker Desktop, and these compose files are
engine-agnostic. `./up.sh ensure` installs and starts everything for you:

```bash
cd EMStudio/dev-stack
./up.sh ensure               # via Homebrew: docker + docker-compose + colima, then `colima start`
```

`ensure` is idempotent (skips already-installed formulae) and `up.sh dev|full`
run a light preflight that auto-starts Colima if the engine is down. If Homebrew
itself is missing, `ensure` prints the one-line install command and stops.

## Quick start (S3 local, RustFS)

```bash
cd EMStudio/dev-stack
./up.sh ensure               # first time only (installs/starts the Colima engine)
cp .env.example .env         # edit if you like (dev defaults are fine)
./up.sh dev                  # brings up RustFS; the bucket is created + versioned
```

Endpoints (defaults):

- **S3 API** → `http://localhost:9000`
- **Console** → `http://localhost:9001/rustfs/console/` (user `admin`, from `.env`)
- **bucket** → `heriverse` (versioning **on** — updates are non-destructive; the
  resource keeps its stable ID, the store keeps the object history; enabled
  best-effort by `rustfs-init`, which says so if the server refuses)

Add Keycloak + Postgres (optional, dev mode):

```bash
./up.sh dev auth             # compose profile `auth` → Keycloak on :8080
./up.sh down                 # stop everything (incl. the auth profile)
```

## Point em-bridge / EMStudio at it

The `S3_*` variable names match `s3dgraphy`'s `S3Config.from_env()` and
Heriverse-Server, so all tools share one keyspace. Load the env into the shell
that runs em-bridge, then start the bridge with the `s3` extra:

```bash
set -a; . EMStudio/dev-stack/.env; set +a       # exports S3_ENDPOINT=http://localhost:9000, …
# em-bridge needs the optional S3 SDK (boto3):
#   (cd s3Dgraphy && .venv/bin/pip install -e '.[s3]')
python3 EMStudio/tools/em_bridge.py --port 8765 --s3dgraphy ../s3Dgraphy/src
```

In EMStudio: **Resources** panel → a local resource → **Upload to the object store**. The
bytes upload into the shared bucket under `heriverse/<stable-id>/…`, the resource's
LinkNode locator is repointed at the `s3://…` URI, and its stable ID and graph
references are unchanged. `/presign` then yields a fetchable URL.

> **Endpoint note.** `S3_ENDPOINT` in `.env` is **host-facing**
> (`http://localhost:9000`) because em-bridge runs on your host. Services running
> *inside* the compose network use `http://rustfs:9000` (handled in the compose
> file). The full/remote stack sets its own in-network `S3_ENDPOINT` for its
> in-network server — same bucket, same conventions.

## This enables the pending real-S3 verifies

Earlier sessions wired `/ingest-s3` + `/presign` and the Promote button but
could only be checked with a mocked client / graceful `501` (no live server).
With `./up.sh dev` running and the env loaded, those become real end-to-end
checks: Promote → `200` → locator becomes `s3://…`; presign → a working URL.
