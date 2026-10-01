// Overview minimap: scaled-down picture of the whole scene with the current
// viewport rectangle; click/drag to move the view.
import { canvasTheme } from "./theme";
import { hasNodeStyle, nodeStyle } from "./palette";
import { dtcRoleColour } from "./views/dtc";
import type { EmNode } from "./types";
import { sceneBounds, type Scene, type Viewport } from "./scene";

const W = 200;
const H = 132;
const PAD = 6;

export interface OverviewApi {
  update: (scene: Scene | null, vp: Viewport, viewW: number, viewH: number) => void;
}

/**
 * RISORSA-FILE · a node's ink on the minimap: its style's border colour — and,
 * for a node the visual rules give no style because it is drawn by its DTC
 * KIND (a process, an acquisition, a device, a resource of the chain), the
 * colour of its DTC lane. Measured: those fell to the `unknown` style, whose
 * border is RED — a DTC minimap was red nearly whole (every resource too, until
 * the style keys learned `resource`), saying «unknown type» of known types. The
 * red stays for a type nobody declared, which is what it says.
 */
export function minimapInk(node: Pick<EmNode, "node_type" | "data">): string {
  if (hasNodeStyle(node.node_type)) return nodeStyle(node.node_type).border;
  const d = (node.data ?? {}) as Record<string, unknown>;
  if (/^dtc_/.test(node.node_type) || d.dtc_kind) return dtcRoleColour(node as { node_type: string; data?: Record<string, unknown> });
  return nodeStyle(node.node_type).border;
}

export function buildOverview(
  root: HTMLCanvasElement,
  onMove: (worldX: number, worldY: number) => void,
): OverviewApi {
  const dpr = window.devicePixelRatio || 1;
  root.width = W * dpr;
  root.height = H * dpr;
  root.style.width = W + "px";
  root.style.height = H + "px";
  const ctx = root.getContext("2d")!;

  let scale = 1;
  let ox = 0;
  let oy = 0;
  let dragging = false;

  const toWorld = (mx: number, my: number): { x: number; y: number } => ({
    x: (mx - ox) / scale,
    y: (my - oy) / scale,
  });

  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;   // a right-click is not a move of the view
    dragging = true;
    root.setPointerCapture(e.pointerId);
    const r = root.getBoundingClientRect();
    const w = toWorld(e.clientX - r.left, e.clientY - r.top);
    onMove(w.x, w.y);
  });
  root.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const r = root.getBoundingClientRect();
    const w = toWorld(e.clientX - r.left, e.clientY - r.top);
    onMove(w.x, w.y);
  });
  root.addEventListener("pointerup", () => (dragging = false));

  /** CAMPAGNA (difetto 13) · the minimap does not sit ON the drawing: it takes
   *  the first corner where it covers no node (bottom right, top right), and
   *  when both would cover one it hides — the drawing is the work, the minimap
   *  only a way around it. Never the LEFT side: that is the strip of the lane
   *  headers, where a right-click opens the lane's menu (measured: a minimap
   *  moved bottom-left took that right-click as a move, U4.lanemenu). Not
   *  while dragged. */
  const place = (scene: Scene, vp: Viewport, viewW: number, viewH: number): void => {
    if (dragging) return;
    const M = 10;
    const area = root.parentElement;
    const canvas = area?.querySelector<HTMLCanvasElement>("canvas:not(.win-overview)") ?? null;
    const top0 = canvas ? canvas.offsetTop : 0;
    const left0 = canvas ? canvas.offsetLeft : 0;
    const rects = scene.nodes.map((n) => ({ x: n.x * vp.scale + vp.x, y: n.y * vp.scale + vp.y,
                                            w: n.w * vp.scale, h: n.h * vp.scale }));
    const free = (x: number, y: number): boolean => !rects.some((r) =>
      r.x < x + W + M && r.x + r.w > x - M && r.y < y + H + M && r.y + r.h > y - M);
    // the top corners leave room for the canvas's own buttons (the filter ⏚)
    const T = 44;
    const corners: Array<[string, number, number]> = [
      ["br", viewW - W - M, viewH - H - M], ["tr", viewW - W - M, T]];
    const pick = viewW > W * 2 && viewH > H * 1.5 ? corners.find(([, x, y]) => free(x, y)) : undefined;
    root.classList.toggle("covering", !pick);
    if (!pick) { root.dataset.corner = "none"; return; }
    const [corner, x, y] = pick;
    root.dataset.corner = corner;
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.left = `${left0 + x}px`;
    root.style.top = `${top0 + y}px`;
  };

  return {
    update(scene, vp, viewW, viewH): void {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!scene || !scene.nodes.length) return;
      place(scene, vp, viewW, viewH);
      const b = sceneBounds(scene);
      scale = Math.min((W - PAD * 2) / b.w, (H - PAD * 2) / b.h);
      ox = PAD - b.x * scale + (W - PAD * 2 - b.w * scale) / 2;
      oy = PAD - b.y * scale + (H - PAD * 2 - b.h * scale) / 2;

      for (const lane of scene.lanes) {
        ctx.fillStyle = canvasTheme().laneA; // DARK1: the lanes of the minimap are the lanes
        ctx.fillRect(ox + b.x * scale, oy + lane.y * scale, b.w * scale, lane.height * scale);
      }
      for (const n of scene.nodes) {
        ctx.fillStyle = minimapInk(n.node);
        ctx.fillRect(
          ox + n.x * scale,
          oy + n.y * scale,
          Math.max(1.5, n.w * scale),
          Math.max(1.5, n.h * scale),
        );
      }
      // viewport rectangle
      const wx = -vp.x / vp.scale;
      const wy = -vp.y / vp.scale;
      const ww = viewW / vp.scale;
      const wh = viewH / vp.scale;
      ctx.strokeStyle = canvasTheme().accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + wx * scale, oy + wy * scale, ww * scale, wh * scale);
    },
  };
}
