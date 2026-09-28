/**
 * The two themes, and the ONE place the canvas gets its colours from (DARK1).
 *
 * The chrome is CSS (`style.css`, `:root` + `[data-theme="dark"]`); a canvas
 * cannot read CSS variables, so the renderer needs the same palette as an object.
 * The keys mirror the CSS token names on purpose: a colour changed on one side is
 * findable on the other, and the two cannot drift into "nearly the same grey".
 *
 * # What is NOT in here, and why it matters
 *
 * The **semantic colours of the EM language** — the fill and border of a US, the
 * teal of an SE, the group title tabs, the document variant colours — come from
 * `em_visual_rules` (s3Dgraphy) and never from a theme. They are DATA about the
 * language, not decoration: a US is that red in both themes, or the two themes
 * would disagree about what the drawing means, and a screenshot from one would
 * mislead a reader of the other.
 *
 * So the theme supplies what is AROUND them: canvas, lanes, panel chrome drawn on
 * the canvas, label ink, selection rings, the connect handle, the group container
 * wash. Where a semantic fill needs help to stay readable (a label ON a coloured
 * node), the theme adapts the LABEL, never the fill — see `labelOn`.
 */

export type ThemeMode = "light" | "dark" | "auto";
export type ThemeName = "light" | "dark";

export interface CanvasTheme {
  /** page behind everything the canvas draws */
  canvasBg: string;
  /** alternating swimlane bands (matrix view) */
  laneA: string;
  laneB: string;
  /** the hairline between two bands */
  laneLine: string;
  /** hairline around a chip / title-tab that carries a semantic fill, to
   *  separate it from the surface behind it (mirrors CSS --border) */
  chipBorder: string;
  /** the NEUTRAL lane label chip + its ink — the fallback for an epoch that
   *  declares no colour. A coloured epoch fills the chip with its own colour
   *  and takes labelOn(colour) for the ink, so these two are used only then. */
  laneChip: string;
  laneChipInk: string;
  /** default label ink on the canvas background */
  labelInk: string;
  /** muted canvas text (band names, counts, hints) */
  labelMuted: string;
  /** selection / hover accents. PELLE: ochre (the EM design system's
   *  `em-accent`) — the selection is the one warm thing on the canvas. */
  accent: string;
  selectSoft: string;
  /** the translucent washes under a selected node (active / other selected)
   *  and inside the marquee — screen-space overlays drawn by main.ts */
  selectWash: string;
  selectWashSoft: string;
  marqueeWash: string;
  /** P4.3 · the awareness ring: somebody ELSE's selection in a live room.
   *  Deliberately not the selection colour — a ring that looked like yours would
   *  make you think you had clicked something. */
  peerAware: string;
  hoverSoft: string;
  /** TOCCARE · the wash of a drop target (lane / band) during a drag — the
   *  CSS `--bg-hover`, the same wash a hovered row has in the chrome */
  bgHover: string;
  /** group container: body wash, dashed border, header tint fallback.
   *  The header TITLE ink is not a theme value: the title-tab carries a
   *  semantic label_background, so the ink is labelOn(that fill) — see
   *  DARK2. groupHeaderFallback is used only when a group has no fill. */
  groupBody: string;
  groupBorder: string;
  groupHeaderFallback: string;
  /** connect handle (the bullet on a node's right edge) */
  handleFill: string;
  handleRing: string;
  /** edge ink when an edge type declares none */
  edgeDefault: string;
  /** CONN-NIGHT · theme-aware connector ink: the CONTINUOUS ink family
   *  (generic + is_after + everything not in the provenance family) — dark in
   *  light theme, light in dark theme. The dash PATTERN stays per edge-type
   *  (geometry, in palette.edgeStyle), only the colour is themed. */
  edgeInk: string;
  /** the provenance/property/extraction/documentation family — ochre, dark in
   *  light theme, light in dark theme. */
  edgeProvenance: string;
  /** the neutral fill a node falls back to when the rules give none */
  nodeFallbackFill: string;
  /** ink on an accent (ochre) fill: count badges, folded-group badges */
  onAccent: string;
  /** ink for a label drawn ON a coloured (semantic) fill — see labelOn() */
  onLight: string;
  onDark: string;
}

