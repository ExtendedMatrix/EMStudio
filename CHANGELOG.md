# Changelog

Notable changes to **EMStudio**. Until 16 October 2026 they lived only in the
commits and in the reports of each MICRO; this file starts with the first change
that asked for one.

## [Unreleased]

### Added
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
- The epochs' dates made at READING (`ensureAllEpochParadata`) had a fresh UUID
  at each opening: the same file gave 9 new nodes and 15 edges every time on
  Templu Mare v3.2, and a second «Bring into a room…» seated them again. Their
  ids are derived from the epoch's now.
