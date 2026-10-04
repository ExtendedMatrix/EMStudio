/**
 * P4.3 — the room client: what EMStudio decides when it talks to an StratiGraph Server.
 *
 * A PURE module on purpose. Everything here is "given these messages, what
 * should happen" — the URL to open, whether the local history is still usable,
 * which operations to send, who is in the room. No socket, no DOM: the socket
 * lives in `sync.ts` and the screen in `main.ts`, and this can be exercised with
 * a fake one (`scripts/check-hub.mjs`).
 *
 * Three decisions live here, and the middle one is the reason this step exists.
 *
 * **The wire is already ours.** The relay (P4.2) speaks the ADR-002 messages
 * EMStudio has always spoken, so joining a room needed no new protocol — only a
 * different endpoint and a token.
 *
 * **The rebase.** P4.2 left one honest gap: a client that comes back with local
 * history OLDER than the hub's compaction point could re-send operations about
 * things the hub has already forgotten, and resurrect them. So the hub announces
 * its `gc_watermark`, and a client whose base is older than it does NOT replay:
 * it re-syncs from the snapshot — the state of record — and re-sends whatever of
 * its own work survived, as NEW operations, stamped now. Nothing is dropped
 * quietly, and nothing comes back from the dead.
 *
 * **Awareness, never a lock.** Presence says who is here and what they are
 * looking at. It never prevents an edit — that is the design's choice (P4 §6),
 * and the reducer here has no concept that could be used as one.
 */

import type { EmNode } from "./types";
import { isTextNode, sectionLanguage } from "./crdt";

/** A CRDT operation as the relay understands it (`s3dgraphy.crdt`). */
export interface HubOp {
  op: "add_node" | "update_field" | "remove_node" | "add_edge" | "remove_edge";
  ts?: string;
  author?: string | null;
  [key: string]: unknown;
}

export interface HubMember {
  id: string;
  author: string | null;
  display: string;
  selection: string[];
  joined_at?: string;
}

export interface HubHostInfo {
  tool?: string;
  room?: string;
  connection_id?: string;
  author?: string | null;
  /** P4.3 · the compaction point the hub has passed — the rebase hinge */
  gc_watermark?: string | null;
  accepts_commands?: boolean;
}

/**
 * Build the room URL.
 *
 * The token goes in the query because a browser cannot set headers on a
 * WebSocket handshake — the relay accepts both, and refusing the query would
 * mean no browser could ever join (see `app/ws.py`). `since` is what makes a
 * reconnect a resume instead of a reload.
 */
