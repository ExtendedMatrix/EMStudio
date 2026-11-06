/**
 * MICRO-GIS-BASE (6 Nov 2026) · the Space's «GIS»: the switch in its bar and
 * the panel of the graph's GIS layers — shown or hidden (per person and per
 * document, never in the em.json), a file brought into the graph (any of the
 * four base formats, a GeoPackage's layer chosen), the ground of the
 * landscape made from a DEM (and an image), the contours of a DEM at the
 * interval the person writes. The drawing is `gis-scene.ts`'s; the graph is
 * changed only by the caller (`deps.ingest`, `deps.surface`, `deps.contours`:
 * the bridge's deltas, one undo step each).
 */
import { basename } from "./paths";
import { createGisDriver, frameOf, gisLayersOf, surfacesOf, type GisDriver } from "./gis-scene";
import type { SpaceSceneHandle } from "./scene3d";

type T = (k: string, v?: Record<string, string>) => string;
type Doc = Parameters<typeof gisLayersOf>[0];

export interface GisSpaceDeps {
  host: HTMLElement;
  handle: SpaceSceneHandle;
  t: T;
  person: () => string | null;
  doc: () => Doc;
  docPath: () => string | null;
  bridge: () => Promise<string>;
  toast: (s: string) => void;
  log?: (s: string) => void;
  redrawBar: () => void;
  /** the caller's doors to the graph (deltas): a file, a surface, contours */
  ingest: (path: string, layer: string | null) => Promise<string | null>;
  surface: (demId: string, imageId: string | null) => Promise<string | null>;
  contours: (demId: string, interval: number) => Promise<string | null>;
}

export interface GisSpace {
  barButtons(): HTMLElement[];
  onBar(target: HTMLElement): boolean;
  /** the graph changed: draw again what it says */
  refresh(): void;
  destroy(): void;
  state(): unknown;
}

interface Saved { panel: boolean; hidden: string[]; interval: number }

