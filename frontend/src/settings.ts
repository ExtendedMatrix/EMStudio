// User preferences, persisted in localStorage. Kept small and
// forward-compatible — today it holds the live-sync target (ADR-002); more
// sections (appearance, layout defaults…) can slot in later.

import { type SyncAccept, SYNC_ACCEPTS } from "./sync";

export interface SyncSettings {
  /** ws (local/plain) or wss (TLS). A browser can only be a WS *client*. */
  protocol: "ws" | "wss";
  host: string;
  port: number;
  /** which tool hosts the session; only "blender" (EMtools) is wired today */
  tool: string;
  /**
   * C2 · what this client ACCEPTS from the host: `nothing` | `selection` |
   * `everything`. One gate per tool, and it sits with whoever receives.
   *
   * It used to be a four-state DIRECTION that also held traffic back on the way
   * out, and that was the wrong place: a gate on the way out is invisible to
   * the other end — «has not sent» and «got lost» look identical — while a gate
   * on the way in is always declared by whoever closed it, because they can see
   * themselves closing it.
   *
   * Three values and not four: on the way IN, `off` and `send` were the same
   * fact, while a selection and a graph edit are different in kind — one moves
   * my viewport, the other CHANGES MY DOCUMENT.
   *
   * Persisted per user/browser, because it is a working arrangement ("today I
   * am alone on two screens", "today somebody else is in Blender"), and
   * `everything` is the default because it IS the behaviour that existed before
   * this control did.
   */
  accept: SyncAccept;
  /** P4.3 · the StratiGraph Server whose rooms this client can join. Configuration, not
   *  a secret: the URL and the room name are what you would write on a
   *  whiteboard. The TOKEN is not here on purpose — it lives in memory for the
   *  session, because a token on disk outlives the reason it was issued. */
  hubUrl: string;
  hubRoom: string;
}

export interface DeveloperSettings {
  /** show node UUIDs (inspector, …) — noise for most users, off by default */
  showNodeIds: boolean;
}

export interface InteractionSettings {
  /** show a tooltip when hovering a connector (edge); on by default */
  edgeTooltips: boolean;
  /**
   * Documents must be named `D.<n>` (NAME1). ON by default, and relaxing it is
   * discouraged rather than forbidden.
   *
   * The reason it is a setting at all: an extractor's name derives from its
   * document's (`D.10` → `D.10.1`), so a free-form document name still works —
   * it just stops being readable as a reference. Off, a document is only
   * required to be unique and non-empty; duplicates and empties stay errors
   * either way.
   */
  strictDocumentNames: boolean;
}

/**
 * Which model writes an AI draft (N8).
 *
 * Note what is NOT here: the API key. Everything in this interface is persisted
 * to localStorage, and a credential in localStorage is a credential in every
 * script that runs on the page. The key lives in the OS keychain and is reached
 * through the desktop shell (`tauri.ts`), never through Settings.
 */
export interface AiSettings {
  /** provider id understood by em-bridge's registry (`claude`, `echo`, …) */
  provider: string;
  /** optional model override; empty = the provider's own default */
  model: string;
}

/**
 * Where the 3D lives (N9/N10).
 *
 * EMStudio does not embed a 3D engine and is not going to: the scenes are
 * ATON's, and Heriverse is the ATON web-app that reads this very graph. So the
 * only thing we need to know is the address of the server, and the reference —
 * a scene id, or a resource — comes from the graph. Empty `atonBase` means "not
 * configured", and an epoch3d embed then says so instead of failing silently.
 */
export interface IiifSettings {
  /** The IIIF Image API base of the deployment (`https://host/iiif/3`).
   *
   *  Configuration, never a stored fact: the identifier of an image is its own
   *  checksum, so only the HOST is unknown, and writing that host into a study
   *  would give every project a dead address the day the server moves. Empty
   *  means "no image service": thumbnails and the zoomable annotator fall back
   *  to what they did before, quietly. */
  base: string;
  /** Where "open in Mirador" went. UNREAD since MICRO-UN-POSTO (its one reader
   *  was the old Annotator's IIIF corner); kept so a saved settings file keeps
   *  its shape, and for the day Mirador returns in the Doc's «⋯». */
  mirador: string;
}

