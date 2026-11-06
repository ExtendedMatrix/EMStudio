/**
 * EXPERIMENTAL («Funzioni sperimentali», `experimental.ts`) · THE SITE AND ITS
 * DOOR. Nothing here runs with the switch off: main.ts calls `initSiteDoor`
 * only when it is on, and every export answers nothing without it.
 *
 * On the decisions of the Landscape Graph (D-LG4/5) and of «la griglia di
 * ingestion» (25 Oct 2026):
 *
 *  - THE DOOR: one way in for a file of the Storage (or dropped from it) — a
 *    3D model, a tileset, a GIS layer. A dialog says what was recognised, the
 *    resource it becomes, its frame, its stamp and the node it hangs from. A GIS
 *    layer is read and written by the PUBLIC GIS roads (`/gis/inspect`,
 *    `/graph/gis-ingest`: s3Dgraphy's `inspect_layer` and `add_gis_layer`), the
 *    site made in the same delta when the graph has none: one undo step. A model
 *    and a tileset go on along the roads that already exist (the stamp
 *    composer, the tileset bar).
 *  - THE SITE: the LocationNodeGroup of level `sito` (s3Dgraphy's
 *    `make_site_place`), with its glyph (the datamodel's `site` data glyph) as a
 *    chip in the bar of the Matrix and of the Graph — the Matrix draws no place
 *    as a box (E.D., 11 Oct 2026), the chip is the site as a node there.
 *  - ITS FOOTPRINT: a PropertyNode `footprint` (WKT with its CRS), computed by
 *    s3Dgraphy from the proxies of the units it outlines (`/graph/site-footprint`),
 *    drawn in the Space as an outline on the ground. The layers' features are
 *    drawn by the Space's GIS (`gis-scene.ts`), not here.
 *
 * No rule of the EM language is written here: the WKT is parsed only to DRAW it,
 * the site is found by the datamodel's own fields, everything that writes goes
 * through s3Dgraphy.
 */
import type { EmDocument, EmNode } from "./types";
import { glyphFor } from "./glyphs";
import { glyphElement } from "./type-icons";
import type { SceneMark } from "./scene3d";
import { basename } from "./paths";
import { anchorOf, doorKindOf, footprintOf, gridToThree, layersOf, siteOf } from "./site-model";

export * from "./site-model";

type T = (k: string, v?: Record<string, string | number>) => string;

const dataOf = (n: EmNode | undefined): Record<string, unknown> => (n?.data ?? {}) as Record<string, unknown>;

// ── the module's state and its seams ────────────────────────────────────

export interface GisIngestAsk {
  path: string;
  featureKey: string | null;
  zField: string | null;
  /** the graph has no site: made with this name in the same delta */
  siteName: string | null;
  acquisition: { dtc_kind: string; name: string } | null;
}

export interface SiteDoorDeps {
  t: T;
  doc: () => EmDocument | null;
  bridge: () => Promise<string>;
  toast: (s: string) => void;
  /** the public GIS ingest (`/graph/gis-ingest`), applied as ONE undo step;
   *  a string is the reason it did not happen */
  ingest: (ask: GisIngestAsk) => Promise<{ error?: string; siteName?: string; warnings?: string[] }>;
  /** the footprint of the site from the proxies of these units (`/graph/site-footprint`) */
  footprint: (siteId: string, units: string[]) => Promise<{ error?: string; vertices?: number; crs?: string; bbox?: number[] }>;
  /** the node shown in the Inspector (and revealed where it is drawn) */
  select: (id: string) => void;
  /** the scenes repaint their marks, the bars are drawn again */
  redraw: () => void;
  /** the roads that exist: a tileset to the tileset bar, a model to the stamp composer */
  tileset: (path: string) => void;
  model: (path: string) => void;
  readOnly: () => boolean;
}

let deps: SiteDoorDeps | null = null;
export function initSiteDoor(d: SiteDoorDeps): void { deps = d; }

/** per Space window: the site's outline hidden (default: shown) */
const hiddenIn = new Set<string>();

