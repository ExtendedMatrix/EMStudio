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
import type { OverlayKey, OverlayValueKey } from "./overlays";
import {
  alignedView, AXIS_INDEX, AXIS_VECTOR, boxZoom, freeAxes, modalHeader, threeToBlender, type ModalWords, clipPlanes, detailZoom, DRAG_PX, dragIntent, dragZoomFactor,
  frameSphere, grabPan, isMacPlatform, keypadAction, modalKey, modalLabel, modalValue, orthoBoxZoom, orthoHalf, orthoZoom,
  pointerIntent, sceneCentre, spaceKeyAction, startModal, wheelFactor, zoomTowards,
  gizmoHit, gizmoLayout, gizmoView, viewBetween, GIZMO_AXES, type GizmoAxis,
  type AlignedView, type Box6, type CamState, type DragIntent, type ModalMode, type ModalState, type Pose,
  type SpaceKeyAction, type V3,
} from "./space-nav";
import { medianPoint, pickUnder, type LastPick } from "./space-selection";
import { pickByDistance, versionError, type FlowVersion } from "./lod-flow";
import { buildShapeGeometry, listSketches, shapeById, updateSketch, type Sketch } from "./shapes3d";
import { fingersOf, trackpadClassifier } from "./wheel-kind";

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
  /** MICRO-SPAZIO-3D-2 · the object's transform, in three's axes, applied over
   *  the file as it is (the glb is never changed): absent = identity */
  pose?: Pose;
  /** the outline's colour (hex), e.g. the RM's placement axis */
  edge?: string;
  convexshapes?: number[][];
  spheres?: number[][];
  selected?: boolean;
  /** MICRO-SPAZIO-3D-3 · the ACTIVE object (the last clicked), as Blender's:
   *  its outline light, the other selected ones a darker orange */
  active?: boolean;
  /** MICRO-3DTILES · the tileset of the same model (proposed over the threshold) */
  tileset?: string;
  /** TEMPLU MARE v2 · C1 · `url` IS a tileset, in this form, whatever it ends
   *  with: a store URL (`…/asset/sha256:…`) names no `.3tz` */
  tiles?: "directory" | "3tz";
  /** MICRO-SPAZIO-3D-3 p.10 · the model's versions as a flow of LOD by the
   *  distance (`lod-flow.ts`): the scene draws the one the camera asks for,
   *  starting from `flowStart` (the lightest) */
  flow?: FlowVersion[];
  flowStart?: string;
  /** MICRO-SPAZIO-3D-3 p.12 · a container and its tileset, one or the other by
   *  the distance: the group, which side this item is, the tileset's error (m) */
  alt?: { group: string; role: "tileset" | "models"; err: number };
  /** MICRO-SPAZIO-3D-3 p.14 · the decorators of its label, as the graph's: a
   *  glyph of the datamodel (`kind`, author / licence / embargo / epoch) or a
   *  short text (PD n, «!»), each in its overlay's group */
  decor?: Array<{ group: "rights" | "pd" | "warning" | "epoch"; kind?: string; text?: string; title: string; inherited?: boolean }>;
  /** MICRO-SPAZIO-3D-3 p.6 · a proxy's other parts (more `geometry` properties):
   *  drawn with it, each with its own pose; G / R / S move the first */
  parts?: Array<{ url: string; resourceId?: string; pose?: Pose }>;
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
  /** MICRO-SPAZIO-3D-3 p.4b · the header's words (Move, Rotate, Scale, plane,
   *  local, free) and the numbers in the person's language */
  modalWords?: ModalWords;
  /** p.5 · «aggancio alla faccia» (G with Ctrl), «a scatti» (R / S with Ctrl) */
  snapFace?: string;
  snapStep?: string;
  num?: (v: number, digits: number) => string;
  /** MICRO-SPAZIO-3D-2 · the view's name, top left («Frontale · Ortometrica») */
  viewName?: (view: AlignedView | null, ortho: boolean) => string;
  /** Shift+C on an empty scene */
  centreEmpty?: string;
  /** MICRO-GIZMO-ASSI · the navigation gizmo's tooltips: an end («Vista
   *  frontale (1)»), the column (zoom, pan, frame all, perspective ⇄ orthographic) */
  gizmo?: { axis: (a: GizmoAxis, view: AlignedView) => string; zoom: string; pan: string; home: string; ortho: string; label: string };
}

/** MICRO-SPAZIO-3D-2 · what the Preferences say of the navigation. */
export interface SceneNavPrefs {
  /** «Emula mouse a 3 tasti»: Alt + left is the middle button */
  emulate3: boolean;
  /** «Emula tastierino»: the top row's digits are the keypad's */
  emulateNumpad: boolean;
  /** «Auto Perspective»: an orbit from an aligned orthographic view goes back to perspective */
  autoPerspective: boolean;
  /** a middle button was seen on this device */
  middleSeen: boolean;
  /** the left drag selects with a box (`leftSelects` of space-nav) */
  leftSelects: boolean;
  /** MICRO-SPAZIO-3D-3 · the left drag pans (the Preferences' «Pan») */
  leftPans?: boolean;
  /** PARTE 0b · «Inverti l'orbita del trackpad»: two fingers orbit against the drag */
  invertTrackpadOrbit?: boolean;
}

