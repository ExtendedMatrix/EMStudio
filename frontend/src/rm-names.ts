/**
 * MICRO-SPAZIO-3D-3 p.11 · the name of a model without its level suffix — pure
 * (`scripts/check-rm-names.mjs`).
 *
 * Where a model has versions (LOD0, LOD1…), its title does not carry the level:
 * «SM_OB_EST_fr_LOD1» reads «SM_OB_EST_fr», with the level of the version
 * drawn as a chip («LOD1»). The technical name stays in the tooltip and in the
 * Inspector, as for the properties (a readable name over the technical one);
 * nothing changes in the data.
 *
 * The suffixes, measured on Templu Mare v3.2 (16 Oct 2026): 11 of the 99
 * models end in `_LOD1` (SM_OB_EST_bk_LOD1 … SM_OB_TEMPLUM_LOD1); of the 485
 * resources 198 carry « lodN» (`OB_EST_L (surveyed mesh) lod3`) and 33 « LODN»
 * followed by the format in brackets (`OB_EST_L LOD0 (OBJ)`). So: a level
 * word — LOD, lod, Lod — with its number, after a space, an underscore, a dot
 * or a dash, at the end, or before a bracket that names the format.
 */

const LEVEL = /([ _.-])(LOD|lod|Lod)[ _]?(\d+)(\s*\([^()]*\))?\s*$/;

/** The name less its level suffix, the level («LOD1») and the bracket that
 *  followed it (a format: «(OBJ)»), or the name as it is. */
export function splitLevel(name: string): { base: string; level: string | null; tail: string } {
  const m = LEVEL.exec(name ?? "");
  if (!m || m.index === 0) return { base: name ?? "", level: null, tail: "" };
  return { base: name.slice(0, m.index), level: `LOD${Number(m[3])}`, tail: (m[4] ?? "").trim() };
}

/** What a model's row, label and title show: shortened only when it has
 *  versions (a name that merely ends in «_LOD1» without versions stays). */
export function shownModelName(name: string, hasVersions: boolean): { shown: string; technical: string; level: string | null } {
  if (!hasVersions) return { shown: name, technical: name, level: null };
  const s = splitLevel(name);
  return { shown: s.level ? s.base : name, technical: name, level: s.level };
}
