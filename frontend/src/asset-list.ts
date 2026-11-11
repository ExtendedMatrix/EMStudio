/**
 * MICRO-ARCHIVE-ASSET · Archive › Asset, the list of a study's assets (E.D.,
 * 31 Oct 2026: the dialog «Consolida per…» was unusable; a list in the manner
 * of Unreal's content browser, in Archive as its second view «File | Asset»).
 * The answer is s3Dgraphy's `resources.asset_list` through the bridge
 * (`POST /assets/list`): each asset with its versions and their textures, the
 * state and the proposal per target, the study's textures once, the totals
 * against the bands. Nothing of its rules is ported here: this module only
 * SHAPES the answer for the page — the groups, the order, the filters, the
 * plan the person edits, the one queue (Run / Pausa) and the bars «dopo la
 * coda». No DOM. `scripts/check-asset-list.mjs` runs it.
 */

// ── the answer of the bridge (s3Dgraphy's shapes) ───────────────────────────

export type TargetKey = "mobile" | "web" | "desk" | "arch";
export const TARGET_KEYS: readonly TargetKey[] = ["mobile", "web", "desk", "arch"];
export type TargetState = "ok" | "todo" | "missing" | "na";
export type Tool = "decimate_bake" | "gltfpack" | "ktx2" | "tileset" | "instance" | "keep";
export const TOOLS: readonly Tool[] = ["decimate_bake", "gltfpack", "ktx2", "tileset", "instance", "keep"];

export interface Bands {
  profile: string; label_it: string; object_triangles: number | null; object_texture_side: number | null;
  scene_triangles: number | null; scene_download_mb: number | null; scene_gpu_mb: number | null;
}
export interface TextureRow {
  key: string; name: string; sha256: string; width: number; height: number; format: string;
  bytes: number | null; gpu_bytes: number;
}
export interface VersionRow {
  id: string; name: string; asset_id?: string; master: boolean; level: string; lod_level: string; level_say: string;
  use: string[]; url: string; checksum: string; stamped: boolean; size_bytes: number | null; triangles: number | null;
  gpu_bytes: number | null; measured: boolean; texture_side: number | null; ktx2: boolean | null; tileset: boolean;
  textures: TextureRow[]; texture_count: number | null; state: string;
  made: { by: string[]; orcid: string; at: string; tool: string; how: string }; made_say: string;
  modified_after_stamp: boolean; sha256_now: string; loaded_by: TargetKey[];
  /** MICRO-ARCHIVE-ASSET-2 · the geometry keys of the file's meshes and its
   *  compression (s3Dgraphy ≥ dev84; absent before: the shapes fall back on
   *  triangles and textures) */
  geometry_keys?: string[]; compression?: string;
  /** MICRO-TESTATA-CLOUD · its file (or files) only in a cloud — OneDrive,
   *  iCloud, Dropbox «online only» — never read by the bridge: the numbers
   *  are the graph's; where they are and how many bytes (bridge ≥ 56) */
  in_cloud?: boolean; cloud_paths?: string[]; cloud_bytes?: number;
  /** MICRO-ARCHIVE-ASSET-3 · a tileset's tiles read by their heads (bridge
   *  ≥ 57): how many, how many read, the most triangles and the largest
   *  texture side of one tile; MICRO-ASSETS-3TZ (bridge ≥ 65): over the
   *  bridge's ceiling a sample stratified by level, the rest estimated */
  tiles?: { tiles: number; read: number; max_triangles: number | null; max_texture_side: number | null;
            estimated?: boolean; sampled?: number; sample_read?: number } | null;
  /** MICRO-VERSIONI-PER-USO · the profile it was made for («» for a rung of
   *  a LOD chain), said by its use; its numbers (s3Dgraphy ≥ this MICRO) */
  profile?: string; by_use?: boolean; use_params?: Record<string, unknown>;
}
export interface Proposal { tool: Tool; triangles: number | null; texture: number | null; ktx2: boolean; why: string }
export interface TileFit { ok: boolean; known: boolean; tiles: number; read: number; over_triangles: number; over_texture: number;
                           max_triangles: number | null; max_texture_side: number | null; estimated?: boolean; sampled?: number }
export interface TargetCell {
  state: TargetState; loads: string; why: string; proposal: Proposal; loaded_why?: string;
  /** MICRO-ARCHIVE-ASSET-3 · a mesh covered by its container's tileset for
   *  this target (state `na`, no proposal, out of the count) */
  covered_by?: { id: string; name: string; version: string } | null;
  /** the container's tileset of a mesh, and its state for this target */
  tileset_of?: { id: string; name: string; state: TargetState } | null;
  /** why a mesh is wanted one by one though its container has a tileset */
  single?: string;
  /** a tileset's cell: do its tiles fit the band */
  tiles?: TileFit;
  /** MICRO-BLENDER-SIDECAR p.4a · its tiles are out of the band and cannot
   *  be remade here: the master is missing (`retileWithoutMaster`) */
  retile?: "no_master";
}
export interface AssetRow {
  id: string; name: string; kind: "rm" | "container"; description?: string;
  containers: { id: string; name: string }[]; branch: string; epochs: string[]; family: string; status: string;
  versions: VersionRow[]; targets: Record<TargetKey, TargetCell>;
  findings: { level: string; code: string; say_it: string; action: Record<string, unknown> }[];
  loaded_why: string; loaded_say: string;
  tileset_master?: { declared: boolean; sources: { id: string; name: string }[]; unavailable: string; say_it: string } | null;
  audit: { versions: number; stamped: number; files_missing: string[]; files_in_cloud?: string[]; unchecked: number; modified_after_stamp: string[];
           master_declared: boolean | null | undefined };
}
export interface StudyTexture {
  sha256: string; name: string; names: string[]; width: number; height: number; format: string; bytes: number | null;
  gpu_bytes: number; count: number; assets: number;
  uses: { asset_id: string; asset: string; version_id: string; level: string }[];
}
export interface SceneTotals {
  target: TargetKey; triangles: number; download_bytes: number; gpu_bytes: number; streamed: number; estimated: number;
  bands: Bands; ok: boolean; over: string[];
}
export interface AssetListAnswer {
  ok?: boolean; error?: string;
  targets: Record<TargetKey, { label: string; label_it: string; profile: string; uses: string[]; bands: Bands }>;
  tools: Tool[]; assets: AssetRow[]; textures: StudyTexture[]; totals: Record<TargetKey, SceneTotals>;
  counts: { assets: number; rms: number; containers: number; versions: number; textures: number; shared_textures: number;
            measured: number; estimated: number; in_cloud?: number; by_target: Record<TargetKey, Record<TargetState, number>> };
  say_it: string; resolved_here?: boolean;
}

// ── what a row shows ────────────────────────────────────────────────────────

/** The version a row shows for a target: the one it loads, else the heaviest
 *  version (never a tileset), else the master. */
export function shownVersion(a: AssetRow, target: TargetKey): VersionRow | null {
  const id = a.targets[target]?.loads;
  const v = id ? a.versions.find((x) => x.id === id) : undefined;
  if (v) return v;
  const vs = a.versions.filter((x) => !x.master && !x.tileset);
  if (vs.length) return [...vs].sort((x, y) => (y.triangles ?? 0) - (x.triangles ?? 0) || x.id.localeCompare(y.id))[0];
  return a.versions.find((x) => x.master) ?? a.versions[0] ?? null;
}

/** MICRO-ARCHIVE-ASSET-3 · what a version's level says: a tileset «tileset ·
 *  in streaming» (s3Dgraphy ≥ dev85 says it; before, its «lod0») */
export function levelSay(v: Pick<VersionRow, "level_say" | "tileset" | "master"> & Partial<VersionRow>, tilesetWords = "tileset · in streaming",
                         chainWords = "LOD chain"): string {
  if (v.master) return "◆ master";
  return v.tileset ? tilesetWords : useSayOf(v, chainWords);
}

// ── MICRO-VERSIONI-PER-USO (E.D., 2 Nov 2026) · versions named by their use ──
// «lod0 / lod1» on a version made for a use misleads: a LOD is a rung of a
// chain made as such (3DSC's LOD set, «catena LOD»). A version for a use is
// named by its use and its numbers — `<asset>@<use>[-<tri>k].glb` — and one
// use may have several. Mirrors s3Dgraphy's `use_profiles` (use_tag,
// use_version_name, use_say): `scripts/check-asset-list.mjs` compares them.

/** a target → its profile */
export const PROFILE_OF: Readonly<Record<TargetKey, string>> = { mobile: "mobile_webxr", web: "webxr", desk: "desktop_realtime", arch: "archive" };
/** the profiles' destinations (s3Dgraphy's PROFILES) and E.D.'s words */
const DESTINATION: Readonly<Record<string, string>> = { desktop_realtime: "realtime", webxr: "aton-heriverse", mobile_webxr: "mobile",
  archive: "archive", preview: "preview", render_offline: "render", print_3d: "print" };
const USE_WORDS: Readonly<Record<string, string>> = { desktop_realtime: "desktop realtime", webxr: "webXR / Heriverse",
  mobile_webxr: "mobile webXR", archive: "archivio", preview: "anteprima", render_offline: "rendering offline", print_3d: "stampa 3D" };
/** the suggestions of the field «Triangoli» */
export const TRI_SUGGEST: readonly number[] = [1000, 2000, 5000, 10000];

/** `2000` → «2k», `53_412` → «53k», `1500` → «1.5k»; «» when none */
export function kilo(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  const k = n / 1000;
  if (k < 10 && Math.round(k * 10) / 10 !== Math.round(k)) return `${Math.round(k * 10) / 10}k`;
  return `${Math.max(1, Math.round(k))}k`;
}
/** s3Dgraphy's `use_tag`: `mobile-webxr-2k` (`-2` for «Nuova accanto») */
export function useTag(profile: string, triangles?: number | null, n?: number | null): string {
  const k = kilo(triangles);
  return `${profile.replace(/_/g, "-")}${k ? `-${k}` : ""}${n && n > 1 ? `-${n}` : ""}`;
}
/** s3Dgraphy's `parse_use_tag`: `mobile-webxr-2k` → `{profile, triangles, n}`, null for `lod1` */
export function parseUseTag(tag: string): { profile: string; triangles: number | null; n: number } | null {
  const m = /^([a-z0-9-]+?)(?:-(\d+(?:\.\d+)?)k)?(?:-(\d{1,3}))?$/.exec(String(tag ?? "").trim().toLowerCase());
  if (!m) return null;
  const id = m[1].replace(/-/g, "_");
  if (!(id in DESTINATION)) return null;
  return { profile: id, triangles: m[2] ? Math.round(Number(m[2]) * 1000) : null, n: m[3] ? Number(m[3]) : 1 };
}
/** s3Dgraphy's `use_version_name`: `<asset>@<use>[-<tri>k][-n].glb` */
export function useFileName(model: string, profile: string, triangles?: number | null, packaging = "glb", n?: number | null): string {
  const safe = model.replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "") || "model";
  const ext = ({ gltf_separate: "gltf", stl: "stl" } as Record<string, string>)[packaging] ?? "glb";
  return `${safe}@${useTag(profile, triangles, n)}.${ext}`;
}
/** what the field «Triangoli» says, as a number: «2k» → 2000, «2,5k» →
 *  2500, «10.000» → 10000, «» → null; NaN for what is not a number */
