/**
 * MICRO-STORE-PERCORSO · where the bytes of a room's resource are, whatever
 * host wrote its `url`.
 *
 * Measured in `tavolo-2026-10-12` (13 ott 2026): the resident resources carry
 * the host of the client that wrote them — `http://localhost:8000/v1/rooms/…`,
 * `https://em.localhost:8443/em/v1/rooms/…`, `http://<mac>.local:8000/v1/rooms/…`
 * — and one checksum has no `sha256:` prefix. A URL on a host that is not the
 * one EMStudio is connected to went unsigned (401) or nowhere. Here, in one
 * place, used by the scene, the Doc's viewer and the Storage:
 *
 *  - a digest is `sha256:` + lowercase hex (`normDigest`);
 *  - in a room, a resource WITH a checksum is read from the room's store,
 *    `<store>/sha256:<hex>`; its written `url` counts only when there is no
 *    checksum or the resource is a reference (`storeAddress`);
 *  - a URL `…/v1/rooms/<this room>/asset(-home)/<digest>` is the node's on
 *    ANY host, and is rewritten on the current base (`rebaseRoomUrl`).
 *
 * Pure: `main.ts` passes the base (`assetStoreBase()`) and the room.
 */

/** `sha256:<hex>` (lowercase), from a digest with or without the prefix; null
 *  when it is not a sha256. */
export function normDigest(d: string | null | undefined): string | null {
  const s = String(d ?? "").trim().toLowerCase();
  if (!s) return null;
  const hex = s.replace(/^sha256(:|%3a)/, "");
  return /^[0-9a-f]{64}$/.test(hex) ? `sha256:${hex}` : null;
}

/** The store URL of a digest: `<base>sha256:<hex>` (the hex needs no escaping,
 *  the colon is legal in a path — the form EMtools writes). */
export function storeUrlOf(base: string, digest: string): string {
  const d = normDigest(digest);
  return `${base}${d ?? encodeURIComponent(digest)}`;
}

const ROOM_URL = /^[a-z][a-z0-9+.-]*:\/\/[^/]+(?:\/[^?#]*?)?\/v1\/rooms\/([^/?#]+)\/(asset|asset-home)\/([^?#]*)([?#].*)?$/i;

/** Is this URL `…/v1/rooms/<room>/asset(-home)/…` of THIS room, any host? */
export function isRoomUrl(url: string | null | undefined, room: string | null | undefined): boolean {
  if (!url || !room) return false;
  const m = ROOM_URL.exec(url.trim());
  if (!m) return false;
  let r: string;
  try { r = decodeURIComponent(m[1]); } catch { r = m[1]; }
  return r === room;
}

/**
 * A URL of this room's store written by any host → the same path on the
 * current base (`base` = `…/v1/rooms/<room>/asset/`). Its digest is normalized
 * when it is one. Anything else (another room, a web locator) is returned as
 * it is.
 */
export function rebaseRoomUrl(url: string, base: string | null | undefined, room: string | null | undefined): string {
  if (!base || !isRoomUrl(url, room)) return url;
  const m = ROOM_URL.exec(url.trim())!;
  const kind = m[2].toLowerCase();
  let ref = m[3];
  try { ref = normDigest(decodeURIComponent(ref)) ?? ref; } catch { /* as written */ }
  const tail = m[4] ?? "";
  if (kind === "asset") return `${base}${ref}${tail}`;
  // asset-home: the room's root is the base without its `asset/`
  const root = /\/asset\/$/.test(base) ? base.replace(/asset\/$/, "") : null;
  return root ? `${root}asset-home/${ref}${tail}` : url;
}

/** A remote locator (a web URI, not `file:`). */
const isRemote = (url: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^file:/i.test(url);

/**
 * Where a resource's bytes are read. In a room (`base` set): a resource with a
 * checksum that is not a reference → the room's store by its digest; else its
 * url, rebased when it is this room's store on another host. Offline (`base`
 * null): the url as written.
 */
export function storeAddress(
  res: { url?: unknown; checksum?: unknown; residency?: unknown } | null | undefined,
  base: string | null | undefined,
  room: string | null | undefined,
): string | null {
  if (!res) return null;
  const url = typeof res.url === "string" ? res.url.trim() : "";
  if (!base) return url || null;
  const residency = typeof res.residency === "string" ? res.residency.trim() : "";
  // as `space.ts recordedState` reads it: a residency other than resident is a
  // reference; none recorded, a remote url is one unless it is this room's store
  const reference = residency ? residency !== "resident"
    : !!url && isRemote(url) && !isRoomUrl(url, room);
  const digest = normDigest(typeof res.checksum === "string" ? res.checksum : null);
  if (digest && !reference) return storeUrlOf(base, digest);
  return url ? rebaseRoomUrl(url, base, room) : null;
}
