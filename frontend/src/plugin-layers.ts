/**
 * MICRO-GEO12 (row G11 of the geophysics plan, G-2, 19 Nov 2026) · the
 * layers a plugin describes (`space.layer@1`), drawn in the Space.
 *
 * The plugin DESCRIBES (s3Dgraphy `em.plugins.shape`: one shape for every
 * host), the page DRAWS — no HTML or JavaScript of the plugin. A layer is a
 * stack of pictures on planes in the stack's LOCAL frame (metres, x east,
 * y north, z up):
 *
 *   · HORIZONTAL planes (a slice of a depth band) at `ground − mean depth`,
 *     flat — or DRAPED on the graph's `landscape_surface`: its heights asked
 *     of the bridge ONCE per stack (`/gis/surface`, the GIS ground's route),
 *     sampled on one grid every slice of the stack shares;
 *   · VERTICAL planes (a section) along their `line`, from the ground down;
 *     a section whose line nobody said stands in a row south of the stack
 *     (the order of the plugin), one plane-height apart;
 *   · the DEPTH CURSOR: «all», «one at a time», «down to»; over
 *     `ALL_MAX` horizontal planes «all» is «one» (the rule of the domain, the
 *     host's), «down to» draws at most `UP_TO_MAX` of them (the deepest ones);
 *   · a picture is asked of the bridge only for a plane that is SHOWN
 *     (`/py/layer-image`, behind the secret: fetch → blob → texture) and its
 *     texture is freed as soon as the plane is hidden.
 *
 * Where: with an `origin` (absolute, doubles) and a GeoPositionNode in the
 * same EPSG (or the layer saying none), the plane goes into three's axes as a
 * GIS sheet does (`gis-scene.ts::toThree`: minus the shift, turned, z = −north;
 * the subtraction in doubles, before any float32); otherwise the stack's own
 * frame is the scene's (the Basilica's slices, declared on a 92 × 50 m
 * rectangle, no world place yet). The flat ground is the foot of the models
 * drawn, else the layer's `ground.z`.
 *
 * What a person changes (shown, cursor, mode, opacity, sections) lives in
 * this machine's preferences per person and document, never in the em.json.
 *
 * MICRO-GEO13 (row G12) · TRACING on the planes. The tools of the Space
 * (`space.tool@1`) of a plugin that drew a layer are offered on a small bar
 * over the scene (`.plg-trace`); armed, a click on a plane of that plugin is
 * a vertex: the plane's item (the slice's document) and where on its picture
 * (three's uv, [0, 1], v = 1 north or the surface — the plane's own uv). When
 * the tool has its clicks (a double click or ✓ for a line or an area) its
 * command runs with `geometry = {primitive, vertices, on, frame: "layer",
 * at: [{on, uv}…], through}` — `through` the slices shown «down to» the
 * cursor of that stack: the plugin reads the anomaly on each of them.
 */
import { fileOf, frameOf, gisLayersOf, surfacesOf, toThree, type SceneFrame } from "./gis-scene";
import type { GeoCtx, GeoDriver, SpaceSceneHandle, ToolHit } from "./scene3d";
import type { V3 } from "./space-tools";

type T = (k: string, v?: Record<string, string>) => string;
type Doc = Parameters<typeof gisLayersOf>[0];

/** over this many horizontal planes «all» draws one at a time (the domain's rule) */
export const ALL_MAX = 60;
/** «down to» draws at most this many horizontal planes (the deepest ones) */
export const UP_TO_MAX = 60;
/** the cells of a draped plane (per side): one grid of heights per stack */
export const DRAPE_CELLS = 32;

export type DisplayMode = "all" | "one" | "up_to";

export interface LayerItem {
  id: string;
  label: string;
  image: string | null;
  stamp?: string | null;
  extent: [number, number, number, number];
  orientation: "horizontal" | "vertical";
  depth_top: number | null;
  depth_bottom: number | null;
  line: [[number, number], [number, number]] | null;
}

/** one layer as s3Dgraphy's `shape("space.layer@1")` gives it */
export interface LayerWire {
  kind: "raster_stack";
  id: string;
  name: string;
  frame: { epsg: number | null; origin: [number, number] | null; rotation: number; local?: boolean };
  ground: { mode: "flat" | "surface"; z: number; surface: string | null };
  items: LayerItem[];
  display: { mode: DisplayMode; index: number };
  opacity: number;
}

/** a layer with the plugin that described it */
export interface PluginLayer { plugin: string; command: string; layer: LayerWire }

/** what a person changed of a layer (this machine) */
export interface LayerPref { hidden?: boolean; mode?: DisplayMode; cursor?: number; opacity?: number; sections?: boolean }

export interface HeightGrid { x0: number; y0: number; step: number; nx: number; ny: number; heights: Array<number | null> }

export const layerKey = (p: Pick<PluginLayer, "plugin" | "layer">): string => `${p.plugin}/${p.layer.id}`;

/** The layers of `space.layer@1` values (each value a list of shaped layers). */
export function layersOfValues(values: Array<{ plugin: string; command: string; value: unknown }>): PluginLayer[] {
  const out: PluginLayer[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (!Array.isArray(v.value)) continue;
    for (const l of v.value as LayerWire[]) {
      if (!l || l.kind !== "raster_stack" || !l.id || !Array.isArray(l.items)) continue;
      const pl = { plugin: v.plugin, command: v.command, layer: l };
      if (seen.has(layerKey(pl))) continue;
      seen.add(layerKey(pl));
      out.push(pl);
    }
  }
  return out;
}

