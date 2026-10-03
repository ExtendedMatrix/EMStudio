/**
 * MICRO-LA-BARRA-E-LE-STANZE · P2 — the RESOURCES of a graph that is going into
 * a room, in the four groups a person decides on:
 *
 *   on_disk   found on this computer: upload (the default), leave as a
 *             reference, or skip — per group or one by one;
 *   in_store  already in the room's storage (HEAD by sha256): nothing to send,
 *             the node only becomes store-backed;
 *   external  a reference that is not a file here (NAS, URL): counted, left;
 *   missing   a path nobody can find: counted, named, left.
 *
 * «Everything goes up, raw photos too» (E.D., 3 Oct): the storage is also the
 * backup. Raw photos travel as a LOT — one row, one choice — and land as one
 * `dtc_acquisition` in the documentation, never as hundreds of rows to tick.
 *
 * PURE: no fetch, no DOM, no store. The caller probes (the bridge for a disk,
 * HEAD for the store) and hands the answers in; `check-room-inventory.mjs`
 * puts real values to it. The rule that keeps the origin: a resource that goes
 * up keeps its disk path as a second address (`addresses.ts`, the same digest),
 * so «where did this come from» survives the move.
 */

import type { EmEdge, EmNode } from "./types";

export type InvGroup = "on_disk" | "in_store" | "external" | "missing";
export type InvChoice = "upload" | "reference" | "skip";
export const INV_GROUPS: InvGroup[] = ["on_disk", "in_store", "external", "missing"];

/** A file the graph cites: a `resource` that carries its own locator (the
 *  implicit one-file kind), or one `resource_file` of a set. */
export interface InvCandidate {
  id: string;
  graphId: string;
  name: string;
  locator: string;
  checksum: string | null;
  mediaType: string | null;
  /** the lot it travels in: an acquisition id, or `dir:<folder>` for raw photos */
  lotKey: string | null;
  lotName: string | null;
  /** an acquisition that already exists in the graph (else one is made) */
  lotAcquisition: string | null;
}

export interface InvProbe {
  group: InvGroup;
  size: number | null;
  sha256: string | null;
  /** the absolute path the bridge answered for (on_disk / in_store from disk) */
  path?: string | null;
  why?: string;
}

export interface InvItem extends InvCandidate, InvProbe {
  choice: InvChoice;
}

export interface Inventory {
  items: InvItem[];
  groups: Record<InvGroup, { count: number; bytes: number }>;
  lots: { key: string; name: string; ids: string[]; bytes: number; acquisition: string | null }[];
}

const PHOTO_EXT = /\.(jpe?g|tiff?|png|dng|cr2|cr3|nef|arw|orf|rw2|heic|raf)$/i;
/** a folder with at least this many photos is a photographic LOT */
export const LOT_MIN_PHOTOS = 10;

