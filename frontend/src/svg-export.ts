// SVG export of the current scene (phase 5): lanes, orthogonally routed
// edges with bridges and arrowheads, node shapes and labels. The output is
// a plain standalone SVG — printable to PDF from any viewer.
import { t } from "./i18n";
import { epochEnd, epochStart, nameOf, timelineSpans } from "./narrative-embeds";
import { edgeStyle, nodeStyle } from "./palette";
import { glyphFor, glyphPathsSvg } from "./glyphs";
import { glyphRectOf } from "./shape-geom";
import { routeScene, SYMMETRIC_EDGES, type EdgeRoute } from "./routing";
import { sceneBounds, type Scene, type SceneNode } from "./scene";
import type { EmDocument, EmNode } from "./types";

/**
 * The PRINT chrome: the few neutrals a figure needs that are not a node's
 * colour — ground, frame, ink, a faint one for a caption.
 *
 * Named here rather than typed inline because there are now three renderers in
 * this file, and three private sets of near-white would be three palettes. They
 * are deliberately NOT the canvas theme: a figure in a PDF is printed once and
 * read on paper, so it does not follow the reader's dark mode.
 */
const INK = {
  ground: "#fbfcfe",
  frame: "#dce3ec",
  laneA: "#EDF3FA",
  laneB: "#F7FAFD",
  label: "#2c4a6e",
  text: "#1a1a1a",
  faint: "#46505c",
  fainter: "#636c78",
  rule: "#9aa4b0",
  /** the one accent: where the thing IS. The EM red, which is what a marker on
   *  the site map has always been. */
  mark: "#9B3333",
  paper: "#ffffff",
} as const;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shapeSvg(n: SceneNode): string {
  const st = nodeStyle(n.node.node_type);
  const { x, y, w, h } = n;
  const attrs =
    `fill="${st.fill}" fill-opacity="0.92" stroke="${st.border}" stroke-width="1.1"` +
    (st.borderStyle === "dashed"
      ? ' stroke-dasharray="5 3"'
      : st.borderStyle === "dotted"
        ? ' stroke-dasharray="2 2"'
        : "");
  const poly = (pts: number[][]): string =>
    `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" ${attrs}/>`;
  switch (st.shape) {
    case "ellipse":
    case "circle":
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
    case "hexagon": {
      const c = Math.min(w * 0.2, h);
      return poly([
        [x + c, y],
        [x + w - c, y],
        [x + w, y + h / 2],
        [x + w - c, y + h],
        [x + c, y + h],
        [x, y + h / 2],
      ]);
    }
    case "parallelogram": {
      const k = w * 0.18;
      return poly([
        [x + k, y],
        [x + w, y],
        [x + w - k, y + h],
        [x, y + h],
      ]);
    }
    case "octagon": {
      const c = Math.min(w, h) * 0.29;
      return poly([
        [x + c, y],
        [x + w - c, y],
        [x + w, y + c],
        [x + w, y + h - c],
        [x + w - c, y + h],
        [x + c, y + h],
        [x, y + h - c],
        [x, y + c],
      ]);
    }
    case "diamond":
      return poly([
        [x + w / 2, y],
        [x + w, y + h / 2],
        [x + w / 2, y + h],
        [x, y + h / 2],
      ]);
    case "triangle":
      return poly([
        [x + w / 2, y],
        [x + w, y + h],
        [x, y + h],
      ]);
    case "pentagon":
      return poly([
        [x + w / 2, y],
        [x + w, y + h * 0.4],
        [x + w * 0.8, y + h],
        [x + w * 0.2, y + h],
        [x, y + h * 0.4],
      ]);
    case "star": {
      // DARKBK: draw the 5-pointed star (author nodes use it). Was missing, so
      // a star node fell through to the default rounded-rect in the SVG export
      // — the "hole" that forced the CLI. Inscribed in the box, top point up.
      const cx = x + w / 2;
      const cy = y + h / 2;
      const R = Math.min(w, h) / 2;
      const r = R * 0.42;
      const pts: number[][] = [];
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? R : r;
        pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
      }
      return poly(pts);
    }
    case "rectangle":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`;
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(6, h / 2)}" ${attrs}/>`;
  }
}