/** the horizontal planes of a layer: their indices in `items`, in the plugin's order (the shallowest first) */
export const horizontalsOf = (l: LayerWire): number[] => l.items.flatMap((it, i) => (it.orientation === "horizontal" ? [i] : []));
export const verticalsOf = (l: LayerWire): number[] => l.items.flatMap((it, i) => (it.orientation === "vertical" ? [i] : []));

/** The mode drawn: the person's, else the plugin's; «all» over ALL_MAX horizontal planes is «one». */
export function modeOf(l: LayerWire, p: LayerPref = {}): DisplayMode {
  const m = p.mode ?? l.display.mode ?? "all";
  return m === "all" && horizontalsOf(l).length > ALL_MAX ? "one" : m;
}

/** The depth cursor: a position among the HORIZONTAL planes (the person's, else the plugin's index). */
export function cursorOf(l: LayerWire, p: LayerPref = {}): number {
  const hs = horizontalsOf(l);
  if (!hs.length) return 0;
  if (typeof p.cursor === "number" && Number.isFinite(p.cursor)) return Math.min(Math.max(Math.round(p.cursor), 0), hs.length - 1);
  const at = hs.indexOf(l.display.index);
  return at >= 0 ? at : 0;
}

/** The cursor moved by `delta` planes (↑ shallower, ↓ deeper), kept inside the stack. */
export const stepCursor = (n: number, at: number, delta: number): number => (n ? Math.min(Math.max(at + delta, 0), n - 1) : 0);

/** The planes to draw (indices in `items`): the horizontal ones by the mode and the cursor, the sections when shown. */
export function shownPlanes(l: LayerWire, p: LayerPref = {}): number[] {
  if (p.hidden) return [];
  const hs = horizontalsOf(l);
  const at = cursorOf(l, p);
  const m = modeOf(l, p);
  const h = !hs.length ? [] : m === "all" ? hs : m === "one" ? [hs[at]] : hs.slice(Math.max(0, at + 1 - UP_TO_MAX), at + 1);
  return p.sections === false ? h : [...h, ...verticalsOf(l)];
}

/** The depth of a horizontal plane: the middle of its band, its top alone, else 0 (a product with no depth lies on the ground). */
export function planeDepth(it: Pick<LayerItem, "depth_top" | "depth_bottom">): number {
  const a = it.depth_top, b = it.depth_bottom;
  if (typeof a === "number" && typeof b === "number") return (a + b) / 2;
  if (typeof a === "number") return a;
  if (typeof b === "number") return b;
  return 0;
}

/** The bounds of the horizontal planes (the stack's footprint), else of every plane. */
export function footprintOf(l: LayerWire): [number, number, number, number] {
  const hs = horizontalsOf(l);
  const items = hs.length ? hs.map((i) => l.items[i]) : l.items;
  if (!items.length) return [0, 0, 0, 0];
  return [Math.min(...items.map((x) => x.extent[0])), Math.min(...items.map((x) => x.extent[1])),
    Math.max(...items.map((x) => x.extent[2])), Math.max(...items.map((x) => x.extent[3]))];
}

/** A section's line on the ground (local frame): its own, else in a row south of
 *  the stack — the k-th section `gap` metres further, from the stack's west edge. */
export function sectionLine(l: LayerWire, it: LayerItem): { line: [[number, number], [number, number]]; said: boolean } {
  if (it.line) return { line: it.line, said: true };
  const [fx0, fy0, , fy1] = footprintOf(l);
  const vs = verticalsOf(l).filter((i) => !l.items[i].line);
  const k = vs.indexOf(l.items.indexOf(it));
  const tall = Math.max(...vs.map((i) => l.items[i].extent[3] - l.items[i].extent[1]), 1);
  const gap = Math.max(2, tall, (fy1 - fy0) * 0.04);
  const y = fy0 - gap * (k + 1);
  const len = it.extent[2] - it.extent[0];
  return { line: [[fx0, y], [fx0 + len, y]], said: false };
}

/** Where a layer's local point goes in three's axes: the world when the layer has an
 *  origin and the scene a frame in the same EPSG, else the stack's frame as the scene's. */
export interface Placement {
  how: "world" | "local";
  /** why local: no_origin, no_scene_frame, other_crs */
  why: string | null;
  /** (x, y) local metres → three's (x, z); the height is set apart */
  xz(x: number, y: number): [number, number];
  /** local → the scene's CRS (for the ground's heights), null when local */
  world(x: number, y: number): [number, number] | null;
}

