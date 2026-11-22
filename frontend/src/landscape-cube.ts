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
 * MICRO-MF07 (E.D., 22 Nov 2026: «il simbolico è potente ma devono poterci
 * essere tutti e tre»; «poco fluido e inusabile così») · FOUR LAYERS that can be
 * laid over each other, each with its own switch: SYMBOLIC (per functional unit
 * the hull of its members' footprints, colour = evidence, a container dashed,
 * the name between braces, the chains of transformation between the planes) ·
 * PLAN (the footprints in line) · PROXY (the footprints extruded by the true
 * height of the glb) · MODELS (the representation model of the epoch, cut to
 * what was VISIBLE then — MICRO-LG4: a mask of the buried units). The TURNTABLE:
 * the geometry is built once per answer, RELATIVE TO THE CENTRE of the
 * horizons' footprints (no big coordinates in the transforms), and a drag
 * changes nothing but the affine transform of each plane (requestAnimationFrame,
 * inertia at the release, the tilt with the vertical drag, the distance
 * between the planes with the wheel). The fit: centred on the envelope of the
 * footprints (the far outliers left out of the fit), scaled to the area, the
 * planes close (short verticals). And the PLAN BY HORIZON (`renderFunctional
 * PlanInto`, the «Space» of the workspace Functional): the same answer seen
 * from above, one horizon at a time, the lasso of MF05 on it.
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
/** MICRO-LG4 · how a unit is seen in a plane */
export type LcSeen = "exposed" | "buried" | "partially_exposed" | "undetermined";
export interface LcItem {
  id: string; reader: string | null; readers: string[]; evidence: Evidence | null;
  instance: boolean; from_lane: string | null;
  /** MICRO-MF07 · its visibility in the plane (s3Dgraphy before MF07: absent) */
  visibility?: LcSeen;
}
/** MICRO-MF07 · the symbolic layer: the hull of a functional unit's members in a plane */
export interface LcSymbol { fu: string; name: string; ring: Ring; evidence: Evidence | null; container: boolean; parent: string | null; members: string[] }
/** MICRO-MF07 · a representation model of the plane's epochs, in plan */
export interface LcModel { id: string; name: string; epoch: string; rings: Ring[]; z_range: [number, number] | null; url: string | null }
export interface LcPlane {
  lane: string; name: string; start: number | null; end: number | null; items: LcItem[]; without: string[];
  symbols?: LcSymbol[]; rm?: LcModel[]; rm_unread?: Array<{ id: string; name: string; url: string | null; why: string; epoch?: string }>;
}
export interface LcUnit {
  name: string; type: string | null; rings: Ring[]; centroid: [number, number]; lane: string | null;
  lanes: string[]; source: string | null; stale: boolean; z_range?: [number, number] | null;
}
export interface LcBuilding {
  scale: "building"; lanes: Lane[]; planes: LcPlane[]; units: Record<string, LcUnit>;
  verticals: Array<{ id: string; lanes: string[] }>; bbox: [number, number, number, number] | null; crs: string[];
  functional_units: Record<string, { name: string; scale: string | null; parent?: string | null }>;
  proxies?: { folder: string | null; read: number; stale: string[] };
  /** MICRO-MF07 · the chain of identities between the planes */
  chains?: Array<{ latter: string; former: string; change_type: string | null }>;
  models?: { read: number; unread: number };
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
  /** MICRO-MF07 · what is lit everywhere (the selection, a proposal shown) */
  lit?(): ReadonlySet<string>;
  /** MICRO-MF07 · the lasso of the plan closed on these units (the jar, MF05) */
  lasso?(units: string[]): void;
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

// ── the view of a window: scale, rotation, tilt, distance, layers ───────────

/** MICRO-MF07 · the four layers of the cube, each with its switch */
export type LcLayer = "sym" | "plan" | "prx" | "rm";
export const LC_LAYERS: readonly LcLayer[] = ["sym", "plan", "prx", "rm"];
export interface LcView {
  scale: LcScale | null; rot: number; gap: number | null; tilt: number;
  layers: Record<LcLayer, boolean>;
}
const ROT0 = 30;
const TILT0 = 0.34;
const TILT_MIN = 0.1, TILT_MAX = 0.62;
const GAP_MIN = 12, GAP_MAX = 600;
/** the automatic distance between the planes: this share of a plane's height */
const GAP_AUTO = 0.65;
interface ViewState { rot: number; gap: number | null; tilt: number; layers: Record<LcLayer, boolean> }
const view0 = (): ViewState => ({ rot: ROT0, gap: null, tilt: TILT0, layers: { sym: true, plan: true, prx: false, rm: false } });
const viewOf = new Map<string, ViewState>();
const scaleOf = new Map<string, LcScale>();
function vs(winId: string): ViewState {
  let v = viewOf.get(winId);
  if (!v) { v = view0(); viewOf.set(winId, v); }
  return v;
}
export function lcView(winId: string): LcView {
  const v = vs(winId);
  return { scale: scaleOf.get(winId) ?? null, rot: v.rot, gap: v.gap, tilt: v.tilt, layers: { ...v.layers } };
}
const normRot = (r: number): number => ((r % 360) + 360) % 360;
export function setLcView(winId: string, v: Partial<Omit<LcView, "layers">> & { layers?: Partial<Record<LcLayer, boolean>> }): void {
  const cur = vs(winId);
  if (v.rot != null && Number.isFinite(v.rot)) cur.rot = normRot(v.rot);
  if (v.gap === null) cur.gap = null;
  else if (v.gap != null && Number.isFinite(v.gap)) cur.gap = Math.max(GAP_MIN, Math.min(GAP_MAX, v.gap));
  if (v.tilt != null && Number.isFinite(v.tilt)) cur.tilt = Math.max(TILT_MIN, Math.min(TILT_MAX, v.tilt));
  if (v.layers) for (const k of LC_LAYERS) if (typeof v.layers[k] === "boolean") cur.layers[k] = v.layers[k]!;
  if (v.scale === "building" || v.scale === "landscape") scaleOf.set(winId, v.scale);
  else if (v.scale === null) scaleOf.delete(winId);
  const live = lives.get(winId);
  if (live && (v.rot != null || v.tilt != null || v.gap !== undefined) && !v.layers && v.scale === undefined) live.apply();
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

// ── the geometry: built once per answer, relative to the centre ─────────────

type P2 = [number, number];
/** a polygon of a plane, in metres RELATIVE TO THE CENTRE (y north) */
interface GPoly { ring: P2[]; attrs: string; layer: LcLayer | "face" | "land"; mask?: boolean }
/** an extruded footprint (the layer «Proxy») */
interface GTop { ring: P2[]; h: number; colour: string; attrs: string; edges: P2[] }
/** a label anchored to a point of a plane */
interface GLabel { at: P2; text: string; cls: string; attrs: string; layer: LcLayer | "always"; dy?: number }
interface GPlane { lane: string; name: string; polys: GPoly[]; tops: GTop[]; labels: GLabel[]; buried: P2[][]; symbols: GLabel[] }
interface GLink { a: { i: number; at: P2 }; b: { i: number; at: P2 }; cls: string; attrs: string; layer: LcLayer | "always"; label?: string; title?: string }
export interface LcGeometry {
  centre: P2; radius: number; half: P2; planes: GPlane[]; links: GLink[]; outliers: string[];
  rmUnread: number; rmRead: number;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const centroidOf = (ring: ReadonlyArray<P2>): P2 => {
  const n = ring.length || 1;
  return [ring.reduce((m, p) => m + p[0], 0) / n, ring.reduce((m, p) => m + p[1], 0) / n];
};
const areaOf = (ring: ReadonlyArray<P2>): number => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
};

/** The frame of a set of footprints: the centre of their envelope and its
 *  half sizes, the FAR OUTLIERS left out (a footprint beyond four times the
 *  median distance from the median centre, at least 25 m: a proxy in another
 *  frame would shrink everything into a corner). Exported for the checks. */
export function lcFrame(items: ReadonlyArray<{ id: string; rings: ReadonlyArray<ReadonlyArray<P2>> }>): { centre: P2; half: P2; outliers: string[] } {
  const cs = items.filter((u) => u.rings.length && u.rings[0].length).map((u) => ({ id: u.id, c: centroidOf(u.rings.flat() as P2[]) }));
  if (!cs.length) return { centre: [0, 0], half: [10, 10], outliers: [] };
  const mx = median(cs.map((x) => x.c[0])), my = median(cs.map((x) => x.c[1]));
  const d = cs.map((x) => Math.hypot(x.c[0] - mx, x.c[1] - my));
  const thr = Math.max(25, 4 * median(d));
  const out = new Set(cs.filter((_x, i) => d[i] > thr).map((x) => x.id));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const u of items) {
    if (out.has(u.id)) continue;
    for (const r of u.rings) for (const p of r) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  }
  if (!Number.isFinite(x0)) return { centre: [mx, my], half: [10, 10], outliers: [...out] };
  return { centre: [(x0 + x1) / 2, (y0 + y1) / 2], half: [Math.max(1, (x1 - x0) / 2), Math.max(1, (y1 - y0) / 2)], outliers: [...out] };
}

const rel = (ring: ReadonlyArray<ReadonlyArray<number>>, c: P2): P2[] => ring.map((p) => [r2(p[0] - c[0]), r2(p[1] - c[1])] as P2);
const ptsOf = (ring: ReadonlyArray<P2>): string => ring.map((p) => `${p[0]},${p[1]}`).join(" ");
const PAD = 0.08;
const BIG_M2 = 250;   // a footprint this large is drawn in line only (it would hide the small ones)

function seenOf(it: LcItem): LcSeen { return it.visibility ?? "undetermined"; }

/** The geometry of a building's cube (exported for the checks). */
export function lcBuildingGeometry(a: LcBuilding, t: LcHost["t"]): LcGeometry {
  const fr = lcFrame(Object.entries(a.units).map(([id, u]) => ({ id, rings: u.rings as P2[][] })));
  const c = fr.centre;
  const hx = fr.half[0] * (1 + PAD), hy = fr.half[1] * (1 + PAD);
  const face: P2[] = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map((p) => [r2(p[0]), r2(p[1])] as P2);
  const symAt = new Map<string, { i: number; at: P2 }>();
  const planes: GPlane[] = a.planes.map((pl, i) => {
    const polys: GPoly[] = [{ ring: face, attrs: `class="lc-plane-face"`, layer: "face" }];
    const tops: GTop[] = [];
    const labels: GLabel[] = [];
    const buried: P2[][] = [];
    for (const it of pl.items) {
      const u = a.units[it.id];
      if (!u) continue;
      const seen = seenOf(it);
      const col = evidenceColour(it.reader ? it.evidence : null);
      const name = u.name + (it.reader ? ` · ${a.functional_units[it.reader]?.name ?? ""}` : "") +
        (it.instance && it.from_lane ? ` · ${t("lc.from", { lane: a.lanes.find((l) => l.id === it.from_lane)?.name ?? it.from_lane })}` : "") +
        ` · ${t(`lc.seen.${seen}`)}`;
      const data = `data-lc-unit="${esc(it.id)}" data-lc-lane="${esc(pl.lane)}" data-lc-evidence="${esc(it.reader ? it.evidence ?? "symbol" : "none")}"` +
        ` data-lc-reader="${esc(it.reader ?? "")}" data-lc-seen="${seen}"${it.instance ? ` data-lc-instance="${esc(it.from_lane ?? "")}"` : ""}`;
      for (const ring of u.rings) {
        const rr = rel(ring, c);
        if (seen === "buried") buried.push(rr);
        // PLAN · the footprints in line (ink); buried thin and hatched
        polys.push({ ring: rr, layer: "plan", attrs: `class="lc-fp" ${data} stroke="${col}"` +
          ` fill="${seen === "buried" ? "url(#lc-hatch-m)" : "none"}" stroke-width="${seen === "buried" ? 0.5 : it.instance ? 0.7 : 1}"` +
          `${it.instance ? ' stroke-dasharray="3 2"' : ""}><title>${esc(name)}</title` });
        // PROXY · extruded by the true height of the glb
        const z = u.z_range;
        const hgt = z ? Math.max(0.2, Math.min(40, z[1] - z[0])) : 0.5;
        const n = rr.length;
        const step = Math.max(1, Math.ceil(n / 8));
        tops.push({ ring: rr, h: hgt, colour: col, edges: rr.filter((_p, j) => j % step === 0),
                    attrs: `${data} fill="${col}" fill-opacity="${areaOf(rr) > BIG_M2 ? 0.04 : it.reader ? 0.3 : 0.12}" stroke="${col}"` +
                      `${seen === "buried" ? ' stroke-dasharray="2 2"' : ""}` });
      }
    }
    // SYMBOLIC · the hull of the members per functional unit
    for (const s of pl.symbols ?? []) {
      const rr = rel(s.ring, c);
      if (rr.length < 3) continue;
      const col = evidenceColour(s.evidence);
      polys.push({ ring: rr, layer: "sym", attrs: `class="lc-sym-hull" data-lc-fu="${esc(s.fu)}" data-lc-lane="${esc(pl.lane)}"` +
        ` data-lc-evidence="${esc(s.evidence ?? "symbol")}"${s.container ? ' data-lc-container=""' : ""} fill="${col}"` +
        ` fill-opacity="${s.container ? 0.05 : 0.14}" stroke="${col}" stroke-width="1.5"${s.container ? ' stroke-dasharray="6 3"' : ""}` +
        `><title>${esc(`${s.name} · ${s.members.length}`)}</title` });
      const at = centroidOf(rr);
      symAt.set(`${s.fu}@${i}`, { i, at });
      if (!symAt.has(s.fu)) symAt.set(s.fu, { i, at });
      labels.push({ at, text: `{ ${fit(s.name.split(" (")[0], 150, 5.4)} }`, cls: "lc-sym-name", layer: "sym",
                    attrs: `data-lc-fu="${esc(s.fu)}"`, dy: s.container ? -10 : 0 });
    }
    // MODELS · the representation models of the epoch, masked by the buried
    for (const m of pl.rm ?? []) {
      for (const ring of m.rings) {
        polys.push({ ring: rel(ring, c), layer: "rm", mask: true, attrs: `class="lc-rm" data-lc-rm="${esc(m.id)}" data-lc-lane="${esc(pl.lane)}"` +
          ` fill="url(#lc-rm-m)" stroke="currentColor" stroke-width="0.6"><title>${esc(`${m.name} · ${t("lc.rmTitle")}`)}</title` });
      }
    }
    return { lane: pl.lane, name: pl.name, polys, tops, labels, buried, symbols: [] };
  });
  const links: GLink[] = [];
  const idx = new Map(a.planes.map((p, i) => [p.lane, i]));
  for (const v of a.verticals) {
    const u = a.units[v.id];
    if (!u) continue;
    const is = v.lanes.map((l) => idx.get(l)).filter((x): x is number => x != null);
    if (is.length < 2) continue;
    const at = rel([u.centroid], c)[0];
    links.push({ a: { i: Math.min(...is), at }, b: { i: Math.max(...is), at }, cls: "lc-vertical", layer: "always",
                 attrs: `data-lc-vertical="${esc(v.id)}" data-lc-unit="${esc(v.id)}"`, label: u.name, title: t("lc.vertical", { unit: u.name }) });
  }
  // the chains of transformation between the planes (symbolic layer)
  for (const ch of a.chains ?? []) {
    const fa = [...symAt.entries()].find(([k]) => k.startsWith(`${ch.latter}@`))?.[1];
    const fb = [...symAt.entries()].find(([k]) => k.startsWith(`${ch.former}@`))?.[1];
    if (!fa || !fb || fa.i === fb.i) continue;
    links.push({ a: fa, b: fb, cls: "lc-chain", layer: "sym", attrs: `data-lc-chain="${esc(ch.latter)}>${esc(ch.former)}"`,
                 label: ch.change_type ?? undefined,
                 title: `${a.functional_units[ch.former]?.name ?? ch.former} → ${a.functional_units[ch.latter]?.name ?? ch.latter}` });
  }
  const unread = a.planes.reduce((m, p) => m + (p.rm_unread?.length ?? 0), 0);
  const read = a.planes.reduce((m, p) => m + (p.rm?.length ?? 0), 0);
  return { centre: c, radius: Math.hypot(hx, hy), half: [hx, hy], planes, links, outliers: fr.outliers, rmUnread: unread, rmRead: read };
}

/** The geometry of a landscape's cube (exported for the checks). */
export function lcLandscapeGeometry(a: LcLandscape, t: LcHost["t"]): LcGeometry {
  const items = Object.entries(a.shapes).map(([id, s]) => ({ id, rings: Object.values(s.rings_by_lane).flat() as P2[][] }));
  const fr = lcFrame(items);
  const c = fr.centre;
  const hx = fr.half[0] * (1 + PAD), hy = fr.half[1] * (1 + PAD);
  const face: P2[] = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map((p) => [r2(p[0]), r2(p[1])] as P2);
  const planes: GPlane[] = a.planes.map((pl) => {
    const polys: GPoly[] = [{ ring: face, attrs: `class="lc-plane-face"`, layer: "face" }];
    const symbols: GLabel[] = [];
    for (const it of pl.items) {
      const r = a.rows[it.id];
      if (!r) continue;
      const col = evidenceColour(it.evidence);
      if (it.kind === "footprint") {
        for (const rg of a.shapes[it.id]?.rings_by_lane[pl.lane] ?? []) {
          polys.push({ ring: rel(rg, c), layer: "land", attrs: `class="lc-fp" data-lc-unit="${esc(it.id)}" data-lc-lane="${esc(pl.lane)}"` +
            ` data-lc-evidence="${esc(it.evidence ?? "symbol")}" data-lc-kind="footprint" fill="${col}" fill-opacity="0.16" stroke="${col}"` +
            ` stroke-width="1"><title>${esc(r.name)}</title` });
        }
      } else {
        symbols.push({ at: [-hx, -hy], text: r.kind, cls: "lc-sym", layer: "always",
                       attrs: `data-lc-unit="${esc(it.id)}" data-lc-lane="${esc(pl.lane)}" data-lc-kind="symbol" data-lc-why="${esc(it.why ?? "")}"` +
                         ` data-lc-evidence="${esc(it.evidence ?? "symbol")}" data-col="${col}" data-title="${esc(`${r.name} · ${t(it.why === "no_outline" ? "lc.why.noOutline" : "lc.why.noMembers")}`)}"` });
      }
    }
    return { lane: pl.lane, name: pl.name, polys, tops: [], labels: [], buried: [], symbols };
  });
  const idx = new Map(a.planes.map((p, i) => [p.lane, i]));
  const links: GLink[] = [];
  for (const v of a.verticals) {
    const rings = Object.values(a.shapes[v.id]?.rings_by_lane ?? {}).flat();
    if (!rings.length) continue;
    const at = rel([centroidOf(rings.flat() as P2[])], c)[0];
    const is = v.lanes.map((l) => idx.get(l)).filter((x): x is number => x != null);
    if (is.length < 2) continue;
    links.push({ a: { i: Math.min(...is), at }, b: { i: Math.max(...is), at }, cls: "lc-vertical", layer: "always",
                 attrs: `data-lc-vertical="${esc(v.id)}" data-lc-unit="${esc(v.id)}"` });
  }
  return { centre: c, radius: Math.hypot(hx, hy), half: [hx, hy], planes, links, outliers: fr.outliers, rmUnread: 0, rmRead: 0 };
}

// ── the projection: one affine transform per plane ──────────────────────────

const RAIL = 130;          // the planes' names, on the left
const TOP = 26;

export interface LcFit { k: number; gap: number; ox: number; oy: number; planeH: number; width: number; height: number }

/** The scale and the distance between the planes for an area `width` ×
 *  `height`: the rotated plane fits the width, the stack fits the height, the
 *  planes as close as `GAP_AUTO` of a plane's height (short verticals) unless
 *  the window chose a distance. Exported for the checks. */
export function lcFit(g: Pick<LcGeometry, "radius" | "planes">, width: number, height: number, v: Pick<LcView, "tilt" | "gap">): LcFit {
  const n = Math.max(1, g.planes.length);
  const r = Math.max(1, g.radius);
  const kw = Math.max(0.02, (width - RAIL - 24) / (2 * r));
  const avail = Math.max(120, height - TOP - 34);
  let k: number;
  if (v.gap == null) k = Math.min(kw, avail / (2 * r * v.tilt * (1 + GAP_AUTO * (n - 1))));
  else k = Math.min(kw, Math.max(kw * 0.2, (avail - (n - 1) * v.gap) / (2 * r * v.tilt)));
  k = Math.max(kw * 0.2, k);
  const planeH = 2 * r * k * v.tilt;
  const gap = v.gap ?? Math.max(GAP_MIN, planeH * GAP_AUTO);
  const h = TOP + planeH + (n - 1) * gap + 34;
  return { k, gap, ox: RAIL + 12 + (width - RAIL - 24) / 2, oy: TOP + planeH / 2, planeH, width, height: Math.max(h, 120) };
}

/** the affine transform of plane `i`: metres relative to the centre → pixels */
export function lcMatrix(f: LcFit, rotDeg: number, tilt: number, i: number, lift = 0): [number, number, number, number, number, number] {
  const th = (rotDeg * Math.PI) / 180;
  const cs = Math.cos(th), sn = Math.sin(th);
  return [f.k * cs, -f.k * tilt * sn, -f.k * sn, -f.k * tilt * cs, f.ox, f.oy + i * f.gap - lift];
}
const apply = (m: ReturnType<typeof lcMatrix>, p: P2): P2 => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const mat = (m: ReturnType<typeof lcMatrix>): string => `matrix(${m.map((x) => x.toFixed(4)).join(" ")})`;

// ── the drawing ──────────────────────────────────────────────────────────────

export interface LcDrawOpts {
  width: number; height?: number; rot: number; gap: number | null; tilt?: number; sel: string | null;
  t: LcHost["t"]; layers?: Record<LcLayer, boolean>; lit?: ReadonlySet<string>; win?: string;
}

const DEFS = (win: string): string =>
  `<defs><pattern id="lc-hatch-m" width="0.7" height="0.7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
  `<line x1="0" y1="0" x2="0" y2="0.7" class="lc-hatch-line" stroke-width="0.12"/></pattern>` +
  `<pattern id="lc-rm-m" width="0.9" height="0.9" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">` +
  `<line x1="0" y1="0" x2="0" y2="0.9" class="lc-rm-line" stroke-width="0.1"/></pattern>` +
  `<pattern id="lc-hatch-px" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
  `<line x1="0" y1="0" x2="0" y2="5" class="lc-hatch-line" stroke-width="1"/></pattern>` +
  `<!--${esc(win)}--></defs>`;

/** The whole SVG of a cube, from its geometry (exported for the checks): the
 *  planes as groups with ONE transform each; what lives in screen space (the
 *  extrusions' edges, the verticals, the chains, the names) in a layer the
 *  turntable updates by arithmetic. */
export function lcSvg(g: LcGeometry, o: LcDrawOpts): { svg: string; fit: LcFit } {
  const tilt = o.tilt ?? TILT0;
  const L = o.layers ?? view0().layers;
  const f = lcFit(g, o.width, o.height ?? 99999, { tilt, gap: o.gap });
  const lit = o.lit ?? new Set<string>();
  const win = o.win ?? "x";
  const on = (l: LcLayer | "face" | "land" | "always"): boolean => l === "face" || l === "land" || l === "always" || !!L[l];
  const isSel = (attrs: string): string => {
    const m = /data-lc-(?:unit|fu)="([^"]+)"/.exec(attrs);
    if (!m) return "";
    const id = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    return o.sel === id ? " lc-sel" : lit.has(id) ? " lc-lit" : "";
  };
  const cls = (attrs: string, extra: string): string => attrs.includes('class="')
    ? attrs.replace(/class="([^"]*)"/, (_m, c) => `class="${c}${extra}"`) : `class="${extra.trim()}" ${attrs}`;
  let planes = "";
  let tops = "";
  // the oldest (the lowest) first: the newer planes are painted over it
  for (let i = g.planes.length - 1; i >= 0; i--) {
    const p = g.planes[i];
    const m = lcMatrix(f, o.rot, tilt, i);
    let inner = "";
    let masked = "";
    for (const q of p.polys) {
      if (!on(q.layer)) continue;
      const fuLit = q.layer === "plan" && o.sel && /data-lc-reader="([^"]+)"/.exec(q.attrs)?.[1] === o.sel ? " lc-lit" : "";
      const el = `<polygon points="${ptsOf(q.ring)}" vector-effect="non-scaling-stroke" ${cls(q.attrs, isSel(q.attrs) || fuLit)}></polygon>`;
      if (q.mask) masked += el; else inner += el;
    }
    if (masked) {
      inner = inner.replace(/^(<polygon[^>]*lc-plane-face[^>]*><\/polygon>)/, `$1<g class="lc-layer-rm" mask="url(#lc-mask-${esc(win)}-${i})">${masked}</g>`);
    }
    const mask = L.rm && p.buried.length
      ? `<mask id="lc-mask-${esc(win)}-${i}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">` +
        `<rect x="-100000" y="-100000" width="200000" height="200000" fill="#fff"/>${p.buried.map((r) => `<polygon points="${ptsOf(r)}" fill="#000"/>`).join("")}</mask>`
      : L.rm ? `<mask id="lc-mask-${esc(win)}-${i}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000"><rect x="-100000" y="-100000" width="200000" height="200000" fill="#fff"/></mask>` : "";
    planes += `<g class="lc-plane" data-lc-plane="${esc(p.lane)}" data-lc-plane-index="${i}" transform="${mat(m)}">${mask}${inner}</g>`;
    if (L.prx) {
      for (const tp of p.tops) {
        const lift = tp.h * f.k * Math.sqrt(1 - tilt * tilt);
        tops += `<g class="lc-top" data-lc-plane-index="${i}" data-lc-h="${tp.h.toFixed(2)}" transform="${mat(lcMatrix(f, o.rot, tilt, i, lift))}">` +
          `<polygon points="${ptsOf(tp.ring)}" vector-effect="non-scaling-stroke" ${cls(`class="lc-prx" ${tp.attrs}`, isSel(tp.attrs))}></polygon></g>`;
      }
    }
  }
  const svg = `<svg class="lc-svg" xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${f.height.toFixed(0)}"` +
    ` viewBox="0 0 ${o.width} ${f.height.toFixed(0)}" role="img" aria-label="${esc(o.t("feat.landscapeCube.title"))}" data-lc-layers="${LC_LAYERS.filter((k) => L[k]).join(" ")}">` +
    DEFS(win) + `<g class="lc-planes">${planes}</g><g class="lc-tops">${tops}</g><g class="lc-screen"></g></svg>`;
  return { svg, fit: f };
}

