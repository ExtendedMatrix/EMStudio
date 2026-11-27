/**
 * MICRO-PX7 (PX5 A–C) · a Gaussian splat in EMStudio's three.js scenes, as a
 * representation model: Gaussian Splat Lite (GSL, William Liu, Apache-2.0,
 * pinned 1.11.0) draws it; its 3D Tiles plugin (0.3.1) reads tilesets of
 * splats inside the tiles renderer (`tiles3d.ts`).
 *
 * **The engine comes after three, never with it** — as the tiles renderer: in
 * the web build `splat3d.js` beside the page (three from `engine3d.js`), in
 * the single file (desktop, `file://`) inlined as three is. Nothing of it is
 * asked until a splat is drawn.
 *
 * **One renderer per scene.** GSL draws every visible `SplatMesh` of a scene
 * through ONE `GaussianSplatRenderer` added to it (the plugin does not make
 * one): `splatRendererFor` keeps it on the scene, made at the first splat.
 *
 * **Two kinds of layer.** A single file (PLY, SPZ, SOG, a RAD without LOD) is a
 * `SplatMesh`; a streamed scene (RAD with LOD, SOG `lod-meta.json`, LCC2) is a
 * GSL scheduler — the second kind of streamed RM beside the tilesets — whose
 * `group` holds the detail the camera asks for, updated at every frame
 * (`SplatLayer.update`). Both stand in a group of their own: the RM's pose and
 * its frame are applied to that group as to a mesh's root.
 */
import { engine } from "./embed3d-native";
import { plyHeaderKind, SPLAT_PICK_OPACITY, SPLAT_STREAMED, type SplatKind } from "./splat-rules";

export type { SplatKind } from "./splat-rules";

let splatPromise: Promise<any> | null = null;
let splatLoaded = false;

/** Gaussian Splat Lite and its tiles plugin, loaded once — after three. */
export async function splatEngine(): Promise<{ GaussianSplatRenderer: any; SplatMesh: any; SplatFileType: any;
    RadStreamScheduler: any; SogStreamScheduler: any; Lcc2StreamScheduler: any; GaussianSplatPlugin: any }> {
  if (!splatPromise) {
    // a CONSTANT condition, as in `engine()` / `tilesEngine()`: the other arm leaves the build
    splatPromise = __EM_LAZY_3D__
      ? engine().then(() => import(/* @vite-ignore */ new URL("./splat3d.js", document.baseURI).href))
      : (async () => {
          const [g, p] = await Promise.all([import("gaussian-splat-lite"), import("3d-tiles-rendererjs-3dgs-plugin")]);
          return { GaussianSplatRenderer: g.GaussianSplatRenderer, SplatMesh: g.SplatMesh, SplatFileType: g.SplatFileType,
                   RadStreamScheduler: g.RadStreamScheduler, SogStreamScheduler: g.SogStreamScheduler,
                   Lcc2StreamScheduler: g.Lcc2StreamScheduler, GaussianSplatPlugin: p.GaussianSplatPlugin };
        })();
    splatPromise.catch(() => { splatPromise = null; });
    splatPromise.then(() => { splatLoaded = true; }, () => { /* asked again next time */ });
  }
  return splatPromise;
}
/** whether the splat engine is already in hand */
export function splatEngineReady(): boolean { return splatLoaded; }

/** The smallest radius on screen (px) a splat is drawn at (GSL's default 1). */
export const SPLAT_MIN_PIXEL_RADIUS = 1;

