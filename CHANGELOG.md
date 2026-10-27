# Changelog

Notable changes to **EMStudio**. Until 16 October 2026 they lived only in the
commits and in the reports of each MICRO; this file starts with the first change
that asked for one.

## [Unreleased]

### Added
- **Ottimizza, round 1 of 3** (MICRO-OTTIMIZZA-1, the round-0 verdict and
  E.D.'s precisions of 27 October 2026). The **variants of a model are on**:
  the Viewer, the Space and the tilesets read `EXT_meshopt_compression`
  (three's `MeshoptDecoder`) and `KHR_texture_basisu` (`KTX2Loader`, its Basis
  transcoder served beside `tiles3d.js` as the Draco decoder is; `tiles3d.ts
  withDecoders`), and «Viewer e scheda» draws a model of the disk as itself.
  Five destinations, each with its engine said and why, and changeable: web
  (10% of the triangles, KTX2 at 1024 px, meshopt), mobile (5%, 512 px),
  Heriverse/ATON and print (whole, nothing compressed), experiences (Blender
  + 3DSC, round 3; gltfpack meanwhile). **gltfpack is an add-on downloaded on
  request** (`tools/em_optimize.py`): from meshoptimizer's official release
  page, version and sha256 pinned (1.3 for macOS arm64, Windows, Linux; 1.2,
  the last Intel build, for macOS x86_64), into the app's data folder; its
  licence (MIT), source and version shown before the download and in
  Settings ▸ Advanced ▸ Add-ons, where it is updated and removed. **Every
  optimisation is a background job of the bridge** in a process of its own
  (`POST /jobs`, `GET /jobs?id=…&since=N`, cancel): progress in the tab and in
  the status line, the notice at the end, EMStudio usable meanwhile; the
  memory asked is said before it starts. The variant, in
  `RB/versions/‹model›@lodN-‹use›.glb`, is born stamped as derived
  (`lod_generation`, `decimation`, the parameters, gltfpack's version), is
  registered as a version of its asset (`POST /graph/add-version`, s3Dgraphy's
  `api.add_version`; a level already taken becomes a revision of it) and
  appears in the Chain. **The .3tz** is a job too (also in the browser of the
  dev stack: it is the bridge that writes), born stamped as derived from its
  folder (`packing`) and in the Chain. **A tileset from a mesh** is announced
  with what comes, the order of its engines and its «experimental» switch for
  round 2. Bridge level 43. `check-optimize-bridge`, `AR7.optimize`,
  `AR10.variant`, `R4.pack`.

- **The File window «alla Blender»** (MICRO-ARCHIVIO-2, E.D.'s decisions of
  27 October 2026: V1 = A, V2 = 4, V3 = under the File window, V4 = with GIS/;
  `files-browser.ts`). The places on the left, closed with ◧ or T: the
  open project's standard tree, read from s3Dgraphy (`/project-tree`, bridge
  level 42) with «to be made» for the folders that are missing and the
  `versions/` folders that exist, «Where to start» with no project; the
  favourites (a star on the folder shown); the recent folders; the allowed
  folders with «add…». The centre: a search, a filter by kind (GIS layers
  among them), list or thumbnails, columns sortable by name · stamp · in the
  graph · size · date, the system files (`.stamp.json`, `.bak`, `.prima-…`,
  `.blend1`, `~$`) hidden and counted, and a line of state where the block of
  actions under the list was. The tools on the right in four vertical tabs,
  closed with ◨ or N, working on the choice (and on the choice or Shelf
  entries dragged onto a tab): **Timbro** — presets (built-in and saved by
  the person), the composer of today (one place to stamp), a preview per
  file (its stamp, the act, the piece of Chain), «Timbra N file», the
  stamped ones «stay as they were», «Stamp a step from these…»;
  **Ottimizza** — as the round-0 verdict says: a tileset packed as .3tz on,
  a model's variants experimental behind a switch with its warning
  (gltfpack on the bridge, `/fs/optimize`, not compressed because the
  Viewer reads neither meshopt nor KTX2 yet; the variant in
  `RB|RM/versions/<model>@<lod>-<destination>.glb`, named by s3Dgraphy, born
  stamped as derived — step `lod_generation`, the parameters and gltfpack's
  version), a tileset from a mesh announced with how it is done today;
  **Stanza** — what goes up, its size, the licence and the embargo (from the
  delivery or the graph), the files without a stamp kept private, outside a
  room how to enter one; **Info** — the compact form of the file's card
  (its picture, what it is, its uses in the graph, its stamp, «Apri nel
  Viewer»), with no choice the folder's gestures (stamp its files together,
  DosCo, its stamps). **File ▸ Open project… / Reorder by the standard… /
  Close the project** beside «New project…»; «Reorder» asks where a `.tif`
  it cannot read goes (GIS/ or EM/DosCo/). The Archive puts the Shelf under
  the File window. AR5–AR8; check-files-browser, check-files-bridge.
