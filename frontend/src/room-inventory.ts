/**
 * MICRO-LA-BARRA-E-LE-STANZE · P2 — the RESOURCES of a graph that is going into
 * a room, in the five groups a person decides on:
 *
 *   on_disk   found on this computer: upload (the default), leave as a
 *             reference, or skip — per group, per lot, or one by one;
 *   in_store  already in the room's storage (HEAD by sha256): nothing to send,
 *             the resource only becomes hosted;
 *   elsewhere already on the node but AT HOME IN ANOTHER ROOM (HEAD answers
 *             `X-EM-Home-Room`): hosted here as it is (the default), moved here
 *             — «Move here», confirmed after the rooms that cite it are listed
 *             — or left a reference to the room it lives in;
 *   external  a reference that is not a file here (NAS, URL, a .blend's
 *             datablock): counted, left;
 *   missing   a path nobody can find: counted, named, left.
 *
 * THE RULES ARE THE ENGINE'S (MICRO-PORTA-IN-STANZA-DAL-MOTORE, 16 Oct 2026).
 * Which files a graph cites, where a relative path is looked for, what the node
 * already has, which photos are one session (L1), what goes up and how a
 * resource becomes hosted: `s3dgraphy.room_import`, the one implementation of
 * the gesture for its three doors (the command, EM Tools, EMStudio through the
 * bridge's `/room-import`). Until that day this module had them in TypeScript
 * (`candidatesOf`, `buildInventory`, `locatorKind`, `resolveLocal`,
 * `sessionLots`) and they had drifted from EM Tools' — different files seen,
 * different folders searched. What stays here is the DIALOG's half: the
 * engine's plan read into the five groups (the engine says `found`/`stored`
 * where the dialog says «on this computer»/«already in the storage»), the
 * person's choices, and those choices handed back in the engine's terms.
 *
 * PURE: no fetch, no DOM, no store. `check-room-inventory.mjs` puts real plans
 * to it; the live half is `check-interactions.mjs TP2.live` and the bridge's
 * `check-room-import-bridge.mjs`.
 */

import { normDigest } from "./store-url";

export type InvGroup = "on_disk" | "in_store" | "elsewhere" | "external" | "missing";
/** `host` — F1, a file at home in another room hosted HERE as it is, its home
 *  unchanged: the engine's default (`elsewhere="host"`) */
export type InvChoice = "upload" | "reference" | "skip" | "move" | "host";
export const INV_GROUPS: InvGroup[] = ["on_disk", "in_store", "elsewhere", "external", "missing"];

/** The engine's group → the dialog's */
export const ENGINE_GROUP: Record<string, InvGroup> = {
  found: "on_disk", stored: "in_store", elsewhere: "elsewhere", external: "external", missing: "missing",
};

/** One row of the engine's plan, as the bridge hands it (`_RI_ROW_KEYS`). */
export interface PlanRow {
  id: string;
  graph_id?: string;
  name?: string;
  locator?: string;
  group: string;
  choice?: string;
  size?: number;
  sha256?: string;
  home?: string;
  note?: string;
  path?: string;
  media_type?: string;
  /** a tileset folder (`packaging: directory`): every file of it goes up */
  tree?: string;
  batch_id?: string;
  batch_name?: string;
  batch_proposed?: boolean;
}

/** A lot of the plan: a session of photos the engine PROPOSES (L1), or the
 *  outputs of an acquisition the graph already declares (`declared`). */
export interface PlanLot {
  key: string; name: string; ids: string[];
  camera?: string; from?: string; to?: string; graph_id?: string;
  confirmed?: boolean; declared?: boolean;
}

export interface EnginePlan {
  rows: PlanRow[];
  lots?: PlanLot[];
  where?: { created?: boolean; resumed?: boolean; seedable?: boolean; note?: string; born_with?: string[] };
  summary?: Record<string, unknown>;
}

export interface InvItem {
  id: string;
  graphId: string;
  name: string;
  locator: string;
  group: InvGroup;
  choice: InvChoice;
  size: number | null;
  sha256: string | null;
  path: string | null;
  /** F1 · the room the bytes live in, when the node said */
  home: string | null;
  /** a folder the engine sends file by file (a tileset) */
  tree: boolean;
  /** a folder that is NOT a tileset, or a row whose choice the engine fixes:
   *  nothing to decide */
  fixed: boolean;
  why?: string;
  lotKey: string | null;
  lotName: string | null;
}

export interface Inventory {
  items: InvItem[];
  groups: Record<InvGroup, { count: number; bytes: number }>;
  lots: InvLot[];
  /** F1 · what a file at home elsewhere becomes when it is not moved: `host`
   *  (the engine's default) or `reference` — ONE answer for the group, as the
   *  engine takes it (`elsewhere=`); «Move here» is per file */
  elsewhereMode: "host" | "reference";
}

/** A lot: the files of one `dtc_acquisition` the graph already declares
 *  (confirmed: the graph said so), or a PROPOSED photo session (L1) that only
 *  becomes one acquisition when the person confirms it. */
export interface InvLot {
  key: string; name: string; ids: string[]; bytes: number; acquisition: string | null;
  proposed: boolean; confirmed: boolean;
  camera?: string; from?: string; to?: string;
}

// the one normalization of a digest (MICRO-STORE-PERCORSO)
export { normDigest };