/** The screen layer for a view: the extrusions' edges, the verticals, the
 *  chains, the names of the planes and of the functional units — arithmetic
 *  on cached geometry, the only thing a turn recomputes besides the transforms. */
function screenLayer(g: LcGeometry, f: LcFit, rot: number, tilt: number, L: Record<LcLayer, boolean>, sel: string | null): string {
  const on = (l: LcLayer | "always"): boolean => l === "always" || !!L[l];
  let s = "";
  const vk = f.k * Math.sqrt(1 - tilt * tilt);
  if (L.prx) {
    g.planes.forEach((p, i) => {
      const m = lcMatrix(f, rot, tilt, i);
      for (const tp of p.tops) {
        const lift = tp.h * vk;
        for (const e of tp.edges) {
          const a = apply(m, e);
          s += `<line class="lc-prx-edge" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${a[0].toFixed(1)}" y2="${(a[1] - lift).toFixed(1)}" stroke="${tp.colour}"/>`;
        }
      }
    });
  }
  for (const ln of g.links) {
    if (!on(ln.layer)) continue;
    const a = apply(lcMatrix(f, rot, tilt, ln.a.i), ln.a.at), b = apply(lcMatrix(f, rot, tilt, ln.b.i), ln.b.at);
    const selc = sel && ln.attrs.includes(`"${esc(sel)}"`) ? " lc-sel" : "";
    s += `<g class="${ln.cls}${selc}" ${ln.attrs}><line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>` +
      `<line class="lc-hit" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>` +
      (ln.label ? `<text x="${((a[0] + b[0]) / 2 + 4).toFixed(1)}" y="${(ln.cls === "lc-vertical" ? a[1] - 4 : (a[1] + b[1]) / 2).toFixed(1)}">${esc(ln.label)}</text>` : "") +
      (ln.title ? `<title>${esc(ln.title)}</title>` : "") + `</g>`;
  }
  g.planes.forEach((p, i) => {
    const m = lcMatrix(f, rot, tilt, i);
    // the name at the plane's leftmost corner (it follows the turn)
    const cs = [[-g.half[0], -g.half[1]], [g.half[0], -g.half[1]], [g.half[0], g.half[1]], [-g.half[0], g.half[1]]].map((q) => apply(m, q as P2));
    const left = cs.reduce((mm, q) => (q[0] < mm[0] ? q : mm));
    s += `<text class="lc-plane-name" data-lc-plane-name="${esc(p.lane)}" x="${(left[0] - 8).toFixed(1)}" y="${(left[1] + 4).toFixed(1)}" text-anchor="end">${esc(fit(p.name, RAIL - 12, 6.2))}</text>`;
    for (const lb of p.labels) {
      if (!on(lb.layer)) continue;
      const a = apply(m, lb.at);
      s += `<text class="${lb.cls}${sel && lb.attrs.includes(`"${esc(sel)}"`) ? " lc-sel" : ""}" ${lb.attrs} x="${a[0].toFixed(1)}" y="${(a[1] + (lb.dy ?? 0)).toFixed(1)}" text-anchor="middle">${esc(lb.text)}</text>`;
    }
    // landscape symbols: a row under the plane's front corner
    if (p.symbols.length) {
      const corners = [[-g.half[0], -g.half[1]], [g.half[0], -g.half[1]], [g.half[0], g.half[1]], [-g.half[0], g.half[1]]].map((q) => apply(m, q as P2));
      const front = corners.reduce((mm, q) => (q[1] > mm[1] ? q : mm));
      p.symbols.forEach((sy, j) => {
        const x = front[0] - 160 + (j % 12) * 28, yy = front[1] + 14 + Math.floor(j / 12) * 22;
        const col = /data-col="([^"]+)"/.exec(sy.attrs)?.[1] ?? "#8c8c8c";
        const title = /data-title="([^"]*)"/.exec(sy.attrs)?.[1] ?? "";
        const shape = sy.text === "ut" ? `<path d="M${x - 6},${yy} l3,-5 h6 l3,5 l-3,5 h-6z" fill="#fff" stroke="${col}"/>`
          : `<circle cx="${x}" cy="${yy}" r="6" fill="#fff" stroke="${col}"/>`;
        s += `<g class="lc-sym" ${sy.attrs}>${shape}<title>${title}</title></g>`;
      });
    }
  });
  return s;
}

