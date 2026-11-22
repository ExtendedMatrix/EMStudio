/**
 * MICRO-MF04 (E.D., 22 Nov 2026: «il cubo, che adoro») · THE CUBE — a type of
 * area: the real footprints stacked by horizon.
 *
 * EMBARGO (MICRO-SEG30): the function `landscape-cube` of the register
 * (features.ts) is under embargo. This module is reached ONLY through
 * `featureOn("landscape-cube")` / `LAB` (rule 4 of the register); its texts
 * live in the `LAB_TEXTS` blocks of i18n.ts.
 *
 * What it draws (variant B of E.D.'s «scrivania», cc-runs/scrivania): one
 * PLANE per lane (the graph's epochs, or the horizons the Matrix reads by —
 * the container's at the scale of the landscape), the newest on top; on each
 * plane the LOD0 FOOTPRINTS of what lives in it (the proxies' convex hulls in
 * plan, computed by s3Dgraphy from the .glb, never written); the COLOUR is the
 * functional unit that reads the unit in that plane, by its degree of evidence
 * (U5: red stratigraphic, orange documentary, blue reconstructive, grey none);
 * HATCHED the instances that survive from an earlier plane; VERTICAL LINES for
 * the units that cross the planes (the foundations SU001–SU004 of Templu
 * Mare). The view turns around the vertical axis and the planes come closer or
 * part (two sliders, per window). The selection is shared with the Matrix, the
 * Functional Matrix and the Inspector.
 *
 * Why an axonometric SVG of its own and not the 3D engine of the Space (SEG25):
 * the cube is a diagram of TIME more than a model of space — flat planes and
 * outlines, read like the Matrix beside it — and the scrivania E.D. approved is
 * exactly this drawing; an SVG is crisp at every zoom, prints, costs nothing
 * on a laptop without a GPU, and every footprint is an element a click and a
 * check can reach.
 *
 * At the scale of the LANDSCAPE (point C) the items are the identities of the
 * landscape: on each plane the footprint of their PRESENCE (their members'
 * outlines, from the graph bound to their site) when it exists, a SYMBOL in the
 * plane's margin for the identities without members or without outlines.
 *
 * NOTHING IS COMPUTED HERE (invariant 2): `POST /landscape-cube` (tools/
 * em_py_lab.py) answers s3Dgraphy's `functional_cube`. This module asks,
 * keeps the answer, draws it.
 */
import { esc, evidenceColour, fit, type Evidence } from "./functional-matrix";

// ── the answer of the bridge (s3dgraphy.functional_cube) ────────────────────

type Ring = Array<[number, number]>;
interface Lane { id: string; name: string; start: number | null; end: number | null }
export interface LcItem {
  id: string; reader: string | null; readers: string[]; evidence: Evidence | null;
  instance: boolean; from_lane: string | null;
}
export interface LcPlane { lane: string; name: string; start: number | null; end: number | null; items: LcItem[]; without: string[] }
export interface LcUnit {
  name: string; type: string | null; rings: Ring[]; centroid: [number, number]; lane: string | null;
  lanes: string[]; source: string | null; stale: boolean;
}
export interface LcBuilding {
  scale: "building"; lanes: Lane[]; planes: LcPlane[]; units: Record<string, LcUnit>;
  verticals: Array<{ id: string; lanes: string[] }>; bbox: [number, number, number, number] | null; crs: string[];
  functional_units: Record<string, { name: string; scale: string | null }>;
  proxies?: { folder: string | null; read: number; stale: string[] };
}
export interface LcLandItem {
  kind: "footprint" | "symbol"; id: string; evidence: Evidence | null; why?: "no_members" | "no_outline";
  parts?: Array<{ graph_id: string | null; members: string[] }>;
}
export interface LcLandscape {
  scale: "landscape"; lanes: Lane[]; planes: Array<{ lane: string; name: string; start: number | null; end: number | null; items: LcLandItem[] }>;
  rows: Record<string, { name: string; kind: "identity" | "ut"; site: string | null; evidence: Evidence | null; lanes: string[] }>;
  shapes: Record<string, { rings_by_lane: Record<string, Ring[]> }>;
  verticals: Array<{ id: string; lanes: string[] }>; bbox: [number, number, number, number] | null; crs: string[];
  sites: Array<{ id: string; name: string; code: string }>;
}
export type LcAnswer = LcBuilding | LcLandscape;
export type LcScale = "building" | "landscape";
type Lanes = Lane[];

