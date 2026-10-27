/**
 * MICRO-ARCHIVIO-2 · the File window «alla Blender»: what it shows, decided
 * without the DOM — the system files it hides, the kinds its type filter
 * knows, the order of its columns, the line of state that took the place of
 * the block at the bottom, the presets of the Timbro tab and of Ottimizza.
 *
 * The note is `em-design-archivio-ripensato` (§2), the decisions E.D.'s of
 * 27 Oct 2026 (V1 = A: the tabbed panel on the right; V2 = 4: Timbro,
 * Ottimizza, Stanza, Info). `check-files-browser.mjs` reads this module.
 */

/** What a File window lists: the bridge's entry, reduced to what is sorted. */
export interface BrowserEntry {
  path: string;
  name: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
}

/**
 * The SYSTEM files, hidden by default as Blender hides its hidden files: the
 * stamps beside the files (the seal on the file already says it), the backups
 * (`.bak`, `.bak-20261017-181445`, `.prima-…` — the copies made before a
 * repair), Blender's `.blend1`, Office's `~$` locks, the dot files. A `.mtl`
 * is NOT one: it is the material of an OBJ, a file of the model.
 */
export function isSystemFile(name: string): boolean {
  return /\.stamp\.json$/i.test(name)
    || /\.bak(\d*|-.*)?$/i.test(name)
    || /\.prima-[^/]*$/i.test(name)
    || /\.blend\d+$/i.test(name)
    || /^~\$/.test(name)
    || /^\./.test(name)
    || /\.(tmp|swp)$/i.test(name);
}

export type BrowserKind = "dir" | "image" | "document" | "model" | "tileset" | "emjson" | "gis" | "other";

/** The kinds of the type filter, in its order (the mockup's, with GIS for V4). */
export const KIND_FILTERS: ReadonlyArray<BrowserKind | "all"> =
  ["all", "image", "document", "model", "tileset", "emjson", "gis"];

/** The kind of a file by its name (and of a folder: `dir`). */
export function kindOf(entry: { name: string; type: "file" | "dir" }): BrowserKind {
  if (entry.type === "dir") return "dir";
  const n = entry.name.toLowerCase();
  if (/\.(em\.json|emj|graphml)$/.test(n)) return "emjson";
  if (n === "tileset.json" || /\.(3tz|3dtiles|b3dm|i3dm|pnts|cmpt)$/.test(n)) return "tileset";
  if (/\.(shp|shx|dbf|prj|cpg|gpkg|geojson|kml|kmz|tfw|jgw|pgw|wld)$/.test(n)) return "gis";
  if (/\.(jpe?g|png|gif|webp|tiff?|bmp|heic|avif|exr|dng|cr2|nef)$/.test(n)) return "image";
  if (/\.(pdf|docx?|odt|rtf|txt|md|xlsx?|ods|csv|pptx?)$/.test(n)) return "document";
  if (/\.(glb|gltf|obj|ply|fbx|stl|blend|usdz?|e57|las|laz|abc|dae|3ds|x3d)$/.test(n)) return "model";
  return "other";
}

/** A model the Ottimizza tab can make variants of (gltfpack reads these). */
export const isOptimizable = (name: string): boolean => /\.(glb|gltf|obj)$/i.test(name);

export type SortKey = "name" | "stamp" | "use" | "size" | "date";
export const SORT_KEYS: readonly SortKey[] = ["name", "stamp", "use", "size", "date"];

/** What a row knows besides the entry: is it stamped, is it in the graph. */
export interface RowFacts { stamped(path: string): boolean; used(path: string): boolean }

/**
 * The rows the centre shows: the folders first (as in every file browser),
 * then the files, filtered by the search (the name, case- and accent-blind)
 * and the kind, the system files out unless asked, ordered by the column.
 * `desc` turns the order round (a second click on the same column).
 */
