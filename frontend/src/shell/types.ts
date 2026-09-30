/**
 * THE SIX, CONVERTED · one constructor per window type, focused or not.
 *
 * Each of these was two pieces of code an hour ago: a singleton inside
 * `#canvas-wrap` that only the focused window could use, and a branch of
 * `buildSecondarySurface()` for every other area. Here there is one, and the
 * window that has the focus gets exactly the same object as the window that does
 * not.
 *
 * WHAT `setFocused` DOES HERE, and it is a finding rather than a shortcut: for
 * these six types it sets a hook class and nothing else — because the
 * interactive chrome had ALREADY been moved into the window header on 9 August
 * (HDR2), and the header is built by one builder that every area calls. So by
 * the time the two paths were merged there was nothing left that only the
 * focused mount could do. The class carries no box metric, and
 * `check-surfaces.mjs` asserts that by walking this file's AST.
 *
 * The renderers are NOT here. They live in `main.ts` next to the state they
 * read, and arrive through `SurfaceDeps` — so this file can be parsed, and its
 * `setFocused` bodies read, without dragging 18.000 lines behind them.
 */
import type { Win } from "../workspace";
import type { Surface, SurfaceType } from "./surface";
import { registerSurfaceType } from "./surface";
// …and re-exported here, so a checker that bundles THIS file can ask the
// registry what is in it without a second entry point.
export { convertedTypes, surfaceTypeOf, mountSurface, unmountSurface } from "./surface";
import { paintSurface, surfacePlace } from "../surface-scroll";
import { t } from "../i18n";

/** Just what this module needs of an EM-Data mount (`emdata.ts` owns the type). */
export interface TableMount {
  body: HTMLElement;
  readonly count: HTMLElement | null;
  /** STRUTTURA · the window this mount belongs to: its sheet, its row/card
   *  choice and its filters are PER WINDOW (two tables, two questions) */
  win?: Win;
  enabled: () => boolean;
  place?: { recall: () => number; remember: (at: number) => void };
}

/** …and of a Storage mount. `main.ts` holds the listing; this holds the boxes. */
export interface StorageMount {
  win: Win;
  body: HTMLElement;
  crumb: HTMLElement | null;
  up: HTMLButtonElement | null;
  enabled: () => boolean;
}

/**
 * One mounted PANEL — the outliner, the multigraph, the inspector, the log.
 *
 * `main.ts` builds it, because that is where the renderers and the state they
 * read live; `shell/` only knows that a panel can be repainted, can be told the
 * selection moved, and can be taken down. The four renderers already took their
 * host as the first argument before any of this — `renderEMTree(host, …)`,
 * `buildNodeList(root, …)`, `renderInspector(root, …)`, `renderLogPanel(container, …)`
 * — so nothing here draws anything, and nothing new was written to draw it.
 */
export interface PanelMount {
  refresh(): void;
  /** the outliner moves a highlight; the others do not care */
  select?(id: string | null): void;
  destroy?(): void;
}

export interface SurfaceDeps {
  addEmDataHost(host: TableMount): void;
  removeEmDataHost(host: TableMount): void;
  renderEmData(): void;
  addStorageHost(host: StorageMount): void;
  removeStorageHost(host: StorageMount): void;
  renderStorage(): void;
  renderShelfInto(win: Win, body: HTMLElement, count: HTMLElement | null): void;
  renderViewerInto(win: Win, stage: HTMLElement, caption: HTMLElement,
                   bar: HTMLElement): void;
  renderDocViewInto(win: Win, list: HTMLElement, detail: HTMLElement): void;
  reflectDocWidth(surface: HTMLElement): void;
  renderStudyInto(body: HTMLElement): void;
  /** COLLEGARE · the Index of a story, into any body. */
  renderNarrativeIndexInto(body: HTMLElement, win: Win): void;
  /** AUDIT N5 · the chronology check, into any body. */
  renderChronologyInto(body: HTMLElement, win: Win): void;
  /** SPAZIO · the Scena 3D of THIS window: built once into its body (a WebGL
   *  canvas is not rebuilt on a repaint), refreshed with the epoch and the
   *  toggles, taken down with the window. */
  mountScene(body: HTMLElement, win: Win): { refresh(): void; destroy(): void };
  /** Which of its tabs this hosted window is showing (per WINDOW, never per
   *  type — two Inspector windows can sit on different tabs, and that is what
   *  makes the second one a view of its own instead of a duplicate). */
  panelIdOf(win: Win): string;
  /** Build that panel into this host, and hand back the handle to it. */
  mountPanel(panelId: string, host: HTMLElement, win: Win): PanelMount;
  /** Draw THIS window's story into THIS host — reading, and writing when the
   *  window's ✎ is on. The reading half has taken a host since the audit; what
   *  arrived on 14 September is that the editor knows which host it is in. */
  renderNarrativeInto(host: HTMLElement, win: Win): void;
  /** Wire THIS window's canvas — its ten gestures, its camera, its minimap —
   *  and hand back how to repaint it. The last type to cross over. */
  mountGraph(cv: HTMLCanvasElement, mini: HTMLCanvasElement, win: Win): void;
  unmountGraph(winId: string): void;
  repaintGraphs(): void;
}

