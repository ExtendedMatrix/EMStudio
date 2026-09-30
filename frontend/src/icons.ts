// Official s3Dgraphy 2D icons (JSON_config/src/2D), shared by the palette
// and the canvas renderer. Inlined as data URLs at build time.
import rules from "./assets/em_visual_rules.json";

const ICON_FILES = import.meta.glob("./assets/icons2d/*.{png,svg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

// DTC profile glyphs (2017 DTC SVG set); resolved data-driven by basename from
// dtc_kinds[*][kind].glyph (see rules.dtcGlyphName). Adding a kind = a new SVG
// here + a dtc_kinds entry, no code change.
const GLYPH_FILES = import.meta.glob("./assets/dtc-glyphs/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** node_type → the key it has in `em_visual_rules.node_styles`. Mirrors the
 *  alias table in palette.ts: the two files answer different questions about
 *  the same mapping, and both need it. */
const STYLE_KEY: Record<string, string> = {
  property: "PROP",
  combiner: "COMB",
  extractor: "EXT",
  document: "DOC",
  EpochNode: "EP",
  epoch: "EP",
  author: "AUTH",
  author_ai: "AUTH_AI",
  // MIG1 renamed the node_type `link` → `resource` (model.ts migrates it at
  // load), and this table kept the old name: every resource read no style
  // entry, so the declaration of LINK was never the one that won. `link` stays
  // for whatever reads a file before the migration runs.
  resource: "LINK",
  link: "LINK",
  // s3Dgraphy 1.6.17: the file of a resource, drawn from its own glyph
  // (`node_styles.FILE.2d_file_vect` = src/2D/resource_file.svg, rules 1.6.27)
  resource_file: "FILE",
  geo_position: "GEO",
  semantic_shape: "SS",
  representation_model: "RM",
  representation_model_doc: "RMDoc",
  representation_model_sf: "RMSF",
  license: "LIC",
  embargo: "EMB",
  graph: "GRAPH",
  // POL4: `narrative` was MISSING, which made its declaration unreadable — the
  // lookup asked `node_styles["narrative"]`, found nothing, and silently fell
  // back to the basename convention. Same failure shape as POL2's stale paths:
  // no error, just the wrong (or in this case the superseded) drawing.
  narrative: "NARR",
};

/** Icon files that several node types legitimately share. `BR` is drawn with
 *  the continuity glyph; the two series-of-virtual types share one drawing. */
const FILE_ALIAS: Record<string, string> = {
  BR: "continuity",
  serUSVn: "serUSV",
  serUSVs: "serUSV",
};

function asset(basename: string, rasterFirst = false): string | null {
  const svg = ICON_FILES[`./assets/icons2d/${basename}.svg`] ?? null;
  const png = ICON_FILES[`./assets/icons2d/${basename}.png`] ?? null;
  // Vector first, EXCEPT where the datamodel says otherwise (see preferRaster).
  return rasterFirst ? (png ?? svg) : (svg ?? png);
}

/**
 * `2d_icon_prefer: "raster"` — the datamodel's own answer to "which of the two
 * files is the icon?" (POL5).
 *
 * Two node types declare a vector that is an ILLUSTRATION rather than a glyph:
 * NARR (EMNarrative.svg, 617 KB) and SE (SE.svg, 284 KB), both stipple traces of
 * a drawing. Nothing here draws a 2D icon taller than 30 px, so the vector buys
 * nothing and costs, in this delivery, its full weight inlined as a data URL.
 *
 * A FLAG and not a size rule: "big" would be a guess, and POL2 refused a size
 * threshold for exactly that reason. This way the decision is E.D.'s, recorded
 * where the rest of the type's look is recorded, and the vendor script reads the
 * same field — so what gets copied and what gets drawn cannot disagree.
 */
function preferRaster(nodeType: string): boolean {
  const entry = styleEntries[STYLE_KEY[nodeType] ?? nodeType];
  return entry?.["2d_icon_prefer"] === "raster";
}

/** The `em_visual_rules.node_styles` key a node_type reads. */
export function styleKeyFor(nodeType: string): string {
  return STYLE_KEY[nodeType] ?? nodeType;
}

const styleEntries = (rules as unknown as {
  node_styles?: Record<string, Record<string, unknown>>;
}).node_styles ?? {};

/** Every basename that is some node type's OWN name. A declaration pointing at
 *  one of these, for a DIFFERENT type, is a mistake in the datamodel rather
 *  than deliberate sharing — deliberate sharing is spelled out in FILE_ALIAS. */
const OWN_NAMES = new Set(Object.keys(styleEntries));

function declaredBasenames(nodeType: string): string[] {
  const entry = styleEntries[STYLE_KEY[nodeType] ?? nodeType];
  if (!entry) return [];
  const out: string[] = [];
  // vector first: it is what the datamodel declares as the preferred form
  for (const key of ["2d_file_vect", "2d_file_rast", "file_2d"]) {
    const path = entry[key];
    if (typeof path !== "string") continue;
    const base = path.split("/").pop()?.replace(/\.(svg|png)$/i, "");
    if (!base || out.includes(base)) continue;
    // Refuse a declaration that names ANOTHER type's own file. `USVn` and `USN`
    // both declare `src/2D/US.png`, and honouring that would hand them the
    // positive-US icon — a wrong drawing, arrived at by trusting a wrong field.
    // Sharing that IS intended lives in FILE_ALIAS, spelled out.
    if (base !== nodeType && base !== FILE_ALIAS[nodeType]
        && OWN_NAMES.has(base)) continue;
    out.push(base);
  }
  return out;
}

const urlCache = new Map<string, string | null>();

/**
 * The icon file for a node type, or null when there is none.
 *
 * Resolution order, and the reason it is this one:
 *
 *   1. whatever `em_visual_rules.json` DECLARES, vector before raster;
 *   2. an SVG or PNG named after the node type itself — the convention most of
 *      the shipped files follow;
 *   3. the same for a known shared file (`BR` → continuity, serUSVn/s → serUSV).
 *
 * The declaration came LAST until POL4, to protect against two wrong fields:
 * `USVn` and `USN` both declare `src/2D/US.png`, and trusting that first would
 * hand USVn the positive-US icon. But that protection now lives where it belongs —
 * `declaredBasenames` refuses any declaration naming ANOTHER type's own file —
 * so "name first" had stopped buying safety and started costing correctness: NARR
 * declares `EMNarrative.svg` and kept getting `narrative.png`, the placeholder it
 * was meant to replace, because the node_type is spelled `narrative`.
 *
 * MEASURED, not assumed: over all 56 node_type / style keys the two orders resolve
 * to the SAME file everywhere except `narrative`. The datamodel's mismatches are
 * reported in `.claude/wip/icone-davvero-scoperte.md`.
 *
 * Everything resolves to a bundled asset: the build inlines these as data URLs,
 * so there is no runtime fetch and no dependency on the file layout at runtime.
 */
export function iconUrlFor(nodeType: string): string | null {
  const cached = urlCache.get(nodeType);
  if (cached !== undefined) return cached;
  const candidates = [
    ...declaredBasenames(nodeType),
    nodeType,
    FILE_ALIAS[nodeType],
  ].filter(Boolean) as string[];
  const rasterFirst = preferRaster(nodeType);
  let url: string | null = null;
  for (const base of candidates) {
    url = asset(base, rasterFirst);
    if (url) break;
  }
  urlCache.set(nodeType, url);
  return url;
}

/** URL of a DTC glyph SVG by basename (e.g. "03_mesh"), or null if absent. */
export function dtcGlyphUrl(basename: string | null): string | null {
  if (!basename) return null;
  return GLYPH_FILES[`./assets/dtc-glyphs/${basename}.svg`] ?? null;
}

/** node types drawn ON CANVAS as their official icon (yEd parity).
 *
 * This is NOT "every type that has a file". A US is a rectangle in yEd, a USVs a
 * parallelogram: their shape IS the language, and their border colour carries
 * the certainty. Replacing the drawn shape with a bitmap of a shape would lose
 * both. Only the types that are genuinely ICONS in the palette belong here.
 *
 * The rights nodes join extractor/combiner because that is what they are in the
 * GraphML: `y:ImageNode`s carrying the palette bitmap (a person, a robot, the
 * licence mark, a no-entry sign), identified by their `A.` / `AI.` / `LI.` /
 * `EB.` label prefix. Drawing them from `style.shape` instead produced a star, a
 * star, a rounded rectangle and an octagon — four shapes with no relation to
 * what the author sees in yEd.
 *
 * property and document are NOT here: property's PNG embeds the word
 * "property", and the document sheet must carry ITS OWN border (thick =
 * canonical, coloured by geometry variant) — both are drawn vectorially.
 *
 * `narrative` joins them for the same reason as the rights nodes: it is an
 * icon, not a shape. It had no visual rule at all until N7 and fell through to
 * `unknown` — a red dotted question mark on every canvas holding a story.
 *
 * EM2: the list is no longer written here. It is `2d_render_glyph_types.types` in
 * `em_visual_rules`, because the LAYOUT ENGINE needs the same fact — a node drawn
 * as a centred square glyph must get a square box, or the connect handle anchors
 * to the right edge of a wider box and floats away from the glyph. A set kept in
 * this file was invisible to em-core, so the two would have had to agree by
 * coincidence. Everything the paragraphs above say is now said in that block's
 * `_comment`, where the next consumer will look for it. */
export const ICON_NODE_TYPES: ReadonlySet<string> = new Set(
  (
    (rules as unknown as {
      "2d_render_glyph_types"?: { types?: string[] };
    })["2d_render_glyph_types"]?.types ?? []
  ),
);

const imageCache = new Map<string, HTMLImageElement>();
let redraw: (() => void) | null = null;

/** the renderer asks for a repaint when an icon finishes decoding */
export function setIconRedraw(fn: () => void): void {
  redraw = fn;
}

/** Decode-and-cache an image by URL; triggers a repaint on load. */
export function imageForUrl(url: string | null): HTMLImageElement | null {
  if (!url) return null;
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.onload = () => redraw?.();
    img.src = url;
    imageCache.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function imageFor(nodeType: string): HTMLImageElement | null {
  return imageForUrl(iconUrlFor(nodeType));
}

// ── Crisp glyphs (PELLE) ────────────────────────────────────────────────────
//
// The vendored SVGs carry a viewBox and no width/height (extractor.svg is
// `viewBox="0 0 23.51 23.51"`). Loaded as an `Image` and drawn with
// `drawImage`, WebKit (Tauri on macOS) rasterises such an SVG at its NATURAL size
// — ~23 px — and then scales that bitmap up: soft edges, thin strokes. Chromium
// hides it better but does the same at some zooms.
//
// So an SVG glyph is rasterised ONCE per scale band at the size it will actually
// occupy on the device: the SVG text gets an explicit width/height (so its
// intrinsic size IS the target, in every engine), is decoded, and painted into an
// offscreen canvas that the renderer then blits. Bands are half-octaves
// (1×, 1.41×, 2×, 2.83×, 4×, …) of (drawn size × devicePixelRatio × zoom), rounded UP, so
// a band serves a whole range of zooms and the cache stays small; above
// MAX_SIDE px the engine's own vector path draws the plain image (a bitmap that
// big buys nothing and costs memory). The asset files are not touched: they are
// vendored from the datamodel.

const MAX_SIDE = 2048;
const svgTextCache = new Map<string, string | null>();
const crispCache = new Map<string, HTMLCanvasElement | null>();

function svgText(url: string): string | null {
  const hit = svgTextCache.get(url);
  if (hit !== undefined) return hit;
  let text: string | null = null;
  try {
    const m = /^data:image\/svg\+xml(;base64)?,(.*)$/s.exec(url);
    if (m) {
      text = m[1]
        ? new TextDecoder().decode(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)))
        : decodeURIComponent(m[2]);
    }
  } catch {
    text = null;
  }
  svgTextCache.set(url, text);
  return text;
}

/** the root <svg …> tag with width/height forced to the target pixels */
function sizedSvg(text: string, w: number, h: number): string | null {
  const m = /<svg\b[^>]*>/i.exec(text);
  if (!m) return null;
  const tag = m[0]
    .replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/<svg\b/i, `<svg width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"`)
    .replace(/\spreserveAspectRatio\s*=\s*("[^"]*"|'[^']*')(?=[^>]*preserveAspectRatio)/i, "");
  return text.slice(0, m.index) + tag + text.slice(m.index + m[0].length);
}

/** the smallest band ≥ the wanted device-pixel scale */
export function scaleBand(pixelScale: number): number {
  // half-octave steps (1, 1.41, 2, 2.83, 4, …): the blit then shrinks the
  // bitmap by at most √2, which smoothing handles without visible stair-steps
  return 2 ** (Math.max(0, Math.ceil(2 * Math.log2(Math.max(1e-6, pixelScale)))) / 2);
}

/**
 * A crisp bitmap of `img` for a draw of `w × h` world units at `pixelScale`
 * device pixels per unit (dpr × zoom), or `img` itself when it is a raster, not
 * ready yet, or cannot be re-sized. The caller draws the result into the same
 * `w × h` box — the only thing that changes is how many pixels it carries.
 */
export function crispImage(
  img: HTMLImageElement,
  w: number,
  h: number,
  pixelScale: number,
): CanvasImageSource {
  const url = img.src;
  const text = svgText(url);
  if (!text || typeof document === "undefined") return img;
  const band = scaleBand(pixelScale);
  const pw = Math.max(1, Math.ceil(w * band));
  const ph = Math.max(1, Math.ceil(h * band));
  if (pw > MAX_SIDE || ph > MAX_SIDE) return img;
  const key = `${url.length}:${url.slice(-48)}|${pw}x${ph}`;
  const hit = crispCache.get(key);
  if (hit) return hit;
  if (hit === null) return img; // in flight, or failed: the plain image meanwhile
  crispCache.set(key, null);
  const src = sizedSvg(text, pw, ph);
  if (!src) return img;
  const raster = new Image(pw, ph);
  raster.onload = () => {
    const c = document.createElement("canvas");
    c.width = pw;
    c.height = ph;
    const cx = c.getContext("2d");
    if (!cx) return;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(raster, 0, 0, pw, ph);
    crispCache.set(key, c);
    redraw?.();
  };
  raster.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
  return img;
}
