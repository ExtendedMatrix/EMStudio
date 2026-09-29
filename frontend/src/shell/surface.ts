/**
 * THE CONTRACT · one window type, ONE way of being drawn.
 *
 * Written before anything was converted, and that order is the point.
 *
 * EMStudio used to draw a window two ways: the singleton surfaces inside
 * `#canvas-wrap` for the window that had the focus, and `buildSecondarySurface`
 * for every other one. Parity between the two paths was an invariant kept BY
 * HAND, type by type — measured on 2 September (`check-focus-parity.mjs`),
 * levelled on 9 August for the graph, the table and the panels, and every time
 * the comment left behind tells the same symptom: the tab strip re-measures, the
 * head loses the sheet name, the story starts 28 px higher.
 *
 * The types that still moved were the ones nobody had levelled. The defect was
 * never in a type: it was in there being two paths. So this interface is not a
 * tidy-up of the two — it is the statement that there is one, and the place a
 * ninth window type is forced to be born into.
 *
 * THE LAW, in one line:
 *
 *   > the focus decides where the events go, never what is drawn.
 *
 * which is Blender's (`ScrArea` always draws, `wmWindow->eventstate` only
 * routes), and which is why `setFocused` is allowed so little: it may turn
 * input handling on and off and it may draw the focus ring. It may NOT change
 * what is visible, nor how it is laid out. `check-surfaces.mjs` walks the AST of
 * every `setFocused` in `shell/` and fails on a geometry write, a `render*`
 * call, or an `appendChild` — so the rule is a thing the compiler can see, not a
 * thing a reviewer has to remember.
 */
import type { Win, WindowType } from "../workspace";
import { heldBy } from "./hold";

/** What a surface may legitimately declare about itself. Read by the shell, not
 *  deduced from an `if` somewhere in `main.ts` — the annotator is single-instance
 *  for a real reason (tracing needs `#annotator-image` and the module's draft
 *  state) and a reason that is written down can be argued with. */
export interface SurfaceCapabilities {
  /** false → at most one live mount; the other areas of this type get a note
   *  saying so, instead of a second half-working copy. */
  multiInstance: boolean;
}

export interface Surface {
  /** Put this window's content into `host`. Called ONCE per mount. */
  mount(host: HTMLElement, win: Win): void;
  /** The document changed — repaint. Never called by a focus change. */
  refresh(): void;
  /** ONLY input handling and the focus ring. Nothing that moves a pixel. */
  setFocused(on: boolean): void;
  /** The area is going away: give back whatever was registered elsewhere. */
  destroy(): void;
  /**
   * The SELECTION moved — optional, and separate from `refresh` on purpose.
   *
   * The outliner answers this by moving a highlight over rows it has already
   * built; answering it with `refresh()` would rebuild a list of every node in
   * the graph on every click. A surface that does not care simply omits it, and
   * the fan-out below then costs nothing for that type.
   */
  select?(id: string | null): void;
}

export interface SurfaceType {
  id: WindowType;
  capabilities?: SurfaceCapabilities;
  create(win: Win): Surface;
}

/** The types that have crossed over, by id. A type that is NOT here is still
 *  drawn the old way — and the shell says which, out loud, rather than leaving
 *  the reader to infer the boundary from a fall-through. */
const registry = new Map<WindowType, SurfaceType>();

export function registerSurfaceType(type: SurfaceType): void {
  registry.set(type.id, type);
}

export function surfaceTypeOf(type: WindowType): SurfaceType | null {
  return registry.get(type) ?? null;
}

/** Every converted type, for the guards and for the report. */
export function convertedTypes(): WindowType[] {
  return [...registry.keys()];
}

/**
 * The live mounts, one per window.
 *
 * Owned here rather than read back off the DOM: a mount holds registrations in
 * other modules (an EM-Data host, a Storage host) and those have to be given
 * back when the window closes, which the DOM cannot tell us.
 */
const mounted = new Map<string, { win: Win; surface: Surface; host: HTMLElement }>();

export function mountSurface(win: Win, host: HTMLElement): Surface | null {
  const type = surfaceTypeOf(win.type);
  if (!type) return null;
  const live = mounted.get(win.id);
  if (live && live.host === host && live.win.type === win.type) return live.surface;
  if (live) {
    live.surface.destroy();
    mounted.delete(win.id);
  }
  const surface = type.create(win);
  surface.mount(host, win);
  mounted.set(win.id, { win, surface, host });
  return surface;
}

export function unmountSurface(winId: string): void {
  const live = mounted.get(winId);
  if (!live) return;
  live.surface.destroy();
  mounted.delete(winId);
}

export function surfaceOf(winId: string): Surface | null {
  return mounted.get(winId)?.surface ?? null;
}

/** Repaint every live mount, or every live mount of one type. The document
 *  changed; who has the focus has nothing to do with it. */
export function refreshSurfaces(type?: WindowType, except: WindowType[] = []): void {
  for (const { win, surface, host } of mounted.values()) {
    if (type && win.type !== type) continue;
    if (except.includes(win.type)) continue;
    if (!host.isConnected) continue;
    // AUDIT N0 · a document change does not rebuild the window being written in
    if (heldBy(host, () => surface.refresh())) continue;
    surface.refresh();
  }
}

/**
 * The live surfaces of one type — THE fan-out, and the reason there is no second
 * bookkeeping anywhere.
 *
 * Before the panels were converted, `refreshInspector()` and
 * `nodeList.setSelected()` meant "the one panel", and the code that made that
 * true was a set of moves between a hidden parking element and whichever area
 * had claimed it. Now they mean "every live one", and the list of live ones is
 * this map — the same map that holds every other surface. If a caller finds
 * itself wanting a register of its own, the answer is that this one is in the
 * wrong place, not that a second one is needed.
 *
 * A mount whose host has left the document is skipped rather than removed: it is
 * `destroy()` that unregisters, and inferring death from `isConnected` is the
 * mistake `removeEmDataHost` was written to undo.
 */
export function surfacesOfType(type?: WindowType): Surface[] {
  const out: Surface[] = [];
  for (const { win, surface, host } of mounted.values()) {
    if (type && win.type !== type) continue;
    if (!host.isConnected) continue;
    out.push(surface);
  }
  return out;
}

/** Tell every live surface of a type that the selection moved. */
export function selectInSurfaces(type: WindowType, id: string | null): void {
  for (const surface of surfacesOfType(type)) surface.select?.(id);
}

/** Window ids with a live mount — the shell reconciles against this. */
export function mountedWindowIds(): string[] {
  return [...mounted.keys()];
}