function routePath(r: EdgeRoute, bridgeR: number): string {
  const pts = r.pts;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let s = 0; s < pts.length - 1; s++) {
    const p = pts[s];
    const q = pts[s + 1];
    const xsOn = r.bridges[s] ?? [];
    if (!xsOn.length || Math.abs(p.y - q.y) > 0.5) {
      d += ` L ${q.x} ${q.y}`;
      continue;
    }
    const ltr = p.x <= q.x;
    for (const bx of xsOn) {
      if (ltr) {
        d += ` L ${bx - bridgeR} ${p.y} A ${bridgeR} ${bridgeR} 0 0 1 ${bx + bridgeR} ${p.y}`;
      } else {
        d += ` L ${bx + bridgeR} ${p.y} A ${bridgeR} ${bridgeR} 0 0 0 ${bx - bridgeR} ${p.y}`;
      }
    }
    d += ` L ${q.x} ${q.y}`;
  }
  return d;
}

function arrowSvg(r: EdgeRoute, size: number, color: string): string {
  const pts = r.pts;
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const p1 = [tip.x - ux * size - uy * size * 0.45, tip.y - uy * size + ux * size * 0.45];
  const p2 = [tip.x - ux * size + uy * size * 0.45, tip.y - uy * size - ux * size * 0.45];
  return `<polygon points="${tip.x},${tip.y} ${p1.join(",")} ${p2.join(",")}" fill="${color}"/>`;
}

/** PELLE · the canvas face (Sora, see theme.ts `canvasFont`), so an exported
 *  SVG reads like the canvas. The font is NOT embedded: a viewer without Sora
 *  installed falls back to its system sans, as it did before. */
const SVG_FONT = "Sora, system-ui, sans-serif";

