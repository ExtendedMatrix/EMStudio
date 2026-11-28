/**
 * MICRO-BK2 · THE BUCKET'S DOOR — `POST /v1/rooms/{room}/objects`.
 *
 * stratigraph-server 1.6.0-dev.93 (commit 1e746f0) takes the bytes AND the
 * record that explains them in one request, in the profile EMStudio already
 * wrote (`em-bucket-dtc/1`, {@link bucketRequest}). The server writes the three
 * acts of the register itself (resource, attribution, acquisition), so a
 * deposit is one call instead of five, and an interruption can no longer leave
 * bytes in the store that nothing describes.
 *
 * This module is the pure half of that call — no fetch, no DOM — so that the
 * check can hold every rule without a node:
 *
 *  · {@link depositForm} — the multipart body, the `dtc` part FIRST (the server
 *    refuses the other order: the record is read before the bytes);
 *  · {@link doorFromProbe} — whether a node has the door, read from the answer
 *    to `GET /v1/dtc/profile/em-bucket-dtc/1`, the route the door brought with
 *    it: 200 yes, 404/405 no, anything else «cannot tell»;
 *  · {@link refusalOf} — a refusal of the door as an i18n key and its values,
 *    never a status number: the server's sentences name the field, and this
 *    turns each into the form's own words.
 */

import { BUCKET_DTC_PROFILE } from "./bucket-dtc";

/** The route that comes with the door and costs nothing to ask: the profile. */
export const DOOR_PROFILE_PATH = `/v1/dtc/profile/${BUCKET_DTC_PROFILE}`;

/** The largest deposit the door takes in one piece (the server's own ceiling,
 *  `single_post_limit_bytes` of the profile; this is its value on dev.93, used
 *  when the profile does not say). */
export const DOOR_SINGLE_LIMIT = 64 * 1024 * 1024;

/** The URL of the door for a room. */
export function doorUrl(base: string, room: string): string {
  return `${base.replace(/\/+$/, "")}/v1/rooms/${encodeURIComponent(room)}/objects`;
}

/**
 * The body of one deposit: `dtc` (the record, as text) and THEN `file`.
 * FormData keeps the order of `append`, and the order is the contract.
 */
export function depositForm(
  request: Record<string, unknown>, bytes: BlobPart, name: string, mediaType: string,
): FormData {
  const form = new FormData();
  form.append("dtc", JSON.stringify(request));
  form.append("file", new Blob([bytes], { type: mediaType || "application/octet-stream" }),
              name || "file");
  return form;
}

/**
 * Has this node the door? From the status of the profile's GET:
 * `true` (200), `false` (404 or 405: a server older than dev.93 has no such
 * route), `null` (anything else — a 401, a 5xx, a network failure: the question
 * was not answered, and a fallback chosen on a non-answer would send the bytes
 * through the old door of a node that has the new one).
 */
export function doorFromProbe(status: number | null): boolean | null {
  if (status === 200) return true;
  if (status === 404 || status === 405) return false;
  return null;
}

/** What the door answers when it takes a file. */
export interface DoorDeposit {
  ref: string;
  created?: boolean;
  size?: number;
  media_type?: string;
  home?: string | null;
  acquisition_id?: string | null;
  responsible?: string | null;
  acts?: Record<string, unknown>;
}

/** A refusal in the form's words: an i18n key and its values. */
export interface Refusal { key: string; vars: Record<string, string> }

/**
 * A refusal of the door, translated. The server's `detail` is a sentence that
 * names the field (`app/objects.py`, `_refusal`); each is recognised by the
 * field it names, so a rewording of the prose does not change the meaning. A
 * sentence this does not know is shown as the node's own words under a heading
 * that says the node refused — still never a bare number.
 */