// kept for the checks of MF04 and for a script: the static SVG of a building
// or a landscape (the turntable is the area's)
export function lcBuildingSvg(a: LcBuilding, o: LcDrawOpts): string {
  if (!a.bbox) return "";
  const g = lcBuildingGeometry(a, o.t);
  const L = o.layers ?? view0().layers;
  const { svg, fit: f } = lcSvg(g, o);
  return svg.replace('<g class="lc-screen"></g>', `<g class="lc-screen">${screenLayer(g, f, o.rot, o.tilt ?? TILT0, L, o.sel)}</g>`);
}
export function lcLandscapeSvg(a: LcLandscape, o: LcDrawOpts): string {
  const g = lcLandscapeGeometry(a, o.t);
  const L = o.layers ?? view0().layers;
  const { svg, fit: f } = lcSvg(g, o);
  return svg.replace('<g class="lc-screen"></g>', `<g class="lc-screen">${screenLayer(g, f, o.rot, o.tilt ?? TILT0, L, o.sel)}</g>`);
}

function note(key: string, vars: Record<string, string | number> | undefined, state: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "fm-note";
  p.dataset.lcState = state;
  p.textContent = host ? host.t(key, vars) : key;
  return p;
}

// ── the live cube of a window: geometry cached, the turntable ──────────────