export function roomUrl(base: string, room: string,
                        opts: { token?: string | null; since?: string | null } = {}): string {
  const trimmed = String(base || "").trim().replace(/\/+$/, "");
  const wsBase = trimmed
    .replace(/^http:\/\//i, "ws://")
    .replace(/^https:\/\//i, "wss://");
  const url = new URL(`${wsBase}/v1/rooms/${encodeURIComponent(room)}/ws`);
  if (opts.token) url.searchParams.set("token", opts.token);
  if (opts.since) url.searchParams.set("since", opts.since);
  return url.toString();
}

// ── the rebase decision ──────────────────────────────────────────────────────

export type RejoinPlan =
  | { kind: "resume"; since: string | null }
  | { kind: "resync"; reason: string; replay: false };

/**
 * Can this client resume from where it stopped, or must it start from the
 * hub's state of record?
 *
 * The rule is one comparison, and the consequence is the whole safety of
 * offline-heavy work: if the client's base is OLDER than the point the hub has
 * compacted, the hub no longer holds what would be needed to reconcile that
 * history — replaying it would re-assert things the room has settled and
 * forgotten. So: re-sync, and re-send the local work as new operations.
 *
 * With no base (a first join) or no watermark (a hub that has never compacted)
 * there is nothing to be older than, and a resume is correct.
 */
export function planRejoin(base: string | null | undefined,
                           gcWatermark: string | null | undefined): RejoinPlan {
  if (!base) return { kind: "resume", since: null };
  if (!gcWatermark) return { kind: "resume", since: base };
  if (base >= gcWatermark) return { kind: "resume", since: base };
  return {
    kind: "resync",
    reason: `local base ${base} is older than the hub's compaction point ` +
            `${gcWatermark}: replaying it could resurrect what the room has ` +
            `already settled`,
    replay: false,
  };
}

/**
 * STEP 4 · the unconfirmed work, re-stamped for a re-send after a re-sync.
 *
 * Pure, and separate from the sending, because the property that matters is a
 * property of the LIST: everything that had not been acknowledged comes back,
 * **including the emptyings**. A re-send that carried only the values would
 * leave a field the person emptied offline looking full again — the room's
 * older document would win a comparison the local intent never got to enter.
 *
 * The clock is refreshed (the room settled everything before its compaction
 * point, so an old stamp would simply lose), but `remove: true` is carried
 * through untouched: it is what makes the operation an ACT rather than an
 * absence, and absence is exactly what the merge is allowed to overrule.
 */
export function stampForResend(pending: Iterable<HubOp>, now: string): HubOp[] {
  return [...pending].map((op) => ({ ...op, ts: now }));
}

// ── translating a local edit into operations the relay understands ───────────

/**
 * dev28 (E.D., 1 Oct 2026, decision 12) · the language a node is born in
 * travels IN THE OP, and the producer puts it there once: the node's own
 * `data.lang`, else the study's working language as the section declares it,
 * else `und` («not known», never guessed). Every copy of the room then writes
 * the same — read at arrival from each copy's study, two copies with two
 * studies wrote two languages (s3Dgraphy `crdt.make_op`). A COPY of the
 * payload: the op must not write into the store's own node object.
 */
export function withOpLanguage(op: HubOp, section: { nodes?: unknown[]; data?: unknown } | null): HubOp {
  if (op.op !== "add_node") return op;
  const payload = (op.node ?? op.data) as Record<string, unknown> | undefined;
  if (!payload || !isTextNode(payload)) return op;
  const data = { ...((payload.data ?? {}) as Record<string, unknown>) };
  if (typeof data.lang === "string" && data.lang.trim()) return op;
  data.lang = (section ? sectionLanguage(section as never) : null) ?? "und";
  const key = op.node ? "node" : "data";
  op[key] = { ...payload, data };
  return op;
}

// ── V1 · one vocabulary on every wire ───────────────────────────────────────
//
// The twin of s3Dgraphy `crdt.ops_for_local_change` / `crdt.validate_op`,
// answered on the SAME cases: `tools/ops_golden.py` writes them, with the
// library's answers, to `testdata/ops-golden.json`, and `scripts/check-ops.mjs`
// asks this file the same. Decision of E.D. (4 Oct 2026): the Sidecar and the
// room speak the same operations; the store keeps `update_node` for itself
// (its undo, its listeners) and nothing else travels.

/** The operations a wire carries (`s3dgraphy.crdt.OPS`). */
export const OPS = ["add_node", "update_field", "remove_node", "add_edge", "remove_edge"] as const;
/** The verbs of a local store: they never travel. */
export const LOCAL_VERBS = ["update_node", "add_node", "delete_node", "add_edge", "delete_edge"] as const;

/** The fields an `update_field` may address. */
export function isAddressableField(name: string): boolean {
  return name === "name" || name === "description" || (name.startsWith("data.") && name.length > 5);
}

/** Why `op` is not an operation a wire carries, or null when it is (the SHAPE
 *  only; whether the node is there is the section's to say). */
export function validateOp(op: unknown): string | null {
  if (!op || typeof op !== "object" || Array.isArray(op)) return "an operation is an object";
  const o = op as Record<string, unknown>;
  const kind = String(o.op ?? "");
  if (!(OPS as readonly string[]).includes(kind)) {
    if ((LOCAL_VERBS as readonly string[]).includes(kind)) {
      return `unknown operation '${kind}' (a store's own verb: translate it with ` +
             `ops_for_local_change; known: ${OPS.join(", ")})`;
    }
    return `unknown operation '${kind}' (known: ${OPS.join(", ")})`;
  }
  if (kind === "add_node") {
    const payload = (o.node ?? o.data) as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== "object") return "add_node without a node";
    if (!(o.id || payload.id)) return "add_node without an id";
    return null;
  }
  if (kind === "update_field") {
    if (!(o.node_id || o.id)) return "update_field without a node_id";
    const name = String(o.field ?? "");
    if (!isAddressableField(name)) return `'${name}' is not an addressable field`;
    if (!("value" in o) && o.remove !== true) {
      return `update_field of '${name}' without a value (an emptying says remove: true)`;
    }
    return null;
  }
  if (kind === "remove_node") return (o.id || o.node_id) ? null : "remove_node without an id";
  if (kind === "add_edge") {
    const missing = ["source", "target", "edge_type"].filter((k) => !o[k]);
    return missing.length ? `add_edge without ${missing.join(", ")}` : null;
  }
  if (o.id || (o.source && o.target && o.edge_type)) return null;
  return "remove_edge without an id or its source, edge_type and target";
}

/** What a refusal is called when the state simply already knew (P4.1). */
export const NOT_NEWS = ["stale", "idempotent", "already removed, not older"];
/** Whether an `op_result` with `applied: false` must reach the person. */
export function refusalIsNews(reason: string): boolean {
  return !!reason && !NOT_NEWS.includes(reason);
}

const EDGE_CLOCK_KEYS = new Set(["removed", "created_at", "created_by"]);

/**
 * The wire operations for one change of a local store — or for an operation
 * already in `OPS`, copied as it is. Throws `Error(<the sentence>)` for a verb
 * nobody speaks and for a result that is not a valid operation.
 *
 * * `update_node` → ONE `update_field` per field: `fields` (the store stamped
 *   them, P4.1b) or a `patch` (an older peer); an emptied field travels as a
 *   REMOVAL (`remove: true`), because emptying is an act.
 * * `add_node` → with its id; a text node with no `data.lang` is born with the
 *   study's language, else `und` (dev28, decision 12).
 * * `delete_node` → `remove_node`; `add_edge`/`delete_edge` → the endpoints
 *   FLAT, the declared attributes only (the clock keys are the relay's).
 */
export function opsForLocalChange(
  local: { op: string; node_id?: string; id?: string; node?: EmNode; edge?: unknown;
           ts?: string; patch?: Record<string, unknown>;
           fields?: Array<{ field: string; value: unknown; ts: string;
                            by?: string | null; removed?: boolean }>;
           [key: string]: unknown },
  studyLanguage: string | null = null,
): HubOp[] {
  if (!local || typeof local !== "object") throw new Error("an operation is an object");
  const kind = String(local.op ?? "");
  const ts = (local.ts as string) || undefined;
  let out: HubOp[] = [];
  if (kind === "update_field" || kind === "remove_node" || kind === "remove_edge"
      || (kind === "add_edge" && !("edge" in local))) {
    const copy = { ...local } as Record<string, unknown>;
    delete copy.type;
    out = [copy as HubOp];
  } else if (kind === "update_node") {
    const nodeId = String(local.node_id ?? local.id ?? "");
    const pairs: Array<[string, unknown, string | undefined, boolean]> = [];
    if (Array.isArray(local.fields)) {
      for (const f of local.fields) {
        if (f && typeof f === "object") {
          pairs.push([String(f.field ?? ""), f.value, f.ts || ts, f.removed === true]);
        }
      }
    } else {
      for (const [k, v] of Object.entries(local.patch ?? {})) {
        if (k === "data" && v && typeof v === "object" && !Array.isArray(v)) {
          for (const [dk, dv] of Object.entries(v as Record<string, unknown>)) {
            pairs.push([`data.${dk}`, dv, ts, dv === null]);
          }
        } else {
          pairs.push([k, v, ts, v === null]);
        }
      }
    }
    out = pairs.map(([field, value, clock, removed]) => {
      const op: HubOp = { op: "update_field", node_id: nodeId, field } as HubOp;
      if (clock) op.ts = clock;
      if (removed) op.remove = true;
      else op.value = value;
      return op;
    });
  } else if (kind === "add_node") {
    // the store's verb and the wire's share the name: one shape out of both
    const node = { ...((local.node ?? local.data ?? {}) as Record<string, unknown>) };
    const data = { ...((node.data ?? {}) as Record<string, unknown>) };
    if (isTextNode(node) && !(typeof data.lang === "string" && data.lang.trim())) {
      data.lang = studyLanguage || "und";
      node.data = data;
    }
    const op: HubOp = { op: "add_node", id: String(node.id ?? local.id ?? ""), node } as HubOp;
    const stamp = ts || nodeStampOf(node as unknown as EmNode);
    if (stamp) op.ts = stamp;
    out = [op];
  } else if (kind === "delete_node") {
    const op: HubOp = { op: "remove_node", id: String(local.node_id ?? local.id ?? "") } as HubOp;
    if (ts) op.ts = ts;
    out = [op];
  } else if (kind === "add_edge" || kind === "delete_edge") {
    const e = (local.edge ?? {}) as Record<string, unknown>;
    const op: HubOp = { op: kind === "add_edge" ? "add_edge" : "remove_edge",
                        id: String(e.id ?? local.id ?? ""), source: e.source,
                        target: e.target, edge_type: e.edge_type } as HubOp;
    if (kind === "add_edge") {
      const raw = (e.attributes ?? {}) as Record<string, unknown>;
      const attrs: Record<string, unknown> = {};
      for (const k of Object.keys(raw).sort()) if (!EDGE_CLOCK_KEYS.has(k)) attrs[k] = raw[k];
      if (Object.keys(attrs).length) op.attributes = attrs;
    }
    if (ts) op.ts = ts;
    out = [op];
  } else {
    throw new Error(validateOp(local) ?? `unknown operation '${kind}'`);
  }
  for (const op of out) {
    const why = validateOp(op);
    if (why) throw new Error(why);
  }
  return out;
}

function nodeStampOf(node: EmNode): string | null {
  if (!node || typeof node !== "object") return null;
  const data = (node.data ?? {}) as Record<string, unknown>;
  return (data.modified_at as string) || (data.created_at as string) || null;
}

/**
 * An incoming relay operation, as the local store's `applyRemoteOp` wants it.
 *
 * The two vocabularies are not the same and pretending they were would be the
 * bug: the store speaks `update_node{patch}` (its undo, its listeners), the
 * relay speaks `update_field`. The translation is here, in one place, and it
 * carries the CLOCK — otherwise the arriving edit would be re-stamped locally
 * and the merge would trust the wrong hand.
 */
export function localPatchFor(op: HubOp): {
  op: "update_node"; node_id: string; patch: Record<string, unknown>;
  clock: { ts?: string; by?: string | null }; field: string; removed: boolean;
} | null {
  if (op.op !== "update_field") return null;
  const nodeId = String(op.node_id ?? op.id ?? "");
  const field = String(op.field ?? "");
  if (!nodeId || !field) return null;
  return {
    op: "update_node", node_id: nodeId,
    patch: {}, // filled by the caller, which has the node
    clock: { ts: op.ts, by: (op.author as string) ?? null },
    field, removed: op.remove === true,
  };
}

// ── presence ─────────────────────────────────────────────────────────────────

export interface PresenceState {
  /** everybody in the room, including me */
  members: HubMember[];
  /** my own connection id, so the roster can say which one is me */
  me: string | null;
}

export function emptyPresence(): PresenceState {
  return { members: [], me: null };
}

/** Fold a presence/select frame into the roster. Pure: same input, same roster. */
export function reducePresence(state: PresenceState,
                               message: Record<string, unknown>): PresenceState {
  const kind = String(message.type ?? "");
  if (kind === "host_info" && message.connection_id) {
    return { ...state, me: String(message.connection_id) };
  }
  if (kind === "presence") {
    const raw = Array.isArray(message.members) ? message.members : [];
    return {
      ...state,
      members: raw.map((m) => {
        const member = m as Record<string, unknown>;
        return {
          id: String(member.id ?? ""),
          author: (member.author as string) ?? null,
          display: String(member.display ?? member.author ?? "anon"),
          selection: Array.isArray(member.selection)
            ? member.selection.map(String) : [],
          joined_at: member.joined_at ? String(member.joined_at) : undefined,
        };
      }),
    };
  }
  if (kind === "select" && message.connection_id) {
    const id = String(message.connection_id);
    const ids = Array.isArray(message.node_ids)
      ? message.node_ids.map(String)
      : message.node_id ? [String(message.node_id)] : [];
    return {
      ...state,
      members: state.members.map((m) => (m.id === id ? { ...m, selection: ids } : m)),
    };
  }
  return state;
}

/**
 * Which nodes somebody ELSE is looking at, and who.
 *
 * The awareness layer, and the reason it returns a map rather than a set: a halo
 * that cannot say whose it is tells you that you are not alone and nothing else.
 * It is never consulted before an edit — there is no code path from here to a
 * refusal, which is what "soft" has to mean to be true.
 */
export function peerSelections(state: PresenceState): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const member of state.members) {
    if (member.id === state.me) continue;
    for (const nodeId of member.selection) {
      const who = out.get(nodeId) ?? [];
      who.push(member.display);
      out.set(nodeId, who);
    }
  }
  return out;
}

