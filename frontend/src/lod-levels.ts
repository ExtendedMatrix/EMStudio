/**
 * MICRO-PROVA-DEV47 p.3 · the levels of a model: the AUTHOR's and the RECIPE's
 * — pure (`scripts/check-lod-levels.mjs`).
 *
 * E.D. (17 Oct 2026): the Space used LOD3 and LOD4 on the survey and a «LOD1»
 * on the reconstruction, which is not divided into levels at all. Measured on
 * Templu Mare v3.2: every version is a resource a `lod_generation` step made
 * (s3Dgraphy `resources/versions.py`), and the steps say who made it —
 *
 *   · the recipe of EM Tools («Prepare for a use»): `parameters.tool` is
 *     «EM Tools · Prepare for a use», `tool.name` «EM Tools», and the step
 *     carries its knobs (`ratio`, `draco`, `max_texture_px`). All 185 glb
 *     versions of v3.2 (SB/versions, RB/versions), written on 6 Oct at 00:08;
 *   · the author: any other step — the 33 OBJ levels of the survey, `tool.name`
 *     «Blender» and a technique in words («decimation and texture baking, OBJ
 *     export, Blender 2.92 (2021)»).
 *
 * The date does not tell them apart (the author's steps were written by the
 * same import, at the same minute), nor `use` (an author's level says
 * analysis or preview, a recipe's aton, web…, but nothing forbids the other).
 * `parameters.origin` («author» | «recipe»), when a step has it, decides: the
 * field proposed to s3Dgraphy and EM Tools (see the report of the day).
 *
 * The names, then: the author's levels are LOD0, LOD1… in the order of the
 * chain; a recipe's version made from the master with nothing taken away
 * (ratio 1, textures as they are) is the WHOLE model, «intero»; any other
 * recipe's version is DERIVED, from the nearest level above it (an author's,
 * or the whole), with its ratio.
 */

export type LevelOrigin = "master" | "author" | "recipe";

export interface LevelIn {
  id: string;
  master: boolean;
  /** the level computed from the chain («lod0»…), null for the master */
  lod: string | null;
  /** the data of the `lod_generation` step that made it */
  step?: Record<string, unknown> | null;
  /** the resource that step took in */
  input?: string | null;
  tris?: number | null;
  bytes?: number | null;
}

export interface Level {
  id: string;
  origin: LevelOrigin;
  /** the author's level, from 0, in the order of the chain */
  authorOrd: number | null;
  /** a recipe's version of the master, nothing taken away */
  whole: boolean;
  /** derived: the level it comes from (an author's, the whole, the master) */
  base: string | null;
  /** derived: the share of the triangles kept (the step's `ratio`) */
  ratio: number | null;
  /** the order from the finest (0) to the coarsest */
  rank: number;
}