export function parseTriangles(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = /^(\d+(?:[.,]\d+)?)k$/.exec(s);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 1000);
  const plain = s.replace(/[.,](?=\d{3}(\D|$))/g, "");
  return /^\d+$/.test(plain) ? Number(plain) : NaN;
}
/** the profile of a version: its own (s3Dgraphy ≥ this MICRO), else what its
 *  level's name or its file's name says (`…@lod1-mobile.glb` → mobile webXR),
 *  else what «lod1 · mobile webXR» said; «» for a rung of a LOD chain */
export function profileOfVersion(v: Partial<Pick<VersionRow, "profile" | "level" | "url" | "level_say" | "master">>): string {
  if (v.master) return "";
  if (v.profile) return v.profile;
  const tag = /^([a-z0-9-]+?)(?:-\d+(?:\.\d+)?k)?(?:-\d{1,3})?$/.exec(String(v.level ?? ""));
  const bySlug = (slug: string): string => { const id = slug.replace(/-/g, "_"); return id in DESTINATION ? id : ""; };
  if (tag && bySlug(tag[1])) return bySlug(tag[1]);
  const name = String(v.url ?? "").split(/[\\/]/).filter(Boolean).find((x) => x.includes("@")) ?? "";
  const at = name.split("@").pop() ?? "";
  const u = /^([a-z0-9-]+?)(?:-\d+(?:\.\d+)?k)?(?:-\d{1,3})?(?:\.(glb|gltf|stl))?$/.exec(at);
  if (u && bySlug(u[1])) return bySlug(u[1]);
  const old = /^(?:lod\d+|manual-[\d-]+?)-(.+?)(?:-[0-9a-f]{8})?(?:\.(glb|gltf|stl))?$/.exec(at);
  if (old) {
    const dest = Object.entries(DESTINATION).sort((x, y) => y[1].length - x[1].length)
      .find(([, d]) => old[1] === d || old[1].startsWith(`${d}-`) || old[1].endsWith(`-${d}`));
    if (dest) return dest[0];
  }
  const said = /^lod\d+ · (.+)$/.exec(String(v.level_say ?? ""));
  if (said) {
    const hit = Object.entries(USE_WORDS).find(([, w]) => w === said[1] || w.startsWith(said[1]));
    if (hit) return hit[0];
    if (said[1] === "webXR") return "webxr";
  }
  return "";
}
/** what a version's row says — «mobile webXR · 10k tri · 512 px» for a
 *  version made for a use, «catena LOD 2» for a rung of a chain; s3Dgraphy's
 *  own words when it already said them by use (≥ this MICRO) */
export function useSayOf(v: Partial<VersionRow>, chainWords = "LOD chain"): string {
  const pid = profileOfVersion(v);
  if (pid) {
    const tri = v.triangles ?? (v.use_params?.triangles as number | undefined) ?? null;
    const side = v.texture_side ?? (v.use_params?.texture_side_px as number | undefined) ?? null;
    const triSay = tri && tri > 0 ? (tri < 1000 ? String(tri) : kilo(tri)) : "";
    return `${USE_WORDS[pid] ?? pid}${triSay ? ` · ${triSay} tri` : ""}${side ? ` · ${side} px` : ""}`;
  }
  const lvl = /^lod(\d+)$/.exec(String(v.level || v.lod_level || ""));
  if (lvl) return `${chainWords} ${lvl[1]}`;
  return String(v.level_say ?? v.level ?? "");
}

/** What of a version is over a target's band (per object): triangles, texture. */
export function overBand(v: Pick<VersionRow, "triangles" | "texture_side"> | null, b: Bands | undefined): { tri: boolean; tex: boolean } {
  if (!v || !b) return { tri: false, tex: false };
  return { tri: !!b.object_triangles && v.triangles != null && v.triangles > b.object_triangles,
           tex: !!b.object_texture_side && !!v.texture_side && v.texture_side > b.object_texture_side };
}

/** The latest stamp of an asset's versions: when, who, and whether a file was
 *  modified after its stamp. */
export function lastStamp(a: AssetRow): { at: string; say: string; modified: boolean } {
  let at = "", say = "";
  for (const v of a.versions) if (v.made?.at && v.made.at > at) { at = v.made.at; say = v.made_say; }
  return { at, say: say || (a.versions[0]?.made_say ?? ""), modified: a.audit.modified_after_stamp.length > 0 };
}

export type SortKey = "name" | "level" | "tri" | "mb" | "gpu" | "texMax" | "ntex" | "stamp" | "state";
export const SORT_KEYS: readonly SortKey[] = ["name", "level", "tri", "mb", "gpu", "texMax", "ntex", "stamp", "state"];
const STATE_ORDER: Record<TargetState, number> = { missing: 0, todo: 1, ok: 2, na: 3 };

/** The value a column sorts by. */
export function sortValue(a: AssetRow, k: SortKey, target: TargetKey): string | number {
  const v = shownVersion(a, target);
  switch (k) {
    case "name": return a.name.toLowerCase();
    case "level": return v?.level_say ?? "";
    case "tri": return v?.triangles ?? -1;
    case "mb": return v?.size_bytes ?? -1;
    case "gpu": return v?.gpu_bytes ?? -1;
    case "texMax": return v?.texture_side ?? -1;
    case "ntex": return v?.textures.length || v?.texture_count || 0;
    case "stamp": return lastStamp(a).at;
    case "state": return STATE_ORDER[a.targets[target]?.state ?? "na"];
  }
}

export function sortAssets(list: readonly AssetRow[], k: SortKey, desc: boolean, target: TargetKey): AssetRow[] {
  return [...list].sort((x, y) => {
    const a = sortValue(x, k, target), b = sortValue(y, k, target);
    const c = a < b ? -1 : a > b ? 1 : x.name.localeCompare(y.name);
    return desc ? -c : c;
  });
}

// ── search and filter ───────────────────────────────────────────────────────

export type Filter = "all" | "todo" | "over";
export const FILTERS: readonly Filter[] = ["all", "todo", "over"];

/** The rows shown: the search (name, family, container, epoch), then «da
 *  fare» (some target on not ok) or «fuori banda» (the version a target on
 *  loads is over its band). */
export function visibleAssets(list: readonly AssetRow[], o: { query: string; filter: Filter; targets: readonly TargetKey[];
                                                               bands: Partial<Record<TargetKey, Bands>> }): AssetRow[] {
  const q = o.query.trim().toLowerCase();
  return list.filter((a) => {
    if (q && ![a.name, a.family, ...a.containers.map((c) => c.name), ...a.epochs].some((s) => s.toLowerCase().includes(q))) return false;
    if (o.filter === "todo") return o.targets.some((t) => ["todo", "missing"].includes(a.targets[t]?.state));
    if (o.filter === "over") return o.targets.some((t) => { const ob = overBand(shownVersion(a, t), o.bands[t]); return ob.tri || ob.tex; });
    return true;
  });
}

// ── the groups (switched on the fly) ────────────────────────────────────────

export type Grouping = "container" | "branch" | "epoch" | "family" | "status" | "none";
export const GROUPINGS: readonly Grouping[] = ["container", "branch", "epoch", "family", "status", "none"];

/** The group of an asset: its first container, its branch (SB/RB), its first
 *  epoch, its family of name, its state for the target; "" when it has none. */
export function groupKey(a: AssetRow, g: Grouping, target: TargetKey): string {
  switch (g) {
    case "container": return a.containers[0]?.name ?? "";
    case "branch": return a.branch;
    case "epoch": return a.epochs[0] ?? "";
    case "family": return a.family;
    case "status": return a.targets[target]?.state ?? "na";
    case "none": return "";
  }
}

export interface Group { key: string; assets: AssetRow[]; triangles: number; gpu_bytes: number; todo: number }

/** The groups, in the order of their key (the states from what blocks), the
 *  rows inside in the order given. */
export function groupAssets(list: readonly AssetRow[], g: Grouping, target: TargetKey): Group[] {
  const by = new Map<string, AssetRow[]>();
  for (const a of list) {
    const k = groupKey(a, g, target);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(a);
  }
  const keys = [...by.keys()].sort((x, y) => g === "status"
    ? STATE_ORDER[x as TargetState] - STATE_ORDER[y as TargetState]
    : (x === "" ? 1 : 0) - (y === "" ? 1 : 0) || x.localeCompare(y));
  return keys.map((key) => {
    const assets = by.get(key)!;
    let triangles = 0, gpu = 0, todo = 0;
    for (const a of assets) {
      // MICRO-ARCHIVE-ASSET-3 · a mesh its container's tileset covers is not
      // loaded for this target: out of its group's sums
      if (a.targets[target]?.covered_by) continue;
      const v = shownVersion(a, target);
      triangles += v?.triangles ?? 0;
      gpu += v?.gpu_bytes ?? 0;
      if (["todo", "missing"].includes(a.targets[target]?.state)) todo++;
    }
    return { key, assets, triangles, gpu_bytes: gpu, todo };
  });
}

/** The checkbox of a group: every row of it in or out of the selection; the
 *  state of the box (all, some, none). */
export function toggleGroup(sel: Set<string>, grp: Group, on: boolean): Set<string> {
  for (const a of grp.assets) { if (on) sel.add(a.id); else sel.delete(a.id); }
  return sel;
}
export function groupChecked(sel: ReadonlySet<string>, grp: Group): "all" | "some" | "none" {
  const n = grp.assets.filter((a) => sel.has(a.id)).length;
  return n === 0 ? "none" : n === grp.assets.length ? "all" : "some";
}

// ── the plan: the proposals, editable on the row and in bulk ────────────────

export type Plan = Map<string, Partial<Record<TargetKey, Proposal>>>;

/** The proposal of a row for a target: the person's, else s3Dgraphy's. */
export function proposalOf(a: AssetRow, target: TargetKey, plan: Plan): Proposal & { edited: boolean } {
  const p = plan.get(a.id)?.[target];
  return p ? { ...p, edited: true } : { ...a.targets[target].proposal, edited: false };
}

/** A field of a row's proposal changed by hand. */
export function editProposal(plan: Plan, a: AssetRow, target: TargetKey, field: "tool" | "triangles" | "texture" | "ktx2",
                             value: string | number | boolean | null): Plan {
  const cur = { ...proposalOf(a, target, plan) } as Proposal & { edited?: boolean };
  delete cur.edited;
  if (field === "tool") cur.tool = String(value) as Tool;
  else if (field === "ktx2") cur.ktx2 = !!value;
  else cur[field] = value === "" || value === null ? null : Number(value);
  const row = { ...(plan.get(a.id) ?? {}) };
  row[target] = cur;
  plan.set(a.id, row);
  return plan;
}

/** «Applica la proposta» on the selected rows, for the targets on: s3Dgraphy's
 *  proposal where the target is not ok (the person's edits are kept). */