const LIGHT: CanvasTheme = {
  canvasBg: "#FBFCFE",
  laneA: "#EDF3FA",
  laneB: "#F7FAFD",
  laneLine: "#D5E0EC",
  chipBorder: "#d8dee6",
  laneChip: "#FFFFFFE6",
  laneChipInk: "#2c4a6e",
  labelInk: "#1a1a1a",
  labelMuted: "#46505c",
  accent: "#BF9000",
  selectSoft: "#D4B04A",
  selectWash: "rgba(191,144,0,0.20)",
  selectWashSoft: "rgba(212,176,74,0.14)",
  marqueeWash: "rgba(191,144,0,0.10)",
  // PELLE · the selection went ochre, so the peer ring left it: blue now
  peerAware: "#1F6FEB",
  hoverSoft: "#8FB4D8",
  bgHover: "#d9e9f7",
  groupBody: "rgba(190,196,204,0.25)",
  groupBorder: "#000000",
  groupHeaderFallback: "#F6D7A4",
  handleFill: "#ffffff",
  handleRing: "#9aa7b5",
  edgeDefault: "#888888",
  edgeInk: "#1a1a1a",
  edgeProvenance: "#9a7b34",
  nodeFallbackFill: "#FFFFFF",
  onAccent: "#1D1D1B",
  onLight: "#1a1a1a",
  onDark: "#f5f5f5",
};

/**
 * Dark values chosen for CONTRAST against the semantic fills, not for taste.
 *
 * The EM palette is made of light fills with saturated borders (a US is #F0F0F0
 * inside #9B3333), so on a dark canvas the nodes read as bright cards — which is
 * what makes the matrix legible. What had to move is everything that was near-white
 * by default: the lane bands, the lane chip, the handle, the group wash.
 */
const DARK: CanvasTheme = {
  canvasBg: "#121821",
  laneA: "#1A222D",
  laneB: "#151C25",
  laneLine: "#2A3644",
  chipBorder: "#2b3644",
  laneChip: "#1E2632F2",
  laneChipInk: "#bcd2ee",
  labelInk: "#e3e8ef",
  labelMuted: "#b3bcc8",
  accent: "#E3B43A",
  selectSoft: "#B8943A",
  selectWash: "rgba(227,180,58,0.22)",
  selectWashSoft: "rgba(184,148,58,0.16)",
  marqueeWash: "rgba(227,180,58,0.12)",
  peerAware: "#6EA6FF",
  hoverSoft: "#4A6A8E",
  bgHover: "#1d2c3e",
  groupBody: "rgba(120,132,148,0.20)",
  groupBorder: "#8b95a3",
  groupHeaderFallback: "#6b5324",
  handleFill: "#1E2632",
  handleRing: "#8b95a3",
  edgeDefault: "#7c8794",
  // PELLE · mid grey, not near-white: the stratigraphic line is drawn both on
  // the dark canvas and INSIDE the light group fills, and must hold 3:1 on both
  edgeInk: "#77818E",
  edgeProvenance: "#d9bd7a",
  nodeFallbackFill: "#242C38",
  onAccent: "#1D1D1B",
  onLight: "#1a1a1a",
  onDark: "#f5f5f5",
};

export const THEMES: Record<ThemeName, CanvasTheme> = { light: LIGHT, dark: DARK };

let active: ThemeName = "light";

export function canvasTheme(): CanvasTheme {
  return THEMES[active];
}

export function activeTheme(): ThemeName {
  return active;
}

/** Set the palette the renderer will use. The DOM side is `applyTheme`. */
export function setCanvasTheme(name: ThemeName): void {
  active = name;
}

/**
 * Ink for a label drawn ON a semantic fill.
 *
 * The fill comes from the datamodel and does not change with the theme, so the
 * readable ink is decided by the FILL's luminance and not by the theme — which is
 * why this takes the fill and not the theme name. A white-ish US keeps black text
 * in dark mode, because the node itself is still white-ish.
 */
export function labelOn(fill: string, t: CanvasTheme = canvasTheme()): string {
  const rgb = visibleRgb(fill, t);
  if (!rgb) return t.onLight;
  const [r, g, b] = rgb.map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? t.onLight : t.onDark;
}

/**
 * STRUTTURA · the colour a fill actually SHOWS, as 0–255 channels.
 *
 * `#rrggbb` is itself. A translucent `rgba(…)` — the header of a US container is
 * its border at 22 % — is composited over the canvas background, because that
 * is what the eye reads. Before this, `labelOn` could not parse `rgba` at all
 * and fell to the light ink: a near-white title on a pale pink band in light
 * mode (PELLE's defect 1, measured about 1.3:1).
 */