export function placementOf(l: LayerWire, scene: SceneFrame | null): Placement {
  const th = ((l.frame.rotation || 0) * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  const turn = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const o = l.frame.origin;
  const why = !o ? "no_origin" : !scene ? "no_scene_frame" : l.frame.epsg != null && l.frame.epsg !== scene.epsg ? "other_crs" : null;
  if (why || !o || !scene) {
    return { how: "local", why, xz: (x, y) => { const [a, b] = turn(x, y); return [a, -b]; }, world: () => null };
  }
  const world = (x: number, y: number): [number, number] => { const [a, b] = turn(x, y); return [o[0] + a, o[1] + b]; };
  return { how: "world", why: null, world, xz: (x, y) => { const [X, Y] = world(x, y); const p = toThree(scene, X, Y, scene.z); return [p[0], p[2]]; } };
}

/** A height of the grid at a point of the scene's CRS (bilinear; null outside or on a hole). */
export function heightAt(g: HeightGrid, X: number, Y: number): number | null {
  const i = (X - g.x0) / g.step, j = (g.y0 - Y) / g.step;
  if (!(i >= 0 && j >= 0 && i <= g.nx - 1 && j <= g.ny - 1)) return null;
  const i0 = Math.min(Math.floor(i), Math.max(g.nx - 2, 0)), j0 = Math.min(Math.floor(j), Math.max(g.ny - 2, 0));
  const at = (a: number, b: number) => g.heights[Math.min(b, g.ny - 1) * g.nx + Math.min(a, g.nx - 1)];
  const h00 = at(i0, j0), h10 = at(i0 + 1, j0), h01 = at(i0, j0 + 1), h11 = at(i0 + 1, j0 + 1);
  if (typeof h00 !== "number" || typeof h10 !== "number" || typeof h01 !== "number" || typeof h11 !== "number") {
    const n = at(Math.round(i), Math.round(j));
    return typeof n === "number" ? n : null;
  }
  const fx = i - i0, fy = j - j0;
  return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
}

/** The ground of a stack sampled ONCE on a (cells+1)² grid over its footprint
 *  (three's height of each node; a hole takes the flat ground). Every draped
 *  slice of the stack reuses it, minus its depth. */
export function drapeOf(l: LayerWire, pl: Placement, grid: HeightGrid, flat: number, shiftZ: number, cells = DRAPE_CELLS):
  { ext: [number, number, number, number]; cells: number; heights: Float64Array; holes: number } {
  const ext = footprintOf(l);
  const heights = new Float64Array((cells + 1) * (cells + 1));
  let holes = 0;
  for (let r = 0; r <= cells; r++) for (let c = 0; c <= cells; c++) {
    const x = ext[0] + ((ext[2] - ext[0]) * c) / cells, y = ext[1] + ((ext[3] - ext[1]) * r) / cells;
    const w = pl.world(x, y);
    const h = w ? heightAt(grid, w[0], w[1]) : null;
    if (h == null) holes++;
    heights[r * (cells + 1) + c] = h == null ? flat : h - shiftZ;
  }
  return { ext, cells, heights, holes };
}

/** The ground's height under a local point of a drape (bilinear on its nodes). */
export function drapeHeight(d: ReturnType<typeof drapeOf>, x: number, y: number): number {
  const n = d.cells;
  const fx = Math.min(Math.max(((x - d.ext[0]) / (d.ext[2] - d.ext[0] || 1)) * n, 0), n);
  const fy = Math.min(Math.max(((y - d.ext[1]) / (d.ext[3] - d.ext[1] || 1)) * n, 0), n);
  const c0 = Math.min(Math.floor(fx), n - 1), r0 = Math.min(Math.floor(fy), n - 1);
  const h = (r: number, c: number) => d.heights[r * (n + 1) + c];
  const ax = fx - c0, ay = fy - r0;
  return (h(r0, c0) * (1 - ax) + h(r0, c0 + 1) * ax) * (1 - ay) + (h(r0 + 1, c0) * (1 - ax) + h(r0 + 1, c0 + 1) * ax) * ay;
}

/** The vertices (three's axes) and texture coordinates of one plane: a horizontal one
 *  flat at `ground − depth` or draped (`cells` per side), a vertical one along its line. */
export function planeGeometry(l: LayerWire, it: LayerItem, pl: Placement, ground: number,
                              drape: ReturnType<typeof drapeOf> | null = null): { pos: number[]; uv: number[]; index: number[]; line?: { said: boolean } } {
  const [x0, y0, x1, y1] = it.extent;
  if (it.orientation === "vertical") {
    const { line, said } = sectionLine(l, it);
    const [a, b] = line;
    const pa = pl.xz(a[0], a[1]), pb = pl.xz(b[0], b[1]);
    const ga = drape ? drapeHeight(drape, a[0], a[1]) : ground, gb = drape ? drapeHeight(drape, b[0], b[1]) : ground;
    // y of the extent is −depth: the top edge at the ground + y1, the bottom at the ground + y0
    const pos = [pa[0], ga + y0, pa[1], pb[0], gb + y0, pb[1], pb[0], gb + y1, pb[1], pa[0], ga + y1, pa[1]];
    return { pos, uv: [0, 0, 1, 0, 1, 1, 0, 1], index: [0, 1, 2, 0, 2, 3], line: { said } };
  }
  const depth = planeDepth(it);
  const n = drape ? drape.cells : 1;
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) {
    const u = c / n, v = r / n;
    const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * v;
    const [tx, tz] = pl.xz(x, y);
    pos.push(tx, (drape ? drapeHeight(drape, x, y) : ground) - depth, tz);
    uv.push(u, v);
  }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const a = r * (n + 1) + c, b = a + 1, d = a + n + 1, e = d + 1;
    index.push(a, b, e, a, e, d);
  }
  return { pos, uv, index };
}

// ── tracing on the planes (MICRO-GEO13, row G12) ─────────────────────────────

/** a plugin's tool of the Space (`space.tool@1`) as the layers' bar offers it */
export interface LayerTool {
  /** the register's id, `plugin:<plugin>/<command>` */
  id: string;
  plugin: string;
  command: string;
  primitive: "point" | "line" | "polyline" | "surface";
  clicks: { min: number; max: number | null };
  glyph: string;
  label: () => string;
  disabled?: () => string | null;
}

/** one click of a trace: the plane's item and the place on its picture */
export interface TraceClick { point: V3; item: string; uv: [number, number] }

/** The tools offered over the layers: those of a plugin that drew a layer
 *  shown (a plugin's tool draws on its own planes). */