export function applyProposal(plan: Plan, assets: readonly AssetRow[], sel: ReadonlySet<string>, targets: readonly TargetKey[],
                              o: { shapes?: readonly Shape[]; bands?: Partial<Record<TargetKey, Bands>> } = {}): number {
  let n = 0;
  // MICRO-ARCHIVE-ASSET-3 · a form repeated touched by the selection (all of
  // it, the group, one copy): ITS proposal, once; its copies have none
  const cov = shapeCover(o.shapes ?? [], targets, plan, o.bands ?? {});
  for (const s of o.shapes ?? []) {
    if (!s.assets.some((a) => sel.has(a.id))) continue;
    for (const t of targets) {
      if (!cov.get(t)?.has(s.assets[0].id) || shapeProposalOf(s, t, o.bands?.[t], plan).tool !== "instance") continue;
      const key = `shape:${s.key}`;
      const row = { ...(plan.get(key) ?? {}) };
      if (!row[t]) {
        const p = { ...shapeProposalOf(s, t, o.bands?.[t], plan) } as Proposal & { edited?: boolean };
        delete p.edited;
        row[t] = p; n++;
      }
      plan.set(key, row);
    }
  }
  for (const a of assets) {
    if (!sel.has(a.id)) continue;
    for (const t of targets) {
      if (cov.get(t)?.has(a.id)) { const r = plan.get(a.id); if (r?.[t]) { delete r[t]; } continue; }
      const c = a.targets[t];
      if (!c || c.state === "ok" || c.state === "na" || c.proposal.tool === "keep") continue;
      const row = { ...(plan.get(a.id) ?? {}) };
      if (!row[t]) { row[t] = { ...c.proposal }; n++; }
      plan.set(a.id, row);
    }
  }
  return n;
}

/** «Imposta» on the selected rows: triangles, texture, KTX2, tool by hand,
 *  for the targets on (not the archive: it has no version to make). */
export function setInBulk(plan: Plan, assets: readonly AssetRow[], sel: ReadonlySet<string>, targets: readonly TargetKey[],
                          v: { tool?: Tool | ""; triangles?: number | null; texture?: number | null; ktx2?: boolean },
                          o: { shapes?: readonly Shape[]; bands?: Partial<Record<TargetKey, Bands>> } = {}): number {
  let n = 0;
  // MICRO-ARCHIVE-ASSET-3 · the copies of a form repeated take the values on
  // their form (one mesh + N instances), not each its own — unless the tool
  // set is not «istanze»: then the form goes one by one
  const cov = shapeCover(o.shapes ?? [], targets, plan, o.bands ?? {});
  for (const s of o.shapes ?? []) {
    if (!s.assets.some((a) => sel.has(a.id))) continue;
    for (const t of targets) {
      if (t === "arch" || !cov.get(t)?.has(s.assets[0].id) || shapeProposalOf(s, t, o.bands?.[t], plan).tool !== "instance") continue;
      const key = `shape:${s.key}`;
      const p = { ...shapeProposalOf(s, t, o.bands?.[t], plan) } as Proposal & { edited?: boolean };
      delete p.edited;
      if (v.tool && v.tool !== "instance") { p.tool = "keep"; p.why = "una per una"; }
      if (v.triangles) p.triangles = v.triangles;
      if (v.texture) p.texture = v.texture;
      if (v.ktx2 !== undefined) p.ktx2 = v.ktx2;
      plan.set(key, { ...(plan.get(key) ?? {}), [t]: p });
      if (p.tool === "instance") { n++; for (const a of s.assets) cov.get(t)!.add(a.id); }
      else for (const a of s.assets) cov.get(t)!.delete(a.id);
    }
  }
  for (const a of assets) {
    if (!sel.has(a.id)) continue;
    for (const t of targets) {
      if (t === "arch") continue;
      if (cov.get(t)?.has(a.id)) continue;
      const p = { ...proposalOf(a, t, plan) } as Proposal & { edited?: boolean };
      delete p.edited;
      if (v.tool) p.tool = v.tool;
      if (v.triangles) p.triangles = v.triangles;
      if (v.texture) p.texture = v.texture;
      if (v.ktx2 !== undefined) p.ktx2 = v.ktx2;
      if (p.tool === "keep" && (v.triangles || v.texture)) p.tool = (v.triangles ? "decimate_bake" : "ktx2");
      const row = { ...(plan.get(a.id) ?? {}) };
      row[t] = p;
      plan.set(a.id, row);
      n++;
    }
  }
  return n;
}

// ── the one queue (Run / Pausa), shared with Ottimizza ──────────────────────

export type QueueState = "waiting" | "running" | "done" | "failed" | "cancelled";
export interface QueueItem {
  id: string; label: string; state: QueueState; note: string;
  /** an item of the list: its asset, target and parameters; Ottimizza's own
   *  actions carry only their label (their call is the page's) */
  asset_id?: string; asset?: string; target?: TargetKey; tool?: Tool; triangles?: number | null; texture?: number | null;
  ktx2?: boolean; from?: "list" | "optimize"; job?: string;
  /** MICRO-CODA-MULTICORE · why it waits (the bridge's scheduler, or its turn
   *  in the page): a code of `WAIT_CODES` and who it waits for */
  wait?: { code: WaitCode; other?: string } | null;
  /** MICRO-ARCHIVE-ASSET-2 · a form repeated: ONE item for its N assets (one
   *  mesh reduced + N instances), the key of the shape and its members */
  shape?: string; asset_ids?: string[];
  /** MICRO-ARCHIVE-ASSET-2 · why it cannot start (and stays, waiting, with
   *  its gesture): an add-on missing, the source not stamped, Blender off… */
  block?: Block | null;
  /** MICRO-ARCHIVE-ASSET-3 · where it starts from (`kind:path#block`): the
   *  queue never holds two live items of the same source, target and tool */
  source?: string;
  /** MICRO-CODA-VISTA · when it started and ended (ms), what it made (the
   *  file, the level), the phase it is in, and — cancelled — by whom */
  started?: number; ended?: number; made?: string; phase?: string; progress?: number;
  cancel?: { by: CancelBy; other?: string } | null;
  /** MICRO-CODA-VISTA-2 · the file was already in versions/ (the bridge
   *  refused to write over it, or gltfpack left it): «già fatto prima», with
   *  the file and whether the graph already has it as a version — never a
   *  failure. `replace`: «Sostituisci» asked (confirmed) for the next run */
  before?: { path: string; name: string; registered: boolean } | null;
  replace?: boolean;
  /** MICRO-CODA-VISTA-2 · a form without one geometry: split, each copy its
   *  own item (how many were made) — never «cancelled» */
  split?: number;
  /** MICRO-GIA-FATTI · what was decided ONCE for a file already in versions/
   *  (the dialog of «Applica e metti in coda», or a gesture in bulk): «use» —
   *  when the run meets the file it is registered as it is and the item is
   *  done; «replace» — made again over it (`replace` from the start). None:
   *  «già fatto prima» waits for its row's gesture. */
  decide?: "use" | "replace" | null;
  /** MICRO-GIA-FATTI · the file was written while the race of 1 Nov could
   *  touch it (`raceExposed`): said beside it, «Sostituisci» by default */
  exposed?: boolean;
  /** MICRO-VERSIONI-PER-USO · «Stringi…»: a new version for the same use
   *  with fewer triangles / a smaller texture (on a row already covered, or
   *  a form repeated); `n` > 1: «Nuova accanto» — the name with `-n` */
  shrink?: boolean; n?: number;
  /** MICRO-VERSIONI-PER-USO · the second round for the scene: proposed to
   *  make the target's scene fit its band */
  round2?: boolean;
}
/** MICRO-CODA-VISTA p.4 · who cancelled an item: the person (from the queue,
 *  the status bar's chip, Ottimizza's bar), the bridge restarted (its job
 *  lost), another window or program, the page itself (a form the diagnosis
 *  did not find one geometry for: back to its copies) */
export type CancelBy = "user" | "chip" | "panel" | "bridge" | "other" | "split";
export type BlockCode = "addon" | "unstamped" | "blender" | "no_source" | "no_blend" | "no_mesh" | "no_master" | "checking" | "cloud" | "author";
/** `cloud` (MICRO-TESTATA-CLOUD): the source is in the cloud, «da scaricare»
 *  — `paths` and `bytes` are what «Scarica e misura» would download */
export interface Block { code: BlockCode; addon?: string; path?: string; paths?: string[]; bytes?: number;
  /** MICRO-CODA-VISTA p.4 · «unstamped»: the stamp the Stamp column shows is
   *  of ANOTHER version (the master's, or another level's) — when and which */
  stamp_of?: { at: string; level: string; master: boolean } | null }
export type QueueMode = "run" | "pause";
/** «quanto della macchina usare»: all of it, half, one job at a time */
export type QueueShare = "all" | "half" | "one";
export const QUEUE_SHARES: readonly QueueShare[] = ["all", "half", "one"];
export const WAIT_CODES = ["file", "alone", "one", "tool", "turn", "memory", "cores", "page"] as const;
export type WaitCode = typeof WAIT_CODES[number];
/** What the page may send now: `slots` items in flight at most, `held` the
 *  ones sent that wait at the bridge (or are still starting) — while one
 *  waits there, the next stays here, so ↑ ↓ keep their meaning. */
export interface QueueRoom { slots: number; held: number }

let seq = 0;
export function queueId(): string { return `q${Date.now().toString(36)}${(seq++).toString(36)}`; }

/** The items «Metti in coda» adds: one per selected row and target on whose
 *  plan (or proposal, when not ok) is a tool that makes something; one
 *  already waiting for the same asset and target is replaced, not doubled. */
export function itemsFor(assets: readonly AssetRow[], sel: ReadonlySet<string>, targets: readonly TargetKey[], plan: Plan,
                         labelOf: (a: AssetRow, t: TargetKey, p: Proposal) => string = (a, t, p) => `${a.name} → ${t} · ${p.tool}`): QueueItem[] {
  const out: QueueItem[] = [];
  for (const a of assets) {
    if (!sel.has(a.id)) continue;
    for (const t of targets) {
      const edited = plan.get(a.id)?.[t];
      const c = a.targets[t];
      if (!edited && (!c || c.state === "ok" || c.state === "na")) continue;
      const p = edited ?? c.proposal;
      if (p.tool === "keep") continue;
      out.push({ id: queueId(), label: labelOf(a, t, p), state: "waiting", note: p.why ?? "", asset_id: a.id, asset: a.name,
                 target: t, tool: p.tool, triangles: p.triangles, texture: p.texture, ktx2: p.ktx2, from: "list" });
    }
  }
  return out;
}

export function enqueue(q: QueueItem[], items: readonly QueueItem[]): QueueItem[] {
  for (const it of items) {
    // MICRO-ARCHIVE-ASSET-3 · the safety net: a form and its copies never add
    // up, nor two items of the same source, target and tool — one already
    // running (or a form waiting that holds this copy) keeps it out
    const live = q.filter((x) => (x.state === "waiting" || x.state === "running") && x.target === it.target);
    const holds = (x: QueueItem): boolean =>
      (!!it.shape && x.shape === it.shape)
      || (!it.shape && !!x.shape && !!it.asset_id && (x.asset_ids ?? []).includes(it.asset_id))
      || (!it.shape && !x.shape && !!it.asset_id && x.asset_id === it.asset_id)
      || (!!it.source && x.source === it.source && x.tool === it.tool);
    if (live.some((x) => x.state === "running" && holds(x))) continue;
    if (!it.shape && live.some((x) => x.state === "waiting" && !!x.shape && holds(x))) continue;
    const twin = !it.shape && it.source ? q.findIndex((x) => x.state === "waiting" && x.target === it.target && !x.shape
      && x.source === it.source && x.tool === it.tool && x.asset_id !== it.asset_id) : -1;
    if (twin >= 0) { q[twin] = it; continue; }
    // a form repeated stands for its members: their waiting items for the
    // same target go, and the same shape again is replaced
    const mine = new Set(it.asset_ids ?? (it.asset_id ? [it.asset_id] : []));
    const same = (x: QueueItem): boolean => x.state === "waiting" && x.target === it.target
      && ((!!it.shape && x.shape === it.shape) || (!!x.asset_id && mine.has(x.asset_id) && (!!it.shape || !x.shape)));
    const i = mine.size ? q.findIndex(same) : -1;
    if (i >= 0) {
      q[i] = it;
      for (let j = q.length - 1; j > i; j--) if (same(q[j])) q.splice(j, 1);
    } else q.push(it);
  }
  return q;
}