/** What the page gives this module (main.ts binds it). */
export interface LcHost {
  bridge(): Promise<string>;
  /** the active graph and the path of its file (its proxies are beside it) */
  active(): null | { graphId: string; sig: string; json(): string; path: string | null; has(id: string): boolean };
  /** the landscape open (kind landscape, or a composition), null when none */
  landscape(): null | { graphId: string; sig: string; json(): string; header(): Record<string, unknown>; base: string | null };
  /** the open graphs (fresher than their files), with their paths */
  sources(): Array<{ graphId: string; sig: string; json(): string; path: string | null }>;
  /** the lanes of the building (the horizons a Matrix reads by; null: the epochs) */
  lanes(): Lanes | null;
  /** the container's horizons (the landscape's lanes) */
  landscapeLanes(): Lanes | null;
  lang(): string;
  selected(): string | null;
  select(id: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
  changed(): void;
}

let host: LcHost | null = null;
export function setLandscapeCubeHost(h: LcHost): void { host = h; }

// ── the askers, one per scale ───────────────────────────────────────────────

type Status = "idle" | "loading" | "ok" | "off" | "missing" | "error" | "none";
interface Ask { status: Status; answer: LcAnswer | null; error?: string; stale: boolean;
                sig: string | null; seq: number; timer: ReturnType<typeof setTimeout> | null; tried: number }
const fresh = (): Ask => ({ status: "idle", answer: null, stale: false, sig: null, seq: 0, timer: null, tried: 0 });
const asks: Record<LcScale, Ask> = { building: fresh(), landscape: fresh() };
const DEBOUNCE_MS = 400;
const RETRY_MS = 5000;

export function lcState(scale: LcScale = "building"): Readonly<Ask> { return asks[scale]; }
function lang(): string { return host && host.lang().toLowerCase().startsWith("it") ? "it" : "en"; }

function schedule(scale: LcScale, sig: string, body: () => string): void {
  const a = asks[scale];
  const retry = (a.status === "off" || a.status === "error") && Date.now() - a.tried > RETRY_MS && a.timer == null;
  if (sig === a.sig && !retry) return;
  a.sig = sig;
  if (a.status === "ok") a.stale = true;
  if (a.timer != null) clearTimeout(a.timer);
  const wait = a.status === "idle" || a.status === "none" ? 0 : DEBOUNCE_MS;
  a.timer = setTimeout(() => { a.timer = null; void ask(scale, body()); }, wait);
}

async function ask(scale: LcScale, body: string): Promise<void> {
  if (!host) return;
  const a = asks[scale];
  const mine = ++a.seq;
  a.tried = Date.now();
  if (a.status === "idle" || a.status === "off" || a.status === "none") a.status = "loading";
  let next: Partial<Ask>;
  try {
    const res = await fetch(`${await host.bridge()}/landscape-cube`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    });
    if (res.status === 404) next = { status: "missing", answer: null };
    else if (!res.ok) {
      let msg = `bridge error ${res.status}`;
      try { const j = await res.json(); if (j?.error) msg = String(j.error); } catch { /* not JSON */ }
      next = { status: "error", answer: null, error: msg };
    } else next = { status: "ok", answer: (await res.json()) as LcAnswer, error: undefined };
  } catch {
    next = { status: "off", answer: null };
  }
  if (mine !== a.seq) return;
  Object.assign(a, next, { stale: false });
  host.changed();
}

/** Ask again when what the drawings depend on changed. Cheap otherwise: only
 *  the scales some window shows are asked. */
