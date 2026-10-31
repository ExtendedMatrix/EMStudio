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
}
export interface Proposal { tool: Tool; triangles: number | null; texture: number | null; ktx2: boolean; why: string }
export interface TargetCell { state: TargetState; loads: string; why: string; proposal: Proposal; loaded_why?: string }
export interface AssetRow {
  id: string; name: string; kind: "rm" | "container"; description?: string;
  containers: { id: string; name: string }[]; branch: string; epochs: string[]; family: string; status: string;
  versions: VersionRow[]; targets: Record<TargetKey, TargetCell>;
  findings: { level: string; code: string; say_it: string; action: Record<string, unknown> }[];
  loaded_why: string; loaded_say: string;
  tileset_master?: { declared: boolean; sources: { id: string; name: string }[]; unavailable: string; say_it: string } | null;
  audit: { versions: number; stamped: number; files_missing: string[]; unchecked: number; modified_after_stamp: string[];
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
            measured: number; estimated: number; by_target: Record<TargetKey, Record<TargetState, number>> };
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
export function applyProposal(plan: Plan, assets: readonly AssetRow[], sel: ReadonlySet<string>, targets: readonly TargetKey[]): number {
  let n = 0;
  for (const a of assets) {
    if (!sel.has(a.id)) continue;
    for (const t of targets) {
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
                          v: { tool?: Tool | ""; triangles?: number | null; texture?: number | null; ktx2?: boolean }): number {
  let n = 0;
  for (const a of assets) {
    if (!sel.has(a.id)) continue;
    for (const t of targets) {
      if (t === "arch") continue;
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
}
export type QueueMode = "run" | "pause";

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
    const i = it.asset_id ? q.findIndex((x) => x.state === "waiting" && x.asset_id === it.asset_id && x.target === it.target) : -1;
    if (i >= 0) q[i] = it; else q.push(it);
  }
  return q;
}

/** The item to start now: in Run, the first waiting one when none runs; in
 *  Pausa, none (they pile up and start when Run is back). */
export function nextToRun(q: readonly QueueItem[], mode: QueueMode): QueueItem | null {
  if (mode !== "run" || q.some((x) => x.state === "running")) return null;
  return q.find((x) => x.state === "waiting") ?? null;
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

/** The scene of a target after the queue (the items not failed nor
 *  cancelled, and the plan not yet queued): a row with something planned
 *  counts its estimate, the others what they load today — a file once, a
 *  shared texture once. */
export function totalsAfter(assets: readonly AssetRow[], target: TargetKey, plan: Plan, q: readonly QueueItem[]):
  { triangles: number; download_bytes: number; gpu_bytes: number } {
  let triangles = 0, dl = 0, gpu = 0;
  const seen = new Set<string>(), seenTex = new Set<string>();
  for (const a of assets) {
    const item = [...q].reverse().find((x) => x.asset_id === a.id && x.target === target && x.state !== "failed" && x.state !== "cancelled" && x.state !== "done");
    const p = item ? { triangles: item.triangles ?? null, texture: item.texture ?? null, ktx2: !!item.ktx2, tool: item.tool }
      : plan.get(a.id)?.[target];
    const cur = a.targets[target]?.loads ? a.versions.find((v) => v.id === a.targets[target].loads) ?? null : null;
    if (p && p.tool && p.tool !== "keep" && p.tool !== "tileset") {
      const c = plannedCost(p, cur ?? shownVersion(a, target));
      triangles += c.triangles; dl += c.download_bytes; gpu += c.gpu_bytes;
      continue;
    }
    if (!cur || cur.tileset) continue;
    if (cur.checksum && seen.has(cur.checksum)) continue;
    if (cur.checksum) seen.add(cur.checksum);
    triangles += cur.triangles ?? 0;
    dl += cur.size_bytes ?? 0;
    if (cur.measured && cur.textures.length) {
      gpu += Math.max(0, (cur.gpu_bytes ?? 0) - cur.textures.reduce((s, t) => s + t.gpu_bytes, 0));
      for (const t of cur.textures) {
        if (t.sha256 && seenTex.has(t.sha256)) continue;
        if (t.sha256) seenTex.add(t.sha256);
        gpu += t.gpu_bytes;
      }
    } else gpu += cur.gpu_bytes ?? 0;
  }
  return { triangles, download_bytes: dl, gpu_bytes: gpu };
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
