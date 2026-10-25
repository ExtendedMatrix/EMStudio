/**
 * MICRO-3DTILES · a 3D Tiles tileset in EMStudio's own three.js viewer — to
 * annotate and check an asset, not to publish it (that is Heriverse's job).
 *
 * **The engine comes after three, never with it.** 3DTilesRendererJS
 * (NASA-AMMOS, `3d-tiles-renderer`) is loaded the first time a TILESET opens:
 * in the web build as `tiles3d.js`, beside the page and taking three from
 * `engine3d.js` (one three on the page); in the single file (desktop, `file://`)
 * inlined like three is. Measured in the MICRO's report.
 *
 * **The frame.** A tileset is Z-up (3D Tiles, and 3D Survey Collection writes
 * its bounding volumes in Blender's frame); the glb in its tiles is Y-up, and
 * the renderer turns it to Z-up for the tileset. So ONE rotation, −90° about X,
 * puts the whole tileset in three's Y-up frame — the frame of a glTF exported
 * from the same Blender scene (`export_yup`: x, y, z → x, z, −y) and of the
 * proxies. `root.transform` stays the tileset's own and is honoured under that
 * rotation. Measured, not deduced: `scripts/check-tiles3d.mjs` (the fixture) and
 * the report (a real 3DSC tileset against one of its own tiles as a glTF).
 *
 * **Two ways to refine** (E.D., 30 set: «si carica il livello più basso, poi i
 * più alti su richiesta, tile per tile»):
 *
 *   · `manual` (the starting one) — the error the renderer reads is 0 for
 *     every tile except those asked for, so it stays at the root. «Più
 *     dettaglio qui» on a zone adds THAT tile to the asked set: its children
 *     load, and no other tile's. «Meno dettaglio» takes the last one back.
 *   · `auto` — the renderer's own screen-space error, under a memory ceiling.
 *     Leaving it for `manual` keeps what is shown: the tiles refined at that
 *     moment become the asked set.
 *
 * **Upright, always** (MICRO tileset dritto e nitido, E.D. 25 Oct 2026). A
 * root whose transform puts the tileset on the Earth (a translation over 1 km:
 * an ECEF frame, `tileset-drop.ts position`) is relocated by its frame when it
 * has one (`relocate`); when it has none, or the relocation is refused, it is
 * CENTRED — the root's transform taken out whole, translation AND rotation, so
 * the geometry stands in its own local frame (East-North-Up for RealityScan),
 * up along three's Y. Drawn as written, the Basilica's floor stood at 88° (its
 * up along the Earth's radius on the equator, three's X).
 *
 * **Memory at a steady level** (same MICRO). RealityScan's second export of the
 * Basilica has an 8192² texture in every tile: 325 MB the root alone, 582 MB
 * with one child — over the 400 MB ceiling, the renderer discarded every new
 * tile and «Più dettaglio qui» stayed at level 0. Now (1) a tile's textures are
 * reduced, as it arrives, to what the canvas and the ceiling can use
 * (`textureMax`: the canvas's side to the next power of two, and no more than a
 * sixteenth of the ceiling per texture); GPU compression (KTX2/Basis) is not
 * possible here: the tiles carry JPEG/PNG and an encoder in the page would cost
 * more than it saves; (2) the ancestors are not kept loaded under their
 * children (`loadAncestors` off) and a tile whose children are shown leaves the
 * memory at once; (3) the ceiling's default is the machine's (settings.ts).
 *
 * **Geometric errors too small for the extent** (same MICRO). The renderer
 * refines a tile when its error, seen from the camera, is over 16 pixels; the
 * `-2` export says 0.245 m for a root 214 m across — at that rate the root
 * refines only from 16 m away. `errorScale` multiplies every error the
 * renderer reads in automatic mode; «auto» estimates it from the root (an error
 * under 1/600 of its diagonal is taken as written for another viewer: the
 * scale that brings it to 1/60, to the next power of two) and the status says so.
 */
import { engine } from "./embed3d-native";
import { NodeRoadTilesPlugin, roadFetch } from "./node-road";
import { readLeaves, type Box, type LeafResult } from "./tileset-leaves";
import { estimateErrorScale, onEarth, textureSideFor, volumeDiagonal, type GeErrors } from "./tiles-budget";
export { estimateErrorScale, onEarth, textureSideFor, volumeDiagonal, type GeErrors } from "./tiles-budget";

export type RefineMode = "manual" | "auto";

let tilesPromise: Promise<any> | null = null;

/** 3DTilesRendererJS, loaded once — after three. RISORSA-FILE: with it, the
 *  `.3tz` reader (`tiles3tz.ts`), so an archive costs nothing until the first
 *  tileset opens — the same moment the renderer itself arrives. */
