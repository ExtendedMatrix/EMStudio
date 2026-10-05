/**
 * "Open this room in EMStudio" — the deep-link, consumed.
 *
 * This kills the hand-typed Hub. Before it, joining a room meant three fields in
 * Settings — an address, a room name, and a token pasted out of a terminal — and
 * the third one was a secret travelling by clipboard.
 *
 * The contract is StratiGraph Server's (`app/handoff.py`), and its security
 * property is the whole design:
 *
 *     stratigraph://open?server=<addr>&room=<id>
 *
 * **The link carries a PLACE, never a permission.** No token, no ticket. This
 * module reads `{server, room}` out of it and then signs in AGAINST THAT SERVER
 * by itself — Authorization Code + PKCE, public client, token in memory. So a
 * link in a chat, a screenshot or a bug report leaks nothing, and the token
 * belongs to whoever clicked rather than to whoever forwarded.
 *
 * **A link is not a membership.** If the caller has no grant, the room refuses
 * and the remedy is the INVITE (`members.ts`), which is a different link that
 * carries a role. Conflating the two would turn "here is where it is" into
 * "here, have access".
 *
 * Two ways in, one reader:
 *
 * * **desktop** — the OS hands the app a `stratigraph://` URL (registered in the
 *   Tauri bundle) and Tauri delivers it as a deep-link event;
 * * **web** — the same parameters arrive on this page's own query string, which
 *   is what the server's `/open` page falls back to.
 *
 * The grammar is deliberately re-implemented here rather than fetched: a client
 * that had to reach a server to find out WHICH server to reach would not be able
 * to start. It is kept honest by `check-handoff.mjs`, which measures this reader
 * against the same links the server's own parser is measured against.
 */

/** What a handoff names, and all it names.
 *
 *  TWO ACTIONS ON ONE NAMESPACE, and that is the design the scheme was renamed
 *  for: `stratigraph://` is the ecosystem's, so the Catalog opens a STUDY and the
 *  room browser opens a ROOM through the same handler. A consumer registers one
 *  scheme and reads which of the two it was handed.
 *
 *  Before this, a study link could not work by construction: the catalogue
 *  emitted `stratigraph://open?study=<id>` and this parser refused it with «the
 *  link names no room» — into `logWarn`, i.e. the app's console, not in front of
 *  whoever had pressed the button. Measured in Chrome on 4 September. */
export type Handoff =
  | { kind: "room"; server: string; room: string; node?: string }
  | { kind: "study"; catalog: string; study: string; node?: string };

/** E4 · `&node=<id>`: the unit to land on once the room or the study is open —
 *  selected, in the Inspector, the view centred on it (E.D., 4 Oct 2026). It
 *  names a node of the graph, never a permission; an unknown id is said, not
 *  guessed. `focus=` was the name these comments kept free for it. */
export function nodeOf(url: URL): string | undefined {
  const node = (url.searchParams.get("node") || "").trim();
  if (!node) return undefined;
  if (node.length > 200 || /[\u0000-\u001f]/.test(node)) {
    throw new HandoffError("the node of this link is not a node id");
  }
  return node;
}

/** A room handoff, when that is what it is — for the callers that only join. */
export function asRoom(handoff: Handoff): { server: string; room: string } | null {
  return handoff.kind === "room"
    ? { server: handoff.server, room: handoff.room } : null;
}

/** The ecosystem's scheme — not `emstudio://`. One namespace, two actions: the
 *  Catalog opens a STUDY, the room browser opens a ROOM. */
export const SCHEME = "stratigraph";
export const ACTION = "open";

/** Query keys that must never appear in a handoff. Refused rather than ignored:
 *  accepting one teaches whoever built the link that sending one works, and then
 *  the contract has no property left. */
const FORBIDDEN = ["token", "access_token", "id_token", "password", "secret",
                   "code", "authorization", "bearer", "api_key"];

export class HandoffError extends Error {}