export function layerToolsFor(layers: PluginLayer[], tools: LayerTool[], pref: (k: string) => LayerPref = () => ({})): LayerTool[] {
  const by = new Set(layers.filter((p) => !pref(layerKey(p)).hidden && p.layer.items.length).map((p) => p.plugin));
  return tools.filter((t) => by.has(t.plugin));
}

/** The stack an item belongs to (its layer), or null. */
export function layerOfItem(layers: PluginLayer[], item: string): PluginLayer | null {
  return layers.find((p) => p.layer.items.some((it) => it.id === item)) ?? null;
}

/** The slices shown «down to» the cursor of the stack of `item` (horizontal
 *  ones; none in «all» or «one»: there the trace is read where it was clicked). */
export function throughOf(layers: PluginLayer[], item: string, pref: (k: string) => LayerPref = () => ({})): string[] {
  const p = layerOfItem(layers, item);
  if (!p) return [];
  const pf = pref(layerKey(p));
  if (modeOf(p.layer, pf) !== "up_to") return [];
  const it = p.layer.items.find((x) => x.id === item);
  if (!it || it.orientation !== "horizontal") return [];
  return shownPlanes(p.layer, { ...pf, sections: false }).map((i) => p.layer.items[i].id);
}

/** What a click with `n` vertices placed means: more needed, may close, done. */
export function traceVerdict(t: Pick<LayerTool, "clicks">, n: number): "more" | "may_close" | "done" {
  if (t.clicks.max != null && n >= t.clicks.max) return "done";
  return n >= t.clicks.min ? "may_close" : "more";
}

/** The geometry slot of the tool's command (SPEC-plugin §13, frame «layer»). */
export function traceGeometry(primitive: LayerTool["primitive"], clicks: TraceClick[], through: string[] = []): Record<string, unknown> {
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  return {
    primitive, frame: "layer", on: clicks[0]?.item ?? null,
    vertices: clicks.map((c) => [c.point[0], c.point[1], c.point[2]]),
    at: clicks.map((c) => ({ on: c.item, uv: [r6(c.uv[0]), r6(c.uv[1])] })),
    through: [...new Set(through)],
  };
}

// ── the drawing ──────────────────────────────────────────────────────────────

export interface LayerDriverOptions {
  /** the scene's frame (GeoPositionNode), null without one */
  frame: SceneFrame | null;
  /** a picture of the plugin's data folder (`/py/layer-image`), null when it does not come */
  image: (plugin: string, path: string) => Promise<Blob | null>;
  /** the heights of a landscape surface in the scene's CRS, asked once per stack */
  surface: (id: string) => Promise<HeightGrid | null>;
  log?: (s: string) => void;
}

export interface LayerDriver extends GeoDriver {
  set(layers: PluginLayer[], prefs: (key: string) => LayerPref): void;
  state(): Record<string, unknown>;
}

interface Drawn { mesh: any; sig: string; image: string | null; texture: any; bytes: number }