export async function tilesEngine(): Promise<{ TilesRenderer: any; ImplicitTilingPlugin: any;
    Archive3tz: any; Tiles3tzPlugin: any; sourceFor: any; archiveBase: any;
    DRACOLoader: any; GLTFExtensionsPlugin: any; DRACO_FILES: Record<string, string>;
    /** MICRO-GEOGLOBO · the globe's parts (`globe3d.ts`) */
    TerrariumMeshPlugin: any; ImageOverlayPlugin: any; XYZTilesOverlay: any;
    LRUCache: any; PriorityQueue: any; DownloadPriorityQueue: any }> {
  if (!tilesPromise) {
    // a CONSTANT condition, as in `engine()`: the other arm leaves the build
    tilesPromise = __EM_LAZY_3D__
      ? engine().then(() => import(/* @vite-ignore */ new URL("./tiles3d.js", document.baseURI).href))
      : (async () => {
          const [r, p, z, d, x, w, m, tr, io, co] = await Promise.all([import("3d-tiles-renderer/three"),
            import("3d-tiles-renderer/core/plugins"), import("./tiles3tz"),
            import("three/examples/jsm/loaders/DRACOLoader.js"), import("3d-tiles-renderer/src/three/plugins/GLTFExtensionsPlugin.js"),
            import("../node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url"),
            import("../node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url"),
            import("3d-tiles-renderer/src/three/plugins/images/terrain-rgb/TerrariumMeshPlugin.js"),
            import("3d-tiles-renderer/src/three/plugins/images/ImageOverlayPlugin.js"), import("3d-tiles-renderer/core")]);
          return { TilesRenderer: r.TilesRenderer, ImplicitTilingPlugin: p.ImplicitTilingPlugin,
                   TerrariumMeshPlugin: tr.TerrariumMeshPlugin,
                   ImageOverlayPlugin: io.ImageOverlayPlugin, XYZTilesOverlay: io.XYZTilesOverlay,
                   LRUCache: co.LRUCache, PriorityQueue: co.PriorityQueue, DownloadPriorityQueue: co.DownloadPriorityQueue,
                   Archive3tz: z.Archive3tz, Tiles3tzPlugin: z.Tiles3tzPlugin,
                   sourceFor: z.sourceFor, archiveBase: z.archiveBase,
                   DRACOLoader: d.DRACOLoader, GLTFExtensionsPlugin: x.GLTFExtensionsPlugin,
                   DRACO_FILES: { "draco_wasm_wrapper.js": w.default, "draco_decoder.wasm": m.default } };
        })();
    tilesPromise.catch(() => { tilesPromise = null; });
  }
  return tilesPromise;
}

/** A locator of a tileset: its entry point, `tileset.json` (the `_link`
 *  distribution EMtools writes, `packaging: directory`). */
