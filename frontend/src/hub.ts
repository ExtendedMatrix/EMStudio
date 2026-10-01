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

/**
 * A local `update_node` becomes ONE `update_field` per field that changed.
 *
 * The store already knows which fields changed and when — it stamped them
 * (P4.1b) — so the list travels with the local op and is not re-derived here.
 * Re-deriving it would mean diffing without a "before", which is exactly the
 * guesswork the stamping exists to remove.
 *
 * A field the editor EMPTIED travels as a removal (`remove: true`), because
 * emptying is an act and the other end must be able to tell it from "I do not
 * have that".
 */
export function opsForLocalChange(
  local: { op: string; node_id?: string; node?: EmNode; edge?: unknown;
           fields?: Array<{ field: string; value: unknown; ts: string;
                            by?: string | null; removed?: boolean }> },
): HubOp[] {
  if (local.op === "update_node") {
    const nodeId = String(local.node_id ?? "");
    if (!nodeId || !local.fields?.length) return [];
    return local.fields.map((f) => {
      const op: HubOp = { op: "update_field", node_id: nodeId, field: f.field,
                          ts: f.ts };
      if (f.removed) op.remove = true;
      else op.value = f.value;
      return op;
    });
  }
  if (local.op === "add_node" && local.node) {
    return [{ op: "add_node", node: local.node as unknown as Record<string, unknown>,
              id: local.node.id,
              ts: nodeStampOf(local.node) ?? undefined }];
  }
  if (local.op === "delete_node") {
    return [{ op: "remove_node", id: String(local.node_id ?? "") }];
  }
  if (local.op === "add_edge" && local.edge) {
    const e = local.edge as Record<string, unknown>;
    // the relation's DECLARED attributes travel (an heir's `inherited`); the
    // clock keys are the relay's to stamp, and crdt drops them if sent
    const attrs = { ...((e.attributes ?? {}) as Record<string, unknown>) };
    for (const k of ["created_at", "created_by", "removed"]) delete attrs[k];
    return [{ op: "add_edge", id: String(e.id ?? ""), source: e.source,
              target: e.target, edge_type: e.edge_type,
              ...(Object.keys(attrs).length ? { attributes: attrs } : {}) }];
  }
  if (local.op === "delete_edge" && local.edge) {
    const e = local.edge as Record<string, unknown>;
    return [{ op: "remove_edge", id: String(e.id ?? ""), source: e.source,
              target: e.target, edge_type: e.edge_type }];
  }
  return [];
}

function nodeStampOf(node: EmNode): string | null {
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