export interface ViewerSettings {
  /** ATON server root, e.g. `https://localhost:8083`. Empty = unconfigured. */
  atonBase: string;
  /** Where the Heriverse wapp is mounted under it (ATON wapps live at /a/…). */
  heriverseApp: string;
  /** MICRO-3DTILES · a whole glb over this many MB is not loaded by itself:
   *  the viewer asks, and proposes the tileset when there is one */
  lodLimitMB: number;
  /** …and a whole cloud over this many points */
  lodLimitPoints: number;
  /** the memory ceiling of a tileset's automatic refinement, MB */
  tilesMemoryMB: number;
}

/** MICRO-3DTILES · the defaults of the three, MEASURED (the MICRO's report,
 *  `misura-soglia.txt`). A whole glb costs THREE TIMES its size in the page's
 *  memory (50–800 MB, constant): 200 MB → 600 MB, the most a tab carries
 *  comfortably next to the rest of the editor — and ~80 s on a 20 Mbit/s line.
 *  A cloud of the same cost is ~13 M points (16 B each: 10 M → 458 MB, 20 M →
 *  916 MB), so the round number below it. The tiles' ceiling is
 *  3DTilesRendererJS's own default (`LRUCache.maxBytesSize`, 0.4 GB). */
export const LOD_LIMIT_MB = 200;
export const LOD_LIMIT_POINTS = 10_000_000;
export const TILES_MEMORY_MB = 400;

export interface Settings {
  sync: SyncSettings;
  developer: DeveloperSettings;
  interaction: InteractionSettings;
  ai: AiSettings;
  viewer: ViewerSettings;
  iiif: IiifSettings;
}

const KEY = "emstudio.settings";

const DEFAULTS: Settings = {
  sync: { protocol: "ws", host: "localhost", port: 8788, tool: "blender",
          accept: "everything", hubUrl: "", hubRoom: "" },
  developer: { showNodeIds: false },
  interaction: { edgeTooltips: true, strictDocumentNames: true },
  ai: { provider: "claude", model: "" },
  // No default host on purpose: a wrong one would look like a broken viewer.
  // The Heriverse deployment guide mounts the wapp at /a/heriverse.
  viewer: { atonBase: "", heriverseApp: "a/heriverse",
            lodLimitMB: LOD_LIMIT_MB, lodLimitPoints: LOD_LIMIT_POINTS, tilesMemoryMB: TILES_MEMORY_MB },
  // No default base, for the same reason the ATON one has none: a wrong host
  // would look like a broken image service rather than an unconfigured one.
  iiif: { base: "", mirador: "https://projectmirador.org/embed/" },
};

/** Providers em-bridge registers (`tools/llm_provider.py`). `echo` is a real
 *  provider, not a mock: deterministic, keyless, and enough to exercise the
 *  whole generate → attribute → validate path without a network call. */
export const AI_PROVIDERS: { value: string; label: string }[] = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "echo", label: "Echo — local trial, no key" },   // ALLOW-IT: a provider id/label pair, listed once and shown as-is
];

/** Sync targets. `enabled:false` entries render disabled — the host role is a
 *  role (ADR-002 §1); more hosts (EMStudio-desktop, StratiGraph Service) land
 *  later without a protocol change. */
export const SYNC_TOOLS: { value: string; label: string; enabled: boolean }[] =
  [
    { value: "blender", label: "Blender · EMtools", enabled: true },
    { value: "desktop", label: "EMStudio Desktop (soon)", enabled: false },
    { value: "server", label: "StratiGraph Service (soon)", enabled: false },
  ];