interface Live {
  win: string; svg: SVGSVGElement; g: LcGeometry; fit: LcFit; screen: SVGGElement;
  apply(): void; renders: number; frames: number; turning: boolean;
  /** the cost of a frame of the turn (ms): the last, the worst */
  ms: number; maxMs: number;
}
const lives = new Map<string, Live>();
/** geometry cache: per window, the answer it was built from */
const geomOf = new Map<string, { answer: LcAnswer; lang: string; g: LcGeometry }>();
const reduceMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function geometryFor(winId: string, a: LcAnswer, t: LcHost["t"]): LcGeometry {
  const L = lang();
  const hit = geomOf.get(winId);
  if (hit && hit.answer === a && hit.lang === L) return hit.g;
  const g = a.scale === "building" ? lcBuildingGeometry(a, t) : lcLandscapeGeometry(a, t);
  geomOf.set(winId, { answer: a, lang: L, g });
  return g;
}

/** Turn the live cube of a window: only the transforms and the screen layer. */
function applyView(live: Live): void {
  const t0 = performance.now();
  const v = vs(live.win);
  const f = live.fit;
  if (v.gap != null) f.gap = v.gap;
  live.frames++;
  live.svg.querySelectorAll<SVGGElement>(":scope > .lc-planes > .lc-plane").forEach((el) => {
    const i = Number(el.dataset.lcPlaneIndex);
    el.setAttribute("transform", mat(lcMatrix(f, v.rot, v.tilt, i)));
  });
  const vk = f.k * Math.sqrt(1 - v.tilt * v.tilt);
  live.svg.querySelectorAll<SVGGElement>(":scope > .lc-tops > .lc-top").forEach((el) => {
    const i = Number(el.dataset.lcPlaneIndex);
    el.setAttribute("transform", mat(lcMatrix(f, v.rot, v.tilt, i, Number(el.dataset.lcH) * vk)));
  });
  live.screen.innerHTML = screenLayer(live.g, f, v.rot, v.tilt, v.layers, host?.selected() ?? null);
  const hh = Math.max(120, TOP + 2 * live.g.radius * f.k * v.tilt + (live.g.planes.length - 1) * f.gap + 34);
  live.svg.setAttribute("height", hh.toFixed(0));
  live.svg.setAttribute("viewBox", `0 0 ${f.width} ${hh.toFixed(0)}`);
  live.ms = performance.now() - t0;
  if (live.frames > 1) live.maxMs = Math.max(live.maxMs, live.ms);
}

