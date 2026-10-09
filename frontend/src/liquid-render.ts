/**
 * G3 · drawing the liquid Graph (`views/liquid.ts`): halos, edges, discs.
 *
 * Levels of detail, by the size of a disc on screen:
 *  · small — the discs only, one fill per family (no rings, no glyphs, no
 *    labels, edges without arrows);
 *  · medium (a disc ≥ 9 px across) — the rings of the specialisations;
 *  · large (≥ 26 px) — the glyphs inside the discs and the names under them.
 * The selected node and the one under the mouse always have their name.
 *
 * Hover lights the node's neighbours and dims the rest (Obsidian). The filter of
 * the panel, the local graph and a registered query dim or hide (the panel's
 * switch). Culling: a disc or an edge off screen is not drawn.
 */
import { drawGlyph, type GlyphInk } from "./glyphs";
import { FAMILY_COLOR, discVisibility, type Disc, type LiquidExtra, type LiquidFilter } from "./views/liquid";
import type { Scene } from "./scene";
import { canvasFont, canvasTheme, activeTheme } from "./theme";
import type { Viewport } from "./scene";

export interface LiquidState {
  hoverId: string | null;
  selectedId: string | null;
  selectedIds?: Set<string> | null;
  filter: LiquidFilter;
  local: Set<string> | null;
  epochOf: (id: string) => string[];
}

