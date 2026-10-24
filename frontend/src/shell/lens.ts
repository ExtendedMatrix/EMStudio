/**
 * MICRO-OVERLAY-PER-FINESTRA · what a window shows of the one document: its
 * LENS (E.D., 24 Oct 2026: «each window with the Matrix has its own overlays»).
 *
 * Two Matrix windows — two areas, or two system windows — can show the same
 * document with different overlays, a different detail filter, one of them in
 * monochrome. The data stays one: only the scene each window draws changes.
 *
 * A lens is three facts kept in the WINDOW's state (`win.state`, beside its
 * mode and its sheet), and therefore:
 *  · copied with the window — a split, «Open in a new window», Shift + corner
 *    (`splitWindow`, `cloneState`) give the twin the lens it was born from;
 *  · carried back by «⇤ Back» (the twin's state is the detached one's);
 *  · remembered with the window, in the local preferences (the arrangement,
 *    `emstudio.detached.v1`) — never in the em.json, never in the room.
 *
 *   overlays   per overlay view (matrix, graph, dtc, multigraph, soloing, space)
 *   leaves     the Matrix's detail filter (the leaves shown) — the Matrix only:
 *              the Graph has ONE force simulation, its filter stays the view's
 *   mono       monochrome — the Matrix's and the DTC's option, as before
 *
 * A window that never changed one of them has none of its own and shows the
 * person's choice for the view (`overlays.ts`, `emstudio.detailLeaves`), as
 * before. The first change in ANY window pins the others to what they were
 * showing (`pinned`), so a change is that window's alone; the person's choice
 * follows the last change, and is what a window born from nothing starts with.
 *
 * Pure: no DOM, no store — checked in node (scripts/check-lens.mjs).
 */
import { cleanOverlays, SPACE_REV, type OverlayState, type OverlayView } from "../overlays";

/** the keys under `win.state["current.<key>"]` (`winCurrent`) */
export const lensOverlayKey = (v: OverlayView): string => `lens.ov.${v}`;
export const lensLeavesKey = (v: string): string => `lens.leaves.${v}`;
export const LENS_MONO_KEY = "lens.mono";
/** the views whose detail filter is a window's own (see above) */
export const OWN_LEAVES_VIEWS: ReadonlySet<string> = new Set(["matrix"]);

type State = Record<string, unknown> | undefined;
const cur = (st: State, k: string): unknown => st?.[`current.${k}`];

/** a window's own overlays for a view, or null (the person's) — the object
 *  stored is never mutated (a split's state is a shallow copy: the two share it) */
const ovMemo = new WeakMap<object, OverlayState>();
export function ownOverlays(st: State, v: OverlayView): OverlayState | null {
  const raw = cur(st, lensOverlayKey(v));
  if (!raw || typeof raw !== "object") return null;
  let o = ovMemo.get(raw);
  if (!o) {
    o = cleanOverlays(raw, v);
    ovMemo.set(raw, o);
  }
  return o;
}

/** what is stored for a window's overlays: a fresh plain object (the Space's
 *  with the revision of its keys, as `saveOverlays` writes it) */
export function storedOverlays(o: OverlayState, v: OverlayView): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(o)) as Record<string, unknown>;
  if (v === "space") out.rev = SPACE_REV;
  return out;
}

const leafMemo = new WeakMap<object, Set<string>>();
/** a window's own detail filter for a view, or null (the view's) */
export function ownLeaves(st: State, v: string): Set<string> | null {
  if (!OWN_LEAVES_VIEWS.has(v)) return null;
  const raw = cur(st, lensLeavesKey(v));
  if (!Array.isArray(raw)) return null;
  let s = leafMemo.get(raw);
  if (!s) {
    s = new Set(raw.filter((x): x is string => typeof x === "string"));
    leafMemo.set(raw, s);
  }
  return s;
}
export const storedLeaves = (s: Iterable<string>): string[] => [...s].sort();

/** monochrome: the window's, else off */
export const ownMono = (st: State): boolean => cur(st, LENS_MONO_KEY) === true;

/** one key per set of leaves (equal sets share a scene) */
export const leavesKey = (s: Iterable<string>): string => [...s].sort().join(",");

/**
 * The windows to pin before `changing` takes a value of its own for `slot`:
 * every other one that has none (it was showing the person's choice, and the
 * person's choice is about to follow the change).
 */
export function pinned<W extends { id: string; state: Record<string, unknown> }>(
  wins: readonly W[], changing: string, slot: string, applies: (w: W) => boolean,
): W[] {
  return wins.filter((w) => w.id !== changing && applies(w) && cur(w.state, slot) == null);
}
