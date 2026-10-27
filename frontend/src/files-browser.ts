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

// ── the Ottimizza tab's destinations (AR14, MICRO-OTTIMIZZA-1) ────────────

/**
 * The destinations of a variant. Round 0 (27 Oct 2026) made the variants
 * experimental because the Viewer of EMStudio read neither meshopt nor KTX2;
 * since MICRO-OTTIMIZZA-1 it reads both (`tiles3d.ts withDecoders`), and the
 * variants are ON: the web and mobile ones simplified, quantised, meshopt
 * compressed with KTX2 textures; Heriverse/ATON and print whole and
 * uncompressed (nobody has yet proved Heriverse reads meshopt/KTX2, and a
 * print wants the geometry as it is). The bridge holds the same table
 * (`em_optimize.PRESETS`, by `id`); the name is s3Dgraphy's
 * (`project_tree.variant_name`), asked of the bridge.
 *
 * ENGINES (E.D., precisazione 3): each destination has its default engine and
 * says why; the person may change it. gltfpack is the quick way for the web
 * and for whoever has neither Blender, Metashape nor RealityScan; Blender +
 * 3DSC (re-baking the textures, the number of textures each level needs) is
 * the engine of the «experiences» (Blender, Unreal) and arrives in round 3.
 */
export type OptEngine = "gltfpack" | "blender3dsc";
export interface OptimizePreset {
  id: string; labelKey: string; lod: string; destination: string;
  /** the share of the triangles kept (gltfpack `-si`) */
  ratio: number;
  /** the textures' largest side (gltfpack `-tl`, only with KTX2); 0 = as they are */
  texturePx: number;
  ktx2: boolean; meshopt: boolean;
  /** s3Dgraphy's USES of the version */
  use: string[];
  /** the default engine, the ones that may replace it, and why the default */
  engine: OptEngine; engines: OptEngine[]; whyKey: string;
}

export const OPTIMIZE_PRESETS: readonly OptimizePreset[] = [
  { id: "web", labelKey: "files.optWeb", lod: "lod4", destination: "web", ratio: 0.1, texturePx: 1024,
    ktx2: true, meshopt: true, use: ["web"], engine: "gltfpack", engines: ["gltfpack", "blender3dsc"], whyKey: "files.optWhyWeb" },
  { id: "mobile", labelKey: "files.optMobile", lod: "lod4", destination: "mobile", ratio: 0.05, texturePx: 512,
    ktx2: true, meshopt: true, use: ["mobile_ar"], engine: "gltfpack", engines: ["gltfpack", "blender3dsc"], whyKey: "files.optWhyMobile" },
  { id: "heriverse", labelKey: "files.optHeriverse", lod: "lod3", destination: "aton-heriverse", ratio: 1, texturePx: 0,
    ktx2: false, meshopt: false, use: ["heriverse", "aton"], engine: "gltfpack", engines: ["gltfpack", "blender3dsc"], whyKey: "files.optWhyHeriverse" },
  { id: "print", labelKey: "files.optPrint", lod: "lod1", destination: "print", ratio: 1, texturePx: 0,
    ktx2: false, meshopt: false, use: ["print"], engine: "gltfpack", engines: ["gltfpack", "blender3dsc"], whyKey: "files.optWhyPrint" },
  { id: "experience", labelKey: "files.optExperience", lod: "lod3", destination: "realtime", ratio: 0.25, texturePx: 0,
    ktx2: false, meshopt: false, use: ["realtime"], engine: "blender3dsc", engines: ["blender3dsc", "gltfpack"], whyKey: "files.optWhyExperience" },
];

/** The engines that run today: gltfpack (when the bridge has it). Blender + 3DSC
 *  is round 3's. */
export const ENGINES_TODAY: ReadonlySet<OptEngine> = new Set<OptEngine>(["gltfpack"]);

/** The engine a destination uses: the person's choice when it is one of the
 *  destination's, else its default. */
