/**
 * MICRO-BLEND-OFFICINA-3 · «Consolida per…» and «Componi un .blend dal grafo»,
 * EMStudio's half (E.D., 31 Oct 2026: two actions, not one). The rules are
 * s3Dgraphy's — `resources.consolidate` (one row per published model: the
 * floor mobile webXR, the best for the platform, the opportune, the
 * sufficient, the presence in the room's bucket) and `resources.graph_compose`
 * (a working .blend from the graph, the graph's tags on each object, the
 * before/after of «Controlla col grafo», the tileset as the level «Intero» of a
 * container) — asked through the bridge (`/consolidate`, `/graph/compose-plan`,
 * `/graph/before-after`, `/graph/tileset-whole`). Nothing of them is ported
 * here: this module only SHAPES their answers for the page (which button a
 * finding gives, which preset of Ottimizza a profile opens, the rows «Aggiorna»
 * adds to the check, the delta applied in one undo step). No DOM.
 * `scripts/check-consolidate.mjs` runs it.
 */

// ── the answers of the bridge (s3Dgraphy's shapes) ──────────────────────────

export type Level = "necessary" | "recommended" | "opportune" | "sufficient" | "presence";
export const LEVELS: readonly Level[] = ["necessary", "recommended", "opportune", "sufficient", "presence"];

export interface ActionData {
  kind?: "prepare" | "upload" | "disk" | "check" | "find" | "stamp" | "" | string;
  profile?: string; model?: string; asset_id?: string; resource_id?: string; checksum?: string;
}
export interface Finding { level: Level; code: string; say_it: string; action: ActionData }
export interface VersionSummary {
  id: string; asset_id?: string; name: string; level: string; lod_level?: string; use: string[]; master: boolean;
  url: string; checksum: string; size_bytes: number | null; triangles: number | null; gpu_bytes: number | null;
  ktx2: boolean | null; files: { id: string; path: string; url: string; checksum: string; size_bytes: number | null }[];
  tileset: boolean; use_served?: string;
}
export interface Presence { which: "base" | "best"; id: string; name: string; ok: boolean; state: string; action: string; say_it: string }
export interface ConsolidateRow {
  id: string; name: string; kind: "rm" | "container";
  base: VersionSummary | null; best: VersionSummary | null; loaded: VersionSummary | null;
  loaded_is?: "best" | "base" | "master" | "";
  findings: Finding[]; presence: Presence[]; status: Level | "ok";
}
export interface Totals {
  profile: string; download_bytes: number; gpu_bytes: number; triangles: number; unknown: number;
  streamed: number; shared: number; ok: boolean; over: string[]; say_it: string;
}
export interface ConsolidateAnswer {
  ok?: boolean; error?: string;
  platform: { id: string; label: string; label_it: string; profile: string; uses: string[] };
  in_room: boolean; rows: ConsolidateRow[]; totals: { platform: Totals; floor: Totals };
  counts: { models: number; rms: number; containers: number; with_base: number; without_base: number; with_best: number;
            master_loaded: number; to_upload: number; unchecked: number; missing_files: number; status: Record<string, number> };
  say_it: string; platforms?: { id: string; label: string; label_it: string }[]; resolved_here?: boolean;
}

/** The platforms «Consolida per…» knows (s3Dgraphy `consolidate.PLATFORMS`);
 *  the bridge's list wins when it answers one. */
export const PLATFORMS: readonly { id: string; label: string }[] = [
  { id: "heriverse", label: "Heriverse" }, { id: "aton", label: "ATON" }, { id: "web", label: "web" },
];

/** The sign of a row's status, from what blocks to what informs. */
export const STATUS_SIGN: Record<Level | "ok", string> = {
  ok: "✔", necessary: "✖", recommended: "▲", opportune: "◆", sufficient: "∑", presence: "☁",
};

/** The resolver's states the page holds (`fileStates()`: the Archive's
 *  «Controlla i file»), by resource or file id, as `consolidate` takes them. */
export function statesOf(files: readonly { id: string; state: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of files) if (f.id && f.state) out[f.id] = f.state;
  return out;
}

/** The rows shown: all, or those with something to do (status not ok). */
export function rowsShown(rows: readonly ConsolidateRow[], onlyTodo: boolean, level: Level | "" = ""): ConsolidateRow[] {
  return rows.filter((r) => (!onlyTodo || r.status !== "ok") && (!level || r.findings.some((f) => f.level === level)));
}

/** The buttons of a row: one per kind of action (the first finding of that
 *  kind gives its data), in the order the findings say them. A finding with no
 *  action gives none. */
