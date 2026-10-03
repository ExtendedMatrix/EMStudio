/**
 * MICRO-LA-BARRA-E-LE-STANZE · P2 — the RESOURCES of a graph that is going into
 * a room, in the four groups a person decides on:
 *
 *   on_disk   found on this computer: upload (the default), leave as a
 *             reference, or skip — per group or one by one;
 *   in_store  already in the room's storage (HEAD by sha256): nothing to send,
 *             the node only becomes store-backed;
 *   elsewhere already in the node's storage but AT HOME IN ANOTHER ROOM (HEAD
 *             answers `X-EM-Home-Room`): a file lives in ONE room (F1, E.D.
 *             3 Oct evening), so the proposal is «Move here» — confirmed after
 *             the rooms that cite it are listed — or leave it a reference;
 *   external  a reference that is not a file here (NAS, URL): counted, left;
 *   missing   a path nobody can find: counted, named, left.
 *
 * «Everything goes up, raw photos too» (E.D., 3 Oct): the storage is also the
 * backup. Raw photos travel as a LOT — one row, one choice — and land as one
 * `dtc_acquisition` in the documentation, never as hundreds of rows to tick.
 *
 * THE LOT RULE (L1, E.D. 3 Oct evening, replacing «≥ 10 images per folder»,
 * which made Templu Mare's DosCo a lot): a file named like an EM document
 * (`D.01`, `D.07.03`, `D.11 Zenitale` — `isEmDocumentName`) stays a document,
 * nothing inside a DosCo is ever a lot, and a lot is PROPOSED only for photos
 * of one session: same camera (EXIF make + model + body serial) and EXIF times
 * no more than `SESSION_GAP_SECONDS` apart. A proposal the person confirms —
 * never applied by itself (`Inventory.lots[].confirmed`).
 *
 * PURE: no fetch, no DOM, no store. The caller probes (the bridge for a disk,
 * HEAD for the store) and hands the answers in; `check-room-inventory.mjs`
 * puts real values to it. The rule that keeps the origin: a resource that goes
 * up keeps its disk path as a second address (`addresses.ts`, the same digest),
 * so «where did this come from» survives the move.
 */

import type { EmEdge, EmNode } from "./types";

export type InvGroup = "on_disk" | "in_store" | "elsewhere" | "external" | "missing";
export type InvChoice = "upload" | "reference" | "skip" | "move";
export const INV_GROUPS: InvGroup[] = ["on_disk", "in_store", "elsewhere", "external", "missing"];

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

/** What the bridge read from a photo's EXIF: who took it, and when. */
export interface PhotoExif {
  /** make + model (+ body serial): two bodies of one model are two cameras */
  camera: string | null;
  /** EXIF `DateTimeOriginal` (else `DateTime`), as written: `2024:05:12 10:22:33` */
  takenAt: string | null;
}

export interface InvProbe {
  group: InvGroup;
  size: number | null;
  sha256: string | null;
  /** the absolute path the bridge answered for (on_disk / in_store from disk) */
  path?: string | null;
  /** F1 · the room the bytes live in, when the node said (`X-EM-Home-Room`) */
  home?: string | null;
  /** L1 · the photo's EXIF, when the bridge could read it */
  exif?: PhotoExif | null;
  why?: string;
}

export interface InvItem extends InvCandidate, InvProbe {
  choice: InvChoice;
}

export interface Inventory {
  items: InvItem[];
  groups: Record<InvGroup, { count: number; bytes: number }>;
  lots: InvLot[];
}

/** A lot: the files of one `dtc_acquisition` the graph already declares
 *  (confirmed: the graph said so), or a PROPOSED photo session (L1) that only
 *  becomes one acquisition when the person confirms it. */
export interface InvLot {
  key: string; name: string; ids: string[]; bytes: number; acquisition: string | null;
  proposed: boolean; confirmed: boolean;
  camera?: string; from?: string; to?: string;
}

const PHOTO_EXT = /\.(jpe?g|tiff?|png|dng|cr2|cr3|nef|arw|orf|rw2|heic|raf)$/i;
/** L1 · two shots of one camera further apart than this are two sessions.
 *  30 minutes: a battery or card swap, a ladder moved, a drone relaunched stay
 *  in the session; the morning and the afternoon, or two days, do not. */
export const SESSION_GAP_SECONDS = 30 * 60;
/** L1 · fewer photos than this are files, not a lot worth proposing */
export const SESSION_MIN_PHOTOS = 5;

/** L1 · a file named like an EM document — `D.01`, `D.1`, `D.12.jpg`,
 *  `D.07.03.jpg`, `D.11 Zenitale.png` — the prefix s3Dgraphy's DosCo scanner
 *  reads (`fs_backend._EM_ID_PREFIX`), then the end, an extension, a space, `_`
 *  or `-`. A document stays a document: never a lot. */
export function isEmDocumentName(leaf: string): boolean {
  return /^D\.\d+(?:\.\d+)?(?=$|[\s._-])/.test(String(leaf ?? "").trim());
}

