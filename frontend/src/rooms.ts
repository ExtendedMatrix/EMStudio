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
 * This module is the PURE half: deriving an id from a name, and what a gesture
 * needs before it can happen. No fetch, no DOM, no settings — which is what
 * lets `check-rooms.mjs` put real values to it.
 */


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

/*
 * SEATING A STUDY IN A ROOM is not here any more (MICRO-PORTA-IN-STANZA-DAL-
 * MOTORE, 16 Oct 2026). `seedOpsForContainer`, `studySections` and
 * `seedOpsForStudy` turned an open container into the room's birth sections and
 * the operations that seat it, sent FIRST through the socket; «Bring into a
 * room…» is now the engine's (`s3dgraphy.room_import`, through the bridge's
 * `/room-import`): born with the study's sections (`engine.birth_sections`),
 * the files hosted, the graph seated LAST through `POST …/ops`
 * (`inventory.seed_ops`). An empty room («New room») seats nothing, so nothing
 * here served anything else.
 */

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
