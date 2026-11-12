/**
 * MICRO-ERRORE-GEOMETRICO (E.D., 8 Nov 2026; measured 7 Nov) · the viewer
 * sets the tilesets' screen-space error BY ITSELF — pure (no three, no DOM):
 * `scripts/check-tiles-error.mjs`.
 *
 * Metashape's tilesets of Templu Mare cost ~4× the draw calls of the old
 * Blender one at the same level (twice the tiles a level, ~2.2 primitives a
 * tile against 1). The renderer's fixed 16 pixels (`errorTarget`) drew them
 * all. Now the error starts from the machine's profile (`asset-versions.ts`
 * HARDWARE: desktop / web / mobile) and moves within it after two numbers the
 * frame can measure:
 *
 *   · the DRAW CALLS of the frame (`renderer.info.render.calls`) — the tiles'
 *     own and the rest's (proxies, models, the globe: they are not governed,
 *     they take their share of the goal first);
 *   · the tiles' MEMORY against its ceiling (the renderer's LRU).
 *
 * Over the goal the error grows (×1.25, as soon as five fresh samples say so —
 * the frames measured before a change saw the old error — and the tiles of
 * the last change have come, or 2 s have passed);
 * well under it (60 %) for 1.5 s, nothing loading, it shrinks back (÷1.25) but
 * never under the profile's start — the start is the quality asked, the
 * governor only gives it up when the machine cannot pay. Hysteresis: the band
 * between 60 % and 100 % holds; an error that was over budget is not tried
 * again for 10 s.
 *
 * «Manuale» is the person's choice only (the tileset's bar, Settings): then
 * the error is theirs and nothing moves it.
 */

export type Hardware = "desktop" | "web" | "mobile";

export interface ErrorProfile {
  /** the error the tilesets start from, pixels (and the finest the governor goes back to) */
  start: number;
  /** the coarsest it may reach */
  max: number;
  /** the draw calls a frame may cost, everything drawn */
  calls: number;
}

/** The profiles — how they were chosen: the MICRO's report
 *  (`2026-11-13-REPORT-errore-geometrico-automatico.md`). */
export const ERROR_PROFILES: Readonly<Record<Hardware, ErrorProfile>> = {
  desktop: { start: 16, max: 128, calls: 1000 },
  web: { start: 24, max: 192, calls: 500 },
  mobile: { start: 32, max: 256, calls: 200 },
};

/** the error's bounds for the cursor of «Manuale», pixels */
export const ERROR_MANUAL_MIN = 2;
export const ERROR_MANUAL_MAX = 256;

/** The person's choice: the governor's, or a number of pixels */
export type ErrorChoice = "auto" | number;

export const normaliseErrorChoice = (v: unknown): ErrorChoice => {
  const n = Number(v);
  return v === "auto" || v == null || v === "" || !(n > 0) ? "auto"
    : Math.min(ERROR_MANUAL_MAX, Math.max(ERROR_MANUAL_MIN, Math.round(n)));
};

export interface GovernorSample {
  /** the frame's draw calls, everything drawn */
  calls: number;
  /** …of them, the governed tilesets' */
  tileCalls: number;
  /** the tiles' bytes and their ceiling (summed over the governed layers) */
  bytes: number;
  maxBytes: number;
  /** a tile is downloading or parsing */
  busy: boolean;
  /** ms (performance.now) */
  now: number;
}

export type GovernorReason = "start" | "calls" | "memory" | "relax" | "hold";

export interface GovernorState {
  /** the error the tilesets read now, pixels */
  target: number;
  /** why it is where it is (the last move) */
  reason: GovernorReason;
  /** the tiles' share of the goal (the goal less what the rest draws) */
  tileGoal: number;
  /** the median of the tiles' calls over the last frames */
  tileCalls: number;
  /** the frame's calls (median) */
  calls: number;
  memory: number;
  profile: ErrorProfile;
}

const STEP = 1.25;
const HIGH = 1.0;
const LOW = 0.6;
const MEM_HIGH = 0.9;
const MEM_LOW = 0.7;
const RAISE_MS = 400;
/** …or, while tiles still load after a change (the new level not drawn yet), this long */
const RAISE_BUSY_MS = 2000;
/** the samples a decision needs after a change (the frames before it measured another error) */
const FRESH = 5;
const RELAX_MS = 1500;
const BLOCK_MS = 10_000;
const WINDOW = 9;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1]! : 0;
};

export interface ErrorGovernor {
  /** a frame measured; answers the error to apply */
  sample(s: GovernorSample): number;
  state(): GovernorState;
  /** the profile changed (Settings › the machine) — back to its start */
  setProfile(p: ErrorProfile): void;
}

export function createErrorGovernor(profile: ErrorProfile): ErrorGovernor {
  let p = profile;
  let target = p.start;
  let reason: GovernorReason = "start";
  const calls: number[] = [];
  const tiles: number[] = [];
  let lastChange = -Infinity;
  let underSince: number | null = null;
  /** an error found over budget, not tried again before `blockedUntil` */
  let blocked = 0;
  let blockedUntil = -Infinity;
  let last: Omit<GovernorState, "target" | "reason" | "profile"> = { tileGoal: p.calls, tileCalls: 0, calls: 0, memory: 0 };
  return {
    sample(s) {
      calls.push(Math.max(0, s.calls)); if (calls.length > WINDOW) calls.shift();
      tiles.push(Math.max(0, Math.min(s.tileCalls, s.calls))); if (tiles.length > WINDOW) tiles.shift();
      const c = median(calls), tc = median(tiles);
      // what is not the tiles' is paid first; the tiles keep a quarter at least
      const tileGoal = Math.max(p.calls / 4, p.calls - (c - tc));
      const memory = s.maxBytes > 0 ? s.bytes / s.maxBytes : 0;
      last = { tileGoal, tileCalls: tc, calls: c, memory };
      const overCalls = tc > tileGoal * HIGH;
      const overMem = memory > MEM_HIGH;
      const fresh = calls.length >= FRESH;
      const settled = !s.busy || s.now - lastChange >= RAISE_BUSY_MS;
      const change = (to: number, why: GovernorReason) => {
        target = to; reason = why; lastChange = s.now; underSince = null;
        // the frames measured so far saw the old error
        calls.length = 0; tiles.length = 0;
        return target;
      };
      if ((overCalls || overMem) && fresh && settled && s.now - lastChange >= RAISE_MS && target < p.max) {
        blocked = target; blockedUntil = s.now + BLOCK_MS;
        return change(Math.min(p.max, target * STEP), overCalls ? "calls" : "memory");
      }
      const under = tc < tileGoal * LOW && memory < MEM_LOW;
      if (!under) { underSince = null; return target; }
      underSince ??= s.now;
      if (!fresh || s.busy || target <= p.start || s.now - underSince < RELAX_MS || s.now - lastChange < RELAX_MS) return target;
      const next = Math.max(p.start, target / STEP);
      if (next <= blocked * 1.001 && s.now < blockedUntil) { reason = "hold"; return target; }
      return change(next, "relax");
    },
    state: () => ({ target, reason, profile: p, ...last }),
    setProfile(np) {
      p = np; target = np.start; reason = "start";
      lastChange = -Infinity; underSince = null; blocked = 0; blockedUntil = -Infinity;
      calls.length = 0; tiles.length = 0;
    },
  };
}
