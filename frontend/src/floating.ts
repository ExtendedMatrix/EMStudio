/**
 * MICRO-SEG13 · THE FLOATING PANELS' ONE RULE (E.D., 21 Nov 2026: «vorrei poter
 * chiudere questi pannelli flottanti cliccando fuori, senza inseguire
 * obbligatoriamente la X in alto»).
 *
 * Every floating panel, popover and menu the app opens over its windows says so
 * here (`floating(el, { close, opener })`), and this module alone decides when it
 * goes — the thirty «a press outside closes it» copies the panels had (or did not
 * have: the Visibility of the Space, the filter) are gone:
 *
 *  · a press OUTSIDE closes it, and does nothing else: the press, its release,
 *    its click (and a double click, a right click) are swallowed — the first
 *    click only closes, as the menus of macOS and Blender. On the 3D scene or a
 *    canvas the same: the click outside closes, it does not select.
 *  · Esc closes the top one (and only that one: a submenu before its menu).
 *  · a press on the button that opened it closes it (a toggle), and does not
 *    open it again.
 *  · the focus goes back to that button (accessibility), when it is still there.
 *  · panels opened from a panel stack: a press inside a parent closes its
 *    children only; a press inside the top one is the panel's own.
 *  · WORK windows (`work: true`, a dialog where one writes) holding something
 *    not yet saved stay: a press outside does not close them (nor what is under
 *    them), Esc asks whether to discard (the asker is the app's dialog,
 *    `setDiscardAsker`). Empty — nothing typed yet — they go as a light panel.
 *
 * Neutral places: a press in the toast, or in a modal this module does not know,
 * leaves the panels as they are (an «are you sure?» asked from a panel must not
 * close that panel).
 *
 * The open panels are read lazily: a panel removed from the page or hidden
 * (`.hidden`, `hidden`) by another route is simply forgotten, so a panel's own
 * close function need not tell this module anything.
 */
import { isRelaying } from "./shell/detach";

export interface FloatingOptions {
  /** closes the panel (hides it, removes it, resets its state) */
  close(): void;
  /** the button that opened it: a press there closes it; the focus goes back to it.
   *  A function when the button is redrawn (a window's head is). */
  opener?: HTMLElement | null | (() => HTMLElement | null | undefined);
  /** a press on an element matching this counts as a press on the opener (a
   *  head redrawn while the panel is open has a new button) */
  openerSel?: string;
  /** a press on an element matching this counts as inside the panel (its own
   *  pieces living elsewhere in the page) */
  inside?: string;
  /** a work window: while it holds something not yet saved a press outside
   *  leaves it (and what is under it) open and Esc asks first; empty, it goes
   *  as a light panel does */
  work?: boolean;
  /** a work window holds something not yet saved; default: something was
   *  typed or changed in it (a trusted `input` / `change`) since it opened */
  dirty?(): boolean;
  /** a layer drawn INSIDE the panel (the add menu's submenu) goes first on Esc:
   *  answers true when it closed one, and the panel stays */
  esc?(): boolean;
  /** for a test, `data-floating` on the panel (default "1") */
  name?: string;
}

interface Entry extends FloatingOptions {
  el: HTMLElement;
}

const stack: Entry[] = [];
/** a work window's default «dirty»: a hand typed or changed something in it */
const touched = new WeakMap<HTMLElement, boolean>();
const watched = new WeakSet<HTMLElement>();
function watchTouch(el: HTMLElement): void {
  touched.set(el, false);
  if (watched.has(el)) return;
  watched.add(el);
  const mark = (e: Event): void => { if (e.isTrusted) touched.set(el, true); };
  el.addEventListener("input", mark, true);
  el.addEventListener("change", mark, true);
}
function isDirty(e: Entry): boolean {
  if (!e.work) return false;
  return e.dirty ? e.dirty() : !!touched.get(e.el);
}
let discardAsker: (() => Promise<boolean>) | null = null;
/** the press that closed a panel: its release, its click, its context menu go too */
let swallowing = false;
let swallowUntil = 0;
let lastSwallowedAt = -1e9;

/** the question «discard what you wrote?» — given by the app's dialog module */
export function setDiscardAsker(fn: () => Promise<boolean>): void {
  discardAsker = fn;
}

function shown(el: HTMLElement): boolean {
  return el.isConnected && !el.hidden && !el.classList.contains("hidden");
}

function prune(): void {
  for (let i = stack.length - 1; i >= 0; i--) if (!shown(stack[i].el)) stack.splice(i, 1);
}

/**
 * Says a floating panel is open. Calling it again for the same element brings it
 * to the top with the new options. Gives back the release (forget it without
 * closing it); a panel hidden or removed is forgotten anyway.
 */
export function floating(el: HTMLElement, o: FloatingOptions): () => void {
  const i = stack.findIndex((e) => e.el === el);
  if (i >= 0) stack.splice(i, 1);
  const entry: Entry = { ...o, el };
  stack.push(entry);
  if (o.work && !o.dirty) watchTouch(el);
  el.dataset.floating = o.name ?? (o.work ? "work" : "1");
  return () => {
    const j = stack.indexOf(entry);
    if (j >= 0) stack.splice(j, 1);
  };
}