/** The scene's one `GaussianSplatRenderer`, made at the first splat. */
export function splatRendererFor(S: any, scene: any, renderer: any): any {
  const had = scene.userData.__emSplatRenderer;
  if (had) return had;
  // `renderDepth`: the splats' depth drawn too, so the proxies and the
  // sketches drawn after them are hidden where a splat stands in front
  // `minPixelRadius`: GSL skips a splat whose radius on screen is under it.
  // Measured (MICRO-PX7): 0 or 0.5 keep a single-file splat seen from afar
  // (the east wall's 1.5 M Gaussians of 7 mm, ≈ 0.6 px from 29 m, vanish at
  // 1), but a scene of 3.3 M splats seen from afar falls from 60 to 13 fps:
  // GSL's 1 px is kept, and a single file without levels of detail thins out
  // from afar — its streamed forms (RAD, SOG lod-meta, LCC2, a tileset) do not
  const r = new S.GaussianSplatRenderer({ renderer, renderDepth: true, minPixelRadius: SPLAT_MIN_PIXEL_RADIUS });
  r.name = "em-splat-renderer";
  r.userData.helper = true;
  scene.add(r);
  scene.userData.__emSplatRenderer = r;
  return r;
}

/** Whether an object is one of GSL's splat meshes (GSL sets no `is…` flag). */
export const isSplatMesh = (o: any): boolean => !!o && typeof o.forEachSplat === "function" && typeof o.minRaycastOpacity === "number";

export interface SplatStats {
  kind: SplatKind; streamed: boolean; splats: number; visible: number | null;
  cpuBytes: number | null; gpuBytes: number | null; progress: number | null; downloaded: number | null;
}

export interface SplatLayer {
  /** the group placed in the scene: the RM's pose and frame go on it */
  object: any;
  kind: SplatKind;
  streamed: boolean;
  /** the first data on screen (or its failure) */
  ready: Promise<void>;
  /** a failure, in words (the file, the reader) */
  error(): string | null;
  /** every frame, before the render: a stream chooses its detail */
  update(camera: any, renderer: any): void;
  /** the box of what is loaded, in the scene's frame (null before the data) */
  bounds(): any | null;
  stats(): SplatStats;
  /** the hits along a ray, the alpha isosurface at `opacity` (every splat of the
   *  layer set to it first: GSL's default must not move the points) */
  intersect(ray: any, opacity?: number): any[];
  dispose(): void;
}

/** what a stream is made with: a budget of splats sized to the memory ceiling */
export interface SplatLayerOptions {
  /** the MB the scene gives a model (the tiles' ceiling); the stream's CPU and GPU budgets follow */
  memoryMB?: number;
  /** the splats a stream may show at once */
  splatBudget?: number;
  /** a PLY's first bytes, read by the caller (`readPlyHeader`): a mesh PLY is refused before GSL */
  fetchHeader?: (url: string) => Promise<string | null>;
}

/** The first KB of a PLY: its header (Range, else the whole start of the body). */
export async function readPlyHeader(url: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await fetchFn(url, { headers: { Range: "bytes=0-8191" } });
    if (!r.ok && r.status !== 206) return null;
    const buf = new Uint8Array(await r.arrayBuffer()).subarray(0, 8192);
    return new TextDecoder("latin1").decode(buf);
  } catch { return null; }
}

/**
 * A splat RM's layer. `E` is the engine (`engine()`), `S` the splat engine
 * (`splatEngine()`), `kind` what the resource is (`splatKindOf`).
 */