export function isTilesetUrl(url: string | null | undefined): boolean {
  return !!url && (/(^|\/)tileset\.json(\?|#|$)/i.test(String(url)) || isArchive3tzUrl(url));
}

/** RISORSA-FILE · a 3D Tiles ARCHIVE (`.3tz`): a tileset in one file, read
 *  without extracting it. Also through the bridge's `/fs/file?path=…3tz`. */
export function isArchive3tzUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const s = String(url);
  return /\.3tz(\?|#|&|$)/i.test(s) || /\.3tz(%23|%3F|$)/i.test(s);
}

export interface TilesStatus {
  mode: RefineMode;
  /** the levels shown (0 = the root's content), or null before the first tile */
  level: [number, number] | null;
  /** the deepest level the tree has, as far as it is known */
  depth: number;
  /** tiles whose content is loaded, and shown */
  loaded: number;
  visible: number;
  /** bytes the loaded tiles hold (the renderer's own count) */
  bytes: number;
  /** the tiles that did not load: their file */
  missing: string[];
  /** the tileset itself did not load */
  failed: string | null;
  /** tiles asked for in manual mode */
  asked: number;
  /** a download or a parse is under way */
  busy: boolean;
  /** the memory ceiling, bytes (the renderer discards a new tile over it) */
  maxBytes: number;
  /** where the tileset stands: moved by its frame, centred (its root's
   *  transform put it on the Earth and nothing relocated it), or as written */
  placed: "relocated" | "centred" | "written";
  /** the geometric errors: the root's, its diagonal, the scale applied (auto or chosen) */
  ge: GeErrors | null;
  /** the textures reduced as the tiles arrived: how many, the largest seen, the side allowed */
  textures: { reduced: number; largest: number; max: number };
}



export interface TilesLayer {
  /** add this to the scene: the tileset, turned to Y-up */
  object: any;
  /** once per frame, after the camera moved */
  update(): void;
  setMode(m: RefineMode): void;
  mode(): RefineMode;
  /** «Più dettaglio qui»: the tile of a hit object gets its children. Returns
   *  what happened, for the status line. */
  refineAt(hitObject: any): "refined" | "leaf" | "none";
  /** «Meno dettaglio»: the last refinement taken back */
  coarsen(): boolean;
  status(): TilesStatus;
  /** the world box of the root's volume, for framing (null until it loads) */
  bounds(): any | null;
  /** the resolution changed (the canvas was resized) */
  resize(): void;
  /** MICRO-SPAZIO-3D-2 · the scene's camera changed (perspective ⇄ orthographic) */
  setCamera(camera: any): void;
  onChange(cb: () => void): void;
  dispose(): void;
  /** the probes' seam: the content files loaded now (relative to the tileset) */
  loadedFiles(): string[];
  /** …and the world centre of the tile whose content is `uri`, when known */
  centreOf(uri: string): any | null;
  /** …and the world box of what is loaded (the tiles' own meshes) */
  contentBox(): any | null;
  /** …and of one tile's content, by its file */
  boxOf(uri: string): any | null;
  /** the tileset.json has arrived: `bounds()` is the root's volume */
  rootReady(): boolean;
  /** MICRO-PROVA-DEV48 p.2 · the LEAF tiles' boxes in the world (three's frame),
   *  read from the tileset.json and its external ones through the renderer's
   *  own road (a `.3tz`, a room's store) — no tile loaded; once per layer */
  leaves(): Promise<(Omit<LeafResult, "boxes"> & { boxes: Box[] }) | null>;
  /** MICRO tileset, shift e epoche · the tileset's FRAME (its coordinates are a
   *  CRS minus a shift: `file-frame.ts`): `fn`, given the root's written
   *  transform and volume, answers the transform from the tileset's own frame to
   *  the study's (Z-up, column-major) and the layer is moved there — the file
   *  untouched. Asked again only when `key` changes; `""` / null puts it back
   *  as written. */
  relocate(key: string, fn: RelocateFn | null): void;
  /** …what the last relocation did: its key, the fit's residual, or why not,
   *  who computed it, and where the tileset stands */
  relocated(): { key: string; residual_max_m: number | null; error?: string; via?: string; bridgeError?: string; placed?: TilesStatus["placed"] } | null;
  /** MICRO tileset dritto e nitido · the tileset's own up (its +Z) in the world, unit */
  up(): [number, number, number] | null;
  /** the multiplier of the errors in automatic mode: a number, or "auto" (estimated from the root) */
  setErrorScale(v: number | "auto"): void;
}

export type RelocateFn = (root: { transform: number[] | null; boundingVolume: unknown }) =>
  Promise<{ ok: boolean; transform?: number[]; residual_max_m?: number; error?: string; via?: string; bridgeError?: string }>;

export interface TilesOptions {
  mode?: RefineMode;
  /** the memory ceiling of the automatic mode, MB (the preferences) */
  memoryMB?: number;
  /** TEMPLU MARE v2 · C1 · `url` is a `.3tz` though it does not say so (a
   *  store URL: the archive's digest); the graph declared it */
  archive?: boolean;
  /** MICRO-TILESET-CARTELLA · the files come from a READER, not from `url`: a
   *  folder or a zip dropped on the Viewer or the Scene, the RealityScan pair
   *  served as one tree (`tileset-drop.ts servedSource`). Asked under a base
   *  nobody serves, as an archive is. */
  source?: { readEntry(path: string): Promise<Uint8Array | null> };
  /** MICRO tileset, shift e epoche · the frame from the start (`relocate`) */
  relocate?: { key: string; fn: RelocateFn } | null;
  /** MICRO tileset dritto e nitido · the errors' multiplier (default "auto") */
  errorScale?: number | "auto";
  /** …the longest side a tile's texture keeps (default: `textureSideFor`) */
  textureMax?: number;
}

/** 3d-tiles-renderer's LOADED (`core/renderer/constants.js`): a tile whose content is in */
const LOADED_STATE = 4;

/** MICRO tileset dritto e nitido · every texture of a tile's scene over `side`
 *  reduced to side² texels (the aspect kept: `textureSideFor`), BEFORE the renderer
 *  counts the tile's bytes and before the GPU sees it. An ImageBitmap through
 *  `createImageBitmap` (resized off the page's thread), anything else through a
 *  canvas. */
async function reduceTextures(scene: any, side: number, stats: { reduced: number; largest: number }): Promise<void> {
  // one reduction per IMAGE (two textures of a tile may share one)
  const byImage = new Map<any, Promise<any>>();
  const reduce = async (img: any, nw: number, nh: number): Promise<any> => {
    let out: any = null;
    try {
      if (typeof createImageBitmap === "function") {
        const b = await createImageBitmap(img, { resizeWidth: nw, resizeHeight: nh, resizeQuality: "high",
          premultiplyAlpha: "none", colorSpaceConversion: "none" });
        if (b.width === nw && b.height === nh) out = b; else b.close?.();
      }
    } catch { /* the canvas, below */ }
    if (!out && typeof document !== "undefined") {
      const c = document.createElement("canvas");
      c.width = nw; c.height = nh;
      c.getContext("2d")?.drawImage(img, 0, 0, nw, nh);
      out = c;
    }
    if (out) { img.close?.(); stats.reduced++; }
    return out;
  };
  const jobs: Promise<void>[] = [];
  const seen = new Set<any>();
  scene.traverse((o: any) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) for (const k of Object.keys(m)) {
      const tex = m[k];
      if (!tex?.isTexture || seen.has(tex)) continue;
      seen.add(tex);
      const img = tex.image;
      const w = Number(img?.width ?? 0), h = Number(img?.height ?? 0);
      stats.largest = Math.max(stats.largest, w, h);
      if (!(w * h > side * side)) continue;
      const f = side / Math.sqrt(w * h);
      let job = byImage.get(img);
      if (!job) { job = reduce(img, Math.max(1, Math.round(w * f)), Math.max(1, Math.round(h * f))); byImage.set(img, job); }
      jobs.push(job.then((out) => { if (out) { tex.image = out; tex.needsUpdate = true; } }));
    }
  });
  await Promise.all(jobs);
}