export function lcAsk(): void {
  if (!host) return;
  const h = host;
  const L = lang();
  const want = new Set([...scaleOf.values()]);
  if (!want.size) want.add("building");
  const act = h.active();
  if (want.has("building") || !h.landscape()) {
    if (!act) {
      const a = asks.building;
      if (a.status !== "none") Object.assign(a, fresh(), { status: "none" });
    } else {
      const lanes = h.lanes();
      const sig = [act.graphId, act.sig, act.path ?? "", JSON.stringify(lanes), L].join("|");
      schedule("building", sig, () =>
        `{"mode":"building","doc":${act.json()},"base":${JSON.stringify(act.path)},` +
        `"lanes":${JSON.stringify(lanes)},"lang":"${L}"}`);
    }
  }
  const land = h.landscape();
  if (!land) {
    const a = asks.landscape;
    if (a.status !== "none") Object.assign(a, fresh(), { status: "none" });
  } else if (want.has("landscape")) {
    const lanes = h.landscapeLanes();
    const srcs = h.sources().filter((s) => s.graphId !== land.graphId);
    const sig = [land.graphId, land.sig, JSON.stringify(land.header().composition ?? null), land.base ?? "",
                 JSON.stringify(lanes), L, ...srcs.map((s) => `${s.graphId}:${s.sig}`)].join("|");
    schedule("landscape", sig, () =>
      `{"mode":"landscape","landscape":${land.json()},"lanes":${JSON.stringify(lanes ?? [])},"lang":"${L}",` +
      `"base":${JSON.stringify(land.base)},` +
      `"sources":[${srcs.map((s) => `{"origin":${JSON.stringify(s.path ?? "open")},"path":${JSON.stringify(s.path)},"doc":${s.json()}}`).join(",")}]}`);
  }
}

/** For a test or a reload: forget the answers. */
export function lcReset(): void {
  for (const k of ["building", "landscape"] as const) {
    if (asks[k].timer != null) clearTimeout(asks[k].timer!);
    asks[k] = fresh();
  }
}

// ── the view of a window: scale, rotation, distance between the planes ─────

export interface LcView { scale: LcScale | null; rot: number; gap: number }
const ROT0 = 45;
const GAP0 = 200;
const viewOf = new Map<string, { rot: number; gap: number }>();
const scaleOf = new Map<string, LcScale>();
export function lcView(winId: string): LcView {
  const v = viewOf.get(winId) ?? { rot: ROT0, gap: GAP0 };
  return { scale: scaleOf.get(winId) ?? null, ...v };
}
export function setLcView(winId: string, v: Partial<LcView>): void {
  const cur = viewOf.get(winId) ?? { rot: ROT0, gap: GAP0 };
  if (v.rot != null && Number.isFinite(v.rot)) cur.rot = ((Math.round(v.rot) % 360) + 360) % 360;
  if (v.gap != null && Number.isFinite(v.gap)) cur.gap = Math.max(60, Math.min(480, Math.round(v.gap)));
  viewOf.set(winId, cur);
  if (v.scale === "building" || v.scale === "landscape") scaleOf.set(winId, v.scale);
  else if (v.scale === null) scaleOf.delete(winId);
  lcAsk();
}
/** the scale a window shows: its choice, else the landscape's when the active
 *  graph IS the landscape, else the building's */
export function lcScaleOf(winId: string): LcScale {
  const chosen = scaleOf.get(winId);
  if (chosen === "landscape" && host?.landscape()) return "landscape";
  if (chosen === "building" && host?.active()) return "building";
  const land = host?.landscape();
  const act = host?.active();
  if (land && (!act || act.graphId === land.graphId)) return "landscape";
  return "building";
}

// ── the drawing ──────────────────────────────────────────────────────────────

const RAIL = 150;          // the planes' names, on the left
const TOP = 24;
const TILT = 0.34;         // how flat a plane looks (1 = seen from above)
const PAD = 0.08;          // the plane beyond the footprints

export interface LcDrawOpts { width: number; rot: number; gap: number; sel: string | null; t: LcHost["t"] }

interface Proj { P(p: [number, number], i: number): [number, number]; height: number; planeH: number }

