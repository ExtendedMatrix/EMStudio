/**
 * MICRO-SEG30 (E.D., 22 Nov 2026, 07:55) · THE REGISTER OF THE FUNCTIONS, AND
 * THE EMBARGO IN THE BUILD.
 *
 * The embargo is not of the code (this repository is public, and that is
 * fine) but of the BUILD: the community build — GitHub's releases, the site,
 * what `./em.sh devrel` / `ghrelease` tag — neither contains nor shows a
 * function under embargo. The lab build (`./em.sh build --lab`,
 * EMStudio_lab.app) has them, behind Preferences ▸ Advanced ▸ «Functions under
 * embargo».
 *
 * Each function of the register has a STATE:
 *
 *   · `public`       — there for everyone;
 *   · `experimental` — behind «Experimental functions» (experimental.ts), off
 *                      by default, in every build;
 *   · `embargo`      — only in the lab build, behind its own switch.
 *
 * HOW THE EMBARGO LEAVES THE BUILD. `__EM_LAB__` is a Vite `define`
 * (vite.config.ts: `EM_PROFILE=lab` → true, anything else → false): in the
 * community build `LAB` is the literal `false`, so every `LAB ? … : …` and
 * `if (LAB …)` folds and the dead branch — with its strings — is not emitted.
 * The `typeof` keeps a module that is bundled WITHOUT the define (the node
 * checks' esbuild, a dev server started before this file existed) working:
 * there it is simply the community.
 *
 * THE RULES, checked by `scripts/check-embargo.mjs`:
 *   1. an `embargo` entry is written ONLY inside `EMBARGO` below (the array
 *      that is `[]` in the community build), and `EMBARGO` holds only
 *      `embargo` entries;
 *   2. its texts (title, description) live in `i18n.ts` inside the blocks
 *      guarded the same way (`LAB_TEXTS`), never in the open dictionary;
 *   3. its SENTINEL is `em-embargo:<id>`: the release guard
 *      (`scripts/embargo-guard.mjs`, run by `devrel`, `ghrelease` and
 *      release.yml) looks for it in the community bundle and in the binary, and
 *      refuses the release when it finds it;
 *   4. the code of an embargo function is reached only through
 *      `featureOn(id)` / `LAB`, so it folds away with the register.
 *
 * PUBLISHING a function = changing its state here: move its entry out of
 * `EMBARGO` into `OPEN` with `state: "experimental"` (or `"public"`), move its
 * texts out of the `LAB_TEXTS` blocks of i18n.ts into the open dictionary,
 * and release. The guard stops looking for it by itself (it reads this file).
 */
import { EXPERIMENTAL } from "./experimental";

export type FeatureState = "embargo" | "experimental" | "public";

export interface Feature {
  /** stable id (kebab-case): the register's key, the command rows' `feature` */
  id: string;
  state: FeatureState;
  /** i18n keys (EN + IT in i18n.ts) */
  title: string;
  desc: string;
  /** embargo only: what the release guard looks for (`em-embargo:<id>`) */
  sentinel?: string;
}

/** true only in the lab build (`EM_PROFILE=lab`, `./em.sh build --lab`) */
export const LAB: boolean = typeof __EM_LAB__ !== "undefined" && __EM_LAB__ === true;

/** the name the app gives itself: the window's title, the status bar */
export const APP_NAME: string = LAB ? "EMStudio lab" : "EMStudio";

/** The functions every build knows. */
const OPEN: readonly Feature[] = [
  // EXPERIMENTAL · the site and its footprint (site-door.ts), MICRO-COR11
  { id: "site", state: "experimental", title: "feat.site.title", desc: "feat.site.desc" },
];

/** EMBARGO · the functions only the lab build has. `[]` in the community
 *  build: the entries, their ids and their sentinels are not in it. */
const EMBARGO: readonly Feature[] = LAB ? [
  { id: "functional-matrix", state: "embargo", title: "feat.functionalMatrix.title", desc: "feat.functionalMatrix.desc", sentinel: "em-embargo:functional-matrix" },
  { id: "functional-overlay", state: "embargo", title: "feat.functionalOverlay.title", desc: "feat.functionalOverlay.desc", sentinel: "em-embargo:functional-overlay" },
  { id: "landscape-matrix", state: "embargo", title: "feat.landscapeMatrix.title", desc: "feat.landscapeMatrix.desc", sentinel: "em-embargo:landscape-matrix" },
  { id: "landscape-cube", state: "embargo", title: "feat.landscapeCube.title", desc: "feat.landscapeCube.desc", sentinel: "em-embargo:landscape-cube" },
] : [];

/** The register as THIS build has it (the community: no embargo entry). */
export const FEATURES: readonly Feature[] = [...OPEN, ...EMBARGO];

export function feature(id: string): Feature | null {
  return FEATURES.find((f) => f.id === id) ?? null;
}

// ── the embargo's switch: the lab only ──────────────────────────────────────
//
// Preferences ▸ Advanced ▸ «Functions under embargo» (lab build only). Read
// ONCE when the page starts, as «Experimental functions». A browser check of
// the lab build turns it on with `window.__EM_EMBARGO__ = true`.

function readEmbargo(): boolean {
  if ((globalThis as { __EM_EMBARGO__?: unknown }).__EM_EMBARGO__ === true) return true;
  try {
    return globalThis.localStorage?.getItem("emstudio.embargo") === "1";
  } catch {
    return false;
  }
}

/** the embargo's switch, as the page started (always false in the community) */
export const EMBARGO_ON: boolean = LAB ? readEmbargo() : false;

/** what the Preferences write (lab only); the page reads it at the next start */
export function setEmbargo(on: boolean): void {
  if (!LAB) return;
  try {
    if (on) localStorage.setItem("emstudio.embargo", "1");
    else localStorage.removeItem("emstudio.embargo");
  } catch { /* storage refused: stays as it is */ }
}

/** as stored now (it may differ from `EMBARGO_ON` until the reload) */
export function embargoStored(): boolean {
  return LAB ? readEmbargo() : false;
}

// ── is a function on? ───────────────────────────────────────────────────────

/** A function of the register is on: `public` always, `experimental` with
 *  «Experimental functions», `embargo` in the lab with its switch. An id this
 *  build does not know (an embargo function in the community) is off. */
export function featureOn(id: string): boolean {
  const f = feature(id);
  if (!f) return false;
  if (f.state === "public") return true;
  if (f.state === "experimental") return EXPERIMENTAL;
  return LAB && EMBARGO_ON;
}

/** The register as `em.app.features()` and the Python session see it: this
 *  build's entries, each with whether it is on. */
export function featuresWire(): Array<{ id: string; state: FeatureState; on: boolean }> {
  return FEATURES.map((f) => ({ id: f.id, state: f.state, on: featureOn(f.id) }));
}

/** The functions of a state in this build (Preferences lists them). */
export function featuresOf(state: FeatureState): Feature[] {
  return FEATURES.filter((f) => f.state === state);
}