function clone(s: Settings): Settings {
  return {
    sync: { ...s.sync },
    developer: { ...s.developer },
    interaction: { ...s.interaction },
    ai: { ...s.ai },
    viewer: { ...s.viewer },
    iiif: { ...s.iiif },
  };
}

/**
 * C2 · a stored `direction` becomes an `accept`, reading the OLD value for what
 * it meant ON THE WAY IN.
 *
 * `off` and `send` both refused everything arriving; `receive` and `both` both
 * took it. So the four map onto two without guessing, and somebody who had
 * deliberately closed their gate does not find it open after an update — which
 * is the one way this rename could have gone wrong.
 *
 * (The Blender end cannot do this: a property registered on `bpy.types.Scene`
 * never appears in `scene.keys()`, even after being written — measured — so the
 * old value is simply unreachable there. Said in the report, not hidden.)
 */
function migrateSync(stored: Partial<SyncSettings> | undefined
                    ): Partial<SyncSettings> {
  const raw = { ...(stored ?? {}) } as Record<string, unknown>;
  const old = raw.direction;
  delete raw.direction;
  if (typeof raw.accept === "string"
      && (SYNC_ACCEPTS as string[]).includes(raw.accept)) {
    return raw as Partial<SyncSettings>;
  }
  if (old === "off" || old === "send") raw.accept = "nothing";
  else if (old === "receive" || old === "both") raw.accept = "everything";
  return raw as Partial<SyncSettings>;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // merge onto defaults so a missing/renamed field never breaks startup
    return {
      sync: { ...DEFAULTS.sync, ...migrateSync(parsed.sync) },
      developer: { ...DEFAULTS.developer, ...(parsed.developer ?? {}) },
      interaction: { ...DEFAULTS.interaction, ...(parsed.interaction ?? {}) },
      ai: { ...DEFAULTS.ai, ...(parsed.ai ?? {}) },
      viewer: { ...DEFAULTS.viewer, ...(parsed.viewer ?? {}) },
      iiif: { ...DEFAULTS.iiif, ...(parsed.iiif ?? {}) },
    };
  } catch {
    return clone(DEFAULTS);
  }
}

let current: Settings = load();

export function getSettings(): Settings {
  return clone(current);
}

export function saveSettings(next: Settings): void {
  current = clone(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore quota / private-mode security errors */
  }
}

/** The live-sync endpoint from the current settings, e.g. ws://localhost:8788 */
export function getSyncUrl(): string {
  const s = current.sync;
  return `${s.protocol}://${s.host}:${s.port}`;
}

/** ATON root with no trailing slash, or "" when unconfigured. */
export function atonBase(): string {
  return current.viewer.atonBase.trim().replace(/\/+$/, "");
}

/** The IIIF Image API base, trimmed — or "" when there is no image service.
 *
 *  Every caller treats "" as "do what you did before this existed": no
 *  thumbnail, no zoomable image, no Mirador button. A missing service must
 *  degrade quietly, not produce a broken picture. */
export function iiifBase(): string {
  return current.iiif.base.trim().replace(/\/+$/, "");
}

/** URL of a Heriverse SCENE — the app that reads an EM graph in 3D. */
export function heriverseSceneUrl(sceneId: string): string | null {
  const root = atonBase();
  if (!root || !sceneId) return null;
  const app = current.viewer.heriverseApp.trim().replace(/^\/+|\/+$/g, "");
  return `${root}/${app || "a/heriverse"}/?scene=${encodeURIComponent(sceneId)}`;
}

/** URL of ATON's single-item preview app for one 3D model (`?i=`). Accepts an
 *  absolute URL or a path relative to the ATON collection — ATON's own
 *  `resolveCollectionURL` handles both. */
export function atonPreviewUrl(item: string): string | null {
  const root = atonBase();
  if (!root || !item) return null;
  return `${root}/preview/?i=${encodeURIComponent(item)}`;
}
