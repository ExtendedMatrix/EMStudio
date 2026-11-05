# EMStudio

**The sovereign graph editor for the Extended Matrix** — two views on the same
data: the EM swimlane matrix (epochs as lanes, time flowing upward) and the full
knowledge graph with every relation visible. Web service and desktop app from
a single codebase.

> Status: **editing GUI** (August 2026) — core + CLI + layout engine v1 + web
> frontend with native editing, `.em.json` **multigraph container**, project
> **shelf**, proxy-as-property + 2D annotator, **ORCID** identity + editorial
> stamps, **live-sync** with EM-blender-tools (sidecar), and async **merge +
> light versioning**. Real-time multi-user hub (CRDT) and the EMStudio→Blender
> command channel are on the roadmap (phases below).
> See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Why

The Extended Matrix ecosystem authors stratigraphic knowledge graphs today
through yEd + GraphML, with s3Dgraphy as the semantic engine behind it. That
pipeline works but caps the model: yEd cannot learn new node types (USM/USR
live only in label conventions), GraphML accumulates "belly data" it can
neither display nor edit, and the round-trip is structurally lossy.
EMStudio inverts the roles: **`.em.json` becomes the native format**
(property graph + layout section), GraphML becomes a legacy one-way import,
and the editor understands the EM node system natively — palette, sockets and
validation driven by the same versioned JSON datamodels that drive s3Dgraphy.

## What EMStudio does today

- **Native editing of the EM node system** — palette, sockets and validation
  driven by the same versioned JSON datamodels that drive s3Dgraphy; not a
  read-only viewer.
- **`.em.json` as a multigraph container.** A project file is a *container of
  graphs* (`graphs: {…}`) plus a project **shelf** — the same container shape
  Heriverse reads. A single-graph file is just a container-of-one; GraphML
  import lands as a new graph slot.
- **Project shelf.** A savable graph of resources (files, LOD, web sources)
  with provenance and sha256, spanning the study's own material, its Heritage
  Digital Twin, and comparanda from other HDTs.
- **Proxy-as-property + 2D annotator.** Geometry is a `PropertyNode`
  (`geometry`) carrying a semantic shape; a 2D annotator marks normalized
  regions on documents and promotes resources to documents on annotate.
- **ORCID identity + editorial stamps.** Claim-now / verify-later authorship;
  every node carries `created/modified by+at`, distinct from interpretive
  authorship and from historical epochs.
- **Live-sync with Blender (sidecar).** Selection/focus sync with
  EM-blender-tools over WebSocket (ADR-002), under an explicit 4-state Sync
  control — nobody's scene changes without consent.
- **Async merge + light versioning.** Two `.em.json` merge by UUID with a
  dated, deterministic single arbiter; light PROV/DCTERMS versioning (no DTC
  for ordinary edits).

## Core design decisions

1. **One Rust core, three deliveries.** `em-core` (graph model, `.em.json`
   I/O, connection validation, layout engine) is delivered as: browser app
   against an `axum` server, desktop app via **Tauri** (core in-process,
   local files, embedded **Oxigraph** for local SPARQL), and CLI.
2. **Layout is a first-class engine, not manual placement.** Like yEd's
   hierarchic swimlane layout — but specialised: in EM the layer assignment
   is *semantic* (the epoch lane is given by `has_first_epoch` /
   `survive_in_epoch`), so the engine solves a constrained Sugiyama problem:
   fixed lanes, crossing minimisation, group-contiguity constraints,
   orthogonal routing, plus a "from sketch" incremental mode that respects
   manual adjustments. See ARCHITECTURE §4.
3. **Hypergraph folding.** Any group (paradata group, activity, series)
   collapses into a single proxy node; double-click enters an isolated
   canvas showing only its members; breadcrumb/back returns to the full
   graph. Folded state and per-context positions are part of the `.em.json`
   layout section. See ARCHITECTURE §5.
4. **Sovereignty by format.** `.em.json` v1 (FROZEN 11 July 2026) = header
   with format/datamodel/ontology versions + flat graph (nodes[]/edges[]) +
   optional reconstructable `layout`. Spec: [`docs/emjson-v1-draft.md`](docs/emjson-v1-draft.md);
   reference implementation in s3Dgraphy (`emjson_exporter` / `emjson_importer`).

## For the person using it

*If you are here to work on a study rather than on the code, this section is the
whole of it.*

**Open something.** Drop an `.em.json` file on the window, or **File ▸ Apri…**.
Nothing to configure first: the empty canvas says so and offers the two ways in.
**File ▸ Nuovo** starts an empty study; **File ▸ Importa GraphML…** brings in an
old yEd matrix as a new graph in the project.