let draco: any = null;
/** The one Draco decoder (wasm, the files bundled with three): tilesets, and
 *  the Space's glb models (a web version is Draco-compressed). */
export function dracoFor(E: any, T: any): any {
  if (draco) return draco;
  const manager = new E.THREE.LoadingManager();
  manager.setURLModifier((u: string) => T.DRACO_FILES[String(u).split("/").pop() ?? ""] ?? u); // paths:url
  draco = new T.DRACOLoader(manager);
  draco.setDecoderPath("draco/");
  draco.setDecoderConfig({ type: "wasm" });
  return draco;
}

/** A tile's level: an implicit tile's own (`{level}` of its URI, 0 = the root
 *  of the octree/quadtree); in an explicit tree, 0 for the first tile with
 *  content. Measured on 3DSC's `sarcofago_v3_baseline`: content only at level 2
 *  (`native_backend_info.txt`: «LOD mode: False») — the level says so. */
const levelOf = (tile: any): number => tile?.implicitTilingData
  ? Number(tile.implicitTilingData.level ?? 0)
  : Math.max(0, (tile?.internal?.depthFromRenderedParent ?? 1) - 1);

/**
 * The tileset at `url`, for a scene whose camera and renderer are given.
 * `E` is the engine (`engine()`), `T` the tiles engine (`tilesEngine()`).
 */