/** The item to start now (MICRO-CODA-MULTICORE): in Run, the first waiting
 *  one while fewer than `room.slots` run and none of those sent waits at the
 *  bridge — the bridge's scheduler decides cores, memory, instances and
 *  files; one slot is the old «one at a time». In Pausa, none (they pile up
 *  and start when Run is back). */
export function nextToRun(q: readonly QueueItem[], mode: QueueMode, room: QueueRoom = { slots: 1, held: 0 }): QueueItem | null {
  if (mode !== "run") return null;
  if (q.filter((x) => x.state === "running").length >= Math.max(1, room.slots) || room.held > 0) return null;
  // MICRO-ARCHIVE-ASSET-2 · a blocked one stays, saying why; the next goes
  return q.find((x) => x.state === "waiting" && !x.block) ?? null;
}

/** How many items the page keeps in flight: one for «un lavoro alla volta»,
 *  else the cores the bridge's scheduler may use (each item takes at least
 *  one), 4 while the bridge has not said it. */
export function queueSlots(share: QueueShare, cores?: number | null): number {
  if (share === "one") return 1;
  return Math.max(1, Math.floor(cores ?? 4));
}

/** The reason an item waits, from its job at the bridge (`wait` of the job
 *  view, or of a tileset batch's file) — or its turn in the page. */
export function waitOf(it: QueueItem, jobs: readonly { state: string; wait?: { code: string; other?: string } | null;
  items?: readonly { state: string; wait?: { code: string; other?: string } | null }[] }[], held: boolean): QueueItem["wait"] {
  if (it.state === "waiting") return held ? { code: "page" } : null;
  if (it.state !== "running") return null;
  const known = (w?: { code: string; other?: string } | null): QueueItem["wait"] =>
    w && (WAIT_CODES as readonly string[]).includes(w.code) ? { code: w.code as WaitCode, ...(w.other ? { other: w.other } : {}) } : null;
  for (const j of jobs) {
    if (j.state === "queued" && known(j.wait)) return known(j.wait);
    if (j.state === "running" && j.items?.length && !j.items.some((r) => r.state === "running")) {
      const w = j.items.map((r) => r.state === "queued" ? known(r.wait) : null).find(Boolean);
      if (w) return w;
    }
  }
  return null;
}

/** «togli»: a waiting item leaves the queue (a running one is cancelled by
 *  its job, not here). */
export function removeItem(q: QueueItem[], id: string): QueueItem[] {
  const i = q.findIndex((x) => x.id === id);
  if (i >= 0 && q[i].state !== "running") q.splice(i, 1);
  return q;
}

/** ↑ / ↓: a waiting item moves among the waiting ones. */
export function moveItem(q: QueueItem[], id: string, delta: -1 | 1): QueueItem[] {
  const i = q.findIndex((x) => x.id === id);
  if (i < 0 || q[i].state !== "waiting") return q;
  let j = i + delta;
  while (j >= 0 && j < q.length && q[j].state !== "waiting") j += delta;
  if (j < 0 || j >= q.length) return q;
  [q[i], q[j]] = [q[j], q[i]];
  return q;
}

/** What is left after a clean-up: the ended items go, the rest stays. */
export function clearEnded(q: QueueItem[]): QueueItem[] {
  return q.filter((x) => x.state === "waiting" || x.state === "running");
}

// ── MICRO-CODA-VISTA · ONE vocabulary of states and signs ───────────────────
// The row's cell, the queue's view and the detail say the same thing with the
// same sign: never ✖ here and ! there for a failure, ✔ and «ok» for a done.

export type ItemTone = "wait" | "block" | "run" | "ok" | "fail" | "off" | "before" | "split";
/** the sign of each tone (the words are the page's) — MICRO-CODA-VISTA-2:
 *  «già fatto prima» (≡) and «diviso» (⑂) are not failures nor cancels */
export const SIGNS: Readonly<Record<ItemTone, string>> = { wait: "⧗", block: "⚠", run: "⟳", ok: "✓", fail: "!", off: "–", before: "≡", split: "⑂" };

/** The tone of an item: waiting (or blocked, saying why — «checking» is not a
 *  block), running, done, failed, cancelled. */
export function itemTone(it: Pick<QueueItem, "state" | "block"> & Partial<Pick<QueueItem, "before" | "cancel">>): ItemTone {
  if (it.state === "waiting") return it.block && it.block.code !== "checking" ? "block" : "wait";
  if (it.state === "failed" && it.before) return "before";
  if (it.state === "cancelled" && it.cancel?.by === "split") return "split";
  return ({ running: "run", done: "ok", failed: "fail", cancelled: "off" } as const)[it.state];
}

/** The filters of the view «Coda»: in corso, in attesa (blocked too), falliti
 *  (cancelled too: nothing made), fatti — MICRO-CODA-VISTA-2: «già fatto
 *  prima» (the file is there) and «diviso» (its copies queued) are «fatti»,
 *  never «falliti». */
export type QueueFilter = "all" | "running" | "waiting" | "failed" | "done" | "before";
/** MICRO-GIA-FATTI · «già fatto prima» also a filter of its own (they stay
 *  counted among «fatti»): its rows resolved together */
export const QUEUE_FILTERS: readonly QueueFilter[] = ["all", "running", "waiting", "failed", "done", "before"];
export function queueFilter(q: readonly QueueItem[], f: QueueFilter): QueueItem[] {
  if (f === "all") return [...q];
  const want = { running: ["run"], waiting: ["wait", "block"], failed: ["fail", "off"], done: ["ok", "before", "split"], before: ["before"] }[f];
  return q.filter((x) => want.includes(itemTone(x)));
}
export function queueCounts(q: readonly QueueItem[]): Record<QueueFilter, number> {
  const out = { all: q.length, running: 0, waiting: 0, failed: 0, done: 0, before: 0 } as Record<QueueFilter, number>;
  for (const f of QUEUE_FILTERS) if (f !== "all") out[f] = queueFilter(q, f).length;
  return out;
}

/** The item a row's cell shows for a target: the live one (running first,
 *  then waiting), else the last one ended — its outcome stays on the row
 *  until the queue is cleaned. A form's item shows on each of its copies. */
export function cellItem(q: readonly QueueItem[], assetId: string, target: TargetKey): QueueItem | null {
  const mine = q.filter((x) => x.target === target && (x.asset_id === assetId || (x.asset_ids ?? []).includes(assetId)));
  return mine.find((x) => x.state === "running") ?? mine.find((x) => x.state === "waiting")
    ?? [...mine].sort((x, y) => (y.ended ?? 0) - (x.ended ?? 0))[0] ?? null;
}

