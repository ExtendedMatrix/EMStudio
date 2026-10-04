/**
 * MICRO-IL-GIRO-DELLA-DEV17 · K1, K2, X2 — where this session is connected, said
 * in one line, and the panels behind it.
 *
 * The footer said «Standalone» and nothing else: which node, how you entered it,
 * whether it answers, which room — none of it was on screen (E.D., 3 Oct). The
 * line is now ONE status item, «mode · node · access · reach · room», and it is
 * a button: the click opens the connection panel (the Mode menu's three choices
 * plus the node and the room, with their gestures), and from there the room's
 * settings (members, roles, invitations — the node's own API, nothing new).
 *
 * «The network» (online with the StratiGraph network / isolated) has nothing to
 * read on the server yet: what is shown is what can be measured, the NODE
 * reachable or not, and the panel says that the network is not reported.
 *
 * Pure in the sense that matters: no store, no sync client. The caller hands in
 * the state and the gestures, and every request to the node goes through the
 * `NodeApi` it supplies (so the bench can point it anywhere).
 */

import { t } from "./i18n";

export type Reach = "unknown" | "reachable" | "unreachable";
export type Access = "orcid_node" | "node_password" | "declared" | "none";
export type SessionMode = "standalone" | "sidecar" | "hub";

export interface ConnectionState {
  mode: SessionMode;
  /** the node's address as written in Settings, or "" */
  node: string;
  access: Access;
  reach: Reach;
  /** the room this session is in (connected), or null */
  room: string | null;
  /** the room's title when the node told us */
  roomTitle?: string | null;
  /** Y1 · a sidecar pairing waiting for its host */
  waiting?: boolean;
  /** Z · the host of a sidecar, as it named itself («Blender») */
  hostTool?: string | null;
  /** Z · the file the host has open (`host_info.file`), or its graph's name */
  hostFile?: string | null;
  /** B1 · what the host said it cannot do («no graph loaded in Blender») */
  notice?: string | null;
  /** C1 · the two ends are on different documents: the sentence, or null */
  misaligned?: string | null;
  /** a room's socket dropped and is being asked again */
  reconnecting?: boolean;
}

/** `https://em.localhost:8443/em` → `em.localhost:8443` (the short address) */
export function shortNode(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\/em$/, "");
}

/** `em.localhost:8443` → `em.localhost`: the bar says WHICH node, not its port */
export function nodeName(url: string): string {
  return shortNode(url).replace(/:\d+$/, "");
}

/**
 * MICRO-LA-BARRA · ZONE 1, «where you work» — ONE phrase, never a list.
 *
 * It replaced «mode · node · access · reach · room» (dev.17), which said the node
 * in a Sidecar where the node has nothing to do with anything, and the access
 * («node's password») beside an ORCID tick as if they were two identities. What
 * is not about WHERE goes to the panel behind the click.
 */
export function wherePhrase(s: ConnectionState): string {
  if (s.mode === "sidecar") {
    const tool = s.hostTool || "Blender";
    if (s.waiting) return t("where.sidecarWaiting", { tool });
    return s.hostFile ? t("where.sidecarFile", { tool, file: s.hostFile })
      : t("where.sidecar", { tool });
  }
  if (s.mode === "hub" && s.room) {
    return t("where.room", { room: s.roomTitle || s.room, node: nodeName(s.node) });
  }
  return t("where.local");
}

export type Health = "ok" | "warn" | "bad";

/**
 * The dot beside the phrase: green, amber, red.
 *
 * Amber is «it works, and there is something to read in the panel» — a host
 * waited for, a host with no graph loaded, two different documents, a room
 * reconnecting. Red is «it does not work»: the node of the room does not answer.
 * On this computer nothing can fail, so it is green.
 */
export function whereHealth(s: ConnectionState): Health {
  if (s.mode === "sidecar") {
    return s.waiting || s.notice || s.misaligned ? "warn" : "ok";
  }
  if (s.mode === "hub") {
    if (s.reach === "unreachable") return "bad";
    return s.reconnecting || s.notice ? "warn" : "ok";
  }
  return "ok";
}

