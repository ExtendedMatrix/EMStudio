/**
 * MICRO-DOVE-CHI-MENU p.6 · ONE NUMERIC FIELD, Blender's.
 *
 * E.D. (19 Oct 2026): the numbers of the 3D cursor, of a transform, of the N
 * panel did not behave as in Blender, where you drag to change a value and copy
 * it with the mouse over it. Every numeric field is now this one:
 *
 * - drag left/right with the left button: the value changes by a step tied to
 *   the unit (1 cm, 1°, 0.01 of scale per pixel); Shift = fine (×0.1); Ctrl =
 *   by notches (1 m, 5°, 0.1 of scale); the pointer hides and comes back where
 *   it was (pointer lock); Esc during the drag puts the value back;
 * - a click without a drag enters the field to type, the value selected as
 *   in Blender; Enter confirms, Esc cancels; a double click selects all the
 *   text (again, after the caret was moved);
 * - with the mouse over it: ⌘C copies the value, ⌘V pastes one, Backspace puts
 *   the default back (0, 1 for a scale, empty where empty is allowed);
 * - dragged DOWN first, over the fields of one column (X, Y, Z), it takes them
 *   all, then a drag sideways changes them together — as Blender's;
 * - ONE step of undo per drag (or per paste, per typed value): nothing is
 *   written while the pointer moves, the number on screen follows it and the
 *   write happens once, at the release.
 *
 * The field shows numbers in the unit it is given (metres, degrees); turning
 * them into the data's (radians) is the caller's, in `commit`.
 */

export type NumUnit = "m" | "deg" | "scale" | "plain";

/** the change per pixel of drag, and the notch of Ctrl, per unit */
export const DRAG_STEP: Record<NumUnit, number> = { m: 0.01, deg: 1, scale: 0.01, plain: 0.01 };
export const SNAP_STEP: Record<NumUnit, number> = { m: 1, deg: 5, scale: 0.1, plain: 0.05 };
const DRAG_THRESHOLD = 3;   // px before a press becomes a drag
const COLUMN_THRESHOLD = 6; // px down before it becomes a column drag

export interface NumFieldOptions {
  value: number | null;
  unit: NumUnit;
  decimals: number;
  /** the value Backspace puts back (null = empty, where `nullable`) */
  defaultValue?: number | null;
  nullable?: boolean;
  min?: number;
  max?: number;
  readOnly?: boolean;
  /** `data-field`, what the probes find the field by */
  field?: string;
  /** fields with the same group and column drag together (X, Y, Z) */
  group?: NumGroup;
  column?: string;
  /** one value confirmed: ONE step of undo (when not in a group) */
  commit?: (value: number | null) => void;
}