/** How long it took (or has been running): «12 s», «3 min 05 s». */
export function itemTime(it: Pick<QueueItem, "started" | "ended">, now = Date.now()): string {
  if (it.started == null) return "";
  const s = Math.max(0, Math.round(((it.ended ?? now) - it.started) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/** The gesture that solves an item, by its state: blocked → the block's own
 *  (Timbra, Installa, Blender, Scarica, Chi firma), failed or cancelled →
 *  Riprova, waiting → Togli, running → Annulla; done → none. */
export type ItemGesture = "fix" | "retry" | "remove" | "cancel" | "before" | null;
export function itemGesture(it: Pick<QueueItem, "state" | "block"> & Partial<Pick<QueueItem, "before" | "cancel">>): ItemGesture {
  if (it.state === "waiting") return it.block && it.block.code !== "checking" ? "fix" : "remove";
  if (it.state === "running") return "cancel";
  // MICRO-CODA-VISTA-2 · «Sostituisci» / «Usa quello che c'è»; a split ended
  if (it.state === "failed" && it.before) return "before";
  if (it.state === "cancelled" && it.cancel?.by === "split") return null;
  if (it.state === "failed" || it.state === "cancelled") return "retry";
  return null;
}

/** «Riprova»: a failed or cancelled item back in the queue, waiting, its
 *  outcome forgotten (the same parameters, the same place). */
export function retryItem(q: QueueItem[], id: string): QueueItem[] {
  const it = q.find((x) => x.id === id);
  if (!it || (it.state !== "failed" && it.state !== "cancelled")) return q;
  it.state = "waiting";
  it.note = "";
  it.cancel = null;
  it.block = null;
  it.started = undefined; it.ended = undefined; it.made = undefined; it.phase = undefined; it.progress = undefined;
  it.before = null; it.split = undefined;
  return q;
}

// ── MICRO-GIA-FATTI · «già fatto prima» decided once, and in bulk ───────────
// E.D. (1 Nov 20:38, lab.30): «seleziona tutto» → «Applica e metti in coda»;
// the 25 KTX2 made, but the forms repeated, the 10 RB meshes, Tetto1 and the
// two Column_entrance ended «≡ già fatto prima» (files of an earlier round in
// versions/, not registered) and stayed: «27 / 98 coperti», a click per row.
// Now the question is asked ONCE, when the gesture finds them, with the count.

/** A file already in versions/ that an item would write. */
export interface Found { id: string; path: string; name: string; registered: boolean; exposed: boolean; asset?: string; mtime?: number }
/** The answer of the one question: all used as they are, all made again, as
 *  marked (the exposed ones made again, the others used), or row by row. */
export type BeforeHow = "use" | "replace" | "marked" | "rows";

/** What each item will do with its file: «use», «replace», or null (its row
 *  decides). Items not foreseen (`others`, their file met only at the run:
 *  nobody saw them in the list) follow only «use them all» — registering a
 *  file as it is takes nothing away; a file nobody saw is never written over
 *  without its row's gesture. */
export function beforeDecisions(found: readonly Pick<Found, "id" | "exposed">[], how: BeforeHow,
                                others: readonly string[] = []): Map<string, "use" | "replace" | null> {
  const out = new Map<string, "use" | "replace" | null>();
  for (const f of found)
    out.set(f.id, how === "rows" ? null : how === "marked" ? (f.exposed ? "replace" : "use") : how);
  for (const id of others) if (!out.has(id)) out.set(id, how === "use" ? "use" : null);
  return out;
}

/** The default of each file: «Sostituisci» for one the race may have touched,
 *  «Usa» for the others — and the answer that matches it. */
export function beforeDefault(found: readonly Pick<Found, "exposed">[]): { use: number; replace: number; how: BeforeHow } {
  const replace = found.filter((f) => f.exposed).length;
  const use = found.length - replace;
  return { use, replace, how: replace && use ? "marked" : replace ? "replace" : "use" };
}

/** MICRO-GIA-FATTI · the race of 1 Nov (MICRO-CODA-VISTA's reconstruction):
 *  «Prepara per un uso» kept its context by .blend; with the queue in
 *  parallel the items of the SAME .blend in flight together took each other's
 *  master — the files of `GreatTemple_2026_v2.blend` ended between 15:04 and
 *  15:10 UTC (Column_shadow.035 ×10 … Porta2, Tempio_4, Tetto1). Fixed at
 *  16:05 UTC (prepareKey by .blend AND object). The bridge keeps no job
 *  history and a stamp says only the end: which jobs overlapped cannot be
 *  read from the files, so the race is declared here as it was found. */
export const RACES: readonly { blend: string; from: number; to: number }[] = [
  { blend: "GreatTemple_2026_v2.blend", from: Date.parse("2026-11-01T15:04:00Z"), to: Date.parse("2026-11-01T15:10:00Z") },
];
/** A file «Prepara per un uso» made from `blend`, written at `mtime` (s):
 *  inside a race → exposed (its content may be right, its registration was
 *  not to be trusted: E.D. wants it made again by default). gltfpack's
 *  variants never were. */
export function raceExposed(f: { blend?: string; mtime?: number | null }, races = RACES): boolean {
  if (!f.blend || f.mtime == null) return false;
  const name = f.blend.split(/[\\/]/).pop() ?? "";
  const ms = f.mtime * 1000;
  return races.some((r) => r.blend === name && ms >= r.from && ms <= r.to);
}

/** s3Dgraphy's `version_file_name` (use_profiles): `<model>@<level>-<destination>.glb`
 *  (`.gltf` for a profile packed `gltf_separate` — on disk a folder of that
 *  name without `.gltf` —, `.stl` for a print) */
export function versionFileName(model: string, level: string, destination: string, packaging = "glb"): string {
  const safe = model.replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "") || "model";
  const ext = ({ gltf_separate: "gltf", stl: "stl" } as Record<string, string>)[packaging] ?? "glb";
  return `${safe}@${level}-${destination}.${ext}`;
}
/** The names «Prepara per un uso» may give an item's file, the likelier
 *  first. MICRO-VERSIONI-PER-USO: with `profile` (a bridge ≥ 60) the use's
 *  name first (`<model>@mobile-webxr-2k.glb`, `-n` for «Nuova accanto»),
 *  then the names of before — lod1 when it decimates, else lod0. */
export function useFileNames(model: string, destination: string, it: Pick<QueueItem, "tool" | "triangles"> & Partial<Pick<QueueItem, "n">>,
                             packaging = "glb", profile = ""): string[] {
  const dec = (it.tool === "decimate_bake" || it.tool === "instance") && !!it.triangles;
  const old = (dec ? ["lod1", "lod0"] : ["lod0", "lod1"]).map((l) => versionFileName(model, l, destination, packaging));
  return profile ? [useFileName(model, profile, it.triangles, packaging, it.n), ...old] : old;
}
/** «Nuova accanto»: the first `n` (2, 3…) whose name is not among `taken` */
export function nextBeside(model: string, profile: string, triangles: number | null | undefined, taken: ReadonlySet<string>, packaging = "glb"): number {
  let n = 2;
  const strip = (x: string): string => x.replace(/\.gltf$/, "");
  const names = new Set([...taken].map(strip));
  while (n < 100 && names.has(strip(useFileName(model, profile, triangles, packaging, n)))) n++;
  return n;
}

/** The items «già fatto prima» (among `ids`, or all) */
export function beforeItems(q: readonly QueueItem[], ids?: ReadonlySet<string>): QueueItem[] {
  return q.filter((x) => itemTone(x) === "before" && (!ids || ids.has(x.id)));
}

/** MICRO-CODA-VISTA p.6 · the key of the budget's ONE computation: the answer,
 *  the queue's epoch (an item added, removed or ended — never a poll, a block
 *  or a repaint), the plan. */
export function budgetKey(answer: number, queueEpoch: number, plan: Plan): string {
  const p = [...plan.entries()].map(([k, v]) => `${k}:${JSON.stringify(v)}`).sort().join(";");
  return `${answer}|${queueEpoch}|${p}`;
}

// ── the bars: today and after the queue ─────────────────────────────────────

const GEO_BYTES_PER_TRIANGLE = 64;
const MIP = 4 / 3;

/** A version still to make, estimated from its parameters: the triangles
 *  asked (else the source's), one texture of the side asked (KTX2 1 B a
 *  pixel on the GPU and ~0,3 B on disk; else 4 B and ~0,5 B). */
export function plannedCost(p: Pick<Proposal, "triangles" | "texture" | "ktx2">, from: VersionRow | null):
  { triangles: number; download_bytes: number; gpu_bytes: number } {
  const tri = p.triangles ?? from?.triangles ?? 0;
  const side = p.texture ?? Math.min(from?.texture_side ?? 0, 2048);
  const px = side * side;
  return { triangles: tri, download_bytes: Math.round(tri * 24 + px * (p.ktx2 ? 0.3 : 0.5)),
           gpu_bytes: Math.round(px * (p.ktx2 ? 1 : 4) * MIP + tri * GEO_BYTES_PER_TRIANGLE) };
}

/** MICRO-ARCHIVE-ASSET-2 · the lightest version of an asset a viewer could
 *  fall back on when the target has none (never the master nor a tileset). */
export function lightestVersion(a: AssetRow): VersionRow | null {
  const vs = a.versions.filter((v) => !v.master && !v.tileset && v.triangles != null);
  if (!vs.length) return null;
  return [...vs].sort((x, y) => (x.triangles ?? 0) - (y.triangles ?? 0) || (x.size_bytes ?? 0) - (y.size_bytes ?? 0) || x.id.localeCompare(y.id))[0];
}

/** MICRO-ARCHIVE-ASSET-2 · how many assets have a version for the target
 *  («1 / 97 coperti»): those it does not concern (`na`) are out of the count. */
export interface Coverage { covered: number; total: number; missing: string[] }
export function coverage(assets: readonly AssetRow[], target: TargetKey): Coverage {
  let covered = 0, total = 0;
  const missing: string[] = [];
  for (const a of assets) {
    const c = a.targets[target];
    if (!c || c.state === "na") continue;
    total++;
    if (c.loads && c.state !== "missing") covered++; else missing.push(a.id);
  }
  return { covered, total, missing };
}

/** download and GPU of an instance (its transform, in the file and on the GPU) */
export const INSTANCE_BYTES = 64;

export interface SceneCount {
  triangles: number; download_bytes: number; gpu_bytes: number;
  /** assets counted by an estimate: no version for the target (the lightest
   *  existing, or their planned one), or a version still to make */
  estimated: number; covered: number; total: number;
  /** instances drawn from a mesh counted once */
  instances: number;
}

/** The scene a viewer would load for a target — TODAY (`after` false): each
 *  asset's version for it, and for the assets that have none the lightest
 *  existing version (an estimate, counted in `estimated`); AFTER the queue:
 *  the items not failed nor cancelled and the plan not yet queued count their
 *  estimate — a form repeated ONE mesh plus its instances. A file once, a
 *  shared texture once. */
export function sceneCount(assets: readonly AssetRow[], target: TargetKey,
                           o: { plan?: Plan; queue?: readonly QueueItem[]; after?: boolean; shapes?: readonly Shape[];
                                answeredAt?: number } = {}): SceneCount {
  const out: SceneCount = { triangles: 0, download_bytes: 0, gpu_bytes: 0, estimated: 0, covered: 0, total: 0, instances: 0 };
  const seen = new Set<string>(), seenTex = new Set<string>(), shapes = new Set<string>();
  // MICRO-CODA-VISTA p.6 · an item done AFTER the answer was asked still
  // counts as planned until the next answer has its version (else the count
  // drops and comes back between the end and the answer)
  const live = (o.queue ?? []).filter((x) => x.target === target && x.state !== "failed" && x.state !== "cancelled"
    && (x.state !== "done" || (o.answeredAt != null && (x.ended ?? 0) > o.answeredAt)));
  // MICRO-ARCHIVE-ASSET-3 · a form planned «istanze» (not queued yet) counts
  // as its item would: the mesh once, an instance each — its copies' own
  // plans never on top
  const planShape = new Map<string, { key: string; p: Proposal }>();
  for (const s of o.shapes ?? []) {
    const p = o.plan?.get(`shape:${s.key}`)?.[target];
    if (p?.tool === "instance") for (const a of s.assets) planShape.set(a.id, { key: s.key, p });
  }
  const add = (v: VersionRow): void => {
    if (v.tileset) return;
    if (v.checksum && seen.has(v.checksum)) return;
    if (v.checksum) seen.add(v.checksum);
    out.triangles += v.triangles ?? 0;
    out.download_bytes += v.size_bytes ?? 0;
    if (v.measured && v.textures.length) {
      out.gpu_bytes += Math.max(0, (v.gpu_bytes ?? 0) - v.textures.reduce((s, t) => s + t.gpu_bytes, 0));
      for (const t of v.textures) {
        if (t.sha256 && seenTex.has(t.sha256)) continue;
        if (t.sha256) seenTex.add(t.sha256);
        out.gpu_bytes += t.gpu_bytes;
      }
    } else out.gpu_bytes += v.gpu_bytes ?? 0;
  };
  for (const a of assets) {
    const cell = a.targets[target];
    if (!cell || cell.state === "na") continue;
    out.total++;
    const cur = cell.loads && cell.state !== "missing" ? a.versions.find((v) => v.id === cell.loads) ?? null : null;
    if (cur) out.covered++;
    if (o.after) {
      const item = [...live].reverse().find((x) => (x.asset_ids ?? []).includes(a.id))
        ?? [...live].reverse().find((x) => x.asset_id === a.id);
      const ps = item ? null : planShape.get(a.id);
      const p = item ? { triangles: item.triangles ?? null, texture: item.texture ?? null, ktx2: !!item.ktx2, tool: item.tool }
        : ps ? ps.p : o.plan?.get(a.id)?.[target];
      const shapeKey = item?.shape ?? ps?.key;
      if (p && p.tool && p.tool !== "keep" && p.tool !== "tileset") {
        out.estimated++;
        if (!cur) out.covered++;
        if (shapeKey) {
          // one mesh for the whole form, then an instance each
          out.instances++;
          out.download_bytes += INSTANCE_BYTES;
          out.gpu_bytes += INSTANCE_BYTES;
          if (shapes.has(shapeKey)) continue;
          shapes.add(shapeKey);
        }
        const c = plannedCost(p, cur ?? shownVersion(a, target));
        out.triangles += c.triangles; out.download_bytes += c.download_bytes; out.gpu_bytes += c.gpu_bytes;
        continue;
      }
    }
    if (cur) { add(cur); continue; }
    out.estimated++;
    const lv = lightestVersion(a);
    if (lv) add(lv);
  }
  return out;
}

/** The scene of a target after the queue (kept for its callers):
 *  `sceneCount` with `after`. */
export function totalsAfter(assets: readonly AssetRow[], target: TargetKey, plan: Plan, q: readonly QueueItem[]):
  { triangles: number; download_bytes: number; gpu_bytes: number } {
  return sceneCount(assets, target, { plan, queue: q, after: true });
}

/** The word of a target's card: «incompleto» while some asset has no version
 *  for it (the count is then an estimate), else inside / outside the band, or
 *  no band (the archive). */
export type BudgetWord = "incomplete" | "in" | "out" | "none";
export function budgetWord(cov: Pick<Coverage, "covered" | "total">, band: { ok: boolean }, b: Bands | undefined): BudgetWord {
  if (cov.covered < cov.total) return "incomplete";
  if (!b?.scene_triangles && !b?.scene_download_mb && !b?.scene_gpu_mb) return "none";
  return band.ok ? "in" : "out";
}

/** Inside or outside the band: each of triangles, download, GPU against the
 *  scene's limit (a target without limits is always inside). */
export function inBand(v: { triangles: number; download_bytes: number; gpu_bytes: number }, b: Bands | undefined):
  { ok: boolean; tri: boolean; dl: boolean; gpu: boolean } {
  const MB = 1048576;
  const tri = !!b?.scene_triangles && v.triangles > b.scene_triangles;
  const dl = !!b?.scene_download_mb && v.download_bytes > b.scene_download_mb * MB;
  const gpu = !!b?.scene_gpu_mb && v.gpu_bytes > b.scene_gpu_mb * MB;
  return { ok: !tri && !dl && !gpu, tri, dl, gpu };
}

// ── MICRO-ARCHIVE-ASSET-2 · the forms repeated ────────────────────────────
// Column_tempio1–6, Column_shadow1–38…: the same geometry and the same
// textures, placed elsewhere. ONE mesh (reduced) and N instances (only their
// transforms) — downloaded and on the GPU once.

export interface Shape {
  key: string; assets: AssetRow[];
  /** the triangles of one copy (the heaviest version measured), its textures */
  triangles: number | null; textures: string[];
  /** how it was recognised: the geometry keys of the files (indices and UVs,
   *  or the compressed bytes) — MICRO-CODA-VISTA p.1: never the triangles */
  via: "geometry";
}

const texSet = (v: VersionRow): string => v.textures.map((t) => t.sha256).filter(Boolean).sort().join("+");

/** The shape of an asset: the geometry keys of its heaviest version measured
 *  (an uncompressed geometry first — two encodings of the same mesh differ in
 *  their Draco bytes — else the compressed bytes: the key then carries the
 *  compression, so a Draco file never meets a plain one), with its textures. MICRO-CODA-VISTA p.1 (E.D., 1 Nov: Porta2 and Tempio_4 together,
 *  a version registered on the wrong asset): ONLY the geometry's fingerprint
 *  and the textures' sha256 make a form — the same triangles never do. null
 *  when nothing says it (no file measured, or a bridge / s3Dgraphy before
 *  dev84 that gives no geometry key): no group, said (`shapeless`). */
export function shapeKey(a: AssetRow): { key: string; via: Shape["via"]; v: VersionRow } | null {
  if (a.kind !== "rm") return null;
  const vs = a.versions.filter((v) => !v.master && !v.tileset && v.measured && (v.triangles ?? 0) > 0)
    .sort((x, y) => (y.triangles ?? 0) - (x.triangles ?? 0) || x.id.localeCompare(y.id));
  const g = vs.find((v) => v.geometry_keys?.length && !v.compression) ?? vs.find((v) => v.geometry_keys?.length);
  if (!g) return null;
  return { key: `g:${g.compression ? `${g.compression}:` : ""}${g.geometry_keys!.join(",")}|${texSet(g)}`, via: "geometry", v: g };
}

/** MICRO-CODA-VISTA p.1 · the assets that cannot be told a form: measured
 *  meshes whose files give no geometry key — they never join a group. */
export function shapeless(assets: readonly AssetRow[]): string[] {
  return assets.filter((a) => a.kind === "rm" && !shapeKey(a)
    && a.versions.some((v) => !v.master && !v.tileset && v.measured && (v.triangles ?? 0) > 0)).map((a) => a.id);
}

/** The forms repeated of a list: the shapes held by two assets or more,
 *  heaviest first (triangles × copies). MICRO-CODA-VISTA p.5 · `refused`:
 *  the forms the diagnosis did not find ONE geometry for (Column_entrance ×2)
 *  — no group: each copy has its own proposal again. */
export function repeatedShapes(assets: readonly AssetRow[], refused: ReadonlySet<string> = new Set()): Shape[] {
  const by = new Map<string, { s: Shape }>();
  for (const a of assets) {
    const k = shapeKey(a);
    if (!k || refused.has(k.key)) continue;
    const e = by.get(k.key) ?? { s: { key: k.key, assets: [], triangles: k.v.triangles, textures: k.v.textures.map((t) => t.sha256), via: k.via } };
    e.s.assets.push(a);
    by.set(k.key, e);
  }
  return [...by.values()].map((e) => e.s).filter((s) => s.assets.length > 1)
    .map((s) => ({ ...s, assets: [...s.assets].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })) }))
    .sort((x, y) => (y.triangles ?? 0) * y.assets.length - (x.triangles ?? 0) * x.assets.length || x.key.localeCompare(y.key));
}