export function refusalOf(status: number, detail: string, responsible?: string): Refusal {
  const d = detail || "";
  if (status === 403) return { key: "assets.door.notEditor", vars: {} };
  if (status === 413) return { key: "assets.door.tooBig", vars: {} };
  if (status === 401) return { key: "assets.door.signIn", vars: {} };
  if (/not accredited/i.test(d)) {
    return { key: "assets.door.notAccredited",
             vars: { orcid: (d.match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/)?.[0]) ?? responsible ?? "" } };
  }
  if (/rights\.license/.test(d)) return { key: "assets.needsLicense", vars: {} };
  if (/source\.dtc_kind/.test(d)) return { key: "bucket.kindUnknown", vars: {} };
  if (/a download says where from/.test(d)) return { key: "bucket.downloadNeedsSource", vars: {} };
  if (/source\.retrieved_from/.test(d)) return { key: "bucket.sourceNotUri", vars: {} };
  if (/when\.made_at/.test(d) && /capture/i.test(d)) return { key: "bucket.captureNeedsDate", vars: {} };
  if (/when\.made_at|embargo_until/.test(d)) return { key: "bucket.dateBad", vars: {} };
  if (/technique and a software/.test(d)) return { key: "assets.door.noTechniqueOnRetrieval", vars: {} };
  if (/the bytes that arrived are/.test(d)) return { key: "assets.door.bytesChanged", vars: {} };
  if (/target\.room/.test(d)) return { key: "assets.door.otherRoom", vars: {} };
  return { key: "assets.door.refused", vars: { detail: d.slice(0, 200) } };
}

/** The `detail` of an error answer, whatever shape it came in. */
export function detailOf(body: string): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed?.detail === "string") return parsed.detail;
    if (parsed?.detail !== undefined) return JSON.stringify(parsed.detail);
  } catch { /* not JSON: the text is the detail */ }
  return body;
}

// ── MICRO-BK4 · THE STAMP BOUND TO ITS OBJECT ────────────────────────────────
//
// stratigraph-server 1.6.0-dev.95 (commit 6b65f5d) takes an already-emitted
// `.stamp.json` at `POST /v1/rooms/{room}/objects/{sha}/stamp`, keeps it as an
// object of its own and writes the link (`data.dtc_stamp`), so that
// `GET …/objects/{sha}/dtc` answers with `stamp_ref`. Until dev.94 the stamp
// went in as a loose `PUT …/asset` that nothing tied to the file it speaks for.

/** The route that binds a stamp to the object `digest` (with or without the
 *  `sha256:` prefix) in a room. */
export function stampUrl(base: string, room: string, digest: string): string {
  const hex = String(digest || "").replace(/^sha256:/, "");
  return `${doorUrl(base, room)}/${encodeURIComponent(hex)}/stamp`;
}

/** The route that reads one object's story back, `stamp_ref` included. */
export function storyUrl(base: string, room: string, digest: string): string {
  const hex = String(digest || "").replace(/^sha256:/, "");
  return `${doorUrl(base, room)}/${encodeURIComponent(hex)}/dtc`;
}

/**
 * Does a failed answer of the stamp route mean «this node has no such route»?
 * 405, or a 404 that is not the route's own 404. The route answers 404 itself
 * when the node does not hold the object («this node holds no sha256:…: a stamp
 * speaks for an object, so the object comes first»): that is a refusal about
 * THIS file, and taking it for an older server would send the stamp loose
 * through the deprecated PUT of a node that can bind it.
 */
export function stampRouteMissing(status: number, detail: string): boolean {
  if (status === 405) return true;
  if (status !== 404) return false;
  return !/holds no/i.test(detail || "");
}

/** What the stamp route answers when it binds. */
export interface StampBound {
  ref: string;
  stamp_ref: string;
  created?: boolean;
  bound?: boolean;
}

/** A stamp ref out of a 409's sentence («… already has a stamp (sha256:…) and
 *  this is another one …»): the stamp that already speaks for the object. */
export function stampAlreadyBound(detail: string): string | null {
  return (detail || "").match(/already has a stamp \((sha256:[0-9a-f]{64})\)/i)?.[1] ?? null;
}

/**
 * The read-back, judged: the story's `stamp_ref` against the stamp the route
 * said it bound. `bound` — the same; `other` — the story names a different
 * stamp; `none` — the story names no stamp at all (a register that did not
 * keep the link). Compared without the prefix and without case.
 */
export function stampReadBack(expected: string, storyRef: unknown): "bound" | "other" | "none" {
  if (typeof storyRef !== "string" || !storyRef) return "none";
  const norm = (s: string) => s.replace(/^sha256:/, "").toLowerCase();
  return norm(storyRef) === norm(expected) ? "bound" : "other";
}