function wireTurntable(live: Live, onClick: (target: Element) => void): void {
  const el = live.svg;
  el.style.touchAction = "none";
  let st: { x: number; y: number; rot: number; tilt: number; lx: number; lt: number; moved: boolean; id: number } | null = null;
  let vel = 0;
  let raf = 0;
  const frame = () => { raf = 0; live.apply(); };
  const ask = () => { if (!raf) raf = requestAnimationFrame(frame); };
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    cancelAnimationFrame(raf); raf = 0;
    const v = vs(live.win);
    st = { x: e.clientX, y: e.clientY, rot: v.rot, tilt: v.tilt, lx: e.clientX, lt: performance.now(), moved: false, id: e.pointerId };
    vel = 0;
  });
  el.addEventListener("pointermove", (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.moved && Math.hypot(dx, dy) < 4) return;
    if (!st.moved) { st.moved = true; live.turning = true; try { el.setPointerCapture(e.pointerId); } catch { /* gone */ } el.classList.add("lc-grabbing"); }
    const now = performance.now();
    vel = (e.clientX - st.lx) / Math.max(1, now - st.lt);
    st.lx = e.clientX; st.lt = now;
    const v = vs(live.win);
    v.rot = normRot(st.rot + dx * 0.45);
    v.tilt = Math.max(TILT_MIN, Math.min(TILT_MAX, st.tilt + dy * 0.0016));
    ask();
  });
  const end = (e: PointerEvent) => {
    if (!st || e.pointerId !== st.id) return;
    const was = st;
    st = null;
    el.classList.remove("lc-grabbing");
    if (!was.moved) { live.turning = false; onClick(e.target as Element); return; }
    if (reduceMotion() || Math.abs(vel) < 0.02) { live.turning = false; return; }
    // inertia: the turn glides and slows down
    const glide = () => {
      vel *= 0.92;
      if (Math.abs(vel) < 0.01) { raf = 0; live.turning = false; return; }
      const v = vs(live.win);
      v.rot = normRot(v.rot + vel * 16 * 0.45);
      live.apply();
      raf = requestAnimationFrame(glide);
    };
    raf = requestAnimationFrame(glide);
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const v = vs(live.win);
    const cur = v.gap ?? live.fit.gap;
    v.gap = Math.max(GAP_MIN, Math.min(GAP_MAX, cur * Math.exp(-e.deltaY * 0.0015)));
    ask();
  }, { passive: false });
}