/** asset id → its form repeated */
export function shapeIndex(shapes: readonly Shape[]): Map<string, Shape> {
  const m = new Map<string, Shape>();
  for (const s of shapes) for (const a of s.assets) m.set(a.id, s);
  return m;
}

/** Already instanced for a target: its assets all load ONE file. */
export function shapeShared(s: Shape, target: TargetKey): boolean {
  const ck = s.assets.map((a) => a.versions.find((v) => v.id === a.targets[target]?.loads)?.checksum ?? "");
  return ck.every((c) => c && c === ck[0]);
}

/** The ONE proposal of a form repeated for a target: a mesh reduced to the
 *  band (when one copy is over it) and N instances; the texture side of the
 *  band, KTX2 but for the desktop. The archive has none; a form already
 *  instanced keeps it. */
export function shapeProposal(s: Shape, target: TargetKey, b: Bands | undefined): Proposal {
  const n = s.assets.length;
  if (target === "arch" || shapeShared(s, target))
    return { tool: "keep", triangles: null, texture: null, ktx2: false,
             why: target === "arch" ? "l'archivio tiene i master" : `già una mesh sola per le ${n} copie` };
  const obj = b?.object_triangles ?? null;
  const tri = s.triangles;
  const reduce = !!(obj && tri && tri > obj);
  const to = reduce ? obj : tri;
  return { tool: "instance", triangles: to, texture: b?.object_texture_side ?? null, ktx2: target !== "desk",
           why: `${reduce ? `una mesh ridotta a ${to?.toLocaleString("it")} triangoli` : "una mesh sola"} + ${n} istanze (solo le trasformazioni): scaricata e in GPU una volta` };
}

/** The proposal of a form for a target: the person's (kept in the plan under
 *  `shape:<key>`), else `shapeProposal`. */
export function shapeProposalOf(s: Shape, target: TargetKey, b: Bands | undefined, plan: Plan): Proposal & { edited: boolean } {
  const p = plan.get(`shape:${s.key}`)?.[target];
  return p ? { ...p, edited: true } : { ...shapeProposal(s, target, b), edited: false };
}

/** «Metti in coda» for the forms the selection touches — all of it, the
 *  group, or ONE copy (MICRO-ARCHIVE-ASSET-3: a copy has no proposal of its
 *  own, it is covered by its form): one item per form and target (one mesh +
 *  N instances) — unless the person chose another tool for the form, then
 *  its copies go one by one (`itemsFor`). → the items and the assets they
 *  stand for. */
export function shapeItemsFor(shapes: readonly Shape[], sel: ReadonlySet<string>, targets: readonly TargetKey[], plan: Plan,
                              bands: Partial<Record<TargetKey, Bands>>,
                              labelOf: (s: Shape, t: TargetKey, p: Proposal) => string = (s, t, p) => `${s.assets[0].name} ×${s.assets.length} → ${t} · ${p.tool}`):
  { items: QueueItem[]; covered: Map<TargetKey, Set<string>> } {
  const items: QueueItem[] = [];
  const covered = new Map<TargetKey, Set<string>>(targets.map((t) => [t, new Set<string>()]));
  for (const s of shapes) {
    if (!s.assets.some((a) => sel.has(a.id))) continue;
    for (const t of targets) {
      const p = shapeProposalOf(s, t, bands[t], plan);
      if (p.tool !== "instance") continue;
      const rep = s.assets[0];
      items.push({ id: queueId(), label: labelOf(s, t, p), state: "waiting", note: p.why, asset_id: rep.id, asset: rep.name,
                   asset_ids: s.assets.map((a) => a.id), shape: s.key, target: t, tool: "instance",
                   triangles: p.triangles, texture: p.texture, ktx2: p.ktx2, from: "list" });
      for (const a of s.assets) covered.get(t)!.add(a.id);
    }
  }
  return { items, covered };
}

/** MICRO-ARCHIVE-ASSET-3 · the copies covered by their form, per target:
 *  those of a form whose proposal (or the person's) is «istanze» — they have
 *  no proposal of their own and never go in the queue alone. */
export function shapeCover(shapes: readonly Shape[], targets: readonly TargetKey[], plan: Plan,
                           bands: Partial<Record<TargetKey, Bands>>): Map<TargetKey, Set<string>> {
  const out = new Map<TargetKey, Set<string>>(targets.map((t) => [t, new Set<string>()]));
  for (const s of shapes) for (const t of targets) {
    if (!shapeCovers(s, t, bands[t], plan)) continue;
    for (const a of s.assets) out.get(t)!.add(a.id);
  }
  return out;
}

/** Does a form cover its copies for a target: its proposal is «istanze», or
 *  it is ALREADY one file for all of them (then a copy's own proposal — a
 *  decimation of a file that draws N instances — would be work twice). Not
 *  the archive (each master its own), not when the person chose «una per
 *  una». */
export function shapeCovers(s: Shape, t: TargetKey, b: Bands | undefined, plan: Plan): boolean {
  if (t === "arch") return false;
  const p = shapeProposalOf(s, t, b, plan);
  if (p.tool === "instance") return true;
  return !p.edited && shapeShared(s, t);
}

/** The items of a selection, all in one (MICRO-ARCHIVE-ASSET-3, «Applica e
 *  metti in coda»): the forms it touches once each, the other rows one by
 *  one — a copy of a form never alone. */
export function selectionItems(assets: readonly AssetRow[], shapes: readonly Shape[], sel: ReadonlySet<string>,
                               targets: readonly TargetKey[], plan: Plan, bands: Partial<Record<TargetKey, Bands>>,
                               labels: { shape?: (s: Shape, t: TargetKey, p: Proposal) => string;
                                         one?: (a: AssetRow, t: TargetKey, p: Proposal) => string } = {}): QueueItem[] {
  const sh = shapeItemsFor(shapes, sel, targets, plan, bands, labels.shape);
  const cov = shapeCover(shapes, targets, plan, bands);
  const single = itemsFor(assets, sel, targets, plan, labels.one)
    .filter((it) => !sh.covered.get(it.target!)?.has(it.asset_id!) && !cov.get(it.target!)?.has(it.asset_id!));
  return [...sh.items, ...single];
}

/** The plan not queued yet (MICRO-ARCHIVE-ASSET-3): the items the person's
 *  plan would make — forms once, rows one by one, a copy of a form never —
 *  less those already waiting or running. «Metti in coda (N)» says N. */
