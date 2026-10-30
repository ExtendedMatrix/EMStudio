/**
 * MICRO-PREPARA-DIAGNOSI (E.D., 30 Oct 2026) · preparing a model for a use,
 * seen from outside Blender: the SAME diagnosis EM Tools shows in Blender —
 * the same table of profiles and the same pure function, s3Dgraphy's
 * `resources.use_profiles`, asked of the bridge (`POST /optimize/diagnose`):
 * for glTF files read without Blender, for a .blend through EM Tools in
 * Blender (`POST /jobs {kind: blender, op: measure}`, then the same call with
 * what it measured). The grid's ticks are applied by EM Tools in Blender
 * (`op: apply_use`), a job with its queue, progress and cancel; the versions
 * in versions/ are listed and removed with a warning that names their files
 * and the nodes of the document that name them.
 *
 * Nothing here computes a number: the numbers are the bridge's. What is here
 * is how they are said (`check-use-diagnosis.mjs` reads this module).
 *
 * MICRO-PREPARA-RITOCCHI (E.D., 30 Oct 2026): the profiles bear E.D.'s names;
 * the grid comes in groups, each with its rationale and its tick, the safe
 * rows ticked already; a group opened shows its rows model by model with
 * their rationale and the parameters the person may change (target
 * triangles, texture side, format); ONE «Apply the ticks». A tileset is a
 * packaging the diagnosis suggests, an action of its own.
 */

export interface UseProfile {
  id: string; label: string; uses: string[]; destination: string;
  max_triangles: number | null; max_triangles_object: number | null;
  max_textures: number | null; max_texture_side: number | null;
  texture_formats: string[]; geometry_compression: string[];
  instancing: boolean; packaging: "glb" | "gltf_separate" | "stl";
  max_download_mb: number | null; max_gpu_mb: number | null;
  /** MICRO-PREPARA-RITOCCHI · E.D.'s name in Italian, what the profile is for
   *  (one line, in English and Italian), a hint («ATON / Heriverse»), and
   *  whether a tileset (a packaging) suits it */
  label_it?: string; purpose?: string; purpose_it?: string; hint?: string; hint_it?: string; tileset?: boolean;
}

/** The profile's name and its line in the page's language (Italian: E.D.'s
 *  names; any other language: the table's English). */
export function profileWords(p: UseProfile, locale: string): { label: string; purpose: string; hint: string } {
  const it = locale === "it";
  return { label: (it ? p.label_it : "") || p.label, purpose: (it ? p.purpose_it : "") || p.purpose || "",
           hint: (it ? p.hint_it : "") || p.hint || "" };
}

export interface Effect { triangles: number; triangles_stored: number; draw_calls: number;
  download_bytes: number; gpu_bytes: number }

/** The parameters of a row the person may change (MICRO-PREPARA-RITOCCHI). */
export interface RowParams { triangles_to?: number; side?: number | null; format?: string; scale?: number }

export interface DiagRow {
  id: string; kind: "instances" | "decimate" | "textures" | "texture_side" | "texture_format" | "geometry_compression"
    | "single_mesh" | "drop_textures" | "scale" | "closed" | "tileset" | "packaging";
  problem: string; action: string; effect: Effect; checked: boolean; available: boolean; why: string;
  targets?: string[];
  /** its group (instances, textures, decimate, compression, print, tileset,
   *  packaging), its rationale in one sentence, its parameters */
  group?: string; rationale?: string; params?: RowParams;
  /** an action of its own (the tileset): its tick does not change the version */
  separate?: boolean; engines?: string[];
}

/** A group of the grid: its rationale, its tick (every row it can apply). */
export interface DiagGroup { id: string; label: string; rationale: string; safe: boolean; rows: string[];
  checked: boolean; available: boolean }

export interface Sim { triangles: number; triangles_stored: number; meshes: number; draw_calls: number;
  textures: number; download_bytes: number; gpu_bytes: number }

export interface Diagnosis {
  ok: boolean; profile: string; profile_label: string; engine: string; source?: "files" | "blend";
  objects: { name: string; triangles: number; vertices: number; materials: number; draw_calls: number;
    textures: number; texture_side_max: number; over_budget: boolean }[];
  totals: { objects: number; triangles: number; vertices: number; materials: number; draw_calls: number;
    meshes: number; textures: number; texture_bytes: number; texture_side_max: number };
  duplicates: { geometry_key: string; objects: string[]; copies: number; meshes: number; triangles: number }[];
  peaks: { name: string; triangles: number }[];
  budget: Record<string, { value: number; limit: number | null; ok: boolean }>;
  before: Sim; after: Sim; improvements: DiagRow[]; lines: string[];
  groups?: DiagGroup[]; tileset?: { reasons: string[]; engines: string[]; action: string } | null;
  files?: { path: string; bytes: number }[]; files_bytes?: number;
}

export interface VersionOnDisk {
  name: string; model: string; level: string; destination: string; profile: string;
  entry: string; path: string; files: string[]; bytes: number; modified: number;
  stamp: string | null; triangles: number | null; textures: number | null;
}

const MB = 1024 * 1024;

/** «22.0 MB» */
export function mb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** «−586,000 tri. memorizzati · −23.0 MB scaricati · −11 chiamate» — the
 *  effect of one row, signed; «—» when it changes nothing. `words` are the
 *  page's (translated) units. */
