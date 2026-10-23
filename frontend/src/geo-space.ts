/**
 * MICRO-GEOGLOBO · the Space's territory: the switch in its bar, the three
 * camera modes, «Vai al sito», and the panel of the layers (basemaps, terrain,
 * rasters), «Estrai area», the globe minimum and the cache.
 *
 * The decisions are pure (`geoglobe.ts`), the drawing is the globe's
 * (`globe3d.ts`); this module is the Space window's controller: it reads the
 * graph's GeoPositionNode, asks the bridge to measure the anchor (`/geo/frame`,
 * PROJ), hands the globe to the scene (`handle.setGeo`) and keeps what the
 * person chose — on/off, the mode, the layers — per person and per document in
 * the local preferences, never in the em.json (like the overlays).
 *
 * Off by default: a Space opens as it always did, nothing is asked online until
 * the person turns «Territorio» on.
 */
import { geoOf } from "./geo";
import { basename, dirname } from "./paths";
import {
  BUDGET, EXTRACT_MAX_TILES, SOURCES, boxAround, extractTileCount, layersKey, moveLayer, readLayers, setLayer,
  sourceById, type GeoLayer, type GeoMode, type SiteAnchor,
} from "./geoglobe";
import { createGlobe, type GlobeApi } from "./globe3d";
import type { SpaceSceneHandle } from "./scene3d";

type T = (k: string, v?: Record<string, string>) => string;

export interface GeoSpaceDeps {
  host: HTMLElement;
  handle: SpaceSceneHandle;
  t: T;
  person: () => string | null;
  /** the graph shown (its GeoPositionNode), and its em.json's path */
  doc: () => { graph?: { nodes?: Array<Record<string, unknown>>; graph_id?: string } } | null;
  docPath: () => string | null;
  bridge: () => Promise<string>;
  toast: (s: string) => void;
  /** a raster opened as a document in the Viewer */
  openInViewer: (path: string) => void;
  /** the bar must be drawn again (the switch, the modes) */
  redrawBar: () => void;
  /** a line in the Log (a source failing online: said once per reason) */
  log?: (s: string) => void;
}

interface Saved { on: boolean; mode: GeoMode; layers: GeoLayer[]; panel: boolean; half: number; zmax: number; source: string }

