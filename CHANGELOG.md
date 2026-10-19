# Changelog

Notable changes to **EMStudio**. Until 16 October 2026 they lived only in the
commits and in the reports of each MICRO; this file starts with the first change
that asked for one.

## [Unreleased]

### Added
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

### Changed
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
- The epochs' dates made at READING (`ensureAllEpochParadata`) had a fresh UUID
  at each opening: the same file gave 9 new nodes and 15 edges every time on
  Templu Mare v3.2, and a second «Bring into a room…» seated them again. Their
  ids are derived from the epoch's now.