- **Resources, Interpretations, Combiners in the Tabular** (MICRO-VIEWER-UNICO
  p.6; `ledger-sheets.ts`). Three computed views, a row per node: the
  resources (media, versions with the lightest and the highest weighed,
  licence, author, where the file is, «↑ D.xx» for every document that
  recalls it), the extractors (the document they read, what they read — a
  IIIF region, a 3D annotation, a text, another property — the value read,
  the property and unit they feed, who made them, an AI not yet verified
  said), the combiners (property and unit, how many interpretations, «n ▸»
  shows them filtered, the rule, the value). A click on a row selects its node.
  **The focus of every Tabular**: with «Zoom to selection» each open Tabular
  goes to its own row (each scrolled, not only the first of the page), changes
  sheet only when the node is not in its own, and a column filter or the
  bar's filter hiding the row is cleared with a line that says so; the window
  clicked does not move. VU6; S6.sheets counts the three new views.
- **One Viewer for a document or a resource** (MICRO-VIEWER-UNICO p.1–4, E.D.
  20 October 2026; `viewer-node.ts`, `viewer-annot.ts`). The Viewer shows ONE
  node, following the selection of every window (📌 holds it on a node):
  a resource with its versions, or a document WHOLE — its file, its linked
  resources, the crops of its extractors, scrolled; its representation models
  and their container as a small scene of that document only, with the Space's
  engine (the container's tileset drawn as the Space draws it). A line says
  where what is shown comes from (D.09: no file, 87 representation models).
  The version: the lightest at once, the highest within the threshold of the
  Preferences (summed over the document's models) after 2 s still on the same
  node (`highDelayS`), a new node cancels it; the bar says what is seen
  («10 modelli · derivata lod4 · 3.7 MB» → «LOD2 dell'autore · 83 MB») and its
  selector forces a version. One reader per medium: the image (a IIIF
  thumbnail first, then the size of the frame), the text with its facing
  translation, the PDF, the 3D framed whole at the opening (Shift+C) — D.01 was
  one wall of ten, LOD0, read Y-up: a thin strip seen edge-on. On the model,
  a spot height, an impost height, a bedding plane (three points or a face) and
  a line each make an extractor of the document in one undo step
  (`addFreeExtraction`): the coordinates in the model's frame, what was read
  and its value (`reading_kind`, `value`, `plane`); the Inspector lists them in
  «Estrazioni da questo documento», and «Interpretazione» makes one a source of
  a property (`linkExtraction`; a second source makes the combiner).
  `check-viewer-unico.mjs`, VU1–VU4 in the browser suite.
- **The standard blocks in a new story's outline** (MICRO-NARRATIVA-BLOCCHI
  p.3). «Proponi i capitoli» puts Storia delle ricerche first, Beni coinvolti
  after the introduction (the end of the first chapter), and a last settled
  chapter Bibliografia — still one undo step. An existing story is not
  touched: its Index offers «+ Blocchi standard» with the ones it lacks, and
  adds only those, in one step. `check-narrative-query.mjs` (the three
  queries on a synthetic two-graph file with a nested HDT-O chain, and on a
  copy of the GT16 file with `NARR_V33`) and NB1–NB3 in the browser suite.
- **Blocks that ask the graph** (MICRO-NARRATIVA-BLOCCHI p.2, E.D. 20 October
  2026; `narrative-query.ts`). Three standard blocks of a story put a question
  to the graph and show what answers, recomputed every time the page is drawn:
  **Storia delle ricerche** (the graphs of the file — a graph is a study —
  with their rapporti, HC9 studies and HC13 projects, by date: who, when,
  which project, which licence and embargo), **Bibliografia** (the documents,
  grouped as the datamodel tells them apart — with a geometry, comparative,
  the rest — in one citation form; from the story, through the properties of
  the nodes it cites, or from the graph) and **Beni coinvolti** (every HC1,
  HC2, HC9, HC13, HC16 and the arcs that really join them, nested only where
  an arc says «part of»; a good named by two graphs is one). A block is an
  embed of the graph, `view_type` table, with its question in `options`
  (`query`, `scope`: this story / this graph / every graph of the file,
  `types`, `order`) — nothing in the NarrativeNode changes. It is inserted
  from the Blocks menu, its parameters are in its Inspector (one undo step
  each), an entry leads to its node, in its own graph. Print, Notebook and the
  export carry it as static text with the date it was computed (a prose block
  baked on a copy; an entry of the story's graph is a mention).
- **The Space, second pass** (MICRO-SPAZIO-3D-2, E.D. 16 October 2026).
  - **The implicit paradata group** (`implicit-pd.ts`): a unit with loose
    properties (attached directly, in no group) behaves in the view as if it
    had a group — the PD badge counts them and the instances, a click solos it,
    Shift+click opens it in place; with a real group too, one badge, and the
    loose ones in it marked «fuori dal gruppo». «Rendi gruppo (Compatta)»
    makes it true in the data, and the view stays the same. On Templu Mare v2
    every proxy (65 of 65) has its place beside its geometry property.
  - **Shift+C**: the 3D cursor at the per-axis median of the geometries drawn,
    the view on the 5th–95th percentile of their boxes; never the world's
    origin; an empty scene says so and the cursor stays.
  - **Mouse and trackpad as Blender's** (`dragIntent`): middle = orbit,
    Shift+middle = pan, Ctrl+middle = zoom toward the point; the left drag
    orbits until a middle button is seen (or «Emula mouse a 3 tasti»), then it
    is the box selection; Alt+left = middle with the emulation; two fingers
    orbit, Shift pans, Ctrl or the pinch zoom. Preferences ▸ Viewers ▸ 3D
    navigation.
  - **The views of the numeric keypad**: 1 front, 3 right, 7 top, Ctrl the
    opposite, 5 perspective ⇄ orthographic (the orthographic zoom changes the
    scale, the pivot at the point's depth, the near plane behind the scene),
    0 nothing (no camera of view yet), «.» frames the selection; «Emula
    tastierino», «Auto Perspective»; the view's name top left.
  - **The N panel «Vista»** (N, or the tab on the right edge): the 3D cursor
    (position and rotation, in the scene's frame, Z up), the selected object's
    transform, the view and the lens.
  - **The transform in the data** (`transform3d.ts`, `transform-ui.ts`): a
    model's and a proxy's pose is `data.transform` (EM Tools' field: position,
    Euler XYZ in radians, scale, Blender's Z-up frame, `up_axis` declared) on
    the model and on the proxy's SemanticShape, applied over the file (the glb
    never changes). The Inspector's «Trasformazione» and the N panel show the
    same nine values and write to the same place; G / R / S move the selected
    proxy or model too; one step of undo per gesture or field. A sketch is born
    in its own frame: the glb holds the shape, the pose goes to the shape's data.
  - **«Elimina stanza…»** for the owner and the node's operator, and the node's
    **orphan assets** in the Preferences (download, delete one at a time).
- `scripts/check-space-views.mjs` (101), `scripts/check-implicit-pd.mjs` (30).

### Added
- **«Statistiche» among the overlays of the 3D** (MICRO-VIEWER-SPAZIO-EMTREE
  p.4; `overlays.ts`, `scene3d.ts`). Under the view's name: the triangles and
  the draw calls of the last frame (renderer.info), the vertices and the
  objects of the visible scene, the FPS — read at most twice a second. Off by
  default, also for a Space remembered before it; the Viewer follows the
  same switch. Measured (Templu Mare v3.3, Chrome with the GPU): a reading
  costs 0.15 ms on average (0.9 ms at most) on 1.6 million triangles and 217
  objects; the frame rate is 60 FPS with it on and off. VS4.

### Changed
- **The EMtree, redrawn as the Outliner draws its rows** (MICRO-VIEWER-
  SPAZIO-EMTREE p.6; `emtree.ts`). E.D.: the files and their graphs were
  «caotici». One line per file: its name, the dot of unsaved work, the ⌘S
  mark, the actions (Save, Close) over the line's end on hover or focus; the
  path is the tooltip (a file with no path still says where it lives). Under
  it the graphs, indented, one line each: a mark for the active one (and the
  Outliner's inset bar), name, code (GT16), nodes; move and close on hover.
  A graph's narratives and its auxiliary files are secondary lines under it.
  Nothing wraps: every label ellipsizes and says itself whole in its
  tooltip. Screenshots at 280 and 400 px in the report. VS6.
- **Single / Gallery only where there are images to lay out** (MICRO-VIEWER-
  SPAZIO-EMTREE p.5). The Viewer's header offers the two modes only when what
  it shows groups two images or more: a folder of the disk, the Shelf, or a
  document with several images (D.11 of Templu Mare: its own and those of its
  extractors). A 3D document, a PDF, a single image has no selector; the
  header follows the selection. A document's Gallery lays its images out and
  a click opens one in Single — before, Gallery did nothing on a document.
  VS5.
- **A PDF in the Viewer keeps its tools, off, and says why** (MICRO-VIEWER-
  SPAZIO-EMTREE p.3). E.D. on dev.54 saw no annotation tool in the Viewer.
  Measured on all 55 documents of Templu Mare v3.3, in Fonti and in a Viewer
  alone: the 3D has its six (spot height, impost, bedding plane by three
  points and by a face, line, polyline), the images Region and Polygon — but
  the 31 PDFs (the plates TM0nn, D.02–D.05, D.12), shown by the browser's
  reader, had none, and 24 documents have no file. A region on a PDF is traced
  on a page drawn as an image, which EMStudio does not do yet: the bar now
  shows Region and Polygon off, with the reason. Point, line and polyline on
  an image are not in s3Dgraphy's region2d (rect and polygon only): a proposal
  in the report, not invented here. VS3 looks for the tools on screen.
- **The Viewer draws one version, and only E.D. climbs** (MICRO-VIEWER-
  SPAZIO-EMTREE p.2, 21 October 2026; `viewer-node.ts`, `main.ts`). E.D. on
  dev.54: «dopo 2 s partiva la grande e rallentava tutta l'interfaccia». The
  pause and its loader are gone, and its parameter in the Preferences: the
  Viewer loads the container's TILESET when the document has one (it joins
  the high and the low resolution, the best way to work on it), else the
  lightest level. «Versioni» in the Viewer's bar and the tab «Versioni» of its
  side panel (N, or the ◂ on its edge) are one list from one source: the
  tileset, then the levels from the lightest with their weight and kind
  (author's level, derived), a level over the threshold marked and loaded only
  when chosen; the panel also frames, shows the document in the Matrix, opens
  it in the Space, selects the container. The gestures are the Space's: the
  double click only moves; Alt + click selects the mesh and the Viewer stays
  on its whole document; the plain click is the annotation tools'. Measured
  on the way: the Viewer never redrew when the bridge's address arrived after
  its first drawing (no change of the Space), so a tileset stayed a label —
  the scene is now handed again whenever a file's address or state changes,
  and the framing tries again until the first tiles are drawn. VU1, VU2, VS2.
- **The clicks of the Space, as E.D. meant them from the start** (MICRO-VIEWER-
  SPAZIO-EMTREE p.1, 21 October 2026; `space-nav.ts`, `space-selection.ts`,
  `scene3d.ts`). A click selects the PROXY under the cursor (a sketch too),
  even when a mesh is drawn in front of it; Alt + click selects the MESH (the
  representation model, a tileset; ⌘ / Ctrl + click stays a second way); the
  double click only MOVES — the centre of rotation and the zoom go to the
  point, nothing is selected. Measured on dev.54: the click took the nearest
  thing whatever it was, Alt was ignored, and the double click's two clicks
  cycled to the object BEHIND before the zoom — a double click selected. Now
  a click waits 250 ms before it picks: a second press on the spot makes it a
  double click; a slower double click gives the selection back. The «?» in
  the Space's header and the key map say the rule. VS1.
- **The Doc window is gone** (MICRO-VIEWER-UNICO p.5). Its four jobs each have
  one place: the list is the Tabular's Documents sheet, the card the
  Inspector's («Scheda del documento»: title, file and its files; the code,
  the description, the language and the translation were already there, the
  year is «Datazione»), the reader and the tracer are the Viewer's, the menu
  «Documento» (new, delete, the regions as Web Annotations) is the Viewer's.
  Fonti is the Tabular of the documents, the Viewer above the Matrix, the
  Inspector; the Annotator workspace went (it was Fonti with the Viewer
  large). A saved Doc opens as a Viewer — pinned on its document when it was
  kept by hand; a saved Annotator or Fonti with the Doc is reseeded. Requests
  («Leggi», a double click on a document, Shelf ▸ Annota) open the service
  Viewer beside, never one that is pinned. VU5; the suite cases of the Doc
  rewritten to the Viewer (1.doc, 5.*, 9.*, S2.trace, S4.*, U3.webanno,
  T2.gateLoad).
- **A story's title and subtitle are written in the page** (MICRO-NARRATIVA-
  BLOCCHI p.1, E.D. 20 October 2026). In Write the title (`name`) and the
  subtitle (`description`) of the story are edited where they are read, with
  the gesture of a chapter's title (click, type, Enter or leave; Esc goes
  back): one field each, one undo step per gesture. An empty subtitle shows
  «Aggiungi un sottotitolo»; an empty title is refused. A click on the story's
  head opens its Inspector (title and subtitle, the same fields), and the
  chapter's Inspector now writes the chapter's title too (`onRename`, left
  unconnected since AUDIT N9). The «template · n chapters» line stays
  information and says so in its tooltip; so do the other texts computed from
  the graph (embeds, mentions, the lane chip, the byline, the Index's AI and
  «to write» tags, the Print and Notebook previews).
- **Every table sorts and filters, with one component** (MICRO-PULIZIA-
  INTERFACCIA p.9, `table-tools.ts`). It enhances any table once it is in the
  page: a click on a heading sorts (ascending, descending, back to the table's
  own order) with `aria-sort` and an arrow; a row under the headings filters
  each column — a text, or a choice for a column of a few fixed values; «Clear
  filters» (aria-disabled when there is none) and «n of N rows». The state is
  remembered per table (kind + headings), so a sheet rebuilt by an edit comes
  back as it was left; rows are only moved and hidden, the document is never
  touched. Received: every Tabular sheet and computed view (Warnings,
  Datings, to verify, verified, Models and proxies), the Shelf's table, the
  mapping editor's fields, the node's orphans. Left alone, and why: the file
  states (their own sort and chips), the Chronology (its order is the
  chronology, rows carry inline forms), a story's embedded tables (content),
  the shortcuts and the workspace legend.
- **The narrative Index keeps its titles readable** (MICRO-PULIZIA-INTERFACCIA
  p.8). A chapter whose lane badge was long («VAct.01 Foundations of the
  temple», `white-space: nowrap`) squeezed its title to one letter per line
  (measured on «Il Grande Tempio», row 8: 26 px wide, 19 lines). The badges sit
  in a box of their own: the title keeps at least 9em, the box goes under it
  when the row is narrow, the lane's name is ellipsed with the whole name in its
  tooltip. Measured after: every title ≥ 115 px and ≤ 4 lines, wide and at 200 px.
- **The import's residues out of the data** (MICRO-PULIZIA-INTERFACCIA p.7).
  yEd's drawing (`shape`, `fill_color`, `border_style`, `border_color`,
  `border_width`, `symbol`, the positions, the fonts…) is not a datum — the
  glyph is the visual rules'. Measured: s3Dgraphy's GraphML importer writes it
  (`attributes`) and its em.json exporter lifts it into `data`; nothing draws
  from it. So EMStudio's GraphML import no longer brings it in and the Save
  leaves it out (`model.ts` `YED_DRAWING_KEYS`), keeping what IS read: an
  epoch's `fill_color` (its colour) and a document's border while it has no
  `certainty_class`. `geometry` (the document's geometry axis) is a datum and
  left the «Technical details». GT16: 120 nodes with yEd residues → 0 after a
  save. **A document's date lives in its property** («Dating of the document»):
  the Inspector no longer shows the `data.absolute_time_start` copy, the dating
  section no longer writes it, and Warnings has a cure, «Move the date into its
  property» — no property: made with that value; the same value: the copy goes;
  two values: it asks which to keep. GT16: 4 copies → 0.
  `__EM_DRAG__.issues()` says each issue's cure, `runIssueFix` presses it.
- **The Inspector, sectioned** (MICRO-PULIZIA-INTERFACCIA p.6). Every section
  closes with its triangle, as in a 3D program's properties (the heading is the
  button, `aria-expanded`); the state is remembered per node type. The whole of
  the data — the fields and the technical details — is ONE section, «Data»
  (the technical ones under a small heading, no second triangle). «Delete
  node» is at the very end, after «History of this node». A search at the top
  keeps only the sections and the fields that match, opening a closed section
  that holds a match (for the search only). «Open with…» is one row of icons
  (StratiField, Blender, Heriverse): names and reasons in the tooltips and the
  aria-labels, an unavailable tool `aria-disabled` and its click says why.
  On a property, «+ reading» is **«Interpretation»** with the extractor's glyph
  (it creates the extractor); its buttons wrap as whole buttons, one line each,
  at 280 and 400 px. «Also called» moved under the node's own block.
- **The Matrix is laid out on what it draws** (MICRO-PULIZIA-INTERFACCIA p.5).
  The archival layout (what «Recompute layout» writes and the file keeps) places
  every node, the outer ring included — Representation Models, resources and
  their DTC chains in a band under each lane, closed paradata groups as boxes —
  and the Matrix, which hides that ring and draws a closed group as a «PD»
  tablet on its unit, showed the room left for them as voids. Now the Matrix
  always draws em-core's VIEW layout of exactly the boxes it draws (plus the
  epochs and every edge among them, `has_first_epoch` included, whatever its
  ring), seeded From-Sketch by the archival one; the document's layout is never
  written by it, and a hand move goes to both. Recomputed when what it was made
  for changes (nodes, edges, filter, folds, a new archival layout). On the GT16
  (20 Oct 2026): the drawing 6956 × 4524 → 3732 × 2236, nodes 1.1 % → 4.2 % of it,
  the II A.D. lane 3960 → 1738 high, horizontal voids over 120 in a lane 2 → 0,
  boxes farther than 300 from any other 4 → 0, mean edge length 1096 → 538.
  `__EM_DRAG__.matrixGeom()` reads the Matrix as drawn (the checks' hook).
- **The graph window's bar** (MICRO-PULIZIA-INTERFACCIA p.4). «Recompute
  layout» is an icon of its own (no word «Layout»; its name and Alt-click in the
  tooltip and the aria-label), and beside it an icon for «Compact the
  properties (whole graph)» (not available: `aria-disabled`, and it says why).
  «Uniform spellings…» moved to Tools. The «+» left the bar (⇧A and Tools ▸ Add
  node… stay). «Fit to this window» takes ⇧C too, as in the 3D Space, besides
  0; Back and 1:1 stay. The «⋯» is drawn only when it holds something: in the
  Graph, the layout algorithm; in the Matrix it is gone.
- **The graph window's views** (MICRO-PULIZIA-INTERFACCIA p.3). «Full graph» is
  gone: the **Graph** (the liquid picture) draws every node present — the HDT-O
  ones (study, heritage entity, twin, project, the graph itself), the graph's
  paradata and the ornaments as nodes — and its funnel has an **HDT-O** switch
  (on by default) that takes them out again; a window left on the Full graph
  opens on the Graph. «Multigraph» is called **«Graphs paradata»** and the
  «Graph paradata» badge left the Matrix's bar (the view is one of the modes).
  The funnel keeps to each view what is its own: **Monochrome** is the Matrix's
  and the DTC's (the Graph draws discs, and never read it). **The HDT-O nodes
  have glyphs** (`hdto-glyphs.ts`, in the datamodel's `2d_glyphs` format, read
  only for a type the vendored rules do not draw yet): the ornaments' grammar —
  a grey pictogram in a #333333 frame — with a square plate; the graph's glyph
  is square, and what is selected and clicked is that square, not the 240 × 68
  box. The texts no longer equate a twin with a graph: the twin's gloss says a
  twin can be of any scale (a site, a building, US 100) and the graph is one of
  the proposition sets it gathers; the DTC's empty state, the asset scope hint
  and the HDT-O switch say the same.
- **The files-and-graphs panel is the list of what is open** (MICRO-PULIZIA-
  INTERFACCIA p.2). The introduction is a «?» in the panel's header (tooltip,
  Tab, screen reader; a click says it in a toast); New graph, Open… and Recent
  files left the panel — they are File's (File ▸ Open Recent is their one
  place). The body: the open files, each with its graphs, the active graph
  marked, «Move to…» as before. The collapse triangle follows a rule: it is
  drawn only where the panel is the upper side of a vertical split, i.e. where
  closing it gives the space to the panel below — alone in its column it is not
  drawn. Auxiliary files: one row per file (name, type with a «?», state), the
  type's meaning and the long note in tooltips; their header is translated.