const params = (s: Record<string, unknown> | null | undefined): Record<string, unknown> =>
  (s && typeof s.parameters === "object" && s.parameters ? s.parameters as Record<string, unknown> : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const ordOf = (lod: string | null): number => { const m = /(\d+)/.exec(String(lod ?? "")); return m ? Number(m[1]) : -1; };

/** Who made a version: its step's `parameters.origin` when it says it, else
 *  the recipe's signature (its tool, its knobs), else the author. */
export function stepOrigin(step: Record<string, unknown> | null | undefined): "author" | "recipe" {
  const p = params(step);
  if (p.origin === "author" || p.origin === "recipe") return p.origin;
  if (/prepare for a use/i.test(String(p.tool ?? ""))) return "recipe";
  const tool = step && typeof step.tool === "object" && step.tool ? String((step.tool as Record<string, unknown>).name ?? "") : String(step?.tool ?? "");
  if (/^EM Tools\b/i.test(tool) && ("ratio" in p || "draco" in p || "max_texture_px" in p)) return "recipe";
  return "author";
}

/** The levels of a model's versions, by id. */
export function levelsOf(versions: readonly LevelIn[]): Map<string, Level> {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const out = new Map<string, Level>();
  const chain = [...versions].sort((a, b) => (a.master ? -1 : b.master ? 1 : ordOf(a.lod) - ordOf(b.lod)));
  let authors = 0;
  for (const v of chain) {
    if (v.master) { out.set(v.id, { id: v.id, origin: "master", authorOrd: null, whole: false, base: null, ratio: null, rank: -1 }); continue; }
    const origin = stepOrigin(v.step);
    const p = params(v.step);
    const ratio = num(p.ratio);
    const from = v.input && byId.has(v.input) ? v.input : null;
    if (origin === "author") { out.set(v.id, { id: v.id, origin, authorOrd: authors++, whole: false, base: from, ratio: null, rank: 0 }); continue; }
    const fromMaster = !!from && !!byId.get(from)?.master;
    const tex = num(p.max_texture_px);
    const whole = fromMaster && (ratio == null || ratio >= 1) && (tex == null || tex === 0);
    // the base: the level above it, or — when that is itself derived — the
    // level that one came from, and the ratio from there (the product)
    const fl = from ? out.get(from) : undefined;
    const up = fl?.origin === "recipe" && !fl.whole;
    const base = up ? fl!.base : from;
    const r = (ratio ?? 1) * (up ? fl!.ratio ?? 1 : 1);
    out.set(v.id, { id: v.id, origin, authorOrd: null, whole, base: whole ? from : base, ratio: whole ? 1 : r, rank: 0 });
  }
  // the order, finest first: the author's levels by the chain, each version of
  // the recipe right after the level it comes from (by its ratio, the larger
  // first); the whole before everything the recipe made from it
  const keyOf = (l: Level): number[] => {
    if (l.origin === "master") return [-1];
    if (l.origin === "author") return [l.authorOrd! * 2, 0, 0];
    const b = l.base ? out.get(l.base) : null;
    if (l.whole) return [-0.5, 0, 0];
    const bk = b?.origin === "author" ? b.authorOrd! * 2 : b?.whole ? -0.5 : -1;
    return [bk, 1, -(l.ratio ?? 1)];
  };
  const ranked = [...out.values()].sort((a, b) => {
    const ka = keyOf(a), kb = keyOf(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) if ((ka[i] ?? 0) !== (kb[i] ?? 0)) return (ka[i] ?? 0) - (kb[i] ?? 0);
    return ordOf(byId.get(a.id)?.lod ?? null) - ordOf(byId.get(b.id)?.lod ?? null);
  });
  ranked.forEach((l, i) => { l.rank = l.origin === "master" ? -1 : i - (ranked[0]?.origin === "master" ? 1 : 0); });
  return out;
}

/** The short name of a level: «LOD2», «intero», «derivata», «master». */
export function levelShort(l: Level | undefined, texts: { whole: string; derived: string; master: string }): string {
  if (!l) return "·";
  if (l.origin === "master") return texts.master;
  if (l.origin === "author") return `LOD${l.authorOrd}`;
  return l.whole ? texts.whole : texts.derived;
}

/**
 * The version a desktop draws by default (E.D., 17 Oct 2026): the survey's
 * LIGHTEST level of the author the desktop opens (LOD2 of OB_PODIO, a 9 MB
 * OBJ; LOD1 and LOD0 on request); a reconstruction without levels of the
 * author, the WHOLE model; else null — the rule of the use decides, and the
 * recipe's versions come in for the web or by the distance.
 */
export function defaultLevel(levels: Map<string, Level>, drawable: ReadonlySet<string>): string | null {
  const ok = [...levels.values()].filter((l) => drawable.has(l.id));
  const authors = ok.filter((l) => l.origin === "author").sort((a, b) => b.authorOrd! - a.authorOrd!);
  if (authors.length) return authors[0].id;
  return ok.find((l) => l.whole)?.id ?? null;
}

/**
 * MICRO-GLOBO-INTERAZIONE p.4 · the version a model loads FIRST (E.D., 23 Oct
 * 2026: «sempre la versione più leggera»): the default tileset when the model
 * has one (it streams its own levels); else the LIGHTEST — by the effective
 * weight of the version's files (an OBJ set: the .obj, its .mtl, its textures),
 * a glb before an OBJ at the same weight, an unknown weight after every known
 * one, then the id. The others load only on an explicit choice (manual, by
 * use, automatic by the distance). Measured before it on the GT16 (desktop):
 * the 87 models of D.09 loaded the WHOLE model (lod0, 437 KB for an architrave)
 * instead of its 81 KB lod1, and the 10 meshes of the survey (D.01) the author's
 * LOD2 OBJ (13.4 MB) instead of the 0.5 MB web glb.
 */
export interface WeighIn { id: string; format?: string; bytes?: number | null; master?: boolean }
export function lightestVersion<T extends WeighIn>(versions: readonly T[]): T | null {
  const ok = versions.filter((v) => !v.master);
  if (!ok.length) return null;
  const tiles = ok.filter((v) => v.format === "tiles");
  const pool = tiles.length ? tiles : ok;
  const fmt = (v: WeighIn) => (v.format === "gltf" ? 0 : v.format === "obj" ? 1 : 2);
  const known = (v: WeighIn) => typeof v.bytes === "number" && Number.isFinite(v.bytes);
  return [...pool].sort((a, b) => (known(a) === known(b) ? 0 : known(a) ? -1 : 1)
    || (known(a) && known(b) ? (a.bytes as number) - (b.bytes as number) : 0)
    || fmt(a) - fmt(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/** MICRO-PROVA-DEV47 p.3a · the weight over which a version is asked before it
 *  is loaded: 150 MB of files, or 5 million triangles. */
export const HEAVY_BYTES = 150 * 1024 * 1024;
export const HEAVY_TRIS = 5_000_000;
export function isHeavy(v: { bytes?: number | null; tris?: number | null }): boolean {
  return (v.bytes ?? 0) > HEAVY_BYTES || (v.tris ?? 0) > HEAVY_TRIS;
}