const fmtMB = (b: number) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`;

export interface GeoSpace {
  /** the bar's buttons, for the Space's bar (drawn at each refresh) */
  barButtons(): HTMLElement[];
  /** a click in the bar: true when it was the territory's */
  onBar(target: HTMLElement): boolean;
  destroy(): void;
  /** the probes' seam */
  state(): unknown;
}

export function mountGeoSpace(d: GeoSpaceDeps): GeoSpace {
  const { t } = d;
  let globe: GlobeApi | null = null;
  let anchor: SiteAnchor | null = null;
  let shift: { x: number; y: number; rotation: number; epsg: number } | undefined;
  let anchorNote = "";
  let busy = false;
  let job: Record<string, any> | null = null;
  let jobTimer = 0;
  let cacheInfo: Record<string, any> | null = null;
  let globeMin: Record<string, any> | null = null;
  let bridge: string | null = null;
  // MICRO-BRIDGE-CERTIFICATI · the sources the bridge cannot reach online, and
  // why (`/tiles/failures`): beside the source in «Livelli», once in the Log
  let failures: Record<string, { reason: string; count: number }> = {};
  let failTimer = 0;
  const failSaid = new Set<string>();
  const docKey = () => d.docPath() ?? String(d.doc()?.graph?.graph_id ?? "unsaved");
  const load = (): Saved => {
    try {
      const raw = JSON.parse(localStorage.getItem(layersKey(d.person(), docKey())) ?? "null");
      return { on: !!raw?.on, mode: (["globe", "plan", "site"].includes(raw?.mode) ? raw.mode : "site") as GeoMode,
        layers: readLayers(raw?.layers), panel: !!raw?.panel, half: Number(raw?.half) || 2000,
        zmax: Number(raw?.zmax) || 16, source: typeof raw?.source === "string" ? raw.source : "s2cloudless-2016" };
    } catch {
      return { on: false, mode: "site", layers: readLayers(null), panel: false, half: 2000, zmax: 16, source: "s2cloudless-2016" };
    }
  };
  let s = load();
  let loadedFor = docKey();
  const save = () => { try { localStorage.setItem(layersKey(d.person(), docKey()), JSON.stringify(s)); } catch { /* full: kept in memory */ } };
  const pkgDir = () => { const p = d.docPath(); return p ? `${dirname(p)}/geo` : null; };

  const panel = document.createElement("div");
  panel.className = "geo-panel hidden";
  panel.dataset.geoPanel = "1";
  for (const ev of ["pointerdown", "dblclick", "contextmenu", "wheel", "keydown"]) panel.addEventListener(ev, (e) => e.stopPropagation());
  d.host.appendChild(panel);

  /** the anchor, measured: lon/lat by PROJ (the bridge), the azimuth of the scene's +y */
  const measureAnchor = async (): Promise<SiteAnchor | null> => {
    const nodes = d.doc()?.graph?.nodes ?? [];
    const gp = nodes.find((n) => n.node_type === "geo_position");
    if (!gp) { anchorNote = t("geo.noAnchor"); return null; }
    const data = (gp.data ?? {}) as Record<string, unknown>;
    const g = geoOf(data);
    const h = Number(data.shift_z) || 0;
    const rot = Number(data.rotation) || 0;
    if (g.ok && (g.epsg === 4326)) {
      anchorNote = `EPSG:4326 · ${g.lat.toFixed(6)}, ${g.lon.toFixed(6)}`;
      shift = { x: g.lon, y: g.lat, rotation: rot, epsg: 4326 };
      return { lon: g.lon, lat: g.lat, h, azimuth: rot, epsg: 4326 };
    }
    const epsg = Number(data.epsg);
    if (!epsg || (!Number(data.shift_x) && !Number(data.shift_y))) { anchorNote = t("geo.noAnchor"); return null; }
    try {
      const r = await fetch(`${bridge}/geo/frame`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epsg, x: Number(data.shift_x), y: Number(data.shift_y), z: h, rotation: rot }) });
      const j = await r.json();
      if (!j?.ok) { anchorNote = t("geo.frameFailed", { x: String(j?.error ?? r.status) }); return null; }
      shift = { x: Number(data.shift_x), y: Number(data.shift_y), rotation: rot, epsg };
      anchorNote = t("geo.anchorLine", { epsg: String(epsg), lat: j.lat.toFixed(6), lon: j.lon.toFixed(6),
        az: j.azimuth.toFixed(3), scale: j.scale.toFixed(6) });
      return { lon: j.lon, lat: j.lat, h, azimuth: j.azimuth, scale: j.scale, epsg };
    } catch {
      anchorNote = t("geo.frameFailed", { x: t("geo.noBridgeShort") });
      return null;
    }
  };

  const start = async () => {
    if (busy) return;
    busy = true;
    try {
      bridge = await d.bridge().catch(() => null);
      // the bridge answers? (its tiles: the cache, the packages); else the sources online
      const ok = bridge ? await fetch(`${bridge}/health`).then((r) => r.ok, () => false) : false;
      if (!ok) bridge = null;
      anchor = await measureAnchor();
      if (!anchor) { s.on = false; save(); d.toast(anchorNote); return; }
      globe = createGlobe({
        anchor, shift, layers: s.layers, bridge, pkgDirs: pkgDir() ? [pkgDir()!] : [],
        attributionTitle: t("geo.attribution"),
        onMode: (m) => { s.mode = m; save(); d.redrawBar(); },
      });
      d.handle.setGeo(globe);
      if (s.mode !== "site") globe.setMode(s.mode);
      void refreshCache();
      watchFailures(!!bridge);
    } finally {
      busy = false;
      d.redrawBar();
      draw();
    }
  };
  const stop = () => {
    watchFailures(false);
    d.handle.setGeo(null);
    globe = null;
    d.redrawBar();
    draw();
  };

  const pollFailures = async () => {
    if (!bridge || !globe || document.hidden) return;
    const j = await fetch(`${bridge}/tiles/failures`).then((r) => (r.ok ? r.json() : null), () => null);
    if (!j?.ok) return;    // an older bridge (level < 37): nothing to say
    const now = (j.sources ?? {}) as typeof failures;
    for (const [sid, f] of Object.entries(now)) {
      const key = `${sid}\u0000${f.reason}`;
      if (failSaid.has(key)) continue;
      failSaid.add(key);
      d.log?.(t("geo.sourceFailedLog", { src: sourceById(sid)?.label ?? sid, why: f.reason }));
    }
    const was = JSON.stringify(Object.entries(failures).map(([k, v]) => [k, v.reason]));
    failures = now;
    if (was !== JSON.stringify(Object.entries(now).map(([k, v]) => [k, v.reason]))) draw();
  };
  const watchFailures = (on: boolean) => {
    clearInterval(failTimer);
    if (on) { failTimer = window.setInterval(() => { void pollFailures(); }, 4000); void pollFailures(); }
  };

  const refreshCache = async () => {
    if (!bridge) return;
    cacheInfo = await fetch(`${bridge}/tiles/cache`).then((r) => r.json(), () => null);
    globeMin = await fetch(`${bridge}/tiles/globe-min`).then((r) => r.json(), () => null);
    draw();
  };

  const setLayers = (l: GeoLayer[]) => { s.layers = l; save(); globe?.setLayers(l); draw(); };

  const follow = (id: string, then?: (j: Record<string, any>) => void) => {
    clearInterval(jobTimer);
    jobTimer = window.setInterval(async () => {
      const j = await fetch(`${bridge}/tiles/job?id=${id}`).then((r) => r.json(), () => null);
      if (!j) return;
      job = j;
      draw();
      if (j.state !== "running") { clearInterval(jobTimer); then?.(j); void refreshCache(); }
    }, 500);
  };

  const extract = async () => {
    if (!bridge || !anchor) { d.toast(t("geo.needBridge")); return; }
    const dir = pkgDir();
    if (!dir) { d.toast(t("geo.needSaved")); return; }
    const src = sourceById(s.source);
    if (!src?.offline) { d.toast(t("geo.offlineForbidden", { x: src?.label ?? s.source })); return; }
    const bbox = boxAround(anchor.lon, anchor.lat, s.half);
    const r = await fetch(`${bridge}/tiles/extract`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: s.source, bbox, zmin: 0, zmax: Math.min(s.zmax, src.maxZoom), dest: dir,
        name: `${s.source}-${Math.round(s.half * 2)}m-z${Math.min(s.zmax, src.maxZoom)}` }) });
    const j = await r.json().catch(() => null);
    if (!j?.ok) { d.toast(String(j?.error ?? r.status)); return; }
    job = j;
    follow(j.job, (done) => { if (done.state === "done") d.toast(t("geo.extractDone", { x: String(done.result?.path ?? "") })); });
    draw();
  };

  const cancel = async () => {
    if (!bridge || !job) return;
    await fetch(`${bridge}/tiles/job`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: job.job }) });
  };

  const addRaster = async (path: string) => {
    if (!bridge) { d.toast(t("geo.needBridge")); return; }
    const info = await fetch(`${bridge}/geo/raster-info?path=${encodeURIComponent(path)}`).then((r) => r.json(), () => null);
    if (!info?.ok) { d.toast(t("geo.rasterRefused", { x: String(info?.error ?? "?") })); return; }
    const r = await fetch(`${bridge}/geo/raster-import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
    const j = await r.json().catch(() => null);
    if (!j?.ok) { d.toast(String(j?.error ?? r.status)); return; }
    job = j;
    follow(j.job, (done) => {
      if (done.state !== "done") { d.toast(t("geo.rasterFailed", { x: String(done.error ?? done.state) })); return; }
      const res = done.result;
      const id = `raster:${path}`;
      const name = basename(path) || path;
      const layer: GeoLayer = { id, kind: "raster", name, visible: true, opacity: 1, path: res.path, original: path,
        bounds: res.bounds, raster: res.kind, minZoom: res.min_zoom, maxZoom: res.max_zoom };
      setLayers([layer, ...s.layers.filter((l) => l.id !== id)]);
    });
    draw();
  };

  // ── the panel ──────────────────────────────────────────────────────────
  const btn = (text: string, act: string, title = "", extra: Record<string, string> = {}) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.dataset.geoAct = act;
    if (title) b.title = title;
    for (const [k, v] of Object.entries(extra)) b.dataset[k] = v;
    return b;
  };
  const draw = () => {
    if (docKey() !== loadedFor) { s = load(); loadedFor = docKey(); }
    panel.classList.toggle("hidden", !(s.on && s.panel && globe));
    if (!(s.on && s.panel && globe)) return;
    // what the person is typing survives a redraw (a job's progress, the cache's answer)
    const typed = panel.querySelector<HTMLInputElement>("[data-geo-raster]")?.value ?? "";
    const focused = document.activeElement?.matches?.("[data-geo-raster]") ?? false;
    panel.textContent = "";
    const h = document.createElement("div");
    h.className = "geo-h";
    h.innerHTML = `<b></b>`;
    h.querySelector("b")!.textContent = t("geo.layers");
    h.appendChild(btn("✕", "close", t("geo.close")));
    panel.appendChild(h);
    const a = document.createElement("div");
    a.className = "geo-anchor";
    a.textContent = anchorNote;
    panel.appendChild(a);
    // the layers, in drawing order: the first is drawn first (under)
    const list = document.createElement("div");
    list.className = "geo-list";
    s.layers.forEach((l, i) => {
      const row = document.createElement("div");
      row.className = "geo-row";
      row.dataset.geoLayer = l.id;
      const eye = document.createElement("input");
      eye.type = "checkbox";
      eye.checked = l.visible;
      eye.dataset.geoAct = "eye";
      eye.title = t("geo.visible");
      const name = document.createElement("span");
      name.className = "geo-name";
      name.textContent = l.name;
      const src = l.source ? sourceById(l.source) : undefined;
      name.title = src ? `${src.label}\n${src.licence}\n${src.offline ? t("geo.offlineOk") : t("geo.onlineOnly")}` : (l.original ?? l.path ?? "");
      row.append(eye, name);
      const fail = l.source ? failures[l.source] : undefined;
      if (fail) {
        const w = document.createElement("span");
        w.className = "geo-fail";
        w.dataset.geoFail = l.source!;
        w.textContent = "⚠";
        w.title = t("geo.sourceFailed", { why: fail.reason, n: String(fail.count) });
        w.setAttribute("aria-label", w.title);
        row.appendChild(w);
      }
      if (l.kind !== "terrain") {
        const op = document.createElement("input");
        op.type = "range";
        op.min = "0"; op.max = "1"; op.step = "0.05";
        op.value = String(l.opacity);
        op.dataset.geoAct = "opacity";
        op.title = t("geo.opacity");
        row.appendChild(op);
      }
      row.append(btn("↑", "up", t("geo.up"), i === 0 ? { off: "1" } : {}), btn("↓", "down", t("geo.down"), i === s.layers.length - 1 ? { off: "1" } : {}));
      if (l.kind === "raster") {
        const pl = btn(l.plane ? "▭" : "⛰", "plane", t(l.plane ? "geo.onPlane" : "geo.onTerrain"));
        row.append(pl, btn("👁", "viewer", t("geo.openViewer")), btn("−", "remove", t("geo.remove")));
      }
      list.appendChild(row);
    });
    panel.appendChild(list);
    // add a raster
    const add = document.createElement("div");
    add.className = "geo-add";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = t("geo.rasterPath");
    inp.dataset.geoRaster = "1";
    inp.value = typed;
    add.append(inp, btn(t("geo.addRaster"), "add-raster"));
    panel.appendChild(add);
    if (focused) inp.focus();
    // «Estrai area»
    const ex = document.createElement("div");
    ex.className = "geo-extract";
    const title = document.createElement("b");
    title.textContent = t("geo.extract");
    const sel = document.createElement("select");
    sel.dataset.geoAct = "source";
    for (const so of SOURCES) {
      const o = document.createElement("option");
      o.value = so.id;
      o.textContent = so.label + (so.offline ? "" : ` (${t("geo.onlineOnly")})`);
      o.disabled = !so.offline;
      o.selected = so.id === s.source;
      sel.appendChild(o);
    }
    const half = document.createElement("input");
    half.type = "number"; half.min = "100"; half.step = "100"; half.value = String(s.half);
    half.dataset.geoAct = "half"; half.title = t("geo.half");
    const zm = document.createElement("input");
    zm.type = "number"; zm.min = "0"; zm.max = "18"; zm.value = String(s.zmax);
    zm.dataset.geoAct = "zmax"; zm.title = t("geo.zmax");
    const src = sourceById(s.source);
    const n = anchor && src ? extractTileCount(boxAround(anchor.lon, anchor.lat, s.half), 0, Math.min(s.zmax, src.maxZoom)) : 0;
    const est = document.createElement("span");
    est.className = "geo-est";
    est.dataset.geoEst = String(n);
    est.textContent = t(n > EXTRACT_MAX_TILES ? "geo.tooMany" : "geo.tiles", { n: String(n), max: String(EXTRACT_MAX_TILES) });
    ex.append(title, sel, half, zm, est, btn(t("geo.extractGo"), "extract"));
    if (job) {
      const p = document.createElement("div");
      p.className = "geo-job";
      p.dataset.geoJob = job.state;
      const bar = document.createElement("progress");
      bar.max = Math.max(1, job.total);
      bar.value = job.done;
      const words = document.createElement("span");
      words.textContent = t("geo.job", { kind: String(job.kind), state: t(`geo.state.${job.state}`), done: String(job.done), total: String(job.total), mb: fmtMB(job.bytes || job.result?.bytes || 0) })
        + (job.failed ? ` · ${t("geo.jobFailedTiles", { n: String(job.failed) })}` : "");
      p.append(bar, words);
      if (job.error) {
        const why = document.createElement("span");
        why.className = "geo-job-error";
        why.dataset.geoJobError = "1";
        why.textContent = String(job.error);
        p.appendChild(why);
      }
      if (job.state === "running") p.appendChild(btn(t("geo.cancel"), "cancel"));
      ex.appendChild(p);
    }
    panel.appendChild(ex);
    // the globe minimum, the cache
    const gm = document.createElement("div");
    gm.className = "geo-min";
    const have = (globeMin?.packages ?? []) as Array<{ source: string; bytes: number }>;
    const gmText = document.createElement("span");
    gmText.textContent = have.length ? t("geo.globeMinHave", { x: have.map((p) => `${p.source} ${fmtMB(p.bytes)}`).join(", ") }) : t("geo.globeMinNone");
    gm.append(gmText, btn(t("geo.globeMinGet"), "globe-min"));
    panel.appendChild(gm);
    const ca = document.createElement("div");
    ca.className = "geo-cache";
    const cText = document.createElement("span");
    cText.textContent = cacheInfo ? t("geo.cache", { mb: fmtMB(cacheInfo.bytes ?? 0), n: String(cacheInfo.tiles ?? 0), lim: fmtMB(cacheInfo.limit_bytes ?? 0) }) : t("geo.noBridgeShort");
    const lim = document.createElement("input");
    lim.type = "number"; lim.min = "0"; lim.step = "64";
    lim.value = cacheInfo ? String(Math.round((cacheInfo.limit_bytes ?? 0) / 1048576)) : "";
    lim.dataset.geoAct = "cache-limit"; lim.title = t("geo.cacheLimit");
    ca.append(cText, lim, btn(t("geo.cacheClear"), "cache-clear"));
    panel.appendChild(ca);
    const b = document.createElement("div");
    b.className = "geo-budget";
    b.textContent = t("geo.budget", { z: String(BUDGET.terrainMinZoom), jobs: String(BUDGET.maxJobs), mb: String(BUDGET.lruMaxBytes / 1048576), pr: String(BUDGET.maxPixelRatio) });
    panel.appendChild(b);
  };

  panel.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-geo-act]");
    if (!el || el.dataset.off) return;
    const id = el.closest<HTMLElement>("[data-geo-layer]")?.dataset.geoLayer ?? "";
    switch (el.dataset.geoAct) {
      case "close": s.panel = false; save(); draw(); d.redrawBar(); return;
      case "eye": setLayers(setLayer(s.layers, id, { visible: (el as HTMLInputElement).checked })); return;
      case "up": setLayers(moveLayer(s.layers, id, -1)); return;
      case "down": setLayers(moveLayer(s.layers, id, 1)); return;
      case "plane": { const l = s.layers.find((x) => x.id === id); setLayers(setLayer(s.layers, id, { plane: !l?.plane })); return; }
      case "remove": setLayers(s.layers.filter((x) => x.id !== id)); return;
      case "viewer": { const l = s.layers.find((x) => x.id === id); if (l?.original) d.openInViewer(l.original); return; }
      case "add-raster": { const v = panel.querySelector<HTMLInputElement>("[data-geo-raster]")?.value.trim(); if (v) void addRaster(v); return; }
      case "extract": void extract(); return;
      case "cancel": void cancel(); return;
      case "globe-min":
        if (!bridge) { d.toast(t("geo.needBridge")); return; }
        void (async () => {
          const r = await fetch(`${bridge}/tiles/globe-min`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ what: "imagery" }) });
          const j = await r.json().catch(() => null);
          if (j?.ok) { job = j; follow(j.job); }
          draw();
        })();
        return;
      case "cache-clear":
        void fetch(`${bridge}/tiles/cache`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) }).then(refreshCache);
        return;
    }
  });
  panel.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    const id = el.closest<HTMLElement>("[data-geo-layer]")?.dataset.geoLayer ?? "";
    if (el.dataset.geoAct === "opacity") { s.layers = setLayer(s.layers, id, { opacity: Number(el.value) }); save(); globe?.setLayers(s.layers); }
  });
  panel.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    const a = el.dataset.geoAct;
    if (a === "source") { s.source = el.value; save(); draw(); }
    else if (a === "half") { s.half = Math.max(100, Number(el.value) || 2000); save(); draw(); }
    else if (a === "zmax") { s.zmax = Math.max(0, Math.min(18, Number(el.value) || 0)); save(); draw(); }
    else if (a === "cache-limit" && bridge) {
      void fetch(`${bridge}/tiles/cache`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit_mb: Number(el.value) }) }).then(refreshCache);
    }
  });

  if (s.on) queueMicrotask(() => { void start(); });

  const api: GeoSpace = {
    barButtons() {
      if (docKey() !== loadedFor) {
        // another document: its own territory
        const was = s.on;
        s = load(); loadedFor = docKey();
        if (globe && (!s.on || was)) stop();
        if (s.on && !globe) queueMicrotask(() => { void start(); });
      }
      const out: HTMLElement[] = [];
      const tg = document.createElement("button");
      tg.type = "button";
      tg.className = "scn-tg";
      tg.dataset.geo = "toggle";
      tg.textContent = t("geo.territory");
      tg.title = t("geo.territoryHint");
      tg.setAttribute("aria-pressed", String(s.on));
      out.push(tg);
      if (!s.on) return out;
      const seg = document.createElement("span");
      seg.className = "scn-seg geo-modes";
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", t("geo.modes"));
      const cur = globe?.mode() ?? s.mode;
      for (const m of ["globe", "plan", "site"] as GeoMode[]) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.geoMode = m;
        b.textContent = t(`geo.mode.${m}`);
        b.title = t(`geo.modeHint.${m}`);
        b.setAttribute("aria-pressed", String(cur === m));
        b.disabled = !globe;
        seg.appendChild(b);
      }
      const go = document.createElement("button");
      go.type = "button";
      go.className = "scn-tg";
      go.dataset.geo = "site";
      go.textContent = t("geo.goSite");
      go.disabled = !globe;
      const pn = document.createElement("button");
      pn.type = "button";
      pn.className = "scn-tg";
      pn.dataset.geo = "panel";
      pn.textContent = t("geo.layers");
      pn.setAttribute("aria-pressed", String(s.panel));
      pn.disabled = !globe;
      out.push(seg, go, pn);
      return out;
    },
    onBar(target) {
      const b = target.closest<HTMLElement>("[data-geo],[data-geo-mode]");
      if (!b) return false;
      if (b.dataset.geoMode) { const m = b.dataset.geoMode as GeoMode; s.mode = m; save(); globe?.setMode(m); d.redrawBar(); return true; }
      switch (b.dataset.geo) {
        case "toggle":
          s.on = !s.on; save();
          if (s.on) void start(); else stop();
          return true;
        case "site": globe?.goToSite(); return true;
        case "panel": s.panel = !s.panel; save(); draw(); d.redrawBar(); if (s.panel) void refreshCache(); return true;
      }
      return false;
    },
    destroy() {
      clearInterval(jobTimer);
      clearInterval(failTimer);
      d.handle.setGeo(null);
      globe = null;
      panel.remove();
    },
    state: () => ({ on: s.on, mode: globe?.mode() ?? s.mode, layers: s.layers, anchor, anchorNote, bridge, pkgDir: pkgDir(), job, cache: cacheInfo, failures, globe: globe?.state() ?? null }),
  };
  (d.host as unknown as { __geoSpace?: () => unknown }).__geoSpace = api.state;
  return api;
}