/** An element of this area's own header strip — the row count, the crumb, the
 *  up button. Looked up at USE time, because the header is rebuilt whenever the
 *  arrangement changes and a held reference would go stale. */
function strip<T extends HTMLElement>(area: HTMLElement | null,
                                      cls: string): T | null {
  return area?.querySelector<T>(`:scope > .tile-bar .${cls}`) ?? null;
}

/** The one thing every converted surface does on a focus change: mark itself.
 *  No geometry, no repaint, no child added or removed — the law of the shell,
 *  and the reason these six can never drift apart again. */
function markFocus(root: HTMLElement | null, on: boolean): void {
  root?.classList.toggle("surf-focus", on);
}

export function registerBuiltinSurfaces(deps: SurfaceDeps): void {
  // ── TABLE ────────────────────────────────────────────────────────────────
  registerSurfaceType({
    id: "table",
    create(): Surface {
      let body: HTMLElement | null = null;
      let host: TableMount | null = null;
      return {
        mount(area, win) {
          body = document.createElement("div");
          body.className = "tile-tablebody";
          area.appendChild(body);
          const el = body;
          host = {
            body: el,
            win,
            get count() { return strip(el.parentElement, "win-strip-count"); },
            enabled: () => el.isConnected,
            place: surfacePlace(win),
          };
          deps.addEmDataHost(host);
        },
        // the host registry paints every mount from the one renderer
        refresh() { deps.renderEmData(); },
        setFocused(on) { markFocus(body, on); },
        destroy() {
          if (host) deps.removeEmDataHost(host);
          body?.remove();
          body = null;
          host = null;
        },
      };
    },
  });

  // ── STORAGE ──────────────────────────────────────────────────────────────
  registerSurfaceType({
    id: "storage",
    create(): Surface {
      let body: HTMLElement | null = null;
      let host: StorageMount | null = null;
      return {
        mount(area, win) {
          body = document.createElement("div");
          body.className = "tile-storagebody";
          area.appendChild(body);
          const el = body;
          host = {
            win, body: el,
            get crumb() { return strip(el.parentElement, "win-strip-crumb"); },
            get up() {
              return strip<HTMLButtonElement>(el.parentElement, "win-strip-up");
            },
            enabled: () => el.isConnected,
          };
          deps.addStorageHost(host);
        },
        refresh() { deps.renderStorage(); },
        setFocused(on) { markFocus(body, on); },
        destroy() {
          if (host) deps.removeStorageHost(host);
          body?.remove();
          body = null;
          host = null;
        },
      };
    },
  });

  // ── SHELF ────────────────────────────────────────────────────────────────
  registerSurfaceType({
    id: "shelf",
    create(): Surface {
      let body: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          body = document.createElement("div");
          body.className = "tile-shelfbody shelf-body";
          area.appendChild(body);
          this.refresh();
        },
        refresh() {
          if (!body || !win || !body.isConnected) return;
          const el = body;
          const w = win;
          paintSurface(w, el, () =>
            deps.renderShelfInto(w, el, strip(el.parentElement, "win-strip-count")));
        },
        setFocused(on) { markFocus(body, on); },
        destroy() { body?.remove(); body = null; win = null; },
      };
    },
  });

  // ── VIEWER ───────────────────────────────────────────────────────────────
  registerSurfaceType({
    id: "viewer",
    create(): Surface {
      let root: HTMLElement | null = null;
      let stage: HTMLElement | null = null;
      let caption: HTMLElement | null = null;
      let bar: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          root = document.createElement("div");
          root.className = "tile-viewer viewer-view";
          stage = document.createElement("div");
          stage.className = "viewer-stage";
          caption = document.createElement("div");
          caption.className = "viewer-caption";
          bar = document.createElement("div");
          bar.className = "viewer-bar hidden";
          root.append(bar, stage, caption);
          area.appendChild(root);
          this.refresh();
        },
        refresh() {
          if (!win || !stage || !caption || !bar || !stage.isConnected) return;
          const w = win, s = stage, c = caption, b = bar;
          paintSurface(w, s, () => deps.renderViewerInto(w, s, c, b));
        },
        setFocused(on) { markFocus(root, on); },
        destroy() {
          root?.remove();
          root = stage = caption = bar = null;
          win = null;
        },
      };
    },
  });

  // ── DOC ──────────────────────────────────────────────────────────────────
  registerSurfaceType({
    id: "doc",
    create(): Surface {
      let root: HTMLElement | null = null;
      let list: HTMLElement | null = null;
      let detail: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          root = document.createElement("div");
          root.className = "doc-surface";
          list = document.createElement("div");
          list.className = "doc-list";
          detail = document.createElement("div");
          detail.className = "doc-detail";
          root.append(list, detail);
          area.appendChild(root);
          this.refresh();
        },
        refresh() {
          if (!win || !root || !list || !detail || !root.isConnected) return;
          const w = win, r = root, l = list, d = detail;
          // the direction is keyed to the SURFACE's width, never to who has the
          // focus — so entering this window reflows nothing (FOCUS-PARITY)
          deps.reflectDocWidth(r);
          // two scrollers, two slots: the list you had scrolled and the source
          // you were reading are both positions worth keeping
          paintSurface(w, l, () =>
            paintSurface(w, d, () => deps.renderDocViewInto(w, l, d), "doc-detail"),
            "doc-list");
        },
        setFocused(on) { markFocus(root, on); },
        destroy() {
          root?.remove();
          root = list = detail = null;
          win = null;
        },
      };
    },
  });

  // ── STUDY ────────────────────────────────────────────────────────────────
  //
  // The case that says whether the night worked. Until tonight a Study window
  // without the focus fell through to `tileNote` and its area showed a sentence
  // instead of the study — there was no "secondary Study surface" because
  // nobody had written one. There still is not: there is a Study surface, and it
  // is the only one, so the question of what an unfocused Study shows does not
  // arise. Not a second renderer: `renderStudyPanel` was already a function of
  // (root, store) and never knew about focus in the first place.
  registerSurfaceType({
    id: "study",
    create(): Surface {
      let body: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          body = document.createElement("div");
          body.className = "tile-studybody study-body";
          area.appendChild(body);
          this.refresh();
        },
        refresh() {
          if (!body || !win || !body.isConnected) return;
          const el = body;
          paintSurface(win, el, () => deps.renderStudyInto(el));
        },
        setFocused(on) { markFocus(body, on); },
        destroy() { body?.remove(); body = null; win = null; },
      };
    },
  });

  // ── NARRATIVE-INDEX · the story's chapters and its coverage ──────────────
  //
  // Born converted (3 ott 2026): one constructor, the same shape as the study.
  registerSurfaceType({
    id: "narrative-index",
    create(): Surface {
      let body: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          body = document.createElement("div");
          body.className = "tile-nidxbody";
          area.appendChild(body);
          this.refresh();
        },
        refresh() {
          if (!body || !win || !body.isConnected) return;
          const el = body;
          const w = win;
          paintSurface(w, el, () => deps.renderNarrativeIndexInto(el, w));
        },
        setFocused(on) { markFocus(body, on); },
        destroy() { body?.remove(); body = null; win = null; },
      };
    },
  });

  // ── AUDIT N5 · CHRONOLOGY · the epochs on a time axis, and their remedies ──
  registerSurfaceType({
    id: "chronology",
    create(): Surface {
      let body: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          body = document.createElement("div");
          body.className = "tile-chronobody";
          area.appendChild(body);
          this.refresh();
        },
        refresh() {
          if (!body || !win || !body.isConnected) return;
          const el = body;
          const w = win;
          paintSurface(w, el, () => deps.renderChronologyInto(el, w));
        },
        setFocused(on) { markFocus(body, on); },
        destroy() { body?.remove(); body = null; win = null; },
      };
    },
  });

  // ── SPAZIO · THE SCENA 3D · the RMs and proxies of an epoch ─────────────
  registerSurfaceType({
    id: "scene",
    create(): Surface {
      let body: HTMLElement | null = null;
      let mounted: { refresh(): void; destroy(): void } | null = null;
      return {
        mount(area, w) {
          body = document.createElement("div");
          body.className = "tile-scenebody";
          area.appendChild(body);
          mounted = deps.mountScene(body, w);
        },
        refresh() {
          if (!body || !body.isConnected) return;
          mounted?.refresh();
        },
        setFocused(on) { markFocus(body, on); },
        destroy() { mounted?.destroy(); mounted = null; body?.remove(); body = null; },
      };
    },
  });

  // ── THE HOSTED PANELS · emtree and inspector ─────────────────────────────
  //
  // THE LAST THING IN THIS APPLICATION THAT WAS ONE BY DEFINITION.
  //
  // Until tonight the four panels were singleton ELEMENTS taken from
  // `getElementById` at boot and MOVED — from a hidden `#side`, into whichever
  // area claimed one, and back again. Everything that follows from a thing being
  // unique followed: a release pass before any rebuild, a claim pass after it, a
  // guard that read the DOM to find out where a panel currently lived, and a
  // note in the second area saying «another window has this one». That note was
  // the confession: «another window has it» is a sentence you can only write if
  // there is one.
  //
  // There is no element to move now. A panel window builds its own panel in its
  // own area, through the renderer that already existed, and two Inspector
  // windows side by side are two live inspectors. `panelIdOf(win)` was already
  // per-window — the right thing written in advance — so which tab each one
  // shows was never the part that was broken.
  const panelSurface = (id: "emtree" | "outliner" | "inspector"): SurfaceType => ({
    id,
    create(): Surface {
      let root: HTMLElement | null = null;
      let body: HTMLElement | null = null;
      let win: Win | null = null;
      let mount: PanelMount | null = null;
      let showing = "";
      const teardown = (): void => {
        mount?.destroy?.();
        mount = null;
        showing = "";
      };
      return {
        mount(area, w) {
          win = w;
          root = document.createElement("div");
          root.className = "tile-panel";
          root.dataset.win = w.id;
          // HDR2 · the tab strip is in the window HEADER, which every area
          // builds with one builder. This row stays in the DOM, empty and
          // hidden, so the surface keeps the shape both mounts were levelled to.
          const tabs = document.createElement("div");
          tabs.className = "tile-panel-tabs panel-tabs panel-tabs-passive hidden";
          body = document.createElement("div");
          body.className = "tile-panel-body panel-body";
          root.append(tabs, body);
          area.appendChild(root);
          this.refresh();
        },
        refresh() {
          if (!body || !win || !body.isConnected) return;
          const want = deps.panelIdOf(win);
          if (want !== showing) {
            // the tab changed: this window shows another panel now
            teardown();
            body.textContent = "";
            showing = want;
            // …and the body says WHICH panel it is holding, so the stylesheet can
            // give it that panel's box. It used to be the panel's own id that
            // carried the padding and the scrolling — i.e. the box lived on the
            // one element, which is exactly what stopped there being two.
            body.dataset.panel = want;
            mount = deps.mountPanel(want, body, win);
            return;             // mountPanel paints; a second paint is waste
          }
          paintSurface(win, body, () => mount?.refresh());
        },
        select(nodeId) { mount?.select?.(nodeId); },
        setFocused(on) { markFocus(root, on); },
        destroy() {
          teardown();
          root?.remove();
          root = body = null;
          win = null;
        },
      };
    },
  });
  registerSurfaceType(panelSurface("emtree"));
  // SHIFT-A · the outliner, a window type of its own: the same panel surface
  registerSurfaceType(panelSurface("outliner"));
  registerSurfaceType(panelSurface("inspector"));

  // ── NARRATIVE ────────────────────────────────────────────────────────────
  //
  // THE ONLY TYPE THAT WAS ALSO A MODE, which is where the work had stopped.
  //
  // It was a `WindowType` in `workspace.ts` — with its own tab and its own
  // preset — AND `centralMode === "narrative"`, an overlay switched on over the
  // canvas by a button in the master header. Two ways to be the same thing, and
  // the second one is why `#narrative-view` had to be a singleton: an overlay is
  // over ONE canvas.
  //
  // E.D.'s decision of 12 September, applied here: the narrative is a window
  // type and nothing else. `renderNarrativeView(host, …)` already took its host
  // and, called without an editor, already was the reading — that half was done
  // on the 12th. What arrived tonight is that the EDITOR knows which host it is
  // in, so two Narrative windows on two different chapters are two stories being
  // written, which is what `winCurrent(win, "narrative")` always claimed.
  registerSurfaceType({
    id: "narrative",
    create(): Surface {
      let host: HTMLElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          host = document.createElement("div");
          host.className = "tile-narrative nv-view";
          area.appendChild(host);
          this.refresh();
        },
        refresh() {
          if (!host || !win || !host.isConnected) return;
          const h = host, w = win;
          paintSurface(w, h, () => deps.renderNarrativeInto(h, w));
        },
        setFocused(on) { markFocus(host, on); },
        destroy() { host?.remove(); host = null; win = null; },
      };
    },
  });

  // ── GRAPH · the last privileged area ─────────────────────────────────────
  //
  // The one that was left, and the one the whole audit was about.
  //
  // Until tonight the graph had TWO drawings and ONE editor: `#canvas`, inside
  // `#canvas-wrap` — the area that followed the focus — plus a read-only twin
  // per other graph area, painted by `drawTile()`. So a second graph window
  // could select (the area took the focus on `pointerenter` and resolved the
  // click in its own camera, since 12 September) but could not drag a node and
  // could not draw a connector, because those live in the ten gesture handlers
  // that were bound to the one element.
  //
  // Now a graph window builds its own canvas and its own minimap, and
  // `wireGraphCanvas` binds the same ten gestures to it. What is shared is the
  // gesture STATE — and that is correct, not a compromise: there is one pointer,
  // so there is one gesture, and two windows differing only in holding two
  // half-finished gestures at once is not a thing a hand can produce.
  registerSurfaceType({
    id: "graph",
    create(): Surface {
      let cv: HTMLCanvasElement | null = null;
      let mini: HTMLCanvasElement | null = null;
      let win: Win | null = null;
      return {
        mount(area, w) {
          win = w;
          cv = document.createElement("canvas");
          // FOCUS-NOJITTER / STEP A · the width the resources panel takes is
          // published on the AREA (`--palette-w`) and the canvas reads it in
          // CSS, so a window with its panel open is the same size whether or
          // not it has the focus.
          area.appendChild(cv);
          mini = document.createElement("canvas");
          mini.className = "win-overview";
          mini.title = t("overview.title");
          area.appendChild(mini);
          deps.mountGraph(cv, mini, w);
          deps.repaintGraphs();
        },
        refresh() { deps.repaintGraphs(); },
        // ONLY the ring. The ten gestures are wired to THIS canvas and are
        // always live — that is the whole of tonight — so there is nothing to
        // turn on or off here.
        setFocused(on) { markFocus(cv, on); },
        destroy() {
          if (win) deps.unmountGraph(win.id);
          cv?.remove();
          mini?.remove();
          cv = mini = null;
          win = null;
        },
      };
    },
  });
}