/** Where a locator points, before anybody asks. */
export function locatorKind(locator: string): "store" | "external" | "disk" | "none" {
  const loc = (locator || "").trim();
  if (!loc) return "none";
  if (/\/v1\/rooms\/[^/]+\/asset\//.test(loc) || /^s3:\/\//i.test(loc)) return "store";
  if (/^(https?|ftp|sftp|smb|afp|nfs|webdavs?|davs?):\/\//i.test(loc)) return "external";
  if (/^\\\\/.test(loc) || /^\/\/[^/]/.test(loc)) return "external";     // UNC: a share
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(loc) && !/^file:\/\//i.test(loc)) return "external";
  return "disk";
}

/** `file:///a/b` → `/a/b`; a relative path → under `baseDir` (the em.json's folder). */
export function resolveLocal(locator: string, baseDir: string | null): string {
  let p = locator.trim();
  if (/^file:\/\//i.test(p)) p = decodeURIComponent(p.replace(/^file:\/\//i, ""));
  if (/^(\/|[A-Za-z]:[\\/]|~)/.test(p) || !baseDir) return p;
  return `${baseDir.replace(/[\\/]+$/, "")}/${p.replace(/^\.\//, "")}`;
}

/** The sha256 a store URL names, if it names one. */
export function digestInLocator(locator: string): string | null {
  const m = /\/asset\/(?:sha256(?::|%3A))?([0-9a-f]{64})/i.exec(locator);
  return m ? `sha256:${m[1].toLowerCase()}` : null;
}

export function normDigest(d: string | null | undefined): string | null {
  const s = String(d ?? "").trim().toLowerCase();
  if (!s) return null;
  const hex = s.replace(/^sha256:/, "");
  return /^[0-9a-f]{64}$/.test(hex) ? `sha256:${hex}` : null;
}

const folderOf = (p: string): string => p.replace(/[\\/][^\\/]*$/, "");
const leafOf = (p: string): string => p.replace(/^.*[\\/]/, "");

/**
 * The files a set of graphs cites. A resource WITH `has_file` children is the
 * set and is not itself a file: its files are. A file reached by
 * `dtc_had_output` from an acquisition travels in that acquisition's lot; raw
 * photos with no acquisition are grouped by their folder.
 */
export function candidatesOf(
  graphs: Array<{ id: string; nodes: EmNode[]; edges: EmEdge[] }>,
): InvCandidate[] {
  const out: InvCandidate[] = [];
  const seen = new Set<string>();
  for (const g of graphs) {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const hasFiles = new Set(g.edges.filter((e) => e.edge_type === "has_file").map((e) => String(e.source)));
    const acqOf = new Map<string, string>();
    for (const e of g.edges) {
      if (e.edge_type !== "dtc_had_output") continue;
      const src = byId.get(String(e.source));
      if (src?.node_type === "dtc_acquisition") acqOf.set(String(e.target), src.id);
    }
    for (const n of g.nodes) {
      if (n.node_type !== "resource" && n.node_type !== "resource_file") continue;
      if (n.node_type === "resource" && hasFiles.has(n.id)) continue;
      if (seen.has(n.id)) continue;
      const data = (n.data ?? {}) as Record<string, unknown>;
      const locator = String(data.url ?? data.path ?? "").trim();
      if (!locator) continue;
      seen.add(n.id);
      const acq = acqOf.get(n.id) ?? null;
      out.push({
        id: n.id, graphId: g.id, name: String(n.name ?? "") || leafOf(locator), locator,
        checksum: normDigest(data.checksum as string),
        mediaType: typeof data.media_type === "string" ? data.media_type : null,
        lotKey: acq, lotName: acq ? String(byId.get(acq)?.name ?? acq) : null,
        lotAcquisition: acq,
      });
    }
  }
  // raw photos without an acquisition: a folder of at least LOT_MIN_PHOTOS
  const perFolder = new Map<string, InvCandidate[]>();
  for (const c of out) {
    if (c.lotKey || locatorKind(c.locator) !== "disk" || !PHOTO_EXT.test(c.locator)) continue;
    const dir = folderOf(c.locator);
    perFolder.set(dir, [...(perFolder.get(dir) ?? []), c]);
  }
  for (const [dir, members] of perFolder) {
    if (members.length < LOT_MIN_PHOTOS) continue;
    for (const c of members) { c.lotKey = `dir:${dir}`; c.lotName = leafOf(dir) || dir; }
  }
  return out;
}

/** The inventory: candidates + what the probes found. The default choice is
 *  `upload` for what is on the disk and `skip` for everything else (there is
 *  nothing to send). */
export function buildInventory(cands: InvCandidate[], probes: Map<string, InvProbe>): Inventory {
  const items: InvItem[] = cands.map((c) => {
    const p = probes.get(c.id) ?? { group: "missing" as InvGroup, size: null, sha256: null, why: "not probed" };
    return { ...c, ...p, choice: p.group === "on_disk" ? "upload" : "skip" };
  });
  const groups = Object.fromEntries(INV_GROUPS.map((g) => [g, { count: 0, bytes: 0 }])) as Inventory["groups"];
  for (const it of items) {
    groups[it.group].count += 1;
    groups[it.group].bytes += it.size ?? 0;
  }
  const lots = new Map<string, Inventory["lots"][number]>();
  for (const it of items) {
    if (!it.lotKey) continue;
    const lot = lots.get(it.lotKey) ?? { key: it.lotKey, name: it.lotName ?? it.lotKey, ids: [], bytes: 0,
                                          acquisition: it.lotAcquisition };
    lot.ids.push(it.id);
    lot.bytes += it.size ?? 0;
    lots.set(it.lotKey, lot);
  }
  return { items, groups, lots: [...lots.values()] };
}

/** Set a choice for a whole group, a lot, or one item; only `on_disk` items
 *  can be uploaded or referenced — the others have nothing to send. */
export function choose(inv: Inventory, which: { group?: InvGroup; lot?: string; id?: string }, choice: InvChoice): void {
  for (const it of inv.items) {
    if (it.group !== "on_disk") continue;
    if ((which.group && it.group === which.group) || (which.lot && it.lotKey === which.lot)
        || (which.id && it.id === which.id)) it.choice = choice;
  }
}

/** What the person is about to send: count and bytes of the `upload` choices. */
export function toUpload(inv: Inventory): { count: number; bytes: number } {
  const up = inv.items.filter((i) => i.group === "on_disk" && i.choice === "upload");
  return { count: up.length, bytes: up.reduce((s, i) => s + (i.size ?? 0), 0) };
}

export interface InvOutcome { id: string; ok: boolean; sent: boolean; bytes: number; why?: string }

/** The closing report: uploaded N (bytes), references M, missing K. A file
 *  already in the store is counted as «already there», not as uploaded. */
export function inventoryReport(inv: Inventory, outcomes: InvOutcome[]): {
  uploaded: number; bytes: number; already: number; references: number; missing: number; failed: number;
} {
  const sent = outcomes.filter((o) => o.ok && o.sent);
  const already = outcomes.filter((o) => o.ok && !o.sent).length
    + inv.items.filter((i) => i.group === "in_store").length;
  const references = inv.items.filter((i) => i.group === "external"
    || (i.group === "on_disk" && i.choice === "reference")).length;
  return {
    uploaded: sent.length, bytes: sent.reduce((s, o) => s + o.bytes, 0), already,
    references, missing: inv.items.filter((i) => i.group === "missing").length,
    failed: outcomes.filter((o) => !o.ok).length,
  };
}

/** 1 234 567 890 → «1.15 GB» */
export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}