**The two views are one datum.** The chips in the top bar switch how you look at
the same graph, never *what* you are looking at:

* **Modifica grafo** — the canvas. `Matrix Mode` lays it out as the EM swimlane
  (epochs as lanes, time flowing upward); the other mode shows the full knowledge
  graph with every relation visible. `Layout` re-arranges; `1:1` returns to
  actual size;
* **Narrativa** — the study told as text, with its sources;
* **Tabella** — the same nodes as rows, for when a table is the faster way to
  fix twenty of them.

**Save.** **File ▸ Salva** / **Salva come…** writes an `.em.json` container —
one file holding the whole project, its graphs and its shelf. **Fissa
versione…** freezes a citable snapshot; **Pubblica su StratiGraph…** registers
the study in a catalogue.

**Working with Blender, or with other people.** The badge at the bottom-left says
which mode you are in: **Standalone** (just this window), **Sidecar** (connected
to a running Blender with EM-blender-tools — edits travel both ways) or **Hub**
(a room on an StratiGraph Server, where several people edit at once). You do not choose
the badge; it reflects what is actually connected.

**Two things worth knowing early.** A deletion is *kept* in the file as a mark,
not erased — that is what lets two copies of a study merge later without one of
them quietly resurrecting what the other deleted. And your identity (an ORCID)
is claimed offline and verified later: what you publish is signed rather than
merely dated.

**Where this sits in the wider system:**
[`ARCHITECTURE-SYSTEM.md`](../stratigraph-server/docs/ARCHITECTURE-SYSTEM.md).

## Quickstart — how to run EMStudio

**A. Standalone desktop app (Tauri).** Native window, no browser, with
native **Open / Save / Save As…** dialogs (⌘S save in place, ⇧⌘S save as)
and the open file + dirty state shown in the window title:

```bash
cargo install tauri-cli --locked   # first time only
cd frontend && npm install         # first time only
cd ../apps/desktop
cargo tauri dev                    # run (dev, live reload)
./build-bridge.sh                  # the Python sidecar, before packaging
cargo tauri build                  # → .app / .dmg bundle to install
```