/** An area resized (a splitter, ⛶): drawn again to fit, once it settles. */
const sized = new WeakMap<HTMLElement, { w: number; h: number; ro: ResizeObserver | null; timer: ReturnType<typeof setTimeout> | null }>();
function refitOnResize(body: HTMLElement, redraw: () => void): void {
  let rec = sized.get(body);
  const w = body.clientWidth, h = body.clientHeight;
  if (!rec) {
    rec = { w, h, ro: null, timer: null };
    sized.set(body, rec);
    if (typeof ResizeObserver === "function") {
      const r = rec;
      r.ro = new ResizeObserver(() => {
        if (!body.isConnected) { r.ro?.disconnect(); return; }
        if (Math.abs(body.clientWidth - r.w) < 8 && Math.abs(body.clientHeight - r.h) < 8) return;
        if (r.timer) clearTimeout(r.timer);
        r.timer = setTimeout(() => { r.timer = null; redraw(); }, 120);
      });
      r.ro.observe(body);
    }
  }
  rec.w = w; rec.h = h;
}

const LAYER_KEY: Record<LcLayer, string> = { sym: "lc.layer.sym", plan: "lc.layer.plan", prx: "lc.layer.prx", rm: "lc.layer.rm" };

/** The area «Cube». */
export function renderLandscapeCubeInto(body: HTMLElement, winId: string): void {
  if (!host) return;
  const h = host;
  const t = h.t;
  const scale = lcScaleOf(winId);
  if (!scaleOf.has(winId)) scaleOf.set(winId, scale);
  lcAsk();
  refitOnResize(body, () => { if (!lives.get(winId)?.turning) host?.changed(); });
  body.textContent = "";
  body.classList.add("fm-body", "lc-body");
  body.dataset.lcScale = scale;
  const v = vs(winId);
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
  // the four layers, independent switches (the building's)
  if (scale === "building") {
    const grp = document.createElement("span");
    grp.className = "lc-layers";
    for (const k of LC_LAYERS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lc-layer-btn";
      b.dataset.lcLayer = k;
      b.textContent = t(LAYER_KEY[k]);
      b.title = t(`${LAYER_KEY[k]}Title`);
      b.setAttribute("aria-pressed", String(v.layers[k]));
      b.addEventListener("click", () => { setLcView(winId, { layers: { [k]: !vs(winId).layers[k] } }); h.changed(); });
      grp.appendChild(b);
    }
    head.appendChild(grp);
  }
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "lc-layer-btn";
  reset.dataset.lcReset = "";
  reset.textContent = "⟲";
  reset.title = t("lc.reset");
  reset.addEventListener("click", () => { const d = view0(); setLcView(winId, { rot: d.rot, tilt: d.tilt, gap: null }); h.changed(); });
  head.appendChild(reset);
  body.appendChild(head);
  lives.delete(winId);
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
    (scale === "building" ? `<span class="fm-legend-item"><span class="fm-sw lc-sw-buried"></span>${esc(t("lc.legend.buried"))}</span>` : "") +
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
  if (a.scale === "building" && !Object.keys(a.units).length) {
    body.appendChild(note(a.proxies?.folder ? "lc.noProxies" : "lc.noFolder", undefined, "empty"));
    return;
  }
  if (a.scale === "landscape" && !a.planes.length) { body.appendChild(note("lc.noLanes", undefined, "empty")); return; }
  const wrap = document.createElement("div");
  wrap.className = "fm-scroll lc-scroll";
  body.appendChild(wrap);
  const foot = document.createElement("div");
  foot.className = "lc-footer";
  const notes = document.createElement("p");
  notes.className = "fm-note lc-foot";
  notes.textContent = "·";
  foot.append(count, legend, notes);
  body.appendChild(foot);
  const width = Math.max(320, (wrap.clientWidth || body.clientWidth || 760) - 4);
  const height = Math.max(160, (wrap.clientHeight > 60 ? wrap.clientHeight : (body.clientHeight || 520) - head.offsetHeight - foot.offsetHeight - 30) - 4);
  const g = geometryFor(winId, a, t);
  const sel = h.selected();
  const lit = h.lit?.() ?? new Set<string>();
  const { svg, fit: f } = lcSvg(g, { width, height, rot: v.rot, gap: v.gap, tilt: v.tilt, sel, t, layers: v.layers, lit, win: winId });
  wrap.innerHTML = svg;
  const el = wrap.querySelector<SVGSVGElement>("svg.lc-svg")!;
  el.dataset.lcWin = winId;
  el.dataset.lcOutliers = g.outliers.join(" ");
  const screen = el.querySelector<SVGGElement>(".lc-screen")!;
  const prev = lives.get(winId);
  const live: Live = { win: winId, svg: el, g, fit: f, screen, renders: (prev?.renders ?? renderCount.get(winId) ?? 0) + 1, frames: 0, turning: false,
                       ms: 0, maxMs: 0, apply: () => applyView(live) };
  renderCount.set(winId, live.renders);
  lives.set(winId, live);
  live.apply();
  live.frames = 0;
  wireTurntable(live, (target) => {
    const it = target.closest<SVGElement>("[data-lc-unit],[data-lc-fu]");
    if (!it) return;
    const id = it.getAttribute("data-lc-unit") ?? it.getAttribute("data-lc-fu")!;
    if (h.active()?.has(id)) h.select(id);
  });
  notes.textContent = a.scale === "building"
    ? t("lc.foot", { v: a.verticals.map((x) => a.units[x.id]?.name ?? x.id).join(", ") || "—" }) +
      (a.proxies?.stale.length ? " " + t("lc.stale", { n: a.proxies.stale.length }) : "") +
      (v.layers.rm ? " " + t("lc.rmFoot", { n: g.rmRead, u: g.rmUnread }) : "") +
      (g.outliers.length ? " " + t("lc.outliers", { n: g.outliers.length }) : "")
    : t("lc.footLandscape");
  notes.title = notes.textContent;
}
const renderCount = new Map<string, number>();

