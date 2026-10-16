/**
 * SPAZIO · the Scena 3D — the representation models of an epoch and the proxies
 * of its units, in one orbitable scene (scrivania v11b).
 *
 * What it draws is decided elsewhere (`space.ts` reads the graph, `main.ts`
 * turns an epoch into items); this module only renders the items it is handed,
 * each as its file state allows:
 *
 *   · `resident` — the glb is fetched and drawn: an RM as it is, a proxy
 *     translucent in the colour of its unit's type (`em_visual_rules`
 *     `material.rgba_color`, linear, as Blender paints it);
 *   · `json` — convex hulls and spheres drawn as they are, from the shape's data;
 *   · `reference` — a file only referenced (somebody's disk), which cannot be
 *     fetched: a dashed CONTOUR with its label. Nothing says how big the file's
 *     content is, so the contour is the room of what is drawn around it (the
 *     scene's extent, or a metre when it is alone) — a place, not a shape;
 *   · `missing` — declared and absent (not in the store, or not found when
 *     fetched): its label only, where it would be;
 *   · `refused` — MICRO-SPAZIO-FIRMATO · the node did not give the file (401/
 *     403: access, not absence): its label says so, where it would be.
 *
 * A file of the room's store is asked through the signed road (`node-road.ts`)
 * and its bytes are parsed: the loader's own request carries no bearer.
 *
 * The camera frames the content when it first arrives and on ⤢ (`frame`),
 * never on an epoch change or a toggle: the reader's point of view is theirs
 * (MICRO-RIFINITURE). three.js is the lazy engine of `embed3d-native.ts`.
 *
 * MICRO-SPAZIO-3D (E.D., 11 Oct 2026) · a working space, with Blender's hands:
 *
 *   · the wheel and the pinch zoom TOWARD THE CURSOR and the orbit centre goes
 *     to the depth of the surface under it (`space-nav.ts`), so the detail is
 *     reached without a wall; OrbitControls keeps only the orbit and the pan;
 *   · a click picks the PROXY under the cursor, ⌘-click (Ctrl elsewhere) the
 *     MODEL, a right click opens the menu of one or the other, Shift + right
 *     click lays the 3D CURSOR on the surface, a double click frames the detail,
 *     Shift+B zooms to a box, `.`/F frames the selection, Home everything;
 *   · a trackpad orbits with two fingers, pans with Shift, zooms with the pinch
 *     — told from a wheel by the graph's rule (`wheel-kind.ts`);
 *   · the Space's OVERLAYS (labels, proxies filled / wire, grid and axes, the
 *     epoch's box, the selection's outline, the gizmo, the cursor, the sketches)
 *     are read from `opts.overlay` at every rebuild and every frame;
 *   · SKETCHES (`shapes3d.ts`) are drawn in a group of their own, born at the
 *     cursor, moved with the gizmo (TransformControls) or with G / R / S as in
 *     Blender, and exported as a glb when they become a unit's proxy.
 */
import { engine, headBytes, lodLevelOf, probeLods, tilesBarTexts } from "./embed3d-native";
import { onFirstVisible } from "./lazy";
import { nodeBytes, ownedByNode, RoadError, type FetchFailure } from "./node-road";
import { createTilesLayer, dracoFor, formatBytes, isTilesetUrl, tilesBar, tilesEngine, type TilesLayer } from "./tiles3d";
import type { OverlayKey } from "./overlays";
import {
  AXIS_VECTOR, applyTyped, boxZoom, clipPlanes, detailZoom, DRAG_PX, frameSphere, isMacPlatform, modalKey,
  modalLabel, modalValue, pointerIntent, spaceKeyAction, startModal, wheelFactor, zoomTowards,
  type CamState, type ModalMode, type ModalState, type Pose, type SpaceKeyAction, type V3,
} from "./space-nav";
import { buildShapeGeometry, listSketches, shapeById, updateSketch, type Sketch } from "./shapes3d";
import { trackpadClassifier } from "./wheel-kind";

export interface SceneItem {
  kind: "rm" | "proxy";
  /** the RM, or the UNIT a proxy belongs to (a click selects it) */
  id: string;
  label: string;
  state: "resident" | "reference" | "missing" | "refused" | "json";
  /** the glb to fetch, for `resident` */
  url?: string;
  resourceId?: string;
  /** linear rgb of the unit's type, for a proxy */
  rgb?: [number, number, number];
  /** the outline's colour (hex), e.g. the RM's placement axis */
  edge?: string;
  convexshapes?: number[][];
  spheres?: number[][];
  selected?: boolean;
  /** MICRO-3DTILES · the tileset of the same model (proposed over the threshold) */
  tileset?: string;
  /** TEMPLU MARE v2 · C1 · `url` IS a tileset, in this form, whatever it ends
   *  with: a store URL (`…/asset/sha256:…`) names no `.3tz` */
  tiles?: "directory" | "3tz";
  /** what the graph knows of the file: `size_bytes`, `primitives.points` */
  bytes?: number | null;
  points?: number | null;
}

export interface SceneTexts {
  loading: string;
  noEngine: string;
  referenceOnly: (name: string) => string;
  missing: (name: string) => string;
  /** MICRO-SPAZIO-FIRMATO · the node refused the file (access) */
  refused: (name: string) => string;
  /** MICRO-3DTILES · a glb over the threshold, and the two ways on */
  overLimit: (name: string, size: string, limit: string) => string;
  openTileset: string;
  loadAnyway: string;
  lodNote: (n: number) => string;
  /** MICRO-SPAZIO-3D · the box zoom armed, the modal's hint */
  boxZoom?: string;
  modalHint?: string;
}

/** MICRO-SPAZIO-3D · what was under a right click (or a Ctrl-click on a Mac). */
export interface SceneMenuRequest {
  /** what the menu is about: the proxy (no key), the model (⌘ / Ctrl), a
   *  sketch, or nothing under the pointer */
  kind: "proxy" | "rm" | "sketch" | "none";
  id: string | null;
  /** the page coordinates of the click */
  x: number;
  y: number;
  /** the surface point under it, when there is one */
  point: V3 | null;
}

export interface SpaceSceneHandle {
  update(items: SceneItem[]): void;
  frame(): void;
  dispose(): void;
  /** MICRO-SPAZIO-3D · the camera, for «Indietro» */
  camera(): CamState | null;
  setCamera(c: CamState): void;
  /** frame the items (`rm:<id>`, `proxy:<unit>`, `sketch:<id>`); false when none is drawn */
  frameKeys(keys: string[]): boolean;
  /** the 3D cursor */
  cursor(): V3;
  setCursor(p: V3): void;
  /** frame the 3D cursor («Inquadra il cursore») */
  frameCursor(): void;
  /** Shift+B, armed from outside (a menu) */
  armBoxZoom(): void;
  /** the sketches: draw again from `shapes3d`'s list; select one */
  syncSketches(): void;
  selectSketch(id: string | null): void;
  selectedSketch(): string | null;
  /** a sketch as a glb (its pose baked in), for «Associate with a unit» */
  sketchGlb(id: string): Promise<ArrayBuffer | null>;
  /** a shape dropped at a page point: the surface under it and its normal */
  surfaceAt(x: number, y: number): { point: V3; normal: V3 } | null;
  /** re-read the overlays (no reload) */
  applyOverlays(): void;
  /** the file each model is drawn from (a LOD chosen, a tileset) */
  drawnUrl(key: string): string | undefined;
}

