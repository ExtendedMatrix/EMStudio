# Changelog

Notable changes to **EMStudio**, newest first. Until 16 October 2026 they lived
only in the commits and in the reports of each MICRO; this file started with the
first change that asked for one. What EMStudio became before that day, from its
first commit (11 July 2026), is reconstructed from the commits and the MICRO
reports and grouped by stage, at the end of the file («Before 16 October
2026»).

## [Unreleased]

### Added
- **The files of a room are seen: photos with the token, type from the
  media_type, GeoJSON plans in the Space** (MICRO-FILE-DELLA-STANZA, 27
  November 2026; EMStudio#2, PR #3 by Enzo Cocca). A file another tool uploaded
  to a room (`s3dgraphy.room_import`, pyArchInit's «Send site») has
  `data.url = …/v1/rooms/<room>/asset/sha256:<hex>`: no extension, and the node
  answers only to the token. Enzo's PR (cherry-picked with his authorship):
  previews of the connected node's store fetched through `nodeAuthFetch` and
  shown from a blob URL (`isNodeAsset`, `nodeAssetBlobUrl`) in the Inspector
  strip, the media strip and the image viewer. Then: what a file IS is read
  from the graph — `data.media_type` → the extension of the node's `name` → the
  leaf of a locator in `data.addresses` → the extension of the url (new
  `file-type.ts`, `typeKeyOf`), in `unit-images.ts`, `media.ts`,
  `viewer-node.ts`, `paradata-inspector.ts`, the Viewer window
  (`storage.ts collectionFromUrl`, which also fetches a store file with the
  token now), `is3dDocument`, `docText`, «Link by name». A room's GIS layer
  goes to the bridge through its cache by sha256: the page asks
  `POST /gis/store?sha256=&ext=` (empty body), and only when the bridge does
  not have it fetches the bytes with ITS token (node-road) and hands them over;
  the bridge checks them against the sha256, keeps them in `~/.em_cache/gis`
  (`EM_GIS_STORE_DIR`) and `/gis/features`, `/gis/raster-grid`,
  `/gis/surface`, `/geo/raster-preview` read from there with the pipeline of
  always (EPSG:3004 → the scene's CRS). No token reaches the bridge, no
  temporary file per view. Bridge level **97**. New
  `scripts/check-room-files.mjs` (36, a real bridge included) and
  `scripts/check-room-files-live.mjs` (13, on the dev stack: a room made by
  `room-import`, the Inspector, the viewer, the plan drawn and reprojected,
  the second opening from the cache).
- **Opening a file with more than one graph says so** (MICRO-PG1, 27 November
  2026; EMStudio#1). A site is one graph; an em.json with more keeps them as
  different studies, and the ones that are not active became slots with
  nothing to say they were there. At the open: «This file contains N studies:
  you will find them in the Multigraph panel», with «Open Multigraph» (the
  panel, `openEMTree`), in every language of `i18n.ts`; nothing for a file
  with one graph. It replaces B10's toast (that sentence stays in the Log),
  comes after G5's «empty graph» question and counts what is left; a room's
  reconnection keeps B10's toast. New `scripts/check-multigraph-notice.mjs`
  (19, a container of 3 graphs with an id `Scavo archeologico|II`).
- **Gaussian splats as representation models** (MICRO-PX7 B, 27 November
  2026; PX5 A–E). Gaussian Splat Lite 1.11.0 and
  `3d-tiles-rendererjs-3dgs-plugin` 0.3.1 (William Liu, Apache-2.0, exact
  versions; NOTICE and third-party licences in `docs/third-party/`), loaded
  lazily: on the web `splat3d.js` beside the page (three, and three's core
  under `three/webgpu` / `three/tsl`, taken from `engine3d.js`), inlined in the
  desktop's single file as three is (+2.5 MB, +36 ms at start). A splat RM is
  an RM: its document, its epochs, its pose and frame, the Outliner's eye, the
  models' opacity, saved with the study. Forms: PLY (3DGS; a mesh PLY refused
  with the reason), SPZ, SOG, RAD as one model; RAD with LOD, SOG
  `lod-meta.json`, LCC2 streamed by GSL's schedulers (a second kind of
  streamed RM beside the tilesets); a 3D Tiles tileset of splats
  (`KHR_gaussian_splatting`, read in its `tileset.json` before the layer is
  made) in a folder or in a `.3tz`. ONE `GaussianSplatRenderer` per scene. The
  door takes `.spz`, `.sog`, `.rad`, `.lcc2` and a SOG `lod-meta.json` as
  models (s3Dgraphy `door.kind_of` the same). **The clicks**: a point on a
  splat is where the alpha of the first Gaussian crossed reaches 0.5 (GSL's
  raycast, `minRaycastOpacity`, EMStudio's threshold set on every splat),
  measured against the mesh of the same object: 0.2–0.4 cm (median) on a
  clean splat, 1.5–2.7 cm on a noisy one; its extractor says so
  (`pick_rule` `splat_alpha_isosurface`, `pick_opacity` 0.5 — attributes, no
  new type). «Wall from plan», «From elevation», «Seven-point box» and
  «Alignment» work on splats; «Annotate surface» refuses a splat and proposes
  the mesh or a plane fitted by «From elevation». A single file has no levels
  of detail: from afar its splats under a pixel are not drawn (GSL's 1 px kept:
  0 or 0.5 brought 3.3 M splats seen from afar from 60 to 13 fps); its streamed
  forms keep coarser levels. `scripts/check-splats.mjs` (67).

### Changed
- **three.js r187** (MICRO-PX7 A, 27 November 2026): `three` 0.185.1 →
  0.187.0 and `@types/three` 0.185.4 → 0.187.0, exact versions;
  `3d-tiles-renderer` 0.5.3 and `3d-tiles-renderer-3tz` unchanged. The step
  the Gaussian splats need (`3d-tiles-rendererjs-3dgs-plugin` 0.3.1 and
  `gaussian-splat-lite` ≥ 1.6 ask three ≥ 0.187.0). Read in the notes of r186
  and r187: of three's exports only `CubeUVReflectionMapping` is gone (unused
  here); `Object3D.dispose()` only fires an event; no custom Object3D class,
  no `setViewport`/`setScissor` on a render target, no PMREM. The one change:
  the Draco loader no longer calls the deprecated `setDecoderConfig` (wasm is
  its own default; the call warned on every page and goes in r194). The
  Space on TempluMare (meshes, the 2015 `.3tz`, 13 proxies) draws as on r185:
  35 picks of 35 identical in three views.
- **Groups that stay where they are dropped, and a more compact layout**
  (MICRO-Q-GRUPPI-E-LAYOUT, E.D. 17 November 2026). *The cause of the return*:
  a group's drop wrote its move only into the archival layout
  (`layout.positions`, `moveNodesBy`), four times (once per pass of
  `settleDropped`), while the Matrix draws its view layout — the group was drawn
  at its old place at once, and reopened elsewhere. Now the move goes to both by
  the same delta, and the group is FIXED in the same step: `layout.pinned` (the
  lock nodes already had) with its and its members' Rects in `layout.positions`
  as drawn. em-core keeps a pinned group rigid at its sketch Rects and makes
  room around it: the first block of each lane that meets it, and everything
  right of it, goes right; inside an open group its siblings first, then the
  grown group in its lane. A group dragged into another band is moved, not
  re-dated (no lane lit): out of its epoch's band its border is dashed amber and
  its tooltip says so. «Riordina il gruppo» (its menu) frees it, «Riordina tutto»
  frees every fixed group; undo/redo. In the Graph a group's disc carries its
  members (hand positions, one undo step — the view history carries the
  Graph's positions too). The layout (em-core): the pieces of a lane packed
  bottom-left on a skyline (they were on next-fit shelves) up to the drawing's
  width (second pass), a group's over-wide row folded to about a square of its
  content, From-Sketch too (USM487 of the Basilica: 352 SF on one row 42 238
  wide → 2 754), group walls/title 14/28 → 12/26 (what the Matrix draws) and lane
  insets 24 → 16. Basilica: drawing 712 → 80 Mpx², edges −42 %, crossings −5 %;
  v10: 11.0 → 9.4 Mpx². Sweeps From-Sketch, node gap 24 and layer 32 measured
  and refused. `layout_snapshot` re-blessed (pads and insets only).
  «Applica a tutti i grafi del file…» in the card «Georeferenziazione»: a
  summary graph by graph (now → after, «verrà sovrascritto» on another system),
  a confirmation, ONE undo step across the graphs' stores
  (`DocumentStore.linked`), a Log line on each GeoPositionNode; the values copied
  into each graph, none on the file. `scripts/check-group-pin.mjs`,
  `check-georef-card.mjs`, `crates/em-core/examples/layout_metrics.rs`.
- **The georeference, visible and editable, per graph and per model**
  (MICRO-P-GEOREF-PER-GRAFO, E.D. 17 November 2026). The card
  «Georeferenziazione» (⌖ in the Space's bar, File ▸ Georeferenziazione…, «Apri
  nella scheda» in the GeoPositionNode's Inspector) edits the GeoPositionNode of
  ONE graph of the active file — the file's graphs listed, each with its own
  system; nothing is written on the file or on all graphs. One field «Sistema di
  coordinate» (a code, or words of its name: `/geo/crs-search`, «Stereo 70» →
  3844), shift X/Y, the azimuth and its north (grid/true), Z shown 0 and fixed;
  «Non georiferito» + «Georeferenzia questo grafo» (no system: never 4326). The
  models (RM, RMDoc, tilesets): «come il grafo» (no frame: it follows) or «sistema
  proprio» (`data.frame` on the RM, the tileset's asset), labelled «nel sistema
  del grafo» / «…shift proprio» / «riproiettato da EPSG:x» / «locale, non
  georiferito»; a mesh in its own frame hangs from a parent holding the
  transform (same CRS: the shifts' difference; another: `/geo/frame-fit`, PROJ's
  points fitted, «convertito da … a …»). The datum operation is said only when
  two models of the Earth meet (else under «Avanzate»): PROJ's operations with
  their accuracy and area (`/geo/datum`), the best at the site preselected and
  written only by a choice, a declared one whose area is not the site said.
  Every change one undo step, a Log line on the node (its history). Values back
  to the saved ones (out of a room): the GeoPositionNode as saved, its clocks
  too — the save identical to the byte. The GeoPositionNode's Inspector edits
  its data with the card's controls. Bridge level 74.
  `scripts/check-georef-card.mjs`.
- **Three corrections of E.D.** (MICRO-C-CORREZIONI-ED, 14 November 2026).
  `provenance.ts › unitLife` reads «real» from the node datamodel's `family`
  (`rules.unitFamily`), as s3Dgraphy: SF, RSF, USD, USN… without a continuity
  are still existing. **The limit of an epoch is not an end**: the Inspector's
  «Proprio / ereditato» rows say «limite dell'epoca: 199 · da II A.D.» and the
  end of a unit «vive nell'epoca II A.D.», «chiusa nell'epoca 2013, data della
  fine non indicata», a bare year only for a real date; the same in the
  tooltips, the Tabular («limite dell'epoca X») and the «Cronologia calcolata»
  rows («limite dell'epoca II A.D.»; a TPQ / TAQ says where it was born, «TAQ ·
  is_after USV101 — limite dell'epoca II A.D.», s3Dgraphy's `end_root`); a
  catalogue is not closed by its epoch's end. **«Visibilità ▾»**: no eyes of a
  view — the Outliner's eyes reach every view; «Personalizzata» is only the
  view's filter by categories (a checkbox chooses it), «Segui l'Outliner» no
  filter; what the filter hides and the Outliner shows is said in the view's
  line, «nascosti da questa vista: Modelli RM (10) · Segui l'Outliner», one
  click. **«Rilievo acquisito fuori dalle date del suo documento»**: the date a
  model was MADE (the capture acquisitions up its DTC chain,
  `acquisitionDates`) against its Document, silent without one, no cure of its
  own. `check-provenance.mjs` compares `bound`, `limit_of`, `real`, `end_kind`
  with s3Dgraphy (15 320 ✓); `check-space`, `check-outliner-tree` updated for
  the finds still existing.
- **Documents and media: the strip, the image viewer, the catalogue**
  (MICRO-B-DOCUMENTI-MEDIA, E.D., 14 November 2026). New `media.ts` (the page's
  reading of s3Dgraphy's `resources.sets`, `catalog`, `media_roles`:
  `check-media.mjs`, 37 checks, PARITY with s3Dgraphy on a lapidary built in
  Python) and the implicit members in `resources.ts` (`memberRows`,
  `addMembers`, `removeMembers`, `materializeMember`, `rowsDigest`; a listed
  member is a file of its set). In EVERY node, right after its title and
  description, a STRIP of thumbnails with the count, the frontispiece first
  (supersedes the grid «Immagini dell'unità»: its «Aggiungi immagini…» and
  «Collega per nome…» stay on the strip); its click opens the IMAGE VIEWER in
  the right sector under the Inspector, a Viewer window that detaches like any
  window: mixed types (photographs, a PDF's first page, drawings, models as a
  glyph), «nel documento D.xx» or «non censito» and the role on each, a tree
  by folder / group / role, the filter on the unit selected, ⌘/⇧-click, «Assegna
  a / Togli da <unità>», «Fai un gruppo…» (a logical group with a role of the
  vocabulary or a new term of the project), «Dai un nome…» (the file becomes a
  node), «Censisci come documento…», «Colloca nello Spazio» (an RMDoc at the 3D
  cursor, for a document and its sub-resources); one undo each. Thumbnails of
  the files that are not nodes from their locator and sha256 in the cache
  shared with EM Tools, lazy and queued, asked only when their cell is in its
  box (a fast scroll through 3.000 files asks ~40, not ~900). A catalogue says
  its state and counts in the Inspector and the viewer (open: live; closed: its
  stamp) with «Apri il catalogo…» / «Chiudi il catalogo…». Archive › Documenti:
  the documents and their sets as a tree (category → piece), the sets not
  censused at the end. `provenance.ts` reads the level `set`; the Inspector's elements of a node skip a
  set's list of members and a catalogue's stamp and say a role by its label.
  Datamodels synced (nodes 1.6.46, connections 1.6.55).
- **Own or inherited, and from which node** (MICRO-A-PROPRIO-EREDITATO, E.D., 14
  November 2026). New `provenance.ts`, the page's reading of s3Dgraphy's rules
  (`resolvers.provenance`, `unit_life`, `attribution`; `check-provenance.mjs`:
  15 313 comparisons on Templu Mare v10, every node × start, end, author,
  licence, embargo — value, level, origin node —, every life, every attribution,
  the redundant edges, the dating warnings). The Inspector of EVERY node has
  «Proprio / ereditato»: the own value in plain ink, the inherited one in orange
  with «da <nodo>» and «via <nodo>» (a click goes there), «Rendi proprio…»
  (copied on the node after a question, one undo; none where it cannot be: a
  servile's date, a unit's end, an edge the datamodel refuses), the ACT of an
  extractor / a combiner (`data.act_start`, «non indicato» when not said); the
  funnel's rows (activity tier, PDG members) are gone, the bridge's TPQ/TAQ stay
  under «Cronologia calcolata». Its «Epoche»: a servile node (paradata group,
  property, extractor, combiner, proxy, annotated region) shows its master's
  epochs, inherited, without Move / Extend; a unit the epochs of its LIFE
  (continuity rule, read-only, with «perché»: «viva da II A.D., nessun continuity
  → still existing»); the epoch edges the rule makes redundant are said, with
  «Pulisci» (a preview, one undo). The same words in the Tabular (Units and
  Documents: Start, End, Author computed, inherited in orange with «da …») and
  in the inherited badges of the Matrix and of the scene. The Warnings table:
  rows «proprio / ereditato» (redundant, out of step, contradicting — never
  cleaned by themselves) with «Pulisci (n)» in bulk, rows «datazione» (a survey
  dated otherwise than its document → «Sposta nell'epoca del documento», a
  container member outside it → «Segui il container», a node drawn in a lane
  that is none of its epochs → «Layout»). M / Alt+M exclude the servile nodes
  and say whom they follow. A unit is where its life is: the Outliner, the
  scene's counts, the Tabular by epoch (`epoch-presence.ts`) and the Graph's
  epoch filter (every node by its epochs of attribution, own or inherited).
  The Outliner paints the epochs' colours only when organised by epoch
  (`TEMPORAL_HIERARCHIES`, ready for computed horizons). «Visibilità ▾» of
  each 3D view opens with «Segui l'Outliner» / «Personalizzata» (the
  Outliner's eyes reach it or not; the window's state). Datamodels synced
  (nodes 1.6.45, visual rules 1.6.46).
- **The clear touches of the dev.123 trial** (MICRO-RITOCCHI-CHIARI, E.D., 14
  November 2026). The search of every window is a FIELD in its head, always
  there, grey «Cerca / Search», typed into directly («/» focuses it, Esc empties
  it), narrowing in a tight head instead of turning into an icon; where a window
  has its own field in the body (Tabular, Files, Shelf, the index, the graph's
  strip) the head's writes into it. The Inspector's WARNINGS fold with their
  triangle; the Warnings table picks rows (a box, a group's box, all on screen,
  ⌘/Shift-click) with verbs over them — «Assegna autore…» to the extractors
  picked (preview, «replace» or add, one undo), «Seleziona nel grafo».
  «Extractor without author» only when no level answers: an extractor inherits
  its epoch's or the graph's author (s3Dgraphy's author rule; on Templu Mare v10
  36 hints → 0, `check-author-scope`). A 3D extractor with a POINT anchor moves
  in the Space: selected, G or a drag of its label, Ctrl onto the surface under
  the pointer; ids and edges kept, the reading read again, one undo. The
  Outliner's rows as Blender's: the marks in one column, then fixed columns
  right-aligned with a heading — ↖ selectable, ◉ visible, 🔒 position locked
  (no G / R / S, the N panel's fields read-only; a local preference, never in
  the em.json) — and each epoch's branch on the colour of its Matrix band. In
  the Graph the Epochs family switches the epoch discs and their edges off (in
  the Matrix the lanes stay). «Estrattori 3D» off in «Visibilità ▾» takes their
  marks out of the scene (the marks' memory answered first), each 3D view with
  its own. One order for every list of epochs, the Matrix's: newest first, the
  phases of a mother too (the 3D's menu listed 2013 before 2015).
- **One place to switch the 3D's categories, the same head in every window,
  the epochs in the Space** (MICRO-TESTATE-COERENTI, E.D., 13 November 2026).
  «Visibilità ▾» in the 3D window's head is the ONE place of the categories
  (Modelli RM, Tileset, RMDoc, RMSF, Proxy, Abbozzi, Estrattori 3D, Territorio /
  GIS with EPSG and the GIS import), with counts, opacities, Tutti / Nessuno; the
  button says «Visibilità · 1 spenta»; the «Livelli della scena» panel is gone,
  the Overlays keep guides, texts, decorators and ways of drawing; the globe's
  chip opens Visibilità instead of switching the territory. Rows of a category
  off are attenuated in the Outliner with a ⊘ that turns it back on (the scene's
  line too). Every head in one order — [type ▾] [+] [?] [context] … [Visibilità
  / Filtri] [🔍] [⋯] [⛶] — by the controls' roles; the search of each window in
  its head (🔍, «/» with the pointer on the window, Esc), the Inspector's
  included. An epoch change never moves the camera (`frameOnArrival` of
  MICRO-SPAZIO-CONTAINER removed; «⤢ inquadra» offered when the camera sees
  nothing). The units of an epoch are born ∪ survived, a mother with its phases,
  in the Outliner, the scene, the counts and the table (`epoch-presence.ts`,
  checked against s3Dgraphy). The Outliner no longer calls RMDoc an RM published
  by a document. The Inspector's «Tipo: RM · RMDoc · RMSF» (criterion from the
  datamodel, preview of the edges, one undo). A container lies where it
  DECLARES; a member with its own epoch is attenuated under it with «Segui il
  container». «Sposta in epoca…» (M) / «Estendi a epoca…» (Alt+M) on any
  selection, from the keyboard, the Outliner, the Matrix/Graph and the table,
  s3Dgraphy's plan shown first. The card «Completa il container» (four bonds,
  suggestions, Accetta tutti, change after). The Graph view draws epochs and
  groups as discs and the members of folded groups; files with no resource are
  drawn. Bridge level 69. Checks `check-epoch-presence`, `check-graph-families`,
  `check-headers` (new), `check-outliner-tree`, `check-liquid` (updated).

- **The images of a unit, the campaign as a document, the documents in the
  series, the tight frame of a tileset** (MICRO-FOTO-DOCUMENTI-BBOX, E.D., 13
  November 2026). The Inspector's «Immagini dell'unità» follows the four roads
  the datamodel has (`unit-images.ts`): linked to the unit, from a document of
  it, from the sources its readings read (a campaign gives only the photo a
  reading looked at), illustrating a property — grouped with a line that says
  where they come from, each picture once (its checksum); lazy thumbnails, four
  at a time, from the cache SHARED with EM Tools (bridge `GET /fs/thumb`, level
  68: `~/.em_cache/thumbs` or `EM_THUMBS_DIR`, sha256 key, PNG fitted 256 px —
  the same bytes EM Tools writes). A click opens the Viewer on the unit (its
  images with ‹ ›). «Aggiungi immagini…» (a picture or a folder, stamped, the
  same bytes reused) and «Collega per nome…» (`T15_*.jpg` → T15, EM Tools'
  rule; the ambiguous listed, never chosen; one undo step). A file of a
  campaign linked to a unit enters the unit's own resource «T15 · foto» — the
  SAME file node. The Viewer opens a document of many pictures on its grid,
  grouped by folder › sensor › date; with a unit selected (the Viewer pinned)
  «solo le foto di <unità>», the others in grey, ⌘-click to select, «Assegna a»
  / «Togli da», and a pointer drag of a photo onto a unit (Outliner, Inspector).
  A document named outside the series D.nn is said («documento con nome fuori
  dalla serie D.nn — proposto: D.115»: its `former_name` when free, else the
  first free D.nn); «Rinomina…» / «Rinomina tutti» with a preview, its
  extractors following when they read `<documento>.nn`, the old name kept in
  `former_name`, one undo step. A tileset is framed on its CONTENT's volume
  (`root.content.boundingVolume`, else the first level of children that has
  one; Metashape's cubic root only as a last resort), its corners carried into
  the world before the box. Checks: `check-unit-images.mjs` (new),
  `check-naming.mjs` (documents into the series).

### Changed
- **The Outliner by epoch, an object in more epochs, the «?» readable**
  (MICRO-OUTLINER-EPOCHE-TOOLTIP, E.D., 13 November 2026). By epoch, a
  container is a branch (epoch → container → its alternative, marked, and its
  members); a model in a container is not listed again under the epoch; a
  member living in another epoch says where (a chip and its tooltip); a
  container out of step with its reference (s3Dgraphy's `container_epoch_check`)
  shows ⚠ with «Align the members' epochs…». A row dragged onto an epoch MOVES
  it, with Alt EXTENDS it (a line under the epoch and a label say which; with
  the pointer, not HTML5 drag and drop); the Inspector's «Epochs» has «Move
  here», «Extend here too», «Remove from here». A container acts on all its
  members, with a preview and one step of undo. The edges are s3Dgraphy's
  (`epoch-moves.ts`: a unit's has_first_epoch / survive_in_epoch, a model's
  epoch → has_representation_model). One «?» for the whole app (`help-tip.ts`):
  the text opens beside the glyph at a reading width, stays while the mouse is
  on it or on the text (1.6 s after it leaves), a click pins it until a click
  elsewhere or Esc. In the Space the one Outliner is the scene's view: arrow,
  level chip and menu, the container's alternative, the failed mark, Isolate,
  Frame, the versions under a model, the 3D extractors under their document
  (a ghost, eye forced, when the document is not lit; their marks in the
  scene), the sketches at the bottom with their menu; the old panel behind T
  says it is retiring. `check-epoch-moves` (new), `check-outliner-tree`.
- **The Narrative's menus, inside the screen and in order** (MICRO-NARRATIVE-MENU,
  E.D., 13 November 2026). The menu component every «Add»/«Insert» uses
  (`add-menu-ui.ts`): a submenu is measured and opens on the side where it
  fits (right, else left, kept inside the window), as wide as its rows ask up
  to a maximum; a label never breaks inside a word («Matri / x», «T / i.» in
  dev.118) and a description goes to a second line instead of a horizontal
  scroll; the list opens on its first row, whole, under the search field (the
  highlighted row is revealed by its own list, not `scrollIntoView`), and the
  menu is kept on screen again when the search changes its height. The «+»
  between paragraphs: Document and 3D scene on top, then Text (not offered on
  «/», where it did nothing), the five views of the graph and the standard
  blocks IN the list under their labels (no submenus), the gestures, «Or cite a
  node» last. Export ▾ closes on Esc and on a second click; the context menus
  (Narrative and every other `ctx-menu`) stay inside the window, above the
  pointer when the bottom has no room; the Narrative's right click in families,
  «Insert a block after this one…» (it inserted BEFORE, beside «Mention … after
  this block»), a refused item says why; the Index's «Epochs not told yet» no
  longer repeats the same line under each row. New check
  `check-narrative-menu.mjs` (Playwright, a copy of Templu Mare v9).
- **The Space after dev.118, and the containers with their document**
  (MICRO-SPAZIO-CONTAINER, E.D., 13 November 2026). Archive › Assets: asset rows
  are dragged with the POINTER (the desktop shell owns HTML5's drag and drop;
  in E.D.'s dev.118 the 2013 tileset never reached «Survey2013»); on an EMPTY
  container what is dropped enters as a member (an alternative of nothing would
  drop its RM and its epoch), and the dialog says it; «New container…» proposes
  a NEW Document (D.nn, what it documents, date, author) or an existing one, with
  the epoch; a container in no epoch, and a container whose members are in
  another epoch than its tileset or document, say it in one line, with «Give it
  a document…» and «Align the members' epochs…» (preview, then confirmation).
  Space: ONE epoch menu, a tree (epoch › phase); «🌐 Globe» always in the bar,
  with the georeference in its title (CRS, shift, datum declared) or what is
  missing; an empty scene says why in one line (layer off, hidden, replaced,
  file missing, no proxy, a tileset whose root never arrived); the Outliner of
  the Space puts the EPOCH above the 3D's dimensions (Proxies, Models with their
  containers, RMDoc, RMSF, GIS), a row of the 3D selects the object and stays
  (⌘/Ctrl, ⇧ range; its menu: go to the unit, frame, hide, isolate, delete the
  proxies); the sync with the 3D is remembered per workspace; the search field
  is never narrower than its word. Bridge level 67.
- **The Narrative's modules, tried one by one and corrected** (MICRO-NARRATIVE-MODULI,
  E.D., 13 November 2026). Two families first in the «+» (decision of E.D.):
  **Document** shows the thing — its image (IIIF or the file through the
  bridge), its PDF at the page chosen, its text, its 3D models — with the
  citation under it; **3D scene** is space and time, proposed on a container
  (`RepresentationModelNodeGroup`), a document that publishes models, an epoch
  or the whole graph (never the hundred models one by one), computed from the
  graph by the Space's rule (models, the container's active alternative, the
  units' proxies), loaded on demand, paused off screen, its framing (camera and
  a still for print) saved in the block. **Source** is the use of a document in
  this graph (extractors, what they yield, the criticism), no longer a copy of
  Document. The **Matrix of an epoch** has ONE lane: a unit there by survival or
  reuse is marked ↺ with its first epoch (Templu Mare v9, «Post antiquity» no
  longer opens «II A.D.»). The **Table** has a scope (an epoch, an activity, the
  units cited in the chapter or above it), filters, columns and an order, and
  prints as filtered. Chapters are born where one writes («Nuovo capitolo qui»
  in the «+», on a title's right click, in «Narrative ▾»), with their title being
  typed, and are dragged in the page and in the Index. The Index is the list
  with its search, ONE «+ Aggiungi…» and the coverage closed (a count per line,
  the chips one level further); ▲▼ keep its scroll and the chapter selected.
  «Narrates the lane» groups the activities under their epoch. The story has a
  language (`data.lang`, read from its prose when undeclared) the AI drafts are
  asked in; «✓ Ho verificato» on an AI paragraph's badge and «✓ Verifica il
  capitolo (n)» in its bar; an AI paragraph changed after its signature is to
  verify again. The mention has its entry in the «+» and in the right click.
  Exports: the table, the scene's still and the document's picture are figures
  (the document still cited). New check `check-narrative-moduli.mjs`.

- **Several sources open, one active, «Copia in…»** (MICRO-PIU-FONTI, giro B;
  decided by E.D. on 7 November 2026). A local em.json (Save on disk), a room
  (live: no Save) and a room READ from a node (`GET /v1/rooms/<id>/document`,
  read only: an edit is taken back, copied out only) stand side by side in the
  Outliner. ONE active source, changed only with its badge «attiva» (a click on
  another source's rows says where the switch is); each source has a colour and
  the title bar wears the active one's, with «stanza · dal vivo» / «in lettura».
  Between sources one copies, never moves (`source-copy.ts`, pure): a unit
  brings its paradata, group, proxies, documents, resources and files, the DTC
  that made them and their rights; the ids are kept; the epochs by id, by name,
  copied or chosen; collisions show the fields that differ and, apart, the
  relations in more, in less and turned round — the destination wins unless
  chosen case by case; an asset under a running embargo stays out, or leaves
  signalled with its embargo; every node that enters carries
  `data.derived_from` (source, graph, version/cursor/instant). The destination
  «as it would be» must pass the checks (cycles in the sequence,
  contemporaneity, a relation against the epochs, the epochs' own coherence):
  otherwise it is said and not applied. The copy is ONE undo step of the
  destination; ⌘Z acts on the source in front. Fixed on the way: while a room
  was joined, every edit of a LOCAL file was sent to the room (and taken back if
  the room was read-only). The memory guard takes the open sources (documents
  and their undo) off the scene's ceiling. IT/EN. Checks: check-source-copy
  (new), check-memory-guard.
- **One Outliner, columns from top to bottom** (MICRO-OUTLINER-UNICO, giro A;
  decided by E.D. on 7 November 2026). The Outliner (`outliner-tree.ts`, drawn
  as a virtual list by `unified-outliner.ts`) takes the place of three lists —
  the EMTree, the list of the units and the Space's own Outliner — in every
  space: the sources (files, rooms) hold the graphs, a graph holds its
  dimensions as lists (units, documents with their RMDoc, authors, epochs,
  models and tilesets, proxies, GIS layers, paradata, the rest, auxiliary
  files), by epoch, alphabetical or by type; synced with what has a 3D
  representation (the rest grey or filtered; paradata off by default when
  synced); the selection is the app's; the selector and the search in the
  window's own bar. The five spaces are re-seeded (rev 6): the Outliner on the
  left, the Matrix and the Properties down to the bottom, the table only under
  the 3D view. The RMDocs are a layer of their own in the Space. The texts E.D.
  saw (GIS, Snap, Selected object, Level of detail, Temporal bounds, the empty
  Space) stand behind a «?» (`help-glyph.ts`).
- **The value of a property in two places** (MICRO valore-proprietà, decided by
  E.D. on 28 October 2026). `description` (EM's historical place) and
  `data.value`, which mirrors it, are written together by every gesture:
  `DocumentStore.addNode` and `updateNode` complete the other place
  (`property-value.ts`, the same rule as s3Dgraphy's `PropertyNode`), and a
  document is completed in memory on opening — the file changes when it is
  saved. The geometry property and a `data.value` that is a bare uuid keep their
  two places apart. The epoch's temporal properties and the em-data sheet's
  claims (which wrote a top-level `value` that was never saved) write both.
- **Property → document is read from the datamodel** (p.6): connections 1.6.51
  declares `has_documentation` from a PropertyNode read-only
  (`read_only_sources`); `throughExtractor` reads it (`rules.readOnlyEdgeTypes`)
  instead of a hand-written rule, and no menu offers a read-only edge. The
  datamodel sync also brings the site's datamodel (nodes 1.6.39, connections
  1.6.50, visual rules 1.6.41 with the `site` glyph still a draft, qualia
  1.6.10), not vendored until now.

### Fixed
- **Properties and their paradata chain** (MICRO-PROPRIETA-PARADATI, E.D. on
  dev.82, 28 October 2026; Templu Mare v4, SU020, PD_SU020).
  - The Inspector's «Value» reads the value where it truly is, `data.value`
    (s3Dgraphy's `PropertyNode.value`), and the description only when that is
    empty: `construction_technique` of SU020 showed an empty «value…». Read,
    not rewritten: both places are written, together, when the person changes it.
  - What the Inspector adds to a chain is drawn: an extractor, its new document,
    the combiner of a second source had no stored position and the Matrix drew
    only positioned nodes (D.01.61 under `geometry`). They take, for the view
    only, their paradata group's place and are arranged with the others.
  - A **geometry** says its value — its semantic shape, and its file
    («⬡ Shape for SU020 · proxies/SU020.glb»; «— no value» and where the
    readings are, for an empty shape) — in the Inspector, the chain and the
    hover; never an extractor's reading. «Use as value» is not offered on a
    geometry: on dev.82 it overwrote the reference to the shape with
    «height 492.771 m». A reading already copied there is shown, with «Remove it».
  - **Shift+A inside a paradata group** (its canvas, the group selected, or a
    property / extractor / combiner of it) admits the paradata, and the new node
    joins that group; it said «Select a unit to add paradata».
  - **Between a property and a document there is always the extractor**: the
    connector of a property released on a document (or on one of its instances),
    and «Link to an existing one…» → «D.01 — through a new extractor», create
    property → extractor → document, the extractor's name and text asked in
    line, one undo step. The menus no longer offer property → document
    `has_documentation`; the datamodel still admits it (an old file keeps it).
  - `scripts/check-proprieta-paradati.mjs` (45, on a copy of Templu Mare);
    check-interactions `PP.templu` (TEMPLU_V4=<copy>).

### Added
- **Ottimizza, round 2 of 3: a tileset from a textured mesh** (MICRO-OTTIMIZZA-2,
  experimental behind its switch). With the switch on, «Tileset (3D Tiles)»
  joins the destinations of the Ottimizza tab: one or more textured OBJ — or a
  folder of them — chosen in the File window or dragged onto the tab become
  each a tileset. **Obj2Tiles** (OpenDroneMap, AGPL-3.0) is an add-on
  downloaded on request (1.8.0, sha256 pinned per platform; the zip's libktx
  beside it; on Apple Silicon the Osx64 build under Rosetta 2, said, until
  upstream publishes the native one), called as a separate program with our
  preset: `--preset standard --no-zsplit`, the depth from the model's size (a
  leaf near 30 thousand triangles: the medium model of Templu Mare 16 leaves
  instead of the 3.769 files of the default), no root content, the geometric
  errors from the coarsest level's box (`ToplevelBoundingBoxDiagonal`: with
  the default the root said 0.27 m on 15 m and no viewer refined it). **One
  heavy job** (`POST /fs/tileset` plans, `POST /jobs {kind: tileset}` runs):
  its files side by side as long as their memory estimates stay under the
  ceiling (60% of the machine, never past it; a file that alone passes it is
  refused before it starts), each with its row, its progress — Obj2Tiles' own
  JSON lines when the build has `--progress`, else an estimate by phases from
  the lines it prints — and its «Annulla»; a run that writes nothing for 15
  minutes (the stall seen under Rosetta) is killed and tried once more.
  **Cesium's 3d-tiles-validator** (Apache-2.0, an add-on installed by the
  machine's npm, integrity pinned) judges every tileset inside the job, or
  EMStudio's structural check said as such: a tileset that does not pass is
  not packed and never enters the graph. Then the .3tz by the route that
  exists (dtcstamp's writer); the folder stamped as derived from the OBJ —
  stamped, or DECLARED by its name — (`tiling`, Obj2Tiles and its
  parameters, the validator's verdict), the .3tz from the folder
  (`packing`); the .3tz registered as a version of the model (level `tiles`,
  its checksum, `geometric_error_m`, `application/vnd.maxar.archive.3tz+zip`),
  which the Viewer and the Space offer beside the mesh. A tileset that
  RealityScan already made (its `asset.generator`, or the X.json beside X/
  pair) is recognised, packed and stamped as ITS product; the blocks
  `block_xNNN_yNNN` of Metashape + 3DSC for Metashape are recognised with
  their `SRSOrigin`. «Viewer e scheda» draws a `.3tz` or a `tileset.json`;
  in «Manuale» a tileset whose empty root refines by ADD (Obj2Tiles' form)
  now shows its first level (the renderer skipped the children of an ADD tile
  whose error was 0); the canvas of «Viewer e scheda» fits the stage. Bridge
  level 44. `check-tileset-bridge`, `AR11.tileset`, `T1.addroot`;
  `check-files-browser`, `check-geotiles`, `AR7.optimize` follow.

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

## Before 16 October 2026

What EMStudio became between its first commit (11 July 2026) and the day
this changelog started. Reconstructed from the commits and the MICRO reports;
grouped by stage, newest first.

## 9–15 October 2026 — a fast graph, paradata as a view, rooms that hold (v1.6.0-dev.27 … dev.41)

### Added
- **A large document opens in a second** (9 October 2026). Lookups that
  scanned the whole graph indexed once; the canvas draws only what is on
  screen, one path per style. Measured on the GPU at the end of the MICRO
  (with the items below): first draw of Templu Mare v2 1 442 → 382 ms (532 ms
  with the indexing alone); a synthetic 5 000-unit graph from 165 s to 1.7 s,
  and the switch to Graph from 45.9 s to 0.22 s.
- **Layout engine v5: every arrow of the Matrix points down** (G1, 9 October
  2026). Each lane laid out as one compound layered graph
  (`crates/em-core/src/layered.rs`); Templu Mare v2 from 3 upward edges to 0,
  width −17.5 %.
- **The liquid Graph** (G2, G3, 9 October 2026, «a first version, to be
  reviewed with E.D.»): every node a disc coloured by family, ringed by
  specialisation, sized by degree; epochs and groups as halos; a live force
  simulation in a Web Worker. Glyphs of the 3D objects from the datamodel
  (G9), the legend as a floating glyph (G4), right-button pan (G5), the
  Outliner from the keyboard (G6), the EMTree above the Outliner in the
  Stratigraphy space (G7).
- **Properties seen and compacted** (MICRO-PROPRIETA-COMPATTA, E.D. 9 October
  2026): the circle of an edge decided by its arrival, so `has_property` is
  drawn; «Compatta le proprietà» / «Sciogli il gruppo» (Templu Mare v2: 204
  property threads → 5, 670 scene nodes → 301); the warning «one property, one
  owner».
- **The instance is a view** (MICRO-EMSTUDIO-PROPRIETA-COME-FONTE v2, E.D. 9
  October 2026): `paradata-view.ts` computes the instances of documents and
  properties from `paradata_instances` in the visual rules, held equal to
  s3Dgraphy's `all_view_instances`; **«Indietro»**, one stack of views (⌘[,
  ⌥←); «Prendi da un'altra proprietà…»; before removing a node s3Dgraphy is
  asked who leans on it — «Elimina lasciando la traccia» or «Elimina a
  cascata».
- **The paradata chip and the document's epoch** (MICRO badge PD e
  cronologia, 9 October 2026): the chip at the bottom right, click to solo,
  Shift+click to open in place; a document stands in the epoch of its date; a
  property's readable label beside its technical name.
- **The Overlays menu** (MICRO sovrapposizioni, 9 October 2026): the twenty
  badges and marks drawn over a node, inventoried in `overlays.ts` and switched
  one by one.
- **The study, its place, its code** (10–11 October 2026, E.D.): the trench is
  a study, the site is topography, HC1 is heritage where it is recognised;
  the study's code **proposed and confirmed**, never derived, carried in the
  graph's header at every save; the relations between graphs shown.
- **The author in time and no automatic arrangement** (MICRO-AUTORI-LAYOUT,
  E.D. 11 October 2026): an author's master in the epoch of its date, its
  instances where it is cited; **a node moved by hand stays where it is left**;
  ⌘N, ⌘S, ⇧⌘S in the desktop's File menu; «⊞ Layout» on the graph window's
  bar; the graph's own paradata out of the Matrix into a new «Multigraph» view
  where every open graph is a node.
- **Storage and Shelf from s3Dgraphy's rows** (11 October 2026): search, kind,
  use, versions under their master, «Find moved files», a bucket check,
  verified upload, freeing the disk copy; the Shelf's «Resources» mode, one
  table for the resource nodes of every graph of the em.json.
- **A release opens EMStudio in a real browser before it tags** (13 October
  2026): `check-apertura.mjs`, after dev.36 went out green and opened as a dead
  page.

### Changed
- **A place is not a band of time** (s3Dgraphy#25, E.D. 9 October 2026): a
  LocationNodeGroup is not laid out in the Matrix and `is_in_location` is
  neither membership nor a lane path — on Enzo Cocca's demo site one such edge
  had put every unit in the first lane. `extracted_from` towards a unit is
  allowed.
- **Rooms that hold** (MICRO tavolo-convergenza, 12 October 2026): the work
  done without network stays and leaves when the room is back; a remote op
  goes through the comparison; ties and clocks as in s3Dgraphy (milliseconds);
  **a viewer reads** — writing gestures off, a write that slips through taken
  back; in a room an undo is an operation. A node born in a room is signed by
  who entered the node.
- **A room's bytes by path and digest** (13 October 2026): the 3D scene asks the
  room's store with the signature, whatever host wrote the url; the Space reads
  an edge's tombstone in `attributes.removed` and asks again for a refused or
  missing file when the graph changes.

### Fixed
- An em.json given to the desktop app opens, and a taken port 8765 is said
  as such (s3Dgraphy#25, Enzo Cocca on dev.26, 9 October 2026).
- A room link opens the room in the session that is there (13 October 2026).
- The bar's first drawing no longer reads the token before it exists — the
  dead page of dev.36 (13 October 2026).

## 2–8 October 2026 — files, stamps and rooms in earnest (v1.6.0-dev.15 … dev.26)

### Added
- **New warnings** (2 October 2026): two documents on one file, a double
  slash, a graph not georeferenced, a resource declared missing; s3Dgraphy's
  own warnings through the bridge's `/validate` (licence, a download without
  origin, georeferenced by camera GPS), shown last so they never renumber a
  row on screen.
- **The DTC read as work is done** (2 October 2026): an acquisition of many
  files as one block, processes by technique, lanes by step, the two events of
  one lot kept apart and linked; a download requires «from where?».
- **DosCo** (2 October 2026): the ids two files share and the files without
  one after a scan; «Scan as DosCo» on a Storage folder; a document's
  `/DosCo/` image shown in the Doc; the file and its DosCo id asked of
  s3Dgraphy through its public seam.
- **Each file with its own graphs** (2 October 2026): every graph's layout in
  its own section of the container, the EMTree by file, each file saved with
  its graphs; Settings › Sync split into «Your StratiGraph node» and Blender
  sync.
- **Sign-in from the desktop** (3 October 2026): the system browser, answers on
  the app's own scheme, ORCID and the node by deep link or pasted.
- **«Open with…»** on a node: StratiField's US sheet, Blender, Heriverse (3
  October 2026).
- **The bar in four zones** (3 October 2026): where you work, who you are, the
  message, Log and Warnings; the connection panel lists the node's rooms; one
  file per room (a second snapshot replaces the copy).
- **Bring a graph into a room with its resources** (3–5 October 2026): an
  inventory in four groups, uploads in resumable pieces with pause and resume,
  store-backed nodes that keep their origin; «Move here» for a file kept in
  another room; photo lots proposed with thresholds in Settings (30 minutes,
  5 photos). Then the **whole study**: the room born with every graph, every
  operation naming its graph, a graph the room refuses said by name (5
  October); the Multigraph tab renamed «Full graph».
- **The room's operations on the Sidecar too** (4 October 2026): one
  translation at the door, twin of s3Dgraphy's `ops_for_local_change`.
- **Where each file is** (4 October 2026), with s3Dgraphy's one resolver: a
  section at the head of Contents with the common signs, a filter per state,
  the same line in a resource's Inspector and a document's card; a room's
  files cached on this computer by sha256; «New EM project» and «Reorder by
  the EM standard» with a preview.
- **Choosing the node** (4 October 2026): this computer, the local network,
  saved and typed nodes with the same finder as EM Tools; a personal node
  turned on and opened to the network only on an explicit yes.
- **Links that land on a node** (5 October 2026): `stratigraph://open` takes
  `&node=<id>`; EMStudio selects and centres it once the room or the study is
  open (measured: EM Tools' «Edit USM02» opens on USM02).
- **A unit's images and alternative labels in the Inspector** (5 October
  2026), as EM Tools' Stratigraphy Manager shows them; the search ranks a unit
  by its other labels.
- **Versions in the Space** (6 October 2026): `asset-versions.ts`, s3Dgraphy's
  `choose_version` in TypeScript on a shared table of 19 cases; the glTF
  version a scene should load instead of the `.blend` master, its bytes by
  digest from the room or through the bridge; tileset versions drawn; Draco
  decoder. Measured on Templu Mare v2: 87 of 87 models and 11 of 11 tiles.

### Changed
- **GraphML is read once and never written again** (E.D., 4 October 2026):
  after the import the desktop proposes `<stem>.em.json`, the graph then
  belongs to that file; the GraphML export button is gone.
- The node's access renewed in one place (`nodeAuthFetch`), a node selected
  elsewhere framed in the graph (5 October 2026); leaving a room empties every
  window (6 October 2026).

### Fixed
- A GeoPositionNode without an EPSG is read as not georeferenced, never as
  WGS84 at the shift (2 October 2026).
- `last_editor` says the EMStudio version that wrote the file, not 0.1.0; a new
  graph nobody touched gives its place to the next open (2 October 2026).
- SQLAlchemy no longer installed for the GraphML import (2 October 2026).

## 28 September – 1 October 2026 — the desk: one studio, touched like Blender (v1.6.0-dev.12 … dev.14)

### Added
- **German locale** and new qualia (`feature_shape`, `boundary_distinctness`)
  (28 September 2026); a canonical edge-spelling normaliser.
- **The skin of the desk** (PELLE, 28 September 2026). The Extended Matrix
  design system's tokens (ultramarine, ochre for selection and focus), Sora and
  Comfortaa vendored (OFL), one canvas typography helper, glyphs rasterised at
  the size they are drawn, the chrome redone.
- **The structure of the desk** (STRUTTURA, 28 September 2026). One workspace
  «Studio» (Outliner | Matrix | Inspector) with the Outliner by epoch, the
  window header, **the corner gesture as in Blender** to split and join, rounded
  windows, the name bar with full-text search, the table window, one model of
  the warnings shown in three places.
- **Add at the cursor, as in Blender** (SHIFT-A, 29 September 2026). One «Add»
  menu reached by Shift+A, a right click on empty space, the «+» of the graph
  window or a long press; an edge dragged into the void opens it with the edge
  already chosen. **The node palette is gone.** The document box follows the
  EM3 rule; glyphs from paths.
- **Touching the drawing, not the box** (TOCCARE, 29 September 2026): one
  geometry for what is seen and what is hit; a drag that always starts, stays,
  and changes epoch in one gesture; the layout that is not felt.
- **Linking and four workspaces** (COLLEGARE, 29 September 2026): link to an
  existing node; **Stratigrafia, Fonti, Contenuti, Narrativa**, one per
  activity; the narrative page as its own reader, blocks and media, the Index
  and its coverage; the legend back beside the graph and the «Collegato a X»
  phrases from the datamodel (LEGENDA).
- **The paradata chain in the Inspector** (CATENA, 29 September 2026): a
  property's card shows document → extractor (→ combiner) → property, every
  link clickable; «+ lettura» asks where from and opens the document window on
  the new reading; a second source creates the combiner `C.<n>` by itself; the
  extractor is named `<source>.<NN>`; AI verification on nodes. Readings write
  a region node, a line or polyline in the document window (LUOGO).
- **The interaction audit and its bench** (AUDIT, 29–30 September 2026):
  `check-interactions.mjs` in a real browser (playwright-core), one case per
  defect, 0/10 at the first run; then focus is sacred, shortcuts have a scope,
  each graph window has its own view, one selection for every panel, empty
  states that speak, one verb per action.
- **The Space** (SPAZIO, 30 September 2026): a workspace «Spazio» with the
  **Scene 3D** window (one WebGL canvas per window, the epoch selector shared
  with the Chronology, RMs and proxies), the service window, the Table's
  sheets; deleting an epoch and moving its content.
- **3D Tiles in the viewer** (MICRO-3DTILES, 30 September 2026):
  3DTilesRendererJS loaded only at the first tileset, LOD sets and the
  threshold for large assets.
- **One way to create a resource** (RISORSA-FILE, 30 September – 1 October
  2026): `resources.ts` mirrors s3Dgraphy's `resources/files.py` (add, files,
  revisions with `was_revision_of`), held to a golden written by s3Dgraphy;
  the viewer chooses the representation offline and online; packing a tileset
  into `.3tz` on the desktop.
- **A datamodel check of EMStudio's own** (DERIVA, 1 October 2026): `npm run
  check:datamodel` against `datamodel.fingerprint.json`, s3Dgraphy's
  fingerprint written beside the vendored copies — a copy edited by hand is
  now said.
- **Translations** (TRADUZIONI, 1 October 2026): TranslationNode support, the
  languages beside the text and the facing text, «da verificare / verificati»;
  `data.lang` written when a node is born in EMStudio; a realigned translation
  is a new one, `was_revision_of` the old.
- **Signing in on the field** (1 October 2026) with the iD and the node's
  password, attested by the node.

### Changed
- The DTC vocabularies unified on the 1.6.22 datamodel (acquisition split into
  capture and retrieval) and the 2D annotator removed; one import door through
  the mapping editor (30 September 2026).
- The chronology asked of the bridge on request (`POST /chronology`); core
  visual rules split out for the deterministic layout (29 September 2026).

### Fixed
- **The test campaign of 1 October 2026** (CAMPAGNA, dev.13 in Chrome on Templu
  Mare and San Pietro di Segni): a multi-file stamp judged by its members,
  never by the door's sha256; from the receipt to the document, the 3D that
  shows; the seal; warnings that correct.

## 23 August – 27 September 2026 — releases, StratiGraph Server and the study (v1.6.0-dev.3 … dev.11)

### Added
- **Release automation with an s3Dgraphy gate** (23 August 2026). `./em.sh
  devrel` bumps the version, builds the four targets in a matrix and **refuses
  to tag** if the pinned `s3dgraphy` is not on PyPI, so the sidecar is
  reproducible; a reusable release workflow and a nightly that calls it; the
  manual built with `-W`. First tag: `v1.6.0-dev.3`.
- **The Mapping Editor** (24–25 August 2026): visual authoring of the mapping
  JSONs of the StratiMiner family over s3Dgraphy's new
  `mappings/authoring.py` (source fields with examples, target catalogue
  resolved to EM node types, allowed edges, validation, `apply` volatile or
  baked); a grouped mapping catalogue. «Import with a mapping» followed (20
  September), with a `mapped_source` auxiliary type and a report of the
  unmatched keys.
- **Browser file staging and storage places** (25 August 2026); the Shelf in a
  Table view with promote (24 August).
- **Georeferencing nodes** (29 August 2026).
- **StratiGraph links and sign-in** (30 August – 1 September 2026). The
  `stratigraph://open?server=&room=` handoff (a link carries a PLACE, never a
  permission: credential parameters are refused), in-app OIDC sign-in with
  Authorization Code + PKCE (S256, the token only in memory), a round-trip that
  opens the current room in the other EMStudio (desktop ↔ web), then **study**
  handoffs beside room handoffs (`studylink.ts`), room creation and seeding,
  «Share room link» (the Members panel of 23 August retired).
- **HDT-O twin attribution** (6 September 2026); the study panel in its own
  window.
- **One surface per window** (12–15 September 2026). A rectangle-based area
  model and one surface contract (`shell/layout.ts`, `surface.ts`); each graph
  window its own canvas and minimap instead of one canvas moved between
  windows. Measured: a focus change wrote three classes and created no
  element, 1–4 ms instead of 94–123 ms. «Hub» mode renamed «Join Room».
- **Stamps and provenance of files** (DTC-EMS 1–3, 15 September 2026).
  EMStudio reads the `.stamp.json` beside the bytes, accepts by digest only,
  climbs the chain, draws the parents it cannot find with a question mark and,
  when found, writes a hint, never the stamp; DTC step composition and the
  ingestion stamp.
- **RM container and DTC device** (16 September 2026): the
  RepresentationModelNodeGroup with `is_in_representation_model_group`, the
  DTCDeviceNode with `dtc_happened_on_device`.
- **A web image** (22 September 2026): a multi-stage Docker build served by
  Caddy (`/` the editor, `/read/` the reader, `/health`), published to GHCR
  with an anonymous-pull test.

### Changed
- **em-server is «StratiGraph Server»** everywhere — docs, UI strings, scripts
  (28 August 2026).
- **The deep-link schemes moved to the plugin and the macOS Intel target was
  dropped** (16 September 2026): dev.9 had produced no binaries because Tauri
  2's `bundle` refused unknown keys; three installers from then on.
- **The DTC chain rule written once** (3 September 2026): the list travels with
  the connections datamodel (`dtc_role: "chain"`, 1.6.13) instead of
  `startsWith("dtc_")` in two views.
- The nightly schedule disabled (31 August 2026); parser-based guard checks for
  the front-end scripts (6 September 2026).

### Fixed
- Focus-parity layout drift (31 August 2026); the declared exceptions of
  `check-focus-parity` indexed by identity, not by line (PARITY, 15 September
  2026).
- Study link handling, sign-in and IdP parameters stripped from the URL (1
  September 2026).

## 1–22 August 2026 — from editor to studio: narrative, windows, rooms (no tags)

### Added
- **The Log panel and a layout snapshot test** (2 August 2026): an activity
  trail and the document's diagnostics; a deterministic layout regression
  test.
- **The narrative** (2–20 August 2026). A reader and an editor of
  NarrativeNode chapters with embeds; AI authorship of a passage and LLM
  drafting, with keys in the system keychain (session keys in browser dev
  mode); then (DP-79, 15 August) real embeds — matrix, timeline, table,
  paradata, scene — a standalone **dissemination reader** (`reader.html`) and
  narrative export; Word (`.docx`) export with figures, SVG map and timeline
  figures (20 August).
- **3D, georeference and a map** (3 August 2026): a 3D viewer and resource
  previews, georeferencing, a lightweight OSM map; PROJ data fixed in the
  frozen binary. A native glTF viewer for 3D embeds followed (15 August).
- **StratiMiner in EMStudio** (SM1, 3 August 2026): from a folder of sources to
  `em_data.xlsx` to an em.json, through the bridge. The report found that the
  XLSX importer minted random UUIDs, so the second step was not deterministic.
- **The EMTree and the interface languages** (4 August 2026): a multi-document
  workspace (one slot per open document, its own view state) and the i18n
  layer; datamodel translations (8 August). On 21 August **English became the
  default UI language** and the hard-coded Italian strings went into `i18n.ts`.
- **Reading aids on the canvas** (5–6 August 2026): theme, naming rules,
  authors and licences as badges, the **Data funnel** and PDG tablets,
  auxiliary files (AUX, AUX2: volatile mapped files), the EM-Data dock with a
  tabular editor.
- **LinkNode renamed ResourceNode** (7 August 2026); graph-scope paradata
  (MIG1-A, 8 August); a graph-level site position with a map picker; recent
  files and the short native extension `.emj` (QOL1, 8 August).
- **Windows** (WIN1–WIN7, HDR1, 8–9 August 2026). A workspace leader bar and a
  window model (graph, narrative, table, doc), a window header whose dropdown
  transforms the window in place, a per-instance camera and mode, DTC as a
  real canvas projection, a **tiled workspace** with a docked window bar, the
  corner-drag split/join gesture, panels as windows, cross-area connector
  drag; the side panel tabs retired, the node palette moved into the area.
- **Collaboration, offline first** (13–14 August 2026). A dated merge with
  visible conflicts and light versioning (P3, twin of s3Dgraphy's
  `MergeReport.conflicts`); the **CRDT** (`crdt.ts`, P4.1): OR-Set presence,
  LWW per field, inline tombstones, held equal to s3Dgraphy's `crdt.py` on one
  parity fixture (`testdata/crdt-parity.json`, `check-crdt.mjs`); the **room
  client** of the hub (em-server, P4.3) with presence; the Wire v2 envelope
  (`wire.ts`); structural operations applied live (P4.5).
- **ORCID identity, declared now and verified later** (13 August 2026): an
  iD with its checksum checked, a `verified` flag on the author, and
  publishing gated on a verified identity while saving and exporting stay free.
- **The Shelf** (13 August 2026), a curated list of resources; a 2D annotator
  and client-side IIIF (13–14 August).
- **Rooms with roles and storage** (16–18 August 2026): the read-only role of a
  room shown and enforced, resource rights and their denials, MinIO uploads
  with attribution, bulk asset ingestion, storage surfaces as hosts, the DTC
  corpus separated from the study graphs and drawn as a DAG, per-document undo,
  push/pull with the room's **resident register** (`/v1/corpus`), additive in
  both directions.
- **Connector plugins** (21–22 August 2026): a connector registry and a version
  handshake on the client, mirroring s3Dgraphy's new `contract` module, with
  Blender as reference connector #1; consumer checks.

### Fixed
- A re-sync no longer resurrects deleted nodes (field tombstones, 14 August
  2026; ADR-003).
- The reader's asset paths in served builds (16 August 2026); windows that
  emptied on focus change (20 August 2026); scroll state kept across focus
  changes (21 August 2026).

## 11–31 July 2026 — the editor and its engine (1.6.0-dev.1, no tags yet)

### Added
- **The first editor** (11–12 July 2026). From *Initial commit* to a working
  application in two days: a TypeScript + Vite front end with the two
  projections of ONE graph, the swimlane **Matrix** and the full **Graph**
  (read-only first, then editable), a Tauri desktop shell, and the Templu Mare
  fixture. Phase 4 brought editing — a palette, live socket validation from
  the s3Dgraphy datamodels, undo/redo, move and delete, an editable
  Inspector — and hypergraph folding with a breadcrumb; phase 5 orthogonal
  edge routing with crossing bridges and arrowheads, the official EM 2D icons,
  the «EM 1.6» version chip, a node list, an overview minimap and SVG export.
- **ADR-001: s3Dgraphy consumed through a versioned JSON contract** (12 July
  2026). The datamodels of s3Dgraphy are the single source of truth for the EM
  language; EMStudio vendors them with `sync-datamodels.sh` and never
  hardcodes a type, a colour or a rule. The mined `em_node_classes.json` was
  dropped. On 22 July (P1-J) the class hierarchy moved to the split registry
  `node_registry.generated.json`, generated in s3Dgraphy (P1-A).
- **em-core, the Rust layout engine** (12–13 July 2026). Compaction,
  layer wrapping into sub-rows (Templu Mare's canvas from 13 410 × 680 to
  3 450 × 880), then layout v3 — **directed edges always point down**, epochs
  are **lanes, not nodes** in the Matrix — and engine v4, a recursive yEd-style
  layout where every group is laid out as its own hierarchic subgraph. The
  **Layout** button runs em-core through WASM, byte-identical to the CLI.
  **From-Sketch** (`compute_with_sketch`) keeps the hand's order on re-layout
  and folded groups release their slots. Port routing fans edges along a
  node's sides.
- **Groups and containment drawn as containers** (12 July 2026). yEd-style
  group boxes in the Matrix (open box and closed tab, swimlane expansion);
  `is_part_of` joins the membership closure, so any US/USD/VSF with parts is an
  outline container; a shared node lives in ONE box, its **primary parent**.
- **Master and instances of documents** (12 July 2026). One document node in
  the graph, one visual instance per usage context, drawn as a vector sheet
  whose border thickness says the Master role and whose colour the geometry
  variant (`document_variant_styles`).
- **Live sync with Blender, first phases** (13 July 2026). A sync client and an
  op-log data channel (`update_node` from EMStudio to the host); ADR-002.
- **Epochs, phases and chronology in the Matrix** (14–19 July 2026). New
  document, epoch creation, multi-selection with marquee and drag-drop
  grouping, progressive-disclosure filters, radial and force Graph layouts;
  **phase sub-bands** inside an epoch's lane (shown by default, clickable, with
  start–end), a «+» to add a phase on the epoch rail, numeric chronology
  bounds with a validation banner, lane-conflicting chronological edges drawn
  in bright red, safe epoch insertion and deletion.
- **A Monochrome (B/W) toggle** (21 July 2026), replacing an automatic Harris
  black; colours and borders realigned to the canonical SVGs and to the EM 1.3
  standard colour table (visual rules 1.6.1).
- **GraphML in the desktop app through a bundled sidecar** (21–22 July 2026).
  The Python transformer (`em_bridge.py` + s3Dgraphy) became a pluggable HTTP
  endpoint (`?bridge=`, `window.EM_BRIDGE`, a remote StratiGraph server, or
  the local sidecar), frozen into the desktop app; pandas and numpy left out
  (cold start 30 s → 6 s).
- **An application version of its own** (22 July 2026). `1.6.0-dev.1`, distinct
  from the EM language version, shown beside the wordmark; `set-version.sh`
  keeps `package.json`, `Cargo.toml` and `tauri.conf.json` in step.
- **Turtle export** (P1-G, 22 July 2026): the bridge exports `.ttl` with
  rdflib bundled in the sidecar; «Turtle (.ttl)» in the front end.
- **HDT-O** (23–24 July 2026): the datamodel, an Inspector and a store, an
  authority resolver through the bridge, the profile kept **off** the
  stratigraphic canvas (graph metadata, not nodes on the Matrix).
- **The DTC substrate profile** (25–26 July 2026), data-driven kinds and
  glyphs; `DTCOutputNode` replaced by a LinkNode as the resource output,
  `DTCInputNode` retired.
- **Resources** (R5, 27 July 2026): a panel that scans, shelves and adopts
  documents; optional MinIO endpoints in the bridge; resource promotion and
  DTC bridge endpoints; a local dev stack with MinIO and optional auth (29
  July).

### Fixed
- Group boxes no longer intersect: containment follows the primary parent, and
  dragging a group no longer drags a shared document master (12 July 2026).
- Epoch reorder moves the nodes with their lanes and keeps the order on
  From-Sketch; a new phase no longer creates a giant lane (18 July 2026).
- A single node dragged freely in the Matrix no longer snaps back (19 July
  2026).
- The sidecar: stdout drained so it does not wedge, «closed» emitted
  synchronously on disconnect, self-termination when the app exits (no stale
  port 8765) (22 July 2026).
