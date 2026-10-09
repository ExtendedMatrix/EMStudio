/**
 * SHIFT-A fase 6b · the glyphs, drawn FROM THEIR PATHS.
 *
 * `em_visual_rules.2d_glyphs` carries every glyph as vector layers (NIGHT-GLIFI,
 * approved 30 set): one path, one colour, one ROLE per layer, coordinates in a
 * viewBox from the origin. This module builds each glyph's layers ONCE — the
 * `Path2D`s are made on first use and cached — and is the one place that draws
 * them, on the canvas (`drawGlyph`) and as SVG (`glyphSvg`, for the export and
 * for the inline icons of the menus and lists).
 *
 * Why it retires the bitmaps: an SVG drawn with `drawImage` is rasterised at its
 * natural ~23 px by WebKit and scaled up (soft), and a file can be missing in
 * silence. A path is sharp at every zoom, in every engine, and it cannot be
 * missing — it is in the datamodel. PELLE's patch (`crispImage`, a raster per
 * zoom band) stays only for the types that have no entry here.
 *
 * THE THEME. The hex of a layer is ALWAYS the canonical EM colour. Its role says
 * what the colour does, and `2d_glyphs._roles[role].recolor` says whether a
 * consumer may adapt it: on a dark canvas `ink` becomes the theme's ink, `paper`
 * the theme's ground and `halo` flips from black to white (same opacity); every
 * other role (`ground`, `accent`) keeps its hex, always.
 *
 * Pure apart from `Path2D`, which is created lazily — so the resolution, the
 * roles and the SVG are exercised in node (`scripts/check-glyphs.mjs`).
 */
import rules from "./assets/em_visual_rules.json";

interface RawLayer {
  d: string;
  role?: string;
  fill?: string;
  stroke?: string;
  stroke_width?: number;
  fill_rule?: string;
  line_cap?: string;
  line_join?: string;
  opacity?: number;
  /** 1.6.32 · a layer of the DTC frame (the circle): skipped below 24 px */
  frame?: boolean;
}
interface RawGlyph {
  viewBox: [number, number, number, number];
  aspect: number;
  layers: RawLayer[];
  source?: string;
  /** 1.6.32 · the box of every layer but the frame's, in viewBox units */
  frameless_box?: [number, number, number, number];
}

export interface GlyphLayer {
  d: string;
  role: string;
  fill?: string;
  stroke?: string;
  /** in viewBox units: it scales with the glyph */
  strokeWidth?: number;
  fillRule?: CanvasFillRule;
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
  opacity?: number;
  /** a layer of the frame (`frame: true` in the datamodel) */
  frame?: boolean;
  /** built on first draw (the browser's), null where there is no Path2D */
  path?: Path2D | null;
}

export interface Glyph {
  key: string;
  viewBox: [number, number, number, number];
  aspect: number;
  layers: GlyphLayer[];
  /** G9 · what to fit instead of the viewBox when the frame is skipped */
  frameless?: [number, number, number, number];
}

/** G9 · under this size on screen (px) a framed glyph is drawn WITHOUT its
 *  frame, larger: «Disegnare un glifo» §5, the consumer's option. */
export const FRAMELESS_BELOW_PX = 24;

const BLOCK = (rules as unknown as { "2d_glyphs"?: Record<string, unknown> })["2d_glyphs"] ?? {};

/** role → may a consumer recolour it (the datamodel's `_roles`, closed vocabulary). */
const RECOLOR: Record<string, boolean> = (() => {
  const out: Record<string, boolean> = {};
  const roles = (BLOCK["_roles"] ?? {}) as Record<string, { recolor?: unknown }>;
  for (const [k, v] of Object.entries(roles))
    if (!k.startsWith("_") && v && typeof v === "object") out[k] = v.recolor === true;
  return out;
})();

export function roleRecolors(role: string): boolean {
  return RECOLOR[role] === true;
}

/** The node types drawn as a centred glyph (`2d_render_glyph_types.types`). */
const GLYPH_TYPES: ReadonlySet<string> = new Set(
  ((rules as unknown as { "2d_render_glyph_types"?: { types?: string[] } })[
    "2d_render_glyph_types"
  ]?.types ?? []),
);

const cache = new Map<string, Glyph | null>();

/** The glyph of a KEY (a node_type, or `dtc:<kind>`), or null when the datamodel
 *  describes none. */
