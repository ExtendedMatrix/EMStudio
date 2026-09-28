import "./style.css";
import { applyFolding, buildMembership, MEMBERSHIP_EDGES } from "./folding";
import { geoOf, georeferenceScene, reprojectPoint, setBridgeResolver } from "./geo";
import type { PlacedScene } from "./geo";
import {
  buildContainer,
  corpusAcceptsNodeType,
  newCorpusSection,
  bumpVersion,
  mergeContainers,
  parseContainer,
  versionLabel,
} from "./container";
import type { Conflict, ProjectVersion } from "./container";
import {
  nameIsUsable, roomIdFromName, seedOpsForContainer, whatBlocksTheGesture,
} from "./rooms";
import {
  addToShelf,
  clearShelf,
  effectiveResidency,
  effectiveScope,
  isAnnotatable,
  loadShelfDocument,
  onShelfChange,
  removeFromShelf,
  restoreShelf,
  shelfEntries,
  shelfMeta,
  shelfToDocument,
  renameShelf,
  updateShelfEntry,
  SHELF_SCOPES,
  type ShelfEntry,
  type ShelfScope,
} from "./shelf";
import {
  buildMapping,
  EMPTY_STATE as EMPTY_MAPPING_STATE,
  type FsListing as MappingFsListing,
  type FsPlace as MappingFsPlace,
  edgeKey,
  renderMappingEditor,
  typeOfField,
  type FieldChoice,
  type MappingEditorHandlers,
  type MappingEditorState,
  type RelationDraft,
} from "./mapping-editor";
import {
  badgeClass,
  cellText,
  EMPTY_TABLE,
  humanSize,
  isBadgeColumn,
  parseShelfTable,
  rowId,
  type ShelfRow,
  type ShelfTable,
} from "./shelf-table";
import {
  currentIdentity,
  declareIdentity,
  orcidProblem,
  forgetIdentity,
  knownIdentities,
  MockIdentityProvider,
  sameSignature,
  publishGate,
  useIdentity,
  verifyCurrentIdentity,
  type IdentityProvider,
} from "./identity";
import { renderInspector } from "./inspector";
import { searchTwins } from "./twins";
import {
  mountSurface,
  refreshSurfaces,
  selectInSurfaces,
  surfaceOf,
  unmountSurface,
} from "./shell/surface";
import {
  registerBuiltinSurfaces,
  type PanelMount,
  type StorageMount,
} from "./shell/types";
import {
  layoutRects,
  sameRect,
  type DividerRect,
  type Rect,
} from "./shell/layout";
import {
  paintSurface,
  preservingScroll,
  rememberSurfaceScroll,
  restoreSurfaceScroll,
  scrollerOf,
} from "./surface-scroll";
import {
  CONNECTOR_API_VERSION,
  ConnectorRegistry,
  EMJSON_SCHEMA_VERSION,
  isConsumer,
  unknownCapabilities,
} from "./connectors";
import type { ConnectorVersions } from "./connectors";
import { narrativesIn, renderNarrativeView, VIEW_TYPE_MIME } from "./narrative";
import { acceptInvite, canManage, pendingJoin } from "./members";

import {
  addEpochChapter,
  scaffoldNarrativeFromGraph,
  undescribedEpochs,
} from "./narrative-scaffold";
import type { NarrativeEditor } from "./narrative";
import * as nauth from "./narrative-authorship";
import type { AuthorRef, DraftResult } from "./narrative-authorship";
import * as nedit from "./narrative-edit";
import {
  documentDiagnostics,
  logError,
  logInfo,
  logWarn,
  logEntries,
  onLogChange,
  renderLogPanel,
  versionBanner,
} from "./logpanel";
import { DocumentStore } from "./model";
import {
  HAS_PARADATA_NODEGROUP,
  initialName,
  nameStatusMap,
  paradataGroupRenameOnAttach,
  renameOnAttach,
  type NameCheck,
} from "./naming";
import {
  applyTheme,
  canvasTheme,
  storeMode,
  whenCanvasFontsReady,
  storedMode,
  watchSystemTheme,
  type ThemeMode,
} from "./theme";
import { buildNodeList, type NodeListCallbacks } from "./nodelist";
import { buildOverview, type OverviewApi } from "./overview";
import { edgeStyle } from "./palette";
import {
  buildPalette,
  PALETTE_MIME,
  SECTIONS,
  type PaletteDragPayload,
} from "./palette-ui";
import { createResourceThumb } from "./resource-preview";
import {
  edgeAt,
  hitAddPhase,
  hitAdornmentBadge,
  hitBandLabel,
  hitPdDecorator,
  hitPdTag,
  render,
  type ConnectDrag,
} from "./renderer";
import {
  allowedEdgeTypes,
  canonicalEdgeType,
  collapseSpellings,
  relationKey,
  classOf,
  CONNECTIONS_VERSION,
  connectValidity,
  edgeTypeLabel,
  EM_VERSION,
  GENERIC_EDGE,
  hdtoProfileTypes,
  isGroupType,
  isStratigraphicType,
  narrativeViewTypes,
  narrativeViewTypeDescription,
  isDtcNodeType,
  nodeTypeForClass,
  resourceTypeOfLocator,
  typeDescription,
  // (the datamodel version exports are read by `versions.ts` for the footer's
  // breakdown popover — MENU-AUDIT removed this module's second, hardcoded copy)
} from "./rules";
import { mapToSvg, sceneToSvg, timelineToSvg } from "./svg-export";
import {
  isTauri,
  openEmJson,
  readEmJsonPath,
  writeEmJson,
  saveAsEmJson,
  openGraphml,
  saveGraphml,
  saveTtl,
  setWindowTitle,
  baseName,
  transformerUrl,
  llmKeyStatus,
  setLlmKey,
  clearLlmKey,
  onForeignBridge,
  pickFolder,
  pickSourceFile,
  pickXlsx,
} from "./tauri";
import {
  describeExtraction,
  describeImport,
  initialState as initialStratiMinerState,
  renderStratiMiner,
  unreadWarnings,
} from "./stratiminer";
import { EMTree, renderEMTree, slotLabel } from "./emtree";
import type {
  AuxFileType, AuxiliaryFile, AuxMapReport, EMTreeHandlers, SlotViewState,
} from "./emtree";
import {
  coverage,
  getLocale,
  initI18n,
  isValidated,
  isValidatedInBuild,
  LOCALES,
  onLocaleChange,
  setLocale,
  setValidated,
  t,
} from "./i18n";
import type { Locale } from "./i18n";
import type {
  ExtractResult,
  ImportResult,
  PromptResult,
  StratiMinerHandlers,
} from "./stratiminer";
import { type HostInfo, SyncClient, SYNC_ACCEPTS, type SyncAccept } from "./sync";
import * as alignment from "./alignment";
import type { GraphOp } from "./model";
import { buildCommand, type CommandVerb } from "./commands";
import {
  type AwarenessNote, emptyPresence, type HubOp, noteForRemoteOp, noteForStale,
  opsForLocalChange, peerSelections, planRejoin, stampForResend,
  type PresenceState,
  reducePresence,
} from "./hub";
import { clearField as crdtClearField, writeField as crdtWriteField } from "./crdt";
import { isRemoved } from "./crdt";
import {
  AI_PROVIDERS,
  getSettings,
  getSyncUrl,
  iiifBase,
  miradorBase,
  saveSettings,
  SYNC_TOOLS,
  type Settings,
} from "./settings";
import { envelope as wireEnvelope } from "./wire";
import {
  fetchImageInfo,
  fittedUrl,
  type ImageInfo,
  imageService as iiifImageService,
  isImageResource,
  regionToWebAnnotation,
  webAnnotationToRegion,
  thumbnailUrl as iiifThumbnailUrl,
} from "./iiif";
import {
  ADORNMENT_EDGE_TYPES,
  CIRCLES,
  type CircleKey,
  defaultVisibleCircles,
  type DetailTemplate,
  edgeCircle,
  isAdornmentNodeType,
  nodeCircle,
  TEMPLATES,
} from "./filters";
import { adornmentBadges, type AdornmentBadge } from "./adornments";
import { BADGE_RULES, resolveEffective, sourceLabel } from "./funnel";
import { type Qualia, qualiaList, vocabularyFor } from "./vocab";
import { versionBreakdown } from "./versions";
import {
  hitGroupToggle,
  hitHandle,
  hitTest,
  sceneBounds,
  Viewport,
  type Scene,
} from "./scene";
import { GROUP_HEADER, GROUP_PAD } from "./views/matrix";
import { setupSearch } from "./search";
import {
  addEmDataHost,
  addEmDataRow,
  toggleEmDataClaimForm,
  removeEmDataHost,
  emDataFilter,
  setEmDataFilter,
  currentSheetKey,
  initEmData,
  renderEmData,
  setSheet,
  setVolatileProvider,
} from "./emdata";
import { addRow, deleteRow, EM_DATA_SHEETS } from "./em-data";
import { isVolatile } from "./volatile";
import { addRecent, removeRecent, type RecentFile } from "./recent";
import {
  WORKSPACES,
  WINDOW_TYPE_META,
  addWorkspace,
  removeWorkspace,
  renameWorkspace,
  workspaceLabel,
  isTiled,
  activeWin,
  activeWorkspace,
  activeWindowType,
  closeWindow,
  GRAPH_MODES,
  applyArrangement,
  canJoin,
  joinWindow,
  siblingIdsOf,
  layoutOf,
  maximizedWin,
  paneIds,
  toggleMaximize,
  setActiveWin,
  setActiveWorkspace,
  setWinCurrent,
  winCurrent,
  setWinMode,
  DISABLED_MODES,
  setWinModeOf,
  winModeOf,
  winModes,
  setWinType,
  syncActiveWorkspace,
  setSplitRatio,
  splitWindow,
  winMode,
  windowsOf,
  type Win,
  type WorkspaceId,
  type WindowType,
} from "./workspace";
import type { CentralMode, EmDocument, EmEdge, EmNode, ViewKind } from "./types";
import {
  BridgeDownError,
  FileRefusedError,
  collectionFromFile,
  collectionFromFolder,
  collectionFromUrl,
  fsFileUrl,
  fsList,
  isDecodable,
  kindOfExt,
  pdfPageCount,
  setStorageBridgeResolver,
  type Collection,
  type CollectionItem,
  type FsEntry,
  type FsListing,
} from "./storage";
import {
  DEFAULT_ASSET_LICENSE,
  RESIDENCIES,
  SCOPES,
  acquisitions,
  bucketAcquisition,
  sharedLeaves,
  declareDerivation,
  defaultUse,
  findResource,
  kindOf,
  supersessionOf,
  type Residency,
  type ResourceKind,
  type ResourceUse,
  type Scope,
} from "./ingest";
import {
  clearHandoffFromLocation, handoffFromLocation, parseHandoff, type Handoff,
} from "./handoff";
import {
  clearStudyLinkFromLocation, readStudyLink, type StudyLink,
} from "./studylink";
import {
  doorTo, fallbackPage, otherSurface, roomHandoff, RoundTripError,
} from "./roundtrip";
import {
  authorizeUrl, completeSignIn, loadAuthConfig, refresh as refreshSession,
  returningFromIdp,
  type AuthConfig,
} from "./oidc";
import { buildDtcGenesisScene, buildGroupScene } from "./views/context";
import { buildDtcScene } from "./views/dtc";
import { adaptNeighbourhood } from "./views/neighbourhood";
import type { NeighbourhoodAnswer } from "./views/neighbourhood";
// DTCEMS1 · il timbro, letto dal disco. `stamp.ts` risolve (per impronta, mai
// per nome), `views/stamps.ts` adatta alla scena che c'è già, `stamp-hints.ts`
// scrive l'unica cosa che questa notte scrive.
import {
  identityOf,
  readStamp,
  reportFolder,
  resolveFile,
  sameDigest,
  searchForParent,
  setStampBridgeResolver,
  walkChain,
  type Chain as StampChain,
  type FolderReport,
  type Stamp,
  type StampParent,
} from "./stamp";
import { adaptChain, missingDigests, type StampScene } from "./views/stamps";
import { hintsPathFor, readHints, recordFound, setHintsBridgeResolver } from "./stamp-hints";
// DTCEMS2 · comporre un passo e timbrarlo. La BOZZA sta qui, l'emissione passa
// da s3Dgraphy attraverso il bridge: `stamp-compose.ts` non costruisce mai un
// timbro, lo chiede.
import {
  emitDraft, kindAxis, newDraft, outputFrom, readyToStamp,
  setComposeBridgeResolver, type Draft, type DraftInput,
} from "./stamp-compose";
import { adaptDraft } from "./views/stamps";
import { dtcKindsFor } from "./rules";
import { digestOf, isStampPath, stampPathFor } from "./stamp";
// DTCEMS3 · il verbale d'ingestione: niente entra nello store senza che si
// sappia chi ce l'ha messo. La forma dell'atto sta qui; il verbale lo emette
// s3Dgraphy attraverso il bridge, come per la composizione.
import { ingestionAct, storeLocator } from "./stamp-ingest";
import { buildGraphScene, type GraphAlgorithm } from "./views/graph";
import { buildMatrixScene } from "./views/matrix";
import { renderStudyPanel } from "./study-panel";

declare global {
  interface Window {
    __EM_TEST_DATA__?: EmDocument;
    /** A verification SEAM, the read-only twin of `__EM_TEST_DATA__`.
     *
     *  It returns what is already on screen — which projection is showing, and
     *  the ids of the nodes and edges IN IT — so a check can assert that the DTC
     *  canvas is drawing the corpus and not the study graph. Nothing here changes
     *  state, and nothing else in the app reads it: it exists because "what is on
     *  the canvas" is otherwise only knowable by looking at pixels, and a claim
     *  that cannot be measured is a claim nobody should make. */
    __EM_SCENE__?: () => {
      view: string;
      source: "corpus" | "study";
      nodes: string[];
      edges: Array<{ source: string; target: string; type: string }>;
      fitted: boolean | null;
      /** each node's box in SCREEN pixels — so a test can aim a real gesture
       *  (drag a connector, click a node) at what is actually drawn */
      boxes: Array<{ id: string; x: number; y: number; w: number; h: number }>;
    } | null;
    /** DAG · the two documents side by side, and where undo would land. The
     *  question authoring the corpus raises is "which document did that go
     *  into?", and no visible surface answers it for both at once. */
    __EM_DOCS__?: () => {
      study: { name: string; nodes: number; edges: number; types: string[] };
      corpus:
        | { nodes: number; edges: number; types: string[]; names: string[] }
        | null;
      writeTarget: "study" | "corpus";
      undoTarget: "study" | "corpus";
      canUndo: boolean;
    };
  }
}

// ---------- state ----------
// THE ACTIVE GRAPH. Still a single module-level pointer, still read directly by
// every consumer in this file — which is exactly why the mono→multi jump (ET1)
// did not require touching them: `emtree` below owns *which* document this is,
// and nothing else had to learn that there is more than one.
let store: DocumentStore | null = null;
// The workspace: every open graph, one active (see emtree.ts). The active slot's
// store IS `store` above; there is no second copy of the truth.
const emtree = new EMTree();
// Absolute path of the currently-open file on desktop (Tauri). null =
// no file yet (Save falls back to Save As) or running in a browser.
let currentFilePath: string | null = null;

// Live-sync (ADR-002 phase 1: selection). EMStudio is always the WS client.
const sync = new SyncClient();
// True while applying a selection that ARRIVED from the peer, so we don't
// echo it straight back (loop guard).
let applyingRemoteSelect = false;
// Sync endpoint is configured in Settings (see settings.ts); resolved fresh
// on each connect so a settings change takes effect on the next connect.
let view: ViewKind = "matrix";
// DP-82 · the central area's MODE — the single decider of what the middle shows.
// `matrix`/`graph` are canvas projections and keep `view` in step (the canvas
// sub-view). Extension seam: add a token to `CentralMode` and a branch in
// `setMode` — nothing else.
//
// 14 set 2026 · `narrative` LEFT this union. It was the one type that was also a
// mode, and that is exactly where the window work had stopped: an overlay is
// over one canvas, so its surface had to be one element.
let centralMode: CentralMode = "matrix";
void centralMode;   // read by nothing since the narrative stopped being a mode
/** The modes the central-area selector offers, in order. Add `table`/`dtc` here
 *  (and a branch in `setMode`) when they land — the seam, not the feature. */
const CENTRAL_MODES: CentralMode[] = [
  "matrix",
  "graph",
  "dtc",
  "multigraph",
];
// Graph-view layout: chosen algorithm + manual position overrides (drags /
// liquid clustering). Overrides persist across rebuilds in-session and are
// cleared on a fresh Layout, an algorithm change, or a new/loaded document.
let graphAlgorithm: GraphAlgorithm = "layered";
const graphOverrides = new Map<string, { x: number; y: number }>();
// WIN2 · the DTC projection keeps its OWN drag overrides: the same node sits at
// different places in the two projections, so one shared map would teleport a
// node in Graph view because it was arranged in DTC.
const dtcOverrides = new Map<string, { x: number; y: number }>();
// MULTIGRAPH · its own drag map, for the same reason: the node sits elsewhere in
// each projection.
const multigraphOverrides = new Map<string, { x: number; y: number }>();
/** The manual-drag map of the current canvas projection, or null where drags are
 *  not overrides at all (Matrix stores positions in the document layout). */
function canvasOverrides(): Map<string, { x: number; y: number }> | null {
  if (view === "graph") return graphOverrides;
  if (view === "dtc") return dtcOverrides;
  if (view === "multigraph") return multigraphOverrides;
  return null;
}
// Matrix VIEW layout: an em-core layout of the FILTERED subgraph, so the Matrix
// recompacts (no gaps) when detail-rings hide nodes. null = use the archival
// doc.layout. Recomputed on filter change / view→matrix (see refreshMatrixViewLayout).
let matrixViewLayout: import("./types").EmLayout | null = null;
// Epochs whose phases (sub-epochs) are shown as lane sub-bands in the Matrix.
// Pure view state — never persisted. Phase bands are shown BY DEFAULT for every
// epoch that has phases; this set holds the top-level epochs the user COLLAPSED
// back into a single lane (opt-out). Keyed by the top-level epoch (the lane).
const phasesCollapsed = new Set<string>();
const scenes: Partial<Record<ViewKind, Scene | null>> = {};
// WIN2b · the camera belongs to a (WINDOW, mode) pair, not to the app. Two graph
// windows in the same projection keep their own pan and zoom, and coming back to
// a window returns you where you left it. Keyed lazily: a window that never
// showed a projection has no camera to restore, which is exactly the signal
// "frame it on arrival" (see framedViews).
const winViewports = new Map<string, Viewport>();
/** (window, mode) pairs already framed for the CURRENT document — reset whenever
 *  the document changes, so every window re-frames on the new graph. */
const framedViews = new Set<string>();

/** DAG · which document the DTC view was last built from — the corpus or the
 *  study graph. Kept so a change of SOURCE re-frames the camera (see
 *  `buildScenes`); it is not state anybody else reads. */
//: WHICH document the DTC view is drawing. `neighbourhood` joined the two on
//: 2026-09-03: an answer from the node is a third source, and the camera has to
//: be re-framed when the source changes for the same reason it always did — the
//: camera it was left with belonged to a different picture.
let lastDtcSource: "corpus" | "study" | "neighbourhood" | "stamps" | null = null;
/**
 * WIN7 · (window, mode) pairs whose camera the USER has moved — a pan, a zoom, a
 * fit they asked for. The app may re-frame a view it framed itself (see
 * `paintGraphWindow`: an area that changes size was framed for a rectangle it no
 * longer has, and a graph left as a speck in the corner is an area showing
 * nothing); it must never re-frame one somebody aimed by hand.
 *
 * (15 set 2026 · this used to point at `drawTile`, which was the SECOND drawing
 * and no longer exists. The rule did not move — one painter now does it for
 * every window — but a comment that outlives the name it cites teaches the next
 * reader a shape of the program that is not there.)
 */
const touchedViews = new Set<string>();
/** The size each window's camera was last framed for — one per (window, mode),
 *  because re-framing a camera aimed at a rectangle it no longer has is the
 *  difference between a live area and an empty-looking one. */
const framedSizes = new Map<string, string>();

/** Record that this window's camera is now the user's, not the app's. */
function markCameraTouched(winId: string, v: ViewKind): void {
  touchedViews.add(viewportKey(winId, v));
}
function viewportKey(winId: string, v: ViewKind): string {
  return `${winId}::${v}`;
}
function viewportFor(winId: string, v: ViewKind): Viewport {
  const key = viewportKey(winId, v);
  let vp = winViewports.get(key);
  if (!vp) {
    vp = new Viewport();
    winViewports.set(key, vp);
  }
  return vp;
}
/** Forget every window's camera — a different document needs different framing
 *  in every window, not the previous graph's pan and zoom. */
function resetWindowCameras(): void {
  winViewports.clear();
  framedViews.clear();
  touchedViews.clear();
  framedSizes.clear();
}
let hoverId: string | null = null;
let selectedId: string | null = null;
// Connector (edge) hover/selection is separate from node selection: the
// selected edge is stored as the document edge (survives scene rebuilds, and
// is what Delete removes); hover is a transient index into the current scene.
let selectedEdge: EmEdge | null = null;
let hoverEdgeIdx: number | null = null;
let placingType: string | null = null;
// for DTC palette items: the specific kind (photo, mesh, …) to stamp on the
// created node's data.dtc_kind; null for non-DTC placement.
let placingKind: string | null = null;
// true when the DTC item being placed is a RESOURCE (output → a ResourceNode) — so
// placeNode also stamps data.resource_type.
let placingIsResource = false;
let connect: ConnectDrag | null = null;
/** graph-view "liquid" filters: hidden node / edge types */
// hidden type sets are DERIVED from the visible circles of the CURRENT view
// (recomputeHiddenFromCircles); they are what buildScenes applies.
const hiddenNodeTypes = new Set<string>();
const hiddenEdgeTypes = new Set<string>();
// HDT-O-profile node types are ALWAYS hidden on the stratigraphic (EM-lens)
// canvas — they are graph-level metadata authored via the Canvas panel, kept in
// em.json for projection + the future HDT-O lens, never rendered as strat boxes.
// Derived from the datamodel (no hardcoded list); independent of the circles.
const HDTO_HIDDEN_TYPES = hdtoProfileTypes();
// "circles of detail" — which detail rings are visible, per view. Matrix and
// Graph keep independent visibility so each view has its own default depth.
const circleState: Record<ViewKind, Set<CircleKey>> = {
  matrix: defaultVisibleCircles("matrix"),
  graph: defaultVisibleCircles("graph"),
  dtc: defaultVisibleCircles("dtc"),
  multigraph: defaultVisibleCircles("multigraph"),
};
// Recompute the hidden type sets from the current view's visible circles.
function recomputeHiddenFromCircles(): void {
  hiddenNodeTypes.clear();
  hiddenEdgeTypes.clear();
  if (!store) return;
  const visible = circleState[view];
  for (const n of store.doc.graph.nodes) {
    const c = nodeCircle(n.node_type);
    if (c && !visible.has(c)) hiddenNodeTypes.add(n.node_type);
  }
  for (const e of store.doc.graph.edges) {
    const t = e.edge_type ?? "";
    const c = edgeCircle(t);
    if (c && !visible.has(c)) hiddenEdgeTypes.add(t);
  }
}
// If a freshly-created node's detail ring is hidden in the current view, turn
// it back on — otherwise you "create" a node you can't see.
function ensureCircleVisibleFor(nodeType: string | undefined): void {
  const c = nodeCircle(nodeType);
  if (!c || circleState[view].has(c)) return;
  circleState[view].add(c);
  recomputeHiddenFromCircles();
  buildScenes();
  draw();
  if (filterPanelOpen()) renderCirclesPanel();
  const label = CIRCLES.find((x) => x.key === c)?.label ?? c;
  toast(`Filter: showing “${label}” (new node was hidden)`);
}
/** group-context navigation stack; empty = full canvas */
let contextStack: string[] = [];
let contextScene: Scene | null = null;
const contextViewport = new Viewport();

// ---------- dom ----------
/*
 * GONE (15 set 2026) · `canvas`, `ctx` and `wrap`.
 *
 * Three module singletons: the one canvas, its one 2D context, and the area it
 * lived in — which had TWO names in this file (`wrap` here and `canvasWrapEl`
 * further down, the same element fetched twice). A graph window builds its own
 * canvas now (`mountGraphCanvas`), and the ten gestures are wired to it.
 */
const info = document.getElementById("info")!;
const tooltip = document.getElementById("tooltip")!;
const dropHint = document.getElementById("drop-hint")!;
const hintBar = document.getElementById("hint-bar")!;
const breadcrumb = document.getElementById("breadcrumb")!;
const edgeMenu = document.getElementById("edge-menu")!;
const toastEl = document.getElementById("toast")!;
const chronoBanner = document.getElementById("chrono-banner")!;
const btnMatrix = document.getElementById("btn-matrix") as HTMLButtonElement;
const btnGraph = document.getElementById("btn-graph") as HTMLButtonElement;
const btnNarrative = document.getElementById("btn-narrative") as HTMLButtonElement;
/** DP-82 · the central-area selector, one segment per CentralMode. A new mode
 *  adds its button here and a token to CENTRAL_MODES — `setMode` lights the right
 *  one from this map, so the active-state logic never grows a special case. */
const MODE_BUTTONS: Partial<Record<CentralMode, HTMLButtonElement>> = {
  matrix: btnMatrix,
  graph: btnGraph,
  // …and NOT `btnNarrative`: since 14 September that button transforms the
  // window instead of lighting a mode, so it has no "active" state to keep.
};
const btnNarrativeEdit = document.getElementById(
  "btn-narrative-edit") as HTMLButtonElement;
const btnUndo = document.getElementById("btn-undo") as HTMLButtonElement;
const btnRedo = document.getElementById("btn-redo") as HTMLButtonElement;
const dirtyDot = document.getElementById("dirty-dot")!;
// POL1: the always-present "+ epoch" for Matrix view. Declared up here with the
// other element refs because `updateToolbar` (much earlier in the file) toggles it.
const btnAddEpoch = document.getElementById("btn-add-epoch") as HTMLButtonElement;
const stratiminerEl = document.getElementById("stratiminer") as HTMLDivElement;

// EM-version pill → click for the version breakdown (config files + ontologies)
const verBtn = document.getElementById("em-version")!;
// Sits in the footer right after the "Extended Matrix" wordmark, so it reads
// "Extended Matrix 1.6" — the version alone, no redundant "EM" prefix.
verBtn.textContent = EM_VERSION;

// EMStudio app/build version (distinct from the EM language version above) —
// shown next to the header wordmark so testers know which build they're on.
const appVerEl = document.getElementById("app-version");
if (appVerEl) {
  appVerEl.textContent = __EMSTUDIO_VERSION__;
  appVerEl.title = `EMStudio ${__EMSTUDIO_VERSION__} — EM language ${EM_VERSION}`;
}

// Footer word for the current authoring mode (ADR-002): Standalone = editing a
// local .em.json; Sidecar = live-synced to a host. Driven by the sync socket.
const modeIndicator = document.getElementById("mode-indicator")!;
const sidecarDetail = document.getElementById("sidecar-detail")!;
// What the connected host is editing (tool / file / database / endpoint). Tool
// + endpoint are known locally from settings; file/database arrive from the
// host's `host_info` (or a snapshot's `host`). Reset when we disconnect.
let hostInfo: HostInfo = {};
//: C1 · the last misalignment SAID, so the log does not repeat one sentence
//: every time a `host_info` arrives. A warning repeated is a warning ignored.
let lastMisalignment = "";

/**
 * C1 · what THIS client has open, in the three keys `alignment` compares.
 *
 * The graph's id, because that is what a `node_id` belongs to; the name as the
 * label a human reads; and every id in the workspace, so "your document is in
 * my other slot" can be told from "I do not have your document".
 */
function describeOpenDocument(): Record<string, unknown> {
  // C2 · …and WHAT THIS CLIENT REFUSES. A gate on the receiving end is only
  // better than one on the sending end if the other end can find out about it:
  // otherwise "I closed my gate" and "the wire is broken" look the same from
  // over there, which is the failure this whole rearrangement is against.
  const said: Record<string, unknown> = { tool: "EMStudio", accept: syncAccept() };
  const g = store?.doc.graph as Record<string, unknown> | undefined;
  const id = g ? String(g.graph_id ?? "") : "";
  const name = g ? String(g.name ?? "") : "";
  if (id) said[alignment.GRAPH_ID_KEY] = id;
  if (name) said[alignment.GRAPH_NAME_KEY] = name;
  const all: string[] = [];
  for (const slot of emtree.slots) {
    const sid = String((slot.store.doc.graph as Record<string, unknown>).graph_id ?? "");
    if (sid && !all.includes(sid)) all.push(sid);
  }
  if (all.length) said[alignment.GRAPH_IDS_KEY] = all;
  return said;
}

/** C1 · the two documents compared, from THIS end. */
function documentAlignment(): alignment.Alignment {
  return alignment.compare(describeOpenDocument() as alignment.Declared, hostInfo);
}

/**
 * C1 · the OTHER end declared something → compare, and say it if it changed.
 *
 * Said once per distinct sentence. A warning that repeats on every `host_info`
 * is a warning people learn to scroll past, and this one has to be read exactly
 * once, while there is still time to fix it.
 */
function noteAlignment(): void {
  const state = documentAlignment();
  if (state.aligned) {
    lastMisalignment = "";
    return;
  }
  if (state.sentence === lastMisalignment) return;
  lastMisalignment = state.sentence;
  logWarn(t("sync.differentDocs", { what: state.sentence }));
  toast(t("sync.differentDocsToast"));
}

/**
 * C1 · the document changed on OUR side → say so, once, to whoever is listening.
 *
 * Called wherever the open document changes rather than only at connect: a
 * descriptor captured once would make the comparison run against a photograph,
 * and the case this whole thing exists for — somebody switching document while
 * the channel stays up — is exactly the one a photograph cannot see.
 */
function announceOpenDocument(): void {
  if (!sync.connected) return;
  sync.announceSelf();
  const state = documentAlignment();
  if (state.aligned) lastMisalignment = "";
  renderSidecarDetail();
  if (!state.aligned && state.sentence !== lastMisalignment) {
    lastMisalignment = state.sentence;
    logWarn(t("sync.differentDocs", { what: state.sentence }));
  }
}

/**
 * CONNECTORS · what has announced itself to this session, and how it went.
 *
 * The contract is s3Dgraphy's (`s3dgraphy.contract`): the four refusals, the
 * DTC-attributed delta and the write seam live where writes enter a graph. This
 * registry is the client's half — who is here, whether we understand them
 * (the version handshake), and what the session therefore IS.
 */
const connectors = new ConnectorRegistry();

/** What THIS build speaks. Read from the vendored datamodel, never restated. */
function ourConnectorVersions(): ConnectorVersions {
  return { emjson: EMJSON_SCHEMA_VERSION, datamodel: CONNECTIONS_VERSION,
           connector_api: CONNECTOR_API_VERSION };
}

/**
 * A host announced a connector descriptor (on `host_info` or a snapshot's
 * `host`). Accepted or refused with its reason — and a refusal is SAID, because
 * a peer that connects and then cannot write has already shown a lie.
 */
function announceConnector(info: HostInfo,
                           transport: "direct" | "lan" | "cloud"): void {
  if (!info.connector) return;
  const state = connectors.announce(info.connector, {
    ours: ourConnectorVersions(), transport,
    role: info.role ?? null, canWrite: info.can_write,
  });
  if (!state) {
    logWarn(t("conn.malformed"));
    return;
  }
  const name = state.descriptor.description || state.descriptor.name;
  if (state.status === "refused") {
    logWarn(`${name}: ${state.reason}`);
    toast(t("conn.refused", { name, why: state.reason ?? "" }));
    return;
  }
  // A CONSUMER is said differently, because it is a different relationship: a
  // Heriverse viewer is being SERVED a published study, not collaborating on
  // one. And what is listed is what it was GRANTED — a connector that declared
  // more than the role allows is shown with what it actually has.
  const caps = connectors.granted(state.descriptor.name).join(", ");
  logInfo(t(isConsumer(state.descriptor) ? "conn.consumer" : "conn.accepted",
            { name, caps }));
  const unknown = unknownCapabilities(state.descriptor);
  if (unknown.length)
    logWarn(t("conn.unknownCaps", { name, caps: unknown.join(", ") }));
  warnStarvedSubscribers();
}

/**
 * Somebody subscribed, and nothing is leaving. Said, not swallowed.
 *
 * `subscribe` rides the EXISTING op channel — no new transport was built for it
 * (`connectors.ts`) — which means the sync direction governs it: in `off` or
 * `receive` the ops do not leave this client, and a subscribed viewer would show
 * a study that never moves. That looks exactly like a broken viewer, so the one
 * thing this client owes is the sentence.
 */
function warnStarvedSubscribers(): void {
  // C2 · …and after C2 there is only ONE way this happens: the room said this
  // client may not write. A PREFERENCE no longer starves anybody, because no
  // preference holds traffic back on the way out any more — which is the whole
  // point of moving the gate to the receiving end.
  if (sync.canWrite) return;
  for (const state of connectors.subscribers())
    logWarn(t("conn.starvedReadOnly", {
      name: state.descriptor.description || state.descriptor.name,
      role: hostInfo.role ?? t("room.roleUnknown"),
    }));
}
function renderSidecarDetail(): void {
  const segs: { k: string; v: string }[] = [];
  const tool = hostInfo.tool || syncToolLabel();
  if (tool) segs.push({ k: "tool", v: tool });
  // the host's document (.em.json / .graphml) and remote database are shown as
  // separate segments; a free-form label stands in if neither is reported
  if (hostInfo.file) segs.push({ k: "doc", v: hostInfo.file });
  if (hostInfo.database) segs.push({ k: "db", v: hostInfo.database });
  if (!hostInfo.file && !hostInfo.database && hostInfo.label)
    segs.push({ k: "doc", v: hostInfo.label });
  // P4.3 · in a ROOM the endpoint is the hub, not the sidecar's host:port. Two
  // different destinations must not be shown by one label, or the footer says
  // where you are NOT connected.
  segs.push({
    k: sync.room ? "room" : "at",
    v: sync.room
      ? `${getSettings().sync.hubUrl.replace(/^https?:\/\//, "")}/${sync.room}`
      : getSyncUrl().replace(/^wss?:\/\//, ""),
  });
  sidecarDetail.innerHTML = "";
  for (const s of segs) {
    const seg = document.createElement("span");
    seg.className = "sd-seg";
    const k = document.createElement("span");
    k.className = "sd-k";
    k.textContent = s.k;
    seg.append(k, document.createTextNode(s.v));
    sidecarDetail.appendChild(seg);
  }
  // C2 · …and what the HOST refuses to take from us, when it is not everything.
  // Without this line, a host that has closed its gate is indistinguishable
  // from a broken wire — which is exactly what moving the gate was supposed to
  // end. Only when there is something to say.
  if (hostInfo.accept && hostInfo.accept !== "everything") {
    const gate = document.createElement("span");
    gate.className = "sd-seg sd-mismatch";
    const k = document.createElement("span");
    k.className = "sd-k";
    k.textContent = t("sync.hostAcceptTag");
    gate.append(k, document.createTextNode(String(hostInfo.accept)));
    gate.title = t("sync.hostAcceptHint");
    sidecarDetail.appendChild(gate);
  }
  // C1 · …and, when the two ends are NOT on the same document, that — here,
  // beside the connection it is a property of, rather than as a toast that
  // scrolls away. Only when there is something to say: a permanent "maybe" is
  // the first thing anybody learns to stop reading.
  const state = documentAlignment();
  if (!state.aligned) {
    const warn = document.createElement("span");
    warn.className = "sd-seg sd-mismatch";
    const k = document.createElement("span");
    k.className = "sd-k";
    k.textContent = t("sync.differentDocsTag");
    warn.append(k, document.createTextNode(state.sentence));
    warn.title = t("sync.differentDocsHint");
    sidecarDetail.appendChild(warn);
  }
}
/**
 * MODES1 · the three operating modes, made explicit.
 *
 *   standalone — no live connection: a local .em.json, on your own
 *   sidecar    — connected to a HOST that owns the graph (Blender/EMtools)
 *   hub        — connected to an StratiGraph Server (multi-user). NOT WIRED: the mode
 *                exists as a name and a menu entry, and says so. Showing it as
 *                available while faking a connection would be worse than not
 *                showing it.
 *
 * The mode is DERIVED (from the socket), never chosen directly — what is chosen
 * is the connection. It is read, not set.
 */
type SessionMode = "standalone" | "sidecar" | "hub";
let sessionMode: SessionMode = "standalone";

function setModeIndicator(mode: SessionMode | boolean): void {
  // …and the identity chip with it: PRESENCE is «in a room, with a role», so the
  // rung changes exactly when the connection does. One call here rather than a
  // second listener, because the mode indicator already runs on every change of
  // the fact the chip's top rung is about.
  queueMicrotask(refreshIdentityChip);
  // back-compat with the boolean callers (the sync status handler)
  const m: SessionMode =
    typeof mode === "boolean" ? (mode ? "sidecar" : "standalone") : mode;
  sessionMode = m;
  const connected = m !== "standalone";
  modeIndicator.textContent = t(`mode.${m}`);
  modeIndicator.title = t(`mode.${m}Title`);
  sidecarDetail.classList.toggle("hidden", !connected);
  if (connected) renderSidecarDetail();
  else {
    hostInfo = {};
    lastMisalignment = "";  // C1 · that sentence was about a session that ended
    connectors.clear();     // nothing is announced when nothing is connected
    sidecarDetail.innerHTML = "";
  }
  // MENU1 · reflect the active session mode in the Mode menu (a leading ✓).
  document.getElementById("btn-mode-standalone")
    ?.classList.toggle("mode-active", m === "standalone");
  document.getElementById("btn-mode-sidecar")
    ?.classList.toggle("mode-active", m === "sidecar");
  document.getElementById("btn-mode-hub")
    ?.classList.toggle("mode-active", m === "hub");
  renderSyncControl();
}

// ── MODES1 · the sync control ───────────────────────────────────────────────
//
// Four states, in the footer beside the mode, and only when there IS a channel
// to govern: a control over a connection that does not exist is furniture.
const syncControlEl = document.getElementById("sync-control")!;

function syncAccept(): SyncAccept {
  const raw = getSettings().sync.accept;
  return (SYNC_ACCEPTS as string[]).includes(raw) ? raw : "everything";
}

function setSyncAccept(accept: SyncAccept): void {
  const s = getSettings();
  saveSettings({ ...s, sync: { ...s.sync, accept } });
  sync.setAccept(accept);
  renderSyncControl();
  logInfo(t("sync.acceptLogged", { what: t(`sync.accept.${accept}`) }));
  // C2 · …and it is SAID on the wire, because a gate on the receiving end is
  // only better than one on the sending end if the other end can learn about
  // it. `client_info` already carries what this client is; what it refuses is
  // one more field of the same answer.
  if (sync.connected) sync.announceSelf();
}

const SYNC_GLYPHS: Record<SyncAccept, string> = {
  nothing: "⃠", selection: "◉", everything: "⇄",
};

/**
 * P5 · does the ROOM let this client write?
 *
 * The server decides (`host_info.can_write`, from the role it resolved at the
 * door) and this is where the client believes it. A host that says nothing —
 * every EMtools pairing — is writable: the question only arises where roles do.
 */
function hubReadOnly(): boolean {
  return hostInfo.can_write === false;
}

/**
 * Make the session match what the room allows.
 *
 * It used to borrow the sync DIRECTION for this — `receive` meant "listen, do
 * not send", and every send path respected it. C2 took the outbound gate away,
 * and this enforcement would have gone with it silently: the client would have
 * kept offering edits the server then refused one by one. So the room's refusal
 * gets its own guard (`sync.setWritable`), which is the honest shape anyway —
 * a permission declared by a server and a preference chosen by a person are
 * different kinds of fact, and they were only sharing a mechanism because one
 * was already there.
 */
function applyRoomPermission(): void {
  sync.setWritable(!hubReadOnly());
  renderSyncControl();
  // …and if a consumer is subscribed to a stream that will now never move, that
  // is the moment to say so.
  warnStarvedSubscribers();
}

function renderSyncControl(): void {
  if (!syncControlEl) return;
  const connected = sessionMode !== "standalone";
  syncControlEl.classList.toggle("hidden", !connected);
  if (!connected) {
    syncControlEl.innerHTML = "";
    return;
  }
  const readOnly = hubReadOnly();
  // C2 · the read-only badge and the accept control are now about DIFFERENT
  // things — what the room refuses to take FROM me, and what I refuse to take
  // FROM it — so neither disables the other. They used to be one control, which
  // is why a read-only room looked like somebody had changed your preference.
  const active: SyncAccept = syncAccept();
  syncControlEl.innerHTML = "";
  if (readOnly) {
    // Said once, where the session's state is shown, and not as a toast that
    // scrolls away: "you are reading" is a property of this connection, not an
    // event that happened.
    const badge = document.createElement("span");
    badge.className = "sync-readonly";
    badge.textContent = t("room.readOnly");
    badge.title = t("room.readOnlyHint", {
      role: hostInfo.role ?? t("room.roleUnknown"),
    });
    syncControlEl.appendChild(badge);
  }
  const label = document.createElement("span");
  label.className = "sync-ctl-label";
  label.textContent = t("sync.acceptLabel");
  // The hint is the whole reason the gate is here and not on the way out, so it
  // travels with the control instead of living in a manual nobody opens.
  label.title = t("sync.acceptHint");
  syncControlEl.appendChild(label);
  for (const what of SYNC_ACCEPTS) {
    const b = document.createElement("button");
    b.className = "sync-ctl-btn" + (what === active ? " on" : "");
    b.textContent = SYNC_GLYPHS[what];
    b.title = `${t(`sync.accept.${what}`)} — ${t(`sync.acceptTitle.${what}`)}`;
    b.dataset.accept = what;
    b.addEventListener("click", () => setSyncAccept(what));
    syncControlEl.appendChild(b);
  }
}

// The client is told what to do BEFORE any connection exists, so a stored
// choice is in force from the first frame rather than from the first click.
sync.setAccept(syncAccept());
setModeIndicator("standalone");

// ---------- theme (DARK1) ----------
// Applied BEFORE the first draw: `applyTheme` stamps `data-theme` for the CSS and
// sets the canvas palette for the renderer, which cannot read CSS variables.
// The stored preference wins; with none, `auto` follows the system.
applyTheme(storedMode());
const setThemeSel = document.getElementById("set-theme") as HTMLSelectElement;
setThemeSel.value = storedMode();
setThemeSel.addEventListener("change", () => {
  const mode = setThemeSel.value as ThemeMode;
  storeMode(mode);
  applyTheme(mode);
  // the canvas does not repaint itself, and the overview lives on its own canvas
  draw();
});
// While the preference is `auto`, follow the system live (matchMedia, not a poll).
watchSystemTheme(() => {
  setThemeSel.value = storedMode();
  draw();
});
let verPop: HTMLDivElement | null = null;
function closeVerPop(): void {
  verPop?.remove();
  verPop = null;
  document.removeEventListener("pointerdown", onVerOutside, true);
  document.removeEventListener("keydown", onVerKey, true);
}
function onVerOutside(e: PointerEvent): void {
  if (verPop && !verPop.contains(e.target as Node) && e.target !== verBtn)
    closeVerPop();
}
function onVerKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    closeVerPop();
  }
}
verBtn.addEventListener("click", () => {
  if (verPop) {
    closeVerPop();
    return;
  }
  const b = versionBreakdown();
  const pop = document.createElement("div");
  pop.className = "ver-pop";
  const title = document.createElement("h4");
  title.textContent = `Extended Matrix ${b.emLanguage}`;
  pop.appendChild(title);
  const sect = (t: string): void => {
    const d = document.createElement("div");
    d.className = "ver-sect";
    d.textContent = t;
    pop.appendChild(d);
  };
  const row = (
    label: string,
    ver: string,
    srcTitle?: string,
    href?: string,
  ): void => {
    const r = document.createElement("div");
    r.className = "ver-row";
    if (srcTitle) r.title = srcTitle;
    // An ontology whose `source` is a real URL becomes a link to its reference
    // page; everything else stays text (POL3). The URL is NOT a hardcoded
    // name→URL map: it is the datamodel's own `source` field (invariant 1), so
    // adopting a new ontology release moves the link with the version instead of
    // leaving a stale table behind in the UI.
    const s = document.createElement(href ? "a" : "span");
    s.textContent = label;
    if (href && s instanceof HTMLAnchorElement) {
      s.href = href;
      s.target = "_blank";
      s.rel = "noopener noreferrer";
      s.className = "ver-link";
    }
    const v = document.createElement("b");
    v.textContent = ver;
    r.append(s, v);
    pop.appendChild(r);
  };
  sect("JSON config files");
  // The JSON configs are FILES vendored in this build, not documents on the web:
  // there is nothing to open, so they stay text.
  for (const c of b.configs) row(c.label, c.version);
  sect("Reference ontologies");
  for (const o of b.ontologies) row(o.name, o.version, o.source, o.href);
  document.body.appendChild(pop);
  const rect = verBtn.getBoundingClientRect();
  pop.style.left = Math.min(rect.left, window.innerWidth - 316) + "px";
  // The trigger now lives in the footer, so prefer opening UPWARD; only drop
  // below when there is not enough room above (short viewport).
  const ph = pop.offsetHeight;
  const openUp = rect.top - ph - 6 >= 0 || rect.top > window.innerHeight - rect.bottom;
  pop.style.top = (openUp ? Math.max(6, rect.top - ph - 6) : rect.bottom + 6) + "px";
  verPop = pop;
  setTimeout(() => {
    document.addEventListener("pointerdown", onVerOutside, true);
    document.addEventListener("keydown", onVerKey, true);
  }, 0);
});

let toastTimer: number | undefined;
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.add("hidden"), 2600);
}

/**
 * WIN4 · the height the DOCKED window bar takes from the canvas.
 *
 * The bar is not an overlay any more: the canvas is exactly this much shorter,
 * so nothing the bar covers is content (the epoch bands are pinned to the top of
 * the matrix, and a floating bar sat on them). Measured rather than declared —
 * the bar wraps to two rows on a narrow window, and a hardcoded height would go
 * wrong precisely when it matters.
 */
function windowBarHeight(): number {
  const bar = document.getElementById("window-header");
  if (!bar || bar.classList.contains("hidden")) return 0;
  return bar.offsetHeight;
}

/**
 * The canvas of the window the hand is in — for the two CURSOR classes that used
 * to be set on the one element (`placing`, `connecting`).
 *
 * A class that says "you are placing a node" or "you are drawing a connector" is
 * about the gesture, and the gesture is in one window. So it is set on that
 * window's canvas and cleared from every canvas, which is what makes it safe
 * when the gesture ends somewhere else.
 */
function liveCanvas(): HTMLCanvasElement | null {
  return graphWindows.get(activeWin().id)?.cv ?? null;
}

/** …and its AREA, for the two popups that are placed in canvas coordinates and
 *  have to live inside the box those coordinates belong to (the edge menu, the
 *  create menu). They used to be appended to the one `#canvas-wrap`. */
function liveArea(): HTMLElement {
  return winAreas.get(activeWin().id) ?? tileRoot;
}
function setCanvasCursor(cls: string, on: boolean): void {
  for (const g of graphMounts()) g.cv.classList.remove(cls);
  if (on) liveCanvas()?.classList.add(cls);
}

/**
 * The drawing box of the window that has the focus.
 *
 * It used to read the one `canvas` and the one `wrap`. It reads the focused
 * window's canvas now, and the fall-through is the same one for the same reason:
 * during a transient relayout an element can report 0, and `fit()` must not
 * collapse to the minimum scale because it asked at the wrong moment.
 *
 * Still "the focused window" rather than a parameter, and that is honest: its
 * four callers (`fit`, `centerOn`, the overview click, `setViewOnLoad`) are all
 * verbs of the window you are working in. A window you are not working in never
 * asks how big it is — it is told, by `paintGraphWindow`, from its own element.
 */
function viewSize(): { w: number; h: number } {
  const cv = graphWindows.get(activeWin().id)?.cv;
  const area = winAreas.get(activeWin().id);
  const w = cv?.clientWidth || area?.clientWidth || window.innerWidth || 800;
  const h =
    cv?.clientHeight ||
    Math.max(1, (area?.clientHeight || 0) - windowBarHeight()) ||
    window.innerHeight ||
    600;
  return { w, h };
}

/*
 * GONE (15 set 2026) · `resizeCanvas()`.
 *
 * It sized the backing store of the one canvas and published `--winbar-h` on the
 * one wrap. Every graph window sizes its own backing store in
 * `paintGraphWindow` — where the numbers are already in hand — and every area
 * publishes its own `--winbar-h` in `renderAreaHeaders`, as every other type's
 * area has since 12 September.
 */

// Edges are filtered by the detail-rings (buildScenes drops hidden edge types
// from the scene), so every edge in the scene is meant to be shown.
const edgeVisible = (_t?: string): boolean => true;

const inContext = (): boolean => contextStack.length > 0;

function scene(): Scene | null {
  return inContext() ? contextScene : (scenes[view] ?? null);
}

// the seam declared above: what is on the canvas, as ids.
window.__EM_SCENE__ = () => {
  const s = scene();
  if (!s) return null;
  const corpus = documentationCorpus({ create: false });
  const corpusIds = new Set((corpus?.liveNodes() ?? []).map((n) => n.id));
  const ids = s.nodes.map((n) => n.id);
  return {
    view,
    // WHOSE nodes these are, decided by where they actually live — the question
    // the DTC view exists to answer correctly
    source: ids.length && ids.every((id) => corpusIds.has(id)) ? "corpus" : "study",
    nodes: ids,
    // a SceneEdge is `{source, target, edge}` — the relation type lives on the
    // document edge it carries, not on the scene edge itself (measured: reading
    // `edge_type` off the scene edge gave every relation the empty string)
    edges: (s.edges ?? []).map((e) => ({
      source: e.source,
      target: e.target,
      type: String(e.edge.edge_type ?? ""),
    })),
    boxes: (() => {
      const vp = viewport();
      return s.nodes.map((n) => ({
        id: n.id,
        x: n.x * vp.scale + vp.x,
        y: n.y * vp.scale + vp.y,
        w: n.w * vp.scale,
        h: n.h * vp.scale,
      }));
    })(),
    // SURFACE-AUDIT · the CAMERA. For a canvas window, pan and zoom are what a
    // scroll position is for a surface: the content is redrawn from the state, so
    // it never goes blank, but a camera reset by a focus change loses the reader's
    // place just as completely. Exposed so that can be measured.
    vp: (() => {
      const vp = viewport();
      return { x: Math.round(vp.x), y: Math.round(vp.y),
               scale: Number(vp.scale.toFixed(4)) };
    })(),
    // is the whole picture on screen? (the DAG must OPEN fitted, and a camera
    // left over from another picture is the way it opens at 300% on a corner)
    fitted: (() => {
      const vp = viewport();
      const { w, h } = viewSize();
      if (!s.nodes.length || w <= 0 || h <= 0) return null;
      return s.nodes.every((n) => {
        const x0 = n.x * vp.scale + vp.x;
        const y0 = n.y * vp.scale + vp.y;
        return x0 >= -1 && y0 >= -1 && x0 + n.w * vp.scale <= w + 1 && y0 + n.h * vp.scale <= h + 1;
      });
    })(),
  };
};

// …and the FIGURES this process renders for an export, so a test can carry them
// out and check what the exporters do with them (the pictures are the point of
// the whole path, and reading them out of a download inside a browser is not a
// measurement anybody can repeat).
//
// A PROMISE, since the map figure may have to ask the bridge for the scene's
// placement: awaited by whoever measures, exactly as the export awaits it.
(window as unknown as
  { __EM_FIGURES__?: () => Promise<Record<string, string>> })
  .__EM_FIGURES__ = async () => {
    const narrative = store ? narrativesIn(store.doc)[0] : null;
    return narrative ? await narrativeFigures(narrative.id) : {};
  };

// …and the CONNECTORS this session has accepted or refused, so the handshake and
// the role gate can be measured over a real socket instead of argued about.
(window as unknown as { __EM_CONNECTORS__?: () => unknown })
  .__EM_CONNECTORS__ = () => ({
    mode: connectors.mode(),
    ours: ourConnectorVersions(),
    list: connectors.list().map((s) => ({
      name: s.descriptor.name, status: s.status, reason: s.reason,
      transport: s.transport, role: s.role, can_write: s.can_write,
      capabilities: s.descriptor.capabilities,
      versions: s.descriptor.versions,
    })),
    canWriteGraph: connectors.can("write-graph"),
    canMaterialize: connectors.can("materialize-3D"),
    // the outgoing half: who is being SERVED, what they were granted, and
    // whether the changes they subscribed to are actually leaving
    consumers: connectors.consumers().map((s) => ({
      name: s.descriptor.name, transport: s.transport, role: s.role,
      granted: connectors.granted(s.descriptor.name),
      declared: s.descriptor.capabilities,
    })),
    subscribers: connectors.subscribers().map((s) => s.descriptor.name),
    syncAccept: sync.syncAccept,
  });

window.__EM_DOCS__ = () => {
  const corpus = documentationCorpus({ create: false });
  const undoTo = undoStore();
  return {
    study: {
      name: String((store?.doc.graph as Record<string, unknown> | undefined)?.name ?? ""),
      nodes: store?.liveNodes().length ?? 0,
      edges: store?.liveEdges().length ?? 0,
      types: [...new Set((store?.liveNodes() ?? []).map((n) => n.node_type))].sort(),
    },
    corpus: corpus
      ? {
          nodes: corpus.liveNodes().length,
          edges: corpus.liveEdges().length,
          types: [...new Set(corpus.liveNodes().map((n) => n.node_type))].sort(),
          names: corpus.liveNodes().map((n) => n.name || n.id),
        }
      : null,
    writeTarget: canvasWritesToCorpus() ? "corpus" : "study",
    undoTarget: undoTo && undoTo !== store ? "corpus" : "study",
    canUndo: !!undoTo?.canUndo,
  };
};

function viewport(): Viewport {
  return inContext() ? contextViewport : viewportFor(activeWin().id, view);
}

/**
 * ONE PAINTER, for ONE graph window. It does not know who has the focus.
 *
 * `draw()` and `drawTile(winId, mode, cv)` used to be two functions, and the
 * difference between them was never the drawing — it was the INTERACTION STATE:
 * the hover, the connector being pulled, the marquee, the insert boundary. So
 * that state arrives here as an argument, and a window with no gesture in flight
 * receives `null`. There is no branch on the focus in this function, and there
 * must never be one: a `winId === activeWin().id` in here would be the twin
 * rebuilt under another name, which is the way this change fails without
 * anybody noticing.
 *
 * What is drawn in EVERY window and what only in the live one, decided by what
 * the thing IS:
 *  · the scene, the selection and the volatile ring are facts about the
 *    DOCUMENT, so they are drawn wherever the document is drawn;
 *  · the marquee is a gesture in flight, so it is drawn in the window whose
 *    hand is making it, and nowhere else.
 */
interface LiveGesture {
  hoverId: string | null;
  hoverEdgeIdx: number | null;
  connect: ConnectDrag | null;
  insertBoundary: number | null;
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
}

interface GraphPaint {
  winId: string;
  cv: HTMLCanvasElement;
  mode: ViewKind;
  scene: Scene | null;
  vp: Viewport;
  /** the gesture in flight IN THIS window — `null` in every other */
  live: LiveGesture | null;
  /** this window's own minimap, or null while it has none yet */
  overview: OverviewApi | null;
}

function paintGraphWindow(p: GraphPaint): void {
  const { cv, scene: s, vp, live } = p;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 1;
  const h = cv.clientHeight || 1;
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const c = cv.getContext("2d");
  if (!c) return;
  if (!s) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    p.overview?.update(null, vp, w, h);
    return;
  }
  // Frame it the first time this window shows this document (so a new area never
  // opens on a blank patch of coordinates) — and RE-frame it when the area
  // changes size under a camera the user never touched. A camera aimed at a
  // full-width window and then squeezed into a quarter of it leaves the graph as
  // a speck in the corner: technically live, in practice an empty area.
  const key = viewportKey(p.winId, p.mode);
  const size = `${Math.round(w)}x${Math.round(h)}`;
  if (!framedViews.has(key)) {
    framedViews.add(key);
    vp.fit(sceneBounds(s), w, h);
    framedSizes.set(key, size);
  } else if (framedSizes.get(key) !== size && !touchedViews.has(key)) {
    vp.fit(sceneBounds(s), w, h);
    framedSizes.set(key, size);
  }
  const selectedEdgeIdx = selectedEdge
    ? s.edges.findIndex((se) => sameEdge(se.edge, selectedEdge!))
    : -1;
  render(
    c,
    s,
    vp,
    {
      hoverId: live?.hoverId ?? null,
      selectedId,
      selectedIds,
      edgeVisible,
      hoverEdgeIdx: live?.hoverEdgeIdx ?? null,
      selectedEdgeIdx,
      filterKey: "all",
      connect: live?.connect ?? null,
      // every graph window is an editor now; `editable` says so to the renderer
      editable: true,
      insertBoundary: live?.insertBoundary ?? null,
      monochrome,
      nameStatus, // NAME1: orange/red labels, one answer shared with the menu
      peerSelections: hubPeerSelections,   // P4.3 · awareness, never a lock
    },
    w,
    h,
  );
  p.overview?.update(s, vp, w, h);
  // selection overlay (screen space): a translucent wash + ring so the whole
  // multi-selection is unmistakable regardless of node colour. Active node is
  // bolder than the other selected ones (two-tier feedback). Drawn in EVERY
  // window: the selection is a fact about the graph, not about a gesture.
  if (selectedIds.size) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save();
    for (const id of selectedIds) {
      const sn = s.byId.get(id);
      // BUGFIX-PDG · a collapsed-to-tablet PDG has no box on the canvas — the
      // selection wash must NOT paint a phantom box at its layout rect (its
      // selection is the ring on the "PD" tablet, drawn by the renderer).
      if (!sn || sn.collapsed) continue;
      const x = sn.x * vp.scale + vp.x - 3;
      const y = sn.y * vp.scale + vp.y - 3;
      const bw = sn.w * vp.scale + 6;
      const bh = sn.h * vp.scale + 6;
      const active = id === selectedId;
      const th = canvasTheme();
      c.fillStyle = active ? th.selectWash : th.selectWashSoft;
      c.strokeStyle = active ? th.accent : th.selectSoft;
      c.lineWidth = active ? 3 : 2;
      c.fillRect(x, y, bw, bh);
      c.strokeRect(x, y, bw, bh);
    }
    c.restore();
  }
  // AUX2 volatile overlay (screen space): a dashed accent-blue ring around every
  // mapped-but-not-baked node, so a volatile node is unmistakable on the canvas
  // regardless of its own colour — the SAME state the EM-Data table paints blue
  // (single source of truth: the VOLATILE_KEY marker read via isVolatile).
  if (store) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save();
    c.strokeStyle = "#4c8dff";
    c.lineWidth = 2;
    c.setLineDash([6, 4]);
    for (const sn of s.nodes) {
      if (sn.collapsed || !isVolatile(store.node(sn.id))) continue;
      c.strokeRect(
        sn.x * vp.scale + vp.x - 3,
        sn.y * vp.scale + vp.y - 3,
        sn.w * vp.scale + 6,
        sn.h * vp.scale + 6,
      );
    }
    c.setLineDash([]);
    c.restore();
  }
  // …and the one thing that belongs to a HAND rather than to the document
  if (live?.marquee) {
    const m = live.marquee;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ax = m.x0 * vp.scale + vp.x;
    const ay = m.y0 * vp.scale + vp.y;
    const bx = m.x1 * vp.scale + vp.x;
    const by = m.y1 * vp.scale + vp.y;
    const rx = Math.min(ax, bx),
      ry = Math.min(ay, by),
      rw = Math.abs(bx - ax),
      rh = Math.abs(by - ay);
    c.save();
    c.fillStyle = canvasTheme().marqueeWash;
    c.strokeStyle = canvasTheme().accent;
    c.lineWidth = 1;
    c.setLineDash([4, 3]);
    c.fillRect(rx, ry, rw, rh);
    c.strokeRect(rx, ry, rw, rh);
    c.restore();
  }
}

/**
 * Repaint every graph window on screen.
 *
 * Kept under the name `draw()` because fifty-nine call sites in this file mean
 * exactly this — "the picture changed, show it" — and they were never about one
 * canvas. THE CALLER is where the focus is read, and reading it here is what
 * keeps `paintGraphWindow` free of it: the gesture state is module-wide because
 * there is one pointer (see `wireGraphCanvas`), so it belongs to one window, and
 * naming that window is a fact rather than a second drawing path.
 */
function draw(): void {
  const liveId = activeWin().id;
  const gesture: LiveGesture = {
    hoverId, hoverEdgeIdx, connect,
    insertBoundary: view === "matrix" ? hoverInsertBoundary : null,
    marquee,
  };
  for (const g of graphMounts()) {
    g.paint(g.winId === liveId ? gesture : null);
  }
}

function fit(): void {
  const s = scene();
  if (!s) return;
  const { w, h } = viewSize();
  viewport().fit(sceneBounds(s), w, h);
  draw();
}

function centerOn(nodeId: string): void {
  const s = scene();
  const n = s?.byId.get(nodeId);
  if (!n) return;
  const vp = viewport();
  const { w, h } = viewSize();
  vp.scale = Math.max(vp.scale, 0.8);
  vp.x = w / 2 - (n.x + n.w / 2) * vp.scale;
  vp.y = h / 2 - (n.y + n.h / 2) * vp.scale;
  draw();
}

/** Same document edge? Prefer id, else the (source, type, target) triple. */
function sameEdge(a: EmEdge, b: EmEdge): boolean {
  if (a.id && b.id) return a.id === b.id;
  return (
    a.source === b.source &&
    a.target === b.target &&
    a.edge_type === b.edge_type
  );
}

function select(nodeId: string | null): void {
  selectedId = nodeId;
  selectedIds = new Set(nodeId ? [nodeId] : []);
  selectedEdge = null; // node and connector selection are mutually exclusive
  refreshInspector();
  nodeList.setSelected(nodeId);
  draw();
  // mirror the selection to a connected peer (Blender), unless this
  // selection just arrived FROM the peer (avoid the echo loop)
  if (!applyingRemoteSelect) sync.sendSelect(nodeId, [...selectedIds]);
}

/** Index (into the current scene's edges) of the connector under a world point,
 *  within a scale-aware grab tolerance; -1 if none. Uses the SAME edgeVisible +
 *  filter the renderer draws with, so picking matches what is on screen. */
function pickEdgeAt(wx: number, wy: number): number {
  const s = scene();
  if (!s) return -1;
  const tol = 6 / viewport().scale; // ~6 screen px, easy to grab
  return edgeAt(
    s,
    { hoverId, selectedId, edgeVisible, filterKey: "all" },
    wx,
    wy,
    tol,
  );
}

/** Select a connector (edge). Clears any node selection so Delete/Backspace
 *  and the accent target the edge. Not mirrored to peers (nodes-only channel). */
function selectEdge(edge: EmEdge | null): void {
  selectedEdge = edge;
  if (edge) {
    selectedId = null;
    selectedIds = new Set();
    nodeList.setSelected(null);
  }
  refreshInspector();
  draw();
}

/** Shift/Cmd-click: toggle a node in the multi-selection (D3). */
function toggleSelect(nodeId: string): void {
  if (selectedIds.has(nodeId)) {
    selectedIds.delete(nodeId);
    if (selectedId === nodeId)
      selectedId = selectedIds.size ? [...selectedIds][selectedIds.size - 1] : null;
  } else {
    selectedIds.add(nodeId);
    selectedId = nodeId;
  }
  refreshInspector();
  nodeList.setSelected(selectedId);
  draw();
  if (!applyingRemoteSelect) sync.sendSelect(selectedId, [...selectedIds]);
}

/** Replace the selection with a set (marquee result). */
function selectMany(ids: string[]): void {
  selectedIds = new Set(ids);
  selectedId = ids.length ? ids[ids.length - 1] : null;
  refreshInspector();
  nodeList.setSelected(selectedId);
  draw();
  if (!applyingRemoteSelect) sync.sendSelect(selectedId, [...selectedIds]);
}

/**
 * Draw the inspector into ONE host — the half of `refreshInspector` that is
 * actually a drawing, split out so a window can have its own.
 *
 * Nothing inside changed: `renderInspector(root, …)` has taken its root since it
 * was written, and every callback below acts on the STORE the thing lives in,
 * not on a panel. That is why two live inspectors needed no new rules — the
 * panel never knew which one it was.
 */
function renderInspectorInto(host: HTMLElement): void {
  if (!store) {
    host.textContent = "";
    return;
  }
  // DAG · the inspector reads the store the SELECTION BELONGS TO. Clicking an
  // acquisition on the DTC canvas selects a node of the CORPUS, and a panel that
  // only ever looked at the study graph would answer "nothing selected" about a
  // node the user can see. One rule, no special case in the panel itself.
  const owning = storeOfNode(selectedId) ?? store;
  renderInspector(
    host,
    owning,
    selectedId,
    {
      onJump: (id) => {
        select(id);
        centerOn(id);
      },
      onClose: () => select(null),
      // DAG · act on the document the thing LIVES in: an acquisition deleted
      // from the DTC canvas is deleted from the corpus, and `store!` there would
      // have removed nothing while the panel closed as if it had.
      onDeleteNode: (id) => {
        (storeOfNode(id) ?? store!).deleteNode(id);
        select(null);
      },
      onDeleteEdge: (edge) => {
        // clear first so the store's onChange re-render doesn't paint a panel
        // for the edge we're removing
        if (selectedEdge && sameEdge(selectedEdge, edge)) selectedEdge = null;
        (storeOfEdge(edge) ?? store!).deleteEdge(edge);
      },
      onToggleFold: (gid) => requestFold(gid),
      onEnterGroup: enterGroup,
      onAddPhase: (epochId) => {
        const ph = store!.addPhase(epochId);
        select(ph.id);
        toast(`phase ${ph.name} created`);
      },
      onTogglePhases: (epochId) => {
        // epochId is the TOP-level epoch (the inspector resolves it); toggling
        // collapses/expands ALL of its phases & sub-phases at once.
        if (phasesCollapsed.has(epochId)) phasesCollapsed.delete(epochId);
        else phasesCollapsed.add(epochId);
        buildScenes();
        refreshInspector();
        draw();
      },
      isPhasesVisible: (epochId) => !phasesCollapsed.has(epochId),
      onDeletePhase: (phaseId) => promptDeletePhase(phaseId),
      onDeleteEpoch: (epochId) => promptDeleteEpoch(epochId),
      onReorderEpoch: (epochId, dir) => {
        // set the new lane order, then a from-sketch relayout re-lays out every
        // node into its lane (semantic) so phased lanes don't malform
        if (store!.reorderEpoch(epochId, dir))
          void runLayout(false).then(() => select(epochId));
      },
      onReorderPhase: (phaseId, dir) => {
        // Same shape as the epoch reorder: change the order, then a from-sketch
        // relayout so the sub-bands and their members follow. `reorderPhase`
        // refuses a dated phase (its date decides the stack), so a false here is
        // the model saying no, not a failure to report.
        if (store!.reorderPhase(phaseId, dir))
          void runLayout(false).then(() => select(phaseId));
      },
      onAssignEpoch: (nodeId, epochId) => {
        store!.setFirstEpoch([nodeId], epochId);
        // re-home + reflow are view-side, but a fresh em-core layout gives the
        // moved unit a clean position inside its new band
        void runLayout(false).then(() => {
          select(nodeId);
          toast(`moved to ${store!.node(epochId)?.name ?? "epoch"}`);
        });
      },
      onTogglePin: (nodeId) => {
        const pinning = !store!.isPinned(nodeId);
        // freeze the node's CURRENT scene position so the engine has an exact
        // Rect to hold, then pin.
        if (pinning) {
          const sn = scenes.matrix?.byId.get(nodeId);
          if (sn) {
            const layout = (store!.doc.layout ??= {});
            (layout.positions ??= {})[nodeId] = {
              x: sn.x,
              y: sn.y,
              w: sn.w,
              h: sn.h,
            };
          }
        }
        store!.setPinned([nodeId], pinning);
        toast(pinning ? "position locked" : "position unlocked");
      },
      isPinned: (nodeId) => store!.isPinned(nodeId),
      resolveAuthority: resolveAuthority,
      // «does a twin already exist for this?» — asked of the Catalog's twin
      // register. Passed through unchanged: `searchTwins` is already total (any
      // failure resolves to NO_REGISTER), and the panel says «no register
      // answered», which is not the same sentence as «there is none».
      searchTwins: (term) => searchTwins(term),
      onCommand: (verb, target) => sendHostCommand(verb, target),
      // DOCUMENTATION → SHELF · the study's explicit selection. The locator is
      // the asset's own url (a room asset endpoint, or a path for a reference),
      // and the digest travels with it: the shelf deduplicates on CONTENT, so
      // the same file chosen twice is one entry.
      onAddToShelf: (nodeId) => {
        const node = storeOfNode(nodeId)?.node(nodeId);
        if (!node) return;
        const data = (node.data ?? {}) as Record<string, unknown>;
        const entry = addToShelf({
          locator: String(data.url ?? ""),
          name: node.name || nodeId,
          checksum: typeof data.checksum === "string" ? data.checksum : undefined,
          scope: (typeof data.scope === "string" ? data.scope : "own-study") as ShelfScope,
          residency: (data.residency === "reference" ? "reference" : "resident"),
        });
        renderShelf();
        refreshInspector();
        toast(t("shelf.added", { name: entry.name }));
      },
      isOnShelf: (nodeId) => {
        const node = storeOfNode(nodeId)?.node(nodeId);
        const digest = String(((node?.data ?? {}) as Record<string, unknown>).checksum ?? "");
        if (!node) return false;
        return shelfEntries().some(
          (e) => (digest && e.checksum === digest) || e.name === node.name);
      },
      commandsBlocked: commandsBlockedReason,
      onClearField: (nodeId, field) => {
        (storeOfNode(nodeId) ?? store!).clearField(nodeId, field);
        refreshInspector();
        buildScenes();
        draw();
      },
    },
    selectedEdge,
  );
}

/**
 * "Repaint the inspector", as forty call sites in this file still spell it —
 * and now every live one.
 *
 * The two lines that are NOT the inspector stay here, where they always were:
 * the preview and the annotator answer the same question it does ("what am I
 * looking at?"), so they are repainted with it.
 */
function refreshInspector(): void {
  renderViewer();
  renderAnnotator();
  refreshSurfaces("inspector");
}

// HDT-O authority autocomplete → em-bridge /resolve-authority (P1-D, offline).
// Fully graceful: any non-200 / 501 / network error yields [] so the inspector
// falls back to plain free-text URI entry.
async function resolveAuthority(
  term: string,
  facet: string,
): Promise<import("./types").AuthorityCandidate[]> {
  if (!term.trim()) return [];
  try {
    const url = `${await bridgeUrl()}/resolve-authority?term=${encodeURIComponent(
      term,
    )}&facet=${encodeURIComponent(facet)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = (await res.json()) as { candidates?: unknown };
    return Array.isArray(j.candidates)
      ? (j.candidates as import("./types").AuthorityCandidate[])
      : [];
  } catch {
    return [];
  }
}

// Delete a phase, first asking where to re-home the units attributed to it (and
// any sub-phases): the parent epoch (un-phase them) or an adjacent sibling
// phase. When the phase is empty we skip the prompt and delete outright.
function promptDeletePhase(phaseId: string): void {
  if (!store) return;
  const parent = store.parentEpoch(phaseId);
  const { units, subPhases } = store.phaseOrphans(phaseId);
  const orphanN = units.length + subPhases.length;
  const phaseName = store.node(phaseId)?.name || "phase";
  const finishDelete = (reassignTo: string): void => {
    store!.deletePhase(phaseId, reassignTo);
    // a phase deletion is a structural change: regenerate the em-core layout
    // (from-sketch) so the dropped phase's swimlane is gone and its re-homed
    // units are laid out under their new epoch, then redraw.
    void runLayout(false).then(() => {
      select(parent);
      toast(`deleted ${phaseName}`);
    });
  };
  // nothing to re-home → delete straight away (parent is the natural fallback)
  if (orphanN === 0) {
    finishDelete(parent ?? phaseId);
    return;
  }
  // build the candidate targets: parent epoch + prev/next sibling phase (by time)
  const startOf = (id: string): number => {
    const v = Number((store!.node(id)?.data as Record<string, unknown>)?.start_time);
    return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
  };
  const targets: { id: string; label: string; hint: string }[] = [];
  if (parent)
    targets.push({
      id: parent,
      label: `${store.node(parent)?.name || "parent epoch"}`,
      hint: "un-phase — units go to the epoch itself",
    });
  if (parent) {
    const sibs = store
      .epochPhases(parent)
      .filter((s) => s !== phaseId)
      .sort((a, b) => startOf(a) - startOf(b));
    const s0 = startOf(phaseId);
    const prev = [...sibs].reverse().find((s) => startOf(s) <= s0);
    const next = sibs.find((s) => startOf(s) >= s0);
    if (prev)
      targets.push({
        id: prev,
        label: store.node(prev)?.name || "previous phase",
        hint: "previous phase",
      });
    if (next && next !== prev)
      targets.push({
        id: next,
        label: store.node(next)?.name || "next phase",
        hint: "next phase",
      });
  }
  if (!targets.length) {
    finishDelete(phaseId);
    return;
  }
  const modal = document.createElement("div");
  modal.className = "modal";
  const card = document.createElement("div");
  card.className = "modal-card";
  const parts = units.length
    ? `${units.length} unit${units.length > 1 ? "s" : ""}`
    : "";
  const parts2 = subPhases.length
    ? `${subPhases.length} sub-phase${subPhases.length > 1 ? "s" : ""}`
    : "";
  const what = [parts, parts2].filter(Boolean).join(" + ");
  card.innerHTML =
    `<div class="modal-head"><span>Delete “${phaseName}”</span></div>` +
    `<div class="modal-body">` +
    `<p>This phase holds <b>${what}</b>. Where should ${
      orphanN > 1 ? "they" : "it"
    } move?</p>` +
    `</div>` +
    `<div class="modal-foot"></div>`;
  const foot = card.querySelector(".modal-foot") as HTMLElement;
  const close = (): void => {
    modal.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = close;
  foot.appendChild(cancel);
  targets.forEach((t, i) => {
    const b = document.createElement("button");
    if (i === 0) b.className = "primary";
    b.textContent = `→ ${t.label}`;
    b.title = t.hint;
    b.onclick = () => {
      close();
      finishDelete(t.id);
    };
    foot.appendChild(b);
  });
  modal.appendChild(card);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(modal);
}

/**
 * SPELL1 · «Uniforma le grafie». The count first — how many edges, under which
 * spellings, how many are exact duplicates of a canonical edge — then one
 * gesture that the store applies as ONE undo step and emits as ordinary
 * `delete_edge` / `add_edge` operations (so a room sees it like any other edit).
 * The plan shown is the plan applied: both come from `planUniformSpellings`.
 */
function promptUniformSpellings(): void {
  const target = store;
  if (!target) return;
  const plan = target.spellingPlan();
  if (!plan.steps.length) {
    toast(t("menu.noOldSpellings"));
    return;
  }
  const before = target.liveEdges().length;
  const after = before - plan.duplicates - plan.reversed;
  const modal = document.createElement("div");
  modal.className = "modal";
  const card = document.createElement("div");
  card.className = "modal-card";
  const head = document.createElement("div");
  head.className = "modal-head";
  head.textContent = t("spell.title");
  const body = document.createElement("div");
  body.className = "modal-body";
  const intro = document.createElement("p");
  intro.textContent = t("spell.intro", { n: plan.steps.length });
  body.appendChild(intro);
  const spellings = document.createElement("ul");
  for (const [old, n] of Object.entries(plan.bySpelling)) {
    const li = document.createElement("li");
    li.innerHTML = `<code>${escapeHtml(old)}</code> → <code>${escapeHtml(
      canonicalEdgeType(old))}</code>: <b>${n}</b>`;
    spellings.appendChild(li);
  }
  body.appendChild(spellings);
  const kinds = document.createElement("ul");
  for (const [key, n] of [
    ["spell.duplicates", plan.duplicates],
    ["spell.reversed", plan.reversed],
    ["spell.respelled", plan.respelled],
  ] as const) {
    if (!n) continue;
    const li = document.createElement("li");
    li.textContent = t(key, { n });
    kinds.appendChild(li);
  }
  body.appendChild(kinds);
  const tail = document.createElement("p");
  tail.textContent = t("spell.after", { before, after });
  body.appendChild(tail);
  if (sync.room) {
    const room = document.createElement("p");
    room.textContent = t("spell.room");
    body.appendChild(room);
  }
  const foot = document.createElement("div");
  foot.className = "modal-foot";
  card.append(head, body, foot);
  const close = (): void => {
    modal.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  const cancel = document.createElement("button");
  cancel.textContent = t("common.cancel");
  cancel.onclick = close;
  const apply = document.createElement("button");
  apply.className = "primary";
  apply.textContent = t("spell.apply");
  apply.onclick = () => {
    close();
    if (store !== target) return; // the graph changed under the dialog
    const done = target.uniformSpellings();
    toast(t("spell.done", {
      removed: done.duplicates + done.reversed,
      respelled: done.respelled,
    }));
  };
  foot.append(cancel, apply);
  modal.appendChild(card);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(modal);
}

function promptDeleteEpoch(epochId: string): void {
  if (!store) return;
  const name = store.node(epochId)?.name || "epoch";
  const { units, phases } = store.epochDeletionImpact(epochId);
  const finishDelete = (): void => {
    store!.deleteEpoch(epochId);
    // structural change (lanes/PDGs removed): regenerate the em-core layout so
    // no phantom lane lingers, then clear the selection.
    void runLayout(false).then(() => {
      select(null);
      toast(`deleted ${name}`);
    });
  };
  // empty epoch → delete straight away
  if (units === 0 && phases === 0) {
    finishDelete();
    return;
  }
  const modal = document.createElement("div");
  modal.className = "modal";
  const card = document.createElement("div");
  card.className = "modal-card";
  const parts = [
    phases ? `${phases} phase${phases > 1 ? "s" : ""} (deleted)` : "",
    units
      ? `${units} unit${units > 1 ? "s" : ""} (kept, un-attributed)`
      : "",
  ].filter(Boolean);
  card.innerHTML =
    `<div class="modal-head"><span>Delete “${name}”</span></div>` +
    `<div class="modal-body"><p>This epoch holds <b>${parts.join(
      " + ",
    )}</b>. Sub-phases are removed; units are kept but lose their epoch. Continue?</p></div>` +
    `<div class="modal-foot"></div>`;
  const foot = card.querySelector(".modal-foot") as HTMLElement;
  const close = (): void => {
    modal.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = close;
  foot.appendChild(cancel);
  const del = document.createElement("button");
  del.className = "primary";
  del.textContent = "Delete epoch";
  del.onclick = () => {
    close();
    finishDelete();
  };
  foot.appendChild(del);
  modal.appendChild(card);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(modal);
}

/**
 * The connector legend — WHAT THE EDGES MEAN, drawn into a Graph window's own
 * resources panel.
 *
 * STEP A moved it here from a singleton `#legend` in the app-wide column. It was
 * appearing under the NARRATIVE panel too, where it explains nothing: a story
 * has no edges on screen. It belongs where edges are drawn, so it is part of the
 * graph provider's offer and of nothing else.
 */
function renderLegendInto(host: HTMLElement): void {
  const s = scene();
  if (!s) return;
  const types = new Set<string>();
  for (const e of s.edges) types.add(e.edge.edge_type ?? "edge");
  if (!types.size) return;
  const box = document.createElement("div");
  box.className = "win-legend";
  const head = document.createElement("div");
  head.className = "pal-sect";
  head.textContent = "Relations";
  box.appendChild(head);
  for (const t of [...types].sort()) {
    const st = edgeStyle(t);
    const item = document.createElement("span");
    item.className = "legend-item";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.borderBottomColor = st.color;
    sw.style.borderBottomStyle = st.dash.length ? "dashed" : "solid";
    item.appendChild(sw);
    item.appendChild(document.createTextNode(st.label));
    box.appendChild(item);
  }
  host.appendChild(box);
}

/** The scene changed, so the edge types on screen may have: repaint the panels
 *  that show them. */
function updateLegend(): void {
  renderResourcePanels();
}

function updateToolbar(): void {
  btnUndo.disabled = !undoStore()?.canUndo;
  btnRedo.disabled = !undoStore()?.canRedo;
  dirtyDot.classList.toggle("hidden", !store?.dirty);
  // POL1: the two canvas overlays that only mean something with a document.
  // The filter panel filters nothing without a graph, and an enabled control that
  // does nothing is a worse answer than an absent one; the epoch "+" belongs to
  // Matrix, which is the EM mode.
  btnAddEpoch.classList.toggle("hidden", !store || view !== "matrix");
  refreshFunnel();
  if (!store && filterPanelOpen()) closeFilterPanel();
  paintColumnToggles(); // the right handle appears with the side panel
  updateWindowTitle();
}

// On desktop, reflect the open file + dirty state in the OS window title
// (e.g. "TempluMare.em.json ● — EMStudio"). No-op in a browser.
function updateWindowTitle(): void {
  if (!isTauri()) return;
  let title = "EMStudio";
  if (store) {
    const g = store.doc.graph;
    const name = currentFilePath
      ? baseName(currentFilePath)
      : String(g["name"] ?? g.graph_id ?? "untitled");
    title = `${name}${store.dirty ? " ●" : ""} — EMStudio`;
  }
  void setWindowTitle(title);
}

function updateBreadcrumb(): void {
  if (!inContext() || !store) {
    breadcrumb.classList.add("hidden");
    breadcrumb.innerHTML = "";
    return;
  }
  breadcrumb.innerHTML = "";
  const mk = (label: string, depth: number): void => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", () => {
      contextStack = contextStack.slice(0, depth);
      rebuildContext();
    });
    breadcrumb.appendChild(b);
    if (depth < contextStack.length) {
      breadcrumb.appendChild(document.createTextNode(" ▸ "));
    }
  };
  mk("Canvas", 0);
  contextStack.forEach((gid, i) => {
    const g = store!.node(gid);
    mk(String(g?.name || gid), i + 1);
  });
  breadcrumb.classList.remove("hidden");
}

function enterGroup(groupId: string): void {
  contextStack.push(groupId);
  rebuildContext();
}

// PD1 · toggle a group's fold, but REFUSE to collapse a ParadataNodeGroup that
// has no referent (no `has_paradata_nodegroup` pointing at it): a collapsed PDG
// becomes a tablet ON its referent, so without one the decorator would float
// orphaned. Every other group, and un-folding, passes straight through.
function requestFold(groupId: string): void {
  if (!store) return;
  const folding = !store.isFolded(groupId);
  const node = store.doc.graph.nodes.find((n) => n.id === groupId);
  if (folding && node?.node_type === "ParadataNodeGroup") {
    const hasReferent = store.doc.graph.edges.some(
      (e) => e.edge_type === "has_paradata_nodegroup" && e.target === groupId,
    );
    if (!hasReferent) {
      toast(t("toast.pdgNotLinked"));
      return;
    }
  }
  store.setFolded(groupId, folding);
}

// A context id is either a group (→ its members) or a DTC-output Resource (→ its
// upstream DTC genesis). Pick the right scene builder, reusing the same fold.
function contextSceneFor(id: string): Scene | null {
  if (!store) return null;
  const n = store.node(id);
  if (n && isGroupType(n.node_type)) return buildGroupScene(store.doc, id);
  return buildDtcGenesisScene(store.doc, id);
}

/** The DTC-output Resource reachable from a double-clicked node, or null:
 *  the node itself when it IS a DTC output (target of dtc_had_output), else the
 *  Resource it references via has_linked_resource (the RM / Document facet). */
function resolveDtcResource(nodeId: string): string | null {
  if (!store) return null;
  const edges = store.doc.graph.edges;
  const isDtcOutput = (id: string): boolean =>
    edges.some((e) => e.edge_type === "dtc_had_output" && e.target === id);
  if (isDtcOutput(nodeId)) return nodeId;
  for (const e of edges)
    if (e.edge_type === "has_linked_resource" && e.source === nodeId && isDtcOutput(e.target))
      return e.target;
  return null;
}

function rebuildContext(): void {
  if (!store) return;
  select(null);
  hoverId = null;
  contextScene = inContext()
    ? contextSceneFor(contextStack[contextStack.length - 1])
    : null;
  updateBreadcrumb();
  updateLegend();
  fit();
}

function updateInfo(): void {
  if (!store) return;
  const g = store.doc.graph;
  const lanes = scenes.matrix?.lanes.length ?? 0;
  const title =
    (g["name"] as string | undefined) ??
    (store.doc.header?.["name"] as string | undefined) ??
    g.graph_id ??
    "untitled";
  // P4.5 · count what is THERE, not what the file still remembers. A removal
  // leaves a tombstone in the document (the merge needs it), so after somebody
  // else deletes a node the raw length is one MORE than what anybody can see —
  // and a status bar that disagrees with the canvas is a status bar nobody
  // trusts. The buried ones are named separately when there are any, because
  // they are still in the file that gets saved.
  const liveNodeCount = store.liveNodes().length;
  const liveEdgeCount = store.liveEdges().length;
  const buried = g.nodes.length - liveNodeCount;
  info.textContent =
    `${title} — ${liveNodeCount} nodes, ${liveEdgeCount} edges` +
    (lanes ? `, ${lanes} epochs` : "") +
    (buried > 0 ? ` (+${buried} deleted)` : "");
}

// The visible subgraph after folding + the "circles of detail" filter — one
// filtered view shared by every projection. Structural nodes/edges (containers,
// epoch, membership) are never filtered (see filters.ts).
//
// MULTIGRAPH · `wholeGraph` is the mode that says "show me everything hanging
// off this graph": it keeps the graph-scope / HDT-O layer (the GraphNode and its
// paradata group carrying author, licence, embargo, site position) and leaves
// every ornament a real node instead of a badge. The rings still apply on top —
// they simply all start on in that view — so this is one filter with a switch,
// not a second, divergible reader.
function filteredView(opts: { wholeGraph?: boolean } = {}): {
  nodes: EmDocument["graph"]["nodes"];
  edges: EmDocument["graph"]["edges"];
  badges: Map<string, number>;
  adornments: Map<string, AdornmentBadge[]>;
} {
  const doc = store!.doc;
  const wholeGraph = !!opts.wholeGraph;
  const folded = new Set(doc.layout?.folded_groups ?? []);
  const foldedView = folded.size
    ? applyFolding(doc, buildMembership(doc), folded)
    : undefined;
  let vNodes = foldedView?.nodes ?? doc.graph.nodes;
  let vEdges = foldedView?.edges ?? doc.graph.edges;
  // P4.1 · a TOMBSTONED node is deleted, and a view must not show it. The mark
  // stays in the document (the merge needs it: "deleted" and "not yet known to
  // you" are different states), so the hiding happens HERE — at the one place
  // that decides what is on screen — and nowhere else.
  if (vNodes.some((n) => isRemoved(n as unknown as Record<string, unknown>))) {
    const dead = new Set(
      vNodes.filter((n) => isRemoved(n as unknown as Record<string, unknown>))
        .map((n) => n.id));
    vNodes = vNodes.filter((n) => !dead.has(n.id));
    vEdges = vEdges.filter((e) => !dead.has(e.source) && !dead.has(e.target));
  }
  // ALWAYS drop HDT-O-profile nodes (and any node the panel tagged with
  // data.hdto_role) + their incident edges, so graph-level HDT-O metadata never
  // clutters the stratigraphic canvas. The nodes remain in em.json (single
  // source of truth) — only rendering is filtered.
  const isHdto = (n: EmDocument["graph"]["nodes"][number]): boolean =>
    HDTO_HIDDEN_TYPES.has(n.node_type) ||
    !!(n.data as Record<string, unknown> | undefined)?.hdto_role;
  if (!wholeGraph && vNodes.some(isHdto)) {
    vNodes = vNodes.filter((n) => !isHdto(n));
    const keep = new Set(vNodes.map((n) => n.id));
    vEdges = vEdges.filter((e) => keep.has(e.source) && keep.has(e.target));
  }
  // an epoch's temporal ParadataNodeGroup is a structural part of the epoch
  // (its chronology container), NOT regular paradata clutter — so it is always
  // visible, exempt from the "Paradata nodes" ring toggle.
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const epochPdg = new Set<string>();
  for (const e of doc.graph.edges)
    if (
      e.edge_type === "has_paradata_nodegroup" &&
      classOf(byId.get(e.source)?.node_type) === "EpochNode"
    )
      epochPdg.add(e.target);
  if (hiddenNodeTypes.size || hiddenEdgeTypes.size) {
    vNodes = vNodes.filter(
      (n) => epochPdg.has(n.id) || !hiddenNodeTypes.has(n.node_type),
    );
    // drop group containers left with NO visible member (else hollow boxes);
    // keep genuinely-empty authored groups.
    const mm = buildMembership(doc);
    let vis = new Set(vNodes.map((n) => n.id));
    vNodes = vNodes.filter((n) => {
      if (!isGroupType(n.node_type)) return true;
      // a FOLDED group intentionally hides its members but must still render as
      // a closed box, so never drop it as "hollow"
      if (folded.has(n.id)) return true;
      // epoch temporal paradata box: always kept (structural, custom-rendered)
      if (epochPdg.has(n.id)) return true;
      const kids = [...(mm.childrenOf.get(n.id) ?? [])];
      return kids.length === 0 || kids.some((c) => vis.has(c));
    });
    vis = new Set(vNodes.map((n) => n.id));
    vEdges = vEdges.filter(
      (e) =>
        !hiddenEdgeTypes.has(e.edge_type ?? "") &&
        vis.has(e.source) &&
        vis.has(e.target),
    );
  }
  // BADGE1 · collapse ornament nodes (author/license/embargo) into badges on
  // their referent. Resolved from the FULL document edges (the ornament edges are
  // hidden by the `edges_author` ring, so the filtered edge list can't resolve
  // them), but only for ornament nodes still present in vNodes — so the
  // `authors_licenses` node ring, which drops those nodes above, turns the badges
  // off with them. The ornament nodes and their edges are then removed from the
  // VIEW (never a box, never an edge); em.json keeps both.
  const visibleIds = new Set(vNodes.map((n) => n.id));
  const adornments = adornmentBadges(vNodes, doc.graph.edges, visibleIds);
  // FUNNEL1 · add an ATTENUATED badge for each author/license/embargo a node does
  // NOT declare itself but INHERITS down the funnel (activity/epoch/canvas). The
  // node's own (explicit) badges are already present from adornmentBadges. This
  // resolves per node — em.json is untouched (nothing materialised).
  const normRule = (kind: string): string =>
    kind === "author_ai" ? "author" : kind;
  for (const n of vNodes) {
    if (!isStratigraphicType(n.node_type)) continue;
    const own = new Set((adornments.get(n.id) ?? []).map((b) => normRule(b.kind)));
    for (const rule of BADGE_RULES) {
      if (own.has(rule)) continue; // declared on the node → explicit badge exists
      const eff = resolveEffective(doc, n.id, rule);
      if (eff.value == null || eff.explicit) continue;
      const arr = adornments.get(n.id) ?? [];
      arr.push({ ornamentId: "", kind: rule, label: `${eff.value} · ${sourceLabel(eff.source)}`, inherited: true });
      adornments.set(n.id, arr);
    }
  }
  // BUGS-UI · the badge is a PREVIEW, not a replacement. An ornament that is a
  // MEMBER of a paradata group stays a REAL node inside that group — it is
  // paradata like the qualia beside it — so it can be seen, selected and
  // edited; only ornaments floating loose on the canvas collapse into their
  // badge (which is what BADGE1 was actually after: no stray box + edge next to
  // every node). The membership edge keeps drawing; the semantic
  // `has_author`/… edge stays folded into the badge either way.
  const pdgMembers = new Set<string>();
  for (const e of doc.graph.edges)
    if (e.edge_type === "is_in_paradata_nodegroup") pdgMembers.add(e.source);
  if (!wholeGraph) {
    vNodes = vNodes.filter(
      (n) => !isAdornmentNodeType(n.node_type) || pdgMembers.has(n.id),
    );
    vEdges = vEdges.filter((e) => !ADORNMENT_EDGE_TYPES.has(e.edge_type ?? ""));
  }
  // 1.6.20 · one line per RELATION: a pair written with both spellings
  // (`bonded_to` + `is_bonded_to`, `equals` + `is_physically_equal_to`) is one
  // bond, drawn once. The document keeps both edges; only the view collapses.
  vEdges = collapseSpellings(vEdges);
  return {
    nodes: vNodes,
    edges: vEdges,
    badges: foldedView?.badges ?? new Map<string, number>(),
    adornments,
  };
}

/** Top-level epochs that have at least one phase in their subtree. */
function phasedTopEpochs(): Set<string> {
  const parent = new Map<string, string>();
  for (const e of store!.doc.graph.edges)
    if (e.edge_type === "has_sub_epoch") parent.set(e.target, e.source);
  const topOf = (id: string): string => {
    let c = id;
    const seen = new Set<string>();
    while (parent.has(c) && !seen.has(c)) {
      seen.add(c);
      c = parent.get(c)!;
    }
    return c;
  };
  const tops = new Set<string>();
  for (const ph of parent.keys()) tops.add(topOf(ph));
  return tops;
}

function buildScenes(): void {
  if (!store) return;
  const doc = store.doc;
  const fview = filteredView();
  // Phase bands show BY DEFAULT for every phased epoch, except those the user
  // collapsed — so a freshly created phase is visible with no extra click.
  const phasesVisible = new Set(
    [...phasedTopEpochs()].filter((id) => !phasesCollapsed.has(id)),
  );
  // epochs/phases with a chronology-coherence conflict → warning marker
  const warnIds = new Set<string>();
  for (const n of doc.graph.nodes)
    if (
      n.node_type === "EpochNode" &&
      store.epochCoherenceWarnings(n.id).length > 0
    )
      warnIds.add(n.id);
  scenes.matrix = buildMatrixScene(
    doc,
    fview,
    matrixViewLayout ?? undefined,
    phasesVisible,
    warnIds,
  );
  scenes.graph = buildGraphScene(doc, fview, {
    algorithm: graphAlgorithm,
    overrides: graphOverrides,
  });
  // DAG · the DTC projection reads the **corpus** — the documentation member —
  // and not the study graph.
  //
  // This is the sentence the whole separation was for. A provenance forest drawn
  // inside a stratigraphic matrix had to borrow the matrix's rules (one parent,
  // one lane per epoch) to be drawn at all, and an orthophoto made from two
  // flights cannot be drawn that way: it is ONE node with TWO inputs. The corpus
  // is its own member precisely so the picture can be a DAG.
  //
  // The fall-back is not a courtesy: a project written before the corpus existed
  // has its DTC chunks inside the study graph, and its DTC view must keep
  // showing them. So the source is the corpus WHEN THERE IS SOMETHING IN IT, and
  // the filtered study view otherwise.
  const corpusForView = documentationCorpus({ create: false });
  const corpusNodes = corpusForView?.liveNodes() ?? [];
  // ── an asset is selected: the NODE's answer REPLACES the picture ───────────
  //
  // Replaces, and does not highlight — and the reason is not that the screen
  // cannot take it. **They are two different documents.** The corpus lives on
  // the node; the nodes of that chain do not exist inside the study document at
  // all, and a highlight only means something inside ONE graph. So the window
  // shows the answer and says whose it is (`dtcNote`), rather than pretending
  // the two pictures are one.
  const neighbour = dtcNeighbourhood.status === "answered"
    ? adaptNeighbourhood(dtcNeighbourhood.answer) : null;
  // DTCEMS1 · IL DISCO VIENE PRIMA quando ha risolto, e non per velocità: quel
  // timbro è stato accettato perché l'impronta di QUESTI byte è quella che
  // dichiara, qui e adesso. La risposta del nodo è più ricca ma parla di un
  // digest, non di un file — e le due cose smettono di coincidere nel momento
  // esatto in cui qualcuno riesporta sopra, che è il caso per cui la notte
  // esiste.
  const fromDisk = diskStamps.status === "stamped" ? diskStamps.scene : null;
  // DTCEMS2 · LA BOZZA VIENE PRIMA DI TUTTO mentre la si compone, perché è la
  // cosa su cui si sta agendo. Non è una gerarchia di verità — la bozza non è
  // vera per niente, e il renderer la disegna attenuata: è che chi compone deve
  // vedere quello che sta componendo.
  const draftScene = stampDraft ? adaptDraft(stampDraft) : null;
  const dtcSource = draftScene ? "stamps" : fromDisk ? "stamps"
    : neighbour ? "neighbourhood"
    : corpusNodes.length ? "corpus" : "study";
  scenes.dtc = draftScene
    ? buildDtcScene(draftScene.nodes, draftScene.edges, dtcOverrides)
    : fromDisk
    ? buildDtcScene(fromDisk.nodes, fromDisk.edges, dtcOverrides)
    : neighbour
    ? buildDtcScene(neighbour.nodes, neighbour.edges, dtcOverrides)
    : corpusNodes.length
    ? buildDtcScene(corpusNodes, corpusForView!.liveEdges(), dtcOverrides)
    : buildDtcScene(fview.nodes, fview.edges, dtcOverrides);
  // …and when the SOURCE changes (a project with a corpus opens, or its first
  // documentation arrives), the DTC view is framed again: the camera it was left
  // with belonged to a different picture, and opening a DAG at 300% zoom on a
  // corner of it is not "where you were".
  if (dtcSource !== lastDtcSource) {
    lastDtcSource = dtcSource;
    for (const key of [...framedViews]) if (key.endsWith(":dtc")) framedViews.delete(key);
  }
  // MULTIGRAPH · the same layered projection as Graph, over the WHOLE view:
  // ornaments as nodes and the graph-scope layer included, so author, licence,
  // embargo and the site position are visible and selectable (and therefore
  // editable in the Inspector) instead of living only in a side panel.
  scenes.multigraph = buildGraphScene(doc, filteredView({ wholeGraph: true }), {
    algorithm: graphAlgorithm,
    overrides: multigraphOverrides,
  });
  updateChronoBanner();
}

// ---- chronology validation banner (item 10) ----
// A dismissible strip above the canvas, shown in Matrix view when the lane
// stack doesn't follow newest-first chronology (offers a one-click sort) or
// adjacent epochs overlap / leave gaps (advisory). Document state, not
// selection state — so it lives above the canvas, not in the inspector.
let chronoBannerDismissed = false;
let chronoBannerExpanded = false;

function updateChronoBanner(): void {
  if (!store || view !== "matrix") {
    chronoBanner.classList.add("hidden");
    return;
  }
  const orderOk = store.lanesMatchDateOrder();
  const issues = store.chronologyIssues();
  if (chronoBannerDismissed || (orderOk && issues.length === 0)) {
    chronoBanner.classList.add("hidden");
    return;
  }
  chronoBanner.replaceChildren();

  const row = document.createElement("div");
  row.className = "cb-row";

  const msg = document.createElement("span");
  msg.className = "cb-msg";
  msg.append("⚠ ");
  if (!orderOk) {
    const b = document.createElement("b");
    b.textContent = "Lane fuori ordine cronologico.";
    msg.appendChild(b);
  } else if (issues.length) {
    msg.append("Problemi di coerenza cronologica.");
  }
  row.appendChild(msg);

  if (issues.length) {
    const n = issues.length;
    const toggle = document.createElement("button");
    toggle.className = "cb-toggle";
    toggle.textContent = `${chronoBannerExpanded ? "▾" : "▸"} ${n} problem${
      n === 1 ? "a" : "i"
    }`;
    toggle.addEventListener("click", () => {
      chronoBannerExpanded = !chronoBannerExpanded;
      updateChronoBanner();
    });
    row.appendChild(toggle);
  }

  if (!orderOk) {
    const sort = document.createElement("button");
    sort.className = "cb-sort";
    sort.textContent = "Ordina lane per data";
    sort.title = t("epoch.sortTitle");
    sort.addEventListener("click", () => {
      store!.sortLanesByDate();
      void runLayout(false).then(() => {
        buildScenes();
        fit();
      });
    });
    row.appendChild(sort);
  }

  const close = document.createElement("button");
  close.className = "cb-close";
  close.textContent = "✕";
  close.title = "Nascondi";
  close.addEventListener("click", () => {
    chronoBannerDismissed = true;
    chronoBanner.classList.add("hidden");
  });
  row.appendChild(close);
  chronoBanner.appendChild(row);

  if (issues.length && chronoBannerExpanded) {
    const list = document.createElement("ul");
    list.className = "cb-details";
    for (const w of issues) {
      const li = document.createElement("li");
      li.textContent = w;
      list.appendChild(li);
    }
    chronoBanner.appendChild(list);
  }

  chronoBanner.classList.remove("hidden");
}

// Recompute the Matrix VIEW layout (em-core on the visible subgraph) so the
// Matrix recompacts under a filter; clears it when nothing is hidden. Async
// (WASM); rebuilds + redraws when done. Matrix-only.
// True when the Matrix filter is TIGHTER than its per-view default (the user
// actively hid a ring that's on by default) — only then do we recompact, so
// the default Matrix keeps the archival em-core layout and pays no WASM cost.
function matrixTighterThanDefault(): boolean {
  const def = defaultVisibleCircles("matrix");
  const cur = circleState.matrix;
  return [...def].some((k) => !cur.has(k));
}
async function refreshMatrixViewLayout(): Promise<void> {
  if (!store) return;
  const filtered = matrixTighterThanDefault();
  if (!filtered) {
    if (matrixViewLayout !== null) {
      matrixViewLayout = null;
      buildScenes();
      draw();
    }
    return;
  }
  const v = filteredView();
  const doc = store.doc;
  try {
    const { computeLayout } = await import("./emcore");
    const subGraph = {
      ...doc.graph,
      nodes: v.nodes,
      edges: v.edges,
    } as EmDocument["graph"];
    // seed with the archival layout (From-Sketch) so kept nodes barely move
    matrixViewLayout = await computeLayout(subGraph, doc.layout ?? undefined);
  } catch {
    matrixViewLayout = null; // fall back to archival on failure
  }
  buildScenes();
  draw();
}

/**
 * DP-82 · the ONE point that decides what the central area shows. `view` +
 * `narrativeOpen` collapsed into this: matrix/graph route to the canvas
 * projection (`applyCanvasView`), narrative shows the story overlay. Exactly one
 * mode is active at a time. A future `table`/`dtc` mode adds a token to
 * `CentralMode` and a branch HERE — the single extension seam.
 */
function setMode(m: CentralMode): void {
  centralMode = m;
  // One selector segment active at a time — derived from CENTRAL_MODES, so a new
  // mode needs no new toggle line here.
  for (const mode of CENTRAL_MODES)
    MODE_BUTTONS[mode]?.classList.toggle("active", mode === m);
  // WIN2 · the mode belongs to the WINDOW and never moves the leader chip: the
  // workspace changes only when the user picks one. A Canvas workspace showing
  // DTC is a legitimate arrangement.
  const win = activeWin();
  if (win.type === "graph") setWinMode(win, m);
  updateWindowHeader();
  // WIN5 · entering a CANVAS mode also puts the canvas back in front: the other
  // surfaces belong to their window types, not to a mode.
  // HDR1 · the "Edit" affordance does NOT come back to the master header here.
  // Writing is a mode of a NARRATIVE WINDOW (the ✎ toggle in that window's
  // header, `buildAreaHeader`), and the master header belongs to no window — an
  // Edit button there could not say which narrative it edited. The element below
  // stays in the DOM, permanently hidden, as the handler owner: same arrangement
  // as #btn-fit / #btn-layout / #graph-layout, which the window header mirrors.
  applyCanvasView(m); // a central mode IS a canvas projection now
}

/** A canvas view IS a central mode — back-compat entry for the many callers that
 *  ask for a specific canvas projection (viewState restore, boot, drops). */
function setView(v: ViewKind): void {
  setMode(v);
}

/** WIN2 · the view a LOADED document asks for. An arriving document must not
 *  seize the window's mode: a graph window left in DTC keeps showing the DTC
 *  projection of whatever is opened next — that is what makes the mode belong to
 *  the window. Only the two stratigraphic projections trade places on load. */
function setViewOnLoad(v: ViewKind): void {
  const win = activeWin();
  if (win.type === "graph" && winMode(win) === "dtc") {
    setMode("dtc");
    return;
  }
  setView(v);
}

/** Switch the canvas projection (matrix ↔ graph): per-view viewport, circles of
 *  detail, scene rebuild and fit. Called by `setMode` for the two canvas modes. */
function applyCanvasView(v: ViewKind): void {
  const changed = view !== v;
  view = v;
  // (selector "active" state is set by setMode, from CENTRAL_MODES; the layout
  // controls are per-mode and live in the window header — updateWindowHeader.)
  // WIN3 · the left panel's CONTENT follows the mode (DTC offers the DTC chunks,
  // not the stratigraphic types), so a mode change rebuilds it.
  if (changed) renderResourcePanels(); // the offer follows the mode
  // each view keeps its own "circles of detail" depth → re-derive the hidden
  // sets and rebuild when the active view changes.
  if (changed && store) {
    recomputeHiddenFromCircles();
    buildScenes();
    if (filterPanelOpen()) renderCirclesPanel();
    // entering Matrix under a filter → recompact via the em-core view layout
    if (v === "matrix") void refreshMatrixViewLayout();
    else matrixViewLayout = null;
  }
  if (contextStack.length) {
    contextStack = [];
    rebuildContext();
  }
  if (scenes[v] === null && v === "matrix") {
    info.textContent =
      "no layout section — run: emstudio layout file.em.json -o out.em.json";
  } else if (v === "dtc" && diskStamps.status !== "idle"
             && diskStamps.status !== "unstamped") {
    // DTCEMS1 · LE CINQUE FRASI DEL DISCO, e sono cinque perché sono cinque
    // fatti diversi con cinque rimedi diversi. In particolare le ultime due:
    // «questi byte non hanno un verbale» e «accanto c'è un verbale che parla di
    // altri byte» sono la differenza fra un file nuovo e un file riesportato
    // sopra, e confonderle è riattaccare la vecchia provenienza ai byte nuovi.
    //
    // `unstamped` NON entra in questo ramo: è lo stato NORMALE della maggior
    // parte dei file di un progetto vero, e una barra che lo annuncia come un
    // esito fa sembrare un guasto la normalità. Cade al ramo successivo, che
    // parla del documento.
    const name = baseName(diskStamps.path);
    info.textContent = diskStamps.status === "reading"
      ? t("stamp.reading", { name })
      : diskStamps.status === "superseded"
      // IL CASO CHE DECIDE IL DISEGNO, detto per intero.
      ? t("stamp.superseded", { name, why: diskStamps.why })
      : diskStamps.status === "failed"
      ? t("stamp.failed", { name, why: diskStamps.why })
      : diskStamps.scene.missing
      ? t("stamp.chainPartial", {
          name, n: String(diskStamps.chain.resolved.size + 1),
          missing: String(diskStamps.scene.missing) })
      : t("stamp.chain", {
          name, n: String(diskStamps.chain.resolved.size + 1) });
  } else if (v === "dtc" && dtcNeighbourhood.status !== "idle") {
    // THE THREE STATES, and the reason they are three sentences and not one
    // spinner: a picture that is empty because a request is in flight, one that
    // is empty because the node has never seen these bytes, and one that is
    // empty because the node is off are three different facts. An interface that
    // shows the same box for all three teaches people to distrust it.
    info.textContent = dtcNeighbourhood.status === "asking"
      ? t("dtc.asking", { name: baseName(dtcNeighbourhood.path) })
      // AN INVITATION, not a fault: the node answered, and asked who is asking.
      // `nodeFetch` has already tried a refresh by the time we are here, so this
      // is «there is no session» and the remedy is a signature.
      : dtcNeighbourhood.status === "unauthorised"
      // …and the remedy is whatever rung this session is actually on: on a clean
      // profile that is a signature, not a login
      ? `${t("dtc.signIn", { name: baseName(dtcNeighbourhood.path) })} ${nextRungInvitation()}`
      : dtcNeighbourhood.status === "failed"
      // the NODE's own sentence, carried through: a 403 and a 502 send somebody
      // to two different places, and «could not load» sends them nowhere
      ? t("dtc.failed", { name: baseName(dtcNeighbourhood.path),
                          why: dtcNeighbourhood.why })
      : dtcNeighbourhood.answer.start
      ? t("dtc.fromNode", {
          n: String(dtcNeighbourhood.answer.nodes?.length ?? 0),
          digest: dtcNeighbourhood.digest.slice(0, 19),
        })
      : t("dtc.unknownAsset", { digest: dtcNeighbourhood.digest.slice(0, 19) });
  } else if (v === "dtc" && (scenes.dtc?.nodes.length ?? 0) === 0) {
    // An empty canvas has to say WHY, and WHICH emptiness it is: a project with
    // no documentation member at all gets the sentence that says how one starts
    // (drop files, or declare a derivation); a project whose STUDY graph simply
    // cites no chain gets the older one. Two different facts, two sentences.
    const corpus = documentationCorpus({ create: false });
    info.textContent = corpus && corpus.liveNodes().length
      ? t("dtc.empty")
      : t("dtc.corpusEmpty");
  } else {
    updateInfo();
  }
  updateLegend();
  // The "+ epoch" overlay is Matrix-only, so switching view has to re-evaluate it.
  updateToolbar();
  // WIN2b · frame this projection the FIRST time this window shows it (for this
  // document), then leave the camera alone: switching mode or window and coming
  // back must return you where you were, not re-fit under your hands.
  const key = viewportKey(activeWin().id, v);
  if (framedViews.has(key)) draw();
  else {
    framedViews.add(key);
    fit();
  }
}

/** A slot's label: the document's own name if it declares one, else the source. */
function slotNameFor(d: EmDocument, sourceName: string): string {
  const g = d.graph as Record<string, unknown>;
  const declared = (g["name"] as string | undefined)?.trim();
  if (declared) return declared;
  // Strip the extension from a file name — "TempluMare.em.json" reads better as
  // "TempluMare" in a list of open graphs.
  return sourceName.replace(/\.(em\.json|json|graphml|xlsx)$/i, "");
}

/**
 * Wire a store's listeners. Called once per slot, at load.
 *
 * Per SLOT and not per activation: a listener added on every switch would fire
 * as many times as the graph had been activated, so one edit would rebuild the
 * scene five times and push five ops down the sync channel.
 */
function wireStore(s: DocumentStore): void {
  s.onChange(() => {
    // Guard: a background slot must not redraw the canvas. Today only the active
    // store is ever mutated (edits go through the active document), but the sync
    // channel and a future aux bake could touch another one, and the symptom of
    // that would be the canvas flickering to a graph nobody selected.
    if (s !== store) return;
    lastTouchedStore = s;  // …and undo now knows which stack the user means
    recomputeHiddenFromCircles(); // keep hidden sets in sync with new types
    refreshNameStatus();          // NAME1: label colours follow the graph
    buildScenes();
    if (filterPanelOpen()) renderCirclesPanel(); // refresh circle counts
    if (inContext()) {
      contextScene = contextSceneFor(contextStack[contextStack.length - 1]);
    }
    updateInfo();
    updateLegend();
    updateToolbar();
    refreshInspector();
    renderViewer();           // VIEWER · it follows the selection, like the Inspector
    renderAnnotator();        // A2 · and so does the annotator: same picture rule
    refreshNarrativeView();   // embeds are references: a graph edit shows here
    nodeList.refresh();
    refreshEMTree();          // node/edge counts and the dirty dot live there
    renderEmData();           // every mounted EM-Data table is a live view of it
    refreshTileSurfaces();    // WIN7 · …and so is every other window on screen
    draw();
  });
  // forward local graph mutations to a connected peer (op-log, ADR-002 §2).
  // Remote-applied ops don't re-emit (DocumentStore suppresses), so no echo.
  s.onOp((op) => {
    if (s !== store) return;
    // P4.3 · a ROOM speaks per-field CRDT operations; a sidecar speaks the
    // store's own op shape. One writing path, two vocabularies at the door —
    // and the translation happens once, where the door is.
    if (sync.room) hubSendLocal(op);
    else sync.sendOp(op);
  });
}

/**
 * Make a slot the active graph.
 *
 * This is the ONE place where "which graph?" changes, and the whole ET1 design
 * rests on that: `store` is reassigned here and every consumer reads it directly,
 * so none of them needed to learn about slots.
 *
 * View state travels WITH the slot (`graphOverrides`, the current view, collapsed
 * phase lanes) — swapped out on the way out and in on the way in. Without that,
 * switching tabs would silently discard the user's manual drags, which is the
 * first thing anyone would notice and the last thing they would suspect.
 *
 * `rebuildOnly` is set by `loadDocument`, which does its own logging and its own
 * layout decision afterwards; a plain switch does neither.
 */
function activateSlot(id: string, opts: { rebuildOnly?: boolean } = {}): void {
  const outgoing = emtree.active();
  const target = emtree.get(id);
  if (!target) return;

  // Park the outgoing slot's view state — unless the outgoing slot IS the target
  // (loadDocument's first activation, where `add` already made it active).
  if (outgoing && outgoing.id !== id) {
    // The cameras parked here are the ACTIVE window's (WIN2b): the other windows
    // re-frame on arrival, which is what they would need anyway on a document of
    // a different size. Only projections actually shown have one.
    const winId = activeWin().id;
    const camera: SlotViewState["camera"] = {};
    for (const v of ["matrix", "graph", "dtc", "multigraph"] as ViewKind[]) {
      const vp = winViewports.get(viewportKey(winId, v));
      if (vp) camera[v] = { x: vp.x, y: vp.y, scale: vp.scale };
    }
    outgoing.viewState = {
      view,
      graphOverrides: new Map(graphOverrides),
      phasesCollapsed: new Set(phasesCollapsed),
      camera,
    };
  }
  emtree.setActive(id);

  store = target.store;
  currentFilePath = target.path; // desktop: Save writes back to THIS slot's file

  // Transient state that belongs to the app, not to a graph: a selection or a
  // hypergraph breadcrumb from another document means nothing here.
  contextStack = [];
  contextScene = null;
  hoverId = null;
  selectedId = null;
  matrixViewLayout = null; // derived from filters; recomputed for this document
  resetWindowCameras(); // every window re-frames on the incoming document

  graphOverrides.clear();
  for (const [nodeId, position] of target.viewState.graphOverrides) {
    graphOverrides.set(nodeId, position);
  }
  // DTC / multigraph drags are not parked per slot (yet): another document's
  // substrate has other node ids, so carrying them over would place nothing and
  // confuse much.
  dtcOverrides.clear();
  multigraphOverrides.clear();
  phasesCollapsed.clear();
  for (const epoch of target.viewState.phasesCollapsed) {
    phasesCollapsed.add(epoch);
  }

  recomputeHiddenFromCircles(); // derive hidden types for this document
  buildScenes();
  select(null);
  nodeList.refresh();
  updateToolbar();
  refreshInspector();
  refreshNarrativeView();
  refreshEMTree();
  // STUDY · the study window describes THIS document, so a different document
  // makes its answer stale — measured: with the window open, loading a second
  // study left the previous study's name in the field. Refreshed here, on the
  // DOCUMENT change, and deliberately not in `refreshInspector`: that runs on
  // every selection, and this panel is made of text inputs somebody may be
  // typing in. (It guards on its own surface, so it costs nothing when the
  // window is not showing.)
  renderStudyWindow();
  selectedNarrativeId = null; // a chapter selection belongs to its document
  if (!opts.rebuildOnly) {
    // A switch restores the view the slot was left in; a load lets
    // `loadDocument` decide (it may need a fresh em-core layout first).
    setViewOnLoad(target.viewState.view);
    // Restore this graph's camera, or frame it if it has never been shown. The
    // viewports are shared per view KIND, so without this the incoming graph
    // inherits the outgoing one's pan and zoom — a 17-node document arriving at a
    // 215-node document's scale is off screen, and looks like a broken switch.
    const camera = target.viewState.camera[target.viewState.view];
    if (camera) {
      const vp = viewportFor(activeWin().id, target.viewState.view);
      vp.x = camera.x;
      vp.y = camera.y;
      vp.scale = camera.scale;
      framedViews.add(viewportKey(activeWin().id, target.viewState.view));
      draw();
    } else {
      fit();
    }
    updateBreadcrumb();
    logInfo(t("toast.activeGraph", { name: slotLabel(target) }));
  }
  // C1 · the open document has changed → tell the other end, and re-compare.
  // Here and not only at connect: the case this exists for is somebody
  // switching document while the channel stays up, which is precisely what a
  // descriptor captured at connect time cannot see.
  announceOpenDocument();
}

/**
 * THE CATALOG'S DOOR, from the editor's side — «open this study in EMStudio».
 *
 * What was broken, measured in Chrome on 4 September: the button worked and the
 * door did not. It opened the editor's own root with `?study=…&emjson=…` on it —
 * the two parameters only `reader.html` had ever read — and the editor answered
 * «Drop an .em.json file here · No graph open yet». A door that opens onto a
 * page which does not know what it was given.
 *
 * Now the editor reads the same link, with the same resolver
 * (`studylink.ts`), and loads the container into the workspace exactly as if it
 * had been dragged in — `loadContainerDocument`, so a study opens with its
 * members, its shelf and its documentation, not through a second import path
 * that would drift from the one people actually use.
 *
 * **Opening a study means WORKING on it.** That is the difference from
 * `/em/read/`: the reader is the dissemination page and keeps its own door and
 * its own verb. Two doors, two verbs, both honest.
 *
 * A failure SAYS SO on the canvas rather than in the console. The reader has
 * spent a while learning that lesson — «Study unreachable», «restricted», «not
 * found» are three different sentences and a reader who is told the right one
 * logs in instead of filing a bug.
 */
async function openStudyFromLink(link: StudyLink): Promise<void> {
  // INSTRUMENTED, and it stays. A study that does not arrive is invisible
  // otherwise — which is exactly how the second one was lost for a day — and
  // these three lines are the first thing anybody asks a session that went
  // wrong. `logInfo` writes to the Log window whether or not it is open.
  logInfo(`study: opening ${link.study ?? link.url} from ${link.url}`);
  info.textContent = t("study.opening", { what: link.study ?? link.url });
  let answer: Response;
  try {
    // THE SESSION'S TOKEN, when the link does not carry one of its own.
    //
    // This was the missing half of the ring, and it made the rest look broken:
    // the silent attempt worked, the chip firmed up to «confirmed by
    // em.localhost», and the study STILL said «is not published» — because the
    // fetch only ever sent `?token=` from the URL and never the token the
    // sign-in had just put in memory. Signing in that changes nothing about what
    // you can then open is a sign-in for nothing.
    //
    // The link's own token wins when there is one: it was minted for this
    // document (the Catalog's reading page hands one out), and it is more
    // specific than the session.
    const bearer = link.token || hubToken;
    answer = await fetch(link.url, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    });
  } catch (exc) {
    // The one that bit: a cross-origin fetch the browser refuses looks exactly
    // like a service that is down, and the sentence has to name the real
    // suspect. Same-origin (`/em/studio/`) is what removed the cause; this is
    // what says so if it comes back.
    studyFailed(t("study.unreachable", { url: link.url }), String(exc));
    return;
  }
  if (answer.status === 401 || answer.status === 403) {
    // ONE SILENT ATTEMPT BEFORE ASKING.
    //
    // «Sign in and open it again» was the right sentence and an impossible
    // instruction: the sign-in replaced the query string, so the study was lost,
    // and re-opening from the door made a fresh tab with no session. A ring that
    // closes only if you know a trick nobody can guess.
    //
    // So: if this node has an OIDC at all, ask the realm ONCE with
    // `prompt=none`. A session that is already alive answers with a code and
    // nobody is shown anything — the study simply opens. No session answers
    // `login_required`, we come back here, and THEN the sentence is honest.
    //
    // Once, keyed by the URL: a redirect loop is worse than a refusal, and the
    // marker outlives the redirect because `sessionStorage` does.
    if (!silentSignInTried(link.url) && await trySilentSignIn(link.url)) {
      return;   // navigating; the page comes back with the study still on it
    }
    studyFailed(t("study.restricted", { what: link.study ?? link.url }),
                `${t("study.restrictedWhy")} ${nextRungInvitation()}`);
    return;
  }
  if (!answer.ok) {
    studyFailed(t("study.notFound", { status: String(answer.status) }), link.url);
    return;
  }
  let doc: unknown;
  try {
    doc = await answer.json();
  } catch (exc) {
    studyFailed(t("study.unreadable"), String(exc));
    return;
  }
  loadContainerDocument(doc, link.study ?? link.url);
  // …and the parameters come off the address bar, the token first: a reload must
  // not re-fetch the study over whatever has been done since, and a credential
  // in an address bar outlives the tab it was useful in.
  clearStudyLinkFromLocation();
  logInfo(`study: loaded ${link.study ?? link.url} — the workspace now holds `
          + `${emtree.slots.length} slot(s), active `
          + `${emtree.active() ? slotLabel(emtree.active()!) : "(none)"}`);
  logInfo(t("study.opened", { what: link.study ?? link.url }));
}

/**
 * The study link on this page's URL, or nothing — and a refusal said out loud.
 *
 * `readStudyLink` throws on a link that names two different studies (the 5
 * September bug: `?emjson=` used to win in silence and the wrong study opened
 * under the right one's name). Catching it HERE rather than inside the reader is
 * deliberate: this is the layer that has a canvas to write on, and the reader
 * has no business deciding how a refusal is presented.
 */
function readStudyLinkOrSay(): StudyLink | null {
  try {
    return readStudyLink();
  } catch (error) {
    const why = String((error as Error).message);
    // said on the canvas, not only in the log — see `studyFailed`
    studyFailed(t("study.ambiguous"), why);
    // …and taken off the address bar, so a reload does not repeat the refusal
    clearStudyLinkFromLocation();
    return null;
  }
}

/** Has the one silent attempt already been spent for this document?
 *
 *  Keyed by the URL and kept in `sessionStorage`, because the marker has to
 *  survive the very redirect it is guarding against — a flag in memory would be
 *  gone by the time it mattered, and the loop would be infinite. */
function silentSignInTried(url: string): boolean {
  try {
    return sessionStorage.getItem(`emstudio.silenttry:${url}`) === "1";
  } catch {
    // no sessionStorage → no marker → NO ATTEMPT. Refusing to try is the safe
    // reading: a browser that cannot remember cannot be protected from a loop.
    return true;
  }
}

/** Try once, silently. Answers whether a navigation is under way. */
async function trySilentSignIn(url: string): Promise<boolean> {
  try {
    sessionStorage.setItem(`emstudio.silenttry:${url}`, "1");
  } catch {
    return false;
  }
  logInfo(`study: ${url} needs a signature — trying the node's session once`);
  return await signIntoNode({ silent: true });
}

/** A study that would not open, said where somebody is looking. */
function studyFailed(what: string, why: string): void {
  info.textContent = what;
  toast(what);
  logWarn(`${what} — ${why}`);
  // …AND ON THE CANVAS, which is where the eye is. The status bar is a line at
  // the bottom right and a toast is gone in four seconds; what somebody looks at
  // when nothing opened is the middle of an empty canvas, and it was still
  // offering «Drop an .em.json file here» as if nothing had been asked for.
  //
  // Only when the canvas IS empty: over an open document the status bar and the
  // toast are right, and painting a failure across a graph somebody is working
  // on would be the wrong kind of loud.
  const hint = document.getElementById("drop-hint");
  if (!hint || emtree.slots.length) return;
  hint.textContent = "";
  const said = document.createElement("span");
  said.className = "dh-failed";
  said.textContent = what;
  const detail = document.createElement("span");
  detail.className = "dh-alt";
  detail.textContent = why;
  hint.append(said, detail);
}

/**
 * MULTIGRAPH · open a PROJECT — a container with 1..N graphs plus its shelf.
 *
 * An em.json is always a container now, and a legacy single-graph file is a
 * container-of-one, so this is the one door every open goes through. Each member
 * becomes a SLOT (which `loadDocument` was already doing per document — ET1), and
 * the shelf becomes the project shelf shared by all of them.
 *
 * `additive` is the offline "integrate later": with `false` this replaces the
 * workspace (opening a project), with `true` it folds the incoming project into
 * the open one, merging shared nodes by UUID.
 */
function loadContainerDocument(
  doc: unknown,
  sourceName: string,
  path: string | null = null,
  opts: { additive?: boolean } = {},
): void {
  const parsed = parseContainer(doc);
  if (!parsed.members.length && !parsed.shelf) {
    info.textContent = `${sourceName}: ${parsed.warnings[0] ?? "not an .em.json document"}`;
    logError(`${sourceName}: ${parsed.warnings[0] ?? "not an .em.json document"}`);
    return;
  }
  for (const w of parsed.warnings) toast(w);

  if (opts.additive) {
    // Integrate later: the graphs already open stay, the incoming ones are added
    // (or merged into their namesake by UUID).
    const mine = {
      members: emtree.slots.map((s) => ({
        id: String((s.store.doc.graph as Record<string, unknown>).graph_id ?? s.id),
        doc: s.store.doc,
      })),
      shelf: projectShelfSection(),
      // DECLARED LIMIT · an incoming project's corpus is not merged yet: the
      // container merge folds `members` and the shelf, and doing the corpus by
      // the same UUID rule is the follow-up. Whatever is open stays open, and
      // nothing of theirs is silently dropped from THEIR file.
      corpus: projectCorpusSection(),
    };
    const before = new Set(mine.members.map((m) => m.id));
    const report = mergeContainers(mine, parsed);
    // Members that were merged in place: their store already holds the new
    // nodes (we mutated the very document the store owns), so it only has to be
    // told to redraw.
    for (const slot of emtree.slots) slot.store.touch();
    for (const member of mine.members) {
      if (before.has(member.id)) continue;
      adoptMemberAsSlot(member, sourceName, null);
    }
    if (mine.shelf) adoptProjectShelf(mine.shelf);
    toast(t("container.merged", {
      added: String(report.addedGraphs.length),
      merged: String(report.mergedGraphs.length),
      nodes: String(report.mergedNodes),
    }));
    // P3 · the silence becomes a list. A dated merge still overwrites somebody,
    // and the person who pressed "integrate" is the one who has to know.
    if (report.conflicts.length) {
      for (const c of report.conflicts) {
        logInfo(t("conflict.logged", {
          node: c.nodeId,
          winner: c.winner.by ?? "?", winnerAt: c.winner.at ?? "?",
          loser: c.loser.by ?? "?", loserAt: c.loser.at ?? "?",
          reason: c.reason,
        }));
      }
      showConflictPanel(report.conflicts);
    } else {
      showConflictPanel([]);
    }
    // integrating somebody else's graphs is a new version of the project
    refreshEMTree();
    draw();
    projectContainer();        // settles the new version and shows it
    return;
  }

  // Opening a project: the members become the workspace.
  logInfo(`container: ${sourceName} — ${parsed.members.length} member(s), `
          + `active ${parsed.activeGraphId ?? "(none)"}, `
          + `${emtree.slots.length} slot(s) already open`);
  // P3 · and its version comes with it. Only on a full open: integrating
  // somebody else's project does NOT adopt their revision number — the history
  // being counted is this project's, not theirs.
  projectVersion = parsed.version;
  updateVersionIndicator();
  showConflictPanel([]);       // a new project, not the last one's conflicts
  let activeSlotId: string | null = null;
  for (const member of parsed.members) {
    const slot = adoptMemberAsSlot(member, sourceName, path);
    if (member.id === parsed.activeGraphId) activeSlotId = slot.id;
  }
  if (parsed.shelf) adoptProjectShelf(parsed.shelf);
  // the documentation travels with the project, like the shelf
  corpusStore = null;
  if (parsed.corpus) adoptProjectCorpus(parsed.corpus);
  if (activeSlotId) activateSlot(activeSlotId, { rebuildOnly: false });
  if (parsed.members.length > 1) {
    toast(t("container.opened", { n: String(parsed.members.length) }));
  }
  refreshEMTree();
}

/**
 * MULTIGRAPH · the project shelf as a container member.
 *
 * SHELF1 keeps the shelf in `shelf.ts` (and in localStorage between reloads).
 * The container is where it BELONGS: one shelf per project, travelling in the
 * project's own file, shared by every graph in it — which is the answer to "many
 * shelves" that the design note asks for. localStorage stays as the convenience
 * that survives a reload; the file is the save.
 */
function projectShelfSection(): Record<string, unknown> | null {
  if (!shelfEntries().length) return null;
  return shelfToDocument().graph as Record<string, unknown>;
}

// ── THE DOCUMENTATION MEMBER · the DTC corpus, as a store of its own ─────────
//
// A study's provenance is a graph of a different KIND (`s3dgraphy.dtc.corpus`):
// acquisitions, transformations and the resources they are about, a forest that
// shares its leaves. It used to be written INTO the study graph, which is why a
// DTC chain drawn here came out inside a stratigraphic matrix — where an
// acquisition is not a unit and a swimlane has nothing to say about it.
//
// It is a `DocumentStore` like any other, so every rule already written applies
// to it (ids, editorial stamps, tombstones, undo). It is NOT a workspace slot:
// slots are the study's graphs and the EMtree lists them, and a corpus in that
// list would be exactly the confusion this separation removes.
//
// DECLARED LIMIT: this store's `onOp` is not wired to the room. Corpus edits are
// local until the project is saved; syncing the member live is the follow-up
// (the wire has no member addressing yet — an op says which node, not which
// graph of the container).
let corpusStore: DocumentStore | null = null;

/** The corpus store, made on demand. `create: false` answers "is there one?"
 *  without making one — a panel that showed an empty corpus it had just invented
 *  would be reporting its own side effect. */
function documentationCorpus(opts: { create?: boolean } = {}): DocumentStore | null {
  if (corpusStore) return corpusStore;
  if (opts.create === false) return null;
  corpusStore = new DocumentStore({
    header: { format: "em.json", version: "1.0" },
    graph: newCorpusSection() as unknown as EmDocument["graph"],
  } as EmDocument);
  wireCorpusStore(corpusStore);
  return corpusStore;
}

/**
 * DAG · the corpus repaints what shows it, and remembers that it was touched.
 *
 * The study store's listener (`wireStore`) rebuilds every surface; the corpus is
 * drawn by ONE of them (the DTC canvas) and read by two more (the inspector and
 * the Documentation panel's counts), so its listener is deliberately narrow — a
 * corpus edit has no business rebuilding the EMtree or the matrix.
 *
 * It also records the corpus as the store last written to, which is how undo
 * finds its way back to the document the last gesture changed (see `undoStore`).
 */
function wireCorpusStore(s: DocumentStore): void {
  s.onChange(() => {
    lastTouchedStore = s;
    buildScenes();
    updateToolbar();
    refreshInspector();
    renderStorage();   // the Documentation panel's counts (lots · chains · shared)
    draw();
  });
}

/**
 * The document the last edit landed in — study or corpus.
 *
 * Undo is per-store (each `DocumentStore` owns its snapshot stack), so a single
 * ⌘Z button has to know WHICH stack the user means. The answer is not "the
 * active graph": if the last thing you did was create an acquisition on the DTC
 * canvas, undo must take that back, not the edit you made in the matrix five
 * minutes ago. Whichever store emitted last is the one the gesture touched.
 */
let lastTouchedStore: DocumentStore | null = null;

function undoStore(): DocumentStore | null {
  if (lastTouchedStore && lastTouchedStore !== store) {
    // a corpus with nothing left to undo hands the turn back to the study, so
    // ⌘Z never becomes a dead key while an older study step is still waiting
    if (lastTouchedStore.canUndo || lastTouchedStore.canRedo) return lastTouchedStore;
  }
  return store;
}

function projectCorpusSection(): Record<string, unknown> | null {
  const store = documentationCorpus({ create: false });
  if (!store) return null;
  const graph = store.doc.graph as unknown as Record<string, unknown>;
  const nodes = (graph.nodes as unknown[] | undefined) ?? [];
  // an empty corpus is not written: a project that never documented anything
  // should not grow a member saying it did
  if (!nodes.length) return null;
  return graph;
}

function adoptProjectCorpus(section: Record<string, unknown>): void {
  corpusStore = new DocumentStore({
    header: { format: "em.json", version: "1.0" },
    graph: section as unknown as EmDocument["graph"],
  } as EmDocument);
  wireCorpusStore(corpusStore);
}

function adoptProjectShelf(section: Record<string, unknown>): void {
  const res = loadShelfDocument({
    header: { format: "em.json", version: "1.0" },
    graph: section,
  });
  if (!res.ok) {
    toast(t("shelf.notAShelf"));
    return;
  }
  renderShelf();
}

/** One container member → one workspace slot, through the door every document
 *  already uses (so epoch paradata, wiring and layout behave identically). */
function adoptMemberAsSlot(
  member: { id: string; doc: EmDocument },
  sourceName: string,
  path: string | null,
) {
  loadDocument(member.doc, member.id || sourceName, path);
  return emtree.active()!;
}

function loadDocument(
  d: EmDocument,
  sourceName: string,
  path: string | null = null,
): void {
  if (!d?.graph?.nodes) {
    info.textContent = `${sourceName}: not an .em.json document (missing graph.nodes)`;
    logError(`${sourceName}: not an .em.json document (missing graph.nodes)`);
    return;
  }
  currentFilePath = path; // desktop: enables in-place Save; null in browser
  // QOL1 · remember this open (path for desktop reopen, name otherwise).
  addRecent({ path, name: path ? baseName(path) : sourceName }, Date.now());
  // Does the INCOMING doc already carry node positions? Capture this BEFORE
  // ensureAllEpochParadata (which adds positions for the boxes it creates) —
  // otherwise those few positions make the doc look "already laid out" and we
  // skip the em-core auto-layout, leaving every position-less node (e.g. a
  // whole Blender sync snapshot) unrendered. Only the boxes would show.
  const hadStoredPositions =
    Object.keys(d.layout?.positions ?? {}).length > 0;
  const loaded = new DocumentStore(d);
  // every epoch always carries its temporal ParadataNodeGroup — ensure it now,
  // silently (before the change/op listeners are wired) so it neither pushes to
  // a sync host nor lands on the undo stack.
  loaded.ensureAllEpochParadata();
  wireStore(loaded);
  // ET1: the document becomes a SLOT in the workspace, and `add` activates it.
  // Every entry point — Open, New, a drop, GraphML import, Blender sync,
  // StratiMiner — already came through here, so all of them get a slot from this
  // one line. (That closes the TODO SM1 left behind: a StratiMiner graph is now a
  // workspace slot rather than a document that replaced whatever was open.)
  const slot = emtree.add(loaded, slotNameFor(d, sourceName), path);
  activateSlot(slot.id, { rebuildOnly: true });
  chronoBannerDismissed = false; // re-evaluate chronology for the new document
  dropHint.classList.add("hidden");
  updateBreadcrumb();
  // Matrix needs stored node POSITIONS. A doc may carry a layout object with
  // NO usable positions — a fresh graph, or a Blender sync snapshot (its emjson
  // layout has no matrix coordinates). In that case DON'T fall back to Graph:
  // compute a fresh layout via em-core so the Matrix renders, then show it.
  // S6 — the load is the anchor of the activity log: what came in, from where,
  // which language version it declares, and what the document leaves unresolved.
  const declared = versionBanner(d);
  logInfo(
    `loaded "${sourceName}" — ${d.graph.nodes.length} nodes, ` +
      `${(d.graph.edges ?? []).length} edges` +
      (declared ? ` · ${declared}` : " · no version declared"),
  );
  selectedNarrativeId = null;
  const narratives = narrativesIn(d);
  if (narratives.length)
    logInfo(`${narratives.length} narrative(s) in this document — see the Narrative view`);
  refreshNarrativeView();
  const unresolved = documentDiagnostics(d);
  if (unresolved.length) {
    logWarn(
      unresolved
        .map((g) => `${g.records.length} ${g.label.toLowerCase()}`)
        .join(" · ") + " — see Document warnings above",
    );
  }
  if (hadStoredPositions) {
    // EM3 · the stored layout keeps its POSITIONS (user intent) but its SIZES are
    // re-asserted from the type by em-core. A document saved before a type's box
    // geometry existed — a pre-EM2 file whose glyph nodes are 90×32 — would
    // otherwise keep drawing the old box until somebody pressed Layout, and the
    // connect handle would keep floating away from the glyph. Sizes are geometry,
    // not state: em-core owns them, and `reassert_sizes` is the only place that
    // decides one (no `box_for_node` re-implemented in TypeScript).
    //
    // Silent and non-blocking: nothing moves, so there is nothing to explain, and
    // a failure leaves the document exactly as it was on disk.
    void reassertSizes().finally(() => {
      // BUGS-UI · the geometry is only FINAL here (sizes re-asserted / layout
      // computed). Any camera framed earlier in the load framed a half-built
      // scene, so forget them: the first entry into each mode now frames the
      // document as it actually is. Without this the WIN2 per-instance camera
      // kept a stale frame — the previous document's zoom, or an empty one.
      resetWindowCameras();
      setViewOnLoad(scenes.matrix ? "matrix" : "graph");
    });
  } else {
    logInfo("no stored positions — computing a fresh layout via em-core");
    void runLayout(true)
      .then(() => {
        resetWindowCameras(); // frame the FINISHED layout, not the empty scene
        setViewOnLoad("matrix");
        fit();
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        info.textContent = `auto-layout failed: ${msg}`;
        logError(`auto-layout failed: ${msg}`);
        resetWindowCameras();
        setViewOnLoad(scenes.matrix ? "matrix" : "graph");
      });
  }
  refreshLogPanel();
}

// Sidecar (sync) ↔ Standalone. Opening/importing a file replaces the live view,
// so if we are in Sidecar mode warn first and offer to ask the host to persist
// its em.json (the host owns the canonical data — ADR-002 §4).
function syncToolLabel(): string {
  const t = getSettings().sync.tool;
  return SYNC_TOOLS.find((x) => x.value === t)?.label ?? t;
}
function confirmLeaveSidecar(action: string): Promise<boolean> {
  if (!sync.connected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal";
    const card = document.createElement("div");
    card.className = "modal-card";
    card.innerHTML =
      `<div class="modal-head"><span>Leave Sidecar mode?</span></div>` +
      `<div class="modal-body">` +
      `<p>EMStudio is in <b>Sidecar</b> (sync) mode with <b>${syncToolLabel()}</b>. ` +
      `${action} disconnects and switches to a <b>Standalone</b> document.</p>` +
      `<p class="settings-hint">The synced graph lives in the host, not here — ` +
      `disconnecting does not save it. You can ask the host to write its ` +
      `<code>.em.json</code> first.</p>` +
      `</div>` +
      `<div class="modal-foot">` +
      `<button data-a="cancel">Cancel</button>` +
      `<button data-a="leave">Disconnect &amp; continue</button>` +
      `<button data-a="save" class="primary">Ask host to save &amp; continue</button>` +
      `</div>`;
    modal.appendChild(card);
    const finish = (proceed: boolean, save: boolean): void => {
      modal.remove();
      document.removeEventListener("keydown", onKey, true);
      if (proceed) {
        if (save) {
          sync.sendRequestSave();
          toast("Asked the host (EMtools) to save its em.json");
        }
        sync.disconnect(); // → Standalone; the new document replaces the view
      }
      resolve(proceed);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(false, false);
      }
    };
    (card.querySelector('[data-a="cancel"]') as HTMLButtonElement).onclick = () =>
      finish(false, false);
    (card.querySelector('[data-a="leave"]') as HTMLButtonElement).onclick = () =>
      finish(true, false);
    (card.querySelector('[data-a="save"]') as HTMLButtonElement).onclick = () =>
      finish(true, true);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) finish(false, false);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(modal);
  });
}

async function loadFile(file: File): Promise<void> {
  if (!(await confirmLeaveSidecar("Opening a file"))) return;
  try {
    const t = await file.text();
    // Every open goes through the container door: a project opens as its graphs,
    // and a legacy single-graph file as a container-of-one.
    loadContainerDocument(JSON.parse(t), file.name);
  } catch (e) {
    info.textContent = `parse error: ${e}`;
  }
}

// Create a fresh, empty .em.json document. New nodes minted in the GUI get a
// UUID id (ADR-002 §6). An empty layout is included so the Matrix view renders
// (empty) without invoking em-core on nothing.
function newDocument(): void {
  const doc: EmDocument = {
    graph: {
      graph_id: crypto.randomUUID(),
      name: "untitled graph",
      nodes: [],
      edges: [],
    },
    layout: { canvas: { width: 1200, height: 800 }, swimlanes: [], positions: {} },
  };
  loadDocument(doc, "new graph");
  // A default epoch, because in EM an epoch is the CONTAINER a unit goes into:
  // without one the palette accepts a click and nothing can be placed, which
  // reads as a broken tool rather than as a missing prerequisite (E.D., from real
  // use). "Epoch 1" is a starting point, not a claim — it carries no dates.
  //
  // Only for a NEW document, and only in EM mode. `loadDocument` on an empty doc
  // has no stored positions, so it runs a fresh layout and lands in Matrix — the
  // EM mode — every time; a graph-mode user who wants no lanes can delete it,
  // which is one gesture, whereas discovering you need one is not.
  if (store && view === "matrix" && store.topEpochIds().length === 0) {
    addEpochEmMode();
  }
  info.textContent = "new empty graph";
}

// Tear the document down to an empty canvas (used when Sync is turned off — the
// synced graph is the host's, so it should not linger locally).
function clearDocument(): void {
  store = null;
  currentFilePath = null;
  scenes.matrix = null;
  scenes.graph = null;
  contextStack = [];
  contextScene = null;
  hoverId = null;
  selectedId = null;
  selectedIds = new Set();
  marquee = null;
  dropHint.classList.remove("hidden");
  info.textContent = "open or drop an .em.json file";
  updateToolbar();
  updateBreadcrumb();
  updateLegend();
  nodeList.refresh();
  draw();
  announceOpenDocument();   // C1 · nothing open here any more, and it is said
}

function defaultFileName(): string {
  const g = store!.doc.graph;
  const name = (g["name"] as string | undefined) ?? g.graph_id ?? "graph";
  return `${String(name).replace(/[^\w.-]+/g, "_")}.em.json`;
}

// Save: on desktop overwrite the open file in place (Save As if none yet);
// in a browser, download a fresh .em.json (no filesystem access).
/**
 * MULTIGRAPH · the document to SAVE is the whole project.
 *
 * Until today Save wrote `store.toJSON()` — the ACTIVE slot. A workspace with
 * three graphs saved one of them, and the other two existed until the tab
 * closed: the kind of loss you discover a week later. Now every slot goes into
 * one container, with the project shelf as a member.
 *
 * A single graph still produces a container-of-one, which is the shape Heriverse
 * already reads — so nothing downstream had to change to gain this.
 *
 * P3 · building the project is also the moment its VERSION is settled, so the
 * two can never disagree: there is no path that writes a file without deciding
 * which revision that file is.
 */
function projectContainer(): ReturnType<typeof buildContainer> {
  // Each member goes through its own `store.toJSON()` and is parsed back.
  // That round trip is NOT waste: toJSON is where the save rules live — it
  // stamps `last_editor` and, crucially, DROPS the volatile (mapped-but-not-baked)
  // nodes (AUX2). Reading `store.doc` directly would have written them into the
  // project file, which is exactly what that rule exists to prevent.
  const graphs = emtree.slots.map((slot) => ({
    id: String((slot.store.doc.graph as Record<string, unknown>).graph_id ?? slot.id),
    doc: JSON.parse(slot.store.toJSON()) as EmDocument,
  }));
  const activeSlot = emtree.active();
  const container = buildContainer({
    graphs,
    shelf: projectShelfSection(),
    corpus: projectCorpusSection(),
    activeGraphId: activeSlot
      ? String((activeSlot.store.doc.graph as Record<string, unknown>).graph_id ?? activeSlot.id)
      : null,
  });
  // P3 · a save that CHANGES THE CONTENT is a new version of the project. The
  // digest decides, so pressing ⌘S on an unchanged project does not invent a
  // revision — the counter measures the work, not the keystrokes.
  projectVersion = bumpVersion(container, projectVersion);
  updateVersionIndicator();
  return container;
}

function projectDocumentText(): string {
  return JSON.stringify(projectContainer(), null, 1);
}



// ── P4.3 · the room client: EMStudio as a live participant ──────────────────
//
// The arc closes here. P4.1 gave the algebra, P4.1b made the stamping real,
// P4.2 put a relay on the other end that speaks the wire this app already
// spoke. What is left is the part only a client can do: join a room, keep its
// own base, and know when that base is too old to be replayed.
//
// The rebase is the piece worth reading twice. A hub compacts what everybody has
// passed; a client that was away can come back holding operations about things
// the room has already settled and forgotten. Replaying those would resurrect
// them. So the hub announces `gc_watermark`, and a client whose base is older
// re-syncs from the snapshot — the state of record — and re-sends whatever of
// its own work survived, as NEW operations stamped now. Nothing is dropped in
// silence, and nothing comes back from the dead.

/** The room's roster, and what everybody is looking at (P4.3). */
let hubPresence: PresenceState = emptyPresence();
/** node id → who else has it selected. Read by the renderer; never by a gate. */
let hubPeerSelections: Map<string, string[]> | null = null;
/** How far this client is synced: the instant of the last operation it applied.
 *  It is what a reconnect resumes from and what the rebase check compares. */
let hubBase: string | null = null;
/** The hub's compaction point, as announced. */
let hubWatermark: string | null = null;
/** Local operations sent and not yet acknowledged — the ones a re-sync has to
 *  re-send rather than lose. */
const hubUnconfirmed = new Map<string, HubOp>();
/** STEP 4 · after a re-sync, the unconfirmed work waiting for the room's
 *  document to land before it is re-applied here and re-sent there. */
let hubResyncPending: HubOp[] = [];
/** The last few awareness notes ("B updated dating after you"). */
const hubNotes: AwarenessNote[] = [];

function hubKey(op: HubOp): string {
  return `${op.op}|${String(op.node_id ?? op.id ?? "")}|${String(op.field ?? "")}|${String(op.ts ?? "")}`;
}

function noteHub(note: AwarenessNote): void {
  hubNotes.unshift(note);
  hubNotes.splice(24);          // a feed, not a log
  logInfo(note.text);
  renderHubRoster();
}

/** Send one local change to the room, as the per-field operations the relay
 *  understands. The fields (and their clocks) come from the store, which
 *  stamped them — nothing is re-derived here. */
function hubSendLocal(op: GraphOp): void {
  // C2 · THE THIRD OUTBOUND POINT, and finding it changed what C2 found.
  //
  // A room's operations do not go through `sendOp`: they are translated into
  // per-field CRDT ops and pushed with `sendCommand`, which is deliberately
  // ungated (a command is an explicit act, not an echo). Which means the sync
  // DIRECTION never governed them — and, worse, neither did P5's read-only:
  // `applyRoomPermission` enforced it by setting the direction to `receive`,
  // and `receive` only ever stopped `sendOp`. **A viewer's edits were leaving
  // this client and being refused one at a time by the server.**
  //
  // So the guard lands here, where the room's ops actually leave. Not the
  // preference — no preference holds anything back any more — but the refusal
  // the server already declared at the door.
  if (!sync.canWrite) return;
  const ops = opsForLocalChange(op as Parameters<typeof opsForLocalChange>[0]);
  for (const hubOp of ops) {
    hubUnconfirmed.set(hubKey(hubOp), hubOp);
    sync.sendCommand(wireEnvelope("op", hubOp as unknown as Record<string, unknown>));
  }
}

/**
 * Write one `update_field` operation into the local document, with ITS clock.
 *
 * Shared by the two paths that must produce exactly the same result: an edit
 * arriving from somebody else, and this client's own unconfirmed work being
 * re-applied on top of a re-synced document (STEP 4). Sharing it is the point —
 * a second implementation is how "the value came back but the emptying did not"
 * happens.
 *
 * A field that was EMPTIED goes through `crdtClearField`, which leaves the
 * tombstone. Writing `undefined` instead would drop the key, and a dropped key
 * says "I never had that" — which the merge is designed to overrule with the
 * other side's value. That is the resurrection this function exists to prevent.
 */
function hubWriteFieldLocally(op: HubOp): boolean {
  if (!store || op.op !== "update_field") return false;
  const nodeId = String(op.node_id ?? op.id ?? "");
  const node = store.node(nodeId);
  const field = String(op.field ?? "");
  if (!node || !field) return false;
  // through the store's remote path: `applyRemoteOp` does not re-stamp, so the
  // hand that made this edit stays the hand that made it (AUDIT1)
  const payload = JSON.parse(JSON.stringify(node)) as Record<string, unknown>;
  if (op.remove === true) crdtClearField(payload, field, { ts: op.ts, by: op.author });
  else crdtWriteField(payload, field, op.value, { ts: op.ts, by: op.author });
  store.applyRemoteOp({
    op: "update_node", node_id: nodeId,
    patch: { name: payload.name, description: payload.description,
             data: payload.data } as Partial<EmNode>,
  });
  return true;
}

/**
 * Apply an operation that arrived from the room, carrying ITS clock.
 *
 * **Every verb, live** (P4.5). Until now only `update_field` landed in real
 * time: a node or an edge somebody else created appeared at the next re-sync,
 * which made the structural graph a shared FILE rather than a shared canvas.
 * The CRDT already knew how to do all five (P4.1) — what was missing was this
 * wiring.
 *
 * `update_field` keeps its own path because it is the one that must go through
 * the field writer (clocks per field, tombstones per field, P4.1b) and because
 * it is the one that produces an awareness note naming who changed what. The
 * structural verbs go straight to `store.applyCrdtOp`, which is the same
 * algebra the relay and the library run — including the part that matters most:
 * a removal writes a TOMBSTONE, not a missing key.
 */
function hubApplyRemote(message: Record<string, unknown>): void {
  if (!store) return;
  const op = message as unknown as HubOp;
  const kind = String(op.op ?? "");

  if (kind === "update_field") {
    const node = store.node(String(op.node_id ?? op.id ?? ""));
    if (!hubWriteFieldLocally(op)) return;
    const who = hubPresence.members.find((m) => m.author === op.author)?.display
      ?? (op.author as string | null);
    noteHub(noteForRemoteOp(op, who, node?.name ? String(node.name) : null));
  } else if (kind === "add_node" || kind === "remove_node"
             || kind === "add_edge" || kind === "remove_edge") {
    // the name BEFORE the operation: after a `remove_node` there is a tombstone
    // and the note would have nothing to point at
    const subject = structuralSubject(op);
    const result = store.applyCrdtOp(message);
    if (!result.applied) {
      // not news: the room already knew, or this is older than what is here.
      // Said in the log rather than silently dropped, because "nothing
      // happened" and "it was refused" look identical on a canvas.
      logInfo(`${kind}: ${result.reason}`);
    } else {
      const who = hubPresence.members.find((m) => m.author === op.author)?.display
        ?? (op.author as string | null);
      noteHub(noteForStructuralOp(kind, subject, who, String(op.ts ?? "")));
    }
  }

  hubBase = String(op.ts ?? hubBase ?? "");
  sync.setSince(hubBase);
  buildScenes();
  draw();
  refreshInspector();
  nodeList.refresh();
  refreshEMTree();          // the node/edge counts are part of "it arrived"
}

/** What a structural operation is ABOUT, for the awareness feed. */
function structuralSubject(op: HubOp): string {
  const nodeId = String(op.id ?? op.node_id ?? "");
  const named = store?.node(nodeId);
  if (named?.name) return String(named.name);
  if (op.op === "add_node") {
    const node = (op as unknown as { node?: { name?: string; id?: string } }).node;
    if (node?.name) return String(node.name);
    if (node?.id) return String(node.id);
  }
  if (op.op === "add_edge" || op.op === "remove_edge") {
    const from = store?.node(String(op.source ?? ""))?.name ?? String(op.source ?? "");
    const to = store?.node(String(op.target ?? ""))?.name ?? String(op.target ?? "");
    return `${from} → ${to}`;
  }
  return nodeId;
}

/** The sentence for a structural operation somebody else made. */
function noteForStructuralOp(kind: string, subject: string, who: string | null,
                             at: string): AwarenessNote {
  const author = who || t("hub.somebody");
  const what = t(`hub.op.${kind}`, { subject });
  return { kind: "remote-edit", text: `${author} ${what}`, at };
}

/**
 * STEP 4 · put the unconfirmed work back, on top of the room's document.
 *
 * Called once the snapshot has been loaded, and doing both halves in this order
 * is the whole fix:
 *
 * 1. **re-apply locally** — with the operation's own clock, through the same
 *    writer the remote path uses, so an emptied field is emptied again (its
 *    tombstone, not a missing key) instead of coming back full from the room's
 *    older document;
 * 2. **re-send** — as new operations, stamped now, so the room converges to the
 *    same thing rather than to the state it had before this client reconnected.
 *
 * The operations this cannot re-apply locally (a node added while offline, an
 * edge) are still SENT, and counted in the note: the room takes them and the
 * next snapshot brings them back. That is a declared limit, not a silence —
 * `applyRemoteOp` speaks the store's vocabulary and the relay speaks per-field
 * CRDT, and widening that translation is P4.5, not a line here.
 */
function replayAfterResync(): void {
  if (!hubResyncPending.length) return;
  const pending = hubResyncPending;
  hubResyncPending = [];
  let reapplied = 0;
  for (const op of pending) {
    if (hubWriteFieldLocally(op)) reapplied += 1;
    hubUnconfirmed.set(hubKey(op), op);
    sync.sendCommand(wireEnvelope("op", op as unknown as Record<string, unknown>));
  }
  if (reapplied < pending.length) {
    noteHub({ kind: "resync", at: new Date().toISOString(),
              text: t("hub.resent.structural",
                      { n: String(pending.length - reapplied) }) });
  }
  buildScenes();
  draw();
  refreshInspector();
  nodeList.refresh();
}

/**
 * MEMBERS · the panel is on the NODE, and this is the way to it.
 *
 * `openMembersPanel` and `membersAccess` lived here to mount `members.ts`'s panel
 * — the copy Regola IV of `EM_design_condividi-e-firma.md` forbids — and went
 * with it on 8 September 2026. What replaced them is not a smaller panel: it is
 * the link, which already existed (`shareThisRoom`, added the same week) and is
 * now the only road.
 *
 * THE ROSTER CHIP STILL OPENS IT, and that is the whole reason this comment is
 * here rather than the wiring simply being deleted: the chip is where somebody
 * already looks to see who is in the room, and taking away the click would have
 * retired an affordance people use in order to retire a panel. So the click
 * leads to the node's panel instead — same gesture, one place.
 *
 * The chip itself is LIVE PRESENCE (`hub.ts`, `crdt.ts`): who is at the table
 * right now, which is a different question from who MAY be, and it stays here.
 */

/**
 * An invite link opened this app: `?join=<token>`.
 *
 * The three steps the design asks for, in order, and none of them is skippable:
 * the link says which room, the ORCID says who (the hub token — without one the
 * server answers 401 and we say so), and the ACL ends up holding the grant. Then
 * the app joins the room it was invited to, which is what closes the circle
 * without a third surface.
 */
/**
 * THE HANDOFF, consumed — "open this room in EMStudio", without typing anything.
 *
 * Three steps, and the order is the security property:
 *
 * 1. the LINK says which server and which room (`handoff.ts`) — and nothing else:
 *    there is no token in it, deliberately;
 * 2. this app signs in AGAINST THAT SERVER by itself (`oidc.ts`, PKCE, public
 *    client) and holds the token in memory — so the credential belongs to
 *    whoever clicked, not to whoever forwarded;
 * 3. it joins, with `HubOptions` filled from those two answers.
 *
 * On a node with no OIDC (a dev stack) step 2 finds no configuration and the join
 * goes ahead without a token, which is exactly what that node expects. Said in
 * the log rather than assumed, because "it worked on my laptop" is what that
 * branch produces when it is silent.
 *
 * A link is NOT a membership. If there is no grant, the room refuses at the door
 * and the sentence says to ask for an invite — which is the other link, the one
 * that carries a role.
 */
let handoffAuth: AuthConfig | null = null;

/** Keep the handoff across the IdP round trip. Not a secret — there is nothing
 *  secret in it — but the tab is replaced by the IdP and comes back empty. */
const HANDOFF_KEY = "emstudio.handoff";

function rememberHandoff(handoff: Handoff): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
  } catch { /* a private window: the link is simply followed again */ }
}

function recallHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    return raw ? JSON.parse(raw) as Handoff : null;
  } catch {
    return null;
  }
}

/**
 * Follow a handoff — a ROOM to join, or a STUDY to open.
 *
 * Two actions on one scheme (`handoff.ts`), so this is where they part company,
 * and they part cleanly: a room needs a sign-in against that server before there
 * is anything to see, a study is a document to fetch. Neither is a fallback for
 * the other.
 *
 * The study path deliberately does NOT sign in first. The catalogue answers 401
 * for a study that is not published, and `openStudyFromLink` turns that into a
 * sentence about signing in — which is the right order, because most studies a
 * link is sent about are public and a login nobody needed is friction charged to
 * everybody.
 */
export async function openHandoff(handoff: Handoff): Promise<void> {
  if (handoff.kind === "study") {
    await openStudyFromLink({
      url: `${handoff.catalog.replace(/\/+$/, "")}`
           + `/catalog/study/${encodeURIComponent(handoff.study)}/emjson`,
      study: handoff.study, narrative: null, token: null,
    });
    return;
  }
  handoffAuth = await loadAuthConfig(handoff.server);

  if (!handoffAuth) {
    // No OIDC on that node. Not an error — a dev stack runs open — but SAID, so
    // nobody concludes from a working laptop that the token flow is wired.
    logInfo(t("handoff.noAuth", { server: handoff.server }));
    joinFromHandoff(handoff, null);
    return;
  }
  rememberHandoff(handoff);
  window.location.assign(await authorizeUrl(handoffAuth));
}

function joinFromHandoff(handoff: { server: string; room: string },
                        token: string | null,
                        session?: { refresh_token?: string;
                                    config?: AuthConfig | null }): void {
  // The settings are UPDATED from the link, not consulted: the whole point is
  // that nobody types them. They are still written down so the next launch
  // reconnects without the link.
  const s = getSettings();
  saveSettings({ ...s, sync: { ...s.sync, hubUrl: handoff.server,
                               hubRoom: handoff.room } });
  hubToken = token;
  hubRefreshToken = session?.refresh_token || null;
  hubAuthConfig = session?.config ?? null;
  logInfo(t("handoff.joining", { room: handoff.room, server: handoff.server }));
  connectToHub(handoff.server, handoff.room, token);
}

/**
 * ROUND-TRIP · open the room this session is in, in the OTHER editor.
 *
 * Not a file transfer, and the menu says so: the document lives in the room (a
 * CRDT graph behind the relay), so changing surface is a new JOIN to the same
 * room. There is no save step and no version conflict to arrange — that is a
 * property of the room, not something this function does.
 *
 * The link is ASKED FOR, never built here (`roundtrip.ts` says why): one grammar
 * on the server, measured against every consumer's copy of it. And it carries no
 * token — the other surface signs itself in.
 */
/**
 * CONDIVIDI — open the NODE's panel for the room this session is in.
 *
 * A LINK, and this function is the whole of it. Design note
 * `EM_design_condividi-e-firma.md`, Regola IV: «il pannello sta sul nodo che
 * ospita la stanza… EMStudio, il chatbot e il catalogo ci portano un link, mai
 * una copia del pannello.» The ACL and the owner live there; a second panel here
 * would be a second thing to keep in step, and the one that goes stale is
 * whichever nobody is looking at.
 *
 * NO FIELD FOR A SERVER ADDRESS, and the note says drawing one means you got
 * lost: the room's server is the one this session is connected to, and the
 * desktop learned it from the link it was opened with.
 *
 * DECLARED, because it is the honest half of this gesture: `src/members.ts`
 * already draws a members-and-invites panel inside EMStudio — 420 lines, and
 * measured on 8 September 2026 it contains the word «group» exactly ZERO times,
 * so now that a team can hold a role in a room it shows half the ACL. That is
 * the note's argument, measured: a copy drifts. Removing it is not this change's
 * to make, so the panel says so instead — see `members.ts`.
 */
function shareThisRoom(): void {
  const base = getSettings().sync.hubUrl;
  const room = sync.room || getSettings().sync.hubRoom;
  if (!base || !room || !sync.connected) {
    toast(t("share.noRoom"));
    return;
  }
  // The node's API lives at `<base>/v1`; its faces are its siblings, and the
  // work page is where the panel is (sharing is part of *lavorare*, not a fifth
  // verb). Derived from the base this session is already talking to, so nothing
  // is written down twice.
  const node = base.replace(/\/+$/, "");
  const url = `${node}/work/?room=${encodeURIComponent(room)}`;
  logInfo(`share: opening ${url}`);
  window.open(url, "_blank", "noopener");
}

async function openRoomElsewhere(): Promise<void> {
  const settings = getSettings();
  const base = settings.sync.hubUrl;
  const room = sync.room || settings.sync.hubRoom;
  if (!base || !room || !sync.connected) {
    toast(t("roundtrip.noRoom"));
    return;
  }
  const target = otherSurface();
  let handoff;
  try {
    handoff = await roomHandoff(base, room, hubToken);
  } catch (error) {
    const why = error instanceof RoundTripError
      ? error.message : String((error as Error).message);
    logWarn(t("roundtrip.failed", { why }));
    toast(t("roundtrip.failed", { why }));
    return;
  }

  const door = doorTo(handoff, target);
  if (!door) {
    // desktop → web with no web build deployed. A fact about the deployment,
    // said rather than a button that fails after the click.
    toast(t("roundtrip.noWeb"));
    return;
  }
  logInfo(t("roundtrip.opening", { room, surface: target }));

  if (door.kind === "browser") {
    window.open(door.url, "_blank", "noopener");
    return;
  }
  // A scheme: nothing can tell us in advance whether this machine answers it.
  // Watch for the window losing focus — that IS the handler opening — and fall
  // back to the server's own `/open` page, which already says what to install.
  let left = false;
  const onBlur = () => { left = true; };
  window.addEventListener("blur", onBlur, { once: true });
  window.location.href = door.url;
  window.setTimeout(() => {
    window.removeEventListener("blur", onBlur);
    if (left) return;
    const page = fallbackPage(handoff);
    if (page) window.open(page.url, "_blank", "noopener");
    toast(t("roundtrip.noHandler"));
  }, 1800);
}

/** The menu entry appears only while there is a room, and names the surface it
 *  would open — "Open in EMStudio desktop" reads as an action; "Open in…" reads
 *  as a question. */
function reflectRoundTrip(): void {
  const button = document.getElementById("btn-open-other");
  if (!button) return;
  const inRoom = Boolean(sync.room && sync.connected);
  button.classList.toggle("hidden", !inRoom);
  // …AND «CONDIVIDI», by the same condition and in the same place, because it is
  // the same fact that governs both: there is nothing to share when there is no
  // table. One `inRoom` for two menu entries — two of them would drift.
  document.getElementById("btn-share-room")
    ?.classList.toggle("hidden", !inRoom);
  if (!inRoom) return;
  const target = otherSurface();
  const label = button.querySelector("span") || button;
  label.textContent = target === "desktop"
    ? t("roundtrip.desktop") : t("roundtrip.browser");
}

/**
 * WHAT THIS PAGE IS ABOUT, in the one order the three steps can happen in.
 *
 * Each step exists because the previous one can rewrite the address bar, and
 * every version of this that read the link too early lost it:
 *
 *  1. **FINISH a sign-in this page started.** The realm's return REPLACES the
 *     query string, so at this moment the URL says `code`/`state` and not
 *     `?study=`. Completing the sign-in puts the remembered address back
 *     (`restoreAfterSignIn`) — which is why nothing may read the link before
 *     this has awaited.
 *  2. **READ the link**, which is now on the address again, and say so if it is
 *     a link that names two studies.
 *  3. **OPEN it** over the arrangement that the synchronous boot has already
 *     restored. A link is an explicit request and a restore is a habit, so the
 *     link wins — and it wins by being LAST, not by its fetch resolving late.
 *
 * The room handoff is inside step 1 for the same reason: `followHandoff` is the
 * one reader of `?code=` on this page, and two readers would race for a code
 * that can only be spent once.
 */
async function bootSession(): Promise<void> {
  // 1 · the round trip lands, and the address it started from comes back
  await followHandoff();
  // 2 · now the link is readable
  const pendingStudy = readStudyLinkOrSay();
  if (!pendingStudy) return;
  // 3 · and it opens over the restored arrangement
  await openStudyFromLink(pendingStudy);
}

/** At boot: a handoff on the URL, or a sign-in coming back from one. */
async function followHandoff(): Promise<void> {
  if (returningFromIdp()) {
    const handoff = recallHandoff();
    // only a ROOM is ever remembered across a sign-in: the study path does not
    // sign in first (see `openHandoff`), so there is nothing to come back to
    if (handoff && handoff.kind === "room") {
      const config = await loadAuthConfig(handoff.server);
      const result = config
        ? await completeSignIn(config)
        : { ok: false, error: "that node no longer offers a sign-in" };
      clearHandoffFromLocation();
      if (!result.ok) {
        logWarn(t("handoff.signInFailed", { why: String(result.error) }));
        toast(t("handoff.signInFailed", { why: String(result.error) }));
        return;
      }
      joinFromHandoff(handoff, result.token || null,
                      { refresh_token: result.refresh_token, config });
      return;
    }
  }
  // …and if the return was not a handoff's, it may be this page's OWN sign-in:
  // the editor learned to sign itself in (`signIntoNode`), and there is exactly
  // ONE reader of `?code=` on this page — two would race for a single-use code.
  if (returningFromIdp() && await completeNodeSignIn()) return;
  const handoff = handoffFromLocation();
  if (!handoff) return;
  clearHandoffFromLocation();
  await openHandoff(handoff);
}

/** The DESKTOP way in: the OS hands the app a `stratigraph://` URL.
 *
 *  Wired defensively because the plugin is a desktop-only dependency: on the web
 *  build there is no Tauri at all, and a hard import would break the bundle for
 *  the majority of users to serve a minority path. */
async function wireDesktopDeepLink(): Promise<void> {
  const tauri = (window as unknown as { __TAURI_INTERNALS__?: unknown });
  if (!tauri.__TAURI_INTERNALS__) return;          // web build: nothing to wire
  try {
    // Imported by a LITERAL specifier, so the bundler inlines it. It used to be
    // built at runtime ("so no bundler can follow it"), which is exactly why no
    // bundle ever contained it: in the single-file desktop build a bare module
    // name reaches the webview unresolved and fails with «does not resolve to a
    // valid URL» (dev.12, 28 Sep 2026). The package is a thin `invoke` wrapper,
    // harmless on the web, where the guard above returns before it is touched.
    const plugin = await import("@tauri-apps/plugin-deep-link") as {
      onOpenUrl?: (cb: (urls: string[]) => void) => Promise<unknown>;
      getCurrent?: () => Promise<string[] | null>;
    };
    const follow = (urls: string[] | null | undefined) => {
      for (const url of urls || []) {
        try {
          void openHandoff(parseHandoff(url));
          return;
        } catch (error) {
          // …AND IN FRONT OF WHOEVER PRESSED. This was `logWarn` alone, which is
          // the app's console: a study link the parser could not read (and until
          // tonight it could not read any of them) failed with nothing on
          // screen. A button that cannot work is bad; one that cannot work
          // silently is what makes people doubt their own machine.
          const why = String((error as Error).message);
          logWarn(why);
          toast(why);
        }
      }
    };
    // the link that STARTED the app (cold launch)…
    if (plugin.getCurrent) follow(await plugin.getCurrent());
    // …and any that arrive while it is running
    if (plugin.onOpenUrl) await plugin.onOpenUrl(follow);
  } catch (error) {
    // The plugin is not installed in this build. Declared, not swallowed: the
    // web parameter still works and the person should know which half they have.
    logInfo(t("handoff.noDesktopHandler", { why: String(error) }));
  }
}


async function acceptPendingInvite(): Promise<void> {
  const pending = pendingJoin();
  if (!pending) return;
  const settings = getSettings();
  const base = settings.sync.hubUrl;
  if (!base) {
    // SAID, not only logged — measured on 8 September 2026 and it was the mute
    // one of the two guards: an invitation that arrived with no node configured
    // wrote a line in a panel nobody had open and did nothing else. Somebody
    // clicks a link, EMStudio opens, and nothing happens. Its sibling below
    // («no identity») already toasted; this one did not.
    //
    // AND THE RETIREMENT REMOVED THE SOURCE OF THIS CASE, which is why it turned
    // up now: a link minted by the NODE's panel carries `server=` (it is the
    // node's own door plus the token), so the handoff configures the hub before
    // this runs. The link the retired `inviteUrl()` minted carried only `join`
    // and `room` — no server — so it was exactly the one that landed here. The
    // guard stays for a hand-typed or a legacy link.
    const why = t("members.joinNoHub");
    logWarn(why);
    toast(why);
    return;
  }
  if (!hubToken) {
    // The link opened the door; it does not authenticate. Ask for the identity
    // the same way joining a room does today.
    hubToken = window.prompt(t("hub.tokenPrompt")) || null;
  }
  if (!hubToken) {
    // the same rule as the study's refusal: name the gesture this session HAS
    const why = `${t("members.joinNeedsIdentity")} ${nextRungInvitation()}`;
    logWarn(why);
    toast(why);
    return;
  }
  try {
    const joined = await acceptInvite(base, pending.token, hubToken);
    logInfo(t("members.joined", { room: joined.title || joined.room_id,
                                  role: joined.role }));
    toast(t("members.joined", { room: joined.title || joined.room_id,
                                role: joined.role }));
    // …and then actually go in, which is the point of following a link
    const s = getSettings();
    saveSettings({ ...s, sync: { ...s.sync, hubRoom: joined.room_id } });
    connectToHub(base, joined.room_id, hubToken);
  } catch (error) {
    // The server's sentence: "that invitation is revoked", "expired", "used up".
    logWarn(String((error as Error).message));
    toast(String((error as Error).message));
  } finally {
    // The token leaves the URL either way: a bearer-ish string in the address
    // bar gets pasted into bug reports and shared screens.
    const url = new URL(window.location.href);
    url.searchParams.delete("join");
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url.toString());
  }
}

/** The roster chip + the awareness map the canvas reads. */
function renderHubRoster(): void {
  // …and the round-trip entry with it: this runs on every presence frame and on
  // connect/disconnect, which is exactly when "am I in a room" changes.
  reflectRoundTrip();
  hubPeerSelections = peerSelections(hubPresence);
  const chip = document.getElementById("hub-roster");
  if (!chip) return;
  const others = hubPresence.members.filter((m) => m.id !== hubPresence.me);
  const inRoom = hubPresence.members.length;
  chip.classList.toggle("hidden", !sync.room);
  chip.textContent = sync.room ? t("hub.roster", { n: String(inRoom) }) : "";
  if (!chip.dataset.membersWired) {
    // wired ONCE: `renderHubRoster` runs on every presence frame, and a listener
    // added per frame is a click that fires eleven times by the afternoon
    chip.dataset.membersWired = "1";
    // …AND IT LEADS TO THE NODE'S PANEL, not to a copy: one place, and a link
    // from every app. Same function the Mode menu uses, so there is one road.
    chip.addEventListener("click", () => shareThisRoom());
  }
  chip.classList.toggle("can-manage", canManage(hostInfo.role));
  chip.title = [
    sync.room ? `${t("hub.room")}: ${sync.room}` : "",
    ...hubPresence.members.map((m) =>
      `${m.id === hubPresence.me ? "▸ " : "  "}${m.display}` +
      (m.selection.length ? ` — ${m.selection.length} ${t("hub.selected")}` : "")),
    others.length ? "" : t("hub.alone"),
    hubNotes.length ? `\n${hubNotes.slice(0, 5).map((n) => `· ${n.text}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Join a room on an StratiGraph Server.
 *
 * The callbacks are where the client's whole behaviour lives, so they are worth
 * reading as a list: the snapshot decides the document, `host_info` decides
 * whether the local base is still usable, an op converges the graph, an
 * `op_result` that says `stale` becomes awareness rather than an error, and
 * presence is a roster nobody can turn into a lock.
 */
/**
 * THE TWO GESTURES EMStudio LACKED: create a room, and put this file on it.
 *
 * Design note `EM_design_aprire-entrare-creare.md`: not modes but three verbs —
 * APRI (a file, yours, on your disk), ENTRA (a room, the graph is already
 * there), CREA (a room, empty or carrying the container in your hands). Whoever
 * creates it is its owner: the ownership comes from the gesture and not from a
 * form.
 *
 * NO SERVER-ADDRESS FIELD, and the note is explicit that drawing one means you
 * got lost: EMStudio web is served BY the node, so `servingNode()` already knows,
 * and the desktop learns it from the link.
 */

/** The document waiting to be seated on a table it does not know about yet. */
let seedingRoom: { room: string; container: Record<string, unknown> } | null = null;

/** One field, and the verb it is for. Reuses the modal the sidecar warning uses
 *  rather than a second idea of what a dialog looks like. */
function askRoomName(seeding: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal";
    const card = document.createElement("div");
    card.className = "modal-card";
    card.innerHTML =
      `<div class="modal-head"><span>${
        seeding ? t("room.bringHead") : t("room.createHead")}</span></div>` +
      `<div class="modal-body">` +
      `<p><input id="room-name" type="text" maxlength="120" autocomplete="off" ` +
      `placeholder="${t("room.namePlaceholder")}" style="width:100%"></p>` +
      `<p class="settings-hint">${
        seeding ? t("room.bringWhy") : t("room.createWhy")}</p>` +
      `</div>` +
      `<div class="modal-foot">` +
      `<button data-a="cancel">${t("common.cancel")}</button>` +
      `<button data-a="ok" class="primary">${
        seeding ? t("room.bringDo") : t("room.createDo")}</button>` +
      `</div>`;
    modal.appendChild(card);
    const field = () => card.querySelector("#room-name") as HTMLInputElement;
    const finish = (value: string | null): void => {
      modal.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const accept = (): void => {
      const name = field().value.trim();
      // A NAME OF ONLY PUNCTUATION derives an empty id. The front door falls back
      // to `room-<timestamp>`; here we ask again, because this room becomes the
      // live copy of the document on screen and being sent to work in
      // `room-lz4f9k` is worse than one more keystroke.
      if (!nameIsUsable(name)) { field().focus(); return; }
      finish(name);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") { e.stopPropagation(); finish(null); }
      if (e.key === "Enter" && document.activeElement === field()) {
        e.stopPropagation(); accept();
      }
    };
    card.querySelector('[data-a="cancel"]')!
      .addEventListener("click", () => finish(null));
    card.querySelector('[data-a="ok"]')!.addEventListener("click", accept);
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(modal);
    field().focus();
  });
}

/**
 * Create a room on the node that served this page, and optionally seat the open
 * container on it.
 *
 * THE LADDER FIRST, AND NOT A FORM. Creating a room writes an ACL naming its
 * owner, so the node has to know who that is — `POST /v1/rooms` answers 401 for
 * exactly that reason. When a rung is missing the gesture does what the CHIP
 * would do, which is the point: one ladder, not a second login prompt bolted to
 * a menu item.
 */
async function createRoomHere(seed: boolean): Promise<void> {
  // THE CHEAP, LOCAL, CERTAIN REFUSAL FIRST. Measured in the browser: with a
  // declared-but-unconfirmed signature and no document open, this sent the
  // person through a whole sign-in against the realm — and would have greeted
  // them on the way back with «there is no graph open to put on a table».
  // A round trip through an identity provider to learn something that was true
  // before it started.
  if (seed && !store) { toast(t("room.bringNeedsDocument")); return; }

  const blocked = whatBlocksTheGesture(Boolean(currentIdentity()), Boolean(hubToken));
  if (blocked) {
    toast(nextRungInvitation());
    identityChipClicked();          // declare a signature, or sign in — its rung
    return;
  }

  const name = await askRoomName(seed);
  if (!name) return;
  const roomId = roomIdFromName(name);
  const server = servingNode();

  // CAPTURED BEFORE CONNECTING, and the order is the whole repair. Measured on
  // the dev stack: a room created a second ago still SENDS a snapshot — a
  // container holding one empty graph — so joining it would call
  // `loadContainerDocument` with nothing in it and the document on screen would
  // be gone. Same class as the bug STEP 4 fixed in the other direction: the
  // snapshot arriving after the re-send overwrote it.
  const container = seed ? shelfContainerDoc() : null;

  let created: Record<string, unknown>;
  try {
    const answer = await fetch(`${server}/v1/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json",
                 Authorization: `Bearer ${hubToken}` },
      body: JSON.stringify({ room_id: roomId, title: name }),
    });
    if (!answer.ok) {
      // THE NODE'S OWN SENTENCE. A 409 («already declared») and a 401 send
      // somebody to two different places, and «could not create» sends them
      // nowhere. The collision is the server's to refuse — asking first and
      // creating second is two answers where one is authoritative.
      const detail = await answer.json().catch(() => null) as { detail?: string } | null;
      toast(t("room.createFailed", { status: String(answer.status),
                                     why: String(detail?.detail ?? "") }));
      logWarn(`room: ${server} refused «${roomId}» — ${answer.status} `
              + String(detail?.detail ?? ""));
      return;
    }
    created = await answer.json() as Record<string, unknown>;
  } catch (exc) {
    toast(t("room.createUnreachable", { server, why: String(exc) }));
    return;
  }
  logInfo(`room: created «${roomId}» on ${server} as `
          + String(created.your_role ?? "?"));

  if (seed && container) {
    // …AND ONLY INTO A ROOM THE NODE SAYS IS EMPTY. `POST /v1/rooms` refuses a
    // room already DECLARED, but it will happily declare one that exists in the
    // snapshot store and was never declared — and seeding that would write our
    // file over somebody's undeclared work. The node hands us the answer in the
    // same response: `missing_refs` naming this room's own container means it has
    // nothing to lose.
    const missing = (created.missing_refs as string[] | undefined) ?? [];
    const refs = (created.container_refs as string[] | undefined) ?? [roomId];
    const empty = refs.every((ref) => missing.includes(ref));
    if (!empty) {
      toast(t("room.alreadyHasAGraph", { room: name }));
      logWarn(`room: «${roomId}» already holds a graph — not seeding it`);
      return;                       // the room exists; it is not seeded
    }
    seedingRoom = { room: roomId, container };
  }
  connectToHub(server, roomId, hubToken);
}

/**
 * Seat the captured container on the table, once the room has spoken.
 *
 * WHY OPERATIONS AND NOT A NEW ENDPOINT: the relay has five idempotent verbs and
 * a merge that arbitrates them. A seeding endpoint would be a sixth way for a
 * graph to enter a room, writing straight past the convergence rules — and the
 * first time it raced a connected client the room would have two truths and no
 * ledger saying which came first.
 *
 * WHY IT ALSO LOADS LOCALLY: the relay does NOT echo the sender its own work
 * (`ws.py::_fanout(skip=origin)` — «a client must not have to recognise its own
 * work coming back»), and it had just handed us an empty snapshot. So the room
 * gets the operations and this screen gets the document, and both are the same
 * container — read once, from the copy taken before the socket opened.
 *
 * ONE GRAPH, DECLARED. An operation does not name a graph, so a room holds one
 * (P4.2). A project with several graphs cannot be seated whole, and this says so
 * rather than dropping the rest quietly.
 */
function seatSeededContainer(room: string): boolean {
  if (!seedingRoom || seedingRoom.room !== room) return false;
  const { container } = seedingRoom;
  seedingRoom = null;

  loadContainerDocument(container, `${room} (hub)`);
  const graphs = (container.graphs ?? {}) as Record<string, { nodes?: unknown[] }>;
  const ids = Object.keys(graphs);
  const activeId = String(container.active_graph_id ?? ids[0] ?? "");
  const active = graphs[activeId] as
    { nodes?: EmNode[]; edges?: Array<Record<string, unknown>> } | undefined;

  const ops = seedOpsForContainer(active ?? null);
  for (const op of ops) {
    hubUnconfirmed.set(hubKey(op), op);
    sync.sendCommand(wireEnvelope("op", op as unknown as Record<string, unknown>));
  }
  logInfo(`room: seated ${ops.length} operation(s) on «${room}»`);

  // …AND ASK THE ROOM TO WRITE IT, because seating is not keeping.
  //
  // MEASURED on the dev stack, both halves, because the first version of this
  // comment asserted more than was true and the measurement corrected it:
  //
  //   seeded WITHOUT a save → a new connection sees (206, 526). The room holds
  //     it in memory, so nothing looks wrong. And on disk: `<room>.acl.json`
  //     and `<room>.room.json`, and NO `<room>.em.json`.
  //   seeded WITH a save    → the same (206, 526), and 304 066 bytes of
  //     `<room>.em.json` beside them.
  //
  // So the failure this line prevents is not visible in the session that made
  // it: it is the RESTART. `ws.py` writes the snapshot in exactly one place
  // (`request_save`) and a disconnect deliberately does not — a relay that saved
  // on every parting would rewrite a room whenever somebody's wifi dropped.
  //
  // Which makes an unsaved seeding the worst shape a failure can have: the
  // sentence below says the live copy is the node's, the screen agrees, the
  // person closes the file believing it is kept, and the node loses it the next
  // time it comes up. The save is what makes the sentence true before it is said.
  sync.sendRequestSave();
  logInfo(`room: asked «${room}» to write its snapshot`);

  // THE SENTENCE THE PROMPT ASKS FOR, at the moment it becomes true: from here
  // the live copy is the node's. Saying it later, or not at all, is how somebody
  // keeps editing what they think is their file.
  toast(t("room.livesOnTheNodeNow", { room }));
  if (ids.length > 1) {
    // not a silent truncation: a room holds one graph, and this project had more
    toast(t("room.onlyOneGraph", { n: String(ids.length - 1), graph: activeId }));
    logWarn(`room: «${room}» holds ONE graph — ${ids.length - 1} other(s) `
            + "stayed in the local project");
  }
  return true;
}

function connectToHub(url: string, room: string, token: string | null): void {
  sync.connectHub({ url, room, token, since: hubBase }, {
    // In a room a peer's selection is AWARENESS: it marks their node, it does
    // not move mine. (`onSelect` stays for the sidecar mirror, where following
    // IS the point — one person, two screens.)
    onSelect: () => { /* a room never moves your selection */ },
    onPeerSelect: (frame) => {
      hubPresence = reducePresence(hubPresence, { type: "select", ...frame });
      renderHubRoster();
      draw();
    },
    onOp: (op) => hubApplyRemote(op as unknown as Record<string, unknown>),
    onSnapshot: (doc) => {
      // SEEDING COMES FIRST, because this snapshot is the thing it has to
      // survive. A room created a second ago still sends one — a container with
      // one empty graph — and loading it here would blank the document the
      // gesture exists to seat. So a room we are seeding never loads it: it
      // loads the copy taken before the socket opened, and sends the operations.
      if (seatSeededContainer(room)) {
        info.textContent = t("hub.joined", { room });
        renderStorage();
        return;
      }
      // A ROOM is a project: the relay sends a CONTAINER (P4.2 decided a room =
      // one em.json), so it is opened by the door that reads containers. Handing
      // it to the single-graph loader was the first thing that broke here — the
      // document arrived and nothing appeared, because it had no `.graph`.
      loadContainerDocument(doc, `${room} (hub)`);
      info.textContent = t("hub.joined", { room });
      // ASSETS · the object-store panel is gated on being IN a room, and joining
      // one is exactly the event that opens the gate. Measured live: the Assets
      // tab went on saying "standalone: there is no store to publish to" after
      // the room was joined, until something else happened to redraw it.
      renderStorage();
      // …and READ the register: what this instance already documents about the
      // files this study cites belongs on the DAG the moment the room is open,
      // not after somebody thinks to ask for it.
      void pullResidentCorpus().then((got) => {
        if (got && (got.nodes || got.edges)) {
          ingestLog(t("assets.registerRead", {
            n: String(got.nodes), e: String(got.edges),
          }));
          renderStorage();
        }
      });
      // STEP 4 · and only NOW the work that was not confirmed before the
      // re-sync. The order is the fix: the snapshot the room sends was built
      // BEFORE it received these operations, so re-sending them without
      // re-applying them here would leave this screen showing the room's older
      // document — with an emptied field looking full again. The room converges
      // either way; the person watching does not.
      replayAfterResync();
    },
    onHostInfo: (info2) => {
      hostInfo = { ...hostInfo, ...info2 };
      // the ROLE arrives here, and it is the third rung's second half
      refreshIdentityChip();
      announceConnector(hostInfo, "cloud");   // a room: the connector is remote
      renderSidecarDetail();
      // …and if it refuses something later, say so out loud (see onDenied).
      // P5 · the room said what this client may do. Believe it now, before the
      // first edit: discovering a role by having an operation refused shows an
      // editing UI that does not work, which reads as a broken app rather than
      // as a study somebody let you read.
      applyRoomPermission();
      // the same frame tells this client WHICH member it is — without that, the
      // roster cannot mark "you" and every halo would look like somebody else's
      hubPresence = reducePresence(hubPresence,
                                   { type: "host_info", ...(info2 as object) });
      const watermark = (info2 as Record<string, unknown>).gc_watermark as string | null;
      hubWatermark = watermark ?? null;
      const plan = planRejoin(hubBase, hubWatermark);
      if (plan.kind === "resync") {
        // the local history is older than what the room still remembers: it is
        // NOT replayed. The snapshot that follows is the truth, and the work
        // this client had not yet had acknowledged is re-sent as new operations,
        // stamped now — visible, not silently dropped.
        //
        // Held, not sent, until the snapshot has landed: see `replayAfterResync`.
        // Sending here and re-applying later would be two orders for the same
        // facts, and the one the screen shows would be the wrong one.
        const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
        hubResyncPending = stampForResend(hubUnconfirmed.values(), now);
        hubUnconfirmed.clear();
        hubBase = null;
        sync.setSince(null);
        noteHub({ kind: "resync", at: now,
                  text: t("hub.resynced", { n: String(hubResyncPending.length) }) });
      }
      renderHubRoster();
    },
    onPresence: (message) => {
      // `reducePresence` folds a FRAME (it switches on `type`); what arrives
      // here is the payload, because WIRE 2 hands the body to the callback and
      // keeps the envelope to itself. Naming the kind back is the whole
      // translation — without it the roster silently stayed empty, which is how
      // this was noticed.
      hubPresence = reducePresence(hubPresence, { type: "presence", ...message });
      renderHubRoster();
      draw();
    },
    onDenied: (info) => {
      // The room refused an operation, and said why. Told out loud: a refusal
      // that arrives and is dropped is indistinguishable from a message that
      // never arrived — the edit vanishes and the room looks broken.
      toast(String(info?.reason || t("room.denied")));
      if (info?.can_write === false) {
        // and if this is the first news that the room is read-only here, make
        // the session match rather than letting the next edit be refused too
        hostInfo = { ...hostInfo, can_write: false, role: info.role };
        applyRoomPermission();
      }
    },
    onOpResult: (message) => {
      const op = (message.op ?? {}) as HubOp;
      hubUnconfirmed.delete(hubKey(op));
      if (message.applied) {
        hubBase = String(op.ts ?? hubBase ?? "");
        sync.setSince(hubBase);
        return;
      }
      if (message.reason === "idempotent") return;   // nothing to say
      const node = store?.node(String(op.node_id ?? ""));
      noteHub(noteForStale(op, node?.name ? String(node.name) : null));
    },
    onReconnect: (attempt, delay) => {
      info.textContent = t("hub.reconnecting",
                           { n: String(attempt), s: String(Math.round(delay / 1000)) });
    },
    onStatus: (state) => {
      document.body.classList.toggle("sync-active", state === "open");
      setModeIndicator(state === "open" ? "hub" : "standalone");
      if (state === "open") info.textContent = t("hub.connected", { room });
      else if (state === "closed") {
        hubPresence = emptyPresence();
        renderHubRoster();
      }
    },
  });
}

// ── CMD1 · the command channel: EMStudio conducts, Blender is the 3D arm ────
//
// The affordance lives on the node it is about (Inspector); this is the part
// that talks. Three rules, and the third is the one that makes the feature
// trustworthy rather than merely working:
//
//  1. a command is an EXPLICIT act, so it is NOT gated by the sync direction
//     (turning the selection mirror off must not silently disable a button);
//  2. it IS gated by the host's CONSENT, which the host declares in `host_info`
//     — so the button greys out with a reason instead of failing after a click;
//  3. the result is merged as DATA (`addSubgraph`), with the stamps that came
//     with it: what Blender made is Blender's hand, not this session's.

/** Why a command cannot be sent right now, or null when it can. */
function commandsBlockedReason(): string | null {
  if (!sync.connected) return t("cmd.blocked.disconnected");
  if (!hostInfo.accepts_commands) return t("cmd.blocked.noConsent");
  return null;
}

/** Send a 3D command to the host and say, in the log, what was asked. */
function sendHostCommand(verb: string, target: string): void {
  const blocked = commandsBlockedReason();
  if (blocked) {
    toast(blocked);
    return;
  }
  const msg = buildCommand(verb as CommandVerb, target, {});
  if (!sync.sendCommand(msg)) {
    toast(t("cmd.blocked.disconnected"));
    return;
  }
  pendingCommands.set(msg.payload.cmd_id, { verb, target });
  logInfo(t("cmd.sent", { verb, target: nodeLabelFor(target) ?? target }));
  info.textContent = t("cmd.sent", { verb, target: nodeLabelFor(target) ?? target });
}

/** What we asked for, so the answer can be reported in those terms. */
const pendingCommands = new Map<string, { verb: string; target: string }>();

/**
 * The host answered. On success the DELTA is merged into the document the
 * command was about — that is what makes this a graph-first flow rather than a
 * remote control: the 3D was materialised over there, and what comes back is
 * the paradata chain, in the graph, saved with the project.
 */
function applyCommandResult(res: {
  cmd_id: string; ok: boolean;
  delta?: { nodes?: unknown[]; edges?: unknown[] };
  error?: string; repeated?: boolean; info?: Record<string, unknown>;
}): void {
  const asked = pendingCommands.get(res.cmd_id);
  pendingCommands.delete(res.cmd_id);
  const what = asked ? `${asked.verb} · ${nodeLabelFor(asked.target) ?? asked.target}` : res.cmd_id;
  if (!res.ok) {
    toast(t("cmd.failed", { what, error: res.error ?? "?" }));
    logError(t("cmd.failed", { what, error: res.error ?? "?" }));
    return;
  }
  const nodes = (res.delta?.nodes ?? []) as EmNode[];
  const edges = (res.delta?.edges ?? []) as EmEdge[];
  let added = { nodes: 0, edges: 0 };
  // The delta belongs to the graph the command was about. With one slot that is
  // the active store; with several, the one that HOLDS the target — otherwise a
  // proxy would land in whichever graph happened to be in front.
  const slot = asked
    ? emtree.slots.find((s) => s.store.node(asked.target)) ?? emtree.active()
    : emtree.active();
  if (slot && (nodes.length || edges.length)) {
    // `addSubgraph`: verbatim insert, ONE undo step, no re-stamping — the nodes
    // were made by the host and carry its hand (AUDIT1's rule for work that
    // arrives from elsewhere).
    added = slot.store.addSubgraph(nodes, edges);
  }
  buildScenes();
  draw();
  refreshInspector();
  nodeList.refresh();
  const msg = t(res.repeated ? "cmd.doneRepeat" : "cmd.done", {
    what, nodes: String(added.nodes), edges: String(added.edges),
  });
  toast(msg);
  logInfo(msg);
  info.textContent = msg;
}

// ── P3 · the project's revision ─────────────────────────────────────────────
//
// One project, one version — so it lives beside the workspace and not in a
// store: a DocumentStore holds ONE graph, and the version is a fact about all of
// them together.
let projectVersion: ProjectVersion | null = null;
/** The conflicts of the last integration, kept so the panel can be reopened. */
let lastMergeConflicts: Conflict[] = [];

/** "Progetto v3 (da sha256:…)" in the status bar, or nothing when the project
 *  has never been written. Discreet on purpose: it is a record, not a badge. */
function updateVersionIndicator(): void {
  const el = document.getElementById("project-version");
  if (!el) return;
  if (!projectVersion) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.classList.remove("hidden");
  el.textContent = `${t("version.project")} ${versionLabel(projectVersion)}`;
  const at = projectVersion.modified_at
    ? new Date(projectVersion.modified_at).toLocaleString()
    : "";
  el.title = [
    `${t("version.digest")}: ${projectVersion.id}`,
    projectVersion.was_revision_of
      ? `${t("version.wasRevisionOf")}: ${projectVersion.was_revision_of}`
      : "",
    at ? `${t("version.modifiedAt")}: ${at}` : "",
    t("version.hint"),
  ].filter(Boolean).join("\n");
}

/**
 * Pin the project: freeze it as the thing a citation can point at.
 *
 * The snapshot is a FILE, downloaded there and then — immutable by construction
 * rather than by promise, because later edits cannot reach into a file that has
 * already left. The DOI belongs to the Catalog; this is the stable thing it
 * would mint for.
 */
function pinProjectVersion(): void {
  if (!emtree.slots.length) {
    toast(t("version.pinEmpty"));
    return;
  }
  const doc = projectContainer();              // settles the version first
  if (!projectVersion) return;
  const snapshot = {
    id: projectVersion.id,
    pinned_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    version: projectVersion,
    document: doc,
  };
  const stem = defaultFileName().replace(/\.em\.json$/i, "").replace(/\.emj$/i, "");
  browserDownload(JSON.stringify(snapshot, null, 1),
                  `${stem}-v${projectVersion.number}.pinned.em.json`);
  logInfo(t("version.pinned", { v: String(projectVersion.number), id: projectVersion.id }));
  toast(t("version.pinned", { v: String(projectVersion.number), id: projectVersion.id }));
}

/**
 * P3 · the conflict panel — what used to be silence.
 *
 * A merge that resolves by date is still a merge that overwrote somebody: the
 * list says WHO overwrote WHOM and when, in that order, because that is the
 * sentence a person needs ("B (11:30) ha sovrascritto A (10:00) su US1"). It is
 * a REVIEWABLE NOTICE and not an error: nothing is blocked, and the panel can be
 * dismissed and reopened from the log.
 *
 * Each row offers "tieni la versione di A" — a revert of that one node to the
 * losing version, which the conflict carries with it (`loserPayload`). That
 * revert is MY edit, so it stamps my hand and now: the content is A's, the act
 * is mine, and both are true.
 */
function showConflictPanel(conflicts: Conflict[]): void {
  const host = document.getElementById("conflict-panel");
  if (!host) return;
  lastMergeConflicts = conflicts;
  const chip = document.getElementById("conflict-reopen");
  if (chip) {
    chip.classList.toggle("hidden", !conflicts.length);
    chip.textContent = conflicts.length
      ? t("conflict.chip", { n: String(conflicts.length) })
      : "";
    chip.title = t("conflict.chipTitle");
  }
  host.innerHTML = "";
  if (!conflicts.length) {
    host.classList.add("hidden");
    return;
  }
  const head = document.createElement("div");
  head.className = "conflict-head";
  const title = document.createElement("strong");
  title.textContent = t("conflict.title", { n: String(conflicts.length) });
  head.appendChild(title);
  const close = document.createElement("button");
  close.className = "conflict-close";
  close.textContent = "✕";
  close.title = t("conflict.close");
  close.addEventListener("click", () => host.classList.add("hidden"));
  head.appendChild(close);
  host.appendChild(head);

  const hint = document.createElement("div");
  hint.className = "conflict-hint";
  hint.textContent = t("conflict.hint");
  host.appendChild(hint);

  const when = (v: string | null): string =>
    v ? new Date(v).toLocaleString() : t("conflict.noStamp");
  const who = (v: string | null): string => v ?? t("conflict.noAuthor");

  const list = document.createElement("div");
  list.className = "conflict-list";
  for (const c of conflicts) {
    const row = document.createElement("div");
    row.className = "conflict-row";
    const line = document.createElement("div");
    line.className = "conflict-line";
    line.textContent = t("conflict.sentence", {
      winner: who(c.winner.by), winnerAt: when(c.winner.at),
      loser: who(c.loser.by), loserAt: when(c.loser.at),
      node: nodeLabelFor(c.nodeId) ?? c.nodeId,
    });
    row.appendChild(line);

    const meta = document.createElement("div");
    meta.className = "conflict-meta";
    meta.textContent = [
      t(`conflict.reason.${c.reason}`),
      c.fieldHint.length ? `${t("conflict.fields")}: ${c.fieldHint.join(", ")}` : "",
    ].filter(Boolean).join(" · ");
    row.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "conflict-actions";
    const reveal = document.createElement("button");
    reveal.className = "conflict-btn";
    reveal.textContent = t("conflict.reveal");
    reveal.addEventListener("click", () => revealFromWarning(c.nodeId));
    actions.appendChild(reveal);
    const keep = document.createElement("button");
    keep.className = "conflict-btn";
    keep.textContent = t("conflict.keepLoser", { who: who(c.loser.by) });
    keep.title = t("conflict.keepLoserTitle");
    keep.addEventListener("click", () => {
      if (revertToLoser(c)) {
        keep.disabled = true;
        keep.textContent = t("conflict.kept");
      }
    });
    actions.appendChild(keep);
    row.appendChild(actions);
    list.appendChild(row);
  }
  host.appendChild(list);
  host.classList.remove("hidden");
}

/** The name of a node, for a sentence — falls back to the id, never to nothing. */
function nodeLabelFor(nodeId: string): string | null {
  for (const slot of emtree.slots) {
    const node = slot.store.node(nodeId);
    if (node) return String(node.name || nodeId);
  }
  return null;
}

/** Put back the version that lost, for ONE node. Returns false if the node is
 *  no longer there (a project can move on between the merge and the click). */
function revertToLoser(c: Conflict): boolean {
  const payload = c.loserPayload as Record<string, unknown>;
  for (const slot of emtree.slots) {
    if (!slot.store.node(c.nodeId)) continue;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (k === "id") continue;
      patch[k] = v;
    }
    // The stamps in the payload are the LOSER's; the revert is my act, so
    // `updateNode` stamps my hand over them. Content theirs, decision mine —
    // both true, and neither invented.
    slot.store.updateNode(c.nodeId, patch as Partial<EmNode>);
    logInfo(t("conflict.revertLogged", { node: c.nodeId, who: c.loser.by ?? "?" }));
    return true;
  }
  toast(t("conflict.gone", { node: c.nodeId }));
  return false;
}

async function saveDocument(): Promise<void> {
  if (!store) return;
  if (isTauri()) {
    if (!currentFilePath) return saveAsDocument();
    try {
      await writeEmJson(currentFilePath, projectDocumentText());
      store.dirty = false;
      info.textContent = `saved ${baseName(currentFilePath)}`;
      updateToolbar();
    } catch (e) {
      toast(`save failed: ${e instanceof Error ? e.message : e}`);
    }
    return;
  }
  browserDownload(projectDocumentText(), defaultFileName());
  store.dirty = false;
  updateToolbar();
}

// Save As: on desktop prompt for a path and remember it; in a browser this
// is the same as Save (a download with a fresh name).
async function saveAsDocument(): Promise<void> {
  if (!store) return;
  if (isTauri()) {
    try {
      const path = await saveAsEmJson(projectDocumentText(), defaultFileName());
      if (!path) return; // user cancelled
      currentFilePath = path;
      store.dirty = false;
      info.textContent = `saved ${baseName(path)}`;
      updateToolbar();
    } catch (e) {
      toast(`save failed: ${e instanceof Error ? e.message : e}`);
    }
    return;
  }
  browserDownload(store.toJSON(), defaultFileName());
  store.dirty = false;
  updateToolbar();
}

function browserDownload(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// QOL1 · reopen a recent file. A path-less recent (a browser drop) cannot be
// reopened by the sandbox; a path-bearing one reopens on the desktop and, if the
// file has since disappeared, is pruned from the list.
async function openRecentFile(r: RecentFile): Promise<void> {
  if (!r.path) {
    toast("Recente aperto per drag&drop: riaprilo trascinando di nuovo il file " +
          "(il browser non può riaprirlo per percorso).");
    return;
  }
  try {
    const res = await readEmJsonPath(r.path);
    if (!res) {
      toast("Riapertura per percorso disponibile solo nell'app desktop.");
      return;
    }
    if (!(await confirmLeaveSidecar("Opening a file"))) return;
    // the same door as the browser: a container `{graphs:{…}}` (what s3Dgraphy
    // writes) and a single graph (a container-of-one) both open.
    loadContainerDocument(JSON.parse(res.text), baseName(res.path), res.path);
  } catch {
    removeRecent(r.path);
    toast("Il file recente non è più leggibile — rimosso dai recenti.");
    refreshEMTree();   // every live EMtree window: the list is one shorter
  }
}

// Open: native dialog on desktop, <input type=file> in a browser.
async function openDocument(): Promise<void> {
  if (isTauri()) {
    try {
      const res = await openEmJson();
      if (!res) return; // cancelled
      if (!(await confirmLeaveSidecar("Opening a file"))) return;
      // through the container reader, like the browser's <input type=file>:
      // calling `loadDocument` here refused every `{graphs:{…}}` file with
      // «missing graph.nodes» (reported 28 Sep 2026 on dev.10–dev.12).
      loadContainerDocument(JSON.parse(res.text), baseName(res.path), res.path);
    } catch (e) {
      info.textContent = `open failed: ${e instanceof Error ? e.message : e}`;
    }
    return;
  }
  fileInput.click();
}

// ---------- placing (palette) ----------
// WIN3 · the palette is rebuilt when the canvas projection changes, because its
// CONTENT is per-mode (DTC offers the DTC chunks, not the stratigraphic types).
// One factory, called again — not a second palette that could drift.
/** Every palette currently mounted — one per open panel. STEP A made the panel
 *  per-window, so there can be several, and the "what am I placing" highlight
 *  belongs to all of them. Cleared whenever the panels are rebuilt. */
const paletteUis: ReturnType<typeof buildPalette>[] = [];
function buildPaletteForMode(host: HTMLElement, win: Win): void {
  const ui = buildPalette(
  host,
  (t, kind, isResource) => {
    if (!store) {
      toast("Open a document first");
      return;
    }
    // Epochs are swimlanes in Matrix, not free-dropped nodes — clicking the
    // EpochNode palette entry adds a lane at the top (newest) and selects it for
    // dating (the chronology, not an xy click, decides its final position; the
    // "Ordina lane per data" banner sorts it in). Graph view keeps free-drop.
    if (t === "EpochNode" && view === "matrix") {
      if (placingType) cancelPlacing();
      addEpochEmMode();
      return;
    }
    // toggle: same item again cancels. The key includes the DTC kind so two
    // DTC items of the same node_type toggle independently.
    const key = kind ? `${t}:${kind}` : t;
    const active = placingType === t && placingKind === (kind ?? null);
    placingType = active ? null : t;
    placingKind = active ? null : (kind ?? null);
    placingIsResource = active ? false : !!isResource;
    // STEP A · the placing type is a fact about the SESSION, not about one
    // panel: every mounted palette shows it, so two Graph windows with their
    // panels open never disagree about what you are holding.
    for (const p of paletteUis) p.setActive(placingType ? (placingKind ? key : t) : null);
    setCanvasCursor("placing", !!placingType);
    if (placingType) {
      const what = placingKind ?? placingType;
      hintBar.textContent = `Click the canvas to place a ${what} — Esc to cancel`;
      hintBar.classList.remove("hidden");
    } else {
      hintBar.classList.add("hidden");
    }
  },
  // The palette shows what THIS window can place. A graph window in DTC mode
  // offers the DTC glyphs, anywhere else the stratigraphic types (WIN3's
  // per-mode content, read from the WINDOW — in a tiled shell "the window's
  // projection" and "the app's view" are different things).
  { mode: winMode(win) },
  );
  paletteUis.push(ui);
}

// ── PALETTE1 · the palette is a PANEL you open ──────────────────────────────
//
// It used to be a fixed column, always there, showing one general offer for the
// whole workspace. Two things were wrong with that in a tiled shell: it cost the
// canvas its width whether or not you were placing anything, and "the types you
// can place" is a fact about a WINDOW — the focused one — not about the app.
//
// So: one palette, opened and closed from Tools, showing the types of the window
// that has the focus. Closed, the column is gone and the canvas has the space.
// The drop itself is untouched (DND1/WIN6: every area accepts a drop and places
// in its own camera), and so is the filter box at the top.

/**
 * ─────────────── STEP A · the RESOURCES panel, anchored to its window ─────────
 *
 * The panel used to belong to whichever window had the FOCUS: it lived inside
 * `#canvas-wrap`, so moving the mouse to another area took it away and moving
 * back brought it out again. It flickered, and worse, it was never really the
 * panel *of* anything — you opened it on the Graph and it followed you to the
 * table.
 *
 * It is a panel of a WINDOW INSTANCE now. It is built into that window's own
 * area, focused or not; it stays put when the pointer leaves; it closes only
 * from its own chevron `‹` or from Tools. Two Graph windows side by side each
 * have their own, independently.
 *
 * WHO has one is a REGISTRY, not a condition scattered through the code — and it
 * decides the CONTENTS too, because "what can this window offer" is not always
 * "the node types": a Graph offers the stratigraphic palette, a Narrative offers
 * the blocks of a story. A window type with no entry here has no panel and no
 * chevron, which is why a Tabular or an Inspector shows neither.
 */
interface ResourceProvider {
  /** Fill `host` with this window's offer. */
  render: (host: HTMLElement, win: Win) => void;
}

const RESOURCE_PROVIDERS: Partial<Record<WindowType, ResourceProvider>> = {
  // the 46 stratigraphic types — or, in DTC Mode, the DTC glyphs (WIN3)
  graph: {
    render: (host, win) => {
      buildPaletteForMode(host, win);
      renderLegendInto(host);
    },
  },
  // the narrative building blocks. NOT the node types, which are of no use
  // while reading or writing a story — and NOT the connector legend, which
  // explains EDGES and belongs where edges are drawn.
  narrative: { render: (host) => renderNarrativePalette(host) },
  // A2 · the annotator offers the ways of TRACING. Same registry, same panel,
  // same chevron — what a window offers was never "the node types".
  annotator: { render: (host) => renderAnnotatorTools(host) },
};

/** True when this window has something to offer — the ONE place that answers it. */
function hasResources(win: Win): boolean {
  return !!RESOURCE_PROVIDERS[win.type];
}

/** Is this window's panel open? Per INSTANCE, persisted with the window. */
function resourcesOpen(win: Win): boolean {
  return winCurrent(win, "resources") === true;
}

function setResourcesOpen(win: Win, open: boolean): void {
  setWinCurrent(win, "resources", open ? true : null);
  renderTiles(); // the panel is part of the area: the tree re-lays out with it
  requestAnimationFrame(() => {
    draw();
    draw();
  });
}

/** The sidebar's width. One number: the CSS reads it through `--palette-w`. */
const PALETTE_W = 148;

/**
 * Build the resources sidebar and its chevron into ONE area.
 *
 * Called for every area that has a provider — the focused one and the others
 * alike, which is what makes the panel stay where it was put. The reserved width
 * is published on the AREA as `--palette-w`, so the canvas of that window is
 * narrowed by it in both states and the drawing never re-frames when the pointer
 * crosses a divider (SHELL-POLISH's no-reflow rule).
 */
function buildResourcePanel(area: HTMLElement, win: Win): void {
  const provider = RESOURCE_PROVIDERS[win.type];
  if (!provider) {
    area.style.setProperty("--palette-w", "0px");
    return;
  }
  const open = resourcesOpen(win);
  area.style.setProperty("--palette-w", open ? `${PALETTE_W}px` : "0px");
  if (open) {
    const panel = document.createElement("div");
    panel.className = "win-resources";
    // a gesture inside the panel is not a gesture on the window's content
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());
    area.appendChild(panel);
    provider.render(panel, win);
  }
  const chev = document.createElement("button");
  chev.className = "win-res-chevron";
  chev.type = "button";
  chev.textContent = open ? "‹" : "›";
  chev.title = t(open ? "palette.close" : "palette.open");
  chev.setAttribute("aria-expanded", String(open));
  chev.addEventListener("pointerdown", (e) => e.stopPropagation());
  chev.addEventListener("click", (e) => {
    e.stopPropagation();
    setResourcesOpen(win, !open);
  });
  area.appendChild(chev);
}

/** Repaint every mounted panel in place — for a scene or document change, which
 *  must not cost a re-tile. */
function renderResourcePanels(): void {
  paletteUis.length = 0;
  for (const area of document.querySelectorAll<HTMLElement>(".tile-area")) {
    const panel = area.querySelector<HTMLElement>(":scope > .win-resources");
    if (!panel) continue;
    const id = area.dataset.win;
    const win = windowsOf().find((w) => w.id === id);
    const provider = win && RESOURCE_PROVIDERS[win.type];
    if (!win || !provider) continue;
    panel.textContent = "";
    provider.render(panel, win);
  }
}

/** Open or close the FOCUSED window's panel — Tools ▸ Palette nodi. The chevron
 *  on each area does the same for its own window; both go through
 *  `setResourcesOpen`, so there is one state and it belongs to the window. */
function togglePalette(): void {
  const win = activeWin();
  if (!hasResources(win)) {
    toast(t("toast.noResourcePanel"));
    return;
  }
  setResourcesOpen(win, !resourcesOpen(win));
}

document.getElementById("btn-tool-palette")?.addEventListener("click", togglePalette);
// STEP A · the chevrons are BUILT PER AREA (`buildResourcePanel`) and wired
// there, to their own window. There is no singleton to bind here any more —
// that singleton was the follow-the-focus bug.

/**
 * Ask em-core to re-assert node SIZES on the layout we already have (EM3).
 *
 * Positions are untouched — this is not a re-layout and must never behave like
 * one. Applied through `store.setLayout` so undo/redo and the sync channel see it
 * as the ordinary layout change it is; skipped silently when nothing is stale, so
 * opening an up-to-date document does not mark it dirty.
 */
async function reassertSizes(): Promise<void> {
  if (!store) return;
  const sketch = store.doc.layout;
  if (!sketch || !Object.keys(sketch.positions ?? {}).length) return;
  try {
    // lazily imported like the other two em-core call sites: the WASM is fetched
    // on first use, and opening a document must not wait for it
    const { computeLayout } = await import("./emcore");
    const fixed = await computeLayout(store.doc.graph, sketch, { sizesOnly: true });
    const changed = Object.entries(fixed.positions ?? {}).filter(([id, rect]) => {
      const before = sketch.positions?.[id];
      const r = rect as { w: number; h: number };
      return before && (before.w !== r.w || before.h !== r.h);
    });
    if (!changed.length) return;
    store.setLayout(fixed);
    logInfo(
      `${changed.length} node size(s) re-asserted from their type ` +
        `(a stored size never wins over the type's geometry)`,
    );
  } catch (e) {
    // A failure here must not stop a document from opening: the layout on disk is
    // still a valid layout, only its glyph boxes are out of date.
    logWarn(`size re-assert skipped: ${e instanceof Error ? e.message : e}`);
  }
}

function cancelPlacing(): void {
  placingType = null;
  placingKind = null;
  placingIsResource = false;
  for (const p of paletteUis) p.setActive(null);
  setCanvasCursor("placing", false);
  hintBar.classList.add("hidden");
}

// EM-mode add-epoch: insert a lane at `index` in the top-level stack (default
// top = newest) and select it for dating. INCREMENTAL — addEpochAt opens a gap
// and slides only the lanes/nodes below it; NO em-core relayout (the layout is
// recomputed only on the explicit Layout action), so existing nodes don't
// reshuffle. Optional start/end are the interpolated slot from a spatial insert.
function addEpochEmMode(index = 0, start?: number, end?: number): void {
  if (!store) {
    toast("Open a document first");
    return;
  }
  const node = store.addEpochAt(index, undefined, start, end);
  // addEpochAt emitted → onChange already rebuilt the scene; just select it.
  select(node.id);
  // date-driven add (top, undated) scrolls to the new lane so the user can date
  // it; a spatial insert happens at a boundary the user is already looking at.
  if (start == null && end == null) centerOn(node.id);
  toast(
    start != null || end != null
      ? t("toast.epochInserted")
      : t("toast.epochAdded"),
  );
}

// ---------- accessory views ----------
// ── THE OUTLINER, once written down and mounted as many times as asked ──────
//
// This used to be `const nodeList = buildNodeList(nodelistEl, …)` — ONE object,
// built at boot around ONE element, and called from eighteen places in this file
// as `nodeList.refresh()` / `nodeList.setSelected(id)`. It was the singleton
// that made "two Outliner windows" impossible: not the drawing (the renderer
// took its root from the first day), the OBJECT.
//
// What it becomes: the two arguments that are not the root, named here so
// `mountPanel` can build one per window, and a `nodeList` that is no longer an
// instance but the FAN-OUT over every live one. The eighteen call sites did not
// have to change, and that is the point — they were always asking for "the
// outliner", and the answer simply stopped being "the one".
function pickFromOutliner(id: string): void {
  if (inContext()) {
    contextStack = [];
    rebuildContext();
  }
  select(id);
  centerOn(id);
}

const outlinerCallbacks: NodeListCallbacks = {
  isFolded: (id) => store?.isFolded(id) ?? false,
  onToggleFold: (id) => requestFold(id),
  onExplode: (id) => {
    contextStack = [];
    enterGroup(id);
  },
  onFoldGroups: (ids, folded) => store?.setFoldedMany(ids, folded),
  isContainer: (id) => {
    if (!store) return false;
    const mm = buildMembership(store.doc);
    return (mm.membersOf.get(id)?.filter((m) => m !== id).length ?? 0) > 0;
  },
};

/**
 * "The outliner", as every caller in this file still spells it — and now a verb
 * over all of them instead of a reference to one.
 *
 * `setSelected` is kept apart from `refresh` on purpose: it moves a highlight
 * over rows that are already built, and answering a click with `refresh()` would
 * rebuild a list of every node in the graph each time the selection moves.
 */
const nodeList = {
  refresh: (): void => refreshSurfaces("emtree"),
  setSelected: (id: string | null): void => selectInSurfaces("emtree", id),
};

/*
 * GONE (15 set 2026) · the ONE overview.
 *
 * The last singleton overlay: a minimap built at boot around `#overview`, which
 * lived inside `#canvas-wrap` and therefore answered «where am I» for whichever
 * window happened to have the focus. It is per instance now — `mountGraphCanvas`
 * builds one into each graph area — and the choice is worth stating because the
 * prompt offered the other one: an overlay that follows the focus is an overlay
 * that does not know whose it is, and for three nights running that has been the
 * seed of the next twin. A minimap belongs to the picture it is a map of.
 */

/**
 * DAG · the store THIS CANVAS writes to.
 *
 * Almost always the active study graph. But the DTC view draws the documentation
 * corpus (`container.corpus`), a document of its own — so while that picture is
 * on screen, what you create on it belongs to the CORPUS. Writing to `store`
 * there would put a DTC node in the stratigraphic matrix, out of the picture the
 * gesture was aimed at: not an error anyone would see, just a node in a graph
 * nobody was looking at.
 *
 * One resolver, used by every authoring path on the canvas (`placeNode`,
 * `createNodeAt`, `createEdge`, the delete key), so the four cannot disagree
 * about which document a gesture lands in.
 */
function canvasStore(): DocumentStore | null {
  if (view !== "dtc") return store;
  // ONE RULE: you author the document you are looking at. The corpus is written
  // exactly when the corpus is drawn (`lastDtcSource`), so a gesture never lands
  // in a document that is not on screen.
  //
  // Consequence, deliberate: a project with no documentation yet keeps writing
  // its DTC into the study graph (what it drew before, and what it draws now) —
  // the corpus is STARTED from the Documentation panel, which is what the empty
  // state says. Making an empty DTC canvas silently create the member would move
  // the substrate of every old project the first time somebody dropped a node.
  if (lastDtcSource === "corpus") {
    const corpus = documentationCorpus({ create: false });
    if (corpus) return corpus;
  }
  return store;
}

/**
 * DAG · which document a NODE lives in — the active study graph, or the corpus.
 *
 * The selection is an id, and an id alone does not say which document it belongs
 * to. Every path that acts on the selection (delete, clear a field, the
 * inspector's own writes) asks this instead of assuming the study graph: the
 * alternative is a delete key that silently does nothing because the node it was
 * aimed at lives in the other document.
 */
function storeOfNode(id: string | null | undefined): DocumentStore | null {
  if (!id) return store;
  if (store?.node(id)) return store;
  const corpus = documentationCorpus({ create: false });
  return corpus?.node(id) ? corpus : store;
}

/** Same question for an EDGE: whoever has it. */
function storeOfEdge(edge: EmEdge): DocumentStore | null {
  if (store?.doc.graph.edges.some((e) => sameEdge(e, edge))) return store;
  const corpus = documentationCorpus({ create: false });
  if (corpus?.doc.graph.edges.some((e) => sameEdge(e, edge))) return corpus;
  return store;
}

/** Is the canvas currently writing to the corpus rather than to the study? */
function canvasWritesToCorpus(): boolean {
  const target = canvasStore();
  return !!target && target !== store;
}

/**
 * Does the corpus accept a node of this type from the canvas?
 *
 * The corpus is acquisitions, transformations and the resources they are about —
 * NOT stratigraphy. A US dropped in here would be a unit in a document that has
 * no epochs, no lanes and no matrix to hold it, and the paradata written about
 * it would answer questions the corpus never asks. The rights ornaments are
 * allowed because the corpus is where an acquisition's licence and author live
 * (that is what the lot attribution writes).
 */
function corpusAcceptsType(type: string): boolean {
  return corpusAcceptsNodeType(type, {
    isDtc: isDtcNodeType,
    resource: nodeTypeForClass("ResourceNode"),
    rights: RIGHTS_TYPES,
  });
}

/** author / license / embargo, resolved from the datamodel (never spelled out
 *  here): the ornaments an acquisition or a file carries. */
const RIGHTS_TYPES = new Set<string>(
  ["AuthorNode", "LicenseNode", "EmbargoNode"]
    .map((cls) => nodeTypeForClass(cls))
    .filter((nt): nt is string => !!nt),
);

function placeNode(wx: number, wy: number): void {
  if (!store || !placingType) return;
  // DAG · authoring the CORPUS: the same gesture, a different document. The
  // corpus has no lanes, no groups and no matrix, so none of the study-side
  // homing below applies — a node is created, stamped with its DTC kind, and the
  // DAG lays it out by rank the moment it exists.
  if (canvasWritesToCorpus()) {
    const corpus = canvasStore()!;
    if (!corpusAcceptsType(placingType)) {
      toast(t("dtc.corpusRefusesType", { type: placingType }));
      cancelPlacing();
      return;
    }
    const cid = corpus.newId();
    const cnode: EmNode = {
      id: cid,
      name: corpus.freshLabel(placingType),
      node_type: placingType,
      description: "",
    };
    if (placingKind) {
      cnode.data = { dtc_kind: placingKind };
      if (placingIsResource) cnode.data.resource_type = placingKind;
    }
    corpus.addNode(cnode, { x: wx - 45, y: wy - 15, w: 90, h: 30 });
    select(cid);
    cancelPlacing();
    toast(t("dtc.corpusCreated", { name: cnode.name ?? cid }));
    return;
  }
  // Epochs are special: an EpochNode + a swimlane (Matrix lane / Graph node,
  // invariant 4). Lets you populate epochs in a fresh graph.
  if (placingType === "EpochNode") {
    const w = 140,
      h = 30;
    const ep = store.addEpoch(undefined, { x: wx - w / 2, y: wy - h / 2, w, h });
    select(ep.id);
    cancelPlacing();
    toast(`epoch ${ep.name} created`);
    return;
  }
  // id = UUID (identity, collision-free across tools); name = human label
  const id = store.newId();
  // NAME1 · the paradata chain has a convention (D.<n> / <doc>.<ord> / C.<n>);
  // every other type keeps the store's generic fresh label. A new extractor is
  // born unattached, so it gets a Temp name and is numbered when the
  // `extracted_from` edge appears — see `createEdge`.
  const name = initialName(store.doc, placingType) ?? store.freshLabel(placingType);
  const w = isGroupType(placingType) ? 120 : 90;
  const h = 30;
  const node: EmNode = { id, name, node_type: placingType, description: "" };
  // DTC palette items carry a kind → stamp it so the node renders its glyph and
  // projects its crm:P2_has_type (em.json = single source of truth).
  if (placingKind) {
    // DTC chunk (input/process) carries dtc_kind; a DTC OUTPUT is a Resource
    // (ResourceNode) → also stamp resource_type (slice b). em.json = source of truth.
    node.data = { dtc_kind: placingKind };
    if (placingIsResource) node.data.resource_type = placingKind;
  }
  if (inContext()) {
    const gid = contextStack[contextStack.length - 1];
    store.addNode(node);
    store.moveInGroupSpace(gid, id, { x: wx - w / 2, y: wy - h / 2, w, h }, false);
    // membership edge into the group we are inside
    const g = store.node(gid);
    const types = allowedEdgeTypes(placingType, g?.node_type);
    const membership = types.find((t) => t.startsWith("is_in_"));
    if (membership) store.addEdge(id, gid, membership);
  } else {
    store.addNode(node, { x: wx - w / 2, y: wy - h / 2, w, h });
    // matrix view: assign the epoch of the lane the node was dropped in
    if (view === "matrix" && isStratigraphicType(placingType)) {
      const lane = scenes.matrix?.lanes.find(
        (l) => wy >= l.y && wy <= l.y + l.height,
      );
      if (lane) store.addEdge(id, lane.id, "has_first_epoch");
    }
  }
  ensureCircleVisibleFor(placingType); // reveal its ring if the filter hid it
  // BUGFIX-GLYPH · a glyph/shape type must never keep the wide default box: ask
  // em-core (the size owner) to re-assert the new node's box from its TYPE, so a
  // freshly created extractor/combiner/SE/BR is born ~square with the handle
  // adjacent — not only after a Matrix re-load (EM2/EM3).
  void reassertSizes();
  select(id);
  if (vocabularyFor(placingType)) openQualiaPicker(id, wx, wy); // pick its label
  cancelPlacing();
  toast(`${id} created`);
}

// After a node/group DRAG ends (D2 inverse): landing inside a group box adds/
// re-parents membership — the innermost (smallest) box of a matryoshka wins;
// landing in a different epoch lane re-assigns has_first_epoch (a group carries
// its epoch-placed members along).
// Returns true if the drop RE-ASSIGNED the node (into a group, or to a different
// epoch/phase band); false if it landed in the same place — the caller then
// persists the freely-dragged position instead of letting the rebuild snap it
// back.
function handleDrop(nodeId: string, wx: number, wy: number): boolean {
  if (!store || view !== "matrix" || inContext()) return false;
  const st = store; // non-null capture (narrowing is lost inside callbacks)
  const s = scene();
  if (!s) return false;
  // act on the WHOLE selection when the dragged node is part of a multi-selection
  const ids =
    selectedIds.has(nodeId) && selectedIds.size > 1 ? [...selectedIds] : [nodeId];
  const mm = buildMembership(store.doc);

  // forbid dropping a group into itself or its own descendants
  const forbidden = new Set<string>(ids);
  for (const id of ids) {
    const stk = [id];
    while (stk.length) {
      const g = stk.pop()!;
      for (const c of mm.childrenOf.get(g) ?? []) {
        if (!forbidden.has(c)) {
          forbidden.add(c);
          stk.push(c);
        }
      }
    }
  }

  // 1) innermost group box (smallest area) at the drop point → move the whole
  //    selection into it (each node only if the datamodel allows a membership)
  const boxes = (s.groups ?? []).filter(
    (g) =>
      !forbidden.has(g.id) &&
      !g.folded &&
      wx >= g.x &&
      wx <= g.x + g.w &&
      wy >= g.y &&
      wy <= g.y + g.h,
  );
  boxes.sort((a, b) => a.w * a.h - b.w * b.h);
  const target = boxes[0];
  if (target) {
    const groupNode = store.node(target.id);
    let moved = 0;
    for (const id of ids) {
      if (id === target.id) continue;
      const primary = mm.primaryOf.get(id) ?? null;
      if (primary === target.id) continue; // already primarily in it
      const edgeType = allowedEdgeTypes(
        store.node(id)?.node_type,
        groupNode?.node_type,
      ).find((t) => MEMBERSHIP_EDGES.has(t));
      if (edgeType) {
        store.moveToGroup(id, target.id, edgeType, primary);
        moved++;
      }
    }
    if (moved) {
      toast(`moved ${moved} into ${groupNode?.name ?? "group"}`);
      return true;
    }
  }

  // 2) not into a group → re-assign the epoch of the lane at the drop point.
  //    A dragged group carries its epoch-placed members along.
  const lane = s.lanes.find((l) => wy >= l.y && wy <= l.y + l.height);
  if (!lane) return false;
  const candidates = new Set<string>(ids);
  for (const id of ids) {
    if (isGroupType(store.node(id)?.node_type)) {
      const stk = [id];
      while (stk.length) {
        const g = stk.pop()!;
        for (const c of mm.childrenOf.get(g) ?? []) {
          if (!candidates.has(c)) {
            candidates.add(c);
            stk.push(c);
          }
        }
      }
    }
  }
  const placed = new Set(
    store.doc.graph.edges
      .filter((e) => e.edge_type === "has_first_epoch")
      .map((e) => e.source),
  );
  let targets = [...candidates].filter((id) => placed.has(id));
  if (!targets.length)
    targets = ids.filter((id) =>
      isStratigraphicType(st.node(id)?.node_type),
    );
  if (!targets.length) return false;
  // if the lane is showing phase sub-bands, resolve which band the drop landed
  // in and attribute to that phase (the residual band's phaseId is the epoch
  // itself → un-phased). Otherwise attribute to the epoch lane.
  let targetEpoch = lane.id;
  let targetLabel = lane.label;
  const bandsHere = (s.subBands ?? [])
    .filter((b) => b.laneId === lane.id)
    .sort((a, b) => a.y - b.y);
  if (bandsHere.length) {
    let chosen = bandsHere[0];
    for (const b of bandsHere) if (wy >= b.y - 13) chosen = b; // gaps → band below
    targetEpoch = chosen.phaseId;
    targetLabel = chosen.residual ? `${lane.label} (unphased)` : chosen.label;
  }
  // dropped back in the SAME epoch/band → not a reassignment; let the caller keep
  // the freely-dragged position (a single node dropped where it already belongs)
  if (ids.length === 1) {
    const cur = st.doc.graph.edges.find(
      (e) =>
        (e.edge_type === "has_first_epoch" ||
          e.edge_type === "survive_in_epoch") &&
        e.source === ids[0],
    )?.target;
    if (cur === targetEpoch) return false;
  }
  st.setFirstEpoch(targets, targetEpoch);
  toast(`moved ${targets.length} to ${targetLabel}`);
  if (bandsHere.length) void runLayout(false); // clean placement in the new band
  return true;
}

// ---------- connect (edge drawing with live socket validation) ----------
function beginConnect(fromId: string): void {
  connect = { fromId, x: 0, y: 0, targetId: null, validity: null };
  setCanvasCursor("connecting", true);
}

function updateConnect(wx: number, wy: number): void {
  if (!connect || !store) return;
  connect.x = wx;
  connect.y = wy;
  const s = scene();
  const hit = s ? hitTest(s, wx, wy) : null;
  if (hit && hit.id !== connect.fromId) {
    connect.targetId = hit.id;
    connect.validity = connectValidity(
      // DAG · resolve the SOURCE in its own document: on the corpus canvas it
      // is a corpus node, and `store.node` there returns nothing — which read as
      // "no EM connection allows undefined → …" and refused every link.
      storeOfNode(connect.fromId)?.node(connect.fromId)?.node_type,
      hit.node.node_type,
    );
  } else {
    connect.targetId = null;
    connect.validity = null;
  }
  draw();
}

function finishConnect(forceCreate = false): void {
  if (!connect || !store) return;
  const { fromId, targetId, validity, x, y } = connect;
  connect = null;
  setCanvasCursor("connecting", false);
  draw();
  // Dropped in the void → offer to CREATE a target node. Hold Shift/Alt to
  // FORCE this even when the drop lands on a node or (often) inside a
  // container box that hitTest would otherwise treat as the target — handy
  // when containers cover all the empty space (e.g. a node inside a PD group).
  if (forceCreate || !targetId) {
    showCreateNodeMenu(fromId, x, y);
    return;
  }
  if (!validity) return;
  const src = storeOfNode(fromId)?.node(fromId)?.node_type;
  const tgt = storeOfNode(targetId)?.node(targetId)?.node_type;
  if (validity === "invalid") {
    toast(`No EM connection allows ${src} → ${tgt}`);
    return;
  }
  const types =
    validity === "valid" ? allowedEdgeTypes(src, tgt) : [GENERIC_EDGE];
  if (types.length === 1) {
    createEdge(fromId, targetId, types[0]);
  } else {
    showEdgeMenu(fromId, targetId, types);
  }
}

/** The relation already stands, under any spelling and — when symmetric — from
 *  either end (1.6.20): `bonded_to` A→B exists if `is_bonded_to` B→A does. */
function hasRelation(
  edges: readonly EmDocument["graph"]["edges"][number][],
  source: string,
  target: string,
  edgeType: string,
): boolean {
  const k = relationKey({ source, target, edge_type: edgeType });
  return edges.some((e) => relationKey(e) === k);
}

function createEdge(source: string, target: string, edgeType: string): void {
  if (!store) return;
  // DAG · connecting two nodes of the corpus writes the edge IN the corpus. This
  // is how the shared leaf is made by hand: a second `dtc_had_input` on an
  // output that already has one — one output, two inputs, no duplicate.
  if (canvasWritesToCorpus()) {
    const corpus = canvasStore()!;
    if (hasRelation(corpus.doc.graph.edges, source, target, edgeType)) {
      toast(`${edgeTypeLabel(edgeType)} already exists`);
      return;
    }
    corpus.addEdge(source, target, edgeType);
    return;
  }
  if (hasRelation(store.doc.graph.edges, source, target, edgeType)) {
    toast(`${edgeTypeLabel(edgeType)} already exists`);
    return;
  }
  store.addEdge(source, target, edgeType);
  // PDMEM1 · attaching an ornament (author/license/embargo) also makes it a
  // MEMBER of the referent's ParadataNodeGroup (created on demand): the badge
  // and the exploded PDG then read the same membership — one truth, two views.
  // Verso verified in filters.ts: the ornament is the edge TARGET, referent the
  // SOURCE, so attach onto `source`.
  if (ADORNMENT_EDGE_TYPES.has(edgeType))
    store.attachAdornmentToParadata(source, target);
  toast(
    `${store.node(source)?.name || source} — ${edgeTypeLabel(edgeType)} → ${store.node(target)?.name || target}`,
  );
  // NAME1 · attaching an extractor to a document is what NAMES it. EMStudio has
  // no "create from the document's handle and name it on the way" path — the
  // connect gesture creates the node first and the edge second — so the edge is
  // the trigger, which also covers an extractor attached by hand later.
  const renamed = renameOnAttach(store.doc, source);
  if (renamed) {
    store.updateNode(source, { name: renamed });
    toast(`numbered ${renamed}`);
  }
  // BUGS-UI · the same trigger for a paradata group: a PDG dropped from the
  // palette is born with a generic label and only learns its referent when this
  // edge is drawn — from then on it is `PD_<referent>`, like the groups created
  // by the ornament attach and by the epoch chronology.
  if (edgeType === HAS_PARADATA_NODEGROUP) {
    const pdgName = paradataGroupRenameOnAttach(store.doc, target);
    if (pdgName) {
      store.updateNode(target, { name: pdgName });
      toast(`named ${pdgName}`);
    }
  }
}

function showEdgeMenu(
  source: string,
  target: string,
  types: string[],
): void {
  edgeMenu.innerHTML = "";
  const title = document.createElement("div");
  title.className = "edge-menu-title";
  // DAG · name the two ends from THEIR document: on the corpus canvas both live
  // in the corpus, and `store?.node` there gave the dialog two raw UUIDs to ask
  // its question about.
  const endName = (id: string): string =>
    storeOfNode(id)?.node(id)?.name || id;
  title.textContent = `${endName(source)} → ${endName(target)}`;
  edgeMenu.appendChild(title);
  for (const t of types) {
    const b = document.createElement("button");
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    const st = edgeStyle(t);
    sw.style.borderBottomColor = st.color;
    sw.style.borderBottomStyle = st.dash.length ? "dashed" : "solid";
    b.appendChild(sw);
    b.appendChild(document.createTextNode(" " + edgeTypeLabel(t)));
    b.addEventListener("click", () => {
      hideEdgeMenu();
      createEdge(source, target, t);
    });
    edgeMenu.appendChild(b);
  }
  const cancel = document.createElement("button");
  cancel.className = "edge-menu-cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", hideEdgeMenu);
  edgeMenu.appendChild(cancel);
  const s = scene()!;
  const t = s.byId.get(target)!;
  const vp = viewport();
  edgeMenu.style.left =
    Math.min((t.x + t.w) * vp.scale + vp.x + 10, liveArea().clientWidth - 240) + "px";
  edgeMenu.style.top =
    Math.min(t.y * vp.scale + vp.y, liveArea().clientHeight - 40 * (types.length + 2)) +
    "px";
  edgeMenu.classList.remove("hidden");
}

function hideEdgeMenu(): void {
  edgeMenu.classList.add("hidden");
  edgeMenu.innerHTML = "";
}

// ---------- create a node at a point (shared by placeNode & connect-create) ----------
function createNodeAt(type: string, wx: number, wy: number): string | null {
  if (!store) return null;
  // DAG · the connect-drag dropped in the void, on the corpus canvas: the new
  // target belongs to the corpus, like everything else drawn here.
  if (canvasWritesToCorpus()) {
    const corpus = canvasStore()!;
    if (!corpusAcceptsType(type)) {
      toast(t("dtc.corpusRefusesType", { type }));
      return null;
    }
    const cid = corpus.newId();
    corpus.addNode(
      { id: cid, name: corpus.freshLabel(type), node_type: type, description: "" },
      { x: wx - 45, y: wy - 15, w: 90, h: 30 },
    );
    return cid;
  }
  if (type === "EpochNode") {
    const w = 140,
      h = 30;
    return store.addEpoch(undefined, { x: wx - w / 2, y: wy - h / 2, w, h }).id;
  }
  const id = store.newId();
  const name = initialName(store.doc, type) ?? store.freshLabel(type);
  const w = isGroupType(type) ? 120 : 90;
  const h = 30;
  const node = { id, name, node_type: type, description: "" };
  if (inContext()) {
    const gid = contextStack[contextStack.length - 1];
    store.addNode(node);
    store.moveInGroupSpace(gid, id, { x: wx - w / 2, y: wy - h / 2, w, h }, false);
    const membership = allowedEdgeTypes(type, store.node(gid)?.node_type).find(
      (t) => t.startsWith("is_in_"),
    );
    if (membership) store.addEdge(id, gid, membership);
  } else {
    store.addNode(node, { x: wx - w / 2, y: wy - h / 2, w, h });
    if (view === "matrix" && isStratigraphicType(type)) {
      const lane = scenes.matrix?.lanes.find(
        (l) => wy >= l.y && wy <= l.y + l.height,
      );
      if (lane) store.addEdge(id, lane.id, "has_first_epoch");
    }
  }
  // BUGFIX-GLYPH · re-assert the new node's box from its TYPE via em-core (see
  // placeNode): a glyph/shape is born ~square, never with the wide default box.
  void reassertSizes();
  return id;
}

// ---------- connect-drag dropped in the void → create a target node ----------
// Menu is datamodel-driven: only node types the EM rules allow as the target
// of an edge from the source, grouped by the palette taxonomy, with search.
let createMenuEl: HTMLDivElement | null = null;
function hideCreateMenu(): void {
  if (createMenuEl) {
    createMenuEl.remove();
    createMenuEl = null;
    document.removeEventListener("pointerdown", onCreateMenuOutside, true);
    document.removeEventListener("keydown", onCreateMenuKey, true);
  }
}
function onCreateMenuOutside(e: PointerEvent): void {
  if (createMenuEl && !createMenuEl.contains(e.target as Node)) hideCreateMenu();
}
function onCreateMenuKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    hideCreateMenu();
  }
}
function onPickCreate(
  fromId: string,
  type: string,
  wx: number,
  wy: number,
): void {
  if (!store) return;
  hideCreateMenu();
  const srcType = storeOfNode(fromId)?.node(fromId)?.node_type;
  const newId = createNodeAt(type, wx, wy);
  if (!newId) return;
  const eTypes = allowedEdgeTypes(srcType, type);
  if (eTypes.length > 1) showEdgeMenu(fromId, newId, eTypes);
  else createEdge(fromId, newId, eTypes[0] ?? GENERIC_EDGE);
  ensureCircleVisibleFor(type); // reveal its ring if the filter hid it
  select(newId);
  if (vocabularyFor(type)) openQualiaPicker(newId, wx, wy); // pick its label
}
function showCreateNodeMenu(fromId: string, wx: number, wy: number): void {
  if (!store) return;
  const srcType = storeOfNode(fromId)?.node(fromId)?.node_type;
  // group the datamodel-allowed target types by the palette taxonomy
  const groups: { label: string; types: string[] }[] = [];
  for (const sec of SECTIONS) {
    const allowed = sec.types.filter(
      (t) => connectValidity(srcType, t) === "valid",
    );
    if (allowed.length) groups.push({ label: sec.label, types: allowed });
  }
  hideCreateMenu();
  const menu = document.createElement("div");
  menu.className = "connect-menu";
  const title = document.createElement("div");
  title.className = "cm-title";
  title.textContent = `New node from ${storeOfNode(fromId)?.node(fromId)?.name || srcType}`;
  menu.appendChild(title);
  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "cm-empty";
    empty.textContent = "No node type is a valid edge target from here.";
    menu.appendChild(empty);
  } else {
    const search = document.createElement("input");
    search.className = "cm-search";
    search.type = "search";
    search.placeholder = "Search node types…";
    menu.appendChild(search);
    const list = document.createElement("div");
    list.className = "cm-list";
    menu.appendChild(list);
    const renderList = (q: string): void => {
      list.innerHTML = "";
      const ql = q.trim().toLowerCase();
      for (const g of groups) {
        const hits = g.types.filter(
          (t) =>
            !ql ||
            t.toLowerCase().includes(ql) ||
            (typeDescription(t) || "").toLowerCase().includes(ql),
        );
        if (!hits.length) continue;
        const h = document.createElement("div");
        h.className = "cm-sect";
        h.textContent = g.label;
        list.appendChild(h);
        for (const t of hits) {
          const b = document.createElement("button");
          b.className = "cm-item";
          b.textContent = t;
          b.title = typeDescription(t) || t;
          b.addEventListener("click", () => onPickCreate(fromId, t, wx, wy));
          list.appendChild(b);
        }
      }
    };
    search.addEventListener("input", () => renderList(search.value));
    renderList("");
    setTimeout(() => search.focus(), 0);
  }
  const vp = viewport();
  const sx = Math.min(wx * vp.scale + vp.x, liveArea().clientWidth - 244);
  const sy = Math.min(wy * vp.scale + vp.y, liveArea().clientHeight - 280);
  menu.style.left = Math.max(4, sx) + "px";
  menu.style.top = Math.max(4, sy) + "px";
  liveArea().appendChild(menu);
  createMenuEl = menu;
  document.addEventListener("pointerdown", onCreateMenuOutside, true);
  document.addEventListener("keydown", onCreateMenuKey, true);
}

// ---------- controlled-vocabulary picker (PropertyNode → qualia label) ----------
let vocabMenuEl: HTMLDivElement | null = null;
function hideVocabMenu(): void {
  if (vocabMenuEl) {
    vocabMenuEl.remove();
    vocabMenuEl = null;
    document.removeEventListener("pointerdown", onVocabOutside, true);
    document.removeEventListener("keydown", onVocabKey, true);
  }
}
function onVocabOutside(e: PointerEvent): void {
  if (vocabMenuEl && !vocabMenuEl.contains(e.target as Node)) hideVocabMenu();
}
function onVocabKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    hideVocabMenu();
  }
}
function escapeHtml(text: string): string {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

/** The facts the vocabulary records about a term besides its prose: value type,
 *  admitted units or values, and the authority it maps onto. */
function qualiaFacts(q: Qualia): string[] {
  const out: string[] = [];
  if (q.dataType) out.push(`type: ${q.dataType}`);
  if (q.units?.length) out.push(`units: ${q.units.join(", ")}`);
  if (q.values?.length) out.push(`values: ${q.values.join(", ")}`);
  const cidoc = q.mappings?.["cidoc_crm"];
  if (cidoc) out.push(`CIDOC ${cidoc}`);
  return out;
}

/** A term's tooltip. It used to fall back to the term's own NAME, which reads
 *  as "no tooltip" — the label is already on screen. Where the vocabulary has
 *  no prose, say where the term sits and what it takes instead. */
function qualiaTooltip(q: Qualia): string {
  const prose = q.rationale || q.description;
  const facts = qualiaFacts(q);
  const place = `${q.categoryLabel} → ${q.subcategoryLabel}`;
  return [prose ?? place, ...(facts.length ? [facts.join(" · ")] : [])].join(
    "\n",
  );
}

// Open the qualia catalogue on a just-created (or selected) PropertyNode so its
// label is picked from the controlled vocabulary; each term shows its
// rationale + example. Cancelling leaves the default label.
function openQualiaPicker(nodeId: string, wx: number, wy: number): void {
  if (!store) return;
  const vocab = vocabularyFor(store.node(nodeId)?.node_type);
  if (!vocab) return;
  hideVocabMenu();
  const menu = document.createElement("div");
  menu.className = "connect-menu vocab-menu";
  const title = document.createElement("div");
  title.className = "cm-title";
  title.textContent = "Property — pick a vocabulary term";
  menu.appendChild(title);
  const search = document.createElement("input");
  search.className = "cm-search";
  search.type = "search";
  search.placeholder = "Search qualia…";
  menu.appendChild(search);
  const listEl = document.createElement("div");
  listEl.className = "cm-list";
  menu.appendChild(listEl);
  const detail = document.createElement("div");
  detail.className = "vocab-detail";
  menu.appendChild(detail);
  // The box under the list. Many terms carry no prose in the vocabulary yet
  // (19 of 88 at 1.6.0 — the dimensional ones especially), and it used to say
  // so and stop, which is a dead end for the reader. Nothing may be invented
  // here, so instead it falls back to what the vocabulary DOES record about
  // the term: where it sits, what type of value it takes, in which units, and
  // which authority it maps onto.
  const showDetail = (q: Qualia): void => {
    const bits: string[] = [];
    if (q.rationale) bits.push(`<b>Why</b> ${q.rationale}`);
    if (q.example) bits.push(`<b>e.g.</b> ${q.example}`);
    if (!bits.length && q.description) bits.push(q.description);
    if (!bits.length) {
      bits.push(`<i>${escapeHtml(q.categoryLabel)} → ${escapeHtml(q.subcategoryLabel)}</i>`);
      if (q.subcategoryDescription)
        bits.push(escapeHtml(q.subcategoryDescription));
    }
    const facts = qualiaFacts(q);
    if (facts.length) bits.push(facts.map(escapeHtml).join(" · "));
    detail.innerHTML = bits.join("<br>");
  };
  const pick = (q: Qualia): void => {
    hideVocabMenu();
    const prev = (store!.node(nodeId)?.data ?? {}) as Record<string, unknown>;
    store!.updateNode(nodeId, {
      name: q.name,
      data: {
        ...prev,
        property_type: q.id,
        ...(q.dataType ? { data_type: q.dataType } : {}),
      },
    });
    select(nodeId);
    toast(`property → ${q.name}`);
  };
  const render = (query: string): void => {
    listEl.innerHTML = "";
    const ql = query.trim().toLowerCase();
    const match = (q: Qualia): boolean =>
      !ql ||
      [q.name, q.id, q.description, q.rationale, q.categoryLabel, q.subcategoryLabel].some(
        (s) => (s ?? "").toLowerCase().includes(ql),
      );
    let lastCat = "",
      lastSub = "";
    let first: Qualia | null = null;
    for (const q of vocab) {
      if (!match(q)) continue;
      if (!first) first = q;
      if (q.category !== lastCat) {
        lastCat = q.category;
        lastSub = "";
        const h = document.createElement("div");
        h.className = "cm-sect";
        h.textContent = q.categoryLabel;
        // the category's gloss, straight from em_qualia_types.json — these
        // headers carried no tooltip at all while every item below them did
        if (q.categoryDescription) h.title = q.categoryDescription;
        listEl.appendChild(h);
      }
      if (q.subcategory !== lastSub) {
        lastSub = q.subcategory;
        const sh = document.createElement("div");
        sh.className = "cm-subsect";
        sh.textContent = q.subcategoryLabel;
        if (q.subcategoryDescription) sh.title = q.subcategoryDescription;
        listEl.appendChild(sh);
      }
      const b = document.createElement("button");
      b.className = "cm-item";
      b.textContent = q.name;
      b.title = qualiaTooltip(q);
      b.addEventListener("mouseenter", () => showDetail(q));
      b.addEventListener("focus", () => showDetail(q));
      b.addEventListener("click", () => pick(q));
      listEl.appendChild(b);
    }
    if (first) showDetail(first);
    else detail.textContent = "no match";
  };
  search.addEventListener("input", () => render(search.value));
  render("");
  const vp = viewport();
  const sx = Math.min(wx * vp.scale + vp.x, liveArea().clientWidth - 264);
  const sy = Math.min(wy * vp.scale + vp.y, liveArea().clientHeight - 340);
  menu.style.left = Math.max(4, sx) + "px";
  menu.style.top = Math.max(4, sy) + "px";
  liveArea().appendChild(menu);
  vocabMenuEl = menu;
  setTimeout(() => search.focus(), 0);
  document.addEventListener("pointerdown", onVocabOutside, true);
  document.addEventListener("keydown", onVocabKey, true);
}

// ---------- toolbar wiring ----------
// header dropdown menus (File / Export): toggle on click, close on outside
// click, close after picking an item (the item's own handler still fires).
function closeAllDropdowns(): void {
  document.querySelectorAll(".dd-menu").forEach((m) => m.classList.add("hidden"));
}
document.querySelectorAll<HTMLElement>(".dropdown").forEach((dd) => {
  const toggle = dd.querySelector<HTMLButtonElement>(".dd-toggle")!;
  const menu = dd.querySelector<HTMLElement>(".dd-menu")!;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.classList.contains("hidden");
    closeAllDropdowns();
    if (!willOpen) return;
    menu.classList.remove("hidden");
    // a menu in the window bar is `fixed` (the bar scrolls) → place it by hand
    if (dd.closest("#window-header")) placeBarMenu(toggle, menu);
  });
  menu.addEventListener("click", () => menu.classList.add("hidden"));
});
// BUGS-UI · nested sub-menus inside a dropdown (File ▸ Export). The toggle must
// NOT bubble: the parent menu closes on any click inside it, so an un-stopped
// click would close the very menu the flyout hangs from. Picking an item does
// bubble — that closes both, which is what finishing a command should do.
function closeAllSubmenus(): void {
  document.querySelectorAll(".dd-sub-menu").forEach((m) => m.classList.add("hidden"));
}
document.querySelectorAll<HTMLElement>(".dd-sub").forEach((sub) => {
  const toggle = sub.querySelector<HTMLButtonElement>(".dd-sub-toggle")!;
  const menu = sub.querySelector<HTMLElement>(".dd-sub-menu")!;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.classList.contains("hidden");
    closeAllSubmenus();
    if (willOpen) menu.classList.remove("hidden");
  });
});
document.addEventListener("click", () => {
  closeAllDropdowns();
  closeAllSubmenus();
});

const fileInput = document.getElementById("file-input") as HTMLInputElement;
/**
 * AUX1 · the auxiliary-file picker of the active slot.
 *
 * A second input rather than reusing `fileInput`: that one LOADS a document, and
 * one input serving two meanings is how a picked xlsx ends up replacing the graph.
 */
const auxFileInput = document.getElementById(
  "aux-file-input",
) as HTMLInputElement;
auxFileInput.addEventListener("change", () => {
  const f = auxFileInput.files?.[0];
  auxFileInput.value = ""; // so picking the same file again still fires
  const slot = emtree.active();
  if (!f || !slot) return;
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
  // Guess the TYPE from the extension, and only as a starting point: the dropdown
  // in the detail panel is what decides, because the same .xlsx can be an EMdb
  // workbook or a source list and no extension can tell them apart.
  const lower = f.name.toLowerCase();
  const fileType = lower.endsWith(".sqlite") || lower.endsWith(".db")
    ? "pyarchinit"
    : "emdb_xlsx";
  slot.auxiliaryFiles.push({
    id: crypto.randomUUID(),
    name: f.name,
    kind: "local",
    locator: rel || f.name,
    fileType,
    baked: false,
    mapped: false,
    expanded: true, // opened on arrival: the type usually needs correcting
  });
  refreshEMTree();
  toast(`${f.name} attached to ${slotLabel(slot)} — map it to see it in blue`);
});

/**
 * AUX2 · MAP a source into the graph as VOLATILE nodes.
 *
 * xlsx types go through the bridge (`/import-em-data`), which builds a document
 * from the workbook using an s3Dgraphy registry mapping (DP-61) — we do NOT
 * re-implement the mapping in TS. The returned nodes/edges are injected into the
 * live graph marked volatile (blue on the canvas and in the EM-Data table), and
 * excluded from `toJSON` until baked. The other types need a bridge endpoint that
 * is not exposed yet (flagged); they report that rather than pretend.
 */
async function mapAux(auxId: string): Promise<void> {
  const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
  if (!f || !store) return;
  // AUX-COMPLETE: the xlsx aux types map through the bridge /import-em-data.
  // emdb_xlsx / pyarchinit / source_list carry a registry `mapping` (their sheet
  // is transformed to nodes by the s3Dgraphy mapping); a bare em_data.xlsx has no
  // mapping (read directly). dosco / resource_collection are folder-based and use
  // a different endpoint — flagged as follow-up.
  // AUX2B · resource_collection is a FOLDER: scan it via the bridge
  // (/scan-resources, which already exists) and bring its orphan files in as
  // VOLATILE ResourceNodes (same volatile→bake cycle as the xlsx types). dosco
  // (documents harvest) still needs a dedicated endpoint — flagged.
  if (f.fileType === "resource_collection") {
    await mapResourceCollection(f, auxId);
    return;
  }
  // IMPMAP · a MAPPED SOURCE goes through /mapping-apply instead, because its
  // mapping is a file beside the dataset rather than a name in the registry —
  // which is what every partner's descriptor looks like. The five types above
  // keep /import-em-data: that endpoint is in use, and the two ways in converge
  // here, at the routing, not by breaking one of them.
  if (f.fileType === "mapped_source") {
    await mapMappedSource(f, auxId);
    return;
  }
  if (
    f.fileType !== "emdb_xlsx" &&
    f.fileType !== "pyarchinit" &&
    f.fileType !== "source_list"
  ) {
    toast(`${f.fileType}: folder mapping needs a dedicated endpoint (follow-up) — see the note`);
    return;
  }
  const mapping = String((f.options ?? {}).mapping ?? "").trim();
  toast(`mapping ${f.name}…`);
  try {
    const res = await fetch(`${await bridgeUrl()}/import-em-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: f.locator,
        graph_id: String(
          (store.doc.graph as Record<string, unknown>).graph_id ?? "",
        ),
        ...(mapping ? { mapping } : {}),
      }),
    });
    if (!res.ok) throw new Error(`bridge ${res.status}`);
    const payload = (await res.json()) as { doc?: EmDocument };
    const g = payload.doc?.graph;
    if (!g || !Array.isArray(g.nodes)) throw new Error("no graph in response");
    const added = store.mapVolatile(auxId, g.nodes, g.edges ?? []);
    f.mapped = true;
    f.baked = false;
    refreshEMTree();
    toast(`mapped ${f.name} — ${added} volatile node(s) in blue; save excludes them until baked`);
  } catch (e) {
    toast(
      `map failed (${e instanceof Error ? e.message : e}). The bridge (dev.sh) ` +
        `must be running to map an xlsx via the s3Dgraphy registry.`,
    );
  }
}

/**
 * AUX2B · map a `resource_collection` FOLDER as VOLATILE ResourceNodes.
 *
 * Reuses the existing `/scan-resources` (which returns the folder's orphan files
 * with stable ids: `{resource_id, key_id, filename, rel_path}`) and the AUX2
 * volatile path (`store.mapVolatile`): the files enter the graph as ResourceNode
 * (node_type from the vendored registry) marked volatile — blue on the canvas
 * and the EM-Data table, excluded from save until baked. No new mapping logic;
 * no schema invention. Linking a resource to a node (the "hat") stays a later
 * step — here they arrive as the orphan resources the Shelf already models.
 */
async function mapResourceCollection(
  f: { id: string; name: string; locator: string },
  auxId: string,
): Promise<void> {
  if (!store) return;
  const nt = nodeTypeForClass("ResourceNode") ?? "resource";
  toast(`scanning ${f.name}…`);
  try {
    const res = await fetch(`${await bridgeUrl()}/scan-resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: f.locator, doc: store.doc }),
    });
    if (!res.ok) throw new Error(`bridge ${res.status}`);
    const payload = (await res.json()) as {
      shelf?: Array<{ resource_id: string; filename: string; rel_path: string }>;
    };
    const shelf = payload.shelf ?? [];
    const nodes: EmNode[] = shelf.map((r) => ({
      id: r.resource_id,
      name: r.filename,
      node_type: nt,
      description: "",
      data: { url: r.rel_path, url_type: resourceTypeOfLocator(r.filename) },
    }));
    const added = store.mapVolatile(auxId, nodes, []);
    const aux = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (aux) {
      aux.mapped = true;
      aux.baked = false;
    }
    refreshEMTree();
    toast(`mapped ${f.name} — ${added} volatile resource(s) in blue; save excludes them until baked`);
  } catch (e) {
    toast(
      `scan failed (${e instanceof Error ? e.message : e}). The bridge (dev.sh) ` +
        `must be running to scan a resource folder.`,
    );
  }
}

/**
 * IMPMAP · map a MAPPED SOURCE onto THIS graph — the second of the two modes.
 *
 * The other five aux types are shapes somebody agreed on once; this one is any
 * table or XML plus the descriptor that says how to read it, which is how a
 * partner's dataset actually arrives. It goes through `/mapping-apply` and not
 * `/import-em-data` because only that route takes a mapping FILE and, since this
 * round, a host graph to land on.
 *
 * Two things make it the attach mode and not a second import:
 *
 *  * `attach_only` — a row whose key is not in this graph creates NOTHING. The
 *    stratigraphy here is authoritative and the table enriches it; without the
 *    flag a typo in the key column excavates a unit (measured: 620 nodes, one
 *    bad row, 624 nodes, no warning);
 *  * the answer is a DELTA, so it enters through the same volatile path as every
 *    other auxiliary (`store.mapVolatile`) and the existing volatile → bake →
 *    unmap cycle works on it without a second concept.
 *
 * And the keys that matched nothing are kept on the row. A count in a toast is
 * not an answer to "which ones?" ten minutes later.
 */
async function mapMappedSource(f: AuxiliaryFile, auxId: string): Promise<void> {
  if (!store) return;
  const mappingPath = String((f.options ?? {}).mappingPath ?? "").trim();
  const mappingName = String((f.options ?? {}).mappingName ?? "").trim();
  if (!mappingPath && !mappingName) {
    toast(t("impmap.needMapping"));
    return;
  }
  toast(t("impmap.mapping", { name: f.name }));
  try {
    const answer = await applyMapping({
      path: f.locator,
      ...(mappingPath ? { mapping_path: mappingPath }
                      : { mapping_name: mappingName }),
      mode: "volatile",
      attach_only: true,
      // the host graph travels in the body: the bridge holds no documents, so
      // "this graph" is said by sending it
      doc: store.doc,
      graph_id: String(
        (store.doc.graph as Record<string, unknown>).graph_id ?? "",
      ),
      injector: auxId,
    });
    if (!answer) return;
    const report = auxReportOf(answer.report);
    const g = answer.graph?.graph;
    const added = g && Array.isArray(g.nodes)
      ? store.mapVolatile(auxId, g.nodes, g.edges ?? [])
      : 0;
    f.mapped = true;
    f.baked = false;
    f.report = report;
    refreshEMTree();
    draw();
    toast(report.unmatchedCount
      ? t("impmap.attachedWithUnmatched", {
          name: f.name, added: String(added),
          unmatched: String(report.unmatchedCount) })
      : t("impmap.attached", { name: f.name, added: String(added) }));
  } catch (e) {
    toast(t("impmap.failed",
            { detail: e instanceof Error ? e.message : String(e) }));
  }
}


// ── IMPMAP · «Import with a mapping», the ONE way in ────────────────────────
//
// There are two ways a legacy dataset becomes a graph, and until this round each
// lived in a different part of the interface, incompatible with the other:
//
//  * **the table brings the stratigraphy.** Relations in the columns; the graph
//    is born out of the dataset. Only structured databases can do it (DANA, UA
//    Ilici, pyArchInit). One shot — it is not repeated;
//  * **the graph brings the stratigraphy, the table brings the rest.** Far more
//    common: there are no relations in the table at all. The sequence is drawn
//    here, and an external table is attached to it, mapped, and re-read whenever
//    it changes.
//
// The first lived inside the mapping EDITOR (which could only ever make a new
// graph), the second inside the auxiliary-files list (which could only take five
// hard-coded types and a registry name). So the ordinary case — a partner's csv
// with the descriptor written beside it — fitted neither.
//
// This dialog asks the three questions that actually distinguish them, and
// nothing else: WHAT to read, HOW to read it, and WHERE it lands. The target is
// the only real choice, and it is two radio buttons rather than two menu items,
// because it is one act performed on two different things.
function openImportWithMapping(): void {
  const slot = emtree.active();
  const modal = document.createElement("div");
  modal.className = "modal";
  const card = document.createElement("div");
  card.className = "modal-card narrow";
  card.innerHTML = `
    <div class="modal-head"><span>${escapeHtml(t("impmap.title"))}</span></div>
    <div class="modal-body impmap">
      <p class="impmap-intro">${escapeHtml(t("impmap.intro"))}</p>
      <label class="impmap-field"><span>${escapeHtml(t("impmap.source"))}</span>
        <span class="impmap-row">
          <input id="impmap-source" type="text" placeholder="${escapeHtml(t("impmap.sourceHint"))}" />
          <button id="impmap-pick-source" type="button">${escapeHtml(t("impmap.choose"))}</button>
        </span>
      </label>
      <fieldset class="impmap-field">
        <legend>${escapeHtml(t("impmap.mapping"))}</legend>
        <label class="impmap-inline">
          <input type="radio" name="impmap-mapping" value="file" checked />
          <span>${escapeHtml(t("impmap.mappingFile"))}</span>
        </label>
        <span class="impmap-row">
          <input id="impmap-mapping-path" type="text" placeholder="${escapeHtml(t("impmap.mappingFileHint"))}" />
          <button id="impmap-pick-mapping" type="button">${escapeHtml(t("impmap.choose"))}</button>
        </span>
        <label class="impmap-inline">
          <input type="radio" name="impmap-mapping" value="registry" />
          <span>${escapeHtml(t("impmap.mappingRegistry"))}</span>
        </label>
        <input id="impmap-mapping-name" type="text" placeholder="${escapeHtml(t("impmap.mappingRegistryHint"))}" disabled />
      </fieldset>
      <fieldset class="impmap-field">
        <legend>${escapeHtml(t("impmap.target"))}</legend>
        <label class="impmap-inline">
          <input type="radio" name="impmap-target" value="new" checked />
          <span>${escapeHtml(t("impmap.targetNew"))}</span>
        </label>
        <p class="aux-hint">${escapeHtml(t("impmap.targetNewWhy"))}</p>
        <label class="impmap-inline">
          <input type="radio" name="impmap-target" value="this" ${slot ? "" : "disabled"} />
          <span>${escapeHtml(t("impmap.targetThis"))}${slot ? ` — ${escapeHtml(slotLabel(slot))}` : ""}</span>
        </label>
        <p class="aux-hint">${escapeHtml(slot ? t("impmap.targetThisWhy") : t("impmap.noGraph"))}</p>
      </fieldset>
      <p id="impmap-note" class="aux-hint"></p>
    </div>
    <div class="modal-foot">
      <button id="impmap-cancel" type="button">${escapeHtml(t("impmap.cancel"))}</button>
      <button id="impmap-run" class="primary" type="button">${escapeHtml(t("impmap.run"))}</button>
    </div>`;
  modal.appendChild(card);
  const q = <T extends HTMLElement>(sel: string): T =>
    card.querySelector(sel) as T;
  const sourceInput = q<HTMLInputElement>("#impmap-source");
  const mappingPath = q<HTMLInputElement>("#impmap-mapping-path");
  const mappingName = q<HTMLInputElement>("#impmap-mapping-name");
  const note = q<HTMLElement>("#impmap-note");
  const run = q<HTMLButtonElement>("#impmap-run");
  const close = (): void => {
    modal.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  const mappingMode = (): string =>
    (card.querySelector("input[name=impmap-mapping]:checked") as HTMLInputElement)
      .value;
  const targetMode = (): string =>
    (card.querySelector("input[name=impmap-target]:checked") as HTMLInputElement)
      .value;
  for (const radio of card.querySelectorAll("input[name=impmap-mapping]")) {
    radio.addEventListener("change", () => {
      const byFile = mappingMode() === "file";
      mappingPath.disabled = !byFile;
      q<HTMLButtonElement>("#impmap-pick-mapping").disabled = !byFile;
      mappingName.disabled = byFile;
    });
  }
  q<HTMLButtonElement>("#impmap-pick-source").addEventListener("click", () => {
    void pickPathInto(sourceInput, note, "source");
  });
  q<HTMLButtonElement>("#impmap-pick-mapping").addEventListener("click", () => {
    void pickPathInto(mappingPath, note, "mapping");
  });
  q<HTMLButtonElement>("#impmap-cancel").addEventListener("click", close);
  run.addEventListener("click", () => void (async () => {
    const path = sourceInput.value.trim();
    const byFile = mappingMode() === "file";
    const mapping = (byFile ? mappingPath : mappingName).value.trim();
    if (!path) {
      note.textContent = t("impmap.needSource");
      return;
    }
    if (!mapping) {
      note.textContent = t("impmap.needMapping");
      return;
    }
    run.disabled = true;
    note.textContent = t("impmap.working");
    const ok = await runImportWithMapping(
      path, byFile ? { mapping_path: mapping } : { mapping_name: mapping },
      targetMode() === "this");
    run.disabled = false;
    if (ok) close();
    else note.textContent = t("impmap.seeToast");
  })());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(modal);
  sourceInput.focus();
}

/** A real PATH into a field: the native dialog on the desktop, and in a browser
 *  the system dialog plus the bridge's staging — because `<input type=file>`
 *  hands over bytes and withholds the location, and the bridge reads the file. */
async function pickPathInto(
  field: HTMLInputElement, note: HTMLElement, what: "source" | "mapping",
): Promise<void> {
  await ensureMappingCatalog();
  const extensions = what === "mapping"
    ? ["json"] : Object.keys(meState.extensions ?? {});
  if (isTauri()) {
    const picked = await pickSourceFile(extensions);
    if (picked) field.value = picked;
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  if (extensions.length) input.accept = extensions.map((e) => `.${e}`).join(",");
  input.addEventListener("change", () => void (async () => {
    const file = input.files?.[0];
    if (!file) return;
    note.textContent = t("me.staging", { name: file.name });
    const path = await stageThroughBridge(file);
    note.textContent = path ? t("impmap.staged", { name: file.name })
                            : t("me.stageFailed", { name: file.name });
    if (path) field.value = path;
  })());
  input.click();
}

/**
 * Run the import against whichever target was chosen. Returns whether it worked.
 *
 * The two branches are deliberately NOT two implementations:
 *
 *  * **new graph** → `mode: "bake"`, no host, nothing to skip. The document that
 *    comes back is adopted as a graph of the project, exactly as the mapping
 *    editor's Apply has always done;
 *  * **this graph** → an auxiliary ROW is registered on the slot and then mapped
 *    through the ordinary `mapAux`. Not a shortcut: an attached table is a thing
 *    with a life (unmap, re-map when the file changes, bake when it is agreed),
 *    and that life already exists on the auxiliary list. A second concept beside
 *    it would be a second thing to bake.
 */
async function runImportWithMapping(
  path: string, mapping: Record<string, string>, onThisGraph: boolean,
): Promise<boolean> {
  const name = path.split(/[\\/]/).pop() || path;
  if (onThisGraph) {
    const slot = emtree.active();
    if (!slot) {
      toast(t("impmap.noGraph"));
      return false;
    }
    const auxId = crypto.randomUUID();
    slot.auxiliaryFiles.push({
      id: auxId,
      name,
      kind: "local",
      locator: path,
      fileType: "mapped_source" as AuxFileType,
      baked: false,
      mapped: false,
      expanded: true,   // opened on arrival: this is where the unmatched appear
      options: {
        mappingPath: mapping.mapping_path ?? "",
        mappingName: mapping.mapping_name ?? "",
      },
    });
    refreshEMTree();
    await mapAux(auxId);
    // `mapAux` reports its own outcome; it also leaves `mapped` false when the
    // bridge refused, and an aux row that was never mapped is exactly what the
    // user should be looking at to fix the mapping and try again.
    return true;
  }
  toast(t("impmap.mappingVerb", { name }));
  try {
    const answer = await applyMapping({ path, ...mapping, mode: "bake" });
    const doc = answer?.graph;
    if (!doc) throw new Error("no graph in response");
    const report = auxReportOf(answer?.report);
    loadDocument(doc, name, null);
    refreshEMTree();
    draw();
    toast(t("impmap.imported", { name, nodes: String(report.nodesAdded),
                                 edges: String(report.edgesAdded),
                                 rows: String(report.rows) }));
    return true;
  } catch (e) {
    toast(t("impmap.failed",
            { detail: e instanceof Error ? e.message : String(e) }));
    return false;
  }
}

/** The bridge's report, in the shape the aux row keeps. */
function auxReportOf(report: unknown): AuxMapReport {
  const r = (report ?? {}) as Record<string, unknown>;
  const unmatched = Array.isArray(r.unmatched)
    ? (r.unmatched as unknown[]).map(String) : [];
  return {
    rows: Number(r.rows ?? 0),
    nodesAdded: Number(r.nodes_added ?? 0),
    edgesAdded: Number(r.edges_added ?? 0),
    unmatched,
    // the COUNT comes from the library, not from the list's length: the list is
    // what came back, and a future cap on it there must not make the count lie
    unmatchedCount: Number(r.unmatched_count ?? unmatched.length),
  };
}

/** POST /mapping-apply. One place, because the import dialog and the aux row
 *  are the same request with a different target. */
async function applyMapping(
  body: Record<string, unknown>,
): Promise<{ report?: unknown; graph?: EmDocument; delta?: boolean } | null> {
  const res = await fetch(`${await bridgeUrl()}/mapping-apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = (await res.json().catch(() => null)) as
    { ok?: boolean; error?: string; report?: { errors?: string[] };
      graph?: EmDocument; delta?: boolean } | null;
  if (!res.ok || !answer?.ok) {
    // the bridge's own sentence when it has one: "no such file: …" says more
    // than "bridge 404", and the mapping's own errors say more than either
    const errors = answer?.report?.errors ?? [];
    throw new Error(errors.length ? errors.join("; ")
                                  : (answer?.error ?? `bridge ${res.status}`));
  }
  return answer;
}
document
  .getElementById("btn-new")!
  .addEventListener("click", async () => {
    // In Sidecar (sync) mode the graph is the host's; a New document must
    // leave sync (optionally asking the host to save first) and return to
    // Standalone, mirroring the online build.
    if (!(await confirmLeaveSidecar("Starting a new document"))) return;
    newDocument();
  });
document
  .getElementById("btn-open")!
  .addEventListener("click", () => void openDocument());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
  fileInput.value = "";
});
document
  .getElementById("btn-save")!
  .addEventListener("click", () => void saveDocument());
document
  .getElementById("btn-save-as")!
  .addEventListener("click", () => void saveAsDocument());
document
  .getElementById("btn-pin-version")
  ?.addEventListener("click", () => pinProjectVersion());
// P3 · the panel can be dismissed; the chip is how it comes back. A notice you
// cannot re-read is a notice you were only allowed to see once.
document.getElementById("conflict-reopen")?.addEventListener("click", () => {
  if (lastMergeConflicts.length) showConflictPanel(lastMergeConflicts);
});
document.getElementById("btn-svg")!.addEventListener("click", () => {
  const s = scene();
  if (!s || !store) return;
  const g = store.doc.graph;
  const title = String(g["name"] ?? g.graph_id ?? "graph");
  const svg = sceneToSvg(s, edgeVisible, title);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^\w.-]+/g, "_")}_${inContext() ? "group" : view}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// Export/import GraphML via the s3Dgraphy "transformer" service — the frontend
// cannot run s3Dgraphy (ADR-001 invariant 2), so it POSTs the .em.json / GraphML
// to an HTTP endpoint. That endpoint is PLUGGABLE (precedence):
//   1. ?bridge= query param       (explicit override, dev/debug)
//   2. window.EM_BRIDGE           (injected)
//   3. desktop: the Rust `transformer_url` command — a remote StratiGraph
//      server if EM_TRANSFORMER_URL is set, else the local em-bridge sidecar
//   4. browser dev default        (./dev.sh bridge on :8765)
/** Which scope a URI added by hand gets — remembered between additions, because
 *  somebody adding comparanda adds several in a row. */
let shelfUrlScope: ShelfScope = "own-study";
/** How a pasted URI is REACHED — `open` (click it) or `subscribe` (you register
 *  first). Not a rights statement: the licence says what you may DO with the
 *  object, this says whether you can reach it at all. The two values come from
 *  the API (`api.access_modes()`, they travel with the table); this is only the
 *  current pick, and `open` is the sane default for a link somebody just
 *  pasted. */
let shelfUriAccess = "open";
// …and the table itself. Declared HERE, next to the rest of the shelf's state,
// and not next to the renderer that uses it: the shelf bar is wired up in this
// file's top-level flow (well before the render section), and a `let` declared
// after that point is in its TDZ when the wiring runs — measured, in the
// browser, as `Cannot access 'shelfTable' before initialization` with a blank
// app behind it. Module order is load-bearing in this file.
let shelfTable: ShelfTable = EMPTY_TABLE;
let shelfTableNote: string | null = null;
let shelfTableBusy = false;
/** Has the table been asked for since the shelf last changed? The table is a
 *  read-model, so it has to be FETCHED before it can be drawn — and drawing an
 *  un-fetched one shows "the shelf is empty" over a shelf that is not (measured,
 *  on first entering Table mode). Cleared whenever the shelf changes, so the
 *  next draw asks again instead of showing a stale answer. */
let shelfTableAsked = false;

let _bridgeUrl: string | null = null;
async function bridgeUrl(): Promise<string> {
  if (_bridgeUrl) return _bridgeUrl;
  _bridgeUrl =
    new URLSearchParams(location.search).get("bridge") ??
    (window as unknown as { EM_BRIDGE?: string }).EM_BRIDGE ??
    (await transformerUrl()) ??
    "http://localhost:8765";
  return _bridgeUrl;
}
const BRIDGE_UNREACHABLE =
  "GraphML transformer not reachable — the local sidecar may still be starting; " +
  "otherwise start it with ./dev.sh (or set EM_TRANSFORMER_URL to a server)";
// `geo.ts` needs the bridge for reprojection (G1) but must not import main.ts.
// Endpoint precedence stays owned here, in one place; the geo module is handed
// the resolver rather than reconstructing it.
setBridgeResolver(bridgeUrl);
// W1 · the Storage/Viewer file routes need the same endpoint, by the same rule.
setStorageBridgeResolver(bridgeUrl);
// …e le stesse due, per il timbro e per le piste: UN posto decide dov'è il
// bridge, e nessun modulo se lo ricostruisce (DTCEMS1).
setStampBridgeResolver(bridgeUrl);
setHintsBridgeResolver(bridgeUrl);
setComposeBridgeResolver(bridgeUrl);
document.getElementById("btn-graphml")!.addEventListener("click", async () => {
  if (!store) {
    toast("Open a document first");
    return;
  }
  const g = store.doc.graph;
  const name = String(g["name"] ?? g.graph_id ?? "graph");
  toast("Exporting GraphML…");
  try {
    const res = await fetch(`${await bridgeUrl()}/graphml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: store.toJSON(),
    });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON error body */
      }
      toast(`GraphML export failed: ${msg}`);
      return;
    }
    const xml = await res.text();
    const filename = `${name.replace(/[^\w.-]+/g, "_")}.graphml`;
    if (isTauri()) {
      // Native "Save As…" dialog — the webview has no browser download UI.
      const path = await saveGraphml(xml, filename);
      if (!path) return; // cancelled
      toast(`GraphML exported → ${baseName(path)}`);
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("GraphML exported");
    }
  } catch {
    toast(BRIDGE_UNREACHABLE);
  }
});

// DP-79 P1 · export the NARRATIVE — LaTeX, Word, HTML.
//
// Same shape as the Turtle button below and for the same reason (invariant 2):
// the exporters live in s3Dgraphy, this POSTs the document and downloads what
// comes back. Three formats through ONE route because they are three renderings
// of one bake — the moment they became three traversals of the graph they would
// start disagreeing about what the narrative said.
//
// A static target is a SNAPSHOT: the embeds are resolved once, at export. That
// is stated in the exported file itself, not only here — a reader who is handed
// the .docx has no other way to know.
const NARRATIVE_FORMATS: Record<string, { mime: string; ext: string; label: string }> = {
  html: { mime: "text/html", ext: "html", label: "HTML" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx", label: "Word",
  },
  latex: { mime: "application/x-tex", ext: "tex", label: "LaTeX" },
  // The fourth, and the only live one: its cells QUERY the study instead of
  // quoting it, so re-running the notebook says what the study says then.
  ipynb: { mime: "application/x-ipynb+json", ext: "ipynb", label: "Jupyter" },
};

/**
 * The figures of a narrative's visual embeds, rendered HERE, for an export.
 *
 * Why here and not in the exporter: **a matrix is drawn by the layout engine,
 * and the engine is in this process.** Its lanes are semantic (`has_first_epoch`
 * plus the `is_after` chain and inherited membership — invariant 4), so a second
 * implementation in Python would drift from what the author is looking at, which
 * is exactly how the narrative embeds came to disagree with Matrix Mode. So the
 * canvas hands its picture to the export.
 *
 * The picture is a SLICE of the SAME `scenes.matrix` the canvas draws: the epoch's
 * lane, the nodes whose centre falls in that band (the canvas's own test) and the
 * relations among them. Not a re-layout — a re-layout could disagree.
 *
 * Keyed `"<view_type>:<ref>"`, the key `s3dgraphy.narrative.bake.figure_key`
 * builds on the other side. Three kinds travel: `matrix` (a slice of the
 * canvas), `map` (the VECTOR layer only — see `mapToSvg` for why no basemap)
 * and `timeline` (`timelineToSvg`, off the same spans the embed shows).
 * `scene3d` stays a link on purpose: 3D is navigated, not printed. Anything
 * else is declared here rather than silently skipped (see `FIGURABLE`).
 */
const FIGURABLE = new Set(["matrix", "map", "timeline"]);

async function narrativeFigures(
  narrativeId: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!store) return out;
  const narrative = narrativesIn(store.doc).find((n) => n.id === narrativeId);
  if (!narrative) return out;
  const doc = store.doc;

  // what is asked for, once, before anything is drawn: the placement below is a
  // bridge round-trip and it is worth making only if a map is actually embedded
  const wanted: Array<{ view: string; ref: string }> = [];
  const seen = new Set<string>();
  for (const chapter of narrative.chapters as Array<{
    blocks?: Array<{ block_type?: string; ref?: string; view_type?: string }>;
  }>) {
    for (const block of chapter.blocks ?? []) {
      if (block.block_type !== "embed") continue;
      const view = String(block.view_type ?? "");
      const ref = String(block.ref ?? "");
      if (!ref || !FIGURABLE.has(view)) continue;
      const key = `${view}:${ref}`;
      if (seen.has(key)) continue;            // one plate per (view, subject)
      seen.add(key);
      wanted.push({ view, ref });
    }
  }
  if (!wanted.length) return out;

  // The scene's FOOTPRINT, asked once for the whole export. It is what turns a
  // marker into a plan: an extent, an orientation, and therefore a scale bar.
  // Best-effort by construction — the reprojection lives in the bridge (PROJ is
  // on the Python side, G1), so without the `[geo]` extra, or offline, the map
  // figure keeps its marker and coordinates and drops the footprint. It never
  // invents one: a bounding box nobody measured, drawn at metre precision,
  // would be a fabrication (the rule `georeferenceScene` already states).
  let placed: PlacedScene | null = null;
  if (wanted.some((w) => w.view === "map")) {
    const answer = await georeferenceScene(doc);
    if (answer && "error" in answer)
      logInfo(t("log.mapNoFootprint", { why: answer.error }));
    else placed = answer;
  }

  for (const { view, ref } of wanted) {
    const key = `${view}:${ref}`;
    const node = store.node(ref) ?? null;
    try {
      let svg: string | null = null;
      if (view === "matrix") {
        const matrix = scenes.matrix;          // nothing laid out: nothing to
        if (!matrix) continue;                 // photograph
        const slice = epochSliceOf(matrix, ref);
        if (!slice) continue;
        svg = sceneToSvg(slice, edgeVisible, node?.name ?? ref);
      } else if (view === "timeline") {
        if (!node) continue;
        svg = timelineToSvg(node, doc);
      } else if (view === "map") {
        svg = node ? await mapFigure(node, placed) : null;
      }
      if (!svg) continue;                      // degrades to the placeholder
      out[key] = svg;
    } catch (err) {
      // a figure that will not render is left out: the exporter falls back to
      // the placeholder for that block, and the export still happens
      logInfo(`figura non resa per ${key}: ${
        err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

/**
 * The map figure of one embed: resolve WHERE, then draw only what is known.
 *
 * Reads the position exactly as the on-screen card does — `site_position` for
 * the graph-self node (the symbolic site position, not the 3D shift), `geoOf`
 * otherwise, and the bridge for a projected frame — so the picture in the PDF
 * and the map in the app cannot point at different places. `null` when there are
 * no coordinates, which is the honest case the card words as "sito non
 * posizionato": the export then keeps the placeholder for that block.
 */
async function mapFigure(node: { node_type?: string; name?: string; id?: string;
                                 data?: Record<string, unknown> },
                         placed: PlacedScene | null): Promise<string | null> {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const label = String(node.name || node.id || "");
  const footprint = placed
    ? { corners: placed.corners, rotation: placed.rotation }
    : { corners: undefined, rotation: 0 };

  if (node.node_type === "graph") {
    const sp = (data.site_position ?? null) as
      | { lon?: unknown; lat?: unknown } | null;
    const lat = sp ? Number(sp.lat) : NaN;
    const lon = sp ? Number(sp.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return mapToSvg({ lat, lon, epsg: 4326, label, ...footprint });
  }

  const geo = geoOf(data);
  if (geo.ok)
    return mapToSvg({ lat: geo.lat, lon: geo.lon, epsg: geo.epsg,
                      label, ...footprint,
                      rotation: geo.rotation || footprint.rotation });
  if (geo.reason === "needs-reprojection") {
    const point = await reprojectPoint(geo.anchor.x, geo.anchor.y,
                                       geo.anchor.epsg);
    if ("error" in point) {
      logInfo(`figura mappa non resa per ${label}: ${point.error}`);
      return null;                            // no guessed coordinates
    }
    return mapToSvg({ lat: point.lat, lon: point.lon, epsg: 4326,
                      epsgFrom: geo.anchor.epsg, label, ...footprint,
                      rotation: geo.anchor.rotation || footprint.rotation });
  }
  return null;
}

/**
 * One epoch's band of a matrix scene, as a scene of its own.
 *
 * The membership test is the canvas's (`views/matrix.ts` places by position, and
 * `narrative-embeds.ts` reads the same bands), so the figure shows the units the
 * reader sees in that lane — including the ones the engine laned through the
 * chain, which no edge walk would find.
 *
 * Returns null when the scene has no lane for this epoch (a graph that was never
 * laid out, or a ref that is not an epoch): the caller then supplies no figure.
 */
function epochSliceOf(scene: Scene, epochId: string): Scene | null {
  const lane = scene.lanes.find((l) => l.id === epochId);
  if (!lane) return null;
  const top = lane.y;
  const bottom = lane.y + lane.height;
  const nodes = scene.nodes.filter((n) => {
    const centre = n.y + n.h / 2;
    return centre >= top && centre < bottom;
  });
  if (!nodes.length) return null;
  const keep = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    ...scene,
    nodes,
    byId,
    edges: scene.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    lanes: [lane],
  };
}

async function exportNarrative(format: string): Promise<void> {
  if (!store) {
    toast(t("toast.openADocument"));
    return;
  }
  const spec = NARRATIVE_FORMATS[format];
  const narratives = store.doc.graph.nodes.filter(
    (n) => n.node_type === "narrative");
  if (!narratives.length) {
    // Not an error: a graph without a narrative is an ordinary graph.
    toast(t("menu.nothingToExport"));
    return;
  }
  // Which one: the open one when the narrative view is showing it, else the
  // only one there is. Guessing between several would export the wrong story.
  const chosen = (selectedNarrativeId
    && narratives.some((n) => n.id === selectedNarrativeId))
    ? selectedNarrativeId
    : (narratives.length === 1 ? narratives[0].id : null);
  if (!chosen) {
    toast(t("toast.manyNarratives"));
    return;
  }
  toast(t("toast.exporting", { fmt: spec.label }));
  try {
    // …with the figures this process rendered (see `narrativeFigures`): the
    // exporter cannot draw a matrix, and a caption without its matrix is what
    // the four exports used to produce.
    const figures = await narrativeFigures(chosen);
    const res = await fetch(
      `${await bridgeUrl()}/export-narrative?format=${encodeURIComponent(format)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: JSON.parse(store.toJSON()),
                               narrative_id: chosen,
                               figures }),
      });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch { /* non-JSON error body */ }
      toast(t("toast.exportFailed", { fmt: spec.label, why: msg }));
      return;
    }
    const blob = await res.blob();
    const base = String(store.doc.graph["name"] ?? chosen)
      .replace(/[^\w.-]+/g, "_");
    // THE ONE FORMAT THAT ARRIVES AS AN ARCHIVE. A `.tex` references its
    // figures, so with figures the bridge answers a ZIP (main.tex + main.bib +
    // fig/*.pdf). The server says which it sent; naming the file `.tex` when it
    // is a zip is how somebody ends up with an unreadable download.
    const asZip = (res.headers.get("Content-Type") || "").includes("zip");
    downloadBlob(blob, `${base}.${asZip ? "zip" : spec.ext}`,
                 asZip ? "application/zip" : spec.mime);
    if (asZip) {
      toast(t("toast.exportedZip", { fmt: spec.label }));
      return;
    }
    // LaTeX comes with its bibliography: a .bib the author has to fetch
    // separately is a .bib the author forgets to fetch.
    const bib = res.headers.get("X-EM-Bib");
    if (bib) {
      const text = decodeURIComponent(escape(atob(bib)));
      downloadBlob(new Blob([text], { type: "text/plain" }), `${base}.bib`,
                   "text/plain");
      toast(t("toast.exportedBib", { fmt: spec.label }));
    } else {
      toast(t("toast.exported", { fmt: spec.label }));
    }
  } catch {
    toast(BRIDGE_UNREACHABLE);
  }
}

function downloadBlob(blob: Blob, filename: string, _mime: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

for (const format of Object.keys(NARRATIVE_FORMATS)) {
  document.getElementById(`btn-narr-${format}`)
    ?.addEventListener("click", () => { void exportNarrative(format); });
}

// Export the RDF/CIDOC Turtle projection via the transformer (s3Dgraphy
// rdf_exporter — invariant 2: produced in Python, never reimplemented in TS).
document.getElementById("btn-ttl")!.addEventListener("click", async () => {
  if (!store) {
    toast("Open a document first");
    return;
  }
  const g = store.doc.graph;
  const name = String(g["name"] ?? g.graph_id ?? "graph");
  toast("Exporting Turtle…");
  try {
    const res = await fetch(`${await bridgeUrl()}/export-ttl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: store.toJSON(),
    });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON error body */
      }
      toast(`Turtle export failed: ${msg}`);
      return;
    }
    const ttl = await res.text();
    const filename = `${name.replace(/[^\w.-]+/g, "_")}.ttl`;
    if (isTauri()) {
      const path = await saveTtl(ttl, filename);
      if (!path) return; // cancelled
      toast(`Turtle exported → ${baseName(path)}`);
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([ttl], { type: "text/turtle" }));
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Turtle exported");
    }
  } catch {
    toast(BRIDGE_UNREACHABLE);
  }
});

// Import a yEd GraphML file → em.json via the transformer (s3Dgraphy
// importer), then load it. Same endpoint/constraint as export (invariant 2).
async function importGraphmlText(text: string, srcName: string): Promise<void> {
  if (!(await confirmLeaveSidecar("Importing GraphML"))) return;
  toast("Importing GraphML…");
  try {
    const res = await fetch(`${await bridgeUrl()}/import-graphml`, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: text,
    });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON error body */
      }
      toast(`GraphML import failed: ${msg}`);
      return;
    }
    const doc = (await res.json()) as EmDocument;
    loadDocument(doc, srcName); // no layout → auto fresh-layout on load
    toast(`Imported ${srcName}`);
  } catch {
    toast(BRIDGE_UNREACHABLE);
  }
}

// IMPMAP · the single entry. Both modes of loading a legacy dataset go through
// this dialog; the mapping editor keeps authoring and hands the attaching over,
// so the choice of target is asked in ONE place.
document
  .getElementById("btn-import-mapping")!
  .addEventListener("click", () => openImportWithMapping());

document
  .getElementById("btn-import-graphml")!
  .addEventListener("click", async () => {
    // Native file dialog in the Tauri webview (a plain <input type=file>
    // doesn't open a picker there); <input type=file> in a real browser.
    if (isTauri()) {
      const picked = await openGraphml();
      if (!picked) return; // cancelled
      await importGraphmlText(picked.text, baseName(picked.path));
      return;
    }
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".graphml,.xml";
    inp.addEventListener("change", async () => {
      const file = inp.files?.[0];
      if (!file) return;
      await importGraphmlText(await file.text(), file.name);
    });
    inp.click();
  });

// Sync toggle: connect/disconnect the live selection bridge (ADR-002).
const btnSync = document.getElementById("btn-sync") as HTMLButtonElement;
btnSync.addEventListener("click", () => {
  if (sync.connected) {
    sync.disconnect();
    clearDocument(); // the synced graph is the host's — don't leave it lingering
    return;
  }
  const syncUrl = getSyncUrl();
  sync.connect(syncUrl, {
    onSelect: (id, ids) => {
      // selection arrived from the peer → reflect it without echoing back
      applyingRemoteSelect = true;
      if (ids && ids.length > 1) {
        // multi-selection: keep the peer's active node as the primary (last)
        const others = ids.filter((x) => x !== id);
        selectMany(id ? [...others, id] : others);
      } else {
        select(id || null);
      }
      if (id) centerOn(id);
      applyingRemoteSelect = false;
    },
    onOp: (op) => {
      // a graph mutation arrived from the peer/host → apply to our replica
      // (DocumentStore.applyRemoteOp suppresses re-emission, no echo)
      store?.applyRemoteOp(op);
    },
    onSnapshot: (doc) => {
      // the host sent its full graph on connect → become a live view of it
      // (ADR-002: "sync mode = see the host's data"). Replaces the document.
      loadDocument(doc, "Blender (sync)");
      info.textContent = "sync: loaded Blender's graph";
      // provisional document label from the graph name, until the host reports
      // its actual file/database via host_info
      if (!hostInfo.file && !hostInfo.database) {
        const gname = (doc.graph as { name?: string }).name;
        if (gname) {
          hostInfo = { ...hostInfo, label: gname };
          renderSidecarDetail();
        }
      }
    },
    onHostInfo: (info2) => {
      // the host told us what it is editing (tool / file / database) → show it
      hostInfo = { ...hostInfo, ...info2 };
      // CONNECTOR · and, when it sent one, its descriptor: accepted, or refused
      // with the reason. A pairing on this machine is the `direct` transport.
      announceConnector(hostInfo, "direct");
      renderSidecarDetail();
      // C1 · …and WHICH DOCUMENT it has open, against ours. Said once per
      // change, in the log and in the footer: two ends on different documents
      // produce exactly the silence of a closed channel, and until this line
      // the two were indistinguishable.
      noteAlignment();
      // CMD1 · consent can be toggled while connected; the affordance follows it
      refreshInspector();
    },
    // C1 · and what WE have open, asked for whenever it is needed rather than
    // captured once — a photograph would miss every change after connect.
    describeSelf: () => describeOpenDocument(),
    onCommandResult: (res) => applyCommandResult(res),
    // WIRE 2 · a host that speaks another protocol version is SAID. Without
    // this it would look exactly like a host that has gone quiet.
    onWireMismatch: (reason) => {
      logInfo(reason);
      toast(t("sync.wireMismatch"));
    },
    onStatus: (state) => {
      btnSync.classList.toggle("active", state === "open");
      // clear, high-visibility signal that we are in live-sync mode
      document.body.classList.toggle("sync-active", state === "open");
      setModeIndicator(state === "open");
      btnSync.textContent = state === "open" ? "Sync ●" : "Sync";
      if (state === "open") info.textContent = `sync: connected to ${syncUrl}`;
      else if (state === "closed")
        info.textContent = "sync: disconnected (is Blender's server running?)";
    },
  });
});

// ---------- MENU1 · Mode menu (Standalone / Sidecar / Hub) ----------
// Reuses the existing sync toggle (btnSync) rather than reimplementing it:
// Sidecar connects if not connected, Standalone disconnects if connected. Hub
// is disabled (StratiGraph Server, later). The active mode's ✓ is set by setModeIndicator.
document.getElementById("btn-mode-standalone")?.addEventListener("click", () => {
  if (sync.connected) btnSync.click(); // disconnect → back to local document
});
document.getElementById("btn-mode-sidecar")?.addEventListener("click", () => {
  if (!sync.connected) btnSync.click(); // connect → live-synced to the host
});
// P4.3 · Hub is now a real mode with a real server behind it (StratiGraph Server, P4.2).
// The endpoint and the room live in Settings; the TOKEN is asked for and kept in
// memory only — the same rule the AI key follows, because a token written to
// disk is a token that leaks.
document.getElementById("btn-open-other")
  ?.addEventListener("click", () => void openRoomElsewhere());
document.getElementById("btn-share-room")
  ?.addEventListener("click", () => shareThisRoom());

// THE THREE VERBS, all reachable from the same place (design note): APRI is
// File ▸ Open, and these are the two that were missing.
document.getElementById("btn-create-room")
  ?.addEventListener("click", () => void createRoomHere(false));
document.getElementById("btn-bring-into-room")
  ?.addEventListener("click", () => void createRoomHere(true));

document.getElementById("btn-mode-hub")?.addEventListener("click", () => {
  const s = getSettings().sync;
  if (!s.hubUrl || !s.hubRoom) {
    toast(t("hub.needsConfig"));
    openSettings("settings-sect-sync");
    return;
  }
  if (sync.room === s.hubRoom && sync.connected) return;   // already there
  const token = hubToken ?? window.prompt(t("hub.tokenPrompt")) ?? "";
  hubToken = token || null;
  connectToHub(s.hubUrl, s.hubRoom, hubToken);
});

/** The access token for this session. In MEMORY: never localStorage, never the
 *  settings file — a token on disk outlives the reason it was issued. */
let hubToken: string | null = null;
//: …and the REFRESH token beside it, which `completeSignIn` has always returned
//: and `joinFromHandoff` used to drop on the floor. One place, one more field —
//: not a second place: at the third nobody knows which is the good one.
//:
//: In MEMORY only, like the access token: EMStudio is a desktop app and a browser
//: build, and a refresh token in web storage outlives the person at the keyboard.
let hubRefreshToken: string | null = null;
//: the node's sign-in configuration, kept from the handoff so a refresh has a
//: token endpoint to go to without asking the node twice
let hubAuthConfig: AuthConfig | null = null;

// ---------- MENU1 · Help menu (About / Updates / Ontology models) ----------
const RELEASES_URL = "https://github.com/EmanuelDemetrescu/EMStudio/releases";
function helpPopover(title: string, rows: Array<[string, string]>): void {
  document.getElementById("help-pop")?.remove();
  const pop = document.createElement("div");
  pop.id = "help-pop";
  pop.className = "help-pop";
  const h = document.createElement("div");
  h.className = "help-pop-title";
  h.textContent = title;
  pop.appendChild(h);
  for (const [k, v] of rows) {
    const r = document.createElement("div");
    r.className = "help-pop-row";
    const kk = document.createElement("span");
    kk.className = "help-pop-k";
    kk.textContent = k;
    const vv = document.createElement("span");
    vv.textContent = v;
    r.append(kk, vv);
    pop.appendChild(r);
  }
  document.body.appendChild(pop);
  const close = (e: MouseEvent): void => {
    if (!pop.contains(e.target as Node)) {
      pop.remove();
      document.removeEventListener("pointerdown", close, true);
    }
  };
  setTimeout(() => document.addEventListener("pointerdown", close, true), 0);
}
document.getElementById("btn-help-about")?.addEventListener("click", () => {
  helpPopover("EMStudio", [
    ["Version", __EMSTUDIO_VERSION__],
    ["EM language", EM_VERSION],
    ["License", "GPL-3.0 · CNR ISPC — StratiGraph (HE GA 101232855)"],
  ]);
});
document.getElementById("btn-help-updates")?.addEventListener("click", () => {
  // No in-app updater yet — point at the releases page (stub, declared).
  toast(t("toast.noUpdater"));
  window.open(RELEASES_URL, "_blank", "noopener,noreferrer");
});
// MENU-AUDIT · the Help ▸ "Ontology models…" item is gone: the version button in
// the footer opens the same breakdown, built from the datamodel's own
// `referenced_ontology_versions` (with source links) instead of five rows two of
// which were hardcoded here. One view, one place, and the data-driven one.

// ---------- Settings modal (sync target, …) ----------
const settingsModal = document.getElementById("settings-modal")!;
const setToolSel = document.getElementById("set-sync-tool") as HTMLSelectElement;
const setProtoSel = document.getElementById(
  "set-sync-protocol",
) as HTMLSelectElement;
const setHostInp = document.getElementById("set-sync-host") as HTMLInputElement;
const setPortInp = document.getElementById("set-sync-port") as HTMLInputElement;
const setUrlOut = document.getElementById("set-sync-url")!;
const setDevUuid = document.getElementById("set-dev-uuid") as HTMLInputElement;
const setEdgeTips = document.getElementById(
  "set-edge-tooltips",
) as HTMLInputElement;
const setStrictDocNames = document.getElementById(
  "set-strict-doc-names",
) as HTMLInputElement;
const setAiProvider = document.getElementById(
  "set-ai-provider") as HTMLSelectElement;
const setAiModel = document.getElementById("set-ai-model") as HTMLInputElement;
const setAiKey = document.getElementById("set-ai-key") as HTMLInputElement;
const setAiKeyState = document.getElementById("set-ai-key-state")!;
const setAiKeySave = document.getElementById(
  "set-ai-key-save") as HTMLButtonElement;
const setAiKeyClear = document.getElementById(
  "set-ai-key-clear") as HTMLButtonElement;
const setAiKeyHint = document.getElementById("set-ai-key-hint")!;
const setAtonBase = document.getElementById(
  "set-aton-base") as HTMLInputElement;
const setHeriverseApp = document.getElementById(
  "set-heriverse-app") as HTMLInputElement;
const setAtonSceneUrl = document.getElementById("set-aton-scene-url")!;

for (const p of AI_PROVIDERS) {
  const o = document.createElement("option");
  o.value = p.value;
  o.textContent = p.label;
  setAiProvider.appendChild(o);
}

/**
 * Where the key lives, and therefore what Settings can offer (S3).
 *
 * Two modes, because the two ways of running EMStudio have different places to
 * keep a secret — and the difference is worth stating to the user rather than
 * hiding behind one button that means two things:
 *
 *   * **desktop** — the OS keychain. Persistent; survives a restart.
 *   * **browser dev** — no keychain to write to, so the key goes to em-bridge
 *     and lives in that PROCESS, in memory, for as long as it runs. Not saved.
 *
 * What both modes share is the part that matters: the key goes one way. There
 * is no call, in either, that hands it back.
 */
type KeyMode = "keychain" | "session" | "unavailable";

interface AiKeyState {
  mode: KeyMode;
  set: boolean;
  /** where a dev key came from, so "env" is not shown as "you pasted this" */
  source?: string;
  detail: string;
}

async function readAiKeyState(): Promise<AiKeyState> {
  if (isTauri()) {
    const { available, set, detail } = await llmKeyStatus();
    return {
      mode: available ? "keychain" : "unavailable",
      set,
      detail,
    };
  }
  // Browser: ask the bridge. If it is not running there is nowhere to put a
  // key, which is a different problem from "you have not set one".
  try {
    const res = await fetch(`${await bridgeUrl()}/llm-key-status`);
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { set: boolean; source: string };
    return { mode: "session", set: !!j.set, source: j.source, detail: "" };
  } catch {
    return {
      mode: "unavailable",
      set: false,
      detail: t("ai.bridgeDown"),
    };
  }
}

async function refreshAiKeyState(): Promise<void> {
  // On the desktop, saving restarts em-bridge (the key enters at spawn), which
  // would cut a generation off mid-request. In dev the key enters at runtime,
  // so there is nothing to restart and nothing to interrupt — the guard is
  // therefore desktop-only, not a blanket "don't touch anything while busy".
  const busy = generating.size > 0 && isTauri();
  const { mode, set, source, detail } = await readAiKeyState();
  const usable = mode !== "unavailable";

  setAiKey.disabled = !usable || busy;
  setAiKeySave.disabled = !usable || busy;
  setAiKeyClear.disabled = !set || busy || source === "env";

  if (!usable) setAiKeyState.textContent = isTauri()
    ? "portachiavi non disponibile"
    : t("bridge.unreachable");
  else if (!set) setAiKeyState.textContent = t("ai.noKey");
  else if (mode === "keychain") setAiKeyState.textContent = "✓ key impostata";
  else setAiKeyState.textContent = source === "env"
    ? "✓ key dall'ambiente"
    : "✓ key di sessione — non salvata";
  setAiKeyState.className = usable && set ? "ai-key-set" : "ai-key-unset";

  // K2 — the field is always EMPTY on reopen, because the key is not readable
  // (that asymmetry is the security invariant: set / clear / status, never get).
  // An empty box next to "✓ key impostata" reads as "not saved" though, and the
  // user pastes it again. So the PLACEHOLDER carries the state: a fixed run of
  // dots and a sentence. It is a placeholder, not a value — `setAiKey.value`
  // stays empty, nothing is read from anywhere, and typing behaves as before.
  setAiKey.placeholder = usable && set
    ? "•••••••••••• — impostata (incolla per sostituire)"
    : "Incolla qui la key";

  if (busy) {
    setAiKeyHint.textContent = t("ai.busySaving");
    return;
  }
  if (!usable) {
    setAiKeyHint.textContent = detail;
    return;
  }
  if (mode === "keychain") {
    setAiKeyHint.textContent = set ? t("ai.inKeychain") : t("ai.pasteKeychain");
    return;
  }
  // dev / session
  setAiKeyHint.textContent = source === "env" ? t("ai.fromEnv")
    : set ? t("ai.inMemory") : t("ai.pasteSession");
}

/** Settings may be open while a generation starts or finishes — keep the guard
 *  honest instead of only correct at the moment the panel was opened. */
function refreshAiKeyStateIfOpen(): void {
  if (!settingsModal.classList.contains("hidden")) void refreshAiKeyState();
}

/** POST the key to em-bridge, which keeps it in memory for its own lifetime.
 *  Returns an error message, or null. */
async function postSessionKey(key: string | null): Promise<string | null> {
  const route = key === null ? "/clear-llm-key" : "/set-llm-key";
  try {
    const res = await fetch(`${await bridgeUrl()}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: key === null ? "{}" : JSON.stringify({ key }),
    });
    if (res.ok) return null;
    const j = await res.json().catch(() => null);
    return (j as { error?: string } | null)?.error ?? `bridge error ${res.status}`;
  } catch {
    return "em-bridge non raggiungibile";
  }
}

setAiKeySave.addEventListener("click", async () => {
  if (generating.size > 0 && isTauri()) {
    toast(t("ai.waitBeforeSave"));
    return;
  }
  const key = setAiKey.value.trim();
  if (!key) {
    toast("Incolla prima la key");
    return;
  }
  const err = isTauri() ? await setLlmKey(key) : await postSessionKey(key);
  setAiKey.value = "";          // never keep it in the DOM after saving
  if (err) {
    toast(`Key non salvata: ${err}`);
    return;
  }
  toast(isTauri()
    ? "Key salvata nel portachiavi — bridge riavviato"
    : t("ai.sessionKeySet"));
  await refreshAiKeyState();
});

setAiKeyClear.addEventListener("click", async () => {
  if (generating.size > 0 && isTauri()) {
    toast(t("ai.waitBeforeRemove"));
    return;
  }
  const err = isTauri() ? await clearLlmKey() : await postSessionKey(null);
  if (err) {
    toast(`Key non rimossa: ${err}`);
    return;
  }
  setAiKey.value = "";
  toast(isTauri()
    ? "Key rimossa dal portachiavi — bridge riavviato"
    : "Key di sessione rimossa");
  await refreshAiKeyState();
});

for (const t of SYNC_TOOLS) {
  const o = document.createElement("option");
  o.value = t.value;
  o.textContent = t.label;
  o.disabled = !t.enabled;
  setToolSel.appendChild(o);
}

function refreshSyncUrlPreview(): void {
  const proto = setProtoSel.value;
  const host = setHostInp.value.trim() || "localhost";
  const port = setPortInp.value.trim() || "8788";
  setUrlOut.textContent = `${proto}://${host}:${port}`;
}
// A worked example of the address being built, so a typo shows up here rather
// than as an empty frame inside a chapter.
function refreshAtonUrlPreview(): void {
  const root = setAtonBase.value.trim().replace(/\/+$/, "");
  const app = setHeriverseApp.value.trim().replace(/^\/+|\/+$/g, "")
    || "a/heriverse";
  setAtonSceneUrl.textContent = root
    ? `${root}/${app}/?scene=<id>`
    : t("ai.noAtonServer");
}

/**
 * @param section id of a `.settings-sect` to open ON — scrolled into view and
 *   briefly outlined. Settings is a long dialog; a caller who knows which part
 *   of it the user came for should not make them look for it. (WIN7: the
 *   narrative window's ⌁ button comes here for the AI provider and key.)
 */

// ── IDENTITY · who is working, and who has been checked ─────────────────────
//
// The model in one line: the ORCID iD IS the identity; `verified` says whether
// anyone has confirmed it. Declaring works offline and unlocks everything about
// preparing data; verifying is what unlocks publishing AS that person.
//
// The seam lives in `identity.ts` (pure, checked by scripts/check-identity.mjs).
// This file only wires it to the dialog, the footer and the gate.

/** The provider used by the Verify button.
 *
 * TODAY it is the MOCK: it verifies the iD the user has declared, so the whole
 * flow — compare, promote, unlock, or report a mismatch — is exercisable with
 * no infrastructure at all. The real one (Keycloak brokering ORCID: PKCE in the
 * browser, Device flow on the desktop) drops in HERE, behind the same
 * interface, and nothing else in this file changes. That is the point of having
 * an interface rather than a fetch call in a button handler.
 *
 * It is deliberately NOT silent about being a mock — see `verifyIdentityFlow`,
 * which says so in the toast. A verification that pretends to have talked to
 * ORCID would be worse than no verification.
 */
function identityProvider(): IdentityProvider {
  const declared = currentIdentity();
  // A declared TEST BENCH, not a hidden feature: `?verifies=<orcid>` (or
  // `window.EM_VERIFIES`) makes the mock answer with a DIFFERENT iD, which is
  // the only way to see the mismatch path in the real UI before Keycloak
  // exists. Same shape as the `?bridge=` override — an override you have to
  // type, that changes nothing when you do not.
  const forced =
    new URLSearchParams(location.search).get("verifies") ??
    (window as unknown as { EM_VERIFIES?: string }).EM_VERIFIES ??
    null;
  if (forced) return new MockIdentityProvider({ orcid: forced });
  return new MockIdentityProvider(
    declared ? { orcid: declared.orcid } : new Error(t("id.none")),
  );
}

// ── FIRMA · IDENTITÀ · PRESENZA — three rungs, one chip ────────────────────
//
// `EM_design_identita-in-emstudio.md` (5 September 2026). The footer used to say
// `Standalone · no author`, which is TWO AXES flattened into one — «what name do
// I sign with» and «which node am I talking to». Harmless while one person edited
// one file; not harmless from the day a door brought a study into the editor,
// because a RESTRICTED study answered «Sign in and open it again» and there was
// no sign-in to follow.
//
// Three rungs, each the answer to a different question, contiguous and not the
// same:
//
//   FIRMA     — to whom is what I do attributed. Declared here, offline, and
//               nobody has checked it. A self-certification, and it is said as
//               one: NEVER a tick beside an unverified name (a tick nobody
//               earned is the same species as a preselected licence).
//   IDENTITÀ  — who a node confirms I am. The node validated THAT SAME
//               signature: the login does not give you another name, it confirms
//               the one you had already written.
//   PRESENZA  — where I am and what I may do there. Contains the rung below it:
//               a role is given to somebody, not to a declared name.
//
// The chip OWNS NOTHING. The identity comes from `/v1/whoami`, the presence from
// the room this session is in. The node declares, the surface shows.

/** What a node has confirmed about the person at the keyboard, this session.
 *
 *  In memory, deliberately — like every token in this codebase. A verification
 *  that survived a reload would be a claim nobody re-checked. */
let nodeIdentity: { orcid: string | null; name: string | null;
                    node: string } | null = null;

/** …and the last thing the node said when asked, when it stopped saying yes.
 *  Shown, because A SILENT DEGRADATION IS THE LIE: falling back to Firma is a
 *  property (fallback continuity, D2.2), pretending to still be verified is not. */
let nodeIdentityLost: string | null = null;

/**
 * Did the node confirm THE SAME signature this session declared?
 *
 * The middle rung is defined by that word: «un nodo ha validato **quella stessa
 * firma**» — the login does not give you another name, it confirms the one you
 * had already written. So when the node names somebody ELSE, this session has not
 * reached Identità, whatever the sign-in did.
 *
 * Found by measuring, on E.D.'s own screen (5 September, incognito): declared
 * `0000-0002-5065-7970` «Emanuel Demetrescu», signed in, and the node confirmed
 * `0000-0002-1825-0097` «Dev User» — the dev realm's user. The chip showed
 * «Emanuel Demetrescu · em.localhost:8443», i.e. presented the DECLARED name as
 * confirmed by a node that had confirmed a different person. That is the same
 * species as a tick beside a name nobody checked, one rung higher up: an
 * assertion nobody made.
 *
 * Compared ONLY when both sides are ORCIDs. A realm without ORCID answers with a
 * `preferred_username` or a `sub`, and refusing the rung there would break every
 * such deployment — so the answer is `null` («cannot tell»), the session keeps
 * the rung it had, and the tooltip says the confirmation is of the session rather
 * than of the iD.
 */
function nodeConfirmsTheSignature(): boolean | null {
  // the comparison itself lives in `identity.ts` (`sameSignature`), where it is a
  // question about two identities rather than about a piece of chrome — and where
  // `check-identity.mjs` can put real values to it
  return sameSignature(currentIdentity()?.orcid, nodeIdentity?.orcid);
}

/** Which rung this session is on. Read, never stored: every input is already
 *  somewhere else, and a copy would be the thing that goes stale. */
type IdentityRung = "none" | "signature" | "identity" | "presence";

function identityRung(): IdentityRung {
  // A node that confirmed SOMEBODY ELSE has not confirmed you. Neither rung above
  // Firma is reached — presence contains identity, so it goes with it.
  if (nodeConfirmsTheSignature() === false) {
    return currentIdentity() ? "signature" : "none";
  }
  if (sync.room && sync.connected && nodeIdentity) return "presence";
  if (nodeIdentity) return "identity";
  return currentIdentity() ? "signature" : "none";
}

/** The node this page was served BY — which is the only node a web build can
 *  sign in against without being told where to go. */
function servingNode(): string {
  const configured = getSettings().sync.hubUrl?.replace(/\/+$/, "");
  if (configured) return configured;
  // `/em/studio/` is served by the node at `/em`; the API is one level up from
  // the page. Derived from the document's own URL, so nothing is written down
  // twice — the same rule the field assistant's page follows.
  const path = window.location.pathname;
  const at = path.indexOf("/studio/");
  if (at > 0) return `${window.location.origin}${path.slice(0, at)}`;
  return window.location.origin;
}

/**
 * What a sign-in this page started needs when it comes back — ONE entry, written
 * by `signIntoNode` and read by `completeNodeSignIn`, and therefore identical for
 * the two rounds. Silent and interactive are two ways of asking the same
 * question, so there is one return path.
 *
 * `returnTo` used to ride ONLY in the PKCE record (`oidc.ts`). That worked, and
 * it was a single point of failure: the record is deleted on read and read
 * exactly once, so any return that arrives without it — a second tab, a cleared
 * storage, a code that comes back where none was started — reaches
 * `restoreAfterSignIn(undefined)`, and a bare `/em/studio/` is all that is left,
 * because the realm's return REPLACED the query. That is the shape of the
 * failure E.D. measured after a real password: chip full, bar clean, study gone.
 *
 * So the address is remembered here too, beside the server. Still not in `state`
 * — that travels through the IdP and into its logs, and a study link may carry a
 * `?token=`. `oidc.ts` keeps carrying it as well, for callers that use it
 * directly; this is the copy that does not depend on the record surviving.
 */
const SIGNIN_KEY = "emstudio.signin";

interface PendingNodeSignIn {
  server: string;
  /** where the person was, with whatever they were doing still on it */
  returnTo?: string;
  /** `prompt=none` — a failed one is not a failure, and must not be shouted */
  silent?: boolean;
}

/**
 * Sign in against the node this page came from — OIDC + PKCE, token in memory.
 *
 * NOT a fourth implementation: `oidc.ts` is the one that exists and this is its
 * fourth ADOPTION (the front door, the console, the field assistant, and now the
 * editor). The token never touches localStorage and never appears in a URL; the
 * only thing remembered across the round trip is WHICH NODE — a place, not a
 * permission, and the rule the whole handoff contract is built on.
 */
async function signIntoNode(opts: { silent?: boolean } = {}): Promise<boolean> {
  const server = servingNode();
  logInfo(`identity: signing in against ${server}`
          + (opts.silent ? " (silently)" : ""));
  const config = await loadAuthConfig(server);
  if (!config) {
    logWarn(`identity: ${server} offers no sign-in — nothing to do`);
    // a node running open: there is nobody to be, and saying so beats a button
    // that appears to do nothing
    if (!opts.silent) toast(t("ident.nodeOpen", { server }));
    return false;
  }
  const pending: PendingNodeSignIn = {
    server, returnTo: window.location.href, silent: opts.silent || undefined,
  };
  try {
    sessionStorage.setItem(SIGNIN_KEY, JSON.stringify(pending));
  } catch { /* a private window: the sign-in simply cannot be resumed */ }
  handoffAuth = config;
  // THE ADDRESS COMES WITH US. Somebody who signs in from a page that was
  // opening something has to come back to that page with the something still on
  // it — the realm's return replaces the query string, so `?study=` would
  // otherwise be overwritten by `code`/`state`/`session_state`/`iss`. Measured
  // in Chrome on 5 September: the study vanished and re-opening it from the door
  // produced a fresh tab with no session. A ring.
  window.location.assign(await authorizeUrl(config, {
    returnTo: window.location.href, silent: opts.silent,
  }));
  return true;
}

/** Finish a sign-in this page started, if it did. Returns whether it was ours. */
async function completeNodeSignIn(): Promise<boolean> {
  let remembered: PendingNodeSignIn | null = null;
  try {
    const raw = sessionStorage.getItem(SIGNIN_KEY);
    sessionStorage.removeItem(SIGNIN_KEY);
    remembered = raw ? JSON.parse(raw) as PendingNodeSignIn : null;
  } catch { remembered = null; }
  if (!remembered?.server) return false;
  const config = await loadAuthConfig(remembered.server);
  const result = config
    ? await completeSignIn(config)
    : { ok: false, error: "that node no longer offers a sign-in" };
  clearHandoffFromLocation();
  // …and the address comes back BEFORE anything reads it, so whatever this page
  // was doing is on the URL again. OUR copy first: it is the one that does not
  // depend on the PKCE record having survived, and the two are the same value
  // written by the same line.
  restoreAfterSignIn(remembered.returnTo ?? result.returnTo);
  // a SILENT round is one we started silently — read from our own record, so it
  // is known even when `completeSignIn` could not tell us
  const wasSilent = remembered.silent || result.silent;
  if (!result.ok || !result.token) {
    // A SILENT attempt that failed is not a failure. `prompt=none` answering
    // `login_required` is the expected reply when there is no session, and
    // shouting about it would be an error message for something that went
    // exactly as designed — the study fetch will now ask properly.
    if (wasSilent) {
      logInfo(`identity: no session on this node yet (${result.error})`);
      return true;
    }
    toast(t("ident.signInFailed", { why: String(result.error ?? "") }));
    logWarn(`identity: sign-in failed — ${result.error}`);
    return true;
  }
  hubToken = result.token;
  hubRefreshToken = result.refresh_token || null;
  hubAuthConfig = config ?? null;
  // A MARKER BELONGS TO THE IDENTITY THAT FAILED, and this session has just
  // stopped being that identity.
  //
  // Without this line the human sequence fails on its second half, which is the
  // half everybody does: open the study → refused, no session → sign in →
  // reopen in the same tab → refused AGAIN, and this time without even trying,
  // because the marker from the first attempt is still there. Measured in
  // Chrome with a live SSO session: `markers: 1`, chip still `◌`, study refused
  // — with a session sitting right there that would have carried it.
  forgetSilentSignInAttempts();
  await askNodeWhoIAm(remembered.server);
  return true;
}

/** Every silent-attempt marker in this tab, dropped.
 *
 *  Called when a sign-in SUCCEEDS — silently or interactively — because the
 *  markers exist to prevent a redirect loop for one identity, and the identity
 *  has changed. Keyed per URL, so they are enumerated rather than remembered in
 *  a list nobody would keep in step. */
function forgetSilentSignInAttempts(): void {
  try {
    const stale = Object.keys(sessionStorage)
      .filter((key) => key.startsWith("emstudio.silenttry:"));
    for (const key of stale) sessionStorage.removeItem(key);
    if (stale.length) {
      logInfo(`identity: signed in — ${stale.length} refused attempt(s) `
              + "may be retried");
    }
  } catch { /* no sessionStorage: there were no markers to begin with */ }
}

/**
 * Put the address bar back where the sign-in started, and take the round trip's
 * leftovers off it.
 *
 * TWO THINGS, and both were half-done. The query the realm sent back
 * (`code`, `state`, `session_state`, `iss`) replaced whatever was there, and it
 * STAYED: `clearStudyLinkFromLocation` took `?study=` off and left a spent
 * authorization code written in the bar — the same rule applied to one half,
 * and «the token first» exists precisely to avoid that. A spent code is not a
 * live credential, but it is a credential-shaped thing in a place that gets
 * copied into chats and screenshots.
 */
function restoreAfterSignIn(returnTo?: string): void {
  const OIDC_LEFTOVERS = ["code", "state", "session_state", "iss",
                          "error", "error_description"];
  try {
    const back = returnTo ? new URL(returnTo, window.location.href) : null;
    const url = back ?? new URL(window.location.href);
    for (const key of OIDC_LEFTOVERS) url.searchParams.delete(key);
    window.history.replaceState({}, "", url.toString());
  } catch {
    // an unparseable remembered address must not cost the sign-in: strip in
    // place and stay where we are
    const url = new URL(window.location.href);
    for (const key of OIDC_LEFTOVERS) url.searchParams.delete(key);
    window.history.replaceState({}, "", url.toString());
  }
}

/**
 * Ask the node who it thinks we are — `/v1/whoami`, and nothing else.
 *
 * This is the whole of the middle rung: the node either confirms the signature
 * or it does not, and the chip shows which. It does not ask for capabilities
 * (that is `/v1/admin/whoami`, a different question) and it keeps no list of its
 * own.
 */
async function askNodeWhoIAm(server: string): Promise<void> {
  const base = server.replace(/\/+$/, "");
  try {
    const answer = await fetch(`${base}/v1/whoami`, {
      headers: hubToken ? { Authorization: `Bearer ${hubToken}` } : {},
    });
    if (!answer.ok) {
      nodeIdentity = null;
      nodeIdentityLost = `${answer.status}`;
      logWarn(`identity: ${base} answered ${answer.status} to /v1/whoami`);
      refreshIdentityChip();
      return;
    }
    const who = await answer.json() as
      { orcid?: string | null; name?: string | null; enforcing?: boolean };
    nodeIdentity = {
      orcid: who.orcid ?? null, name: who.name ?? null,
      node: new URL(base).host,
    };
    nodeIdentityLost = null;
    logInfo(`identity: ${nodeIdentity.node} confirms `
            + `${nodeIdentity.orcid ?? nodeIdentity.name ?? "(a session)"}`);
  } catch (error) {
    // THE DESCENT IS SAID. The scale is walked in both directions: a node that
    // stops answering drops this session to Firma, and the chip says the node is
    // not answering. Work continues — that is the property, not the fault.
    nodeIdentity = null;
    nodeIdentityLost = String((error as Error).message);
    logWarn(`identity: ${base} is not answering — down to Signature`);
  }
  refreshIdentityChip();
}

/**
 * The footer chip — ONE control, three degrees of solidity.
 *
 * Dashed outline → a signature nobody has checked. Solid + the node's name →
 * confirmed by that node. Solid + the place and the role → present in a room.
 * One element that grows firmer is what makes the contiguity of the three
 * readable; two separate badges would tell the story of two systems.
 *
 * Clicking always offers THE NEXT RUNG, and never more than the next one.
 */
function refreshIdentityChip(): void {
  const chip = document.getElementById("footer-identity");
  if (!chip) return;
  const identity = currentIdentity();
  const rung = identityRung();
  chip.classList.remove("id-signature", "id-identity", "id-presence",
                        "id-lost", "verified");

  if (rung === "none") {
    chip.textContent = t("identity.none");
    chip.title = t("identity.noneTitle");
    return;
  }

  const who = identity && (identity.name || identity.surname)
    ? `${identity.name ?? ""} ${identity.surname ?? ""}`.trim()
    : (identity?.orcid ?? nodeIdentity?.name ?? nodeIdentity?.orcid ?? "");

  if (rung === "presence") {
    // the room, and what this session may do in it. `sync.role` when the room
    // has said; otherwise the place alone — a role we have not been told is not
    // a role to display.
    // the role the ROOM resolved, from the host's own `host_info` — never
    // guessed, and absent rather than invented when the room said nothing (the
    // chip shows a permission it was told about, and never negotiates one)
    const said = hostInfo.role ?? null;
    const role = said ? ` — ${said}` : "";
    chip.classList.add("id-presence");
    chip.textContent = `${who} · ${sync.room}${role}`;
    chip.title = t("ident.presenceTitle", { who, room: String(sync.room),
                                            node: nodeIdentity!.node });
    return;
  }

  if (rung === "identity") {
    chip.classList.add("id-identity");
    chip.textContent = `${who} · ${nodeIdentity!.node}`;
    chip.title = t("ident.identityTitle", { who, node: nodeIdentity!.node });
    return;
  }

  // FIRMA. NO TICK — not even when the ORCID's own checksum flow has run: that
  // is a different claim from «a node confirms this is you», and one mark for
  // two facts is how the two get confused. The dashed outline is the whole
  // statement.
  chip.classList.add("id-signature");
  if (nodeIdentityLost) chip.classList.add("id-lost");
  chip.textContent = `◌ ${who}`;
  // A DEGRADATION IS SAID, and «the node knows you as somebody else» is one. A
  // chip that simply stayed dashed would be right and mute, and a mute
  // degradation is the failure that looks like a success.
  const mismatch = nodeConfirmsTheSignature() === false;
  if (mismatch) chip.classList.add("id-lost");
  chip.title = mismatch
    ? t("ident.otherPerson", {
        who, node: nodeIdentity!.node,
        them: nodeIdentity!.name || nodeIdentity!.orcid || "",
        orcid: nodeIdentity!.orcid ?? "",
      })
    : nodeIdentityLost
      ? t("ident.lostTitle", { who, why: nodeIdentityLost })
      : t("ident.signatureTitle", { who, orcid: identity?.orcid ?? "" });
}

/**
 * The click: always the NEXT rung, never a menu of everything.
 *
 * none → declare a signature (Settings, where the field is)
 * signature → verify it on the node that served this page
 * identity → join a room
 * presence → what your role is there, and how to leave
 */
/**
 * The sentence a refusal ends with — and it must name THE GESTURE THIS SESSION
 * ACTUALLY HAS, which is the chip's next rung and nothing else.
 *
 * Found by E.D. on a clean profile: a restricted study refused with «Sign in and
 * open it again», the chip at the bottom left read «no author», and his question
 * was «dove devo cliccare?». Both sentences were defensible on their own and
 * together they described two roads where there is one: the chip's next rung at
 * an empty signature is not a login, it is DECLARING A SIGNATURE — which needs
 * nobody, works offline, and is the step that makes the ladder a ladder.
 *
 * Asking somebody to sign in on a node before they have said who they claim to
 * be says that without that node they do not exist. That is false, and it
 * contradicts the continuity this ladder exists to show.
 *
 * The third case is the one the static sentence got wrong in the other
 * direction: a session the node has ALREADY confirmed, refused anyway, is not an
 * identity problem at all — it is a permission it was not given, and sending
 * that person to sign in again sends them to the wrong place entirely.
 */
function nextRungInvitation(): string {
  if (nodeConfirmsTheSignature() === false) {
    // signing in again would return the same other person
    return t("ident.otherPersonNext", {
      them: nodeIdentity!.name || nodeIdentity!.orcid || "",
    });
  }
  switch (identityRung()) {
    case "none":      return t("ident.next.none");
    case "signature": return t("ident.next.signature");
    default:          return t("ident.next.confirmed");
  }
}

function identityChipClicked(): void {
  // INSTRUMENTED, and it stays: this chip is the one control whose job is to
  // move a session up a rung, and a click that quietly does nothing is exactly
  // the failure that is impossible to tell from a click that did something.
  logInfo(`identity: chip clicked at rung «${identityRung()}»`);
  switch (identityRung()) {
    case "none":
      openSettings("settings-sect-identity");
      return;
    case "signature":
      // …unless the node has already answered with a different person: signing in
      // again would produce the same answer. What has to change is one of the two
      // names, and both live in Settings ▸ Identity.
      if (nodeConfirmsTheSignature() === false) {
        toast(t("ident.otherPersonNext", {
          them: nodeIdentity!.name || nodeIdentity!.orcid || "",
        }));
        openSettings("settings-sect-identity");
        return;
      }
      void signIntoNode();
      return;
    case "identity":
      toast(t("ident.nextJoin"));
      openSettings("settings-sect-sync");
      return;
    case "presence":
      toast(t("ident.presenceNow", {
        room: String(sync.room), role: hostInfo.role ?? "—",
      }));
      return;
  }
}

/** The Settings section: declare, switch, verify. */
function refreshIdentityPanel(): void {
  const state = document.getElementById("set-orcid-state");
  const known = document.getElementById("set-orcid-known");
  const verifyBtn = document.getElementById("set-orcid-verify") as HTMLButtonElement | null;
  if (!state || !known || !verifyBtn) return;
  const identity = currentIdentity();
  state.textContent = identity
    ? identity.verified
      ? t("identity.stateVerified", { orcid: identity.orcid })
      : t("identity.stateClaimed", { orcid: identity.orcid })
    : t("identity.stateNone");
  verifyBtn.disabled = !identity || identity.verified;

  known.textContent = "";
  const others = knownIdentities();
  if (others.length <= 1) return;
  const title = document.createElement("p");
  title.className = "settings-hint";
  title.textContent = t("identity.knownOnThisMachine");
  known.appendChild(title);
  for (const other of others) {
    const row = document.createElement("p");
    row.className = "settings-url";
    const label = document.createElement("span");
    label.textContent = `${other.verified ? "✔" : "◌"} ${other.name ?? ""} ${other.orcid}`.trim();
    const use = document.createElement("button");
    use.type = "button";
    use.textContent = t("identity.use");
    use.disabled = other.orcid === identity?.orcid;
    use.addEventListener("click", () => {
      useIdentity(other.orcid);
      refreshIdentityPanel();
      refreshIdentityChip();
      toast(t("identity.switched", { orcid: other.orcid }));
    });
    const drop = document.createElement("button");
    drop.type = "button";
    drop.textContent = t("identity.forget");
    drop.addEventListener("click", () => {
      forgetIdentity(other.orcid);
      refreshIdentityPanel();
      refreshIdentityChip();
    });
    row.append(label, use, drop);
    known.appendChild(row);
  }
}

function declareIdentityFromPanel(): void {
  const input = document.getElementById("set-orcid") as HTMLInputElement;
  const name = (document.getElementById("set-orcid-name") as HTMLInputElement).value.trim();
  const surname = (document.getElementById("set-orcid-surname") as HTMLInputElement).value.trim();
  const res = declareIdentity(input.value, { name, surname });
  if (!res.ok) {
    // The REASON, not "invalid": a transposed pair and a half-typed iD are
    // different mistakes and the person fixing them needs to know which.
    toast(t(`identity.problem.${res.problem}`));
    return;
  }
  input.value = res.identity.orcid;   // show it back in canonical form
  applyIdentityToDocument();
  refreshIdentityPanel();
  refreshIdentityChip();
  toast(t("identity.declared", { orcid: res.identity.orcid }));
}

/**
 * Write the current identity onto the open document as its graph-scope author.
 *
 * The identity is a fact about the PERSON and lives in localStorage; the author
 * is a fact about the DOCUMENT and lives in the graph. Copying one into the
 * other is what makes "what I make carries my name" true — and it is a copy,
 * deliberately: a document authored today keeps saying who made it even after
 * this laptop is handed to somebody else.
 *
 * Only when a document is open, and never overwriting a DIFFERENT author who is
 * already there: a graph someone else authored is not re-attributed by opening
 * it. That is the same refusal as the mismatch case — a name is not ours to
 * change on somebody else's behalf.
 */
function applyIdentityToDocument(): void {
  if (!store) return;
  const identity = currentIdentity();
  if (!identity) return;
  const scope = store.readGraphScope();
  const who = `${identity.name ?? ""} ${identity.surname ?? ""}`.trim() || identity.orcid;
  if (scope.author && scope.orcid && scope.orcid !== identity.orcid) {
    toast(t("identity.documentHasAnotherAuthor", { orcid: scope.orcid }));
    return;
  }
  store.setGraphScope({
    author: who,
    orcid: identity.orcid,
    verified: identity.verified,
  });
  refreshInspector();
}

async function verifyIdentityFlow(): Promise<void> {
  const outcome = await verifyCurrentIdentity(identityProvider());
  switch (outcome.status) {
    case "verified":
      applyIdentityToDocument();   // the document learns it too
      refreshIdentityPanel();
      refreshIdentityChip();
      // Named as a mock, every time. The day this says nothing about being
      // simulated is the day someone believes a verification that never
      // happened.
      toast(t("identity.verifiedMock", { orcid: outcome.identity.orcid }));
      break;
    case "mismatch":
      // NOT promoted, NOT replaced: only the person in front of the screen
      // knows which of the two is the mistake, and adopting the verified one
      // silently would re-attribute everything they have authored so far.
      toast(t("identity.mismatch", {
        declared: outcome.declared, verified: outcome.verified,
      }));
      break;
    case "no-identity":
      toast(t("identity.stateNone"));
      break;
    default:
      toast(t("identity.verifyFailed", { detail: outcome.detail }));
  }
}

/**
 * THE GATE. Data preparation never asks this question; publishing always does.
 *
 * Returns true when the action may proceed. When it may not, it does NOT throw
 * an error at the user: it explains what is missing and opens the place where
 * it is fixed. Refusing an action is a moment to help, not to scold.
 */
function requireVerifiedIdentity(): boolean {
  const gate = publishGate();
  if (gate.allowed) return true;
  if (gate.reason === "no-identity") {
    toast(t("identity.gateNoIdentity"));
  } else {
    toast(t("identity.gateNotVerified", { orcid: gate.orcid }));
  }
  openSettings("settings-sect-identity");
  return false;
}

function openSettings(section?: string): void {
  const s = getSettings();
  setToolSel.value = s.sync.tool;
  setProtoSel.value = s.sync.protocol;
  setHostInp.value = s.sync.host;
  setPortInp.value = String(s.sync.port);
  const hubUrlInp = document.getElementById("set-hub-url") as HTMLInputElement | null;
  const hubRoomInp = document.getElementById("set-hub-room") as HTMLInputElement | null;
  if (hubUrlInp) hubUrlInp.value = s.sync.hubUrl ?? "";
  if (hubRoomInp) hubRoomInp.value = s.sync.hubRoom ?? "";
  setDevUuid.checked = s.developer.showNodeIds;
  setEdgeTips.checked = s.interaction.edgeTooltips;
  setStrictDocNames.checked = s.interaction.strictDocumentNames;
  setAiProvider.value = s.ai.provider;
  setAiModel.value = s.ai.model;
  setAiKey.value = "";
  setAtonBase.value = s.viewer.atonBase;
  setHeriverseApp.value = s.viewer.heriverseApp;
  const iiifInput = document.getElementById("set-iiif-base") as HTMLInputElement | null;
  if (iiifInput) iiifInput.value = s.iiif.base;
  const miradorInput = document.getElementById("set-mirador") as HTMLInputElement | null;
  if (miradorInput) miradorInput.value = s.iiif.mirador;
  void refreshAiKeyState();
  refreshIdentityPanel();
  refreshSyncUrlPreview();
  refreshAtonUrlPreview();
  settingsModal.classList.remove("hidden");
  // The tab FIRST, then the block: revealing something inside a hidden tab
  // scrolls against a panel that is not laid out, and lands nowhere.
  showSettingsTab(section ? tabOfSection(section) : lastSettingsTab());
  if (section) revealBlock(document.getElementById(section));
}

// ── the settings TABS ────────────────────────────────────────────────────────
//
// Nine sections in one scroll is a list you read by scrolling past what you did
// not come for. Tabs cost one thing — you can no longer see everything at once —
// and buy the thing that matters here: the panel opens ON what you asked for.
//
// Derived from the markup, never listed here: each `<section>` carries
// `data-settings-tab`, and the strip is whatever those attributes say, in DOM
// order. A hardcoded list would be a second place to edit and the first one to
// go stale — the rule this codebase already follows for node types and palettes.

/** Remembering where you were: a settings dialog that reopens on the first tab
 *  makes you navigate back every time you fix two related things. */
const SETTINGS_TAB_KEY = "emstudio.settings.tab";

function settingsSections(): HTMLElement[] {
  return [...settingsModal.querySelectorAll<HTMLElement>("[data-settings-tab]")];
}

function settingsTabIds(): string[] {
  const seen: string[] = [];
  for (const section of settingsSections()) {
    const tab = section.dataset.settingsTab ?? "";
    if (tab && !seen.includes(tab)) seen.push(tab);
  }
  return seen;
}

/** Which tab holds this section — by element id, the way every caller asks. */
function tabOfSection(sectionId: string): string | null {
  const section = document.getElementById(sectionId);
  return section?.dataset.settingsTab ?? null;
}

function lastSettingsTab(): string | null {
  try {
    return localStorage.getItem(SETTINGS_TAB_KEY);
  } catch {
    return null;                       // private mode: a forgotten tab, no more
  }
}

function showSettingsTab(wanted: string | null): void {
  const tabs = settingsTabIds();
  if (!tabs.length) return;
  // An unknown tab (a stale localStorage value after a section was renamed) is
  // not an error state to show: fall back to the first, silently.
  const active = wanted && tabs.includes(wanted) ? wanted : tabs[0];
  for (const section of settingsSections()) {
    section.classList.toggle("hidden", section.dataset.settingsTab !== active);
  }
  for (const button of settingsTabBar.querySelectorAll<HTMLButtonElement>(
    "[data-tab-target]")) {
    const isActive = button.dataset.tabTarget === active;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    // Roving tabindex: one stop for the whole strip, then ← → inside it. A
    // tab strip that costs nine tab-presses to walk past is a worse dialog
    // than the scrolling one it replaced.
    button.tabIndex = isActive ? 0 : -1;
  }
  // The scroll belongs to the tab, not to the dialog: arriving on a tab
  // half-way down the previous one's scroll is disorienting.
  settingsModal.querySelector(".modal-body")?.scrollTo({ top: 0 });
  try {
    localStorage.setItem(SETTINGS_TAB_KEY, active);
  } catch {
    /* not remembering is not a failure worth reporting */
  }
}

const settingsTabBar = document.getElementById("settings-tabs")!;

function buildSettingsTabs(): void {
  settingsTabBar.textContent = "";
  for (const tab of settingsTabIds()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-tab";
    button.dataset.tabTarget = tab;
    button.setAttribute("role", "tab");
    // `data-i18n` rather than a label written here: a language switch
    // re-translates the static DOM in one pass, and these come along.
    button.dataset.i18n = `settings.tab.${tab}`;
    button.textContent = t(`settings.tab.${tab}`);
    button.addEventListener("click", () => showSettingsTab(tab));
    settingsTabBar.appendChild(button);
  }
  settingsTabBar.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const tabs = settingsTabIds();
    const here = tabs.indexOf(lastSettingsTab() ?? tabs[0]);
    const next = tabs[(here + step + tabs.length) % tabs.length];
    showSettingsTab(next);
    settingsTabBar.querySelector<HTMLButtonElement>(
      `[data-tab-target="${next}"]`)?.focus();
  });
}

buildSettingsTabs();

/**
 * Bring a block into view and say so — the last step of every "open the panel ON
 * this" action (WIN7).
 *
 * The reflow read is not decoration: the caller has just un-hidden or rebuilt
 * the panel, and scrolling before the browser has laid it out scrolls against a
 * zero height. Doing it synchronously (rather than in a rAF) also means it works
 * in a window that is not being painted.
 */
function revealBlock(target: HTMLElement | null): void {
  if (!target) return;
  void target.offsetHeight; // flush layout before asking where it is
  target.scrollIntoView({ block: "start", behavior: "auto" });
  target.classList.add("settings-sect-flash");
  setTimeout(() => target.classList.remove("settings-sect-flash"), 1400);
}
function closeSettings(): void {
  settingsModal.classList.add("hidden");
}
for (const el of [setProtoSel, setHostInp, setPortInp])
  el.addEventListener("input", refreshSyncUrlPreview);
for (const el of [setAtonBase, setHeriverseApp])
  el.addEventListener("input", refreshAtonUrlPreview);
(document.getElementById("btn-settings") as HTMLButtonElement).addEventListener(
  "click",
  () => openSettings(),
);

// ── IDENTITY · the wiring ───────────────────────────────────────────────────
document.getElementById("set-orcid-declare")?.addEventListener(
  "click", () => declareIdentityFromPanel());
document.getElementById("set-orcid-verify")?.addEventListener(
  "click", () => void verifyIdentityFlow());
// Enter in the iD field declares: typing an identifier and pressing return is
// the gesture, and making people reach for a button afterwards is friction with
// no purpose.
document.getElementById("set-orcid")?.addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter") declareIdentityFromPanel();
});
document.getElementById("footer-identity")?.addEventListener(
  "click", identityChipClicked);

// ── SHELF1 · the wide list's own verbs ──────────────────────────────────────
restoreShelf();                       // a saved list that vanishes on reload is not saved
onShelfChange(() => {
  // the list changed, so the library's answer about it is stale: the next draw
  // of the Table asks again rather than showing yesterday's rows
  shelfTableAsked = false;
  if (activeWin().type === "shelf") renderShelf();
  // HDR2 · …and every OTHER shelf window on screen, which now matters: the
  // nine controls exist in every area's header, so a `+ URI` pressed in a
  // window that has not got the focus must repaint THAT window's list. While
  // the bar was a singleton inside the focused mount this could not happen,
  // which is why nobody had noticed it was missing.
  refreshTileSurfaces();
  syncShelfNameInputs();
});
// MULTIGRAPH · take another project into this one (additive, merge-by-UUID).
document.getElementById("btn-add-project")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.em.json,.emj";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      loadContainerDocument(JSON.parse(await file.text()), file.name, null,
                            { additive: true });
    } catch (e) {
      toast(`${file.name}: ${e instanceof Error ? e.message : e}`);
    }
  });
  input.click();
});

// HDR2 · the "+ folder" verb is a chip of the window header (`buildHeaderStrip`,
// `focusThen(win, openStoragePlaces)`), which every Storage area builds. The id
// it used to hang on lived in `#storage-bar` inside the focused mount, and that
// bar had already been neutralised in CSS — so this listener was wired to an
// invisible button. It goes with the singleton.
// HDR2 · nothing to wire by id here any more. The shelf's nine controls are
// built per window in `buildHeaderStrip` (the name, the count, `+ URI`, ⟳), in
// the Shelf menu (Open, Save, Empty) and in `openShelfUriForm` (the address and
// its two facts) — and their handlers close over the window they belong to,
// which is what a singleton `#shelf-bar` could never do.
document.getElementById("shelf-promote-facet")?.addEventListener(
  "change", () => renderShelfPromoteTargets());
document.getElementById("shelf-promote-go")?.addEventListener(
  "click", () => void confirmShelfPromote());
document.getElementById("shelf-promote-cancel")?.addEventListener(
  "click", () => closeShelfPromote());
document.getElementById("shelf-promote-x")?.addEventListener(
  "click", () => closeShelfPromote());

// THE GATE, on the one publication-shaped action there is. Note what is NOT
// here: Save, Save As, Export SVG/GraphML/TTL. Those put a file on your own
// disk — preparation, not publication — and gating them would make the tool
// useless exactly where it is most needed, in a trench with no network.
document.getElementById("btn-publish")?.addEventListener("click", () => {
  if (!requireVerifiedIdentity()) return;
  // Verified, and still nothing to publish TO: the StratiGraph delivery
  // endpoint is phase 2. Saying so is the honest end of this path — the gate is
  // real and measurable today, the destination is not there yet.
  toast(t("identity.publishNotConnected"));
});
(document.getElementById("settings-close") as HTMLButtonElement).addEventListener(
  "click",
  closeSettings,
);
(
  document.getElementById("settings-cancel") as HTMLButtonElement
).addEventListener("click", closeSettings);
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettings(); // click on the backdrop
});
(
  document.getElementById("settings-save") as HTMLButtonElement
).addEventListener("click", () => {
  const port = Math.min(
    65535,
    Math.max(1, parseInt(setPortInp.value, 10) || 8788),
  );
  const next: Settings = {
    sync: {
      tool: setToolSel.value,
      protocol: setProtoSel.value === "wss" ? "wss" : "ws",
      host: setHostInp.value.trim() || "localhost",
      port,
      // C2 · the accept policy is not edited here: it is a live control in the
      // footer, changed while working. Carried through so saving the endpoint
      // does not silently reset what this client is taking in.
      accept: getSettings().sync.accept,
      // P4.3 · the room's address. The token is NOT here: it is asked for at
      // connection time and never written down.
      hubUrl: (document.getElementById("set-hub-url") as HTMLInputElement)?.value.trim() ?? "",
      hubRoom: (document.getElementById("set-hub-room") as HTMLInputElement)?.value.trim() ?? "",
    },
    developer: { showNodeIds: setDevUuid.checked },
    interaction: {
      edgeTooltips: setEdgeTips.checked,
      strictDocumentNames: setStrictDocNames.checked,
    },
    // provider + model only — the key is never part of what gets persisted
    ai: {
      provider: setAiProvider.value || "claude",
      model: setAiModel.value.trim(),
    },
    viewer: {
      atonBase: setAtonBase.value.trim().replace(/\/+$/, ""),
      heriverseApp:
        setHeriverseApp.value.trim().replace(/^\/+|\/+$/g, "") || "a/heriverse",
    },
    iiif: {
      base: (document.getElementById("set-iiif-base") as HTMLInputElement)
        ?.value.trim().replace(/\/+$/, "") ?? "",
      mirador: (document.getElementById("set-mirador") as HTMLInputElement)
        ?.value.trim() || getSettings().iiif.mirador,
    },
  };
  saveSettings(next);
  closeSettings();
  refreshInspector(); // reflect the UUID-visibility toggle immediately
  // A narrative on screen may hold 3D blocks that were waiting for exactly this.
  refreshNarrativeView();
  toast(
    sync.connected
      ? "Sync settings saved — reconnect to apply"
      : `Sync target: ${getSyncUrl()}`,
  );
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settingsModal.classList.contains("hidden")) {
    e.stopPropagation();
    closeSettings();
  }
});

// ── Resources panel (R5): the EMStudio face of the shared Resource layer, over
// the em-bridge (single connector). Sections Documents · RM · DTC · Shelf.
// Shelf = the orphans from /scan-resources on a chosen library/DosCo folder;
// hatting one creates a Document whose node_id ADOPTS the FS stable ID (mirror
// R4). Per-graph view; canvas/palette untouched (additive).
/** SHELF1 · a candidate from the ORPHAN SCAN of a folder — Model B.
 *
 * Renamed from `ShelfEntry`, because it is not the shelf: the design note is
 * explicit that the orphan scan is an ENTRANCE to the shelf, not the shelf
 * itself. Keeping the old name meant two different things called the same word
 * in one file, and the one that was NOT the shelf held the name.
 */
interface OrphanEntry {
  resource_id: string;
  key_id: string;
  filename: string;
  rel_path: string;
}
interface ResourceRow {
  id: string;
  name: string;
  locator: string;
  kind: string;
}
// The Document node_type comes from the datamodel (no hardcoded string).
const RES_DOC_TYPE = nodeTypeForClass("DocumentNode") ?? "document";
// The resource (link) node_type — datamodel-driven, not hardcoded.
const RES_LINK_TYPE = nodeTypeForClass("ResourceNode") ?? "resource";
const resourcesModal = document.getElementById("resources-modal")!;
const resFolderInp = document.getElementById("res-folder") as HTMLInputElement;
const resStatus = document.getElementById("res-status")!;
const resShelf = document.getElementById("res-shelf")!;
const resShelfCount = document.getElementById("res-shelf-count")!;
const resDocs = document.getElementById("res-docs")!;
const resDocsCount = document.getElementById("res-docs-count")!;
const resLinks = document.getElementById("res-links")!;
const resLinksCount = document.getElementById("res-links-count")!;
let resLastShelf: OrphanEntry[] = [];

function openResources(): void {
  if (!store) {
    toast("Open a document first");
    return;
  }
  renderResDocuments();
  void renderResLinks();
  resStatus.textContent = resFolderInp.value.trim()
    ? "Press Scan to refresh the Shelf."
    : "Set a library / DosCo folder, then Scan.";
  resourcesModal.classList.remove("hidden");
}
function closeResources(): void {
  resourcesModal.classList.add("hidden");
}

// ── previews (N10) ────────────────────────────────────────────────────────────
// Every asset row carries its own preview, lazily: the thumbnail fetches only
// when the row is scrolled into view, addressed by the resource's STABLE ID (the
// bridge resolves it through the folder manifest or the graph's resolver — the
// page never sees a filesystem path). See `resource-preview.ts`.
//
// The folder is passed whenever the user has set one, because the FS manifest and
// the graph share ONE id space: a hatted Document adopted its FS stable id, so it
// previews from the same manifest the Shelf uses, with no extra machinery.
function previewFolder(): string | undefined {
  return resFolderInp.value.trim() || undefined;
}

/** A row: preview · label(+badges) · actions. */
function resRow(thumb: HTMLElement | null, label: string,
                sub?: string): { row: HTMLElement; main: HTMLElement } {
  const row = document.createElement("div");
  row.className = "res-row";
  if (thumb) row.appendChild(thumb);
  const main = document.createElement("div");
  main.className = "res-row-main";
  const title = document.createElement("span");
  title.className = "res-row-title";
  title.textContent = label;
  main.appendChild(title);
  if (sub) {
    const s = document.createElement("span");
    s.className = "res-row-sub";
    s.textContent = sub;
    main.appendChild(s);
  }
  row.appendChild(main);
  return { row, main };
}

function renderResDocuments(): void {
  if (!store) return;
  const docs = store.doc.graph.nodes.filter(
    (n) => n.node_type === RES_DOC_TYPE,
  );
  resDocs.innerHTML = "";
  resDocsCount.textContent = docs.length ? `(${docs.length})` : "";
  if (!docs.length) {
    resDocs.innerHTML = `<div class="res-empty">— no documents yet</div>`;
    return;
  }
  const docJson = JSON.parse(store.toJSON());
  for (const d of docs) {
    const data = (d.data ?? {}) as Record<string, unknown>;
    const locator = typeof data.url === "string" ? data.url : undefined;
    const label = String(d.name || d.id.slice(0, 8));
    const thumb = createResourceThumb({
      resourceId: d.id,
      folder: previewFolder(),
      doc: docJson,
      bridge: bridgeUrl,
      // IIIF · a document that IS a published image gets its thumbnail from the
      // image server instead of a round trip through the bridge
      node: d,
      declaredType: typeof data.resource_type === "string"
        ? data.resource_type : undefined,
      locator,
      label,
    });
    const { row } = resRow(thumb, label);
    resDocs.appendChild(row);
  }
}

function renderResShelf(): void {
  resShelf.innerHTML = "";
  resShelfCount.textContent = resLastShelf.length
    ? `(${resLastShelf.length})`
    : "";
  if (!resLastShelf.length) {
    resShelf.innerHTML = `<div class="res-empty">— Shelf empty (all resources hatted / matched)</div>`;
    return;
  }
  for (const e of resLastShelf) {
    // A Shelf entry is not (yet) a graph node, so its preview resolves through
    // the FOLDER manifest alone — no em.json needs to travel per row.
    const thumb = createResourceThumb({
      resourceId: e.resource_id,
      folder: previewFolder(),
      bridge: bridgeUrl,
      locator: e.filename,
      label: e.filename,
    });
    const { row } = resRow(thumb, e.filename, e.key_id);
    const btn = document.createElement("button");
    btn.textContent = "→ Document";
    btn.title =
      "Create a Document adopting this resource's stable ID as its node id";
    btn.addEventListener("click", () => hatShelfEntry(e));
    row.appendChild(btn);
    resShelf.appendChild(row);
  }
}

async function scanResources(): Promise<void> {
  if (!store) return;
  const folder = resFolderInp.value.trim();
  if (!folder) {
    resStatus.textContent = "Set a folder first.";
    return;
  }
  resStatus.textContent = "Scanning…";
  try {
    const res = await fetch(`${await bridgeUrl()}/scan-resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder, doc: JSON.parse(store.toJSON()) }),
    });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON */
      }
      resStatus.textContent = `Scan failed: ${msg}`;
      return;
    }
    const j = await res.json();
    resLastShelf = (j.shelf ?? []) as OrphanEntry[];
    renderResShelf();
    resStatus.textContent = `Indexed folder — ${resLastShelf.length} on the Shelf.`;
  } catch {
    resStatus.textContent = BRIDGE_UNREACHABLE;
  }
}

// Hat: promote a Shelf orphan → a Document ADOPTING the FS stable ID as node_id.
// em.json is the source of truth (the mutation is a plain addNode in the store);
// the resource then leaves the Shelf because its stable ID is now a graph node.
function hatShelfEntry(entry: OrphanEntry): void {
  if (!store) return;
  if (store.node(entry.resource_id)) {
    toast("A node with this stable ID already exists");
    return;
  }
  store.addNode({
    id: entry.resource_id, // ADOPT the FS stable ID
    name: entry.key_id || entry.resource_id.slice(0, 8),
    node_type: RES_DOC_TYPE,
    description: "",
    data: {},
  });
  resLastShelf = resLastShelf.filter(
    (e) => e.resource_id !== entry.resource_id,
  );
  renderResShelf();
  renderResDocuments();
  toast(`Hatted ${entry.key_id || "resource"} → Document`);
}

// ── Resources (link nodes) list + "Promote to MinIO" ───────────────────────────
// Lists the graph's resources via the bridge (/list-resources — single connector).
// Promote uploads a LOCAL resource's bytes into the shared MinIO under its OWN
// stable ID (one ID space FS↔MinIO), then repoints its ResourceNode locator at the
// returned s3:// URI. The stable ID and every graph reference are unchanged.
async function renderResLinks(): Promise<void> {
  if (!store) return;
  resLinks.innerHTML = `<div class="res-empty">loading…</div>`;
  let rows: ResourceRow[] = [];
  try {
    const res = await fetch(`${await bridgeUrl()}/list-resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: JSON.parse(store.toJSON()) }),
    });
    if (res.ok) rows = ((await res.json()).resources ?? []) as ResourceRow[];
    else rows = listResourcesFromStore(); // bridge down → local fallback
  } catch {
    rows = listResourcesFromStore();
  }
  resLinks.innerHTML = "";
  resLinksCount.textContent = rows.length ? `(${rows.length})` : "";
  if (!rows.length) {
    resLinks.innerHTML = `<div class="res-empty">— no resources yet</div>`;
    return;
  }
  const docJson = JSON.parse(store.toJSON());
  for (const r of rows) {
    const node = store.node(r.id);
    const data = (node?.data ?? {}) as Record<string, unknown>;
    const label = String(r.name || r.id.slice(0, 8));
    const thumb = createResourceThumb({
      resourceId: r.id,
      folder: previewFolder(),
      doc: docJson,
      bridge: bridgeUrl,
      node,
      declaredType: typeof data.resource_type === "string"
        ? data.resource_type : undefined,
      locator: r.locator,
      label,
    });
    const { row } = resRow(thumb, label, r.kind);
    // Promote is offered only for LOCAL resources (a path we can upload);
    // already-remote (s3/http) resources have nothing to push.
    if (r.kind === "local_path" || r.kind === "file_uri") {
      const btn = document.createElement("button");
      btn.textContent = "Promote to MinIO";
      btn.title = "Upload into the shared MinIO (keeps the stable ID) and repoint the locator";
      btn.addEventListener("click", () => void promoteToMinio(r, btn));
      row.appendChild(btn);
    }
    resLinks.appendChild(row);
  }
}

// Local fallback when the bridge is unreachable: read the link nodes straight
// from the in-memory em.json (kind classified the same way the bridge does).
function listResourcesFromStore(): ResourceRow[] {
  if (!store) return [];
  const out: ResourceRow[] = [];
  for (const n of store.doc.graph.nodes) {
    if (n.node_type !== RES_LINK_TYPE) continue;
    const url = String((n.data as Record<string, unknown>)?.url ?? "");
    const low = url.toLowerCase();
    const kind = low.startsWith("http://") || low.startsWith("https://")
      ? "http_url"
      : low.startsWith("s3://")
        ? "s3_uri"
        : low.startsWith("file://")
          ? "file_uri"
          : "local_path";
    out.push({ id: n.id, name: String(n.name ?? ""), locator: url, kind });
  }
  return out;
}

async function promoteToMinio(r: ResourceRow, btn: HTMLButtonElement): Promise<void> {
  if (!store) return;
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "Promoting…";
  try {
    const res = await fetch(`${await bridgeUrl()}/ingest-minio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // resource_id = the resource's stable ID → same id in FS and MinIO
      body: JSON.stringify({ path: r.locator, resource_id: r.id }),
    });
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON */
      }
      // 501 = the [minio] extra isn't bundled — a clear, graceful message.
      toast(res.status === 501 ? `MinIO unavailable: ${msg}` : `Promote failed: ${msg}`);
      btn.disabled = false;
      btn.textContent = prev;
      return;
    }
    const j = (await res.json()) as { s3_uri: string; object_key: string };
    // Repoint the ResourceNode locator at the shared-store URI (id + refs unchanged).
    const node = store.node(r.id);
    const data = { ...((node?.data as Record<string, unknown>) ?? {}), url: j.s3_uri };
    store.updateNode(r.id, { data });
    toast(`Promoted → ${j.s3_uri}`);
    await renderResLinks();
  } catch {
    toast(BRIDGE_UNREACHABLE);
    btn.disabled = false;
    btn.textContent = prev;
  }
}

(document.getElementById("btn-resources") as HTMLButtonElement).addEventListener(
  "click",
  openResources,
);
(
  document.getElementById("resources-close") as HTMLButtonElement
).addEventListener("click", closeResources);
(
  document.getElementById("resources-done") as HTMLButtonElement
).addEventListener("click", closeResources);
(document.getElementById("res-scan") as HTMLButtonElement).addEventListener(
  "click",
  scanResources,
);
resourcesModal.addEventListener("click", (e) => {
  if (e.target === resourcesModal) closeResources();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !resourcesModal.classList.contains("hidden")) {
    e.stopPropagation();
    closeResources();
  }
});

// "Circles of detail" panel — progressive disclosure, per view. Each ring
// bundles node/edge types (filters.ts); toggling a ring re-derives the hidden
// sets and rebuilds. Applies to BOTH views (matrix hides paradata by default;
// each view keeps its own visible-ring set in circleState).
const filterPanel = document.getElementById("filter-panel")!;
const btnViewProps = document.getElementById("btn-view-props")!;
function filterPanelOpen(): boolean {
  return !filterPanel.classList.contains("hidden");
}
// The panel and its floating opener are mutually exclusive in the top-right
// corner: opening hides the gear button, the panel's × restores it.
function openFilterPanel(): void {
  renderCirclesPanel();
  filterPanel.classList.remove("hidden");
  btnViewProps.classList.add("hidden");
}
function closeFilterPanel(): void {
  filterPanel.classList.add("hidden");
  refreshFunnel();
}

/**
 * The funnel is shown when it has something to filter: a document open, a CANVAS
 * window (nodes and connectors are not on a table or a document), and the panel
 * itself not already open in its place. One rule, called from every route that
 * could change one of those three — otherwise each route re-decides and they
 * disagree, which is how the funnel ended up on the narrative.
 */
function refreshFunnel(): void {
  const belongs =
    !!store && activeWindowType() === "graph" && !filterPanelOpen();
  btnViewProps.classList.toggle("hidden", !belongs);
}
// Monochrome (B/W) display toggle — every node draws black-bordered + white
// (shapes disambiguate). A pure presentation option (not a filter), so it lives
// as its own flag, exposed at the end of the detail panel.
let monochrome = false;
function applyTemplate(t: DetailTemplate): void {
  circleState[view] = new Set(t.circles);
  recomputeHiddenFromCircles();
  buildScenes();
  updateLegend();
  draw();
  renderCirclesPanel();
  if (view === "matrix") void refreshMatrixViewLayout();
  else matrixViewLayout = null;
}
function renderCirclesPanel(): void {
  filterPanel.innerHTML = "";
  if (!store) return;
  // per-circle present counts, for the current document
  const nodeCount = new Map<CircleKey, number>();
  for (const n of store.doc.graph.nodes) {
    const c = nodeCircle(n.node_type);
    if (c) nodeCount.set(c, (nodeCount.get(c) ?? 0) + 1);
  }
  const edgeCount = new Map<CircleKey, number>();
  for (const e of store.doc.graph.edges) {
    const c = edgeCircle(e.edge_type ?? "");
    if (c) edgeCount.set(c, (edgeCount.get(c) ?? 0) + 1);
  }
  const visible = circleState[view];

  const head = document.createElement("div");
  head.className = "fp-head";
  const hint = document.createElement("span");
  hint.className = "fp-hint";
  hint.textContent = `Detail level — ${t(`mode.${view}`)} view`;
  const close = document.createElement("button");
  close.className = "fp-close";
  close.textContent = "✕";
  close.title = "Close (Esc)";
  close.setAttribute("aria-label", "Close view properties");
  close.addEventListener("click", closeFilterPanel);
  head.append(hint, close);
  filterPanel.appendChild(head);

  // Templates (at the top): one-click presets that set BOTH node and edge
  // rings (this replaced the old edge-only "All edges / Stratigraphic / None").
  const eq = (t: DetailTemplate): boolean =>
    t.circles.length === visible.size && t.circles.every((k) => visible.has(k));
  const tmpl = document.createElement("div");
  tmpl.className = "fp-template";
  const tlbl = document.createElement("span");
  tlbl.textContent = "Template";
  const tsel = document.createElement("select");
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Custom…";
  tsel.appendChild(ph);
  for (const t of TEMPLATES) {
    const o = document.createElement("option");
    o.value = t.key;
    o.textContent = t.label;
    if (eq(t)) o.selected = true;
    tsel.appendChild(o);
  }
  tsel.addEventListener("change", () => {
    const t = TEMPLATES.find((x) => x.key === tsel.value);
    if (t) applyTemplate(t);
  });
  tmpl.append(tlbl, tsel);
  filterPanel.appendChild(tmpl);

  const addSection = (title: string, kind: "node" | "edge"): void => {
    const h = document.createElement("div");
    h.className = "fp-sect";
    h.textContent = title;
    filterPanel.appendChild(h);
    for (const circle of CIRCLES.filter((c) => c.kind === kind)) {
      const count =
        (kind === "node" ? nodeCount : edgeCount).get(circle.key) ?? 0;
      const row = document.createElement("label");
      row.className = "fp-row";
      if (!count) row.style.opacity = "0.45";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = visible.has(circle.key);
      cb.addEventListener("change", () => {
        if (cb.checked) visible.add(circle.key);
        else visible.delete(circle.key);
        recomputeHiddenFromCircles();
        buildScenes();
        updateLegend();
        draw();
        // Matrix recompacts on the filtered subgraph (em-core view layout);
        // in Graph the layout already reflows, so just invalidate for later.
        if (view === "matrix") void refreshMatrixViewLayout();
        else matrixViewLayout = null;
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(` ${circle.label} (${count})`));
      filterPanel.appendChild(row);
    }
  };
  addSection("Nodes", "node");
  addSection("Edges", "edge");

  // Display options (presentation, not a filter): monochrome overrides every
  // node to a black border + white fill — the pre-EM-1.3 shape-only look.
  const dh = document.createElement("div");
  dh.className = "fp-sect";
  dh.textContent = "Display";
  filterPanel.appendChild(dh);
  const monoRow = document.createElement("label");
  monoRow.className = "fp-row";
  const monoCb = document.createElement("input");
  monoCb.type = "checkbox";
  monoCb.checked = monochrome;
  monoCb.addEventListener("change", () => {
    monochrome = monoCb.checked;
    draw();
  });
  monoRow.appendChild(monoCb);
  monoRow.appendChild(document.createTextNode(" Monochrome (B/W) — black borders"));
  filterPanel.appendChild(monoRow);

  const reset = document.createElement("button");
  reset.className = "fp-reset";
  reset.textContent = "Reset this view";
  reset.addEventListener("click", () => {
    circleState[view] = defaultVisibleCircles(view);
    recomputeHiddenFromCircles();
    buildScenes();
    updateLegend();
    draw();
    renderCirclesPanel();
    if (view === "matrix") void refreshMatrixViewLayout();
    else matrixViewLayout = null;
  });
  filterPanel.appendChild(reset);
}
btnViewProps.addEventListener("click", () => {
  if (filterPanel.classList.contains("hidden")) openFilterPanel();
  else closeFilterPanel();
});

// WIN-FIX1 · the side-panel TABS are gone with the aside they belonged to.
//
// Inspector / Nodes / EMTree / Log are WINDOWS now (WIN6, WIN7), and StratiMiner
// is a floating tool. What was left of the aside was a strip of tabs whose
// panels lived somewhere else and a collapse handle for an empty column. The
// `#side` element stays in the DOM, permanently hidden, as the PARKING PLACE a
// panel returns to when nothing is showing it — those panels are singletons with
// handlers wired at boot, so they must always have somewhere to be.
//
// Everything that used to ask "which aside tab is active?" now asks the only
// question that is left: is this panel mounted in a window or a tool?

// ── EMTree ────────────────────────────────────────────────────────────────────

function refreshEMTree(): void {
  // ONE SURFACE · every live EMtree window, and the optimisation that used to be
  // `panelIsMounted(emtreeEl)` — "do not draw a panel nobody can see" — is the
  // same sentence said better: the registry has no instances of this type, so
  // the loop does nothing. Nobody reads the DOM to find out where a thing lives.
  refreshSurfaces("emtree");
}

/**
 * Open the EMtree — the graphs of this workspace — even with no document loaded.
 *
 * Reached from the empty-state hint ("open the workspace"), which is exactly the
 * moment it matters: the tree is where you go to OPEN a graph, so gating it
 * behind having one would put the tool behind the problem it solves.
 *
 * WIN-FIX1 · it is a WINDOW now, not an aside tab. If the arrangement already
 * has an EMtree area, go there; otherwise this window becomes one — the same
 * transform every other "show me that instead" performs.
 */
function openEMTree(): void {
  const existing = windowsOf().find((w) => w.type === "emtree");
  if (existing) {
    selectWindow(existing.id);
    return;
  }
  const win = activeWin();
  setWinType(win, "emtree");
  setWinCurrent(win, "panel", "emtree");
  renderTiles();   // the one structural entry: it mounts and re-heads too
}

const emtreeHandlers: EMTreeHandlers = {
  onActivate: (id) => {
    if (id === emtree.activeId) return;
    activateSlot(id);
  },
  onRemove: (id) => {
    const slot = emtree.get(id);
    if (!slot) return;
    // Unsaved work is the one thing a close must not take silently.
    if (slot.store.dirty
        && !confirm(t("emtree.unsaved", { name: slotLabel(slot) }))) {
      return;
    }
    const nextId = emtree.remove(id);
    if (nextId) {
      // The neighbour becomes active. `activateSlot` refuses a no-op switch, so
      // force the swap by clearing our idea of "current" first — remove() has
      // already moved `activeId`, and the store still points at the closed slot.
      store = null;
      activateSlot(nextId);
    } else {
      closeWorkspace();
    }
    refreshEMTree();
  },
  onOpen: () => void openDocument(),
  onNew: () => newDocument(),
  onOpenRecent: (r) => void openRecentFile(r),
  // AUX1 · auxiliary files live on the SLOT and never in em.json, so every one of
  // these mutates `slot.auxiliaryFiles` and re-renders the tree — none of them
  // touches `store`, which is what keeps an un-baked aux out of a shared document.
  onAuxAdd: () => {
    const slot = emtree.active();
    if (!slot) {
      toast("Open a graph first");
      return;
    }
    // The BROWSER picker cannot give an absolute path (same limit as StratiMiner's
    // folder field): it gives a name, and `webkitRelativePath`'s first segment for
    // a directory. On desktop the native dialog gives the real path. Either way
    // the locator is what a future mapping will resolve — nothing reads it today.
    auxFileInput.click();
  },
  onAuxRemove: (auxId) => {
    const slot = emtree.active();
    if (!slot) return;
    const i = slot.auxiliaryFiles.findIndex((f) => f.id === auxId);
    if (i < 0) return;
    const [gone] = slot.auxiliaryFiles.splice(i, 1);
    // AUX2: if it was mapped, its volatile nodes must go with it (they were
    // never in em.json, so this only touches the in-memory graph).
    if (gone.mapped && store) store.dropVolatile(auxId);
    refreshEMTree();
    toast(`removed ${gone.name} (the document is untouched)`);
  },
  onAuxToggle: (auxId) => {
    const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (!f) return;
    f.expanded = !f.expanded;
    refreshEMTree();
  },
  onAuxTypeChange: (auxId, fileType) => {
    const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (!f) return;
    f.fileType = fileType;
    refreshEMTree();
  },
  onAuxOption: (auxId, key, value) => {
    const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (!f) return;
    (f.options ??= {})[key] = value;
    // no re-render: the field already holds the value; a rebuild would drop focus
  },
  onAuxMap: (auxId) => void mapAux(auxId),
  onAuxUnmap: (auxId) => {
    const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (!f || !store) return;
    const n = store.dropVolatile(auxId);
    f.mapped = false;
    f.baked = false;
    refreshEMTree();
    toast(`unmapped ${f.name} — ${n} volatile node(s) removed`);
  },
  onAuxBake: (auxId) => {
    const f = emtree.active()?.auxiliaryFiles.find((x) => x.id === auxId);
    if (!f || !store) return;
    if (!f.mapped) {
      toast("map the source first, then bake");
      return;
    }
    const n = store.bakeVolatile(auxId);
    f.baked = true;
    refreshEMTree();
    toast(`baked ${f.name} — ${n} node(s) now persistent (saved with em.json)`);
  },
  onRename: (id, name) => {
    // POL3: renaming a row renames the GRAPH — `emtree.rename` writes
    // `graph.name` in that slot's document, which is the single source. For the
    // ACTIVE slot the store's change listener already refreshes the tree, the
    // Inspector and the title; these calls cover the other case, a background
    // slot renamed from the list (whose listener deliberately returns early).
    emtree.rename(id, name);
    refreshEMTree();
    refreshInspector(); // the Inspector's Name field is the same fact
    updateWindowTitle();
  },
};

/**
 * Name problems in the active document, keyed by node id (NAME1).
 *
 * Computed ONCE per document change and read by the renderer (label colour) and
 * the context menu (the rename entry), so the two cannot disagree about what is
 * wrong. Recomputing per draw would also work — `naming.ts` is pure and the graph
 * is the only input — but the answer only changes when the graph does.
 *
 * There is no cache to invalidate: renaming a document makes its extractors
 * inconsistent, and that shows up because the map is rebuilt from the graph, not
 * patched.
 */
let nameStatus: Map<string, NameCheck> = new Map();

function namingOpts(): { strictDocumentNames: boolean } {
  return { strictDocumentNames: getSettings().interaction.strictDocumentNames };
}

function refreshNameStatus(): void {
  nameStatus = store ? nameStatusMap(store.doc, namingOpts()) : new Map();
}

/** The last graph was closed: back to the empty canvas, without a stale view. */
function closeWorkspace(): void {
  store = null;
  currentFilePath = null;
  contextStack = [];
  contextScene = null;
  hoverId = null;
  selectedId = null;
  selectedIds = new Set();
  selectedNarrativeId = null;
  matrixViewLayout = null;
  graphOverrides.clear();
  dtcOverrides.clear();
  multigraphOverrides.clear();
  resetWindowCameras();
  phasesCollapsed.clear();
  scenes.matrix = null;
  scenes.graph = null;
  scenes.dtc = null;
  scenes.multigraph = null;
  dropHint.classList.remove("hidden");
  info.textContent = t("toast.openOrDrop");
  select(null);
  nodeList.refresh();
  updateToolbar();
  updateBreadcrumb();
  updateLegend();
  refreshInspector();
  refreshNarrativeView();
  draw();
  logInfo(t("toast.workspaceEmpty"));
}

// ── language ──────────────────────────────────────────────────────────────────
//
// The selector, and what happens on a switch. Two kinds of string need two
// treatments and that is the whole design:
//
//  * **static chrome** (toolbar, tabs, Settings) carries `data-i18n` in the HTML
//    and is re-translated in place by `applyStaticTranslations`. Rewriting the
//    toolbar as TS just to make it translatable would have been a large change
//    for nothing; an attribute per element is the smaller promise.
//  * **rendered panels** (EMTree, StratiMiner, the inspector) call `t()` while
//    they build, so they only need re-rendering.
function populateLanguageSelect(): void {
  const select = document.getElementById("set-language") as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = LOCALES.map((locale) => {
    // Two different facts, in order of what a reader needs to know:
    //  · not validated → say so. All six drafts answer 100% of the keys, so a
    //    percentage would now read as "finished" and hide the thing that matters:
    //    nobody has checked the terminology yet.
    //  · incomplete → the percentage, because then English shows through and
    //    somebody picking that language deserves to know why it barely changed.
    let suffix = "";
    if (!isValidated(locale.code)) {
      suffix = ` — ${t("settings.aiDraft")}`;
    } else {
      const done = Math.round(coverage(locale.code) * 100);
      if (done < 100) suffix = ` — ${done}% ${t("settings.translated")}`;
    }
    return `<option value="${locale.code}">${locale.label}${suffix}</option>`;
  }).join("");
  select.value = getLocale();
  refreshValidateToggle();
}

/**
 * The "mark validated" tick, for the language currently in use (POL3).
 *
 * Offered only for a locale that is NOT already validated in the source: for
 * `en`/`it` the row would be a control that cannot change anything, which reads
 * as broken rather than as settled.
 */
function refreshValidateToggle(): void {
  const row = document.getElementById("set-lang-validate-row");
  const hint = document.getElementById("set-lang-validate-hint");
  const box = document.getElementById("set-lang-validate") as HTMLInputElement | null;
  if (!row || !hint || !box) return;
  const code = getLocale();
  const inBuild = isValidatedInBuild(code);
  row.classList.toggle("hidden", inBuild);
  hint.classList.toggle("hidden", inBuild);
  box.checked = isValidated(code);
}

document.getElementById("set-lang-validate")?.addEventListener("change", (event) => {
  const on = (event.target as HTMLInputElement).checked;
  setValidated(getLocale(), on);
  // The badge lives in the selector's own option labels, so the selector has to be
  // rebuilt — which also re-reads the tick, keeping the two in step.
  populateLanguageSelect();
  toast(on ? t("settings.markValidated") : t("settings.aiDraft"));
});

function applyLanguage(code: Locale): void {
  setLocale(code);          // persists, sets dir/lang, re-translates the static DOM
  populateLanguageSelect(); // the percentages carry a translated word themselves
  // Everything that renders its own text:
  refreshEMTree();
  refreshStratiMiner();
  refreshInspector();
  nodeList.refresh();
  refreshNarrativeView();
  updateLegend();
  updateToolbar();
  draw();                   // the canvas draws no chrome, but the legend feeds it
}

document.getElementById("set-language")?.addEventListener("change", (event) => {
  applyLanguage((event.target as HTMLSelectElement).value as Locale);
});

// ── StratiMiner ───────────────────────────────────────────────────────────────
//
// The panel owns no logic: it renders state and calls back. The three bridge
// calls live here because endpoint precedence (`bridgeUrl`) is owned here, and
// because loading the produced document is `loadDocument`'s job — the same entry
// point Open… and drop use, so a StratiMiner graph is not a second kind of
// document with its own quirks.
let smState = initialStratiMinerState();

function refreshStratiMiner(): void {
  renderStratiMiner(stratiminerEl, smState, smHandlers, { native: isTauri() });
}

// ── THE MAPPING EDITOR · StratiMiner's twin ─────────────────────────────────
//
// StratiMiner makes a GRAPH from a folder of sources. This makes the MAPPING
// FILE that importers apply — to a table or to an XML, dynamically (a volatile
// auxiliary) or baked. Same family, same kind of surface: an instrument you
// reach for, that produces an artefact, and that goes away.
//
// EVERY vocabulary comes from the library over the bridge — the CIDOC classes on
// offer, the EM type each resolves to, the edges the datamodel allows between two
// of them, and the verdict on the result. Nothing about the EM language is
// written on this side; `scripts/check-mapping-editor.mjs` reads the render
// module and fails if a type name appears in it. The reason is not tidiness: the
// one thing this editor exists to produce is a file that agrees with the
// datamodel, and a picker with its own list would be a second datamodel.

const mappingEditorEl = document.getElementById("mapping-editor")!;
let meState: MappingEditorState = { ...EMPTY_MAPPING_STATE };

function refreshMappingEditor(): void {
  renderMappingEditor(mappingEditorEl, meState, meHandlers);
}

/** One call to the bridge's mapping surface. Returns null and sets the note when
 *  the bridge is not there — the editor is unusable without it and says so,
 *  rather than offering pickers filled with nothing. */
async function askMapping(route: string, body: Record<string, unknown>
                          ): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${await bridgeUrl()}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let message = `bridge ${res.status}`;
      try {
        const answer = (await res.json()) as { error?: string };
        if (answer?.error) message = answer.error;
      } catch {
        /* not JSON */
      }
      meState.note = message;
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch {
    meState.note = BRIDGE_UNREACHABLE;
    return null;
  }
}

/** The catalog, once per session: the CIDOC classes and the property type. */
async function ensureMappingCatalog(): Promise<void> {
  if (meState.catalog.length) return;
  const answer = await askMapping("/mapping-catalog", {});
  if (!answer) return;
  meState.catalog = (answer.catalog as MappingEditorState["catalog"]) ?? [];
  meState.groups = (answer.groups as MappingEditorState["groups"]) ?? undefined;
  meState.propertyType = (answer.property_type as string | undefined) ?? undefined;
  meState.extensions =
    (answer.extensions as Record<string, string> | undefined) ?? undefined;
}

/** Read a source: its fields, its samples, and the one question only a person
 *  can answer (which table / which element is a record). */
async function readMappingSource(): Promise<void> {
  const path = meState.path.trim();
  if (!path) {
    meState.note = t("me.needPath");
    refreshMappingEditor();
    return;
  }
  meState.busy = "read";
  meState.note = "";
  refreshMappingEditor();
  await ensureMappingCatalog();
  const answer = await askMapping("/mapping-fields", {
    path,
    table: meState.table,
    record_path: meState.recordPath,
  });
  meState.busy = "";
  if (answer) {
    meState.format = String(answer.format ?? "");
    meState.fields = (answer.fields as MappingEditorState["fields"]) ?? [];
    meState.tables = (answer.tables as string[] | undefined) ?? undefined;
    meState.table = (answer.table as string | undefined) ?? meState.table;
    meState.recordPath = (answer.record_path as string | undefined)
      ?? meState.recordPath;
    meState.recordPaths =
      (answer.record_paths as MappingEditorState["recordPaths"]) ?? undefined;
    // a re-read of the same source keeps the choices for fields that are still
    // there: changing the record path should not throw away an hour of work
    const present = new Set(meState.fields.map((f) => f.name));
    for (const name of Object.keys(meState.choices)) {
      if (!present.has(name)) delete meState.choices[name];
    }
    meState.verdict = null;
    meState.applied = null;
    if (!meState.name) {
      meState.name = (path.split(/[\\/]/).pop() ?? "mapping")
        .replace(/\.[^.]+$/, "");
    }
  }
  refreshMappingEditor();
}

/** The edges legal between the two ends of a relation — asked of the datamodel,
 *  cached by the pair, so switching an end asks once and not on every keystroke. */
async function ensureMappingEdges(relation: RelationDraft): Promise<void> {
  const sourceType = typeOfField(meState, relation.source_column);
  const targetType = typeOfField(meState, relation.target_column);
  if (!sourceType || !targetType) return;
  const key = edgeKey(sourceType, targetType);
  if (meState.edgeOptions[key]) return;
  const answer = await askMapping("/mapping-edges", {
    source_type: sourceType, target_type: targetType });
  if (!answer) return;
  meState.edgeOptions[key] =
    (answer.edges as MappingEditorState["edgeOptions"][string]) ?? [];
  const groups = answer.groups as
    NonNullable<MappingEditorState["edgeGroups"]>[string] | undefined;
  if (groups?.length) {
    meState.edgeGroups = { ...(meState.edgeGroups ?? {}), [key]: groups };
  }
  refreshMappingEditor();
}

/** The picker's own state, kept out of `meState` only where it must persist
 *  across closes: the folder you were in, and the folders you have visited. A
 *  picker that forgets both is a picker you fight. */
let mePickerPath: string | undefined;
let mePickerRecent: string[] = [];
let mePickerHistory: string[] = [];
let mePickerPlaces: MappingFsPlace[] = [];
let mePickerBookmarks: MappingFsPlace[] = [];
let mePickerScope = "roots";
let mePickerFilter = "";
let mePickerSort: "name" | "date" | "size" = "name";

function mePicker(patch: Partial<NonNullable<MappingEditorState["picker"]>>): void {
  meState.picker = {
    listing: meState.picker?.listing ?? null,
    loading: false,
    error: "",
    places: mePickerPlaces,
    bookmarks: mePickerBookmarks,
    scope: mePickerScope,
    recent: mePickerRecent,
    history: mePickerHistory,
    filter: mePickerFilter,
    sort: mePickerSort,
    typed: "",
    ...patch,
  };
}

/** Home, the user folders, the volumes, the served roots — and the SCOPE.
 *
 *  `/fs/places` is computed by the bridge from the machine, so the sidebar is
 *  never a list somebody configured. The scope (`whole-disk` / `roots`) is what
 *  lets the panel say why a place is greyed instead of letting a click 403. */
async function loadMappingPlaces(): Promise<void> {
  try {
    const res = await fetch(`${await bridgeUrl()}/fs/places`);
    if (!res.ok) return;
    const answer = (await res.json()) as {
      places?: MappingFsPlace[]; bookmarks?: MappingFsPlace[]; scope?: string };
    mePickerPlaces = answer.places ?? [];
    mePickerBookmarks = answer.bookmarks ?? [];
    mePickerScope = answer.scope ?? "roots";
  } catch {
    /* no bridge: the browse below will say so with the one honest sentence */
  }
}

/** Browse the filesystem THROUGH THE BRIDGE — the browser's picker.
 *
 *  `fsList` is the Storage window's own client (one implementation of "what is
 *  in this folder"), and what the bridge will serve is its business: named roots
 *  by default, the whole machine with `--fs-all`. */
async function browseMappingSource(path?: string): Promise<void> {
  const from = meState.picker?.listing?.path;
  mePicker({ loading: true });
  refreshMappingEditor();
  try {
    const listing = await fsList(path);
    if (from && from !== listing.path) {
      // one step of history, deduplicated: ← should go back, not oscillate
      mePickerHistory = [...mePickerHistory.filter((p) => p !== from), from]
        .slice(-20);
    }
    mePickerPath = listing.roots ? undefined : listing.path;
    if (mePickerPath) {
      mePickerRecent = [mePickerPath,
                        ...mePickerRecent.filter((p) => p !== mePickerPath)]
        .slice(0, 6);
    }
    mePicker({ listing: listing as unknown as MappingFsListing, loading: false,
               error: "", history: mePickerHistory, recent: mePickerRecent });
  } catch (error) {
    // "the bridge is not running" and "that folder is not a root" are different
    // problems with different fixes, and `storage.ts` already tells them apart
    mePicker({
      loading: false,
      error: error instanceof BridgeDownError
        ? BRIDGE_UNREACHABLE
        : (error instanceof Error ? error.message : String(error)),
    });
  }
  refreshMappingEditor();
}

/** A file chosen in the SYSTEM dialog → a path the bridge can read.
 *
 *  The browser's half of the deal: `<input type="file">` opens the OS picker, so
 *  the person reaches anything on the machine, and then the browser hands over
 *  bytes and withholds the location. So the bytes are staged by the bridge and
 *  what comes back is a real path — after which everything downstream (fields,
 *  validate, apply) is the path it always was.
 *
 *  It is a COPY, and the panel says so. That is not a caveat to hide: a mapping
 *  records a SHAPE (format, sheet, record path), not a location, so the artefact
 *  authored here applies to the original file later — from the desktop app, or
 *  from Browse… on a served folder.
 */
/** Hand a browser-picked file to the bridge and get back a real PATH.
 *
 *  Shared by the mapping editor and StratiMiner: the system dialog reaches
 *  anything on the machine and returns bytes, the bridge turns those into a path
 *  in a folder it serves. Returns null and toasts the reason when it cannot —
 *  the size refusal in particular names the cap and the two ways that copy
 *  nothing. */
async function stageThroughBridge(file: File): Promise<string | null> {
  try {
    const res = await fetch(`${await bridgeUrl()}/fs/stage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-EM-Filename": encodeURIComponent(file.name),
      },
      body: file,
    });
    const answer = (await res.json().catch(() => null)) as
      { ok?: boolean; path?: string; error?: string } | null;
    if (!res.ok || !answer?.ok || !answer.path) {
      toast(answer?.error ?? `bridge ${res.status}`);
      return null;
    }
    return answer.path;
  } catch {
    toast(BRIDGE_UNREACHABLE);
    return null;
  }
}

async function stageMappingFile(file: File): Promise<void> {
  meState.busy = "read";
  meState.note = t("me.staging", { name: file.name });
  refreshMappingEditor();
  const path = await stageThroughBridge(file);
  meState.busy = "";
  if (!path) {
    meState.note = t("me.stageFailed", { name: file.name });
    refreshMappingEditor();
    return;
  }
  meState.picker = null;
  meHandlers.setPath(path);
  // …named after the file the PERSON picked, not after the staged copy. The
  // staged name carries a content digest (`e235261b8008-scavo-2026`), and a
  // mapping called that is a mapping nobody will recognise next month.
  meState.name = file.name.replace(/\.[^.]+$/, "");
  meState.note = t("me.staged", { name: file.name });
  await readMappingSource();
}

/** Grant the bridge a folder — Blender's "add bookmark", and in roots-mode the
 *  only way to reach a place at all. The same `/fs/roots` channel the Storage
 *  window uses (DS4): one folder, named by a person, remembered on disk. */
async function addMappingRoot(path: string): Promise<void> {
  try {
    const res = await fetch(`${await bridgeUrl()}/fs/roots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", path }),
    });
    const answer = (await res.json().catch(() => null)) as
      { ok?: boolean; error?: string } | null;
    if (!res.ok || !answer?.ok) {
      mePicker({ error: answer?.error ?? `HTTP ${res.status}` });
      refreshMappingEditor();
      return;
    }
    toast(t("me.pickerGranted", { name: path.split("/").filter(Boolean).pop()
                                        ?? path }));
    await loadMappingPlaces();
    await browseMappingSource(path);
  } catch (error) {
    mePicker({ error: error instanceof Error ? error.message : String(error) });
    refreshMappingEditor();
  }
}

const meHandlers: MappingEditorHandlers = {
  pickSource: () => void (async () => {
    // THE OS DIALOG when we have one. It is the better instrument and it returns
    // the same thing the bridge needs: a real absolute path.
    if (isTauri()) {
      // the native dialog reaches everything AND returns the location, so on the
      // desktop there is nothing to stage
      const extensions = Object.keys(meState.extensions ?? {});
      const picked = await pickSourceFile(extensions);
      if (picked) {
        meHandlers.setPath(picked);
        void readMappingSource();
      }
      return;
    }
    // …and in a browser, the bridge's filesystem browse — because
    // `<input type=file>` withholds the path, and the path is the whole point.
    await ensureMappingCatalog();
    await loadMappingPlaces();
    await browseMappingSource(mePickerPath);
  })(),
  openSystemFile: (file) => void stageMappingFile(file),
  browse: (path) => void browseMappingSource(path),
  addRoot: (path) => void addMappingRoot(path),
  setPickerFilter: (text) => {
    mePickerFilter = text;
    mePicker({ filter: text });
    refreshMappingEditor();
  },
  setPickerSort: (sort) => {
    mePickerSort = sort;
    mePicker({ sort });
    refreshMappingEditor();
  },
  chooseFile: (path) => {
    if (!path) return;
    meState.picker = null;
    meHandlers.setPath(path);
    void readMappingSource();
  },
  closePicker: () => {
    meState.picker = null;
    refreshMappingEditor();
  },
  setPath: (path) => {
    meState.path = path;
    // a new source is a new mapping: keeping the old choices would silently map
    // columns that are not in this file
    meState.fields = [];
    meState.choices = {};
    meState.relations = [];
    meState.table = undefined;
    meState.recordPath = undefined;
    refreshMappingEditor();
  },
  setTable: (table) => {
    meState.table = table;
    void readMappingSource();
  },
  setRecordPath: (path) => {
    meState.recordPath = path;
    void readMappingSource();
  },
  setName: (name) => {
    meState.name = name;
    refreshMappingEditor();
  },
  setChoice: (field, choice: FieldChoice) => {
    if (!choice.role && !choice.cidoc) delete meState.choices[field];
    else meState.choices[field] = choice;
    meState.verdict = null;
    refreshMappingEditor();
    for (const relation of meState.relations) void ensureMappingEdges(relation);
  },
  addRelation: () => {
    meState.relations.push({ source_column: "", target_column: "",
                             edge_type: "" });
    refreshMappingEditor();
  },
  setRelation: (index, relation) => {
    meState.relations[index] = relation;
    meState.verdict = null;
    refreshMappingEditor();
    void ensureMappingEdges(relation);
  },
  removeRelation: (index) => {
    meState.relations.splice(index, 1);
    refreshMappingEditor();
  },
  validate: () => void (async () => {
    meState.busy = "validate";
    refreshMappingEditor();
    const answer = await askMapping("/mapping-validate",
                                    { mapping: buildMapping(meState) });
    meState.busy = "";
    if (answer) {
      meState.verdict = answer.verdict as MappingEditorState["verdict"];
      meState.note = "";
    }
    refreshMappingEditor();
  })(),
  apply: (mode) => void (async () => {
    meState.busy = "apply";
    meState.applied = null;
    refreshMappingEditor();
    const answer = await askMapping("/mapping-apply", {
      mapping: buildMapping(meState), path: meState.path, mode });
    meState.busy = "";
    if (answer) {
      const report = (answer.report ?? {}) as Record<string, unknown>;
      meState.applied = report;
      meState.verdict = {
        ok: Boolean(report.ok),
        errors: (report.errors as string[]) ?? [],
        warnings: (report.warnings as string[]) ?? [],
      };
      const doc = answer.graph as EmDocument | undefined;
      if (report.ok && doc) {
        // the mapping's result arrives as a DOCUMENT and is adopted as a graph of
        // the project — additive, so a mapping applied twice does not replace the
        // study somebody is working on. In `volatile` mode its nodes carry
        // `aux_volatile`, so they show and stay out of the saved file until baked.
        loadDocument(doc, `${meState.name || "mapping"} (${mode})`, null);
        refreshEMTree();
        draw();
        toast(t("me.applied", { mode: String(mode),
                                rows: String(report.rows ?? 0),
                                nodes: String(report.nodes_added ?? 0),
                                edges: String(report.edges_added ?? 0) }));
      }
    }
    refreshMappingEditor();
  })(),
  exportJson: () => {
    const mapping = buildMapping(meState);
    const blob = new Blob([JSON.stringify(mapping, null, 1)],
                          { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${meState.name || "mapping"}_mapping.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast(t("me.exported", { name: link.download }));
  },
  saveToRegistry: () => void (async () => {
    meState.busy = "save";
    refreshMappingEditor();
    const answer = await askMapping("/mapping-save", {
      mapping: buildMapping(meState), name: meState.name });
    meState.busy = "";
    if (answer) {
      meState.note = t("me.saved", { path: String(answer.path ?? "") });
    }
    refreshMappingEditor();
  })(),
};

function openMappingEditor(): void {
  openFloatingTool("mapping-editor", t("me.tool"));
  void ensureMappingCatalog().then(refreshMappingEditor);
}

// ── WIN7 · the floating one-shot tool ───────────────────────────────────────
//
// StratiMiner was a tab of the Inspector, and it never belonged there: every
// other tab DESCRIBES the graph you have open, and StratiMiner exists to MAKE
// one. It is a tool, not a view — you reach for it, it does its job, and it goes
// away. So it lives under Tools ▸ and opens as a panel floating over whatever
// arrangement you had, which is exactly the relationship: it does not want an
// area, because it is not going to stay.
//
// The panel itself is the SAME element, moved in from `#side` and moved back on
// close — the re-parenting the window surfaces use (WIN6), for the same reason:
// one StratiMiner, wherever it happens to be showing.

const toolFloat = document.getElementById("tool-float")!;
const toolFloatTitle = document.getElementById("tool-float-title")!;

/** The panel element the float is currently showing, if any. */
let floatingToolId: string | null = null;

/** The tools that need more than the default width. Data, not an `if` per tool:
 *  a panel's width is a fact about its content (the mapping editor's table has a
 *  column of example values, and eliding that one defeats the tool). */
const WIDE_TOOLS = new Set(["mapping-editor"]);

// ONE SURFACE · the two tools LIVE in the float, and nothing is moved.
//
// They used to be parked in `#side` and re-parented into `#tool-float-body` on
// open, which is the same re-homing the panels did — for the same reason, that
// each was one element. `#side` is gone, so they simply sit inside the float,
// hidden, and opening one shows it. Both renderers take their host and rebuild
// from state (`renderStratiMiner(host, …)`, `renderMappingEditor(host, …)`), so
// there was never anything in them that needed to travel.
function openFloatingTool(panelId: string, title: string): void {
  if (floatingToolId && floatingToolId !== panelId) closeFloatingTool();
  const el = document.getElementById(panelId);
  if (!el) return;
  toolFloat.classList.toggle("wide", WIDE_TOOLS.has(panelId));
  el.classList.remove("hidden");
  toolFloatTitle.textContent = title;
  toolFloat.classList.remove("hidden");
  floatingToolId = panelId;
  refreshFloatingTool(panelId);
}

function closeFloatingTool(): void {
  if (!floatingToolId) return;
  document.getElementById(floatingToolId)?.classList.add("hidden");
  toolFloat.classList.add("hidden");
  floatingToolId = null;
}

/** True while StratiMiner is the tool on screen — the only condition under which
 *  its state changes are worth re-rendering. */
function stratiMinerOpen(): boolean {
  return floatingToolId === "stratiminer";
}

document
  .getElementById("tool-float-close")
  ?.addEventListener("click", closeFloatingTool);

// Drag it by its bar. A floating tool that cannot be moved is a tool that covers
// the thing you opened it to work on.
document.getElementById("tool-float-bar")?.addEventListener("mousedown", (e) => {
  if ((e.target as HTMLElement).id === "tool-float-close") return;
  e.preventDefault();
  const r = toolFloat.getBoundingClientRect();
  const dx = e.clientX - r.left;
  const dy = e.clientY - r.top;
  const move = (ev: MouseEvent): void => {
    toolFloat.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - dx))}px`;
    toolFloat.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy))}px`;
    toolFloat.style.right = "auto";
    toolFloat.style.transform = "none";
  };
  const up = (): void => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
});

/** Open StratiMiner, document or no document.
 *
 * It exists to MAKE the graph, so gating it behind having one would put the tool
 * behind the problem it solves. Reached from Tools ▸ and from the empty-state
 * hint — the two moments you would want it. */
function openStratiMiner(): void {
  openFloatingTool("stratiminer", t("tab.stratiminer"));
}
document
  .getElementById("btn-tool-stratiminer")
  ?.addEventListener("click", openStratiMiner);
document
  .getElementById("btn-tool-mapping")
  ?.addEventListener("click", openMappingEditor);
document
  .getElementById("drop-hint-stratiminer")
  ?.addEventListener("click", (e) => {
    // The hint sits over the canvas; without this the click also reaches the
    // canvas handler underneath and starts a selection marquee.
    e.stopPropagation();
    openStratiMiner();
  });
document.getElementById("drop-hint-emtree")?.addEventListener("click", (e) => {
  e.stopPropagation();
  openEMTree();
});

// POL1 · the one epoch gesture. Adds at the TOP of the stack (newest), which is
// where an undated epoch belongs until the chronology sorts it in — the same
// `addEpochEmMode` the between-lanes "+" uses, so there is one code path and one
// behaviour rather than a palette special case beside it.
btnAddEpoch.addEventListener("click", (e) => {
  e.stopPropagation(); // the button sits over the canvas
  if (!store) return;
  addEpochEmMode();
});

// PALETTE-FIX · the old app-level column handles are gone, both of them.
//
// The right one went with the aside (WIN-FIX1). The left one collapsed a column
// of `<main>` that no longer exists: the palette is a sidebar of the ACTIVE AREA
// now, and the thing that opens and closes it is the chevron on that area's own
// edge (plus Tools ▸ Palette nodi). Two handles for one panel, one of them
// outside the window the panel belongs to, was the shape of the confusion.

/** Kept as a no-op call site: `updateToolbar` still asks the chrome to repaint,
 *  and this is where anything about the area's own panels would go. */
function paintColumnToggles(): void {}



function smSet(patch: Partial<typeof smState>): void {
  smState = { ...smState, ...patch };
  // WIN7 · the panel is in the floating tool now, not in an aside tab
  if (stratiMinerOpen()) refreshStratiMiner();
}

/** Read a bridge error body the way the narrative path does: the endpoint's own
 *  message when there is one, the status when there is not. A 501 here means
 *  "this build cannot", a 502 "the model failed" — different fixes, so the text
 *  matters more than the code. */
async function smBridgeError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.error) return String(j.error);
  } catch {
    /* non-JSON error body */
  }
  return `bridge error ${res.status}`;
}

const smHandlers: StratiMinerHandlers = {
  // Switching branch does NOT clear the fields: someone who tried the AI path and
  // fell back to writing the table by hand still has the folder they typed, and
  // the xlsx path is the shared destination of both branches anyway.
  onSourceChange: (v) => smSet({ source: v }),
  onFolderChange: (v) => smSet({ folder: v }),
  onXlsxChange: (v) => smSet({ xlsxPath: v }),
  onLanguageChange: (v) => smSet({ language: v }),

  onExtract: async () => {
    smSet({ busy: "extract", report: "", warnings: [] });
    toast("StratiMiner: estrazione in corso…");
    try {
      const res = await fetch(`${await bridgeUrl()}/stratiminer-extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: smState.folder.trim(),
          language: smState.language.trim(),
          provider: getSettings().ai.provider,
          // No `model`: the bridge picks the per-task default, which for
          // extraction is a frontier model rather than the prose default.
          // Settings' model is the narrative one; sending it here would quietly
          // downgrade the harder task.
        }),
      });
      if (!res.ok) {
        const msg = await smBridgeError(res);
        smSet({ busy: "", report: `Estrazione non riuscita: ${msg}` });
        logError(`StratiMiner extract: ${msg}`);
        return;
      }
      const r = (await res.json()) as ExtractResult;
      smSet({
        busy: "",
        // Prefill step 3 — the two paths converge on this field, and having
        // just written the file we know where it is.
        xlsxPath: r.xlsx_path,
        report: describeExtraction(r),
        // Both lists, in one place: a column the writer refused and a source
        // nobody read are equally things to look at before trusting the table.
        warnings: [...r.warnings, ...unreadWarnings(r)],
      });
      toast("em_data.xlsx scritta — aprila e controllala prima di convertirla");
    } catch {
      smSet({ busy: "", report: BRIDGE_UNREACHABLE });
      logError(`StratiMiner extract: ${BRIDGE_UNREACHABLE}`);
    }
  },

  onCopyPrompt: async () => {
    smSet({ busy: "prompt", report: "", warnings: [], promptFallback: "" });
    let prompt = "";
    try {
      const res = await fetch(`${await bridgeUrl()}/stratiminer-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: smState.folder.trim(),
          language: smState.language.trim(),
        }),
      });
      if (!res.ok) {
        const msg = await smBridgeError(res);
        smSet({ busy: "", report: `Prompt non disponibile: ${msg}` });
        return;
      }
      prompt = ((await res.json()) as PromptResult).prompt;
    } catch {
      smSet({ busy: "", report: BRIDGE_UNREACHABLE });
      return;
    }
    // Two failures worth telling apart: the bridge could not build the prompt
    // (above — nothing to show), or the prompt exists and only the clipboard
    // refused. In the second case the text is the deliverable, so hand it over
    // in a field rather than apologising for losing it.
    const runIt =
      t("sm.runItHint");
    try {
      await navigator.clipboard.writeText(prompt);
      smSet({
        busy: "",
        report: `Prompt copiato (${prompt.length} caratteri). ${runIt}`,
      });
      toast("Prompt StratiMiner copiato");
    } catch {
      smSet({
        busy: "",
        report:
          `Il browser ha negato l'accesso agli appunti — il prompt è qui ` +
          `sotto (${prompt.length} caratteri). ${runIt}`,
        promptFallback: prompt,
      });
    }
  },

  onTransform: async () => {
    smSet({ busy: "import", report: "", warnings: [] });
    try {
      const res = await fetch(`${await bridgeUrl()}/import-em-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: smState.xlsxPath.trim() }),
      });
      if (!res.ok) {
        const msg = await smBridgeError(res);
        smSet({ busy: "", report: `Conversione non riuscita: ${msg}` });
        logError(`StratiMiner import: ${msg}`);
        return;
      }
      const r = (await res.json()) as ImportResult;
      // The xlsx path is the source name, not a file EMStudio can save back
      // into: passing it as `path` would point Save at the workbook.
      loadDocument(r.doc, smState.xlsxPath.trim().split("/").pop() ?? "em_data");
      smSet({ busy: "", report: describeImport(r), warnings: r.warnings });
      // WIN7 · ONE-SHOT: the tool has done the thing it was opened for, and the
      // graph it just made is behind it. Anything it still had to say (the
      // import report, the warnings) is in the Log, which is a panel that stays.
      closeFloatingTool();
      toast(t("sm.graphCreated"));
    } catch {
      smSet({ busy: "", report: BRIDGE_UNREACHABLE });
      logError(`StratiMiner import: ${BRIDGE_UNREACHABLE}`);
    }
  },

  // Third way out for Path B, after the clipboard and the textarea. 33k characters
  // is not something to select by hand, and a file is what a Cowork session wants
  // anyway. A download and not the native save dialog on purpose: it works in both
  // deliveries, and this path only exists because something else already failed.
  onSavePrompt: () => {
    if (!smState.promptFallback) return;
    const blob = new Blob([smState.promptFallback], {
      type: "text/markdown;charset=utf-8",
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "StratiMiner_prompt.md";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    toast("Prompt salvato come StratiMiner_prompt.md");
  },

  onPickFolder: async () => {
    const picked = await pickFolder();
    if (picked) smSet({ folder: picked });
  },

  onPickXlsx: async () => {
    const picked = await pickXlsx();
    if (picked) smSet({ xlsxPath: picked });
  },

  /** The browser's half: the system dialog gives BYTES, the bridge stages them,
   *  and StratiMiner gets a real path instead of a bare filename. The same route
   *  the mapping editor uses — one staging, two tools. */
  onStageXlsx: async (file: File) => {
    smSet({ busy: "stage" });
    const path = await stageThroughBridge(file);
    smSet({ busy: "" });
    if (path) smSet({ xlsxPath: path });
  },
};

/** Click a warning → select the element it names and bring it into view.
 *
 * The same two steps the inspector's cross-references use (`onJump`), so a
 * warning behaves like every other link in the app. A node can legitimately be
 * absent from the current scene — folded into a group, filtered out by the
 * circles of detail, or simply on the other view — and silently doing nothing
 * would read as a broken button, so say what happened instead. */
function revealFromWarning(nodeId: string): void {
  if (!store) return;
  if (!store.node(nodeId)) {
    toast("that node is no longer in the document");
    return;
  }
  select(nodeId);
  if (scene()?.byId.has(nodeId)) centerOn(nodeId);
  else toast("selected — not visible in this view (folded, or filtered out)");
}

/** Redraw the Log tab — only when it is the visible one; there is no point
 *  rebuilding a hidden DOM on every sync message. */
function refreshLogPanel(): void {
  // same as the EMtree: the log lives in an Inspector WINDOW — as many as there
  // are, each drawing whichever of its two tabs is up
  refreshSurfaces("inspector");
}
/** How many log lines are something somebody should be told about.
 *
 *  Warnings and errors only — see the note on the tab's badge. */
function logAttention(): number {
  return logEntries().filter((e) => e.level !== "info").length;
}

/** …and the last number the header was drawn with, so a repaint happens when it
 *  CHANGES rather than on every line. A header that re-rendered on each info
 *  line would flicker through a sync burst, and the badge is not worth that. */
let lastLogAttention = 0;

/** PELLE · the status-bar pill: the same count the Log tab's badge carries. */
function renderWarningsPill(): void {
  const el = document.getElementById("footer-warnings");
  if (!el) return;
  const owed = logAttention();
  el.textContent = owed === 1 ? t("footer.warning1") : t("footer.warnings", { n: String(owed) });
  el.title = t("footer.warningsTip");
  el.classList.toggle("ok", owed === 0);
}
onLocaleChange(renderWarningsPill);

onLogChange(() => {
  refreshLogPanel();
  const owed = logAttention();
  if (owed === lastLogAttention) return;
  renderWarningsPill();
  lastLogAttention = owed;
  renderAreaHeaders();
});
// ── Narrative view (N2) ───────────────────────────────────────────────────
// Rendered as an overlay over the canvas (Matrix and Graph are built on scenes,
// layout and circles-of-detail; a story is none of those), but it is a
// first-class central MODE now (DP-82): its on/off IS `centralMode === "narrative"`,
// driven by `setMode` — there is no separate `narrativeOpen` flag to drift.
let selectedNarrativeId: string | null = null;
/** Who is signing endorsements in this session. NOT persisted in the document:
 *  it is a fact about the person at the keyboard, not about the graph. What
 *  gets written is the signature itself (`block.validated_by`). */
let signingAs: string | null = null;

/**
 * Who signs, when nobody has said.
 *
 * With exactly ONE human author in the graph there is no choice to make, and
 * asking for one is a riddle rather than a safeguard — the user is deep inside
 * a chapter, the picker is in the byline far above, and the refusal tells them
 * where it is instead of taking them there. With two or more the question is
 * real and stays unanswered.
 *
 * This does not make anyone sign by accident: the ACT is still pressing
 * "Valida". This only fills in the name when the graph admits a single one.
 */
function defaultSigner(): string | null {
  if (!store) return null;
  const humans = nauth.humanAuthorsIn(store.doc);
  return humans.length === 1 ? humans[0].id : null;
}

function currentSigner(): string | null {
  if (signingAs) return signingAs;
  signingAs = defaultSigner();
  return signingAs;
}

/**
 * Bring the "firmo come" picker to the user instead of describing where it is.
 *
 * Called when an endorsement is attempted with no signer chosen — which only
 * happens when the graph has several human authors, i.e. exactly when the
 * choice matters.
 */
function revealSignerPicker(): void {
  const sel = activeNarrativeHost()
    ?.querySelector<HTMLSelectElement>(".nv-signing select") ?? null;
  if (!sel) {
    toast(t("toast.noHumanAuthor"));
    return;
  }
  sel.scrollIntoView({ behavior: "smooth", block: "center" });
  sel.focus();
  sel.classList.add("nv-wants-attention");
  window.setTimeout(() => sel.classList.remove("nv-wants-attention"), 2400);
  toast(t("toast.pickSigner"));
}
/** Chapters with a generation request in flight, so the button can say so and
 *  a double click cannot send two. */
const generating = new Set<number>();

/**
 * Show, in the chapter, that a draft is being written.
 *
 * Written straight into the DOM rather than through the view's props: the mark
 * is a fact about THIS SECOND (a request in flight), not about the document, and
 * the next repaint is exactly when it should disappear. One class and one line,
 * so there is nothing to clean up if a render happens meanwhile.
 */
function markChapterGenerating(chapterIndex: number, title: string): void {
  const section = activeNarrativeHost()
    ?.querySelectorAll<HTMLElement>(".nv-chapter")[chapterIndex];
  if (!section) return;
  section.classList.add("nv-generating");
  const line = document.createElement("div");
  line.className = "nv-generating-line";
  line.innerHTML = '<span class="nv-spinner"></span>';
  line.appendChild(document.createTextNode(
    " " + t("ai.generatingLine", { title })));
  section.appendChild(line);
}

/**
 * Ask the bridge for a draft of one chapter, and file the answer.
 *
 * The key is NEVER here. It lives in em-bridge's environment (N5); this side
 * only knows an endpoint. That is not a detail of the implementation, it is the
 * reason the frontend can be served from anywhere without becoming a place
 * where a credential could leak.
 */
async function generateChapterDraft(narrativeId: string,
                                    chapterIndex: number): Promise<void> {
  if (!store || generating.has(chapterIndex)) return;
  const narrative = narrativesIn(store.doc).find((n) => n.id === narrativeId);
  const chapter = narrative?.chapters[chapterIndex];
  // NARR-AI: the anchor may be an activity OR an epoch (a site-story chapter is
  // epoch-anchored); the bridge/context builder accepts either. Only a chapter
  // with NO anchor at all (e.g. the free intro) cannot be generated.
  const activityId = chapter?.anchor;
  if (!activityId) {
    toast(t("toast.chapterUnanchored"));
    return;
  }
  const ai = getSettings().ai;
  generating.add(chapterIndex);
  let reached = false;   // did we get an answer at all, or never leave the room?
  refreshNarrativeView();
  refreshAiKeyStateIfOpen();   // Settings may be open: lock the key controls
  toast(t("ai.generatingToast",
          { title: chapter?.title ?? activityId }));
  // …AND IN THE CHAPTER ITSELF. A model takes seconds; a toast that has faded
  // leaves somebody staring at an unchanged paragraph wondering whether they
  // actually clicked. The mark sits where the prose will appear, and it is
  // removed by the repaint in `finally` whatever the outcome was.
  markChapterGenerating(chapterIndex, chapter?.title ?? activityId);
  try {
    const res = await fetch(`${await bridgeUrl()}/generate-narrative-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc: store.doc,
        activity_id: activityId,
        narrative_id: narrativeId,
        provider: ai.provider,
        model: ai.model,
        // when it was written, recorded with the block: a provenance note
        // without a date answers "who" but not "when this was still current"
        date: new Date().toISOString().slice(0, 10),
      }),
    });
    reached = true;
    if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON error body */
      }
      // 501 = the seam is not configured (no ANTHROPIC_API_KEY, or a build
      // without the LLM adapter). Different problem from a model that failed,
      // and the user can only fix the first one — so say which it is.
      // 501 is fixable BY THE USER, and only if they are told where: the key
      // lives in em-bridge's memory and is put there from the AI panel (⌁ /
      // Impostazioni ▸ Avanzate). A message that only says "not configured"
      // leaves somebody hunting for a setting they have never seen.
      toast(res.status === 501
        ? t("toast.genUnconfigured", { why: msg })
        : t("toast.genFailed", { why: msg }));
      return;
    }
    const result = (await res.json()) as DraftResult;
    nauth.applyGeneratedDraft(store, result, activityId);
    toast(t("ai.draftInserted",
                { by: result.model || result.provider,
                  n: String(result.pending_validation) }));
  } catch (e) {
    // A fetch that never reached the bridge says "Failed to fetch", which tells
    // the user nothing they can act on. The actionable fact is that the bridge
    // is not running — so say that, and keep the real message for failures that
    // happened AFTER we had an answer.
    toast(!reached
      ? "em-bridge non raggiungibile: la generazione passa da lì (è anche " +
        "dove sta la key, mai nel frontend). Avvialo con ./dev.sh, oppure " +
        "punta EM_TRANSFORMER_URL a un server."
      : t("toast.genFailed",
            { why: e instanceof Error ? e.message : String(e) }));
  } finally {
    generating.delete(chapterIndex);
    refreshNarrativeView();
    refreshAiKeyStateIfOpen();
  }
}

/** The authoring hooks (N3). Every one of them funnels through
 *  `DocumentStore.updateNode`, so a narrative edit is undoable, marks the
 *  document dirty, reaches a synced peer and is written by the ordinary save —
 *  exactly like editing any other node. */
function narrativeEditor(narrativeId: string): NarrativeEditor {
  const s = store!;
  return {
    narrativeId,
    addChapter: () => nedit.addChapter(s, narrativeId),
    // NARR1 · reintroduce-epoch affordance + the bridge regenerate seam.
    undescribedEpochs: () => undescribedEpochs(s, narrativeId),
    addEpochChapter: (epochId) => addEpochChapter(s, narrativeId, epochId),
    // Seam only: the rich s3Dgraphy site_story regeneration needs a bridge
    // endpoint (build_narrative) that is not exposed yet — declared as a
    // follow-up, button stays disabled until it exists.
    canRegenerate: () => false,
    regenerateViaBridge: () =>
      toast(t("ai.regenerateUnavailable")),
    renameChapter: (i, t) => nedit.renameChapter(s, narrativeId, i, t),
    moveChapter: (i, d) => nedit.moveChapter(s, narrativeId, i, d),
    deleteChapter: (i) => nedit.deleteChapter(s, narrativeId, i),
    toggleCanonical: (i) => nedit.toggleCanonical(s, narrativeId, i),
    setAnchor: (i, a) => nedit.setChapterAnchor(s, narrativeId, i, a),
    addProse: (c) => nedit.addProse(s, narrativeId, c),
    setProse: (c, b, t) => nedit.setProse(s, narrativeId, c, b, t),
    addEmbed: (c, ref, at) =>
      nedit.addEmbed(s, narrativeId, c, ref,
                     nedit.defaultViewType(s.node(ref)), at),
    setViewType: (c, b, vt) => nedit.setEmbedViewType(s, narrativeId, c, b, vt),
    moveBlock: (c, b, d) => nedit.moveBlock(s, narrativeId, c, b, d),
    deleteBlock: (c, b) => nedit.deleteBlock(s, narrativeId, c, b),
    // A chapter is anchored to a LANE: an epoch or an activity. Offering every
    // node would make the control useless — most of them are not lanes.
    lanes: () =>
      (s.doc.graph.nodes ?? [])
        .filter((n) => n.node_type === "EpochNode"
                    || n.node_type === "ActivityNodeGroup")
        .map((n) => ({ id: n.id, label: String(n.name || n.id) })),

    // — N6 —
    authors: () => nauth.authorsIn(s.doc),
    humanAuthors: () => nauth.humanAuthorsIn(s.doc),
    addAuthor: (id) => nauth.addNarrativeAuthor(s, narrativeId, id),
    removeAuthor: (id) => nauth.removeNarrativeAuthor(s, narrativeId, id),
    setChapterAuthor: (i, id) =>
      nauth.setChapterAuthor(s, narrativeId, i, id),
    signer: (): AuthorRef | null =>
      nauth.humanAuthorsIn(s.doc).find((a) => a.id === currentSigner()) ?? null,
    setSigner: (id) => {
      signingAs = id;
      refreshNarrativeView();
    },
    endorse: (c, b) => {
      const who = currentSigner();
      if (!who) {
        revealSignerPicker();
        return;
      }
      try {
        nauth.endorseBlock(s, narrativeId, c, b, who);
      } catch (e) {
        // Every refusal here is something the user has to understand — an
        // unknown author, or a model asked to vouch for a model.
        toast(e instanceof Error ? e.message : String(e));
      }
    },
    endorseChapter: (c) => {
      const who = currentSigner();
      if (!who) {
        revealSignerPicker();
        return;
      }
      try {
        const n = nauth.endorseChapter(s, narrativeId, c, who);
        toast(`${n} paragraf${n === 1 ? "o avallato" : "i avallati"}`);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
      }
    },
    pendingIn: (c) => nauth.pendingInChapter(
      (((s.node(narrativeId)?.data ?? {}) as Record<string, unknown>)
        .chapters as nedit.EditableChapter[] | undefined)?.[c]).length,
    retract: (c, b) => nauth.retractEndorsement(s, narrativeId, c, b),
    canGenerate: (i) => {
      const anchor = narrativesIn(s.doc)
        .find((n) => n.id === narrativeId)?.chapters[i]?.anchor;
      return !!anchor
        && s.node(anchor)?.node_type === "ActivityNodeGroup";
    },
    generate: (i) => void generateChapterDraft(narrativeId, i),
    generating: (i) => generating.has(i),
  };
}

/** Paint every live Narrative window. There is no "the narrative" any more —
 *  no overlay, no `centralMode` — so there is nothing to ask about the focus. */
function refreshNarrativeView(): void {
  refreshSurfaces("narrative");
}

/** Is this window WRITING? Per window, like every other mode: two Narrative
 *  windows can be one reading and one being written, which is the arrangement
 *  somebody actually wants (the story on the left, the chapter under the hand
 *  on the right). It used to be a module flag, because there was one story on
 *  screen by construction. */
function narrativeEditingOf(win: Win): boolean {
  return winCurrent(win, "editing") === true;
}

/**
 * Draw ONE window's story into ONE host — reading, and writing when its ✎ is on.
 *
 * `renderNarrativeView(host, …)` has taken its host since it was written, and
 * called without an editor it is the reading; that half stopped being a problem
 * on 12 September. What this adds is the other half: the EDITOR is built for
 * THIS window, so the chapter being written is the one `winCurrent(win,
 * "narrative")` says — not the one the single overlay happened to be showing.
 */
function renderNarrativeInto(host: HTMLElement, win: Win): void {
  // NARR1 · a Narrative window with no story yet scaffolds one from the graph —
  // a chapter per epoch, ordered, anchored, with a canonical intro. This used to
  // hang off `setMode("narrative")`, i.e. off ENTERING THE MODE; with the
  // narrative a window type the same sentence attaches to the window: a
  // narrative window that opens on a graph with no story writes the outline.
  // Idempotent (`scaffoldNarrativeFromGraph` is a no-op once a narrative
  // exists), so a written story is never disturbed.
  if (store) {
    const nid = scaffoldNarrativeFromGraph(store);
    if (nid) selectedNarrativeId = nid;
  }
  const narratives = narrativesIn(store?.doc ?? null);
  const chosen = (winCurrent(win, "narrative") as string | null)
    ?? selectedNarrativeId ?? narratives[0]?.id ?? null;
  const current = narratives.find((n) => n.id === chosen) ?? narratives[0];
  renderNarrativeView(
    host,
    store?.doc ?? null,
    chosen,
    (id) => {
      setWinCurrent(win, "narrative", id);
      selectedNarrativeId = id;
      refreshNarrativeView();
    },
    // an embed that resolves is a way into the graph: same gesture as the Log
    // tab, so "go and look at it" means one thing everywhere in the app
    revealFromNarrative,
    narrativeEditingOf(win) && current && store
      ? narrativeEditor(current.id)
      : undefined,
    // CURRENT-ELEMENT · the window owns which chapter is being worked on; the
    // view marks it and reports the click. Passed ALWAYS (not only in edit
    // mode): picking the chapter you are reading is navigation.
    {
      index: () => currentChapterIndex(win),
      set: (i) => setCurrentChapterIndex(win, i),
    },
  );
  // …and the window has something current to act on (see `ensureCurrentChapter`).
  // After the render, so the chapters it counts are the ones just drawn.
  ensureCurrentChapter(win);
  renderResourcePanels(); // the story changed: its blocks panel repaints
}

/**
 * NARRWS1 · the narrative mode's OWN resources panel — narrative building blocks,
 * NOT the graph node-types (which are useless while reading/writing a story).
 * Per-mode, coherent with MODE1/DP-82. "＋ Capitolo" and "🗺 Mappa del sito" are
 * direct, unambiguous actions (reuse the narrative-edit mutators); the embed
 * view-types are listed from the datamodel (`narrativeViewTypes`) as a guide —
 * inserting one with a specific node reference is done from the chapter's own +
 * button, which knows the target chapter and ref. Site map ties to GEO1: the
 * embed points at the graph-self node, whose map reads the site position.
 */
function renderNarrativePalette(host: HTMLElement): void {
  host.textContent = "";
  // STEP A · NO `centralMode` guard. This panel belongs to a NARRATIVE WINDOW,
  // and `centralMode` describes whichever window has the focus — so the guard
  // emptied the panel the moment the pointer moved to another area, which is
  // the anchoring bug wearing a different hat. The window's type is the only
  // condition that matters, and the provider registry has already checked it.
  const narr =
    narrativesIn(store?.doc ?? null).find((n) => n.id === selectedNarrativeId) ??
    narrativesIn(store?.doc ?? null)[0];

  const section = (title: string): HTMLElement => {
    const h = document.createElement("div");
    h.className = "np-sect";
    h.textContent = title;
    host.appendChild(h);
    return h;
  };
  const item = (
    label: string,
    hint: string,
    onClick: (() => void) | null,
  ): void => {
    const b = document.createElement("button");
    b.className = "np-item" + (onClick ? "" : " np-item-static");
    b.title = hint;
    b.innerHTML = `<span class="np-label">${label}</span><span class="np-hint">${hint}</span>`;
    if (onClick) b.addEventListener("click", onClick);
    else b.disabled = true;
    host.appendChild(b);
  };

  section(t("palette.narrative"));
  if (!narr || !store) {
    item(t("palette.noNarrative"), t("palette.noNarrativeHint"), null);
    return;
  }
  const nid = narr.id;
  // structure
  item(t("palette.addChapter"), t("palette.addChapterHint"), () => {
    nedit.addChapter(store!, nid);
    refreshNarrativeView();
  });
  // MENU-AUDIT · "🗺 Mappa del sito" was here too, and it inserted into the LAST
  // chapter while the header's Inserisci ▸ Mappa del sito inserts into the
  // CURRENT one. Not two ways to the same place: the same action with two
  // different targets, which is worse than a duplicate. The header item stays
  // (it acts on the current element, like everything else in that menu, and says
  // so when there isn't one).

  // embeds — the datamodel's narrative view-types, as a guide (insert with a
  // reference from the chapter's + button, which knows chapter and node).
  // D1-full (P5) · the view types were listed as a GUIDE and were dead buttons.
  // Now they are draggable: drop one on an embed and that embed changes how it
  // is shown. They still cannot be clicked to insert, and that is deliberate —
  // an embed without a reference points at nothing, so a view type alone is not
  // a block anybody wants. Inserting WITH a reference is the other gesture:
  // drag a node from the node list onto a chapter (D2).
  section(t("palette.views"));
  for (const vt of narrativeViewTypes()) {
    const hint = narrativeViewTypeDescription(vt) || vt;
    const b = document.createElement("button");
    b.className = "np-item np-item-drag";
    b.title = `${hint}\n\n${t("palette.dragViewHint")}`;
    b.draggable = true;
    b.innerHTML = `<span class="np-label">${vt}</span><span class="np-hint">${hint}</span>`;
    b.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData(VIEW_TYPE_MIME, vt);
      e.dataTransfer?.setData("text/plain", vt);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
    });
    host.appendChild(b);
  }
  const guide = document.createElement("div");
  guide.className = "np-sect np-sect-note";
  guide.textContent =
    t("palette.dragNodeHint");
  host.appendChild(guide);
}

// NARR-BUTTONS · `setNarrativeOpen()` is GONE. It was the WIN1 back-compat
// wrapper around the old central-mode flag, and its last caller was the reveal
// below — the one place where flipping a global instead of telling the window
// produced a window that lied about its own type. Entering and leaving the
// narrative is now what it says it is: the window's type (`transformWindow`) or
// the workspace chip.

/**
 * NARR-BUTTONS · "go and look at it", from inside a story.
 *
 * Every reveal in the narrative — an embed that resolves, "vai al nodo ↗", the
 * `prompt` behind a generated paragraph — promises the same thing: leave the
 * prose, show me that node on the canvas. It used to do it with
 * `setNarrativeOpen(false)`, which flips the OLD central-mode flag and says
 * nothing to the window. The result was a window whose type still read
 * **Narrativa** while its surface was a canvas, with the Mode selector hidden
 * (windows of type narrative have none) — so the projection could not be
 * changed and there was no way back except the leader chip. That is the shape
 * of the "i pulsanti non funzionano" bug: the button worked, and left the shell
 * describing something it was not.
 *
 * Now it goes through the WINDOW, which is where "what am I showing" has lived
 * since WIN2. If the workspace already has a graph window, the node is revealed
 * THERE and the story stays open — which is the arrangement you would have
 * built for exactly this. Otherwise this window becomes a Graph window: the
 * same transform the Doc window's "Mostra sul canvas" performs, so leaving an
 * editor for the canvas means one thing everywhere.
 */
function revealFromNarrative(nodeId: string): void {
  const graphWin = windowsOf().find((w) => w.type === "graph");
  if (graphWin) {
    if (activeWin().id !== graphWin.id) selectWindow(graphWin.id);
  } else {
    const win = activeWin();
    setWinType(win, "graph");
    renderTiles();
  }
  revealFromWarning(nodeId);
}

// ── btnNarrative · «this window becomes Narrative» ──────────────────────────
//
// It used to be a SWITCH: `setMode(centralMode === "narrative" ? view :
// "narrative")`, an overlay on and off over the canvas. That was the second way
// of reaching a narrative, and the reason `#narrative-view` had to be one
// element — an overlay is over ONE canvas.
//
// Now it is the transformation every other type already had, reached by the same
// verb (`transformWindowOf`) as picking "❧ Narrative" from a window's own type
// menu. ONE gesture: the button is a shortcut to the menu item, not a different
// mechanism with a different state. Pressing it on a window that is already a
// narrative does nothing, which is what a transform means.
//
// NARR1 · and the scaffold moved here with it, because "make me a narrative" is
// exactly when a graph with no story yet should get one. Idempotent:
// `scaffoldNarrativeFromGraph` is a no-op when a narrative already exists, so a
// written story is never disturbed.
btnNarrative.addEventListener("click", () => {
  const win = activeWin();
  if (store) {
    const nid = scaffoldNarrativeFromGraph(store);
    if (nid) selectedNarrativeId = nid;
  }
  if (win.type !== "narrative") transformWindowOf(win, "narrative");
  else refreshNarrativeView();
});
// HDR1 · the writing toggle. Invoked by the ✎ action of a narrative window's
// header, never by a visible master-header button — so it no longer dresses
// itself (no active class, no Done/Edit label): the STATE is what it owns, and
// the window header renders that state (`win-act-on`).
btnNarrativeEdit.addEventListener("click", () => {
  // PER WINDOW, like every other mode: the ✎ of the window whose header was
  // pressed (`focusThen` has made it the active one), not a flag for the app.
  const win = activeWin();
  setWinCurrent(win, "editing", narrativeEditingOf(win) ? null : true);
  surfaceOf(win.id)?.refresh();
  renderAreaHeaders();
});

btnUndo.addEventListener("click", () => undoStore()?.undo());
btnRedo.addEventListener("click", () => undoStore()?.redo());
btnMatrix.addEventListener("click", () => setView("matrix"));
btnGraph.addEventListener("click", () => setView("graph"));

// ---------- WIN1 · workspace leader (Canvas / Narrative / Tabular) ----------
// The higher-level switcher that ABSORBS MODE1: each preset mounts an existing
// editor — Canvas/Narrative through setMode, Tabular through the table surface
// of the window (WIN6-RESIDUAL: there is no dock behind it any more). Windows
// carry their own state, so a preset only seeds the first one.
const workspaceBar = document.getElementById("workspace-bar")!;

/** Light the leader's active chip; keep workspace.ts's persisted id in step.
 *  Pure reflection — never triggers a workspace apply (no re-entrancy). */
function reflectWorkspaceInBar(id: WorkspaceId): void {
  syncActiveWorkspace(id);
  workspaceBar
    .querySelectorAll<HTMLButtonElement>("button[data-ws]")
    .forEach((b) => b.classList.toggle("active", b.dataset.ws === id));
  updateWindowHeader();
}

// ── WIN5 · the tiled shell ──────────────────────────────────────────────────
//
// The split tree (`workspace.ts`) becomes RECTANGLES (`shell/layout.ts`), and
// every window owns one area, created once and never re-parented. An area's
// content is built by its type's constructor (`shell/types.ts`) — the same one
// whether or not the window has the focus.
//
// THE THIRD FALSE COMMENT (15 set 2026), and it was this one. It read: «The
// ACTIVE window's area is the real `#canvas-wrap` […] Every OTHER area is a
// light secondary area […] read-only. Clicking a secondary area makes it
// active, which moves `#canvas-wrap` into it — so the editable window is
// wherever you last clicked, and there is still exactly one editor.» And below
// it: «Declared limit: secondary areas are a live VIEW, not a second editor (no
// selection, no drag).»
//
// Every sentence of that was true when it was written and false by tonight —
// and it was the module's own header, the first thing anybody reading this file
// would meet. A comment that outlives the thing it describes does not go stale
// quietly: it teaches the next person a shape of the program that is no longer
// there, and they build against it. There is no privileged area, no secondary
// one, no promoting click and no single editor: every graph window has its
// canvas, its camera, its minimap and the same ten gestures.

const tileRoot = document.getElementById("tile-root")!;

/**
 * THE GRAPH WINDOWS ON SCREEN, each with its own canvas, camera and minimap.
 *
 * This map is what `tileCanvases` used to be, and the difference is everything:
 * that one held the READ-ONLY twins of the one real canvas, and this one holds
 * editors. `paint(live)` is the whole interface — the surface mounts it, `draw()`
 * runs it, and nothing else needs to know how a graph window is built.
 */
interface GraphMount {
  winId: string;
  cv: HTMLCanvasElement;
  paint: (live: LiveGesture | null) => void;
}
const graphWindows = new Map<string, GraphMount>();
function graphMounts(): GraphMount[] {
  return [...graphWindows.values()].filter((g) => g.cv.isConnected);
}

/**
 * Build a graph window's canvas: wire its ten gestures, give it its own minimap,
 * and hand back what `draw()` needs.
 *
 * `#canvas` and `#overview` were singletons in the markup until tonight, and
 * `#canvas-wrap` was the area they lived in — the area that FOLLOWED THE FOCUS.
 * Both are per instance now, which is what finally lets `WRAP_TYPES` be empty.
 */
function mountGraphCanvas(cv: HTMLCanvasElement, mini: HTMLCanvasElement,
                          win: Win): GraphMount {
  const winId = win.id;
  wireGraphCanvas(cv, winId);
  // …and its own minimap. Per instance rather than "one that follows the focus":
  // an overlay that does not know whose it is was, three nights running, the
  // seed of the next twin. Its click moves THIS window's camera.
  const overview = buildOverview(mini, (wx, wy) => {
    const w = cv.clientWidth || 1;
    const h = cv.clientHeight || 1;
    const vp = viewportFor(winId, graphModeOf(winId));
    vp.x = w / 2 - wx * vp.scale;
    vp.y = h / 2 - wy * vp.scale;
    draw();
  });
  const mount: GraphMount = {
    winId,
    cv,
    paint: (live) => {
      const mode = graphModeOf(winId);
      paintGraphWindow({
        winId, cv, mode,
        // the hypergraph context belongs to the window that entered it, and the
        // context scene is the app's one — so a window in context draws it and
        // every other draws its own projection
        scene: live && inContext() ? contextScene : (scenes[mode] ?? null),
        vp: live && inContext() ? contextViewport : viewportFor(winId, mode),
        live,
        overview,
      });
    },
  };
  graphWindows.set(winId, mount);
  return mount;
}

/** Which projection a graph window is showing. */
function graphModeOf(winId: string): ViewKind {
  const win = windowsOf().find((w) => w.id === winId);
  return win && win.type === "graph" ? winMode(win) : "matrix";
}

function unmountGraphCanvas(winId: string): void {
  graphWindows.delete(winId);
}
/*
 * GONE (15 set 2026) · `tileCanvases` and `tileHover`.
 *
 * The canvases of the SECONDARY areas — the read-only twins — and the node each
 * of them had the pointer over. Both are `graphWindows` now, one map of real
 * editors, and the hover is the module's one `hoverId`, because there is one
 * pointer (`wireGraphCanvas`).
 */

/*
 * GONE (15 set 2026) · `drawTile()` and `drawTiles()`.
 *
 * `drawTile` was the SECOND drawing: the same renderer, the same scene, the same
 * camera — and no interaction state, because a secondary area was declared "a
 * live VIEW, not a second editor". That declaration was the last shape the
 * privileged area took. There is one painter now (`paintGraphWindow`), and
 * `draw()` runs it over every graph window.
 */

// ── WIN5 · the corner gesture (Blender) ─────────────────────────────────────
//
// Every area carries two corner grips. Drag one and where you RELEASE says what
// you meant:
//
//   · released INSIDE the same area  → SPLIT it. The dominant axis of the drag
//     picks the direction: dragging sideways cuts a new area beside this one,
//     dragging up/down cuts one above/below.
//   · released ON A NEIGHBOURING AREA → JOIN: this area absorbs that one and
//     the divider between them goes away.
//
// The same two verbs as the ⇥ / ⇤ / ⊟ buttons — the buttons stay, because a
// gesture nobody discovers is not a feature. This is the direct-manipulation
// way in, and it reads the geometry off the DOM: no second model of where the
// areas are.

/** The area element under a point, and the window it holds. */
function areaAt(x: number, y: number): { el: HTMLElement; winId: string } | null {
  // every area, and there is no longer a special one to add on the side
  const areas = [...document.querySelectorAll<HTMLElement>(".tile-area")].map(
    (el) => ({ el, winId: el.dataset.win ?? "" }));
  for (const a of areas) {
    const r = a.el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return a;
  }
  return null;
}

/**
 * Attach the two corner grips to an area.
 *
 * `barOffset` pushes the TOP-LEFT grip below that area's docked bar: the two
 * would otherwise overlap by a few pixels and the grip would occasionally eat a
 * click meant for the window-type dropdown — a gesture stealing a menu is worse
 * than a gesture nobody finds.
 */
function addCornerGrips(area: HTMLElement, winId: string, barOffset: string): void {
  for (const corner of ["tl", "br"] as const) {
    const grip = document.createElement("div");
    grip.className = `tile-corner tile-corner-${corner}`;
    if (corner === "tl") grip.style.top = barOffset;
    grip.title = t("tile.corner");
    grip.addEventListener("pointerdown", (e) => e.stopPropagation());
    grip.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let target: HTMLElement | null = null;
      const clearTarget = (): void => {
        document
          .querySelectorAll(".tile-join-target")
          .forEach((el) => el.classList.remove("tile-join-target"));
      };
      const move = (ev: MouseEvent): void => {
        clearTarget();
        const over = areaAt(ev.clientX, ev.clientY);
        // highlight only a neighbour we could actually absorb
        const siblings = siblingIdsOf(winId);
        if (over && over.winId !== winId && siblings.includes(over.winId)) {
          over.el.classList.add("tile-join-target");
          target = over.el;
        } else {
          target = null;
        }
      };
      const up = (ev: MouseEvent): void => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        clearTarget();
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        if (Math.abs(dx) + Math.abs(dy) < 8) return; // a click, not a drag
        const over = areaAt(ev.clientX, ev.clientY);
        if (target && over && over.winId !== winId) {
          // JOIN · the dragged area absorbs the one released on
          setActiveWin(winId);
          joinWindow(winId);
        } else if (over && over.winId === winId) {
          // SPLIT · the dominant axis decides the cut
          splitWindow(winId, Math.abs(dx) >= Math.abs(dy) ? "row" : "col");
        } else {
          return; // released on nothing meaningful: do nothing, quietly
        }
        renderTiles();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
    area.appendChild(grip);
  }
}

// ── ONE SURFACE · the arrangement is geometry, the focus is routing ──────────
//
// What changed tonight, and the one line it all came from:
//
//     tileRoot.innerHTML = "";
//
// ran on EVERY focus change, because `selectWindow()` called `renderTiles()` and
// the focus follows the mouse. A movement of the pointer destroyed and rebuilt
// the whole tree of areas — and three mechanisms existed to put back what that
// line threw away (`surface-scroll.ts`'s `rememberScrollsIn`, `wrapWin`,
// `releaseTilePanels`). They did not solve a problem; they compensated for a
// destruction that should not have happened.
//
// Now:
//  · every window owns ONE `.tile-area`, created once and NEVER re-parented;
//  · the tree decides four numbers per area (`shell/layout.ts`), so a split, a
//    join, a ratio drag and a resize write coordinates, not markup;
//  · a change of FOCUS writes a class. Nothing is built, moved or measured.
//
// `#canvas-wrap` is no longer "the focused area": it is THE GRAPH'S AREA — the
// area of whichever window still needs the singleton editing machine (graph,
// narrative, the hosted panels, the annotator). It is positioned like any other
// area and it only changes owner when the focus moves between two of THOSE
// types. That residual migration is the graph's, and it is the next step.

/*
 * GONE (15 set 2026) · `WRAP_TYPES` and `needsWrap()`.
 *
 * The list of types still drawn by the singleton wrap. Five members on
 * 12 September, three on the 13th, one on the 14th, none tonight — and a list
 * with no members is not a shorter privilege, it is none. `check-surfaces.mjs`
 * asserts the same thing from the other side: every `WindowType` declared in
 * `workspace.ts` has an entry in the surface registry, with no exceptions left
 * to print.
 */

/** One area per window, for the lifetime of the window. */
const winAreas = new Map<string, HTMLElement>();
/** The divider strips, pooled: a split adds one, a join hides one. */
const tileDividers: HTMLElement[] = [];
/** What each divider is dragging right now — read at mousedown, so one element
 *  can serve a different split after the arrangement changes. */
const dividerInfo = new WeakMap<HTMLElement, DividerRect>();
/** The rectangle last written to each element: a re-layout that changes nothing
 *  writes nothing, which is what makes `positionAreas` safe to call often. */
const lastRects = new WeakMap<HTMLElement, Rect>();


/** Wire an area's own gestures. Called ONCE per window: these listeners outlive
 *  every arrangement change, because the element does. */
function createArea(winId: string): HTMLElement {
  const area = document.createElement("div");
  area.className = "tile-area";
  area.dataset.win = winId;
  const bar = document.createElement("div");
  // WIN-FIX1 · this area's own HEADER, filled by `renderAreaHeaders` with the
  // SAME bar every other area gets — every area is a window, so every area says
  // what it is and offers its own verbs.
  bar.className = "tile-bar win-header";
  area.appendChild(bar);
  const winNow = (): Win | undefined => windowsOf().find((w) => w.id === winId);
  /*
   * GONE (15 set 2026) · the area's own `wheel`, `pointermove` and
   * `pointerleave`, and the `worldAt` they shared.
   *
   * They were the interaction of a SECONDARY GRAPH AREA — a read-only twin that
   * could zoom and hover but not drag, because the ten real gestures were bound
   * to the one `#canvas`. Every graph window has those ten wired to its own
   * canvas now (`wireGraphCanvas`), and the canvas is a CHILD of this area: its
   * events bubble here. So these handlers had stopped being a limited second
   * machine and become a DUPLICATE one — a wheel would zoom twice, and the
   * area's `pointerdown` would clear the selection a moment after the canvas's
   * had started a drag.
   *
   * Found by the inventory, not by the screen: `tileCanvases` and `tileHover`
   * were the two names of §3 still standing, and following them here is what
   * showed the twin was alive.
   */
  // ── FOCUS FOLLOWS MOUSE (Blender) ───────────────────────────────────────
  //
  // The editor moves to the area the pointer is IN, before any button is
  // pressed. Since tonight that costs a class on two elements — the area that
  // leaves and the one that arrives — instead of rebuilding the tree.
  //
  // Guarded: never mid-drag (moving across a divider while dragging a node must
  // not hand the node to another window), and never while placing a node.
  area.addEventListener("pointerenter", () => {
    if (dragMode !== "none" || connect || placingType) return;
    if (activeWin().id === winId) return;
    selectWindow(winId);
  });
  // ── the palette drop lands on THIS window ────────────────────────────────
  //
  // A drag from the palette is an HTML5 drag: pointer events do not fire, so
  // focus-follows-mouse cannot hand the editor over mid-drag and the drop would
  // be delivered to whichever canvas happened to be the editor — creating the
  // node in the wrong window. So the area accepts the drop itself: it takes the
  // focus and places the node at the point of the GRAPH that was pointed at, in
  // this area's own camera.
  area.addEventListener("dragover", (e) => {
    if (storageDragPayload(e) &&
        ["viewer", "shelf"].includes(winNow()?.type ?? "")) {
      e.preventDefault();
      area.classList.add("drop-target");
      return;
    }
    if (!paletteDragPayload(e)) return;
    e.preventDefault();
    area.classList.add("drop-target");
  });
  area.addEventListener("dragleave", () => area.classList.remove("drop-target"));
  area.addEventListener("drop", (e) => {
    area.classList.remove("drop-target");
    const resource = storageDragPayload(e);
    const target = winNow();
    if (resource && target?.type === "viewer") {
      e.preventDefault();
      selectWindow(winId); // the window you dropped on is the one you meant
      pinViewerCollection(target, resource);
      return;
    }
    // SHELF1 · the same gesture, the other meaning: dropping a file on the shelf
    // is "keep this", and it is where the digest is taken.
    if (resource && target?.type === "shelf") {
      e.preventDefault();
      selectWindow(winId);
      if (resource.type === "dir") toast(t("shelf.folderIsASource"));
      else void addFileToShelf(resource);
      return;
    }
    // …and a PALETTE drop is the canvas's (`wireGraphCanvas`), which knows where
    // in the graph the pointer was. The area used to catch it because a
    // secondary area had no live canvas to catch it with.
  });
  /*
   * GONE (15 set 2026) · the area's own `pointerdown`.
   *
   * Its two halves were «pan this area's camera» and «take the focus and resolve
   * the click here» — the second one written on 12 September when the click
   * reaching a secondary area had nowhere better to go. Both belong to the
   * canvas, which every graph window now has and which handles them for real
   * (pan with the middle button or Space, and a press that selects, drags or
   * starts a connector). Leaving this one would mean every press in a graph
   * window ran twice, the second time clearing what the first had begun.
   */
  tileRoot.appendChild(area);
  return area;
}

/** This window's area, created on first sight and kept. */
function areaFor(win: Win): HTMLElement {
  let area = winAreas.get(win.id);
  if (!area) {
    area = createArea(win.id);
    winAreas.set(win.id, area);
  }
  syncAreaContent(area, win);
  return area;
}

/** Give an area the surface of its window's type — and REBUILD it only when
 *  that type actually changed. A focus change never reaches here. */
function syncAreaContent(area: HTMLElement, win: Win): void {
  if (area.dataset.surfaceType === win.type) return;
  clearAreaContent(area, win.id);
  area.dataset.surfaceType = win.type;
  // ONE constructor, for every type and every area, focused or not
  // (`shell/types.ts`). There is no `else` any more: a window type with no
  // registered surface is a bug the fence catches (`check-focus-parity.mjs`
  // asserts every `WindowType` in `workspace.ts` has an entry), not a silent
  // fall-through to a note saying "step in to work here".
  mountSurface(win, area);
}

/** Everything an area holds that belongs to its TYPE — the bar and the grips
 *  belong to the area itself and stay. */
function clearAreaContent(area: HTMLElement, winId: string): void {
  unmountSurface(winId);   // …which, for a graph, unwires its canvas too
  // (a panel used to be sent home here before its box was destroyed: it was one
  //  element, so destroying the box destroyed the panel. It is this window's own
  //  now, and `unmountSurface` above has already taken it down.)
  for (const child of [...area.children]) {
    if (child.classList.contains("tile-bar")) continue;
    if (child.classList.contains("tile-corner")) continue;
    child.remove();
  }
  delete area.dataset.surfaceType;
}

/** A window that is gone: its area, its surface and its registrations with it. */
function destroyArea(winId: string): void {
  const area = winAreas.get(winId);
  if (!area) return;
  clearAreaContent(area, winId);
  area.remove();
  winAreas.delete(winId);
  lastRects.delete(area);
}

/*
 * GONE (15 set 2026) · `wrapOwnerFor()` and `setWrapOwner()`.
 *
 * `#canvas-wrap` was "the area of the window that owns it", and these two
 * decided who that was and handed it over. The hand-over was the last migration
 * left in the app, measured on 14 September at +106/−97 nodes between two graph
 * windows — every other crossing was already +0/−0.
 *
 * There is nothing to own. A graph window builds its own canvas in its own area
 * like every other type, so a change of focus is two class writes and the wrap
 * has no owner to change.
 */

/** Write a rectangle onto an element — and only when it moved. */
function placeAt(el: HTMLElement, r: Rect): void {
  if (sameRect(lastRects.get(el), r)) return;
  lastRects.set(el, r);
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.width = `${r.w}px`;
  el.style.height = `${r.h}px`;
}

/** The arrangement, as coordinates. Cheap enough to run on every resize. */
function positionAreas(): void {
  const root: Rect = { x: 0, y: 0, w: tileRoot.clientWidth, h: tileRoot.clientHeight };
  const { areas, dividers } = layoutRects(layoutOf(), root);
  for (const [id, r] of areas) {
    const el = winAreas.get(id);
    if (el) placeAt(el, r);
  }
  while (tileDividers.length < dividers.length) {
    const div = document.createElement("div");
    div.className = "tile-div";
    div.addEventListener("mousedown", (e) => {
      const info = dividerInfo.get(div);
      if (!info) return;
      e.preventDefault();
      div.classList.add("dragging");
      const base = tileRoot.getBoundingClientRect();
      const move = (ev: MouseEvent): void => {
        const r =
          info.dir === "col"
            ? (ev.clientY - base.top - info.span.y) / Math.max(1, info.span.h)
            : (ev.clientX - base.left - info.span.x) / Math.max(1, info.span.w);
        setSplitRatio(info.firstId, r);
        positionAreas();       // four numbers per area — nothing is rebuilt
        draw();
        draw();
      };
      const up = (): void => {
        div.classList.remove("dragging");
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
    tileRoot.appendChild(div);
    tileDividers.push(div);
  }
  tileDividers.forEach((div, i) => {
    const info = dividers[i];
    div.classList.toggle("hidden", !info);
    if (!info) return;
    dividerInfo.set(div, info);
    div.classList.toggle("tile-div-col", info.dir === "col");
    placeAt(div, info.rect);
  });
}

/** The focus ring and the input routing, and NOTHING else. */
function setAreaFocused(winId: string, on: boolean): void {
  const el = winAreas.get(winId);
  if (!el) return;
  el.classList.toggle("tile-active", on);
  surfaceOf(winId)?.setFocused(on);
  if (!on) return;
  reflectLiveArea();
  // THE TWO OVERLAYS OF A CANVAS, which are the whole of what
  // `applyWindowSurface` had left by tonight. The funnel filters nodes and
  // connectors and the filter panel lists the circles of detail — both are
  // questions only a graph window can answer, so on any other they would be
  // acting on something that is not on screen. This is the one thing a focus
  // change does besides the ring, and it changes no layout: the panel is an
  // overlay, and closing one that cannot apply is not a re-arrangement.
  if (windowsOf().find((w) => w.id === winId)?.type !== "graph"
      && filterPanelOpen()) closeFilterPanel();
  refreshFunnel();
}

/**
 * WHERE THE FOCUSED AREA IS, published as four numbers on the shell.
 *
 * The overlays of the canvas — `+ epoch`, the view-properties button, the
 * circles-of-detail panel, the chrono banner, the empty-state hint — used to be
 * children of `#canvas-wrap`, so "the top-left of the canvas" was simply their
 * own `left: 10px`. With the wrap gone they are children of `#tile-root`, which
 * is the whole shell, and `left: 10px` would put the epoch button over whichever
 * area happens to be in the corner.
 *
 * So the focused area's rectangle is published, and the CSS places them against
 * it. The alternative was to move them into the focused window's area on every
 * focus change — which is `#canvas-wrap` rebuilt under another name, and the
 * thing three nights of work have been removing. Coordinates instead of
 * re-parenting is the same choice `positionAreas()` made on 12 September.
 *
 * The ones that are NOT canvas overlays keep the shell: a toast, a transient
 * hint bar and a menu opened at a point belong to the app, not to a window.
 */
function reflectLiveArea(): void {
  const el = winAreas.get(activeWin().id);
  const root = tileRoot.getBoundingClientRect();
  const r = el ? el.getBoundingClientRect() : root;
  const bar = el?.querySelector<HTMLElement>(":scope > .tile-bar");
  tileRoot.style.setProperty("--live-x", `${Math.round(r.left - root.left)}px`);
  tileRoot.style.setProperty("--live-y", `${Math.round(r.top - root.top)}px`);
  tileRoot.style.setProperty("--live-w", `${Math.round(r.width)}px`);
  tileRoot.style.setProperty("--live-h", `${Math.round(r.height)}px`);
  tileRoot.style.setProperty("--winbar-h", `${bar?.offsetHeight ?? 0}px`);
  tileRoot.style.setProperty(
    "--palette-w",
    el ? getComputedStyle(el).getPropertyValue("--palette-w").trim() || "0px" : "0px");
}

/**
 * Lay the workspace out. A STRUCTURAL change only: a split, a join, a ratio, a
 * magnify, a window added or closed, a workspace switched, a type transformed.
 *
 * NOT a focus change. `selectWindow()` no longer calls this, and that sentence
 * is the criterion the whole night was measured against.
 */
function renderTiles(): void {
  // Any menu open right now belongs to a bar that is about to be rebuilt.
  closeAllDropdowns();
  closeAllSubmenus();
  const placed = paneIds(layoutOf());
  const keep = new Set(placed);
  for (const id of [...winAreas.keys()]) if (!keep.has(id)) destroyArea(id);
  for (const id of placed) {
    const win = windowsOf().find((w) => w.id === id);
    if (win) areaFor(win);
  }
  // the resources panel and the corner grips belong to the ARRANGEMENT: they are
  // rebuilt here, with it, and never on a focus change
  paletteUis.length = 0;
  for (const [id, area] of winAreas) {
    const win = windowsOf().find((w) => w.id === id);
    if (!win) continue;
    area.querySelectorAll(".tile-corner, .win-resources, .win-res-chevron")
      .forEach((g) => g.remove());
    buildResourcePanel(area, win);
    addCornerGrips(area, id, "var(--winbar-h, 0px)");
  }
  positionAreas();
  renderAreaHeaders();
  reflectLiveArea();
  renderEmData();
  renderStorage();
  refreshTileSurfaces();
  draw();
  setAreaFocused(activeWin().id, true);
  for (const id of placed) if (id !== activeWin().id) setAreaFocused(id, false);
}

// ── CURRENT-ELEMENT · the element the ACTIVE window is working on ───────────
// The chapter of a Narrative window, the row of a Table window. Stored on the
// window (workspace.ts) so two windows of the same type can sit on different
// elements; read here by the menus, which then act through the EXISTING
// mutators. A menu item with no current element stays disabled WITH ITS REASON
// rather than guessing which chapter the user meant.

/** The chapter a narrative window is on. `win` and not `activeWin()`: the
 *  narrative surface is mounted once per window and `renderNarrativeInto(host,
 *  win)` knows which — while the focus is one window for all of them. Two
 *  narrative windows open, and the ambient read made the second one show the
 *  first one's chapter and write its picks there. */
function currentChapterIndex(win: Win): number | null {
  const v = winCurrent(win, "chapter");
  return typeof v === "number" ? v : null;
}
function setCurrentChapterIndex(win: Win, i: number | null): void {
  if (currentChapterIndex(win) === i) return;   // nothing to change, nothing to do
  setWinCurrent(win, "chapter", i);
  // NO RE-RENDER HERE, and this is a BUG FIX, not an optimisation.
  //
  // The narrative view sets the current chapter on `mousedown` (picking the
  // chapter you are reading is navigation). Re-rendering there rebuilt the whole
  // view *between mousedown and mouseup*, so every control inside a chapter —
  // `+ prose`, `▲ ▼ ✕`, the author picker — was REMOVED FROM THE DOM mid-gesture,
  // and a `click` event only fires when the down and the up land on the same
  // element. Measured with a real mouse: the button logged `pointerdown`,
  // `mousedown`, and then nothing at all, with `document.contains(button)` false.
  // That is the whole of "I press and nothing happens", and it hit every
  // narrative control at once.
  //
  // Marking a chapter is a class and a header, so that is all it does.
  markCurrentChapter(i);
  updateWindowHeader(); // the menus enable/disable with it
}

/**
 * The host of a Narrative window's story — `.nv-view`, which every mount carries.
 *
 * Three places used to say `#narrative-view …`: the signer picker, the
 * "generating" mark, and the current-chapter marker. That id was the OVERLAY,
 * i.e. the one story on screen, so the selector was a way of writing "whichever
 * narrative has the focus" without having to say which. With the narrative a
 * window type, the question has a real answer — this window — and the answer is
 * its own host.
 */
function narrativeHostOf(win: Win): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.tile-area[data-win="${CSS.escape(win.id)}"] .nv-view`);
}

/** …and the one the verbs of the master header act on: the focused Narrative
 *  window if there is one, else the first on screen. Says which, rather than
 *  letting a selector pick whatever came first in the document. */
function activeNarrativeHost(): HTMLElement | null {
  const act = activeWin();
  if (act.type === "narrative") return narrativeHostOf(act);
  const any = windowsOf().find((w) => w.type === "narrative");
  return any ? narrativeHostOf(any) : null;
}

/** Move the `nv-current` marker in the DOM, without rebuilding anything. */
function markCurrentChapter(i: number | null): void {
  const host = activeNarrativeHost();
  if (!host) return;
  host.querySelectorAll(".nv-chapter").forEach((section, index) =>
    section.classList.toggle("nv-current", index === i));
}
function currentRowId(): string | null {
  const v = winCurrent(activeWin(), "row");
  return typeof v === "string" ? v : null;
}
function setCurrentRowId(id: string | null): void {
  setWinCurrent(activeWin(), "row", id);
}

/**
 * ROWSELECT · a row was picked in a Tabular window: select that node, and show
 * it in a Graph window if one is open.
 *
 * Deliberately NOT the same gesture as `revealFromNarrative`. Leaving a story to
 * look at a node means leaving the story — the narrative window transforms if it
 * has to. A table is different: you pick rows to walk a list, and turning the
 * table into a canvas under you would take away the thing you were reading. So
 * this reveals in a graph window that ALREADY exists, and does nothing to the
 * arrangement when there is none.
 *
 * A row whose node is not in the graph (or not in the current scene — folded,
 * filtered out) is a no-op with a word about it, never an error: the table can
 * legitimately show rows the canvas does not draw.
 */
function revealFromTable(nodeId: string): void {
  if (!store || !store.node(nodeId)) return;   // a row without a node: nothing to show
  select(nodeId);                              // selection is a fact about the document
  const graphWin = windowsOf().find((w) => w.type === "graph");
  if (!graphWin) return;                       // no canvas open: the selection is enough
  const previous = activeWin().id;
  setActiveWin(graphWin.id);
  if (scene()?.byId.has(nodeId)) centerOn(nodeId);
  else toast(t("toast.selectedNotVisible"));
  // the focus goes back to the table: you were reading a list, and the pick was
  // a question about one row, not a decision to leave
  setActiveWin(previous);
  draw();
  draw();
}

/** The narrative this window is showing (the selected one, else the first). */
function activeNarrative(): { id: string; chapters: unknown[] } | null {
  if (!store) return null;
  const list = narrativesIn(store.doc);
  const n = list.find((x) => x.id === selectedNarrativeId) ?? list[0];
  return n ? { id: n.id, chapters: n.chapters } : null;
}

/** The current chapter, validated against the narrative that is actually open —
 *  a persisted index must never outlive the chapter it pointed at. */
function validCurrentChapter(win: Win): number | null {
  const narr = activeNarrative();
  const i = currentChapterIndex(win);
  if (!narr || i == null) return null;
  return i >= 0 && i < narr.chapters.length ? i : null;
}

/**
 * NO-DEAD-END · a narrative window ARRIVES with a chapter to work on.
 *
 * Measured: with nothing current, EVERY item of Capitolo/Inserisci/IA is
 * unavailable for one reason — "click a chapter to make it current" — so the
 * whole window reads as broken until you happen to click a chapter first. The
 * requirement itself is right (a menu that said "the current chapter" while
 * guessing which one would be worse); what was wrong is starting from nowhere.
 *
 * So the first chapter becomes current on arrival. It is a DEFAULT, not a
 * decision: clicking any chapter changes it, and nothing is written to the
 * document — the current element lives on the window (workspace.ts).
 */
function ensureCurrentChapter(win: Win): void {
  const narr = activeNarrative();
  if (!narr || !narr.chapters.length) return;
  if (validCurrentChapter(win) != null) return;
  // `setWinCurrent` and not `setCurrentChapterIndex`: the latter re-renders the
  // view, which calls this again — one default must not cost a render loop. The
  // marker and the menus are brought up to date by hand, right here, which is
  // all the re-render would have done anyway.
  setWinCurrent(win, "chapter", 0);
  markCurrentChapter(0);
  updateWindowHeader();
}

// WIN2b · the window header's transform dropdown. It changes the ACTIVE WINDOW's
// type IN PLACE — same slot, same workspace, a different editor. (WIN1 shipped a
// placeholder that jumped to the type's canonical workspace; with real window
// instances that indirection is gone, and a Canvas workspace showing a table is
// now a legitimate arrangement.) DTC is a graph MODE, not a transform target;
// Doc has no editor yet. Elements are looked up at call time (not module-load
// consts) so the early updateWindowHeader path never hits a TDZ.
const TRANSFORM_TYPES: WindowType[] = [
  "graph",
  "narrative",
  "table",
  "emtree",
  "inspector",
  "doc",
  "viewer",
  "storage",
  "annotator",
  "shelf",
  "study",
];

/**
 * WIN5 · which SURFACE of the window area is showing. The area has four: the
 * canvas, the narrative overlay, the table and the documents. Exactly one is
 * visible, and this is the only place that decides — a window type maps to a
 * surface, and nothing else touches their visibility.
 */
// ── WIN5 · the Doc window ───────────────────────────────────────────────────
//
// "Doc" in an EM graph means the SOURCES: the DocumentNodes the paradata chain
// hangs from (D.1 Rilievo Maiuri 1931, D.2 Fotografia storica…). This window is
// their reading and editing surface — the list on the left, the current one on
// the right, its fields writing through `store.updateNode` like every other
// editor. Deliberately NOT a rich text editor: EMStudio has no document body to
// edit, and inventing one would be a second model of what a source is.

/** The document a Doc window is showing. `win` and not `activeWin()`: both
 *  callers are items of a window's own Doc menu, and since the registry carries
 *  the window they have one to give. */
function currentDocId(win: Win): string | null {
  const v = winCurrent(win, "doc");
  return typeof v === "string" ? v : null;
}

function documentsInGraph(): EmNode[] {
  return (store?.doc.graph.nodes ?? []).filter((n) => n.node_type === "document");
}

/** The focused Doc window's surface. WIN7 split the rendering out (below) so a
 *  SECONDARY Doc area can paint the same thing into its own two boxes. */
function renderDocView(): void {
  refreshSurfaces("doc");
}

/** A Doc surface wide enough for the list and the detail side by side gets the
 *  row layout; a narrow one stacks them. Measured from the SURFACE, so the two
 *  renderings answer it the same way and the focus never enters into it. */
function reflectDocWidth(surface: HTMLElement): void {
  surface.classList.toggle("doc-wide", surface.clientWidth >= 520);
}

/** Draw the sources of the graph for ONE window into ONE pair of boxes. The
 *  window is a parameter because "which document is current" lives on it: two
 *  Doc areas can sit on different sources. */
function renderDocViewInto(
  win: Win,
  list: HTMLElement,
  detail: HTMLElement,
): void {
  list.innerHTML = "";
  detail.innerHTML = "";
  const docs = documentsInGraph();
  if (!docs.length) {
    detail.innerHTML =
      `<div class="doc-empty">${t("doc.empty")}</div>`;
    return;
  }
  const currentId = winCurrent(win, "doc");
  const current = docs.find((d) => d.id === currentId) ?? docs[0];
  const repaint = (): void => renderDocViewInto(win, list, detail);
  for (const d of docs) {
    const b = document.createElement("button");
    b.className = "doc-item" + (d.id === current.id ? " current" : "");
    const data = (d.data ?? {}) as Record<string, unknown>;
    const sub = String(data.title ?? data.filename ?? d.description ?? "");
    b.innerHTML =
      `${escapeHtml(d.name || d.id)}` +
      (sub ? `<span class="doc-sub">${escapeHtml(sub)}</span>` : "");
    b.addEventListener("click", () => {
      setWinCurrent(win, "doc", d.id);
      repaint();
    });
    list.appendChild(b);
  }
  // the current document's fields, straight onto the node
  const data = (current.data ?? {}) as Record<string, unknown>;
  const field = (
    label: string,
    value: string,
    commit: (v: string) => void,
  ): void => {
    const l = document.createElement("label");
    l.className = "doc-field";
    l.textContent = label;
    const inp = document.createElement("input");
    inp.className = "doc-input";
    inp.value = value;
    inp.addEventListener("change", () => commit(inp.value));
    detail.appendChild(l);
    detail.appendChild(inp);
  };
  const setData = (key: string, v: string): void => {
    if (!store) return;
    store.updateNode(current.id, {
      data: { ...(current.data ?? {}), [key]: v },
    } as Partial<EmNode>);
    repaint();
  };
  field(t("doc.name"), current.name ?? "", (v) =>
    store?.updateNode(current.id, { name: v }),
  );
  field(t("doc.title"), String(data.title ?? ""), (v) => setData("title", v));
  field(t("doc.filename"), String(data.filename ?? ""), (v) =>
    setData("filename", v),
  );
  field(t("doc.year"), String(data.year ?? ""), (v) => setData("year", v));
  field(t("doc.description"), current.description ?? "", (v) =>
    store?.updateNode(current.id, { description: v }),
  );

  // what hangs off this document — the reason a source is in the graph at all
  const extractors = (store?.doc.graph.edges ?? []).filter(
    (e) => e.edge_type === "extracted_from" && e.target === current.id,
  );
  const links = document.createElement("div");
  links.className = "doc-links";
  links.textContent = t("doc.extractors", { n: String(extractors.length) });
  detail.appendChild(links);
  const jump = document.createElement("button");
  jump.className = "insp-btn";
  jump.textContent = t("doc.reveal");
  jump.addEventListener("click", () => {
    // "show it on the canvas" turns THIS window into a graph — including when the
    // click came from a secondary area, which the focus has just moved to anyway.
    setActiveWin(win.id);
    setWinType(win, "graph");
    renderTiles();
    select(current.id);
    centerOn(current.id);
  });
  detail.appendChild(jump);
}


// ── SHELF1 · THE WIDE LIST ──────────────────────────────────────────────────
//
// The file browser shows every file on the disk, including everything that must
// never enter the documentation. The shelf holds what you CHOSE — with a digest,
// the fence it comes from, and where its bytes live. That difference is the
// whole reason the two are different windows.
//
// It is a ShelfGraph, so it saves and reopens like any other graph. The orphan
// scan of a folder is not a rival shelf: it is an ENTRANCE to this one.

/**
 * STUDY · the per-graph panel, in a window of its own.
 *
 * Reads the SAME store the inspector reads and passes the SAME two callbacks
 * the panel has always been given (`resolveAuthority`, `searchTwins`) — the
 * bindings are the module-level functions, not a new pair, so the fields behave
 * exactly as they did when this panel lived inside the inspector.
 *
 * Guarded on the surface, not on the focus, for the reason `renderShelf` gives
 * two functions below: a renderer should ask the screen whether it is on it.
 */
/** Paint the Study of every Study window on screen. There is no longer a
 *  "focused" one to ask about: the surface is the same object in every area
 *  (`shell/types.ts`), and an unfocused Study shows the study — which before
 *  tonight it did not, because nobody had written its secondary surface. */
function renderStudyWindow(): void {
  refreshSurfaces("study");
}

/** …and the one renderer both — now all — mounts call. */
function renderStudyInto(body: HTMLElement): void {
  if (!store) {
    body.textContent = "";
    return;
  }
  renderStudyPanel(body, store, {
    resolveAuthority: resolveAuthority,
    searchTwins: (term) => searchTwins(term),
  });
}

/** Paint every Shelf surface on screen. "Ask the surface, not who has the
 *  focus" was already the rule here; now there is nothing else to ask. */
function renderShelf(): void {
  refreshSurfaces("shelf");
  syncShelfNameInputs();
}

/** Every shelf-name box on screen, brought back to the list's own name — except
 *  the one somebody is typing in, which must not be corrected under their
 *  fingers. There is one per shelf window now, not one in the app. */
function syncShelfNameInputs(): void {
  for (const input of document.querySelectorAll<HTMLInputElement>(
         ".win-strip-shelfname")) {
    if (document.activeElement !== input) input.value = shelfMeta().name;
  }
}

/**
 * SURFACE-AUDIT · the shelf's LIST, into any body.
 *
 * Split out for the same reason `renderDocViewInto` was: before 12 September a
 * shelf window that lost the focus could only say its own name. One renderer,
 * as many mounts as there are Shelf windows — never a second, divergible
 * rendering of the same list.
 */
function renderShelfInto(win: Win, body: HTMLElement,
                         count: HTMLElement | null): void {
  const entries = shelfEntries();
  if (count) count.textContent = t("shelf.count", { n: String(entries.length) });
  // SHELF-B · the same shelf, two ways of looking (`SHELF_MODES`). The TABLE is
  // the library's answer about these entries; the LIST is what you drag into and
  // it keeps working with no bridge. Neither is a second shelf: both read the
  // one list that becomes the container's ShelfGraph.
  if (winModeOf(win) === "table") {
    if (!shelfTableAsked && !shelfTableBusy) {
      shelfTableAsked = true;
      void refreshShelfTable();
    }
    paintSurface(win, body, () => renderShelfTableInto(body));
    return;
  }
  paintSurface(win, body, () => {
    body.textContent = "";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "viewer-empty";
      const p = document.createElement("p");
      p.textContent = t("shelf.empty");
      empty.appendChild(p);
      body.appendChild(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "shelf-list";
    for (const entry of entries) list.appendChild(shelfRow(entry));
    body.appendChild(list);
  });
}

// ── SHELF-B · THE TABLE, and why it comes from the library ─────────────────
//
// The list above is what you drag INTO. This is the same shelf read BACK from
// s3Dgraphy — because three of its columns are things only the library can
// answer, and answering them here would be a second answer:
//
//   · RESIDENCE (disk/minio/uri) — the locator, plus what the origin says;
//   · ROLE (comparandum/internal_source) — STATED, orthogonal to the fence;
//   · MODE (only_shelf/used_in_graph) — the hatting reference-check across
//     EVERY graph of the container, which is why the whole container travels.
//
// A shelf with two opinions about "is this in use?" is worse than one with no
// badge, so nothing about a row is computed on this side (see `shelf-table.ts`).
// The cost is a bridge round trip, and it is declared: no bridge → the table
// says so and the LIST mode still works offline, which is the honest trade.

/**
 * The project as the library needs to see it: every graph plus the shelf.
 *
 * NOT `projectContainer()`, and that is not an oversight — that one settles the
 * project's VERSION, and reading a table must not invent a revision. Same
 * members, same shelf, no bump.
 */
function shelfContainerDoc(): Record<string, unknown> {
  const graphs = emtree.slots.map((slot) => ({
    id: String((slot.store.doc.graph as Record<string, unknown>).graph_id ?? slot.id),
    doc: JSON.parse(slot.store.toJSON()) as EmDocument,
  }));
  const activeSlot = emtree.active();
  return buildContainer({
    graphs,
    shelf: projectShelfSection(),
    corpus: projectCorpusSection(),
    activeGraphId: activeSlot
      ? String((activeSlot.store.doc.graph as Record<string, unknown>).graph_id
               ?? activeSlot.id)
      : null,
  }) as unknown as Record<string, unknown>;
}

/** Ask the bridge for the shelf as rows. `extra` carries a WRITE (paste-URI,
 *  promote) — every shelf route answers with the fresh table, so a caller never
 *  renders a stale row beside a new one. */
async function askShelf(route: string, extra: Record<string, unknown> = {},
                        ): Promise<Record<string, unknown> | null> {
  const body = { doc: shelfContainerDoc(), ...extra };
  try {
    const res = await fetch(`${await bridgeUrl()}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `bridge ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) msg = j.error;
      } catch {
        /* non-JSON error page */
      }
      shelfTableNote = msg;
      return null;
    }
    const answer = (await res.json()) as Record<string, unknown>;
    const table = parseShelfTable(answer);
    if (!table) {
      // an answer that is not a table is not an empty shelf, and drawing zero
      // rows for it would be a lie the user cannot see through
      shelfTableNote = t("shelf.tableUnreadable");
      return null;
    }
    shelfTable = table;
    shelfTableNote = null;
    return answer;
  } catch {
    shelfTableNote = BRIDGE_UNREACHABLE;
    return null;
  }
}

async function refreshShelfTable(): Promise<void> {
  if (shelfTableBusy) return;
  shelfTableBusy = true;
  shelfTableAsked = true;
  await askShelf("/shelf-table");
  shelfTableBusy = false;
  renderShelf();
}

/** The table body. One row per shelf entry, columns and order as the library
 *  gave them — a column added in s3Dgraphy appears here without an edit. */
function renderShelfTableInto(body: HTMLElement): void {
  body.textContent = "";
  if (shelfTableNote) {
    const note = document.createElement("div");
    note.className = "shelf-note";
    note.textContent = shelfTableNote;
    const hint = document.createElement("div");
    hint.className = "shelf-note-hint";
    hint.textContent = t("shelf.tableNeedsBridge");
    body.append(note, hint);
    return;
  }
  if (!shelfTable.rows.length) {
    const empty = document.createElement("div");
    empty.className = "viewer-empty";
    const p = document.createElement("p");
    // "asking" and "empty" are different things, and a table that says the
    // second while doing the first is a lie with a 200 ms lifetime
    p.textContent = shelfTableBusy ? t("shelf.tableAsking") : t("shelf.empty");
    empty.appendChild(p);
    body.appendChild(empty);
    return;
  }
  const table = document.createElement("table");
  table.className = "shelf-table";
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const column of shelfTable.columns) {
    if (column === "ID") continue;              // the key, not a column to read
    const th = document.createElement("th");
    th.textContent = t(`shelf.col.${column}`, {}, column);
    th.className = `c-${column.toLowerCase()}`;
    hr.appendChild(th);
  }
  head.appendChild(hr);
  const tbody = document.createElement("tbody");
  for (const row of shelfTable.rows) tbody.appendChild(shelfTableRow(row));
  table.append(head, tbody);
  body.appendChild(table);
}

function shelfTableRow(row: ShelfRow): HTMLElement {
  const tr = document.createElement("tr");
  const id = rowId(row);
  tr.dataset.entry = id;
  for (const column of shelfTable.columns) {
    if (column === "ID") continue;
    const td = document.createElement("td");
    td.className = `c-${column.toLowerCase()}`;
    if (column === "ROLE") {
      td.appendChild(shelfRoleCell(id, cellText(row, column)));
    } else if (isBadgeColumn(column)) {
      const value = cellText(row, column);
      const badge = document.createElement("span");
      badge.className = badgeClass(column, value);
      // the LABEL is localised, the VALUE is the library's — a missing key
      // falls back to what the library said rather than to an empty cell
      badge.textContent = value ? t(`shelf.v.${value}`, {}, value) : "—";
      td.appendChild(badge);
    } else if (column === "SIZE") {
      td.textContent = humanSize(row[column]);
      td.title = cellText(row, column);
    } else {
      td.textContent = cellText(row, column);
      if (column === "LOCATOR" || column === "CHECKSUM") {
        td.className += " mono";
        td.title = cellText(row, column);
      }
    }
    tr.appendChild(td);
  }
  // …and the gesture that turns a row into part of the study
  tr.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openShelfPromote(id, cellText(row, "NAME"));
  });
  return tr;
}

/**
 * The ROLE cell is editable, and it is the only editable one — because it is the
 * only column that is a DECISION rather than a fact. Where the bytes are and
 * whether the resource is used are read off the graph; what it is FOR is
 * something a person says.
 *
 * The options come from the API (`roles` travelled with the table). Nothing here
 * knows what they are, so the day a third one is declared this picker grows it
 * without an edit.
 */
function shelfRoleCell(id: string, current: string): HTMLElement {
  if (!shelfTable.roles.length) {
    const span = document.createElement("span");
    span.className = badgeClass("ROLE", current);
    span.textContent = current ? t(`shelf.v.${current}`, {}, current) : "—";
    return span;
  }
  const sel = document.createElement("select");
  sel.className = "shelf-role-pick";
  const unset = document.createElement("option");
  unset.value = "";
  unset.textContent = t("shelf.roleUnset");
  sel.appendChild(unset);
  for (const role of shelfTable.roles) {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = t(`shelf.v.${role}`, {}, role);
    sel.appendChild(opt);
  }
  sel.value = current;
  sel.addEventListener("change", () => {
    // written on THIS side (the shelf list is the in-memory shelf of the
    // container) and then read BACK from the library, so the badge you see is
    // the library's answer and not this select's optimism
    updateShelfEntry(id, { role: sel.value || undefined });
    void refreshShelfTable();
  });
  return sel;
}

function shelfRow(entry: ShelfEntry): HTMLElement {
  const row = document.createElement("div");
  row.className = "shelf-row";
  row.dataset.entry = entry.id;

  // IIIF · a shelf that shows what it holds. The entry already carries the
  // checksum (SHELF1), and the checksum IS the image's identifier, so a
  // thumbnail is one URL and no download of the original. Everything else keeps
  // the glyph it had: no service, no checksum, not an image → unchanged.
  const icon = document.createElement("span");
  icon.className = "shelf-icon";
  const thumb = entry.kind === "image"
    ? iiifThumbnailUrl({ id: entry.id, node_type: "resource", name: entry.name,
                         data: { checksum: entry.checksum,
                                 media_type: "image/jpeg" } } as EmNode,
                       iiifBase(), 96)
    : null;
  if (thumb) {
    const img = new Image();
    img.className = "shelf-thumb";
    img.src = thumb;
    img.alt = "";
    img.loading = "lazy";
    // a service that is configured but cannot answer must not leave a broken
    // frame in the list: fall back to the glyph, silently
    img.addEventListener("error", () => {
      img.remove();
      icon.textContent = "🖼";
    });
    icon.appendChild(img);
  } else {
    icon.textContent = entry.kind === "image" ? "🖼"
      : entry.kind === "document" ? "📄"
      : entry.kind === "web_page" ? "🔗" : "•";
  }

  const main = document.createElement("div");
  main.className = "shelf-main";
  const name = document.createElement("div");
  name.className = "shelf-name";
  name.textContent = entry.name;
  const locator = document.createElement("code");
  locator.className = "shelf-locator";
  locator.textContent = entry.locator;
  main.append(name, locator);

  // The two axes, SHOWN — the three-fence model has to be visible or it is not
  // a model, it is a field in a file. A badge that was never recorded is marked
  // as inferred (the dotted one), so "curated" and "assumed" stay tellable
  // apart at a glance.
  const badges = document.createElement("div");
  badges.className = "shelf-badges";
  const scope = effectiveScope(entry);
  const residency = effectiveResidency(entry);
  const scopeBadge = document.createElement("span");
  scopeBadge.className = `shelf-badge scope-${scope}` + (entry.scope ? "" : " inferred");
  scopeBadge.textContent = t(`shelf.scope.${scope}`);
  scopeBadge.title = entry.scope ? t("shelf.recorded") : t("shelf.inferred");
  const resBadge = document.createElement("span");
  resBadge.className = "shelf-badge" + (entry.residency ? "" : " inferred");
  resBadge.textContent = t(`shelf.residency.${residency}`);
  resBadge.title = entry.residency ? t("shelf.recorded") : t("shelf.inferred");
  badges.append(scopeBadge, resBadge);
  if (entry.checksum) {
    const sum = document.createElement("span");
    sum.className = "shelf-badge checksum";
    sum.textContent = "⌗ " + entry.checksum.slice(7, 15);
    sum.title = entry.checksum;
    badges.appendChild(sum);
  }

  const actions = document.createElement("div");
  actions.className = "shelf-actions";
  if (isAnnotatable(entry)) {
    const annotate = document.createElement("button");
    annotate.textContent = t("shelf.annotate");
    annotate.title = t("shelf.annotateTitle");
    annotate.addEventListener("click", () => annotateShelfEntry(entry));
    actions.appendChild(annotate);
  }
  const drop = document.createElement("button");
  drop.textContent = "✕";
  drop.title = t("shelf.remove");
  drop.addEventListener("click", () => {
    removeFromShelf(entry.id);
    renderShelf();
  });
  actions.appendChild(drop);

  row.append(icon, main, badges, actions);
  return row;
}

/**
 * A file dragged from the Storage window lands here — with its DIGEST.
 *
 * The checksum is what makes this a curated list rather than a pile: the same
 * photograph dragged twice from two folders is one resource, and only the
 * content can say so. The browser cannot compute it (it is not allowed to read
 * the file), so the bridge does — one call, and the entry is deduplicated on the
 * way in.
 */
async function addFileToShelf(payload: StorageDragPayload): Promise<void> {
  let checksum: string | undefined;
  try {
    const res = await fetch(
      `${await bridgeUrl()}/fs/checksum?path=${encodeURIComponent(payload.path)}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { checksum?: string };
      checksum = data.checksum;
    }
  } catch {
    /* no bridge: the resource still goes on the shelf, just without a digest —
       losing the drop because the hash failed would be the wrong trade */
  }
  const entry = addToShelf({
    locator: payload.path,
    name: payload.name,
    checksum,
    scope: "own-study",
    residency: "resident",
  });
  renderShelf();
  toast(checksum
    ? t("shelf.added", { name: entry.name })
    : t("shelf.addedNoChecksum", { name: entry.name }));
}

/**
 * Paste a link → a shelf entry that is the URI and NOTHING ELSE.
 *
 * Through the library when it is reachable (`/shelf-add-uri` →
 * `api.uri_acquisition_record` + the `uri` acquisition mapping), and that is not
 * ceremony: the library derives the resource id FROM THE URI, so pasting the
 * same link twice is one entry, and it records the acquisition as a D12 event
 * whose method says what actually happened — the URI was acquired, not the
 * object. **No bytes are copied and no object store is touched.**
 *
 * Without a bridge it still lands, locally, and SAYS so. Losing the paste
 * because a sidecar is not running would be the wrong trade — but so would
 * pretending the entry carries an acquisition it does not have.
 */
/**
 * HDR2 · the `+ URI` FORM, hanging from the one chip in the window header.
 *
 * Four controls that are a single gesture: the address, which fence it comes
 * from, how it is reached, and the verb. They were four boxes in `#shelf-bar`,
 * and a row that holds two inputs and two selects is a row nobody reads — so
 * the rule this pass follows is "one row of chrome", not "one row that contains
 * everything". A form is allowed to be a form.
 *
 * BUILT ON OPEN, which is not a detail. The access vocabulary comes from
 * s3Dgraphy and arrives only when the table has answered once; the singleton
 * `<select>` this replaces had to decide whether to refill itself by comparing
 * its own options against the library's answer, and the first version of that
 * guard counted them instead — measured, the picker stayed stuck on "open link"
 * for ever. A form born at every opening cannot have that bug.
 *
 * The two choices persist in `shelfUrlScope` / `shelfUriAccess`, so a session
 * that is adding ten comparanda says "comparandum" once.
 */
function openShelfUriForm(anchor: HTMLElement): void {
  const existing = document.getElementById("shelf-uri-form");
  if (existing) {
    existing.remove();
    if (existing.dataset.anchor === anchorKey(anchor)) return;   // toggle off
  }
  const form = document.createElement("div");
  form.id = "shelf-uri-form";
  form.className = "bar-popover shelf-uri-form";
  form.dataset.anchor = anchorKey(anchor);
  document.body.appendChild(form);

  const uri = document.createElement("input");
  uri.type = "text";
  uri.spellcheck = false;
  uri.className = "shelf-uri-input";
  uri.placeholder = t("shelf.uriPlaceholder");
  form.appendChild(uri);

  /** A labelled control. The two labels are the TABLE's own column names, so the
   *  same two facts are called the same thing wherever you meet them. */
  const field = (labelKey: string, control: HTMLElement): void => {
    const wrap = document.createElement("label");
    wrap.className = "shelf-uri-field";
    const caption = document.createElement("span");
    caption.textContent = t(labelKey);
    wrap.append(caption, control);
    form.appendChild(wrap);
  };

  const scope = document.createElement("select");
  scope.className = "shelf-uri-scope";
  for (const value of SHELF_SCOPES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = t(`shelf.scope.${value}`);
    scope.appendChild(option);
  }
  scope.value = shelfUrlScope;
  scope.addEventListener("change", () => {
    shelfUrlScope = scope.value as ShelfScope;
  });
  field("shelf.col.SCOPE", scope);

  const access = document.createElement("select");
  access.className = "shelf-uri-access";
  // the library's vocabulary when it has spoken, the one default until then —
  // and never a second vocabulary invented here, which is the whole point of
  // having asked
  const modes = shelfTable.accessModes.length
    ? shelfTable.accessModes : [shelfUriAccess];
  for (const mode of modes) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = t(`shelf.v.${mode}`, {}, mode);
    access.appendChild(option);
  }
  access.value = shelfUriAccess;
  access.addEventListener("change", () => {
    shelfUriAccess = access.value || "open";
  });
  field("shelf.col.ACCESS", access);

  const go = document.createElement("button");
  go.type = "button";
  go.className = "shelf-uri-go";
  go.textContent = t("shelf.addUri");
  const submit = (): void => {
    void addUrlToShelf(uri.value).then((added) => {
      // it closes when it worked. A form that stays open after a refusal keeps
      // the address you typed, which is exactly what you need to fix it.
      if (added) form.remove();
    });
  };
  go.addEventListener("click", submit);
  uri.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") submit();
  });
  form.appendChild(go);

  const rect = anchor.getBoundingClientRect();
  if (rect.width) {
    form.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
    form.style.top = `${rect.bottom + 4}px`;
  } else {
    // a chip that is not laid out has a zero rect, and pinning to it puts the
    // form in the top-left corner over the app's own menus (measured, in
    // `openStoragePlaces`, which is the other popover a header chip opens)
    form.style.left = "50%";
    form.style.top = "20%";
    form.style.transform = "translateX(-50%)";
  }
  uri.focus();
  // …and it closes the way every menu closes: the next click elsewhere
  setTimeout(() => document.addEventListener("click", function away(event) {
    if (!form.isConnected) {
      document.removeEventListener("click", away);
      return;
    }
    if (!form.contains(event.target as Node)) {
      form.remove();
      document.removeEventListener("click", away);
    }
  }), 0);
}

/**
 * Put an address on the shelf. Answers whether it went on, so the form that
 * called knows whether to close.
 *
 * The URI is a PARAMETER now, not a lookup: there is no singleton `#shelf-url`
 * to read any more, and there are as many forms as there are shelf windows.
 */
async function addUrlToShelf(raw: string): Promise<boolean> {
  const uri = raw.trim();
  if (!uri) return false;
  if (!/^(https?:|s3:)/i.test(uri)) {
    toast(t("shelf.notAUri"));
    return false;
  }
  const answer = await askShelf("/shelf-add-uri", {
    uri,
    access: { mode: shelfUriAccess },
  });
  if (answer) {
    // the library's shelf is the one that counts now: adopt it, so the list and
    // the table cannot disagree about what is on the shelf
    const section = answer.shelf as Record<string, unknown> | null;
    if (section) adoptProjectShelf(section);
    renderShelf();
    const entry = (answer.entry ?? {}) as { name?: string };
    toast(answer.created
      ? t("shelf.added", { name: String(entry.name ?? uri) })
      : t("shelf.uriAlready", { name: String(entry.name ?? uri) }));
    return true;
  }
  const entry = addToShelf({
    locator: uri,
    name: uri.split("/").filter(Boolean).pop() || uri,
    scope: shelfUrlScope,
    // a published URI is somebody else's: it stays at home until asked otherwise
    residency: "reference",
  });
  renderShelf();
  toast(t("shelf.addedNoBridge", { name: entry.name }));
  return true;
}

// ── promote a shelf entry into the study ────────────────────────────────────
//
// The gesture: right-click a row → pick a FACET and where it lands → the entry
// is hatted into the active graph.
//
// The facets and their legal targets come from the CONNECTIONS DATAMODEL
// (`api.attach_candidates` over `/shelf-facets`), and that is what makes this
// dialog honest about something surprising, MEASURED rather than assumed: a
// **Document does not attach to an Epoch**. "Put it in time" is the RM facet's
// business (`has_first_epoch` / `survive_in_epoch`); a Document attaches to what
// it DOCUMENTS (a unit, via `has_documentation`) or to the Extractor that reads
// it. So the dialog offers the epochs under `rm` and the units under `document`,
// because that is what the datamodel allows — a picker that offered epochs for a
// Document would be offering an edge the library refuses.

interface ShelfFacets {
  facets: string[];
  candidates: Record<string, Array<{ id: string; name: string;
                                     node_type: string; edge: string }>>;
  graph_id?: string;
}

let shelfPromoteTarget: { id: string; name: string } | null = null;
let shelfFacets: ShelfFacets | null = null;

async function openShelfPromote(id: string, name: string): Promise<void> {
  const modal = document.getElementById("shelf-promote-modal");
  if (!modal) return;
  shelfPromoteTarget = { id, name };
  shelfFacets = null;
  const label = document.getElementById("shelf-promote-what");
  if (label) label.textContent = name || id;
  const status = document.getElementById("shelf-promote-status");
  if (status) status.textContent = t("shelf.promoteAsking");
  modal.classList.remove("hidden");
  const answer = await askShelf("/shelf-facets", {});
  if (!answer) {
    if (status) status.textContent = shelfTableNote ?? BRIDGE_UNREACHABLE;
    return;
  }
  shelfFacets = {
    facets: (answer.facets as string[]) ?? [],
    candidates: (answer.candidates as ShelfFacets["candidates"]) ?? {},
    graph_id: answer.graph_id as string | undefined,
  };
  if (status) {
    status.textContent = t("shelf.promoteInto",
                           { graph: String(shelfFacets.graph_id ?? "") });
  }
  const facetSel = document.getElementById("shelf-promote-facet") as HTMLSelectElement;
  facetSel.textContent = "";
  for (const facet of shelfFacets.facets) {
    const opt = document.createElement("option");
    opt.value = facet;
    opt.textContent = t(`shelf.facet.${facet}`, {}, facet);
    facetSel.appendChild(opt);
  }
  // Document is the default because it is the gesture people asked for; the
  // others are there because the library has them, not because we guessed.
  facetSel.value = shelfFacets.facets.includes("document")
    ? "document" : (shelfFacets.facets[0] ?? "");
  renderShelfPromoteTargets();
}

function renderShelfPromoteTargets(): void {
  const facetSel = document.getElementById("shelf-promote-facet") as HTMLSelectElement;
  const targetSel = document.getElementById("shelf-promote-target") as HTMLSelectElement;
  const hint = document.getElementById("shelf-promote-hint");
  if (!facetSel || !targetSel) return;
  const facet = facetSel.value;
  const candidates = shelfFacets?.candidates[facet] ?? [];
  targetSel.textContent = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = t("shelf.promoteNoTarget");
  targetSel.appendChild(none);
  for (const c of candidates) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name || c.id} · ${c.node_type} (${c.edge})`;
    targetSel.appendChild(opt);
  }
  targetSel.disabled = !candidates.length;
  if (hint) {
    // The honest sentence, per facet — including the one that says why there is
    // nothing to pick.
    hint.textContent = candidates.length
      ? t(`shelf.promoteHint.${facet}`, {}, "")
      : t("shelf.promoteNothing", { facet: t(`shelf.facet.${facet}`, {}, facet) });
  }
}

async function confirmShelfPromote(): Promise<void> {
  if (!shelfPromoteTarget) return;
  const facetSel = document.getElementById("shelf-promote-facet") as HTMLSelectElement;
  const targetSel = document.getElementById("shelf-promote-target") as HTMLSelectElement;
  const status = document.getElementById("shelf-promote-status");
  const facet = facetSel?.value || "document";
  const attach = targetSel?.value || "";
  const extra: Record<string, unknown> = {
    resource_id: shelfPromoteTarget.id,
    facet,
    graph_id: shelfFacets?.graph_id,
  };
  if (attach) {
    // the RM facet takes EPOCHS (ordered: the first becomes has_first_epoch);
    // every other facet takes a single attach target. The library's own shapes.
    if (facet === "rm") extra.epochs = [attach];
    else extra.attach_to = attach;
  }
  if (status) status.textContent = t("shelf.promoting");
  const answer = await askShelf("/shelf-hat", extra);
  if (!answer) {
    if (status) status.textContent = shelfTableNote ?? BRIDGE_UNREACHABLE;
    return;
  }
  // Adopt what the library made: the facet node plus the reference-by-stable-ID
  // to the resource. `addSubgraph` is additive and does not re-stamp — the nodes
  // were made elsewhere (see its own note), and the promotion is a checkpoint on
  // this side, so ⌘Z undoes it.
  const graph = (answer.graph as { graph?: { nodes?: EmNode[]; edges?: EmEdge[] } })?.graph;
  const slot = emtree.slots.find((sl) =>
    String((sl.store.doc.graph as Record<string, unknown>).graph_id ?? sl.id)
    === String(answer.graph_id ?? "")) ?? emtree.active();
  if (graph && slot) {
    const added = slot.store.addSubgraph(graph.nodes ?? [], graph.edges ?? []);
    logInfo(t("shelf.promoted", {
      name: shelfPromoteTarget.name,
      facet: t(`shelf.facet.${facet}`, {}, facet),
      nodes: String(added.nodes), edges: String(added.edges),
    }));
    toast(t("shelf.promoted", {
      name: shelfPromoteTarget.name,
      facet: t(`shelf.facet.${facet}`, {}, facet),
      nodes: String(added.nodes), edges: String(added.edges),
    }));
  }
  closeShelfPromote();
  refreshEMTree();
  draw();
  void refreshShelfTable();
}

function closeShelfPromote(): void {
  document.getElementById("shelf-promote-modal")?.classList.add("hidden");
  shelfPromoteTarget = null;
}

function saveShelf(): void {
  const doc = shelfToDocument();
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${shelfMeta().name.replace(/\s+/g, "_") || "shelf"}.shelf.em.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(t("shelf.saved"));
}

function openShelfFile(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.em.json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    let doc: unknown;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      toast(t("shelf.unreadable"));
      return;
    }
    const res = loadShelfDocument(doc);
    if (!res.ok) {
      // A study graph is refused rather than read for whatever resources it
      // happens to hold: opening one "as a shelf" would silently turn its
      // documents into shelf entries, and nobody could tell what they held.
      toast(t("shelf.notAShelf"));
      return;
    }
    renderShelf();
    toast(t("shelf.opened", { n: String(res.count) }));
  });
  input.click();
}

/** Send a shelf resource to the Annotator — the gesture that makes the
 *  annotator usable: "select a resource" now has somewhere to select FROM. */
function annotateShelfEntry(entry: ShelfEntry): void {
  const win = windowsOf().find((w) => w.type === "annotator");
  if (!win) {
    toast(t("shelf.noAnnotator"));
    return;
  }
  setAnnotatorShelfSource(entry);
  selectWindow(win.id);
  toast(t("shelf.sentToAnnotator", { name: entry.name }));
}

// ── A2 · THE ANNOTATOR · an image, and the claims traced on it ──────────────
//
// The gesture is small and the meaning is not: tracing "this and not that" on a
// photograph is already an interpretation, so an annotation is never a coloured
// box — it is a CLAIM, and the claim needs the chain that makes it readable by
// somebody else (extractor → property → unit, plus the region as its evidence).
//
// None of that semantics lives here. s3Dgraphy builds the chain, the bridge
// carries the call, and this window does the two things a canvas is for: show
// the picture, and take the gesture. What it must get right is the COORDINATES —
// normalised [0,1], the same numbers the datamodel stores — so nothing on this
// side ever writes down a pixel size that a re-export would invalidate.

/**
 * SHELF1/W1 · load a bridge-served file through CORS, as a `blob:` URL.
 *
 * The security fix has a consequence, and it is not a small one: `<img src>` and
 * `<object data>` are **no-cors** requests — they carry NO `Origin` — and the
 * bridge is on another port, so the browser calls them `cross-site`. Which is
 * exactly the shape the new `/fs` gate refuses… including when the request comes
 * from EMStudio itself. Measured: 403 for the `<img>`, 200 for a `fetch`.
 *
 * So the bytes are fetched with `fetch` (which DOES send Origin, and gets the
 * reflected CORS header back) and handed to the element as a `blob:` URL. One
 * path for images and PDFs alike, and no exception carved into the gate — the
 * alternative was allowing `Sec-Fetch-Site: cross-site` again, which is the hole
 * itself.
 *
 * Cost, declared: the file passes through memory. Fine for a preview, wrong for
 * a 200 MB orthophoto — the day that matters, this is where a range-request or a
 * server-side thumbnail goes.
 */
const bridgeBlobCache = new Map<string, string>();

async function bridgeBlobUrl(url: string): Promise<string> {
  if (!url.includes("/fs/file?path=")) return url;   // not ours: leave it alone
  const cached = bridgeBlobCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const objectUrl = URL.createObjectURL(await res.blob());
  bridgeBlobCache.set(url, objectUrl);
  return objectUrl;
}

/** The tools the annotator offers. `lasso`/`mask` are declared and disabled:
 *  phase 2, and a tool that is coming is better announced than discovered. */
const ANNOTATOR_TOOLS = [
  { id: "rect", glyph: "▭", labelKey: "tool.rect" },
  { id: "polygon", glyph: "⬟", labelKey: "tool.polygon" },
  { id: "lasso", glyph: "✎", labelKey: "tool.lasso", disabled: "tool.phase2" },
] as const;

type AnnotatorTool = (typeof ANNOTATOR_TOOLS)[number]["id"];

/** The region being traced, before it is committed. Normalised, always. */
interface AnnotatorDraft {
  shape_kind: "rect" | "polygon";
  rect?: [number, number, number, number];
  points?: Array<[number, number]>;
}

let annotatorTool: AnnotatorTool = "rect";
let annotatorDraft: AnnotatorDraft | null = null;
/** The image the window is on: resolved once per source, like the viewer's. */
let annotatorImage: { key: string; nodeId: string; title: string; url: string;
                      path?: string; page: number; iiif?: boolean } | null = null;
let annotatorLoading: string | null = null;

/** SHELF1 · a resource PICKED FROM THE SHELF, when there is one.
 *
 * Before this the annotator followed the selection and nothing else, so
 * "select a document or a resource with an image" had nowhere to select FROM —
 * the empty state was a dead end. The shelf is that somewhere. An explicit pick
 * wins over the selection until it is cleared: you chose this picture, and a
 * click on the canvas should not take it away from under you.
 */
let annotatorShelfSource: ShelfEntry | null = null;

function setAnnotatorShelfSource(entry: ShelfEntry | null): void {
  annotatorShelfSource = entry;
  annotatorImage = null;        // force the picture to be resolved again
  annotatorDraft = null;
  renderAnnotator();
}

/** How wide the annotator's picture is on screen, in CSS pixels. What the Image
 *  API is asked for — not the file's own size, which is the point. */
function srcWidthForAnnotator(): number {
  const host = document.getElementById("annotator-frame")?.parentElement ?? null;
  const width = host?.clientWidth ?? 0;
  return width > 64 ? width : 1024;
}

/** What `info.json` said about the picture on screen, once it has answered.
 *  Filled asynchronously; until then the annotator asks for `max`, which always
 *  works. */
let annotatorInfo: { key: string; info: ImageInfo | null } | null = null;

/** The Image API URL for the picture on screen, or null when there is no image
 *  service, no checksum, or the resource is not an image — in which case the
 *  annotator does exactly what it did before. */
function iiifImageUrlFor(node: EmNode | null, cssWidth: number): string | null {
  if (!node || !isImageResource(node)) return null;
  const base = iiifBase();
  const key = `${base}|${node.id}`;
  if (annotatorInfo?.key !== key) {
    // ask once, then redraw: the size of the source decides how much of it is
    // worth fetching, and it is the image server that knows
    void fetchImageInfo(node, base).then((info) => {
      annotatorInfo = { key, info };
      if (info) renderAnnotator();
    });
  }
  return fittedUrl(node, base, cssWidth,
                   annotatorInfo?.key === key ? annotatorInfo.info : null);
}

/** The node the annotator is showing — the current element, as everywhere else. */
function annotatorNodeId(): string | null {
  return selectedId ?? null;
}

function annotatorMode(): string {
  return winModeOf(activeWin());
}

/**
 * Resolve the picture, then draw. The image is fetched THROUGH THE BRIDGE for a
 * disk path (W1: a page served over http cannot read one — measured), and
 * straight from the URL when the node already carries one.
 */
function renderAnnotator(): void {
  const win = activeWin();
  if (win.type !== "annotator") return;
  const img = document.getElementById("annotator-image") as HTMLImageElement | null;
  const title = document.getElementById("annotator-title");
  const hint = document.getElementById("annotator-hint");
  if (!img || !title || !hint) return;

  // The Mode reaches the CSS as an attribute, so the difference between looking
  // and tracing is `pointer-events` and nothing else: the overlay keeps exactly
  // the same geometry in every mode, which is the SHELL-FIX rule (a surface that
  // changes size when you change mode makes a mode switch a layout change).
  // the Mode reaches the CSS on the STAGE of the instance that traces — the
  // element `ensureAnnotatorFrame` built — not on a singleton view that no
  // longer exists. Still `pointer-events` and nothing else: a mode change must
  // never be a layout change (SHELL-FIX).
  document.getElementById("annotator-frame")?.parentElement
    ?.setAttribute("data-mode", annotatorMode());

  // SHELF1 · the shelf pick wins over the selection. The annotator used to have
  // only the selection, so its empty state was a dead end ("select a resource"
  // — from where?). Now the shelf is the wide list you pick from, and the pick
  // stays put until it is cleared.
  const picked = annotatorShelfSource;
  const nodeId = picked ? null : annotatorNodeId();
  const node = nodeId ? (store?.node(nodeId) ?? null) : null;
  const src = picked ? picked.locator : viewerSourceOf(node);
  hint.textContent = "";

  if (!src) {
    annotatorImage = null;
    img.removeAttribute("src");
    img.classList.add("hidden");
    title.textContent = shelfEntries().length
      ? t("annotator.pickFromShelf")
      : t("annotator.noImage");
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
    return;
  }

  // A2/IIIF · when the picture is a published image and this deployment has an
  // Image API, the annotator asks THE IMAGE SERVER for it, at the size of its
  // own viewport, instead of pulling the original through a blob. A 200-megapixel
  // scan then costs what fits on screen — which is the difference between an
  // annotator that opens and one that hangs.
  //
  // The geometry is untouched by this: regions are normalised [0,1], so which
  // rendition is on screen changes nothing about what is recorded.
  const service = iiifBase() ? iiifImageUrlFor(node, srcWidthForAnnotator()) : null;
  const key = `${picked ? picked.id : nodeId}|${service ?? src}`;
  if (annotatorImage?.key === key) {
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
    return;
  }
  if (service) {
    annotatorImage = {
      key, nodeId: picked ? picked.id : nodeId!,
      title: picked ? picked.name : String(node?.name || nodeId),
      url: service, page: 0, iiif: true,
    };
    img.classList.remove("hidden");
    img.src = service;              // public by design: an Image API needs no token
    title.textContent = annotatorImage.title;
    hint.textContent = annotatorMode() === "annotate"
      ? t("annotator.hintDraw") : t("annotator.hintView");
    refreshAnnotatorIiif();
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
    return;
  }

  const show = (rawUrl: string, path?: string): void => {
    annotatorImage = {
      key,
      // A shelf pick has no node in the graph yet — the region will be attached
      // to the resource by id when it is committed (the bridge promotes it to a
      // Document, W1/A2). Using the shelf entry's id keeps that one identity.
      nodeId: picked ? picked.id : nodeId!,
      title: picked ? picked.name : String(node?.name || nodeId),
      url: rawUrl, path, page: 0,
    };
    img.classList.remove("hidden");
    // through CORS (see `bridgeBlobUrl`): a bare <img src> to the bridge is a
    // no-cors cross-site request and the /fs gate refuses it — rightly.
    void bridgeBlobUrl(rawUrl)
      .then((src) => { img.src = src; })
      .catch(() => { img.removeAttribute("src"); title.textContent = t("viewer.unreachable"); });
    title.textContent = annotatorImage.title;
    hint.textContent = annotatorMode() === "annotate"
      ? t("annotator.hintDraw") : t("annotator.hintView");
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
  };

  if (viewerIsFetchable(src)) {
    show(src);
    return;
  }
  // a disk path: the bridge is the only thing that can read it
  if (annotatorLoading === key) return;
  annotatorLoading = key;
  title.textContent = t("storage.loading");
  void (async () => {
    try {
      const collection = await collectionFromFile(src);
      annotatorLoading = null;
      if (activeWin().id !== win.id || annotatorNodeId() !== nodeId) return;
      const item = collection.items[0];
      if (item) show(item.url, item.path);
    } catch (err) {
      annotatorLoading = null;
      if (activeWin().id !== win.id) return;
      annotatorImage = null;
      img.classList.add("hidden");
      title.textContent = err instanceof BridgeDownError
        ? t("storage.bridgeDown")
        : t("viewer.outsideRoots");
      drawAnnotatorOverlay();
    }
  })();
}

/** Every region already in the graph for the image on screen. Read from the
 *  DOCUMENT, not from a list this window keeps: after a commit the region is a
 *  node like any other, and drawing it from the graph is what makes "the
 *  annotation is in the graph" visible instead of merely asserted. */
/**
 * SURFACE-AUDIT · the annotator's PICTURE, into the boxes of a window that is
 * not the one tracing.
 *
 * What such a window can honestly show: the image it is on, and how many
 * regions have been traced on it. Not the overlay — the overlay is a
 * canvas sized to `#annotator-image` with the draft state of a gesture in
 * progress, and a second one would be a second annotator. This is the picture,
 * so the window is not blank, plus one line saying where the tracing is.
 */
/**
 * ONE CONSTRUCTOR, and the flag is `tools`.
 *
 * `tools` is the element the tracing instance builds for its own controls and
 * `null` for any other. So the difference between the annotator that traces and
 * an annotator window that is simply showing the picture is an ARGUMENT, not a
 * second function reached through a branch in `buildSecondarySurface` — which is
 * what §2 asked for, and the difference between a limit and a defect. The limit
 * itself is unchanged and still true: tracing needs one image element, one
 * overlay and one in-progress gesture (`ANNOTATOR_CAPABILITIES`).
 */
function renderAnnotatorInto(stage: HTMLElement, caption: HTMLElement,
                             win: Win, tools: HTMLElement | null): void {
  if (tools) {
    // the instance that traces: build the frame the gestures are wired to, once
    ensureAnnotatorFrame(stage);
    renderAnnotator();
    renderAnnotatorTools(tools);
    return;
  }
  renderAnnotatorPictureInto(stage, caption);
  void win;
}

/**
 * The tracing frame — the image, the overlay, and the gestures on it.
 *
 * Built into the tracing instance's own stage instead of living in the markup,
 * and built ONCE: `initAnnotatorGestures` binds to the overlay, and the module
 * keeps an in-progress draft against it. The ids survive because there is
 * exactly one of these by declaration, and the declaration is readable
 * (`ANNOTATOR_CAPABILITIES`) rather than hidden in an `if`.
 */
function ensureAnnotatorFrame(stage: HTMLElement): void {
  if (stage.querySelector("#annotator-frame")) return;
  stage.textContent = "";
  const frame = document.createElement("div");
  frame.id = "annotator-frame";
  const img = document.createElement("img");
  img.id = "annotator-image";
  img.alt = "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "annotator-overlay";
  svg.setAttribute("viewBox", "0 0 1 1");
  svg.setAttribute("preserveAspectRatio", "none");
  frame.append(img, svg);
  stage.appendChild(frame);
  initAnnotatorGestures();   // wired to THIS overlay, the moment it exists
}

function renderAnnotatorPictureInto(stage: HTMLElement,
                                    caption: HTMLElement): void {
  stage.textContent = "";
  caption.textContent = "";
  const image = annotatorImage;
  if (!image) {
    stage.appendChild(viewerEmpty(shelfEntries().length
      ? t("annotator.pickFromShelf") : t("annotator.noImage")));
    return;
  }
  const img = new Image();
  img.className = "tile-annot-image";
  img.src = image.url;
  img.alt = image.title;
  img.loading = "lazy";
  stage.appendChild(img);
  const n = annotatorRegions().length;
  caption.textContent = `${image.title} · ${t("annotator.regions", { n: String(n) })}`;
}

function annotatorRegions(): EmNode[] {
  const image = annotatorImage;
  if (!image || !store) return [];
  return store.doc.graph.nodes.filter((n) => {
    if (n.node_type !== "annotation_region") return false;
    const data = (n.data ?? {}) as Record<string, unknown>;
    const page = Number(data.page ?? 0);
    return data.resource_id === image.nodeId && page === image.page;
  });
}

// ── A2/IIIF · the interoperability corner ────────────────────────────────────
//
// Three gestures, and all three are the SAME claim seen from different sides:
// the regions of this image are nodes in the em.json, and W3C Web Annotation /
// IIIF are how they travel. Nothing here writes a second copy of anything.

/** Show the corner only when the picture really is served by an Image API. */
function refreshAnnotatorIiif(): void {
  const corner = document.getElementById("annotator-iiif");
  if (!corner) return;
  corner.classList.toggle("hidden", !annotatorImage?.iiif);
}

/** The node the annotator is showing, when it is a graph resource. */
function annotatorResourceNode(): EmNode | null {
  const id = annotatorImage?.nodeId;
  return id ? (store?.node(id) ?? null) : null;
}

/** The image's pixel size, as the <img> reports it once loaded. Used to project
 *  a region into PIXEL selectors, which is what viewers implement; without it
 *  the projection falls back to percentages, which are exact anyway. */
function annotatorPixelSize(): { width: number; height: number } | null {
  // info.json first: the <img> holds whatever RENDITION was requested, and a
  // selector in the pixels of a downscaled copy would put the region in the
  // wrong place for everybody else.
  if (annotatorInfo?.info) return annotatorInfo.info;
  const img = document.getElementById("annotator-image") as HTMLImageElement | null;
  if (!img?.naturalWidth || !img.naturalHeight) return null;
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/** EMIT · this image's regions as W3C Web Annotations, on the clipboard.
 *
 *  An AnnotationPage rather than a bare list: it is what a viewer expects to be
 *  handed, and it is what Mirador reads. The target is the image's own IIIF
 *  service id, so the annotations mean something away from this app. */
function copyWebAnnotations(): void {
  const resource = annotatorResourceNode();
  const service = iiifImageService(resource, iiifBase());
  const regions = annotatorRegions();
  if (!service || !regions.length) {
    toast(t("annotator.iiifNothing"));
    return;
  }
  const size = annotatorPixelSize();
  const page = {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    id: `${service.id}/annotations`,
    type: "AnnotationPage",
    items: regions.map((r) => regionToWebAnnotation(r, service.id, size)),
  };
  const text = JSON.stringify(page, null, 2);
  void navigator.clipboard?.writeText(text).catch(() => { /* no clipboard: below */ });
  logInfo(text);
  toast(t("annotator.iiifCopied", { n: String(regions.length) }));
}

/** CONSUME · a Web Annotation somebody else made becomes a region of the graph.
 *
 *  Written through the store's ordinary stamped path, so an annotation that
 *  arrives from Mirador is indistinguishable — in provenance terms — from one
 *  traced here: it has an author, a time, and a place in the CRDT. That is the
 *  half of "round-trippable" that matters, and the half most tools skip. */
function pasteWebAnnotation(): void {
  const image = annotatorImage;
  if (!image || !store) return;
  const raw = window.prompt(t("annotator.iiifPastePrompt"));
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    toast(t("annotator.iiifBadJson"));
    return;
  }
  const items = Array.isArray((parsed as { items?: unknown[] })?.items)
    ? ((parsed as { items: unknown[] }).items)
    : [parsed];
  const size = annotatorPixelSize();
  let made = 0;
  for (const item of items) {
    try {
      const region = webAnnotationToRegion(item as never, size);
      const id = region.id || store.newId();
      if (store.node(id)) continue;              // already here: not news
      store.addNode({
        id, node_type: "annotation_region",
        name: region.name || t("annotator.importedRegion"),
        data: {
          shape_kind: region.shape_kind,
          ...(region.rect ? { rect: region.rect } : {}),
          ...(region.points ? { points: region.points } : {}),
          page: region.page ?? 0,
          resource_id: image.nodeId,
        },
      } as EmNode);
      store.addEdge(id, image.nodeId, "is_on_resource");
      made += 1;
    } catch (err) {
      logInfo(String(err));
    }
  }
  toast(made ? t("annotator.iiifPasted", { n: String(made) })
             : t("annotator.iiifNoRegion"));
  renderAnnotator();
}

/** The manifest of this image, as a URL a viewer can be pointed at.
 *
 *  Built by StratiGraph Server from the ROOM's graph (`/v1/rooms/…/iiif/…/manifest`),
 *  because a manifest must be fetchable by the viewer — a document this page
 *  holds in memory is not something Mirador can open. Without a room there is
 *  no such URL, and the button says so instead of opening an empty viewer. */
function manifestUrlForAnnotator(): string | null {
  const image = annotatorImage;
  const settings = getSettings();
  if (!image || !sync.room || !settings.sync.hubUrl) return null;
  const base = settings.sync.hubUrl.replace(/\/+$/, "");
  return `${base}/v1/rooms/${encodeURIComponent(sync.room)}/iiif/`
    + `${encodeURIComponent(image.nodeId)}/manifest`;
}

/** Open this image, with its regions, in Mirador. */
function openInMirador(): void {
  const manifest = manifestUrlForAnnotator();
  if (!manifest) {
    toast(t("annotator.miradorNeedsRoom"));
    return;
  }
  const viewer = miradorBase();
  const url = `${viewer}${viewer.includes("?") ? "&" : "?"}`
    + `iiif-content=${encodeURIComponent(manifest)}`;
  window.open(url, "_blank", "noopener");
}

/** Geometry of a region node, in normalised coordinates. */
function regionGeometry(node: EmNode): AnnotatorDraft | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const kind = data.shape_kind;
  if (kind === "rect" && Array.isArray(data.rect) && data.rect.length === 4) {
    return { shape_kind: "rect", rect: (data.rect as number[]).slice(0, 4) as
             [number, number, number, number] };
  }
  if (kind === "polygon" && Array.isArray(data.points)) {
    return { shape_kind: "polygon",
             points: (data.points as number[][]).map((p) => [p[0], p[1]] as [number, number]) };
  }
  return null;
}

/**
 * Draw the overlay in NORMALISED coordinates.
 *
 * The SVG has `viewBox="0 0 1 1"` and stretches over the picture, so a region is
 * written with the same numbers the datamodel stores — no conversion, and
 * nothing to get wrong when the image is displayed at another size. The cost is
 * that strokes stretch with it, which is why the shapes carry
 * `vector-effect: non-scaling-stroke`.
 */
function drawAnnotatorOverlay(): void {
  const svg = document.getElementById("annotator-overlay");
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const NS = "http://www.w3.org/2000/svg";

  const shape = (geom: AnnotatorDraft, className: string): SVGElement | null => {
    if (geom.shape_kind === "rect" && geom.rect) {
      const [x, y, w, h] = geom.rect;
      const el = document.createElementNS(NS, "rect");
      el.setAttribute("x", String(x));
      el.setAttribute("y", String(y));
      el.setAttribute("width", String(Math.max(w, 0)));
      el.setAttribute("height", String(Math.max(h, 0)));
      el.setAttribute("class", className);
      return el;
    }
    if (geom.shape_kind === "polygon" && geom.points?.length) {
      const el = document.createElementNS(NS, "polygon");
      el.setAttribute("points", geom.points.map(([x, y]) => `${x},${y}`).join(" "));
      el.setAttribute("class", className);
      return el;
    }
    return null;
  };

  for (const region of annotatorRegions()) {
    const geom = regionGeometry(region);
    if (!geom) continue;
    const el = shape(geom, "annot-region");
    if (el) {
      el.setAttribute("data-region", region.id);
      svg.appendChild(el);
    }
  }
  if (annotatorDraft) {
    const el = shape(annotatorDraft, "annot-draft");
    if (el) svg.appendChild(el);
    // a polygon in progress shows its vertices, or you cannot tell where the
    // next click will attach
    if (annotatorDraft.shape_kind === "polygon") {
      for (const [x, y] of annotatorDraft.points ?? []) {
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("cx", String(x));
        dot.setAttribute("cy", String(y));
        dot.setAttribute("r", "0.006");
        dot.setAttribute("class", "annot-vertex");
        svg.appendChild(dot);
      }
    }
  }
}

/** Pointer position → normalised coordinates of the IMAGE, clamped to it. */
function annotatorPoint(e: PointerEvent | MouseEvent): [number, number] | null {
  const svg = document.getElementById("annotator-overlay");
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  return [clamp((e.clientX - box.left) / box.width),
          clamp((e.clientY - box.top) / box.height)];
}

/**
 * The tracing gestures, wired ONCE on the overlay (it is a singleton in the
 * area, like every other surface). Only Mode `annotate` draws: in `view` the
 * same picture is there to be looked at, and a window that drew whenever you
 * dragged would make looking dangerous.
 */
function initAnnotatorGestures(): void {
  const svg = document.getElementById("annotator-overlay");
  if (!svg) return;
  let dragging = false;
  let origin: [number, number] | null = null;

  svg.addEventListener("pointerdown", (e) => {
    if (annotatorMode() !== "annotate" || !annotatorImage) return;
    const p = annotatorPoint(e as PointerEvent);
    if (!p) return;
    e.preventDefault();
    if (annotatorTool === "rect") {
      dragging = true;
      origin = p;
      annotatorDraft = { shape_kind: "rect", rect: [p[0], p[1], 0, 0] };
      (svg as unknown as Element).setPointerCapture?.((e as PointerEvent).pointerId);
    } else if (annotatorTool === "polygon") {
      // click to add a vertex; the polygon closes from the panel or with Enter,
      // because "double-click to close" and "click to add" fight each other on
      // the last vertex.
      const points = annotatorDraft?.points ?? [];
      annotatorDraft = { shape_kind: "polygon", points: [...points, p] };
    }
    drawAnnotatorOverlay();
    // The panel is NOT opened here. It used to be, and the bug was instructive:
    // it opened on pointerDOWN, took its space, and the picture shrank UNDER THE
    // POINTER — so the rest of the drag was measured against a box that had
    // changed size, and a 35%-tall gesture recorded as 70%. A surface must not
    // resize while a gesture is being measured against it. (It is also an
    // overlay now, so even opening it late moves nothing.)
    if (annotatorTool === "polygon") renderAnnotatorPanel();
  });

  svg.addEventListener("pointermove", (e) => {
    if (!dragging || !origin) return;
    const p = annotatorPoint(e as PointerEvent);
    if (!p) return;
    // dragged in any direction: the rect is normalised so w/h stay positive,
    // which the datamodel requires and a drag up-left would otherwise break
    annotatorDraft = {
      shape_kind: "rect",
      rect: [Math.min(origin[0], p[0]), Math.min(origin[1], p[1]),
             Math.abs(p[0] - origin[0]), Math.abs(p[1] - origin[1])],
    };
    drawAnnotatorOverlay();
  });

  const endDrag = (): void => {
    if (!dragging) return;
    dragging = false;
    origin = null;
    const rect = annotatorDraft?.rect;
    // a click, not a drag: no region. Without this every stray click on the
    // picture would open the panel for a zero-sized region.
    if (rect && (rect[2] < 0.005 || rect[3] < 0.005)) annotatorDraft = null;
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  window.addEventListener("keydown", (e) => {
    if (activeWin().type !== "annotator") return;
    if (e.key === "Escape" && annotatorDraft) {
      annotatorDraft = null;
      drawAnnotatorOverlay();
      renderAnnotatorPanel();
    }
  });
}

/** The left panel of an Annotator window: its TOOLS.
 *
 * U2 · this is the generalisation of `RESOURCE_PROVIDERS`. The registry never
 * said "the node types" — it says "what this window OFFERS", which for a Graph
 * is the palette, for a Narrative the story blocks, and here the ways of
 * tracing. Nothing about the panel had to change to hold a different offer.
 */
function renderAnnotatorTools(host: HTMLElement): void {
  // …into an EMPTY host. It used to be called once, into a resources panel that
  // `buildResourcePanel` had just cleared; now the annotator surface calls it on
  // every refresh, and without this the tools stacked up — measured: two copies
  // of "Tracing tools" after the first repaint.
  host.textContent = "";
  const box = document.createElement("div");
  box.className = "annot-tools";
  const heading = document.createElement("div");
  heading.className = "palette-heading";
  heading.textContent = t("annotator.tools");
  box.appendChild(heading);
  for (const tool of ANNOTATOR_TOOLS) {
    const btn = document.createElement("button");
    btn.className = "annot-tool" + (annotatorTool === tool.id ? " current" : "");
    btn.dataset.tool = tool.id;
    btn.innerHTML = `<span class="annot-tool-glyph">${tool.glyph}</span>` +
                    `<span class="annot-tool-label">${escapeHtml(t(tool.labelKey))}</span>`;
    if ("disabled" in tool && tool.disabled) {
      btn.disabled = true;
      btn.title = t(tool.disabled);
    } else {
      btn.addEventListener("click", () => {
        annotatorTool = tool.id as AnnotatorTool;
        annotatorDraft = null;
        drawAnnotatorOverlay();
        // ONE SURFACE · the tool palette is a RESOURCE PANEL, and repainting one
        // is not a change to the arrangement. This used to re-lay the whole
        // workspace out to redraw six buttons.
        renderResourcePanels();
        renderAnnotatorPanel();
      });
    }
    box.appendChild(btn);
  }
  const note = document.createElement("p");
  note.className = "annot-tools-note";
  note.textContent = t("annotator.toolsNote");
  box.appendChild(note);
  host.appendChild(box);
}

// ── A2 · "what am I extracting?" — the panel that turns a shape into a claim ──
//
// The question is not decoration: the same traced rectangle means a different
// thing depending on what is being read out of it (the extent of a unit, a
// measurement, a state of conservation). So the property TYPE is asked for
// every time and never defaulted — the bridge refuses a call without one.

function renderAnnotatorPanel(): void {
  const panel = document.getElementById("annotator-panel");
  if (!panel) return;
  const win = activeWin();
  if (win.type !== "annotator" || !annotatorDraft || !annotatorImage) {
    panel.classList.add("hidden");
    panel.textContent = "";
    return;
  }
  if (panel.dataset.open === "1") {
    // Built already — keep whatever was typed, but the GEOMETRY is not typed: it
    // is the gesture, and it must read as the gesture actually is.
    const line = panel.querySelector(".annot-geometry");
    if (line) line.textContent = describeDraft(annotatorDraft);
    return;
  }
  panel.dataset.open = "1";
  panel.classList.remove("hidden");
  panel.textContent = "";

  const title = document.createElement("div");
  title.className = "annot-panel-title";
  title.textContent = t("annotator.whatAreYouExtracting");
  panel.appendChild(title);

  const field = (labelKey: string, control: HTMLElement): void => {
    const wrap = document.createElement("label");
    wrap.className = "annot-field";
    const span = document.createElement("span");
    span.textContent = t(labelKey);
    wrap.append(span, control);
    panel.appendChild(wrap);
  };

  // TARGET — the stratigraphic nodes of this graph, from the graph itself
  const target = document.createElement("select");
  target.className = "annot-input";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = t("annotator.noTarget");
  target.appendChild(none);
  const units = (store?.doc.graph.nodes ?? [])
    .filter((n) => isStratigraphicType(n.node_type))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  for (const unit of units) {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = `${unit.name} · ${unit.node_type}`;
    target.appendChild(option);
  }
  if (selectedIds.size === 1) {
    const only = [...selectedIds][0];
    if (units.some((u) => u.id === only)) target.value = only;
  }
  field("annotator.target", target);

  // PROPERTY TYPE — the qualia vocabulary, never a hand-written list.
  //
  // NO DEFAULT, on purpose, and the first version taught me why twice over: it
  // pre-selected `"material"`, which is not a term in the vocabulary at all (the
  // id is `material_type`), so the select silently held "" and the commit was
  // refused by the bridge. Hardcoding an EM term is what ADR-001 forbids — and
  // even a VALID default would be wrong here, because "what am I extracting" is
  // the question this panel exists to ask. Answering it on the reader's behalf
  // would put a word in their mouth that travels into the graph as a claim.
  const ptype = document.createElement("select");
  ptype.className = "annot-input";
  const choose = document.createElement("option");
  choose.value = "";
  choose.textContent = t("annotator.choosePropertyType");
  ptype.appendChild(choose);
  for (const q of qualiaList()) {
    const option = document.createElement("option");
    option.value = q.id;
    option.textContent = `${q.name} · ${q.categoryLabel}`;
    option.title = q.description ?? q.rationale ?? "";
    ptype.appendChild(option);
  }
  field("annotator.propertyType", ptype);

  // VALUE — the reading itself
  const value = document.createElement("input");
  value.type = "text";
  value.className = "annot-input";
  value.placeholder = t("annotator.valuePlaceholder");
  field("annotator.value", value);

  // AUTHOR — defaults to the graph's own author, which is nearly always right
  const author = document.createElement("input");
  author.type = "text";
  author.className = "annot-input";
  author.value = defaultAnnotationAuthor();
  field("annotator.author", author);

  const geometry = document.createElement("p");
  geometry.className = "annot-geometry";
  geometry.textContent = describeDraft(annotatorDraft);
  panel.appendChild(geometry);

  const actions = document.createElement("div");
  actions.className = "annot-actions";
  const commit = document.createElement("button");
  commit.className = "annot-commit";
  commit.textContent = t("annotator.commit");
  commit.addEventListener("click", () => {
    void commitAnnotation({
      targetUnitId: target.value || null,
      propertyType: ptype.value,
      value: value.value.trim(),
      author: author.value.trim() || null,
      button: commit,
    });
  });
  const cancel = document.createElement("button");
  cancel.className = "annot-cancel";
  cancel.textContent = t("annotator.cancel");
  cancel.addEventListener("click", () => {
    annotatorDraft = null;
    panel.dataset.open = "";
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
  });
  actions.append(commit, cancel);
  panel.appendChild(actions);
}

/** The graph's own author, when it has one — the annotation is nearly always by
 *  whoever is holding the document. */
function defaultAnnotationAuthor(): string {
  try {
    const scope = store?.readGraphScope?.();
    return String((scope as { author?: string } | undefined)?.author ?? "");
  } catch {
    return "";
  }
}

function describeDraft(draft: AnnotatorDraft): string {
  if (draft.shape_kind === "rect" && draft.rect) {
    const [x, y, w, h] = draft.rect.map((v) => Math.round(v * 1000) / 10);
    return `rect ${x}% ${y}% · ${w}×${h}%`;
  }
  return `polygon · ${draft.points?.length ?? 0} ${t("annotator.points")}`;
}

/**
 * Commit: the bridge builds the chain, and the graph receives it.
 *
 * The response is a DELTA, so it lands through `store.addSubgraph` as ONE undo
 * step and the layout survives — the alternative (replacing the document with
 * the returned graph) would throw away the arrangement for a gesture that added
 * four nodes.
 */
async function commitAnnotation(input: {
  targetUnitId: string | null;
  propertyType: string;
  value: string;
  author: string | null;
  button: HTMLButtonElement;
}): Promise<void> {
  if (!store || !annotatorDraft || !annotatorImage) return;
  if (annotatorDraft.shape_kind === "polygon" &&
      (annotatorDraft.points?.length ?? 0) < 3) {
    toast(t("annotator.polygonNeedsThree"));
    return;
  }
  if (!input.propertyType) {
    toast(t("annotator.propertyTypeRequired"));
    return;
  }
  if (!input.value) {
    toast(t("annotator.valueRequired"));
    return;
  }
  const region: Record<string, unknown> = {
    shape_kind: annotatorDraft.shape_kind,
    page: annotatorImage.page,
  };
  if (annotatorDraft.rect) region.rect = annotatorDraft.rect;
  if (annotatorDraft.points) region.points = annotatorDraft.points;

  input.button.disabled = true;
  try {
    const res = await fetch(`${await bridgeUrl()}/annotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc: store.doc,
        image_id: annotatorImage.nodeId,
        region,
        interpretation: input.value,
        property_type: input.propertyType,
        target_unit_id: input.targetUnitId,
        author: input.author,
      }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; nodes?: EmNode[]; edges?: EmEdge[];
          warnings?: string[]; region_id?: string; created?: boolean }
      | null;
    if (!res.ok || !payload?.ok) {
      // the bridge's own words: it knows WHY better than a generic failure does
      toast(payload?.error ?? `bridge ${res.status}`);
      return;
    }
    const added = store.addSubgraph(payload.nodes ?? [], payload.edges ?? []);
    annotatorDraft = null;
    const panel = document.getElementById("annotator-panel");
    if (panel) panel.dataset.open = "";
    drawAnnotatorOverlay();
    renderAnnotatorPanel();
    draw();
    draw();
    renderEmData();
    refreshInspector();
    for (const w of payload.warnings ?? []) toast(w);
    toast(added.nodes || added.edges
      ? t("annotator.committed", { n: String(added.nodes), e: String(added.edges) })
      : t("annotator.alreadyThere"));
  } catch (err) {
    toast(`${t("storage.bridgeDown")} (${err instanceof Error ? err.message : err})`);
  } finally {
    input.button.disabled = false;
  }
}

// ── W1 · STORAGE · the window onto where the bytes live ─────────────────────
//
// Its MODES are the backends — Filesystem now, MinIO in phase 2 — because "one
// window, several ways of looking" is the shape the Graph window already has.
// Adding Samba or WebDAV later is an entry in `WINDOW_MODES` plus a branch in
// `renderStorage`, not a new window type.
//
// Everything it shows comes from the bridge. That is not an implementation
// detail to hide: a page served over http CANNOT read a disk path, so the
// alternative to the bridge is not "a simpler way", it is nothing at all.

/** The drag payload a Storage entry puts on the wire. Deliberately NOT
 *  `PALETTE_MIME`: dropping a FOLDER on a window means "show me this", while
 *  dropping a node type means "create one of these". Two intentions, two mime
 *  types — a single one would make a Graph window try to place a directory. */
const STORAGE_MIME = "application/x-em-storage-entry";

interface StorageDragPayload {
  path: string;
  type: "dir" | "file";
  name: string;
  ext: string;
}

/** The folder a Storage window is showing (per instance — two Storage windows
 *  browse independently). `null` = the roots. */
function storagePath(win: Win): string | null {
  const v = winCurrent(win, "fsPath");
  return typeof v === "string" ? v : null;
}

function setStoragePath(win: Win, path: string | null): void {
  setWinCurrent(win, "fsPath", path);
  // Entering a folder drops the selection: a file selected in another folder is
  // not what this window is showing any more, and a chip naming something
  // off-screen is the kind of half-truth that survives for months.
  setWinCurrent(win, "fsSelected", null);
  renderStorage();
}

// ── the neighbourhood of the selected asset, from the NODE ──────────────────
//
// The chain around a file lives in the node's resident corpus, not in the open
// document, so this is a fetch and not a walk. And it must be a fetch: the
// classification of a chain edge now travels with the datamodel (F1), but the
// EXPANSION is the library's, and re-walking it in TypeScript would be a second
// implementation of the one thing this pass exists to unify.
//
// FOUR STATES, all four visible. A picture that is empty because a request is in
// flight, one that is empty because the node never saw these bytes, one that is
// empty because nobody has signed in, and one that is empty because the node is
// off are four different facts with four different remedies. An interface that
// shows one box for all of them teaches people to distrust it — and showing
// «unreachable» to somebody who has simply not signed in is the same species of
// lie as a fallback answering 200.
type NeighbourhoodState =
  | { status: "idle" }
  | { status: "asking"; digest: string | null; path: string }
  | { status: "answered"; digest: string; answer: NeighbourhoodAnswer }
  //: the node answered, and said WHO ARE YOU. A fourth state and not a flavour
  //: of the third: the remedy is a signature, not a network.
  | { status: "unauthorised"; path: string }
  | { status: "failed"; path: string; why: string };

let dtcNeighbourhood: NeighbourhoodState = { status: "idle" };

// ── …e la stessa domanda posta AL DISCO (DTCEMS1) ───────────────────────────
//
// «Che cosa si sa di questo file?» ha due risposte e vengono da due posti: il
// NODO, interrogato per digest sul suo corpus residente (sopra), e i
// `.stamp.json` che stanno **accanto ai byte**. La seconda funziona offline, su
// una chiavetta, senza nessun server — che è il caso in cui un timbro serve di
// più.
//
// Il disco viene PRIMA quando risolve, e la ragione non è la velocità: quel
// timbro è stato accettato perché **l'impronta di questi byte è quella che
// dichiara**, qui, adesso. La risposta del nodo è vera e più ricca, ma parla di
// un digest e non di un file: le due cose coincidono finché nessuno ha
// riesportato sopra, ed è esattamente il caso che questa notte esiste per non
// sbagliare.
//
// I DUE MODI DI NON AVERE UN TIMBRO sono stati diversi e si dicono diversi:
// `unstamped` è «questi byte non hanno un verbale», `superseded` è «accanto c'è
// un verbale e parla di ALTRI byte» — cioè il file è stato riesportato sopra.
// Un'interfaccia che li confondesse riattaccherebbe la vecchia provenienza ai
// byte nuovi nella testa di chi legge, se non nei dati.
type StampState =
  | { status: "idle" }
  | { status: "reading"; path: string }
  | { status: "stamped"; path: string; chain: StampChain;
      scene: StampScene; digest: string }
  | { status: "unstamped"; path: string }
  | { status: "superseded"; path: string; stamp: Stamp; why: string }
  | { status: "failed"; path: string; why: string };

let diskStamps: StampState = { status: "idle" };
let diskStampSeq = 0;

/** Il referto delle tre classi sull'ultima cartella guardata, quando qualcuno
 *  l'ha chiesto. Non si calcola da solo: costa impronte. */
let folderReport: FolderReport | null = null;

/** LA BOZZA che si sta componendo, o null. Vive accanto a `diskStamps` e non
 *  dentro: quello è ciò che il disco DICE, questa è ciò che una persona sta per
 *  dirgli — e confonderli sarebbe il modo di far sembrare già vero qualcosa che
 *  nessuno ha ancora timbrato. */
let stampDraft: Draft | null = null;
let stampEmitting = false;


/** The DTC picture is the only thing that changed, so this rebuilds and draws —
 *  the pair every other state change in this module uses. */
function redrawNeighbourhood(): void {
  // DTCEMS2 · anche la FINESTRA DEL DISCO, e non solo la tela.
  //
  // Misurato a video: dopo aver timbrato, il pannello continuava a offrire
  // «Componi un passo per…» su un file che ORA ha il suo verbale — perché
  // `renderStorage` era girata prima che la risposta del disco arrivasse, e
  // niente la richiamava. Offrire un gesto che il bridge rifiuterà è il modo di
  // insegnare a una persona che il rifiuto è normale.
  //
  // Sta PRIMA della guardia su `store`: che cosa il disco dica di un file non
  // dipende dall'avere un documento aperto, e la finestra del disco lo mostra
  // comunque.
  renderStorage();
  if (!store) return;
  buildScenes();
  draw();
}
//: which request is current. An answer to a question nobody is asking any more
//: must not overwrite the screen — the same guard the storage listing keeps.
let neighbourhoodSeq = 0;

/** A call to THIS NODE's API, signed the way every other one is.
 *
 *  ONE road, and it is the road that already existed: `hubToken`, in the
 *  `Authorization` header. **Never in the URL** — `handoff.ts` keeps a
 *  `FORBIDDEN` list that refuses `token`, `access_token`, `bearer` and their
 *  companions in a link, because a handoff names a place and never a permission,
 *  and putting a token in a query string right here would contradict that inside
 *  the same codebase. A check reads this file to keep it so.
 *
 *  AND IT REFRESHES, once. `completeSignIn` has always returned a refresh token
 *  and `joinFromHandoff` used to drop it on the floor; it is kept beside the
 *  access token now (same place, one more field) and a 401 is retried after
 *  asking the realm for a new one. An expired token is not a reason to make
 *  somebody sign in again — it is the one failure the protocol has an answer for.
 *
 *  Returns the Response whatever it says, and `null` when no node is configured.
 *  Deciding what a 401 MEANS is the caller's: for the neighbourhood it is «sign
 *  in to see this file's story», which is an invitation and not a fault.
 */
async function nodeFetch(path: string): Promise<Response | null> {
  const base = (getSettings().sync.hubUrl || "").replace(/\/+$/, "");
  if (!base) return null;
  const url = `${base}/v1${path}`;
  const send = (): Promise<Response> => fetch(url, {
    headers: hubToken ? { Authorization: `Bearer ${hubToken}` } : {},
  });
  let answer = await send();
  if (answer.status !== 401 || !hubRefreshToken || !hubAuthConfig) return answer;
  // …the one retry. Silent on purpose: somebody whose token turned over while
  // they were reading should see nothing at all.
  const renewed = await refreshSession(hubAuthConfig, hubRefreshToken);
  if (!renewed.ok || !renewed.token) return answer;
  hubToken = renewed.token;
  hubRefreshToken = renewed.refresh_token || hubRefreshToken;
  return await send();
}

/**
 * Ask the node what it knows about the selected file.
 *
 * Two hops, and both are things that already exist: the BRIDGE hashes the file
 * (`/fs/checksum` — it is the only side that can, since the disk is its side of
 * the wire), and the NODE answers for that digest. A file the node has never
 * seen gets `start: null`, which is a real answer and not an error: «I do not
 * know these bytes» is different from «this file has no story».
 */
async function askNeighbourhood(path: string | null): Promise<void> {
  const seq = ++neighbourhoodSeq;
  if (!path) {
    dtcNeighbourhood = { status: "idle" };
    redrawNeighbourhood();
    return;
  }
  dtcNeighbourhood = { status: "asking", digest: null, path };
  redrawNeighbourhood();
  const digest = await bridgeChecksum(path);
  if (seq !== neighbourhoodSeq) return;
  if (!digest) {
    dtcNeighbourhood = {
      status: "failed", path,
      why: t("dtc.noDigest"),
    };
    redrawNeighbourhood();
    return;
  }
  try {
    const res = await nodeFetch(
      `/corpus/neighbourhood?sha256=${encodeURIComponent(digest)}`);
    if (seq !== neighbourhoodSeq) return;
    if (!res) {
      // NOT «loading forever»: a node nobody named cannot be asked, and saying
      // so is the difference between a bug and a setting.
      dtcNeighbourhood = { status: "failed", path, why: t("dtc.noNode") };
      redrawNeighbourhood();
      return;
    }
    if (res.status === 401 || res.status === 403) {
      // NOT «unreachable». Not signed in and not reachable are two different
      // facts with two different remedies, and showing the second to somebody
      // who simply has not signed in is the same species of lie as the fallback
      // that used to answer 200: it sends them looking in the wrong place.
      //
      // Reached only after `nodeFetch` has already tried a refresh, so this is
      // «there is no session», not «the session lapsed».
      dtcNeighbourhood = { status: "unauthorised", path };
      redrawNeighbourhood();
      return;
    }
    if (!res.ok) {
      // The node's OWN sentence, not an icon: a 404 and a 502 send somebody to
      // two different places, and «could not load» sends them nowhere.
      let why = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body?.detail) why = String(body.detail);
      } catch { /* not JSON: the status is what there is */ }
      if (seq !== neighbourhoodSeq) return;
      dtcNeighbourhood = { status: "failed", path, why };
      redrawNeighbourhood();
      return;
    }
    const answer = (await res.json()) as NeighbourhoodAnswer;
    if (seq !== neighbourhoodSeq) return;
    dtcNeighbourhood = { status: "answered", digest, answer };
  } catch (err) {
    if (seq !== neighbourhoodSeq) return;
    dtcNeighbourhood = { status: "failed", path, why: String((err as Error).message) };
  }
  redrawNeighbourhood();
}

/**
 * Chiedi AL DISCO che cosa si sa di questo file. (DTCEMS1)
 *
 * Il gemello di `askNeighbourhood`, e la simmetria è deliberata: stessa domanda,
 * altra sorgente, stessa strada verso lo schermo. La differenza è che qui non
 * c'è nessun server — si legge `<file>.stamp.json`, si accetta **solo per
 * impronta**, e si risale la catena dentro la cartella.
 *
 * Il `seq` è la stessa guardia dell'altro: una selezione veloce fra tre file
 * lascia tre risposte in volo, e la prima che torna non è la buona.
 */
async function askStamps(path: string | null): Promise<void> {
  const seq = ++diskStampSeq;
  if (!path) {
    diskStamps = { status: "idle" };
    redrawNeighbourhood();
    return;
  }
  diskStamps = { status: "reading", path };
  redrawNeighbourhood();
  try {
    const folder = path.slice(0, path.lastIndexOf("/")) || "/";
    const listing = await fsList(folder);
    const entry = listing.entries.find((e) => e.path === path);
    if (!entry) {
      diskStamps = { status: "failed", path, why: t("stamp.gone") };
      redrawNeighbourhood();
      return;
    }
    const resolution = await resolveFile(entry);
    if (seq !== diskStampSeq) return;
    if (resolution.why === "digest-mismatch" && resolution.rejected) {
      // IL CASO CHE DECIDE IL DISEGNO. Non un timbro rotto: un'affermazione vera
      // su qualcos'altro, e questi byte sono NON TIMBRATI.
      diskStamps = {
        status: "superseded", path, stamp: resolution.rejected,
        why: resolution.note ?? t("stamp.otherBytes"),
      };
      redrawNeighbourhood();
      return;
    }
    if (resolution.why !== "by-digest" || !resolution.stamp) {
      diskStamps = resolution.why === "unreadable"
        ? { status: "failed", path, why: resolution.note ?? "unreadable" }
        : { status: "unstamped", path };
      redrawNeighbourhood();
      return;
    }
    // …e le PISTE accanto a questo file: i posti in cui una ricerca precedente
    // ha già visto qualcosa. Si provano per primi e si accettano comunque per
    // impronta — una pista è un'osservazione, non un'autorità.
    const hints = await readHints(hintsPathFor(path));
    const chain = await walkChain(
      resolution.stamp, path, folder, 6,
      (hints?.seen ?? []).map((h) => h.locator));
    if (seq !== diskStampSeq) return;
    // la FRASE sulla forza dell'identità dei genitori mancanti la dice
    // s3Dgraphy, attraverso il bridge: qui non se ne compone nessuna
    const words = await identityOf(missingDigests(chain));
    if (seq !== diskStampSeq) return;
    diskStamps = {
      status: "stamped", path, chain, digest: resolution.digest ?? "",
      scene: adaptChain(chain, words),
    };
  } catch (err) {
    if (seq !== diskStampSeq) return;
    diskStamps = { status: "failed", path, why: String((err as Error).message) };
  }
  redrawNeighbourhood();
}

/** WHAT IS SELECTED in this Storage window — a path, per window, persisted.
 *
 *  There was no selection at all: a double click entered a folder and that was
 *  the whole vocabulary. A selection is a different act from navigation, it has
 *  to survive the focus moving away (the surface is a NEW element after a tree
 *  rebuild, so per-element state would evaporate — the same reason the scroll
 *  position is kept per window), and the window has to SAY what it is.
 *
 *  And it is not throwaway: it is the selection the acquisition funnel will
 *  consume, where a delivery gets signed. Built as that from the start rather
 *  than as a highlight to be replaced.
 *
 *  FILES only, and deliberately: the two things that read a selection — the DTC
 *  neighbourhood and the funnel — both act on bytes. A selected folder would be
 *  a selection neither of them could use, offered anyway. */
function storageSelected(win: Win): string | null {
  const value = winCurrent(win, "fsSelected");
  return typeof value === "string" ? value : null;
}

function setStorageSelected(win: Win, path: string | null): void {
  if (storageSelected(win) === path) return;
  setWinCurrent(win, "fsSelected", path);
  renderStorage();
  renderAreaHeaders();            // the window says what it is holding
  void askNeighbourhood(path);
  // …e al DISCO, che risponde anche quando non c'è nessun nodo (DTCEMS1)
  void askStamps(path);
}

/**
 * WIN7-STORAGE · **the Storage surface is a host registry now.**
 *
 * It used to be one element (`#storage-view`) mounted in whichever area had the
 * focus, so a workspace with two Storage areas — the Assets tab: the disk on the
 * left, the room's object store in the middle — had exactly one of them alive
 * and the other saying "step in to work here". Which made the one gesture the
 * arrangement exists for impossible: **you cannot drag a file from an area that
 * is not drawn into an area that is not drawn.**
 *
 * So Storage follows the table's pattern (WIN5, `emdata.ts`): one renderer, as
 * many mounts as there are areas. Each host carries the WINDOW it belongs to —
 * which is what makes the two independent: the mode (filesystem / minio) and the
 * folder are per-instance state on the window, and always were.
 *
 * Not the panels' pattern (re-homing a singleton), deliberately: a panel is one
 * element with handlers wired at boot, while a Storage surface is rebuilt from a
 * listing on every render. Copying the second is cheap; copying the first would
 * be two editors for one state.
 */
/** A Storage mount: the window it belongs to and the boxes it writes into.
 *  The shape lives in `shell/types.ts` — one definition for the surface that
 *  builds the boxes and the listing that fills them. */
type StorageHost = StorageMount;

/** Every Storage surface on screen right now. Registered rather than computed:
 *  since the conversion there is no privileged `#storage-view` to add on the
 *  side, so the register IS the answer. */
const storageHosts: StorageHost[] = [];

function addStorageHost(host: StorageHost): void {
  storageHosts.push(host);
}

function removeStorageHost(host: StorageHost): void {
  const i = storageHosts.indexOf(host);
  if (i >= 0) storageHosts.splice(i, 1);
}

function storageHostsNow(): StorageHost[] {
  return storageHosts.filter((h) => h.enabled());
}

/** Paint every Storage surface on screen. */
function renderStorage(): void {
  for (const host of storageHostsNow()) renderStorageInto(host);
}

function renderStorageInto(host: StorageHost): void {
  const { win, body, crumb, up } = host;
  if (win.type !== "storage") return;

  if (winModeOf(win) === "minio") {
    // THE OBJECT STORE, for real now. A file goes to the room's store, comes
    // back as its own sha256, becomes a ResourceNode that POINTS at those bytes
    // — never carries them — and the upload is also the moment the rights are
    // declared, because that is when the asset first exists as a thing anybody
    // can point at (`s3Dgraphy/docs/asset-dtc-protocol.md`).
    if (crumb) crumb.textContent = sync.room ? `${t("storage.minio")} · ${sync.room}` : "";
    up?.classList.add("hidden");
    // the ingestion panel is LONG: keep the place, per window (the body is a new
    // element after a tree rebuild)
    paintSurface(win, body, () => {
      body.textContent = "";
      body.appendChild(minioPanel());
    });
    return;
  }

  up?.classList.remove("hidden");
  const path = storagePath(win);
  // the listing is rebuilt from scratch on every render (including a focus
  // change), and on a focus change the BODY ITSELF is a new element — so the
  // position is remembered per WINDOW and not per element.
  const wasAt = rememberSurfaceScroll(win, body);
  body.textContent = "";
  body.appendChild(storageEmpty(t("storage.loading")));

  void (async () => {
    let listing: FsListing;
    try {
      listing = await fsList(path ?? undefined);
    } catch (err) {
      if (!body.isConnected) return;
      body.textContent = "";
      const down = err instanceof BridgeDownError;
      const box = storageEmpty(
        down ? t("storage.bridgeDown") : t("storage.refused"),
      );
      if (!down) {
        const why = document.createElement("code");
        why.className = "viewer-path";
        why.textContent = String((err as Error).message);
        box.appendChild(why);
      }
      body.appendChild(box);
      if (crumb) crumb.textContent = down ? "" : (path ?? "");
      return;
    }
    // The area may have moved on (another folder clicked, the tree rebuilt)
    // while the request was in flight — an answer to a question nobody is asking
    // any more must not overwrite the current screen. The test is now the BODY
    // rather than "am I the focused window": with several surfaces alive, a
    // secondary one is a legitimate place for an answer to land.
    if (!body.isConnected || storagePath(win) !== path) return;

    if (crumb) crumb.textContent = listing.roots ? t("storage.roots") : listing.path;
    // Up from a ROOT is the list of roots — not "nothing". The bridge says
    // `parent: null` there because there is no parent INSIDE the fence, and
    // reading that as "the button is dead" is what stranded the first version:
    // enter a root and the other roots became unreachable.
    if (up) {
      up.disabled = listing.roots;
      up.title = listing.parent ? t("storage.up") : t("storage.upToRoots");
      up.onclick = () => {
        if (listing.roots) return;
        setStoragePath(win, listing.parent); // null at a root → the roots list
      };
    }

    body.textContent = "";
    if (!listing.entries.length) {
      body.appendChild(storageEmpty(t("storage.emptyFolder")));
      return;
    }
    // DTCEMS2 · la BOZZA in composizione, oppure — su un asset già timbrato —
    // IL TIMBRO, che non è un modulo da compilare.
    if (stampDraft) {
      body.appendChild(stampComposeBox(win, listing.entries));
    } else if (diskStamps.status === "stamped"
               && diskStamps.path === storageSelected(win)) {
      body.appendChild(stampedBox(diskStamps.path, diskStamps.chain.root));
    } else {
      const selected = storageSelected(win);
      const entry = selected
        ? listing.entries.find((e) => e.path === selected) : undefined;
      if (entry && !isStampPath(entry.path))
        body.appendChild(composeButtons(entry, listing));
      else if (!listing.roots)
        body.appendChild(composeFolderButton(listing));
    }
    // DTCEMS1 · il referto delle tre classi su QUESTA cartella, quando qualcuno
    // l'ha chiesto. Sopra l'elenco perché è una frase sull'elenco.
    if (folderReport && folderReport.folder === listing.path) {
      body.appendChild(stampReportBox(folderReport));
    } else if (!listing.roots) {
      body.appendChild(stampReportButton(listing.path));
    }
    const list = document.createElement("div");
    list.className = "storage-list";
    for (const entry of listing.entries) {
      list.appendChild(storageRow(win, entry));
    }
    body.appendChild(list);
    // …and put it back where it was: a folder you had scrolled through does not
    // jump to the top because the pointer crossed a divider
    restoreSurfaceScroll(win, body, wasAt);
  })();
}

// ── DTCEMS2 · comporre un passo, e timbrarlo ────────────────────────────────
//
// IL PANNELLO STA NELLA FINESTRA DEL DISCO, e non in una finestra nuova: è dove
// la selezione avviene, ed è l'unica superficie che sa già quali file sono
// selezionati. Il minigrafo del passo si disegna a destra, nella vista DTC, con
// la stessa macchina di scene di tutto il resto — comporre e leggere devono
// somigliarsi, perché sono la stessa cosa vista prima e dopo.

function openDraft(outputs: FsEntry[]): void {
  stampDraft = newDraft(outputs.map(outputFrom));
  // L'OPERATORE È CHI STA LAVORANDO, e non un default inventato:
  // `currentIdentity()` è l'identità che questa sessione ha dichiarato
  // (`identity.ts`, claim-now/verify-later). Resta modificabile, e assente resta
  // assente — un ORCID inventato metterebbe il nome di qualcuno su un atto che
  // non ha compiuto.
  const me = currentIdentity();
  if (me?.orcid) {
    stampDraft.operator = {
      id: `https://orcid.org/${me.orcid}`,
      label: [me.name, me.surname].filter(Boolean).join(" "),
    };
  }
  void fillDraftDigests();
  renderStorage();
  redrawNeighbourhood();
}

function closeDraft(): void {
  stampDraft = null;
  renderStorage();
  redrawNeighbourhood();
}

/** Le impronte delle uscite, dal bridge. Servono a comporre e servono al timbro,
 *  e si prendono UNA VOLTA: la cache di `stamp.ts` è chiavata su
 *  (percorso, dimensione, mtime), quindi ricomporre non ricalcola. */
async function fillDraftDigests(): Promise<void> {
  const draft = stampDraft;
  if (!draft) return;
  for (const out of draft.outputs) {
    if (out.digest) continue;
    const digest = await digestOf(out.path, out.size, out.mtime);
    if (stampDraft !== draft) return;         // la selezione è cambiata
    if (digest) out.digest = digest;
  }
  renderStorage();
  redrawNeighbourhood();
}

/**
 * IL PANNELLO. La prima domanda non è «puoi firmare?» ma **«questa cosa viene da
 * qualcosa, oppure è un'origine?»** — ed è la domanda che decide tutto il resto.
 *
 * Il modo «viene da qualcosa» è quello ATTIVO all'apertura, quindi nominare un
 * genitore costa **un gesto** (il clic sul genitore). Dichiarare un'origine ne
 * costa **tre**: il clic su «È un'origine», la spunta sulla dichiarazione, e il
 * nome della campagna. I tre non sono attrito fine a sé stesso — il terzo è
 * lavoro vero, e un'origine senza campagna è un'asserzione nuda — ma il conto
 * deve restare in quest'ordine: se dichiarare un'origine costasse meno, in una
 * settimana sarebbe tutto un'origine finta e il timbro smetterebbe di dire
 * qualcosa. `check-stamps.mjs` misura i due numeri.
 */
function stampComposeBox(win: Win, entries: FsEntry[]): HTMLElement {
  const draft = stampDraft as Draft;
  const box = document.createElement("div");
  box.className = "stamp-compose";

  const head = document.createElement("div");
  head.className = "stamp-compose-head";
  head.textContent = t("compose.head", { n: String(draft.outputs.length) });
  box.appendChild(head);

  // ── 1 · LA DOMANDA ────────────────────────────────────────────────────────
  const ask = document.createElement("div");
  ask.className = "stamp-compose-ask";
  const question = document.createElement("div");
  question.className = "stamp-compose-question";
  question.textContent = t("compose.question");
  ask.appendChild(question);
  const modes = document.createElement("div");
  modes.className = "stamp-compose-modes";
  const mode = (label: string, isOrigin: boolean, hint: string): void => {
    const b = document.createElement("button");
    b.className = "ghost" + (draft.origin === isOrigin ? " on" : "");
    b.textContent = label;
    b.title = hint;
    b.dataset.mode = isOrigin ? "origin" : "derived";
    b.onclick = () => {
      draft.origin = isOrigin;
      // cambiare strada azzera la dichiarazione: una spunta rimasta accesa da
      // un giro precedente sarebbe un'origine dichiarata senza che nessuno
      // l'abbia dichiarata adesso
      draft.originDeclared = false;
      draft.kind = "";
      renderStorage();
      redrawNeighbourhood();
    };
    modes.appendChild(b);
  };
  mode(t("compose.derived"), false, t("compose.derivedHint"));
  mode(t("compose.origin"), true, t("compose.originHint"));
  ask.appendChild(modes);
  box.appendChild(ask);

  // ── 2 · gli INGRESSI, oppure la dichiarazione d'origine ───────────────────
  if (!draft.origin) {
    const stamped = entries.filter((e) =>
      e.type === "file" && !isStampPath(e.path)
      && entries.some((s) => s.path === stampPathFor(e.path)));
    const list = document.createElement("div");
    list.className = "stamp-compose-inputs";
    const label = document.createElement("div");
    label.className = "stamp-compose-label";
    label.textContent = t("compose.inputs");
    list.appendChild(label);
    if (!stamped.length) {
      const none = document.createElement("i");
      none.className = "stamp-compose-none";
      // UN INGRESSO DEVE ESSERE TIMBRATO: un figlio timbrato non può discendere
      // da qualcosa che non ha un'identità dichiarata, e dirlo qui è meglio che
      // lasciare scegliere e poi rifiutare.
      none.textContent = t("compose.noStamped");
      list.appendChild(none);
    }
    for (const entry of stamped) {
      const chosen = draft.inputs.some((i) => i.path === entry.path);
      const b = document.createElement("button");
      b.className = "ghost stamp-compose-input" + (chosen ? " on" : "");
      b.dataset.input = entry.path;
      b.textContent = entry.name;
      b.onclick = () => { void toggleInput(entry, chosen); };
      list.appendChild(b);
    }
    box.appendChild(list);
  } else {
    const decl = document.createElement("div");
    decl.className = "stamp-compose-origin";
    const line = document.createElement("label");
    const tick = document.createElement("input");
    tick.type = "checkbox";
    tick.checked = draft.originDeclared;
    tick.dataset.declare = "origin";
    tick.onchange = () => {
      draft.originDeclared = tick.checked;
      // la spunta fa comparire/sparire l'ostacolo, non la forma del modulo
      refreshComposeFeet();
    };
    const words = document.createElement("span");
    // LA FRASE È IL GESTO: non «conferma», ma quello che si sta affermando.
    words.textContent = t("compose.originDeclare");
    line.append(tick, words);
    decl.appendChild(line);
    decl.appendChild(field(t("compose.campaign"), draft.campaign, (v) => {
      draft.campaign = v;
      redrawNeighbourhood();
    }, { placeholder: t("compose.campaignHint"), key: "campaign" }));
    for (const key of ["camera", "lens", "folder"]) {
      decl.appendChild(field(t(`compose.${key}`), draft.campaignMetadata[key] ?? "",
        (v) => { draft.campaignMetadata[key] = v; }, { small: true }));
    }
    box.appendChild(decl);
  }

  // ── 3 · l'ATTO ───────────────────────────────────────────────────────────
  const act = document.createElement("div");
  act.className = "stamp-compose-act";

  // il genere, DAL VOCABOLARIO e non da un elenco scritto qui
  const kinds = dtcKindsFor(kindAxis(draft));
  const select = document.createElement("select");
  select.dataset.field = "kind";
  const empty = document.createElement("option");
  empty.value = ""; empty.textContent = t("compose.pickKind");
  select.appendChild(empty);
  for (const k of kinds) {
    const o = document.createElement("option");
    o.value = k.kind; o.textContent = k.label;
    if (draft.kind === k.kind) o.selected = true;
    select.appendChild(o);
  }
  select.onchange = () => {
    draft.kind = select.value;
    refreshComposeFeet();
    redrawNeighbourhood();
  };
  act.appendChild(labelled(t("compose.kind"), select));

  act.appendChild(field(t("compose.technique"), draft.technique, (v) => {
    draft.technique = v; redrawNeighbourhood();
  }, { placeholder: t("compose.techniqueHint"), key: "technique" }));

  act.appendChild(field(t("compose.parameters"),
    JSON.stringify(draft.parameters), (v) => {
      try {
        const parsed = JSON.parse(v || "{}");
        draft.parameters = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          ? parsed as Record<string, unknown> : {};
      } catch {
        // UN JSON A META' MENTRE SI DIGITA NON E' UN ERRORE: si tiene l'ultimo
        // valore buono e non si urla. Il bottone Stamp resta comunque governato
        // da `readyToStamp`, che guarda i campi che contano.
      }
    }, { placeholder: '{"target_faces": 50000}', key: "parameters" }));

  // il software, col COMMIT: «EM Tools 1.6» non dice quale build
  const sw = draft.software[0] ?? { name: "", version: "", commit: "" };
  const swRow = document.createElement("div");
  swRow.className = "stamp-compose-row";
  const setSw = (patch: Partial<typeof sw>): void => {
    Object.assign(sw, patch);
    draft.software = sw.name ? [sw] : [];
  };
  swRow.appendChild(field(t("compose.software"), sw.name ?? "",
    (v) => setSw({ name: v }), { small: true, key: "software" }));
  swRow.appendChild(field(t("compose.version"), sw.version ?? "",
    (v) => setSw({ version: v }), { small: true }));
  swRow.appendChild(field(t("compose.commit"), sw.commit ?? "",
    (v) => setSw({ commit: v }), { small: true, placeholder: "9555447" }));
  act.appendChild(swRow);

  act.appendChild(field(t("compose.operator"), draft.operator.id, (v) => {
    draft.operator.id = v; redrawNeighbourhood();
  }, { placeholder: "https://orcid.org/0000-0002-…", key: "operator" }));

  // ── la DATA DELL'ATTO ────────────────────────────────────────────────────
  //
  // Vuota all'apertura, e il bottone «oggi» è un GESTO. La data dell'atto non è
  // `now()` per difetto: un atto avvenuto a marzo deve poterlo dire, e una data
  // che il programma mette da sé è una data che nessuno ha visto.
  const when = document.createElement("div");
  when.className = "stamp-compose-row";
  when.appendChild(field(t("compose.at"), draft.at, (v) => {
    draft.at = v; redrawNeighbourhood();
  }, { placeholder: "2026-03-14T09:00:00Z", key: "at" }));
  const today = document.createElement("button");
  today.className = "ghost";
  today.dataset.field = "today";
  today.textContent = t("compose.today");
  today.title = t("compose.todayHint");
  today.onclick = () => {
    draft.at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    renderStorage();
    redrawNeighbourhood();
  };
  when.appendChild(today);
  act.appendChild(when);
  box.appendChild(act);

  // ── 4 · STAMP ────────────────────────────────────────────────────────────
  const why = readyToStamp(draft);
  const feet = document.createElement("div");
  feet.className = "stamp-compose-feet";
  const stampBtn = document.createElement("button");
  stampBtn.className = "primary";
  stampBtn.dataset.action = "stamp";
  // «STAMP», MAI «SIGN». Non c'è una chiave, non c'è non ripudiabilità, e
  // nessun terzo può dimostrare che quel timbro l'ha emesso proprio quella
  // persona: c'è un'impronta e una dichiarazione. In ambito patrimoniale
  // «firmato» promette cose precise, e la promessa la paga qualcun altro in una
  // controversia.
  stampBtn.textContent = stampEmitting
    ? t("compose.stamping")
    : t("compose.stamp", { n: String(draft.outputs.length) });
  stampBtn.disabled = !!why || stampEmitting;
  if (why) stampBtn.title = why;
  stampBtn.onclick = () => { void doStamp(win); };
  const cancel = document.createElement("button");
  cancel.className = "ghost";
  cancel.textContent = t("compose.cancel");
  cancel.onclick = closeDraft;
  feet.append(stampBtn, cancel);
  if (why) {
    const reason = document.createElement("i");
    reason.className = "stamp-compose-why";
    reason.textContent = why;
    feet.appendChild(reason);
  }
  box.appendChild(feet);
  return box;
}

/**
 * Rinfresca SOLO il piede del modulo: il bottone e la ragione per cui è spento.
 *
 * Non `renderStorage()`, e la ragione l'ha mostrata il pannello: ricostruire
 * l'intero modulo a ogni tasto premuto porta via il fuoco dal campo che si sta
 * scrivendo e rimette il cursore in testa. Ma senza rinfrescare niente il
 * bottone resta spento con la frase di tre campi fa — **misurato a video: dopo
 * aver scelto il genere, «Stamp» continuava a dire «the act needs a kind»** — e
 * un bottone che mente sul proprio ostacolo manda una persona a cercare il
 * problema dove non è.
 *
 * Quindi si riscrive il pezzo che cambia e nient'altro.
 */
function refreshComposeFeet(): void {
  const draft = stampDraft;
  const btn = document.querySelector<HTMLButtonElement>("button[data-action=stamp]");
  if (!draft || !btn) return;
  const why = readyToStamp(draft);
  btn.disabled = !!why || stampEmitting;
  btn.title = why ?? "";
  const reason = document.querySelector<HTMLElement>(".stamp-compose-why");
  if (reason) reason.textContent = why ?? "";
}

/** Un ingresso si aggiunge o si toglie — e deve essere TIMBRATO: si legge il suo
 *  timbro e si prende da lì l'identità, che è l'unica cosa che conta. */
async function toggleInput(entry: FsEntry, chosen: boolean): Promise<void> {
  const draft = stampDraft;
  if (!draft) return;
  if (chosen) {
    draft.inputs = draft.inputs.filter((i) => i.path !== entry.path);
    renderStorage();
    redrawNeighbourhood();
    return;
  }
  const resolution = await resolveFile(entry);
  if (stampDraft !== draft) return;
  if (resolution.why !== "by-digest" || !resolution.stamp) {
    toast(t("compose.inputNotStamped", { name: entry.name }));
    return;
  }
  const input: DraftInput = {
    resource_id: resolution.stamp.self.resource_id,
    digest: resolution.stamp.self.digest ?? "",
    label: entry.name,
    path: entry.path,
    size_bytes: entry.size,
  };
  draft.inputs.push(input);
  renderStorage();
  redrawNeighbourhood();
}

/** Emette. Il risultato lo consegna il bridge, e quello che si dice a chi guarda
 *  è **quanti timbri sono stati scritti e quanti rifiutati**, con la ragione. */
async function doStamp(win: Win): Promise<void> {
  const draft = stampDraft;
  if (!draft || stampEmitting) return;
  stampEmitting = true;
  renderStorage();
  const started = performance.now();
  try {
    const out = await emitDraft(draft, {
      graph_id: store?.doc?.graph?.graph_id as string | undefined,
    });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    if (out.error) {
      toast(out.error);
    } else if (out.written.length) {
      toast(t("compose.done", { n: String(out.written.length), s: seconds }));
      stampDraft = null;
      // …e si rilegge il disco: adesso quel file HA un timbro, e la vista deve
      // mostrare il verbale invece della bozza.
      void askStamps(storageSelected(win));
    }
    for (const r of out.refused) toast(`${baseName(r.path)}: ${r.why}`);
  } catch (err) {
    toast(String((err as Error).message));
  } finally {
    stampEmitting = false;
    renderStorage();
    redrawNeighbourhood();
  }
}

// ── i mattoncini del modulo ─────────────────────────────────────────────────

function labelled(text: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "stamp-field";
  const span = document.createElement("span");
  span.textContent = text;
  wrap.append(span, control);
  return wrap;
}

function field(text: string, value: string, onInput: (v: string) => void,
               opts: { placeholder?: string; small?: boolean; key?: string } = {},
): HTMLElement {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.key) input.dataset.field = opts.key;
  input.oninput = () => { onInput(input.value); refreshComposeFeet(); };
  const wrap = labelled(text, input);
  if (opts.small) wrap.classList.add("small");
  return wrap;
}

/** I due ingressi alla composizione: questo file, o tutti i file non timbrati
 *  della cartella. **Il secondo è il gesto dei quattrocento scatti.** */
function composeButtons(entry: FsEntry, listing: FsListing): HTMLElement {
  const box = document.createElement("div");
  box.className = "stamp-report-ask";
  const one = document.createElement("button");
  one.className = "ghost";
  one.dataset.action = "compose-one";
  one.textContent = t("compose.open", { name: entry.name });
  one.onclick = () => openDraft([entry]);
  box.appendChild(one);
  box.appendChild(composeFolderButton(listing, true));
  return box;
}

/**
 * «Un atto solo, per tutti i file non timbrati di questa cartella.»
 *
 * È il gesto del rilievo fotogrammetrico: quattrocento scatti che sono origini
 * di una campagna sola. Il formato lo prevede — un processo che produce N
 * artefatti dà N timbri che citano lo stesso `process_id`, lecito perché il
 * processo è immutabile — e il substrato pure: `bucket_acquisition` raggruppa i
 * file sotto UN evento, e i fatti rappresentativi del lotto (macchina,
 * obiettivo, cartella) stanno sull'evento invece che ripetuti quattrocento
 * volte.
 *
 * Esclude i file GIÀ timbrati, e non è una comodità: un timbro emesso non si
 * riscrive, e infilarli nella selezione vorrebbe dire proporre un gesto che il
 * bridge rifiuterà uno per uno.
 */
function composeFolderButton(listing: FsListing, inline = false): HTMLElement {
  const stampable = listing.entries.filter((e) =>
    e.type === "file" && !isStampPath(e.path) && !e.outside
    && !listing.entries.some((s) => s.path === stampPathFor(e.path)));
  const b = document.createElement("button");
  b.className = "ghost";
  b.dataset.action = "compose-folder";
  b.textContent = t("compose.openFolder", { n: String(stampable.length) });
  b.disabled = !stampable.length;
  b.onclick = () => openDraft(stampable);
  if (inline) return b;
  const box = document.createElement("div");
  box.className = "stamp-report-ask";
  box.appendChild(b);
  return box;
}

/**
 * UN ASSET GIÀ TIMBRATO MOSTRA IL TIMBRO, non un modulo.
 *
 * Prima di timbrare il minigrafo si edita liberamente; dopo, no. Un timbro
 * emesso è un verbale immutabile e **non si può dis-dire nelle copie già
 * uscite**: se l'autore era sbagliato, l'unica cosa che esiste è emettere una
 * **correzione**, che è un atto nuovo con una sua data e un suo autore.
 *
 * Quindi qui non c'è nessun campo modificabile. Ci sono due cose:
 *
 * * il timbro, in sola lettura, così com'è sul disco;
 * * **la strada in avanti**, che è comporre un passo NUOVO usando questo
 *   artefatto come ingresso — legittima, a un clic, e già costruita.
 *
 * E una frase sull'errata. **Non ho messo un bottone**, ed è una decisione:
 * un'errata è un atto che qualcuno deve TENERE, e il posto che la tiene — il
 * record del grafo — non esiste ancora. Un bottone che scrivesse un secondo
 * `.stamp.json` accanto al primo pregiudicherebbe la forma dell'errata prima
 * che qualcuno l'abbia decisa, e sarebbe anche il modo di far credere che due
 * timbri per lo stesso digest siano una correzione invece che una scoperta
 * (s3Dgraphy li tratta come un disaccordo, e non sceglie un vincitore).
 */
function stampedBox(path: string, stamp: Stamp): HTMLElement {
  const box = document.createElement("div");
  box.className = "stamp-emitted";
  const head = document.createElement("div");
  head.className = "stamp-emitted-head";
  head.textContent = t("compose.emittedHead", { name: baseName(path) });
  box.appendChild(head);

  const pre = document.createElement("pre");
  pre.className = "stamp-emitted-body";
  pre.dataset.readonly = "stamp";
  pre.textContent = JSON.stringify(stamp, null, 1);
  box.appendChild(pre);

  const note = document.createElement("i");
  note.className = "stamp-emitted-note";
  note.textContent = t("compose.erratum");
  box.appendChild(note);

  const forward = document.createElement("button");
  forward.className = "ghost";
  forward.dataset.action = "compose-from";
  forward.textContent = t("compose.fromThis");
  forward.title = t("compose.fromThisHint");
  forward.onclick = () => { void composeFromStamped(path, stamp); };
  box.appendChild(forward);
  return box;
}

/** «Componi un passo DA questo»: l'artefatto timbrato diventa l'ingresso di una
 *  bozza nuova, e la sua uscita la si sceglie dal disco. La strada in avanti che
 *  un'errata non è. */
async function composeFromStamped(path: string, stamp: Stamp): Promise<void> {
  const folder = path.slice(0, path.lastIndexOf("/")) || "/";
  let listing: FsListing;
  try {
    listing = await fsList(folder);
  } catch {
    toast(t("storage.bridgeDown"));
    return;
  }
  const stampable = listing.entries.filter((e) =>
    e.type === "file" && !isStampPath(e.path) && e.path !== path
    && !listing.entries.some((s) => s.path === stampPathFor(e.path)));
  if (!stampable.length) {
    toast(t("compose.nothingToMake"));
    return;
  }
  openDraft(stampable);
  if (stampDraft) {
    stampDraft.inputs = [{
      resource_id: stamp.self.resource_id,
      digest: stamp.self.digest ?? "",
      label: baseName(path),
      path,
    }];
    renderStorage();
    redrawNeighbourhood();
  }
}

/** Il bottone che CHIEDE il referto. Non si calcola da solo, e non è pigrizia:
 *  costa impronte, e un pannello che hashasse una cartella ogni volta che ci si
 *  entra sarebbe inutilizzabile sull'unico albero che conta — quello vero. */
function stampReportButton(folder: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "stamp-report-ask";
  const b = document.createElement("button");
  b.className = "ghost";
  b.textContent = t("stamp.reportAsk");
  b.onclick = () => {
    b.disabled = true;
    b.textContent = t("stamp.reportWorking");
    void (async () => {
      try {
        folderReport = await reportFolder(folder);
      } catch (err) {
        toast(String((err as Error).message));
        b.disabled = false;
        b.textContent = t("stamp.reportAsk");
        return;
      }
      renderStorage();
    })();
  };
  box.appendChild(b);
  return box;
}

/**
 * IL REFERTO DELLE TRE CLASSI, e la terza è la maggioranza.
 *
 * **«Byte senza timbro» è lo stato NORMALE** di un albero di lavoro: in un
 * progetto vero quasi nessun file è timbrato. Quindi non è rosso, non ha
 * un'icona d'allarme e non è in cima: è una riga come le altre due, con il tono
 * neutro, e la sua frase dice che è normale invece di lasciarlo dedurre. Una
 * interfaccia che li marchiasse tutti in rosso sarebbe illeggibile al primo uso.
 *
 * E un timbro senza byte **non dice da solo** se il file è stato spostato,
 * rinominato fuori dall'albero, cancellato o modificato: sono quattro cose
 * diverse, e questo referto **non indovina quale**. L'unica cosa che afferma è
 * quella che ha misurato — in questa cartella non ci sono byte con quell'impronta
 * — e le quattro possibilità sono elencate come possibilità.
 */
function stampReportBox(report: FolderReport): HTMLElement {
  const box = document.createElement("div");
  box.className = "stamp-report";
  const head = document.createElement("div");
  head.className = "stamp-report-head";
  head.textContent = t("stamp.reportHead", {
    files: String(report.files), hashed: String(report.hashed),
  });
  box.appendChild(head);

  const row = (cls: string, label: string, n: number, note: string): void => {
    const el = document.createElement("div");
    el.className = `stamp-report-row ${cls}`;
    const count = document.createElement("b");
    count.textContent = String(n);
    const text = document.createElement("span");
    text.textContent = ` ${label}`;
    const why = document.createElement("i");
    why.textContent = note;
    el.append(count, text, why);
    box.appendChild(el);
  };
  row("paired", t("stamp.classPaired"), report.paired.length,
      t("stamp.classPairedNote"));
  row("orphan-stamp", t("stamp.classStampNoBytes"),
      report.stampsWithoutBytes.length, t("stamp.classStampNoBytesNote"));
  // …e la terza, col tono NEUTRO: è la normalità, non un guasto
  row("plain", t("stamp.classNoStamp"), report.bytesWithoutStamp.length,
      t("stamp.classNoStampNote"));
  if (report.unreadable.length) {
    row("broken", t("stamp.classUnreadable"), report.unreadable.length,
        t("stamp.classUnreadableNote"));
  }
  const close = document.createElement("button");
  close.className = "ghost";
  close.textContent = t("stamp.reportClose");
  close.onclick = () => { folderReport = null; renderStorage(); };
  box.appendChild(close);
  return box;
}

/**
 * ASSETS · the ingestion panel — the object-store mode of a Storage window.
 *
 * Where a batch of files becomes a study's material: bytes into the room's
 * store, one `ResourceNode` each pointing at them, ONE acquisition grouping the
 * lot, and the licence said once for all of it. The Assets workspace puts this
 * between the disk (a Storage window in `filesystem` mode) and the
 * Inspector/Log column, which is the order the act actually happens in.
 *
 * Four things it refuses to do silently, each because the alternative is a lie
 * somebody discovers months later:
 *
 *  · **replace an asset** — same name, different bytes: it says so, and counts
 *    the citations at stake, because a superseded file may no longer be what a
 *    published text cites;
 *  · **hide where the gate is** — `reference` residency keeps the bytes outside
 *    StratiGraph Server, so no embargo can be applied to them. Offered, with the note,
 *    and never for something embargoed;
 *  · **guess a derivation** — output ← input is DECLARED here, by hand, with the
 *    tool named;
 *  · **attribute without an identity** — no ORCID, no ingestion: the whole point
 *    of the act is that somebody signs it. The tab says so instead of publishing
 *    files nobody stands behind.
 */

/** The panel's little DOM helper — the same three arguments `inspector.ts`
 *  uses, kept local because main.ts has no such helper of its own. */
function ing(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** One file on its way in. The status is the whole story of the row. */
interface IngestItem {
  name: string;
  size: number;
  mediaType: string;
  kind: ResourceKind;
  /** deduced from the kind, and overridable — that is the point of showing it */
  use: ResourceUse;
  /** an OS drop/pick carries the bytes; a drag from the disk pane carries a path */
  file?: File;
  path?: string;
  status: "pending" | "working" | "done" | "same" | "failed" | "referenced";
  /** F3 · the PAPER side, separate from the byte side on purpose. A file can be
   *  in the store and carry no statement about who made it or what may be done
   *  with it — that is the debt the counter below is about, and a single status
   *  enum could not say it: `done` would mean "arrived" to one reader and
   *  "finished" to another. */
  signed?: boolean;
  /** I2 · THE THIRD FACT, and it needed its own field for the same reason
   *  `signed` did: «the bytes arrived», «somebody said what may be done with
   *  them» and «there is a record of who put them there» are three different
   *  sentences, and a reader who can only see one of them cannot tell a declared
   *  ingestion from a real chain.
   *
   *  `own` = the file arrived carrying its own stamp, verified by digest;
   *  `ingestion` = it did not, so the ingestion itself was stamped — a poor
   *  provenance, and visibly so;
   *  `false` = neither, which is the only state that must never be silent. */
  stamped?: "own" | "ingestion" | false;
  /** the stamp's OWN digest in the store — a stamp is bytes too */
  stampRef?: string;
  digest?: string;
  nodeId?: string;
  note?: string;
}

/** What the batch says about itself, before any of it is published. Kept across
 *  renders (a form that forgot the lot name on every drop would be unusable). */
interface IngestDraft {
  lot: string;
  /** F1 · the DELIVERY's stable acquisition id, minted once per lot.
   *
   *  Load-bearing, and the trap it avoids is the one thing that could silently
   *  ruin this: the corpus derives an acquisition's id from the NAME when there
   *  is one and otherwise from its sorted members, so appending one file at a
   *  time to an unnamed lot would mint two hundred one-file acquisitions. Which
   *  is exactly the property F2 says not to break — «una serie è un gruppo».
   *  With an explicit id every act adds to the same event. */
  lotId: string | null;
  /** NO DEFAULT. Empty means nobody has said anything, and the delivery does not
   *  sign until somebody does — see `deliveryProblem()`. */
  license: string;
  /** the AUTHOR: who made the content. Not pre-filled with the depositor — see
   *  `ingestDelivery`. */
  authorName: string;
  authorOrcid: string;
  /** the EDITOR: who takes responsibility for publishing. `me` is the
   *  depositor, which the register already records; `other` is a declaration
   *  the acts have no field for yet, and is refused rather than smuggled. */
  editor: "me" | "other";
  editorName: string;
  /** the EMBARGO: until when, and why. Optional — an absent embargo is not a
   *  shorter one. */
  embargoUntil: string;
  embargoReason: string;
  residency: Residency;
  scope: Scope;
  items: IngestItem[];
  lastAcquisition: string | null;
  /** F3 · THE DEBT, cumulative and deliberately not derived from `items`.
   *
   *  Derived counts vanish when the rows are cleared, and a debt that disappears
   *  because you tidied the list is the palude the counter exists to prevent.
   *  These only ever go up, within a session. */
  stored: number;
  signed: number;
  /** the panel's own trail; the Log window keeps the durable one */
  log: string[];
}

const ingestDraft: IngestDraft = {
  lot: "",
  lotId: null,
  // NOT `DEFAULT_ASSET_LICENSE`. A preselected licence is a legal statement
  // nobody made — the same species of mistake as a default password — and it was
  // preselected here (measured: `license: DEFAULT_ASSET_LICENSE`, i.e.
  // CC-BY-SA-4.0, in every fresh panel). The constant is still what the form
  // OFFERS, one click away, which is a declaration; this is not.
  license: "",
  authorName: "",
  authorOrcid: "",
  editor: "me",
  editorName: "",
  embargoUntil: "",
  embargoReason: "",
  residency: "resident",
  scope: "own-study",
  items: [],
  lastAcquisition: null,
  stored: 0,
  signed: 0,
  log: [],
};

/** Why this delivery cannot be signed yet — or null when it can.
 *
 *  ONE place, read by the funnel (which refuses to start), by the publish button
 *  (which says why instead of being mutely grey) and by the check. Two copies of
 *  a rule like this drift, and the drift is always in the direction of letting
 *  something through. */
function deliveryProblem(): string | null {
  if (!ingestDraft.license.trim()) return t("assets.needsLicense");
  // The third role has no home in the model yet: `enrich_asset_dtc` carries the
  // AUTHOR (who made it) and the ATTRIBUTOR (who says so, from the token) and
  // nothing else. Writing an editor into a metadata bag would put a statement of
  // responsibility where `asset_rights` will never look for it — a claim that
  // reads as recorded and is not enforceable. So it is refused, out loud, with
  // the proposal in the end-of.
  if (ingestDraft.editor === "other") return t("assets.editorNotYet");
  return null;
}

/** The derivation form's own state — an output, its inputs, and the tool. */
const derivationDraft = { output: "", inputs: [] as string[], tool: "" };

function ingestLog(message: string, level: "info" | "warn" = "info"): void {
  ingestDraft.log.unshift(message);
  if (ingestDraft.log.length > 40) ingestDraft.log.length = 40;
  if (level === "warn") logWarn(`assets: ${message}`);
  else logInfo(`assets: ${message}`);
}

function storageText(message: string): HTMLElement {
  const p = document.createElement("p");
  p.textContent = message;
  return p;
}

/** A labelled control, the shape the rest of the panel is built from. */
function ingestField(
  parent: HTMLElement, label: string, control: HTMLElement, hint?: string,
): void {
  const wrap = document.createElement("label");
  wrap.className = "ing-field";
  const span = document.createElement("span");
  span.className = "ing-label";
  span.textContent = label;
  wrap.append(span, control);
  parent.appendChild(wrap);
  if (hint) {
    const h = document.createElement("div");
    h.className = "insp-hint";
    h.textContent = hint;
    parent.appendChild(h);
  }
}

/**
 * The panel. Rebuilt on every render (it is small and the state lives in
 * `ingestDraft`), and gated in two ways that are NOT the same refusal:
 *
 *  · no room → there is nowhere for the bytes to go;
 *  · no ORCID → there is nobody to sign what is said about them.
 *
 * Saying which one is missing is the difference between a disabled tab and an
 * instruction.
 */
function minioPanel(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-panel";

  // THE GATE IS ON THE UPLOAD, NOT ON THE DOCUMENTATION.
  //
  // Measured, and it was hiding the whole point of the tab: the room gate came
  // first and returned, so a project opened OFFLINE — with a corpus full of
  // acquisitions and chains in its own file — showed one sentence about not being
  // in a room and nothing about its own documentation. Ingesting needs a room
  // (the bytes must go somewhere); READING and drawing the corpus is a fact about
  // the project, and belongs to nobody's connection.
  const blocked = (!sync.room || !getSettings().sync.hubUrl)
    ? t("storage.minioNeedsRoom")
    : !currentIdentity() ? t("assets.needsIdentity")
    : !store ? t("assets.needsDocument")
    : null;
  if (blocked) {
    box.appendChild(storageText(blocked));
    // …and the documentation that is already there, if any
    box.appendChild(ingestLots());
    box.appendChild(ingestDerivation());
    if (!documentationCorpus({ create: false })?.liveNodes().length) {
      box.classList.add("storage-empty");
    }
    return box;
  }
  // NO PRE-FILL OF THE AUTHOR. This used to read
  //   `if (!ingestDraft.authorOrcid) { ingestDraft.authorOrcid = me.orcid; … }`
  // — every fresh panel asserted that whoever was logged in had MADE the files.
  // Which is the exact confusion §1 of the design note is about: one digitises a
  // colleague's photograph, deposits it, answers for having published it, and is
  // not its author. The convenience survives as a one-click «it was me» in the
  // form, where it is a declaration instead of an assumption.
  //
  // F1 · THE SIGNATURE COMES FIRST, so it is above the funnel: a file inherits
  // the delivery at the moment it lands, which is only possible if the delivery
  // already exists.
  box.appendChild(ingestDelivery());
  box.appendChild(ingestFunnel());
  box.appendChild(ingestDebt());
  box.appendChild(ingestQueue());
  box.appendChild(ingestPublishBar());
  box.appendChild(ingestLots());
  box.appendChild(ingestDerivation());
  box.appendChild(ingestTrail());
  return box;
}

/**
 * F2 · THE FUNNEL — where the bytes go in.
 *
 * A drop target big enough to aim at, with the funnel as its icon: this is the
 * one gesture of the whole tab, and it had the visual weight of a paragraph.
 *
 * What it accepts: a drop from the OPERATING SYSTEM, a pick, and a drag out of
 * the disk pane. The OS drop is worth saying plainly because the prompt for this
 * night believed it was missing — it is not, and it was not built tonight:
 * `queueFiles(Array.from(e.dataTransfer?.files ?? []))` has been the last line of
 * the drop handler all along, and the measurement is in the end-of. What was
 * missing is everything after it.
 *
 * And it only appears where it can work: the store belongs to a ROOM, and in
 * Standalone the panel says so above (`storage.minioNeedsRoom`) and this is not
 * built at all — a funnel greyed out with no explanation is worse than no funnel.
 */
function ingestFunnel(): HTMLElement {
  const zone = document.createElement("div");
  zone.className = "ing-drop ing-funnel";
  const problem = deliveryProblem();
  if (problem) zone.classList.add("ing-funnel-unsigned");

  const glyph = ing("div", "ing-funnel-glyph");
  glyph.setAttribute("aria-hidden", "true");
  // an inline SVG rather than a character: there is no funnel in the glyph sets
  // this app already leans on, and a big ▽ reads as a play button turned round
  glyph.innerHTML =
    '<svg viewBox="0 0 48 48" width="72" height="72" fill="none" '
    + 'stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">'
    + '<path d="M6 8h36L28 25v13l-8 5V25z"/>'
    + '<path d="M24 44v-1" stroke-linecap="round"/></svg>';
  zone.appendChild(glyph);
  zone.appendChild(storageText(
    problem ?? t("assets.drop", { room: sync.room ?? "" })));

  const picker = document.createElement("input");
  picker.type = "file";
  picker.multiple = true;                       // a batch, not a file
  picker.className = "storage-file";
  picker.addEventListener("change", () => {
    queueFiles(Array.from(picker.files ?? []));
    picker.value = "";
  });
  zone.appendChild(picker);

  // …and FROM THE SHELF, which is the honest answer to "how does a file on my
  // disk get in here?" in a tiled workspace. Only one Storage surface is mounted
  // at a time (the app's singleton-surface rule, WIN7), so a drag from the disk
  // pane into this one is not a gesture that exists yet — while the shelf is a
  // curated list that already carries the path AND the digest the bridge
  // computed. Reusing it beats building a second file browser here.
  const fromShelf = shelfEntries().filter(
    (entry) => !/^(https?|s3):/i.test(entry.locator));
  if (fromShelf.length) {
    const bar = ing("div", "insp-actions");
    const add = ing("button", "insp-btn",
      t("assets.fromShelf", { n: String(fromShelf.length) })) as HTMLButtonElement;
    add.title = t("assets.fromShelfHint");
    add.addEventListener("click", () => {
      for (const entry of fromShelf) queuePath(entry.locator, entry.name);
    });
    bar.appendChild(add);
    zone.appendChild(bar);
  }

  const stop = (e: DragEvent): void => { e.preventDefault(); e.stopPropagation(); };
  zone.addEventListener("dragover", (e) => {
    stop(e);
    zone.classList.add("ing-drop-over");
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("ing-drop-over"));
  zone.addEventListener("drop", (e) => {
    stop(e);
    zone.classList.remove("ing-drop-over");
    const fromDisk = storageDragPayload(e);
    if (fromDisk) {
      if (fromDisk.type === "dir") {
        toast(t("assets.folderNotYet"));
        return;
      }
      queuePath(fromDisk.path, fromDisk.name);
      return;
    }
    queueFiles(Array.from(e.dataTransfer?.files ?? []));
  });
  return zone;
}

/** OS files (drop or picker) join the queue with their kind deduced. */
function queueFiles(files: File[]): void {
  for (const file of files) {
    const kind = kindOf(file.name, file.type);
    ingestDraft.items.push({
      name: file.name,
      size: file.size,
      mediaType: file.type || "application/octet-stream",
      kind,
      use: defaultUse(kind),
      file,
      status: "pending",
    });
  }
  if (files.length) ingestLog(t("assets.queued", { n: String(files.length) }));
  renderStorage();
  void runDelivery();
}

/** A file dragged out of the disk pane: the bridge holds the bytes, and the
 *  panel fetches them at publish time (the browser may not read the path). */
function queuePath(path: string, name: string): void {
  const kind = kindOf(name);
  ingestDraft.items.push({
    name,
    size: 0,
    mediaType: "application/octet-stream",
    kind,
    use: defaultUse(kind),
    path,
    status: "pending",
  });
  ingestLog(t("assets.queued", { n: "1" }));
  renderStorage();
  void runDelivery();
}

/**
 * F2 · «i byte entrano subito» — a drop IS the delivery, when it is signed.
 *
 * There is no reason to make somebody drop files and then press a button: the
 * signature was given before the drag (F1), so everything the act needs is
 * already here. When it is NOT signed the files still queue and the funnel says
 * why — losing a drop because a licence was missing would be worse than asking
 * twice — and the publish button picks them up once it is.
 *
 * Serialised by a flag, not by cleverness: two drops a second apart would
 * otherwise both walk the same queue and upload every file twice. Idempotence at
 * the two endpoints means that costs nothing durable, but it does cost the bytes
 * twice over the wire.
 */
let deliveryRunning = false;

async function runDelivery(): Promise<void> {
  if (deliveryRunning) return;
  if (deliveryProblem()) return;      // the funnel already says which
  deliveryRunning = true;
  try {
    await publishQueue();
  } finally {
    deliveryRunning = false;
  }
}

/**
 * F1 · THE DELIVERY FORM — one signs BEFORE dragging.
 *
 * Above the funnel, not below it: what a lot says about itself is not a
 * afterthought to be filled in once the bytes are already somewhere. Every file
 * that lands inherits this at the moment it lands, which is only possible if it
 * is already here.
 *
 * THREE ROLES, and they are not the same field (design note §1):
 *
 *  · the DEPOSITOR — whoever brings the bytes in. **Not a field.** It comes from
 *    the token, always, and the server takes the attributor from there
 *    (`enrich_asset_dtc(attributor=…)`, refusing an unsigned attribution as «a
 *    rumour»). Shown as a line, never as a box: a box is somewhere a name that
 *    is not yours can be typed;
 *  · the EDITOR — whoever takes responsibility for publishing. Often the
 *    depositor, not necessarily: one digitises somebody else's photograph, is
 *    not its author, and answers for having published it all the same;
 *  · the AUTHOR — whoever made the content. **Not pre-filled with the
 *    depositor**, which is what it used to be (`ingestDraft.authorOrcid =
 *    me.orcid` on every open): «a model with one author field cannot say it
 *    without lying», and pre-filling is the lie made comfortable. There is a
 *    one-click «it was me» instead — a click is a declaration, a pre-fill is not.
 *
 * And the licence has NO DEFAULT. A preselected licence is a legal statement
 * nobody made; `DEFAULT_ASSET_LICENSE` is still OFFERED as a button, which is
 * the difference between suggesting and asserting.
 */
function ingestDelivery(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-defaults ing-delivery";
  box.appendChild(ing("h3", "insp-sect", t("assets.delivery")));

  // ── the DEPOSITOR · a line, never a box ───────────────────────────────────
  const me = currentIdentity();
  const who = me
    ? [me.name, me.surname].filter(Boolean).join(" ") || me.orcid
    : "";
  const dep = ing("div", "ing-depositor");
  dep.appendChild(ing("span", "ing-role-tag", t("assets.depositor")));
  dep.appendChild(ing("strong", "", who));
  if (me?.orcid) dep.appendChild(ing("code", "viewer-path", me.orcid));
  box.appendChild(dep);
  box.appendChild(ing("div", "insp-hint", t("assets.depositorHint")));

  // ── the EDITOR · a declared choice, and one it cannot yet record ───────────
  const editor = document.createElement("select");
  editor.className = "ing-select";
  for (const value of ["me", "other"] as const) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = value === "me"
      ? t("assets.editorMe", { who })
      : t("assets.editorOther");
    if (value === ingestDraft.editor) o.selected = true;
    editor.appendChild(o);
  }
  editor.addEventListener("change", () => {
    ingestDraft.editor = editor.value as "me" | "other";
    renderStorage();          // the refusal and the field appear with the choice
  });
  ingestField(box, t("assets.editor"), editor,
              ingestDraft.editor === "other"
                ? t("assets.editorNotYet")
                : t("assets.editorMeHint"));
  if (ingestDraft.editor === "other") {
    const name = document.createElement("input");
    name.className = "insp-name-input";
    name.value = ingestDraft.editorName;
    name.placeholder = t("assets.editorPlaceholder");
    name.addEventListener("change", () => {
      ingestDraft.editorName = name.value.trim();
    });
    ingestField(box, t("assets.editorName"), name);
  }

  // ── the AUTHOR · may be nobody, and is never assumed to be you ─────────────
  const author = document.createElement("input");
  author.className = "insp-name-input";
  author.value = ingestDraft.authorName;
  author.placeholder = t("assets.authorPlaceholder");
  author.addEventListener("change", () => {
    ingestDraft.authorName = author.value.trim();
  });
  const orcid = document.createElement("input");
  orcid.className = "insp-name-input";
  orcid.value = ingestDraft.authorOrcid;
  orcid.placeholder = "0000-0000-0000-0000";
  orcid.addEventListener("change", () => {
    const iD = orcid.value.trim();
    const problem = iD ? orcidProblem(iD) : null;
    if (problem) {
      orcid.classList.add("insp-input-bad");
      orcid.title = t("assets.orcidBad", { problem });
      return;
    }
    orcid.classList.remove("insp-input-bad");
    ingestDraft.authorOrcid = iD;
  });
  ingestField(box, t("assets.author"), author);
  ingestField(box, "ORCID", orcid, t("assets.authorHint"));
  if (me && (ingestDraft.authorOrcid !== me.orcid || !ingestDraft.authorName)) {
    const mine = ing("div", "insp-actions");
    const btn = ing("button", "insp-btn", t("assets.authorIsMe")) as HTMLButtonElement;
    btn.title = t("assets.authorIsMeHint");
    btn.addEventListener("click", () => {
      ingestDraft.authorOrcid = me.orcid;
      ingestDraft.authorName = who;
      renderStorage();
    });
    mine.appendChild(btn);
    box.appendChild(mine);
  }

  // ── the LICENCE · required, and never preselected ──────────────────────────
  const lic = document.createElement("input");
  lic.className = "insp-name-input"
    + (ingestDraft.license.trim() ? "" : " insp-input-bad");
  lic.value = ingestDraft.license;
  // a PLACEHOLDER that does not name a licence: showing "CC-BY-SA-4.0" in grey
  // inside a required box is how a hurried reader ends up believing one was
  // chosen. The offer is the button underneath, where it costs a click.
  lic.placeholder = t("assets.licensePlaceholder");
  lic.addEventListener("change", () => {
    ingestDraft.license = lic.value.trim();
    renderStorage();
  });
  ingestField(box, t("assets.license"), lic, t("assets.licenseHint"));
  const offer = ing("div", "insp-actions");
  const suggest = ing("button", "insp-btn",
    t("assets.licenseOffer", { license: DEFAULT_ASSET_LICENSE })) as HTMLButtonElement;
  suggest.title = t("assets.licenseOfferHint");
  suggest.addEventListener("click", () => {
    ingestDraft.license = DEFAULT_ASSET_LICENSE;
    renderStorage();
  });
  offer.appendChild(suggest);
  box.appendChild(offer);

  // ── the EMBARGO · optional, with its reason ────────────────────────────────
  const until = document.createElement("input");
  until.type = "date";
  until.className = "insp-name-input";
  until.value = ingestDraft.embargoUntil;
  until.addEventListener("change", () => {
    ingestDraft.embargoUntil = until.value.trim();
    renderStorage();
  });
  ingestField(box, t("assets.embargo"), until, t("assets.embargoHint"));
  if (ingestDraft.embargoUntil) {
    const why = document.createElement("input");
    why.className = "insp-name-input";
    why.value = ingestDraft.embargoReason;
    why.placeholder = t("assets.embargoReasonPlaceholder");
    why.addEventListener("change", () => {
      ingestDraft.embargoReason = why.value.trim();
    });
    ingestField(box, t("assets.embargoReason"), why);
  }

  // ── the LOT · a name is how you keep adding to the same event ──────────────
  const lot = document.createElement("input");
  lot.className = "insp-name-input";
  lot.value = ingestDraft.lot;
  lot.placeholder = t("assets.lotPlaceholder");
  lot.addEventListener("change", () => { ingestDraft.lot = lot.value.trim(); });
  ingestField(box, t("assets.lot"), lot, t("assets.lotHint"));

  const residency = document.createElement("select");
  residency.className = "ing-select";
  for (const r of RESIDENCIES) {
    const o = document.createElement("option");
    o.value = r;
    o.textContent = t(`assets.residency.${r}`);
    if (r === ingestDraft.residency) o.selected = true;
    residency.appendChild(o);
  }
  residency.addEventListener("change", () => {
    ingestDraft.residency = residency.value as Residency;
    renderStorage();      // the note appears/disappears with the choice
  });
  ingestField(box, t("assets.residencyLabel"), residency,
              ingestDraft.residency === "reference"
                ? t("assets.referenceNote")
                : t("assets.residentNote"));

  const scope = document.createElement("select");
  scope.className = "ing-select";
  for (const sc of SCOPES) {
    const o = document.createElement("option");
    o.value = sc;
    o.textContent = sc;
    if (sc === ingestDraft.scope) o.selected = true;
    scope.appendChild(o);
  }
  scope.addEventListener("change", () => {
    ingestDraft.scope = scope.value as Scope;
  });
  ingestField(box, t("assets.scope"), scope, t("assets.scopeHint"));

  // …and whether it is signed, said here rather than discovered at the funnel
  const problem = deliveryProblem();
  const verdict = ing("div", problem ? "ing-unsigned" : "ing-signed",
                      problem ?? t("assets.deliverySigned"));
  box.appendChild(verdict);
  return box;
}

/**
 * F3 · THE DEBT — «412 depositati, 0 firmati».
 *
 * Not a progress bar. Three hundred files do not have a percentage, they have
 * STATES, and the one that matters is the gap between the two columns: bytes are
 * in the store and nothing says who made them or what may be done with them.
 *
 * Two properties make it a debt rather than a notice:
 *
 *  · it is CUMULATIVE, kept on the draft and never derived from `items` — so
 *    «Clear done» tidies the list and does not tidy away the arrears. A debt
 *    that vanishes because you swept the desk is the palude;
 *  · it does not go away when ignored. It leaves only when the two numbers meet,
 *    which is the same shape as the endorsement counter in the narrative window
 *    («Endorse chapter (3)»), and for the same reason.
 *
 * Nothing to show before anything has been deposited: a zero debt is not news.
 */
function ingestDebt(): HTMLElement {
  const box = document.createElement("div");
  const { stored, signed } = ingestDraft;
  if (!stored) return box;
  const owed = Math.max(0, stored - signed);
  box.className = owed ? "ing-debt ing-debt-owed" : "ing-debt";
  box.textContent = t("assets.debt", {
    stored: String(stored), signed: String(signed),
  });
  if (owed) {
    box.title = t("assets.debtHint", { n: String(owed) });
  }
  return box;
}

/** F3 · how many files are in each state, RIGHT NOW — the four words, derived.
 *
 *  Derived here on purpose (unlike the debt): this is about the rows on screen,
 *  and a row that has been cleared is not waiting for anything. The byte side is
 *  the status; the paper side is `signed`; «deposited» is the honest name for
 *  arrived-but-unsigned, which no single enum value could have said. */
interface QueueTally {
  pending: number;
  stored: number;
  signed: number;
  failed: number;
}

function queueTally(): QueueTally {
  const tally = { pending: 0, stored: 0, signed: 0, failed: 0 };
  for (const item of ingestDraft.items) {
    if (item.status === "failed") tally.failed += 1;
    else if (item.status === "pending" || item.status === "working") tally.pending += 1;
    else if (item.signed) tally.signed += 1;
    else tally.stored += 1;
  }
  return tally;
}

/**
 * I2 · Quello che il verbale dice, in una casella della riga.
 *
 * **Il tono è già una specifica**, e sta scritto in testa al referto delle tre
 * classi: il verde è per un file accoppiato al suo timbro, l'ambra per un timbro
 * orfano, il rosso SOLO per qualcosa di rotto, e la normalità non ha colore
 * perché un referto che marchia la normalità insegna a ignorare i colori.
 *
 * Qui dentro quel vocabolario:
 *
 * * **timbrato all'origine** → verde, è lo stesso fatto che là si chiama
 *   `paired`: questi byte sono arrivati col verbale di chi li ha fatti;
 * * **verbale d'ingestione** → **nessun colore**. Non è un allarme: è l'esito
 *   onesto e frequentissimo, e colorarlo direbbe che qualcosa è andato storto
 *   mentre invece il sistema ha fatto esattamente il suo lavoro. Quello che si
 *   vede è la PAROLA, e il titolo dice perché è povera;
 * * **niente** → rosso, perché è l'unico caso rotto della serie: dei byte sono
 *   nello store e niente dice chi ce li ha messi.
 *
 * Prima del caricamento non c'è niente da dire e la casella non c'è: una casella
 * vuota per ogni riga in attesa sarebbe rumore su tutta la coda.
 */
function stampChip(item: IngestItem): HTMLElement {
  const chip = ing("span", "ing-stamp");
  if (item.stamped === undefined) return chip;   // non ancora caricato
  if (item.stamped === "own") {
    chip.classList.add("ing-stamp-own");
    chip.textContent = t("assets.stampedOwn");
    chip.title = t("assets.stampTravelled", { name: item.name });
  } else if (item.stamped === "ingestion") {
    chip.classList.add("ing-stamp-poor");
    chip.textContent = t("assets.poorProvenance");
    chip.title = t("assets.poorProvenanceHint");
  } else {
    chip.classList.add("ing-stamp-none");
    chip.textContent = t("assets.stampFailed", { detail: "" });
    chip.title = t("assets.stampFailed", { detail: "" });
  }
  return chip;
}

/** The queue: one row per file, with the deduced use as a correctable select. */
function ingestQueue(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-queue";
  if (!ingestDraft.items.length) {
    box.appendChild(ing("div", "insp-hint", t("assets.queueEmpty")));
    return box;
  }
  box.appendChild(ing("h3", "insp-sect",
    t("assets.queue", { n: String(ingestDraft.items.length) })));
  // F3 · the four states, always all four — a state showing only when it is
  // non-zero makes the row jump around and hides that nothing failed
  const tally = queueTally();
  // `ing-tally`, not `ing-state`: THAT class already exists on every row's own
  // status text (`state.className = "ing-state"` below), and reusing it put a
  // pill border round three digests — measured on screen, which is the only way
  // a collision like this is ever noticed.
  const states = ing("div", "ing-tallies");
  for (const key of ["pending", "stored", "signed", "failed"] as const) {
    const chip = ing("span", `ing-tally ing-tally-${key}`
      + (tally[key] ? "" : " ing-tally-none"),
      t(`assets.state.${key}`, { n: String(tally[key]) }));
    states.appendChild(chip);
  }
  box.appendChild(states);

  for (const [i, item] of ingestDraft.items.entries()) {
    const row = document.createElement("div");
    row.className = `ing-row ing-${item.status}`;

    const name = document.createElement("span");
    name.className = "storage-name";
    name.textContent = item.name;
    name.title = item.path ?? item.name;

    const kind = document.createElement("span");
    kind.className = "ing-kind";
    kind.textContent = item.kind;

    const use = document.createElement("select");
    use.className = "ing-select ing-use";
    for (const u of ["iiif", "proxy", "document", "evidence", "raw"] as ResourceUse[]) {
      const o = document.createElement("option");
      o.value = u;
      o.textContent = t(`assets.use.${u}`);
      if (u === item.use) o.selected = true;
      use.appendChild(o);
    }
    use.title = t("assets.useHint");
    use.addEventListener("change", () => { item.use = use.value as ResourceUse; });
    use.disabled = item.status === "done" || item.status === "working";

    const state = document.createElement("span");
    state.className = "ing-state";
    state.textContent = item.note
      ?? (item.digest ? item.digest.slice(0, 19) + "…" : t(`assets.status.${item.status}`));

    const drop = document.createElement("button");
    drop.className = "insp-btn";
    drop.textContent = "✕";
    drop.title = t("assets.remove");
    drop.addEventListener("click", () => {
      ingestDraft.items.splice(i, 1);
      renderStorage();
    });

    row.append(name, kind, use, stampChip(item), state, drop);
    if (item.nodeId) {
      row.addEventListener("dblclick", () => select(item.nodeId!));
      row.title = t("assets.openInspector");
    }
    box.appendChild(row);
  }
  return box;
}

/** Publish, and clear what has been published. */
function ingestPublishBar(): HTMLElement {
  const bar = ing("div", "insp-actions");
  const pending = ingestDraft.items.filter((i) => i.status === "pending").length;

  const problem = deliveryProblem();
  const publish = ing("button", "insp-btn",
    t("assets.publish", { n: String(pending) })) as HTMLButtonElement;
  // NO MUTE NO-OP, the same rule the window menus follow: a button that refuses
  // says why. Disabled only when there is genuinely nothing to send; an unsigned
  // delivery stays clickable and the click states the missing statement, because
  // «grey» is not a sentence somebody can act on.
  publish.disabled = !pending;
  publish.title = problem ?? t("assets.publishHint");
  if (problem) publish.classList.add("dd-disabled");
  publish.addEventListener("click", () => {
    const why = deliveryProblem();
    if (why) {
      toast(why);
      return;
    }
    void runDelivery();
  });
  bar.appendChild(publish);

  if (ingestDraft.items.some((i) => i.status !== "pending")) {
    const clear = ing("button", "insp-btn", t("assets.clearDone")) as HTMLButtonElement;
    clear.addEventListener("click", () => {
      ingestDraft.items = ingestDraft.items.filter((i) => i.status === "pending");
      renderStorage();
    });
    bar.appendChild(clear);
  }
  return bar;
}

/**
 * F2 · Publish the queue — **the bytes first, and the row as the file lands.**
 *
 * The order inside one file has not changed and is the point: the object goes to
 * the store, and only then does anything point at it. A crash leaves an orphan
 * object rather than a graph citing bytes that are not there.
 *
 * WHAT CHANGED IS WHERE THE LOT'S PAPERWORK HAPPENS. It used to be at the end:
 * upload all, then bucket, then `pushLotToRegister` once. Which means that a
 * delivery of four hundred photographs interrupted at the two-hundredth left two
 * hundred objects in the store that the register had never heard of — bytes
 * without a story, and nothing on screen to say which two hundred. Now each file
 * performs its own four acts as it arrives:
 *
 *   1. `PUT …/asset`                      the bytes
 *   2. `append resource`                  the register knows this file
 *   3. `append attribution`               and who says what about it
 *   4. `append acquisition`               and which lot it arrived in
 *
 * All four are idempotent, so an interrupted delivery is resumed by dropping the
 * same files again: nothing doubles. That is what makes writing early free.
 *
 * **A series is still a group.** Step 4 carries the DELIVERY's own
 * `acquisition_id` (`ingestDraft.lotId`), minted once, so every act adds a member
 * to the same event instead of minting a new one — see the note on `lotId`, which
 * is the trap this would otherwise have fallen into.
 */
async function publishQueue(): Promise<void> {
  const doc = store;
  const room = sync.room;
  if (!doc || !room) return;
  const base = getSettings().sync.hubUrl.replace(/\/+$/, "");
  const pending = ingestDraft.items.filter((i) => i.status === "pending");
  if (!pending.length) return;
  // the lot this delivery belongs to. Minted here rather than at the drop, so a
  // second drop after the queue drained joins the same lot as long as the panel
  // is open — the person did not change what they are doing.
  if (!ingestDraft.lotId) ingestDraft.lotId = crypto.randomUUID();

  const published: string[] = [];
  for (const item of pending) {
    item.status = "working";
    item.note = undefined;
    renderStorage();
    try {
      // ── reference: the bytes stay where they are ────────────────────────
      //
      // Nothing is uploaded, so nothing passes the gate — which is exactly what
      // the note above the toggle says. It needs a PATH: a file dropped from the
      // desktop has no location the graph could point at, and recording its name
      // would be a reference to nowhere.
      if (ingestDraft.residency === "reference") {
        if (!item.path) {
          item.status = "failed";
          item.note = t("assets.referenceNeedsPath");
          ingestLog(t("assets.referenceNeedsPath"), "warn");
          continue;
        }
        const digest = await bridgeChecksum(item.path);
        const nodeId = writeResourceNode(doc, item, digest, item.path);
        item.nodeId = nodeId;
        item.digest = digest ?? undefined;
        item.status = "referenced";
        item.note = t("assets.status.referenced");
        published.push(nodeId);
        ingestDraft.stored += 1;
        await landRow(doc, item);
        continue;
      }

      const bytes = item.file
        ? await item.file.arrayBuffer()
        : await bridgeBytes(item.path!);
      const url = `${base}/v1/rooms/${encodeURIComponent(room)}/asset`
        + `?media_type=${encodeURIComponent(item.mediaType)}`;
      const answer = await fetch(url, {
        method: "PUT",
        headers: hubToken ? { Authorization: `Bearer ${hubToken}` } : {},
        body: bytes,
      });
      if (!answer.ok) {
        item.status = "failed";
        item.note = `${answer.status} ${await answer.text()}`.slice(0, 120);
        ingestLog(t("storage.uploadFailed", { detail: item.note }), "warn");
        continue;
      }
      const info = await answer.json() as {
        ref: string; size?: number; created?: boolean;
      };

      // SUPERSESSION · same name, other bytes. Said BEFORE the node is written,
      // with the citations at stake, because after the fact it is archaeology.
      const superseded = supersessionOf(doc, item.name, info.ref);
      if (superseded) {
        const message = t("assets.superseded", {
          name: superseded.previousName,
          n: String(superseded.usages.length),
        });
        toast(message);
        ingestLog(message, "warn");
        item.note = t("assets.supersedes", { n: String(superseded.usages.length) });
      }

      item.digest = info.ref;
      item.nodeId = writeResourceNode(doc, item, info.ref,
                                      `${base}/v1/rooms/${encodeURIComponent(room)}`
                                      + `/asset/${encodeURIComponent(info.ref)}`);
      item.status = info.created === false ? "same" : "done";
      published.push(item.nodeId);
      ingestDraft.stored += 1;
      ingestLog(info.created === false
        ? t("storage.uploadSame", { sha: info.ref.slice(0, 19) })
        : t("storage.uploaded", { sha: info.ref.slice(0, 19) }));
      // …AND ITS ROW, NOW. Not at the end of the lot: what has arrived already
      // has its story.
      await landRow(doc, item);
      // …E IL SUO VERBALE, NOW. Stessa ragione, e io l'avevo sbagliata: lo
      // facevo per l'intero lotto alla fine, cioè esattamente l'errore che le
      // quattro righe qui sopra raccontano di aver già corretto una volta. Una
      // consegna di quattrocento fotografie interrotta alla duecentesima
      // lasciava duecento oggetti nello store senza niente che dicesse chi ce
      // li aveva messi — che è il caso peggiore, quello per cui la regola
      // esiste. Misurato che si può fare per file senza gemmare eventi: l'atto
      // porta un NOME stabile, `bucket_acquisition` ne deriva l'id, e
      // quattrocento chiamate danno un `process_id` solo (1–15 ms l'una).
      await stampOne(item, base, room);
    } catch (err) {
      item.status = "failed";
      item.note = String(err instanceof Error ? err.message : err).slice(0, 120);
      ingestLog(t("storage.uploadFailed", { detail: item.note }), "warn");
    }
    renderStorage();
  }

  if (published.length) {
    // THE BUCKET GOES IN THE DOCUMENTATION, not in the matrix.
    //
    // The resources stay in the study graph (that is where they are USED, and
    // where `has_linked_resource` reaches them); the acquisition that brought
    // them in — and the licence said over the lot — belongs in the corpus. The
    // assets are mirrored there under their own ids: the same node id in two
    // members is the shared leaf, not a copy (`s3dgraphy.dtc.corpus`).
    const corpus = documentationCorpus()!;
    for (const id of published) {
      const node = doc.node(id);
      if (node) mirrorIntoCorpus(corpus, node);
    }
    // The BUCKET and the lot's own attribution — both already performed per file
    // by `landRow`, and repeated here over the whole set for one reason: this
    // call is what makes `data.member_count` and the lot's own rights consistent
    // in ONE step at the end, and it is idempotent, so it costs nothing. The
    // per-file calls are what survive an interruption; this is the tidy-up.
    const lot = bucketAcquisition(corpus, {
      acquisitionId: ingestDraft.lotId ?? undefined,
      resources: published,
      name: ingestDraft.lot || undefined,
      metadata: {
        ingested_at: new Date().toISOString(),
        source: ingestDraft.items.some((i) => i.path) ? "filesystem" : "drop",
      },
    });
    ingestDraft.lastAcquisition = lot.acquisitionId;
    for (const w of lot.warnings) ingestLog(w, "warn");

    // …and the LOT is attributed, once. `setNodeRights` signs it with the
    // session's ORCID (the attributor), which is a different person from the
    // author whenever somebody catalogues what a colleague made.
    corpus.setNodeRights(lot.acquisitionId, {
      license: ingestDraft.license,
      ...(ingestDraft.authorOrcid || ingestDraft.authorName
        ? { author: ingestDraft.authorName || ingestDraft.authorOrcid,
            orcid: ingestDraft.authorOrcid }
        : {}),
    });
    ingestLog(t("assets.bucketed", {
      n: String(lot.count),
      lot: corpus.node(lot.acquisitionId)?.name ?? lot.acquisitionId,
    }));
    // the selection stays on the STUDY's side (the asset), because that is the
    // node the inspector can show rights and usages for
    select(published[0]);
    draw();
    renderEmData();
    refreshInspector();
  }
  renderStorage();
}

/** One object into the room's store. The reference IS the digest, so the caller
 *  can always verify what it got — which is why nothing here trusts a name. */
async function putIntoStore(bytes: BodyInit, mediaType: string):
    Promise<{ ref: string; created: boolean } | null> {
  const base = getSettings().sync.hubUrl?.replace(/\/+$/, "") ?? "";
  const room = sync.room;
  if (!base || !room) return null;
  const answer = await fetch(
    `${base}/v1/rooms/${encodeURIComponent(room)}/asset`
    + `?media_type=${encodeURIComponent(mediaType)}`,
    { method: "PUT",
      headers: hubToken ? { Authorization: `Bearer ${hubToken}` } : {},
      body: bytes });
  if (!answer.ok) return null;
  const info = await answer.json() as { ref: string; created?: boolean };
  return { ref: info.ref, created: info.created !== false };
}

/**
 * I2 · **Niente entra nello store senza un verbale**, e I3 · il verbale viaggia
 * con i byte. **Un file alla volta, appena atterra.**
 *
 * Per file e non per lotto, ed è una correzione a me stesso: lo facevo alla fine
 * della consegna, cioè ripetevo l'errore che il ciclo qui sopra racconta di aver
 * già corretto una volta — «una consegna di quattrocento fotografie interrotta
 * alla duecentesima lasciava duecento oggetti nello store che il registro non
 * aveva mai sentito nominare». Con il verbale in fondo, quei duecento oggetti
 * restavano senza NIENTE che dicesse chi ce li aveva messi, che è precisamente
 * il caso peggiore e la ragione per cui questa regola esiste.
 *
 * Costa poco e **non gemma eventi**, misurato: l'atto porta un nome stabile
 * (`ingestione · <stanza>`), `bucket_acquisition` deriva l'id dell'evento da
 * quel nome, e due chiamate separate tornano lo STESSO `process_id` in 1–15 ms
 * l'una — contro i ~250 ms che un file costa comunque fra byte e registro.
 *
 * Due strade, e la differenza fra loro è tutta la notte:
 *
 * * il file **porta già il suo timbro** — un `.stamp.json` accanto, accettato
 *   per IMPRONTA e non per nome. Si carica com'è: è il verbale di chi l'ha
 *   fatto, e riscriverlo sarebbe sostituire la sua provenienza con la nostra;
 * * il file **non è timbrato** — e allora l'ingestione *è* l'atto, e si timbra
 *   quella. Un verbale povero, che dice soltanto «questa cosa è entrata qui, per
 *   mano di questa persona, e nessuno ha dichiarato da dove venisse».
 *
 * **Dove va il verbale nello store**, e la risposta non è scelta a tavolino: la
 * radice del bucket è uno spazio di chiavi indirizzato dal contenuto — la chiave
 * *è* l'esadecimale dei byte, misurato — e i documenti con un nome stanno sotto
 * un prefisso (`studies/`, `em/`, `blend-backups/`). Un timbro è un file, e un
 * file in questo store si mette dove si mettono i file: **come oggetto suo, alla
 * sua impronta**. È anche l'unica forma che rispetta la regola secondo cui due
 * timbri che si contraddicono sullo stesso digest sono una scoperta e non un
 * errore — due chiavi diverse, sopravvivono entrambi — mentre come metadato
 * dell'oggetto il secondo sovrascriverebbe il primo, per giunta su un oggetto
 * **deduplicato** (misurato: `created: false` al secondo caricamento degli
 * stessi byte) e quindi condiviso con chiunque altro li abbia caricati.
 *
 * Il legame digest-artefatto → digest-verbale non sta nella chiave: sta nel
 * grafo, ed è già una domanda che qualcuno sa rispondere
 * (`GET /v1/corpus/neighbourhood?sha256=`). Quello che manca è una rotta che
 * serva un timbro per nome — sta nel repo del server, e questa notte non lo
 * tocca: nell'END OF.
 */
async function stampOne(item: IngestItem, base: string, room: string):
    Promise<void> {
  item.stamped = false;
  const me = currentIdentity();
  if (!me?.orcid) {
    // Non dovrebbe accadere — il pannello non si apre senza identità — ma se
    // accadesse, timbrare a nome di nessuno sarebbe peggio del non timbrare.
    ingestLog(t("assets.stampNeedsIdentity"), "warn");
    return;
  }

  // ── chi porta già il suo verbale ─────────────────────────────────────────
  const own = item.path ? await readStamp(stampPathFor(item.path)) : null;
  // ACCETTATO PER IMPRONTA, MAI PER NOME. Un file riesportato sopra ha accanto
  // un timbro che parla di byte che non ci sono più: attaccarlo a questi sarebbe
  // la provenienza falsa contro cui tutto questo è costruito.
  if (own && sameDigest(own.self?.digest, item.digest)) {
    const sent = await sendStamp(own);
    if (sent) {
      item.stamped = "own";
      item.stampRef = sent;
      ingestLog(t("assets.stampTravelled", { name: item.name }));
    } else {
      ingestLog(t("assets.stampNotTravelled", { name: item.name }), "warn");
    }
    await noteWhereItLanded(item, base, room);
    return;
  }
  if (own) {
    // il timbro c'è ma parla d'altro: è un'affermazione vera su byte diversi, e
    // va detto — non riusato e non cancellato
    ingestLog(t("assets.stampMismatch", { name: item.name }), "warn");
  }

  // ── …e chi no: l'ingestione è l'atto, e si timbra quella ─────────────────
  const at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const body = ingestionAct([{
    resourceId: item.nodeId ?? `res:${(item.digest ?? "").slice(7, 19)}`,
    digest: item.digest ?? "",
    name: item.name,
    mediaType: item.mediaType,
    sizeBytes: item.size || undefined,
    room,
    operator: { id: `https://orcid.org/${me.orcid}` },
    at,
    tool: `EMStudio ${__EMSTUDIO_VERSION__}`,
    path: item.path,
  }], { room, graph_id: store?.doc.graph?.graph_id });
  if (!body) return;

  let out: { ok?: boolean; stamps?: Array<{ stamp: unknown }>; error?: string };
  try {
    const res = await fetch(`${await bridgeUrl()}/stamp/emit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    out = await res.json();
  } catch (err) {
    ingestLog(t("assets.stampFailed", {
      detail: String(err instanceof Error ? err.message : err) }), "warn");
    return;
  }
  const stamp = out.stamps?.[0]?.stamp as Stamp | undefined;
  if (!out.ok || !stamp) {
    ingestLog(t("assets.stampFailed", { detail: out.error ?? "" }), "warn");
    return;
  }
  const sent = await sendStamp(stamp);
  if (!sent) {
    ingestLog(t("assets.stampNotTravelled", { name: item.name }), "warn");
    return;
  }
  item.stamped = "ingestion";
  item.stampRef = sent;
  ingestLog(t("assets.ingestionStamped", { name: item.name }));
  await noteWhereItLanded(item, base, room);
}

/** Il verbale nello store, come oggetto suo. Leggibile e non compatto: il
 *  lettore di ultima istanza è un umano con un editor, fra trent'anni. */
async function sendStamp(stamp: Stamp): Promise<string | null> {
  const sent = await putIntoStore(
    new Blob([JSON.stringify(stamp, null, 1)], { type: "application/json" }),
    "application/json");
  return sent?.ref ?? null;
}


/**
 * I4 · L'indirizzo pubblico dello store, registrato **fuori** dal verbale.
 *
 * Per file, come tutto il resto di questa consegna: si annota dove QUESTI byte
 * sono atterrati, appena sono atterrati.
 *
 * Un URI è una POSIZIONE, e le posizioni stanno fuori dal record immutabile —
 * non per ordine ma per necessità: riscrivere un timbro ne cambierebbe i byte e
 * quindi l'identità, che è il digest di ciò che descrive. Quindi si scrive una
 * pista `public`, e **il timbro non si tocca mai**: `writeHints` rifiuta per
 * nome qualunque percorso che non finisca in `.hints.json`, e la rotta del
 * bridge lo rifiuta una seconda volta — l'invariante è custodito ai due estremi.
 *
 * Solo per i file che un percorso ce l'hanno: il registro delle piste è un file
 * accanto al file, e per dei byte arrivati dal browser non c'è un accanto.
 */
async function noteWhereItLanded(
  item: IngestItem, base: string, room: string,
): Promise<void> {
  if (!item.path || !item.digest) return;
  const noted = await recordFound(item.digest,
                                  storeLocator(base, room, item.digest),
                                  { anchor: item.path });
  if (noted.written) ingestLog(t("assets.hintWritten", { name: item.name }));
}

// ── THE RESIDENT REGISTER · the corpus StratiGraph Server can enforce from ────────────
//
// Two corpora, one shape, and the difference is who can READ them:
//
// * the **file** corpus (`container.corpus`) travels inside the project. It is
//   the truth offline, and it is what standalone has always used;
// * the **resident** corpus lives in the room's instance (`GET /v1/corpus`,
//   `POST /v1/corpus/append`). It is the one StratiGraph Server reads when it serves an
//   asset — which is why a licence declared only in the file was measured coming
//   back as `x-em-license: null`: the server had no way to see it.
//
// So in a room the two are kept in step: what this client documents is ALSO
// declared in the register (`pushLotToRegister`), and what the register knows
// about this study's files is folded back in (`pullResidentCorpus`). Additively
// in both directions — the register is shared, and nothing here may quietly
// overwrite what a colleague said about a file.

/** The room's StratiGraph Server base URL, or null when this session is not in a room. */
function registerBase(): string | null {
  const base = getSettings().sync.hubUrl?.replace(/\/+$/, "") ?? "";
  if (!base || !sync.room) return null;
  return base;
}

/** One act on the resident register. Never throws: a register that is not there
 *  must not break an ingestion that has already put the bytes in the store — the
 *  file corpus still has the statement, and the note says what did not travel. */
async function registerAppend(act: string, body: Record<string, unknown>):
    Promise<{ ok: boolean; report?: Record<string, unknown>; detail?: string }> {
  const base = registerBase();
  if (!base) return { ok: false, detail: "standalone" };
  try {
    const answer = await fetch(`${base}/v1/corpus/append`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(hubToken ? { Authorization: `Bearer ${hubToken}` } : {}),
      },
      body: JSON.stringify({ act, ...body }),
    });
    if (!answer.ok) {
      return { ok: false, detail: `${answer.status} ${(await answer.text()).slice(0, 140)}` };
    }
    const parsed = await answer.json() as { report?: Record<string, unknown> };
    return { ok: true, report: parsed.report };
  } catch (err) {
    return { ok: false, detail: String(err instanceof Error ? err.message : err) };
  }
}

// `pushLotToRegister` lived here and is GONE: it was the end-of-lot version of
// what `landRow` now does per file, and keeping both would have left two places
// that know the order of the four acts. The per-file one is the one that
// survives an interruption, so it is the one that stays.

/**
 * F2 · ONE FILE'S ROW, written the moment its bytes are in.
 *
 * Four acts for one file, in the order that cannot leave a lie behind: the
 * register learns the file, then what is claimed about it, then which lot it came
 * in with. Every one of them idempotent — which is what allows this to run per
 * file instead of per lot, and what makes «drop them again» a complete recovery.
 *
 * The local file corpus is written too, and FIRST: it is the truth offline, and a
 * room that is unreachable must not cost the documentation. `registerAppend`
 * never throws for the same reason — a register that is not there is a step that
 * did not travel, logged, not an ingestion that failed.
 *
 * The ATTRIBUTOR is never sent. The server takes it from the token
 * (`enrich_asset_dtc(attributor=…)`, which refuses an unsigned attribution as «a
 * rumour»), and a field for it here would be a place to write somebody else's
 * name — which is precisely why the depositor is not a box in the form either.
 */
async function landRow(doc: DocumentStore, item: IngestItem): Promise<void> {
  const digest = item.digest;
  const nodeId = item.nodeId;
  if (!nodeId) return;

  // ── the file corpus, always ───────────────────────────────────────────────
  const corpus = documentationCorpus();
  const node = doc.node(nodeId);
  if (corpus && node) {
    mirrorIntoCorpus(corpus, node);
    const lot = bucketAcquisition(corpus, {
      acquisitionId: ingestDraft.lotId ?? undefined,
      resources: [nodeId],
      name: ingestDraft.lot || undefined,
      metadata: { ingested_at: new Date().toISOString(), source: "EMStudio" },
    });
    ingestDraft.lastAcquisition = lot.acquisitionId;
  }

  // ── the register, when there is one ───────────────────────────────────────
  if (!registerBase() || !digest) return;
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const residency = String(data.residency ?? "resident");
  const known = await registerAppend("resource", {
    checksum: digest,
    name: node?.name ?? nodeId,
    media_type: data.media_type ?? undefined,
    residency,
    url: residency === "reference" ? data.url ?? undefined : undefined,
  });
  if (!known.ok) {
    ingestLog(t("assets.registerFailed", { detail: known.detail ?? "" }), "warn");
    return;
  }
  const said = await registerAppend("attribution", {
    checksum: digest,
    license: ingestDraft.license || undefined,
    author: ingestDraft.authorOrcid || ingestDraft.authorName || undefined,
    author_name: ingestDraft.authorName || undefined,
    embargo: ingestDraft.embargoUntil || undefined,
    reason: ingestDraft.embargoReason || undefined,
  });
  if (!said.ok) {
    ingestLog(t("assets.registerFailed", { detail: said.detail ?? "" }), "warn");
    return;
  }
  item.signed = true;
  ingestDraft.signed += 1;
  // and LAST the lot, carrying the delivery's own id so this adds a member
  // instead of minting a second event (see `lotId`)
  const grouped = await registerAppend("acquisition", {
    acquisition_id: ingestDraft.lotId ?? undefined,
    resources: [digest],
    name: ingestDraft.lot || undefined,
    metadata: { ingested_at: new Date().toISOString(), source: "EMStudio" },
  });
  if (!grouped.ok) {
    ingestLog(t("assets.registerFailed", { detail: grouped.detail ?? "" }), "warn");
  }
}

/**
 * Fold what the register knows about THIS study's files into the local corpus.
 *
 * The slice, not the whole register: a study cites a handful of assets out of a
 * documentation that may hold thousands. Additive — a node already here keeps
 * what it says, and only fields it left empty are filled in — because the local
 * corpus may be mid-edit and a fetch must not undo somebody's typing.
 *
 * Returns how many nodes and edges arrived, so the caller can say so rather than
 * claim it worked.
 */
async function pullResidentCorpus(): Promise<{ nodes: number; edges: number } | null> {
  const base = registerBase();
  if (!base) return null;
  const doc = store;
  if (!doc) return null;
  const digests = [...new Set(doc.liveNodes()
    .map((n) => String(((n.data ?? {}) as Record<string, unknown>).checksum ?? ""))
    .filter(Boolean))];
  if (!digests.length) return { nodes: 0, edges: 0 };
  try {
    const url = `${base}/v1/corpus?sha256=${encodeURIComponent(digests.join(","))}`;
    const answer = await fetch(url, {
      headers: hubToken ? { Authorization: `Bearer ${hubToken}` } : {},
    });
    if (!answer.ok) {
      ingestLog(t("assets.registerFailed", {
        detail: `${answer.status} ${(await answer.text()).slice(0, 140)}`,
      }), "warn");
      return null;
    }
    const body = await answer.json() as {
      graph?: { nodes?: EmNode[]; edges?: EmEdge[] };
    };
    const corpus = documentationCorpus()!;
    let nodes = 0;
    let edges = 0;
    for (const node of body.graph?.nodes ?? []) {
      if (!node?.id) continue;
      // the graph-scope node of a member is bookkeeping, not documentation
      if (node.node_type === "geo_position") continue;
      if (corpus.node(node.id)) continue;
      corpus.addNode(node);
      nodes += 1;
    }
    for (const edge of body.graph?.edges ?? []) {
      if (!edge?.source || !edge?.target) continue;
      if (!corpus.node(edge.source) || !corpus.node(edge.target)) continue;
      if (corpus.hasEdge(edge.source, edge.target, String(edge.edge_type ?? ""))) continue;
      corpus.addEdge(edge.source, edge.target, String(edge.edge_type ?? ""));
      edges += 1;
    }
    return { nodes, edges };
  } catch (err) {
    ingestLog(t("assets.registerFailed", {
      detail: String(err instanceof Error ? err.message : err),
    }), "warn");
    return null;
  }
}

/**
 * Put an asset in the corpus **under its own id** — the shared leaf.
 *
 * The TS twin of `s3dgraphy.dtc.corpus.mirror_resource`: what travels is the
 * little that makes the corpus readable on its own (name, checksum, residency,
 * media type), and a field already there is never clobbered by a thinner copy.
 * The id is the identity, so the study's `has_linked_resource` and the corpus's
 * `dtc_had_output` point at the same asset.
 */
function mirrorIntoCorpus(corpus: DocumentStore, node: EmNode): void {
  const source = (node.data ?? {}) as Record<string, unknown>;
  const keep = ["url", "url_type", "checksum", "residency", "scope",
                "media_type", "size", "resource_use"] as const;
  const existing = corpus.node(node.id);
  const data: Record<string, unknown> = existing
    ? { ...((existing.data ?? {}) as Record<string, unknown>) } : {};
  for (const key of keep) {
    if (source[key] !== undefined && data[key] === undefined) data[key] = source[key];
  }
  if (existing) {
    corpus.updateNode(existing.id, { data } as Partial<EmNode>);
    return;
  }
  corpus.addNode({
    id: node.id,
    name: node.name,
    node_type: "resource",
    description: "",
    data,
  } as unknown as EmNode);
}

/** The resource node for one published item — created, or found by digest and
 *  updated. The node POINTS at the bytes; it never carries them. */
function writeResourceNode(
  doc: DocumentStore, item: IngestItem, digest: string | null, url: string,
): string {
  const existing = digest ? findResource(doc, digest) : null;
  const data: Record<string, unknown> = {
    ...(digest ? { checksum: digest } : {}),
    media_type: item.mediaType,
    residency: ingestDraft.residency,
    scope: ingestDraft.scope,
    // the DEDUCED kind and the (correctable) use, kept apart: one is a fact
    // about the bytes, the other a decision about them
    url_type: item.kind,
    resource_use: item.use,
    ...(item.size ? { size: item.size } : {}),
    url,
  };
  if (existing) {
    doc.updateNode(existing.id, {
      data: { ...(existing.data as Record<string, unknown> | undefined), ...data },
    } as Partial<EmNode>);
    return existing.id;
  }
  const node = doc.addNode({
    id: doc.newId(),
    name: item.name,
    node_type: "resource",
    description: "",
    data,
  } as unknown as EmNode);
  return node.id;
}

/** The bridge holds the bytes of a file on disk — the page may not read it. */
async function bridgeBytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(await fsFileUrl(path));
  if (!res.ok) throw new Error(`bridge ${res.status}`);
  return await res.arrayBuffer();
}

/** …and it is also the only side that can hash it. Null when it cannot: a
 *  reference without a digest is weaker, and saying so beats inventing one. */
async function bridgeChecksum(path: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${await bridgeUrl()}/fs/checksum?path=${encodeURIComponent(path)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { checksum?: string };
    return data.checksum ?? null;
  } catch {
    return null;
  }
}

/**
 * The DOCUMENTATION, as the corpus holds it: the lots, and one line of counts.
 *
 * Read from the corpus member and not from the study graph — that is the whole
 * separation. The line under the title is the forest in numbers, and the number
 * worth watching is `shared`: a file more than one chain consumed, which is what
 * a stratigraphic matrix could not draw.
 */
function ingestLots(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-lots";
  const corpus = documentationCorpus({ create: false });
  const lots = corpus ? acquisitions(corpus) : [];
  const chains = corpus
    ? corpus.liveNodes().filter((n) => n.node_type === "dtc_process").length : 0;
  const shared = corpus ? sharedLeaves(corpus).length : 0;
  if (!lots.length && !chains) return box;
  box.appendChild(ing("h3", "insp-sect", t("assets.corpus")));
  box.appendChild(ing("div", "insp-hint", t("assets.corpusCounts", {
    lots: String(lots.length), chains: String(chains), shared: String(shared),
  })));
  // …and the way to LOOK at it. The DTC projection draws the corpus as the DAG
  // it is (acquisitions → transformations → outputs, a shared leaf showing both
  // of its inputs); getting there used to mean knowing that a graph window has a
  // mode called DTC, which is knowledge about the app rather than about the work.
  const seeBar = ing("div", "insp-actions");
  const see = ing("button", "insp-btn", t("assets.seeDag")) as HTMLButtonElement;
  see.title = t("assets.seeDagHint");
  see.addEventListener("click", () => openCorpusDag());
  seeBar.appendChild(see);
  // …and, in a room, the REGISTER: the documentation the instance holds about
  // the files this study cites. Offered rather than done silently on every
  // repaint, because it is a network call and a fetch nobody asked for is a
  // fetch nobody can explain.
  if (registerBase()) {
    const pull = ing("button", "insp-btn", t("assets.readRegister")) as HTMLButtonElement;
    pull.title = t("assets.readRegisterHint");
    pull.addEventListener("click", () => {
      pull.disabled = true;
      void pullResidentCorpus().then((got) => {
        pull.disabled = false;
        if (!got) return;
        ingestLog(t("assets.registerRead", {
          n: String(got.nodes), e: String(got.edges),
        }));
        renderStorage();
        buildScenes();
        draw();
      });
    });
    seeBar.appendChild(pull);
  }
  box.appendChild(seeBar);
  for (const lot of lots) {
    const row = document.createElement("div");
    row.className = "ing-row";
    const name = document.createElement("span");
    name.className = "storage-name";
    name.textContent = lot.name;
    const meta = document.createElement("span");
    meta.className = "storage-meta";
    meta.textContent = t("assets.lotMembers", { n: String(lot.count) });
    row.append(name, meta);
    row.addEventListener("click", () => { select(lot.id); refreshInspector(); });
    box.appendChild(row);
  }
  return box;
}

/**
 * DECLARE a derivation: this output came out of those inputs, with this tool.
 *
 * Two selects and a text field, and no cleverness whatsoever — the whole design
 * decision is that nothing here is inferred. The input list offers the lots
 * first (a campaign is one input) and then the resources.
 */
function ingestDerivation(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-derivation";
  const doc = documentationCorpus({ create: false });
  if (!doc) {
    box.appendChild(ing("div", "insp-hint", t("assets.corpusEmpty")));
    return box;
  }
  const resources = doc.liveNodes().filter((n) => n.node_type === "resource");
  if (!resources.length) {
    box.appendChild(ing("div", "insp-hint", t("assets.corpusEmpty")));
    return box;
  }

  box.appendChild(ing("h3", "insp-sect", t("assets.derivation")));
  box.appendChild(ing("div", "insp-hint", t("assets.derivationHint")));

  const output = document.createElement("select");
  output.className = "ing-select";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = t("assets.pickOutput");
  output.appendChild(blank);
  for (const r of resources) {
    const o = document.createElement("option");
    o.value = r.id;
    o.textContent = r.name || r.id;
    if (r.id === derivationDraft.output) o.selected = true;
    output.appendChild(o);
  }
  output.addEventListener("change", () => {
    derivationDraft.output = output.value;
    refreshDeclare();
  });
  ingestField(box, t("assets.output"), output);

  const inputs = document.createElement("select");
  inputs.className = "ing-select";
  inputs.multiple = true;
  inputs.size = 4;
  for (const lot of acquisitions(doc)) {
    const o = document.createElement("option");
    o.value = lot.id;
    o.textContent = `▣ ${lot.name} (${lot.count})`;
    if (derivationDraft.inputs.includes(lot.id)) o.selected = true;
    inputs.appendChild(o);
  }
  for (const r of resources) {
    const o = document.createElement("option");
    o.value = r.id;
    o.textContent = r.name || r.id;
    if (derivationDraft.inputs.includes(r.id)) o.selected = true;
    inputs.appendChild(o);
  }
  inputs.addEventListener("change", () => {
    derivationDraft.inputs = Array.from(inputs.selectedOptions).map((o) => o.value);
    refreshDeclare();
  });
  ingestField(box, t("assets.inputs"), inputs, t("assets.inputsHint"));

  const tool = document.createElement("input");
  tool.className = "insp-name-input";
  tool.value = derivationDraft.tool;
  tool.placeholder = t("assets.toolPlaceholder");
  tool.addEventListener("change", () => { derivationDraft.tool = tool.value.trim(); });
  ingestField(box, t("assets.tool"), tool, t("assets.toolHint"));

  const bar = ing("div", "insp-actions");
  const declare = ing("button", "insp-btn", t("assets.declare")) as HTMLButtonElement;
  // The form does NOT re-render on every choice (that would take the focus out
  // of the list you are picking from), so the button's own state is refreshed
  // by hand. Measured live: without this it stayed disabled after a perfectly
  // valid output + input had been chosen, which reads as "this does not work".
  const refreshDeclare = (): void => {
    declare.disabled = !derivationDraft.output || !derivationDraft.inputs.length;
  };
  refreshDeclare();
  declare.addEventListener("click", () => {
    const corpus = documentationCorpus({ create: false });
    if (!corpus) return;
    try {
      const res = declareDerivation(corpus, {
        output: derivationDraft.output,
        inputs: derivationDraft.inputs,
        tool: derivationDraft.tool || undefined,
      });
      for (const w of res.warnings) ingestLog(w, "warn");
      ingestLog(t("assets.declared", {
        out: corpus.node(res.output)?.name ?? res.output,
        n: String(res.inputs.length),
      }));
      // the chain lives in the corpus, so there is nothing to select on the
      // study canvas: the selection stays where the user left it
      draw();
      renderEmData();
      refreshInspector();
      renderStorage();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      toast(detail);
      ingestLog(detail, "warn");
    }
  });
  bar.appendChild(declare);
  box.appendChild(bar);
  return box;
}

/** The panel's own trail. The Log window keeps the durable one — this is the
 *  three lines somebody needs without looking away from the form. */
function ingestTrail(): HTMLElement {
  const box = document.createElement("div");
  box.className = "ing-trail";
  if (!ingestDraft.log.length) return box;
  box.appendChild(ing("h3", "insp-sect", t("assets.trail")));
  for (const line of ingestDraft.log.slice(0, 8)) {
    box.appendChild(ing("div", "insp-hint", line));
  }
  return box;
}

function storageRow(win: Win, entry: FsEntry): HTMLElement {
  const row = document.createElement("div");
  row.className = "storage-row" + (entry.outside ? " storage-outside" : "");
  row.dataset.path = entry.path;

  const icon = document.createElement("span");
  icon.className = "storage-icon";
  icon.textContent =
    entry.type === "dir" ? "📁" : kindOfExt(entry.ext) === "pdf" ? "📄" : kindOfExt(entry.ext) === "image" ? "🖼" : "•";
  const name = document.createElement("span");
  name.className = "storage-name";
  name.textContent = entry.name;
  const meta = document.createElement("span");
  meta.className = "storage-meta";
  meta.textContent = entry.type === "dir"
    ? ""
    : `${formatBytes(entry.size)} · ${new Date(entry.mtime * 1000).toLocaleDateString()}`;
  row.append(icon, name, meta);

  if (entry.outside) {
    // The bridge already told us this one will be refused (a symlink out of the
    // roots). Saying so here beats letting the user find out by clicking.
    row.title = t("storage.outside");
    return row;
  }

  if (entry.type === "file" && storageSelected(win) === entry.path) {
    row.classList.add("storage-selected");
  }
  row.addEventListener("click", () => {
    // ONE click selects a file; a folder is navigated and never selected (see
    // `storageSelected`). Clicking the selected one again clears it, so there is
    // a way back to «nothing is selected» that is not a keyboard secret.
    if (entry.type !== "file") return;
    setStorageSelected(win, storageSelected(win) === entry.path ? null : entry.path);
  });
  row.addEventListener("dblclick", () => {
    if (entry.type === "dir") setStoragePath(win, entry.path);
  });
  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    const payload: StorageDragPayload = {
      path: entry.path,
      type: entry.type,
      name: entry.name,
      ext: entry.ext,
    };
    e.dataTransfer?.setData(STORAGE_MIME, JSON.stringify(payload));
    // A plain-text flavour too, so dropping on anything else at least yields
    // the path rather than nothing.
    e.dataTransfer?.setData("text/plain", entry.path);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
  });
  return row;
}

/** The dropped Storage entry, or null when this drag is not one of ours. */
function storageDragPayload(e: DragEvent): StorageDragPayload | null {
  const raw = e.dataTransfer?.getData(STORAGE_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StorageDragPayload;
  } catch {
    return null; // a foreign drag claiming our mime is not worth a crash
  }
}

/**
 * PIN a Viewer window to a dropped folder or file.
 *
 * "Pinned" is the honest word: from here the window shows what you dropped and
 * stops following the selection, until `Collezione ▸ Segui la selezione` in its
 * own menu. A window that silently went back to the selection on the next click
 * would lose the folder you just went and found.
 */
function pinViewerCollection(win: Win, payload: StorageDragPayload): void {
  setWinCurrent(win, "collection", {
    kind: payload.type === "dir" ? "folder" : "file",
    ref: payload.path,
  });
  setWinCurrent(win, "item", null);
  viewerCollections.clear();
  // A folder IS a collection, and Gallery is the reading that shows it as one.
  // A single file stays in Single: there is nothing to lay out.
  setWinModeOf(win, payload.type === "dir" ? "gallery" : "single");
  renderViewer();
  renderAreaHeaders();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * DS4 · add a folder the bridge will serve.
 *
 * Granting access to a folder is a decision, so it is explicit, narrow and
 * remembered: one folder, named by the person, saved by the bridge. There is no
 * "serve the whole disk" here and there will not be — the sandbox exists so the
 * browser can see a library or a DOSCO folder and nothing else.
 */
/** The PLACES menu under Storage's "+ 📁".
 *
 * The button's job is "serve one more folder", and until now it did that by
 * asking for an absolute path in a `prompt` — the least usable control in the
 * app, on a machine where Home and Documents are two clicks away. So it opens
 * the same list the mapping editor's sidebar shows (`/fs/places`, computed by
 * the bridge from the machine), each row granting that folder; typing a path is
 * still there, as the last entry, for a folder that is nobody's standard place.
 */
async function openStoragePlaces(win: Win, anchor?: HTMLElement): Promise<void> {
  // The button lives in the WINDOW HEADER (`buildHeaderStrip`), one per storage
  // window — so the menu is a body-level element positioned under whichever
  // button was pressed, rather than a fixed node next to one of them.
  const existing = document.getElementById("storage-places");
  if (existing) {
    existing.remove();
    if (existing.dataset.anchor === anchorKey(anchor)) return;   // toggle off
  }
  const menu = document.createElement("div");
  menu.id = "storage-places";
  menu.className = "storage-places";
  menu.dataset.anchor = anchorKey(anchor);
  document.body.appendChild(menu);
  const rect = anchor?.getBoundingClientRect();
  if (rect && rect.width) {
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
    menu.style.top = `${rect.bottom + 4}px`;
  } else {
    // a button that is not laid out (a header of a window that is not on screen)
    // has a zero rect, and pinning to it puts the menu in the top-left corner
    // over the app's own menus — measured. Centred is the honest fallback.
    menu.style.left = "50%";
    menu.style.top = "20%";
    menu.style.transform = "translateX(-50%)";
  }
  const waiting = document.createElement("div");
  waiting.className = "storage-place muted";
  waiting.textContent = t("me.pickerLoading");
  menu.appendChild(waiting);
  await loadMappingPlaces();                       // one loader, two surfaces
  menu.textContent = "";
  const served = new Set(mePickerBookmarks.map((b) => b.path));
  for (const place of mePickerPlaces) {
    const row = document.createElement("button");
    row.className = "storage-place";
    const already = place.served || served.has(place.path);
    row.textContent = already ? `✓ ${place.label}` : `+ ${place.label}`;
    row.title = place.path;
    row.disabled = already;
    row.addEventListener("click", () => {
      menu.remove();
      void addStorageRootPath(place.path, win);
    });
    menu.appendChild(row);
  }
  const other = document.createElement("button");
  other.className = "storage-place other";
  other.textContent = t("storage.rootOther");
  other.addEventListener("click", () => {
    menu.remove();
    void addStorageRoot(win);
  });
  menu.appendChild(other);
  // …and it closes the way every menu closes: the next click elsewhere
  setTimeout(() => document.addEventListener("click", function away(event) {
    if (!menu.contains(event.target as Node)) {
      menu.remove();
      document.removeEventListener("click", away);
    }
  }), 0);
}

/** Which button opened it, so pressing the same one again closes the menu. */
function anchorKey(anchor?: HTMLElement): string {
  if (!anchor) return "";
  const rect = anchor.getBoundingClientRect();
  return `${Math.round(rect.left)}:${Math.round(rect.top)}`;
}

async function addStorageRoot(win: Win): Promise<void> {
  // THE DESKTOP DIALOG FIRST. `pickFolder()` has existed since StratiMiner and
  // this button never called it — so on the desktop, where a native folder
  // dialog was one line away, people got a `prompt` asking them to type an
  // absolute path. Measured by looking at it.
  //
  // In a browser a folder picker still cannot hand back a location (that is the
  // rule, not this app's limitation), so the prompt stays as the fallback — with
  // the Blender-style browser next to it as the way that does not need typing:
  // navigate there and press "+ bookmark this folder".
  let path = isTauri() ? await pickFolder() : null;
  if (!path) path = window.prompt(t("storage.rootPrompt"), "");
  if (!path?.trim()) return;
  await addStorageRootPath(path.trim(), win);
}

async function addStorageRootPath(path: string, win: Win): Promise<void> {
  try {
    const res = await fetch(`${await bridgeUrl()}/fs/roots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", path }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; roots?: string[] } | null;
    if (!res.ok || !payload?.ok) {
      toast(t("storage.rootFailed", { detail: payload?.error ?? `HTTP ${res.status}` }));
      return;
    }
    toast(t("storage.rootAdded", { name: path.split("/").filter(Boolean).pop() ?? path }));
    await loadMappingPlaces();           // the place is served now: reflect it
    // FUOCO · `win`, not `activeWin()`. Two awaits happened above, and the focus
    // follows the MOUSE: by the time the bridge answers, the pointer has very
    // likely left. Measured, not feared — two Storage windows, the root added
    // from the left one, the pointer moved right while the POST was in flight:
    // the RIGHT window went back to the roots and the left one never moved.
    // A command acts on the window it started from, which is the window whose
    // button was pressed — known here without asking the room.
    setStoragePath(win, null);           // back to the roots, where it now shows
  } catch (err) {
    toast(t("storage.rootFailed", { detail: err instanceof Error ? err.message : String(err) }));
  }
}

function storageEmpty(message: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "viewer-empty";
  const p = document.createElement("p");
  p.textContent = message;
  box.appendChild(p);
  return box;
}

// ── VIEWER · the preview window ─────────────────────────────────────────────
//
// One resource at a time, shown as itself. It follows the SELECTION the way the
// Inspector does — you look at a node, and if that node points at something
// showable, here it is.
//
// Images and PDFs get the same treatment on purpose. Both are "the source,
// rendered"; splitting them into a picture viewer and a document viewer would be
// two surfaces for one question ("what does D.1 actually look like?"). The
// difference is one element, and nothing else about the window changes.

// What kind a file is (image / PDF / other) is `kindOfExt` in `storage.ts` now —
// the same answer a Storage listing, a collection and this window all need, and
// it was two regexes here before there was anywhere better to keep it.

/** The resource a node points at, if any: a ResourceNode's url, a Document's
 *  filename. Returns the raw string — deciding whether it is loadable is the
 *  caller's job, and it is a different question. */
function viewerSourceOf(node: EmNode | null): string | null {
  if (!node) return null;
  const data = (node.data ?? {}) as Record<string, unknown>;
  for (const key of ["url", "filename", "path"] as const) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** True when this string is something the browser can actually fetch. */
function viewerIsFetchable(src: string): boolean {
  return /^(https?:|data:|blob:)/i.test(src);
}

/**
 * W1 · What a Viewer window is showing, as a KEY.
 *
 * Two sources, and the more explicit one wins: a folder or file DROPPED from a
 * Storage window (the user pointed at it, that is as deliberate as it gets), or
 * failing that the current selection, which is how the window behaved before and
 * still does when nothing was dropped. Dropping is per instance, so one Viewer
 * can stay pinned to a folder while another follows the selection.
 */
function viewerKeyOf(win: Win): { kind: "folder" | "file" | "node"; ref: string } | null {
  const dropped = winCurrent(win, "collection");
  if (dropped && typeof dropped === "object") {
    const d = dropped as { kind?: string; ref?: string };
    if ((d.kind === "folder" || d.kind === "file") && d.ref) {
      return { kind: d.kind, ref: d.ref };
    }
  }
  return selectedId ? { kind: "node", ref: selectedId } : null;
}

/** The built collection for the window on screen, keyed so a stale async build
 *  cannot overwrite a newer one. */
/** The built collection of each viewer WINDOW. A Map and not one slot: with two
 *  viewer surfaces on screen (one focused, one secondary) a single slot made each
 *  render evict the other window's collection, so both re-fetched on every
 *  document change. The cache belongs to the window, like every other WIN state. */
const viewerCollections = new Map<string, { key: string; value: Collection }>();
/** The source each viewer window is currently fetching. Per window, and asked
 *  by window, so a secondary viewer building its own collection does not look
 *  like the focused one's build already in flight. */
const viewerBuilding = new Map<string, string>();

function viewerIndex(win: Win): number {
  const v = winCurrent(win, "item");
  return typeof v === "number" ? v : 0;
}

function setViewerIndex(win: Win, index: number): void {
  setWinCurrent(win, "item", index <= 0 ? null : index);
  renderViewer();
}

/**
 * Draw the Viewer: the current item of its collection (Single), or all of them
 * (Gallery).
 *
 * The honest part is still the empty state, but the limit MOVED. A page cannot
 * read `/Users/…/D1.tif` — measured: the dev server answers 200 text/html — so
 * before W1 that was the end of the story. Now there is a bridge that can read
 * the disk, and a local path is previewable *if it is inside the roots the
 * bridge was started with*. Outside them it is still refused, and the window
 * says which fence it hit rather than showing a broken image.
 */
function renderViewer(): void {
  refreshSurfaces("viewer");
}

/** SURFACE-AUDIT · the same preview, into any three boxes — so a viewer window
 *  that is not the focused one is still showing its picture. */
function renderViewerInto(win: Win, stage: HTMLElement, caption: HTMLElement,
                          bar: HTMLElement): void {
  stage.textContent = "";
  caption.textContent = "";
  bar.classList.add("hidden");

  const key = viewerKeyOf(win);
  if (!key) {
    stage.appendChild(viewerEmpty(t("viewer.noSelection")));
    return;
  }
  const keyStr = `${key.kind}:${key.ref}`;

  // A collection from disk takes a round trip to build; one already built for
  // this exact source is drawn straight away, which is what makes prev/next and
  // the Mode switch instant rather than a re-fetch each time.
  const cached = viewerCollections.get(win.id);
  if (cached?.key === keyStr) {
    drawViewerCollection(win, cached.value, stage, caption, bar);
    return;
  }

  if (key.kind === "node") {
    const node = store?.node(key.ref) ?? null;
    const label = String(node?.name || key.ref);
    const src = viewerSourceOf(node);
    if (!src) {
      stage.appendChild(viewerEmpty(t("viewer.notPreviewable", { name: label })));
      return;
    }
    if (viewerIsFetchable(src)) {
      const built = collectionFromUrl(key.ref, label, src);
      viewerCollections.set(win.id, { key: keyStr, value: built });
      drawViewerCollection(win, built, stage, caption, bar);
      return;
    }
    // A path on disk — the case the bridge now answers. Ask it.
    buildViewerCollection(win, keyStr, stage, caption, bar, () =>
      collectionFromFile(src),
    );
    return;
  }

  buildViewerCollection(win, keyStr, stage, caption, bar, () =>
    key.kind === "folder"
      ? collectionFromFolder(key.ref)
      : collectionFromFile(key.ref),
  );
}

function buildViewerCollection(
  win: Win,
  keyStr: string,
  stage: HTMLElement,
  caption: HTMLElement,
  bar: HTMLElement,
  build: () => Promise<Collection>,
): void {
  stage.appendChild(viewerEmpty(t("storage.loading")));
  // one build per source PER WINDOW, not one per redraw
  if (viewerBuilding.get(win.id) === keyStr) return;
  viewerBuilding.set(win.id, keyStr);
  void (async () => {
    let built: Collection;
    try {
      built = await build();
    } catch (err) {
      viewerBuilding.delete(win.id);
      if (!stage.isConnected) return;   // its area went while the fetch was out
      stage.textContent = "";
      // Three different facts, three different sentences. Flattening them into
      // "could not load" would tell the reader nothing they can act on: start
      // the bridge, name another root, or find the file that moved.
      const box = viewerEmpty(
        err instanceof BridgeDownError
          ? t("storage.bridgeDown")
          : err instanceof FileRefusedError && err.status === 403
            ? t("viewer.outsideRoots")
            : err instanceof FileRefusedError
              ? t("viewer.missingFile")
              : t("viewer.unreachable"),
      );
      const ref = viewerKeyOf(win);
      const source = ref?.kind === "node" ? viewerSourceOf(store?.node(ref.ref) ?? null) : ref?.ref;
      if (source) {
        const path = document.createElement("code");
        path.className = "viewer-path";
        path.textContent = source;
        box.appendChild(path);
      }
      stage.appendChild(box);
      return;
    }
    viewerBuilding.delete(win.id);
    if (!stage.isConnected) return;     // …same rule on the way in
    viewerCollections.set(win.id, { key: keyStr, value: built });
    stage.textContent = "";
    drawViewerCollection(win, built, stage, caption, bar);
  })();
}

function drawViewerCollection(
  win: Win,
  collection: Collection,
  stage: HTMLElement,
  caption: HTMLElement,
  bar: HTMLElement,
): void {
  stage.textContent = "";
  if (!collection.items.length) {
    const box = viewerEmpty(t("viewer.emptyCollection", { name: collection.title }));
    if (collection.note) {
      const note = document.createElement("code");
      note.className = "viewer-path";
      note.textContent = collection.note;
      box.appendChild(note);
    }
    stage.appendChild(box);
    return;
  }

  if (winModeOf(win) === "gallery") {
    stage.appendChild(viewerGallery(win, collection));
    caption.textContent = collection.note
      ? `${collection.title} — ${collection.items.length} · ${collection.note}`
      : `${collection.title} — ${collection.items.length}`;
    return;
  }

  const index = Math.min(viewerIndex(win), collection.items.length - 1);
  const item = collection.items[index];
  stage.appendChild(viewerItemElement(item, stage));
  const label = (): string =>
    item.pages
      ? `${item.title} — ${t("viewer.pages", { n: String(item.pages) })}`
      : item.title;
  caption.textContent = label();
  // The page count costs a fetch, so it is read for the PDF you are LOOKING at,
  // not for every PDF in the folder: a collection is built from a listing, and a
  // listing does not open files. Cached on the item, so paging back is free.
  if (item.kind === "pdf" && item.pages === undefined) {
    item.pages = null as unknown as undefined; // asked once, even if it answers null
    void pdfPageCount(item.url).then((n) => {
      if (n == null) return;
      item.pages = n;
      // only if that item is still the one on screen
      if (viewerCollections.get(win.id)?.value === collection && collection.items[
        Math.min(viewerIndex(win), collection.items.length - 1)
      ] === item) {
        caption.textContent = label();
      }
    });
  }

  // The strip earns its space only when there is more than one item to move
  // between; on a collection of one it would be two dead arrows and "1 / 1".
  if (collection.items.length > 1) {
    // ONE SURFACE · the strip is BUILT HERE, into this mount's own bar.
    //
    // Its four controls used to be markup inside `#viewer-view` — the focused
    // mount — so a Viewer area without the focus had a `.viewer-bar` with
    // nothing in it and a collection you could not page through. That is the
    // exact shape of "the tools exist only in the focused version", and the
    // repair is the one §2 asks for: same box, built once, for every mount.
    bar.classList.remove("hidden");
    bar.textContent = "";
    const prev = document.createElement("button");
    prev.className = "viewer-nav";
    prev.textContent = "‹";
    const pos = document.createElement("span");
    pos.className = "viewer-pos";
    const next = document.createElement("button");
    next.className = "viewer-nav";
    next.textContent = "›";
    const title = document.createElement("span");
    title.className = "viewer-coll-title";
    bar.append(prev, pos, next, title);
    pos.textContent = `${index + 1} / ${collection.items.length}`;
    title.textContent = collection.title;
    prev.disabled = index === 0;
    next.disabled = index === collection.items.length - 1;
    prev.onclick = () => setViewerIndex(win, index - 1);
    next.onclick = () => setViewerIndex(win, index + 1);
  }
}

/** One item, drawn as itself. The image/PDF split is one element and nothing
 *  else, which is the whole point of treating them the same. */
function viewerItemElement(item: CollectionItem, stage: HTMLElement): HTMLElement {
  if (!isDecodable(item)) {
    // A .tif IS an image and belongs in the collection; no browser draws one.
    // Saying that, with the way out, beats a broken-image icon that reads as
    // "the file is missing" when the file is perfectly fine.
    const box = viewerEmpty(t("viewer.notDecodable", { name: item.title }));
    box.appendChild(viewerOpenLink(item.url));
    return box;
  }
  if (item.kind === "pdf") {
    // <object> and not <iframe>: it degrades to its own children when the
    // browser has no PDF plugin, which is where the fallback link goes.
    const obj = document.createElement("object");
    obj.className = "viewer-media";
    obj.type = "application/pdf";
    // Same reason as the images: `<object data>` is a no-cors request and the
    // /fs gate refuses it. The blob keeps the PDF viewer working without
    // reopening the hole.
    void bridgeBlobUrl(item.url).then((src) => { obj.data = src; }).catch(() => {
      obj.appendChild(document.createTextNode(t("viewer.unreachable")));
    });
    obj.appendChild(viewerOpenLink(item.url));
    return obj;
  }
  if (item.kind === "image") {
    const img = document.createElement("img");
    img.className = "viewer-media";
    // via CORS when it comes from the bridge (see `bridgeBlobUrl`)
    void bridgeBlobUrl(item.url).then((src) => { img.src = src; }).catch(() => {
      img.dispatchEvent(new Event("error"));
    });
    img.alt = item.title;
    img.addEventListener("error", () => {
      stage.textContent = "";
      const box = viewerEmpty(t("viewer.unreachable"));
      const path = document.createElement("code");
      path.className = "viewer-path";
      path.textContent = item.path ?? item.url;
      box.appendChild(path);
      stage.appendChild(box);
    });
    return img;
  }
  const box = viewerEmpty(t("viewer.notPreviewable", { name: item.title }));
  box.appendChild(viewerOpenLink(item.url));
  return box;
}

function viewerOpenLink(url: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "viewer-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = t("viewer.openExternally");
  return link;
}

/** Gallery Mode: the whole collection at once. Clicking a thumbnail is not a
 *  second way of viewing — it takes you to Single ON that item, so the two
 *  modes stay two readings of one collection rather than two viewers. */
function viewerGallery(win: Win, collection: Collection): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "viewer-gallery";
  collection.items.forEach((item, i) => {
    const cell = document.createElement("button");
    cell.className = "viewer-thumb";
    cell.title = item.title;
    if (item.kind === "image" && isDecodable(item)) {
      const img = document.createElement("img");
      img.alt = item.title;
      img.loading = "lazy"; // a folder of 300 photographs must not fetch 300 at once
      void bridgeBlobUrl(item.url).then((src) => { img.src = src; }).catch(() => {
        img.replaceWith(Object.assign(document.createElement("span"), {
          className: "viewer-thumb-glyph", textContent: "⚠",
        }));
      });
      cell.appendChild(img);
    } else {
      const glyph = document.createElement("span");
      glyph.className = "viewer-thumb-glyph";
      glyph.textContent = item.kind === "pdf" ? "📄" : "🖼";
      cell.appendChild(glyph);
    }
    const label = document.createElement("span");
    label.className = "viewer-thumb-label";
    label.textContent = item.title;
    cell.appendChild(label);
    cell.addEventListener("click", () => {
      setWinCurrent(win, "item", i === 0 ? null : i);
      setWinModeOf(win, "single");
      renderViewer();
      renderAreaHeaders();
    });
    grid.appendChild(cell);
  });
  return grid;
}

function viewerEmpty(message: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "viewer-empty";
  const p = document.createElement("p");
  p.textContent = message;
  box.appendChild(p);
  return box;
}

// ── WIN6 · side panels as WINDOWS ───────────────────────────────────────────
//
// The Inspector, the EMTree, the outliner, the log and StratiMiner were
// singletons in the right-hand aside, outside the window system: they could not
// be tiled, resized or focused like everything else. They are now WINDOW TYPES.
//
// The panels themselves are not rebuilt: the existing elements are MOVED into
// the window's surface and moved back to `#side` when the window stops showing
// them. They keep their identity, their handlers and their state — only their
// address changes. That is what makes this a re-parenting rather than a second
// implementation of five panels.

/** Which panels a window type shows, in tab order. */
const PANEL_TABS: Partial<Record<WindowType, { id: string; labelKey: string }[]>> = {
  emtree: [
    { id: "emtree", labelKey: "panel.multigraph" },
    { id: "nodelist", labelKey: "panel.outliner" },
  ],
  // WIN7 · StratiMiner is NOT here any more: it is a Tools ▸ instrument that
  // floats, does its job and closes. The Log stays — a running record of what
  // the document and the session have been doing is a view, not a tool.
  inspector: [
    { id: "inspector", labelKey: "panel.inspector" },
    { id: "logpanel", labelKey: "panel.log" },
  ],
};

/*
 * GONE (13 set 2026) · `PANEL_ELEMENT_IDS`, `panelIsMounted`, `currentPanelId`,
 * `releaseTilePanels`, `releasePanels`, and `#side` with them.
 *
 * All five existed for one fact: a panel was ONE ELEMENT. So it had to be parked
 * somewhere while nobody showed it (`#side`), sent home before any rebuild could
 * destroy it (`releaseTilePanels`) or before another window took it
 * (`releasePanels`), located by reading the DOM when something wanted to know
 * whether it was on screen at all (`panelIsMounted`), and asked for "per type"
 * in the one place that could not say which window it meant (`currentPanelId` —
 * whose whole body was a guess: `win.type === type ? panelIdOf(win) : the first
 * tab`).
 *
 * A panel is built into its window's own area now, by `mountPanel`, through the
 * renderer that already took a host. Nothing moves, so nothing has to be moved
 * back; nothing is unique, so nothing has to be claimed. The optimisation
 * `panelIsMounted` bought — "do not draw a panel nobody can see" — is kept, said
 * better: the registry has no instances of that type, so the fan-out loop does
 * nothing at all.
 */

/** The panel a hosted window is currently showing. Per WINDOW (not per type):
 *  two Inspector windows can sit on different tabs, and that is what makes the
 *  second one a live view of its own rather than a duplicate of the first.
 *
 *  This was already right before the panels became instances — the model always
 *  said "this window shows that tab" — which is why converting them needed no
 *  change at all to what a tab means. */
function panelIdOf(win: Win): string {
  const tabs = PANEL_TABS[win.type] ?? [];
  const v = winCurrent(win, "panel");
  return typeof v === "string" && tabs.some((t) => t.id === v) ? v : (tabs[0]?.id ?? "");
}

/**
 * Build ONE panel into ONE host, and hand back the handle to it.
 *
 * THE WHOLE OF "the panels stop being unique" is this function existing. Every
 * one of the four renderers already took its host as the first argument —
 * `renderEMTree(host, …)`, `buildNodeList(root, …)`, `renderInspector(root, …)`,
 * `renderLogPanel(container, …)` — so nothing had to be written to draw a second
 * one. What had to go was the ELEMENT: four `getElementById` at boot, a hidden
 * `#side` to park them in, and three passes that moved them about.
 *
 * The outliner is the only one with state of its own (its filter, its collapsed
 * sections, which row is highlighted), and `buildNodeList` has returned an API
 * per root since the day it was written — so a second outliner is a second call,
 * not a second implementation.
 */
function mountPanel(panelId: string, host: HTMLElement, win: Win): PanelMount {
  void win;
  if (panelId === "emtree") {
    const paint = (): void => renderEMTree(host, emtree, emtreeHandlers, t);
    paint();
    return { refresh: paint };
  }
  if (panelId === "nodelist") {
    const api = buildNodeList(host, () => store?.doc ?? null, pickFromOutliner,
                              outlinerCallbacks);
    // `buildNodeList` builds the FILTER, the count and an empty list — it does
    // not draw the rows, because until tonight the one outliner was built at
    // boot with no document and painted by the first `nodeList.refresh()` that
    // came along. A second one, mounted by switching a tab on a graph that is
    // already open, has no such call coming: measured, and it came up blank.
    api.refresh();
    api.setSelected(selectedId);
    return { refresh: api.refresh, select: (id) => api.setSelected(id) };
  }
  if (panelId === "inspector") {
    const paint = (): void => renderInspectorInto(host);
    paint();
    return { refresh: paint };
  }
  if (panelId === "logpanel") {
    const paint = (): void =>
      renderLogPanel(host, store?.doc ?? null, EM_VERSION, revealFromWarning);
    paint();
    return { refresh: paint };
  }
  // A tab naming a panel nobody builds: say so in the box rather than leaving it
  // blank. Unreachable from `PANEL_TABS` as it stands, and it is the fall-through
  // that would catch a fifth panel added to a tab list and nowhere else.
  host.textContent = panelId;
  return { refresh: () => {} };
}

/** Ask one of the two FLOATING TOOLS to redraw. They are NOT window surfaces:
 *  an instrument you open, use and close lives in the float and nowhere else,
 *  which is why they never needed the machinery the panels did. */
function refreshFloatingTool(id: string): void {
  const el = document.getElementById(id);
  preservingScroll(scrollerOf(el), () => {
    if (id === "stratiminer") refreshStratiMiner();
    else if (id === "mapping-editor") refreshMappingEditor();
  });
}

/*
 * GONE (14 set 2026) · `tileSurfaces`, `registerTileSurface`,
 * `unregisterTileSurface`, `tileNote`.
 *
 * This register held "what each surface still drawn the OLD way must do when the
 * document changes". Nothing is drawn the old way, so it held nothing —
 * `refreshTileSurfaces()` below is now exactly `refreshSurfaces()`, the one
 * contract, over every mount there is.
 */

function refreshTileSurfaces(): void {
  refreshSurfaces();
}

/*
 * GONE (14 set 2026) · `buildSecondarySurface`, and its fall-through `tileNote`.
 *
 * It was THE SECOND PATH — the function that drew a window that did not have the
 * focus, while the focused one was drawn by a singleton inside `#canvas-wrap`.
 * Parity between the two was an invariant kept by hand, type by type, and every
 * night of this series took types out of it: six on 12 September, the two hosted
 * panels on the 13th, and tonight the last two, the narrative and the annotator.
 *
 * With nothing left in it the function is not a smaller second path — it is
 * none. Every window type is built by its own constructor in `shell/types.ts`,
 * and `check-focus-parity.mjs` asserts that against the REGISTRY rather than
 * type by type: a ninth window type cannot be born the old way, because there is
 * no old way to be born into.
 *
 * `tileNote` went with it. It said "step in to work here" — an area announcing
 * its own name instead of showing the document — and after 12 September only one
 * type could still reach it. Now none can.
 */

/*
 * GONE (13 set 2026) · `syncSecondaryPanels`, `reflectEmptyAside`,
 * `renderPanelWindow`, and the string `tile.panelTaken`.
 *
 * The first decided WHICH AREA got to keep each panel, because there was one of
 * each; the third mounted it into the focused window's surface; the second was
 * already a named no-op left over from the aside.
 *
 * The string is the one worth naming. It read «another window has this panel»,
 * and it was not a message — it was **the confession of the defect**. «Another
 * window has it» is a sentence that can only be written about an object there is
 * one of. The day there are two, the sentence has no referent, and its removal
 * is the proof that the twin is gone rather than renamed: a claim pass that
 * still existed under another name would still need somewhere to say this.
 *
 * What replaced all three: `mountPanel` builds this window's panel in this
 * window's area, and `panelIdOf(win)` — which was per-window from the start —
 * decides which one. Two Inspector windows side by side are two inspectors.
 */

/*
 * GONE (15 set 2026) · `mountWindow()` and `applyWindowSurface()`.
 *
 * `mountWindow` was «the ONE place that knows how a window type becomes
 * something on screen» — true while a type became something on screen by
 * lighting a singleton inside the shared wrap. A window type becomes something
 * on screen by its CONSTRUCTOR now (`shell/types.ts`), in its own area, and
 * `syncAreaContent` is where that happens.
 *
 * `applyWindowSurface` ended as two lines that had nothing to do with surfaces:
 * it showed the overview and refreshed the funnel, i.e. the two overlays of a
 * CANVAS window. The overview is per instance since tonight, and the funnel
 * follows the focus — so both belong to `setAreaFocused`, which is where they
 * are.
 */

/** Change the mode of a window (per-instance): record it on the window, then
 *  mount that projection. Another graph window keeps its own mode.
 *
 *  `win` and not `activeWin()`: the only caller is the mode menu of a window's
 *  own header, and it wrapped this in `focusThen` — moving the focus so that an
 *  ambient read would land right. The focus move stays, because showing you
 *  which window you just changed is its own job; what it no longer does is
 *  carry the meaning. */
function setWindowMode(win: Win, mode: ViewKind): void {
  setWinMode(win, mode);
  setMode(mode); // → reflect + updateWindowHeader
}

/**
 * Move the focus to another window.
 *
 * **Two calls and nothing else**, which is where three nights of work end up.
 *
 * It used to be `setActiveWin` + `renderTiles()` — a movement of the pointer
 * destroying and rebuilding every area (12 September). Then it was that, minus
 * the rebuild, plus a hand-over of `#canvas-wrap` for the types still bound to
 * its singletons — measured on the 14th at +106/−97 nodes between two graph
 * windows. There is no wrap and no hand-over: every window draws itself in its
 * own area, so the focus does what the focus is for, and the canvas of the
 * window you just left keeps drawing.
 */
function selectWindow(winId: string): void {
  const previous = activeWin().id;
  const win = setActiveWin(winId);
  if (previous === win.id) return;
  setAreaFocused(previous, false);
  setAreaFocused(win.id, true);
}

/**
 * WIN7 · magnify an area to fill the workspace, or come back from it.
 *
 * The one gesture that is worth a keyboard shortcut of its own: an arrangement
 * built to keep four things in view is rarely the one you want while working on
 * one of them, and the way out of that in every tiling editor is to take the
 * whole screen for a moment and give it back. Reversible by construction — the
 * tree is kept whole in `workspace.ts` and restored untouched (ratios, nesting
 * and all), so this is never something to undo by hand afterwards.
 */
function magnifyWindow(winId: string): void {
  toggleMaximize(winId);
  renderTiles();
}

/** Close a window — the one whose `×` was pressed, which is not necessarily the
 *  one with the focus: this bar belongs to an area, and an area's chrome is
 *  live whether or not the pointer is in it. The caller used to focus it first
 *  so that an `activeWin()` in here would find it; that was the invariant kept
 *  by hand, and the argument is the invariant kept by the compiler. */
function closeActiveWindow(win: Win): void {
  if (!closeWindow(win.id)) return; // never the last one
  renderTiles(); // the split JOINS: the sibling takes the space back
}

/**
 * HDR1 / WIN-FIX1 · **the window header, built for ONE window.**
 *
 * It used to be a singleton block of markup inside `#canvas-wrap`, which meant
 * exactly one area could have a header — the focused one. Every other area got a
 * thin label strip, so a four-area arrangement had one window that looked like a
 * window and three that looked like panes. Now this function builds the bar, and
 * every area calls it: the focused one fills `#window-header` (still inside
 * `#canvas-wrap`, so the docked-bar height that shortens the canvas is measured
 * from the same element as before), the others fill their own.
 *
 * The handlers close over `win`, never over `activeWin()`, because a bar can
 * belong to a window that is not the focused one.
 *
 * HDR1 changes to what the bar shows:
 *  · the TYPE is an icon alone — the name is in the dropdown, where you are
 *    choosing, and a word repeated in every bar is a word you stop reading;
 *  · the MODE reads "Matrix Mode", "Units mode" — a mode named as a mode;
 *  · the Tabular SHEET became that window's mode, because that is what it is:
 *    which projection of the document this window shows;
 *  · the instance chips (1 2 3 4) and the ⇥ ⇤ pair are GONE. They switched
 *    between windows, which is what clicking on a window already does now that
 *    the windows are side by side. The SPLIT verbs stayed, with glyphs that say
 *    what they do: → a new area beside, ↓ a new area below.
 */
function buildAreaHeader(win: Win): DocumentFragment {
  const frag = document.createDocumentFragment();
  const type = win.type;

  // ── the window TYPE: icon only, name in the dropdown ──────────────────────
  const typeDd = document.createElement("div");
  typeDd.className = "dropdown win-type";
  const typeTog = document.createElement("button");
  typeTog.className = "dd-toggle win-type-toggle";
  typeTog.title = t("win.typeTitle");
  typeTog.innerHTML =
    `<span class="win-type-icon">${WINDOW_TYPE_META[type].icon}</span>` +
    `<span class="win-type-caret">▾</span>`;
  const typeMenu = document.createElement("div");
  typeMenu.className = "dd-menu hidden";
  for (const tt of TRANSFORM_TYPES) {
    const meta = WINDOW_TYPE_META[tt];
    const b = document.createElement("button");
    b.dataset.wt = tt;
    b.classList.toggle("active", tt === type);
    b.innerHTML = `<span class="wt-ic">${meta.icon}</span> ${t(meta.labelKey)}`;
    b.addEventListener("click", () => transformWindowOf(win, tt));
    typeMenu.appendChild(b);
  }
  wireBarDropdown(typeTog, typeMenu);
  typeDd.append(typeTog, typeMenu);
  frag.appendChild(typeDd);

  // ── the MODE: which projection of the document THIS window shows ──────────
  const modes = headerModesOf(win);
  if (modes) {
    const modeDd = document.createElement("div");
    modeDd.className = "dropdown win-mode";
    const modeTog = document.createElement("button");
    modeTog.className = "dd-toggle win-mode-toggle";
    modeTog.title = t("win.modeTitle");
    modeTog.innerHTML =
      `<span class="win-mode-label">${escapeHtml(modes.currentLabel)}</span>` +
      `<span class="win-type-caret">▾</span>`;
    const modeMenu = document.createElement("div");
    modeMenu.className = "dd-menu hidden";
    for (const m of modes.items) {
      const b = document.createElement("button");
      b.textContent = m.label;
      b.classList.toggle("active", m.current);
      if (m.disabled) {
        b.disabled = true;
        b.title = m.disabled;   // the REASON, where the pointer already is
      } else {
        b.addEventListener("click", m.run);
      }
      modeMenu.appendChild(b);
    }
    wireBarDropdown(modeTog, modeMenu);
    modeDd.append(modeTog, modeMenu);
    frag.appendChild(modeDd);
  }

  // ── the per-type MENUS (WINDOW_MENUS) ─────────────────────────────────────
  for (const menu of WINDOW_MENUS[type]) {
    const dd = document.createElement("div");
    dd.className = "dropdown win-menu";
    const toggle = document.createElement("button");
    toggle.className = "dd-toggle win-menu-toggle";
    // the label is a KEY, resolved HERE — so rebuilding the bar (which a locale
    // change does) re-reads the dictionary. Resolved in the registry instead, it
    // froze the language the bundle started in: measured after a live switch, the
    // tabs and the master header moved and this bar still said Chapter · Insert.
    toggle.innerHTML = `${escapeHtml(t(menu.label))} `
      + `<span class="win-type-caret">▾</span>`;
    const list = document.createElement("div");
    list.className = "dd-menu hidden";
    // built on OPEN, so ✓ and disabled reasons are current every time
    wireBarDropdown(toggle, list, () => {
      list.innerHTML = "";
      for (const item of menu.items(win)) {
        const b = document.createElement("button");
        const reason = item.disabledReason?.() ?? null;
        b.textContent = (item.checked?.() ? "✓ " : "") + t(item.label);
        if (reason) {
          // NO MUTE NO-OP. A `disabled` button was the whole of "most of the
          // buttons don't work": it swallows the click (so the menu does not
          // even close), the reason lives in a `title` nobody hovers, and the
          // user is left with a menu that opens and does nothing. Measured on
          // the narrative window, where EVERY item of Capitolo/Inserisci/IA was
          // disabled by one condition — "click a chapter to make it current" —
          // that the UI never said out loud.
          //
          // So it stays visibly unavailable (`.dd-disabled`, aria) but remains
          // CLICKABLE, and the click SAYS WHY and closes the menu. The reason is
          // information the user needs to get unstuck, which makes it the one
          // thing a refusal must not keep to itself.
          b.classList.add("dd-disabled");
          b.setAttribute("aria-disabled", "true");
          b.title = reason;
          b.addEventListener("click", () => {
            toast(reason);
            list.classList.add("hidden");
          });
        } else {
          b.addEventListener("click", item.run);
        }
        list.appendChild(b);
      }
    });
    list.addEventListener("click", () => list.classList.add("hidden"));
    dd.append(toggle, list);
    frag.appendChild(dd);
  }

  // ── the window ACTIONS: one-click verbs on THIS window ────────────────────
  const act = (glyph: string, title: string, on: boolean, run: () => void): void => {
    const b = document.createElement("button");
    b.className = "win-act" + (on ? " win-act-on" : "");
    b.textContent = glyph;
    b.title = title;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      run();
    });
    frag.appendChild(b);
  };
  if (type === "graph") {
    act("⤢", t("win.fitTitle"), false, () => {
      focusThen(win, () => fit());
    });
    act("1:1", t("win.zoom1Title"), false, () => {
      focusThen(win, () => {
        const vp = viewport();
        const { w, h } = viewSize();
        if (vp.scale > 0) vp.zoomAt(w / 2, h / 2, 1 / vp.scale);
        draw();
      });
    });
  }
  if (type === "narrative") {
    // ✎ · writing IS a mode of a narrative window, so it is a toggle you can see
    // the state of, not an item buried in a menu
    act("✎", t("win.editTitle"), narrativeEditingOf(win), () =>
      focusThen(win, () => {
        click("btn-narrative-edit");
        renderAreaHeaders();
      }),
    );
    // WIN7 · the two data panels a narrative window sends you to
    act("⌁", t("win.aiTitle"), false, () => openSettings("settings-sect-ai"));
    act("⌖", t("win.geoTitle"), false, () => focusThen(win, revealSitePosition));
  }

  // ── the type's OWN STRIP, in the SAME row (HDR2) ──────────────────────────
  //
  // Every window used to carry two stacked rows of chrome: this header, and then
  // the surface's own strip underneath — the storage crumb, the panel tabs, the
  // table's row count. Two rows of furniture over every area, and in a
  // four-area arrangement that is eight strips of nothing.
  //
  // They are the same KIND of thing: what this window is showing and what you
  // can do to it. So they live in one row. The strip is built here, for the
  // focused window and every secondary area alike (one builder, so taking the
  // focus never changes a measurement), and the in-surface strips are gone.
  frag.appendChild(buildHeaderStrip(win));

  const spacer = document.createElement("span");
  spacer.className = "win-sep";
  frag.appendChild(spacer);

  // ── that window's own SEARCH (HDR1) ───────────────────────────────────────
  const search = buildWindowSearch(win);
  if (search) frag.appendChild(search);

  // ── the arrangement verbs: split, magnify, join, close ────────────────────
  const arr = document.createElement("span");
  arr.className = "win-arrange";
  const chip = (glyph: string, title: string, on: boolean, run: () => void): void => {
    const b = document.createElement("button");
    b.className = "wi-chip wi-add" + (on ? " wi-on" : "");
    b.textContent = glyph;
    b.title = title;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      run();
    });
    arr.appendChild(b);
  };
  chip("→", t("win.splitRight"), false, () => splitAreaOf(win, "row"));
  chip("↓", t("win.splitDown"), false, () => splitAreaOf(win, "col"));
  const magnified = maximizedWin() === win.id;
  chip("⛶", t(magnified ? "win.unmaximize" : "win.maximize"), magnified, () =>
    magnifyWindow(win.id),
  );
  if (canJoin(win.id))
    chip("⊟", t("win.join"), false, () => {
      joinWindow(win.id);
      renderTiles();
    });
  if (windowsOf().length > 1) {
    const close = document.createElement("button");
    close.className = "wi-chip wi-close";
    close.textContent = "×";
    close.title = t("win.close");
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      setActiveWin(win.id);   // the focus follows the verb, and the verb says WHICH
      closeActiveWindow(win);
    });
    arr.appendChild(close);
  }
  frag.appendChild(arr);
  // ONE SURFACE · the head does NOT know who has the focus, and that is
  // stronger than the parity it used to be checked for.
  //
  // It used to take an `active` flag and stamp `.hdr-passive` on every
  // descendant of an unfocused bar — 92 to 106 class writes on every crossing of
  // a divider, measured — for a class with no rules in the stylesheet. What says
  // which window takes the edits is `.tile-active` on the AREA: the frame at
  // full strength, and `#tile-root .tile-area > .tile-bar.win-header` a shade
  // quieter when it is absent. One class, on the ancestor, so the head is
  // literally the same DOM in both states and a focus change writes two
  // attributes instead of two hundred.
  return frag;
}

/**
 * Run something that acts on the FOCUSED window, from a bar that may belong to
 * another one. Focusing first is not a formality: `fit()` and the rest read
 * `activeWin()` for the camera, and silently fitting the wrong window is the
 * kind of bug that looks like the button doing nothing.
 */
function focusThen(win: Win, run: () => void): void {
  if (activeWin().id !== win.id) selectWindow(win.id);
  run();
}

/** Split the area of a SPECIFIC window (its own bar's verb). */
function splitAreaOf(win: Win, dir: "row" | "col"): void {
  setActiveWin(win.id);
  splitWindow(win.id, dir);
  renderTiles();
}

/**
 * DAG · show the corpus as a picture, from the Documentation tab.
 *
 * A graph window in `dtc` mode: one already in this workspace is switched (and
 * focused), otherwise a new area is split off. Nothing about the corpus is
 * created here — the view reads what is there, and an empty one says so.
 */
function openCorpusDag(): void {
  const existing = windowsOf().find((w) => w.type === "graph");
  const win = existing ?? (() => {
    splitWindow(activeWin().id, "row");
    const made = activeWin();
    setWinType(made, "graph");
    return made;
  })();
  setActiveWin(win.id);
  setWinMode(win, "dtc");
  // A DAG needs ROOM. The Documentation arrangement is three columns of storage
  // and inspector, so a graph area added to it gets ~a fifth of the tab — and a
  // provenance chain drawn in a 300px strip is a picture of a DAG, not a DAG.
  // Magnify it: reversible with the same ⤢ verb, so the arrangement comes back.
  if (maximizedWin() !== win.id) toggleMaximize(win.id);
  renderTiles();
  // …and frame it for the size it ACTUALLY has now: the camera fitted for a
  // narrow strip is the wrong camera for a full tab.
  framedViews.delete(viewportKey(win.id, "dtc"));
  setMode("dtc");
  renderAreaHeaders();
  // AND AGAIN NEXT FRAME. Measured: a graph window created and magnified in the
  // same tick has not been LAID OUT yet when `setMode` frames it, so `fit` sized
  // the picture for a canvas ~80px wide and left the scale at its floor (0.02) —
  // twelve nodes drawn 2px tall on a canvas that was 1278px wide by the time
  // anybody looked. The DOM has to have happened first; one frame is what that
  // costs. (It went unnoticed before because a DAG window that already existed
  // was already the right size.)
  requestAnimationFrame(() => {
    framedViews.delete(viewportKey(win.id, "dtc"));
    setMode("dtc");
  });
}

/** Transform a SPECIFIC window in place (its own bar's type dropdown). */
function transformWindowOf(win: Win, type: WindowType): void {
  if (win.type === type) return;
  setActiveWin(win.id);
  setWinType(win, type);
  renderTiles();   // the area re-surfaces itself, and the wrap re-mounts if it
}                  // was this window that held it

/**
 * The MODES a window offers in its header, or null when it has none.
 *
 * HDR1 folded the Tabular sheet selector in here. It had been a `<select>` in the
 * table's own head plus (until MENU-AUDIT) a menu listing the same sheets — but
 * "which sheet" is the same kind of fact as "which projection": it is what this
 * window is showing, per instance, which is the definition of a mode. One
 * concept, one control, in the place every window keeps it.
 */
function headerModesOf(win: Win): {
  currentLabel: string;
  items: { label: string; current: boolean; run: () => void;
           disabled?: string }[];
} | null {
  if (win.type === "graph") {
    const cur = winMode(win);
    return {
      currentLabel: t("mode.label", { mode: t(`mode.${cur}`) }),
      items: GRAPH_MODES.map((m) => ({
        label: t("mode.label", { mode: t(`mode.${m}`) }),
        current: m === cur,
        run: () => focusThen(win, () => setWindowMode(win, m)),
      })),
    };
  }
  // U1 · every other type with modes reads them from THE registry, so a new mode
  // is one entry in `WINDOW_MODES` and appears here without a branch of its own.
  // (Graph keeps its own arm above because changing its mode also re-mounts a
  // canvas projection; Tabular's "mode" is a sheet, which is not window state.)
  if (winModes(win.type).length) {
    const cur = winModeOf(win);
    return {
      currentLabel: t("mode.label", { mode: t(`mode.${cur}`) }),
      items: winModes(win.type).map((m) => ({
        label: t("mode.label", { mode: t(`mode.${m}`) }),
        current: m === cur,
        // A mode that is planned but not built is LISTED and disabled, with the
        // reason — the same treatment the menus give an action that cannot run.
        // Hiding it would make the plan invisible; letting it through would put
        // the window in a mode that draws nothing.
        disabled: DISABLED_MODES[m] ? t(DISABLED_MODES[m]) : undefined,
        run: () =>
          focusThen(win, () => {
            setWinModeOf(win, m);
            // a mode is a fact about THIS window: record it and repaint. It
            // used to have to re-mount the shared wrap as well.
            surfaceOf(win.id)?.refresh();
            draw();
            renderAreaHeaders();
          }),
      })),
    };
  }
  if (win.type === "table") {
    const cur = currentSheetKey();
    // "US view" was a sheet NAME in a selector; as a mode it reads "US view
    // Mode", which says the same word twice. The sheet keys are the names.
    const label = (k: string): string =>
      t("mode.label", {
        mode: (EM_DATA_SHEETS.find((s) => s.key === k)?.label ?? k).replace(
          / view$/,
          "",
        ),
      });
    return {
      currentLabel: label(cur),
      items: EM_DATA_SHEETS.map((sheet) => ({
        label: label(sheet.key),
        current: sheet.key === cur,
        run: () =>
          focusThen(win, () => {
            setSheet(sheet.key);
            renderAreaHeaders();
          }),
      })),
    };
  }
  return null;
}

/**
 * A bar dropdown. The generic `.dropdown` wiring in the toolbar runs ONCE at
 * module load over the markup that existed then, so generated bars wire their
 * own — and place their menus by hand, because a bar that scrolls would clip a
 * menu laid out inside it.
 */
function wireBarDropdown(
  toggle: HTMLElement,
  menu: HTMLElement,
  build?: () => void,
): void {
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.classList.contains("hidden");
    closeAllDropdowns();
    closeAllSubmenus();
    if (!willOpen) return;
    build?.();
    menu.classList.remove("hidden");
    placeBarMenu(toggle, menu);
  });
}

/**
 * HDR1 · the window's OWN search box — full search, over what THIS window holds.
 *
 * The master header had one box that searched "the document". In a tiled shell
 * that is a search with no scope: which of the four things on screen was it
 * supposed to take you to? So each window carries its own, and it searches what
 * that window is actually showing — nodes in a graph, rows in a table, the prose
 * and titles of a narrative. (The Outliner already had one, at the top of its
 * list, and it stays where it is.)
 */
function buildWindowSearch(win: Win): HTMLElement | null {
  if (win.type !== "graph" && win.type !== "table" && win.type !== "narrative")
    return null;
  const wrap = document.createElement("div");
  wrap.className = "win-search";
  const input = document.createElement("input");
  input.type = "search";
  input.autocomplete = "off";
  input.className = "win-search-input";
  input.placeholder = t(
    win.type === "graph"
      ? "win.searchGraph"
      : win.type === "table"
        ? "win.searchTable"
        : "win.searchNarrative",
  );
  wrap.appendChild(input);
  // a click in the box must not be read as a gesture on the window underneath
  input.addEventListener("pointerdown", (e) => e.stopPropagation());

  if (win.type === "graph") {
    const results = document.createElement("div");
    results.className = "win-search-results hidden";
    wrap.appendChild(results);
    // the SAME implementation the master box used — one search, many mounts
    setupSearch(
      input,
      results,
      () => store?.doc ?? null,
      (id) => {
        focusThen(win, () => {
          if (inContext()) {
            contextStack = [];
            rebuildContext();
          }
          select(id);
          centerOn(id);
        });
      },
    );
    return wrap;
  }
  if (win.type === "table") {
    input.value = emDataFilter();
    input.addEventListener("input", () => {
      setEmDataFilter(input.value);
    });
    return wrap;
  }
  // narrative: find in the prose, and take you to it
  input.addEventListener("input", () => {
    highlightNarrative(input.value);
  });
  return wrap;
}

/**
 * HDR2 · the per-type strip that used to be a SECOND row under the header.
 *
 * One element per type, built the same way in every area:
 *
 *  · storage   — up · the folder crumb · add-a-root (what was `#storage-bar`)
 *  · inspector — the panel tabs (Inspector / Log): which panel this window
 *    shows is a MODE of it, and modes live in the header
 *  · emtree    — the same, for Multigraph / Outliner
 *  · table     — the row count (`#table-view-count` and the tile head's twin)
 *
 * Everything else returns an empty span: a type with nothing extra to say
 * shows a header with nothing extra in it.
 */
function buildHeaderStrip(win: Win): HTMLElement {
  const strip = document.createElement("span");
  strip.className = "win-strip";

  if (win.type === "storage" && winModeOf(win) === "filesystem") {
    // the object-store mode has no folder to walk, so it has no crumb: its own
    // "where am I" is the room, and the room is in the panel's first line
    const up = document.createElement("button");
    up.className = "win-act win-strip-up";
    up.textContent = "↑";
    up.title = t("storage.up");
    const crumb = document.createElement("div");
    crumb.className = "win-strip-crumb storage-crumb";
    const root = document.createElement("button");
    root.className = "win-act win-strip-root";
    root.textContent = "+ 📁";
    root.title = t("storage.rootTitle");
    root.addEventListener("click", (e) => {
      e.stopPropagation();
      focusThen(win, () => void openStoragePlaces(win, root));
    });
    strip.append(up, crumb, root);
    return strip;
  }

  if (win.type === "storage") {
    const crumb = document.createElement("div");
    crumb.className = "win-strip-crumb storage-crumb";
    strip.appendChild(crumb);
    return strip;
  }

  const tabs = PANEL_TABS[win.type];
  if (tabs) {
    const showing = panelIdOf(win);
    for (const tab of tabs) {
      const chip = document.createElement("button");
      chip.className = "panel-tab win-strip-tab"
        + (tab.id === showing ? " active" : "");
      // A LOG THAT ONLY EXISTS WHEN YOU LOOK AT IT IS NOT A LOG.
      //
      // Measured on 5 September: `#logpanel` was empty in the DOM after a
      // perfectly successful open, and the honest reading of an empty element is
      // «there is nothing». There WAS: `logpanel.ts` keeps a 500-entry ring
      // buffer whether or not the panel is mounted, and opening the tab showed
      // all of it at once. So nothing was lost — but nothing said so either.
      //
      // The count says so, and only for what somebody needs to be TOLD about:
      // warnings and errors. Info lines are a trail you go and consult; a badge
      // for those would be a number that is always on and therefore never read.
      const owed = tab.id === "logpanel" ? logAttention() : 0;
      chip.textContent = t(tab.labelKey) + (owed ? ` (${owed})` : "");
      if (owed) chip.classList.add("win-strip-tab-owed");
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        setWinCurrent(win, "panel", tab.id);
        // THIS window shows another panel now. It used to mean "re-home the one
        // element and let every area re-resolve its claim"; it means "this
        // surface draws something else", and the windows beside it are not
        // affected at all — which is the whole of tonight in one handler.
        renderAreaHeaders();
        surfaceOf(win.id)?.refresh();
      });
      strip.appendChild(chip);
    }
    return strip;
  }

  // FOCUS-PARITY · THE SHELF, which was the last type with a declared
  // difference. It had a bar of its own — `#shelf-bar`, nine controls — and that
  // bar lived inside `#shelf-view`, the FOCUSED mount. So the same list sat 30px
  // lower with the focus than without it, and no amount of levelling the box
  // could fix that: the two mounts did not carry the same amount of chrome.
  //
  // The nine are here now, and they are here for BOTH mounts because this is the
  // one builder both call. Where each went, and why:
  //
  //  · the NAME and the COUNT stay visible — they are what you read, not what
  //    you do, and they are the two things that say WHICH shelf this is;
  //  · `+ URI` opens a FORM (the address, the fence it comes from, how it is
  //    reached, and the verb) — four controls that are one gesture, and one row
  //    cannot hold two inputs and two selects and still be read;
  //  · ⟳ only in Table mode, because only the table can be stale;
  //  · Open / Save / Empty went into the Shelf menu, which is where a verb you
  //    use once a session belongs.
  if (win.type === "shelf") {
    const name = document.createElement("input");
    name.type = "text";
    name.spellcheck = false;
    name.className = "win-strip-shelfname";
    name.title = t("shelf.nameTitle");
    name.value = shelfMeta().name;
    // a click in the box is not a gesture on the window under it
    name.addEventListener("pointerdown", (e) => e.stopPropagation());
    name.addEventListener("change", () => renameShelf(name.value));
    const count = document.createElement("span");
    count.className = "emdata-count win-strip-count";
    // FILLED HERE, not left for the renderer. Measured: the header is rebuilt
    // AFTER the area's surface has been mounted and painted — `renderTiles`
    // calls `areaFor()` for every placed window and only then
    // `renderAreaHeaders()`, and `transformWindowOf` ends by calling
    // `renderTiles` — so a count written by `renderShelfInto` and then rebuilt
    // empty simply did not appear. The count is a pure function of the list, so
    // the builder can state it, and the renderer still writes it: two paths, one
    // value.
    //
    // (15 set 2026 · this used to cite `mountWindow`, deleted with the last
    // privileged area. The ORDER it warns about is unchanged; only the names
    // that make it are.)
    count.textContent = t("shelf.count", { n: String(shelfEntries().length) });
    strip.append(name, count);

    const uri = document.createElement("button");
    // `wi-chip`, not `win-act`: `.win-header .win-act` is a 30px SQUARE with no
    // padding — a contract for one glyph (↑ ⤢ ⟳), and a two-word label put in
    // one wraps onto two lines inside 28px (measured: the button came out 30px
    // wide showing "+" over "URI"). A short text label is what `wi-chip` is.
    uri.className = "wi-chip win-strip-uri";
    uri.textContent = t("shelf.addUri");
    uri.title = t("shelf.addUriTitle");
    uri.addEventListener("click", (e) => {
      e.stopPropagation();
      openShelfUriForm(uri);
    });
    strip.appendChild(uri);

    if (winModeOf(win) === "table") {
      // The LIST reads the shelf that is in memory: it cannot be out of date,
      // and a ⟳ next to it would promise work it will not do. The table is
      // s3Dgraphy's answer about these entries, and that answer ages.
      const refresh = document.createElement("button");
      refresh.className = "win-act win-strip-refresh";
      refresh.textContent = "⟳";
      refresh.title = t("shelf.refreshTitle");
      refresh.addEventListener("click", (e) => {
        e.stopPropagation();
        void refreshShelfTable();
      });
      strip.appendChild(refresh);
    }
    return strip;
  }

  if (win.type === "table") {
    const count = document.createElement("span");
    count.className = "emdata-count win-strip-count";
    strip.appendChild(count);
    return strip;
  }

  return strip;
}

/**
 * Rebuild the header of EVERY area (WIN-FIX1 §1).
 *
 * The focused area's bar is `#window-header` — the element `windowBarHeight()`
 * measures and `--winbar-h` is published from, so the canvas keeps being exactly
 * as much shorter as the bar is tall. The others are the `.tile-bar` of their
 * area. Same builder, same contents, one dimmed.
 */
function renderAreaHeaders(): void {
  // `#window-header` is gone with `#canvas-wrap`: every area has a `.tile-bar`,
  // built here by the one builder, and there is no privileged one to do first.
  for (const bar of document.querySelectorAll<HTMLElement>(".tile-area > .tile-bar")) {
    const win = windowsOf().find((w) => w.id === bar.parentElement?.dataset.win);
    if (!win) continue;
    bar.innerHTML = "";
    bar.appendChild(buildAreaHeader(win));
  }
  // STEP A · every area publishes the height ITS bar takes, the way the focused
  // one always has (`--winbar-h`): the resources panel and its chevron sit below
  // the bar in any area, and they read that one measurement rather than each
  // guessing from a constant that would drift.
  for (const area of document.querySelectorAll<HTMLElement>(".tile-area")) {
    const bar = area.querySelector<HTMLElement>(":scope > .tile-bar");
    area.style.setProperty("--winbar-h", `${bar?.offsetHeight ?? 0}px`);
  }
  // HDR2 · the header now CONTAINS the storage crumb, and rebuilding the header
  // empties it. Measured: the folder path vanished from the bar on every
  // arrangement change while the listing below it stayed. So the surfaces that
  // write into the strip are repainted after it is rebuilt — cheap (they redraw
  // from the listing they already have) and it keeps the strip and the body
  // saying the same thing.
  if (windowsOf().some((w) => w.type === "storage")) renderStorage();
  if (windowsOf().some((w) => w.type === "table")) renderEmData();
  draw();
}

/** Kept as the name every caller already uses. The header IS rebuilt now rather
 *  than mutated in place — there is no longer a fixed set of ids to poke. */
function updateWindowHeader(): void {
  renderAreaHeaders();
}

// ── WIN3 · the per-type menu registry ────────────────────────────────────────
// The window header is a BAR: type · mode · the menus of that window type. The
// menus are DATA — `WINDOW_MENUS[type]` — so adding one is an entry here, not a
// rewrite of the header. Every item runs an EXISTING command (often by driving
// the control that already owns it), so there is one implementation of fit,
// layout, add-chapter, add-row, export… and the menu is only a way in.
interface WinMenuItem {
  label: string;
  run: () => void;
  /** a ✓ in the menu — for the items that pick a state, not an action */
  checked?: () => boolean;
  /** greyed out with the reason in the tooltip, rather than silently missing */
  disabledReason?: () => string | null;
}
interface WinMenu {
  label: string;
  /** THE WINDOW WHOSE BAR THIS IS. The registry is a module constant, so its
   *  closures cannot see the `win` that `buildAreaHeader` has — and every entry
   *  that needed one reached for `activeWin()` instead. The window existed at
   *  the point the menu was built and was lost crossing into the registry; one
   *  parameter is the whole of carrying it across. */
  items: (win: Win) => WinMenuItem[];
}

const click = (id: string): void => document.getElementById(id)?.click();

// WIN4 · AUDIT against the master header (the app toolbar) and against the
// bar's own controls — every duplicate removed, with its reason:
//  · "Vista" DISSOLVED. Its three jobs already had a home: the modes are the
//    Mode selector two centimetres to the left (a state offered twice reads as
//    two different states), "Adatta" is now an icon button, and the filters are
//    the funnel at the top-right of the canvas, which was there all along.
//  · Table ▸ t("menu.export") REMOVED: it was File ▸ Esporta verbatim (same three
//    handlers), and exporting is a document command, not a table command.
//  · The window TYPE dropdown stays even though the leader also switches
//    workspaces: they are different scopes (leader = which arrangement, header =
//    what THIS window shows) and the tiling of WIN5 is where that pair finally
//    reads as one thing. Deliberately left alone.
const WINDOW_MENUS: Record<WindowType, WinMenu[]> = {
  graph: [
    {
      label: "Layout",
      items: (win) => {
        const mode = winMode(win);
        const algoItems = (["layered", "radial", "force"] as GraphAlgorithm[]).map(
          (a) => ({
            label: a[0].toUpperCase() + a.slice(1),
            run: () => {
              const sel = document.getElementById("graph-layout") as HTMLSelectElement;
              sel.value = a;
              sel.dispatchEvent(new Event("change"));
            },
            checked: () => graphAlgorithm === a,
            disabledReason: () =>
              mode === "matrix"
                ? t("menu.algoGraphOnly")
                : null,
          }),
        );
        return [
          {
            label: "menu.relayout",
            run: () => click("btn-layout"),
            disabledReason: () =>
              mode === "matrix"
                ? null
                : t("menu.relayoutByAlgo"),
          },
          ...algoItems,
        ];
      },
    },
    {
      // SPELL1 · the document-level fix-ups of the graph. Today one: bring the
      // edges to the canonical spelling — explicitly, never at load (E.D., 27
      // set 2026: a spelling is accepted when read, and rewriting it is a
      // decision somebody makes, visibly and undoably).
      label: "menu.graph",
      items: () => [
        {
          label: "menu.uniformSpellings",
          run: () => promptUniformSpellings(),
          disabledReason: () =>
            !store
              ? t("menu.noGraph")
              : store.spellingPlan().steps.length
                ? null
                : t("menu.noOldSpellings"),
        },
      ],
    },
  ],
  narrative: [
    {
      // MENU-AUDIT · "Aggiungi capitolo" left this menu, and the menu is better
      // for it: every item here now acts on the CURRENT chapter, which is what
      // t("menu.chapter") means. Adding one is not an operation on the current chapter,
      // and it has two homes that suit it — the narrative palette (always) and
      // the "+ capitolo" at the end of the story (while writing).
      label: "menu.chapter",
      items: (win) => {
        const narr = activeNarrative();
        const ci = validCurrentChapter(win);
        const noChapter = (): string | null =>
          !narr
            ? t("menu.noNarrative")
            : ci == null
              ? t("menu.pickChapter")
              : null;
        return [
          {
            label: "menu.deleteChapter",
            run: () => {
              if (!store || !narr || ci == null) return;
              nedit.deleteChapter(store, narr.id, ci);
              setCurrentChapterIndex(win, null);
              refreshNarrativeView();
            },
            disabledReason: noChapter,
          },
          {
            label: "menu.moveUp",
            run: () => {
              if (!store || !narr || ci == null) return;
              nedit.moveChapter(store, narr.id, ci, -1);
              setCurrentChapterIndex(win, Math.max(0, ci - 1));
            },
            disabledReason: () => noChapter() ?? (ci === 0 ? t("menu.alreadyFirst") : null),
          },
          {
            label: "menu.moveDown",
            run: () => {
              if (!store || !narr || ci == null) return;
              nedit.moveChapter(store, narr.id, ci, 1);
              setCurrentChapterIndex(win, Math.min(narr.chapters.length - 1, ci + 1));
            },
            disabledReason: () =>
              noChapter() ??
              (narr && ci === narr.chapters.length - 1 ? t("menu.alreadyLast") : null),
          },
        ];
      },
    },
    {
      label: "menu.insert",
      items: (win) => {
        const narr = activeNarrative();
        const ci = validCurrentChapter(win);
        // The embed needs a chapter AND a node to point at. The MAP points at
        // the graph itself (that is what a site map is), so it needs no
        // selection — which is the case E.D. hit: a map in the introduction.
        // Every other view type embeds A NODE, so it uses the canvas selection;
        // with nothing selected the item says so instead of guessing.
        const insert = (viewType: string, ref: string): void => {
          if (!store || !narr || ci == null) return;
          nedit.addEmbed(store, narr.id, ci, ref, viewType);
          refreshNarrativeView();
        };
        const needChapter = (): string | null =>
          !narr
            ? t("menu.noNarrative")
            : ci == null
              ? t("menu.pickChapter")
              : null;
        // WHAT a view embeds, when this window has no canvas to select on.
        //
        // Measured: in the Output workspace there IS no graph window, so
        // `selectedId` is null and every type but the map was permanently
        // unavailable — a menu that cannot ever be used, next to a palette drag
        // that works. But a chapter of a site-story is ANCHORED (to its epoch,
        // or to an activity), and that anchor is exactly what the chapter is
        // about: embedding it is the obvious meaning of "insert a matrix here".
        //
        // So: the canvas selection when there is one (you pointed at something),
        // else the chapter's anchor (what this chapter is about). Only a chapter
        // with neither has nothing to embed, and then the item says so.
        const refFor = (): { id: string; from: string } | null => {
          if (selectedId) return { id: selectedId, from: t("menu.fromSelection") };
          const anchor = narr && ci != null
            ? (narrativesIn(store!.doc).find((n) => n.id === narr.id)
                ?.chapters[ci] as { anchor?: string } | undefined)?.anchor
            : undefined;
          return anchor ? { id: anchor, from: t("menu.fromAnchor") } : null;
        };
        return [
          {
            label: "menu.siteMap",
            run: () => store && insert("map", store.ensureGraphRootId()),
            disabledReason: needChapter,
          },
          ...narrativeViewTypes()
            .filter((vt) => vt !== "map")
            .map((vt) => ({
              label: vt,
              run: () => {
                const ref = refFor();
                if (!ref) return;
                insert(vt, ref.id);
                toast(`${vt} inserito (${ref.from}: ${
                  store?.node(ref.id)?.name ?? ref.id})`);
              },
              disabledReason: () =>
                needChapter() ??
                (refFor()
                  ? null
                  : t("menu.nothingToEmbed")),
            })),
        ];
      },
    },
    {
      // WHERE THE WRITING IS. The four exporters worked and were reachable only
      // from `File ▸ Esporta` — two menus away from the panel where somebody is
      // writing the thing they want to export. Same call, same bake, offered
      // where the story is (the File entry stays: a project-level export belongs
      // in the project menu too).
      label: "menu.export",
      items: () =>
        Object.entries(NARRATIVE_FORMATS).map(([format, spec]) => ({
          // LaTeX says it comes as an archive: with figures a `.tex` cannot be
          // one file, and a download that changes kind without warning is one
          // somebody double-clicks and gets nothing.
          label: spec.label + (format === "ipynb" ? " " + t("menu.exportLive")
            : format === "latex" ? " " + t("menu.exportZip") : ""),
          run: () => void exportNarrative(format),
          disabledReason: () =>
            !store
              ? t("menu.noGraph")
              : activeNarrative()
                ? null
                : t("menu.nothingToExport"),
        })),
    },
    {
      label: "menu.ai",
      items: (win) => {
        const narr = activeNarrative();
        const ci = validCurrentChapter(win);
        return [
          {
            label: "menu.regenChapter",
            run: () => {
              if (!narr || ci == null) return;
              void generateChapterDraft(narr.id, ci);
            },
            disabledReason: () =>
              !narr
                ? t("menu.noNarrative")
                : ci == null
                  ? t("menu.pickChapter")
                  : null,
          },
          {
            // The one thing a failed generation needs next: where the key goes.
            // In the menu rather than only in the error, so it can be found
            // BEFORE the first refusal.
            label: "menu.aiProvider",
            run: () => openSettings("settings-sect-ai"),
          },
        ];
      },
    },
  ],
  // MENU-AUDIT · the "Tabella" menu (one item per sheet, with a ✓) is GONE. The
  // sheet selector sits in the window's own head, two centimetres away, showing
  // which sheet is open — and a state offered twice reads as two states. Exactly
  // the reason WIN4 dissolved the "Vista" menu next to the Mode selector.
  table: [
    {
      label: "menu.rows",
      items: () => [
        {
          // FOCUS-NOJITTER · calls the mutator directly. It used to click a
          // `+ row` button in the table's head — a button that only existed in
          // the FOCUSED window's head, which is what made the head change size
          // on every focus change. The head has no buttons now; this menu is
          // where a command on this window lives.
          label: "menu.addRow",
          run: () => {
            if (!store) return;
            if (!addEmDataRow(store))
              toast(t("menu.sheetNoNewRows"));
          },
          disabledReason: () => (store ? null : t("menu.noGraph")),
        },
        {
          label: "Aggiungi claim",
          run: () => {
            if (store) toggleEmDataClaimForm(store);
          },
          disabledReason: () =>
            currentSheetKey() === "Claims"
              ? null
              : t("menu.claimsFromSheet"),
        },
        {
          label: "menu.deleteRow",
          run: () => {
            const id = currentRowId();
            if (!store || !id) return;
            deleteRow(store, id);
            setCurrentRowId(null);
            renderEmData();
          },
          disabledReason: () =>
            currentRowId() ? null : t("menu.pickRow"),
        },
      ],
    },
  ],
  // WIN5 · the Doc window is real, so it has commands: the sources of the graph
  // are created and removed through the SAME EM-Data mutators the Documents
  // sheet uses (one way to make a document, whichever window you are in).
  emtree: [],
  inspector: [],
  // VIEWER · nothing to command: it follows the selection and shows what is
  // there. A menu offering "open" or "zoom" would be a viewer pretending to be
  // an editor. Its ONE state — pinned to a dropped folder, or following the
  // selection again — is here because there is no other way back.
  viewer: [
    {
      label: "menu.collection",
      items: (win) => {
        const pinned = !!winCurrent(win, "collection");
        return [
          {
            label: "Segui la selezione",
            disabled: pinned ? undefined : t("menu.alreadyFollows"),
            run: () => {
              setWinCurrent(win, "collection", null);
              setWinCurrent(win, "item", null);
              viewerCollections.clear();
              renderViewer();
            },
          },
        ];
      },
    },
  ],
  // STORAGE · navigation is the double-click and the ↑; a menu repeating them
  // would be a second way to do the one thing the surface already does.
  storage: [],
  // STUDY · nothing to put here yet: the panel is all fields, and its actions
  // (pick a site position, search an authority, attach a twin) are IN the
  // fields, where the thing they act on is. An empty menu is the honest state,
  // and it is the same one `emtree`, `inspector` and `storage` are in.
  study: [],
  // SHELF · HDR2 · the list's own verbs, now that `#shelf-bar` is gone. Open and
  // Save are here rather than in the header for one reason: they are punctuation
  // — once when you sit down, once when you get up — while the name, the count
  // and `+ URI` are what a session of shelving actually touches. Emptying it was
  // already here.
  //
  // `disabledReason`, not `disabled`: the latter is not a field of `WinMenuItem`
  // and the renderer never reads it, so this item has been permanently enabled
  // and its reason has been unreachable since the day it was written. Found
  // while moving in next door.
  shelf: [
    {
      label: "Shelf",
      items: () => [
        {
          label: "menu.shelfOpen",
          run: () => openShelfFile(),
        },
        {
          // no guard, deliberately: the button in the bar had none, and an empty
          // ShelfGraph is a legal (if dull) file. This pass MOVES the nine; it
          // does not take anything away from them.
          label: "menu.shelfSave",
          run: () => saveShelf(),
        },
        {
          label: "menu.shelfClear",
          disabledReason: () =>
            shelfEntries().length ? null : t("menu.shelfEmpty"),
          run: () => {
            clearShelf();
            renderShelf();
          },
        },
      ],
    },
  ],
  // ANNOTATOR · the tools are in the panel and the Mode is in the header; the
  // only thing left to command is the region being traced.
  annotator: [
    {
      label: "menu.region",
      items: () => [
        {
          label: "menu.cancelRegion",
          disabled: annotatorDraft ? undefined : t("menu.noRegionInProgress"),
          run: () => {
            annotatorDraft = null;
            const panel = document.getElementById("annotator-panel");
            if (panel) panel.dataset.open = "";
            drawAnnotatorOverlay();
            renderAnnotatorPanel();
          },
        },
        {
          label: "Chiudi il poligono",
          disabled:
            annotatorDraft?.shape_kind === "polygon" &&
            (annotatorDraft.points?.length ?? 0) >= 3
              ? undefined
              : t("menu.polygonNeeds3"),
          run: () => renderAnnotatorPanel(),
        },
      ],
    },
  ],
  doc: [
    {
      label: "Documento",
      items: (win) => [
        {
          label: "Nuovo documento",
          run: () => {
            if (!store) return;
            const id = addRow(store, "Documents");
            if (id) setWinCurrent(win, "doc", id);
            renderDocView();
          },
          disabledReason: () => (store ? null : t("menu.noGraph")),
        },
        {
          label: "Elimina documento corrente",
          run: () => {
            const id = currentDocId(win);
            if (!store || !id) return;
            deleteRow(store, id);
            setWinCurrent(win, "doc", null);
            renderDocView();
          },
          disabledReason: () =>
            currentDocId(win) ? null : t("menu.pickDocument"),
        },
      ],
    },
  ],
};

/** Build the header's menus for the ACTIVE window's type. */
/**
 * Put a window-bar menu where its toggle is, in SCREEN coordinates.
 *
 * The bar scrolls horizontally when its controls do not fit, and a menu laid out
 * inside a scroller is clipped by it — the menu became a second scrollbar inside
 * the bar instead of opening over the canvas. The menus are therefore `fixed`
 * and placed here, and kept inside the viewport so the last item is always
 * reachable.
 */
function placeBarMenu(toggle: HTMLElement, menu: HTMLElement): void {
  const r = toggle.getBoundingClientRect();
  // hang it off the BAR, not off the toggle: the toggle is shorter than the bar,
  // and anchoring to it drew the menu over the bar's own bottom edge.
  const barBottom =
    toggle.closest("#window-header")?.getBoundingClientRect().bottom ?? r.bottom;
  menu.style.left = "0px";
  menu.style.top = "0px";
  const m = menu.getBoundingClientRect();
  const left = Math.max(4, Math.min(r.left, window.innerWidth - m.width - 4));
  // below the bar, unless there is no room down there
  const below = barBottom + 2;
  const top =
    below + m.height <= window.innerHeight - 4
      ? below
      : Math.max(4, r.top - m.height - 4);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

/**
 * WIN7 · bring the Inspector's graph card up with the SITE POSITION in view.
 *
 * The site position is a graph-scope fact (GEO1), so the panel that holds it is
 * the Inspector's no-selection state — which means clearing the selection first.
 *
 * It used to have to ask WHERE the inspector was — `getElementById("inspector")`
 * and then whether its parent was the focused mount or an area — because there
 * was one of it and it could be anywhere. There are as many as there are
 * Inspector windows now, so the question is only which WINDOW to bring forward,
 * and the answer is the first one showing that tab.
 */
function revealSitePosition(): void {
  if (!store) {
    toast(t("toast.openGraphForPosition"));
    return;
  }
  select(null); // the graph card is the Inspector's no-selection state
  const inWindow = windowsOf().find(
    (w) => PANEL_TABS[w.type] && panelIdOf(w) === "inspector",
  );
  if (inWindow && activeWin().id !== inWindow.id) selectWindow(inWindow.id);
  refreshInspector();
  const anchor = document.getElementById("insp-site-position");
  if (!anchor) {
    toast(t("toast.noPositionPanel"));
    return;
  }
  revealBlock(anchor);
}

/**
 * HDR1 · find in the narrative — highlight every match in the prose and titles
 * of the story this window is showing, and take you to the first.
 *
 * A find over rendered text rather than a re-render with a filter: a story read
 * with its non-matching paragraphs removed is not the story, and the question a
 * search answers here ("where did I write about the threshold?") wants the
 * passage in its place.
 */
function highlightNarrative(query: string): void {
  const host = activeNarrativeHost();
  if (!host) return;
  host.querySelectorAll(".nv-hit").forEach((el) => el.classList.remove("nv-hit"));
  const q = query.trim().toLowerCase();
  if (!q) return;
  let first: HTMLElement | null = null;
  for (const el of host.querySelectorAll<HTMLElement>(
    ".nv-chapter-title, .nv-prose, .nv-block-row, .nv-lede",
  )) {
    if (!el.textContent?.toLowerCase().includes(q)) continue;
    el.classList.add("nv-hit");
    first ??= el;
  }
  first?.scrollIntoView({ block: "center", behavior: "auto" });
}

/*
 * GONE (15 set 2026) · `applyWorkspace()`.
 *
 * «Mount the editor of its ACTIVE window via the existing shell» — the last
 * sentence in this file that assumed a workspace HAS an editor, singular.
 * `renderTiles()` mounts every window of the arrangement in its own area, which
 * is all a workspace switch ever needed to mean.
 */

function setWorkspace(id: WorkspaceId): void {
  setActiveWorkspace(id);
  // HDR1 · a workspace can DECLARE an arrangement (the IDE one does). It is
  // applied the first time you open it and never again: after that the
  // arrangement is yours, and a preset that re-asserted itself on every visit
  // would throw away the split you made the last time you were there.
  if (!isTiled(id)) applyArrangement(id);
  renderTiles(); // WIN5 · each workspace has its own arrangement
  // the tab follows the WORKSPACE and nothing else — mounting an editor never
  // moves it (that is what made a transformed window possible).
  reflectWorkspaceInBar(id);
}

/**
 * HDR1 · the workspace TABS — the master header's only switcher.
 *
 * What used to be here (three chips, plus a search box, plus a `⌗` button hidden
 * down in the window bar) was three levels of "where am I" spread across two
 * bars. Now the master header answers one question — **which workspace** — and
 * the tabs are the answer, the IDE arrangement among them. A `+` makes a new one
 * from whatever you are looking at; the ones you made can be renamed
 * (double-click) and closed (middle-click or the ×), the built-ins cannot.
 */
function renderWorkspaceBar(): void {
  workspaceBar.innerHTML = "";
  // ONE SPECIES, so no hairline and no grouping: every tab is an arrangement of
  // windows (E.D., 2026-08-21). The separator that used to divide the four
  // "phases" from the two "views" was the visible half of a bar that answered two
  // questions — and the invisible half was a `⌗ IDE` tab that named a layout and
  // a `▤ Table` tab that named a window.
  for (const w of WORKSPACES) {
    const b = document.createElement("button");
    b.dataset.ws = w.id;
    const isActive = w.id === activeWorkspace();
    b.className = "ws-tab" + (isActive ? " active" : "");
    const label = workspaceLabel(w, t);
    // the tooltip says what the arrangement is FOR; a label alone answers "where
    // am I" and not "what am I supposed to be doing here"
    b.title = w.hintKey ? `${label} — ${t(w.hintKey)}` : label;
    b.innerHTML =
      `<span class="ws-ic">${w.icon}</span><span class="ws-lb">${escapeHtml(label)}</span>`;
    b.addEventListener("click", () => setWorkspace(w.id));
    if (w.builtin && w.arrangement) {
      // STUDIO · a built-in's arrangement is applied once and is yours after
      // that; double-clicking its tab is the way back to the one it came with
      b.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (!confirm(t("ws.resetConfirm"))) return;
        if (w.id !== activeWorkspace()) setActiveWorkspace(w.id);
        applyArrangement(w.id);
        renderTiles();
      });
    }
    if (!w.builtin) {
      // rename in place: a workspace you made is named after what you use it for,
      // and that changes
      b.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const next = prompt(t("ws.renamePrompt"), label);
        if (next == null || !renameWorkspace(w.id, next)) return;
        renderWorkspaceBar();
      });
      const x = document.createElement("span");
      x.className = "ws-x";
      x.textContent = "×";
      x.title = t("ws.close");
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!removeWorkspace(w.id)) return;
        renderWorkspaceBar();
        setWorkspace(activeWorkspace());
      });
      b.appendChild(x);
    }
    workspaceBar.appendChild(b);
  }
  const add = document.createElement("button");
  add.className = "ws-tab ws-add";
  add.textContent = "+";
  add.title = t("ws.addTitle");
  add.addEventListener("click", () => {
    const name = prompt(t("ws.addPrompt"), t("ws.addDefault"));
    if (name == null) return;
    const ws = addWorkspace(name);
    renderWorkspaceBar();
    setWorkspace(ws.id);
  });
  workspaceBar.appendChild(add);
}
renderWorkspaceBar();
onLocaleChange(renderWorkspaceBar);
// HDR1 · the bars are BUILT from the dictionary, so a language change rebuilds
// them; there is no fixed markup left to re-label in place.
onLocaleChange(renderAreaHeaders);

document.getElementById("btn-fit")!.addEventListener("click", fit);
const btnLayout = document.getElementById("btn-layout") as HTMLButtonElement;
btnLayout.title =
  "Recompute the layout of the CURRENT view (Matrix = em-core swimlanes, " +
  "Graph = graph layout). Does not switch view or auto-fit. In Matrix, " +
  "keeps your manual arrangement (From Sketch); Alt-click = fresh layout.";
// Compute a layout via em-core and apply it to the store. `fresh` ignores the
// existing sketch. Shared by the Layout button and the auto-layout on loading
// a layout-less document (e.g. a live snapshot).
async function runLayout(fresh: boolean): Promise<void> {
  if (!store) return;
  const { computeLayout } = await import("./emcore");
  const prev = store.doc.layout;
  // Pins & anchors are INTENT, not computed geometry — they must survive every
  // Layout, including a fresh (Alt) one. On fresh we drop the manual position
  // arrangement but still pass pins/anchors so em-core resolves them (a rule
  // anchor like the epoch paradata box needs no stored position; a fixed pin
  // without a frozen position simply releases, which is the point of "fresh").
  const sketch = fresh
    ? { pinned: prev?.pinned, anchors: prev?.anchors }
    : prev;
  const layout = await computeLayout(store.doc.graph, sketch);
  store.setLayout(layout);
}

btnLayout.addEventListener("click", async (ev) => {
  if (!store) return;
  btnLayout.disabled = true;
  try {
    // Layout is VIEW-AWARE: recompute the layout of the CURRENT view, never
    // force a switch to Matrix. And do NOT auto-fit afterwards — the user
    // re-fits manually (Fit / "0") so the recompute keeps the current zoom.
    if (view === "graph" && !inContext()) {
      // Graph has its own client-side layout (views/graph.ts). "Layout" = a
      // fresh arrangement in the chosen algorithm → drop manual drags.
      graphOverrides.clear();
      buildScenes();
      draw();
      toast(`Graph layout: ${graphAlgorithm}`);
    } else if (matrixTighterThanDefault()) {
      // Matrix filtered beyond its default → recompute the VIEW layout on the
      // visible subgraph (recompact), leaving the archival layout untouched.
      await refreshMatrixViewLayout();
      toast("Layout (filtered subgraph)");
    } else {
      const fresh = (ev as MouseEvent).altKey;
      await runLayout(fresh); // store.setLayout → onChange → buildScenes + draw
      toast(fresh ? "Fresh layout (em-core)" : "Layout from sketch (em-core)");
    }
  } catch (e) {
    toast(`layout failed: ${e instanceof Error ? e.message : e}`);
  } finally {
    btnLayout.disabled = false;
  }
});
(document.getElementById("graph-layout") as HTMLSelectElement).addEventListener(
  "change",
  (ev) => {
    graphAlgorithm = (ev.target as HTMLSelectElement).value as GraphAlgorithm;
    graphOverrides.clear(); // new algorithm = fresh arrangement
    if (view === "graph" && !inContext()) {
      buildScenes();
      draw();
      fit(); // new coordinate space (radial/force centre on origin) → frame it
    } else {
      setView("graph"); // show the effect (setView rebuilds + fits)
    }
    toast(`Graph layout: ${graphAlgorithm}`);
  },
);

setupSearch(
  document.getElementById("search") as HTMLInputElement,
  document.getElementById("search-results")!,
  () => store?.doc ?? null,
  (id) => {
    if (inContext()) {
      contextStack = [];
      rebuildContext();
    }
    select(id);
    centerOn(id);
  },
);

// ---------- drag & drop ----------
// FILE import, window-wide: dropping an em.json/GraphML anywhere in the app
// loads it. Restricted to drags that actually carry FILES (DND1) — before, the
// dragover accepted everything unconditionally, so the whole window declared
// itself a valid drop target for any drag, and an internal palette drag never
// reached the canvas: window's `drop` ran, found no file, and swallowed the
// gesture. "Files" is the only thing readable during dragover (the payload is
// not), which is why the test is on `types` and not on `files.length`.
const carriesFiles = (e: DragEvent): boolean =>
  !!e.dataTransfer?.types?.includes("Files");
window.addEventListener("dragover", (e) => {
  if (!carriesFiles(e)) return; // internal drag → leave it to the canvas
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
});
window.addEventListener("drop", (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});

// PALETTE drag → instantiate at the cursor. Sibling of the click-to-arm gesture,
// not a replacement: it reuses `placeNode`, so lane/epoch assignment, group
// membership when inside a hypergraph, the DTC kind stamp and the qualia picker
// all behave identically. Setting the placing* trio is how a drop "arms" the
// same code path for one shot; placeNode's cancelPlacing clears it.
const paletteDragPayload = (e: DragEvent): PaletteDragPayload | null => {
  const raw = e.dataTransfer?.getData(PALETTE_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PaletteDragPayload;
  } catch {
    return null; // a foreign drag claiming our MIME is not worth a crash
  }
};
/**
 * THE TEN GESTURES, wired to ONE window's canvas.
 *
 * This is the last privileged area giving itself up. Until tonight these ten
 * listeners were bound to `#canvas` — the ONE canvas, inside `#canvas-wrap`,
 * the area that followed the focus — and every other graph area got a
 * read-only twin drawn by `drawTile()`. So a second graph window could select
 * (the area took the focus on `pointerenter` and resolved the click in its own
 * camera, since 12 September) but could not DRAG and could not draw a
 * CONNECTOR, because those live in here.
 *
 * WHAT IS PER-INSTANCE AND WHAT IS NOT, because getting that backwards is the
 * whole risk of this change:
 *
 *  · the ELEMENT is per instance — `canvas` is this function's PARAMETER now,
 *    and the thirty-eight references below bind to it without one of them
 *    being edited. That is not a trick: it is the measure of how little of this
 *    code was ever about "the" canvas rather than "a" canvas;
 *  · the CAMERA is per instance, and has been since WIN7 — `viewportFor(winId,
 *    mode)` and `markCameraTouched(winId, mode)`. (This list named `tileHover`
 *    until 15 set 2026, which was wrong twice over: it was deleted the same
 *    night, and the hover was never a camera — it is gesture state, the next
 *    bullet, and the module's one `hoverId` is the whole of it.);
 *  · the GESTURE STATE is deliberately NOT per instance. `dragMode`, `marquee`,
 *    `spaceHeld`, `dragNodeId` and the rest stay at module scope, shared by
 *    every wired canvas, and that is correct rather than convenient: **there is
 *    one pointer.** Two machines would differ only in holding two half-finished
 *    gestures at once — a marquee in one area while a connector hangs in the
 *    other — which no hand can produce. The note of 12 September said this when
 *    the focus began to follow the mouse; here it is the same sentence, and it
 *    is what makes ten listeners per window cost nothing to reason about.
 *
 * `claim()` is the one thing added to the bodies. Focus-follows-mouse already
 * puts the focus here before any button is pressed, so for the pointer gestures
 * it is a no-op — but an HTML5 drag fires no pointer events at all, so a drop
 * into a window that did not have the focus used to be resolved against another
 * window's camera. Making it structural rather than incidental also means the
 * ten gestures can be MEASURED starting from the unfocused window, which is the
 * only way the claim "this works" is worth anything.
 */
function wireGraphCanvas(canvas: HTMLCanvasElement, winId: string): void {
  /** Take the focus, unless a gesture is already in flight somewhere: a drag
   *  that crosses a divider must not hand its node to another window. */
  const claim = (): void => {
    if (dragMode !== "none" || connect || placingType) return;
    if (activeWin().id !== winId) selectWindow(winId);
  };

  function worldPos(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return viewport().toWorld(e.clientX - rect.left, e.clientY - rect.top);
  }
  canvas.addEventListener("dragover", (e) => {
    claim();
    if (!e.dataTransfer?.types?.includes(PALETTE_MIME)) return;
    e.preventDefault(); // without this the drop event never fires
    e.dataTransfer.dropEffect = "copy";
    canvas.classList.add("drop-target");
  });
  canvas.addEventListener("dragleave", () => canvas.classList.remove("drop-target"));
  canvas.addEventListener("drop", (e) => {
    claim();
    canvas.classList.remove("drop-target");
    const p = paletteDragPayload(e);
    if (!p) return; // not ours (a file drop bubbles on to the window handler)
    e.preventDefault();
    if (!store) {
      toast("Open a document first");
      return;
    }
    placingType = p.nodeType;
    placingKind = p.kind ?? null;
    placingIsResource = !!p.isResource;
    const w = worldPos(e);
    placeNode(w.x, w.y);
  });
  canvas.addEventListener("pointerdown", (e) => {
    claim();
    hideEdgeMenu();
    moved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    // Pan-always gesture, evaluated BEFORE any hit logic: middle mouse button,
    // or Space held (portable — Mac trackpads have no middle button). With many
    // hypergraphs covering the canvas there may be no empty space to grab, so
    // this pans regardless of what is under the cursor.
    if (e.button === 1 || spaceHeld) {
      dragMode = "pan";
      markCameraTouched(winId, view);
      canvas.classList.add("panning");
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    // "PD" tag in a lane / band label chip → enter that epoch/phase temporal PDG
    // (same as double-clicking the old box). Resolved on pointerup as a click.
    if (!placingType) {
      const rect = canvas.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      // EM-mode "insert epoch" boundary (left strip) takes priority over the
      // epoch-label select that also lives in the left strip.
      const ib = insertBoundaryAt(lx, ly);
      if (ib != null) {
        insertPending = ib;
        dragMode = "none";
        return;
      }
      // PD tag first (it sits inside the band chip): click it to ENTER the group
      const pd = hitPdTag(lx, ly);
      if (pd) {
        pdTagPending = pd;
        dragMode = "none";
        return;
      }
      // "+" quick-add-phase button on an epoch's rail
      const ap = hitAddPhase(lx, ly);
      if (ap) {
        addPhasePending = ap;
        dragMode = "none";
        return;
      }
      // elsewhere on a phase band label chip: click to SELECT the phase
      const bl = hitBandLabel(lx, ly);
      if (bl) {
        bandSelectPending = bl;
        dragMode = "none";
        return;
      }
      // BADGE1/DEC1 · ornament badge (author/license/embargo) — SCREEN-space hit,
      // like the PD tag. A click selects the REAL ornament node (a "+N" overflow
      // chip carries the referent). Checked before the node hit-test: the badge
      // sits on the referent's corner and a click there means "edit the ornament".
      const ab = hitAdornmentBadge(lx, ly);
      if (ab) {
        adornmentPending = ab;
        dragMode = "none";
        return;
      }
      // PD1 · collapsed-PDG tablet (bottom-left) → single click selects the group;
      // the double click that enters the hypergraph is handled in `dblclick`.
      const pdd = hitPdDecorator(lx, ly);
      if (pdd) {
        pdDecoratorPending = pdd;
        dragMode = "none";
        return;
      }
    }
    const s = scene();
    if (!s) return;
    const w = worldPos(e);
    if (placingType) {
      dragMode = "none";
      return; // click placement handled on pointerup
    }
    // connect handle? The bullet shows on the hovered/selected node always, and
    // on EVERY node when zoomed in (renderer) — so allow starting a connect from
    // any node's right-edge handle there, not only the focused one (the handle
    // sits just outside the body, where hover is otherwise lost).
    const focus = hoverId ?? selectedId;
    const fn = focus ? s.byId.get(focus) : null;
    let handleNode =
      fn && !fn.collapsed && hitHandle(fn, w.x, w.y, viewport().scale) ? fn : null;
    if (!handleNode && viewport().scale > 0.5) {
      for (const n of s.nodes) {
        if (!n.collapsed && hitHandle(n, w.x, w.y, viewport().scale)) {
          handleNode = n;
          break;
        }
      }
    }
    if (handleNode) {
      dragMode = "connect";
      beginConnect(handleNode.id);
      updateConnect(w.x, w.y);
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const hit = hitTest(s, w.x, w.y);
    if (hit && (view === "matrix" || inContext())) {
      dragMode = "node";
      dragNodeId = hit.id;
      dragStartScene = { x: hit.x, y: hit.y };
      dragCheckpointed = false;
      dragSceneDirty = false;
      // Shift+drag a member node → detach it from its container (D2). Membership
      // is read from the GRAPH (buildMembership.primaryOf), not the rendered
      // memberOf map — the latter only covers relocate-type groups, not outline
      // (is_part_of US/USD/VSF) containers.
      dragDetachPending = false;
      dragDetachSet = [];
      if (e.shiftKey && !inContext() && store) {
        const mm = buildMembership(store.doc);
        // shift+drag detaches the WHOLE selection when dragging a selected node
        const multi = selectedIds.has(hit.id) && selectedIds.size > 1;
        const targets = multi ? [...selectedIds] : [hit.id];
        for (const id of targets) {
          const c = mm.primaryOf.get(id);
          if (c) dragDetachSet.push({ id, container: c });
        }
        dragDetachPending = dragDetachSet.length > 0;
      }
      // dragging a group container moves the whole group — but only along
      // the PRIMARY containment tree: a shared document whose master lives
      // in another group must NOT follow (its local instance moves with the
      // extractors of THIS group anyway)
      dragMemberIds = null;
      dragIsGroupMove = false;
      if (s.groupsById?.has(hit.id) && store) {
        const mm = buildMembership(store.doc);
        const acc: string[] = [];
        const stack = [hit.id];
        while (stack.length) {
          const g = stack.pop()!;
          for (const m of mm.childrenOf.get(g) ?? []) {
            if (m !== hit.id && !acc.includes(m)) {
              acc.push(m);
              stack.push(m);
            }
          }
        }
        dragMemberIds = acc;
        dragIsGroupMove = true; // group node moves; members follow via container pass
      }
      // multi-selection: dragging any selected node moves the WHOLE selection
      if (!dragMemberIds && selectedIds.has(hit.id) && selectedIds.size > 1) {
        dragMemberIds = [...selectedIds].filter((id) => id !== hit.id);
        dragIsGroupMove = false; // move each node respecting its own container
      }
    } else if (hit && canvasOverrides() && !inContext()) {
      // Graph / DTC view: drag a node to place it (persisted as an override in
      // THIS projection's map, see canvasOverrides).
      // Shift = LIQUID — the connected 1-hop cluster follows, for manual grouping.
      dragMode = "graphnode";
      dragNodeId = hit.id;
      graphLiquid = e.shiftKey;
    } else {
      // Matrix: a click in the left swimlane-label strip selects that epoch, so
      // the Inspector exposes reorder + start/end (T7). Otherwise → marquee.
      const rect = canvas.getBoundingClientRect();
      const sxScreen = e.clientX - rect.left;
      const syScreen = e.clientY - rect.top;
      const vp2 = viewport();
      const lane =
        view === "matrix" && !inContext() && sxScreen < 160
          ? scene()?.lanes.find((l) => {
              const ly = l.y * vp2.scale + vp2.y;
              return syScreen >= ly && syScreen <= ly + l.height * vp2.scale;
            })
          : undefined;
      if (lane) {
        dragMode = "none"; // prevent marquee; the select happens on pointerup
        return;
      }
      // empty canvas → rubber-band marquee selection (pan is middle/Space, D1)
      dragMode = "marquee";
      marquee = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
    }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const vp = viewport();
    const w = vp.toWorld(sx, sy);

    // EM-mode insert-epoch hover indicator (idle only; cleared during any drag)
    if (dragMode === "none") {
      const ib = insertBoundaryAt(sx, sy);
      if (ib !== hoverInsertBoundary) {
        hoverInsertBoundary = ib;
        canvas.style.cursor = ib != null ? "copy" : "";
        draw();
      }
    } else if (hoverInsertBoundary !== null) {
      hoverInsertBoundary = null;
    }

    if (dragMode === "connect") {
      // CROSS-AREA CONNECTOR · a connector may end on a node that is not in this
      // area at all — two units in the same graph rarely fit one framing. The
      // pointer capture keeps sending these moves HERE even when the cursor has
      // left this rectangle, so this is the one place that can notice, hand the
      // editor over to the area under the cursor, and carry the connector across.
      //
      // `connect` itself is untouched by the hand-over: `fromId` is a node of the
      // DOCUMENT, not of a window, so the connector stays the same connector. What
      // changes is which camera and which scene resolve the target — which is
      // exactly what has to change when the cursor is somewhere else.
      const over =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
          ? areaAt(e.clientX, e.clientY)
          : null;
      if (over && over.winId !== activeWin().id) {
        selectWindow(over.winId);
        // resolve the pointer in the NEW area's camera before asking what is under it
        const r2 = canvas.getBoundingClientRect();
        const w2 = viewport().toWorld(e.clientX - r2.left, e.clientY - r2.top);
        // Where the connector CAME IN: the pointer clamped to this area's frame.
        // The source node may be nowhere near this view — the band then starts at
        // that edge point instead of vanishing (renderer: `connect.fromAnchor`).
        if (connect) {
          const edge = viewport().toWorld(
            Math.min(Math.max(e.clientX - r2.left, 0), r2.width),
            Math.min(Math.max(e.clientY - r2.top, 0), r2.height),
          );
          connect.fromAnchor = { x: edge.x, y: edge.y };
        }
        updateConnect(w2.x, w2.y);
        return;
      }
      updateConnect(w.x, w.y);
      return;
    }
    if (dragMode === "pan") {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (moved) {
        vp.x += dx;
        vp.y += dy;
        lastX = e.clientX;
        lastY = e.clientY;
        tooltip.classList.add("hidden");
        draw();
      }
      return;
    }
    if (dragMode === "marquee") {
      if (marquee) {
        marquee.x1 = w.x;
        marquee.y1 = w.y;
        if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 3) moved = true;
        draw();
      }
      return;
    }
    if (dragMode === "graphnode" && dragNodeId && store) {
      if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 3)
        moved = true;
      if (moved) {
        const ddx = (e.clientX - lastX) / vp.scale;
        const ddy = (e.clientY - lastY) / vp.scale;
        const s = scene();
        const targets = new Set<string>([dragNodeId]);
        if (graphLiquid) {
          for (const ed of store.doc.graph.edges) {
            if (ed.source === dragNodeId) targets.add(ed.target);
            else if (ed.target === dragNodeId) targets.add(ed.source);
          }
        }
        const overrides = canvasOverrides() ?? graphOverrides;
        for (const id of targets) {
          const sn = s?.byId.get(id);
          const base = overrides.get(id) ?? (sn ? { x: sn.x, y: sn.y } : null);
          if (base) overrides.set(id, { x: base.x + ddx, y: base.y + ddy });
        }
        lastX = e.clientX;
        lastY = e.clientY;
        buildScenes();
        draw();
      }
      return;
    }
    if (dragMode === "node" && dragNodeId && store) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (moved) {
        const s = scene();
        const n = s?.byId.get(dragNodeId);
        // Shift+drag detach (D2): drop the membership edge, free the node at its
        // current canvas position, then let subsequent frames move it normally.
        if (dragDetachPending && n && s && store && dragDetachSet.length) {
          for (const d of dragDetachSet) {
            const dn = s.byId.get(d.id);
            store.removeFromGroup(
              d.id,
              d.container,
              dn ? { x: dn.x, y: dn.y, w: dn.w, h: dn.h } : undefined,
            );
          }
          toast(
            dragDetachSet.length > 1
              ? `moved ${dragDetachSet.length} out of group`
              : "moved out of group",
          );
          dragDetachPending = false;
          dragDetachSet = [];
          dragCheckpointed = true;
          lastX = e.clientX;
          lastY = e.clientY;
          return;
        }
        if (n && s && dragMemberIds && store && !inContext()) {
          if (dragIsGroupMove) {
            // whole-group drag: move the group node; members follow (container pass)
            store.moveNodesBy(
              [dragNodeId, ...dragMemberIds],
              dx / vp.scale,
              dy / vp.scale,
              !dragCheckpointed,
            );
          } else {
            // multi-selection move: shift EACH node respecting its own container
            for (const id of [dragNodeId, ...dragMemberIds])
              moveOneByDelta(id, dx / vp.scale, dy / vp.scale, !dragCheckpointed);
          }
          dragCheckpointed = true;
          lastX = e.clientX;
          lastY = e.clientY;
          return;
        }
        if (n && s) {
          // single-node drag: move the SCENE node directly so it follows the
          // cursor (a per-frame store rebuild would let the phase sub-band reflow
          // snap it back / jump). Committed on pointerup by handleDrop or reset.
          n.x += dx / vp.scale;
          n.y += dy / vp.scale;
          dragSceneDirty = true;
          draw();
        }
        lastX = e.clientX;
        lastY = e.clientY;
      }
      return;
    }

    // hover / tooltip
    const s = scene();
    if (!s) return;
    const showId = getSettings().developer.showNodeIds;
    const hit = hitTest(s, w.x, w.y);
    // A group container's big box shouldn't swallow a connector line running
    // through its empty interior: over a container we still probe for an edge,
    // so hover (and thus selection) reach it. Leaf nodes keep priority.
    const overContainer =
      !!hit && (s.groupsById?.has(hit.id) || isGroupType(hit.node.node_type));
    const eiHover =
      placingType || (hit && !overContainer) ? -1 : pickEdgeAt(w.x, w.y);
    const newHoverEdge = eiHover >= 0 ? eiHover : null;
    // when a connector is hovered, don't also accent the node/container under it
    const newHover = newHoverEdge != null ? null : (hit?.id ?? null);
    if (newHover !== hoverId || newHoverEdge !== hoverEdgeIdx) {
      hoverId = newHover;
      hoverEdgeIdx = newHoverEdge;
      draw();
    }
    // don't fight the Space-held pan cursor: leave the inline cursor empty so the
    // `.space-pan` grab/grabbing CSS wins while the spacebar is down
    canvas.style.cursor = spaceHeld
      ? ""
      : newHoverEdge != null
        ? "pointer"
        : "default";
    if (
      newHoverEdge != null &&
      !placingType &&
      getSettings().interaction.edgeTooltips
    ) {
      // connector tooltip: the edge type + its endpoints (endpoint labels follow
      // the same id-hiding rule as node tooltips)
      const se = s.edges[newHoverEdge];
      const endName = (id: string): string => {
        const n = s.byId.get(id)?.node;
        return String(n?.name || (showId ? id : (n?.node_type ?? id)));
      };
      tooltip.innerHTML = `<b></b> <span class="tt-type"></span><br><span class="tt-desc"></span>`;
      (tooltip.children[0] as HTMLElement).textContent = "connector";
      (tooltip.children[1] as HTMLElement).textContent =
        `[${se.edge.edge_type ?? "edge"}]`;
      (tooltip.children[3] as HTMLElement).textContent =
        `${endName(se.source)} → ${endName(se.target)}`;
      tooltip.style.left = Math.min(e.clientX + 14, innerWidth - 380) + "px";
      tooltip.style.top = e.clientY + 14 + "px";
      tooltip.classList.remove("hidden");
    } else if (hit && !placingType) {
      // The node id only surfaces when the developer "show node ids" setting is
      // on — otherwise both the title fallback and the type line stay id-free.
      tooltip.innerHTML = `<b></b> <span class="tt-type"></span><br><span class="tt-desc"></span>`;
      (tooltip.children[0] as HTMLElement).textContent = String(
        hit.node.name || (showId ? hit.id : hit.node.node_type),
      );
      (tooltip.children[1] as HTMLElement).textContent = showId
        ? `[${hit.node.node_type}] ${hit.id}`
        : `[${hit.node.node_type}]`;
      (tooltip.children[3] as HTMLElement).textContent = String(
        hit.node.description ?? "",
      ).slice(0, 220);
      tooltip.style.left = Math.min(e.clientX + 14, innerWidth - 380) + "px";
      tooltip.style.top = e.clientY + 14 + "px";
      tooltip.classList.remove("hidden");
    } else {
      tooltip.classList.add("hidden");
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    canvas.classList.remove("panning");
    const mode = dragMode;
    dragMode = "none";
    dragDetachPending = false;
    dragDetachSet = [];
    // "PD" tag click → enter the epoch/phase temporal PDG (a click, not a drag)
    if (pdTagPending) {
      const pd = pdTagPending;
      pdTagPending = null;
      if (!moved) enterGroup(pd);
      return;
    }
    // ornament badge click → select the real author/license/embargo node so the
    // Inspector edits it (the badge is only its view representation)
    if (adornmentPending) {
      const id = adornmentPending;
      adornmentPending = null;
      if (!moved) select(id);
      return;
    }
    // PD tablet single click → select the collapsed group (Inspector); the double
    // click is a separate handler that enters the hypergraph.
    if (pdDecoratorPending) {
      const id = pdDecoratorPending;
      pdDecoratorPending = null;
      if (!moved) select(id);
      return;
    }
    // phase band label click → select that phase (residual → the epoch)
    if (bandSelectPending) {
      const id = bandSelectPending;
      bandSelectPending = null;
      if (!moved) select(id);
      return;
    }
    // epoch "+" button click → add a phase to that epoch
    if (addPhasePending) {
      const epochId = addPhasePending;
      addPhasePending = null;
      if (!moved && store) {
        const ph = store.addPhase(epochId);
        select(ph.id);
        toast(`phase ${ph.name} created`);
      }
      return;
    }
    // lane-boundary "+" click → insert an epoch at that chronological slot, with
    // start/end interpolated to fill the gap between the two neighbours
    if (insertPending != null) {
      const bi = insertPending;
      insertPending = null;
      hoverInsertBoundary = null;
      if (!moved) {
        const { start, end } = insertSlotDates(bi);
        addEpochEmMode(bi, start, end);
      }
      return;
    }
    if (mode === "connect") {
      finishConnect(e.shiftKey || e.altKey); // Shift/Alt = force "create node"
      return;
    }
    if (mode === "graphnode") {
      if (!moved && dragNodeId) select(dragNodeId); // click (no drag) = select
      dragNodeId = null;
      graphLiquid = false;
      return;
    }
    const s = scene();
    if (!s) return;
    const w = worldPos(e);
    if (placingType) {
      placeNode(w.x, w.y);
      return;
    }
    if (mode === "marquee") {
      const m = marquee;
      marquee = null;
      if (moved && m) {
        const x0 = Math.min(m.x0, m.x1),
          x1 = Math.max(m.x0, m.x1),
          y0 = Math.min(m.y0, m.y1),
          y1 = Math.max(m.y0, m.y1);
        const ids = s.nodes
          .filter(
            (n) =>
              // BUGFIX-PDG · a collapsed-to-tablet PDG is not on the canvas: the
              // marquee must not sweep it up (it would select a phantom box in the
              // empty space where the PDG's layout rect sits).
              !n.collapsed &&
              n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0,
          )
          .map((n) => n.id);
        selectMany(ids);
      } else {
        // a click (no drag) on empty canvas: select a connector if one is under
        // the cursor, otherwise clear the selection
        const ei = pickEdgeAt(w.x, w.y);
        if (ei >= 0) selectEdge(s.edges[ei].edge);
        else select(null);
      }
      dragNodeId = null;
      dragMemberIds = null;
      return;
    }
    if (!moved) {
      const hit = hitTest(s, w.x, w.y);
      // group container ± toggle
      const toggle = hitGroupToggle(s, w.x, w.y);
      if (toggle && store) {
        requestFold(toggle.id);
        return;
      }
      // matrix: click in the left swimlane-label strip → select that epoch (T7),
      // but only when no node/box is under the cursor there (else the box wins).
      const rect2 = canvas.getBoundingClientRect();
      const sxS = e.clientX - rect2.left;
      const syS = e.clientY - rect2.top;
      if (view === "matrix" && !inContext() && sxS < 160 && !hit) {
        const vp2 = viewport();
        const lane = s.lanes.find((l) => {
          const ly = l.y * vp2.scale + vp2.y;
          return syS >= ly && syS <= ly + l.height * vp2.scale;
        });
        if (lane) {
          select(lane.id);
          return;
        }
      }
      // A connector passing through a group container's empty interior would be
      // swallowed by the big box — if the click landed on an edge line, select
      // the connector instead. Leaf nodes still win (only containers defer).
      if (hit && (s.groupsById?.has(hit.id) || isGroupType(hit.node.node_type))) {
        const ei = pickEdgeAt(w.x, w.y);
        if (ei >= 0) {
          selectEdge(s.edges[ei].edge);
          dragNodeId = null;
          dragMemberIds = null;
          return;
        }
      }
      // a document instance resolves to its real node (same outliner row);
      // Shift/Cmd-click toggles it in the multi-selection (D3)
      if (hit && (e.shiftKey || e.metaKey || e.ctrlKey))
        toggleSelect(hit.instanceOf ?? hit.id);
      else select(hit ? (hit.instanceOf ?? hit.id) : null);
    } else if (mode === "node" && dragNodeId) {
      // drag ended → route the drop (into a group box, or a different epoch lane)
      const reassigned = handleDrop(dragNodeId, w.x, w.y);
      // a single-node drag moved the SCENE node directly. If the drop did NOT
      // reassign it (dropped where it already belongs), PERSIST the freely-dragged
      // position to layout.positions — otherwise the rebuild snaps it back. Use the
      // net delta (not the absolute scene y, which bakes in the view-side lane
      // re-stack / sub-band shift and would make the node run away — cf. 203c6c8).
      if (dragSceneDirty && !reassigned && dragStartScene) {
        const sn = scene()?.byId.get(dragNodeId);
        if (sn) {
          const ddx = sn.x - dragStartScene.x;
          const ddy = sn.y - dragStartScene.y;
          if (Math.abs(ddx) + Math.abs(ddy) > 0.5)
            moveOneByDelta(dragNodeId, ddx, ddy, true);
        }
      }
      // rebuild so the node settles into its committed spot (persisted position,
      // or reassigned band/lane)
      if (dragSceneDirty) {
        buildScenes();
        draw();
      }
    }
    dragSceneDirty = false;
    dragNodeId = null;
    dragStartScene = null;
    dragMemberIds = null;
  });
  // Double-click a group container → enter its isolated canvas. Uses the native
  // dblclick event (browser fires it on a genuine double-click) instead of a
  // manual two-pointerup timer — the timer was unreliable because heavy per-click
  // work (buildMembership + a full redraw) could push the gap past its window.
  canvas.addEventListener("dblclick", (e) => {
    claim();
    const s = scene();
    if (!s) return;
    // PD1 · double-clicking the collapsed-PDG tablet enters the hypergraph
    const rect = canvas.getBoundingClientRect();
    const pdd = hitPdDecorator(e.clientX - rect.left, e.clientY - rect.top);
    if (pdd) {
      e.preventDefault();
      enterGroup(pdd);
      return;
    }
    const w = worldPos(e);
    const hit = hitTest(s, w.x, w.y);
    if (!hit) return;
    if (isGroupType(hit.node.node_type)) {
      e.preventDefault();
      enterGroup(hit.id);
      return;
    }
    // DTC seam: double-clicking a RepresentationModel / Document / the Resource
    // itself that resolves to a DTC-output Resource folds into its upstream DTC
    // genesis (process → input resources), reusing the hypergraph context.
    const res = resolveDtcResource(hit.id);
    if (res) {
      e.preventDefault();
      enterGroup(res);
    }
  });
  canvas.addEventListener("pointerleave", () => {
    tooltip.classList.add("hidden");
    canvas.style.cursor = "default";
    if (hoverId || hoverEdgeIdx != null) {
      hoverId = null;
      hoverEdgeIdx = null;
      draw();
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      claim();
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      markCameraTouched(winId, view);
      viewport().zoomAt(
        e.clientX - rect.left,
        e.clientY - rect.top,
        Math.exp(-e.deltaY * 0.0016),
      );
      draw();
    },
    { passive: false },
  );
  canvas.addEventListener("contextmenu", (e) => {
    claim();
    e.preventDefault();
    const wp = worldPos(e);
    const s = scene();
    const hit = s ? hitTest(s, wp.x, wp.y) : null;
    // DTCEMS1 · a parent that did NOT resolve gets a menu of its own, and the
    // reason is not cosmetic: that node is in no document at all — it is the
    // drawing of an absence — so the document's own menu (group, rename,
    // delete) has nothing to say to it. There is exactly one thing worth asking
    // of it: GO AND LOOK FOR IT.
    const ghost = hit ? missingParentAt(hit.id) : null;
    if (ghost) {
      hideContextMenu();
      showMissingParentMenu(e.clientX, e.clientY, ghost);
      return;
    }
    // right-clicking a node outside the current selection selects it first
    if (hit && !selectedIds.has(hit.id)) select(hit.instanceOf ?? hit.id);
    if (!selectedIds.size) {
      hideContextMenu();
      return;
    }
    showContextMenu(e.clientX, e.clientY);
  });
}


// W1 · STORAGE → VIEWER. A resource drop, NOT a node-type drop: the Viewer is
// still absent from `RESOURCE_PROVIDERS` (it places nothing, so no palette and
// no chevron) and it still refuses `PALETTE_MIME`. What it accepts is a folder
// or a file dragged out of a Storage window — "show me this" — which is a
// different sentence from "create one of these", carried on a different mime so
// the two can never be confused for one another.
//
// ONE SURFACE · wired on the AREA now (`createArea`), not on `#viewer-view`.
// That element was the focused mount, so this handler only ever caught a drop on
// a Viewer window that already had the focus — and the area's own handler, which
// takes the focus and then pins the collection, has covered both cases since W1.
// One listener, one place, and it works in every area.

// ---------- canvas interactions ----------
type DragMode =
  | "none"
  | "pan"
  | "node"
  | "graphnode"
  | "connect"
  | "marquee";
let dragMode: DragMode = "none";
// multi-selection (D3): the primary stays `selectedId`; the set is all selected
let selectedIds = new Set<string>();
// rubber-band marquee rect in WORLD coords while dragging on empty canvas
let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
let moved = false;
let lastX = 0;
let lastY = 0;
let dragNodeId: string | null = null;
// scene position of a single dragged node at drag start, so pointerup can persist
// the net delta to layout.positions (a single-node drag moves the scene node
// directly for smoothness; without this it would snap back on rebuild)
let dragStartScene: { x: number; y: number } | null = null;
let graphLiquid = false; // Shift held at graph-drag start → drag the cluster
let dragMemberIds: string[] | null = null;
// true = group-drag (move the group node, members follow); false = multi-select
// move (move each selected node, respecting its container)
let dragIsGroupMove = false;
let dragCheckpointed = false;
let dragDetachPending = false; // Shift+drag a member → pull it out of its group
// nodes to pull out of their groups on shift+drag (whole selection if multi)
let dragDetachSet: { id: string; container: string }[] = [];
let spaceHeld = false; // Space → pan-always gesture (see pointerdown)
let pdTagPending: string | null = null; // PD tag pressed → enter on click (pointerup)
let adornmentPending: string | null = null; // ornament badge pressed → select real node
let pdDecoratorPending: string | null = null; // PD tablet pressed → select group on click
let bandSelectPending: string | null = null; // phase band label pressed → select on click
let addPhasePending: string | null = null; // epoch "+" button pressed → add phase on click
let hoverInsertBoundary: number | null = null; // EM-mode insert-epoch: hovered lane boundary
let insertPending: number | null = null; // insert boundary pressed → add epoch on click

// Which top-level lane boundary (0 = above the top lane … lanes.length = below
// the last) is the cursor near? Only in Matrix, in the left strip, when idle —
// drives the "insert epoch here" affordance (hover indicator + click).
function insertBoundaryAt(sx: number, sy: number): number | null {
  if (view !== "matrix" || !store || placingType || dragMode !== "none")
    return null;
  const s = scenes.matrix;
  if (!s || !s.lanes.length) return null;
  if (sx > 150) return null; // left strip only — clear of content and node drags
  const vp = viewport();
  const TOL = 6;
  let best: number | null = null;
  let bestD = TOL + 1;
  for (let i = 0; i <= s.lanes.length; i++) {
    const worldY =
      i < s.lanes.length
        ? s.lanes[i].y
        : s.lanes[i - 1].y + s.lanes[i - 1].height;
    const by = worldY * vp.scale + vp.y;
    const d = Math.abs(sy - by);
    if (d <= TOL && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

// Interpolate a chronological slot for an epoch inserted at boundary `bi`: fill
// the gap between the newer neighbour above and the older neighbour below.
function insertSlotDates(bi: number): { start?: number; end?: number } {
  const s = scenes.matrix;
  if (!s) return {};
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const boundOf = (laneId: string, which: "start_time" | "end_time") =>
    num((store!.node(laneId)?.data as Record<string, unknown>)?.[which]);
  const upper = bi > 0 ? s.lanes[bi - 1] : null; // newer neighbour (above)
  const lower = bi < s.lanes.length ? s.lanes[bi] : null; // older neighbour (below)
  // start_time = older bound, end_time = newer bound; lanes sort by start desc.
  const start = lower ? boundOf(lower.id, "end_time") : undefined;
  const end = upper ? boundOf(upper.id, "start_time") : undefined;
  return { start, end };
}
// a single-node drag moves the SCENE node directly (no per-frame rebuild) so it
// tracks the cursor smoothly even inside phase sub-bands; the drop is committed
// on pointerup (reassign via handleDrop, else the scene resets on rebuild).
let dragSceneDirty = false;


// Move ONE node by a world delta, respecting its container: a member of an
// open container keeps its group-local position (moveInGroupSpace); a free
// node moves on the canvas. Used for single-node AND multi-selection drags —
// the latter needs this so container members actually move (moveNodesBy only
// touches layout.positions, which the container pass overrides for members).
function moveOneByDelta(
  id: string,
  ddx: number,
  ddy: number,
  checkpoint: boolean,
): void {
  const s = scene();
  if (!s || !store) return;
  const sn = s.byId.get(id);
  if (!sn) return;
  const nx = sn.x + ddx;
  const ny = sn.y + ddy;
  const containerId = s.memberOf?.get(id);
  if (inContext()) {
    store.moveInGroupSpace(
      contextStack[contextStack.length - 1],
      id,
      { x: nx, y: ny, w: sn.w, h: sn.h },
      checkpoint,
    );
  } else if (containerId) {
    const g = s.groupsById!.get(containerId)!;
    store.moveInGroupSpace(
      containerId,
      id,
      {
        x: nx - (g.x + GROUP_PAD),
        y: ny - (g.y + GROUP_HEADER + GROUP_PAD),
        w: sn.w,
        h: sn.h,
      },
      checkpoint,
    );
  } else {
    // Apply the delta straight to layout.positions. Reading the scene's
    // absolute y here (sn.y + ddy) would bake in the view-side swimlane
    // re-stack / sub-band shift on every frame — that shift is NOT in
    // layout.positions, so it compounds and the node runs away (worst on
    // free nodes like extractor/combiner in a lower, shifted lane).
    store.moveNodesBy([id], ddx, ddy, checkpoint);
  }
}







// ---------- right-click context menu → Group (D3) ----------
const GROUP_CANDIDATES = [
  "ParadataNodeGroup",
  "ActivityNodeGroup",
  "TimeBranchNodeGroup",
  "LocationNodeGroup",
];

// group types whose membership edge is valid (per the datamodel) for EVERY
// selected node type — so we only ever offer a legal grouping.
function validGroupTargets(
  nodeTypes: string[],
): { groupType: string; edgeType: string }[] {
  const out: { groupType: string; edgeType: string }[] = [];
  for (const G of GROUP_CANDIDATES) {
    let edge: string | null = null;
    let ok = true;
    for (const nt of nodeTypes) {
      const m = allowedEdgeTypes(nt, G).find((t) => MEMBERSHIP_EDGES.has(t));
      if (!m) {
        ok = false;
        break;
      }
      edge = m;
    }
    if (ok && edge) out.push({ groupType: G, edgeType: edge });
  }
  return out;
}

let ctxMenuEl: HTMLDivElement | null = null;
function hideContextMenu(): void {
  ctxMenuEl?.remove();
  ctxMenuEl = null;
}
/** Il genitore irrisolto che sta dietro questo nodo della scena, o null.
 *
 *  Chiesto alla CATENA e non al nodo disegnato: il nodo porta un marcatore di
 *  disegno, la catena porta il fatto (`id`, `digest`, `label`) — e la ricerca
 *  ha bisogno del fatto. */
function missingParentAt(nodeId: string): StampParent | null {
  if (diskStamps.status !== "stamped") return null;
  if (!nodeId.startsWith("missing:")) return null;
  const wanted = nodeId.slice("missing:".length);
  return diskStamps.chain.missing.find((m) => m.resource_id === wanted) ?? null;
}

/**
 * «Cerca questo genitore» — e quando lo trova **scrive una pista, non il timbro**.
 *
 * Due posti, e sono i due che il disegno nomina: **intorno** a dove ci si
 * aspettava di trovarlo (la cartella del file di partenza, ricorsivamente), e in
 * **un albero scelto da chi guarda**. In tutti e due i casi l'ordine lo dà la
 * somiglianza del nome e **l'accettazione la dà l'impronta, mai il nome**.
 */
function showMissingParentMenu(
  clientX: number, clientY: number, parent: StampParent,
): void {
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.style.left = Math.min(clientX, innerWidth - 260) + "px";
  menu.style.top = clientY + "px";
  const header = document.createElement("div");
  header.className = "ctx-header";
  header.textContent = t("stamp.missingHeader",
                         { label: parent.label || parent.resource_id });
  menu.appendChild(header);

  const anchor = diskStamps.status === "stamped" ? diskStamps.path : "";
  const near = anchor.slice(0, anchor.lastIndexOf("/")) || "";
  const run = async (folder: string, recursive: boolean): Promise<void> => {
    hideContextMenu();
    if (!folder) return;
    toast(t("stamp.searching", { where: baseName(folder) || folder }));
    const found = await searchForParent(parent, folder, {
      recursive, maxFiles: 800,
    });
    if (!found) {
      toast(t("stamp.searchNothing",
              { label: parent.label || parent.resource_id }));
      return;
    }
    // LA PISTA, e nient'altro. Il timbro resta quello che era: non esiste in
    // questo programma un percorso che ne scriva uno (`check-stamps-readonly`).
    const noted = await recordFound(found.digest, found.path, { anchor });
    toast(noted.written
      ? t("stamp.searchFound", { name: baseName(found.path) })
      : t("stamp.searchFoundNoWrite", { name: baseName(found.path) }));
    void askStamps(anchor);       // read it again: the hint now resolves it
  };

  const item = (label: string, onClick: () => void): void => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = onClick;
    menu.appendChild(b);
  };
  if (near) {
    item(t("stamp.searchNear", { where: baseName(near) || near }),
         () => void run(near, true));
  }
  item(t("stamp.searchElsewhere"), () => {
    void (async () => {
      const folder = await pickFolder();
      if (folder) await run(folder, true);
    })();
  });
  document.body.appendChild(menu);
  // LO STESSO elemento del menu del documento: la chiusura al pointerdown fuori
  // esiste già una volta sola (window listener, più in basso), e un secondo
  // meccanismo di chiusura sarebbe un secondo modo di lasciare un menu aperto.
  ctxMenuEl = menu;
}

function showContextMenu(clientX: number, clientY: number): void {
  hideContextMenu();
  if (!store || !selectedIds.size) return;
  const ids = [...selectedIds];
  const types = ids.map((id) => store!.node(id)?.node_type ?? "");
  const targets = validGroupTargets(types);
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.style.left = Math.min(clientX, innerWidth - 210) + "px";
  menu.style.top = clientY + "px";
  const header = document.createElement("div");
  header.className = "ctx-header";
  header.textContent = `${ids.length} node${ids.length > 1 ? "s" : ""} selected`;
  menu.appendChild(header);
  // NAME1 · a name that breaks the convention gets a one-click fix, and the
  // suggestion is the same one the orange/red label is complaining about (both
  // read `nameStatus`). Only for a single selection: renaming several nodes to
  // "the next free name" in one gesture would need an order nobody chose.
  if (ids.length === 1) {
    const check = nameStatus.get(ids[0]);
    if (check?.suggestion) {
      const b = document.createElement("button");
      b.textContent = `Rinomina a "${check.suggestion}"`;
      if (check.reason) b.title = check.reason;
      b.onclick = () => {
        const from = store!.node(ids[0])?.name ?? "";
        // the display NAME changes; the id stays the UUID it always was
        store!.updateNode(ids[0], { name: check.suggestion! });
        hideContextMenu();
        toast(`${from || ids[0]} → ${check.suggestion}`);
      };
      menu.appendChild(b);
    }
  }
  if (targets.length) {
    for (const t of targets) {
      const b = document.createElement("button");
      b.textContent = `Group into ${t.groupType.replace("NodeGroup", "")} group`;
      b.onclick = () => {
        // position the new group at the members' bounding box so the matrix
        // draws it (nodes without a layout position are skipped)
        const sc = scene();
        let minX = Infinity,
          minY = Infinity;
        for (const id of ids) {
          const sn = sc?.byId.get(id);
          if (sn) {
            minX = Math.min(minX, sn.x);
            minY = Math.min(minY, sn.y);
          }
        }
        const pos = Number.isFinite(minX)
          ? { x: minX - 24, y: minY - 24, w: 200, h: 140 }
          : undefined;
        const g = store!.groupNodes(ids, t.groupType, t.edgeType, pos);
        hideContextMenu();
        select(g.id);
        toast(`grouped ${ids.length} into ${g.name}`);
      };
      menu.appendChild(b);
    }
  } else {
    const d = document.createElement("div");
    d.className = "ctx-disabled";
    d.textContent = "No legal group for this selection";
    menu.appendChild(d);
  }
  document.body.appendChild(menu);
  ctxMenuEl = menu;
}

// close the menu on any pointerdown outside it
window.addEventListener(
  "pointerdown",
  (e) => {
    if (ctxMenuEl && !ctxMenuEl.contains(e.target as Node)) hideContextMenu();
  },
  true,
);

window.addEventListener("keydown", (e) => {
  const inField =
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (e.shiftKey) void saveAsDocument();
    else void saveDocument();
    return;
  }
  if (inField) return;
  // WIN7 · Ctrl+Space magnifies the focused area and brings it back — Blender's
  // shortcut, and it must be read BEFORE the plain-Space pan below, which would
  // otherwise swallow it and leave the canvas in a grab it never got out of.
  if (e.code === "Space" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    magnifyWindow(activeWin().id);
    return;
  }
  if (e.code === "Space" && !spaceHeld) {
    // hold Space → pan-always (grab) gesture; prevent page scroll.
    spaceHeld = true;
    // every graph canvas: Space is held for the APP, and the hand may be over
    // any of them by the time it is pressed
    for (const g of graphMounts()) {
      g.cv.classList.add("space-pan");
      // clear the inline cursor NOW (a prior hover left it "default"/"pointer",
      // which would override the .space-pan grab until the mouse next moves)
      g.cv.style.cursor = "";
    }
    e.preventDefault();
    return;
  }
  if (e.code === "Space") {
    e.preventDefault(); // swallow auto-repeat without re-running the above
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) undoStore()?.redo();
    else undoStore()?.undo();
    return;
  }
  if (e.key === "0") fit();
  if (e.key === "Escape") {
    if (ctxMenuEl) hideContextMenu();
    else if (placingType) cancelPlacing();
    else if (filterPanelOpen()) closeFilterPanel();
    else if (!edgeMenu.classList.contains("hidden")) hideEdgeMenu();
    else if (inContext()) {
      contextStack.pop();
      rebuildContext();
    } else select(null);
  }
  if (
    (e.key === "Delete" || e.key === "Backspace") &&
    (selectedIds.size || selectedId) &&
    store
  ) {
    e.preventDefault();
    // delete the WHOLE multi-selection, not just the active node
    const ids = selectedIds.size ? [...selectedIds] : selectedId ? [selectedId] : [];
    // epochs & phases must go through their dedicated flows (swimlane + temporal
    // PDG cleanup, unit re-home/un-attribution, relayout) — the generic
    // deleteNodes would leave a phantom lane and orphan PDGs.
    const isEpochish = (id: string) =>
      storeOfNode(id)?.node(id)?.node_type === "EpochNode";
    if (ids.length === 1 && isEpochish(ids[0])) {
      if (store.parentEpoch(ids[0]) != null) promptDeletePhase(ids[0]);
      else promptDeleteEpoch(ids[0]);
      return;
    }
    const plain = ids.filter((id) => !isEpochish(id));
    if (plain.length !== ids.length)
      toast("Epochs/phases: use Delete epoch / Delete phase in the inspector");
    if (plain.length) {
      // DAG · one gesture can only ever hold nodes of one document (the canvas
      // draws one), but group them by owner rather than trusting that: a
      // selection that survived a document switch would otherwise delete nothing
      // and say nothing.
      const byOwner = new Map<DocumentStore, string[]>();
      for (const id of plain) {
        const owner = storeOfNode(id);
        if (!owner) continue;
        if (!byOwner.has(owner)) byOwner.set(owner, []);
        byOwner.get(owner)!.push(id);
      }
      for (const [owner, ids2] of byOwner) owner.deleteNodes(ids2);
      select(null);
    }
  }
  if ((e.key === "Delete" || e.key === "Backspace") && selectedEdge && store) {
    e.preventDefault();
    const edge = selectedEdge;
    selectedEdge = null; // clear before the store's onChange re-render
    (storeOfEdge(edge) ?? store).deleteEdge(edge);
    refreshInspector();
  }
  if (e.key === "+" || e.key === "=") {
    viewport().zoomAt(viewSize().w / 2, viewSize().h / 2, 1.25);
    draw();
  }
  if (e.key === "-") {
    viewport().zoomAt(viewSize().w / 2, viewSize().h / 2, 0.8);
    draw();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceHeld = false;
    for (const g of graphMounts()) {
      g.cv.classList.remove("space-pan");
      // restore a normal cursor immediately (the inline style was cleared to ""
      // while Space was held so the .space-pan grab cursor could show)
      g.cv.style.cursor = "default";
    }
  }
});

window.addEventListener("beforeunload", (e) => {
  if (store?.dirty) e.preventDefault();
});

// ONE SURFACE · the arrangement is coordinates now, so the browser no longer
// reflows it on its own: when the shell changes size the rectangles are
// recomputed. Stated as the declared cost of the choice (`shell/layout.ts`) —
// one observer, on the element that was already being observed for the canvas.
new ResizeObserver(() => {
  positionAreas();
  reflectLiveArea();
  draw();
  draw();
}).observe(tileRoot);
draw();
// repaint when an official icon finishes decoding
import("./icons").then(({ setIconRedraw }) => setIconRedraw(() => draw()));

// K1 — the desktop shell warns when the bridge on :8765 is somebody else's, so
// the keychain key cannot reach it. Surfaced as a toast AND a log line: the toast
// is what the user sees now, the log is what they find when generation later says
// "no API key".
void onForeignBridge((message) => {
  logWarn(message);
  toast(message);
});

// ---------- boot ----------
// An invite link (`?join=<token>`) is the first thing to answer: it decides which
// room this session is about, so it runs before anything auto-connects.
void acceptPendingInvite();
// …and a HANDOFF (`stratigraph://open?server=&room=`, or the same parameters on
// this page's URL) is the other way a session learns which room it is about.
// Separate from the invite on purpose: an invite carries a ROLE and writes the
// ACL; a handoff carries a PLACE and carries nothing else.
void wireDesktopDeepLink();
// Language FIRST: `initI18n` sets `dir`/`lang` on <html> and translates the
// static chrome before anything is rendered. Doing it after the first render
// would show a frame of English (or an LTR frame in Hebrew) and then flip.
initI18n();
populateLanguageSelect();
renderWarningsPill();
// PELLE · the canvas face (Sora) arrives after the first frame; one redraw when
// it is in, so the drawing does not stay in the fallback until the next click.
whenCanvasFontsReady(() => draw());
// Evaluate the empty state ONCE at boot. Without this, the canvas overlays kept
// whatever the markup said until the first document arrived — so the filter
// button sat there, enabled, filtering nothing (POL1 point 8 was only half true:
// the rule was right, it just never ran before the first load).
updateToolbar();
// WIN2 · reopen the arrangement the session was left in: the persisted workspace
// and ITS active window's mode. Before this the leader chip showed the saved
// workspace while the canvas silently sat in Matrix — the saved state was a
// label, not a state. Safe on an empty canvas (fit/buildScenes are no-ops
// without a store).
// THE CONTRACT, honoured before the first area exists (`shell/surface.ts`): the
// six converted types register their ONE constructor here, and the renderers
// they need travel as arguments — so `shell/` never imports `main.ts` and its
// `setFocused` bodies can be read by a checker without the app behind them.
registerBuiltinSurfaces({
  addEmDataHost, removeEmDataHost, renderEmData,
  addStorageHost, removeStorageHost, renderStorage,
  renderShelfInto, renderViewerInto, renderDocViewInto, reflectDocWidth,
  renderStudyInto,
  // …and the two the hosted panels need: which tab this window shows, and how a
  // panel gets built into a host. `shell/` draws none of them — it only knows
  // that a panel can be repainted, told the selection moved, and taken down.
  panelIdOf, mountPanel,
  // …and the last two types to cross over: the narrative (which stopped being a
  // MODE on 14 September) and the annotator (one constructor, a declared limit).
  renderNarrativeInto, renderAnnotatorInto,
  // …and the last one to cross over: a graph window's canvas, its ten gestures
  // and its own minimap.
  mountGraph: (cv, mini, win) => { mountGraphCanvas(cv, mini, win); },
  unmountGraph: unmountGraphCanvas,
  repaintGraphs: draw,
});
// STUDIO · the app STARTS with the Studio's three windows (E.D., 28 set 2026):
// the outliner, the graph, the inspector. A workspace still holding the single
// window `seedWindows` gave it — i.e. one nobody has shaped yet — gets its
// preset once; after that the arrangement is the user's, and joining it back to
// one window is a choice the next boot respects.
{
  const KEY = "emstudio.arranged";
  let done: string[] = [];
  try { done = JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]; } catch { /* fresh */ }
  const ws = activeWorkspace();
  if (!done.includes(ws)) {
    if (!isTiled(ws)) applyArrangement(ws);
    try { localStorage.setItem(KEY, JSON.stringify([...done, ws])); } catch { /* not fatal */ }
  }
}
renderTiles(); // WIN5 · lay out the arrangement this session was left in

// …and THEN what this page was asked to be about. One function, because the
// three steps have to happen in one order and that order is the whole repair:
// see `bootSession`.
void bootSession();

// A2/IIIF · the interoperability corner of the annotator. Bound once, here,
// like every other piece of static chrome: the buttons exist in the markup and
// are hidden until the picture on screen actually has an Image API service.
document.getElementById("annotator-copy-anno")
  ?.addEventListener("click", () => copyWebAnnotations());
document.getElementById("annotator-paste-anno")
  ?.addEventListener("click", () => pasteWebAnnotation());
document.getElementById("annotator-mirador")
  ?.addEventListener("click", () => openInMirador());

// EM-Data (DP-81): a live tabular view on the active store. Reads `store`
// through a getter so it always sees the current slot; re-renders from the
// store's onChange (wired in wireStore).
//
// ONE SURFACE · nothing is registered here any more. This block used to add the
// mount of the FOCUSED Tabular window — `#table-view-body`, enabled by asking
// whether `#table-view` was hidden — alongside the per-area hosts that
// `buildSecondarySurface` registered. Two registrations, one for the focused
// path and one for the other. There is one now, made by the Table surface in
// `shell/types.ts` when its area is mounted, and it is the same object whichever
// window has the focus. The row actions went with it: `EmDataHost.actions` was
// `#table-view-actions`, an element `renderEmData` only ever EMPTIED — the row
// verbs have been in the window's `Righe ▸` menu since HDR1.

initAnnotatorGestures();   // A2 · the overlay is a singleton: wire it once
refreshIdentityChip();     // IDENTITY · who is authoring, from the first frame
initEmData({
  getStore: () => store,
  // CURRENT-ELEMENT · the row lives on the window, not in the table module
  currentRow: () => currentRowId(),
  // ROWSELECT · picking a row selects its NODE, and shows it if a graph window
  // is open on the same document. A row id IS a node id in EM, which is what
  // makes this a two-line hook rather than a lookup table.
  onRowPicked: (id) => revealFromTable(id),
  setCurrentRow: (id) => setCurrentRowId(id),
});
// AUX2: the EM-Data table paints a row blue iff its node is volatile — the SAME
// marker the canvas overlay reads, so table and graph never disagree.
setVolatileProvider((id) => isVolatile(store?.node(id)));

// Start from an EMPTY canvas (more natural than auto-loading a sample): use
// New, Open…, drop a file, or Sync. __EM_TEST_DATA__ still injects a fixture
// for automated tests.
if (window.__EM_TEST_DATA__) {
  loadDocument(window.__EM_TEST_DATA__, "embedded test data");
}