/** Read a number as a person types it: a comma is a decimal point too. */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(/\s+/g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function formatNumber(v: number | null, decimals: number): string {
  if (v == null) return "";
  const s = v.toFixed(decimals);
  return s === `-${(0).toFixed(decimals)}` ? (0).toFixed(decimals) : s;
}

/** The value a drag of `dx` pixels gives from `start`. */
export function dragValue(start: number, dx: number, unit: NumUnit, mods: { shift?: boolean; ctrl?: boolean },
                          step = DRAG_STEP[unit]): number {
  let v = start + dx * step * (mods.shift ? 0.1 : 1);
  if (mods.ctrl) {
    const n = SNAP_STEP[unit];
    v = Math.round(v / n) * n;
  }
  return Number(v.toFixed(10));
}

interface FieldState {
  input: HTMLInputElement;
  o: NumFieldOptions;
  value: number | null;
}

/**
 * Fields that change together: a drag over a column (X, Y, Z) is written ONCE,
 * through `commit`, with every field it changed.
 */
export class NumGroup {
  readonly fields: FieldState[] = [];
  constructor(readonly commit: (changes: Array<{ field: string; value: number | null }>) => void) {}
}

const states = new WeakMap<HTMLInputElement, FieldState>();
let hovered: FieldState | null = null;
let clipboardFallback: string | null = null;

function clamp(st: FieldState, v: number | null): number | null {
  if (v == null) return st.o.nullable ? null : st.value;
  let x = v;
  if (st.o.min !== undefined) x = Math.max(st.o.min, x);
  if (st.o.max !== undefined) x = Math.min(st.o.max, x);
  return x;
}

function show(st: FieldState, v: number | null): void {
  st.input.value = formatNumber(v, st.o.decimals);
}

/** Write the changes: through the group once, or the field's own commit. */
function write(changes: Array<{ st: FieldState; value: number | null }>): void {
  const real = changes.filter((c) => c.value !== c.st.value);
  if (!real.length) return;
  for (const c of real) { c.st.value = c.value; show(c.st, c.value); }
  const group = real[0].st.o.group;
  if (group && real.every((c) => c.st.o.group === group)) {
    group.commit(real.map((c) => ({ field: c.st.o.field ?? "", value: c.value })));
    return;
  }
  for (const c of real) c.st.o.commit?.(c.value);
}

function editing(st: FieldState): boolean {
  return !st.input.readOnly && document.activeElement === st.input;
}

function enterEdit(st: FieldState, selectAll: boolean): void {
  if (st.o.readOnly) return;
  st.input.readOnly = false;
  st.input.classList.add("num-editing");
  st.input.focus();
  if (selectAll) st.input.select();
  else { const n = st.input.value.length; st.input.setSelectionRange(n, n); }
}

function leaveEdit(st: FieldState, confirm: boolean): void {
  if (confirm) {
    // what is not a number puts the value back; what is, is written and shown
    // in the field's own form ("2,5" → "2.500")
    const typed = parseNumber(st.input.value);
    if (typed !== null || st.o.nullable) write([{ st, value: clamp(st, typed) }]);
  }
  show(st, st.value);
  st.input.readOnly = true;
  st.input.classList.remove("num-editing");
  if (document.activeElement === st.input) st.input.blur();
}

/** The fields of the same group and column between two heights, top to bottom. */
function columnBetween(st: FieldState, y0: number, y1: number): FieldState[] {
  const g = st.o.group;
  if (!g || !st.o.column) return [st];
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  return g.fields.filter((f) => {
    if (f.o.column !== st.o.column || f.o.readOnly || !f.input.isConnected) return false;
    const r = f.input.getBoundingClientRect();
    return r.bottom >= lo && r.top <= hi;
  });
}

function wire(st: FieldState): void {
  const inp = st.input;
  inp.addEventListener("pointerenter", () => { hovered = st; });
  inp.addEventListener("pointerleave", () => { if (hovered === st) hovered = null; });
  inp.addEventListener("dblclick", (e) => { e.preventDefault(); enterEdit(st, true); });
  inp.addEventListener("keydown", (e) => {
    e.stopPropagation();   // G, R, S, N… typed here are digits and letters
    if (!editing(st)) return;
    if (e.key === "Enter") { e.preventDefault(); leaveEdit(st, true); }
    else if (e.key === "Escape") { e.preventDefault(); leaveEdit(st, false); }
  });
  inp.addEventListener("blur", () => { if (!inp.readOnly) leaveEdit(st, true); });
  if (st.o.readOnly) return;

  inp.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || editing(st)) return;
    e.preventDefault();   // not a caret: a press on the field is a drag or a click
    const x0 = e.clientX, y0 = e.clientY;
    let mode: "press" | "column" | "drag" = "press";
    let taken: FieldState[] = [st];
    let starts = new Map<FieldState, number>();
    let dx = 0;
    let lastX = x0;
    const locked = (): boolean => document.pointerLockElement === inp;
    try { inp.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const startDrag = (): void => {
      mode = "drag";
      starts = new Map(taken.map((f) => [f, f.value ?? f.o.defaultValue ?? 0]));
      for (const f of taken) f.input.classList.add("num-dragging");
      document.body.classList.add("num-drag-on");
      // the pointer hides and comes back where it was: Blender's way
      try {
        const asked = (inp.requestPointerLock as () => unknown)?.call(inp) as Promise<void> | undefined;
        asked?.catch?.(() => { /* not granted (a frame, a headless page): the drag still works */ });
      } catch { /* not granted: the drag still works */ }
    };
    const move = (ev: PointerEvent): void => {
      if (mode === "press") {
        const mx = ev.clientX - x0, my = ev.clientY - y0;
        if (st.o.column && st.o.group && my > COLUMN_THRESHOLD && Math.abs(my) > Math.abs(mx)) {
          mode = "column";
        } else if (Math.abs(mx) > DRAG_THRESHOLD) {
          lastX = x0;   // the pixels of the threshold count: measured from the press
          startDrag();
        } else return;
      }
      if (mode === "column") {
        // down over X, Y, Z: they are taken; then sideways, they change together
        taken = columnBetween(st, y0, ev.clientY);
        for (const f of st.o.group!.fields) f.input.classList.toggle("num-taken", taken.includes(f));
        if (Math.abs(ev.clientX - x0) > DRAG_THRESHOLD * 2) { lastX = x0; startDrag(); }
        else return;
      }
      dx += locked() ? ev.movementX : ev.clientX - lastX;
      lastX = ev.clientX;
      for (const f of taken) {
        const v = clamp(f, dragValue(starts.get(f)!, dx, f.o.unit, { shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey }));
        show(f, v);
      }
    };
    const end = (cancel: boolean): void => {
      inp.removeEventListener("pointermove", move);
      inp.removeEventListener("pointerup", up);
      inp.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      try { inp.releasePointerCapture(e.pointerId); } catch { /* */ }
      if (locked()) document.exitPointerLock?.();
      document.body.classList.remove("num-drag-on");
      for (const f of st.o.group?.fields ?? [st]) f.input.classList.remove("num-dragging", "num-taken");
      if (mode === "press" && !cancel) { enterEdit(st, true); return; }
      if (mode !== "drag" || cancel) { for (const f of taken) show(f, f.value); return; }
      // ONE write for the whole drag: one step of undo
      write(taken.map((f) => ({ st: f, value: parseNumber(f.input.value) ?? f.value })));
    };
    const up = (): void => end(false);
    const onCancel = (): void => end(true);
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); end(true); }
    };
    inp.addEventListener("pointermove", move);
    inp.addEventListener("pointerup", up);
    inp.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  });
}

