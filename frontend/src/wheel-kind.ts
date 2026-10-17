/**
 * G5 · a wheel event: a trackpad's two-finger scroll, or a mouse wheel? One
 * rule, read by the graph (`main.ts`: a trackpad pans, a wheel zooms at the
 * cursor) and since MICRO-SPAZIO-3D by the Space (`scene3d.ts`: a trackpad
 * orbits, Shift + two fingers pans, the wheel zooms toward the cursor).
 *
 * A wheel in lines or pages is a mouse; in pixels, a horizontal component, a
 * fractional or small delta, or Chrome's legacy `wheelDeltaY` at −3 × deltaY
 * are a trackpad's. Measured in Chrome and WebKit on macOS; a mouse with
 * free-spinning smooth scroll can read as a trackpad — the gentler of the two
 * mistakes. A gesture keeps its kind until it stops for 400 ms. A pinch comes
 * as a ctrl-wheel (Chrome, Firefox) or as gesture events (WebKit): the caller
 * tests `ctrlKey` first.
 */
export interface WheelLike {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  wheelDeltaY?: number;
}

/** A classifier with its own memory (one per surface that listens). */
export function trackpadClassifier(now: () => number = () => performance.now()): (e: WheelLike) => boolean {
  let until = 0;
  return (e) => {
    const t = now();
    if (e.deltaMode !== 0) return false;
    const legacy = e.wheelDeltaY;
    const fine = e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50 ||
      (typeof legacy === "number" && legacy !== 0 && legacy === -3 * e.deltaY);
    if (fine) until = t + 400;
    return fine || t < until;
  };
}

/** PARTE 0b (E.D. 17 Oct 2026) · where the FINGERS went, from a trackpad's
 *  wheel. macOS's natural scrolling (its default, and E.D.'s) inverts the
 *  deltas: fingers to the right give a NEGATIVE deltaX, the content following
 *  them. A drag of the pointer is never inverted, so a two-finger gesture that
 *  must do what the drag does (the orbit, the pan) reads the fingers, not the
 *  deltas. WebKit says whether the deltas were inverted
 *  (`webkitDirectionInvertedFromDevice`: Safari, the desktop's WKWebView);
 *  Chromium does not, and macOS's default is assumed. Blender does the same on
 *  macOS (its «Natural Trackpad Direction», on by default). */
export function fingersOf(e: WheelLike & { webkitDirectionInvertedFromDevice?: boolean }): [number, number] {
  const inverted = typeof e.webkitDirectionInvertedFromDevice === "boolean" ? e.webkitDirectionInvertedFromDevice : true;
  return inverted ? [-e.deltaX, -e.deltaY] : [e.deltaX, e.deltaY];
}
