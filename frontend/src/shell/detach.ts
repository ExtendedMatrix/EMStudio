/**
 * MICRO-FINESTRE-MULTIPLE · a window taken out into a system window of its own
 * (E.D., 24 Oct 2026: Blender's Shift + drag from an area's corner).
 *
 * ONE DOCUMENT, MORE VIEWS — and the choice that makes it true by construction.
 *
 * The two candidates, measured before choosing (REFERTO, Parte 1):
 *
 *  · A CHANNEL BETWEEN WINDOWS: every system window loads the app, holds a
 *    copy of the em.json and the two copies are kept equal by messages (Tauri
 *    events, a BroadcastChannel). Each operation, each selection, each undo
 *    crosses a process boundary and is applied twice; the undo stack, the
 *    dirty flag and the save are two things to keep in step. A copy is what
 *    the MICRO forbids, and the channel is where it would drift.
 *  · ONE PAGE, MORE DOCUMENTS: the main page opens the second system window
 *    with `window.open` — an `about:blank` of the SAME origin, which the page
 *    can script — and mounts the window's surface into it with the very
 *    constructor that mounts it in an area (`shell/types.ts`). There is one
 *    JavaScript realm, one `DocumentStore`, one selection, one undo stack, one
 *    save: the detached window is a piece of DOM the main page draws into.
 *    Latency between the two is a function call (measured in the REFERTO).
 *
 * The second is the one here. Tauri 2 gives it on the desktop
 * (`WebviewWindowBuilder::on_new_window` answers `window.open` with a real
 * system window that keeps its opener: main.rs), the browser gives it on the
 * web. The cost, stated: what a surface binds to the GLOBAL `document` or
 * `window` (a drag's `pointermove`, a shortcut's `keydown`) does not hear the
 * other document — so the input of a detached window is RELAYED to the main
 * one (`wireRelay`), and the menus a gesture there opens are carried into it
 * (`main.ts`, `portalInto`).
 *
 * This module is the part that needs no `main.ts`: where it was (a local
 * preference per document, never the em.json), how to open it, how its
 * document gets the app's look, and the relay. `check-detach.mjs` runs it.
 */
import type { WindowType } from "../workspace";

/** Where a detached window was, and what it showed — enough to open it again
 *  when the document is opened again. Screen coordinates are the desktop's
 *  (`screenX`/`screenY`): a window on the second screen keeps its screen. */
export interface DetachedRecord {
  type: WindowType;
  state: Record<string, unknown>;
  x: number;
  y: number;
  w: number;
  h: number;
  /** a graph window's camera in its mode, so it opens where it was looking */
  camera?: { mode: string; x: number; y: number; scale: number } | null;
}

/** localStorage: `{ <document key>: DetachedRecord[] }`. */
export const DETACH_KEY = "emstudio.detached.v1";

type Kv = Pick<Storage, "getItem" | "setItem">;

