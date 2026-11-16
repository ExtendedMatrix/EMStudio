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
import { helpGlyph, lineWithHelp } from "./help-glyph";
import { createGisDriver, frameOf, gisLayersOf, isPictureSheet, surfacesOf, type GisDriver, type GisLayerRef } from "./gis-scene";
import { STUDY_ONLY, studyOnlyNodes } from "./study-only";
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
  /** MICRO-D-GIS-DOCUMENTI · files brought in as the SHEETS of one document */
  ingestDocument?: (req: GisDocumentAsk) => Promise<string | null>;
  /** MICRO-E p.1 · «Porta dentro…», the one door (main.ts) */
  door?: () => void;
}

/** MICRO-D-GIS-DOCUMENTI · what «Porta dentro…» asks the bridge (`/graph/gis-document`) */
export interface GisDocumentAsk {
  paths: string[];
  documentId: string | null;
  name: string;
  date: string;
  license: string | null;
  crs: Record<string, string>;
  shift: Record<string, [number, number, number]>;
}

/** the study's next D.nn: the one rule (naming.ts, s3Dgraphy `next_document_name`) */
import { nextDocumentName as nextDocName, type NamingDoc } from "./naming";
export function nextDocumentName(doc: unknown): string {
  return nextDocName((doc as NamingDoc | null) ?? { graph: { nodes: [] } });
}

/** the words of a sheet in another grid: «convertito da EPSG:3004 a EPSG:32633» */
export function convertedSaid(t: T, layerCrs: string | null, epsg: number | null): string {
  if (!layerCrs || !epsg) return "";
  const a = layerCrs.toUpperCase(), b = `EPSG:${epsg}`;
  if (a === b) return "";
  const same = [["EPSG:3844", "EPSG:31700"]].some((f) => f.includes(a) && f.includes(b));
  return same ? t("gis.sameGrid", { a, b }) : t("gis.converted", { a, b });
}

export interface GisSpace {
  /** MICRO-RIFINITURE p.6 (E.D., 6 Nov 2026: «il GIS deve stare nel pannello dei
   *  dati 3D») · no button in the bar any more: kept for the callers, empty */
  barButtons(): HTMLElement[];
  /** …the GIS layers as a section of the Space's data panel: each one shown or
   *  hidden and its opacity, a DEM's surface and contours, «Porta nel grafo» */
  section(): HTMLElement;
  onBar(target: HTMLElement): boolean;
  /** the graph changed: draw again what it says */
  refresh(): void;
  destroy(): void;
  state(): unknown;
  /** MICRO-OUTLINER-UNICO · the eye of a layer in the Outliner's GIS branch:
   *  the same «hidden» the section's checkbox writes */
  shown(id: string): boolean;
  setShown(id: string, on: boolean): void;
}

interface Saved { panel: boolean; hidden: string[]; interval: number; opacity: Record<string, number> }