export function renderLiquid(
  ctx: CanvasRenderingContext2D,
  scene: Scene & { liquid: LiquidExtra },
  vp: Viewport,
  st: LiquidState,
  viewW: number,
  viewH: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  const th = canvasTheme();
  const dark = activeTheme() === "dark";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.translate(vp.x, vp.y);
  ctx.scale(vp.scale, vp.scale);
  const k = vp.scale;
  const m = 40 / k;
  const x0 = -vp.x / k - m, y0 = -vp.y / k - m, x1 = (viewW - vp.x) / k + m, y1 = (viewH - vp.y) / k + m;
  const discs = scene.liquid.discs;
  const center = new Map<string, { x: number; y: number; r: number }>();
  for (const n of scene.nodes) center.set(n.id, { x: n.x + n.w / 2, y: n.y + n.h / 2, r: n.w / 2 });

  // who is shown, dimmed, hidden — and who is lit by the hover
  const vis = new Map<string, "show" | "dim" | "hide">();
  for (const n of scene.nodes) vis.set(n.id, discVisibility(n, st.filter, st.epochOf, st.local));
  const hover = st.hoverId && center.has(st.hoverId) ? st.hoverId : null;
  let lit: Set<string> | null = null;
  if (hover) {
    lit = new Set([hover]);
    for (const e of scene.edges) {
      if (e.source === hover) lit.add(e.target);
      else if (e.target === hover) lit.add(e.source);
    }
  }
  const alphaOf = (id: string): number => {
    const v = vis.get(id);
    if (v === "hide") return 0;
    let a = v === "dim" ? 0.16 : 1;
    if (lit && !lit.has(id)) a *= 0.18;
    return a;
  };

  // ── halos: a soft area behind the members of each epoch and group ───────
  for (const h of scene.liquid.halos) {
    const shown = h.members.filter((id) => vis.get(id) !== "hide" && center.has(id));
    if (!shown.length) continue;
    ctx.save();
    ctx.globalAlpha = h.kind === "epoch" ? (dark ? 0.1 : 0.08) : (dark ? 0.12 : 0.1);
    ctx.fillStyle = h.color;
    ctx.beginPath();
    const pad = h.kind === "epoch" ? 22 : 14;
    for (const id of shown) {
      const p = center.get(id)!;
      if (p.x + p.r + pad < x0 || p.x - p.r - pad > x1 || p.y + p.r + pad < y0 || p.y - p.r - pad > y1) continue;
      ctx.moveTo(p.x + p.r + pad, p.y);
      ctx.arc(p.x, p.y, p.r + pad, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  // ── edges: straight, thin, one path per alpha level ─────────────────────
  const arrows = k >= 0.6;
  const groups = new Map<number, Array<[number, number, number, number, number]>>();
  for (const e of scene.edges) {
    const a = center.get(e.source), b = center.get(e.target);
    if (!a || !b) continue;
    const al = Math.min(alphaOf(e.source), alphaOf(e.target));
    if (al <= 0) continue;
    if (Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1 || Math.max(a.y, b.y) < y0 || Math.min(a.y, b.y) > y1) continue;
    const litEdge = hover && (e.source === hover || e.target === hover);
    // the hovered node's edges have their own bucket (-1), drawn last
    const key = litEdge ? -1 : Math.round(al * 10);
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    // from the rim of one disc to the rim of the other
    (groups.get(key) ?? groups.set(key, []).get(key)!).push([
      a.x + (dx / d) * a.r, a.y + (dy / d) * a.r, b.x - (dx / d) * b.r, b.y - (dy / d) * b.r, d]);
  }
  for (const [key, segs] of [...groups].sort((p, q) => (p[0] < 0 ? 99 : p[0]) - (q[0] < 0 ? 99 : q[0]))) {
    const litEdges = key === -1;
    ctx.strokeStyle = litEdges ? th.accent : th.labelInk;
    ctx.globalAlpha = litEdges ? 0.9 : (key / 10) * (dark ? 0.32 : 0.26);
    ctx.lineWidth = (litEdges ? 1.6 : 0.9) / Math.sqrt(k);
    ctx.beginPath();
    for (const [ax, ay, bx, by] of segs) {
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
    if (arrows) {
      const s = 5 / Math.sqrt(k);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      for (const [ax, ay, bx, by, d] of segs) {
        if (d < 4 * s) continue;
        const ux = (bx - ax) / d, uy = (by - ay) / d;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - ux * s - uy * s * 0.45, by - uy * s + ux * s * 0.45);
        ctx.lineTo(bx - ux * s + uy * s * 0.45, by - uy * s - ux * s * 0.45);
        ctx.closePath();
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // ── discs ────────────────────────────────────────────────────────────────
  const ink: GlyphInk = { ink: th.labelInk, paper: th.canvasBg, dark };
  const sel = (id: string): boolean => id === st.selectedId || !!st.selectedIds?.has(id);
  const order = [...scene.nodes].sort((p, q) => (sel(p.id) || p.id === hover ? 1 : 0) - (sel(q.id) || q.id === hover ? 1 : 0));
  const labels: Array<{ id: string; x: number; y: number; r: number; a: number }> = [];
  for (const n of order) {
    const c = center.get(n.id)!;
    if (c.x + c.r < x0 || c.x - c.r > x1 || c.y + c.r < y0 || c.y - c.r > y1) continue;
    const a = alphaOf(n.id);
    if (a <= 0) continue;
    const disc = discs.get(n.id) as Disc;
    const col = FAMILY_COLOR[disc.family];
    const px = c.r * 2 * k; // the disc's size on screen
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = dark ? col.dark : col.fill;
    ctx.fill();
    if (px >= 9) {
      ring(ctx, c.x, c.y, c.r, disc.ring, dark ? "#E8ECF2" : "#20252C", k);
      if (disc.family === "paradata" || disc.family === "object" || disc.family === "other" || disc.family === "ornament") {
        ctx.lineWidth = 0.8 / k;
        ctx.strokeStyle = dark ? "#8892A3" : "#9AA3B2";
        ctx.stroke();
      }
    }
    if (px >= 26 && disc.glyph) {
      const gs = c.r * 1.25;
      drawGlyph(ctx, disc.glyph, c.x - gs / 2, c.y - gs / 2, gs, gs, ink, gs * k);
    }
    if (sel(n.id) || n.id === hover) {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r + 3 / k, 0, Math.PI * 2);
      ctx.strokeStyle = th.accent;
      ctx.lineWidth = (n.id === st.selectedId ? 2.6 : 1.6) / k;
      ctx.stroke();
    }
    if (px >= 26 || sel(n.id) || n.id === hover) labels.push({ id: n.id, x: c.x, y: c.y + c.r, r: c.r, a });
  }
  // ── names: under the disc, one font, a halo of the canvas colour ────────
  const fpx = 11 / k;
  ctx.font = canvasFont(500, fpx);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  for (const l of labels) {
    const n = scene.byId.get(l.id)!;
    const text = String(n.node.name || n.id);
    const t = text.length > 28 ? text.slice(0, 27) + "…" : text;
    ctx.globalAlpha = l.a;
    ctx.lineWidth = 3 / k;
    ctx.strokeStyle = th.canvasBg;
    ctx.strokeText(t, l.x, l.y + 3 / k);
    ctx.fillStyle = th.labelInk;
    ctx.fillText(t, l.x, l.y + 3 / k);
  }
  ctx.globalAlpha = 1;
}

/** The rings of a specialisation, inside the disc's rim. */
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, kind: Disc["ring"], color: string, k: number): void {
  if (kind === "none") return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8 / k, r * 0.09);
  const octagon = (rr: number): void => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const t = Math.PI / 8 + (i * Math.PI) / 4;
      const px = x + rr * Math.cos(t), py = y + rr * Math.sin(t);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  };
  if (kind === "octagon") octagon(r * 0.72);
  else if (kind === "double") {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === "dashed" || kind === "dashed_octagon") {
    ctx.setLineDash([r * 0.32, r * 0.2]);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (kind === "dashed_octagon") octagon(r * 0.5);
  }
  ctx.restore();
}