/** The marks of the Space: the footprint's outline, on the ground. */
export function siteMarks(winId: string): SceneMark[] {
  if (!deps || hiddenIn.has(winId)) return [];
  const doc = deps.doc();
  const a = anchorOf(doc);
  if (!doc || !a) return [];
  const site = siteOf(doc);
  const fp = site ? footprintOf(doc, site.id) : null;
  if (!fp || fp.crs === "local" || a.epsg === null) return [];
  return fp.rings.map((ring, i) => {
    const r = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    return { id: `site:fp:${fp.propertyId}:${i}`, kind: "plane" as const, vertices: r.map((p) => gridToThree(a, p)),
      label: i === 0 ? deps!.t("labsite.footprintMark", { site: String(site!.name ?? "") }) : "" };
  });
}

/** A click on a mark of the site: the footprint's node. */
export function onSiteMark(id: string): boolean {
  if (!id.startsWith("site:") || !deps) return false;
  const [, kind, node] = id.split(":");
  if (kind === "fp") deps.select(node);
  return true;
}

// ── DOM: the chip of the site (Matrix, Graph) ───────────────────────────

/** The site as a node in the bar of a Matrix or a Graph: its glyph, its name,
 *  what it carries. A click opens its menu. Null when the graph has no site. */
export function siteChip(): HTMLElement | null {
  if (!deps) return null;
  const doc = deps.doc();
  const site = siteOf(doc);
  if (!doc || !site) return null;
  const t = deps.t;
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "site-chip";
  chip.dataset.site = site.id;
  const g = glyphFor(site.node_type, dataOf(site));
  if (g) { const el = glyphElement(g); el.classList.add("site-glyph"); chip.appendChild(el); }
  const name = document.createElement("span");
  name.textContent = String(site.name ?? site.id);
  chip.appendChild(name);
  const fp = footprintOf(doc, site.id);
  const layers = layersOf(doc, site.id).length;
  const meta = document.createElement("small");
  meta.textContent = [fp ? t("labsite.hasFootprint") : "", layers ? t("labsite.layersN", { n: layers }) : ""].filter(Boolean).join(" · ");
  if (meta.textContent) chip.appendChild(meta);
  chip.title = t("labsite.chipTip");
  chip.addEventListener("click", (e) => { e.stopPropagation(); siteMenu(site, chip); });
  return chip;
}

function siteMenu(site: EmNode, at: HTMLElement): void {
  if (!deps) return;
  const t = deps.t;
  document.querySelector(".site-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "ctx-menu site-menu";
  const r = at.getBoundingClientRect();
  menu.style.left = `${Math.min(r.left, innerWidth - 280)}px`;
  menu.style.top = `${r.bottom + 4}px`;
  const item = (label: string, act: string, run: () => void, disabled?: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.dataset.act = act;
    if (disabled) { b.disabled = true; b.title = disabled; }
    b.onclick = () => { menu.remove(); run(); };
    menu.appendChild(b);
  };
  item(t("labsite.select"), "site-select", () => deps!.select(site.id));
  const fp = footprintOf(deps.doc(), site.id);
  if (fp) item(t("labsite.selectFootprint"), "site-footprint-select", () => deps!.select(fp.propertyId));
  item(t(fp ? "labsite.footprintAgain" : "labsite.footprintMake"), "site-footprint",
    () => askFootprint(site), deps.readOnly() ? t("labsite.readOnly") : undefined);
  document.body.appendChild(menu);
  const close = (e: Event) => { if (!menu.contains(e.target as Node)) { menu.remove(); removeEventListener("pointerdown", close, true); } };
  setTimeout(() => addEventListener("pointerdown", close, true), 0);
}

/** The footprint from the proxies of the units named: asked to s3Dgraphy. */
function askFootprint(site: EmNode): void {
  if (!deps) return;
  const t = deps.t;
  const { modal, body, foot, close } = dialog(t("labsite.footprintTitle", { site: String(site.name ?? "") }), "site-footprint");
  const p = document.createElement("p");
  p.textContent = t("labsite.footprintBody");
  const lab = document.createElement("label");
  lab.textContent = t("labsite.footprintUnits");
  const inp = document.createElement("input");
  inp.type = "text";
  inp.dataset.field = "units";
  lab.appendChild(inp);
  const say = document.createElement("p");
  say.className = "conn-line";
  body.append(p, lab, say);
  const go = button(t("labsite.footprintGo"), "footprint-go");
  go.onclick = async () => {
    const units = inp.value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!units.length) { inp.focus(); return; }
    go.disabled = true;
    say.textContent = "…";
    const r = await deps!.footprint(site.id, units).catch((e: Error) => ({ error: e.message }) as { error: string; vertices?: number; crs?: string; bbox?: number[] });
    if (r.error) {
      say.textContent = r.error;
      say.classList.add("conn-err");
      go.disabled = false;
      return;
    }
    close();
    const b = r.bbox ?? [0, 0, 0, 0];
    deps!.toast(t("labsite.footprintDone", { n: r.vertices ?? 0, crs: r.crs ?? "",
      w: (b[2] - b[0]).toFixed(1), h: (b[3] - b[1]).toFixed(1) }));
    deps!.redraw();
  };
  foot.append(button(t("common.cancel"), "cancel", close), go);
  document.body.appendChild(modal);
  setTimeout(() => inp.focus(), 0);
}

