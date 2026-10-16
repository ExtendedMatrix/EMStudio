/**
 * MICRO-SPAZIO-3D-3 p.13 · the DTC's readable labels — pure
 * (`scripts/check-dtc-labels.mjs`).
 *
 * The steps and lanes of the DTC carried their whole names: «LOD generation
 * lod0 of Architrave_1_BAKE_SM_Architrave_1_BAKE — reconstruction model,
 * master (GreatTemple_2026_v2.blend)», «Products of LOD generation lod0 of …».
 * Measured on Templu Mare v3.2 (16 Oct 2026): 274 `dtc_process`, 230 of them
 * «LOD generation lodN of <object>» (lod0 99, lod1 98, lod2–4 11 each), the
 * rest named by a person («Viste ortometriche di TM018 in Blender»).
 *
 * A SHORT LABEL is computed, as for the properties; the full name stays in the
 * tooltip, the Inspector and the search, and nothing changes in the data:
 *
 *   · a step: its level and the object cleaned — «LOD0 · Architrave_1» (the
 *     glyph of its type is the box's);
 *   · a lane of products: «Prodotti · LOD0 · Architrave_1»;
 *   · the object cleaned: what follows « — » (the description of the master)
 *     goes, the level suffix goes (p.11), and the repeated technical prefixes —
 *     `SM_`, `BAKE`, `OB_`, the name said twice around «_SM_»;
 *   · still long: cut in the MIDDLE («Architrave_1…lod0»), not at the end.
 */
import { splitLevel } from "./rm-names";

/** The object of a step, without what only the tools need. */
export function cleanObject(raw: string): string {
  let s = (raw ?? "").trim();
  s = s.replace(/\s+—\s+.*$/, "");                      // «— surveyed mesh, master (…)»
  for (let i = 0; i < 2; i++) { const l = splitLevel(s); if (l.level) s = l.base.trim(); }
  s = s.replace(/\s*\((OBJ|FBX|GLB|GLTF|PLY|STL|DAE|3DS|ABC|USD[ZC]?)\)\s*$/i, "");
  // the name twice around «_SM_» (Blender's object and its mesh): once
  const m = /^(.+?)_SM_(.+)$/.exec(s);
  if (m && m[1] === m[2]) s = m[1];
  s = s.replace(/^(SM_|OB_)+/, "").replace(/_BAKE(?=$|[._])/g, "").replace(/^BAKE_/, "");
  return s || raw;
}

const STEP = /^LOD generation (lod|LOD)\s*(\d+) of (.+)$/;

/** A step's short label, or null when its name is not the tools' (a name a
 *  person gave stays, only cut when long). */
export function shortStepLabel(name: string): string | null {
  const m = STEP.exec((name ?? "").trim());
  if (!m) return null;
  return `LOD${Number(m[2])} · ${cleanObject(m[3])}`;
}

/** Cut in the middle: «Architrave_1_lungo…lod0». `max` in characters. */
export function middleCut(s: string, max = 28): string {
  if (!s || s.length <= max) return s;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.6), tail = keep - head;
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

/** What a step's box says: the short label, else its name; cut in the middle. */
export function stepBoxLabel(name: string, max = 28): string {
  return middleCut(shortStepLabel(name) ?? name, max);
}
