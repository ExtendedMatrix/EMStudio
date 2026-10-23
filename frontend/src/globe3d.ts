/**
 * MICRO-GEOGLOBO · the globe in the Space's three.js scene.
 *
 * The decisions are `geoglobe.ts`'s (pure, checked in node); this module puts
 * them on the GPU with what `3d-tiles-renderer` 0.5.3 already offers:
 *
 *   · the SURFACE is a `TilesRenderer` with `TerrariumMeshPlugin` on the WGS84
 *     ellipsoid: Terrarium elevation tiles (Mapterhorn) displace the tiles on
 *     the GPU. Below `BUDGET.terrainMinZoom` no elevation tile is asked: the
 *     plugin is handed a flat one (osiris's rule, terrain only from the site's
 *     zoom); a hidden terrain is the same flat tile and `heightScale` 0;
 *   · the IMAGES are `XYZTilesOverlay`s in an `ImageOverlayPlugin` — the
 *     basemaps and the rasters (a raster is its PMTiles, served tile by tile by
 *     the bridge's `/tiles/pm/...`), in the panel's order, each with its opacity;
 *   · the FRAME: the tiles' group carries the inverse of the site's ENU frame,
 *     so the Earth sits around the scene and the site's models keep their small
 *     coordinates (`siteFrame`);
 *   · the HANDS: Google Earth's (`geo-hands.ts`: grab, turn and tilt around the
 *     point under the cursor, zoom to it, north up and a compass) in the globe
 *     and the plan, the Space's own (Blender's) in the site. The passage by the
 *     altitude only changes the hands, never in the middle of a gesture: the
 *     camera does not move, nothing jumps. A mode chosen in the bar flies there
 *     (`flyAt`), around the Earth;
 *   · a raster may also lie on a PLANE at the site's height (its corners in the
 *     project's CRS → the scene's metres: exact, no reprojection).
 *
 * `scene3d.ts` hands the scene over through `GeoDriver` and calls `update()` once
 * a frame; the probes read `host.__geo()`.
 */
import { tilesEngine } from "./tiles3d";
import { createGeoHands, poseBasis, poseFromCameraUp, hitEllipsoid, type GeoHands, type Pose } from "./geo-hands";
import { fingersOf, trackpadClassifier } from "./wheel-kind";
import {
  BUDGET, applyM4, autoMode, attributionOf, earthCentreLocal, ecefToGeodetic, flyAt, flyMs, imageOrder, invertRigid, localToLonLat,
  siteFrame, siteHeight, sourceById, tileTemplate, WGS84, type GeoLayer, type GeoMode, type HeightMode, type SiteAnchor,
  type SiteHeight, type V3,
} from "./geoglobe";
import type { GeoCtx, GeoDriver } from "./scene3d";

export interface GlobeOptions {
  /** the anchor as measured; its `h` is the shift's z (how it is applied is
   *  `siteHeight`'s, here, once the models' heights are known) */
  anchor: SiteAnchor;
  /** MICRO-GLOBO-INTERAZIONE p.1 · the person's choice for the shift's z */
  heightMode?: HeightMode;
  /** the GeoPositionNode's `shift_z_in_coordinates`, when it says it */
  zInCoords?: boolean | null;
  /** the height was decided (or decided again) */
  onHeight?: (h: SiteHeight) => void;
  /** the GeoPositionNode's shift and rotation: a raster on a plane is placed by them */
  shift?: { x: number; y: number; rotation: number; epsg: number };
  layers: GeoLayer[];
  /** the bridge (its tiles: cache, packages), or null: the sources online */
  bridge: string | null;
  /** the project's folders of packages (`<em.json folder>/geo`) */
  pkgDirs: string[];
  /** the mode changed: by hand (the bar) or by the altitude */
  onMode?: (m: GeoMode, why: "hand" | "auto") => void;
  /** words: the attribution's prefix */
  attributionTitle?: string;
  /** words: the compass's tooltip */
  compassTitle?: string;
  /** MICRO-GEOREF-GRAFO p.0b · the terrain cut under the models' footprint in the
   *  site (and its margin, metres); default on, 10 m */
  clip?: { on: boolean; margin: number };
}

export interface GlobeApi extends GeoDriver {
  setLayers(l: GeoLayer[]): void;
  setMode(m: GeoMode): void;
  mode(): GeoMode;
  /** MICRO-GLOBO-INTERAZIONE p.1 · how the shift's z is applied */
  setHeightMode(m: HeightMode): void;
  height(): SiteHeight;
  /** «Vai al sito»: the flight to the site's framing */
  goToSite(): void;
  /** MICRO-GEOREF-GRAFO p.0b · the terrain cut under the site: on/off, the margin (m) */
  setClip(on: boolean, margin: number): void;
  state(): GlobeState;
}

export interface GlobeState {
  ready: boolean;
  mode: GeoMode;
  flying: boolean;
  altitude: number | null;
  lon: number | null;
  lat: number | null;
  tiles: { loaded: number; visible: number; downloading: number; parsing: number; failed: number };
  /** three's count of the tiles' bytes (geometry + textures) and its ceiling */
  bytes: number;
  maxBytes: number;
  overlays: string[];
  terrainAsked: number;
  terrainFlat: number;
  attribution: string[];
  error: string | null;
  height: SiteHeight;
  /** MICRO-GLOBO-INTERAZIONE p.2 · the hands, the camera as a pose, the compass's heading (null: hidden) */
  hands: { enabled: boolean; busy: boolean; last: Record<string, unknown> | null };
  pose: Pose | null;
  compass: number | null;
  lastSwitch: { from: GeoMode; to: GeoMode; why: "hand" | "auto"; at: number; posBefore: V3; posAfter: V3 } | null;
  /** MICRO-GEOREF-GRAFO p.0b · the terrain's cut: asked, drawn now (the site's footprint
   *  plus the margin, three's x/z), and how many of the tiles' materials carry it */
  clip: { on: boolean; margin: number; box: [number, number, number, number] | null; materials: number };
}