- **The name strip, cleaned** (MICRO-PULIZIA-INTERFACCIA p.1, E.D. 20 October
  2026). The «em.json» button (a Save with no name and no answer) is gone:
  unsaved changes are a dot beside the name (tooltip «Unsaved changes · ⌘S»;
  the dot is a button, it saves), and a save says so in a toast. «Publish…»
  stays, grey (`aria-disabled`, still reached by Tab): its tooltip and its click
  say that publishing to a StratiGraph node arrives with phase 2 — no identity
  question that ended in «nowhere to publish to». The status bar reads
  «Project v17»; the digest, what the number means and «Pin version…» are in
  the tooltip. `data-i18n-aria-label` translates the name of icon-only buttons.
- **One table of commands, two menus** (MICRO-DOVE-CHI-MENU p.1, E.D. 19 October
  2026). `menu-table.ts` holds every command (id, label, accelerator,
  platforms); the page's File, Edit and Help and the Mac desktop's menu bar are
  generated from it (`menu-ui.ts`, through Tauri's menu API — `main.rs` no longer
  builds a menu). File, in order: New, Open…, Open Recent ▸, Open in place…,
  Close (⌘W), Save, Save As…, Save all, Pin version…, Import ▸, Export ▸,
  Integrate…, Create a room…, Bring into a new room… — the same on both
  surfaces. The system's EMStudio menu: About, Check for updates…, Settings…
  ⌘,, Services, Hide, Hide Others, Show All, Quit ⌘Q; on the web, Windows and
  Linux About and Settings are in Help (Check for updates on the desktop only),
  Quit closes File on Windows and Linux. Settings left Edit. The shortcuts are
  read from the same rows. `scripts/check-menu-table.mjs` (114) compares the
  two surfaces per platform.