/**
 * The details the old line carried, for the tooltip of zone 1: still one hover
 * away, never on the bar. In a Sidecar the node is not mentioned at all.
 */
export function whereDetails(s: ConnectionState): string[] {
  const out = [wherePhrase(s)];
  if (s.notice) out.push(s.notice);
  if (s.misaligned) out.push(s.misaligned);
  if (s.mode !== "sidecar" && s.node) {
    out.push(`${shortNode(s.node)} · ${t(`conn.reach.${s.reach}`)}`);
    if (s.mode === "hub") out.push(t("conn.enteredWith", { how: t(`conn.access.${s.access}`) }));
  }
  return out;
}

// ── the room, as the node answers it ─────────────────────────────────────────

export interface RoomInfo {
  room_id: string;
  title: string;
  owner?: string | null;
  members?: { orcid: string; role: string }[];
  your_role?: string | null;
  /** a room nobody declared (opened by name), listed because its ACL names you */
  implicit?: boolean;
  archived_at?: string | null;
}

/**
 * R1 · `GET /v1/rooms`, split the way a person reads it: «Your rooms» (you own
 * them) and «Shared with you» (with the role somebody gave you). The node says
 * both in `your_role` — MEASURED for `dev` (owner everywhere) and `viewer`
 * (viewer/editor on rooms of dev's): no ORCID is compared here. Archived rooms
 * are not offered; the order is by title, as a person looks for a name.
 */
export function splitRooms(rooms: RoomInfo[]): { mine: RoomInfo[]; shared: RoomInfo[] } {
  const live = rooms.filter((r) => !r.archived_at)
    .sort((a, b) => (a.title || a.room_id).localeCompare(b.title || b.room_id));
  return { mine: live.filter((r) => r.your_role === "owner"),
           shared: live.filter((r) => r.your_role !== "owner") };
}
export interface MembersInfo {
  owner?: string | null;
  members: { orcid: string; role: string }[];
  groups?: { group_id: string; role: string; name?: string | null }[];
  your_role?: string | null;
}

/** The calls the room panel makes — `GET /rooms/{id}`, `…/members`, `PUT`/`DELETE
 *  …/members/{orcid}`, `POST …/invites`, `GET …/open` — and nothing else. */
export interface NodeApi {
  /** R1 · the rooms this caller has a grant in */
  rooms(): Promise<RoomInfo[]>;
  room(id: string): Promise<RoomInfo>;
  members(id: string): Promise<MembersInfo>;
  setMember(id: string, orcid: string, role: string): Promise<MembersInfo>;
  removeMember(id: string, orcid: string): Promise<MembersInfo>;
  invite(id: string, role: string): Promise<{ token?: string | null }>;
  door(id: string): Promise<{ web?: string | null; scheme?: string | null }>;
}

