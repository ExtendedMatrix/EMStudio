// MICRO-BADGE-PD · the chip of a unit's paradata group, BOTTOM-RIGHT of the unit.
//
// It used to be one more chip of the ornament row (BADGE1, top-right, beside
// author / licence / embargo), the property glyph with the number of properties
// on a disc. It is now a chip of its own at the opposite corner, drawn with the
// mechanism of the epochs' badges — the lane chips and their «PD» tag
// (renderer.ts, `drawPdTag`): SCREEN space, the paradata colour of the datamodel
// (`ParadataNodeGroup.label_background`) under an ink that follows it, and a
// screen floor, so that its numbers are read at a low zoom as the epochs' are.
// Above the floor it scales with the node, like the ornament badges.
//
// One function draws it for every projection that has unit boxes: the Matrix
// (and the full graph, `render`) and the liquid Graph (`renderLiquid`, on the
// discs). The hit rects are SCREEN (canvas-relative) rects, rebuilt every draw;
// main.ts reads them on the press: a click solos the group (its hypergraph,
// `enterGroup`), Shift+click opens or closes it in place.
import type { AdornmentBadge } from "./adornments";
import { nodeStyle } from "./palette";
import type { SceneNode, Viewport } from "./scene";
import { canvasFont, canvasTheme, labelOn } from "./theme";

/** the chip's height at scale 1 (as the ornament badges' BADGE_PX) and its
 *  screen floor (the epochs' «PD» tag is 14 px high) */
const CHIP_PX = 14;
const CHIP_MIN_PX = 14;

export interface PdChipHit {
  group: string;
  unit: string;
  label: string;
  open: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}
let hits: PdChipHit[] = [];

export function hitPdChip(sx: number, sy: number): PdChipHit | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const t = hits[i];
    if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h) return t;
  }
  return null;
}

/** for the checks: the chips as drawn (screen, canvas-relative) */
export function drawnPdChips(): PdChipHit[] {
  return hits.map((h) => ({ ...h }));
}

/** the group chip of a node, if it has one (an adornment with `group`) */
export function pdChipOf(n: { adornments?: AdornmentBadge[] }): AdornmentBadge | undefined {
  return n.adornments?.find((b) => !!b.group && b.count != null);
}

/**
 * Draw every chip of `nodes` (their world boxes, `vp`). The context must be in
 * device pixels with no world transform (`setTransform(dpr, 0, 0, dpr, 0, 0)`).
 * `box` gives the screen rect the chip hangs on (default: the node's box).
 */
export function drawPdChips(
  ctx: CanvasRenderingContext2D,
  nodes: readonly SceneNode[],
  vp: Viewport,
  viewW: number,
  viewH: number,
  selectedId: string | null,
  box?: (n: SceneNode) => { x: number; y: number; w: number; h: number },
): void {
  hits = [];
  const th = canvasTheme();
  const fill = nodeStyle("ParadataNodeGroup").labelBackground || th.groupHeaderFallback;
  const ink = labelOn(fill) === th.onLight ? "#5a3200" : labelOn(fill);
  const h = Math.max(CHIP_MIN_PX, CHIP_PX * vp.scale);
  const fpx = Math.max(8, Math.round(h * 0.56));
  const r0 = h * 0.4;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const n of nodes) {
    const b = pdChipOf(n);
    if (!b || !b.group) continue;
    const r = box ? box(n) : { x: n.x * vp.scale + vp.x, y: n.y * vp.scale + vp.y, w: n.w * vp.scale, h: n.h * vp.scale };
    if (r.x + r.w + h * 4 < 0 || r.x > viewW || r.y > viewH || r.y + r.h + h < 0) continue;
    // «PD» then the properties (accent disc) then, closed, the instances (muted)
    ctx.font = canvasFont(700, fpx);
    const pdW = ctx.measureText("PD").width + h * 0.5;
    const showInst = !b.open && !!b.instances;
    const w = pdW + 2 * r0 + h * 0.2 + (showInst ? 2 * r0 + h * 0.15 : 0) + h * 0.15;
    // the bottom edge straddled, the right edge aligned — the ornament row,
    // mirrored to the bottom
    const x = r.x + r.w - w;
    const y = r.y + r.h - h * 0.45;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, h * 0.3);
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = b.open ? th.accent : "rgba(0,0,0,0.30)";
    if (b.open) ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillText("PD", x + pdW / 2 + h * 0.05, y + h / 2 + 0.5);
    const disc = (cx: number, bg: string, v: number): void => {
      ctx.beginPath();
      ctx.arc(cx, y + h / 2, r0, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.fillStyle = labelOn(bg);
      ctx.font = canvasFont(700, Math.max(7, Math.round(r0 * 1.35)));
      ctx.fillText(String(v), cx, y + h / 2 + 0.5);
    };
    let cx = x + pdW + h * 0.1 + r0;
    disc(cx, th.accent, b.count ?? 0);
    if (showInst) {
      cx += 2 * r0 + h * 0.15;
      disc(cx, th.labelMuted, b.instances!);
    }
    if (b.group === selectedId) {
      ctx.strokeStyle = th.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    }
    hits.push({ group: b.group, unit: n.id, label: b.label, open: !!b.open, x, y, w, h });
  }
  ctx.restore();
}