The distributable app carries a frozen Python **sidecar** (`em-bridge`) that
answers GraphML export, resource previews and coordinate reprojection. It is
per-platform and per-architecture (PyInstaller does not cross-compile), and the
reprojection needs pyproj's PROJ data inside the bundle — so building for
macOS/Windows/Linux has a few real prerequisites and one verification step worth
running. All of it: **[`docs/DEVELOPMENT.md` § Packaging the desktop
app](docs/DEVELOPMENT.md#packaging-the-desktop-app-macos--windows--linux)**.

**B. Zero-install browser file.** One self-contained HTML, works offline:

```bash
cd frontend
npm install        # first time only
npm run build      # → frontend/dist/index.html — double-click it
```

**C. Server + client (local network).** Serve the built app at a local
address and open it from any browser (yours or a colleague's on the LAN):

```bash
cd frontend
npm run build
npm run serve      # → http://<your-ip>:4173  (Vite preview, --host)
npm run dev        # dev alternative: http://localhost:5173, live reload
```

Documents already merge asynchronously (offline-then-integrate) via the
dated single arbiter; real-time multi-user co-editing over the `StratiGraph Server`
(axum, CRDT relay + presence) is the next roadmap phase and will serve the
same frontend. The CRDT foundation (op-model, tombstones, per-field LWW)
is what unifies the async merge and the future live hub.

**D. Iterative dev stack (`./dev.sh`, macOS/Linux).** One command starts
the Vite frontend (live reload, no Tauri rebuild) *and* the local Python
GraphML bridge that backs the in-app **GraphML** export button:

```bash
./dev.sh                 # frontend :5173 + bridge :8765
./dev.sh --port 8888     # override the bridge port
```

The frontend cannot run s3Dgraphy (ADR-001 invariant 2: batch interop
stays in Python), so the GraphML button POSTs the current `.em.json` to
`tools/em_bridge.py`, which runs the s3Dgraphy exporter in-process and
returns a yEd-openable `.graphml` for download (US/USD/VSF containers,
ActivityNodeGroups, continuity BR diamonds, epoch swimlanes). Edit the
frontend and just reload; edit the Python exporter and restart the bridge
(Ctrl-C, re-run `./dev.sh`). The bridge needs a Python that can import
s3Dgraphy (pandas + lxml) — `dev.sh` prefers `../s3Dgraphy/.venv`.

The web variants (Ottimizza, «Prepara per un uso») need **gltfpack**
(meshoptimizer, MIT). The bridge looks for it in `EM_GLTFPACK`, then the
add-on folder, then the PATH. To install the add-on from a shell — the same
pinned release and sha256 as Settings › Add-ons, into
`~/.config/emstudio/addons/gltfpack/<version>/` — and see which one the bridge
will run:

```bash
./em.sh gltfpack           # installs it if missing, prints the bridge's path
./em.sh gltfpack --check   # …and queues a real variant on a glb copied into /tmp
```

**Importing a yEd GraphML.** Batch interop runs on the Python reference
implementation (see `docs/adr-001`, Addendum C):

```bash
python3 tools/graphml2em.py project.graphml project.em.json
emstudio layout project.em.json -o project.em.json   # compute the layout
```

then open `project.em.json` from EMStudio (Open… or drag & drop). The
importer needs `s3dgraphy` (pip install, or `--s3dgraphy` pointing at a
checkout's `src/`).

Core library and command line:

```bash
# prerequisites: Rust toolchain (https://rustup.rs)
cargo test                      # run the test suite (em-core)
cargo build --release -p em-cli # build the CLI → target/release/emstudio
cargo install --path crates/em-cli   # or: install `emstudio` into ~/.cargo/bin

# usage
emstudio validate  file.em.json          # header/format conformance + stats
emstudio stats     file.em.json          # node counts by type
emstudio layout    file.em.json -o out.em.json   # compute swimlane layout
```

`.em.json` files are produced from GraphML (or any s3Dgraphy source) with:

```python
from s3dgraphy.importer.import_graphml import GraphMLImporter
from s3dgraphy.exporter.emjson_exporter import export_emjson
export_emjson(GraphMLImporter("project.graphml").parse(), "project.em.json")
```

## Repository layout

```
crates/em-core/     Rust core: model, emjson I/O, validation, layout
crates/em-server/   axum HTTP/WebSocket delivery (skeleton, TBD)
apps/desktop/       Tauri v2 shell wrapping the web frontend
frontend/           web UI: TS + Vite, single canvas renderer, dual views
docs/               architecture, format spec, yEd parity checklist
schemas/            JSON Schema drafts for .em.json
```

## L'immagine web, pronta e non ancora pubblicata

EMStudio è anche una **web app**, ed è quella che serve a un nodo: il desktop lo
si installa, questo lo si raggiunge. `Dockerfile` la costruisce — uno stadio
node che fa entrambe le build (`npm run build:all`: l'editor e il lettore) e
un `caddy:2-alpine` che serve i file statici, senza `npm` nell'immagine finale.

```
docker buildx build -t emstudio --load .     # buildx, non `docker build`: vedi il Dockerfile
docker run --rm -p 8080:8080 emstudio
#   /        l'editor          /read/   il lettore          /health   la sonda
./dev-stack/prova-immagine-web.sh emstudio
```

La prova non guarda i codici di stato: legge la shell del lettore, ne estrae
ogni riferimento e chiede quelli — perché il guasto da prendere è la **pagina
bianca**, cioè una shell che risponde 200 e poi chiede moduli a un indirizzo che
non esiste.

L'immagine parte con un **UID arbitrario** (`--user 12345:0`), che è quello che
OpenShift assegna: le cose scrivibili appartengono al gruppo 0 con i permessi di
gruppo uguali a quelli utente, e `USER` è un numero.

### Non è ancora pubblicata, ed è deliberato

`.github/workflows/immagine.yml` esiste ma **non ha un trigger automatico**: si
lancia solo a mano, scrivendo il nome dell'immagine per confermare. La ragione
sta in cima a quel file: un pacchetto GHCR non segue il trasferimento del suo
repository, e PSNC specchia le immagini sul proprio registry — un pacchetto
pubblicato nel namespace sbagliato e poi spostato è il danno peggiore
disponibile.

Il namespace è `ghcr.io/extendedmatrix/`, distinto da `ghcr.io/stratigraph-eccch/`
dove stanno le immagini del progetto StratiGraph: EMStudio appartiene
all'ecosistema Extended Matrix, che è più longevo del progetto.

## License

GPL-3.0-or-later. All runtime dependencies are GPLv3-compatible
(MIT / Apache-2.0 / MPL-2.0). The layout engine is our own — ELK would be
license-compatible (it declares the EPL-2.0→GPL-3.0 Secondary License) but
is excluded for architectural reasons (see ARCHITECTURE §4.1).

## Ecosystem

[Extended Matrix](https://extendedmatrix.org) ·
[s3Dgraphy](https://github.com/ExtendedMatrix/s3Dgraphy) ·
Heriverse · EM tools for Blender · developed within the
**StratiGraph** project (Horizon Europe GA 101232855) and the CNR ISPC
Extended Matrix framework.