// ── DOM: the button of the Space ────────────────────────────────────────

/** «Site»: the footprint's outline shown or hidden in this Space (when there is one). */
export function spaceButtons(winId: string): HTMLElement[] {
  if (!deps) return [];
  const doc = deps.doc();
  const site = siteOf(doc);
  if (!site || !footprintOf(doc, site.id)) return [];
  const t = deps.t;
  const tg = document.createElement("button");
  tg.type = "button";
  tg.className = "scn-tg site-tg";
  tg.dataset.siteToggle = "1";
  tg.textContent = t("labsite.spaceToggle");
  tg.title = t("labsite.spaceToggleTip");
  tg.setAttribute("aria-pressed", String(!hiddenIn.has(winId)));
  tg.addEventListener("click", (e) => {
    e.stopPropagation();
    if (hiddenIn.has(winId)) hiddenIn.delete(winId); else hiddenIn.add(winId);
    tg.setAttribute("aria-pressed", String(!hiddenIn.has(winId)));
    deps?.redraw();
  });
  return [tg];
}

// ── DOM: THE DOOR ───────────────────────────────────────────────────────

function button(label: string, act: string, run?: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.dataset.act = act;
  if (run) b.onclick = run;
  return b;
}

function dialog(title: string, name: string) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.dataset.dialog = name;
  const card = document.createElement("div");
  card.className = "modal-card site-door";
  const head = document.createElement("div");
  head.className = "modal-head";
  head.textContent = title;
  const body = document.createElement("div");
  body.className = "modal-body";
  const foot = document.createElement("div");
  foot.className = "modal-foot";
  card.append(head, body, foot);
  modal.appendChild(card);
  const close = () => modal.remove();
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  return { modal, body, foot, close };
}

function row(dl: HTMLElement, k: string, v: string, attr?: string): void {
  const dt = document.createElement("dt");
  dt.textContent = k;
  const dd = document.createElement("dd");
  dd.textContent = v;
  if (attr) dd.dataset.door = attr;
  dl.append(dt, dd);
}

/** what the public `/gis/inspect` says of a file (s3Dgraphy `inspect_layer`) */
interface Inspected {
  ok: boolean; error?: string; path?: string; gis_format?: string; crs?: string | null;
  geometry_type?: string | null; feature_count?: number | null; z_range?: number[] | null;
  fields?: string[]; feature_key?: string | null; z_field?: string | null; companions?: string[];
  raster?: { kind?: string } | null;
}

/** «stessa griglia» as the GIS draws it: the same CRS, or the one family
 *  s3Dgraphy declares (`gis.same_grid`: EPSG:31700 ↔ EPSG:3844) */
const SAME_GRID: string[][] = [["EPSG:31700", "EPSG:3844"]];
function sameGrid(a: string, b: string): boolean {
  return a === b || SAME_GRID.some((f) => f.includes(a) && f.includes(b));
}