/** The answer a window shows, for a test or a script. */
export function lcAnswerOf(winId: string): { scale: LcScale; state: Readonly<Ask>; view: LcView; live: null | { renders: number; frames: number; turning: boolean; k: number; gap: number; planeH: number; outliers: string[]; ms: number; maxMs: number } } {
  const scale = lcScaleOf(winId);
  const live = lives.get(winId);
  return { scale, state: asks[scale], view: lcView(winId),
           live: live ? { renders: live.renders, frames: live.frames, turning: live.turning, k: live.fit.k, gap: live.fit.gap,
                          planeH: live.fit.planeH, outliers: live.g.outliers, ms: live.ms, maxMs: live.maxMs } : null };
}

// ── MICRO-MF07 · the plan by horizon: the «Space» of the workspace ─────────

/** the horizon a plan window shows (a lane id); null → the plane with most */
const planLane = new Map<string, string>();
const planLasso = new Map<string, boolean>();
export function setPlanView(winId: string, v: { lane?: string | null; lasso?: boolean }): void {
  if (v.lane === null) planLane.delete(winId);
  else if (typeof v.lane === "string") planLane.set(winId, v.lane);
  if (typeof v.lasso === "boolean") planLasso.set(winId, v.lasso);
  lcAsk();
}
function laneOfPlan(winId: string, a: LcBuilding): LcPlane | null {
  const want = planLane.get(winId);
  const pick = a.planes.find((p) => p.lane === want);
  if (pick) return pick;
  return [...a.planes].sort((x, y) => y.items.length - x.items.length)[0] ?? null;
}

export interface LcPlanDraw { svg: string; items: number; buried: number; partial: number; lane: string | null; scale: number }

/** The plan of one horizon from above (orthographic), fitted to `width` ×
 *  `height` (exported for the checks). Colour = the functional unit that
 *  reads the unit there (by its evidence), grey unread; dashed = an instance
 *  from an earlier horizon; BURIED (LG4) thin outline and hatched, IN VIEW
 *  full, PARTLY in view lighter and hatched. */
export function lcPlanSvg(a: LcBuilding, plane: LcPlane, o: { width: number; height: number; sel: string | null; lit?: ReadonlySet<string>; t: LcHost["t"] }): LcPlanDraw {
  const t = o.t;
  const fr = lcFrame(plane.items.map((it) => ({ id: it.id, rings: (a.units[it.id]?.rings ?? []) as P2[][] })));
  const pad = 14;
  const k = Math.max(0.05, Math.min((o.width - 2 * pad) / (2 * fr.half[0] * 1.04), (o.height - 2 * pad - 18) / (2 * fr.half[1] * 1.04)));
  const W = o.width, H = Math.max(120, Math.round(2 * fr.half[1] * 1.04 * k + 2 * pad + 18));
  const sx = (p: ReadonlyArray<number>): string => `${(W / 2 + (p[0] - fr.centre[0]) * k).toFixed(1)},${(pad + fr.half[1] * 1.04 * k - (p[1] - fr.centre[1]) * k).toFixed(1)}`;
  const lit = o.lit ?? new Set<string>();
  let s = `<rect class="lc-plan-ground" x="0" y="0" width="${W}" height="${H}"/>`;
  let buried = 0, partial = 0;
  for (const it of plane.items) {
    const u = a.units[it.id];
    if (!u) continue;
    const seen = seenOf(it);
    if (seen === "buried") buried++;
    if (seen === "partially_exposed") partial++;
    const col = evidenceColour(it.reader ? it.evidence : null);
    const big = u.rings.reduce((m, r) => m + areaOf(r as P2[]), 0) > BIG_M2;
    const sel = o.sel === it.id || (!!o.sel && (it.reader === o.sel || it.readers.includes(o.sel)));
    const isLit = lit.has(it.id);
    const fill = seen === "buried" ? "url(#lc-hatch-px)" : big ? "none" : col;
    const fop = seen === "buried" ? 1 : seen === "partially_exposed" ? 0.1 : seen === "undetermined" ? (it.reader ? 0.16 : 0.06) : (it.reader ? 0.3 : 0.1);
    const sw = sel ? 2.6 : isLit ? 2.2 : seen === "buried" ? 0.6 : big ? 1.4 : 1;
    const name = `${u.name}${it.reader ? ` · ${a.functional_units[it.reader]?.name ?? ""}` : ""} · ${t(`lc.seen.${seen}`)}` +
      (it.instance && it.from_lane ? ` · ${t("lc.from", { lane: a.lanes.find((l) => l.id === it.from_lane)?.name ?? it.from_lane })}` : "");
    s += `<g class="lc-plan-fp${sel ? " lc-sel" : ""}${isLit ? " lc-lit" : ""}" data-lc-unit="${esc(it.id)}" data-lc-seen="${seen}"` +
      ` data-lc-evidence="${esc(it.reader ? it.evidence ?? "symbol" : "none")}" data-lc-reader="${esc(it.reader ?? "")}"${it.instance ? ` data-lc-instance="${esc(it.from_lane ?? "")}"` : ""}>` +
      u.rings.map((r) => `<polygon points="${r.map(sx).join(" ")}" fill="${fill}" fill-opacity="${fop}" stroke="${col}" stroke-width="${sw}"` +
        `${it.instance ? ' stroke-dasharray="3 2"' : ""}${seen === "partially_exposed" ? ' stroke-dasharray="5 2"' : ""}/>` +
        (seen === "partially_exposed" ? `<polygon points="${r.map(sx).join(" ")}" fill="url(#lc-hatch-px)" fill-opacity="0.5" stroke="none"/>` : "")).join("") +
      `<title>${esc(name)}</title></g>`;
  }
  // the scale: 10 m
  const ten = 10 * k;
  s += `<g class="lc-plan-scale"><line x1="10" y1="${H - 10}" x2="${(10 + ten).toFixed(1)}" y2="${H - 10}"/><text x="${(14 + ten).toFixed(1)}" y="${H - 6}">10 m</text></g>`;
  s += `<polyline class="lc-lasso-line" points="" data-lc-lasso-line=""/>`;
  const svg = `<svg class="lc-plan-svg" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("fw.plan.title"))}">` +
    `<defs><pattern id="lc-hatch-px" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="lc-hatch-line" stroke-width="1"/></pattern></defs>${s}</svg>`;
  return { svg, items: plane.items.length, buried, partial, lane: plane.lane, scale: k };
}

/** the units whose footprint's centre falls inside a polygon of the plan (px) */
function unitsInPlanPolygon(svg: SVGSVGElement, poly: ReadonlyArray<P2>): string[] {
  const inside = (p: P2): boolean => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const out: string[] = [];
  svg.querySelectorAll<SVGGElement>("g.lc-plan-fp").forEach((g) => {
    const pts = [...g.querySelectorAll("polygon")].flatMap((pg) => (pg.getAttribute("points") ?? "").split(" ").map((q) => q.split(",").map(Number) as P2));
    if (!pts.length) return;
    if (inside(centroidOf(pts))) out.push(g.dataset.lcUnit!);
  });
  return [...new Set(out)];
}

const planState = new Map<string, { lane: string | null; items: number; buried: number; partial: number; scale: number; lasso: boolean; lastLasso: string[] | null }>();