export function planItems(assets: readonly AssetRow[], shapes: readonly Shape[], targets: readonly TargetKey[], plan: Plan,
                          bands: Partial<Record<TargetKey, Bands>>, q: readonly QueueItem[] = [],
                          labels: { shape?: (s: Shape, t: TargetKey, p: Proposal) => string;
                                    one?: (a: AssetRow, t: TargetKey, p: Proposal) => string } = {}): QueueItem[] {
  const out: QueueItem[] = [];
  const cov = shapeCover(shapes, targets, plan, bands);
  const live = q.filter((x) => x.state === "waiting" || x.state === "running");
  for (const s of shapes) for (const t of targets) {
    const p = plan.get(`shape:${s.key}`)?.[t];
    if (!p || p.tool !== "instance") continue;
    if (live.some((x) => x.target === t && x.shape === s.key)) continue;
    out.push(...shapeItemsFor([s], new Set([s.assets[0].id]), [t], plan, bands, labels.shape).items);
  }
  for (const a of assets) for (const t of targets) {
    const p = plan.get(a.id)?.[t];
    if (!p || p.tool === "keep" || cov.get(t)?.has(a.id)) continue;
    if (live.some((x) => x.target === t && (x.asset_id === a.id || (x.asset_ids ?? []).includes(a.id)))) continue;
    out.push(...itemsFor([a], new Set([a.id]), [t], plan, labels.one));
  }
  return out;
}

/** What leaves the plan when its items went in the queue: a row's entry for
 *  that target, a form's «istanze» (its «una per una» stays: a choice). */
export function unplan(plan: Plan, items: readonly QueueItem[]): Plan {
  for (const it of items) {
    if (!it.target) continue;
    const key = it.shape ? `shape:${it.shape}` : it.asset_id ?? "";
    const r = plan.get(key);
    if (r?.[it.target] && (!it.shape || r[it.target]!.tool === "instance")) delete r[it.target];
    if (r && !Object.keys(r).length) plan.delete(key);
  }
  return plan;
}

// ── MICRO-ARCHIVE-ASSET-2 · what a tool needs on this computer ─────────────

/** What an item's tool needs, from the kind of its source: gltfpack for a
 *  glTF (its decimation, KTX2, meshopt), Blender for a master inside a .blend,
 *  Obj2Tiles for a tileset; the instances of a form want the .blend (one mesh
 *  linked N times, EM Tools' «Prepare for a use»). */
export function toolNeeds(tool: Tool, kind: "files" | "blend" | "none"): { addon: string | null; blender: boolean; block: BlockCode | null } {
  if (tool === "keep") return { addon: null, blender: false, block: null };
  // MICRO-BLENDER-SIDECAR p.4a · tiles are remade from the master's meshes
  if (kind === "none") return { addon: null, blender: false, block: tool === "tileset" ? "no_master" : "no_source" };
  if (tool === "tileset") return kind === "files" ? { addon: "obj2tiles", blender: false, block: null } : { addon: null, blender: false, block: "no_mesh" };
  if (tool === "instance") return kind === "blend" ? { addon: null, blender: true, block: null } : { addon: null, blender: false, block: "no_blend" };
  if (kind === "blend") return { addon: null, blender: true, block: null };
  return { addon: "gltfpack", blender: false, block: null };
}

/** Why an item cannot start now, from what this computer has: the source,
 *  the add-on, Blender, the stamp of the source (a variant is born stamped
 *  as derived: its source first, Ottimizza's rule). null: it can start. */
export function blockOf(tool: Tool, src: { kind: "files" | "blend" | "none"; path: string },
                        have: { addons: ReadonlySet<string> | null; blender: boolean; stamped: (path: string) => boolean | null }): Block | null {
  const n = toolNeeds(tool, src.kind);
  if (n.block) return { code: n.block };
  if (n.addon && have.addons && !have.addons.has(n.addon)) return { code: "addon", addon: n.addon };
  if (n.blender && !have.blender) return { code: "blender" };
  if (src.kind === "files" && tool !== "tileset" && have.stamped(src.path) === false) return { code: "unstamped", path: src.path };
  return null;
}

// ── MICRO-ARCHIVE-ASSET-2 · the versions on disk of ONE asset ─────────────

/** Of the files of a «versions» folder, those that are versions of this
 *  asset — by the file its graph's versions point at (the path found on this
 *  computer, else the url) — each with the version of the graph it is. */
export function diskVersionsOf<R extends { name: string; path?: string; entry?: string; files?: string[] }>(
  rows: readonly R[], a: AssetRow, pathOf: (id: string) => string): { row: R; version: VersionRow }[] {
  const base = (p: string): string => (p.split("#")[0].split("?")[0].split(/[\\/]/).pop() ?? "").toLowerCase();
  const by = new Map<string, VersionRow>();
  for (const v of a.versions) {
    if (v.master) continue;
    for (const p of [pathOf(v.id), v.url]) if (p) by.set(base(p), v);
  }
  const out: { row: R; version: VersionRow }[] = [];
  for (const r of rows) {
    const names = [r.entry ?? "", r.path ?? "", r.name, ...(r.files ?? [])].map(base).filter(Boolean);
    const v = names.map((n) => by.get(n)).find(Boolean);
    if (v) out.push({ row: r, version: v });
  }
  return out;
}

// ── the textures view ───────────────────────────────────────────────────────

export type TexSort = "uses" | "gpu" | "side" | "name";
export function texturesShown(list: readonly StudyTexture[], query: string, sort: TexSort, desc = true): StudyTexture[] {
  const q = query.trim().toLowerCase();
  const rows = list.filter((t) => !q || t.names.some((n) => n.toLowerCase().includes(q)) || t.uses.some((u) => u.asset.toLowerCase().includes(q)));
  const val = (t: StudyTexture): number | string => sort === "uses" ? t.count : sort === "gpu" ? t.gpu_bytes
    : sort === "side" ? Math.max(t.width, t.height) : t.name.toLowerCase();
  return rows.sort((x, y) => { const a = val(x), b = val(y); const c = a < b ? -1 : a > b ? 1 : x.name.localeCompare(y.name); return desc ? -c : c; });
}

/** How many times each texture (sha256) is used in the study: «condivisa ×N». */
export function sharedCounts(list: readonly StudyTexture[]): Map<string, number> {
  return new Map(list.filter((t) => t.sha256).map((t) => [t.sha256, t.count] as const));
}

// ── the source a queued action starts from ──────────────────────────────────

/** Where a tool starts from, among the versions with a file on this computer
 *  (`pathOf`, the Archive's resolver): gltfpack / KTX2 / a decimation want a
 *  glTF or OBJ (the heaviest version found, else the master's file); Blender's
 *  bake and the instances want the .blend of the master; a tileset a mesh.
 *  → `{kind: files | blend | none, path, block, version}`. */
export function sourceFor(a: AssetRow, tool: Tool, pathOf: (id: string) => string):
  { kind: "files" | "blend" | "none"; path: string; block: string; version: string } {
  const ext = (p: string) => (/\.([a-z0-9]+)$/i.exec(p.split("#")[0])?.[1] ?? "").toLowerCase();
  const reads = (p: string) => !!p && ["glb", "gltf", "obj"].includes(ext(p));
  const master = a.versions.find((v) => v.master);
  const mPath = master ? pathOf(master.id) : "";
  const blend = master && master.url.startsWith("blend://") && ext(mPath) === "blend"
    ? { kind: "blend" as const, path: mPath, block: decodeURIComponent((master.url.split("#")[1] ?? "").split("/").pop() ?? ""), version: master.id }
    : null;
  const files = [...a.versions.filter((v) => !v.master && !v.tileset)]
    .sort((x, y) => (y.triangles ?? 0) - (x.triangles ?? 0))
    .map((v) => ({ v, p: pathOf(v.id) })).filter((x) => reads(x.p));
  const fromMaster = master && !master.url.startsWith("blend://") && reads(mPath) ? { v: master, p: mPath } : null;
  const file = fromMaster ?? files[0] ?? null;
  if ((tool === "decimate_bake" || tool === "instance") && blend) return blend;
  if (file) return { kind: "files", path: file.p, block: "", version: file.v.id };
  if (blend && tool !== "tileset") return blend;
  return { kind: "none", path: "", block: "", version: "" };
}

/** MICRO-BLENDER-SIDECAR p.4a · a tileset whose tiles do not fit a target
 *  (Survey2015 → mobile: 1877 tiles over 512 px): s3Dgraphy proposes to
 *  re-tile it, and Obj2Tiles starts from a mesh of the asset — its master.
 *  Without one on this computer that proposal could only fail in the queue
 *  («no file of this asset on this computer to start from»): the cell keeps
 *  why its tiles are out of the band and says that the master is missing;
 *  nothing is proposed that cannot be done (keep, with that reason), and
 *  «Applica e metti in coda» leaves it out. → the cells changed. */
export function retileWithoutMaster(ans: Pick<AssetListAnswer, "assets">, pathOf: (id: string) => string,
                                    say: (k: "declare" | "named", names: string) => string): number {
  let n = 0;
  for (const a of ans.assets) {
    for (const c of Object.values(a.targets)) {
      if (!c?.tiles || c.proposal?.tool !== "tileset") continue;
      if (sourceFor(a, "tileset", pathOf).kind !== "none") continue;
      const tm = a.tileset_master;
      const why = !tm?.declared || !tm.sources.length ? say("declare", "")
        : say("named", tm.sources.map((x) => x.name).join(", "));
      c.why = c.why ? `${c.why} · ${why}` : why;
      c.proposal = { tool: "keep", triangles: null, texture: null, ktx2: false, why };
      c.retile = "no_master";
      n++;
    }
  }
  return n;
}

// ── MICRO-TESTATA-CLOUD · files in the cloud, not downloaded ───────────────

/** The files in the cloud of some assets (all their versions, or only
 *  `versionIds`), each once, and their bytes → what «Scarica e misura» would
 *  download: `{paths, bytes, versions}`. */
export function cloudOf(assets: readonly AssetRow[], versionIds?: ReadonlySet<string>): { paths: string[]; bytes: number; versions: number } {
  const seen = new Map<string, number>();
  let versions = 0;
  for (const a of assets) for (const v of a.versions) {
    if (!v.in_cloud || (versionIds && !versionIds.has(v.id))) continue;
    versions++;
    const ps = v.cloud_paths ?? [];
    // the bytes of a version are of its files together: shared out evenly
    for (const p of ps) if (!seen.has(p)) seen.set(p, ps.length ? (v.cloud_bytes ?? 0) / ps.length : 0);
  }
  return { paths: [...seen.keys()], bytes: Math.round([...seen.values()].reduce((x, y) => x + y, 0)), versions };
}

/** An item whose source is in the cloud waits «da scaricare»: the source
 *  the tool would take were every file here (`sourceFor` with the cloud's
 *  places too) is a file in the cloud — a decimation that wants the master's
 *  .blend waits for it, a gltfpack that wants the heaviest glTF waits for it,
 *  instead of quietly starting from something else. A file in the cloud is
 *  never read by itself: the gesture downloads it. */
export function cloudBlock(a: AssetRow, tool: Tool, pathOf: (id: string) => string): Block | null {
  if (tool === "keep") return null;
  const cloudPath = new Map<string, VersionRow>();
  for (const v of a.versions) for (const p of v.in_cloud ? v.cloud_paths ?? [] : []) cloudPath.set(p, v);
  if (!cloudPath.size) return null;
  const would = sourceFor(a, tool, (id) => pathOf(id) || (a.versions.find((v) => v.id === id && v.in_cloud)?.cloud_paths?.[0] ?? ""));
  const v = cloudPath.get(would.path);
  if (!v) return null;
  const c = cloudOf([a], new Set([v.id]));
  return { code: "cloud", paths: c.paths, bytes: c.bytes };
}