const arr = (v: any): V3 => [v.x, v.y, v.z];

export function createGlobe(o: GlobeOptions): GlobeApi {
  let ctx: GeoCtx | null = null;
  let T: any = null;
  let tiles: any = null;
  let terrain: any = null;
  let overlayPlugin: any = null;
  /** MICRO-GLOBO-INTERAZIONE p.2 · the hands of the globe and the plan, and the compass */
  let geoHands: GeoHands | null = null;
  let compassEl: HTMLButtonElement | null = null;
  let compassDeg = NaN;
  let mode: GeoMode = "site";
  let layers = o.layers;
  let error: string | null = null;
  let flight: { from: { pos: V3; target: V3 }; to: { pos: V3; target: V3 }; t0: number; ms: number; then: GeoMode } | null = null;
  const overlays = new Map<string, { ov: any; sig: string }>();
  const planes = new Map<string, { mesh: any; sig: string }>();
  let terrainAsked = 0, terrainFlat = 0;
  /** the last passage between two modes, and where the camera was on each side of it */
  let lastSwitch: GlobeState["lastSwitch"] = null;
  let flatTile: Promise<Blob> | null = null;
  let lastCam: any = null;
  let attribEl: HTMLElement | null = null;
  let savedRatio: number | null = null;
  // MICRO-GEOREF-GRAFO p.0b · the terrain cut under the site. Measured (23 Oct): the
  // Copernicus surface (30 m, with its trees) stands a little over the GT16's ground
  // and pierces the survey. In the site the global terrain is cut on the models'
  // footprint (their box in plan, the margin around it), in the globe and the plan
  // it is whole: four clipping planes whose intersection is cut (`clipIntersection`),
  // on every material of the tiles — a material cloned by a plugin is found again
  let clip = { on: o.clip?.on ?? true, margin: Number.isFinite(o.clip?.margin) ? Math.max(0, o.clip!.margin) : 10 };
  let clipPlanes: any[] | null = null;
  let clipBox: [number, number, number, number] | null = null;
  let clipMaterials = 0;
  let clipTick = 0;
  let savedLocalClipping: boolean | null = null;
  const clipNow = (): [number, number, number, number] | null => {
    if (!clip.on || mode !== "site" || flight) return null;
    const b = ctx?.contentBox?.();
    if (!b) return null;
    const m = clip.margin;
    return [b[0][0] - m, b[0][2] - m, b[1][0] + m, b[1][2] + m];   // x0 z0 x1 z1
  };
  const applyClip = (force = false) => {
    if (!ctx || !tiles) return;
    const box = clipNow();
    if (box && !clipPlanes) {
      const P = ctx.THREE.Plane, V = ctx.THREE.Vector3;
      // outward normals: a point inside the box is behind all four, and only there is it cut
      clipPlanes = [new P(new V(1, 0, 0), 0), new P(new V(-1, 0, 0), 0), new P(new V(0, 0, 1), 0), new P(new V(0, 0, -1), 0)];
    }
    if (box && clipPlanes) {
      clipPlanes[0].constant = -box[2]; clipPlanes[1].constant = box[0];
      clipPlanes[2].constant = -box[3]; clipPlanes[3].constant = box[1];
    }
    const changed = JSON.stringify(box) !== JSON.stringify(clipBox);
    clipBox = box;
    if (!changed && !force && ++clipTick % 15 !== 0) return;
    const want = box ? clipPlanes : null;
    let n = 0;
    tiles.group.traverse((q: any) => {
      if (!q.isMesh || !q.material) return;
      for (const mat of Array.isArray(q.material) ? q.material : [q.material]) {
        if (mat.clippingPlanes !== want) {
          const was = mat.clippingPlanes?.length ?? 0;
          mat.clippingPlanes = want;
          mat.clipIntersection = true;
          if (was !== (want?.length ?? 0)) mat.needsUpdate = true;
        }
        if (want) n++;
      }
    });
    clipMaterials = n;
  };
  // MICRO-GLOBO-INTERAZIONE p.1 · the shift's z applied ONCE: the origin's
  // height is decided on the models' heights (`siteHeight`), when they come
  const anchor: SiteAnchor = { ...o.anchor };
  let heightMode: HeightMode = o.heightMode ?? "auto";
  const contentY = (): { minY: number; maxY: number } | null => {
    const b = ctx?.contentBox?.();
    return b ? { minY: b[0][1], maxY: b[1][1] } : null;
  };
  let height: SiteHeight = siteHeight(o.anchor.h, null, heightMode, o.zInCoords ?? null);
  let frame = siteFrame(anchor);
  let centre = earthCentreLocal(anchor);
  const reframe = () => {
    anchor.h = height.h;
    anchor.siteH = height.h + (height.contentMid ?? 0);
    frame = siteFrame(anchor);
    centre = earthCentreLocal(anchor);
    if (tiles) {
      const g = tiles.group;
      g.matrix.fromArray(invertRigid(frame));
      g.matrixWorldNeedsUpdate = true;
    }
  };
  const decideHeight = () => {
    const next = siteHeight(o.anchor.h, contentY(), heightMode, o.zInCoords ?? null);
    const changed = next.h !== height.h || next.applied !== height.applied || next.reason !== height.reason;
    height = next;
    reframe();
    if (changed || !decided) o.onHeight?.(height);
    decided = true;
  };
  let decided = false;
  reframe();

  /** the flat Terrarium tile: elevation 0 (R 128, G 0, B 0) */
  const flat = (size: number): Promise<Blob> => (flatTile ??= new Promise<Blob>((res, rej) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgb(128,0,0)";
    g.fillRect(0, 0, size, size);
    c.toBlob((b) => (b ? res(b) : rej(new Error("no canvas blob"))), "image/png");
  }));

  const terrainLayer = () => layers.find((l) => l.kind === "terrain" && l.visible);
  const terrainSource = () => sourceById(terrainLayer()?.source ?? layers.find((l) => l.kind === "terrain")?.source ?? "mapterhorn")!;

  const buildTiles = () => {
    if (!ctx || !T) return;
    const { THREE, scene, renderer } = ctx;
    const src = terrainSource();
    const template = tileTemplate(src, o.bridge, o.pkgDirs[0] ?? null);
    const zRe = new RegExp("^" + template.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace("\\{z\\}", "(\\d+)").replace("{z}", "(\\d+)")
      .replace("{x}", "(\\d+)").replace("{y}", "(\\d+)"));
    // the terrain only from the site's zoom: a flat tile below, and when hidden
    const Base: new (opts: Record<string, unknown>) => any = T.TerrariumMeshPlugin;
    class BudgetTerrain extends Base {
      async loadRootTileset() {
        const out = await super.loadRootTileset();
        const source = (this as any)._source;
        const ask = source.fetchData;
        source.fetchData = (url: string, opts: any) => {
          const m = zRe.exec(url);
          const z = m ? Number(m[1]) : 99;
          if (z < BUDGET.terrainMinZoom || !terrainLayer()) {
            terrainFlat++;
            return flat(src.tileSize).then((b) => new Response(b, { status: 200, headers: { "Content-Type": "image/png" } }));
          }
          terrainAsked++;
          return ask(url, opts);
        };
        return out;
      }
    }
    tiles = new T.TilesRenderer();
    // its own memory and queues: the defaults are module-wide (every tileset of the
    // Space shares them), and a surface rebuilt must not inherit a queue whose
    // jobs belonged to the one disposed (measured: refinement stopped after a rebuild)
    const lru = new T.LRUCache();
    lru.unloadPriorityCallback = tiles.lruCache.unloadPriorityCallback;
    lru.maxBytesSize = BUDGET.lruMaxBytes;
    lru.minBytesSize = BUDGET.lruMinBytes;
    tiles.lruCache = lru;
    const dq = new T.DownloadPriorityQueue();
    dq.priorityCallback = tiles.downloadQueue.priorityCallback;
    dq.maxJobsPerOrigin = BUDGET.maxJobs;
    tiles.downloadQueue = dq;
    for (const k of ["parseQueue", "processNodeQueue"]) {
      const q = new T.PriorityQueue();
      q.maxJobs = tiles[k].maxJobs;
      q.priorityCallback = tiles[k].priorityCallback;
      tiles[k] = q;
    }
    terrain = new BudgetTerrain({
      url: template, tileDimension: src.tileSize, maxZoom: Math.min(src.maxZoom, BUDGET.terrainMaxZoom),
      useRecommendedSettings: false,
    });
    terrain.heightScale = terrainLayer() ? 1 : 0;
    tiles.registerPlugin(terrain);
    // no tile splitting: measured (23 Oct), the virtual children it makes to match
    // a raster's deep tiles do not carry the terrain's GPU displacement — a raised
    // block with holes around it. A raster draped on the terrain is drawn at the
    // terrain tiles' resolution; at the site's scale it goes on a plane, whole
    overlayPlugin = new T.ImageOverlayPlugin({ resolution: BUDGET.overlayResolution, enableTileSplitting: false });
    tiles.registerPlugin(overlayPlugin);
    {
      const q = new T.PriorityQueue();
      q.maxJobs = overlayPlugin.processQueue.maxJobs;
      q.priorityCallback = overlayPlugin.processQueue.priorityCallback;
      overlayPlugin.processQueue = q;
    }
    tiles.errorTarget = BUDGET.errorTarget;
    tiles.addEventListener?.("load-error", (e: any) => { error = String(e?.error?.message ?? e?.error ?? "load error"); });
    // a tile come: its material is cut at the next frame, not a quarter of a second later
    tiles.addEventListener?.("load-model", () => { clipTick = 14; });
    // the Earth around the site: the group carries the inverse of the site's frame
    const g = tiles.group;
    g.matrixAutoUpdate = false;
    g.matrix.fromArray(invertRigid(frame));
    g.matrixWorldNeedsUpdate = true;
    g.userData.geo = true;
    scene.add(g);
    tiles.setCamera(ctx.camera());
    tiles.setResolutionFromRenderer(ctx.camera(), renderer);
    lastCam = ctx.camera();
    applyLayers();
    void THREE;
  };

  const overlaySig = (l: GeoLayer, i: number) => `${l.kind}|${l.source ?? l.path}|${i}`;
  /** a raster's overlay knows its box: without it (measured, 23 Oct) the surface
   *  was split to the raster's deepest level EVERYWHERE in view, 2892 requests
   *  of transparent tiles at z17 for a 200 m orthophoto, and the refinement of
   *  the rest stopped behind them */
  let Bounded: any = null;
  const boundedOverlay = () => (Bounded ??= class extends T.XYZTilesOverlay {
    box: [number, number, number, number];
    constructor(opts: Record<string, unknown>, box: [number, number, number, number]) { super(opts); this.box = box; }
    _initImageSource() {
      const r = Math.PI / 180;
      return super._initImageSource().then(() => { this.tiling.setContentBounds(this.box[0] * r, this.box[1] * r, this.box[2] * r, this.box[3] * r); });
    }
  });
  /** the overlays a list draws on the terrain (a raster on a plane is a mesh of its own) */
  const drapedIds = (l: GeoLayer[]) => imageOrder(l).filter((x) => x.visible && !(x.kind === "raster" && x.plane)
    && (x.kind === "imagery" ? !!sourceById(x.source ?? "") : !!(o.bridge && x.path))).map((x) => x.id);
  /** measured (23 Oct): adding or deleting an overlay on tiles already drawn leaves
   *  their material's LAYER_COUNT and its `layerInfo` uniform out of step
   *  (three: «Cannot read properties of undefined (reading 'color')» at every
   *  frame). A different set of draped overlays rebuilds the surface with them
   *  from the start; an opacity or an order does not */
  const rebuildTiles = () => {
    if (!ctx || !tiles) return;
    for (const h of overlays.values()) overlayPlugin?.deleteOverlay(h.ov);
    overlays.clear();
    tiles.group.removeFromParent();
    tiles.dispose();
    tiles = null;
    buildTiles();
    hands(mode, mode, false);
  };
  const applyLayers = () => {
    if (!ctx || !T || !overlayPlugin) return;
    const { THREE } = ctx;
    if (terrain) terrain.heightScale = terrainLayer() ? 1 : 0;
    const wantIds = drapedIds(layers);
    const differs = wantIds.length !== overlays.size || wantIds.some((id) => !overlays.has(id));
    if (differs && tiles && (tiles.stats?.loaded ?? 0) > 0) { rebuildTiles(); return; }
    const images = imageOrder(layers);
    const want = new Set<string>();
    images.forEach((l, i) => {
      if (!l.visible || (l.kind === "raster" && l.plane)) return;
      want.add(l.id);
      let url: string | null = null, levels = 20, dim = 256;
      if (l.kind === "imagery") {
        const s = sourceById(l.source ?? "");
        if (!s) return;
        url = tileTemplate(s, o.bridge, o.pkgDirs[0] ?? null);
        levels = s.maxZoom + 1;
        dim = s.tileSize;
      } else if (l.kind === "raster" && o.bridge && l.path) {
        url = `${o.bridge.replace(/\/$/, "")}/tiles/pm/{z}/{x}/{y}.png?path=${encodeURIComponent(l.path)}`;
        levels = (l.maxZoom ?? 20) + 1;
      }
      if (!url) return;
      const sig = overlaySig(l, i);
      const have = overlays.get(l.id);
      if (have && have.sig.split("|").slice(0, 2).join("|") === sig.split("|").slice(0, 2).join("|")) {
        have.ov.opacity = l.opacity;
        overlayPlugin.setOverlayOrder(have.ov, i);
        have.sig = sig;
        return;
      }
      if (have) { overlayPlugin.deleteOverlay(have.ov); overlays.delete(l.id); }
      const ov = l.kind === "raster" && l.bounds ? new (boundedOverlay())({ url, levels, tileDimension: dim, opacity: l.opacity }, l.bounds)
        : new T.XYZTilesOverlay({ url, levels, tileDimension: dim, opacity: l.opacity });
      ov.downloadQueue = tiles.downloadQueue;
      overlayPlugin.addOverlay(ov, i);
      overlays.set(l.id, { ov, sig });
    });
    for (const [id, h] of overlays) if (!want.has(id)) { overlayPlugin.deleteOverlay(h.ov); overlays.delete(id); }
    overlayPlugin._markNeedsUpdate?.();
    // the rasters on a plane at the site's height
    const wantPlanes = new Set<string>();
    for (const l of images) {
      if (l.kind !== "raster" || !l.plane || !l.visible || !o.bridge || !o.shift || !l.original) continue;
      wantPlanes.add(l.id);
      const sig = `${l.original}|${l.opacity}`;
      const have = planes.get(l.id);
      if (have && have.sig.startsWith(l.original)) { have.mesh.material.opacity = l.opacity; have.sig = sig; continue; }
      void makePlane(l).then((mesh) => {
        if (!mesh || !ctx) return;
        planes.get(l.id)?.mesh.removeFromParent();
        ctx.scene.add(mesh);
        planes.set(l.id, { mesh, sig });
      });
    }
    for (const [id, h] of planes) if (!wantPlanes.has(id)) { h.mesh.removeFromParent(); h.mesh.geometry.dispose(); h.mesh.material.map?.dispose(); h.mesh.material.dispose(); planes.delete(id); }
    drawAttribution();
    void THREE;
  };

  /** a raster on the site's plane: its corners in the project's CRS → the scene */
  const makePlane = async (l: GeoLayer): Promise<any> => {
    if (!ctx || !o.bridge || !o.shift || !l.original) return null;
    const { THREE } = ctx;
    const base = o.bridge.replace(/\/$/, "");
    const info = await fetch(`${base}/geo/raster-info?path=${encodeURIComponent(l.original)}&target=${o.shift.epsg}`).then((r) => r.json()).catch(() => null);
    const c: [number, number][] | undefined = info?.corners_target;
    if (!c || c.length !== 4) return null;
    const th = (o.shift.rotation * Math.PI) / 180;
    const local = (X: number, Y: number): V3 => {
      const dx = X - o.shift!.x, dy = Y - o.shift!.y;
      const x = dx * Math.cos(th) - dy * Math.sin(th);
      const y = dx * Math.sin(th) + dy * Math.cos(th);
      return [x, 0, -y];          // data (x, y) → three (x, z = −y), on the site's plane
    };
    const pts = c.map(([X, Y]) => local(X, Y));   // SW SE NE NW
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const tex = await new THREE.TextureLoader().loadAsync(`${base}/geo/raster-preview?path=${encodeURIComponent(l.original)}&max=4096`);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: l.opacity, side: THREE.DoubleSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.geoPlane = l.id;
    // the points the plane's height is read under (its corners, its centre)
    mesh.userData.probe = [...pts, [(pts[0][0] + pts[2][0]) / 2, 0, (pts[0][2] + pts[2][2]) / 2]];
    mesh.renderOrder = 1;
    return mesh;
  };

  const drawAttribution = () => {
    if (!ctx) return;
    if (!attribEl) {
      attribEl = document.createElement("div");
      attribEl.className = "geo-attrib";
      ctx.host.appendChild(attribEl);
    }
    const a = attributionOf(layers);
    attribEl.textContent = a.join(" · ");
    attribEl.title = (o.attributionTitle ? o.attributionTitle + "\n" : "") + a.join("\n");
    attribEl.classList.toggle("hidden", !a.length);
  };

  let planeTick = 0;
  /** the terrain's height under a point of the scene (the tiles drawn: a tile
   *  replaced by its children is hidden, not removed) */
  const groundAt = (x: number, z: number): number | null => {
    if (!ctx || !tiles) return null;
    const ray = new ctx.THREE.Raycaster(new ctx.THREE.Vector3(x, 20000, z), new ctx.THREE.Vector3(0, -1, 0));
    const shown = (o: any): boolean => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };
    const hit = ray.intersectObject(tiles.group, true).find((h: any) => shown(h.object));
    return hit ? hit.point.y : null;
  };
  const camLocal = (): V3 | null => (ctx ? arr(ctx.camera().position) : null);
  const where = () => {
    const p = camLocal();
    if (!p) return null;
    const g = localToLonLat(anchor, p);
    // the ground distance to the site, on a sphere: enough for a threshold
    const R = WGS84.a;
    const d2r = Math.PI / 180;
    const dLat = (g.lat - anchor.lat) * d2r, dLon = (g.lon - anchor.lon) * d2r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(anchor.lat * d2r) * Math.cos(g.lat * d2r) * Math.sin(dLon / 2) ** 2;
    return { ...g, ground: 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) };
  };

  // ── MICRO-GLOBO-INTERAZIONE p.2 · the camera as a pose (ECEF), both ways ──
  const rotOf = (m: number[]): number[] => { const k = Math.hypot(m[0], m[1], m[2]) || 1; return [m[0] / k, m[1] / k, m[2] / k, 0, m[4] / k, m[5] / k, m[6] / k, 0, m[8] / k, m[9] / k, m[10] / k, 0, 0, 0, 0, 1]; };
  const toEcef = (p: V3): V3 => applyM4(frame, p);
  const toLocal = (p: V3): V3 => applyM4(invertRigid(frame), p);
  const dirToEcef = (d: V3): V3 => applyM4(rotOf(frame), d);
  const dirToLocal = (d: V3): V3 => applyM4(rotOf(invertRigid(frame)), d);
  /** the ground's height near the site (the terrain drawn under the origin), else the site's */
  const groundRef = (): number => {
    const y = groundAt(0, 0);
    return y !== null ? ecefToGeodetic(toEcef([0, y, 0])).h : (anchor.siteH ?? anchor.h);
  };
  const poseNow = (): Pose => {
    const c = ctx!.camState();
    const cam = ctx!.camera();
    // the screen's up as drawn (the camera's own +y), not `camera.up`: looking
    // straight down at the Earth that one may be along the view and say nothing
    cam.updateMatrixWorld();
    const yAxis = new ctx!.THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const up: V3 = [yAxis.x, yAxis.y, yAxis.z];
    const pos = toEcef(c.pos), fwd = dirToEcef([c.target[0] - c.pos[0], c.target[1] - c.pos[1], c.target[2] - c.pos[2]]);
    return poseFromCameraUp(pos, fwd, dirToEcef(up));
  };
  const applyPose = (p: Pose) => {
    if (!ctx) return;
    const b = poseBasis(p);
    const far = 1000 + Math.max(0, p.h);
    // the pivot on the ground the orthographic's scale is read at (`View.refH`)
    const hit = hitEllipsoid(b.pos, b.fwd, Math.min(refHeight(), Math.max(0, p.h - 1)));
    const tgt: V3 = hit ?? [b.pos[0] + b.fwd[0] * far, b.pos[1] + b.fwd[1] * far, b.pos[2] + b.fwd[2] * far];
    ctx.setPose?.(toLocal(b.pos), toLocal(tgt), dirToLocal(b.up));
  };
  /** the height the plan's scale and the pivot are read at: the ground near the site, 0 from far */
  const refHeight = (): number => { const w = where(); return w && w.h > 50000 ? 0 : groundRef(); };
  const ensureHands = () => {
    if (geoHands || !ctx) return;
    const dom = ctx.renderer.domElement as HTMLElement;
    const isPad = trackpadClassifier();
    const host = ctx.host;
    geoHands = createGeoHands({
      dom,
      area: host,
      // the scene's own layers over the canvas (the models' labels, the marks, the
      // attribution) are the scene's; a button, a panel, the compass, the gizmo are not
      accepts: (t) => {
        const el = t as HTMLElement | null;
        if (!el || !(el instanceof Element)) return false;
        if (el === dom) return true;
        if (el.closest("button, input, select, textarea, a, [data-geo-panel], .geo-compass, .scn-nav, .scn-bar, .scn-modal")) return false;
        return !!el.closest(".v3d-labels, .scn-labels, .scn-mark-labels, .scn-marks, .scn-strips, .geo-attrib, .scn-cursor") && host.contains(el);
      },
      pose: poseNow,
      view: () => ({ width: dom.clientWidth || 1, height: dom.clientHeight || 1, fov: ctx?.fov ?? 40, ortho: !!ctx?.camera().isOrthographicCamera,
        refH: Math.min(refHeight(), Math.max(0, poseNow().h - 1)) }),
      apply: applyPose,
      pick: (cx, cy) => {
        if (!ctx || !tiles) return null;
        const r = dom.getBoundingClientRect();
        const ray = new ctx.THREE.Raycaster();
        ray.setFromCamera(new ctx.THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), ctx.camera());
        const shown = (q: any): boolean => { for (let x = q; x; x = x.parent) if (x.visible === false) return false; return true; };
        const hit = ray.intersectObject(tiles.group, true).find((h: any) => shown(h.object));
        return hit ? toEcef(arr(hit.point)) : null;
      },
      fallbackHeight: refHeight,
      plan: () => mode === "plan",
      isTrackpad: (e) => isPad(e as unknown as { deltaMode: number; deltaX: number; deltaY: number; wheelDeltaY?: number }),
      fingers: (e) => fingersOf(e as unknown as { deltaMode: number; deltaX: number; deltaY: number; webkitDirectionInvertedFromDevice?: boolean }),
    });
  };
  /** the compass: where north is on the screen; a click puts it up, a double click levels the view too */
  const drawCompass = () => {
    if (!ctx) return;
    if (!compassEl) {
      compassEl = document.createElement("button");
      compassEl.type = "button";
      compassEl.className = "geo-compass";
      compassEl.dataset.geoCompass = "1";
      compassEl.innerHTML = `<svg viewBox="-20 -20 40 40" width="34" height="34" aria-hidden="true"><circle r="18" class="geo-compass-ring"/><g class="geo-compass-needle"><path d="M0,-15 L5,0 L-5,0 Z" class="geo-compass-n"/><path d="M0,15 L5,0 L-5,0 Z" class="geo-compass-s"/><text y="-6.5" text-anchor="middle" class="geo-compass-t">N</text></g></svg>`;
      compassEl.title = o.compassTitle ?? "North up (double click: straight down too)";
      compassEl.setAttribute("aria-label", compassEl.title);
      for (const ev of ["pointerdown", "wheel", "contextmenu"]) compassEl.addEventListener(ev, (e) => e.stopPropagation());
      compassEl.addEventListener("click", (e) => { e.stopPropagation(); geoHands?.northUp(false); });
      compassEl.addEventListener("dblclick", (e) => { e.stopPropagation(); e.preventDefault(); geoHands?.northUp(true); });
      ctx.host.appendChild(compassEl);
    }
    const show = mode === "globe" || mode === "plan";
    compassEl.classList.toggle("hidden", !show);
    if (!show) return;
    const h = poseNow().heading;
    if (Math.abs(h - compassDeg) < 0.005) return;
    compassDeg = h;
    compassEl.dataset.heading = h.toFixed(2);
    compassEl.querySelector<SVGGElement>(".geo-compass-needle")?.setAttribute("transform", `rotate(${(-h).toFixed(2)})`);
  };
  /** north up at the end of a flight to the globe or the plan (the default) */
  const northNow = () => { if (!ctx) return; const p = poseNow(); if (Math.abs(p.heading) > 1e-6) applyPose({ ...p, heading: 0 }); };

  /** the hands, by mode: Google Earth's in the globe and the plan, the Space's in the site */
  const hands = (m: GeoMode, from: GeoMode | null, repivot: boolean) => {
    if (!ctx) return;
    ensureHands();
    if (m === "globe" || m === "plan") {
      if (geoHands) geoHands.enabled = true;
    } else {
      if (geoHands) geoHands.enabled = false;
      // MICRO-GEOREF-GRAFO p.0a · the site's up is its vertical, by every road
      // (a flight lands with `repivot` false: its up stayed the globe's)
      // (the scene's frame loop levels the view on it, `level`)
      ctx.camera().up.set(0, 1, 0);
      if ((from !== "globe" && from !== "plan") || !repivot) return;
      // from the globe's hands to the Space's: the camera stays where it is, the
      // orbit's pivot goes on the site's level (y = 0) along the view — not on
      // the terrain hit, which at that moment may still be the flat tile under
      // the real ground — or, looking up, on the site's origin
      const cam = ctx.camera();
      const dir = new ctx.THREE.Vector3();
      cam.getWorldDirection(dir);
      const p = arr(cam.position);
      const target: V3 = dir.y < -1e-3 ? (() => { const k = -p[1] / dir.y; return [p[0] + dir.x * k, 0, p[2] + dir.z * k] as V3; })() : [0, 0, 0];
      cam.up.set(0, 1, 0);
      ctx.applyCam({ pos: p, target });
    }
  };

  const enter = (m: GeoMode, why: "hand" | "auto", repivot = true) => {
    const was = mode;
    mode = m;
    if (!ctx) return;
    const before = ctx.camera().position.toArray() as V3;
    if (m === "plan") ctx.setOrtho(true);
    else if (was === "plan") ctx.setOrtho(false);
    hands(m, was, repivot);
    if (was !== m) lastSwitch = { from: was, to: m, why, at: performance.now(), posBefore: before, posAfter: ctx.camera().position.toArray() as V3 };
    ctx.host.dataset.geoMode = m;
    if (was !== m) o.onMode?.(m, why);
  };

  /** the canonical view of a mode, for a flight chosen in the bar */
  const viewFor = (m: GeoMode): { pos: V3; target: V3 } | null => {
    if (!ctx) return null;
    if (m === "globe") {
      // above the site, 2.2 Earth radii up, looking at the centre
      const up: V3 = [-centre[0], -centre[1], -centre[2]];
      const L = Math.hypot(...up);
      const k = (WGS84.a * 3.2) / L;
      return { pos: [centre[0] + up[0] * k, centre[1] + up[1] * k, centre[2] + up[2] * k], target: centre };
    }
    return ctx.siteView(m === "plan");
  };

  const fly = (to: { pos: V3; target: V3 }, then: GeoMode) => {
    if (!ctx) return;
    const c = ctx.camState();
    const reduce = (() => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    if (geoHands) geoHands.enabled = false;
    if (reduce) { ctx.applyCam(to); enter(then, "hand", false); if (then !== "site") northNow(); return; }
    flight = { from: c, to, t0: 0, ms: flyMs(c.pos, to.pos, centre), then };
  };

  const api: GlobeApi = {
    attach(c) {
      ctx = c;
      ctx.host.dataset.geoMode = mode;
      if (savedRatio === null) savedRatio = c.renderer.getPixelRatio();
      if (savedLocalClipping === null) savedLocalClipping = !!c.renderer.localClippingEnabled;
      c.renderer.localClippingEnabled = true;
      c.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, BUDGET.maxPixelRatio));
      (c.host as unknown as { __geo?: () => GlobeState }).__geo = () => api.state();
      // the probes' seam: the ground's height (the terrain drawn) under a point of the scene
      (c.host as unknown as { __geoGround?: (x: number, z: number) => number | null }).__geoGround = groundAt;
      // MICRO-GLOBO-INTERAZIONE p.1 · the models' box, as the height is decided on it
      (c.host as unknown as { __geoContent?: () => unknown }).__geoContent = () => ctx?.contentBox?.() ?? null;
      // MICRO-GLOBO-INTERAZIONE p.2 · the probes' seams: the ground under a client point (ECEF), and
      // where an ECEF point is on the screen (client px)
      (c.host as unknown as { __geoPickAt?: unknown }).__geoPickAt = (cx: number, cy: number) => {
        if (!ctx || !tiles) return null;
        const dom = ctx.renderer.domElement as HTMLElement;
        const r = dom.getBoundingClientRect();
        const ray = new ctx.THREE.Raycaster();
        ray.setFromCamera(new ctx.THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), ctx.camera());
        const shown = (q: any): boolean => { for (let x = q; x; x = x.parent) if (x.visible === false) return false; return true; };
        const hit = ray.intersectObject(tiles.group, true).find((h: any) => shown(h.object));
        return hit ? toEcef(arr(hit.point)) : null;
      };
      (c.host as unknown as { __geoScreenOf?: unknown }).__geoScreenOf = (P: V3) => {
        if (!ctx) return null;
        const dom = ctx.renderer.domElement as HTMLElement;
        const r = dom.getBoundingClientRect();
        const cam = ctx.camera();
        cam.updateMatrixWorld();
        const v = new ctx.THREE.Vector3(...toLocal(P)).project(cam);
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      };
      (c.host as unknown as { __geoPlanes?: () => unknown }).__geoPlanes = () => [...planes.entries()].map(([id, h]) => ({ id, y: h.mesh.position.y,
        corners: (h.mesh.userData.probe as V3[]).slice(0, 4) }));
      void tilesEngine().then((E) => {
        T = E;
        if (!ctx) return;
        try { decideHeight(); buildTiles(); enter(mode, "auto"); } catch (e) { error = String((e as Error)?.message ?? e); }
      }).catch((e) => { error = String((e as Error)?.message ?? e); });
    },
    detach() {
      geoHands?.dispose();
      geoHands = null;
      compassEl?.remove();
      compassEl = null;
      for (const h of overlays.values()) overlayPlugin?.deleteOverlay(h.ov);
      overlays.clear();
      for (const h of planes.values()) h.mesh.removeFromParent();
      planes.clear();
      if (tiles) { tiles.group.removeFromParent(); tiles.dispose(); }
      attribEl?.remove();
      if (ctx && savedRatio !== null) ctx.renderer.setPixelRatio(savedRatio);
      if (ctx && savedLocalClipping !== null) ctx.renderer.localClippingEnabled = savedLocalClipping;
      clipPlanes = null; clipBox = null;
      if (ctx) { delete ctx.host.dataset.geoMode; delete (ctx.host as unknown as { __geo?: unknown }).__geo; }
      tiles = null; ctx = null;
    },
    setCamera(cam) {
      if (tiles) tiles.setCamera(cam);
      lastCam = cam;
    },
    ownsPointer: () => mode === "globe" || mode === "plan" || !!flight,
    far() {
      const p = camLocal();
      if (!p) return null;
      const d = Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]);
      // as far as the horizon, and the whole Earth from far
      const h = Math.max(0, d - WGS84.a);
      return Math.sqrt(h * (2 * WGS84.a + h)) + Math.min(d, WGS84.a) * 0.5 + 1000;
    },
    update() {
      if (!ctx || !tiles) return;
      // the models came after the globe: the height waited for them
      if (height.reason === "no-content" && heightMode === "auto" && o.zInCoords == null && contentY()) decideHeight();
      const cam = ctx.camera();
      if (cam !== lastCam) api.setCamera(cam);
      if (flight) {
        const now = performance.now();
        if (!flight.t0) flight.t0 = now;
        const t = Math.min(1, (now - flight.t0) / flight.ms);
        const at = flyAt(flight.from, flight.to, centre, t);
        // the flight lands on its own view: the pivot is the one it brought
        if (t >= 1) { const f = flight; flight = null; ctx.applyCam(f.to); enter(f.then, "hand", false); if (f.then !== "site") northNow(); }
        else ctx.applyCam(at);
      } else if (geoHands?.busy()) {
        // a gesture under way keeps its hands: the passage waits for its end
        geoHands.update();
      } else if (mode === "globe") {
        const w = where();
        if (w) { const next = autoMode("globe", w.h, w.ground); if (next !== "globe") enter(next, "auto"); }
      } else {
        const w = where();
        if (w && autoMode(mode, w.h, w.ground) === "globe") enter("globe", "auto");
      }
      drawCompass();
      if (flight || mode === "globe") {
        // the globe's clip planes: the scene's own (the site's span) would cut the Earth
        const p = arr(cam.position);
        const d = Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]);
        const h = Math.max(1, d - WGS84.a);
        const near = Math.max(0.05, h * 1e-3), far = d + WGS84.a;
        if (!cam.isOrthographicCamera && (Math.abs(cam.near - near) / near > 0.05 || Math.abs(cam.far - far) / far > 0.01)) {
          cam.near = near;
          cam.far = far;
          cam.updateProjectionMatrix();
        }
      }
      // a raster on a plane lies at the site's height: just over the terrain drawn
      // under it (its highest point under the corners and the centre), read again
      // a few times a second as the terrain refines
      if (planes.size && ++planeTick % 15 === 0) for (const { mesh } of planes.values()) {
        const ys = (mesh.userData.probe as V3[]).map((q) => groundAt(q[0], q[2])).filter((y): y is number => y !== null);
        const y = ys.length ? Math.max(...ys) + 0.1 : 0;
        if (Math.abs(mesh.position.y - y) > 0.01) mesh.position.y = y;
      }
      applyClip();
      cam.updateMatrixWorld();
      tiles.setResolutionFromRenderer(cam, ctx.renderer);
      tiles.update();
    },
    setLayers(l) { layers = l; applyLayers(); },
    setMode(m) {
      const to = viewFor(m);
      if (!to || !ctx) { mode = m; return; }
      fly(to, m);
    },
    mode: () => mode,
    setHeightMode(m) { heightMode = m; decideHeight(); },
    height: () => height,
    goToSite() {
      const to = viewFor("site");
      if (to) fly(to, "site");
    },
    setClip(on, margin) {
      clip = { on, margin: Number.isFinite(margin) ? Math.max(0, margin) : 10 };
      applyClip(true);
    },
    state(): GlobeState {
      const w = where();
      const st = tiles?.stats ?? {};
      return {
        ready: !!tiles, mode, flying: !!flight,
        altitude: w ? w.h : null, lon: w ? w.lon : null, lat: w ? w.lat : null,
        tiles: { loaded: st.loaded ?? 0, visible: tiles?.visibleTiles?.size ?? 0, downloading: st.downloading ?? 0, parsing: st.parsing ?? 0, failed: st.failed ?? 0 },
        bytes: tiles?.lruCache?.cachedBytes ?? 0, maxBytes: BUDGET.lruMaxBytes,
        overlays: [...overlays.keys()], terrainAsked, terrainFlat,
        attribution: attributionOf(layers), error, height, lastSwitch,
        hands: { enabled: !!geoHands?.enabled, busy: !!geoHands?.busy(), last: geoHands?.last() ?? null },
        pose: ctx ? poseNow() : null,
        compass: compassEl && !compassEl.classList.contains("hidden") ? Number(compassEl.dataset.heading ?? 0) : null,
        clip: { on: clip.on, margin: clip.margin, box: clipBox, materials: clipMaterials },
      };
    },
  };
  return api;
}
