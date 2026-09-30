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

  return {
    update(scene, vp, viewW, viewH): void {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!scene || !scene.nodes.length) return;
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
