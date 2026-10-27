# EMStudio — Architecture

Status: draft v0.1, 11 July 2026 (E. Demetrescu, with AI-assisted drafting).
Decisions traced to the WP3 coverage analysis
(`StratiGraph WP03 Material / 20260710_s3Dgraphy_CIDOC_coverage_and_mapping_governance.docx`)
and the WP3 mapping meeting of 10 July 2026.

## 1. Product identity

One graph, two projections:

* **Matrix view** — the Extended Matrix swimlane canvas: epochs as horizontal
  lanes (newest on top), sectors as vertical columns, stratigraphic sequence
  edges, collapsed paradata. This is the archaeologist's authoring surface.
* **Graph view** — the full property graph with every node and typed relation
  visible (paradata chains, epochs as nodes, authors, resources), for
  inspection, QA and semantic work.

Both views are projections of the same in-memory model; switching views never
touches the data. The palette, allowed connections and node metadata
(symbol / label / description per type) are read from the **s3Dgraphy JSON
datamodels** — EMStudio never hardcodes the EM language.

## 2. One core, three deliveries

```
                ┌───────────────────────────────┐
                │        frontend (TS/canvas)    │
                │  matrix view · graph view ·    │
                │  palette · inspector · search  │
                └────────────┬──────────────────┘
             WebSocket/HTTP  │  Tauri IPC (in-process)
        ┌────────────────────┴───────────────────┐
        │              em-core (Rust)             │
        │ model · .em.json I/O · validation ·     │
        │ layout engine · GraphML import (legacy) │
        └───────┬─────────────────┬───────────────┘
        StratiGraph Server (axum)   apps/desktop (Tauri)      em-cli
        multi-user web     local files, offline,     batch ops,
        deployment         embedded Oxigraph         CI checks
```

* **Desktop (Tauri)**: em-core linked in-process; opens/saves local
  `.em.json`; optional embedded **Oxigraph** store (Rust, MIT/Apache) for
  local SPARQL over the exported triples. One-click install, fully offline.
* **Web (axum server)**: same core behind HTTP/WebSocket; the browser runs the
  same frontend. Collaboration (CRDT) is a later phase — the model API is
  designed so that document state can be lifted into automerge/yjs without
  rewriting the core.
* **CLI**: convert (graphml → em.json), validate, layout, export (svg/pdf,
  turtle via s3Dgraphy interop).

pyArchInit and every existing consumer of s3Dgraphy are untouched: EMStudio
consumes s3Dgraphy's formats, it does not replace the library. The Python
side remains the semantic reference implementation (CIDOC/CRMem mapping, RDF
export); em-core implements the *editing* model.

## 3. Native format: `.em.json`

v1 = three sections (draft spec in `emjson-v1-draft.md`):

1. `header` — format name, semver, generator, `ontology_versions` (mirrors
   s3Dgraphy `referenced_ontology_versions`), graph-level metadata.
2. `graph` — **flat canonical property graph** (nodes[]/edges[]; freeze
   decision of 11 July 2026, rationale in `emjson-v1-draft.md`): one shape
   for every consumer; the bucketed Heriverse payload stays available in
   s3Dgraphy as the legacy transitional format until Heriverse 1.6 adopts
   `.em.json`.
3. `layout` — canvas, swimlanes (epoch id → lane geometry and order),
   sectors, per-node positions, folded-group state, per-group-context
   positions, optional edge routes.

Rules: `graph` is the single source of truth; `layout` is always optional and
reconstructable (the layout engine can regenerate it); consumers must ignore
unknown sections (forward compatibility); an optional `@context` makes the
graph section JSON-LD-liftable later.

**GraphML policy**: import = one-way legacy path (delegated to s3Dgraphy's
importer via CLI/interop, one parser in the ecosystem); export = kept only
with an explicit *non-lossless* disclaimer, until deprecation.

## 4. Layout engine (in-core, own implementation)

### 4.1 Why not a library

yEd's hierarchic swimlane layout is the benchmark (see
`yed-parity.md` for the feature checklist extracted from the yEd dialogs).
Generic engines are however a poor fit:

* **ELK / elkjs** — licensing verified 11 July 2026: the ELK project
  *does* declare the EPL-2.0 Secondary License option
  (`SPDX-License-Identifier: EPL-2.0 OR GPL-3.0-or-later` in its
  NOTICE.md), so it **is** legally usable in a GPLv3 suite. It remains
  excluded for architectural reasons: elkjs is a ~6 MB GWT-transpiled
  Java blob that would live only in the frontend, breaking the
  cross-delivery determinism contract (desktop/server/CLI must lay out
  identically), and there is no Rust ELK. Downgraded from "excluded
  (license)" to "legitimate frontend fallback, not used".
* dagre (MIT) is unmaintained, has no lane constraints, no group handling.
* The EM problem is *more constrained and therefore simpler* than the general
  case: **layer assignment is semantic**. The lane of a node is given by the
  data (`has_first_epoch`, `survive_in_epoch`, continuity rules), not
  computed. What remains is ordering, compaction and routing.

### 4.2 Pipeline (constrained Sugiyama)

1. **Lane assignment** (semantic): epoch lanes from the graph; virtual units
   only in their declaration epoch unless extended by BR; multi-epoch
   presence rendered as survival tracks. Intra-lane sub-layering for chains
   living in one epoch (paradata cascades).