export async function createSplatLayer(E: any, S: any, url: string, kind: SplatKind, camera: any, renderer: any,
                                       opts: SplatLayerOptions = {}): Promise<SplatLayer> {
  const { THREE } = E;
  const group = new THREE.Group();
  group.name = "em-splat";
  group.userData.splat = kind;
  let err: string | null = null;
  const streamedWanted = SPLAT_STREAMED.has(kind);
  let mesh: any = null;
  let sched: any = null;
  let streamed = false;
  const mb = Math.max(64, opts.memoryMB ?? 512);
  if (kind === "ply" && opts.fetchHeader) {
    const h = await opts.fetchHeader(url);
    const pk = h ? plyHeaderKind(h) : null;
    if (pk && !pk.gaussian) err = `PLY: ${pk.why}`;
  }
  let firstData: Promise<void> = Promise.resolve();
  if (!err && streamedWanted) {
    const Cls = kind === "rad" ? S.RadStreamScheduler : kind === "lcc2" ? S.Lcc2StreamScheduler : S.SogStreamScheduler;
    sched = new Cls({ splatBudget: opts.splatBudget ?? 3_000_000,
      maxResidentCpuBytes: Math.round(mb * 2) * 1024 * 1024, maxResidentGpuBytes: mb * 1024 * 1024,
      onError: (e: unknown, u: string) => { err = err ?? `${String((e as Error)?.message ?? e)} (${u.split("/").pop()})`; } });
    sched.setCamera(camera);
    if (typeof sched.setResolutionFromRenderer === "function") sched.setResolutionFromRenderer(camera, renderer);
    try {
      await sched.addSource({ url });
      group.add(sched.group);
      streamed = true;
      firstData = sched.firstRenderable.then(() => undefined, (e: unknown) => { err = err ?? String((e as Error)?.message ?? e); });
    } catch (e) {
      try { sched.dispose(); } catch { /* gone */ }
      sched = null;
      // a RAD without levels of detail is a single model: read whole
      if (kind !== "rad") err = String((e as Error)?.message ?? e);
    }
  }
  if (!err && !sched) {
    const fileType = kind === "ply" ? S.SplatFileType.PLY : kind === "spz" ? S.SplatFileType.SPZ
      : kind === "sog" ? S.SplatFileType.SOG : kind === "rad" ? S.SplatFileType.RAD : undefined;
    mesh = new S.SplatMesh({ url, ...(fileType ? { fileType } : {}), minRaycastOpacity: SPLAT_PICK_OPACITY });
    group.add(mesh);
    firstData = mesh.initialized.then(() => undefined, (e: unknown) => { err = String((e as Error)?.message ?? e); });
  }
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  let camSet: any = camera;
  return {
    object: group, kind, get streamed() { return streamed; },
    ready: firstData,
    error: () => err,
    update(cam: any, r: any) {
      if (!sched) return;
      if (cam !== camSet) { try { sched.deleteCamera?.(camSet); } catch { /* not there */ } sched.setCamera(cam); camSet = cam; }
      if (typeof sched.setResolutionFromRenderer === "function") sched.setResolutionFromRenderer(cam, r);
      try { sched.update(); } catch (e) { err = err ?? String((e as Error)?.message ?? e); }
    },
    bounds() {
      group.updateMatrixWorld(true);
      if (mesh) {
        if (!mesh.isInitialized) return null;
        mesh.getBoundingBox(true, tmp);
        if (tmp.isEmpty()) return null;
        return box.copy(tmp).applyMatrix4(mesh.matrixWorld).clone();
      }
      if (sched) {
        const b = sched.getBoundingBox?.();
        if (!b || b.isEmpty()) return null;
        return b.clone().applyMatrix4(sched.group.matrixWorld);
      }
      return null;
    },
    stats() {
      if (sched) {
        const s = sched.stats ?? {};
        return { kind, streamed: true, splats: Number(s.visibleSplats ?? 0), visible: Number(s.visibleSplats ?? 0),
          cpuBytes: s.residentCpuBytes ?? null, gpuBytes: s.residentGpuBytes ?? null, progress: s.loadProgress ?? null, downloaded: s.downloadedBytes ?? null };
      }
      return { kind, streamed: false, splats: Number(mesh?.numSplats ?? 0), visible: null, cpuBytes: null, gpuBytes: null, progress: mesh?.isInitialized ? 1 : 0, downloaded: null };
    },
    intersect(ray: any, opacity = SPLAT_PICK_OPACITY) {
      group.traverse((o: any) => { if (isSplatMesh(o)) o.minRaycastOpacity = opacity; });
      return ray.intersectObject(group, true);
    },
    dispose() {
      group.removeFromParent();
      try { sched?.dispose(); } catch { /* gone */ }
      try { mesh?.dispose(); } catch { /* gone */ }
    },
  };
}