export interface SpaceSceneOptions {
  texts: SceneTexts;
  onPickUnit?: (unitId: string) => void;
  onPickRm?: (rmId: string) => void;
  /** MICRO-SPAZIO-3D · a click on nothing (Blender deselects) */
  onPickNone?: () => void;
  onPickSketch?: (id: string | null) => void;
  /** a right click: the caller opens the menu */
  onMenu?: (m: SceneMenuRequest) => void;
  /** the 3D cursor moved */
  onCursor?: (p: V3) => void;
  /** a jump of the view is about to happen (double click, box): «Indietro» */
  onBeforeJump?: () => void;
  /** a key the scene leaves to the caller (T, Shift+A, ⌘[): true = handled */
  onKeyAction?: (a: SpaceKeyAction, e: KeyboardEvent) => boolean;
  /** a sketch moved, turned or scaled (on release) */
  onSketchChange?: (id: string) => void;
  /** the 3D has the focus: the keys are the Space's */
  isFocused?: () => boolean;
  /** the Space's overlays (`overlays.ts`, view `space`) */
  overlay?: (k: OverlayKey) => boolean;
  /** items not selectable (the Outliner's arrow), by key */
  locked?: () => ReadonlySet<string>;
  /** a sketch shown (the Outliner's eye, «Isola») */
  sketchVisible?: (id: string) => boolean;
  /** the epoch's name, for its box */
  epochLabel?: () => string;
  /** a resident file did not come: the caller marks it missing — or, when
   *  the node refused it (401/403), refused */
  onNotFound?: (resourceId: string, why: FetchFailure) => void;
  /** MICRO-3DTILES · the threshold and the tiles' memory (the Preferences) */
  limit?: { bytes: number; points: number };
  tilesMemoryMB?: number;
}

interface Drawn {
  item: SceneItem;
  /** what was drawn: a mesh, a contour, or only a label — MICRO-3DTILES: a
   *  tileset, or a glb held back by the threshold */
  as: "mesh" | "contour" | "label" | "pending" | "tiles" | "gated";
  /** the file actually drawn (a LOD set's chosen level, a tileset) */
  url?: string;
}

/** The 3D cursor as Blender draws it: a ring of red and white dashes, and a
 *  crosshair in black and white. A screen element, the same size at every zoom. */
const CURSOR_SVG = `<svg width="38" height="38" viewBox="-19 -19 38 38" aria-hidden="true">
<circle r="9" fill="none" stroke="#fff" stroke-width="2.4"/>
<circle r="9" fill="none" stroke="#e02020" stroke-width="2.4" stroke-dasharray="4.71 4.71"/>
<g stroke="#000" stroke-width="1.4"><line x1="-18" y1="0" x2="-11" y2="0"/><line x1="11" y1="0" x2="18" y2="0"/>
<line x1="0" y1="-18" x2="0" y2="-11"/><line x1="0" y1="11" x2="0" y2="18"/></g>
<g stroke="#fff" stroke-width="0.6"><line x1="-18" y1="0" x2="-11" y2="0"/><line x1="11" y1="0" x2="18" y2="0"/>
<line x1="0" y1="-18" x2="0" y2="-11"/><line x1="0" y1="11" x2="0" y2="18"/></g></svg>`;

