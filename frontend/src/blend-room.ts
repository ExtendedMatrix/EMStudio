/**
 * MICRO-BLEND-OFFICINA-2 · the .blend in the room, the EMStudio half of
 * s3Dgraphy's `resources.blend_room` (E.D.'s answers of 31 Oct 2026, D5–D8):
 * the LEASE («aperto da ‹persona› su ‹computer› dalle ‹ora›», 15 min without a
 * sign, released by hand with a confirmation), the level of a version saved by
 * hand (`manual-YYYY-MM-DD`, `-2`, `-3`), the selection between Blender and
 * EMStudio with no loop, the graph ids an object of a .blend stands for, the
 * working .blend composed for a profile (its default name) and the graph DELTA
 * a background Blender brings back, applied in one undo step. Mirrors of the
 * Python, same cases: `scripts/check-blend-room.mjs` runs them against
 * s3Dgraphy's answers. No DOM here.
 */

import * as paths from "./paths";

// ── D7 · D8 · the lease ─────────────────────────────────────────────────────

export const LEASE_TTL_S = 15 * 60;
export const LEASE_RENEW_S = 60;

export interface Lease {
  key: string; person: string; display?: string; host?: string; client?: string;
  since: number; renewed?: number; connection_id?: string;
}

export function leaseAlive(l: Lease | null | undefined, now = Date.now() / 1000): boolean {
  if (!l) return false;
  return now - Number(l.renewed ?? l.since ?? 0) <= LEASE_TTL_S;
}