export function sceneToSvg(
  scene: Scene,
  edgeVisible: (t: string | undefined) => boolean,
  title: string,
): string {
  const b = sceneBounds(scene);
  const pad = 30;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}" font-family="${SVG_FONT}">`,
  );
  parts.push(`<title>${esc(title)}</title>`);
  parts.push(
    `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + pad * 2}" height="${b.h + pad * 2}" fill="${INK.ground}"/>`,
  );

  scene.lanes.forEach((lane, i) => {
    parts.push(
      `<rect x="${b.x - pad}" y="${lane.y}" width="${b.w + pad * 2}" height="${lane.height}" fill="${i % 2 ? INK.laneB : INK.laneA}"/>`,
    );
    parts.push(
      `<text x="${b.x - pad + 6}" y="${lane.y + 16}" font-size="12.5" font-weight="600" fill="${INK.label}">${esc(lane.label)}</text>`,
    );
  });

  const visible = scene.edges.map((e) => edgeVisible(e.edge.edge_type));
  const routes = routeScene(scene, visible);
  routes.forEach((r, i) => {
    if (!visible[i]) return;
    const e = scene.edges[i];
    const st = edgeStyle(e.edge.edge_type);
    const dash = st.dash.length ? ` stroke-dasharray="${st.dash.join(" ")}"` : "";
    const alpha = e.edge.edge_type === "is_after" ? 0.85 : 0.5;
    parts.push(
      `<path d="${routePath(r, 3.5)}" fill="none" stroke="${st.color}" stroke-width="${st.width}" stroke-opacity="${alpha}"${dash}/>`,
    );
    if (!SYMMETRIC_EDGES.has(e.edge.edge_type ?? ""))
      parts.push(arrowSvg(r, 6, st.color));
  });

  for (const n of scene.nodes) {
    const st = nodeStyle(n.node.node_type);
    const label = esc(String(n.node.name || n.id).slice(0, 24));
    // SHIFT-A fase 6b · a glyph type is written as ITS PATHS — the same layers the
    // canvas draws, in the EM colours (a figure is printed, it does not follow the
    // reader's dark mode) — and never as an embedded image. Contain-fit into the
    // rect the canvas uses (`glyphRectOf`), the name under the glyph.
    const g = glyphFor(n.node.node_type, n.node.data as Record<string, unknown> | undefined);
    if (g) {
      const r = glyphRectOf(n, g.aspect);
      const [, , vw, vh] = g.viewBox;
      const k = Math.min(r.w / vw, r.h / vh);
      const ox = r.x + (r.w - vw * k) / 2;
      const oy = r.y + (r.h - vh * k) / 2;
      parts.push(`<g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${k.toFixed(4)})">${glyphPathsSvg(g)}</g>`);
      parts.push(
        `<text x="${n.x + n.w / 2}" y="${r.y + r.h + 10}" font-size="10" font-weight="600" fill="${INK.text}" text-anchor="middle">${label}</text>`,
      );
      continue;
    }
    parts.push(shapeSvg(n));
    parts.push(
      `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2}" font-size="${n.h >= 22 ? 11 : 10}" font-weight="600" fill="${st.textColor}" text-anchor="middle" dominant-baseline="central">${label}</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

// ── the FIGURES · what an export can carry of a map and of a timeline ────────
//
// Same seam as the matrix (`s3dgraphy.narrative.bake.figure_key`): this process
// renders, the bridge converts, the exporter places. Both functions return null
// when there is nothing honest to draw, and null means the export keeps the
// placeholder for that block — a caption that says what is missing beats a
// picture that invents it.

const SVG_HEAD = '<svg xmlns="http://www.w3.org/2000/svg" '
  + `font-family="${SVG_FONT}"`;

/** A metric scale bar's nice round length, given metres per pixel. */
function niceMetres(target: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  for (const step of steps) if (step >= target) return step;
  return steps[steps.length - 1];
}

export interface MapFigureInput {
  lat: number;
  lon: number;
  /** degrees clockwise from north — the scene's orientation, 0 when unknown */
  rotation?: number;
  epsg?: number;
  /** The frame the coordinates were CONVERTED FROM, when they were. Printed as
   *  well as the WGS84 pair: "40.7, 14.5 (WGS84, da EPSG:32633)" is a fact a
   *  reader can check, while labelling degrees with the projected code — which
   *  is what this said until it was read on a real anchor — is a small lie. */
  epsgFrom?: number;
  label?: string;
  /** the scene's footprint in lon/lat, if the placement is known (G3) */
  corners?: [number, number][];
}

/**
 * A map figure with **no basemap** — the vector layer only.
 *
 * Why no tiles: the in-app map draws OSM tiles from another origin, so its
 * canvas is TAINTED and `toDataURL` refuses (measured — that is why this figure
 * did not exist). Fetching tiles server-side to get around that would put
 * somebody else's cartography inside an export under our name, and a basemap has
 * a licence and an attribution that a figure in a PDF cannot carry honestly.
 *
 * So the figure shows what the STUDY knows: where it is (a marker, and the
 * coordinates written out), how it is turned (a north arrow, rotated by the
 * scene's own rotation), how big it is (the footprint, when the placement gives
 * one, with a metric scale bar). No pretty background, and nothing implied.
 */
export function mapToSvg(input: MapFigureInput): string | null {
  const { lat, lon } = input;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const W = 420;
  const H = 300;
  const rotation = Number(input.rotation) || 0;
  const label = input.label ?? "";
  const epsg = input.epsg ?? 4326;
  const parts: string[] = [];
  parts.push(`${SVG_HEAD} viewBox="0 0 ${W} ${H}">`);
  parts.push(`<title>${esc(label || t("fig.position"))}</title>`);
  parts.push(`<rect width="${W}" height="${H}" fill="${INK.ground}" stroke="${INK.frame}"/>`);

  // the footprint, fitted with a margin — and the metres it spans, for the bar
  const corners = (input.corners ?? []).filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
  let metresPerPx = 0;
  const cx = W / 2;
  const cy = H / 2 - 6;
  if (corners.length >= 3) {
    const lons = corners.map((c) => c[0]);
    const lats = corners.map((c) => c[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    // metres per degree at this latitude: enough for a scale bar on a site plan,
    // and stated as such rather than pretending to be a projection
    const mPerLat = 111_320;
    const mPerLon = 111_320 * Math.cos((lat * Math.PI) / 180);
    const spanX = Math.max((maxLon - minLon) * mPerLon, 0.001);
    const spanY = Math.max((maxLat - minLat) * mPerLat, 0.001);
    const usable = Math.min(W - 90, H - 90);
    const scale = usable / Math.max(spanX, spanY);      // px per metre
    metresPerPx = 1 / scale;
    const project = ([plon, plat]: [number, number]): [number, number] => [
      cx + (plon - (minLon + maxLon) / 2) * mPerLon * scale,
      cy - (plat - (minLat + maxLat) / 2) * mPerLat * scale,
    ];
    const points = corners.map(project)
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    parts.push(`<polygon points="${points}" fill="${INK.laneA}" fill-opacity="0.85" `
      + `stroke="${INK.label}" stroke-width="1.4"/>`);
  }

  // the point itself
  parts.push(`<circle cx="${cx}" cy="${cy}" r="5.5" fill="${INK.mark}" `
    + `stroke="${INK.paper}" stroke-width="1.6"/>`);
  if (label)
    // painted with a paper-coloured halo UNDER the glyphs: the label sits on top
    // of the footprint it describes, and on the real page (measured in the PDF)
    // it crossed the outline. `paint-order` is SVG 2 and ignored by renderers
    // that predate it — which lose the halo, not the label.
    parts.push(`<text x="${cx + 10}" y="${cy + 4}" font-size="12" `
      + `fill="${INK.text}" stroke="${INK.paper}" stroke-width="3" `
      + `stroke-linejoin="round" paint-order="stroke">${esc(label)}</text>`);

  // north, turned by the scene's rotation (0 = up)
  const nx = W - 34;
  const ny = 40;
  parts.push(`<g transform="rotate(${(-rotation).toFixed(1)} ${nx} ${ny})">`
    + `<line x1="${nx}" y1="${ny + 16}" x2="${nx}" y2="${ny - 14}" `
    + `stroke="${INK.label}" stroke-width="1.6"/>`
    + `<polygon points="${nx},${ny - 20} ${nx - 4.5},${ny - 10} ${nx + 4.5},${ny - 10}" `
    + `fill="${INK.label}"/></g>`);
  parts.push(`<text x="${nx}" y="${ny + 30}" font-size="11" fill="${INK.label}" `
    + `text-anchor="middle">N</text>`);

  // the coordinates, written out: a figure of a place has to say which place
  const frame = input.epsgFrom && input.epsgFrom !== epsg
    ? t("fig.fromEpsg", { epsg: String(input.epsgFrom) })
    : `EPSG:${epsg}`;
  const coords = `${lat.toFixed(6)}, ${lon.toFixed(6)} (${frame})`
    + (rotation ? ` · ${t("fig.rotation", { deg: rotation.toFixed(1) })}` : "");
  parts.push(`<text x="12" y="${H - 12}" font-size="11" fill="${INK.faint}">`
    + `${esc(coords)}</text>`);

  // a scale bar ONLY when the footprint gave a ground extent: a bar under a bare
  // point would be a measurement of nothing
  if (metresPerPx > 0) {
    const metres = niceMetres(metresPerPx * 90);
    const px = metres / metresPerPx;
    const bx = 12;
    const by = H - 30;
    parts.push(`<line x1="${bx}" y1="${by}" x2="${bx + px}" y2="${by}" `
      + `stroke="${INK.text}" stroke-width="2"/>`
      + `<line x1="${bx}" y1="${by - 4}" x2="${bx}" y2="${by + 4}" `
      + `stroke="${INK.text}" stroke-width="2"/>`
      + `<line x1="${bx + px}" y1="${by - 4}" x2="${bx + px}" y2="${by + 4}" `
      + `stroke="${INK.text}" stroke-width="2"/>`);
    parts.push(`<text x="${bx + px + 6}" y="${by + 4}" font-size="11" `
      + `fill="${INK.text}">${metres} m</text>`);
  } else {
    parts.push(`<text x="12" y="${H - 30}" font-size="10" fill="${INK.fainter}">`
      + `${esc(t("fig.noExtent"))}</text>`);
  }
  parts.push("<!-- no basemap: the tiles belong to somebody else, and they carry a licence -->");
  parts.push("</svg>");
  return parts.join("\n");
}

/**
 * The timeline as a figure: the epochs on their axis, oldest at the top.
 *
 * Reads `timelineSpans` — the same computation the in-app embed reads — so the
 * exported picture and the screen cannot place an epoch differently. Returns
 * null when the scope has no epoch on an axis, which is the case the embed
 * already words as "nessuna epoca in questo ambito".
 */
export function timelineToSvg(node: EmNode, doc: EmDocument | null): string | null {
  const { dated, undated, min, span, what } = timelineSpans(node, doc);
  if (!dated.length) return null;
  const W = 520;
  const rowH = 34;
  const top = 34;
  const leftPad = 12;
  const trackX = 130;                       // labels live to the left of this
  const trackW = W - trackX - 70;
  const H = top + dated.length * rowH + (undated.length ? 34 : 22);
  const parts: string[] = [];
  parts.push(`${SVG_HEAD} viewBox="0 0 ${W} ${H}">`);
  parts.push(`<title>${esc(what)}</title>`);
  parts.push(`<rect width="${W}" height="${H}" fill="${INK.ground}" stroke="${INK.frame}"/>`);
  parts.push(`<text x="${leftPad}" y="20" font-size="12" fill="${INK.label}">`
    + `${esc(t("fig.timeAxis", { what }))}</text>`);

  dated.forEach((epoch, i) => {
    const from = epochStart(epoch);
    const to = epochEnd(epoch);
    const y = top + i * rowH;
    const x = trackX + ((from - min) / span) * trackW;
    const w = Math.max(((to - from) / span) * trackW, 6);
    const style = nodeStyle(String(epoch.node_type ?? "epoch"));
    const fill = (epoch.data as Record<string, unknown> | undefined)?.color;
    parts.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" `
      + `height="18" rx="3" fill="${typeof fill === "string" && fill ? fill : style.fill}" `
      + `stroke="${style.border}" stroke-width="1.1"/>`);
    parts.push(`<text x="${trackX - 8}" y="${y + 13}" font-size="11" `
      + `fill="${INK.text}" text-anchor="end">${esc(nameOf(epoch))}</text>`);
    // the span, written at the bar's end — or INSIDE it when the frame would cut
    // the label off (measured on the compiled PDF: "1450 → 1520" lost its year)
    const span_label = `${from} → ${to}`;
    const roomRight = W - (x + w + 6);
    // 6.6 px per character, not 5.6: measured on the compiled PDF, where the
    // arrow glyph and the PDF font metrics made a label that "fit" arithmetically
    // lose its last year. The generous estimate costs a few pixels of gutter.
    const needed = span_label.length * 6.6;
    if (roomRight >= needed)
      parts.push(`<text x="${(x + w + 6).toFixed(1)}" y="${y + 13}" `
        + `font-size="10" fill="${INK.faint}">${esc(span_label)}</text>`);
    else
      parts.push(`<text x="${(x + w - 4).toFixed(1)}" y="${y + 13}" `
        + `font-size="10" fill="${INK.faint}" text-anchor="end" `
        + `stroke="${INK.paper}" stroke-width="3" stroke-linejoin="round" `
        + `paint-order="stroke">${esc(span_label)}</text>`);
  });

  // the axis itself, and its two ends: a span with no numbers is a decoration
  const axisY = top + dated.length * rowH - 6;
  parts.push(`<line x1="${trackX}" y1="${axisY}" x2="${trackX + trackW}" `
    + `y2="${axisY}" stroke="${INK.rule}" stroke-width="1"/>`);
  parts.push(`<text x="${trackX}" y="${axisY + 14}" font-size="10" `
    + `fill="${INK.fainter}">${min}</text>`);
  parts.push(`<text x="${trackX + trackW}" y="${axisY + 14}" font-size="10" `
    + `fill="${INK.fainter}" text-anchor="end">${min + span}</text>`);

  if (undated.length)
    parts.push(`<text x="${leftPad}" y="${H - 10}" font-size="10" fill="${INK.fainter}">`
      + esc(t("fig.undated", { list: undated.map(nameOf).join(", ") }))
      + `</text>`);
  parts.push("</svg>");
  return parts.join("\n");
}