/** A `NodeApi` over `fetch`, with the session's bearer when there is one. */
export function nodeApi(base: string, token: () => string | null): NodeApi {
  const root = base.replace(/\/+$/, "");
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const h: Record<string, string> = {};
    const tok = token();
    if (tok) h.Authorization = `Bearer ${tok}`;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const r = await fetch(`${root}/v1${path}`, { method, headers: h, cache: "no-store",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const j = await r.json().catch(() => null) as (T & { detail?: string }) | null;
    if (!r.ok) throw new Error(j?.detail ? String(j.detail) : `HTTP ${r.status}`);
    return j as T;
  };
  const room = (id: string) => `/rooms/${encodeURIComponent(id)}`;
  return {
    rooms: () => call("GET", "/rooms"),
    room: (id) => call("GET", room(id)),
    members: (id) => call("GET", `${room(id)}/members`),
    setMember: (id, orcid, role) => call("PUT", `${room(id)}/members/${encodeURIComponent(orcid)}`, { role }),
    removeMember: (id, orcid) => call("DELETE", `${room(id)}/members/${encodeURIComponent(orcid)}`),
    invite: (id, role) => call("POST", `${room(id)}/invites`, { role }),
    door: (id) => call("GET", `${room(id)}/open`),
  };
}

/** «yours» when the node says you own it; else «of <owner>». */
export function ownership(info: Pick<RoomInfo, "owner" | "your_role">): { mine: boolean; text: string } {
  if (info.your_role === "owner") return { mine: true, text: t("room.yours") };
  return { mine: false, text: t("room.ofOwner", { owner: info.owner || "?" }) };
}

/** The roles a manager may hand out by hand (`MemberIn`) and by link (`InviteIn`). */
export const MEMBER_ROLES = ["viewer", "editor", "admin"] as const;
export const LINK_ROLES = ["viewer", "editor"] as const;

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(text: string, cls = "conn-btn"): HTMLButtonElement {
  const b = el("button", cls, text);
  b.type = "button";
  return b;
}

// ── the connection panel (X2 + K1, redrawn by MICRO-LA-BARRA) ─────────────

export interface ConnectionGestures {
  setMode(mode: SessionMode): void;
  openNodeSettings(): void;
  /** N1 · «Choose the node…»: this computer, the local network, saved, typed */
  chooseNode?(): void;
  openRoomSettings(): void;
  openOnNode(): void;
  leaveRoom(): void;
  /** R1 · the node's rooms for this caller (`GET /v1/rooms`) */
  listRooms?(): Promise<RoomInfo[]>;
  /** R1 · enter one of them */
  joinRoom?(roomId: string): void;
  /** R1 · «+ New room» (empty) */
  newRoom?(): void;
  /** P1 · «Bring into a room…»: the graph on screen becomes a new room's */
  bringIntoRoom?(): void;
  /** P2 · the room's resources: inventory, upload, report */
  roomResources?(): void;
}

/**
 * Z · what moved OUT of the bar and into the panel, handed in as live elements
 * the caller keeps drawing: the host's facts (what it has open, where), «what you
 * accept from the other end» (it was «Take from…» in the bar), and who is in the
 * room. The panel places them; it does not know how they are made.
 */
export interface ConnectionParts {
  host?: HTMLElement | null;
  accept?: HTMLElement | null;
  roster?: HTMLElement | null;
}

/** The rooms list (R1): two groups, a filter when the list is long, a click joins. */
export function renderRoomList(host: HTMLElement, rooms: RoomInfo[], current: string | null,
                               join: (roomId: string) => void): void {
  host.textContent = "";
  const { mine, shared } = splitRooms(rooms);
  let filter = "";
  const lists = el("div", "conn-rooms-lists");
  const paint = (): void => {
    lists.textContent = "";
    const q = filter.trim().toLowerCase();
    const keep = (r: RoomInfo): boolean => !q
      || (r.title || "").toLowerCase().includes(q) || r.room_id.toLowerCase().includes(q);
    const group = (key: "mine" | "shared", items: RoomInfo[]): void => {
      const shown = items.filter(keep);
      const h = el("h5", "", `${t(`rooms.${key}`)} · ${shown.length}`);
      lists.appendChild(h);
      const ul = el("ul", "conn-rooms");
      ul.dataset.group = key;
      if (!shown.length) ul.appendChild(el("li", "conn-dim", t(`rooms.${key}None`)));
      for (const r of shown) {
        const li = el("li");
        li.dataset.room = r.room_id;
        const b = btn(r.title || r.room_id, "conn-room-pick" + (r.room_id === current ? " on" : ""));
        b.title = r.room_id + (r.implicit ? ` · ${t("rooms.implicit")}` : "");
        b.addEventListener("click", () => join(r.room_id));
        li.appendChild(b);
        if (key === "shared") li.appendChild(el("span", "conn-role", t(`room.role.${r.your_role ?? "none"}`)));
        if (r.room_id === current) li.appendChild(el("span", "conn-dim", t("rooms.here")));
        ul.appendChild(li);
      }
      lists.appendChild(ul);
    };
    group("mine", mine);
    group("shared", shared);
  };
  if (mine.length + shared.length > 8) {
    const f = el("input", "conn-input conn-rooms-filter");
    f.type = "search";
    f.placeholder = t("rooms.filter");
    f.setAttribute("aria-label", t("rooms.filter"));
    f.addEventListener("input", () => { filter = f.value; paint(); });
    host.appendChild(f);
  }
  host.appendChild(lists);
  paint();
}

/** The panel zone 1 opens: where you are, the three ways of working, and — only
 *  when they matter — the host, the node, the room and the rooms you can enter. */
export function renderConnectionPanel(host: HTMLElement, s: ConnectionState, g: ConnectionGestures,
                                      parts: ConnectionParts = {}): void {
  host.textContent = "";
  host.className = "conn-panel";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-label", t("conn.title"));

  const head = el("h4", "conn-where");
  const dot = el("span", "where-dot");
  dot.dataset.health = whereHealth(s);
  head.append(dot, document.createTextNode(wherePhrase(s)));
  host.appendChild(head);
  if (s.notice) host.appendChild(el("p", "conn-line conn-warn", s.notice));
  if (s.misaligned) host.appendChild(el("p", "conn-line conn-warn", s.misaligned));

  const modes = el("div", "conn-sect");
  modes.appendChild(el("h5", "", t("conn.modeHead")));
  const row = el("div", "conn-modes");
  for (const m of ["standalone", "sidecar", "hub"] as SessionMode[]) {
    const b = btn(t(`conn.modeChoice.${m}`), "conn-btn conn-mode" + (s.mode === m ? " on" : ""));
    b.dataset.mode = m;
    b.title = t(`mode.${m}Title`);
    b.setAttribute("aria-pressed", String(s.mode === m));
    b.addEventListener("click", () => g.setMode(m));
    row.appendChild(b);
  }
  modes.appendChild(row);
  host.appendChild(modes);

  // the other end, when it is a host on this computer: no node here (D-B)
  if (s.mode === "sidecar") {
    const side = el("div", "conn-sect");
    side.dataset.sect = "host";
    side.appendChild(el("h5", "", s.hostTool || "Blender"));
    if (parts.host) side.appendChild(parts.host);
    if (parts.accept) {
      side.appendChild(el("h5", "", t("conn.acceptHead", { tool: s.hostTool || "Blender" })));
      side.appendChild(parts.accept);
    }
    host.appendChild(side);
    return;
  }

  if (s.mode === "hub" && s.room) {
    const room = el("div", "conn-sect");
    room.dataset.sect = "room";
    room.appendChild(el("h5", "", t("conn.roomHead")));
    room.appendChild(el("p", "conn-line", t("conn.inRoom", { room: s.roomTitle || s.room })));
    if (parts.roster) room.appendChild(parts.roster);
    if (parts.accept) {
      room.appendChild(el("h5", "", t("conn.acceptHead", { tool: t("conn.theRoom") })));
      room.appendChild(parts.accept);
    }
    const acts = el("div", "conn-acts");
    const rs = btn(t("conn.roomSettings"));
    rs.dataset.act = "room-settings";
    rs.addEventListener("click", () => g.openRoomSettings());
    const on = btn(t("conn.openOnNode"));
    on.addEventListener("click", () => g.openOnNode());
    const leave = btn(t("conn.leaveRoom"));
    leave.addEventListener("click", () => g.leaveRoom());
    acts.append(rs, on);
    if (g.roomResources) {
      const res = btn(t("rooms.resources"));
      res.dataset.act = "room-resources";
      res.addEventListener("click", () => g.roomResources!());
      acts.appendChild(res);
    }
    acts.appendChild(leave);
    room.appendChild(acts);
    host.appendChild(room);
  }

  const node = el("div", "conn-sect");
  node.dataset.sect = "node";
  node.appendChild(el("h5", "", t("conn.nodeHead")));
  if (!s.node) {
    node.appendChild(el("p", "conn-line", t("conn.noNodeLong")));
  } else {
    const dl = el("dl", "conn-facts");
    const fact = (k: string, v: string, cls = ""): void => {
      dl.appendChild(el("dt", "", k));
      dl.appendChild(el("dd", cls, v));
    };
    fact(t("conn.k.node"), shortNode(s.node));
    fact(t("conn.k.reach"), t(`conn.reach.${s.reach}`), `conn-reach-${s.reach}`);
    // the access is a DETAIL OF THE LINK TO THE NODE, not a second identity
    fact(t("conn.k.access"), t("conn.enteredWith", { how: t(`conn.access.${s.access}`) }));
    node.appendChild(dl);
  }
  const nodeActs = el("div", "conn-acts");
  const set = btn(t("conn.nodeSettings"));
  set.addEventListener("click", () => g.openNodeSettings());
  nodeActs.appendChild(set);
  if (g.chooseNode) {
    const choose = btn(t("nodes.choose"));
    choose.dataset.act = "choose-node";
    choose.addEventListener("click", () => g.chooseNode!());
    nodeActs.appendChild(choose);
  }
  node.appendChild(nodeActs);
  host.appendChild(node);

  // R1 · the rooms, asked of the node with this session's access
  if (s.node && g.listRooms) {
    const rooms = el("div", "conn-sect");
    rooms.dataset.sect = "rooms";
    rooms.appendChild(el("h5", "", t("rooms.head")));
    const body = el("div", "conn-rooms-body");
    body.appendChild(el("p", "conn-line conn-dim", t("rooms.loading")));
    rooms.appendChild(body);
    const acts = el("div", "conn-acts");
    if (g.newRoom) {
      const nw = btn(t("rooms.new"));
      nw.dataset.act = "new-room";
      nw.addEventListener("click", () => g.newRoom!());
      acts.appendChild(nw);
    }
    if (g.bringIntoRoom) {
      const br = btn(t("rooms.bring"));
      br.dataset.act = "bring-into-room";
      br.title = t("rooms.bringTitle");
      br.addEventListener("click", () => g.bringIntoRoom!());
      acts.appendChild(br);
    }
    rooms.appendChild(acts);
    host.appendChild(rooms);
    void g.listRooms().then(
      (list) => renderRoomList(body, list, s.room, (id) => g.joinRoom?.(id)),
      (error) => {
        body.textContent = "";
        body.appendChild(el("p", "conn-line conn-err", t("rooms.cannotList", { why: (error as Error).message })));
      });
  }
}

// ── the room's settings (K2) ─────────────────────────────────────────────────

export interface RoomPanelHooks {
  api: NodeApi;
  roomId: string;
  /** the ORCID of this session, to say «you» on its own row */
  me: string | null;
  openOnNode(): void;
  leaveRoom(): void;
  copy(text: string): void;
}

/** Render the room panel: «yours» → members, roles, remove, invite by ORCID or
 *  link, «Open on the node»; «of <owner>» → owner, your role, leave. */
export async function renderRoomPanel(host: HTMLElement, h: RoomPanelHooks): Promise<void> {
  host.textContent = "";
  host.className = "conn-panel conn-room";
  host.appendChild(el("p", "conn-line conn-dim", t("room.loading")));
  let info: RoomInfo;
  try {
    info = await h.api.room(h.roomId);
  } catch (error) {
    host.textContent = "";
    host.appendChild(el("p", "conn-line conn-err", t("room.cannotRead", { why: (error as Error).message })));
    return;
  }
  const own = ownership(info);
  const manager = info.your_role === "owner" || info.your_role === "admin";
  host.textContent = "";
  host.dataset.mine = String(own.mine);
  host.dataset.role = String(info.your_role ?? "");
  const head = el("h4", "", `${info.title || info.room_id} · ${own.text}`);
  head.dataset.own = own.mine ? "yours" : "theirs";
  host.appendChild(head);
  host.appendChild(el("p", "conn-line", t("room.yourRole", { role: t(`room.role.${info.your_role ?? "none"}`) })));
  if (!own.mine) host.appendChild(el("p", "conn-line", t("room.ownerIs", { owner: info.owner || "?" })));

  const note = el("p", "conn-line conn-note");
  const say = (text: string, bad = false): void => {
    note.textContent = text;
    note.classList.toggle("conn-err", bad);
  };

  if (manager) {
    const list = el("ul", "conn-members");
    const paint = (m: MembersInfo): void => {
      list.textContent = "";
      const rows = [{ orcid: m.owner || info.owner || "", role: "owner" }, ...m.members]
        .filter((r) => r.orcid);
      for (const r of rows) {
        const li = el("li");
        li.dataset.orcid = r.orcid;
        li.appendChild(el("span", "conn-orcid", r.orcid + (r.orcid === h.me ? ` (${t("room.you")})` : "")));
        li.appendChild(el("span", "conn-role", t(`room.role.${r.role}`)));
        if (r.role !== "owner") {
          const x = btn("×", "conn-btn conn-x");
          x.title = t("room.remove", { who: r.orcid });
          x.setAttribute("aria-label", x.title);
          x.addEventListener("click", async () => {
            try { paint(await h.api.removeMember(h.roomId, r.orcid)); say(t("room.removed", { who: r.orcid })); }
            catch (error) { say((error as Error).message, true); }
          });
          li.appendChild(x);
        }
        list.appendChild(li);
      }
      for (const g of m.groups ?? []) {
        const li = el("li", "conn-group");
        li.appendChild(el("span", "conn-orcid", g.name || g.group_id));
        li.appendChild(el("span", "conn-role", t(`room.role.${g.role}`)));
        list.appendChild(li);
      }
    };
    host.appendChild(el("h5", "", t("room.members")));
    host.appendChild(list);
    try { paint(await h.api.members(h.roomId)); }
    catch (error) { say((error as Error).message, true); }

    // invite by ORCID: the role is written into the ACL at once
    const add = el("div", "conn-add");
    const who = el("input", "conn-input");
    who.placeholder = t("room.orcidPlaceholder");
    who.setAttribute("aria-label", t("room.orcidLabel"));
    const role = el("select", "conn-input");
    for (const r of MEMBER_ROLES) role.appendChild(new Option(t(`room.role.${r}`), r));
    role.value = "editor";
    const go = btn(t("room.add"));
    go.addEventListener("click", async () => {
      const orcid = who.value.trim();
      if (!ORCID_RE.test(orcid)) { say(t("room.badOrcid"), true); return; }
      try { paint(await h.api.setMember(h.roomId, orcid, role.value)); who.value = ""; say(t("room.added", { who: orcid })); }
      catch (error) { say((error as Error).message, true); }
    });
    add.append(who, role, go);
    host.appendChild(el("h5", "", t("room.inviteOrcid")));
    host.appendChild(add);

    // or a link: the node keeps a sha256, so the link is shown once
    const link = el("div", "conn-add");
    const lrole = el("select", "conn-input");
    for (const r of LINK_ROLES) lrole.appendChild(new Option(t(`room.role.${r}`), r));
    lrole.value = "editor";
    const mk = btn(t("room.newLink"));
    const out = el("div", "conn-link");
    mk.addEventListener("click", async () => {
      try {
        const made = await h.api.invite(h.roomId, lrole.value);
        const doors = await h.api.door(h.roomId).catch(() => ({ web: null, scheme: null }));
        const door = doors.web || doors.scheme || "";
        let text = made.token ?? "";
        if (door && made.token) {
          const u = new URL(door);
          u.searchParams.set("join", made.token);
          text = u.toString();
        }
        out.textContent = "";
        const code = el("code", "", text);
        const cp = btn(t("room.copy"));
        cp.addEventListener("click", () => h.copy(text));
        out.append(code, cp);
        say(t("room.linkOnce"));
      } catch (error) { say((error as Error).message, true); }
    });
    link.append(lrole, mk);
    host.appendChild(el("h5", "", t("room.inviteLink")));
    host.appendChild(link);
    host.appendChild(out);
  }

  const acts = el("div", "conn-acts");
  if (manager) {
    const on = btn(t("conn.openOnNode"));
    on.title = t("room.openOnNodeHint");
    on.addEventListener("click", () => h.openOnNode());
    acts.appendChild(on);
  } else {
    const leave = btn(t("conn.leaveRoom"));
    leave.addEventListener("click", () => h.leaveRoom());
    acts.appendChild(leave);
  }
  host.appendChild(acts);
  host.appendChild(note);
}