/** MICRO-SPAZIO-3D-2 · the camera as the N panel shows it. */
export interface SceneView {
  view: AlignedView | null;
  ortho: boolean;
  /** the lens, in mm on a 36 mm frame (Blender's), from the vertical field */
  lensMm: number;
  fov: number;
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
  /** MICRO-SPAZIO-3D-3 · the sketches selected, and the active one (the gizmo's) */
  setSketchSelection(ids: string[], active: string | null): void;
  /** a sketch as a glb in its OWN frame, and its pose apart (MICRO-SPAZIO-3D-2:
   *  the transform goes into the data), for «Associate with a unit» */
  sketchGlb(id: string): Promise<{ glb: ArrayBuffer; pose: Pose } | null>;
  /** a shape dropped at a page point: the surface under it and its normal */
  surfaceAt(x: number, y: number): { point: V3; normal: V3 } | null;
  /** re-read the overlays (no reload) */
  applyOverlays(): void;
  /** the file each model is drawn from (a LOD chosen, a tileset) */
  drawnUrl(key: string): string | undefined;
  /** s3Dgraphy 1.6.31 · the centre of an object's box in its own frame, in the
   *  data's axes (Blender's, Z up): the default pivot; null when not loaded */
  localCentre(key: string): V3 | null;
  /** the world box of a drawn object (three's axes), null when not drawn */
  boxOf(key: string): [V3, V3] | null;
  /** MICRO-SPAZIO-3D-2 · the view (aligned, orthographic) and the lens */
  view(): SceneView;
  setView(v: AlignedView): void;
  toggleOrtho(): void;
  /** Shift+C: the cursor at the median of what is drawn, the view on most of it */
  centreScene(): boolean;
  /** the modal G / R / S on the selected object (sketch, proxy, model) */
  startModal(mode: ModalMode): boolean;
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
  /** MICRO-GIZMO-ASSI · the sliders of «Geometry» (the proxies' opacity) */
  overlayValue?: (k: OverlayValueKey) => number;
  /** items not selectable (the Outliner's arrow), by key */
  locked?: () => ReadonlySet<string>;
  /** a sketch shown (the Outliner's eye, «Isola») */
  sketchVisible?: (id: string) => boolean;
  /** the epoch's name, for its box */
  epochLabel?: () => string;
  /** a resident file did not come: the caller marks it missing — or, when
   *  the node refused it (401/403), refused. `unanswered`: no HTTP answer at
   *  all (the bridge or the node not listening yet, the desktop's sidecar
   *  still starting) — not a verdict on the file: the caller asks again */
  onNotFound?: (resourceId: string, why: FetchFailure, unanswered?: boolean) => void;
  /** MICRO-3DTILES · the threshold and the tiles' memory (the Preferences) */
  limit?: { bytes: number; points: number };
  tilesMemoryMB?: number;
  /** MICRO-SPAZIO-3D-2 · the navigation's Preferences, read at every press */
  nav?: () => SceneNavPrefs;
  /** the first press of a middle button on this device */
  onMiddleSeen?: () => void;
  /** a box selection: the keys of the objects whose centre falls in it
   *  (`proxy:` `rm:` `sketch:`; Shift: added) */
  onBoxSelect?: (keys: string[], extend: boolean) => void;
  /** MICRO-SPAZIO-3D-3 · a click that picks (`rm:` `proxy:` `sketch:`, null
   *  on nothing), Shift held or not: the caller applies Blender's rule
   *  (`space-selection.ts`). When given, it replaces onPickUnit / onPickRm /
   *  onPickNone / onPickSketch */
  onPick?: (key: string | null, shift: boolean) => void;
  /** a short notice (Shift+C on an empty scene) */
  onNotice?: (text: string) => void;
  /** the view changed (aligned, ortho): the N panel follows */
  onView?: (v: SceneView) => void;
  /** the selected object that G / R / S moves when no sketch is selected
   *  (`proxy:<unit>`, `rm:<id>`), and its transform written on release */
  transformTarget?: () => string | null;
  onTransform?: (key: string, pose: Pose, pivot?: V3 | null) => void;
  /** MICRO-SPAZIO-3D-3 · every selected object G / R / S moves (sketches
   *  too), the active last; on release, ONE call with all their poses */
  transformTargets?: () => string[];
  onTransformMany?: (poses: Array<{ key: string; pose: Pose; pivot?: V3 | null }>) => void;
  /** MICRO-SPAZIO-3D-3 p.12 · what a container's automatic choice shows now */
  onAltState?: (group: string, shown: "tileset" | "models") => void;
  /** MICRO-SPAZIO-3D-3 p.10 · a version of a model in the flow was drawn (the Outliner's dot follows) */
  onVersionDrawn?: (rmId: string, versionId: string) => void;
  /** the flow's words: «Versioni automatiche», and its line (levels · MB) */
  flowTitle?: string;
  /** MICRO-SPAZIO-3D-3 p.14 · a datamodel glyph (2d_glyphs) for a label's decorator */
  glyph?: (kind: string) => HTMLElement;
  /** MICRO-SPAZIO-3D-3 p.9 · a floating panel reduced to its title (the person's, per view) */
  panelFolded?: (key: string) => boolean;
  onPanelFold?: (key: string, folded: boolean) => void;
  /** p.10 · the flow's strip title */
  /** MICRO-SPAZIO-3D-3 p.6 · the fetchable address of a sketch's glb (a kept proxy) */
  sketchFileUrl?: (s: Sketch) => string | undefined;
  /** MICRO-SPAZIO-3D-3 p.5 · «Allinea alla normale» (the N panel; off by default) */
  snapAlign?: () => boolean;
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
/** MICRO-SPAZIO-3D-3 · Blender's outline colours: the active, the other selected */
const SEL_ACTIVE = 0xffaa40;
const SEL_OTHER = 0xf15800;
const selCls = (item: { selected?: boolean; active?: boolean }): string => (item.selected ? (item.active ? " sel act" : " sel") : "");

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
  const ov = (k: OverlayKey): boolean => opts.overlay?.(k) ?? (k !== "s3_proxy_wire" && k !== "s3_axis_z" && k !== "s3_labels_sketch");
  const val = (k: OverlayValueKey, def: number): number => opts.overlayValue?.(k) ?? def;
  /** MICRO-GIZMO-ASSI · the proxies' opacity, filled or in wireframe */
  const proxyOpacity = (): number => (ov("s3_proxy_wire") ? val("s3_opacity_wire", 0.9) : val("s3_opacity_proxy", 0.42));
  // MICRO-SPAZIO-3D · the parts the handle reaches once the engine is up
  let api: Partial<SpaceSceneHandle> = {};
  let cursorAt: V3 = [0, 0, 0];
  let cursorSet = false;
  let sketchSel: string | null = null;
  /** MICRO-SPAZIO-3D-3 · every sketch selected (`sketchSel` is the active one) */
  let sketchSet = new Set<string>();
  // the probes' seam: what the scene holds, and where a unit sits on screen
  const probe = host as unknown as {
    __space?: () => unknown;
    __spaceScreenOf?: (id: string) => { x: number; y: number } | null;
    __spaceCamera?: () => number[];
    /** MICRO-GIZMO-ASSI · the navigation gizmo, the camera's matrices, a camera set */
    __spaceGizmo?: () => unknown;
    __spaceCamMatrix?: () => unknown;
    __spaceSetCam?: (c: CamState) => void;
    __spaceCamState?: () => CamState;
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
    /** MICRO-SPAZIO-3D-3 · what the scene draws as selected, and the active */
    __spaceSelected?: () => { selected: string[]; active: string | null };
  };
  probe.__spaceSelected = () => ({ selected: items.filter((i) => i.selected).map((i) => `${i.kind}:${i.id}`),
    active: items.find((i) => i.active) ? `${items.find((i) => i.active)!.kind}:${items.find((i) => i.active)!.id}` : null });
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
      // MICRO-SPAZIO-3D-2 · two cameras, one view: the perspective, and the
      // orthographic drawn from the same CamState (keypad 5)
      const FOV = 40;
      const persp = new THREE.PerspectiveCamera(FOV, w / h, 0.01, 2000);
      persp.position.set(6, 5, 9);
      let ortho: any = null;
      let camera: any = persp;
      let isOrtho = false;
      /** the orthographic's distance to the pivot, as the perspective's would be */
      let orthoT = 10;
      /** the aligned view the camera is in (keypad 1 3 7), until an orbit */
      let aligned: AlignedView | null = null;
      /** the orthographic was put by an aligned view (Auto Perspective takes it back) */
      let orthoAuto = false;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(4, 8, 6);
      scene.add(key);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      // MICRO-SPAZIO-3D-2 · the mouse is the scene's own, as Blender's
      // (`dragIntent`): the controls keep only the touch gestures and the
      // damping; the zoom is toward the cursor, the right button the menu's
      controls.enableZoom = false;
      controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: null };
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
      // `unanswered`: nothing answered (a network error, no HTTP status) —
      // a parse error or a 404 is an answer
      type Loaded = { root: any } | { fail: FetchFailure; unanswered?: boolean };
      const cache = new Map<string, Promise<Loaded>>();
      const load = (url: string): Promise<Loaded> => {
        let p = cache.get(url);
        if (!p) {
          p = withDraco().then((): Promise<Loaded> => ownedByNode(url)
            // the room's store: the bytes through the signed road, then parsed
            ? nodeBytes(url).then(
                (buf) => new Promise<Loaded>((res) => loader.parse(buf, "",
                  (g: any) => res({ root: g.scene }), () => res({ fail: "missing" }))),
                (e) => ({ fail: e instanceof RoadError ? e.why : "missing", unanswered: e instanceof RoadError && e.status === 0 }))
            : new Promise<Loaded>((res) => loader.load(url, (g: any) => res({ root: g.scene }), undefined,
                // three's FileLoader: an HTTP error carries its response, a
                // refused connection is the fetch's own TypeError
                (e: any) => res({ fail: "missing", unanswered: !e?.response && e instanceof TypeError && /fetch|load failed|network/i.test(String(e?.message)) }))));
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
      /** MICRO-SPAZIO-3D-2 · the top object of each item drawn (`rm:` / `proxy:`),
       *  where its transform is applied, over the file as it is */
      const roots = new Map<string, any>();

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
        // MICRO-SPAZIO-3D-3 p.9 · a triangle, as «Forme base»: reduced, the strip
        // keeps its title and the tileset's line (level and MB)
        const key = `strip:${item.id}`;
        const tw = document.createElement("button");
        tw.type = "button";
        tw.className = "scn-fold";
        tw.dataset.fold = key;
        const set = (c: boolean) => { el.classList.toggle("folded", c); tw.textContent = c ? "▸" : "▾"; tw.setAttribute("aria-expanded", String(!c)); };
        set(!!opts.panelFolded?.(key));
        tw.addEventListener("click", (e) => { e.stopPropagation(); const c = !el.classList.contains("folded"); set(c); opts.onPanelFold?.(key, c); });
        const b = document.createElement("b");
        b.textContent = item.label;
        el.append(tw, b);
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
      const addLabel = (text: string, at: any, cls: string, id?: string, decor?: SceneItem["decor"]) => {
        const el = document.createElement("span");
        el.className = `v3d-label scn-label ${cls}`;
        el.textContent = text;
        if (id) el.dataset.id = id;
        // MICRO-SPAZIO-3D-3 p.14 · the graph's glyphs beside the name, small
        for (const d of decor ?? []) {
          const g = document.createElement("span");
          g.className = `scn-dec dec-${d.group}${d.inherited ? " inh" : ""}`;
          g.title = d.title;
          if (d.kind && opts.glyph) { try { g.appendChild(opts.glyph(d.kind)); } catch { g.textContent = d.text ?? ""; } }
          else g.textContent = d.text ?? "";
          el.appendChild(g);
        }
        const more = document.createElement("span");
        more.className = "scn-more";
        el.appendChild(more);
        labels.appendChild(el);
        anchors.push({ el, p: at.clone() });
      };
      const translucent = (item: SceneItem) => {
        const c = new THREE.Color();
        const [r, g, b] = item.rgb ?? [0.328, 0.033, 0.033];
        c.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
        // MICRO-SPAZIO-3D · «in fil di ferro»: the overlay draws the proxies as wire
        const wire = ov("s3_proxy_wire");
        return new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: proxyOpacity(),
          depthWrite: false, wireframe: wire });
      };
      const selOutline = (item: SceneItem) => item.selected && ov("s3_sel_outline");
      // MICRO-SPAZIO-3D-3 · Blender's theme: the active object's outline light
      // (#FFAA40), the other selected ones a darker orange (#F15800)
      const selColour = (item: SceneItem): number => (item.active ? SEL_ACTIVE : SEL_OTHER);
      const outline = (geom: any, item: SceneItem, at?: any) => {
        const col = selOutline(item) ? selColour(item) : new THREE.Color(item.edge ?? "#555555");
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
      const selBox = (obj: any, item: SceneItem) => {
        const hb = new THREE.Box3Helper(new THREE.Box3().setFromObject(obj), selColour(item));
        hb.userData.helper = true;
        return hb;
      };

      // ── the camera: Blender's navigation (space-nav.ts) ─────────────────
      const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
      const arr = (v: any): V3 => [v.x, v.y, v.z];
      const camState = (): CamState => {
        if (!isOrtho) return { pos: arr(camera.position), target: arr(controls.target) };
        // the orthographic as the perspective it stands for: same direction,
        // the pivot `orthoT` away
        const dir = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
        return { pos: arr(controls.target.clone().addScaledVector(dir, -orthoT)), target: arr(controls.target) };
      };
      const orthoFrustum = () => {
        if (!ortho) return;
        const half = orthoHalf({ pos: [0, 0, orthoT], target: [0, 0, 0] }, FOV);
        const a = persp.aspect || 1;
        ortho.left = -half * a; ortho.right = half * a; ortho.top = half; ortho.bottom = -half;
        ortho.zoom = 1;
      };
      /** the orthographic camera put back behind everything along its view, so
       *  the near plane never cuts the podium */
      const placeOrtho = (c: CamState) => {
        const T = v3(c.target);
        const dir = new THREE.Vector3().subVectors(T, v3(c.pos)).normalize();
        orthoT = Math.max(1e-4, v3(c.pos).distanceTo(T));
        const b = extent();
        const sp = span();
        const R = sp * 2 + orthoT + b.distanceToPoint(T) + 1;
        camera.position.copy(T).addScaledVector(dir, -R);
        controls.target.copy(T);
        camera.near = Math.max(1e-3, R * 1e-6);
        camera.far = R + sp * 4 + b.distanceToPoint(T) + 10;
        orthoFrustum();
        camera.lookAt(T);
        camera.updateProjectionMatrix();
      };
      /** a world length per screen pixel at `p` (the pivot when none) */
      const pxWorld = (p?: any): number => {
        const H = Math.max(1, renderer.domElement.clientHeight);
        if (isOrtho) return (2 * orthoHalf({ pos: [0, 0, orthoT], target: [0, 0, 0] }, FOV)) / H;
        const dist = camera.position.distanceTo(p ?? controls.target);
        return (2 * dist * Math.tan((FOV * Math.PI) / 360)) / H;
      };
      const viewNow = (): SceneView => ({ view: aligned, ortho: isOrtho, fov: FOV,
        lensMm: Math.round((12 / Math.tan((FOV * Math.PI) / 360)) * 10) / 10 });
      const viewEl = document.createElement("div");
      viewEl.className = "scn-view";
      const showView = () => {
        viewEl.textContent = opts.texts.viewName?.(aligned, isOrtho) ?? "";
        host.dataset.view = `${aligned ?? "user"}:${isOrtho ? "ortho" : "persp"}`;
        opts.onView?.(viewNow());
      };
      const updateClip = () => {
        if (isOrtho) return;
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
        if (isOrtho) { placeOrtho(c); controls.update(); return; }
        camera.position.copy(v3(c.pos));
        controls.target.copy(v3(c.target));
        camera.lookAt(controls.target);
        updateClip();
        controls.update();
      };
      /** keypad 5: the same view, the other projection */
      const setOrtho = (on: boolean) => {
        if (on === isOrtho) return;
        const c = camState();
        if (on) {
          ortho ??= new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 2000);
          camera = ortho;
        } else camera = persp;
        isOrtho = on;
        controls.object = camera;
        if (gizmo) gizmo.camera = camera;
        for (const l of layers.values()) l.layer.setCamera(camera);
        applyCam(c);
        showView();
      };
      /** MICRO-GIZMO-ASSI · the passage to an aligned view, about 200 ms as
       *  Blender's «Smooth View» (none with the system's «Reduce motion»): it
       *  ends on the very camera the keypad gives, and a gesture ends it at once */
      const VIEW_MS = 200;
      let anim: { from: CamState; to: CamState; t0: number; view: AlignedView } | null = null;
      const reduceMotion = (): boolean => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
      const finishAnim = () => {
        if (!anim) return;
        const a = anim;
        anim = null;
        applyCam(a.to);
        aligned = a.view;
        showView();
      };
      const stepAnim = (now: number) => {
        if (!anim) return;
        const t = (now - anim.t0) / VIEW_MS;
        if (t >= 1) { finishAnim(); return; }
        applyCam(viewBetween(anim.from, anim.to, t));
      };
      /** keypad 1 3 7 (Ctrl: the opposite) and the gizmo's ends: Blender's six
       *  views, around the pivot — ONE function for both */
      const setAligned = (v: AlignedView) => {
        finishAnim();
        // Auto Perspective: an aligned view is orthographic, and its
        // orthographic is the view's (an orbit takes it back)
        if (getNav().autoPerspective) { if (!isOrtho) setOrtho(true); orthoAuto = true; }
        const from = camState();
        const to = alignedView(from, v);
        if (reduceMotion()) { applyCam(to); aligned = v; showView(); return; }
        anim = { from, to, t0: performance.now(), view: v };
      };
      /** an orbit leaves the aligned view; with Auto Perspective, the
       *  orthographic it had put goes with it */
      const leaveAligned = () => {
        if (!aligned) return;
        aligned = null;
        if (isOrtho && orthoAuto && getNav().autoPerspective) { orthoAuto = false; setOrtho(false); }
        showView();
      };
      const getNav = (): SceneNavPrefs => opts.nav?.() ?? { emulate3: false, emulateNumpad: false, autoPerspective: true, middleSeen: false, leftSelects: false };
      frameIt = () => {
        const b = extent();
        const c = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());
        const sp = Math.max(s.x, s.y, s.z) || 1;
        if (aligned || isOrtho) {
          // MICRO-SPAZIO-3D-2 · an aligned or orthographic view keeps its direction
          const keep = framed;
          applyCam(frameSphere(camState(), arr(c), b.getBoundingSphere(new THREE.Sphere()).radius, FOV, persp.aspect));
          framed = keep || framed;
          return;
        }
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
        zoomToward(p, factor);
      };
      /** MICRO-SPAZIO-3D-2 · in orthographic the scale changes, not the place */
      const zoomToward = (p: V3, factor: number) => {
        finishAnim();
        applyCam(isOrtho ? orthoZoom(camState(), p, factor) : zoomTowards(camState(), p, factor));
      };
      const orbitBy = (dx: number, dy: number) => {
        finishAnim();
        leaveAligned();
        const off = new THREE.Vector3().subVectors(camera.position, controls.target);
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.theta -= dx * 0.005;
        sph.phi = Math.min(Math.PI - 0.01, Math.max(0.01, sph.phi - dy * 0.005));
        off.setFromSpherical(sph);
        camera.position.copy(controls.target).add(off);
        camera.lookAt(controls.target);
        controls.update();
      };
      /** MICRO-SPAZIO-3D-3 p.3 · the pan grabs the scene (`grabPan`): the
       *  point grabbed — the surface under the pointer, else the orbit centre's
       *  depth — stays under the pointer */
      const panBy = (dx: number, dy: number, grab?: V3 | null) => {
        finishAnim();
        const H = Math.max(1, renderer.domElement.clientHeight);
        const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
        const depth = grab ? v3(grab).sub(camera.position).dot(fwd) : camera.position.distanceTo(controls.target);
        const unit = isOrtho ? (2 * orthoHalf({ pos: [0, 0, orthoT], target: [0, 0, 0] }, FOV)) / H : (2 * Math.tan((FOV * Math.PI) / 360)) / H;
        const [r, u] = grabPan(dx, dy, depth > 1e-6 ? depth : camera.position.distanceTo(controls.target), unit, isOrtho);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        const d = right.multiplyScalar(r).add(up.multiplyScalar(u));
        camera.position.add(d);
        controls.target.add(d);
        controls.update();
      };
      // ── MICRO-GIZMO-ASSI · the navigation gizmo, top right, as Blender's ──
      // A 2D canvas over the scene (never in its raycast): the six ends of the
      // data's axes as the camera sees them, the nearest in front; full balls
      // with their letter for +X +Y +Z, hollow paler ones for the negatives. A
      // click looks along the axis (the keypad's views, `setAligned`), again on
      // the aligned one the opposite; a drag orbits about the orbit centre.
      // Under it the column: zoom (drag up and down), pan (drag), frame all
      // (Home: there is no camera object here), perspective ⇄ orthographic (5).
      // Each end is a button too: Tab reaches it, Enter chooses, the tooltip
      // names the view and its key.
      const NAV_R = 34, BALL = 10, NAV_PAD = 6;
      const NAV_SIZE = 2 * (NAV_R + BALL + NAV_PAD);
      const NAV_COL: Record<"x" | "y" | "z", string> = { x: "#ff3352", y: "#8bdc00", z: "#2890ff" };   // Blender's theme
      const navEl = document.createElement("div");
      navEl.className = "scn-nav";
      navEl.setAttribute("role", "group");
      navEl.setAttribute("aria-label", opts.texts.gizmo?.label ?? "Navigation");
      const navBox = document.createElement("div");
      navBox.className = "scn-nav-box";
      navBox.style.width = navBox.style.height = `${NAV_SIZE}px`;
      // an SVG, not a 2D canvas: measured on Templu Mare, a canvas's strokes
      // after the WebGL frame cost 1.9 ms each drawing (the GPU's sync), the
      // same figure in SVG attributes 0.1 ms
      const SVGNS = "http://www.w3.org/2000/svg";
      const navSvg = document.createElementNS(SVGNS, "svg");
      navSvg.setAttribute("class", "scn-nav-cv");
      navSvg.setAttribute("width", String(NAV_SIZE));
      navSvg.setAttribute("height", String(NAV_SIZE));
      navSvg.setAttribute("aria-hidden", "true");
      const navHalo = document.createElementNS(SVGNS, "circle");
      navHalo.setAttribute("cx", String(NAV_SIZE / 2)); navHalo.setAttribute("cy", String(NAV_SIZE / 2));
      navHalo.setAttribute("r", String(NAV_R + BALL + 2));
      navHalo.setAttribute("class", "scn-nav-halo");
      navSvg.appendChild(navHalo);
      const navParts = new Map<GizmoAxis, { g: SVGGElement; line: SVGLineElement | null }>();
      for (const a of GIZMO_AXES) {
        const pos = !a.startsWith("-");
        const col = NAV_COL[a.replace("-", "") as "x" | "y" | "z"];
        const g = document.createElementNS(SVGNS, "g");
        let line: SVGLineElement | null = null;
        if (pos) {
          line = document.createElementNS(SVGNS, "line");
          line.setAttribute("x2", String(NAV_SIZE / 2)); line.setAttribute("y2", String(NAV_SIZE / 2));
          line.setAttribute("stroke", col); line.setAttribute("stroke-width", "2");
          g.appendChild(line);
        }
        // in the group's frame the ball sits at the centre; the group moves
        const ball = document.createElementNS(SVGNS, "circle");
        ball.setAttribute("cx", String(NAV_SIZE / 2)); ball.setAttribute("cy", String(NAV_SIZE / 2));
        ball.setAttribute("r", String(pos ? BALL : BALL - 1));
        ball.setAttribute("fill", col);
        if (!pos) { ball.setAttribute("fill-opacity", "0.35"); ball.setAttribute("stroke", col); ball.setAttribute("stroke-width", "1.5"); }
        g.appendChild(ball);
        if (pos) {
          const tx = document.createElementNS(SVGNS, "text");
          tx.textContent = a.toUpperCase();
          tx.setAttribute("class", "scn-nav-letter");
          tx.setAttribute("x", String(NAV_SIZE / 2)); tx.setAttribute("y", String(NAV_SIZE / 2));
          g.appendChild(tx);
        }
        navParts.set(a, { g, line });
        navSvg.appendChild(g);
      }
      navBox.appendChild(navSvg);
      const balls = new Map<GizmoAxis, HTMLButtonElement>();
      for (const a of GIZMO_AXES) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `scn-nav-ball ${a.startsWith("-") ? "neg" : "pos"}`;
        b.dataset.axis = a;
        b.style.width = b.style.height = `${2 * BALL}px`;
        // a click of the pointer is read on release (a drag orbits); the
        // keyboard's (detail 0) here
        b.addEventListener("click", (e) => { if (e.detail === 0) setAligned(gizmoView(a, aligned)); });
        balls.set(a, b);
        navBox.appendChild(b);
      }
      const navCol = document.createElement("div");
      navCol.className = "scn-nav-col";
      const ICON: Record<string, string> = {
        zoom: '<svg viewBox="0 0 16 16" width="15" height="15"><circle cx="6.5" cy="6.5" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.6 9.6 14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        pan: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M5 8V3.5a1 1 0 0 1 2 0V7m0-4.5v-.2a1 1 0 0 1 2 0V7m0-4a1 1 0 0 1 2 0V7.5m0-2.5a1 1 0 0 1 2 0V10c0 2.6-1.9 4.5-4.5 4.5S4.3 13 3.4 11.4L2.2 9.2a1 1 0 0 1 1.7-1L5 9.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
        home: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5.5" y="5.5" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
        ortho: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M2 2h12v12H2zM6 2v12M10 2v12M2 6h12M2 10h12" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
        persp: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M4 3h8l3 11H1zM6.6 3 5.6 14M9.4 3l1 11M3 7.5h10M2 11h12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
      };
      const colBtn = (act: string, title: string): HTMLButtonElement => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "scn-nav-btn";
        b.dataset.nav = act;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.innerHTML = ICON[act];
        navCol.appendChild(b);
        return b;
      };
      const zoomBtn = colBtn("zoom", opts.texts.gizmo?.zoom ?? "Zoom (drag)");
      const panBtn = colBtn("pan", opts.texts.gizmo?.pan ?? "Pan (drag)");
      const homeBtn = colBtn("home", opts.texts.gizmo?.home ?? "Frame all (Home)");
      const orthoBtn = colBtn("ortho", opts.texts.gizmo?.ortho ?? "Perspective / Orthographic (5)");
      navEl.append(navBox, navCol);
      homeBtn.addEventListener("click", () => frameIt?.());
      orthoBtn.addEventListener("click", () => { finishAnim(); orthoAuto = false; setOrtho(!isOrtho); });
      /** a press on the gizmo or on a button of the column, followed to its release */
      const navDrag = (el: HTMLElement, onMove: (dx: number, dy: number) => void, onClick?: (x: number, y: number) => void) => {
        el.addEventListener("pointerdown", (e: PointerEvent) => {
          if (e.button !== 0 && e.button !== 1) return;
          e.preventDefault();
          e.stopPropagation();
          el.setPointerCapture?.(e.pointerId);
          let lx = e.clientX, ly = e.clientY, moved = false;
          const x0 = e.clientX, y0 = e.clientY;
          const mv = (ev: PointerEvent) => {
            if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) <= DRAG_PX) return;
            moved = true;
            onMove(ev.clientX - lx, ev.clientY - ly);
            lx = ev.clientX; ly = ev.clientY;
          };
          const up = (ev: PointerEvent) => {
            el.removeEventListener("pointermove", mv);
            el.removeEventListener("pointerup", up);
            el.removeEventListener("pointercancel", up);
            el.releasePointerCapture?.(e.pointerId);
            if (!moved && ev.type === "pointerup") onClick?.(ev.clientX, ev.clientY);
          };
          el.addEventListener("pointermove", mv);
          el.addEventListener("pointerup", up);
          el.addEventListener("pointercancel", up);
        });
      };
      let navLayout: ReturnType<typeof gizmoLayout> = [];
      navDrag(navBox, (dx, dy) => orbitBy(dx, dy), (x, y) => {
        const r = navBox.getBoundingClientRect();
        const a = gizmoHit(navLayout, x - r.left - NAV_SIZE / 2, y - r.top - NAV_SIZE / 2, BALL + 1);
        if (a) setAligned(gizmoView(a, anim ? anim.view : aligned));
      });
      // the lens: up is nearer, as the Ctrl + middle drag
      navDrag(zoomBtn, (_dx, dy) => zoomToward(arr(controls.target), dragZoomFactor(dy)));
      navDrag(panBtn, (dx, dy) => panBy(dx, dy));
      let navHover = false;
      navBox.addEventListener("pointerenter", () => { navHover = true; navKey = ""; });
      navBox.addEventListener("pointerleave", () => { navHover = false; navKey = ""; });
      let navKey = "";
      let navTipsFor: AlignedView | null | undefined = undefined;
      /** what one drawing of the gizmo costs (ms), measured at every frame it is drawn */
      const navCost = { n: 0, sum: 0, max: 0, last: 0 };
      const drawNav = () => {
        const on = ov("s3_navgizmo");
        navEl.style.display = on ? "" : "none";
        if (!on) return;
        const t0 = performance.now();
        const st = camState();
        const key = `${st.pos.map((v) => v.toFixed(5))}|${st.target.map((v) => v.toFixed(5))}|${isOrtho}|${navHover}`;
        if (key === navKey) return;
        navKey = key;
        const icon = isOrtho ? "persp" : "ortho";
        if (orthoBtn.dataset.icon !== icon) { orthoBtn.dataset.icon = icon; orthoBtn.innerHTML = ICON[icon]; }
        navLayout = gizmoLayout(st, NAV_R);
        navHalo.style.display = navHover ? "" : "none";
        const c = NAV_SIZE / 2;
        const order = navLayout.map((e) => e.axis).join();
        const reorder = navSvg.dataset.order !== order;
        if (reorder) navSvg.dataset.order = order;
        navLayout.forEach((e, i) => {
          const dx = Math.round(e.x * 10) / 10, dy = Math.round(e.y * 10) / 10;
          const x = c + dx, y = c + dy;
          const part = navParts.get(e.axis)!;
          // the nearest drawn last, in front
          if (reorder) navSvg.appendChild(part.g);
          part.g.setAttribute("transform", `translate(${dx} ${dy})`);
          // the arm, from the gizmo's centre (in the group's frame, −d from the ball)
          if (part.line) { part.line.setAttribute("x1", String(c - dx)); part.line.setAttribute("y1", String(c - dy)); }
          const b = balls.get(e.axis)!;
          // the DOM only where it changed: a write per frame per ball costs more than the drawing
          const at = `${Math.round(x - BALL)},${Math.round(y - BALL)},${i + 1}`;
          if (b.dataset.at !== at) {
            b.dataset.at = at;
            b.style.left = `${Math.round(x - BALL)}px`;
            b.style.top = `${Math.round(y - BALL)}px`;
            b.style.zIndex = String(i + 1);
          }
        });
        if (navTipsFor !== aligned) {
          navTipsFor = aligned;
          for (const [a, b] of balls) {
            const tip = opts.texts.gizmo?.axis(a, gizmoView(a, aligned)) ?? a;
            b.title = tip; b.setAttribute("aria-label", tip);
          }
        }
        const dt = performance.now() - t0;
        navCost.n++; navCost.sum += dt; navCost.last = dt; if (dt > navCost.max) navCost.max = dt;
      };
      probe.__spaceGizmo = () => ({ shown: navEl.style.display !== "none", aligned, animating: !!anim,
        balls: navLayout.map((e) => { const r = balls.get(e.axis)!.getBoundingClientRect(); return { axis: e.axis, x: r.left + r.width / 2, y: r.top + r.height / 2, depth: Math.round(e.depth * 1000) / 1000 }; }),
        cost: { n: navCost.n, avg: navCost.n ? navCost.sum / navCost.n : 0, max: navCost.max, last: navCost.last } });
      probe.__spaceCamMatrix = () => { camera.updateMatrixWorld(true); return { ortho: isOrtho, view: aligned, world: [...camera.matrixWorld.elements], proj: [...camera.projectionMatrix.elements] }; };
      probe.__spaceSetCam = (c: CamState) => { finishAnim(); if (isOrtho) { orthoAuto = false; setOrtho(false); } applyCam(c); if (aligned) { aligned = null; showView(); } };
      probe.__spaceCamState = () => camState();

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
        applyCam(frameSphere(camState(), arr(sphere.center), sphere.radius, FOV, persp.aspect));
      };

      // ── the sketches ─────────────────────────────────────────────────────
      const sketchMeshes = new Map<string, any>();
      const sketchMaterial = () => new THREE.MeshLambertMaterial({ color: new THREE.Color("#d9822b"), transparent: true,
        opacity: ov("s3_proxy_wire") ? val("s3_opacity_wire", 0.9) : 0.55, depthWrite: false, wireframe: ov("s3_proxy_wire") });
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
          const fileUrl = s.shape === "file" && s.file ? (opts.sketchFileUrl ? opts.sketchFileUrl(s) : s.file.url) : undefined;
          // a glb whose address is not known yet (the bridge not answered): next time
          if (!m && s.shape === "file" && !fileUrl) continue;
          if (!m && s.shape === "file" && s.file && fileUrl) {
            // MICRO-SPAZIO-3D-3 p.6 · a glb kept as a sketch (a unit's proxy
            // before «Sostituisci»): its meshes, painted as a sketch
            const g = new THREE.Group();
            g.userData.sketchId = s.id;
            g.userData.fileSketch = true;
            sketchGroup.add(g);
            sketchMeshes.set(s.id, g);
            void load(fileUrl).then((got) => {
              if (disposed || sketchMeshes.get(s.id) !== g || "fail" in got) return;
              const obj = got.root.clone(true);
              obj.traverse((o: any) => { if (o.isMesh) { o.material = sketchMaterial(); o.userData.sketchId = s.id;
                const ed = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 20), new THREE.LineBasicMaterial({ color: 0x7a3d00 }));
                ed.userData.edges = true; o.add(ed); } });
              g.add(obj);
              syncSketches();
            });
            m = g;
          }
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
          if (!(modal && modal.targets.some((t) => t.id === `sketch:${s.id}`))) setPose(m, { position: s.position, rotation: s.rotation, scale: s.scale });
          m.visible = opts.sketchVisible?.(s.id) ?? true;
          const sel = sketchSet.has(s.id) || s.id === sketchSel;
          const edgeCol = sel && ov("s3_sel_outline") ? (s.id === sketchSel ? SEL_ACTIVE : SEL_OTHER) : 0x7a3d00;
          if (m.userData.fileSketch) {
            m.traverse((o: any) => { if (o.userData.edges) o.material.color.set(edgeCol); });
            continue;
          }
          m.material.dispose();
          m.material = sketchMaterial();
          for (const c of m.children) if (c.userData.edges) c.material.color.set(edgeCol);
        }
        if (sketchSel && !want.has(sketchSel)) sketchSel = null;
        for (const id of [...sketchSet]) if (!want.has(id)) sketchSet.delete(id);
        attachGizmo();
      };
      probe.__spaceSketches = () => listSketches().map((s: Sketch) => ({ ...s, selected: s.id === sketchSel || sketchSet.has(s.id), active: s.id === sketchSel }));

      // ── the decorators: grid and axes, the epoch's box ───────────────────
      const buildDecor = () => {
        decor.clear();
        const b = extent();
        const c = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());
        const sp = Math.max(s.x, s.z, 1);
        // a grid of whole metres under the content, ten lines per side at least
        const step = Math.pow(10, Math.floor(Math.log10(sp / 10)));
        const n = Math.ceil((sp * 1.4) / step);
        if (ov("s3_grid")) {
          const grid = new THREE.GridHelper(n * step, n, 0x8a8a8a, 0xb8b8b8);
          grid.position.set(c.x, b.min.y, c.z);
          grid.material.transparent = true;
          grid.material.opacity = 0.55;
          grid.userData.helper = true;
          decor.add(grid);
        }
        // the axes through the grid's centre, as Blender's floor: X red, Y
        // (Blender's, three's −z) green, Z (three's y) blue. MICRO-GIZMO-ASSI ·
        // three switches of their own, as Blender's (X and Y on, Z off)
        const L = (n * step) / 2;
        const axis = (k: OverlayKey, a: number[], z: number[], col: number) => {
          if (!ov(k)) return;
          const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(z[0], z[1], z[2])]);
          const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col }));
          line.userData.axis = k;
          decor.add(line);
        };
        axis("s3_axis_x", [c.x - L, b.min.y, c.z], [c.x + L, b.min.y, c.z], 0xd04040);
        axis("s3_axis_y", [c.x, b.min.y, c.z + L], [c.x, b.min.y, c.z - L], 0x40a040);
        axis("s3_axis_z", [c.x, b.min.y - L, c.z], [c.x, b.min.y + L, c.z], 0x4060d0);
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
        roots.clear();
        drawn.clear();
        // the flow keeps what each model drew (a rebuild starts from it), only for the items still in auto
        for (const k of [...flowState.keys()]) if (!items.some((i) => `${i.kind}:${i.id}` === k && i.flow?.length)) flowState.delete(k);
        strips.textContent = "";
        strips.appendChild(flowStrip);
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
              // the tileset's pose is its tileset.json's (root.transform): the
              // data's transform is not applied over it, and G / R / S leave it
              roots.set(key, live.layer.object);
              el.appendChild(live.bar.el);
              live.bar.refresh();
              await live.ready;
              if (gen !== generation || disposed) return;
              const bb = live.layer.bounds();
              if (bb) addLabel(item.label, new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2), `rm k-rm${selCls(item)}`, item.id);
              drawn.set(key, { item, as: "tiles", url: tsUrl });
            }));
            continue;
          }
          if (item.state === "resident" && item.kind === "rm" && item.flow?.length) {
            // MICRO-SPAZIO-3D-3 p.10 · a flow of LOD: the version drawn before
            // (a rebuild keeps it), else the lightest
            drawn.set(key, { item, as: "pending" });
            pending.push((async () => {
              const prev = flowState.get(key)?.current;
              const v = item.flow!.find((x) => x.id === prev) ?? item.flow!.find((x) => x.id === item.flowStart) ?? item.flow![item.flow!.length - 1];
              const got = await load(v.url);
              if (gen !== generation || disposed) return;
              if ("fail" in got) {
                drawn.set(key, { item: failed(item, got.fail), as: "label" });
                later.push(failed(item, got.fail));
                return;
              }
              const obj = got.root.clone(true);
              if (item.pose) setPose(obj, item.pose);
              roots.set(key, obj);
              if (selOutline(item)) content.add(selBox(obj, item));
              tag(obj, item);
              content.add(obj);
              addLabel(item.label, topOf(obj), `rm k-rm${selCls(item)}`, item.id);
              drawn.set(key, { item, as: "mesh", url: v.url });
              flowState.set(key, { item, current: v.id, gen });
              flowBytes.set(v.url, v.bytes ?? 0);
            })());
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
                if (item.resourceId) opts.onNotFound?.(item.resourceId, got.fail, got.unanswered);
                return;
              }
              const obj = got.root.clone(true);
              // MICRO-SPAZIO-3D-2 · the model's transform, over the glb as it is
              if (item.pose) setPose(obj, item.pose);
              roots.set(key, obj);
              if (selOutline(item)) content.add(selBox(obj, item));
              tag(obj, item);
              content.add(obj);
              addLabel(item.label, topOf(obj), `rm k-rm${selCls(item)}`, item.id);
              drawn.set(key, { item, as: "mesh", url: u });
              // MICRO-SPAZIO-3D-3 p.10 · the version drawn is known now: the Outliner's dot follows
              opts.onVersionDrawn?.(item.id, "");
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
                if (item.resourceId) opts.onNotFound?.(item.resourceId, got.fail, got.unanswered);
                return;
              }
              const obj = got.root.clone(true);
              if (item.pose) setPose(obj, item.pose);
              roots.set(`${item.kind}:${item.id}`, obj);
              if (item.kind === "proxy") {
                obj.traverse((o: any) => { if (o.isMesh) o.material = translucent(item); });
                obj.traverse((o: any) => { if (o.isMesh) o.add(outline(o.geometry, item)); });
              } else if (selOutline(item)) {
                content.add(selBox(obj, item));
              }
              tag(obj, item);
              content.add(obj);
              for (const part of item.kind === "proxy" ? item.parts ?? [] : []) {
                pending.push(load(part.url).then((pg) => {
                  if (gen !== generation || disposed || "fail" in pg) return;
                  const po = pg.root.clone(true);
                  if (part.pose) setPose(po, part.pose);
                  po.traverse((o: any) => { if (o.isMesh) { o.material = translucent(item); o.add(outline(o.geometry, item)); } });
                  tag(po, item);
                  content.add(po);
                }));
              }
              if (item.kind === "proxy") unitCentres.set(item.id, centreOf(obj));
              addLabel(item.label, topOf(obj), `${item.kind === "proxy" ? "u k-proxy" : "rm k-rm"}${selCls(item)}`, item.id, item.decor);
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
            if (item.pose) setPose(group, item.pose);
            roots.set(`${item.kind}:${item.id}`, group);
            tag(group, item);
            content.add(group);
            unitCentres.set(item.id, centreOf(group));
            addLabel(item.label, topOf(group), `u k-proxy${selCls(item)}`, item.id, item.decor);
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
                new THREE.Vector3(box.max.x, box.max.y + 0.15 * k, box.max.z), `ref k-${item.kind}`, item.id);
              drawn.set(key, { item, as: "contour" });
            } else {
              const at = b.getCenter(new THREE.Vector3());
              at.y = b.max.y + 0.2 + 0.25 * k++;
              // MICRO-3DTILES · held back by the threshold: its label says so
              const gated = drawn.get(key)?.as === "gated";
              const refused = item.state === "refused";
              addLabel(gated ? item.label : refused ? opts.texts.refused(item.label) : opts.texts.missing(item.label), at,
                `${gated ? "miss gated" : refused ? "miss refused" : "miss"} k-${item.kind}`, item.id);
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

      let labelsShown = 0, labelsHidden = 0;
      (probe as Record<string, unknown>).__spaceLabels = () => ({ shown: labelsShown, hidden: labelsHidden,
        texts: [...labels.querySelectorAll<HTMLElement>(".scn-label")].filter((e) => e.style.display !== "none").map((e) => e.textContent) });
      // MICRO-GIZMO-ASSI · the sketches' labels (their name, over their box),
      // an overlay of their own; kept across rebuilds, as the sketches
      const sketchLabels = new Map<string, { el: HTMLElement; p: any }>();
      const sketchAnchors = (): Array<{ el: HTMLElement; p: any }> => {
        const on = ov("s3_labels_sketch") && sketchGroup.visible;
        const names = on ? new Map(listSketches().map((s: Sketch) => [s.id, s.name])) : new Map<string, string>();
        for (const [id, a] of sketchLabels) if (!names.has(id) || !sketchMeshes.get(id)?.visible) { a.el.remove(); sketchLabels.delete(id); }
        if (!on) return [];
        for (const [id, name] of names) {
          const m = sketchMeshes.get(id);
          if (!m?.visible) continue;
          let a = sketchLabels.get(id);
          if (!a) {
            const el = document.createElement("span");
            el.className = "v3d-label scn-label sk k-sketch";
            el.dataset.id = id;
            const more = document.createElement("span");
            more.className = "scn-more";
            el.append(document.createTextNode(name), more);
            labels.appendChild(el);
            a = { el, p: new THREE.Vector3() };
            sketchLabels.set(id, a);
          } else if (a.el.firstChild && a.el.firstChild.textContent !== name) a.el.firstChild.textContent = name;
          if (a.el.parentNode !== labels) labels.appendChild(a.el);   // a rebuild empties the layer
          const bb = new THREE.Box3().setFromObject(m);
          if (!bb.isEmpty()) a.p.set((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2);
          const sel = sketchSet.has(id) || id === sketchSel;
          a.el.classList.toggle("sel", sel);
          a.el.classList.toggle("act", id === sketchSel);
        }
        return [...sketchLabels.values()];
      };
      const place = () => {
        const W = renderer.domElement.clientWidth || w, H = renderer.domElement.clientHeight || h;
        // MICRO-GIZMO-ASSI · three switches: the models' labels, the proxies', the sketches'
        const kinds = { rm: ov("s3_labels_rm"), proxy: ov("s3_labels_proxy") };
        const skA = sketchAnchors();
        const anyLabel = kinds.rm || kinds.proxy || skA.length > 0;
        labels.style.display = anyLabel ? "" : "none";
        if (anyLabel) {
          const DEC: Array<[string, OverlayKey]> = [["rights", "s3_dec_rights"], ["pd", "s3_dec_pd"], ["warning", "s3_dec_warning"], ["epoch", "s3_dec_epoch"]];
          for (const [k, o] of DEC) labels.classList.toggle(`no-dec-${k}`, !ov(o));
          // MICRO-SPAZIO-3D-3 p.14 · labels that would cover each other: the
          // nearest (the selected first) is shown, with «+N» for the others
          // under it; the others come back as the view gets nearer
          const vis: Array<{ a: typeof anchors[number]; x: number; y: number; z: number; w: number; h: number; pri: number }> = [];
          for (const a of [...anchors, ...skA]) {
            const kd = a.el.classList.contains("k-proxy") ? "proxy" : a.el.classList.contains("k-sketch") ? "sketch" : "rm";
            if (kd !== "sketch" && !kinds[kd]) { a.el.style.display = "none"; continue; }
            const v = a.p.clone().project(camera);
            if (!(v.z < 1)) { a.el.style.display = "none"; continue; }
            const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H;
            a.el.style.left = `${x}px`;
            a.el.style.top = `${y}px`;
            if (!a.el.dataset.w) { a.el.style.display = ""; a.el.dataset.w = String(a.el.offsetWidth || 40); a.el.dataset.h = String(a.el.offsetHeight || 16); }
            vis.push({ a, x, y, z: v.z, w: Number(a.el.dataset.w), h: Number(a.el.dataset.h), pri: a.el.classList.contains("sel") ? 0 : 1 });
          }
          vis.sort((p1, p2) => p1.pri - p2.pri || p1.z - p2.z);
          const shown: Array<{ x0: number; y0: number; x1: number; y1: number; more: number; el: HTMLElement }> = [];
          for (const q of vis) {
            // the label sits centred above its point (translate(-50%, -140%))
            const r = { x0: q.x - q.w / 2, y0: q.y - 1.4 * q.h, x1: q.x + q.w / 2, y1: q.y - 0.4 * q.h };
            const hit = shown.find((s) => r.x0 < s.x1 && r.x1 > s.x0 && r.y0 < s.y1 && r.y1 > s.y0);
            if (hit && q.pri > 0) { hit.more++; q.a.el.style.display = "none"; continue; }
            q.a.el.style.display = "";
            shown.push({ ...r, more: 0, el: q.a.el });
          }
          for (const s of shown) {
            const m = s.el.querySelector<HTMLElement>(".scn-more");
            const txt = s.more ? `+${s.more}` : "";
            if (m && m.textContent !== txt) m.textContent = txt;
          }
          labelsShown = shown.length;
          labelsHidden = vis.length - shown.length;
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
          // MICRO-SPAZIO-3D-2 · a proxy's too (by its unit)
          content.traverse((o: any) => { if (o.isMesh && (o.userData.rmId === id || o.userData.unitId === id)) bb.expandByObject(o); });
          b = bb.isEmpty() ? null : bb;
        }
        return b ? [...b.min.toArray(), ...b.max.toArray()].map((x: number) => Math.round(x * 1000) / 1000) : null;
      };
      const applyOverlays = () => {
        content.traverse((o: any) => {
          if (o.isMesh && o.userData.unitId && o.material) {
            const wire = ov("s3_proxy_wire");
            o.material.wireframe = wire;
            o.material.opacity = proxyOpacity();
          }
        });
        for (const m of sketchMeshes.values()) {
          m.material.wireframe = ov("s3_proxy_wire");
          m.material.opacity = ov("s3_proxy_wire") ? val("s3_opacity_wire", 0.9) : 0.55;
        }
        sketchGroup.visible = ov("s3_sketches");
        buildDecor();
        attachGizmo();
      };
      probe.__spaceOverlays = () => Object.fromEntries((["s3_labels_rm", "s3_labels_proxy", "s3_labels_sketch", "s3_proxies", "s3_proxy_wire", "s3_rm", "s3_tiles",
        "s3_grid", "s3_axis_x", "s3_axis_y", "s3_axis_z", "s3_navgizmo", "s3_epoch_box", "s3_sel_outline", "s3_gizmo", "s3_cursor", "s3_sketches"] as OverlayKey[]).map((k) => [k, ov(k)]));
      // ── MICRO-SPAZIO-3D-3 p.10 · the flow of LOD ─────────────────────────
      const flowState = new Map<string, { item: SceneItem; current: string; gen: number; asking?: string; dist?: number; want?: string | null }>();
      /** the bytes of each version file loaded for the flow (the memory's count) */
      const flowBytes = new Map<string, number>();
      const flowStrip = document.createElement("div");
      flowStrip.className = "v3d-strip scn-flow hidden";
      let flowAt = 0;
      const flowBudget = () => Math.max(64, opts.tilesMemoryMB ?? 512) * 1024 * 1024;
      const flowUsed = () => { let b = 0; const cur = new Set<string>();
        for (const [, st] of flowState) { const v = st.item.flow?.find((x) => x.id === st.current); if (v) cur.add(v.url); }
        for (const [u, n] of flowBytes) if (cur.has(u)) b += n; return b; };
      /** swap a model's drawn version for another, already loaded: the old one
       *  stays until the new is ready (no hole) */
      const swapVersion = (key: string, v: FlowVersion, root: any) => {
        const st = flowState.get(key);
        const old = roots.get(key);
        if (!st || !old || st.gen !== generation || (modal && modal.targets.some((t) => t.id === key))) return;
        const obj = root.clone(true);
        obj.position.copy(old.position); obj.quaternion.copy(old.quaternion); obj.scale.copy(old.scale);
        obj.updateMatrixWorld(true);
        const gone = new Set<any>();
        old.traverse((o: any) => gone.add(o));
        for (let i = pickables.length - 1; i >= 0; i--) if (gone.has(pickables[i])) pickables.splice(i, 1);
        content.remove(old);
        tag(obj, st.item);
        content.add(obj);
        roots.set(key, obj);
        st.current = v.id;
        const d = drawn.get(key);
        if (d) drawn.set(key, { ...d, url: v.url });
        opts.onVersionDrawn?.(st.item.id, v.id);
      };
      // ── MICRO-SPAZIO-3D-3 p.12 · a container or its tileset, by the distance ──
      const altState = new Map<string, "tileset" | "models">();
      const altTick = () => {
        const groups = new Map<string, { err: number; tiles: string[]; models: string[] }>();
        for (const it of items) if (it.alt) {
          const g = groups.get(it.alt.group) ?? groups.set(it.alt.group, { err: it.alt.err, tiles: [], models: [] }).get(it.alt.group)!;
          (it.alt.role === "tileset" ? g.tiles : g.models).push(`rm:${it.id}`);
        }
        if (!groups.size) return;
        const H = Math.max(1, renderer.domElement.clientHeight);
        for (const [gid, g] of groups) {
          const box = new THREE.Box3();
          for (const k of [...g.models, ...g.tiles]) { const o = roots.get(k); if (!o) continue;
            const live = liveLayers().find((l) => l.layer.object === o); const b = live ? live.layer.bounds() : new THREE.Box3().setFromObject(o); if (b && !b.isEmpty()) box.union(b); }
          if (box.isEmpty()) continue;
          const dist = isOrtho ? orthoT : Math.max(0.01, box.distanceToPoint(camera.position));
          // the same threshold as the flow: the tileset is enough while its error stays under 16 px
          const sse = (g.err * H) / (2 * dist * Math.tan((FOV * Math.PI) / 360));
          const prev = altState.get(gid);
          const which: "tileset" | "models" = sse <= (prev === "tileset" ? 16 : 12.8) ? "tileset" : "models";
          for (const k of g.tiles) { const o = roots.get(k); if (o) o.visible = which === "tileset"; }
          for (const k of g.models) { const o = roots.get(k); if (o) o.traverse((x: any) => { x.visible = which === "models"; }); }
          for (const a of anchors) if (a.el.dataset.id && (g.tiles.includes(`rm:${a.el.dataset.id}`) || g.models.includes(`rm:${a.el.dataset.id}`)))
            a.el.classList.toggle("alt-off", (which === "tileset") !== g.tiles.includes(`rm:${a.el.dataset.id}`));
          if (prev !== which) { altState.set(gid, which); opts.onAltState?.(gid, which); }
        }
      };
      (probe as Record<string, unknown>).__spaceAlt = () => Object.fromEntries(altState);
      const flowTick = () => {
        altTick();
        if (!flowState.size) { flowStrip.classList.add("hidden"); return; }
        const H = Math.max(1, renderer.domElement.clientHeight);
        const camPos = camera.position;
        for (const [key, st] of flowState) {
          if (st.gen !== generation || !st.item.flow?.length) continue;
          const obj = roots.get(key);
          if (!obj || !obj.parent) continue;
          const box = new THREE.Box3().setFromObject(obj);
          const dist = isOrtho ? orthoT : Math.max(0.01, box.distanceToPoint(camPos));
          // a version without a measure and without tris_per_m2: its error from
          // its triangles and the model's box (lod-flow's third estimate)
          const size = box.getSize(new THREE.Vector3());
          for (const v of st.item.flow) if (v.err == null && v.tris) {
            const e = versionError({ primitives: { triangles: v.tris } }, { x: size.x, y: size.y, z: size.z });
            if (e.err != null) { v.err = e.err; v.errFrom = e.from; }
          }
          const { want, preload } = pickByDistance(st.item.flow, dist, FOV, H, st.current);
          st.dist = dist; st.want = want;
          if (preload) { const pv = st.item.flow.find((x) => x.id === preload); if (pv && !flowBytes.has(pv.url) && flowUsed() + (pv.bytes ?? 0) <= flowBudget()) { flowBytes.set(pv.url, pv.bytes ?? 0); void load(pv.url); } }
          if (!want || want === st.current || st.asking === want) continue;
          const v = st.item.flow.find((x) => x.id === want);
          if (!v) continue;
          const cur = st.item.flow.find((x) => x.id === st.current);
          // the memory: a finer version only while the flow stays under the ceiling
          if (cur && v.ord < cur.ord && flowUsed() - (cur.bytes ?? 0) + (v.bytes ?? 0) > flowBudget()) continue;
          st.asking = want;
          flowBytes.set(v.url, v.bytes ?? 0);
          void load(v.url).then((got) => {
            if (st.asking === want) st.asking = undefined;
            if (disposed || "fail" in got) return;
            const now = pickByDistance(st.item.flow!, dist, FOV, H, st.current).want;
            if (now === want) swapVersion(key, v, got.root);
          });
        }
        // the line of the strip: levels · MB, as the tileset's
        const lv: number[] = [];
        for (const [, st] of flowState) { const v = st.item.flow?.find((x) => x.id === st.current); if (v) lv.push(v.ord); }
        flowStrip.classList.toggle("hidden", !lv.length);
        if (lv.length) {
          const mb = (flowUsed() / 1048576).toFixed(1);
          const txt = `${opts.flowTitle ?? "Versions by distance"} · ${flowState.size} · LOD ${Math.min(...lv)}–${Math.max(...lv)} · ${mb} MB`;
          if (flowStrip.textContent !== txt) flowStrip.textContent = txt;
        }
      };
      (probe as Record<string, unknown>).__spaceFlow = () => [...flowState].map(([k, st]) => ({ key: k, current: st.current,
        url: st.item.flow?.find((x) => x.id === st.current)?.url, asking: st.asking ?? null, dist: st.dist ?? null, want: st.want ?? null,
        errs: st.item.flow?.map((v) => [v.ord, v.err, v.errFrom]) }));
      let raf = 0;
      let frames = 0;
      const tick = () => {
        if (disposed) return;
        raf = requestAnimationFrame(tick);
        stepAnim(performance.now());
        controls.update();
        const live = liveLayers();
        for (const l of live) l.layer.update();
        if (live.length && ++frames % 20 === 0) for (const l of live) l.bar.refresh();
        renderer.render(scene, camera);
        place();
        drawNav();
        // the flow of LOD, four times a second
        const now = performance.now();
        if (now - flowAt > 250) { flowAt = now; flowTick(); }
      };

      // ── the gestures (space-nav.ts: the table, written once) ─────────────
      const mac = isMacPlatform();
      const isTrackpad = trackpadClassifier();
      let down: { x: number; y: number; button: number } | null = null;
      /** MICRO-SPAZIO-3D-2 · a drag of the scene's own (`dragIntent`) */
      let drag: { intent: Exclude<DragIntent, null>; x0: number; y0: number; x: number; y: number; started: boolean;
                  point: V3 | null; shift: boolean; id: number } | null = null;
      let boxArmed = false;
      /** MICRO-SPAZIO-3D-3 · Shift+B zooms to the box, B selects in it (Blender) */
      let boxMode: "zoom" | "select" = "zoom";
      let boxStart: { x: number; y: number } | null = null;
      /** MICRO-SPAZIO-3D-3 · G / R / S on every selected object: each one's
       *  pose at the start, the pivot (its own origin when alone, else the
       *  median point of their boxes' centres, `medianPoint`) */
      type Target = { id: string; start: Pose; q0: any };
      /** MICRO-SPAZIO-3D-3 p.4 · «continuous grab», as Blender's: during the
       *  gesture the pointer is locked (Pointer Lock API) and the relative
       *  motions move a VIRTUAL pointer, which leaves by one edge of the 3D and
       *  comes back by the other; the value is read from the UNWRAPPED pointer
       *  (`mouse`), so it keeps growing. Where the lock is refused, the same
       *  sums from the motions the page still receives (to the screen's edge) */
      type Modal = { targets: Target[]; pivot: any; st: ModalState;
                     mouse0: { x: number; y: number } | null; mouse: { x: number; y: number } | null;
                     /** the virtual pointer, drawn: inside the 3D, wrapped */
                     vp: { x: number; y: number } | null; wraps: number;
                     /** R: the angle summed motion by motion (it survives a wrap) */
                     turned: number;
                     locked: boolean;
                     /** MICRO-SPAZIO-3D-3 p.5 · Ctrl held: G snaps to the faces, R and S step */
                     ctrl: boolean;
                     /** the lowest point of the objects' box along the up (three's y), at the start */
                     bottom: any;
                     /** the face under the pointer the last motion snapped to */
                     snapped: { point: V3; normal: V3; ms: number } | null };
      let modal: Modal | null = null;
      let lastMouse: { x: number; y: number } | null = null;
      const pickSketch = (id: string | null) => {
        sketchSel = id;
        sketchSet = new Set(id ? [id] : []);
        syncSketches();
        opts.onPickSketch?.(id);
      };
      const showModal = () => {
        modalEl.classList.toggle("hidden", !modal);
        if (modal) {
          // MICRO-SPAZIO-3D-3 p.4b · «Sposta · piano XY · D …», as Blender's header
          const dl0 = modalDelta();
          // snapped: the constraint's place says it («Sposta · aggancio alla faccia · D …»)
          const words = dl0?.kind === "snap" && opts.texts.modalWords && opts.texts.snapFace ? { ...opts.texts.modalWords, free: opts.texts.snapFace } : opts.texts.modalWords;
          modalEl.textContent = `${modalHeader(dl0?.kind === "snap" ? { ...modal.st, axis: null } : modal.st, headerValues(dl0), words, opts.texts.num)}`
            + `${modal.ctrl && dl0?.kind !== "snap" && modal.st.mode !== "grab" && opts.texts.snapStep ? ` · ${opts.texts.snapStep}` : ""}`
            + `${opts.texts.modalHint ? ` · ${opts.texts.modalHint}` : ""}`;
          modalEl.dataset.label = modalLabel(modal.st);
        }
        drawGuides();
      };
      /** the virtual pointer and the gesture's guides (a dashed line from the
       *  pivot to the pointer, as Blender's R and S), in the 3D's pixels */
      const guides = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      guides.setAttribute("class", "scn-guides");
      const vptr = document.createElement("div");
      vptr.className = "scn-vptr hidden";
      const drawGuides = () => {
        guides.textContent = "";
        vptr.classList.toggle("hidden", !modal?.vp);
        host.classList.toggle("scn-modal-on", !!modal);
        if (!modal) return;
        const r = renderer.domElement.getBoundingClientRect();
        const pv = toScreen(modal.pivot);
        const vp = modal.vp;
        if (vp) { vptr.style.left = `${vp.x - r.left}px`; vptr.style.top = `${vp.y - r.top}px`; }
        const NS = "http://www.w3.org/2000/svg";
        if (pv && vp && modal.st.mode !== "grab") {
          const l = document.createElementNS(NS, "line");
          l.setAttribute("x1", String(pv.x - r.left)); l.setAttribute("y1", String(pv.y - r.top));
          l.setAttribute("x2", String(vp.x - r.left)); l.setAttribute("y2", String(vp.y - r.top));
          l.setAttribute("class", "g-pivot");
          guides.appendChild(l);
        }
        for (const g of axisGuides()) {
          const l = document.createElementNS(NS, "line");
          l.setAttribute("x1", String(g.a.x - r.left)); l.setAttribute("y1", String(g.a.y - r.top));
          l.setAttribute("x2", String(g.b.x - r.left)); l.setAttribute("y2", String(g.b.y - r.top));
          l.setAttribute("stroke", g.colour);
          l.setAttribute("class", "g-axis");
          guides.appendChild(l);
        }
      };
      /** MICRO-SPAZIO-3D-3 p.4b · the constraint's frame: Blender's X Y Z in
       *  three's axes, global or the ACTIVE object's own (the letter twice) */
      const AX_COLOUR: Record<"x" | "y" | "z", string> = { x: "#ff3352", y: "#8bdc00", z: "#2890ff" };
      const refQ = () => (modal ? modal.targets[modal.targets.length - 1].q0 : new THREE.Quaternion());
      const axVec = (ax: "x" | "y" | "z", local: boolean) => {
        const a = v3(AXIS_VECTOR[ax]);
        return local ? a.applyQuaternion(refQ()).normalize() : a;
      };
      /** the coloured lines of the constrained axes through the pivot (Blender:
       *  X red, Y green, Z blue): one axis, or the two of a plane */
      const axisGuides = (): Array<{ a: { x: number; y: number }; b: { x: number; y: number }; colour: string }> => {
        if (!modal || !modal.st.axis) return [];
        const pv = toScreen(modal.pivot);
        if (!pv) return [];
        const out: Array<{ a: { x: number; y: number }; b: { x: number; y: number }; colour: string }> = [];
        for (const ax of freeAxes(modal.st)) {
          const q = toScreen(modal.pivot.clone().addScaledVector(axVec(ax, !!modal.st.local), Math.max(0.05, pxWorld(modal.pivot) * 40)));
          if (!q) continue;
          const dx = q.x - pv.x, dy = q.y - pv.y, l = Math.hypot(dx, dy);
          if (l < 1e-6) continue;
          const ux = dx / l, uy = dy / l, L = 4000;
          out.push({ a: { x: pv.x - ux * L, y: pv.y - uy * L }, b: { x: pv.x + ux * L, y: pv.y + uy * L }, colour: AX_COLOUR[ax] });
        }
        return out;
      };
      /** what the gesture does now, in three's axes: a move, a turn about an
       *  axis through the pivot, a scale from the pivot along the frame's axes */
      type Delta = { kind: "grab"; d: any } | { kind: "rotate"; axis: any; angle: number }
                 | { kind: "scale"; fb: Record<"x" | "y" | "z", number> }
                 /** p.5 · laid on a face: the box's lowest point on the hit, turned by `q` (aligned to the normal) */
                 | { kind: "snap"; at: any; q: any | null };
      /**
       * MICRO-SPAZIO-3D-3 p.5 · the face under the pointer, as Blender's «Face»
       * snap held with Ctrl: the surfaces of the OTHER objects — models,
       * proxies, sketches, and the tileset's tiles as they are drawn (only the
       * visible ones: `traverseVisible`); the objects moved and their children
       * are out of the ray.
       */
      const snapFace = (pt: { x: number; y: number }, probeOnly = false): { point: any; normal: any; n?: number } | null => {
        if (!modal && !probeOnly) return null;
        const t0 = performance.now();
        const moved = new Set((modal?.targets ?? []).map((t) => modalObject(t.id)).filter(Boolean));
        const out = (o: any) => { for (let x = o; x; x = x.parent) if (moved.has(x)) return true; return false; };
        const cands: any[] = [];
        for (const o of pickables) if (o.visible !== false && !out(o)) cands.push(o);
        if (sketchGroup.visible) for (const m of sketchMeshes.values()) if (m.visible && !moved.has(m)) cands.push(m);
        for (const l of liveLayers()) if (l.layer.object.visible) l.layer.object.traverseVisible((o: any) => { if (o.isMesh) cands.push(o); });
        ray.setFromCamera(ndcOf(pt.x, pt.y), camera);
        const hh = ray.intersectObjects(cands, false)[0];
        snapMs.push(performance.now() - t0);
        if (snapMs.length > 600) snapMs.shift();
        if (probeOnly) return hh ? { point: hh.point, normal: hh.face?.normal, n: cands.length } : { point: null, normal: null, n: cands.length };
        if (!hh) return null;
        const n = hh.face?.normal ? hh.face.normal.clone().transformDirection(hh.object.matrixWorld).normalize() : new THREE.Vector3(0, 1, 0);
        if (n.dot(ray.ray.direction) > 0) n.negate();      // the face seen, not its back
        return { point: hh.point.clone(), normal: n };
      };
      const snapMs: number[] = [];
      /** a page point's ray, met with the constraint (the line of an axis, the
       *  plane that excludes one, else the view's plane), through the pivot */
      const onConstraint = (pt: { x: number; y: number }, st: ModalState, pivot: any): any | null => {
        ray.setFromCamera(ndcOf(pt.x, pt.y), camera);
        const O = ray.ray.origin, r = ray.ray.direction;
        if (st.axis && !st.plane) {
          const a = axVec(st.axis, !!st.local);
          const w0 = new THREE.Vector3().subVectors(pivot, O);
          const b = a.dot(r), d = a.dot(w0), e = r.dot(w0);
          const den = 1 - b * b;
          if (Math.abs(den) < 1e-9) return null;
          return pivot.clone().addScaledVector(a, (b * e - d) / den);
        }
        const n = st.axis ? axVec(st.axis, !!st.local) : new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
        const den = r.dot(n);
        if (Math.abs(den) < 1e-9) return null;
        const t = new THREE.Vector3().subVectors(pivot, O).dot(n) / den;
        return O.clone().addScaledVector(r, t);
      };
      /** the move, from the screen's (the view's plane) when a ray grazes the constraint */
      const viewMove = (pivot: any) => {
        const dx = modal!.mouse!.x - modal!.mouse0!.x, dy = modal!.mouse!.y - modal!.mouse0!.y;
        const k = pxWorld(pivot);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        return right.multiplyScalar(dx * k).add(up.multiplyScalar(-dy * k));
      };
      const modalDelta = (): Delta | null => {
        if (!modal) return null;
        const st = modal.st;
        const v = modalValue(st);
        const pivot = modal.pivot;
        const local = !!st.local;
        if (st.mode === "grab" && modal.ctrl && v == null && (modal.vp ?? modal.mouse)) {
          const f = snapFace(modal.vp ?? modal.mouse!);
          if (f) {
            modal.snapped = { point: arr(f.point), normal: arr(f.normal), ms: snapMs[snapMs.length - 1] ?? 0 };
            const q = opts.snapAlign?.() ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.normal) : null;
            return { kind: "snap", at: f.point, q };
          }
        }
        if (modal.snapped && !(st.mode === "grab" && modal.ctrl)) modal.snapped = null;
        if (st.mode === "grab") {
          if (v != null) {
            // a number: along the axis (X when none), or along both of a plane's
            const d = new THREE.Vector3();
            for (const ax of st.axis ? freeAxes(st) : ["x" as const]) d.addScaledVector(axVec(ax, local), v);
            return { kind: "grab", d };
          }
          if (!modal.mouse0 || !modal.mouse) return { kind: "grab", d: new THREE.Vector3() };
          const p0 = onConstraint(modal.mouse0, st, pivot), p1 = onConstraint(modal.mouse, st, pivot);
          if (p0 && p1) {
            const d = p1.sub(p0);
            // the plane's normal (or the line's) is kept exact: no drift from the ray's sums
            if (st.axis && st.plane) { const n = axVec(st.axis, local); d.addScaledVector(n, -d.dot(n)); }
            return { kind: "grab", d };
          }
          let d = viewMove(pivot);
          if (st.axis && !st.plane) { const a = axVec(st.axis, local); d = a.multiplyScalar(d.dot(a)); }
          else if (st.axis) { const n = axVec(st.axis, local); d.addScaledVector(n, -d.dot(n)); }
          return { kind: "grab", d };
        }
        if (st.mode === "rotate") {
          // about the axis — or the normal of the plane that excludes it — Z when none
          const axis = axVec(st.axis ?? "z", local && !!st.axis);
          if (v != null) return { kind: "rotate", axis, angle: (v * Math.PI) / 180 };
          if (!modal.mouse0 || !modal.mouse) return { kind: "rotate", axis, angle: 0 };
          // the angle summed motion by motion: a wrapped pointer keeps turning;
          // Ctrl: in steps of 5°, as Blender's increment snap
          const ang = -modal.turned;
          return { kind: "rotate", axis, angle: modal.ctrl ? Math.round(ang / ((5 * Math.PI) / 180)) * ((5 * Math.PI) / 180) : ang };
        }
        let f = v;
        if (f == null) {
          if (!modal.mouse0 || !modal.mouse) f = 1;
          else {
            const centre = toScreen(pivot) ?? modal.mouse0;
            const r0 = Math.hypot(modal.mouse0.x - centre.x, modal.mouse0.y - centre.y) || 1;
            f = Math.hypot(modal.mouse.x - centre.x, modal.mouse.y - centre.y) / r0;
            // Ctrl: in steps of 0.1
            if (modal.ctrl) f = Math.round(f * 10) / 10;
          }
        }
        const free = new Set(freeAxes(st));
        return { kind: "scale", fb: { x: free.has("x") ? f : 1, y: free.has("y") ? f : 1, z: free.has("z") ? f : 1 } };
      };
      /** a target's pose under the delta, about the pivot */
      const poseUnder = (t: Target, dl: Delta, pivot: any): Pose => {
        const p0 = v3(t.start.position);
        if (dl.kind === "grab") return { ...t.start, position: arr(p0.add(dl.d)) };
        if (dl.kind === "snap") {
          // the objects' lowest point on the face; with «Allinea alla normale»
          // their up turned onto the face's normal, about that point
          const rel = p0.sub(modal!.bottom);
          if (!dl.q) return { ...t.start, position: arr(rel.add(dl.at)) };
          const e = new THREE.Euler().setFromQuaternion(dl.q.clone().multiply(t.q0), "XYZ");
          return { ...t.start, position: arr(rel.applyQuaternion(dl.q).add(dl.at)), rotation: [e.x, e.y, e.z] };
        }
        if (dl.kind === "rotate") {
          const q = new THREE.Quaternion().setFromAxisAngle(dl.axis, dl.angle);
          const pos = p0.sub(pivot).applyQuaternion(q).add(pivot);
          const e = new THREE.Euler().setFromQuaternion(q.clone().multiply(t.q0), "XYZ");
          return { ...t.start, position: arr(pos), rotation: [e.x, e.y, e.z] };
        }
        // the place scaled from the pivot along the frame's axes; the object's
        // own scale by its components (Blender's X Y Z are three's x z y)
        const local = !!modal?.st.local;
        const rel = p0.sub(pivot);
        const pos = pivot.clone();
        for (const ax of ["x", "y", "z"] as const) { const b = axVec(ax, local); pos.addScaledVector(b, rel.dot(b) * dl.fb[ax]); }
        const sc: V3 = [...t.start.scale] as V3;
        for (const ax of ["x", "y", "z"] as const) sc[AXIS_INDEX[ax]] *= dl.fb[ax];
        return { ...t.start, position: arr(pos), scale: sc };
      };
      /** the header's numbers, in Blender's axes: the move, the angle, the factors */
      const headerValues = (dl: Delta | null): number[] => {
        if (!dl) return [0, 0, 0];
        if (dl.kind === "grab") return threeToBlender(arr(dl.d)).map((x) => x || 0);
        if (dl.kind === "rotate") return [(dl.angle * 180) / Math.PI];
        if (dl.kind === "snap") return threeToBlender(arr(dl.at.clone().sub(modal!.bottom))).map((x) => x || 0);
        return [dl.fb.x, dl.fb.y, dl.fb.z];
      };
      const modalApply = () => {
        if (!modal) return;
        const dl = modalDelta();
        if (dl) for (const t of modal.targets) { const m = modalObject(t.id); if (m) setPose(m, poseUnder(t, dl, modal.pivot)); }
        showModal();
      };
      /** the object G / R / S moves: the sketch selected, else the selected
       *  proxy or model (MICRO-SPAZIO-3D-2: its transform is in the data) */
      const modalObject = (id: string): any => (id.startsWith("sketch:") ? sketchMeshes.get(id.slice(7)) : roots.get(id));
      /** s3Dgraphy node datamodel 1.6.31 · the box of an object's meshes in its
       *  OWN frame (the file's), null when nothing is loaded (a tileset) */
      const localBox = (obj: any): any | null => {
        if (!obj) return null;
        const box = new THREE.Box3();
        obj.updateMatrixWorld(true);
        const inv = obj.matrixWorld.clone().invert();
        obj.traverse((o: any) => {
          if (!o.isMesh || !o.geometry || o.userData.edges) return;
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
        });
        return box.isEmpty() ? null : box;
      };
      /** …its centre in the data's axes (Blender's, Z up): the default PIVOT */
      const localCentre = (id: string): V3 | null => {
        const b = localBox(modalObject(id));
        return b ? threeToBlender(arr(b.getCenter(new THREE.Vector3()))) : null;
      };
      const movable = (k: string): boolean => {
        if (k.startsWith("sketch:")) return ov("s3_sketches") && sketchMeshes.has(k.slice(7));
        return roots.has(k) && !roots.get(k).userData.tiles && !locked().has(k);
      };
      const startModalOn = (mode: ModalMode) => {
        let ids: string[];
        if (opts.transformTargets) ids = opts.transformTargets().filter(movable);
        else if (sketchSel && ov("s3_sketches")) ids = [`sketch:${sketchSel}`];
        else { const k = opts.transformTarget?.() ?? null; ids = k && movable(k) ? [k] : []; }
        if (!ids.length) return false;
        const targets: Target[] = [];
        for (const id of ids) {
          const m = modalObject(id);
          if (m) targets.push({ id, start: poseOf(m), q0: m.quaternion.clone() });
        }
        if (!targets.length) return false;
        // alone: the centre of its box (s3Dgraphy 1.6.31: the PIVOT of the data
        // — the origin of a survey's file lies 494 m under Templu Mare's podium),
        // a sketch its origin, as Blender; several: the median point of their boxes
        let pivot: any;
        if (targets.length === 1) {
          const m0 = modalObject(targets[0].id);
          const lb = targets[0].id.startsWith("sketch:") ? null : localBox(m0);
          pivot = lb ? m0.localToWorld(lb.getCenter(new THREE.Vector3())) : v3(targets[0].start.position);
        }
        else {
          const mp = medianPoint(targets.map((t) => arr(new THREE.Box3().setFromObject(modalObject(t.id)).getCenter(new THREE.Vector3()))));
          pivot = mp ? v3(mp) : v3(targets[0].start.position);
        }
        const all = new THREE.Box3();
        for (const t of targets) all.expandByObject(modalObject(t.id));
        const bc = all.getCenter(new THREE.Vector3());
        modal = { targets, pivot, st: startModal(mode), mouse0: lastMouse, mouse: lastMouse,
                  vp: lastMouse ? { ...lastMouse } : null, wraps: 0, turned: 0, locked: false,
                  ctrl: false, bottom: new THREE.Vector3(bc.x, all.min.y, bc.z), snapped: null };
        modalClient = lastMouse ? { ...lastMouse } : null;
        controls.enabled = false;
        lockPointer();
        gizmo?.setMode?.(mode === "grab" ? "translate" : mode === "rotate" ? "rotate" : "scale");
        showModal();
        return true;
      };
      const endModal = (confirm: boolean) => {
        if (!modal) return;
        // the last motions of the frame, not yet applied (they coalesce per frame)
        if (confirm) modalApply();
        const out: Array<{ key: string; pose: Pose; pivot?: V3 | null }> = [];
        for (const t of modal.targets) {
          const m = modalObject(t.id);
          if (!m) continue;
          if (!confirm) setPose(m, t.start);
          if (t.id.startsWith("sketch:")) {
            const sid = t.id.slice(7);
            updateSketch(sid, poseOf(m), true);
            if (confirm) out.push({ key: t.id, pose: poseOf(m) });
          } else if (confirm) out.push({ key: t.id, pose: poseOf(m), pivot: localCentre(t.id) });
        }
        modal = null;
        controls.enabled = true;
        unlockPointer();
        showModal();
        // one gesture, one step: the caller writes every transform at once
        if (confirm && out.length) {
          if (opts.onTransformMany) opts.onTransformMany(out);
          else for (const o of out) {
            if (o.key.startsWith("sketch:")) opts.onSketchChange?.(o.key.slice(7));
            else opts.onTransform?.(o.key, o.pose, o.pivot ?? null);
          }
        } else syncSketches();
      };
      probe.__spaceModal = () => (modal ? modalLabel(modal.st) : null);
      /** the axis whose screen direction is nearest to the motion so far */
      const nearestAxis = () => {
        if (!modal || !modal.mouse0 || !modal.mouse) return;
        const mx = modal.mouse.x - modal.mouse0.x, my = modal.mouse.y - modal.mouse0.y;
        const ml = Math.hypot(mx, my);
        if (ml < 2) return;
        const pv = toScreen(modal.pivot);
        if (!pv) return;
        let best: "x" | "y" | "z" | null = null, bc = -1;
        for (const ax of ["x", "y", "z"] as const) {
          const q = toScreen(modal.pivot.clone().addScaledVector(axVec(ax, false), Math.max(0.05, pxWorld(modal.pivot) * 40)));
          if (!q) continue;
          const dx = q.x - pv.x, dy = q.y - pv.y, l = Math.hypot(dx, dy);
          if (l < 1e-6) continue;
          const c = Math.abs((dx * mx + dy * my) / (l * ml));
          if (c > bc) { bc = c; best = ax; }
        }
        if (!best) return;
        modal.st = modal.st.axis === best && !modal.st.plane && modal.st.chosen ? { ...modal.st, axis: null, plane: false, local: false, chosen: false }
          : { ...modal.st, axis: best, plane: false, local: false, chosen: true };
        modalApply();
      };
      /** the probes' view of a continuous gesture: the lock, the virtual pointer, its wraps, the targets' poses */
      (probe as Record<string, unknown>).__spaceModalState = () => (modal ? { label: modalLabel(modal.st), locked: modal.locked,
        lockElement: document.pointerLockElement === renderer.domElement, vp: modal.vp, wraps: modal.wraps, mouse: modal.mouse,
        poses: modal.targets.map((t) => ({ id: t.id, pose: modalObject(t.id) ? poseOf(modalObject(t.id)) : null })) } : null);
      (probe as Record<string, unknown>).__spaceLockLog = () => lockLog.slice();
      (probe as Record<string, unknown>).__spaceSnapProbe = (x: number, y: number) => { const f = snapFace({ x, y }, true); return f ? { hit: f.point ? arr(f.point) : null, candidates: f.n } : null; };
      (probe as Record<string, unknown>).__spaceSnap = () => ({ snapped: modal?.snapped ?? null, ms: snapMs.slice() });

      // ── MICRO-SPAZIO-3D-3 p.4 · the pointer lock of a gesture ─────────────
      const lockLog: string[] = [];
      let modalClient: { x: number; y: number } | null = null;
      let lockWanted = false;
      const lockPointer = () => {
        lockWanted = true;
        const el = renderer.domElement as HTMLCanvasElement & { requestPointerLock?: (o?: unknown) => unknown };
        if (typeof el.requestPointerLock !== "function") { lockLog.push("no-api"); return; }
        try {
          const r = el.requestPointerLock({ unadjustedMovement: false }) as Promise<void> | undefined;
          if (r && typeof (r as Promise<void>).then === "function")
            (r as Promise<void>).then(() => lockLog.push("granted"), (err: unknown) => lockLog.push(`refused: ${String((err as Error)?.name ?? err)}`));
        } catch (err) { lockLog.push(`threw: ${String((err as Error)?.name ?? err)}`); }
      };
      const unlockPointer = () => {
        lockWanted = false;
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
      };
      const onLockChange = () => {
        const mine = document.pointerLockElement === renderer.domElement;
        if (modal) modal.locked = mine;
        lockLog.push(mine ? "locked" : "unlocked");
        // the browser takes the lock back on Esc (and eats the key): the gesture is cancelled
        if (!mine && modal && lockWanted) { lockWanted = false; endModal(false); }
      };
      const onLockError = () => { lockLog.push("pointerlockerror"); };
      document.addEventListener("pointerlockchange", onLockChange);
      document.addEventListener("pointerlockerror", onLockError);
      /** a motion of the gesture: relative when locked (or when the page gives
       *  `movementX`), the virtual pointer wrapped inside the 3D */
      const modalMove = (e: PointerEvent) => {
        if (!modal) return;
        modal.ctrl = e.ctrlKey;
        const r = renderer.domElement.getBoundingClientRect();
        const mx = Number.isFinite(e.movementX) ? e.movementX : 0, my = Number.isFinite(e.movementY) ? e.movementY : 0;
        const prev = modal.mouse ?? { x: e.clientX, y: e.clientY };
        // the motion: the event's own when locked (the only thing there is),
        // else the page position's difference — exact, where movementX is
        // rounded to the screen's pixels and drifts from the pointer
        const fromClient = modalClient ? { x: e.clientX - modalClient.x, y: e.clientY - modalClient.y } : { x: 0, y: 0 };
        modalClient = { x: e.clientX, y: e.clientY };
        const rel = document.pointerLockElement === renderer.domElement ? { x: mx, y: my } : fromClient;
        const next = { x: prev.x + rel.x, y: prev.y + rel.y };
        if (!modal.mouse0) modal.mouse0 = { ...next };
        // R: the angle summed, about the pivot's place on screen
        const pv = toScreen(modal.pivot);
        if (pv) {
          let da = Math.atan2(next.y - pv.y, next.x - pv.x) - Math.atan2(prev.y - pv.y, prev.x - pv.x);
          if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
          modal.turned += da;
        }
        modal.mouse = next;
        // the virtual pointer: the unwrapped one brought back inside the 3D
        const W = Math.max(1, r.width), H = Math.max(1, r.height);
        const wx = r.left + ((((next.x - r.left) % W) + W) % W), wy = r.top + ((((next.y - r.top) % H) + H) % H);
        modal.wraps = Math.round(Math.abs(Math.floor((next.x - r.left) / W)) + Math.abs(Math.floor((next.y - r.top) / H)));
        modal.vp = { x: wx, y: wy };
        lastMouse = modal.vp;
        // one application per frame: the motions of a frame coalesce (the
        // snap's raycast is the costly part, measured on a tileset's tile)
        if (!modalQueued) { modalQueued = true; requestAnimationFrame(() => { modalQueued = false; modalApply(); }); }
      };
      let modalQueued = false;

      const onDown = (e: PointerEvent) => {
        lastMouse = { x: e.clientX, y: e.clientY };
        // the capture phase, before OrbitControls and the gizmo: a modal's click
        // and a box's drag are not an orbit
        if (modal) {
          e.preventDefault();
          e.stopImmediatePropagation();
          // MICRO-SPAZIO-3D-3 p.4b · the middle button chooses the axis nearest
          // to the motion, as Blender (again: none); the orbit is not active here
          if (e.button === 1) { nearestAxis(); down = null; return; }
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
        // MICRO-SPAZIO-3D-2 · the mouse as Blender's; a touch is the controls'
        if (e.pointerType === "touch") return;
        if (e.button === 1) {
          e.preventDefault();                       // no autoscroll, no paste
          if (!getNav().middleSeen) opts.onMiddleSeen?.();
        }
        const intent = dragIntent({ button: e.button, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey },
          { emulate3: getNav().emulate3, leftSelects: getNav().leftSelects, leftPans: getNav().leftPans });
        // a press on the gizmo is the gizmo's
        if (intent && !(gizmo && (gizmo.axis || gizmo.dragging))) {
          drag = { intent, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false,
                   point: intent === "zoom" || intent === "pan" ? pointAt(e.clientX, e.clientY).p : null, shift: e.shiftKey, id: e.pointerId };
          if (e.button === 1 || (e.button === 0 && e.altKey)) e.stopImmediatePropagation();
        }
      };
      const onMove = (e: PointerEvent) => {
        // MICRO-SPAZIO-3D-3 · a gesture's motions are the document's (modalMove)
        if (modal) return;
        lastMouse = { x: e.clientX, y: e.clientY };
        if (drag && !gizmoDragging) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (!drag.started && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > DRAG_PX) {
            drag.started = true;
            try { renderer.domElement.setPointerCapture(drag.id); } catch { /* a synthetic pointer */ }
          }
          if (drag.started) {
            if (drag.intent === "orbit") orbitBy(dx, dy);
            else if (drag.intent === "pan") panBy(dx, dy, drag.point);
            else if (drag.intent === "zoom" && drag.point) zoomToward(drag.point, dragZoomFactor(dy));
            else if (drag.intent === "box-select") {
              const r = host.getBoundingClientRect();
              boxEl.style.left = `${Math.min(drag.x0, e.clientX) - r.left}px`;
              boxEl.style.top = `${Math.min(drag.y0, e.clientY) - r.top}px`;
              boxEl.style.width = `${Math.abs(e.clientX - drag.x0)}px`;
              boxEl.style.height = `${Math.abs(e.clientY - drag.y0)}px`;
              boxEl.classList.remove("hidden");
              boxEl.classList.add("select");
            }
          }
          drag.x = e.clientX;
          drag.y = e.clientY;
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
        if (boxMode === "select") {
          boxMode = "zoom";
          opts.onBoxSelect?.(keysInRect(Math.min(s.x, e.clientX), Math.min(s.y, e.clientY), Math.max(s.x, e.clientX), Math.max(s.y, e.clientY)), e.shiftKey);
          return;
        }
        const a = ndcOf(s.x, s.y), b = ndcOf(e.clientX, e.clientY);
        const cx = (s.x + e.clientX) / 2, cy = (s.y + e.clientY) / 2;
        const { p } = pointAt(cx, cy);
        opts.onBeforeJump?.();
        applyCam(isOrtho ? orthoBoxZoom(camState(), [a.x, a.y, b.x, b.y], p) : boxZoom(camState(), [a.x, a.y, b.x, b.y], p));
      };
      /** MICRO-SPAZIO-3D-3 · the keys of what is drawn whose centre falls in a
       *  page rectangle: proxies, models (a tileset by its volume), sketches */
      const keysInRect = (x0: number, y0: number, x1: number, y1: number): string[] => {
        const lk = locked();
        const out: string[] = [];
        const inside = (c: any) => { const q = toScreen(c); return !!q && q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1; };
        content.updateMatrixWorld(true);
        for (const [k, o] of roots) {
          if (!o.parent || o.visible === false || lk.has(k)) continue;
          const live = k.startsWith("rm:") ? liveLayers().find((l) => l.layer.object === o) : null;
          const b = live ? live.layer.bounds() : new THREE.Box3().setFromObject(o);
          if (b && !b.isEmpty() && inside(b.getCenter(new THREE.Vector3()))) out.push(k);
        }
        if (sketchGroup.visible)
          for (const [id, m] of sketchMeshes) {
            if (!m.visible || lk.has(`sketch:${id}`)) continue;
            if (inside(new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()))) out.push(`sketch:${id}`);
          }
        return out;
      };
      /** the box selection: the objects whose centre falls in it */
      const finishSelect = (d: NonNullable<typeof drag>, e: PointerEvent) => {
        boxEl.classList.add("hidden");
        boxEl.classList.remove("select");
        const x0 = Math.min(d.x0, e.clientX), x1 = Math.max(d.x0, e.clientX);
        const y0 = Math.min(d.y0, e.clientY), y1 = Math.max(d.y0, e.clientY);
        opts.onBoxSelect?.(keysInRect(x0, y0, x1, y1), d.shift);
      };
      /** the last click's pick, for the cycle through what overlaps */
      let lastPick: LastPick | null = null;
      const onUp = (e: PointerEvent) => {
        const d = drag;
        drag = null;
        if (d?.started) {
          try { renderer.domElement.releasePointerCapture(d.id); } catch { /* not captured */ }
          if (d.intent === "box-select") finishSelect(d, e);
        }
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
          // MICRO-PROVA-DEV47 p.2 · the menu of the nearest thing, as the click's
          const key = pickUnder(hits, { x: e.clientX, y: e.clientY }, null, intent === "menu-rm");
          const hit = key ? hits.find((x) => `${x.kind}:${x.id}` === key) ?? null : null;
          if (hit?.kind === "sketch") pickSketch(hit.id);
          opts.onMenu?.({ kind: hit ? hit.kind : "none", id: hit?.id ?? null, x: e.clientX, y: e.clientY,
            point: hits[0] ? arr(hits[0].point) : null });
          return;
        }
        // MICRO-PROVA-DEV47 p.2 · a click picks the nearest thing under the
        // pointer, as Blender's (`pickUnder`): again on the spot, the next one
        // behind; ⌘ (Ctrl) the models only
        if ((intent === "pick-rm" || intent === "pick-proxy") && opts.onPick) {
          const at = { x: e.clientX, y: e.clientY };
          // the cycle is the plain click's: Shift keeps Blender's add / make active / remove
          const key = pickUnder(hits, at, e.shiftKey ? null : lastPick, intent === "pick-rm");
          lastPick = key ? { ...at, key } : null;
          opts.onPick(key, e.shiftKey);
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
        applyCam(detailZoom(camState(), arr(hh.point), FOV));
      };
      let padGrab: { p: V3; until: number } | null = null;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (modal) return;
        if (e.ctrlKey) { zoomAt(e.clientX, e.clientY, wheelFactor(e.deltaY, e.deltaMode, true, host.clientHeight)); return; }
        if (isTrackpad(e as unknown as { deltaMode: number; deltaX: number; deltaY: number; wheelDeltaY?: number })) {
          // PARTE 0b · the fingers' way (`fingersOf`: natural scrolling undone):
          // two fingers to the right orbit and pan as the left drag to the
          // right. The orbit read the deltas as they come, against the drag
          // with natural scrolling (E.D., 17 Oct 2026: «invertita»)
          const [fx, fy] = fingersOf(e as unknown as { deltaMode: number; deltaX: number; deltaY: number; webkitDirectionInvertedFromDevice?: boolean });
          // the point grabbed at the gesture's start stays the grabbed one until
          // the fingers stop (400 ms): the scene slides under a still pointer
          if (e.shiftKey) {
            const now = performance.now();
            if (!padGrab || now > padGrab.until) padGrab = { p: pointAt(e.clientX, e.clientY).p, until: 0 };
            padGrab.until = now + 400;
            panBy(fx, fy, padGrab.p);
          } else {
            const k = getNav().invertTrackpadOrbit ? -1 : 1;
            orbitBy(k * fx, k * fy);
          }
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
      const selectedKeysNow = (): string[] => [...items.filter((i) => i.selected).map((i) => `${i.kind}:${i.id}`),
        ...[...new Set([...sketchSet, ...(sketchSel ? [sketchSel] : [])])].map((id) => `sketch:${id}`)];
      const onKey = (e: KeyboardEvent) => {
        // MICRO-PANNELLI-LATERALI p.2 · a modal G / R / S owns the keyboard until
        // it ends, as Blender's: the focus follows the mouse, and a G started
        // from the right-click menu (or a pointer that strayed over the next
        // window) must still hear Esc, Enter and the numbers
        if (!opts.isFocused?.() && !modal) return;
        const t = e.target as HTMLElement | null;
        if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable)) return;
        const stop = () => { e.preventDefault(); e.stopPropagation(); };
        if (modal) {
          stop();
          // MICRO-SPAZIO-3D-3 p.5 · Ctrl pressed or released without moving
          if (e.key === "Control") { modal.ctrl = true; modalApply(); return; }
          const next = modalKey(modal.st, e.key, e.shiftKey);
          if (next.done) { modal.st = next; endModal(next.done === "confirm"); return; }
          modal.st = next;
          modalApply();
          return;
        }
        // MICRO-SPAZIO-3D-2 · the numeric keypad (or the top row, emulated)
        const kp = keypadAction(e, getNav().emulateNumpad);
        if (kp) {
          stop();
          // no camera of view: nothing (Blender's 0) — and not the graph's «0» (fit) either
          if (kp === "camera") return;
          if (kp === "toggle-ortho") { finishAnim(); orthoAuto = false; setOrtho(!isOrtho); return; }
          if (kp === "frame-selection") {
            const keys = selectedKeysNow();
            if (!keys.length || !api.frameKeys?.(keys)) frameIt?.();
            return;
          }
          setAligned(kp.view);
          return;
        }
        const a = spaceKeyAction(e, mac);
        if (!a) return;
        switch (a) {
          case "frame-selection": {
            const keys = selectedKeysNow();
            if (!keys.length || !api.frameKeys?.(keys)) frameIt?.();
            stop();
            return;
          }
          case "frame-all": frameIt?.(); stop(); return;
          case "box-zoom": boxArmed = true; boxMode = "zoom"; host.classList.add("scn-armed"); stop(); return;
          case "box-select": boxArmed = true; boxMode = "select"; host.classList.add("scn-armed"); stop(); return;
          case "cursor-reset": centreScene(); stop(); return;
          case "grab": case "rotate": case "scale":
            if (startModalOn(a === "grab" ? "grab" : a === "rotate" ? "rotate" : "scale")) stop();
            return;
          case "cancel":
            if (boxArmed) { boxArmed = false; host.classList.remove("scn-armed"); stop(); }
            return;
          case "delete":
            if ((sketchSel || sketchSet.size) && opts.onKeyAction?.(a, e)) stop();
            return;
          default:
            if (opts.onKeyAction?.(a, e)) stop();
        }
      };
      /** MICRO-SPAZIO-3D-2 · Shift+C (E.D., 16 Oct 2026: not Blender's origin):
       *  the cursor at the median of the geometries drawn, the view on the 5th
       *  to 95th percentile of their boxes (`sceneCentre`) */
      const drawnBoxes = (): Box6[] => {
        const out: Box6[] = [];
        content.updateMatrixWorld(true);
        for (const [k, o] of roots) {
          if (!o.parent || o.visible === false) continue;
          const live = k.startsWith("rm:") ? liveLayers().find((l) => l.layer.object === o) : null;
          const b = live ? live.layer.bounds() : new THREE.Box3().setFromObject(o);
          if (b && !b.isEmpty()) out.push([...b.min.toArray(), ...b.max.toArray()] as Box6);
        }
        return out;
      };
      const centreScene = (): boolean => {
        const c = sceneCentre(drawnBoxes());
        if (!c) { if (opts.texts.centreEmpty) opts.onNotice?.(opts.texts.centreEmpty); return false; }
        cursorAt = c.cursor;
        cursorSet = true;
        opts.onCursor?.(cursorAt);
        const f = c.frame;
        frameBox(new THREE.Box3(new THREE.Vector3(f[0], f[1], f[2]), new THREE.Vector3(f[3], f[4], f[5])));
        return true;
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
      document.addEventListener("pointermove", modalMove, true);
      const onKeyUp = (e: KeyboardEvent) => { if (modal && e.key === "Control") { modal.ctrl = false; modalApply(); } };
      document.addEventListener("keyup", onKeyUp, true);
      const ro = new ResizeObserver(() => {
        ({ w, h } = size());
        renderer.setSize(w, h);
        persp.aspect = w / h;
        persp.updateProjectionMatrix();
        if (ortho) { orthoFrustum(); ortho.updateProjectionMatrix(); }
        for (const l of layers.values()) l.layer.resize();
      });
      ro.observe(host);
      status.remove();
      host.prepend(renderer.domElement);
      host.appendChild(labels);
      host.appendChild(strips);
      host.append(cursorEl, modalEl, boxEl, viewEl, guides, vptr, navEl);
      strips.appendChild(flowStrip);
      showView();
      cleanup = () => {
        cancelAnimationFrame(raf);
        for (const l of layers.values()) l.layer.dispose();
        layers.clear();
        strips.remove();
        ro.disconnect();
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("pointermove", modalMove, true);
        document.removeEventListener("keyup", onKeyUp, true);
        document.removeEventListener("pointerlockchange", onLockChange);
        document.removeEventListener("pointerlockerror", onLockError);
        unlockPointer();
        guides.remove();
        vptr.remove();
        gizmo?.detach?.();
        gizmo?.dispose?.();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        labels.remove();
        cursorEl.remove();
        modalEl.remove();
        boxEl.remove();
        viewEl.remove();
        navEl.remove();
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
          const r = Math.max(0.5, v3(camState().pos).distanceTo(controls.target) * 0.15);
          applyCam(frameSphere(camState(), cursorAt, r, FOV, persp.aspect));
        },
        armBoxZoom: () => { boxArmed = true; boxMode = "zoom"; host.classList.add("scn-armed"); },
        syncSketches,
        selectSketch: (id: string | null) => { sketchSel = id; sketchSet = new Set(id ? [id] : []); syncSketches(); },
        setSketchSelection: (ids: string[], active: string | null) => { sketchSet = new Set(ids); sketchSel = active; syncSketches(); },
        selectedSketch: () => sketchSel,
        sketchGlb: async (id: string) => {
          const m = sketchMeshes.get(id);
          if (!m || !GLTFExporter) return null;
          // MICRO-SPAZIO-3D-2 · the shape in its own frame (Y-up, base at its
          // origin), one mesh, no edges; the pose travels apart, into the data
          // (until 16 Oct 2026 it was baked into the vertices)
          let mesh: any;
          if (m.userData.fileSketch) {
            // a glb kept as a sketch: its meshes as they were, in the group's frame
            mesh = new THREE.Group();
            for (const c of m.children) {
              const k = c.clone(true);
              const edges: any[] = [];
              k.traverse((o: any) => { if (o.userData.edges) edges.push(o); else if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0xd9822b }); });
              for (const o of edges) o.parent?.remove(o);
              mesh.add(k);
            }
          } else {
            mesh = new THREE.Mesh(m.geometry.clone(), new THREE.MeshStandardMaterial({ color: 0xd9822b }));
          }
          mesh.name = id;
          const exporter = new GLTFExporter();
          const glb = await new Promise<ArrayBuffer | null>((res) => exporter.parse(mesh,
            (out: unknown) => res(out instanceof ArrayBuffer ? out : null), () => res(null), { binary: true }));
          return glb ? { glb, pose: poseOf(m) } : null;
        },
        surfaceAt: (x: number, y: number) => {
          const hh = hitsAt(x, y).find((q) => q.kind !== "sketch");
          if (!hh) return null;
          return { point: arr(hh.point), normal: worldNormal(hh) ?? [0, 1, 0] };
        },
        applyOverlays,
        drawnUrl: (k: string) => drawn.get(k)?.url,
        localCentre: (k: string) => localCentre(k),
        boxOf: (k: string) => {
          // a tileset: the volume its tileset.json DECLARES (the root's
          // boundingVolume, as the automatic choice reads it), not the content
          // loaded at this moment — a coarse level is a fraction of the whole
          const live = liveLayers().find((l) => l.layer.object === roots.get(k));
          const lb = live ? live.layer.bounds() : null;
          if (lb && !lb.isEmpty()) return [arr(lb.min), arr(lb.max)] as [V3, V3];
          const f = (probe as Record<string, unknown>).__spaceBoxOf as ((id: string) => number[] | null) | undefined;
          const b = f?.(k.split(":").slice(1).join(":"));
          return b ? [[b[0], b[1], b[2]], [b[3], b[4], b[5]]] as [V3, V3] : null;
        },
        view: viewNow,
        setView: (v: AlignedView) => setAligned(v),
        toggleOrtho: () => { finishAnim(); orthoAuto = false; setOrtho(!isOrtho); },
        centreScene,
        startModal: (mode: ModalMode) => startModalOn(mode),
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
    selectSketch: (id) => { sketchSel = id; sketchSet = new Set(id ? [id] : []); api.selectSketch?.(id); },
    setSketchSelection: (ids, active) => { sketchSet = new Set(ids); sketchSel = active; api.setSketchSelection?.(ids, active); },
    selectedSketch: () => sketchSel,
    sketchGlb: async (id) => (api.sketchGlb ? api.sketchGlb(id) : null),
    surfaceAt: (x, y) => api.surfaceAt?.(x, y) ?? null,
    applyOverlays: () => api.applyOverlays?.(),
    drawnUrl: (k) => api.drawnUrl?.(k),
    localCentre: (k) => api.localCentre?.(k) ?? null,
    boxOf: (k) => api.boxOf?.(k) ?? null,
    view: () => api.view?.() ?? { view: null, ortho: false, fov: 40, lensMm: 33 },
    setView: (v) => api.setView?.(v),
    toggleOrtho: () => api.toggleOrtho?.(),
    centreScene: () => api.centreScene?.() ?? false,
    startModal: (m) => api.startModal?.(m) ?? false,
  };
}