export function glyphByKey(key: string): Glyph | null {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const raw = BLOCK[key] as RawGlyph | undefined;
  let g: Glyph | null = null;
  if (raw && Array.isArray(raw.viewBox) && Array.isArray(raw.layers) && raw.layers.length) {
    g = {
      key,
      viewBox: raw.viewBox,
      aspect: typeof raw.aspect === "number" && raw.aspect > 0 ? raw.aspect : raw.viewBox[2] / raw.viewBox[3],
      layers: raw.layers.map((l) => ({
        d: l.d,
        role: l.role ?? "ink",
        fill: l.fill,
        stroke: l.stroke,
        strokeWidth: l.stroke_width,
        fillRule: l.fill_rule === "evenodd" ? "evenodd" : "nonzero",
        lineCap: (l.line_cap as CanvasLineCap | undefined) ?? "butt",
        lineJoin: (l.line_join as CanvasLineJoin | undefined) ?? "miter",
        opacity: typeof l.opacity === "number" ? l.opacity : undefined,
        frame: l.frame === true,
      })),
      frameless: Array.isArray(raw.frameless_box) && raw.frameless_box.length === 4
        ? raw.frameless_box : undefined,
    };
  }
  cache.set(key, g);
  return g;
}

/**
 * The glyph a NODE draws, in the renderer's order: a type that is a glyph type
 * draws its own entry; otherwise a `data.dtc_kind` picks `dtc:<kind>`. Null =
 * the node is not drawn from paths (a shape, or a type with no entry — which
 * falls back to its `shape`, as the page «Disegnare un glifo» says).
 */
export function glyphFor(nodeType: string, data?: Record<string, unknown> | null): Glyph | null {
  if (GLYPH_TYPES.has(nodeType)) return glyphByKey(nodeType);
  const kind = data?.["dtc_kind"];
  if (typeof kind === "string") return glyphByKey(`dtc:${kind}`);
  const dk = dataGlyphKey(nodeType, data);
  return dk ? glyphByKey(dk) : null;
}

/**
 * G9 · the glyph a node takes from its DATA (`2d_render_glyph_types.data_glyphs`,
 * 1.6.32): the proxy, the tileset, the RM container and the versions
 * `version:<kind>`. The first entry whose `when` matches — an alternative
 * matches when every one of its fields has one of its values: `node_type`,
 * `data.<field>` (a list matches by any item), `url_ext`, `url_name` — as
 * «Disegnare un glifo» §1 tells a consumer. Null: no entry matches.
 */
interface DataGlyphSpec { glyph?: string; label?: string; when?: Array<Record<string, string[]>> }
const DATA_GLYPHS: Array<[string, DataGlyphSpec]> = Object.entries(
  ((rules as unknown as { "2d_render_glyph_types"?: { data_glyphs?: Record<string, unknown> } })[
    "2d_render_glyph_types"]?.data_glyphs ?? {}) as Record<string, DataGlyphSpec>,
).filter(([k, v]) => !k.startsWith("_") && v && Array.isArray(v.when));

export function dataGlyphKey(nodeType: string, data?: Record<string, unknown> | null): string | null {
  if (!DATA_GLYPHS.length) return null;
  const url = String(data?.["url"] ?? "").split("?")[0].replace(/\/+$/, "").toLowerCase();
  const name = url.slice(url.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const field = (f: string): string[] => {
    if (f === "node_type") return [nodeType];
    if (f === "url_ext") return [ext];
    if (f === "url_name") return [name];
    if (!f.startsWith("data.")) return [];
    const v = data?.[f.slice(5)];
    return Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)];
  };
  for (const [key, spec] of DATA_GLYPHS)
    for (const alt of spec.when!)
      if (Object.entries(alt).every(([f, vals]) => field(f).some((x) => vals.includes(x)))) return key;
  return null;
}

/** The label the datamodel gives a data glyph («Version · glTF»), or null. */
export function dataGlyphLabel(key: string): string | null {
  return DATA_GLYPHS.find(([k]) => k === key)?.[1].label ?? null;
}

/** Every key the datamodel draws from paths — for the checks. */
export function glyphKeys(): string[] {
  return Object.keys(BLOCK).filter((k) => !k.startsWith("_"));
}

/** The colours a theme gives the recolourable roles (dark only; light keeps the hex). */
export interface GlyphInk {
  ink: string;
  paper: string;
  /** a dark canvas: the halo flips from black to white */
  dark: boolean;
}

/** The colour a layer is painted in, under a theme. */
export function layerColor(l: GlyphLayer, theme?: GlyphInk | null): string {
  const hex = (l.fill ?? l.stroke ?? "#000000");
  if (!theme?.dark || !roleRecolors(l.role)) return hex;
  if (l.role === "ink") return theme.ink;
  if (l.role === "paper") return theme.paper;
  if (l.role === "halo") return "#FFFFFF";
  return hex;
}