/** Close the lasso of a plan window on a polygon in the plan's pixels (the
 *  checks; the pointer does the same). Returns the units taken. */
export function planLassoAt(winId: string, poly: ReadonlyArray<P2>): string[] {
  const svg = document.querySelector<SVGSVGElement>(`[data-lc-plan-win="${CSS.escape(winId)}"] svg.lc-plan-svg`);
  if (!svg) return [];
  const units = unitsInPlanPolygon(svg, poly);
  const ps = planState.get(winId);
  if (ps) ps.lastLasso = units;
  planLasso.set(winId, false);
  host?.lasso?.(units);
  host?.changed();
  return units;
}

/** The area «Space · plan by horizon» of the workspace Functional. */
export function renderFunctionalPlanInto(body: HTMLElement, winId: string): void {
  if (!host) return;
  const h = host;
  const t = h.t;
  lcAsk();
  refitOnResize(body, () => host?.changed());
  body.textContent = "";
  body.classList.add("fm-body", "lc-body", "lc-plan-body");
  body.dataset.lcPlanWin = winId;
  const head = document.createElement("div");
  head.className = "fm-head lc-head";
  body.appendChild(head);
  const st = asks.building;
  if (!h.active()) { body.appendChild(note("lc.noDoc", undefined, "none")); return; }
  if (st.status === "missing") { body.appendChild(note("lc.missing", undefined, "missing")); return; }
  if (st.status === "off") { body.appendChild(note("fm.off", undefined, "off")); return; }
  if (st.status === "error") { body.appendChild(note("fm.error", { why: st.error ?? "" }, "error")); return; }
  const a = st.answer;
  if (!a || a.scale !== "building") { body.appendChild(note("fm.loading", undefined, "loading")); return; }
  if (!Object.keys(a.units).length) { body.appendChild(note(a.proxies?.folder ? "lc.noProxies" : "lc.noFolder", undefined, "empty")); return; }
  const plane = laneOfPlan(winId, a);
  if (!plane) { body.appendChild(note("lc.noLanes", undefined, "empty")); return; }
  // the horizon: one button per plane, the newest first (as the Matrix)
  const hz = document.createElement("span");
  hz.className = "lc-hz";
  const lab = document.createElement("span");
  lab.className = "fm-note";
  lab.textContent = t("fw.plan.horizon");
  hz.appendChild(lab);
  for (const p of a.planes) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lc-layer-btn";
    b.dataset.lcHz = p.lane;
    b.textContent = fit(p.name, 120, 6);
    b.title = p.name;
    b.setAttribute("aria-pressed", String(p.lane === plane.lane));
    b.addEventListener("click", () => { setPlanView(winId, { lane: p.lane }); h.changed(); });
    hz.appendChild(b);
  }
  const lasso = document.createElement("button");
  lasso.type = "button";
  lasso.className = "lc-layer-btn";
  lasso.dataset.lcLasso = "";
  lasso.textContent = t("fw.plan.lasso");
  lasso.title = t("fw.plan.lassoTitle");
  const armed = !!planLasso.get(winId);
  lasso.setAttribute("aria-pressed", String(armed));
  lasso.addEventListener("click", () => { setPlanView(winId, { lasso: !planLasso.get(winId) }); h.changed(); });
  head.append(hz, lasso);
  const legend = document.createElement("span");
  legend.className = "fm-legend";
  legend.innerHTML = `<span class="fm-legend-item"><span class="fm-sw lc-sw-exposed"></span>${esc(t("lc.legend.exposed"))}</span>` +
    `<span class="fm-legend-item"><span class="fm-sw lc-sw-buried"></span>${esc(t("lc.legend.buried"))}</span>` +
    `<span class="fm-legend-item"><span class="fm-sw lc-sw-inst"></span>${esc(t("lc.legend.instance"))}</span>` +
    `<span class="fm-legend-item"><span class="fm-sw" style="border-color:${evidenceColour(null)};border-style:dotted"></span>${esc(t("lc.legend.unread"))}</span>`;
  legend.className = "fm-legend";
  const hint = document.createElement("p");
  hint.className = "fm-note lc-plan-hint";
  hint.textContent = armed ? t("fw.plan.lassoHint") : t("fw.plan.hint");
  hint.title = t("fw.plan.hint");
  const wrap = document.createElement("div");
  wrap.className = "fm-scroll lc-scroll";
  body.appendChild(wrap);
  const footer = document.createElement("div");
  footer.className = "lc-footer";
  const foot = document.createElement("p");
  foot.className = "fm-note lc-foot";
  foot.textContent = "·";
  footer.append(hint, legend, foot);
  body.appendChild(footer);
  const width = Math.max(240, (wrap.clientWidth || body.clientWidth || 520) - 4);
  const height = Math.max(140, (wrap.clientHeight > 60 ? wrap.clientHeight : (body.clientHeight || 420) - head.offsetHeight - footer.offsetHeight - 30) - 4);
  const d = lcPlanSvg(a, plane, { width, height, sel: h.selected(), lit: h.lit?.(), t });
  wrap.innerHTML = d.svg;
  const prev = planState.get(winId);
  planState.set(winId, { lane: d.lane, items: d.items, buried: d.buried, partial: d.partial, scale: d.scale, lasso: armed, lastLasso: prev?.lastLasso ?? null });
  const svg = wrap.querySelector<SVGSVGElement>("svg.lc-plan-svg")!;
  if (armed) svg.classList.add("lc-armed");
  const line = svg.querySelector<SVGPolylineElement>("[data-lc-lasso-line]")!;
  const pt = (e: PointerEvent): P2 => {
    const r = svg.getBoundingClientRect();
    return [((e.clientX - r.left) / Math.max(1, r.width)) * Number(svg.getAttribute("width")),
            ((e.clientY - r.top) / Math.max(1, r.height)) * Number(svg.getAttribute("height"))];
  };
  let poly: P2[] | null = null;
  svg.addEventListener("pointerdown", (e) => {
    if (!planLasso.get(winId) || e.button !== 0) return;
    e.preventDefault();
    poly = [pt(e)];
    try { svg.setPointerCapture(e.pointerId); } catch { /* gone */ }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!poly) return;
    poly.push(pt(e));
    line.setAttribute("points", poly.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "));
  });
  svg.addEventListener("pointerup", (e) => {
    if (poly) {
      const pl = poly;
      poly = null;
      line.setAttribute("points", "");
      if (pl.length >= 3) planLassoAt(winId, pl);
      return;
    }
    if (planLasso.get(winId)) return;
    const g = (e.target as Element).closest<SVGElement>("[data-lc-unit]");
    if (!g) return;
    const id = g.getAttribute("data-lc-unit")!;
    if (h.active()?.has(id)) h.select(id);
  });
  foot.dataset.lcPlanCount = String(d.items);
  foot.textContent = t("fw.plan.foot", { n: d.items, b: d.buried, p: d.partial, w: plane.without.length });
  foot.title = foot.textContent;
}

/** What a plan window shows, for a test or a script. */
export function lcPlanOf(winId: string): null | { lane: string | null; items: number; buried: number; partial: number; scale: number; lasso: boolean; lastLasso: string[] | null } {
  return planState.get(winId) ?? null;
}