export function mountGisSpace(d: GisSpaceDeps): GisSpace {
  const { t } = d;
  let driver: GisDriver | null = null;
  let driverSig = "";
  let bridge: string | null = null;
  let inspect: Record<string, any> | null = null;
  let busy = "";
  const key = () => `emstudio.gis.${d.person() ?? "anon"}.${d.docPath() ?? String(d.doc()?.graph?.graph_id ?? "unsaved")}`;
  const load = (): Saved => {
    try {
      const raw = JSON.parse(localStorage.getItem(key()) ?? "null");
      return { panel: !!raw?.panel, hidden: Array.isArray(raw?.hidden) ? raw.hidden.map(String) : [], interval: Number(raw?.interval) > 0 ? Number(raw.interval) : 1 };
    } catch { return { panel: false, hidden: [], interval: 1 }; }
  };
  let s = load();
  let loadedFor = key();
  const save = () => { try { localStorage.setItem(key(), JSON.stringify(s)); } catch { /* kept in memory */ } };

  const panel = document.createElement("div");
  panel.className = "geo-panel gis-panel hidden";
  panel.dataset.gisPanel = "1";
  for (const ev of ["pointerdown", "dblclick", "contextmenu", "wheel", "keydown"]) panel.addEventListener(ev, (e) => e.stopPropagation());
  d.host.appendChild(panel);

  const shownNow = () => {
    const all = gisLayersOf(d.doc());
    const surfaces = surfacesOf(d.doc()).filter((x) => !s.hidden.includes(x.id));
    // a GeoTIFF is a raster: it is drawn as the ground of a surface, not as features
    const layers = all.filter((l) => l.format !== "geotiff" && !s.hidden.includes(l.id));
    return { all, layers, surfaces };
  };

  /** the driver of the scene, (re)made when the frame changes; null without a georeference or a bridge */
  const sync = async () => {
    if (key() !== loadedFor) { s = load(); loadedFor = key(); }
    const f = frameOf(d.doc());
    const { all, layers, surfaces } = shownNow();
    if (!f || (!all.length && !surfaces.length)) {
      if (driver) { d.handle.setGis(null); driver = null; driverSig = ""; }
      return;
    }
    bridge = await d.bridge().catch(() => null);
    if (!bridge) return;
    const sig = JSON.stringify([f, bridge, d.docPath()]);
    if (!driver || sig !== driverSig) {
      d.handle.setGis(null);
      driver = createGisDriver({ bridge, frame: f, docPath: d.docPath(), log: d.log });
      driverSig = sig;
      d.handle.setGis(driver);
    }
    driver.set(layers, surfaces, all);
  };

  const btn = (text: string, act: string, title = "", extra: Record<string, string> = {}) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.dataset.gisAct = act;
    if (title) b.title = title;
    for (const [k, v] of Object.entries(extra)) b.dataset[k] = v;
    return b;
  };

  const draw = () => {
    panel.classList.toggle("hidden", !s.panel);
    if (!s.panel) return;
    const typed = panel.querySelector<HTMLInputElement>("[data-gis-path]")?.value ?? "";
    panel.textContent = "";
    const h = document.createElement("div");
    h.className = "geo-h";
    const b = document.createElement("b");
    b.textContent = t("gis.title");
    h.append(b, btn("✕", "close", t("geo.close")));
    panel.appendChild(h);
    const f = frameOf(d.doc());
    const note = document.createElement("div");
    note.className = "geo-anchor";
    note.textContent = f ? t("gis.frame", { epsg: String(f.epsg) }) : t("gis.noFrame");
    panel.appendChild(note);
    const all = gisLayersOf(d.doc());
    const surfaces = surfacesOf(d.doc());
    const list = document.createElement("div");
    list.className = "gis-list";
    if (!all.length && !surfaces.length) {
      const p = document.createElement("p");
      p.className = "xf-note";
      p.textContent = t("gis.none");
      list.appendChild(p);
    }
    const st = (driver?.state().drawn ?? []) as Array<Record<string, unknown>>;
    const row = (id: string, name: string, what: string, extra: HTMLElement[] = []) => {
      const r = document.createElement("div");
      r.className = "gis-row";
      r.dataset.gisRow = id;
      const lab = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !s.hidden.includes(id);
      cb.dataset.gisShow = id;
      const nm = document.createElement("span");
      nm.textContent = name;
      lab.append(cb, nm);
      const info = document.createElement("small");
      const drawnInfo = st.find((x) => x.id === id);
      info.textContent = what + (drawnInfo ? (drawnInfo.error ? ` · ⚠ ${String(drawnInfo.error)}`
        : drawnInfo.features != null ? ` · ${t("gis.drawnFeatures", { n: String(drawnInfo.features), how: String(drawnInfo.how ?? "") })}`
          : drawnInfo.triangles != null ? ` · ${t("gis.drawnSurface", { n: String(drawnInfo.triangles), step: Number(drawnInfo.step).toFixed(2) })}` : "") : "");
      r.append(lab, info, ...extra);
      list.appendChild(r);
    };
    for (const sf of surfaces) row(sf.id, `⛰ ${sf.name}`, t("gis.surfaceWhat", { dem: all.find((x) => x.id === sf.dem)?.name ?? "—", img: all.find((x) => x.id === sf.image)?.name ?? "—" }));
    const images = all.filter((l) => l.format === "geotiff" && l.raster === "image");
    for (const l of all) {
      const what = `${l.format}${l.layer ? ` · ${l.layer}` : ""} · ${l.crs ?? t("gis.noCrs")}${l.derived ? ` · ${t("gis.derived")}` : ""}`;
      if (l.format === "geotiff" && l.raster === "dem") {
        // the DEM: a surface (with an image), its contours at an interval
        const sel = document.createElement("select");
        sel.dataset.gisImage = l.id;
        const o0 = document.createElement("option"); o0.value = ""; o0.textContent = t("gis.noImage"); sel.appendChild(o0);
        for (const im of images) { const o = document.createElement("option"); o.value = im.id; o.textContent = im.name; sel.appendChild(o); }
        const iv = document.createElement("input");
        iv.type = "number"; iv.min = "0.1"; iv.step = "0.5"; iv.value = String(s.interval);
        iv.dataset.gisInterval = l.id;
        iv.title = t("gis.intervalHint");
        const acts = document.createElement("div");
        acts.className = "gis-acts";
        acts.append(sel, btn(t("gis.makeSurface"), "surface", t("gis.makeSurfaceHint"), { id: l.id }), iv, btn(t("gis.makeContours"), "contours", t("gis.contoursHint"), { id: l.id }));
        row(l.id, `▦ ${l.name}`, what, [acts]);
        continue;
      }
      row(l.id, `${l.format === "geotiff" ? "▦" : "◇"} ${l.name}`, what);
    }
    panel.appendChild(list);
    // bring a file into the graph
    const add = document.createElement("div");
    add.className = "geo-add";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = t("gis.pathPlaceholder");
    inp.dataset.gisPath = "1";
    inp.value = typed;
    add.append(inp, btn(t("gis.inspect"), "inspect"));
    panel.appendChild(add);
    if (inspect) {
      const box = document.createElement("div");
      box.className = "gis-inspect";
      box.dataset.gisInspect = inspect.ok ? "ok" : "error";
      if (!inspect.ok) box.textContent = `⚠ ${String(inspect.error ?? "")}`;
      else {
        const p = document.createElement("p");
        const bb = (inspect.bbox ?? []).map((x: number) => x.toFixed(2)).join(", ");
        const w = (inspect.bbox_wgs84 ?? []).map((x: number) => x.toFixed(5)).join(", ");
        p.textContent = t("gis.inspected", { name: basename(String(inspect.path)), fmt: String(inspect.gis_format), crs: String(inspect.crs ?? t("gis.noCrs")),
          src: String(inspect.crs_source ?? "—"), n: String(inspect.feature_count ?? inspect.raster?.kind ?? "—"), bbox: bb, wgs: w || "—" });
        box.appendChild(p);
        let layerSel: HTMLSelectElement | null = null;
        if (Array.isArray(inspect.layers) && inspect.layers.length > 1) {
          layerSel = document.createElement("select");
          layerSel.dataset.gisLayer = "1";
          for (const x of inspect.layers.filter((y: any) => y.data_type === "features")) {
            const o = document.createElement("option"); o.value = x.name; o.textContent = `${x.name} · ${x.crs ?? ""}`; o.selected = x.name === inspect.layer; layerSel.appendChild(o);
          }
          box.appendChild(layerSel);
        }
        box.appendChild(btn(t("gis.ingest"), "ingest", t("gis.ingestHint")));
      }
      panel.appendChild(box);
    }
    if (busy) { const p = document.createElement("p"); p.className = "xf-note"; p.textContent = busy; panel.appendChild(p); }
  };

  panel.addEventListener("change", (e) => {
    const el = e.target as HTMLElement;
    if (el.dataset.gisShow) {
      const id = el.dataset.gisShow;
      s.hidden = (el as HTMLInputElement).checked ? s.hidden.filter((x) => x !== id) : [...s.hidden, id];
      save();
      void sync().then(draw);
    } else if (el.dataset.gisInterval) {
      const v = Number((el as HTMLInputElement).value);
      if (v > 0) { s.interval = v; save(); }
    } else if (el.dataset.gisLayer && inspect) {
      void doInspect(String(inspect.path), (el as HTMLSelectElement).value);
    }
  });
  const doInspect = async (path: string, layer?: string) => {
    bridge = await d.bridge().catch(() => null);
    if (!bridge) { d.toast(t("geo.needBridge")); return; }
    const q = new URLSearchParams({ path, ...(layer ? { layer } : {}) });
    inspect = await fetch(`${bridge}/gis/inspect?${q}`).then((r) => r.json(), () => ({ ok: false, error: t("geo.noBridgeShort") }));
    if (inspect && !inspect.path) inspect.path = path;
    draw();
  };
  const run = async (what: string, p: Promise<string | null>) => {
    busy = what;
    draw();
    const said = await p.catch((e) => String(e));
    busy = "";
    if (said) d.toast(said);
    await sync();
    draw();
  };
  panel.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-gis-act]");
    if (!b) return;
    const act = b.dataset.gisAct;
    if (act === "close") { s.panel = false; save(); draw(); d.redrawBar(); return; }
    if (act === "inspect") {
      const v = panel.querySelector<HTMLInputElement>("[data-gis-path]")?.value.trim() ?? "";
      if (v) void doInspect(v);
      return;
    }
    if (act === "ingest" && inspect?.ok) {
      const layer = panel.querySelector<HTMLSelectElement>("[data-gis-layer]")?.value ?? inspect.layer ?? null;
      const path = String(inspect.path);
      inspect = null;
      void run(t("gis.ingesting"), d.ingest(path, layer));
      return;
    }
    if (act === "surface" && b.dataset.id) {
      const img = panel.querySelector<HTMLSelectElement>(`[data-gis-image="${CSS.escape(b.dataset.id)}"]`)?.value || null;
      void run(t("gis.surfacing"), d.surface(b.dataset.id, img));
      return;
    }
    if (act === "contours" && b.dataset.id) {
      const v = Number(panel.querySelector<HTMLInputElement>(`[data-gis-interval="${CSS.escape(b.dataset.id)}"]`)?.value);
      if (!(v > 0)) { d.toast(t("gis.intervalHint")); return; }
      s.interval = v; save();
      void run(t("gis.contouring", { v: String(v) }), d.contours(b.dataset.id, v));
    }
  });

  void sync();
  return {
    barButtons() {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "scn-tg";
      b.dataset.gisBar = "1";
      b.textContent = t("gis.bar");
      const n = gisLayersOf(d.doc()).length + surfacesOf(d.doc()).length;
      b.title = frameOf(d.doc()) ? t("gis.barTitle", { n: String(n) }) : t("gis.noFrame");
      b.setAttribute("aria-pressed", String(s.panel));
      return [b];
    },
    onBar(target) {
      if (!target.closest("[data-gis-bar]")) return false;
      s.panel = !s.panel;
      save();
      draw();
      d.redrawBar();
      return true;
    },
    refresh() { void sync().then(draw); },
    destroy() { d.handle.setGis(null); driver = null; panel.remove(); },
    state() { return { panel: s.panel, hidden: s.hidden, driver: driver?.state() ?? null, layers: gisLayersOf(d.doc()), surfaces: surfacesOf(d.doc()) }; },
  };
}