- **Open Recent everywhere** (MICRO-DOVE-CHI-MENU p.2): File ▸ Open Recent ▸
  (the page's and the Mac's system menu) lists the last 10 files AND rooms,
  each with its folder or «node · room» in small, and «Clear the list» at the
  bottom; it is the same list as the Stratigraphy panel's «Recent»
  (`recent.ts`, which now records a room entered and tells every drawer of a
  change). A recent that no longer exists says so and offers «Remove it from
  the list». The Dock menu is not done: tauri 2.11.5 has no API for it
  (measured). `scripts/check-recents.mjs` (15).
- **«Where you are»** (MICRO-DOVE-CHI-MENU p.3): «Mode» left the top bar; the
  status bar's left label is the one way in (and ⇧⌘L). It says the place in
  full — «On this computer», «On this computer · with Blender», «Room X ·
  em.localhost» — with a green, amber (reconnecting) or red (unreachable) dot.
  Its panel has three sections: the mode (on this computer / with an app / in a
  room); the synchronised apps (Blender: state, `ws://` address, «Find», which
  tries the known ports on this computer); the nodes and rooms (every saved node
  with whether it answers, your access — not entered / entered as declared /
  accredited — and Enter with ORCID / with the node's password, or Leave; the
  active node's rooms under it; «Find nodes», «Add a node…»). A node that does
  not answer says so in one line with «Try again» (it was «the node did not give
  the list: Load failed»). The saved nodes are a list (`sync.nodes`, born from
  `hubUrl`). A room's document is no longer recorded as a dropped file: the
  room is the recent. `scripts/check-dove-sei.mjs` (21).
- **«Who you are»** (MICRO-DOVE-CHI-MENU p.4): the identity label moved to the
  RIGHT of the status bar. Its outline is its state: dashed = declared, solid =
  verified by ORCID, solid with the node's mark ⬢ = accredited on a node; no ◌
  or ✓ beside the name. The tooltip: «Name · iD», the state in one line, the
  legend of the three signs. The panel: the identity with its state; ONE «Verify
  with ORCID» (ORCID directly where this build has a client, through the node's
  ORCID on the web) and «Declare»; the nodes it is accredited on (information,
  «Manage in «Where you are»»); «This computer's identities…»; «Sign out of this
  identity». The node's sign-ins (ORCID through its Keycloak, its password) left
  this panel for «Where you are»; the flows are the same. Browser suite: DC1–DC4
  (menus, recents, where, who); E2.nodepw enters the node from «Where you are».
- **Settings by topic** (MICRO-DOVE-CHI-MENU p.5): General · Identity ·
  Connections · Viewers · Advanced. «Sync» is gone (it mixed the node and
  Blender): Identity holds the ORCID iD, name and surname, with the ORCID client
  id and orcid.org / sandbox in a closed «Advanced»; Connections holds the saved
  nodes (address, Test, Remove, Add) and the synchronised apps (Blender:
  protocol, host, port), and the node operator's orphan assets. No Room field
  and no Sign in in Settings: the room is chosen and the node entered in «Where
  you are». A dev.50 settings file migrates with nothing lost (node → the saved
  list and still active, room, Blender, ORCID client).
  `scripts/check-settings-migrate.mjs` (22), browser suite DC5.
- **Numeric fields as Blender's** (MICRO-DOVE-CHI-MENU p.6, `num-field.ts`):
  one field for the N panel's 3D cursor, the transform (position, rotation,
  scale), the pivot (read only) and the Inspector's 0–1 numbers. Drag sideways
  to change (1 cm, 1°, 0.01 of scale per pixel; Shift fine ×0.1; Ctrl by
  notches of 1 m, 5°, 0.1), the pointer locked and given back; a click without
  a drag types, the value selected (Enter confirms, Esc cancels, what is not a
  number puts the value back); with the mouse over it ⌘C copies, ⌘V pastes,
  Backspace puts the default back; a drag down over X·Y·Z takes the three and
  changes them together. One gesture is one write, one step of undo. Browser
  suite DC6.