function projector(bbox: [number, number, number, number], n: number, o: LcDrawOpts): Proj {
  const [x0, y0, x1, y1] = bbox;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const half = Math.max((x1 - x0), (y1 - y0), 1) * (0.5 + PAD);
  const diag = half * Math.SQRT2 * 2;
  const k = Math.max(0.05, (o.width - RAIL - 30) / diag);
  const th = (o.rot * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  const planeH = diag * k * TILT;
  const P = (p: [number, number], i: number): [number, number] => {
    const x = p[0] - cx, y = p[1] - cy;
    const u = x * c - y * s, v = x * s + y * c;
    return [RAIL + 10 + (o.width - RAIL - 30) / 2 + u * k, TOP + planeH / 2 - v * k * TILT + i * o.gap];
  };
  return { P, height: TOP + (n - 1) * o.gap + planeH + 40, planeH };
}

function planeOutline(bbox: [number, number, number, number]): Array<[number, number]> {
  const [x0, y0, x1, y1] = bbox;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const half = Math.max((x1 - x0), (y1 - y0), 1) * (0.5 + PAD);
  return [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]];
}

const pts = (proj: Proj, ring: Array<[number, number]>, i: number): string =>
  ring.map((p) => proj.P(p, i).map((v) => v.toFixed(1)).join(",")).join(" ");

function planeSvg(proj: Proj, bbox: [number, number, number, number], i: number, lane: { lane: string; name: string }, extra: string): string {
  const out = planeOutline(bbox);
  // the label at the plane's leftmost corner
  const corners = out.map((p) => proj.P(p, i));
  const left = corners.reduce((a, b) => (b[0] < a[0] ? b : a));
  return `<g class="lc-plane" data-lc-plane="${esc(lane.lane)}" data-lc-plane-index="${i}">` +
    `<polygon class="lc-plane-face" points="${pts(proj, out, i)}"/>` +
    `<text class="lc-plane-name" x="${(RAIL - 6).toFixed(1)}" y="${(left[1] + 4).toFixed(1)}" text-anchor="end">${esc(fit(lane.name, RAIL - 12, 6.2))}</text>` +
    extra + `</g>`;
}

/** The SVG of the cube of a building (exported for the checks). */
export function lcBuildingSvg(a: LcBuilding, o: LcDrawOpts): string {
  const t = o.t;
  if (!a.bbox) return "";
  const proj = projector(a.bbox, a.planes.length, o);
  const fuSel = o.sel && a.functional_units[o.sel] ? o.sel : null;
  let s = "";
  // the planes, the deepest first (the oldest is drawn last: at the bottom, but
  // the verticals must cross over every plane)
  a.planes.forEach((pl, i) => {
    let items = "";
    for (const it of pl.items) {
      const u = a.units[it.id];
      if (!u) continue;
      const col = evidenceColour(it.reader ? it.evidence : null);
      const sel = o.sel === it.id;
      const lit = !!fuSel && (it.reader === fuSel || it.readers.includes(fuSel));
      const name = u.name + (it.reader ? ` · ${a.functional_units[it.reader]?.name ?? ""}` : "") +
        (it.instance && it.from_lane ? ` · ${t("lc.from", { lane: a.lanes.find((l) => l.id === it.from_lane)?.name ?? it.from_lane })}` : "");
      items += `<g class="lc-fp${sel ? " lc-sel" : ""}${lit ? " lc-lit" : ""}" data-lc-unit="${esc(it.id)}" data-lc-lane="${esc(pl.lane)}"` +
        ` data-lc-evidence="${esc(it.reader ? it.evidence ?? "symbol" : "none")}" data-lc-reader="${esc(it.reader ?? "")}"` +
        `${it.instance ? ` data-lc-instance="${esc(it.from_lane ?? "")}"` : ""}>` +
        u.rings.map((r) => `<polygon points="${pts(proj, r, i)}" fill="${col}" fill-opacity="${it.instance ? 0.07 : 0.16}"` +
          ` stroke="${col}" stroke-width="${sel || lit ? 2.4 : 0.9}"${it.instance ? ' stroke-dasharray="3 2"' : ""}/>`).join("") +
        `<title>${esc(name)}</title></g>`;
    }
    s += planeSvg(proj, a.bbox!, i, pl, items);
  });
  // the verticals: from the plane where the unit is lowest to the highest
  const idx = new Map(a.planes.map((p, i) => [p.lane, i]));
  for (const v of a.verticals) {
    const u = a.units[v.id];
    if (!u) continue;
    const is = v.lanes.map((l) => idx.get(l)).filter((x): x is number => x != null);
    if (is.length < 2) continue;
    const top = proj.P(u.centroid, Math.min(...is));
    const bot = proj.P(u.centroid, Math.max(...is));
    s += `<g class="lc-vertical${o.sel === v.id ? " lc-sel" : ""}" data-lc-vertical="${esc(v.id)}" data-lc-unit="${esc(v.id)}">` +
      `<line x1="${top[0].toFixed(1)}" y1="${top[1].toFixed(1)}" x2="${bot[0].toFixed(1)}" y2="${bot[1].toFixed(1)}"/>` +
      `<line class="lc-hit" x1="${top[0].toFixed(1)}" y1="${top[1].toFixed(1)}" x2="${bot[0].toFixed(1)}" y2="${bot[1].toFixed(1)}"/>` +
      `<text x="${(top[0] + 4).toFixed(1)}" y="${(top[1] - 4).toFixed(1)}">${esc(u.name)}</text><title>${esc(t("lc.vertical", { unit: u.name }))}</title></g>`;
  }
  return `<svg class="lc-svg" xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${proj.height.toFixed(0)}"` +
    ` viewBox="0 0 ${o.width} ${proj.height.toFixed(0)}" role="img" aria-label="${esc(t("feat.landscapeCube.title"))}">${s}</svg>`;
}