const hm = (sec: number): string => {
  const d = new Date(sec * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** «aperto da ‹persona› su ‹computer› dalle ‹ora›» (D7). */
export function leaseLabel(l: Lease | null | undefined, lang: "it" | "en" = "it", clock: (s: number) => string = hm): string {
  if (!l) return "";
  const who = l.display || l.person || "?";
  const at = clock(Number(l.since || 0));
  return lang === "it"
    ? `aperto da ${who}${l.host ? ` su ${l.host}` : ""} dalle ${at}` // ALLOW-IT: s3Dgraphy's blend_room.lease_label, mirrored word for word
    : `open by ${who}${l.host ? ` on ${l.host}` : ""} since ${at}`;
}

export function leaseFor(leases: readonly Lease[] | null | undefined, key: string, now = Date.now() / 1000): Lease | null {
  for (const l of leases ?? []) if (l && l.key === key && leaseAlive(l, now)) return l;
  return null;
}

export type WriteMode = "free" | "mine" | "mine_elsewhere" | "readonly";

/** blend_room.may_write: what one may do with a .blend given its lease. */
export function mayWrite(l: Lease | null | undefined, person: string, host = "", now = Date.now() / 1000): WriteMode {
  if (!leaseAlive(l, now)) return "free";
  if (l!.person === person) return !host || !l!.host || l!.host === host ? "mine" : "mine_elsewhere";
  return "readonly";
}

/** blend_room.may_release: the holder, or who manages the room. */
export function mayRelease(l: Lease | null | undefined, person: string, role = ""): boolean {
  if (!l) return false;
  return l.person === person || role === "owner" || role === "manager";
}

/** blend_room.file_key: the .blend's name in the room — its path relative to
 *  the project's root, posix (the same on every computer). */
export function fileKey(path: string, projectRoot: string): string {
  const p = paths.toPosix(path), r = paths.toPosix(projectRoot);
  if (r && paths.isInside(r, p) && p !== r) return paths.relativeTo(r + "/x", p);
  return paths.basename(p);
}

// ── D6 · a version saved by hand ────────────────────────────────────────────

const MANUAL_RE = /^manual-(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/;

export function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** blend_room.manual_level: `manual-YYYY-MM-DD`, then `-2`, `-3` the same day. */
export function manualLevel(existing: Iterable<string>, day = today()): string {
  const taken = new Set<number>();
  for (const lv of existing) {
    const m = MANUAL_RE.exec(String(lv ?? ""));
    if (m && m[1] === day) taken.add(Number(m[2] ?? 1));
  }
  let n = 1;
  while (taken.has(n)) n++;
  return `manual-${day}${n === 1 ? "" : `-${n}`}`;
}

export const isManual = (level: string): boolean => MANUAL_RE.test(String(level ?? ""));

// ── selection: Blender ↔ EMStudio ───────────────────────────────────────────

export const ID_PROPS = ["em_rm_node_id", "em_version_id", "em_asset_id", "em_resource_id", "em_doc_node_id"] as const;

export interface ObjLike { name: string; kind?: string; props?: Record<string, unknown> }

/** blend_room.ids_of_object: its id properties; a proxy (USV, SF) also by its
 *  NAME, which is its unit's (`nodeNames`: name → id). */
export function idsOfObject(o: ObjLike, nodeNames?: Map<string, string>): string[] {
  const props = o.props ?? {};
  const out: string[] = [];
  for (const k of ID_PROPS) if (props[k]) out.push(String(props[k]));
  if (nodeNames && ["proxy", "usv", "sf"].includes(o.kind ?? "")) {
    const id = nodeNames.get(o.name);
    if (id) out.unshift(id);
  }
  return [...new Set(out)];
}

export function idsOfObjects(objs: readonly ObjLike[], names: Iterable<string>, nodeNames?: Map<string, string>): string[] {
  const want = new Set(names);
  const out: string[] = [];
  for (const o of objs) if (want.has(o.name)) for (const i of idsOfObject(o, nodeNames)) if (!out.includes(i)) out.push(i);
  return out;
}

export function objectsOfIds(objs: readonly ObjLike[], ids: Iterable<string>, nodeNames?: Map<string, string>): string[] {
  const want = new Set(ids);
  const out: string[] = [];
  for (const o of objs) if (idsOfObject(o, nodeNames).some((i) => want.has(i)) && !out.includes(o.name)) out.push(o.name);
  return out;
}

const key = (ids: Iterable<string>): string => [...new Set(ids)].sort().join("\u0001");

/** blend_room.SelectionGate: what was just APPLIED from the other side is not
 *  sent back, the same set is not sent twice in a row; `enabled` = the switch. */
export class SelectionGate {
  enabled: boolean;
  quietS: number;
  private applied: string | null = null;
  private appliedAt = 0;
  private sent: string | null = null;
  constructor(quietS = 1.0, enabled = true) { this.quietS = quietS; this.enabled = enabled; }
  markApplied(ids: Iterable<string>, now = Date.now() / 1000): void {
    this.applied = key(ids); this.appliedAt = now; this.sent = this.applied;
  }
  shouldSend(ids: Iterable<string>, now = Date.now() / 1000): boolean {
    if (!this.enabled) return false;
    const s = key(ids);
    if (this.applied !== null && s === this.applied && now - this.appliedAt <= this.quietS) return false;
    if (s === this.sent) return false;
    this.sent = s;
    return true;
  }
  shouldApply(ids: Iterable<string>): boolean { return this.enabled && key(ids) !== this.sent; }
}

// ── compose a working .blend for a profile ──────────────────────────────────

/** blend_room.PROFILE_KINDS' keys, in the order the dialog shows them. */
export const COMPOSE_PROFILES = ["modelling", "desktop_realtime", "webxr", "mobile_webxr", "preview",
  "render_offline", "archive", "print_3d"] as const;

/** The working .blend's default path: beside the .blend, `<stem>_<profile>.blend`,
 *  `-2`, `-3`… — never over a file that exists. */
export function composeOut(blend: string, profile: string, exists: (p: string) => boolean): string {
  const dir = paths.dirname(blend);
  const stem = paths.basename(blend).replace(/\.blend$/i, "");
  let p = paths.join(dir, `${stem}_${profile}.blend`);
  let n = 2;
  while (exists(p)) p = paths.join(dir, `${stem}_${profile}-${n++}.blend`);
  return p;
}

// ── the delta a background Blender brings back ──────────────────────────────

export interface DeltaNode { id: string; node_type: string; name?: string; description?: string; data?: Record<string, unknown> }
export interface DeltaEdge { id: string; edge_type: string; source: string; target: string; attributes?: Record<string, unknown> }
export interface GraphDelta { nodes_added?: DeltaNode[]; nodes_changed?: DeltaNode[]; edges_added?: DeltaEdge[] }

export interface DeltaStore {
  batch<T>(fn: () => T): T;
  node(id: string): { id: string; data?: Record<string, unknown> } | undefined | null;
  addNode(n: DeltaNode): unknown;
  updateNode(id: string, patch: Record<string, unknown>): void;
  addEdge(source: string, target: string, type: string, attributes?: Record<string, unknown>, wantId?: string): unknown;
  hasEdge?(id: string): boolean;
}

/** The graph changes a background Blender made (export as master, register as
 *  a version / a new resource), applied to the live graph in ONE undo step: a
 *  node already here is updated (its data merged), never doubled; an edge whose
 *  ends are missing is skipped and said. → counts and the skipped. */
export function applyGraphDelta(store: DeltaStore, d: GraphDelta): { added: number; changed: number; edges: number; skipped: string[] } {
  const out = { added: 0, changed: 0, edges: 0, skipped: [] as string[] };
  store.batch(() => {
    for (const n of d.nodes_added ?? []) {
      if (store.node(n.id)) {
        store.updateNode(n.id, { ...(n.name ? { name: n.name } : {}), data: { ...(store.node(n.id)?.data ?? {}), ...(n.data ?? {}) } });
        out.changed++;
      } else { store.addNode(JSON.parse(JSON.stringify(n))); out.added++; }
    }
    for (const n of d.nodes_changed ?? []) {
      const cur = store.node(n.id);
      if (!cur) { out.skipped.push(n.id); continue; }
      store.updateNode(n.id, { ...(n.name ? { name: n.name } : {}), data: { ...(cur.data ?? {}), ...(n.data ?? {}) } });
      out.changed++;
    }
    for (const e of d.edges_added ?? []) {
      if (store.hasEdge?.(e.id)) continue;
      if (!store.node(e.source) || !store.node(e.target)) { out.skipped.push(e.id); continue; }
      store.addEdge(e.source, e.target, e.edge_type, e.attributes, e.id);
      out.edges++;
    }
  });
  return out;
}

// ── the detail recipes on a document (D2) ───────────────────────────────────

export interface DetailRecipe {
  key: string; kind: "tileset" | "crop"; document: string; resource?: string; source: string;
  area: number[]; level?: string | number; resolution?: number; made_by?: string; at?: string;
}

export function recipesOf(data: Record<string, unknown> | null | undefined): DetailRecipe[] {
  const list = (data ?? {})["detail_recipes"];
  return Array.isArray(list) ? list.filter((r): r is DetailRecipe => !!r && typeof r === "object" && !!(r as DetailRecipe).key) : [];
}

/** One line for a recipe: the area's sides, the level or the resolution, who. */
export function recipeLine(r: DetailRecipe): string {
  const a = r.area ?? [];
  const side = (i: number) => (a.length === 6 ? Math.abs(a[i + 3] - a[i]) : 0).toFixed(1);
  const what = r.kind === "crop" ? `${Math.round((r.resolution ?? 0.05) * 100)} cm` : `L ${r.level ?? "densest"}`;
  return `${side(0)} × ${side(1)} m · ${what}${r.made_by ? ` · ${r.made_by}` : ""}`;
}