2. **Crossing minimisation**: barycenter/median ordering within lanes,
   iterated across lanes; group members constrained to stay contiguous.
3. **X-coordinate assignment**: Brandes–Köpf-style compaction with minimum
   distances (node/node, node/edge, edge/edge — yEd-parity parameters),
   sector (vertical column) constraints, symmetric placement option.
4. **Edge routing**: orthogonal channel routing with port assignment on node
   sides; bundling for parallel stratigraphic edges; label placement.
5. **Incremental / "from sketch" mode**: the engine treats current positions
   as soft constraints (yEd's *From Sketch* policy) so a manual arrangement
   survives re-layout; per-selection partial layout.

### 4.3 Groups in the engine

Groups (paradata `<US>_PD`, activities, series, time branches) act as layout
constraints when open (members contiguous, group box derived) and as single
nodes when folded. yEd parity: *Ignore Groups / Horizontal Group Compaction /
Treat Groups as Swimlanes* become engine flags.

### 4.4 Licensing consequence

Implementing the pipeline in `em-core` keeps the whole stack
GPLv3-clean (see table in §7) and — decisive argument — makes layout
**deterministic across the three deliveries and the CLI** (a CI job can
re-layout a file and diff it).

## 5. Hypergraph navigation (folding)

Requirement (E.D., 11 July 2026): "close" a group into a single node;
double-click enters a blank space containing only the group's members; a
back button returns to the full canvas.

* Model: folding is a *view state*, not a graph mutation — the proxy node is
  ephemeral; edges crossing the boundary re-attach visually to the proxy
  (with a badge counting hidden endpoints).
* Navigation: breadcrumb trail (`Canvas ▸ VAct.03 ▸ USV148_PD`); each context
  has its own stored positions (`layout.group_spaces`); Esc / back button
  pops the trail.
* Nesting: groups within groups fold recursively (activity ▸ unit ▸ paradata
  group), which is what makes the graph a navigable hypergraph.
* `.em.json` persists `folded_groups` + `group_spaces` so a document reopens
  exactly as left, in both views.

## 6. Frontend

* TypeScript + a thin scene-graph over HTML canvas/WebGL (konva or PixiJS,
  both MIT); Cytoscape.js (MIT) is an option for the graph view but a single
  custom renderer serving both views is preferred (one hit-testing, one
  style system driven by the EM palette metadata).
* Palette generated from `s3Dgraphy_node_datamodel.json` (symbol / label /
  description per type) + SVG glyph set (extend `em_palette_icons.json`).
* Live validation while drawing edges from `allowed_connections` (socket
  compatibility, exactly the EM 1.5 connector rules), with the same JSON as
  the source.
* Inspector panel = node properties + paradata chain preview + vocabulary
  pickers (SKOS layer, when available).

## 7. Licensing table (GPL-3.0-or-later suite)

| Component | License | GPLv3-compatible |
|---|---|---|
| Tauri | MIT / Apache-2.0 | yes |
| Rust crates (serde, axum, petgraph…) | MIT / Apache-2.0 dual | yes |
| Oxigraph | MIT / Apache-2.0 | yes |
| konva / PixiJS / Cytoscape.js | MIT | yes |
| dagre (if ever used for graph view) | MIT | yes |
| ELK / elkjs | EPL-2.0 OR GPL-3.0-or-later (Secondary License declared) | yes — but unused (architectural: see §4.1) |
| JointJS+ | commercial | no — excluded |
| **Add-ons** (not shipped: downloaded on request, version and sha256 pinned in `tools/em_optimize.py`, called as separate programs) | | |
| gltfpack 1.3 / 1.2 (meshoptimizer, Arseny Kapoulkine) | MIT | yes |
| Obj2Tiles (OpenDroneMap) — round 2 | AGPL-3.0 | yes, as a separate program (GPL-3.0 §13) |
| KTX-Software (toktx) — when used | Apache-2.0 | yes |
| yFiles | commercial | no — excluded |

## 8. Documentation policy

Developer docs (this folder: architecture, format spec, parity checklists)
live **in-repo** and move with the code. A user manual gets its own
`EMStudio-doc` repository — following the ecosystem pattern
(ExtendedMatrix-doc, EM-blender-tools-doc, versioned branches on
readthedocs) — **when the first user-facing release ships**; splitting
earlier would desynchronise docs from a fast-moving codebase.
The `.em.json` normative spec belongs to **s3Dgraphy** (reference
implementation, where importer and exporter live); this repo keeps a draft
plus a pointer.

## 9. Roadmap (proposal)

| Phase | Deliverable |
|---|---|
| 0 | `.em.json` v1 schema frozen with s3Dgraphy (`emjson_importer.py` counterpart) |
| 1 | em-core: model + emjson I/O + validation; CLI convert/validate |
| 2 | frontend: graph view read-only over em.json; Tauri shell opens files |
| 3 | matrix view (lanes from epochs) + layout engine v1 (steps 4.2.1–4.2.4) |
| 4 | editing: palette, socket validation, undo; folding navigation (§5) |
| 5 | from-sketch incremental layout; SVG/PDF export; GraphML import via s3Dgraphy |
| 6 | StratiGraph Server multi-user (CRDT); Oxigraph embedded SPARQL panel |