function readAll(kv: Kv): Record<string, DetachedRecord[]> {
  try {
    const raw = kv.getItem(DETACH_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

const isRecord = (r: unknown): r is DetachedRecord => {
  const o = r as DetachedRecord;
  return !!o && typeof o.type === "string" && typeof o.state === "object" && o.state !== null
    && [o.x, o.y, o.w, o.h].every((n) => typeof n === "number" && Number.isFinite(n));
};

/** The detached windows a document had when it was last closed. */
export function recordsFor(project: string, kv: Kv): DetachedRecord[] {
  const list = readAll(kv)[project];
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

/** Remember them; none → the document's entry goes. */
export function saveRecords(project: string, recs: DetachedRecord[], kv: Kv): void {
  const all = readAll(kv);
  if (recs.length) all[project] = recs;
  else delete all[project];
  try {
    kv.setItem(DETACH_KEY, JSON.stringify(all));
  } catch {
    /* storage disabled: the windows are simply not reopened */
  }
}

/** A COPY of a window's state for its twin: the same view, filters, overlays,
 *  sheet — and not the role of a service Viewer (`splitWindow` drops it too). */
export function cloneState(state: Record<string, unknown>): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(state ?? {})) as Record<string, unknown>;
  delete out["current.viewer.role"];
  return out;
}

/** The size a detached window opens at, by type: a canvas wants room, a
 *  panel is a column. */
export function defaultSize(type: WindowType): { w: number; h: number } {
  if (type === "graph" || type === "scene") return { w: 960, h: 680 };
  if (type === "table" || type === "shelf" || type === "storage") return { w: 960, h: 560 };
  if (type === "inspector" || type === "outliner" || type === "emtree" || type === "study")
    return { w: 400, h: 680 };
  return { w: 720, h: 560 };
}

/** NEAR THE CURSOR: the new window's top-left a little up-left of the release
 *  point, so the hand that let go is over its bar. */
export function placeNear(screenX: number, screenY: number,
                          size: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  return { x: Math.round(screenX - 60), y: Math.round(screenY - 16), w: size.w, h: size.h };
}

/** The `window.open` features of a rectangle. `popup` asks for a window
 *  (not a tab) in the browser; the desktop reads position and size. */
export function popupFeatures(r: { x: number; y: number; w: number; h: number }): string {
  const n = (v: number) => Math.round(v);
  return `popup=yes,left=${n(r.x)},top=${n(r.y)},width=${Math.max(240, n(r.w))},height=${Math.max(180, n(r.h))}`;
}

/** Can this page open a system window it can draw into? Not from inside a
 *  frame (an embed's popup belongs to the host page), and not without
 *  `window.open`. The answer's `why` is the tooltip of the disabled gesture. */
export function detachSupport(w: Window): { ok: true } | { ok: false; why: "frame" | "api" } {
  if (typeof w.open !== "function") return { ok: false, why: "api" };
  try {
    if (w.top !== w) return { ok: false, why: "frame" };
  } catch {
    return { ok: false, why: "frame" };
  }
  return { ok: true };
}

/** The app's look in the new document: every stylesheet of the main page (the
 *  built app inlines them, the dev server injects them as `<style>`), and the
 *  classes and attributes of `<html>` and `<body>` the theme lives on — kept
 *  in step while the window is open. Returns the disconnect. */
export function mirrorLook(from: Document, to: Document): () => void {
  for (const n of from.head.querySelectorAll('style, link[rel="stylesheet"]'))
    to.head.appendChild(to.importNode(n, true));
  const copyAttrs = (a: Element, b: Element): void => {
    for (const at of [...b.attributes]) if (at.name !== "id" && !a.hasAttribute(at.name)) b.removeAttribute(at.name);
    for (const at of [...a.attributes]) if (at.name !== "id") b.setAttribute(at.name, at.value);
  };
  const sync = (): void => {
    copyAttrs(from.documentElement, to.documentElement);
    copyAttrs(from.body, to.body);
    // the main page's gesture marks are its own (a drag there is not one here)
    to.body.classList.remove("gesturing", "gesturing-resize");
    to.body.classList.add("em-detached");
  };
  sync();
  const MO = (from.defaultView as (Window & typeof globalThis) | null)?.MutationObserver;
  if (!MO) return () => {};
  const mo = new MO(sync);
  mo.observe(from.documentElement, { attributes: true });
  mo.observe(from.body, { attributes: true });
  return () => mo.disconnect();
}

let relaying = 0;
/** True while an event of a detached window is being re-dispatched on the main
 *  document: a listener that reads WHERE a press happened (`notePress`) must
 *  not take the relay's target (the main document) for the place. */
export function isRelaying(): boolean {
  return relaying > 0;
}

export interface RelayHooks {
  /** a field one writes in: its keys are its own, never a shortcut */
  isWriting(el: Element | null): boolean;
  /** inside something carried from the main page into this window (a menu, a
   *  panel): a press there is not a press «outside» the main page's menus */
  ported(el: Element | null): boolean;
  /** the press itself, with its real target (which window, which part) */
  onPress(e: Event): void;
}

/**
 * THE RELAY · what the main page listens for on its own `document` and
 * `window`, heard from a detached window too.
 *
 *  · keys (`keydown`, `keyup`), after the window's own elements had them and
 *    unless they were taken (`defaultPrevented`) or typed in a field: ⌘Z, ⌘S,
 *    Delete, Space-to-pan reach the one handler there is; a `preventDefault`
 *    there is given back to the original;
 *  · the moves and releases of a drag (`pointermove`/`pointerup`/
 *    `pointercancel`, the mouse twins): a drag begun in this window whose
 *    handler listens on the main window still follows the hand;
 *  · a press (`pointerdown`), relayed FIRST (capture), as the main page's
 *    capture listeners would have heard it first: the menus «close on a press
 *    outside» close — unless the press is inside a ported menu.
 *
 * The relayed events are the MAIN realm's (`new main.KeyboardEvent`): a
 * listener there compares with its own constructors. Returns the unwire.
 */
export function wireRelay(pop: Window, main: Document, hooks: RelayHooks): () => void {
  const mainWin = main.defaultView as (Window & typeof globalThis) | null;
  if (!mainWin) return () => {};
  const offs: Array<() => void> = [];
  const on = <K extends keyof WindowEventMap>(t: K, fn: (e: WindowEventMap[K]) => void, capture = false): void => {
    pop.addEventListener(t, fn as EventListener, capture);
    offs.push(() => pop.removeEventListener(t, fn as EventListener, capture));
  };
  const dispatch = (e: Event, make: () => Event, back = true): void => {
    const copy = make();
    relaying++;
    try {
      main.dispatchEvent(copy);
    } finally {
      relaying--;
    }
    if (back && copy.defaultPrevented && e.cancelable) e.preventDefault();
  };
  const keyInit = (e: KeyboardEvent): KeyboardEventInit => ({
    key: e.key, code: e.code, location: e.location, repeat: e.repeat,
    ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
    bubbles: true, cancelable: true,
  });
  const ptrInit = (e: PointerEvent | MouseEvent): PointerEventInit => ({
    clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
    button: e.button, buttons: e.buttons,
    ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
    pointerId: (e as PointerEvent).pointerId ?? 1,
    pointerType: (e as PointerEvent).pointerType ?? "mouse",
    bubbles: true, cancelable: true,
  });
  for (const type of ["keydown", "keyup"] as const) {
    on(type, (e) => {
      if (e.defaultPrevented) return;
      if (hooks.isWriting(e.target as Element | null)) return;
      dispatch(e, () => new mainWin.KeyboardEvent(type, keyInit(e)));
    });
  }
  for (const type of ["pointermove", "pointerup", "pointercancel"] as const)
    on(type, (e) => dispatch(e, () => new mainWin.PointerEvent(type, ptrInit(e))));
  for (const type of ["mousemove", "mouseup"] as const)
    on(type, (e) => dispatch(e, () => new mainWin.MouseEvent(type, ptrInit(e))));
  on("pointerdown", (e) => {
    hooks.onPress(e);
    if (hooks.ported(e.target as Element | null)) return;
    dispatch(e, () => new mainWin.PointerEvent("pointerdown", ptrInit(e)), false);
  }, true);
  on("keydown", (e) => hooks.onPress(e), true);
  return () => offs.forEach((f) => f());
}

/**
 * `instanceof` ACROSS THE TWO DOCUMENTS. A node the detached document parsed
 * (`innerHTML` on an element that lives there), and an event it fired, carry
 * the constructors of ITS realm: `el instanceof HTMLInputElement` asked in the
 * main page says false of an input that is one (measured in the REFERTO). The
 * main page asks that question in hundreds of places — a key in a field is
 * not a shortcut, a target is an element. So the main realm's DOM and event
 * constructors answer for the other realms too: `Symbol.hasInstance` asks the
 * native check first, and only when it says no, the same-named constructor of
 * each open detached window. With none open it costs one loop over nothing.
 */
export function bridgeRealms(main: Window, others: () => Iterable<Window>): number {
  const g = main as unknown as Record<string, unknown>;
  const native = Function.prototype[Symbol.hasInstance];
  const names = Object.getOwnPropertyNames(main).filter((n) =>
    /^(Node|Element|Text|Comment|CharacterData|DocumentFragment|Document|HTML\w*Element|SVG\w*Element|\w*Event)$/.test(n));
  let n = 0;
  for (const name of names) {
    const C = g[name];
    if (typeof C !== "function" || !(C as { prototype?: unknown }).prototype) continue;
    try {
      Object.defineProperty(C, Symbol.hasInstance, {
        configurable: true,
        value(this: unknown, x: unknown): boolean {
          if (native.call(this, x)) return true;
          if (this !== C || x === null || (typeof x !== "object" && typeof x !== "function")) return false;
          for (const w of others()) {
            try {
              const D = (w as unknown as Record<string, unknown>)[name];
              if (typeof D === "function" && D !== C && native.call(D, x)) return true;
            } catch { /* a window closing */ }
          }
          return false;
        },
      });
      n++;
    } catch { /* not redefinable here */ }
  }
  return n;
}
