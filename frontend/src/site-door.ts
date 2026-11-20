/**
 * EXPERIMENTAL («Funzioni sperimentali», `experimental.ts`) · THE SITE AND ITS
 * FOOTPRINT — the Landscape Graph, under embargo until its preprint, the only
 * content of the switch since MICRO-COR11 (20 Nov 2026). Nothing here runs with
 * the switch off: main.ts calls `initSiteDoor` only when it is on, and every
 * export answers nothing without it.
 *
 * On the decisions of the Landscape Graph (D-LG4/5):
 *
 *  - (THE DOOR of the lab — a file of the Storage dropped on a graph, «Bring
 *    into the graph…» — is gone with MICRO-COR11: «Porta dentro…» is the one
 *    door, and it does what this one did for a GIS layer — the frame, the
 *    survey that stamps it, and with the switch on the site made in the same
 *    step and the sheets hanging from it.)
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
import { anchorOf, footprintOf, gridToThree, layersOf, siteOf } from "./site-model";

export * from "./site-model";

type T = (k: string, v?: Record<string, string | number>) => string;

const dataOf = (n: EmNode | undefined): Record<string, unknown> => (n?.data ?? {}) as Record<string, unknown>;

// ── the module's state and its seams ────────────────────────────────────

export interface SiteDoorDeps {
  t: T;
  doc: () => EmDocument | null;
  toast: (s: string) => void;
  /** the footprint of the site from the proxies of these units (`/graph/site-footprint`) */
  footprint: (siteId: string, units: string[]) => Promise<{ error?: string; vertices?: number; crs?: string; bbox?: number[] }>;
  /** the node shown in the Inspector (and revealed where it is drawn) */
  select: (id: string) => void;
  /** the scenes repaint their marks, the bars are drawn again */
  redraw: () => void;
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

// ── DOM: the dialog of the footprint ────────────────────────────────────

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

/** Probes' seam (the checks read the state, never the pixels). */
export function siteDoorState(): unknown {
  const doc = deps?.doc() ?? null;
  const site = siteOf(doc);
  return { site: site ? { id: site.id, name: site.name } : null,
    footprint: site ? footprintOf(doc, site.id) : null,
    layers: layersOf(doc, site?.id),
    hidden: [...hiddenIn] };
}
