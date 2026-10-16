/**
 * MICRO-SPAZIO-3D-3 p.1 · the selection of the Space, as Blender's — pure.
 *
 * The defect measured on 16 Oct 2026 (E.D.'s case, the report): the Space had
 * TWO selections. The app's (`selectedId`, `selectedIds`: the nodes) and the
 * sketch's (`spaceSketchSel`, one sketch, not a node). Picking a sketch left
 * the model selected, so the Outliner lit two rows and the scene outlined the
 * model; and the Outliner's row read only the ACTIVE node while the scene read
 * the whole set. A click on a selected row selected it again: nothing ever
 * deselected but a click on the void.
 *
 * Now ONE selection of keys (`rm:<id>`, `proxy:<unit>`, `sketch:<id>`) with
 * one ACTIVE among them, the last clicked; main.ts keeps it in the app's
 * selection (the nodes) plus the set of the sketches, and every surface reads
 * it from there. The rules are Blender's:
 *
 *   scene    click            only that one, active
 *            Shift+click      not selected → added and active;
 *                             the active → removed; selected, not active → active
 *            click on nothing nothing selected («Deselect on nothing»)
 *   Outliner click            only that one, active
 *            ⌘/Ctrl+click     added (active) or removed
 *            Shift+click      the range from the active to it, in the rows' order
 *   keys     A                everything visible and selectable
 *            Alt+A            nothing
 */

export interface SpaceSel {
  /** the selected keys, in the order they were added */
  keys: string[];
  /** the active key (one of `keys`), or null */
  active: string | null;
}

export const EMPTY_SEL: SpaceSel = { keys: [], active: null };

function only(key: string | null): SpaceSel {
  return key ? { keys: [key], active: key } : { keys: [], active: null };
}

/** A click in the scene on `key` (null: on nothing), Shift held or not. */
export function clickScene(sel: SpaceSel, key: string | null, shift: boolean): SpaceSel {
  if (!key) return shift ? sel : EMPTY_SEL;
  if (!shift) return only(key);
  if (!sel.keys.includes(key)) return { keys: [...sel.keys, key], active: key };
  if (sel.active === key) {
    const keys = sel.keys.filter((k) => k !== key);
    // Blender leaves no active when the active is taken away
    return { keys, active: null };
  }
  return { keys: sel.keys, active: key };
}

/** A click on a row of the Outliner. `order` is the keys of the rows as they
 *  are drawn, top to bottom (for Shift's range). */
export function clickOutliner(sel: SpaceSel, key: string, mods: { toggle: boolean; range: boolean }, order: readonly string[]): SpaceSel {
  if (mods.range && sel.active && order.includes(sel.active) && order.includes(key)) {
    const a = order.indexOf(sel.active), b = order.indexOf(key);
    const span = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    const keys = [...sel.keys.filter((k) => !span.includes(k)), ...span];
    // the active stays where the range started, as Blender's Outliner
    return { keys, active: sel.active };
  }
  if (mods.toggle) {
    if (sel.keys.includes(key)) {
      const keys = sel.keys.filter((k) => k !== key);
      return { keys, active: sel.active === key ? keys[keys.length - 1] ?? null : sel.active };
    }
    return { keys: [...sel.keys, key], active: key };
  }
  return only(key);
}

/** A: everything visible and selectable; the active stays when it is among them. */
export function selectAll(sel: SpaceSel, visible: readonly string[]): SpaceSel {
  const keys = [...visible];
  return { keys, active: sel.active && keys.includes(sel.active) ? sel.active : keys[keys.length - 1] ?? null };
}

/** A box: the keys inside it; Shift adds them to what was selected. */
export function boxSelect(sel: SpaceSel, inside: readonly string[], extend: boolean): SpaceSel {
  if (!extend) return inside.length ? { keys: [...inside], active: sel.active && inside.includes(sel.active) ? sel.active : inside[inside.length - 1] } : EMPTY_SEL;
  const keys = [...sel.keys, ...inside.filter((k) => !sel.keys.includes(k))];
  return { keys, active: sel.active ?? keys[keys.length - 1] ?? null };
}

/** The selection less the keys that went (hidden, deleted, out of the scene). */
export function withoutKeys(sel: SpaceSel, gone: (k: string) => boolean): SpaceSel {
  const keys = sel.keys.filter((k) => !gone(k));
  return { keys, active: sel.active && keys.includes(sel.active) ? sel.active : null };
}

/** H, Alt+H, Shift+H: the hidden set after the key. `selected` and `visible`
 *  are keys of objects drawn now. */
export function hideKeys(hidden: readonly string[], mode: "selected" | "unselected" | "reveal",
                         selected: readonly string[], visible: readonly string[]): string[] {
  if (mode === "reveal") return [];
  const s = new Set(hidden);
  const sel = new Set(selected);
  for (const k of visible) if (mode === "selected" ? sel.has(k) : !sel.has(k)) s.add(k);
  return [...s];
}

/** «+N selezionati»: how many besides the active. */
export function othersCount(sel: SpaceSel): number {
  return Math.max(0, sel.keys.length - (sel.active ? 1 : 0));
}

/**
 * The pivot of a gesture on several objects: Blender's default is the MEDIAN
 * POINT. Blender takes the objects' origins; here the origin of a model is
 * often the survey's (the glbs of Templu Mare carry their pose in the
 * vertices, 494 m under the podium), so the centres of the objects' boxes
 * stand for the origins: the pivot is their mean (Blender's «median» is the
 * mean). One object: its own origin, as Blender.
 */
export function medianPoint(centres: ReadonlyArray<readonly [number, number, number]>): [number, number, number] | null {
  if (!centres.length) return null;
  const s = [0, 0, 0];
  for (const c of centres) for (let i = 0; i < 3; i++) s[i] += c[i];
  return [s[0] / centres.length, s[1] / centres.length, s[2] / centres.length];
}