export function rowActions(row: ConsolidateRow): { kind: string; finding: Finding }[] {
  const out: { kind: string; finding: Finding }[] = [];
  const seen = new Set<string>();
  for (const f of row.findings) {
    const k = String(f.action?.kind ?? "");
    if (!k || seen.has(k)) continue;
    // two «prepare» with different profiles (the floor and the platform's) are two buttons
    const key = k === "prepare" ? `${k}:${f.action.profile ?? ""}` : k;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: k, finding: f });
  }
  return out;
}

/** One line for a version: «lod3 · 3,7 MB · 53.364 tri». */
export function versionLine(v: VersionSummary | null, locale = "it"): string {
  if (!v) return "—";
  const lv = v.level || v.lod_level || (v.master ? "master" : "") || v.name;
  const mb = v.size_bytes != null ? `${(v.size_bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 1 })} MB` : "";
  const tri = v.triangles != null ? `${v.triangles.toLocaleString(locale)} tri` : "";
  return [lv, mb, tri, v.tileset ? "tileset" : ""].filter(Boolean).join(" · ");
}

// ── «Prepara» → Ottimizza on that model, the profile chosen ─────────────────

/** Ottimizza's preset of variants (gltfpack, `files-browser.ts`
 *  OPTIMIZE_PRESETS) for the profile a finding asks: the floor mobile webXR →
 *  «mobile» (use mobile_ar); webXR for Heriverse / ATON → «heriverse» (uses
 *  heriverse, aton); webXR for the web → «web». */
export function presetForProfile(profile: string, platform = "heriverse"): string {
  if (profile === "mobile_webxr") return "mobile";
  if (profile === "webxr") return platform === "web" ? "web" : "heriverse";
  if (profile === "desktop_realtime") return "experience";
  return "web";
}

/** What Ottimizza opens for «Prepara», in this order: the master's file when
 *  Ottimizza reads it (a glTF / OBJ: gltfpack's variants, the version
 *  registered as derived from it); else a version on this computer that it
 *  reads (the one loaded now: the new version is derived from it, same asset —
 *  s3Dgraphy's `add_version` takes a lodK as the source of a lodK+1); else the
 *  master inside a .blend (EM Tools' «Preparato per un uso» on that .blend).
 *  Else nothing, and why. `path` of each is the resolver's (the Archive's) —
 *  never guessed. */
export function prepareSource(master: { url: string; path: string } | null, versions: readonly { url: string; path: string }[]):
  { kind: "files" | "blend" | "none"; path: string; block: string; why: string; from: "master" | "version" | "" } {
  const ext = (p: string) => (/\.([a-z0-9]+)$/i.exec(p.split("#")[0])?.[1] ?? "").toLowerCase();
  const reads = (p: string) => !!p && ["glb", "gltf", "obj"].includes(ext(p));
  if (master && !master.url.startsWith("blend://") && reads(master.path))
    return { kind: "files", path: master.path, block: "", why: "", from: "master" };
  for (const v of versions) if (reads(v.path)) return { kind: "files", path: v.path, block: "", why: "", from: "version" };
  if (master?.url.startsWith("blend://") && master.path && ext(master.path) === "blend") {
    const block = decodeURIComponent((master.url.split("#")[1] ?? "").split("/").pop() ?? "");
    return { kind: "blend", path: master.path, block, why: "", from: "master" };
  }
  return { kind: "none", path: "", block: "", why: master?.url ? (master.path ? "format" : "absent") : "nomaster", from: "" };
}

// ── «Componi un .blend dal grafo» ───────────────────────────────────────────

export const WORK_PROFILES = ["modelling", "render_offline", "print_3d", "archive"] as const;

export interface ComposeItem {
  model_id: string; name: string; kind: "model" | "tileset"; container: string; epochs: string[];
  entry: { id: string; level?: string; lod_level?: string; master?: boolean; url: string; checksum?: string; size_bytes?: number | null };
  reason?: string;
  source: { how: "import" | "link" | "append" | "fetch" | "missing"; file: string; block: string; block_type: string;
            fetch: { sha256: string; to: string }[]; state: string; say_it: string };
  tags: Record<string, unknown>;
  made: { by: string[]; orcid: string; at: string; tool: string; how: string };
}
export interface ComposeGraphPlan {
  profile: string; ok: boolean; how: string; items: ComposeItem[]; fetch: { sha256: string; to: string }[];
  missing: { model_id: string; name: string; say_it: string; url?: string }[]; say_it: string; go: string; in_room: boolean;
}

