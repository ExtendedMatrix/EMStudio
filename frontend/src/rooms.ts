/**
 * CREATING A ROOM, AND PUTTING A FILE ON IT — the two gestures EMStudio lacked.
 *
 * The decision they implement is not «modes» but THREE VERBS (design note
 * `EM_design_aprire-entrare-creare.md`, 5 September 2026), and the question that
 * decides everything is **where the copy you are editing lives**:
 *
 *   on your disk  →  it is not a room, and the node knows nothing about it;
 *   on the node   →  it IS a room, always — even with one member.
 *
 * A room with a single member is not a degenerate room: it is *your table*. The
 * gain from that choice is that a concept DISAPPEARS — there is no «editing
 * online without a room» — and with it the ambiguous case where nobody knows who
 * is keeping what.
 *
 * This module is the PURE half: deriving an id, and turning an open container
 * into the operations that seat it on a table. No fetch, no DOM, no settings —
 * which is what lets `check-rooms.mjs` put real values to it.
 */

import type { EmNode } from "./types";
import { withOpLanguage, type HubOp } from "./hub";

/**
 * The room id a name produces.
 *
 * DERIVED, never typed twice. A person types a NAME; the id is a consequence,
 * because two things that must agree are two things that will one day disagree.
 *
 * ⚠ THIS ALGORITHM IS SHARED WITH THE NODE'S FRONT DOOR
 * (`stratigraph-server/app/rooms_ui/rooms.js::createRoom`). Two doors that
 * derive it differently would make the SAME name into two different rooms, which
 * is exactly the ambiguity the one-room-one-graph rule exists to prevent. The
 * agreement is not assumed: `check-rooms.mjs` and the server's
 * `test_room_id_parity.py` assert the same vector of names, so a change to
 * either side that is not made to both turns a suite red.
 *
 * Collisions are the SERVER's to refuse (409, and its sentence is shown). This
 * function does not check for them — asking first and creating second is two
 * answers where one is authoritative.
 */
export function roomIdFromName(name: string): string {
  return (name || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Is this a name a room can be made from?
 *
 * A name of only punctuation slugs to the empty string. The front door falls back
 * to `room-<timestamp>` there; this one REFUSES instead, and the difference is
 * deliberate: on the door the fallback is a convenience for somebody who can see
 * the list they just added to, while here the room becomes the live copy of the
 * document in front of you, and being sent to work in `room-lz4f9k` because your
 * name was «???» is a worse outcome than being asked again.
 */
export function nameIsUsable(name: string): boolean {
  return roomIdFromName(name).length > 0;
}

/**
 * THE UPLOAD THAT TURNS A FILE INTO A PLACE — as operations, not as a payload.
 *
 * Why operations rather than a new endpoint that swallows an em.json: the relay
 * already has exactly five idempotent verbs and a merge that arbitrates them
 * (P4.1). A seeding endpoint would be a SIXTH way for a graph to enter a room,
 * writing straight into the snapshot store past the convergence rules — and the
 * first time it raced a connected client the room would have two truths and no
 * ledger saying which arrived first. Composing the verbs it already has costs
 * one walk of the document and keeps one path in.
 *
 * Nodes before edges, because an edge naming a node the room has not seen is an
 * edge the room has to hold in the air. The relay tolerates it; a reader looking
 * at the room mid-seed would not.
 *
 * NOT STAMPED HERE. `add_node` carries the node's OWN `modified_at`/`created_at`
 * if it has one — the same rule `opsForLocalChange` follows. Re-stamping on the
 * way in would make every node in a ten-year-old excavation look like it was
 * recorded the afternoon somebody uploaded it, which is the audit trail lying
 * about its own age.
 */
export function seedOpsForContainer(
  graph: { nodes?: EmNode[]; edges?: Array<Record<string, unknown>> } | null,
): HubOp[] {
  if (!graph) return [];
  const ops: HubOp[] = [];
  for (const node of graph.nodes ?? []) {
    if (!node?.id) continue;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const stamp = (data.modified_at as string) || (data.created_at as string) || undefined;
    // dev28 · the seed is a producer too: the language in the op
    ops.push(withOpLanguage({
      op: "add_node",
      node: node as unknown as Record<string, unknown>,
      id: node.id,
      ts: stamp,
    }, graph as never));
  }
  for (const edge of graph.edges ?? []) {
    const id = String(edge.id ?? "");
    if (!id) continue;
    ops.push({
      op: "add_edge", id,
      source: edge.source, target: edge.target, edge_type: edge.edge_type,
    });
  }
  return ops;
}

/**
 * What a gesture needs before it can happen, in the ladder's own terms.
 *
 * The rule from the prompt, and it is the ladder applied rather than a second
 * mechanism: **if you are not confirmed, the gesture asks for the rung first —
 * not a form.** Creating a room writes an ACL naming its owner, so the node has
 * to know who that is; `POST /v1/rooms` answers 401 for exactly this reason.
 *
 * So this returns WHICH RUNG IS MISSING, and the caller does what the chip would
 * do. It does not return a message: the sentences already exist, one per rung,
 * and a second set written here is a second set to keep in step.
 */
export type RoomGestureBlock = "signature" | "confirmation" | null;

export function whatBlocksTheGesture(
  hasSignature: boolean, hasNodeToken: boolean,
): RoomGestureBlock {
  if (!hasSignature) return "signature";
  if (!hasNodeToken) return "confirmation";
  return null;
}
