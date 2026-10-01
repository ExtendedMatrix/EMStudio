// dev27 · SEVERAL ADDRESSES FOR ONE RESOURCE — the TS twin of s3Dgraphy
// `resources/addresses.py` (E.D. 2026-10-01, «il testo, la risorsa e la
// selezione»), with the same names and the same refusals.
//
// The same bytes — the same digest — are ONE resource with several addresses
// (the same PDF on the disk, on MinIO, on Zenodo): if an address dies, the
// resource stays. Another manifestation is a sister resource, not an address.
//
//   data.addresses = [{locator, residency?, checked_at?, ok?}]
//
// Address 0 is `data.url` — what a consumer that knows only `url` keeps reading —
// and the list is written only when there is a second address or a check, so a
// resource of one address looks as it always did. `ok` true = reachable at
// `checked_at`, false = dead (a warning while a live one remains; never removed
// by a check), absent = never checked.
//
// PURE: it reads and writes the node's `data` through the store; the checking
// itself (a fetch, the bridge's /fs/checksum) is the caller's.

import type { DocumentStore } from "./model";
import type { EmNode } from "./types";

export const ADDRESSES_KEY = "addresses";
export const RESIDENCIES = ["reference", "resident"] as const;

export interface Address {
  locator: string;
  residency?: string;
  checked_at?: string;
  ok?: boolean;
  /** derived: this is `data.url` */
  primary: boolean;
}

export class AddressError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

const dataOf = (n: EmNode | undefined): Record<string, unknown> =>
  ((n?.data ?? {}) as Record<string, unknown>);

const digestOf = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.includes(":") ? s : `sha256:${s}`;
};

/** Every address of a resource, `data.url` first. */
export function addresses(n: EmNode | undefined): Address[] {
  const d = dataOf(n);
  const listed = (Array.isArray(d[ADDRESSES_KEY]) ? d[ADDRESSES_KEY] as Array<Record<string, unknown>> : [])
    .filter((a) => a && typeof a.locator === "string" && a.locator)
    .map((a) => ({ ...a })) as Array<Record<string, unknown>>;
  const url = typeof d.url === "string" ? d.url : "";
  if (url && !listed.some((a) => a.locator === url))
    listed.unshift({ locator: url, ...(d.residency ? { residency: d.residency } : {}) });
  return listed.map((a, i) => ({
    locator: String(a.locator),
    ...(a.residency ? { residency: String(a.residency) } : {}),
    ...(a.checked_at ? { checked_at: String(a.checked_at) } : {}),
    ...(typeof a.ok === "boolean" ? { ok: a.ok } : {}),
    primary: url ? a.locator === url : i === 0,
  }));
}

/** The addresses not marked dead (reachable, or never checked). */
export const liveAddresses = (n: EmNode | undefined): Address[] =>
  addresses(n).filter((a) => a.ok !== false);

function written(n: EmNode, list: Address[]): Record<string, unknown> {
  const d = { ...dataOf(n) };
  const url = typeof d.url === "string" ? d.url : "";
  const sorted = [...list].sort((a, b) => Number(b.locator === url) - Number(a.locator === url));
  const clean = sorted.map(({ primary: _p, ...rest }) => rest);
  if (clean.length <= 1 && !clean.some((a) => "ok" in a || "checked_at" in a)) delete d[ADDRESSES_KEY];
  else d[ADDRESSES_KEY] = clean;
  return d;
}

/**
 * Add a copy of the SAME bytes at another address (`api.add_address`).
 * `checksum` is the digest found there and must be the resource's own: another
 * digest is a sister resource, and a resource with no digest cannot say two
 * places hold the same bytes — both refused (AddressError), nothing written.
 */
export function addAddress(store: DocumentStore, id: string, locator: string,
                           opts: { checksum?: string | null; residency?: string } = {}): Address[] {
  const n = store.node(id);
  if (!n || n.node_type !== "resource") throw new AddressError("node", `${id} is not a resource`);
  const loc = (locator ?? "").trim();
  if (!loc) throw new AddressError("locator", "an address needs a locator");
  if (opts.residency && !(RESIDENCIES as readonly string[]).includes(opts.residency))
    throw new AddressError("residency", `residency must be one of ${RESIDENCIES.join(", ")}`);
  const d = dataOf(n);
  const now = addresses(n);
  if (now.some((a) => a.locator === loc)) return now;
  if (!d.url) {
    store.updateNode(id, { data: { ...d, url: loc, ...(opts.residency && !d.residency ? { residency: opts.residency } : {}) } } as Partial<EmNode>);
    return addresses(store.node(id));
  }
  const own = digestOf(d.checksum);
  if (!own) throw new AddressError("no-digest", `${id} has no digest: nothing says the bytes at ${loc} are the same`);
  const theirs = digestOf(opts.checksum);
  if (!theirs) throw new AddressError("their-digest", `the digest of the bytes at ${loc} is needed`);
  if (theirs !== own) throw new AddressError("sister", `the bytes at ${loc} are not the resource's: another manifestation is a sister resource`);
  const entry: Address = { locator: loc, primary: false, ...(opts.residency ? { residency: opts.residency } : {}) };
  store.updateNode(id, { data: written(n, [...now, entry]) } as Partial<EmNode>);
  return addresses(store.node(id));
}

/** Record whether an address answered, and when (`api.check_address`). The
 *  address stays either way; `warning` says when it is dead, and louder when
 *  no live one is left. */
export function checkAddress(store: DocumentStore, id: string, locator: string, ok: boolean,
                             at: string = new Date().toISOString().replace(/\.\d+Z$/, "Z")):
  { live: number; warning: "dead" | "none-alive" | null } {
  const n = store.node(id);
  if (!n || n.node_type !== "resource") throw new AddressError("node", `${id} is not a resource`);
  const now = addresses(n);
  const entry = now.find((a) => a.locator === locator);
  if (!entry) throw new AddressError("locator", `${id} has no address ${locator}`);
  entry.ok = ok;
  entry.checked_at = at;
  store.updateNode(id, { data: written(n, now) } as Partial<EmNode>);
  const live = liveAddresses(store.node(id)).length;
  return { live, warning: ok ? null : live ? "dead" : "none-alive" };
}

/** The resource of the graph whose digest is `digest`, if any — the question
 *  the Storage asks before it makes a new one. */
export function resourceWithDigest(nodes: EmNode[], digest: string | null | undefined): EmNode | null {
  const want = digestOf(digest);
  if (!want) return null;
  return nodes.find((n) => n.node_type === "resource" && digestOf(dataOf(n).checksum) === want) ?? null;
}

/** How an address is reached: `http` (a page or a store with an http URL),
 *  `disk` (a path the bridge can read), `other` (s3://, blend://… — not checked here). */
export function addressKind(locator: string): "http" | "disk" | "other" {
  if (/^https?:\/\//i.test(locator)) return "http";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(locator)) return "other";
  return "disk";
}

/** dev27 · the Storage's question: the bytes at `locator` are those of
 *  `existing` (found by digest) — is that ANOTHER COPY of it, to propose as an
 *  address, rather than the address it already has? True when the resource
 *  has addresses and `locator` is not one of them. */
export function isAnotherCopy(existing: EmNode | null | undefined, locator: string | null | undefined): boolean {
  if (!existing || !locator) return false;
  const known = addresses(existing).map((a) => a.locator);
  return known.length > 0 && !known.includes(locator);
}