export function mountGisSpace(d: GisSpaceDeps): GisSpace {
  const { t } = d;
  let driver: GisDriver | null = null;
  let driverSig = "";
  let bridge: string | null = null;
  let inspect: Record<string, any> | null = null;
  /** MICRO-D-GIS-DOCUMENTI · the files inspected for «Porta dentro…» (several = sheets of one document) */
  let inspects: Array<Record<string, any>> = [];
  let busy = "";
  const key = () => `emstudio.gis.${d.person() ?? "anon"}.${d.docPath() ?? String(d.doc()?.graph?.graph_id ?? "unsaved")}`;
  const load = (): Saved => {
    try {
      const raw = JSON.parse(localStorage.getItem(key()) ?? "null");
      const op: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw?.opacity ?? {})) if (Number(v) >= 0 && Number(v) <= 1) op[k] = Number(v);
      return { panel: !!raw?.panel, hidden: Array.isArray(raw?.hidden) ? raw.hidden.map(String) : [], interval: Number(raw?.interval) > 0 ? Number(raw.interval) : 1, opacity: op };
    } catch { return { panel: false, hidden: [], interval: 1, opacity: {} }; }
  };
  let s = load();
  let loadedFor = key();
  const save = () => { try { localStorage.setItem(key(), JSON.stringify(s)); } catch { /* kept in memory */ } };

  const panel = document.createElement("div");
  // MICRO-RIFINITURE p.6 · a section of the data panel (`section()`), not a panel over the scene
  panel.className = "gis-panel gis-in-data";
  panel.dataset.gisPanel = "1";
  for (const ev of ["pointerdown", "dblclick", "contextmenu", "wheel", "keydown"]) panel.addEventListener(ev, (e) => e.stopPropagation());

  const shownNow = () => {
    const all = gisLayersOf(d.doc());
    const surfaces = surfacesOf(d.doc()).filter((x) => !s.hidden.includes(x.id));
    // a GeoTIFF is a raster: it is drawn as the ground of a surface, not as features
    // (MICRO-D-GIS-DOCUMENTI · a picture SHEET of a document is drawn: its frame converted)
    const layers = all.filter((l) => (l.format !== "geotiff" || isPictureSheet(l)) && !(l.sheet && l.raster === "dem") && !s.hidden.includes(l.id));
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
      for (const [id, v] of Object.entries(s.opacity)) driver.setOpacity(id, v);
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
    const typed = panel.querySelector<HTMLInputElement>("[data-gis-path]")?.value ?? "";
    panel.textContent = "";
    const h = document.createElement("div");
    h.className = "sol-lay-h";
    // MICRO-OUTLINER-UNICO · a title and a line of state; what they mean behind «?»
    h.textContent = t("gis.short");
    h.append(" ", helpGlyph(t("gis.title"), "gis-title"));
    panel.appendChild(h);
    const f = frameOf(d.doc());
    const note = lineWithHelp("geo-anchor", f ? t("gis.frameShort", { epsg: String(f.epsg) }) : t("gis.noFrameShort"),
      f ? t("gis.frame", { epsg: String(f.epsg) }) : t("gis.noFrame"), "gis-frame");
    panel.appendChild(note);
    const all = gisLayersOf(d.doc());
    const surfaces = surfacesOf(d.doc());
    const list = document.createElement("div");
    list.className = "gis-list";
    if (!all.length && !surfaces.length) {
      list.appendChild(lineWithHelp("xf-note", t("gis.noneShort"), t("gis.none"), "gis-none"));
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
      // MICRO-RIFINITURE p.6 · its opacity
      const op = document.createElement("input");
      op.type = "range"; op.min = "0"; op.max = "1"; op.step = "0.05";
      op.value = String(s.opacity[id] ?? 1);
      op.dataset.gisOpacity = id;
      op.title = t("lay.opacity");
      op.className = "sol-lay-op";
      lab.append(op);
      const info = document.createElement("small");
      const drawnInfo = st.find((x) => x.id === id);
      info.textContent = what + (drawnInfo ? (drawnInfo.error ? ` · ⚠ ${String(drawnInfo.error)}`
        : drawnInfo.features != null ? ` · ${t("gis.drawnFeatures", { n: String(drawnInfo.features), how: String(drawnInfo.how ?? "") })}`
          : drawnInfo.triangles != null ? ` · ${t("gis.drawnSurface", { n: String(drawnInfo.triangles), step: Number(drawnInfo.step).toFixed(2) })}` : "") : "");
      r.append(lab, info, ...extra);
      list.appendChild(r);
    };
    for (const sf of surfaces) row(sf.id, `⛰ ${sf.name}`, t("gis.surfaceWhat", { dem: all.find((x) => x.id === sf.dem)?.name ?? "—", img: all.find((x) => x.id === sf.image)?.name ?? "—" }));
    const images = all.filter((l) => l.format === "geotiff" && l.raster === "image" && !l.sheet);
    // MICRO-D-GIS-DOCUMENTI · the sheets under their document, «solo studio» when its licence says so
    const held = studyOnlyNodes(d.doc() as never);
    const epsgNow = f ? Number(f.epsg) : null;
    const docs = new Map<string, GisLayerRef[]>();
    for (const l of all) if (l.sheet && l.docId) (docs.get(l.docId) ?? docs.set(l.docId, []).get(l.docId)!).push(l);
    for (const [docId, sheets] of docs) {
      const hd = document.createElement("div");
      hd.className = "gis-doc";
      hd.dataset.gisDoc = docId;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = sheets.some((x) => !s.hidden.includes(x.id));
      cb.dataset.gisShowDoc = docId;
      const nm = document.createElement("b");
      nm.textContent = `📄 ${sheets[0].docName ?? docId}`;
      hd.append(cb, nm, ` · ${t("gis.sheets", { n: String(sheets.length) })}`, btn("⤢", "frame-doc", t("gis.frameDoc"), { id: docId }));
      const so = held.get(docId);
      if (so) {
        const mk = document.createElement("span");
        mk.className = "gis-study-only";
        mk.dataset.studyOnly = docId;
        mk.textContent = t("gis.studyOnly");
        mk.title = t("gis.studyOnlyHint");
        hd.appendChild(mk);
      }
      list.appendChild(hd);
      for (const l of sheets) {
        const said = String(st.find((x) => x.id === l.id)?.said ?? "") || convertedSaid(t, l.crs, epsgNow);
        const what = `${l.format === "worldfile_image" ? t("gis.fmtWorldfile") : l.format}${l.shift ? ` · shift ${l.shift.map((v) => v.toFixed(0)).join(", ")}` : ""} · ${l.crs ?? t("gis.noCrs")}${said ? ` · ${said}` : ""}`;
        const before = list.childElementCount;
        row(l.id, `${isPictureSheet(l) ? "▦" : l.format === "dxf" ? "⌗" : "◇"} ${l.name}`, what);
        const r = list.children[before] as HTMLElement | undefined;
        if (r) {
          r.classList.add("gis-sheet");
          if (held.has(l.id)) {
            const mk = document.createElement("span");
            mk.className = "gis-study-only";
            mk.dataset.studyOnly = l.id;
            mk.textContent = t("gis.studyOnly");
            mk.title = t("gis.studyOnlyInherited", { doc: held.get(l.id)!.originName });
            r.querySelector("label")?.appendChild(mk);
          }
        }
      }
    }
    for (const l of all) {
      if (l.sheet) continue;
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
    const addH = document.createElement("div");
    addH.className = "sol-lay-sub";
    addH.textContent = t("gis.bringTitle");
    panel.appendChild(addH);
    const add = document.createElement("div");
    add.className = "geo-add";
    // MICRO-E p.1 · the field with «;» is gone: the one door, «Porta dentro…»
    // (its window reads each file, asks the document, its date, CRS + shift)
    void typed;
    add.append(btn(t("door.menu"), "door", t("door.menuHint")));
    panel.appendChild(add);
    if (inspects.length) panel.appendChild(documentBox());
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

  /** MICRO-D-GIS-DOCUMENTI · «Porta dentro…»: what each file is, the document
   *  (a new D.nn with its name and date, or one already there), the licence
   *  «uso di studio, non pubblicabile», and for a file that declares no CRS (a
   *  DXF) the little window CRS + shift — as 3D Survey Collection's georadar
   *  import asks it: the study's CRS and shift proposed */
  const documentBox = (): HTMLElement => {
    const box = document.createElement("div");
    box.className = "gis-inspect gis-docbox";
    box.dataset.gisDocbox = "1";
    const f = frameOf(d.doc());
    for (const ins of inspects) {
      const p = document.createElement("p");
      p.dataset.gisInspected = String(ins.path);
      if (!ins.ok) { p.textContent = `⚠ ${basename(String(ins.path))}: ${String(ins.error ?? "")}`; box.appendChild(p); continue; }
      const said = convertedSaid(t, ins.crs ?? null, f ? Number(f.epsg) : null);
      p.textContent = `${basename(String(ins.path))} · ${ins.gis_format === "worldfile_image" ? t("gis.fmtWorldfile") : ins.gis_format} · ${ins.crs ?? t("gis.noCrs")}${said ? ` · ${said}` : ""}`;
      box.appendChild(p);
      if (!ins.crs) {
        // the little window: CRS + shift, the study's proposed
        const win = document.createElement("fieldset");
        win.className = "gis-crs-win";
        win.dataset.gisCrsWin = String(ins.path);
        const lg = document.createElement("legend");
        lg.textContent = t("gis.crsWinTitle", { name: basename(String(ins.path)) });
        const crs = document.createElement("input");
        crs.type = "text";
        crs.value = f ? `EPSG:${f.epsg}` : "";
        crs.placeholder = "EPSG:32633";
        crs.dataset.gisCrs = String(ins.path);
        const shiftRow = document.createElement("div");
        shiftRow.className = "gis-shift";
        const sh = f ? [f.x, f.y, f.z] : [0, 0, 0];
        ["X", "Y", "Z"].forEach((ax, i) => {
          const lab = document.createElement("label");
          const inp = document.createElement("input");
          inp.type = "number"; inp.step = "any"; inp.value = String(sh[i] ?? 0);
          inp.dataset.gisShift = `${ins.path}|${i}`;
          lab.append(`${ax} `, inp);
          shiftRow.appendChild(lab);
        });
        const hint = document.createElement("small");
        hint.textContent = t("gis.crsWinHint");
        win.append(lg, crs, shiftRow, hint);
        box.appendChild(win);
      }
    }
    const ok = inspects.filter((x) => x.ok);
    if (!ok.length) return box;
    const h = document.createElement("div");
    h.className = "sol-lay-sub";
    h.textContent = ok.length > 1 ? t("gis.docSheetsOf", { n: String(ok.length) }) : t("gis.docOf");
    box.appendChild(h);
    const sel = document.createElement("select");
    sel.dataset.gisDocChoice = "1";
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = t("gis.docNew"); sel.appendChild(o0);
    for (const n of (d.doc()?.graph?.nodes ?? []).filter((x) => x.node_type === "document")) {
      const o = document.createElement("option"); o.value = String(n.id); o.textContent = String(n.name ?? n.id); sel.appendChild(o);
    }
    const name = document.createElement("input");
    name.type = "text"; name.dataset.gisDocName = "1"; name.value = nextDocumentName(d.doc()); name.title = t("gis.docName");
    const date = document.createElement("input");
    date.type = "text"; date.dataset.gisDocDate = "1"; date.placeholder = t("gis.docDatePh"); date.title = t("gis.docDateHint");
    const lic = document.createElement("label");
    const lcb = document.createElement("input");
    lcb.type = "checkbox"; lcb.dataset.gisStudyOnly = "1";
    lic.append(lcb, ` ${t("gis.licStudyOnly")}`);
    lic.title = t("gis.studyOnlyHint");
    const row1 = document.createElement("div"); row1.className = "gis-acts"; row1.append(sel, name, date);
    box.append(row1, lic, btn(t("gis.ingestDoc"), "ingest-doc", t("gis.ingestDocHint")));
    sel.addEventListener("change", () => { const nw = !sel.value; name.disabled = !nw; date.disabled = !nw; });
    return box;
  };

  panel.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    if (!el.dataset.gisOpacity) return;
    const v = Number(el.value);
    s.opacity[el.dataset.gisOpacity] = v;
    save();
    driver?.setOpacity(el.dataset.gisOpacity, v);
  });
  panel.addEventListener("change", (e) => {
    const el = e.target as HTMLElement;
    if (el.dataset.gisShowDoc) {
      const ids = gisLayersOf(d.doc()).filter((x) => x.docId === el.dataset.gisShowDoc).map((x) => x.id);
      const on = (el as HTMLInputElement).checked;
      s.hidden = on ? s.hidden.filter((x) => !ids.includes(x)) : [...new Set([...s.hidden, ...ids])];
      save();
      void sync().then(draw);
    } else if (el.dataset.gisShow) {
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
  const inspectAll = async (list: string[]) => {
    bridge = await d.bridge().catch(() => null);
    if (!bridge) { d.toast(t("geo.needBridge")); return; }
    inspect = null;
    inspects = await Promise.all(list.map(async (path) => {
      const j = await fetch(`${bridge}/gis/inspect?${new URLSearchParams({ path })}`).then((r) => r.json(), () => ({ ok: false, error: t("geo.noBridgeShort") }));
      return { ...j, path: j?.path ?? path };
    }));
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
    if (act === "door") { d.door?.(); return; }
    if (act === "inspect") {
      const v = panel.querySelector<HTMLInputElement>("[data-gis-path]")?.value.trim() ?? "";
      // MICRO-D-GIS-DOCUMENTI · several files (separated by «;») = the sheets of one document
      const many = v.split(/\s*;\s*/).filter(Boolean);
      // a GeoPackage alone keeps the door of before (its layer chosen, a layer of the graph)
      if (many.length === 1 && /\.gpkg$/i.test(many[0])) { inspects = []; void doInspect(many[0]); return; }
      if (many.length) void inspectAll(many);
      return;
    }
    if (act === "ingest-doc" && inspects.some((x) => x.ok) && d.ingestDocument) {
      const ok = inspects.filter((x) => x.ok);
      const docId = panel.querySelector<HTMLSelectElement>("[data-gis-doc-choice]")?.value || null;
      const crs: Record<string, string> = {};
      const shift: Record<string, [number, number, number]> = {};
      for (const x of ok) {
        if (x.crs) continue;
        const c = panel.querySelector<HTMLInputElement>(`[data-gis-crs="${CSS.escape(String(x.path))}"]`)?.value.trim() ?? "";
        if (!c) { d.toast(t("gis.crsWanted", { name: basename(String(x.path)) })); return; }
        crs[String(x.path)] = /^\d+$/.test(c) ? `EPSG:${c}` : c;
        shift[String(x.path)] = [0, 1, 2].map((i) => Number(panel.querySelector<HTMLInputElement>(`[data-gis-shift="${CSS.escape(`${x.path}|${i}`)}"]`)?.value) || 0) as [number, number, number];
      }
      const req: GisDocumentAsk = {
        paths: ok.map((x) => String(x.path)), documentId: docId,
        name: panel.querySelector<HTMLInputElement>("[data-gis-doc-name]")?.value.trim() || nextDocumentName(d.doc()),
        date: panel.querySelector<HTMLInputElement>("[data-gis-doc-date]")?.value.trim() ?? "",
        license: panel.querySelector<HTMLInputElement>("[data-gis-study-only]")?.checked ? STUDY_ONLY : null, crs, shift };
      inspects = [];
      void run(t("gis.ingesting"), d.ingestDocument(req));
      return;
    }
    if (act === "ingest" && inspect?.ok) {
      const layer = panel.querySelector<HTMLSelectElement>("[data-gis-layer]")?.value ?? inspect.layer ?? null;
      const path = String(inspect.path);
      inspect = null;
      void run(t("gis.ingesting"), d.ingest(path, layer));
      return;
    }
    if (act === "frame-doc" && b.dataset.id) {
      // MICRO-D-GIS-DOCUMENTI · the camera on the document's sheets
      const keys = gisLayersOf(d.doc()).filter((x) => x.docId === b.dataset.id).map((x) => `gis:${x.id}`);
      if (!d.handle.frameKeys(keys, true)) d.toast(t("gis.frameNone"));
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
    barButtons() { return []; },
    section() { draw(); return panel; },
    onBar() { return false; },
    refresh() { void sync().then(draw); },
    destroy() { d.handle.setGis(null); driver = null; panel.remove(); },
    state() { return { panel: s.panel, hidden: s.hidden, driver: driver?.state() ?? null, layers: gisLayersOf(d.doc()), surfaces: surfacesOf(d.doc()), inspects }; },
    shown(id) { if (key() !== loadedFor) { s = load(); loadedFor = key(); } return !s.hidden.includes(id); },
    setShown(id, on) {
      s.hidden = on ? s.hidden.filter((x) => x !== id) : [...new Set([...s.hidden, id])];
      save();
      void sync().then(draw);
    },
  };
}