- **Check for updates** (MICRO-DOVE-CHI-MENU p.7, desktop only): asks GitHub
  (ExtendedMatrix/EMStudio) for the newest published release of the installed
  version's channel — a dev build sees dev and stable releases, a stable build
  stable ones — and says «X is out · Download» (the release page), «You have
  the latest version», or that GitHub cannot be reached. When the release
  carries a signed update (`latest.json`), «Install and restart» downloads it,
  checks its signature against the public key in `tauri.conf.json` and installs
  it (`tauri-plugin-updater`, `update_install` in main.rs). The release
  workflow makes the signed update archives and `latest.json` when the secret
  `TAURI_SIGNING_PRIVATE_KEY` is present, and builds as before, saying so,
  when it is not. `scripts/check-updates.mjs` (17), browser suite DC7, two Rust
  tests.
- The RM is bound to the epoch only directly (rules 1.6.36).
- `addSubgraph` in a room: the proxies of `3d_obj/` and a shelf promotion are
  shared with the node; a host command's delta is shared in a node room.
- **The Space as a working space** (MICRO-SPAZIO-3D, E.D. 11 October 2026).
  - **Outliner of the Space** (T, or the «+» tab on the left edge): epoch →
    representation models (their versions, the one drawn highlighted) and
    tilesets; epoch → proxies by type of unit; the sketches last. Eye, arrow,
    the 2D glyph of each type; search, «Isolate», «Frame». The selection is the
    app's one; what is open, hidden, not selectable, the width are local
    preferences per person (`emstudio.space3d`).
  - **Blender's navigation** (`space-nav.ts`): the wheel and the pinch zoom
    toward the cursor and the orbit centre goes to the depth of the surface under
    it — on Templu Mare v2, 48 notches from the first frame to under 5 cm from
    the podium, where the old dolly stopped 7.6 m away. Click = proxy, ⌘-click
    (Ctrl-click) = model, right click = their menu («Open the model in soloing»,
    Frame, Isolate, Show in the graph, Select), double click = full detail,
    Shift+B = zoom to a box, Shift + right click = 3D cursor (drawn as Blender
    draws it), Shift+C, `.`/F, Home, T, Shift+A; a trackpad orbits with two
    fingers, pans with Shift, zooms with the pinch (the graph's rule, now
    `wheel-kind.ts`). «Back» knows the Space's views too.
  - **The Space's overlays** in the Overlays menu (view `space`): labels,
    proxies (filled / wireframe), models, tilesets, grid and axes, the epoch's
    box, the selection's outline, gizmo, 3D cursor, sketched objects.
  - **Sketched proxies**: fifteen base shapes (`src/rules/shape_catalogue.json`),
    born at the 3D cursor (Shift+A, the palette) or dropped on a surface along
    its normal; the gizmo (TransformControls) and G/R/S with X/Y/Z and a number.
    «Associate with a unit…» (the units `units_without_3d` lists) writes the glb
    at `proxies/<unit>.glb` beside the em.json (bridge `/fs/write`, level 33, or
    the desktop's fs) or into the room's store by digest, and the chain by
    s3Dgraphy's `create_geometry_proxy` — one step of undo.
  - **The 3D in the graph**: the badge «has 3D» on the units with a proxy (hollow
    for a geometry with nothing in it; an overlay of the graph), a click opens
    the Space on its proxy and «Back» returns; with the 3D nodes shown, proxies
    and models are drawn as computed instances in the paradata groups (rules
    1.6.35, `threedInstances`), a model in N epochs with «×N».

### Changed
- **«Bring into a room…» is s3Dgraphy's engine** (MICRO-PORTA-IN-STANZA-DAL-
  MOTORE, 16 October 2026; «un motore, tre porte»). `s3dgraphy.room_import`,
  through the bridge's new `POST/GET /room-import` (bridge level 32), creates
  the room born with the study's sections, makes the plan, and — after the
  person's choices in the dialog, which stays EMStudio's — sends the files once,
  hosts the resources keeping their path, seats the graph LAST and sets
  `study-access` (`restricted`). EMStudio enters the room after, with
  `connectToHub`, and reads the graph the room holds. Until today EMStudio did
  it itself in TypeScript (its own inventory, uploads from the page, the graph
  seated FIRST through the socket): `candidatesOf`, `buildInventory`,
  `locatorKind`, `resolveLocal`, `sessionLots` (`room-inventory.ts`),
  `seedOpsForContainer`, `seedOpsForStudy`, `studySections` (`rooms.ts`),
  `probeInventory`, `sendToRoom`, `storeBack`, `seatSeededContainer` (`main.ts`)
  are gone.
  - The dialog reads the engine's plan: its groups (`found`/`stored` ↔ «Found on
    this computer»/«Already in the room's storage»), its proposed photo sessions
    (L1, EXIF read by the bridge), and sends back the choices per item, «Move
    here» (after the confirmation that names the rooms), the confirmed lots.
  - A file at home in another room is **hosted here as it is** by default
    (`elsewhere="host"`, the engine's default); «Move here» per file, or
    references for the whole group.
  - A tileset folder goes up as its one canonical **.3tz** (`pack_tilesets`):
    from a room the Space reads the .3tz; a canonical sibling already in the
    graph is used as it is.
  - «Pause» holds the engine between two files or two pieces; the bar moves
    within a file (`hold`, `on_bytes`, s3Dgraphy).
  - The session's token travels in the request body to the LOCAL bridge and
    stays in memory; the journal and the report go in the bridge's state folder
    (`~/.config/emstudio/room-import/`), never beside the em.json.
  - The Files panel's «Upload» goes through the engine's door too (`/room-import`
    step `upload`): the page sends no byte to the node any more.
- **Pack a tileset as .3tz** writes with `dtcstamp.write_canonical_3tz`
  (dtcstamp 0.1.5); `tools/archive_3tz.py`, the third copy of 3D Survey
  Collection's writer, is gone.

### Fixed
- «Viewer e scheda» called every file it could not preview «an image no
  browser draws (TIFF)» — a glb among them; only a TIFF says so now
  (MICRO-OTTIMIZZA-1).
- The epochs' dates made at READING (`ensureAllEpochParadata`) had a fresh UUID
  at each opening: the same file gave 9 new nodes and 15 edges every time on
  Templu Mare v3.2, and a second «Bring into a room…» seated them again. Their
  ids are derived from the epoch's now.