export function effectLine(e: Partial<Effect>, words = { tris: "tris", stored: "tris stored", down: "download",
  gpu: "GPU", calls: "draw calls" }): string {
  const sign = (n: number, d = 0) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toLocaleString("en-US",
    { minimumFractionDigits: d, maximumFractionDigits: d });
  const out: string[] = [];
  if (e.triangles) out.push(`${sign(e.triangles)} ${words.tris}`);
  else if (e.triangles_stored) out.push(`${sign(e.triangles_stored)} ${words.stored}`);
  if (e.download_bytes) out.push(`${sign(e.download_bytes / MB, 1)} MB ${words.down}`);
  if (e.gpu_bytes) out.push(`${sign(e.gpu_bytes / MB, 1)} MB ${words.gpu}`);
  if (e.draw_calls) out.push(`${sign(e.draw_calls)} ${words.calls}`);
  return out.join(" · ") || "—";
}

/** The ids of the rows to apply: the person's ticks over each row's own,
 *  only rows that can be applied (a separate action — the tileset — is not
 *  one of the version's). */
export function checkedIds(d: Diagnosis, ticks: ReadonlyMap<string, boolean>): string[] {
  return d.improvements.filter((r) => r.available && !r.separate && r.kind !== "packaging"
    && (ticks.get(r.id) ?? r.checked)).map((r) => r.id);
}

/** The groups of the grid, in the table's order (an older bridge sends none:
 *  each row is then its own kind's group). */
export function groupsOf(d: Diagnosis): DiagGroup[] {
  if (d.groups?.length) return d.groups;
  const seen = new Map<string, DiagGroup>();
  for (const r of d.improvements) {
    if (r.kind === "packaging") continue;
    const g = r.group ?? r.kind;
    if (!seen.has(g)) seen.set(g, { id: g, label: g, rationale: "", safe: true, rows: [], checked: true, available: false });
    const x = seen.get(g) as DiagGroup;
    x.rows.push(r.id);
    x.available = x.available || r.available;
  }
  return [...seen.values()];
}

/** The rows of a group. */
export function rowsOf(d: Diagnosis, gid: string): DiagRow[] {
  const ids = new Set(groupsOf(d).find((g) => g.id === gid)?.rows ?? []);
  return d.improvements.filter((r) => ids.has(r.id));
}

/** A group's tick as the person's ticks make it: on when every row it can
 *  apply is on (a group with nothing to apply is off). */
export function groupTicked(d: Diagnosis, gid: string, ticks: ReadonlyMap<string, boolean>): boolean {
  const can = rowsOf(d, gid).filter((r) => r.available && !r.separate);
  return can.length > 0 && can.every((r) => ticks.get(r.id) ?? r.checked);
}

/** The group's tick moves its rows': every row it can apply. */
export function tickGroup(d: Diagnosis, gid: string, on: boolean, ticks: Map<string, boolean>): void {
  for (const r of rowsOf(d, gid)) if (r.available && !r.separate) ticks.set(r.id, on);
}

/** The parameters to send: the person's edits over each row's own, only for
 *  rows that have parameters. */
export function paramsFor(d: Diagnosis, edits: ReadonlyMap<string, RowParams>): Record<string, RowParams> {
  const out: Record<string, RowParams> = {};
  for (const r of d.improvements) {
    if (!r.params) continue;
    const mine = edits.get(r.id);
    if (!mine) continue;
    out[r.id] = { ...r.params, ...mine };
  }
  return out;
}

/** `lod1` when the ticks decimate, else `lod0` (EM Tools' `level_for`). */
export function levelFor(d: Diagnosis, ids: readonly string[]): string {
  return d.improvements.some((r) => r.kind === "decimate" && ids.includes(r.id)) ? "lod1" : "lod0";
}

/** The budget rows that have a limit, in the table's order. */
export function budgetRows(d: Diagnosis): { key: string; value: number; limit: number; ok: boolean }[] {
  return Object.entries(d.budget).filter(([, v]) => v.limit !== null)
    .map(([key, v]) => ({ key, value: v.value, limit: v.limit as number, ok: v.ok }));
}

/** The heaviest objects first (the table shows the first `n`). */
export function heaviest(d: Diagnosis, n = 12): Diagnosis["objects"] {
  return [...d.objects].sort((a, b) => b.triangles - a.triangles || a.name.localeCompare(b.name)).slice(0, n);
}

/** A row that lives only in Blender: decimating with a normal map, on a .blend
 *  or not, is EM Tools' (3DSC's bake) — EMStudio says it and launches it. */
export function blenderOnly(r: DiagRow): boolean {
  return r.kind === "decimate";
}

/** The warning of a removal: one line per version (its files and weight), one
 *  per node of the document that names it. */
export function removalLines(plan: { name: string; files: string[]; bytes: number;
  nodes: { id: string; name: string }[] }[], words = { files: "file(s)", graph: "graph" }): string[] {
  const out: string[] = [];
  for (const p of plan) {
    out.push(`${p.name}: ${p.files.length} ${words.files}, ${mb(p.bytes)}`);
    for (const n of p.nodes) out.push(`   ${words.graph}: ${n.name}`);
  }
  return out;
}

/** The versions of these model names (a .blend's objects or containers, or a
 *  file's own model); all of them when no name is given. */
export function versionsOf(rows: readonly VersionOnDisk[], models: readonly string[]): VersionOnDisk[] {
  if (!models.length) return [...rows];
  const set = new Set(models);
  return rows.filter((r) => set.has(r.model) || set.has(r.model.split("+")[0]));
}
