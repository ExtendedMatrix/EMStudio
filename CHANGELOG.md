# Changelog

Notable changes to **EMStudio**. Until 16 October 2026 they lived only in the
commits and in the reports of each MICRO; this file starts with the first change
that asked for one.

## [Unreleased]

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