const leafOf = (p: string): string => p.replace(/^.*[\\/]/, "");

/**
 * The engine's plan as the dialog's inventory. The default choices are the
 * engine's: what is on the disk goes up (a tileset folder too, file by file; a
 * folder that is not one stays a reference — said, not decided here), a file at
 * home in another room is hosted here as it is, and the rest has nothing to send.
 */
export function inventoryFromPlan(plan: EnginePlan): Inventory {
  const items: InvItem[] = (plan.rows ?? []).map((r) => {
    const group = ENGINE_GROUP[r.group] ?? "missing";
    const engineChoice = String(r.choice ?? "");
    // a folder that is not a tileset, or a tileset the engine sends as its
    // .3tz (`pack_tilesets`): the engine keeps it a reference, said in its note
    const folder = group === "on_disk" && engineChoice === "reference";
    const choice: InvChoice = group === "on_disk"
      ? (engineChoice === "reference" || engineChoice === "skip" ? engineChoice : "upload")
      : group === "elsewhere" ? "host" : "skip";
    const locator = String(r.locator ?? "");
    return {
      id: r.id, graphId: String(r.graph_id ?? ""), name: String(r.name ?? "") || leafOf(locator),
      locator, group, choice, size: typeof r.size === "number" ? r.size : null,
      sha256: normDigest(r.sha256 ?? null), path: r.path ?? null, home: r.home ?? null,
      tree: !!r.tree, fixed: folder, ...(r.note ? { why: r.note } : {}),
      lotKey: r.batch_id ?? null, lotName: r.batch_name ?? null,
    };
  });
  const groups = Object.fromEntries(INV_GROUPS.map((g) => [g, { count: 0, bytes: 0 }])) as Inventory["groups"];
  for (const it of items) {
    groups[it.group].count += 1;
    groups[it.group].bytes += it.size ?? 0;
  }
  const lots: InvLot[] = (plan.lots ?? []).map((l) => {
    const ids = l.ids.filter((id) => items.some((i) => i.id === id));
    for (const id of ids) {
      const it = items.find((i) => i.id === id)!;
      it.lotKey = l.key; it.lotName = l.name;
    }
    return {
      key: l.key, name: l.name, ids,
      bytes: ids.reduce((s, id) => s + (items.find((i) => i.id === id)?.size ?? 0), 0),
      acquisition: l.declared ? l.key : null, proposed: !l.declared, confirmed: !!l.declared,
      ...(l.camera ? { camera: l.camera } : {}), ...(l.from ? { from: l.from } : {}), ...(l.to ? { to: l.to } : {}),
    };
  });
  return { items, groups, lots, elsewhereMode: "host" };
}

/** Set a choice for a whole group, a lot, or one item. Only `on_disk` items
 *  can be uploaded, referenced or skipped (a folder that is not a tileset
 *  stays a reference); `elsewhere` items are hosted here, moved here, or left
 *  a reference — the last two for the whole group, «Move here» also per file;
 *  the others have nothing to decide. */
export function choose(inv: Inventory, which: { group?: InvGroup; lot?: string; id?: string }, choice: InvChoice): void {
  if (which.group === "elsewhere" && (choice === "host" || choice === "reference")) inv.elsewhereMode = choice;
  for (const it of inv.items) {
    const fits = it.group === "on_disk" ? !it.fixed && (choice === "upload" || choice === "reference" || choice === "skip")
      : it.group === "elsewhere" ? choice === "move" || choice === inv.elsewhereMode
      : false;
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

/** The person's choices in the ENGINE's terms (`POST /room-import`, step
 *  `execute`): every decidable file's choice by id (`per_item`), the files the
 *  person said «Move here» for and the node let move (`moved`, after the
 *  confirmation), what the others at home elsewhere become (`elsewhere`), and
 *  the keys of the proposed lots the person confirmed. */
export function engineChoices(inv: Inventory, moved: string[] = []): {
  per_item: Record<string, string>; move: string[]; elsewhere: "host" | "reference"; lots: string[];
} {
  const perItem: Record<string, string> = {};
  for (const it of inv.items) {
    if (it.group === "on_disk" && !it.fixed) perItem[it.id] = it.choice;
  }
  return { per_item: perItem, move: [...moved], elsewhere: inv.elsewhereMode,
           lots: inv.lots.filter((l) => l.proposed && l.confirmed).map((l) => l.key) };
}

/** The engine's report, for the closing sentence: uploaded N (bytes), already
 *  there, moved here, references, missing, failed. */
export interface EngineReport {
  uploaded?: { files?: number; bytes?: number };
  already?: { files?: number };
  references?: number;
  plan?: { missing?: number };
  failed?: string[];
  rewritten?: { moved_here?: number };
  seeded?: { sent?: number; applied?: number; not_news?: number; refused?: number };
  link?: string;
  sentence?: string;
}

export function reportOf(rep: EngineReport): {
  uploaded: number; bytes: number; already: number; moved: number; references: number; missing: number;
  failed: number; seeded: number;
} {
  return {
    uploaded: rep.uploaded?.files ?? 0, bytes: rep.uploaded?.bytes ?? 0, already: rep.already?.files ?? 0,
    moved: rep.rewritten?.moved_here ?? 0, references: rep.references ?? 0, missing: rep.plan?.missing ?? 0,
    failed: (rep.failed ?? []).length, seeded: rep.seeded?.applied ?? 0,
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