/** L1 · is this path inside a DosCo — a declared DosCo folder, or a folder
 *  named DosCo on the way? The DosCo is documentation: never a lot. */
export function inDosco(path: string, doscoDirs: string[] = []): boolean {
  const p = String(path ?? "").replace(/\\/g, "/");
  const segs = p.split("/").slice(0, -1);
  if (segs.some((s) => s.toLowerCase() === "dosco")) return true;
  return doscoDirs.some((d) => {
    const dir = String(d ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    return !!dir && (p === dir || p.startsWith(`${dir}/`));
  });
}

/** `2024:05:12 10:22:33` (EXIF) → seconds, or null. Naive time: one camera's
 *  clock against itself, so the zone does not matter. */
export function exifSeconds(takenAt: string | null | undefined): number | null {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(takenAt ?? "").trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(t) && +m[1] > 1900 ? t / 1000 : null;
}

export interface SessionPhoto { id: string; path: string; exif?: PhotoExif | null }
export interface SessionLot { key: string; name: string; ids: string[]; camera: string; from: string; to: string }

/**
 * L1 · the photo SESSIONS among these files: same camera, EXIF times at most
 * `gapSeconds` apart, at least `minPhotos`. A document-named file, a file in a
 * DosCo, a file that is not a photo, a photo with no camera or no time: never
 * in a session. Pure, and the same cases as EMtools' `inventory.session_lots`.
 */
export function sessionLots(files: SessionPhoto[], opts: {
  doscoDirs?: string[]; gapSeconds?: number; minPhotos?: number;
} = {}): SessionLot[] {
  const gap = opts.gapSeconds ?? SESSION_GAP_SECONDS;
  const min = opts.minPhotos ?? SESSION_MIN_PHOTOS;
  const perCamera = new Map<string, { id: string; t: number; at: string }[]>();
  for (const f of files) {
    const leaf = leafOf(f.path || "");
    if (!PHOTO_EXT.test(leaf) || isEmDocumentName(leaf) || inDosco(f.path, opts.doscoDirs)) continue;
    const camera = String(f.exif?.camera ?? "").trim();
    const t = exifSeconds(f.exif?.takenAt);
    if (!camera || t === null) continue;
    perCamera.set(camera, [...(perCamera.get(camera) ?? []), { id: f.id, t, at: String(f.exif!.takenAt) }]);
  }
  const out: SessionLot[] = [];
  for (const [camera, shots] of perCamera) {
    shots.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    let run: typeof shots = [];
    const close = (): void => {
      if (run.length >= min) {
        const from = run[0].at, to = run[run.length - 1].at;
        out.push({ key: `session:${camera}@${from}`, camera, from, to, ids: run.map((s) => s.id),
          name: `${camera} · ${from.slice(0, 10).replace(/:/g, "-")} ${from.slice(11, 16)}–${to.slice(11, 16)}` });
      }
      run = [];
    };
    for (const s of shots) {
      if (run.length && s.t - run[run.length - 1].t > gap) close();
      run.push(s);
    }
    close();
  }
  return out;
}

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

const leafOf = (p: string): string => p.replace(/^.*[\\/]/, "");

/**
 * The files a set of graphs cites. A resource WITH `has_file` children is the
 * set and is not itself a file: its files are. A file reached by
 * `dtc_had_output` from an acquisition travels in that acquisition's lot.
 * Photo sessions are proposed later, from the EXIF the probe read
 * (`buildInventory` → `sessionLots`): a folder is no longer a lot.
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
  return out;
}

/** The inventory: candidates + what the probes found. The default choice is
 *  `upload` for what is on the disk, the PROPOSAL `move` for what is at home
 *  in another room (nothing moves before the confirmation that lists the rooms
 *  citing it), and `skip` for everything else (there is nothing to send).
 *  Photo sessions (L1) are proposed here from the probes' EXIF, unconfirmed. */
export function buildInventory(cands: InvCandidate[], probes: Map<string, InvProbe>,
                               opts: { doscoDirs?: string[]; gapSeconds?: number; minPhotos?: number } = {}): Inventory {
  const items: InvItem[] = cands.map((c) => {
    const p = probes.get(c.id) ?? { group: "missing" as InvGroup, size: null, sha256: null, why: "not probed" };
    return { ...c, ...p, choice: p.group === "on_disk" ? "upload" : p.group === "elsewhere" ? "move" : "skip" };
  });
  const sessions = sessionLots(items.filter((i) => !i.lotKey && (i.group === "on_disk" || i.group === "in_store"))
    .map((i) => ({ id: i.id, path: i.path || i.locator, exif: i.exif })), opts);
  const proposed = new Map<string, SessionLot>();
  for (const lot of sessions) {
    proposed.set(lot.key, lot);
    for (const id of lot.ids) {
      const it = items.find((i) => i.id === id)!;
      it.lotKey = lot.key; it.lotName = lot.name; it.lotAcquisition = null;
    }
  }
  const groups = Object.fromEntries(INV_GROUPS.map((g) => [g, { count: 0, bytes: 0 }])) as Inventory["groups"];
  for (const it of items) {
    groups[it.group].count += 1;
    groups[it.group].bytes += it.size ?? 0;
  }
  const lots = new Map<string, InvLot>();
  for (const it of items) {
    if (!it.lotKey) continue;
    const session = proposed.get(it.lotKey);
    const lot = lots.get(it.lotKey) ?? { key: it.lotKey, name: it.lotName ?? it.lotKey, ids: [], bytes: 0,
                                          acquisition: it.lotAcquisition,
                                          proposed: !!session, confirmed: !session,
                                          ...(session ? { camera: session.camera, from: session.from, to: session.to } : {}) };
    lot.ids.push(it.id);
    lot.bytes += it.size ?? 0;
    lots.set(it.lotKey, lot);
  }
  return { items, groups, lots: [...lots.values()] };
}

/** Set a choice for a whole group, a lot, or one item. Only `on_disk` items
 *  can be uploaded, referenced or skipped; only `elsewhere` items can be moved
 *  here or left as a reference; the others have nothing to decide. */
export function choose(inv: Inventory, which: { group?: InvGroup; lot?: string; id?: string }, choice: InvChoice): void {
  for (const it of inv.items) {
    const fits = it.group === "on_disk" ? choice !== "move"
      : it.group === "elsewhere" ? choice === "move" || choice === "reference" : false;
    if (!fits) continue;
    if ((which.group && it.group === which.group) || (which.lot && it.lotKey === which.lot)
        || (which.id && it.id === which.id)) it.choice = choice;
  }
}

/** L1 · the person's answer to a proposed lot: yes → one acquisition */
export function confirmLot(inv: Inventory, key: string, yes: boolean): void {
  const lot = inv.lots.find((l) => l.key === key);
  if (lot && lot.proposed) lot.confirmed = yes;
}

/** F1 · the files about to be moved into this room */
export function toMove(inv: Inventory): InvItem[] {
  return inv.items.filter((i) => i.group === "elsewhere" && i.choice === "move");
}

/** F1 · what the node answered about one file (`GET …/asset-home/{ref}`) */
export interface HomeView {
  home: string | null; legacy_homes?: string[]; references?: string[];
  can_move: boolean; why_not?: string;
}

/** F1 · the confirmation, before the yes: which rooms the files leave, which
 *  rooms' graphs will hold a reference, which files cannot move and why. */
export function movePlan(items: InvItem[], views: Map<string, HomeView | { error: string }>): {
  movable: InvItem[]; blocked: { item: InvItem; why: string }[]; leave: string[]; references: string[];
} {
  const movable: InvItem[] = [];
  const blocked: { item: InvItem; why: string }[] = [];
  const leave = new Set<string>();
  const refs = new Set<string>();
  for (const it of items) {
    const v = views.get(it.id);
    if (!v || "error" in v) { blocked.push({ item: it, why: v && "error" in v ? v.error : "not asked" }); continue; }
    if (!v.can_move) { blocked.push({ item: it, why: v.why_not || "not allowed" }); continue; }
    movable.push(it);
    for (const r of v.home ? [v.home] : v.legacy_homes ?? []) leave.add(r);
    for (const r of v.references ?? []) refs.add(r);
  }
  return { movable, blocked, leave: [...leave].sort(), references: [...refs].sort() };
}

/** What the person is about to send: count and bytes of the `upload` choices. */
export function toUpload(inv: Inventory): { count: number; bytes: number } {
  const up = inv.items.filter((i) => i.group === "on_disk" && i.choice === "upload");
  return { count: up.length, bytes: up.reduce((s, i) => s + (i.size ?? 0), 0) };
}

export interface InvOutcome {
  id: string; ok: boolean; sent: boolean; bytes: number; why?: string;
  /** F1 · moved here by «Move here»: no byte travelled */
  moved?: boolean;
  /** F1 · where the bytes live after the gesture, when the node said */
  home?: string | null;
}

/** The closing report: uploaded N (bytes), references M, missing K. A file
 *  already in the store is counted as «already there», not as uploaded. */
export function inventoryReport(inv: Inventory, outcomes: InvOutcome[]): {
  uploaded: number; bytes: number; already: number; moved: number; references: number; missing: number; failed: number;
} {
  const sent = outcomes.filter((o) => o.ok && o.sent);
  const moved = outcomes.filter((o) => o.ok && o.moved).length;
  const already = outcomes.filter((o) => o.ok && !o.sent && !o.moved).length
    + inv.items.filter((i) => i.group === "in_store").length;
  const references = inv.items.filter((i) => i.group === "external"
    || ((i.group === "on_disk" || i.group === "elsewhere") && i.choice === "reference")
    || (i.group === "elsewhere" && i.choice === "move" && !outcomes.some((o) => o.id === i.id && o.ok && o.moved))).length;
  return {
    uploaded: sent.length, bytes: sent.reduce((s, o) => s + o.bytes, 0), already, moved,
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