// with the mouse over a field: ⌘C, ⌘V, Backspace — before any other key
// handler of the page (a Backspace over a number must not delete a node)
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    const st = hovered;
    if (!st || !st.input.isConnected || editing(st)) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === "c") {
      e.preventDefault();
      e.stopImmediatePropagation();
      const text = st.input.value;
      clipboardFallback = text;
      void navigator.clipboard?.writeText(text).catch(() => {});
      st.input.dataset.copied = text;
      return;
    }
    if (st.o.readOnly) return;
    if (mod && k === "v") {
      e.preventDefault();
      e.stopImmediatePropagation();
      const paste = (text: string | null): void => {
        const v = clamp(st, parseNumber(text ?? ""));
        if (v != null || st.o.nullable) write([{ st, value: v }]);
      };
      const read = navigator.clipboard?.readText?.();
      if (read) void read.then(paste, () => paste(clipboardFallback));
      else paste(clipboardFallback);
      return;
    }
    if (e.key === "Backspace" && !mod) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const d = st.o.defaultValue === undefined ? (st.o.nullable ? null : 0) : st.o.defaultValue;
      write([{ st, value: clamp(st, d) }]);
    }
  }, true);
}

/** A numeric field, Blender's. Returns the `<input>`, to place beside its label. */
export function numField(o: NumFieldOptions): HTMLInputElement {
  const inp = document.createElement("input");
  inp.type = "text";
  inp.inputMode = "decimal";
  inp.spellcheck = false;
  inp.autocomplete = "off";
  inp.className = "num-field";
  inp.readOnly = true;   // a press drags; a click enters it
  if (o.readOnly) inp.classList.add("num-ro");
  if (o.field) inp.dataset.field = o.field;
  if (o.column) inp.dataset.column = o.column;
  const st: FieldState = { input: inp, o, value: o.value };
  show(st, o.value);
  states.set(inp, st);
  o.group?.fields.push(st);
  wire(st);
  return inp;
}

/** The value a field holds (for probes and callers). */
export function numValue(inp: HTMLInputElement): number | null {
  return states.get(inp)?.value ?? null;
}
