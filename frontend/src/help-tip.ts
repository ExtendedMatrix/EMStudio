/**
 * MICRO-OUTLINER-EPOCHE-TOOLTIP p.3 · THE «?» READABLE (E.D., 13 Nov 2026).
 *
 * Until today a «?» said its text in the browser's own tooltip (late, small,
 * gone as the mouse left) and, clicked, in a toast at the bottom of the window
 * — far from the glyph, and gone before it was read. One component for the
 * whole app now:
 *
 *   · the text opens BESIDE the «?» (a popover anchored to it, kept inside the
 *     window), at a reading width (~40–60 characters a line);
 *   · it stays while the mouse is on the «?» or on the popover, and goes
 *     1.6 s after the mouse left both (never sooner than 1.5 s);
 *   · a CLICK on the «?» pins it open until a click elsewhere or Esc (a second
 *     click on the same «?» unpins and closes it); Enter / Space do the same
 *     from the keyboard, and the focus on a «?» opens it as the hover does.
 *
 * Delegated: one listener on the document for every «?» there is or will be —
 * `.win-help`, `.help-glyph`, `.geo-chip-help`, `.et-q`, or anything with
 * `data-help-tip`. The text is `data-help-tip`, else the element's `title`
 * (moved into `data-help-tip` the first time the pointer comes, so the
 * browser's tooltip does not open on top), else its `aria-label`. A leaf
 * module: no import.
 */
export const HELP_SELECTOR = ".win-help, .help-glyph, .geo-chip-help, .et-q, [data-help-tip]";
/** how long the popover stays after the mouse left the «?» and the popover */
export const HELP_LINGER_MS = 1600;
/** how long the mouse rests on a «?» before it opens (a pass over it does not) */
export const HELP_OPEN_MS = 180;

let pop: HTMLDivElement | null = null;
let anchor: HTMLElement | null = null;
let pinned = false;
let hideTimer: number | undefined;
let openTimer: number | undefined;

/** the text of a «?» (its title moved aside, so the native tooltip stays shut) */
export function helpTextOf(el: HTMLElement): string {
  if (el.title) {
    el.dataset.helpTip = el.title;
    if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", el.title);
    el.removeAttribute("title");
  }
  return el.dataset.helpTip || el.getAttribute("aria-label") || "";
}

function place(p: HTMLElement, a: HTMLElement): void {
  const r = a.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  p.style.left = "0px";
  p.style.top = "0px";
  const w = p.offsetWidth, h = p.offsetHeight;
  // beside the glyph: to its right, else to its left; level with it, kept on screen
  let x = r.right + 8;
  if (x + w > vw - 6) x = r.left - 8 - w;
  if (x < 6) x = Math.max(6, Math.min(vw - w - 6, r.left));
  let y = r.top + r.height / 2 - 14;
  // no room beside it (a «?» in a narrow column): under it
  if (x < r.right && x + w > r.left) y = r.bottom + 6;
  if (y + h > vh - 6) y = Math.max(6, vh - h - 6);
  if (y < 6) y = 6;
  p.style.left = `${Math.round(x)}px`;
  p.style.top = `${Math.round(y)}px`;
  p.dataset.side = x >= r.right ? "right" : x + w <= r.left ? "left" : "below";
}

export function closeHelpTip(): void {
  window.clearTimeout(hideTimer);
  window.clearTimeout(openTimer);
  anchor?.removeAttribute("aria-expanded");
  anchor?.classList.remove("help-tip-on", "help-tip-pinned");
  pop?.remove();
  pop = null;
  anchor = null;
  pinned = false;
}

export function openHelpTip(a: HTMLElement, pin = false): void {
  window.clearTimeout(hideTimer);
  window.clearTimeout(openTimer);
  const text = helpTextOf(a);
  if (!text) return;
  if (anchor !== a) {
    closeHelpTip();
    pop = document.createElement("div");
    pop.className = "help-tip";
    pop.setAttribute("role", "tooltip");
    pop.id = "help-tip";
    pop.dataset.helpTipPop = "1";
    pop.textContent = text;
    pop.addEventListener("pointerenter", () => window.clearTimeout(hideTimer));
    pop.addEventListener("pointerleave", () => { if (!pinned) later(); });
    // a click inside the popover (to select its words) is not a click elsewhere
    pop.addEventListener("pointerdown", (e) => e.stopPropagation());
    document.body.appendChild(pop);
    anchor = a;
    a.setAttribute("aria-expanded", "true");
    a.setAttribute("aria-describedby", "help-tip");
    a.classList.add("help-tip-on");
    place(pop, a);
  }
  if (pin) { pinned = true; a.classList.add("help-tip-pinned"); pop?.classList.add("pinned"); }
}

function later(): void {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => { if (!pinned) closeHelpTip(); }, HELP_LINGER_MS);
}

const glyphOf = (t: EventTarget | null): HTMLElement | null =>
  (t instanceof Element ? t.closest<HTMLElement>(HELP_SELECTOR) : null);

let installed = false;
/** Install the one behaviour of every «?» (once, at startup). */
export function installHelpTips(): void {
  if (installed) return;
  installed = true;
  document.addEventListener("pointerover", (e) => {
    const g = glyphOf(e.target);
    if (!g) return;
    helpTextOf(g);
    if (g === anchor) { window.clearTimeout(hideTimer); return; }
    if (pinned) return;
    window.clearTimeout(openTimer);
    openTimer = window.setTimeout(() => openHelpTip(g), anchor ? 0 : HELP_OPEN_MS);
  }, true);
  document.addEventListener("pointerout", (e) => {
    const g = glyphOf(e.target);
    if (!g) return;
    const to = e.relatedTarget as Node | null;
    if (to && (g.contains(to) || pop?.contains(to))) return;
    window.clearTimeout(openTimer);
    if (g === anchor && !pinned) later();
  }, true);
  // the click is the «?»'s, before any handler of the panel under it (capture)
  document.addEventListener("click", (e) => {
    const g = glyphOf(e.target);
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (g === anchor && pinned) { closeHelpTip(); return; }
    openHelpTip(g, true);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop) { closeHelpTip(); e.stopPropagation(); return; }
    if (e.key !== "Enter" && e.key !== " ") return;
    const g = glyphOf(document.activeElement);
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    if (g === anchor && pinned) closeHelpTip(); else openHelpTip(g, true);
  }, true);
  document.addEventListener("focusin", (e) => {
    const g = glyphOf(e.target);
    if (g && !pinned) openHelpTip(g);
  });
  document.addEventListener("focusout", (e) => {
    const g = glyphOf(e.target);
    if (g && g === anchor && !pinned) later();
  });
  // a click elsewhere unpins and closes
  document.addEventListener("pointerdown", (e) => {
    if (!pop) return;
    const g = glyphOf(e.target);
    if (g === anchor) return;
    if (pop.contains(e.target as Node)) return;
    closeHelpTip();
  }, true);
  // the glyph scrolled away or its panel redrawn: the popover goes with it
  document.addEventListener("scroll", () => { if (anchor && !anchor.isConnected) closeHelpTip(); else if (pop && anchor) place(pop, anchor); }, true);
  window.addEventListener("resize", () => { if (pop && anchor) place(pop, anchor); });
  // a redrawn panel takes its «?» away: no popover hanging on nothing
  window.setInterval(() => { if (anchor && !anchor.isConnected) closeHelpTip(); }, 500);
}