/** The plan in numbers, by where each object comes from. */
export function composeCounts(p: ComposeGraphPlan | null | undefined): Record<string, number> {
  const out: Record<string, number> = { import: 0, link: 0, append: 0, fetch: 0, tileset: 0, missing: p?.missing.length ?? 0 };
  for (const i of p?.items ?? []) { out[i.source.how] = (out[i.source.how] ?? 0) + 1; if (i.kind === "tileset") out.tileset++; }
  return out;
}

// ── «Controlla col grafo»: the before/after, «Aggiorna» ─────────────────────

export interface VersionView { id: string; name: string; level: string; checksum: string; made: Record<string, unknown>; made_say: string }
export interface BeforeAfter {
  name: string; state: "aligned" | "newer" | "revised" | "unknown"; here: VersionView | null; latest: VersionView | null;
  action: { kind?: string; resource_id?: string }; say_it: string;
}

/** The rows «Aggiorna» adds to the check's «Applica»: one per object whose
 *  scene version is not the last registered, its target resource and — when
 *  the Archive knows it — the file on this computer (EM Tools would find it
 *  too: it is said to save it the search). Unticked: the person ticks. */
export function updateRows(ba: readonly BeforeAfter[], pathOf: (id: string) => string = () => ""): {
  key: string; kind: "object"; name: string; object: string; state: string; sign: string; why: string; notes: string[];
  actions: string[]; action: string; tick: boolean; resource_id: string; file: string; level: string }[] {
  return ba.filter((r) => r.action?.kind === "update" && r.action.resource_id).map((r) => ({
    key: `update:${r.name}`, kind: "object" as const, name: r.name, object: r.name, state: r.state,
    sign: r.state === "revised" ? "↻" : "⬆", why: r.say_it, notes: [r.here?.made_say ?? "", r.latest?.made_say ?? ""].filter(Boolean),
    actions: ["leave", "update_version"], action: "update_version", tick: false,
    resource_id: String(r.action.resource_id), file: pathOf(String(r.action.resource_id)), level: r.latest?.level ?? "",
  }));
}

// ── the tileset as the level «Intero» of a container ────────────────────────

export interface WholeDelta {
  nodes_added: { id: string; [k: string]: unknown }[];
  edges_added: { id: string; source: string; target: string; edge_type: string; [k: string]: unknown }[];
  edges_removed: string[]; nodes_removed: string[];
}
export interface WholeStore {
  batch(fn: () => void): void;
  node(id: string): unknown;
  addNode(n: Record<string, unknown>): unknown;
  deleteNode(id: string): unknown;
  hasEdge(id: string): boolean;
  deleteEdge(id: string): unknown;
  addEdge(source: string, target: string, type: string, attributes?: Record<string, unknown>, wantId?: string): unknown;
}

/** The delta of `register_tileset_whole` applied in ONE undo step: the edges
 *  the old hats lose, the nodes that go (an RM left with nothing), then what
 *  is added; an edge already here is not doubled, one whose ends are missing is
 *  skipped and said. */
export function applyWholeDelta(st: WholeStore, d: WholeDelta): { added: number; removed: number; skipped: string[] } {
  const out = { added: 0, removed: 0, skipped: [] as string[] };
  st.batch(() => {
    for (const id of d.edges_removed ?? []) if (st.hasEdge(id)) { st.deleteEdge(id); out.removed++; }
    for (const id of d.nodes_removed ?? []) if (st.node(id)) { st.deleteNode(id); out.removed++; }
    for (const n of d.nodes_added ?? []) if (!st.node(n.id)) { st.addNode(JSON.parse(JSON.stringify(n))); out.added++; }
    for (const e of d.edges_added ?? []) {
      if (st.hasEdge(e.id)) continue;
      if (!st.node(e.source) || !st.node(e.target)) { out.skipped.push(e.id); continue; }
      st.addEdge(e.source, e.target, e.edge_type, undefined, e.id);
      out.added++;
    }
  });
  return out;
}

/** The documents that reach a resource or its asset with `has_linked_resource`
 *  (the graph's edges, read to SAY it: who decides is s3Dgraphy). */
export function documentsReaching(g: { nodes: { id: string; node_type?: string; name?: unknown }[]; edges: { source: string; target: string; edge_type?: string }[] },
                                  ids: readonly string[]): { id: string; name: string }[] {
  const want = new Set(ids);
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const out = new Map<string, string>();
  for (const e of g.edges) {
    if (e.edge_type !== "has_linked_resource" || !want.has(e.target)) continue;
    const n = byId.get(e.source);
    if (n?.node_type === "document") out.set(n.id, String(n.name ?? n.id));
  }
  return [...out].map(([id, name]) => ({ id, name }));
}
