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
   *  texture side of one tile */
  tiles?: { tiles: number; read: number; max_triangles: number | null; max_texture_side: number | null } | null;
}
export interface Proposal { tool: Tool; triangles: number | null; texture: number | null; ktx2: boolean; why: string }
export interface TileFit { ok: boolean; known: boolean; tiles: number; read: number; over_triangles: number; over_texture: number;
                           max_triangles: number | null; max_texture_side: number | null }
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
export function levelSay(v: Pick<VersionRow, "level_say" | "tileset" | "master">, tilesetWords = "tileset · in streaming"): string {
  if (v.master) return "◆ master";
  return v.tileset ? tilesetWords : v.level_say;
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
}
export type BlockCode = "addon" | "unstamped" | "blender" | "no_source" | "no_blend" | "no_mesh" | "checking" | "cloud" | "author";
/** `cloud` (MICRO-TESTATA-CLOUD): the source is in the cloud, «da scaricare»
 *  — `paths` and `bytes` are what «Scarica e misura» would download */
export interface Block { code: BlockCode; addon?: string; path?: string; paths?: string[]; bytes?: number }
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
                           o: { plan?: Plan; queue?: readonly QueueItem[]; after?: boolean; shapes?: readonly Shape[] } = {}): SceneCount {
  const out: SceneCount = { triangles: 0, download_bytes: 0, gpu_bytes: 0, estimated: 0, covered: 0, total: 0, instances: 0 };
  const seen = new Set<string>(), seenTex = new Set<string>(), shapes = new Set<string>();
  const live = (o.queue ?? []).filter((x) => x.target === target && x.state !== "failed" && x.state !== "cancelled" && x.state !== "done");
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
  /** how it was recognised: the geometry keys of the files (indices and UVs),
   *  or — files compressed, or an s3Dgraphy before dev84 — the same triangles
   *  and the same textures */
  via: "geometry" | "triangles";
}

const texSet = (v: VersionRow): string => v.textures.map((t) => t.sha256).filter(Boolean).sort().join("+");

/** The shape of an asset: the geometry keys of its heaviest version measured
 *  with an uncompressed geometry, with its textures; else its heaviest
 *  version's triangles with its textures. "" when nothing says it (no file
 *  measured, no texture). */
export function shapeKey(a: AssetRow): { key: string; via: Shape["via"]; v: VersionRow } | null {
  if (a.kind !== "rm") return null;
  const vs = a.versions.filter((v) => !v.master && !v.tileset && v.measured && (v.triangles ?? 0) > 0)
    .sort((x, y) => (y.triangles ?? 0) - (x.triangles ?? 0) || x.id.localeCompare(y.id));
  const g = vs.find((v) => v.geometry_keys?.length && !v.compression);
  if (g) return { key: `g:${g.geometry_keys!.join(",")}|${texSet(g)}`, via: "geometry", v: g };
  const v = vs.find((x) => x.textures.length);
  if (v) return { key: `t:${v.triangles}|${texSet(v)}`, via: "triangles", v };
  return null;
}

/** The forms repeated of a list: the shapes held by two assets or more,
 *  heaviest first (triangles × copies). */
export function repeatedShapes(assets: readonly AssetRow[]): Shape[] {
  const by = new Map<string, { s: Shape }>();
  for (const a of assets) {
    const k = shapeKey(a);
    if (!k) continue;
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
  if (kind === "none") return { addon: null, blender: false, block: "no_source" };
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