// ── MICRO-VERSIONI-PER-USO p.3 · «Stringi…» ─────────────────────────────────
// On a row already covered for a target, or on a form repeated: a NEW version
// for the same use with fewer triangles / a smaller texture. It goes in the
// queue like any item; its file is named by the use and the new numbers, and
// when that name is already in versions/ the page asks Sostituisci / Nuova
// accanto (`nextBeside`).

/** The item of «Stringi…» for a row (`a`) or a form (`s`) and a target. */
export function shrinkItem(target: TargetKey, v: { triangles: number | null; texture: number | null; ktx2: boolean; tool: Tool },
                           o: { a?: AssetRow; s?: Shape; label: string; note?: string }): QueueItem {
  const rep = o.s ? o.s.assets[0] : o.a!;
  return { id: queueId(), label: o.label, state: "waiting", note: o.note ?? "", asset_id: rep.id, asset: rep.name,
           ...(o.s ? { asset_ids: o.s.assets.map((x) => x.id), shape: o.s.key } : {}),
           target, tool: o.s ? "instance" : v.tool, triangles: v.triangles, texture: v.texture, ktx2: v.ktx2,
           from: "list", shrink: true };
}

/** The tool «Stringi» uses on a row: fewer triangles → the decimation (with
 *  baked normals) of a .blend's master, gltfpack on a file; only a smaller
 *  texture → KTX2 (or gltfpack for the desktop). */
export function shrinkTool(kind: "files" | "blend" | "none", triangles: number | null, target: TargetKey): Tool {
  if (triangles) return kind === "files" ? "gltfpack" : "decimate_bake";
  return target === "desk" ? "gltfpack" : "ktx2";
}

// ── MICRO-VERSIONI-PER-USO p.4 · the second round for the scene ─────────────
// Every object inside its band, the scene not (Templu Mare mobile: 694 k / 300
// k, the instances drawn ×N): «Applica» proposes to shrink — the forms
// repeated first, then the heaviest — until the scene fits; shown row by row
// before anything is queued.

/** One row of the second round: what is shrunk, from how many triangles to
 *  how many (each copy drawn: ×`copies`). */
export interface Round2Row { asset_id: string; name: string; shape?: string; asset_ids?: string[]; copies: number; from: number; to: number }
export interface Round2 { limit: number; before: number; after: number; ok: boolean; rows: Round2Row[]; objectsIn: boolean;
  /** the objects still over their own band (their names) */
  over: string[] }

/** Rounded down to a number a person writes: 2 500, 12 000, 45 000. */
function nice(n: number): number {
  const step = n >= 20000 ? 1000 : n >= 2000 ? 500 : 100;
  return Math.max(step, Math.floor(n / step) * step);
}

/** The triangles a viewer would DRAW for a target after the queue: each
 *  asset its version (an instance drawn as many times as its copies), or its
 *  item / plan, or its lightest version. → per asset, and the forms. */
export function drawnTriangles(assets: readonly AssetRow[], target: TargetKey,
                               o: { plan?: Plan; queue?: readonly QueueItem[]; shapes?: readonly Shape[]; answeredAt?: number } = {}):
  Map<string, number> {
  const out = new Map<string, number>();
  const live = (o.queue ?? []).filter((x) => x.target === target && x.state !== "failed" && x.state !== "cancelled"
    && (x.state !== "done" || (o.answeredAt != null && (x.ended ?? 0) > o.answeredAt)));
  const planShape = new Map<string, Proposal>();
  for (const s of o.shapes ?? []) {
    const p = o.plan?.get(`shape:${s.key}`)?.[target];
    if (p?.tool === "instance") for (const a of s.assets) planShape.set(a.id, p);
  }
  for (const a of assets) {
    const cell = a.targets[target];
    if (!cell || cell.state === "na") continue;
    const item = [...live].reverse().find((x) => (x.asset_ids ?? []).includes(a.id)) ?? [...live].reverse().find((x) => x.asset_id === a.id);
    const p = item ? { triangles: item.triangles ?? null, tool: item.tool } : planShape.get(a.id) ?? o.plan?.get(a.id)?.[target];
    const cur = cell.loads && cell.state !== "missing" ? a.versions.find((v) => v.id === cell.loads) ?? null : null;
    // a tileset (made or to make) streams: not an object of the scene
    if (p?.tool === "tileset" || cell.covered_by) continue;
    let tri: number;
    if (p && p.tool && p.tool !== "keep" && p.triangles) tri = p.triangles;
    else if (cur) { if (cur.tileset) continue; tri = cur.triangles ?? 0; }
    else tri = lightestVersion(a)?.triangles ?? 0;
    out.set(a.id, tri);
  }
  return out;
}

/** The second round (p.4): when every object is inside its band and the
 *  scene is not, the rows to shrink — forms repeated first (heaviest ×
 *  copies), then the heaviest objects — each to a nicer number, never under
 *  `floor` triangles nor under a fifth of what it is (then a tenth, then the
 *  floor, if one round is not enough), until the scene fits. */
export function secondRound(assets: readonly AssetRow[], target: TargetKey, b: Bands | undefined,
                            o: { plan?: Plan; queue?: readonly QueueItem[]; shapes?: readonly Shape[]; answeredAt?: number; floor?: number } = {}): Round2 {
  const limit = b?.scene_triangles ?? 0;
  const per = drawnTriangles(assets, target, o);
  const before = [...per.values()].reduce((x, y) => x + y, 0);
  const objMax = b?.object_triangles ?? null;
  const over = objMax ? assets.filter((a) => (per.get(a.id) ?? 0) > objMax).map((a) => a.name) : [];
  const objectsIn = !over.length;
  const res: Round2 = { limit, before, after: before, ok: !limit || before <= limit, rows: [], objectsIn, over };
  if (!limit || before <= limit) return res;
  const floor = o.floor ?? 1000;
  // the units: a form (its copies together), then each other asset
  const inShape = new Set<string>();
  type Unit = { asset_id: string; name: string; shape?: string; asset_ids?: string[]; copies: number; tri: number };
  const units: Unit[] = [];
  for (const s of o.shapes ?? []) {
    const ids = s.assets.map((a) => a.id).filter((id) => per.has(id));
    if (ids.length < 2) continue;
    const tri = Math.max(...ids.map((id) => per.get(id) ?? 0));
    ids.forEach((id) => inShape.add(id));
    units.push({ asset_id: ids[0], name: s.assets[0].name, shape: s.key, asset_ids: ids, copies: ids.length, tri });
  }
  const shapesFirst = units.sort((x, y) => y.tri * y.copies - x.tri * x.copies);
  const singles: Unit[] = assets.filter((a) => per.has(a.id) && !inShape.has(a.id) && a.kind === "rm")
    .map((a) => ({ asset_id: a.id, name: a.name, copies: 1, tri: per.get(a.id) ?? 0 }))
    .sort((x, y) => y.tri - x.tri || x.name.localeCompare(y.name));
  const order: Unit[] = [...shapesFirst, ...singles];
  const to = new Map<string, number>(order.map((u) => [u.asset_id, u.tri]));
  let excess = before - limit;
  for (const share of [0.2, 0.1, 0]) {
    for (const u of order) {
      if (excess <= 0) break;
      const cur = to.get(u.asset_id)!;
      const low = Math.max(floor, Math.round(u.tri * share));
      if (cur <= low) continue;
      const want = nice(Math.max(low, cur - Math.ceil(excess / u.copies)));
      const next = Math.max(low, Math.min(cur, want));
      if (next >= cur) continue;
      excess -= (cur - next) * u.copies;
      to.set(u.asset_id, next);
    }
    if (excess <= 0) break;
  }
  for (const u of order) {
    const n = to.get(u.asset_id)!;
    if (n < u.tri) res.rows.push({ asset_id: u.asset_id, name: u.name, ...(u.shape ? { shape: u.shape, asset_ids: u.asset_ids } : {}),
                                   copies: u.copies, from: u.tri, to: n });
  }
  res.after = before - res.rows.reduce((x, r) => x + (r.from - r.to) * r.copies, 0);
  res.ok = res.after <= limit;
  return res;
}

// ── MICRO-VERSIONI-PER-USO p.5 · when the queue will end ───────────────────

/** What one item of each tool lasted, measured (ms): the median of the last
 *  ones — kept by the page across sessions. */
export type Durations = Partial<Record<string, number[]>>;
/** what an item lasts before anything was measured (ms), per tool */
export const DEFAULT_DURATION: Readonly<Record<string, number>> = {
  decimate_bake: 90_000, instance: 120_000, gltfpack: 20_000, ktx2: 30_000, tileset: 600_000, keep: 0, optimize: 30_000 };
const KEEP_LAST = 12;
/** A duration measured for a tool: kept (the last twelve). */
export function recordDuration(d: Durations, tool: string, ms: number): Durations {
  if (!(ms > 0) || !tool) return d;
  d[tool] = [...(d[tool] ?? []), Math.round(ms)].slice(-KEEP_LAST);
  return d;
}
/** The duration of one item of `tool`: the median of the measured ones, else
 *  the default; `measured` says which. */
export function durationOf(d: Durations, tool: string): { ms: number; measured: boolean } {
  const xs = [...(d[tool] ?? [])].sort((x, y) => x - y);
  if (xs.length) return { ms: xs[Math.floor(xs.length / 2)], measured: true };
  return { ms: DEFAULT_DURATION[tool] ?? 60_000, measured: false };
}
/** When each item and the whole queue should end (ms since the epoch): the
 *  running ones from when they started, the waiting ones in order on
 *  `slots` lanes (in Pausa: none starts — no end). → `{items, end, measured}`
 *  (`measured`: every tool in it has a measured duration). */
export function queueEta(q: readonly QueueItem[], d: Durations, now: number, slots = 1, mode: QueueMode = "run"):
  { items: Map<string, number>; end: number | null; measured: boolean } {
  const items = new Map<string, number>();
  const lanes: number[] = [];
  let measured = true;
  const dur = (it: QueueItem): number => {
    const x = durationOf(d, it.tool ?? (it.from === "optimize" ? "optimize" : ""));
    if (!x.measured) measured = false;
    return x.ms;
  };
  for (const it of q) {
    if (it.state !== "running") continue;
    const end = Math.max(now + 1000, (it.started ?? now) + dur(it));
    items.set(it.id, end);
    lanes.push(end);
  }
  const waiting = q.filter((x) => x.state === "waiting");
  if (mode === "pause" && waiting.length) return { items, end: null, measured };
  while (lanes.length < Math.max(1, slots)) lanes.push(now);
  lanes.sort((x, y) => x - y);
  for (const it of waiting) {
    const start = lanes.shift()!;
    const end = start + dur(it);
    items.set(it.id, end);
    lanes.push(end);
    lanes.sort((x, y) => x - y);
  }
  const ends = [...items.values()];
  return { items, end: ends.length ? Math.max(...ends) : null, measured };
}
/** «07:42» */
export function clockOf(ms: number): string {
  const t = new Date(ms);
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