export function createTilesLayer(E: any, T: any, url: string, camera0: any, renderer: any,
                                 opts: TilesOptions = {}): TilesLayer {
  const { THREE } = E;
  // RISORSA-FILE · a `.3tz`: the tileset is asked under a base nobody serves,
  // and the plugin answers every file of it from the archive — opened from its
  // end (the index), then each tile at its offset (tiles3tz.ts)
  let archivePlugin: any = null;
  if (opts.source && T.Tiles3tzPlugin) {
    const base = T.archiveBase();
    archivePlugin = new T.Tiles3tzPlugin(Promise.resolve(opts.source), base);
    url = `${base}tileset.json`;
  } else if ((opts.archive || isArchive3tzUrl(url)) && T.Tiles3tzPlugin) {
    const base = T.archiveBase();
    // MICRO-SPAZIO-FIRMATO · a .3tz of the room's store is read signed
    const archive = T.sourceFor(url, roadFetch as typeof fetch).then((src: any) => T.Archive3tz.open(src));
    archivePlugin = new T.Tiles3tzPlugin(archive, base);
    url = `${base}tileset.json`;
  }
  const tiles = new T.TilesRenderer(url);
  if (archivePlugin) tiles.registerPlugin(archivePlugin);
  // MICRO-SPAZIO-FIRMATO · a tileset in the room's store: its files signed
  tiles.registerPlugin(new NodeRoadTilesPlugin());
  tiles.registerPlugin(new T.ImplicitTilingPlugin());
  // RISORSA-FILE · Draco-compressed tiles (TempluMare's b3dm): ONE decoder for
  // the page, its two files served from the engine's own (never a CDN)
  if (T.DRACOLoader && T.GLTFExtensionsPlugin) tiles.registerPlugin(new T.GLTFExtensionsPlugin({ dracoLoader: dracoFor(E, T) }));
  // Z-up → Y-up: the one rotation (see the header)
  tiles.group.rotation.x = -Math.PI / 2;
  let camera = camera0;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  const mb = Math.max(64, opts.memoryMB ?? 400);
  tiles.lruCache.maxBytesSize = mb * 1024 * 1024;
  tiles.lruCache.minBytesSize = Math.round(mb * 0.75) * 1024 * 1024;
  // MICRO tileset dritto e nitido · the ancestors are not kept loaded under
  // their children: with it on (the renderer's default) every tile on the way
  // down was downloaded and held — 1.1 GB for 3 tiles of the Basilica
  tiles.loadAncestors = false;
  // the textures, reduced as each tile arrives (before the renderer counts its bytes)
  const texMax = opts.textureMax ?? textureSideFor(Math.max(renderer?.domElement?.width ?? 0, renderer?.domElement?.height ?? 0, 1024),
    mb * 1024 * 1024, Number(renderer?.capabilities?.maxTextureSize ?? 16384));
  const texStats = { reduced: 0, largest: 0, max: texMax };
  tiles.registerPlugin({ name: "EM_TEXTURE_SIDE", processTileModel: (scene: any) => reduceTextures(scene, texMax, texStats) });

  let mode: RefineMode = opts.mode ?? "manual";
  let leafRead: ReturnType<TilesLayer["leaves"]> | null = null;
  const asked = new Set<any>();
  const history: any[] = [];
  const sceneToTile = new Map<any, any>();
  const missing: string[] = [];
  let failed: string | null = null;
  let deepest = 0;
  let rootReady = false;
  const listeners: Array<() => void> = [];
  const changed = () => { for (const l of listeners) l(); };
  const base = url.replace(/[^/]*$/, "");
  const rel = (u: string) => {
    const s = String(u);
    const abs = new URL(base, document.baseURI).href;
    return s.startsWith(abs) ? s.slice(abs.length) : s;
  };

  // MANUAL: the error the traversal reads — 0 (stay) unless the tile was asked
  // for; frustum and distance stay the renderer's, so a tile out of view is
  // still culled and the nearest still loads first
  // …and a tile with NOTHING TO SHOW goes on down by itself: the root of what
  // is seen is the first level with content (a 3DSC tileset without LODs has
  // it only at the leaves — measured, `sarcofago_v3_baseline`)
  const viewError = tiles.calculateTileViewError.bind(tiles);
  // MICRO tileset dritto e nitido · the errors' multiplier (automatic mode)
  let scaleChoice: number | "auto" = opts.errorScale ?? "auto";
  let ge: GeErrors | null = null;
  const geOf = (rootTile: any): GeErrors | null => {
    if (!rootTile) return null;
    const root = Number(rootTile.geometricError ?? 0);
    const diagonal = volumeDiagonal(rootTile.boundingVolume);
    const est = estimateErrorScale(root, diagonal);
    return { root, diagonal, small: est.small, scale: scaleChoice === "auto" ? est.scale : scaleChoice, auto: scaleChoice === "auto" };
  };
  tiles.calculateTileViewError = (tile: any, target: any) => {
    viewError(tile, target);
    if (mode === "manual") target.error = asked.has(tile) || !tile.internal?.hasRenderableContent ? 1e9 : 0;
    else if (ge && ge.scale !== 1) target.error *= ge.scale;
  };

  tiles.addEventListener("load-model", (e: any) => {
    sceneToTile.set(e.scene, e.tile);
    deepest = Math.max(deepest, levelOf(e.tile));
    changed();
  });
  tiles.addEventListener("dispose-model", (e: any) => { sceneToTile.delete(e.scene); changed(); });
  tiles.addEventListener("load-error", (e: any) => {
    if (e.tile == null) failed = rel(String(e.url ?? url));
    else {
      const f = rel(String(e.url ?? ""));
      if (f && !missing.includes(f)) missing.push(f);
    }
    changed();
  });
  tiles.addEventListener("tiles-load-end", changed);
  // the root's VOLUME is known before any tile: the viewer frames it then — a
  // camera that does not see the root would never ask for a tile (measured:
  // 3DSC's `blocco_v13_real_lod` sits behind a camera left at the origin)
  tiles.addEventListener("load-root-tileset", (e: any) => {
    rootReady = true;
    const r = e?.tileset?.root ?? {};
    ge = geOf(r);
    rootJson = { transform: Array.isArray(r.transform) && r.transform.length === 16 ? r.transform.map(Number) : null,
                 boundingVolume: r.boundingVolume ?? null };
    applyRelocation();
    changed();
  });
  // MICRO tileset, shift e epoche · the frame: the group's matrix becomes
  // Rx(−90°)·A·W⁻¹ — W the root's written transform, A the true one in the
  // study's frame — so a tile lands at Rx·A·p; three composes in doubles, and
  // W⁻¹·W cancels the 6 000 km of a geocentric root to the nanometre
  let rootJson: { transform: number[] | null; boundingVolume: unknown } | null = null;
  let relocKey = opts.relocate?.key ?? "";
  let relocFn: RelocateFn | null = opts.relocate?.fn ?? null;
  let relocState: { key: string; residual_max_m: number | null; error?: string; via?: string; bridgeError?: string } | null = null;
  let placed: TilesStatus["placed"] = "written";
  const setGroup = (m: any) => {
    tiles.group.matrixAutoUpdate = false;
    tiles.group.matrix.copy(m);
    tiles.group.matrix.decompose(tiles.group.position, tiles.group.quaternion, tiles.group.scale);
    tiles.group.matrixWorldNeedsUpdate = true;
    tiles.group.updateMatrixWorld(true);
  };
  /** as written, unless the root puts it on the Earth: then CENTRED — Rx(−90°)·W⁻¹,
   *  the root's frame out whole (translation and rotation), the geometry upright in its own */
  const asWritten = () => {
    if (rootJson && onEarth(rootJson.transform)) {
      setGroup(new THREE.Matrix4().makeRotationX(-Math.PI / 2).multiply(new THREE.Matrix4().fromArray(rootJson.transform).invert()));
      placed = "centred";
      return;
    }
    tiles.group.matrixAutoUpdate = true;
    tiles.group.position.set(0, 0, 0);
    tiles.group.rotation.set(-Math.PI / 2, 0, 0);
    tiles.group.scale.set(1, 1, 1);
    tiles.group.updateMatrix();
    tiles.group.updateMatrixWorld(true);
    placed = "written";
  };
  const applyRelocation = () => {
    const key = relocKey;
    if (!key || !relocFn) { asWritten(); relocState = null; return; }
    if (!rootJson) return;
    if (!rootJson.transform) { asWritten(); relocState = { key, residual_max_m: null, error: "no-transform" }; changed(); return; }
    const W = new THREE.Matrix4().fromArray(rootJson.transform);
    // until the answer: centred (upright), not on the equator
    asWritten();
    void relocFn(rootJson).then((res) => {
      if (key !== relocKey) return;
      if (!res.ok || !res.transform || res.transform.length !== 16) {
        asWritten();
        relocState = { key, residual_max_m: null, error: res.error ?? "refused" };
      } else {
        setGroup(new THREE.Matrix4().makeRotationX(-Math.PI / 2)
          .multiply(new THREE.Matrix4().fromArray(res.transform))
          .multiply(W.clone().invert()));
        placed = "relocated";
        relocState = { key, residual_max_m: typeof res.residual_max_m === "number" ? res.residual_max_m : null,
          ...(res.via ? { via: res.via } : {}), ...(res.bridgeError ? { bridgeError: res.bridgeError } : {}) };
      }
      leafRead = null;
      changed();
    });
  };
  tiles.addEventListener("load-tileset", changed);

  const tileOf = (obj: any): any | null => {
    for (let o = obj; o; o = o.parent) {
      const t = sceneToTile.get(o);
      if (t) return t;
    }
    return null;
  };
  const descends = (t: any, from: any): boolean => {
    for (let p = t?.parent; p; p = p.parent) if (p === from) return true;
    return false;
  };

  // MICRO tileset dritto e nitido · a loaded tile the view no longer uses,
  // whose children are loaded and used, leaves the memory now — not when the
  // cache overflows (REPLACE: the children cover it)
  let frame = 0;
  const releaseAncestors = () => {
    const c = tiles.lruCache;
    if (!c?.itemList) return;
    const loaded = (t: any) => !t.internal?.hasContent || t.internal?.loadingState === LOADED_STATE;
    for (const t of [...c.itemList]) {
      if (c.isUsed(t) || t.refine === "ADD" || !t.internal?.hasRenderableContent || t.internal?.loadingState !== LOADED_STATE) continue;
      const kids = t.children ?? [];
      if (!kids.length || !kids.every(loaded) || !kids.some((k: any) => c.isUsed(k))) continue;
      c.remove(t);
    }
  };

  const layer: TilesLayer = {
    object: tiles.group,
    update() {
      camera.updateMatrixWorld();
      tiles.update();
      if (++frame % 10 === 0) releaseAncestors();
    },
    setMode(m) {
      if (m === mode) return;
      if (m === "manual") {
        // «si resta al livello caricato»: what is refined now is what was asked
        asked.clear();
        history.length = 0;
        const walk = (t: any) => {
          const kids = t.children ?? [];
          const shown = kids.some((c: any) => c.traversal?.used);
          if (t.traversal?.used && shown) { asked.add(t); history.push(t); }
          for (const c of kids) walk(c);
        };
        if (tiles.root) walk(tiles.root);
      }
      mode = m;
      changed();
    },
    mode: () => mode,
    refineAt(obj) {
      const t = tileOf(obj);
      if (!t) return "none";
      // an implicit tile's children are made when its subtree is read: a tile
      // whose level is below the tree's declared depth can still have them
      const implicitMore = !!t.implicitTilingData
        && levelOf(t) < ((t.implicitTilingData.root?.implicitTiling?.availableLevels ?? 1) - 1);
      if (!(t.children?.length) && !implicitMore) return "leaf";
      if (asked.has(t)) return "refined";
      asked.add(t);
      history.push(t);
      changed();
      return "refined";
    },
    coarsen() {
      const t = history.pop();
      if (!t) return false;
      asked.delete(t);
      // what was asked under it goes with it
      for (const x of [...asked]) if (descends(x, t)) asked.delete(x);
      for (let i = history.length - 1; i >= 0; i--) if (!asked.has(history[i])) history.splice(i, 1);
      changed();
      return true;
    },
    status() {
      let lo = Infinity, hi = -Infinity, visible = 0;
      for (const t of tiles.visibleTiles as Set<any>) {
        if (!t.engineData?.scene) continue;
        visible++;
        const l = levelOf(t);
        lo = Math.min(lo, l); hi = Math.max(hi, l);
      }
      let loaded = 0;
      tiles.forEachLoadedModel(() => { loaded++; });
      const s = tiles.stats ?? {};
      return {
        mode, level: visible ? [lo, hi] : null, depth: deepest, loaded, visible,
        bytes: Number(tiles.lruCache?.cachedBytes ?? 0), missing: missing.slice(), failed,
        asked: asked.size, busy: (s.downloading ?? 0) + (s.parsing ?? 0) + (s.queued ?? 0) > 0,
        maxBytes: Number(tiles.lruCache?.maxBytesSize ?? 0), placed, ge, textures: { ...texStats },
      };
    },
    bounds() {
      const b = new THREE.Box3();
      if (!tiles.getBoundingBox(b)) return null;
      tiles.group.updateMatrixWorld(true);
      return b.applyMatrix4(tiles.group.matrixWorld);
    },
    resize() { tiles.setResolutionFromRenderer(camera, renderer); },
    setCamera(next: any) {
      if (next === camera) return;
      tiles.deleteCamera?.(camera);
      camera = next;
      tiles.setCamera(camera);
      tiles.setResolutionFromRenderer(camera, renderer);
    },
    onChange(cb) { listeners.push(cb); },
    dispose() {
      listeners.length = 0;
      tiles.dispose();
      tiles.group.removeFromParent?.();
    },
    loadedFiles() {
      const out: string[] = [];
      tiles.forEachLoadedModel((_s: any, t: any) => {
        const u = t?.content?.uri;
        if (u) out.push(String(u));
      });
      return out.sort();
    },
    centreOf(uri) {
      let found: any = null;
      const walk = (t: any) => {
        if (found || !t) return;
        if (t.content?.uri === uri) { found = t; return; }
        for (const c of t.children ?? []) walk(c);
      };
      walk(tiles.root);
      const bv = found?.engineData?.boundingVolume;
      if (!bv) return null;
      const b = new THREE.Box3();
      bv.getAABB(b);
      tiles.group.updateMatrixWorld(true);
      return b.applyMatrix4(tiles.group.matrixWorld).getCenter(new THREE.Vector3());
    },
    contentBox() {
      const b = new THREE.Box3();
      tiles.group.updateMatrixWorld(true);
      // only the tiles IN the scene: a loaded tile that is not shown has no
      // parent, and its box would be read in its own glTF frame
      tiles.forEachLoadedModel((sc: any) => { if (sc.parent) b.expandByObject(sc); });
      return b.isEmpty() ? null : b;
    },
    boxOf(uri) {
      let box: any = null;
      tiles.group.updateMatrixWorld(true);
      tiles.forEachLoadedModel((sc: any, t: any) => {
        if (t?.content?.uri === uri && sc.parent) box = new THREE.Box3().setFromObject(sc);
      });
      return box;
    },
    // with a frame, the root is ready where it will stay: once relocated (or refused)
    rootReady: () => rootReady && !(relocKey && relocState?.key !== relocKey),
    relocate(key, fn) {
      const k = fn ? key : "";
      if (k === relocKey) return;
      relocKey = k;
      relocFn = fn;
      applyRelocation();
    },
    relocated: () => {
      const r = relocState ?? (relocKey ? { key: relocKey, residual_max_m: null, error: rootJson ? "pending" : "waiting-root" } : null);
      return r ? { ...r, placed } : null;
    },
    up() {
      if (!rootJson) return null;
      tiles.group.updateMatrixWorld(true);
      const m = tiles.group.matrixWorld.clone();
      if (rootJson.transform) m.multiply(new THREE.Matrix4().fromArray(rootJson.transform));
      const v = new THREE.Vector3(0, 0, 1).transformDirection(m);
      return [v.x, v.y, v.z];
    },
    setErrorScale(v) {
      scaleChoice = v === "auto" || !(Number(v) > 0) ? "auto" : Number(v);
      ge = geOf(tiles.root);
      changed();
    },
    leaves() {
      leafRead ??= (async () => {
        // the renderer's road: its plugins turn the URL (an archive's base) and fetch it (signed, from the archive)
        const readJson = async (u: string): Promise<Record<string, unknown> | null> => {
          let pu = u;
          tiles.invokeAllPlugins((p: any) => { pu = p.preprocessURL ? p.preprocessURL(pu, null) : pu; });
          try {
            const res = await tiles.invokeOnePlugin((p: any) => p.fetchData && p.fetchData(pu, tiles.fetchOptions));
            if (!(res instanceof Response)) return res ?? null;
            return res.ok ? await res.json() : null;
          } catch { return null; }
        };
        const r = await readLeaves(new URL(url, document.baseURI).href, readJson);
        if (!r) return null;
        tiles.group.updateMatrixWorld(true);
        const m = tiles.group.matrixWorld;
        const world = r.boxes.map((b): Box => {
          const w = new THREE.Box3(new THREE.Vector3(...b[0]), new THREE.Vector3(...b[1])).applyMatrix4(m);
          return [[w.min.x, w.min.y, w.min.z], [w.max.x, w.max.y, w.max.z]];
        });
        return { ...r, boxes: world };
      })();
      return leafRead;
    },
  };
  return layer;
}