export function engineFor(pre: OptimizePreset, chosen: Record<string, string> | null | undefined): OptEngine {
  const c = chosen?.[pre.id] as OptEngine | undefined;
  return c && pre.engines.includes(c) ? c : pre.engine;
}

/** The memory a gltfpack variant asks, said before it starts: measured in
 *  round 0 (a 47 MB obj → 220 MB; 1.1 GB with 44 textures → 3.1 GB), about
 *  100 MB plus three and a half times what it reads. */
export function variantMemoryMb(bytesIn: number): number {
  return Math.ceil(100 + 3.5 * Math.max(0, bytesIn) / (1024 * 1024));
}

// ── MICRO-OTTIMIZZA-2 · a tileset from a textured mesh ──────────────────────

/** The destination «Tileset (3D Tiles)», shown beside the variants' when the
 *  experimental switch is on. Its engines, in E.D.'s order (precisazione 3):
 *  what RealityScan or Metashape already made (recognised, packed and stamped
 *  as theirs, whatever is chosen here), then Obj2Tiles, then 3D Survey
 *  Collection in Blender (round 3). */
export const TILESET_PRESET_ID = "tileset";
export type TilesEngine = "obj2tiles" | "blender3dsc";
export const TILES_ENGINES: readonly TilesEngine[] = ["obj2tiles", "blender3dsc"];
export const TILES_ENGINES_TODAY: ReadonlySet<TilesEngine> = new Set<TilesEngine>(["obj2tiles"]);

/** One OBJ of a batch, as the bridge plans it (`POST /fs/tileset`). */
export interface TilesetItem {
  source: string; name: string; folder?: string; path?: string; exists?: boolean; error?: string;
  bytes_in?: number; bytes_calls?: number; triangles_est?: number; lods?: number; divisions?: number;
  leaves?: number; estimate_mb?: number; command?: string;
}

/** How the queue will start: in order, a file joins the ones running while
 *  their estimates stay under the ceiling together and the workers allow; a
 *  file that alone passes the ceiling is refused (never past it). */
export function tilesetSchedule(items: readonly TilesetItem[], ceilingMb: number, workers: number):
    { todo: TilesetItem[]; over: TilesetItem[]; parallel: number; startMb: number; totalMb: number } {
  const live = items.filter((i) => !i.error && !i.exists);
  const over = live.filter((i) => (i.estimate_mb ?? 0) > ceilingMb);
  const todo = live.filter((i) => !over.includes(i));
  let parallel = 0, startMb = 0;
  for (const it of todo) {
    const mb = it.estimate_mb ?? 0;
    if (parallel >= Math.max(1, workers) || (parallel > 0 && startMb + mb > ceilingMb)) break;
    parallel++;
    startMb += mb;
  }
  return { todo, over, parallel, startMb, totalMb: todo.reduce((s, i) => s + (i.estimate_mb ?? 0), 0) };
}

/** Megabytes as a person reads them: «977 MB», «15,3 GB». */
export function formatMb(mb: number, locale = "it"): string {
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} GB`;
}

/** A file of a batch job, as its row says it: its name, its stage, its share. */
export interface JobItemView { source: string; name?: string | null; state: string; progress: number; stage?: string;
  estimate_mb?: number | null; cancel?: boolean }
export const jobItemOpen = (i: JobItemView): boolean => i.state === "queued" || i.state === "running";

/** A background job as the status line says it: its label, its share done. */
export interface JobView { id: string; kind: string; label: string; state: string; progress: number; stage?: string }
export function jobLine(j: JobView): string {
  const pct = j.state === "running" ? ` ${Math.round(Math.max(0, Math.min(1, j.progress)) * 100)}%` : "";
  return `${j.label}${j.stage ? ` · ${j.stage}` : ""}${pct}`;
}
export const jobRunning = (j: JobView): boolean => j.state === "queued" || j.state === "running";

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