export function createLayerDriver(o: LayerDriverOptions): LayerDriver {
  let ctx: GeoCtx | null = null;
  let group: any = null;
  let want: { layers: PluginLayer[]; prefs: (key: string) => LayerPref } = { layers: [], prefs: () => ({}) };
  const drawn = new Map<string, Drawn>();
  const drapes = new Map<string, { sig: string; grid: HeightGrid | null; pending?: Promise<HeightGrid | null> }>();
  const info = new Map<string, Record<string, unknown>>();
  let busy: Promise<void> | null = null;
  let again = false;
  let loaded = 0;

  const free = (key: string) => {
    const d = drawn.get(key);
    if (!d) return;
    d.mesh?.removeFromParent?.();
    d.mesh?.geometry?.dispose?.();
    d.mesh?.material?.dispose?.();
    d.texture?.dispose?.();
    drawn.delete(key);
  };

  const texture = async (plugin: string, path: string): Promise<{ map: any; bytes: number } | null> => {
    if (!ctx) return null;
    const blob = await o.image(plugin, path).catch(() => null);
    if (!blob || !ctx) return null;
    const url = URL.createObjectURL(blob);
    try {
      const map = await new ctx.THREE.TextureLoader().loadAsync(url);
      map.colorSpace = ctx.THREE.SRGBColorSpace;
      loaded++;
      const img = map.image as { width?: number; height?: number } | undefined;
      return { map, bytes: (img?.width ?? 0) * (img?.height ?? 0) * 4 };
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  /** the flat ground: the foot of the models drawn, else the layer's own z */
  const flatGround = (l: LayerWire, pl: Placement): number => {
    const box = ctx?.contentBox?.();
    if (box) return box[0][1];
    return pl.how === "world" && o.frame ? l.ground.z - o.frame.z : l.ground.z;
  };

  const drapeFor = async (p: PluginLayer, pl: Placement): Promise<HeightGrid | null> => {
    const l = p.layer;
    if (l.ground.mode !== "surface" || !l.ground.surface || pl.how !== "world") return null;
    const sig = `${l.ground.surface}|${JSON.stringify(o.frame)}`;
    const k = layerKey(p);
    const had = drapes.get(k);
    if (had?.sig === sig) return had.pending ? await had.pending : had.grid;
    const pending = o.surface(l.ground.surface).catch(() => null);
    drapes.set(k, { sig, grid: null, pending });
    const grid = await pending;
    drapes.set(k, { sig, grid });
    return grid;
  };

  const syncOnce = async () => {
    if (!ctx || !group) return;
    const { THREE } = ctx;
    const keep = new Set<string>();
    info.clear();
    for (const p of want.layers) {
      const l = p.layer;
      const k = layerKey(p);
      const pref = want.prefs(k);
      const pl = placementOf(l, o.frame);
      const flat = flatGround(l, pl);
      const grid = await drapeFor(p, pl);
      if (!ctx || !group) return;
      const drape = grid ? drapeOf(l, pl, grid, flat, o.frame?.z ?? 0) : null;
      const shown = shownPlanes(l, pref);
      const opacity = Math.min(1, Math.max(0, pref.opacity ?? l.opacity ?? 1));
      let noPicture = 0;
      for (const i of shown) {
        const it = l.items[i];
        const mk = `${k}#${it.id}`;
        keep.add(mk);
        const sig = JSON.stringify([it.extent, it.depth_top, it.depth_bottom, it.line, pl.how, pl.why, Math.round(flat * 100), !!drape, drape?.holes ?? 0, l.frame, o.frame]);
        const had = drawn.get(mk);
        if (had && had.sig === sig && had.image === it.image) {
          had.mesh.material.opacity = opacity;
          had.mesh.material.transparent = opacity < 1 || !had.texture;
          had.mesh.material.depthWrite = opacity >= 1;
          if (!it.image) noPicture++;
          continue;
        }
        free(mk);
        const g = planeGeometry(l, it, pl, flat, drape);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
        geo.setIndex(g.index);
        const tex = it.image ? await texture(p.plugin, it.image) : null;
        if (!ctx || !group) { tex?.map?.dispose?.(); return; }
        if (!tex) noPicture++;
        const m = new THREE.MeshBasicMaterial({ map: tex?.map ?? null, color: tex ? 0xffffff : 0x9a8f7a, side: THREE.DoubleSide,
          transparent: opacity < 1 || !tex, opacity: tex ? opacity : opacity * 0.35, alphaTest: tex ? 0.02 : 0, depthWrite: opacity >= 1 && !!tex });
        const mesh = new THREE.Mesh(geo, m);
        mesh.userData = { helper: true, pluginLayer: k, layerItem: it.id, plugin: p.plugin };
        mesh.renderOrder = 3;
        group.add(mesh);
        drawn.set(mk, { mesh, sig, image: it.image, texture: tex?.map ?? null, bytes: tex?.bytes ?? 0 });
        if (g.line && !g.line.said) info.set(`${k}#lines`, { ...(info.get(`${k}#lines`) ?? {}), [it.id]: "row" });
      }
      info.set(k, { plugin: p.plugin, layer: l.id, name: l.name, how: pl.how, why: pl.why, ground: drape ? "draped" : "flat", flat,
        drapeHoles: drape?.holes ?? null, mode: modeOf(l, pref), cursor: cursorOf(l, pref), horizontals: horizontalsOf(l).length,
        verticals: verticalsOf(l).length, shown: shown.map((i) => l.items[i].id), noPicture, opacity });
    }
    for (const mk of [...drawn.keys()]) if (!keep.has(mk)) free(mk);
    for (const k of [...drapes.keys()]) if (!want.layers.some((p) => layerKey(p) === k)) drapes.delete(k);
  };

  const sync = () => {
    if (busy) { again = true; return; }
    busy = (async () => {
      do { again = false; await syncOnce().catch((e) => o.log?.(`space.layer: ${String((e as Error)?.message ?? e)}`)); } while (again && ctx);
    })().finally(() => { busy = null; });
  };

  return {
    attach(c: GeoCtx) {
      ctx = c;
      group = new c.THREE.Group();
      group.userData.helper = true;
      group.name = "plugin-layers";
      c.scene.add(group);
      sync();
    },
    detach() {
      for (const k of [...drawn.keys()]) free(k);
      group?.removeFromParent();
      group = null;
      ctx = null;
    },
    update() { /* nothing moves by itself */ },
    ownsPointer: () => false,
    far: () => {
      if (!ctx || !group || !group.children.length) return null;
      const b = new ctx.THREE.Box3().setFromObject(group);
      if (b.isEmpty()) return null;
      return ctx.camera().position.distanceTo(b.getCenter(new ctx.THREE.Vector3())) + b.getSize(new ctx.THREE.Vector3()).length();
    },
    setCamera() { /* read at each frame by the scene */ },
    set(layers, prefs) {
      want = { layers, prefs };
      sync();
    },
    state() {
      const box = ctx && group?.children.length ? new ctx.THREE.Box3().setFromObject(group) : null;
      let bytes = 0, textures = 0;
      for (const d of drawn.values()) { bytes += d.bytes; if (d.texture) textures++; }
      return { inScene: !!group?.parent, busy: !!busy, planes: drawn.size, textures, textureBytes: bytes, loadedEver: loaded,
        box: box && !box.isEmpty() ? [box.min.toArray(), box.max.toArray()] : null,
        layers: [...info.entries()].filter(([k]) => !k.endsWith("#lines")).map(([k, v]) => ({ key: k, ...v, rowLines: info.get(`${k}#lines`) ?? null })),
        meshes: [...drawn.entries()].map(([k, d]) => { d.mesh.geometry.computeBoundingBox(); const bb = d.mesh.geometry.boundingBox;
          return { key: k, textured: !!d.texture, box: [bb.min.toArray(), bb.max.toArray()], vertices: d.mesh.geometry.attributes.position.count }; }) };
    },
  };
}

// ── the Space's side: the section, the cursor, the preferences ───────────────

export interface LayerSpaceDeps {
  host: HTMLElement;
  handle: SpaceSceneHandle;
  t: T;
  person: () => string | null;
  doc: () => Doc;
  docPath: () => string | null;
  bridge: () => Promise<string>;
  /** the bridge's secret (`/py/layer-image` is behind it) */
  token: () => Promise<string | null>;
  /** the layers the plugins described, the last answer of `/py/compute` */
  layers: () => PluginLayer[];
  /** ask the plugins again (a Space opened) */
  ask: () => void;
  log?: (s: string) => void;
  /** MICRO-GEO13 · the plugins' tools of the Space (`space.tool@1`) */
  tools?: () => LayerTool[];
  /** …a trace complete: its command with the geometry */
  run?: (tool: LayerTool, geometry: Record<string, unknown>) => Promise<void>;
  toast?: (s: string) => void;
}

export interface LayerSpace {
  /** the section of the Space's «Visibilità ▾»: each stack shown, its mode, its cursor, its opacity */
  section(): HTMLElement;
  /** the plugins answered, or the graph moved: draw again */
  refresh(): void;
  destroy(): void;
  state(): unknown;
  /** the probes' and the keys' seam: the cursor of a stack moved (↑ −1, ↓ +1) or set */
  move(key: string, delta: number): void;
  setPref(key: string, p: LayerPref): void;
  /** MICRO-GEO13 · a click of the scene with a layer's tool armed: true = it was the tool's */
  toolClick(hit: ToolHit | null, dbl: boolean): boolean;
  /** arm a tool (its id) or none; the probes' seam */
  arm(id: string | null): void;
}

export function mountLayerSpace(d: LayerSpaceDeps): LayerSpace {
  const { t } = d;
  let driver: LayerDriver | null = null;
  let driverSig = "";
  const key = () => `emstudio.layers.${d.person() ?? "anon"}.${d.docPath() ?? String(d.doc()?.graph?.graph_id ?? "unsaved")}`;
  const load = (): Record<string, LayerPref> => {
    try { const raw = JSON.parse(localStorage.getItem(key()) ?? "null"); return raw && typeof raw === "object" ? raw : {}; } catch { return {}; }
  };
  let prefs = load();
  let loadedFor = key();
  const save = () => { try { localStorage.setItem(key(), JSON.stringify(prefs)); } catch { /* kept in memory */ } };
  const pref = (k: string): LayerPref => prefs[k] ?? {};

  const post = async (bridge: string, route: string, body: Record<string, unknown>) => {
    const r = await fetch(`${bridge}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ...(await r.json().catch(() => ({}))), status: r.status } as Record<string, any>;
  };

  /** the heights of a landscape surface in the scene's CRS (the GIS ground's route) */
  const surface = async (bridge: string, frame: SceneFrame, id: string): Promise<HeightGrid | null> => {
    const s = surfacesOf(d.doc()).find((x) => x.id === id);
    const dem = s?.dem ? gisLayersOf(d.doc()).find((x) => x.id === s.dem) : undefined;
    if (!s || !dem) return null;
    const j = await post(bridge, "/gis/surface", { dem: fileOf(dem.url, d.docPath()), image: null, scene_crs: `EPSG:${frame.epsg}`, step: s.step, dem_crs: dem.crs });
    if (!j.ok) { d.log?.(`space.layer: ${s.name} — ${j.error ?? j.status}`); return null; }
    return { x0: j.x0, y0: j.y0, step: j.step, nx: j.nx, ny: j.ny, heights: j.heights };
  };

  // the depth cursor over the scene: of the stacks drawn one at a time / down to, the one with the most
  // slices (the first on a tie) — UA Ilici's sectors of two products must not take it from Alcudia's 601
  const hud = document.createElement("div");
  hud.className = "plg-depth hidden";
  hud.dataset.plgDepth = "";
  hud.tabIndex = 0;
  for (const ev of ["pointerdown", "dblclick", "contextmenu", "wheel"]) hud.addEventListener(ev, (e) => e.stopPropagation());
  hud.addEventListener("keydown", (e) => {
    const k = hud.dataset.plgKey;
    if (!k || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault(); e.stopPropagation();
    move(k, e.key === "ArrowUp" ? -1 : 1);
  });
  d.host.appendChild(hud);

  const drawHud = () => {
    const ls = d.layers();
    const p = ls.filter((x) => !pref(layerKey(x)).hidden && modeOf(x.layer, pref(layerKey(x))) !== "all" && horizontalsOf(x.layer).length > 1)
      .reduce<typeof ls[number] | undefined>((best, x) => !best || horizontalsOf(x.layer).length > horizontalsOf(best.layer).length ? x : best, undefined);
    if (!p) { hud.classList.add("hidden"); hud.dataset.plgKey = ""; return; }
    const k = layerKey(p);
    const hs = horizontalsOf(p.layer);
    const at = cursorOf(p.layer, pref(k));
    hud.dataset.plgKey = k;
    hud.classList.remove("hidden");
    hud.textContent = "";
    const up = document.createElement("button");
    up.type = "button"; up.textContent = "▲"; up.title = t("plyr.up"); up.dataset.plgStep = "-1";
    const down = document.createElement("button");
    down.type = "button"; down.textContent = "▼"; down.title = t("plyr.down"); down.dataset.plgStep = "1";
    const lab = document.createElement("span");
    lab.className = "plg-depth-label";
    lab.textContent = `${p.layer.name} · ${p.layer.items[hs[at]]?.label ?? ""} (${at + 1}/${hs.length})`;
    hud.title = t("plyr.keys");
    hud.append(up, lab, down);
  };
  hud.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-plg-step]");
    if (b && hud.dataset.plgKey) move(hud.dataset.plgKey, Number(b.dataset.plgStep));
  });

  // MICRO-GEO13 · the tracing bar: the tools of the plugins that drew a layer shown
  const bar = document.createElement("div");
  bar.className = "plg-trace hidden";
  bar.dataset.plgTrace = "";
  for (const ev of ["pointerdown", "dblclick", "contextmenu", "wheel"]) bar.addEventListener(ev, (e) => e.stopPropagation());
  d.host.appendChild(bar);
  let armed: LayerTool | null = null;
  let clicks: TraceClick[] = [];
  let busy = false;
  const offered = () => layerToolsFor(d.layers(), d.tools?.() ?? [], pref);
  const drawBar = () => {
    const ts = offered();
    if (armed && !ts.some((x) => x.id === armed!.id)) { armed = null; clicks = []; }
    bar.classList.toggle("hidden", !ts.length);
    bar.textContent = "";
    if (!ts.length) return;
    for (const tool of ts) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = tool.glyph || "◆"; b.dataset.plgTool = tool.id;
      const off = tool.disabled?.() ?? null;
      b.disabled = !!off;
      b.title = off ?? `${tool.label()} — ${t("plyr.trace.how")}`;
      b.classList.toggle("on", armed?.id === tool.id);
      bar.appendChild(b);
    }
    if (armed) {
      const s = document.createElement("span");
      s.className = "plg-trace-state";
      s.textContent = busy ? t("plyr.trace.busy") : t("plyr.trace.state", { n: String(clicks.length), tool: armed.label() });
      bar.appendChild(s);
      if (traceVerdict(armed, clicks.length) === "may_close") {
        const ok = document.createElement("button");
        ok.type = "button"; ok.textContent = "✓"; ok.title = t("plyr.trace.finish"); ok.dataset.plgFinish = "1";
        bar.appendChild(ok);
      }
      const no = document.createElement("button");
      no.type = "button"; no.textContent = "✕"; no.title = t("plyr.trace.cancel"); no.dataset.plgCancel = "1";
      bar.appendChild(no);
    }
  };
  const arm = (id: string | null) => {
    armed = id ? offered().find((x) => x.id === id) ?? null : null;
    clicks = [];
    drawBar();
  };
  const finish = async () => {
    const tool = armed;
    if (!tool || !clicks.length || busy) return;
    const done = clicks.slice();
    clicks = [];
    busy = true;
    drawBar();
    try {
      await d.run?.(tool, traceGeometry(tool.primitive, done, throughOf(d.layers(), done[0].item, pref)));
    } finally {
      busy = false;
      drawBar();
    }
  };
  bar.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    const b = el.closest<HTMLElement>("[data-plg-tool]");
    if (b) { arm(armed?.id === b.dataset.plgTool ? null : b.dataset.plgTool ?? null); return; }
    if (el.closest("[data-plg-finish]")) { void finish(); return; }
    if (el.closest("[data-plg-cancel]")) arm(null);
  });
  bar.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && armed) { e.preventDefault(); e.stopPropagation(); arm(null); }
    else if (e.key === "Enter" && armed && traceVerdict(armed, clicks.length) === "may_close") { e.preventDefault(); e.stopPropagation(); void finish(); }
  });
  const toolClick = (hit: ToolHit | null, dbl: boolean): boolean => {
    if (!armed) return false;
    if (dbl) {
      if (traceVerdict(armed, clicks.length) === "may_close") void finish();
      return true;                                   // a double click while tracing: not a zoom
    }
    if (busy) { d.toast?.(t("plyr.trace.busy")); return true; }
    const off = armed.disabled?.() ?? null;
    if (off) { d.toast?.(off); return true; }
    const lay = hit?.layer;
    if (!hit || !lay || lay.plugin !== armed.plugin) { d.toast?.(t("plyr.trace.onSlice")); return true; }
    const last = clicks[clicks.length - 1];
    if (last && last.item === lay.item && Math.hypot(last.uv[0] - lay.uv[0], last.uv[1] - lay.uv[1]) < 1e-9) return true;
    clicks.push({ point: hit.point, item: lay.item, uv: lay.uv });
    if (traceVerdict(armed, clicks.length) === "done") void finish();
    else drawBar();
    return true;
  };

  const sync = async () => {
    if (key() !== loadedFor) { prefs = load(); loadedFor = key(); }
    const ls = d.layers();
    drawHud();
    drawBar();
    if (!ls.length) {
      if (driver) { d.handle.setLayers(null); driver = null; driverSig = ""; }
      return;
    }
    const bridge = await d.bridge().catch(() => null);
    if (!bridge) return;
    const f = frameOf(d.doc());
    const sig = JSON.stringify([f, bridge, d.docPath()]);
    if (!driver || sig !== driverSig) {
      d.handle.setLayers(null);
      driver = createLayerDriver({
        frame: f,
        surface: (id) => (f ? surface(bridge, f, id) : Promise.resolve(null)),
        image: async (plugin, path) => {
          const token = await d.token();
          if (!token) return null;
          const r = await fetch(`${bridge}/py/layer-image?plugin=${encodeURIComponent(plugin)}&path=${encodeURIComponent(path)}`,
            { headers: { Authorization: `Bearer ${token}` } });
          return r.ok ? await r.blob() : null;
        },
        log: d.log,
      });
      driverSig = sig;
      d.handle.setLayers(driver);
    }
    driver.set(ls, pref);
  };

  const setPref = (k: string, p: LayerPref) => {
    prefs = { ...prefs, [k]: { ...pref(k), ...p } };
    save();
    void sync();
    redrawSection();
  };
  const move = (k: string, delta: number) => {
    const p = d.layers().find((x) => layerKey(x) === k);
    if (!p) return;
    setPref(k, { cursor: stepCursor(horizontalsOf(p.layer).length, cursorOf(p.layer, pref(k)), delta) });
  };

  const sections = new Set<HTMLElement>();
  const fill = (box: HTMLElement) => {
    box.textContent = "";
    const ls = d.layers();
    const h = document.createElement("div");
    h.className = "sol-lay-h";
    h.textContent = t("plyr.title");
    box.appendChild(h);
    if (!ls.length) {
      const n = document.createElement("small");
      n.className = "xf-note";
      n.textContent = t("plyr.none");
      box.appendChild(n);
      return;
    }
    const st = (driver?.state().layers ?? []) as Array<Record<string, unknown>>;
    for (const p of ls) {
      const k = layerKey(p);
      const l = p.layer;
      const pf = pref(k);
      const r = document.createElement("div");
      r.className = "gis-row plg-row";
      r.dataset.plgRow = k;
      const lab = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = !pf.hidden; cb.dataset.plgShow = k;
      cb.addEventListener("change", () => setPref(k, { hidden: !cb.checked }));
      const nm = document.createElement("span");
      nm.textContent = l.name;
      const op = document.createElement("input");
      op.type = "range"; op.min = "0.05"; op.max = "1"; op.step = "0.05";
      op.value = String(pf.opacity ?? l.opacity ?? 1);
      op.className = "sol-lay-op"; op.title = t("lay.opacity"); op.dataset.plgOpacity = k;
      op.addEventListener("change", () => setPref(k, { opacity: Number(op.value) }));
      lab.append(cb, nm, op);
      r.appendChild(lab);
      const hs = horizontalsOf(l);
      const vs = verticalsOf(l);
      const line = document.createElement("div");
      line.className = "plg-line";
      if (hs.length > 1) {
        const mode = document.createElement("select");
        mode.dataset.plgMode = k;
        const m = modeOf(l, pf);
        for (const v of ["all", "one", "up_to"] as DisplayMode[]) {
          const o = document.createElement("option");
          o.value = v; o.textContent = t(`plyr.mode.${v}`);
          if (v === "all" && hs.length > ALL_MAX) { o.disabled = true; o.title = t("plyr.allOver", { n: String(ALL_MAX) }); }
          o.selected = v === m;
          mode.appendChild(o);
        }
        mode.addEventListener("change", () => setPref(k, { mode: mode.value as DisplayMode }));
        const cur = document.createElement("input");
        cur.type = "range"; cur.min = "0"; cur.max = String(hs.length - 1); cur.step = "1";
        cur.value = String(cursorOf(l, pf));
        cur.dataset.plgCursor = k;
        cur.title = t("plyr.keys");
        cur.disabled = m === "all";
        cur.addEventListener("input", () => setPref(k, { cursor: Number(cur.value) }));
        line.append(mode, cur);
      }
      if (vs.length) {
        const sl = document.createElement("label");
        const sc = document.createElement("input");
        sc.type = "checkbox"; sc.checked = pf.sections !== false; sc.dataset.plgSections = k;
        sc.addEventListener("change", () => setPref(k, { sections: sc.checked }));
        sl.append(sc, ` ${t("plyr.sections", { n: String(vs.length) })}`);
        line.appendChild(sl);
      }
      if (line.childNodes.length) r.appendChild(line);
      const info = document.createElement("small");
      const s = st.find((x) => x.key === k);
      const at = cursorOf(l, pf);
      const many = (k: string, n: number) => t(`plyr.planes.${k}.${n === 1 ? "one" : "other"}`, { n: String(n) });
      const bits = [`${many("slices", hs.length)}, ${many("sections", vs.length)}`];
      if (hs.length && modeOf(l, pf) !== "all") bits.push(l.items[hs[at]]?.label ?? "");
      if (s?.how === "local") bits.push(t(`plyr.local.${String(s.why ?? "no_origin")}`));
      if (s?.ground === "draped") bits.push(t("plyr.draped"));
      if (Number(s?.noPicture)) bits.push(t("plyr.noPicture", { n: String(s?.noPicture) }));
      info.textContent = bits.filter(Boolean).join(" · ");
      r.appendChild(info);
      box.appendChild(r);
    }
  };
  function redrawSection() { for (const b of sections) { if (!b.isConnected) { sections.delete(b); continue; } fill(b); } }

  (d.host as unknown as { __pluginLayers?: () => unknown }).__pluginLayers = () => driver?.state() ?? null;
  d.ask();
  void sync();

  return {
    section() {
      const box = document.createElement("div");
      box.className = "gis-panel gis-in-data plg-panel";
      box.dataset.plgPanel = "1";
      for (const ev of ["pointerdown", "dblclick", "contextmenu", "wheel", "keydown"]) box.addEventListener(ev, (e) => e.stopPropagation());
      sections.add(box);
      fill(box);
      return box;
    },
    refresh() { void sync().then(redrawSection); },
    destroy() {
      d.handle.setLayers(null);
      driver = null;
      hud.remove();
      bar.remove();
      sections.clear();
    },
    state: () => ({ prefs, driver: driver?.state() ?? null, hud: hud.classList.contains("hidden") ? null : hud.dataset.plgKey,
      trace: { tools: offered().map((x) => x.id), armed: armed?.id ?? null, clicks: clicks.map((c) => ({ item: c.item, uv: c.uv })), busy } }),
    move,
    setPref,
    toolClick,
    arm,
  };
}