/** Bytes as a person reads them. */
export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} kB`;
  return `${n} B`;
}

export interface TilesBarTexts {
  manual: string;
  auto: string;
  modeTitle: string;
  more: string;
  moreTitle: string;
  less: string;
  lessTitle: string;
  /** the status line */
  status: (s: TilesStatus) => string;
  leaf: string;
  noTile: string;
  /** MICRO tileset dritto e nitido · the errors' multiplier: its title, «auto (×16)», «×4» */
  geTitle: string;
  geAuto: (scale: number) => string;
}

/**
 * The tileset's own controls: the switch Manuale | Automatico, «Più dettaglio
 * qui» (armed: the next click on the model refines the tile under it, and it
 * stays armed to go further down), «Meno dettaglio», and the status line.
 * `armed()` is what the viewer asks on a click.
 */
export function tilesBar(layer: TilesLayer, texts: TilesBarTexts): { el: HTMLElement; armed(): boolean; picked(what: "refined" | "leaf" | "none"): void; refresh(): void } {
  const el = document.createElement("div");
  el.className = "tl-bar";
  const seg = document.createElement("span");
  seg.className = "tl-seg";
  seg.setAttribute("role", "group");
  seg.title = texts.modeTitle;
  const modeBtn = (m: RefineMode, label: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.mode = m;
    b.textContent = label;
    b.addEventListener("click", (e) => { e.stopPropagation(); layer.setMode(m); refresh(); });
    seg.appendChild(b);
    return b;
  };
  const bMan = modeBtn("manual", texts.manual);
  const bAuto = modeBtn("auto", texts.auto);
  const more = document.createElement("button");
  more.type = "button";
  more.className = "tl-more";
  more.dataset.tiles = "more";
  more.textContent = texts.more;
  more.title = texts.moreTitle;
  let armed = false;
  more.addEventListener("click", (e) => { e.stopPropagation(); armed = !armed; refresh(); });
  const less = document.createElement("button");
  less.type = "button";
  less.className = "tl-less";
  less.dataset.tiles = "less";
  less.textContent = texts.less;
  less.title = texts.lessTitle;
  less.addEventListener("click", (e) => { e.stopPropagation(); layer.coarsen(); refresh(); });
  // MICRO tileset dritto e nitido · the errors' multiplier (automatic mode)
  const ge = document.createElement("select");
  ge.className = "tl-ge";
  ge.dataset.tiles = "error-scale";
  ge.title = texts.geTitle;
  for (const v of ["auto", "1", "2", "4", "8", "16", "32", "64"]) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v === "auto" ? texts.geAuto(1) : `×${v}`;
    ge.appendChild(o);
  }
  ge.addEventListener("click", (e) => e.stopPropagation());
  ge.addEventListener("change", (e) => { e.stopPropagation(); layer.setErrorScale(ge.value === "auto" ? "auto" : Number(ge.value)); refresh(); });
  const line = document.createElement("span");
  line.className = "tl-status";
  line.setAttribute("role", "status");
  let note = "";
  el.append(seg, more, less, ge, line);
  const refresh = () => {
    const s = layer.status();
    const manual = s.mode === "manual";
    bMan.setAttribute("aria-pressed", String(manual));
    bAuto.setAttribute("aria-pressed", String(!manual));
    if (!manual) armed = false;
    more.disabled = !manual;
    less.disabled = !manual || s.asked === 0;
    more.setAttribute("aria-pressed", String(armed));
    el.classList.toggle("armed", armed);
    line.textContent = texts.status(s) + (note ? ` · ${note}` : "");
    ge.disabled = manual;
    const autoOpt = ge.options[0];
    if (autoOpt) autoOpt.textContent = texts.geAuto(s.ge?.auto ? s.ge.scale : 1);
    el.dataset.errorScale = String(s.ge?.scale ?? 1);
    el.dataset.placed = s.placed;
    line.classList.toggle("bad", !!(s.missing.length || s.failed));
    el.dataset.level = s.level ? `${s.level[0]}-${s.level[1]}` : "";
    el.dataset.loaded = String(s.loaded);
    el.dataset.missing = String(s.missing.length);
  };
  layer.onChange(() => { note = ""; refresh(); });
  refresh();
  return {
    el,
    armed: () => armed,
    picked(what) {
      note = what === "leaf" ? texts.leaf : what === "none" ? texts.noTile : "";
      refresh();
    },
    refresh,
  };
}
