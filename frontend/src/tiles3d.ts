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
 */
import { engine } from "./embed3d-native";

export type RefineMode = "manual" | "auto";

let tilesPromise: Promise<any> | null = null;

/** 3DTilesRendererJS, loaded once — after three. RISORSA-FILE: with it, the
 *  `.3tz` reader (`tiles3tz.ts`), so an archive costs nothing until the first
 *  tileset opens — the same moment the renderer itself arrives. */
export async function tilesEngine(): Promise<{ TilesRenderer: any; ImplicitTilingPlugin: any;
    Archive3tz: any; Tiles3tzPlugin: any; sourceFor: any; archiveBase: any;
    DRACOLoader: any; GLTFExtensionsPlugin: any; DRACO_FILES: Record<string, string> }> {
  if (!tilesPromise) {
    // a CONSTANT condition, as in `engine()`: the other arm leaves the build
    tilesPromise = __EM_LAZY_3D__
      ? engine().then(() => import(/* @vite-ignore */ new URL("./tiles3d.js", document.baseURI).href))
      : (async () => {
          const [r, p, z, d, x, w, m] = await Promise.all([import("3d-tiles-renderer/three"),
            import("3d-tiles-renderer/core/plugins"), import("./tiles3tz"),
            import("three/examples/jsm/loaders/DRACOLoader.js"), import("3d-tiles-renderer/src/three/plugins/GLTFExtensionsPlugin.js"),
            import("../node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url"),
            import("../node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url")]);
          return { TilesRenderer: r.TilesRenderer, ImplicitTilingPlugin: p.ImplicitTilingPlugin,
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
}

export interface TilesOptions {
  mode?: RefineMode;
  /** the memory ceiling of the automatic mode, MB (the preferences) */
  memoryMB?: number;
}

let draco: any = null;
/** The one Draco decoder (wasm, the files bundled with three): tilesets, and
 *  the Space's glb models (a web version is Draco-compressed). */
export function dracoFor(E: any, T: any): any {
  if (draco) return draco;
  const manager = new E.THREE.LoadingManager();
  manager.setURLModifier((u: string) => T.DRACO_FILES[String(u).split("/").pop() ?? ""] ?? u);
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
export function createTilesLayer(E: any, T: any, url: string, camera: any, renderer: any,
                                 opts: TilesOptions = {}): TilesLayer {
  const { THREE } = E;
  // RISORSA-FILE · a `.3tz`: the tileset is asked under a base nobody serves,
  // and the plugin answers every file of it from the archive — opened from its
  // end (the index), then each tile at its offset (tiles3tz.ts)
  let archivePlugin: any = null;
  if (isArchive3tzUrl(url) && T.Tiles3tzPlugin) {
    const base = T.archiveBase();
    const archive = T.sourceFor(url).then((src: any) => T.Archive3tz.open(src));
    archivePlugin = new T.Tiles3tzPlugin(archive, base);
    url = `${base}tileset.json`;
  }
  const tiles = new T.TilesRenderer(url);
  if (archivePlugin) tiles.registerPlugin(archivePlugin);
  tiles.registerPlugin(new T.ImplicitTilingPlugin());
  // RISORSA-FILE · Draco-compressed tiles (TempluMare's b3dm): ONE decoder for
  // the page, its two files served from the engine's own (never a CDN)
  if (T.DRACOLoader && T.GLTFExtensionsPlugin) tiles.registerPlugin(new T.GLTFExtensionsPlugin({ dracoLoader: dracoFor(E, T) }));
  // Z-up → Y-up: the one rotation (see the header)
  tiles.group.rotation.x = -Math.PI / 2;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  const mb = Math.max(64, opts.memoryMB ?? 400);
  tiles.lruCache.maxBytesSize = mb * 1024 * 1024;
  tiles.lruCache.minBytesSize = Math.round(mb * 0.75) * 1024 * 1024;

  let mode: RefineMode = opts.mode ?? "manual";
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
  tiles.calculateTileViewError = (tile: any, target: any) => {
    viewError(tile, target);
    if (mode === "manual") target.error = asked.has(tile) || !tile.internal?.hasRenderableContent ? 1e9 : 0;
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
  tiles.addEventListener("load-root-tileset", () => { rootReady = true; changed(); });
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

  const layer: TilesLayer = {
    object: tiles.group,
    update() {
      camera.updateMatrixWorld();
      tiles.update();
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
      };
    },
    bounds() {
      const b = new THREE.Box3();
      if (!tiles.getBoundingBox(b)) return null;
      tiles.group.updateMatrixWorld(true);
      return b.applyMatrix4(tiles.group.matrixWorld);
    },
    resize() { tiles.setResolutionFromRenderer(camera, renderer); },
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
    rootReady: () => rootReady,
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
  const line = document.createElement("span");
  line.className = "tl-status";
  line.setAttribute("role", "status");
  let note = "";
  el.append(seg, more, less, line);
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