export function visibleRgb(fill: string, t: CanvasTheme = canvasTheme()): [number, number, number] | null {
  const hex = (h: string): [number, number, number] | null => {
    const x = h.replace("#", "");
    if (x.length < 6) return null;
    const v = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
    return v.some(Number.isNaN) ? null : (v as [number, number, number]);
  };
  const m = fill.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (!m) return hex(fill);
  const a = m[4] === undefined ? 1 : Number(m[4]);
  const under = hex(t.canvasBg) ?? [255, 255, 255];
  return [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * a + under[k] * (1 - a))) as
    [number, number, number];
}

const STORAGE_KEY = "emstudio.theme";

/** The stored preference, or `auto` when there is none. */
export function storedMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    /* private mode: fall through to auto */
  }
  return "auto";
}

export function storeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* not fatal: the choice just won't survive a reload */
  }
}

/** What `auto` resolves to right now. */
export function systemTheme(): ThemeName {
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveMode(mode: ThemeMode): ThemeName {
  return mode === "auto" ? systemTheme() : mode;
}

/**
 * Apply a mode: stamp `data-theme` on `<html>` (the CSS side) and set the canvas
 * palette (the renderer side). Returns the resolved theme so the caller can
 * redraw — the canvas will not repaint itself.
 */
export function applyTheme(mode: ThemeMode): ThemeName {
  const name = resolveMode(mode);
  document.documentElement.setAttribute("data-theme", name);
  setCanvasTheme(name);
  return name;
}

/**
 * Follow the system while the preference is `auto`.
 *
 * `matchMedia` and not a poll: the OS tells us, and the listener is registered
 * once. The callback re-reads the stored mode every time so that switching to an
 * explicit Light/Dark stops the following without unregistering anything.
 */
export function watchSystemTheme(onChange: (name: ThemeName) => void): void {
  if (typeof matchMedia !== "function") return;
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (storedMode() !== "auto") return;
    onChange(applyTheme("auto"));
  });
}

// ── Canvas type (PELLE) ──────────────────────────────────────────────────────
//
// The canvas used to write `system-ui, sans-serif` by hand in a dozen places.
// Now ONE helper builds every canvas font, and the family comes from the CSS
// variable `--font-canvas` (default Sora) — the same value the chrome uses, so
// the drawing and the panels speak one face. Mono (ids, dates) from `--font-mono`.
//
// Read lazily and cached: `getComputedStyle` per label would be a style recalc
// per node per frame. `refreshCanvasFonts()` re-reads (after the webfonts load).

const SANS_FALLBACK = "Sora, system-ui, -apple-system, sans-serif";
const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
let sansFamily: string | null = null;
let monoFamily: string | null = null;

function readVar(name: string, fallback: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function")
    return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function refreshCanvasFonts(): void {
  sansFamily = readVar("--font-canvas", SANS_FALLBACK);
  monoFamily = readVar("--font-mono", MONO_FALLBACK);
}

/** A canvas `ctx.font` string: `canvasFont(600, 11)` → `600 11px Sora, …`.
 *  `style` carries an optional `italic`; `mono` switches to the mono stack. */
export function canvasFont(
  weight: number | string,
  px: number,
  opts: { mono?: boolean; italic?: boolean } = {},
): string {
  if (sansFamily === null || monoFamily === null) refreshCanvasFonts();
  const fam = opts.mono ? monoFamily! : sansFamily!;
  return `${opts.italic ? "italic " : ""}${weight} ${px}px ${fam}`;
}

/** The canvas type scale of the desk (EM design system): fixed sizes, and a
 *  label that does not fit is cut with an ellipsis — never shrunk below 10px. */
export const CANVAS_TYPE = {
  nodeLabel: { weight: 600, px: 11 },
  groupHeader: { weight: 600, px: 11 },
  laneLabel: { weight: 600, px: 12.5 },
  laneDates: { weight: 400, px: 11 },
  minPx: 10,
} as const;

/**
 * Redraw once when the webfonts are in. A canvas does not repaint itself when a
 * font arrives, so without this the first frame stays in the fallback face until
 * the next interaction. `document.fonts.load` and not only `.ready`: a face the
 * DOM has not used yet (600 on a fresh canvas) is not pending, so `.ready`
 * alone would resolve without it.
 */
export function whenCanvasFontsReady(redraw: () => void): void {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) return;
  const fam = readVar("--font-canvas", SANS_FALLBACK).split(",")[0].trim();
  void Promise.all([
    fonts.load(`400 11px ${fam}`),
    fonts.load(`600 11px ${fam}`),
  ])
    .catch(() => undefined)
    .then(() => fonts.ready)
    .then(() => {
      refreshCanvasFonts();
      redraw();
    });
}