/** `{server, room}` out of either form of the link, or a sentence. */
export function parseHandoff(link: string): Handoff {
  const raw = (link || "").trim();
  if (!raw) throw new HandoffError("empty link");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HandoffError(`not a link: ${raw}`);
  }

  const scheme = url.protocol.replace(/:$/, "");
  if (scheme === SCHEME) {
    // `stratigraph://open?…` — the host is the action for a non-special scheme
    const action = url.host || url.pathname.replace(/^\/+/, "");
    if (action !== ACTION) {
      throw new HandoffError(
        `unknown action "${action}": this scheme understands ${SCHEME}://${ACTION}`);
    }
  } else if (scheme === "http" || scheme === "https") {
    if (!url.pathname.replace(/\/+$/, "").endsWith(`/${ACTION}`)) {
      throw new HandoffError(
        `not a handoff link: ${raw} (expected a path ending in /${ACTION})`);
    }
  } else {
    throw new HandoffError(
      `not a handoff link: ${raw} (expected ${SCHEME}://${ACTION}?… or an https link to /${ACTION})`);
  }

  const carried = FORBIDDEN.filter((key) => url.searchParams.has(key));
  if (carried.length) {
    throw new HandoffError(
      `this link carries ${carried.join(", ")} — a handoff names a place and `
      + `never a permission. Refused so that sending one never starts working: `
      + `EMStudio signs in by itself.`);
  }

  const room = (url.searchParams.get("room") || "").trim();
  const study = (url.searchParams.get("study") || "").trim();

  // AMBIGUITY FIRST. One namespace with two actions needs exactly one rule for
  // "which one is this", and a link naming both is not a link with a preference
  // — it is a link somebody built wrong, and guessing would make the guess the
  // contract. (Unknown keys are still ignored, which is what keeps `focus=` and
  // whatever comes next backward compatible: `study` is not unknown any more.)
  if (room && study) {
    throw new HandoffError(
      "this link names both a room and a study; a handoff is one action. "
      + `Send ${SCHEME}://${ACTION}?server=…&room=… to open a room, or `
      + "?study=…&catalog=… to open a study.");
  }

  // A STUDY. Read before the room's error, so a link that names one is answered
  // rather than refused for missing the other half.
  if (study) {
    let catalog = (url.searchParams.get("catalog") || "").trim().replace(/\/+$/, "");
    if (!catalog && (scheme === "http" || scheme === "https")) {
      // the web form may leave it implicit: the page IS on the catalogue
      catalog = url.origin;
    }
    if (!catalog) {
      throw new HandoffError(
        "this link names a study but no catalogue, so there is nowhere to fetch "
        + "it from. The catalogue's address is part of the link "
        + `(${SCHEME}://${ACTION}?study=…&catalog=…) and it comes from that `
        + "deployment's configuration, never from whoever built the link.");
    }
    const node = nodeOf(url);
    return node ? { kind: "study", catalog, study, node } : { kind: "study", catalog, study };
  }

  // A ROOM.
  if (!room) {
    throw new HandoffError(
      "the link names neither a room nor a study. A handoff opens one of the "
      + `two: ${SCHEME}://${ACTION}?server=…&room=… for a room, or `
      + `?study=…&catalog=… for a study.`);
  }
  let server = (url.searchParams.get("server") || "").trim().replace(/\/+$/, "");
  if (!server) {
    // the web form may leave it implicit: the page IS on the server
    if (scheme === "http" || scheme === "https") server = url.origin;
    else throw new HandoffError("the link names no server");
  }
  const node = nodeOf(url);
  return node ? { kind: "room", server, room, node } : { kind: "room", server, room };
}

/** A handoff on THIS page's URL, if there is one.
 *
 *  The web half. Two spellings are read because both exist in the wild: the
 *  server's `/open?server=&room=` page, and a plain `?handoff=<the whole link>`
 *  that anything can append. */
export function handoffFromLocation(search?: string): Handoff | null {
  const params = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""));
  const whole = params.get("handoff");
  if (whole) {
    try { return parseHandoff(whole); } catch { return null; }
  }
  const room = (params.get("room") || "").trim();
  const server = (params.get("server") || "").trim();
  // `?room=` alone is the INVITE's spelling (`members.ts::pendingJoin`) and must
  // not be mistaken for a handoff: that one arrives with `?join=<token>` and
  // means something else entirely.
  if (!room || !server || params.has("join")) return null;
  const node = (params.get("node") || "").trim();
  try {
    return parseHandoff(`${SCHEME}://${ACTION}?server=`
      + `${encodeURIComponent(server)}&room=${encodeURIComponent(room)}`
      + (node ? `&node=${encodeURIComponent(node)}` : ""));
  } catch {
    return null;
  }
}

// A STUDY on this page's URL is NOT read here, and that is deliberate. The web
// form of a study link is `?study=&emjson=` — the two parameters the Catalog's
// `web` door writes and `studylink.ts` reads — and it is a page load rather than
// a handoff. This function exists for the room form, where the same parameters
// mean a join. Reading both here would have made one reader answer two questions
// with one shape.

/** Take the handoff off the address bar once it has been read.
 *
 *  Not a secret — there is nothing secret in it — but a URL that still says
 *  `?room=` will re-join on every reload, including after the person has
 *  deliberately left. */
export function clearHandoffFromLocation(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  // …and the round trip's OWN leftovers, because this function is called on the
  // way back from the IdP and used to leave them written in the bar: `?room=`
  // came off and `code`, `state`, `session_state`, `iss` stayed. The same rule
  // applied to half the problem — and «the token first» exists precisely to keep
  // credential-shaped things out of an address that gets copied into chats and
  // screenshots. A spent code is not a live credential; it still does not belong
  // there.
  for (const key of ["handoff", "server", "room", "node",
                     "code", "state", "session_state", "iss",
                     "error", "error_description"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", url.toString());
}

/** Build one — for a test, and for the day EMStudio hands a room to something
 *  else. The same grammar in both directions is what keeps the reader honest. */
export function buildHandoff(handoff: Handoff): string {
  if (handoff.kind === "study") {
    if (!handoff.study) throw new HandoffError("a study handoff needs a study");
    if (!handoff.catalog) throw new HandoffError("a study handoff needs a catalogue");
    const query = new URLSearchParams({
      study: handoff.study, catalog: handoff.catalog.replace(/\/+$/, ""),
    });
    if (handoff.node) query.set("node", handoff.node);
    return `${SCHEME}://${ACTION}?${query.toString()}`;
  }
  if (!handoff.room) throw new HandoffError("a handoff needs a room");
  if (!handoff.server) throw new HandoffError("a handoff needs a server");
  const query = new URLSearchParams({
    server: handoff.server.replace(/\/+$/, ""), room: handoff.room,
  });
  if (handoff.node) query.set("node", handoff.node);
  return `${SCHEME}://${ACTION}?${query.toString()}`;
}