export function mountSpaceScene(host: HTMLElement, opts: SpaceSceneOptions): SpaceSceneHandle {
  let items: SceneItem[] = [];
  let disposed = false;
  let rebuild: (() => void) | null = null;
  let frameIt: (() => void) | null = null;
  let cleanup: (() => void) | null = null;
  const drawn = new Map<string, Drawn>();
  const ov = (k: OverlayKey): boolean => opts.overlay?.(k) ?? (k !== "s3_proxy_wire");
  // MICRO-SPAZIO-3D · the parts the handle reaches once the engine is up
  let api: Partial<SpaceSceneHandle> = {};
  let cursorAt: V3 = [0, 0, 0];
  let cursorSet = false;
  let sketchSel: string | null = null;
  // the probes' seam: what the scene holds, and where a unit sits on screen
  const probe = host as unknown as {
    __space?: () => unknown;
    __spaceScreenOf?: (id: string) => { x: number; y: number } | null;
    __spaceCamera?: () => number[];
    __spaceTiles?: () => unknown;
    __spaceTileScreenOf?: (uri: string) => { x: number; y: number } | null;
    /** TEMPLU MARE v2 · C1 · the world box of what an item drew (a model's
     *  meshes, a tileset's loaded tiles): [minx, miny, minz, maxx, maxy, maxz] */
    __spaceBoxOf?: (id: string) => number[] | null;
    /** MICRO-SPAZIO-3D · the surface under a page point, what it belongs to */
    __spaceHit?: (x: number, y: number) => { point: number[]; kind: string; id: string; distance: number; normal: number[] } | null;
    /** a world point on the page */
    __spaceProject?: (p: number[]) => { x: number; y: number } | null;
    __spaceCursor?: () => number[];
    __spaceSketches?: () => unknown;
    __spaceModal?: () => string | null;
    __spaceOverlays?: () => Record<string, boolean>;
    __spaceClip?: () => number[];
  };
  probe.__space = () => [...drawn.values()].map((d) => ({ kind: d.item.kind, id: d.item.id, state: d.item.state, as: d.as,
    ...(d.url ? { url: d.url } : {}) }));

  const status = document.createElement("div");
  status.className = "scn-status";
  status.textContent = opts.texts.loading;
  host.appendChild(status);

  onFirstVisible(host, () => {
    if (disposed) return;
    void (async () => {
      let E: any;
      try { E = await engine(); } catch { status.textContent = opts.texts.noEngine; return; }
      if (disposed) return;
      const { THREE, GLTFLoader, OrbitControls, ConvexGeometry, TransformControls, GLTFExporter } = E;
      const size = () => ({ w: Math.max(200, host.clientWidth || 600), h: Math.max(160, host.clientHeight || 360) });
      let { w, h } = size();
      // MICRO-SPAZIO-3D · a logarithmic depth buffer: the near plane follows the
      // zoom down to a tenth of a millimetre, and the far keeps the whole temple
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      renderer.domElement.className = "scn-canvas";
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 2000);
      camera.position.set(6, 5, 9);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(4, 8, 6);
      scene.add(key);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      // MICRO-SPAZIO-3D · the controls keep the orbit (left drag) and the pan
      // (Shift / ⌘ / Ctrl + left drag, the middle button); the zoom is the
      // scene's own, toward the cursor, and the right button is the menu's
      controls.enableZoom = false;
      controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
      const content = new THREE.Group();
      scene.add(content);
      // the decorators: grid and axes, the epoch's box (rebuilt with the content)
      const decor = new THREE.Group();
      scene.add(decor);
      // the sketches: a group of their own, never cleared by a rebuild
      const sketchGroup = new THREE.Group();
      scene.add(sketchGroup);
      const labels = document.createElement("div");
      labels.className = "v3d-labels scn-labels";
      const cursorEl = document.createElement("div");
      cursorEl.className = "scn-cursor";
      cursorEl.innerHTML = CURSOR_SVG;
      const modalEl = document.createElement("div");
      modalEl.className = "scn-modal hidden";
      const boxEl = document.createElement("div");
      boxEl.className = "scn-box hidden";
      const loader = new GLTFLoader();
      // TEMPLU MARE v2 · a web version of a model is Draco-compressed («Prepare
      // for a use…»): the decoder the tilesets use, set once before the first load
      let dracoSet: Promise<void> | null = null;
      const withDraco = (): Promise<void> => (dracoSet ??= tilesEngine()
        .then((T) => { loader.setDRACOLoader(dracoFor(E, T)); }).catch(() => undefined));
      // a model, or why it did not come. A failure is not kept: once the
      // access is granted (or the file uploaded), asking again asks again
      type Loaded = { root: any } | { fail: FetchFailure };
      const cache = new Map<string, Promise<Loaded>>();
      const load = (url: string): Promise<Loaded> => {
        let p = cache.get(url);
        if (!p) {
          p = withDraco().then((): Promise<Loaded> => ownedByNode(url)
            // the room's store: the bytes through the signed road, then parsed
            ? nodeBytes(url).then(
                (buf) => new Promise<Loaded>((res) => loader.parse(buf, "",
                  (g: any) => res({ root: g.scene }), () => res({ fail: "missing" }))),
                (e) => ({ fail: e instanceof RoadError ? e.why : "missing" }))
            : new Promise<Loaded>((res) => loader.load(url, (g: any) => res({ root: g.scene }), undefined,
                () => res({ fail: "missing" }))));
          cache.set(url, p);
          const mine = p;
          void p.then((x) => { if ("fail" in x && cache.get(url) === mine) cache.delete(url); });
        }
        return p;
      };
      const failed = (item: SceneItem, why: FetchFailure): SceneItem => ({ ...item, state: why });
      let framed = false;
      let generation = 0;
      const anchors: Array<{ el: HTMLElement; p: any }> = [];
      const pickables: any[] = [];
      const unitCentres = new Map<string, any>();

      // MICRO-3DTILES · the tilesets of the scene (one layer per tileset url,
      // kept across rebuilds: a tileset is not re-fetched when a toggle
      // flips), the LOD sets asked for once, and what the reader chose
      type Live = { layer: TilesLayer; bar: ReturnType<typeof tilesBar>; ready: Promise<void>; itemId: string };
      const layers = new Map<string, Live>();
      const lodSets = new Map<string, Promise<Array<{ level: number; url: string; bytes: number | null }>>>();
      const lodChoice = new Map<string, number>();
      const forced = new Set<string>();
      const useTileset = new Set<string>();
      const strips = document.createElement("div");
      strips.className = "scn-strips";
      let T: any = null;
      const liveLayers = () => [...layers.values()].filter((l) => l.layer.object.parent === content);
      const ensureLayer = async (url: string, itemId: string, archive = false): Promise<Live | null> => {
        let live = layers.get(url);
        if (live) { live.itemId = itemId; return live; }
        try { T = T ?? await tilesEngine(); } catch { return null; }
        const layer = createTilesLayer(E, T, url, camera, renderer, { memoryMB: opts.tilesMemoryMB, archive });
        const bar = tilesBar(layer, tilesBarTexts());
        // ready = the root's first tile, or its failure (the frame waits for it)
        const ready = new Promise<void>((res) => {
          const t0 = setTimeout(res, 8000);
          // the root's volume is enough to frame and to label: the tiles come after
          layer.onChange(() => { const st = layer.status(); if (layer.rootReady() || st.failed) { clearTimeout(t0); res(); } });
        });
        live = { layer, bar, ready, itemId };
        layers.set(url, live);
        return live;
      };
      probe.__spaceTiles = () => liveLayers().map((l) => ({ id: l.itemId, files: l.layer.loadedFiles(), status: l.layer.status() }));
      const toScreen = (v3: any): { x: number; y: number } | null => {
        const v = v3.clone().project(camera);
        if (v.z > 1) return null;
        const r = renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      };
      probe.__spaceTileScreenOf = (uri: string) => {
        for (const l of liveLayers()) {
          const c = l.layer.centreOf(uri);
          if (!c) continue;
          return toScreen(c);
        }
        return null;
      };
      const stripOf = (item: SceneItem): HTMLElement => {
        const el = document.createElement("div");
        el.className = "v3d-strip";
        el.dataset.id = item.id;
        const b = document.createElement("b");
        b.textContent = item.label;
        el.appendChild(b);
        strips.appendChild(el);
        return el;
      };

      const extent = (): any => {
        const b = new THREE.Box3();
        for (const c of content.children) if (!c.userData.contour && !c.userData.tiles && !c.userData.helper) b.expandByObject(c);
        for (const l of liveLayers()) { const lb = l.layer.bounds(); if (lb) b.union(lb); }
        return b.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5)) : b;
      };
      const span = (): number => { const s = extent().getSize(new THREE.Vector3()); return Math.max(s.x, s.y, s.z) || 1; };
      const addLabel = (text: string, at: any, cls: string, id?: string) => {
        const el = document.createElement("span");
        el.className = `v3d-label scn-label ${cls}`;
        el.textContent = text;
        if (id) el.dataset.id = id;
        labels.appendChild(el);
        anchors.push({ el, p: at.clone() });
      };
      const translucent = (item: SceneItem) => {
        const c = new THREE.Color();
        const [r, g, b] = item.rgb ?? [0.328, 0.033, 0.033];
        c.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
        // MICRO-SPAZIO-3D · «in fil di ferro»: the overlay draws the proxies as wire
        const wire = ov("s3_proxy_wire");
        return new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: wire ? 0.9 : 0.42,
          depthWrite: false, wireframe: wire });
      };
      const selOutline = (item: SceneItem) => item.selected && ov("s3_sel_outline");
      const outline = (geom: any, item: SceneItem, at?: any) => {
        const col = selOutline(item) ? 0xbf9000 : new THREE.Color(item.edge ?? "#555555");
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: col }));
        if (at) e.position.copy(at);
        return e;
      };
      const tag = (obj: any, item: SceneItem) => {
        obj.traverse((o: any) => {
          if (item.kind === "proxy") o.userData.unitId = item.id; else o.userData.rmId = item.id;
          if (o.isMesh) pickables.push(o);
        });
      };
      const centreOf = (obj: any) => new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
      const topOf = (obj: any) => {
        const b = new THREE.Box3().setFromObject(obj);
        return new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
      };
      const selBox = (obj: any) => {
        const hb = new THREE.Box3Helper(new THREE.Box3().setFromObject(obj), 0xbf9000);
        hb.userData.helper = true;
        return hb;
      };

      // ── the camera: Blender's navigation (space-nav.ts) ─────────────────
      const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
      const arr = (v: any): V3 => [v.x, v.y, v.z];
      const camState = (): CamState => ({ pos: arr(camera.position), target: arr(controls.target) });
      const updateClip = () => {
        const { near, far } = clipPlanes(camera.position.distanceTo(controls.target), span());
        if (Math.abs(camera.near - near) / near > 0.05 || camera.far !== far) {
          camera.near = near;
          camera.far = far;
          camera.updateProjectionMatrix();
        }
      };
      const applyCam = (c: CamState) => {
        // a camera given (a jump, a frame of a key, «Indietro») is the reader's
        // point of view from now on: the first arrival of the content does not
        // frame over it
        framed = true;
        camera.position.copy(v3(c.pos));
        controls.target.copy(v3(c.target));
        camera.lookAt(controls.target);
        updateClip();
        controls.update();
      };
      frameIt = () => {
        const b = extent();
        const c = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());
        const sp = Math.max(s.x, s.y, s.z) || 1;
        controls.target.copy(c);
        camera.position.copy(c).add(new THREE.Vector3(sp * 0.9, sp * 0.7, sp * 1.5));
        camera.near = sp / 200;
        camera.far = sp * 200;
        camera.updateProjectionMatrix();
        updateClip();
        controls.update();
      };
      const ray = new THREE.Raycaster();
      const ndcOf = (x: number, y: number) => {
        const r = renderer.domElement.getBoundingClientRect();
        return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      };
      type Hit = { point: any; normal: any | null; kind: "proxy" | "rm" | "sketch"; id: string; distance: number; face?: any; object?: any };
      const locked = () => opts.locked?.() ?? new Set<string>();
      /** everything under a page point, nearest first (tiles too) */
      const hitsAt = (x: number, y: number): Hit[] => {
        ray.setFromCamera(ndcOf(x, y), camera);
        const out: Hit[] = [];
        const lk = locked();
        if (sketchGroup.visible)
          for (const hh of ray.intersectObjects(sketchGroup.children, true)) {
            const id = hh.object.userData.sketchId;
            if (id && !lk.has(`sketch:${id}`)) out.push({ point: hh.point, normal: hh.face?.normal ?? null, kind: "sketch", id, distance: hh.distance, face: hh.face, object: hh.object });
          }
        for (const hh of ray.intersectObjects(pickables.filter((o) => o.visible !== false), false)) {
          const u = hh.object.userData;
          const kind = u.unitId ? "proxy" : "rm";
          const id = String(u.unitId ?? u.rmId);
          if (lk.has(`${kind}:${id}`)) continue;
          out.push({ point: hh.point, normal: hh.face?.normal ?? null, kind, id, distance: hh.distance, face: hh.face, object: hh.object });
        }
        for (const l of liveLayers()) {
          if (!l.layer.object.visible) continue;
          for (const hh of ray.intersectObject(l.layer.object, true)) {
            if (lk.has(`rm:${l.itemId}`)) continue;
            out.push({ point: hh.point, normal: hh.face?.normal ?? null, kind: "rm", id: l.itemId, distance: hh.distance, face: hh.face, object: hh.object });
          }
        }
        return out.sort((a, b) => a.distance - b.distance);
      };
      /** the surface point under a page point, else the point of its ray at the pivot's depth */
      const pointAt = (x: number, y: number): { p: V3; hit: Hit | null } => {
        const hits = hitsAt(x, y);
        if (hits[0]) return { p: arr(hits[0].point), hit: hits[0] };
        ray.setFromCamera(ndcOf(x, y), camera);
        const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
        const depth = dir.length();
        dir.normalize();
        const cos = Math.max(0.05, ray.ray.direction.dot(dir));
        return { p: arr(ray.ray.origin.clone().addScaledVector(ray.ray.direction, depth / cos)), hit: null };
      };
      const worldNormal = (hit: Hit): V3 | null => {
        if (!hit.normal || !hit.object) return null;
        const n = hit.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
        return arr(n);
      };
      probe.__spaceHit = (x: number, y: number) => {
        const hh = hitsAt(x, y)[0];
        return hh ? { point: arr(hh.point).map((q) => Math.round(q * 10000) / 10000), kind: hh.kind, id: hh.id,
          distance: Math.round(hh.distance * 10000) / 10000,
          normal: (worldNormal(hh) ?? [0, 0, 0]).map((q) => Math.round(q * 1000) / 1000) } : null;
      };
      probe.__spaceProject = (p: number[]) => toScreen(new THREE.Vector3(p[0], p[1], p[2]));
      probe.__spaceClip = () => [camera.near, camera.far];
      const zoomAt = (x: number, y: number, factor: number) => {
        const { p } = pointAt(x, y);
        applyCam(zoomTowards(camState(), p, factor));
      };
      const orbitBy = (dx: number, dy: number) => {
        const off = new THREE.Vector3().subVectors(camera.position, controls.target);
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.theta -= dx * 0.005;
        sph.phi = Math.min(Math.PI - 0.01, Math.max(0.01, sph.phi - dy * 0.005));
        off.setFromSpherical(sph);
        camera.position.copy(controls.target).add(off);
        camera.lookAt(controls.target);
        controls.update();
      };
      const panBy = (dx: number, dy: number) => {
        const dist = camera.position.distanceTo(controls.target);
        const k = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, renderer.domElement.clientHeight);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        const d = right.multiplyScalar(dx * k).add(up.multiplyScalar(-dy * k));
        camera.position.add(d);
        controls.target.add(d);
        controls.update();
      };
      /** a box of objects (a model's meshes, a tileset's tiles, a proxy, a sketch) */
      const boxOfKey = (k: string): any | null => {
        const [kind, ...rest] = k.split(":");
        const id = rest.join(":");
        const b = new THREE.Box3();
        if (kind === "sketch") {
          const m = sketchMeshes.get(id);
          if (m) b.expandByObject(m);
        } else {
          content.updateMatrixWorld(true);
          content.traverse((o: any) => {
            if (!o.isMesh && !o.isLineSegments) return;
            if (kind === "proxy" ? o.userData.unitId === id : o.userData.rmId === id) b.expandByObject(o);
          });
          const live = liveLayers().find((l) => l.itemId === id);
          const lb = live ? live.layer.bounds() : null;
          if (lb) b.union(lb);
        }
        return b.isEmpty() ? null : b;
      };
      const frameBox = (b: any) => {
        const sphere = b.getBoundingSphere(new THREE.Sphere());
        applyCam(frameSphere(camState(), arr(sphere.center), sphere.radius, camera.fov, camera.aspect));
      };

      // ── the sketches ─────────────────────────────────────────────────────
      const sketchMeshes = new Map<string, any>();
      const sketchMaterial = () => new THREE.MeshLambertMaterial({ color: new THREE.Color("#d9822b"), transparent: true,
        opacity: ov("s3_proxy_wire") ? 0.9 : 0.55, depthWrite: false, wireframe: ov("s3_proxy_wire") });
      const poseOf = (m: any): Pose => ({ position: arr(m.position), rotation: [m.rotation.x, m.rotation.y, m.rotation.z], scale: arr(m.scale) });
      const setPose = (m: any, p: Pose) => {
        m.position.set(...p.position);
        m.rotation.set(p.rotation[0], p.rotation[1], p.rotation[2]);
        m.scale.set(...p.scale);
        m.updateMatrixWorld(true);
      };
      const gizmo = TransformControls ? new TransformControls(camera, renderer.domElement) : null;
      const gizmoHelper = gizmo ? (typeof gizmo.getHelper === "function" ? gizmo.getHelper() : gizmo) : null;
      if (gizmoHelper) scene.add(gizmoHelper);
      let gizmoDragging = false;
      if (gizmo) {
        gizmo.setSize?.(0.8);
        gizmo.addEventListener("dragging-changed", (ev: any) => {
          controls.enabled = !ev.value;
          gizmoDragging = !!ev.value;
          if (!ev.value && sketchSel) {
            const m = sketchMeshes.get(sketchSel);
            if (m) { updateSketch(sketchSel, poseOf(m)); opts.onSketchChange?.(sketchSel); }
          }
        });
        gizmo.addEventListener("objectChange", () => {
          if (!sketchSel) return;
          const m = sketchMeshes.get(sketchSel);
          if (m) updateSketch(sketchSel, poseOf(m), true);
        });
      }
      const attachGizmo = () => {
        if (!gizmo) return;
        const m = sketchSel ? sketchMeshes.get(sketchSel) : null;
        if (m && ov("s3_gizmo") && ov("s3_sketches")) gizmo.attach(m); else gizmo.detach();
      };
      const syncSketches = () => {
        const list = listSketches();
        const want = new Set(list.map((s) => s.id));
        for (const [id, m] of sketchMeshes) if (!want.has(id)) { sketchGroup.remove(m); sketchMeshes.delete(id); }
        for (const s of list) {
          let m = sketchMeshes.get(s.id);
          if (!m) {
            const spec = shapeById(s.shape);
            if (!spec) continue;
            const g = buildShapeGeometry(THREE, spec);
            m = new THREE.Mesh(g, sketchMaterial());
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), new THREE.LineBasicMaterial({ color: 0x7a3d00 }));
            edges.userData.edges = true;
            m.add(edges);
            m.userData.sketchId = s.id;
            sketchGroup.add(m);
            sketchMeshes.set(s.id, m);
          }
          if (!(modal && modal.id === s.id)) setPose(m, { position: s.position, rotation: s.rotation, scale: s.scale });
          m.visible = opts.sketchVisible?.(s.id) ?? true;
          const sel = s.id === sketchSel;
          m.material.dispose();
          m.material = sketchMaterial();
          for (const c of m.children) if (c.userData.edges) c.material.color.set(sel && ov("s3_sel_outline") ? 0xffb000 : 0x7a3d00);
        }
        if (sketchSel && !want.has(sketchSel)) sketchSel = null;
        attachGizmo();
      };
      probe.__spaceSketches = () => listSketches().map((s: Sketch) => ({ ...s, selected: s.id === sketchSel }));

      // ── the decorators: grid and axes, the epoch's box ───────────────────
      const buildDecor = () => {
        decor.clear();
        const b = extent();
        const c = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());
        const sp = Math.max(s.x, s.z, 1);
        if (ov("s3_grid")) {
          // a grid of whole metres under the content, ten lines per side at least
          const step = Math.pow(10, Math.floor(Math.log10(sp / 10)));
          const n = Math.ceil((sp * 1.4) / step);
          const grid = new THREE.GridHelper(n * step, n, 0x8a8a8a, 0xb8b8b8);
          grid.position.set(c.x, b.min.y, c.z);
          grid.material.transparent = true;
          grid.material.opacity = 0.55;
          grid.userData.helper = true;
          decor.add(grid);
          // the axes through the grid's centre, as Blender's floor: X red, Y
          // (Blender's, three's −z) green
          const L = (n * step) / 2;
          const ax = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c.x - L, b.min.y, c.z), new THREE.Vector3(c.x + L, b.min.y, c.z)]);
          const ay = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c.x, b.min.y, c.z + L), new THREE.Vector3(c.x, b.min.y, c.z - L)]);
          decor.add(new THREE.Line(ax, new THREE.LineBasicMaterial({ color: 0xd04040 })));
          decor.add(new THREE.Line(ay, new THREE.LineBasicMaterial({ color: 0x40a040 })));
        }
        if (ov("s3_epoch_box") && content.children.length) {
          const hb = new THREE.Box3Helper(b.clone().expandByScalar(sp * 0.01), 0x6b8fb5);
          hb.userData.helper = true;
          decor.add(hb);
        }
      };

      rebuild = () => {
        const gen = ++generation;
        content.clear();
        labels.textContent = "";
        anchors.length = 0;
        pickables.length = 0;
        unitCentres.clear();
        drawn.clear();
        strips.textContent = "";
        const pending: Promise<void>[] = [];
        const later: SceneItem[] = [];      // contours and labels: after the meshes, around them
        const used = new Set<string>();
        for (const item of items) {
          const key = `${item.kind}:${item.id}`;
          // MICRO-3DTILES · a tileset (the item's own, or the one chosen over
          // a glb past the threshold)
          const tsUrl = item.state === "resident" && item.url
            ? (isTilesetUrl(item.url) || item.tiles ? item.url : useTileset.has(key) && item.tileset ? item.tileset : null) : null;
          if (tsUrl) {
            used.add(tsUrl);
            drawn.set(key, { item, as: "pending", url: tsUrl });
            const el = stripOf(item);
            pending.push(ensureLayer(tsUrl, item.id, tsUrl === item.url && item.tiles === "3tz").then(async (live) => {
              if (gen !== generation || disposed) return;
              if (!live) { drawn.set(key, { item: { ...item, state: "missing" }, as: "label" }); later.push({ ...item, state: "missing" }); return; }
              live.layer.object.userData.tiles = true;
              live.layer.object.traverse((o: any) => { o.userData.rmId = item.id; });
              content.add(live.layer.object);
              el.appendChild(live.bar.el);
              live.bar.refresh();
              await live.ready;
              if (gen !== generation || disposed) return;
              const bb = live.layer.bounds();
              if (bb) addLabel(item.label, new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2), "rm", item.id);
              drawn.set(key, { item, as: "tiles", url: tsUrl });
            }));
            continue;
          }
          if (item.state === "resident" && item.url && item.kind === "rm") {
            // a LOD set: the lightest level, or the one chosen; and the threshold
            const base = item.url;
            if (lodLevelOf(base) != null && !lodSets.has(base)) lodSets.set(base, probeLods(base));
            const el = lodLevelOf(base) != null || opts.limit ? stripOf(item) : null;
            drawn.set(key, { item, as: "pending" });
            pending.push((async () => {
              const set = lodLevelOf(base) != null ? await lodSets.get(base)! : [];
              const lvl = lodChoice.get(key) ?? set[set.length - 1]?.level;
              const chosen = set.find((x) => x.level === lvl);
              const u = chosen?.url ?? base;
              if (gen !== generation || disposed) return;
              if (set.length && el) {
                const sel = document.createElement("select");
                sel.className = "lod-pick";
                for (const v of set) {
                  const o = document.createElement("option");
                  o.value = String(v.level);
                  o.textContent = `LOD ${v.level}${v.bytes != null ? ` · ${formatBytes(v.bytes)}` : ""}`;
                  o.selected = v.level === lvl;
                  sel.appendChild(o);
                }
                sel.addEventListener("change", () => { lodChoice.set(key, Number(sel.value)); rebuild?.(); });
                const note = document.createElement("span");
                note.className = "lod-note";
                note.textContent = opts.texts.lodNote(set.length);
                el.append(sel, note);
              }
              // the threshold: what the graph knows, else a HEAD
              const lim = opts.limit;
              if (lim && !forced.has(u)) {
                const bytes = (u === base ? item.bytes : null) ?? chosen?.bytes ?? await headBytes(u);
                const pts = u === base ? item.points ?? null : null;
                if (gen !== generation || disposed) return;
                if ((bytes != null && bytes > lim.bytes) || (pts != null && pts > lim.points)) {
                  drawn.set(key, { item, as: "gated", url: u });
                  later.push({ ...item, state: "missing", label: opts.texts.overLimit(item.label, formatBytes(bytes ?? 0), formatBytes(lim.bytes)) });
                  if (el) {
                    if (item.tileset) {
                      const b = document.createElement("button");
                      b.type = "button"; b.className = "scn-tg"; b.dataset.gate = "tileset";
                      b.textContent = opts.texts.openTileset;
                      b.addEventListener("click", () => { useTileset.add(key); rebuild?.(); });
                      el.appendChild(b);
                    }
                    const g = document.createElement("button");
                    g.type = "button"; g.className = "scn-tg"; g.dataset.gate = "load";
                    g.textContent = opts.texts.loadAnyway;
                    g.addEventListener("click", () => { forced.add(u); rebuild?.(); });
                    el.appendChild(g);
                  }
                  return;
                }
              }
              if (el && !el.querySelector("select")) el.remove();
              const got = await load(u);
              if (gen !== generation || disposed) return;
              if ("fail" in got) {
                drawn.set(key, { item: failed(item, got.fail), as: "label" });
                later.push(failed(item, got.fail));
                if (item.resourceId) opts.onNotFound?.(item.resourceId, got.fail);
                return;
              }
              const obj = got.root.clone(true);
              if (selOutline(item)) content.add(selBox(obj));
              tag(obj, item);
              content.add(obj);
              addLabel(item.label, topOf(obj), "rm", item.id);
              drawn.set(key, { item, as: "mesh", url: u });
            })());
            continue;
          }
          if (item.state === "resident" && item.url) {
            drawn.set(`${item.kind}:${item.id}`, { item, as: "pending" });
            pending.push(load(item.url).then((got) => {
              if (gen !== generation || disposed) return;
              if ("fail" in got) {
                drawn.set(`${item.kind}:${item.id}`, { item: failed(item, got.fail), as: "label" });
                later.push(failed(item, got.fail));
                if (item.resourceId) opts.onNotFound?.(item.resourceId, got.fail);
                return;
              }
              const obj = got.root.clone(true);
              if (item.kind === "proxy") {
                obj.traverse((o: any) => { if (o.isMesh) o.material = translucent(item); });
                obj.traverse((o: any) => { if (o.isMesh) o.add(outline(o.geometry, item)); });
              } else if (selOutline(item)) {
                content.add(selBox(obj));
              }
              tag(obj, item);
              content.add(obj);
              if (item.kind === "proxy") unitCentres.set(item.id, centreOf(obj));
              addLabel(item.label, topOf(obj), item.kind === "proxy" ? `u${item.selected ? " sel" : ""}` : "rm", item.id);
              drawn.set(`${item.kind}:${item.id}`, { item, as: "mesh", url: item.url });
            }));
          } else if (item.state === "json") {
            const group = new THREE.Group();
            for (const flat of item.convexshapes ?? []) {
              const pts = [];
              for (let i = 0; i + 2 < flat.length; i += 3) pts.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
              if (pts.length < 4) continue;
              const g = new ConvexGeometry(pts);
              const m = new THREE.Mesh(g, translucent(item));
              m.add(outline(g, item));
              group.add(m);
            }
            for (const [x, y, z, r] of item.spheres ?? []) {
              const g = new THREE.SphereGeometry(r, 24, 16);
              const m = new THREE.Mesh(g, translucent(item));
              m.position.set(x, y, z);
              group.add(m);
            }
            if (!group.children.length) continue;
            tag(group, item);
            content.add(group);
            unitCentres.set(item.id, centreOf(group));
            addLabel(item.label, topOf(group), `u${item.selected ? " sel" : ""}`, item.id);
            drawn.set(`${item.kind}:${item.id}`, { item, as: "mesh" });
          } else later.push(item);
        }
        for (const [u, l] of layers) if (!used.has(u)) { l.layer.dispose(); layers.delete(u); }
        void Promise.all(pending).then(() => {
          if (gen !== generation || disposed) return;
          const b = extent();
          let k = 0;
          for (const item of later) {
            const key = `${item.kind}:${item.id}`;
            if (item.state === "reference") {
              // a place, not a shape: the room of what is drawn, a little larger
              const box = b.clone().expandByScalar(0.08 + 0.04 * k++);
              const s = box.getSize(new THREE.Vector3());
              const g = new THREE.BoxGeometry(s.x, s.y, s.z);
              const c = new THREE.LineSegments(new THREE.EdgesGeometry(g),
                new THREE.LineDashedMaterial({ color: new THREE.Color(item.edge ?? "#8a5a00"), dashSize: 0.12, gapSize: 0.08 }));
              c.computeLineDistances();
              c.position.copy(box.getCenter(new THREE.Vector3()));
              c.userData.contour = true;
              tag(c, item);
              content.add(c);
              // at the right-hand top corner: the summary sits top-left
              addLabel(opts.texts.referenceOnly(item.label),
                new THREE.Vector3(box.max.x, box.max.y + 0.15 * k, box.max.z), "ref", item.id);
              drawn.set(key, { item, as: "contour" });
            } else {
              const at = b.getCenter(new THREE.Vector3());
              at.y = b.max.y + 0.2 + 0.25 * k++;
              // MICRO-3DTILES · held back by the threshold: its label says so
              const gated = drawn.get(key)?.as === "gated";
              const refused = item.state === "refused";
              addLabel(gated ? item.label : refused ? opts.texts.refused(item.label) : opts.texts.missing(item.label), at,
                gated ? "miss gated" : refused ? "miss refused" : "miss", item.id);
              if (!gated) drawn.set(key, { item, as: "label" });
            }
          }
          if (!framed && content.children.length) { framed = true; frameIt?.(); }
          buildDecor();
          if (!cursorSet && content.children.length) {
            // the cursor is born on the surface in the middle of the view (where
            // a shape made at once can be seen), else at the base of what is drawn
            const bb = extent();
            const c = bb.getCenter(new THREE.Vector3());
            camera.updateMatrixWorld();
            ray.setFromCamera(new THREE.Vector2(0, 0), camera);
            const hh = ray.intersectObjects(pickables, false)[0];
            cursorAt = hh ? arr(hh.point) : [c.x, bb.min.y, c.z];
          }
          host.dataset.ready = "1";
          host.dataset.items = String(drawn.size);
        });
      };

      const place = () => {
        const W = renderer.domElement.clientWidth || w, H = renderer.domElement.clientHeight || h;
        labels.style.display = ov("s3_labels") ? "" : "none";
        if (ov("s3_labels"))
          for (const a of anchors) {
            const v = a.p.clone().project(camera);
            a.el.style.left = `${((v.x + 1) / 2) * W}px`;
            a.el.style.top = `${((1 - v.y) / 2) * H}px`;
            a.el.style.display = v.z < 1 ? "" : "none";
          }
        // the 3D cursor: a screen element where its point falls
        const cv = v3(cursorAt).project(camera);
        const showCursor = ov("s3_cursor") && cv.z < 1 && Math.abs(cv.x) <= 1.05 && Math.abs(cv.y) <= 1.05;
        cursorEl.style.display = showCursor ? "" : "none";
        if (showCursor) {
          cursorEl.style.left = `${((cv.x + 1) / 2) * W}px`;
          cursorEl.style.top = `${((1 - cv.y) / 2) * H}px`;
        }
      };
      probe.__spaceScreenOf = (id: string) => {
        const c = unitCentres.get(id);
        if (!c) return null;
        return toScreen(c);
      };
      probe.__spaceCamera = () => [...camera.position.toArray(), ...controls.target.toArray()].map((x: number) => Math.round(x * 1000) / 1000);
      probe.__spaceCursor = () => cursorAt.map((q) => Math.round(q * 10000) / 10000);
      probe.__spaceBoxOf = (id: string) => {
        const live = liveLayers().find((l) => l.itemId === id);
        let b = live ? live.layer.contentBox() : null;
        if (!live) {
          content.updateMatrixWorld(true);
          const bb = new THREE.Box3();
          content.traverse((o: any) => { if (o.isMesh && o.userData.rmId === id) bb.expandByObject(o); });
          b = bb.isEmpty() ? null : bb;
        }
        return b ? [...b.min.toArray(), ...b.max.toArray()].map((x: number) => Math.round(x * 1000) / 1000) : null;
      };
      const applyOverlays = () => {
        content.traverse((o: any) => {
          if (o.isMesh && o.userData.unitId && o.material) {
            const wire = ov("s3_proxy_wire");
            o.material.wireframe = wire;
            o.material.opacity = wire ? 0.9 : 0.42;
          }
        });
        for (const m of sketchMeshes.values()) {
          m.material.wireframe = ov("s3_proxy_wire");
          m.material.opacity = ov("s3_proxy_wire") ? 0.9 : 0.55;
        }
        sketchGroup.visible = ov("s3_sketches");
        buildDecor();
        attachGizmo();
      };
      probe.__spaceOverlays = () => Object.fromEntries((["s3_labels", "s3_proxies", "s3_proxy_wire", "s3_rm", "s3_tiles",
        "s3_grid", "s3_epoch_box", "s3_sel_outline", "s3_gizmo", "s3_cursor", "s3_sketches"] as OverlayKey[]).map((k) => [k, ov(k)]));
      let raf = 0;
      let frames = 0;
      const tick = () => {
        if (disposed) return;
        raf = requestAnimationFrame(tick);
        controls.update();
        const live = liveLayers();
        for (const l of live) l.layer.update();
        if (live.length && ++frames % 20 === 0) for (const l of live) l.bar.refresh();
        renderer.render(scene, camera);
        place();
      };

      // ── the gestures (space-nav.ts: the table, written once) ─────────────
      const mac = isMacPlatform();
      const isTrackpad = trackpadClassifier();
      let down: { x: number; y: number; button: number } | null = null;
      let boxArmed = false;
      let boxStart: { x: number; y: number } | null = null;
      type Modal = { id: string; st: ModalState; start: Pose; mouse0: { x: number; y: number } | null; mouse: { x: number; y: number } | null };
      let modal: Modal | null = null;
      let lastMouse: { x: number; y: number } | null = null;
      const pickSketch = (id: string | null) => {
        sketchSel = id;
        syncSketches();
        opts.onPickSketch?.(id);
      };
      const showModal = () => {
        modalEl.classList.toggle("hidden", !modal);
        if (modal) modalEl.textContent = `${modalLabel(modal.st)}${opts.texts.modalHint ? ` · ${opts.texts.modalHint}` : ""}`;
      };
      const modalPose = (): Pose | null => {
        if (!modal) return null;
        const st = modal.st;
        if (modalValue(st) != null) return applyTyped(modal.start, st);
        if (!modal.mouse0 || !modal.mouse) return modal.start;
        const m = sketchMeshes.get(modal.id);
        if (!m) return modal.start;
        const dx = modal.mouse.x - modal.mouse0.x, dy = modal.mouse.y - modal.mouse0.y;
        const centre = toScreen(v3(modal.start.position)) ?? modal.mouse0;
        if (st.mode === "grab") {
          const dist = camera.position.distanceTo(v3(modal.start.position));
          const k = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, renderer.domElement.clientHeight);
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
          const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
          let d = right.multiplyScalar(dx * k).add(up.multiplyScalar(-dy * k));
          if (st.axis) { const a = v3(AXIS_VECTOR[st.axis]); d = a.multiplyScalar(d.dot(a)); }
          return { ...modal.start, position: arr(v3(modal.start.position).add(d)) };
        }
        if (st.mode === "rotate") {
          const a0 = Math.atan2(modal.mouse0.y - centre.y, modal.mouse0.x - centre.x);
          const a1 = Math.atan2(modal.mouse.y - centre.y, modal.mouse.x - centre.x);
          const deg = -((a1 - a0) * 180) / Math.PI;
          return applyTyped(modal.start, { ...st, typed: String(deg) });
        }
        const r0 = Math.hypot(modal.mouse0.x - centre.x, modal.mouse0.y - centre.y) || 1;
        const r1 = Math.hypot(modal.mouse.x - centre.x, modal.mouse.y - centre.y);
        return applyTyped(modal.start, { ...st, typed: String(r1 / r0) });
      };
      const modalApply = () => {
        if (!modal) return;
        const m = sketchMeshes.get(modal.id);
        const p = modalPose();
        if (m && p) setPose(m, p);
        showModal();
      };
      const startModalOn = (mode: ModalMode) => {
        if (!sketchSel || !ov("s3_sketches")) return false;
        const m = sketchMeshes.get(sketchSel);
        if (!m) return false;
        modal = { id: sketchSel, st: startModal(mode), start: poseOf(m), mouse0: lastMouse, mouse: lastMouse };
        controls.enabled = false;
        gizmo?.setMode?.(mode === "grab" ? "translate" : mode === "rotate" ? "rotate" : "scale");
        showModal();
        return true;
      };
      const endModal = (confirm: boolean) => {
        if (!modal) return;
        const m = sketchMeshes.get(modal.id);
        if (m) {
          if (!confirm) setPose(m, modal.start);
          updateSketch(modal.id, poseOf(m));
          if (confirm) opts.onSketchChange?.(modal.id);
        }
        modal = null;
        controls.enabled = true;
        showModal();
      };
      probe.__spaceModal = () => (modal ? modalLabel(modal.st) : null);

      const onDown = (e: PointerEvent) => {
        lastMouse = { x: e.clientX, y: e.clientY };
        // the capture phase, before OrbitControls and the gizmo: a modal's click
        // and a box's drag are not an orbit
        if (modal) {
          e.preventDefault();
          e.stopImmediatePropagation();
          endModal(e.button === 0);
          down = null;
          return;
        }
        if (boxArmed && e.button === 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          boxStart = { x: e.clientX, y: e.clientY };
          controls.enabled = false;
          return;
        }
        down = { x: e.clientX, y: e.clientY, button: e.button };
      };
      const onMove = (e: PointerEvent) => {
        lastMouse = { x: e.clientX, y: e.clientY };
        if (modal) {
          if (!modal.mouse0) modal.mouse0 = lastMouse;
          modal.mouse = lastMouse;
          modalApply();
          return;
        }
        if (boxStart) {
          const r = host.getBoundingClientRect();
          const x0 = Math.min(boxStart.x, e.clientX) - r.left, y0 = Math.min(boxStart.y, e.clientY) - r.top;
          boxEl.style.left = `${x0}px`;
          boxEl.style.top = `${y0}px`;
          boxEl.style.width = `${Math.abs(e.clientX - boxStart.x)}px`;
          boxEl.style.height = `${Math.abs(e.clientY - boxStart.y)}px`;
          boxEl.classList.remove("hidden");
        }
      };
      const finishBox = (e: PointerEvent) => {
        const s = boxStart!;
        boxStart = null;
        boxArmed = false;
        boxEl.classList.add("hidden");
        host.classList.remove("scn-armed");
        controls.enabled = true;
        if (Math.abs(e.clientX - s.x) < DRAG_PX || Math.abs(e.clientY - s.y) < DRAG_PX) return;
        const a = ndcOf(s.x, s.y), b = ndcOf(e.clientX, e.clientY);
        const cx = (s.x + e.clientX) / 2, cy = (s.y + e.clientY) / 2;
        const { p } = pointAt(cx, cy);
        opts.onBeforeJump?.();
        applyCam(boxZoom(camState(), [a.x, a.y, b.x, b.y], p));
      };
      const onUp = (e: PointerEvent) => {
        if (boxStart) { finishBox(e); return; }
        if (gizmoDragging) { down = null; return; }
        const moved = !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX;
        const button = down?.button ?? e.button;
        down = null;
        if (moved) return;
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        // MICRO-3DTILES · «Più dettaglio qui» armed on a tileset: the click is its
        const armed = liveLayers().find((l) => l.bar.armed());
        if (armed && button === 0) {
          const th = ray.intersectObject(armed.layer.object, true)[0];
          armed.bar.picked(th ? armed.layer.refineAt(th.object) : "none");
          return;
        }
        const intent = pointerIntent({ button, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey }, mac);
        const hits = hitsAt(e.clientX, e.clientY);
        if (intent === "cursor") {
          const { p } = pointAt(e.clientX, e.clientY);
          cursorAt = p;
          cursorSet = true;
          opts.onCursor?.(p);
          return;
        }
        if (intent === "menu-proxy" || intent === "menu-rm") {
          const sk = hits.find((x) => x.kind === "sketch");
          const want = intent === "menu-rm" ? hits.find((x) => x.kind === "rm") : sk ?? hits.find((x) => x.kind === "proxy");
          const hit = want ?? null;
          if (hit?.kind === "sketch") pickSketch(hit.id);
          opts.onMenu?.({ kind: hit ? hit.kind : "none", id: hit?.id ?? null, x: e.clientX, y: e.clientY,
            point: hits[0] ? arr(hits[0].point) : null });
          return;
        }
        if (intent === "pick-rm") {
          const hit = hits.find((x) => x.kind === "rm");
          if (hit) opts.onPickRm?.(hit.id); else opts.onPickNone?.();
          return;
        }
        if (intent === "pick-proxy") {
          // a sketch, then a proxy: what a plain click means here; the model
          // under it is ⌘'s (Ctrl's) — E.D., 11 Oct 2026
          const hit = hits.find((x) => x.kind === "sketch" || x.kind === "proxy");
          if (hit?.kind === "sketch") { pickSketch(hit.id); return; }
          if (sketchSel) pickSketch(null);
          if (hit) opts.onPickUnit?.(hit.id); else opts.onPickNone?.();
        }
      };
      const onContext = (e: MouseEvent) => { e.preventDefault(); };
      const onDbl = (e: MouseEvent) => {
        if (modal || boxArmed || e.button !== 0) return;
        const hh = hitsAt(e.clientX, e.clientY)[0];
        if (!hh) return;
        opts.onBeforeJump?.();
        applyCam(detailZoom(camState(), arr(hh.point), camera.fov));
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (modal) return;
        if (e.ctrlKey) { zoomAt(e.clientX, e.clientY, wheelFactor(e.deltaY, e.deltaMode, true, host.clientHeight)); return; }
        if (isTrackpad(e as unknown as { deltaMode: number; deltaX: number; deltaY: number; wheelDeltaY?: number })) {
          if (e.shiftKey) panBy(-e.deltaX, -e.deltaY); else orbitBy(e.deltaX, e.deltaY);
          return;
        }
        zoomAt(e.clientX, e.clientY, wheelFactor(e.deltaY, e.deltaMode, false, host.clientHeight));
      };
      // WebKit (Safari, the desktop's WKWebView) gives a pinch as gestures
      let gestureScale = 1;
      const onGestureStart = (e: Event) => { e.preventDefault(); gestureScale = 1; };
      const onGestureChange = (e: Event) => {
        e.preventDefault();
        const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
        const sc = typeof g.scale === "number" && g.scale > 0 ? g.scale : 1;
        const r = renderer.domElement.getBoundingClientRect();
        zoomAt(g.clientX ?? r.left + r.width / 2, g.clientY ?? r.top + r.height / 2, gestureScale / sc);
        gestureScale = sc;
      };
      const onKey = (e: KeyboardEvent) => {
        if (!opts.isFocused?.()) return;
        const t = e.target as HTMLElement | null;
        if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable)) return;
        const stop = () => { e.preventDefault(); e.stopPropagation(); };
        if (modal) {
          stop();
          const next = modalKey(modal.st, e.key);
          if (next.done) { modal.st = next; endModal(next.done === "confirm"); return; }
          modal.st = next;
          modalApply();
          return;
        }
        const a = spaceKeyAction(e, mac);
        if (!a) return;
        switch (a) {
          case "frame-selection": {
            const keys = sketchSel ? [`sketch:${sketchSel}`] : items.filter((i) => i.selected).map((i) => `${i.kind}:${i.id}`);
            if (!keys.length || !api.frameKeys?.(keys)) frameIt?.();
            stop();
            return;
          }
          case "frame-all": frameIt?.(); stop(); return;
          case "box-zoom": boxArmed = true; host.classList.add("scn-armed"); stop(); return;
          case "cursor-reset": {
            const b = extent();
            const sp = span();
            // the world's origin — unless the study is georeferenced and the
            // origin lies far from everything drawn (Templu Mare: 494 m below):
            // then the middle of the base of what is drawn
            const far = b.distanceToPoint(new THREE.Vector3(0, 0, 0)) > sp * 10;
            const c = b.getCenter(new THREE.Vector3());
            cursorAt = far ? [c.x, b.min.y, c.z] : [0, 0, 0];
            cursorSet = true;
            opts.onCursor?.(cursorAt);
            frameIt?.();
            stop();
            return;
          }
          case "grab": case "rotate": case "scale":
            if (startModalOn(a === "grab" ? "grab" : a === "rotate" ? "rotate" : "scale")) stop();
            return;
          case "cancel":
            if (boxArmed) { boxArmed = false; host.classList.remove("scn-armed"); stop(); }
            return;
          case "delete":
            if (sketchSel && opts.onKeyAction?.(a, e)) stop();
            return;
          default:
            if (opts.onKeyAction?.(a, e)) stop();
        }
      };
      renderer.domElement.addEventListener("pointerdown", onDown, true);
      renderer.domElement.addEventListener("pointerup", onUp);
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("contextmenu", onContext);
      renderer.domElement.addEventListener("dblclick", onDbl);
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
      renderer.domElement.addEventListener("gesturestart", onGestureStart);
      renderer.domElement.addEventListener("gesturechange", onGestureChange);
      document.addEventListener("keydown", onKey, true);
      const ro = new ResizeObserver(() => {
        ({ w, h } = size());
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        for (const l of layers.values()) l.layer.resize();
      });
      ro.observe(host);
      status.remove();
      host.prepend(renderer.domElement);
      host.appendChild(labels);
      host.appendChild(strips);
      host.append(cursorEl, modalEl, boxEl);
      cleanup = () => {
        cancelAnimationFrame(raf);
        for (const l of layers.values()) l.layer.dispose();
        layers.clear();
        strips.remove();
        ro.disconnect();
        document.removeEventListener("keydown", onKey, true);
        gizmo?.detach?.();
        gizmo?.dispose?.();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        labels.remove();
        cursorEl.remove();
        modalEl.remove();
        boxEl.remove();
      };
      api = {
        camera: camState,
        setCamera: (c: CamState) => applyCam(c),
        frameKeys: (keys: string[]) => {
          const b = new THREE.Box3();
          for (const k of keys) { const kb = boxOfKey(k); if (kb) b.union(kb); }
          if (b.isEmpty()) return false;
          frameBox(b);
          return true;
        },
        frameCursor: () => {
          const r = Math.max(0.5, camera.position.distanceTo(controls.target) * 0.15);
          applyCam(frameSphere(camState(), cursorAt, r, camera.fov, camera.aspect));
        },
        armBoxZoom: () => { boxArmed = true; host.classList.add("scn-armed"); },
        syncSketches,
        selectSketch: (id: string | null) => { sketchSel = id; syncSketches(); },
        selectedSketch: () => sketchSel,
        sketchGlb: async (id: string) => {
          const m = sketchMeshes.get(id);
          if (!m || !GLTFExporter) return null;
          // the pose BAKED into the vertices (Y-up, the same frame as the models
          // and the other proxies), one mesh, no edges
          m.updateMatrixWorld(true);
          const g = m.geometry.clone();
          g.applyMatrix4(m.matrixWorld);
          const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd9822b }));
          mesh.name = id;
          const exporter = new GLTFExporter();
          return await new Promise<ArrayBuffer | null>((res) => exporter.parse(mesh,
            (out: unknown) => res(out instanceof ArrayBuffer ? out : null), () => res(null), { binary: true }));
        },
        surfaceAt: (x: number, y: number) => {
          const hh = hitsAt(x, y).find((q) => q.kind !== "sketch");
          if (!hh) return null;
          return { point: arr(hh.point), normal: worldNormal(hh) ?? [0, 1, 0] };
        },
        applyOverlays,
        drawnUrl: (k: string) => drawn.get(k)?.url,
      };
      rebuild();
      syncSketches();
      tick();
    })();
  });

  return {
    update(next) {
      items = next;
      rebuild?.();
    },
    frame() { frameIt?.(); },
    dispose() {
      disposed = true;
      cleanup?.();
    },
    camera: () => api.camera?.() ?? null,
    setCamera: (c) => api.setCamera?.(c),
    frameKeys: (keys) => api.frameKeys?.(keys) ?? false,
    cursor: () => cursorAt,
    setCursor: (p) => { cursorAt = [...p] as V3; cursorSet = true; },
    frameCursor: () => api.frameCursor?.(),
    armBoxZoom: () => api.armBoxZoom?.(),
    syncSketches: () => api.syncSketches?.(),
    selectSketch: (id) => { sketchSel = id; api.selectSketch?.(id); },
    selectedSketch: () => sketchSel,
    sketchGlb: async (id) => (api.sketchGlb ? api.sketchGlb(id) : null),
    surfaceAt: (x, y) => api.surfaceAt?.(x, y) ?? null,
    applyOverlays: () => api.applyOverlays?.(),
    drawnUrl: (k) => api.drawnUrl?.(k),
  };
}
