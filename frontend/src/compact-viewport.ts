// MICRO-SEG31 (E.D., 22 Nov 2026: «ci sono troppi menu dentro lo spazio 3D: di
// solito a quella dimensione non si dovrebbero vedere») · a 3D area takes the
// form of its room, as Blender's regions hide what does not fit.
//
//   small  (narrower than 520 px or lower than 360 px): the small gizmo, «Follow
//          the text» in the Narrative's companion, ONE «ⓘ» that opens the scene's
//          state in a popover, «⋯» that brings the columns of buttons back; no
//          line of text over the scene, the proxies' labels off (they can be
//          turned on from the popover);
//   mid    (up to 820 × 520): ONE line of essential information;
//   full   : as before.
//
// Pure rules here (tested in node); the DOM in main.ts (`mountScene`), the look
// in style.css (`.scn-host[data-vp=…]`).

export type ViewportSize = "small" | "mid" | "full";

/** below either side: small */
export const VP_SMALL = { w: 520, h: 360 } as const;
/** below either side (and not small): one line of information */
export const VP_FULL = { w: 820, h: 520 } as const;

/** the form of a 3D area of `w` × `h` CSS pixels (0 × 0, not laid out yet: full) */
export function viewportSize(w: number, h: number): ViewportSize {
  if (!(w > 0) || !(h > 0)) return "full";
  if (w < VP_SMALL.w || h < VP_SMALL.h) return "small";
  if (w < VP_FULL.w || h < VP_FULL.h) return "mid";
  return "full";
}

/** what does not load in the epoch shown: the models (their names) and the proxies (how many) */
export interface LoadTrouble {
  models: string[];
  proxies: number;
}

/** counted from the Space's summary (`space.ts` `summary`) and the names of its models */
export function loadTrouble(sum: { rmMissing: string[]; missing: string[]; refused: string[]; rms: { id: string; name: string; resource?: { state?: string } | null }[] },
                            failed: Iterable<string> = []): LoadTrouble {
  const bad = new Set(sum.rmMissing);
  for (const r of sum.rms) if (r.resource?.state === "refused") bad.add(r.id);
  for (const id of failed) if (sum.rms.some((r) => r.id === id)) bad.add(id);
  return { models: sum.rms.filter((r) => bad.has(r.id)).map((r) => r.name), proxies: sum.missing.length + sum.refused.length };
}

export const hasTrouble = (x: LoadTrouble): boolean => x.models.length > 0 || x.proxies > 0;
