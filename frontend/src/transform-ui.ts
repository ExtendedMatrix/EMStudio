/**
 * MICRO-SPAZIO-3D-2 · p.5 · the nine values of a transform, as a form — one
 * renderer for the Inspector's «Trasformazione» and for the N panel, so the two
 * show the same numbers and write to the same place (`transform3d.ts`).
 *
 * The numbers are the DATA's, in Blender's frame (Z up): position in metres,
 * rotation as Euler XYZ in degrees (the data's own unit since s3Dgraphy's node
 * datamodel 1.6.31), the quaternion beside it read-only, the scale, and the
 * PIVOT the object turns and scales about, read-only (the centre of its box
 * when the data says none). A field confirmed (Enter, or the focus leaving it
 * changed) is one call of `onCommit`, one step of undo.
 */
import { coordDecimals, deg, isIdentity, rad, xfQuaternion, type Xf } from "./transform3d";
import { NumGroup, formatNumber, numField, parseNumber } from "./num-field";
import type { V3 } from "./space-nav";

export interface TransformFormTexts {
  position: string;
  rotation: string;
  scale: string;
  quaternion: string;
  upAxis: (axis: string) => string;
  reset: string;
  /** the unit after a number (m, °) */
  metres: string;
  /** the pivot's head, and what an absent pivot means / an old one is */
  pivot?: string;
  pivotBox?: string;
  pivotOld?: string;
}

export interface TransformFormOptions {
  xf: Xf;
  texts: TransformFormTexts;
  onCommit?: (xf: Xf) => void;
  onReset?: () => void;
  readOnly?: boolean;
  /** a line under the form (where the numbers live, why it is read-only) */
  note?: string;
  /** the attribute the probes find the form by */
  probe?: string;
}

const fmt = formatNumber;

/** Read a number as a person types it: a comma is a decimal point too. */
export const parseTyped = parseNumber;

export function renderTransformForm(host: HTMLElement, o: TransformFormOptions): void {
  host.textContent = "";
  const grid = document.createElement("div");
  grid.className = "xf-grid";
  if (o.probe) grid.dataset.xf = o.probe;
  const xf = o.xf;
  const head = (text: string) => {
    const h = document.createElement("div");
    h.className = "xf-head";
    h.textContent = text;
    grid.appendChild(h);
  };
  // MICRO-DOVE-CHI-MENU p.6 · Blender's numeric fields (`num-field.ts`): drag
  // to change, a click to type, ⌘C ⌘V Backspace with the mouse over; a drag
  // down a column (X, Y, Z) takes the three. Whatever changed in one gesture
  // is ONE `onCommit`, one step of undo.
  const group = new NumGroup((changes) => {
    if (o.readOnly) return;
    const next: Xf = { ...xf, position: [...xf.position] as V3, rotation: [...xf.rotation] as V3, scale: [...xf.scale] as V3 };
    for (const c of changes) {
      const [g, axis] = c.field.split(".") as ["position" | "rotation" | "scale", "x" | "y" | "z"];
      const i = "xyz".indexOf(axis);
      if (c.value == null || i < 0) continue;
      if (g === "rotation") next.rotation[i] = rad(c.value);
      else next[g][i] = c.value;
    }
    o.onCommit?.(next);
  });
  const field = (g: "position" | "rotation" | "scale", i: 0 | 1 | 2, value: number, decimals: number) => {
    const lab = document.createElement("span");
    lab.className = "xf-lab";
    lab.textContent = "XYZ"[i];
    const inp = numField({ value, decimals, unit: g === "position" ? "m" : g === "rotation" ? "deg" : "scale",
      defaultValue: g === "scale" ? 1 : 0, readOnly: !!o.readOnly, field: `${g}.${"xyz"[i]}`, group, column: g });
    grid.append(lab, inp);
  };
  const dec = coordDecimals(Math.max(...xf.position.map(Math.abs)));
  head(`${o.texts.position} (${o.texts.metres})`);
  for (const i of [0, 1, 2] as const) field("position", i, xf.position[i], dec);
  head(`${o.texts.rotation} (°, XYZ)`);
  for (const i of [0, 1, 2] as const) field("rotation", i, deg(xf.rotation[i]), 3);
  head(o.texts.scale);
  for (const i of [0, 1, 2] as const) field("scale", i, xf.scale[i], 4);
  head(o.texts.quaternion);
  const q = document.createElement("input");
  q.type = "text";
  q.readOnly = true;
  q.dataset.field = "quaternion";
  q.style.gridColumn = "1 / -1";
  q.value = xfQuaternion(xf).map((v) => fmt(v, 5)).join("  ");
  grid.appendChild(q);
  if (o.texts.pivot) {
    head(o.texts.pivot);
    const p = xf.pivot;
    const oldOrigin = !!p && p.every((v) => v === 0) && !isIdentity(xf);
    if (p) {
      // read-only: the data's pivot is shown and copied (⌘C over it), not dragged
      const pd = coordDecimals(Math.max(...p.map(Math.abs)));
      for (const i of [0, 1, 2] as const) {
        const lab = document.createElement("span");
        lab.className = "xf-lab";
        lab.textContent = "XYZ"[i];
        const pv = numField({ value: p[i], decimals: pd, unit: "m", readOnly: true, field: `pivot.${"xyz"[i]}` });
        pv.title = oldOrigin ? o.texts.pivotOld ?? "" : "";
        grid.append(lab, pv);
      }
    } else {
      const pv = document.createElement("input");
      pv.type = "text";
      pv.readOnly = true;
      pv.dataset.field = "pivot";
      pv.style.gridColumn = "1 / -1";
      pv.value = o.texts.pivotBox ?? "";
      pv.title = o.texts.pivotBox ?? "";
      grid.appendChild(pv);
    }
  }
  host.appendChild(grid);
  const foot = document.createElement("p");
  foot.className = "xf-note";
  foot.textContent = o.texts.upAxis(xf.up_axis) + (o.note ? ` · ${o.note}` : "");
  host.appendChild(foot);
  if (!o.readOnly && o.onReset) {
    const row = document.createElement("div");
    row.className = "xf-actions";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.dataset.act = "xf-reset";
    b.textContent = o.texts.reset;
    b.disabled = isIdentity(xf);
    b.addEventListener("click", () => o.onReset?.());
    row.appendChild(b);
    host.appendChild(row);
  }
}
