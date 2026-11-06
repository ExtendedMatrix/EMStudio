/**
 * «Funzioni sperimentali» (E.D., 6 Nov 2026) · one switch, OFF for everyone.
 *
 * Off, the app is the app: no button, entry or word of what it guards. On, a
 * few functions still being tried are there. It is read ONCE, when the page
 * starts (a document opened with it off is read without them), so a change in
 * Settings asks for a reload.
 *
 * Where it is read: `localStorage["emstudio.experimental"] === "1"` (Settings ▸
 * the last entry, this machine only — never in a file, never in a room). The
 * browser checks turn it on with the environment variable
 * `EMSTUDIO_EXPERIMENTAL=1`: the check sets `window.__EM_EXPERIMENTAL__` and
 * the same key before the page loads (`scripts/experimental-env.mjs`).
 */
export const EXPERIMENTAL_KEY = "emstudio.experimental";

function read(): boolean {
  // a browser check sets this before the page runs (scripts/experimental-env.mjs)
  if ((globalThis as { __EM_EXPERIMENTAL__?: unknown }).__EM_EXPERIMENTAL__ === true) return true;
  try {
    return globalThis.localStorage?.getItem(EXPERIMENTAL_KEY) === "1";
  } catch {
    return false;
  }
}

/** the switch, as the page started */
export const EXPERIMENTAL: boolean = read();

/** what Settings writes; the page reads it at the next start */
export function setExperimental(on: boolean): void {
  try {
    if (on) localStorage.setItem(EXPERIMENTAL_KEY, "1");
    else localStorage.removeItem(EXPERIMENTAL_KEY);
  } catch { /* storage refused: stays as it is */ }
}

/** as stored now (it may differ from `EXPERIMENTAL` until the reload) */
export function experimentalStored(): boolean {
  return read();
}