/** the panels open now, bottom first (for a test and the report) */
export function floatingOpen(): HTMLElement[] {
  prune();
  return stack.map((e) => e.el);
}

function openerOf(e: Entry): HTMLElement | null {
  const o = typeof e.opener === "function" ? e.opener() : e.opener;
  return o && o.isConnected ? o : null;
}

function closest(t: Element | null, sel: string | undefined): boolean {
  return !!(sel && t && typeof t.closest === "function" && t.closest(sel));
}

function isInside(e: Entry, t: Element | null): boolean {
  return !!t && (e.el.contains(t) || closest(t, e.inside));
}

function isOpener(e: Entry, t: Element | null): boolean {
  if (!t) return false;
  const o = openerOf(e);
  return (!!o && o.contains(t)) || closest(t, e.openerSel);
}

function closeEntry(e: Entry, focusBack: boolean): void {
  const i = stack.indexOf(e);
  if (i >= 0) stack.splice(i, 1);
  const o = focusBack ? openerOf(e) : null;
  try { e.close(); } finally {
    if (o && o.isConnected) {
      try { o.focus({ preventScroll: true }); } catch { /* not focusable */ }
    }
  }
}

/** a press in a place that is nobody's outside: the toast, a modal the stack
 *  does not hold (a question asked from a panel), a mark of its own */
function neutral(t: Element | null): boolean {
  if (!t || typeof t.closest !== "function") return false;
  if (t.closest("#toast, [data-float-neutral]")) return true;
  const m = t.closest(".modal");
  return !!m && !related(m);
}

/** a modal the stack knows: one of its panels, inside one, or holding one */
function related(m: Element): boolean {
  return stack.some((e) => e.el === m || e.el.contains(m) || m.contains(e.el));
}

/** an unknown modal is open: its own Esc comes first */
function foreignModalOpen(doc: Document): boolean {
  for (const m of doc.querySelectorAll<HTMLElement>(".modal")) {
    if (!shown(m) || m.dataset.floating) continue;
    if (!related(m)) return true;
  }
  return false;
}

function swallow(e: Event): void {
  e.preventDefault();
  e.stopImmediatePropagation();
}

function onPress(e: PointerEvent | MouseEvent): void {
  swallowing = false;
  prune();
  if (!stack.length) return;
  const t = (e.composedPath?.()[0] ?? e.target) as Element | null;
  if (neutral(t)) return;
  // from the top down: what the press is not inside of goes, up to the panel it
  // is inside of, the button of one (that one goes too: a toggle), a work window
  const going: Entry[] = [];
  for (let i = stack.length - 1; i >= 0; i--) {
    const en = stack[i];
    if (isInside(en, t)) break;
    if (isOpener(en, t)) { if (!isDirty(en)) going.push(en); break; }
    if (isDirty(en)) break;
    going.push(en);
  }
  if (!going.length) return;
  // the focus goes back to the button of the lowest one closed
  going.forEach((en, k) => closeEntry(en, k === going.length - 1));
  swallow(e);
  swallowing = true;
  swallowUntil = performance.now() + 1500;
  lastSwallowedAt = performance.now();
}

function onFollow(e: Event): void {
  const now = performance.now();
  if (e.type === "dblclick" && now - lastSwallowedAt < 600) { swallow(e); return; }
  if (!swallowing) return;
  if (now > swallowUntil) { swallowing = false; return; }
  swallow(e);
  if (e.type === "click" || e.type === "auxclick") swallowing = false;
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape" || e.isComposing) return;
  prune();
  const top = stack[stack.length - 1];
  if (!top) return;
  const doc = (e.target as Node | null)?.ownerDocument ?? document;
  if (foreignModalOpen(doc) || (doc !== document && foreignModalOpen(document))) return;
  swallow(e);
  if (top.esc?.()) return;
  if (isDirty(top)) {
    const ask = discardAsker;
    if (!ask) return;
    void ask().then((yes) => { if (yes && stack.includes(top)) closeEntry(top, true); });
    return;
  }
  closeEntry(top, true);
}

const FOLLOW = ["mousedown", "pointerup", "mouseup", "click", "auxclick", "dblclick", "contextmenu"] as const;

/** The guard on one window (the main one, a detached one). Gives back the unwire. */
export function guardFloating(w: Window, relayed = false): () => void {
  const press = (e: Event): void => { if (!(relayed && isRelaying())) onPress(e as PointerEvent); };
  const follow = (e: Event): void => { if (!(relayed && isRelaying())) onFollow(e); };
  const key = (e: Event): void => { if (!(relayed && isRelaying())) onKey(e as KeyboardEvent); };
  w.addEventListener("pointerdown", press, true);
  for (const t of FOLLOW) w.addEventListener(t, follow, true);
  w.addEventListener("keydown", key, true);
  return () => {
    w.removeEventListener("pointerdown", press, true);
    for (const t of FOLLOW) w.removeEventListener(t, follow, true);
    w.removeEventListener("keydown", key, true);
  };
}

// the main window's guard, first of all the capture listeners (this module is
// imported before the app's): the relayed copy of a detached window's press is
// not heard twice — that window has a guard of its own
if (typeof window !== "undefined") guardFloating(window, true);