/** The door: a file of the Storage (or dropped from it) into the graph. */
export async function openDoor(path: string, isDir = false): Promise<void> {
  if (!deps) return;
  const t = deps.t;
  const name = basename(path) || path;
  const kind = doorKindOf(name, isDir);
  const { modal, body, foot, close } = dialog(t("labsite.doorTitle", { name }), "site-door");
  modal.dataset.kind = kind;
  const dl = document.createElement("dl");
  dl.className = "site-door-facts";
  body.appendChild(dl);
  const say = document.createElement("p");
  say.className = "conn-line";
  const steps = document.createElement("p");
  steps.className = "site-door-steps";
  steps.textContent = t("labsite.doorSteps");
  row(dl, t("labsite.doorKind"), t(`labsite.kind.${kind}`), "kind");
  document.body.appendChild(modal);
  const cancel = button(t("common.cancel"), "cancel", close);

  if (kind === "tileset" || kind === "model") {
    row(dl, t("labsite.doorResource"), t(kind === "tileset" ? "labsite.resTileset" : "labsite.resModel"), "resource");
    row(dl, t("labsite.doorNode"), t(kind === "tileset" ? "labsite.nodeTileset" : "labsite.nodeModel"), "node");
    body.append(steps);
    const go = button(t(kind === "tileset" ? "labsite.goTileset" : "labsite.goModel"), "door-go", () => {
      close();
      if (kind === "tileset") deps!.tileset(path); else deps!.model(path);
    });
    foot.append(cancel, go);
    return;
  }
  if (kind !== "gis_layer") {
    body.append(say);
    say.textContent = t("labsite.unknownKind");
    foot.append(button(t("labsite.close"), "close", close));
    return;
  }
  // a GIS layer: the bridge reads it (s3Dgraphy), the door says what it found
  say.textContent = "…";
  body.append(say);
  foot.append(cancel);
  let ins: Inspected;
  try {
    const base = await deps.bridge();
    const r = await fetch(`${base}/gis/inspect?${new URLSearchParams({ path })}`);
    ins = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })) as Inspected;
    if (r.status === 404 && !ins.error) ins = { ok: false, error: t("labsite.bridgeOld") };
  } catch {
    ins = { ok: false, error: t("geo.noBridgeShort") };
  }
  if (!ins.ok) {
    say.textContent = ins.error ?? "—";
    say.classList.add("conn-err");
    return;
  }
  say.textContent = "";
  const doc = deps.doc();
  const site = siteOf(doc);
  const a = anchorOf(doc);
  const graphCrs = a?.epsg != null ? `EPSG:${a.epsg}` : null;
  const crs = ins.crs ?? null;
  const files = ins.companions ?? [];
  row(dl, t("labsite.doorResource"), t("labsite.resLayer", { fmt: String(ins.gis_format ?? ""), n: files.length, files: files.join(", ") }), "resource");
  if (ins.raster) {
    row(dl, t("labsite.doorContent"), t("labsite.contentRaster", { kind: String(ins.raster.kind ?? "") }), "content");
  } else {
    row(dl, t("labsite.doorContent"), t("labsite.content", { type: String(ins.geometry_type ?? "—"), n: ins.feature_count ?? 0,
      z: ins.z_range ? `${ins.z_range[0].toFixed(1)}–${ins.z_range[1].toFixed(1)} m` : "—" }), "content");
  }
  const same = !!(crs && graphCrs && sameGrid(crs, graphCrs));
  const gridLine = !crs ? t("labsite.noCrs")
    : !graphCrs ? t("labsite.graphNoCrs", { crs })
    : same ? (crs === graphCrs ? t("labsite.sameCrs", { crs }) : t("labsite.sameGrid", { crs, graph: graphCrs }))
    : t("labsite.otherGrid", { crs, graph: graphCrs });
  row(dl, t("labsite.doorFrame"), gridLine, "frame");
  // the stamp: the capture that produced the layer
  const stampLab = document.createElement("label");
  stampLab.textContent = t("labsite.doorStamp");
  const stampIn = document.createElement("input");
  stampIn.type = "text";
  stampIn.dataset.field = "acquisition";
  stampIn.value = t("labsite.stampDefault");
  stampLab.appendChild(stampIn);
  // the node: the site (or a new one)
  const siteLab = document.createElement("label");
  let siteIn: HTMLInputElement | null = null;
  if (site) {
    siteLab.textContent = t("labsite.doorSite", { site: String(site.name ?? site.id) });
    siteLab.dataset.door = "node";
  } else {
    siteLab.textContent = t("labsite.doorNewSite");
    siteIn = document.createElement("input");
    siteIn.type = "text";
    siteIn.dataset.field = "site";
    siteIn.placeholder = t("labsite.siteName");
    siteLab.appendChild(siteIn);
  }
  body.insertBefore(steps, say);
  body.insertBefore(stampLab, say);
  body.insertBefore(siteLab, say);
  // the fields (a vector layer): which names the feature, which holds the height
  const fields = ins.raster ? [] : ins.fields ?? [];
  const keySel = document.createElement("select");
  keySel.dataset.field = "feature_key";
  const zSel = document.createElement("select");
  zSel.dataset.field = "z_field";
  if (fields.length) {
    const keyLab = document.createElement("label");
    keyLab.textContent = t("labsite.featureKey");
    const zLab = document.createElement("label");
    zLab.textContent = t("labsite.zField");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "—";
    zSel.appendChild(none);
    for (const f of fields) {
      const o1 = document.createElement("option"); o1.value = f; o1.textContent = f; o1.selected = f === ins.feature_key; keySel.appendChild(o1);
      const o2 = document.createElement("option"); o2.value = f; o2.textContent = f; o2.selected = f === ins.z_field; zSel.appendChild(o2);
    }
    keyLab.appendChild(keySel);
    zLab.appendChild(zSel);
    body.insertBefore(keyLab, say);
    body.insertBefore(zLab, say);
  }
  const go = button(t("labsite.goLayer"), "door-go");
  if (deps.readOnly()) { go.disabled = true; go.title = t("labsite.readOnly"); }
  if (crs && graphCrs && !same) say.textContent = t("labsite.otherGridWarn");
  go.onclick = async () => {
    if (siteIn && !siteIn.value.trim()) { siteIn.focus(); say.textContent = t("labsite.siteName"); return; }
    go.disabled = true;
    say.textContent = "…";
    const r = await deps!.ingest({
      path: String(ins.path ?? path),
      featureKey: fields.length ? keySel.value || null : null,
      zField: fields.length ? zSel.value || null : null,
      siteName: site ? null : siteIn?.value.trim() ?? null,
      acquisition: { dtc_kind: "topographic", name: stampIn.value.trim() || t("labsite.stampDefault") },
    }).catch((e: Error) => ({ error: e.message }) as { error: string; siteName?: string; warnings?: string[] });
    if (r.error) {
      say.textContent = r.error;
      say.classList.add("conn-err");
      go.disabled = false;
      return;
    }
    close();
    deps!.toast(t("labsite.layerDone", { name, site: r.siteName ?? String(site?.name ?? "") }));
    for (const w of r.warnings ?? []) deps!.toast(w);
    deps!.redraw();
  };
  foot.appendChild(go);
}

/** A Storage row dropped on a Graph, a Matrix or a Space: the door, for a GIS
 *  file (a tileset keeps its own drop on the Space). True when it was ours. */
export function doorDrop(winType: string, payload: { path: string; name: string; type: string } | null): boolean {
  if (!deps || !payload || payload.type !== "file") return false;
  if (!["graph", "scene"].includes(winType)) return false;
  if (doorKindOf(payload.name) !== "gis_layer") return false;
  void openDoor(payload.path);
  return true;
}

/** Probes' seam (the checks read the state, never the pixels). */
export function siteDoorState(): unknown {
  const doc = deps?.doc() ?? null;
  const site = siteOf(doc);
  return { site: site ? { id: site.id, name: site.name } : null,
    footprint: site ? footprintOf(doc, site.id) : null,
    layers: layersOf(doc, site?.id),
    hidden: [...hiddenIn] };
}