// ── awareness of what changed under you ──────────────────────────────────────

export interface AwarenessNote {
  kind: "remote-edit" | "stale" | "resync";
  text: string;
  nodeId?: string;
  at: string;
}

/** The sentence for an operation that arrived from somebody else. */
export function noteForRemoteOp(op: HubOp, who: string | null,
                                nodeName: string | null): AwarenessNote {
  const target = nodeName || String(op.node_id ?? op.id ?? "");
  const field = op.field ? String(op.field) : "";
  const author = who || "somebody";
  const what = op.remove === true
    ? `emptied ${field}`
    : field ? `updated ${field}` : "changed something";
  return { kind: "remote-edit", nodeId: String(op.node_id ?? op.id ?? ""),
           text: `${author} ${what} on ${target}`, at: String(op.ts ?? "") };
}

/**
 * The sentence for a local operation the hub refused as stale.
 *
 * NOT an error and not a crash: with a CRDT a refused operation means the room
 * already knows something newer. What the person needs is to be told that their
 * change did not land and why — which is awareness, the same channel as
 * "somebody edited this after you".
 */
export function noteForStale(op: HubOp, nodeName: string | null): AwarenessNote {
  const target = nodeName || String(op.node_id ?? op.id ?? "");
  const field = op.field ? ` (${op.field})` : "";
  return {
    kind: "stale", nodeId: String(op.node_id ?? op.id ?? ""),
    text: `your change to ${target}${field} was not applied: the room already ` +
          `has a newer one`,
    at: String(op.ts ?? ""),
  };
}