export function visibleEntries<E extends BrowserEntry>(entries: E[], opts: {
  query?: string; kind?: BrowserKind | "all"; showSystem?: boolean;
  sort?: SortKey; desc?: boolean; facts?: RowFacts;
}): E[] {
  const q = fold(opts.query ?? "");
  const kind = opts.kind ?? "all";
  const facts = opts.facts;
  const kept = entries.filter((e) => {
    if (!opts.showSystem && isSystemFile(e.name)) return false;
    if (q && !fold(e.name).includes(q)) return false;
    if (kind !== "all" && e.type === "file" && kindOf(e) !== kind) return false;
    // a kind filter keeps the folders: they are the way to the files of that kind
    return true;
  });
  const byName = (a: E, b: E): number => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  const key = opts.sort ?? "name";
  const dir = opts.desc ? -1 : 1;
  const cmp = (a: E, b: E): number => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;   // folders first, whatever the order
    if (key === "name") return byName(a, b) * dir;
    // the other columns put the most first (stamped, in use, heaviest, newest);
    // equals keep the order of the names
    let d = 0;
    if (key === "stamp" && facts) d = Number(facts.stamped(b.path)) - Number(facts.stamped(a.path));
    else if (key === "use" && facts) d = Number(facts.used(b.path)) - Number(facts.used(a.path));
    else if (key === "size") d = b.size - a.size;
    else if (key === "date") d = b.mtime - a.mtime;
    return d ? d * dir : byName(a, b);
  };
  return kept.slice().sort(cmp);
}

/** case- and accent-blind */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** The line of state (AR10): what the folder or the choice holds. */
export interface StatusCounts {
  files: number; stamped: number; unstamped: number;
  chosen: number; chosenStamped: number; hidden: number; shown: number;
}

export function statusCounts(entries: BrowserEntry[], chosen: string[], facts: Pick<RowFacts, "stamped">,
                             shown: number, showSystem: boolean): StatusCounts {
  const files = entries.filter((e) => e.type === "file" && !isSystemFile(e.name));
  const stamped = files.filter((e) => facts.stamped(e.path)).length;
  const set = new Set(chosen);
  const picked = files.filter((e) => set.has(e.path));
  return {
    files: files.length, stamped, unstamped: files.length - stamped,
    chosen: picked.length, chosenStamped: picked.filter((e) => facts.stamped(e.path)).length,
    hidden: showSystem ? 0 : entries.filter((e) => e.type === "file" && isSystemFile(e.name)).length,
    shown,
  };
}

// ── the Timbro tab's presets (AR12) ─────────────────────────────────────────

/** A preset fills the composer: the road (an origin or a step), the kind from
 *  the DTC vocabulary, the instrument, the operator. The licence is not a
 *  field of the stamp (dtcstamp): it is declared at the delivery to a room. */
export interface StampPreset {
  id: string;
  /** a built-in's label is an i18n key; a person's preset carries its name */
  labelKey?: string;
  name?: string;
  origin: boolean;
  kind: string;
  instrument?: string;
  technique?: string;
  operator?: { id: string; label: string };
  builtin?: boolean;
}

export const BUILTIN_STAMP_PRESETS: readonly StampPreset[] = [
  { id: "drone", labelKey: "files.presetDrone", origin: true, kind: "photo", technique: "aerial", builtin: true },
  { id: "photo", labelKey: "files.presetPhoto", origin: true, kind: "photo", builtin: true },
  { id: "laser", labelKey: "files.presetLaser", origin: true, kind: "laserscanner", builtin: true },
  { id: "gnss", labelKey: "files.presetGnss", origin: true, kind: "gnss_survey", builtin: true },
  { id: "zenodo", labelKey: "files.presetZenodo", origin: true, kind: "download", builtin: true },
  { id: "sheet", labelKey: "files.presetSheet", origin: true, kind: "recording_sheet", builtin: true },
];

export const STAMP_PRESETS_KEY = "emstudio.stampPresets";