/** The SVG of the cube of a landscape (exported for the checks). */
export function lcLandscapeSvg(a: LcLandscape, o: LcDrawOpts): string {
  const t = o.t;
  const bbox = a.bbox ?? [0, 0, 100, 100];
  const proj = projector(bbox as [number, number, number, number], a.planes.length, o);
  let s = "";
  a.planes.forEach((pl, i) => {
    let items = "";
    let sym = 0;
    const out = planeOutline(bbox as [number, number, number, number]).map((p) => proj.P(p, i));
    const front = out.reduce((m, p) => (p[1] > m[1] ? p : m));
    for (const it of pl.items) {
      const r = a.rows[it.id];
      if (!r) continue;
      const sel = o.sel === it.id;
      const col = evidenceColour(it.evidence);
      if (it.kind === "footprint") {
        const rings = a.shapes[it.id]?.rings_by_lane[pl.lane] ?? [];
        items += `<g class="lc-fp${sel ? " lc-sel" : ""}" data-lc-unit="${esc(it.id)}" data-lc-lane="${esc(pl.lane)}" data-lc-evidence="${esc(it.evidence ?? "symbol")}" data-lc-kind="footprint">` +
          rings.map((rg) => `<polygon points="${pts(proj, rg, i)}" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="${sel ? 2.4 : 1}"/>`).join("") +
          `<title>${esc(r.name)}</title></g>`;
      } else {
        // a symbol in the plane's margin, in a row under its front corner
        const x = front[0] - 160 + (sym % 12) * 28, y = front[1] + 14 + Math.floor(sym / 12) * 22;
        sym++;
        const shape = r.kind === "ut"
          ? `<path d="M${x - 6},${y} l3,-5 h6 l3,5 l-3,5 h-6z" fill="#fff" stroke="${col}"/>`
          : `<circle cx="${x}" cy="${y}" r="6" fill="#fff" stroke="${col}" stroke-dasharray="${it.evidence === "symbol" ? "2 2" : "0"}"/>`;
        items += `<g class="lc-sym${sel ? " lc-sel" : ""}" data-lc-unit="${esc(it.id)}" data-lc-lane="${esc(pl.lane)}" data-lc-kind="symbol"` +
          ` data-lc-why="${esc(it.why ?? "")}" data-lc-evidence="${esc(it.evidence ?? "symbol")}">${shape}` +
          `<title>${esc(`${r.name} · ${t(it.why === "no_outline" ? "lc.why.noOutline" : "lc.why.noMembers")}`)}</title></g>`;
      }
    }
    s += planeSvg(proj, bbox as [number, number, number, number], i, pl, items);
  });
  const idx = new Map(a.planes.map((p, i) => [p.lane, i]));
  for (const v of a.verticals) {
    const rings = Object.values(a.shapes[v.id]?.rings_by_lane ?? {}).flat();
    if (!rings.length) continue;
    const all = rings.flat();
    const c: [number, number] = [all.reduce((m, p) => m + p[0], 0) / all.length, all.reduce((m, p) => m + p[1], 0) / all.length];
    const is = v.lanes.map((l) => idx.get(l)).filter((x): x is number => x != null);
    const top = proj.P(c, Math.min(...is)), bot = proj.P(c, Math.max(...is));
    s += `<g class="lc-vertical" data-lc-vertical="${esc(v.id)}" data-lc-unit="${esc(v.id)}"><line x1="${top[0].toFixed(1)}" y1="${top[1].toFixed(1)}" x2="${bot[0].toFixed(1)}" y2="${bot[1].toFixed(1)}"/>` +
      `<line class="lc-hit" x1="${top[0].toFixed(1)}" y1="${top[1].toFixed(1)}" x2="${bot[0].toFixed(1)}" y2="${bot[1].toFixed(1)}"/></g>`;
  }
  const h = proj.height + 50;
  return `<svg class="lc-svg" xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${h.toFixed(0)}"` +
    ` viewBox="0 0 ${o.width} ${h.toFixed(0)}" role="img" aria-label="${esc(t("feat.landscapeCube.title"))}">${s}</svg>`;
}

