/**
 * TOCCARE · the dev-only stopwatch of the canvas.
 *
 * Off unless the page is opened with `?perf` or `localStorage["em.perf"] = "1"`:
 * then every `perfTime(name, fn)` becomes a `performance.measure` (visible in the
 * DevTools timeline under `em:<name>`) AND a sample in `window.__EM_PERF__`, and
 * every `perfCount(name)` a counter. Off, both are one boolean test — the
 * markers stay in the code for the next person who needs to measure, which is
 * the point of leaving them.
 *
 * What the numbers are for is written in the night report
 * (`.claude/wip/reports/2026-09-30-il-grafo-si-lascia-toccare/`): a drag frame,
 * `buildScenes`, `draw`, `runLayout`, and the time from release to settled.
 */
const ON: boolean = (() => {
  try {
    return (
      new URLSearchParams(location.search).has("perf") ||
      localStorage.getItem("em.perf") === "1"
    );
  } catch {
    return false;
  }
})();

export const perfOn = ON;

interface PerfState {
  counts: Record<string, number>;
  /** busy milliseconds per name, summed — a probe diffs two readings */
  totals: Record<string, number>;
  samples: Record<string, number[]>;
  /** performance.now() of the last pointerup on a canvas, and of the last
   *  scene rebuild after it: their difference is "release → settled" */
  releaseAt: number;
  settledAt: number;
  reset(): void;
}

const state: PerfState = {
  counts: {},
  totals: {},
  samples: {},
  releaseAt: 0,
  settledAt: 0,
  reset() {
    this.counts = {};
    this.totals = {};
    this.samples = {};
    this.releaseAt = 0;
    this.settledAt = 0;
  },
};

if (ON) (window as unknown as { __EM_PERF__?: PerfState }).__EM_PERF__ = state;

export function perfCount(name: string): void {
  if (!ON) return;
  state.counts[name] = (state.counts[name] ?? 0) + 1;
}

function record(name: string, t0: number): void {
  const dt = performance.now() - t0;
  state.counts[name] = (state.counts[name] ?? 0) + 1;
  state.totals[name] = (state.totals[name] ?? 0) + dt;
  (state.samples[name] ??= []).push(dt);
  try {
    performance.measure(`em:${name}`, { start: t0, duration: dt });
  } catch {
    /* an old engine without the options form: the sample is enough */
  }
}

/** Time a synchronous piece of work. */
export function perfTime<T>(name: string, fn: () => T): T {
  if (!ON) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    record(name, t0);
  }
}

/** Time an asynchronous one (the WASM layout is awaited). */
export async function perfTimeAsync<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ON) return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    record(name, t0);
  }
}

export function perfRelease(): void {
  if (!ON) return;
  state.releaseAt = performance.now();
  state.settledAt = state.releaseAt;
}

/** The scene has reached its committed state (called after a rebuild). */
export function perfSettled(): void {
  if (!ON || !state.releaseAt) return;
  state.settledAt = performance.now();
}
