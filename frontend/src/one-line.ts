/**
 * MICRO-PROVA-DEV47 p.6 · a window's header on ONE line, as Blender's: it never
 * wraps; what does not fit scrolls sideways — with the wheel (its vertical turn
 * moves the row) or with two fingers — and a fade at the edge says there is
 * more. E.D., 17 Oct 2026: two 3D windows side by side, «Proxies» went to a
 * second line of the Space's bar (measured: 4 lines at 330 px, 1100 px of app).
 */
export function oneLine(el: HTMLElement): void {
  el.classList.add("one-line");
  const update = () => {
    // the fades in the bar's own colour (a header is not always the panel's)
    if (!el.style.getPropertyValue("--ol-bg")) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") el.style.setProperty("--ol-bg", bg);
    }
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle("ol-left", max > 1 && el.scrollLeft > 1);
    el.classList.toggle("ol-right", max > 1 && el.scrollLeft < max - 1);
  };
  el.addEventListener("wheel", (e: WheelEvent) => {
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    e.preventDefault();
    el.scrollLeft += d * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1);
    update();
  }, { passive: false });
  el.addEventListener("scroll", update, { passive: true });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(update).observe(el);
  if (typeof MutationObserver !== "undefined") new MutationObserver(update).observe(el, { childList: true, subtree: true, characterData: true });
  update();
}