/** The person's presets, read from a store (localStorage in the page). */
export function readStampPresets(store: Pick<Storage, "getItem"> | null): StampPreset[] {
  try {
    const v = JSON.parse(store?.getItem(STAMP_PRESETS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((p): p is StampPreset => !!p && typeof p === "object"
      && typeof (p as StampPreset).id === "string" && typeof (p as StampPreset).kind === "string"
      && typeof (p as StampPreset).name === "string")
      .map((p) => ({ ...p, builtin: false }));
  } catch { return []; }
}

/** Save one more (a name already used is replaced: a preset is its name). */
export function saveStampPreset(store: Pick<Storage, "getItem" | "setItem"> | null, preset: StampPreset): StampPreset[] {
  const name = (preset.name ?? "").trim();
  if (!name) return readStampPresets(store);
  const kept = readStampPresets(store).filter((p) => p.name!.toLowerCase() !== name.toLowerCase());
  const next = [...kept, { ...preset, name, builtin: false, id: preset.id || `user-${Date.now().toString(36)}` }];
  try { store?.setItem(STAMP_PRESETS_KEY, JSON.stringify(next.map(({ builtin: _b, ...p }) => p))); } catch { /* storage off */ }
  return next;
}

export function dropStampPreset(store: Pick<Storage, "getItem" | "setItem"> | null, id: string): StampPreset[] {
  const next = readStampPresets(store).filter((p) => p.id !== id);
  try { store?.setItem(STAMP_PRESETS_KEY, JSON.stringify(next.map(({ builtin: _b, ...p }) => p))); } catch { /* storage off */ }
  return next;
}

// ── the Ottimizza tab's destinations (AR14) ─────────────────────────────────

/**
 * The destinations of a variant. The round-0 verdict (27 Oct 2026): variants
 * are EXPERIMENTAL — gltfpack does them in a second, but the Viewer of
 * EMStudio reads neither meshopt nor KTX2 yet, so the variants written here
 * are simplified and NOT compressed (`-noq`, no `-c`, no `-tc`): a variant
 * EMStudio cannot show would be a file nobody checks. Textures keep their
 * size (gltfpack resizes them only together with KTX2).
 * The name is s3Dgraphy's (`project_tree.variant_name`), asked of the bridge.
 */
export interface OptimizePreset {
  id: string; labelKey: string; lod: string; destination: string;
  /** the share of the triangles kept (gltfpack `-si`) */
  ratio: number;
}

export const OPTIMIZE_PRESETS: readonly OptimizePreset[] = [
  { id: "web", labelKey: "files.optWeb", lod: "lod4", destination: "web", ratio: 0.1 },
  { id: "mobile", labelKey: "files.optMobile", lod: "lod4", destination: "mobile", ratio: 0.05 },
  { id: "vr", labelKey: "files.optVr", lod: "lod3", destination: "vr", ratio: 0.25 },
  { id: "heriverse", labelKey: "files.optHeriverse", lod: "lod3", destination: "aton-heriverse", ratio: 0.5 },
  { id: "print", labelKey: "files.optPrint", lod: "lod1", destination: "print", ratio: 1 },
];

// ── the panel's tab when nobody chose one ───────────────────────────────────

export type ToolTab = "stamp" | "optimize" | "room" | "info";
export const TOOL_TABS: readonly ToolTab[] = ["stamp", "optimize", "room", "info"];

/**
 * Which tab the panel opens on when the person has not chosen one: the
 * composer open → Timbro (there is a form being written); a choice with
 * files to stamp → Timbro; a choice all stamped → Info (its stamp); models
 * only → Ottimizza; nothing chosen → Info (the folder's gestures: stamp
 * its files together, DosCo, its stamps). A chosen tab stays.
 */
export function autoTab(s: { drafting: boolean; chosen: number; chosenUnstamped: number;
  chosenModels: number }): ToolTab {
  if (s.drafting) return "stamp";
  if (s.chosen) {
    if (s.chosenUnstamped) return "stamp";
    if (s.chosenModels === s.chosen) return "optimize";
    return "info";
  }
  return "info";
}

// ── the places (AR2) ────────────────────────────────────────────────────────

export const FAVORITES_KEY = "emstudio.fsFavorites";
export const RECENT_DIRS_KEY = "emstudio.fsRecentDirs";
export const RECENT_DIRS_CAP = 8;

export function readPathList(store: Pick<Storage, "getItem"> | null, key: string): string[] {
  try {
    const v = JSON.parse(store?.getItem(key) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : [];
  } catch { return []; }
}

/** The folder just visited goes to the head of the recent ones (no copies, a cap). */
export function pushRecentDir(list: string[], dir: string, cap = RECENT_DIRS_CAP): string[] {
  return [dir, ...list.filter((d) => d !== dir)].slice(0, cap);
}

/** A star: on when off, off when on. */
export function toggleFavorite(list: string[], dir: string): string[] {
  return list.includes(dir) ? list.filter((d) => d !== dir) : [...list, dir];
}