function note(key: string, vars: Record<string, string | number> | undefined, state: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "fm-note";
  p.dataset.lcState = state;
  p.textContent = host ? host.t(key, vars) : key;
  return p;
}

function slider(winId: string, kind: "rot" | "gap", value: number, min: number, max: number, label: string): HTMLElement {
  const lab = document.createElement("label");
  lab.className = "lc-ctl";
  const span = document.createElement("span");
  span.textContent = label;
  const inp = document.createElement("input");
  inp.type = "range";
  inp.min = String(min);
  inp.max = String(max);
  inp.step = kind === "rot" ? "5" : "10";
  inp.value = String(value);
  inp.dataset[kind === "rot" ? "lcRot" : "lcGap"] = "";
  inp.addEventListener("input", () => {
    setLcView(winId, kind === "rot" ? { rot: Number(inp.value) } : { gap: Number(inp.value) });
    host?.changed();
  });
  lab.append(span, inp);
  return lab;
}

/** The area «Cube». */
export function renderLandscapeCubeInto(body: HTMLElement, winId: string): void {
  if (!host) return;
  const h = host;
  const t = h.t;
  const scale = lcScaleOf(winId);
  if (!scaleOf.has(winId)) scaleOf.set(winId, scale);
  lcAsk();
  body.textContent = "";
  body.classList.add("fm-body", "lc-body");
  body.dataset.lcScale = scale;
  const v = lcView(winId);
  const head = document.createElement("div");
  head.className = "fm-head lc-head";
  if (h.landscape() && h.active()) {
    const sel = document.createElement("select");
    sel.dataset.lcScaleSelect = "";
    for (const k of ["building", "landscape"] as const) {
      const op = document.createElement("option");
      op.value = k;
      op.textContent = t(`lc.scale.${k}`);
      op.selected = k === scale;
      sel.appendChild(op);
    }
    sel.addEventListener("change", () => { setLcView(winId, { scale: sel.value as LcScale }); h.changed(); });
    head.appendChild(sel);
  }
  head.append(slider(winId, "rot", v.rot, 0, 355, t("lc.rotate")), slider(winId, "gap", v.gap, 60, 480, t("lc.gap")));
  body.appendChild(head);
  if (scale === "building" && !h.active()) { body.appendChild(note("lc.noDoc", undefined, "none")); return; }
  const st = asks[scale];
  if (st.status === "missing") { body.appendChild(note("lc.missing", undefined, "missing")); return; }
  if (st.status === "off") { body.appendChild(note("fm.off", undefined, "off")); return; }
  if (st.status === "error") { body.appendChild(note("fm.error", { why: st.error ?? "" }, "error")); return; }
  const a = st.answer;
  if (!a || a.scale !== scale) { body.appendChild(note("fm.loading", undefined, "loading")); return; }
  if (st.stale) head.classList.add("fm-stale");
  const legend = document.createElement("div");
  legend.className = "fm-legend";
  const sw = (ev: Evidence) => `<span class="fm-sw" style="border-color:${evidenceColour(ev)}${ev === "symbol" ? ";border-style:dotted" : ""}"></span>`;
  legend.innerHTML = (["stratigraphic", "documentary", "reconstructive", "symbol"] as Evidence[])
    .map((ev) => `<span class="fm-legend-item" data-fm-legend="${ev}">${sw(ev)}${esc(t(ev === "symbol" && scale === "building" ? "lc.legend.unread" : `fm.ev.${ev}`))}</span>`).join("") +
    `<span class="fm-legend-item"><span class="fm-sw lc-sw-inst"></span>${esc(t("lc.legend.instance"))}</span>` +
    `<span class="fm-legend-item"><span class="lc-sw-vert"></span>${esc(t("lc.legend.vertical"))}</span>`;
  const count = document.createElement("span");
  count.className = "fm-count-line";
  if (a.scale === "building") {
    const without = new Set(a.planes.flatMap((p) => p.without));
    count.dataset.lcFootprints = String(Object.keys(a.units).length);
    count.textContent = t("lc.count", { n: Object.keys(a.units).length, p: a.planes.length, w: without.size });
  } else {
    const fps = a.planes.flatMap((p) => p.items).filter((i) => i.kind === "footprint").length;
    const syms = a.planes.flatMap((p) => p.items).filter((i) => i.kind === "symbol").length;
    count.dataset.lcFootprints = String(fps);
    count.textContent = t("lc.countLandscape", { n: fps, s: syms, p: a.planes.length });
  }
  head.append(count, legend);
  if (a.scale === "building" && !Object.keys(a.units).length) {
    body.appendChild(note(a.proxies?.folder ? "lc.noProxies" : "lc.noFolder", undefined, "empty"));
    return;
  }
  if (a.scale === "landscape" && !a.planes.length) { body.appendChild(note("lc.noLanes", undefined, "empty")); return; }
  const wrap = document.createElement("div");
  wrap.className = "fm-scroll lc-scroll";
  const width = Math.max(360, (body.clientWidth || 760) - 8);
  const o: LcDrawOpts = { width, rot: v.rot, gap: v.gap, sel: h.selected(), t };
  wrap.innerHTML = a.scale === "building" ? lcBuildingSvg(a, o) : lcLandscapeSvg(a, o);
  body.appendChild(wrap);
  const foot = document.createElement("p");
  foot.className = "fm-note lc-foot";
  foot.textContent = a.scale === "building"
    ? t("lc.foot", { v: a.verticals.map((x) => a.units[x.id]?.name ?? x.id).join(", ") || "—" }) +
      (a.proxies?.stale.length ? " " + t("lc.stale", { n: a.proxies.stale.length }) : "")
    : t("lc.footLandscape");
  body.appendChild(foot);
  wrap.addEventListener("click", (ev) => {
    const el = (ev.target as Element).closest<SVGElement>("[data-lc-unit]");
    if (!el) return;
    const id = el.getAttribute("data-lc-unit")!;
    if (h.active()?.has(id)) h.select(id);
  });
}

/** The answer a window shows, for a test or a script. */
export function lcAnswerOf(winId: string): { scale: LcScale; state: Readonly<Ask>; view: LcView } {
  const scale = lcScaleOf(winId);
  return { scale, state: asks[scale], view: lcView(winId) };
}