/**
 * Draw `g` into the rect (x, y, w, h) — a "contain" fit of its viewBox, centred.
 * The caller passes the rect `glyphRectOf` gives (the one the hit test uses), so
 * the fit is exact; a different aspect is centred, never stretched. The stroke
 * width is in viewBox units and scales with the glyph.
 */
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  g: Glyph,
  x: number,
  y: number,
  w: number,
  h: number,
  theme?: GlyphInk | null,
  /** G9 · the size the glyph takes ON SCREEN, in px: under 24 a framed glyph
   *  drops its frame and fills the box with the drawing (`frameless_box`) */
  screenPx?: number,
): void {
  const bare = !!g.frameless && screenPx !== undefined && screenPx < FRAMELESS_BELOW_PX;
  const [bx, by, vw, vh] = bare ? g.frameless! : [0, 0, g.viewBox[2], g.viewBox[3]];
  const s = Math.min(w / vw, h / vh);
  ctx.save();
  ctx.translate(x + (w - vw * s) / 2 - bx * s, y + (h - vh * s) / 2 - by * s);
  ctx.scale(s, s);
  ctx.setLineDash([]);
  for (const l of g.layers) {
    if (bare && l.frame) continue;
    if (l.path === undefined) l.path = typeof Path2D === "function" ? new Path2D(l.d) : null;
    if (!l.path) continue;
    ctx.globalAlpha = l.opacity ?? 1;
    const color = layerColor(l, theme);
    if (l.stroke) {
      ctx.strokeStyle = color;
      ctx.lineWidth = l.strokeWidth ?? 1;
      ctx.lineCap = l.lineCap ?? "butt";
      ctx.lineJoin = l.lineJoin ?? "miter";
      ctx.stroke(l.path);
    } else {
      ctx.fillStyle = color;
      ctx.fill(l.path, l.fillRule ?? "nonzero");
    }
  }
  ctx.restore();
}

/**
 * The HIT area of a glyph: the FIRST GROUND LAYER — the backmost layer, when it
 * is a filled one (the disc of the extractor and of the combiner's veil, the
 * paper of a DTC card, the author's ring): the silhouette the eye reads as «the
 * glyph». Plus the TOCCARE tolerance, in screen pixels, around its edge.
 *
 * `null` = no such layer (a glyph whose first layer is a stroke — four DTC ones)
 * or no `Path2D` here: the caller keeps the glyph's rect, which is the rule
 * «se fondo non c'è, il rettangolo del glifo».
 */
export function glyphContains(
  ctx: CanvasRenderingContext2D,
  g: Glyph,
  rect: { x: number; y: number; w: number; h: number },
  wx: number,
  wy: number,
  tolWorld = 0,
): boolean | null {
  const base = groundLayer(g);
  if (!base) return null;
  if (base.path === undefined) base.path = typeof Path2D === "function" ? new Path2D(base.d) : null;
  if (!base.path) return null;
  const [, , vw, vh] = g.viewBox;
  const s = Math.min(rect.w / vw, rect.h / vh);
  const px = (wx - (rect.x + (rect.w - vw * s) / 2)) / s;
  const py = (wy - (rect.y + (rect.h - vh * s) / 2)) / s;
  if (ctx.isPointInPath(base.path, px, py, base.fillRule ?? "nonzero")) return true;
  if (tolWorld <= 0) return false;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = (2 * tolWorld) / s;
  const near = ctx.isPointInStroke(base.path, px, py);
  ctx.restore();
  return near;
}

/** The first ground layer: `layers[0]` when it is FILLED, else null. */
export function groundLayer(g: Glyph): GlyphLayer | null {
  const first = g.layers[0];
  return first && first.fill && !first.stroke ? first : null;
}

const escAttr = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** The layers as SVG `<path>` elements in viewBox units (no `<svg>` wrapper);
 *  `bare` leaves the frame's layers out (G9). */
export function glyphPathsSvg(g: Glyph, theme?: GlyphInk | null, bare = false): string {
  return g.layers
    .filter((l) => !(bare && l.frame))
    .map((l) => {
      const c = layerColor(l, theme);
      const op = l.opacity !== undefined ? ` opacity="${l.opacity}"` : "";
      if (l.stroke)
        return `<path d="${escAttr(l.d)}" fill="none" stroke="${c}" stroke-width="${l.strokeWidth ?? 1}"` +
          (l.lineCap && l.lineCap !== "butt" ? ` stroke-linecap="${l.lineCap}"` : "") +
          (l.lineJoin && l.lineJoin !== "miter" ? ` stroke-linejoin="${l.lineJoin}"` : "") +
          `${op}/>`;
      return `<path d="${escAttr(l.d)}" fill="${c}"` +
        (l.fillRule === "evenodd" ? ` fill-rule="evenodd"` : "") + `${op}/>`;
    })
    .join("");
}

/** A standalone inline `<svg>` of the glyph, sized by the caller's CSS.
 *  `px` is the size it is shown at: under 24 the frame is left out and the
 *  viewBox is the drawing's own box (G9, «Disegnare un glifo» §5). */
export function glyphSvg(g: Glyph, theme?: GlyphInk | null, px?: number): string {
  const bare = !!g.frameless && px !== undefined && px < FRAMELESS_BELOW_PX;
  const [bx, by, vw, vh] = bare ? g.frameless! : [0, 0, g.viewBox[2], g.viewBox[3]];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bx} ${by} ${vw} ${vh}" ` +
    `preserveAspectRatio="xMidYMid meet" aria-hidden="true">${glyphPathsSvg(g, theme, bare)}</svg>`;
}
